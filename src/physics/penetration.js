import * as THREE from 'three';
import { sfx } from '../audio.js';
import { MATS } from './truth.js';
import { GlassPanes, installCrackShader } from './glass.js';
import { GlassFX } from './glassfx.js';

// 子彈穿透(依材質與厚度):
//  - 薄面板(不在 World 碰撞盒裡,不擋視線/移動):窗玻璃、櫃台玻璃隔板(彈孔 + 蛛網裂紋,多發後裂紋連成網、整片失效碎落;
//    舊窗 = 退火玻璃大塊尖碎片,櫃台 = 強化玻璃先龜裂再崩成小粒;見 physics/glass.js、glassfx.js)、
//    鐵絲網/鐵欄圍籬(子彈直接穿過,偶爾冒火花)、封窗木板(木屑、少量減傷)
//  - 道具碰撞盒(World.rayBox 告訴我們打到哪個):依 physics/truth.js 的穿透類別與實際穿過的厚度扣穿透力,
//    穿得過就從出口繼續飛(入口彈孔/碎屑、出口彈孔、射程與傷害衰減),混凝土/石材/沙包一定擋住;最多再穿 2 個(每發最多多 2 次 rayDistance)
//  - 穿過遮蔽物後打到的殭屍傷害較低(mulAt)。巴雷特穿透力最高,霰彈彈丸最低。
// 流程:trace() 只算路徑(不產生效果)→ combat 對殭屍結算(殭屍可能先把子彈擋下)→ emit(實際終點) 才畫被穿過的效果。
// 熱路徑全部用預先配置的型別陣列,不配置新物件。

