import * as THREE from 'three';
import { buf, compose, clawSet, chips as paintChips, handModel, handPrint, drips, rng } from '../../art/stains.js';

// 門的 PBR 圖集(全部程式產生,0 下載):顏色(窗洞是透明 → alphaTest 挖空)2048²、法線 1024²(由高度圖 Sobel 算)、
// ORM 1024²(R = AO、G = 粗糙度、B = 金屬度;MeshStandardMaterial 的 aoMap/roughnessMap/metalnessMap 共用一張)。
// 版面:七種門面各 512×1024(縱向 = 2.9m,寬 = 一扇門寬 0.962m)、右下角是門框、門邊、五金、玻璃、貼紙、門縫光。
// 所有門扇、門框、五金共用一個材質(每層一個 BatchedMesh → 1 個 draw call),玻璃一個、門縫光一個。
export const SPAN = 2.9, LW = 0.962; // 門扇寬(2m 門洞兩扇,中間留 6mm 門縫;openings.js 的 lw 與這裡一致)
const AW = 2048, AH = 2048, NR = 1024, K = NR / AW;
export const FACES = { ward: [0, 0], wood: [512, 0], fire: [1024, 0], cell: [1536, 0], metal: [0, 1024], swing: [512, 1024], chapel: [1024, 1024] };
const FRAMES = ['trim_white', 'trim_gray', 'steel_dirty', 'steel_brushed', 'trim_wood', 'trim_alu'];
const EDGES = ['ward', 'wood', 'fire', 'cell', 'metal', 'swing', 'chapel'];
const SW = [['kick', 160], ['lever', 40], ['steel', 40], ['black', 40], ['rubber', 40], ['brass', 40], ['alu', 40], ['chrome', 40], ['hinge', 40], ['iron', 40], ['closer', 40], ['glass', 128], ['wire', 128], ['leak', 64], ['lblFire', 48], ['lblStencil', 48], ['lblWard', 48]];

// 圖集座標(px)→ UV 矩形 [u0, v0, u1, v1](v 往上)
const uvr = (x, y, w, h) => [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH];
export const REG = { face: {}, frame: {}, edge: {}, sw: {} };
for (const [k, [x, y]] of Object.entries(FACES)) REG.face[k] = uvr(x, y, 512, 1024);
FRAMES.forEach((k, i) => { REG.frame[k] = uvr(1536 + i * 40, 1024, 40, 1024); });
EDGES.forEach((k, i) => { REG.edge[k] = uvr(1776 + i * 20, 1024, 20, 1024); });
{ let y = 1024; for (const [k, h] of SW) { REG.sw[k] = uvr(1920, y, 128, h); REG.sw[k].px = [1920, y, 128, h]; y += h; } }

