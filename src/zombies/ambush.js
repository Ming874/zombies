import * as THREE from 'three';
import { sfx } from '../audio.js';
import { ambushSfx } from '../audio/ambush.js';
import { settings } from '../ui/settings.js';
import { Zombie } from './zombie.js';
import { forceVariant } from './model.js';
import { LURK, BURST, DROP, POSE, isCorpse, makeAmb } from './ambush.pose.js';
import { createAmbushProps } from './ambush.props.js';
import { precompile } from '../sys/warmup.js';

// 埋伏(殭屍從轉角/門口/櫃子後面衝出來)、天花板掉落、裝死的屍體(game.ambush,flow.initGameplay 建立)。
//
// 原則:玩家永遠不會看到「在那邊等著嚇人」的殭屍。
//  - 掩蔽處的埋伏與天花板掉落是「虛擬」的:只從出怪佇列預留一隻(仍算在 toSpawn、回合數量裡),場上沒有實體。
//    觸發當下才在「所有玩家都看不到」的位置現身,而且只有方向對了才觸發:
//      掩蔽點 H(凸牆角/門洞旁/高櫃後;往掩蔽深處再退 0.3m)整個身體範圍(每人 19 條視線)對每個玩家都看不到、
//      沿導航場從 H 走向玩家的路線上 3m 內有一點 E 是觸發的玩家看得到的(繞出轉角/門口就進入視野)、路線總長在觸發距離內
//      → 殭屍在 H 現身,0.14 秒內起身,沿路線衝出來撲向玩家(玩家看到牠從轉角/門口衝出來)。
//    從錯的方向接近(H 被任何玩家看到、近距離)= 這個點作廢,稍後改到別的點(本來就沒有實體,所以什麼都看不到)。
//    天花板:觸發當下才在夾層裡現身(看不到)→ 格柵/天花板碎開 → 落下。
//  - 唯一會先擺在場上的是「裝死的屍體」:只用屍體姿勢(靠牆癱坐/趴地/仰躺)+ 血泊,跟假屍體一模一樣,被看到也只是一具屍體;
//    玩家經過、轉身背對、在旁邊開槍或打到牠時才起身。
//  - 節奏:有靈異導演(game.horror.director)就先 request 再放、放了 notify;沒有時自己的冷卻(約 40~60 秒一次、
//    第一回合開場 45 秒內不放、兩次至少隔 8 秒);驚嚇強度(設定 scare:off/low/normal/high)調整數量與冷卻。
//  - 回合不會卡住:場上沒有活動的殭屍、剩下的都是預留/裝死的 → 2.5 秒後預留的放回佇列照常出怪、裝死的起身(flow 呼叫 hunt())。
//  - 連線:只有房主決定;現身後就是一般的殭屍(快照 + 旗標);天花板的虛擬點用 'amb' 訊息廣播給隊友,各端自己放滴血/抓刮的線索。
//  - 假屍體:每回合散布幾具真的不會動的屍體(同樣的模型、姿勢與血泊,可以被射中、只會抽搐)。
//  - 習慣群(休息時,房主):招魂燈熄了之後,在玩家可能走的路上放 1~3 具「裝死」的活屍(同一套姿勢、喚醒規則:被盯著不動、
//    背對、旁邊開槍、收音機太大聲、噪音);每次休息有上限,不算進下一波、不卡回合;用姿勢與位置暗示他們生前是誰(N7):
//    護理站旁面壁站著的護理師、病床邊的病人、候診區靠著長椅坐在地上的人、禮拜堂跪在長椅前的人。醒來就是一般殭屍;
//    走到金水商行門口就停下來、站在門口等(店裡還是安全的)。下一波開始時:醒著的加入那一波;還在裝死、沒人看得到的悄悄離開。
// 除錯:__game.ambush.stats / .debug() / .log / .force('cover'|'drop'|'corpse'|'habit', opt) / .wakeAll()
const INT = { off: { n: 0, cd: 99 }, low: { n: 0.5, cd: 1.8 }, normal: { n: 1, cd: 1 }, high: { n: 1.5, cd: 0.65 } };
const NO_THEME = new Set(['shop', 'lobby', 'rooftop', 'fire_escape', 'courtyard', 'cemetery', 'plaza', 'parking', 'alley', 'yard', 'playground', 'ambulance_bay', 'ramp']);
const KIND_W = { edge: 1.3, door: 1.45, tall: 1.1, corner: 1, bed: 1.1, floor: 0.8 };
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const COVER_TYPES = new Set(['walker', 'runner', 'surgeon', 'straitjacket', 'burned']);
const DROP_TYPES = new Set(['runner', 'crawler', 'walker', 'surgeon', 'straitjacket']);
const CORPSE_TYPES = new Set(['walker', 'runner', 'crawler']);
const POSE_H = { [POSE.slump]: 0.75, [POSE.lie]: 0.3, [POSE.supine]: 0.3, [POSE.stand]: 1.3, [POSE.crouch]: 0.8 };
// 習慣群:不放的地方(207、商店)與每次休息的上限
const HABIT_SKIP = new Set(['f2_ward_207', 'f1_store']);
const SHOP_ZONE = 'f1_store';
// 掩蔽點 H 的可見性測試點(相對 H 的 x / 高度 / z):身體中線三個高度 + 半徑 0.45m 的兩圈(伸出的手、肩膀、膝蓋)
const HPTS = [[0, 0.45, 0], [0, 1.1, 0], [0, 1.75, 0]];
for (const h of [0.85, 1.45]) for (let k = 0; k < 8; k++) HPTS.push([Math.cos((k * Math.PI) / 4) * 0.45, h, Math.sin((k * Math.PI) / 4) * 0.45]);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rand = (a, b) => a + Math.random() * (b - a);
const r2 = (x) => Math.round(x * 100) / 100;
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _down = new THREE.Vector3(0, -1, 0);
const _snap = { x: 0, y: 0, z: 0 };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ======================================================================
// 位置(建一次;只看格子、碰撞盒與導航圖,不打射線)
//  cover(掩蔽處,虛擬埋伏用):edge 凸牆角(轉角另一側)、door 門洞旁的牆後、tall 高櫃/置物櫃旁
//  corpse(屍體,裝死與假屍體用):corner 房間的牆角(靠牆癱坐)、bed 矮家具旁(趴/仰躺)、floor 房間地上
//  ceil:天花板破洞 / 下垂的板(K.ceilings)+ 散布的通風格柵(固定種子,各端位置一致)
// ======================================================================
function buildSpots(W, K, fixtures) {
  const L = W.layout, cover = [], corpse = [], ceil = [], grilles = [];
  const ch = (li, c, r) => L.charAt(li, c, r);
  const solid = (li, c, r) => { const x = ch(li, c, r); return x === '#' || x === 'E'; };
  const walk = (li, c, r) => (L.flagsAt(li, c, r) & L.F.WALK) !== 0;
  const plain = (li, c, r) => { const x = ch(li, c, r); return x === '.' || x === 'Z' || x === 'a' || x === 'h'; };
  const zoneOk = (li, c, r) => { const z = L.zoneAt(li, c, r); return z && !NO_THEME.has(z.theme) && !/outdoor/.test(z.mood) ? z : null; };
  const fixNear = (li, x, z, r) => { for (const f of fixtures) if (f.li === li && Math.abs(f.x - x) < r && Math.abs(f.z - z) < r) return true; return false; };
  const lit = (li, x, z) => { let s = 0; for (const f of fixtures) { if (f.li !== li || f.state === 2) continue; const d = Math.hypot(f.x - x, f.z - z); if (d < 4.5) s += (1 - d / 4.5) * (f.state === 1 ? 0.5 : 1); } return s; };
  const nodeOk = (li, x, z) => {
    const y = L.levels[li].y;
    if (W.isNode(x, y, z)) return true;
    return !!W.navSnap(x, y, z, _snap) && Math.hypot(_snap.x - x, _snap.z - z) < 0.65 && Math.abs(_snap.y - y) < 0.3;
  };
  const add = (list, li, x, z, yaw, kind) => {
    const c = Math.floor(x / 2), r = Math.floor(z / 2);
    if (!plain(li, c, r)) return null;
    const zn = zoneOk(li, c, r);
    if (!zn || !nodeOk(li, x, z)) return null;
    for (const q of list) if (q.li === li && Math.abs(q.x - x) + Math.abs(q.z - z) < 0.4) return null; // 重複(門框也是凸牆角)
    const s = { li, x, y: L.levels[li].y, z, yaw, kind, zone: zn.id, corridor: zn.theme === 'corridor', dark: lit(li, x, z) < 0.55, busy: null, usedT: -1e9, decoy: null };
    list.push(s);
    return s;
  };
  const R = rng(4417);
  for (let li = 0; li < L.levels.length; li++) {
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const x = ch(li, c, r);
      if (x === '+') { // 門洞兩側、牆後(門外的人看不到;從門口衝出來)
        const hz = solid(li, c - 1, r) && solid(li, c + 1, r), vt = solid(li, c, r - 1) && solid(li, c, r + 1);
        for (const s of [-1, 1]) for (const l of [-1, 1]) {
          if (hz && solid(li, c + l, r)) add(cover, li, l > 0 ? (c + 1) * 2 + 0.55 : c * 2 - 0.55, s > 0 ? (r + 1) * 2 + 0.55 : r * 2 - 0.55, Math.atan2(-l, 0), 'door');
          else if (vt && solid(li, c, r + l)) add(cover, li, s > 0 ? (c + 1) * 2 + 0.55 : c * 2 - 0.55, l > 0 ? (r + 1) * 2 + 0.55 : r * 2 - 0.55, Math.atan2(0, -l), 'door');
        }
        continue;
      }
      if (!plain(li, c, r)) continue;
      const zn = zoneOk(li, c, r);
      if (!zn) continue;
      const cx = (c + 0.5) * 2, cz = (r + 0.5) * 2;
      for (const [dc, dr] of CORNERS) if (solid(li, c + dc, r) && solid(li, c, r + dr)) add(corpse, li, cx + dc * 0.5, cz + dr * 0.5, Math.atan2(-dc, -dr), 'corner'); // 靠牆癱坐的屍體
      if (zn.theme !== 'corridor' && R() < 0.12) add(corpse, li, cx + (R() - 0.5) * 0.8, cz + (R() - 0.5) * 0.8, R() * Math.PI * 2, 'floor');
    }
    // 凸牆角:格點四周剛好一格是牆、其他三格可走 → 牆兩側各一個躲藏點(緊貼牆面、離轉角 0.7m),面向轉角
    for (let vr = 1; vr < L.H; vr++) for (let vc = 1; vc < L.W; vc++) {
      let ns = 0, si = -1;
      for (let k = 0; k < 4; k++) {
        const c = vc - 1 + (k & 1), r = vr - 1 + (k >> 1);
        if (solid(li, c, r)) { ns++; si = k; } else if (!walk(li, c, r)) ns = 9;
      }
      if (ns !== 1) continue;
      const qx = si & 1 ? 1 : -1, qz = si >> 1 ? 1 : -1, vx = vc * 2, vz = vr * 2;
      add(cover, li, vx - qx * 0.5, vz + qz * 0.7, Math.atan2(0, -qz), 'edge');
      add(cover, li, vx + qx * 0.7, vz - qz * 0.5, Math.atan2(-qx, 0), 'edge');
    }
  }
  // 家具旁:每個碰撞盒挑一面(盒子在地上、不是超大件);矮的(病床/推床/桌子)旁邊躺屍體,高的(櫃子)後面躲人
  for (const b of W.boxes) {
    const h = b.maxY - b.minY, sx = b.maxX - b.minX, sz = b.maxZ - b.minZ;
    if (h < 0.4 || h > 2.4 || sx * sz < 0.25 || sx > 3.2 || sz > 3.2) continue;
    const li = L.levelOfY(b.minY + 0.2), fy = L.levels[li].y;
    if (b.minY - fy > 0.35 || b.minY < fy - 0.2) continue;
    let side = (R() * 4) | 0;
    if (h > 1.45) { // 高櫃:要夠寬(那一面 ≥ 1.1m)才藏得住整個人;挑最寬的一面
      if (Math.max(sx, sz) < 1.1) continue;
      side = sz >= sx ? (R() < 0.5 ? 0 : 1) : (R() < 0.5 ? 2 : 3);
    }
    const nx = side === 0 ? 1 : side === 1 ? -1 : 0, nz = side === 2 ? 1 : side === 3 ? -1 : 0;
    const x = nx ? (nx > 0 ? b.maxX + 0.5 : b.minX - 0.5) : (b.minX + b.maxX) / 2, z = nz ? (nz > 0 ? b.maxZ + 0.5 : b.minZ - 0.5) : (b.minZ + b.maxZ) / 2;
    if (h < 1.15) { const s = add(corpse, li, x, z, Math.atan2(-nz, nx) + (R() < 0.5 ? Math.PI : 0), 'bed'); if (s) { s.nx = nx; s.nz = nz; } } // nx/nz:離開家具的方向(習慣群:面向/背靠家具)
    else if (h > 1.45) add(cover, li, x, z, Math.atan2(nx, nz), 'tall');
  }
  for (const list of [cover, corpse]) for (let i = list.length - 1; i >= 0; i--) if (list[i].corridor && list[i].kind === 'bed') list.splice(i, 1);
  // 天花板:破洞 / 下垂的板(夾層是黑的)
  const ceilOk = (li, x, z) => {
    const c = Math.floor(x / 2), r = Math.floor(z / 2);
    if (!plain(li, c, r)) return null;
    const zn = zoneOk(li, c, r);
    if (!zn || zn.ceil === 'vault' || zn.theme === 'stairwell') return null;
    const fy = L.levels[li].y, h = W.ceilAt(x, z, fy) - fy;
    if (!(h > 3.0 && h < 3.65) || !nodeOk(li, x, z)) return null;
    return { zn, h };
  };
  for (const k of (K && K.ceilings) || []) {
    if (k.kind !== 'hole' && k.kind !== 'sag') continue;
    const q = ceilOk(k.li, k.x, k.z);
    if (!q || Math.abs(k.y - L.levels[k.li].y - q.h) > 0.1) continue;
    ceil.push({ li: k.li, x: k.x, y: L.levels[k.li].y, z: k.z, ceilH: q.h, kind: k.kind, gi: -1, busy: null, usedT: -1e9, dark: lit(k.li, k.x, k.z) < 0.55, yaw: R() * Math.PI * 2 });
  }
  // 通風格柵:走廊每段、房間偶爾一個;對齊天花板分格中心,避開燈具、破洞
  const T3 = 2 / 3;
  for (let li = 0; li < L.levels.length; li++) for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (!plain(li, c, r)) continue;
    const zn = zoneOk(li, c, r);
    if (!zn || R() > (zn.theme === 'corridor' ? 0.075 : 0.1)) continue;
    const o = [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2]][(R() * 5) | 0];
    const x = c * 2 + (o[0] + 0.5) * T3, z = r * 2 + (o[1] + 0.5) * T3;
    if (fixNear(li, x, z, 0.95)) continue;
    let far = true;
    for (const g of grilles) if (g.li === li && Math.abs(g.x - x) + Math.abs(g.z - z) < 6) { far = false; break; }
    if (far) for (const k of ceil) if (k.li === li && Math.abs(k.x - x) + Math.abs(k.z - z) < 1.4) { far = false; break; }
    if (!far) continue;
    const q = ceilOk(li, x, z);
    if (!q) continue;
    const gi = grilles.length;
    grilles.push({ li, x, y: L.levels[li].y + q.h, z, rot: ((R() * 2) | 0) * (Math.PI / 2) });
    ceil.push({ li, x, y: L.levels[li].y, z, ceilH: q.h, kind: 'grille', gi, busy: null, usedT: -1e9, dark: lit(li, x, z) < 0.55, yaw: R() * Math.PI * 2 });
  }
  return { cover, corpse, ceil, grilles };
}

