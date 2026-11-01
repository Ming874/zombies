import { B, tpl, HALF, L, G, THREE, caster, glide, barHandle, cupPull, drawer, doorPanel, shell, labelHolder, screws, led, cable, knob } from './parts.js';
import { sheetOverBody } from './cloth.js';
import { sign, warnIcon, monitorScreen, xrayFilm, lightPanel, ctConsole, dosScreen, glowSwatch, toeTag } from './art.js';
import { monitorHead } from './medical.js';

// 大型醫療設備:X 光、電腦斷層、手術台/無影燈/麻醉機、呼吸器、保溫箱、產檯、輻射保溫台、太平間冷凍櫃、解剖台…

const box3 = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

// ---------------------------------------------------------------- X 光
// 攝影床(浮動床面 + 底座 + 床下 bucky 托盤)
export function xrayTable() {
  return tpl('xraytable', (b) => {
    b.box('enamel_cream', 0.6, 0.62, 1.1, 0, 0.31, 0, { r: 0.04 });
    b.box('enamel_gray', 0.66, 0.06, 1.2, 0, 0.03, 0, { r: 0.02 });
    b.box('pl_cream', 0.75, 0.05, 2.15, 0, 0.72, 0.1, { r: 0.02 }); // 床面
    b.box('pl_beige', 0.5, 0.06, 0.45, 0, 0.66, 0.2, { r: 0.01 }); // bucky 托盤
    b.box('mattress', 0.62, 0.035, 1.6, 0, 0.765, 0.25, { r: 0.015 });
    for (const sx of [-1, 1]) b.rod('chrome', 0.01, [sx * 0.39, 0.74, -0.6], [sx * 0.39, 0.74, 0.9], { seg: 5 });
    b.plane(L(sign('輻射作業 閒人勿近', { w: 256, h: 64, bg: '#e8c020', fg: '#111', size: 0.36, icon: warnIcon })), 0.36, 0.09, 0, 0.42, 0.551);
    for (let i = 0; i < 4; i++) b.box('pl_dark', 0.04, 0.025, 0.012, -0.15 + i * 0.1, 0.55, 0.551, { r: 0.004 });
    b.surface(-0.3, -0.7, 0.3, 1.0, 0.785);
    b.meta.coll = box3(-0.38, 0, -1.0, 0.38, 0.8, 1.2);
  });
}
// 落地柱式 X 光管(立柱 + 橫臂 + 球管 + 準直器);攝影床旁
export function xrayTube() {
  return tpl('xraytube', (b) => {
    b.box('enamel_gray', 0.5, 0.06, 0.5, 0, 0.03, 0, { r: 0.015 });
    b.box('enamel_cream', 0.16, 2.2, 0.16, 0, 1.13, 0, { r: 0.02 });
    b.box('enamel_cream', 0.22, 0.24, 0.22, 0, 1.6, 0, { r: 0.02 });
    b.box('enamel_cream', 0.12, 0.12, 0.85, 0, 1.6, 0.5, { r: 0.02 }); // 橫臂
    b.push(0, 1.6, 0.95);
    b.cyl('enamel_cream', 0.11, 0.42, 0, 0, 0, { axis: 'x', seg: 14 }); // 球管
    for (const sx of [-1, 1]) b.cyl('enamel_gray', 0.115, 0.04, sx * 0.21, 0, 0, { axis: 'x', seg: 14 });
    b.box('enamel_gray', 0.2, 0.18, 0.2, 0, -0.18, 0, { r: 0.015 }); // 準直器
    b.box('pl_dark', 0.12, 0.012, 0.12, 0, -0.275, 0);
    b.box(G(glowSwatch('xr_beam', '#c8e8ff')), 0.06, 0.004, 0.06, 0, -0.282, 0); // 定位燈(還亮著)
    knob(b, 0.12, -0.16, 0.1, 0.014, 'pl_dark');
    b.plane(L(sign('X-RAY', { w: 128, h: 48, bg: '#e8e4d8', fg: '#333', size: 0.55 })), 0.14, 0.05, 0, -0.14, 0.101);
    b.pop();
    cable(b, [[0.06, 1.75, 0.1], [0.1, 2.0, 0.4], [0.05, 1.75, 0.85]], 0.012, 'pl_dark');
    b.meta.coll = box3(-0.25, 0, -0.25, 0.25, 2.3, 0.25);
  });
}
// 胸腔立式攝影架(牆邊):立柱 + 可升降的影像板
export function buckyStand() {
  return tpl('bucky', (b) => {
    b.box('enamel_gray', 0.5, 0.05, 0.45, 0, 0.025, 0.22, { r: 0.012 });
    b.box('enamel_cream', 0.12, 2.1, 0.1, 0, 1.05, 0.06, { r: 0.015 });
    b.box('enamel_cream', 0.52, 0.6, 0.14, 0, 1.35, 0.2, { r: 0.03 });
    b.box('pl_white', 0.44, 0.44, 0.01, 0, 1.35, 0.275);
    for (const sx of [-1, 1]) b.tube('chrome', [[sx * 0.3, 1.05, 0.2], [sx * 0.34, 1.05, 0.32], [sx * 0.34, 1.6, 0.32], [sx * 0.3, 1.6, 0.2]], 0.012, { seg: 5, bend: 0.03 });
    b.box('pl_black', 0.06, 0.06, 0.006, 0, 1.12, 0.278); // 中心十字標記
  });
}
// 鉛衣架(牆掛,掛 3-4 件鉛衣),背面 z=0 貼牆
export function apronRack(n = 4) {
  return tpl(`apron:${n}`, (b) => {
    b.box('steel', 0.9, 0.06, 0.03, 0, 1.75, 0.015, { r: 0.006 });
    for (let i = 0; i < n; i++) {
      const x = -0.33 + i * 0.22;
      b.rod('chrome', 0.008, [x, 1.75, 0.03], [x, 1.73, 0.28], { seg: 5 });
      b.cyl('pl_dark', 0.018, 0.03, x, 1.73, 0.28, { axis: 'z', seg: 6 });
      const c = i % 2 ? 'lead_apron' : 'lead_apron2';
      b.push(x, 1.63, 0.14 + (i % 2) * 0.02, 0, 0, (i - 1.5) * 0.04);
      b.box(c, 0.2, 0.22, 0.03, 0, 0, 0, { r: 0.012 }); // 肩部摺起
      b.box(c, 0.46, 0.85, 0.022, 0, -0.5, 0.01, { r: 0.02, rx: 0.04 }); // 主體
      b.box('pl_dark', 0.12, 0.05, 0.026, 0.12, -0.2, 0.012, { r: 0.006 }); // 名牌袋
      b.pop();
    }
  });
}
// 看片燈箱(牆掛,自發光 + X 光片),背面 z=0
export function lightbox(films = ['chest', 'skull'], lit = true) {
  return tpl(`lightbox:${films.join(',')}:${lit}`, (b) => {
    const n = films.length, w = 0.5 * n + 0.08;
    b.box('enamel_white', w, 0.62, 0.1, 0, 0, 0.05, { r: 0.012 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.04 + 0.25 + i * 0.5;
      b.plane(lit ? G(lightPanel()) : 'glass_frosted', 0.46, 0.5, x, 0.02, 0.101);
      if (films[i]) b.plane(G(xrayFilm(films[i])), 0.36, 0.44, x, 0.02, 0.103, { rz: (i - 0.5) * 0.04 });
      b.box('chrome', 0.3, 0.02, 0.012, x, 0.27, 0.105, { r: 0.004 }); // 夾片
    }
    b.box('pl_dark', 0.04, 0.02, 0.012, w / 2 - 0.06, -0.27, 0.105);
  });
}
// 控制台 + 鉛玻璃屏(移動式防護屏)
export function leadScreen() {
  return tpl('leadscreen', (b) => {
    b.box('enamel_cream', 0.8, 1.2, 0.05, 0, 0.75, 0, { r: 0.02 });
    b.box('glass_dark', 0.5, 0.35, 0.03, 0, 1.6, 0, { r: 0.008 });
    b.box('enamel_cream', 0.8, 0.05, 0.06, 0, 1.8, 0, { r: 0.02 });
    for (const sx of [-1, 1]) b.box('enamel_cream', 0.15, 0.5, 0.06, sx * 0.325, 1.6, 0, { r: 0.015 });
    b.box('enamel_gray', 0.8, 0.06, 0.5, 0, 0.1, 0, { r: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.34, sz * 0.2, 0.07, { r: 0.03 });
    b.meta.coll = box3(-0.42, 0, -0.27, 0.42, 1.85, 0.27);
  });
}
export function xrayConsole() {
  return tpl('xraycon', (b) => {
    b.box('enamel_cream', 0.9, 0.85, 0.55, 0, 0.425, 0, { r: 0.02 });
    b.box('enamel_cream', 0.9, 0.3, 0.3, 0, 0.98, -0.12, { r: 0.02, rx: -0.5 });
    b.plane(G(dosScreen('xr')), 0.3, 0.16, -0.2, 1.0, 0.01, { rx: -0.5 });
    for (let i = 0; i < 8; i++) knob(b, 0.05 + (i % 4) * 0.08, 0.96 - ((i / 4) | 0) * 0.08, 0.02 - ((i / 4) | 0) * 0.04, 0.014, 'pl_dark');
    b.box('pl_red', 0.06, 0.03, 0.06, 0.35, 0.87, 0.18, { r: 0.008 });
    led(b, 0.38, 1.02, 0.03, '#ff3020');
    b.surface(-0.4, 0.05, 0.4, 0.25, 0.85);
    b.meta.coll = box3(-0.45, 0, -0.3, 0.45, 1.1, 0.28);
  });
}

// ---------------------------------------------------------------- 電腦斷層
export function ctGantry() {
  return tpl('ctgantry', (b) => {
    // 甜甜圈外殼(深 0.75m,外徑 1.9,內孔 0.7)
    const prof = [[0.36, -0.38], [0.36, 0.38], [0.5, 0.42], [0.95, 0.42], [1.0, 0.36], [1.0, -0.36], [0.95, -0.42], [0.5, -0.42], [0.36, -0.38]];
    b.lathe('pl_white', prof.map(([r, y]) => [r, y]), 0, 1.1, 0, { seg: 40, rx: HALF });
    b.box('pl_white', 1.9, 0.5, 0.84, 0, 0.25, 0, { r: 0.05 }); // 底座
    b.box('enamel_gray', 1.95, 0.06, 0.9, 0, 0.03, 0, { r: 0.02 });
    b.tor('pl_gray', 0.365, 0.02, 0, 1.1, 0.4, { rs: 6, ts: 32 }); // 孔緣
    b.tor('pl_gray', 0.365, 0.02, 0, 1.1, -0.4, { rs: 6, ts: 32 });
    b.plane(L(sign('SOMATOM', { w: 192, h: 48, bg: '#e8eae4', fg: '#2a4a8a', size: 0.55 })), 0.3, 0.075, -0.55, 1.85, 0.423);
    // 前面板:按鈕、雷射定位燈
    for (const sx of [-1, 1]) {
      b.box('pl_gray', 0.18, 0.12, 0.02, sx * 0.7, 0.75, 0.43, { r: 0.01 });
      for (let i = 0; i < 3; i++) b.box('pl_dark', 0.03, 0.02, 0.008, sx * 0.7 - 0.05 + i * 0.05, 0.75, 0.44, { r: 0.003 });
    }
    b.box(G(glowSwatch('laser', '#ff2010')), 0.01, 0.01, 0.004, 0, 1.53, 0.423);
    led(b, 0.75, 1.5, 0.423, '#30ff60');
    b.meta.coll = box3(-1.0, 0, -0.45, 1.0, 2.1, 0.45);
  });
}
export function ctCouch() {
  return tpl('ctcouch', (b) => {
    b.box('pl_white', 0.5, 0.75, 1.3, 0, 0.375, 0, { r: 0.05 });
    b.box('enamel_gray', 0.56, 0.05, 1.36, 0, 0.025, 0, { r: 0.02 });
    b.box('pl_beige', 0.46, 0.05, 2.4, 0, 0.79, -0.45, { r: 0.02 }); // 床面伸進機器
    b.box('mattress', 0.42, 0.04, 1.8, 0, 0.835, -0.15, { r: 0.015 });
    b.box('pl_white', 0.3, 0.1, 0.25, 0, 0.88, -1.4, { r: 0.04 }); // 頭托
    for (const sx of [-1, 1]) b.box('pl_gray', 0.04, 0.05, 1.0, sx * 0.24, 0.6, 0.0, { r: 0.008 });
    b.box('pl_black', 0.06, 0.006, 1.6, 0.18, 0.86, -0.1); // 束帶
    b.surface(-0.2, -0.8, 0.2, 0.6, 0.855);
    b.meta.coll = box3(-0.3, 0, -0.7, 0.3, 0.88, 0.7);
  });
}
export function injector() {
  return tpl('injector', (b) => {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; b.rod('pl_gray', 0.014, [0, 0.09, 0], [Math.cos(a) * 0.25, 0.06, Math.sin(a) * 0.25], { seg: 5 }); caster(b, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.06, { r: 0.022 }); }
    b.cyl('steel', 0.02, 1.0, 0, 0.58, 0, { seg: 8 });
    b.push(0, 1.1, 0.05, -0.6, 0, 0);
    b.box('pl_white', 0.2, 0.32, 0.16, 0, 0, 0, { r: 0.03 });
    for (const sx of [-1, 1]) b.cyl('pl_clear', 0.025, 0.18, sx * 0.05, 0.18, 0, { seg: 10 });
    b.cyl('pi_fluid', 0.02, 0.08, 0.05, 0.14, 0, { seg: 8 });
    b.pop();
    b.box('pl_beige', 0.24, 0.16, 0.06, 0, 1.0, -0.12, { r: 0.015, rx: 0.3 });
    b.plane(G(monitorScreen('inj')), 0.16, 0.1, 0, 1.0, -0.086, { rx: 0.3, ry: Math.PI });
    b.meta.coll = box3(-0.2, 0, -0.2, 0.2, 1.35, 0.2);
  });
}
// 控制室觀察窗(低牆 + 鉛玻璃,房間內隔出控制區;w 長)
export function controlWindow(w = 2.0) {
  return tpl(`ctrlwin:${w}`, (b) => {
    b.box('enamel_white', w, 1.0, 0.18, 0, 0.5, 0, { r: 0.01 });
    b.box('enamel_white', w, 0.06, 0.24, 0, 1.03, 0, { r: 0.01 });
    b.box('glass', w - 0.1, 1.2, 0.02, 0, 1.66, 0);
    b.box('enamel_white', w, 0.1, 0.18, 0, 2.3, 0, { r: 0.01 });
    for (const sx of [-1, 1]) b.box('enamel_white', 0.08, 1.3, 0.18, sx * (w / 2 - 0.04), 1.66, 0);
    b.box('glass', 0.5, 0.4, 0.024, 0.3, 1.5, 0.0, { rz: 0.5 }); // 裂痕(第二層碎片)
    b.box('alu', w, 0.4, 0.02, 0, 2.55, 0); // 上方牆板
    b.box('enamel_white', w, 0.5, 0.18, 0, 2.6, 0);
    b.meta.coll = box3(-w / 2, 0, -0.12, w / 2, 2.85, 0.12);
  });
}
export function controlDesk(w = 1.6, screen = 'ct') {
  return tpl(`ctrldesk:${w}:${screen}`, (b) => {
    b.box('pl_beige', w, 0.03, 0.75, 0, 0.745, 0, { r: 0.006 });
    b.bb('enamel_gray', -w / 2, 0, -0.35, -w / 2 + 0.45, 0.73, 0.35, { r: 0.004 });
    for (let i = 0; i < 3; i++) drawer(b, -w / 2 + 0.225, 0.14 + i * 0.22, 0.35, 0.43, 0.2, 'enamel_gray', { handle: 'cup' });
    b.box('enamel_gray', 0.04, 0.73, 0.7, w / 2 - 0.03, 0.365, 0);
    for (let i = 0; i < 2; i++) {
      const x = -0.3 + i * 0.6;
      b.box('pl_beige', 0.42, 0.34, 0.36, x, 0.95, -0.15, { r: 0.02 });
      b.box('pl_beige', 0.3, 0.25, 0.2, x, 0.93, -0.38, { r: 0.04 });
      b.plane(G(i === 0 && screen === 'ct' ? ctConsole() : dosScreen(screen)), 0.33, 0.25, x, 0.97, 0.031);
      b.box('pl_beige', 0.44, 0.025, 0.16, x, 0.775, 0.22, { r: 0.006 });
    }
    b.box('pl_dark', 0.1, 0.04, 0.12, 0.6, 0.78, 0.15, { r: 0.01 }); // 對講機
    b.cyl('pl_dark', 0.01, 0.12, 0.6, 0.86, 0.12, { seg: 6 });
    b.surface(-w / 2 + 0.05, 0.05, w / 2 - 0.05, 0.33, 0.76);
    b.meta.coll = box3(-w / 2, 0, -0.38, w / 2, 1.15, 0.38);
  });
}

// ---------------------------------------------------------------- 手術
export function opTable() {
  return tpl('optable', (b) => {
    b.box('pi_steel', 0.6, 0.06, 0.8, 0, 0.03, 0, { r: 0.02 });
    b.cyl('pi_steel', 0.12, 0.6, 0, 0.36, 0, { seg: 14 });
    b.box('pi_steel', 0.4, 0.12, 0.5, 0, 0.7, 0, { r: 0.02 });
    // 分段床面
    const segs = [[-0.95, -0.55, 0.06], [-0.55, 0.35, 0], [0.35, 0.95, -0.08]];
    for (const [z0, z1, tilt] of segs) {
      b.box('pi_steel', 0.52, 0.05, z1 - z0 - 0.02, 0, 0.8, (z0 + z1) / 2, { r: 0.01, rx: tilt });
      b.box('cloth_black', 0.5, 0.07, z1 - z0 - 0.03, 0, 0.86, (z0 + z1) / 2, { r: 0.025, rx: tilt });
    }
    b.box('cloth_black', 0.22, 0.06, 0.24, 0, 0.88, -1.05, { r: 0.025 }); // 頭托
    for (const sx of [-1, 1]) { // 手臂板
      b.box('pi_steel', 0.6, 0.03, 0.14, sx * 0.55, 0.8, -0.35, { r: 0.008, ry: sx * 0.2 });
      b.box('cloth_black', 0.56, 0.04, 0.12, sx * 0.55, 0.835, -0.35, { r: 0.015, ry: sx * 0.2 });
      b.box('fab_navy', 0.05, 0.005, 0.15, sx * 0.62, 0.86, -0.35, { ry: sx * 0.2 }); // 束帶
      b.rod('chrome', 0.008, [sx * 0.27, 0.8, -0.95], [sx * 0.27, 0.8, 0.95], { seg: 5 });
    }
    b.box('fab_green', 0.62, 0.006, 1.5, 0.02, 0.9, 0.2, { rx: 0.0 }); // 手術布(沾血)
    b.surface(-0.22, -0.4, 0.22, 0.8, 0.905);
    b.meta.coll = box3(-0.4, 0, -1.1, 0.4, 0.95, 1.0);
  });
}
// 無影燈(天花板吸頂 + 雙燈頭);ceil = 天花板高度
export function surgicalLight(ceil = 3.4, lit = true) {
  return tpl(`surglight:${ceil.toFixed(2)}:${lit}`, (b) => {
    b.cyl('pl_white', 0.18, 0.06, 0, ceil - 0.03, 0, { seg: 16 });
    b.cyl('chrome', 0.03, 0.4, 0, ceil - 0.25, 0, { seg: 8 });
    const head = (ax, az, h, tilt) => {
      b.rod('pl_white', 0.025, [0, ceil - 0.45, 0], [ax * 0.5, ceil - 0.5, az * 0.5], { seg: 8 });
      b.rod('pl_white', 0.02, [ax * 0.5, ceil - 0.5, az * 0.5], [ax * 0.55, h + 0.2, az * 0.55], { seg: 8 });
      b.push(ax * 0.55, h, az * 0.55, tilt * az, 0, -tilt * ax);
      b.lathe('pl_white', [[0, 0.16], [0.08, 0.15], [0.3, 0.06], [0.34, 0.0], [0.33, -0.02], [0, -0.02]], 0, 0, 0, { seg: 20 });
      for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI * 2, r = i ? 0.17 : 0; b.cyl(lit ? G(glowSwatch('surg', '#fff8e8')) : 'glass_frosted', 0.07, 0.01, Math.cos(a) * r, -0.025, Math.sin(a) * r, { seg: 10 }); }
      b.cyl('pl_dark', 0.035, 0.09, 0, -0.07, 0, { seg: 8 }); // 消毒把手
      b.pop();
    };
    head(1, 0.2, 1.75, 0.35);
    head(-0.7, -0.6, 1.95, 0.25);
  });
}
export function anesthesiaMachine() {
  return tpl('anesth', (b) => {
    b.box('enamel_blue', 0.7, 0.85, 0.6, 0, 0.5, 0, { r: 0.03 });
    for (let i = 0; i < 3; i++) drawer(b, 0, 0.25 + i * 0.22, 0.3, 0.62, 0.2, 'enamel_blue', { handle: 'bar' });
    b.box('pi_steel', 0.74, 0.03, 0.64, 0, 0.94, 0, { r: 0.008 }); // 工作台
    b.box('enamel_blue', 0.7, 0.6, 0.25, 0, 1.25, -0.2, { r: 0.03 });
    // 流量計管 + 蒸發器
    for (let i = 0; i < 4; i++) { b.cyl('pi_clear', 0.012, 0.22, -0.2 + i * 0.05, 1.3, -0.07, { seg: 8 }); b.sph(['pl_green', 'pl_blue', 'pl_yellow', 'pl_white'][i], 0.007, -0.2 + i * 0.05, 1.25 + i * 0.03, -0.07, { ws: 6, hs: 4 }); }
    for (const x of [0.12, 0.26]) { b.box(x > 0.2 ? 'pl_yellow' : 'pl_purple', 0.1, 0.2, 0.12, x, 1.08, 0.05, { r: 0.02 }); }
    // 呼吸囊 + 管路
    b.sph('rubber', 0.08, -0.36, 1.0, 0.25, { sy: 1.3, ws: 10, hs: 8 });
    b.tube('pl_ltblue', [[-0.3, 1.1, 0.1], [-0.45, 1.2, 0.35], [-0.2, 0.95, 0.6], [0.1, 0.9, 0.8]], 0.02, { seg: 8, bend: 0.12 });
    b.tube('pl_ltblue', [[-0.25, 1.08, 0.1], [-0.1, 1.15, 0.45], [0.15, 0.93, 0.78]], 0.02, { seg: 8, bend: 0.12 });
    monitorHead(b, 0.05, 1.56, -0.15, 'flat');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.3, sz * 0.25, 0.08, { r: 0.035 });
    b.cyl('enamel_green', 0.06, 0.6, 0.42, 0.45, -0.15, { seg: 10 }); // 氧氣瓶
    b.meta.coll = box3(-0.48, 0, -0.35, 0.42, 1.9, 0.35);
  });
}
// 器械台(Mayo 托盤架)+ 後檯(長桌鋪綠布、器械)
export function mayoStand(seed = 0) {
  return tpl(`mayo:${seed % 2}`, (b) => {
    b.box('pi_steel', 0.06, 0.04, 0.62, 0, 0.04, 0, { r: 0.01 });
    b.box('pi_steel', 0.5, 0.04, 0.06, 0, 0.04, -0.28, { r: 0.01 });
    for (const [x, z] of [[-0.22, -0.28], [0.22, -0.28], [0, 0.28]]) caster(b, x, z, 0.05, { r: 0.022 });
    b.cyl('chrome', 0.018, 0.85, 0, 0.47, -0.28, { seg: 8 });
    b.rod('chrome', 0.015, [0, 0.9, -0.28], [0, 0.9, -0.05], { seg: 6 });
    b.box('pi_steel', 0.5, 0.015, 0.36, 0, 0.91, 0.12, { r: 0.004 });
    for (const sx of [-1, 1]) b.box('pi_steel', 0.012, 0.03, 0.36, sx * 0.245, 0.925, 0.12);
    instruments(b, 0, 0.92, 0.12, seed);
    b.meta.coll = box3(-0.27, 0, -0.32, 0.27, 0.95, 0.32);
  });
}
export function backTable(w = 1.2, seed = 0) {
  return tpl(`backtable:${w}:${seed % 2}`, (b) => {
    b.box('pi_steel', w, 0.02, 0.6, 0, 0.85, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl('pi_steel', 0.016, 0.82, sx * (w / 2 - 0.04), 0.43, sz * 0.26, { seg: 6 }); caster(b, sx * (w / 2 - 0.04), sz * 0.26, 0.06, { r: 0.025 }); }
    b.box('pi_steel', w - 0.06, 0.015, 0.55, 0, 0.3, 0, { r: 0.004 });
    // 綠色無菌布垂下
    b.box('fab_green', w + 0.04, 0.006, 0.64, 0, 0.864, 0);
    for (const sz of [-1, 1]) b.plane('fab_green', w + 0.04, 0.35, 0, 0.69, sz * 0.32, { ry: sz > 0 ? 0 : Math.PI });
    for (const sx of [-1, 1]) b.plane('fab_green', 0.64, 0.35, sx * (w / 2 + 0.02), 0.69, 0, { ry: sx * HALF });
    instruments(b, -0.25, 0.868, -0.05, seed);
    instruments(b, 0.25, 0.868, 0.05, seed + 1);
    b.box('pi_steel', 0.3, 0.05, 0.2, 0.0, 0.89, 0.15, { r: 0.008 }); // 腎形盆(簡化)
    b.cyl('meat', 0.06, 0.02, 0.0, 0.905, 0.15, { seg: 10 });
    b.surface(-w / 2 + 0.06, -0.26, w / 2 - 0.06, 0.26, 0.87);
    b.meta.coll = box3(-w / 2 - 0.03, 0, -0.33, w / 2 + 0.03, 0.9, 0.33);
  });
}
// 器械(剪刀、鉗、手術刀、骨鋸):放在托盤上
export function instruments(b, x, y, z, seed = 0) {
  b.push(x, y, z, 0, seed * 0.3, 0);
  for (let i = 0; i < 5; i++) {
    const zz = -0.12 + i * 0.06;
    b.box('chrome', 0.16 - (i % 2) * 0.03, 0.004, 0.008, 0.0, 0.004, zz, { ry: (i - 2) * 0.05 });
    b.tor('chrome', 0.012, 0.003, -0.085 + (i % 2) * 0.015, 0.004, zz - 0.008, { rx: HALF, rs: 3, ts: 8 });
    b.tor('chrome', 0.012, 0.003, -0.085 + (i % 2) * 0.015, 0.004, zz + 0.008, { rx: HALF, rs: 3, ts: 8 });
  }
  b.box('chrome', 0.13, 0.006, 0.012, 0.06, 0.004, 0.18); // 手術刀
  b.box('steel', 0.03, 0.002, 0.012, 0.135, 0.004, 0.18);
  b.pop();
}
// 刷手台(雙槽不鏽鋼)
export function scrubSink(w = 1.4) {
  return tpl(`scrub:${w}`, (b) => {
    b.box('pi_steel', w, 0.32, 0.55, 0, 0.84, 0.275, { r: 0.01 });
    for (const sx of [-1, 1]) {
      b.box('steel', w / 2 - 0.12, 0.02, 0.38, sx * w / 4, 0.98, 0.3);
      b.tube('chrome', [[sx * w / 4, 1.25, 0.02], [sx * w / 4, 1.3, 0.12], [sx * w / 4, 1.22, 0.24]], 0.012, { seg: 6, bend: 0.04 });
      b.box('chrome', 0.04, 0.03, 0.12, sx * w / 4, 1.0, 0.56, { r: 0.006 }); // 膝控板
    }
    b.box('pi_steel', w, 0.5, 0.03, 0, 1.25, 0.015);
    b.box('pl_white', 0.12, 0.22, 0.09, 0, 1.4, 0.05, { r: 0.012 }); // 刷手液
    b.cyl('chrome', 0.02, 0.7, -w / 2 + 0.1, 0.35, 0.2, { seg: 8 });
    b.cyl('chrome', 0.02, 0.7, w / 2 - 0.1, 0.35, 0.2, { seg: 8 });
    b.meta.coll = box3(-w / 2, 0, 0, w / 2, 1.0, 0.56);
  });
}
// 呼吸器(推車 + 螢幕 + 管路)
export function ventilator(seed = 0) {
  return tpl(`vent:${seed % 2}`, (b) => {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; caster(b, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.08, { r: 0.03 }); }
    b.box('pl_gray', 0.48, 0.06, 0.48, 0, 0.1, 0, { r: 0.02 });
    b.cyl('steel', 0.025, 0.7, 0, 0.47, 0, { seg: 8 });
    b.box('pl_white', 0.42, 0.36, 0.34, 0, 0.98, 0, { r: 0.03 });
    b.box('pl_white', 0.4, 0.32, 0.06, 0, 1.36, 0.08, { r: 0.02, rx: -0.2 });
    b.plane(G(monitorScreen(seed % 2 ? 'flat' : 'vent')), 0.32, 0.22, 0, 1.37, 0.115, { rx: -0.2 });
    knob(b, 0.15, 1.2, 0.18, 0.02, 'pl_dark');
    b.tube('pl_ltblue', [[0.12, 0.9, 0.17], [0.3, 0.8, 0.35], [0.4, 1.0, 0.6], [0.2, 1.05, 0.9]], 0.02, { seg: 8, bend: 0.15 });
    b.tube('pl_ltblue', [[0.05, 0.9, 0.17], [0.2, 0.75, 0.4], [0.32, 0.95, 0.65], [0.15, 1.0, 0.9]], 0.02, { seg: 8, bend: 0.15 });
    b.cyl('pi_clear', 0.04, 0.1, -0.15, 0.88, 0.2, { seg: 10 }); // 加濕瓶
    b.meta.coll = box3(-0.28, 0, -0.28, 0.28, 1.5, 0.28);
  });
}
// 輸液幫浦架(點滴架 + 3 台幫浦)
export function pumpStack(n = 3) {
  return tpl(`pumps:${n}`, (b) => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.rod('chrome', 0.011, [0, 0.1, 0], [Math.cos(a) * 0.28, 0.07, Math.sin(a) * 0.28], { seg: 5 }); glide(b, Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.022, 0.07); }
    b.cyl('chrome', 0.0125, 1.9, 0, 1.0, 0, { seg: 8 });
    for (let i = 0; i < n; i++) {
      const y = 0.85 + i * 0.24;
      b.box('pl_beige', 0.18, 0.2, 0.12, 0, y, 0.08, { r: 0.012 });
      b.plane(G(monitorScreen(i % 2 ? 'pump' : 'pump2')), 0.09, 0.05, 0, y + 0.04, 0.141);
      led(b, 0.065, y + 0.07, 0.141, i === 1 ? '#ff3020' : '#ffa020');
      b.tube('pl_clear', [[0.06, y - 0.08, 0.1], [0.12, y - 0.25, 0.2], [0.3, y - 0.4, 0.35]], 0.0025, { seg: 3, bend: 0.06 });
    }
    b.box('pi_iv', 0.11, 0.18, 0.025, 0.08, 1.78, 0, { r: 0.01 });
    b.meta.coll = box3(-0.22, 0, -0.22, 0.22, 2, 0.22);
  });
}

