import { tpl, L, G, THREE, caster, glide } from './parts.js';
import { hospitalBed, bedTags, nightstand, ivPole, headwall, curtainSet, gurney, wheelchair, supplyCart, crashCart, monitorCart, monitorWall as monArm, oxygenCart } from './medical.js';
import { chairShell, chairWood, stool, bin, deadPlant, sinkWall, posterSheet, framed, wallClock, glassCabinet, lockers, kidChair, kidTable, bookcase, shelfRack } from './furniture.js';
import { opTable, surgicalLight, anesthesiaMachine, mayoStand, backTable, scrubSink, ventilator, pumpStack, incubator, bassinet, changingTable, deliveryBed, infantWarmer } from './equip.js';
import { rockingHorse, doll, dollHead, teddy, toyCar, easel, kidBed, balloon, linenCart, bench } from './decor.js';
import { poster, drawing, sign } from './art.js';
import { scatter, onSurface, floorDecal, wallDecal, ctpl } from './clutter.js';
import { rotY, bounds, lineUp, litter, dynOnTop } from './lay.js';
import { fill } from './th_1f.js';

// ================================================================ 手術部(L 形:北側手術室 + 南側刷手/恢復區)
export function dressSurgery(R) {
  const ceil = R.L.ceilY(R.li, 10, 16) - R.y;
  // 手術室(x 18-24, z 30-40)
  const ox = 21, oz = 35.2;
  R.tryPut(opTable(), ox, oz, 0, {});
  const sl = R.put(surgicalLight(ceil, true), ox, oz - 0.2, 0.4);
  R.light({ x: ox + 0.5, y: R.y + 1.75, z: oz - 0.1, color: 0xfff4e0, intensity: 9, distance: 7, kind: 'surgical', flicker: 0.15 });
  void sl;
  R.tryPut(anesthesiaMachine(), ox - 1.4, oz - 2.0, 0.6, {});
  R.tryPut(mayoStand(0), ox + 1.1, oz + 0.9, -0.4, {});
  R.tryPut(backTable(1.2, 1), ox + 1.6, oz - 2.6, -0.1, {});
  R.tryPut(monitorCart(1), ox - 1.6, oz + 1.6, 0.8, {});
  R.dyn(stool('vinyl_black', 1), ox + 0.9, oz - 0.9, 0, { mass: 6, shape: 'cylinder' });
  R.dyn(bin('kick', 0), ox - 0.9, oz + 1.9, 0, { mass: 5, shape: 'cylinder' });
  R.dyn(ivPole(1), ox - 0.9, oz - 0.9, 0, { mass: 6, shape: 'cylinder' });
  const W1 = R.run('W', (r) => r.t1 <= 40.1), E1 = R.run('E', (r) => r.t1 <= 40.1);
  if (W1) { R.atWall(glassCabinet(0.9, 1.9, 0), W1, 31.2, { gap: 0.03 }); R.atWall(bin('bio', 1), W1, 38.6, { collide: false }); R.atWall(bin('sharps', 1), W1, 38.6, { mount: 1.15 }); }
  if (E1) { R.atWall(supplyCart(0), E1, 32.4, { gap: 0.04 }); R.atWall(posterSheet(sign('無菌區 STERILE', { w: 256, h: 64, bg: '#2a6a4a', fg: '#fff', size: 0.45 }), 0.5, 0.13), E1, 36, { mount: 2.0 }); R.atWall(wallClock(1), E1, 38.4, { mount: 2.4 }); }
  // 血跡紗布、器械
  scatter(R, 'gauze', 28, { near: { x: ox, z: oz, r: 2.0 } });
  scatter(R, 'syringe', 6, { near: { x: ox, z: oz, r: 2.2 } });
  scatter(R, 'glove', 6, { near: { x: ox, z: oz, r: 2.2 } });
  scatter(R, 'ampoule', 10, { near: { x: ox - 1, z: oz - 1.5, r: 1.2 } });
  floorDecal(R, 'pool', ox + 0.4, oz + 0.3, 1.6);
  floorDecal(R, 'splat', ox - 0.6, oz - 0.8, 0.9);
  floorDecal(R, 'drag', ox, oz + 2.4, 1.6, { yaw: 0.1 });
  floorDecal(R, 'feet', ox + 0.4, 38.5, 1.0, { yaw: 0 });
  // 南側:刷手台、恢復區推床
  const S2 = R.run('N', (r) => r.t0 >= 23.9 && r.plane > 44); // 下段北牆(x 24-36)
  if (S2) { R.atWall(scrubSink(1.4), S2, 27.0, { gap: 0.02 }); R.atWall(lockers(3, 0, true), S2, 32.6, { gap: 0.03 }); }
  const S = R.run('S', (r) => r.t0 >= 17.9);
  if (S) { R.atWall(rotY(gurney({ seed: 3, sheet: true, rails: 'up', pillow: true })), S, 28.2, { gap: 0.2 }); R.atWall(rotY(gurney({ seed: 5, sheet: false, rails: 'down' })), S, 32.0, { gap: 0.2 }); }
  const W2 = R.run('W', (r) => r.t0 >= 41.9);
  if (W2) { R.atWall(rotY(linenCart(1)), W2, 44.4, { gap: 0.05 }); R.atWall(sinkWall(1), W2, 47.4, { mount: 0, collide: false }); }
  litter(R, [['paper', 10], ['gauze', 10], ['glove', 4], ['shard', 8], ['bandage', 4]]);
  floorDecal(R, 'drag', 27.5, 48.0, 1.6, { yaw: 1.6 });
  floorDecal(R, 'water', 21, 44, 1.8);
}

