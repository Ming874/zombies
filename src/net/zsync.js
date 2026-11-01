import * as THREE from 'three';
import { Zombie } from '../zombies/zombie.js';
import { forceVariant, variantIndexOf } from '../zombies/model.js';
import { sfx } from '../audio.js';
import { BIN, NONE, ZTYPES, ZSTATES, PARTS, PHASES, ZENTRY, Writer, code, name, qPos, qAng, dAng } from './protocol.js';
import { Interp } from './interp.js';

// 殭屍同步。
// 房主:幫每隻殭屍編號,出生時送 'zn'(外觀與個性)、死亡送 'zd'(擊殺者與死法),每秒 15 次送二進位快照
//       (只送有變化的;離所有玩家很遠的每 3 張才送一次;靜止的每秒補一次)。
//       其他人的命中先驗證(每發上限、每人每秒額度)再套用,擊殺歸屬看最後一擊。
// 其他人:用同一個變體建立「代理殭屍」(不跑 AI),以 100ms+ 的插值延遲播放位置/朝向/狀態,沿用原本的姿勢動畫;
//       打代理殭屍時先在本地預測(血量/受擊/死亡),命中放進下一則狀態送給房主結算。
// 外觀:變體 k 用固定種子建模(model.js),'zn' 與快照都帶 k;代理用 forceVariant 指定同一個 k。
const SNAP_HZ = 15;
const DELAY = 115; // 殭屍快照插值延遲(ms):快照間隔 66ms + 抖動
const FAR = 45;
const ARM = ['reach', 'one', 'hang', 'none'];
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const SAFE_STATES = new Set(['chase', 'attack', 'stumble', 'stagger', 'recover', 'getup', 'stun']);
const AMB = new Set(['idle', 'spawn', 'scream', 'fall']); // [ambush] 埋伏/衝出/掉落(叫聲由 ambush 自己放)
const _p = new THREE.Vector3(), _d = new THREE.Vector3();
const HITP = { bone: '', point: new THREE.Vector3(), dir: new THREE.Vector3(), dmg: 0, range: 0, weapon: '', explosive: false, melee: false }; // 遠端命中(房主結算用,重複使用)

export class ZombieSync {
  constructor(s) {
    this.s = s;
    this.g = s.game;
    this.byId = new Map();
    this.nextId = 1;
    this.snapT = 0;
    this.seq = 0;
    this.nsnap = 0;
    this.w = new Writer(24576);
    this.tmp = new Float32Array(9);
    this.info = new Map(); // 還沒看到快照的 'zn'
    this.host = { round: 0, phase: 'wait', toSpawn: 0, timer: -1, alive: 0, t: 0 };
    this.deadIds = new Set();
  }

  begin() {
    if (this.s.isHost) for (const z of this.g.zombies) this.register(z);
  }
  stop() { this.byId.clear(); this.info.clear(); this.deadIds.clear(); }
  hostLeft() { return this.host.toSpawn + this.host.alive; }

  listen() {
    const s = this.s;
    s.on('zn', (d, f) => { if (f === s.hostSlot && !s.isHost && Array.isArray(d) && d.length >= 14) this.onSpawnInfo(d); });
    s.on('zd', (d, f) => { if (f === s.hostSlot && !s.isHost && Array.isArray(d)) this.onDeath(d); });
  }

