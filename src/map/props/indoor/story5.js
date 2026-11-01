// [scene r5] 其餘房間的故事層(STORY_v2):ICU、小兒病房、產房、院長室(萬嵐層)、廣播室、監控室的光、洗衣房、六間病房
// 全部用共用道具材質(tpl → 自動帶 src/mats 表面資料);文字是道具上的字。
import { tpl, L, G, THREE, caster, knob, led, cable } from './parts.js';
import { labRect } from './atlas.js';
import { glowSwatch, monitorScreen } from './art.js';
import { text } from './tex.js';
import { plasticWall } from './sars.js';
import { kidBed } from './decor.js';
import { ventilator as icuVent } from './equip.js';

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const glowScr = (c) => G(glowSwatch(c, c));

// ---------------- ICU ----------------
// 推車上的 14 吋 CRT 生命徵象監視器(綠色波形;2003 年的機型,米色外殼、後殼凸出)
const vitalCart = (k) => tpl(`r5:vitalcart:${k % 2}`, (b) => {
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; b.rod('chrome', 0.011, [0, 0.085, 0], [Math.cos(a) * 0.25, 0.06, Math.sin(a) * 0.25], { seg: 5 }); caster(b, Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.06, { r: 0.022 }); }
  b.cyl('chrome', 0.017, 0.84, 0, 0.5, 0, { seg: 8 });
  b.box('pl_gray', 0.44, 0.025, 0.38, 0, 0.93, 0, { r: 0.008 }); // 托盤
  for (const sx of [-1, 1]) b.box('pl_gray', 0.012, 0.05, 0.38, sx * 0.214, 0.955, 0); // 托盤擋邊
  b.box('pl_beige', 0.37, 0.31, 0.22, 0, 1.1, 0.05, { r: 0.022 }); // 前殼
  b.box('pl_beige', 0.27, 0.23, 0.17, 0, 1.1, -0.13, { r: 0.03 }); // 映像管後殼
  b.box('pl_dark', 0.3, 0.23, 0.012, 0, 1.115, 0.158, { r: 0.004 }); // 螢幕框
  b.plane(G(monitorScreen(k % 2 ? 'ecg' : 'vitals')), 0.27, 0.2, 0, 1.115, 0.1655);
  for (let i = 0; i < 4; i++) b.cyl('pl_dark', 0.009, 0.012, -0.12 + i * 0.05, 0.975, 0.165, { axis: 'z', seg: 8 }); // 旋鈕列
  led(b, 0.14, 0.975, 0.164, '#30ff60', 0.005);
  b.box('pl_gray', 0.2, 0.012, 0.012, 0, 1.27, 0.14, { r: 0.004 }); // 提把
  // 導線:從螢幕側垂到托盤下、再往床邊(血氧夾、心電圖導線)
  cable(b, [[0.17, 1.02, -0.02], [0.24, 0.9, 0.0], [0.27, 0.6, 0.06], [0.33, 0.3, 0.1], [0.42, 0.04, 0.18]], 0.005, 'pl_gray');
  cable(b, [[0.17, 1.0, 0.03], [0.26, 0.86, 0.12], [0.36, 0.78, 0.16], [0.5, 0.74, 0.12]], 0.004, 'pl_ltblue');
  b.box('pl_dark', 0.14, 0.05, 0.1, -0.08, 0.968, -0.08, { r: 0.008 }); // 記錄器(熱感紙)
  b.box('paper', 0.05, 0.004, 0.22, -0.08, 0.944, 0.06, { rx: 0.08 }); // 一截掉出來的記錄紙
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.28, 0, -0.28), new THREE.Vector3(0.28, 1.28, 0.28));
});
// 負壓前室:鋁框 + 拉鍊門 + 告示(塑膠布本體用 sars.plasticWall)。模板 X 沿牆、+Z 朝 ICU 內
const anteRect = () => labRect('r5:ante', 160, 112, (c, w, h) => {
  c.fillStyle = '#e8d84a'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  text(c, '負壓隔離前室', w / 2, 24, { size: 19, color: '#9a1010' });
  text(c, 'ANTEROOM', w / 2, 44, { size: 12, color: '#222' });
  text(c, '進入前:N95・隔離衣', w / 2, 66, { size: 12, color: '#111', weight: 'normal' });
  text(c, '手套・護目鏡 / 拉鍊隨手拉上', w / 2, 84, { size: 11, color: '#111', weight: 'normal' });
  text(c, '92.4.24 感控', w - 36, h - 16, { size: 9, color: '#444', weight: 'normal' });
});
const anteFrame = (len, top) => tpl(`r5:anteframe:${len.toFixed(1)}:${top.toFixed(2)}`, (b) => {
  const p = 0.035;
  for (const x of [-len / 2 + 0.03, len / 2 - 0.03, -0.42, 0.42]) b.box('alu', p, top, p, x, top / 2, 0); // 立柱(兩端靠牆、門框兩根)
  b.box('alu', len - 0.04, p, p, 0, top - p / 2, 0); // 頂樑
  b.box('alu', 0.84, p, p, 0, 2.05, 0); // 門楣
  for (const x of [-0.4, 0.4]) b.box('pl_dark', 0.012, 2.0, 0.006, x, 1.03, 0.022); // 拉鍊
  b.box('alu', 0.03, 0.06, 0.012, 0.4, 1.25, 0.03); // 拉鍊頭
  b.box('pl_yellow', len - 0.1, 0.004, 0.05, 0, 0.002, -0.3); // 地上黃線(污染/清潔分界)
  b.box('pl_white', 0.34, 0.24, 0.005, 0.72, 1.55, 0.024); // 告示背板
  b.plane(L(anteRect()), 0.32, 0.22, 0.72, 1.55, 0.028);
  b.box('paper', 0.18, 0.24, 0.002, -0.75, 1.45, 0.022, { rz: 0.06 }); // 手寫的出入登記
});
// 前室的隔離衣推車:三層、上層一箱 N95 和手套盒、側掛隔離衣
const ppeTrolley = () => tpl('r5:ppecart', (b) => {
  const W = 0.62, D = 0.42;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box('chrome', 0.022, 0.84, 0.022, sx * (W / 2 - 0.02), 0.5, sz * (D / 2 - 0.02)); caster(b, sx * (W / 2 - 0.03), sz * (D / 2 - 0.03), 0.08, { r: 0.025 }); }
  for (const y of [0.16, 0.5, 0.9]) b.box('steel', W, 0.018, D, 0, y, 0, { r: 0.004 });
  b.box('cardboard', 0.26, 0.11, 0.18, -0.14, 0.965, -0.04, { r: 0.003 });
  b.box('pl_ltblue', 0.2, 0.02, 0.12, -0.14, 1.03, -0.04, { rz: 0.1 });
  for (let i = 0; i < 2; i++) b.box(i ? 'pl_blue' : 'pl_white', 0.24, 0.09, 0.12, 0.15, 0.954 + i * 0.09, 0.02, { r: 0.004, ry: i * 0.2 });
  b.box('fab_yellow', 0.5, 0.06, 0.34, 0, 0.54, 0, { r: 0.02 }); // 疊好的隔離衣
  b.box('fab_yellow', 0.04, 0.55, 0.3, W / 2 + 0.03, 0.62, 0, { r: 0.01, rz: 0.06 }); // 側掛
  b.box('pl_white', 0.16, 0.24, 0.12, -0.18, 0.29, 0, { r: 0.01 }); // 酒精桶
  b.meta.coll = new THREE.Box3(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2 + 0.06, 1.05, D / 2));
});
const o2Tank = () => tpl('r5:o2', (b) => { b.cyl('enamel_green', 0.09, 1.1, 0, 0.55, 0, { seg: 12 }); b.cyl('chrome', 0.03, 0.08, 0, 1.14, 0, { seg: 8 }); });

