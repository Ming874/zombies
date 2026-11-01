import { labRect, glowRect, decalRect } from './atlas.js';
import { isStainKind, stainRect } from '../../../art/stainmat.js';
import { rnd, rr, reseed, css, blotches, grain, scratches, blob, text, scribbleLine, FONT } from './tex.js';

// 圖集內容(全部以畫布程式繪製,依 key 快取):標籤、告示、海報、螢幕畫面、X 光片、蠟筆畫、畫像、貼花。
// 回傳 UV 矩形,交給 geo.js 的 L()/G()/D() 使用。

const grime = (c, w, h, k = 1) => { blotches(c, 0, 0, w, h, Math.round(6 * k), 4, Math.max(8, h * 0.4), '40,32,20', 0.05, 0.22 * k); };
const edgeWear = (c, w, h) => { c.strokeStyle = 'rgba(30,24,16,0.35)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3); };

// ---------------------------------------------------------------- 標籤 / 告示
// 通用告示牌:bg 底色、fg 字色、可加副標與圖示
export function sign(text1, { w = 256, h = 80, bg = '#f0ece0', fg = '#1a1a1a', sub = null, border = null, icon = null, size = 0.5, k = 1, seed = 0 } = {}) {
  return labRect(`sign:${text1}:${sub}:${bg}:${w}x${h}:${seed}`, w, h, (c) => {
    reseed(seed * 977 + text1.length * 131 + w);
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    if (border) { c.strokeStyle = border; c.lineWidth = Math.max(3, h * 0.06); c.strokeRect(c.lineWidth, c.lineWidth, w - c.lineWidth * 2, h - c.lineWidth * 2); }
    let x0 = w / 2;
    if (icon) { icon(c, h * 0.5, h / 2, h * 0.36); x0 = w / 2 + h * 0.3; }
    text(c, text1, x0, sub ? h * 0.4 : h * 0.52, { size: h * size, color: fg, maxW: w * 0.86 - (icon ? h : 0) });
    if (sub) text(c, sub, x0, h * 0.78, { size: h * 0.2, color: fg, weight: 'normal', maxW: w * 0.86, alpha: 0.85 });
    grime(c, w, h, k);
    grain(c, 0, 0, w, h, 10);
  });
}
export const warnIcon = (c, x, y, r) => { // 黃色三角警告(放射線)
  c.fillStyle = '#e8c020'; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); c.fill();
  c.fillStyle = '#111';
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3; c.beginPath(); c.moveTo(x, y + r * 0.15); c.arc(x, y + r * 0.15, r * 0.48, a - 0.5, a + 0.5); c.closePath(); c.fill(); }
  c.fillStyle = '#e8c020'; c.beginPath(); c.arc(x, y + r * 0.15, r * 0.14, 0, 7); c.fill();
  c.fillStyle = '#111'; c.beginPath(); c.arc(x, y + r * 0.15, r * 0.09, 0, 7); c.fill();
};
export const bioIcon = (c, x, y, r) => {
  c.strokeStyle = '#111'; c.lineWidth = r * 0.16;
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, r * 0.42, 0, 7); c.stroke(); }
  c.beginPath(); c.arc(x, y, r * 0.2, 0, 7); c.stroke();
};
const crossIcon = (col) => (c, x, y, r) => { c.fillStyle = col; c.fillRect(x - r * 0.3, y - r, r * 0.6, r * 2); c.fillRect(x - r, y - r * 0.3, r * 2, r * 0.6); };
export { crossIcon };

