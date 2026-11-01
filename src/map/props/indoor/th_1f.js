import { tpl, L, G, THREE } from './parts.js';
import { lobbyColdOpen } from './story.js';
import { gurney, wheelchair, ivPole, oxygenCart, supplyCart, crashCart, monitorCart, monitorWall as monArm, headwall, curtainSet, hospitalBed, bedTags } from './medical.js';
import {
  chairShell, chairOffice, chairWood, stool, tableLong, deskSteel, fileCabinet, lockers, shelfRack, glassCabinet, counter, beamSeats, sofa, bin, deadPlant,
  sinkWall, framed, posterSheet, corkBoard, wallClock, crucifix, mirror, tvWall, waterCooler, magazineRack, phone, crtMonitor, keyboard, pcTower, printer,
} from './furniture.js';
import {
  xrayTable, xrayTube, buckyStand, apronRack, lightbox, leadScreen, xrayConsole, ctGantry, ctCouch, injector, controlWindow, controlDesk,
  parallelBars, plinth, dumbbellRack, trainingStairs, cprDummy, walker,
} from './equip.js';
import {
  pew, altar, kneeler, candleCluster, candelabra, votiveRack, maryStatue, lectern, directoryStand, bigPlanter, queueBox, infoDesk, brochureStand,
  monitorWall, controlConsole, keyCabinet, batonAndLight, steamTable, trayTrolley, boxRow, cardboardBox, bench, extinguisher, wetFloorSign,
} from './decor.js';
import { sign, warnIcon, poster, whiteboard, drugBox, glowSwatch, dosScreen } from './art.js';
import { scatter, onSurface, floorDecal, wallDecal, ctpl } from './clutter.js';
import { rotY, bounds, lineUp, registerFlames, noiseScreens, noiseAt, dynOnTop, litter } from './lay.js';
import { dummyHead } from './heads.js';

// ================================================================ X 光室
export function dressXray(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), E = R.run('E'), S = R.run('S');
  const cx = (x0 + x1) / 2;
  const tbl = R.tryPut(xrayTable(), cx + 0.6, z0 + 3.6, Math.PI / 2, { force: false }) || R.floor(xrayTable(), {});
  R.tryPut(xrayTube(), cx + 0.6, z0 + 2.0, Math.PI, {});
  if (N) R.atWall(buckyStand(), N, x0 + 1.4, { gap: 0.02, collide: true });
  if (W) {
    R.atWall(apronRack(4), W, z0 + 3.4, { mount: 0 });
    R.atWall(lightbox(['chest', 'hand']), W, z0 + 5.6, { mount: 1.55 });
    R.atWall(posterSheet(sign('懷孕或可能懷孕者 請告知放射師', { w: 256, h: 96, bg: '#f0e8c0', fg: '#7a1010', size: 0.22, seed: 3 }), 0.4, 0.15), W, z0 + 1.5, { mount: 1.5 });
  }
  if (E) {
    R.atWall(glassCabinet(0.9, 1.9, 1), E, z0 + 1.0, { gap: 0.03 });
    R.atWall(lightbox(['skull']), E, z0 + 5.4, { mount: 1.55 });
  }
  if (S) {
    R.atWall(xrayConsole(), S, x0 + 1.2, { gap: 0.04 });
    R.atWall(posterSheet(sign('輻射管制區', { w: 256, h: 80, bg: '#e8c020', fg: '#111', size: 0.36, icon: warnIcon, seed: 1 }), 0.42, 0.13), S, x0 + 1.2, { mount: 1.9 });
  }
  R.tryPut(leadScreen(), x0 + 2.4, z1 - 1.4, 0.3, {});
  R.dyn(stool('vinyl_black', 0), x0 + 1.6, z1 - 2.0, 0, { mass: 6, shape: 'cylinder' });
  R.dyn(wheelchair(1), x1 - 1.0, z1 - 1.6, 2.2, { mass: 16, shape: 'box' });
  litter(R, [['paper', 6], ['file', 2], ['shard', 6], ['debris', 3]]);
  // X 光片散落(用檔案夾模型 + 片子)
  for (let i = 0; i < 4; i++) R.I('xfilm', xfilmT(), R.rand(x0 + 1, x1 - 1), R.y + 0.002, R.rand(z0 + 1, z1 - 1), R.rand(0, 6.28));
  floorDecal(R, 'dirt', cx, z0 + 4, 2.2);
  floorDecal(R, 'drag', x0 + 1.4, z0 + 5.2, 1.2, { yaw: 1.2 });
  R.light({ x: x0 + 0.3, y: R.y + 1.6, z: z0 + 5.6, color: 0xd8ecff, intensity: 2.5, distance: 4, kind: 'lightbox', flicker: 0.3 });
  void tbl;
}
const xfilmT = () => tpl('xfilm', (b) => { b.box('film', 0.35, 0.002, 0.43, 0, 0.001, 0); b.meta.cap = 256; });

