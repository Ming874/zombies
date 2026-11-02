import * as THREE from 'three';
import { rng as mkRng } from '../ctx.js';
import { Parts, M, box, rbox, cyl, sph, tor, rod, tube, pool, put, solid, keepUV, V3, HALF, TAU } from './kit.js';
import { labelUV, decalUV } from './mats.js';
import { surf } from '../../hospital/surfaces.js';
import { groundDecal, labelQuad } from './cars.js';
import { flatDecal, trashBag, bagFallback } from './industrial.js';
import { BAND, litter, leafPatch, puddle, wallStrip, drain } from './ground.js';
import { bodyBag, bioBin } from './camp.js';
import { barrel, crate, propane, tyre, pallet, wetSign } from './furniture.js';
import { bagGeo } from '../indoor/scene8.js';

// 地下室工業房間:維修隧道、鍋爐房、裝卸平台、救護車坡道、焚化爐室、水泵房、頂樓機房、納骨堂、停屍間外梯。
// 沿牆管線/線槽(每格一段,接起來連續)、閥門與壓力錶、大型機械(碰撞)、雜物與水漬。
const zrng = (zone) => { let h = 2166136261; for (const ch of zone.id + '#b') h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return mkRng(h >>> 0); };
const finish = (ctx, P) => { if (P.map.size) put(ctx, P, 0, 0, 0); };
// 固定座標的大件(醫院地圖的位置):格子要可放,而且要在目前這個區域裡(換地圖時自然略過)
let curZone = null;
const freeAt = (ctx, li, x, z, r = 0.6) => {
  for (let c = Math.floor((x - r) / 2); c <= Math.floor((x + r - 1e-3) / 2); c++) for (let rr = Math.floor((z - r) / 2); rr <= Math.floor((z + r - 1e-3) / 2); rr++) {
    if (!ctx.isPlain(li, c, rr) || ctx.occupied(li, c, rr) || ctx.nearDoor(li, c, rr)) return false;
    if (curZone && ctx.L.zoneAt(li, c, rr) !== curZone) return false;
  }
  return true;
};
// 牆面座標系:spot.x/z 在牆面上,(nx,nz) 朝房間;along = 沿牆方向
const along = (s) => [s.nz !== 0 ? 1 : 0, s.nx !== 0 ? 1 : 0];

// 圓形壓力錶(本地 +Z 朝外、原點在安裝面):黑色錶殼、鍍鉻錶圈、圓形錶面(po_label 圖集的錶盤,圓形 UV)。
// [w6] 以前是一塊方形貼片 + 實心鍍鉻圓柱,圓柱端蓋跟錶面在同一個平面 → 錶面上一片黑色楔形的 z-fighting(加上手電筒陰影更明顯)。
//      現在錶面在錶殼端蓋前 5mm、錶圈壓住錶面邊緣,也沒有方形底色。up > 0:往上接到管線的取壓管(豬尾彎管 + 考克);down > 0:往下的短接頭。
const dialGeo = (name, r) => { const [u, v, uw, vh] = labelUV(name), g = new THREE.CircleGeometry(r, 24), a = g.attributes.uv, k = 60 / 64; for (let i = 0; i < a.count; i++) a.setXY(i, u + (0.5 + (a.getX(i) - 0.5) * k) * uw, v + (0.5 + (a.getY(i) - 0.5) * k) * vh); return keepUV(g); };
export function gaugeParts(name, r = 0.09, { up = 0, down = 0, pipeZ = 0.12 } = {}) {
  const T = new Parts(), d = 0.038, zc = d / 2 + 0.004;
  T.add('cast_iron', cyl(r, r, d, 20).rotateX(HALF), M(0, 0, zc));
  T.add('po_label', dialGeo(name, r * 0.9), M(0, 0, d + 0.009));
  T.add('chrome', tor(r * 0.95, r * 0.075, 5, 24), M(0, 0, d + 0.008));
  if (up > 0) {
    T.add('steel', rod(new V3(0, r - 0.004, zc), new V3(0, r + 0.018, zc), 0.008, 6));
    T.add('steel', tor(0.028, 0.007, 4, 12), M(0, r + 0.046, zc)); // 防震豬尾彎管
    T.add('steel', rod(new V3(0, r + 0.074, zc), new V3(0, up, zc), 0.008, 6));
    T.add('cast_iron', box(0.036, 0.05, 0.036), M(0, r + 0.24, zc)); T.add('plastic_red', box(0.075, 0.012, 0.012), M(0.03, r + 0.24, zc + 0.026)); // 考克 + 紅色把手
    T.add('steel', rod(new V3(0, up, zc), new V3(0, up, pipeZ), 0.008, 6));
    T.add('cast_iron', cyl(0.016, 0.016, 0.02, 6).rotateX(HALF), M(0, up, pipeZ - 0.012)); // 接頭
  }
  if (down > 0) { T.add('steel', rod(new V3(0, -r + 0.004, zc), new V3(0, -r - down, zc), 0.01, 8)); T.add('cast_iron', cyl(0.02, 0.02, 0.024, 6), M(0, -r - 0.014, zc)); }
  return T;
}