// 屍體姿勢:牆角癱坐,其他趴/仰躺;爬行者一律趴
const corpsePose = (kind, type) => (type === 'crawler' ? POSE.lie : kind === 'corner' ? POSE.slump : Math.random() < 0.55 ? POSE.lie : POSE.supine);

class Ambush {
  constructor(g) {
    this.g = g;
    this.world = null;
    this.ready = false;
    this.stats = { cover: 0, drop: 0, corpse: 0, fired: 0, scares: 0, quiet: 0, spoiled: 0, wrongDir: 0, hunts: 0, released: 0, denied: 0, timeouts: 0, relocated: 0, decoys: 0, spots: 0, corpseSpots: 0, ceil: 0, grilles: 0, habit: 0, habitWoke: 0, habitDoor: 0, habitLeft: 0, habitJoin: 0 };
    this.slots = []; // 虛擬埋伏(房主):{ id, kind:'cover'|'drop', type, spot, t0, maxT, R, seenT, spoiled, relT }
    this.log = []; // 現身紀錄(測試/除錯)
    this.lastTrig = -1e9; this.blockT = -1e9; this.round = -1; this.roundT0 = 0; this.per = { cover: 0, drop: 0, corpse: 0 }; this.nextRes = 0;
    this.acc = 0; this.hintAcc = 0; this.relT = 0; this._huntAt = 0; this._huntReq = -9; this._sid = 1;
    this.shot = { t: -9, o: new THREE.Vector3(), d: new THREE.Vector3() };
    this.mv = { x: 0, z: 0 };
    this.decoys = []; this.flick = []; this._tl = []; this._pl = []; this.nHidden = 0; this.cpools = [];
    this.rHints = []; this.hints = new Map(); this._net = null; this._sendT = 0; this._sentKey = '';
    this._mat = null;
    this.habit = { round: -1, want: 0, n: 0, at: 0, fail: 0, woke: 0, spared: 0, left: 0 }; // 習慣群(休息時)
    this._hookCombat();
    try { this._build(); } catch (e) { console.warn('[ambush] 埋伏點建立失敗', e); }
  }
  get reserved() { return this.slots.length; } // 預留中(還沒現身)的數量:flow 出怪時扣掉,回合結束要等牠們