const POWER = { pistol: 0.8, revolver: 1.4, shotgun: 0.32, ak47: 1.7, m4a1: 1.45, barrett: 5.5 };
export function powerOf(def, id) {
  if (def && def.penPower) return def.penPower;
  const p = POWER[id] ?? Math.max(0.5, Math.min(5, ((def && def.damage) || 30) / 22));
  return def && def.pellets && !POWER[id] ? p * 0.3 : p;
}
const MAX_PEN = 2; // 每發最多穿過幾個道具碰撞盒
const MAX_EV = 16, MAX_SEG = 12;
const P_GLASS = 0, P_MESH = 1, P_BOARD = 2;
const EV_PANE = 1, EV_BOX = 2;
const GLASS_LOSS = 0.08, BOARD_COST = 0.06;
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _nd = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export class Ballistics {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const W = this.world, t0 = performance.now();
    this.W = W.W; this.H = W.H;
    // 面板(SoA)
    const list = [];
    this._collect(list, game.hospital);
    const n = (this.n = list.length);
    this.kind = new Uint8Array(n);
    this.st = new Int8Array(n); // 玻璃貼圖格:0 完整 / 1 蛛網裂 / 2 破洞 / 3 只剩碎片 / -1 沒玻璃
    this.ax = new Uint8Array(n); // 0 = 面朝 z(沿 x 延伸)/ 1 = 面朝 x
    this.bx = new Float32Array(n * 6); // minX maxX minY maxY minZ maxZ
    this.ref = new Array(n); // 玻璃:{ mesh, vi }(四個頂點);木板:[[cu, cy, a]...]
    this.gi = new Int32Array(n).fill(-1); // 玻璃:GlassPanes 裡的編號(-1 = 找不到網格,只有邏輯)
    this.temp = new Uint8Array(n); // 1 = 強化玻璃(櫃台隔板)
    this.dmg = new Float32Array(n); // 沒有網格的玻璃用的受損值
    this._s = new Uint32Array(n);
    this._stamp = 0;
    // 窗玻璃的裂紋 shader(預編譯前就掛上;雨滴 hook 在 weather 建構時已經掛好,這裡包在它外面)
    this.panes = new GlassPanes();
    const gm = new Set();
    for (const e of list) if (e.ref && e.ref.mesh) gm.add(e.ref.mesh.material);
    for (const m of gm) installCrackShader(m);
    game.scene.traverse((o) => { if (o.isMesh && gm.has(o.material)) this.panes.prepareMesh(o); }); // 同材質的其他網格也要有屬性
    list.forEach((e, i) => {
      this.kind[i] = e.kind; this.st[i] = e.st ?? 0; this.ax[i] = e.ax;
      this.bx.set([e.x0, e.x1, e.y0, e.y1, e.z0, e.z1], i * 6);
      this.ref[i] = e.ref || null;
      if (e.kind !== P_GLASS) return;
      this.temp[i] = e.counter ? 1 : 0;
      const W = e.ax === 0 ? e.x1 - e.x0 : e.z1 - e.z0, H = e.y1 - e.y0;
      if (e.ref && e.ref.mesh) this.gi[i] = this.panes.add(e.ref, W, H, e.st, this.temp[i], i * 7 + 3);
      if (e.st >= 3) this.dmg[i] = 2;
    });
    this.fx = new GlassFX(game); // 碎片(實例化;開場預編譯時就在場景裡)
    // 2m 格索引(CSR)
    const WH = this.W * this.H, cnt = new Int32Array(WH + 1);
    const cells = (i, fn) => {
      const b = this.bx, o = i * 6;
      const c0 = Math.max(0, Math.floor(b[o] / 2)), c1 = Math.min(this.W - 1, Math.floor(b[o + 1] / 2));
      const r0 = Math.max(0, Math.floor(b[o + 4] / 2)), r1 = Math.min(this.H - 1, Math.floor(b[o + 5] / 2));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.W + c);
    };
    for (let i = 0; i < n; i++) cells(i, (k) => cnt[k + 1]++);
    for (let k = 0; k < WH; k++) cnt[k + 1] += cnt[k];
    this.cs = cnt;
    this.ci = new Int32Array(cnt[WH]);
    const fill = cnt.slice(0, WH);
    for (let i = 0; i < n; i++) cells(i, (k) => { this.ci[fill[k]++] = i; });
    // trace 輸出
    this.segT = new Float32Array(MAX_SEG); this.segMul = new Float32Array(MAX_SEG); this.segX = new Float32Array(MAX_SEG); this.nSeg = 0;
    this.evT = new Float32Array(MAX_EV); this.evT2 = new Float32Array(MAX_EV); this.evK = new Uint8Array(MAX_EV); this.evI = new Int32Array(MAX_EV); this.evB = new Array(MAX_EV).fill(null); this.nEv = 0;
    this.end = 0; this.stop = false; this.endBox = null; this.pens = 0;
    this.stats = { ms: Math.round(performance.now() - t0), panes: n, glass: list.filter((e) => e.kind === P_GLASS && e.st < 3).length, visual: this.panes.list.length, shattered: 0, cracks: 0, pen: 0 };
  }

  // ---------- 建立面板 ----------
  _collect(list, H) {
    const K = H && H.K, W = this.world, L = W.layout;
    if (!K) return;
    // 玻璃網格的頂點:窗格四角 → 頂點索引(換 UV 用)
    const glass = new Map();
    for (const g of H.levelGroups || []) g.traverse((m) => { if (m.isMesh && /:glass$/.test(m.name)) glass.set(m.name, m); });
    const vmap = new Map();
    const key = (x, y, z) => `${Math.round(x * 200)},${Math.round(y * 200)},${Math.round(z * 200)}`;
    for (const m of glass.values()) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 1) { const k = key(p.getX(i), p.getY(i), p.getZ(i)); const a = vmap.get(k); if (a) a.push(m, i); else vmap.set(k, [m, i]); }
    }
    const findQuad = (a, b, c, d) => {
      const vs = vmap.get(key(a[0], a[1], a[2]));
      if (!vs) return null;
      for (let n = 0; n < vs.length; n += 2) {
        const m = vs[n], i = vs[n + 1], p = m.geometry.attributes.position;
        if (i + 3 >= p.count) continue;
        const ok = (j, q) => Math.abs(p.getX(j) - q[0]) < 0.01 && Math.abs(p.getY(j) - q[1]) < 0.01 && Math.abs(p.getZ(j) - q[2]) < 0.01;
        if (ok(i + 1, b) && ok(i + 2, c) && ok(i + 3, d)) return { mesh: m, vi: i };
      }
      return null;
    };
    for (const w of K.windowInfo || []) {
      const y = L.levels[w.li].y, s0 = y + L.WINDOW_SILL, s1 = y + L.WINDOW_TOP;
      const P = (u, yy, wf) => (w.axis === 'z' ? [u, yy, wf] : [wf, yy, u]);
      const pane = (u0, u1, y0, y1, wf, kind, st, ref) => {
        if (w.axis === 'z') list.push({ kind, st, ax: 0, x0: u0, x1: u1, y0, y1, z0: wf - 0.012, z1: wf + 0.012, ref });
        else list.push({ kind, st, ax: 1, x0: wf - 0.012, x1: wf + 0.012, y0, y1, z0: u0, z1: u1, ref });
      };
      for (const [a0, a1, b0, b1, k] of w.panes || []) {
        if (k < 0) continue;
        const q = findQuad(P(a0, b0, w.wf), P(a1, b0, w.wf), P(a1, b1, w.wf), P(a0, b1, w.wf));
        pane(a0, a1, b0, b1, w.wf, P_GLASS, k, q);
      }
      if (w.boards && w.boards.length) pane(w.u0, w.u1, s0, s1, w.wf + w.inDir * 0.075, P_BOARD, 0, w.boards);
    }
    for (const g of K.counterGlass || []) {
      if (g.k < 0) continue;
      const q = findQuad([g.x0, g.y0, g.zc], [g.x1, g.y0, g.zc], [g.x1, g.y1, g.zc], [g.x0, g.y1, g.zc]);
      list.push({ kind: P_GLASS, st: g.k, ax: 0, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, z0: g.zc - 0.012, z1: g.zc + 0.012, ref: q, counter: g });
    }
    // 鐵絲網/鐵欄圍籬('|'):與 hospital/openings.js buildFences 同一條線
    const li = L.levels.findIndex((l) => l.id === '1F');
    if (li >= 0) {
      const y = L.levels[li].y, isF = (c, r) => L.charAt(li, c, r) === '|';
      for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
        if (!isF(c, r)) continue;
        const alongX = isF(c - 1, r) || isF(c + 1, r) || !(isF(c, r - 1) || isF(c, r + 1));
        const boundary = r === L.H - 1 || c === L.W - 1, cem = c <= 6 && r >= 11 && r <= 25;
        const x0 = c * 2, z0 = r * 2;
        const ax = boundary ? (r === L.H - 1 && c !== L.W - 1 ? true : c === L.W - 1 ? false : alongX) : alongX;
        const line = boundary ? (r === L.H - 1 ? (alongX ? z0 + 0.1 : x0 + 0.1) : x0 + 0.1) : alongX ? z0 + 1 : x0 + 1;
        const hgt = boundary ? 2.4 : cem ? 1.6 : 2.0;
        if (ax) list.push({ kind: P_MESH, ax: 0, x0, x1: x0 + 2, y0: y, y1: y + hgt, z0: line - 0.03, z1: line + 0.03 });
        else list.push({ kind: P_MESH, ax: 1, x0: line - 0.03, x1: line + 0.03, y0: y, y1: y + hgt, z0, z1: z0 + 2 });
      }
    }
  }

  // ---------- 路徑 ----------
  // o,d:起點與單位方向;lim:第一次 rayDistance 的結果(world.rayBox 仍是那次命中的盒子);P0:穿透力
  // 回傳最後的終點距離;this.stop = 是否打到實心(否則飛到 maxD)、this.endBox = 終點的道具盒
  trace(o, d, lim, maxD, P0) {
    const W = this.world;
    let t = 0, hit = lim, box = W.rayBox, P = P0, mul = 1, extra = 0, pens = 0;
    this.nEv = 0; this.nSeg = 1; this.segT[0] = 0; this.segMul[0] = 1; this.segX[0] = 0;
    for (;;) {
      if (this.n) {
        const e0 = this.nEv;
        this._panes(o, d, t, hit);
        for (let e = e0; e < this.nEv; e++) { // 玻璃/木板:少量減傷
          const kd = this.kind[this.evI[e]];
          if (kd === P_MESH) continue;
          mul *= kd === P_GLASS ? 1 - GLASS_LOSS : 1 - BOARD_COST;
          this._seg(this.evT[e], mul, extra);
        }
      }
      if (hit >= maxD) { this.stop = false; this.endBox = null; this.end = maxD; break; }
      const M = box && box.pm ? MATS[box.pm] : null;
      if (!M || pens >= MAX_PEN || this.nEv >= MAX_EV) { this.stop = true; this.endBox = box; this.end = hit; break; }
      const exit = boxExit(box, o.x, o.y, o.z, d.x, d.y, d.z, hit);
      const cost = (exit - hit) * M.pc;
      if (!(cost < P)) { this.stop = true; this.endBox = box; this.end = hit; break; }
      P -= cost;
      mul *= Math.max(0.2, 1 - (0.55 * cost) / P0) * (M.pc > 0 ? 0.92 : 1);
      extra += cost * 18; // 射程損失(傷害衰減距離)
      const e = this.nEv++;
      this.evK[e] = EV_BOX; this.evT[e] = hit; this.evT2[e] = exit; this.evB[e] = box;
      this._seg(exit, mul, extra);
      pens++;
      t = exit + 0.003;
      hit = t + W.rayDistance(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t, d.x, d.y, d.z, maxD - t);
      box = W.rayBox;
    }
    this.pens = pens;
    return this.end;
  }

  _seg(t, mul, extra) {
    if (this.nSeg >= MAX_SEG) return;
    const k = this.nSeg++;
    this.segT[k] = t; this.segMul[k] = mul; this.segX[k] = extra;
  }
  // 距離 t 處的傷害倍率 / 額外衰減距離
  mulAt(t) { let k = 0; while (k + 1 < this.nSeg && this.segT[k + 1] <= t) k++; return this.segMul[k]; }
  extraAt(t) { let k = 0; while (k + 1 < this.nSeg && this.segT[k + 1] <= t) k++; return this.segX[k]; }

  // [t0, t1] 段穿過的面板(2m 格 DDA);依距離排序寫進事件
  _panes(o, d, t0, t1) {
    const Wd = this.W, Hd = this.H, bx = this.bx;
    const ox = o.x + d.x * t0, oz = o.z + d.z * t0;
    let c = Math.floor(ox / 2), r = Math.floor(oz / 2);
    const sc = d.x > 0 ? 1 : -1, sr = d.z > 0 ? 1 : -1;
    const adx = Math.abs(d.x), adz = Math.abs(d.z);
    const tdc = adx > 1e-9 ? 2 / adx : Infinity, tdr = adz > 1e-9 ? 2 / adz : Infinity;
    let tmc = adx > 1e-9 ? ((d.x > 0 ? (c + 1) * 2 : c * 2) - ox) / d.x : Infinity;
    let tmr = adz > 1e-9 ? ((d.z > 0 ? (r + 1) * 2 : r * 2) - oz) / d.z : Infinity;
    const st = ++this._stamp, first = this.nEv, len = t1 - t0;
    let tt = 0;
    while (tt <= len) {
      if (c < 0 || r < 0 || c >= Wd || r >= Hd) break;
      const idx = r * Wd + c;
      for (let k = this.cs[idx], e = this.cs[idx + 1]; k < e; k++) {
        const i = this.ci[k];
        if (this._s[i] === st) continue;
        this._s[i] = st;
        const kd = this.kind[i];
        if (kd === P_GLASS && this.broken(i)) continue; // 已經碎了:直接穿過
        const th = slab(bx, i * 6, o.x, o.y, o.z, d.x, d.y, d.z, t0, t1);
        if (th === Infinity) continue;
        if (kd === P_BOARD && !this._onBoard(i, o, d, th)) continue;
        if (kd === P_GLASS && this.gi[i] >= 0 && this.panes.inHole(this.gi[i], this._u(i, o.x + d.x * th, o.z + d.z * th), o.y + d.y * th - bx[i * 6 + 2])) continue; // 從破洞穿過
        if (this.nEv >= MAX_EV) break;
        const ev = this.nEv++;
        this.evK[ev] = EV_PANE; this.evT[ev] = th; this.evI[ev] = i; this.evB[ev] = null;
      }
      const tn = tmc < tmr ? tmc : tmr;
      if (tn > len) break;
      tt = tn;
      if (tmc < tmr) { c += sc; tmc += tdc; } else { r += sr; tmr += tdr; }
    }
    // 同一格內可能亂序:插入排序
    for (let a = first + 1; a < this.nEv; a++) {
      const T = this.evT[a], I = this.evI[a];
      let b = a - 1;
      while (b >= first && this.evT[b] > T) { this.evT[b + 1] = this.evT[b]; this.evI[b + 1] = this.evI[b]; b--; }
      this.evT[b + 1] = T; this.evI[b + 1] = I;
    }
  }

  broken(i) { return this.gi[i] >= 0 ? this.panes.broken(this.gi[i]) : this.dmg[i] >= 1.9; }
  _u(i, x, z) { return this.ax[i] === 0 ? x - this.bx[i * 6] : z - this.bx[i * 6 + 4]; }

  // 封窗木板:命中點是否落在某塊(斜放)木板上
  _onBoard(i, o, d, t) {
    const B = this.ref[i];
    if (!B) return false;
    const u = this.ax[i] === 0 ? o.x + d.x * t : o.z + d.z * t, y = o.y + d.y * t;
    for (let k = 0; k < B.length; k++) { const b = B[k]; if (Math.abs(y - (b[1] + Math.tan(b[2]) * (u - b[0]))) < 0.1 / Math.cos(b[2])) return true; }
    return false;
  }

  // ---------- 效果(只畫 endT 之前的事件:殭屍先把子彈擋下時,後面的東西沒被打到) ----------
  // power:0..1 效果強度;main:這發是否播聲音(霰彈只有第一顆)
  emit(o, d, endT, power, main, P0) {
    const g = this.game, fx = g.wfx;
    if (!fx) return;
    for (let e = 0; e < this.nEv; e++) {
      const t = this.evT[e];
      if (t >= endT) break;
      _p.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
      if (this.evK[e] === EV_PANE) {
        const i = this.evI[e], kd = this.kind[i];
        this._paneNormal(i, d, _n);
        if (kd === P_GLASS) this.hitGlass(i, _p, d, P0, main);
        else if (kd === P_MESH) { if (Math.random() < 0.35) this._sparks(_p, _n, d, 4); }
        else { fx.impact(_p, _n, d, 'wood', power * 0.4); if (main) sfx.wall(_p, 'wood'); }
      } else {
        const b = this.evB[e], M = MATS[b.pm];
        boxNormal(b, _p, _n);
        fx.impact(_p, _n, d, M.fx, power * 0.8);
        if (b.pm === 'glass') { this.fx.burst(_p, d, false, 6); if (main) sfx.glass('crack', _p, 0.4); } // 玻璃櫃、公車亭:退火玻璃碎片
        else if (b.pm === 'car' && _p.y > b.minY + 0.92) { this.fx.burst(_p, d, true, 34); if (main) sfx.glass('crumble', _p, 0.2); } // 車窗:強化玻璃小粒
        else if (main) sfx.wall(_p, M.fx);
        // 出口:彈孔 + 往前噴的碎屑
        const t2 = this.evT2[e];
        _q.set(o.x + d.x * t2, o.y + d.y * t2, o.z + d.z * t2);
        boxNormal(b, _q, _n);
        if (M.pc > 0.1) { _nd.copy(d).negate(); fx.impact(_q, _n, _nd, M.fx, power * 0.35); }
        this.stats.pen++;
      }
      this.evB[e] = null;
    }
  }

  // 玻璃被打中:彈孔 + 蛛網裂紋,舊裂紋延伸;受損累積到 1 就整片碎落(退火:大塊尖碎片;強化:先龜裂、再崩成小粒)
  // P0 = 穿透力(手槍 0.8 → 每發 0.19,第 6 發碎;步槍 ~0.35~0.4;霰彈彈丸 0.08,兩發碎;巴雷特/爆炸一次碎)
  hitGlass(i, p, d, P0, main) {
    if (this.broken(i)) return;
    const fx = this.game.wfx, add = Math.max(0.08, Math.min(1.2, P0 * 0.24));
    const u = this._u(i, p.x, p.z), v = p.y - this.bx[i * 6 + 2];
    let fail;
    if (this.gi[i] >= 0) fail = this.panes.hit(this.gi[i], u, v, add);
    else { this.dmg[i] = this.temp[i] ? (this.dmg[i] < 0.3 && add < 0.5 ? 0.6 : 2) : this.dmg[i] + add; fail = this.dmg[i] >= 1; if (fail) this.dmg[i] = 2; }
    if (fail) { this._shatter(i, p, d, Math.min(1, P0 / 2)); return; }
    this.stats.cracks++;
    // 沒碎:彈孔噴出的細碎玻璃粉 + 一點閃光
    if (fx) {
      const fl = fx.floor(p.x, p.y, p.z);
      for (let k = 0; k < 7; k++) { const sp = rand(0.5, 2.2), s = rand(0.003, 0.008); fx.debris.spawn(p.x, p.y, p.z, d.x * sp + rand(-0.4, 0.4), rand(-0.3, 0.7), d.z * sp + rand(-0.4, 0.4), s, 0.0015, s, 0xc8dcdc, rand(0.8, 1.6), fl, 0.2, 0.3, 9.8, 20); }
      for (let k = 0; k < 3; k++) fx.glow.spawn(p.x, p.y, p.z, d.x * rand(0.5, 2) + rand(-0.4, 0.4), rand(-0.2, 0.8), d.z * rand(0.5, 2) + rand(-0.4, 0.4), 2.6, 3, 3.4, rand(0.1, 0.25), 0.005, fl, 9.8, 0.9);
    }
    if (main) sfx.glass('crack', p, add);
  }

  _shatter(i, p, d, power) {
    const o = i * 6, b = this._bb || (this._bb = new Float32Array(6));
    for (let k = 0; k < 6; k++) b[k] = this.bx[o + k];
    if (this.temp[i]) { this.fx.tempered(b, this.ax[i], p, d, power); sfx.glass('crumble', p, 1); }
    else { this.fx.annealed(b, this.ax[i], p, d, power); sfx.glass('shatter', p, (b[1] - b[0] + b[5] - b[4]) * (b[3] - b[2])); }
    this.stats.shattered++;
  }

  // 每幀(combat.updateCombat):碎片
  update(dt) { this.fx.update(dt); }

  _paneNormal(i, d, out) {
    if (this.ax[i] === 0) return out.set(0, 0, d.z > 0 ? -1 : 1);
    return out.set(d.x > 0 ? -1 : 1, 0, 0);
  }

  _sparks(p, n, d, cnt) {
    const fx = this.game.wfx, fl = fx.floor(p.x, p.y, p.z);
    for (let i = 0; i < cnt; i++) {
      const s = rand(1.5, 4);
      fx.glow.spawn(p.x, p.y, p.z, (d.x * 0.6 + n.x * 0.4 + rand(-0.5, 0.5)) * s, (rand(-0.2, 0.6)) * s, (d.z * 0.6 + n.z * 0.4 + rand(-0.5, 0.5)) * s, 5, 2.6, 0.9, rand(0.1, 0.3), rand(0.005, 0.01), fl, 9.8, 0.8);
    }
  }

  // ---------- 其他系統 ----------
  // 遠端玩家的子彈(連線:只有效果):起點 → 終點之間的玻璃與被穿過的道具
  remote(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, L = Math.hypot(dx, dy, dz);
    if (L < 0.05) return;
    const O = _ro.copy(from), d = _rd.set(dx / L, dy / L, dz / L);
    const lim = this.world.rayDistance(O.x, O.y, O.z, d.x, d.y, d.z, L + 0.05);
    this.trace(O, d, lim, L + 0.05, Infinity);
    this.emit(O, d, L - 0.02, 0.4, false, 2);
  }

  // 爆炸震碎附近的窗玻璃(有直線視線的才碎)
  blast(c, radius) {
    if (!this.n) return;
    const W = this.world, bx = this.bx, R = radius * 0.7;
    const c0 = Math.max(0, Math.floor((c.x - R) / 2)), c1 = Math.min(this.W - 1, Math.floor((c.x + R) / 2));
    const r0 = Math.max(0, Math.floor((c.z - R) / 2)), r1 = Math.min(this.H - 1, Math.floor((c.z + R) / 2));
    const st = ++this._stamp;
    for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
      const idx = r * this.W + cc;
      for (let k = this.cs[idx], e = this.cs[idx + 1]; k < e; k++) {
        const i = this.ci[k];
        if (this._s[i] === st || this.kind[i] !== P_GLASS || this.broken(i)) continue;
        this._s[i] = st;
        const o = i * 6, px = (bx[o] + bx[o + 1]) / 2, py = (bx[o + 2] + bx[o + 3]) / 2, pz = (bx[o + 4] + bx[o + 5]) / 2;
        const dd = Math.hypot(px - c.x, py - c.y, pz - c.z);
        if (dd > R || !W.hasLineOfSight(c.x, c.y, c.z, px, py, pz)) continue;
        _p.set(px, py, pz);
        _n.set(px - c.x, 0, pz - c.z).normalize();
        this.hitGlass(i, _p, _n, 9, false); // 震波:一次就碎(碎片往外飛)
      }
    }
  }

  // 手榴彈飛行一小段 (p → p + d*len) 撞到完整玻璃:打碎並回傳 true(手榴彈穿過去、減速)
  smash(p, d, len) {
    if (!this.n) return false;
    const c = Math.floor(p.x / 2), r = Math.floor(p.z / 2);
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return false;
    const idx = r * this.W + c;
    for (let k = this.cs[idx], e = this.cs[idx + 1]; k < e; k++) {
      const i = this.ci[k];
      if (this.kind[i] !== P_GLASS || this.broken(i)) continue;
      const t = slab(this.bx, i * 6, p.x, p.y, p.z, d.x, d.y, d.z, 0, len);
      if (t === Infinity) continue;
      _p.set(p.x + d.x * t, p.y + d.y * t, p.z + d.z * t);
      this.hitGlass(i, _p, d, 9, true);
      return true;
    }
    return false;
  }

  // 翻越用:'=' 櫃台格的玻璃隔板是否還在(完整或裂開都算擋住)
  counterBlocked(li, c, r) {
    for (let i = 0; i < this.n; i++) {
      if (this.kind[i] !== P_GLASS || this.broken(i)) continue;
      const o = i * 6;
      if (Math.floor((this.bx[o] + this.bx[o + 1]) / 4) === c && Math.floor((this.bx[o + 4] + this.bx[o + 5]) / 4) === r && Math.abs(this.bx[o + 2] - this.world.lvY[li] - 1.3) < 0.05) return true;
    }
    return false;
  }
}