// ---------------- 小兒病房 ----------------
const kidDrawing = (k) => labRect(`r5:kid:${k}`, 96, 72, (c, w, h) => {
  c.fillStyle = '#f6f2e8'; c.fillRect(0, 0, w, h);
  c.lineWidth = 3; const cols = ['#e05050', '#3a70d0', '#30a050', '#e0a020'];
  c.strokeStyle = cols[k % 4]; c.beginPath(); c.arc(30, 32, 12, 0, 6.28); c.stroke(); c.beginPath(); c.moveTo(30, 44); c.lineTo(30, 64); c.moveTo(18, 52); c.lineTo(42, 52); c.stroke();
  c.strokeStyle = cols[(k + 1) % 4]; c.beginPath(); c.arc(64, 36, 9, 0, 6.28); c.stroke(); c.beginPath(); c.moveTo(64, 45); c.lineTo(64, 62); c.stroke();
  c.fillStyle = '#2a2a2a'; c.font = 'bold 11px sans-serif'; c.fillText(['媽媽 我想回家', '我很乖 不哭', '護士阿姨', '五月 要出院'][k % 4], 8, 14);
});
const maskedTeddy = () => tpl('r5:teddy', (b) => {
  b.sph('plush_brown', 0.12, 0, 0.12, 0, { sy: 0.95 }); b.sph('plush_brown', 0.085, 0, 0.29, 0.01);
  for (const s of [-1, 1]) { b.sph('plush_brown', 0.03, s * 0.06, 0.36, 0, {}); b.sph('plush_brown', 0.04, s * 0.11, 0.05, 0.05, {}); }
  b.box('fab_white', 0.1, 0.05, 0.03, 0, 0.27, 0.08, { r: 0.012 }); // 小熊也戴口罩
});
const craneMobile = () => tpl('r5:cranes', (b) => {
  b.rod('wood_toy', 0.004, [-0.25, 0, 0], [0.25, 0, 0], { seg: 3 });
  for (let i = 0; i < 5; i++) { const x = -0.22 + i * 0.11, yy = -0.15 - (i % 3) * 0.08; b.rod('pl_white', 0.0012, [x, 0, 0], [x, yy, 0], { seg: 3 }); b.box(['fab_pink', 'fab_yellow', 'fab_blue', 'fab_red', 'fab_green'][i], 0.05, 0.02, 0.03, x, yy - 0.01, 0, { ry: i, rz: 0.4 }); }
});

// ---------------- 產房 ----------------
const birthCard = () => labRect('r5:birth', 72, 48, (c, w, h) => {
  c.fillStyle = '#f9d8e0'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a2a3a'; c.font = 'bold 10px sans-serif';
  c.fillText('女  2950g', 6, 14); c.fillText('92.5.2  03:17', 6, 28); c.fillText('母:林○○', 6, 42);
});
const bassinet = () => tpl('r5:bassinet', (b) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod('chrome', 0.01, [sx * 0.25, 0, sz * 0.18], [sx * 0.25, 0.62, sz * 0.18], { seg: 5 });
  b.box('pl_clear', 0.6, 0.26, 0.42, 0, 0.75, 0, { r: 0.02 });
  b.box('fab_pink', 0.54, 0.05, 0.36, 0, 0.65, 0);
  b.plane(L(birthCard()), 0.12, 0.08, 0, 0.8, 0.212);
});
const driedFlowers = () => tpl('r5:dried', (b) => {
  b.cyl('ceramic', 0.06, 0.2, 0, 0.1, 0, { seg: 10, r2: 0.045 });
  for (let i = 0; i < 6; i++) { const a = i * 1.05; b.rod('leaf_dead', 0.003, [0, 0.18, 0], [Math.cos(a) * 0.08, 0.42, Math.sin(a) * 0.08], { seg: 3 }); b.sph('leaf_dead', 0.022, Math.cos(a) * 0.08, 0.43, Math.sin(a) * 0.08, { ws: 6, hs: 4 }); }
});

