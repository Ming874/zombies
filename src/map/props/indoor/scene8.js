// [scene8] 場景細節第 8 輪:前幾輪沒碰過、或看起來最假的房間
//  - B1 鍋爐與發電機房:鍋爐的燃燒機/儀表/水位計/安全閥/保溫立管/爬梯、緊急發電機組、動力盤、軟水器、
//    封院時鍋爐工睡的行軍床、「發電機加油紀錄」黑板(207 專用,每晚 20L)
//  - B1 焚化爐:爐口周邊(煙道、控制箱、灰車、耙子)、封院期間堆到牆邊的感染性廢棄物山、磅秤、焚化紀錄
//  - B1 洗衣房:晾衣架上的床單與手術衣、污衣/清潔分區線、樓梯口一堆封口的污染布單
//  - 3F 監控室:第二面監視牆 + 值班桌、錄影帶架、監視器配置圖、保全的行軍床、封存的錄影帶箱
// 全部是共用道具材質 + pi_lab / pi_glow / pi_decal 圖集,經 Room.put 進區域合併 → BatchedMesh(區塊剔除),
// 不新增材質、不新增燈。有碰撞的東西走 Room.tryPut(可達性檢查,不擋路)。
import { tpl, L, G, THREE, caster, led, cable, barHandle, HALF, compose } from './parts.js';
import { D } from './geo.js';
import { labRect, glowRect, decalRect } from './atlas.js';
import { glowSwatch, calendar, cctv, decal } from './art.js';
import { text } from './tex.js';
import { Room } from './place.js';
import { floorDecal, wallDecal, scatter, ctpl } from './clutter.js';
import { litter, noiseScreens } from './lay.js';
import { tableLong, chairShell, shelfRack, phone, bin, crtMonitor, posterSheet, wallClock, tvWall } from './furniture.js';
import { supplyCart } from './medical.js';
import { sarsSheet } from './sars.js';
import { linenStack } from './decor.js';

const V = THREE.Vector3, Box = (a, b) => new THREE.Box3(new V(...a), new V(...b));
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const HAND = '"DFKai-SB", "BiauKai", "KaiTi", serif';
const glow = (name, col) => G(glowSwatch(name, col));
const ceilOf = (R) => { const h = R.L.ceilY(R.li, R.c0 + 1, R.r0 + 1) - R.y; return Number.isFinite(h) && h > 2.4 ? Math.min(h, 4.2) : 3.2; };

