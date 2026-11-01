import * as THREE from 'three';
import { rnd, rr, canvas, grain, blotches, toTexture } from './textures.js';

// 通用材質產生器(各地圖共用,用參數換色)。貼圖都設計成一張對應 4m×4m(地板)或一層樓高(牆)
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const rgbOf = (n) => `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
const clamp255 = (v) => Math.max(0, Math.min(255, v | 0));

function scribble(ctx, W, H, n, color, len = 8, step = 14) {
  for (let i = 0; i < n; i++) {
    let x = rnd() * W, y = rnd() * H;
    ctx.strokeStyle = color;
    ctx.lineWidth = rr(0.8, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < len; k++) { x += rr(-step, step); y += rr(-step, step); ctx.lineTo(x, y); }
    ctx.stroke();
  }
}

// 上段油漆、下段護牆的牆面;split=1 表示整面同色;dirt 0~1 控制髒污程度
export function makePaintedWall({ top = 0x8c9788, bottom = 0x566b5e, stripe = 0x2f3b33, split = 0.62, dirt = 1, peel = 0x6a625a, tiles = false } = {}) {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = hex(top);
  ctx.fillRect(0, 0, W, H);
  if (split < 1) {
    ctx.fillStyle = hex(bottom);
    ctx.fillRect(0, H * split, W, H * (1 - split));
    if (tiles) { // 下半部貼磁磚
      ctx.strokeStyle = 'rgba(30,30,28,0.35)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= W; x += 32) { ctx.beginPath(); ctx.moveTo(x, H * split); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = H * split; y <= H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    ctx.fillStyle = hex(stripe);
    ctx.fillRect(0, H * split, W, 6);
  }
  blotches(ctx, W, H, 40 * dirt, 30, 110, '60,66,52', 0.04, 0.16);
  blotches(ctx, W, H, 16 * dirt, 20, 60, '30,24,18', 0.06, 0.2);
  for (let i = 0; i < 50 * dirt; i++) { // 水痕垂流
    const x = rnd() * W, y = rnd() * H * 0.6, l = rr(40, 240);
    const g = ctx.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, 'rgba(25,22,16,0.2)');
    g.addColorStop(1, 'rgba(25,22,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, rr(1, 5), l);
  }
  for (let i = 0; i < 12 * dirt; i++) { // 油漆剝落
    const x = rnd() * W, y = rnd() * H, r = rr(10, 45);
    ctx.fillStyle = rnd() < 0.6 ? '#a9a695' : hex(peel);
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rad = r * rr(0.55, 1.15);
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.8);
    }
    ctx.closePath();
    ctx.fill();
  }
  scribble(ctx, W, H * 0.5, 4 * dirt, 'rgba(20,18,14,0.5)', 12, 12);
  const gb = ctx.createLinearGradient(0, H * 0.85, 0, H);
  gb.addColorStop(0, 'rgba(10,8,6,0)');
  gb.addColorStop(1, `rgba(10,8,6,${0.45 * dirt})`);
  ctx.fillStyle = gb;
  ctx.fillRect(0, H * 0.85, W, H * 0.15);
  grain(ctx, W, H, 24);
  return toTexture(c);
}

// 方格磁磚:colors 依序交錯(棋盤或隨機),n×n 片
export function makeTiles({ n = 8, colors = [0x969c8c, 0x8a9082], grout = 0x1a1814, groutW = 3, dirt = 1, blood = 0, vary = 10, random = false } = {}) {
  const W = 512, s = W / n;
  const [c, ctx] = canvas(W, W);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const base = random ? colors[(rnd() * colors.length) | 0] : colors[(i + j) % colors.length];
      const v = rr(-vary, vary);
      ctx.fillStyle = `rgb(${clamp255(((base >> 16) & 255) + v)},${clamp255(((base >> 8) & 255) + v)},${clamp255((base & 255) + v)})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
  }
  ctx.strokeStyle = `rgba(${rgbOf(grout)},0.85)`;
  ctx.lineWidth = groutW;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke();
  }
  blotches(ctx, W, W, 60 * dirt, 20, 90, '35,28,20', 0.06, 0.26);
  if (blood) blotches(ctx, W, W, 6 * blood, 20, 50, '70,10,8', 0.15, 0.35);
  scribble(ctx, W, W, 5 * dirt, 'rgba(15,14,12,0.6)');
  grain(ctx, W, W, 26);
  return toTexture(c);
}

