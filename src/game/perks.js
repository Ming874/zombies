import * as THREE from 'three';
import { sfx } from '../audio.js';
import { settings } from '../ui/settings.js';
import { F } from '../net/protocol.js';

// 職業、無敵與裝備能力(以 mixin 掛到 Game 上;resetRun 呼叫 initPerks,updateGameplay 每幀呼叫 updatePerks)
// - 無敵:player.god(控制面板 /godmod)或 player.invulnT 秒數(撲臉、閃身鞋、針筒);combat.damagePlayer 檢查 invuln()
// - 背後撲臉:狂奔者從玩家背後飛撲命中 → 轉頭、牠的臉貼在眼前、尖嘯;不扣血,換成 10 秒無敵;20 秒內不會再撲臉
// - 職業(主選單選,存在 settings.cls;單人與合作有效,對戰不套用):
//   警察 電擊槍 [X]:打中前方的殭屍,連鎖到附近的(最多 10 隻),每隻電暈 10 秒(巨屍也是);用過要等 2 波才充好
//   醫療兵 受傷 3 秒後自然回血;開局 3 個醫療包 + 4 支綠色針筒(倒下時自動打一針,回到 75% 生命);
//          隊上有醫療兵時,合作模式倒地可以撐 90 秒(net/coop.js)
// - 閃身鞋(金水商行裝備,永久持有):3 隻以上殭屍同時圍著你打 → 25 秒內選 [Y] 傳回金水商行,或 [N] 留下來拿 10 秒無敵;用過冷卻 2 波
export const CLASSES = {
  none: { name: '平民', short: '沒有職業能力', sub: '沒有職業能力' },
  police: { name: '警察', short: '[X] 電擊槍 · 連鎖電暈 10 隻', sub: '電擊槍 [X]：打中前方的殭屍並連鎖最多 10 隻，全部電暈 10 秒；用過要等 2 波才充好' },
  medic: { name: '醫療兵', short: '自然回血 · 4 支救命針筒', sub: '受傷後慢慢自然回血；開局 3 個醫療包、4 支綠色針筒（倒下自動打一針，回到 75% 生命）；隊上有醫療兵，倒地可撐 90 秒' },
};
export const CLASS_ORDER = ['none', 'police', 'medic'];
export const classPref = () => (CLASSES[settings.get('cls')] ? settings.get('cls') : 'none');

