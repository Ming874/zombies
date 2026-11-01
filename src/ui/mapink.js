// 地圖的筆墨:字型、墨色、可重現的亂數,以及手寫字、手繪線(鉛筆/原子筆)、印章。
// 全部畫在 2D canvas 上;同一個 seed 每次畫出來都一樣(快取重建時記號不會跳動)。

export const FONT = {
  sans: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif', // 印刷黑體(房名)
  serif: '"Noto Serif TC", "Source Han Serif TC", "PMingLiU", "MingLiU", serif', // 印刷明體(圖名)
  cad: '"Bahnschrift", "Arial Narrow", "Roboto Condensed", sans-serif', // 數字、比例尺、圖號
  hand: '"DFKai-SB", "BiauKai", "標楷體", "KaiTi", "STKaiti", "Kaiti TC", serif', // 手寫(和紙條、牆上的字同一套)
};

// 墨色:只有碳粉、鉛筆、原子筆、印泥。a = 不透明度
export const INK = {
  toner: (a = 1) => `rgba(28,25,22,${a})`, // 影印碳粉
  pencil: (a = 1) => `rgba(58,58,64,${a})`, // 鉛筆(石墨)
  red: (a = 1) => `rgba(176,30,24,${a})`, // 新的紅筆(玩家的醫療記號)
  oldRed: (a = 1) => `rgba(146,52,40,${a})`, // 2003 年的紅原子筆,褪成磚紅
  blue: (a = 1) => `rgba(30,48,118,${a})`, // 藍原子筆(2026 年的家屬)
  violet: (a = 1) => `rgba(86,52,124,${a})`, // 日期章的紫色印泥
};

export function rng(seed) { // mulberry32
  let s = seed >>> 0 || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.r = (a, b) => a + (b - a) * f();
  return f;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// 鉛筆筆觸的石墨顆粒(小圖樣,重複鋪;只做一次)
let GRAIN = null;
function grain(x) {
  if (GRAIN) return x.createPattern(GRAIN, 'repeat');
  GRAIN = canvas(64, 64);
  const g = GRAIN.getContext('2d'), d = g.createImageData(64, 64), R = rng(911);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 58; d.data[i + 1] = 58; d.data[i + 2] = 64; d.data[i + 3] = R() < 0.62 ? 120 + R() * 135 : R() * 60; }
  g.putImageData(d, 0, 0);
  return x.createPattern(GRAIN, 'repeat');
}

// 手抖的線:每 ~9px 一個點,垂直方向用兩個低頻正弦偏移(看起來是手畫的,不是鋸齒)
export function wob(x0, y0, x1, y1, amp = 1, seed = 1) {
  const R = rng(seed), L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(L / 9));
  const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1), p1 = R() * 6.28, p2 = R() * 6.28, f1 = R.r(0.6, 1.4), f2 = R.r(2, 3.5);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = amp * (Math.sin(t * Math.PI * f1 + p1) * 0.7 + Math.sin(t * Math.PI * f2 + p2) * 0.3) * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.2));
    pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]);
  }
  return pts;
}

// 手畫的圈:轉一圈多一點、半徑起伏、頭尾不對齊
export function loop(cx, cy, rx, ry, seed = 1, turns = 1.12) {
  const R = rng(seed), a0 = R() * 6.28, n = Math.ceil(44 * turns), k1 = R.r(-0.07, 0.07), ph = R() * 6.28, drift = R.r(0.03, 0.08), tilt = R.r(-0.12, 0.12);
  const pts = [], c = Math.cos(tilt), s = Math.sin(tilt);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * Math.PI * 2, rr = 1 + k1 * Math.sin(a * 2 + ph) + 0.025 * Math.sin(a * 5 + ph * 2) + t * drift;
    const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
    pts.push([cx + ex * c - ey * s, cy + ex * s + ey * c]);
  }
  return pts;
}

// 畫一條手繪線。o.pen = 原子筆(單一筆畫、壓力起伏);預設鉛筆(兩遍石墨顆粒)
export function stroke(x, pts, o = {}) {
  if (pts.length < 2) return;
  const R = rng(o.seed ?? 7), w = o.w ?? 1.3;
  x.save();
  x.lineCap = 'round'; x.lineJoin = 'round';
  const path = (dx, dy) => { x.beginPath(); x.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + dx, pts[i][1] + dy); };
  if (o.pen) {
    const col = o.color || INK.blue;
    x.strokeStyle = col(o.alpha ?? 0.85); x.lineWidth = w; path(0, 0); x.stroke();
    // 原子筆在起筆/轉折處比較濃
    x.strokeStyle = col((o.alpha ?? 0.85) * 0.35); x.lineWidth = w * 0.6; path(0.35, 0.25); x.stroke();
  } else {
    const col = o.color || INK.pencil;
    for (let p = 0; p < 2; p++) {
      x.globalAlpha = (o.alpha ?? 0.8) * (p ? 0.55 : 0.8);
      x.strokeStyle = p ? col(1) : grain(x);
      x.lineWidth = w * (p ? 0.55 : 1);
      path(p ? R.r(-0.4, 0.4) : 0, p ? R.r(-0.4, 0.4) : 0);
      x.stroke();
    }
  }
  x.restore();
}