// ================================================================ 電腦斷層
export function dressCT(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), E = R.run('E');
  const cx = (x0 + x1) / 2;
  // 機台靠北牆中央,床往南伸
  R.tryPut(ctGantry(), cx, z0 + 1.2, 0, {});
  R.tryPut(ctCouch(), cx, z0 + 3.0, 0, {});
  R.tryPut(injector(), cx + 1.5, z0 + 2.3, -0.6, {});
  // 控制區(東南角):觀察窗隔間 + 控制台
  R.tryPut(controlWindow(2.4), x1 - 2.2, z1 - 2.6, 0, {});
  R.tryPut(controlDesk(1.6, 'ct'), x1 - 2.2, z1 - 1.2, Math.PI, {});
  R.dyn(chairOffice('fab_navy', 0), x1 - 2.0, z1 - 1.95, 0.2, { mass: 12, shape: 'box' });
  if (N) R.atWall(posterSheet(sign('檢查中 請勿進入', { w: 256, h: 80, bg: '#c81818', fg: '#fff', size: 0.4, seed: 2 }), 0.42, 0.13), N, x0 + 0.9, { mount: 1.9 });
  if (E) R.atWall(glassCabinet(0.9, 1.9, 0), E, z0 + 1.0, { gap: 0.03 });
  const W = R.run('W');
  if (W) R.atWall(sinkWall(1), W, z0 + 5.6, { mount: 0, collide: false });
  litter(R, [['paper', 5], ['syringe', 3], ['vial', 4], ['shard', 5], ['gauze', 2]]);
  floorDecal(R, 'smear', cx - 0.4, z0 + 4.6, 1.0);
  floorDecal(R, 'water', x0 + 1.4, z1 - 1.6, 1.6);
  R.light({ x: x1 - 2.2, y: R.y + 1.0, z: z1 - 1.0, color: 0x9ad8ff, intensity: 1.6, distance: 3, kind: 'monitor', flicker: 0.2 });
}