  // ====================== 房主 ======================
  allocId() {
    for (let i = 0; i < 65535; i++) {
      const id = this.nextId;
      this.nextId = this.nextId >= 65534 ? 1 : this.nextId + 1;
      if (!this.byId.has(id)) return id;
    }
    return 1;
  }
  register(z) {
    if (z._nid) return;
    z._nid = this.allocId();
    this.byId.set(z._nid, z);
    this.wrapHostDamage(z);
    this.s.send('zn', this.spawnInfo(z));
  }
  // 記下最後命中的部位(死亡訊息用);包在原本的 damage(含 flow 的統計包裝)外面,命中資訊照傳
  wrapHostDamage(z) {
    if (z._hostWrap) return;
    const prev = z.damage;
    z.damage = function (a, part, hit) { this._lastPart = part; return prev.call(this, a, part, hit); };
    z._hostWrap = true;
  }
  spawnInfo(z) {
    return [z._nid, code(ZTYPES, z.type), variantIndexOf(z.V), r3(z.k), code(ARM, z.armStyle), r2(z.limp), z.limpSide, r3(z.tilt), r3(z.lean), Math.round(z.maxHp), r2(z.pos.x), r2(z.pos.y), r2(z.pos.z), r2(z.heading)];
  }
  // 新加入的玩家:補送所有活著的殭屍
  sendAllTo(slot) {
    for (const z of this.g.zombies) if (z._nid && z.alive) this.s.send('zn', this.spawnInfo(z), slot);
  }
  sendDeath(z, killerSlot) {
    if (z._dsent) return;
    z._dsent = true;
    this.byId.delete(z._nid);
    this.s.send('zd', [z._nid, killerSlot ?? NONE, code(PARTS, z._lastPart || z.killPart || 'body'), z.deathKind || null, z.deathSide || 1]);
  }

  hostUpdate(dt) {
    const g = this.g;
    for (const z of g.zombies) {
      if (!z._nid) this.register(z);
      else if (!z.alive && !z._dsent) this.sendDeath(z, null);
    }
    this.snapT -= dt;
    if (this.snapT > 0) return;
    this.snapT += 1 / SNAP_HZ;
    if (this.snapT < 0) this.snapT = 0;
    if (!this.s.remotes.size) return;
    this.sendSnapshot();
  }

