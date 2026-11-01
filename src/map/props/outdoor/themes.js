import * as THREE from 'three';
import { rng as mkRng } from '../ctx.js';
import { Parts, M, box, rbox, cyl, sph, tor, rod, tube, lathe, sagLine, keepUV, pool, put, solid, animPool, edgeInfo, V3, HALF, TAU, lerp, clamp, hash } from './kit.js';
import { groundDecal, labelQuad } from './cars.js';
import { flatDecal, trashBag } from './industrial.js';
import { cone, tape, barricade } from './street.js';
import { tomb, brokenSlab, epitaph, angelMonument, openGrave } from './monuments.js';
import { placeVehicle } from './vehicles.js';
import { bindModel } from './gltf.js';
import { BAND, strip, line, dashed, mark, stalls, curb, manhole, drain, litter, leafLine, leafPatch, tarCrack, puddle, wheelStop, wallStrip } from './ground.js';
import { tree, tuft, tuftLine, tuftPatch, shrub, ivy, crow } from './nature.js';
import { swingSet, slide, merryGoRound, seesaw, springRider, sandbox, teddy, tricycle, ball } from './play.js';
import { tent, canopy, sandbagWall, jersey, heras, foldTable, foldChair, bodyBag, wheelchair, ivStand, o2Tank, bioBin, suitcase, stroller, hazmatSuit, aSign, postSign, flare, floodlight, signQuad } from './camp.js';
import { bench, bollard, hydrant, busStop, utilityBox, trashCan, barrel, crate, propane, wetSign, tyre, lamp, wallLamp, secLight, neonSign, flagPole, planter, payStation, cart, pallet } from './furniture.js';
import { stretcher } from './cars.js';
import { BASEMENT } from './basement.js';
import { alley207 } from './alley207.js';
import { GENERIC, zrng, freeRect, freeAt, edgeDress, scatter, finish } from './generic.js';
import { windify } from './env.js';

// 各主題擺設(dressOutdoor 依 zone.theme 呼叫)。戶外區域以世界座標手工構圖(故事場景),
// 每個會擋路的物件先檢查格子(可走、未佔用、不靠門);共用的「邊緣處理」替每個靠牆/圍籬的格子加上
// 牆腳污垢、落葉、雜草、垃圾、枯藤。
const C2 = 2;
const inZone = (ctx, zone, x, z) => ctx.L.zoneAt(zone.levelIndex, Math.floor(x / C2), Math.floor(z / C2)) === zone;

// ======================================================================
// 停車場
// ======================================================================
function dressParking(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = 0;
  // ---- 標線:停車格、車輪擋、編號 ----
  const rowA = { head: 79.6, d: 5.2, dir: 1 }, rowB = { head: 92.5, d: 5.2, dir: -1 };
  stalls(P, 4.5, 43.5, rowA.head, rowA.d, rowA.dir, 3, { num0: 1, R });
  stalls(P, 76.5, 115.5, rowA.head, rowA.d, rowA.dir, 3, { num0: 14, R });
  stalls(P, 3.5, 39.5, rowB.head, rowB.d, rowB.dir, 3, { num0: 27, R });
  stalls(P, 77.5, 113.5, rowB.head, rowB.d, rowB.dir, 3, { num0: 39, R });
  const occupiedX = (x, z) => !freeRect(ctx, li, x - 0.9, z - 0.3, x + 0.9, z + 0.3, true);
  for (const [x0, x1, zz, rot] of [[4.5, 43.5, 80.15, 0], [76.5, 115.5, 80.15, 0], [3.5, 39.5, 91.95, 0], [77.5, 113.5, 91.95, 0]]) {
    for (let x = x0 + 1.5; x < x1; x += 3) if (!occupiedX(x, zz) && R() < 0.8) wheelStop(ctx, P, x + R.range(-0.08, 0.08), zz, rot + R.range(-0.04, 0.04));
    for (let x = x0 + 1.5; x < x1; x += 3) if (R() < 0.35) groundDecal(P, 'oil', x + R.range(-0.4, 0.4), zz + (zz < 86 ? 2.3 : -2.3), R.range(0.9, 1.5), R.range(0.8, 1.4), R() * TAU, 0.0055);
  }
  // 身障車位、走道箭頭、慢、出口
  mark(P, 'handi', 7.5 + 1.5, 83.3, 1.5, 1.5, 0);
  for (const x of [20, 50, 84, 104]) mark(P, 'arrow2', x, 77.8, 1.2, 1.2, x < 60 ? -HALF : HALF);
  mark(P, 'slow', 60, 88.4, 1.5, 1.5, Math.PI);
  mark(P, 'exit', 60, 92.6, 1.6, 0.8, Math.PI);
  // 行人穿越線(廣場 → 停車場)
  for (let k = 0; k < 6; k++) line(P, BAND.white, 30.6 + k * 0.55, 76.4, 30.6 + k * 0.55, 79.2, 0.32);
  // 走道中線(黃虛線)
  dashed(P, BAND.yellow, 44, 77.8, 76, 77.8, 0.11, 1.8, 1.6);
  dashed(P, BAND.yellow, 60, 85.8, 60, 92, 0.11, 1.4, 1.2);
  // ---- 緣石:廣場邊(撞毀處斷開)、南側草帶 ----
  for (const [a, b] of [[2.1, 30], [33.9, 63.2], [74.5, 117.9]]) curb(ctx, P, a, 75.92, b, 75.92, { h: 0.15, w: 0.22 });
  for (const [a, b] of [[2.1, 52], [68, 117.9]]) curb(ctx, P, a, 94.1, b, 94.1, { h: 0.14, w: 0.2, paint: a < 10 ? null : null });
  for (let k = 0; k < 5; k++) P.add('po_curb', box(R.range(0.3, 0.9), 0.15, 0.22), M(64 + k * 2.2 + R.range(-0.4, 0.4), 0.07, 76.2 + R.range(0, 1.4), R.range(-0.3, 0.3), R() * TAU, R.range(-0.3, 0.3))); // 撞碎的緣石
  curb(ctx, P, 30, 75.92, 33.9, 75.92, { h: 0.03, w: 0.22, step: false }); // 無障礙斜坡
  // ---- 中央分隔島:緣石圈 + 泥土 + 枯樹 + 路燈 ----
  const mx0 = 47.5, mx1 = 72.5, mz0 = 81.4, mz1 = 84.6;
  if (freeRect(ctx, li, mx0, mz0, mx1, mz1, true)) {
    curb(ctx, P, mx0, mz0, mx1, mz0, { step: false }); curb(ctx, P, mx0, mz1, mx1, mz1, { step: false });
    curb(ctx, P, mx0, mz0, mx0, mz1, { step: false }); curb(ctx, P, mx1, mz0, mx1, mz1, { step: false });
    P.add('po_soil', box(mx1 - mx0 - 0.3, 0.13, mz1 - mz0 - 0.3), M((mx0 + mx1) / 2, 0.065, (mz0 + mz1) / 2));
    solid(ctx, (mx0 + mx1) / 2, 0, (mz0 + mz1) / 2, mx1 - mx0, 0.15, mz1 - mz0, 'concrete');
    for (const x of [51.5, 59, 67.5]) tree(ctx, R() < 0.5 ? 'oak' : 'poplar', x + R.range(-0.4, 0.4), 0.13, 83 + R.range(-0.3, 0.3), R.range(0.9, 1.15), R() * TAU);
    tuftPatch(ctx, R, 60, 83, 0.13, 10, 26, { dryP: 0.75, tallP: 0.35 });
    leafPatch(P, R, 60, 83, 10, 60, 0.145);
    for (const x of [49.5, 70.5]) shrub(ctx, x, 0.13, 83, R.range(0.9, 1.3));
    lamp(ctx, 55.5, 0.13, 83, -HALF, 'on', { zone });
    const hp = lamp(ctx, 63.5, 0.13, 83, HALF, 'dead', { zone, lean: 0.06 });
    crow(ctx, hp.x, hp.y + 0.24, hp.z, 0.4);
  }
  // ---- 路燈 ----
  for (const [x, z, yaw, st] of [[14, 77.4, -HALF, 'on'], [44, 77.4, -HALF, 'dead'], [96, 77.4, -HALF, 'flicker'], [112, 77.4, -HALF, 'on'], [30, 86, HALF, 'flicker'], [90, 86, -HALF, 'on'], [6, 86, -HALF, 'dead']]) {
    if (!freeAt(ctx, li, x, z, 0.3)) continue;
    const hp = lamp(ctx, x, y, z, yaw, st, { zone });
    if (x === 44 || x === 6) crow(ctx, hp.x, hp.y + 0.24, hp.z, 2.1 + x);
  }
  // ---- 地面:裂縫、坑洞、人孔、排水孔、水窪、輪胎痕 ----
  for (let k = 0; k < 30; k++) { const x = R.range(4, 116), z = R.range(77, 93); tarCrack(P, R, x, z, R.range(2, 8), R() * TAU, [2, 76.3, 118, 93.8]); }
  for (let k = 0; k < 6; k++) { const x = R.range(8, 112), z = R.range(85, 87.5); groundDecal(P, 'crack', x, z, 1.4, 1.4, R() * TAU, 0.006); puddle(P, R, x, z, R.range(0.4, 0.7), 1.2, 0.8, 0.004); }
  for (const [x, z] of [[40, 78.2], [88, 86], [22, 86.3], [104, 78]]) if (freeAt(ctx, li, x, z, 0.4) || true) manhole(ctx, x, y, z, R() * TAU);
  for (const x of [12, 36, 58, 84, 108]) { drain(ctx, x, y, 76.45, 0); puddle(P, R, x, 76.9, R.range(0.6, 1.0), 1.6, 0.7, 0.004); }
  for (const x of [20, 44, 80, 100]) { drain(ctx, x, y, 93.65, 0); puddle(P, R, x + 0.3, 93.2, R.range(0.5, 0.9), 1.4, 0.7, 0.004); }
  // 輪胎痕:從南側出口急轉進場
  for (const s of [-0.8, 0.8]) strip(P, BAND.tire, [[60 + s, 97.5], [60 + s * 1.1, 94], [58 + s, 90.5], [52 + s * 0.6, 87.6], [44, 86.6 + s * 0.4], [36, 86.4 + s * 0.4]], 0.24, { us: 2.4, y: 0.007 });
  for (const s of [-0.85, 0.85]) strip(P, BAND.tire, [[78, 78.5 + s], [72, 77.4 + s * 0.9], [68.5, 77 + s * 0.5]], 0.25, { us: 2.4, y: 0.007 });
  // ---- 撞路燈的救護車周圍:散落醫療用品、翻倒的擔架、拖行血跡 ----
  const ax = 69, az = 77;
  litter(P, R, ax - 3.5, az + 2.2, 1.6, 14, ['gauze', 'pills', 'glove', 'form', 'mask'], 0.009);
  groundDecal(P, 'shards', ax + 4.2, az + 0.4, 1.8, 1.4, R() * TAU, 0.007);
  groundDecal(P, 'pool', ax - 4.5, az + 2.8, 1.4, 1.1, 0.4, 0.006);
  for (let k = 0; k < 4; k++) mark(P, 'drag', ax - 5 - k * 1.9, az + 2.6 - k * 0.55, 0.9, 1.9, HALF + 0.25 + k * 0.05, 0.0075);
  if (freeAt(ctx, li, ax - 3.2, az + 2.6, 1.1)) {
    const S = new Parts();
    stretcher(S, 0, 0, 0, 1.9, true);
    put(ctx, S, ax - 3.2, 0.33, az + 2.8, 0.5, {});
    S.map.clear();
  }
  ivStand(ctx, ax - 1.9, 0, az + 3.6, true);
  o2Tank(ctx, ax - 0.6, 0, az + 2.3, true);
  // ---- 被布蓋著的車、燒毀的車(空車格)----
  const covered = pool(ctx, 'covered_car', () => { const S = new Parts(); S.add('po_fabric_dirty', rbox(1.8, 1.3, 4.3, 0.35), M(0, 0.72, 0)); return S; }, 4);
  bindModel(covered, 'covered_car', [], { origin: 'base' });
  for (const [x, z, yaw] of [[29, 89.9, 0.04], [101, 82.2, Math.PI + 0.03]]) if (freeRect(ctx, li, x - 1, z - 2.2, x + 1, z + 2.2, true)) { covered.add(M(x, 0, z, 0, yaw, 0)); solid(ctx, x, 0, z, 1.8, 1.4, 4.2, 'car'); }
  for (const [x, z] of [[33, 82]]) {
    if (!freeRect(ctx, li, x - 1, z - 2, x + 1, z + 2, true)) continue;
    placeVehicle(ctx, { x, y: 0, z, sx: 2, sz: 4, axis: 'NS', levelIndex: li }, 'sedan', {
      paint: 'po_paint_burnt', brokenP: 1, rearP: 1, open: [0.5, 0, 0, 0.3], flats: [1, 1, 1, 1], crumple: 0.2, dent: null, crack: false, chromeBumper: false, rim: 'steel', sag: 0.05,
      ground: (GP) => { groundDecal(GP, 'burn', 0, 0, 5.6, 3.4, 0, 0.006); groundDecal(GP, 'ashes', 0.6, 1.2, 2.2, 1.6, 0.3, 0.007); groundDecal(GP, 'shards', -0.4, -1.3, 1.6, 1.0, 1.2, 0.007); },
      decorate: (car) => { car.P.add('po_soot', box(car.S.L * 0.6, 0.01, car.S.W * 0.7), M(0.2, car.S.gh.roof + 0.02, 0)); },
    });
  }
  // ---- 疏散檢查站(南側出口)----
  checkpoint(ctx, zone, R, P);
  // ---- 雜物:推車、行李、散落紙張 ----
  cart(ctx, 46.5, 0, 79, 0.6, false);
  cart(ctx, 88.5, 0, 87.2, 2.2, true);
  cart(ctx, 9.5, 0, 87, -0.4, false);
  suitcase(ctx, 52.5, 0, 88.3, 0.4, true);
  suitcase(ctx, 41.2, 0, 86.6, 1.9, false, true);
  for (let k = 0; k < 10; k++) litter(P, R, R.range(6, 114), R.range(77, 93), 1.2, R.int(2, 5), ['flyer', 'missing', 'news', 'mask', 'glove', 'bag', 'cup', 'receipt'], 0.009);
  if (freeAt(ctx, li, 99, 77.6, 0.4)) payStation(ctx, P, 99, 0, 77.1, Math.PI);
  postSign(ctx, P, 3.2, 0, 77.2, HALF, 'park', 0.6, 0.6, 2.4);
  // 停車場邊緣:草帶上的枯樹、灌木、雜草
  for (const x of [8, 22, 38, 82, 98, 112]) { const xx = x + R.range(-1.5, 1.5); if (freeAt(ctx, li, xx, 96.5, 0.5)) tree(ctx, R.pick(['oak', 'poplar', 'snag']), xx, 0, 96.6 + R.range(-0.3, 0.4), R.range(0.85, 1.2), R() * TAU); }
  for (let x = 4; x < 116; x += R.range(2.5, 5)) if (Math.abs(x - 60) > 6) shrub(ctx, x, 0, R.range(95.2, 97.6), R.range(0.7, 1.3));
  for (let x = 3; x < 117; x += 2) if (Math.abs(x - 60) > 5) tuftPatch(ctx, R, x, 96, 0, 1.2, R.int(1, 4), { dryP: 0.7, tallP: 0.3 });
  edgeDress(ctx, zone, R, P, { leaves: 8, ivy: 0.1, tufts: 3, litter: 0.35 });
  scatter(ctx, zone, R, P, { leaves: 0.18, litter: 0.08, puddles: 0.05, stains: 0.05 });
  // [scene6] 雨水往緣石邊流:沿南北兩條緣石的長條積水;柏油裂縫長草;外牆腳/圍牆腳的草、落葉、髒污帶與爬藤
  for (const zc of [76.45, 93.6]) for (let x = 4 + R.range(0, 4); x < 116; x += R.range(4, 9)) if (freeAt(ctx, li, x, zc, 0.3)) puddle(P, R, x, zc, R.range(0.5, 0.85), R.range(2.4, 4.0), 0.5, 0.0045); // [scene7] 更大更密(原本看不出來)
  scatter(ctx, zone, R, P, { leaves: 0, litter: 0, cracks: 0.04, tufts: 0.035, stains: 0.03 });
  edgeDress(ctx, zone, R, P, { leaves: 5, ivy: 0.12, tufts: 3, litter: 0.2, stain: 0.12 });
  finish(ctx, P);
}

