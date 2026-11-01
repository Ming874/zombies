// ===== 血跡與痕跡的共用畫家 =====
// 純函式(不碰 DOM、THREE):主執行緒與貼圖 Worker(src/art/stains.paint.js)共用;同一個 seed 一定畫出同一張。
// 作法:每張貼花先在 Float32 欄位(buf)上「模擬」,再由 compose() 轉成三張圖:
//   t 血量(膜厚,約 0.6mm/單位)、gd 刮痕深度 0..1、chip 掉漆露出底材 0..1、dust 灰塵/殘渣 0..1、ag 局部乾燥度偏移
//   → albedo(直通 alpha)、高度(mm → 法線)、粗糙度
// 材料:新鮮血 = 深紅、亮面(粗糙度 0.1~0.3)、厚處微凸;乾掉 = 褐黑、霧面,薄處偏鏽褐;邊緣先乾 → 咖啡環(深色邊)。
//      不吸水表面(磁磚、烤漆、玻璃)厚的乾血會龜裂剝落;多孔表面(灰泥、石膏板、帆布)沿纖維暈開、吸進去變霧。
// 形狀:手印用貝茲/解剖比例(指節橫紋、指腹、掌丘、掌心凹陷、壓力不均、拖曳);抓痕 = 人類指距的 3~4 道平行溝(漸尖、
//      指甲跳動的顫痕、Voronoi 掉漆、溝內灰塵與血);垂流 = 重力往下、越流越細、末端血珠;噴濺 = 衛星滴 + 拉長的尾巴。

// ---------------------------------------------------------------- 亂數 / 雜訊
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.r = (lo, hi) => lo + f() * (hi - lo);
  f.i = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.n = () => (f() + f() + f() - 1.5) * 1.15; // 近似常態
  f.pick = (arr) => arr[(f() * arr.length) | 0];
  return f;
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const hash = (x, y, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 4) {
  let a = 0.5, f = 1, sum = 0, nrm = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); nrm += a; a *= 0.5; f *= 2.03; }
  return sum / nrm;
}
// 細胞雜訊(Voronoi):F1、F2 與最近格的亂數 id;結果寫在 CEL(不配置物件)
export const CEL = { f1: 0, f2: 0, id: 0, x: 0, y: 0 };
export function cellular(x, y, s = 0, jit = 0.9) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j;
    const px = cx + 0.5 + (hash(cx, cy, s) - 0.5) * jit, py = cy + 0.5 + (hash(cx, cy, s + 7) - 0.5) * jit;
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < f1) { f2 = f1; f1 = d; id = hash(cx, cy, s + 13); bx = px; by = py; } else if (d < f2) f2 = d;
  }
  CEL.f1 = Math.sqrt(f1); CEL.f2 = Math.sqrt(f2); CEL.id = id; CEL.x = bx; CEL.y = by;
  return CEL;
}
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- 欄位
export function buf(w, h) {
  const n = w * h;
  return { w, h, t: new Float32Array(n), gd: new Float32Array(n), chip: new Float32Array(n), dust: new Float32Array(n), ag: new Float32Array(n) };
}
// 盒狀模糊兩次(近似高斯);邊界外視為 0
export function blur(src, w, h, r, out) {
  r = Math.max(1, Math.round(r));
  const n = w * h, tmp = new Float32Array(n);
  out = out || new Float32Array(n);
  const k = 1 / (2 * r + 1);
  const pass = (a, b, horiz) => {
    const L = horiz ? w : h, M = horiz ? h : w, st = horiz ? 1 : w, row = horiz ? w : 1;
    for (let m = 0; m < M; m++) {
      const o = m * row;
      let s = 0;
      for (let i = 0; i < r && i < L; i++) s += a[o + i * st];
      for (let i = 0; i < L; i++) {
        if (i + r < L) s += a[o + (i + r) * st];
        if (i - r - 1 >= 0) s -= a[o + (i - r - 1) * st];
        b[o + i * st] = s * k;
      }
    }
  };
  pass(src, tmp, true); pass(tmp, out, false); pass(out, tmp, true); pass(tmp, out, false);
  return out;
}

// ---------------------------------------------------------------- 蓋章(像素座標)
// 橢圓:prof 0 = 平頂(1px 抗鋸齒邊)、1 = 圓頂(中間厚)、2 = V 形;add = 疊加(否則取大)
export function ell(F, w, h, cx, cy, rx, ry, ang, v, prof = 0, add = false) {
  rx = Math.max(0.35, rx); ry = Math.max(0.35, ry);
  const c = Math.cos(ang), s = Math.sin(ang), R = Math.max(rx, ry) + 1.5;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
  const aa = 1 / Math.min(rx, ry);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx * c + dy * s) / rx, q = (-dx * s + dy * c) / ry, d = Math.sqrt(u * u + q * q);
    if (d >= 1 + aa) continue;
    let k = clamp((1 - d) / aa + 0.5);
    if (prof === 1) k *= 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - d * d));
    else if (prof === 2) k *= Math.max(0, 1 - d);
    const val = v * k, i = y * w + x;
    if (add) F[i] += val; else if (val > F[i]) F[i] = val;
  }
}
// 線段(半徑由 ra 漸變到 rb、值由 va 到 vb);prof 同上,3 = 指數衰減(掉漆的「接近度」)
export function seg(F, w, h, ax, ay, bx, by, ra, rb, va, vb, prof = 1, add = false) {
  const R = Math.max(ra, rb) + 1.5;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + R));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + R));
  const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay;
    const t = clamp((px * ex + py * ey) / L2), dx = px - ex * t, dy = py - ey * t, d = Math.sqrt(dx * dx + dy * dy);
    const r = ra + (rb - ra) * t;
    if (r <= 0.05 || d >= r + 1) continue;
    let k = prof === 3 ? Math.pow(Math.max(0, 1 - d / r), 1.2) : clamp(r - d + 0.5);
    if (prof === 1) k *= 0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - (d * d) / (r * r)));
    else if (prof === 2) k *= Math.max(0, 1 - d / r);
    const val = (va + (vb - va) * t) * k, i = y * w + x;
    if (add) F[i] += val; else if (val > F[i]) F[i] = val;
  }
}
// 折線(扁平陣列 [x, y, r, v, ...])
export function poly(F, w, h, P, prof = 1, add = false) {
  for (let i = 0; i + 7 < P.length; i += 4) seg(F, w, h, P[i], P[i + 1], P[i + 4], P[i + 5], P[i + 2], P[i + 6], P[i + 3], P[i + 7], prof, add);
}
// 雙線性取樣(邊界外 = 0)
function samp(G, gw, gh, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= gw - 1 || iy >= gh - 1) return 0;
  const fx = x - ix, fy = y - iy, i = iy * gw + ix;
  return (G[i] * (1 - fx) + G[i + 1] * fx) * (1 - fy) + (G[i + gw] * (1 - fx) + G[i + gw + 1] * fx) * fy;
}