// 藥盒正面(i 決定品名/配色)
const DRUGS = [
  ['Amoxicillin', '安莫西林 500mg', '#2a6aa8'], ['Paracetamol', '乙醯胺酚 500mg', '#c83a2a'], ['Morphine', '嗎啡 10mg/mL', '#6a2a8a'], ['Diazepam', '二氮平 5mg', '#2a8a5a'],
  ['Haloperidol', '鹵哌啶醇 5mg', '#8a6a2a'], ['Insulin', '胰島素 100IU', '#2a8a9a'], ['Heparin', '肝素 5000IU', '#9a2a4a'], ['Ketamine', '愷他命 50mg', '#3a3a8a'],
  ['Adrenaline', '腎上腺素 1mg', '#c86a1a'], ['Lorazepam', '樂耐平 2mg', '#4a6a2a'], ['Propofol', '異丙酚 1%', '#e0e0d8'], ['Atropine', '阿托品 0.5mg', '#7a1a1a'],
];
export function drugBox(i) {
  const [en, zh, col] = DRUGS[i % DRUGS.length];
  return labRect(`drug:${i % DRUGS.length}`, 160, 80, (c, w, h) => {
    reseed(i * 31 + 7);
    c.fillStyle = '#ecebe4'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, 0, w, h * 0.3); c.fillRect(0, h * 0.86, w, h * 0.14);
    text(c, en, 6, h * 0.16, { size: 15, color: '#fff', align: 'left', maxW: w - 12 });
    text(c, zh, 6, h * 0.48, { size: 14, color: '#222', align: 'left', maxW: w - 12 });
    text(c, 'Rx only  ' + (10 + i * 7) + ' tabs', 6, h * 0.72, { size: 10, color: '#444', align: 'left', weight: 'normal' });
    c.fillStyle = '#111'; for (let x = w - 40; x < w - 6; x += 2) if (rnd() < 0.6) c.fillRect(x, h * 0.36, 1, h * 0.4);
    grime(c, w, h, 0.8);
  });
}
// 藥瓶標籤(包住瓶身)
export function bottleLabel(i) {
  const [en, zh, col] = DRUGS[i % DRUGS.length];
  return labRect(`blab:${i % DRUGS.length}`, 128, 48, (c, w, h) => {
    c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, 0, w, 10);
    text(c, en, w / 2, 22, { size: 12, color: '#111', maxW: w - 8 });
    text(c, zh, w / 2, 37, { size: 10, color: '#333', weight: 'normal', maxW: w - 8 });
    grime(c, w, h, 0.6);
  });
}
// 書背 / 檔案夾背(一條,含多本)
export function spines(i, { w = 512, h = 96, palette = null } = {}) {
  i %= 6;
  return labRect(`spines:${i}:${w}:${palette ? 1 : 0}`, w, h, (c) => {
    reseed(i * 1013 + 5);
    const cols = palette || ['#6a2420', '#2a4060', '#3a5a2a', '#7a6a32', '#3a2a40', '#5a5650', '#8a3a1a', '#1e3a3a', '#4a4a6a', '#6a5a4a'];
    let x = 0;
    while (x < w) {
      const bw = rr(10, 26), top = rr(0, h * 0.25);
      c.fillStyle = cols[(rnd() * cols.length) | 0];
      c.fillRect(x, top, bw, h - top);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + bw - 1.5, top, 1.5, h - top);
      c.fillStyle = 'rgba(230,214,170,0.55)';
      c.fillRect(x + 2, top + (h - top) * 0.2, bw - 4, 2);
      c.fillRect(x + 2, top + (h - top) * 0.75, bw - 4, 2);
      if (rnd() < 0.5) { c.fillStyle = 'rgba(230,214,170,0.5)'; c.fillRect(x + bw * 0.35, top + (h - top) * 0.3, bw * 0.3, (h - top) * 0.35); }
      x += bw + rr(0, 1.5);
    }
    grime(c, w, h, 1);
  });
}
// 病歷/檔案夾(正面)
export function fileCover(i) {
  const cols = ['#c8a860', '#7a9ac0', '#c87a6a', '#8ab08a', '#d8c890'];
  return labRect(`file:${i % 5}`, 96, 128, (c, w, h) => {
    reseed(i * 17 + 3);
    c.fillStyle = cols[i % 5]; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4f0e0'; c.fillRect(10, 14, w - 20, 26);
    text(c, '病歷', w / 2, 22, { size: 11, color: '#222' });
    text(c, `No.${(rnd() * 900000 + 100000) | 0}`, w / 2, 33, { size: 8, color: '#333', weight: 'normal' });
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 6; k++) c.fillRect(w - 8, 50 + k * 10, 6, 6);
    grime(c, w, h, 1.2);
    if (i % 3 === 0) blotches(c, 0, 0, w, h, 2, 6, 16, '90,12,10', 0.4, 0.7);
  });
}
// 文件/表單(散落的紙)
export function form(i) {
  return labRect(`form:${i % 6}`, 96, 132, (c, w, h) => {
    reseed(i * 53 + 11);
    c.fillStyle = '#e6e2d4'; c.fillRect(0, 0, w, h);
    text(c, ['住院病歷', '護理紀錄', '醫囑單', '檢驗報告', '同意書', '交班紀錄'][i % 6], w / 2, 10, { size: 9, color: '#222' });
    c.fillStyle = 'rgba(40,40,60,0.5)';
    for (let y = 20; y < h - 8; y += 6) { const l = rr(0.3, 0.9) * (w - 16); c.fillRect(8, y, l, 1.4); }
    if (i % 2) { c.strokeStyle = 'rgba(40,40,60,0.4)'; c.strokeRect(8, 60, w - 16, 40); c.beginPath(); c.moveTo(8, 80); c.lineTo(w - 8, 80); c.stroke(); }
    if (i % 3 === 1) blotches(c, 0, 0, w, h, 3, 4, 14, '80,10,8', 0.5, 0.8);
    blotches(c, 0, 0, w, h, 4, 10, 40, '120,100,50', 0.06, 0.2);
  });
}
// 病床床尾病歷夾
export function bedChart(n) {
  return labRect(`chart:${n}`, 96, 128, (c, w, h) => {
    reseed(n * 7 + 1);
    c.fillStyle = '#e8e4d6'; c.fillRect(0, 0, w, h);
    text(c, `床號 ${n}`, w / 2, 12, { size: 12, color: '#111' });
    c.fillStyle = 'rgba(30,30,50,0.55)';
    for (let y = 26; y < h - 8; y += 8) c.fillRect(8, y, rr(0.3, 0.85) * (w - 16), 1.5);
    c.strokeStyle = 'rgba(160,20,20,0.8)'; c.lineWidth = 1.5; c.beginPath();
    for (let x = 8; x < w - 8; x += 4) c.lineTo(x, 80 + Math.sin(x * 0.3) * 6 + rr(-4, 4));
    c.stroke();
    blotches(c, 0, 0, w, h, 3, 10, 30, '120,100,50', 0.1, 0.25);
  });
}
// 腳趾牌
export function toeTag(i) {
  return labRect(`toe:${i}`, 64, 112, (c, w, h) => {
    reseed(i * 97 + 2);
    c.fillStyle = '#d8d0b0'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#222'; c.beginPath(); c.arc(w / 2, 10, 4, 0, 7); c.fill();
    text(c, '姓名', 8, 26, { size: 9, color: '#333', align: 'left', weight: 'normal' });
    text(c, ['無名氏', '陳○○', '林○○', '不詳'][i % 4], w / 2, 40, { size: 11, color: '#111' });
    text(c, `${1990 + (i % 9)}.10.${10 + i}`, w / 2, 60, { size: 9, color: '#222', weight: 'normal' });
    text(c, `#${1203 + i * 7}`, w / 2, 80, { size: 12, color: '#7a1010' });
    grime(c, w, h, 1.5);
  });
}
// 月曆(停在某一頁)
export function calendar() {
  return labRect('calendar', 128, 176, (c, w, h) => {
    reseed(404);
    c.fillStyle = '#ece8dc'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a1a1a'; c.fillRect(0, 0, w, 30);
    text(c, '2003  五月', w / 2, 16, { size: 15, color: '#f0e8d8' });
    for (let k = 0; k < 35; k++) {
      const x = 8 + (k % 7) * 16.5, y = 44 + ((k / 7) | 0) * 24;
      text(c, String((k % 31) + 1), x + 8, y + 6, { size: 10, color: k % 7 === 0 ? '#a01010' : '#222', weight: 'normal' });
      if (k < 25) { c.strokeStyle = 'rgba(160,20,20,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 2, y); c.lineTo(x + 14, y + 12); c.moveTo(x + 14, y); c.lineTo(x + 2, y + 12); c.stroke(); }
    }
    grime(c, w, h, 1.4);
  });
}

// 海報(衛教、院內宣導)
export function poster(kind) {
  return labRect(`poster:${kind}`, 192, 268, (c, w, h) => {
    reseed(kind.length * 1777);
    if (kind === 'handwash') {
      c.fillStyle = '#e8f0f0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2a7a9a'; c.fillRect(0, 0, w, 50);
      text(c, '洗手五時機', w / 2, 26, { size: 26, color: '#fff' });
      for (let k = 0; k < 5; k++) {
        const y = 66 + k * 38;
        c.fillStyle = '#2a7a9a'; c.beginPath(); c.arc(26, y + 10, 13, 0, 7); c.fill();
        text(c, String(k + 1), 26, y + 11, { size: 14, color: '#fff' });
        text(c, ['接觸病人前', '執行清潔/無菌技術前', '暴露病人體液風險後', '接觸病人後', '接觸病人周遭環境後'][k], 46, y + 11, { size: 14, color: '#123', align: 'left', maxW: w - 52 });
      }
    } else if (kind === 'quiet') {
      c.fillStyle = '#f0ece0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#a02a2a'; c.beginPath(); c.arc(w / 2, 100, 60, 0, 7); c.fill();
      c.fillStyle = '#f0ece0'; c.beginPath(); c.arc(w / 2, 100, 48, 0, 7); c.fill();
      text(c, '噓', w / 2, 102, { size: 54, color: '#a02a2a' });
      text(c, '請保持安靜', w / 2, 200, { size: 26, color: '#222' });
      text(c, '病人需要休息', w / 2, 232, { size: 16, color: '#444', weight: 'normal' });
    } else if (kind === 'blood') {
      c.fillStyle = '#f4ecec'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#b01e1e'; c.beginPath(); c.moveTo(w / 2, 30); c.bezierCurveTo(w / 2 + 70, 120, w / 2 + 50, 170, w / 2, 170); c.bezierCurveTo(w / 2 - 50, 170, w / 2 - 70, 120, w / 2, 30); c.fill();
      text(c, '捐血一袋', w / 2, 205, { size: 24, color: '#7a1010' });
      text(c, '救人一命', w / 2, 236, { size: 24, color: '#7a1010' });
    } else if (kind === 'jesus') { // 聖心像(禮拜堂)
      const g = c.createRadialGradient(w / 2, 100, 10, w / 2, 100, 150);
      g.addColorStop(0, '#c89a4a'); g.addColorStop(1, '#3a2010');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8d090'; c.globalAlpha = 0.5; c.beginPath(); c.arc(w / 2, 80, 46, 0, 7); c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#d8b08a'; c.beginPath(); c.ellipse(w / 2, 86, 24, 31, 0, 0, 7); c.fill();
      c.fillStyle = '#3a2416'; c.beginPath(); c.ellipse(w / 2, 70, 28, 22, 0, Math.PI, 0); c.fill(); c.fillRect(w / 2 - 28, 70, 10, 50); c.fillRect(w / 2 + 18, 70, 10, 50);
      c.fillStyle = '#7a1414'; c.beginPath(); c.moveTo(w / 2 - 60, h); c.lineTo(w / 2 - 40, 120); c.lineTo(w / 2 + 40, 120); c.lineTo(w / 2 + 60, h); c.fill();
      c.fillStyle = '#e8e0d0'; c.fillRect(w / 2 - 22, 120, 44, 148);
      c.fillStyle = '#c01818'; c.beginPath(); c.arc(w / 2, 160, 10, 0, 7); c.fill();
      c.fillStyle = '#f0c040'; c.fillRect(w / 2 - 2, 140, 4, 12);
      // 眼睛被刮掉
      c.fillStyle = '#100806'; c.fillRect(w / 2 - 16, 80, 12, 6); c.fillRect(w / 2 + 4, 80, 12, 6);
    } else if (kind === 'mary') {
      c.fillStyle = '#1e2a4a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#c8a040'; c.globalAlpha = 0.6; c.beginPath(); c.arc(w / 2, 82, 44, 0, 7); c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#2a4a8a'; c.beginPath(); c.moveTo(w / 2, 50); c.lineTo(w / 2 + 70, h); c.lineTo(w / 2 - 70, h); c.fill();
      c.fillStyle = '#d8b898'; c.beginPath(); c.ellipse(w / 2, 90, 20, 26, 0, 0, 7); c.fill();
      c.fillStyle = '#e8e4dc'; c.beginPath(); c.ellipse(w / 2, 78, 26, 18, 0, Math.PI, 0); c.fill();
      c.strokeStyle = '#4a0808'; c.lineWidth = 2; // 血淚
      c.beginPath(); c.moveTo(w / 2 - 8, 92); c.lineTo(w / 2 - 9, 130); c.moveTo(w / 2 + 8, 92); c.lineTo(w / 2 + 9, 124); c.stroke();
    } else if (kind === 'kids') {
      c.fillStyle = '#f8f0c8'; c.fillRect(0, 0, w, h);
      for (let k = 0; k < 7; k++) { c.fillStyle = ['#e85a4a', '#4a9ae8', '#5ac85a', '#e8c84a', '#c85ae8'][k % 5]; c.beginPath(); c.arc(rr(20, w - 20), rr(30, 120), rr(12, 22), 0, 7); c.fill(); }
      text(c, '勇敢的小朋友', w / 2, 170, { size: 22, color: '#c84a3a' });
      text(c, '打針不哭哭', w / 2, 206, { size: 20, color: '#4a7ac8' });
    } else if (kind === 'eye') { // 視力表
      c.fillStyle = '#f4f2ea'; c.fillRect(0, 0, w, h);
      let y = 22;
      [40, 30, 22, 16, 12, 9, 7, 5].forEach((s, k) => {
        const n = k + 1;
        for (let j = 0; j < n; j++) { const x = w / 2 + (j - (n - 1) / 2) * s * 1.6; const d = ((k * 3 + j) % 4); c.save(); c.translate(x, y); c.rotate((d * Math.PI) / 2); c.fillStyle = '#111'; c.fillRect(-s / 2, -s / 2, s, s / 5); c.fillRect(-s / 2, -s / 2, s / 5, s); c.fillRect(-s / 2, s / 2 - s / 5, s, s / 5); c.restore(); }
        y += s * 1.5 + 6;
      });
    } else { // missing person / 告示
      c.fillStyle = '#e8e4d8'; c.fillRect(0, 0, w, h);
      text(c, '尋人啟事', w / 2, 28, { size: 26, color: '#111' });
      c.fillStyle = '#6a6660'; c.fillRect(w / 2 - 40, 50, 80, 100);
      c.fillStyle = '#3a3630'; c.beginPath(); c.ellipse(w / 2, 90, 22, 28, 0, 0, 7); c.fill();
      c.fillStyle = '#100c0a'; c.fillRect(w / 2 - 14, 84, 10, 4); c.fillRect(w / 2 + 4, 84, 10, 4);
      text(c, '最後出現：七月初一 一樓大廳', w / 2, 170, { size: 14, color: '#222' });
      text(c, '請勿單獨前往 B1', w / 2, 196, { size: 14, color: '#7a1010' });
    }
    grime(c, w, h, 1.6);
    edgeWear(c, w, h);
    grain(c, 0, 0, w, h, 14);
  });
}

// 小朋友蠟筆畫(最後一張畫得令人不安)
export function drawing(i) {
  return labRect(`draw:${i}`, 160, 116, (c, w, h) => {
    reseed(i * 4241 + 9);
    c.fillStyle = '#f2eee2'; c.fillRect(0, 0, w, h);
    const col = () => ['#d83a2a', '#2a6ad8', '#2a9a3a', '#e8b82a', '#8a3ac8', '#222'][(rnd() * 6) | 0];
    if (i % 5 === 4) { // 黑色塗滿的人形 + 紅色眼睛
      for (let k = 0; k < 40; k++) scribbleLine(c, [[rr(10, w - 10), rr(10, h - 10)], [rr(10, w - 10), rr(10, h - 10)]], 3, '#151515', 3);
      c.fillStyle = '#c81a1a'; c.beginPath(); c.arc(w * 0.45, h * 0.35, 4, 0, 7); c.arc(w * 0.55, h * 0.35, 4, 0, 7); c.fill();
      text(c, '他在床底下', w / 2, h - 12, { size: 14, color: '#c81a1a', font: 'cursive' });
    } else {
      scribbleLine(c, [[0, h * 0.82], [w, h * 0.8]], 4, '#2a9a3a', 2); // 草地
      c.strokeStyle = '#e8b82a'; c.lineWidth = 3; c.beginPath(); c.arc(w - 26, 22, 12, 0, 7); c.stroke(); // 太陽
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28; scribbleLine(c, [[w - 26 + Math.cos(a) * 15, 22 + Math.sin(a) * 15], [w - 26 + Math.cos(a) * 22, 22 + Math.sin(a) * 22]], 2, '#e8b82a', 1); }
      const n = 2 + (i % 3);
      for (let k = 0; k < n; k++) { // 火柴人家庭
        const x = 26 + k * ((w - 60) / n), s = k === n - 1 ? 0.7 : 1, cc = col();
        c.strokeStyle = cc; c.lineWidth = 2.5; c.beginPath(); c.arc(x, h * 0.36 + (1 - s) * 20, 9 * s, 0, 7); c.stroke();
        scribbleLine(c, [[x, h * 0.45 + (1 - s) * 20], [x, h * 0.66]], 2.5, cc, 1);
        scribbleLine(c, [[x - 10 * s, h * 0.52], [x + 10 * s, h * 0.52]], 2.5, cc, 1);
        scribbleLine(c, [[x, h * 0.66], [x - 7, h * 0.78]], 2.5, cc, 1);
        scribbleLine(c, [[x, h * 0.66], [x + 7, h * 0.78]], 2.5, cc, 1);
      }
      if (i % 5 === 2) scribbleLine(c, [[w - 40, h * 0.3], [w - 40, h * 0.76]], 7, '#151515', 2); // 旁邊多了一個黑色的高個子
      text(c, ['我的家', '媽媽', '醫院', '我和護士姐姐', ''][i % 5], w / 2, h - 8, { size: 11, color: col(), font: 'cursive' });
    }
    grain(c, 0, 0, w, h, 18);
  });
}