// 疏散檢查站:遮陽棚 + 桌椅、投光燈、沙包、紐澤西護欄堵住出口、屍袋、信號彈、行李嬰兒車、名單
function checkpoint(ctx, zone, R, P) {
  const li = zone.levelIndex;
  if (freeRect(ctx, li, 57.8, 87.8, 62.2, 91.2, true)) {
    canopy(ctx, 60, 0, 89.6, 0);
    foldTable(P, 60, 0, 89.4, 0, R);
    solid(ctx, 60, 0, 89.4, 1.8, 0.78, 0.76, 'plastic'); // [interact 稽核] 桌子原本沒有碰撞
    foldChair(ctx, 59.2, 0, 90.4, Math.PI + 0.3);
    foldChair(ctx, 61.4, 0, 88.6, 0.9, true);
    P.add('po_sign', signQuad('names', 0.4, 0.6), M(58.22, 1.45, 88.13, 0, Math.PI, 0));
    aSign(P, 63.2, 0, 88.4, 0.3, 'evac');
  }
  // 出口被紐澤西護欄 + 沙包封死
  for (const x of [57.2, 59.6, 62.0]) jersey(ctx, x + R.range(-0.08, 0.08), 0, 96.9, R.range(-0.05, 0.05));
  sandbagWall(ctx, 56.2, 0, 95.4, 56.2, 97.6, 3, R);
  sandbagWall(ctx, 63.8, 0, 95.4, 63.8, 97.6, 3, R);
  // 圍籬上的封鎖告示 + 鐵鍊
  P.add('po_sign', signQuad('back', 1.6, 0.8), M(60, 1.6, 98.05, 0, Math.PI, 0));
  P.add('po_sign', signQuad('shoot', 1.2, 0.6), M(54.5, 1.2, 98.05, 0, Math.PI, 0.05));
  P.add('steel', tube(sagLine(new V3(57, 1.1, 98.0), new V3(63, 1.1, 98.0), 0.35, 12), 0.012, { radial: 4 }));
  // 投光燈:一座亮著、一座倒地
  floodlight(ctx, P, 56.6, 0, 91.6, 0.4, true, zone);
  if (freeAt(ctx, li, 64, 92, 0.5)) { P.add('cast_iron', rod(new V3(64, 0.15, 92), new V3(65.6, 0.25, 93.1), 0.02, 5)); P.add('cast_iron', rbox(0.6, 0.22, 0.1, 0.02), M(65.8, 0.12, 93.2, 0.2, 0.6, 1.3)); }
  // 路錐(部分被撞倒)
  for (let k = 0; k < 7; k++) { const x = 53.5 + k * 2.1, z = 87.4 + R.range(-0.2, 0.2); if (freeAt(ctx, li, x, z, 0.2) || k % 2) cone(ctx, x, 0, z, R() * TAU, R() < 0.35); }
  // 屍袋(草地上一排)+ 告示
  for (let k = 0; k < 5; k++) bodyBag(ctx, 44.6 + k * 1.15, 0.0, 96.4 + R.range(-0.15, 0.15), HALF + R.range(-0.12, 0.12));
  groundDecal(P, 'pool', 46.5, 97.4, 1.4, 0.9, 0.3, 0.006);
  postSign(ctx, P, 43.3, 0, 95.3, Math.PI, 'morgue', 0.7, 0.35, 1.6);
  // 被丟下的行李、嬰兒車、防護衣
  suitcase(ctx, 65.6, 0, 90.5, 1.1, true);
  suitcase(ctx, 66.4, 0, 89.4, 0.2, false, true);
  stroller(P, 54.2, 0, 90.6, 2.2, true);
  hazmatSuit(P, 62.6, 0.005, 93.2, 0.7);
  teddy(P, 55.1, 0, 91.4, 1.2, 0.85);
  litter(P, R, 60, 91, 3, 20, ['flyer', 'form', 'missing', 'mask', 'glove', 'tag', 'receipt'], 0.009);
  groundDecal(P, 'smear', 61, 94.4, 2.6, 1.0, 0.2, 0.0065);
  groundDecal(P, 'bullets', 57.6, 93.6, 1.0, 1.0, 0, 0.0068);
  groundDecal(P, 'bullets', 62.4, 92.8, 1.0, 1.0, 1, 0.0068);
  flare(ctx, 58.2, 0, 92.4, 0.4, zone);
  flare(ctx, 49.4, 0, 88.6, 2.0, zone);
}

