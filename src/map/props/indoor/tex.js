import * as THREE from 'three';

// 室內道具用的程式貼圖工具(固定種子,每次載入結果一致)。
// 含:可平鋪值雜訊 fbm、畫布輔助(污漬、顆粒、刮痕)、文字繪製。
let seed = 0x5eed1026;
export const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const rr = (a, b) => a + rnd() * (b - a);
export const reseed = (s) => { seed = s >>> 0; };
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const hex3 = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const css = (h, a = 1) => { const [r, g, b] = hex3(h); return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`; };
export const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// 可平鋪值雜訊 fbm(cx/cy 為最粗一層的格數)→ Float32Array(0..1)
export function fbm(W, H, cx, cy, oct = 4, gain = 0.5) {
  const out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= gain) {
    const nx = cx << o, ny = cy << o;
    const g = new Float32Array(nx * ny);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * ny, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const r0 = (iy % ny) * nx, r1 = ((iy + 1) % ny) * nx;
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * nx, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), ix0 = ix % nx, ix1 = (ix + 1) % nx;
        const a = g[r0 + ix0], b = g[r0 + ix1], c = g[r1 + ix0], d = g[r1 + ix1];
        out[y * W + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

// 共用雜訊場(256²,可平鋪):各貼圖以不同偏移取樣
export const NS = 256;
let _noise = null;
export function noiseFields() {
  if (_noise) return _noise;
  _noise = {
    lo: fbm(NS, NS, 3, 3, 4), // 大塊污漬
    mid: fbm(NS, NS, 8, 8, 4), // 斑駁
    hi: fbm(NS, NS, 32, 32, 2), // 細顆粒
    streak: fbm(NS, NS, 24, 2, 3), // 垂直流痕
    fiber: fbm(NS, NS, 2, 48, 3), // 纖維/木紋
  };
  return _noise;
}
export const sampleN = (f, x, y) => f[((y & 255) << 8) | (x & 255)];

export function blotches(ctx, x0, y0, w, h, n, rMin, rMax, rgb, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, r = rr(rMin, rMax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${rr(aMin, aMax)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function grain(ctx, x0, y0, w, h, amount) {
  const img = ctx.getImageData(x0, y0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, x0, y0);
}

export function scratches(ctx, x0, y0, w, h, n, color, len = 20) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h, a = rnd() * Math.PI * 2, l = rr(len * 0.3, len);
    ctx.strokeStyle = color;
    ctx.globalAlpha = rr(0.15, 0.5);
    ctx.lineWidth = rr(0.5, 1.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.restore();
}

// 不規則多邊形斑塊(油漆剝落、破洞)
export function blob(ctx, x, y, r, k = 9, squash = 0.8) {
  ctx.beginPath();
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2, rad = r * rr(0.5, 1.15);
    const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * squash;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// 文字:自動縮小到寬度內
export function text(ctx, s, x, y, { size = 20, color = '#111', weight = 'bold', align = 'center', base = 'middle', maxW = 0, font = FONT, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  let fs = size;
  ctx.font = `${weight} ${fs}px ${font}`;
  if (maxW) {
    const tw = ctx.measureText(s).width;
    if (tw > maxW) { fs = Math.max(6, Math.floor((fs * maxW) / tw)); ctx.font = `${weight} ${fs}px ${font}`; }
  }
  ctx.fillText(s, x, y);
  ctx.restore();
}

// 手寫感的線條(蠟筆畫、塗鴉)
export function scribbleLine(ctx, pts, width, color, jitter = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.5 : 0.85;
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const px = x + rr(-jitter, jitter), py = y + rr(-jitter, jitter); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function toTex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
