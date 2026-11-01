import { SHAPE, SHAPE_LEN } from './core.js';

// 主執行緒上的射線檢測(子彈打道具/屍體):Worker 模式下拿不到同步的 Rapier 查詢,
// 所以用主執行緒手上的剛體姿態 + 形狀描述直接算(盒 / 球 / 膠囊 / 圓柱),兩種模式行為一致。
const L = new Float64Array(6); // 區域座標射線 ox,oy,oz,dx,dy,dz
const N = new Float64Array(3); // 區域法線
const S = new Float64Array(6); // 形狀座標射線
const BO = new Float64Array(3), BD = new Float64Array(3), BH = new Float64Array(3);
let tHit = Infinity;

// v' = q⁻¹ · v · q(單位四元數的反旋轉),寫入 out[i..i+2]
function invRot(qx, qy, qz, qw, x, y, z, out, i) {
  const tx = 2 * (-qy * z + qz * y), ty = 2 * (-qz * x + qx * z), tz = 2 * (-qx * y + qy * x);
  out[i] = x + qw * tx + (-qy * tz + qz * ty);
  out[i + 1] = y + qw * ty + (-qz * tx + qx * tz);
  out[i + 2] = z + qw * tz + (-qx * ty + qy * tx);
}
// v' = q · v · q⁻¹
export function rot(qx, qy, qz, qw, x, y, z, out, i = 0) {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[i] = x + qw * tx + (qy * tz - qz * ty);
  out[i + 1] = y + qw * ty + (qz * tx - qx * tz);
  out[i + 2] = z + qw * tz + (qx * ty - qy * tx);
}

function sphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz;
  const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
  if (c > 0 && b > 0) return;
  const disc = b * b - c;
  if (disc < 0) return;
  const t = Math.max(0, -b - Math.sqrt(disc));
  if (t < tHit) { tHit = t; const k = 1 / r; N[0] = (px + dx * t) * k; N[1] = (py + dy * t) * k; N[2] = (pz + dz * t) * k; }
}
// 沿 Y 軸、半徑 r、|y| ≤ hh 的圓柱側面
function side(ox, oy, oz, dx, dy, dz, hh, r) {
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return;
  const b = ox * dx + oz * dz, c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0 || t >= tHit) return;
  const y = oy + dy * t;
  if (y < -hh || y > hh) return;
  tHit = t; N[0] = (ox + dx * t) / r; N[1] = 0; N[2] = (oz + dz * t) / r;
}
function caps(ox, oy, oz, dx, dy, dz, hh, r) {
  if (Math.abs(dy) < 1e-9) return;
  for (const s of [1, -1]) {
    const t = (s * hh - oy) / dy;
    if (t < 0 || t >= tHit) continue;
    const x = ox + dx * t, z = oz + dz * t;
    if (x * x + z * z <= r * r) { tHit = t; N[0] = 0; N[1] = s; N[2] = 0; }
  }
}
function box(ox, oy, oz, dx, dy, dz, hx, hy, hz) {
  let t0 = 0, t1 = tHit, ax = -1, sg = 0;
  const o = BO, d = BD, h = BH;
  o[0] = ox; o[1] = oy; o[2] = oz; d[0] = dx; d[1] = dy; d[2] = dz; h[0] = hx; h[1] = hy; h[2] = hz;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) { if (o[i] < -h[i] || o[i] > h[i]) return; continue; }
    let a = (-h[i] - o[i]) / d[i], b = (h[i] - o[i]) / d[i], s = -1;
    if (a > b) { const tmp = a; a = b; b = tmp; s = 1; }
    if (a > t0) { t0 = a; ax = i; sg = s; }
    if (b < t1) t1 = b;
    if (t0 > t1) return;
  }
  if (t0 < tHit) { tHit = t0; N[0] = N[1] = N[2] = 0; if (ax >= 0) N[ax] = sg; else N[1] = 1; }
}

// 射線 vs 一個剛體(姿態 vis[o..o+6]、形狀 shapes)。命中時回傳距離,並把世界法線寫入 nOut
export function rayBody(ox, oy, oz, dx, dy, dz, maxT, vis, o, shapes, nOut) {
  const px = vis[o], py = vis[o + 1], pz = vis[o + 2], qx = vis[o + 3], qy = vis[o + 4], qz = vis[o + 5], qw = vis[o + 6];
  invRot(qx, qy, qz, qw, ox - px, oy - py, oz - pz, L, 0);
  invRot(qx, qy, qz, qw, dx, dy, dz, L, 3);
  let best = maxT, bn0 = 0, bn1 = 1, bn2 = 0, sq = null;
  for (let i = 0; i + SHAPE_LEN <= shapes.length; i += SHAPE_LEN) {
    const sx = shapes[i + 7], sy = shapes[i + 8], sz = shapes[i + 9], sw = shapes[i + 10];
    invRot(sx, sy, sz, sw, L[0] - shapes[i + 4], L[1] - shapes[i + 5], L[2] - shapes[i + 6], S, 0);
    invRot(sx, sy, sz, sw, L[3], L[4], L[5], S, 3);
    tHit = best;
    const t = shapes[i], a = shapes[i + 1], b = shapes[i + 2], c = shapes[i + 3];
    if (t === SHAPE.BOX) box(S[0], S[1], S[2], S[3], S[4], S[5], a, b, c);
    else if (t === SHAPE.BALL) sphere(S[0], S[1], S[2], S[3], S[4], S[5], 0, 0, 0, a);
    else if (t === SHAPE.CAPSULE) {
      side(S[0], S[1], S[2], S[3], S[4], S[5], a, b);
      sphere(S[0], S[1], S[2], S[3], S[4], S[5], 0, a, 0, b);
      sphere(S[0], S[1], S[2], S[3], S[4], S[5], 0, -a, 0, b);
    } else { side(S[0], S[1], S[2], S[3], S[4], S[5], a, b); caps(S[0], S[1], S[2], S[3], S[4], S[5], a, b); }
    if (tHit < best) { best = tHit; bn0 = N[0]; bn1 = N[1]; bn2 = N[2]; sq = i; }
  }
  if (sq === null) return Infinity;
  // 法線:形狀座標 → 剛體座標 → 世界
  rot(shapes[sq + 7], shapes[sq + 8], shapes[sq + 9], shapes[sq + 10], bn0, bn1, bn2, nOut, 0);
  rot(qx, qy, qz, qw, nOut[0], nOut[1], nOut[2], nOut, 0);
  return best;
}

// 形狀集合的包圍球半徑(以剛體原點為中心)
export function boundRadius(shapes) {
  let r = 0;
  for (let i = 0; i + SHAPE_LEN <= shapes.length; i += SHAPE_LEN) {
    const t = shapes[i], a = shapes[i + 1], b = shapes[i + 2], c = shapes[i + 3];
    const ext = t === SHAPE.BOX ? Math.hypot(a, b, c) : t === SHAPE.BALL ? a : t === SHAPE.CAPSULE ? a + b : Math.hypot(a, b);
    r = Math.max(r, Math.hypot(shapes[i + 4], shapes[i + 5], shapes[i + 6]) + ext);
  }
  return r;
}