// ================================================================ 藥局
export function dressPharmacy(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), E = R.run('E');
  // 北牆:藥架(窗戶之間)+ 玻璃藥櫃
  if (N) {
    for (const t of [x0 + 0.9, x0 + 3.0, x1 - 6.8, x1 - 4.6, x1 - 1.1]) {
      const rk = shelfRack(1.6, 2.1, 0.45, 6, 1);
      const p = R.atWall(rk, N, t, { gap: 0.03 });
      if (p) fillShelves(R, p, 'meds');
    }
  }
  if (W) { const p = R.atWall(glassCabinet(0.9, 1.9, 1), W, z0 + 1.8, { gap: 0.03 }); if (p) fillShelves(R, p, 'bottles'); R.atWall(drugDrawers(), W, z0 + 4.5, { gap: 0.03 }); }
  if (E) { R.atWall(medFridge(), E, z0 + 1.6, { gap: 0.03 }); R.atWall(fileCabinet(4, 2), E, z0 + 3.6, { gap: 0.03 }); }
  // 中島雙面藥架
  for (const [x, z] of [[x0 + 5.5, z0 + 3.4], [x0 + 10.5, z0 + 3.4]]) {
    const rk = shelfRack(2.2, 1.7, 0.6, 5, 0);
    const p = R.tryPut(rk, x, z, 0, {});
    if (p) fillShelves(R, p, 'meds');
  }
  // 領藥櫃台後方:長桌 + 電腦 + 印表機 + 標籤機
  const desk = tpl('pharmdesk', (b) => {
    b.box('pl_cream', 4.6, 0.03, 0.7, 0, 0.75, 0, { r: 0.006 });
    for (const x of [-2.2, 0, 2.2]) b.bb('enamel_gray', x - 0.05, 0, -0.33, x + 0.05, 0.735, 0.33);
    b.bb('enamel_gray', -2.25, 0.3, -0.34, 2.25, 0.7, -0.32);
    b.surface(-2.2, -0.3, 2.2, 0.3, 0.765);
  });
  const dp = R.tryPut(desk, (x0 + x1) / 2, z1 - 0.55, Math.PI, { near: true });
  if (dp) {
    const put = (t, u, yaw = 0) => { const v = R.onTop(dp, u, 0.5); R.put(t, v.x, v.z, dp.yaw + yaw, { y: v.y }); };
    put(crtMonitor(1, dosScreen('his')), 0.18, Math.PI);
    put(keyboard(0), 0.18, Math.PI);
    put(printer(0), 0.42);
    put(crtMonitor(2, dosScreen('blue')), 0.7, Math.PI);
    put(keyboard(1), 0.7, Math.PI);
    put(phone(1), 0.88);
    onSurface(R, R.topOf(dp, 0), 'pillbox', 6);
    onSurface(R, R.topOf(dp, 0), 'paper', 5);
    onSurface(R, R.topOf(dp, 0), 'pillbottle', 4);
    R.event({ kind: 'phone', x: R.onTop(dp, 0.88, 0.5).x, y: R.y + 0.8, z: R.onTop(dp, 0.88, 0.5).z });
    R.dyn(chairOffice('fab_gray', 1), (x0 + x1) / 2 - 1.2, z1 - 1.3, Math.PI + 0.3, { mass: 12, shape: 'box' });
  }
  // 被洗劫:滿地藥盒藥瓶
  litter(R, [['pillbox', 40], ['pillbox2', 25], ['pillbox3', 25], ['pillbottle', 30], ['pillbottle2', 18], ['vial', 20], ['ampoule', 30], ['paper', 14], ['crumple', 6], ['shard', 10]]);
  for (let i = 0; i < 4; i++) R.dyn(cardboardBox(0.45, 0.32, 0.35, i, i % 2 === 0), R.rand(x0 + 2, x1 - 2), R.rand(z0 + 2, z1 - 2.5), R.rand(0, 6), { mass: 3, shape: 'box' });
  R.tryPut(stepStool(), x0 + 3.2, z0 + 1.2, 0.4, {});
  floorDecal(R, 'stain', x0 + 7, z0 + 5, 2.0);
  floorDecal(R, 'feet', x0 + 9, z0 + 5.5, 1.2, { yaw: 1.4 });
  floorDecal(R, 'pool', x0 + 3.6, z0 + 6.2, 0.8);
}
// 層架上擺東西:meds(藥盒)/ bottles(瓶)/ records / supplies
export function fillShelves(R, p, kind, o = {}) {
  for (let i = 0; i < p.t.tops.length; i++) {
    const tp = p.t.tops[i];
    if (R.chance(o.empty ?? 0.12)) continue;
    const w = tp.x1 - tp.x0, d = tp.z1 - tp.z0;
    const nextTop = p.t.tops[i + 1];
    const hmax = Math.min(0.32, (nextTop ? nextTop.y - tp.y : 0.4) - 0.04);
    if (kind === 'records' || kind === 'supplies') {
      const row = boxRowT(w, d, hmax, R.rng.int(0, 9), kind === 'records' ? 'records' : 'supplies');
      R.putRel(row, p, (tp.x0 + tp.x1) / 2, tp.y, (tp.z0 + tp.z1) / 2, 0, 0, 0);
    } else {
      const n = Math.floor(w / (kind === 'meds' ? 0.085 : 0.11)); // [scene7] 藥架要滿:前後兩排、較少空位(實例化,不加 draw call)
      for (let k = 0; k < n * (kind === 'meds' && d > 0.3 ? 2 : 1); k++) {
        if (R.chance(kind === 'meds' ? 0.16 : 0.3)) continue;
        const kk = k % n, row = (k / n) | 0, u = (kk + 0.5) / n, x = tp.x0 + w * u, z = kind === 'meds' && d > 0.3 ? tp.z0 + d * (row ? R.rand(0.62, 0.82) : R.rand(0.18, 0.38)) : tp.z0 + d * R.rand(0.25, 0.75);
        const type = kind === 'bottles' ? R.pick(['pillbottle', 'pillbottle2', 'vial']) : R.pick(['pillbox', 'pillbox2', 'pillbox3']);
        const M = p.M.clone().multiply(new THREE.Matrix4().makeRotationY(kind === 'bottles' ? R.rand(0, 6) : R.rand(-0.15, 0.15)).setPosition(x, tp.y, z));
        R.inst(type, ctpl(type), M);
        if (kind !== 'bottles' && R.chance(0.55)) { const M2 = M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0)); R.inst(type, ctpl(type), M2); }
      }
    }
  }
}
const boxRowT = (w, d, h, seed, kind) => boxRow(+(w.toFixed(2)), +(d.toFixed(2)), +(h.toFixed(2)), seed, kind);
function drugDrawers() {
  return tpl('drugdrawers', (b) => {
    b.box('pi_wood_oak', 1.2, 1.9, 0.45, 0, 0.95, 0.225, { r: 0.006 });
    for (let r = 0; r < 9; r++) for (let c = 0; c < 6; c++) {
      const x = -0.5 + c * 0.2, y = 0.2 + r * 0.19, out = (r * 6 + c) % 11 === 4 ? 0.12 : 0;
      b.box('pi_wood_oak', 0.18, 0.17, 0.02, x, y, 0.455 + out, { r: 0.004 });
      b.box('brass', 0.04, 0.012, 0.015, x, y - 0.03, 0.47 + out);
      b.plane(L(drugBox(r * 6 + c)), 0.08, 0.04, x, y + 0.04, 0.4655 + out);
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.6, 0, 0), new THREE.Vector3(0.6, 1.9, 0.6));
  });
}
function medFridge() {
  return tpl('medfridge', (b) => {
    b.box('enamel_white', 0.7, 1.85, 0.65, 0, 0.925, 0.325, { r: 0.02 });
    b.box('glass', 0.6, 1.5, 0.02, 0, 1.0, 0.655);
    b.box('enamel_white', 0.04, 1.6, 0.03, 0.31, 1.0, 0.67, { r: 0.008 });
    for (let i = 0; i < 4; i++) {
      b.box('chrome', 0.6, 0.01, 0.55, 0, 0.45 + i * 0.35, 0.33);
      for (let k = 0; k < 5; k++) if ((i + k) % 3) b.cyl(['pi_fluid', 'glass_amber', 'pl_white'][k % 3], 0.025, 0.12, -0.24 + k * 0.12, 0.52 + i * 0.35, 0.35, { seg: 8 });
    }
    b.box('enamel_gray', 0.6, 0.2, 0.02, 0, 0.12, 0.66);
    b.plane(G(glowSwatch('fridge_led', '#ff2010')), 0.04, 0.015, 0.25, 1.78, 0.662);
    b.plane(L(sign('2-8°C 喚醒針　冷藏', { w: 192, h: 48, bg: '#e8f0f0', fg: '#1a4a8a', size: 0.42 })), 0.24, 0.06, -0.1, 1.78, 0.662);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.36, 0, 0), new THREE.Vector3(0.36, 1.86, 0.68));
  });
}
function stepStool() {
  return tpl('stepstool', (b) => {
    b.box('enamel_gray', 0.45, 0.025, 0.25, 0, 0.22, 0.1, { r: 0.004 });
    b.box('enamel_gray', 0.45, 0.025, 0.25, 0, 0.44, -0.1, { r: 0.004 });
    for (const sx of [-1, 1]) { b.rod('chrome', 0.012, [sx * 0.2, 0, 0.22], [sx * 0.2, 0.44, -0.2], { seg: 5 }); b.rod('chrome', 0.012, [sx * 0.2, 0, -0.22], [sx * 0.2, 0.44, -0.2], { seg: 5 }); }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.24, 0, -0.24), new THREE.Vector3(0.24, 0.46, 0.24));
  });
}