// 手寫字:逐字微旋轉、大小與基線抖動、間距不均。align:'center' | 'left' | 'right';回傳寬度
export function hand(x, str, x0, y0, size, color, o = {}) {
  const R = rng(o.seed ?? hashStr(str)), font = o.font || FONT.hand, wt = o.weight || 700;
  const chars = [...str];
  x.save();
  x.translate(x0, y0);
  x.rotate(o.rot || 0);
  x.textBaseline = 'middle'; x.textAlign = 'center';
  x.font = `${wt} ${size}px ${font}`;
  const ws = chars.map((ch) => x.measureText(ch).width * (o.track ?? 0.96));
  const total = ws.reduce((a, b) => a + b, 0);
  let cx = o.align === 'left' ? 0 : o.align === 'right' ? -total : -total / 2;
  const a0 = o.alpha ?? 0.9;
  for (let i = 0; i < chars.length; i++) {
    const s = size * (1 + R.r(-0.07, 0.07));
    x.save();
    x.translate(cx + ws[i] / 2, R.r(-0.06, 0.06) * size);
    x.rotate(R.r(-0.07, 0.07));
    x.font = `${wt} ${s.toFixed(1)}px ${font}`;
    x.fillStyle = color(a0 * R.r(0.8, 1));
    x.fillText(chars[i], 0, 0);
    if (o.pencil) { x.globalAlpha = 0.5; x.fillStyle = grain(x); x.fillText(chars[i], 0.4, 0.3); }
    x.restore();
    cx += ws[i] + R.r(-0.04, 0.05) * size;
  }
  x.restore();
  return total;
}

// 印章(日期章/單位章):雙框 + 字,墨色不均(在小畫布上用雜點掏掉一些墨再貼上)
export function stamp(x, cx, cy, lines, o = {}) {
  const R = rng(o.seed ?? 3), col = o.color || INK.violet, size = o.size || 11;
  const w = o.w || 64, h = o.h || (lines.length * size * 1.18 + 10);
  const c = canvas(w + 8, h + 8), g = c.getContext('2d');
  g.translate(4, 4);
  g.strokeStyle = col(1); g.lineWidth = 1.8; g.strokeRect(1, 1, w - 2, h - 2);
  g.lineWidth = 0.8; g.strokeRect(3.5, 3.5, w - 7, h - 7);
  g.fillStyle = col(1); g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => { g.font = `${i === 0 ? 900 : 700} ${i === 0 ? size * 1.15 : size}px ${i === 0 ? FONT.serif : FONT.cad}`; g.fillText(t, w / 2, 5 + size * 0.62 + i * size * 1.18 + (i === 0 ? 0 : 1)); });
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.09; i++) { g.globalAlpha = R.r(0.2, 1); g.fillRect(R() * w, R() * h, R.r(0.6, 2.2), R.r(0.6, 1.6)); }
  // 蓋章時一邊沒壓實
  const side = R() < 0.5 ? 0 : w;
  const grd = g.createLinearGradient(side, 0, w - side, 0);
  grd.addColorStop(0, 'rgba(0,0,0,.65)'); grd.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.globalAlpha = 1; g.fillStyle = grd; g.fillRect(-4, -4, w + 8, h + 8);
  x.save();
  x.translate(cx, cy); x.rotate(o.rot ?? R.r(-0.2, 0.2));
  x.globalAlpha = o.alpha ?? 0.72;
  x.drawImage(c, -w / 2 - 4, -h / 2 - 4);
  x.restore();
}

// 手寫的箭頭(線 + 兩撇箭頭)
export function arrow(x, pts, o = {}) {
  stroke(x, pts, o);
  const n = pts.length, [ax, ay] = pts[n - 1], [bx, by] = pts[Math.max(0, n - 3)];
  const a = Math.atan2(ay - by, ax - bx), L = o.head ?? 8;
  for (const s of [-1, 1]) stroke(x, [[ax, ay], [ax - Math.cos(a + s * 0.5) * L, ay - Math.sin(a + s * 0.5) * L]], { ...o, seed: (o.seed ?? 1) + s * 7 });
}
