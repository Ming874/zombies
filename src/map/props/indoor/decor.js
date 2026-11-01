import { B, tpl, HALF, L, G, THREE, caster, glide, barHandle, cupPull, knob, drawer, doorPanel, shell, labelHolder, louvers, screws, led, cable } from './parts.js';
import { sign, poster, directory, glowSwatch, flameGrad, cctv, vcrClock, queueDisplay, spines, fileCover, drugBox, menuBoard, floorPlate, portrait, drawing } from './art.js';
import { crtBox } from './furniture.js';

// 宗教、公共空間、保全/監控、宿舍、檔案、洗衣、倉儲、餐廳、兒童用品等道具。

const box3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
const R1 = (seed, k) => { const x = Math.sin(seed * 91.7 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- 禮拜堂
// 長椅(木,側板有弧形、跪凳、聖經架)
export function pew(w = 3.0, seed = 0) {
  return tpl(`pew:${w}:${seed % 2}`, (b) => {
    const wood = seed % 2 ? 'pi_wood_dark' : 'pi_wood_oak';
    b.box(wood, w, 0.045, 0.42, 0, 0.45, 0.02, { r: 0.012 });
    b.box(wood, w, 0.5, 0.035, 0, 0.78, -0.2, { r: 0.01, rx: 0.12 });
    b.box(wood, w, 0.06, 0.05, 0, 1.03, -0.235, { r: 0.015 });
    for (const sx of [-1, 1]) b.ext(wood, [[-0.24, 0, 0.01], [0.24, 0, 0.01], [0.24, 0.6, 0.06], [0.08, 0.66, 0.05], [-0.12, 0.98, 0.1], [-0.27, 1.08, 0.06], [-0.27, 0.5, 0]], 0.06, sx * (w / 2 - 0.03), 0, 0, { ry: -HALF, bevel: 0.008 });
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.9) b.box(wood, 0.05, 0.42, 0.04, x, 0.21, 0.0);
    // 背面:聖經架 + 跪凳(給後一排用)
    b.box(wood, w - 0.1, 0.02, 0.12, 0, 0.82, -0.29, { rx: -0.1 });
    b.box(wood, w - 0.1, 0.1, 0.012, 0, 0.87, -0.35);
    b.box('fab_red', w - 0.1, 0.07, 0.2, 0, 0.12, -0.55, { r: 0.025 });
    for (const sx of [-1, 1]) b.rod(wood, 0.015, [sx * (w / 2 - 0.08), 0.1, -0.45], [sx * (w / 2 - 0.08), 0.1, -0.3], { seg: 5 });
    b.surface(-w / 2 + 0.1, -0.15, w / 2 - 0.1, 0.18, 0.475);
    b.meta.coll = box3(-w / 2, 0, -0.66, w / 2, 1.06, 0.24);
  });
}
// 祭壇(石/木桌 + 祭壇布 + 金色燭台)
export function altar(w = 2.0) {
  return tpl(`altar:${w}`, (b) => {
    b.box('marble', w, 0.95, 0.75, 0, 0.475, 0, { r: 0.015 });
    b.box('marble', w + 0.1, 0.06, 0.85, 0, 0.98, 0, { r: 0.015 });
    b.box('fab_white', w + 0.12, 0.012, 0.87, 0, 1.016, 0);
    b.plane('fab_white', w + 0.12, 0.35, 0, 0.84, 0.436);
    b.box('fab_red', 0.4, 0.004, 0.9, 0, 1.024, 0); // 祭帶
    b.plane('fab_red', 0.4, 0.5, 0, 0.77, 0.438);
    b.box('gold', 0.16, 0.004, 0.004, 0, 0.75, 0.441); b.box('gold', 0.004, 0.2, 0.004, 0, 0.75, 0.441);
    b.box('marble', w + 0.4, 0.15, 1.4, 0, -0.075 + 0.075, 0.2, { r: 0.01 }); // 台階
    b.surface(-w / 2, -0.35, w / 2, 0.35, 1.022);
    b.meta.coll = box3(-w / 2 - 0.05, 0, -0.43, w / 2 + 0.05, 1.03, 0.43);
  });
}
// 跪凳(prie-dieu)
export function kneeler(seed = 0) {
  return tpl(`kneeler:${seed % 2}`, (b) => {
    const wood = 'pi_wood_dark';
    b.box(wood, 0.55, 0.05, 0.3, 0, 0.12, 0.15, { r: 0.01 });
    b.box('fab_red', 0.5, 0.06, 0.24, 0, 0.17, 0.15, { r: 0.025 });
    for (const sx of [-1, 1]) b.box(wood, 0.04, 0.85, 0.04, sx * 0.24, 0.425, -0.12, { r: 0.006 });
    b.box(wood, 0.55, 0.04, 0.22, 0, 0.86, -0.05, { r: 0.008, rx: -0.3 });
    b.box(wood, 0.5, 0.5, 0.02, 0, 0.55, -0.13);
    b.surface(-0.22, -0.13, 0.22, 0.04, 0.89);
  });
}
// 蠟燭(單根,高 h,半徑 r);會被燭台/群組使用
function candle(b, x, y, z, h, r = 0.022, s = 'wax', melted = 0) {
  b.cyl(s, r, h, x, y + h / 2, z, { seg: 8 });
  if (melted) for (let i = 0; i < 3; i++) { const a = i * 2.1 + melted; b.cyl(s, r * 0.25, h * 0.4, x + Math.cos(a) * r, y + h * 0.75, z + Math.sin(a) * r, { seg: 4, r2: r * 0.12 }); }
  b.cyl('pl_black', 0.0015, 0.012, x, y + h + 0.006, z, { seg: 3 });
}
function flame(b, x, y, z, s = 1) {
  b.lathe(G(flameGrad()), [[0, 0], [0.006 * s, 0.006 * s], [0.008 * s, 0.016 * s], [0.004 * s, 0.03 * s], [0, 0.04 * s]], x, y, z, { seg: 6 });
}
// 地上一群蠟燭(lit:亮著的數量);回傳火焰位置(給燈光登記)
export function candleCluster(n = 9, lit = 5, seed = 0) {
  const t = tpl(`candles:${n}:${lit}:${seed}`, (b) => {
    const flames = [];
    for (let i = 0; i < n; i++) {
      const a = R1(seed, i) * Math.PI * 2, d = Math.sqrt(R1(seed, i + 50)) * 0.35;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.05 + R1(seed, i + 9) * 0.22, r = 0.018 + R1(seed, i + 19) * 0.02;
      candle(b, x, 0, z, h, r, i % 4 === 0 ? 'wax_red' : 'wax', R1(seed, i + 30) > 0.5 ? i : 0);
      b.cyl('wax', r * 2.2, 0.006, x, 0.003, z, { seg: 8 }); // 蠟淚攤
      if (i < lit) { flame(b, x, h + 0.008, z); flames.push([x, h + 0.03, z]); }
    }
    b.meta.flames = flames;
  });
  return t;
}
// 燭台(黃銅,多臂)
export function candelabra(arms = 5, lit = true) {
  return tpl(`candelabra:${arms}:${lit}`, (b) => {
    b.lathe('brass', [[0, 0], [0.12, 0], [0.12, 0.02], [0.05, 0.05], [0.025, 0.12], [0.02, 0.9], [0.035, 0.92], [0, 0.94]], 0, 0, 0, { seg: 12 });
    const flames = [];
    for (let i = 0; i < arms; i++) {
      const x = (i - (arms - 1) / 2) * 0.12, y = 0.92 + (arms - 1 - Math.abs(i - (arms - 1) / 2) * 2) * 0.03;
      if (x) b.tube('brass', [[0, 0.8, 0], [x * 0.7, 0.82, 0], [x, y - 0.06, 0]], 0.008, { seg: 5, bend: 0.04 });
      b.cyl('brass', 0.025, 0.02, x, y - 0.05, 0, { seg: 8 });
      candle(b, x, y - 0.04, 0, 0.16, 0.012, 'wax', i);
      if (lit && i % 2 === 0) { flame(b, x, y + 0.13, 0, 0.8); flames.push([x, y + 0.15, 0]); }
    }
    b.meta.flames = flames;
  });
}
// 點燭架(還願燭,階梯式,紅色玻璃杯)
export function votiveRack(lit = 7) {
  return tpl(`votive:${lit}`, (b) => {
    const flames = [];
    for (let r = 0; r < 3; r++) {
      b.box('iron', 1.2, 0.03, 0.18, 0, 0.75 + r * 0.14, 0.12 - r * 0.12);
      for (let i = 0; i < 8; i++) {
        const x = -0.52 + i * 0.15, y = 0.765 + r * 0.14, z = 0.12 - r * 0.12;
        b.cyl('glass_amber', 0.03, 0.07, x, y + 0.035, z, { seg: 8, open: true });
        b.cyl('wax_red', 0.028, 0.02, x, y + 0.01, z, { seg: 8 });
        if ((i * 3 + r * 5) % 24 < lit * 1.0 && flames.length < lit) { flame(b, x, y + 0.03, z, 0.7); flames.push([x, y + 0.05, z]); }
      }
    }
    for (const sx of [-1, 1]) b.box('iron', 0.03, 1.05, 0.5, sx * 0.62, 0.525, 0.0);
    b.box('iron', 0.2, 0.25, 0.1, 0.5, 0.4, 0.25, { r: 0.01 }); // 投錢箱
    b.meta.flames = flames;
    b.meta.coll = box3(-0.64, 0, -0.25, 0.64, 1.1, 0.25);
  });
}
// 聖母像(石膏,站在台座上;臉被布蓋住 / 流血淚)
export function maryStatue(veiled = false) {
  return tpl(`mary:${veiled}`, (b) => {
    b.box('marble', 0.5, 0.9, 0.5, 0, 0.45, 0, { r: 0.02 });
    b.box('marble', 0.58, 0.06, 0.58, 0, 0.93, 0, { r: 0.01 });
    b.push(0, 0.96, 0);
    b.lathe('plaster', [[0, 0], [0.2, 0], [0.2, 0.05], [0.17, 0.4], [0.13, 0.8], [0.1, 1.05], [0.07, 1.12], [0, 1.14]], 0, 0, 0, { seg: 14 }); // 長袍
    b.lathe('enamel_blue', [[0.13, 1.08], [0.17, 0.9], [0.21, 0.5], [0.23, 0.08], [0.21, 0.04]], 0, 0, -0.01, { seg: 14, p0: Math.PI * 0.6, pl: Math.PI * 1.8 }); // 藍色披風
    b.sph('plaster', 0.075, 0, 1.22, 0.01, { sy: 1.15, ws: 12, hs: 10 });
    if (veiled) b.sph('fab_white', 0.095, 0, 1.2, 0.01, { sy: 1.4, ws: 10, hs: 8 });
    else { b.box('meat', 0.004, 0.06, 0.004, -0.025, 1.18, 0.07); b.box('meat', 0.004, 0.08, 0.004, 0.025, 1.17, 0.07); }
    for (const sx of [-1, 1]) b.rod('plaster', 0.025, [sx * 0.1, 0.95, 0.04], [sx * 0.04, 0.82, 0.16], { seg: 6 }); // 雙手合十
    b.tor('gold', 0.12, 0.006, 0, 1.36, -0.03, { rx: 0.2, rs: 3, ts: 16 }); // 光環
    b.pop();
    b.meta.coll = box3(-0.29, 0, -0.29, 0.29, 2.4, 0.29);
  });
}
// 讀經台
export function lectern() {
  return tpl('lectern', (b) => {
    b.box('pi_wood_dark', 0.5, 0.06, 0.4, 0, 0.03, 0, { r: 0.01 });
    b.box('pi_wood_dark', 0.16, 1.0, 0.16, 0, 0.55, 0, { r: 0.01 });
    b.box('pi_wood_dark', 0.6, 0.04, 0.45, 0, 1.12, 0.02, { r: 0.01, rx: -0.35 });
    b.box('leather_black', 0.36, 0.05, 0.26, 0, 1.17, 0.03, { r: 0.004, rx: -0.35 });
    b.box('paper', 0.33, 0.045, 0.24, 0.005, 1.18, 0.035, { rx: -0.35 });
    b.box('fab_red', 0.02, 0.003, 0.3, 0.05, 1.15, 0.2, { rx: 1.0 });
    b.meta.coll = box3(-0.3, 0, -0.22, 0.3, 1.25, 0.26);
  });
}

// ---------------------------------------------------------------- 大廳 / 候診
export function directoryStand() {
  return tpl('dirstand', (b) => {
    b.box('enamel_dark', 0.7, 0.04, 0.4, 0, 0.02, 0, { r: 0.01 });
    for (const sx of [-1, 1]) b.box('enamel_dark', 0.04, 1.75, 0.04, sx * 0.3, 0.9, 0);
    b.box('enamel_dark', 0.66, 0.95, 0.04, 0, 1.25, 0, { r: 0.008 });
    b.plane(L(directory()), 0.6, 0.86, 0, 1.25, 0.021);
    b.meta.coll = box3(-0.36, 0, -0.2, 0.36, 1.8, 0.2);
  });
}
export function bigPlanter(seed = 0) {
  return tpl(`bigplanter:${seed % 2}`, (b) => {
    b.box('stone', 0.75, 0.6, 0.75, 0, 0.3, 0, { r: 0.03 });
    b.box('soil', 0.68, 0.02, 0.68, 0, 0.59, 0);
    // 枯死的棕櫚
    b.tube('bark', [[0, 0.58, 0], [0.04, 1.2, 0.02], [0.02, 1.9, 0.05]], 0.06, { seg: 8, bend: 0.3, rEnd: 0.04 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seed, l = 0.7 + R1(seed, i) * 0.5, droop = 0.6 + R1(seed, i + 7) * 0.9;
      const p0 = [0.02, 1.88, 0.05], p1 = [Math.cos(a) * l * 0.5, 1.95 - droop * 0.2, Math.sin(a) * l * 0.5], p2 = [Math.cos(a) * l, 1.9 - droop, Math.sin(a) * l];
      b.tube('leaf_dead', [p0, p1, p2], 0.012, { seg: 4, bend: 0.2, rEnd: 0.004 });
      for (let k = 1; k < 5; k++) { const t = k / 5; b.box('leaf_dead', 0.3 * (1 - t * 0.5), 0.004, 0.035, p0[0] + (p2[0] - p0[0]) * t, p0[1] + (p2[1] - p0[1]) * t - 0.06, p0[2] + (p2[2] - p0[2]) * t, { ry: -a, rz: 0.7 }); }
    }
    for (let i = 0; i < 6; i++) b.box('leaf_dead', 0.25, 0.004, 0.04, R1(seed, i + 3) * 0.9 - 0.45, 0.004, R1(seed, i + 13) * 0.9 - 0.45, { ry: i }); // 落葉在地上
    b.meta.coll = box3(-0.38, 0, -0.38, 0.38, 0.6, 0.38);
  });
}
// 叫號燈箱(壁掛),背面 z=0
export function queueBox(num = '023') {
  return tpl(`queuebox:${num}`, (b) => {
    b.box('enamel_dark', 0.7, 0.3, 0.1, 0, 0, 0.05, { r: 0.01 });
    b.plane(G(queueDisplay(num)), 0.62, 0.23, 0, 0, 0.101);
    b.box('enamel_dark', 0.06, 0.25, 0.04, 0, 0.27, 0.02);
  });
}
// 服務台(弧形)
export function infoDesk(w = 3.2) {
  return tpl(`infodesk:${w}`, (b) => {
    const R = w * 0.75, n = 12, ang = 0.9;
    for (let i = 0; i < n; i++) {
      const a0 = -ang + (i / n) * 2 * ang, a1 = -ang + ((i + 1) / n) * 2 * ang, am = (a0 + a1) / 2;
      const seg = 2 * R * Math.sin((a1 - a0) / 2) + 0.01;
      const x = Math.sin(am) * R, z = Math.cos(am) * R - R + 0.4;
      b.box('pi_wood_oak', seg, 1.05, 0.06, x, 0.6, z, { ry: am });
      b.box('marble', seg, 0.04, 0.38, x - Math.sin(am) * 0.12, 1.12, z - Math.cos(am) * 0.12, { ry: am });
      b.box('enamel_black', seg, 0.08, 0.05, x - Math.sin(am) * 0.02, 0.04, z - Math.cos(am) * 0.02, { ry: am });
    }
    b.box('pi_wood_oak', w * 0.8, 0.03, 0.7, 0, 0.75, -0.45);
    b.plane(L(sign('服務台 INFORMATION', { w: 320, h: 56, bg: '#20282a', fg: '#d8c890', size: 0.5 })), 0.9, 0.16, 0, 0.82, 0.432);
    b.surface(-0.6, -0.7, 0.6, -0.2, 0.765);
    b.surface(-0.8, 0.15, 0.8, 0.33, 1.14);
    b.meta.coll = box3(-w / 2, 0, -0.85, w / 2, 1.15, 0.45);
  });
}
export function brochureStand() {
  return tpl('brochure', (b) => {
    b.box('steel', 0.3, 0.02, 0.3, 0, 0.01, 0);
    b.cyl('steel', 0.012, 1.3, 0, 0.66, 0, { seg: 6 });
    for (let i = 0; i < 4; i++) {
      b.box('pi_clear', 0.24, 0.12, 0.05, 0, 0.6 + i * 0.18, 0.04, { r: 0.004, rx: -0.2 });
      b.plane(L(poster(['handwash', 'blood', 'kids', 'quiet'][i])), 0.2, 0.26, 0, 0.66 + i * 0.18, 0.05, { rx: -0.2 });
    }
  });
}

// ---------------------------------------------------------------- 保全 / 監控
// 監視螢幕牆:cols×rows 台 CRT(畫面:監控影像或雜訊),背面 z=0;noiseIdx 為雜訊畫面的索引(另以實例化動態雜訊覆蓋)
export function monitorWall(cols = 4, rows = 3, seed = 0) {
  return tpl(`monwall2:${cols}:${rows}:${seed}`, (b) => {
    const cw = 0.5, rh = 0.42, w = cols * cw;
    b.box('enamel_dark', w + 0.1, rows * rh + 0.9, 0.55, 0, (rows * rh + 0.9) / 2, 0.275, { r: 0.01 }); // 機櫃
    const screens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -w / 2 + cw * (c + 0.5), y = 0.9 + r * rh;
      b.box('enamel_black', cw - 0.02, rh - 0.02, 0.02, x, y + rh / 2, 0.56);
      const sc = crtBox(b, x, y + 0.02, 0.36, cw - 0.06, rh - 0.06, 0.4, 'pl_dark');
      const idx = r * cols + c;
      if ((idx + seed) % 4 === 2) screens.push([sc.x, sc.y, sc.z + 0.002, sc.w, sc.h]); // 雜訊(動態)
      else if ((idx + seed) % 5 === 4) b.plane('screen_dark', sc.w, sc.h, sc.x, sc.y, sc.z); // 壞掉
      else b.plane(G(cctv(idx + seed * 3)), sc.w, sc.h, sc.x, sc.y, sc.z);
      led(b, x + cw / 2 - 0.06, y + 0.06, 0.585, (idx % 3) ? '#30ff60' : '#ff3020');
    }
    b.meta.noise = screens;
  });
}
// 控制台(斜面板:開關、搖桿、按鈕、對講機)
export function controlConsole(w = 2.0) {
  return tpl(`console:${w}`, (b) => {
    b.box('enamel_gray', w, 0.72, 0.7, 0, 0.36, 0, { r: 0.015 });
    b.box('enamel_gray', w, 0.04, 0.8, 0, 0.74, 0.05, { r: 0.01 });
    b.box('enamel_dark', w - 0.1, 0.2, 0.3, 0, 0.86, -0.22, { r: 0.01, rx: -0.6 });
    for (let i = 0; i < 18; i++) b.box(['pl_red', 'pl_yellow', 'pl_green', 'pl_white'][i % 4], 0.03, 0.015, 0.03, -w / 2 + 0.15 + (i % 9) * 0.1, 0.9 - ((i / 9) | 0) * 0.06, -0.2 + ((i / 9) | 0) * 0.05, { r: 0.004, rx: -0.6 });
    for (const x of [-w / 2 + 0.25, w / 2 - 0.3]) { b.box('pl_black', 0.1, 0.03, 0.1, x, 0.775, 0.15, { r: 0.01 }); b.cyl('pl_black', 0.008, 0.08, x, 0.82, 0.15, { seg: 6, rx: 0.2 }); b.sph('pl_red', 0.016, x, 0.865, 0.16, { ws: 6, hs: 4 }); } // 搖桿
    b.box('pl_dark', 0.25, 0.08, 0.18, 0.2, 0.8, 0.12, { r: 0.015 }); // 錄影控制器
    b.box('pl_black', 0.08, 0.2, 0.05, w / 2 - 0.12, 0.85, 0.25, { r: 0.01 }); // 對講機
    b.cyl('pl_black', 0.006, 0.1, w / 2 - 0.1, 1.0, 0.25, { seg: 4 });
    b.surface(-w / 2 + 0.1, 0.0, w / 2 - 0.1, 0.4, 0.76);
    b.meta.coll = box3(-w / 2, 0, -0.38, w / 2, 1.0, 0.45);
  });
}
export function vcrStack(n = 3) {
  return tpl(`vcr:${n}`, (b) => {
    for (let i = 0; i < n; i++) {
      const y = i * 0.1;
      b.box('pl_black', 0.43, 0.095, 0.32, 0, y + 0.0475, 0, { r: 0.006 });
      b.box('pl_dark', 0.2, 0.025, 0.004, -0.05, y + 0.055, 0.161);
      b.plane(G(vcrClock()), 0.07, 0.022, 0.13, y + 0.06, 0.162);
      for (let k = 0; k < 5; k++) b.box('pl_gray', 0.018, 0.01, 0.006, -0.17 + k * 0.025, y + 0.025, 0.162);
    }
  });
}
// 鑰匙箱(壁掛,門開著,幾把鑰匙不見了)
export function keyCabinet() {
  return tpl('keycab', (b) => {
    b.box('enamel_gray', 0.45, 0.55, 0.08, 0, 0, 0.04, { r: 0.008 });
    b.box('enamel_dark', 0.41, 0.51, 0.005, 0, 0, 0.081);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const x = -0.17 + c * 0.068, y = 0.18 - r * 0.12;
      b.cyl('chrome', 0.003, 0.03, x, y, 0.095, { axis: 'z', seg: 4 });
      if ((r * 6 + c) % 5 !== 2) { b.tor('steel', 0.01, 0.002, x, y - 0.02, 0.105, { rs: 3, ts: 8 }); b.box('brass', 0.012, 0.04, 0.003, x, y - 0.05, 0.105); b.box(['pl_red', 'pl_blue', 'pl_yellow'][(r + c) % 3], 0.02, 0.012, 0.004, x, y - 0.035, 0.108); }
    }
    b.push(-0.225, 0, 0.08, 0, -2.0, 0);
    b.box('enamel_gray', 0.45, 0.55, 0.02, 0.225, 0, 0.01, { r: 0.006 });
    b.pop();
  });
}
// 警棍 + 手電筒(放桌上)
export function batonAndLight() {
  return tpl('baton', (b) => {
    b.cyl('rubber', 0.016, 0.6, 0, 0.016, 0, { axis: 'x', seg: 8 });
    b.cyl('rubber', 0.02, 0.15, 0.32, 0.02, 0, { axis: 'x', seg: 8 });
    b.cyl('rubber', 0.012, 0.12, 0.15, 0.04, 0.0, { axis: 'z', seg: 6 }); // 側握把
    b.push(0.1, 0, 0.18, 0, 0.6, 0);
    b.cyl('alu', 0.018, 0.22, 0, 0.018, 0, { axis: 'x', seg: 10 });
    b.cyl('alu', 0.026, 0.06, 0.13, 0.026, 0, { axis: 'x', seg: 10 });
    b.cyl('glass', 0.022, 0.004, 0.162, 0.026, 0, { axis: 'x', seg: 10 });
    b.pop();
  });
}

