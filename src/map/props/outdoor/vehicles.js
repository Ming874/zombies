import * as THREE from 'three';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, beam, gridSurface, smoothNormals, keepUV, pool, solid, clamp, lerp, sstep, V3, TAU, HALF, animate } from './kit.js';
import { decalUV, labelUV, PLATE_COUNT } from './mats.js';

// 程式生成車輛:轎車 / 掀背車 / 廂型車 / 警車 / 救護車 / 靈車。
// 車身本地座標:+X 車頭、+Y 上、+Z 右側(駕駛座在 -Z,台灣左駕);原點在車底中心的地面。
// 下車身 = 站點 × 截面網格放樣(側面頂線/底線/輪拱 + 俯視圓角 + 截面下收/肩線/車頂弧);
// 車廂段頂面挖空,改成內飾板與地板;車門是獨立的殼(關著留 4mm 縫、打開時繞前緣鉸鏈轉);
// 上車身(風擋/車頂/柱/側窗/側板)貼在依 tumblehome 內傾的側平面上。輪胎輪框用實例池。

// ---------- 規格 ----------
// top/bot:側面頂線/底線控制點 [x, y];cab:車廂(挖空)x 範圍;gh:上車身(cowl 風擋底、ws 風擋頂、rr 後窗頂、deck 後窗底)
// pil:A 柱之後的柱子 [x(腰線), x(車頂), 半寬, 材質('trim'|'paint')];bays:相鄰柱之間 'g0'/'g1' 車門玻璃、'g' 固定玻璃、'c' 窗簾玻璃、'p' 車身板
const SPECS = {
  sedan: {
    L: 4.42, W: 1.76, tire: 0.31, axF: 1.3, axR: -1.33, arch: 0.37, crown: 0.035, rho: 0.04, floorH: 0.1,
    top: [[2.21, 0.6], [2.17, 0.7], [2.05, 0.77], [1.6, 0.815], [1.0, 0.86], [0.62, 0.9], [0.58, 0.925], [-0.9, 0.97], [-1.5, 0.995], [-1.85, 1.0], [-2.1, 0.98], [-2.19, 0.9], [-2.21, 0.8]],
    bot: [[2.21, 0.34], [2.05, 0.25], [1.75, 0.215], [-1.8, 0.215], [-2.1, 0.27], [-2.21, 0.36]],
    cab: [0.58, -1.5], gh: { cowl: [0.58, 0.925], ws: [-0.18, 1.41], rr: [-1.02, 1.42], deck: [-1.5, 0.995], roof: 1.425, tumble: 0.23, wsBow: 0.05 },
    pil: [[-0.45, -0.43, 0.05, 'trim'], [-1.17, -1.0, 0.02, 'paint']], bays: ['g0', 'g1', 'p'], doors: [[0.565, -0.425], [-0.475, -1.165]],
    seats: { front: -0.24, rear: -0.92 }, dash: 0.38, plateF: [2.2, 0.42], plateR: [-2.2, 0.82], hl: [2.12, 0.66, 0.6], tl: [-2.18, 0.86, 0.62],
  },
  hatch: {
    L: 3.96, W: 1.72, tire: 0.3, axF: 1.18, axR: -1.27, arch: 0.36, crown: 0.03, rho: 0.04, floorH: 0.1,
    top: [[1.98, 0.58], [1.94, 0.68], [1.82, 0.76], [1.4, 0.82], [0.9, 0.89], [0.66, 0.93], [-1.1, 0.98], [-1.86, 1.0], [-1.95, 0.98], [-1.98, 0.86]],
    bot: [[1.98, 0.32], [1.84, 0.24], [1.6, 0.21], [-1.6, 0.21], [-1.88, 0.26], [-1.98, 0.36]],
    cab: [0.66, -1.84], gh: { cowl: [0.66, 0.93], ws: [-0.16, 1.45], rr: [-1.42, 1.41], deck: [-1.86, 1.0], roof: 1.44, tumble: 0.2, wsBow: 0.05, hatch: true },
    pil: [[-0.44, -0.42, 0.05, 'trim'], [-1.16, -1.08, 0.02, 'paint']], bays: ['g0', 'g1', 'p'], doors: [[0.645, -0.415], [-0.465, -1.1]],
    seats: { front: -0.24, rear: -0.97 }, dash: 0.45, plateF: [1.97, 0.4], plateR: [-1.97, 0.66], hl: [1.9, 0.68, 0.56], tl: [-1.93, 0.88, 0.6],
  },
  van: {
    L: 4.38, W: 1.72, tire: 0.3, axF: 1.38, axR: -1.28, arch: 0.36, crown: 0.025, rho: 0.05, floorH: 0.12,
    top: [[2.19, 0.66], [2.15, 0.8], [2.02, 0.9], [1.84, 0.98], [1.7, 1.02], [-2.1, 1.08], [-2.18, 1.0], [-2.19, 0.9]],
    bot: [[2.19, 0.36], [2.04, 0.26], [1.78, 0.23], [-1.75, 0.23], [-2.08, 0.28], [-2.19, 0.38]],
    cab: [1.7, -2.12], gh: { cowl: [1.7, 1.02], ws: [1.05, 1.86], rr: [-2.12, 1.87], deck: [-2.12, 1.08], roof: 1.87, tumble: 0.1, wsBow: 0.06, flatRear: true }, rear: { type: 'lift', from: 'belt' },
    pil: [[0.68, 0.66, 0.05, 'trim'], [-0.6, -0.62, 0.04, 'trim'], [-1.6, -1.6, 0.04, 'paint']], bays: ['g0', 'g1', 'g', 'g'], doors: [[1.66, 0.71], [0.63, -0.57]],
    seats: { front: 0.45, rear: -0.32, rear2: -1.32 }, dash: 1.52, plateF: [2.18, 0.46], plateR: [-2.18, 0.86], hl: [2.12, 0.86, 0.58], tl: [-2.17, 0.95, 0.66],
  },
  amb: { // 高頂救護車(廂型車底盤)
    L: 5.7, W: 1.98, tire: 0.34, axF: 1.86, axR: -1.62, arch: 0.4, crown: 0.03, rho: 0.05, floorH: 0.36,
    top: [[2.85, 0.72], [2.8, 0.86], [2.6, 0.98], [2.2, 1.06], [1.95, 1.12], [-2.8, 1.16], [-2.85, 1.06]],
    bot: [[2.85, 0.4], [2.62, 0.3], [2.3, 0.27], [-2.4, 0.27], [-2.75, 0.34], [-2.85, 0.42]],
    cab: [1.95, -2.85], gh: { cowl: [1.95, 1.12], ws: [1.32, 2.05], rr: [-2.85, 2.6], deck: [-2.85, 1.16], roof: 2.06, tumble: 0.05, wsBow: 0.06, flatRear: true, highRoof: [1.12, 2.62] },
    pil: [[0.92, 0.9, 0.05, 'trim'], [0.12, 0.12, 0.03, 'paint']], bays: ['g0', 'p', 'w'], doors: [[1.91, 0.95]], win: [1.62, 2.18], winX: [-0.25, -1.3], step: true, rear: { type: 'barn', from: 'floor' }, innerMat: 'plastic_white', floorMat: 'vinyl_seat',
    seats: { front: 0.7 }, dash: 1.76, plateF: [2.84, 0.5], plateR: [-2.84, 0.58], hl: [2.78, 0.9, 0.66], tl: [-2.83, 1.55, 0.86],
  },
  hearse: { // 加長旅行車式靈車
    L: 5.55, W: 1.86, tire: 0.33, axF: 1.72, axR: -1.62, arch: 0.38, crown: 0.03, rho: 0.04, floorH: 0.12, deck: [-0.75, 0.62],
    top: [[2.775, 0.62], [2.73, 0.72], [2.6, 0.8], [2.1, 0.86], [1.32, 0.92], [1.28, 0.95], [-2.6, 1.0], [-2.74, 0.96], [-2.775, 0.86]],
    bot: [[2.775, 0.34], [2.6, 0.25], [2.3, 0.22], [-2.2, 0.22], [-2.62, 0.28], [-2.775, 0.38]],
    cab: [1.28, -2.775], gh: { cowl: [1.28, 0.95], ws: [0.45, 1.5], rr: [-2.775, 1.52], deck: [-2.775, 1.0], roof: 1.52, tumble: 0.16, wsBow: 0.05, flatRear: true }, rear: { type: 'lift', from: 'floor', curtain: true }, innerMat: 'fabric_red', floorMat: 'fabric_red',
    pil: [[0.22, 0.22, 0.05, 'trim'], [-0.68, -0.62, 0.06, 'paint']], bays: ['g0', 'g1', 'c'], doors: [[1.26, 0.27], [0.17, -0.66]],
    seats: { front: 0.0 }, dash: 1.05, plateF: [2.77, 0.42], plateR: [-2.77, 0.6], hl: [2.7, 0.7, 0.64], tl: [-2.74, 0.88, 0.7],
  },
};
SPECS.police = SPECS.sedan;
SPECS.taxi = SPECS.sedan;

