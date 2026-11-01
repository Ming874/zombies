import * as THREE from 'three';
import { registerMat } from '../../materials.js';
import { pbrTex } from '../../hospital/pbr.js';
import { makeWet } from '../../weather.js';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, tube, extrude, gridSurface, keepUV, put, solid, animPool, dyn, V3, HALF, TAU, lerp, hash } from './kit.js';
import { flatDecal } from './industrial.js';

// 兒童遊戲場:鞦韆(其中一座自己慢慢盪)、溜滑梯塔、旋轉盤(自己緩緩轉)、翹翹板、彈簧搖搖馬、沙坑(臉朝下的娃娃)、
// 長椅上的泰迪熊、三輪車、皮球。油漆褪色剝落(上漆金屬 PBR + 鏽斑貼花)。座標:本地,x 寬、z 深,y 地面。

let inited = false;
export function initPlay() {
  if (inited) return;
  inited = true;
  const paint = (k, tint) => {
    const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, metalness: 0.25, map: pbrTex('metal_painted', 'color', { tile: 1.2 }), normalMap: pbrTex('metal_painted', 'normal', { tile: 1.2 }) });
    m.roughnessMap = pbrTex('metal_painted', 'orm', { tile: 1.2 });
    registerMat(k, makeWet(m, { darken: 0.2, gloss: 0.55 }));
  };
  paint('po_pt_red', 0xa83a2c); paint('po_pt_yellow', 0xc8a03a); paint('po_pt_blue', 0x3a6488); paint('po_pt_green', 0x4a7a52);
  registerMat('po_sand', [0x8a7a5e, 1]);
  registerMat('po_teddy', [0x6a4a30, 1]);
  registerMat('po_chain', [0x6a6660, 0.6, 0.8]);
}

// ---------- 鞦韆 ----------
function swingFrame() {
  const P = new Parts(), H = 2.4, X = 2.3;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) P.add('po_pt_blue', rod(new V3(sx * X, 0, sz * 0.75), new V3(sx * (X - 0.05), H, 0), 0.04, 10));
    P.add('po_pt_blue', rod(new V3(sx * X, 0.55, -0.55), new V3(sx * X, 0.55, 0.55), 0.025, 8));
    for (const sz of [-1, 1]) P.add('concrete', cyl(0.12, 0.14, 0.12, 10), M(sx * X, 0.02, sz * 0.75));
  }
  P.add('po_pt_red', rod(new V3(-X - 0.1, H, 0), new V3(X + 0.1, H, 0), 0.045, 12));
  for (const x of [-1.5, 0, 1.5]) for (const dx of [-0.22, 0.22]) P.add('steel', tor(0.03, 0.008, 4, 8), M(x + dx, H - 0.04, 0, 0, HALF, 0));
  flatDecal(P, 'rust', -X, 1.2, 0.05, 0.3, 0.5, 'z+');
  return P;
}
function swingSeat(L = 1.85) {
  const P = new Parts();
  for (const dx of [-0.22, 0.22]) { // 鍊條:細鋼索 + 每 10cm 一節的扁環(遠看是連續的鍊子)
    P.add('po_chain', cyl(0.006, 0.006, L - 0.1, 4), M(dx, -0.05 - (L - 0.1) / 2, 0));
    for (let k = 0; k < 17; k++) P.add('po_chain', box(0.016, 0.07, 0.006), M(dx, -0.1 - k * (L - 0.15) / 17, 0, 0, k % 2 ? HALF : 0, 0));
  }
  const g = new THREE.BoxGeometry(0.5, 0.03, 0.18, 6, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (p.getX(i) / 0.25) ** 2 * 0.05);
  g.computeVertexNormals();
  P.add('rubber', g, M(0, -L, 0));
  return P;
}
export function swingSet(ctx, x, y, z, yaw = 0) {
  put(ctx, swingFrame(), x, y, z, yaw);
  const sp = animPool(ctx, 'swing_seat', () => swingSeat(), 8);
  const H = 2.4;
  [-1.5, 0, 1.5].forEach((lx, i) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const base = M(x + lx * c, y + H - 0.05, z - lx * s, 0, yaw, 0);
    const amp = i === 1 ? 0.42 : 0.025, ph = i * 1.7;
    // 中間那座自己盪(振幅慢慢起伏),兩邊的只被風吹得微動
    sp.add(base, (t, m) => m.makeRotationX(Math.sin(t * 2.28 + ph) * amp * (i === 1 ? 0.75 + 0.25 * Math.sin(t * 0.13) : 1)));
  });
  solid(ctx, x, y, z, Math.abs(Math.cos(yaw)) > 0.5 ? 5 : 1.6, H, Math.abs(Math.cos(yaw)) > 0.5 ? 1.6 : 5, 'mesh');
}