// ======================================================================
// 前廣場
// ======================================================================
function dressPlaza(ctx, zone) {
  // [scene r4] 立面識別:屋頂女兒牆上的「聖心醫院」霓虹(心不亮、醫在閃),從停車場一眼認得出這棟醫院
  neonSign(ctx, 60, 10.45, 67.55, 0, '聖心醫院', { size: 1.75, modes: ['on', 'dead', 'flicker', 'on'], zone });
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  // 醫院霓虹招牌(大門上方):心字熄滅、醫字閃爍
  neonSign(ctx, 60, 3.55, 68.02, 0, '聖心醫院', { color: '#ff3020', hex: 0xff3020, size: 0.85, modes: ['on', 'dead', 'flicker', 'on'], zone });
  // 院名石碑 + 旗桿
  if (freeRect(ctx, li, 37.4, 70.5, 42.6, 72.6)) {
    P.add('po_granite', box(4.2, 1.0, 0.5), M(40, 0.5, 71.6));
    P.add('po_granite', box(4.4, 0.12, 0.62), M(40, 1.06, 71.6));
    P.add('po_label', labelQuad('hosp_stone', 3.9, 0.95), M(40, 0.52, 71.86));
    P.add('po_curb', box(4.8, 0.2, 1.0), M(40, 0.1, 71.6));
    solid(ctx, 40, 0, 71.6, 4.6, 1.1, 0.9, 'stone');
    flatDecal(P, 'moss', 38.5, 0.25, 71.87, 1.4, 0.5, 'z+');
  }
  for (const x of [48, 72]) if (freeAt(ctx, li, x, 69.4, 0.3)) flagPole(ctx, P, x, 0, 69.4, 8);
  // 長椅、花台(枯灌木)、垃圾桶
  for (const x of [14, 24, 96, 106]) if (freeAt(ctx, li, x, 69, 0.6)) { bench(ctx, x, 0, 68.75, 0); if (R() < 0.5) litter(P, R, x, 69.6, 0.6, 3, undefined, 0.009); }
  for (const x of [34, 100]) if (freeRect(ctx, li, x - 1.3, 68.2, x + 1.3, 69.6)) { const top = planter(ctx, P, x, 0, 68.9, 2.4, 1.1); shrub(ctx, x - 0.5, top, 68.9, 0.9); shrub(ctx, x + 0.6, top, 68.9, 0.8); tuftPatch(ctx, R, x, 68.9, top, 0.8, 4, { dryP: 0.9 }); }
  for (const [x, z] of [[19, 69.2], [101, 69.2], [52, 74.6]]) trashCan(ctx, x, 0, z, { rust: R() < 0.5, fallen: x === 52 });
  // 路阻柱(保護雕像區)、矮燈柱
  for (let x = 46; x <= 74; x += 2.4) if (Math.abs(x - 60) > 3.2 && freeAt(ctx, li, x, 75.2, 0.12)) bollard(ctx, x, 0, 75.25, x === 53.2 ? 1.2 : 0);
  for (const [x, st] of [[10, 'dead'], [30, 'on'], [90, 'flicker'], [112, 'on']]) if (freeAt(ctx, li, x, 75, 0.2)) lamp(ctx, x, 0, 75.1, 0, st, { kind: 'short', zone });
  // 公車亭(西端)
  if (freeRect(ctx, li, 2.2, 72.4, 8.4, 75.8)) busStop(ctx, 5.4, 0, 74.4, 0, R);
  // 隔離帳篷區(東段):兩頂帳篷 + 塑膠布 + 消毒淋浴架 + 防護衣 + 廢棄物桶
  const inside = (T, L2, W2) => { const S = new Parts(); stretcher(S, 0, 0, 0, 1.9, true); T.merge(S, M(-0.6, 0, -0.3, 0, 0.1, 0)); T.add('po_bodybag', box(0.4, 0.15, 0.3), M(1.3, 0.08, -0.8)); };
  const tents = [[78.5, 'quar'], [85, 'triage']];
  for (const [x, sg] of tents) if (freeRect(ctx, li, x - 2.2, 68.2, x + 2.2, 72.2)) { tent(ctx, x, 0, 70.2, 0, { key: sg === 'quar' ? 'po_tent_white' : 'po_tent_white', L: 4, W: 3, sign: sg, rng: R, inside: sg === 'quar' ? inside : null }); if (sg === 'quar') solid(ctx, x - 0.6, 0, 69.9, 2.0, 0.9, 0.8, 'metal'); } // [interact 稽核] 帳篷裡的擔架
  if (freeRect(ctx, li, 89.2, 68.2, 92.4, 71.8)) { // 消毒淋浴架(管架 + 塑膠布)
    for (const [a, b] of [[89.6, 68.6], [92, 68.6], [89.6, 71.4], [92, 71.4]]) P.add('plastic_white', cyl(0.025, 0.025, 2.2, 6), M(a, 1.1, b));
    P.add('plastic_white', box(2.5, 0.05, 0.05), M(90.8, 2.2, 68.6)); P.add('plastic_white', box(2.5, 0.05, 0.05), M(90.8, 2.2, 71.4));
    P.add('po_sheet', new THREE.PlaneGeometry(2.4, 2.0), M(90.8, 1.15, 68.62));
    P.add('po_sheet', new THREE.PlaneGeometry(2.8, 2.0).rotateY(HALF), M(89.62, 1.15, 70));
    groundDecal(P, 'water', 90.8, 70, 2.4, 2.4, 0, 0.006);
    solid(ctx, 90.8, 0, 68.6, 2.6, 2.2, 0.15, 'fabric');
    hazmatSuit(P, 91.5, 0.005, 72.6, 2.6);
  }
  for (const [x, z] of [[82.2, 73.6], [88.4, 73.9]]) bioBin(ctx, x, 0, z, R() * TAU);
  mark(P, 'quar', 81.5, 74.4, 3.2, 1.6, Math.PI);
  for (const [a, b] of [[[76, 1.0, 72.8], [77.5, 1.0, 75.7]], [[77.5, 1.0, 75.7], [93.5, 0.95, 75.7]], [[93.5, 0.95, 75.7], [93.5, 1.0, 72.6]]]) tape(P, new V3(...a), new V3(...b), { sag: 0.08 });
  for (const [x, z] of [[76, 72.8], [77.5, 75.7], [93.5, 75.7], [93.5, 72.6], [85.5, 75.7]]) if (freeAt(ctx, li, x, z, 0.2)) cone(ctx, x, 0, z, R() * TAU, false);
  // 大門口:輪椅、濕地板警示、血腳印
  wheelchair(ctx, 63.6, 0, 69.6, 0.9, false);
  wetSign(ctx, 56.4, 0, 68.9, 0.4);
  groundDecal(P, 'steps', 60.5, 70.5, 2.0, 0.9, -HALF + 0.15, 0.0065);
  groundDecal(P, 'smear', 58.2, 69.2, 2.0, 0.8, 0.3, 0.0065);
  litter(P, R, 60, 70, 3.5, 22, ['flyer', 'missing', 'news', 'mask', 'form', 'photo', 'glove'], 0.009);
  // 地面:排水溝、人孔、水窪、落葉
  for (const x of [16, 44, 76, 104]) drain(ctx, x, 0, 75.45, 0);
  manhole(ctx, 26, 0, 71.5, 0.3);
  manhole(ctx, 98, 0, 72.8, 1.2);
  edgeDress(ctx, zone, R, P, { leaves: 9, ivy: 0.18, tufts: 2, litter: 0.3, stain: 0.1 });
  scatter(ctx, zone, R, P, { leaves: 0.22, litter: 0.12, puddles: 0.03, stains: 0.04 });
  edgeDress(ctx, zone, R, P, { leaves: 4, ivy: 0.1, tufts: 2, litter: 0.15, stain: 0.1 }); // [scene6] 牆腳的草/落葉/髒污帶
  crow(ctx, 48, 8.05, 69.4, 1.2);
  finish(ctx, P);
}