// ---------- 曲線 ----------
function curve(pts) { // 控制點 → Hermite 內插 y(x)
  const P = pts.slice().sort((a, b) => a[0] - b[0]);
  return (x) => {
    if (x <= P[0][0]) return P[0][1];
    if (x >= P[P.length - 1][0]) return P[P.length - 1][1];
    let i = 0;
    while (P[i + 1][0] < x) i++;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const t = (x - p1[0]) / (p2[0] - p1[0]), dx = p2[0] - p1[0];
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * dx, m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * dx;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}
const sideS = (e) => (e < 0.5 ? 0.945 + 0.055 * Math.sin((e / 0.5) * HALF) : 1 - 0.03 * ((e - 0.5) / 0.5) ** 2);
const ETA = [0, 0.03, 0.08, 0.15, 0.156, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0];
const KD = 7; // 環上索引 7(ETA[4])以上屬車門
const NH = 25; // 半截面點數:0..2 底、3..15 側面、16..18 肩線圓弧、19..24 頂面(或內飾/地板)
const mul2 = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);
// 四邊形清單 [a,b,c,d] → 幾何(雙面時另加反向)
function quads(list, both = false) {
  const pos = [];
  for (const [a, b, c, d] of list) {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    if (both) pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// 貼花網格:fn(u,v) → V3(u,v ∈ 0..1),UV 對應到圖集矩形
function decalGrid(fn, uvr, nu = 8, nv = 4, flip = false) {
  const rows = [];
  for (let i = 0; i <= nu; i++) { const r = []; for (let j = 0; j <= nv; j++) r.push(fn(i / nu, j / nv)); rows.push(r); }
  const [u0, v0, uw, vh] = uvr;
  return keepUV(gridSurface(rows, { flip, uvFn: (p, i, j) => [u0 + (i / nu) * uw, v0 + (j / nv) * vh] }));
}

// ---------- 車身 ----------
// opt: { paint, open:[前右,後右,前左,後左](弧度), broken:Set('f0r','f1l','wsx','rear'...), crack, dent:[x,z,r,深], crumple(0..1), seat, rng, uvOff, plate }
export function buildVehicle(kind, opt = {}) {
  const S = SPECS[kind];
  const P = new Parts();
  const rng = opt.rng || Math.random;
  const paint = opt.paint || 'po_paint_white';
  const hl = S.L / 2, hw0 = S.W / 2, rho = S.rho, gh = S.gh;
  const yTop0 = curve(S.top), yBot0 = curve(S.bot);
  const archC = S.tire + 0.035;
  const yBot = (x) => {
    let y = yBot0(x);
    for (const ax of [S.axF, S.axR]) { const d = x - ax; if (Math.abs(d) < S.arch) y = Math.max(y, archC + Math.sqrt(S.arch * S.arch - d * d)); }
    return y;
  };
  const dent = opt.dent;
  const crumple = opt.crumple || 0;
  const yTop = (x, z = 0) => {
    let y = yTop0(x);
    if (dent) { const d2 = (x - dent[0]) ** 2 + (z - dent[1]) ** 2; y -= dent[3] * Math.exp(-d2 / (dent[2] * dent[2])) * (1 + 0.3 * Math.sin(x * 37 + z * 29)); }
    if (crumple) { const k = sstep(hl - 0.9, hl - 0.1, x); y += crumple * k * (0.08 * Math.sin(x * 21 + z * 9) + 0.06 * Math.sin(z * 14)); }
    return y;
  };
  const flatRear = !!gh.flatRear, openRear = flatRear && S.cab[1] <= -S.L / 2 + 0.002;
  const plan = (x) => {
    const t = Math.min(1, Math.abs(x / hl));
    return x > 0 ? (1 - t ** 7) ** (1 / 7) : flatRear ? (1 - t ** 22) ** (1 / 22) : (1 - t ** 9) ** (1 / 9);
  };
  const hwAt = (x) => hw0 * plan(x) * (1 - crumple * 0.1 * sstep(hl - 0.6, hl, x));
  const crush = (x) => (crumple ? x - crumple * 0.38 * sstep(hl - 0.8, hl, x) : x);
  const cabF = S.cab[0], cabR = S.cab[1];
  const yf = (x) => yBot0(clamp(x, cabR + 0.3, cabF - 0.3)) + S.floorH;
  // 站點
  const xs = new Set();
  const add = (v) => xs.add(+v.toFixed(4));
  for (let x = -hl; x <= hl + 1e-6; x += 0.16) add(x); // 站點間距(細節交給貼花/法線;三角形數約為原本的 1/2.5)
  for (let k = 0; k <= 5; k++) { const t = (k / 5) ** 1.7 * 0.32; add(hl - t); add(-hl + t); }
  for (const ax of [S.axF, S.axR]) for (let d = -S.arch; d <= S.arch + 1e-6; d += 0.075) add(ax + d);
  const G = 0.004; // 門縫
  const doors = S.doors.map(([f, r], k) => ({ f, r, k }));
  for (const d of doors) for (const v of [d.f, d.f - G, d.r, d.r + G]) add(v);
  for (const v of [cabF, cabF - 0.002, cabR, cabR + 0.002]) add(v);
  const X = [...xs].filter((x) => x >= -hl - 1e-6 && x <= hl + 1e-6).sort((a, b) => b - a); // 前 → 後
  const isCab = (x) => x < cabF - 0.001 && x > cabR + 0.001;
  const cabS = X.map(isCab);
  // 側面:z(η) 與 y(η)
  const sideZ = (x, e) => hwAt(x) * sideS(e);
  const sideY = (x, e) => { const yb = yBot(x) + 0.012, yt = yTop(x, hwAt(x) * 0.5) - rho; return yb + e * (yt - yb); };
  const etaOf = (x, y) => { const yb = yBot(x) + 0.012, yt = yTop(x, hwAt(x) * 0.5) - rho; return (y - yb) / (yt - yb); };
  const zBody = (x, y) => sideZ(x, clamp(etaOf(x, y), 0, 1));
  const half = (x, cab) => {
    const hw = hwAt(x), yb = yBot(x), yt = yTop(x, hw * 0.5);
    const pts = [[0, yb], [hw * 0.43, yb], [hw * 0.86, yb]];
    for (const e of ETA) pts.push([sideZ(x, e), sideY(x, e)]);
    const cz = hw * sideS(1) - rho, cy = yt - rho;
    for (const a of [Math.PI / 6, Math.PI / 3, HALF]) pts.push([cz + rho * Math.cos(a), cy + rho * Math.sin(a)]);
    if (!cab) for (const f of [0.12, 0.3, 0.5, 0.7, 0.86, 1.0]) { const z = cz * (1 - f); pts.push([z, yTop(x, z) + S.crown * (1 - (1 - f) ** 2)]); }
    else { const zi = cz - 0.07, fy = yf(x); pts.push([cz - 0.045, yt - 0.004], [zi, yt - 0.05], [zi, lerp(yt, fy, 0.45)], [zi, fy + 0.04], [zi * 0.55, fy], [0, fy]); }
    return pts;
  };
  const rings = X.map((x, i) => {
    const h = half(x, cabS[i]), xx = crush(x);
    const r = h.map(([z, y]) => new V3(xx, y, z));
    for (let k = NH - 2; k >= 1; k--) r.push(new V3(xx, h[k][1], -h[k][0]));
    return r;
  });
  const segK = (j) => (j < NH - 1 ? j : 2 * (NH - 1) - 1 - j);
  const sk = (k, side) => (side > 0 ? k : 2 * (NH - 1) - k);
  const doorAt = (x) => doors.find((d) => x <= d.f + 1e-6 && x >= d.r - 1e-6);
  const region = (i, j) => {
    const k = segK(j), xm = (X[i] + X[i + 1]) / 2;
    if (k <= 1) return 'under';
    if (doorAt(xm) && k >= KD - 1 && k <= 21) return null; // 車門殼與下緣門縫
    if (k <= 17) return 'paint';
    if (cabS[i] !== cabS[i + 1]) return 'firewall';
    if (cabS[i]) return k === 18 ? 'trim' : k >= 22 ? 'floor' : 'inner';
    return 'paint';
  };
  const uvOff = opt.uvOff || 0;
  const uvBody = (p, i, j) => { const k = j < NH ? j : 2 * (NH - 1) - j; return [p.x * 0.5 + uvOff, p.y * 0.5 + (k >= 18 ? 0.08 + Math.abs(p.z) * 0.12 : 0)]; };
  const regionGeo = (name) => gridSurface(rings, { keep: (i, j) => region(i, j) === name, closeJ: true, flip: true, uvFn: uvBody });
  P.add(paint, smoothNormals(regionGeo('paint'), 0.6));
  P.add('po_under', regionGeo('under'));
  P.add('rubber', regionGeo('trim'));
  P.add(S.innerMat || 'plastic_black', smoothNormals(regionGeo('inner'), 0.6));
  P.add(S.floorMat || 'plastic_black', regionGeo('floor'));
  P.add('plastic_black', regionGeo('firewall'));
  // 車門開口:前後門框(黑)與門檻
  const ringAt = (x) => rings[X.findIndex((v) => Math.abs(v - x) < 1e-5)];
  for (const d of doors) for (const side of [1, -1]) {
    for (const [x, face] of [[d.f, -1], [d.r, 1]]) {
      const rg = ringAt(x);
      if (!rg) continue;
      const zi = Math.abs(rg[sk(20, side)].z), q = [];
      for (let k = KD - 1; k < 18; k++) {
        const a = rg[sk(k, side)], b = rg[sk(k + 1, side)], ai = new V3(a.x, a.y, zi * side), bi = new V3(b.x, b.y, zi * side);
        q.push(face * side > 0 ? [a, ai, bi, b] : [a, b, bi, ai]);
      }
      P.add('po_gap', quads(q));
    }
    const i0 = X.findIndex((v) => Math.abs(v - d.f) < 1e-5), i1 = X.findIndex((v) => Math.abs(v - d.r) < 1e-5), q = [];
    for (let i = i0; i < i1; i++) {
      const a = rings[i][sk(KD - 1, side)], b = rings[i + 1][sk(KD - 1, side)], ai = rings[i][sk(22, side)], bi = rings[i + 1][sk(22, side)];
      q.push(side > 0 ? [a, ai, bi, b] : [a, b, bi, ai]);
    }
    P.add('rubber', quads(q));
  }

  // ---------- 車門 ----------
  const doorParts = [];
  for (const d of doors) for (const side of [1, -1]) {
    const D = new Parts();
    const i0 = X.findIndex((v) => Math.abs(v - (d.f - G)) < 1e-5), i1 = X.findIndex((v) => Math.abs(v - (d.r + G)) < 1e-5);
    const sub = rings.slice(i0, i1 + 1);
    const outer = sub.map((rg) => { const o = []; for (let k = KD; k <= 18; k++) o.push(rg[sk(k, side)]); return o; });
    const inner = sub.map((rg) => { const o = []; for (let k = 18; k <= 22; k++) o.push(rg[sk(k, side)]); return o; });
    D.add(paint, smoothNormals(gridSurface(outer, { flip: side > 0, uvFn: (p) => [p.x * 0.5 + uvOff, p.y * 0.5] }), 0.6));
    D.add('plastic_black', smoothNormals(gridSurface(inner, { flip: side > 0 }), 0.6));
    const edge = (rg, s) => {
      const zi = Math.abs(rg[sk(20, side)].z), q = [];
      for (let k = KD; k < 18; k++) { const a = rg[sk(k, side)], b = rg[sk(k + 1, side)]; q.push(s * side > 0 ? [a, new V3(a.x, a.y, zi * side), new V3(b.x, b.y, zi * side), b] : [a, b, new V3(b.x, b.y, zi * side), new V3(a.x, a.y, zi * side)]); }
      return quads(q);
    };
    D.add(paint, edge(sub[0], 1));
    D.add(paint, edge(sub[sub.length - 1], -1));
    const bot = [];
    for (let i = 0; i < sub.length - 1; i++) {
      const a = sub[i][sk(KD, side)], b = sub[i + 1][sk(KD, side)], ai = sub[i][sk(22, side)], bi = sub[i + 1][sk(22, side)];
      bot.push(side > 0 ? [a, b, bi, ai] : [a, ai, bi, b]);
    }
    D.add(paint, quads(bot));
    // 門把
    const hx = d.r + 0.17, hy = sideY(hx, 0.86), hz = sideZ(hx, 0.86) + 0.008;
    D.add(opt.chrome ? 'chrome' : paint, rbox(0.15, 0.032, 0.03, 0.012), M(hx, hy, hz * side));
    D.add('po_gap', box(0.16, 0.04, 0.004), M(hx, hy, (hz - 0.012) * side));
    doorParts.push({ D, hinge: new V3(crush(d.f - G), 0, sideZ(d.f, 0.55) * side), side, k: d.k, open: opt.open?.[d.k + (side < 0 ? 2 : 0)] || 0 });
  }
  const doorPart = (k, side) => doorParts.find((q) => q.k === k && q.side === side);

  // ---------- 上車身 ----------
  const tb = Math.tan(gh.tumble);
  const beltAt = (x) => yTop(clamp(x, cabR, cabF));
  const zSide = (x, y) => hwAt(clamp(x, cabR, cabF)) * sideS(1) - rho - 0.025 - (y - beltAt(x)) * tb;
  const roofY = (x) => {
    if (!gh.highRoof) return gh.roof;
    const [x0, h] = gh.highRoof;
    return x > x0 ? gh.roof : x > x0 - 0.3 ? lerp(gh.roof, h, sstep(x0, x0 - 0.3, x)) : h;
  };
  const Aline = (y) => lerp(gh.cowl[0], gh.ws[0], (y - gh.cowl[1]) / (gh.ws[1] - gh.cowl[1]));
  const Rline = (y) => (flatRear ? cabR + 0.01 : lerp(gh.deck[0], gh.rr[0], (y - gh.deck[1]) / (gh.rr[1] - gh.deck[1])));
  const sidePoly = (poly, side, inset = 0, holes = [], inner = false) => { // 側平面上的多邊形 → 3D(UV 0..1)
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(shape, 2);
    const p = g.attributes.position;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setXYZ(i, x, y, (zSide(x, y) - inset) * side);
      uv[i * 2] = (x - x0) / (x1 - x0); uv[i * 2 + 1] = (y - y0) / (y1 - y0);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if ((side < 0) !== inner) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
    g.computeVertexNormals();
    return keepUV(g);
  };
  const frame = (dst, poly, side, off = 0.003) => { // 窗框膠條
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], c = poly[(k + 1) % poly.length];
      const A = new V3(a[0], a[1], (zSide(a[0], a[1]) + off) * side), B = new V3(c[0], c[1], (zSide(c[0], c[1]) + off) * side);
      if (A.distanceTo(B) > 0.03) dst.add('rubber', beam(A, B, 0.014, 0.026, new V3(0, 0, side)));
    }
  };
  const broken = opt.broken || new Set();
  const innerMat = S.innerMat || 'plastic_black';
  const bayPolys = [];
  // 柱線:A(風擋側緣)、規格柱、R(後窗側緣或平尾)
  const winTop = (x) => roofY(x) - 0.06;
  const lines = [{ xb: Aline(beltAt(gh.cowl[0])), xt: Aline(gh.roof - 0.03), w: 0.06, kind: 'A' }];
  for (const [xb, xt, w, m] of S.pil) lines.push({ xb, xt, w, m });
  lines.push({ xb: flatRear ? cabR + 0.012 : gh.deck[0] + 0.02, xt: flatRear ? cabR + 0.012 : gh.rr[0] - 0.02, w: 0.02, kind: 'R' });
  const lx = (L, y, yb, yt) => lerp(L.xb, L.xt, clamp((y - yb) / (yt - yb), 0, 1));
  for (const side of [1, -1]) {
    const sx = side > 0 ? 'r' : 'l';
    for (let b = 0; b < S.bays.length; b++) {
      const type = S.bays[b], L0 = lines[b], L1 = lines[b + 1];
      const yb0 = beltAt(L0.xb) + 0.005, yb1 = beltAt(L1.xb) + 0.005;
      const glassy = type !== 'p' && type !== 'w';
      const o0 = glassy ? L0.w : 0, o1 = glassy ? L1.w : 0;
      const top0 = glassy ? winTop(L0.xt) : roofY(L0.xt) - 0.03, top1 = glassy ? winTop(L1.xt) : roofY(L1.xt) - 0.03;
      const poly = [[lx(L0, yb0, yb0, top0) - o0, yb0], [lx(L1, yb1, yb1, top1) + o1, yb1], [lx(L1, top1, yb1, top1) + o1, top1], [lx(L0, top0, yb0, top0) - o0, top0]];
      if (gh.highRoof && !glassy) { // 高頂:側板延伸到高車頂
        const xr = gh.highRoof[0];
        if (poly[3][0] > xr - 0.3 && poly[2][0] < xr - 0.3) poly.splice(3, 0, [xr - 0.3, roofY(xr - 0.3) - 0.03]);
        poly[2][1] = roofY(poly[2][0]) - 0.03; poly[poly.length - 1][1] = roofY(poly[poly.length - 1][0]) - 0.03;
      }
      const dp = type === 'g0' ? doorPart(0, side) : type === 'g1' ? doorPart(1, side) : null;
      const dst = dp ? dp.D : P;
      if (!glassy) {
        const holes = [];
        if (type === 'w') { // 車廂側窗(上下為車身板)
          const [wy0, wy1] = S.win, xa = S.winX ? S.winX[0] : Math.min(poly[0][0], poly[poly.length - 1][0]) - 0.1, xb = S.winX ? S.winX[1] : Math.max(poly[1][0], poly[2][0]) + 0.1;
          const win = [[xa, wy0], [xb, wy0], [xb, wy1], [xa, wy1]];
          holes.push(win);
          if (broken.has(`${b}${sx}`)) dst.add('po_glass', glassShards(win, side, (x, y) => zSide(x, y) - 0.012, rng));
          else dst.add('po_glass', sidePoly(win, side, 0.012));
          frame(dst, win, side, 0.004);
        }
        dst.add(paint, sidePoly(poly, side, -0.002, holes));
        if (flatRear) dst.add(innerMat, sidePoly(poly, side, 0.035, holes, true));
        continue;
      }
      bayPolys.push({ b, side, type, poly, dst, broken: broken.has(`${b}${sx}`) });
      if (broken.has(`${b}${sx}`)) dst.add('po_glass', glassShards(poly, side, zSide, rng));
      else dst.add('po_glass', sidePoly(poly, side));
      if (type === 'c') dst.add('po_curtain', sidePoly(poly, side, 0.05)); // 窗簾
      frame(dst, poly, side);
    }
    // 柱
    for (let k = 0; k < lines.length - 1; k++) {
      const Ln = lines[k];
      if (Ln.kind === 'R') continue;
      const yb = beltAt(Ln.xb), yt = Ln.kind === 'A' ? gh.roof - 0.03 : winTop(Ln.xt) + 0.035;
      const A0 = new V3(Ln.xb, yb, (zSide(Ln.xb, yb) + 0.004) * side), A1 = new V3(Ln.xt, yt, (zSide(Ln.xt, yt) + 0.004) * side);
      if (Ln.kind === 'A') P.add(paint, beam(A0, A1, 0.05, Ln.w * 1.5, new V3(0, 0, side)), M(0, 0, -0.01 * side));
      else if (S.bays[k] !== 'p' && S.bays[k] !== 'w' || S.bays[k - 1] !== 'p' && S.bays[k - 1] !== 'w') P.add(Ln.m === 'trim' ? 'rubber' : paint, beam(A0, A1, 0.025, Ln.w * 2 + 0.01, new V3(0, 0, side)));
    }
    // 車頂側緣(雨槽)
    const xa = gh.ws[0] - 0.02, xb = flatRear ? cabR + 0.01 : gh.rr[0] - 0.02;
    for (let i = 0; i < 14; i++) {
      const x0 = lerp(xa, xb, i / 14), x1 = lerp(xa, xb, (i + 1) / 14);
      const a = new V3(x0, roofY(x0) - 0.035, (zSide(x0, roofY(x0) - 0.035) + 0.004) * side), c = new V3(x1, roofY(x1) - 0.035, (zSide(x1, roofY(x1) - 0.035) + 0.004) * side);
      P.add('rubber', beam(a, c, 0.012, 0.02, new V3(0, 0, side)));
    }
  }
  // 車頂(外漆 + 內頂棚)
  {
    const xa = gh.ws[0] - 0.02, xb = flatRear ? cabR + 0.01 : gh.rr[0] - 0.02, nx = gh.highRoof ? 22 : 14, nz = 12, out = [], inn = [];
    for (let i = 0; i <= nx; i++) {
      const x = lerp(xa, xb, i / nx), yr = roofY(x), ze = zSide(x, yr - 0.035);
      const o = [], n = [];
      for (let j = 0; j <= nz; j++) {
        const u = (j / nz) * 2 - 1, e = Math.abs(u);
        const y = yr + S.crown * 0.8 * (1 - u * u) - (e > 0.9 ? 0.035 * ((e - 0.9) / 0.1) ** 1.5 : 0);
        o.push(new V3(x, y, u * ze));
        n.push(new V3(x, y - 0.03, u * (ze - 0.03)));
      }
      out.push(o); inn.push(n);
    }
    P.add(paint, smoothNormals(gridSurface(out, { uvFn: (p) => [p.x * 0.5 + uvOff, 0.74 + Math.abs(p.z) * 0.1] }), 0.5));
    P.add(flatRear ? innerMat : 'plastic_black', smoothNormals(gridSurface(inn, { flip: true }), 0.5));
  }
  // 擋風玻璃
  {
    const rows = [];
    for (let i = 0; i <= 6; i++) {
      const y = lerp(gh.cowl[1] + 0.01, gh.roof - 0.03, i / 6), x = Aline(y), ze = zSide(x, y) - 0.03;
      const r = [];
      for (let j = 0; j <= 10; j++) { const u = (j / 10) * 2 - 1; r.push(new V3(x + gh.wsBow * (1 - u * u) * (0.6 + 0.4 * Math.sin((i / 6) * Math.PI)), y, u * ze)); }
      rows.push(r);
    }
    P.add(opt.crack ? 'po_glass_crack' : 'po_glass', keepUV(gridSurface(rows, { uvFn: (p, i, j) => [j / 10, i / 6] })));
    for (const s of [1, -1]) P.add('rubber', beam(new V3(Aline(gh.cowl[1]), gh.cowl[1] + 0.01, (zSide(gh.cowl[0], gh.cowl[1]) - 0.02) * s), new V3(Aline(gh.roof - 0.03), gh.roof - 0.03, (zSide(gh.ws[0], gh.roof) - 0.02) * s), 0.03, 0.03, new V3(1, 0, 0)));
  }
  // 後窗
  if (!flatRear) {
    const rows = [];
    for (let i = 0; i <= 5; i++) {
      const y = lerp(gh.deck[1] + 0.01, gh.roof - 0.03, i / 5), x = Rline(y), ze = zSide(x, y) - 0.025;
      const r = [];
      for (let j = 0; j <= 8; j++) { const u = (j / 8) * 2 - 1; r.push(new V3(x - 0.03 * (1 - u * u), y, u * ze)); }
      rows.push(r);
    }
    P.add(broken.has('rear') ? 'po_glass_crack' : 'po_glass', keepUV(gridSurface(rows, { flip: true, uvFn: (p, i, j) => [j / 8, i / 5] })));
  }
  // 平尾車後門:lift 上掀 / barn 對開;from 'floor' | 'belt'
  const rearParts = [];
  if (flatRear && S.rear) {
    const xr = cabR + 0.012, R2 = S.rear;
    const ylo = R2.from === 'floor' ? yf(cabR) + 0.02 : beltAt(cabR) + 0.006, yhi = roofY(cabR) - 0.04;
    const zAt = (y) => (y > beltAt(cabR) + 0.004 ? zSide(xr, y) : zBody(xr, y)) - 0.006;
    const T = 0.045;
    const panel = (D, zA, zB, y0, y1, win) => {
      const pts = [], n = 10;
      for (let i = 0; i <= n; i++) { const y = lerp(y0, y1, i / n); pts.push([Math.min(zB, zAt(y)), y]); }
      for (let i = n; i >= 0; i--) { const y = lerp(y0, y1, i / n); pts.push([Math.max(zA, -zAt(y)), y]); }
      const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
      if (win) shape.holes.push(new THREE.Path(win.map(([u, v]) => new THREE.Vector2(u, v))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 1 });
      g.rotateY(-HALF).translate(xr, 0, 0);
      D.add(paint, g);
      if (win) {
        const wg = new THREE.ShapeGeometry(new THREE.Shape(win.map(([u, v]) => new THREE.Vector2(u, v))));
        wg.rotateY(-HALF).translate(xr - T * 0.5, 0, 0);
        const p2 = wg.attributes.position, uv = new Float32Array(p2.count * 2);
        for (let i = 0; i < p2.count; i++) { uv[i * 2] = (p2.getZ(i) - win[0][0]) / (win[1][0] - win[0][0]); uv[i * 2 + 1] = (p2.getY(i) - win[0][1]) / (win[2][1] - win[0][1]); }
        wg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        D.add(R2.curtain ? 'po_curtain' : 'po_glass', keepUV(wg));
        for (let k = 0; k < 4; k++) { const a = win[k], c = win[(k + 1) % 4]; D.add('rubber', beam(new V3(xr - T - 0.004, a[1], a[0]), new V3(xr - T - 0.004, c[1], c[0]), 0.016, 0.024, new V3(1, 0, 0))); }
      }
      // 把手
      D.add('chrome', rbox(0.03, 0.035, 0.16, 0.012), M(xr - T - 0.015, lerp(y0, y1, 0.42), (Math.abs(zA) < 0.1 ? zA + Math.sign(zA || 1) * 0.12 : 0)));
    };
    const wy0 = lerp(ylo, yhi, R2.from === 'floor' ? 0.55 : 0.18), wy1 = yhi - 0.08;
    if (R2.type === 'lift') {
      const D = new Parts(), wz = zAt(wy1) - 0.1;
      panel(D, -9, 9, ylo, yhi, [[-wz, wy0], [wz, wy0], [wz, wy1], [-wz, wy1]]);
      rearParts.push({ D, hinge: new V3(xr - 0.02, yhi + 0.025, 0), rot: [0, 0, -(opt.rearOpen ?? 0)] });
    } else {
      for (const s of [1, -1]) {
        const D = new Parts(), wz0 = 0.1, wz1 = zAt(wy1) - 0.1;
        panel(D, s > 0 ? 0.004 : -9, s > 0 ? 9 : -0.004, ylo, yhi, s > 0 ? [[wz0, wy0], [wz1, wy0], [wz1, wy1], [wz0, wy1]] : [[-wz1, wy0], [-wz0, wy0], [-wz0, wy1], [-wz1, wy1]]);
        rearParts.push({ D, hinge: new V3(xr - T, 0, zAt((ylo + yhi) / 2) * s), rot: [0, (opt.rearOpen ?? 0) * s * (s > 0 ? 1 : 1.12), 0] });
      }
    }
    // 門框:兩側門柱 + 門楣(遮住車身斷面)
    for (const s of [1, -1]) P.add(paint, beam(new V3(xr + 0.025, ylo - 0.02, (zAt(ylo) - 0.035) * s), new V3(xr + 0.025, yhi, (zAt(yhi) - 0.035) * s), 0.07, 0.05, new V3(0, 0, 1)));
    P.add(paint, box(0.05, 0.06, zAt(yhi) * 2), M(xr + 0.025, yhi + 0.02, 0));
    if (openRear) { // 地板以下的車尾封板 + 踏板
      const pts = [], last = rings[rings.length - 1];
      const fy0 = yf(cabR);
      for (let k = 2; k <= 15; k++) { const q = last[k]; if (q.y < fy0) pts.push([q.z, q.y]); }
      pts.push([zBody(-hl, fy0), fy0]);
      const all = [...pts, ...pts.slice().reverse().map(([z, y]) => [-z, y])];
      const g = new THREE.ShapeGeometry(new THREE.Shape(all.map(([u, v]) => new THREE.Vector2(u, v))));
      g.rotateY(-HALF).translate(last[0].x + 0.002, 0, 0);
      P.add(paint, g);
      if (S.step) P.add('rubber', rbox(0.26, 0.05, S.W * 0.78, 0.015), M(-hl - 0.08, fy0 - 0.3, 0));
      P.add(innerMat, box(0.03, 0.04, zAt(fy0) * 2 - 0.04), M(-hl + 0.02, fy0 + 0.01, 0));
    }
  }
  // 雨刷
  for (const zz of [-0.34, 0.16]) {
    const y = gh.cowl[1] + 0.025, x = Aline(y) + 0.015, y2 = y + 0.1, x2 = Aline(y2) + 0.015;
    P.add('rubber', beam(new V3(x, y, zz - 0.02), new V3(x2, y2, zz + 0.45), 0.012, 0.02, new V3(0, 1, 0)));
    P.add('rubber', cyl(0.012, 0.012, 0.03, 8), M(x, y - 0.01, zz - 0.02));
  }

  // ---------- 內裝 ----------
  const zIn = hwAt(cabF - 0.3) * sideS(1) - rho - 0.075;
  const dy = gh.cowl[1], dx = S.dash, seatM = opt.seat || 'vinyl_seat';
  P.add('plastic_black', rbox(0.52, 0.22, zIn * 2, 0.06), M(dx - 0.05, dy - 0.05, 0));
  P.add('plastic_black', rbox(0.24, 0.1, 0.36, 0.045), M(dx - 0.22, dy + 0.04, -0.36));
  P.add('rubber', rbox(0.3, 0.42, 0.2, 0.03), M(dx - 0.2, dy - 0.3, 0));
  {
    const sw = M(dx - 0.38, dy + 0.01, -0.36, 0, 0, 0.45);
    P.add('rubber', tor(0.18, 0.016, 8, 28).rotateY(HALF), sw);
    P.add('rubber', cyl(0.05, 0.06, 0.07, 12).rotateZ(HALF), sw);
    for (const a of [0, 2.2, -2.2]) P.add('rubber', box(0.02, 0.17, 0.03), mul2(sw, M(0, Math.cos(a) * 0.09, Math.sin(a) * 0.09, a, 0, 0)));
    P.add('rubber', cyl(0.024, 0.024, 0.3, 8).rotateZ(HALF), mul2(sw, M(0.18, -0.02, 0)));
  }
  const seat = (x, z, w = 0.5) => {
    const fy = yf(x);
    P.add(seatM, rbox(0.5, 0.14, w, 0.05), M(x + 0.05, fy + 0.27, z));
    P.add(seatM, rbox(0.13, 0.62, w * 0.95, 0.05), M(x - 0.21, fy + 0.6, z, 0, 0, 0.18));
    P.add(seatM, rbox(0.1, 0.17, w * 0.52, 0.04), M(x - 0.28, fy + 1.0, z, 0, 0, 0.12));
    P.add('rubber', box(0.4, 0.2, w * 0.86), M(x + 0.05, fy + 0.1, z));
  };
  seat(S.seats.front, -0.37); seat(S.seats.front, 0.37);
  for (const key of ['rear', 'rear2']) {
    const x = S.seats[key];
    if (x === undefined) continue;
    const fy = yf(x), w = zIn * 2 - 0.08;
    P.add(seatM, rbox(0.5, 0.14, w, 0.05), M(x + 0.05, fy + 0.27, 0));
    P.add(seatM, rbox(0.14, 0.58, w, 0.05), M(x - 0.2, fy + 0.57, 0, 0, 0, 0.2));
    for (const z of [-0.4, 0, 0.4]) P.add(seatM, rbox(0.1, 0.14, 0.24, 0.04), M(x - 0.25, fy + 0.9, z, 0, 0, 0.14));
  }
  if (!flatRear && !gh.hatch) P.add('plastic_black', box(0.4, 0.02, zIn * 2), M(gh.deck[0] + 0.24, gh.deck[1] - 0.025, 0));
  if (S.deck) { // 靈車:棺木平台(絨布面 + 鍍鉻滾輪軌)
    const [x0, dyk] = S.deck, x1 = cabR + 0.02, fy = yf(x0), w = zIn * 2 - 0.02;
    P.add(S.floorMat || 'plastic_black', box(x0 - x1, dyk - fy, w), M((x0 + x1) / 2, (dyk + fy) / 2, 0));
    for (const z of [-0.22, 0.22]) P.add('chrome', box(x0 - x1 - 0.1, 0.02, 0.04), M((x0 + x1) / 2, dyk + 0.01, z));
  }
  P.add('rubber', rbox(0.05, 0.065, 0.22, 0.02), M(gh.ws[0] - 0.06, gh.roof - 0.1, 0));
  P.add('plastic_black', box(0.24, 0.012, 0.32).translate(-0.12, 0, 0), M(gh.ws[0] - 0.04, gh.roof - 0.06, -0.33, 0, 0, opt.visor ? 1.2 : 0.06));

  // ---------- 外觀細節(貼合車身曲面的燈具/水箱罩/保險桿)----------
  // 車頭/車尾表面:在端部反解 zBody(x, y) = |z|,回傳表面 x(找不到 → null)
  const endX = (front, z, y) => {
    let a = front ? hl - 0.8 : -hl + 0.8, b = front ? hl : -hl;
    if (zBody(a, y) < Math.abs(z)) return null;
    for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (zBody(m, y) > Math.abs(z)) a = m; else b = m; }
    return (a + b) / 2;
  };
  // 端面貼合片:|z| ∈ [z0,z1](side 決定左右)、y ∈ [y0,y1],沿俯視法線外推 off 公尺
  const endPatch = (front, z0, z1, y0, y1, side, off = 0.004, nu = 6, nv = 3) => {
    const rows = [];
    for (let i = 0; i <= nu; i++) {
      const r = [];
      for (let j = 0; j <= nv; j++) {
        const y = lerp(y0, y1, j / nv);
        let z = lerp(z0, z1, i / nu);
        let x = endX(front, z, y);
        if (x === null) { z = Math.min(z, zBody(front ? hl - 0.8 : -hl + 0.8, y) - 0.002); x = endX(front, z, y) ?? (front ? hl : -hl); }
        const x2 = endX(front, z + 0.01, y) ?? x;
        const tx = x2 - x, l = Math.hypot(tx, 0.01) || 1;
        const nx = (front ? 1 : -1) * (0.01 / l), nz = Math.abs(tx / l);
        r.push(new V3(crush(x) + nx * off, y, (z + nz * off) * side));
      }
      rows.push(r);
    }
    return gridSurface(rows, { flip: front ? side > 0 : side < 0 });
  };
  const hwF = hwAt(hl - 0.25), hwR = hwAt(-hl + 0.25);
  const hy = S.hl[1], ty = S.tl[1];
  const brokenL = [crumple > 0.3 || rng() < 0.12, crumple > 0.3 || rng() < 0.12];
  for (const s of [1, -1]) {
    const bi = s > 0 ? 0 : 1;
    // 頭燈(玻璃燈殼 + 黑框)、方向燈
    P.add(brokenL[bi] ? 'po_gap' : 'po_headlight', endPatch(true, hwF * 0.5, hwF * 0.93, hy - 0.055, hy + 0.05, s, 0.016));
    P.add('rubber', endPatch(true, hwF * 0.48, hwF * 0.95, hy - 0.07, hy + 0.065, s, 0.009, 4, 2));
    P.add('po_amber', endPatch(true, hwF * 0.8, hwF * 0.97, hy - 0.11, hy - 0.075, s, 0.013, 3, 1));
    // 尾燈、倒車燈
    if (!openRear) {
      P.add('po_taillight', endPatch(false, hwR * 0.5, hwR * 0.95, ty - 0.06, ty + 0.06, s, 0.016));
      P.add('po_headlight', endPatch(false, hwR * 0.36, hwR * 0.49, ty - 0.03, ty + 0.03, s, 0.016, 2, 1));
      P.add('rubber', endPatch(false, hwR * 0.34, hwR * 0.97, ty - 0.075, ty + 0.075, s, 0.009, 4, 2));
    } else { // 平尾開門車:尾燈裝在門柱外側(直立燈組)
      const xr = cabR + 0.012, zz = (y) => (y > beltAt(cabR) ? zSide(xr, y) : zBody(xr, y)) - 0.04;
      for (const [y0, y1, m] of [[ty - 0.2, ty, 'po_taillight'], [ty + 0.02, ty + 0.1, 'po_amber'], [ty + 0.12, ty + 0.2, 'po_headlight']]) P.add(m, rbox(0.03, y1 - y0, 0.08, 0.012), M(xr - 0.012, (y0 + y1) / 2, zz((y0 + y1) / 2) * s));
      const yt2 = roofY(cabR) - 0.12;
      P.add('po_taillight', rbox(0.06, 0.08, 0.14, 0.02), M(xr - 0.02, yt2, (zz(yt2) - 0.02) * s));
    }
    // 後照鏡(裝在前門)
    const mx = doors[0].f - 0.1, my = beltAt(mx) + 0.07, mz = (zSide(mx, my) + 0.13) * s;
    const dp = doorPart(0, s), dst = dp ? dp.D : P;
    dst.add(paint, rbox(0.12, 0.11, 0.19, 0.04), M(mx, my, mz));
    dst.add('rubber', box(0.06, 0.04, 0.12), M(mx + 0.02, my - 0.03, mz - 0.1 * s));
    dst.add('chrome', box(0.004, 0.085, 0.16), M(mx - 0.062, my, mz));
  }
  // 水箱罩(黑底 + 鍍鉻橫條)、下進氣口
  for (const s of [1, -1]) {
    P.add('rubber', endPatch(true, 0, hwF * 0.46, hy - 0.075, hy + 0.04, s, 0.009, 3, 2));
    for (let k = 0; k < 3; k++) P.add('chrome', endPatch(true, 0, hwF * 0.44, hy - 0.06 + k * 0.042, hy - 0.05 + k * 0.042, s, 0.018, 3, 1));
  }
  const yb0 = yBot0(hl - 0.1), ybr = yBot0(-hl + 0.1);
  for (const s of [1, -1]) P.add('rubber', endPatch(true, 0, hwF * 0.7, yb0 + 0.03, yb0 + 0.1, s, 0.009, 4, 1));
  // 保險桿:沿俯視外形掃掠的護條(車頭、車尾)
  const bumper = (front, yc, h, mat2, depth = 0.03) => {
    const half2 = [];
    for (let i = 0; i <= 14; i++) {
      const x = front ? lerp(hl - 0.42, hl, (i / 14) ** 0.6) : lerp(-hl + 0.42, -hl, (i / 14) ** 0.6);
      half2.push([x, zBody(x, yc)]);
    }
    const full = [...half2, ...half2.slice(0, -1).reverse().map(([x, z]) => [x, -z])];
    const prof = [[0, -h / 2], [depth * 0.7, -h / 2 + 0.01], [depth, -h * 0.2], [depth, h * 0.2], [depth * 0.7, h / 2 - 0.01], [0, h / 2]];
    const rows = [];
    for (let i = 0; i < full.length; i++) {
      const [x, z] = full[i], [xa, za] = full[Math.max(0, i - 1)], [xb, zb] = full[Math.min(full.length - 1, i + 1)];
      let nx = zb - za, nz = -(xb - xa);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
      if (nx * (front ? 1 : -1) < 0) { nx = -nx; nz = -nz; }
      rows.push(prof.map(([d, dy]) => new V3(crush(x) + nx * d, yc + dy, z + nz * d)));
    }
    P.add(mat2, smoothNormals(gridSurface(rows, { flip: !front }), 0.5));
  };
  const chromeB = opt.chromeBumper;
  bumper(true, yb0 + 0.17, 0.12, chromeB ? 'chrome' : paint, 0.03);
  bumper(true, yb0 + 0.11, 0.035, 'rubber', 0.036);
  bumper(false, ybr + 0.2, 0.14, chromeB ? 'chrome' : paint, 0.03);
  bumper(false, ybr + 0.13, 0.035, 'rubber', 0.036);
  // 車牌(貼在保險桿/車尾面)
  const plate = (front, y) => {
    const x = endX(front, 0.05, y);
    if (x === null) return;
    const [u, v, w, h] = labelUV(`plate${(opt.plate ?? 0) % PLATE_COUNT}`);
    const g = new THREE.PlaneGeometry(0.34, 0.15);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * w, v + uv.getY(i) * h);
    g.rotateY(front ? HALF : -HALF);
    const xx = crush(x) + (front ? 0.04 : -0.04);
    P.add('po_label', keepUV(g), M(xx, y, 0));
    P.add('rubber', box(0.04, 0.165, 0.355), M(xx - (front ? 0.0205 : -0.0205), y, 0));
  };
  plate(true, S.plateF[1]);
  plate(false, S.plateR[1]);
  P.add('chrome', cyl(0.033, 0.033, 0.16, 10).rotateZ(HALF), M(-hl + 0.1, ybr - 0.01, -S.W * 0.28));
  {
    const ax2 = lerp(gh.ws[0], gh.rr[0], 0.75);
    P.add('rubber', rod(new V3(ax2, roofY(ax2) + S.crown * 0.6, 0.06), new V3(ax2 - 0.16, roofY(ax2) + 0.25, 0.06), 0.004, 4));
  }
  for (const ax of [S.axF, S.axR]) {
    const liner = new THREE.CylinderGeometry(S.arch - 0.006, S.arch - 0.006, S.W * 0.84, 22, 1, true, HALF, Math.PI);
    liner.rotateX(HALF);
    P.add('po_under', liner, M(ax, archC, 0));
  }
  P.add('po_under', box(S.L * 0.82, 0.04, S.W * 0.82), M(0, yBot0(0) + 0.015, 0));

  // ---------- 貼花 ----------
  // 車身側面(順著曲面,+3mm);自動依車門範圍切開
  const sideDecal = (name, x0, x1, y0, y1, side, key = 'po_decal') => {
    const cuts = [x0, x1];
    for (const d of doors) for (const v of [d.f, d.r]) if (v < x0 && v > x1) cuts.push(v);
    cuts.sort((a, b) => b - a);
    const [u0, v0, uw, vh] = decalUV(name);
    for (let c = 0; c < cuts.length - 1; c++) {
      const xa = cuts[c] - (c > 0 ? G : 0), xb = cuts[c + 1] + (c < cuts.length - 2 ? G : 0), xm = (xa + xb) / 2;
      const ta = (x0 - xa) / (x0 - x1), tb2 = (x0 - xb) / (x0 - x1);
      const g = decalGrid((u, v) => { const x = lerp(xa, xb, u), y = lerp(y0, y1, v); const above = y > beltAt(x); return new V3(x, y, (above ? zSide(x, y) + 0.004 : zBody(x, y) + 0.004) * side); },
        side < 0 ? [u0 + ta * uw, v0, (tb2 - ta) * uw, vh] : [u0 + (1 - ta) * uw, v0, -(tb2 - ta) * uw, vh], 8, 4, side > 0);
      const dd = doorAt(xm), dp = dd && etaOf(xm, (y0 + y1) / 2) > 0.16 && y1 < beltAt(xm) + 0.02 ? doorPart(dd.k, side) : null;
      (dp ? dp.D : P).add(key, g);
    }
  };
  // 頂面(引擎蓋/車頂)
  const topDecal = (name, xc, zc, sx, sz, rot = 0, fu = false, fv = false) => {
    let [u0, v0, uw, vh] = decalUV(name);
    if (fu) { u0 += uw; uw = -uw; }
    if (fv) { v0 += vh; vh = -vh; }
    const c = Math.cos(rot), s = Math.sin(rot);
    P.add('po_decal', decalGrid((u, v) => { const lx2 = (u - 0.5) * sx, lz = (v - 0.5) * sz; const x = clamp(xc + lx2 * c - lz * s, -hl + 0.02, hl - 0.02), z = zc + lx2 * s + lz * c; const y = x > gh.cowl[0] || x < cabR ? yTop(x, z) + S.crown * Math.max(0, 1 - (z / Math.max(0.1, hwAt(x))) ** 2) * 0.9 + 0.004 : roofY(x) + S.crown * 0.8 * Math.max(0, 1 - (z / Math.max(0.1, zSide(x, roofY(x)))) ** 2) + 0.004; return new V3(x, y, z); }, [u0, v0, uw, vh], 6, 6, true));
  };
  // 車窗內側貼花(血手印等):bay 為窗位、(u,v) 為窗內相對位置
  const winDecal = (name, b, side, u, v, size) => {
    const w = bayPolys.find((q) => q.b === b && q.side === side && !q.broken);
    if (!w) return false;
    const [p0, p1, p2, p3] = w.poly;
    const x = lerp(lerp(p0[0], p1[0], u), lerp(p3[0], p2[0], u), v), y = lerp(lerp(p0[1], p1[1], u), lerp(p3[1], p2[1], u), v);
    const [u0, v0, uw, vh] = decalUV(name);
    w.dst.add('po_decal', decalGrid((a, c) => { const xx = x + (a - 0.5) * size * (side > 0 ? -1 : 1), yy = y + (c - 0.5) * size; return new V3(xx, yy, (zSide(xx, yy) - 0.012) * side); }, [u0, v0, uw, vh], 1, 1, side < 0));
    return true;
  };
  return { P, doors: doorParts, rearParts, winDecal, bayPolys, S, yTop, yBot, hwAt, zSide, zBody, beltAt, roofY, sideY, sideDecal, topDecal, etaOf, crush, yf, Aline };
}
// 破窗:沿窗框殘留的鋸齒碎片(雙面)
function glassShards(poly, side, zSide, rng) {
  const pos = [];
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.06));
    for (let i = 0; i < n; i++) {
      if (rng() < 0.3) continue;
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2 + (rng() - 0.5) / n;
      const p0 = [lerp(a[0], b[0], t0), lerp(a[1], b[1], t0)], p1 = [lerp(a[0], b[0], t1), lerp(a[1], b[1], t1)];
      const pm = [lerp(a[0], b[0], tm), lerp(a[1], b[1], tm)], d = rng() * 0.16 + 0.02;
      const tip = [pm[0] + (cx - pm[0]) * d, pm[1] + (cy - pm[1]) * d];
      const tri = [p0, p1, tip].map((p) => [p[0], p[1], zSide(p[0], p[1]) * side]);
      for (const p of tri) pos.push(...p);
      for (const p of [tri[0], tri[2], tri[1]]) pos.push(...p);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(0.5), 2));
  g.computeVertexNormals();
  return keepUV(g);
}