// ---------- 溜滑梯塔 ----------
export function slide(ctx, x, y, z, yaw = 0) {
  const P = new Parts(), h = 1.35;
  for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) P.add('po_pt_yellow', cyl(0.05, 0.05, h + 1.1, 10), M(px, (h + 1.1) / 2, pz));
  P.add('wood_old', box(1.3, 0.06, 1.3), M(0, h, 0));
  for (let k = 0; k < 6; k++) P.add('wood_old', box(1.26, 0.005, 0.2), M(0, h + 0.033, -0.55 + k * 0.22)); // 板縫
  // 屋頂(四角錐)
  P.add('po_pt_red', new THREE.ConeGeometry(1.05, 0.55, 4).rotateY(Math.PI / 4), M(0, h + 1.38, 0));
  // 欄杆(三面)
  for (const [ax, az, w, rot] of [[0, -0.62, 1.2, 0], [-0.62, 0, 1.2, HALF], [0.62, 0, 1.2, HALF]]) {
    P.add('po_pt_blue', box(w, 0.04, 0.04), M(ax, h + 0.75, az, 0, rot, 0));
    for (let k = 0; k < 5; k++) P.add('po_pt_blue', cyl(0.012, 0.012, 0.7, 6), M(ax + (rot ? 0 : -w / 2 + 0.1 + k * 0.25), h + 0.38, az + (rot ? -w / 2 + 0.1 + k * 0.25 : 0)));
  }
  // 爬梯(-X 側)
  for (const dz of [-0.25, 0.25]) P.add('po_pt_yellow', rod(new V3(-1.35, 0, dz), new V3(-0.62, h + 0.05, dz), 0.03, 8));
  for (let k = 1; k <= 5; k++) { const t = k / 6; P.add('steel', cyl(0.018, 0.018, 0.5, 6).rotateX(HALF), M(lerp(-1.35, -0.62, t), (h + 0.05) * t, 0)); }
  // 滑道(+Z 側出,U 形截面沿彎曲路徑)
  const path = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16; const zz = 0.62 + t * 2.7; const yy = t < 0.82 ? h - t / 0.82 * (h - 0.32) : 0.32 - (t - 0.82) * 0.3; path.push(new V3(0, yy, zz)); }
  const rows = path.map((p) => { const r = []; for (let j = 0; j <= 8; j++) { const u = j / 8, ang = Math.PI * (1 - u); r.push(new V3(p.x + Math.cos(ang) * 0.27, p.y + 0.12 - Math.sin(ang) * 0.12 + (j === 0 || j === 8 ? 0.06 : 0), p.z)); } return r; });
  P.add('po_pt_red', gridSurface(rows, { flip: false }));
  P.add('po_pt_red', gridSurface(rows.map((r) => r.map((v) => v.clone().add(new V3(0, -0.012, 0)))), { flip: true }));
  for (const s of [-1, 1]) P.add('steel', cyl(0.025, 0.025, 0.4, 6), M(s * 0.22, 0.2, 3.2));
  flatDecal(P, 'rustrun', -0.6, 1.2, -0.6 - 0.052, 0.12, 0.6, 'z-');
  put(ctx, P, x, y, z, yaw);
  solid(ctx, x, y, z, 1.5, h + 1.4, 1.5, 'metal');
  const c = Math.cos(yaw), s = Math.sin(yaw);
  solid(ctx, x + 2.0 * s, y, z + 2.0 * c, Math.abs(s) > 0.5 ? 2.6 : 0.65, 0.9, Math.abs(s) > 0.5 ? 0.65 : 2.6, 'metal');
}