// ---------------------------------------------------------------- 圖集上的字(標籤、告示、手寫紀錄)
const grime = (c, w, h, a = 0.18) => { // 舊紙/舊漆的髒污:邊緣變暗 + 幾塊水漬
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(60,40,20,${a})`); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = `rgba(90,70,30,${a * 0.5})`; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(w * (0.2 + i * 0.3), h * (0.7 - i * 0.2), 4 + i * 3, 0, 7); c.fill(); }
};
const gaugeRect = () => labRect('r8:gauge', 48, 48, (c, w, h) => {
  c.fillStyle = '#e8e4d6'; c.beginPath(); c.arc(24, 24, 23, 0, 7); c.fill();
  c.strokeStyle = '#222'; c.lineWidth = 1; for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; c.beginPath(); c.moveTo(24 + Math.cos(a) * 17, 24 + Math.sin(a) * 17); c.lineTo(24 + Math.cos(a) * 21, 24 + Math.sin(a) * 21); c.stroke(); }
  c.strokeStyle = '#b01818'; c.lineWidth = 3; c.beginPath(); c.arc(24, 24, 19, Math.PI * 1.95, Math.PI * 2.2); c.stroke(); // 紅區
  c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(24, 24); c.lineTo(24 + Math.cos(2.6) * 16, 24 + Math.sin(2.6) * 16); c.stroke();
  c.fillStyle = '#111'; c.font = '7px sans-serif'; c.textAlign = 'center'; c.fillText('kg/cm²', 24, 36);
  grime(c, w, h, 0.25);
});
const boilerPlate = () => labRect('r8:boilerplate', 128, 72, (c, w, h) => {
  c.fillStyle = '#b8b4a2'; c.fillRect(0, 0, w, h); c.strokeStyle = '#3a3a34'; c.lineWidth = 2; c.strokeRect(3, 3, w - 6, h - 6);
  text(c, '蒸汽鍋爐', w / 2, 14, { size: 13, color: '#1a1a1a' });
  text(c, '蒸發量 3 T/H', w / 2, 31, { size: 9, color: '#222', weight: 'normal' });
  text(c, '最高使用壓力 10 kg/cm²', w / 2, 44, { size: 8, color: '#222', weight: 'normal' });
  text(c, '民國六十八年 製造 第 0347 號', w / 2, 58, { size: 7, color: '#333', weight: 'normal' });
  grime(c, w, h, 0.35);
});
const dangerSign = (key, l1, l2, col = '#b01414') => labRect(`r8:sign:${key}`, 128, 80, (c, w, h) => {
  c.fillStyle = '#efeadb'; c.fillRect(0, 0, w, h); c.strokeStyle = col; c.lineWidth = 5; c.strokeRect(4, 4, w - 8, h - 8);
  text(c, l1, w / 2, 30, { size: 22, color: col }); text(c, l2, w / 2, 58, { size: 15, color: '#1a1a1a' });
  grime(c, w, h, 0.3);
});
const warnSign = (key, l1, l2) => labRect(`r8:warn:${key}`, 96, 72, (c, w, h) => {
  c.fillStyle = '#e8c626'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  c.beginPath(); c.moveTo(18, 14); c.lineTo(32, 38); c.lineTo(4, 38); c.closePath(); c.fill(); c.fillStyle = '#e8c626'; c.fillRect(17, 21, 3, 9); c.fillRect(17, 32, 3, 3);
  text(c, l1, 62, 26, { size: 15, color: '#111' }); text(c, l2, w / 2, 54, { size: 12, color: '#111' });
  grime(c, w, h, 0.25);
});
const genPlate = () => labRect('r8:genplate', 128, 44, (c, w, h) => {
  c.fillStyle = '#d6d2c2'; c.fillRect(0, 0, w, h); c.strokeStyle = '#333'; c.strokeRect(2, 2, w - 4, h - 4);
  text(c, '緊急發電機組', w / 2, 13, { size: 12, color: '#111' });
  text(c, '300 kVA  380/220V  60Hz  1987', w / 2, 30, { size: 8, color: '#222', weight: 'normal' });
  grime(c, w, h, 0.3);
});
const genPanel = () => labRect('r8:genpanel', 96, 96, (c, w, h) => {
  c.fillStyle = '#5a6058'; c.fillRect(0, 0, w, h);
  for (const [x, y, t] of [[24, 24, 'V'], [72, 24, 'A'], [24, 62, 'Hz'], [72, 62, '°C']]) {
    c.fillStyle = '#ddd8c8'; c.beginPath(); c.arc(x, y, 15, 0, 7); c.fill(); c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 9, y + 5); c.stroke();
    c.fillStyle = '#111'; c.font = '7px sans-serif'; c.textAlign = 'center'; c.fillText(t, x, y + 11);
  }
  text(c, '自動 · 手動 · 停止', w / 2, 88, { size: 8, color: '#eee', weight: 'normal' });
  grime(c, w, h, 0.3);
});
const mccLabel = (i) => labRect(`r8:mcc:${i}`, 96, 32, (c, w, h) => {
  c.fillStyle = '#efefe6'; c.fillRect(0, 0, w, h); c.strokeStyle = '#333'; c.strokeRect(1, 1, w - 2, h - 2);
  text(c, ['鍋爐控制盤', '動力盤 MCC-B1', '緊急電源 ATS'][i], w / 2, h / 2, { size: 12, color: '#111' });
  grime(c, w, h, 0.2);
});
const noteRect = (key, lines, o = {}) => labRect(`r8:note:${key}`, o.w || 96, o.h || 128, (c, w, h) => {
  c.fillStyle = o.bg || '#efe9d4'; c.fillRect(0, 0, w, h);
  if (o.lines !== false) { c.strokeStyle = 'rgba(80,110,160,0.35)'; c.lineWidth = 1; for (let y = 22; y < h; y += 13) { c.beginPath(); c.moveTo(4, y); c.lineTo(w - 4, y); c.stroke(); } }
  lines.forEach((t, i) => text(c, t, o.left ? 6 : w / 2, 14 + i * (o.lh || 15), { size: o.size || 11, color: o.col || '#1b2a6a', weight: 'normal', font: HAND, align: o.left ? 'left' : 'center' }));
  grime(c, w, h, 0.25);
});
// 黑板(粉筆字):發電機加油紀錄 —— 封院 14 晚,207 專用發電機每晚 20 公升
const fuelLog = () => labRect('r8:fuellog', 208, 144, (c, w, h) => {
  c.fillStyle = '#23322a'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(220,225,215,0.07)'; for (let i = 0; i < 9; i++) c.fillRect(i * 23, 0, 12, h); // 擦過的痕跡
  const ch = (s, x, y, size = 11, a = 0.88) => text(c, s, x, y, { size, color: `rgba(235,235,225,${a})`, weight: 'normal', font: HAND, align: 'left' });
  ch('發電機 加油紀錄', 8, 12, 14, 0.95);
  const days = ['4/29', '4/30', '5/1', '5/2', '5/3', '5/4', '5/5', '5/6', '5/7', '5/8', '5/9', '5/10', '5/11', '5/12'];
  days.forEach((d, i) => { const col = i < 7 ? 0 : 1, row = i % 7; const x = 8 + col * 102, y = 32 + row * 15.5; ch(i === 0 ? `${d} 主機試車 ✓` : `${d} 207 20L ✓`, x, y, 10, i > 10 ? 0.55 : 0.85); });
  c.strokeStyle = 'rgba(235,235,225,0.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(8, 21); c.lineTo(120, 21); c.stroke();
});
const fireSign = () => dangerSign('fire', '嚴禁煙火', '油料存放區');
const binLabel = () => labRect('r8:biolabel', 64, 64, (c, w, h) => {
  c.fillStyle = '#e83a18'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2e6c8'; c.fillRect(4, 4, w - 8, h - 8);
  c.strokeStyle = '#c01810'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3; c.beginPath(); c.arc(32 + Math.cos(a) * 8, 26 + Math.sin(a) * 8, 8, 0, 7); c.stroke(); }
  c.beginPath(); c.arc(32, 26, 4, 0, 7); c.stroke();
  text(c, '感染性', w / 2, 46, { size: 11, color: '#c01810' }); text(c, '廢棄物', w / 2, 57, { size: 9, color: '#c01810' });
});
const wasteSign = () => labRect('r8:wastesign', 176, 96, (c, w, h) => {
  c.fillStyle = '#efe6c4'; c.fillRect(0, 0, w, h); c.fillStyle = '#c01810'; c.fillRect(0, 0, w, 22);
  text(c, '感染性廢棄物 暫存區', w / 2, 12, { size: 15, color: '#fff' });
  text(c, '非工作人員 禁止進入', w / 2, 40, { size: 15, color: '#111' });
  text(c, '紅袋:可燃  黃袋:不可燃', w / 2, 62, { size: 11, color: '#222', weight: 'normal' });
  text(c, '每袋秤重登記後再焚化  —總務課', w / 2, 82, { size: 9, color: '#333', weight: 'normal' });
  grime(c, w, h, 0.3);
});
// 焚化紀錄(夾板):日期、袋數、公斤、簽名;最後幾天字越來越亂
const incLog = () => labRect('r8:inclog', 112, 152, (c, w, h) => {
  c.fillStyle = '#ece6d2'; c.fillRect(0, 0, w, h);
  text(c, '醫療廢棄物 焚化紀錄', w / 2, 10, { size: 10, color: '#111' });
  c.strokeStyle = 'rgba(40,40,40,0.5)'; c.lineWidth = 0.8; for (let y = 20; y < h; y += 12) { c.beginPath(); c.moveTo(3, y); c.lineTo(w - 3, y); c.stroke(); }
  for (const x of [28, 56, 82]) { c.beginPath(); c.moveTo(x, 20); c.lineTo(x, h - 4); c.stroke(); }
  const rows = [['4/29', '38', '212'], ['4/30', '64', '355'], ['5/1', '81', '470'], ['5/2', '97', '536'], ['5/3', '120', '688'], ['5/4', '131', '740'], ['5/5', '156', '—'], ['5/6', '爐溫不足', ''], ['5/7', '堆放', ''], ['5/8', '堆放', ''], ['5/9', '', '']];
  rows.forEach(([d, n, kg], i) => { const y = 27 + i * 12; text(c, d, 15, y, { size: 8, color: '#1b2a6a', weight: 'normal', font: HAND }); text(c, n, 42, y, { size: 8, color: i > 5 ? '#a01010' : '#1b2a6a', weight: 'normal', font: HAND }); text(c, kg, 69, y, { size: 8, color: '#1b2a6a', weight: 'normal', font: HAND }); });
  grime(c, w, h, 0.3);
});
const tapeLabel = (k) => labRect(`r8:tape:${k}`, 64, 40, (c, w, h) => {
  c.fillStyle = '#e8e2cc'; c.fillRect(0, 0, w, h);
  text(c, k ? '92.5 錄影帶' : '保全組', w / 2, 13, { size: 10, color: '#111', font: HAND, weight: 'normal' });
  text(c, k ? '封存 勿動' : '值班日誌', w / 2, 29, { size: 10, color: '#a01010', font: HAND, weight: 'normal' });
});
// 監視器配置圖(平面圖 + 紅點):醫院一到三樓,鏡頭編號
const camMap = () => labRect('r8:cammap', 176, 120, (c, w, h) => {
  c.fillStyle = '#e6e2d4'; c.fillRect(0, 0, w, h);
  text(c, '監視器配置圖  CH 1 – 16', w / 2, 10, { size: 10, color: '#111' });
  c.strokeStyle = '#333'; c.lineWidth = 1.2;
  for (let f = 0; f < 3; f++) { const y = 22 + f * 32; c.strokeRect(10, y, w - 20, 26); c.beginPath(); c.moveTo(10, y + 13); c.lineTo(w - 10, y + 13); c.stroke(); for (let x = 30; x < w - 20; x += 22) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 9); c.stroke(); } text(c, `${f + 1}F`, 4, y + 13, { size: 8, color: '#333', align: 'left' }); }
  c.fillStyle = '#c01810'; const r = rnd(33); for (let i = 0; i < 16; i++) { const f = i % 3, x = 18 + r() * (w - 36), y = 22 + f * 32 + 13 + (r() < 0.5 ? -4 : 4); c.beginPath(); c.arc(x, y, 2.5, 0, 7); c.fill(); text(c, String(i + 1), x + 6, y, { size: 6, color: '#c01810', align: 'left' }); }
  grime(c, w, h, 0.3);
});
const zonePaint = (k) => decalRect(`r8:zone:${k}`, 128, 48, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.globalAlpha = 0.82;
  text(c, k ? '清 潔 區' : '污 衣 區', w / 2, h / 2, { size: 28, color: k ? 'rgba(40,120,60,1)' : 'rgba(200,160,20,1)' });
  c.globalAlpha = 1; c.globalCompositeOperation = 'destination-out'; const r = rnd(k + 9); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; c.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 3); }
  c.globalCompositeOperation = 'source-over';
});

// ---------------------------------------------------------------- 通用小道具
// 行軍床(長邊沿 X;靠牆擺時跟牆平行)+ 被子、枕頭
const cot8 = (k) => tpl(`r8:cot:${k}`, (b) => {
  const Lx = 1.86, W = 0.64;
  for (const s of [-1, 1]) b.box('steel', Lx, 0.03, 0.03, 0, 0.38, s * W / 2);
  for (const x of [-0.8, 0, 0.8]) for (const s of [-1, 1]) b.rod('steel', 0.012, [x, 0.38, s * W / 2], [x, 0.02, -s * W / 2 * 0.9], { seg: 4 });
  b.box('fab_canvas', Lx - 0.06, 0.012, W - 0.02, 0, 0.39, 0);
  b.box(k % 2 ? 'fab_gray' : 'fab_floral', 1.15, 0.06, W + 0.05, 0.28, 0.425, 0.01, { r: 0.025, ry: 0.05, rx: 0.03 });
  b.box('fab_white', 0.3, 0.09, 0.44, -0.74, 0.44, 0, { r: 0.04, ry: 0.12 });
  b.meta.coll = Box([-0.95, 0, -0.34], [0.95, 0.45, 0.34]);
});
// 紅色塑膠矮凳 + 保溫瓶、琺瑯杯、手電筒、菸灰缸(值夜的人放在床邊)
const nightStool = () => tpl('r8:nightstool', (b) => {
  b.cyl('pl_red', 0.16, 0.42, 0, 0.21, 0, { r2: 0.13, seg: 12, open: true });
  b.cyl('pl_red', 0.135, 0.025, 0, 0.43, 0, { seg: 12 });
  b.cyl('pl_red', 0.045, 0.28, -0.06, 0.58, 0.02, { seg: 8 }); b.cyl('pl_white', 0.035, 0.04, -0.06, 0.74, 0.02, { seg: 8 });
  b.cyl('pl_white', 0.04, 0.07, 0.07, 0.48, -0.05, { seg: 8 });
});
// 牆上的告示牌(背板 + 圖集字)
const signPlate = (key, rect, w, h, o = {}) => tpl(`r8:plate:${key}`, (b) => {
  b.box(o.back || 'pl_white', w + 0.02, h + 0.02, 0.008, 0, h / 2, 0.004);
  b.plane(L(rect), w, h, 0, h / 2, 0.0085);
  if (o.screws) for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) b.box('steel', 0.012, 0.012, 0.004, sx * (w / 2 - 0.02), h / 2 + sy * (h / 2 - 0.02), 0.01);
});
// 貼在牆上的紙(兩條膠帶)
const tapedSheet = (key, rect, w, h, rz = 0) => tpl(`r8:sheet:${key}`, (b) => {
  b.plane(L(rect), w, h, 0, h / 2, 0.003, { rz });
  for (const s of [-1, 1]) b.box('pl_cream', 0.05, 0.016, 0.002, s * (w / 2 - 0.04), h - 0.01, 0.005, { rz: s * 0.3 + rz });
});
const gauge = (b, x, y, z, r, o = {}) => { // 圓形壓力錶(朝 +Z;o.ry 轉向)
  b.push(x, y, z, 0, o.ry || 0, 0);
  b.cyl('chrome', r, 0.045, 0, 0, 0, { axis: 'z', seg: 8 });
  b.plane(L(gaugeRect()), r * 1.7, r * 1.7, 0, 0, 0.0235);
  if (o.stem) b.rod('iron', 0.012, [0, -r, -0.01], [0, -r - o.stem, -0.01], { seg: 5 });
  b.pop();
};

// ================================================================ B1 鍋爐與發電機房
// 鍋爐(basement.js 的臥式鍋爐,本地 X 為筒身軸、+X 為爐前)上加的東西:筒身縱向接縫、銘牌、爐前儀表/水位計、
// 安全閥 + 洩壓管、主蒸汽閥與包保溫布的立管(通到天花板)、側面爬梯
const boilerKit = (ceil) => tpl(`r8:boilerkit:${ceil.toFixed(2)}`, (b) => {
  const H = 1.35, R0 = 1.0, top = H + R0;
  for (const a of [0.55, 1.35]) b.box('steel', 3.52, 0.022, 0.022, 0, H + Math.cos(a) * 1.01, Math.sin(a) * 1.01);
  b.box('steel', 0.44, 0.26, 0.012, 0.55, H + 0.02, 1.006); b.plane(L(boilerPlate()), 0.4, 0.225, 0.55, H + 0.02, 1.013);
  // 爐前(+X 端板 x≈1.92):兩個壓力錶、水位計(兩個考克 + 玻璃管)
  for (const zz of [-0.42, 0.42]) gauge(b, 1.96, 2.05, zz, 0.1, { ry: HALF });
  for (const yy of [1.2, 1.88]) b.box('iron', 0.09, 0.09, 0.09, 1.97, yy, 0.72);
  for (const dz of [-0.02, 0.02]) b.box('steel', 0.008, 0.6, 0.008, 1.985, 1.54, 0.72 + dz); b.cyl('pl_amber', 0.014, 0.3, 1.97, 1.42, 0.72, { seg: 6 }); b.cyl('screen_dark', 0.014, 0.3, 1.97, 1.72, 0.72, { seg: 6 }); // 水位計(不用透明玻璃:透明材質會多一個獨立網格)
  b.box('iron', 0.05, 0.05, 0.05, 2.0, 1.1, 0.72); b.rod('iron', 0.012, [2.0, 1.08, 0.72], [2.05, 0.05, 0.85], { seg: 5 }); // 排水管
  // 安全閥 ×2 + 洩壓管往上
  for (const x of [-0.75, -0.35]) { b.cyl('steel', 0.07, 0.24, x, top + 0.12, 0.3, { seg: 8 }); b.cyl('iron', 0.09, 0.05, x, top + 0.02, 0.3, { seg: 8 }); b.rod('rust', 0.035, [x, top + 0.24, 0.3], [x, ceil, 0.3], { seg: 6 }); }
  // 主蒸汽閥(紅手輪)+ 保溫立管(帆布包覆、鋁皮束帶)
  b.cyl('iron', 0.13, 0.26, 0.85, top + 0.13, 0, { seg: 8 });
  b.cyl('iron', 0.025, 0.2, 0.85, top + 0.36, 0, { seg: 6 });
  b.tor('pl_red', 0.15, 0.015, 0.85, top + 0.46, 0, { rx: HALF, ts: 12, rs: 3 });
  b.rod('plaster', 0.14, [0.85, top + 0.26, 0], [0.85, ceil, 0], { seg: 8 });
  for (let yy = top + 0.6; yy < ceil - 0.2; yy += 0.6) b.cyl('steel', 0.145, 0.035, 0.85, yy, 0, { seg: 8, open: true });
  // 側面爬梯(+Z 側,爐尾)
  for (const x of [-1.5, -1.12]) b.box('steel', 0.04, 2.55, 0.04, x, 1.27, 1.1);
  for (let k = 0; k < 6; k++) b.box('steel', 0.38, 0.02, 0.02, -1.31, 0.35 + k * 0.38, 1.1);
});
// 燃燒機(爐前,紅色機殼 + 鼓風馬達 + 火焰觀測孔的橘光 + 控制盒指示燈 + 油管)
const burner = () => tpl('r8:burner', (b) => {
  b.box('pl_red', 0.5, 0.44, 0.5, 0, 1.1, 0);
  b.box('enamel_gray', 0.24, 0.24, 0.26, 0.04, 1.44, 0.08);
  b.cyl('iron', 0.2, 0.04, 0, 1.1, -0.26, { axis: 'z', seg: 10 }); // 法蘭(貼爐門)
  b.box('pl_dark', 0.1, 0.18, 0.22, 0.3, 1.1, 0.04);
  b.box('po_ember', 0.012, 0.012, 0.004, 0.3, 1.14, 0.151); b.box('pl_dark', 0.012, 0.012, 0.004, 0.3, 1.08, 0.151);
  b.plane('po_ember', 0.08, 0.055, 0, 1.0, 0.252); // 火焰觀測孔(用鍋爐爐門同一個餘燼材質:這個房間不必再多一種自發光材質)
  b.rod('rubber', 0.011, [0.2, 0.9, -0.1], [0.5, 0.03, -0.2], { seg: 4 }); b.rod('rubber', 0.011, [0.5, 0.03, -0.2], [1.2, 0.03, -0.32], { seg: 4 });
  b.meta.coll = Box([-0.27, 0, -0.27], [0.27, 1.5, 0.4]);
});
// 緊急發電機組(開放式:引擎、散熱水箱、發電機、控制盤、消音器 + 排氣管通天花板、地上的電瓶)。長邊沿 X,+Z 為操作面
const genset = (ceil) => tpl(`r8:genset:${ceil.toFixed(2)}`, (b) => {
  b.box('iron', 3.0, 0.14, 1.2, 0, 0.07, 0);
  for (const s of [-1, 1]) b.box('iron', 3.0, 0.06, 0.08, 0, 0.17, s * 0.56);
  for (const x of [-1.1, 0.1, 1.2]) for (const s of [-1, 1]) b.box('rubber', 0.1, 0.06, 0.1, x, 0.23, s * 0.4); // 防震墊
  b.box('vinyl_green', 1.5, 0.72, 0.78, -0.3, 0.62, 0); // 曲軸箱
  b.box('vinyl_green', 1.32, 0.34, 0.56, -0.3, 1.15, 0); // 汽缸頭
  b.box('iron', 1.2, 0.07, 0.4, -0.3, 1.355, 0);
  b.rod('rust', 0.055, [-0.95, 1.12, -0.33], [0.35, 1.12, -0.33], { seg: 8 }); // 排氣歧管
  b.box('iron', 0.22, 1.32, 1.05, -1.32, 0.84, 0); // 水箱
  for (let i = 0; i < 9; i++) b.box('iron', 0.03, 0.03, 0.96, -1.445, 0.3 + i * 0.13, 0);
  b.cyl('vinyl_green', 0.37, 0.75, 0.88, 0.6, 0, { axis: 'x', seg: 10 }); // 發電機
  b.box('enamel_gray', 0.36, 0.24, 0.3, 0.86, 1.08, 0);
  // 控制盤(發電機上方,朝 +Z)
  b.box('enamel_gray', 0.56, 0.6, 0.22, 0.95, 1.55, 0.1);
  b.plane(L(genPanel()), 0.48, 0.48, 0.95, 1.57, 0.212);
  b.box('po_ember', 0.016, 0.016, 0.004, 0.78, 1.3, 0.212); b.box('pl_dark', 0.016, 0.016, 0.004, 0.86, 1.3, 0.212);
  b.box('iron', 0.04, 0.3, 0.04, 0.95, 1.13, 0.1);
  b.plane(L(genPlate()), 0.42, 0.145, -0.3, 0.72, 0.392);
  // 消音器 + 排氣管(往上穿天花板)
  b.rod('rust', 0.06, [-0.6, 1.2, -0.3], [-0.6, 2.05, -0.42], { seg: 8 });
  b.cyl('rust', 0.17, 0.9, -0.6, 2.5, -0.42, { seg: 10 });
  b.rod('rust', 0.065, [-0.6, 2.95, -0.42], [-0.6, ceil, -0.42], { seg: 8 });
  // 地上的電瓶 + 電線
  b.box('pl_black', 0.34, 0.22, 0.18, 1.15, 0.11, 0.78);
  b.cyl('pl_red', 0.012, 0.02, 1.05, 0.23, 0.78, { seg: 6 }); b.cyl('pl_dark', 0.012, 0.02, 1.25, 0.23, 0.78, { seg: 6 });
  b.rod('pl_red', 0.009, [1.05, 0.24, 0.78], [0.9, 0.62, 0.42], { seg: 4 }); b.rod('rubber', 0.009, [1.25, 0.24, 0.78], [1.2, 0.8, 0.3], { seg: 4 });
  b.meta.coll = Box([-1.5, 0, -0.62], [1.5, 1.9, 0.9]);
});
// 動力盤三面(灰色烤漆櫃、名牌、電錶、指示燈、高壓警告、手寫的發電機試車通知)
const mcc = () => tpl('r8:mcc', (b) => {
  for (let i = 0; i < 3; i++) {
    const x = -0.8 + i * 0.8;
    b.box('enamel_gray', 0.78, 1.95, 0.45, x, 1.025, 0);
    b.box('iron', 0.8, 0.05, 0.47, x, 0.025, 0);
    b.box('enamel_gray', 0.72, 1.78, 0.02, x, 1.0, 0.235);
    barHandle(b, x + 0.3, 1.0, 0.245, 0.12, 'chrome', { vertical: true });
    b.plane(L(mccLabel(i)), 0.3, 0.1, x, 1.72, 0.2465);
    gauge(b, x - 0.16, 1.45, 0.246, 0.055);
    for (let k = 0; k < 3; k++) b.box(k === (i === 1 ? 1 : 0) ? 'po_ember' : 'pl_dark', 0.03, 0.03, 0.02, x + 0.04 + k * 0.08, 1.45, 0.255); // 指示燈(亮的那顆用餘燼材質)
  }
  b.plane(L(warnSign('hv', '高壓危險', '非電氣人員勿開')), 0.3, 0.22, 0, 1.12, 0.2465);
  b.plane(L(noteRect('gentest', ['封院期間', '發電機', '每晚 22:00', '試車 10 分', '—總務 王'], { size: 10 })), 0.18, 0.24, 0.8, 1.17, 0.248, { rz: 0.05 });
  b.meta.coll = Box([-1.2, 0, -0.23], [1.2, 2.0, 0.26]);
});
// 軟水器(兩支藍色 FRP 桶 + 控制頭、白色鹽水桶、管線)
const softener = () => tpl('r8:softener', (b) => {
  for (const x of [-0.4, 0.2]) {
    b.cyl('pl_blue', 0.24, 1.36, x, 0.7, 0, { seg: 10 });
    b.cyl('pl_blue', 0.2, 0.06, x, 1.41, 0, { r2: 0.13, seg: 10 });
    b.cyl('pl_dark', 0.12, 0.2, x, 1.7, 0, { seg: 8 }); b.box('pl_gray', 0.17, 0.12, 0.07, x, 1.72, 0.13);
  }
  b.cyl('pl_white', 0.32, 0.92, 0.85, 0.46, 0.05, { seg: 10 }); b.cyl('pl_dark', 0.335, 0.035, 0.85, 0.935, 0.05, { seg: 10 });
  for (const x of [-0.4, 0.2]) b.rod('pl_gray', 0.025, [x, 1.8, 0], [x, 2.05, 0], { seg: 6 }); b.rod('pl_gray', 0.025, [-0.4, 2.05, 0], [0.2, 2.05, 0], { seg: 6 });
  b.rod('pl_gray', 0.025, [-0.1, 2.05, 0], [-0.1, 2.05, -0.28], { seg: 6 });
  b.rod('pl_gray', 0.01, [0.2, 1.65, 0.1], [0.85, 0.95, 0.15], { seg: 4 });
  b.plane(L(noteRect('soft', ['軟水器', '每週加鹽'], { w: 64, h: 48, lines: false, col: '#222', size: 11 })), 0.16, 0.12, -0.4, 1.0, 0.243);
  b.meta.coll = Box([-0.66, 0, -0.27], [1.18, 1.85, 0.37]);
});
// 黑板 + 粉筆溝
const fuelBoard = () => tpl('r8:fuelboard', (b) => {
  b.box('wood_dark', 0.98, 0.7, 0.025, 0, 0.35, 0.0125);
  b.plane(L(fuelLog()), 0.92, 0.64, 0, 0.35, 0.0256);
  b.box('wood_dark', 0.98, 0.025, 0.06, 0, 0.0, 0.035);
  b.box('plaster', 0.06, 0.012, 0.012, 0.25, 0.018, 0.045);
});

function boilerRoom(R) {
  const y = R.y, ceil = ceilOf(R), ctx = R.ctx;
  for (const bo of ctx.__b1?.boilers || []) {
    R.put(boilerKit(ceil - 0.05), bo.x, bo.z, bo.yaw, {});
    const bx = bo.x + Math.cos(bo.yaw) * 2.25, bz = bo.z - Math.sin(bo.yaw) * 2.25;
    R.put(burner(), bx, bz, bo.yaw + HALF, {}); R.collide(burner().meta.coll, bx, R.y, bz, bo.yaw + HALF); // 貼著鍋爐:不做網格檢查,直接登記碰撞
    floorDecal(R, 'water', bo.x + Math.cos(bo.yaw) * 1.6 + Math.sin(bo.yaw) * 0.9, bo.z - Math.sin(bo.yaw) * 1.6 + Math.cos(bo.yaw) * 0.9, 1.4);
  }
  const S = R.run('S', (r) => r.len > 6), N = R.run('N', (r) => r.len > 6), W = R.run('W', (r) => r.len > 4), E = R.run('E', (r) => r.t1 <= 24.1 && r.len > 3);
  if (S) { const g = R.atWall(genset(ceil - 0.05), S, 27.4, { gap: 0.2 }) || R.atWall(genset(ceil - 0.05), S, 29.6, { gap: 0.2 }); if (g) { floorDecal(R, 'stain', g.x, g.z, 2.2); R.atWall(signPlate('genst', warnSign('gen', '發電機', '運轉中勿靠近'), 0.3, 0.22, { screws: true }), S, g.tw - 1.2, { mount: 1.7 }); } }
  if (S) { R.atWall(fuelBoard(), S, 34.4, { mount: 1.15 }); R.atWall(signPlate('fire', fireSign(), 0.36, 0.22, { screws: true }), S, 32.9, { mount: 1.75 }); }
  if (N) { const m = R.atWall(mcc(), N, 28.6, { gap: 0.03 }); if (m) floorDecal(R, 'dirt', 28.6, 15.4, 1.6, { yaw: 0 }); }
  void W; // [scene8] 軟水器拿掉(鍋爐房三角形預算 +5% 以內;模板留著)
  if (E) {
    const c = R.atWall(cot8(0), E, 18.9, { gap: 0.05 });
    if (c) { const q = R.local(c, 0.6, 0, 0.62); if (R.freeAt(q.x, q.z, 0.2)) R.put(nightStool(), q.x, q.z, c.yaw + 0.3, {}); }
    R.atWall(tapedSheet('cal', calendar(), 0.26, 0.36), E, 17.4, { mount: 1.45 });
  }
  // 隧道這一側、門旁的牆上:鍋爐重地 閒人勿進(從隧道走過來就看得到)
  R.put(signPlate('boil', dangerSign('boil', '鍋爐重地', '閒人勿進'), 0.42, 0.26, { screws: true }), 38.01, 27.1, HALF, { y: R.y + 1.55 });
  // 腳印/磨耗:門 → 燃燒機、門 → 發電機、門 → 油桶角;牆角滲水、管線下的鏽水
  for (const [x, z, yaw, s] of [[33.6, 24.6, HALF, 1.8], [30.5, 25.6, HALF + 0.3, 1.8], [33.2, 21.0, 0.2, 1.5]]) floorDecal(R, 'lane', x, z, s, { yaw });
  if (N) for (const t of [21.2, 32.4]) wallDecal(R, N, t, 1.5, 'rust', 1.1);
  if (W) { wallDecal(R, W, 25.2, 1.2, 'water', 1.6); floorDecal(R, 'water', 19.0, 24.6, 1.8); }
}

// ================================================================ B1 焚化爐
// 爐口周邊:煙道(往上穿天花板)、裝料口上方的鋼罩、控制箱(溫度錶 + 燈)、灰車、靠牆的耙子與鏟子、高溫警告
const furnaceKit = (ceil) => tpl(`r8:furnace:${ceil.toFixed(2)}`, (b) => {
  // 模板原點在爐體正面中心的地面;+Z 朝房間
  b.cyl('rust', 0.36, ceil - 2.6, 0.6, 2.6 + (ceil - 2.6) / 2, -0.55, { seg: 10, open: true });
  for (let yy = 2.9; yy < ceil - 0.2; yy += 0.5) b.cyl('iron', 0.385, 0.05, 0.6, yy, -0.55, { seg: 10, open: true });
  b.box('iron', 2.6, 1.9, 0.03, 0, 1.05, 0.015); // 爐前鋼板(耐火磚只露出上緣與兩側)
  for (const s of [-1, 1]) b.box('iron', 0.12, 2.78, 0.14, s * 1.42, 1.39, 0.07); // 鋼構立柱
  b.box('iron', 3.0, 0.12, 0.14, 0, 2.66, 0.07);
  for (const s of [-1, 1]) for (const yy of [0.5, 1.5, 2.4]) b.cyl('steel', 0.025, 0.05, s * 1.42, yy, 0.16, { axis: 'z', seg: 6 });
  b.box('iron', 1.5, 0.3, 0.42, 0, 2.05, 0.2, { r: 0.02 }); // 裝料口上方的排煙罩
  // 控制箱(右側)
  b.box('steel', 0.5, 0.62, 0.22, 1.85, 1.45, -0.3);
  gauge(b, 1.75, 1.55, -0.18, 0.08);
  b.box('pl_dark', 0.08, 0.12, 0.03, 1.95, 1.3, -0.18);
  b.rod('steel', 0.025, [1.85, 1.76, -0.32], [1.85, ceil, -0.32], { seg: 6 });
  b.plane(L(warnSign('hot', '高溫危險', '爐門勿用手開')), 0.36, 0.27, -0.95, 1.55, 0.006);
  // 靠爐邊的耙子、鏟子
  b.rod('steel', 0.016, [-1.75, 0.02, 0.25], [-1.6, 1.85, 0.02], { seg: 5 }); b.box('steel', 0.36, 0.1, 0.02, -1.75, 0.07, 0.27, { rx: 0.3 });
  b.rod('wood_old', 0.018, [-1.95, 0.02, 0.3], [-1.85, 1.5, 0.03], { seg: 5 }); b.box('steel', 0.24, 0.3, 0.02, -1.96, 0.14, 0.32, { rx: 0.25 });
});
// 灰車(推車 + 灰)
const ashCart = () => tpl('r8:ashcart', (b) => {
  b.box('iron', 0.7, 0.42, 0.55, 0, 0.45, 0, { r: 0.02 });
  b.sph('plaster', 0.3, 0, 0.62, 0, { ws: 10, hs: 5, tl: HALF, sx: 1.05, sy: 0.35, sz: 0.85 });
  for (const s of [-1, 1]) { b.rod('steel', 0.016, [s * 0.3, 0.6, -0.27], [s * 0.3, 0.9, -0.65], { seg: 5 }); caster(b, s * 0.26, 0.2, 0.22, { r: 0.07 }); caster(b, s * 0.26, -0.2, 0.22, { r: 0.07 }); }
  b.rod('steel', 0.016, [-0.3, 0.9, -0.65], [0.3, 0.9, -0.65], { seg: 5 });
  b.meta.coll = Box([-0.36, 0, -0.66], [0.36, 0.9, 0.3]);
});
// 垃圾袋的形狀:凹凸不平、底部被壓扁、上半部往束口收(位置函數 → 接縫處的重複頂點位移相同,不會裂開)
export const bagGeo = (r, seed) => {
  const g = new THREE.SphereGeometry(r, 7, 5), p = g.attributes.position, q = rnd(seed), a = q() * 6, c = q() * 6;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.14 * Math.sin(x * 19 + a) * Math.sin(z * 17 + c) + 0.07 * Math.sin(y * 23 + a * 2);
    x *= n; y *= n; z *= n;
    if (y < 0) y *= 0.45; else { const t = Math.min(1, y / r); x *= 1 - 0.28 * t * t * t; z *= 1 - 0.28 * t * t * t; y *= 0.8; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
};
// 廢棄物袋山(紅袋為主、黃袋;束口)。長邊沿 X,背面貼牆
const bagPile = (k, len, n) => tpl(`r8:bagpile:${k}`, (b) => {
  const r = rnd(k * 77 + 5);
  for (let i = 0; i < n; i++) {
    const row = i < n * 0.55 ? 0 : i < n * 0.85 ? 1 : 2;
    const rr = 0.22 + r() * 0.08, x = (r() - 0.5) * (len - 0.3 - row * 0.5), z = (r() - 0.5) * (0.55 - row * 0.15) + row * -0.08;
    const yb = row * 0.25 + rr * 0.42, m = r() < 0.72 ? 'po_bag_red' : 'po_bag_yellow';
    b.raw(m, bagGeo(rr, k * 131 + i), compose(x, yb, z, (r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4, 1.15, 0.95, 1.0));
    b.cyl(m, 0.014, 0.06, x + 0.02, yb + rr * 0.86, z, { r2: 0.03, seg: 4, rz: 0.4 }); // 束口
  }
  b.meta.coll = Box([-len / 2, 0, -0.42], [len / 2, 0.95, 0.42]);
});
// 棧板上的感染性廢棄物紙箱(兩層,貼紅色標籤)
const bioBoxes = (k) => tpl(`r8:bioboxes:${k}`, (b) => {
  b.box('wood_old', 1.2, 0.12, 1.0, 0, 0.06, 0);
  const r = rnd(k + 3);
  for (let i = 0; i < (k ? 6 : 8); i++) {
    const lx = (i % 2) * 0.55 - 0.27, lz = ((i >> 1) % 2) * 0.47 - 0.23, ly = 0.12 + (i >> 2) * 0.41, ry = (r() - 0.5) * 0.12;
    b.box('cardboard', 0.5, 0.4, 0.44, lx, ly + 0.2, lz, { ry });
    b.plane(L(binLabel()), 0.18, 0.18, lx + Math.sin(ry) * 0.222, ly + 0.22, lz + Math.cos(ry) * 0.222, { ry });
    b.box('pl_red', 0.5, 0.05, 0.002, lx, ly + 0.395, lz + 0.221, { ry });
  }
  b.meta.coll = Box([-0.6, 0, -0.5], [0.6, 0.95, 0.5]);
});
// 平台磅秤(秤廢棄物用)
const scale = () => tpl('r8:scale', (b) => {
  b.box('steel', 0.8, 0.08, 0.6, 0, 0.04, 0, { r: 0.01 });
  b.box('iron', 0.06, 1.0, 0.06, 0, 0.58, -0.32);
  b.cyl('pl_red', 0.17, 0.09, 0, 1.15, -0.32, { axis: 'z', seg: 16 });
  b.plane(L(gaugeRect()), 0.27, 0.27, 0, 1.15, -0.274);
  b.meta.coll = Box([-0.4, 0, -0.38], [0.4, 1.3, 0.3]);
});
// 丟在地上的防護衣(攤平的白色連身衣 + 一隻鞋套)
const suitFloor = () => tpl('r8:suit', (b) => {
  b.box('fab_white', 0.42, 0.03, 0.62, 0, 0.015, 0, { r: 0.012, ry: 0.1 });
  b.box('fab_white', 0.14, 0.025, 0.55, -0.16, 0.012, 0.52, { r: 0.01, ry: 0.25 });
  b.box('fab_white', 0.14, 0.025, 0.55, 0.12, 0.012, 0.55, { r: 0.01, ry: -0.15 });
  b.box('fab_white', 0.5, 0.025, 0.14, -0.4, 0.012, -0.12, { r: 0.01, ry: 0.6 });
  b.sph('fab_white', 0.12, 0.05, 0.03, -0.42, { ws: 8, hs: 4, sy: 0.3 });
  b.box('pl_ltblue', 0.14, 0.05, 0.28, 0.5, 0.025, 0.3, { r: 0.02, ry: 1.0 });
});

function incinerator(R) {
  const ctx = R.ctx, ceil = ceilOf(R), fu = ctx.__b1?.furnace;
  if (fu) {
    R.put(furnaceKit(ceil - 0.05), fu.x, fu.z - 0.5, Math.PI, {});
    const a = R.tryPut(ashCart(), fu.x - 1.2, fu.z - 1.6, Math.PI + 0.35, {});
    if (!a) R.putChecked(ashCart(), fu.x - 1.2, fu.z - 1.6, Math.PI + 0.35);
    const S = R.run('S', (r) => r.t0 <= fu.x && r.t1 >= fu.x + 2.6);
    if (S) R.atWall(tapedSheet('inclog', incLog(), 0.22, 0.3), S, fu.x + 2.3, { mount: 1.25 });
    R.put(suitFloor(), fu.x + 1.4, fu.z - 2.3, 0.7, {});
  }
  // 北牆(橫段 x 84–96, z 52):封院期間堆起來的廢棄物山 + 棧板紙箱 + 告示 + 磅秤
  const N = R.run('N', (r) => r.plane < 53 && r.len > 6);
  if (N) {
    const t0 = Math.max(N.t0 + 3.2, 86.5);
    const p1 = R.atWall(bagPile(1, 2.6, 34), N, t0 + 1.3, { gap: 0.02 });
    const p2 = R.atWall(bagPile(2, 2.2, 28), N, t0 + 3.9, { gap: 0.02 });
    R.atWall(bioBoxes(0), N, t0 + 6.0, { gap: 0.05 });
    R.atWall(signPlate('waste', wasteSign(), 0.66, 0.36, { screws: true }), N, t0 + 2.6, { mount: 1.7 });
    if (p1 || p2) { const q = R.at(N, t0 + 2.6, 1.4); if (!R.tryPut(scale(), q.x, q.z, Math.PI + 0.2, {})) R.putChecked(scale(), q.x, q.z, Math.PI + 0.2); }
    for (const t of [t0 + 0.8, t0 + 4.6]) { const q = R.at(N, t, 0.9); floorDecal(R, 'stain', q.x, q.z, 1.4); }
  }
  // 推車進出的磨耗:隧道門 → 爐口
  if (fu) for (let k = 0; k < 4; k++) floorDecal(R, 'lane', 85.5 + k * 1.7, 55.5 + k * 2.1, 1.8, { yaw: 0.7 });
  scatter(R, 'glove', 6); litter(R, [['gauze', 6], ['paper', 6]]);
}

// ================================================================ B1 洗衣房
// 晾衣架:兩支鍍鋅管立柱 + 橫桿,上面掛床單(白)、手術衣(綠);布是有厚度的波浪薄盒(兩面都看得到)
const clothGeo = (w, h, seed, amp = 0.05) => {
  const g = new THREE.BoxGeometry(w, h, 0.012, 8, 5, 1), p = g.attributes.position, r = rnd(seed);
  const ph = r() * 6, k = 2 + r() * 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i), drop = (h / 2 - yy) / h; // 0 頂端 → 1 底部
    p.setZ(i, p.getZ(i) + Math.sin(x / w * Math.PI * k + ph) * amp * (0.3 + drop) + drop * drop * 0.04);
    if (yy < -h / 2 + 0.01) p.setY(i, yy + Math.sin(x * 7 + ph) * 0.03);
  }
  g.computeVertexNormals();
  return g;
};
const dryRack = (k) => tpl(`r8:dryrack:${k}`, (b) => {
  const len = 3.6, top = 2.05;
  for (const s of [-1, 1]) { b.cyl('galv', 0.025, top, s * len / 2, top / 2, 0, { seg: 8 }); b.box('galv', 0.05, 0.03, 0.6, s * len / 2, 0.015, 0); }
  b.cyl('galv', 0.02, len, 0, top, 0, { axis: 'x', seg: 8 });
  const r = rnd(k * 13 + 1);
  let x = -len / 2 + 0.15;
  while (x < len / 2 - 0.5) {
    const gown = r() < 0.35, w = gown ? 0.7 : 0.9 + r() * 0.5, h = gown ? 1.15 : 1.25 + r() * 0.3;
    if (x + w > len / 2 - 0.1) break;
    b.raw(gown ? 'fab_scrub' : r() < 0.2 ? 'fab_beige' : 'fab_white', clothGeo(w, h, k * 31 + x * 7), new THREE.Matrix4().makeTranslation(x + w / 2, top - h / 2 + 0.03, 0.03));
    b.box('fab_white', w, 0.05, 0.03, x + w / 2, top + 0.0, 0, { r: 0.01 }); // 搭在桿上的部分
    x += w + 0.06 + r() * 0.12;
  }
});
// 一疊封口的污染布單袋(黃袋 + 紅色膠帶 + 貼紙)
const linenBags = (k) => tpl(`r8:linenbags:${k}`, (b) => {
  const r = rnd(k + 41);
  for (let i = 0; i < 7; i++) {
    const row = i < 4 ? 0 : 1, x = (i % 4) * 0.42 - 0.63 + (row ? 0.2 : 0) + (r() - 0.5) * 0.1, z = (r() - 0.5) * 0.25, rr = 0.22 + r() * 0.05;
    b.raw('po_bag_yellow', bagGeo(rr, k * 57 + i), compose(x, row * 0.28 + rr * 0.5, z, 0, r() * 6, 0, 1.1, 1.0, 1.0));
    b.box('pl_red', 0.04, 0.05, 0.12, x, row * 0.28 + rr * 1.5, z, { r: 0.01, ry: r() * 3 }); // 紅膠帶封口
  }
  b.meta.coll = Box([-0.9, 0, -0.32], [0.9, 0.8, 0.32]);
});

function laundry(R) {
  // 下段大房間(x 18–36, z 48–66):兩排晾衣架橫在中間(從隧道門口看進來是一片垂掛的白布)
  const spots = [[27.6, 53.9, HALF + 0.05, 0], [23.4, 58.6, HALF - 0.04, 1], [31.2, 61.4, HALF, 2]];
  for (let [x, z, yaw, k] of spots) {
    const t = dryRack(k);
    let p = R.putChecked(t, x, z, yaw);
    if (!p && k === 2) for (const [x2, z2] of [[30.4, 51.6], [20.4, 54.2], [31.0, 63.6]]) { p = R.putChecked(t, x2, z2, yaw); if (p) { x = x2; z = z2; break; } }
    if (p) for (const s of [-1, 1]) R.collide(Box([-0.05, 0, -0.3], [0.05, 2.05, 0.3]), x + Math.cos(yaw) * s * 1.8, R.y, z - Math.sin(yaw) * s * 1.8, yaw);
  }
  // 污衣 / 清潔分區:地上一條黃線 + 兩邊的噴漆字
  const zx = 33.4; // 隧道門(東)進來的那一側是污衣區
  R.put(tpl('r8:zoneline', (b) => b.box('pl_yellow', 0.06, 0.003, 15.0, 0, 0.0015, 0)), zx, 57.0, 0, {});
  for (const zz of [51.0, 62.6]) {
    R.put(tpl('r8:zonepaint0', (b) => b.plane(D(zonePaint(0)), 1.3, 0.49, 0, 0, 0, { rx: -HALF })), zx + 1.0, zz, HALF, { y: R.y + 0.005 });
    R.put(tpl('r8:zonepaint1', (b) => b.plane(D(zonePaint(1)), 1.3, 0.49, 0, 0, 0, { rx: -HALF })), zx - 1.0, zz, -HALF, { y: R.y + 0.005 });
  }
  // 上段(x 18–24,樓梯門 z≈43 進來):牆邊一堆封口的污染布單 + 告示
  const W1 = R.run('W', (r) => r.t0 <= 30 && r.t1 >= 44); // 西牆是一整段(z 28–66)
  if (W1) {
    if (![39.6, 41.2, 36.2, 34.4].some((t) => R.atWall(linenBags(0), W1, t, { gap: 0.04 }))) R.wall(linenBags(0), { runs: [W1], collide: false });
    R.atWall(tapedSheet('linen', noteRect('linen', ['SARS 病房布單', '一律裝黃袋', '紅膠帶封口', '直接送焚化', '不准拆開洗', '92.5.2 感控'], { w: 96, h: 112, col: '#9a1010', size: 11 }), 0.26, 0.3, 0.03), W1, 39.2, { mount: 1.35 });
  }
  floorDecal(R, 'water', 24.6, 56.8, 2.2);
  floorDecal(R, 'drip', 25.4, 60.2, 0.8);
}

// ================================================================ 3F 監控室
// 一排錄影帶(書背朝外,手寫日期標籤)
const vhsSpines = (k) => labRect(`r8:vhsspine:${k % 2}`, 256, 24, (c, w, h) => {
  const r = rnd(k + 5); c.fillStyle = '#141414'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 7) { if (r() < 0.1) { c.fillStyle = '#050505'; c.fillRect(x, 0, 7, h); continue; } c.fillStyle = r() < 0.15 ? '#2a2a2a' : '#1c1c1c'; c.fillRect(x, 0, 6, h); c.fillStyle = r() < 0.2 ? '#d8c890' : '#e8e4d8'; c.fillRect(x + 1, 6, 4, 11); }
});
// 一排錄影帶:一個盒子 + 書背貼圖(一捲一個盒子太多三角形)
const vhsRow = (w, k) => tpl(`r8:vhsrow:${w.toFixed(2)}:${k % 2}`, (b) => {
  b.box('pl_black', w, 0.186, 0.1, 0, 0.093, 0);
  b.plane(L(vhsSpines(k)), w, 0.186, 0, 0.093, 0.0505);
});
// 第二面監視牆:鐵架 + 4×3 台平面盒子的 CRT(畫面:既有 cctv、三台 NO SIGNAL、三台雜訊)
const crtRack = () => tpl('r8:crtrack', (b) => {
  const cols = 4, rows = 3, cw = 0.5, rh = 0.42, w = cols * cw;
  for (const x of [-w / 2 - 0.02, w / 2 + 0.02]) b.box('steel', 0.04, 0.9 + rows * rh, 0.5, x, (0.9 + rows * rh) / 2, 0.25);
  for (let r = 0; r <= rows; r++) b.box('steel', w + 0.08, 0.03, 0.5, 0, 0.88 + r * rh, 0.25);
  b.box('pl_dark', w + 0.04, 0.85, 0.48, 0, 0.425, 0.25); // 下面的錄影機櫃
  const noise = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + cw * (c + 0.5), y = 0.9 + r * rh, idx = r * cols + c;
    b.box(c % 2 ? 'pl_beige' : 'pl_dark', cw - 0.05, rh - 0.06, 0.24, x, y + (rh - 0.06) / 2, 0.36);
    b.box(c % 2 ? 'pl_beige' : 'pl_dark', (cw - 0.05) * 0.7, (rh - 0.06) * 0.8, 0.2, x, y + (rh - 0.06) * 0.45, 0.16);
    const sx = x, sy = y + (rh - 0.06) * 0.54, sz = 0.481, sw = (cw - 0.05) * 0.78, sh = (rh - 0.06) * 0.74;
    if ([1, 6, 9].includes(idx)) b.plane(G(noSig([1, 6, 9].indexOf(idx))), sw, sh, sx, sy, sz);
    else if ([3, 7, 11].includes(idx)) { b.plane('screen_dark', sw, sh, sx, sy, sz - 0.001); noise.push([sx, sy, sz + 0.001, sw, sh]); }
    else if (idx === 4) b.plane('screen_dark', sw, sh, sx, sy, sz);
    else b.plane(G(cctv(9 + idx)), sw, sh, sx, sy, sz);
  }
  b.meta.noise = noise;
  b.meta.coll = Box([-w / 2 - 0.05, 0, 0], [w / 2 + 0.05, 0.9 + rows * rh, 0.5]);
});
const tapeBox = () => tpl('r8:tapebox', (b) => {
  b.box('cardboard', 0.5, 0.32, 0.36, 0, 0.16, 0);
  b.box('pl_cream', 0.52, 0.05, 0.002, 0, 0.3, 0.181); b.box('pl_cream', 0.05, 0.002, 0.38, 0, 0.321, 0);
  b.plane(L(tapeLabel(1)), 0.2, 0.125, 0, 0.17, 0.1812);
});
// 錄影機沒訊號時的藍畫面(2003 年的 CRT/VCR,遠遠就看得到的藍光)
const noSig = (k) => glowRect(`r8:nosig:${k}`, 64, 48, (c, w, h) => {
  c.fillStyle = '#1838b8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
  c.fillStyle = '#e8ecff'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('NO SIGNAL', w / 2, h / 2 + 3); c.font = '7px monospace'; c.fillText(`CH${String(k + 4).padStart(2, '0')}`, 12, 9);
});
const camBoard = () => tpl('r8:cammapboard', (b) => {
  b.box('alu', 0.96, 0.68, 0.02, 0, 0.34, 0.01);
  b.box('pl_white', 0.9, 0.62, 0.004, 0, 0.34, 0.022);
  b.plane(L(camMap()), 0.86, 0.586, 0, 0.34, 0.0245);
});
const logbook = () => tpl('r8:logbook', (b) => {
  b.box('fab_navy', 0.24, 0.02, 0.32, 0, 0.01, 0);
  b.plane(L(tapeLabel(0)), 0.12, 0.075, 0, 0.0205, -0.06, { rx: -HALF });
  b.box('paper', 0.22, 0.012, 0.3, 0.22, 0.006, 0.02, { ry: 0.1 }); // 攤開的另一本
  b.cyl('pl_blue', 0.005, 0.14, 0.18, 0.02, 0.05, { axis: 'x', seg: 6, ry: 0.4 });
});

function monitorRoom(R) {
  const N = R.run('N'), W = R.run('W'), E = R.run('E'), S = R.run('S', (r) => r.t1 <= 94.1);
  // 第二面監視牆(北牆東段)+ 前面的值班桌
  if (N) {
    const mw = R.atWall(crtRack(), N, 99.0, { gap: 0.02 });
    if (mw) noiseScreens(R, mw);
    const tb = R.atWall(tableLong(2.0, 0.75, 4), N, 99.0, { gap: 0.82 });
    if (tb) {
      const put = (t, u, v, dy = 0, yaw = 0) => { const q = R.onTop(tb, u, v); R.put(t, q.x, q.z, tb.yaw + yaw, { y: q.y + dy }); };
      put(logbook(), 0.3, 0.55, 0, 0.15);
      put(phone(1), 0.78, 0.4, 0, -0.3);
      put(ctpl('mug'), 0.6, 0.7);
      put(tapeBox(), 0.12, 0.35, 0, 0.1);
      R.putChecked(chairShell('pl_gray', 2), tb.x + 0.2, tb.z + 0.85, Math.PI - 0.5, { static: true });
    }
  }
  // 錄影帶架(東牆北段):五層、每層一排日期標籤的錄影帶
  if (E) {
    const rk = R.atWall(shelfRack(1.2, 2.0, 0.35, 5, 3), E, 15.4, { gap: 0.03 });
    if (rk) rk.t.tops.forEach((tp, i) => { if (i < 5) R.putRel(vhsRow(tp.x1 - tp.x0 - 0.08 - (i % 2) * 0.12, i), rk, (tp.x0 + tp.x1) / 2 - (i % 2) * 0.06, tp.y, (tp.z0 + tp.z1) / 2); });
  }
  if (W) R.atWall(camBoard(), W, 15.6, { mount: 1.25 });
  // 房間中間:兩張背對背的鐵桌(封院時保全組併起來輪班用),各一台 CRT、文件、椅子
  const ix = 96.6, iz = 18.5;
  const d = R.tryPut(tableLong(1.8, 0.8, 2), ix, iz, 0, {});
  if (d) {
    const q = R.onTop(d, 0.72, 0.4); R.put(crtMonitor(1, cctv(9)), q.x, q.z, d.yaw - 0.15, { y: q.y });
    for (const [u, v, a] of [[0.25, 0.55, 0.3], [0.4, 0.35, -0.2]]) { const f = R.onTop(d, u, v); R.put(ctpl('file'), f.x, f.z, d.yaw + a, { y: f.y }); }
    R.putChecked(chairShell('pl_gray', 1), d.x + 0.3, d.z + 0.75, Math.PI + 0.3, { static: true });
  }
  // 保全睡的行軍床(南牆西段,門的左手邊)
  if (S) { const c = R.atWall(cot8(1), S, 90.6, { gap: 0.05 }); if (c) { const q = R.local(c, -1.25, 0, 0.1); if (R.freeAt(q.x, q.z, 0.2)) R.put(nightStool(), q.x, q.z, c.yaw - 0.4, {}); } }
  // 地上的訊號線(從主控台拖到第二面牆)
  R.put(tpl('r8:moncables', (b) => { cable(b, [[0, 0.01, 0], [1.6, 0.012, 0.25], [3.4, 0.01, 0.1], [5.6, 0.012, -0.3]], 0.012, 'rubber'); cable(b, [[0, 0.01, 0.08], [1.8, 0.012, 0.36], [3.5, 0.01, 0.22], [5.6, 0.012, -0.2]], 0.008, 'pl_gray'); }), 93.4, 16.1, 0, {});
  floorDecal(R, 'lane', 95.0, 20.2, 1.6, { yaw: 0 });
}


// ================================================================ 2F ICU 護理站牆(水平段南牆 x 84–96:從北門進來正對的那面白牆)
// 床位白板(床號/姓名/診斷/主護,第 3 床紅筆劃掉)、病歷架、手套盒架、穿脫防護衣海報、藥車、壁掛電話 + 分機表、針頭收集盒、停住的鐘
const bedBoard = () => labRect('r8:icuboard', 256, 150, (c, w, h) => {
  c.fillStyle = '#eceee8'; c.fillRect(0, 0, w, h);
  const mk = (s, x, y, o = {}) => text(c, s, x, y, { size: o.size || 11, color: o.col || '#1a2a8a', weight: 'normal', font: HAND, align: o.align || 'left' });
  text(c, '加護病房 床位表', 8, 11, { size: 12, color: '#111', align: 'left' }); mk('92.5.4', w - 8, 11, { align: 'right', col: '#111' });
  c.strokeStyle = '#333'; c.lineWidth = 1; for (const yy of [22, 48, 74, 100, 126]) { c.beginPath(); c.moveTo(4, yy); c.lineTo(w - 4, yy); c.stroke(); }
  for (const xx of [26, 86, 196]) { c.beginPath(); c.moveTo(xx, 22); c.lineTo(xx, 126); c.stroke(); }
  [['1', '陳○○', 'SARS 確診 插管', '淑芬'], ['2', '黃○○', 'SARS 疑似 高燒', '雅惠'], ['3', '王○○', 'SARS 確診', '淑芬'], ['4', '', '空床 消毒中', '']].forEach(([n, nm, dx, rn], i) => {
    const yy = 36 + i * 26; mk(n, 12, yy, { size: 13, col: '#111' }); mk(nm, 32, yy); mk(dx, 92, yy, { col: dx.includes('確診') ? '#b01010' : '#1a2a8a' }); mk(rn, 202, yy);
    c.fillStyle = ['#d02020', '#2050c0', '#20a040', '#d0a020'][i]; c.beginPath(); c.arc(w - 10, yy - 4, 4, 0, 7); c.fill();
  });
  c.strokeStyle = 'rgba(190,20,20,0.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(28, 86); c.lineTo(194, 92); c.stroke(); mk('5/3 22:40', 120, 97, { col: '#b01010', size: 9 });
  mk('N95 每班換  家屬禁止進入', 8, 140, { col: '#b01010', size: 10 });
  c.fillStyle = 'rgba(80,80,80,0.12)'; for (let i = 0; i < 6; i++) c.fillRect(30 + i * 37, 104 + (i % 2) * 6, 26, 3); // 擦不乾淨的舊字
});
const icuBoard = () => tpl('r8:icuboardt', (b) => {
  b.box('alu', 1.62, 0.96, 0.025, 0, 0.48, 0.0125);
  b.plane(L(bedBoard()), 1.56, 0.9, 0, 0.48, 0.0256);
  b.box('alu', 1.5, 0.03, 0.06, 0, 0.0, 0.035);
  for (const [x, col] of [[-0.4, 'pl_red'], [-0.3, 'pl_blue'], [0.5, 'pl_dark']]) b.cyl(col, 0.008, 0.12, x, 0.025, 0.045, { axis: 'x', seg: 6 });
});
const chartRack = () => tpl('r8:chartrack', (b) => {
  b.box('alu', 0.62, 0.6, 0.02, 0, 0.3, 0.01);
  for (let i = 0; i < 4; i++) {
    const y = 0.1 + i * 0.14;
    b.box('alu', 0.6, 0.02, 0.1, 0, y, 0.06, { rx: -0.5 });
    if (i !== 2) b.box(i % 2 ? 'pl_blue' : 'alu', 0.26, 0.34, 0.025, -0.15 + (i % 2) * 0.28, y + 0.13, 0.085, { rx: -0.25 });
  }
});
const gloveBoxes = () => tpl('r8:gloves', (b) => {
  b.box('steel', 0.78, 0.02, 0.14, 0, 0, 0.07);
  for (const [x, col] of [[-0.26, 'pl_ltblue'], [0, 'pl_ltblue'], [0.26, 'pl_white']]) { b.box(col, 0.24, 0.13, 0.12, x, 0.075, 0.07); b.box('pl_dark', 0.12, 0.03, 0.002, x, 0.1, 0.131); }
  b.box('pl_ltblue', 0.07, 0.012, 0.09, 0.05, 0.145, 0.07, { ry: 0.4 }); // 抽出一半的手套
  b.cyl('pl_white', 0.035, 0.18, -0.48, 0.09, 0.06, { seg: 10 }); b.cyl('pl_dark', 0.012, 0.04, -0.48, 0.2, 0.06, { seg: 6 }); // 酒精乾洗手
});
const wallPhone = () => tpl('r8:wallphone', (b) => {
  b.box('pl_beige', 0.12, 0.22, 0.06, 0, 0.11, 0.03, { r: 0.01 });
  b.box('pl_beige', 0.05, 0.2, 0.05, 0.0, 0.12, 0.085, { r: 0.015 });
  cable(b, [[0, 0.02, 0.08], [0.05, -0.25, 0.12], [-0.02, -0.4, 0.1], [0.0, -0.05, 0.065]], 0.005, 'pl_beige');
  b.plane(L(noteRect('ext', ['分機', '護理站 2201', '值班醫師 2210', '感控 2305', '總務 1102'], { w: 80, h: 80, size: 9, lh: 13, col: '#222' })), 0.16, 0.16, 0.18, 0.1, 0.002, { rz: -0.04 });
});
const sharps = () => tpl('r8:sharps', (b) => { b.box('steel', 0.2, 0.02, 0.15, 0, 0, 0.075); b.box('pl_yellow', 0.18, 0.24, 0.13, 0, 0.13, 0.075, { r: 0.01 }); b.box('pl_red', 0.18, 0.04, 0.13, 0, 0.26, 0.075, { r: 0.01 }); });
function icuWall(R) {
  const S = R.run('S', (r) => r.plane < 34.1 && r.len >= 8);
  if (!S) return;
  const a = (t, x, o) => R.atWall(t, S, x, o);
  a(posterSheet(sarsSheet('ppe'), 0.36, 0.5, { curl: 0.05 }), 87.7, { mount: 1.3 });
  a(bin('pedal', 1), 87.7, { collide: false, gap: 0.05 });
  a(gloveBoxes(), 88.95, { mount: 1.22 });
  a(supplyCart(2), 90.3, { gap: 0.05 }) || a(supplyCart(2), 90.3, { gap: 0.05, collide: false });
  a(wallClock(1), 90.3, { mount: 2.2 });
  a(icuBoard(), 92.4, { mount: 1.0 });
  a(chartRack(), 94.15, { mount: 0.95 });
  a(wallPhone(), 95.15, { mount: 1.3 });
  a(sharps(), 95.4, { mount: 0.85 });
  for (const [t, y, k] of [[95.15, 1.45, 'grime'], [92.4, 1.1, 'grime'], [90.3, 0.5, 'scuff']]) wallDecal(R, S, t, y, k, 0.7);
  for (let x = 88.2; x < 95.5; x += 1.8) floorDecal(R, 'lane', x, 33.1, 1.7, { yaw: HALF + (R.rng() - 0.5) * 0.06 });
  scatter(R, 'paper3', 3, { near: { x: 93.0, z: 33.2, r: 0.8 } });
}

// ================================================================ 1F 員工餐廳:封院 14 天的休息區與物資站
// 北牆窗下兩張行軍床、東牆一堆捐來的物資(礦泉水、泡麵、口罩、便當)、西牆白板(便當數/量體溫)、
// 南牆兩門之間一條床單手寫布條「醫護人員 加油」、北牆電視
const supplyLabel = (k) => labRect(`r8:supply:${k}`, 96, 56, (c, w, h) => {
  c.fillStyle = ['#c8b48a', '#d8ccb0', '#e6e2d6', '#c8b48a'][k]; c.fillRect(0, 0, w, h);
  const t = [['礦泉水', '600ml × 24'], ['炸醬麵', '一箱 30 入'], ['醫用口罩', '50 入 × 20'], ['愛心物資', '扶輪社 捐贈']][k];
  text(c, t[0], w / 2, 20, { size: k === 3 ? 18 : 16, color: k === 3 ? '#b01010' : '#1a3a8a', font: k === 3 ? HAND : undefined });
  text(c, t[1], w / 2, 42, { size: 10, color: '#222', weight: 'normal' });
  grime(c, w, h, 0.25);
});
const supplies = () => tpl('r8:supplies', (b) => {
  const r = rnd(808);
  // 礦泉水(收縮膜六排)兩箱疊兩層、泡麵紙箱、口罩紙箱、最上面幾個便當
  for (let i = 0; i < 4; i++) {
    const x = -0.52 + (i % 2) * 0.42, y = Math.floor(i / 2) * 0.26, ry = (r() - 0.5) * 0.1;
    b.box('pl_clear', 0.4, 0.25, 0.27, x, y + 0.125, 0, { ry });
    for (let k = 0; k < 6; k++) b.cyl('pl_ltblue', 0.03, 0.235, x - 0.15 + (k % 3) * 0.15, y + 0.12, (k < 3 ? -0.065 : 0.065), { seg: 6 });
    if (i < 2) b.plane(L(supplyLabel(0)), 0.2, 0.11, x, y + 0.13, 0.137, { ry });
  }
  for (let i = 0; i < 3; i++) { const y = i * 0.34, x = 0.2 + (i % 2) * 0.05; b.box('cardboard', 0.5, 0.33, 0.4, x, y + 0.165, 0.02, { ry: (r() - 0.5) * 0.12 }); b.plane(L(supplyLabel(i === 2 ? 3 : 1)), 0.3, 0.17, x, y + 0.17, 0.222); }
  b.box('cardboard', 0.4, 0.3, 0.32, 0.68, 0.15, 0.04, { ry: 0.2 }); b.plane(L(supplyLabel(2)), 0.26, 0.15, 0.68 + 0.03, 0.16, 0.2, { ry: 0.2 });
  for (let i = 0; i < 5; i++) b.box('paper', 0.2, 0.045, 0.15, -0.35 + (i % 3) * 0.17, 0.52 + 0.025 + Math.floor(i / 3) * 0.05, -0.02 + (i % 2) * 0.03, { ry: (r() - 0.5) * 0.3 }); // 沒吃的便當
  b.meta.coll = Box([-0.75, 0, -0.18], [0.9, 1.02, 0.25]);
});
const cafeBoard = () => labRect('r8:cafeboard', 224, 144, (c, w, h) => {
  c.fillStyle = '#eceee6'; c.fillRect(0, 0, w, h);
  const mk = (s, x, y, size = 13, col = '#1a2a8a') => text(c, s, x, y, { size, color: col, weight: 'normal', font: HAND, align: 'left' });
  mk('封院第 6 天', 10, 16, 16, '#b01010'); mk('5/4 (日)', 150, 16, 12, '#111');
  mk('便當  午 186   晚 172', 10, 44); mk('量體溫  早 8:00  晚 20:00', 10, 66); mk('超過 38℃ 馬上通報 2305', 10, 88, 12, '#b01010');
  mk('換洗衣物 → B1 洗衣房', 10, 110, 12); mk('大家加油!!  撐過去', 10, 132, 14, '#2a7a3a');
  c.fillStyle = 'rgba(80,80,80,0.1)'; for (let i = 0; i < 5; i++) c.fillRect(120 + i * 18, 92 + (i % 3) * 14, 14, 3);
});
const cafeBoardT = () => tpl('r8:cafeboardt', (b) => { b.box('alu', 1.24, 0.82, 0.025, 0, 0.41, 0.0125); b.plane(L(cafeBoard()), 1.18, 0.76, 0, 0.41, 0.0256); b.box('alu', 1.1, 0.03, 0.06, 0, 0.0, 0.035); });
const bannerRect = () => labRect('r8:banner', 288, 72, (c, w, h) => {
  c.fillStyle = '#e4e0d4'; c.fillRect(0, 0, w, h);
  text(c, '醫護人員 加油!', w / 2, h / 2 + 2, { size: 40, color: '#b4140e', font: HAND });
  c.fillStyle = 'rgba(180,20,14,0.5)'; for (const x of [40, 120, 210]) c.fillRect(x, h / 2 + 18, 2, 10 + (x % 7)); // 毛筆字往下流
  grime(c, w, h, 0.3);
});
const banner = () => tpl('r8:bannert', (b) => {
  const g = new THREE.PlaneGeometry(2.6, 0.66, 8, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, 0.02 + Math.sin(x * 2.4) * 0.025 + (p.getY(i) < 0 ? 0.015 : 0)); p.setY(i, p.getY(i) - Math.cos(x * 1.2) * 0.04); }
  g.computeVertexNormals();
  b.raw(L(bannerRect()), g, new THREE.Matrix4().makeTranslation(0, 0.33, 0), 'rect');
  for (const x of [-1.25, 1.25]) b.box('pl_cream', 0.06, 0.02, 0.004, x, 0.64, 0.02);
});
function cafeteria(R) {
  const Na = R.run('N', (r) => r.t1 <= 72.1), Nb = R.run('N', (r) => r.t0 >= 73.9), W = R.run('W'), E = R.run('E'), S = R.run('S', (r) => r.t0 >= 69.9 && r.t1 <= 76.1);
  if (Na) for (const [t, k] of [[66.5, 0], [69.85, 1]]) {
    const c = R.atWall(cot8(k), Na, t, { gap: 0.08 });
    if (!c) continue;
    const q = R.local(c, k ? 1.15 : -1.15, 0, 0.2); if (R.freeAt(q.x, q.z, 0.15)) R.put(k ? nightStool() : ctpl('shoe'), q.x, q.z, c.yaw + 0.4, {});
  }
  if (E) R.atWall(supplies(), E, 18.6, { gap: 0.05 }) || R.atWall(supplies(), E, 19.4, { gap: 0.05 });
  if (E) R.atWall(tapedSheet('take', noteRect('take', ['愛心物資', '請自取', '一人一份', '謝謝大家'], { w: 80, h: 80, size: 13, col: '#b01010', lines: false }), 0.24, 0.24, -0.04), E, 18.0, { mount: 1.35 });
  if (W) R.atWall(cafeBoardT(), W, 19.6, { mount: 1.0 });
  if (S) R.atWall(banner(), S, 73.0, { mount: 1.95 });
  if (Nb) R.atWall(tvWall(1), Nb, 76.2, { mount: 2.25 });
  floorDecal(R, 'lane', 73.0, 20.6, 1.6, { yaw: 0 });
}

// ================================================================ 2F 小兒病房:陪病家屬的行軍床、地上的拼圖地墊、牆上一片加油卡片、屋頂漏水接水的桶子
const cardsRect = () => labRect('r8:cards', 176, 104, (c, w, h) => {
  c.fillStyle = '#d8d0c0'; c.fillRect(0, 0, w, h);
  const r = rnd(71), cols = ['#f0c8d0', '#c8e0f0', '#f0e8b0', '#d0f0c8', '#f8d8b0', '#e0d0f0'];
  const msg = ['早日康復', '加油!', '小宇 要勇敢', '等你回家', '平安', '阿嬤愛你', '快快好起來', '加油加油'];
  for (let i = 0; i < 8; i++) {
    const x = 6 + (i % 4) * 42 + r() * 4, y = 6 + Math.floor(i / 4) * 50 + r() * 4;
    c.save(); c.translate(x + 18, y + 22); c.rotate((r() - 0.5) * 0.3); c.fillStyle = cols[i % 6]; c.fillRect(-18, -21, 37, 43);
    text(c, msg[i], 0, -6, { size: 8, color: '#b01818', weight: 'normal', font: HAND, maxW: 34 });
    c.fillStyle = ['#e04040', '#3060d0', '#30a050'][i % 3]; c.beginPath(); c.arc(-6 + (i % 3) * 6, 10, 5, 0, 7); c.fill(); c.restore();
  }
});
const playMat = () => tpl('r8:playmat', (b) => {
  const cols = ['pl_red', 'pl_yellow', 'pl_blue', 'pl_green'], r = rnd(12);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    if (i === 3 && j === 0) continue;
    const off = i === 2 && j === 2 ? [0.35, 0.25, 0.5] : [0, 0, 0];
    b.box(cols[(i + j) % 4], 0.49, 0.012, 0.49, -0.75 + i * 0.5 + off[0], 0.006, -0.5 + j * 0.5 + off[1], { ry: off[2] + (r() - 0.5) * 0.03 });
  }
});
function peds(R) {
  const W = R.run('W', (r) => r.t0 >= 61.9);
  R.put(playMat(), 96.2, 62.6, 0.1, {});
  const c = R.tryPut(cot8(1), 100.4, 60.6, 0, {}) || R.tryPut(cot8(1), 96.6, 64.8, 0, {});
  if (c) { const q = R.local(c, -1.15, 0, 0.1); if (R.freeAt(q.x, q.z, 0.15)) R.put(nightStool(), q.x, q.z, 0.6, {}); }
  if (W) R.atWall(tpl('r8:cardsw', (b) => { b.plane(L(cardsRect()), 0.9, 0.53, 0, 0.27, 0.004); }), W, 63.6, { mount: 1.1 });
  leak(R, 93.4, 63.6);
}

// 接水的塑膠桶(水面用不透明的深色亮面:共用的 bin('bucket') 水面是透明材質,整區合併成一個獨立網格,會多一個 draw call)
const bucket8 = (k) => tpl(`r8:bucket:${k}`, (b) => {
  const c = k ? 'pl_red' : 'pl_blue';
  b.lathe(c, [[0, 0.005], [0.12, 0.005], [0.15, 0.3], [0.157, 0.3], [0.13, 0.0]], 0, 0, 0, { seg: 12 });
  b.cyl('film', 0.142, 0.004, 0, 0.21, 0, { seg: 12 });
  b.tube('steel', [[-0.15, 0.29, 0], [-0.1, 0.42, 0], [0.1, 0.42, 0], [0.15, 0.29, 0]], 0.004, { seg: 3 });
});
// ================================================================ 屋頂漏水(三樓走廊、二樓南側直接在屋頂下的房間):天花板水漬、地上一灘水、接水的桶子
function leak(R, x, z, o = {}) {
  if (!R.freeAt(x, z, 0.25)) return;
  const c = Math.floor(x / 2), r = Math.floor(z / 2), h = R.L.ceilY(R.li, c, r) - R.y;
  if (!Number.isFinite(h)) return;
  const rect = decal('water', 1, true);
  R.put(tpl(`r8:ceilstain:${h.toFixed(2)}`, (b) => b.plane(D(rect), 1.5, 1.5 * rect.h / rect.w, 0, h - 0.012, 0, { rx: HALF })), x + 0.1, z - 0.1, R.rng() * 6, {});
  floorDecal(R, 'water', x, z, o.pool ?? 1.6);
  if (o.bucket !== false) R.putChecked(bucket8(o.k ?? 0), x + 0.05, z + 0.05, R.rng() * 6, { static: true });
}
function f3Leaks(R) {
  for (const [x, z] of [[33.0, 25.2], [61.0, 24.8], [87.0, 25.4], [42.6, 33.0]]) leak(R, x, z, { k: Math.round(x) % 2 });
}


// ================================================================ 1F 復健室:封院第三天起改成「臨時收治區」(疑似病例睡地上的床墊、塑膠隔板、點滴架、告示)
const floorBed = (k) => tpl(`r8:floorbed:${k}`, (b) => {
  const r = rnd(k * 9 + 4);
  b.box('mattress', 0.9, 0.12, 1.9, 0, 0.06, 0, { r: 0.03 });
  b.box(k % 2 ? 'fab_white' : 'fab_beige', 0.94, 0.02, 1.7, 0, 0.125, 0.05, { r: 0.008 });
  b.box('fab_white', 0.5, 0.1, 0.32, (r() - 0.5) * 0.1, 0.17, -0.72, { r: 0.04, ry: (r() - 0.5) * 0.3 });
  b.box(k % 3 === 0 ? 'fab_floral' : 'fab_gray', 0.98, 0.07, 1.05, 0.04, 0.16, 0.35, { r: 0.03, ry: (r() - 0.5) * 0.25, rz: 0.04 });
  if (k % 2) b.box('fab_white', 0.6, 0.012, 0.4, 0.55, 0.006, -0.3, { ry: 0.6 }); // 拖到地上的被單角
});
const divider = (k) => tpl(`r8:divider:${k}`, (b) => {
  const len = 1.9, top = 1.75;
  for (const x of [-len / 2, len / 2]) { b.cyl('alu', 0.016, top, x, top / 2, 0, { seg: 6 }); b.box('alu', 0.04, 0.02, 0.5, x, 0.01, 0); }
  b.cyl('alu', 0.014, len, 0, top, 0, { axis: 'x', seg: 6 });
  const g = clothGeo(len - 0.06, top - 0.2, 300 + k, 0.025);
  b.raw('pl_clear', g, new THREE.Matrix4().makeTranslation(0, top / 2 + 0.08, 0));
  b.box('pl_yellow', len - 0.06, 0.05, 0.004, 0, 1.15, 0.012); // 膠帶補過
  b.meta.coll = Box([-len / 2 - 0.03, 0, -0.06], [len / 2 + 0.03, top, 0.06]);
});
const wardSign = () => labRect('r8:wardb', 160, 104, (c, w, h) => {
  c.fillStyle = '#efe9d4'; c.fillRect(0, 0, w, h); c.fillStyle = '#b01414'; c.fillRect(0, 0, w, 26);
  text(c, '臨時收治區 B', w / 2, 13, { size: 17, color: '#fff' });
  text(c, '疑似病例 · 未經許可勿入', w / 2, 40, { size: 12, color: '#111' });
  [['B1 張', '37.9'], ['B2 李', '38.4'], ['B3 —', '']].forEach(([n, t], i) => { text(c, n, 40, 60 + i * 15, { size: 11, color: '#1b2a6a', weight: 'normal', font: HAND }); text(c, t, 110, 60 + i * 15, { size: 11, color: t > '38' ? '#b01010' : '#1b2a6a', weight: 'normal', font: HAND }); });
  grime(c, w, h, 0.3);
});
function rehab(R) {
  const S = R.run('S');
  let n = 0;
  const spots = [[100.6, 20.5], [98.7, 20.6], [98.4, 20.2], [93.4, 20.7], [92.2, 20.7], [86.2, 17.0]];
  for (const k of [0, 1, 2]) for (const [x, z] of spots) if (R.putChecked(floorBed(k), x, z, (k - 1) * 0.05)) { n++; spots.splice(spots.findIndex((q) => q[0] === x && q[1] === z), 1); break; }
  if (n) {
    [[99.6, 18.6, 0], [99.2, 18.9, 0], [97.9, 21.0, HALF], [94.9, 20.9, HALF]].some(([x, z, yaw]) => R.tryPut(divider(0), x, z, yaw, {}) || R.putChecked(divider(0), x, z, yaw));
    R.dyn(tpl('r8:ivlite', (b) => { b.cyl('chrome', 0.012, 1.9, 0, 0.95, 0, { seg: 6 }); for (let i = 0; i < 4; i++) { const a = i * HALF; b.rod('chrome', 0.01, [0, 0.08, 0], [Math.cos(a) * 0.25, 0.02, Math.sin(a) * 0.25], { seg: 4 }); } b.box('pl_clear', 0.1, 0.16, 0.04, 0.08, 1.75, 0, { r: 0.02 }); b.rod('pl_clear', 0.003, [0.08, 1.67, 0], [0.3, 0.2, 0.2], { seg: 3 }); }), 97.6, 21.1, 0, { mass: 5, shape: 'cylinder' });
    if (S) R.atWall(signPlate('wardb', wardSign(), 0.5, 0.33), S, 100.6, { mount: 1.4 });
    R.put(ctpl('cup'), 98.0, 19.4, 0, {}); R.put(ctpl('pillbottle'), 101.3, 19.3, 0, {});
  }
}

// ================================================================ 1F 禮拜堂:代禱板(封院時家屬和護理人員寫的小紙條)
const prayerRect = () => labRect('r8:prayer', 192, 128, (c, w, h) => {
  c.fillStyle = '#8a6a44'; c.fillRect(0, 0, w, h); // 軟木
  c.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 300; i++) c.fillRect((i * 37) % w, (i * 53) % h, 2, 2);
  text(c, '代 禱', w / 2, 12, { size: 13, color: '#f0e6c8' });
  const r = rnd(5), msg = ['求主保守 爸爸', '小鈴 平安', '207 的護士們', '早日回家', '主啊 憐憫', '阿芬 加油', '讓燒退吧', '我們等你'];
  for (let i = 0; i < 12; i++) {
    const x = 6 + (i % 4) * 46 + r() * 6, y = 24 + Math.floor(i / 4) * 34 + r() * 4;
    c.save(); c.translate(x + 19, y + 14); c.rotate((r() - 0.5) * 0.25);
    c.fillStyle = ['#efe8d2', '#f0e0a8', '#e8d8d8', '#dce8f0'][i % 4]; c.fillRect(-19, -13, 38, 27);
    text(c, msg[i % 8], 0, 0, { size: 7, color: '#2a2a6a', weight: 'normal', font: HAND, maxW: 34 });
    c.fillStyle = '#b01818'; c.beginPath(); c.arc(0, -11, 1.8, 0, 7); c.fill(); c.restore();
  }
});
function chapel(R) {
  const N = R.run('N');
  if (N) R.atWall(tpl('r8:prayerb', (b) => { b.box('wood_dark', 0.98, 0.68, 0.025, 0, 0.34, 0.0125); b.plane(L(prayerRect()), 0.92, 0.62, 0, 0.34, 0.026); }), N, 36.6, { mount: 1.15 });
}

// ================================================================ 1F 走廊(黑白格地磚):動線磨耗 —— 白磚變灰、黑磚磨亮,對比下降的一帶(深色的 lane 在黑磚上看不出來)
const wornRect = () => decalRect('r8:worn', 96, 192, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.filter = 'blur(9px)';
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(118,108,92,0)'); g.addColorStop(0.5, 'rgba(116,106,90,0.62)'); g.addColorStop(1, 'rgba(118,108,92,0)');
  c.fillStyle = g; c.fillRect(6, 0, w - 12, h); c.filter = 'none';
  const r = rnd(17); for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(${r() < 0.5 ? '150,140,120' : '40,34,28'},${0.15 + r() * 0.25})`; c.lineWidth = 1 + r() * 1.5; const x = 20 + r() * (w - 40), y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 24); c.stroke(); }
});
function f1Corridor(R, zone) {
  const t = tpl('r8:wornt', (b) => b.plane(D(wornRect()), 1.5, 2.6, 0, 0, 0, { rx: -HALF }));
  for (const [c0, r0, c1, r1] of zone.rects) {
    const w = c1 - c0 + 1, h = r1 - r0 + 1;
    if (Math.min(w, h) > 2) continue;
    const alongX = w > h, cx = (c0 + c1 + 1), cz = (r0 + r1 + 1), len = (alongX ? w : h) * 2;
    for (let s = 1.6; s < len - 1.2; s += 2.3) {
      const x = alongX ? c0 * 2 + s : cx + (R.rng() - 0.5) * 0.2, z = alongX ? cz + (R.rng() - 0.5) * 0.2 : r0 * 2 + s;
      if (!R.isReach(x, z)) continue;
      R.put(t, x, z, (alongX ? HALF : 0) + (R.rng() - 0.5) * 0.08, { y: R.y + 0.0045 });
    }
  }
}

