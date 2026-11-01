import { tpl, L, G, THREE } from './parts.js';
import { wheelchair, ivPole, supplyCart, oxygenCart, gurney } from './medical.js';
import { stool, bin, sinkWall, posterSheet, wallClock, glassCabinet, shelfRack, fileCabinet, deskSteel, chairOffice, crtMonitor, lockers, tableLong } from './furniture.js';
import { morgueWall, morgueTrolley, autopsyTable, hangingScale, mayoStand, scrubSink, specimenShelf, surgicalLight, instruments } from './equip.js';
import { washer, linenCart, linenStack, ironer, drum, fileCart, stepLadder, pallet, cardboardBox, wetFloorSign } from './decor.js';
import { sign, poster, toeTag, dosScreen } from './art.js';
import { scatter, onSurface, floorDecal, wallDecal, ctpl } from './clutter.js';
import { rotY, bounds, lineUp, litter } from './lay.js';
import { fill } from './th_1f.js';

const drain = () => tpl('drain', (b) => { b.cyl('iron', 0.12, 0.006, 0, 0.003, 0, { seg: 16 }); for (let i = -3; i <= 3; i++) b.box('enamel_black', 0.008, 0.008, 0.2 * Math.sqrt(1 - (i / 3.6) ** 2), i * 0.03, 0.006, 0); });

// ================================================================ 太平間
export function dressMorgue(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), E = R.run('E');
  // 北牆兩組冷凍櫃(其中一格拉出,上面躺著蓋白布的屍體)
  if (N) {
    const a = R.atWall(morgueWall(3, 3, -1), N, x0 + 2.6, { gap: 0.0 });
    const b = R.atWall(morgueWall(3, 3, 4), N, x0 + 6.4, { gap: 0.0 });
    if (b) R.event({ kind: 'morgue_drawer', x: x0 + 6.4, y: R.y + 1.0, z: z0 + 2.4 });
    if (b) R.collide(new THREE.Box3(new THREE.Vector3(-0.36, 0, 0.95), new THREE.Vector3(0.36, 1.25, 2.78)), b.x, b.y ?? R.y, b.z, b.yaw, { mat: 'metal' }); // [interact 稽核] 拉出來的抽屜盤 + 屍體
    R.atWall(morgueWall(3, 3, -1), N, x0 + 10.2, { gap: 0.0 });
    R.atWall(posterSheet(sign('遺體冷藏 -4°C', { w: 256, h: 64, bg: '#d8e8f0', fg: '#1a3a6a', size: 0.42 }), 0.42, 0.11), N, x0 + 14.2, { mount: 1.6 });
    void a;
  }
  // 停屍推床
  R.tryPut(morgueTrolley(true, 0), x0 + 10.6, z0 + 5.2, Math.PI / 2 + 0.1, {});
  R.tryPut(morgueTrolley(true, 1), x0 + 14.8, z0 + 4.4, Math.PI / 2 - 0.25, {});
  R.tryPut(morgueTrolley(false, 0), x0 + 3.6, z0 + 5.6, Math.PI / 2 + 0.4, {});
  if (E) { R.atWall(sinkWall(0), E, z0 + 2.0, { mount: 0, collide: false }); R.atWall(glassCabinet(0.9, 1.9, 1), E, z0 + 4.4, { gap: 0.03 }); }
  if (W) { R.atWall(rotY(supplyCart(0)), W, z0 + 6.0, { gap: 0.04 }); R.atWall(wallClock(1), W, z0 + 3.0, { mount: 2.4 }); }
  // 排水孔 + 地上積水/血水
  for (const [x, z] of [[x0 + 6.4, z0 + 5.0], [x0 + 12.8, z0 + 5.0]]) { R.put(drain(), x, z, 0); floorDecal(R, 'water', x, z, 1.8); }
  floorDecal(R, 'drag', x0 + 8.4, z0 + 5.6, 2.0, { yaw: 1.5 });
  floorDecal(R, 'pool', x0 + 6.6, z0 + 3.4, 0.9);
  // 腳趾牌散落
  for (let i = 0; i < 6; i++) R.I('toetag', toeTagT(i % 3), R.rand(x0 + 1, x1 - 1), R.y + 0.002, R.rand(z0 + 3, z1 - 1), R.rand(0, 6));
  litter(R, [['paper', 8], ['glove', 6], ['shard', 4], ['gauze', 4]]);
  void z1;
}
const toeTagT = (i) => tpl(`toetagi:${i}`, (b) => { b.plane(L(toeTag(i)), 0.045, 0.08, 0, 0.002, 0, { rx: -Math.PI / 2 }); b.meta.cap = 64; });