// 清水模/水泥:可選模板分割線、油污
export function makeConcrete({ base = 0x77756e, seams = true, stains = 1, oil = 0 } = {}) {
  const W = 512;
  const [c, ctx] = canvas(W, W);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, W, W);
  blotches(ctx, W, W, 90, 10, 70, '40,38,34', 0.04, 0.14);
  blotches(ctx, W, W, 60, 6, 40, '150,148,140', 0.04, 0.12);
  blotches(ctx, W, W, 14 * stains, 30, 120, '50,40,26', 0.06, 0.22);
  if (oil) blotches(ctx, W, W, 8 * oil, 25, 80, '12,12,14', 0.25, 0.55);
  if (seams) {
    ctx.strokeStyle = 'rgba(30,30,28,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, W / 2); ctx.lineTo(W, W / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, W); ctx.stroke();
    ctx.fillStyle = 'rgba(25,25,22,0.5)';
    for (const [x, y] of [[W / 4, W / 4], [W * 0.75, W / 4], [W / 4, W * 0.75], [W * 0.75, W * 0.75]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.28); ctx.fill(); }
  }
  scribble(ctx, W, W, 4, 'rgba(15,14,12,0.5)', 12, 16);
  grain(ctx, W, W, 34);
  return toTexture(c);
}

// 木地板:長條木板;lines=true 加上體育館場線
export function makeWoodPlanks({ base = 0x8a6440, n = 8, dirt = 1, lines = false } = {}) {
  const W = 512, s = W / n;
  const [c, ctx] = canvas(W, W);
  for (let i = 0; i < n; i++) {
    const v = rr(-18, 18);
    ctx.fillStyle = `rgb(${clamp255(((base >> 16) & 255) + v)},${clamp255(((base >> 8) & 255) + v * 0.8)},${clamp255((base & 255) + v * 0.6)})`;
    ctx.fillRect(0, i * s, W, s);
    for (let k = 0; k < 14; k++) { // 木紋
      ctx.strokeStyle = `rgba(40,24,10,${rr(0.05, 0.18)})`;
      ctx.lineWidth = rr(0.5, 2);
      const y = i * s + rr(2, s - 2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + k) * rr(0.5, 2.5));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,12,6,0.7)';
    ctx.fillRect(0, i * s, W, 2);
    ctx.fillRect(rr(0.1, 0.9) * W, i * s, 2, s); // 木板接縫
  }
  if (lines) {
    ctx.strokeStyle = 'rgba(230,200,60,0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, W * 0.5); ctx.lineTo(W, W * 0.5); ctx.stroke();
  }
  blotches(ctx, W, W, 30 * dirt, 20, 90, '30,20,10', 0.05, 0.2);
  grain(ctx, W, W, 18);
  return toTexture(c);
}

