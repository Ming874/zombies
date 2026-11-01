import { Zombie } from './zombie.js';
import { sfx } from '../audio.js';

// 埋伏 / 天花板掉落:殭屍這一側的狀態、姿勢與行為(以 mixin 掛到 Zombie.prototype;調度與場景物件在 src/zombies/ambush.js)。
//
// 狀態(沿用連線協定 ZSTATES 裡原本沒用到的名稱,不必改協定):
//   'idle'   裝死(LURK):只有「屍體」姿勢(靠牆癱坐/趴地/仰躺,跟假屍體一模一樣),不跑 AI/動畫/LOD,矩陣凍結(幾乎零成本)
//   'spawn'  天花板上(PERCH):舊流程,現在不再使用(天花板掉落改成觸發當下才在夾層裡現身,見 ambush.js)
//   'scream' 衝出(BURST):掩蔽處的埋伏是觸發當下才在「所有玩家都看不到」的位置現身,直接進這個狀態:
//            0.14 秒內起身 → 沿導航場衝出轉角/門口(進入玩家視野)→ 撲向玩家;裝死的屍體則是猛然彈起
//   'fall'   掉落(DROP):觸發當下才在天花板夾層裡現身(看不到)→ 格柵/天花板碎開 → 腳先落下 → 蹲伏落地 → 尖叫起身
// z.amb = { code 姿勢代碼, quiet 安靜甦醒(不放跳嚇), dormant, ceilH 天花板高度, rise, lungeV, t1 落地時間… }
// 連線:房主把 code / quiet 放進快照每筆的旗標位元組(bit1-3 = code、bit4 = quiet),代理殭屍用同一套姿勢函式播放。
export const LURK = 'idle', PERCH = 'spawn', BURST = 'scream', DROP = 'fall';
export const POSE = { slump: 1, lie: 2, crouch: 3, stand: 4, prone: 5, hidden: 6, supine: 7 };
export const isPerch = (c) => c === POSE.prone || c === POSE.hidden;
export const isCorpse = (c) => c === POSE.slump || c === POSE.lie || c === POSE.supine; // 看起來就是屍體的姿勢(被看到也沒關係)
export const isCover = (c) => c === POSE.crouch || c === POSE.stand; // 掩蔽處現身的起始姿勢(只在看不到的地方出現)
const AMB_STATES = new Set([LURK, PERCH, BURST, DROP]);
const BREAK = 0.14; // 天花板碎開到開始掉落
const G = 15; // 掉落的重力(比真實大一點,動作比較俐落)
const LAND = 0.5; // 落地蹲伏
const RISE_D = 0.32; // 落地後起身
const LUNGE_T = 0.42; // 衝出後的撲擊時間

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOut = (u) => { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); };

// 建立 amb 狀態(房主埋伏時、代理殭屍第一次看到埋伏狀態時)
export function makeAmb(z, code, world, opt = {}) {
  const a = {
    code, quiet: !!opt.quiet, dormant: true, spot: opt.spot || null, hp: z.hp, t0: opt.t0 || 0, R: opt.R || 4, fx: opt.fx ?? null,
    ceilH: 3.4, t1: 1, rise: 0.3, lungeV: 4, hit: false, landed: false, frozen: false, nodes: null, buf: null, stare: 0, hurt: false, seed: Math.random() * 10,
  };
  if (isPerch(code)) {
    const c = world && world.ceilAt ? world.ceilAt(z.pos.x, z.pos.z, z.pos.y) - z.pos.y : 3.4;
    a.ceilH = Number.isFinite(c) && c > 2 && c < 4.5 ? c : 3.4;
  }
  a.t1 = BREAK + Math.sqrt((2 * a.ceilH) / G);
  a.rise = code === POSE.lie || code === POSE.supine ? 0.46 : code === POSE.slump ? 0.38 : 0.14; // 掩蔽處的本來就是醒著蹲/站著
  a.lungeT = isCover(code) ? 0.85 : LUNGE_T; // 掩蔽處:要先繞出轉角/門口再撲,撲得久一點(兩端都由姿勢代碼推導)
  a.lungeV = z.type === 'runner' ? 6.8 : z.type === 'crawler' ? 3.6 : 4.6;
  return a;
}