  // ---- 射線目標:還在天花板夾層裡的不算(打不到、刀也砍不到),假屍體算(會流血、抽搐);開槍記下來(槍聲/彈道驚醒) ----
  _hookCombat() {
    const g = this.g, A = this, tg = g._targets;
    if (typeof tg === 'function' && !g._ambTargets) {
      g._ambTargets = true;
      g._targets = function () {
        const base = tg.call(this);
        if (!A.decoys.length && !A.nHidden) return base;
        const out = A._tl;
        out.length = 0;
        for (let i = 0; i < base.length; i++) { const z = base[i]; if (!(z.amb && z.amb.hidden)) out.push(z); }
        for (let i = 0; i < A.decoys.length; i++) out.push(A.decoys[i]);
        return out;
      };
    }
    const w = g.weapons;
    if (w && typeof w.onFire === 'function' && !w._ambShot) {
      const of = w.onFire;
      w.onFire = (...a) => { A._onShot(); return of(...a); };
      w._ambShot = true;
    }
  }
  _onShot() {
    const cam = this.g.camera, s = this.shot;
    cam.updateMatrixWorld();
    cam.getWorldPosition(s.o);
    s.d.set(0, 0, -1).applyQuaternion(cam.quaternion);
    s.t = this.g.time;
  }

  _build() {
    const g = this.g, W = g.world;
    this.world = W;
    const fixtures = g.hospital?.lights?.fixtures || [];
    this.fixtures = fixtures;
    const r = buildSpots(W, g.hospital?.K, fixtures);
    this.cover = r.cover; this.corpse = r.corpse; this.ceil = r.ceil; this.grilles = r.grilles;
    this.props = createAmbushProps(g, W.layout, r.grilles, W.layout.vents || []);
    this.props.onDrip = (key, p) => { this.props.splat(key, 0.014); const lp = g.player.pos; if (Math.abs(lp.x - p.x) + Math.abs(lp.z - p.z) < 9) ambushSfx('drip', p); };
    Object.assign(this.stats, { spots: r.cover.length, corpseSpots: r.corpse.length, ceil: r.ceil.length, grilles: r.grilles.length });
    // 第一次在建構時就加進場景(開機預編譯會一起編);之後換地圖重建時自己在背景預編譯
    if (this._built) precompile(g, this.props.group).catch(() => {});
    this._built = true;
    this.ready = true;
  }

  // ---- 設定 / 節奏 ----
  level() {
    let s = null;
    try { s = this.g.horror?.director?.level || null; } catch { s = null; }
    if (!s) { try { s = settings.get('scare') ?? null; } catch { s = null; } }
    return INT[s] ? s : 'normal';
  }
  I() { return INT[this.level()]; }
  cd() { const n = Math.max(1, this.g.round | 0); return (60 - 20 * clamp((n - 1) / 8, 0, 1)) * this.I().cd; }
  _host() { const n = this.g.net; return !n || !!n.isHost; }
  _players() {
    const out = this._pl;
    out.length = 0;
    for (const p of this.g.players) if (p && p.pos && p.alive !== false && !p.downed) out.push(p);
    if (!out.length) out.push(this.g.player);
    return out;
  }

  // ======================= 每幀(flow.updateRound 開頭呼叫,遊戲中、各端都跑) =======================
  update(dt) {
    const g = this.g;
    if (g.world !== this.world || !this.ready) { if (this.ready) this.dispose(); try { this._build(); } catch (e) { console.warn('[ambush]', e); return; } }
    if (g.round !== this.round) this._newRound();
    this._netHook();
    const p = g.player, k = Math.min(1, dt * 0.9);
    this.mv.x += ((p.vx || 0) - this.mv.x) * k; this.mv.z += ((p.vz || 0) - this.mv.z) * k; // 玩家最近的前進方向(「可能經過」)
    this.props.update(dt);
    this._tickFlick();
    this._tickDecoys(dt);
    if (this.decoys.length < (this.decoyWant || 0) && !g.spawnHeld && (this._dT -= dt) <= 0) {
      this._dT = 0.35;
      const s = this._decoySpot();
      if (s) this._addDecoy(s); else if (++this._dFail > 8) this.decoyWant = this.decoys.length;
    }
    let nh = 0;
    for (const z of g.zombies) if (z.amb && z.amb.hidden) nh++;
    this.nHidden = nh;
    this.hintAcc += dt;
    if (this.hintAcc >= 0.08) { this._hints(this.hintAcc); this.hintAcc = 0; }
    if (!this._host()) return;
    // 玩家就在附近的虛擬點每幀檢查(觸發窗口可能只有零點幾秒:從轉角/門口經過)
    if (this.slots.length && g.state === 'playing') {
      let pl = null;
      const fight = g.phase === 'fighting';
      for (let i = this.slots.length - 1; i >= 0; i--) { const s = this.slots[i]; if (s && s.hot && (fight || s.rest)) this._tickSlot(s, pl || (pl = this._players()), g.time); }
    }
    this.acc += dt;
    if (this.acc < 0.25) return;
    const step = this.acc;
    this.acc = 0;
    this._tick(step);
    this._broadcast(step);
  }

  // 房主:每 0.25 秒 — 預留、觸發(掩蔽處/天花板/屍體)、回合收尾、逾時、搬家
  _tick(step) {
    const g = this.g, t = g.time;
    const corpses = [];
    for (const z of g.zombies) if (z.alive && z.amb && z.amb.dormant && !z._proxy && !z.amb.decoy) corpses.push(z);
    if (!this.slots.length && !corpses.length) this._huntAt = 0;
    if (g.state !== 'playing') return;
    if (g.phase !== 'fighting') { this._tickRest(step, corpses, t); return; }
    // 場上沒有活動的殭屍、只剩預留/裝死的(flow 呼叫 hunt()):預留的放回佇列照常出怪、裝死的起身 → 回合不會卡住
    if (this._huntAt && t - this._huntReq > 0.4) this._huntAt = 0;
    if (this._huntAt && t >= this._huntAt) {
      this._huntAt = 0;
      this.stats.hunts++;
      this.releaseAll();
      for (const z of corpses) z._ambWake(true);
      return;
    }
    this._reserve(t);
    const pl = this._players();
    for (let i = this.slots.length - 1; i >= 0; i--) { const s = this.slots[i]; if (s) this._tickSlot(s, pl, t); }
    const sh = this.shot, shot = t - sh.t < 0.35 ? sh : null;
    for (const z of corpses) this._tickCorpse(z, pl, t, step, shot);
    this.relT += step;
    if (this.relT >= 1) { this.relT = 0; this._relocate(corpses); }
  }

