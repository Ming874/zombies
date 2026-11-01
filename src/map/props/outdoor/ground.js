import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { pbrTex } from '../../hospital/pbr.js';
import { makeWet } from '../../weather.js';
import { Parts, M, box, cyl, extrude, keepUV, pool, solid, V3, HALF, TAU, lerp, clamp } from './kit.js';
import { canvas, tex, fbm, pixels, lazy, text, wear, softBlob, splat, BLOOD, R, rr, cl, ss, FONT_TC } from './mats.js';

// 地面寫實:路面標線(可平鋪帶狀貼圖 po_strip)、數字/文字標記(po_mark)、垃圾雜物(po_litter)、
// 人孔蓋/排水溝(po_manhole,含法線)、緣石(混凝土 PBR)、柏油裂縫填縫、落葉堆、泥土過渡帶、車輪擋。
// 所有幾何都放進 Parts(依材質合併),由呼叫端 put() 一次放置。

// ---------- 帶狀貼圖 po_strip(1024×1024,8 條 128px 帶,沿 u 平鋪)----------
export const BAND = { white: 0, yellow: 1, red: 2, tar: 3, mud: 4, grime: 5, tire: 6, leaves: 7 };
const SB = 128;
const STRIP_TEX = lazy(() => {
  const W = 1024, Hh = 1024;
  const [c, ctx] = canvas(W, Hh);
  const img = ctx.createImageData(W, Hh), d = img.data;
  const n1 = fbm(W, SB, 24, 3, 4), n2 = fbm(W, SB, 96, 12, 2), n3 = fbm(W, SB, 8, 1, 3);
  const put = (band, fn) => {
    const o = [0, 0, 0, 0];
    for (let y = 0; y < SB; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, v = 1 - y / (SB - 1);
      o[0] = o[1] = o[2] = 0; o[3] = 0;
      fn(x, v, i, o);
      const k = ((band * SB + y) * W + x) * 4;
      d[k] = cl(o[0]) * 255; d[k + 1] = cl(o[1]) * 255; d[k + 2] = cl(o[2]) * 255; d[k + 3] = cl(o[3]) * 255;
    }
  };
  // 油漆線(白/黃/紅):邊緣不齊、磨損剝落、髒污、細裂
  const paint = (band, col) => put(band, (x, v, i, o) => {
    const edge = ss(0.04, 0.12 + n2[i] * 0.06, v) * ss(0.04, 0.12 + n2[(i + 517) % n2.length] * 0.06, 1 - v);
    const worn = 1 - ss(0.58, 0.7, n1[i] * 0.8 + n2[i] * 0.2);
    const crack = ss(0.47, 0.5, n3[i]) * ss(0.53, 0.5, n3[i]);
    const dirt = 0.78 + 0.22 * n2[i];
    o[0] = col[0] * dirt; o[1] = col[1] * dirt; o[2] = col[2] * dirt;
    o[3] = edge * worn * (1 - crack * 0.8) * (0.82 + 0.18 * n2[i]);
  });
  paint(BAND.white, [0.86, 0.86, 0.82]);
  paint(BAND.yellow, [0.82, 0.64, 0.14]);
  paint(BAND.red, [0.62, 0.12, 0.1]);
  // 柏油填縫(週期性的蜿蜒線)
  const P2 = (x, k) => Math.sin((x / W) * TAU * k);
  put(BAND.tar, (x, v, i, o) => {
    const yc = 0.5 + 0.22 * P2(x + 90, 2) + 0.1 * P2(x + 300, 5) + 0.04 * P2(x, 13);
    const w = 0.035 + 0.025 * (0.5 + 0.5 * P2(x + 40, 3)) + 0.01 * n2[i];
    const dd = Math.abs(v - yc);
    o[0] = o[1] = o[2] = 0.04 + 0.03 * n2[i];
    o[3] = (1 - ss(w * 0.7, w, dd)) * 0.95 + (1 - ss(w, w * 2.2, dd)) * 0.18;
  });
  // 泥土過渡(下緣不透明 → 上緣不規則淡出;夾雜草屑)
  put(BAND.mud, (x, v, i, o) => {
    const e = 0.3 + 0.35 * n1[i];
    const a = 1 - ss(e - 0.18, e + 0.12, v);
    const g = n2[i] > 0.62 ? 1 : 0;
    o[0] = g ? 0.2 : 0.22 + 0.08 * n2[i]; o[1] = g ? 0.24 : 0.18 + 0.06 * n2[i]; o[2] = g ? 0.1 : 0.12 + 0.04 * n2[i];
    o[3] = a * (0.75 + 0.25 * n2[i]);
  });
  // 牆腳污垢(下濃上淡 + 垂流)
  put(BAND.grime, (x, v, i, o) => {
    const drip = Math.max(0, n3[i] - 0.55) * 2.5 * (1 - v) * ss(0.2, 0.8, n2[i]);
    o[0] = 0.1; o[1] = 0.09; o[2] = 0.07;
    o[3] = clamp(Math.pow(1 - v, 2.2) * (0.7 + 0.3 * n1[i]) + drip * 0.6, 0, 0.95);
  });
  // 輪胎痕(胎紋塊)
  put(BAND.tire, (x, v, i, o) => {
    const ph = ((x / W) * 64) % 1, side = v < 0.5 ? v * 2 : (1 - v) * 2;
    const blocks = (ph > 0.15 && ph < 0.85 ? 1 : 0.3) * (Math.abs(v - 0.5) > 0.06 ? 1 : 0.4);
    o[0] = o[1] = o[2] = 0.03;
    o[3] = ss(0.0, 0.18, side) * blocks * (0.25 + 0.4 * n1[i]) * (1 - ss(0.6, 0.75, n3[i]));
  });
  ctx.putImageData(img, 0, 0);
  // 落葉帶(用畫的:越靠下緣越密;左右各畫一份讓它可平鋪)
  const y0 = BAND.leaves * SB;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, SB); ctx.clip();
  for (let k = 0; k < 520; k++) {
    const x = R() * W, v = Math.pow(R(), 1.8), y = y0 + SB - 4 - v * (SB - 10), s = rr(4, 9), a = R() * TAU;
    const col = [rr(70, 140), rr(42, 85), rr(18, 40)].map((q) => q | 0);
    for (const ox of [0, -W, W]) {
      ctx.save(); ctx.translate(x + ox, y); ctx.rotate(a);
      ctx.fillStyle = `rgba(${col.join(',')},${rr(0.75, 1)})`;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.65, s, 0); ctx.quadraticCurveTo(0, s * 0.65, -s, 0); ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  const t = tex(c, { aniso: 8 });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});