// ---------- 旋轉盤(自己慢慢轉)----------
function roundabout() {
  const P = new Parts(), R0 = 1.05;
  P.add('steel', cyl(R0, R0, 0.05, 32), M(0, 0.3, 0));
  for (let k = 0; k < 6; k++) { // 六片褪色彩漆 + 扶手
    const a0 = (k / 6) * TAU;
    P.add(['po_pt_red', 'po_pt_yellow', 'po_pt_blue'][k % 3], new THREE.CylinderGeometry(R0 - 0.01, R0 - 0.01, 0.006, 8, 1, false, a0 + 0.02, TAU / 6 - 0.04), M(0, 0.328, 0));
    const a = a0 + TAU / 12;
    P.add('steel', tube([new V3(Math.cos(a) * 0.2, 0.33, Math.sin(a) * 0.2), new V3(Math.cos(a) * 0.3, 0.95, Math.sin(a) * 0.3), new V3(Math.cos(a) * 0.85, 0.95, Math.sin(a) * 0.85), new V3(Math.cos(a) * 0.95, 0.33, Math.sin(a) * 0.95)], 0.022, { radial: 6, seg: 16 }));
  }
  P.add('steel', cyl(0.08, 0.08, 0.7, 10), M(0, 0.6, 0));
  return P;
}
export function merryGoRound(ctx, x, y, z) {
  const P = new Parts();
  P.add('cast_iron', cyl(0.25, 0.3, 0.28, 12), M(0, 0.14, 0));
  put(ctx, P, x, y, z, 0);
  const ap = animPool(ctx, 'roundabout', roundabout, 4);
  const ph = hash(x * 3 + z) * TAU;
  ap.add(M(x, y, z), (t, m) => m.makeRotationY(ph + t * 0.16 + Math.sin(t * 0.21) * 0.6));
  solid(ctx, x, y, z, 1.9, 1.0, 1.9, 'metal');
}

// ---------- 翹翹板 ----------
export function seesaw(ctx, x, y, z, yaw = 0) {
  const P = new Parts(), tilt = 0.2;
  P.add('po_pt_yellow', box(0.3, 0.45, 0.3), M(0, 0.225, 0));
  P.add('steel', cyl(0.03, 0.03, 0.36, 8).rotateX(HALF), M(0, 0.48, 0));
  const board = M(0, 0.5, 0, 0, 0, tilt);
  P.add('po_pt_red', box(3.3, 0.06, 0.28), board);
  for (const s of [-1, 1]) {
    P.add('steel', tube([new V3(s * 1.25, 0.03, -0.12), new V3(s * 1.25, 0.35, -0.12), new V3(s * 1.25, 0.35, 0.12), new V3(s * 1.25, 0.03, 0.12)], 0.016, { radial: 6, seg: 10 }), board);
    P.add('rubber', cyl(0.1, 0.12, 0.08, 10), M(s * 1.55, 0.04, 0));
  }
  put(ctx, P, x, y, z, yaw);
  const ax = Math.abs(Math.cos(yaw)) > 0.5;
  solid(ctx, x, y, z, ax ? 3.3 : 0.35, 0.8, ax ? 0.35 : 3.3, 'metal');
}

