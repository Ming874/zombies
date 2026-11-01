import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { makeWet } from '../../weather.js';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, tube, extrude, keepUV, pool, put, solid, dyn, dynPool, animPool, V3, HALF, TAU, lerp, hash } from './kit.js';
import { canvas, tex, lazy, text, wear, softBlob, rr, R, FONT_TC } from './mats.js';
import { labelQuad } from './cars.js';
import { flatDecal } from './industrial.js';
import { streetLamp } from './street.js';
import { bindModel } from './gltf.js';
import { lightMod, glowMat, windify } from './env.js';
import { rng as mkRng } from '../ctx.js';
const posRng = (x, z) => mkRng((Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663));

// 街道家具:長椅(CC0 模型)、路阻柱、消防栓、公車亭、電箱(CC0)、鍍鋅垃圾桶 / 油桶 / 木箱 / 瓦斯桶 / 濕地板警示牌(動態,CC0)、
// 工業壁燈(CC0)、保全投射燈(CC0)、霓虹招牌(逐字閃爍/熄滅)、旗桿(破旗隨風飄)、花台、停車繳費機、購物推車、棧板、
// 路燈(常亮 / 閃爍 / 熄滅)。

let inited = false;
export function initFurniture() {
  if (inited) return;
  inited = true;
  registerMat('po_hydrant', makeWet(new THREE.MeshStandardMaterial({ color: 0xa82818, roughness: 0.55, metalness: 0.4 }), { darken: 0.2, gloss: 0.5 }));
  registerMat('po_bollard', makeWet(new THREE.MeshStandardMaterial({ color: 0x3a3c3a, roughness: 0.5, metalness: 0.6 }), { darken: 0.15, gloss: 0.5 }));
  registerMat('po_shelter_glass', new THREE.MeshStandardMaterial({ color: 0x8a9a9c, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  registerMat('po_flag', windify(new THREE.MeshStandardMaterial({ map: FLAG_TEX(), side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.4 }), { mode: 'cloth', amp: 0.35 }));
}

// ---------- 長椅(Poly Haven 漆木長椅;備援:木條 + 鑄鐵椅腳)----------
function benchFallback() {
  const P = new Parts();
  for (let k = 0; k < 3; k++) P.add('wood_old', box(1.16, 0.035, 0.1), M(0, 0.44, -0.15 + k * 0.12));
  for (let k = 0; k < 2; k++) P.add('wood_old', box(1.16, 0.09, 0.03), M(0, 0.62 + k * 0.13, -0.2, -0.2, 0, 0));
  for (const s of [-1, 1]) { P.add('cast_iron', box(0.05, 0.44, 0.4), M(s * 0.5, 0.22, 0)); P.add('cast_iron', box(0.05, 0.4, 0.05), M(s * 0.5, 0.65, -0.21, -0.2, 0, 0)); }
  return P;
}
export function bench(ctx, x, y, z, yaw = 0) {
  const p = pool(ctx, 'bench', benchFallback, 24);
  bindModel(p, 'bench', [], { origin: 'base', xform: new THREE.Matrix4().makeRotationY(Math.PI) });
  p.add(M(x, y, z, 0, yaw, 0));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? 1.2 : 0.5, 0.5, ax ? 0.5 : 1.2, 'wood');
}

// ---------- 路阻柱 / 消防栓 ----------
export function bollard(ctx, x, y, z, tilt = 0, yaw = 0) {
  pool(ctx, 'bollard', () => {
    const P = new Parts();
    P.add('po_bollard', cyl(0.07, 0.08, 0.9, 12), M(0, 0.45, 0));
    P.add('po_bollard', sph(0.07, 12, 6, 0, TAU, 0, HALF), M(0, 0.9, 0));
    for (const yy of [0.72, 0.8]) P.add('po_reflect', cyl(0.072, 0.072, 0.04, 12), M(0, yy, 0));
    return P;
  }, 48).add(M(x, y, z, tilt, yaw, 0));
  if (!tilt) solid(ctx, x, y, z, 0.18, 0.9, 0.18, 'heavy');
}
export function hydrant(ctx, x, y, z, yaw = 0) {
  pool(ctx, 'hydrant', () => {
    const P = new Parts();
    P.add('po_hydrant', lathe([[0.13, 0], [0.13, 0.05], [0.1, 0.07], [0.1, 0.55], [0.12, 0.57], [0.12, 0.62], [0.09, 0.66], [0.05, 0.74], [0.02, 0.76], [0, 0.76]], 16));
    for (const s of [-1, 1]) { P.add('po_hydrant', cyl(0.045, 0.045, 0.12, 10).rotateZ(HALF), M(s * 0.14, 0.42, 0)); P.add('cast_iron', cyl(0.05, 0.05, 0.03, 6).rotateZ(HALF), M(s * 0.21, 0.42, 0)); }
    P.add('po_hydrant', cyl(0.06, 0.06, 0.1, 10).rotateX(HALF), M(0, 0.4, 0.13));
    P.add('cast_iron', cyl(0.065, 0.065, 0.03, 6).rotateX(HALF), M(0, 0.4, 0.19));
    P.add('cast_iron', cyl(0.025, 0.025, 0.05, 5), M(0, 0.78, 0));
    flatDecal(P, 'rustrun', 0, 0.3, 0.101, 0.16, 0.4, 'z+');
    return P;
  }, 8).add(M(x, y, z, 0, yaw, 0));
  solid(ctx, x, y, z, 0.3, 0.75, 0.3, 'heavy');
}

// ---------- 公車亭(鋼架、碎玻璃、廣告燈箱、站牌)----------
export function busStop(ctx, x, y, z, yaw, rng) {
  const P = new Parts(), L = 3.6, D = 1.4, H = 2.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('metal_gray', box(0.07, H, 0.07), M(sx * L / 2, H / 2, sz * D / 2));
  P.add('metal_gray', box(L + 0.3, 0.08, D + 0.4), M(0, H + 0.04, 0.1, 0.06, 0, 0));
  P.add('po_shelter_glass', box(L + 0.2, 0.02, D + 0.3), M(0, H - 0.01, 0.1));
  // 背板玻璃(兩片,其中一片碎裂),側板廣告燈箱
  P.add('po_shelter_glass', new THREE.PlaneGeometry(L / 2 - 0.08, H - 0.4), M(-L / 4, H / 2 + 0.15, -D / 2));
  P.add('po_glass_crack', new THREE.PlaneGeometry(L / 2 - 0.08, H - 0.4), M(L / 4, H / 2 + 0.15, -D / 2));
  P.add('metal_gray', box(0.12, H - 0.3, D - 0.1), M(L / 2, H / 2, 0));
  P.add('po_label', labelQuad('poster2', 0.9, 1.3).rotateY(-HALF), M(L / 2 - 0.065, 1.25, 0));
  P.add('po_label', labelQuad('poster', 0.9, 1.3).rotateY(HALF), M(L / 2 + 0.065, 1.25, 0));
  // 長椅
  P.add('steel', box(L * 0.7, 0.04, 0.38), M(0, 0.45, -D / 2 + 0.3));
  for (const s of [-1, 0, 1]) P.add('steel', box(0.04, 0.45, 0.3), M(s * L * 0.3, 0.22, -D / 2 + 0.3));
  // 站牌
  P.add('steel', cyl(0.04, 0.04, 2.8, 8), M(-L / 2 - 0.5, 1.4, D / 2));
  P.add('po_label', labelQuad('busstop', 0.6, 0.3), M(-L / 2 - 0.5, 2.55, D / 2 + 0.045));
  P.add('metal_gray', box(0.64, 0.34, 0.06), M(-L / 2 - 0.5, 2.55, D / 2 + 0.01));
  flatDecal(P, 'shards', L / 4, 0.012, -D / 2 + 0.6, 1.4, 1.0, 'y+');
  flatDecal(P, rng() < 0.5 ? 'g_dont' : 'g_still', -L / 4, 1.3, -D / 2 + 0.012, 1.4, 0.7, 'z+');
  put(ctx, P, x, y, z, yaw);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wall = (lx, lz, sx2, sz2, h = H, mat = 'metal') => { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; solid(ctx, wx, y, wz, Math.abs(sx2 * c) + Math.abs(sz2 * s), h, Math.abs(sx2 * s) + Math.abs(sz2 * c), mat); };
  wall(0, -D / 2, L, 0.12, H, 'glass'); wall(L / 2, 0, 0.14, D); wall(0, -D / 2 + 0.3, L * 0.7, 0.4, 0.48);
}

// ---------- 電箱(Poly Haven utility_box_01)----------
export function utilityBox(ctx, x, y, z, yaw = 0) {
  const p = pool(ctx, 'utilitybox', () => { const P = new Parts(); P.add('metal_gray', box(0.52, 1.12, 0.43), M(0, 0.56, 0)); P.add('po_label', labelQuad('hv', 0.3, 0.15), M(0, 0.9, 0.216)); return P; }, 12);
  bindModel(p, 'utilitybox', [], { origin: 'base' });
  p.add(M(x, y, z, 0, yaw, 0));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? 0.55 : 0.46, 1.12, ax ? 0.46 : 0.55, 'metal');
}

// ---------- 動態小物(CC0 模型;載入前用程式備援)----------
const CENTER = { origin: 'center' };
export function trashCan(ctx, x, y, z, { fallen = false, rust = false, yaw = 0 } = {}) {
  const name = rust ? 'trashcan_r' : 'trashcan';
  const spec = { mass: 7, shape: 'cylinder', size: [0.6, 0.9, 0.6], friction: 0.55, restitution: 0.2 };
  const pl = dynPool(ctx, name, () => { const P = new Parts(); P.add(rust ? 'rust' : 'steel', cyl(0.29, 0.27, 0.9, 16, true)); P.add('rubber', cyl(0.27, 0.27, 0.02, 16), M(0, -0.44, 0)); return P; }, spec);
  bindModel(pl, 'trashcan', rust ? ['metal_trash_can_rust', 'metal_trash_can_rust_handle_left', 'metal_trash_can_rust_handle_right'] : ['metal_trash_can', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right'], CENTER);
  return dyn(ctx, name, null, spec, x, y + (fallen ? 0.3 : 0.45), z, fallen ? [HALF, yaw, 0] : [0, yaw, 0]);
}
export function barrel(ctx, x, y, z, { fallen = false, yaw = 0 } = {}) {
  const spec = { mass: 22, shape: 'cylinder', size: [0.56, 0.88, 0.56], friction: 0.6, restitution: 0.15 };
  const pl = dynPool(ctx, 'barrel', () => { const P = new Parts(); P.add('rust', cyl(0.28, 0.28, 0.88, 16)); for (const yy of [-0.25, 0.25]) P.add('rust', tor(0.285, 0.015, 4, 20).rotateX(HALF), M(0, yy, 0)); return P; }, spec);
  bindModel(pl, 'barrel', [], CENTER);
  return dyn(ctx, 'barrel', null, spec, x, y + (fallen ? 0.28 : 0.44), z, fallen ? [HALF, yaw, 0] : [0, yaw, 0]);
}
export function crate(ctx, x, y, z, yaw = 0) {
  const spec = { mass: 18, shape: 'box', size: [1.17, 0.53, 0.46], friction: 0.7, restitution: 0.05 };
  const pl = dynPool(ctx, 'crate', () => { const P = new Parts(); P.add('wood_old', box(1.17, 0.53, 0.46)); return P; }, spec);
  bindModel(pl, 'crate', [], CENTER);
  return dyn(ctx, 'crate', null, spec, x, y + 0.265, z, [0, yaw, 0]);
}
export function propane(ctx, x, y, z, fallen = false) {
  const spec = { mass: 16, shape: 'cylinder', size: [0.34, 0.56, 0.34], friction: 0.5, restitution: 0.2 };
  const pl = dynPool(ctx, 'propane', () => { const P = new Parts(); P.add('metal_white', cyl(0.16, 0.16, 0.5, 14)); return P; }, spec);
  bindModel(pl, 'propane', [], CENTER);
  return dyn(ctx, 'propane', null, spec, x, y + (fallen ? 0.17 : 0.28), z, fallen ? [HALF, hash(x + z) * TAU, 0] : [0, hash(x * 3 + z) * TAU, 0]);
}
export function wetSign(ctx, x, y, z, yaw = 0) {
  const spec = { mass: 1.2, shape: 'box', size: [0.3, 0.63, 0.36], friction: 0.6, restitution: 0.1 };
  const pl = dynPool(ctx, 'wetsign', () => { const P = new Parts(); P.add('plastic_yellow', box(0.3, 0.63, 0.06)); return P; }, spec);
  bindModel(pl, 'wetsign', [], CENTER);
  return dyn(ctx, 'wetsign', null, spec, x, y + 0.315, z, [0, yaw, 0]);
}
export function tyre(ctx, x, y, z, flat = true, yaw = 0) {
  const spec = { mass: 9, shape: 'cylinder', size: [0.6, 0.165, 0.6], friction: 0.9, restitution: 0.4 };
  const pl = dynPool(ctx, 'tyre', () => { const P = new Parts(); P.add('tire', tor(0.22, 0.08, 8, 18).rotateX(HALF)); return P; }, spec);
  bindModel(pl, 'tyre', [], { origin: 'center', xform: new THREE.Matrix4().makeRotationX(HALF) });
  return dyn(ctx, 'tyre', null, spec, x, y + (flat ? 0.083 : 0.3), z, flat ? [0, yaw, 0] : [HALF, yaw, 0]);
}

// ---------- 燈具 ----------
// 路燈:state 'on' | 'flicker' | 'dead'
let lampSerial = 0;
export function resetFurniture() { lampSerial = 0; }
export function lamp(ctx, x, y, z, yaw, state = 'on', { kind = 'tall', zone = null, lean = 0 } = {}) {
  if (state === 'flicker') {
    const key = `po_lampf_${lampSerial++}`;
    const m = registerMat(key, new THREE.MeshStandardMaterial({ color: 0xb0a080, roughness: 0.2, emissive: 0xff9a40, emissiveIntensity: 1.6 }));
    const p = streetLamp(ctx, x, y, z, yaw, { kind, on: true, zone, glass: key, lean });
    lightMod({ x: p.x, y: p.y - 0.15, z: p.z, mode: 'tube', state: 1, mat: m, ei: 1.6 });
    return p;
  }
  return streetLamp(ctx, x, y, z, yaw, { kind, on: state === 'on', zone, lean });
}
// 工業壁燈(Poly Haven):x,z 為牆面上的點,yaw 讓燈朝外;on 時登記鈉燈
export function wallLamp(ctx, x, y, z, yaw, state = 'on', zone = null) {
  const p = pool(ctx, 'walllamp', () => { const P = new Parts(); P.add('cast_iron', cyl(0.12, 0.12, 0.08, 12).rotateX(HALF), M(0, 0, 0.04)); P.add('po_lamp_glass', sph(0.09, 10, 8), M(0, 0, 0.1)); return P; }, 24);
  bindModel(p, 'walllamp', [], { origin: 'center', xform: new THREE.Matrix4().makeTranslation(0, 0, 0) });
  p.add(M(x, y, z, 0, yaw, 0).multiply(M(0, 0, 0.07)));
  if (state === 'dead') return;
  const lx = x + Math.sin(yaw) * 0.35, lz = z + Math.cos(yaw) * 0.35;
  const spec = ctx.light({ x: lx, y: y - 0.1, z: lz, color: 0xffa24a, intensity: 6, distance: 10, kind: 'sodium', flicker: 0, zone: zone?.id, glow: 0.9 });
  if (state === 'flicker') lightMod({ x: spec.x, y: spec.y, z: spec.z, mode: 'tube', state: 1 });
}
// 保全投射燈(Poly Haven security_light):裝在牆上,朝下照
export function secLight(ctx, x, y, z, yaw, on = true, zone = null) {
  const p = pool(ctx, 'seclight', () => { const P = new Parts(); P.add('cast_iron', rbox(0.3, 0.22, 0.14, 0.02), M(0, 0, 0.1, -0.4, 0, 0)); return P; }, 12);
  bindModel(p, 'seclight', [], { origin: 'center' });
  p.add(M(x, y, z, 0, yaw, 0).multiply(M(0, 0, 0.18)));
  if (on) ctx.light({ x: x + Math.sin(yaw) * 0.6, y: y - 0.3, z: z + Math.cos(yaw) * 0.6, color: 0xdde6ff, intensity: 10, distance: 14, kind: 'street', flicker: 0, zone: zone?.id, glow: 0.8 });
}

// ---------- 霓虹招牌:逐字材質(常亮 / 閃爍 / 熄滅)----------
const NEON_CACHE = new Map();
function neonTex(str, color) {
  const k = str + color;
  if (NEON_CACHE.has(k)) return NEON_CACHE.get(k);
  const n = [...str].length, cw = 256;
  const [c, ctx] = canvas(cw * n, 256);
  [...str].forEach((ch, i) => {
    ctx.save(); ctx.translate(i * cw + cw / 2, 136);
    ctx.font = `900 200px ${FONT_TC}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.shadowColor = color; ctx.shadowBlur = 22; ctx.strokeText(ch, 0, 0);
    ctx.strokeStyle = '#fff6f0'; ctx.lineWidth = 5; ctx.shadowBlur = 0; ctx.strokeText(ch, 0, 0);
    ctx.restore();
  });
  const t = tex(c, { repeat: false });
  NEON_CACHE.set(k, t);
  return t;
}
// x,z = 牆面上的點,yaw 讓字朝外;chars 每字 size 公尺;modes[i] = 'on'|'flicker'|'dead'
export function neonSign(ctx, x, y, z, yaw, str, { color = '#ff3a2a', hex = 0xff3a2a, size = 0.9, modes = [], vertical = false, light = true, zone = null } = {}) {
  const t = neonTex(str, color), chars = [...str], n = chars.length;
  const P = new Parts();
  const W = vertical ? size * 1.1 : n * size + 0.3, H = vertical ? n * size + 0.3 : size * 1.1;
  P.add('cast_iron', box(W, H, 0.08), M(0, 0, 0.04));
  for (let k = 0; k < 4; k++) P.add('steel', cyl(0.015, 0.015, 0.25, 4).rotateX(HALF), M((k % 2 - 0.5) * (W - 0.3), (Math.floor(k / 2) - 0.5) * (H - 0.3), -0.05));
  const g = new THREE.Group();
  g.add(P.group());
  chars.forEach((ch, i) => {
    const mode = modes[i] || 'on';
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: hex, emissiveIntensity: mode === 'dead' ? 0.04 : 2.4, color: 0x222222, transparent: true, alphaTest: 0.08, depthWrite: false, roughness: 0.4 });
    if (mode === 'flicker') { const ph = hash(x * 3 + i) * 10; glowMat(m, 2.4, (tt) => { const a = Math.floor(tt * 9 + ph), b = Math.floor(tt * 0.4 + ph); return hash(b) < 0.45 ? (hash(a) < 0.5 ? 0.05 : hash(a) < 0.7 ? 0.5 : 1) : (hash(a * 7) < 0.04 ? 0.1 : 1); }); }
    const q = new THREE.PlaneGeometry(size, size);
    const a = q.attributes.uv;
    for (let j = 0; j < a.count; j++) a.setX(j, (i + a.getX(j)) / n);
    const mesh = new THREE.Mesh(q, m);
    mesh.position.set(vertical ? 0 : (i - (n - 1) / 2) * size, vertical ? ((n - 1) / 2 - i) * size : 0, 0.09);
    mesh.renderOrder = 6;
    g.add(mesh);
  });
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  ctx.add(g, { static: false });
  if (light) {
    const live = modes.filter((m) => m !== 'dead').length;
    if (live) {
      const lx = x + Math.sin(yaw) * 0.8, lz = z + Math.cos(yaw) * 0.8;
      ctx.light({ x: lx, y, z: lz, color: hex, intensity: 1.6 + live * 0.5, distance: 7, kind: 'lamp', flicker: 0, zone: zone?.id, glow: 0 });
      if (modes.includes('flicker')) lightMod({ x: lx, y, z: lz, mode: 'tube', state: 1 });
    }
  }
}

// ---------- 旗桿(破旗隨風飄)----------
const FLAG_TEX = lazy(() => {
  const [c, ctx] = canvas(256, 160);
  ctx.fillStyle = '#e8e4d8'; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#b01c16'; ctx.fillRect(98, 40, 40, 90); ctx.fillRect(73, 65, 90, 40);
  text(ctx, '聖心醫院', 128, 148, 18, { color: '#333' });
  for (let k = 0; k < 14; k++) softBlob(ctx, rr(0, 256), rr(0, 160), rr(10, 50), '60,50,40', 0.35);
  ctx.globalCompositeOperation = 'destination-out'; // 撕裂的尾端
  ctx.beginPath(); ctx.moveTo(256, 0);
  for (let y = 0; y <= 160; y += 10) ctx.lineTo(256 - rr(10, 70), y);
  ctx.lineTo(256, 160); ctx.fill();
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(rr(120, 220), rr(20, 140), rr(4, 12), 0, TAU); ctx.fill(); }
  return tex(c, { repeat: false });
});
export function flagPole(ctx, P, x, y, z, h = 8) {
  P.add('aluminum', cyl(0.04, 0.06, h, 10), M(x, y + h / 2, z));
  P.add('steel', sph(0.07, 10, 8), M(x, y + h + 0.05, z));
  P.add('concrete', cyl(0.3, 0.35, 0.3, 12), M(x, y + 0.15, z));
  P.add('po_cable', cyl(0.004, 0.004, h - 0.3, 3), M(x + 0.06, y + h / 2, z));
  const g = new THREE.PlaneGeometry(1.6, 1.0, 12, 6).translate(0.8, 0, 0);
  const fl = new THREE.Mesh(g, mat('po_flag'));
  fl.position.set(x + 0.05, y + h - 0.7, z);
  fl.rotation.y = hash(x + z) * TAU;
  ctx.add(fl, { static: false });
  solid(ctx, x, y, z, 0.5, h, 0.5, 'metal');
}

// ---------- 花台(混凝土 + 泥土 + 枯灌木)/ 繳費機 / 書報箱 ----------
export function planter(ctx, P, x, y, z, w, d, yaw = 0) {
  const T = new Parts(), h = 0.45;
  for (const [ax, az, sx, sz] of [[0, -d / 2, w, 0.12], [0, d / 2, w, 0.12], [-w / 2, 0, 0.12, d], [w / 2, 0, 0.12, d]]) T.add('po_curb', box(sx, h, sz), M(ax, h / 2, az));
  T.add('po_soil', box(w - 0.12, 0.05, d - 0.12), M(0, h - 0.08, 0));
  P.merge(T, M(x, y, z, 0, yaw, 0));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? w : d, h, ax ? d : w, 'concrete');
  return y + h - 0.06;
}
export function payStation(ctx, P, x, y, z, yaw) {
  const T = new Parts();
  T.add('metal_gray', rbox(0.5, 1.5, 0.36, 0.03), M(0, 0.75, 0));
  T.add('po_label', labelQuad('pay', 0.42, 0.42), M(0, 1.15, 0.181));
  T.add('glass', box(0.3, 0.16, 0.01), M(0, 1.2, 0.185));
  T.add('plastic_black', box(0.08, 0.02, 0.02), M(0.12, 0.85, 0.19));
  T.add('cast_iron', box(0.6, 0.06, 0.45), M(0, 0.03, 0));
  P.merge(T, M(x, y, z, 0, yaw, 0));
  solid(ctx, x, y, z, 0.5, 1.5, 0.5, 'metal');
}
// ---------- 購物推車(動態)----------
function cartParts() {
  const P = new Parts(), L = 0.85, W = 0.52, H = 0.5, y0 = 0.42;
  for (let k = 0; k <= 8; k++) { const x = -L / 2 + k * L / 8; P.add('chrome', box(0.008, H, 0.008), M(x, y0 + H / 2 - 0.45, W / 2)); P.add('chrome', box(0.008, H, 0.008), M(x, y0 + H / 2 - 0.45, -W / 2)); }
  for (let k = 0; k <= 5; k++) { const z = -W / 2 + k * W / 5; P.add('chrome', box(0.008, H, 0.008), M(L / 2, y0 + H / 2 - 0.45, z)); P.add('chrome', box(0.008, H, 0.008), M(-L / 2, y0 + H / 2 - 0.45, z)); P.add('chrome', box(L, 0.008, 0.008), M(0, y0 - 0.45, z)); }
  for (const yy of [0, H * 0.5, H]) { P.add('chrome', box(L, 0.012, 0.012), M(0, y0 + yy - 0.45, W / 2)); P.add('chrome', box(L, 0.012, 0.012), M(0, y0 + yy - 0.45, -W / 2)); P.add('chrome', box(0.012, 0.012, W), M(L / 2, y0 + yy - 0.45, 0)); P.add('chrome', box(0.012, 0.012, W), M(-L / 2, y0 + yy - 0.45, 0)); }
  P.add('plastic_red', cyl(0.018, 0.018, W + 0.06, 8).rotateX(HALF), M(-L / 2 - 0.15, y0 + H + 0.05 - 0.45, 0));
  for (const s of [-1, 1]) P.add('chrome', rod(new V3(-L / 2, y0 + H - 0.45, s * W / 2), new V3(-L / 2 - 0.15, y0 + H + 0.05 - 0.45, s * W / 2), 0.008, 4));
  for (const [ex, ez] of [[-0.35, -0.22], [-0.35, 0.22], [0.35, -0.2], [0.35, 0.2]]) { P.add('chrome', rod(new V3(ex, y0 - 0.45, ez), new V3(ex, 0.08 - 0.45, ez), 0.008, 4)); P.add('rubber', cyl(0.05, 0.05, 0.03, 10).rotateX(HALF), M(ex, 0.05 - 0.45, ez)); }
  return P;
}
export const cart = (ctx, x, y, z, yaw = 0, tipped = false) => dyn(ctx, 'cart', cartParts, { mass: 14, shape: 'box', size: [1.0, 0.95, 0.56], friction: 0.35, restitution: 0.1 }, x, y + (tipped ? 0.3 : 0.45), z, tipped ? [HALF * 0.95, yaw, 0] : [0, yaw, 0]);
// ---------- 棧板(靜態;stack 層)----------
export function pallet(P, x, y, z, yaw = 0, stack = 1, rng = null) {
  rng = rng || posRng(x, z);
  for (let s = 0; s < stack; s++) {
    const T = new Parts(), yy = s * 0.145;
    for (let k = 0; k < 7; k++) T.add('wood_old', box(0.1, 0.022, 1.2), M(-0.39 + k * 0.13, yy + 0.133, 0));
    for (let k = 0; k < 3; k++) T.add('wood_old', box(0.8, 0.022, 0.1), M(0, yy + 0.011, -0.55 + k * 0.55));
    for (let k = 0; k < 3; k++) for (const x2 of [-0.36, 0, 0.36]) T.add('wood_old', box(0.1, 0.09, 0.14), M(x2, yy + 0.067, -0.53 + k * 0.53));
    P.merge(T, M(x, y, z, 0, yaw + (rng() - 0.5) * 0.12, 0));
  }
}