// ================================================================ 加護病房(L 形)
export function dressICU(R) {
  const ceil = R.L.ceilY(R.li, 46, 15) - R.y;
  const N = R.run('N', (r) => r.len > 8), E = R.run('E', (r) => r.t0 >= 33.9 && r.len > 4);
  const bay = (run, t, i) => {
    const p = R.atWall(hospitalBed({ kind: i === 2 ? 'body' : i % 2 ? 'messy' : 'made', head: i === 0 ? 0.45 : 0, rail: 'up', seed: i, frame: 'enamel_white' }), run, t, { gap: 0.04 });
    if (!p) return;
    bedTags(R, p, 300 + i);
    R.atWall(headwall(1.4, i), run, t, { mount: 1.32 });
    R.atWall(monArm(i === 2 ? 1 : 0), run, t - 0.85, { mount: 1.8 });
    const v = R.local(p, 0.85, 0, -0.45);
    R.putChecked(ventilator(i), v.x, v.z, p.yaw - Math.PI / 2);
    const w = R.local(p, -0.85, 0, -0.55);
    R.putChecked(pumpStack(3), w.x, w.z, p.yaw);
    const path = [[-1.25, 0], [-1.25, 2.5], [1.25, 2.5], [1.25, 0]];
    const wp = R.at(run, t, 0);
    R.put(tpl(`icucurt:${i}`, (b) => curtainSet(b, path, ceil, { seed: 90 + i, bunch: [0.85, 0.3, 0.0, 0.6][i % 4], holes: 0.4, rag: 0.3 })), wp.x, wp.z, run.yaw);
  };
  if (N) { bay(N, N.t0 + 2.4, 0); bay(N, N.t0 + 5.6, 1); }
  if (E) { bay(E, E.t0 + 4.6, 2); bay(E, E.t0 + 9.6, 3); }
  // 護理站推車、急救車
  const W = R.run('W', (r) => r.t0 >= 33.9);
  if (W) { R.atWall(crashCart(0), W, W.t0 + 1.4, { gap: 0.04 }); R.atWall(supplyCart(1), W, W.t0 + 3.4, { gap: 0.04 }); R.atWall(sinkWall(0), W, W.t1 - 1.2, { mount: 0, collide: false }); }
  R.dyn(ivPole(2), 90.2, 33.0, 0, { mass: 6, shape: 'cylinder' });
  litter(R, [['syringe', 10], ['gauze', 12], ['vial', 8], ['paper', 10], ['glove', 6], ['shard', 6], ['pillbottle', 4]]);
  floorDecal(R, 'pool', 99.0, 42.0, 1.0);
  floorDecal(R, 'smear', 92, 33, 1.4, { yaw: 1.5 });
  R.light({ x: 99, y: R.y + 1.8, z: 38, color: 0x60ff90, intensity: 1.5, distance: 3.5, kind: 'monitor', flicker: 0.25 });
}