// 沿牆管線(兩根管 + 支架;每個牆格一段 2m)
function wallPipes(P, s, y, R, { h = 2.5, n = 2, key = 'steel', r = 0.055, tray = false } = {}) {
  const [ax, az] = along(s);
  const a = new V3(s.x - ax * 1.0 + s.nx * 0.16, 0, s.z - az * 1.0 + s.nz * 0.16), b = new V3(s.x + ax * 1.0 + s.nx * 0.16, 0, s.z + az * 1.0 + s.nz * 0.16);
  for (let k = 0; k < n; k++) {
    const yy = y + h + k * 0.18, off = k * 0.06;
    P.add(k === 1 && key === 'steel' ? 'rust' : key, rod(new V3(a.x + s.nx * off, yy, a.z + s.nz * off), new V3(b.x + s.nx * off, yy, b.z + s.nz * off), r - k * 0.012, 8));
  }
  P.add('cast_iron', box(ax ? 0.04 : 0.24, 0.42, az ? 0.04 : 0.24), M(s.x + s.nx * 0.12, y + h + 0.08, s.z + s.nz * 0.12)); // 支架
  if (tray) { // 電纜槽 + 電纜
    const yy = y + h - 0.35;
    P.add('steel', box(ax ? 2 : 0.3, 0.04, az ? 2 : 0.3), M(s.x + s.nx * 0.22, yy, s.z + s.nz * 0.22));
    for (let k = 0; k < 3; k++) P.add('po_cable', rod(new V3(a.x + s.nx * (0.12 + k * 0.06), yy + 0.04, a.z + s.nz * (0.12 + k * 0.06)), new V3(b.x + s.nx * (0.12 + k * 0.06), yy + 0.04, b.z + s.nz * (0.12 + k * 0.06)), 0.012, 4));
  }
  if (R() < 0.18) { // 閥門(紅色手輪)
    const vx = s.x + s.nx * 0.16, vz = s.z + s.nz * 0.16;
    P.add('cast_iron', cyl(0.085, 0.085, 0.2, 10).rotateZ(ax ? HALF : 0).rotateX(az ? HALF : 0), M(vx, y + h, vz));
    P.add('plastic_red', tor(0.12, 0.014, 5, 16).rotateY(ax ? 0 : HALF), M(vx + s.nx * 0.2, y + h, vz + s.nz * 0.2));
    P.add('po_label', labelQuad('valvetag', 0.1, 0.1).rotateY(Math.atan2(s.nx, s.nz)), M(vx + s.nx * 0.09, y + h - 0.2, vz + s.nz * 0.09));
  }
  if (R() < 0.12) P.merge(gaugeParts(R() < 0.5 ? 'gauge' : 'gauge2', 0.09, { up: h - 1.6, pipeZ: 0.11 }), M(s.x + ax * 0.5, y + 1.6, s.z + az * 0.5, 0, Math.atan2(s.nx, s.nz), 0)); // 壓力錶 + 取壓管(接到最下面那根管)
  if (R() < 0.25) flatDecal(P, R.pick(['rustrun', 'drip', 'soot']), s.x + s.nx * 0.012, y + h - 0.6, s.z + s.nz * 0.012, R.range(0.5, 1.0), R.range(1.0, 1.8), s.nx > 0.5 ? 'x+' : s.nx < -0.5 ? 'x-' : s.nz > 0.5 ? 'z+' : 'z-');
  wallStrip(P, BAND.grime, s.x - ax, s.z - az, s.x + ax, s.z + az, y, R.range(0.4, 0.9), s.nx, s.nz);
}
// 牆上的配電箱 / 告示
function wallBox(P, s, y, R) {
  const yaw = Math.atan2(s.nx, s.nz), x = s.x + s.nx * 0.13, z = s.z + s.nz * 0.13;
  P.add('metal_gray', box(0.6, 0.8, 0.22), M(x, y + 1.5, z, 0, yaw, 0));
  P.add('po_label', labelQuad(R() < 0.5 ? 'hv' : 'panel', 0.32, 0.2), M(x + s.nx * 0.115, y + 1.65, z + s.nz * 0.115, 0, yaw, 0));
  P.add('rubber', tube([new V3(x, y + 1.9, z), new V3(x, y + 2.4, z), new V3(x + s.nx * 0.05, y + 2.6, z + s.nz * 0.05)], 0.02, { radial: 4 }));
}
// 貼在臥式圓筒(軸沿 X、中心高 cy)上的彎曲貼花:side 1 = +Z 側(從頂部往下到腰線)、-1 = -Z 側;圖的上緣在筒頂
function drumDecal(T, name, r, x, cy, w, side) {
  const [u, v, uw, vh] = decalUV(name), th0 = side > 0 ? 0.05 : HALF, g = new THREE.CylinderGeometry(r, r, w, 10, 1, true, th0, HALF - 0.05), a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) { const t = side > 0 ? a.getX(i) : 1 - a.getX(i); a.setXY(i, u + a.getY(i) * uw, v + t * vh); }
  g.rotateZ(HALF).translate(x, cy, 0);
  T.add('po_decal', keepUV(g));
}
// 大型臥式鍋爐(保溫層 + 鞍座 + 爐門 + 煙道)
function boiler(ctx, P, x, y, z, yaw, R) {
  const T = new Parts(), L = 3.6, r = 1.0;
  (ctx.__b1 || (ctx.__b1 = { boilers: [] })).boilers.push({ x, y, z, yaw }); // [scene8] 燃燒機、儀表、安全閥、立管在 indoor/scene8.js
  T.add('aluminum', cyl(r, r, L, 24).rotateZ(HALF), M(0, r + 0.35, 0)); // [w6] 鋁皮保溫外殼(原本整筒 rust 是一片平的橘色,像玩具);髒污靠下面的煙燻/鏽水貼花
  for (const [nm, dx, w, side] of [['rustrun', 0.55, 0.8, 1], ['rustrun', 1.2, 0.55, -1], ['soot', -0.9, 1.4, 1], ['soot', 0.7, 1.2, -1], ['soot', -0.6, 1.0, -1]]) drumDecal(T, nm, r + 0.011, dx, r + 0.35, w, side); // 貼著筒身彎曲的鏽水/煙燻(平面貼花在圓筒上會浮起來)
  flatDecal(T, 'soot', 0, r * 2 + 0.36, 0, 2.6, 1.4, 'y+');
  for (const s of [-1, 1]) for (const [dx, w] of [[-0.9, 1.2], [0.7, 1.5]]) flatDecal(T, 'rustrun', dx, r + 0.35 - 0.05, s * (r + 0.012), w, 0.5, s > 0 ? 'z+' : 'z-'); // 鏽水痕
  for (let k = 0; k <= 6; k++) T.add('steel', tor(r + 0.01, 0.015, 4, 28).rotateY(HALF), M(-L / 2 + k * L / 6, r + 0.35, 0));
  T.add('cast_iron', cyl(r * 0.95, r * 0.95, 0.12, 24).rotateZ(HALF), M(L / 2 + 0.06, r + 0.35, 0));
  T.add('cast_iron', cyl(0.3, 0.3, 0.1, 16).rotateZ(HALF), M(L / 2 + 0.14, r + 0.1, 0)); // 爐門
  T.add('po_ember', cyl(0.12, 0.12, 0.02, 12).rotateZ(HALF), M(L / 2 + 0.2, r + 0.1, 0));
  for (const s of [-1, 1]) T.add('concrete', box(0.4, 0.5, 1.5), M(s * L * 0.33, 0.25, 0));
  T.add('metal_gray', cyl(0.25, 0.25, 2.4, 14), M(-L / 2 + 0.4, r * 2 + 0.35 + 1.0, 0)); // 煙道
  T.add('rust', cyl(0.12, 0.12, 0.5, 10), M(0.6, r * 2 + 0.55, 0));
  T.merge(gaugeParts('gauge2', 0.1, { down: 0.12 }), M(L / 2 + 0.12, r + 0.8, 0.4, 0, HALF, 0)); // [w6] 圓形錶(原本是方形貼片)
  flatDecal(T, 'soot', L / 2 + 0.125, r + 0.45, 0, 1.2, 1.0, 'x+');
  flatDecal(T, 'oil', 0, 0.006, 0, 3.4, 2.0, 'y+');
  P.merge(T, M(x, y, z, 0, yaw, 0));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? L + 0.3 : 2.1, 2.5, ax ? 2.1 : L + 0.3, 'heavy');
}
// 水泵(馬達 + 渦殼 + 底座 + 進出水管)
function pump(ctx, P, x, y, z, yaw) {
  const T = new Parts();
  T.add('cast_iron', box(1.6, 0.18, 0.6), M(0, 0.09, 0));
  T.add('po_green_paint', cyl(0.24, 0.24, 0.6, 16).rotateZ(HALF), M(-0.35, 0.45, 0));
  for (let k = 0; k < 8; k++) T.add('po_green_paint', box(0.6, 0.02, 0.5), M(-0.35, 0.45, 0, (k / 8) * Math.PI, 0, 0));
  T.add('po_green_paint', sph(0.3, 14, 10).scale(0.6, 1, 1), M(0.25, 0.48, 0));
  T.add('steel', cyl(0.12, 0.12, 0.6, 12), M(0.25, 0.95, 0));
  T.add('steel', cyl(0.12, 0.12, 0.5, 12).rotateZ(HALF), M(0.65, 0.48, 0));
  T.add('plastic_red', tor(0.12, 0.012, 4, 14), M(0.25, 1.05, 0.0, HALF, 0, 0));
  flatDecal(T, 'oil', 0, 0.006, 0, 1.8, 1.0, 'y+');
  P.merge(T, M(x, y, z, 0, yaw, 0));
  solid(ctx, x, y, z, 1.7, 1.1, 1.7, 'heavy');
}
// 堆高機(簡化:車身、門架、牙叉、護頂、座椅、輪)
function forklift(ctx, P, x, y, z, yaw) {
  const T = new Parts();
  T.add('po_gen_yellow', rbox(1.1, 0.8, 1.9, 0.08), M(0, 0.62, 0));
  T.add('cast_iron', rbox(1.0, 0.5, 0.5, 0.06), M(0, 0.7, -0.95)); // 配重
  for (const s of [-1, 1]) { T.add('rubber', cyl(0.3, 0.3, 0.22, 14).rotateZ(HALF), M(s * 0.5, 0.3, 0.6)); T.add('rubber', cyl(0.24, 0.24, 0.2, 14).rotateZ(HALF), M(s * 0.5, 0.24, -0.65)); }
  for (const s of [-1, 1]) T.add('cast_iron', box(0.08, 2.2, 0.12), M(s * 0.36, 1.1, 1.05));
  T.add('cast_iron', box(0.8, 0.1, 0.1), M(0, 0.5, 1.12));
  for (const s of [-1, 1]) T.add('steel', box(0.12, 0.05, 1.1), M(s * 0.25, 0.08, 1.65));
  for (const [a, b] of [[-0.45, 0.4], [0.45, 0.4], [-0.45, -0.6], [0.45, -0.6]]) T.add('cast_iron', box(0.05, 1.2, 0.05), M(a, 1.6, b));
  T.add('cast_iron', box(1.0, 0.05, 1.1), M(0, 2.2, -0.1));
  T.add('rubber', rbox(0.5, 0.1, 0.45, 0.04), M(0, 1.08, -0.4));
  T.add('rubber', cyl(0.18, 0.18, 0.03, 12), M(0, 1.45, 0.2, 0.6, 0, 0));
  P.merge(T, M(x, y, z, 0, yaw, 0));
  solid(ctx, x, y, z, 1.6, 2.2, 1.6, 'heavy');
}
// 籠車
function rollCage(P, x, y, z, yaw, R) {
  const T = new Parts();
  for (const [a, b] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) T.add('steel', box(0.03, 1.6, 0.03), M(a, 0.9, b));
  for (let k = 0; k < 6; k++) { T.add('steel', box(0.72, 0.01, 0.01), M(0, 0.3 + k * 0.25, -0.3)); T.add('steel', box(0.01, 0.01, 0.62), M(-0.35, 0.3 + k * 0.25, 0)); T.add('steel', box(0.01, 0.01, 0.62), M(0.35, 0.3 + k * 0.25, 0)); }
  T.add('steel', box(0.72, 0.03, 0.62), M(0, 0.16, 0));
  for (const [a, b] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) T.add('rubber', cyl(0.05, 0.05, 0.03, 8).rotateX(HALF), M(a, 0.06, b));
  if (R() < 0.7) T.add('cardboard', box(0.6, 0.4, 0.5), M(0, 0.4, 0));
  if (R() < 0.5) T.add('po_bag_black', box(0.5, 0.3, 0.4), M(0, 0.75, 0, 0, 0.3, 0));
  P.merge(T, M(x, y, z, 0, yaw, 0));
}
// 推車上的紅色醫療廢棄物袋
function wasteCart(P, x, y, z, yaw) {
  // [scene8] 660L 四輪醫療廢棄物桶:桶身、上緣、往後掀開的蓋子、後把手、後大輪 + 前腳輪,桶裡塞滿紅袋
  const T = new Parts();
  T.add('po_bag_yellow', rbox(0.86, 0.78, 0.6, 0.03), M(0, 0.56, 0));
  T.add('po_bag_yellow', rbox(0.92, 0.06, 0.66, 0.02), M(0, 0.97, 0));
  T.add('po_bag_yellow', rbox(0.9, 0.04, 0.64, 0.02), M(0, 1.26, -0.41, -1.92, 0, 0));
  T.add('steel', rod(new V3(-0.4, 0.9, -0.37), new V3(0.4, 0.9, -0.37), 0.018, 6));
  for (const s of [-1, 1]) T.add('steel', box(0.04, 0.04, 0.08), M(s * 0.4, 0.9, -0.33));
  for (const s of [-1, 1]) T.add('rubber', cyl(0.1, 0.1, 0.06, 10).rotateZ(HALF), M(s * 0.4, 0.1, -0.22));
  for (const s of [-1, 1]) T.add('rubber', cyl(0.055, 0.055, 0.04, 8).rotateZ(HALF), M(s * 0.32, 0.055, 0.22));
  T.add('po_bag_red', bagGeo(0.26, 7), M(-0.18, 0.97, 0.02, 0, 0.4, 0, 1.1, 0.9, 1)); // [scene8] 跟廢棄物山同一種皺垃圾袋(原本的袋子像紅椒)
  T.add('po_bag_red', bagGeo(0.24, 9), M(0.2, 0.95, 0.04, 0.2, 1.3, 0, 1.05, 0.85, 1));
  T.add('po_label', labelQuad('wastebin', 0.5, 0.25), M(0, 0.62, 0.302));
  P.merge(T, M(x, y, z, 0, yaw, 0));
}