// ================================================================ 戶外:墓園(金爐 + 燒過的金紙、拜拜的水果和香)、遊戲場(封院期間暫停開放)
const jossBurner = () => tpl('r8:jinlu', (b) => {
  b.cyl('iron', 0.3, 0.75, 0, 0.375, 0, { r2: 0.26, seg: 14, open: true }); b.cyl('rust', 0.305, 0.12, 0, 0.7, 0, { r2: 0.265, seg: 14, open: true }); // 燻黑的鐵爐身、上緣生鏽
  b.cyl('iron', 0.3, 0.04, 0, 0.02, 0, { seg: 14 });
  b.cyl('iron', 0.12, 0.35, 0, 0.92, 0, { r2: 0.05, seg: 10 }); // 煙囪帽
  for (let i = 0; i < 3; i++) { const a = i * 2.1; b.rod('rust', 0.012, [Math.cos(a) * 0.24, 0.75, Math.sin(a) * 0.24], [Math.cos(a) * 0.1, 0.78, Math.sin(a) * 0.1], { seg: 4 }); }
  b.box('iron', 0.22, 0.16, 0.02, 0, 0.2, 0.29); // 爐口
  b.sph('plaster', 0.27, 0, 0.6, 0, { ws: 10, hs: 4, tl: HALF, sy: 0.25 }); // 爐裡的灰
  b.plane(glow('r8ember2', '#a8380c'), 0.16, 0.1, 0, 0.2, 0.302); b.plane(glow('r8ember', '#ff6a18'), 0.09, 0.03, 0.02, 0.15, 0.304); // 爐口裡還沒熄的金紙(才剛有人來燒過)
  b.meta.coll = Box([-0.32, 0, -0.32], [0.32, 1.1, 0.32]);
});
const offering = () => tpl('r8:offering', (b) => {
  b.cyl('pl_red', 0.17, 0.3, 0, 0.15, 0, { r2: 0.14, seg: 10, open: true }); b.cyl('pl_red', 0.14, 0.02, 0, 0.3, 0, { seg: 10 }); // 塑膠凳
  b.cyl('ceramic', 0.12, 0.03, 0, 0.32, 0, { r2: 0.15, seg: 12 }); // 盤子
  for (const [x, z, col] of [[-0.04, 0.03, 'pl_orange'], [0.05, -0.02, 'pl_orange'], [0.0, -0.06, 'pl_yellow'], [0.06, 0.06, 'pl_red']]) b.sph(col, 0.04, x, 0.37, z, { ws: 8, hs: 5 });
  b.cyl('pl_red', 0.05, 0.08, 0.3, 0.04, 0.05, { seg: 10 }); // 香爐(罐子)
  for (let i = 0; i < 3; i++) b.rod('wood_old', 0.003, [0.3 + (i - 1) * 0.01, 0.07, 0.05], [0.3 + (i - 1) * 0.03, 0.32, 0.05 + (i - 1) * 0.02], { seg: 3 });
});
const ashBits = () => tpl('r8:ashbits', (b) => { const r = rnd(41); for (let i = 0; i < 14; i++) b.box(r() < 0.5 ? 'paper' : 'cloth_black', 0.07 + r() * 0.05, 0.003, 0.05 + r() * 0.04, (r() - 0.5) * 1.2, 0.002, (r() - 0.5) * 0.9, { ry: r() * 3 }); });
function cemetery(R) {
  for (const [x, z] of [[9.6, 30.5], [9.4, 36.0], [8.6, 42.5], [6.0, 33.0]]) {
    if (!R.freeAt(x, z, 0.5)) continue;
    if (!R.tryPut(jossBurner(), x, z, 0.3, {})) continue;
    R.put(ashBits(), x - 0.2, z + 0.7, 0.4, {});
    floorDecal(R, 'soot', x - 0.1, z + 0.4, 1.4);
    if (R.freeAt(x - 1.0, z - 0.3, 0.25)) R.put(offering(), x - 1.0, z - 0.3, 0.8, {});
    break;
  }
}
const closedSign = () => labRect('r8:closed', 128, 96, (c, w, h) => {
  c.fillStyle = '#e8e2cc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b01414'; c.lineWidth = 4; c.strokeRect(3, 3, w - 6, h - 6);
  text(c, '暫停開放', w / 2, 26, { size: 22, color: '#b01414' });
  text(c, '封院期間 兒童遊戲場', w / 2, 54, { size: 11, color: '#111' }); text(c, '請勿進入  聖心醫院', w / 2, 72, { size: 11, color: '#111' });
  c.fillStyle = 'rgba(40,50,60,0.25)'; c.fillRect(0, h - 22, w, 22); // 雨水痕
  grime(c, w, h, 0.4);
});
const closedPost = () => tpl('r8:closedpost', (b) => {
  b.cyl('galv', 0.025, 1.6, 0, 0.8, 0, { seg: 8 }); b.cyl('concrete', 0.16, 0.12, 0, 0.06, 0, { seg: 10 });
  b.box('galv', 0.56, 0.42, 0.015, 0, 1.35, 0.03); b.plane(L(closedSign()), 0.54, 0.4, 0, 1.35, 0.039);
  for (const s of [-1, 1]) b.box('pl_yellow', 1.4, 0.06, 0.004, s * 0.7 + s * 0.02, 0.95 - Math.abs(s) * 0.05, 0.03, { rz: s * 0.12 }); // 封鎖膠帶(拉到兩邊,斷掉垂下)
  b.meta.coll = Box([-0.12, 0, -0.12], [0.12, 1.6, 0.12]);
});
function playground(R) {
  for (const [x, z] of [[105.4, 17.2], [106.2, 14.8], [105.6, 11.0]]) if (R.tryPut(closedPost(), x, z, HALF, {})) break;
  for (const [x, z] of [[110.5, 12.5], [113.0, 15.5]]) if (R.freeAt(x, z, 0.2)) { R.put(ctpl('shoe'), x, z, R.rng() * 6, {}); floorDecal(R, 'water', x + 0.3, z, 1.4); }
}