// ---------- 畫圖工具 ----------
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);
function noiseTile(n = 256) { // 可無縫重複的 fBm 數值雜訊(灰階)
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
  const oct = [[8, 0.5], [16, 0.25], [32, 0.15], [64, 0.1]];
  const grids = oct.map(([s]) => { const a = new Float32Array(s * s); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; });
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    oct.forEach(([s, w], o) => {
      const fx = (x / n) * s, fy = (y / n) * s, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0), G = grids[o];
      const at = (i, j) => G[((j + s) % s) * s + ((i + s) % s)];
      v += w * ((at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty);
    });
    const q = Math.max(0, Math.min(255, v * 255)), k = (y * n + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = q; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

let NT = null;
// 三張畫布一起畫(高度/ORM 是半解析度,用同樣的圖集座標)
function layers() {
  const mk = (w) => { const c = document.createElement('canvas'); c.width = c.height = w; return c; };
  const col = mk(AW), hgt = mk(NR), orm = mk(NR);
  const C = col.getContext('2d'), Hh = hgt.getContext('2d'), O = orm.getContext('2d');
  Hh.setTransform(K, 0, 0, K, 0, 0); O.setTransform(K, 0, 0, K, 0, 0);
  C.fillStyle = '#7a7a7a'; C.fillRect(0, 0, AW, AH);
  Hh.fillStyle = '#808080'; Hh.fillRect(0, 0, AW, AH);
  O.fillStyle = 'rgb(255,150,0)'; O.fillRect(0, 0, AW, AH);
  return { col, hgt, orm, C, H: Hh, O };
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const ormc = (ao, rough, metal, a = 1) => rgb(ao * 255, rough * 255, metal * 255, a);
const hc = (h, a = 1) => rgb(h * 255, h * 255, h * 255, a);
function clip(g, x, y, w, h, fn) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(); g.restore(); }
function noise(g, x, y, w, h, scale, alpha, op = 'overlay') {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalAlpha = alpha; g.globalCompositeOperation = op;
  const p = g.createPattern(NT, 'repeat');
  const m = new DOMMatrix(); m.translateSelf(x + rr(0, 256), y + rr(0, 256)); m.scaleSelf(scale, scale);
  p.setTransform(m);
  g.fillStyle = p; g.fillRect(x, y, w, h);
  g.restore();
}
function blob(g, cx, cy, r, fill, jag = 0.45, n = 9) { // 不規則的掉漆/汙漬
  g.beginPath();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, q = r * (1 - jag + rnd() * jag * 2); i ? g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * rr(0.6, 1.2)) : g.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  g.closePath(); g.fillStyle = fill; g.fill();
}
function lines(g, n, fn) { for (let i = 0; i < n; i++) { g.beginPath(); fn(i); g.stroke(); } }

// 門面座標:x 公尺(從鉸鍊)、y 公尺(從地面)→ 圖集 px
const fx = (f, x) => FACES[f][0] + (x / LW) * 512;
const fy = (f, y) => FACES[f][1] + 1024 - (y / SPAN) * 1024;
const fw = (w) => (w / LW) * 512, fh = (h) => (h / SPAN) * 1024;
const frect = (f, x0, y0, x1, y1) => [fx(f, x0), fy(f, y1), fw(x1 - x0), fh(y1 - y0)]; // [px x, px y(上), w, h]

// ---------- 共用的磨損 ----------
function grime(L, f, k = 0.55) { // 地面附近的灰塵與水漬漸層
  const [x, y, w, h] = frect(f, 0, 0, LW, 0.6);
  const gr = L.C.createLinearGradient(0, y + h, 0, y);
  gr.addColorStop(0, rgb(40, 34, 26, k)); gr.addColorStop(0.35, rgb(55, 48, 38, k * 0.45)); gr.addColorStop(1, rgb(60, 55, 45, 0));
  L.C.save(); L.C.globalCompositeOperation = 'multiply'; L.C.fillStyle = gr; L.C.fillRect(x, y, w, h); L.C.restore();
  noise(L.C, x, y + h * 0.4, w, h * 0.6, 0.6, 0.35, 'multiply');
  const go = L.O.createLinearGradient(0, y + h, 0, y); go.addColorStop(0, ormc(0.8, 0.9, 0, 0.7)); go.addColorStop(1, ormc(0.8, 0.9, 0, 0));
  L.O.fillStyle = go; L.O.fillRect(x, y, w, h);
}
function scuffs(L, f, x0, x1, y0, y1, n, color = [50, 48, 44], a = 0.35) { // 手、腳、推床留下的擦痕
  for (let i = 0; i < n; i++) {
    const cx = fx(f, rr(x0, x1)), cy = fy(f, rr(y0, y1)), len = rr(10, 60), ang = rr(-0.4, 0.4);
    L.C.strokeStyle = rgb(...color, rr(a * 0.4, a)); L.C.lineWidth = rr(1, 4);
    L.C.beginPath(); L.C.moveTo(cx, cy); L.C.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); L.C.stroke();
    L.O.strokeStyle = ormc(0.9, 0.75, 0, 0.6); L.O.lineWidth = 3; L.O.beginPath(); L.O.moveTo(cx, cy); L.O.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); L.O.stroke();
  }
}
function scratches(L, rect, n, color, hDepth = 0.42, op = 0.5) { // 細刮痕(凹):略彎、兩端漸尖、深淺不一;一半成束(同一次刮過)
  const [x, y, w, h] = rect;
  const one = (sx, sy, a, l, lw, al, hd) => { // 漸尖的一道:分段畫,線寬中間粗兩端細
    const k = rr(-0.004, 0.004), N = Math.max(3, Math.ceil(l / 6));
    let px = sx, py = sy, aa = a;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N, taper = Math.sin(Math.PI * t) ** 0.6, nx = px + Math.cos(aa) * (l / N), ny = py + Math.sin(aa) * (l / N);
      L.C.strokeStyle = rgb(...color, al * taper); L.C.lineWidth = lw * (0.4 + 0.6 * taper); L.C.beginPath(); L.C.moveTo(px, py); L.C.lineTo(nx, ny); L.C.stroke();
      L.C.strokeStyle = rgb(255, 255, 255, al * 0.25 * taper); L.C.lineWidth = lw * 0.5; L.C.beginPath(); L.C.moveTo(px + 0.8, py + 0.8); L.C.lineTo(nx + 0.8, ny + 0.8); L.C.stroke(); // 刮出來的亮邊
      L.H.strokeStyle = hc(0.5 - (0.5 - hd) * taper, 0.8); L.H.lineWidth = Math.max(1.2, lw * 1.2); L.H.beginPath(); L.H.moveTo(px, py); L.H.lineTo(nx, ny); L.H.stroke();
      px = nx; py = ny; aa += k * (l / N);
    }
  };
  clip(L.C, x, y, w, h, () => clip(L.H, x, y, w, h, () => {
    for (let i = 0; i < n; ) {
      const sx = x + rnd() * w, sy = y + rnd() * h, a = rr(-0.6, 0.6) + (rnd() < 0.5 ? 0 : Math.PI / 2), l = rr(8, 70), m = rnd() < 0.5 ? 1 : 2 + ((rnd() * 4) | 0);
      for (let j = 0; j < m && i < n; j++, i++) one(sx + j * rr(1.5, 3.5) * -Math.sin(a), sy + j * rr(1.5, 3.5) * Math.cos(a), a + rr(-0.03, 0.03), l * rr(0.7, 1.1), rr(0.6, 1.6), rr(op * 0.4, op), hDepth);
    }
  }));
}
// 把血跡畫家(src/art/stains.js)的欄位合成進三層(顏色 2048、高度/ORM 半解析度且已 setTransform):x, y = 左上(顏色圖集 px)
function stainInto(L, x, y, B, P) {
  const C = compose(B, P), { w, h } = C;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = mk(); col.getContext('2d').putImageData(new ImageData(C.rgba, w, h), 0, 0);
  const hg = mk(), og = mk(), hd = new Uint8ClampedArray(w * h * 4), od = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = C.rgba[i * 4 + 3];
    if (!a) continue;
    const v = Math.max(0, Math.min(255, 128 + C.hgt[i] * 70));
    hd[i * 4] = hd[i * 4 + 1] = hd[i * 4 + 2] = v; hd[i * 4 + 3] = Math.min(255, a * 1.4);
    od[i * 4] = 230; od[i * 4 + 1] = C.rough[i] * 255; od[i * 4 + 2] = 0; od[i * 4 + 3] = a;
  }
  hg.getContext('2d').putImageData(new ImageData(hd, w, h), 0, 0); og.getContext('2d').putImageData(new ImageData(od, w, h), 0, 0);
  L.C.drawImage(col, x, y); L.H.drawImage(hg, x, y); L.O.drawImage(og, x, y);
}
const PPM = 512 / LW; // 門面:像素/公尺
// 油漆鋼板:掉漆露出底漆/鋼板,鏽從缺口往下流
function chips(L, f, n, area, paint) {
  const [x0, x1, y0, y1] = area;
  for (let i = 0; i < n; i++) {
    const cx = fx(f, rr(x0, x1)), cy = fy(f, rr(y0, y1)), r = rr(2, 9) * (rnd() < 0.15 ? 2.5 : 1);
    blob(L.C, cx, cy, r * 1.3, rgb(118, 120, 112)); // 底漆
    const bare = rnd() < 0.55;
    blob(L.C, cx, cy, r * 0.8, bare ? rgb(150, 150, 146) : rgb(92, 54, 30)); // 鋼板或鏽
    blob(L.H, cx, cy, r * 1.2, hc(0.38));
    blob(L.O, cx, cy, r * 0.8, bare ? ormc(1, 0.38, 1) : ormc(0.8, 0.92, 0.2));
    if (rnd() < 0.5) { // 鏽水往下流
      const gr = L.C.createLinearGradient(0, cy, 0, cy + rr(20, 90));
      gr.addColorStop(0, rgb(110, 58, 26, 0.55)); gr.addColorStop(1, rgb(110, 58, 26, 0));
      L.C.fillStyle = gr; L.C.fillRect(cx - rr(1, 3), cy, rr(2, 5), rr(20, 90));
    }
  }
  void paint;
}
function rustBottom(L, f, hgt = 0.35, k = 0.8) {
  const [x, y, w, h] = frect(f, 0, 0, LW, hgt);
  for (let i = 0; i < 80; i++) { // 由下往上的鏽痕
    const sx = x + rnd() * w, sh = rr(0.15, 1) * h, gr = L.C.createLinearGradient(0, y + h, 0, y + h - sh);
    gr.addColorStop(0, rgb(96, 48, 20, k * rr(0.4, 0.9))); gr.addColorStop(1, rgb(96, 48, 20, 0));
    L.C.fillStyle = gr; L.C.fillRect(sx, y + h - sh, rr(2, 10), sh);
  }
  L.O.fillStyle = ormc(0.85, 0.9, 0.25, 0.6); L.O.fillRect(x, y + h * 0.7, w, h * 0.3);
  for (let i = 0; i < 30; i++) blob(L.H, x + rnd() * w, y + h - rr(0, h * 0.3), rr(2, 6), hc(0.58));
}
function windowCut(L, f, x0, y0, x1, y1, round = false) { // 窗洞:顏色透明(alphaTest 挖空)
  const g = L.C;
  g.save(); g.globalCompositeOperation = 'destination-out';
  if (round) { g.beginPath(); g.ellipse(fx(f, (x0 + x1) / 2), fy(f, (y0 + y1) / 2), fw(x1 - x0) / 2, fh(y1 - y0) / 2, 0, 0, Math.PI * 2); g.fill(); }
  else g.fillRect(...frect(f, x0, y0, x1, y1));
  g.restore();
}
function panel(L, f, x0, y0, x1, y1, raise = 0.62, bevel = 0.035) { // 凸起的門板(高度漸層 → 法線)
  const [x, y, w, h] = frect(f, x0, y0, x1, y1), b = fw(bevel);
  for (let i = 0; i < b; i++) { const t = i / b; L.H.strokeStyle = hc(0.5 + (raise - 0.5) * t); L.H.lineWidth = 1.5; L.H.strokeRect(x + i, y + i, w - i * 2, h - i * 2); }
  L.H.fillStyle = hc(raise); L.H.fillRect(x + b, y + b, w - b * 2, h - b * 2);
  L.O.strokeStyle = ormc(0.7, 0.6, 0, 0.8); L.O.lineWidth = 3; L.O.strokeRect(x, y, w, h); // 溝裡的 AO
  L.C.strokeStyle = rgb(20, 12, 6, 0.35); L.C.lineWidth = 2; L.C.strokeRect(x, y, w, h);
  L.C.strokeStyle = rgb(255, 240, 220, 0.08); L.C.lineWidth = 2; L.C.strokeRect(x + b, y + b, w - b * 2, h - b * 2);
}
function woodGrain(L, x, y, w, h, base, dark, k = 1) { // 直紋木皮
  L.C.fillStyle = base; L.C.fillRect(x, y, w, h);
  clip(L.C, x, y, w, h, () => {
    for (let i = 0; i < 160 * k; i++) {
      const sx = x + rnd() * w, a = rr(0.04, 0.22), lw = rr(0.6, 3.2);
      L.C.strokeStyle = rnd() < 0.7 ? rgb(...dark, a) : rgb(255, 230, 190, a * 0.4); L.C.lineWidth = lw;
      L.C.beginPath(); L.C.moveTo(sx, y);
      for (let t = 0; t <= h; t += 40) L.C.lineTo(sx + Math.sin(t * 0.004 + i) * rr(2, 9) + Math.sin(t * 0.03 + i * 7) * 1.2, y + t);
      L.C.stroke();
    }
    for (let i = 0; i < 6 * k; i++) { // 弧形的山紋
      const cx = x + rnd() * w, cy = y + rnd() * h, s = rr(30, 90);
      L.C.strokeStyle = rgb(...dark, 0.12); L.C.lineWidth = 1.2;
      for (let j = 0; j < 6; j++) { L.C.beginPath(); L.C.ellipse(cx, cy, s * 0.25 + j * 3, s + j * 6, 0, 0, Math.PI * 2); L.C.stroke(); }
    }
  });
  noise(L.C, x, y, w, h, 1.2, 0.18, 'overlay');
  clip(L.H, x, y, w, h, () => lines(L.H, 60 * k, () => { const sx = x + rnd() * w; L.H.strokeStyle = hc(0.47, 0.5); L.H.lineWidth = 1.2; L.H.moveTo(sx, y); L.H.lineTo(sx + rr(-6, 6), y + h); }));
}
function sticker(L, rect, bg, text, fg, font) {
  const [x, y, w, h] = rect;
  L.C.fillStyle = bg; L.C.fillRect(x, y, w, h);
  L.C.fillStyle = fg; L.C.font = font; L.C.textAlign = 'center'; L.C.textBaseline = 'middle';
  L.C.fillText(text, x + w / 2, y + h / 2 + 1);
  noise(L.C, x, y, w, h, 0.8, 0.35, 'multiply');
  for (let i = 0; i < 6; i++) blob(L.C, x + rnd() * w, y + rnd() * h, rr(2, 6), rgb(80, 70, 60, 0.35)); // 磨損
  L.O.fillStyle = ormc(1, 0.5, 0); L.O.fillRect(x, y, w, h);
}