// 軟邊的濕地板貼花(跟 puddle 一樣抽兩次亂數,後面的擺設不會跑掉)
function wetPatch(P, R, x, z, r, sx, sz, y) { R(); const rot = R() * TAU; groundDecal(P, 'water2', x, z, r * sx * 2.6, r * sz * 2.6, rot, y); }
// ======================================================================
function dressTunnel(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) { wallPipes(P, s, y, R, { tray: R() < 0.5 }); if (R() < 0.05) wallBox(P, s, y, R); }
  for (const c of ctx.cells(zone, { allowNearDoor: true })) {
    if (R() < 0.12) wetPatch(P, R, c.x + R.range(-0.4, 0.4), c.z + R.range(-0.4, 0.4), R.range(0.3, 0.7), 1.5, 0.8, y + 0.004); // [w6] 原本是 po_puddle(暗隧道裡反射不到東西 → 一塊硬邊的黑色多邊形)
    if (R() < 0.1) litter(P, R, c.x, c.z, 0.7, R.int(1, 3), ['form', 'news', 'glove', 'mask', 'card', 'tissue'], y + 0.009);
    if (R() < 0.05) groundDecal(P, R.pick(['blood2', 'drip', 'steps', 'water2']), c.x, c.z, 1.2, 0.8, R() * TAU, y + 0.006);
  }
  const cells = ctx.cells(zone);
  for (let k = 0; k < 4 && cells.length; k++) { const c = cells[(R() * cells.length) | 0]; if (freeAt(ctx, li, c.x, c.z, 0.3)) trashBag(ctx, c.x + R.range(-0.5, 0.5), y, c.z + R.range(-0.5, 0.5), R() * TAU, R.range(0.8, 1.1)); }
  tunnelSars(ctx, zone, P, R, li, y);
  finish(ctx, P);
}
// [scene v3] 2003 封院:醫療廢棄物從病房經地下隧道推去焚化爐 → 沿牆的紅/黃感染性廢棄物袋堆、拖在地上的電纜與延長線、
// 碎水泥塊與灰塵堆(全部用既有共用材質,依材質合併,不增加 draw call)
function tunnelSars(ctx, zone, P, R, li, y) {
  const spots = ctx.wallSpots(zone, { allowNearDoor: false });
  // 沿牆的電纜(每面牆一段,稍微彎曲;有些是白色延長線接到插座盒)
  for (const s of spots) {
    if (R() > 0.45) continue;
    const tx = -s.nz, tz = s.nx, d = 0.1 + R() * 0.12, pts = [];
    for (let i = 0; i <= 4; i++) { const t = (i / 4 - 0.5) * 2.02; pts.push(new V3(s.x + s.nx * (d + Math.sin(i * 1.7 + s.x) * 0.04) + tx * t, y + 0.012, s.z + s.nz * (d + Math.sin(i * 1.3 + s.z) * 0.04) + tz * t)); }
    const ext = R() < 0.3;
    P.add(ext ? 'plastic_white' : 'rubber', tube(pts, ext ? 0.006 : 0.014, { radial: 5 }));
    if (ext && R() < 0.5) P.add('plastic_white', rbox(0.2, 0.04, 0.06, 0.008), M(pts[4].x, y + 0.02, pts[4].z, 0, Math.atan2(tx, tz), 0));
  }
  // 感染性廢棄物袋堆(紅/黃,束口),靠牆、不擋路
  let piles = 0;
  for (const s of spots) {
    if (piles >= 6 || R() > 0.14) continue;
    const cx = s.x + s.nx * 0.45, cz = s.z + s.nz * 0.45;
    if (!freeAt(ctx, li, cx, cz, 0.45)) continue;
    const n = 2 + ((R() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const r = R.range(0.2, 0.3), ox = R.range(-0.45, 0.45), oz = R.range(-0.18, 0.18), top = k >= 3;
      const key = R() < 0.65 ? 'plastic_red' : 'plastic_yellow';
      P.add(key, sph(r, 10, 7), M(cx - s.nz * ox + s.nx * oz, y + r * 0.8 + (top ? 0.32 : 0), cz + s.nx * ox + s.nz * oz, R.range(-0.2, 0.2), R() * TAU, R.range(-0.2, 0.2), 1, 0.78, 0.9));
      P.add(key, cyl(0.02, 0.05, 0.1, 6), M(cx - s.nz * ox + s.nx * oz, y + r * 1.55 + (top ? 0.32 : 0), cz + s.nx * ox + s.nz * oz));
    }
    solid(ctx, cx, y, cz, Math.abs(s.nz) > 0.5 ? 1.2 : 0.7, 0.75, Math.abs(s.nz) > 0.5 ? 0.7 : 1.2);
    piles++;
  }
  // 碎水泥塊與灰塵(天花板剝落)
  const cells = ctx.cells(zone, { allowNearDoor: true });
  for (const c of cells) {
    if (R() > 0.08) continue;
    const n = 3 + ((R() * 6) | 0);
    for (let k = 0; k < n; k++) { const r = R.range(0.03, 0.09); P.add('concrete_wall', new THREE.DodecahedronGeometry(r, 0), M(c.x + R.range(-0.5, 0.5), y + r * 0.5, c.z + R.range(-0.5, 0.5), R() * 3, R() * 3, R() * 3, 1, 0.6, 1)); }
    groundDecal(P, R.pick(['ashes', 'water2', 'steps']), c.x, c.z, 1.1, 0.8, R() * TAU, y + 0.006);
  }
}
function dressBoiler(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) wallPipes(P, s, y, R, { tray: R() < 0.3, n: 3 });
  if (freeAt(ctx, li, 24, 17.5, 1.9)) boiler(ctx, P, 24, y, 17.6, 0, R);
  if (freeAt(ctx, li, 30.5, 22.5, 1.9)) boiler(ctx, P, 30.6, y, 22.6, HALF, R);
  if (freeAt(ctx, li, 21, 25.5, 1.0)) { P.add('po_coal', new THREE.SphereGeometry(1.0, 12, 6, 0, TAU, 0, HALF).scale(1.4, 0.5, 1.0), M(21, y, 25.6)); groundDecal(P, 'ashes', 21, 25.6, 3, 2.4, 0.3, y + 0.006); solid(ctx, 21, y, 25.6, 2.2, 0.5, 1.6, 'stone'); }
  if (freeAt(ctx, li, 34.6, 15.4, 0.6)) { // 工作台
    P.add('wood_old', box(1.8, 0.06, 0.7), M(34.6, y + 0.9, 15.2)); for (const [a, b] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) P.add('steel', box(0.05, 0.9, 0.05), M(34.6 + a, y + 0.45, 15.2 + b));
    P.add('cast_iron', box(0.18, 0.12, 0.12), M(34.1, y + 0.99, 15.2)); P.add('steel', box(0.3, 0.02, 0.04), M(34.8, y + 0.94, 15.0, 0, 0.5, 0)); P.add('plastic_red', box(0.4, 0.2, 0.2), M(35.1, y + 1.03, 15.3));
    solid(ctx, 34.6, y, 15.2, 1.8, 0.95, 0.7, 'metal');
  }
  for (const [x, z] of [[19.4, 14.8], [20.2, 15.2]]) barrel(ctx, x, y, z, { yaw: R() * TAU });
  propane(ctx, 35.2, y, 26.8, false);
  groundDecal(P, 'oil', 27, 20, 3, 2.2, 0.4, y + 0.006);
  boilerFuel(ctx, P, y, zone); // [scene r5] 207 發電機的油從這裡扛出去
  finish(ctx, P);
}
function dressDock(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) {
    if (R() < 0.5) wallPipes(P, s, y, R, { h: 2.9, n: 1, tray: true });
    if (R() < 0.3) { const yaw = Math.atan2(s.nx, s.nz); for (const dy of [0.5, 1.1]) P.add('rubber', box(0.5, 0.35, 0.12), M(s.x + s.nx * 0.06, y + dy, s.z + s.nz * 0.06, 0, yaw, 0)); }
  }
  for (let x = 104.5; x < 116; x += 1.6) groundDecal(P, 'skid', x, 39, 1.5, 0.4, 0, y + 0.006);
  if (freeAt(ctx, li, 107, 25, 1.0)) forklift(ctx, P, 107.2, y, 25.4, 0.4);
  for (const [x, z] of [[112.6, 23.4], [114.4, 23.4], [114.6, 26.2]]) if (freeAt(ctx, li, x, z, 0.5)) { pallet(P, x, y, z, R.range(-0.2, 0.2), R.int(1, 2), R); P.add('cardboard', box(1.0, 0.6, 0.7), M(x, y + 0.6, z, 0, R.range(-0.2, 0.2), 0)); P.add('po_sheet', box(1.02, 0.62, 0.72), M(x, y + 0.6, z)); solid(ctx, x, y, z, 1.2, 0.9, 1.2, 'wood'); }
  for (const [x, z] of [[105.6, 33.4], [106.6, 33.6]]) rollCage(P, x, y, z, R.range(-0.4, 0.4), R);
  if (freeAt(ctx, li, 106, 33.5, 0.9)) solid(ctx, 106.1, y, 33.5, 1.9, 1.7, 0.8, 'metal');
  for (const [x, z] of [[113.4, 31.2], [114.6, 32.4]]) crate(ctx, x, y, z, R.range(-0.3, 0.3));
  for (const [x, z] of [[110.2, 36.6], [111.1, 37.0]]) barrel(ctx, x, y, z, { yaw: R() * TAU, fallen: x > 111 });
  tyre(ctx, 108.4, y, 29.5, true);
  dockHandoff(ctx, P, y, zone); // [scene r4] 2003:金水伯每晚在坡道口的鐵網外送便當,隔著網跟鄭玉蘭講話
  litter(P, R, 110, 30, 4, 18, ['card', 'news', 'form', 'glove', 'bag'], y + 0.009);
  finish(ctx, P);
}
function dressRamp(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  // 坡道兩側牆面:黃黑警示條、凸面鏡
  for (const [x, nx] of [[108, 1], [112, -1]]) {
    P.add('po_hazard', box(0.02, 0.5, 8.0), M(x + nx * 0.011, y + 0.4 + 2.1, 44));
    P.add('po_hazard', box(0.02, 0.5, 8.0), M(x + nx * 0.011, y + 0.4, 44));
  }
  P.add('steel', cyl(0.02, 0.02, 0.4, 6).rotateZ(HALF), M(111.8, y + 3.0, 40.8));
  P.add('chrome', sph(0.3, 16, 10).scale(1, 1, 0.35), M(111.5, y + 3.0, 40.8, 0, -HALF, 0));
  P.add('rubber', tor(0.3, 0.03, 6, 16).rotateY(HALF), M(111.52, y + 3.0, 40.8));
  for (let k = 0; k < 6; k++) leafPatch(P, R, 110 + R.range(-1.4, 1.4), 47.2 - k * 0.2, 0.5, 5, y + 0.02 + (47.5 - k) * 0.0);
  finish(ctx, P);
}
// 爐前的出灰坑:角鐵框 + 鑄鐵格柵,格柵底下是黑的(在地面上做,不挖洞)
function ashPit(T, cx, cz, w, d) {
  T.add('po_soot', box(w - 0.06, 0.004, d - 0.06), M(cx, 0.009, cz));
  for (const s of [-1, 1]) { T.add('cast_iron', box(w, 0.028, 0.05), M(cx, 0.014, cz + s * (d / 2 - 0.025))); T.add('cast_iron', box(0.05, 0.028, d - 0.1), M(cx + s * (w / 2 - 0.025), 0.014, cz)); }
  const n = 12; for (let i = 0; i < n; i++) T.add('cast_iron', box(0.024, 0.022, d - 0.1), M(cx - (w - 0.14) / 2 + (i * (w - 0.14)) / (n - 1), 0.017, cz));
  for (const s of [-1, 1]) T.add('cast_iron', box(w - 0.1, 0.018, 0.022), M(cx, 0.013, cz + s * d * 0.2));
}
// 一小堆灰:低矮、邊緣不規則的半球(邊緣貼地)
function ashMound(r, h, k) {
  const g = new THREE.SphereGeometry(r, 18, 5, 0, TAU, 0, HALF), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), s = 1 + 0.16 * Math.sin(a * 2 + k * 1.7) + 0.05 * Math.sin(a * 5 + k * 3.1), t = y / r;
    p.setXYZ(i, x * s, h * t * t * (3 - 2 * t) * (0.9 + 0.2 * Math.sin(x * 11 + z * 9 + k)), z * s); // 邊緣平緩的土丘輪廓
  }
  g.computeVertexNormals();
  return g;
}
function dressIncinerator(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) if (R() < 0.6) wallPipes(P, s, y, R, { h: 2.8, n: 1, key: 'rust' });
  // 焚化爐爐口(嵌在南牆:鐵門 + 火光)
  // [w4 scene] 爐子嵌在東牆、正對隧道門(從門口一進來就在視線盡頭;原本在南牆,門口看不到)。爐口朝 -x
  const fx = 101.5, fz = 59.0, fyaw = -HALF;
  if (freeAt(ctx, li, fx - 1.0, fz, 0.8)) {
    const F = new Parts();
    F.add('po_firebrick', box(3.0, 2.6, 1.0), M(0, 1.3, 0));
    F.add('cast_iron', box(1.2, 0.9, 0.08), M(0, 1.1, 0.52));
    F.add('po_ember', box(0.9, 0.18, 0.02), M(0, 0.72, 0.565));
    F.add('cast_iron', box(1.6, 0.12, 0.1), M(0, 1.62, 0.55));
    flatDecal(F, 'soot', 0, 1.9, 0.505, 2.6, 1.6, 'z+');
    groundDecal(F, 'ashes', 0, 1.6, 2.6, 1.6, 0, 0.006);
    ashPit(F, 0, 1.38, 1.2, 0.78); // [w6] 原本是一塊扁半球(10 邊),遠看是地上一塊黑色八角形
    for (const [x, y, z, r, h, k] of [[0.28, 0, 0.82, 0.34, 0.12, 1], [-0.18, 0.02, 1.36, 0.2, 0.06, 2]]) F.add('po_ash', ashMound(r, h, k), M(x, y, z)); // 爐門底下掉出來的灰、格柵上的一小堆
    F.add('wood_old', rod(new V3(-1.9, 0.1, 0.7), new V3(-2.0, 1.3, 0.5), 0.02, 6));
    P.merge(F, M(fx, y, fz, 0, fyaw, 0));
    ctx.light({ x: fx - 0.9, y: y + 0.9, z: fz, color: 0xff5a18, intensity: 7, distance: 11, kind: 'fire', flicker: 0.3, zone: zone.id, glow: 0.6, pri: 3 });
    solid(ctx, fx, y, fz, 1.0, 2.6, 3.0, 'stone');
    (ctx.__b1 || (ctx.__b1 = { boilers: [] })).furnace = { x: fx, z: fz, yaw: fyaw }; // [scene8] 爐口周邊在 indoor/scene8.js(yaw:模板 +Z 朝房間)
  }
  for (const [x, z] of [[98.6, 36.4], [99.6, 40.8], [86.2, 56.2], [88.6, 56.0]]) if (freeAt(ctx, li, x, z, 0.6)) { wasteCart(P, x, y, z, R.range(-0.3, 0.3)); solid(ctx, x, y, z, 1.0, 1.1, 0.7, 'metal'); }
  for (const [x, z] of [[97.2, 44.8], [97.8, 45.6], [84.6, 60.4]]) bioBin(ctx, x, y, z, R() * TAU);
  for (let k = 0; k < 6; k++) trashBag(ctx, 96 + R.range(-0.6, 0.6), y, 50 + R.range(-1, 1), R() * TAU, R.range(0.8, 1.0));
  litter(P, R, 92, 60, 5, 26, ['gauze', 'glove', 'mask', 'pills', 'tag'], y + 0.009);
  groundDecal(P, 'drip', 99, 48, 1.2, 1.2, 0, y + 0.006);
  incinGlow(ctx, P, y, zone); // [scene r5] 焚化爐門縫還有餘燼的光
  finish(ctx, P);
}
function dressPump(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) wallPipes(P, s, y, R, { n: 3, r: 0.07, tray: R() < 0.3 });
  for (const [x, z] of [[40, 59.4], [43.4, 59.4], [56, 64.6]]) if (freeAt(ctx, li, x, z, 0.9)) pump(ctx, P, x, y, z, R() < 0.5 ? 0 : Math.PI);
  if (freeAt(ctx, li, 56.4, 59.6, 0.8)) { P.add('po_green_paint', cyl(0.6, 0.6, 2.2, 18), M(56.4, y + 1.2, 59.6)); P.add('po_green_paint', new THREE.SphereGeometry(0.6, 18, 8, 0, TAU, 0, HALF), M(56.4, y + 2.3, 59.6)); P.merge(gaugeParts('gauge', 0.1, { down: 0.1 }), M(56.4, y + 1.5, 60.19)); solid(ctx, 56.4, y, 59.6, 1.3, 2.9, 1.3, 'heavy'); }
  wetSign(ctx, 47.5, y, 60.2, 0.6);
  pumpCentre(ctx, P, y, zone, li);
  finish(ctx, P);
}
// [w4 scene] 水泵房中央:橫過視線的集水主管(2.5 m 高)+ 閥門、有格柵和欄杆的集水坑、水位控制箱(指示燈)、沙包與抽水軟管、一盞工作燈
function pumpCentre(ctx, P, y, zone, li) {
  const hy = y + 2.5, z0 = 61.8;
  P.add('po_green_paint', cyl(0.17, 0.17, 18.4, 14).rotateZ(HALF), M(48.6, hy, z0));
  for (let x = 40.4; x < 57.5; x += 2.8) { P.add('cast_iron', cyl(0.24, 0.24, 0.06, 14).rotateZ(HALF), M(x, hy, z0)); P.add('steel', box(0.06, 1.2, 0.06), M(x + 0.15, hy + 0.75, z0)); }
  for (const x of [40, 43.4]) { P.add('po_green_paint', cyl(0.11, 0.11, 2.4, 10).rotateX(HALF), M(x, hy, z0 - 1.2)); P.add('po_green_paint', cyl(0.11, 0.11, 1.4, 10), M(x, hy - 0.7, 59.4 + 0.0)); }
  P.add('cast_iron', cyl(0.08, 0.08, 0.5, 8), M(50.2, hy - 0.42, z0)); P.add('plastic_red', tor(0.2, 0.02, 4, 16), M(50.2, hy - 0.7, z0, HALF, 0, 0)); // 閘閥 + 紅手輪
  P.add('po_label', labelQuad('valvetag', 0.14, 0.14), M(50.2, hy - 0.95, z0 + 0.02));
  // 集水坑:黑水面 + 格柵 + 黃色欄杆
  const sx = 47.6, sz = 63.4, sw = 2.0;
  if (freeAt(ctx, li, sx, sz, 1.2)) {
    P.add('po_soot', box(sw, 0.02, sw), M(sx, y + 0.005, sz));
    for (let k = -4; k <= 4; k++) P.add('steel', box(0.03, 0.04, sw), M(sx + k * 0.22, y + 0.03, sz));
    P.add('steel', box(sw, 0.05, 0.05), M(sx, y + 0.03, sz - sw / 2)); P.add('steel', box(sw, 0.05, 0.05), M(sx, y + 0.03, sz + sw / 2));
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add('po_line_yellow', cyl(0.025, 0.025, 1.05, 6), M(sx + a * (sw / 2 + 0.08), y + 0.52, sz + b * (sw / 2 + 0.08)));
    for (const hh of [0.55, 1.03]) {
      for (const b of [-1, 1]) P.add('po_line_yellow', cyl(0.022, 0.022, sw + 0.16, 6).rotateZ(HALF), M(sx, y + hh, sz + b * (sw / 2 + 0.08)));
      for (const a of [-1, 1]) P.add('po_line_yellow', cyl(0.022, 0.022, sw + 0.16, 6).rotateX(HALF), M(sx + a * (sw / 2 + 0.08), y + hh, sz));
    }
    solid(ctx, sx, y, sz, sw + 0.3, 1.1, sw + 0.3, 'metal');
    // 抽水軟管:坑裡 → 地上 → 泵
    P.add('rubber', tube([new V3(sx - 0.4, y - 0.05, sz), new V3(sx - 0.9, y + 0.12, sz - 0.6), new V3(sx - 2.6, y + 0.06, sz - 1.4), new V3(43.4, y + 0.3, 60.2)], 0.045, { radial: 6 }));
  }
  // 水位控制箱(南牆):指示燈一紅一綠、水位刻度
  const cx = 51.8, cz = 65.6;
  P.add('metal_gray', box(0.8, 1.3, 0.3), M(cx, y + 1.25, cz));
  P.add('po_label', labelQuad('panel', 0.5, 0.5), M(cx, y + 1.35, cz - 0.155).multiply(M(0, 0, 0, 0, Math.PI, 0)));
  P.add('glow_red', sph(0.025, 6, 4), M(cx - 0.2, y + 1.75, cz - 0.16)); P.add('glow_warm', sph(0.025, 6, 4), M(cx + 0.2, y + 1.75, cz - 0.16));
  P.add('steel', box(0.06, 1.0, 0.04), M(cx + 0.55, y + 1.3, cz - 0.02)); for (let k = 0; k < 6; k++) P.add('po_line_yellow', box(0.08, 0.012, 0.01), M(cx + 0.55, y + 0.9 + k * 0.16, cz - 0.045));
  solid(ctx, cx, y, cz, 0.85, 1.9, 0.35, 'metal');
  // 沙包(門口內側擋水)
  for (let k = 0; k < 5; k++) for (let j = 0; j < (k < 3 ? 2 : 1); j++) P.add('po_sand', box(0.55, 0.16, 0.32).translate(0, 0.08, 0), M(53.8 + k * 0.5 + j * 0.25, y + j * 0.16, 59.0 + (k % 2) * 0.06, 0, 0.05 * (k - 2), 0));
  solid(ctx, 54.8, y, 59.0, 2.6, 0.32, 0.4, 'fabric');
  // 工作燈(籠燈 + 電線),照著集水坑
  P.add('steel', tor(0.08, 0.006, 4, 12), M(sx + 1.0, hy - 0.3, sz - 1.2, HALF, 0, 0)); P.add('glow_warm', sph(0.045, 8, 6), M(sx + 1.0, hy - 0.32, sz - 1.2)); P.add('po_cable', cyl(0.006, 0.006, 0.3, 4), M(sx + 1.0, hy - 0.15, sz - 1.2));
  ctx.light({ x: sx + 1.0, y: hy - 0.5, z: sz - 1.2, color: 0xffc078, intensity: 5, distance: 9, kind: 'bare_bulb', flicker: 0, zone: zone?.id, glow: 0.5, pri: 2 });
}
function dressMachine(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) { wallPipes(P, s, y, R, { tray: true, n: 2 }); if (R() < 0.15) wallBox(P, s, y, R); }
  for (const [x, z] of [[99, 38.4], [99, 44.6]]) if (freeAt(ctx, li, x, z, 0.9)) pump(ctx, P, x, y, z, HALF);
  if (freeAt(ctx, li, 88.6, 31.6, 0.8)) { // 電梯曳引機
    P.add('cast_iron', box(1.6, 0.3, 1.0), M(88.6, y + 0.15, 31.6));
    P.add('po_green_paint', cyl(0.35, 0.35, 0.8, 16).rotateZ(HALF), M(88.2, y + 0.65, 31.6));
    P.add('cast_iron', cyl(0.5, 0.5, 0.18, 24).rotateZ(HALF), M(88.95, y + 0.75, 31.6));
    for (let k = 0; k < 4; k++) P.add('steel', cyl(0.012, 0.012, 2.6, 4), M(89.05, y + 2.0, 31.3 + k * 0.2));
    solid(ctx, 88.6, y, 31.6, 1.7, 1.3, 1.1, 'heavy');
  }
  for (const [x, z] of [[94.6, 31.0]]) if (freeAt(ctx, li, x, z, 0.5)) { P.add('metal_gray', box(1.2, 1.9, 0.5), M(x, y + 0.95, z)); P.add('po_label', labelQuad('panel', 0.6, 0.6), M(x, y + 1.3, z + 0.255)); solid(ctx, x, y, z, 1.2, 1.9, 0.5, 'metal'); }
  barrel(ctx, 100.6, y, 48.6, { yaw: 0.3 });
  finish(ctx, P);
}
// 納骨堂:牆上骨龕(頭骨一排)、地上棺木、燭火、石祭壇
const skullParts = () => { const T = new Parts(); T.add('po_bone', sph(0.09, 8, 6).scale(0.85, 1, 1.05), M(0, 0.1, 0)); T.add('po_bone', box(0.1, 0.05, 0.08), M(0, 0.03, 0.03)); for (const s of [-1, 1]) T.add('po_gap', sph(0.025, 4, 3), M(s * 0.035, 0.11, 0.075)); T.add('po_gap', box(0.02, 0.03, 0.02), M(0, 0.07, 0.085)); return T; };
function dressOssuary(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  const sk = pool(ctx, 'skull', skullParts, 256);
  let lit = 0;
  for (const s of ctx.wallSpots(zone, { allowNearDoor: true })) {
    const [ax, az] = along(s), yaw = Math.atan2(s.nx, s.nz);
    if (R() < 0.4) continue;
    for (let row = 0; row < 2; row++) { // 骨龕:石架 + 一排頭骨 + 疊放的長骨
      const yy = y + 0.6 + row * 0.62;
      P.add('stone_statue', box(ax ? 1.9 : 0.36, 0.06, az ? 1.9 : 0.36), M(s.x + s.nx * 0.18, yy, s.z + s.nz * 0.18));
      for (let k = -2; k <= 2; k++) if (R() < 0.8) sk.add(M(s.x + s.nx * 0.18 + ax * k * 0.25, yy + 0.03, s.z + s.nz * 0.18 + az * k * 0.25, R.range(-0.2, 0.1), yaw + R.range(-0.3, 0.3), R.range(-0.1, 0.1), R.range(0.9, 1.1)));
      for (let k = 0; k < 4; k++) P.add('po_bone', cyl(0.025, 0.025, 1.6, 6).rotateZ(HALF).rotateY(ax ? 0 : HALF), M(s.x + s.nx * 0.12, yy + 0.3 + k * 0.05, s.z + s.nz * 0.12));
    }
    if (R() < 0.2 && lit < 4) { // 燭台 + 燭光
      const cx = s.x + s.nx * 0.25, cz = s.z + s.nz * 0.25;
      P.add('candle_wax', cyl(0.03, 0.035, 0.18, 8), M(cx, y + 1.3 + 0.09, cz));
      P.add('po_candle_flame', sph(0.013, 6, 5).scale(1, 2.2, 1), M(cx, y + 1.5, cz));
      ctx.light({ x: cx, y: y + 1.55, z: cz, color: 0xffa040, intensity: 1.8, distance: 6, kind: 'candle', flicker: 0.6, zone: zone.id, glow: 0.3 });
      lit++;
    }
    flatDecal(P, R.pick(['moss', 'drip', 'stain2']), s.x + s.nx * 0.012, y + 0.3, s.z + s.nz * 0.012, 1.6, 0.6, s.nx > 0.5 ? 'x+' : s.nx < -0.5 ? 'x-' : s.nz > 0.5 ? 'z+' : 'z-');
  }
  // 地上的棺木(部分泡在水裡)、散落骨頭
  for (const [x, z, a] of [[44.6, 30.8, 0.3], [75.2, 48.4, -0.4], [46, 48.6, 1.4]]) if (freeAt(ctx, li, x, z, 0.6)) { const T = new Parts(); T.add('wood_dark', rbox(2.0, 0.42, 0.6, 0.04), M(0, 0.21, 0)); T.add('wood_dark', rbox(1.4, 0.08, 0.62, 0.03), M(-0.3, 0.46, 0, 0, 0, 0.08)); T.add('po_bone', sph(0.09, 8, 6), M(0.7, 0.45, 0.1)); P.merge(T, M(x, y, z, 0, a, 0)); solid(ctx, x, y, z, 2.0, 0.5, 0.7, 'wood'); }
  for (const c of ctx.cells(zone, { allowNearDoor: true })) if (R() < 0.15) { P.add('po_bone', cyl(0.02, 0.025, R.range(0.25, 0.45), 6).rotateZ(HALF), M(c.x + R.range(-0.6, 0.6), y + 0.03, c.z + R.range(-0.6, 0.6), 0, R() * TAU, 0)); if (R() < 0.4) sk.add(M(c.x + R.range(-0.6, 0.6), y + 0.0, c.z + R.range(-0.6, 0.6), R.range(-1, 1), R() * TAU, R.range(-0.6, 0.6))); }
  finish(ctx, P);
}
// 停屍間外梯:梯底積落葉、排水孔、牆上壁燈污漬
function dressStairExt(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  const x = 68, z = 12.6;
  leafPatch(P, R, x, z, 1.0, 26, y + 0.012);
  litter(P, R, x, z, 0.8, 4, ['news', 'bag', 'tissue'], y + 0.009);
  drain(ctx, x, y, z + 0.4, 0);
  puddle(P, R, x, z + 0.3, 0.7, 1.6, 0.9, y + 0.005);
  for (const sx of [66, 70]) flatDecal(P, R.pick(['moss', 'drip', 'rustrun']), sx + (sx < 68 ? 0.013 : -0.013), y + 1.5, 8, 1.4, 2.4, sx < 68 ? 'x+' : 'x-');
  finish(ctx, P);
}