// ================================================================ 新生兒室
export function dressNursery(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N');
  // 保溫箱一排(面向北側觀察窗),其中一台燈還亮著
  const lit = 2;
  for (let i = 0; i < 5; i++) {
    const x = x0 + 1.8 + i * 2.25;
    const p = R.tryPut(incubator(i === lit, i), x, z0 + 1.2, Math.PI, {});
    if (p && i === lit) {
      R.light({ x, y: R.y + 1.2, z: z0 + 1.2, color: 0xc8e8ff, intensity: 2.2, distance: 3.5, kind: 'incubator', flicker: 0.4 });
      R.event({ kind: 'incubator', x, y: R.y + 1.1, z: z0 + 1.2 });
    }
  }
  // 嬰兒床第二排
  for (let i = 0; i < 4; i++) {
    const p = R.tryPut(bassinet(i), x0 + 2.8 + i * 2.6, z0 + 4.2, R.rand(-0.1, 0.1), {});
    if (p && i === 1) R.put(teddy('plush_white', 0.6), R.local(p, 0.05, 0, 0).x, R.local(p, 0.05, 0, 0).z, p.yaw, { y: R.y + 0.77 });
  }
  const S = R.run('S'), W = R.run('W'), E = R.run('E');
  if (S) {
    const ct = R.atWall(changingTable(), S, x1 - 2.0, { gap: 0.03 });
    if (ct) { onSurface(R, R.topOf(ct, 0), 'diaper', 3); onSurface(R, R.topOf(ct, 0), 'babybottle', 2); }
    R.atWall(posterSheet(poster('kids'), 0.38, 0.53), S, x0 + 3.0, { mount: 1.4 });
  }
  if (W) { R.atWall(rockingChair(), W, z0 + 6.0, { gap: 0.2 }); R.atWall(babyScale(), W, z0 + 3.4, { gap: 0.04 }); }
  if (E) R.atWall(glassCabinet(0.9, 1.8, 1), E, z0 + 6.6, { gap: 0.03 });
  litter(R, [['babybottle', 8], ['diaper', 6], ['paper', 6], ['shard', 6], ['crumple', 3]]);
  floorDecal(R, 'feet', x0 + 6, z0 + 5.6, 1.0, { yaw: 2.6, v: 1 }); // 小腳印
  floorDecal(R, 'water', x0 + 9, z0 + 6, 1.8);
  R.light({ x: x0 + 1.0, y: R.y + 0.4, z: z1 - 0.5, color: 0xff90b0, intensity: 1.2, distance: 3, kind: 'nightlight', flicker: 0.1 });
}
function rockingChair() {
  return tpl('rockchair', (b) => {
    for (const sx of [-1, 1]) b.tube('pi_wood_dark', [[sx * 0.24, 0.06, -0.45], [sx * 0.24, 0.0, -0.1], [sx * 0.24, 0.0, 0.2], [sx * 0.24, 0.07, 0.45]], 0.02, { seg: 6, bend: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod('pi_wood_dark', 0.016, [sx * 0.24, 0.02, sz * 0.2], [sx * 0.22, 0.42, sz * 0.2], { seg: 5 });
    b.box('pi_wood_dark', 0.48, 0.03, 0.45, 0, 0.43, 0, { r: 0.008 });
    for (let i = -2; i <= 2; i++) b.rod('pi_wood_dark', 0.01, [i * 0.09, 0.45, -0.2], [i * 0.09, 1.0, -0.3], { seg: 4 });
    b.box('pi_wood_dark', 0.5, 0.06, 0.04, 0, 1.02, -0.31, { r: 0.012 });
    b.box('fab_floral', 0.42, 0.05, 0.4, 0, 0.47, 0.01, { r: 0.02 });
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.27, 0, -0.46), new THREE.Vector3(0.27, 1.05, 0.46));
  });
}
function babyScale() {
  return tpl('babyscale', (b) => {
    b.box('enamel_white', 0.6, 0.85, 0.45, 0, 0.425, 0.0, { r: 0.02 });
    b.box('pl_white', 0.55, 0.1, 0.32, 0, 0.92, 0.0, { r: 0.03 });
    b.box('pl_white', 0.5, 0.06, 0.28, 0, 0.98, 0.0, { r: 0.03 }); // 秤盤(弧)
    b.cyl('ceramic', 0.06, 0.02, 0.0, 0.92, 0.17, { axis: 'z', seg: 14 });
    b.box('pl_red', 0.004, 0.05, 0.002, 0.0, 0.93, 0.181, { rz: 1.1 });
    b.surface(-0.22, -0.1, 0.22, 0.1, 1.01);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.23), new THREE.Vector3(0.3, 1.02, 0.23));
  });
}

