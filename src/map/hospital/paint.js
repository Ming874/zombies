// 程式貼圖的繪圖工具(Canvas 2D / OffscreenCanvas;不依賴 three,可在 Worker 中執行)。所有隨機都走可重現的亂數。
// 慣例:貼圖畫布的 y 往下;CanvasTexture 預設 flipY,所以畫布底部 = 貼圖 v=0 = 牆腳。
export function prng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.r = (lo, hi) => lo + f() * (hi - lo);
  f.i = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[(f() * arr.length) | 0];
  f.chance = (p) => f() < p;
  return f;
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function mkCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
// 一張貼圖的工作畫布:x = 顏色、hx = 高度(灰階,給 bumpMap)
export function sheet(w, h, base = '#808080', height = true) {
  const c = mkCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  let hc = null, hx = null;
  if (height) { hc = mkCanvas(w, h); hx = hc.getContext('2d'); hx.fillStyle = '#808080'; hx.fillRect(0, 0, w, h); }
  return { c, x, hc, hx, w, h };
}

export const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
export function hexToRgb(hex) {
  const n = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, k, dr = 0, dg = 0, db = 0) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(Math.max(0, Math.min(255, r * k + dr)), Math.max(0, Math.min(255, g * k + dg)), Math.max(0, Math.min(255, b * k + db)));
}