const wrap = (fn) => (ctx, zone) => { curZone = zone; try { fn(ctx, zone); } finally { curZone = null; } };
export const BASEMENT = { tunnel: wrap(dressTunnel), boiler: wrap(dressBoiler), dock: wrap(dressDock), ramp: wrap(dressRamp), incinerator: wrap(dressIncinerator), pump: wrap(dressPump), machine: wrap(dressMachine), ossuary: wrap(dressOssuary), stair_ext: wrap(dressStairExt) };

// [scene r4] B1 裝卸平台 → 救護車坡道口:封院時拉上的鐵網門(現在敞開靠牆)、網邊一張摺疊桌(一疊沒人拿的便當、保溫瓶)、
// 網上方一盞暖色籠燈(安全的語言:金水伯);不擋坡道動線(坡道 x 108–112)
function dockHandoff(ctx, P, y, zone) {
  const cl = surf('chainlink'), Z = 39.7;
  // 鐵網門:兩片,打開貼在坡道口兩側牆邊
  for (const [x, ry] of [[107.55, HALF], [112.45, -HALF]]) {
    const g = new THREE.PlaneGeometry(1.9, 1.95); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.9, uv.getY(i) * 1.95);
    P.add(cl, g, M(x, y + 1.02, Z - 0.95, 0, ry, 0));
    P.add('steel', box(0.04, 2.0, 0.04), M(x, y + 1.0, Z - 1.9)); P.add('steel', box(0.04, 2.0, 0.04), M(x, y + 1.0, Z));
    P.add('steel', box(0.03, 0.03, 1.9), M(x, y + 1.99, Z - 0.95));
  }
  // 摺疊桌 + 便當(免洗紙盒疊起來,橡皮筋)+ 保溫瓶 + 便當單(夾板)
  const tx = 106.4, tz = Z - 1.2;
  P.add('plastic_white', rbox(1.2, 0.04, 0.6, 0.012), M(tx, y + 0.72, tz));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add('steel', rod(new V3(tx + sx * 0.52, y, tz + sz * 0.24), new V3(tx + sx * 0.5, y + 0.7, tz + sz * 0.22), 0.012, 6));
  for (let k = 0; k < 2; k++) for (let i = 0; i < 4 - k; i++) {
    const bx = tx - 0.3 + k * 0.28, bz = tz - 0.05 + k * 0.06, by = y + 0.765 + i * 0.05;
    P.add('paper', box(0.21, 0.048, 0.16), M(bx, by, bz, 0, (i % 2 ? 0.08 : -0.05) + k * 0.2, 0));
    P.add('plastic_red', box(0.006, 0.05, 0.165), M(bx + 0.03, by, bz, 0, (i % 2 ? 0.08 : -0.05) + k * 0.2, 0));
    if (i === 3 - k) P.add('po_label', labelQuad('bento', 0.2, 0.1).rotateX(-HALF), M(bx, by + 0.0245, bz, 0, (i % 2 ? 0.08 : -0.05) + k * 0.2, 0)); // 最上面那盒的紙蓋印字
  }
  // 網外一張紅色塑膠凳(金水伯坐著等人來拿)、網門上的掛鎖和鐵鍊
  { const sx = 109.0, sz = Z + 0.9; P.add('plastic_red', cyl(0.16, 0.14, 0.03, 14), M(sx, y + 0.44, sz)); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.add('plastic_red', rod(new V3(sx + a * 0.1, y + 0.43, sz + b * 0.1), new V3(sx + a * 0.15, y, sz + b * 0.15), 0.015, 5)); solid(ctx, sx, y, sz, 0.36, 0.45, 0.36, 'wood'); }
  P.add('steel', box(0.07, 0.09, 0.03), M(107.6, y + 1.05, Z - 0.02)); P.add('steel', tor(0.025, 0.006, 4, 10), M(107.6, y + 1.12, Z - 0.02));
  for (let k = 0; k < 7; k++) P.add('steel', tor(0.02, 0.005, 4, 8), M(107.6, y + 1.18 + k * 0.035, Z - 0.02, k % 2 ? HALF : 0, 0, 0));
  P.add('plastic_red', cyl(0.05, 0.05, 0.27, 12), M(tx + 0.35, y + 0.875, tz + 0.05));
  P.add('plastic_white', cyl(0.04, 0.04, 0.05, 10), M(tx + 0.35, y + 1.035, tz + 0.05));
  P.add('wood_light', box(0.23, 0.01, 0.31), M(tx + 0.05, y + 0.745, tz + 0.12, 0, 0.3, 0));
  P.add('paper', box(0.21, 0.004, 0.28), M(tx + 0.05, y + 0.752, tz + 0.12, 0, 0.3, 0));
  solid(ctx, tx, y, tz, 1.25, 0.75, 0.65, 'wood');
  // 暖色籠燈(網上方牆上)
  P.add('cast_iron', box(0.12, 0.1, 0.08), M(107.3, y + 2.55, Z - 0.04));
  P.add('steel', tor(0.07, 0.006, 4, 12), M(107.3, y + 2.43, Z - 0.13, HALF, 0, 0));
  P.add('glow_warm', sph(0.04, 8, 6), M(107.3, y + 2.42, Z - 0.13));
  ctx.light({ x: 107.3, y: y + 2.3, z: Z - 0.4, color: 0xffb468, intensity: 6, distance: 9, kind: 'bare_bulb', flicker: 0, zone: zone?.id, glow: 0.55, pri: 4 }); // [w4 scene] 光圈落在桌面上、從倉庫門口就看得到
}

