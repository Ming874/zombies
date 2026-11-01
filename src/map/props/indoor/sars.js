import { tpl, L, HALF, THREE, cable } from './parts.js';
import { labRect } from './atlas.js';
import { reseed, rnd, rr, text, blotches, grain } from './tex.js';
import { posterSheet } from './furniture.js';
import { onSurface } from './clutter.js';
import { supplyCart } from './medical.js';
import { cardboardBox } from './decor.js';
import { curtainGeo, drape } from './cloth.js';
import { rotY } from './lay.js';

// 2003 年 SARS 封院十四天(故事 v2):量體溫站、口罩/防護衣/面罩、隔離病房告示、拆了一半的塑膠布與封鎖膠帶、
// 公告與手寫值班表、生物醫療廢棄物袋、拖在地上的延長線。全部用既有的共用材質(不新增 shader/材質),
// 告示畫在道具標籤圖集(pi_lab)裡;小東西(口罩、手套)用 InstancedMesh。
// 呼叫點:src/map/props/indoor.js 在每個室內區域擺完主題道具之後呼叫 dressSars(R, zone)。

// ---------------------------------------------------------------- 告示(圖集)
const grime = (c, w, h, k = 1) => blotches(c, 0, 0, w, h, Math.round(6 * k), 4, Math.max(8, h * 0.4), '40,32,20', 0.05, 0.22 * k);
const edge = (c, w, h) => { c.strokeStyle = 'rgba(30,24,16,0.3)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); };
const hand = '"DFKai-SB", "BiauKai", "KaiTi", "Kaiti TC", "Microsoft JhengHei", serif';
function stamp(c, x, y, r, s1, s2) {
  c.save(); c.translate(x, y); c.rotate(-0.25); c.globalAlpha = 0.7;
  c.strokeStyle = '#b3261e'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke();
  c.beginPath(); c.arc(0, 0, r - 5, 0, 7); c.stroke();
  text(c, s1, 0, -5, { size: r * 0.42, color: '#b3261e' }); text(c, s2, 0, r * 0.45, { size: r * 0.3, color: '#b3261e', weight: 'normal' });
  c.restore();
}
export function sarsSheet(kind) {
  return labRect(`sars:${kind}`, 192, 268, (c, w, h) => {
    reseed(kind.length * 991 + kind.charCodeAt(0));
    c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, h);
    const lines = (arr, y0, dy, o = {}) => arr.forEach((s, i) => text(c, s, o.x ?? w / 2, y0 + i * dy, { size: o.size ?? 15, color: o.color ?? '#1c1c1c', weight: o.weight ?? 'bold', align: o.align ?? 'center', maxW: w - 20, font: o.font }));
    if (kind === 'lock') {
      c.fillStyle = '#a8231c'; c.fillRect(0, 0, w, 46);
      text(c, '防疫公告', w / 2, 24, { size: 26, color: '#fff' });
      lines(['霧港市衛生局'], 64, 0, { size: 14, color: '#333' });
      lines(['本院自民國九十二年', '四月二十九日中午起', '實施封院隔離十四日'], 92, 22, { size: 16 });
      lines(['一、院內人員一律不得外出', '二、每日量測體溫二次', '三、發燒 38℃ 以上立即通報', '四、物資由本局統一運補'], 170, 19, { size: 12, align: 'left', x: 14, weight: 'normal' });
      text(c, '92.04.29', w - 16, h - 14, { size: 12, color: '#333', align: 'right', weight: 'normal' });
      stamp(c, 44, h - 36, 24, '衛生局', '霧港市');
    } else if (kind === 'temp') {
      c.fillStyle = '#1f5a8a'; c.fillRect(0, 0, w, 54);
      text(c, '量體溫', w / 2, 28, { size: 32, color: '#fff' });
      lines(['進入院區前', '請先量測體溫'], 78, 22, { size: 17 });
      c.fillStyle = '#e8e8e4'; c.fillRect(w / 2 - 12, 120, 24, 86); c.strokeStyle = '#333'; c.lineWidth = 2; c.strokeRect(w / 2 - 12, 120, 24, 86);
      c.fillStyle = '#c8261e'; c.beginPath(); c.arc(w / 2, 214, 16, 0, 7); c.fill(); c.fillRect(w / 2 - 5, 150, 10, 60);
      for (let i = 0; i < 6; i++) { c.fillStyle = '#333'; c.fillRect(w / 2 + 12, 128 + i * 12, 8, 2); }
      text(c, '額溫 37.5℃ 以上', w / 2, 244, { size: 15, color: '#a8231c' });
      text(c, '請勿進入,立即通報', w / 2, 260, { size: 12, color: '#333', weight: 'normal' });
    } else if (kind === 'mask') {
      c.fillStyle = '#2e7a5a'; c.fillRect(0, 0, w, 46);
      text(c, '請全程配戴口罩', w / 2, 24, { size: 22, color: '#fff' });
      c.fillStyle = '#9cc8d8'; c.beginPath(); c.moveTo(46, 96); c.quadraticCurveTo(w / 2, 70, w - 46, 96); c.lineTo(w - 50, 150); c.quadraticCurveTo(w / 2, 172, 50, 150); c.closePath(); c.fill();
      c.strokeStyle = '#5a8a9a'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(52, 112 + i * 13); c.lineTo(w - 52, 112 + i * 13); c.stroke(); }
      c.strokeStyle = '#ddd'; c.lineWidth = 3; c.beginPath(); c.arc(44, 122, 18, 1.3, 4.9); c.stroke(); c.beginPath(); c.arc(w - 44, 122, 18, -1.8, 1.8); c.stroke();
      lines(['N95 口罩', '每人每日限領一個', '領取請到護理站登記'], 196, 22, { size: 15 });
    } else if (kind === 'ppe') {
      c.fillStyle = '#c87a1a'; c.fillRect(0, 0, w, 42);
      text(c, '穿戴防護裝備順序', w / 2, 22, { size: 19, color: '#fff' });
      const st = ['洗手', '戴 N95 口罩', '戴護目鏡/面罩', '穿隔離衣', '戴手套'];
      st.forEach((s, i) => {
        const y = 66 + i * 40;
        c.fillStyle = '#c87a1a'; c.beginPath(); c.arc(26, y, 13, 0, 7); c.fill();
        text(c, String(i + 1), 26, y + 1, { size: 15, color: '#fff' });
        c.fillStyle = '#d8d2c2'; c.fillRect(46, y - 15, 30, 30); c.strokeStyle = '#777'; c.strokeRect(46, y - 15, 30, 30);
        text(c, s, 84, y, { size: 14, color: '#222', align: 'left', maxW: w - 90 });
      });
      text(c, '脫除順序相反 · 脫完立即洗手', w / 2, h - 14, { size: 11, color: '#7a1010' });
    } else if (kind === 'sars') {
      c.fillStyle = '#e8f0f0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a6a8a'; c.fillRect(0, 0, w, 58);
      text(c, '認識 SARS', w / 2, 22, { size: 24, color: '#fff' });
      text(c, '嚴重急性呼吸道症候群', w / 2, 46, { size: 13, color: '#e0f0f0' });
      lines(['症狀:'], 82, 0, { size: 15, align: 'left', x: 16 });
      lines(['● 發燒(38℃ 以上)', '● 乾咳、呼吸急促', '● 肌肉痠痛、倦怠'], 106, 22, { size: 14, align: 'left', x: 22, weight: 'normal' });
      c.fillStyle = '#2a6a8a'; c.fillRect(14, 182, w - 28, 2);
      lines(['勤洗手 · 戴口罩', '有症狀請主動通報'], 206, 24, { size: 16, color: '#1e4a64' });
    } else if (kind === 'roster') { // 2F 北 護理站值班表(手寫)
      c.fillStyle = '#f2efe4'; c.fillRect(0, 0, w, h);
      text(c, '2F 北 值班表(封院)', w / 2, 18, { size: 15, color: '#111' });
      c.strokeStyle = 'rgba(40,40,40,0.6)'; c.lineWidth = 1;
      for (let i = 0; i <= 12; i++) { c.beginPath(); c.moveTo(8, 34 + i * 18); c.lineTo(w - 8, 34 + i * 18); c.stroke(); }
      for (const x of [8, 56, 124, w - 8]) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x, 34 + 12 * 18); c.stroke(); }
      const day = ['4/29', '4/30', '5/1', '5/2', '5/3', '5/4', '5/5', '5/6', '5/7', '5/8', '5/9', '5/10'];
      const a = ['林', '吳', '陳', '林', '黃', '林', '林', '吳', '林', '—', '', ''], b2 = ['張', '黃', '張', '陳', '吳', '陳', '林', '陳', '(發燒)', '', '', ''];
      day.forEach((d, i) => {
        text(c, d, 32, 43 + i * 18, { size: 12, color: '#222', weight: 'normal', font: hand });
        text(c, a[i], 90, 43 + i * 18, { size: 12, color: i === 6 ? '#a8231c' : '#1c2a6a', weight: 'normal', font: hand });
        text(c, b2[i], 157, 43 + i * 18, { size: 12, color: '#1c2a6a', weight: 'normal', font: hand });
      });
      c.strokeStyle = '#a8231c'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(126, 151 + 2 * 18); c.lineTo(w - 12, 151 + 2 * 18); c.stroke();
      text(c, '護理長：林秀英', w - 12, h - 12, { size: 12, color: '#1c2a6a', align: 'right', weight: 'normal', font: hand });
    } else if (kind === 'family') { // 手寫告示
      c.fillStyle = '#f4f0e0'; c.fillRect(0, 0, w, h);
      lines(['家屬請勿闖入', '病房區'], 40, 30, { size: 22, color: '#a8231c', font: hand });
      lines(['物資、便當', '請送 B1 裝卸平台', '鐵網邊放著就好', '謝謝大家'], 124, 26, { size: 16, color: '#1c2a6a', font: hand, weight: 'normal' });
      text(c, '—— 2F 護理站', w - 14, h - 18, { size: 13, color: '#1c2a6a', align: 'right', weight: 'normal', font: hand });
    } else if (kind === 'templog') { // 夾板上的體溫登記表
      c.fillStyle = '#f2efe4'; c.fillRect(0, 0, w, h);
      text(c, '體溫登記 92/5/5', w / 2, 18, { size: 15 });
      const v = ['36.5', '36.8', '36.4', '37.1', '36.6', '38.4', '36.9', '36.7', '37.6', '36.5', '', ''];
      for (let i = 0; i < 12; i++) {
        const y = 42 + i * 18;
        c.fillStyle = 'rgba(40,40,40,0.5)'; c.fillRect(10, y + 7, w - 20, 1);
        text(c, `${8 + (i >> 1)}:${i & 1 ? '30' : '00'}`, 30, y, { size: 11, color: '#333', weight: 'normal' });
        if (v[i]) text(c, v[i], 110, y, { size: 13, color: v[i] >= '37.5' ? '#a8231c' : '#1c2a6a', weight: 'normal', font: hand });
        if (v[i] >= '37.5') { c.strokeStyle = '#a8231c'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(110, y, 22, 9, 0, 0, 7); c.stroke(); }
      }
    }
    grime(c, w, h, 1.3);
    edge(c, w, h);
    grain(c, 0, 0, w, h, 12);
  });
}
// 小告示/標籤
const isoPlate = () => labRect('sars:iso', 256, 96, (c, w, h) => {
  c.fillStyle = '#b3261e'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f4f0e6'; c.fillRect(6, 6, w - 12, h - 12);
  c.fillStyle = '#b3261e'; c.fillRect(6, 6, w - 12, 50);
  text(c, '隔離病房', w / 2, 32, { size: 34, color: '#fff' });
  text(c, 'ISOLATION · 非請勿入', w / 2, 72, { size: 18, color: '#b3261e' });
  grime(c, w, h, 0.8); grain(c, 0, 0, w, h, 10);
});
const tapeRect = () => labRect('sars:tape', 512, 32, (c, w, h) => {
  c.fillStyle = '#e2b420'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 128) text(c, '隔離區 禁止進入', x + 64, h / 2 + 1, { size: 17, color: '#151515' });
  c.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < w; x += 6) c.fillRect(x, 0, 1, h);
  grime(c, w, h, 0.5);
});
const zoneRect = (kind) => labRect(`sars:zone:${kind}`, 256, 48, (c, w, h) => {
  const red = kind === 'dirty';
  c.fillStyle = red ? '#b3261e' : '#2a7a4a'; c.fillRect(0, 0, w, h);
  text(c, red ? '污染區 CONTAMINATED' : '清潔區 CLEAN ZONE', w / 2, h / 2 + 1, { size: 22, color: '#f4f0e6', maxW: w - 16 });
  c.globalCompositeOperation = 'destination-out'; // 被踩掉的部分
  for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(0,0,0,${rr(0.2, 0.7)})`; c.beginPath(); c.ellipse(rnd() * w, rnd() * h, rr(2, 10), rr(1, 4), rnd() * 3, 0, 7); c.fill(); }
  c.globalCompositeOperation = 'source-over';
  grime(c, w, h, 1.2);
});
const boxPrint = () => labRect('sars:maskbox', 128, 64, (c, w, h) => {
  c.fillStyle = '#ecece4'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#2e7a5a'; c.fillRect(0, 0, w, 18);
  text(c, '醫用口罩', w / 2, 10, { size: 13, color: '#fff' });
  text(c, '50 入', w / 2, 34, { size: 15, color: '#2e7a5a' });
  text(c, 'SURGICAL MASK', w / 2, 52, { size: 9, color: '#555', weight: 'normal' });
  grime(c, w, h, 0.8);
});
const tentRect = () => labRect('sars:tent', 160, 64, (c, w, h) => {
  c.fillStyle = '#f2efe4'; c.fillRect(0, 0, w, h);
  text(c, '量體溫', w / 2, 26, { size: 26, color: '#a8231c', font: hand });
  text(c, '請排隊', w / 2, 52, { size: 14, color: '#1c2a6a', weight: 'normal', font: hand });
  grime(c, w, h, 0.6);
});
const aframeRect = () => labRect('sars:aframe', 160, 224, (c, w, h) => {
  c.fillStyle = '#f0ece0'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1f5a8a'; c.fillRect(0, 0, w, 64);
  text(c, '量體溫站', w / 2, 28, { size: 30, color: '#fff' });
  text(c, 'Temperature Check', w / 2, 52, { size: 12, color: '#d8e8f0', weight: 'normal' });
  text(c, '請排隊', w / 2, 100, { size: 24 });
  text(c, '保持一公尺距離', w / 2, 134, { size: 16, color: '#333' });
  text(c, '未戴口罩', w / 2, 176, { size: 16, color: '#a8231c' });
  text(c, '請勿進入', w / 2, 200, { size: 16, color: '#a8231c' });
  grime(c, w, h, 1.4); edge(c, w, h);
});

// ---------------------------------------------------------------- 模型
const n95 = () => tpl('sars:n95', (b) => {
  b.sph('fab_white', 0.07, 0, 0.004, 0, { sx: 1, sy: 0.45, sz: 0.82, tl: Math.PI / 2, ws: 10, hs: 4 });
  b.tor('pl_yellow', 0.075, 0.0025, 0, 0.006, -0.01, { rx: HALF, rs: 3, ts: 12 });
  b.box('alu', 0.05, 0.003, 0.008, 0, 0.032, 0.045);
  b.meta.cap = 1024;
});
const surgical = () => tpl('sars:surg', (b) => {
  b.box('pl_ltblue', 0.175, 0.006, 0.095, 0, 0.004, 0, { r: 0.002 });
  for (let i = -1; i <= 1; i++) b.box('fab_white', 0.17, 0.003, 0.004, 0, 0.0075, i * 0.022);
  for (const s of [-1, 1]) b.tor('fab_white', 0.04, 0.0015, s * 0.11, 0.004, 0, { rx: HALF, rs: 3, ts: 10 });
  b.meta.cap = 1024;
});
const glove = () => tpl('sars:glove', (b) => {
  b.box('pl_white', 0.085, 0.012, 0.1, 0, 0.006, 0, { r: 0.005 });
  for (let i = 0; i < 4; i++) b.rod('pl_white', 0.008, [-0.03 + i * 0.02, 0.006, 0.05], [-0.032 + i * 0.022, 0.006, 0.12 - Math.abs(i - 1.5) * 0.012], { seg: 5 });
  b.rod('pl_white', 0.009, [0.04, 0.006, 0.01], [0.075, 0.006, 0.06], { seg: 5 });
  b.meta.cap = 512;
});
const shoeCover = () => tpl('sars:shoecov', (b) => { b.sph('pl_ltblue', 0.08, 0, 0.0, 0, { sx: 0.7, sy: 0.25, sz: 1.4, tl: Math.PI / 2, ws: 8, hs: 3 }); b.meta.cap = 512; });
function thermoGun(b, x, y, z, ry) {
  b.push(x, y, z, 0, ry, HALF * 0.98);
  b.box('pl_white', 0.15, 0.045, 0.04, 0.0, 0.0, 0, { r: 0.012 });
  b.box('pl_gray', 0.035, 0.09, 0.03, -0.035, -0.055, 0, { r: 0.008, rz: 0.25 });
  b.box('glass_dark', 0.035, 0.024, 0.002, -0.05, 0.012, 0.021);
  b.cyl('pl_gray', 0.012, 0.02, 0.083, 0, 0, { axis: 'x', seg: 8 });
  b.pop();
}
function sanitizer(b, x, y, z) {
  b.lathe('pl_white', [[0, 0], [0.04, 0], [0.042, 0.004], [0.042, 0.15], [0.03, 0.17], [0.012, 0.18], [0, 0.18]], x, y, z, { seg: 12 });
  b.cyl('pl_white', 0.014, 0.05, x, y + 0.2, z, { seg: 8 });
  b.box('pl_white', 0.06, 0.012, 0.016, x + 0.022, y + 0.225, z);
  b.plane(L(boxPrint()), 0.06, 0.04, x, y + 0.08, z + 0.0425);
}
function maskBox(b, x, y, z, ry = 0, open = false) {
  b.push(x, y, z, 0, ry, 0);
  b.box('cardboard', 0.19, 0.09, 0.1, 0, 0.045, 0, { r: 0.003 });
  b.plane(L(boxPrint()), 0.186, 0.088, 0, 0.045, 0.051);
  b.plane(L(boxPrint()), 0.186, 0.088, 0, 0.045, -0.051, { ry: Math.PI });
  if (open) { b.box('cardboard', 0.12, 0.004, 0.06, 0.02, 0.092, -0.02, { rx: -0.6 }); b.box('pl_ltblue', 0.15, 0.02, 0.08, 0, 0.085, 0.004, { rz: 0.1 }); }
  b.pop();
}
// 量體溫站:折疊桌 + 額溫槍 + 夾板登記表 + 口罩盒 + 乾洗手 + 桌牌
const thermoStation = () => tpl('sars:station', (b) => {
  const W = 1.2, D = 0.6, H = 0.74;
  b.box('pl_cream', W, 0.03, D, 0, H - 0.015, 0, { r: 0.006 });
  b.box('alu', W + 0.01, 0.03, D + 0.01, 0, H - 0.04, 0, { r: 0.004 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.rod('steel', 0.013, [sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.06)], [sx * (W / 2 - 0.08), H - 0.05, sz * (D / 2 - 0.06)], { seg: 6 });
    b.rod('steel', 0.009, [sx * (W / 2 - 0.08), 0.18, -(D / 2 - 0.06)], [sx * (W / 2 - 0.08), 0.18, D / 2 - 0.06], { seg: 5 });
  }
  thermoGun(b, -0.3, H + 0.03, 0.05, 0.4);
  b.box('cardboard', 0.23, 0.006, 0.32, 0.05, H + 0.003, 0.02, { ry: -0.15 }); // 夾板
  b.plane(L(sarsSheet('templog')), 0.21, 0.29, 0.05, H + 0.0075, 0.02, { rx: -HALF, rz: 0.15 });
  b.box('steel', 0.08, 0.012, 0.025, 0.05, H + 0.012, -0.12, { ry: -0.15 });
  b.rod('pl_blue', 0.004, [0.18, H + 0.006, 0.12], [0.24, H + 0.006, 0.16], { seg: 4 }); // 原子筆
  maskBox(b, 0.42, H, -0.14, 0.2, true);
  maskBox(b, 0.43, H + 0.09, -0.12, -0.1, false);
  sanitizer(b, -0.47, H, -0.18);
  b.box('paper', 0.16, 0.06, 0.004, -0.1, H + 0.04, -0.22, { rx: -0.35 }); // 桌牌(三角)
  b.plane(L(tentRect()), 0.155, 0.058, -0.1, H + 0.041, -0.218, { rx: -0.35 + 0.0, ry: 0 });
  b.box('paper', 0.16, 0.06, 0.004, -0.1, H + 0.04, -0.25, { rx: 0.35 });
  b.surface(-0.55, -0.25, 0.3, 0.25, H);
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, H, D / 2));
});
// A 字立牌
const aFrame = () => tpl('sars:aframe', (b) => {
  const h = 1.05, w = 0.5;
  for (const s of [-1, 1]) {
    b.push(0, 0, s * 0.16, s * -0.16, 0, 0);
    b.box('enamel_white', w, h, 0.02, 0, h / 2, 0, { r: 0.008 });
    b.plane(L(aframeRect()), w * 0.86, h * 0.86, 0, h / 2 + 0.02, s * 0.0105, { ry: s < 0 ? Math.PI : 0 });
    b.pop();
  }
  b.box('steel', w * 0.9, 0.02, 0.02, 0, h - 0.01, 0);
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -0.32), new THREE.Vector3(w / 2, h, 0.32));
});
// 排隊欄柱(n 根,間距 g,其中一條帶子掉在地上)
const queueLine = (n = 3, g = 1.15) => tpl(`sars:queue:${n}`, (b) => {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * g;
    b.cyl('enamel_black', 0.16, 0.025, x, 0.0125, 0, { seg: 14 });
    b.cyl('chrome', 0.028, 0.92, x, 0.48, 0, { seg: 10 });
    b.cyl('chrome', 0.04, 0.07, x, 0.95, 0, { seg: 10 });
    if (i < n - 1) {
      if (i === 0) { // 掉下來的帶子
        b.tube('fab_red', [[x + 0.04, 0.9, 0], [x + 0.08, 0.5, 0.05], [x + 0.18, 0.02, 0.12], [x + 0.6, 0.012, 0.2]], 0.008, { seg: 3, bend: 0.1 });
      } else b.tube('fab_red', [[x + 0.04, 0.9, 0], [x + g / 2, 0.84, 0], [x + g - 0.04, 0.9, 0]], 0.012, { seg: 3, bend: 0.3 });
    }
  }
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-((n - 1) / 2) * g - 0.16, 0, -0.16), new THREE.Vector3(((n - 1) / 2) * g + 0.16, 0.95, 0.16));
});
// 門口被扯斷的封鎖膠帶(在門的走廊側,沿門框垂下;模板 X 沿牆、+Z 朝走廊)
const tornTape = (seed = 0) => tpl(`sars:torn:${seed % 4}`, (b) => {
  const r = (k) => { const x = Math.sin(seed * 41.7 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const strip = (pts) => { // 一條膠帶:以點列做成細長平面(寬 5cm)
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x, y, z] = pts[i];
      if (i) acc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1], z - pts[i - 1][2]);
      pos.push(x, y + 0.025, z, x, y - 0.025, z);
      uv.push(acc / 1.5, 1, acc / 1.5, 0);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    b.raw(L(tapeRect()), g, null, 'rect');
  };
  for (const s of [-1, 1]) {
    const x0 = s * 0.96, y0 = 1.05 + r(s) * 0.4;
    strip([[x0, y0, 0.03], [x0 - s * 0.12, y0 - 0.25, 0.06], [x0 - s * 0.16, y0 - 0.55 - r(s + 3) * 0.3, 0.08]]);
    strip([[x0, y0 + 0.3, 0.03], [x0 - s * 0.2, y0 + 0.18, 0.05], [x0 - s * 0.24, y0 - 0.1, 0.06]]);
  }
  if (r(9) < 0.6) strip([[-0.2, 0.004, 0.4], [0.2, 0.004, 0.55], [0.7, 0.004, 0.45]]); // 地上一段
  b.meta.cap = 64;
});
// 從天花板垂下、拆了一半的塑膠布(隔離區的臨時隔間),頂端黃色膠帶
export const plasticWall = (len = 3.2, top = 3.3, seed = 0) => tpl(`sars:plastic:${len.toFixed(1)}:${top.toFixed(2)}:${seed % 3}`, (b) => {
  const path = [[-len / 2, 0], [len / 2, 0]];
  const g = curtainGeo(path, top, 0.25 + (seed % 3) * 0.3, { pleat: 0.06, holes: 0.25, rag: 0.7, seed: 11 + seed, bunch: 0.15 * (seed % 3) });
  b.raw('pl_clear', g, null, 'keep');
  b.box('pl_yellow', len * 0.8, 0.05, 0.004, 0, top - 0.04, 0.02);
  const heap = drape(1.4, 0.9, (x, z) => 0.05 * Math.max(0, 1 - (x * x) / 0.5 - (z * z) / 0.2) + 0.02 * Math.sin(x * 9 + seed) * Math.sin(z * 11), { nx: 10, nz: 8, seed: 5 + seed, wrinkle: 0.015 });
  b.raw('pl_clear', heap, new THREE.Matrix4().makeTranslation(len * 0.25, 0.01, 0.45), 'keep');
});
// 丟在地上的隔離衣(皺成一團)
const gown = (seed = 0) => tpl(`sars:gown:${seed % 3}`, (b) => {
  const col = ['fab_yellow', 'fab_blue', 'fab_white'][seed % 3];
  const g = drape(0.9, 0.7, (x, z) => 0.09 * Math.max(0, 1 - (x * x) / 0.16 - (z * z) / 0.1) + 0.035 * Math.sin(x * 13 + seed) * Math.cos(z * 9), { nx: 12, nz: 10, seed: 3 + seed, wrinkle: 0.02 });
  b.raw(col, g, new THREE.Matrix4().makeTranslation(0, 0.005, 0), 'keep');
  b.rod(col, 0.01, [0.3, 0.01, 0.1], [0.55, 0.008, 0.3], { seg: 4 }); // 綁帶
  b.meta.cap = 128;
});
// 面罩(地上,側躺)
const faceShield = () => tpl('sars:shield', (b) => {
  b.cyl('pl_clear', 0.11, 0.22, 0, 0.11, 0, { seg: 12, open: true, t0: -1.3, tl: 2.6 });
  b.box('foam', 0.2, 0.03, 0.03, 0, 0.215, -0.09);
  b.tor('pl_blue', 0.09, 0.004, 0, 0.215, -0.02, { rx: HALF, rs: 3, ts: 12, arc: Math.PI });
  b.meta.cap = 128;
});
// 生物醫療廢棄物袋(紅/黃,束口)
const bioBag = (k = 0) => tpl(`sars:bag:${k % 2}`, (b) => {
  const c = k % 2 ? 'pl_yellow' : 'pl_red';
  b.sph(c, 0.28, 0, 0.22, 0, { sx: 1, sy: 0.82, sz: 0.85, ws: 12, hs: 8 });
  b.lathe(c, [[0.05, 0], [0.03, 0.06], [0.06, 0.12], [0.02, 0.15], [0, 0.16]], 0, 0.44, 0, { seg: 8 });
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.26, 0, -0.24), new THREE.Vector3(0.26, 0.5, 0.24));
});
// 公告欄(軟木 + 防疫告示)
const sarsBoard = (seed = 0) => tpl(`sars:board:${seed % 3}`, (b) => {
  const w = 1.2, h = 0.8;
  b.box('wood_old', w, h, 0.025, 0, h / 2, 0.0125, { r: 0.006 });
  b.box('cork', w - 0.06, h - 0.06, 0.004, 0, h / 2, 0.026);
  const kinds = [['lock', 'temp', 'mask', 'roster'], ['sars', 'ppe', 'family', 'lock'], ['mask', 'templog', 'sars', 'temp']][seed % 3];
  const R = (k) => { const x = Math.sin(seed * 77 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
  kinds.forEach((k, i) => {
    const pw = 0.21, ph = pw * 1.4, x = -w / 2 + 0.16 + i * 0.28 + (R(i) - 0.5) * 0.04, y = 0.1 + (i % 2) * 0.06 + R(i + 5) * 0.06;
    b.plane(L(sarsSheet(k)), pw, ph, x, y + ph / 2, 0.03 + i * 0.0006, { rz: (R(i + 29) - 0.5) * 0.12 });
    b.cyl(['pl_red', 'pl_blue', 'pl_yellow', 'pl_green'][i % 4], 0.006, 0.01, x, y + ph * 0.94, 0.036, { axis: 'z', seg: 6 });
  });
  b.meta.mount = true;
});
// 延長線(地上拖一段,接到某個道具)
const extCord = (len = 3, seed = 0) => tpl(`sars:cord:${len.toFixed(1)}:${seed % 3}`, (b) => {
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push([(i / 6) * len, 0.008, Math.sin(i * 1.7 + seed) * 0.12]);
  cable(b, pts, 0.006, 'pl_white');
  b.box('pl_white', 0.22, 0.04, 0.06, len + 0.12, 0.02, pts[6][2], { r: 0.008 }); // 插座盒
  b.box('pl_red', 0.012, 0.012, 0.008, len + 0.02, 0.042, pts[6][2]);
});

// ---------------------------------------------------------------- 擺設
const PPE_LITTER = (n) => [['sars_n95', n], ['sars_surg', Math.round(n * 1.4)], ['sars_glove', Math.round(n * 0.6)], ['sars_shoe', Math.round(n * 0.3)]];
const TPL = { sars_n95: n95, sars_surg: surgical, sars_glove: glove, sars_shoe: shoeCover };
function ppe(R, spec, o = {}) {
  for (const [name, n] of spec) {
    const t = TPL[name]();
    const cells = [...R.plain];
    if (!cells.length) return;
    for (let k = 0, placed = 0; k < n * 4 && placed < n; k++) {
      let x, z;
      if (o.near) { const a = R.rng() * Math.PI * 2, d = Math.sqrt(R.rng()) * o.near.r; x = o.near.x + Math.cos(a) * d; z = o.near.z + Math.sin(a) * d; }
      else { const key = R.pick(cells); x = ((key % R.L.W) + R.rng()) * 2; z = (((key / R.L.W) | 0) + R.rng()) * 2; }
      if (!R.freeAt(x, z, 0.04)) continue;
      R.I(name, t, x, R.y, z, R.rng() * Math.PI * 2, R.rand(-0.08, 0.08), R.rand(-0.08, 0.08), R.rand(0.95, 1.05));
      placed++;
    }
  }
}
// 一扇門外側(走廊側)的牆面中心與法線:d = R.doors 的元素,法線朝房間(R 所在區域)
const doorOut = (d) => ({ x: d.x + d.nx * 1.0, z: d.z + d.nz * 1.0, yaw: Math.atan2(d.nx, d.nz) });

export const sarsStats = {};
export function dressSars(R, zone) {
  const L = R.L, lv = L.levels[R.li].id, th = zone.theme;
  const c0 = { ...R.count };
  try { dressSarsZone(R, zone, R.L, lv, th); } finally {
    const d = { st: R.count.statics - c0.statics, inst: R.count.inst - c0.inst, col: R.count.colliders - c0.colliders };
    if (d.st || d.inst) sarsStats[zone.id] = d;
    if (typeof window !== 'undefined') window.__sarsStats = sarsStats;
  }
}
function dressSarsZone(R, zone, LY, lv, th) {
  const area = R.cells.size;
  // ---- 1F 大廳:入口內側的量體溫站、排隊欄柱、立牌 ----
  if (th === 'lobby') {
    let st = null;
    for (const [x, z, yaw] of [[69.6, 64.9, HALF + 0.06], [69.0, 64.6, HALF - 0.1], [50.6, 64.9, -HALF + 0.05], [72.4, 64.9, HALF]]) if ((st = R.tryPut(thermoStation(), x, z, yaw, {}))) break;
    if (st) {
      R.put(extCord(2.4, 1), st.x + 0.4, st.z - 0.5, -0.3);
      R.tryPut(aFrame(), st.x < 60 ? st.x + 3.4 : st.x - 5.8, 65.1, 0.15, {});
      R.tryPut(rotY(queueLine(3, 1.1)), st.x < 60 ? 56.4 : 63.5, 61.8, 0.02, {});
      ppe(R, [['sars_surg', 8], ['sars_n95', 4]], { near: { x: st.x - 1.2, z: st.z - 0.6, r: 1.5 } });
    }
    const W = R.run('W'), E = R.run('E');
    if (W) R.atWall(sarsBoard(0), W, 63.4, { mount: 1.2 });
    if (E) R.atWall(posterSheet(sarsSheet('temp'), 0.32, 0.45, { curl: 0.05 }), E, 59.0, { mount: 1.35 });
    ppe(R, PPE_LITTER(10));
    ppe(R, [['sars_surg', 6]], { near: { x: 65.5, z: 64.0, r: 1.6 } });
    return;
  }
  // ---- 走廊:告示、門口的封鎖膠帶(2F 病房區 = 隔離病房)、污染區/清潔區地標、拆一半的塑膠布、口罩手套 ----
  if (th === 'corridor') {
    const wardWing = lv === '2F';
    // 2F 北翼病房門(封院時的隔離病房):門旁牆上(走廊側、門牌上方)貼「隔離病房」牌;告示避開這些位置
    const CELL = LY.CELL || 2, wardDoors = [];
    if (wardWing) for (const d of R.doors) { const o = LY.zoneAt(R.li, d.c - d.nx, d.r - d.nz); if (o && o.theme === 'ward') wardDoors.push(d); }
    const nearWardDoor = (run, t) => wardDoors.some((d) => d.nx === run.nx && d.nz === run.nz && Math.abs((run.horiz ? d.x : d.z) - t) < CELL / 2 + 1.3);
    for (const d of wardDoors) {
      const horiz = d.nx === 0, tc = horiz ? d.x : d.z, plane = horiz ? d.z + d.nz * CELL / 2 : d.x + d.nx * CELL / 2;
      if (wardDoors.some((e) => e !== d && e.nx === d.nx && e.nz === d.nz && Math.abs((horiz ? e.x : e.z) - tc - CELL) < 0.01)) continue; // 雙門只貼一次(貼在 + 側那扇)
      const run = R.walls.find((r) => r.nx === d.nx && r.nz === d.nz && Math.abs(r.plane - plane) < 0.01 && r.t0 <= tc + CELL / 2 + 0.3 && r.t1 >= tc + CELL / 2 + 0.75);
      if (run && !R.isWindow(run, tc + CELL / 2 + 0.2, tc + CELL / 2 + 0.7)) R.atWall(posterSheet(isoPlate(), 0.36, 0.135), run, tc + CELL / 2 + 0.45, { mount: 1.74 });
    }
    for (const run of R.walls) {
      if (run.len < 2.4) continue;
      for (let t = run.t0 + R.rand(0.8, 3); t < run.t1 - 0.6; t += R.rand(6, 12)) {
        if (R.isWindow(run, t - 0.4, t + 0.4) || nearWardDoor(run, t)) continue;
        const k = R.rng();
        if (k < 0.3) R.atWall(sarsBoard(R.rng.int(0, 2)), run, t, { mount: 1.15 });
        else R.atWall(posterSheet(sarsSheet(R.pick(wardWing ? ['mask', 'ppe', 'family', 'sars'] : ['temp', 'mask', 'sars', 'lock'])), 0.3, 0.42, { curl: R.rand(0, 0.1) }), run, t, { mount: R.rand(1.3, 1.45) });
      }
    }
    if (wardWing) {
      for (const d of R.doors) {
        const other = LY.zoneAt(R.li, d.c - d.nx, d.r - d.nz);
        if (!other || other.theme !== 'ward') continue;
        const o = doorOut(d);
        if (R.chance(0.75)) R.put(tornTape(d.c + d.r), o.x, o.z, o.yaw);
        ppe(R, [['sars_surg', R.rng.int(1, 4)], ['sars_n95', R.rng.int(0, 2)], ['sars_glove', R.rng.int(1, 3)], ['sars_shoe', R.rng.int(0, 2)]], { near: { x: o.x + d.nx * 0.9, z: o.z + d.nz * 0.9, r: 1.1 } });
      }
      // 北翼病房區兩端:污染區/清潔區地標(橫跨走廊的地貼)
      const z0 = 24, z1 = 28;
      for (const [x, kind] of [[22.5, 'clean'], [97.5, 'clean']]) {
        const t = tpl(`sars:floorzone:${kind}`, (b) => { b.plane(L(zoneRect(kind)), 3.6, 0.42, 0, 0, 0, { rx: -HALF }); b.plane(L(zoneRect('dirty')), 3.6, 0.42, 0, 0, 0.5, { rx: -HALF }); });
        R.put(t, x, (z0 + z1) / 2, x < 60 ? HALF : -HALF, { y: R.y + 0.006 });
      }
      // 一段拆了一半的塑膠布(靠北牆、避開門口)
      const N = R.run('N', (r) => r.len > 6 && r.plane < 25);
      if (N) {
        const p = R.at(N, N.t0 + 3.2, 0.25);
        const top = LY.ceilY(R.li, Math.floor(p.x / 2), Math.floor(p.z / 2)) - R.y - 0.05;
        if (Number.isFinite(top)) R.put(plasticWall(3.0, Math.min(3.35, top), 1), p.x, p.z, N.yaw);
      }
      // 防護裝備推車 + 廢棄物袋(護理站附近)
      const S = R.run('S', (r) => r.len > 5 && r.plane < 30 && r.t0 > 78); // 護理站(207 旁)對面
      if (S) {
        const cart = R.atWall(rotY(supplyCart(1)), S, S.t0 + 1.4, { gap: 0.1 });
        if (cart) { const tp = R.topOf(cart, 0); if (tp) { onSurface(R, tp, 'pillbox', 2); R.put(tpl('sars:cartbox', (b) => { maskBox(b, 0, 0, 0, 0.3, true); maskBox(b, 0.16, 0, 0.12, -0.4, false); }), (tp.x0 + tp.x1) / 2, (tp.z0 + tp.z1) / 2, cart.yaw, { y: tp.y }); } }
        R.atWall(bioBag(0), S, S.t0 + 3.0, { gap: 0.06 });
        R.atWall(bioBag(1), S, S.t0 + 3.7, { gap: 0.06 });
        R.atWall(sarsBoard(0), S, S.t0 + 5.6, { mount: 1.2 });
        ppe(R, [['sars_surg', 6], ['sars_glove', 4], ['sars_n95', 3]], { near: { x: S.t0 + 3.5, z: 26.5, r: 1.6 } });
      }
      for (let i = 0; i < 4; i++) { const key = R.pick([...R.plain]); if (key == null) break; const x = ((key % LY.W) + R.rng()) * 2, z = (((key / LY.W) | 0) + R.rng()) * 2; if (R.freeAt(x, z, 0.4)) R.I('sars_gown' + (i % 3), gown(i), x, R.y, z, R.rng() * 6.28); }
      ppe(R, PPE_LITTER(Math.round(area * 0.2)));
    } else ppe(R, PPE_LITTER(Math.round(area * 0.07)));
    return;
  }
  // ---- 病房(2F 北翼在封院時當隔離病房)、加護病房、急診 ----
  if (th === 'ward' || th === 'icu' || th === 'er' || th === 'peds_ward') {
    const iso = th === 'ward' || th === 'icu';
    const runs = R.walls.filter((r) => r.len >= 2.5);
    if (iso && runs.length) {
      const run = runs[R.rng.int(0, runs.length - 1)];
      R.atWall(posterSheet(isoPlate(), 0.36, 0.135), run, R.rand(run.t0 + 0.4, run.t1 - 0.4), { mount: 1.7 });
    }
    if (runs.length && R.chance(0.6)) { const run = R.pick(runs); R.atWall(posterSheet(sarsSheet(R.pick(['ppe', 'mask', 'sars'])), 0.3, 0.42, { curl: 0.06 }), run, R.rand(run.t0 + 0.5, run.t1 - 0.5), { mount: 1.4 }); }
    ppe(R, PPE_LITTER(Math.round(area * 0.4)));
    const c = R.center();
    if (R.chance(0.7)) { const x = c.x + R.rand(-1.5, 1.5), z = c.z + R.rand(-1.5, 1.5); if (R.freeAt(x, z, 0.4)) { const v = R.rng.int(0, 2); R.I('sars_gown' + v, gown(v), x, R.y, z, R.rng() * 6.28); } }
    if (R.chance(0.5)) { const x = c.x + R.rand(-2, 2), z = c.z + R.rand(-2, 2); if (R.freeAt(x, z, 0.2)) R.I('sars_shield', faceShield(), x, R.y + 0.02, z, R.rng() * 6.28, HALF * 0.95, 0); }
    if (th === 'er' || (th === 'icu' && R.chance(0.5))) { const run = R.pick(runs); if (run) R.atWall(bioBag(R.rng.int(0, 1)), run, R.rand(run.t0 + 0.5, run.t1 - 0.5), { gap: 0.06 }); }
    if (th === 'er') { const N = R.run('N'); if (N && N.len > 4) { const p = R.at(N, (N.t0 + N.t1) / 2, 0.3); const top = LY.ceilY(R.li, Math.floor(p.x / 2), Math.floor(p.z / 2)) - R.y - 0.05; if (Number.isFinite(top)) R.put(plasticWall(2.6, Math.min(3.3, top), 2), p.x, p.z, N.yaw); } }
    return;
  }
  // ---- 候診區、藥局、餐廳、樓梯間:告示 + 口罩 ----
  if (['waiting', 'pharmacy', 'cafeteria', 'stairwell', 'xray', 'ct', 'security', 'rehab'].includes(th)) {
    const runs = R.walls.filter((r) => r.len >= 2.2);
    const n = th === 'stairwell' ? 1 : 2;
    for (let i = 0; i < n && runs.length; i++) {
      const run = R.pick(runs), t = R.rand(run.t0 + 0.5, run.t1 - 0.5);
      if (R.isWindow(run, t - 0.3, t + 0.3)) continue;
      R.atWall(posterSheet(sarsSheet(R.pick(th === 'stairwell' ? ['lock', 'family'] : ['temp', 'mask', 'sars'])), 0.3, 0.42, { curl: R.rand(0, 0.08) }), run, t, { mount: 1.4 });
    }
    if (th === 'pharmacy') for (let i = 0; i < 5; i++) { const key = R.pick([...R.plain]); if (key == null) break; const x = ((key % LY.W) + R.rng()) * 2, z = (((key / LY.W) | 0) + R.rng()) * 2; if (R.freeAt(x, z, 0.15)) R.put(tpl(`sars:emptybox:${i % 2}`, (b) => maskBox(b, 0, 0, 0, 0, true)), x, z, R.rng() * 6.28); }
    ppe(R, PPE_LITTER(Math.round(area * (th === 'stairwell' ? 0.08 : 0.05))));
    return;
  }
  // ---- 地下室倉庫/洗衣房:整箱的防疫物資、廢棄物袋 ----
  if (th === 'supply' || th === 'laundry') {
    for (let i = 0; i < 4; i++) {
      const p = R.floor(cardboardBox(0.6, 0.45, 0.42, i, i % 2 === 0), {});
      if (p && R.chance(0.7)) { const tp = R.topOf(p, 0); if (tp) R.put(tpl('sars:cartbox', (b) => { maskBox(b, 0, 0, 0, 0.3, true); maskBox(b, 0.16, 0, 0.12, -0.4, false); }), (tp.x0 + tp.x1) / 2, (tp.z0 + tp.z1) / 2, R.rng() * 6.28, { y: tp.y }); }
    }
    for (let i = 0; i < 3; i++) R.floor(bioBag(i), {});
    ppe(R, PPE_LITTER(Math.round(area * 0.04)));
  }
}