const bandV = (b) => { const v0 = 1 - (b + 1) / 8, v1 = 1 - b / 8, pad = 2 / 1024; return [v0 + pad, v1 - pad]; };

// ---------- 標記圖集 po_mark(2048×1024,8×4 格 256)----------
const MARK = {};
const mk = (n, cx, cy, cw = 1, ch = 1) => { MARK[n] = [cx * 256, cy * 256, cw * 256, ch * 256]; };
for (let i = 0; i < 8; i++) mk(`d${i}`, i, 0);
mk('d8', 0, 1); mk('d9', 1, 1); mk('H', 2, 1); mk('handi', 3, 1); mk('slow', 4, 1); mk('stop', 5, 1); mk('bio', 6, 1); mk('xhatch', 7, 1);
mk('sos', 0, 2, 2); mk('quar', 2, 2, 2); mk('er', 4, 2, 2); mk('exit', 6, 2); mk('turn', 7, 2);
mk('help', 0, 3, 2); mk('fire', 2, 3, 2); mk('arrow2', 4, 3); mk('p_amb', 5, 3); mk('tally', 6, 3); mk('drag', 7, 3);
const MARK_TEX = lazy(() => {
  const [c, ctx] = canvas(2048, 1024);
  const inC = (n, fn) => { const [x, y, w, h] = MARK[n]; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); };
  const WHITE = 'rgba(226,226,216,0.95)', YEL = 'rgba(214,168,32,0.95)';
  for (let i = 0; i < 10; i++) inC(`d${i}`, (w, h) => { text(ctx, String(i), w / 2, h / 2 + 12, 236, { font: 'Arial Black,Arial,sans-serif', color: WHITE, stretch: 0.62 }); wear(ctx, 0, 0, w, h, 0.4, 9); });
  inC('H', (w, h) => { ctx.fillStyle = WHITE; ctx.fillRect(48, 24, 46, 208); ctx.fillRect(162, 24, 46, 208); ctx.fillRect(48, 105, 160, 46); wear(ctx, 0, 0, w, h, 0.38, 8); });
  inC('handi', (w, h) => {
    ctx.fillStyle = 'rgba(40,80,160,0.9)'; ctx.fillRect(14, 14, 228, 228);
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(118, 52, 18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(112, 80); ctx.lineTo(116, 146); ctx.lineTo(170, 146); ctx.lineTo(196, 196); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(114, 104); ctx.lineTo(160, 104); ctx.stroke();
    ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(116, 168, 46, 0.6, 5.4); ctx.stroke();
    wear(ctx, 0, 0, w, h, 0.42, 8);
  });
  inC('slow', (w, h) => { text(ctx, '慢', w / 2, h / 2 + 6, 220, { color: WHITE, weight: '900' }); wear(ctx, 0, 0, w, h, 0.45, 9); });
  inC('stop', (w, h) => { text(ctx, '停', w / 2, h / 2 + 6, 220, { color: WHITE, weight: '900' }); wear(ctx, 0, 0, w, h, 0.45, 9); });
  inC('bio', (w, h) => { ctx.fillStyle = 'rgba(214,168,32,0.9)'; ctx.beginPath(); ctx.arc(128, 128, 118, 0, TAU); ctx.fill(); text(ctx, '☣', w / 2, h / 2 + 10, 210, { color: 'rgba(20,20,20,0.95)', font: 'Segoe UI Symbol,sans-serif', weight: 'normal' }); wear(ctx, 0, 0, w, h, 0.35, 8); });
  inC('xhatch', (w, h) => { ctx.strokeStyle = YEL; ctx.lineWidth = 18; for (let k = -4; k < 6; k++) { ctx.beginPath(); ctx.moveTo(k * 64, 0); ctx.lineTo(k * 64 + 256, 256); ctx.stroke(); } wear(ctx, 0, 0, w, h, 0.45, 10); });
  inC('sos', (w, h) => {
    ctx.fillStyle = 'rgba(232,230,220,0.96)';
    text(ctx, 'S O S', w / 2, h / 2 + 10, 200, { font: 'Impact,Arial Black,sans-serif', color: 'rgba(232,230,220,0.96)', stretch: 0.95 });
    for (let k = 0; k < 18; k++) { const x = rr(40, w - 40); ctx.fillRect(x, h / 2 + 70, rr(4, 9), rr(10, 50)); } // 油漆垂流
    wear(ctx, 0, 0, w, h, 0.22, 12);
  });
  inC('quar', (w, h) => { ctx.strokeStyle = 'rgba(180,30,24,0.9)'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, w - 24, h - 24); text(ctx, '隔 離 區', w / 2, h / 2 + 8, 150, { color: 'rgba(180,30,24,0.92)', weight: '900' }); wear(ctx, 0, 0, w, h, 0.4, 12); });
  inC('er', (w, h) => { text(ctx, '急診', w * 0.36, h / 2 + 8, 170, { color: YEL, weight: '900' }); ctx.fillStyle = YEL; ctx.beginPath(); ctx.moveTo(330, 90); ctx.lineTo(470, 128); ctx.lineTo(330, 166); ctx.fill(); ctx.fillRect(300, 112, 40, 32); wear(ctx, 0, 0, w, h, 0.42, 12); });
  inC('exit', (w, h) => { text(ctx, '出口', w / 2, h / 2 + 8, 120, { color: WHITE, weight: '900' }); wear(ctx, 0, 0, w, h, 0.45, 9); });
  inC('turn', (w, h) => { ctx.fillStyle = WHITE; ctx.fillRect(110, 110, 44, 140); ctx.beginPath(); ctx.arc(154, 110, 44, Math.PI, Math.PI * 1.5); ctx.lineTo(154, 110); ctx.fill(); ctx.fillRect(150, 66, 50, 44); ctx.beginPath(); ctx.moveTo(196, 34); ctx.lineTo(250, 88); ctx.lineTo(196, 142); ctx.fill(); wear(ctx, 0, 0, w, h, 0.45, 9); });
  inC('help', (w, h) => { text(ctx, '救 救 我 們', w / 2, h / 2 + 6, 104, { color: 'rgba(225,222,212,0.95)', weight: '900' }); for (let k = 0; k < 14; k++) { ctx.fillStyle = 'rgba(225,222,212,0.9)'; ctx.fillRect(rr(30, w - 30), h / 2 + 50, rr(3, 7), rr(10, 45)); } wear(ctx, 0, 0, w, h, 0.25, 12); });
  inC('fire', (w, h) => { text(ctx, '消防車道', w / 2, h / 2 + 8, 112, { color: 'rgba(200,40,30,0.92)', weight: '900' }); wear(ctx, 0, 0, w, h, 0.45, 12); });
  inC('arrow2', (w, h) => { ctx.fillStyle = YEL; ctx.beginPath(); ctx.moveTo(128, 14); ctx.lineTo(220, 112); ctx.lineTo(160, 112); ctx.lineTo(160, 244); ctx.lineTo(96, 244); ctx.lineTo(96, 112); ctx.lineTo(36, 112); ctx.fill(); wear(ctx, 0, 0, w, h, 0.45, 9); });
  inC('p_amb', (w, h) => { ctx.strokeStyle = YEL; ctx.lineWidth = 10; ctx.strokeRect(16, 16, w - 32, h - 32); text(ctx, '救護車', w / 2, h / 2 - 30, 64, { color: YEL, weight: '900' }); text(ctx, '專用', w / 2, h / 2 + 50, 64, { color: YEL, weight: '900' }); wear(ctx, 0, 0, w, h, 0.42, 9); });
  inC('tally', (w, h) => { ctx.strokeStyle = 'rgba(230,228,220,0.9)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; for (let g = 0; g < 6; g++) { const ox = 20 + (g % 3) * 78, oy = 30 + Math.floor(g / 3) * 110; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(ox + k * 15, oy); ctx.lineTo(ox + k * 15 + rr(-3, 3), oy + 78); ctx.stroke(); } if (g < 5) { ctx.beginPath(); ctx.moveTo(ox - 6, oy + 66); ctx.lineTo(ox + 58, oy + 12); ctx.stroke(); } } wear(ctx, 0, 0, w, h, 0.2, 10); });
  inC('drag', (w, h) => { ctx.strokeStyle = BLOOD(0.75); ctx.lineCap = 'round'; for (let k = 0; k < 3; k++) { ctx.lineWidth = rr(20, 36); ctx.beginPath(); ctx.moveTo(128 + rr(-30, 30), 0); ctx.bezierCurveTo(128 + rr(-50, 50), 90, 128 + rr(-50, 50), 170, 128 + rr(-20, 20), 256); ctx.stroke(); } splat(ctx, 128, 40, 30, BLOOD(0.9), 12); wear(ctx, 0, 0, w, h, 0.38, 12); });
  return tex(c, { repeat: false });
});
const markUV = (n) => { const [x, y, w, h] = MARK[n]; return [x / 2048, 1 - (y + h) / 1024, w / 2048, h / 1024]; };

// ---------- 雜物圖集 po_litter(512×512,4×4 格 128)----------
const LIT = ['news', 'flyer', 'missing', 'form', 'card', 'mask', 'glove', 'bag', 'photo', 'cup', 'pack', 'gauze', 'receipt', 'tissue', 'tag', 'pills'];
const LITTER_TEX = lazy(() => {
  const [c, ctx] = canvas(512, 512);
  const cellAt = (n, fn) => { const i = LIT.indexOf(n), x = (i % 4) * 128, y = Math.floor(i / 4) * 128; ctx.save(); ctx.beginPath(); ctx.rect(x, y, 128, 128); ctx.clip(); ctx.translate(x, y); fn(); ctx.restore(); };
  const sheet = (bg, fn) => { ctx.fillStyle = bg; ctx.fillRect(6, 4, 116, 120); fn(); softBlob(ctx, rr(20, 100), rr(20, 100), 60, '90,80,60', 0.3); };
  const lines = (y0, y1, x0 = 14, x1 = 114, a = 0.55) => { ctx.fillStyle = `rgba(40,40,40,${a})`; for (let y = y0; y < y1; y += 6) ctx.fillRect(x0, y, rr(x1 - x0 - 30, x1 - x0), 2); };
  cellAt('news', () => sheet('#cfcbbd', () => { text(ctx, '霧港封城', 64, 18, 18, { color: '#111', weight: '900' }); ctx.fillStyle = '#555'; ctx.fillRect(14, 30, 48, 34); lines(30, 66, 66, 114); lines(70, 120); }));
  cellAt('flyer', () => sheet('#e8e4d4', () => { ctx.fillStyle = '#b01818'; ctx.fillRect(6, 4, 116, 26); text(ctx, '疏散通知', 64, 18, 18, { color: '#fff', weight: '900' }); lines(38, 118, 14, 114, 0.6); }));
  cellAt('missing', () => sheet('#e4e0d0', () => { text(ctx, '尋 人', 64, 16, 18, { color: '#111', weight: '900' }); ctx.fillStyle = '#6a6458'; ctx.fillRect(34, 28, 60, 50); ctx.fillStyle = '#3a3630'; ctx.beginPath(); ctx.arc(64, 48, 12, 0, TAU); ctx.fill(); ctx.fillRect(48, 60, 32, 18); lines(84, 120); }));
  cellAt('form', () => sheet('#dde0dc', () => { ctx.strokeStyle = 'rgba(40,60,90,0.6)'; for (let y = 14; y < 120; y += 12) { ctx.strokeRect(12, y, 104, 10); } text(ctx, '病歷', 30, 10, 10, { color: '#234' }); }));
  cellAt('card', () => { ctx.fillStyle = '#7a5a38'; ctx.fillRect(4, 10, 120, 108); ctx.strokeStyle = 'rgba(60,40,20,0.6)'; ctx.lineWidth = 2; for (let x = 8; x < 124; x += 8) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 118); ctx.stroke(); } softBlob(ctx, 64, 64, 60, '40,30,20', 0.4); });
  cellAt('mask', () => { ctx.fillStyle = '#9cc4d8'; ctx.beginPath(); ctx.ellipse(64, 64, 46, 30, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(80,120,140,0.7)'; ctx.lineWidth = 2; for (const y of [52, 64, 76]) { ctx.beginPath(); ctx.moveTo(22, y); ctx.lineTo(106, y); ctx.stroke(); } ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(14, 64, 14, -1.2, 1.2); ctx.stroke(); ctx.beginPath(); ctx.arc(114, 64, 14, Math.PI - 1.2, Math.PI + 1.2); ctx.stroke(); softBlob(ctx, 80, 70, 24, '60,40,30', 0.35); });
  cellAt('glove', () => { ctx.fillStyle = '#3a6ac0'; ctx.beginPath(); ctx.ellipse(64, 80, 26, 34, 0, 0, TAU); ctx.fill(); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(42 + k * 14, 40 - (k === 1 || k === 2 ? 8 : 0), 6, 20, 0, 0, TAU); ctx.fill(); } ctx.beginPath(); ctx.ellipse(96, 74, 7, 18, -0.8, 0, TAU); ctx.fill(); softBlob(ctx, 60, 80, 20, '90,10,8', 0.6); });
  cellAt('bag', () => { const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 60); g.addColorStop(0, 'rgba(235,235,230,0.95)'); g.addColorStop(1, 'rgba(200,200,195,0.85)'); ctx.fillStyle = g; ctx.beginPath(); for (let a = 0; a < 6.3; a += 0.4) { const r = rr(40, 58); ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } ctx.fill(); ctx.strokeStyle = 'rgba(150,150,150,0.5)'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(rr(20, 108), rr(20, 108)); ctx.lineTo(rr(20, 108), rr(20, 108)); ctx.stroke(); } });
  cellAt('photo', () => { ctx.fillStyle = '#eee'; ctx.fillRect(16, 10, 96, 108); ctx.fillStyle = '#4a5a6a'; ctx.fillRect(22, 16, 84, 76); ctx.fillStyle = '#c8a888'; for (const x of [44, 70, 88]) { ctx.beginPath(); ctx.arc(x, 48, 9, 0, TAU); ctx.fill(); ctx.fillRect(x - 8, 58, 16, 30); } softBlob(ctx, 80, 40, 26, '90,10,8', 0.5); });
  cellAt('cup', () => { ctx.fillStyle = '#e8e2d2'; ctx.beginPath(); ctx.moveTo(34, 20); ctx.lineTo(94, 20); ctx.lineTo(84, 110); ctx.lineTo(44, 110); ctx.fill(); ctx.fillStyle = '#8a2a20'; ctx.fillRect(40, 50, 48, 22); });
  cellAt('pack', () => { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(30, 14, 68, 100); ctx.fillStyle = '#b01010'; ctx.fillRect(30, 14, 68, 40); text(ctx, '吸菸有害', 64, 92, 12, { color: '#111' }); });
  cellAt('gauze', () => { ctx.fillStyle = '#f0ece4'; ctx.fillRect(18, 22, 92, 84); ctx.strokeStyle = 'rgba(200,190,180,0.6)'; for (let k = 22; k < 106; k += 5) { ctx.beginPath(); ctx.moveTo(18, k); ctx.lineTo(110, k); ctx.stroke(); } splat(ctx, 64, 62, 22, BLOOD(0.85), 8); });
  cellAt('receipt', () => { ctx.fillStyle = '#ece8dc'; ctx.fillRect(40, 4, 48, 120); lines(12, 118, 46, 84, 0.5); });
  cellAt('tissue', () => { ctx.fillStyle = 'rgba(240,238,232,0.95)'; ctx.beginPath(); for (let a = 0; a < 6.3; a += 0.5) { const r = rr(26, 44); ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } ctx.fill(); });
  cellAt('tag', () => { ctx.fillStyle = '#d8d0b0'; ctx.fillRect(20, 30, 90, 64); ctx.fillStyle = '#111'; ctx.fillRect(20, 30, 90, 16); text(ctx, '已死亡', 64, 70, 18, { color: '#111', weight: '900' }); ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(30, 62, 5, 0, TAU); ctx.stroke(); });
  cellAt('pills', () => { for (let k = 0; k < 9; k++) { ctx.fillStyle = k % 3 ? '#e8e4d8' : '#c84a3a'; ctx.beginPath(); ctx.ellipse(rr(20, 108), rr(20, 108), 9, 5, rr(0, 3), 0, TAU); ctx.fill(); } ctx.fillStyle = '#c87a20'; ctx.fillRect(44, 40, 36, 52); ctx.fillStyle = '#eee'; ctx.fillRect(44, 54, 36, 18); });
  return tex(c, { repeat: false });
});
const litUV = (n) => { const i = LIT.indexOf(n); return [(i % 4) * 0.25, 1 - (Math.floor(i / 4) + 1) * 0.25, 0.25, 0.25]; };