// ================================================================ 產房
export function dressDelivery(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const ceil = R.L.ceilY(R.li, R.c0 + 2, R.r0 + 1) - R.y;
  const cx = (x0 + x1) / 2 + 0.5, cz = (z0 + z1) / 2;
  R.tryPut(deliveryBed(), cx, cz - 0.3, Math.PI / 2, {});
  R.put(surgicalLight(ceil, false), cx + 0.2, cz - 0.3, 0.9);
  // [scene6] 產房太亮(像展示間):無影燈只剩一顆燈泡微微亮著(暖、低、近),主光源改成保溫台的紅光
  R.light({ x: cx + 0.3, y: R.y + 1.75, z: cz - 0.3, color: 0xffd8b0, intensity: 1.1, distance: 3.6, kind: 'surgical', flicker: 0.3 });
  const N = R.run('N'), S = R.run('S'), E = R.run('E');
  if (E) { const p = R.atWall(infantWarmer(true), E, z0 + 1.5, { gap: 0.04 }); if (p) R.light({ x: x1 - 0.5, y: R.y + 1.9, z: z0 + 1.5, color: 0xff4020, intensity: 2.4, distance: 4.2, kind: 'heater', flicker: 0.05 }); }
  if (N) { R.atWall(glassCabinet(0.9, 1.9, 0), N, x0 + 1.0, { gap: 0.03 }); R.atWall(sinkWall(0), N, x1 - 1.2, { mount: 0, collide: false }); }
  if (S) { R.atWall(monitorCart(0), S, x1 - 1.6, { gap: 0.1 }); R.atWall(bin('bio', 0), S, x0 + 1.4, { collide: false }); }
  R.tryPut(mayoStand(1), cx + 1.6, cz + 0.8, -0.7, {});
  R.dyn(stool('vinyl_black', 0), cx + 1.3, cz - 0.4, 0, { mass: 6, shape: 'cylinder' });
  R.dyn(bin('bucket', 0), cx + 0.6, cz + 0.9, 0, { mass: 3, shape: 'cylinder' });
  R.dyn(ivPole(2), cx - 1.2, cz - 1.1, 0, { mass: 6, shape: 'cylinder' });
  scatter(R, 'gauze', 18, { near: { x: cx + 0.8, z: cz, r: 1.6 } });
  litter(R, [['glove', 6], ['syringe', 4], ['paper', 6], ['shard', 5]]);
  floorDecal(R, 'pool', cx + 0.9, cz - 0.2, 1.6);
  floorDecal(R, 'drag', cx - 1.4, cz + 1.4, 1.6, { yaw: 2.2 });
  floorDecal(R, 'feet', x0 + 2.0, cz + 1.2, 1.2, { yaw: -1.5 });
}

// ================================================================ 小兒科遊戲室
export function dressPlayroom(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const W = R.run('W'), S = R.run('S'), E = R.run('E'), N = R.run('N');
  // 遊戲地墊(拼接泡棉)
  const mat = tpl('playmat', (b) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) b.box(['pl_red', 'pl_blue', 'pl_yellow', 'pl_green'][(i + j) % 4], 0.6, 0.012, 0.6, -0.9 + i * 0.6, 0.006, -0.6 + j * 0.6); });
  R.put(mat, x0 + 4.4, z0 + 4.6, 0.1);
  R.tryPut(kidTable('wood_yellow'), x0 + 8.4, z0 + 3.4, 0.15, {});
  for (const [dx, dz, c, yaw] of [[-0.7, 0, 'pl_red', 1.6], [0.7, 0.1, 'pl_blue', -1.5], [0, -0.6, 'pl_green', 0.1]]) R.dyn(kidChair(c), x0 + 8.4 + dx, z0 + 3.4 + dz, yaw, { mass: 2, shape: 'box' });
  R.tryPut(kidTable('wood_blue'), x0 + 10.6, z0 + 6.2, -0.2, {});
  R.dyn(kidChair('pl_yellow'), x0 + 11.4, z0 + 6.4, -1.2, { mass: 2, shape: 'box' }, { rz: Math.PI / 2, y: R.y + 0.15 });
  R.tryPut(rockingHorse(), x0 + 3.2, z0 + 2.2, 0.7, { collide: false });
  if (W) { const bc = R.atWall(bookcase(1.2, 1.1, 'pi_wood_oak', 2), W, z0 + 5.6, { gap: 0.03 }); void bc; }
  if (E) R.atWall(easel(4), E, z0 + 2.0, { gap: 0.15, collide: false });
  // 牆上的蠟筆畫
  for (const run of [N, S, W].filter(Boolean)) for (let i = 0; i < 3; i++) {
    const t = R.rand(run.t0 + 0.6, run.t1 - 0.6);
    if (R.isWindow(run, t - 0.3, t + 0.3)) continue;
    R.atWall(posterSheet(drawing(R.rng.int(0, 4)), 0.32, 0.23, { curl: R.rand(0, 0.05) }), run, t, { mount: R.rand(0.9, 1.5) });
  }
  // 玩具:積木、球、車、娃娃
  scatter(R, 'block', 40, { colors: [0xd83a2a, 0x2a6ad8, 0x2a9a3a, 0xe8b82a, 0xe8e0d0], area: { x0: x0 + 2.8, x1: x0 + 6.2, z0: z0 + 3.2, z1: z0 + 6.0 } });
  scatter(R, 'crayon', 20, { colors: [0xd83a2a, 0x2a6ad8, 0x2a9a3a, 0xe8b82a, 0x8a3ac8, 0x151515] });
  scatter(R, 'ballx', 4, { colors: [0xd83a2a, 0x2a6ad8, 0xe8b82a] });
  R.dyn(toyCar('pl_red'), x0 + 5.6, z0 + 6.6, 0.8, { mass: 0.4, shape: 'box' });
  R.dyn(toyCar('pl_blue'), x0 + 9.0, z0 + 5.2, 2.2, { mass: 0.4, shape: 'box' });
  R.dyn(teddy('plush_brown', 1), x0 + 2.4, z0 + 6.4, 0.4, { mass: 0.5, shape: 'box' });
  // 娃娃(事件錨點):坐在角落面向門口,頭是獨立物件(可轉)
  const dx = x1 - 0.8, dz = z1 - 0.7;
  R.put(doll(true), dx, dz, -2.4);
  const head = new THREE.Group();
  for (const { mat: m, geo } of dollHead().parts) head.add(new THREE.Mesh(geo, m));
  head.position.set(dx, R.y + 0.21 + 0.05, dz);
  head.rotation.y = -2.4;
  R.ctx.add(head, { static: false });
  R.event({ kind: 'doll', x: dx, y: R.y + 0.25, z: dz, obj: head });
  litter(R, [['paper', 6], ['crumple', 4], ['shard', 4]]);
  floorDecal(R, 'feet', x0 + 6, z0 + 2, 1.1, { yaw: 2.8 });
  R.light({ x: x1 - 0.6, y: R.y + 0.35, z: z0 + 0.5, color: 0xffa0c0, intensity: 1.0, distance: 3, kind: 'nightlight', flicker: 0.2 });
}