// ================================================================ 員工餐廳
export function dressCafeteria(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const W = R.run('W'), E = R.run('E'), N = R.run('N');
  if (W) { R.atWall(steamTable(2.6), W, z0 + 2.4, { gap: 0.02 }); }
  // 長桌 2×3
  const tables = [];
  for (const [i, x] of [[0, x0 + 5.2], [1, x0 + 9.4], [2, x0 + 13.6]]) for (const [j, z] of [[0, z0 + 2.9], [1, z0 + 5.4]]) {
    if (i === 2 && j === 0) continue; // 翻倒的餐車放這
    const p = R.tryPut(tableLong(1.8, 0.8, i + j), x + R.rand(-0.15, 0.15), z, R.rand(-0.06, 0.06), {});
    if (!p) continue;
    tables.push(p);
    const top = R.topOf(p, 0);
    onSurface(R, top, 'tray', R.rng.int(1, 3));
    onSurface(R, top, 'cup', R.rng.int(0, 2));
    onSurface(R, top, 'can', R.rng.int(0, 1));
    // 椅子:兩側各 3 張(部分翻倒/被推開 → 可推動)
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
      if (R.chance(0.2)) continue;
      const lx = k * 0.6, lz = s * 0.62;
      const v = R.local(p, lx, 0, lz);
      const off = R.chance(0.3);
      const t = chairShell(R.pick(['pl_orange', 'pl_teal', 'pl_blue']), i + j);
      if (off || R.chance(0.25)) R.dyn(t, v.x + R.rand(-0.3, 0.3), v.z + s * R.rand(0, 0.4), p.yaw + (s > 0 ? Math.PI : 0) + R.rand(-0.6, 0.6), { mass: 4, shape: 'box' }, { rz: off && R.chance(0.5) ? Math.PI / 2 : 0, y: off ? R.y + 0.22 : undefined, force: true });
      else R.putChecked(t, v.x, v.z, p.yaw + (s > 0 ? Math.PI : 0) + R.rand(-0.1, 0.1));
    }
  }
  // 翻倒的餐車 + 散落的餐盤
  const tt = trayTrolley(1);
  const tx = x0 + 13.4, tz = z0 + 2.7;
  R.tryPut(tt, tx, tz, 0.4, { force: false, rz: Math.PI / 2, y: R.y + 0.3 });
  for (let i = 0; i < 9; i++) R.I('tray', ctpl('tray'), tx + R.rand(-1.4, 1.2), R.y, tz + R.rand(-0.6, 1.4), R.rand(0, 6.28), R.chance(0.3) ? Math.PI : 0, 0);
  scatter(R, 'cup', 6, { near: { x: tx, z: tz + 0.5, r: 1.6 } });
  floorDecal(R, 'vomit', tx - 0.8, tz + 1.4, 0.9);
  // 飲水機、垃圾桶、時鐘、菜單
  if (E) { R.atWall(waterCooler(0), E, z0 + 1.2, { gap: 0.04 }); R.atWall(bin('pedal', 0), E, z0 + 2.2, { collide: false }); R.atWall(bin('office', 1), E, z1 - 1.0, { collide: false }); }
  if (N) R.atWall(wallClock(0), N, x0 + 4.2, { mount: 2.4 });
  if (E) R.atWall(posterSheet(poster('blood'), 0.38, 0.53, { curl: 0.06 }), E, z0 + 4.5, { mount: 1.4 });
  litter(R, [['tray', 4], ['cup', 8], ['can', 6], ['paper', 8], ['crumple', 8], ['shard', 8], ['butt', 6]]);
  floorDecal(R, 'stain', x0 + 7.4, z0 + 4.2, 1.8);
  floorDecal(R, 'drag', x0 + 11.6, z0 + 4.0, 1.4, { yaw: 1.7 });
  floorDecal(R, 'water', x0 + 3.2, z0 + 6.4, 1.5);
}