// ---------- 車輪(實例池)----------
function tireGeo(R, w, flat) {
  const hw = w / 2, rim = R * 0.66;
  const prof = [[rim, -hw * 0.82], [rim + 0.03, -hw * 0.95], [R * 0.87, -hw], [R * 0.95, -hw * 0.95], [R * 0.985, -hw * 0.83], [R, -hw * 0.68]];
  for (const g of [0]) prof.push([R, (g - 0.09) * hw], [R - 0.008, (g - 0.05) * hw], [R - 0.008, (g + 0.05) * hw], [R, (g + 0.09) * hw]);
  prof.push([R, hw * 0.68], [R * 0.985, hw * 0.83], [R * 0.95, hw * 0.95], [R * 0.87, hw], [rim + 0.03, hw * 0.95], [rim, hw * 0.82]);
  const g = lathe(prof, 14);
  g.rotateX(HALF);
  const p = g.attributes.position;
  const floor = -(R - 0.012);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (flat) {
      const k = sstep(-R * 0.3, -R * 0.95, y);
      const lim = -(rim + 0.03);
      if (y < lim) y = lim - (y - lim) * -0.04;
      z *= 1 + 0.42 * k;
      x *= 1 + 0.16 * k;
    } else if (y < floor) { z *= 1 + (floor - y) * 2.5; y = floor; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function rimGeo(R, w, style) {
  const P = new Parts(), rim = R * 0.66, hw = w / 2;
  P.add(style === 'steel' ? 'cast_iron' : 'aluminum', lathe([[rim - 0.014, -hw * 0.8], [rim, -hw * 0.84], [rim + 0.006, -hw * 0.72], [rim - 0.012, -hw * 0.6], [rim - 0.016, hw * 0.5], [rim + 0.008, hw * 0.74], [rim + 0.004, hw * 0.86], [rim - 0.016, hw * 0.82]], 14).rotateX(HALF));
  if (style === 'steel') {
    P.add('aluminum', lathe([[rim - 0.004, hw * 0.74], [rim * 0.92, hw * 0.78], [rim * 0.7, hw * 0.86], [0.05, hw * 0.92], [0.0, hw * 0.93]], 12).rotateX(HALF));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; P.add('rubber', box(0.045, 0.012, 0.01), M(Math.cos(a) * rim * 0.72, Math.sin(a) * rim * 0.72, hw * 0.87, 0, 0, a)); }
  } else {
    P.add('aluminum', lathe([[0.07, hw * 0.4], [0.06, hw * 0.7], [0.045, hw * 0.78], [0.0, hw * 0.79]], 10).rotateX(HALF));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      const sp = box(rim - 0.07, 0.044, 0.03);
      sp.translate((rim - 0.07) / 2 + 0.06, 0, 0);
      P.add('aluminum', sp, M(0, 0, hw * 0.6, 0, 0, a));
      P.add('chrome', cyl(0.009, 0.009, 0.02, 6).rotateX(HALF), M(Math.cos(a + 0.63) * 0.05, Math.sin(a + 0.63) * 0.05, hw * 0.8));
    }
  }
  P.add('rust', cyl(R * 0.47, R * 0.47, 0.022, 12).rotateX(HALF), M(0, 0, -hw * 0.25));
  P.add('cast_iron', rbox(0.1, 0.16, 0.06, 0.02), M(-R * 0.35, R * 0.22, -hw * 0.1, 0, 0, 0.6));
  return P;
}
function placeWheel(ctx, R, w, style, flat, m) {
  const key = `${R.toFixed(2)}_${w.toFixed(3)}`;
  pool(ctx, `tire_${key}_${flat ? 'f' : 'o'}`, () => [{ geo: tireGeo(R, w, flat), mat: 'tire' }], 32).add(m);
  pool(ctx, `rim_${key}_${style}`, () => rimGeo(R, w, style), 32).add(m);
}