// ================================================================ 小兒病房
export function dressPeds(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const E = R.run('E'), S = R.run('S'), N = R.run('N');
  const beds = [];
  if (E) for (const [i, t] of [[0, z0 + 1.3], [1, z0 + 3.9], [2, z0 + 6.6]]) {
    const p = R.atWall(kidBed(i), E, t, { gap: 0.05 });
    if (!p) continue;
    beds.push(p);
    R.atWall(headwall(1.0, i), E, t, { mount: 1.3 });
    // 洩氣氣球綁在床尾欄杆
    const v = R.local(p, 0.3, 0.98, 0.72);
    R.put(balloon(['pl_red', 'pl_yellow', 'pl_blue'][i], i), v.x, v.z, p.yaw, { y: v.y });
    if (i !== 1) { const w = R.local(p, R.rand(-0.15, 0.15), 0.57, 0.1); R.put(teddy(['plush_pink', 'plush_blue', 'plush_brown'][i], 0.8), w.x, w.z, p.yaw + R.rand(-0.5, 0.5), { y: w.y }); }
  }
  if (S) { R.atWall(nightstand(1), S, x0 + 1.2, { gap: 0.04 }); R.atWall(posterSheet(poster('kids'), 0.38, 0.53), S, x0 + 3.2, { mount: 1.3 }); }
  const W = R.run('W', (r) => r.t0 > z0 + 2.5);
  if (W) R.atWall(chairWood(0, 'pi_wood_oak'), W, z1 - 1.0, { gap: 0.1, collide: false });
  if (N) for (let i = 0; i < 2; i++) R.atWall(posterSheet(drawing(i + 1), 0.32, 0.23), N, x0 + 1.2 + i * 0.5, { mount: 1.2 + i * 0.1 });
  R.dyn(ivPole(0), x1 - 2.3, z0 + 2.6, 0, { mass: 5, shape: 'cylinder' });
  R.dyn(teddy('plush_pink', 1), x0 + 2.0, z0 + 3.4, 2.0, { mass: 0.5, shape: 'box' }, { rz: Math.PI / 2, y: R.y + 0.09 });
  litter(R, [['paper', 6], ['crayon', 8], ['block', 6], ['babybottle', 2], ['pillbottle', 2], ['shard', 4]]);
  floorDecal(R, 'water', x0 + 3, z0 + 4.5, 1.6);
  floorDecal(R, 'feet', x0 + 2, z0 + 5.2, 0.9, { yaw: 1.2 });
}

export { lineUp, onSurface, dynOnTop, fill, bench, chairShell, deadPlant, framed, shelfRack, gurney, wheelchair, oxygenCart, glide, caster, L, G };
