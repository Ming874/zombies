import * as THREE from 'three';
import { B, tpl, HALF, L, G, compose } from './geo.js';
import { glowSwatch } from './art.js';

// 共用零件:腳輪、大輪、把手、螺絲、抽屜、門片、通風孔、標籤座…(都直接加進 builder)

// 依種子給一個色票子視窗(同色票、不同髒污)
export function win(seed) {
  const r = (k) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const s = 0.45 + r(1) * 0.45, u = r(2) * (1 - s), v = r(3) * (1 - s);
  return [u, v, u + s, v + s];
}

// 旋轉腳輪(頂端在 y=h,輪子著地);r 輪半徑(約 90 個三角形)
export function caster(b, x, z, h = 0.12, o = {}) {
  const r = o.r ?? h * 0.4, wsurf = o.wheel ?? 'rubber', fork = o.fork ?? 'chrome', yaw = o.yaw ?? 0.4;
  b.push(x, 0, z, 0, yaw, 0);
  b.box(fork, 0.045, 0.008, 0.045, 0, h - 0.004, 0); // 安裝板
  if (h - 2 * r > 0.02) b.cyl(fork, 0.008, h - 2 * r - 0.01, 0, h - (h - 2 * r) / 2 - 0.004, 0, { seg: 5 }); // 旋轉軸
  for (const s of [-1, 1]) b.box(fork, 0.004, r * 1.4, r * 1.4, s * (r * 0.4 + 0.007), r + r * 0.32, -r * 0.25); // 叉架
  b.cyl(wsurf, r, r * 0.7, 0, r, -r * 0.3, { axis: 'x', seg: r > 0.05 ? 8 : 6 });
  if (o.brake) b.box('enamel_red', 0.03, 0.008, 0.035, 0, r * 2 + 0.008, r * 0.9);
  b.pop();
}
// 小型腳墊(取代腳輪,遠處/大量家具用)
export function glide(b, x, z, r = 0.02, h = 0.02, s = 'rubber') { b.cyl(s, r, h, x, h / 2, z, { seg: 6 }); }

// 輪椅大輪:輪胎、輪圈、輻條、手推圈
export function bigWheel(b, x, y, z, R, o = {}) {
  const side = o.side ?? 1;
  b.push(x, y, z);
  b.tor('rubber', R - 0.012, 0.014, 0, 0, 0, { ry: HALF, rs: 5, ts: 22 });
  b.tor(o.rim ?? 'chrome', R - 0.03, 0.008, 0, 0, 0, { ry: HALF, rs: 3, ts: 22 });
  b.cyl('steel', 0.025, 0.06, 0, 0, 0, { axis: 'x', seg: 10 });
  const n = o.spokes ?? 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, off = (i % 2 ? 1 : -1) * 0.012;
    b.rod('chrome', 0.0018, [off, 0, 0], [0, Math.sin(a) * (R - 0.035), Math.cos(a) * (R - 0.035)], { seg: 3 });
  }
  if (o.push !== false) {
    b.tor('chrome', R - 0.045, 0.008, side * 0.035, 0, 0, { ry: HALF, rs: 3, ts: 20 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.rod('chrome', 0.004, [0, Math.sin(a) * (R - 0.045), Math.cos(a) * (R - 0.045)], [side * 0.035, Math.sin(a) * (R - 0.045), Math.cos(a) * (R - 0.045)], { seg: 4 }); }
  }
  b.pop();
}

// 條狀把手(沿 X,中心在 x,y,z,朝 +Z 突出)
export function barHandle(b, x, y, z, w = 0.12, s = 'chrome', o = {}) {
  const d = o.d ?? 0.03, r = o.r ?? 0.006, t = r * 1.6;
  if (o.vertical) {
    b.box(s, t, w, t, x, y, z + d);
    for (const k of [-1, 1]) b.box(s, t * 0.8, t * 0.8, d, x, y + k * (w / 2 - t / 2), z + d / 2);
  } else {
    b.box(s, w, t, t, x, y, z + d);
    for (const k of [-1, 1]) b.box(s, t * 0.8, t * 0.8, d, x + k * (w / 2 - t / 2), y, z + d / 2);
  }
}
// 杯狀拉手(檔案櫃常見)
export function cupPull(b, x, y, z, w = 0.1, s = 'chrome') {
  b.box(s, w, 0.03, 0.012, x, y, z + 0.006, { r: 0.004 });
  b.box('enamel_black', w * 0.85, 0.018, 0.004, x, y - 0.004, z + 0.012);
}
export function knob(b, x, y, z, r = 0.015, s = 'brass') {
  b.cyl(s, r * 0.5, 0.02, x, y, z + 0.01, { axis: 'z', seg: 8 });
  b.sph(s, r, x, y, z + 0.026, { ws: 8, hs: 6, sz: 0.7 });
}
// 螺絲頭(一排)
export function screws(b, pts, r = 0.0045, s = 'steel', axis = 'z') {
  for (const [x, y, z] of pts) b.cyl(s, r, 0.003, x, y, z, { axis, seg: 6 });
}
// 標籤座 + 標籤紙
export function labelHolder(b, x, y, z, w = 0.07, h = 0.025, rect = null) {
  b.box('chrome', w + 0.008, h + 0.006, 0.003, x, y, z + 0.0015, { r: 0.0012 });
  if (rect) b.plane(L(rect), w, h, x, y, z + 0.0032);
  else b.box('paper', w, h, 0.001, x, y, z + 0.0032);
}
// 通風百葉(置物櫃門)
export function louvers(b, x, y, z, w, n, s) {
  for (let i = 0; i < n; i++) b.box(s, w, 0.006, 0.01, x, y + i * 0.016, z + 0.004, { rx: -0.5 });
}
// LED / 指示燈
export function led(b, x, y, z, color = '#30ff60', r = 0.004) {
  b.cyl(G(glowSwatch(color, color)), r, 0.004, x, y, z, { axis: 'z', seg: 6 });
}
// 電源線(地上拖一條)
export function cable(b, pts, r = 0.006, s = 'rubber') { b.tube(s, pts, r, { seg: 5, bend: 0.06 }); }

