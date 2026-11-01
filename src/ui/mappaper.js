import { FONT, INK, rng, canvas, hand, stroke, loop, stamp } from './mapink.js';
import { PX, sym, isHospital } from './mapdraw.js';

// 紙:這疊圖原本整疊貼在 2F 護理站的牆上(四張用長尾夾夾在一起),被整疊撕下來。
// 所以四張共用一個輪廓:左上角被撕掉(膠帶留在牆上)、右上與右下的膠帶還黏著、左下角燒焦;對摺兩次的摺痕也一樣。
// 每張自己的汙漬(咖啡杯印、水漬、指紋)在合成時畫,用 multiply 疊在墨上。
const T = INK.toner;

export function sheetGeom(L) {
  const pw = L.W * PX, ph = L.H * PX, ox = 46, oy = 46, gap = 18, sw = 340;
  return { W: ox + pw + gap + sw + 30, H: oy + ph + 46, ox, oy, pw, ph, sx: ox + pw + gap, sw };
}

// 撕過、燒過的紙邊(順時針;y 向下)。回傳點列與燒焦邊那一段的點(給焦痕用)
export function tornOutline(G, seed = 2003) {
  const R = rng(seed), { W, H } = G, pts = [];
  const tl = [96, 78], bl = [112, 94];
  const edge = (ax, ay, bx, by, j = 2, step = 11, nickP = 0.025) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / step)), nx = -(by - ay) / len, ny = (bx - ax) / len;
    let nick = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if (!nick && R() < nickP) nick = Math.ceil(R.r(1, 3));
      const d = R.r(0, j) + (nick ? R.r(4, 11) : 0);
      if (nick) nick--;
      pts.push([ax + (bx - ax) * t + nx * d + R.r(-1, 1) * (step * 0.2), ay + (by - ay) * t + ny * d]);
    }
  };
  // 左上:撕掉的角(不規則、毛邊)
  const rip = (ax, ay, bx, by) => {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const t = i / n, bow = Math.sin(t * Math.PI) * 16;
      pts.push([ax + (bx - ax) * t + bow * 0.7 + R.r(-3.5, 3.5), ay + (by - ay) * t + bow * 0.7 + R.r(-3.5, 3.5)]);
    }
  };
  rip(0, tl[1], tl[0], 0);
  edge(tl[0], 0, W, 0, 1.8);
  edge(W, 0, W, H, 1.8);
  edge(W, H, bl[0], H, 1.8);
  // 左下:燒焦(平滑的波浪弧,往內凹)
  const burn = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26, a = -t * Math.PI / 2, base = bl[0] + (bl[1] - bl[0]) * t;
    const rr = base * (1 + 0.13 * Math.sin(t * 9 + 1.3) + 0.05 * Math.sin(t * 23)) + R.r(-1.2, 1.2);
    const p = [Math.cos(a) * rr, H + Math.sin(a) * rr];
    pts.push(p); burn.push(p);
  }
  edge(0, H - bl[1], 0, tl[1], 2.2, 11, 0.04);
  return { pts, burn, clip: `polygon(${pts.map(([a, b]) => `${a.toFixed(1)}px ${b.toFixed(1)}px`).join(',')})` };
}
function polyPath(pts) { const p = new Path2D(); pts.forEach(([a, b], i) => (i ? p.lineTo(a, b) : p.moveTo(a, b))); p.closePath(); return p; }

// 紙張纖維(重複鋪的小圖樣)
let FIB = null;
function fibers() {
  if (FIB) return FIB;
  FIB = canvas(160, 160);
  const g = FIB.getContext('2d'), R = rng(88);
  const d = g.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = R(); d.data[i] = v < 0.5 ? 255 : 120; d.data[i + 1] = v < 0.5 ? 250 : 95; d.data[i + 2] = v < 0.5 ? 235 : 60; d.data[i + 3] = R() * 22; }
  g.putImageData(d, 0, 0);
  g.lineWidth = 0.6;
  for (let i = 0; i < 40; i++) { const x0 = R() * 160, y0 = R() * 160, a = R() * 6.28, l = R.r(3, 12); g.strokeStyle = R() < 0.5 ? 'rgba(120,95,60,.10)' : 'rgba(255,252,240,.14)'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a + 0.5) * l * 0.6, y0 + Math.sin(a + 0.5) * l * 0.6, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke(); }
  return FIB;
}

