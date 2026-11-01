import * as THREE from 'three';
import { Parts, M, box, rbox, cyl, sph, tor, rod, beam, gridSurface, smoothNormals, keepUV, animate, startLoop, V3, HALF, lerp, clamp } from './kit.js';
import { placeVehicle, SPECS, strobe } from './vehicles.js';
import { decalUV, labelUV } from './mats.js';

// 車輛擺設:一般廢棄車(血跡/落葉/油漬/碎玻璃/車內雜物)、警車(塗裝 + 警示燈)、救護車(塗裝/車廂/擔架)、
// 撞路燈的救護車、靈車(棺木)、計程車。閃爍燈用動態材質(只在可見時更新)並登記 ctx.light 讓光源池取用。

// ---------- 貼花小工具 ----------
export function groundDecal(P, name, x, z, sx, sz, rot = 0, y = 0.006) {
  const [u, v, w, h] = decalUV(name);
  const g = new THREE.PlaneGeometry(sx, sz).rotateX(-HALF);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * w, v + uv.getY(i) * h);
  g.rotateY(rot).translate(x, y, z);
  P.add('po_decal', keepUV(g));
}
// 標籤平面(po_label 圖集),正面朝 +Z
export function labelQuad(name, w, h) {
  const [u, v, uw, vh] = labelUV(name);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh);
  return keepUV(g);
}
// 本地點 → 世界座標
const toWorld = (obj, x, y, z) => { obj.updateMatrixWorld(true); return new V3(x, y, z).applyMatrix4(obj.matrixWorld); };

// ---------- 閃爍警示燈 ----------
// lenses:[{ geo, color:'red'|'blue'|'white', phase }];回傳加到 parent 的群組
function strobeLenses(parent, lenses, period = 1.6) {
  const mk = (c) => new THREE.MeshStandardMaterial({ color: c === 'red' ? 0x3a0606 : c === 'blue' ? 0x060c3a : 0x2a2a2a, roughness: 0.18, emissive: c === 'red' ? 0xff1a10 : c === 'blue' ? 0x2a56ff : 0xffffff, emissiveIntensity: 0 });
  const g = new THREE.Group();
  for (const l of lenses) {
    const m = new THREE.Mesh(l.geo, mk(l.color));
    m.castShadow = false;
    const base = l.color === 'white' ? 1.6 : 3.2;
    animate(m, (t) => { m.material.emissiveIntensity = base * strobe(t * period / 1.6, l.phase); });
    g.add(m);
  }
  parent.add(g);
  return g;
}
// 車頂警示燈座(靜態部分加進 P;回傳鏡片幾何供閃爍或靜態使用)
function lightBar(P, x, y, len, colors, zc = 0) {
  P.add('rubber', rbox(0.3, 0.07, len, 0.02), M(x, y + 0.035, zc));
  for (const z of [-len * 0.38, len * 0.38]) P.add('rubber', box(0.05, 0.06, 0.06), M(x, y, zc + z));
  const n = colors.length, seg = (len - 0.06) / n, out = [];
  colors.forEach((c, i) => {
    const z = zc - len / 2 + 0.03 + seg * (i + 0.5);
    const geo = rbox(0.26, 0.09, seg - 0.012, 0.03).translate(x, y + 0.115, z);
    out.push({ geo, color: c, z, phase: c === 'red' ? 0 : c === 'blue' ? 0.5 : 0.25 });
  });
  return out;
}
const STATIC_LENS = { red: 'po_taillight', blue: 'po_bluelens', white: 'po_headlight' };