  // ---- 虛擬埋伏:現身條件 ----
  _tickSlot(s, pl, t) {
    const g = this.g, W = g.world, sp = s.spot;
    if (t - s.t0 > s.maxT) { this._release(s); this.stats.timeouts++; return; }
    let best = null, bd = 1e9;
    for (const p of pl) {
      if (Math.abs(p.pos.y - sp.y) > 1.8) continue;
      const d = Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (s.kind === 'drop') {
      s.hot = !!best && bd <= s.R + 1.5;
      if (!best || bd > s.R) return;
      if (!W.hasLineOfSight(sp.x, sp.y + sp.ceilH - 0.25, sp.z, best.pos.x, best.pos.y + 1.2, best.pos.z)) return;
      if (this._allow('ceilingDrop', best, sp)) this._fire(s, null, best);
      return;
    }
    s.hot = !!best && bd <= s.R + 1.5;
    if (!best || bd > s.R + 3) return;
    const hs = this._coverPos(sp);
    if (!hs) return;
    // 掩蔽點有人看得到:絕不在那裡現身;近距離被看到(從錯的方向繞過來)= 這個點作廢,稍後搬家
    if (this._hSeen(hs, sp.y, pl)) {
      s.seenT = t;
      if (bd < s.R + 2.5 && !s.spoiled) { s.spoiled = true; this.stats.spoiled++; }
      return;
    }
    if (s.spoiled || bd > s.R + (this.g.story?.radio?.loud || 0) || bd < 1.2 || t - s.seenT < 4) return; // [story] 收音機開著,聽得到你
    const E = this._emerge(hs, sp.y, best, s.R);
    if (!E) { s.wrong = (s.wrong || 0) + 1; if (s.wrong === 1) this.stats.wrongDir++; return; }
    if (this._allow(s.rest ? 'habit' : 'ambush', best, sp)) this._fire(s, E, best, hs);
  }
  // 現身位置:從 H 往「離開路線」的反方向再退 0.3m(更深的掩蔽),退不了就用 H;順便記下路線方向(現身時面向)
  _coverPos(sp) {
    const W = this.g.world, y = sp.y, o = this._fo || (this._fo = { x: 0, z: 0 }), c = this._cp || (this._cp = { x: 0, z: 0, fx: 0, fz: 1 });
    const f = W.flowDir(sp.x, y + 0.1, sp.z, o, 1);
    if (!f) return null;
    c.fx = f.x; c.fz = f.z; c.x = sp.x; c.z = sp.z;
    const bx = sp.x - f.x * 0.3, bz = sp.z - f.z * 0.3;
    if (W._navFree ? W._navFree(bx, bz, y, 0.3) : W.isNode(bx, y, bz)) { c.x = bx; c.z = bz; }
    return c;
  }
  // 掩蔽點(c = {x, z},地面 y)整個身體範圍是否有任何玩家看得到(每人 19 條視線;霧外 35m 不算)
  _hSeen(c, y, pl) {
    const W = this.g.world;
    for (const p of pl) {
      const ex = p.pos.x, ey = p.pos.y + (p.eyeH || 1.6), ez = p.pos.z;
      if (Math.abs(c.x - ex) + Math.abs(c.z - ez) > 50 || Math.hypot(c.x - ex, y - p.pos.y, c.z - ez) > 35) continue;
      for (const q of HPTS) if (W.hasLineOfSight(ex, ey, ez, c.x + q[0], y + q[1], c.z + q[2])) return p;
    }
    return null;
  }
  // 現身點 E:沿導航場從掩蔽點走向玩家(繞出轉角、穿過門口),3m 內第一個觸發的玩家看得到的點;路線總長要在觸發距離內。沒有 = 方向不對
  _emerge(c, y, p, R) {
    const W = this.g.world, px = p.pos.x, pz = p.pos.z, ey = p.pos.y + (p.eyeH || 1.6);
    const fd = W.flowDistance(c.x, y + 0.1, c.z);
    if (!Number.isFinite(fd) || fd > R + 2.5) return null;
    const o = this._fo2 || (this._fo2 = { x: 0, z: 0 });
    let x = c.x, z = c.z;
    for (let i = 1; i <= 12; i++) {
      const f = W.flowDir(x, y + 0.1, z, o, 1);
      if (!f) break;
      x += f.x * 0.25; z += f.z * 0.25;
      if (i >= 2 && W.hasLineOfSight(px, ey, pz, x, y + 1.2, z)) return { x, z, d: i * 0.25 };
    }
    return null;
  }

  // 現身:在 H(或天花板夾層)生成一隻殭屍(flow.spawnZombie,扣掉預留的 toSpawn、套用回合血量、連線照常同步)
  _fire(s, E, p, hs) {
    const g = this.g, sp = s.spot;
    const i = this.slots.indexOf(s);
    if (i >= 0) this.slots.splice(i, 1);
    if (sp.busy === s) sp.busy = null;
    sp.usedT = g.time;
    g._ambAt = hs ? { x: hs.x, y: sp.y, z: hs.z, yaw: Math.atan2(hs.fx, hs.fz) } : { x: sp.x, y: sp.y, z: sp.z, yaw: sp.yaw };
    this._mat = { s, E, p };
    let z = null;
    try { z = g.spawnZombie(s.type); } catch (e) { console.warn('[ambush]', e); } finally { g._ambAt = null; this._mat = null; }
    if (!z || !z.amb) return null;
    if (s.rest) z._habit = 'taboo'; // 休息時的(禁忌的後果):照習慣群的規則(不進店、下一波醒著就加入)
    this.lastTrig = g.time;
    this.blockT = g.time + 8; // 不會兩隻同時衝出來
    this.stats.fired++; this.stats.scares++;
    this.log.push({ t: +g.time.toFixed(2), kind: s.kind, spot: sp.kind, type: z.type, x: r2(z.pos.x), y: sp.y, z: r2(z.pos.z), E: E ? [r2(E.x), r2(E.z), E.d] : null, by: p === g.player ? 'local' : p?.id ?? '?', d: r2(Math.hypot(p.pos.x - sp.x, p.pos.z - sp.z)) });
    if (this.log.length > 60) this.log.shift();
    return z;
  }
  _allow(kind, p, pos) {
    const g = this.g, t = g.time, I = this.I();
    if (!I.n || t < this.blockT) return false;
    if ((g.round | 0) <= 1 && t - this.roundT0 < 45 && kind !== 'habit') return false;
    const D = g.horror?.director;
    if (D && typeof D.request === 'function' && (!p || p === g.player || !g.net)) {
      let ok = false;
      try { ok = D.request(kind, { weight: 1, pos }) === true; } catch { ok = false; }
      if (!ok) this.stats.denied++;
      return ok;
    }
    if (t - this.lastTrig < this.cd()) { this.stats.denied++; return false; }
    return true;
  }

  // flow.updateRound:場上沒有活動的殭屍、剩下的都是預留/裝死的 → 2.5 秒後收尾
  hunt() {
    if (!this._host()) return;
    const t = this.g.time;
    if (!this._huntAt || t - this._huntReq > 0.4) this._huntAt = t + 2.5;
    this._huntReq = t;
  }
  // 預留的全部放回出怪佇列(照常在出生點出現,不是埋伏)
  releaseAll() {
    for (let i = this.slots.length - 1; i >= 0; i--) this._release(this.slots[i]);
    if (this.g.spawnTimer > 0.5) this.g.spawnTimer = 0.5;
  }
  _release(s) {
    const i = this.slots.indexOf(s);
    if (i < 0) return;
    this.slots.splice(i, 1);
    if (s.spot.busy === s) s.spot.busy = null;
    if (!s.rest) this.g.queue.unshift(s.type); // 休息時的不是出怪佇列裡的,逾時就算了
    this.stats.released++;
  }
  wakeAll(quiet = true) { for (const z of this.g.zombies) if (z.alive && z.amb && z.amb.dormant && !z._proxy) z._ambWake(quiet); }

  // ---- 預留:從出怪佇列拿一隻(仍算在 toSpawn 裡)放到虛擬的掩蔽點 / 天花板點 ----
  _reserve(t) {
    const g = this.g;
    if (g.spawnHeld || t < this.nextRes || g.net?.pvp) return;
    this.nextRes = t + rand(3, 7);
    const I = this.I();
    if (!I.n) return;
    const n = Math.max(1, g.round | 0);
    if (n === 1 && t - this.roundT0 < 20) return;
    if (t - this.lastTrig < this.cd() * 0.3) return;
    if ((g.queue?.length || 0) < 2) return;
    let armed = this.slots.length;
    for (const z of g.zombies) if (z.alive && z.amb && z.amb.dormant) armed++;
    if (armed >= Math.min(5, (n <= 3 ? 2 : n <= 8 ? 3 : 4) + (I.n > 1.2 ? 1 : 0))) return;
    const cb = Math.round(I.n * (n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4)), db = Math.round(I.n * (n <= 1 ? 0.4 : n <= 4 ? 1 : n <= 8 ? 2 : 3));
    const canC = this.per.cover < cb, canD = this.per.drop < db;
    if (!canC && !canD) return;
    const kinds = canD && (!canC || Math.random() < 0.45) ? ['drop', 'cover'] : ['cover', 'drop'];
    for (const kind of kinds) {
      if (kind === 'drop' ? !canD : !canC) continue;
      const qi = this._queuePick(kind);
      if (qi < 0) continue;
      const spot = this._pick(kind === 'drop' ? this.ceil : this.cover, kind === 'drop');
      if (!spot) continue;
      this._addSlot(kind, g.queue.splice(qi, 1)[0], spot, t);
      return;
    }
  }
  // 佇列前段挑一隻適合的類型(天花板優先狂奔者/爬行者)
  _queuePick(kind) {
    const q = this.g.queue || [];
    const n = Math.min(q.length, 12);
    if (kind === 'drop') { for (let i = 0; i < Math.min(n, 8); i++) if (q[i] === 'runner' || q[i] === 'crawler') return i; }
    const ok = kind === 'drop' ? DROP_TYPES : COVER_TYPES;
    for (let i = 0; i < n; i++) if (ok.has(q[i])) return i;
    return -1;
  }
  _addSlot(kind, type, spot, t, opt = {}) {
    const s = { id: this._sid++, kind, type, spot, t0: t, maxT: opt.maxT ?? rand(90, 140), R: opt.R ?? (kind === 'drop' ? rand(1.7, 3.0) : rand(3.0, 4.6)), seenT: -9, spoiled: false, relT: t, wrong: 0 };
    spot.busy = s;
    this.slots.push(s);
    this.per[kind]++;
    this.stats[kind]++;
    return s;
  }

  // ======================= 出怪時(flow.spawnZombie):現身中的設定,或把一般出怪改成「裝死的屍體」 =======================
  onSpawn(z) {
    if (!z || !this.ready || z._proxy) return;
    if (this._mat) { this._setupFired(z, this._mat); return; }
    if (!this._host()) return;
    const g = this.g;
    if (g.net?.pvp || g.phase !== 'fighting' || g.state !== 'playing' || !CORPSE_TYPES.has(z.type)) return;
    const I = this.I();
    if (!I.n) return;
    const n = Math.max(1, g.round | 0);
    if (n < 2 || g.time - this.lastTrig < this.cd() * 0.3) return;
    let armed = this.slots.length;
    for (const o of g.zombies) if (o.alive && o.amb && o.amb.dormant) armed++;
    if (armed >= Math.min(5, (n <= 3 ? 2 : n <= 8 ? 3 : 4) + (I.n > 1.2 ? 1 : 0))) return;
    if (this.per.corpse >= Math.round(I.n * Math.min(3, 1 + Math.floor(n / 4))) || Math.random() > 0.35) return;
    this._armCorpse(z);
  }
  _setupFired(z, m) {
    const g = this.g, s = m.s, cover = s.kind === 'cover';
    const code = cover ? (Math.random() < 0.55 ? POSE.crouch : POSE.stand) : POSE.hidden;
    z.vel.set(0, 0, 0);
    z.amb = makeAmb(z, code, g.world, { spot: s.spot, t0: g.time, R: s.R, fx: null });
    z.amb.g = g;
    z.amb.dormant = false;
    z.amb.via = cover ? m.E : null;
    if (!cover) z.amb.hidden = true;
    z.go(cover ? BURST : DROP);
    z.alerted = true; z.spotted = true; // 牠自己會叫,不再補「發現玩家」的叫聲
    z.vp.x = z.pos.x; z.vp.y = z.pos.y + (cover ? 1 : s.spot.ceilH); z.vp.z = z.pos.z;
  }
  _armCorpse(z, opt) {
    const s = opt?.spot || this._pick(this.corpse, false, opt);
    if (!s) return false;
    this._place(z, s, corpsePose(s.kind, z.type), s.yaw);
    this.per.corpse++; this.stats.corpse++;
    return true;
  }
  // 裝死:擺成屍體(凍結),下面一灘血(o.pool === false:站著/跪著的習慣群不要血泊)
  _place(z, s, code, yaw, o = {}) {
    const g = this.g, old = z.amb;
    if (old) { if (old.frozen) z._ambThaw(); if (old.spot && old.spot.busy === z) old.spot.busy = null; if (old.pool) { this.props.removePool(old.pool); this.cpools = this.cpools.filter((q) => q !== old.pool); } }
    z.pos.set(s.x, s.y, s.z);
    z.vel.set(0, 0, 0);
    z.heading = yaw;
    z.root.position.copy(z.pos);
    z.amb = makeAmb(z, code, g.world, { spot: s, t0: old ? old.t0 : g.time, R: rand(3.0, 4.8), fx: LURK });
    z.amb.g = g;
    z.amb.maxT = rand(100, 150);
    if (o.pool !== false) { z.amb.pool = this.props.pool(s.x, s.y, s.z, rand(1.1, 1.6)); this.cpools.push(z.amb.pool); }
    s.busy = z;
    z.go(LURK);
    z._ambFreeze();
    z.vp.x = s.x; z.vp.y = s.y + 0.6; z.vp.z = s.z;
    z._sx = s.x; z._sy = s.y; z._sz = s.z; z._noProg = 0; z._farT = 0;
  }

  // ---- 裝死的屍體:被打到 / 旁邊開槍 / 經過、轉身背對 → 起身(節奏不允許時維持裝死,貼身才安靜起身) ----
  _tickCorpse(z, pl, t, step, shot) {
    const g = this.g, W = g.world, a = z.amb, sh = this.shot;
    if (!a || !a.dormant) return;
    if (a.hurt) { this._wakeCorpse(z, true, null); return; }
    if (t - a.t0 > a.maxT) { z._ambWake(true); this.stats.timeouts++; return; }
    const cx = z.pos.x, cy = z.pos.y + (POSE_H[a.code] || 0.6), cz = z.pos.z;
    if (shot) {
      const ox = cx - sh.o.x, oy = cy - sh.o.y, oz = cz - sh.o.z, along = ox * sh.d.x + oy * sh.d.y + oz * sh.d.z;
      const near = ox * ox + oy * oy + oz * oz < 4.5 * 4.5;
      const miss = along > 0 && along < 45 ? Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - along * along)) : 99;
      if ((near || miss < 1.5) && W.hasLineOfSight(sh.o.x, sh.o.y, sh.o.z, cx, cy, cz)) { this._wakeCorpse(z, true, g.player); return; }
    }
    if (this._heard(z.pos, a.R + 3)) { this._wakeCorpse(z, false, g.player); if (!a.dormant) return; } // 附近有大聲的聲音(槍聲、甩門、衝刺落地)
    let best = null, bd = 1e9;
    for (const p of pl) {
      if (Math.abs(p.pos.y - z.pos.y) > 1.8) continue;
      const d = Math.hypot(p.pos.x - cx, p.pos.z - cz);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best || bd > a.R + 0.8) { a.stare = Math.max(0, a.stare - step); return; }
    const p = best, ey = p.pos.y + (p.eyeH || 1.6);
    if (!W.hasLineOfSight(p.pos.x, ey, p.pos.z, cx, cy, cz)) return;
    if (bd < 1.35) { this._wakeCorpse(z, true, p); return; } // 貼上來了:不管節奏都得起來
    const dx = cx - p.pos.x, dz = cz - p.pos.z, dl = Math.hypot(dx, dz) || 1;
    const look = (-dx * Math.sin(p.yaw || 0) - dz * Math.cos(p.yaw || 0)) / dl; // 1 = 正眼看著牠
    if (look > 0.9 && bd > 2) { a.stare += step; if (a.stare < 4) return; } // 被盯著:繼續當屍體(盯太久也會撲)
    const loud = g.story?.radio?.loud || 0; // [story] 收音機開著,牠們也聽得到
    if (bd <= a.R + loud || (look < -0.2 && bd <= a.R + 0.8 + loud)) this._wakeCorpse(z, false, p);
  }
  _wakeCorpse(z, force, p) {
    const loud = this._allow(z.amb?.habit ? 'habit' : 'ambush', p, z.pos);
    if (!loud && !force) return false;
    if (z.amb?.habit) { this.habit.woke++; this.stats.habitWoke++; try { this.g.flags?.inc?.('h.habit.woke'); } catch { /* 略 */ } }
    z._ambWake(!loud);
    if (loud) { this.lastTrig = this.g.time; this.stats.scares++; } else this.stats.quiet++;
    this.blockT = this.g.time + 8;
    return true;
  }
  // 噪音(game.noise,flow 的環形緩衝;還沒有就略過):裝死的在 r 內聽到最近 maxAge 秒的聲音
  _heard(pos, r, maxAge = 1.2) {
    const N = this.g.noise;
    if (!N || typeof N.near !== 'function') return false;
    let q = null;
    try { q = N.near(pos, r, maxAge); } catch { return false; }
    return !!q && (q.length === undefined || q.length > 0);
  }

  // 挑位置:路徑距離 8~34m、同層優先、玩家前進方向、暗處;前幾名裡第一個沒人看得到的
  _pick(list, perch, opt = {}) {
    const g = this.g, W = g.world, L = W.layout, pl = this._players(), lp = g.player, mv = this.mv, ml = Math.hypot(mv.x, mv.z);
    const lo = opt.lo ?? 8, hi = opt.hi ?? 34;
    const cand = [];
    const pli = pl.map((p) => L.levelOfY(p.pos.y + 0.3));
    for (const s of list) {
      if (s.busy || s.decoy || g.time - s.usedT < 75 || (opt.kind && s.kind !== opt.kind) || s === opt.not || (opt.skip && opt.skip(s))) continue;
      let ed = Infinity, dl = 9;
      for (let i = 0; i < pl.length; i++) { const p = pl[i], d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); if (d < ed) ed = d; const q = Math.abs(s.li - pli[i]); if (q < dl) dl = q; }
      if (dl > 1 || ed < (opt.minE ?? 6) || ed > hi + 4) continue;
      if (this._nearArmed(s, 9)) continue;
      const fd = W.flowDistance(s.x, s.y + 0.1, s.z);
      if (!Number.isFinite(fd) || fd < lo || fd > hi) continue;
      let w = (dl === 0 ? 3 : 0.5) * (perch ? (s.kind === 'grille' ? 1 : 1.2) : KIND_W[s.kind] || 1) * (s.dark ? 1.6 : 1);
      w *= fd < 12 ? 0.8 : fd > 26 ? 0.6 : 1.2;
      if (ml > 0.3) { const dx = s.x - lp.pos.x, dz = s.z - lp.pos.z, d = Math.hypot(dx, dz) || 1, f = (dx * mv.x + dz * mv.z) / (d * ml); w *= 0.35 + 0.65 * Math.max(0, f) + (f > 0.7 ? 0.5 : 0); }
      if (opt.w) { w *= opt.w(s); if (!(w > 0)) continue; }
      s._w = w * (0.6 + Math.random() * 0.8);
      cand.push(s);
    }
    cand.sort((a, b) => b._w - a._w);
    for (let i = 0; i < Math.min(14, cand.length); i++) if (!this._seen(cand[i], perch)) return cand[i];
    return null;
  }
  _seen(s, perch) {
    const W = this.g.world;
    for (const p of this._players()) {
      const ex = p.pos.x, ey = p.pos.y + (p.eyeH || 1.6), ez = p.pos.z;
      if (Math.hypot(s.x - ex, s.z - ez) > 50) continue;
      if (perch) { if (W.hasLineOfSight(ex, ey, ez, s.x, s.y + s.ceilH - 0.12, s.z)) return true; continue; }
      if (W.hasLineOfSight(ex, ey, ez, s.x, s.y + 0.35, s.z) || W.hasLineOfSight(ex, ey, ez, s.x, s.y + 1.3, s.z)) return true;
    }
    return false;
  }
  _nearArmed(s, r) {
    for (const q of this.slots) { const o = q.spot; if (o !== s && o.li === s.li && Math.abs(o.x - s.x) + Math.abs(o.z - s.z) < r) return true; }
    for (const z of this.g.zombies) {
      const a = z.amb;
      if (!z.alive || !a || !a.dormant || !a.spot || a.spot === s) continue;
      if (a.spot.li === s.li && Math.abs(z.pos.x - s.x) + Math.abs(z.pos.z - s.z) < r) return true;
    }
    for (const d of this.decoys) if (Math.abs(d.pos.x - s.x) + Math.abs(d.pos.z - s.z) < 1.5 && Math.abs(d.pos.y - s.y) < 1) return true;
    return false;
  }

  // 搬家(每秒):作廢的點(被看過)、離所有玩家路徑 40m 以上超過 20 秒的 → 換到玩家前方新的點;屍體只在原地與新位置都沒人看得到時才搬
  _relocate(corpses) {
    const g = this.g, W = g.world, t = g.time;
    for (const s of this.slots) {
      const far = t - s.relT > 20 && !(W.flowDistance(s.spot.x, s.spot.y + 0.1, s.spot.z) < 40);
      if (!(s.spoiled && t - s.seenT > 1.2) && !far) continue;
      s.relT = t;
      const n = this._pick(s.kind === 'drop' ? this.ceil : this.cover, s.kind === 'drop', { not: s.spot });
      if (!n) { if (s.spoiled) this._release(s); return; }
      if (s.spot.busy === s) s.spot.busy = null;
      s.spot.usedT = t;
      s.spot = n; n.busy = s; s.spoiled = false; s.seenT = -9; s.wrong = 0;
      this.stats.relocated++;
      return;
    }
    for (const z of corpses) {
      const a = z.amb;
      if (t - (a.relT || a.t0) < 20) continue;
      const fd = W.flowDistance(z.pos.x, z.pos.y + 0.1, z.pos.z);
      if (Number.isFinite(fd) && fd < 40) continue;
      a.relT = t;
      if (this._seen(a.spot || { x: z.pos.x, y: z.pos.y, z: z.pos.z }, false)) continue;
      const s = this._pick(this.corpse, false);
      if (!s) continue;
      const t0 = a.t0;
      this._place(z, s, corpsePose(s.kind, z.type), s.yaw);
      z.amb.t0 = t0; z.amb.relT = t;
      this.stats.relocated++;
      return;
    }
  }

  // ======================= 連線:房主把虛擬點(位置)廣播給隊友,隊友只用來放線索 =======================
  _netHook() {
    const s = this.g.net;
    if (s === this._net) return;
    this._net = s;
    this.rHints = [];
    if (s && typeof s.on === 'function') {
      s.on('amb', (d, f) => {
        if (s.isHost || f !== s.hostSlot || !Array.isArray(d)) return;
        this.rHints = d.filter((q) => Array.isArray(q) && q.length >= 5 && q.slice(1).every(Number.isFinite)).slice(0, 12).map((q) => ({ kind: q[0] === 1 ? 'drop' : 'cover', x: q[1], y: q[2], z: q[3], ceilH: q[4] }));
      });
    }
  }
  _broadcast(step) {
    const s = this.g.net;
    if (!s || !s.isHost || !s.remotes?.size) return;
    this._sendT -= step;
    const list = this.slots.map((q) => [q.kind === 'drop' ? 1 : 0, r2(q.spot.x), r2(q.spot.y), r2(q.spot.z), r2(q.spot.ceilH || 0)]);
    const key = list.join(';');
    if (key === this._sentKey && this._sendT > 0) return;
    this._sentKey = key; this._sendT = 4; // 有變化就送,沒變化每 4 秒補一次(新加入的隊友)
    s.send('amb', list);
  }

  // ======================= 狀態切換的特效(兩端都跑;只影響本機玩家的畫面/聲音) =======================
  fx(z, kind, a) {
    const g = this.g, lp = g.player;
    if (!a || !lp) return;
    const x = z.pos.x, fy = z.pos.y, zz = z.pos.z, ceilY = fy + a.ceilH;
    const d = Math.hypot(lp.pos.x - x, lp.pos.z - zz), same = Math.abs(lp.pos.y - fy) < 2.6;
    const lvl = this.I(), near = same && d < 12 && lvl.n > 0, k = clamp(1.15 - d / 11, 0.2, 1) * Math.min(1.15, 0.55 + 0.45 * lvl.n);
    const vp = z.vp;
    vp.x = x; vp.z = zz;
    const loudVoice = (pos) => { if (z.type === 'runner' || z.type === 'crawler') sfx.shriek(pos); else sfx.zAttack(z.type, pos); };
    const notify = (kd) => { try { g.horror?.director?.notify?.(kd, { weight: 1, pos: z.pos }); } catch { /* 導演可有可無 */ } };
    if (kind === 'burst') { // 現身/彈起的瞬間:尖叫(在轉角後面也聽得到)+ 刺擊
      vp.y = fy + 0.9;
      if (a.quiet) { sfx.zAlert(z.type, vp); return; }
      loudVoice(vp);
      if (!near) return;
      ambushSfx('sting', null, k);
      this._flicker(x, fy, zz, 0.7);
      notify(z._habit ? 'habit' : 'ambush'); // 習慣群(休息時):導演另外算預算
    } else if (kind === 'out') { // 衝出掩蔽:鏡頭一震
      if (same && d < 8) { lp.kick?.(0.025 + 0.03 * k, 0.06); lp.addShake?.(0.22 + 0.22 * k); }
    } else if (kind === 'drop') {
      vp.y = ceilY;
      const gi = a.gi ?? (a.gi = this._grilleAt(x, ceilY, zz));
      if (gi >= 0) { if (!this.props.isOpen(gi)) this.props.breakGrille(gi); }
      else this.props.breakTiles(x, ceilY, zz);
      ambushSfx('crash', { x, y: ceilY - 0.2, z: zz });
      g.burst?.(_v.set(x, ceilY - 0.08, zz), _down, 'dust', 14, fy);
      if (a.quiet || !near) return;
      ambushSfx('sting', null, k * 0.85);
      this._flicker(x, fy, zz, 0.45);
      notify('ceilingDrop');
    } else if (kind === 'land') {
      vp.y = fy + 0.6;
      sfx.thud(vp, false);
      g.burst?.(_v.set(x, fy + 0.06, zz), _up, 'dust', 12, fy);
      if (same && d < 9) lp.addShake?.(0.4 * (1 - d / 9));
      if (!a.quiet) loudVoice(vp); else sfx.zAlert(z.type, vp);
    }
  }
  _grilleAt(x, y, z) {
    const G = this.grilles || [];
    for (let i = 0; i < G.length; i++) { const q = G[i]; if (Math.abs(q.x - x) < 0.3 && Math.abs(q.z - z) < 0.3 && Math.abs(q.y - y) < 0.6) return i; }
    return -1;
  }
  // 附近的燈一陣狂閃(燈具的 ov 倍率,結束時還原;不動燈的 visible/投影)
  _flicker(x, y, z, dur) {
    let best = null, bd = 49;
    for (const f of this.fixtures || []) {
      if (f.state === 2 || Math.abs(f.y - y - 2.5) > 2) continue;
      const q = (f.x - x) ** 2 + (f.z - z) ** 2;
      if (q < bd) { bd = q; best = f; }
    }
    if (best && !this.flick.some((q) => q.f === best)) this.flick.push({ f: best, t1: this.g.time + dur });
  }
  _tickFlick() {
    const t = this.g.time;
    for (let i = this.flick.length - 1; i >= 0; i--) {
      const q = this.flick[i];
      if (t >= q.t1) { q.f.ov = 1; this.flick.splice(i, 1); continue; }
      q.f.ov = Math.random() < 0.55 ? 0.05 : 0.35 + Math.random() * 0.6;
    }
  }

  // ======================= 線索(本機):天花板上的滴血、抓刮、格柵晃動;轉角後的喘息;屍體的呼吸 =======================
  _hints(dt) {
    const g = this.g, lp = g.player.pos;
    const src = this._host() ? this.slots : this.rHints, live = this._hintLive || (this._hintLive = new Set());
    live.clear();
    for (const q of src) {
      const sp = q.spot || q, kind = q.kind, key = `${kind}:${sp.x},${sp.y},${sp.z}`;
      live.add(key);
      let h = this.hints.get(key);
      if (!h) this.hints.set(key, (h = { x: sp.x, y: sp.y, z: sp.z, ceilH: sp.ceilH || 3.4, gi: kind === 'drop' ? this._grilleAt(sp.x, sp.y + (sp.ceilH || 3.4), sp.z) : -1, dripT: rand(0.2, 1), scrT: rand(1.5, 4), jig: 0, brT: rand(2, 5) }));
      const dx = sp.x - lp.x, dz = sp.z - lp.z, d = Math.hypot(dx, dz);
      if (Math.abs(sp.y - lp.y) > 2.5 || d > 16) { if (h.jig > 0) { h.jig = 0; this.props.jiggle(h.gi, 0); } continue; }
      if (kind === 'drop') {
        const cy = sp.y + h.ceilH;
        if ((h.dripT -= dt) <= 0) { h.dripT = rand(0.7, 1.7); this.props.drip(h, sp.x + rand(-0.12, 0.12), cy - 0.04, sp.z + rand(-0.12, 0.12)); }
        if ((h.scrT -= dt) <= 0 && d < 12) {
          h.scrT = rand(4, 9);
          ambushSfx(h.gi >= 0 && Math.random() < 0.5 ? 'rattle' : 'scratch', { x: sp.x + rand(-0.5, 0.5), y: cy + 0.25, z: sp.z + rand(-0.5, 0.5) });
          if (h.gi >= 0) h.jig = 0.5;
          if (Math.random() < 0.5) g.burst?.(_v.set(sp.x, cy - 0.04, sp.z), _down, 'dust', 3, sp.y);
        }
        if (h.jig > 0) { h.jig -= dt; this.props.jiggle(h.gi, h.jig > 0 ? 1 : 0); }
      } else if (d < 7 && d > 1.5 && (h.brT -= dt) <= 0) { // 轉角/門後傳來的喘息(隔牆會被悶住)
        h.brT = rand(5, 9);
        ambushSfx('breath', { x: sp.x, y: sp.y + 1.2, z: sp.z });
      }
    }
    for (const [k, h] of this.hints) if (!live.has(k)) { if (h.jig > 0) this.props.jiggle(h.gi, 0); this.hints.delete(k); }
    const rest = g.phase === 'shop' || g.phase === 'break';
    for (const z of g.zombies) {
      const a = z.amb;
      if (!a || !a.dormant || !z.alive || a.decoy) continue;
      const d = Math.hypot(z.pos.x - lp.x, z.pos.z - lp.z);
      if (rest && !a.beat && d > 9 && d < 22 && Math.abs(z.pos.y - lp.y) < 2.5 && g.time >= (a.beatT || 0)) this._restBeat(z, a);
      if (!isCorpse(a.code) || Math.abs(z.pos.y - lp.y) > 2.5 || d > 4.2) continue;
      a.brT = (a.brT ?? rand(0.5, 2.5)) - dt;
      if (a.brT <= 0) { a.brT = rand(3.5, 6.5); ambushSfx('breath', { x: z.pos.x, y: z.pos.y + 0.5, z: z.pos.z }); }
    }
  }

  // ======================= 習慣群(休息時;房主) =======================
  // 每 0.25 秒(休息中):招魂燈熄了 3~6 秒後,在玩家可能走的路上放幾具;裝死的照常判定喚醒;醒著的不進店
  _tickRest(step, corpses, t) {
    const g = this.g, H = this.habit;
    if (g.net?.pvp || !(g.phase === 'shop' || g.phase === 'break')) return;
    if (H.round !== g.round) { H.round = g.round; H.n = 0; H.fail = 0; H.at = t + rand(3, 6); H.want = this._habitWant(); }
    if (H.n < H.want && t >= H.at && !g.story?.ending?.active && !g.motion?.busy) {
      H.at = t + 0.6;
      if (this._habitPlace()) H.n++; else if (++H.fail > 8) H.want = H.n;
    }
    if ((!corpses.length && !H.n && !this.slots.length) || g.story?.ending?.active) return; // 結局進行中:裝死的就一直裝死
    const pl = this._players(), sh = this.shot, shot = t - sh.t < 0.35 ? sh : null;
    for (const z of corpses) this._tickCorpse(z, pl, t, step, shot);
    for (let i = this.slots.length - 1; i >= 0; i--) { const s = this.slots[i]; if (s && s.rest) this._tickSlot(s, pl, t); }
    for (const z of g.zombies) if (z._habit && z.alive && !z.amb && !z._proxy) this._habitShop(z);
  }
  // 這次休息放幾具:第 1 次休息 1 具、第 2~4 次 2 具、之後 3 具;驚嚇強度低 = 1、高 = +1(最多 3);關 = 0
  _habitWant() {
    const I = this.I();
    if (!I.n) return 0;
    const n = Math.max(1, this.g.round | 0);
    const k = n <= 1 ? 1 : n <= 4 ? 2 : 3;
    return I.n < 1 ? 1 : I.n > 1.2 ? Math.min(3, k + 1) : k;
  }
  _memorial() {
    const X = this.g.interact, m = X?.get?.('h.ix.memorial');
    if (!m) return null;
    const q = X.where(m);
    return { x: q.x, y: q.y, z: q.z };
  }
  // 生前是誰(N7):用位置與姿勢暗示;沒有新模型
  _role(s, type) {
    const z = s.zone, crawl = type === 'crawler';
    const face = s.nx !== undefined ? Math.atan2(-s.nx, -s.nz) : s.yaw + Math.PI, back = s.nx !== undefined ? Math.atan2(s.nx, s.nz) : s.yaw;
    if (!crawl) {
      const mp = this._mem;
      if (mp && (z === 'f2_corridor' || z === 'f2_icu') && Math.abs(s.y - (mp.y - 1.2)) < 2) { const d = Math.hypot(s.x - mp.x, s.z - mp.z); if (d >= 7 && d <= 22) return { id: 'nurse', code: POSE.stand, yaw: s.kind === 'corner' ? s.yaw + Math.PI : face, pool: false }; } // 護理站旁:面壁站著,像還在值班
      if (s.kind === 'bed' && /^f2_(ward_|icu|peds)/.test(z)) return Math.random() < 0.5 ? { id: 'patient', code: POSE.stand, yaw: face, pool: false } : { id: 'patient', code: POSE.slump, yaw: back, pool: false }; // 站在病床邊 / 靠著病床坐在地上
      if (s.kind === 'bed' && z === 'f1_chapel') return { id: 'pray', code: POSE.crouch, yaw: face, pool: false }; // 跪在長椅前
      if (s.kind === 'bed' && /^f1_(waiting|er|corridor|cafeteria)$/.test(z)) return { id: 'wait', code: POSE.slump, yaw: back, pool: false }; // 靠著候診的長椅坐在地上
    }
    return { id: 'corpse', code: corpsePose(s.kind, type), yaw: s.yaw, pool: true };
  }
  _habitW(s) {
    const g = this.g, mp = this._mem;
    if (mp && Math.abs(s.y - (mp.y - 1.2)) < 2 && Math.hypot(s.x - mp.x, s.z - mp.z) < 6.5) return 0; // 遺照前(收驚的地方)不放
    let w = 1;
    const z = s.zone;
    if ((z === 'f2_corridor' || z === 'f2_icu') && mp) { const d = Math.hypot(s.x - mp.x, s.z - mp.z); if (d >= 7 && d <= 22) w *= 3; }
    if (s.kind === 'bed' && /^(f2_(ward_|icu|peds)|f1_(chapel|waiting|er|corridor|cafeteria)$)/.test(z)) w *= 2.5;
    // 往商店的路上(玩家 → 商店的橢圓內)
    const sp = g.shop?.pos, lp = g.player.pos;
    if (sp && Math.abs(lp.y - (sp.y || 0)) < 2.5 && Math.abs(s.y - (sp.y || 0)) < 2.5) {
      const a = Math.hypot(s.x - lp.x, s.z - lp.z), b = Math.hypot(s.x - sp.x, s.z - sp.z), c = Math.hypot(sp.x - lp.x, sp.z - lp.z);
      if (c > 10 && a + b < c * 1.35) w *= 1.8;
      if (b < 9) w *= 0.2; // 不要堵在店門口
    }
    return w;
  }
  _habitPlace(o = {}) {
    const g = this.g;
    this._mem = this._memorial();
    const r = Math.random(), type = o.type || (r < 0.75 ? 'walker' : r < 0.92 ? 'runner' : 'crawler');
    const skip = (q) => HABIT_SKIP.has(q.zone), w = (q) => this._habitW(q);
    const s = o.spot || this._pick(this.corpse, false, { lo: 7, hi: 34, minE: 7, skip, w }) || this._pick(this.corpse, false, { lo: 6, hi: 60, minE: 7, skip, w }); // 近的路上沒有就放遠一點
    if (!s) return null;
    const role = this._role(s, type), before = g.toSpawn;
    g._ambAt = { x: s.x, y: s.y, z: s.z, yaw: role.yaw };
    let z = null;
    try { z = g.spawnZombie(type); } catch (e) { console.warn('[ambush] 習慣群', e); } finally { g._ambAt = null; g.toSpawn = before; }
    if (!z) return null;
    this._place(z, s, role.code, role.yaw, { pool: role.pool });
    z._habit = role.id;
    z.amb.habit = true;
    z.amb.maxT = Infinity; // 休息中不會自己起來
    this.stats.habit++;
    this.log.push({ t: +g.time.toFixed(2), kind: 'habit', role: role.id, spot: s.kind, zone: s.zone, type: z.type, x: r2(s.x), y: s.y, z: r2(s.z) });
    if (this.log.length > 60) this.log.shift();
    return z;
  }
  // 醒來的習慣群走到金水商行門口:停下來,站在門口等(店裡還是安全的);下一波開始時沒人看得到就離開
  _habitShop(z) {
    const W = this.g.world, v = z.vel, sp = Math.hypot(v.x, v.z), y = z.pos.y + 0.2;
    const ax = sp > 0.2 ? z.pos.x + (v.x / sp) * 2.4 : z.pos.x, az = sp > 0.2 ? z.pos.z + (v.z / sp) * 2.4 : z.pos.z;
    if (W.zoneAt?.(ax, y, az)?.id !== SHOP_ZONE && W.zoneAt?.(z.pos.x, y, z.pos.z)?.id !== SHOP_ZONE) return;
    const L = W.layout, yaw = sp > 0.2 ? Math.atan2(v.x, v.z) : z.heading;
    const spot = { li: L.levelOfY(z.pos.y + 0.3), x: z.pos.x, y: z.pos.y, z: z.pos.z, yaw, kind: 'floor', zone: 'f1_lobby', busy: null, usedT: -1e9, decoy: null };
    this._place(z, spot, POSE.stand, yaw, { pool: false });
    z.amb.habit = true; z.amb.maxT = Infinity; z.amb.R = 2.2;
    this.stats.habitDoor++;
  }
  // 新的一波:醒著的加入這一波;還在裝死、沒人看得到的悄悄離開(不算進這一波);看得到的留著,變成這一波的裝死屍體
  _habitWave() {
    const g = this.g;
    if (!this._host()) return;
    for (let i = g.zombies.length - 1; i >= 0; i--) {
      const z = g.zombies[i];
      if (!z._habit || z._proxy) continue;
      z._habit = null;
      if (!z.alive) continue;
      const a = z.amb;
      if (!a || !a.dormant) { this.stats.habitJoin++; continue; }
      this.habit.spared++;
      try { g.flags?.inc?.('h.habit.spared'); } catch { /* 略 */ } // N7/N14:整次休息都沒吵醒他(結局可以讀)
      if (!this._seen({ x: z.pos.x, y: z.pos.y, z: z.pos.z }, false)) {
        if (a.pool) { this.props.removePool(a.pool); this.cpools = this.cpools.filter((q) => q !== a.pool); }
        z._ambEnd(false);
        z.alive = false; // 連線:房主的 byId 還留著牠時,遠端的命中直接略過
        z.dispose();
        g.zombies.splice(i, 1);
        this.habit.left++; this.stats.habitLeft++;
        continue;
      }
      a.habit = false; a.t0 = g.time; a.maxT = rand(60, 100);
    }
  }

  // 休息時的殭屍節拍(本機):看不到的、裝死的那一邊傳來一點動靜(拖了一步、悶悶的一聲);每具一次,導演的休息預算
  _restBeat(z, a) {
    const g = this.g, c = g.camera?.position;
    a.beatT = g.time + 6;
    if (!c || g.world.hasLineOfSight(c.x, c.y, c.z, z.pos.x, z.pos.y + 0.6, z.pos.z)) return;
    const D = g.horror?.director;
    let ok = false;
    try { ok = !!D?.request?.('zbeat', { pos: z.pos }); } catch { ok = false; }
    if (!ok) return;
    a.beat = true;
    const pos = { x: z.pos.x, y: z.pos.y + 0.3, z: z.pos.z };
    try { sfx.zStep?.(z.type, pos); sfx.thud?.(pos, false); } catch { /* 略 */ }
    try { D.notify('zbeat', { pos: z.pos }); } catch { /* 略 */ }
  }

  // ======================= 假屍體 =======================
  _newRound() {
    const g = this.g;
    const prev = this.round;
    this.round = g.round;
    this.roundT0 = g.time;
    this.per.cover = 0; this.per.drop = 0; this.per.corpse = 0;
    this._huntAt = 0;
    this._habitWave();
    this.nextRes = g.time + rand(4, 8);
    for (let i = this.slots.length - 1; i >= 0; i--) { const s = this.slots[i]; if (s.spot.busy === s) s.spot.busy = null; } // 新回合的佇列是新的:舊的預留直接作廢
    this.slots.length = 0;
    for (const m of this.cpools) this.props.removePool(m); // 裝死屍體留下的血泊(假屍體的血泊跟著假屍體)
    this.cpools.length = 0;
    if (!(g.round > 0) || g.net?.pvp) return;
    if (prev > g.round || prev <= 0) this._clearDecoys();
    this.decoyWant = Math.min(6, 1 + Math.ceil(g.round / 2)); // 一幀最多建一具(每具約 3~4ms),分散在回合開始的前幾秒
    this._dT = 0; this._dFail = 0;
  }
  _decoySpot() {
    const S = this.corpse, pl = this._players();
    for (let tries = 0; tries < 40; tries++) {
      const s = S[(Math.random() * S.length) | 0];
      if (!s || s.busy || s.decoy) continue;
      let ok = true;
      for (const p of pl) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < 15 && Math.abs(s.y - p.pos.y) < 3) ok = false;
      for (const d of this.decoys) if (Math.abs(d.pos.x - s.x) + Math.abs(d.pos.z - s.z) < 12 && Math.abs(d.pos.y - s.y) < 1) ok = false;
      if (ok && !this._seen(s, false)) return s;
    }
    return null;
  }
  _addDecoy(s) {
    const g = this.g;
    const r = Math.random(), type = r < 0.65 ? 'walker' : r < 0.85 ? 'runner' : 'crawler'; // 與裝死的殭屍同樣的類型組成
    forceVariant(type, (Math.random() * 8) | 0);
    let d;
    try { d = new Zombie(g.scene, { x: s.x, y: s.y, z: s.z }, 1, type); } catch { return; }
    d.heading = s.yaw;
    d.amb = makeAmb(d, corpsePose(s.kind, type), g.world, { spot: s });
    d.amb.decoy = true;
    d.amb.pool = this.props.pool(s.x, s.y, s.z, rand(1.1, 1.6));
    d._ambFreeze();
    d._decoy = true;
    d._tw = 0;
    // 被打到:只會抽搐、流血(不會死、不會起來)
    d.damage = function (amount, part) {
      const k = Math.min(2, amount / 30);
      this.flinchV += (part === 'head' ? 7 : 4.5) * k * 0.6;
      this.rollV += (Math.random() - 0.5) * 6 * k;
      if (part === 'head') this.headKick = Math.min(1.2, this.headKick + 0.5);
      this._tw = 0.7;
      return false;
    };
    s.decoy = d;
    this.decoys.push(d);
    this.stats.decoys++;
  }
  _tickDecoys(dt) {
    for (const d of this.decoys) {
      if (!(d._tw > 0)) continue;
      d._tw -= dt;
      d.t += dt;
      d._resetPose();
      d._ambStatic(d.amb.code, d.t);
      if (d._tw > 0) d._reactions(dt);
      d._applyRoot();
      d._ambBake();
    }
  }
  _clearDecoys() {
    for (const d of this.decoys) { if (d.amb?.spot) d.amb.spot.decoy = null; if (d.amb?.pool) this.props.removePool(d.amb.pool); d.dispose(); }
    this.decoys.length = 0;
  }

  // ======================= 新的一局 / 換地圖 =======================
  reset() {
    this._clearDecoys();
    this.props?.reset();
    for (const list of [this.cover, this.corpse, this.ceil]) for (const s of list || []) { s.busy = null; s.usedT = -1e9; }
    this.slots.length = 0;
    this.cpools.length = 0;
    for (const [, h] of this.hints) h.jig = 0;
    this.hints.clear();
    for (const q of this.flick) q.f.ov = 1;
    this.flick.length = 0;
    this.decoyWant = 0;
    this.round = -1; this.lastTrig = -1e9; this.blockT = -1e9; this._huntAt = 0; this.nHidden = 0;
    this.habit = { round: -1, want: 0, n: 0, at: 0, fail: 0, woke: 0, spared: 0, left: 0 };
  }
  dispose() {
    this.reset();
    this.props?.dispose();
    this.props = null;
    this.ready = false;
  }

  // ======================= 除錯 / 測試 =======================
  debug() {
    const g = this.g, out = [];
    for (const z of g.zombies) if (z.alive && (z.amb || z._habit)) out.push({ type: z.type, state: z.state, code: z.amb?.code ?? 0, dormant: !!z.amb?.dormant, habit: z._habit || null, x: +z.pos.x.toFixed(1), y: +z.pos.y.toFixed(1), z: +z.pos.z.toFixed(1) });
    return {
      level: this.level(), cd: +this.cd().toFixed(0), per: { ...this.per }, stats: { ...this.stats }, reserved: this.reserved, habit: { ...this.habit },
      slots: this.slots.map((s) => ({ kind: s.kind, type: s.type, spot: s.spot.kind, x: r2(s.spot.x), y: s.spot.y, z: r2(s.spot.z), spoiled: s.spoiled })),
      zombies: out, decoys: this.decoys.map((d) => [+d.pos.x.toFixed(1), +d.pos.y.toFixed(1), +d.pos.z.toFixed(1), d.amb.code]),
    };
  }
  // 測試:kind 'cover'(舊名 'lurk')| 'drop' 放一個虛擬點(預留算進 toSpawn);'corpse' 生一隻殭屍擺成屍體。
  // opt { spot 指定位置, kind 位置種類, type, lo, hi, minE, R }
  force(kind = 'cover', opt = {}) {
    const g = this.g;
    if (!this.ready) this._build();
    if (kind === 'lurk') kind = 'cover';
    if (kind === 'habit') return this._habitPlace(opt);
    if (opt.rest) { // 休息時的掩蔽伏擊(禁忌的後果):不從出怪佇列拿、不算 toSpawn;休息中也會觸發,下一波開始就作廢
      const spot = opt.spot || this._pick(this.cover, false, opt);
      if (!spot) return null;
      const s = this._addSlot('cover', opt.type || 'walker', spot, g.time, { maxT: opt.maxT ?? 70, R: opt.R ?? 4.6 });
      s.rest = true;
      this.per.cover--; // 不佔這一波的名額
      return s;
    }
    if (kind === 'corpse') {
      const before = g.toSpawn;
      const z = g.spawnZombie(opt.type || 'walker');
      g.toSpawn = before;
      if (z && !z.amb) this._armCorpse(z, opt);
      return z;
    }
    const spot = opt.spot || this._pick(kind === 'drop' ? this.ceil : this.cover, kind === 'drop', opt);
    if (!spot) return null;
    g.toSpawn = (g.toSpawn | 0) + 1; // 預留的仍算在 toSpawn 裡
    return this._addSlot(kind, opt.type || (kind === 'drop' ? 'runner' : 'walker'), spot, g.time, opt);
  }
}

export function createAmbush(game) { return new Ambush(game); }