// ---------- 彈簧搖搖馬(會微微晃)----------
function riderParts(kind) {
  const P = new Parts(), col = kind === 'duck' ? 'po_pt_yellow' : 'po_pt_red';
  P.add(col, sph(0.22, 14, 10).scale(1.6, 0.85, 0.8), M(0, 0.62, 0));
  if (kind === 'duck') { P.add(col, sph(0.14, 12, 10), M(0.3, 0.9, 0)); P.add('po_orange', new THREE.ConeGeometry(0.05, 0.14, 8).rotateZ(-HALF), M(0.45, 0.88, 0)); P.add(col, new THREE.ConeGeometry(0.1, 0.2, 6).rotateZ(HALF), M(-0.38, 0.72, 0)); }
  else { P.add(col, rbox(0.14, 0.34, 0.12, 0.05), M(0.3, 0.88, 0, 0, 0, -0.5)); P.add(col, rbox(0.26, 0.12, 0.12, 0.05), M(0.42, 1.02, 0)); P.add('rubber', box(0.1, 0.18, 0.025), M(0.27, 0.95, 0)); for (const s of [-1, 1]) P.add(col, new THREE.ConeGeometry(0.03, 0.08, 5), M(0.36, 1.12, s * 0.04)); }
  for (const s of [-1, 1]) { P.add('po_pt_blue', cyl(0.06, 0.06, 0.02, 10).rotateX(HALF), M(0.05, 0.4, s * 0.2)); P.add('steel', cyl(0.012, 0.012, 0.24, 6).rotateX(HALF), M(0.2, 0.85, 0)); }
  for (let k = 0; k < 7; k++) P.add('steel', tor(0.1, 0.014, 5, 14).rotateX(HALF), M(0, 0.06 + k * 0.055, 0));
  return P;
}
export function springRider(ctx, x, y, z, yaw = 0, kind = 'horse') {
  const P = new Parts();
  P.add('concrete', cyl(0.3, 0.32, 0.05, 14), M(0, 0.025, 0));
  put(ctx, P, x, y, z, yaw);
  const ap = animPool(ctx, `rider_${kind}`, () => riderParts(kind), 4);
  const ph = hash(x + z * 3) * 10;
  ap.add(M(x, y, z, 0, yaw, 0), (t, m) => m.makeRotationZ(Math.sin(t * 1.9 + ph) * 0.05 * (0.4 + 0.6 * Math.max(0, Math.sin(t * 0.17 + ph)))));
  solid(ctx, x, y, z, 0.6, 1.0, 0.6, 'plastic');
}

// ---------- 沙坑 + 臉朝下的娃娃 ----------
export function sandbox(ctx, x, y, z, rng) {
  const P = new Parts(), S = 2.2;
  for (const [ax, az, rot] of [[0, -S / 2, 0], [0, S / 2, 0], [-S / 2, 0, HALF], [S / 2, 0, HALF]]) P.add('wood_old', box(S + 0.16, 0.24, 0.12), M(ax, 0.12, az, 0, rot, 0));
  const sand = new THREE.PlaneGeometry(S - 0.1, S - 0.1, 10, 10).rotateX(-HALF);
  const p = sand.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, 0.13 + Math.sin(p.getX(i) * 3.1) * Math.cos(p.getZ(i) * 2.3) * 0.025 + (rng() - 0.5) * 0.01);
  sand.computeVertexNormals();
  P.add('po_sand', sand);
  // 小桶 + 鏟子
  P.add('po_pt_red', lathe([[0, 0], [0.07, 0], [0.09, 0.14], [0.085, 0.14], [0.065, 0.006]], 12), M(0.5, 0.14, 0.4, 0.3, 0, 1.2));
  P.add('po_pt_blue', box(0.06, 0.01, 0.22), M(0.2, 0.15, 0.6, 0, 0.5, 0));
  // 娃娃:臉朝下趴在沙裡,頭髮散開
  const D = new Parts();
  D.add('po_skin_doll', sph(0.07, 12, 10), M(0, 0.07, 0.22));
  D.add('po_hair', new THREE.SphereGeometry(0.075, 10, 8, 0, TAU, 0, Math.PI * 0.6), M(0, 0.075, 0.23, -0.9, 0, 0));
  D.add('po_fabric_pink', rbox(0.17, 0.08, 0.2, 0.03), M(0, 0.05, 0.05));
  for (const s of [-1, 1]) { D.add('po_skin_doll', cyl(0.022, 0.02, 0.15, 6).rotateX(HALF), M(s * 0.05, 0.03, -0.12, 0, s * 0.2, 0)); D.add('po_skin_doll', cyl(0.02, 0.018, 0.13, 6).rotateZ(HALF), M(s * 0.14, 0.04, 0.1, 0, s * 0.3, 0)); }
  P.merge(D, M(-0.35, 0.13, -0.2, 0, 0.7, 0));
  put(ctx, P, x, y, z, 0);
  solid(ctx, x, y, z, S + 0.2, 0.24, S + 0.2, 'wood');
}