// ======================================================================
// 北側後勤巷
// ======================================================================
function dressAlley(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  // 中央排水溝(混凝土 V 溝 + 格柵)
  P.add('po_curb_dark', box(54, 0.012, 0.5), M(37, 0.004, 7.05));
  P.add('po_curb_dark', box(30, 0.012, 0.5), M(87, 0.004, 7.05));
  for (const x of [16, 30, 44, 58, 80, 96]) { drain(ctx, x, 0, 7.05, HALF); puddle(P, R, x + R.range(-0.4, 0.4), 7.1, R.range(0.7, 1.2), 1.8, 0.8, 0.004); }
  for (let k = 0; k < 18; k++) tarCrack(P, R, R.range(10, 100), R.range(3, 11), R.range(2, 6), R() * TAU, [2, 2.2, 104, 11.8]);
  // 架空電線(圍牆頂 → 建築),交叉懸垂
  for (const x of [14, 38, 62, 88]) {
    const a = new V3(x, 3.05, 2.1), b = new V3(x + R.range(-4, 4), 7.6, 11.9);
    P.add('po_cable', tube(sagLine(a, b, 0.6, 14), 0.012, { radial: 4 }));
    P.add('po_cable', tube(sagLine(a.clone().add(new V3(0.3, 0, 0)), b.clone().add(new V3(0.4, -0.4, 0)), 0.7, 14), 0.01, { radial: 4 }));
    P.add('cast_iron', box(0.3, 0.4, 0.15), M(b.x, b.y - 0.1, 11.9));
  }
  // 建築外牆:工業壁燈、落水管、牆掛冷氣、配電箱
  // [scene r4] 207 窗下那一段不點燈(71 原本亮著):後巷裡只剩那扇窗
  for (const [x, st] of [[19, 'on'], [43, 'flicker'], [93, 'on']]) wallLamp(ctx, x, 3.0, 11.98, Math.PI, st, zone); // 71、75 拆掉了(燈殼的玻璃是共用發光材質,關不掉)
  P.merge(alley207(ctx, zone)); // [scene r4] 家屬的鐵網、207 專用發電機的電纜、結局錨點
  for (const x of [17.2, 59, 95.2]) {
    P.add('cast_iron', cyl(0.06, 0.06, 12.2, 8), M(x, 6.1, 11.88));
    for (let yy = 1; yy < 12; yy += 2.2) P.add('cast_iron', box(0.18, 0.04, 0.08), M(x, yy, 11.94));
    P.add('cast_iron', tube([new V3(x, 0.5, 11.88), new V3(x, 0.15, 11.8), new V3(x, 0.1, 11.5)], 0.06, { radial: 8 }));
    puddle(P, R, x, 11.0, 0.6, 1.4, 1.0, 0.004);
    flatDecal(P, 'rustrun', x, 1.5, 11.985, 0.5, 2.6, 'z-');
  }
  for (const [x, yy] of [[24, 5.6], [56, 5.4], [64, 9.8], [86, 5.6]]) { // 牆掛冷氣(2F/3F)
    P.add('metal_white', box(0.85, 0.6, 0.32), M(x, yy, 11.76));
    P.add('rubber', cyl(0.22, 0.22, 0.02, 16).rotateX(HALF), M(x - 0.12, yy, 11.59));
    P.add('steel', tor(0.22, 0.008, 3, 16), M(x - 0.12, yy, 11.585));
    for (const s of [-1, 1]) P.add('rust', box(0.04, 0.04, 0.4), M(x + s * 0.35, yy - 0.32, 11.75));
    P.add('rubber', tube([new V3(x + 0.3, yy - 0.3, 11.75), new V3(x + 0.32, yy - 1.4, 11.8), new V3(x + 0.3, 0.1, 11.85)], 0.008, { radial: 3 }));
    flatDecal(P, 'rustrun', x, yy - 1.0, 11.985, 0.6, 1.4, 'z-');
  }
  if (freeAt(ctx, li, 36, 10.8, 0.4)) utilityBox(ctx, 36, 0, 11.6, Math.PI);
  // 北圍牆:塗鴉、血手印
  for (const [x, n, w, h] of [[20, 'g_help', 2.8, 1.4], [54, 'g_still', 3.6, 1.2], [78, 'g_eye', 1.5, 1.5], [90, 'g_tally', 1.2, 1.2], [8, 'g_dont', 2.8, 1.4]]) flatDecal(P, n, x, R.range(1.4, 1.9), 2.013, w, h, 'z+', R.range(-0.05, 0.05));
  for (const x of [41, 42.2]) flatDecal(P, 'hand', x, R.range(1.0, 1.5), 2.014, 0.4, 0.4, 'z+', R.range(-0.3, 0.3));
  // 垃圾堆:垃圾袋、紙箱、棧板、木箱、油桶、輪胎、床墊、瓦斯桶
  for (const [x, z, n] of [[29.5, 3.6, 7], [33, 10.6, 4], [89, 3.6, 6], [96, 10.2, 5], [9.5, 10.6, 3]]) for (let k = 0; k < n; k++) trashBag(ctx, x + R.range(-1, 1), 0, z + R.range(-0.6, 0.6), R() * TAU, R.range(0.85, 1.2), [R.range(-0.3, 0.3), R.range(-0.3, 0.3)]);
  for (const [x, z] of [[11, 3.4], [101.6, 3.2]]) if (freeAt(ctx, li, x, z, 0.7)) { const yw = R() * 0.4, n = R.int(2, 5); pallet(P, x, 0, z, yw, n, R); solid(ctx, x, 0, z, 1.25, n * 0.145 + 0.01, 1.25, 'wood'); } // [interact 稽核] 棧板堆
  for (const [x, z] of [[85.3, 3.4], [86.6, 3.2]]) crate(ctx, x, 0, z, R.range(-0.3, 0.3));
  for (const [x, z, f] of [[98.2, 3.3, false], [99.0, 4.2, true], [37.6, 3.0, false]]) barrel(ctx, x, 0, z, { fallen: f, yaw: R() * TAU });
  for (const [x, z] of [[13.5, 10.8], [14.2, 10.2]]) tyre(ctx, x, 0, z, true, R() * TAU);
  tyre(ctx, 15, 0, 10.9, false, 0.3);
  for (const x of [65.6, 66.4]) propane(ctx, x, 0, 3.0, x > 66); // [scene r4] 從 77.5 移開:207 鐵網後面要留給結局的視角
  if (freeRect(ctx, li, 47.8, 2.2, 50.6, 4.6)) { // 沾血的床墊靠牆
    P.add('po_mattress', rbox(1.9, 0.2, 0.9, 0.08), M(49.2, 0.95, 2.45, -HALF + 0.25, 0, 0.03));
    flatDecal(P, 'blood1', 49.2, 1.0, 2.62, 0.8, 0.8, 'z+');
    solid(ctx, 49.2, 0, 2.6, 2.0, 1.8, 0.6, 'soft');
  }
  cart(ctx, 58.5, 0, 3.4, 1.2, true);
  // 停屍間外梯口:推床 + 屍袋
  if (freeAt(ctx, li, 62.2, 9.5, 0.9)) {
    const S = new Parts();
    stretcher(S, 0, 0, 0, 1.9, false);
    put(ctx, S, 62.2, 0, 9.6, HALF + 0.2);
    bodyBag(ctx, 62.2, 0.42, 9.6, HALF + 0.2);
    solid(ctx, 62.2, 0, 9.6, 0.8, 0.9, 2.0, 'metal');
  }
  // 焚化爐周圍:醫療廢棄物桶
  for (const [x, z] of [[9.6, 4.2], [10.3, 5.3], [9.4, 6.4]]) bioBin(ctx, x, 0, z, R() * TAU);
  // 蒸汽從格柵冒出
  steam(ctx, 60, 0.02, 10.8);
  flare(ctx, 53.5, 0, 9.2, 1.4, zone);
  edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.2, tufts: 2, litter: 0.45, stain: 0.18 });
  scatter(ctx, zone, R, P, { leaves: 0.15, litter: 0.2, puddles: 0.05, stains: 0.08, kinds: ['news', 'bag', 'cup', 'pack', 'card', 'tissue', 'receipt', 'glove'] });
  crow(ctx, 27.2, 1.38, 5.0, 0.3);
  crow(ctx, 92.5, 1.38, 5.4, 2.5);
  finish(ctx, P);
}
// 冒蒸汽的格柵(精靈循環)
function steam(ctx, x, y, z) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g2 = c.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(210,210,215,0.5)'); gr.addColorStop(1, 'rgba(200,200,205,0)');
  g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const P = new Parts();
  P.add('cast_iron', box(0.6, 0.02, 0.6), M(0, 0.01, 0));
  for (let k = 0; k < 6; k++) P.add('po_gap', box(0.5, 0.022, 0.04), M(0, 0.011, -0.22 + k * 0.09));
  const grp = P.group();
  grp.position.set(x, y, z);
  ctx.add(grp, { static: false });
  const sm = new THREE.SpriteMaterial({ map: t, color: 0x8a8e94, transparent: true, depthWrite: false, opacity: 0.3 });
  const puffs = [];
  for (let k = 0; k < 6; k++) { const s = new THREE.Sprite(sm.clone()); s.userData.ph = k / 6; grp.parent.add(s); puffs.push(s); }
  const mesh = grp.children[0], prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...a) {
    prev.apply(this, a);
    const tt = performance.now() / 1000;
    for (const s of puffs) {
      const ph = (tt * 0.22 + s.userData.ph) % 1;
      s.position.set(x + Math.sin(tt * 0.7 + s.userData.ph * 9) * 0.25 + ph * 0.6, y + 0.2 + ph * 3.2, z - ph * 0.4);
      const k = 0.5 + ph * 2.4;
      s.scale.set(k, k, k);
      s.material.opacity = 0.26 * (1 - ph) * Math.min(1, ph * 4);
    }
  };
}