// ================================================================ 分派
const ROOMS = { b1_boiler: boilerRoom, b1_incinerator: incinerator, f1_cemetery: cemetery, f1_playground: playground };
export function scene8Room(ctx, zone) {
  const fn = ROOMS[zone.id];
  if (!fn) return;
  const R = new Room(ctx, zone);
  b1Prep(R);
  try { fn(R, zone); } catch (e) { console.warn('[props-in] 擺設失敗', zone.id, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e); }
  R.done();
}
// 地下室房間的大型機械是 basement.js 用 solid() 登記的:把它們的碰撞盒畫進規劃網格(不重疊、不擋路);
// 可放格不排除「被佔用」的 2m 格(細網格已經知道哪裡有東西)
function b1Prep(R) {
  const L2 = R.L, ctx = R.ctx, allowed = new Set(), plain = new Set();
  for (const key of R.cells) { const c = key % L2.W, r = (key / L2.W) | 0; if (!ctx.isPlain(R.li, c, r)) continue; plain.add(key); if (!ctx.nearDoor(R.li, c, r)) allowed.add(key); }
  R.allowed = allowed; R.plain = plain;
  const gx1 = R.gx0 + R.nx * 0.25, gz1 = R.gz0 + R.nz * 0.25;
  for (const bx of ctx.world?.boxes || []) {
    if (bx.maxY < R.y + 0.2 || bx.minY > R.y + 2.0 || bx.maxX < R.gx0 || bx.minX > gx1 || bx.maxZ < R.gz0 || bx.minZ > gz1) continue;
    for (let x = bx.minX + 0.05; x < bx.maxX; x += 0.2) for (let z = bx.minZ + 0.05; z < bx.maxZ; z += 0.2) { const k = R.idx(x, z); if (k >= 0 && !R.foot[k]) { R.foot[k] = 1; R._inflate(k, 1); } }
  }
  R.reach = R._bfs();
}

const INDOOR = { f3_monitor: monitorRoom, b1_laundry: laundry, f2_icu: icuWall, f1_cafeteria: cafeteria, f2_peds: peds, f3_corridor: f3Leaks,
  f2_playroom: (R) => leak(R, 82.6, 63.0), f2_nursery: (R) => leak(R, 27.4, 63.2, { k: 1 }), f1_rehab: rehab, f1_chapel: chapel, f1_corridor: f1Corridor };
export function scene8Indoor(R, zone) { INDOOR[zone.id]?.(R, zone); }
void bin;