// ---------------- 院長室:萬嵐 2024 的白 ----------------
const plaqueRect = () => labRect('r5:wanlan', 160, 64, (c, w, h) => {
  c.fillStyle = '#f4f5f2'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d8a86'; c.beginPath(); c.arc(30, h / 2, 16, 0, 6.28); c.fill();
  c.fillStyle = '#f4f5f2'; c.beginPath(); c.arc(35, h / 2 - 4, 10, 0, 6.28); c.fill();
  c.fillStyle = '#16615e'; c.font = 'bold 20px sans-serif'; c.fillText('大新生技', 56, 30); c.font = '9px sans-serif'; c.fillText('DAXIN BIOTECH · 大新照護中心', 56, 48);
});
const boxRect = () => labRect('r5:confbox', 96, 48, (c, w, h) => {
  c.fillStyle = '#e8e2d2'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a1a12'; c.font = 'bold 13px sans-serif'; c.fillText('喚醒針 臨床', 8, 20); c.fillText('機密 銷毀', 8, 38);
});
const shredder = () => tpl('r5:shred', (b) => {
  b.box('pl_dark', 0.36, 0.55, 0.26, 0, 0.275, 0, { r: 0.015 }); b.box('pl_gray', 0.38, 0.1, 0.28, 0, 0.6, 0, { r: 0.01 });
  for (let i = 0; i < 9; i++) b.box('paper', 0.006, 0.12, 0.002, -0.12 + i * 0.03, 0.47, 0.135, { rz: (i % 3 - 1) * 0.2 });
});
const docBox = () => tpl('r5:docbox', (b) => { b.box('pi_cardboard', 0.42, 0.28, 0.32, 0, 0.14, 0, { r: 0.006 }); b.plane(L(boxRect()), 0.3, 0.15, 0, 0.15, 0.161); });
const trophy = () => tpl('r5:trophy', (b) => { b.box('wood_dark', 0.12, 0.05, 0.08, 0, 0.025, 0); b.lathe('gold', [[0.02, 0], [0.012, 0.08], [0.05, 0.16], [0.055, 0.2], [0, 0.2]], 0, 0.05, 0, { seg: 12 }); });

// ---------------- 廣播室 ----------------
const zoneRect = () => labRect('r5:pazones', 128, 72, (c, w, h) => {
  c.fillStyle = '#d9d4c6'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = '9px sans-serif';
  ['B1', '1F 大廳', '1F 門診', '2F 北', '2F 南', '3F', '頂樓', '全館'].forEach((t, i) => {
    const x = 6 + (i % 4) * 30, y = 16 + ((i / 4) | 0) * 30;
    c.fillStyle = '#222'; c.fillText(t, x, y); c.fillStyle = i === 1 ? '#c02010' : '#555'; c.fillRect(x + 4, y + 4, 12, 8);
  });
});
const paDesk = () => tpl('r5:padesk', (b) => {
  b.box('wood_dark', 1.3, 0.04, 0.6, 0, 0.74, 0); for (const sx of [-1, 1]) b.box('wood_dark', 0.04, 0.74, 0.58, sx * 0.62, 0.37, 0);
  b.box('pl_beige', 0.62, 0.14, 0.4, -0.2, 0.83, 0.05, { r: 0.01 });
  for (let i = 0; i < 6; i++) b.cyl('pl_dark', 0.012, 0.03, -0.44 + i * 0.07, 0.91, 0.13, { seg: 8 });
  b.plane(L(zoneRect()), 0.3, 0.17, -0.08, 0.95, -0.05, { rx: -0.6 });
  b.cyl('pl_dark', 0.05, 0.02, -0.4, 0.91, -0.05, { seg: 10 });
  b.tube('chrome', [[-0.4, 0.92, -0.05], [-0.4, 1.1, -0.03], [-0.36, 1.2, 0.05]], 0.006, { seg: 5, bend: 0.05 });
  b.cyl('pl_dark', 0.018, 0.07, -0.35, 1.21, 0.08, { seg: 8, rx: 1.1 });
  b.box('wood_dark', 0.2, 0.14, 0.12, 0.35, 0.83, -0.05, { r: 0.01 }); // 叮咚音箱
  b.sph(glowScr('#ff3020'), 0.018, -0.2, 0.93, 0.25, {}); // ON AIR
});
const ampRack = () => tpl('r5:amprack', (b) => {
  b.box('pl_dark', 0.5, 1.2, 0.45, 0, 0.6, 0, { r: 0.01 });
  for (let i = 0; i < 5; i++) { b.box('alu', 0.46, 0.14, 0.02, 0, 0.25 + i * 0.19, 0.226); b.sph(glowScr(i % 2 ? '#30ff60' : '#ffb030'), 0.007, 0.18, 0.25 + i * 0.19, 0.24, {}); }
});