// ---------- 各種門面 ----------
const DRAW = {
  ward(L, f) { // 病房門:薄荷綠美耐板,條紋、擦痕、推床撞痕、手垢,上方長窗
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    L.C.fillStyle = '#8fb7a5'; L.C.fillRect(x, y, w, h);
    noise(L.C, x, y, w, h, 3, 0.25); noise(L.C, x, y, w, h, 0.5, 0.12, 'multiply');
    clip(L.C, x, y, w, h, () => lines(L.C, 40, () => { const sx = x + rnd() * w; L.C.strokeStyle = rgb(255, 255, 255, rr(0.02, 0.05)); L.C.lineWidth = rr(1, 6); L.C.moveTo(sx, y); L.C.lineTo(sx + rr(-3, 3), y + h); }));
    L.O.fillStyle = ormc(1, 0.48, 0); L.O.fillRect(x, y, w, h);
    scuffs(L, f, 0.62, 0.95, 0.9, 1.25, 26); // 手的高度、靠門把那側
    scuffs(L, f, 0.05, 0.95, 0.35, 0.9, 30, [35, 33, 30], 0.45); // 推床、輪椅的擦痕
    { // 推門的手垢:真實比例的掌印(油污,很淡),疊在門把那側
      const R = rng(11), B = buf(180, 220);
      for (let i = 0; i < 4; i++) handPrint(B, R, handModel(R, { spread: R.r(0.1, 0.4) }), { x: R.r(50, 130), y: R.r(150, 210), ang: R.r(-0.5, 0.3), ppm: PPM, thr: R.r(0.38, 0.5), ty: 0.4, seed: i * 7, load: R.r(0.25, 0.45) });
      for (let i = 0; i < B.t.length; i++) { B.dust[i] = B.t[i] * 1.6; B.t[i] = 0; }
      stainInto(L, fx(f, 0.6), fy(f, 1.55), B, { ppm: PPM, dustCol: [62, 52, 40], dustA: 0.22, seed: 11 });
    }
    grime(L, f, 0.5);
    // 長窗(與 leafParts 的 ward 窗一致)+ 窗下的小貼紙位置留空
    windowCut(L, f, LW * 0.3, 1.3, LW * 0.7, 1.9);
  },
  wood(L, f) { // 辦公室木門:胡桃色木皮 + 兩塊凸板,把手附近漆面磨亮
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    woodGrain(L, x, y, w, h, '#7a4b2a', [52, 28, 12]);
    L.O.fillStyle = ormc(1, 0.42, 0); L.O.fillRect(x, y, w, h);
    panel(L, f, 0.13, 1.12, LW - 0.13, 2.12, 0.6); panel(L, f, 0.13, 0.22, LW - 0.13, 0.98, 0.6);
    { const [ax, ay, aw, ah] = frect(f, LW - 0.2, 0.85, LW - 0.02, 1.2); const gr = L.C.createRadialGradient(ax + aw * 0.6, ay + ah / 2, 2, ax + aw * 0.6, ay + ah / 2, aw); gr.addColorStop(0, rgb(190, 150, 110, 0.35)); gr.addColorStop(1, rgb(190, 150, 110, 0)); L.C.fillStyle = gr; L.C.fillRect(ax, ay, aw, ah); L.O.fillStyle = ormc(1, 0.62, 0, 0.6); L.O.fillRect(ax, ay, aw, ah); }
    scuffs(L, f, 0.1, 0.9, 0.02, 0.32, 24, [30, 22, 14], 0.5);
    grime(L, f, 0.4);
  },
  chapel(L, f) { // 禮拜堂:深色橡木、四塊凸板、鐵帶與鉚釘(鐵帶是模型)
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    woodGrain(L, x, y, w, h, '#4a2e1a', [26, 14, 6], 1.3);
    L.O.fillStyle = ormc(1, 0.6, 0); L.O.fillRect(x, y, w, h);
    for (const [a, b] of [[0.1, 0.47], [0.52, 0.89]]) for (const [c, d] of [[0.25, 1.05], [1.2, 2.2]]) panel(L, f, a, c, b, d, 0.62, 0.04);
    for (const yy of [0.4, 1.9]) for (let k2 = 0; k2 < 6; k2++) { const cx = fx(f, 0.08 + k2 * 0.165), cy = fy(f, yy); for (const [g2, v] of [[L.C, '#2a2420'], [L.H, hc(0.78)], [L.O, ormc(0.9, 0.5, 0.85)]]) { g2.fillStyle = v; g2.beginPath(); g2.arc(cx, cy, 5, 0, 7); g2.fill(); } }
    scuffs(L, f, 0.1, 0.9, 0.02, 0.3, 20, [15, 10, 5], 0.5);
    grime(L, f, 0.45);
  },
  fire(L, f) { // 防火門:紅色烤漆鋼板,掉漆、鏽水、推桿附近擦痕;鐵絲網玻璃窄窗
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    L.C.fillStyle = '#8b2c23'; L.C.fillRect(x, y, w, h);
    noise(L.C, x, y, w, h, 2.2, 0.3); noise(L.C, x, y, w, h, 0.4, 0.15, 'multiply');
    L.O.fillStyle = ormc(1, 0.5, 0.15); L.O.fillRect(x, y, w, h);
    noise(L.H, x, y, w, h, 3, 0.15);
    chips(L, f, 70, [0.02, LW - 0.02, 0.02, 0.5]); chips(L, f, 45, [LW - 0.18, LW - 0.01, 0.5, 2.2]); chips(L, f, 25, [0.05, LW - 0.05, 0.85, 1.15]);
    rustBottom(L, f, 0.42);
    scuffs(L, f, 0.1, 0.9, 0.9, 1.1, 30, [30, 20, 18], 0.45);
    grime(L, f, 0.45);
    windowCut(L, f, LW * 0.42, 1.2, LW * 0.58, 1.75);
  },
  cell(L, f) { // 隔離房門:米白烤漆厚鋼板,凹痕、成組的抓痕、送餐口下的黃漬
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    L.C.fillStyle = '#d4d0c4'; L.C.fillRect(x, y, w, h);
    noise(L.C, x, y, w, h, 2.5, 0.22); noise(L.C, x, y, w, h, 0.5, 0.1, 'multiply');
    L.O.fillStyle = ormc(1, 0.55, 0.1); L.O.fillRect(x, y, w, h);
    for (let i = 0; i < 9; i++) { const cx = fx(f, rr(0.1, 0.9)), cy = fy(f, rr(0.3, 1.8)), r = rr(10, 26); const g2 = L.H.createRadialGradient(cx, cy, 1, cx, cy, r); g2.addColorStop(0, hc(0.3)); g2.addColorStop(1, hc(0.5, 0)); L.H.fillStyle = g2; L.H.beginPath(); L.H.arc(cx, cy, r, 0, 7); L.H.fill(); } // 凹痕
    { // 指甲抓痕:幾組 3~4 道平行溝(真實指距、漸尖、顫痕),烤漆崩落露出灰色底漆,溝裡卡灰,一組有乾血
      const R = rng(23), B = buf(400, 620), PX = new Float32Array(400 * 620);
      for (let k2 = 0; k2 < 4; k2++) clawSet(B, R, { x: R.r(60, 300), y: R.r(20, 260), ang: R.r(-0.35, 0.35), len: R.r(18, 42), sp: R.r(1.75, 2.05), bend: R.r(-0.05, 0.05), dep: R.r(0.6, 1), n: R() < 0.3 ? 3 : 4, gw: 0.55, chipR: 0.4, blood: k2 === 1 ? 0.8 : 0 }, PPM, PX);
      paintChips(B, PX, PPM, 23, 0.9);
      stainInto(L, fx(f, 0.1), fy(f, 1.75), B, { ppm: PPM, age: 0.9, sub: [128, 132, 124], dustCol: [52, 48, 42], seed: 23 });
    }
    { const [ax, ay, aw] = frect(f, LW * 0.3, 0.6, LW * 0.7, 0.95); const gr = L.C.createLinearGradient(0, ay, 0, ay + fh(0.5)); gr.addColorStop(0, rgb(150, 120, 60, 0.35)); gr.addColorStop(1, rgb(150, 120, 60, 0)); L.C.fillStyle = gr; for (let i = 0; i < 7; i++) L.C.fillRect(ax + rnd() * aw, ay, rr(3, 8), fh(rr(0.15, 0.5))); }
    scratches(L, frect(f, 0, 0.2, LW, 2.0), 160, [90, 84, 76], 0.42, 0.4);
    chips(L, f, 20, [0.02, LW - 0.02, 0.02, 0.35]);
    grime(L, f, 0.5);
    windowCut(L, f, LW * 0.38, 1.42, LW * 0.62, 1.62);
  },
  metal(L, f) { // 鐵門(太平間、倉庫、機房):灰色鋼板,門把四周磨到發亮、凹痕、鏽、「閒人勿進」模版字(貼紙模型)
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    L.C.fillStyle = '#69706f'; L.C.fillRect(x, y, w, h);
    noise(L.C, x, y, w, h, 2, 0.3); noise(L.C, x, y, w, h, 0.35, 0.2, 'multiply');
    L.O.fillStyle = ormc(1, 0.62, 0.3); L.O.fillRect(x, y, w, h);
    { const [ax, ay, aw, ah] = frect(f, LW - 0.22, 0.85, LW - 0.01, 1.2); const gr = L.C.createRadialGradient(ax + aw * 0.6, ay + ah / 2, 2, ax + aw * 0.6, ay + ah / 2, aw * 0.9); gr.addColorStop(0, rgb(170, 172, 168, 0.85)); gr.addColorStop(1, rgb(170, 172, 168, 0)); L.C.fillStyle = gr; L.C.fillRect(ax, ay, aw, ah); const go = L.O.createRadialGradient(ax + aw * 0.6, ay + ah / 2, 2, ax + aw * 0.6, ay + ah / 2, aw * 0.9); go.addColorStop(0, ormc(1, 0.28, 1)); go.addColorStop(1, ormc(1, 0.62, 0.3, 0)); L.O.fillStyle = go; L.O.fillRect(ax, ay, aw, ah); } // 門把附近磨亮
    chips(L, f, 60, [0.02, LW - 0.02, 0.02, 2.4]);
    rustBottom(L, f, 0.5, 0.9);
    scratches(L, frect(f, 0, 0.1, LW, 1.6), 120, [150, 150, 145], 0.42, 0.45);
    for (let i = 0; i < 6; i++) { const cx = fx(f, rr(0.1, 0.9)), cy = fy(f, rr(0.2, 1.4)), r = rr(10, 22); const g2 = L.H.createRadialGradient(cx, cy, 1, cx, cy, r); g2.addColorStop(0, hc(0.32)); g2.addColorStop(1, hc(0.5, 0)); L.H.fillStyle = g2; L.H.beginPath(); L.H.arc(cx, cy, r, 0, 7); L.H.fill(); }
    grime(L, f, 0.6);
  },
  swing(L, f) { // 手術部/加護病房雙開門:淺灰美耐板,推床留下的黑色橡膠擦痕、圓形窗
    const [x, y, w, h] = frect(f, 0, 0, LW, SPAN);
    L.C.fillStyle = '#a7aaa4'; L.C.fillRect(x, y, w, h);
    noise(L.C, x, y, w, h, 3, 0.2); noise(L.C, x, y, w, h, 0.6, 0.1, 'multiply');
    L.O.fillStyle = ormc(1, 0.45, 0); L.O.fillRect(x, y, w, h);
    for (let i = 0; i < 70; i++) { const cx = fx(f, rr(0.02, 0.98)), cy = fy(f, rr(0.55, 1.05)), len = rr(15, 90); L.C.strokeStyle = rgb(20, 20, 20, rr(0.15, 0.5)); L.C.lineWidth = rr(1, 4); L.C.beginPath(); L.C.moveTo(cx, cy); L.C.lineTo(cx + len, cy + rr(-3, 3)); L.C.stroke(); } // 推床的黑色擦痕
    scuffs(L, f, 0.55, 0.95, 1.05, 1.45, 30, [60, 58, 52], 0.35);
    { // 推門的血手印(推床時手按在門板上)+ 往下滑的指痕 + 垂流;不吸水的美耐板 → 乾掉會龜裂
      const R = rng(31), B = buf(330, 520);
      handPrint(B, R, handModel(R, { spread: 0.3 }), { x: 120, y: 190, ang: 0.25, ppm: PPM, thr: 0.34, tx: 0.2, ty: 0.3, seed: 3, load: 0.95, slide: { len: 55, ang: 0.15, pow: 1.4, end: 0.2, wob: 1 } });
      handPrint(B, R, handModel(R, { spread: 0.4 }), { x: 230, y: 250, ang: -0.1, ppm: PPM, left: true, thr: 0.45, ty: 0.6, seed: 9, load: 0.7 });
      drips(B, R, { n: 5, len: 160, w0: 2.4, thr: 0.35, gap: 8 });
      stainInto(L, fx(f, 0.32), fy(f, 1.52), B, { ppm: PPM, age: 0.85, flake: 0.5, rim: 0.7, seed: 31 });
    }
    grime(L, f, 0.45);
    windowCut(L, f, LW * 0.5 - 0.17, 1.28, LW * 0.5 + 0.17, 1.62, true);
  },
};