export function makeCarpet({ base = 0x4a3a52, pattern = 0x5e4a66, dirt = 1 } = {}) {
  const W = 256;
  const [c, ctx] = canvas(W, W);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = hex(pattern);
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      ctx.beginPath();
      ctx.arc(i * 32 + 16, j * 32 + 16, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  blotches(ctx, W, W, 25 * dirt, 10, 50, '20,16,12', 0.08, 0.3);
  grain(ctx, W, W, 40);
  return toTexture(c);
}

export function makeMarble({ base = 0xcfccc4, vein = 0x8e8a80, n = 2, dirt = 1 } = {}) {
  const W = 512, s = W / n;
  const [c, ctx] = canvas(W, W);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 26; i++) {
    let x = rnd() * W, y = rnd() * W, a = rnd() * 6.28;
    ctx.strokeStyle = `rgba(${rgbOf(vein)},${rr(0.15, 0.5)})`;
    ctx.lineWidth = rr(0.6, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 30; k++) { a += rr(-0.35, 0.35); x += Math.cos(a) * 9; y += Math.sin(a) * 9; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(40,38,34,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke();
  }
  blotches(ctx, W, W, 30 * dirt, 20, 90, '40,32,22', 0.05, 0.2);
  grain(ctx, W, W, 12);
  return toTexture(c);
}

// 天花板:礦纖板格子(n×n),可指定顏色與漏水程度
export function makeCeilingTiles({ base = 0x9a9a90, n = 4, leak = 1 } = {}) {
  const W = 512, s = W / n;
  const [c, ctx] = canvas(W, W);
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = 'rgba(40,40,36,0.8)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,40,36,0.25)';
  for (let i = 0; i < 400; i++) ctx.fillRect(rnd() * W, rnd() * W, 2, 2);
  blotches(ctx, W, W, 14 * leak, 30, 90, '70,52,24', 0.15, 0.4);
  for (let i = 0; i < 2 * leak; i++) { // 掉落的板子露出黑洞
    const k = (rnd() * n) | 0, j = (rnd() * n) | 0;
    ctx.fillStyle = 'rgba(12,12,10,0.92)';
    ctx.fillRect(k * s + 3, j * s + 3, s - 6, s - 6);
  }
  grain(ctx, W, W, 22);
  return toTexture(c);
}

// 招牌/標示:文字畫在畫布上。glow=true 的話文字帶光暈
export function makeLabel(text, { w = 512, h = 128, bg = '#0d1210', fg = '#e8e4d8', border = null, weight = 'bold', size = 0.56, glow = false, sub = null, align = 'center', grime = 1 } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(3, h * 0.05);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  }
  ctx.fillStyle = fg;
  if (glow) { ctx.shadowColor = fg; ctx.shadowBlur = h * 0.15; }
  const fam = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
  let fs = Math.round(h * (sub ? size * 0.8 : size));
  ctx.font = `${weight} ${fs}px ${fam}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const x = align === 'left' ? h * 0.25 : w / 2;
  const tw = ctx.measureText(text).width;
  if (tw > w * 0.9) { fs = Math.round(fs * (w * 0.9) / tw); ctx.font = `${weight} ${fs}px ${fam}`; }
  ctx.fillText(text, x, sub ? h * 0.38 : h * 0.53);
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.8;
    ctx.font = `${Math.round(h * 0.2)}px ${fam}`;
    ctx.fillText(sub, x, h * 0.76);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
  if (grime) blotches(ctx, w, h, 8 * grime, 10, h * 0.5, '20,16,12', 0.05, 0.25);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 夜空窗景:深藍漸層加遠方建築剪影(貼在窗戶後面)
export function makeNightWindow() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a2638');
  g.addColorStop(0.7, '#2a3846');
  g.addColorStop(1, '#384046');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  let x = 0;
  while (x < W) {
    const bw = rr(18, 50), bh = rr(40, 140);
    ctx.fillStyle = '#0c1014';
    ctx.fillRect(x, H - bh, bw, bh);
    for (let k = 0; k < 6; k++) {
      if (rnd() < 0.25) { ctx.fillStyle = 'rgba(200,170,90,0.5)'; ctx.fillRect(x + rr(3, bw - 6), H - rr(10, bh - 6), 3, 4); }
    }
    x += bw + rr(0, 8);
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 書背 / 商品包裝之類的彩色條紋(書架、貨架用)
export function makeSpines({ colors = [0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0x8a7a3a, 0x4a2a4a, 0x6a6a62], n = 24 } = {}) {
  const W = 256, H = 64;
  const [c, ctx] = canvas(W, H);
  let x = 0;
  while (x < W) {
    const w = rr(5, 14);
    const col = colors[(rnd() * colors.length) | 0];
    ctx.fillStyle = hex(col);
    ctx.fillRect(x, rr(0, 10), w, H);
    ctx.fillStyle = 'rgba(230,220,180,0.35)';
    ctx.fillRect(x + 1, rr(18, 30), w - 2, 3);
    x += w + 0.5;
  }
  grain(ctx, W, H, 20);
  return toTexture(c);
}