// ---------- 人孔蓋 / 排水格柵(512×256 顏色 + 由高度場算的法線)----------
const MH = lazy(() => {
  const W = 512, Hh = 256;
  const h = new Float32Array(W * Hh), col = new Uint8ClampedArray(W * Hh * 4);
  const n = fbm(W, Hh, 16, 8, 4);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let hv = 0.5, r = 0.2, g = 0.2, b = 0.21;
    if (x < 256) { // 人孔蓋:同心環 + 放射肋 + 防滑凸點 + 中央字樣區
      const dx = x - 128, dy = y - 128, rr2 = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (rr2 < 122) {
        hv = 0.55;
        if (rr2 > 112) hv = 0.42; // 外縫
        else if (rr2 > 100) hv = 0.6;
        else if (rr2 > 44) { const ring = Math.sin(rr2 * 0.42) > 0.55; const rib = Math.abs(Math.sin(a * 8)) < 0.12; const stud = (Math.sin(dx * 0.55) * Math.sin(dy * 0.55)) > 0.72; hv = ring || rib ? 0.66 : stud ? 0.62 : 0.5; }
        else hv = rr2 > 40 ? 0.66 : 0.52;
        const rust = Math.max(0, n[i] - 0.55) * 2.2;
        r = 0.16 + rust * 0.25; g = 0.15 + rust * 0.1; b = 0.15 + rust * 0.02;
        if (rr2 > 100 && rr2 < 112) { r *= 0.8; g *= 0.8; b *= 0.8; }
      } else { hv = 0.3; r = 0.05; g = 0.05; b = 0.05; }
    } else { // 排水格柵:橫向長條縫
      const lx = x - 256, sl = (lx % 24) < 13 && lx > 16 && lx < 240 && y > 18 && y < 238;
      hv = sl ? 0.0 : 0.55;
      const rust = Math.max(0, n[i] - 0.5) * 2;
      r = sl ? 0.01 : 0.17 + rust * 0.2; g = sl ? 0.01 : 0.16 + rust * 0.08; b = sl ? 0.012 : 0.16;
    }
    h[i] = hv + (n[i] - 0.5) * 0.06;
    col[i * 4] = r * 255; col[i * 4 + 1] = g * 255; col[i * 4 + 2] = b * 255; col[i * 4 + 3] = 255;
  }
  // 字樣(畫在顏色上,也壓進高度)
  const [cc, cx] = canvas(W, Hh);
  cx.putImageData(new ImageData(col, W, Hh), 0, 0);
  text(cx, '污 水', 128, 128, 30, { color: 'rgba(70,70,70,1)', font: FONT_TC, weight: '900' });
  const nrm = new Uint8Array(W * Hh * 4);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, xl = y * W + Math.max(0, x - 1), xr = y * W + Math.min(W - 1, x + 1), yu = Math.max(0, y - 1) * W + x, yd = Math.min(Hh - 1, y + 1) * W + x;
    const sx = (h[xr] - h[xl]) * 6, sy = (h[yd] - h[yu]) * 6, l = Math.hypot(sx, sy, 1);
    nrm[i * 4] = (-sx / l * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (sy / l * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
  }
  const nt = new THREE.DataTexture(nrm, W, Hh, THREE.RGBAFormat);
  nt.flipY = true; nt.needsUpdate = true; nt.generateMipmaps = true; nt.minFilter = THREE.LinearMipmapLinearFilter; nt.magFilter = THREE.LinearFilter;
  nt.anisotropy = 4;
  return { map: tex(cc, { repeat: false }), normal: nt };
});