// ======================================================================
// 兒童遊戲場
// ======================================================================
function dressPlayground(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  if (freeRect(ctx, li, 104.6, 3.4, 111.4, 6.2)) swingSet(ctx, 108, 0, 4.8, 0);
  if (freeRect(ctx, li, 112.6, 11, 117.4, 17.4)) slide(ctx, 115.2, 0, 12.6, Math.PI * 0.0);
  if (freeRect(ctx, li, 105.8, 11.6, 110.2, 15.8)) merryGoRound(ctx, 108, 0, 13.6);
  if (freeRect(ctx, li, 104.4, 8.2, 108.6, 9.8)) seesaw(ctx, 106.4, 0, 9.0, 0.05);
  for (const [x, z, k] of [[106, 17.6, 'horse'], [109, 18.2, 'duck']]) if (freeAt(ctx, li, x, z, 0.4)) springRider(ctx, x, 0, z, R.range(-0.5, 0.5), k);
  if (freeRect(ctx, li, 113.6, 2.4, 117.6, 6.4)) sandbox(ctx, 115.6, 0, 4.4, R);
  // 長椅上的泰迪熊、三輪車、皮球、童鞋
  if (freeAt(ctx, li, 104.9, 15.4, 0.6)) { bench(ctx, 104.6, 0, 15.6, HALF); teddy(P, 104.75, 0.44, 15.2, HALF + 0.2, 1); }
  tricycle(P, 111.4, 0, 18.6, 0.6, true);
  ball(ctx, 112.5, 0, 8.5);
  P.add('po_fabric_pink', rbox(0.16, 0.07, 0.07, 0.03), M(110.4, 0.035, 10.6, 0, 0.7, 0));
  // 告示牌、枯樹、路燈
  postSign(ctx, P, 112.8, 0, 19.1, Math.PI, 'play', 1.1, 0.55, 1.9);
  if (freeAt(ctx, li, 117.2, 18.6, 0.6)) tree(ctx, 'gnarl', 117.3, 0, 18.7, 1.0, 0.4);
  if (freeAt(ctx, li, 104.6, 2.8, 0.5)) tree(ctx, 'oak', 104.7, 0, 2.7, 0.9, 1.9);
  if (freeAt(ctx, li, 111.5, 10.6, 0.2)) lamp(ctx, 111.6, 0, 10.4, 0, 'flicker', { kind: 'short', zone });
  // 跳房子粉筆格(畫在少數沒草的地面)
  for (let k = 0; k < 4; k++) { line(P, BAND.white, 116, 8.2 + k * 0.6, 116.6, 8.2 + k * 0.6, 0.04, { y: 0.012 }); }
  tuftPatch(ctx, R, 111, 10, 0, 7, 40, { dryP: 0.55, tallP: 0.4 });
  leafPatch(P, R, 110, 10, 7, 90, 0.012);
  crow(ctx, 108, 2.47, 4.8, 0.2);
  crow(ctx, 109.2, 2.47, 4.82, 3.0);
  edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.3, tufts: 4, litter: 0.15, grime: true });
  finish(ctx, P);
}

// ======================================================================
// 舊墓園
// ======================================================================
function dressCemetery(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  const kinds = ['slab', 'slab', 'cross', 'chinese', 'obelisk', 'ledger', 'broken'];
  let epi = 0;
  for (const x of [3.6, 8.6]) for (let z = 26.4; z < 49; z += R.range(2.0, 2.6)) {
    const xx = x + R.range(-0.5, 0.5), zz = z + R.range(-0.2, 0.2);
    if (!freeAt(ctx, li, xx, zz, 0.45) || Math.abs(zz - 33) < 1.2 || Math.abs(zz - 45) < 1.2) continue;
    const k = R.pick(kinds), yaw = (x < 6 ? HALF : -HALF) + R.range(-0.1, 0.1), tilt = [R.range(-0.12, 0.12), R.range(-0.1, 0.1)];
    if (k === 'broken') brokenSlab(ctx, xx, 0, zz, yaw, R.range(0.9, 1.1));
    else tomb(ctx, k, xx, 0, zz, yaw, k === 'ledger' ? [0, 0] : tilt, R.range(0.9, 1.1));
    if (k === 'slab') epitaph(P, epi++, xx, 0, zz, yaw, 0.42, 0.42, 0.52, 0.065);
    if (k === 'chinese') epitaph(P, epi++, xx, 0, zz, yaw, 0.6, 0.6, 0.55, -0.025);
    groundDecal(P, R.pick(['moss', 'leaves', 'mud']), xx, zz, 1.2, 1.2, R() * TAU, 0.008);
    if (R() < 0.35) for (let j = 0; j < R.int(1, 3); j++) { const cx = xx + R.range(-0.4, 0.4) + (x < 6 ? 0.45 : -0.45), cz = zz + R.range(-0.3, 0.3), h = R.range(0.04, 0.12); P.add('candle_wax', cyl(0.025, 0.028, h, 8), M(cx, h / 2, cz)); }
    if (k === 'ledger') solid(ctx, xx, 0, zz, 2.1, 0.45, 1.0, 'stone'); // [interact 稽核] 台式墓 2m 長,原本只有中間 0.7m 有碰撞
    else solid(ctx, xx, 0, zz, 0.7, k === 'obelisk' ? 2.0 : 1.0, 0.7, 'stone');
  }
  // 天使像、空墓穴(新挖,鐵鏟還插著)、還亮著的燭火
  angelMonument(P, 6.2, 45.2, 0, R);
  solid(ctx, 6.2, 0, 45.2, 0.9, 2.4, 0.9, 'stone');
  crow(ctx, 6.2, 2.4, 45.15, 1.0);
  openGrave(P, 6.2, 33.2, 0.05, R);
  solid(ctx, 6.2, -0.3, 33.2, 0.9, 0.35, 2.0, 'stone');
  solid(ctx, 7.15, 0, 33.3, 1.0, 0.45, 2.1, 'sand');
  for (const [x, z] of [[5.4, 31.6], [7.1, 46.6]]) {
    P.add('candle_wax', cyl(0.03, 0.032, 0.14, 10), M(x, 0.07, z));
    ctx.light({ x, y: 0.3, z, color: 0xffa040, intensity: 1.6, distance: 5, kind: 'candle', flicker: 0.6, zone: zone.id, glow: 0.3 });
  }
  for (const [x, z] of [[5.4, 31.6], [7.1, 46.6]]) P.add('po_candle_flame', sph(0.012, 6, 5).scale(1, 2.2, 1), M(x, 0.165, z));
  P.add('po_label', labelQuad('wreath', 0.5, 0.5).rotateY(HALF), M(6.4, 0.5, 46.0));
  P.add('leaves_dead', new THREE.TorusGeometry(0.28, 0.07, 6, 14), M(6.42, 0.55, 46.0, 0, HALF, 0));
  // 枯樹、雜草、霧中的燈籠
  for (const [x, z, k] of [[3.4, 29.2, 'gnarl'], [10.5, 41.5, 'gnarl'], [3.0, 47.8, 'snag']]) if (freeAt(ctx, li, x, z, 0.6)) tree(ctx, k, x, 0, z, R.range(0.9, 1.15), R() * TAU);
  tuftPatch(ctx, R, 6, 37, 0, 6, 70, { dryP: 0.6, tallP: 0.45 });
  leafPatch(P, R, 6, 37, 6, 110, 0.012);
  for (let z = 25; z < 50; z += 1.0) strip(P, BAND.mud, [[6.1, z], [6.1, z + 1.1]], 1.1, { us: 3, y: 0.008 }); // 中央泥土小徑
  postSign(ctx, P, 9.2, 0, 21.4, Math.PI, 'cem', 1.0, 0.5, 1.7);
  crow(ctx, 3.6, 1.35, 27.0, 0.6);
  edgeDress(ctx, zone, R, P, { leaves: 9, ivy: 0.35, tufts: 4, litter: 0.05 });
  finish(ctx, P);
}

// ======================================================================
// 西側空地(維修院子)
// ======================================================================
function dressYard(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  // 鐵皮倉庫(北半部)
  if (freeRect(ctx, li, 2.2, 12.2, 6.8, 15.8)) {
    const S = new Parts(), w = 4.2, d = 3.2, h = 2.4;
    S.add('rust', box(w, h, 0.04), M(0, h / 2, -d / 2)); S.add('rust', box(0.04, h, d), M(-w / 2, h / 2, 0)); S.add('rust', box(0.04, h, d), M(w / 2, h / 2, 0));
    S.add('metal_gray', box(w * 0.55, h, 0.04), M(-w * 0.22, h / 2, d / 2));
    S.add('metal_gray', box(w * 0.45, h * 0.95, 0.04), M(w * 0.45, h / 2, d / 2 + 0.5, 0, -0.8, 0)); // 半開的門
    S.add('rust', box(w + 0.3, 0.05, d + 0.4), M(0, h + 0.1, 0, 0.08, 0, 0));
    for (let k = 0; k < 8; k++) S.add('rust', box(0.03, h, 0.05), M(-w / 2 + k * w / 7, h / 2, -d / 2 - 0.02));
    flatDecal(S, 'rustrun', 0, 1.2, d / 2 + 0.03, 1.6, 1.6, 'z+');
    put(ctx, S, 4.5, 0, 14.0, 0);
    solid(ctx, 4.5, 0, 14.0 - 0.3, 4.3, 2.5, 2.6, 'metal');
  }
  wheelbarrow(P, 9.6, 0, 14.6, 0.7);
  solid(ctx, 9.4, 0, 14.6, 1.3, 0.7, 1.1, 'metal'); // [interact 稽核] 手推車
  for (let k = 0; k < 3; k++) tyre(ctx, 12.6 + R.range(-0.3, 0.3), 0.17 * k, 13.2 + R.range(-0.2, 0.2), true, R() * TAU);
  pallet(P, 12.8, 0, 19.6, 0.2, 3, R);
  solid(ctx, 12.8, 0, 19.6, 1.25, 0.45, 1.25, 'wood'); // [interact 稽核]
  for (const [x, z] of [[2.9, 19.8], [3.6, 20.6]]) barrel(ctx, x, 0, z, { yaw: R() * TAU });
  if (freeRect(ctx, li, 6.8, 17.6, 9.4, 20.4)) { // 帆布蓋著的雜物堆
    P.add('po_tarp', new THREE.SphereGeometry(1.0, 12, 8, 0, TAU, 0, HALF).scale(1.3, 0.75, 1.0), M(8.1, 0, 19.0, 0, 0.3, 0));
    for (const [a, b] of [[7.0, 18.2], [9.2, 19.9]]) P.add('cast_iron', box(0.2, 0.1, 0.2), M(a, 0.05, b));
    solid(ctx, 8.1, 0, 19.0, 2.4, 0.8, 1.9, 'soft');
  }
  // 南半部:抽菸區(長椅 + 沙桶 + 菸蒂)
  if (freeAt(ctx, li, 3.2, 58, 0.6)) bench(ctx, 3.1, 0, 58, HALF);
  P.add('rust', lathe([[0, 0], [0.16, 0], [0.18, 0.34], [0.17, 0.34], [0.15, 0.02]], 12), M(3.0, 0, 60.1));
  P.add('po_sand', cyl(0.165, 0.165, 0.02, 12), M(3.0, 0.3, 60.1));
  groundDecal(P, 'butts', 3.6, 59.2, 1.6, 1.6, 0.4, 0.008);
  trashCan(ctx, 3.2, 0, 61.2, { rust: true });
  for (const [x, z, k] of [[3.0, 66.4, 'snag'], [13.2, 16.5, 'oak']]) if (freeAt(ctx, li, x, z, 0.5)) tree(ctx, k, x, 0, z, R.range(0.9, 1.1), R() * TAU);
  edgeDress(ctx, zone, R, P, { leaves: 7, ivy: 0.3, tufts: 4, litter: 0.3, stain: 0.12 });
  scatter(ctx, zone, R, P, { leaves: 0.25, litter: 0.08, tufts: 0.35, puddles: 0.06, stains: 0.05 });
  finish(ctx, P);
}
function wheelbarrow(P, x, y, z, yaw) {
  const T = new Parts();
  T.add('rust', new THREE.CylinderGeometry(0.42, 0.3, 0.32, 10, 1, true).scale(1.3, 1, 1), M(0, 0.48, 0));
  T.add('rust', cyl(0.3, 0.3, 0.02, 10).scale(1.3, 1, 1), M(0, 0.33, 0));
  T.add('rubber', tor(0.18, 0.05, 6, 14).rotateX(0), M(0.62, 0.2, 0, 0, HALF, 0));
  for (const s of [-1, 1]) { T.add('steel', rod(new V3(0.62, 0.2, s * 0.04), new V3(-0.9, 0.55, s * 0.28), 0.02, 5)); T.add('steel', rod(new V3(-0.2, 0.3, s * 0.25), new V3(-0.25, 0.0, s * 0.28), 0.015, 5)); }
  T.add('po_soil', sph(0.3, 10, 6).scale(1.2, 0.35, 0.9), M(0, 0.58, 0));
  P.merge(T, M(x, y, z, 0, yaw, 0));
}