// ---------- 泰迪熊(坐姿)/ 三輪車 / 皮球 ----------
export function teddy(P, x, y, z, yaw = 0, s = 1) {
  const T = new Parts();
  T.add('po_teddy', sph(0.12, 12, 10).scale(1, 1.15, 0.9), M(0, 0.13, 0));
  T.add('po_teddy', sph(0.09, 12, 10), M(0, 0.33, 0.02, 0.4, 0, 0.3));
  for (const sx of [-1, 1]) {
    T.add('po_teddy', sph(0.035, 8, 6), M(sx * 0.065, 0.41, 0.0));
    T.add('po_teddy', sph(0.045, 8, 6).scale(1, 1.6, 1), M(sx * 0.12, 0.14, 0.05, 0.4, 0, sx * 0.5));
    T.add('po_teddy', sph(0.05, 8, 6).scale(1, 1, 1.7), M(sx * 0.07, 0.05, 0.12));
  }
  T.add('po_fabric_dirty', sph(0.035, 8, 6), M(0, 0.32, 0.1));
  T.add('rubber', sph(0.012, 6, 4), M(0.03, 0.36, 0.1)); // 只剩一隻眼睛
  T.add('fabric_red', box(0.16, 0.03, 0.12), M(0, 0.25, 0.04)); // 領結
  P.merge(T, M(x, y, z, -0.15, yaw, 0.2, s));
}
export function tricycle(P, x, y, z, yaw = 0, fallen = false) {
  const T = new Parts();
  T.add('rubber', tor(0.16, 0.025, 6, 16), M(0.35, 0.16, 0));
  for (const s of [-1, 1]) T.add('rubber', tor(0.11, 0.022, 6, 14), M(-0.2, 0.11, s * 0.2));
  T.add('po_pt_red', rod(new V3(0.35, 0.16, 0), new V3(0.25, 0.5, 0), 0.02, 6));
  T.add('po_pt_red', rod(new V3(0.27, 0.42, 0), new V3(-0.2, 0.2, 0), 0.022, 6));
  T.add('steel', rod(new V3(-0.2, 0.11, -0.2), new V3(-0.2, 0.11, 0.2), 0.012, 6));
  T.add('rubber', box(0.16, 0.04, 0.12), M(-0.05, 0.33, 0));
  T.add('steel', cyl(0.01, 0.01, 0.3, 6).rotateX(HALF), M(0.25, 0.52, 0));
  P.merge(T, M(x, y, z, fallen ? HALF * 0.95 : 0, yaw, 0).multiply(M(0, fallen ? 0.18 : 0, 0)));
}
export function ball(ctx, x, y, z) {
  return dyn(ctx, 'ball', () => { const P = new Parts(); P.add('po_pt_red', sph(0.11, 16, 12)); P.add('po_pt_yellow', tor(0.111, 0.012, 4, 24).rotateX(HALF)); return P; }, { mass: 0.4, shape: 'sphere', size: [0.22, 0.22, 0.22], friction: 0.6, restitution: 0.55 }, x, y + 0.11, z);
}
