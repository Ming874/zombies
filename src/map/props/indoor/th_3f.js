import { tpl, L, G, THREE } from './parts.js';
import { wheelchair, ivPole } from './medical.js';
import {
  chairOffice, chairWood, deskSteel, deskExec, fileCabinet, bookcase, sofa, bin, deadPlant, framed, posterSheet, corkBoard, wallClock, crucifix, mirror,
  phone, deskLamp, crtMonitor, keyboard, pcTower, printer, wardrobe, shelfRack, tableLong, lockers,
} from './furniture.js';
import { fixedBed, straitjacket, observationWindow } from './equip.js';
import { globe, safeBox, coatRack, portraitFrame, leatherChair, monitorWall, controlConsole, vcrStack, bunkBed, ironBed, washstand, suitcase, kneeler, candleCluster, candelabra, binderRow } from './decor.js';
import { calendar, dosScreen, cctv, poster, drawing, sign } from './art.js';
import { scatter, onSurface, floorDecal, wallDecal, ctpl } from './clutter.js';
import { rotY, bounds, lineUp, litter, registerFlames, noiseScreens, noiseAt } from './lay.js';

// ================================================================ 院長室
export function dressDirector(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), S = R.run('S'), E = R.run('E');
  // 地毯
  const rug = tpl('rug', (b) => { b.box('fab_red', 3.2, 0.008, 2.2, 0, 0.004, 0); b.box('fab_yellow', 3.0, 0.009, 2.0, 0, 0.0045, 0); b.box('fab_red', 2.8, 0.01, 1.8, 0, 0.005, 0); });
  R.put(rug, x0 + 5.6, z0 + 4.2, 0);
  // 大辦公桌(面向門 → 東)+ 皮椅
  const dk = R.tryPut(deskExec(), x0 + 6.6, z0 + 3.4, -Math.PI / 2, {});
  if (dk) {
    const lampP = R.onTop(dk, 0.15, 0.25);
    R.put(deskLamp(0), lampP.x, lampP.z, dk.yaw + 0.3, { y: lampP.y });
    R.light({ x: lampP.x, y: lampP.y + 0.35, z: lampP.z, color: 0xffcc80, intensity: 3, distance: 5, kind: 'lamp', flicker: 0.25 });
    const ph = R.onTop(dk, 0.82, 0.3);
    R.put(phone(1), ph.x, ph.z, dk.yaw - 0.3, { y: ph.y });
    R.event({ kind: 'phone', x: ph.x, y: ph.y, z: ph.z });
    onSurface(R, R.topOf(dk, 0), 'paper', 6);
    onSurface(R, R.topOf(dk, 0), 'file', 2);
    const nm = R.onTop(dk, 0.5, 0.85);
    R.put(tpl('nameplate', (b) => { b.box('wood_dark', 0.26, 0.06, 0.04, 0, 0.03, 0, { rx: -0.3 }); b.plane(L(sign('院長', { w: 128, h: 32, bg: '#c8a040', fg: '#1a1208', size: 0.65 })), 0.22, 0.04, 0, 0.035, 0.022, { rx: -0.3 }); }), nm.x, nm.z, dk.yaw + Math.PI, { y: nm.y });
    R.put(ctpl('mug'), R.onTop(dk, 0.3, 0.7).x, R.onTop(dk, 0.3, 0.7).z, 0, { y: nm.y });
  }
  R.dyn(leatherChair(), x0 + 5.6, z0 + 3.4, Math.PI / 2 + 0.3, { mass: 18, shape: 'box' });
  if (N) lineUp(R, N, [bookcase(1.0, 2.2, 'pi_wood_dark', 0), bookcase(1.0, 2.2, 'pi_wood_dark', 1), { t: bookcase(1.0, 2.2, 'pi_wood_dark', 2), space: 0.3 }], { from: 1.6, gap: 0.03 });
  if (W) { R.atWall(portraitFrame(), W, z0 + 3.4, { mount: 1.45 }); R.atWall(safeBox(0.45), W, z0 + 6.6, { gap: 0.04 }); }
  if (S) { R.atWall(sofa(3, 'leather_brown', 1), S, x0 + 2.8, { gap: 0.05 }); lineUp(R, S, [fileCabinet(4, 3), fileCabinet(4, 2)], { from: 6.0, gap: 0.03 }); }
  R.tryPut(globe(), x0 + 8.8, z0 + 1.0, 0.4, {});
  R.tryPut(coatRack(), x1 - 0.5, z1 - 0.5, 0.3, {});
  if (E) R.atWall(wallClock(0), E, z0 + 1.6, { mount: 2.4 });
  litter(R, [['paper', 14], ['file', 4], ['book', 5], ['crumple', 4], ['butt', 6]]);
  floorDecal(R, 'stain', x0 + 6.0, z0 + 2.4, 1.0);
  floorDecal(R, 'drag', x0 + 7.8, z0 + 5.6, 1.6, { yaw: 1.2 });
}