const SCARE = { invuln: 10, cd: 20, behind: -0.3, turn: 0.14, face: 0.62 };
export const TASER = { range: 16, cone: 0.34, hop: 7, max: 10, stun: 10, rounds: 2 };
const MEDIC = { delay: 3, rate: 1.2, syringes: 4, medkits: 3, revive: 0.75 };
export const BLINK = { crowd: 3, near: 2.2, hold: 0.35, window: 25, invuln: 10, rounds: 2 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

// 殭屍胸口(電擊的落點)
function chest(z, out) {
  return out.set(z.pos.x, z.pos.y + (z.type === 'crawler' ? 0.35 : (z.headH || 1.6) * 0.68), z.pos.z);
}

// ---------- 電弧(折線,每幀重新抖動;共用一個材質 = 預熱過的 LineBasicMaterial 變體,不會現場編 shader) ----------
const ARC_N = 12;
let arcMat = null;
function arcLine() {
  arcMat ||= new THREE.LineBasicMaterial({ color: 0xc4ecff, transparent: true, opacity: 1, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
  const l = new THREE.Line(g, arcMat);
  l.frustumCulled = false;
  l.renderOrder = 5;
  return l;
}

export const perkMethods = {
  // ---------- 無敵 ----------
  invuln(p = this.player) { return !!(p && (p.god || p.invulnT > 0)); },
  grantInvuln(sec) { const p = this.player; p.invulnT = Math.max(p.invulnT || 0, sec); },
  setGod(on) { this.player.god = !!on; this.updatePerkHud(true); },

  // ---------- 開局(resetRun) ----------
  initPerks() {
    const p = this.player;
    p.god = false;
    p.invulnT = 0;
    p.syringes = 0;
    p.blink = false; // 閃身鞋(商店購買後永久持有)
    p.cls = this.net?.pvp ? 'none' : classPref();
    this.spawnStopped = false; // 控制面板 /stop spawn
    this.taserRound = 1; // 電擊槍:這一波(含)以後可以用
    this.blinkRound = 0; // 閃身鞋:這一波(含)以後可以觸發
    this._ask = null;
    this._crowdT = 0;
    this._scareCd = 0;
    this._scareCdR = null;
    this._scareCam = null;
    for (const a of this._arcs || []) a.line.visible = false;
    if (p.cls === 'medic') { p.medkits = Math.max(p.medkits || 0, MEDIC.medkits); p.syringes = MEDIC.syringes; }
    this.ui.hud?.setInv?.(p.grenades || 0, p.medkits || 0);
    this.ui.hud?.ask?.(null);
    this.updatePerkHud(true);
  },

  // 隊上(含自己)有醫療兵:隊友的職業在玩家狀態旗標裡(F.MEDIC,net/session.js 每次送狀態都帶)
  teamHasMedic() {
    if (this.player.cls === 'medic') return true;
    for (const rp of this.net?.remotes?.values?.() || []) if (rp.connected !== false && rp.flags & F.MEDIC) return true;
    return false;
  },

  // ---------- 每幀(updateGameplay) ----------
  updatePerks(dt) {
    const p = this.player;
    if (p.invulnT > 0) p.invulnT = Math.max(0, p.invulnT - dt);
    this._scareTick(dt);
    if (p.cls === 'medic') this._medicRegen(dt);
    this._blinkTick(dt);
    this._arcTick(dt);
    this.updatePerkHud();
  },

  // 按鍵(flow.onGameplayKey 先問這裡):X 電擊槍、閃身鞋詢問中的 Y / N;回傳 true = 吃掉這個鍵
  perkKey(e) {
    if (this._ask && (e.code === 'KeyY' || e.code === 'KeyN')) { e.stopPropagation(); this._answerBlink(e.code === 'KeyY'); return true; }
    if (e.code === 'KeyX') { this.useTaser(); return true; }
    return false;
  },

  // ---------- 狀態列(HUD 武器欄上方) ----------
  updatePerkHud(force = false) {
    const H = this.ui.hud;
    if (!H?.setPerks) return;
    if (!force && (this._perkT = (this._perkT || 0) - 1) > 0) return; // 每 6 幀更新一次就夠
    this._perkT = 6;
    const p = this.player, list = [];
    if (p.god) list.push({ t: '無敵模式', c: 'gold', i: 'shield' });
    else if (p.invulnT > 0) list.push({ t: `無敵 ${Math.ceil(p.invulnT)} 秒`, c: 'gold', i: 'shield' });
    if (this.spawnStopped) list.push({ t: '已停止出怪', c: 'red', i: 'skull' });
    if (p.cls === 'police') list.push(this.round >= this.taserRound ? { t: '[X] 電擊槍 · 就緒', c: 'blue', i: 'bolt' } : { t: `電擊槍充電中 · 第 ${this.taserRound} 波`, c: 'dim', i: 'bolt' });
    if (p.cls === 'medic') list.push({ t: p.hp < p.maxHp && p.hp > 0 && this.time - (p.lastHurt ?? -99) >= MEDIC.delay ? '醫療兵 · 自然回血中' : '醫療兵', c: 'green', i: 'cross' });
    if (p.blink) list.push(this.round >= this.blinkRound ? { t: '閃身鞋 · 就緒', c: 'blue', i: 'boot' } : { t: `閃身鞋 · 第 ${this.blinkRound} 波`, c: 'dim', i: 'boot' });
    H.setPerks(list);
    H.setSyringes?.(p.cls === 'medic' || p.syringes > 0 ? p.syringes || 0 : null);
  },

  // ---------- 醫療兵 ----------
  _medicRegen(dt) {
    const p = this.player;
    if (!(p.hp > 0) || p.downed || p.alive === false || p.hp >= p.maxHp || this.time - (p.lastHurt ?? -99) < MEDIC.delay) return;
    p.hp = Math.min(p.maxHp, p.hp + MEDIC.rate * dt);
    this.ui.setHP(p.hp, p.maxHp);
  },
  // 致命傷害時(combat.damagePlayer)自動打一支綠色針筒;回傳 true = 救回來了
  autoInject() {
    const p = this.player;
    if (!(p.syringes > 0) || p.downed || p.alive === false) return false;
    p.syringes--;
    p.hp = Math.round(p.maxHp * MEDIC.revive);
    p.invulnT = Math.max(p.invulnT || 0, 1.5);
    this.healT = 0;
    this.ui.setHP(p.hp, p.maxHp);
    sfx.inject();
    sfx.heal();
    this.ui.pickup?.(`綠色針筒 · 生命 ${p.hp}`, '#7dffae', { icon: 'heal', panel: 'health' });
    this.ui.feed?.(`倒下前自動打了一支綠色針筒（還剩 ${p.syringes} 支）`, { icon: 'heal', color: '#7fe08f', ms: 4200 });
    this.motion?.beat?.('on', { k: 0.35 });
    this.updatePerkHud(true);
    return true;
  },

  // ---------- 背後撲臉 ----------
  // zombie.js 狂奔者飛撲命中時呼叫;回傳 true = 這一撲變成撲臉(不扣血、10 秒無敵)
  pounceScare(z, t) {
    if (!z || !t || t.alive === false || t.downed || !Number.isFinite(t.yaw)) return false;
    const ax = z.pos.x - t.pos.x, az = z.pos.z - t.pos.z, l = Math.hypot(ax, az) || 1;
    if ((-Math.sin(t.yaw) * ax - Math.cos(t.yaw) * az) / l > SCARE.behind) return false; // 從前方/側面撲:一般的飛撲
    if (t === this.player) {
      if (this.time < (this._scareCd || 0)) return false;
      this.jumpScare(z);
      return true;
    }
    if (!t.remote || !this.net?.isHost || !(z._nid > 0)) return false; // 房主替隊友判定,送給他本人演
    const cd = this._scareCdR || (this._scareCdR = new Map());
    if (this.time < (cd.get(t.id) || 0)) return false;
    cd.set(t.id, this.time + SCARE.cd);
    this.net.send('js', z._nid, t.id);
    return true;
  },
  jumpScare(z) {
    const p = this.player;
    this._scareCd = this.time + SCARE.cd;
    p.invulnT = Math.max(p.invulnT || 0, SCARE.invuln);
    const ax = z.pos.x - p.pos.x, az = z.pos.z - p.pos.z, l = Math.hypot(ax, az) || 1;
    if (!z._proxy) { // 單人/房主:牠停在眼前 0.6m、臉朝你(多人的隊友畫面跟著快照)
      const d = Math.min(l, SCARE.face);
      z.pos.x = p.pos.x + (ax / l) * d;
      z.pos.z = p.pos.z + (az / l) * d;
      this.world.resolve?.(z.pos, Math.min(z.T?.radius || 0.3, 0.3));
      z.heading = Math.atan2(-ax, -az);
      z.vel.x = z.vel.z = 0;
      z.rootY = 0;
      z.go?.('recover');
      z.attackCd = Math.max(z.attackCd || 0, 1.2);
    }
    const eye = p.pos.y + (p.eyeH || 1.6), head = z.pos.y + (z.type === 'crawler' ? 0.4 : z.headH || 1.55);
    const yaw = Math.atan2(-ax, -az);
    this._scareCam = { t: 0, y0: p.yaw, y1: p.yaw + wrap(yaw - p.yaw), p0: p.pitch, p1: clamp(Math.atan2(head - eye, Math.min(l, SCARE.face)), -0.7, 0.5) };
    p.addShake?.(0.75);
    this.grade?.pulse?.(1.2);
    this.ui.damageFlash?.(30, z.pos, p);
    sfx.shriek(z.vp || z.pos);
    sfx.scare('sting', z.pos);
    if (this.input) this.input.fireHeld = false;
    this.ui.feed?.('牠從背後撲上來了！10 秒內不會受傷', { icon: 'skull', color: '#ff6a5a', ms: 4200 });
    this.updatePerkHud(true);
  },
  _scareTick(dt) {
    const c = this._scareCam;
    if (!c) return;
    c.t += dt;
    const u = Math.min(1, c.t / SCARE.turn), e = u * u * (3 - 2 * u), p = this.player;
    p.yaw = c.y0 + (c.y1 - c.y0) * e;
    p.pitch = c.p0 + (c.p1 - c.p0) * e;
    if (u >= 1) this._scareCam = null;
  },

  // ---------- 警察:電擊槍 ----------
  useTaser() {
    const p = this.player;
    if (p.cls !== 'police' || this.state !== 'playing' || p.downed || p.alive === false || this.healT > 0) return false;
    if (this.round < this.taserRound) { this.ui.pickup(`電擊槍充電中 · 第 ${this.taserRound} 波可以再用`, '#a3a39a'); sfx.pickupDeny(); return false; }
    this._eye(_o, _f);
    const chain = this._taserChain(_o, _f);
    if (!chain.length) { this.ui.pickup('電擊槍：前方沒有殭屍', '#a3a39a'); sfx.pickupDeny(); return false; }
    this.taserRound = this.round + TASER.rounds;
    _c.copy(_o).addScaledVector(_f, 0.45).addScaledVector(_r, 0.16).addScaledVector(_u, -0.12); // 從手上射出
    this.zapChain(chain, _c, true);
    p.addShake?.(0.12);
    if (this.net) this.net.send('tz', chain.map((z) => z._nid).filter((id) => id > 0));
    this.ui.feed?.(`電擊槍 · 電暈 ${chain.length} 隻殭屍 ${TASER.stun} 秒`, { icon: 'bolt', color: '#8db7d8', ms: 3200 });
    this.updatePerkHud(true);
    return true;
  },
  // 相機位置與前/右/上方向
  _eye(o, f) {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(o);
    f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
  },
  _zapOk(z) { return z && z.alive && !z.amb && !(z.T?.immune); },
  // 第一隻:準心附近、看得到的;接著每次跳到離上一隻最近、還沒電到的(中間不能隔牆)
  _taserChain(o, f) {
    const W = this.world, out = [];
    let best = null, bs = Infinity;
    for (const z of this.zombies) {
      if (!this._zapOk(z)) continue;
      chest(z, _c);
      _n.subVectors(_c, o);
      const d = _n.length();
      if (d > TASER.range || d < 0.05) continue;
      const ang = Math.acos(clamp(_n.dot(f) / d, -1, 1));
      if (ang > TASER.cone + (d < 2 ? 0.4 : 0)) continue; // 貼身時放寬
      const s = ang + d * 0.012;
      if (s < bs && W.hasLineOfSight(o.x, o.y, o.z, _c.x, _c.y, _c.z)) { bs = s; best = z; }
    }
    if (!best) return out;
    out.push(best);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    while (out.length < TASER.max) {
      chest(out[out.length - 1], a);
      let nx = null, nd = TASER.hop;
      for (const z of this.zombies) {
        if (!this._zapOk(z) || out.includes(z)) continue;
        chest(z, b);
        const d = a.distanceTo(b);
        if (d < nd && W.hasLineOfSight(a.x, a.y, a.z, b.x, b.y, b.z)) { nd = d; nx = z; }
      }
      if (!nx) break;
      out.push(nx);
    }
    return out;
  },
  // 畫電弧 + 火花 + 聲音;apply:這一端的殭屍真的電暈(單人/房主;多人的客戶端由房主收 'tz' 處理)
  zapChain(chain, from, apply) {
    let prev = _c.copy(from);
    const pts = [];
    for (const z of chain) {
      const c = chest(z, new THREE.Vector3());
      this._arc(prev, c);
      pts.push(c);
      prev = c;
      if (apply && !z._proxy) z.shock?.(TASER.stun);
      if (this.wfx) { _n.subVectors(from, c).normalize(); this.wfx.impact(c, _n, _f.copy(_n).negate(), 'metal', 0.35); }
    }
    if (pts.length) sfx.zap(pts[0], chain.length);
  },
  // 房主/隊友收到別人的電擊('tz'):依 id 找殭屍,從那位玩家手上畫電弧
  remoteZap(ids, rp) {
    const zs = this.net?.zs;
    if (!zs || !Array.isArray(ids)) return;
    const chain = [];
    for (const id of ids.slice(0, TASER.max)) { const z = zs.byId.get(id); if (this._zapOk(z) && !chain.includes(z)) chain.push(z); }
    if (!chain.length) return;
    const from = new THREE.Vector3(rp?.pos?.x ?? chain[0].pos.x, (rp?.pos?.y ?? chain[0].pos.y) + 1.3, rp?.pos?.z ?? chain[0].pos.z);
    this.zapChain(chain, from, true);
  },
  _arc(a, b) {
    const pool = this._arcs || (this._arcs = []);
    let A = pool.find((x) => !x.line.visible);
    if (!A) {
      if (pool.length >= 24) A = pool[0];
      else { A = { line: arcLine(), a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0 }; this.scene.add(A.line); pool.push(A); }
    }
    A.a.copy(a); A.b.copy(b); A.t = 0; A.jit = 0;
    A.line.visible = true;
    this._arcShape(A);
  },
  _arcShape(A) {
    const P = A.line.geometry.attributes.position, L = A.a.distanceTo(A.b), amp = Math.min(0.35, 0.05 + L * 0.06);
    for (let i = 0; i < ARC_N; i++) {
      const u = i / (ARC_N - 1), k = i === 0 || i === ARC_N - 1 ? 0 : amp * Math.sin(u * Math.PI);
      P.setXYZ(i, A.a.x + (A.b.x - A.a.x) * u + (Math.random() - 0.5) * k * 2, A.a.y + (A.b.y - A.a.y) * u + (Math.random() - 0.5) * k * 2, A.a.z + (A.b.z - A.a.z) * u + (Math.random() - 0.5) * k * 2);
    }
    P.needsUpdate = true;
  },
  _arcTick(dt) {
    const pool = this._arcs;
    if (!pool) return;
    let live = 0;
    for (const A of pool) {
      if (!A.line.visible) continue;
      A.t += dt;
      if (A.t > 0.45) { A.line.visible = false; continue; }
      live = Math.max(live, 1 - A.t / 0.45);
      if ((A.jit -= dt) <= 0) { A.jit = 0.03; this._arcShape(A); } // 每 30ms 抖一次
    }
    if (arcMat) arcMat.opacity = 0.35 + 0.65 * live;
  },

  // ---------- 閃身鞋 ----------
  _blinkTick(dt) {
    const p = this.player, H = this.ui.hud;
    if (this._ask) {
      const a = this._ask;
      a.t -= dt;
      if (a.t <= 0 || this.state !== 'playing' || p.downed || p.alive === false) { this._ask = null; H?.ask?.(null); return; } // 沒選:鞋子不算用掉
      H?.ask?.('閃身鞋 · 被包圍了！', `[Y] 傳回金水商行　　[N] 留下來（${BLINK.invuln} 秒無敵）　${Math.ceil(a.t)} 秒`, a.t / BLINK.window);
      return;
    }
    if (!p.blink || this.round < this.blinkRound || this.phase !== 'fighting' || p.downed || p.alive === false || this.state !== 'playing') { this._crowdT = 0; return; }
    let n = 0;
    for (const z of this.zombies) {
      if (!z.alive || z.amb || (z.target && z.target !== p)) continue;
      const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, dy = z.pos.y - p.pos.y;
      if (dy < 1.3 && dy > -1.3 && dx * dx + dz * dz < BLINK.near * BLINK.near) n++;
    }
    this._crowdT = n >= BLINK.crowd ? this._crowdT + dt : 0;
    if (this._crowdT < BLINK.hold) return;
    this._crowdT = 0;
    this._ask = { t: BLINK.window };
    sfx.uiClick?.();
    this.updatePerkHud(true);
  },
  _answerBlink(go) {
    const p = this.player;
    this._ask = null;
    this.ui.hud?.ask?.(null);
    this.blinkRound = this.round + BLINK.rounds;
    if (go && this._blinkHome()) {
      p.invulnT = Math.max(p.invulnT || 0, 1.5); // 落地的一瞬間不會被打
      sfx.blink();
      this.motion?.beat?.('on', { k: 0.45 });
      this.ui.feed?.('閃身鞋 · 傳回金水商行', { icon: 'cart', color: '#8db7d8', ms: 3200 });
    } else {
      p.invulnT = Math.max(p.invulnT || 0, BLINK.invuln);
      sfx.blink();
      this.ui.feed?.(`閃身鞋 · 留下來 · ${BLINK.invuln} 秒無敵`, { icon: 'shield', color: '#f2c84b', ms: 3200 });
    }
    this.updatePerkHud(true);
  },
  // 傳到金水商行門口(鐵門外 2m、面向外面;沒有商店就回起點)
  _blinkHome() {
    const p = this.player, S = this.shop, W = this.world;
    let x, y, z, yaw;
    if (S?.F) {
      const at = S.F.toWorld(0, 2.0), az = S.F.az;
      x = at.x; y = S.y || 0; z = at.z; yaw = Math.atan2(-az.x, -az.z);
    } else if (W.start) { x = W.start.x; y = W.start.y || 0; z = W.start.z; yaw = W.start.yaw || 0; }
    else return false;
    if (p.place) p.place(x, y, z, yaw); else { p.pos.set(x, y, z); p.yaw = yaw; }
    W.resolve?.(p.pos, 0.35);
    p.lastHurtFrom = null;
    this.net?.sendState?.(true);
    return true;
  },

  // ---------- 控制面板 /rev:救起本機玩家(單人陣亡 → 回到遊戲;合作倒地/觀戰 → 起身;活著 → 補滿) ----------
  reviveSelf() {
    const p = this.player, m = this.net?.mode;
    if (m && !this.net.pvp) {
      if (m.dead) m.respawn();
      else if (p.downed) m.revive(null, p.maxHp);
    } else if (m && this.net.pvp) {
      if (m.dead) m.respawn();
    } else if (this.state === 'dead') {
      this.state = 'playing';
      this.paused = false;
      this.weaponScene.visible = true;
      this.ui.overlay('dead', false);
      this.ui.showHud?.(true);
      this.motion?.onBegin?.(); // 眼睛張開、褪色收回
      this.setMood('fight');
      this._idleT = 0;
    }
    if (p.downed && !m) p.downed = false; // 單人的「阿嬤叫你回來」倒地中
    p.alive = true;
    p.hp = p.maxHp;
    p.invulnT = Math.max(p.invulnT || 0, 2);
    this.ui.setHP(p.hp, p.maxHp);
    this.updatePerkHud(true);
    return true;
  },
};