// 射線與面板(AABB)在 [t0, t1] 內的進入距離
function slab(b, o, ox, oy, oz, dx, dy, dz, t0, t1) {
  let a, c, s;
  if (dx > -1e-12 && dx < 1e-12) { if (ox < b[o] || ox > b[o + 1]) return Infinity; }
  else { a = (b[o] - ox) / dx; c = (b[o + 1] - ox) / dx; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  if (dy > -1e-12 && dy < 1e-12) { if (oy < b[o + 2] || oy > b[o + 3]) return Infinity; }
  else { a = (b[o + 2] - oy) / dy; c = (b[o + 3] - oy) / dy; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  if (dz > -1e-12 && dz < 1e-12) { if (oz < b[o + 4] || oz > b[o + 5]) return Infinity; }
  else { a = (b[o + 4] - oz) / dz; c = (b[o + 5] - oz) / dz; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  return t0;
}

// 射線離開盒子的距離(入口 t 之後)
function boxExit(b, ox, oy, oz, dx, dy, dz, t) {
  let t1 = Infinity, a, c;
  if (dx > 1e-12 || dx < -1e-12) { a = (b.minX - ox) / dx; c = (b.maxX - ox) / dx; const m = a > c ? a : c; if (m < t1) t1 = m; }
  if (dy > 1e-12 || dy < -1e-12) { a = (b.minY - oy) / dy; c = (b.maxY - oy) / dy; const m = a > c ? a : c; if (m < t1) t1 = m; }
  if (dz > 1e-12 || dz < -1e-12) { a = (b.minZ - oz) / dz; c = (b.maxZ - oz) / dz; const m = a > c ? a : c; if (m < t1) t1 = m; }
  return t1 > t ? t1 : t;
}

// 盒子表面上一點的外法線(最近的面)
function boxNormal(b, p, out) {
  let m = Math.abs(p.x - b.minX), v;
  out.set(-1, 0, 0);
  if ((v = Math.abs(b.maxX - p.x)) < m) { m = v; out.set(1, 0, 0); }
  if ((v = Math.abs(p.y - b.minY)) < m) { m = v; out.set(0, -1, 0); }
  if ((v = Math.abs(b.maxY - p.y)) < m) { m = v; out.set(0, 1, 0); }
  if ((v = Math.abs(p.z - b.minZ)) < m) { m = v; out.set(0, 0, -1); }
  if ((v = Math.abs(b.maxZ - p.z)) < m) out.set(0, 0, 1);
  return out;
}