// ================================================================ 秘書室 / 辦公室
export function dressOffice(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), E = R.run('E'), W = R.run('W'), S = R.run('S');
  const desks = [];
  for (const [x, z, yaw, s] of [[x0 + 1.6, z0 + 1.4, 0, 0], [x0 + 4.4, z0 + 4.4, Math.PI, 1]]) {
    const p = R.tryPut(deskSteel(1.4, 0.72, s), x, z, yaw, {});
    if (!p) continue;
    desks.push(p);
    const v = R.onTop(p, 0.35, 0.35);
    R.put(crtMonitor(s, dosScreen(s ? 'blue' : 'his')), v.x, v.z, p.yaw, { y: v.y });
    const k = R.onTop(p, 0.35, 0.8);
    R.put(keyboard(s), k.x, k.z, p.yaw, { y: k.y });
    const ph = R.onTop(p, 0.85, 0.4);
    R.put(phone(s), ph.x, ph.z, p.yaw + 0.3, { y: ph.y });
    onSurface(R, R.topOf(p, 0), 'paper', 5);
    onSurface(R, R.topOf(p, 0), 'mug', 1);
    const t = R.local(p, -0.55, 0, -0.1);
    R.putChecked(pcTower(s), t.x, t.z, p.yaw);
    R.dyn(chairOffice(s ? 'fab_navy' : 'fab_gray', s), R.local(p, 0, 0, 0.75).x, R.local(p, 0, 0, 0.75).z, p.yaw + Math.PI + R.rand(-0.4, 0.4), { mass: 12, shape: 'box' });
  }
  if (E) lineUp(R, E, [fileCabinet(4, 0), fileCabinet(4, 1), fileCabinet(4, 2)], { from: 0.3, gap: 0.03 });
  if (N) { R.atWall(framed(calendar(), 0.26, 0.36, 'pl_white', { glass: false }), N, x0 + 3.4, { mount: 1.45 }); R.atWall(corkBoard(1.0, 0.7, 1), N, x1 - 1.0, { mount: 1.2 }); }
  if (W) { const pr = tpl('printerstand', (b) => { b.box('enamel_gray', 0.6, 0.7, 0.5, 0, 0.35, 0, { r: 0.01 }); b.surface(-0.25, -0.2, 0.25, 0.2, 0.7); }); const p = R.atWall(pr, W, z0 + 6.2, { gap: 0.03 }); if (p) { const v = R.onTop(p, 0.5, 0.5); R.put(printer(1), v.x, v.z, p.yaw, { y: v.y }); } }
  if (S) R.atWall(bin('office', 0), S, x1 - 1.8, { collide: false });
  litter(R, [['paper', 24], ['paper2', 10], ['paper3', 10], ['file', 6], ['crumple', 8], ['cup', 2]]);
  floorDecal(R, 'stain', x0 + 3, z0 + 3, 1.2);
}