// ---------------------------------------------------------------- 合成
// P:ppm(像素/公尺)、age 0 新鮮..1 乾透、por 多孔 0..1、flake 剝落 0..1、rim 咖啡環、sub 底材色、dustCol、seed
// 顏色校正(r2):薄血膜原本太亮太飽和,暖色手電筒 + ACES 之下像紅色印章;壓暗一點、乾的偏褐
const COL = {
  fresh: [[140, 22, 18], [60, 5, 5]],
  dry: [[102, 47, 35], [34, 11, 8]],
  soak: [[114, 56, 43], [88, 37, 28]],
};
export function compose(B, P) {
  const { w, h } = B, n = w * h, ppm = P.ppm;
  const age = P.age ?? 0.7, por = P.por ?? 0, flake = P.flake ?? 0, rimK = P.rim ?? 0.5, seed = (P.seed | 0) + 101;
  const sub = P.sub || [224, 216, 200], dcol = P.dustCol || [60, 52, 44], dA = P.dustA ?? 0.8;
  const tb = blur(B.t, w, h, Math.max(1, ppm * 0.0035));
  const halo = por > 0 ? blur(B.t, w, h, Math.max(2, ppm * 0.006)) : null;
  const rgba = new Uint8ClampedArray(n * 4), hgt = new Float32Array(n), rough = new Float32Array(n).fill(0.85);
  const fs = 100 / ppm, fsc = Math.max(4.5, ppm * 0.0075);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let t = B.t[i];
    const g = B.gd[i], c = B.chip[i], d = B.dust[i], hv0 = halo ? halo[i] : 0;
    if (t <= 0.004 && g <= 0.004 && c <= 0.004 && d <= 0.004 && hv0 <= 0.012) continue;
    const xc = x * fs, yc = y * fs;
    const n1 = vnoise(xc * 0.9, yc * 0.9, seed), n2 = vnoise(xc * 3.3, yc * 3.3, seed + 5);
    let q = 1 - Math.exp(-1.7 * t);
    // 乾燥度:整體 + 薄處先乾 + 局部
    const ag = clamp(age + B.ag[i] + (age > 0.15 ? (1 - q) * 0.22 : 0) + (n1 - 0.5) * 0.16);
    // 咖啡環:邊緣比模糊後厚 → 乾的時候更深、更厚
    if (t > 0.02) t += clamp((t - tb[i]) * 2.2) * rimK * ag * 0.6;
    // 多孔表面:沿纖維暈開的淡褐色
    let soak = 0;
    if (halo) { const hv = hv0 * por * (0.5 + 0.9 * (n2 - 0.5) + 0.35 * n1); if (hv > t * 0.7) soak = clamp(hv - t * 0.7, 0, 0.45); }
    // 龜裂剝落(不吸水表面、厚的乾血)
    let lift = 0;
    if (flake > 0 && ag > 0.5 && q > 0.3) {
      const C = cellular(x / fsc, y / fsc, seed + 11, 0.85);
      const k = sstep(0.35, 0.75, q) * sstep(0.5, 0.85, ag);
      const edge = sstep(0.1, 0.0, C.f2 - C.f1) * k;
      t *= 1 - 0.75 * edge * flake;
      if (C.id < flake * 0.12 * k * sstep(0.55, 0.8, q)) { t *= 0.2; lift = -0.12; } else lift = edge * 0.06 * flake;
    }
    q = 1 - Math.exp(-1.7 * t);
    // ---- 由下往上疊:底材(掉漆/刮痕)→ 灰塵 → 吸進去的血 → 表面血膜
    let Cr = 0, Cg = 0, Cb = 0, A = 0, Ro = 0;
    const over = (r, gg, b, a, ro) => { Cr = r * a + Cr * (1 - a); Cg = gg * a + Cg * (1 - a); Cb = b * a + Cb * (1 - a); Ro = ro * a + Ro * (1 - a); A = a + A * (1 - a); };
    const ac = clamp(Math.max(c, g * 1.8));
    if (ac > 0.002) { const sh = (0.88 + 0.16 * n2) * (1 - 0.4 * g - 0.35 * g * g * g); over(sub[0] * sh, sub[1] * sh, sub[2] * sh, ac, 0.9); }
    if (d > 0.002) { const sh = 0.85 + 0.3 * n2; over(dcol[0] * sh, dcol[1] * sh, dcol[2] * sh, clamp(d * dA), 0.96); }
    if (soak > 0.002) {
      const s = COL.soak, k = clamp(soak * 2);
      over(lerp(s[0][0], s[1][0], k), lerp(s[0][1], s[1][1], k), lerp(s[0][2], s[1][2], k), 1 - Math.exp(-2.6 * soak), 0.92);
    }
    if (t > 0.003) {
      const F = COL.fresh, D = COL.dry, v = 0.93 + 0.14 * n2;
      const r = lerp(lerp(F[0][0], F[1][0], q), lerp(D[0][0], D[1][0], q), ag) * v;
      const gg = lerp(lerp(F[0][1], F[1][1], q), lerp(D[0][1], D[1][1], q), ag) * v;
      const b = lerp(lerp(F[0][2], F[1][2], q), lerp(D[0][2], D[1][2], q), ag) * v;
      const ro = clamp(lerp(lerp(0.34, 0.1, q), lerp(0.86, 0.5, q), ag) + por * 0.28 * (1 - q * 0.6), 0.06, 1);
      over(r, gg, b, 1 - Math.exp(-3.2 * t), ro);
    }
    // 高度(mm):血膜(乾了縮)、刮痕溝、漆層、剝落翹邊
    hgt[i] = t * 0.6 * (1 - 0.6 * ag) - g * 1.0 - c * 0.16 + lift;
    if (A < 0.004) continue;
    rgba[i * 4] = Cr / A; rgba[i * 4 + 1] = Cg / A; rgba[i * 4 + 2] = Cb / A; rgba[i * 4 + 3] = A * 255;
    rough[i] = Ro / A;
  }
  return { w, h, rgba, hgt, rough };
}
// 高度(mm)→ 切線空間法線(OpenGL:+Y = 貼圖往上 = 畫布往上);ex = 誇張倍數
export function normals(hgt, w, h, ppm, ex = 2.2) {
  const nx = new Float32Array(w * h), ny = new Float32Array(w * h), k = (ex * ppm) / 8000;
  const H = (x, y) => hgt[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let a = -dx * k, b = dy * k;
    const l = Math.sqrt(a * a + b * b + 1);
    nx[y * w + x] = a / l; ny[y * w + x] = b / l;
  }
  return { nx, ny };
}
// 2×2 平均縮小
export function half(F, w, h) {
  const W = w >> 1, Hh = h >> 1, o = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const i = y * 2 * w + x * 2; o[y * W + x] = (F[i] + F[i + 1] + F[i + w] + F[i + w + 1]) * 0.25; }
  return o;
}
// 法線 + 粗糙度打包成一張:R = 法線 x、G = 粗糙度、B = 法線 y(材質 shader 由 RB 重建 z;roughnessMap 讀 G)
export function packNR(C, scale = 2) {
  let { w, h, hgt, rough } = C, ppm = C.ppm;
  if (scale === 2) { hgt = half(hgt, w, h); rough = half(rough, w, h); w >>= 1; h >>= 1; ppm /= 2; }
  const N = normals(hgt, w, h, ppm), out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = (N.nx[i] * 0.5 + 0.5) * 255; out[i * 4 + 1] = rough[i] * 255; out[i * 4 + 2] = (N.ny[i] * 0.5 + 0.5) * 255; out[i * 4 + 3] = 255; }
  return { w, h, data: out };
}