// ================================================================ 解剖室
export function dressAutopsy(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const ceil = R.L.ceilY(R.li, R.c0 + 3, R.r0 + 2) - R.y;
  const N = R.run('N', (r) => r.len > 4), W = R.run('W'), E = R.run('E'), S = R.run('S');
  for (const [i, x] of [[0, x0 + 4.6], [1, x0 + 11.4]]) {
    const p = R.tryPut(autopsyTable(), x, z0 + 3.6, 0, {});
    if (!p) continue;
    R.put(surgicalLight(ceil, i === 0), x, z0 + 3.4, 0.3 + i);
    if (i === 0) {
      R.light({ x, y: R.y + 1.8, z: z0 + 3.4, color: 0xf0f6ff, intensity: 7, distance: 6, kind: 'surgical', flicker: 0.35 });
      // 解剖台上:蓋布的屍體(半掀開)
      R.put(tpl('autopsybody', (b) => { b.add(sheetBody(), 0, 0, 0); }), x, z0 + 3.5, 0, { y: R.y + 0.86 });
    }
    R.tryPut(mayoStand(i), x + 1.0, z0 + 5.6, -0.3, {});
    R.dyn(stool('vinyl_black', i), x - 1.1, z0 + 4.4, 0, { mass: 6, shape: 'cylinder' });
    R.dyn(bin('kick', i), x + 0.9, z0 + 2.2, 0, { mass: 5, shape: 'cylinder' });
  }
  if (N) { R.atWall(hangingScale(), N, x0 + 6.2, { mount: 0 }); R.atWall(hangingScale(), N, x0 + 13.0, { mount: 0 }); R.atWall(specimenShelf(0), N, x0 + 9.0, { mount: 0 }); }
  if (E) { R.atWall(scrubSink(1.2), E, z0 + 2.0, { gap: 0.02 }); R.atWall(glassCabinet(0.9, 1.9, 0), E, z0 + 5.2, { gap: 0.03 }); }
  if (W) { R.atWall(specimenShelf(1), W, z0 + 3.8, { mount: 0 }); R.atWall(lockers(2, 1, true), W, z0 + 6.4, { gap: 0.03 }); }
  if (S) R.atWall(posterSheet(sign('解剖中 禁止進入', { w: 256, h: 64, bg: '#7a1010', fg: '#fff', size: 0.42 }), 0.45, 0.12), S, x0 + 8.8, { mount: 1.8 });
  for (const [x, z] of [[x0 + 4.6, z0 + 6.0], [x0 + 11.4, z0 + 6.0]]) R.put(drain(), x, z, 0);
  floorDecal(R, 'pool', x0 + 4.8, z0 + 5.1, 1.4);
  floorDecal(R, 'drag', x0 + 8.0, z0 + 5.6, 1.8, { yaw: 1.6 });
  floorDecal(R, 'water', x0 + 11.4, z0 + 6.0, 1.8);
  litter(R, [['gauze', 18], ['glove', 8], ['shard', 5], ['paper', 6], ['ampoule', 6]]);
}
// 蓋到胸口的白布 + 露出的頭與 Y 字切口(簡化)
function sheetBody() {
  return tpl('sheetbody', (b) => {
    b.box('skin_dead', 0.36, 0.2, 0.55, 0, 0.1, -0.45, { r: 0.08 });
    b.sph('skin_dead', 0.1, 0, 0.12, -0.85, { sy: 0.9, sz: 1.15, ws: 12, hs: 8 });
    b.box('meat', 0.01, 0.004, 0.35, 0, 0.202, -0.4);
    b.box('meat', 0.18, 0.004, 0.01, -0.06, 0.201, -0.6, { ry: 0.6 });
    b.box('meat', 0.18, 0.004, 0.01, 0.06, 0.201, -0.6, { ry: -0.6 });
    b.box('fab_white', 0.62, 0.17, 1.2, 0, 0.085, 0.38, { r: 0.07 });
    b.plane('fab_white', 1.2, 0.2, 0.31, 0.0, 0.38, { ry: Math.PI / 2 });
    b.plane('fab_white', 1.2, 0.2, -0.31, 0.0, 0.38, { ry: -Math.PI / 2 });
    b.sph('skin_dead', 0.04, 0.32, 0.03, -0.1, { sx: 1.8, ws: 6, hs: 5 }); // 垂下的手
  });
}