// ================================================================ 復健室
export function dressRehab(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), S = R.run('S');
  R.tryPut(parallelBars(3.2), x0 + 7.5, z0 + 4.4, Math.PI / 2, {});
  if (N) { R.atWall(plinth(0), N, x0 + 2.4, { gap: 0.05 }); R.atWall(rotY(plinth(1)), N, x0 + 12.5, { gap: 0.05 }); }
  if (W) { R.atWall(dumbbellRack(), W, z0 + 4.2, { gap: 0.04 }); R.atWall(mirror(1.2, 1.6, true), W, z0 + 6.5, { mount: 0.5 }); }
  R.tryPut(trainingStairs(), x0 + 12.4, z0 + 5.2, Math.PI / 2, {});
  // CPR 假人(恐怖谷):躺在墊子上,臉朝上
  const cp = R.putChecked(cprDummy(dummyHead()), x0 + 3.6, z0 + 5.6, 0.35);
  if (cp) R.event({ kind: 'cpr_dummy', x: x0 + 3.6, y: R.y + 0.2, z: z0 + 5.3 });
  R.dyn(wheelchair(0), x0 + 15.2, z0 + 2.4, 1.2, { mass: 16, shape: 'box' });
  R.dyn(walker(), x0 + 9.8, z0 + 2.2, 0.4, { mass: 3, shape: 'box' });
  R.dyn(ballT(), x0 + 5.4, z0 + 7.1, 0, { mass: 1.2, shape: 'sphere', restitution: 0.6 });
  if (S) { R.atWall(posterSheet(poster('eye'), 0.36, 0.5), S, x0 + 2.0, { mount: 1.2 }); R.atWall(wallClock(1), S, x0 + 7.2, { mount: 2.4 }); R.atWall(lockers(3, 2, false), S, x0 + 11.6, { gap: 0.03 }); }
  litter(R, [['paper', 6], ['bandage', 3], ['crumple', 4], ['debris', 3]]);
  floorDecal(R, 'feet', x0 + 7.5, z0 + 4.4, 1.0, { yaw: 0 });
  floorDecal(R, 'dirt', x0 + 10, z0 + 3, 2.2);
}
const ballT = () => tpl('gymball', (b) => b.sph('pl_red', 0.32, 0, 0.32, 0, { ws: 16, hs: 12 }));

// ================================================================ 門診候診區(L 形)
export function dressWaiting(R) {
  const A = { x0: 18, x1: 24, z0: 30, z1: 50 }; // 直的那段
  const W = R.run('W', (r) => r.t0 < 40), W2 = R.run('W', (r) => r.t0 >= 40);
  const E = R.run('E', (r) => r.t1 <= 46.1 && r.t0 >= 33);
  // 掛號櫃台(東牆)+ 叫號燈箱 + 電腦
  if (E) {
    const c = R.atWall(counter(3.0, { panel: 'pl_cream' }), E, 39.5, { gap: 0.02 });
    if (c) {
      R.atWall(queueBox('023'), E, 39.5, { mount: 2.3 });
      const v = R.onTop(c, 0.3, 0.3);
      R.put(crtMonitor(0, dosScreen('his')), v.x, v.z, c.yaw + Math.PI, { y: v.y });
      onSurface(R, R.topOf(c, 1), 'paper', 4);
      onSurface(R, R.topOf(c, 0), 'file', 2);
      R.light({ x: E.plane - 0.2, y: R.y + 2.3, z: 39.5, color: 0xff3020, intensity: 1.2, distance: 3, kind: 'sign', flicker: 0.1 });
    }
  }
  // 連排椅:西牆兩段面向東,中間一排背對背
  if (W) lineUp(R, W, [beamSeats(4, 'pl_orange', 0), beamSeats(3, 'pl_orange', 3)], { from: 0.5, gap: 0.05 });
  if (W2) lineUp(R, W2, [beamSeats(3, 'pl_teal', 1)], { from: 1.0, gap: 0.05 });
  R.tryPut(rotY(beamSeats(4, 'pl_teal', 2), -Math.PI / 2), A.x0 + 3.4, 37.2, 0, {});
  // L 形下段:沿南牆一排面北
  const S = R.run('S', (r) => r.t0 >= 23);
  if (S) lineUp(R, S, [beamSeats(4, 'pl_orange', 1), deadPlant(1.2, 1)], { from: 1.0, gap: 0.04 });
  // 電視(西牆高處)
  if (W) { R.atWall(tvWall(1), W, 36.5, { mount: 2.45 }); noiseAt(R, W.plane + 0.69, R.y + 2.58, 36.5, Math.PI / 2, 0.42, 0.3); R.event({ kind: 'tv', x: W.plane + 0.7, y: R.y + 2.5, z: 36.5 }); }
  // 雜誌架、飲水機、盆栽
  const N = R.run('N');
  if (N) { R.atWall(magazineRack(0), N, 19.2, { gap: 0.04 }); R.atWall(deadPlant(1.1, 0), N, 23.2, { gap: 0.1 }); }
  if (W2) R.atWall(waterCooler(1), W2, 49.0, { gap: 0.04 });
  const E2 = R.run('E', (r) => r.t0 >= 46);
  if (E2) R.atWall(deadPlant(1.4, 2), E2, 47, { gap: 0.1 });
  R.atWall(posterSheet(poster('handwash'), 0.4, 0.56), R.run('N') || W, 21.0, { mount: 1.4 });
  if (W) R.atWall(wallClock(1), W, 44, { mount: 2.4 });
  litter(R, [['paper', 14], ['paper2', 6], ['cup', 6], ['crumple', 6], ['butt', 5], ['shard', 6], ['leaf', 10]]);
  floorDecal(R, 'water', 21, 42, 2.2);
  floorDecal(R, 'drag', 22, 46.5, 1.4, { yaw: 1.2 });
  floorDecal(R, 'dirt', 28, 48, 2.0);
  R.dyn(wheelchair(2), 29.5, 47.6, 1.4, { mass: 16, shape: 'box' });
}