// ---------- 一般廢棄車 ----------
function carDecor(rng, flags) {
  return (car, opt) => {
    const { P, S } = car;
    const hl = S.L / 2;
    // 落葉堆在風擋下緣、引擎蓋、車頂
    if (rng.chance(0.75)) car.topDecal('leaves', S.gh.cowl[0] + 0.25, rng.range(-0.3, 0.3), 0.7, 0.9, rng.range(0, 3));
    if (rng.chance(0.5)) car.topDecal('leaves', lerp(S.gh.ws[0], S.gh.rr[0], 0.5), rng.range(-0.2, 0.2), 0.8, 0.8, rng.range(0, 3));
    if (rng.chance(0.4)) car.topDecal('mud', rng.range(hl - 0.9, hl - 0.4), rng.range(-0.3, 0.3), 0.6, 0.6, rng.range(0, 3));
    // 血跡
    if (flags.blood) {
      const side = rng.chance(0.5) ? 1 : -1;
      car.winDecal('hand', rng.int(0, 1), side, rng.range(0.3, 0.7), rng.range(0.3, 0.7), 0.24);
      if (rng.chance(0.6)) car.winDecal(rng.pick(['blood2', 'drip']), 0, -side, 0.5, 0.6, 0.35);
      const d = S.doors[rng.int(0, S.doors.length - 1)];
      car.sideDecal(rng.pick(['smear', 'blood1', 'drip']), d[0] - 0.05, d[1] + 0.05, 0.45, 0.85, side);
      // 駕駛座上的血
      const fy = car.yf(S.seats.front);
      const [u, v, w, h] = decalUV('pool');
      const g = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-HALF);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * w, v + uv.getY(i) * h);
      P.add('po_decal', keepUV(g), M(S.seats.front + 0.05, fy + 0.345, -0.37));
    }
    // 車內雜物:後座的袋子/紙箱、儀表板上的紙張
    if (S.seats.rear !== undefined && rng.chance(0.6)) {
      const fy = car.yf(S.seats.rear);
      P.add(rng.pick(['cardboard', 'po_bag_black', 'fabric_red', 'po_suitcase']), rbox(0.36, 0.22, 0.28, 0.03), M(S.seats.rear + 0.05, fy + 0.45, rng.range(-0.3, 0.3), 0, rng.range(-0.5, 0.5), 0));
    }
    if (rng.chance(0.5)) P.add('paper', box(0.2, 0.004, 0.28), M(S.dash - 0.1, S.gh.cowl[1] + 0.065, rng.range(-0.2, 0.3), 0, rng.range(-0.6, 0.6), 0));
    if (flags.childSeat && S.seats.rear !== undefined) { // 後座的兒童安全座椅(空的)
      const fy = car.yf(S.seats.rear), x = S.seats.rear, z = 0.38;
      P.add('po_fabric_pink', rbox(0.34, 0.1, 0.38, 0.04), M(x + 0.05, fy + 0.4, z));
      P.add('po_fabric_pink', rbox(0.08, 0.5, 0.38, 0.04), M(x - 0.14, fy + 0.68, z, 0, 0, 0.12));
      P.add('plastic_beige', rbox(0.3, 0.3, 0.05, 0.02), M(x - 0.02, fy + 0.56, z + 0.19));
      P.add('plastic_beige', rbox(0.3, 0.3, 0.05, 0.02), M(x - 0.02, fy + 0.56, z - 0.19));
    }
  };
}
function carGround(rng, flags) {
  return (GP, car) => {
    const { S } = car;
    const hl = S.L / 2;
    if (rng.chance(0.7)) groundDecal(GP, 'oil', S.axF - 0.2 + rng.range(-0.2, 0.2), rng.range(-0.3, 0.3), rng.range(0.8, 1.4), rng.range(0.7, 1.2), rng.range(0, 3));
    for (const w of car.bayPolys) if (w.broken && rng.chance(0.8)) groundDecal(GP, 'shards', lerp(w.poly[0][0], w.poly[1][0], 0.5), (S.W / 2 + rng.range(0.15, 0.5)) * w.side, rng.range(0.6, 1.0), rng.range(0.5, 0.8), rng.range(0, 3));
    if (flags.blood) {
      const side = rng.chance(0.5) ? 1 : -1;
      groundDecal(GP, rng.pick(['pool', 'blood1', 'smear']), rng.range(-0.6, 0.6), (S.W / 2 + rng.range(0.3, 0.8)) * side, rng.range(0.8, 1.4), rng.range(0.6, 1.0), rng.range(0, 3));
      if (rng.chance(0.5)) groundDecal(GP, 'steps', rng.range(-hl, hl) * 0.5, (S.W / 2 + 1.2) * side, 1.6, 0.8, side > 0 ? 0 : Math.PI);
    }
    if (rng.chance(0.4)) groundDecal(GP, 'leaves', rng.range(-hl, hl), (S.W / 2 + rng.range(0.1, 0.5)) * (rng.chance(0.5) ? 1 : -1), 1.0, 1.0, rng.range(0, 3));
  };
}
const CAR_KINDS = ['sedan', 'sedan', 'hatch', 'van', 'sedan', 'hatch', 'van', 'sedan'];
let carIdx = 0;
export function placeCar(ctx, o) {
  const rng = ctx.rng, i = carIdx++;
  const flags = { blood: i % 4 === 1 || rng.chance(0.12), childSeat: i === 5 };
  const kind = i === 9 ? 'taxi' : CAR_KINDS[(i * 3 + 1) % CAR_KINDS.length];
  const extra = { decorate: carDecor(rng, flags), ground: carGround(rng, flags) };
  if (kind === 'taxi') {
    extra.paint = 'po_paint_taxi';
    const dec = extra.decorate;
    extra.decorate = (car, opt) => {
      dec(car, opt);
      const x = lerp(car.S.gh.ws[0], car.S.gh.rr[0], 0.45), y = car.roofY(x) + car.S.crown * 0.8;
      car.P.add('plastic_white', rbox(0.18, 0.15, 0.56, 0.03), M(x, y + 0.08, 0));
      for (const s of [1, -1]) car.P.add('po_label', labelQuad('taxi', 0.5, 0.12).rotateY(s > 0 ? HALF : -HALF), M(x + 0.091 * s, y + 0.085, 0));
    };
  }
  return placeVehicle(ctx, o, kind === 'taxi' ? 'sedan' : kind, extra);
}