// 院長畫像(油畫風、眼睛被挖掉)
export function portrait() {
  return labRect('portrait', 192, 256, (c, w, h) => {
    reseed(31337);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2016'); g.addColorStop(1, '#120c08');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1a1612'; c.beginPath(); c.moveTo(20, h); c.quadraticCurveTo(w / 2, 120, w - 20, h); c.fill(); // 西裝
    c.fillStyle = '#e8e4dc'; c.beginPath(); c.moveTo(w / 2 - 14, 168); c.lineTo(w / 2, 220); c.lineTo(w / 2 + 14, 168); c.fill();
    c.fillStyle = '#5a1a1a'; c.fillRect(w / 2 - 4, 172, 8, 40);
    c.fillStyle = '#b08a6a'; c.beginPath(); c.ellipse(w / 2, 110, 38, 50, 0, 0, 7); c.fill();
    c.fillStyle = '#d0d0c8'; c.beginPath(); c.ellipse(w / 2, 72, 40, 22, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#0a0806'; c.beginPath(); c.ellipse(w / 2 - 14, 104, 8, 5, 0, 0, 7); c.ellipse(w / 2 + 14, 104, 8, 5, 0, 0, 7); c.fill();
    scratches(c, 0, 0, w, h, 60, '#d8c8a8', 30);
    c.fillStyle = '#6a5030'; c.fillRect(w / 2 - 40, h - 26, 80, 16);
    text(c, '院長 1962-1998', w / 2, h - 18, { size: 9, color: '#e0d0a0', weight: 'normal' });
    for (let k = 0; k < 2000; k++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,200' : '0,0,0'},0.05)`; c.fillRect(rnd() * w, rnd() * h, 2, 2); } // 龜裂
  });
}

// 指示牌 / 樓層牌
export function floorPlate(id) {
  return labRect(`floor:${id}`, 160, 160, (c, w, h) => {
    reseed(id.charCodeAt(0) * 3);
    c.fillStyle = '#1e2a26'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8d4c4'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12);
    text(c, id, w / 2, h * 0.45, { size: 70, color: '#e8e4d4', font: 'Arial, sans-serif' });
    text(c, { B1: '地下一樓', '1F': '一樓', '2F': '二樓', '3F': '三樓' }[id] || '', w / 2, h * 0.8, { size: 20, color: '#c8c4b4' });
    grime(c, w, h, 2);
  });
}
export function directory() {
  return labRect('directory', 256, 360, (c, w, h) => {
    reseed(808);
    c.fillStyle = '#1a2a3a'; c.fillRect(0, 0, w, h);
    text(c, '樓層指引', w / 2, 26, { size: 24, color: '#f0e8d0' });
    text(c, 'FLOOR GUIDE', w / 2, 50, { size: 12, color: '#a8b8c8', weight: 'normal' });
    const rows = [['3F', '院長室 · 精神科 · 修女宿舍'], ['2F', '病房 201-210 · 手術部 · 加護病房'], ['', '新生兒室 · 產房 · 小兒科'], ['1F', '大廳 · 急診 · 藥局 · 放射科'], ['', '禮拜堂 · 餐廳 · 復健室'], ['B1', '太平間 · 解剖室 · 病歷庫'], ['', '洗衣房 · 供應室']];
    rows.forEach(([f, t], k) => {
      const y = 86 + k * 38;
      if (f) { c.fillStyle = '#c8a040'; c.fillRect(14, y - 14, 40, 28); text(c, f, 34, y, { size: 16, color: '#1a2a3a' }); }
      text(c, t, 64, y, { size: 14, color: '#e8e4d8', align: 'left', maxW: w - 74 });
    });
    c.fillStyle = 'rgba(10,10,10,0.8)'; c.fillRect(64, 86 + 5 * 38 - 12, 150, 24); // B1 被塗黑
    text(c, '不要下去', 140, 86 + 5 * 38 + 1, { size: 15, color: '#a01818', font: 'cursive' });
    grime(c, w, h, 2);
  });
}

// 白板 / 公佈欄
export function whiteboard(kind = 'er') {
  return labRect(`wb:${kind}`, 320, 192, (c, w, h) => {
    reseed(kind.length * 99);
    c.fillStyle = '#e8eae4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30,60,140,0.7)'; c.lineWidth = 1.2;
    if (kind === 'er') {
      text(c, '急診 床位', 60, 18, { size: 16, color: '#1a3a8a' });
      for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(10, 36 + k * 24); c.lineTo(w - 10, 36 + k * 24); c.stroke(); text(c, `${k + 1}  ${['發燒 39.8 隔離', '咬傷 ??', '咬傷 左臂', '意識不清 攻擊性', '—', '咬傷'][k]}`, 16, 48 + k * 24, { size: 13, color: '#1a3a8a', align: 'left', weight: 'normal' }); }
      text(c, '不要讓他們出去！！', w - 80, h - 16, { size: 16, color: '#b01818' });
    } else {
      text(c, '本週值班', 60, 18, { size: 16, color: '#1a3a8a' });
      for (let k = 0; k < 5; k++) text(c, ['一 林', '二 陳', '三 —', '四 —', '五 —'][k], 20, 44 + k * 26, { size: 14, color: '#1a3a8a', align: 'left', weight: 'normal' });
    }
    blotches(c, 0, 0, w, h, 6, 20, 60, '60,60,70', 0.08, 0.2);
    if (kind === 'er') { c.fillStyle = 'rgba(110,10,8,0.8)'; c.beginPath(); c.ellipse(w * 0.7, h * 0.45, 22, 30, 0.4, 0, 7); c.fill(); }
  });
}
// 菜單看板
export function menuBoard() {
  return labRect('menu', 320, 180, (c, w, h) => {
    reseed(5150);
    c.fillStyle = '#1c2420'; c.fillRect(0, 0, w, h);
    text(c, '今日菜單', w / 2, 22, { size: 20, color: '#f0e8c8' });
    ['滷肉飯 ........ 35', '排骨便當 ...... 80', '青菜湯 ........ 20', '稀飯(病人餐) .. 15', '豆漿 .......... 15'].forEach((t, k) => text(c, t, 24, 52 + k * 24, { size: 14, color: '#e8e4d0', align: 'left', weight: 'normal', font: 'monospace' }));
    c.strokeStyle = 'rgba(230,220,200,0.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(20, 150); c.lineTo(w - 20, 160); c.stroke();
    grime(c, w, h, 1.5);
  });
}

// ---------------------------------------------------------------- 自發光(螢幕)
// 生理監視器:心電圖 + 血氧 + 呼吸;flat 時為直線(停止)
export function monitorScreen(kind = 'ecg') {
  return glowRect(`mon:${kind}`, 192, 144, (c, w, h) => {
    reseed(kind.length * 313);
    c.fillStyle = '#020604'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(40,80,60,0.35)'; c.lineWidth = 1;
    for (let x = 0; x < w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    const flat = kind === 'flat';
    const trace = (y0, col, fn) => { c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); for (let x = 4; x < w - 52; x++) { const yy = y0 + fn(x); if (x === 4) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke(); };
    trace(34, '#40ff70', (x) => (flat ? 0 : (x % 46 > 20 && x % 46 < 24 ? -22 : x % 46 > 24 && x % 46 < 27 ? 10 : Math.sin(x * 0.3) * 1.2)));
    trace(76, '#40d8ff', (x) => (flat ? 0 : -Math.max(0, Math.sin(x * 0.14)) * 12));
    trace(112, '#ffe040', (x) => (flat ? 0 : Math.sin(x * 0.05) * 8));
    text(c, flat ? '0' : String(118), w - 26, 30, { size: 22, color: '#40ff70' });
    text(c, flat ? '--' : '84', w - 26, 74, { size: 20, color: '#40d8ff' });
    text(c, flat ? '--' : '28', w - 26, 112, { size: 18, color: '#ffe040' });
    if (flat) { c.fillStyle = '#ff2a1a'; c.fillRect(w / 2 - 50, 2, 100, 16); text(c, 'ASYSTOLE', w / 2, 10, { size: 12, color: '#fff' }); }
  });
}
// 監控畫面(灰階、噪點;idx 決定場景;某一格有人影)
export function cctv(idx) {
  return glowRect(`cctv:${idx}`, 192, 144, (c, w, h) => {
    reseed(idx * 1171 + 17);
    const sh = (v) => `rgb(${v},${v * 1.02},${v * 0.96})`;
    c.fillStyle = sh(18); c.fillRect(0, 0, w, h);
    // 走廊透視
    const vx = w * rr(0.4, 0.6), vy = h * 0.42;
    c.fillStyle = sh(40); c.beginPath(); c.moveTo(0, h); c.lineTo(vx - 14, vy + 12); c.lineTo(vx + 14, vy + 12); c.lineTo(w, h); c.fill(); // 地板
    c.fillStyle = sh(28); c.beginPath(); c.moveTo(0, 0); c.lineTo(vx - 14, vy - 12); c.lineTo(vx - 14, vy + 12); c.lineTo(0, h); c.fill();
    c.fillStyle = sh(32); c.beginPath(); c.moveTo(w, 0); c.lineTo(vx + 14, vy - 12); c.lineTo(vx + 14, vy + 12); c.lineTo(w, h); c.fill();
    c.fillStyle = sh(60); for (let k = 1; k < 5; k++) { const t = k / 5; c.fillRect(vx - 6 + (0 - vx) * (1 - t) * 0.2, vy - 12 - (vy) * (1 - t) * 0.9, 12 + (1 - t) * 30, 3); } // 燈
    for (let k = 0; k < 4; k++) { const t = (k + 1) / 5, x = vx - 14 - (vx - 14) * (1 - t); c.fillStyle = sh(14); c.fillRect(x - 3, vy - 12 + (1 - t) * -20, 6 * (1.2 - t), 26 * (1.4 - t)); } // 門
    if (idx % 4 === 1) { // 人影(站在走廊盡頭)
      c.fillStyle = sh(6); c.beginPath(); c.ellipse(vx, vy - 4, 3, 4, 0, 0, 7); c.fill(); c.fillRect(vx - 3, vy, 6, 14);
    }
    if (idx % 4 === 3) { c.fillStyle = sh(8); c.fillRect(w * 0.2, h * 0.6, 40, 30); } // 地上的東西
    const img = c.getImageData(0, 0, w, h), d = img.data; // 雜訊 + 掃描線
    for (let i = 0; i < d.length; i += 4) { const y = (i / 4 / w) | 0, n = (rnd() - 0.5) * 40 - (y % 3 === 0 ? 10 : 0); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
    text(c, `CAM ${String(idx + 1).padStart(2, '0')}`, 8, 10, { size: 10, color: '#e8e8e8', align: 'left', font: 'monospace' });
    text(c, `10-31-99 03:${String(13 + idx).padStart(2, '0')}`, w - 6, h - 8, { size: 9, color: '#e8e8e8', align: 'right', font: 'monospace', weight: 'normal' });
    c.fillStyle = '#ff2a1a'; c.beginPath(); c.arc(w - 12, 10, 3, 0, 7); c.fill();
  });
}
// X 光片(燈箱上)
export function xrayFilm(kind) {
  return glowRect(`xr:${kind}`, 160, 196, (c, w, h) => {
    reseed(kind.length * 271);
    c.fillStyle = '#9ab0b8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0e1418'; c.fillRect(6, 6, w - 12, h - 12);
    c.save(); c.globalCompositeOperation = 'lighter';
    const bone = (a) => `rgba(170,190,200,${a})`;
    if (kind === 'chest') {
      c.fillStyle = bone(0.5); c.fillRect(w / 2 - 5, 20, 10, h - 40); // 脊椎
      for (let k = 0; k < 9; k++) for (const s of [-1, 1]) { c.strokeStyle = bone(0.55 - k * 0.03); c.lineWidth = 5; c.beginPath(); c.ellipse(w / 2 + s * 8, 40 + k * 15, 50, 16, 0, s > 0 ? -1.6 : Math.PI + 1.6, s > 0 ? 0.3 : Math.PI - 0.3, s < 0); c.stroke(); }
      c.fillStyle = bone(0.25); c.beginPath(); c.ellipse(w / 2 + 14, 120, 26, 30, 0, 0, 7); c.fill(); // 心影
      c.fillStyle = 'rgba(220,230,240,0.6)'; c.beginPath(); c.ellipse(w / 2 - 34, 96, 10, 14, 0.3, 0, 7); c.fill(); // 不明陰影
    } else if (kind === 'skull') {
      c.strokeStyle = bone(0.6); c.lineWidth = 8; c.beginPath(); c.ellipse(w / 2, 86, 54, 62, 0, 0, 7); c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.9)'; c.beginPath(); c.ellipse(w / 2 - 20, 96, 14, 12, 0, 0, 7); c.ellipse(w / 2 + 20, 96, 14, 12, 0, 0, 7); c.fill();
      c.fillStyle = bone(0.4); c.fillRect(w / 2 - 34, 140, 68, 12);
      for (let k = 0; k < 8; k++) c.fillRect(w / 2 - 30 + k * 8, 152, 6, 10);
      c.fillStyle = 'rgba(230,240,250,0.8)'; c.fillRect(w / 2 + 6, 40, 4, 30); // 頭骨裡的金屬釘
    } else { // hand
      c.fillStyle = bone(0.5);
      for (let k = 0; k < 5; k++) { const a = -0.5 + k * 0.25, x0 = w / 2 + Math.sin(a) * 20, y0 = 130; for (let j = 0; j < 3; j++) { c.save(); c.translate(x0 + Math.sin(a) * j * 24, y0 - 30 - j * 24); c.rotate(a); c.fillRect(-3, -10, 6, 20); c.restore(); } }
      c.fillRect(w / 2 - 22, 130, 44, 40);
      c.fillStyle = bone(0.7); c.fillRect(w / 2 + 30, 60, 7, 18); // 多一根指頭
    }
    c.restore();
    for (let k = 0; k < 600; k++) { c.fillStyle = `rgba(200,220,230,${rnd() * 0.08})`; c.fillRect(rnd() * w, rnd() * h, 2, 2); }
    text(c, `HOSP. SH ${kind.toUpperCase()}`, 14, 16, { size: 8, color: '#c8d8e0', align: 'left', font: 'monospace', weight: 'normal' });
  });
}
export function lightPanel() { return glowRect('lightpanel', 32, 32, (c, w, h) => { c.fillStyle = '#d8e8ec'; c.fillRect(0, 0, w, h); }); }
// 叫號燈箱
export function queueDisplay(num = '023') {
  return glowRect(`queue:${num}`, 256, 96, (c, w, h) => {
    c.fillStyle = '#080202'; c.fillRect(0, 0, w, h);
    text(c, '請', 26, h / 2, { size: 26, color: '#ff3020' });
    for (let k = 0; k < 3; k++) { // 七段顯示器風格的點陣
      c.fillStyle = '#2a0806'; c.fillRect(56 + k * 44, 12, 38, 72);
    }
    text(c, num, 56 + 66, h / 2 + 2, { size: 70, color: '#ff2a14', font: '"Courier New", monospace' });
    text(c, '號', w - 26, h / 2, { size: 26, color: '#ff3020' });
  });
}
// 電腦螢幕(DOS)
export function dosScreen(kind = 'his') {
  return glowRect(`dos:${kind}`, 192, 144, (c, w, h) => {
    reseed(kind.length * 61);
    c.fillStyle = kind === 'blue' ? '#0a1a8a' : '#020402'; c.fillRect(0, 0, w, h);
    const col = kind === 'blue' ? '#e8e8f8' : '#40d860';
    const lines = kind === 'blue' ? ['*** STOP: 0x0000007B', '', 'INACCESSIBLE_BOOT_DEVICE', '', 'PATIENT RECORD 207', 'STATUS: ????????', '', 'DO NOT RESTART'] : ['大新　病歷電腦', '病患查詢 >> 207', '姓名：無名氏', '入院：1999/09/24', '狀態：鎖住', '', '', 'C:\\>_'];
    lines.forEach((t, k) => text(c, t, 8, 12 + k * 16, { size: 12, color: col, align: 'left', font: 'monospace', weight: 'normal' }));
    for (let y = 0; y < h; y += 2) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, w, 1); }
  });
}
export function ctConsole() {
  return glowRect('ctcon', 192, 144, (c, w, h) => {
    reseed(77);
    c.fillStyle = '#04080c'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) { // 斷層影像
      const x = 8 + (k % 2) * 92, y = 8 + ((k / 2) | 0) * 66;
      c.fillStyle = '#000'; c.fillRect(x, y, 84, 60);
      c.fillStyle = 'rgba(180,190,200,0.8)'; c.beginPath(); c.ellipse(x + 42, y + 30, 30 - k * 2, 24, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(90,100,110,0.9)'; c.beginPath(); c.ellipse(x + 42, y + 30, 26 - k * 2, 20, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(30,30,34,1)'; c.beginPath(); c.ellipse(x + 34, y + 28, 7, 9, 0, 0, 7); c.ellipse(x + 50, y + 28, 7, 9, 0, 0, 7); c.fill();
      if (k === 3) { c.fillStyle = 'rgba(240,250,255,0.9)'; c.beginPath(); c.arc(x + 42, y + 40, 5, 0, 7); c.fill(); }
    }
  });
}
// 鍵盤鍵帽(俯視)
export function keyboardTex() {
  return labRect('kbdtex', 192, 72, (c, w, h) => {
    reseed(55);
    c.fillStyle = '#9a9070'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) {
      const x = 4 + k * 12.4, y = 4 + r * 13.4, kw = (r === 4 && k > 3 && k < 11) ? 0 : 10.5;
      if (!kw) continue;
      c.fillStyle = '#5a5444'; c.fillRect(x + 0.6, y + 0.8, kw, 11.4);
      c.fillStyle = (k + r) % 7 === 0 ? '#b8ae8c' : '#d8d0b0'; c.fillRect(x, y, kw, 11);
    }
    c.fillStyle = '#d8d0b0'; c.fillRect(4 + 4 * 12.4, 4 + 4 * 13.4, 6.4 * 12.4, 11); // 空白鍵
    blotches(c, 0, 0, w, h, 4, 4, 20, '40,30,20', 0.1, 0.3);
  });
}
// 時鐘面(停住的指針)
export function clockFace(seed = 0) {
  return labRect(`clockface:${seed % 2}`, 128, 128, (c, w, h) => {
    reseed(seed * 7 + 99);
    c.fillStyle = '#e4e0d4'; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2);
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; c.fillStyle = '#151515'; c.save(); c.rotate(a); c.fillRect(-(i % 5 ? 0.6 : 1.6), -60, i % 5 ? 1.2 : 3.2, i % 5 ? 4 : 9); c.restore(); }
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; text(c, String(i), Math.sin(a) * 44, -Math.cos(a) * 44 + 1, { size: 12, color: '#151515', font: 'Arial, sans-serif' }); }
    const hh = seed % 2 ? 3.2 : 0.4, mm = seed % 2 ? 2.9 : 5.6;
    const hand = (a, l, wd, col) => { c.save(); c.rotate(a); c.fillStyle = col; c.fillRect(-wd / 2, -l, wd, l + 8); c.restore(); };
    hand(hh, 30, 4, '#151515'); hand(mm, 46, 2.6, '#151515'); hand(4.5, 50, 1, '#b01010');
    c.fillStyle = '#151515'; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill();
    c.restore();
    blotches(c, 0, 0, w, h, 5, 10, 40, '90,70,40', 0.08, 0.25);
  });
}
// 純色色票(標籤圖集內):小雜物用,整個物件只用一個材質(一個 InstancedMesh)
export function sw(color) { return labRect(`swatch:${color}`, 8, 8, (c, w, h) => { c.fillStyle = color; c.fillRect(0, 0, w, h); }); }
// 純色發光色票(LED、燈泡、火焰)
export function glowSwatch(name, color) { return glowRect(`sw:${name}`, 16, 16, (c, w, h) => { c.fillStyle = color; c.fillRect(0, 0, w, h); }); }
export function flameGrad() {
  return glowRect('flame', 32, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#3050ff'); g.addColorStop(0.12, '#ffe8b0'); g.addColorStop(0.5, '#ffb040'); g.addColorStop(1, '#a03000');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}
export function vcrClock() {
  return glowRect('vcr', 96, 32, (c, w, h) => { c.fillStyle = '#020a06'; c.fillRect(0, 0, w, h); text(c, '12:00', w / 2, h / 2 + 1, { size: 22, color: '#30ff90', font: '"Courier New", monospace' }); });
}

// ---------------------------------------------------------------- 貼花(透明)
const RED = (a, k = 1) => `rgba(${(62 + rnd() * 26) * k},${(4 + rnd() * 6) * k},${(3 + rnd() * 5) * k},${a})`;
// 平滑不規則斑塊(貝茲曲線,不會有多邊形折角)
function softBlob(c, x, y, r, k = 10, squash = 1, jag = 0.35) {
  const pts = [];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2, d = r * (1 - jag + rnd() * jag * 2); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * squash]); }
  c.beginPath();
  for (let i = 0; i < k; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % k], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    if (i === 0) c.moveTo((pts[k - 1][0] + p0[0]) / 2, (pts[k - 1][1] + p0[1]) / 2);
    c.quadraticCurveTo(p0[0], p0[1], mx, my);
  }
  c.closePath();
}
function drops(c, n, x0, y0, w, h, rmin, rmax, a = 0.85) {
  for (let k = 0; k < n; k++) { c.fillStyle = RED(a); c.beginPath(); c.arc(x0 + rnd() * w, y0 + rnd() * h, rr(rmin, rmax), 0, 7); c.fill(); }
}
// 血跡類(手印、抓痕、血泊、垂流、噴濺、抹痕、拖痕、腳印)改用共用的寫實血跡圖集(src/art/stains*.js,
// 有法線與粗糙度;floor = 地面版);其餘(水漬、黴、鏽、煙燻、嘔吐物…)維持這裡的 pi_decal 圖集
export function decal(kind, v = 0, floor = false) {
  if (isStainKind(kind)) return stainRect(kind, v, floor);
  const S = { pool: [256, 256], splat: [128, 128], drip: [96, 256], smear: [128, 256], hand: [96, 128], feet: [128, 256], stain: [192, 192], scratch: [128, 160], burn: [128, 128], mold: [128, 128], drag: [128, 256], dirt: [192, 192], rust: [64, 192], vomit: [128, 128], water: [192, 192], soot: [128, 192], scuff: [192, 192], grime: [128, 160], kick: [256, 64], lane: [128, 256], mud: [128, 256], rub: [256, 48] }[kind] || [128, 128];
  const [w, h] = S;
  return decalRect(`dec:${kind}:${v}`, w, h, (c) => {
    reseed(kind.length * 991 + v * 13 + 7);
    c.clearRect(0, 0, w, h);
    if (kind === 'pool') {
      c.filter = 'blur(1.5px)';
      for (let k = 0; k < 4; k++) { c.fillStyle = RED(0.7, 0.9); softBlob(c, w / 2 + rr(-30, 30), h / 2 + rr(-30, 30), rr(40, 70), 12, rr(0.7, 1)); c.fill(); }
      c.filter = 'none';
      c.fillStyle = 'rgba(28,2,2,0.55)'; softBlob(c, w / 2 + rr(-8, 8), h / 2 + rr(-8, 8), 38, 10, 0.85); c.fill(); // 中央凝結較暗
      c.strokeStyle = 'rgba(40,4,3,0.5)'; c.lineWidth = 2.5; softBlob(c, w / 2, h / 2, 74, 14, 0.9, 0.2); c.stroke(); // 乾掉的邊緣
      drops(c, 22, 6, 6, w - 12, h - 12, 1.5, 5);
      c.fillStyle = 'rgba(255,230,220,0.12)'; c.beginPath(); c.ellipse(w * 0.42, h * 0.42, 18, 8, -0.6, 0, 7); c.fill(); // 濕亮反光
    } else if (kind === 'splat') {
      c.fillStyle = RED(0.85); softBlob(c, w / 2, h / 2, 22, 10, 1, 0.45); c.fill();
      for (let k = 0; k < 30; k++) { const a = rnd() * 6.28, d = rr(18, 58), s = rr(1.5, 5); c.fillStyle = RED(0.8); c.beginPath(); c.ellipse(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, s * 1.8, s, a, 0, 7); c.fill(); }
      for (let k = 0; k < 8; k++) { const a = rnd() * 6.28; c.strokeStyle = RED(0.6); c.lineWidth = rr(1, 3); c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * 14, h / 2 + Math.sin(a) * 14); c.lineTo(w / 2 + Math.cos(a) * rr(30, 60), h / 2 + Math.sin(a) * rr(30, 60)); c.stroke(); }
    } else if (kind === 'drip') {
      c.fillStyle = RED(0.8); softBlob(c, w / 2, 26, 24, 10, 0.6); c.fill();
      for (let k = 0; k < 7; k++) {
        const x = w / 2 + rr(-26, 26), l = rr(50, h - 34), wd = rr(1.5, 4.5);
        const g = c.createLinearGradient(0, 20, 0, 20 + l);
        g.addColorStop(0, RED(0.85)); g.addColorStop(1, RED(0.55));
        c.fillStyle = g; c.beginPath(); c.moveTo(x - wd / 2, 20); c.lineTo(x + wd / 2, 20); c.lineTo(x + wd * 0.35, 20 + l); c.lineTo(x - wd * 0.35, 20 + l); c.fill();
        c.fillStyle = RED(0.85); c.beginPath(); c.ellipse(x, 20 + l, wd * 0.8, wd * 1.2, 0, 0, 7); c.fill();
      }
    } else if (kind === 'smear' || kind === 'drag') {
      // 刷痕:沿曲線的多條細紋(像被拖過),起點濃、尾端淡
      const n = kind === 'drag' ? 46 : 26, wid = kind === 'drag' ? 70 : 40;
      const x0 = w / 2 + rr(-10, 10), bend = rr(-25, 25);
      for (let k = 0; k < n; k++) {
        const o = (k / (n - 1) - 0.5) * wid + rr(-2, 2), a = rr(0.25, 0.7), lw = rr(1, 3.5), end = rr(0.55, 0.98);
        const g = c.createLinearGradient(0, 10, 0, h * end);
        g.addColorStop(0, RED(a)); g.addColorStop(0.6, RED(a * 0.7)); g.addColorStop(1, RED(0));
        c.strokeStyle = g; c.lineWidth = lw; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x0 + o, 12 + rr(0, 10)); c.bezierCurveTo(x0 + o + bend * 0.5, h * 0.3, x0 + o + bend, h * 0.6, x0 + o * (0.7 + rnd() * 0.3) + bend * 0.8, h * end); c.stroke();
      }
      c.fillStyle = RED(0.75); softBlob(c, x0, 22, wid * 0.42, 10, 0.5); c.fill();
      if (kind === 'drag') for (let k = 0; k < 4; k++) { c.fillStyle = RED(0.7); c.beginPath(); c.ellipse(x0 - 26 + k * 17, 14, 4, 9, 0, 0, 7); c.fill(); } // 指痕
      drops(c, 10, 0, h * 0.2, w, h * 0.7, 1, 3, 0.6);
    } else if (kind === 'hand') {
      c.fillStyle = RED(0.8);
      c.beginPath(); c.ellipse(w / 2, h * 0.68, 22, 26, 0, 0, 7); c.fill();
      for (let k = 0; k < 4; k++) { c.save(); c.translate(w / 2 - 17 + k * 11.5, h * 0.44); c.rotate((k - 1.5) * 0.12); c.beginPath(); c.ellipse(0, -14, 5, 16 - Math.abs(k - 1.5) * 2, 0, 0, 7); c.fill(); c.restore(); }
      c.save(); c.translate(w / 2 + 25, h * 0.64); c.rotate(0.9); c.beginPath(); c.ellipse(0, -10, 6, 13, 0, 0, 7); c.fill(); c.restore();
      for (let k = 0; k < 4; k++) { const x = w / 2 - 14 + k * 9; c.fillStyle = RED(0.7); c.fillRect(x, h * 0.8, 2.5, rr(10, 26)); } // 往下流
      c.globalCompositeOperation = 'destination-out'; // 掌紋空隙
      for (let k = 0; k < 12; k++) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(w / 2 + rr(-16, 16), h * 0.68 + rr(-18, 18), rr(1, 3), 0, 7); c.fill(); }
      c.globalCompositeOperation = 'source-over';
    } else if (kind === 'feet') {
      for (let k = 0; k < 6; k++) { const x = w / 2 + (k % 2 ? 15 : -15), y = h - 22 - k * 40, a = 0.6 - k * 0.08; c.fillStyle = RED(a); c.beginPath(); c.ellipse(x, y, 10, 16, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(x, y - 24, 8.5, 9, 0, 0, 7); c.fill(); }
    } else if (kind === 'stain' || kind === 'dirt' || kind === 'water') {
      const col = kind === 'stain' ? [96, 74, 36] : kind === 'water' ? [52, 46, 36] : [26, 22, 18];
      c.filter = 'blur(6px)';
      for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(${col},${rr(0.08, kind === 'dirt' ? 0.35 : 0.2)})`; softBlob(c, w / 2 + rr(-30, 30), h / 2 + rr(-30, 30), rr(30, 70), 12, rr(0.6, 1)); c.fill(); }
      c.filter = 'blur(1px)';
      if (kind !== 'dirt') { c.strokeStyle = `rgba(${col},0.45)`; c.lineWidth = 2; softBlob(c, w / 2, h / 2, 76, 16, 0.85, 0.18); c.stroke(); c.lineWidth = 1.2; softBlob(c, w / 2 + 6, h / 2 - 4, 60, 14, 0.8, 0.2); c.stroke(); }
      c.filter = 'none';
      if (kind === 'dirt') for (let k = 0; k < 40; k++) { c.fillStyle = `rgba(${col},${rr(0.2, 0.5)})`; c.fillRect(rr(20, w - 20), rr(20, h - 20), rr(1, 3), rr(1, 3)); }
    } else if (kind === 'scratch') {
      for (let k = 0; k < 4; k++) { c.strokeStyle = `rgba(${k % 2 ? '60,10,8' : '40,30,20'},0.75)`; c.lineWidth = 2.5; c.beginPath(); const x = 30 + k * 18 + rr(-4, 4); c.moveTo(x, 10); c.quadraticCurveTo(x + rr(-10, 10), h / 2, x + rr(-6, 6) - 10, h - 10); c.stroke(); }
      for (let k = 0; k < 4; k++) { c.strokeStyle = 'rgba(60,8,6,0.6)'; c.lineWidth = 2; c.beginPath(); const x = 60 + k * 14; c.moveTo(x, 40); c.lineTo(x - 12, h - 30); c.stroke(); }
      for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(70,8,6,0.8)'; c.beginPath(); c.ellipse(30 + k * 18, 12, 3, 5, 0, 0, 7); c.fill(); } // 指甲斷在牆上
    } else if (kind === 'burn' || kind === 'soot') {
      c.filter = 'blur(4px)';
      const g = c.createRadialGradient(w / 2, kind === 'soot' ? h * 0.85 : h / 2, 4, w / 2, kind === 'soot' ? h * 0.6 : h / 2, kind === 'soot' ? h * 0.7 : w / 2);
      g.addColorStop(0, 'rgba(6,4,2,0.9)'); g.addColorStop(0.6, 'rgba(20,14,8,0.45)'); g.addColorStop(1, 'rgba(20,14,8,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.filter = 'none';
    } else if (kind === 'mold') {
      c.filter = 'blur(1px)';
      for (let k = 0; k < 220; k++) { const d = Math.pow(rnd(), 1.5) * 55, a = rnd() * 6.28; c.fillStyle = `rgba(${rr(18, 40)},${rr(30, 50)},${rr(18, 30)},${rr(0.2, 0.6)})`; c.beginPath(); c.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, rr(1, 5), 0, 7); c.fill(); }
      c.filter = 'none';
    } else if (kind === 'rust') {
      c.filter = 'blur(1.5px)';
      for (let k = 0; k < 6; k++) { const x = w / 2 + rr(-20, 20), l = rr(h * 0.35, h); const g = c.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(110,50,20,0.7)'); g.addColorStop(1, 'rgba(110,50,20,0)'); c.fillStyle = g; c.fillRect(x, 0, rr(3, 10), l); }
      c.filter = 'none';
    } else if (kind === 'scuff') {
      // [scene6] 鞋跟/腳輪的黑色橡膠刮痕:短弧線、深淺不一(走廊轉角、門口)
      for (let k = 0; k < 34; k++) {
        const x = rr(16, w - 16), y = rr(16, h - 16), l = rr(8, 46), a = rr(0, 6.28), bend = rr(-0.5, 0.5);
        c.strokeStyle = `rgba(${rr(8, 26)},${rr(8, 22)},${rr(8, 20)},${rr(0.18, 0.6)})`; c.lineWidth = rr(1, 3.2); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
      c.filter = 'blur(5px)'; c.fillStyle = 'rgba(30,26,20,0.12)'; softBlob(c, w / 2, h / 2, 70, 12, 0.8); c.fill(); c.filter = 'none';
    } else if (kind === 'grime') {
      // [scene6] 門邊的手垢:手推門的位置一團灰褐色油污 + 幾道指痕(下緣往下淡)
      c.filter = 'blur(7px)';
      for (let k = 0; k < 5; k++) { c.fillStyle = `rgba(${rr(40, 60)},${rr(34, 48)},${rr(26, 36)},${rr(0.12, 0.26)})`; softBlob(c, w / 2 + rr(-12, 12), h * 0.45 + rr(-20, 20), rr(22, 40), 10, rr(1.1, 1.6)); c.fill(); }
      c.filter = 'blur(1.5px)';
      for (let k = 0; k < 9; k++) { c.fillStyle = `rgba(40,32,24,${rr(0.15, 0.32)})`; c.beginPath(); c.ellipse(w / 2 + rr(-26, 26), h * 0.4 + rr(-30, 30), rr(3, 6), rr(7, 14), rr(-0.4, 0.4), 0, 7); c.fill(); }
      c.filter = 'none';
    } else if (kind === 'kick' || kind === 'rub') {
      // [scene6] 踢痕帶(門腳、牆腳)/ 推床撞痕(牆面 0.7~0.9m 的橫向擦痕)
      c.filter = 'blur(2px)';
      for (let k = 0; k < (kind === 'kick' ? 26 : 18); k++) {
        const y = kind === 'kick' ? h - rr(4, h * 0.85) : h / 2 + rr(-h * 0.3, h * 0.3), x = rr(0, w * 0.7), l = rr(20, w * 0.5);
        c.strokeStyle = `rgba(${rr(14, 34)},${rr(12, 28)},${rr(10, 24)},${rr(0.12, 0.42)})`; c.lineWidth = rr(1.5, kind === 'kick' ? 6 : 4); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + rr(-4, 4)); c.stroke();
      }
      c.filter = 'blur(6px)'; const g = c.createLinearGradient(0, kind === 'kick' ? h : h / 2 + 12, 0, kind === 'kick' ? 0 : h / 2 - 12);
      g.addColorStop(0, 'rgba(30,26,20,0.28)'); g.addColorStop(1, 'rgba(30,26,20,0)'); c.fillStyle = g; c.fillRect(6, 6, w - 12, h - 12); c.filter = 'none';
    } else if (kind === 'lane') {
      // [scene6] 走廊中央的動線磨耗:推床/輪椅的兩道輪痕 + 中間被鞋底磨得較暗的一帶(邊緣柔和)
      c.filter = 'blur(10px)';
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(26,22,16,0)'); g.addColorStop(0.5, 'rgba(26,22,16,0.36)'); g.addColorStop(1, 'rgba(26,22,16,0)'); // [scene7] 0.2 → 0.36:原本在 SSR 反光下看不出來
      c.fillStyle = g; c.fillRect(8, 10, w - 16, h - 20); c.filter = 'blur(1.2px)';
      for (const x0 of [w * 0.33, w * 0.67]) for (let k = 0; k < 3; k++) { c.strokeStyle = `rgba(14,12,10,${rr(0.16, 0.34)})`; c.lineWidth = rr(2, 4); c.beginPath(); const x = x0 + rr(-5, 5); c.moveTo(x, 0); c.bezierCurveTo(x + rr(-6, 6), h * 0.33, x + rr(-6, 6), h * 0.66, x + rr(-5, 5), h); c.stroke(); }
      for (let k = 0; k < 16; k++) { c.strokeStyle = `rgba(12,10,8,${rr(0.1, 0.35)})`; c.lineWidth = rr(1, 2.4); const x = rr(20, w - 20), y = rr(10, h - 10); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rr(-10, 10), y + rr(-14, 14)); c.stroke(); }
      c.filter = 'none';
    } else if (kind === 'mud') {
      // [scene6] 雨夜從外面踩進來的泥鞋印(交錯、越往裡越淡)
      for (let k = 0; k < 6; k++) {
        const x = w / 2 + (k % 2 ? 16 : -16), y = h - 24 - k * 40, a = 0.5 - k * 0.07;
        c.fillStyle = `rgba(60,46,30,${a})`; c.beginPath(); c.ellipse(x, y - 10, 11, 17, k % 2 ? 0.08 : -0.08, 0, 7); c.fill();
        c.beginPath(); c.ellipse(x, y + 14, 9, 8, 0, 0, 7); c.fill();
        c.globalCompositeOperation = 'destination-out'; c.fillStyle = 'rgba(0,0,0,0.5)';
        for (let j = 0; j < 5; j++) c.fillRect(x - 9, y - 22 + j * 6, 18, 2); // 鞋底紋
        c.globalCompositeOperation = 'source-over';
      }
    } else if (kind === 'vomit') {
      c.fillStyle = 'rgba(120,110,40,0.7)'; softBlob(c, w / 2, h / 2, 40, 12, 0.7); c.fill();
      for (let k = 0; k < 20; k++) { c.fillStyle = `rgba(${rr(90, 140)},${rr(80, 120)},30,0.8)`; c.beginPath(); c.arc(rr(20, w - 20), rr(30, h - 30), rr(2, 5), 0, 7); c.fill(); }
    }
  });
}
export { FONT, css };