// ---------- 材質 ----------
let inited = false;
export function initGround() {
  if (inited) return;
  inited = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const deco = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
  registerMat('po_strip', makeWet(std({ map: STRIP_TEX(), roughness: 0.75, ...deco }), { darken: 0.15, gloss: 0.6 }));
  registerMat('po_mark', makeWet(std({ map: MARK_TEX(), roughness: 0.7, ...deco }), { darken: 0.15, gloss: 0.6 }));
  registerMat('po_litter', makeWet(std({ map: LITTER_TEX(), roughness: 0.9, alphaTest: 0.4, side: THREE.DoubleSide }), { darken: 0.25, gloss: 0.4 }));
  const mh = MH();
  registerMat('po_manhole', makeWet(std({ map: mh.map, normalMap: mh.normal, roughness: 0.55, metalness: 0.6 }), { darken: 0.2, gloss: 0.5 }));
  // 混凝土緣石 / 車輪擋 / 拒馬(混凝土 PBR,世界座標 UV)
  const pbr = (set, o = {}) => {
    const m = std({ color: o.color ?? 0xffffff, roughness: o.rough ?? 1, metalness: o.metal ?? 0, map: pbrTex(set, 'color', { tile: o.tile }), normalMap: pbrTex(set, 'normal', { tile: o.tile }) });
    const orm = pbrTex(set, 'orm', { tile: o.tile });
    m.roughnessMap = orm; m.aoMap = orm;
    return m;
  };
  registerMat('po_curb', makeWet(pbr('concrete', { tile: 1.6, color: 0xc8c4bc }), { darken: 0.3, gloss: 0.5 }));
  registerMat('po_curb_dark', makeWet(pbr('concrete', { tile: 1.6, color: 0x8a8882 }), { darken: 0.3, gloss: 0.5 }));
  registerMat('po_jersey', makeWet(pbr('concrete', { tile: 1.4, color: 0xd4d0c6 }), { darken: 0.3, gloss: 0.5 }));
  registerMat('po_soil', makeWet(pbr('dirt', { tile: 1.6, color: 0x9a8e80 }), { darken: 0.3, gloss: 0.55 }));
  registerMat('po_mud', makeWet(pbr('dirt', { tile: 1.3, color: 0x6a5e50, rough: 0.8 }), { puddle: 0.8, darken: 0.3, gloss: 0.7 }));
  registerMat('po_bark', pbr('bark', { tile: 1.2, color: 0x5e564c }));
  registerMat('po_burnt', makeWet(pbr('rust', { tile: 1.4, color: 0x3a3430, metal: 0.4 }), { darken: 0.2, gloss: 0.3 }));
  registerMat('po_brick_far', pbr('brick', { tile: 1.5, color: 0x8a7a70 }));
  registerMat('po_bone', [0x847a64, 0.8]);
  registerMat('po_gravel', makeWet(pbr('gravel', { tile: 1.6, color: 0xb0aca4 }), { darken: 0.3, gloss: 0.4 }));
  // 既有的貼花/水窪也要會濕
  makeWet(mat('po_decal'), { darken: 0.1, gloss: 0.5 });
  makeWet(mat('po_puddle'), { puddle: 1, full: true, darken: 0, gloss: 1 });
}