// ================================================================ 急診室(L 形)
export function dressER(R) {
  const ceil = R.L.ceilY(R.li, 46, 15) - R.y;
  const N = R.run('N', (r) => r.len > 8); // 橫段北牆
  const E = R.run('E', (r) => r.len > 8); // 直段東牆
  const bays = [];
  // 橫段:沿北牆三床位(擔架床 + 隔簾 + 壁掛監視器)
  if (N) for (const [i, t] of [[0, N.t0 + 2.2], [1, N.t0 + 5.6], [2, N.t0 + 9.0]]) {
    const g = gurney({ seed: i, sheet: i !== 1, rails: i === 2 ? 'up' : 'mixed', bag: i === 0, pillow: i === 2 });
    const p = R.atWall(g, N, t, { gap: 0.25 });
    if (!p) continue;
    bays.push(p);
    R.atWall(monArm(i === 1 ? 1 : 0), N, t - 0.75, { mount: 1.75 });
    R.atWall(headwall(1.1, i), N, t + 0.05, { mount: 1.35 });
    const x = t, wz = N.plane;
    const path = [[x - 1.15, wz], [x - 1.15, wz + 2.6], [x + 1.15, wz + 2.6], [x + 1.15, wz]];
    R.put(tpl(`ercurt:${i}`, (b) => curtainSet(b, path.map(([a, c]) => [a - x, c - wz]), ceil, { seed: 70 + i, bunch: [0.2, 0.75, 0.0][i], holes: i === 0 ? 1.2 : 0.6, rag: 0.8, bottom: 0.4 })), x, wz, 0);
    if (i === 1) { const v = R.local(p, 0.0, 0, 0.6); floorDecal(R, 'pool', v.x + 0.6, v.z, 1.1); R.event({ kind: 'monitor_flatline', x: t - 0.75, y: R.y + 1.7, z: wz + 0.5 }); }
  }
  // 直段:東牆兩床 + 急救車、氧氣、推車
  if (E) {
    for (const [i, t] of [[3, E.t0 + 4.2], [4, E.t0 + 9.8]]) {
      const p = R.atWall(gurney({ seed: i, sheet: true, rails: 'down', bag: true }), E, t, { gap: 0.25 });
      if (p) { bays.push(p); R.atWall(monArm(0), E, t + 0.8, { mount: 1.75 }); }
    }
    R.atWall(crashCart(1), E, E.t0 + 7.0, { gap: 0.04 });
    R.atWall(rotY(oxygenCart(3)), E, E.t1 - 1.0, { gap: 0.04 });
    R.atWall(posterSheet(whiteboard('er'), 1.0, 0.6), E, E.t0 + 7.0, { mount: 1.4 });
  }
  const W = R.run('W', (r) => r.t0 >= 33 && r.len > 6);
  if (W) { R.atWall(supplyCart(0), W, W.t0 + 3.0, { gap: 0.04 }); R.atWall(sinkWall(0), W, W.t0 + 5.2, { mount: 0, collide: false }); R.atWall(bin('bio', 0), W, W.t0 + 6.2, { collide: false }); R.atWall(bin('sharps', 0), W, W.t0 + 6.2, { mount: 1.2 }); }
  R.dyn(ivPole(2), 90.5, 32.6, 0, { mass: 6, shape: 'cylinder' });
  R.dyn(wheelchair(0), 99, 44.5, 2.8, { mass: 16, shape: 'box' }, { rz: Math.PI / 2, y: R.y + 0.3 });
  // 散落的醫療器材與血跡
  litter(R, [['gauze', 26], ['syringe', 14], ['glove', 10], ['vial', 10], ['ampoule', 12], ['bandage', 6], ['paper', 14], ['shard', 12], ['pillbottle', 5], ['crumple', 6]]);
  for (const [k, x, z, s, yaw] of [['drag', 93, 33.4, 2.0, 1.57], ['pool', 98.6, 38, 1.2, 0], ['feet', 99, 41, 1.2, Math.PI], ['smear', 97.5, 46, 1.4, 0.4], ['splat', 87, 33, 0.8, 0], ['pool', 100, 47.5, 0.9, 0], ['drag', 84.6, 32.8, 1.5, 1.4]]) floorDecal(R, k, x, z, s, { yaw });
  for (const run of R.walls.filter((r) => r.len > 2)) if (R.chance(0.5)) wallDecal(R, run, R.rand(run.t0 + 0.4, run.t1 - 0.4), R.rand(0.6, 1.7), R.pick(['hand', 'smear', 'splat', 'drip']), R.rand(0.35, 0.6));
  void bays;
}