// 平滑雜訊(小畫布放大 + 雙線性內插;邊緣包覆,可無縫平鋪)
export function noise(x, w, h, R, cells, alpha, lo = [0, 0, 0], hi = [255, 255, 255], cellsY = cells) {
  const n = cells, m = cellsY;
  const s = mkCanvas(n + 2, m + 2), sx = s.getContext('2d');
  const img = sx.createImageData(n + 2, m + 2);
  const vals = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) vals.push(R());
  for (let j = 0; j < m + 2; j++) for (let i = 0; i < n + 2; i++) {
    const v = vals[((j - 1 + m) % m) * n + ((i - 1 + n) % n)];
    const o = (j * (n + 2) + i) * 4;
    img.data[o] = lo[0] + (hi[0] - lo[0]) * v; img.data[o + 1] = lo[1] + (hi[1] - lo[1]) * v; img.data[o + 2] = lo[2] + (hi[2] - lo[2]) * v;
    img.data[o + 3] = 255;
  }
  sx.putImageData(img, 0, 0);
  x.save();
  x.globalAlpha = alpha;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(s, 0, 0, n + 2, m + 2, -w / n, -h / m, w * (n + 2) / n, h * (m + 2) / m);
  x.restore();
}
// 多層雜訊(大塊 + 中 + 細)
export function mottle(x, w, h, R, alpha = 0.12, lo = [0, 0, 0], hi = [255, 255, 255]) {
  noise(x, w, h, R, 4, alpha, lo, hi);
  noise(x, w, h, R, 9, alpha * 0.8, lo, hi);
  noise(x, w, h, R, 24, alpha * 0.5, lo, hi);
}
// 逐像素顆粒(亮度隨機)
export function grain(x, w, h, R, amount, mono = true) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amount;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += n; d[i + 1] += (R() - 0.5) * amount; d[i + 2] += (R() - 0.5) * amount; }
  }
  x.putImageData(img, 0, 0);
}
// 在 (cx,cy) 畫一個東西;若靠近邊緣也在對邊畫一份(無縫)
export function wrap(w, h, cx, cy, r, fn, wrapY = true) {
  for (const ox of [-w, 0, w]) for (const oy of wrapY ? [-h, 0, h] : [0]) {
    const px = cx + ox, py = cy + oy;
    if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
    fn(px, py);
  }
}
export function blob(x, cx, cy, r, color, alpha) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color.replace(/[\d.]+\)$/, `${alpha})`));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
export function blobs(x, w, h, R, n, rMin, rMax, color, aMin, aMax, wrapY = true, yMin = 0, yMax = h) {
  for (let i = 0; i < n; i++) {
    const cx = R() * w, cy = yMin + R() * (yMax - yMin), r = R.r(rMin, rMax), a = R.r(aMin, aMax);
    wrap(w, h, cx, cy, r, (px, py) => blob(x, px, py, r, color, a), wrapY);
  }
}
// 水漬:邊緣比較深的潮痕
export function tideMark(x, cx, cy, rx, ry, R, col = [92, 70, 40]) {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, rgb(...col, 0.05));
  g.addColorStop(0.75, rgb(...col, 0.12));
  g.addColorStop(0.93, rgb(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.32));
  g.addColorStop(1, rgb(...col, 0));
  x.fillStyle = g;
  x.beginPath();
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2, rad = rx * R.r(0.8, 1.05);
    x.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  x.fill();
  x.restore();
}
// 由上往下的垂流痕:上寬下窄、略為左右擺動(重力流下的水/鏽/髒污),末端有一點水漬停住的深色;
// 亂數呼叫次數與舊版相同(不影響同一張貼圖後面的內容),擺動用由位置導出的相位
export function drips(x, w, R, n, yTop, lenMin, lenMax, col = [40, 34, 24], aMax = 0.25, wMax = 4) {
  for (let i = 0; i < n; i++) {
    const px = R() * w, y0 = yTop + R.r(-4, 20), l = R.r(lenMin, lenMax), ww = R.r(1, wMax), a0 = R.r(0.08, aMax);
    const ph = (px * 12.9898 + l * 78.233) % 6.283, amp = Math.min(3, ww * 0.6) * (0.4 + 0.6 * ((ph * 7.31) % 1));
    const g = x.createLinearGradient(0, y0, 0, y0 + l);
    g.addColorStop(0, rgb(...col, a0)); g.addColorStop(0.55, rgb(...col, a0 * 0.6)); g.addColorStop(0.92, rgb(...col, a0 * 0.25)); g.addColorStop(1, rgb(...col, 0));
    x.fillStyle = g;
    const N = Math.max(4, Math.ceil(l / 24)), xs = (t) => Math.sin(t * 5.1 + ph) * amp * t, wd = (t) => ww * (1.15 - 0.75 * t);
    wrap(w, 1e9, px, 0, ww + amp, (qx) => {
      x.beginPath();
      for (let k = 0; k <= N; k++) { const t = k / N; x.lineTo(qx + xs(t) - wd(t) / 2, y0 + t * l); }
      for (let k = N; k >= 0; k--) { const t = k / N; x.lineTo(qx + xs(t) + wd(t) / 2, y0 + t * l); }
      x.closePath(); x.fill();
      if (l > 60) { x.fillStyle = rgb(...col, a0 * 0.35); x.beginPath(); x.ellipse(qx + xs(0.97), y0 + l * 0.97, ww * 0.55, ww * 0.9, 0, 0, 6.29); x.fill(); x.fillStyle = g; }
    }, false);
  }
}
// 不規則多邊形
export function jagged(x, cx, cy, r, R, n = 11, sq = 0.8) {
  x.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, rad = r * R.r(0.5, 1.15);
    x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * sq);
  }
  x.closePath();
}
// 油漆剝落(露出底層),高度圖:底層較低、翻起的邊較高
export function peel(s, R, n, rMin, rMax, under, yMin = 0, yMax = s.h, wrapY = false) {
  const { x, hx, w, h } = s;
  for (let i = 0; i < n; i++) {
    const cx = R() * w, cy = yMin + R() * (yMax - yMin), r = R.r(rMin, rMax);
    const seed = (R() * 1e9) | 0;
    wrap(w, h, cx, cy, r * 1.2, (px, py) => {
      const RR = prng(seed);
      jagged(x, px, py, r, RR);
      x.fillStyle = under;
      x.fill();
      x.strokeStyle = 'rgba(20,16,12,0.45)';
      x.lineWidth = 1.6;
      x.stroke();
      x.save(); x.translate(-1.2, -1.2); x.strokeStyle = 'rgba(255,255,240,0.25)'; x.lineWidth = 1; x.stroke(); x.restore();
      if (hx) {
        const R2 = prng(seed);
        jagged(hx, px, py, r, R2);
        hx.fillStyle = '#5a5a5a'; hx.fill();
        hx.strokeStyle = '#b0b0b0'; hx.lineWidth = 2; hx.stroke();
      }
    }, wrapY);
  }
}
// 裂縫(分岔折線)
export function crack(s, R, x0, y0, len, ang, width = 1.4, col = 'rgba(18,14,10,0.7)', depth = 2) {
  const { x, hx } = s;
  let px = x0, py = y0, a = ang;
  const pts = [[px, py]];
  const steps = Math.max(3, (len / 9) | 0);
  for (let k = 0; k < steps; k++) {
    a += R.r(-0.5, 0.5);
    px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps;
    pts.push([px, py]);
  }
  for (const [ctx, c, lw] of [[x, col, width], [hx, '#303030', width + 0.6]]) {
    if (!ctx) continue;
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([qx, qy], i) => (i ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy))); ctx.stroke();
  }
  if (depth > 0) for (let k = 2; k < pts.length - 1; k += 3) if (R() < 0.45) crack(s, R, pts[k][0], pts[k][1], len * R.r(0.25, 0.5), a + R.r(-1.2, 1.2), width * 0.6, col, depth - 1);
}
// 垂直漸層(牆腳髒污、天花板燻黑)
export function vgrad(x, w, y0, y1, c0, c1) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  x.fillStyle = g;
  x.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
}
// 斑點(霉、碎石、水磨石骨材)
export function speckle(x, w, h, R, n, rMin, rMax, colors, alpha = 1) {
  x.save(); x.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const cx = R() * w, cy = R() * h, r = R.r(rMin, rMax);
    x.fillStyle = colors[(R() * colors.length) | 0];
    wrap(w, h, cx, cy, r, (px, py) => { x.beginPath(); x.ellipse(px, py, r, r * R.r(0.6, 1), R() * 3, 0, Math.PI * 2); x.fill(); });
  }
  x.restore();
}
// 磁磚/方塊格:cols×rows,每格回呼(i,j,px,py,tw,th,T);offset 為交丁(每列位移比例)
// T 是該格固定的亂數(左右邊緣包覆的同一塊磚拿到同一組亂數 → 無縫)
export function grid(s, cols, rows, fn, offset = 0, seed = 7) {
  const tw = s.w / cols, th = s.h / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * offset * tw;
    for (let i = offset ? -1 : 0; i < cols; i++) {
      const ii = ((i % cols) + cols) % cols;
      fn(i, j, i * tw + off, j * th, tw, th, prng((seed * 7919) ^ (j * 131 + ii * 977 + 1)));
    }
  }
}
// 縫線(灰縫):畫在顏色與高度圖
export function groutLines(s, cols, rows, lw, col, offset = 0, hdepth = '#2a2a2a') {
  const { x, hx, w, h } = s;
  const tw = w / cols, th = h / rows;
  for (const [ctx, c] of [[x, col], [hx, hdepth]]) {
    if (!ctx) continue;
    ctx.fillStyle = c;
    for (let j = 0; j <= rows; j++) ctx.fillRect(0, j * th - lw / 2, w, lw);
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * offset * tw;
      for (let i = 0; i <= cols; i++) ctx.fillRect(((i * tw + off) % w + w) % w - lw / 2, j * th, lw, th);
    }
  }
}
// 文字(中文字型備援)
export const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';
export const HAND = '"DFKai-SB", "BiauKai", "KaiTi", "Kaiti TC", "Microsoft JhengHei", serif';