// ======================================================================
// 急診車道
// ======================================================================
function dressAmbulanceBay(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  // 標線:車道邊線、救護車專用、急診箭頭、禁停斜線
  line(P, BAND.yellow, 105.2, 20.4, 105.2, 37.6, 0.12); line(P, BAND.yellow, 105.2, 50, 105.2, 67.6, 0.12);
  line(P, BAND.yellow, 117.3, 20.4, 117.3, 67.6, 0.12);
  dashed(P, BAND.white, 113, 21, 113, 37, 0.12, 2, 2); dashed(P, BAND.white, 113, 50, 113, 67, 0.12, 2, 2);
  groundDecal(P, 'road_amb', 109.5, 30, 3.6, 1.2, HALF, 0.0072); // po_decal 的字樣
  groundDecal(P, 'road_amb', 109.5, 60, 3.6, 1.2, -HALF, 0.0072);
  for (const z of [26, 56]) mark(P, 'er', 115.2, z, 3.0, 1.5, -HALF);
  mark(P, 'fire', 110, 64.8, 3.2, 1.6, HALF);
  for (let z = 22; z < 36; z += 1.6) mark(P, 'xhatch', 106.3, z, 1.6, 1.6, 0);
  mark(P, 'p_amb', 115.4, 33.4, 2.2, 2.2, 0);
  // 急診門口雨遮 + 急診招牌 + 紅十字霓虹
  awning(ctx, P, 104, 37.6, 46.4, zone);
  // 路阻柱、消防栓、壁燈
  for (const z of [36.6, 47.4]) if (freeAt(ctx, li, 104.9, z, 0.15)) bollard(ctx, 104.9, 0, z);
  if (freeAt(ctx, li, 117.2, 28, 0.3)) hydrant(ctx, 117.2, 0, 28, -HALF);
  for (const [z, st] of [[22.5, 'on'], [31, 'dead'], [57, 'on'], [63, 'flicker']]) wallLamp(ctx, 104.02, 3.1, z, HALF, st, zone);
  for (const [z, st] of [[24, 'on'], [52, 'flicker']]) if (freeAt(ctx, li, 117.3, z, 0.3)) lamp(ctx, 117.4, 0, z, Math.PI, st, { zone });
  // 檢傷分類區(南段):帳篷、屍袋一排、擔架、輪椅、點滴架、氧氣瓶、發電機 + 投光燈
  if (freeRect(ctx, li, 106.6, 54.2, 111.4, 58.8)) { tent(ctx, 109, 0, 56.6, -HALF, { L: 4, W: 3, sign: 'triage', rng: R, inside: (T) => { const S = new Parts(); stretcher(S, 0, 0, 0, 1.9, true); T.merge(S, M(-0.8, 0, 0, 0, 0, 0)); T.merge(S, M(0.9, 0, 0.2, 0, 0.05, 0)); } }); solid(ctx, 108.9, 0, 56.6, 0.9, 0.9, 3.6, 'metal'); } // [interact 稽核] 帳篷裡的兩副擔架
  for (let k = 0; k < 7; k++) { const z = 60.2 + k * 1.1; if (freeAt(ctx, li, 115.6, z, 0.3) || true) bodyBag(ctx, 115.7 + R.range(-0.15, 0.15), 0, z, R.range(-0.1, 0.1)); }
  groundDecal(P, 'pool', 115.2, 63.5, 1.8, 1.2, 0.3, 0.006);
  postSign(ctx, P, 117.4, 0, 59.2, -HALF, 'morgue', 0.8, 0.4, 1.7);
  for (let k = 0; k < 6; k++) litter(P, R, 115.6, 60.5 + k * 1.1, 0.3, 1, ['tag'], 0.2);
  if (freeAt(ctx, li, 112.6, 52.2, 1.0)) { const S = new Parts(); stretcher(S, 0, 0, 0, 1.9, true); put(ctx, S, 112.8, 0, 52.2, 0.3); solid(ctx, 112.8, 0, 52.2, 2.0, 0.9, 0.8, 'metal'); }
  wheelchair(ctx, 107.2, 0, 61.2, 2.4, false);
  wheelchair(ctx, 112.2, 0, 63.6, 0.4, true);
  ivStand(ctx, 111.4, 0, 54.0, false); ivStand(ctx, 107.6, 0, 52.4, true);
  o2Tank(ctx, 113.4, 0, 57.6, false); o2Tank(ctx, 113.9, 0, 58.0, true);
  for (const [x, z] of [[106.2, 64.6], [106.9, 65.2]]) bioBin(ctx, x, 0, z, R() * TAU);
  if (freeAt(ctx, li, 112.6, 66.0, 0.5)) {
    const g = pool(ctx, 'portgen', () => { const S = new Parts(); S.add('po_gen_yellow', rbox(0.82, 0.58, 0.56, 0.04), M(0, 0.29, 0)); return S; }, 2);
    bindModel(g, 'generator', ['portable_generator', 'portable_generator_dial', 'portable_generator_switch', 'portable_generator_toggle'], { origin: 'base' });
    g.add(M(112.6, 0, 66.0, 0, 0.3, 0));
    solid(ctx, 112.6, 0, 66.0, 0.85, 0.6, 0.6, 'heavy');
    P.add('rubber', tube([new V3(112.9, 0.3, 66.0), new V3(113.4, 0.02, 65.4), new V3(114.6, 0.02, 63.8), new V3(115.5, 0.02, 62.9)], 0.02, { radial: 5 }));
  }
  floodlight(ctx, P, 115.8, 0, 66.6, Math.PI + 0.6, true, zone, 0xdde8ff);
  litter(P, R, 110, 58, 4, 26, ['gauze', 'glove', 'mask', 'form', 'pills', 'tag'], 0.009);
  // 北段:倒地的推床、路錐、救護車停車格
  for (let k = 0; k < 4; k++) cone(ctx, 110.5 + k * 1.6, 0, 37.2 + R.range(-0.2, 0.2), R() * TAU, k === 2);
  for (const z of [22, 27, 32]) line(P, BAND.white, 113.4, z, 117.2, z, 0.12);
  for (const [x, z] of [[108.6, 26.2], [110.8, 33.4]]) manhole(ctx, x, 0, z, R() * TAU);
  for (const z of [24, 36, 52, 66]) drain(ctx, 117.6, 0, z, 0);
  for (let k = 0; k < 14; k++) tarCrack(P, R, R.range(106, 117), R.range(21, 67), R.range(2, 6), R() * TAU, [104.2, 20.2, 117.8, 67.8]);
  groundDecal(P, 'skid', 111, 46.5, 4, 1.4, 1.2, 0.0068);
  crow(ctx, 115.1, 2.66, 44.4, 1.6);
  edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.15, tufts: 3, litter: 0.3, stain: 0.1 });
  scatter(ctx, zone, R, P, { leaves: 0.12, litter: 0.1, puddles: 0.06, stains: 0.08, cracks: 0.03, tufts: 0.03 });
  edgeDress(ctx, zone, R, P, { leaves: 4, ivy: 0.08, tufts: 2, litter: 0.15, stain: 0.12 }); // [scene6]
  finish(ctx, P);
}
// 急診門口雨遮(貼著東外牆,往外伸 1.9m)
function awning(ctx, P, x0, z0, z1, zone) {
  const d = 1.9, y = 3.0, L = z1 - z0, zc = (z0 + z1) / 2;
  P.add('metal_white', box(d, 0.22, L), M(x0 + d / 2, y + 0.11, zc));
  P.add('metal_gray', box(d + 0.04, 0.04, L + 0.04), M(x0 + d / 2, y, zc));
  for (const z of [z0 + 0.3, z1 - 0.3]) P.add('steel', rod(new V3(x0 + 0.02, y + 1.2, z), new V3(x0 + d - 0.05, y + 0.2, z), 0.025, 6));
  P.add('po_label', labelQuad('er_sign', 3.2, 0.8).rotateY(HALF), M(x0 + d + 0.012, y + 0.62, zc));
  P.add('metal_gray', box(0.05, 0.84, 3.24), M(x0 + d - 0.02, y + 0.62, zc));
  for (const z of [z0 + 1.2, zc, z1 - 1.2]) P.add('glow_white', box(0.4, 0.02, 0.4), M(x0 + d / 2, y - 0.01, z));
  ctx.light({ x: x0 + d / 2, y: y - 0.25, z: zc, color: 0xe8f4ff, intensity: 5, distance: 8, kind: 'lamp', flicker: 0, zone: zone.id, glow: 0.6 });
  neonSign(ctx, x0 + 0.03, 4.6, zc, HALF, '急診', { color: '#ff2a20', hex: 0xff2a20, size: 0.9, modes: ['on', 'flicker'], vertical: false, zone });
}