// ---------------------------------------------------------------- 院長室
export function globe() {
  return tpl('globe', (b) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('pi_wood_dark', 0.02, [0, 0.55, 0], [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], { seg: 6 }); }
    b.tor('pi_wood_dark', 0.28, 0.025, 0, 0.6, 0, { rx: HALF, rs: 6, ts: 24 }); // 地平環
    b.tor('brass', 0.26, 0.008, 0, 0.82, 0, { ry: 0.3, rz: 0.41, rs: 4, ts: 24, arc: Math.PI * 1.2 }); // 子午環
    b.sph('wood_old', 0.24, 0, 0.82, 0, { ws: 18, hs: 12 });
    for (let i = 0; i < 5; i++) b.sph('fab_beige', 0.07 + R1(3, i) * 0.06, Math.cos(i * 1.3) * 0.2, 0.82 + Math.sin(i * 2.1) * 0.15, Math.sin(i * 1.3) * 0.2, { ws: 6, hs: 4, sx: 0.4, sy: 0.6, sz: 0.4 });
    b.meta.coll = box3(-0.3, 0, -0.3, 0.3, 1.08, 0.3);
  });
}
// 保險箱(鑄鐵,門半開)
export function safeBox(open = 0.4) {
  return tpl(`safe:${open}`, (b) => {
    b.box('iron', 0.6, 0.8, 0.6, 0, 0.42, 0, { r: 0.02 });
    b.box('iron', 0.62, 0.04, 0.62, 0, 0.02, 0, { r: 0.01 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) glide(b, sx * 0.25, sz * 0.25, 0.04, 0.03, 'iron');
    b.box('enamel_dark', 0.5, 0.66, 0.02, 0, 0.44, 0.3);
    b.push(-0.25, 0.44, 0.3, 0, -open, 0);
    b.box('iron', 0.5, 0.66, 0.1, 0.25, 0, 0.05, { r: 0.015 });
    b.cyl('brass', 0.06, 0.02, 0.25, 0.08, 0.11, { axis: 'z', seg: 16 });
    b.cyl('chrome', 0.012, 0.03, 0.25, 0.08, 0.13, { axis: 'z', seg: 6 });
    b.rod('chrome', 0.008, [0.4, -0.08, 0.1], [0.4, -0.08, 0.15], { seg: 5 });
    b.rod('chrome', 0.008, [0.4, -0.08, 0.15], [0.4, -0.18, 0.15], { seg: 5 });
    b.plane('gold', 0.1, 0.03, 0.25, 0.25, 0.101);
    b.pop();
    b.box('paper', 0.3, 0.1, 0.25, 0, 0.15, 0.0); // 裡面的文件
    b.meta.coll = box3(-0.31, 0, -0.31, 0.31, 0.83, 0.31);
  });
}
export function coatRack() {
  return tpl('coatrack', (b) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('pi_wood_dark', 0.015, [0, 0.25, 0], [Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], { seg: 5 }); }
    b.cyl('pi_wood_dark', 0.022, 1.75, 0, 0.875, 0, { seg: 8 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.rod('pi_wood_dark', 0.01, [0, 1.65, 0], [Math.cos(a) * 0.14, 1.75, Math.sin(a) * 0.14], { seg: 4 }); }
    b.box('fab_white', 0.35, 0.95, 0.12, 0.05, 1.22, 0.09, { r: 0.05, rz: 0.04 }); // 掛著的白袍
    b.box('fab_white', 0.12, 0.6, 0.08, 0.2, 1.1, 0.1, { r: 0.03 });
    b.meta.coll = box3(-0.2, 0, -0.2, 0.2, 1.8, 0.2);
  });
}