  sendSnapshot() {
    const g = this.g, s = this.s, w = this.w.reset();
    const now = performance.now();
    this.nsnap++;
    const full = this.nsnap % (SNAP_HZ * 2) === 0; // 每 2 秒完整送一次
    w.u8(BIN.ZSNAP); w.u8(0); w.u16((this.seq = (this.seq + 1) & 0xffff)); w.u32(Math.round(s.client.serverNow()) >>> 0);
    let alive = 0;
    for (const z of g.zombies) if (z.alive) alive++;
    w.u8(Math.min(255, g.round | 0)); w.u8(code(PHASES, g.phase));
    w.u16(Math.max(0, g.toSpawn | 0));
    const timer = s.mode.hostTimer?.() ?? -1;
    w.u16(timer >= 0 ? Math.min(65534, Math.round(timer * 10)) : 65535);
    w.u8(Math.min(255, alive));
    const nPos = w.o;
    w.u8(0);
    let n = 0;
    const players = g.players;
    for (const z of g.zombies) {
      if (!z.alive || !z._nid) continue;
      if (w.o + ZENTRY > w.buf.byteLength - 8 || n >= 255) break;
      const qx = qPos(z.pos.x), qy = qPos(z.pos.y), qz = qPos(z.pos.z), qh = qAng(z.heading), sc = code(ZSTATES, z.state), hp = Math.round(z.hp);
      const q = z._q || (z._q = { x: 1e9, y: 0, z: 0, h: 0, s: -1, hp: -1, t: 0 });
      const changed = Math.abs(qx - q.x) > 1 || Math.abs(qz - q.z) > 1 || Math.abs(qy - q.y) > 1 || Math.abs(((qh - q.h + 98304) % 65536) - 32768) > 40 || sc !== q.s || hp !== q.hp;
      let near = Infinity;
      for (const p of players) { const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z); if (d < near) near = d; }
      const stale = now - q.t > 1000;
      if (!full && !stale && (!changed || (near > FAR && this.nsnap % 3 !== 0))) continue;
      q.x = qx; q.y = qy; q.z = qz; q.h = qh; q.s = sc; q.hp = hp; q.t = now;
      w.u16(z._nid); w.u8(code(ZTYPES, z.type)); w.u8(variantIndexOf(z.V)); w.u8(sc); w.u8(1 | ((z.amb ? (z.amb.code & 7) | (z.amb.quiet ? 8 : 0) : 0) << 1)); // 旗標:bit0 存活、[ambush] bit1-3 埋伏姿勢、bit4 安靜甦醒
      w.i16(qx); w.i16(qy); w.i16(qz); w.u16(qh);
      w.u16(Math.min(65535, Math.round(Math.max(0, z.st) * 1000))); w.u16(Math.max(0, Math.min(65535, hp)));
      w.u8(Math.min(255, Math.round((z.speedNow || 0) * 20)));
      const t = z.target;
      w.u8(!t ? NONE : t === g.player ? s.me : typeof t.id === 'number' ? t.id : NONE);
      n++;
    }
    w.at8(nPos, n);
    s.client.sendBin(w.view());
  }

  // 房主驗證遠端命中:每發上限(巴雷特 260×1.5;爆炸 240),每人另有額度(持續 900/秒、瞬間 3000,夠一顆手榴彈炸一群)
  budget(rp, dmg, flags) {
    if (!(dmg > 0)) return 0;
    dmg = Math.min(dmg, flags & 1 ? 240 : 400);
    const b = rp.zbud, now = performance.now();
    if (!b.init) { b.init = true; b.b = 3000; b.t = now; }
    b.b = Math.min(3000, b.b + ((now - b.t) / 1000) * 900);
    b.t = now;
    const d = Math.min(dmg, b.b);
    b.b -= d;
    return d;
  }

  // 遠端玩家打中殭屍:房主結算傷害與擊殺(命中點 = 該部位的命中盒、方向 = 射手 → 命中點);其他人只做受擊反應
  onRemoteHit(rp, id, part, dmg, flags = 0) {
    const z = this.byId.get(id);
    if (!z || !z.alive) return;
    const g = this.g;
    if (this.s.isHost && !z._proxy) {
      dmg = this.budget(rp, dmg, flags);
      if (!(dmg > 0)) return;
      z.root.updateMatrixWorld(true);
      let hb = null;
      for (const h of z.hitboxes) if (h.userData.part === part && h.matrixWorld.determinant() !== 0) { hb = h; break; }
      if (!hb) hb = z.hitboxes[0];
      const H = HITP;
      hb.getWorldPosition(H.point);
      const ex = rp.pos.x, ey = rp.pos.y + 1.5, ez = rp.pos.z;
      H.dir.set(H.point.x - ex, H.point.y - ey, H.point.z - ez);
      H.range = H.dir.length();
      if (H.range < 1e-3) H.dir.set(0, 0, 1); else H.dir.multiplyScalar(1 / H.range);
      H.explosive = !!(flags & 1);
      H.melee = !!(flags & 2);
      if (H.explosive) { H.dir.y = Math.abs(H.dir.y) + 0.35; H.dir.normalize(); }
      H.bone = hb.parent ? hb.parent.name : '';
      H.dmg = dmg * (part === 'head' ? 2 : 1);
      H.weapon = H.melee ? 'knife' : H.explosive ? 'grenade' : rp.weapon;
      g._impulse?.(z, H.point, H.dir, dmg * (H.explosive ? 3 : 4)); // 布娃娃的倒地方向
      const killed = z.damage(dmg, part, H);
      if (killed) g.onKill(z, rp);
    } else if (z._proxy) {
      this.flinch(z, dmg, part);
    }
  }
  flinch(z, dmg, part) {
    const heavy = z.type === 'brute' ? 0.18 : z.type === 'bloater' ? 0.5 : 1;
    const k = Math.min(2, dmg / 30) * heavy;
    z.flinchV += (part === 'head' ? 7 : 4.5) * k;
    z.rollV += (Math.random() - 0.5) * 9 * k;
    if (part === 'head') z.headKick = Math.min(1.2, z.headKick + 0.7 * heavy);
    z._flinchT = performance.now();
  }

  // 擊殺(包裝 game.onKill;orig = flow 包過的 onKill:金幣、獎勵、掉落、統計)
  onKill(z, killer, hit, orig) {
    const s = this.s, g = this.g;
    if (z._proxy) {
      // 本地預測擊殺:立刻倒地(布娃娃、斷肢)並顯示擊殺標記;金幣/獎勵/掉落等房主的 'zd' 確認是我殺的才給
      // (兩人同時打同一隻時只有房主判定的那個人拿到,不會重複)
      if (z._localKill && !z._pending) {
        z._pending = { how: g._killHow || (hit?.melee ? 'melee' : hit?.blast || hit?.explosive ? 'explosion' : null), t: performance.now() };
        this.corpse(z, hit);
        if (g.wfx && g.chud) { g._killMark = true; g.chud.marker('kill', z.killPart === 'head'); sfx.killConfirm?.(); }
      }
      return;
    }
    // 房主的真殭屍
    const k = killer || g.player;
    if (k.remote) { this.corpse(z, hit); z.killer = k; } // 隊友擊殺:金幣與掉落物在他那邊生成
    else if (s.pvp) { this.corpse(z, hit); z.killer = k; g.kills = (g.kills || 0) + 1; }
    else orig.call(g, z, k, hit);
    const slot = k.remote ? k.id : k === g.player ? s.me : NONE;
    if (z._nid) this.sendDeath(z, slot);
    s.mode.onZombieKilled?.(z, slot);
  }
  // 沒有擊殺獎勵的屍體:血池、布娃娃、斷口噴血(combat.killFx)
  corpse(z, hit = null) {
    if (z._killed) return;
    z._killed = true;
    this.g.killFx(z, hit);
  }
  // 房主確認是我殺的(屍體已經倒了):金幣、擊殺數、flow 的擊殺獎勵/統計/掉落物(與 combat.onKill + flow.afterKill 相同)
  credit(z, how) {
    const g = this.g;
    if (z._credited) return;
    z._credited = true;
    z.killer = g.player;
    g.kills = (g.kills || 0) + 1;
    if (this.s.pvp) return;
    g.coins.drop(z.pos.x, z.pos.y, z.pos.z, z.T.coins);
    g.afterKill?.(z, g.player, how || null);
  }

  // ====================== 其他人 ======================
  onSpawnInfo(d) {
    const id = d[0];
    if (!(id > 0) || this.deadIds.has(id)) return;
    const z = this.byId.get(id);
    if (z) { this.applyInfo(z, d); return; }
    if (!fin(d[10]) || !fin(d[11]) || !fin(d[12])) return;
    this.info.set(id, d);
    this.createProxy(id, d[1], d[2], d[10], d[11], d[12], d[13]);
  }
  applyInfo(z, d) {
    z.k = fin(d[3]) ? Math.max(0.8, Math.min(1.2, d[3])) : 1;
    z.mesh.scale.setScalar(z.k);
    z.headH = z.V.rig.HC.y * z.k;
    z.bar.sprite.position.y = z.type === 'crawler' ? 0.95 : z.headH + 0.32;
    z.armStyle = ARM[d[4]] || z.armStyle;
    if (fin(d[5])) z.limp = d[5];
    if (d[6] === 1 || d[6] === -1) z.limpSide = d[6];
    if (fin(d[7])) z.tilt = d[7];
    if (fin(d[8])) z.lean = d[8];
    if (d[9] > 0 && d[9] < 100000) { z.maxHp = d[9]; z.drawBar(); }
    this.info.delete(d[0]);
  }

  createProxy(id, typeIdx, vi, x, y, zz, h) {
    const g = this.g;
    const type = name(ZTYPES, typeIdx, 'walker');
    forceVariant(type, vi | 0);
    const z = new Zombie(g.scene, { x, y, z: zz }, Math.max(1, g.round | 0), type);
    z._proxy = true;
    z._nid = id;
    z.heading = fin(h) ? h : 0;
    z.buf = new Interp(9, 24, [3], [4, 5, 6, 8]); // x y z 朝向 狀態 狀態時間 血量 速度 目標
    z._hpHost = z.hp;
    z._groan = 2 + Math.random() * 4;
    z.speedNow = 0; // 第一張快照到之前姿勢動畫也要有值(否則步態相位變 NaN,整副骨架跟著壞掉)
    z.dist = 99;
    this.toProxy(z);
    g.zombies.push(z);
    this.byId.set(id, z);
    const info = this.info.get(id);
    if (info) this.applyInfo(z, info);
    if (type === 'brute') g.ui.banner('巨屍出現', '他會咆哮後衝鋒 · 引他撞牆再打頭', 3500, 'red');
    return z;
  }
  toProxy(z) {
    const s = this.s;
    z._proxy = true;
    if (!z.buf) z.buf = new Interp(9, 24, [3], [4, 5, 6, 8]);
    z.update = (dt, ctx) => this.drive(z, dt, ctx);
    const orig = Zombie.prototype.damage;
    z.damage = function (amount, part, hit) { // 本地預測 + 送給房主
      if (!this.alive) return false;
      s.queueZHit(this._nid, part, amount, hit ? (hit.explosive ? 1 : 0) | (hit.melee ? 2 : 0) : 0);
      this._hitT = performance.now();
      this._lastPart = part;
      const killed = orig.call(this, amount, part, hit);
      if (killed) { this._localKill = true; this._killAt = performance.now(); }
      return killed;
    };
  }

  onSnapshot(r) {
    const s = this.s;
    if (s.isHost || r.left < 16) return;
    r.u8(); const from = r.u8(); r.u16(); const t = r.u32();
    if (from !== s.hostSlot) return;
    const H = this.host;
    H.round = r.u8(); H.phase = name(PHASES, r.u8(), 'wait'); H.toSpawn = r.u16();
    const tm = r.u16(); H.timer = tm === 65535 ? -1 : tm / 10;
    H.alive = r.u8(); H.t = performance.now();
    const n = r.u8();
    if (r.left < n * ZENTRY) return;
    for (let i = 0; i < n; i++) {
      const id = r.u16(), ty = r.u8(), vi = r.u8(), sc = r.u8(), fl = r.u8();
      const x = r.i16() / 100, y = r.i16() / 100, zz = r.i16() / 100, h = dAng(r.u16());
      const st = r.u16() / 1000, hp = r.u16(), sp = r.u8() / 20, tg = r.u8();
      let z = this.byId.get(id);
      if (!z) {
        if (this.deadIds.has(id)) continue;
        z = this.createProxy(id, ty, vi, x, y, zz, h);
      }
      if (!z._proxy) continue;
      z._ambFl = fl >> 1; // [ambush] 埋伏姿勢 / 安靜甦醒(src/zombies/ambush.pose.js)
      const base = z.buf.pushAfterGap(t, 400);
      if (base < 0) continue;
      const v = z.buf.v;
      v[base] = x; v[base + 1] = y; v[base + 2] = zz; v[base + 3] = h; v[base + 4] = sc; v[base + 5] = st; v[base + 6] = hp; v[base + 7] = sp; v[base + 8] = tg;
      z._hostHp = hp;
      z._seen = performance.now();
    }
  }

  onDeath(d) {
    const [id, by, partCode, dk, ds] = d;
    const z = this.byId.get(id);
    this.deadIds.add(id);
    if (this.deadIds.size > 400) this.deadIds = new Set([...this.deadIds].slice(-200));
    if (!z) return;
    this.byId.delete(id);
    z._hostDead = true;
    const g = this.g, s = this.s;
    if (z.alive) {
      const part = name(PARTS, partCode, 'body');
      // 布娃娃倒地方向:擊殺者 → 殭屍
      const k = by === s.me ? g.player : s.remotes.get(by);
      if (k) {
        _p.set(z.pos.x, z.pos.y + (z.type === 'crawler' ? 0.3 : 1.1), z.pos.z);
        _d.set(z.pos.x - k.pos.x, 0.15, z.pos.z - k.pos.z).normalize();
        g._impulse?.(z, _p, _d, 140);
      }
      z.die(part);
      if (typeof dk === 'string' && dk.length < 12) { z.deathKind = dk; z.deathSide = ds === -1 ? -1 : 1; }
      this.corpse(z);
      if (by === s.me) { this.credit(z, null); g.chud?.marker('kill', part === 'head'); }
    } else if (by === s.me && z._pending) this.credit(z, z._pending.how); // 預測的擊殺確認了
    s.mode.onZombieKilled?.(z, by);
  }

  // 代理殭屍的每幀更新(取代 AI):插值位置/朝向/狀態,沿用原本的姿勢動畫與聲音
  drive(z, dt, ctx) {
    z.t += dt;
    if (!z.alive) { z._dead(dt, ctx); return 0; }
    const s = this.s, g = this.g;
    const v = this.tmp;
    const rt = s.client.serverNow() - DELAY;
    const res = z.buf.sample(rt, v);
    if (res < 0 && !z._drawn) { z.root.visible = false; return 0; } // [ambush] 第一筆插值資料到之前不畫(不會先在出生點/埋伏點站著冒出來)
    if (!z._drawn) { z._drawn = true; z.root.visible = true; }
    if (res >= 0) {
      z.pos.set(v[0], v[1], v[2]);
      z.heading = v[3];
      const state = name(ZSTATES, v[4], 'chase');
      const a = z.buf.a;
      const st = z.buf.value(a, 5) + Math.min(1.5, Math.max(0, rt - z.buf.t[a]) / 1000);
      if (state !== z.state) this.onState(z, z.state, state);
      z.state = state;
      z.st0 = z.st;
      z.st = st;
      if (z.st < z.st0) z.st0 = -1;
      z.speedNow = res === 1 ? v[7] * Math.max(0, 1 - z.buf.over * 4) : v[7];
      // 血量:房主的值為準;本地剛打中時保留較低的預測值一下
      const hostHp = z._hostHp ?? z.hp;
      if (hostHp < z.hp - 0.5 || performance.now() - (z._hitT || 0) > 900) {
        if (hostHp < z.hp - 1 && performance.now() - (z._flinchT || 0) > 250 && performance.now() - (z._hitT || 0) > 250) this.flinch(z, z.hp - hostHp, 'body');
        if (Math.abs(hostHp - z.hp) > 0.5) { z.hp = Math.min(z.maxHp, hostHp); z.drawBar(); }
      }
      // 注視的目標
      const tg = v[8];
      z.target = tg === s.me ? g.player : s.remotes.get(tg) || null;
    }
    if (!(z.speedNow >= 0)) z.speedNow = 0;
    if (!Number.isFinite(z.ph)) z.ph = 0;
    const tp = z.target?.pos || this.nearest(z);
    const toX = tp ? tp.x - z.pos.x : Math.sin(z.heading), toZ = tp ? tp.z - z.pos.z : Math.cos(z.heading);
    const dist = Math.hypot(toX, toZ) || 1e-3;
    const lp = g.player.pos;
    z.dist = Math.hypot(lp.x - z.pos.x, lp.z - z.pos.z);
    z.mesh.castShadow = z.dist < 11;
    if (z._ambFl || z.amb) { const r = z._ambProxy(dt, ctx); if (r !== undefined) return r; } // [ambush] 埋伏中:凍結不動;衝出/掉落照房主的狀態時間播
    z._slope?.(ctx.world, z.type === 'crawler' ? 1 : 0, dt);
    z._resetPose();
    (z.amb ? z._ambPose : z['_pose_' + z.type]).call(z, dt, ctx, dist, toX, toZ);
    if (z.type === 'runner' && z.state === 'leap') { const u = z.st / 0.46; z.rootY = Math.max(0, 4 * 0.42 * u * (1 - u)); }
    z._reactions(dt, ctx); // [zombies-w3] ctx:共用動畫層(抽搐、受擊部位反應、首次遭遇提示)
    z._applyRoot();
    // 腳步聲(與 Zombie.update 相同的規則)
    if (z.type !== 'brute' && z.type !== 'crawler') {
      const n = Math.floor((z.ph + Math.PI / 2) / Math.PI);
      if (n !== z.stepN) { z.stepN = n; if (z.speedNow > 0.3 && z.rootY < 0.05) sfx.zStep(z.type, z.pos); }
    }
    z.vp.x = z.pos.x; z.vp.y = z.pos.y + (z.type === 'crawler' ? 0.4 : z.headH); z.vp.z = z.pos.z;
    z._groan -= dt;
    if (z._groan <= 0) {
      z._groan = ({ walker: 4, runner: 2.5, crawler: 4, bloater: 3.5, brute: 5 }[z.type] ?? z.T.groan ?? 4) + Math.random() * 5; // [zombies-w3] 新類型讀 T.groan
      if (z.type === 'bloater' && Math.random() < 0.5) sfx.gurgle(z.vp); else sfx.groan(z.type, z.vp);
      z.jawT = 1.3;
    }
    z.jawT = Math.max(0, z.jawT - dt);
    return 0;
  }
  nearest(z) {
    let best = null, bd = Infinity;
    for (const p of this.g.players) {
      if (p.alive === false) continue;
      const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      if (d < bd) { bd = d; best = p.pos; }
    }
    return best;
  }
  // 狀態切換時播放對應的聲音(原本在 AI 的 think 裡)
  onState(z, prev, next) {
    z.st0 = -1;
    if (next === 'attack' || next === 'slam') sfx.zAttack(z.type, z.vp);
    else if (next === 'roar') { sfx.roar(z.vp); z.jawT = 0; }
    else if (next === 'crouch') sfx.shriek(z.vp);
    else if (next === 'stun') { sfx.wallImpact(z.vp); }
    else if (next === 'trip') sfx.thud(z.vp, false);
    if (z.type === 'runner' && !z.spotted && next !== 'chase' && !AMB.has(next)) { z.spotted = true; sfx.shriek(z.vp); }
  }

  // 每幀:房主送快照;其他人清理已確認死亡/過期的代理
  update(dt) {
    const s = this.s;
    if (s.isHost) { this.hostUpdate(dt); return; }
    const now = performance.now();
    for (const z of this.g.zombies) {
      if (!z._proxy) continue;
      // 預測擊殺但房主仍回報牠活著(例如命中被拒):2.5 秒後換一隻新的代理
      if (!z.alive && z._localKill && !z._hostDead && now - z._killAt > 2500 && (z._seen || 0) > z._killAt + 300) {
        z._hostDead = true;
        const id = z._nid;
        const n = z.buf.newest;
        if (n >= 0) {
          this.byId.delete(id);
          const nz = this.createProxy(id, code(ZTYPES, z.type), variantIndexOf(z.V), z.buf.value(n, 0), z.buf.value(n, 1), z.buf.value(n, 2), z.buf.value(n, 3));
          nz.hp = nz._hostHp = z.buf.value(n, 6);
          nz.drawBar();
        }
      }
      // 房主持續在送快照(每 2 秒完整一次),這隻卻 6 秒沒出現:漏掉了死亡訊息 → 移除
      if (z.alive && z._seen && now - z._seen > 6000 && now - this.host.t < 600) { z.alive = false; z.corpse = 0.01; this.byId.delete(z._nid); }
    }
  }

  // ====================== 房主轉移 ======================
  becomeHost() {
    const g = this.g;
    let maxId = 0;
    for (const z of g.zombies) {
      maxId = Math.max(maxId, z._nid || 0);
      if (!z._proxy) continue;
      delete z.update;
      delete z.damage;
      z._hostWrap = false;
      z._proxy = false;
      if (z.alive) {
        const n = z.buf.newest;
        if (n >= 0) {
          z.pos.set(z.buf.value(n, 0), z.buf.value(n, 1), z.buf.value(n, 2));
          z.heading = z.buf.value(n, 3);
          z.state = name(ZSTATES, z.buf.value(n, 4), 'chase');
          z.st = z.buf.value(n, 5);
          z.hp = Math.min(z.hp, z.buf.value(n, 6));
        }
        if (!SAFE_STATES.has(z.state)) z.go('chase');
        z.vel.set(0, 0, 0);
        z.attackCd = 0.6;
        z.specialCd = 1.5;
        z.target = null;
        z.losT = 0;
        z.rootY = 0;
        z.rootPitch = 0;
        z._born = g.time;
        z._farT = 0;
        z.drawBar();
      }
      if (z._nid) { this.byId.set(z._nid, z); this.wrapHostDamage(z); }
      if (!z.alive) z._dsent = true;
    }
    this.nextId = maxId + 1;
    this.snapT = 0;
  }
  becomeClient() {
    const g = this.g;
    for (const z of g.zombies) {
      if (z._proxy || !z.alive) continue;
      if (!z._nid) { z.alive = false; z.corpse = 0.01; continue; }
      delete z.damage;
      z._hostWrap = false;
      z._hostHp = z.hp;
      z._seen = performance.now();
      z._groan = 3;
      this.toProxy(z);
      const base = z.buf.push(Math.round(this.s.client.serverNow()) - DELAY);
      if (base >= 0) { const v = z.buf.v; v[base] = z.pos.x; v[base + 1] = z.pos.y; v[base + 2] = z.pos.z; v[base + 3] = z.heading; v[base + 4] = code(ZSTATES, z.state); v[base + 5] = z.st; v[base + 6] = z.hp; v[base + 7] = 0; v[base + 8] = NONE; }
    }
  }
}