export const CREASE = { x: 0.502, y: 0.494 }; // 對摺兩次(四等分)的摺痕位置(比例)

// 紙本身(半解析度,CSS 放大):米黃 → 泛黃的邊、斑駁、纖維、摺痕的亮邊、焦痕外圈
export function paperCanvas(G, sh, seed = 7) {
  const s = 0.5, c = canvas(G.W * s, G.H * s), x = c.getContext('2d'), R = rng(seed);
  x.scale(s, s);
  const path = polyPath(sh.pts);
  x.save(); x.clip(path);
  const g = x.createLinearGradient(0, 0, G.W * 0.3, G.H);
  g.addColorStop(0, '#d9c9a2'); g.addColorStop(0.5, '#e1d4b3'); g.addColorStop(1, '#dccdaa');
  x.fillStyle = g; x.fillRect(0, 0, G.W, G.H);
  for (let i = 0; i < 46; i++) {
    const cx = R() * G.W, cy = R() * G.H, rr = R.r(60, 260), dark = R() < 0.6;
    const grd = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, dark ? `rgba(160,120,60,${R.r(0.03, 0.07)})` : `rgba(250,244,226,${R.r(0.04, 0.09)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
  x.fillStyle = x.createPattern(fibers(), 'repeat'); x.fillRect(0, 0, G.W, G.H);
  // 貼在牆上那幾年:上半部曬得比較黃
  const sun = x.createLinearGradient(0, 0, 0, G.H * 0.5);
  sun.addColorStop(0, 'rgba(176,132,56,.16)'); sun.addColorStop(1, 'rgba(176,132,56,0)');
  x.fillStyle = sun; x.fillRect(0, 0, G.W, G.H);
  // 邊緣泛黃變褐
  x.save(); x.filter = 'blur(16px)'; x.strokeStyle = 'rgba(140,96,40,.55)'; x.lineWidth = 50; x.stroke(path); x.restore();
  x.save(); x.filter = 'blur(3px)'; x.strokeStyle = 'rgba(120,80,35,.45)'; x.lineWidth = 7; x.stroke(path); x.restore();
  // 摺痕的亮邊(紙纖維被壓白)
  const cxp = G.W * CREASE.x, cyp = G.H * CREASE.y;
  x.strokeStyle = 'rgba(250,245,230,.55)'; x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(cxp + 1.6, 0); x.lineTo(cxp + 2.4, G.H); x.moveTo(0, cyp + 1.5); x.lineTo(G.W, cyp + 0.8); x.stroke();
  x.restore();
  return c;
}

// 疊在墨上面的髒汙(半解析度,CSS mix-blend-mode: multiply):摺痕陰影、每一格的微微不平、邊緣的手垢、
// 影印機的碳粉點與滾筒刮痕、燒焦邊、膠帶底下黃掉的膠
export function grimeCanvas(G, sh, seed = 11) {
  const s = 0.5, c = canvas(G.W * s, G.H * s), x = c.getContext('2d'), R = rng(seed);
  x.scale(s, s);
  const path = polyPath(sh.pts);
  x.save(); x.clip(path);
  const cxp = G.W * CREASE.x, cyp = G.H * CREASE.y;
  // 四格各自微微傾斜:靠摺痕那一邊暗一點
  const panel = (x0, y0, x1, y1, gx0, gy0, gx1, gy1, a) => { const grd = x.createLinearGradient(gx0, gy0, gx1, gy1); grd.addColorStop(0, `rgba(105,85,60,${a})`); grd.addColorStop(1, 'rgba(105,85,60,0)'); x.fillStyle = grd; x.fillRect(x0, y0, x1 - x0, y1 - y0); };
  panel(0, 0, cxp, cyp, cxp, 0, cxp - 220, 0, 0.16);
  panel(cxp, 0, G.W, cyp, cxp, cyp, cxp, cyp - 260, 0.13);
  panel(0, cyp, cxp, G.H, 0, cyp, 0, cyp + 200, 0.15);
  panel(cxp, cyp, G.W, G.H, cxp, 0, cxp + 260, 0, 0.12);
  // 摺痕本身
  x.strokeStyle = 'rgba(70,55,40,.55)'; x.lineWidth = 1.3;
  x.beginPath(); x.moveTo(cxp, 0); x.lineTo(cxp + 0.8, G.H); x.moveTo(0, cyp); x.lineTo(G.W, cyp - 0.7); x.stroke();
  x.save(); x.filter = 'blur(4px)'; x.strokeStyle = 'rgba(90,70,50,.32)'; x.lineWidth = 7;
  x.beginPath(); x.moveTo(cxp - 4, 0); x.lineTo(cxp - 3.2, G.H); x.moveTo(0, cyp - 4); x.lineTo(G.W, cyp - 4.7); x.stroke(); x.restore();
  // 邊緣的手垢
  x.save(); x.filter = 'blur(22px)'; x.strokeStyle = 'rgba(110,90,70,.35)'; x.lineWidth = 60; x.stroke(path); x.restore();
  // 影印:碳粉點、滾筒刮痕、左邊蓋板沒壓好的黑邊
  x.fillStyle = 'rgba(30,26,22,.55)';
  for (let i = 0; i < 520; i++) { const r = R() < 0.9 ? R.r(0.5, 1.3) : R.r(1.5, 2.8); x.beginPath(); x.arc(R() * G.W, R() * G.H, r, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(40,36,32,.10)'; x.fillRect(G.W * 0.613, 0, 2, G.H); x.fillRect(G.W * 0.618, 0, 0.8, G.H);
  const lid = x.createLinearGradient(0, 0, 40, 0); lid.addColorStop(0, 'rgba(40,36,30,.35)'); lid.addColorStop(1, 'rgba(40,36,30,0)');
  x.fillStyle = lid; x.fillRect(0, 0, 40, G.H);
  // 燒焦:焦黑邊 + 褐色烤痕(沿著燒掉的那一段)
  const bp = new Path2D(); sh.burn.forEach(([a, b], i) => (i ? bp.lineTo(a, b) : bp.moveTo(a, b)));
  x.save(); x.filter = 'blur(14px)'; x.strokeStyle = 'rgba(120,70,25,.7)'; x.lineWidth = 64; x.stroke(bp); x.restore();
  x.save(); x.filter = 'blur(5px)'; x.strokeStyle = 'rgba(55,30,12,.85)'; x.lineWidth = 18; x.stroke(bp); x.restore();
  x.save(); x.filter = 'blur(1px)'; x.strokeStyle = 'rgba(20,12,6,.95)'; x.lineWidth = 5; x.stroke(bp); x.restore();
  // 膠帶底下黃掉的膠(右上、右下)
  for (const [tx, ty, a] of TAPES(G)) {
    x.save(); x.translate(tx, ty); x.rotate(a); x.filter = 'blur(2px)'; x.fillStyle = 'rgba(190,140,50,.28)'; x.fillRect(-58, -17, 116, 34); x.restore();
  }
  x.restore();
  return c;
}

// 膠帶(在 DOM 上另外畫,會凸出紙邊;這裡只給位置):[中心 x, 中心 y, 角度]
export const TAPES = (G) => [[G.W - 26, 30, 0.72], [G.W - 30, G.H - 28, -0.7], [36, G.H * 0.47, -1.48]];

// 每張自己的汙漬(合成時用 multiply 畫在墨上;全解析度)
export function stains(x, G, li) {
  const R = rng(500 + li * 31), { ox, oy } = G;
  x.save();
  x.globalCompositeOperation = 'multiply';
  const ring = (cx, cy, r, a) => { // 咖啡杯印:不均勻的環 + 半個錯開的第二圈 + 一點點滴落
    for (let k = 0; k < 2; k++) {
      const r2 = r * (k ? 0.96 : 1), a0 = R() * 6.28, sweep = k ? R.r(2, 3.6) : 6.4, dx = k ? R.r(-8, 8) : 0, dy = k ? R.r(-6, 6) : 0;
      for (let i = 0; i < 60; i++) {
        const t0 = a0 + (i / 60) * sweep, t1 = a0 + ((i + 1) / 60) * sweep, w = R.r(1.2, 3.6) * (k ? 0.7 : 1);
        x.strokeStyle = `rgba(122,78,36,${(a * R.r(0.6, 1)).toFixed(3)})`; x.lineWidth = w;
        x.beginPath(); x.arc(cx + dx, cy + dy, r2, t0, t1); x.stroke();
      }
    }
    const grd = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r); grd.addColorStop(0, `rgba(160,110,60,${a * 0.18})`); grd.addColorStop(1, `rgba(150,100,55,${a * 0.32})`);
    x.fillStyle = grd; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  };
  const water = (cx, cy, r, a) => { // 水漬:不規則的一塊 + 深色潮線
    const pts = [], n = 40, ph = R() * 6.28;
    for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2, rr = r * (1 + 0.22 * Math.sin(t * 3 + ph) + 0.1 * Math.sin(t * 7 + ph * 2) + R.r(-0.04, 0.04)); pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.8]); }
    const p = new Path2D(); pts.forEach(([a2, b], i) => (i ? p.lineTo(a2, b) : p.moveTo(a2, b))); p.closePath();
    x.fillStyle = `rgba(185,150,95,${a * 0.22})`; x.fill(p);
    x.save(); x.filter = 'blur(1.5px)'; x.strokeStyle = `rgba(140,100,50,${a * 0.6})`; x.lineWidth = 3; x.stroke(p);
    x.translate(cx * 0.08, cy * 0.08); x.scale(0.92, 0.92); x.strokeStyle = `rgba(150,110,60,${a * 0.3})`; x.lineWidth = 2; x.stroke(p); x.restore();
  };
  const smudge = (cx, cy, len, ang, a) => { // 手指抹過的碳粉
    x.save(); x.translate(cx, cy); x.rotate(ang); x.filter = 'blur(5px)';
    const grd = x.createLinearGradient(0, 0, len, 0); grd.addColorStop(0, `rgba(60,55,50,${a})`); grd.addColorStop(1, 'rgba(60,55,50,0)');
    x.fillStyle = grd; x.beginPath(); x.ellipse(len / 2, 0, len / 2, 9, 0, 0, 7); x.fill(); x.restore();
  };
  const print = (cx, cy, s, ang, col) => { // 指紋:同心橢圓的指紋線
    x.save(); x.translate(cx, cy); x.rotate(ang); x.lineWidth = 0.9;
    for (let k = 1; k < 9; k++) { x.strokeStyle = col(R.r(0.15, 0.32)); x.beginPath(); x.ellipse(R.r(-0.6, 0.6), k * 0.4, k * s * 0.11, k * s * 0.15, 0, R.r(0, 0.6), Math.PI * 2 - R.r(0, 0.8)); x.stroke(); }
    x.restore();
  };
  if (li === 0) { water(ox + 300, oy + 830, 150, 1); smudge(ox + 820, oy + 420, 120, 0.3, 0.12); }
  else if (li === 1) { ring(ox + 1010, oy + 905, 50, 0.55); smudge(ox + 560, oy + 640, 140, -0.2, 0.1); print(G.sx + 300, oy + 600, 22, 0.5, (a) => `rgba(110,40,30,${a})`); }
  else if (li === 2) { water(ox + 1080, oy + 70, 110, 0.9); ring(ox + 420, oy + 820, 46, 0.5); smudge(ox + 260, oy + 260, 100, 0.8, 0.1); }
  else { ring(ox + 230, oy + 800, 52, 0.5); smudge(ox + 900, oy + 700, 130, 2.6, 0.1); print(G.sx + 40, oy + 940, 20, -0.4, (a) => `rgba(60,55,50,${a})`); }
  x.restore();
}

// 摺痕上的墨被磨掉(合成時在墨層掏掉)
export function creaseWear(x, G) {
  const R = rng(19), cxp = G.W * CREASE.x, cyp = G.H * CREASE.y;
  x.save(); x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const v = R() < 0.5, t = R();
    const px = v ? cxp + R.r(-2.4, 2.4) + t * 0.8 : t * G.W, py = v ? t * G.H : cyp + R.r(-2.4, 2.4) - t * 0.7;
    x.globalAlpha = R.r(0.25, 0.9); x.fillRect(px, py, R.r(0.6, 2.2), R.r(0.6, 2.2));
  }
  x.restore();
}

// ---------------------------------------------------------------------
// 圖框、標題欄、圖例、注意事項、指北針、比例尺(印刷的部分 + 圖例下面的鉛筆補充)
export function drawFrame(x, G, L, li, o = {}) {
  const { W, H, ox, oy, pw, ph, sx, sw } = G, lv = L.levels[li], hosp = isHospital(L);
  x.save();
  x.strokeStyle = T(0.9); x.lineWidth = 2.2; x.strokeRect(22, 22, W - 44, H - 44);
  x.lineWidth = 0.7; x.strokeRect(28, 28, W - 56, H - 56);
  x.lineWidth = 1.4; x.beginPath(); x.moveTo(sx - 8, 28); x.lineTo(sx - 8, H - 28); x.stroke();
  // 格線座標(上:1~6,左:A~E;每 10 格)
  x.font = `700 10px ${FONT.cad}`; x.fillStyle = T(0.75); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 0.7;
  for (let i = 0; i <= L.W; i += 10) { const px2 = ox + i * PX; x.beginPath(); x.moveTo(px2, 28); x.lineTo(px2, 38); x.moveTo(px2, H - 28); x.lineTo(px2, H - 38); x.stroke(); if (i < L.W) { x.fillText(String(i / 10 + 1), px2 + 5 * PX, 37); x.fillText(String(i / 10 + 1), px2 + 5 * PX, H - 37); } }
  for (let j = 0; j <= L.H; j += 10) { const py = oy + j * PX; x.beginPath(); x.moveTo(28, py); x.lineTo(38, py); x.stroke(); if (j < L.H) x.fillText('ABCDEFGH'[j / 10], 36, py + 5 * PX); }
  // ---- 標題 ----
  let y = 50;
  const cx = sx + sw / 2;
  // 院徽:心 + 十字
  x.save(); x.translate(sx + 24, y + 16); x.strokeStyle = T(0.9); x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(0, 12); x.bezierCurveTo(-16, 0, -10, -13, 0, -5); x.bezierCurveTo(10, -13, 16, 0, 0, 12); x.stroke();
  x.beginPath(); x.moveTo(0, -16); x.lineTo(0, 2); x.moveTo(-5, -11); x.lineTo(5, -11); x.stroke(); x.restore();
  x.textAlign = 'left'; x.fillStyle = T(0.92);
  x.font = `700 17px ${FONT.serif}`; x.fillText(hosp ? '天主教聖心醫院' : '平面配置圖', sx + 48, y + 10);
  x.font = `600 9px ${FONT.cad}`; x.fillStyle = T(0.7); x.fillText(hosp ? 'SACRED HEART HOSPITAL · 霧港市舊港區' : '', sx + 49, y + 27);
  y += 46;
  x.textAlign = 'center'; x.fillStyle = T(0.95); x.font = `900 29px ${FONT.serif}`; x.fillText('避難逃生路線圖', cx, y + 14);
  x.font = `600 9px ${FONT.cad}`; x.fillStyle = T(0.7); x.fillText('E V A C U A T I O N   R O U T E   P L A N', cx, y + 36);
  y += 50;
  x.strokeStyle = T(0.9); x.lineWidth = 1; x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + sw, y); x.stroke();
  // 樓層
  x.textAlign = 'left'; x.fillStyle = T(0.95); x.font = `700 66px ${FONT.cad}`; x.fillText(lv.id, sx + 6, y + 44);
  x.font = `700 16px ${FONT.sans}`; x.fillText(`${lv.name}平面配置圖`, sx + 128, y + 30);
  x.font = `600 12px ${FONT.cad}`; x.fillStyle = T(0.8); x.fillText('S = 1/200    單位:M', sx + 128, y + 54);
  y += 84;
  x.strokeStyle = T(0.9); x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + sw, y); x.stroke();
  // 指北針 + 比例尺
  y += 8;
  x.save(); x.translate(sx + 36, y + 36); x.strokeStyle = T(0.9); x.lineWidth = 1;
  x.beginPath(); x.arc(0, 0, 25, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 21, 0, 7); x.lineWidth = 0.5; x.stroke();
  x.beginPath(); x.moveTo(0, -24); x.lineTo(7, 10); x.lineTo(0, 4); x.closePath(); x.fillStyle = T(0.92); x.fill();
  x.beginPath(); x.moveTo(0, -24); x.lineTo(-7, 10); x.lineTo(0, 4); x.closePath(); x.lineWidth = 0.9; x.stroke();
  x.font = `700 12px ${FONT.cad}`; x.textAlign = 'center'; x.fillText('N', 0, -33 + 2); x.restore();
  const bx = sx + 92, by = y + 40, seg = PX; // 1 格 = 2m
  x.lineWidth = 0.9; x.strokeStyle = T(0.9);
  for (let i = 0; i < 5; i++) { x.strokeRect(bx + i * seg, by, seg, 6); if (i % 2 === 0) { x.fillStyle = T(0.9); x.fillRect(bx + i * seg, by, seg, 6); } }
  x.strokeRect(bx + 5 * seg, by, seg * 5, 6);
  x.font = `600 9px ${FONT.cad}`; x.fillStyle = T(0.85); x.textAlign = 'center';
  for (const [k, t] of [[0, '0'], [1, '2'], [2, '4'], [5, '10'], [10, '20M']]) x.fillText(t, bx + k * seg, by - 7);
  x.font = `600 9px ${FONT.sans}`; x.fillText('比例尺', bx + 5 * seg, by + 17);
  y += 82;
  x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + sw, y); x.stroke();
  // ---- 圖例 ----
  y += 18;
  x.font = `700 15px ${FONT.sans}`; x.fillStyle = T(0.95); x.textAlign = 'left'; x.fillText('圖  例', sx + 6, y);
  x.font = `600 9px ${FONT.cad}`; x.fillStyle = T(0.6); x.fillText('LEGEND', sx + 52, y + 1);
  y += 20;
  const row = (draw, t, sub) => {
    draw(sx + 22, y);
    x.font = `600 12.5px ${FONT.sans}`; x.fillStyle = T(0.92); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(t, sx + 46, y);
    if (sub) { x.font = `700 10.5px ${FONT.sans}`; x.fillStyle = T(0.95); x.fillText(sub, sx + 46 + x.measureText(t).width + 26, y); }
    y += 21;
  };
  row((a, b) => sym(x, 'here', a, b, 14), '您現在位置');
  row((a, b) => sym(x, 'ext', a, b, 13), '滅火器');
  row((a, b) => sym(x, 'hyd', a, b, 13), '室內消防栓');
  row((a, b) => sym(x, 'light', a, b, 12), '緊急照明燈');
  row((a, b) => sym(x, 'evac', a, b, 18), '避難方向');
  row((a, b) => sym(x, 'exit', a, b, 13), '出口標示燈');
  row((a, b) => { x.strokeStyle = T(0.85); x.lineWidth = 0.7; x.strokeRect(a - 11, b - 7, 22, 14); for (let k = -7; k <= 7; k += 3.5) { x.beginPath(); x.moveTo(a + k, b - 7); x.lineTo(a + k, b + 7); x.stroke(); } x.beginPath(); x.moveTo(a - 9, b); x.lineTo(a + 8, b); x.lineTo(a + 4, b - 3); x.moveTo(a + 8, b); x.lineTo(a + 4, b + 3); x.lineWidth = 1.1; x.stroke(); }, '樓梯(上/下)');
  row((a, b) => { x.strokeStyle = T(0.9); x.lineWidth = 0.9; x.strokeRect(a - 9, b - 8, 18, 16); x.beginPath(); x.moveTo(a - 9, b - 8); x.lineTo(a + 9, b + 8); x.moveTo(a + 9, b - 8); x.lineTo(a - 9, b + 8); x.stroke(); }, '電梯', '※火災時請勿搭乘電梯');
  row((a, b) => { x.strokeStyle = T(0.9); x.lineWidth = 0.9; x.beginPath(); x.moveTo(a - 12, b - 4); x.lineTo(a + 12, b - 4); x.moveTo(a - 12, b + 4); x.lineTo(a + 12, b + 4); x.moveTo(a - 12, b - 4); x.lineTo(a - 12, b + 4); x.moveTo(a + 12, b - 4); x.lineTo(a + 12, b + 4); x.stroke(); x.lineWidth = 0.5; x.beginPath(); x.moveTo(a - 12, b - 1); x.lineTo(a + 12, b - 1); x.moveTo(a - 12, b + 1); x.lineTo(a + 12, b + 1); x.stroke(); }, '窗');
  row((a, b) => { x.strokeStyle = T(0.9); x.lineWidth = 1.1; x.beginPath(); x.moveTo(a - 10, b + 6); x.lineTo(a - 10, b - 6); x.stroke(); x.lineWidth = 0.6; x.beginPath(); x.arc(a - 10, b + 6, 12, -Math.PI / 2, 0); x.stroke(); x.fillStyle = T(0.3); x.fillRect(a - 14, b + 5, 4, 3); x.fillRect(a + 2, b + 5, 6, 3); }, '門');
  // 鉛筆補充(玩家自己記的):紅圖釘、彈藥櫃、醫療櫃、補給站、上鎖、隊友
  y += 2;
  stroke(x, [[sx + 6, y - 6], [sx + sw - 20, y - 8]], { w: 1, alpha: 0.6, seed: 4 });
  y += 8;
  const prow = (draw, t) => { draw(sx + 22, y); hand(x, t, sx + 44, y + 1, 14, INK.pencil, { align: 'left', seed: t.length * 13 + y, pencil: true, alpha: 0.85 }); y += 22; };
  prow((a, b) => pinGlyph(x, a, b, '#b8241c'), '= 我在這裡');
  if (o.team) prow((a, b) => pinGlyph(x, a, b, '#2f5fa8'), '= 隊友');
  prow((a, b) => { stroke(x, loop(a, b, 9, 7, 3), { w: 1.2 }); hand(x, '彈', a, b + 0.5, 10, INK.pencil, { seed: 5 }); }, '= 彈藥櫃');
  prow((a, b) => { stroke(x, loop(a, b, 9, 7, 6), { w: 1.2, pen: true, color: INK.red, alpha: 0.85 }); stroke(x, [[a - 4, b], [a + 4, b]], { pen: true, color: INK.red, w: 1.6 }); stroke(x, [[a, b - 4], [a, b + 4]], { pen: true, color: INK.red, w: 1.6, seed: 9 }); }, '= 醫療櫃');
  prow((a, b) => { stroke(x, [[a - 10, b - 7], [a + 10, b - 8], [a + 11, b + 7], [a - 10, b + 8], [a - 10, b - 8]], { w: 1.2 }); hand(x, '補', a, b + 0.5, 10, INK.pencil, { seed: 8 }); }, '= 補給站(金水伯)');
  prow((a, b) => sealGlyph(x, a, b, 0.6, false), '= 鎖住了');
  // ---- 注意事項 ----
  y = Math.max(y + 4, 708);
  x.strokeStyle = T(0.9); x.lineWidth = 1; x.beginPath(); x.moveTo(sx, y); x.lineTo(sx + sw, y); x.stroke();
  y += 16;
  x.font = `700 12px ${FONT.sans}`; x.fillStyle = T(0.92); x.textAlign = 'left'; x.fillText('注意事項', sx + 6, y);
  x.font = `500 10.5px ${FONT.sans}`; x.fillStyle = T(0.85);
  const notes = ['一、發現火災,請按火警發信機並通知保全室(分機 302)。', '二、請依避難方向指示,由樓梯疏散至室外空地。', '三、火災時請勿搭乘電梯。', '四、安全門保持關閉,走廊及樓梯間不得堆放物品。'];
  for (const n of notes) { y += 16; x.fillText(n, sx + 8, y); }
  // ---- 標題欄 ----
  const ty = H - 28 - 214;
  x.strokeStyle = T(0.9); x.lineWidth = 1.2; x.strokeRect(sx - 8, ty, sw + 8 + 2, 214);
  const rows = [
    ['工程名稱', hosp ? '天主教聖心醫院 院舍新建工程' : '院舍工程'],
    ['圖　　名', `${lv.id} ${lv.name}平面配置圖(避難逃生)`],
    ['比　　例', '1/200', '圖　號', `A-10${li}`],
    ['原 設 計', '1962.03', '張　次', `${li + 1} / ${L.levels.length}`],
    ['修　　訂', '△1  1987.06  急診車道增建'],
    ['', '△2  2003.04  SARS 防疫分區(暫行)'],
    ['繪　　圖', '工務課', '核　定', '院長室'],
  ];
  const rh = 214 / rows.length;
  x.lineWidth = 0.6;
  rows.forEach((r, i) => {
    const yy = ty + i * rh;
    if (i) { x.beginPath(); x.moveTo(sx - 8, yy); x.lineTo(sx + sw + 2, yy); if (i === 5) x.setLineDash([2, 2]); x.stroke(); x.setLineDash([]); }
    x.beginPath(); x.moveTo(sx + 60, yy); x.lineTo(sx + 60, yy + rh); x.stroke();
    x.font = `600 10px ${FONT.sans}`; x.fillStyle = T(0.75); x.textAlign = 'left'; x.fillText(r[0], sx - 2, yy + rh / 2);
    x.font = `700 11.5px ${FONT.sans}`; x.fillStyle = T(0.93); x.fillText(r[1], sx + 68, yy + rh / 2);
    if (r[2]) { x.beginPath(); x.moveTo(sx + 170, yy); x.lineTo(sx + 170, yy + rh); x.moveTo(sx + 222, yy); x.lineTo(sx + 222, yy + rh); x.stroke(); x.font = `600 10px ${FONT.sans}`; x.fillStyle = T(0.75); x.fillText(r[2], sx + 176, yy + rh / 2); x.font = `700 12px ${FONT.cad}`; x.fillStyle = T(0.93); x.fillText(r[3], sx + 230, yy + rh / 2); }
  });
  // 工務課的審訖章(紅印泥,褪色)
  if (hosp) {
    x.save(); x.translate(sx + sw - 46, ty + rh * 6.2); x.rotate(-0.2); x.globalAlpha = 0.55;
    x.strokeStyle = INK.oldRed(0.9); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 25, 0, 7); x.stroke(); x.lineWidth = 0.8; x.beginPath(); x.arc(0, 0, 21, 0, 7); x.stroke();
    x.fillStyle = INK.oldRed(0.95); x.font = `900 11px ${FONT.serif}`; x.textAlign = 'center'; x.fillText('聖心醫院', 0, -7); x.font = `900 13px ${FONT.serif}`; x.fillText('審 訖', 0, 9);
    x.restore();
  }
  x.restore();
}

// 圖例與圖面共用的小圖:圖釘(俯視)、封條
export function pinGlyph(x, cx, cy, col) {
  x.save();
  x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(cx + 3, cy + 3, 6, 5, 0, 0, 7); x.fill();
  const g = x.createRadialGradient(cx - 2, cy - 2, 0.5, cx, cy, 7);
  g.addColorStop(0, '#fff2ea'); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(40,10,8,.95)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 6.5, 0, 7); x.fill();
  x.restore();
}
export function sealGlyph(x, cx, cy, ang, torn) { // 封條:白紙條、紅框、紅色「封」字;撕開時斷成兩截
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const part = (dx, w) => { x.fillStyle = 'rgba(244,238,224,.95)'; x.fillRect(dx - w / 2, -6, w, 12); x.strokeStyle = INK.red(0.8); x.lineWidth = 0.8; x.strokeRect(dx - w / 2 + 1.5, -4.5, w - 3, 9); };
  if (torn) { part(-11, 16); part(12, 14); } else { part(0, 34); x.fillStyle = INK.red(0.9); x.font = `900 10px ${FONT.serif}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('封', 0, 0.5); }
  x.restore();
}
export { stamp };