// ---------------------------------------------------------------- 宿舍
export function bunkBed(seed = 0) {
  return tpl(`bunk:${seed % 2}`, (b) => {
    const fr = seed % 2 ? 'iron' : 'enamel_white';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(fr, 0.045, 1.7, 0.045, sx * 0.47, 0.85, sz * 0.98, { r: 0.01 });
    for (const y of [0.35, 1.35]) {
      for (const sx of [-1, 1]) b.box(fr, 0.03, 0.05, 1.96, sx * 0.47, y, 0);
      for (const sz of [-1, 1]) b.box(fr, 0.94, 0.05, 0.03, 0, y, sz * 0.98);
      b.box('steel', 0.9, 0.01, 1.92, 0, y - 0.01, 0); // 鐵網
      b.box('mattress', 0.86, 0.12, 1.9, 0, y + 0.075, 0, { r: 0.03 });
      b.box('fab_white', 0.88, 0.01, 1.2, 0, y + 0.14, 0.3);
      b.box('cloth_black', 0.88, 0.04, 0.6, 0, y + 0.16, 0.6, { r: 0.015 });
      b.box('fab_white', 0.5, 0.09, 0.32, 0, y + 0.18, -0.75, { r: 0.035 });
    }
    for (const sz of [-1, 1]) for (const y of [0.7, 1.1, 1.65]) b.rod(fr, 0.012, [-0.47, y, sz * 0.98], [0.47, y, sz * 0.98], { seg: 5 });
    b.rod(fr, 0.012, [0.47, 1.6, -0.6], [0.47, 1.6, 0.6], { seg: 5 }); // 上鋪護欄
    for (let i = 0; i < 4; i++) b.rod(fr, 0.012, [0.5, 0.45 + i * 0.25, 0.9], [0.5, 0.45 + i * 0.25, 0.6], { seg: 5 }); // 梯子
    b.meta.coll = box3(-0.5, 0, -1.0, 0.52, 1.75, 1.0);
  });
}
export function ironBed(seed = 0) {
  return tpl(`ironbed:${seed % 2}`, (b) => {
    const fr = 'iron';
    for (const sz of [-1, 1]) {
      const h = sz < 0 ? 1.1 : 0.8;
      b.tube(fr, [[-0.45, 0, sz * 0.98], [-0.45, h, sz * 0.98], [0.45, h, sz * 0.98], [0.45, 0, sz * 0.98]], 0.018, { seg: 6, bend: 0.12 });
      for (let i = 0; i < 6; i++) b.rod(fr, 0.008, [-0.32 + i * 0.13, 0.45, sz * 0.98], [-0.32 + i * 0.13, h - 0.05, sz * 0.98], { seg: 4 });
      b.rod(fr, 0.012, [-0.45, 0.45, sz * 0.98], [0.45, 0.45, sz * 0.98], { seg: 5 });
    }
    for (const sx of [-1, 1]) b.box(fr, 0.03, 0.05, 1.96, sx * 0.44, 0.42, 0);
    b.box('steel', 0.86, 0.01, 1.9, 0, 0.42, 0);
    b.box('mattress', 0.84, 0.1, 1.88, 0, 0.5, 0, { r: 0.03 });
    b.box('fab_gray', 0.88, 0.02, 1.4, 0, 0.56, 0.25, { r: 0.008 });
    if (seed % 2) b.box('fab_white', 0.5, 0.09, 0.32, 0, 0.6, -0.72, { r: 0.035 });
    b.meta.coll = box3(-0.47, 0, -1.0, 0.47, 1.12, 1.0);
  });
}
export function washstand() {
  return tpl('washstand', (b) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('pi_wood_dark', 0.04, 0.8, 0.04, sx * 0.25, 0.4, sz * 0.18);
    b.box('pi_wood_dark', 0.6, 0.03, 0.44, 0, 0.8, 0, { r: 0.006 });
    b.box('pi_wood_dark', 0.5, 0.02, 0.36, 0, 0.25, 0);
    b.lathe('ceramic', [[0, 0], [0.12, 0], [0.18, 0.1], [0.19, 0.11], [0, 0.11]], 0, 0.815, 0, { seg: 14 });
    b.lathe('ceramic', [[0, 0], [0.07, 0], [0.08, 0.15], [0.05, 0.22], [0.06, 0.25], [0, 0.25]], 0.15, 0.26, 0.05, { seg: 10 }); // 水壺
    b.box('fab_white', 0.25, 0.4, 0.01, 0.31, 0.62, 0, { ry: HALF }); // 毛巾
    b.meta.coll = box3(-0.3, 0, -0.22, 0.32, 0.93, 0.22);
  });
}
export function suitcase(seed = 0) {
  return tpl(`suitcase:${seed % 2}`, (b) => {
    b.box(seed % 2 ? 'leather_brown' : 'cardboard', 0.6, 0.18, 0.4, 0, 0.09, 0, { r: 0.02 });
    b.box('brass', 0.03, 0.03, 0.02, -0.15, 0.15, 0.2, { r: 0.004 });
    b.box('brass', 0.03, 0.03, 0.02, 0.15, 0.15, 0.2, { r: 0.004 });
    b.tube('leather_black', [[-0.08, 0.18, 0], [-0.07, 0.22, 0], [0.07, 0.22, 0], [0.08, 0.18, 0]], 0.008, { seg: 4, bend: 0.02 });
  });
}