function frameSwatch(L, key, i) {
  const x = 1536 + i * 40, y = 1024, w = 40, h = 1024;
  const P = { trim_white: ['#d6d2c6', 0.55, 0], trim_gray: ['#7e8280', 0.6, 0.2], steel_dirty: ['#6f7472', 0.6, 0.6], steel_brushed: ['#b0b4b4', 0.35, 1], trim_wood: ['#4f3220', 0.55, 0], trim_alu: ['#a8acae', 0.4, 1] }[key];
  if (key === 'trim_wood') woodGrain(L, x, y, w, h, P[0], [30, 18, 8], 0.3); else { L.C.fillStyle = P[0]; L.C.fillRect(x, y, w, h); noise(L.C, x, y, w, h, 2, 0.25); }
  if (key === 'steel_brushed' || key === 'trim_alu') clip(L.C, x, y, w, h, () => lines(L.C, 50, () => { const sx = x + rnd() * w; L.C.strokeStyle = rgb(255, 255, 255, rr(0.03, 0.1)); L.C.lineWidth = 1; L.C.moveTo(sx, y); L.C.lineTo(sx, y + h); }));
  L.O.fillStyle = ormc(1, P[1], P[2]); L.O.fillRect(x, y, w, h);
  for (let k2 = 0; k2 < 26; k2++) { const cx = x + (rnd() < 0.5 ? rr(0, 6) : rr(w - 6, w)), cy = y + rnd() * h; blob(L.C, cx, cy, rr(1.5, 4), key === 'trim_white' ? rgb(120, 96, 70) : rgb(140, 140, 136)); blob(L.H, cx, cy, 3, hc(0.4)); } // 邊角掉漆
  const gr = L.C.createLinearGradient(0, y + h, 0, y + h - 220); gr.addColorStop(0, rgb(40, 34, 26, 0.5)); gr.addColorStop(1, rgb(40, 34, 26, 0));
  L.C.save(); L.C.globalCompositeOperation = 'multiply'; L.C.fillStyle = gr; L.C.fillRect(x, y + h - 220, w, 220); L.C.restore();
  const gm = L.C.createLinearGradient(0, y + h - 470, 0, y + h - 280); gm.addColorStop(0, rgb(60, 52, 40, 0)); gm.addColorStop(0.5, rgb(60, 52, 40, 0.22)); gm.addColorStop(1, rgb(60, 52, 40, 0));
  L.C.fillStyle = gm; L.C.fillRect(x, y + h - 470, w, 190); // 手扶的高度
}
function edgeStrip(L, k, i) {
  const x = 1776 + i * 20, y = 1024, w = 20, h = 1024;
  const base = { ward: '#5f8675', wood: '#3b2414', fire: '#6c241d', cell: '#b9b5aa', metal: '#585e5e', swing: '#6f726e', chapel: '#2a1a0e' }[k];
  L.C.fillStyle = base; L.C.fillRect(x, y, w, h);
  noise(L.C, x, y, w, h, 2, 0.3);
  const metal = k === 'fire' || k === 'metal' || k === 'cell';
  for (let j = 0; j < 40; j++) blob(L.C, x + rnd() * w, y + rnd() * h, rr(1.5, 4), metal ? rgb(150, 150, 146) : rgb(210, 190, 160, 0.6));
  L.O.fillStyle = ormc(1, 0.6, metal ? 0.4 : 0); L.O.fillRect(x, y, w, h);
}
function swatches(L) {
  const S = (k) => REG.sw[k].px;
  { const [x, y, w, h] = S('kick'); L.C.fillStyle = '#9fa3a3'; L.C.fillRect(x, y, w, h); clip(L.C, x, y, w, h, () => lines(L.C, 90, () => { const sy = y + rnd() * h; L.C.strokeStyle = rgb(255, 255, 255, rr(0.03, 0.12)); L.C.lineWidth = 1; L.C.moveTo(x, sy); L.C.lineTo(x + w, sy + rr(-1, 1)); })); scratches(L, [x, y, w, h], 60, [60, 60, 58], 0.4, 0.5); for (let i = 0; i < 4; i++) { const cx = x + rnd() * w, cy = y + rnd() * h, r = rr(6, 14), g2 = L.H.createRadialGradient(cx, cy, 1, cx, cy, r); g2.addColorStop(0, hc(0.28)); g2.addColorStop(1, hc(0.5, 0)); L.H.fillStyle = g2; L.H.beginPath(); L.H.arc(cx, cy, r, 0, 7); L.H.fill(); } L.O.fillStyle = ormc(1, 0.36, 1); L.O.fillRect(x, y, w, h); }
  { const [x, y, w, h] = S('lever'); const gr = L.C.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#6e706e'); gr.addColorStop(0.5, '#d8dad6'); gr.addColorStop(1, '#7a7c7a'); L.C.fillStyle = gr; L.C.fillRect(x, y, w, h); const go = L.O.createLinearGradient(x, 0, x + w, 0); go.addColorStop(0, ormc(1, 0.5, 1)); go.addColorStop(0.5, ormc(1, 0.18, 1)); go.addColorStop(1, ormc(1, 0.5, 1)); L.O.fillStyle = go; L.O.fillRect(x, y, w, h); }
  const flat = { steel: ['#a9adad', 0.35, 1], black: ['#1e1f1f', 0.55, 0.3], rubber: ['#141414', 0.85, 0], brass: ['#9c7a3c', 0.32, 1], alu: ['#b4b8ba', 0.4, 1], chrome: ['#cfd3d4', 0.12, 1], hinge: ['#6a6656', 0.45, 0.9], iron: ['#2b2826', 0.65, 0.8], closer: ['#8e9290', 0.45, 0.6] };
  for (const [k, [c, r, m]] of Object.entries(flat)) { const [x, y, w, h] = S(k); L.C.fillStyle = c; L.C.fillRect(x, y, w, h); noise(L.C, x, y, w, h, 1.5, 0.25); L.O.fillStyle = ormc(1, r, m); L.O.fillRect(x, y, w, h); if (k === 'rubber') scuffs(L, 'ward', 0, 0, 0, 0, 0); }
  { const [x, y, w, h] = S('glass'); L.C.clearRect(x, y, w, h); L.C.fillStyle = rgb(150, 168, 172, 0.2); L.C.fillRect(x, y, w, h); for (let i = 0; i < 14; i++) { L.C.fillStyle = rgb(90, 85, 70, rr(0.05, 0.18)); L.C.beginPath(); L.C.ellipse(x + rnd() * w, y + rnd() * h, rr(4, 16), rr(6, 20), rr(-1, 1), 0, 7); L.C.fill(); } L.O.fillStyle = ormc(1, 0.08, 0); L.O.fillRect(x, y, w, h); }
  { const [x, y, w, h] = S('wire'); L.C.clearRect(x, y, w, h); L.C.fillStyle = rgb(150, 168, 172, 0.24); L.C.fillRect(x, y, w, h); L.C.strokeStyle = rgb(45, 45, 42, 0.85); L.C.lineWidth = 1.2; for (let i = -h; i < w + h; i += 10) { L.C.beginPath(); L.C.moveTo(x + i, y); L.C.lineTo(x + i + h, y + h); L.C.stroke(); L.C.beginPath(); L.C.moveTo(x + i + h, y); L.C.lineTo(x + i, y + h); L.C.stroke(); } L.O.fillStyle = ormc(1, 0.12, 0.2); L.O.fillRect(x, y, w, h); }
  { const [x, y, w, h] = S('leak'); const gr = L.C.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, '#9a9a9a'); gr.addColorStop(1, '#000000'); L.C.fillStyle = gr; L.C.fillRect(x, y, w, h); const sd = L.C.createLinearGradient(x, 0, x + w, 0); sd.addColorStop(0, 'rgba(0,0,0,1)'); sd.addColorStop(0.15, 'rgba(0,0,0,0)'); sd.addColorStop(0.85, 'rgba(0,0,0,0)'); sd.addColorStop(1, 'rgba(0,0,0,1)'); L.C.fillStyle = sd; L.C.fillRect(x, y, w, h); }
  const font = (px) => `bold ${px}px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif`;
  sticker(L, S('lblFire'), '#f0ece0', '防火門 請保持關閉', '#b0201a', font(13));
  { const [x, y, w, h] = S('lblStencil'); L.C.clearRect(x, y, w, h); L.C.fillStyle = 'rgba(230,226,214,0.92)'; L.C.font = font(22); L.C.textAlign = 'center'; L.C.textBaseline = 'middle'; L.C.fillText('閒人勿進', x + w / 2, y + h / 2); L.C.save(); L.C.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 60; i++) blob(L.C, x + rnd() * w, y + rnd() * h, rr(1, 3), 'rgba(0,0,0,0.8)'); L.C.restore(); L.O.fillStyle = ormc(1, 0.7, 0); L.O.fillRect(x, y, w, h); }
  sticker(L, S('lblWard'), '#e8e4d8', '請隨手關門', '#2a4a3a', font(16));
}