// ---------- 警車 ----------
let policeIdx = 0;
export function placePolice(ctx, o, zone) {
  const rng = ctx.rng, flashing = policeIdx++ === 0;
  let bar = null;
  const decorate = (car) => {
    const { S, P } = car, hl = S.L / 2, d0 = S.doors[0], d1 = S.doors[1];
    for (const s of [1, -1]) {
      car.sideDecal('pol_band', hl - 0.55, -hl + 0.3, 0.52, 0.8, s);
      car.sideDecal('pol_text', d0[0] - 0.06, d0[1] + 0.12, 0.74, 0.96, s);
      car.sideDecal('pol_en', d1[0] - 0.06, d1[1] + 0.08, 0.74, 0.94, s);
    }
    car.topDecal('pol_text', hl - 0.75, 0, 0.9, 0.45, -HALF, false, true);
    const x = lerp(S.gh.ws[0], S.gh.rr[0], 0.42), y = car.roofY(x) + S.crown * 0.8;
    bar = lightBar(P, x, y, 1.2, ['red', 'red', 'white', 'blue', 'blue']);
    if (!flashing) for (const l of bar) P.add(STATIC_LENS[l.color], l.geo);
    // 推撞桿
    const fx = hl + 0.08;
    for (const z of [-0.32, 0.32]) P.add('cast_iron', rod(new V3(fx - 0.1, 0.32, z), new V3(fx + 0.02, 0.85, z), 0.025, 8));
    for (const yy of [0.5, 0.78]) P.add('cast_iron', rod(new V3(fx + 0.01 - (0.85 - yy) * 0.2, yy, -0.42), new V3(fx + 0.01 - (0.85 - yy) * 0.2, yy, 0.42), 0.022, 8));
    // 探照燈(駕駛側 A 柱)
    const ax = S.gh.cowl[0] - 0.12, ay = S.gh.cowl[1] + 0.2, az = -(car.zSide(ax, ay) + 0.06);
    P.add('chrome', cyl(0.06, 0.06, 0.1, 12).rotateZ(HALF), M(ax + 0.05, ay, az));
    P.add('po_headlight', cyl(0.055, 0.055, 0.01, 12).rotateZ(HALF), M(ax + 0.105, ay, az));
    P.add('rubber', rod(new V3(ax, ay - 0.05, az + 0.02), new V3(ax - 0.2, ay - 0.08, az + 0.05), 0.012, 6));
  };
  const ground = (GP, car) => {
    const side = rng.chance(0.5) ? 1 : -1;
    if (flashing) { groundDecal(GP, 'chalk', 0.2, (car.S.W / 2 + 1.1) * side, 1.9, 0.95, side > 0 ? 0.2 : Math.PI + 0.2); groundDecal(GP, 'bullets', -1.0, (car.S.W / 2 + 0.6) * -side, 0.5, 0.5); }
    groundDecal(GP, 'oil', 0.6, 0, 1.2, 1.0, rng.range(0, 3));
  };
  const after = (ctx2, car, tilt) => {
    if (!flashing || !bar) return;
    strobeLenses(tilt, bar, 1.6);
    const zn = zone?.id;
    for (const l of bar) if (l.color !== 'white' && Math.abs(l.z) > 0.4) {
      l.geo.computeBoundingBox();
      const c = l.geo.boundingBox.getCenter(new V3()), p = toWorld(tilt, c.x, c.y + 0.15, c.z);
      ctx2.light({ x: p.x, y: p.y, z: p.z, color: l.color === 'red' ? 0xff2018 : 0x2850ff, intensity: 7, distance: 15, kind: 'strobe', flicker: 1, strobe: { hz: 1.6, phase: l.phase }, zone: zn });
    }
    const p = toWorld(tilt, 0, 1, 0);
    startLoop('police_radio', 'radio', { x: p.x, y: p.y, z: p.z });
    ctx2.event({ kind: 'radio', x: p.x, y: o.y, z: p.z, zone: zn });
  };
  return placeVehicle(ctx, o, 'police', { paint: 'po_paint_police', decorate, ground, after, open: flashing ? [1.0, 0, 0, 0] : [0, 0, 0.9, 0], flats: flashing ? [0, 0, 0, 0] : [0, 1, 0, 0], brokenP: 0.15, dent: null, crumple: 0, chromeBumper: false });
}