// ---------------------------------------------------------------- 手
// 右手掌印(從牆前面看:拇指在左)。單位 cm,原點 = 腕橫紋中點,+y 往指尖(畫布要翻成往上)。左手 = x 鏡像。
const FING = [ // 指根 x, y、傾角(+ = 往小指側)、長度、寬度
  [-2.85, 9.9, -0.13, 7.1, 1.85],
  [-0.85, 10.35, -0.03, 7.9, 1.95],
  [1.2, 9.95, 0.08, 7.4, 1.82],
  [3.15, 8.75, 0.22, 5.9, 1.58],
];
const PALM = [ // 掌丘(cx, cy, rx, ry, 角度, 壓力)
  [-2.3, 3.6, 2.3, 3.3, -0.35, 0.95], // 大魚際
  [2.8, 4.1, 1.45, 3.4, 0.05, 0.86], // 小魚際
  [-2.55, 8.85, 1.35, 1.05, 0, 0.9], [-0.6, 9.3, 1.3, 1.0, 0, 0.92], [1.45, 9.05, 1.25, 0.95, 0, 0.9], [3.05, 8.05, 1.05, 0.9, 0.3, 0.86], // 指根肉墊
  [0.4, 1.3, 2.6, 1.3, 0, 0.74], // 掌根
];
// 掌面輪廓(逆時針;尺側較直、橈側有大魚際的弧、上緣是指蹼)
const OUT = [0.3, -0.2, 2.4, 0.3, 3.6, 1.6, 4.0, 3.5, 4.15, 5.5, 4.2, 7.3, 3.9, 8.6, 2.6, 9.4, 1.4, 9.9, 0.2, 10.3, -0.9, 10.5, -2.0, 10.3, -3.2, 10.0, -3.9, 9.3, -4.25, 7.6, -4.65, 6.2, -4.9, 4.6, -4.6, 2.6, -3.6, 1.0, -1.8, 0.0];
// 掌紋(二次貝茲):起、控制、終、寬、深
const CREASE = [
  [4.2, 7.4, 1.4, 8.1, -1.7, 9.15, 0.13, 0.55], // 感情線(遠側橫紋)
  [-4.1, 6.7, -0.2, 6.9, 3.6, 5.5, 0.12, 0.5], // 智慧線(近側橫紋)
  [-3.8, 7.1, -0.4, 4.6, -0.6, 0.5, 0.14, 0.55], // 生命線(大魚際紋)
];
function bez(a, b, c, t) { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
// 建一隻手的幾何(cm):spread 0..1 張開、child 縮小
export function handModel(R, o = {}) {
  const sp = o.spread ?? R.r(0.1, 0.5), caps = [], ells = [], lines = [];
  FING.forEach(([bx, by, a0, L, W], f) => {
    const a = a0 * (1 + sp * 1.6) + sp * [-0.09, -0.02, 0.05, 0.13][f] + R.r(-0.03, 0.03);
    const dx = Math.sin(a), dy = Math.cos(a), Lf = L * R.r(0.97, 1.03), pf = (o.fp ? o.fp[f] : 1) * R.r(0.85, 1.12);
    const fr = [0.44, 0.29, 0.27], pr = [0.86, 0.8, 1.0], wk = [0.94, 0.92, 0.96];
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const s0 = s + (k ? 0.11 : -0.25), s1 = s + fr[k] * Lf - 0.06;
      s += fr[k] * Lf;
      const w2 = (W * wk[k] * (1 - k * 0.05)) / 2;
      // 每節:膠囊(連續)+ 中間鼓起的肉墊;關節橫紋是細縫;末節指腹中心偏指尖
      if (k < 2) caps.push({ ax: bx + dx * s0, ay: by + dy * s0, bx: bx + dx * s1, by: by + dy * s1, r: w2 * 0.9, p: pr[k] * pf * 0.88 });
      const m = s0 + (s1 - s0) * (k < 2 ? 0.5 : 0.53);
      ells.push({ cx: bx + dx * m, cy: by + dy * m, rx: w2 * (k < 2 ? 1.0 : 0.98), ry: (s1 - s0) * (k < 2 ? 0.56 : 0.6), a: -a, p: pr[k] * pf });
    }
  });
  // 拇指:從大魚際往左上
  const ta = -0.82 - sp * 0.35 + R.r(-0.05, 0.05), tdx = Math.sin(ta), tdy = Math.cos(ta), tb = [-4.0, 5.6], tp = (o.fp ? o.fp[4] : 1) * R.r(0.85, 1.1);
  caps.push({ ax: tb[0] - tdx * 1.2, ay: tb[1] - tdy * 1.2, bx: tb[0] + tdx * 2.85, by: tb[1] + tdy * 2.85, r: 1.12, p: 0.84 * tp });
  { const m = 2.95 + 1.35; ells.push({ cx: tb[0] + tdx * m, cy: tb[1] + tdy * m, rx: 1.1, ry: 1.55, a: -ta, p: 1.0 * tp }); }
  for (const [cx, cy, rx, ry, a, p] of PALM) ells.push({ cx: cx + R.r(-0.1, 0.1), cy: cy + R.r(-0.1, 0.1), rx: rx * R.r(0.95, 1.05), ry: ry * R.r(0.95, 1.05), a, p: p * (o.pp ?? 1) });
  for (const [x0, y0, x1, y1, x2, y2, wd, dp] of CREASE) {
    const pts = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(bez(x0, x1, x2, t) + R.r(-0.06, 0.06), bez(y0, y1, y2, t) + R.r(-0.06, 0.06)); }
    lines.push({ pts, w: wd * R.r(0.8, 1.2), d: dp * R.r(0.6, 1.1), s: R.i(0, 999) });
  }
  return { caps, ells, lines, k: o.child ? 0.66 : 1, pal: 0.6 * (o.pp ?? 1) };
}
function dSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, t = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey || 1e-6));
  const dx = px - ax - ex * t, dy = py - ay - ey * t;
  return Math.sqrt(dx * dx + dy * dy);
}
// 手上一點(cm)的接觸壓力 0..~1
export function handAt(M, x, y) {
  x /= M.k; y /= M.k;
  // 掌面輪廓內的底壓(離邊越遠越實)
  let v = 0;
  if (y > -0.4 && y < 10.7 && x > -5 && x < 4.4) {
    let inside = false, dmin = 9;
    for (let i = 0, j = OUT.length - 2; i < OUT.length; j = i, i += 2) {
      const xi = OUT[i], yi = OUT[i + 1], xj = OUT[j], yj = OUT[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      dmin = Math.min(dmin, dSeg(x, y, xi, yi, xj, yj));
    }
    if (inside) v = M.pal * Math.pow(clamp(dmin / 0.9), 0.5);
  }
  for (const c of M.caps) {
    const d = dSeg(x, y, c.ax, c.ay, c.bx, c.by);
    if (d < c.r) { const k = c.p * Math.pow(1 - (d * d) / (c.r * c.r), 0.3); if (k > v) v = k; }
  }
  for (const e of M.ells) {
    const dx = x - e.cx, dy = y - e.cy, cs = Math.cos(e.a), sn = Math.sin(e.a);
    const u = (dx * cs - dy * sn) / e.rx, w = (dx * sn + dy * cs) / e.ry, d2 = u * u + w * w;
    if (d2 < 1) { const k = e.p * Math.pow(1 - d2, 0.35); if (k > v) v = k; }
  }
  if (v <= 0) return 0;
  // 掌心凹陷(壓力小)
  { const u = (x - 0.45) / 2.3, w = (y - 5.5) / 2.0, d2 = u * u + w * w; if (d2 < 1) v *= 1 - 0.42 * (1 - d2); }
  // 掌紋:斷斷續續的細淺線
  for (const L of M.lines) {
    let d = 9, at = 0;
    for (let k = 0; k + 3 < L.pts.length; k += 2) { const dd = dSeg(x, y, L.pts[k], L.pts[k + 1], L.pts[k + 2], L.pts[k + 3]); if (dd < d) { d = dd; at = k; } }
    if (d < L.w) v *= 1 - L.d * (1 - d / L.w) * (0.4 + 0.6 * vnoise(at * 0.9 + x * 1.5, y * 1.5, L.s));
  }
  return v;
}
// 把一隻手的接觸量畫進局部格點(像素,包圍盒)。o:x, y(腕中點,像素)、ang(轉角,0 = 指尖朝上)、ppm、left、
// thr 接觸門檻(越高越不完整)、tx/ty 壓力傾斜(往小指側 / 往指尖)
export function handGrid(R, M, o, W, H) {
  const s = o.ppm / 100, ca = Math.cos(o.ang || 0), sa = Math.sin(o.ang || 0), mir = o.left ? -1 : 1, seed = o.seed | 0;
  const ext = 21 * M.k * s;
  const gx0 = Math.max(0, Math.floor(o.x - ext)), gx1 = Math.min(W - 1, Math.ceil(o.x + ext)), gy0 = Math.max(0, Math.floor(o.y - ext)), gy1 = Math.min(H - 1, Math.ceil(o.y + ext));
  const gw = gx1 - gx0 + 1, gh = gy1 - gy0 + 1, G = new Float32Array(gw * gh);
  const thr = o.thr ?? 0.32, tx = o.tx ?? 0, ty = o.ty ?? 0;
  for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
    const dx = (x + 0.5 - o.x) / s, dy = (o.y - (y + 0.5)) / s; // cm,y 往上
    const hx = (dx * ca + dy * sa) * mir, hy = -dx * sa + dy * ca;
    if (hy < -1.5 || hy > 20 * M.k || hx < -9 * M.k || hx > 7 * M.k) continue;
    const c = handAt(M, hx, hy);
    if (c <= 0) continue;
    const pm = 1 + tx * (hx / 5) + ty * ((hy - 9) / 9) + (fbm(hx * 0.42, hy * 0.42, seed + 3, 3) - 0.5) * 0.9 + (vnoise(hx * 2.2, hy * 2.2, seed + 4) - 0.5) * 0.32;
    G[(y - gy0) * gw + (x - gx0)] = sstep(thr, thr + 0.16, c * pm) * (0.75 + 0.25 * c);
  }
  return { G, gx0, gy0, gw, gh };
}
// 手印轉血:邊緣厚(血被擠到接觸區周圍)、中間斑駁、皮紋造成的小空洞;slide = 往下拖 { len 像素, ang, n } → 條紋
export function handPrint(B, R, M, o) {
  const { w, h } = B, g = handGrid(R, M, o, w, h), { G, gx0, gy0, gw, gh } = g, seed = o.seed | 0, s = o.ppm / 100;
  const Gb = blur(G, gw, gh, Math.max(1, s * 0.25));
  const load = o.load ?? 1;
  const sl = o.slide, slen = sl ? sl.len : 0, sang = sl ? sl.ang : 0, sdx = Math.sin(sang), sdy = Math.cos(sang);
  const y1 = Math.min(h - 1, gy0 + gh + Math.ceil(slen) + 2), x0 = Math.max(0, gx0 - Math.ceil(Math.abs(sdx) * slen) - 2), x1 = Math.min(w - 1, gx0 + gw + Math.ceil(Math.abs(sdx) * slen) + 2);
  const ns = sl ? Math.max(2, Math.ceil(slen / 1.2)) : 1;
  for (let y = gy0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x;
    let best = 0, bs = 0;
    for (let k = 0; k < ns; k++) {
      const u = sl ? k / (ns - 1) : 0, wob = sl ? Math.sin(u * 3.1 + seed) * (sl.wob || 0) : 0;
      const gx = x - gx0 - sdx * slen * u - wob, gy = y - gy0 - sdy * slen * u;
      const m = samp(G, gw, gh, gx, gy);
      if (m <= 0.01) continue;
      const amt = sl ? Math.pow(1 - u, sl.pow ?? 1.4) * (u < 0.04 ? 1 : 0.85) + (k === ns - 1 ? (sl.end ?? 0.3) : 0) : 1;
      const rim = clamp((m - samp(Gb, gw, gh, gx, gy)) * 3.2);
      const val = m * amt * (0.78 + 0.32 * rim);
      if (val > best) { best = val; bs = u; }
    }
    if (best <= 0.005) continue;
    const xc = x / s, yc = y / s;
    // 斑駁(轉印不均)+ 皮紋小洞;拖曳時沿方向的細條紋(指紋脊拉出的線)
    // 轉印不均:大塊濃淡 + 3~5mm 的沒沾到斑 + 皮膚紋理的細顆粒(略呈橫向)
    let mot = 0.7 + 0.7 * (fbm(xc * 1.1, yc * 1.1, seed + 9, 3) - 0.5) + 0.3 * (vnoise(xc * 5.5, yc * 2.2, seed + 21) - 0.5);
    const sp = fbm(xc * 2.1, yc * 2.1, seed + 23, 2);
    if (sp < 0.4) mot *= 0.3 + 0.7 * sstep(0.28, 0.4, sp);
    if (sl && bs > 0.02) {
      const ua = xc * sdy - yc * sdx, va = xc * sdx + yc * sdy;
      const st = fbm(ua * 3.2, va * 0.12, seed + 31, 3);
      mot *= 0.55 + 0.8 * st;
      if (best < 0.32 && st < 0.45 + (0.32 - best)) mot *= 0.15; // 血快用完 → 斷斷續續
    }
    const v = best * load * clamp(mot, 0, 1.4);
    if (v > B.t[i]) B.t[i] = v;
  }
  return g;
}
// 牆上的垂流:從血多的下緣挑來源,往下流、越流越細、末端血珠。o:n、x0..x1、y0..y1 範圍、len 最長(px)、w0 起始寬(px)
export function drips(B, R, o) {
  const { w, h } = B, T = B.t, pts = [];
  const xa = Math.max(1, o.x0 ?? 1), xb = Math.min(w - 2, o.x1 ?? w - 2), ya = Math.max(1, o.y0 ?? 1), yb = Math.min(h - 3, o.y1 ?? h - 3);
  const thr = o.thr ?? 0.3, st = Math.max(1, Math.round(o.step ?? 2));
  for (let x = xa; x <= xb; x += st) for (let y = ya; y <= yb; y++) {
    const v = T[y * w + x];
    if (v > thr && T[(y + 2) * w + x] < v * 0.35) { // 下緣
      let vol = 0;
      for (let k = 0; k < 14 && y - k >= 0; k++) vol += T[(y - k) * w + x];
      pts.push([x, y, vol]);
    }
  }
  if (!pts.length) return;
  pts.sort((a, b) => b[2] - a[2]);
  const top = pts.slice(0, Math.max(6, (pts.length * 0.4) | 0)), used = [];
  for (let k = 0, tries = 0; k < o.n && tries < o.n * 8; tries++) {
    const p = top[(Math.pow(R(), 1.6) * top.length) | 0];
    if (used.some((u) => Math.abs(u - p[0]) < (o.gap ?? 4))) continue;
    used.push(p[0]); k++;
    run(B, R, p[0] + 0.5, p[1], (o.w0 ?? 2.4) * R.r(0.7, 1.25), (o.len ?? 80) * R.r(0.25, 1) * clamp(p[2] / 6, 0.4, 1.3), o);
  }
}
// 一條垂流(像素):寬度由 w0 漸細、末端血珠;meander 微小的左右擺動
export function run(B, R, x, y, w0, len, o = {}) {
  const { w, h } = B, seed = R.i(0, 1e6), P = [];
  let px = x, k = 0;
  const step = 1.5, n = Math.max(2, Math.ceil(len / step)), tv = o.tv ?? 0.85;
  for (; k <= n; k++) {
    const u = k / n, wd = w0 * (1 - 0.62 * Math.pow(u, 0.8)) * (0.9 + 0.2 * vnoise(k * 0.21, 0, seed));
    px += (vnoise(k * 0.09, 3, seed) - 0.5) * 0.5;
    P.push(px, y + k * step, wd * 0.5, tv * (1 - 0.25 * u));
  }
  poly(B.t, w, h, P, 1);
  const ey = y + n * step, ew = w0 * 0.38;
  ell(B.t, w, h, px, ey - ew * 0.2, ew * 0.95, ew * 1.7, 0, 1.25, 1); // 末端的血珠(淚滴形,比線略寬、較厚)
  if (o.ag != null) for (let yy = Math.max(0, y | 0); yy < Math.min(h, ey + ew * 3); yy++) for (let xx = Math.max(0, (px - w0 * 2) | 0); xx < Math.min(w, px + w0 * 2); xx++) B.ag[yy * w + xx] = Math.min(B.ag[yy * w + xx], o.ag);
}