// ================================================================ 禮拜堂
export function dressChapel(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const E = R.run('E'), W = R.run('W');
  const zc = (z0 + z1) / 2;
  // 祭壇在東端
  const al = R.tryPut(altar(2.0), x1 - 1.0, zc, -Math.PI / 2, {});
  if (al) {
    for (const u of [0.15, 0.85]) { const v = R.onTop(al, u, 0.5); const p = R.put(candelabra(5, true), v.x, v.z, al.yaw, { y: v.y }); registerFlames(R, p, { intensity: 4, distance: 6 }); }
    const v = R.onTop(al, 0.5, 0.4);
    R.put(ctpl('bible'), v.x, v.z, al.yaw + 0.2, { y: v.y });
  }
  if (E) R.atWall(crucifix(2.2, 1, 'pi_wood_dark'), E, zc, { mount: 1.25 });
  R.tryPut(maryStatue(true), x1 - 1.0, z0 + 0.9, -Math.PI / 2 - 0.3, {});
  const vr = R.tryPut(votiveRack(9), x1 - 1.2, z1 - 0.8, -Math.PI / 2 - 0.2, {});
  if (vr) registerFlames(R, vr, { intensity: 3, distance: 5 });
  R.tryPut(lectern(), x1 - 3.0, z0 + 1.6, -Math.PI / 2 + 0.4, {});
  // 長椅:中央走道兩側,面向東
  for (let i = 0; i < 6; i++) {
    const x = x1 - 4.4 - i * 1.25;
    for (const s of [-1, 1]) {
      const skew = (i === 3 && s > 0) ? 0.35 : (i === 5 && s < 0) ? -0.2 : R.rand(-0.03, 0.03);
      const p = R.tryPut(pew(2.6, i), x, zc + s * 2.05, -Math.PI / 2 + skew, {});
      if (p && R.chance(0.5)) { const v = R.onTop(p, R.rand(0.2, 0.8), 0.5); R.I('bible', ctpl('bible'), v.x, v.y, v.z, R.rand(0, 6)); }
    }
  }
  // 走道中央:地上圍成一圈的蠟燭(儀式感)+ 跪凳
  const cc = R.putChecked(candleCluster(14, 9, 3), x0 + 5.8, zc, 0);
  if (cc) { registerFlames(R, cc, { intensity: 3.5, distance: 5, flicker: 0.8 }); R.event({ kind: 'candles', x: x0 + 5.8, y: R.y + 0.2, z: zc }); }
  R.putChecked(kneeler(1), x0 + 5.8, zc - 0.9, Math.PI);
  if (W) { R.atWall(framed(poster('jesus'), 0.6, 0.84, 'gold'), W, zc, { mount: 1.3 }); }
  const N = R.run('N');
  if (N) { R.atWall(framed(poster('mary'), 0.5, 0.7, 'gold'), N, x0 + 3.5, { mount: 1.5 }); R.atWall(kneeler(0), N, x0 + 8.4, { gap: 0.05, collide: false }); }
  litter(R, [['bible', 5], ['candle_s', 12], ['paper', 8], ['leaf', 6], ['debris', 4]]);
  floorDecal(R, 'drip', x1 - 2.2, zc, 1.0);
  floorDecal(R, 'stain', x0 + 9, zc, 2.0);
  for (const run of R.walls.filter((r) => r.len > 3)) if (R.chance(0.6)) wallDecal(R, run, R.rand(run.t0 + 0.5, run.t1 - 0.5), R.rand(0.4, 2.0), R.pick(['mold', 'soot', 'drip']), R.rand(0.4, 0.8));
}

