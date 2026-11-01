import { mkCanvas, prng, hashStr, FONT, HAND } from './paint.js';

// 標示/告示圖集(程式繪製,在貼圖 Worker 裡畫)。版面(每一格的位置)是確定的:主執行緒用 atlasData(L) 整理出可序列化的資料
// (樓層平面、區域、樓梯、標示內容),同一份資料傳給 Worker;兩邊用同一個 atlasLayout(data) 算格子 → UV 與畫面一致。
// 新地圖可用 registerSignage({ en, band, depts, notices, scrawls }) 加入自己的科別名稱、吊牌、告示與字跡。兩張 2048² 圖集:
//  signs  門牌(每個房間一塊)、科別吊牌(中英)、圖示(箭頭/樓梯/電梯/禁菸/輻射/生物危害…)
//  boards 避難逃生路線圖(依實際樓層平面畫,每座樓梯一張)、樓層介紹、紙本告示、手寫/噴漆字跡
export const ATLAS = 2048;
const OUT = new Set(['alley', 'playground', 'cemetery', 'yard', 'ambulance_bay', 'plaza', 'parking', 'courtyard', 'rooftop', 'fire_escape']);
export const EN = {
  xray: 'X-Ray', ct: 'CT Scan', pharmacy: 'Pharmacy', cafeteria: 'Staff Cafeteria', rehab: 'Rehabilitation', waiting: 'Outpatient', er: 'Emergency', chapel: 'Chapel',
  lobby: 'Main Lobby', shop: 'Store', security: 'Security', stairwell: 'Stairs', surgery: 'Operating Theatre', icu: 'Intensive Care', nursery: 'Nursery',
  delivery: 'Delivery Room', playroom: 'Playroom', peds_ward: 'Pediatrics', director: 'Director', office: 'Secretary', psych_cell: 'Seclusion Room',
  monitor: 'CCTV Room', dorm: 'Dormitory', morgue: 'Morgue', autopsy: 'Autopsy', archive: 'Medical Records', laundry: 'Laundry', supply: 'Central Supply',
  tunnel: 'Service Tunnel', boiler: 'Boiler Room', pump: 'Pump Room', dock: 'Loading Dock', incinerator: 'Incinerator', machine: 'Machine Room',
  ossuary: 'Crypt', ward: 'Ward', ramp: 'Ramp', stair_ext: 'Receiving',
};
// 門牌顏色帶(依科別)
const BAND = { er: '#b3261e', surgery: '#1f6f5c', icu: '#1f6f5c', delivery: '#b05878', nursery: '#c27a92', playroom: '#d08a2a', peds_ward: '#d08a2a', psych_cell: '#5b5f8a',
  morgue: '#3a3f44', autopsy: '#3a3f44', ward: '#2d7a58', xray: '#c49a1c', ct: '#c49a1c', pharmacy: '#2f6fa8', chapel: '#6a4a8a', director: '#6b4a2e', office: '#6b4a2e' };
const BLUE = '#1d4f8a';