// ---------------------------------------------------------------- 指甲抓痕
// 一組:x, y 起點(像素)、ang 方向(0 = 往下,+ = 往右擺)、len 長度 cm、sp 指距 cm、bend 彎曲、dep 深度、n 3|4、gw 溝寬 cm、blood
export function clawSet(B, R, S, ppm, PX) {
  const { w, h } = B, s = ppm / 100, seed = R.i(0, 1e6);
  const ca = Math.cos(S.ang), sa = Math.sin(S.ang);
  const delay = [0.9, 0, 0.35, 1.75], lenK = [0.93, 1, 0.95, 0.68], depK = [0.85, 1, 0.92, 0.6];
  const n = S.n ?? 4, skip = n === 3 ? R.i(0, 3) : -1;
  // 手往下拖時手指會收攏(指距越來越窄)、每根手指的弧度不同、力道忽大忽小 → 不是四條等距的平行直線
  const conv = S.conv ?? R.r(0.15, 0.3);
  for (let f = 0; f < 4; f++) {
    if (f === skip) continue;
    const off = (f - 1.5) * S.sp + R.r(-0.15, 0.15), d0 = delay[f] * R.r(0.6, 1.4), L = S.len * lenK[f] * R.r(0.76, 1.1);
    const D = S.dep * depK[f] * R.r(0.8, 1.1), gw = (S.gw ?? 0.9) * R.r(0.75, 1.2), ph = R() * 6.28, steps = Math.ceil(L * s / 0.7);
    const fb = R.r(-0.045, 0.045);
    const P = [], Q = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, al = d0 + u * L;
      const lat = off * (1 - conv * u) + (S.bend + fb) * u * u * S.len + (vnoise(al * 0.16, f, seed) - 0.5) * 0.42 + (vnoise(al * 1.4, f + 7, seed) - 0.5) * 0.08;
      const lx = lat * s, ly = al * s;
      const px = S.x + lx * ca + ly * sa, py = S.y - lx * sa + ly * ca;
      const tin = sstep(0, 0.05, u), tout = 1 - sstep(0.6, 1.0, u);
      const chat = 0.92 + 0.08 * Math.sin((al / 0.55) * 6.283 + ph) * (vnoise(al * 0.8, f + 9, seed) > 0.4 ? 1 : 0.3);
      let dd = D * tin * Math.pow(tout, 0.7) * chat * (0.62 + 0.62 * vnoise(al * 0.22, f + 11, seed));
      if (u > 0.7 && vnoise(al * 1.6, f + 3, seed) < 0.32) dd *= 0.2; // 指甲跳開
      const r = Math.max(0.35, (gw / 2) * s * tin * (0.3 + 0.7 * tout) * chat * (0.8 + 0.4 * Math.min(1, dd / Math.max(0.05, D))) * (1 + 0.3 * Math.exp(-u * 10)));
      P.push(px, py, r, dd);
      Q.push(px, py, r + (S.chipR ?? 0.55) * s * (0.45 + 0.55 * tout) * (0.7 + 0.6 * vnoise(al * 0.7, f + 5, seed)), dd);
    }
    poly(B.gd, w, h, P, 2);
    poly(PX, w, h, Q, 3);
    if (S.blood) { // 斷掉的指甲流的血:起點是指腹拖出的血(漸窄進溝裡),溝底殘留乾血,越往下越少
      const P2 = [];
      for (let k = 0; k < P.length; k += 4) {
        const u = k / P.length, pad = 1 - sstep(0.02, 0.22, u);
        P2.push(P[k], P[k + 1], P[k + 2] * (0.85 + 0.5 * pad * vnoise(k * 0.2, f + 2, seed)), S.blood * (u < 0.4 ? 0.75 + 0.25 * pad : 0.55 * (1 - u)) * (0.3 + 0.7 * sstep(0.18, 0.42, vnoise(k * 0.012, f, seed))));
      }
      poly(B.t, w, h, P2, 1);
    }
  }
}
// 掉漆:由「接近度」場 + Voronoi 剝落片(有角的碎片),溝內也露底
export function chips(B, PX, ppm, seed, amt = 1) {
  const { w, h } = B, sc1 = Math.max(3, ppm * 0.005), sc2 = Math.max(1.5, ppm * 0.002);
  for (let i = 0; i < w * h; i++) {
    const p = PX[i], g = B.gd[i];
    if (p < 0.01 && g < 0.02) continue;
    const x = i % w, y = (i / w) | 0;
    // 整片剝落:以 Voronoi 格的中心判斷(碎片是有角的整片),再用細格咬出不規則的斷口
    const C = cellular(x / sc1, y / sc1, seed, 0.95), id1 = C.id, e1 = C.f2 - C.f1;
    const pc = PX[clamp(Math.round(C.y * sc1), 0, h - 1) * w + clamp(Math.round(C.x * sc1), 0, w - 1)];
    const v = Math.max(pc, p * 0.85) * (0.4 + 0.95 * id1) * amt;
    const bite = cellular(x / sc2, y / sc2, seed + 5, 0.9).id;
    let c = v > 0.5 ? sstep(0.0, 0.1, e1) * (bite > 0.18 || v > 0.8 ? 1 : 0) : 0;
    const ring = v > 0.5 ? (1 - sstep(0.0, 0.12, e1)) * 0.5 : 0; // 漆片斷口的髒邊
    c = Math.max(c, sstep(0.04, 0.14, g));
    B.chip[i] = Math.max(B.chip[i], c);
    B.dust[i] = Math.max(B.dust[i], g * g * 0.6 + c * 0.08 + ring * 0.4);
  }
}
// ---------------------------------------------------------------- 噴濺 / 滴落
// 一滴(橢圓 + 尾巴):ang = 飛行方向,elong 拉長;尾巴指向飛行方向(蝌蚪形)
export function drop(B, x, y, r, ang, elong, tv, tail = 1) {
  const { w, h } = B, ca = Math.cos(ang), sa = Math.sin(ang);
  ell(B.t, w, h, x, y, r * elong, r, ang, tv, 1);
  if (elong > 1.25 && tail > 0) {
    const L = r * elong * (0.8 + 1.4 * tail);
    seg(B.t, w, h, x + ca * r * elong * 0.6, y + sa * r * elong * 0.6, x + ca * (r * elong + L), y + sa * (r * elong + L), r * 0.42, 0.25, tv * 0.8, tv * 0.4, 1);
  }
}
// 撞擊噴濺:中心不規則團塊 + 放射尖刺 + 衛星滴(距離越遠越小、越拉長)+ 霧點。o:x, y, R(範圍 px)、n、dir(主方向)、cone(張角,π = 全方向)、rm(中心 px)
export function spatter(B, R, o) {
  const { w, h } = B, seed = R.i(0, 1e6), rm = o.rm ?? 10;
  // 中心團塊:半徑隨角度起伏
  const k0 = 7 + R.i(0, 5);
  for (let y = Math.max(0, (o.y - rm * 1.8) | 0); y < Math.min(h, o.y + rm * 1.8); y++) for (let x = Math.max(0, (o.x - rm * 1.8) | 0); x < Math.min(w, o.x + rm * 1.8); x++) {
    const dx = x + 0.5 - o.x, dy = y + 0.5 - o.y, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const rr = rm * (0.78 + 0.3 * fbm(Math.cos(a) * 1.7 + 5, Math.sin(a) * 1.7 + 5, seed, 3) + 0.12 * Math.sin(a * k0 + seed));
    if (d < rr + 1) { const v = clamp(rr - d + 0.5) * (1.0 + 0.25 * (1 - d / rr)); const i = y * w + x; if (v > B.t[i]) B.t[i] = v; }
  }
  // 尖刺
  for (let k = 0, nk = o.spikes ?? 14; k < nk; k++) {
    const a = (o.dir ?? 0) + (R() - 0.5) * 2 * (o.cone ?? Math.PI), L = rm * R.r(0.5, 1.6);
    seg(B.t, w, h, o.x + Math.cos(a) * rm * 0.6, o.y + Math.sin(a) * rm * 0.6, o.x + Math.cos(a) * (rm + L), o.y + Math.sin(a) * (rm + L), rm * R.r(0.12, 0.22), 0.3, 1, 0.7, 1);
    if (R() < 0.6) drop(B, o.x + Math.cos(a) * (rm + L * 1.25), o.y + Math.sin(a) * (rm + L * 1.25), rm * R.r(0.08, 0.16), a, R.r(1, 1.8), 0.9, 0.5);
  }
  // 衛星滴
  for (let k = 0; k < o.n; k++) {
    const a = (o.dir ?? 0) + (Math.pow(R(), 0.8) * (R() < 0.5 ? -1 : 1)) * (o.cone ?? Math.PI);
    const dd = rm + (o.R - rm) * Math.pow(R(), 0.85), f = (dd - rm) / (o.R - rm);
    const r = Math.max(0.4, (o.rmax ?? 3.2) * Math.pow(R(), 2.0) * (1 - f * 0.55) + 0.45);
    const el = 1 + f * R.r(0.3, 2.6);
    drop(B, o.x + Math.cos(a) * dd, o.y + Math.sin(a) * dd, r, a + R.r(-0.12, 0.12), el, R.r(0.55, 1.15), R());
  }
  // 霧點
  for (let k = 0; k < (o.mist ?? o.n); k++) {
    const a = R() * 6.283, dd = rm + (o.R * 0.7) * Math.pow(R(), 0.7);
    ell(B.t, w, h, o.x + Math.cos(a) * dd, o.y + Math.sin(a) * dd, R.r(0.35, 0.8), R.r(0.35, 0.7), a, R.r(0.3, 0.7), 0);
  }
}
// 由上往下落的一滴(圓形、邊緣扇貝狀小刺、周圍小衛星點);r 像素
export function floorDrop(B, R, x, y, r, tv = 1.1, fwd = null) {
  const { w, h } = B, seed = R.i(0, 1e6), sp = 5 + R.i(0, 7);
  for (let yy = Math.max(0, (y - r * 2) | 0); yy < Math.min(h, y + r * 2); yy++) for (let xx = Math.max(0, (x - r * 2) | 0); xx < Math.min(w, x + r * 2); xx++) {
    const dx = xx + 0.5 - x, dy = yy + 0.5 - y, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const sc = vnoise(a * sp * 0.5 + 40, 0.5, seed + 3);
    let rr = r * (0.88 + 0.16 * vnoise(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, seed) + 0.22 * Math.pow(Math.max(0, sc - 0.35), 2.2));
    if (fwd != null) rr *= 1 + 0.35 * Math.max(0, Math.cos(a - fwd));
    if (d < rr + 1) { const v = clamp(rr - d + 0.5) * tv * (0.85 + 0.25 * (1 - d / rr)); const i = yy * w + xx; if (v > B.t[i]) B.t[i] = v; }
  }
  for (let k = 0, n = R.i(1, 5); k < n; k++) { const a = fwd != null && R() < 0.7 ? fwd + R.r(-0.6, 0.6) : R() * 6.283, d = r * R.r(1.3, 2.6); drop(B, x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.4, r * R.r(0.06, 0.16)), a, R.r(1, 1.8), 0.8, 0.4); }
}