// ================================================================ 舊病歷庫
export function dressArchive(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  // 高鐵架:三排(東西向),中間走道
  for (const [i, z] of [[0, z0 + 2.2], [1, z0 + 4.6]]) for (const [j, x] of [[0, x0 + 3.2], [1, x0 + 6.6], [2, x0 + 10.0], [3, x0 + 13.4]]) {
    if (i === 1 && j === 3) continue;
    const p = R.tryPut(shelfRack(2.6, 2.4, 0.6, 6, i + j), x, z, (i + j) % 2 ? 0 : Math.PI, {});
    if (p) fill(R, p, 'records', { empty: 0.15 });
  }
  const N = R.run('N'), E = R.run('E'), W = R.run('W'), S = R.run('S');
  if (S) lineUp(R, S, [fileCabinet(4, 1), fileCabinet(4, 0), fileCabinet(4, 3), { t: fileCabinet(4, 2), space: 2.0 }], { from: 0.5, gap: 0.03 });
  if (W) { const d = R.atWall(deskSteel(1.2, 0.7, 2), W, z0 + 5.8, { gap: 0.03 }); if (d) { const v = R.onTop(d, 0.5, 0.4); R.put(crtMonitor(2, dosScreen('his')), v.x, v.z, d.yaw, { y: v.y }); onSurface(R, R.topOf(d, 0), 'file', 3); } }
  R.tryPut(fileCart(), x1 - 2.0, z0 + 6.8, 0.4, {});
  R.tryPut(stepLadder(), x0 + 8.4, z0 + 3.4, 1.4, {});
  if (N) R.atWall(posterSheet(sign('病歷保存 30 年 禁止攜出', { w: 256, h: 64, bg: '#e8e4d0', fg: '#2a2a2a', size: 0.34 }), 0.45, 0.11), N, x0 + 1.6, { mount: 1.6 });
  // 滿地病歷
  litter(R, [['file', 30], ['file2', 18], ['paper', 50], ['paper2', 20], ['paper3', 20], ['crumple', 6]]);
  for (let i = 0; i < 4; i++) R.dyn(cardboardBox(0.4, 0.28, 0.32, i + 3, i % 2 === 1), R.rand(x0 + 1.5, x1 - 1.5), R.rand(z0 + 3.2, z0 + 3.6), R.rand(0, 6), { mass: 3, shape: 'box' });
  floorDecal(R, 'water', x0 + 5, z0 + 6.6, 2.4);
  floorDecal(R, 'mold', x0 + 12, z0 + 6.8, 1.0);
  void E; void z1;
}

// ================================================================ 洗衣房與維修通道(L 形)
export function dressLaundry(R) {
  // 下段大房間 x 18-36, z 48-66
  const S = R.run('S', (r) => r.len > 8), E = R.run('E', (r) => r.t0 >= 47.9), W = R.run('W', (r) => r.t0 >= 47.9);
  if (S) lineUp(R, S, [washer('washer', 0), washer('washer', 1), washer('washer', 0), { t: washer('dryer', 1), space: 0.6 }, washer('dryer', 0)], { from: 1.4, gap: 0.05, space: 0.25 });
  R.tryPut(ironer(), 29.2, 57.4, 0, {});
  const racks = [];
  if (E) for (const z of [51.8, 61.0]) { const p = R.atWall(shelfRack(1.6, 2.0, 0.5, 5, 1), E, z, { gap: 0.03 }); if (p) racks.push(p); }
  // 架上疊床單
  for (const p of racks) for (let i = 0; i < p.t.tops.length; i++) {
    const tp = p.t.tops[i];
    for (const u of [0.2, 0.5, 0.8]) if (R.chance(0.75)) R.putRel(linenStack(R.rng.int(3, 6), i), p, tp.x0 + (tp.x1 - tp.x0) * u, tp.y, (tp.z0 + tp.z1) / 2, 0, R.rand(-0.1, 0.1), 0);
  }
  // 布草車、洗劑桶、地上的床單堆
  for (const [x, z, yaw, s] of [[22.4, 52.2, 0.3, 0], [25.8, 60.6, -0.6, 1], [22.0, 63.4, 1.2, 2]]) R.dyn(linenCart(s), x, z, yaw, { mass: 25, shape: 'box', friction: 0.4 });
  if (W) { lineUp(R, W, [drum(0), drum(1), drum(0)], { from: 9.0, gap: 0.05, space: 0.06, collide: false }); }
  for (let i = 0; i < 5; i++) R.I('linenpile', linenPile(), R.rand(20, 34), R.y, R.rand(54, 64), R.rand(0, 6));
  R.atWall(wetFloorSign(), W || S, (W || S).t0 + 1.5, { collide: false, gap: 0.4 });
  // 上段(x 18-24, z 28-48):維修通道 → 靠牆的推床/輪椅/箱子
  const W1 = R.run('W', (r) => r.t1 <= 48.1), E1 = R.run('E', (r) => r.t1 <= 48.1 && r.len > 3);
  if (W1) lineUp(R, W1, [rotY(gurney({ seed: 7, sheet: false, rails: 'down', iv: false })), { t: rotY(oxygenCart(2)), space: 1.5 }], { from: 1.5, gap: 0.12 });
  if (E1) { R.atWall(cardboardBox(0.6, 0.5, 0.5, 2), E1, E1.t0 + 2.0, { gap: 0.05 }); R.atWall(cardboardBox(0.5, 0.4, 0.4, 1, true), E1, E1.t0 + 2.6, { gap: 0.05, collide: false }); }
  litter(R, [['paper', 10], ['crumple', 6], ['debris', 10], ['rubble', 10], ['shard', 6]]);
  floorDecal(R, 'water', 27, 58, 3.0);
  floorDecal(R, 'water', 21, 40, 2.0);
  floorDecal(R, 'drag', 31, 62, 1.8, { yaw: 2.6 });
  floorDecal(R, 'mold', 34.6, 55.4, 1.0);
}
const linenPile = () => tpl('linenpile', (b) => { for (let i = 0; i < 4; i++) b.sph(i % 3 ? 'fab_white' : 'fab_blue', 0.22 - i * 0.03, (i - 1.5) * 0.12, 0.06, (i % 2) * 0.1, { sy: 0.32, ws: 8, hs: 6 }); b.meta.cap = 64; });