const M = {
  // ---- 房主:Zombie.update 一開始呼叫;回傳 0 = 本幀處理完(休眠中),undefined = 照常更新 ----
  _ambUpdate(dt, ctx) {
    const a = this.amb, S = this.state;
    if (S === LURK || S === PERCH) {
      if (!a.frozen) this._ambFreeze();
      a.dormant = true;
      this.dist = 99; // 對「最近的殭屍」類系統(配樂張力、靈異導演、冷場計時)隱形
      this.los = false;
      if (this.hp < a.hp - 0.01) a.hurt = true; // 被打到:調度器下一拍叫醒
      return 0;
    }
    if (S === BURST || S === DROP) { a.dormant = false; if (a.frozen) this._ambThaw(); return undefined; }
    this._ambEnd(false); // 狀態被別處改掉(換房主等):恢復一般殭屍
    return undefined;
  },

  // ---- 代理殭屍(src/net/zsync.js drive):依房主的狀態/旗標建立或清掉 amb;回傳 0 = 休眠中(不必播動畫) ----
  _ambProxy(dt, ctx) {
    const S = this.state;
    if (!AMB_STATES.has(S)) { if (this.amb) this._ambEnd(false); return undefined; }
    const fl = this._ambFl | 0, code = fl & 7;
    if (code) this._ambLast = code;
    let a = this.amb;
    if (!a) { a = this.amb = makeAmb(this, this._ambLast || (S === PERCH || S === DROP ? POSE.hidden : POSE.lie), ctx.world, { fx: S === LURK || S === PERCH ? S : null }); a.g = ctx.game; }
    if (code && code !== a.code && (S === LURK || S === PERCH)) { a.code = code; if (a.frozen) this._ambThaw(); }
    if (fl & 8) a.quiet = true;
    a.dormant = S === LURK || S === PERCH;
    if (a.dormant) {
      this.dist = 99;
      // 房主把牠搬到別的埋伏點:重新凍結在新位置
      if (a.frozen && (Math.abs(a.fx0 - this.pos.x) + Math.abs(a.fz0 - this.pos.z) > 0.05 || Math.abs(wrapA(a.fh0 - this.heading)) > 0.05)) this._ambThaw();
      if (!a.frozen) { if (isPerch(a.code)) { const c = ctx.world.ceilAt(this.pos.x, this.pos.z, this.pos.y) - this.pos.y; if (c > 2 && c < 4.5) a.ceilH = c; a.t1 = BREAK + Math.sqrt((2 * a.ceilH) / G); } this._ambFreeze(); }
      return 0;
    }
    if (a.frozen) this._ambThaw();
    return undefined;
  },

  // 叫醒(房主):quiet = 不放跳嚇(回合收尾、逾時、玩家硬是貼上來但節奏不允許時)
  _ambWake(quiet = false) {
    const a = this.amb;
    if (!a || !a.dormant) return false;
    a.quiet = !!quiet;
    a.dormant = false;
    a.hit = false; a.landed = false;
    if (a.frozen) this._ambThaw();
    if (a.spot && a.spot.busy === this) { a.spot.busy = null; a.spot.usedT = a.g ? a.g.time : 0; }
    this.go(isPerch(a.code) ? DROP : BURST);
    this.alerted = true; this.spotted = true; // 牠自己會叫,不再補「發現玩家」的叫聲
    this.vel.set(0, 0, 0);
    this._lodAcc = 0;
    this.losT = 0;
    return true;
  },

  // 結束埋伏狀態(醒來變成一般殭屍、死亡、狀態被改掉)
  _ambEnd(dead) {
    const a = this.amb;
    if (!a) return;
    if (a.frozen) this._ambThaw();
    this.root.visible = true;
    if (a.spot && a.spot.busy === this) { a.spot.busy = null; a.spot.usedT = a.g ? a.g.time : 0; }
    this.amb = null;
    this.rootY = 0; this.rootPitch = 0; this.rootRoll = 0;
    this._sx = this.pos.x; this._sy = this.pos.y; this._sz = this.pos.z; this._noProg = 0;
    if (!dead) return;
    // 死在埋伏姿勢:倒法跟著姿勢;天花板上的先放到地上(布娃娃從地上開始),格柵也跟著掉下來
    if (isPerch(a.code) && a.dormant) {
      this._resetPose(); this._ambStatic(POSE.lie, 0); this._applyRoot(); this.root.updateMatrixWorld(true);
      a.g?.ambush?.fx(this, 'drop', a);
    }
    if (a.dormant || (this.state === BURST && this.st < a.rise)) this.deathKind = a.code === POSE.slump ? 'kneel' : a.code === POSE.crouch || a.code === POSE.stand ? 'front' : 'flat';
  },

  // ---- 凍結 / 解凍:休眠時整副骨架只算一次矩陣,之後不再更新(視錐剔除也打開) ----
  _ambFreeze() {
    const a = this.amb;
    this._resetPose();
    this._ambStatic(a.code, this.t);
    this.rootY = 0; this.rootPitch = 0; this.rootRoll = 0; this.tiltF = 0; this.tiltS = 0; this.stepY = 0;
    this._applyRoot();
    const nodes = a.nodes || (a.nodes = []);
    nodes.length = 0;
    this.root.traverse((o) => nodes.push(o));
    for (const o of nodes) { o.matrixAutoUpdate = true; o.updateMatrix(); o.matrixAutoUpdate = false; }
    this.root.updateMatrixWorld(true);
    const m = this.mesh;
    a.cs = m.castShadow;
    m.castShadow = false;
    const bs = m.boundingSphere;
    if (bs) {
      if (!a.bs0) a.bs0 = { r: bs.radius, y: bs.center.y };
      bs.radius = a.bs0.r * 1.8;
      bs.center.y = a.bs0.y + (isPerch(a.code) ? a.ceilH / (this.k || 1) : 0);
      m.frustumCulled = true;
    }
    this.root.visible = a.code !== POSE.hidden;
    a.fx0 = this.pos.x; a.fz0 = this.pos.z; a.fh0 = this.heading;
    a.frozen = true;
  },
  // 凍結中改姿勢(垂下的手晃動、屍體被打到抽搐):重算一次矩陣
  _ambBake() {
    const a = this.amb;
    if (!a || !a.nodes) return;
    for (const o of a.nodes) o.updateMatrix();
    this.root.updateMatrixWorld(true);
  },
  _ambThaw() {
    const a = this.amb;
    if (a.nodes) for (const o of a.nodes) o.matrixAutoUpdate = true;
    const m = this.mesh, bs = m.boundingSphere;
    if (bs && a.bs0) { bs.radius = a.bs0.r; bs.center.y = a.bs0.y; }
    m.frustumCulled = false;
    if (a.cs !== undefined) m.castShadow = a.cs;
    this.root.visible = true;
    a.frozen = false;
  },

  // ======================= 行為(房主) =======================
  _ambThink(dt, ctx, dist, toX, toZ, w) {
    const a = this.amb, T = this.T, S = this.state, st = this.st, p = this.target;
    let dealt = 0;
    const hd = this.dist || 1e-3, face = Math.atan2(toX, toZ);
    if (S === BURST) {
      // 方向:update 已算好 w.x/w.z(看得到又走得到就直衝,否則沿導航場繞出轉角、穿過門口)
      const f2 = Math.atan2(w.x, w.z);
      w.face = f2;
      this.heading += wrapA(f2 - this.heading) * Math.min(1, dt * (a.quiet ? 5 : 14)); // 猛然轉身
      if (a.quiet) { w.speed = st > a.rise ? this.speed * 0.8 : 0; }
      else if (st < a.rise) w.speed = 0;
      else if (st < a.rise + a.lungeT) { // 撲擊
        w.instant = true;
        w.speed = a.lungeV * (1 - 0.45 * (st - a.rise) / a.lungeT);
        if (!a.hit && dist < T.reach + 0.3 && this._canHit(ctx.world)) {
          a.hit = true;
          dealt = Math.round(T.dmg * 1.2);
          p.knock?.((toX / hd) * 3.2, (toZ / hd) * 3.2);
          sfx.bite(p.pos);
        }
      }
      if (st >= a.rise + (a.quiet ? 0.3 : a.lungeT) || (a.hit && st > a.rise + 0.2)) this._ambDone(a.hit);
    } else if (S === DROP) {
      w.speed = 0;
      if (st > a.t1) { w.face = face; this.heading += wrapA(face - this.heading) * Math.min(1, dt * 8); }
      if (this.cross(a.t1) && dist < 0.95 && this._canHit(ctx.world)) { dealt = T.dmg; p.knock?.((toX / hd) * 2.5, (toZ / hd) * 2.5); } // 正好砸在玩家身上
      if (st >= a.t1 + LAND + RISE_D) this._ambDone(false);
    } else this._ambDone(false);
    return dealt;
  },
  _ambDone(hit) {
    this._ambEnd(false);
    this.go('chase');
    this.attackCd = hit ? 0.9 : 0;
    this.specialCd = Math.max(this.specialCd, 1.4);
  },

  // ======================= 動畫(房主與代理共用) =======================
  _ambPose(dt, ctx, dist, toX, toZ) {
    const a = this.amb, S = this.state;
    if (!a) { this['_pose_' + this.type](dt, ctx, dist, toX, toZ); return; }
    // 狀態切換的特效(衝出:尖叫/刺擊/鏡頭;掉落:碎片/塵土)、落地(悶響/震動):兩端各自依狀態時間觸發
    if (a.fx !== S) { a.fx = S; if (S === BURST || S === DROP) ctx.game?.ambush?.fx(this, S === BURST ? 'burst' : 'drop', a); }
    if (S === DROP && !a.landed && this.st >= a.t1) { a.landed = true; ctx.game?.ambush?.fx(this, 'land', a); }
    if (S === BURST && !a.out && !a.quiet && this.st >= a.rise + 0.08) { a.out = true; ctx.game?.ambush?.fx(this, 'out', a); } // 衝出掩蔽的瞬間:鏡頭
    if (S === LURK || S === PERCH) { this._ambStatic(a.code, this.t); return; }
    if (S === BURST) { this._ambBurst(dt, ctx, dist, toX, toZ, a); return; }
    if (S === DROP) { this._ambDrop(dt, ctx, dist, toX, toZ, a); return; }
    this['_pose_' + this.type](dt, ctx, dist, toX, toZ);
  },

  // 記下目前姿勢(混合用)
  _ambSnap(a) {
    const L = this.boneList, n = L.length, buf = a.buf || (a.buf = new Float32Array(n * 6));
    for (let i = 0; i < n; i++) { const r = L[i].rotation, p = L[i].position, k = i * 6; buf[k] = r.x; buf[k + 1] = r.y; buf[k + 2] = r.z; buf[k + 3] = p.x; buf[k + 4] = p.y; buf[k + 5] = p.z; }
    a.rY = this.rootY;
    return buf;
  },
  // 從記下的姿勢混到目前姿勢(k = 0 → 記下的、1 → 目前的)
  _ambMix(a, k) {
    const L = this.boneList, buf = a.buf;
    for (let i = 0; i < L.length; i++) {
      const r = L[i].rotation, p = L[i].position, j = i * 6;
      r.set(lerp(buf[j], r.x, k), lerp(buf[j + 1], r.y, k), lerp(buf[j + 2], r.z, k));
      p.set(lerp(buf[j + 3], p.x, k), lerp(buf[j + 4], p.y, k), lerp(buf[j + 5], p.z, k));
    }
    this.rootY = lerp(a.rY, this.rootY, k);
  },

  // 衝出:屍體姿勢 → 一般姿勢(前段極快,像被線扯起來),撲擊時雙手前伸、嘴張開
  _ambBurst(dt, ctx, dist, toX, toZ, a) {
    const st = this.st, k = easeOut(st / a.rise);
    if (k < 1) { this._ambStatic(a.code, this.t); this._ambSnap(a); this._resetPose(); }
    this['_pose_' + this.type](dt, ctx, dist, toX, toZ);
    if (!a.quiet && this.type !== 'crawler' && st > a.rise * 0.45) {
      const u = clamp((st - a.rise * 0.45) / 0.18, 0, 1) * (1 - clamp((st - a.rise - a.lungeT + 0.1) / 0.2, 0, 1));
      const b = this.b;
      for (let i = 0; i < 2; i++) {
        const s = i ? -1 : 1, L = i ? 'R' : 'L', ua = b['upperArm' + L].rotation;
        ua.x = lerp(ua.x, -1.62 + Math.sin(this.t * 23 + i) * 0.08, u); ua.z = lerp(ua.z, s * 0.28, u);
        b['forearm' + L].rotation.x = lerp(b['forearm' + L].rotation.x, -0.25, u);
        b['hand' + L].rotation.x = lerp(b['hand' + L].rotation.x, -0.35, u);
      }
      b.spine.rotation.x += 0.32 * u; b.chest.rotation.x += 0.12 * u; b.head.rotation.x -= 0.3 * u;
      b.jaw.rotation.x = Math.max(b.jaw.rotation.x, 0.85 * u);
    }
    if (k < 1) this._ambMix(a, k);
    this.rootPitch = 0; this.rootRoll = 0;
  },

  // 天花板掉落:碎開(還在夾層)→ 下落(收腿、舉手)→ 落地蹲伏 → 起身
  _ambDrop(dt, ctx, dist, toX, toZ, a) {
    const st = this.st, b = this.b, crawl = this.type === 'crawler';
    this.rootPitch = 0; this.rootRoll = 0;
    a.hidden = st < BREAK; // 還在夾層裡(打不到、看不到)
    if (st < BREAK) { this._ambStatic(a.code, this.t); this.rootRoll = Math.sin(this.t * 61) * 0.02; this.root.visible = a.code !== POSE.hidden; return; }
    this.root.visible = true;
    if (st < a.t1) { // 下落
      const tau = st - BREAK;
      this.rootY = Math.max(0, a.ceilH - 0.5 * G * tau * tau);
      if (crawl) { this['_pose_' + this.type](dt, ctx, dist, toX, toZ); b.spine.rotation.x -= 0.3; return; }
      this._ambFallPose(clamp(tau / 0.25, 0, 1));
      return;
    }
    this.rootY = 0;
    const lt = st - a.t1;
    if (crawl) { this['_pose_' + this.type](dt, ctx, dist, toX, toZ); if (lt < 0.2) b.spine.rotation.x -= 0.3 * (1 - lt / 0.2); return; }
    if (lt < LAND) { this._ambLandPose(lt); return; }
    const k = easeOut((lt - LAND) / RISE_D);
    if (k < 1) { this._ambLandPose(LAND); this._ambSnap(a); this._resetPose(); }
    this['_pose_' + this.type](dt, ctx, dist, toX, toZ);
    if (k < 1) this._ambMix(a, k);
  },
  _ambFallPose(u) {
    const b = this.b;
    this._ambLegs(-0.9 * u - 0.1, 1.5 * u + 0.15, 0, 0.14);
    b.hips.position.y = this.hipY;
    b.spine.rotation.x = 0.15 + 0.15 * u; b.chest.rotation.x = 0.1;
    b.neck.rotation.x = -0.1; b.head.rotation.x = -0.35 * u;
    for (let i = 0; i < 2; i++) this._arm(i ? 'R' : 'L', i ? -1 : 1, lerp(-0.4, -2.55, u), 0.5, 0.45, 0.2);
    b.jaw.rotation.x = 0.7;
  },
  // 落地蹲伏:落地瞬間壓得最低,一隻手撐地,抬頭看人
  _ambLandPose(lt) {
    const b = this.b, sq = Math.exp(-lt * 9) * 0.35;
    const hx = 0.35 + sq * 0.4;
    this._ambLegs(-1.75 - sq * 0.25, 2.15 + sq * 0.3, hx, 0.18);
    b.spine.rotation.set(0.55 + sq, 0, 0.05);
    b.chest.rotation.x = 0.25;
    b.neck.rotation.x = -0.35; b.head.rotation.x = -0.55;
    this._arm('L', 1, -0.95 - sq * 0.4, 0.3, 0.15, -0.6);
    this._arm('R', -1, -0.35, 0.75, 0.7, 0.2);
    b.jaw.rotation.x = 0.55 + 0.3 * Math.min(1, lt * 4);
  },

  // 腿:hx = 骨盆前傾、th/kn = 大腿/小腿相對角度;骨盆高度讓腳掌剛好貼地
  _ambLegs(th, kn, hx, wide = 0.1, foot = null) {
    const b = this.b;
    b.hips.rotation.x = hx;
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, L = i ? 'R' : 'L';
      b['thigh' + L].rotation.set(th, s * 0.08, s * wide);
      b['shin' + L].rotation.x = kn;
      b['foot' + L].rotation.x = foot ?? -(hx + th + kn) * 0.9;
    }
    const a1 = hx + th, a2 = a1 + kn;
    b.hips.position.y = Math.max(0.12, this.legT * Math.cos(a1) + this.legS * Math.cos(a2) + 0.1 * (this.V?.P?.s || 1));
  },

  // ======================= 靜態姿勢 =======================
  // 「屍體」姿勢:靠牆癱坐 / 趴地 / 仰躺 / 蹲伏 / 面壁站立;天花板:趴在夾層裡(破洞垂下一隻手)
  _ambStatic(code, t = 0) {
    const b = this.b, s0 = this.V?.P?.s || 1, sd = this.limpSide || 1, crawl = this.type === 'crawler';
    this.rootY = 0; this.rootPitch = 0; this.rootRoll = 0;
    if (crawl && code !== POSE.prone && code !== POSE.hidden) code = POSE.lie;
    switch (code) {
      case POSE.slump: { // 靠牆角癱坐:腿伸直外八、上身往後靠、頭垂向一側、手垂在地上
        b.hips.position.set(0, 0.15 * s0, -0.05);
        b.hips.rotation.set(-0.3, 0, sd * 0.05);
        for (let i = 0; i < 2; i++) {
          const s = i ? -1 : 1, L = i ? 'R' : 'L';
          b['thigh' + L].rotation.set(-1.32 + (i ? 0.12 : 0), s * 0.32, s * 0.16);
          b['shin' + L].rotation.x = i ? 0.55 : 0.18;
          b['foot' + L].rotation.set(-0.15, 0, 0);
        }
        b.spine.rotation.set(0.08, 0, sd * 0.1);
        b.chest.rotation.set(0.32, 0, sd * 0.06);
        b.neck.rotation.set(0.5, sd * 0.2, 0);
        b.head.rotation.set(0.32, sd * 0.25, sd * 0.42);
        this._arm(sd > 0 ? 'L' : 'R', sd, -0.15, 0.28, 0.35, 0.3); // 垂在地上
        this._arm(sd > 0 ? 'R' : 'L', -sd, -0.75, -0.05, 1.15, 0.4); // 搭在大腿上
        b.jaw.rotation.x = 0.38;
        break;
      }
      case POSE.lie: { // 趴地:臉側貼地、一手往前伸、腿伸直
        b.hips.position.set(0, 0.15 * s0, -0.12 * s0);
        b.hips.rotation.set(Math.PI / 2 - 0.04, 0, sd * 0.07);
        for (let i = 0; i < 2; i++) {
          const s = i ? -1 : 1, L = i ? 'R' : 'L';
          b['thigh' + L].rotation.set(i ? 0.12 : -0.04, s * 0.1, s * 0.09);
          b['shin' + L].rotation.x = i ? 0.42 : 0.08;
          b['foot' + L].rotation.x = 1.05;
        }
        b.spine.rotation.set(-0.02, 0, 0); b.chest.rotation.set(-0.04, 0, sd * 0.05);
        b.neck.rotation.set(-0.35, sd * 0.6, 0); b.head.rotation.set(-0.25, sd * 0.75, 0);
        this._arm(sd > 0 ? 'L' : 'R', sd, -2.75, 0.32, 0.25, -0.15);
        this._arm(sd > 0 ? 'R' : 'L', -sd, 0.05, 0.18, 0.2, 0.1);
        b.jaw.rotation.x = 0.3;
        break;
      }
      case POSE.supine: { // 仰躺:頭轉向一側、一手攤開一手搭在胸口、嘴張著
        b.hips.position.set(0, 0.14 * s0, 0.1 * s0);
        b.hips.rotation.set(-(Math.PI / 2 - 0.05), 0, sd * 0.05);
        for (let i = 0; i < 2; i++) {
          const s = i ? -1 : 1, L = i ? 'R' : 'L';
          b['thigh' + L].rotation.set(i ? -0.1 : 0.02, s * 0.35, s * 0.12);
          b['shin' + L].rotation.x = i ? 0.35 : 0.05;
          b['foot' + L].rotation.set(-0.6, s * 0.3, 0);
        }
        b.spine.rotation.set(0, 0, 0); b.chest.rotation.set(0.04, 0, 0);
        b.neck.rotation.set(0.15, sd * 0.4, 0); b.head.rotation.set(0.05, sd * 0.8, 0);
        this._arm('L', 1, sd > 0 ? 0.05 : -0.55, sd > 0 ? 1.05 : -0.25, sd > 0 ? 0.35 : 1.7, 0.2);
        this._arm('R', -1, sd > 0 ? -0.55 : 0.05, sd > 0 ? -0.25 : 1.05, sd > 0 ? 1.7 : 0.35, 0.2);
        b.jaw.rotation.x = 0.5;
        break;
      }
      case POSE.crouch: { // 蹲伏、駝背、頭垂到膝間、雙手垂地
        this._ambLegs(-1.72, 2.1, 0.32, 0.2);
        b.spine.rotation.set(0.55, 0, sd * 0.05); b.chest.rotation.set(0.35, 0, 0);
        b.neck.rotation.set(0.35, 0, 0); b.head.rotation.set(0.3, sd * 0.15, sd * 0.12);
        this._arm('L', 1, -0.5, 0.12, 0.45, 0.35);
        this._arm('R', -1, -0.42, 0.14, 0.5, 0.35);
        b.jaw.rotation.x = 0.2;
        break;
      }
      case POSE.stand: { // 面壁站立:低頭、雙手垂著、微微駝背(像在等)
        b.hips.position.y = this.hipY - 0.015;
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1, L = i ? 'R' : 'L'; b['thigh' + L].rotation.set(-0.03, s * 0.06, s * 0.04); b['shin' + L].rotation.x = 0.06; b['foot' + L].rotation.x = -0.03; }
        b.spine.rotation.set(0.14, 0, sd * 0.03); b.chest.rotation.set(0.1, 0, 0);
        b.neck.rotation.set(0.42, 0, 0); b.head.rotation.set(0.4, 0, (this.tilt || 0.1) + sd * 0.12);
        this._arm('L', 1, 0.06, 0.07, 0.12, 0.1);
        this._arm('R', -1, 0.04, 0.06, 0.18, 0.1);
        b.jaw.rotation.x = 0.15;
        break;
      }
      case POSE.prone: case POSE.hidden: { // 趴在天花板夾層裡:肩膀在破洞上方,一隻手垂下來(慢慢晃)
        const k = this.k || 1, a = this.amb;
        const h = (a ? a.ceilH : 3.4) + 0.17;
        b.hips.position.set(0, h / k, -0.5 * s0);
        b.hips.rotation.set(Math.PI / 2 - 0.02, 0, 0);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1, L = i ? 'R' : 'L'; b['thigh' + L].rotation.set(0.05, 0, s * 0.08); b['shin' + L].rotation.x = 0.2; b['foot' + L].rotation.x = 1.0; }
        b.spine.rotation.set(0, 0, 0); b.chest.rotation.set(0, 0, 0);
        b.neck.rotation.set(0.15, 0, 0); b.head.rotation.set(0.35, sd * 0.2, 0);
        const sw = Math.sin(t * 0.9 + (a ? a.seed : 0)) * 0.12, sw2 = Math.sin(t * 1.7) * 0.05;
        this._arm(sd > 0 ? 'L' : 'R', sd, -1.5 + sw, 0.06 + sw2, 0.3 + sw * 0.5, 0.45);
        this._arm(sd > 0 ? 'R' : 'L', -sd, -0.2, 0.25, 0.9, 0.2);
        b.jaw.rotation.x = 0.45;
        break;
      }
      default:
    }
  },
};

Object.assign(Zombie.prototype, M);