// ---------------------------------------------------------------- 血泊
// blobs:[[cx, cy, r], ...](像素),以 smooth-min 連成一片;edge 邊緣寬(px)、tv 厚度
export function pool(B, R, blobs, o = {}) {
  const { w, h } = B, seed = R.i(0, 1e6), edge = o.edge ?? 3, tv = o.tv ?? 1.5, warp = o.warp ?? 0.18, K = o.k ?? 8;
  let X0 = w, X1 = 0, Y0 = h, Y1 = 0;
  for (const [cx, cy, r] of blobs) { X0 = Math.min(X0, cx - r * 1.5); X1 = Math.max(X1, cx + r * 1.5); Y0 = Math.min(Y0, cy - r * 1.5); Y1 = Math.max(Y1, cy + r * 1.5); }
  const sdf = o.sdf ? new Float32Array(w * h).fill(99) : null;
  for (let y = Math.max(0, Y0 | 0); y < Math.min(h, Y1); y++) for (let x = Math.max(0, X0 | 0); x < Math.min(w, X1); x++) {
    const sx = x + (fbm(x * 0.012, y * 0.012, seed, 3) - 0.5) * w * warp, sy = y + (fbm(x * 0.012 + 7, y * 0.012 + 3, seed, 3) - 0.5) * w * warp;
    let dmin = 99;
    for (const [cx, cy, r] of blobs) {
      const dx = sx - cx, dy = sy - cy, a = Math.atan2(dy, dx);
      const rr = r * (0.82 + 0.36 * fbm(Math.cos(a) * 1.6 + cx * 0.01, Math.sin(a) * 1.6 + cy * 0.01, seed + 3, 4));
      const d = Math.hypot(dx, dy) - rr;
      const hh = clamp(0.5 + (0.5 * (d - dmin)) / K);
      dmin = lerp(d, dmin, hh) - K * hh * (1 - hh);
    }
    // 邊緣再加細雜訊(液面的小波浪)
    dmin += (vnoise(x * 0.25, y * 0.25, seed + 7) - 0.5) * 1.6;
    if (sdf) sdf[y * w + x] = dmin;
    if (dmin < edge) {
      // 液面不是平的:凝結的起伏與小血塊(亮面才抓得到光)
      const und = 1 + 0.16 * (fbm(x * 0.06, y * 0.06, seed + 11, 3) - 0.5) + 0.22 * Math.max(0, vnoise(x * 0.11, y * 0.11, seed + 13) - 0.62);
      const v = (tv * sstep(edge, -edge * 1.5, dmin) + (o.center ? o.center * sstep(0, -w * 0.12, dmin) : 0)) * und;
      const i = y * w + x;
      if (v > B.t[i]) B.t[i] = v;
    }
  }
  // 小血塊/氣泡:半圓頂的小凸起,亮面上會反光
  for (let k = 0, n = o.clots ?? 0; k < n; k++) {
    const [cx, cy, r] = blobs[(R() * blobs.length) | 0], a = R() * 6.283, d = Math.sqrt(R()) * r * 0.85;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, i = (py | 0) * w + (px | 0);
    if (i < 0 || i >= w * h || B.t[i] < tv * 0.7) continue;
    const rr = R.r(1.6, 4.5);
    ell(B.t, w, h, px, py, rr * R.r(1, 1.6), rr, R() * 3.14, R.r(0.35, 0.8), 1, true);
  }
  return sdf;
}