// 高度 → 法線(切線空間,OpenGL 慣例 +Y);寫進 out 的 y0..y1 列(分段做,不佔住主執行緒)
function toNormalRows(src, img, w, y0, y1, strength = 3.2) {
  const d = img.data;
  const hAt = (x, y) => src[(((y + w) % w) * w + ((x + w) % w)) * 4] / 255;
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const dx = (hAt(x + 1, y - 1) + 2 * hAt(x + 1, y) + hAt(x + 1, y + 1)) - (hAt(x - 1, y - 1) + 2 * hAt(x - 1, y) + hAt(x - 1, y + 1));
    const dy = (hAt(x - 1, y + 1) + 2 * hAt(x, y + 1) + hAt(x + 1, y + 1)) - (hAt(x - 1, y - 1) + 2 * hAt(x, y - 1) + hAt(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * w + x) * 4;
    d[k] = (nx * 0.5 + 0.5) * 255; d[k + 1] = (ny * 0.5 + 0.5) * 255; d[k + 2] = (nz * 0.5 + 0.5) * 255; d[k + 3] = 255;
  }
}

let CACHE = null;
// 建一次(整局共用):{ map, normalMap, orm, mats: { door, glass, leak }, ready: Promise, ms }
// 貼圖與材質立刻建好(程式、BatchedMesh 不用等);畫圖(約 0.5 秒的 canvas 工作)切成一小段一小段在閒置時段做完,
// 最後才一次上傳。畫完之前門是素色的(開機選單期間就畫完了)。
export function doorAtlas() {
  if (CACHE) return CACHE;
  const t0 = performance.now();
  const L = layers();
  const nc = document.createElement('canvas'); nc.width = nc.height = NR;
  { const g = nc.getContext('2d'); g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, NR, NR); }
  const map = new THREE.CanvasTexture(L.col);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const nrm = new THREE.CanvasTexture(nc); nrm.colorSpace = THREE.NoColorSpace; nrm.anisotropy = 8;
  const orm = new THREE.CanvasTexture(L.orm); orm.colorSpace = THREE.NoColorSpace; orm.anisotropy = 8;
  const door = new THREE.MeshStandardMaterial({ name: 'door:pbr', map, normalMap: nrm, normalScale: new THREE.Vector2(1, 1), roughnessMap: orm, metalnessMap: orm, aoMap: orm, roughness: 1, metalness: 1, alphaTest: 0.5, envMapIntensity: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ name: 'door:glass', map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2, forceSinglePass: true }); // [perf6] 平面玻璃一次畫完(見 surfaces.js)
  const leak = new THREE.MeshBasicMaterial({ name: 'door:leak', map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true });
  CACHE = { map, normalMap: nrm, orm, mats: { door, glass, leak }, ms: 0, slices: 0, done: false };
  // 畫圖步驟(順序固定:亂數序列與一次畫完時相同)
  let src = null, img = null;
  const steps = [() => { seed = 20261027; NT = noiseTile(); }];
  for (const f of Object.keys(FACES)) steps.push(() => DRAW[f](L, f));
  steps.push(() => FRAMES.forEach((k, i) => frameSwatch(L, k, i)), () => EDGES.forEach((k, i) => edgeStrip(L, k, i)), () => swatches(L));
  steps.push(() => { src = L.hgt.getContext('2d').getImageData(0, 0, NR, NR).data; img = nc.getContext('2d').createImageData(NR, NR); });
  for (let y = 0; y < NR; y += 128) steps.push(() => toNormalRows(src, img, NR, y, y + 128));
  steps.push(() => { nc.getContext('2d').putImageData(img, 0, 0); src = img = null; map.needsUpdate = nrm.needsUpdate = orm.needsUpdate = true; });
  const ric = typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 120 }) : (cb) => setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), 16);
  let i = 0, work = 0;
  CACHE.ready = new Promise((res) => {
    const pump = (dl) => {
      do { const a = performance.now(); steps[i++](); work += performance.now() - a; } while (i < steps.length && !dl.didTimeout && dl.timeRemaining() > 12);
      CACHE.slices++;
      if (i < steps.length) ric(pump);
      else { CACHE.ms = Math.round(work); CACHE.done = true; CACHE.wall = Math.round(performance.now() - t0); res(CACHE); }
    };
    ric(pump);
  });
  CACHE.ms = Math.round(performance.now() - t0);
  return CACHE;
}