// ======================================================================
// 幾何工具(全部加進 Parts;座標為世界或呼叫端的本地座標)
// ======================================================================
// 沿折線的帶狀面:pts [[x,z],...];w 寬;us 一張貼圖的公尺數;band 帶
export function strip(P, band, pts, w, { y = 0.009, us = 2.2, u0 = 0, closed = false, key = 'po_strip' } = {}) {
  const [v0, v1] = key === 'po_strip' ? bandV(band) : [0, 1];
  const pos = [], uv = [], idx = [];
  const n = pts.length, list = closed ? [...pts, pts[0]] : pts;
  let acc = u0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i) acc += Math.hypot(p[0] - list[i - 1][0], p[1] - list[i - 1][1]);
    const nx = -tz * w / 2, nz = tx * w / 2;
    pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    uv.push(acc / us, v1, acc / us, v0);
  }
  for (let i = 0; i < list.length - 1; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  void n;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  P.add(key, keepUV(g));
}
export const line = (P, band, x0, z0, x1, z1, w = 0.12, o) => strip(P, band, [[x0, z0], [x1, z1]], w, o);
export function dashed(P, band, x0, z0, x1, z1, w = 0.12, dash = 2, gap = 2, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
  for (let s = 0; s < L - 0.1; s += dash + gap) { const e = Math.min(L, s + dash); strip(P, band, [[x0 + dx * s, z0 + dz * s], [x0 + dx * e, z0 + dz * e]], w, { ...o, u0: s }); }
}
// 平躺的圖集方塊(po_mark / po_litter);rot 繞 y
export function flatQuad(P, key, uvr, x, z, w, h, rot = 0, y = 0.01, tilt = null) {
  const [u, v, uw, vh] = uvr;
  const g = new THREE.PlaneGeometry(w, h).rotateX(-HALF);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, u + a.getX(i) * uw, v + a.getY(i) * vh);
  if (tilt) g.rotateX(tilt[0]).rotateZ(tilt[1]);
  g.rotateY(rot).translate(x, y, z);
  P.add(key, keepUV(g));
}
export const mark = (P, name, x, z, w, h, rot = 0, y = 0.011) => flatQuad(P, 'po_mark', markUV(name), x, z, w, h, rot, y);
export const MARKS = MARK;

