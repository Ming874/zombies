import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 程式生成人體用的基礎工具:亂數、雜訊、管狀體、頭部雕塑、蒙皮權重、頂點上色、合併。
// 座標:公尺,+Y 向上,角色面向 +Z,角色左側為 +X。

const V3 = THREE.Vector3;
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const G = (d2, r) => Math.exp(-d2 / (r * r));

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.pick = (arr) => arr[(f() * arr.length) | 0];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// ---------- Perlin 雜訊 ----------
const P = new Uint8Array(512);
{
  const r = rng(7331);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y, z) => {
  h &= 15;
  const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
};
export function noise3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = fade(x), v = fade(y), w = fade(z);
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z), u), lerp(grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1), u), lerp(grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1), u), v),
    w,
  );
}
export function fbm(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// 等距取樣表的平滑內插(Catmull-Rom)
export function prof(a, t) {
  const n = a.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = a[Math.max(0, i - 1)], p1 = a[i], p2 = a[i + 1], p3 = a[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

export function segDist2(x, y, z, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  const t = clamp(((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / l2, 0, 1);
  const dx = x - a.x - abx * t, dy = y - a.y - aby * t, dz = z - a.z - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

// ---------- 法線 ----------
// 重算法線後,把同位置的頂點(接縫、極點、嘴縫)平均,避免光影斷層
export function smoothNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const map = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const k = `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`;
    const e = map.get(k);
    if (e) e.push(i);
    else map.set(k, [i]);
  }
  for (const e of map.values()) {
    if (e.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of e) { x += n[i]; y += n[i + 1]; z += n[i + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    for (const i of e) { n[i] = x / l; n[i + 1] = y / l; n[i + 2] = z / l; }
  }
  return g;
}

// 確保三角形朝外(以 inside 為內部參考點)
function orient(g, inside) {
  const p = g.attributes.position.array, idx = g.index.array;
  let s = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    s += nx * (p[a] - inside.x) + ny * (p[a + 1] - inside.y) + nz * (p[a + 2] - inside.z);
  }
  if (s < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
}

export function flip(g) {
  const idx = g.index.array;
  for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

// ---------- 管狀體 ----------
// 沿 a→b;shape(t, θ) 回傳截面上的 [側向, 前向] 偏移(公尺)。capA/capB = 0 代表開口(布料)
const TEX = 0.2; // 細節貼圖每塊 20cm
export function tube(a, b, shape, o = {}) {
  const cols = o.cols ?? 16, rows = o.rows ?? 8, capRows = o.capRows ?? 4;
  const t0 = o.t0 ?? 0, t1 = o.t1 ?? 1;
  const d = new V3().subVectors(b, a);
  const L = d.length();
  d.divideScalar(L);
  const F = o.front ? o.front.clone() : new V3(0, 0, 1);
  F.addScaledVector(d, -F.dot(d));
  if (F.lengthSq() < 1e-6) F.set(1, 0, 0).addScaledVector(d, -d.x);
  F.normalize();
  const S = new V3().crossVectors(d, F);
  const avgR = (t) => { let s = 0; for (let k = 0; k < 8; k++) { const q = shape(t, (k / 8) * TAU); s += Math.hypot(q[0], q[1]); } return s / 8; };
  const R = [];
  if (o.capA !== 0) { const c = avgR(t0) * (o.capA ?? 0.85); for (let k = 0; k < capRows; k++) { const ph = (k / capRows) * Math.PI / 2; R.push(t0, Math.sin(ph), -c * Math.cos(ph)); } }
  for (let i = 0; i <= rows; i++) R.push(lerp(t0, t1, i / rows), 1, 0);
  if (o.capB !== 0) { const c = avgR(t1) * (o.capB ?? 0.85); for (let k = capRows - 1; k >= 0; k--) { const ph = (k / capRows) * Math.PI / 2; R.push(t1, Math.sin(ph), c * Math.cos(ph)); } }
  const nr = R.length / 3, C1 = cols + 1;
  const uMax = Math.max(1, Math.round((avgR((t0 + t1) / 2) * TAU) / TEX));
  const hA = o.capA === 0 && o.hemA !== false, hB = o.capB === 0 && o.hemB !== false; // 開口端是否為磨損布邊
  const pos = new Float32Array(nr * C1 * 3), uv = new Float32Array(nr * C1 * 2), edge = new Float32Array(nr * C1);
  for (let r = 0; r < nr; r++) {
    const t = R[r * 3], sc = R[r * 3 + 1], ax = t * L + R[r * 3 + 2];
    const e = Math.min(hA ? (t - t0) * L : 9, hB ? (t1 - t) * L : 9);
    for (let c = 0; c <= cols; c++) {
      const q = shape(t, (c / cols) * TAU), i = r * C1 + c;
      pos[i * 3] = a.x + d.x * ax + (S.x * q[0] + F.x * q[1]) * sc;
      pos[i * 3 + 1] = a.y + d.y * ax + (S.y * q[0] + F.y * q[1]) * sc;
      pos[i * 3 + 2] = a.z + d.z * ax + (S.z * q[0] + F.z * q[1]) * sc;
      uv[i * 2] = (c / cols) * uMax;
      uv[i * 2 + 1] = ax / TEX;
      edge[i] = e;
    }
  }
  const idx = [];
  for (let r = 0; r < nr - 1; r++) {
    for (let c = 0; c < cols; c++) { const i0 = r * C1 + c, i1 = i0 + 1, i2 = i0 + C1, i3 = i2 + 1; idx.push(i0, i2, i1, i1, i2, i3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.edge = edge;
  orient(g, new V3().addVectors(a, b).multiplyScalar(0.5));
  return smoothNormals(g);
}

// 標準幾何(球、盒、圓柱、環)經矩陣變換後當部件用
export function prim(geo, m) {
  if (m) geo.applyMatrix4(m);
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  return geo;
}
export const mat4 = (pos, rot = [0, 0, 0], scl = [1, 1, 1]) =>
  new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new V3(...scl));

// 沿法線位移;fn(x,y,z,nx,ny,nz,i) → 公尺
export function displace(g, fn) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  for (let i = 0, v = 0; i < p.length; i += 3, v++) {
    const d = fn(p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2], v);
    p[i] += n[i] * d; p[i + 1] += n[i + 1] * d; p[i + 2] += n[i + 2] * d;
  }
  return smoothNormals(g);
}

// 頂點上色(RGBA,線性色彩);fn(x,y,z,nx,ny,nz,i,out)
const _out = [0, 0, 0, 0];
export function paint(g, fn) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, cnt = p.length / 3;
  const c = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) {
    _out[3] = 1;
    fn(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], n[i * 3], n[i * 3 + 1], n[i * 3 + 2], i, _out);
    c[i * 4] = _out[0]; c[i * 4 + 1] = _out[1]; c[i * 4 + 2] = _out[2]; c[i * 4 + 3] = _out[3];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 4));
  return g;
}

// ---------- 蒙皮權重 ----------
// 以頂點到骨段距離的反四次方分配權重(關節處自然平滑過渡)
export function autoList(rig, names, x, y, z, out = []) {
  out.length = 0;
  for (const nm of names) {
    const b = rig.bones[rig.index[nm]];
    const d = Math.sqrt(segDist2(x, y, z, b.head, b.tail));
    out.push([b.i, 1 / Math.pow(Math.max(d, 0.004), 4)]);
  }
  return out;
}

// spec:骨骼名稱字串 / 名稱陣列(自動) / fn(x,y,z,i) → [[骨骼名或索引, 權重], ...]
export function skin(g, rig, spec) {
  const p = g.attributes.position.array, cnt = p.length / 3;
  const si = new Uint16Array(cnt * 4), sw = new Float32Array(cnt * 4);
  const tmp = [];
  for (let i = 0; i < cnt; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    let list;
    if (typeof spec === 'string') list = [[rig.index[spec], 1]];
    else if (Array.isArray(spec)) list = autoList(rig, spec, x, y, z, tmp);
    else list = spec(x, y, z, i);
    list = list.map(([b, w]) => [typeof b === 'string' ? rig.index[b] : b, w]).filter((e) => e[1] > 0);
    list.sort((a, b) => b[1] - a[1]);
    let tot = 0;
    for (let k = 0; k < Math.min(4, list.length); k++) tot += list[k][1];
    for (let k = 0; k < 4; k++) {
      si[i * 4 + k] = k < list.length ? list[k][0] : 0;
      sw[i * 4 + k] = k < list.length ? list[k][1] / tot : 0;
    }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

// 依材質槽分組合併成一個幾何(groups 對應材質陣列)
export function assemble(pieces, slots) {
  const parts = [], used = [];
  for (const s of slots) {
    const gs = pieces.filter((p) => p.slot === s).map((p) => p.geo);
    if (!gs.length) continue;
    parts.push(mergeGeometries(gs));
    used.push(s);
  }
  const geo = mergeGeometries(parts, true);
  return { geo, used };
}

// ---------- 頭部 ----------
// 以球座標網格雕塑:橢球 → 下顎收窄 → 高斯特徵(眉骨、眼窩、顴骨、鼻樑…)。
// 口裂處沿一圈緯線切開(上唇/下唇頂點分離),讓下顎骨轉動時嘴巴真的張開。
export function headGeo(H) {
  const COLS = 72, ROWS = 50;
  const W = 0.073 * H.w, HH = 0.115 * H.h, DF = 0.098 * H.d, DB = 0.104 * H.d;
  const my = -0.046 * H.h;
  const phm = Math.acos(clamp(my / HH, -0.99, 0.99));
  const rm = Math.round((phm / Math.PI) * ROWS);
  const phiOf = (r) => (r <= rm ? (r / rm) * phm : phm + ((r - rm) / (ROWS - rm)) * (Math.PI - phm));
  const thOf = (c) => { const s = c / COLS; return Math.PI + TAU * s + 0.45 * Math.sin(TAU * s); }; // 臉部較密
  const mirror = (f) => [f, [-f[0], ...f.slice(1)]];
  const feats = [
    ...mirror([0.032, 0.037, 0.087, 0.02, 0.0065 * H.brow]), // 眉骨
    [0, 0.033, 0.094, 0.011, 0.003], // 眉間
    ...mirror([0.031, 0.013, 0.09, 0.0175, -0.018 * H.sock]), // 眼窩
    ...mirror([0.05, -0.006, 0.072, 0.02, 0.0075 * H.cheek]), // 顴骨
    ...mirror([0.046, -0.044, 0.07, 0.021, -0.012 * H.thin]), // 凹頰
    ...mirror([0.067, 0.032, 0.045, 0.024, -0.005 * (0.5 + H.thin)]), // 太陽穴
    [0, 0.015, -0.1, 0.05, 0.008], // 枕骨
    [0, -0.1, 0.07, 0.02, 0.007], // 下巴
    [0, my + 0.0075, 0.093, 0.011, 0.0035 * H.lips], // 上唇
    [0, my - 0.0085, 0.089, 0.012, 0.004 * H.lips], // 下唇
    [0, my, 0.093, 0.0045, -0.0025], // 嘴縫
    ...mirror([0.0115, -0.024, 0.096, 0.0075, 0.006 * H.nose]), // 鼻翼
    ...mirror([0.042, my - 0.004, 0.08, 0.014, 0.003]), // 嘴角肌
  ];
  const nA = new V3(0, 0.03, 0.094), nB = new V3(0, -0.02, 0.1);
  const nl2 = (nB.y - nA.y) ** 2 + (nB.z - nA.z) ** 2;
  const point = (nx, ny, nz) => {
    let x = nx * W, y = ny * HH, z = nz * (nz > 0 ? DF : DB);
    const low = sstep(0.0, -0.1, y);
    x *= 1 - low * (1 - H.jaw);
    if (nz > 0) z *= 1 - low * 0.1;
    if (z < 0) z *= 1 - sstep(-0.03, -0.11, y) * 0.45;
    if (y < -0.085) y = -0.085 + (y + 0.085) * 0.6; // 下巴底較平
    let d = 0;
    for (const f of feats) { const dx = x - f[0], dy = y - f[1], dz = z - f[2]; d += f[4] * Math.exp(-(dx * dx + dy * dy + dz * dz) / (f[3] * f[3])); }
    const t = clamp(((y - nA.y) * (nB.y - nA.y) + (z - nA.z) * (nB.z - nA.z)) / nl2, 0, 1);
    const cy = lerp(nA.y, nB.y, t), cz = lerp(nA.z, nB.z, t), r = 0.0075 + 0.0062 * t;
    const nd2 = x * x + (y - cy) ** 2 + (z - cz) ** 2;
    d += (H.nose > 0.3 ? H.nose * (0.005 + 0.023 * t) : -0.011) * Math.exp(-nd2 / (r * r)); // 鼻樑(爛掉的則是鼻腔凹洞)
    d += fbm(x * 45 + H.seed, y * 45, z * 45, 3) * 0.0017 * (1 + H.decay);
    if (H.extra) d += H.extra(x, y, z);
    const l = Math.hypot(x, y, z) || 1;
    return [x + (x / l) * d, y + (y / l) * d, z + (z / l) * d];
  };
  const C1 = COLS + 1;
  const pos = [], uv = [];
  for (let r = 0; r <= ROWS; r++) {
    const ph = phiOf(r), sp = Math.sin(ph), cp = Math.cos(ph);
    for (let c = 0; c <= COLS; c++) {
      const th = thOf(c);
      pos.push(...point(sp * Math.sin(th), cp, sp * Math.cos(th)));
      uv.push((c / COLS) * 3, (r / ROWS) * 2);
    }
  }
  // 嘴縫:複製口裂那圈頂點給下唇
  const dup = new Map(), lower = new Set();
  const mw = 0.0215 * H.mouthW;
  for (let c = 0; c <= COLS; c++) {
    const i = rm * C1 + c;
    if (pos[i * 3 + 2] > 0 && Math.abs(pos[i * 3]) < mw) {
      const j = pos.length / 3;
      pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      uv.push(uv[i * 2], uv[i * 2 + 1]);
      dup.set(i, j);
      lower.add(j);
    }
  }
  const idx = [];
  const D = (i) => dup.get(i) ?? i;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let i0 = r * C1 + c, i1 = i0 + 1;
      const i2 = i0 + C1, i3 = i2 + 1;
      if (r === rm) { i0 = D(i0); i1 = D(i1); }
      idx.push(i0, i2, i1, i1, i2, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  orient(g, new V3(0, 0, 0));
  smoothNormals(g);
  const front = rm * C1 + COLS / 2;
  return { geo: g, my, lower, mouthZ: pos[front * 3 + 2], mw };
}