// ---- 註冊(新地圖) ----
const REG = { en: {}, band: {}, depts: [], notices: [], scrawls: [] };
let regVer = 0;
export function registerSignage(o = {}) {
  Object.assign(REG.en, o.en || {}); Object.assign(REG.band, o.band || {});
  for (const k of ['depts', 'notices', 'scrawls']) if (o[k]) REG[k].push(...o[k]);
  regVer++;
}
// 主執行緒:把地圖整理成可序列化的資料(也是 Worker 收到的內容)
export function atlasData(L, id = 'hospital') {
  return {
    id: id + ':' + regVer, W: L.W, H: L.H,
    levels: L.levels.map((l) => ({ id: l.id, rows: l.rows })),
    zones: L.zones.map((z) => ({ id: z.id, name: z.name, theme: z.theme, level: z.level, levelIndex: z.levelIndex, rects: z.rects, mood: z.mood })),
    stairs: L.stairs.map((s) => ({ id: s.id, lower: s.lower, upper: s.upper, c0: s.c0, c1: s.c1, r0: s.r0, r1: s.r1, zone: s.zone })),
    reg: { en: { ...EN, ...REG.en }, band: { ...BAND, ...REG.band }, depts: [...DEPTS, ...REG.depts], notices: [...NOTICES, ...REG.notices], scrawls: [...SCRAWLS, ...REG.scrawls] },
  };
}
// 由資料重建繪圖需要的最小版面(charAt / zoneAt)
function miniLayout(d) {
  const grid = d.levels.map(() => new Int16Array(d.W * d.H).fill(-1));
  d.zones.forEach((z, zi) => { for (const [c0, r0, c1, r1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[z.levelIndex][r * d.W + c] = zi; });
  return {
    W: d.W, H: d.H, levels: d.levels, zones: d.zones, stairs: d.stairs,
    charAt: (li, c, r) => (li < 0 || li >= d.levels.length || c < 0 || r < 0 || c >= d.W || r >= d.H ? '#' : d.levels[li].rows[r][c]),
    zoneAt: (li, c, r) => { if (li < 0 || li >= d.levels.length || c < 0 || r < 0 || c >= d.W || r >= d.H) return null; const zi = grid[li][r * d.W + c]; return zi >= 0 ? d.zones[zi] : null; },
  };
}
// ---- 房號:各樓層依位置編號(2F 病房、3F 隔離房沿用名稱裡的號碼) ----
let layoutCache = null, layoutKey = null;
export function atlasLayout(data) {
  if (layoutCache && layoutKey === data.id) return layoutCache;
  const L = miniLayout(data), RG = data.reg;
  const zones = L.zones.filter((z) => !OUT.has(z.theme) && z.theme !== 'corridor' && z.theme !== 'shop');
  const num = new Map();
  const pre = (id) => String(id).replace(/F$/i, ''); // '1F' → '1'、'B1' → 'B1'
  for (const lv of L.levels) {
    const list = zones.filter((z) => z.level === lv.id).sort((a, b) => a.rects[0][1] - b.rects[0][1] || a.rects[0][0] - b.rects[0][0]);
    let k = lv.id === '2F' || lv.id === '3F' ? 11 : 1; // 201–210 是病房、301–307 是隔離房,其他房間從 x11 起
    for (const z of list) {
      const m = /(\d{3})$/.exec(z.name), cm = /隔離房 (\d)/.exec(z.name);
      if (m) num.set(z.id, m[1]);
      else if (cm) num.set(z.id, '30' + cm[1]);
      else num.set(z.id, pre(lv.id) + String(k++).padStart(2, '0'));
    }
  }
  const S = { plates: {}, depts: {}, picto: {}, boards: {}, notices: {}, scrawls: {} };
  // signs:門牌 256×96(8 欄)
  zones.forEach((z, i) => { S.plates[z.id] = { atlas: 'signs', x: (i % 8) * 256, y: Math.floor(i / 8) * 96, w: 256, h: 96, num: num.get(z.id), zone: z }; });
  // 科別吊牌 512×128(4 欄),從 y=864 開始
  RG.depts.slice(0, 32).forEach((d, i) => { S.depts[d.id] = { atlas: 'signs', x: (i % 4) * 512, y: 864 + Math.floor(i / 4) * 128, w: 512, h: 128, ...d }; });
  // 圖示 128×128(16 欄)
  PICTO.forEach((p, i) => { S.picto[p] = { atlas: 'signs', x: (i % 16) * 128, y: 1888 + Math.floor(i / 16) * 128, w: 128, h: 128 }; });
  // boards:避難圖 512×384(每層 2 張:西/東樓梯)
  L.levels.forEach((lv, li) => ['w', 'e'].forEach((s, k) => { const i = li * 2 + k; S.boards['evac_' + lv.id + '_' + s] = { atlas: 'boards', x: (i % 4) * 512, y: Math.floor(i / 4) * 384, w: 512, h: 384, li, side: s }; }));
  // 樓層介紹 384×512
  L.levels.forEach((lv, li) => { S.boards['dir_' + lv.id] = { atlas: 'boards', x: li * 384, y: 768, w: 384, h: 512, li }; });
  S.boards.dir_all = { atlas: 'boards', x: 1536, y: 768, w: 512, h: 512 };
  // 告示 256×352(8 欄)
  RG.notices.slice(0, 8).forEach((n, i) => { S.notices[n.id] = { atlas: 'boards', x: i * 256, y: 1280, w: 256, h: 352, ...n }; });
  // 字跡 512×104(4 欄 × 4 列)
  RG.scrawls.slice(0, 16).forEach((t, i) => { S.scrawls[i] = { atlas: 'boards', x: (i % 4) * 512, y: 1632 + Math.floor(i / 4) * 104, w: 512, h: 104, text: t.t, col: t.c, i }; });
  layoutCache = { L, S, num, zones, RG };
  layoutKey = data.id;
  return layoutCache;
}
// 科別吊牌(id = 指向的區域)
const DEPTS = [
  { id: 'f1_er', zh: '急診室', en: 'Emergency', bg: '#a3201a' }, { id: 'f1_xray', zh: '放射科 X光', en: 'Radiology · X-Ray' }, { id: 'f1_ct', zh: '電腦斷層', en: 'CT Scan' },
  { id: 'f1_pharmacy', zh: '藥局', en: 'Pharmacy' }, { id: 'f1_cafeteria', zh: '員工餐廳', en: 'Staff Cafeteria' }, { id: 'f1_rehab', zh: '復健科', en: 'Rehabilitation' },
  { id: 'f1_waiting', zh: '門診候診區', en: 'Outpatient Waiting' }, { id: 'f1_chapel', zh: '禮拜堂', en: 'Chapel', bg: '#4e3a6a' }, { id: 'f1_lobby', zh: '大廳 · 出口', en: 'Main Lobby · Exit' },
  { id: 'f1_security', zh: '保全室', en: 'Security' }, { id: 'f2_surgery', zh: '手術部', en: 'Surgery', bg: '#1f5f50' }, { id: 'f2_icu', zh: '加護病房', en: 'Intensive Care Unit', bg: '#1f5f50' },
  { id: 'f2_nursery', zh: '新生兒室', en: 'Nursery', bg: '#9a4e6a' }, { id: 'f2_delivery', zh: '產房', en: 'Delivery Room', bg: '#9a4e6a' }, { id: 'f2_playroom', zh: '小兒科遊戲室', en: 'Pediatric Playroom', bg: '#b0701e' },
  { id: 'f2_peds', zh: '小兒病房', en: 'Pediatric Ward', bg: '#b0701e' }, { id: 'wards', zh: '病房 201 – 210', en: 'Wards 201 – 210', bg: '#24684c' }, { id: 'f3_director', zh: '院長室', en: 'Director' },
  { id: 'f3_monitor', zh: '監控室', en: 'CCTV Room' }, { id: 'f3_dorm', zh: '修女宿舍', en: 'Sisters’ Dormitory' }, { id: 'cells', zh: '精神科隔離病房', en: 'Psychiatric Seclusion', bg: '#474a70' },
  { id: 'b1_morgue', zh: '太平間', en: 'Morgue', bg: '#2e3236' }, { id: 'b1_autopsy', zh: '解剖室', en: 'Autopsy', bg: '#2e3236' }, { id: 'b1_laundry', zh: '洗衣房', en: 'Laundry' },
  { id: 'b1_supply', zh: '中央供應室', en: 'Central Supply' }, { id: 'b1_archive', zh: '舊病歷庫', en: 'Medical Records' }, { id: 'b1_boiler', zh: '鍋爐 · 發電機房', en: 'Boiler · Generator' },
  { id: 'stairs', zh: '樓梯', en: 'Stairs' }, { id: 'b1_pump', zh: '水泵房', en: 'Pump Room' }, { id: 'b1_incinerator', zh: '焚化爐', en: 'Incinerator', bg: '#5a2e1e' },
];
const PICTO = ['arrow', 'arrow_up', 'stairs', 'lift', 'nosmoke', 'wet', 'radiation', 'biohazard', 'oxygen', 'extinguisher', 'toilet', 'aed', 'staff', 'noentry', 'cctv', 'handwash'];
// 告示(紙本,A4)
const NOTICES = [
  { id: 'quarantine' }, { id: 'evacuate' }, { id: 'power' }, { id: 'patient' }, { id: 'nolift' }, { id: 'infection' }, { id: 'note' }, { id: 'visiting' },
];
// 字跡:t 文字、c 顏色(紅漆 / 黑漆 / 血 / 粉筆)
const SCRAWLS = [
  { t: '救救我們', c: 'blood' }, { t: '他們聽得到', c: 'black' }, { t: '不要相信廣播', c: 'red' }, { t: '三樓不要上去', c: 'black' },
  { t: '他還在裡面', c: 'blood' }, { t: '我沒有瘋', c: 'chalk' }, { t: '出口被封了', c: 'red' }, { t: '地下室有人', c: 'black' },
  { t: '別開燈', c: 'blood' }, { t: '207 不要開門', c: 'red' }, { t: '媽媽 我好怕', c: 'chalk' }, { t: '誰在敲門', c: 'black' },
  { t: '快逃', c: 'red' }, { t: '還有人活著嗎？', c: 'black' }, { t: '隔離 禁止進入', c: 'red' }, { t: '數到十就好了', c: 'chalk' },
];

// ======================================================================
// 繪圖
// ======================================================================
const rr = (x, px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); };
function fitText(x, t, maxW, size, font, weight = 'bold') {
  let s = size;
  do { x.font = `${weight} ${s}px ${font}`; s -= 2; } while (x.measureText(t).width > maxW && s > 8);
}
function grime(x, R, px, py, w, h, k = 1) { // 歲月:泛黃、髒污、刮痕
  x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip();
  for (let i = 0; i < 6 * k; i++) { const gx = px + R() * w, gy = py + R() * h, r = 6 + R() * Math.min(w, h) * 0.5; const g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, `rgba(70,52,26,${0.06 + R() * 0.12 * k})`); g.addColorStop(1, 'rgba(70,52,26,0)'); x.fillStyle = g; x.fillRect(gx - r, gy - r, r * 2, r * 2); }
  x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1;
  for (let i = 0; i < 5 * k; i++) { const sx = px + R() * w, sy = py + R() * h; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (R() - 0.5) * 40, sy + (R() - 0.5) * 8); x.stroke(); }
  const g = x.createLinearGradient(px, py, px, py + h); g.addColorStop(0, 'rgba(40,30,10,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,20,5,0.18)');
  x.fillStyle = g; x.fillRect(px, py, w, h);
  x.restore();
}
function plate(x, s, R, RG) {
  const { x: px, y: py, w, h, num, zone } = s, band = RG.band[zone.theme] || BLUE, EN = RG.en;
  rr(x, px + 3, py + 3, w - 6, h - 6, 8); x.fillStyle = '#e9e6dc'; x.fill();
  x.fillStyle = band; rr(x, px + 3, py + 3, 74, h - 6, 8); x.fill(); x.fillRect(px + 60, py + 3, 17, h - 6);
  x.fillStyle = '#fff'; fitText(x, num, 66, 40, 'Arial, sans-serif'); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, px + 40, py + h / 2 + 1);
  const zh = zone.theme === 'ward' ? '病房' : zone.theme === 'psych_cell' ? '隔離房' : zone.name.replace(/\s*\d+$/, '').replace(/[((].*[))]/, '');
  x.textAlign = 'left'; x.fillStyle = '#1e2124'; fitText(x, zh, w - 100, 34, FONT); x.fillText(zh, px + 90, py + 38);
  x.fillStyle = '#4a4e52'; fitText(x, EN[zone.theme] || '', w - 100, 18, 'Arial, sans-serif', '600'); x.fillText(EN[zone.theme] || '', px + 90, py + 72);
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; rr(x, px + 3, py + 3, w - 6, h - 6, 8); x.stroke();
  grime(x, R, px + 3, py + 3, w - 6, h - 6, zone.mood === 'psych' ? 0.4 : 1);
}
function dept(x, s, R) {
  const { x: px, y: py, w, h } = s;
  x.fillStyle = s.bg || BLUE; rr(x, px + 2, py + 2, w - 4, h - 4, 6); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 3; rr(x, px + 8, py + 8, w - 16, h - 16, 4); x.stroke();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  fitText(x, s.zh, w - 60, 54, FONT); x.fillText(s.zh, px + w / 2, py + 50);
  x.fillStyle = 'rgba(255,255,255,0.85)'; fitText(x, s.en, w - 60, 24, 'Arial, sans-serif', '600'); x.fillText(s.en, px + w / 2, py + 96);
  grime(x, R, px + 2, py + 2, w - 4, h - 4, 0.8);
}
function picto(x, id, s) {
  const { x: px, y: py, w } = s, c = px + w / 2, m = py + w / 2;
  x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
  const circ = (col, slash) => { x.strokeStyle = col; x.lineWidth = 10; x.beginPath(); x.arc(c, m, 52, 0, 6.28); x.stroke(); if (slash) { x.beginPath(); x.moveTo(c - 36, m - 36); x.lineTo(c + 36, m + 36); x.stroke(); } };
  const tri = () => { x.fillStyle = '#e8b818'; x.beginPath(); x.moveTo(c, py + 10); x.lineTo(px + w - 8, py + w - 14); x.lineTo(px + 8, py + w - 14); x.closePath(); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 6; x.stroke(); };
  const sq = (col) => { x.fillStyle = col; rr(x, px + 6, py + 6, w - 12, w - 12, 10); x.fill(); };
  switch (id) {
    case 'arrow': x.fillStyle = '#fff'; x.beginPath(); x.moveTo(px + 14, m - 14); x.lineTo(px + 70, m - 14); x.lineTo(px + 70, m - 40); x.lineTo(px + 116, m); x.lineTo(px + 70, m + 40); x.lineTo(px + 70, m + 14); x.lineTo(px + 14, m + 14); x.fill(); break;
    case 'arrow_up': x.fillStyle = '#fff'; x.beginPath(); x.moveTo(c - 14, py + 114); x.lineTo(c - 14, py + 58); x.lineTo(c - 40, py + 58); x.lineTo(c, py + 12); x.lineTo(c + 40, py + 58); x.lineTo(c + 14, py + 58); x.lineTo(c + 14, py + 114); x.fill(); break;
    case 'stairs': sq('#1d4f8a'); x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.moveTo(px + 20, py + 104); for (let i = 0; i < 4; i++) { x.lineTo(px + 20 + i * 22, py + 104 - i * 22); x.lineTo(px + 42 + i * 22, py + 104 - i * 22); } x.stroke(); break;
    case 'lift': sq('#1d4f8a'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(c - 30, m - 6); x.lineTo(c - 12, m - 34); x.lineTo(c + 6, m - 6); x.fill(); x.beginPath(); x.moveTo(c - 30, m + 6); x.lineTo(c - 12, m + 34); x.lineTo(c + 6, m + 6); x.fill(); x.fillRect(c + 14, m - 36, 20, 72); break;
    case 'nosmoke': x.fillStyle = '#fff'; x.beginPath(); x.arc(c, m, 56, 0, 6.28); x.fill(); x.fillStyle = '#222'; x.fillRect(c - 40, m - 6, 62, 14); x.fillStyle = '#c33'; x.fillRect(c + 24, m - 6, 14, 14); circ('#c4231c', true); break;
    case 'wet': tri(); x.fillStyle = '#111'; x.beginPath(); x.arc(c, m - 4, 9, 0, 6.28); x.fill(); x.fillRect(c - 22, m + 14, 34, 9); x.font = 'bold 22px Arial'; x.textAlign = 'center'; x.fillText('!', c + 26, m + 6); break;
    case 'radiation': x.fillStyle = '#e8b818'; x.beginPath(); x.arc(c, m, 58, 0, 6.28); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(c, m, 10, 0, 6.28); x.fill();
      for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2.094; x.beginPath(); x.moveTo(c + Math.cos(a - 0.52) * 16, m + Math.sin(a - 0.52) * 16); x.arc(c, m, 48, a - 0.52, a + 0.52); x.arc(c, m, 16, a + 0.52, a - 0.52, true); x.fill(); } break;
    case 'biohazard': tri(); x.strokeStyle = '#111'; x.lineWidth = 6; for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2.094; x.beginPath(); x.arc(c + Math.cos(a) * 14, m + 10 + Math.sin(a) * 14, 15, 0, 6.28); x.stroke(); } break;
    case 'oxygen': sq('#e8e8e0'); x.fillStyle = '#1a6a3a'; x.font = 'bold 54px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('O₂', c, m - 8); x.font = 'bold 18px ' + FONT; x.fillStyle = '#b3261e'; x.fillText('嚴禁煙火', c, m + 38); break;
    case 'extinguisher': sq('#b3261e'); x.fillStyle = '#fff'; rr(x, c - 16, m - 24, 32, 64, 8); x.fill(); x.fillRect(c - 6, m - 40, 12, 18); x.fillRect(c + 4, m - 40, 26, 6); break;
    case 'toilet': sq('#1d4f8a'); x.fillStyle = '#fff'; x.beginPath(); x.arc(c - 26, m - 30, 10, 0, 6.28); x.arc(c + 26, m - 30, 10, 0, 6.28); x.fill(); x.fillRect(c - 36, m - 16, 20, 50); x.beginPath(); x.moveTo(c + 26, m - 18); x.lineTo(c + 44, m + 20); x.lineTo(c + 8, m + 20); x.fill(); x.fillRect(c - 2, m - 40, 4, 80); break;
    case 'aed': sq('#1a8a4a'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(c, m + 40); x.bezierCurveTo(c - 70, m - 10, c - 30, m - 60, c, m - 22); x.bezierCurveTo(c + 30, m - 60, c + 70, m - 10, c, m + 40); x.fill(); x.fillStyle = '#1a8a4a'; x.beginPath(); x.moveTo(c + 6, m - 26); x.lineTo(c - 12, m + 2); x.lineTo(c + 2, m + 2); x.lineTo(c - 6, m + 26); x.lineTo(c + 14, m - 6); x.lineTo(c, m - 6); x.fill(); break;
    case 'staff': sq('#e9e6dc'); x.fillStyle = '#1e2124'; x.font = 'bold 30px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('員工', c, m - 20); x.fillText('專用', c, m + 20); x.strokeStyle = '#b3261e'; x.lineWidth = 6; rr(x, px + 10, py + 10, w - 20, w - 20, 8); x.stroke(); break;
    case 'noentry': x.fillStyle = '#c4231c'; x.beginPath(); x.arc(c, m, 58, 0, 6.28); x.fill(); x.fillStyle = '#fff'; x.fillRect(c - 40, m - 11, 80, 22); break;
    case 'cctv': sq('#e8b818'); x.fillStyle = '#111'; x.save(); x.translate(c, m - 8); x.rotate(0.35); x.fillRect(-36, -14, 60, 28); x.fillRect(24, -6, 12, 12); x.restore(); x.fillRect(c - 30, m + 6, 8, 34); x.font = 'bold 18px ' + FONT; x.textAlign = 'center'; x.fillText('監視中', c + 12, m + 44); break;
    case 'handwash': sq('#2f7ab0'); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(c - 14, m + 10, 22, 30, -0.5, 0, 6.28); x.ellipse(c + 14, m + 10, 22, 30, 0.5, 0, 6.28); x.fill(); x.fillStyle = '#9fd0ff'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(c - 10 + k * 10, m - 38 + k * 6, 5, 0, 6.28); x.fill(); } break;
    default: break;
  }
  x.restore();
}
// 避難逃生路線圖:依該層平面(牆=深色、走廊淺綠、房間白、樓梯綠),從所在樓梯門口畫紅色箭頭到最近的出口/樓梯
function evac(x, s, R, L) {
  const { x: px, y: py, w, h, li, side } = s, lv = L.levels[li];
  x.fillStyle = '#f2efe4'; x.fillRect(px + 2, py + 2, w - 4, h - 4);
  x.fillStyle = '#1e5a34'; x.fillRect(px + 2, py + 2, w - 4, 40);
  x.fillStyle = '#fff'; x.textAlign = 'left'; x.textBaseline = 'middle'; fitText(x, `${lv.id} 避難逃生路線圖`, 300, 26, FONT); x.fillText(`${lv.id} 避難逃生路線圖`, px + 14, py + 22);
  x.font = '600 13px Arial'; x.textAlign = 'right'; x.fillText('EVACUATION ROUTE', px + w - 12, py + 24);
  const c0 = 7, r0 = 5, c1 = 52, r1 = 34, cs = Math.min((w - 24) / (c1 - c0 + 1), (h - 96) / (r1 - r0 + 1));
  const ox = px + (w - cs * (c1 - c0 + 1)) / 2, oy = py + 50;
  const X = (c) => ox + (c - c0) * cs, Y = (r) => oy + (r - r0) * cs;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const ch = lv.rows[r][c];
    let col = null;
    if (ch === '#' || ch === 'E') col = '#3a3a38';
    else if (ch === 'W') col = '#6a8aa0';
    else if (ch === '^' || ch === 'v' || ch === '<' || ch === '>' || ch === '%') col = '#2f9a52';
    else if (ch === '_' || ch === ',' || ch === '"' || ch === '|' || ch === 'o') col = null;
    else { const z = L.zoneAt(li, c, r); col = z?.theme === 'corridor' ? '#cfe6cf' : z?.theme === 'stairwell' ? '#9fd4ae' : '#ffffff'; }
    if (col) { x.fillStyle = col; x.fillRect(X(c), Y(r), cs + 0.5, cs + 0.5); }
  }
  // 起點:這座樓梯的門(西 = 左側樓梯區,東 = 右側)
  const st = L.stairs.filter((t) => (t.lower === li || t.upper === li) && t.zone && !/ext|ramp|morgue/.test(t.id || ''));
  const cand = st.length ? st : L.stairs;
  const pick = cand.reduce((a, t) => { const cx = (t.c0 + t.c1) / 2; return !a ? t : side === 'w' ? (cx < (a.c0 + a.c1) / 2 ? t : a) : (cx > (a.c0 + a.c1) / 2 ? t : a); }, null);
  const sx = pick ? (pick.c0 + pick.c1 + 1) / 2 : (side === 'w' ? 15 : 44), sy = pick ? (pick.r0 + pick.r1 + 1) / 2 : 19;
  // 紅色路線:沿走廊往兩端(示意)
  x.strokeStyle = '#d0221a'; x.fillStyle = '#d0221a'; x.lineWidth = Math.max(2, cs * 0.45); x.setLineDash([cs * 0.9, cs * 0.5]);
  const corr = side === 'w' ? [[sx, sy], [sx + 4, sy], [sx + 4, 12.5], [9.5, 12.5]] : [[sx, sy], [sx - 3, sy], [sx - 3, 26.5], [50.5, 26.5]];
  x.beginPath(); corr.forEach(([cx, cy], k) => (k ? x.lineTo(X(cx), Y(cy)) : x.moveTo(X(cx), Y(cy)))); x.stroke(); x.setLineDash([]);
  const [ax, ay] = corr[corr.length - 1], [bx, by] = corr[corr.length - 2], an = Math.atan2(ay - by, ax - bx);
  x.beginPath(); x.moveTo(X(ax) + Math.cos(an) * cs, Y(ay) + Math.sin(an) * cs); x.lineTo(X(ax) + Math.cos(an + 2.5) * cs, Y(ay) + Math.sin(an + 2.5) * cs); x.lineTo(X(ax) + Math.cos(an - 2.5) * cs, Y(ay) + Math.sin(an - 2.5) * cs); x.fill();
  // 您在這裡
  x.fillStyle = '#d0221a'; x.beginPath(); x.arc(X(sx), Y(sy), cs * 1.1, 0, 6.28); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(X(sx), Y(sy), cs * 0.45, 0, 6.28); x.fill();
  // 圖例
  x.textAlign = 'left'; x.fillStyle = '#1e2124'; x.font = `bold 15px ${FONT}`;
  const ly = py + h - 24;
  x.fillStyle = '#d0221a'; x.beginPath(); x.arc(px + 20, ly, 7, 0, 6.28); x.fill(); x.fillStyle = '#1e2124'; x.fillText('現在位置 You are here', px + 32, ly + 1);
  x.fillStyle = '#d0221a'; x.fillRect(px + 220, ly - 3, 30, 6); x.fillStyle = '#1e2124'; x.fillText('避難方向', px + 258, ly + 1);
  x.fillStyle = '#2f9a52'; x.fillRect(px + 350, ly - 8, 16, 16); x.fillStyle = '#1e2124'; x.fillText('安全梯', px + 372, ly + 1);
  x.strokeStyle = '#1e2124'; x.lineWidth = 3; x.strokeRect(px + 2, py + 2, w - 4, h - 4);
  grime(x, R, px + 2, py + 2, w - 4, h - 4, 1.2);
  if (R() < 0.6) { x.fillStyle = 'rgba(90,10,8,0.75)'; for (let k = 0; k < 3; k++) { const dx = px + 60 + R() * (w - 120), dy = py + 80 + R() * (h - 160); x.beginPath(); x.ellipse(dx, dy, 6 + R() * 10, 3 + R() * 5, R() * 3, 0, 6.28); x.fill(); } }
}
function directory(x, s, R, L, num) {
  const isOut = (t) => OUT.has(t);
  const { x: px, y: py, w, h } = s, all = s.li == null;
  x.fillStyle = '#1b2a3a'; x.fillRect(px + 2, py + 2, w - 4, h - 4);
  x.strokeStyle = '#b8a070'; x.lineWidth = 6; x.strokeRect(px + 5, py + 5, w - 10, h - 10);
  x.fillStyle = '#e8d8a8'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const title = all ? '樓層介紹 Floor Guide' : `${L.levels[s.li].id} 樓層介紹`;
  fitText(x, title, w - 40, 34, FONT); x.fillText(title, px + w / 2, py + 38);
  x.fillRect(px + 24, py + 64, w - 48, 2);
  x.textAlign = 'left';
  const lvls = all ? [3, 2, 1, 0] : [s.li];
  let yy = py + 92;
  for (const li of lvls) {
    const lv = L.levels[li];
    if (all) { x.fillStyle = '#c8a050'; x.font = `bold 26px Arial`; x.fillText(lv.id, px + 20, yy); }
    const items = L.zones.filter((z) => z.levelIndex === li && !isOut(z.theme) && z.theme !== 'corridor' && z.theme !== 'stairwell' && z.theme !== 'psych_cell' && (z.theme !== 'ward' || /201$/.test(z.name)));
    const lineH = all ? 20 : 34;
    for (const z of items) {
      if (yy > py + h - 30) break;
      const name = z.theme === 'ward' ? '病房 201–210' : z.name.replace(/[((].*[))]/, '');
      x.fillStyle = '#f0ead8'; x.font = `bold ${all ? 16 : 22}px ${FONT}`; x.fillText(name, px + (all ? 80 : 30), yy + (all ? 0 : 4));
      x.fillStyle = '#9aa8b4'; x.font = `600 ${all ? 12 : 15}px Arial`; x.textAlign = 'right'; x.fillText(num.get(z.id) || '', px + w - 24, yy + (all ? 0 : 4)); x.textAlign = 'left';
      yy += lineH;
    }
    if (all) { const cells = L.zones.some((z) => z.levelIndex === li && z.theme === 'psych_cell'); if (cells) { x.fillStyle = '#f0ead8'; x.font = `bold 16px ${FONT}`; x.fillText('精神科隔離病房', px + 80, yy); yy += 20; } yy += 12; }
  }
  if (!all && L.levels[s.li].id === '3F') { x.fillStyle = '#f0ead8'; x.font = `bold 22px ${FONT}`; x.fillText('精神科隔離病房 301–307', px + 30, yy + 4); }
  grime(x, R, px + 2, py + 2, w - 4, h - 4, 1);
  // 有人把某一層的字刮掉了
  if (!all && R() < 0.5) { x.strokeStyle = 'rgba(20,20,20,0.9)'; x.lineWidth = 5; for (let k = 0; k < 7; k++) { const sy = py + 110 + R() * (h - 180); x.beginPath(); x.moveTo(px + 26, sy); x.lineTo(px + w - 30, sy + (R() - 0.5) * 14); x.stroke(); } }
}
function notice(x, s, R) {
  const { x: px, y: py, w, h, id } = s;
  const paper = id === 'note' ? '#e8e2c8' : '#efece2';
  x.fillStyle = paper; x.fillRect(px + 4, py + 4, w - 8, h - 8);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1e2124';
  const T = (t, yy, size, col = '#1e2124', font = FONT, weight = 'bold') => { x.fillStyle = col; fitText(x, t, w - 40, size, font, weight); x.fillText(t, px + w / 2, py + yy); };
  const lines = (arr, y0, size = 14, gap = 20, col = '#2a2a2a') => { x.textAlign = 'left'; arr.forEach((t, k) => { x.fillStyle = col; x.font = `${size}px ${FONT}`; x.fillText(t, px + 22, py + y0 + k * gap); }); x.textAlign = 'center'; };
  switch (id) {
    case 'quarantine': {
      for (let k = 0; k < 12; k++) { x.fillStyle = k % 2 ? '#111' : '#e8b818'; x.beginPath(); x.moveTo(px + 4 + k * 24, py + 4); x.lineTo(px + 28 + k * 24, py + 4); x.lineTo(px + 4 + k * 24, py + 40); x.lineTo(px - 20 + k * 24, py + 40); x.fill(); }
      x.fillStyle = paper; x.fillRect(px + 4, py + 40, w - 8, 4);
      T('隔離區', 86, 56, '#b3261e'); T('禁止進入', 140, 40, '#b3261e'); T('QUARANTINE', 182, 24, '#1e2124', 'Arial');
      lines(['SARS 疑似病例收治區', '非經許可人員一律不得進入', '進出請穿戴全套防護', '有發燒症狀請立即通報 分機 3119'], 220);
      T('霧港市衛生局　聖心醫院感染管制室', 318, 13, '#555'); break;
    }
    case 'evacuate': T('公告', 46, 30, '#b3261e'); lines(['聖心醫院自 92 年 4 月 29 日', '中午十二時起封院十四日', '院內人員一律不得離開', '每日量測體溫二次', '物資由本局統一運補'], 92); T('霧港市衛生局', 300, 16, '#333'); break;
    case 'power': T('停電通知', 50, 34); lines(['七月初一半夜，配電盤跳掉了', '3 支保險絲燒壞', '備品在：洗衣房、鍋爐房、太平間冰櫃', '電梯不穩，請走樓梯'], 104); T('大新 維修組', 300, 16, '#333'); break;
    case 'patient': T('住院病患須知', 46, 26, '#1d4f8a'); lines(['一、晚上九點後熄燈就寢', '二、請勿擅自離開病房', '三、探病時間請遵守規定', '四、貴重物品請自行保管', '五、夜間聽到敲門聲', '　　請勿開門'], 92, 14, 22); break;
    case 'nolift': T('電梯停用', 70, 44, '#b3261e'); T('請勿搭乘', 130, 32); lines(['電梯故障 維修中', '不要按呼叫鈕', '它會自己停在這一層'], 186, 16, 26); break;
    case 'infection': T('感染管制', 48, 32, '#1a6a3a'); lines(['請全程配戴口罩', '進出病房請洗手', '咳嗽請遮掩口鼻', '有發燒症狀請告知', '醫護人員'], 100, 15, 26); break;
    case 'note': {
      x.strokeStyle = 'rgba(80,110,160,0.35)'; x.lineWidth = 1; for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(px + 8, py + 40 + k * 22); x.lineTo(px + w - 8, py + 40 + k * 22); x.stroke(); }
      x.textAlign = 'left'; x.fillStyle = '#20263a';
      ['如果你看到這張紙條', '不要相信廣播', '廣播說家人醒了', '叫大家去大廳', '招魂燈亮了就躲好', '燈熄了才出來', '我往裝卸平台走了', '— 夜班看護'].forEach((t, k) => { x.font = `${17 + (k % 2)}px ${HAND}`; x.save(); x.translate(px + 18, py + 36 + k * 33); x.rotate((R() - 0.5) * 0.05); x.fillText(t, 0, 0); x.restore(); });
      break;
    }
    case 'visiting': T('探病時間', 50, 32, '#1d4f8a'); lines(['上午 10:00 – 12:00', '下午 15:00 – 17:00', '晚上 19:00 – 20:30', '', '每床限兩位訪客', '兒童請勿進入病房'], 100, 16, 26); break;
    default: break;
  }
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2; x.strokeRect(px + 4, py + 4, w - 8, h - 8);
  grime(x, R, px + 4, py + 4, w - 8, h - 8, 1.4);
  // 膠帶
  x.fillStyle = 'rgba(230,220,180,0.7)'; x.fillRect(px + 10, py + 2, 40, 14); x.fillRect(px + w - 50, py + 2, 40, 14);
}
function scrawl(x, s, R) {
  const { x: px, y: py, w, h, text, col } = s;
  const C = { red: [150, 22, 16], blood: [96, 10, 8], black: [22, 20, 18], chalk: [215, 212, 200] }[col];
  x.save();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  fitText(x, text, w - 40, 76, HAND);
  // 噴漆/手指塗抹:多層抖動 + 往下流的滴痕
  for (let k = 0; k < 4; k++) { x.fillStyle = `rgba(${C[0]},${C[1]},${C[2]},${k ? 0.32 : 0.9})`; x.fillText(text, px + w / 2 + (R() - 0.5) * 4, py + h / 2 - 6 + (R() - 0.5) * 4); }
  if (col !== 'chalk') for (let k = 0; k < 9; k++) { const dx = px + 40 + R() * (w - 80), dy = py + h / 2 + 8; const len = 8 + R() * 30; const g = x.createLinearGradient(0, dy, 0, dy + len); g.addColorStop(0, `rgba(${C[0]},${C[1]},${C[2]},0.85)`); g.addColorStop(1, `rgba(${C[0]},${C[1]},${C[2]},0)`); x.fillStyle = g; x.fillRect(dx, dy, 2 + R() * 2.5, len); }
  x.restore();
}
// key = 'signs@<地圖>' | 'boards@<地圖>';data = atlasData(L)
export function paintAtlas(key, data) {
  const c = mkCanvas(ATLAS, ATLAS), x = c.getContext('2d');
  x.clearRect(0, 0, ATLAS, ATLAS);
  if (!data) return { c, hc: null, meta: { key, empty: true } };
  const { L, S, num, RG } = atlasLayout(data);
  const base = key.split('@')[0];
  const R = prng(hashStr('atlas:' + base));
  if (base === 'signs') {
    for (const s of Object.values(S.plates)) plate(x, s, R, RG);
    for (const s of Object.values(S.depts)) dept(x, s, R);
    for (const [id, s] of Object.entries(S.picto)) picto(x, id, s);
  } else if (base === 'boards') {
    for (const [id, s] of Object.entries(S.boards)) { if (id.startsWith('evac_')) evac(x, s, R, L); else directory(x, s, R, L, num); }
    for (const s of Object.values(S.notices)) notice(x, s, R);
    for (const s of Object.values(S.scrawls)) scrawl(x, s, R);
  }
  return { c, hc: null, meta: { key } };
}