// ---------- 閃爍警示燈(動態材質;只在可見時更新)----------
export function beaconMats(pattern = 'police') {
  const red = new THREE.MeshStandardMaterial({ color: 0x3a0606, roughness: 0.2, emissive: 0xff1a10, emissiveIntensity: 0 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x06103a, roughness: 0.2, emissive: pattern === 'police' ? 0x2050ff : 0xffffff, emissiveIntensity: 0 });
  return { red, blue };
}
// 警示燈亮度(0..1):雙閃交替
export const strobe = (t, phase) => { const c = (t * 1.6 + phase) % 1; return (c < 0.08 || (c > 0.16 && c < 0.24)) ? 1 : 0.04; };

// ---------- 擺放 ----------
const PAINTS = ['po_paint_white', 'po_paint_silver', 'po_paint_black', 'po_paint_blue', 'po_paint_red', 'po_paint_green', 'po_paint_beige', 'po_paint_gray', 'po_paint_maroon', 'po_paint_skyblue', 'po_paint_taxi', 'po_paint_white', 'po_paint_silver', 'po_paint_black'];
let carSerial = 0;
export function resetVehicles() { carSerial = 0; }
// 依障礙物格子放一台車;回傳 { root, tilt, car, yaw, S }
export function placeVehicle(ctx, o, kind, extra = {}) {
  const rng = ctx.rng;
  const idx = carSerial++;
  const S = SPECS[kind];
  const along = (o.axis || (o.sx >= o.sz ? 'EW' : 'NS')) === 'EW';
  const flip = extra.flip ?? rng.chance(0.5);
  const yaw = (along ? 0 : HALF) + (flip ? Math.PI : 0) + (extra.yawJitter ?? rng.range(-0.045, 0.045));
  const broken = new Set();
  for (let b = 0; b < S.bays.length; b++) for (const sx of ['r', 'l']) if (S.bays[b] !== 'p' && rng.chance(extra.brokenP ?? 0.2)) broken.add(`${b}${sx}`);
  if (rng.chance(extra.rearP ?? 0.2)) broken.add('rear');
  const open = [0, 0, 0, 0];
  if (extra.open) extra.open.forEach((v, i) => (open[i] = v));
  else if (rng.chance(0.42)) open[rng.int(0, S.doors.length > 1 ? 3 : 2) % (S.doors.length > 1 ? 4 : 4)] = rng.range(0.55, 1.1);
  if (S.doors.length < 2) { open[1] = 0; open[3] = 0; }
  const opt = {
    paint: extra.paint || PAINTS[idx % PAINTS.length], broken, open, rng, plate: idx, uvOff: rng.range(0, 4),
    dent: extra.dent !== undefined ? extra.dent : rng.chance(0.4) ? [S.axF + rng.range(-0.25, 0.35), rng.range(-0.4, 0.4), rng.range(0.22, 0.4), rng.range(0.035, 0.09)] : null,
    crumple: extra.crumple ?? (rng.chance(0.12) ? rng.range(0.4, 0.9) : 0), crack: extra.crack ?? rng.chance(0.28),
    seat: rng.chance(0.3) ? 'leather' : 'vinyl_seat', chrome: kind === 'hearse', visor: rng.chance(0.35), rearOpen: extra.rearOpen ?? 0, chromeBumper: extra.chromeBumper ?? rng.chance(0.25),
  };
  const car = buildVehicle(kind, opt);
  if (extra.decorate) extra.decorate(car, opt);
  // 懸吊:輪心高度(爆胎較低)→ 車身俯仰/側傾
  const R = S.tire;
  const flats = extra.flats || [0, 1, 2, 3].map(() => rng.chance(extra.flatP ?? 0.18));
  const wheels = [[S.axF, 1], [S.axR, 1], [S.axF, -1], [S.axR, -1]].map(([x, s], i) => ({ x, s, flat: flats[i], h: flats[i] ? R * 0.66 + 0.03 : R - 0.012 }));
  const sag = extra.sag ?? rng.range(0.008, 0.03);
  const dh = (w) => w.h - (R - 0.012) - sag;
  const front = (dh(wheels[0]) + dh(wheels[2])) / 2, rear = (dh(wheels[1]) + dh(wheels[3])) / 2;
  const right = (dh(wheels[0]) + dh(wheels[1])) / 2, left = (dh(wheels[2]) + dh(wheels[3])) / 2;
  const pitch = Math.atan2(front - rear, S.axF - S.axR), roll = Math.atan2(right - left, S.W * 0.86);
  const midY = (front + rear) / 2 - ((S.axF + S.axR) / 2) * Math.tan(pitch);
  const root = new THREE.Group();
  root.position.set(o.x + (extra.dx || 0), o.y, o.z + (extra.dz || 0));
  root.rotation.y = yaw;
  const tilt = new THREE.Group();
  tilt.position.y = midY;
  tilt.rotation.set(-roll, 0, pitch, 'XYZ');
  tilt.add(car.P.group());
  for (const d of car.doors) {
    const g = d.D.group();
    if (d.open) {
      const piv = new THREE.Group();
      piv.position.copy(d.hinge);
      piv.rotation.y = d.open * d.side;
      g.position.set(-d.hinge.x, 0, -d.hinge.z);
      piv.add(g);
      tilt.add(piv);
    } else tilt.add(g);
  }
  for (const d of car.rearParts) {
    const g = d.D.group(), piv = new THREE.Group();
    piv.position.copy(d.hinge);
    piv.rotation.set(d.rot[0], d.rot[1], d.rot[2]);
    g.position.set(-d.hinge.x, -d.hinge.y, -d.hinge.z);
    piv.add(g);
    tilt.add(piv);
  }
  root.add(tilt);
  if (extra.ground) { const GP = new Parts(); extra.ground(GP, car, root); if (GP.map.size) root.add(GP.group({ shadow: false })); }
  ctx.add(root, { static: true, collide: false });
  if (extra.after) extra.after(ctx, car, tilt, root);
  root.updateMatrix();
  const style = extra.rim || (kind === 'van' || kind === 'amb' || rng.chance(0.35) ? 'steel' : 'alloy');
  for (const w of wheels) placeWheel(ctx, R, 0.205 * (S.W / 1.76), style, w.flat, mul2(root.matrix, M(w.x, w.h, (S.W / 2 - 0.115) * w.s, 0, w.s > 0 ? 0 : Math.PI, 0)));
  // 碰撞(車身範圍,不含打開的車門)
  const ex = along ? S.L * 0.97 : S.W * 0.96, ez = along ? S.W * 0.96 : S.L * 0.97;
  const top = (S.gh.highRoof ? S.gh.highRoof[1] : S.gh.roof) + 0.03;
  if (!extra.noCollide) {
    // 分三段(與車身外形一致,子彈能從引擎蓋/後車廂上方飛過):車頭到引擎蓋高度(引擎擋子彈)、車廂到車頂(車門鈑金可穿)、後車廂
    const len = along ? Math.min(ex, o.sx + 0.3) : Math.min(ez, o.sz + 0.3), wid = along ? Math.min(ez, o.sz + 0.3) : Math.min(ex, o.sx + 0.3);
    const fs = (along ? Math.cos(yaw) : -Math.sin(yaw)) >= 0 ? 1 : -1, h2 = len / 2, gh = S.gh;
    const xf = Math.min(h2, gh.cowl[0] - 0.15 * (gh.cowl[0] - gh.ws[0])), xr = Math.max(-h2, gh.flatRear ? S.cab[1] : (gh.deck[0] + gh.rr[0]) / 2); // 引擎蓋到擋風玻璃底(陡的擋風玻璃不算進引擎蓋)
    const seg = (a, b, hgt, mat) => {
      if (b - a < 0.05) return;
      const m = (a + b) / 2 * fs, cx = root.position.x + (along ? m : 0), cz = root.position.z + (along ? 0 : m);
      solid(ctx, cx, o.y, cz, along ? b - a : wid, hgt, along ? wid : b - a, mat);
    };
    seg(xf, h2, gh.cowl[1] + 0.02, 'heavy');
    seg(xr, xf, top, 'car');
    seg(-h2, xr, gh.deck[1] + 0.02, 'car');
  }
  return { root, tilt, car, yaw, S, opt, wheels, along };
}
export { SPECS };