// ======================================================================
// 中庭花園
// ======================================================================
function dressCourtyard(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex;
  // 石板步道(十字):實例化石板,縫隙露出草地
  const slab = pool(ctx, 'paveslab', () => { const S = new Parts(); S.add('po_curb', box(0.92, 0.05, 0.62), M(0, 0.02, 0)); return S; }, 512);
  const lay = (x0, z0, x1, z1, alongX) => {
    for (let a = alongX ? x0 : z0; a < (alongX ? x1 : z1) - 0.3; a += 0.68) for (let b = (alongX ? z0 : x0); b < (alongX ? z1 : x1) - 0.4; b += 0.98) {
      if (R() < 0.05) continue;
      const x = alongX ? a + 0.34 : b + 0.47, z = alongX ? b + 0.47 : a + 0.34;
      if (Math.hypot(x - 60, z - 40) < 2.6) continue;
      slab.add(M(x + R.range(-0.03, 0.03), R.range(-0.012, 0.004), z + R.range(-0.03, 0.03), R.range(-0.015, 0.015), (alongX ? HALF : 0) + R.range(-0.04, 0.04), R.range(-0.015, 0.015)));
    }
  };
  lay(58.1, 30.1, 61.9, 49.9, false);
  lay(44.1, 38.1, 75.9, 41.9, true);
  for (const [a, b, c, d] of [[57.9, 30, 57.9, 37.9], [62.1, 30, 62.1, 37.9], [57.9, 42.1, 57.9, 50], [62.1, 42.1, 62.1, 50]]) strip(P, BAND.mud, [[a, b], [c, d]], 0.35, { us: 3 });
  // 長椅、矮燈柱、枯樹、灌木籬
  for (const [x, z, yaw] of [[55.4, 37.2, Math.PI], [64.6, 42.8, 0], [56.8, 33, HALF], [63.2, 47, -HALF]]) if (freeAt(ctx, li, x, z, 0.6)) bench(ctx, x, 0, z, yaw);
  for (const [x, z, st] of [[56.9, 37, 'dead'], [63.1, 37, 'flicker'], [56.9, 43, 'dead'], [63.1, 43, 'on']]) lamp(ctx, x, 0, z, 0, st, { kind: 'short', zone });
  for (const [x, z] of [[50, 34], [70, 34.5], [49.5, 46], [70.5, 46.2]]) if (freeAt(ctx, li, x, z, 0.6)) tree(ctx, R() < 0.6 ? 'oak' : 'gnarl', x, 0, z, R.range(0.95, 1.2), R() * TAU);
  for (let x = 45; x < 75; x += 1.3) for (const z of [37.3, 42.7]) if (Math.abs(x - 60) > 2.8 && Math.abs(x - 55.4) > 1.2 && Math.abs(x - 64.6) > 1.2 && R() < 0.8) shrub(ctx, x + R.range(-0.2, 0.2), 0, z + R.range(-0.15, 0.15), R.range(0.6, 0.95));
  // 被推到草地上的病床(白布)、點滴架、輪椅
  if (freeRect(ctx, li, 66.6, 31.4, 69.4, 35.4)) { hospitalBed(P, 68, 0, 33.2, 0.4); solid(ctx, 68, 0, 33.2, 1.0, 0.9, 2.1, 'metal'); ivStand(ctx, 69.3, 0, 32.4, false); }
  wheelchair(ctx, 51.2, 0, 44.2, 1.1, false);
  P.add('fabric_blue', box(0.5, 0.02, 0.4), M(55.4, 0.46, 37.15, 0, 0.2, 0)); // 長椅上的病人服
  tuftPatch(ctx, R, 60, 40, 0, 15, 110, { dryP: 0.55, tallP: 0.3 });
  leafPatch(P, R, 60, 40, 15, 260, 0.012);
  crow(ctx, 60, 2.25, 40.1, -1.2);
  edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.45, tufts: 3, litter: 0.1 });
  finish(ctx, P);
}
function hospitalBed(P, x, y, z, yaw) {
  const T = new Parts();
  T.add('metal_white', box(0.95, 0.08, 2.0), M(0, 0.55, 0));
  T.add('po_mattress', rbox(0.88, 0.14, 1.9, 0.05), M(0, 0.66, 0));
  T.add('fabric_white', rbox(0.95, 0.06, 1.7, 0.03), M(0, 0.74, 0.1, 0.02, 0, 0.03));
  for (const s of [-1, 1]) { T.add('metal_white', box(0.95, 0.5, 0.05), M(0, 0.8, s * 1.0)); for (const t of [-1, 1]) { T.add('steel', cyl(0.025, 0.025, 0.5, 6), M(t * 0.42, 0.28, s * 0.92)); T.add('rubber', cyl(0.05, 0.05, 0.04, 8).rotateX(HALF), M(t * 0.42, 0.05, s * 0.92)); } }
  P.merge(T, M(x, y, z, 0, yaw, 0));
  groundDecal(P, 'blood2', x, z, 0.8, 0.8, 0, y + 0.775);
}