// ================================================================ 精神科隔離房
export function dressPsychCell(R, zone) {
  const n = +zone.id.split('_').pop();
  const { x0, x1, z0, z1 } = bounds(R);
  const E = R.run('E'), W = R.run('W'), S = R.run('S'), N = R.run('N');
  // 固定式病床靠東牆(門在西南)
  if (E) R.atWall(fixedBed(n), E, z0 + 2.0, { gap: 0.02 });
  if (n % 3 !== 1) R.putChecked(straitjacket(), x0 + 1.0, z0 + 5.2, R.rand(0, 6));
  // 牆上抓痕、血手印、塗寫
  for (const run of [E, W, N, S].filter(Boolean)) for (let i = 0; i < 2; i++) wallDecal(R, run, R.rand(run.t0 + 0.3, run.t1 - 0.3), R.rand(0.4, 1.8), R.pick(['scratch', 'scratch', 'hand', 'smear']), R.rand(0.3, 0.55));
  if (n === 4) for (let i = 0; i < 6; i++) wallDecal(R, W || E, R.rand((W || E).t0 + 0.3, (W || E).t1 - 0.3), R.rand(0.3, 2.2), 'scratch', R.rand(0.4, 0.7));
  // 門旁觀察窗(房內側 + 走廊側)
  const door = R.doors.find((d) => d.nz === -1);
  if (door) {
    const wx = door.x + 2 - 0.55, wz = (door.r) * 2; // 門東側那格牆
    R.put(observationWindow(n % 2 ? 0.3 : 0.9), wx, wz, Math.PI, { y: R.y + 1.45 });
    R.put(observationWindow(0.0), wx, wz + 2, 0, { y: R.y + 1.45 });
    R.event({ kind: 'cell_door', x: door.x, y: R.y + 1.2, z: door.z, n });
  }
  const tray = tpl('foodtray', (b) => { b.box('pl_beige', 0.4, 0.02, 0.3, 0, 0.01, 0, { r: 0.006 }); b.cyl('pl_white', 0.07, 0.03, -0.08, 0.035, 0, { seg: 10 }); b.cyl('soil', 0.055, 0.004, -0.08, 0.05, 0, { seg: 8 }); b.box('pl_white', 0.02, 0.004, 0.14, 0.1, 0.022, 0); });
  R.putChecked(tray, x0 + 1.4, z1 - 1.4, R.rand(0, 6));
  litter(R, [['paper', 2], ['crumple', 2], ['pillbottle', n % 2]]);
  floorDecal(R, R.pick(['stain', 'vomit', 'water']), x0 + 1.5, z0 + 4, 1.0);
  if (n === 6) floorDecal(R, 'pool', x0 + 2.4, z0 + 3.0, 0.9);
  // 天花板角落的監視器(朝床)
  const cam = tpl('cellcam', (b) => { b.box('pl_white', 0.08, 0.06, 0.06, 0, 0, 0.03); b.rod('pl_white', 0.01, [0, 0, 0.05], [0, -0.05, 0.12], { seg: 4 }); b.box('pl_white', 0.08, 0.08, 0.18, 0, -0.08, 0.18, { r: 0.02, rx: 0.4 }); b.cyl('glass_dark', 0.025, 0.02, 0, -0.11, 0.27, { axis: 'z', seg: 8 }); });
  if (W) R.atWall(cam, W, z1 - 0.3, { mount: 3.1 });
}

// ================================================================ 監控室
export function dressMonitor(R) {
  const { x0, x1, z0, z1 } = bounds(R);
  const N = R.run('N'), W = R.run('W'), E = R.run('E');
  if (N) {
    const mw = R.atWall(monitorWall(5, 3, 2), N, x0 + 4.4, { gap: 0.02 });
    if (mw) { noiseScreens(R, mw); R.light({ x: x0 + 4.4, y: R.y + 1.7, z: z0 + 1.2, color: 0xa8c8d8, intensity: 3.5, distance: 6, kind: 'monitor', flicker: 0.4 }); R.event({ kind: 'cctv', x: x0 + 4.4, y: R.y + 1.7, z: z0 + 0.8 }); }
    const con = R.atWall(controlConsole(2.6), N, x0 + 4.4, { gap: 0.75 });
    if (con) {
      const v = R.onTop(con, 0.85, 0.4);
      R.put(vcrStack(3), v.x, v.z, con.yaw, { y: v.y });
      onSurface(R, R.topOf(con, 0), 'vhs', 4);
      onSurface(R, R.topOf(con, 0), 'cup', 1);
      R.dyn(chairOffice('fab_gray', 1), x0 + 4.0, z0 + 2.6, Math.PI + 0.4, { mass: 12, shape: 'box' });
    }
  }
  // 錄影帶架 + 桌上一排 CRT
  if (W) { const rk = R.atWall(shelfRack(1.6, 2.0, 0.4, 5, 2), W, z0 + 4.8, { gap: 0.03 }); if (rk) for (let i = 0; i < rk.t.tops.length; i++) if (R.chance(0.8)) { const tp = rk.t.tops[i]; R.putRel(binderRow(+(tp.x1 - tp.x0 - 0.1).toFixed(2), 0.2, 50 + i), rk, (tp.x0 + tp.x1) / 2, tp.y, (tp.z0 + tp.z1) / 2); } }
  if (E) {
    const tb = R.atWall(tableLong(1.8, 0.7, 1), E, z0 + 4.4, { gap: 0.03 });
    if (tb) for (let i = 0; i < 3; i++) {
      const v = R.onTop(tb, 0.2 + i * 0.3, 0.45);
      const scr = i === 1 ? cctv(13) : null;
      R.put(crtMonitor(i, scr), v.x, v.z, tb.yaw, { y: v.y });
      if (i !== 1) noiseAt(R, v.x + Math.sin(tb.yaw) * 0.205, v.y + 0.243, v.z + Math.cos(tb.yaw) * 0.205, tb.yaw, 0.27, 0.2);
    }
  }
  // 亂掉的錄影帶(含拉出的磁帶)
  scatter(R, 'vhs', 26);
  scatter(R, 'tape', 8);
  litter(R, [['paper', 10], ['cup', 3], ['butt', 12], ['crumple', 4]]);
  floorDecal(R, 'stain', x0 + 4, z0 + 3.5, 1.4);
  void x1; void z1;
}