// ---------------------------------------------------------------- 抹痕 / 拖痕
// 沿路徑刷:path = [[x, y], ...](像素)、wd 寬(px)、load(u) 血量、brush 刷毛數;刷毛隨機斷續 → 縱向條紋
export function smear(B, R, path, o) {
  const { w, h } = B, seed = R.i(0, 1e6), nb = o.bristles ?? 64, br = new Float32Array(nb), wv = o.wander ?? 0;
  for (let j = 0; j < nb; j++) { const e = Math.abs(j / (nb - 1) - 0.5) * 2; br[j] = clamp((1 - Math.pow(e, 4)) * (0.35 + 0.8 * vnoise(j * (o.clump ?? 0.35), 1, seed)) + (R() - 0.5) * 0.3, 0, 1.2); }
  // 路徑重新取樣(間距 0.6px)
  const pts = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i], [bx, by] = path[i + 1], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.6));
    for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * (k / n), ay + (by - ay) * (k / n)]);
  }
  pts.push(path[path.length - 1]);
  const N = pts.length;
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1), a = pts[Math.max(0, k - 2)], b = pts[Math.min(N - 1, k + 2)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, wd = (typeof o.wd === 'function' ? o.wd(u) : o.wd), ld = o.load(u);
    const ns = Math.ceil(wd / 0.55);
    for (let j = 0; j <= ns; j++) {
      const v = j / ns, along = u * N * 0.6;
      // 刷毛條紋沿路徑漂移、內插(r2):固定的刷毛索引會拉出一條條等寬平行線,一長串拖痕看起來像輪胎痕
      const vv = wv ? clamp(v + (vnoise(along * 0.012, 5, seed) - 0.5) * wv + (vnoise(along * 0.05, 9, seed) - 0.5) * wv * 0.3) : v;
      const fj = vv * (nb - 1), j0 = Math.min(nb - 2, fj | 0), bj = br[j0] + (br[j0 + 1] - br[j0]) * (fj - j0);
      let val = ld * bj * (0.7 + 0.6 * fbm(vv * nb * 0.5, along * 0.02, seed + 3, 2)) * (wv ? 0.5 + 0.9 * fbm(vv * 5, along * 0.006, seed + 13, 2) : 1);
      if (val < (o.dry ?? 0.45) && fbm(v * nb * 0.9, along * 0.05, seed + 7, 2) > 0.3 + val) val *= 0.1; // 乾刷斷裂
      const x = Math.floor(pts[k][0] + nx * (v - 0.5) * wd), y = Math.floor(pts[k][1] + ny * (v - 0.5) * wd);
      if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) continue;
      const i = y * w + x; // 2×2 寫入,斜向時不會漏洞
      if (val > B.t[i]) B.t[i] = val;
      if (val > B.t[i + 1]) B.t[i + 1] = val;
      if (val > B.t[i + w]) B.t[i + w] = val;
      if (val > B.t[i + w + 1]) B.t[i + w + 1] = val;
    }
  }
}
// 貝茲取樣
export function curve(p0, p1, p2, p3, n = 24) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}