// 抽屜面板(前面朝 +Z)
export function drawer(b, x, y, z, w, h, s, o = {}) {
  b.box(s, w - 0.006, h - 0.006, 0.02, x, y, z + 0.01, { r: 0.004 });
  if (o.handle === 'cup') cupPull(b, x, y + h * 0.15, z + 0.02, Math.min(0.12, w * 0.4), o.hs ?? 'chrome');
  else if (o.handle === 'knob') knob(b, x, y, z + 0.02, 0.012, o.hs ?? 'brass');
  else if (o.handle !== false) barHandle(b, x, y + (o.hy ?? 0), z + 0.02, Math.min(0.14, w * 0.45), o.hs ?? 'chrome');
  if (o.label) labelHolder(b, x, y + h * 0.32, z + 0.02, Math.min(0.08, w * 0.3), 0.022, o.label === true ? null : o.label);
}

// 門片(鉸鏈在 hingeX 側,open 角度)
export function doorPanel(b, x, y, z, w, h, s, o = {}) {
  const open = o.open ?? 0, hinge = o.hinge ?? -1; // -1 左側鉸鏈
  b.push(x + (hinge * w) / 2, y, z, 0, -hinge * open, 0);
  b.box(s, w - 0.006, h - 0.006, 0.02, (-hinge * w) / 2, 0, 0.01, { r: 0.004 });
  if (o.glass) {
    b.box('glass', w - 0.08, h - 0.08, 0.004, (-hinge * w) / 2, 0, 0.012);
  }
  if (o.handle !== false) barHandle(b, -hinge * (w - 0.05), o.hy ?? 0, 0.02, 0.1, o.hs ?? 'chrome', { vertical: true });
  if (o.louver) louvers(b, (-hinge * w) / 2, h / 2 - 0.16, 0.02, w * 0.6, 6, s);
  b.pop();
}

// 金屬外殼櫃體(開口朝 +Z):w,h,d,s 外殼色票;回傳內部尺寸
export function shell(b, w, h, d, s, o = {}) {
  const t = o.t ?? 0.018, base = o.base ?? 0.06;
  b.bb(s, -w / 2, base, -d / 2, w / 2, h, -d / 2 + t); // 背板
  b.bb(s, -w / 2, base, -d / 2, -w / 2 + t, h, d / 2, { r: 0.003 }); // 側板
  b.bb(s, w / 2 - t, base, -d / 2, w / 2, h, d / 2, { r: 0.003 });
  b.bb(o.top ?? s, -w / 2 - (o.over ?? 0), h - t, -d / 2, w / 2 + (o.over ?? 0), h + (o.topT ?? 0), d / 2 + (o.over ?? 0), { r: 0.004 });
  b.bb(s, -w / 2 + t, base, -d / 2, w / 2 - t, base + t, d / 2);
  if (base > 0.005) b.bb(o.plinth ?? 'enamel_black', -w / 2 + 0.02, 0, -d / 2 + 0.02, w / 2 - 0.02, base, d / 2 - 0.04);
  return { x0: -w / 2 + t, x1: w / 2 - t, y0: base + t, y1: h - t, z0: -d / 2 + t, z1: d / 2 };
}

// 小盒子(紙盒/藥盒)有標籤正面
export function labeledBox(b, x, y, z, w, h, d, s, rect, o = {}) {
  b.box(s, w, h, d, x, y + h / 2, z, { r: o.r ?? 0.002, ry: o.ry || 0 });
  if (rect) b.plane(L(rect), w * 0.94, h * 0.9, x + Math.sin(o.ry || 0) * (d / 2 + 0.0008), y + h / 2, z + Math.cos(o.ry || 0) * (d / 2 + 0.0008), { ry: o.ry || 0 });
}

export { B, tpl, HALF, L, G, compose, THREE };