// ---------- 救護車 ----------
// 擔架(含覆蓋白布的人形)
export function stretcher(P, x0, y0, z0, len = 1.9, bloody = true) {
  const w = 0.56, h = 0.34;
  for (const s of [-1, 1]) {
    P.add('aluminum', rod(new V3(x0 - len / 2, y0 + h, z0 + s * w / 2), new V3(x0 + len / 2, y0 + h, z0 + s * w / 2), 0.016, 8));
    P.add('aluminum', rod(new V3(x0 - len * 0.4, y0 + 0.08, z0 + s * w * 0.45), new V3(x0 + len * 0.35, y0 + h - 0.02, z0 + s * w * 0.45), 0.014, 6));
    P.add('aluminum', rod(new V3(x0 + len * 0.4, y0 + 0.08, z0 + s * w * 0.45), new V3(x0 - len * 0.35, y0 + h - 0.02, z0 + s * w * 0.45), 0.014, 6));
    for (const e of [-0.4, 0.4]) P.add('rubber', cyl(0.05, 0.05, 0.03, 12).rotateX(HALF), M(x0 + e * len, y0 + 0.05, z0 + s * w * 0.45));
  }
  P.add('po_mattress', rbox(len - 0.1, 0.07, w - 0.04, 0.03), M(x0, y0 + h + 0.035, z0));
  // 白布下的人形:高度場
  const nx = 26, nz = 12, rows = [];
  const body = (u, v) => { // u 0..1 沿長邊(頭在 +x)、v -1..1
    const head = Math.exp(-(((u - 0.88) / 0.06) ** 2) - ((v / 0.3) ** 2)) * 0.15;
    const torso = Math.exp(-(((u - 0.62) / 0.16) ** 2) - ((v / 0.55) ** 2)) * 0.2;
    const legs = Math.exp(-(((u - 0.28) / 0.22) ** 2)) * (Math.exp(-(((v - 0.25) / 0.2) ** 2)) + Math.exp(-(((v + 0.25) / 0.2) ** 2))) * 0.1;
    const feet = Math.exp(-(((u - 0.06) / 0.04) ** 2)) * (Math.exp(-(((v - 0.25) / 0.15) ** 2)) + Math.exp(-(((v + 0.25) / 0.15) ** 2))) * 0.15;
    return Math.max(head, torso, legs, feet);
  };
  for (let i = 0; i <= nx; i++) {
    const u = i / nx, r = [];
    for (let j = 0; j <= nz; j++) {
      const v = (j / nz) * 2.4 - 1.2, edge = Math.abs(v) > 1;
      const hh = edge ? -0.12 * (Math.abs(v) - 1) / 0.2 : body(u, v) + 0.012 + 0.006 * Math.sin(u * 40 + v * 7);
      r.push(new V3(x0 + (u - 0.5) * (len - 0.05), y0 + h + 0.07 + Math.max(-0.12, hh), z0 + clamp(v, -1, 1) * (w / 2 + 0.02)));
    }
    rows.push(r);
  }
  P.add('fabric_white', smoothNormals(gridSurface(rows, { flip: true }), 0.4));
  if (bloody) {
    const [u, v, uw, vh] = decalUV('blood1');
    const g = new THREE.PlaneGeometry(0.5, 0.42).rotateX(-HALF);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh);
    P.add('po_decal', keepUV(g), M(x0 + len * 0.13, y0 + h + 0.29, z0 + 0.02));
  }
}
function ambInterior(car, rng, bloody) {
  const { P, S } = car;
  const cabR = S.cab[1], fy = car.yf(cabR + 0.5), zw = car.zSide(cabR + 1, 1.6) - 0.05;
  // 擔架(中間)
  stretcher(P, cabR + 1.2, fy, -0.05, 1.9, bloody);
  // 左側壁櫃(白色,部分櫃門打開)
  const x0 = 0.05, x1 = cabR + 0.35;
  P.add('plastic_white', box(x0 - x1, 0.85, 0.36), M((x0 + x1) / 2, fy + 0.425, -zw + 0.18));
  P.add('plastic_white', box(x0 - x1, 0.5, 0.3), M((x0 + x1) / 2, S.gh.highRoof[1] - 0.38, -zw + 0.15));
  for (let k = 0; k < 5; k++) {
    const x = lerp(x0, x1, (k + 0.5) / 5);
    P.add('po_label', labelQuad('cabinet', 0.3, 0.3).rotateY(0), M(x, fy + 0.5, -zw + 0.362));
    if (rng.chance(0.4)) P.add('plastic_white', box(0.36, 0.42, 0.015), M(x + 0.1, S.gh.highRoof[1] - 0.38, -zw + 0.33, 0, rng.range(0.6, 1.4), 0));
  }
  P.add('rubber', rbox(0.3, 0.2, 0.22, 0.02), M(x0 - 0.3, fy + 0.95, -zw + 0.2)); // 監視器
  P.add('po_label', labelQuad('monitor', 0.2, 0.15), M(x0 - 0.3, fy + 0.96, -zw + 0.312));
  P.add('po_bag_red', rbox(0.42, 0.26, 0.3, 0.06), M(x1 + 0.4, fy + 1.0, -zw + 0.2, 0, 0.3, 0.1));
  // 右側長椅
  const bx0 = -0.35, bx1 = cabR + 0.6;
  P.add('vinyl_seat', rbox(bx0 - bx1, 0.12, 0.42, 0.04), M((bx0 + bx1) / 2, fy + 0.45, zw - 0.22));
  P.add('vinyl_seat', rbox(bx0 - bx1, 0.5, 0.1, 0.04), M((bx0 + bx1) / 2, fy + 0.8, zw - 0.04));
  P.add('plastic_white', box(bx0 - bx1, 0.4, 0.4), M((bx0 + bx1) / 2, fy + 0.2, zw - 0.22));
  // 氧氣鋼瓶(綁在前隔板)
  P.add('po_green_paint', cyl(0.09, 0.09, 1.0, 16), M(0.0, fy + 0.52, zw - 0.15));
  P.add('chrome', cyl(0.03, 0.05, 0.12, 10), M(0.0, fy + 1.08, zw - 0.15));
  P.add('po_label', labelQuad('o2', 0.12, 0.12).rotateY(Math.PI), M(-0.0, fy + 0.7, zw - 0.15 - 0.091));
  // 天花板燈板
  for (const x of [-0.5, -1.7]) P.add('glow_white', box(0.5, 0.02, 0.4), M(x, S.gh.highRoof[1] - 0.06, 0));
  // 地板血跡與散落物
  if (bloody) {
    const [u, v, uw, vh] = decalUV('pool');
    const g = new THREE.PlaneGeometry(0.9, 0.7).rotateX(-HALF);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh);
    P.add('po_decal', keepUV(g), M(cabR + 0.9, fy + 0.008, 0.35));
  }
  P.add('plastic_white', box(0.12, 0.02, 0.2), M(cabR + 0.6, fy + 0.012, 0.4, 0, 0.7, 0));
}
function ambLivery(car) {
  const { S } = car, hl = S.L / 2;
  for (const s of [1, -1]) {
    car.sideDecal('amb_band', hl - 0.45, -hl + 0.05, 0.82, 1.12, s);
    car.sideDecal('amb_text', -0.05, -1.05, 1.18, 1.62, s);
    car.sideDecal('amb_star', -1.45, -2.05, 1.32, 1.92, s);
    car.sideDecal('amb_119', S.doors[0][0] - 0.25, S.doors[0][1] + 0.3, 0.98, 1.38, s);
    car.sideDecal('amb_hosp', -0.25, -2.5, 2.22, 2.58, s);
  }
  car.topDecal('amb_mirror', hl - 0.55, 0, 0.9, 0.42, -HALF, false, true);
}
// 救護車車頂燈:前燈條 + 四角紅燈
function ambLights(car) {
  const { P, S } = car, gh = S.gh, top = gh.highRoof[1];
  const lenses = lightBar(P, gh.highRoof[0] - 0.42, top + 0.01, 1.3, ['red', 'white', 'blue', 'white', 'red']);
  for (const [x, s] of [[gh.highRoof[0] - 0.36, 1], [gh.highRoof[0] - 0.36, -1], [S.cab[1] + 0.06, 1], [S.cab[1] + 0.06, -1]]) {
    const y = top - 0.12, z = (car.zSide(x, y) + 0.02) * s;
    lenses.push({ geo: rbox(0.12, 0.1, 0.06, 0.02).translate(x, y, z), color: x < 0 ? 'red' : 'blue', z, phase: s > 0 ? 0.15 : 0.65 });
  }
  return lenses;
}
let ambIdx = 0;
// 每次重建世界時歸零(同一張地圖每次都得到同樣的車)
export function resetCars() { carIdx = 0; policeIdx = 0; ambIdx = 0; }
export function placeAmbulance(ctx, o, zone, crashed = false) {
  const rng = ctx.rng;
  ambIdx++;
  let lenses = null;
  const decorate = (car) => {
    ambLivery(car);
    lenses = ambLights(car);
    if (crashed) for (const l of lenses) car.P.add(l.color === 'white' ? 'po_headlight' : l.color === 'red' ? 'po_taillight' : 'po_bluelens', l.geo);
    ambInterior(car, rng, true);
  };
  const ground = (GP, car) => {
    const hl = car.S.L / 2;
    groundDecal(GP, 'oil', 1.6, 0.1, 1.4, 1.1, rng.range(0, 3));
    groundDecal(GP, 'pool', -hl - 0.9, 0.2, 1.2, 0.9, rng.range(0, 3));
    groundDecal(GP, 'steps', -hl - 2.2, -0.3, 2.2, 0.9, 0.1);
    if (crashed) { groundDecal(GP, 'skid', hl + 3.2, 0.45, 5, 1.2, 0); groundDecal(GP, 'shards', hl + 0.6, 0, 1.6, 1.4, 0.5); }
  };
  const after = (ctx2, car, tilt) => {
    const p = toWorld(tilt, car.S.cab[1] + 1, 2, 0);
    if (!crashed && lenses) {
      strobeLenses(tilt, lenses, 1.3);
      for (const l of lenses.slice(0, 5)) if (l.color !== 'white') {
        l.geo.computeBoundingBox();
        const c = l.geo.boundingBox.getCenter(new V3()), w = toWorld(tilt, c.x, c.y + 0.2, c.z);
        ctx2.light({ x: w.x, y: w.y, z: w.z, color: l.color === 'red' ? 0xff2018 : 0x2850ff, intensity: 8, distance: 16, kind: 'strobe', flicker: 1, strobe: { hz: 1.3, phase: l.phase }, zone: zone?.id });
      }
    }
    // 車廂燈(故障閃爍)
    ctx2.light({ x: p.x, y: p.y + 0.4, z: p.z, color: 0xd8f0ff, intensity: crashed ? 2 : 4, distance: 6, kind: 'fluoro_dying', flicker: crashed ? 0.9 : 0.6, zone: zone?.id });
    ctx2.event({ kind: crashed ? 'crash_ambulance' : 'stretcher', x: p.x, y: o.y, z: p.z, zone: zone?.id });
  };
  return placeVehicle(ctx, o, 'amb', {
    paint: 'po_paint_amb', decorate, ground, after, rearOpen: crashed ? 0.4 : 2.45, open: crashed ? [0, 0, 1.1, 0] : [0.85, 0, 0, 0], flats: crashed ? [1, 0, 0, 0] : [0, 0, 0, 0],
    crumple: crashed ? 1 : 0, crack: crashed, brokenP: crashed ? 0.5 : 0.1, dent: null, chromeBumper: false, rim: 'steel', flip: crashed ? false : undefined,
  });
}