// ---------------------------------------------------------------- 新生兒 / 產房
export function incubator(lit = false, seed = 0) {
  return tpl(`incubator:${lit}:${seed % 2}`, (b) => {
    b.box('enamel_white', 0.7, 0.55, 0.5, 0, 0.42, 0, { r: 0.03 }); // 櫃體
    for (const sx of [-1, 1]) b.box('enamel_white', 0.32, 0.45, 0.02, sx * 0.17, 0.42, 0.255, { r: 0.008 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.3, sz * 0.2, 0.15, { r: 0.04 });
    b.box('pl_beige', 1.0, 0.18, 0.6, 0, 0.78, 0, { r: 0.04 }); // 底盤
    b.box('mattress', 0.7, 0.04, 0.4, 0, 0.89, 0, { r: 0.015 });
    // 壓克力罩(透明)+ 圓形操作孔
    b.box('pi_clear', 0.96, 0.42, 0.56, 0, 1.08, 0, { r: 0.08 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tor('pl_white', 0.06, 0.012, sx * 0.25, 1.08, sz * 0.285, { rs: 5, ts: 14 });
    b.box('pl_beige', 0.3, 0.25, 0.12, 0.5, 0.98, 0, { r: 0.03 }); // 控制面板
    b.plane(G(monitorScreen(lit ? 'incu' : 'incu_off')), 0.1, 0.06, 0.65, 1.02, 0.0, { ry: HALF });
    if (lit) b.box(G(glowSwatch('incubator', '#d8f0ff')), 0.5, 0.01, 0.3, 0, 1.295, 0); // 內部燈還亮著
    if (seed % 2) b.box('fab_white', 0.25, 0.06, 0.18, 0.05, 0.93, 0.02, { r: 0.03, ry: 0.4 }); // 小毯子
    b.meta.coll = box3(-0.5, 0, -0.32, 0.65, 1.3, 0.32);
  });
}
export function bassinet(seed = 0) {
  return tpl(`bassinet:${seed % 2}`, (b) => {
    b.box('pi_steel', 0.55, 0.03, 0.4, 0, 0.12, 0, { r: 0.01 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl('chrome', 0.014, 0.6, sx * 0.24, 0.42, sz * 0.16, { seg: 6 }); caster(b, sx * 0.24, sz * 0.16, 0.1, { r: 0.03 }); }
    b.box('pi_steel', 0.5, 0.25, 0.35, 0, 0.35, 0, { r: 0.01 }); // 抽屜櫃
    drawer(b, 0, 0.35, 0.175, 0.44, 0.2, 'pi_steel', { handle: 'bar' });
    b.box('pi_clear', 0.62, 0.22, 0.38, 0, 0.84, 0, { r: 0.03 }); // 透明塑膠盆
    b.box('mattress', 0.56, 0.03, 0.32, 0, 0.75, 0, { r: 0.01 });
    if (seed % 2) b.box('fab_pink', 0.3, 0.05, 0.2, 0, 0.79, 0, { r: 0.02, ry: 0.3 });
    b.plane(L(sign(seed % 2 ? '女嬰' : '男嬰', { w: 96, h: 40, bg: seed % 2 ? '#f0c8d0' : '#c8d8f0', size: 0.6 })), 0.1, 0.04, 0, 0.9, 0.193);
    b.meta.coll = box3(-0.33, 0, -0.22, 0.33, 0.96, 0.22);
  });
}
export function changingTable() {
  return tpl('changing', (b) => {
    shell(b, 1.0, 0.9, 0.6, 'enamel_white', { base: 0.08 });
    for (let i = 0; i < 2; i++) drawer(b, -0.24, 0.3 + i * 0.3, 0.3, 0.46, 0.28, 'pl_white', { handle: 'bar' });
    b.box('mattress', 0.96, 0.08, 0.56, 0, 0.94, 0, { r: 0.03 });
    b.box('pl_white', 1.0, 0.12, 0.03, 0, 0.96, -0.29, { r: 0.008 });
    for (const sx of [-1, 1]) b.box('pl_white', 0.03, 0.12, 0.6, sx * 0.5, 0.96, 0, { r: 0.008 });
    b.surface(-0.45, -0.25, 0.45, 0.25, 0.98);
    b.surface(0.05, -0.25, 0.45, 0.25, 0.08 + 0.018);
    b.meta.coll = box3(-0.52, 0, -0.31, 0.52, 1.02, 0.31);
  });
}
// 產檯(含腳架)
export function deliveryBed() {
  return tpl('delivbed', (b) => {
    b.box('enamel_white', 0.62, 0.55, 1.0, 0, 0.33, 0, { r: 0.04 });
    b.box('enamel_gray', 0.7, 0.06, 1.1, 0, 0.03, 0, { r: 0.02 });
    b.box('pl_white', 0.68, 0.06, 1.0, 0, 0.63, 0.05, { r: 0.02 });
    b.box('vinyl_mauve', 0.64, 0.1, 0.6, 0, 0.71, 0.2, { r: 0.04 }); // 座墊
    b.box('vinyl_mauve', 0.64, 0.1, 0.75, 0, 0.92, -0.42, { r: 0.04, rx: 0.55 }); // 靠背抬起
    for (const sx of [-1, 1]) { // 腳架
      b.rod('chrome', 0.014, [sx * 0.3, 0.66, 0.5], [sx * 0.42, 1.05, 0.72], { seg: 6 });
      b.box('vinyl_mauve', 0.14, 0.08, 0.32, sx * 0.44, 1.08, 0.78, { r: 0.03, rx: -0.4 });
      b.box('pl_black', 0.03, 0.06, 0.2, sx * 0.44, 1.12, 0.78, { r: 0.008, rx: -0.4 }); // 束帶
      b.tube('chrome', [[sx * 0.34, 0.68, -0.1], [sx * 0.37, 0.85, -0.1], [sx * 0.37, 0.85, 0.25]], 0.012, { seg: 6, bend: 0.04 });
    }
    b.box('pi_steel', 0.5, 0.12, 0.35, 0, 0.48, 0.62, { r: 0.02 }); // 接盆
    b.cyl('meat', 0.12, 0.02, 0, 0.55, 0.62, { seg: 12 });
    b.meta.coll = box3(-0.5, 0, -0.85, 0.5, 1.2, 0.95);
  });
}
// 新生兒輻射保溫台(頂部發熱器紅光)
export function infantWarmer(lit = true) {
  return tpl(`warmer:${lit}`, (b) => {
    b.box('enamel_white', 0.7, 0.75, 0.5, 0, 0.47, 0, { r: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.3, sz * 0.2, 0.1, { r: 0.035 });
    b.box('pl_beige', 0.9, 0.08, 0.6, 0, 0.88, 0, { r: 0.02 });
    b.box('mattress', 0.7, 0.04, 0.45, 0, 0.94, 0, { r: 0.015 });
    for (const sz of [-1, 1]) b.box('pi_clear', 0.86, 0.18, 0.012, 0, 1.01, sz * 0.29);
    b.box('enamel_white', 0.08, 1.2, 0.08, 0, 1.4, -0.32, { r: 0.015 });
    b.box('enamel_white', 0.5, 0.12, 0.35, 0, 2.0, -0.1, { r: 0.03 });
    b.box(lit ? G(glowSwatch('heater', '#ff5020')) : 'pl_dark', 0.4, 0.01, 0.22, 0, 1.94, -0.08);
    b.box('pl_beige', 0.25, 0.18, 0.06, 0, 1.6, -0.27, { r: 0.015 });
    b.plane(G(monitorScreen('incu')), 0.12, 0.08, 0, 1.62, -0.238);
    b.meta.coll = box3(-0.46, 0, -0.38, 0.46, 2.1, 0.32);
  });
}

// ---------------------------------------------------------------- 太平間 / 解剖
// 冷凍櫃牆:cols × rows 格門,open 指定拉出的格(拉出抽屜盤 + 白布屍體),背面 z=0 貼牆
export function morgueWall(cols = 3, rows = 3, open = -1) {
  return tpl(`morguewall:${cols}:${rows}:${open}`, (b) => {
    const cw = 0.8, rh = 0.62, w = cols * cw, d = 0.95, h = rows * rh + 0.3;
    b.bb('pi_steel', -w / 2, 0, 0, w / 2, h, d - 0.02);
    b.bb('pi_steel', -w / 2 - 0.02, h, 0, w / 2 + 0.02, h + 0.12, d, { r: 0.01 });
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const x = -w / 2 + cw * (c + 0.5), y = 0.2 + rh * (r + 0.5), idx = r * cols + c;
      if (idx === open) {
        b.box('enamel_black', cw - 0.08, rh - 0.08, 0.01, x, y, d - 0.015); // 黑洞
        // 拉出的抽屜盤 + 白布
        b.box('pi_steel', cw - 0.14, 0.05, 1.9, x, y - rh / 2 + 0.1, d + 0.85, { r: 0.008 });
        for (const sx of [-1, 1]) b.rod('chrome', 0.012, [x + sx * (cw / 2 - 0.08), y - rh / 2 + 0.09, d], [x + sx * (cw / 2 - 0.08), y - rh / 2 + 0.09, d + 1.8], { seg: 6 });
        const g = sheetOverBody({ w: 0.6, len: 1.85, drop: 0.12, cw: 0.9, cl: 2.15, seed: 11, bodyScale: 0.93 });
        g.translate(x, y - rh / 2 + 0.13, d + 0.9);
        b.raw('fab_white', g);
        // 門板打開(往上翻)
        b.push(x, y + rh / 2 - 0.04, d, -1.9, 0, 0);
        b.box('pi_steel', cw - 0.04, rh - 0.06, 0.04, 0, -(rh - 0.06) / 2, 0.02, { r: 0.008 });
        b.pop();
        // 腳趾牌
        b.plane(L(toeTag(open)), 0.045, 0.08, x + 0.1, y - rh / 2 + 0.2, d + 1.86, { rx: -0.3 });
      } else {
        b.box('pi_steel', cw - 0.04, rh - 0.04, 0.04, x, y, d, { r: 0.008 });
        b.box('chrome', 0.05, 0.16, 0.05, x + cw / 2 - 0.1, y, d + 0.04, { r: 0.012 });
        b.box('chrome', 0.06, 0.05, 0.06, x - cw / 2 + 0.06, y + rh / 2 - 0.08, d + 0.02, { r: 0.006 }); // 鉸鏈
        b.box('chrome', 0.06, 0.05, 0.06, x - cw / 2 + 0.06, y - rh / 2 + 0.08, d + 0.02, { r: 0.006 });
        labelHolder(b, x - 0.12, y + 0.18, d + 0.02, 0.1, 0.035, sign(`${String.fromCharCode(65 + r)}-${c + 1}`, { w: 96, h: 32, bg: '#e8e4d0', size: 0.6, seed: idx }));
      }
    }
    b.meta.coll = box3(-w / 2 - 0.02, 0, 0, w / 2 + 0.02, h + 0.12, d + 0.06);
  });
}
// 停屍推床(不鏽鋼盤)
export function morgueTrolley(withBody = true, seed = 0) {
  return tpl(`mtrolley:${withBody}:${seed % 2}`, (b) => {
    b.box('pi_steel', 0.6, 0.05, 1.95, 0, 0.82, 0, { r: 0.01 });
    for (const sx of [-1, 1]) b.box('pi_steel', 0.012, 0.06, 1.95, sx * 0.3, 0.86, 0);
    for (const sz of [-1, 1]) b.box('pi_steel', 0.6, 0.06, 0.012, 0, 0.86, sz * 0.975);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box('pi_steel', 0.04, 0.68, 0.04, sx * 0.26, 0.45, sz * 0.85); caster(b, sx * 0.26, sz * 0.85, 0.12, { r: 0.045 }); }
    for (const sz of [-1, 1]) b.box('pi_steel', 0.52, 0.03, 0.03, 0, 0.25, sz * 0.85);
    b.box('pi_steel', 0.5, 0.02, 1.7, 0, 0.25, 0);
    if (withBody) {
      const g = sheetOverBody({ w: 0.58, len: 1.9, drop: 0.2, cw: 0.92, cl: 2.2, seed: 5 + seed, bodyScale: 0.95 });
      g.translate(0, 0.85, 0);
      b.raw(seed % 2 ? 'fab_white' : 'cloth_black', g); // 白布 / 黑色屍袋
      b.plane(L(toeTag(seed + 3)), 0.045, 0.08, 0.1, 0.78, 1.0, { rx: -0.25 });
    }
    b.surface(-0.25, -0.9, 0.25, 0.9, 0.85);
    b.meta.coll = box3(-0.33, 0, -1.0, 0.33, 1.1, 1.0);
  });
}
// 解剖台(不鏽鋼、四周凸緣、排水孔、腳端水槽)
export function autopsyTable() {
  return tpl('autopsy', (b) => {
    b.box('pi_steel', 0.3, 0.75, 0.3, 0, 0.375, -0.3, { r: 0.02 });
    b.box('pi_steel', 0.6, 0.05, 0.6, 0, 0.025, -0.3, { r: 0.02 });
    b.box('pi_steel', 0.76, 0.05, 2.3, 0, 0.83, 0, { r: 0.01 });
    for (const sx of [-1, 1]) b.box('pi_steel', 0.03, 0.08, 2.3, sx * 0.37, 0.88, 0, { r: 0.006 });
    for (const sz of [-1, 1]) b.box('pi_steel', 0.76, 0.08, 0.03, 0, 0.88, sz * 1.135, { r: 0.006 });
    for (let i = 0; i < 9; i++) b.cyl('enamel_black', 0.012, 0.002, -0.15 + (i % 3) * 0.15, 0.857, -0.6 + ((i / 3) | 0) * 0.5, { seg: 6 }); // 排水孔
    b.box('pi_steel', 0.5, 0.25, 0.4, 0, 0.72, 1.3, { r: 0.02 }); // 腳端水槽
    b.tube('chrome', [[0.15, 0.85, 1.48], [0.15, 1.15, 1.48], [0.1, 1.2, 1.3]], 0.012, { seg: 6, bend: 0.04 });
    b.tube('rubber', [[0.1, 0.9, 1.48], [0.3, 0.7, 1.6], [0.5, 0.02, 1.5], [0.8, 0.02, 1.1]], 0.012, { seg: 6, bend: 0.15 }); // 沖水管
    b.box('pl_black', 0.22, 0.12, 0.2, 0, 0.92, -1.0, { r: 0.03 }); // 頭枕(木枕)
    b.cyl('meat', 0.18, 0.004, 0.05, 0.858, 0.1, { seg: 16, r2: 0.25 }); // 血
    b.surface(-0.32, -0.9, 0.32, 1.0, 0.86);
    b.meta.coll = box3(-0.4, 0, -1.16, 0.4, 1.0, 1.52);
  });
}
// 吊秤(器官秤),背面 z=0
export function hangingScale() {
  return tpl('hscale', (b) => {
    b.rod('chrome', 0.01, [0, 2.2, 0.02], [0, 2.2, 0.35], { seg: 6 });
    b.cyl('enamel_white', 0.13, 0.06, 0, 1.95, 0.35, { axis: 'z', seg: 18 });
    b.cyl('ceramic', 0.115, 0.002, 0, 1.95, 0.381, { axis: 'z', seg: 16 });
    b.box('enamel_red', 0.004, 0.09, 0.002, 0, 1.97, 0.384, { rz: 0.6 });
    b.cyl('chrome', 0.004, 0.25, 0, 1.73, 0.35, { seg: 4 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('chrome', 0.0015, [0, 1.6, 0.35], [Math.cos(a) * 0.14, 1.36, 0.35 + Math.sin(a) * 0.14], { seg: 3 }); }
    b.lathe('pi_steel', [[0, 0], [0.16, 0.03], [0.17, 0.06], [0.16, 0.055], [0, 0.025]], 0, 1.32, 0.35, { seg: 18 });
    b.sph('meat', 0.07, 0.02, 1.37, 0.36, { sy: 0.6, sx: 1.3, ws: 8, hs: 6 }); // 器官
  });
}
// 標本罐架(牆邊鐵架上的玻璃罐)
export function specimenShelf(seed = 0) {
  return tpl(`specimen:${seed % 2}`, (b) => {
    b.box('pi_steel', 1.0, 0.03, 0.3, 0, 1.2, 0.15);
    b.box('pi_steel', 1.0, 0.03, 0.3, 0, 1.6, 0.15);
    for (const sx of [-1, 1]) b.rod('chrome', 0.008, [sx * 0.45, 1.2, 0.02], [sx * 0.45, 1.05, 0.02], { seg: 4 });
    for (const y of [1.215, 1.615]) for (let i = 0; i < 5; i++) {
      const x = -0.4 + i * 0.2, h = 0.14 + ((i + seed) % 3) * 0.04;
      b.cyl('pi_fluid', 0.06, h, x, y + h / 2, 0.15, { seg: 10 });
      b.cyl('pl_dark', 0.064, 0.025, x, y + h + 0.012, 0.15, { seg: 10 });
      b.sph((i + seed) % 2 ? 'meat' : 'bone', 0.035, x, y + h * 0.45, 0.15, { sy: 1.2, ws: 8, hs: 6 });
      b.plane(L(sign(`#${120 + i * 7 + seed}`, { w: 64, h: 32, bg: '#d8d0b0', size: 0.6, seed: i })), 0.05, 0.025, x, y + h * 0.75, 0.212);
    }
  });
}

// ---------------------------------------------------------------- 復健
export function parallelBars(len = 3) {
  return tpl(`pbars:${len}`, (b) => {
    b.box('wood_light', 0.9, 0.06, len + 0.2, 0, 0.03, 0, { r: 0.02 });
    b.box('fab_blue', 0.6, 0.004, len, 0, 0.062, 0); // 防滑墊
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 0, 1]) { b.cyl('chrome', 0.025, 0.85, sx * 0.3, 0.48, sz * (len / 2 - 0.1), { seg: 8 }); b.cyl('steel', 0.04, 0.02, sx * 0.3, 0.07, sz * (len / 2 - 0.1), { seg: 8 }); }
      b.cyl('wood_light', 0.022, len, sx * 0.3, 0.92, 0, { axis: 'z', seg: 8 });
    }
    b.meta.coll = box3(-0.45, 0, -len / 2 - 0.1, 0.45, 0.95, len / 2 + 0.1);
  });
}
export function plinth(seed = 0) {
  return tpl(`plinth:${seed % 2}`, (b) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('enamel_cream', 0.05, 0.6, 0.05, sx * 0.3, 0.3, sz * 0.88);
    for (const sz of [-1, 1]) b.box('enamel_cream', 0.6, 0.05, 0.05, 0, 0.15, sz * 0.88);
    b.box('enamel_cream', 0.66, 0.06, 1.9, 0, 0.6, 0, { r: 0.01 });
    b.box(seed % 2 ? 'vinyl_blue' : 'vinyl_teal', 0.7, 0.1, 1.95, 0, 0.68, 0, { r: 0.04 });
    b.box('fab_white', 0.45, 0.004, 1.8, 0, 0.733, 0.0); // 紙墊
    b.box(seed % 2 ? 'vinyl_blue' : 'vinyl_teal', 0.4, 0.12, 0.3, 0, 0.78, -0.75, { r: 0.05 }); // 枕
    b.surface(-0.3, -0.5, 0.3, 0.9, 0.735);
    b.meta.coll = box3(-0.36, 0, -0.98, 0.36, 0.8, 0.98);
  });
}
// 啞鈴架(三層,彩色啞鈴)
export function dumbbellRack() {
  return tpl('dbrack', (b) => {
    for (const sx of [-1, 1]) b.box('enamel_black', 0.05, 0.9, 0.4, sx * 0.55, 0.45, 0, { r: 0.008 });
    for (let i = 0; i < 3; i++) {
      const y = 0.25 + i * 0.28;
      b.box('enamel_black', 1.1, 0.03, 0.32, 0, y, 0.0, { rx: -0.15 });
      for (let k = 0; k < 4; k++) {
        if ((i + k) % 5 === 3) continue; // 少一支
        const x = -0.4 + k * 0.27, r = 0.035 + i * 0.012;
        const c = ['pl_blue', 'pl_red', 'pl_yellow', 'pl_green'][(i + k) % 4];
        for (const s of [-1, 1]) b.cyl(c, r, 0.05, x + s * 0.07, y + r + 0.02, 0.02, { axis: 'x', seg: 6 });
        b.cyl('chrome', 0.012, 0.12, x, y + r + 0.02, 0.02, { axis: 'x', seg: 6 });
      }
    }
    b.meta.coll = box3(-0.6, 0, -0.22, 0.6, 0.92, 0.22);
  });
}
// 復健樓梯(兩側扶手)
export function trainingStairs() {
  return tpl('tstairs', (b) => {
    const steps = 4, sh = 0.15, sd = 0.3, w = 0.8;
    for (let i = 0; i < steps; i++) b.box('wood_light', w, sh * (i + 1), sd, 0, (sh * (i + 1)) / 2, -0.6 + i * sd, { r: 0.008 });
    for (let i = 0; i < steps; i++) b.box('wood_light', w, sh * (steps - i), sd, 0, (sh * (steps - i)) / 2, 0.6 + i * sd, { r: 0.008 });
    b.box('wood_light', w, sh * steps, 0.3, 0, (sh * steps) / 2, 0.3 - 0.15 + 0.15, { r: 0.008 });
    for (const sx of [-1, 1]) {
      b.tube('chrome', [[sx * (w / 2 + 0.05), 0, -0.75], [sx * (w / 2 + 0.05), 0.85, -0.75], [sx * (w / 2 + 0.05), 0.85 + sh * steps, 0.3], [sx * (w / 2 + 0.05), 0.85, 1.5], [sx * (w / 2 + 0.05), 0, 1.5]], 0.02, { seg: 6, bend: 0.08 });
      b.rod('chrome', 0.018, [sx * (w / 2 + 0.05), 0, 0.35], [sx * (w / 2 + 0.05), 0.85 + sh * steps, 0.35], { seg: 6 });
    }
    b.meta.coll = box3(-0.5, 0, -0.78, 0.5, 1.5, 1.55);
  });
}
// CPR 安妮(恐怖谷):頭+軀幹,無手臂,藍色運動外套;臉部用人頭雕塑
export function cprDummy(headGeo) {
  return tpl('cpr', (b) => {
    b.box('fab_navy', 0.42, 0.18, 0.62, 0, 0.09, 0.0, { r: 0.08 }); // 軀幹(外套)
    b.box('skin_dummy', 0.38, 0.08, 0.3, 0, 0.17, -0.16, { r: 0.04 }); // 胸部(露出)
    b.box('skin_dummy', 0.12, 0.08, 0.1, 0, 0.13, -0.36, { r: 0.04 }); // 頸
    b.lathe('fab_navy', [[0, 0], [0.13, 0], [0.15, 0.12], [0.12, 0.6], [0, 0.62]], 0, 0.08, 0.3, { seg: 10, rx: HALF, sx: 1.4 }); // 下半(褲)
    if (headGeo) {
      const g = headGeo.clone();
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-HALF + 0.15).setPosition(0, 0.12, -0.5));
      b.raw('skin_dummy', g);
    } else {
      b.sph('skin_dummy', 0.1, 0, 0.12, -0.5, { sy: 0.85, sz: 1.15, ws: 14, hs: 10 });
    }
    b.box('mattress', 0.9, 0.03, 1.6, 0.0, -0.015 + 0.015, 0.1, { r: 0.012 }); // 墊子(底下)
  });
}
// 助行器
export function walker() {
  return tpl('walker', (b) => {
    for (const sx of [-1, 1]) {
      b.tube('alu', [[sx * 0.25, 0, -0.2], [sx * 0.24, 0.82, -0.18], [sx * 0.24, 0.82, 0.18], [sx * 0.25, 0, 0.2]], 0.012, { seg: 6, bend: 0.05 });
      b.cyl('rubber', 0.02, 0.18, sx * 0.24, 0.84, 0, { axis: 'z', seg: 6 });
      for (const sz of [-1, 1]) b.cyl('rubber_gray', 0.016, 0.04, sx * 0.25, 0.02, sz * 0.2, { seg: 6 });
    }
    b.rod('alu', 0.01, [-0.24, 0.62, -0.19], [0.24, 0.62, -0.19], { seg: 5 });
  });
}