// 停車格:沿 x 方向一排,每格寬 sw,深 d(往 dir = +1 南 / -1 北);x0..x1 為格線範圍;num0 起始編號
export function stalls(P, x0, x1, zHead, d, dir, sw = 3, { num0 = 1, band = BAND.white, nums = true, R = () => 0.5, skip = null } = {}) {
  const zEnd = zHead + d * dir;
  line(P, band, x0, zHead, x1, zHead, 0.12);
  let k = 0;
  for (let x = x0; x <= x1 + 0.01; x += sw, k++) {
    if (!(skip && skip(x))) line(P, band, x, zHead, x, zEnd - dir * 0.15, 0.12);
    if (nums && x + sw <= x1 + 0.01 && R() > 0.12) {
      const n = num0 + k, s = String(n).padStart(2, '0');
      const cx = x + sw / 2, cz = zEnd - dir * 0.75;
      for (let j = 0; j < s.length; j++) mark(P, `d${s[j]}`, cx + (j - (s.length - 1) / 2) * 0.42, cz, 0.42, 0.62, dir > 0 ? Math.PI : 0);
    }
  }
}

// 緣石:x0,z0 → x1,z1 的一段;h 高、w 寬;side = 斜角朝哪邊(+1 / -1,相對前進方向的左手);step:登記可踏上的碰撞盒
export function curb(ctx, P, x0, z0, x1, z1, { h = 0.14, w = 0.2, y = 0, key = 'po_curb', step = true, paint = null } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0);
  if (L < 0.05) return;
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const prof = [[-w / 2, 0], [w / 2, 0], [w / 2, h - 0.025], [w / 2 - 0.025, h], [-w / 2 + 0.025, h], [-w / 2, h - 0.025]];
  const g = extrude(prof, L, { bevel: 0 }).rotateY(HALF); // 擠出方向 → +x
  P.add(key, g, M((x0 + x1) / 2, y, (z0 + z1) / 2, 0, yaw, 0));
  if (paint !== null) { // 紅/黃漆緣石(頂面 + 外側面)
    const segs = Math.max(1, Math.round(L / 3));
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      if ((s & 1) && paint === BAND.red) continue;
      strip(P, paint, [[lerp(x0, x1, t0), lerp(z0, z1, t0)], [lerp(x0, x1, t1), lerp(z0, z1, t1)]], w - 0.02, { y: y + h + 0.004, us: 1.5 });
    }
  }
  if (step && ctx) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    solid(ctx, cx, y, cz, ax ? L : w, h, ax ? w : L, 'concrete');
  }
}

