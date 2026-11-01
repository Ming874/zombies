// 物品材質的細節貼圖(貼圖 Worker 畫;全部可平鋪、線性資料,不是顏色)。
// 只用 RGB(alpha 固定 255):畫布 → ImageBitmap → GPU 這條路上 alpha 通道的資料會壞掉(取樣出一點一點的雜訊)
//  surfA(1024,一格 0.5m):R 微起伏(橘皮/毛孔/麻點)、G 刮痕、B 指紋/油污/擦拭痕
//  surfB(1024,一格依類別):R 木紋(年輪 + 纖維)、G 平織布紋、B 皮紋(細胞)
//  surfC(512,一格 0.5m 與 ~3m 兩種尺度取樣):R 斑駁 fbm(掉漆缺口、色塊)、G 第二組 fbm(水漬、鏽色)、B 纖維(沿 u 拉長:拉絲、紙)

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 可平鋪值雜訊 fbm(cx/cy 最粗一層格數)
function fbm(W, H, cx, cy, oct, gain, rnd) {
  const out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= gain) {
    const nx = cx << o, ny = cy << o, g = new Float32Array(nx * ny);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const fx = new Float32Array(W), ix0 = new Int32Array(W), ix1 = new Int32Array(W);
    for (let x = 0; x < W; x++) { const f = (x / W) * nx, i = f | 0, t = f - i; fx[x] = t * t * (3 - 2 * t); ix0[x] = i % nx; ix1[x] = (i + 1) % nx; }
    for (let y = 0; y < H; y++) {
      const f = (y / H) * ny, iy = f | 0, ty = f - iy, sy = ty * ty * (3 - 2 * ty), r0 = (iy % ny) * nx, r1 = ((iy + 1) % ny) * nx, row = y * W;
      for (let x = 0; x < W; x++) {
        const a = g[r0 + ix0[x]], b = g[r0 + ix1[x]], c = g[r1 + ix0[x]], d = g[r1 + ix1[x]], sx = fx[x];
        out[row + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// 拉開對比到 0..1(以百分位數)
function stretch(a, lo = 0.02, hi = 0.98) {
  const s = Array.from(a.filter((_, i) => (i & 63) === 0)).sort((x, y) => x - y);
  const a0 = s[Math.floor(s.length * lo)], a1 = s[Math.floor(s.length * hi)], k = 1 / Math.max(1e-6, a1 - a0);
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, (a[i] - a0) * k));
  return a;
}
// 在可平鋪畫布上畫(邊界附近畫九份)
function wrapDraw(S, x, y, r, fn) {
  for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) {
    if (ox && (x + ox < -r || x + ox > S + r)) continue;
    if (oy && (y + oy < -r || y + oy > S + r)) continue;
    fn(x + ox, y + oy);
  }
}
function pack(make, S, R, G, B) {
  const [c, x] = make(S, S, { read: true });
  const img = x.createImageData(S, S), d = img.data;
  for (let i = 0, j = 0; i < S * S; i++, j += 4) {
    d[j] = R[i] * 255 + 0.5; d[j + 1] = G[i] * 255 + 0.5; d[j + 2] = B[i] * 255 + 0.5; d[j + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}
// 用 2D 畫布畫線/斑塊,讀回成灰階陣列
function strokes(make, S, draw) {
  const [c, x] = make(S, S, { read: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  draw(x);
  const d = x.getImageData(0, 0, S, S).data, out = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) out[i] = d[i * 4] / 255;
  return out;
}

export function surfA(make, args = {}) {
  const S = args.size || 1024, rnd = rng(args.seed || 7919);
  // R:橘皮 + 細顆粒 + 麻點
  const peel = fbm(S, S, 48, 48, 3, 0.55, rnd), fine = fbm(S, S, 256, 256, 1, 0.5, rnd);
  const R = new Float32Array(S * S);
  for (let i = 0; i < R.length; i++) R[i] = peel[i] * 0.7 + fine[i] * 0.3;
  stretch(R, 0.01, 0.99);
  for (let k = 0; k < 2600; k++) { // 小凹坑
    const x = (rnd() * S) | 0, y = (rnd() * S) | 0, r = rnd() < 0.85 ? 1 : 2, dep = 0.25 + rnd() * 0.45;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const i = ((y + dy + S) % S) * S + ((x + dx + S) % S); R[i] *= 1 - dep; }
  }
  // G:刮痕(兩三個主要方向 + 隨機),寬 0.5~1.5px,長短不一
  const dirs = [rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI];
  const G = strokes(make, S, (x) => {
    x.lineCap = 'round';
    for (let k = 0; k < 900; k++) {
      const main = rnd() < 0.75, a = main ? dirs[(rnd() * 3) | 0] + (rnd() - 0.5) * 0.25 : rnd() * Math.PI * 2;
      const l = (main ? 20 : 6) + Math.pow(rnd(), 2.2) * (main ? 260 : 60), px = rnd() * S, py = rnd() * S;
      const v = Math.round((0.18 + Math.pow(rnd(), 1.5) * 0.82) * 255), w = 0.5 + rnd() * (rnd() < 0.1 ? 2.2 : 0.9);
      const bend = (rnd() - 0.5) * 0.002 * l;
      wrapDraw(S, px, py, l + 4, (X, Y) => {
        x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = w;
        x.beginPath(); x.moveTo(X, Y);
        x.quadraticCurveTo(X + Math.cos(a) * l * 0.5 - Math.sin(a) * bend * l, Y + Math.sin(a) * l * 0.5 + Math.cos(a) * bend * l, X + Math.cos(a) * l, Y + Math.sin(a) * l);
        x.stroke();
      });
    }
    // 磨擦區:一片很細很密的短刮痕
    for (let k = 0; k < 14; k++) {
      const cx = rnd() * S, cy = rnd() * S, rad = 30 + rnd() * 70, a = rnd() * Math.PI;
      for (let n = 0; n < 60; n++) {
        const px = cx + (rnd() - 0.5) * rad * 2, py = cy + (rnd() - 0.5) * rad, l = 4 + rnd() * 18, aa = a + (rnd() - 0.5) * 0.4, v = Math.round((0.15 + rnd() * 0.35) * 255), lw = 0.5 + rnd() * 0.5;
        wrapDraw(S, px, py, l + 2, (X, Y) => { x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = lw; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(aa) * l, Y + Math.sin(aa) * l); x.stroke(); });
      }
    }
  });
  // B:指紋(橢圓、內部有斑駁)、擦拭弧、油膜
  const haze = fbm(S, S, 4, 4, 4, 0.5, rnd), mott = fbm(S, S, 96, 96, 2, 0.5, rnd);
  const prints = strokes(make, S, (x) => {
    for (let k = 0; k < 70; k++) { // 指紋:12~18mm 的橢圓(0.5mm/px)
      const px = rnd() * S, py = rnd() * S, rx = 11 + rnd() * 8, ry = rx * (1.2 + rnd() * 0.35), a = rnd() * Math.PI, v = 0.35 + rnd() * 0.6;
      // 常常三四個一組(一隻手)
      const n = rnd() < 0.5 ? 1 : 3 + ((rnd() * 2) | 0);
      for (let f = 0; f < n; f++) {
        const fx = px + Math.cos(a + 1.57) * f * rx * 2.1 + (rnd() - 0.5) * 6, fy = py + Math.sin(a + 1.57) * f * rx * 2.1 + (rnd() - 0.5) * 6;
        wrapDraw(S, fx, fy, ry * 1.4, (X, Y) => {
          const g = x.createRadialGradient(X, Y, 0, X, Y, ry);
          g.addColorStop(0, `rgba(255,255,255,${v})`); g.addColorStop(0.7, `rgba(255,255,255,${v * 0.8})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.save(); x.translate(X, Y); x.rotate(a); x.scale(rx / ry, 1); x.translate(-X, -Y);
          x.fillStyle = g; x.beginPath(); x.arc(X, Y, ry, 0, Math.PI * 2); x.fill();
          x.restore();
        });
      }
    }
    x.lineCap = 'round';
    for (let k = 0; k < 18; k++) { // 擦拭弧(抹布、袖子)
      const cx = rnd() * S, cy = rnd() * S, r = 60 + rnd() * 160, a0 = rnd() * 6.28, a1 = a0 + 0.6 + rnd() * 1.4, w = 14 + rnd() * 30, v = 0.12 + rnd() * 0.25;
      wrapDraw(S, cx, cy, r + w, (X, Y) => { x.strokeStyle = `rgba(255,255,255,${v})`; x.lineWidth = w; x.beginPath(); x.arc(X, Y, r, a0, a1); x.stroke(); });
    }
  });
  const B = new Float32Array(S * S);
  for (let i = 0; i < B.length; i++) {
    const h = Math.max(0, haze[i] - 0.45) * 1.4;
    B[i] = Math.min(1, prints[i] * (0.65 + 0.7 * mott[i]) + h * 0.35);
  }
  return pack(make, S, R, G, B);
}

export function surfB(make, args = {}) {
  const S = args.size || 1024, rnd = rng(args.seed || 104729);
  // R:年輪(沿 u;v 方向 N 圈,經過扭曲)
  const warp = fbm(S, S, 3, 6, 4, 0.5, rnd), warp2 = fbm(S, S, 2, 24, 3, 0.5, rnd);
  const RINGS = 9, R = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, w = (y / S) * RINGS + warp[i] * 2.4 + warp2[i] * 0.5;
    const f = w - Math.floor(w);
    const late = Math.exp(-(((f - 0.78) / 0.11) ** 2)) + Math.exp(-(((f + 0.22) / 0.11) ** 2)); // 晚材(深色窄帶)
    R[i] = 1 - Math.min(1, late * 0.85 + (1 - f) * 0.15);
  }
  // G:平織布(128 根線一格;經緯上下交錯、粗細不一、偶有起毛)
  const T = 128, P = S / T, thick = fbm(S, S, 1, 64, 2, 0.5, rnd), thickW = fbm(S, S, 64, 1, 2, 0.5, rnd), fuzz = fbm(S, S, 128, 128, 2, 0.5, rnd);
  const G = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, cx = Math.floor(x / P), cy = Math.floor(y / P), fx = (x % P) / P, fy = (y % P) / P;
    const over = (cx + cy) & 1; // 1 = 經線在上
    const warpV = Math.sin(Math.PI * fx) * (0.75 + 0.5 * thick[i]) * (over ? 1 : 0.55 + 0.25 * Math.sin(Math.PI * fy));
    const weftV = Math.sin(Math.PI * fy) * (0.75 + 0.5 * thickW[i]) * (over ? 0.55 + 0.25 * Math.sin(Math.PI * fx) : 1);
    G[i] = Math.min(1, Math.max(warpV, weftV) * 0.85 + fuzz[i] * 0.2);
  }
  // B:皮紋(Worley F2-F1:顆粒凸起、皺褶凹下)
  const N = 46, cell = S / N, pts = new Float32Array(N * N * 2);
  for (let i = 0; i < N * N; i++) { pts[i * 2] = rnd(); pts[i * 2 + 1] = rnd(); }
  const fineB = fbm(S, S, 160, 160, 1, 0.5, rnd), B = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let d1 = 1e9, d2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cxi = gx + ox, cyi = gy + oy, wx = ((cxi % N) + N) % N, wy = ((cyi % N) + N) % N;
      const px = (cxi + pts[(wy * N + wx) * 2]) * cell, py = (cyi + pts[(wy * N + wx) * 2 + 1]) * cell;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const e = (Math.sqrt(d2) - Math.sqrt(d1)) / cell; // 到細胞邊界的距離
    B[y * S + x] = Math.min(1, Math.pow(Math.min(1, e * 2.2), 0.6) * 0.85 + fineB[y * S + x] * 0.15);
  }
  // 木紋 = 年輪 + 纖維
  const fib = fibers(make, S, rnd);
  for (let i = 0; i < R.length; i++) R[i] = Math.min(1, Math.max(0, R[i] * 0.62 + fib[i] * 0.38));
  return pack(make, S, R, G, B);
}

// 纖維(沿 u 拉長的細條紋 + 長線)
function fibers(make, S, rnd) {
  const A = stretch(fbm(S, S, 4, Math.max(40, S / 6.4) | 0, 3, 0.6, rnd), 0.01, 0.99);
  const longs = strokes(make, S, (x) => {
    for (let k = 0; k < S * 0.7; k++) {
      const px = rnd() * S, py = rnd() * S, l = (30 + rnd() * 300) * S / 1024, v = Math.round((0.2 + rnd() * 0.8) * 255), lw = (0.6 + rnd() * 0.8) * Math.max(0.6, S / 1024), dy = (rnd() - 0.5) * 2;
      wrapDraw(S, px, py, l, (X, Y) => { x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = lw; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + l, Y + dy); x.stroke(); });
    }
  });
  for (let i = 0; i < A.length; i++) A[i] = Math.min(1, A[i] * 0.75 + longs[i] * 0.35);
  return A;
}

export function surfC(make, args = {}) {
  const S = args.size || 512, rnd = rng(args.seed || 15485863);
  const R = stretch(fbm(S, S, 6, 6, 6, 0.55, rnd), 0.01, 0.99);
  const G = stretch(fbm(S, S, 4, 4, 5, 0.55, rnd), 0.01, 0.99);
  const B = fibers(make, S, rnd);
  return pack(make, S, R, G, B);
}