// ======================================================================
// 頂樓平台
// ======================================================================
function dressRooftop(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  // 求救字樣(白漆)
  mark(P, 'sos', 33.5, 56.4, 6.4, 3.2, 0, y + 0.012);
  mark(P, 'help', 86, 52.6, 5.2, 2.6, Math.PI, y + 0.012);
  // 倖存者營地:藍色帆布棚、睡袋、空罐、炊具、無線電、信號彈槍
  if (freeRect(ctx, li, 40.2, 57.2, 45.8, 61.8)) {
    const S = new Parts();
    S.add('steel', cyl(0.025, 0.025, 1.8, 6), M(-2, 0.9, -1.2)); S.add('steel', cyl(0.025, 0.025, 1.8, 6), M(2, 0.9, -1.2));
    S.add('po_tarp', new THREE.PlaneGeometry(4.6, 2.8, 8, 4).rotateX(-1.05), M(0, 1.15, -0.25));
    S.add('po_cable', rod(new V3(-2, 1.8, -1.2), new V3(2, 1.8, -1.2), 0.006, 3));
    for (const [a, b] of [[-1.0, 0.0], [0.9, 0.2]]) { S.add('fabric_red', rbox(0.75, 0.12, 1.9, 0.06), M(a, 0.06, b, 0, R.range(-0.2, 0.2), 0)); S.add('fabric_red', rbox(0.6, 0.18, 0.32, 0.08), M(a, 0.1, b - 0.85)); }
    for (let k = 0; k < 9; k++) S.add(k % 3 ? 'aluminum' : 'plastic_red', cyl(0.035, 0.035, 0.11, 8), M(R.range(-1.6, 1.6), k % 2 ? 0.055 : 0.035, R.range(0.6, 1.4), k % 2 ? 0 : HALF, R() * TAU, 0));
    S.add('cast_iron', cyl(0.12, 0.1, 0.12, 10), M(0.2, 0.06, 1.0)); S.add('aluminum', cyl(0.1, 0.1, 0.1, 10), M(0.2, 0.17, 1.0));
    S.add('po_olive', rbox(0.25, 0.14, 0.12, 0.02), M(-1.4, 0.07, 1.1, 0, 0.4, 0));
    S.add('plastic_white', cyl(0.045, 0.045, 0.28, 8), M(1.5, 0.14, 1.2)); S.add('plastic_white', cyl(0.045, 0.045, 0.28, 8), M(1.62, 0.14, 1.05, HALF, 0.3, 0));
    S.add('po_sign', signQuad('lies', 1.2, 0.6), M(0, 0.4, -1.18, -0.25, 0, 0));
    put(ctx, S, 43, y, 59.4, 0);
    solid(ctx, 43, y, 59.4 - 1.2, 4.2, 1.8, 0.4, 'wood');
    litter(P, R, 43, 60.4, 2.4, 16, ['bag', 'cup', 'pack', 'news', 'photo', 'receipt'], y + 0.009);
  }
  // 晾衣繩上的床單(隨風擺)
  if (freeRect(ctx, li, 61.6, 52.2, 74.4, 53.8)) {
    for (const x of [62, 68, 74]) { P.add('steel', cyl(0.03, 0.03, 2.2, 6), M(x, y + 1.1, 53)); solid(ctx, x, y, 53, 0.1, 2.2, 0.1, 'metal'); }
    P.add('po_cable', tube(sagLine(new V3(62, y + 2.05, 53), new V3(74, y + 2.05, 53), 0.25, 16), 0.006, { radial: 3 }));
    for (const x of [63.4, 65.5, 69.8, 72.2]) sheet(ctx, x, y + 2.0, 53, 1.5, 1.6);
  }
  // 屋頂設備:排氣帽、通風管、天線桅杆(紅色航空燈)、衛星天線、避雷針、電纜槽
  for (const [x, z] of [[22, 52.4], [48, 64.4], [72, 64.6], [98, 52.6], [56, 52.4]]) if (freeAt(ctx, li, x, z, 0.4)) { P.add('metal_gray', cyl(0.18, 0.18, 0.8, 12), M(x, y + 0.4, z)); P.add('metal_gray', new THREE.ConeGeometry(0.32, 0.22, 12), M(x, y + 0.92, z)); P.add('metal_gray', cyl(0.3, 0.3, 0.06, 12), M(x, y + 0.82, z)); solid(ctx, x, y, z, 0.4, 1.0, 0.4, 'metal'); }
  if (freeAt(ctx, li, 100.4, 64.6, 0.4)) {
    P.add('steel', cyl(0.06, 0.08, 7, 8), M(100.4, y + 3.5, 64.6));
    for (let k = 0; k < 4; k++) P.add('steel', rod(new V3(100.4, y + 6, 64.6), new V3(100.4 + Math.cos(k * HALF) * 1.5, y, 64.6 + Math.sin(k * HALF) * 1.5), 0.006, 3));
    P.add('glow_red', sph(0.08, 8, 6), M(100.4, y + 7.08, 64.6));
    ctx.light({ x: 100.4, y: y + 7.1, z: 64.6, color: 0xff2010, intensity: 2.5, distance: 6, kind: 'beacon', flicker: 0, zone: zone.id, glow: 0.9 });
    solid(ctx, 100.4, y, 64.6, 0.3, 7, 0.3, 'metal');
  }
  // [scene7] 台灣屋頂的標準配備:不鏽鋼水塔(架高在鐵架上)、一排冷氣室外機(風扇格柵、鏽水痕)、從屋頂邊垂下的電線
  for (const [x, z] of [[95.5, 61.5], [98.2, 61.5]]) if (freeRect(ctx, li, x - 1, z - 1, x + 1, z + 1, true)) {
    const T = new Parts();
    for (const [a, b] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) T.add('steel', box(0.06, 0.8, 0.06), M(a, 0.4, b));
    T.add('steel', box(1.3, 0.06, 1.3), M(0, 0.82, 0));
    T.add('steel', cyl(0.62, 0.62, 1.25, 20), M(0, 1.48, 0)); T.add('steel', new THREE.SphereGeometry(0.62, 20, 6, 0, TAU, 0, 0.5), M(0, 2.1, 0));
    for (const yy of [1.05, 1.5, 1.95]) T.add('cast_iron', cyl(0.63, 0.63, 0.03, 20), M(0, yy, 0)); // 箍
    T.add('steel', cyl(0.035, 0.035, 0.9, 6), M(0.5, 0.45, 0.5)); T.add('cast_iron', cyl(0.06, 0.06, 0.08, 8), M(0, 2.42, 0));
    put(ctx, T, x, y, z, R() * TAU); solid(ctx, x, y, z, 1.35, 2.3, 1.35, 'metal');
  }
  for (let k = 0; k < 4; k++) { const x = 58 + k * 1.15, z = 65.2; if (!freeAt(ctx, li, x, z, 0.4)) continue;
    const C = new Parts();
    C.add('metal_white', box(0.9, 0.65, 0.34), M(0, 0.42, 0)); C.add('cast_iron', cyl(0.24, 0.24, 0.02, 16), M(-0.12, 0.42, 0.172, HALF, 0, 0));
    for (let i = -2; i <= 2; i++) C.add('steel', box(0.5, 0.012, 0.012), M(-0.12, 0.42 + i * 0.08, 0.185));
    C.add('steel', box(0.95, 0.04, 0.42), M(0, 0.07, 0)); C.add('cast_iron', box(0.04, 0.3, 0.004), M(0.3, 0.22, 0.172));
    C.add('cast_iron', cyl(0.012, 0.012, 1.2, 4), M(0.36, 0.6, -0.1, 0.9, 0, 0)); // 冷媒管往牆
    put(ctx, C, x, y, z, Math.PI + R.range(-0.05, 0.05)); solid(ctx, x, y, z, 0.9, 0.75, 0.4, 'metal');
  }
  if (freeAt(ctx, li, 20.4, 64.4, 0.6)) { const S = new Parts(); S.add('metal_white', new THREE.SphereGeometry(0.6, 16, 8, 0, TAU, 0, 0.9).rotateX(-0.9), M(0, 1.2, 0)); S.add('steel', cyl(0.04, 0.04, 1.2, 6), M(0, 0.6, 0)); S.add('steel', rod(new V3(0, 1.0, 0.1), new V3(0, 1.45, 0.62), 0.012, 4)); put(ctx, S, 20.4, y, 64.4, 0.6); solid(ctx, 20.4, y, 64.4, 0.6, 1.6, 0.6, 'metal'); }
  for (const [x0, x1, z] of [[19, 50, 65.3], [62, 101, 52.3]]) { P.add('steel', box(x1 - x0, 0.08, 0.3), M((x0 + x1) / 2, y + 0.18, z)); for (let x = x0; x < x1; x += 2.5) P.add('steel', box(0.05, 0.18, 0.3), M(x, y + 0.09, z)); }
  postSign(ctx, P, 52.6, y, 51.1, 0, 'roof', 0.9, 0.45, 1.7);
  for (const [x, z] of [[30, 60], [70, 62], [90, 56], [60, 54.6]]) puddle(P, R, x, z, R.range(1.0, 1.8), 1.6, 1.0, y + 0.005);
  crow(ctx, 24.5, y + 1.12, 66.9, 0.4);
  crow(ctx, 76, y + 1.12, 66.9, 2.6);
  edgeDress(ctx, zone, R, P, { leaves: 3, ivy: 0, tufts: 2, litter: 0.2, grime: true });
  scatter(ctx, zone, R, P, { leaves: 0.06, litter: 0.06, tufts: 0.05, stains: 0.12, kinds: ['bag', 'news', 'cup', 'receipt', 'tissue'] });
  finish(ctx, P);
}
// 晾著的床單(布料模式隨風擺)
function sheet(ctx, x, y, z, w, h) {
  const g = new THREE.PlaneGeometry(w, h, 8, 8).translate(0, -h / 2, 0);
  const uv = g.attributes.uv; // cloth 模式:uv.x 當擺動權重 → 改成「離繩子的距離」
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getY(i));
  const m = new THREE.Mesh(g, SHEET_MAT());
  m.position.set(x, y, z);
  m.rotation.y = hash(x) * 0.3;
  ctx.add(m, { static: false });
}
let _sheet = null;
const SHEET_MAT = () => _sheet || (_sheet = windify(new THREE.MeshStandardMaterial({ color: 0xc8c6bc, roughness: 1, side: THREE.DoubleSide }), { mode: 'cloth', amp: 0.45 }));

// ======================================================================
// 逃生梯(1F/2F/3F)
// ======================================================================
function dressFireEscape(ctx, zone) {
  const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = ctx.L.levels[li].y;
  const cells = ctx.cells(zone, { allowNearDoor: true });
  for (const cell of cells) {
    if (R() < 0.35) leafPatch(P, R, cell.x, cell.z, 0.6, R.int(2, 6), y + 0.012);
    if (R() < 0.2) litter(P, R, cell.x, cell.z, 0.6, R.int(1, 2), ['pack', 'cup', 'news', 'tissue'], y + 0.009);
  }
  const c0 = cells[(R() * cells.length) | 0];
  if (c0) {
    groundDecal(P, 'butts', c0.x, c0.z, 1.2, 1.2, R() * TAU, y + 0.009);
    if (zone.level === '2F') { groundDecal(P, 'smear', c0.x, c0.z + 0.5, 1.6, 0.7, 0.4, y + 0.01); groundDecal(P, 'hand', c0.x - 0.4, c0.z, 0.4, 0.4, 0.2, y + 0.01); }
    if (zone.level === '3F') { P.add('plastic_black', cyl(0.025, 0.03, 0.2, 8).rotateZ(HALF), M(c0.x + 0.3, y + 0.03, c0.z + 0.2, 0, 0.7, 0)); }
    if (zone.level !== '1F' && freeAt(ctx, li, c0.x, c0.z, 0.3)) { P.add('po_bag_black', lathe([[0, 0], [0.14, 0], [0.17, 0.26], [0.165, 0.26], [0.13, 0.01]], 10), M(c0.x + 0.5, y, c0.z - 0.4)); P.add('leaves_dead', sph(0.14, 8, 6), M(c0.x + 0.5, y + 0.3, c0.z - 0.4)); }
  }
  edgeDress(ctx, zone, R, P, { leaves: 3, ivy: 0.1, tufts: zone.level === '1F' ? 3 : 0, litter: 0.15, grime: zone.level === '1F' });
  finish(ctx, P);
}

// 醫院地圖的手工場景:區域 id 與範圍(rects)都吻合時才用;換地圖或改了版面就退回通用版(generic.js)
const SETPIECES = {
  f1_parking: [dressParking, [[1, 38, 58, 48]]], f1_plaza: [dressPlaza, [[1, 34, 58, 37]]], f1_alley: [dressAlley, [[1, 1, 51, 5]]],
  f1_playground: [dressPlayground, [[52, 1, 58, 9]]], f1_cemetery: [dressCemetery, [[1, 12, 5, 24]]], f1_westyard: [dressYard, [[1, 6, 7, 11], [7, 12, 7, 25], [1, 25, 7, 33]]],
  f1_ambulance: [dressAmbulanceBay, [[52, 10, 58, 33]]], f1_courtyard: [dressCourtyard, [[22, 15, 37, 24]]], f3_roof: [dressRooftop, [[9, 26, 50, 32], [22, 25, 37, 25]]],
};
const theme = (name) => (ctx, zone) => {
  const sp = SETPIECES[zone.id];
  if (sp && JSON.stringify(zone.rects) === JSON.stringify(sp[1])) return sp[0](ctx, zone);
  return GENERIC[name](ctx, zone);
};
export const THEMES = {
  parking: theme('parking'), plaza: theme('plaza'), alley: theme('alley'), playground: theme('playground'), cemetery: theme('cemetery'),
  yard: theme('yard'), ambulance_bay: theme('ambulance_bay'), courtyard: theme('courtyard'), rooftop: theme('rooftop'), fire_escape: dressFireEscape,
  ...BASEMENT,
};