// ---------- 靈車 ----------
function coffin(P, x0, y0, z0, open = 0.18) {
  const L = 2.0, W = 0.62, H = 0.42;
  P.add('wood_dark', rbox(L, H, W, 0.04), M(x0, y0 + H / 2, z0));
  P.add('wood_dark', rbox(L + 0.04, 0.04, W + 0.04, 0.015), M(x0, y0 + 0.02, z0));
  // 分段棺蓋:腳端蓋好、頭端掀開一角
  P.add('wood_dark', rbox(L * 0.62, 0.12, W + 0.02, 0.05), M(x0 - L * 0.19, y0 + H + 0.06, z0));
  const hinge = M(x0 + L * 0.12, y0 + H + 0.005, z0 - W / 2 - 0.01, 0, 0, 0).multiply(M(0, 0, 0, -open, 0, 0));
  P.add('wood_dark', rbox(L * 0.37, 0.12, W + 0.02, 0.05).translate(L * 0.185, 0.06, W / 2 + 0.01), hinge);
  P.add('fabric_white', box(L * 0.36, 0.01, W - 0.06), M(x0 + L * 0.31, y0 + H - 0.01, z0)); // 內襯
  for (const s of [-1, 1]) for (const f of [-0.32, 0, 0.32]) {
    const x = x0 + f * L;
    P.add('bronze', rod(new V3(x - 0.12, y0 + H * 0.55, z0 + s * (W / 2 + 0.045)), new V3(x + 0.12, y0 + H * 0.55, z0 + s * (W / 2 + 0.045)), 0.012, 6));
    for (const e of [-0.1, 0.1]) P.add('bronze', box(0.025, 0.03, 0.05), M(x + e, y0 + H * 0.55, z0 + s * (W / 2 + 0.02)));
  }
  // 棺上枯萎的花束
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4, r = 0.05 + (k % 5) * 0.03;
    P.add(k % 3 ? 'candle_wax' : 'leaves_dead', sph(0.035 + (k % 4) * 0.008, 6, 5), M(x0 - L * 0.25 + Math.cos(a) * r * 1.6, y0 + H + 0.14 + (k % 3) * 0.015, z0 + Math.sin(a) * r));
  }
  P.add('leaves_dead', box(0.4, 0.02, 0.18), M(x0 - L * 0.25, y0 + H + 0.125, z0, 0, 0.3, 0));
}
export function placeHearse(ctx, o, zone) {
  const rng = ctx.rng;
  const decorate = (car) => {
    const { P, S } = car;
    const deckY = S.deck[1];
    coffin(P, S.cab[1] + 1.15, deckY + 0.02, 0, 0.22);
    // 鍍鉻腰線
    for (const s of [1, -1]) {
      const pts = [];
      for (let x = S.L / 2 - 0.4; x > -S.L / 2 + 0.1; x -= 0.25) pts.push(new V3(x, car.beltAt(x) - 0.03, (car.zBody(x, car.beltAt(x) - 0.03) + 0.006) * s));
      for (let i = 0; i < pts.length - 1; i++) P.add('chrome', beam(pts[i], pts[i + 1], 0.008, 0.018, new V3(0, 0, s)));
    }
  };
  const ground = (GP, car) => {
    const hl = car.S.L / 2;
    groundDecal(GP, 'leaves', -hl - 0.6, 0.3, 1.4, 1.2, 0.4);
    groundDecal(GP, 'oil', 1.5, 0, 1.1, 0.9, 1.2);
    groundDecal(GP, 'wax', -hl - 0.4, -0.5, 0.6, 0.6, 0);
  };
  const after = (ctx2, car, tilt) => {
    const p = toWorld(tilt, car.S.cab[1] + 1.1, 0.9, 0);
    ctx2.event({ kind: 'coffin', x: p.x, y: o.y, z: p.z, zone: zone?.id });
    // 掉在地上的花圈
  };
  return placeVehicle(ctx, o, 'hearse', { paint: 'po_paint_hearse', decorate, ground, after, rearOpen: 1.25, open: [0, 0, 0, 0], flats: [0, 0, 0, 0], brokenP: 0.05, dent: null, crumple: 0, crack: false, chromeBumper: true, rim: 'alloy' });
}
export { SPECS };