// ---------------- 洗衣房 ----------------
const washer = () => tpl('r5:washer', (b) => {
  b.box('enamel_white', 1.1, 1.4, 1.0, 0, 0.7, 0, { r: 0.03 });
  b.cyl('chrome', 0.32, 0.05, 0, 0.8, 0.5, { axis: 'z', seg: 18 }); b.cyl('glass_dark', 0.26, 0.03, 0, 0.8, 0.52, { axis: 'z', seg: 18 });
  b.box('pl_gray', 0.9, 0.18, 0.02, 0, 1.25, 0.505);
});
const linenBag = (k) => tpl(`r5:linenbag:${k}`, (b) => { const m = k ? 'fab_yellow' : 'fab_white'; b.sph(m, 0.28, 0, 0.24, 0, { sy: 0.85 }); b.cyl(m, 0.05, 0.12, 0, 0.5, 0, { seg: 8 }); });

// ---------------- 病房的小東西 ----------------
// 紅色手提收音機(AM 1207 的頻道):喇叭網、刻度窗、調頻鈕、提把、拉出一截的天線,電線垂到床頭櫃後面
const dialRect = () => labRect('r5:dial', 96, 24, (c, w, h) => {
  c.fillStyle = '#e8dcb8'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = '7px sans-serif';
  ['53', '60', '70', '90', '120', '160'].forEach((t, i) => { const x = 6 + i * 16; c.fillRect(x, 4, 1, 5); c.fillText(t, x - 3, 18); });
  c.fillStyle = '#c01010'; c.fillRect(78, 2, 2, 20); // 指針停在 1207 附近
});
const radio = () => tpl('r5:radio', (b) => {
  b.box('pl_red', 0.24, 0.14, 0.075, 0, 0.082, 0, { r: 0.016 });
  b.box('pl_dark', 0.25, 0.012, 0.08, 0, 0.006, 0, { r: 0.004 }); // 底座
  b.cyl('pl_dark', 0.045, 0.004, -0.055, 0.08, 0.0375, { axis: 'z', seg: 14 }); // 喇叭網
  for (let i = -2; i <= 2; i++) b.box('alu', 0.074 - Math.abs(i) * 0.012, 0.0025, 0.003, -0.055, 0.08 + i * 0.014, 0.041);
  b.box('glass_dark', 0.09, 0.028, 0.003, 0.055, 0.112, 0.0385);
  b.plane(L(dialRect()), 0.086, 0.024, 0.055, 0.112, 0.0402);
  knob(b, 0.075, 0.057, 0.036, 0.011, 'alu'); knob(b, 0.035, 0.057, 0.036, 0.009, 'alu');
  b.tube('chrome', [[-0.1, 0.15, 0], [-0.1, 0.18, 0], [0.1, 0.18, 0], [0.1, 0.15, 0]], 0.005, { seg: 4, bend: 0.02 }); // 提把
  b.rod('chrome', 0.0025, [0.105, 0.152, -0.02], [0.16, 0.45, -0.07], { seg: 3 }); // 天線
  cable(b, [[-0.12, 0.03, -0.02], [-0.15, 0.012, -0.03], [-0.19, 0.008, -0.034]], 0.0035, 'pl_dark');
});
// 行李箱的手寫吊牌
const tagRect = () => labRect('r5:bagtag', 48, 32, (c, w, h) => { c.fillStyle = '#f0e8d0'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f2f6e'; c.font = 'bold 9px serif'; c.fillText('5/13', 4, 12); c.fillText('出院', 4, 26); });
const suitcase = () => tpl('r5:suitcase', (b) => {
  b.box('vinyl_blue', 0.45, 0.6, 0.2, 0, 0.33, 0, { r: 0.025 });
  b.box('pl_dark', 0.46, 0.02, 0.205, 0, 0.33, 0); // 拉鍊接縫
  for (const sx of [-1, 1]) { b.cyl('pl_dark', 0.022, 0.018, sx * 0.17, 0.025, -0.06, { axis: 'x', seg: 10 }); b.box('pl_dark', 0.04, 0.04, 0.05, sx * 0.17, 0.04, 0.07); }
  b.tube('pl_dark', [[-0.06, 0.63, 0], [-0.05, 0.67, 0], [0.05, 0.67, 0], [0.06, 0.63, 0]], 0.009, { seg: 4, bend: 0.02 });
  b.box('fab_red', 0.025, 0.45, 0.004, 0.12, 0.33, 0.102); // 綁帶
  b.rod('pl_white', 0.0015, [0.06, 0.66, 0], [0.09, 0.56, 0.11], { seg: 3 });
  b.plane(L(tagRect()), 0.06, 0.04, 0.09, 0.54, 0.112, { rz: 0.15 });
});
// 象棋:紙棋盤 + 木棋子(下到一半,吃掉的幾顆疊在旁邊)
const xqRect = () => labRect('r5:xqboard', 96, 108, (c, w, h) => {
  c.fillStyle = '#e4cf98'; c.fillRect(0, 0, w, h); c.strokeStyle = '#5a3a1a'; c.lineWidth = 1;
  const x0 = 8, y0 = 8, dx = (w - 16) / 8, dy = (h - 16) / 9;
  for (let i = 0; i <= 9; i++) { c.beginPath(); c.moveTo(x0, y0 + i * dy); c.lineTo(x0 + 8 * dx, y0 + i * dy); c.stroke(); }
  for (let j = 0; j <= 8; j++) { c.beginPath(); c.moveTo(x0 + j * dx, y0); c.lineTo(x0 + j * dx, y0 + 4 * dy); c.moveTo(x0 + j * dx, y0 + 5 * dy); c.lineTo(x0 + j * dx, y0 + 9 * dy); c.stroke(); }
  c.fillStyle = '#5a3a1a'; c.font = '9px serif'; c.fillText('楚 河', x0 + dx * 1, y0 + dy * 4.65); c.fillText('漢 界', x0 + dx * 5.4, y0 + dy * 4.65);
});
const chessBoard = () => tpl('r5:xiangqi', (b) => {
  b.box('cardboard', 0.32, 0.004, 0.36, 0, 0.002, 0);
  b.plane(L(xqRect()), 0.31, 0.35, 0, 0.0045, 0, { rx: -Math.PI / 2 });
  const P = [[-0.12, -0.15, 1], [0.04, -0.15, 1], [0.12, -0.08, 1], [-0.04, -0.04, 1], [0.0, 0.08, 0], [-0.08, 0.15, 0], [0.12, 0.15, 0], [0.08, 0.04, 0], [-0.12, 0.0, 0], [0.04, -0.11, 0]];
  for (const [x, z, red] of P) { b.cyl('wood_toy', 0.014, 0.009, x, 0.009, z, { seg: 10 }); b.cyl(red ? 'wood_red' : 'wood_dark', 0.009, 0.001, x, 0.0138, z, { seg: 8 }); }
  for (let i = 0; i < 4; i++) b.cyl('wood_toy', 0.014, 0.009, 0.21 + (i % 2) * 0.03, 0.0045 + ((i / 2) | 0) * 0.009, -0.1 + i * 0.012, { seg: 10 }); // 被吃掉的
});
// 訪客坐的紅色塑膠矮凳
const stoolLow = () => tpl('r5:stoollow', (b) => {
  b.cyl('pl_red', 0.15, 0.03, 0, 0.43, 0, { seg: 14 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; b.rod('pl_red', 0.016, [Math.cos(a) * 0.1, 0.42, Math.sin(a) * 0.1], [Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16], { seg: 5 }); }
  b.tor('pl_red', 0.125, 0.008, 0, 0.16, 0, { rx: Math.PI / 2, rs: 4, ts: 14 });
});
const altar = () => tpl('r5:altar', (b) => {
  b.box('wood_red', 0.5, 0.03, 0.3, 0, 0.015, 0.15);
  b.lathe('ceramic', [[0, 0], [0.04, 0], [0.035, 0.08], [0.02, 0.16], [0.03, 0.2], [0, 0.24]], -0.1, 0.03, 0.15, { seg: 10 });
  b.cyl('brass', 0.045, 0.05, 0.1, 0.055, 0.15, { seg: 12 }); for (let i = 0; i < 3; i++) b.rod('wood_red', 0.0025, [0.09 + i * 0.01, 0.08, 0.15], [0.09 + i * 0.012, 0.2, 0.15], { seg: 3 });
  b.box('fab_yellow', 0.05, 0.08, 0.004, 0.0, 0.07, 0.29); // 平安符
  for (const sx of [-0.18, 0.18]) { b.box('iron', 0.02, 0.18, 0.012, sx, -0.09, 0.006); b.box('iron', 0.02, 0.012, 0.22, sx, -0.006, 0.11); b.rod('iron', 0.006, [sx, -0.16, 0.012], [sx, -0.012, 0.2], { seg: 4 }); } // L 型層架鐵件
  for (const sx of [-0.18, 0.18]) b.cyl('steel', 0.005, 0.004, sx, -0.04, 0.013, { axis: 'z', seg: 6 }); // 螺絲
});
const plasticCover = () => tpl('r5:wrap', (b) => { b.box('pl_clear', 1.0, 0.9, 2.1, 0, 0.45, 0, { r: 0.05 }); b.box('fab_white', 0.25, 0.12, 0.004, 0.2, 0.72, 1.051); });
const newsRect = () => labRect('r5:news', 96, 120, (c, w, h) => {
  c.fillStyle = '#e8e2cf'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 13px serif'; c.fillText('聖心封院', 6, 18); c.font = 'bold 10px serif'; c.fillText('第九天 家屬院外守候', 6, 33);
  c.fillStyle = 'rgba(40,40,40,0.55)'; for (let i = 0; i < 12; i++) c.fillRect(6, 42 + i * 6, 40 + (i * 13) % 44, 2);
  c.fillStyle = '#555'; c.font = '8px serif'; c.fillText('2003年5月7日', 6, 116);
});
const newspaper = (k) => tpl(`r5:news:${k}`, (b) => b.plane(L(newsRect()), 0.38, 0.48, 0, 0.003, 0, { rx: -Math.PI / 2, rz: k }));
const railNote = () => labRect('r5:railnote', 64, 80, (c, w, h) => {
  c.fillStyle = '#f2ecd8'; c.fillRect(0, 0, w, h); c.fillStyle = '#1f2f6e'; c.font = 'bold 11px serif';
  ['爸爸', '收音機', '開著喔', '小美陪你'].forEach((t, i) => c.fillText(t, 6, 16 + i * 17));
});

export function roomStory(R, zone) {
  const id = zone.id, y = R.y;
  const x0 = R.c0 * 2, z0 = R.r0 * 2, x1 = (R.c1 + 1) * 2, z1 = (R.r1 + 1) * 2;
  const r = rnd(id.length * 31 + R.c0 * 7);
  const W = R.run('W'), E = R.run('E'), N = R.run('N'), S = R.run('S');
  const ceil = () => R.L.ceilY(R.li, R.c0, R.r0) - y;
  if (id === 'f2_icu') {
    // SARS 加護:每床一台呼吸器(床頭右側)+ 推車上的綠色生命徵象 CRT(床尾旁、面向走道)+ 氧氣瓶;
    // 床位跟 th_2f.dressICU 一樣由北牆長段推算(N.t0 + 2.4 / 5.6,床頭靠牆)。走廊進來的西門內側一道負壓塑膠前室。
    const N2 = R.run('N', (q) => q.len > 8);
    if (N2) [N2.t0 + 2.4, N2.t0 + 5.6].forEach((t, i) => {
      const at = (dx, d) => ({ x: t + dx, z: N2.plane + N2.nz * d });
      const v = at(0.9, 0.55), m = at(0.92, 1.72), o = at(1.38, 0.24);
      if (!R.tryPut(icuVent(i), v.x, v.z, -1.2, {})) R.tryPut(icuVent(i), v.x, v.z, -1.2, { force: true });
      if (!R.tryPut(vitalCart(i), m.x, m.z, -0.7, {})) R.tryPut(vitalCart(i), m.x, m.z, -0.7, { force: true });
      R.put(o2Tank(), o.x, o.z, 0.4, {});
      if (i === 0) R.light({ x: m.x, y: y + 1.25, z: m.z + 0.3, color: 0x6ad0a0, intensity: 2.2, distance: 6, kind: 'monitor', flicker: 0.4 });
    });
    // 負壓前室:西門(走廊)進來 2.4m 處橫跨整條通道的塑膠布 + 鋁框拉鍊門 + 告示,前室裡一台隔離衣推車
    const dw = R.doors.find((d) => d.nx === 1 && d.nz === 0);
    if (dw) {
      const ax = dw.x + 1 + 2.4, top = Math.min(2.9, ceil() - 0.08);
      const zs = [...R.cells].filter((k) => (k % R.L.W) === Math.floor(ax / 2)).map((k) => ((k / R.L.W) | 0) * 2);
      if (zs.length) {
        const za = Math.min(...zs), zb = Math.max(...zs) + 2, len = zb - za, zc = (za + zb) / 2;
        R.put(plasticWall(len - 0.1, top, 2), ax, zc, -Math.PI / 2, {});
        R.put(anteFrame(len - 0.06, top), ax - 0.03, zc, -Math.PI / 2, {}); // 告示朝門(-X),拉鍊門在通道中間
        if (!R.tryPut(ppeTrolley(), dw.x + 2.0, zb - 0.36, Math.PI, {})) R.putChecked(ppeTrolley(), dw.x + 2.0, zb - 0.36, Math.PI);
      }
    }
  } else if (id === 'f2_peds') {
    // 小兒病房:牆上兒童畫、床上戴口罩的小熊、紙鶴吊飾;一盞粉紅夜燈
    const DW = S || W;
    if (DW) for (let i = 0; i < 4; i++) R.atWall(tpl(`r5:kidsheet:${i}`, (b) => b.plane(L(kidDrawing(i)), 0.4, 0.3, 0, 0.15, 0.004)), DW, DW.t0 + 1.2 + i * 1.3, { mount: 1.2 + (i % 2) * 0.12 });
    // 一排兒童床(靠北牆),床上戴口罩的小熊
    // (kidBed 沒有 surface → 小熊直接放在床墊上、枕頭前:本地 y 0.555,面向床尾)
    if (N) for (let i = 0; i < 4; i++) { const t = N.t0 + 1.0 + i * 2.6; if (t > N.t1 - 0.8) break; const p = R.atWall(kidBed(i), N, t, { gap: 0.05 }); if (p) { const q = R.local(p, i % 2 ? -0.12 : 0.1, 0.557, -0.3); R.put(maskedTeddy(), q.x, q.z, p.yaw + (i % 2 ? 0.5 : -0.35), { y: q.y, collide: false }); } }
    R.put(craneMobile(), x0 + 4.0, z0 + 2.4, 0.3, { y: y + 2.4 });
    R.light({ x: x0 + 1.2, y: y + 0.45, z: z1 - 1.0, color: 0xff9ab4, intensity: 1.8, distance: 6, kind: 'nightlight', flicker: 0 });
  } else if (id === 'f2_delivery') {
    // 產房:嬰兒推床與出生卡(92.5.2,封院前一天出生)、一瓶乾掉的花
    const c = R.center();
    for (const [dx, dz] of [[1.6, 1.2], [-1.4, 1.6], [2.4, -0.8]]) if (R.freeAt(c.x + dx, c.z + dz, 0.4)) { R.tryPut(bassinet(), c.x + dx, c.z + dz, 0.4, {}); break; }
    if (S) R.atWall(driedFlowers(), S, S.t0 + 1.0, { gap: 0.1, collide: false });
  } else if (id === 'f3_director') {
    // 院長室的萬嵐層:白色企業識別牌、獎盃、碎紙機、成箱「回神 臨床 機密 銷毀」與一地碎紙
    if (W) R.atWall(tpl('r5:plaque', (b) => { b.box('pl_white', 0.86, 0.38, 0.03, 0, 0.19, 0.015); b.plane(L(plaqueRect()), 0.8, 0.32, 0, 0.19, 0.032); }), W, (z0 + z1) / 2, { mount: 1.55 });
    if (E) R.atWall(shredder(), E, z0 + 1.2, { gap: 0.05 });
    for (let i = 0; i < 4; i++) R.put(docBox(), x1 - 1.4 - (i % 2) * 0.48, z0 + 2.2, 0.05 * i, { y: y + (i > 1 ? 0.28 : 0) });
    const bit = tpl('r5:shredbit', (b) => b.box('paper', 0.006, 0.002, 0.12, 0, 0.001, 0));
    for (let i = 0; i < 24; i++) R.put(bit, x1 - 1.0 + (r() - 0.5) * 1.3, z0 + 1.4 + (r() - 0.5) * 1.1, r() * 6, { collide: false });
    if (N) { R.atWall(tpl('r5:shelf', (b) => { b.box('pl_white', 1.2, 0.03, 0.25, 0, 0.015, 0.125); b.add(trophy(), -0.3, 0.03, 0.12); b.add(trophy(), 0.25, 0.03, 0.12); }), N, x0 + 2.0, { mount: 1.5 }); }
  } else if (id === 'f1_security') {
    // 廣播室:2003 年的院內廣播主機就在這裡(「不要相信廣播」的源頭)
    // 南牆西段(窗的西邊、飲水機旁):廣播桌;功放機櫃在窗東邊
    if (S) { if (!R.atWall(paDesk(), S, S.t0 + 2.6, { gap: 0.03 })) R.atWall(paDesk(), S, S.t0 + 2.6, { gap: 0.03, collide: false }); R.atWall(ampRack(), S, S.t1 - 2.2, { gap: 0.03 }); }
  } else if (id === 'f3_monitor') {
    // 監控室的 CRT 藍光從門口漏到 3F 走廊(「被錄下來的真相」的顏色)
    R.light({ x: (x0 + x1) / 2, y: y + 1.4, z: z1 - 0.6, color: 0x7ab8e0, intensity: 3.2, distance: 7.5, kind: 'monitor', flicker: 0.4 });
  } else if (id === 'b1_laundry') {
    // 洗衣房入口:兩台大型滾筒洗衣機、裝感染布單的黃袋
    const ent = z0 + 1.6;
    for (let i = 0; i < 2; i++) R.tryPut(washer(), x0 + 1.0, ent + i * 1.3, Math.PI / 2, {});
    for (let i = 0; i < 5; i++) { const x = x0 + 3.0 + r() * 1.6, z = ent + r() * 2.2; if (R.freeAt(x, z, 0.3)) R.put(linenBag(i % 2), x, z, r() * 6, { collide: false }); }
  }
}

// 其餘病房各一層故事(201、202、205、206、208、210;203/209 在 story.js)
// ---------------- [scene7] 每間病房一個從門口就看得到的主角物件(大剪影、高對比)
// 茄芷袋(紅白藍條紋帆布袋,台灣人住院搬家當用的)
const tarpBag = (k) => tpl(`r7:tarpbag:${k % 2}`, (b) => {
  const W = 0.62, H = 0.42, D = 0.3;
  b.box('fab_white', W, H, D, 0, H / 2, 0, { r: 0.04 });
  for (const [y, m] of [[0.07, 'fab_red'], [0.16, 'fab_blue'], [0.27, 'fab_red'], [0.36, 'fab_blue']]) b.box(m, W + 0.008, 0.045, D + 0.008, 0, y, 0, { r: 0.03 });
  for (const s of [-1, 1]) b.tube('fab_red', [[-0.16, H - 0.02, s * 0.1], [-0.12, H + 0.16, s * 0.08], [0.12, H + 0.16, s * 0.08], [0.16, H - 0.02, s * 0.1]], 0.012, { seg: 4, bend: 0.03 });
  if (k) b.box('fab_floral', 0.4, 0.06, 0.24, 0.02, H + 0.02, 0, { r: 0.02, ry: 0.2 }); // 塞在上面的衣服
});
// 家屬睡的行軍床 + 粉紅花被
const cot = () => tpl('r7:cot', (b) => {
  const L1 = 1.86, W = 0.64;
  for (const s of [-1, 1]) b.box('alu', 0.03, 0.03, L1, s * W / 2, 0.38, 0);
  for (const z of [-0.8, 0, 0.8]) for (const s of [-1, 1]) b.rod('alu', 0.012, [s * W / 2, 0.38, z], [-s * W / 2 * 0.9, 0.02, z], { seg: 4 });
  b.box('fab_canvas', W - 0.02, 0.012, L1 - 0.06, 0, 0.39, 0);
  b.box('fab_pink', W + 0.02, 0.07, 1.1, 0.02, 0.43, 0.3, { r: 0.03, ry: 0.05 }); // 摺起來的花被
  b.box('fab_white', 0.42, 0.09, 0.28, 0, 0.44, -0.7, { r: 0.04 });
});
// 花布被(摺好放在床上)
const quilt = () => tpl('r7:quilt', (b) => { b.box('fab_red', 0.86, 0.12, 0.62, 0, 0.06, 0, { r: 0.04 }); b.box('fab_pink', 0.87, 0.03, 0.63, 0, 0.09, 0, { r: 0.012 }); b.box('fab_yellow', 0.87, 0.018, 0.63, 0, 0.035, 0, { r: 0.008 }); });
// 紅紙毛筆字(貼在窗前 / 牆上)
const redPaper = (key, lines, w, h) => labRect(`r7:red:${key}`, 96, Math.round(96 * h / w), (c, cw, ch) => {
  c.fillStyle = '#b21e14'; c.fillRect(0, 0, cw, ch); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, ch - 6, cw, 6);
  lines.forEach((t, i) => text(c, t, cw / 2, (ch / (lines.length + 1)) * (i + 1), { size: Math.min(30, ch / (lines.length + 0.6)), color: '#141010', font: '"DFKai-SB", "BiauKai", "KaiTi", serif' }));
});
const redSheet = (key, lines, w, h) => tpl(`r7:redsheet:${key}`, (b) => { b.plane(L(redPaper(key, lines, w, h)), w, h, 0, h / 2, 0.004); b.box('paper', 0.04, 0.012, 0.002, -w / 2 + 0.03, h - 0.01, 0.006); b.box('paper', 0.04, 0.012, 0.002, w / 2 - 0.03, h - 0.01, 0.006); });

export function wardStory2(R, n, ctx = {}) {
  const E = R.run('E'), W = R.run('W');
  const z0 = R.r0 * 2, c = R.center();
  const bays = ctx.bays || [];
  const bay = (side, k) => bays.find((q) => q.side === side && q.bz === z0 + (k ? 5.05 : 1.25));
  hero(R, n, ctx, z0, c);
  if (n === 201) {
    // 小鈴的頻道:東側靠窗那床的床頭櫃上一台紅色收音機(AM 1207),西床床欄旁牆上家屬的字條
    const b = bay(1, 0);
    const tp = b && b.ns && R.topOf(b.ns, 0);
    if (tp) R.put(radio(), (tp.x0 + tp.x1) / 2 + 0.02, (tp.z0 + tp.z1) / 2 - 0.03, b.ns.yaw + 0.12, { y: tp.y, collide: false });
    if (W) R.atWall(tpl('r5:railnotesheet', (b) => b.plane(L(railNote()), 0.15, 0.19, 0, 0.1, 0.004)), W, z0 + 2.1, { mount: 0.6 });
  } else if (n === 202) {
    for (let i = 0; i < 4; i++) { const x = c.x - 0.8 + (i % 2) * 0.6, z = z0 + 3.0 + ((i / 2) | 0) * 0.55; if (R.freeAt(x, z, 0.25)) R.put(newspaper(i * 0.4), x, z, 0, { collide: false }); }
  } else if (n === 205) {
    // 阿嬤照顧過的阿伯(鐵網上:「護理長 謝謝您 照顧我爸爸 2F 205」):床上桌一盤沒下完的象棋,對面一張訪客的紅色矮凳
    const tp = ctx.overbed && R.topOf(ctx.overbed, 0);
    if (tp) {
      const q = R.onTop(ctx.overbed, 0.62, 0.5);
      R.put(chessBoard(), q.x, q.z, ctx.overbed.yaw + 0.2, { y: tp.y, collide: false });
      const s = R.local(ctx.overbed, 0.2, 0, -0.62); // 床上桌另一側(走道側)
      if (R.freeAt(s.x, s.z, 0.18)) R.put(stoolLow(), s.x, s.z, 0.4, { collide: false });
    }
  } else if (n === 206) {
    // 收拾好的行李:五月十三號要接回家(立在東側靠門那床的床尾旁)
    const b = bay(1, 1) || bay(-1, 1);
    if (b) { const q = R.local(b.p, 0.3, 0, 1.36); R.putChecked(suitcase(), q.x, q.z, b.p.yaw + Math.PI - 0.25) || R.put(suitcase(), q.x, q.z, b.p.yaw + Math.PI - 0.25); }
  } else if (n === 208) {
    if (W) R.atWall(altar(), W, z0 + 3.2, { mount: 1.25, gap: 0.004, collide: false }); // 家屬帶來的小神桌(L 型鐵件層架)
  } else if (n === 210) {
    for (const [run, t] of [[E, z0 + 1.3], [W, z0 + 1.3]]) if (run) { const p = R.at(run, t, 1.08); R.put(plasticCover(), p.x, p.z, Math.PI / 2, { y: R.y + 0.05, collide: false }); } // 萬嵐 2024 的「封存」
  }
}

// [scene7] 主角物件:門口(南側)往北看時在視線中央、尺寸夠大、顏色和綠牆/白床對比
function hero(R, n, ctx, z0, c) {
  const bays = ctx.bays || [], N = R.run('N'), y = R.y;
  const bay = (side, k) => bays.find((q) => q.side === side && q.bz === z0 + (k ? 5.05 : 1.25));
  if (n === 201 && N) { // 窗前一張紅紙:「阿爸 加油」(家屬從外面送進來的)
    const p = R.at(N, c.x, -0.04);
    R.put(redSheet('201', ['阿爸', '加油'], 0.5, 0.7), p.x, p.z, N.yaw, { y: y + 1.35 });
  } else if (n === 202) { // 窗下一張行軍床(家屬陪病),捲著粉紅花被
    if (R.freeAt(c.x, z0 + 0.42, 0.3)) { R.put(cot(), c.x, z0 + 0.42, Math.PI / 2, {}); R.mark(R.footprint(cot().bbox, c.x, z0 + 0.42, Math.PI / 2, 0.02)); }
  } else if (n === 205) { // 象棋桌旁的茄芷袋
    const ob = ctx.overbed;
    if (ob) { const q = R.local(ob, -0.35, 0, -0.75); if (R.freeAt(q.x, q.z, 0.25)) R.put(tarpBag(1), q.x, q.z, ob.yaw + 0.5, { collide: false }); }
  } else if (n === 206) { // 東側靠門那床:摺好的紅花被(五月十三號要回家)
    const b = bay(1, 1);
    if (b) R.putRel(quilt(), b.p, 0, 0.755, 0.5, 0, 0.1);
  } else if (n === 208) { // 神桌上方一大塊紅布「平安」
    const W = R.run('W');
    if (W) R.atWall(redSheet('208', ['平', '安'], 0.42, 0.9), W, z0 + 3.2, { mount: 1.6, gap: 0.004 });
  } else if (n === 209 || n === 203) { // 牆邊一個茄芷袋
    const b = bay(-1, 1);
    if (b) { const q = R.local(b.p, 0.75, 0, 1.0); if (R.freeAt(q.x, q.z, 0.25)) R.put(tarpBag(n), q.x, q.z, b.p.yaw + 0.3, { collide: false }); }
  }
}
