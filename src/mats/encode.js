import * as THREE from 'three';

// 表面編碼:純色(沒有貼圖)的零件用不到 UV → 把「類別 + 面內座標 + 面的尺寸 + 邊緣旗標 + 擺放亂數」寫進 UV。
// 場景合併(hospital.js mergeStatics)只保留 position/normal/uv,這樣細節資訊能一路帶到合併後的共用材質。
//   uv.x = (2^15 | 類別<<9 | 寬度量化) * 128 + round(u01 * 127)
//   uv.y = (2^15 | 旗標<<13 | 亂數<<9 | 高度量化) * 128 + round(v01 * 127)
// 量化:面的寬/高以 8mm 為一格(9 位元,最大 4.09m)。全部是 < 2^23 的整數 → float32 精確;頂點著色器逐頂點解碼。
// 旗標 bit0 = u 方向的 0/1 是真的邊(會磨損)、bit1 = v 方向。最高位元(哨兵)讓著色器分辨「有編碼」與一般 UV。
export const ENC_MIN = 32768 * 128; // uv ≥ 這個值 = 有編碼
const Q = 0.008, QMAX = 511;
export const FLAG_U = 1, FLAG_V = 2;

// g:非索引幾何(局部座標,含 position/normal);m:局部 → 模板/世界的 Matrix4(只用來量面的尺寸,不會改幾何)
// mode:'box' 依法線主軸投影到包圍盒(盒子、擠出件:u 沿最長軸)/'uv' 用幾何原本的 0..1 UV(圓柱、球…)
// flags:(三角形法線 n(局部), 主軸) → 旗標;預設 box 兩向都是邊、uv 都不是
export function encodeSurface(g, m, cls, { mode = 'box', flags = null } = {}) {
  const P = g.attributes.position, n = P.count;
  if (!n) return g;
  const p = P.array;
  let uv0 = null;
  if (mode === 'uv') {
    const U = g.attributes.uv;
    if (!U) mode = 'box';
    else {
      // 正規化到 0..1(掃掠管的 v 是公尺)
      uv0 = U.array;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < uv0.length; i += 2) { u0 = Math.min(u0, uv0[i]); u1 = Math.max(u1, uv0[i]); v0 = Math.min(v0, uv0[i + 1]); v1 = Math.max(v1, uv0[i + 1]); }
      const du = u1 - u0 || 1, dv = v1 - v0 || 1;
      const a = new Float32Array(uv0.length);
      for (let i = 0; i < a.length; i += 2) { a[i] = (uv0[i] - u0) / du; a[i + 1] = (uv0[i + 1] - v0) / dv; }
      uv0 = a;
    }
  }
  let mn = null, sz = null, long = 0;
  if (mode === 'box') {
    mn = [Infinity, Infinity, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[i + k]); mx[k] = Math.max(mx[k], p[i + k]); }
    sz = [Math.max(1e-5, mx[0] - mn[0]), Math.max(1e-5, mx[1] - mn[1]), Math.max(1e-5, mx[2] - mn[2])];
    long = sz[0] >= sz[1] && sz[0] >= sz[2] ? 0 : sz[2] >= sz[1] ? 2 : 1;
  }
  const e = m ? m.elements : null;
  const tx = (i, o) => { // 局部 → 變換後(只算線性部分,量長度用)
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (!e) { o[0] = x; o[1] = y; o[2] = z; return o; }
    o[0] = e[0] * x + e[4] * y + e[8] * z; o[1] = e[1] * x + e[5] * y + e[9] * z; o[2] = e[2] * x + e[6] * y + e[10] * z;
    return o;
  };
  const out = new Float32Array(n * 2);
  const AX = [[2, 1], [0, 2], [0, 1]];
  const t = [0, 0, 0, 0, 0, 0], P0 = [0, 0, 0], P1 = [0, 0, 0], P2 = [0, 0, 0];
  for (let i = 0; i + 8 < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const X = Math.abs(nx), Y = Math.abs(ny), Z = Math.abs(nz);
    const ax = X >= Y && X >= Z ? 0 : Y >= Z ? 1 : 2;
    const vi = i / 3;
    if (mode === 'box') {
      let [a, b] = AX[ax];
      if (b === long) [a, b] = [b, a];
      for (let k = 0; k < 3; k++) { const j = i + k * 3; t[k * 2] = (p[j + a] - mn[a]) / sz[a]; t[k * 2 + 1] = (p[j + b] - mn[b]) / sz[b]; }
    } else for (let k = 0; k < 6; k++) t[k] = uv0[vi * 2 + k];
    // 面的尺寸:位置對 UV 的偏導數長度(變換後的公尺)
    tx(i, P0); tx(i + 3, P1); tx(i + 6, P2);
    const e1x = P1[0] - P0[0], e1y = P1[1] - P0[1], e1z = P1[2] - P0[2], e2x = P2[0] - P0[0], e2y = P2[1] - P0[1], e2z = P2[2] - P0[2];
    const d1u = t[2] - t[0], d1v = t[3] - t[1], d2u = t[4] - t[0], d2v = t[5] - t[1];
    const det = d1u * d2v - d1v * d2u;
    let Wm = 0.5, Hm = 0.5, fl = 0;
    if (Math.abs(det) > 1e-9) {
      const r = 1 / det;
      Wm = Math.hypot((e1x * d2v - e2x * d1v) * r, (e1y * d2v - e2y * d1v) * r, (e1z * d2v - e2z * d1v) * r);
      Hm = Math.hypot((e2x * d1u - e1x * d2u) * r, (e2y * d1u - e1y * d2u) * r, (e2z * d1u - e1z * d2u) * r);
      fl = flags ? flags(nx, ny, nz, ax) : mode === 'box' ? 3 : 0;
    }
    const wq = Math.min(QMAX, Math.max(1, Math.round(Wm / Q))), hq = Math.min(QMAX, Math.max(1, Math.round(Hm / Q)));
    const hx = (32768 | (cls & 31) << 9 | wq) * 128, hy = (32768 | (fl & 3) << 13 | hq) * 128;
    for (let k = 0; k < 3; k++) {
      const o = (vi + k) * 2;
      out[o] = hx + Math.round(Math.min(1, Math.max(0, t[k * 2])) * 127);
      out[o + 1] = hy + Math.round(Math.min(1, Math.max(0, t[k * 2 + 1])) * 127);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(out, 2));
  return g;
}

// 每次擺放一個亂數(0..15):同一個模板擺很多次時,細節(刮痕、斑駁、掉漆位置)不會一模一樣
export function seedSurface(g, seed) {
  const U = g.attributes.uv;
  if (!U) return g;
  const a = U.array, add = ((seed & 15) << 9) * 128;
  if (!add) return g;
  for (let i = 0; i < a.length; i += 2) if (a[i] >= ENC_MIN && a[i + 1] >= ENC_MIN) a[i + 1] += add;
  U.needsUpdate = true;
  return g;
}
export const isEncoded = (g) => { const U = g.attributes.uv; return !!U && U.count > 0 && U.array[0] >= ENC_MIN && U.array[1] >= ENC_MIN; };

// 會被場景合併成「共用頂點色材質」的純色材質(與 hospital.js plainBucket 的條件一致):只有這種零件的 UV 可以拿來存編碼
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];
export function plainEligible(m) {
  if (!m || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent || m.alphaTest > 0 || m.vertexColors || m.wireframe || m.fog === false) return false;
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return false;
  if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) return false;
  return !MAPS.some((k) => m[k]);
}