// ================================================================ 挑高大廳
export function dressLobby(R) {
  const st = R.L.start;
  const W = R.run('W'), E = R.run('E');
  // 服務台(北側中央),朝南
  const desk = R.tryPut(infoDesk(3.2), 60, 57.4, 0, {});
  if (desk) {
    const v = R.onTop(desk, 0.5, 0.5, 0);
    R.put(phone(0), v.x - 0.5, v.z, Math.PI, { y: v.y });
    R.put(crtMonitor(0, dosScreen('his')), v.x + 0.4, v.z, Math.PI, { y: v.y });
    onSurface(R, R.topOf(desk, 1), 'paper', 6);
    R.event({ kind: 'phone', x: v.x - 0.5, y: v.y, z: v.z });
  }
  R.tryPut(directoryStand(), 56.6, 58.8, 0.25, {});
  R.tryPut(brochureStand(), 63.8, 58.6, -0.3, {});
  // 沙發(面向中央)
  R.tryPut(sofa(3, 'vinyl_green', 0), 55.2, 62.4, Math.PI / 2, {});
  R.tryPut(sofa(3, 'vinyl_green', 1), 64.8, 62.4, -Math.PI / 2, {});
  R.tryPut(tableLow(), 57.4, 62.4, 0.1, {});
  // 大型盆栽(角落)
  for (const [x, z] of [[45, 65], [75, 65], [45, 57.2], [75, 57.2], [54.9, 65], [65.1, 65]]) R.tryPut(bigPlanter(Math.round(x)), x, z, R.rand(0, 3), {});
  // 翻倒的輪椅(可推動,側躺)
  R.dyn(wheelchair(1), st.x + 2.4, st.z + 1.2, 2.1, { mass: 16, shape: 'box' }, { rz: Math.PI / 2 - 0.08, y: R.y + 0.31, force: true });
  if (W) R.atWall(bench(1.6), W, 62.5, { gap: 0.05 });
  if (E) R.atWall(bench(1.6), E, 62.5, { gap: 0.05 });
  litter(R, [['leaf', 60], ['paper', 18], ['shard', 30], ['debris', 14], ['rubble', 20], ['cup', 4]]);
  floorDecal(R, 'water', st.x, st.z, 3.0, { v: 2 });
  floorDecal(R, 'drag', 66, 60, 2.2, { yaw: 2.4 });
  floorDecal(R, 'feet', 52, 61, 1.4, { yaw: -1.2 });
  lobbyColdOpen(R); // [scene r4] 冷開場:歡迎回家布條、天窗下的氣球、拖鞋包包花束、柱上的「不要相信廣播」
}
function tableLow() {
  return tpl('lowtable', (b) => {
    b.box('glass', 1.0, 0.012, 0.55, 0, 0.42, 0);
    b.box('chrome', 1.04, 0.02, 0.59, 0, 0.405, 0, { r: 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('chrome', 0.015, 0.4, sx * 0.48, 0.2, sz * 0.25, { seg: 6 });
    b.box('fab_red', 0.2, 0.01, 0.28, 0.2, 0.432, 0.05, { ry: 0.3 });
    b.surface(-0.45, -0.22, 0.45, 0.22, 0.428);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.52, 0, -0.3), new THREE.Vector3(0.52, 0.43, 0.3));
  });
}

// ================================================================ 保全室
export function dressSecurity(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const W = R.run('W'), E = R.run('E'), N = R.run('N');
  if (W) {
    const mw = R.atWall(monitorWall(4, 3, 1), W, (z0 + z1) / 2 - 0.4, { gap: 0.02 });
    if (mw) { noiseScreens(R, mw); R.event({ kind: 'cctv', x: mw.x + 0.4, y: R.y + 1.6, z: mw.z }); R.light({ x: W.plane + 1.0, y: R.y + 1.6, z: (z0 + z1) / 2 - 0.4, color: 0x9ab8c8, intensity: 3, distance: 5, kind: 'monitor', flicker: 0.35 }); }
    const con = R.atWall(controlConsole(2.0), W, (z0 + z1) / 2 - 0.4, { gap: 0.7 });
    if (con) {
      const v = R.onTop(con, 0.3, 0.5);
      R.put(batonAndLight(), v.x, v.z, con.yaw + 0.4, { y: v.y });
      onSurface(R, R.topOf(con, 0), 'mug', 1);
      onSurface(R, R.topOf(con, 0), 'paper', 4);
      R.dyn(chairOffice('fab_navy', 0), x0 + 2.4, (z0 + z1) / 2 + 0.3, Math.PI / 2 + 0.6, { mass: 12, shape: 'box' });
    }
  }
  if (E) { lineUp(R, E, [lockers(3, 1, true), { t: fileCabinet(4, 0), space: 0.3 }], { from: 0.2, gap: 0.03 }); R.atWall(keyCabinet(), E, z1 - 1.4, { mount: 1.35 }); }
  if (N) { R.atWall(corkBoard(1.0, 0.7, 2), N, x0 + 1.8, { mount: 1.2 }); R.atWall(wallClock(0), N, x1 - 1.5, { mount: 2.4 }); }
  const S = R.run('S');
  if (S) R.atWall(waterCooler(0), S, x0 + 1.0, { gap: 0.04 });
  litter(R, [['paper', 10], ['cup', 3], ['butt', 10], ['crumple', 5], ['vhs', 4]]);
  floorDecal(R, 'stain', x0 + 2.4, z0 + 4, 1.4);
  floorDecal(R, 'drag', x0 + 4.4, z0 + 2.4, 1.2, { yaw: 0.6 });
}

export { fillShelves as fill };