// 人孔蓋(實例池):蓋板 + 鑄鐵框
export function manhole(ctx, x, y, z, rot = 0, s = 1) {
  pool(ctx, 'manhole', () => {
    const P = new Parts();
    const [u, v, uw, vh] = [0, 0, 0.5, 1];
    const top = new THREE.CircleGeometry(0.34, 32).rotateX(-HALF);
    const a = top.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, u + a.getX(i) * uw, v + a.getY(i) * vh);
    P.add('po_manhole', keepUV(top), M(0, 0.022, 0));
    P.add('cast_iron', new THREE.CylinderGeometry(0.4, 0.42, 0.02, 32, 1, true), M(0, 0.01, 0));
    P.add('cast_iron', new THREE.RingGeometry(0.34, 0.4, 32).rotateX(-HALF), M(0, 0.02, 0));
    P.add('cast_iron', new THREE.CylinderGeometry(0.34, 0.34, 0.012, 32, 1, true), M(0, 0.016, 0));
    return P;
  }, 24).add(M(x, y, z, 0, rot, 0, s));
}
// 排水格柵(貼地;curbSide 有值時在緣石側面加進水口)
export function drain(ctx, x, y, z, rot = 0) {
  pool(ctx, 'drain', () => {
    const P = new Parts();
    const g = new THREE.PlaneGeometry(0.42, 0.62).rotateX(-HALF);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, 0.5 + a.getX(i) * 0.5, a.getY(i));
    P.add('po_manhole', keepUV(g), M(0, 0.012, 0));
    P.add('cast_iron', box(0.5, 0.012, 0.7), M(0, 0.005, 0));
    return P;
  }, 24).add(M(x, y, z, 0, rot, 0));
}