// ---------------------------------------------------------------- 精神科
// 固定式病床(水泥台 + 薄墊 + 束縛帶)
export function fixedBed(seed = 0) {
  return tpl(`fixedbed:${seed % 2}`, (b) => {
    b.box('plaster', 0.9, 0.42, 2.0, 0, 0.21, 0, { r: 0.03 });
    b.box('vinyl_cream', 0.82, 0.07, 1.9, 0, 0.455, 0, { r: 0.03 });
    for (const z of [-0.6, 0.1, 0.7]) { // 束縛帶(扣環固定在床側)
      b.box('fab_canvas', 0.95, 0.006, 0.07, 0, 0.494, z);
      for (const sx of [-1, 1]) { b.box('fab_canvas', 0.008, 0.25, 0.07, sx * 0.475, 0.37, z); b.box('chrome', 0.04, 0.05, 0.08, sx * 0.48, 0.28, z, { r: 0.008 }); }
    }
    if (seed % 2) b.box('fab_white', 0.6, 0.06, 0.35, 0, 0.52, -0.75, { r: 0.025 });
    screws(b, [[-0.3, 0.42, 0.98], [0.3, 0.42, 0.98]], 0.01, 'steel', 'z');
    b.meta.coll = box3(-0.48, 0, -1.0, 0.48, 0.52, 1.0);
  });
}
// 地上的拘束衣(攤開的布形)
export function straitjacket() {
  return tpl('sjacket', (b) => {
    b.box('fab_canvas', 0.5, 0.05, 0.62, 0, 0.025, 0, { r: 0.02, ry: 0.1 });
    for (const s of [-1, 1]) b.tube('fab_canvas', [[s * 0.25, 0.03, -0.22], [s * 0.55, 0.02, -0.1], [s * 0.75, 0.02, 0.2], [s * 0.6, 0.02, 0.45]], 0.05, { seg: 6, bend: 0.12 });
    for (let i = 0; i < 4; i++) { b.box('fab_white', 0.04, 0.006, 0.4, -0.15 + i * 0.1, 0.055, 0.05, { ry: (i - 1.5) * 0.3 }); b.box('chrome', 0.03, 0.01, 0.03, -0.15 + i * 0.1, 0.06, -0.12, { r: 0.004 }); }
    b.tube('fab_white', [[0.6, 0.02, 0.45], [0.8, 0.01, 0.7], [0.65, 0.01, 0.95]], 0.012, { seg: 4, bend: 0.1 }); // 長帶
  });
}
// 門旁觀察窗(鐵框 + 鐵絲網玻璃 + 滑蓋),背面 z=0 貼牆(走廊側或房內側)
export function observationWindow(open = 0.5) {
  return tpl(`obswin:${open}`, (b) => {
    b.box('enamel_gray', 0.4, 0.32, 0.04, 0, 0, 0.02, { r: 0.008 });
    b.box('glass_dark', 0.3, 0.22, 0.01, 0, 0, 0.041);
    for (let i = -2; i <= 2; i++) { b.box('steel', 0.002, 0.22, 0.002, i * 0.06, 0, 0.046); b.box('steel', 0.3, 0.002, 0.002, 0, i * 0.05, 0.046); }
    b.box('enamel_gray', 0.34, 0.26, 0.012, 0.0, 0.26 * open - 0.0, 0.055, { r: 0.004 }); // 滑蓋往上推開
    b.box('chrome', 0.06, 0.02, 0.02, 0, 0.26 * open + 0.1, 0.07, { r: 0.004 });
    screws(b, [[-0.17, 0.13, 0.04], [0.17, 0.13, 0.04], [-0.17, -0.13, 0.04], [0.17, -0.13, 0.04]], 0.006, 'steel', 'z');
  });
}

export { box3, sheetOverBody };