// ================================================================ 修女宿舍(L 形)
export function dressDorm(R) {
  const W = R.run('W', (r) => r.len > 8), E = R.run('E', (r) => r.len > 4 && r.t1 <= 46.1);
  // 直段(x 18-24, z 30-46):西牆一排床(鐵床/上下鋪),東牆衣櫃
  if (W) lineUp(R, W, [rotY(ironBed(0)), { t: rotY(bunkBed(1)), space: 0.6 }, { t: rotY(ironBed(1)), space: 0.6 }, rotY(bunkBed(0))], { from: 0.3, gap: 0.05, space: 0.9 });
  if (E) lineUp(R, E, [wardrobe(1.0, 1, 'pi_wood_oak'), { t: washstand(), space: 1.2 }, wardrobe(1.0, 0, 'pi_wood_dark')], { from: 1.4, gap: 0.04, space: 2.4 });
  // 床邊:跪凳 + 十字架念珠 + 蠟燭
  if (W) for (const t of [W.t0 + 2.6, W.t0 + 8.0]) {
    R.atWall(crucifix(0.5, 0, 'pi_wood_dark'), W, t, { mount: 1.5 });
    R.atWall(rosary(), W, t + 0.18, { mount: 1.55 });
  }
  const p1 = R.putChecked(kneeler(0), 22.2, 34.6, Math.PI / 2);
  void p1;
  const cc = R.putChecked(candleCluster(7, 5, 11), 22.6, 36.2, 0);
  if (cc) { registerFlames(R, cc, { intensity: 3, distance: 5 }); R.event({ kind: 'candles', x: 22.6, y: R.y + 0.15, z: 36.2 }); }
  // 下段(x 24-36, z 46-50):長桌 + 椅子 + 燭台
  const tb = R.tryPut(tableLong(2.0, 0.8, 1), 30.4, 47.6, 0, {});
  if (tb) {
    const v = R.onTop(tb, 0.5, 0.5);
    const cd = R.put(candelabra(3, true), v.x, v.z, 0, { y: v.y });
    registerFlames(R, cd, { intensity: 3, distance: 5 });
    onSurface(R, R.topOf(tb, 0), 'bible', 2);
    for (const dx of [-0.6, 0, 0.6]) R.putChecked(chairWood(1, 'pi_wood_dark'), 30.4 + dx, 48.35, Math.PI + R.rand(-0.15, 0.15));
  }
  const S = R.run('S', (r) => r.t0 >= 23.9);
  if (S) { R.atWall(suitcase(1), S, 34.6, { collide: false }); R.atWall(framed(poster('mary'), 0.4, 0.56, 'gold'), S, 27.0, { mount: 1.4 }); }
  R.dyn(suitcase(0), 20.6, 44.6, 0.7, { mass: 6, shape: 'box' });
  litter(R, [['bible', 3], ['candle_s', 8], ['paper', 6], ['crumple', 2]]);
  floorDecal(R, 'drip', 22.6, 36.2, 0.8);
  floorDecal(R, 'stain', 21.4, 41.0, 1.4);
  for (const run of R.walls.filter((r) => r.len > 3)) if (R.chance(0.5)) wallDecal(R, run, R.rand(run.t0 + 0.4, run.t1 - 0.4), R.rand(0.4, 1.9), R.pick(['mold', 'drip', 'soot']), R.rand(0.4, 0.8));
}
function rosary() {
  return tpl('rosary', (b) => {
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; b.sph('wood_dark', 0.008, Math.sin(a) * 0.07, -0.12 - Math.cos(a) * 0.12, 0.01, { ws: 4, hs: 3 }); }
    b.box('brass', 0.008, 0.06, 0.004, 0, -0.3, 0.01); b.box('brass', 0.035, 0.008, 0.004, 0, -0.285, 0.01);
    b.cyl('brass', 0.004, 0.01, 0, 0, 0.005, { axis: 'z', seg: 4 });
  });
}

export { wheelchair, ivPole, mirror, lockers, deadPlant, posterSheet, drawing };