// 散落雜物(扁平卡片,略為彎折):n 片,r 半徑;kinds 種類清單
export function litter(P, rng, x, z, r, n, kinds = ['news', 'flyer', 'form', 'mask', 'glove', 'bag', 'cup', 'receipt', 'tissue', 'pack'], y = 0.008) {
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r, kind = kinds[(rng() * kinds.length) | 0];
    const s = kind === 'card' ? rng.range(0.35, 0.6) : kind === 'news' || kind === 'bag' ? rng.range(0.25, 0.42) : rng.range(0.12, 0.22);
    flatQuad(P, 'po_litter', litUV(kind), x + Math.cos(a) * d, z + Math.sin(a) * d, s, s, rng() * TAU, y + k * 0.0007, [rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)]);
  }
}
// 落葉(卡片):沿 x0,z0→x1,z1 的帶狀範圍,寬 w
export function leafLine(P, rng, x0, z0, x1, z1, w, n, y = 0.01) {
  for (let k = 0; k < n; k++) {
    const t = rng(), off = (rng() - 0.5) * w * (0.4 + 0.6 * rng());
    const L = Math.hypot(x1 - x0, z1 - z0) || 1, nx = -(z1 - z0) / L, nz = (x1 - x0) / L;
    const s = rng.range(0.3, 0.6);
    P.add('po_leaf_card', new THREE.PlaneGeometry(s, s).rotateX(-HALF), M(lerp(x0, x1, t) + nx * off, y + (k % 7) * 0.001, lerp(z0, z1, t) + nz * off, rng.range(-0.1, 0.1), rng() * TAU, rng.range(-0.1, 0.1)));
  }
}
export function leafPatch(P, rng, x, z, r, n, y = 0.01) {
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r, s = rng.range(0.3, 0.65);
    P.add('po_leaf_card', new THREE.PlaneGeometry(s, s).rotateX(-HALF), M(x + Math.cos(a) * d, y + (k % 9) * 0.0012, z + Math.sin(a) * d, rng.range(-0.08, 0.08), rng() * TAU, rng.range(-0.08, 0.08)));
  }
}
// 柏油裂縫填縫:從 (x,z) 隨機走一段
export function tarCrack(P, rng, x, z, len, ang = rng() * TAU, bounds = null) {
  const pts = [[x, z]];
  let a = ang, px = x, pz = z;
  for (let s = 0; s < len; s += 0.6) {
    a += rng.range(-0.45, 0.45);
    px += Math.cos(a) * 0.6; pz += Math.sin(a) * 0.6;
    if (bounds && (px < bounds[0] || px > bounds[2] || pz < bounds[1] || pz > bounds[3])) break;
    pts.push([px, pz]);
  }
  if (pts.length > 1) strip(P, BAND.tar, pts, rng.range(0.16, 0.28), { us: 3, u0: rng() * 10, y: 0.007 });
}
// 不規則水窪(po_puddle):r 半徑,sx/sz 拉伸
export function puddle(P, rng, x, z, r, sx = 1, sz = 1, y = 0.006) {
  const n = 20, pos = [0, 0, 0], idx = [];
  const ph = rng() * 10;
  for (let i = 0; i <= n; i++) { const a = (i / n) * TAU, k = 1 + 0.22 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 5 + ph * 2); pos.push(Math.cos(a) * r * k * sx, 0, Math.sin(a) * r * k * sz); }
  for (let i = 1; i <= n; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  P.add('po_puddle', g, M(x, y, z, 0, rng() * TAU, 0));
}
// 混凝土車輪擋(長 1.7m)
export function wheelStop(ctx, P, x, z, rot = 0, y = 0) {
  const g = extrude([[-0.11, 0], [0.11, 0], [0.09, 0.11], [-0.09, 0.11]], 1.7).rotateY(HALF);
  P.add('po_curb_dark', g, M(x, y, z, 0, rot, 0));
  for (const s of [-0.55, 0.55]) P.add('rust', cyl(0.018, 0.018, 0.02, 6), M(x + Math.cos(rot) * s, y + 0.115, z - Math.sin(rot) * s));
  const ax = Math.abs(Math.cos(rot)) > 0.7;
  solid(ctx, x, y, z, ax ? 1.7 : 0.22, 0.11, ax ? 0.22 : 1.7, 'concrete');
}
export { litUV, markUV, bandV };

// 牆腳直立帶狀貼花(污垢、泥水濺痕):沿牆面 x0,z0→x1,z1,底 y、高 h;(nx,nz) 為牆面朝外的法線(貼花往外偏 1cm)
export function wallStrip(P, band, x0, z0, x1, z1, y, h, nx, nz, us = 2.5) {
  const [v0, v1] = bandV(band);
  const L = Math.hypot(x1 - x0, z1 - z0), ox = nx * 0.012, oz = nz * 0.012;
  const u0 = (x0 + z0) / us, u1 = u0 + L / us;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0 + ox, y, z0 + oz, x1 + ox, y, z1 + oz, x1 + ox, y + h, z1 + oz, x0 + ox, y + h, z0 + oz], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
  const cross = (x1 - x0) * nz - (z1 - z0) * nx; // 依法線決定三角形繞向(正面朝外)
  g.setIndex(cross > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  P.add('po_strip', keepUV(g));
}