// [scene r5] 鍋爐房:一角是給 207 專用發電機加油的地方 —— 油桶、手搖泵、漏斗、紅色油桶、牆上粉筆記的加油日期;一盞暖色工作燈
function boilerFuel(ctx, P, y, zone) {
  const cells = ctx.cells(zone, { allowNearDoor: false });
  let at = null;
  for (const c of cells) if (freeAt(ctx, zone.levelIndex, c.x, c.z, 1.1)) { if (!at || c.x + c.z > at.x + at.z) at = c; }
  if (!at) return;
  const { x, z } = at;
  for (const [dx, dz, f] of [[-0.5, -0.4, false], [0.2, -0.5, false], [-0.2, 0.25, true]]) barrel(ctx, x + dx, y, z + dz, { yaw: dx * 3, fallen: f });
  P.add('cast_iron', cyl(0.025, 0.025, 1.1, 8), M(x + 0.2, y + 1.05, z - 0.5));
  P.add('cast_iron', box(0.12, 0.08, 0.06), M(x + 0.2, y + 1.6, z - 0.5));
  P.add('rubber', tube([new V3(x + 0.2, y + 1.5, z - 0.45), new V3(x + 0.6, y + 1.1, z - 0.1), new V3(x + 0.85, y + 0.25, z + 0.3)], 0.015, { radial: 6 }));
  for (const [dx, dz] of [[0.9, 0.35], [1.15, 0.0]]) { P.add('plastic_red', box(0.32, 0.42, 0.18), M(x + dx, y + 0.21, z + dz, 0, 0.3, 0)); P.add('plastic_black', cyl(0.025, 0.025, 0.05, 8), M(x + dx + 0.1, y + 0.45, z + dz)); }
  P.add('steel', cyl(0.12, 0.02, 0.18, 10, true), M(x + 0.6, y + 0.09, z + 0.6, Math.PI, 0, 0));
  solid(ctx, x, y, z, 1.6, 1.0, 1.6, 'metal');
  ctx.light({ x: x + 0.3, y: y + 2.3, z: z + 0.2, color: 0xffb468, intensity: 5.2, distance: 8, kind: 'bare_bulb', flicker: 0, zone: zone?.id, glow: 0.5, pri: 4 }); // [w4 scene] 油桶角要亮(lamp 代理會用到那個油桶)
  P.add('steel', tor(0.07, 0.006, 4, 12), M(x + 0.3, y + 2.42, z + 0.2, HALF, 0, 0)); P.add('glow_warm', sph(0.04, 8, 6), M(x + 0.3, y + 2.4, z + 0.2)); P.add('po_cable', cyl(0.006, 0.006, 1.2, 4), M(x + 0.3, y + 3.0, z + 0.2));
}
// [scene r5] 焚化爐:2003 的醫療廢棄物在這裡燒;爐門縫透出的暗紅餘燼光(看得到焚化爐在哪)
function incinGlow(ctx, P, y, zone) {
  const [c0, r0, c1] = zone.rects[0];
  const x = (c0 + c1 + 1), z = r0 * 2 + 1.0;
  // 爐門縫的餘燼(低處的暗紅光 + 地上一小片灰燼)
  P.add('glow_red', box(0.9, 0.025, 0.03), M(x, y + 0.42, z + 0.05));
  groundDecal(P, 'ashes', x, z + 0.8, 1.6, 1.1, 0.2, y + 0.006);
  ctx.light({ x, y: y + 0.55, z: z + 0.5, color: 0xff5a1e, intensity: 4.5, distance: 7, kind: 'fire', flicker: 0, zone: zone?.id, glow: 0.45 });
}