// ================================================================ 中央供應室
export function dressSupply(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W', (r) => r.len > 6), E = R.run('E', (r) => r.len > 4);
  if (N) { const ps = lineUp(R, N, [shelfRack(1.8, 2.2, 0.55, 5, 0), shelfRack(1.8, 2.2, 0.55, 5, 1), shelfRack(1.8, 2.2, 0.55, 5, 0), shelfRack(1.8, 2.2, 0.55, 5, 2)], { from: 0.4, gap: 0.03, space: 0.3 }); for (const p of ps) fill(R, p, R.chance(0.5) ? 'supplies' : 'meds', { empty: 0.25 }); }
  if (W) { const ps = lineUp(R, W, [shelfRack(1.8, 2.2, 0.55, 5, 1), shelfRack(1.8, 2.2, 0.55, 5, 0)], { from: 1.0, gap: 0.03, space: 0.6 }); for (const p of ps) fill(R, p, 'supplies'); }
  // 中央兩排雙面架
  for (const [x, z] of [[x0 + 5.2, z0 + 5.6], [x0 + 5.2, z0 + 9.4]]) { const p = R.tryPut(shelfRack(3.0, 1.8, 0.7, 4, 1), x, z, 0, {}); if (p) fill(R, p, 'supplies', { empty: 0.3 }); }
  // 棧板 + 紙箱
  for (const [x, z, yaw] of [[x0 + 13.2, z0 + 7.0, 0.1], [x0 + 13.4, z0 + 11.6, -0.2]]) {
    const p = R.tryPut(pallet(), x, z, yaw, {});
    if (p) R.collide(new THREE.Box3(new THREE.Vector3(-0.6, 0.1, -0.55), new THREE.Vector3(0.6, 1.0, 0.55)), p.x, p.y ?? R.y, p.z, yaw, { mat: 'soft' }); // [interact 稽核] 棧板上的紙箱
    if (p) for (let i = 0; i < 4; i++) { const v = R.onTop(p, 0.25 + (i % 2) * 0.5, 0.25 + ((i / 2) | 0) * 0.5); R.put(cardboardBox(0.5, 0.45, 0.42, i, false), v.x, v.z, yaw + R.rand(-0.1, 0.1), { y: v.y }); if (i % 2 === 0) R.put(cardboardBox(0.45, 0.4, 0.4, i + 1, false), v.x, v.z, yaw + R.rand(-0.2, 0.2), { y: v.y + 0.45 }); }
  }
  if (E) { R.atWall(rotY(supplyCart(2)), E, z0 + 4.0, { gap: 0.04 }); R.atWall(rotY(oxygenCart(3)), E, z0 + 9.2, { gap: 0.04 }); }
  const S = R.run('S');
  if (S) R.atWall(lockers(3, 2, true), S, x0 + 2.2, { gap: 0.03 });
  for (let i = 0; i < 6; i++) R.dyn(cardboardBox(R.pick([0.4, 0.5, 0.6]), R.pick([0.3, 0.4]), 0.4, i, i % 3 === 0), R.rand(x0 + 2, x1 - 2), R.rand(z0 + 6.8, z1 - 3), R.rand(0, 6), { mass: 4, shape: 'box' });
  R.dyn(wheelchair(2), x0 + 9.6, z1 - 3.2, 1.0, { mass: 16, shape: 'box' });
  litter(R, [['pillbox', 16], ['pillbox2', 10], ['bandage', 8], ['syringe', 8], ['paper', 12], ['crumple', 6], ['debris', 8]]);
  floorDecal(R, 'water', x0 + 8, z0 + 8, 2.4);
  floorDecal(R, 'drag', x0 + 9.6, z0 + 12, 1.8, { yaw: 0.4 });
  void tableLong; void ivPole; void chairOffice; void G; void THREE;
}