// ---------------------------------------------------------------- 腳印
// 鞋底(右腳,cm;原點 = 腳跟後緣中點,+y 往腳尖):左右緣(內側 = 左)
const SOLE = [ // y, 內側 x, 外側 x
  [0, -1.6, 1.6], [1, -2.9, 2.9], [3, -3.5, 3.45], [6, -3.4, 3.4], [8, -3.0, 3.3], [11, -2.4, 3.5], [14, -2.9, 4.0],
  [17, -4.3, 4.4], [20, -4.7, 4.3], [23, -4.5, 3.6], [25.5, -3.6, 2.4], [27.3, -2.0, 0.8], [28, -0.4, -0.2],
];
function soleEdge(y) {
  if (y <= 0 || y >= 28) return null;
  let k = 0;
  while (k < SOLE.length - 2 && SOLE[k + 1][0] < y) k++;
  const [y0, a0, b0] = SOLE[k], [y1, a1, b1] = SOLE[k + 1], t = (y - y0) / (y1 - y0), u = t * t * (3 - 2 * t);
  return [a0 + (a1 - a0) * u, b0 + (b1 - b0) * u];
}
// 鞋印接觸 0..1(含紋路):tread 'lug' 運動鞋人字紋、'bar' 工作鞋橫條
export function shoeAt(x, y, tread, L = 28) {
  const s = 28 / L; x *= s; y *= s;
  const e = soleEdge(y);
  if (!e || x < e[0] || x > e[1]) return 0;
  const dE = Math.min(x - e[0], e[1] - x, y, 28 - y);
  let c = clamp(dE / 0.25);
  if (y > 8.5 && y < 13.5) c *= 0.25 + 0.75 * clamp((x - e[0] - 2.2) / 1.2); // 足弓內側懸空
  if (dE < 0.55) return c; // 外框
  if (tread === 'bar') {
    if (y < 9) { if (((y * 1.25) % 1) < 0.34) c *= 0.1; }
    else { const v = ((y + Math.abs(x) * 0.55) * 1.0) % 1.2; if (v < 0.42) c *= 0.1; if (Math.abs(x - 0.3) < 0.18) c *= 0.15; }
  } else {
    // 人字紋 + 腳跟的圓點紋
    if (y < 8) { const gx = x / 1.05 - Math.floor(x / 1.05), gy = y / 1.05 - Math.floor(y / 1.05); if ((gx - 0.5) ** 2 + (gy - 0.5) ** 2 > 0.13) c *= 0.12; }
    else { const v = (y - Math.abs(x) * 0.62) / 0.95; if (v - Math.floor(v) < 0.38) c *= 0.1; if (Math.abs(x) < 0.16) c *= 0.12; }
  }
  return c;
}
// 赤腳(右腳,cm;原點 = 腳跟後緣,+y 往腳趾;大拇趾在左)
export function footAt(x, y, L = 25) {
  const s = 25 / L; x *= s; y *= s;
  let v = 0;
  const E = (cx, cy, rx, ry, p) => { const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (q < 1) v = Math.max(v, p * Math.pow(1 - q, 0.4)); };
  E(0.25, 3.5, 2.8, 3.5, 1); // 腳跟
  E(1.75, 9.6, 1.75, 4.9, 0.95); // 外側足弓(足弓內側懸空)
  E(0.35, 16.4, 4.15, 2.6, 0.97); // 前掌
  E(-1.7, 16.1, 2.3, 2.3, 0.92);
  E(-2.25, 20.75, 1.25, 1.75, 1); // 大拇趾(橢圓、緊貼前掌)
  E(-0.35, 21.05, 0.72, 1.12, 0.86); E(1.05, 20.6, 0.68, 1.04, 0.82); E(2.25, 19.85, 0.62, 0.95, 0.8); E(3.2, 18.85, 0.56, 0.84, 0.76);
  return v;
}
// 一個腳印進 t:kind 'shoe'|'bare'、x, y 腳跟中點(像素)、ang(0 = 腳尖朝上)、left、load、slip(滑動 px)
export function footPrint(B, R, o) {
  const { w, h } = B, s = o.ppm / 100, ca = Math.cos(o.ang), sa = Math.sin(o.ang), mir = o.left ? -1 : 1, seed = R.i(0, 1e6), L = o.L ?? (o.kind === 'shoe' ? 28 : 24);
  const ext = (L + 2) * s;
  for (let y = Math.max(0, (o.y - ext) | 0); y < Math.min(h, o.y + ext); y++) for (let x = Math.max(0, (o.x - ext) | 0); x < Math.min(w, o.x + ext); x++) {
    let best = 0;
    for (let k = 0, ns = o.slip ? 6 : 1; k < ns; k++) {
      const off = o.slip ? (k / (ns - 1)) * o.slip : 0;
      const dx = (x + 0.5 - o.x) / s, dy = (o.y + off - (y + 0.5)) / s;
      const fx = (dx * ca + dy * sa) * mir, fy = -dx * sa + dy * ca;
      if (fy < -0.5 || fy > L + 0.5) continue;
      let c = o.kind === 'shoe' ? shoeAt(fx, fy, o.tread, L) : footAt(fx, fy, L);
      if (c <= 0) continue;
      // 壓力:腳跟與前掌重、足弓輕;雜訊造成部分沒沾到
      const pr = (fy < L * 0.3 ? 1 : fy > L * 0.55 ? 0.95 : 0.7) + (fbm(fx * 0.5, fy * 0.5, seed, 3) - 0.5) * 1.1;
      c = sstep(o.thr ?? 0.3, (o.thr ?? 0.3) + 0.3, c * pr) * (k ? 0.5 * (1 - k / ns) : 1);
      if (c > best) best = c;
    }
    if (best <= 0) continue;
    const xc = x / s, yc = y / s, mot = 0.6 + 0.6 * (fbm(xc * 1.2, yc * 1.2, seed + 3, 3) - 0.5);
    const v = best * o.load * clamp(mot, 0.15, 1.2), i = y * w + x;
    if (v > B.t[i]) B.t[i] = v;
  }
}