// ---------------------------------------------------------------- 檔案 / 倉儲
// 一層的箱子(紙箱 + 病歷箱,有標籤);放在 rack 的 surface 上
export function boxRow(w, d, h, seed = 0, kind = 'records') {
  return tpl(`boxrow:${w}:${d}:${h}:${seed}:${kind}`, (b) => {
    let x = -w / 2 + 0.01;
    let i = 0;
    while (x < w / 2 - 0.2) {
      const bw = kind === 'records' ? 0.32 : 0.25 + R1(seed, i) * 0.25, bh = Math.min(h, kind === 'records' ? 0.26 : 0.18 + R1(seed, i + 5) * 0.2), bd = Math.min(d, 0.4);
      if (x + bw > w / 2) break;
      if (R1(seed, i + 9) > 0.12) {
        const tilt = R1(seed, i + 11) > 0.85 ? 0.12 : 0;
        b.box('cardboard', bw - 0.01, bh, bd, x + bw / 2, bh / 2 + (tilt ? 0.02 : 0), (R1(seed, i + 3) - 0.5) * 0.05, { r: 0.004, rz: tilt });
        if (kind === 'records') b.plane(L(fileCover(i + seed)), 0.1, 0.12, x + bw / 2, bh * 0.55, bd / 2 + 0.002 + (R1(seed, i + 3) - 0.5) * 0.05);
        else b.plane(L(drugBox(i + seed)), bw * 0.6, bh * 0.4, x + bw / 2, bh * 0.5, bd / 2 + 0.002 + (R1(seed, i + 3) - 0.5) * 0.05);
      }
      x += bw;
      i++;
    }
  });
}
// 書/檔案夾一排(書背圖集)
export function binderRow(w, h, seed = 0) {
  return tpl(`binders:${w}:${h}:${seed}`, (b) => {
    b.box('cardboard', w, h, 0.26, 0, h / 2, 0);
    b.plane(L(spines(seed + 40, { palette: ['#2a3a6a', '#6a2a2a', '#2a5a3a', '#7a6a3a', '#4a4a4a'] })), w, h, 0, h / 2, 0.131);
  });
}
export function fileCart() {
  return tpl('filecart', (b) => {
    b.box('enamel_gray', 0.7, 0.03, 0.45, 0, 0.25, 0, { r: 0.006 });
    b.box('enamel_gray', 0.7, 0.03, 0.45, 0, 0.75, 0, { r: 0.006 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box('enamel_gray', 0.025, 0.8, 0.025, sx * 0.33, 0.45, sz * 0.2); caster(b, sx * 0.3, sz * 0.18, 0.1, { r: 0.035 }); }
    b.tube('chrome', [[-0.35, 0.75, -0.22], [-0.35, 1.0, -0.22], [-0.35, 1.0, 0.22], [-0.35, 0.75, 0.22]], 0.012, { seg: 5, bend: 0.04 });
    b.surface(-0.32, -0.2, 0.32, 0.2, 0.77);
    b.surface(-0.32, -0.2, 0.32, 0.2, 0.27);
    b.meta.coll = box3(-0.37, 0, -0.24, 0.37, 1.0, 0.24);
  });
}
export function stepLadder() {
  return tpl('ladder', (b) => {
    for (const sx of [-1, 1]) {
      b.rod('alu', 0.02, [sx * 0.22, 0, 0.3], [sx * 0.18, 1.5, 0.0], { seg: 5 });
      b.rod('alu', 0.02, [sx * 0.22, 0, -0.35], [sx * 0.18, 1.5, -0.02], { seg: 5 });
    }
    for (let i = 0; i < 4; i++) { const t = (i + 1) / 5; b.box('alu', 0.4 - t * 0.08, 0.02, 0.1, 0, t * 1.5, 0.3 - t * 0.3, { r: 0.004 }); }
    b.box('pl_orange', 0.4, 0.06, 0.3, 0, 1.53, -0.01, { r: 0.01 });
    b.meta.coll = box3(-0.25, 0, -0.36, 0.25, 1.56, 0.32);
  });
}
export function pallet() {
  return tpl('pallet', (b) => {
    for (let i = 0; i < 6; i++) b.box('wood_old', 1.2, 0.02, 0.12, 0, 0.13, -0.42 + i * 0.168);
    for (const z of [-0.42, 0, 0.42]) { b.box('wood_old', 1.2, 0.1, 0.1, 0, 0.07, z); }
    for (let i = 0; i < 3; i++) b.box('wood_old', 0.1, 0.02, 1.0, -0.5 + i * 0.5, 0.01, 0);
    b.surface(-0.55, -0.45, 0.55, 0.45, 0.14);
  });
}
// 紙箱(可推動用)
export function cardboardBox(w = 0.5, h = 0.4, d = 0.4, seed = 0, open = false) {
  return tpl(`cbox:${w}:${h}:${d}:${seed % 3}:${open}`, (b) => {
    b.box('cardboard', w, h, d, 0, h / 2, 0, { r: 0.004 });
    b.box('fab_beige', w + 0.002, 0.004, 0.06, 0, h + 0.001, 0); // 膠帶
    if (open) for (const s of [-1, 1]) b.box('cardboard', w, 0.004, d / 2, 0, h + 0.05, s * (d / 2 + 0.08), { rx: s * 0.9 });
    b.plane(L(seed % 2 ? drugBox(seed) : sign('醫療耗材 ↑↑', { w: 160, h: 64, bg: '#a88a62', fg: '#2a2016', size: 0.4, seed })), w * 0.6, h * 0.35, 0, h * 0.55, d / 2 + 0.002);
  });
}

// ---------------------------------------------------------------- 洗衣房
export function washer(kind = 'washer', seed = 0) {
  return tpl(`washer:${kind}:${seed % 2}`, (b) => {
    const w = 1.1, h = 1.5, d = 1.1;
    b.box(kind === 'washer' ? 'enamel_white' : 'enamel_cream', w, h, d, 0, h / 2 + 0.08, 0, { r: 0.03 });
    b.box('enamel_gray', w + 0.04, 0.1, d + 0.04, 0, 0.05, 0, { r: 0.015 });
    // 圓窗門
    const y = 0.75;
    b.cyl('chrome', 0.34, 0.06, 0, y, d / 2 + 0.03, { axis: 'z', seg: 24 });
    b.cyl(kind === 'washer' ? 'glass_dark' : 'enamel_black', 0.27, 0.07, 0, y, d / 2 + 0.035, { axis: 'z', seg: 20 });
    if (seed % 2) b.sph('fab_white', 0.2, 0.0, y - 0.08, d / 2 - 0.15, { sy: 0.6, ws: 8, hs: 6 }); // 裡面還有床單
    b.box('chrome', 0.06, 0.18, 0.06, 0.38, y, d / 2 + 0.06, { r: 0.015 });
    // 控制面板
    b.box('enamel_gray', w - 0.1, 0.25, 0.08, 0, h - 0.05, d / 2 + 0.02, { r: 0.01 });
    for (let i = 0; i < 4; i++) knob(b, -0.35 + i * 0.12, h - 0.05, d / 2 + 0.06, 0.025, 'pl_dark');
    b.plane(L(sign(kind === 'washer' ? '洗衣機 1' : '烘乾機 2', { w: 160, h: 48, bg: '#d8d4c4', size: 0.5, seed })), 0.22, 0.066, 0.3, h - 0.03, d / 2 + 0.061);
    led(b, 0.45, h - 0.1, d / 2 + 0.061, seed % 2 ? '#ff3020' : '#202020');
    b.cyl('galv', 0.06, 0.6, 0, h + 0.38, -d / 2 + 0.2, { seg: 10 }); // 排氣管
    b.meta.coll = box3(-w / 2 - 0.02, 0, -d / 2 - 0.02, w / 2 + 0.02, h + 0.1, d / 2 + 0.1);
  });
}
// 布草車(帆布袋 + 鐵架,有些塞滿床單)
export function linenCart(seed = 0) {
  return tpl(`linencart:${seed % 3}`, (b) => {
    const w = 0.9, d = 0.6, h = 0.95;
    b.tube('chrome', [[-w / 2, h, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2]], 0.014, { seg: 5, closed: true, bend: 0.04 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.rod('chrome', 0.012, [sx * w / 2, 0.15, sz * d / 2], [sx * w / 2, h, sz * d / 2], { seg: 5 }); caster(b, sx * (w / 2 - 0.02), sz * (d / 2 - 0.02), 0.15, { r: 0.05 }); }
    b.tube('chrome', [[-w / 2, 0.15, -d / 2], [w / 2, 0.15, -d / 2], [w / 2, 0.15, d / 2], [-w / 2, 0.15, d / 2]], 0.012, { seg: 5, closed: true, bend: 0.04 });
    // 帆布袋(下垂)
    const bag = new THREE.BoxGeometry(w - 0.04, h - 0.3, d - 0.04, 6, 3, 4);
    const p = bag.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const sag = (1 - (y + (h - 0.3) / 2) / (h - 0.3)) * 0.04; p.setXYZ(i, x * (1 - sag), y, z * (1 - sag)); }
    bag.computeVertexNormals();
    b.raw(['fab_canvas', 'fab_blue', 'fab_white'][seed % 3], bag, new THREE.Matrix4().makeTranslation(0, 0.18 + (h - 0.3) / 2, 0));
    if (seed % 3 !== 2) for (let i = 0; i < 4; i++) b.sph('fab_white', 0.18 + R1(seed, i) * 0.06, -0.25 + i * 0.17, h - 0.02, (R1(seed, i + 4) - 0.5) * 0.2, { sy: 0.5, ws: 8, hs: 6 });
    if (seed % 3 === 1) b.box('meat', 0.15, 0.01, 0.12, 0.1, h + 0.06, 0.05, { r: 0.004 });
    b.meta.coll = box3(-w / 2 - 0.02, 0, -d / 2 - 0.02, w / 2 + 0.02, h + 0.1, d / 2 + 0.02);
  });
}
// 疊好的床單(一疊)
export function linenStack(n = 6, seed = 0) {
  return tpl(`linenstack:${n}:${seed % 2}`, (b) => {
    for (let i = 0; i < n; i++) b.box(i % 4 === 3 ? 'fab_blue' : 'fab_white', 0.42, 0.045, 0.32, (R1(seed, i) - 0.5) * 0.03, 0.0225 + i * 0.046, (R1(seed, i + 3) - 0.5) * 0.03, { r: 0.012, ry: (R1(seed, i + 7) - 0.5) * 0.08 });
  });
}
// 燙平機(滾筒式)
export function ironer() {
  return tpl('ironer', (b) => {
    const w = 2.2;
    b.box('enamel_gray', w, 0.75, 0.8, 0, 0.375, 0, { r: 0.02 });
    b.cyl('chrome', 0.18, w - 0.2, 0, 0.95, 0, { axis: 'x', seg: 20 });
    b.box('enamel_gray', w, 0.3, 0.3, 0, 1.0, -0.35, { r: 0.02 });
    b.box('pi_steel', w - 0.2, 0.02, 0.4, 0, 0.82, 0.45, { rx: 0.2 }); // 進料台
    b.box('fab_white', 1.2, 0.006, 0.6, 0.1, 0.86, 0.3, { rx: 0.15 }); // 卡住的床單
    for (const sx of [-1, 1]) b.box('pl_red', 0.08, 0.08, 0.05, sx * (w / 2 - 0.15), 1.12, -0.18, { r: 0.01 });
    b.meta.coll = box3(-w / 2, 0, -0.5, w / 2, 1.2, 0.68);
  });
}
// 洗劑桶
export function drum(seed = 0) {
  return tpl(`drum:${seed % 2}`, (b) => {
    b.cyl(seed % 2 ? 'pl_blue' : 'pl_white', 0.22, 0.6, 0, 0.3, 0, { seg: 14 });
    b.cyl(seed % 2 ? 'pl_blue' : 'pl_white', 0.2, 0.03, 0, 0.615, 0, { seg: 14 });
    b.cyl('pl_red', 0.04, 0.03, 0.1, 0.63, 0.05, { seg: 8 });
    b.plane(L(sign('次氯酸鈉 漂白劑', { w: 192, h: 64, bg: '#f0ece0', fg: '#1a3a7a', size: 0.36, sub: '腐蝕性 勿混合使用', seed })), 0.22, 0.08, 0, 0.36, 0.221);
  });
}

// ---------------------------------------------------------------- 餐廳
export function steamTable(w = 2.4) {
  return tpl(`steam:${w}`, (b) => {
    b.box('pi_steel', w, 0.85, 0.75, 0, 0.425, 0, { r: 0.01 });
    b.box('pi_steel', w + 0.05, 0.03, 0.8, 0, 0.865, 0, { r: 0.006 });
    const n = Math.floor(w / 0.55);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.3 + i * 0.55;
      b.box('enamel_black', 0.48, 0.02, 0.3, x, 0.87, 0.05);
      b.box('pi_steel', 0.46, 0.12, 0.28, x, 0.83, 0.05, { r: 0.004 });
      b.box(['soil', 'meat', 'leaf_dead', 'fab_beige'][i % 4], 0.42, 0.02, 0.24, x, 0.88 - (i % 3) * 0.02, 0.05); // 發霉的食物
    }
    b.box('glass', w - 0.1, 0.4, 0.01, 0, 1.15, 0.25, { rx: -0.4 }); // 防噴罩
    for (const sx of [-1, 1]) b.box('pi_steel', 0.03, 0.42, 0.03, sx * (w / 2 - 0.05), 1.08, 0.2);
    b.box('pi_steel', w, 0.03, 0.25, 0, 0.82, 0.5); // 托盤滑軌
    for (let i = 0; i < 3; i++) b.rod('chrome', 0.008, [-w / 2, 0.84, 0.42 + i * 0.06], [w / 2, 0.84, 0.42 + i * 0.06], { seg: 4 });
    b.plane(L(menuBoard()), 0.8, 0.45, 0, 1.6, -0.36);
    b.box('pi_steel', 0.84, 0.49, 0.02, 0, 1.6, -0.375);
    b.cyl('pi_steel', 0.015, 0.9, -0.3, 1.0, -0.37, { seg: 5 });
    b.cyl('pi_steel', 0.015, 0.9, 0.3, 1.0, -0.37, { seg: 5 });
    b.meta.coll = box3(-w / 2, 0, -0.4, w / 2, 1.85, 0.62);
  });
}
// 托盤推車(餐車);fallen:翻倒版本由呼叫者旋轉
export function trayTrolley(seed = 0) {
  return tpl(`traytrolley:${seed % 2}`, (b) => {
    const w = 0.6, d = 0.8, h = 1.5;
    shell(b, w, h, d, 'pi_steel', { base: 0.16, plinth: 'pl_dark' });
    for (let i = 0; i < 9; i++) { // 托盤軌 + 托盤
      const y = 0.25 + i * 0.13;
      for (const sx of [-1, 1]) b.box('steel', 0.02, 0.01, d - 0.05, sx * (w / 2 - 0.03), y, 0);
      if ((i + seed) % 3) b.box('pl_beige', w - 0.08, 0.02, d - 0.08, 0, y + 0.012, (i % 2) * 0.05, { r: 0.004 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * (w / 2 - 0.05), sz * (d / 2 - 0.06), 0.16, { r: 0.05 });
    b.tube('chrome', [[-w / 2 + 0.05, h - 0.2, d / 2], [-w / 2 + 0.05, h - 0.2, d / 2 + 0.08], [w / 2 - 0.05, h - 0.2, d / 2 + 0.08], [w / 2 - 0.05, h - 0.2, d / 2]], 0.012, { seg: 5, bend: 0.03 });
    b.meta.coll = box3(-w / 2, 0, -d / 2, w / 2, h, d / 2 + 0.1);
  });
}

// ---------------------------------------------------------------- 兒童
export function rockingHorse() {
  return tpl('rockhorse', (b) => {
    for (const sx of [-1, 1]) b.tube('wood_red', [[sx * 0.18, 0.05, -0.55], [sx * 0.18, 0.0, -0.2], [sx * 0.18, -0.0, 0.2], [sx * 0.18, 0.05, 0.55]], 0.02, { seg: 6, bend: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod('wood_toy', 0.018, [sx * 0.18, 0.02, sz * 0.3], [sx * 0.08, 0.38, sz * 0.22], { seg: 6 });
    b.box('wood_white', 0.2, 0.2, 0.55, 0, 0.45, 0, { r: 0.08 });
    b.rod('wood_white', 0.06, [0, 0.5, 0.25], [0, 0.72, 0.36], { seg: 8 });
    b.box('wood_white', 0.13, 0.15, 0.26, 0, 0.75, 0.45, { r: 0.05, rx: 0.4 });
    for (const sx of [-1, 1]) { b.sph('pl_black', 0.016, sx * 0.065, 0.8, 0.46, { ws: 6, hs: 4 }); b.box('wood_white', 0.03, 0.07, 0.03, sx * 0.04, 0.86, 0.38); }
    b.box('fab_red', 0.22, 0.04, 0.22, 0, 0.56, 0.0, { r: 0.015 });
    for (let i = 0; i < 6; i++) b.box('wood_dark', 0.03, 0.12, 0.04, 0, 0.78 - i * 0.04, 0.32 - i * 0.04, { rx: 0.5 }); // 鬃毛
    b.rod('wood_toy', 0.008, [-0.1, 0.7, 0.42], [0.1, 0.7, 0.42], { seg: 4 }); // 握把
  });
}
// 洋娃娃(瓷臉、裙子)— 事件錨點用的物件另外建(會轉頭)
export function doll(sitting = true) {
  return tpl(`doll:${sitting}`, (b) => {
    b.lathe('fab_floral', [[0, 0], [0.09, 0], [0.085, 0.04], [0.05, 0.12], [0.035, 0.16], [0, 0.17]], 0, 0, 0, { seg: 12 });
    for (const sx of [-1, 1]) {
      if (sitting) b.rod('skin_doll', 0.016, [sx * 0.035, 0.03, 0.02], [sx * 0.045, 0.03, 0.17], { seg: 6 });
      else b.rod('skin_doll', 0.016, [sx * 0.035, 0.0, 0.0], [sx * 0.04, -0.12, 0.0], { seg: 6 });
      b.box('pl_black', 0.03, 0.025, 0.045, sx * 0.045, 0.03, sitting ? 0.18 : 0.0, { r: 0.008 }); // 鞋
      b.rod('skin_doll', 0.012, [sx * 0.05, 0.14, 0], [sx * 0.08, 0.06, 0.03], { seg: 5 });
    }
    b.meta.headY = 0.21;
  });
}
export function dollHead() {
  return tpl('dollhead', (b) => {
    b.sph('skin_doll', 0.05, 0, 0, 0, { sy: 1.05, ws: 14, hs: 10 });
    b.sph('wood_dark', 0.055, 0, 0.012, -0.008, { ws: 12, hs: 8, tl: Math.PI * 0.62 }); // 頭髮
    for (const sx of [-1, 1]) {
      b.sph('pl_white', 0.011, sx * 0.018, 0.01, 0.043, { ws: 8, hs: 6 });
      b.sph('pl_black', 0.007, sx * 0.018, 0.01, 0.051, { ws: 6, hs: 4 }); // 眼睛直直看著
      b.box('wood_dark', 0.03, 0.12, 0.012, sx * 0.05, -0.04, -0.01, { r: 0.006 }); // 辮子
    }
    b.box('pl_red', 0.012, 0.004, 0.004, 0, -0.022, 0.047);
  });
}
export function teddy(color = 'plush_brown', s = 1) {
  return tpl(`teddy:${color}:${s}`, (b) => {
    b.sph(color, 0.09 * s, 0, 0.09 * s, 0, { sy: 1.1, ws: 10, hs: 8 });
    b.sph(color, 0.065 * s, 0, 0.22 * s, 0.01 * s, { ws: 10, hs: 8 });
    b.sph('plush_white', 0.028 * s, 0, 0.21 * s, 0.06 * s, { ws: 8, hs: 6 });
    b.sph('pl_black', 0.008 * s, 0, 0.22 * s, 0.085 * s, { ws: 4, hs: 4 });
    for (const sx of [-1, 1]) {
      b.sph(color, 0.025 * s, sx * 0.05 * s, 0.28 * s, 0, { ws: 6, hs: 5 });
      b.sph('pl_black', 0.009 * s, sx * 0.025 * s, 0.235 * s, 0.055 * s, { ws: 4, hs: 4 });
      b.sph(color, 0.035 * s, sx * 0.09 * s, 0.11 * s, 0.03 * s, { sy: 1.4, ws: 6, hs: 5 });
      b.sph(color, 0.038 * s, sx * 0.05 * s, 0.03 * s, 0.07 * s, { sz: 1.3, ws: 6, hs: 5 });
    }
  });
}
export function toyCar(color = 'pl_red') {
  return tpl(`toycar:${color}`, (b) => {
    b.box(color, 0.2, 0.06, 0.1, 0, 0.05, 0, { r: 0.02 });
    b.box(color, 0.1, 0.05, 0.09, -0.02, 0.1, 0, { r: 0.02 });
    b.box('glass_dark', 0.08, 0.035, 0.092, -0.02, 0.1, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('rubber', 0.022, 0.015, sx * 0.065, 0.022, sz * 0.05, { axis: 'z', seg: 8 });
  });
}
// 畫架 + 蠟筆畫
export function easel(seed = 0) {
  return tpl(`easel:${seed}`, (b) => {
    for (const sx of [-1, 1]) b.rod('wood_toy', 0.015, [sx * 0.3, 0, 0.15], [sx * 0.08, 1.3, 0.0], { seg: 5 });
    b.rod('wood_toy', 0.015, [0, 0, -0.35], [0, 1.25, -0.02], { seg: 5 });
    b.box('wood_toy', 0.6, 0.03, 0.06, 0, 0.6, 0.11);
    b.box('wood_white', 0.56, 0.42, 0.012, 0, 0.84, 0.09, { rx: -0.12 });
    b.plane(L(drawing(seed)), 0.5, 0.36, 0, 0.84, 0.098, { rx: -0.12 });
  });
}
// 兒童病床(高護欄、卡通床頭)
export function kidBed(seed = 0) {
  return tpl(`kidbed:${seed % 2}`, (b) => {
    const fr = seed % 2 ? 'enamel_pink' : 'enamel_blue', L1 = 1.5, W = 0.75;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(fr, 0.04, 0.9, 0.04, sx * W / 2, 0.55, sz * L1 / 2); caster(b, sx * (W / 2 - 0.03), sz * (L1 / 2 - 0.05), 0.1, { r: 0.035 }); }
    for (const sx of [-1, 1]) b.box(fr, 0.03, 0.05, L1, sx * W / 2, 0.42, 0);
    b.box('mattress', W - 0.06, 0.1, L1 - 0.06, 0, 0.49, 0, { r: 0.03 });
    b.box(seed % 2 ? 'fab_pink' : 'fab_blue', W - 0.04, 0.015, L1 - 0.4, 0, 0.55, 0.15);
    b.box('fab_white', 0.4, 0.08, 0.25, 0, 0.58, -0.55, { r: 0.03 });
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) b.rod('chrome', 0.007, [sx * W / 2, 0.55, -L1 / 2 + 0.1 + i * 0.16], [sx * W / 2, 0.98, -L1 / 2 + 0.1 + i * 0.16], { seg: 4 });
    for (const sx of [-1, 1]) b.rod('chrome', 0.012, [sx * W / 2, 0.98, -L1 / 2], [sx * W / 2, 0.98, L1 / 2], { seg: 5 });
    b.box(seed % 2 ? 'pl_pink' : 'pl_ltblue', W, 0.5, 0.03, 0, 0.8, -L1 / 2, { r: 0.012 });
    b.plane(L(drawing(seed + 10)), 0.36, 0.26, 0, 0.82, -L1 / 2 + 0.016);
    b.meta.coll = box3(-W / 2 - 0.03, 0, -L1 / 2 - 0.03, W / 2 + 0.03, 1.0, L1 / 2 + 0.03);
  });
}
// 洩氣的氣球(綁在床尾,半垂)
export function balloon(color = 'pl_red', seed = 0) {
  return tpl(`balloon:${color}:${seed % 2}`, (b) => {
    const g = new THREE.SphereGeometry(0.12, 10, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setXYZ(i, p.getX(i) * (0.7 + 0.2 * Math.sin(i)), y * 0.75 - Math.abs(p.getX(i)) * 0.4, p.getZ(i) * 0.6); }
    g.computeVertexNormals();
    b.raw(color, g, new THREE.Matrix4().makeRotationZ(seed % 2 ? 1.9 : 2.4).setPosition(0.12, 0.3, 0));
    b.tube('pl_white', [[0, 0, 0], [0.05, 0.12, 0.02], [0.04, 0.22, 0], [0.1, 0.28, 0]], 0.0015, { seg: 3, bend: 0.04 });
  });
}

// ---------------------------------------------------------------- 走廊
export function janitorCart() {
  return tpl('janitor', (b) => {
    b.box('pl_yellow', 1.0, 0.04, 0.5, 0, 0.12, 0, { r: 0.01 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.42, sz * 0.2, 0.1, { r: 0.04 });
    b.box('pl_yellow', 0.04, 0.9, 0.5, -0.48, 0.55, 0, { r: 0.008 });
    b.box('pl_yellow', 0.45, 0.04, 0.5, -0.25, 0.6, 0, { r: 0.008 });
    b.box('pl_yellow', 0.45, 0.04, 0.5, -0.25, 0.95, 0, { r: 0.008 });
    // 拖把桶 + 擰乾器 + 拖把
    b.lathe('pl_yellow', [[0, 0], [0.18, 0], [0.2, 0.32], [0.19, 0.32], [0.17, 0.02], [0, 0.02]], 0.25, 0.14, 0, { seg: 12, sx: 1.2 });
    b.cyl('pi_fluid', 0.17, 0.01, 0.25, 0.36, 0, { seg: 10 });
    b.box('pl_gray', 0.3, 0.2, 0.15, 0.25, 0.55, -0.12, { r: 0.02 });
    b.rod('wood_toy', 0.012, [0.3, 0.2, 0.05], [0.0, 1.45, 0.12], { seg: 5 });
    b.cyl('fab_gray', 0.08, 0.25, 0.32, 0.25, 0.04, { seg: 8, r2: 0.05 });
    b.cyl('pl_black', 0.22, 0.55, -0.25, 0.42, 0, { seg: 10, open: true }); // 垃圾袋
    for (let i = 0; i < 3; i++) b.cyl(['pl_blue', 'pl_white', 'pl_red'][i], 0.04, 0.22, -0.4 + i * 0.1, 1.08, 0.1, { seg: 8 }); // 清潔劑
    b.box('fab_yellow', 0.3, 0.02, 0.3, -0.25, 0.63, 0.0, { r: 0.008 }); // 抹布
    b.meta.coll = box3(-0.52, 0, -0.26, 0.5, 1.2, 0.26);
  });
}
export function wetFloorSign() {
  return tpl('wetsign', (b) => {
    for (const s of [-1, 1]) {
      b.push(0, 0, s * 0.11, s * 0.2, 0, 0);
      b.box('pl_yellow', 0.3, 0.6, 0.012, 0, 0.3, 0, { r: 0.008 });
      b.plane(L(sign('小心地滑', { w: 128, h: 160, bg: '#e8c020', fg: '#111', size: 0.24, sub: 'CAUTION WET FLOOR', icon: null })), 0.26, 0.32, 0, 0.36, s * 0.0065, { ry: s > 0 ? 0 : Math.PI });
      b.pop();
    }
    b.box('pl_yellow', 0.1, 0.03, 0.05, 0, 0.6, 0, { r: 0.01 });
  });
}
export function extinguisher() {
  return tpl('extinguisher', (b) => {
    b.box('enamel_red', 0.2, 0.06, 0.04, 0, 0.6, 0.02); // 壁掛架
    b.cyl('enamel_red', 0.075, 0.48, 0, 0.47, 0.11, { seg: 12 });
    b.sph('enamel_red', 0.075, 0, 0.71, 0.11, { ws: 12, hs: 6, tl: HALF });
    b.cyl('chrome', 0.02, 0.06, 0, 0.8, 0.11, { seg: 8 });
    b.box('pl_black', 0.1, 0.015, 0.03, 0.02, 0.84, 0.11, { r: 0.004 });
    b.cyl('chrome', 0.022, 0.025, 0.0, 0.85, 0.16, { axis: 'z', seg: 8 }); // 壓力錶
    b.tube('pl_black', [[0.03, 0.79, 0.12], [0.1, 0.7, 0.14], [0.09, 0.4, 0.16]], 0.008, { seg: 5, bend: 0.04 });
    b.plane(L(sign('滅火器', { w: 96, h: 48, bg: '#e8e4d8', fg: '#a01010', size: 0.5 })), 0.09, 0.05, 0, 0.5, 0.186);
    b.plane(L(sign('滅火器 FIRE', { w: 192, h: 64, bg: '#c81818', fg: '#fff', size: 0.45 })), 0.3, 0.1, 0, 1.15, 0.004);
  });
}
export function bench(w = 1.6) {
  return tpl(`bench:${w}`, (b) => {
    for (let i = 0; i < 3; i++) b.box('pi_wood_oak', w, 0.03, 0.11, 0, 0.44, -0.13 + i * 0.13, { r: 0.008 });
    for (let i = 0; i < 2; i++) b.box('pi_wood_oak', w, 0.1, 0.025, 0, 0.62 + i * 0.14, -0.22, { r: 0.008, rx: 0.15 });
    for (const sx of [-1, 1]) b.ext('iron', [[-0.22, 0, 0.01], [0.2, 0, 0.01], [0.18, 0.42, 0.02], [-0.18, 0.42, 0], [-0.26, 0.85, 0.02], [-0.3, 0.85, 0], [-0.22, 0.42, 0]], 0.04, sx * (w / 2 - 0.12), 0, 0, { ry: -HALF, bevel: 0.004 });
    b.surface(-w / 2 + 0.1, -0.15, w / 2 - 0.1, 0.15, 0.455);
    b.meta.coll = box3(-w / 2, 0, -0.27, w / 2, 0.86, 0.24);
  });
}
// [scene6] 台灣常見的室內消防栓箱:下段消防栓(玻璃門、水帶捲、出水閥)+ 上段綜合盤(火警警鈴、常亮的紅色表示燈、手動報警機)
export function fireHoseCabinet() {
  return tpl('firehose', (b) => {
    const W = 0.75, D = 0.2;
    b.box('enamel_red', W, 1.32, D, 0, 0.66, D / 2, { r: 0.01 });
    b.box('enamel_red', W - 0.04, 0.012, 0.012, 0, 0.92, D + 0.004); // 上下段分隔
    // 下段:玻璃門 + 門框 + 把手,裡面的水帶捲與閥
    b.box('glass', 0.6, 0.62, 0.008, 0, 0.5, D + 0.004);
    for (const [x, y, w, h] of [[0, 0.82, 0.64, 0.025], [0, 0.18, 0.64, 0.025], [-0.31, 0.5, 0.025, 0.66], [0.31, 0.5, 0.025, 0.66]]) b.box('enamel_red', w, h, 0.016, x, y, D + 0.006);
    b.box('chrome', 0.02, 0.1, 0.02, 0.27, 0.5, D + 0.02, { r: 0.004 });
    b.cyl('enamel_red', 0.22, 0.1, -0.05, 0.52, 0.09, { axis: 'z', seg: 16 });
    b.tor('fab_canvas', 0.17, 0.035, -0.05, 0.52, 0.11, { rs: 6, ts: 18 });
    b.tor('fab_canvas', 0.12, 0.03, -0.05, 0.52, 0.12, { rs: 6, ts: 16 });
    b.cyl('brass', 0.035, 0.08, 0.22, 0.3, 0.08, { seg: 10 }); b.cyl('brass', 0.05, 0.015, 0.22, 0.36, 0.08, { seg: 10 }); // 出水閥
    b.plane(L(sign('消防栓', { w: 160, h: 48, bg: '#c81818', fg: '#fff', size: 0.6 })), 0.34, 0.1, 0, 0.08, D + 0.003);
    // 上段綜合盤:警鈴(左)、表示燈(中,常亮紅)、手動報警機(右,壓克力片 + 按鈕)、字牌
    b.cyl('chrome', 0.065, 0.035, -0.22, 1.12, D + 0.016, { axis: 'z', seg: 16 });
    b.sph('chrome', 0.03, -0.22, 1.12, D + 0.04, { ws: 10, hs: 6, sz: 0.5 });
    b.cyl('enamel_red', 0.05, 0.02, 0, 1.13, D + 0.01, { axis: 'z', seg: 14 });
    b.sph(G(glowSwatch('firelamp', '#ff2a12')), 0.038, 0, 1.13, D + 0.022, { ws: 12, hs: 6, sz: 0.55 });
    b.box('pl_white', 0.15, 0.15, 0.025, 0.22, 1.12, D + 0.0125, { r: 0.008 });
    b.cyl('pl_red', 0.028, 0.012, 0.22, 1.12, D + 0.03, { axis: 'z', seg: 12 });
    b.box('pi_clear', 0.11, 0.11, 0.003, 0.22, 1.12, D + 0.038);
    b.plane(L(sign('警鈴  表示燈  發信機', { w: 256, h: 32, bg: '#c81818', fg: '#fff', size: 0.55 })), 0.62, 0.075, 0, 1.25, D + 0.003);
  });
}
// 壁掛告示:樓層牌
export function floorSign(id) { return tpl(`floorsign:${id}`, (b) => { b.box('enamel_dark', 0.44, 0.44, 0.02, 0, 0, 0.01, { r: 0.008 }); b.plane(L(floorPlate(id)), 0.4, 0.4, 0, 0, 0.0205); }); }
export function portraitFrame() {
  return tpl('portraitframe', (b) => {
    b.box('gold', 0.78, 1.0, 0.06, 0, 0, 0.03, { r: 0.02 });
    b.box('wood_dark', 0.68, 0.9, 0.065, 0, 0, 0.03);
    b.plane(L(portrait()), 0.62, 0.84, 0, 0, 0.064);
    b.box('brass', 0.18, 0.04, 0.01, 0, -0.56, 0.02);
  });
}
// 皮製辦公椅(院長)
export function leatherChair() {
  return tpl('leatherchair', (b) => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.2; b.box('pi_wood_dark', 0.05, 0.035, 0.3, Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14, { r: 0.01, ry: -a + HALF }); caster(b, Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.06, { r: 0.025, fork: 'brass' }); }
    b.cyl('chrome', 0.025, 0.28, 0, 0.24, 0, { seg: 8 });
    b.box('leather_ox', 0.56, 0.14, 0.52, 0, 0.45, 0.02, { r: 0.05 });
    b.box('leather_ox', 0.54, 0.75, 0.14, 0, 0.92, -0.25, { r: 0.06, rx: 0.1 });
    for (const sx of [-1, 1]) { b.box('leather_ox', 0.1, 0.22, 0.5, sx * 0.3, 0.6, 0.0, { r: 0.045 }); for (let i = 0; i < 4; i++) b.sph('brass', 0.008, sx * 0.355, 0.6, -0.18 + i * 0.12, { ws: 4, hs: 3 }); }
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) b.sph('leather_black', 0.01, -0.18 + c * 0.12, 0.75 + r * 0.17, -0.18 + r * 0.017, { ws: 4, hs: 3 }); // 拉扣
  });
}

export { box3, R1 };
