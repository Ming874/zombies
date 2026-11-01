import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { paintTextures, texturesReady } from '../../../sys/texworker.js';
import { OUTDOOR } from '../../../art/stainset.js';

// 戶外道具的額外材質(registerMat 註冊共用鍵,靜態物件才能依材質合併)與程式貼圖。
// 貼圖集:po_decal(透明貼花:血跡/污漬/墓誌銘/車身塗裝/地面標線/塗鴉)、po_label(不透明:車牌/告示/海報/刻字)。

// ---------- 程式貼圖工具 ----------
let seed = 90210;
export const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
export const rr = (a, b) => a + R() * (b - a);
export const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
// 可平鋪值雜訊 fbm(cx, cy 為最粗格數)
export function fbm(W, H, cx, cy, oct) {
  const out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const nx = cx << o, ny = cy << o, g = new Float32Array(nx * ny);
    for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * ny, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty), r0 = iy * nx, r1 = ((iy + 1) % ny) * nx;
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * nx, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), ix1 = (ix + 1) % nx;
        const a = g[r0 + ix], b = g[r0 + ix1], c = g[r1 + ix], d = g[r1 + ix1];
        out[y * W + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// 逐像素繪製 RGBA(0..1)
export function pixels(W, H, fn) {
  const [c, ctx] = canvas(W, H);
  const img = ctx.createImageData(W, H), d = img.data, o = [0, 0, 0, 1];
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
    o[3] = 1;
    fn(x, y, i, o);
    d[i * 4] = cl(o[0]) * 255; d[i * 4 + 1] = cl(o[1]) * 255; d[i * 4 + 2] = cl(o[2]) * 255; d[i * 4 + 3] = cl(o[3]) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const lazy = (fn) => { let v; return () => (v ??= fn()); };
// [perf] generator 版的 lazy:f() 同步跑完剩下的步驟;f.step() 跑一步,做完回傳 true
export const lazySteps = (gen) => {
  let v, it = null;
  const f = () => { if (v === undefined) { it ??= gen(); let r; while (!(r = it.next()).done); v = r.value; } return v; };
  f.step = () => { if (v !== undefined) return true; it ??= gen(); const r = it.next(); if (r.done) v = r.value; return r.done; };
  return f;
};
export const FONT_TC = '"Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';
export const FONT_KAI = '"DFKai-SB","BiauKai","KaiTi","STKaiti","PMingLiU",serif';
export const FONT_PLATE = '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif';

// ---------- 夜空環境貼圖(車漆/玻璃/鍍鉻的反射)----------
export const NIGHT_ENV = lazy(() => {
  const W = 512, H = 256, n = fbm(W, H, 6, 3, 4);
  const c = pixels(W, H, (x, y, i, o) => {
    const v = y / H;
    let r, g, b;
    if (v < 0.5) { const t = v / 0.5; r = 0.05 + t * 0.07; g = 0.065 + t * 0.075; b = 0.1 + t * 0.07; } // 天空:頂暗、近地平線較亮
    else { const t = (v - 0.5) / 0.5; r = 0.1 - t * 0.08; g = 0.1 - t * 0.085; b = 0.1 - t * 0.085; }
    const cloud = ss(0.45, 0.8, n[i]) * (v < 0.5 ? 0.06 : 0);
    r += cloud; g += cloud; b += cloud * 1.1;
    const glow = Math.exp(-(((v - 0.49) / 0.035) ** 2)) * 0.22; // 遠方城市鈉燈光暈
    r += glow; g += glow * 0.55; b += glow * 0.25;
    const dm = Math.hypot((x - 360) / W * 2, (y - 60) / H); // 月亮
    const moon = Math.exp(-((dm / 0.035) ** 2)) * 1.6 + Math.exp(-((dm / 0.15) ** 2)) * 0.12;
    o[0] = r + moon * 0.8; o[1] = g + moon * 0.86; o[2] = b + moon;
  });
  const t = tex(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
});

// ---------- 車漆髒污遮罩(線性):R=煤灰暗化、B=1-鏽、A=灰塵量;v = 高度/2m ----------
const GRIME = lazy(() => {
  const W = 512, H = 512;
  const n1 = fbm(W, H, 4, 4, 5), n2 = fbm(W, H, 24, 24, 3), n3 = fbm(W, H, 16, 2, 3), n4 = fbm(W, H, 8, 8, 4), n5 = fbm(W, H, 3, 2, 3);
  const c = pixels(W, H, (x, y, i, o) => {
    const h = (1 - y / H) * 2; // 公尺
    const mud = ss(0.62, 0.1, h) * (0.45 + 0.75 * n1[i]) + ss(0.42, 0.18, h) * ss(0.55, 0.75, n2[i]) * 0.6;
    const streak = Math.max(0, n3[i] - 0.66) * 3 * ss(0.15, 0.5, h) * ss(1.5, 0.75, h) * ss(0.45, 0.7, n5[i]);
    const dust = 0.06 + 0.28 * ss(0.3, 0.85, n1[i]) + 0.1 * n4[i];
    const rust = Math.max(0, n2[i] - 0.66) * 3.5 * ss(0.55, 0.15, h) * ss(0.4, 0.65, n4[i]);
    o[0] = 1 - mud * 0.35 - streak * 0.25 - Math.max(0, n4[i] - 0.7) * 0.4;
    o[1] = 1;
    o[2] = 1 - cl(rust);
    o[3] = cl(dust + mud * 0.8 + streak * 0.35);
  });
  return tex(c, { srgb: false });
});

// 車漆:灰塵/泥巴/鏽以遮罩混色(onBeforeCompile 注入)
const DUST = new THREE.Color(0x8a8272), RUST = new THREE.Color(0x5a2a12);
function paintMat(color, { rough = 0.42, metal = 0.35, dust = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map: GRIME(), envMap: NIGHT_ENV(), envMapIntensity: 0.9 });
  m.userData.dust = dust;
  m.onBeforeCompile = (s) => {
    s.uniforms.dustCol = { value: DUST };
    s.uniforms.rustCol = { value: RUST };
    s.uniforms.dustAmt = { value: dust };
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform vec3 dustCol;\nuniform vec3 rustCol;\nuniform float dustAmt;\nvoid main() {\n\tfloat dA = 0.0; float rA = 0.0;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
\tvec4 gm = texture2D( map, vMapUv );
\tdA = clamp( gm.a * dustAmt, 0.0, 1.0 ); rA = 1.0 - gm.b;
\tdiffuseColor.rgb *= gm.r;
\tdiffuseColor.rgb = mix( diffuseColor.rgb, dustCol, dA );
\tdiffuseColor.rgb = mix( diffuseColor.rgb, rustCol, rA );
#endif`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.95, max( dA, rA ) );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= 1.0 - max( dA, rA );');
  };
  m.customProgramCacheKey = () => 'po_paint';
  return m;
}

// ---------- 髒玻璃 / 碎裂玻璃(sRGB,A=不透明度)----------
const GLASS_DIRT = lazy(() => {
  const W = 256, H = 256, n = fbm(W, H, 4, 4, 4), s = fbm(W, H, 32, 2, 3);
  return tex(pixels(W, H, (x, y, i, o) => {
    const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
    const edge = ss(0.16, 0.0, Math.min(ex, ey));
    const dirt = cl(0.25 * n[i] + edge * 0.55 + Math.max(0, s[i] - 0.6) * 1.2 * (y / H));
    o[0] = 0.05 + dirt * 0.5; o[1] = 0.06 + dirt * 0.47; o[2] = 0.07 + dirt * 0.42;
    o[3] = 0.32 + dirt * 0.6;
  }), { repeat: false });
});
const GLASS_CRACK = lazy(() => {
  const W = 512, H = 512;
  const c = GLASS_DIRT().image;
  const [cc, ctx] = canvas(W, H);
  ctx.drawImage(c, 0, 0, W, H);
  const hit = (px, py, n) => {
    ctx.lineCap = 'round';
    for (let k = 0; k < n; k++) { // 放射狀裂痕
      let a = (k / n) * Math.PI * 2 + rr(-0.2, 0.2), x = px, y = py;
      ctx.beginPath(); ctx.moveTo(x, y);
      const len = rr(80, 300);
      for (let d = 0; d < len; d += rr(8, 22)) { a += rr(-0.35, 0.35); x += Math.cos(a) * 14; y += Math.sin(a) * 14; ctx.lineTo(x, y); }
      ctx.strokeStyle = `rgba(225,230,232,${rr(0.55, 0.9)})`; ctx.lineWidth = rr(0.8, 2); ctx.stroke();
    }
    for (let ring = 1; ring <= 4; ring++) { // 同心環
      const rad = ring * rr(14, 26);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += rr(0.25, 0.5)) { const rj = rad * rr(0.85, 1.15); ctx.lineTo(px + Math.cos(a) * rj, py + Math.sin(a) * rj); }
      ctx.strokeStyle = `rgba(220,225,228,${0.7 - ring * 0.12})`; ctx.lineWidth = 1; ctx.stroke();
    }
    const g = ctx.createRadialGradient(px, py, 0, px, py, 26); // 撞擊點粉碎區
    g.addColorStop(0, 'rgba(230,235,235,0.95)'); g.addColorStop(1, 'rgba(230,235,235,0)');
    ctx.fillStyle = g; ctx.fillRect(px - 30, py - 30, 60, 60);
  };
  hit(W * 0.38, H * 0.45, 22);
  hit(W * 0.7, H * 0.6, 14);
  return tex(cc, { repeat: false });
});

// 乾草/雜草卡片(alphaTest)
const GRASS_CARD = lazy(() => {
  const [c, ctx] = canvas(256, 256);
  for (let k = 0; k < 70; k++) {
    const x = rr(10, 246), h = rr(80, 245), lean = rr(-40, 40), w = rr(2, 5);
    const t = R(), col = t < 0.45 ? [rr(110, 150), rr(100, 130), rr(50, 70)] : t < 0.8 ? [rr(70, 100), rr(85, 110), rr(40, 60)] : [rr(55, 75), rr(50, 65), rr(35, 45)];
    ctx.fillStyle = `rgb(${col.map((v) => v | 0).join(',')})`;
    ctx.beginPath(); ctx.moveTo(x - w, 256); ctx.quadraticCurveTo(x + lean * 0.3, 256 - h * 0.6, x + lean, 256 - h); ctx.quadraticCurveTo(x + lean * 0.3 + w * 0.3, 256 - h * 0.6, x + w, 256); ctx.fill();
  }
  const t = tex(c, { repeat: false });
  return t;
});
// 枯葉卡片(alphaTest)
const LEAF_CARD = lazy(() => {
  const [c, ctx] = canvas(256, 256);
  for (let k = 0; k < 46; k++) {
    const x = rr(14, 242), y = rr(14, 242), s = rr(7, 15), a = rr(0, Math.PI * 2);
    const col = [rr(70, 130), rr(45, 80), rr(20, 40)].map((v) => v | 0);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = `rgb(${col.join(',')})`;
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.7, s, 0); ctx.quadraticCurveTo(0, s * 0.7, -s, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
    ctx.restore();
  }
  return tex(c, { repeat: false });
});
// ---------- 透明貼花圖集 po_decal(2048×2048)----------
// 每格 256;以名稱取 UV 矩形
const DECAL_RECTS = {};
const cell = (name, cx, cy, cw = 1, ch = 1) => { DECAL_RECTS[name] = [cx * 256, cy * 256, cw * 256, ch * 256]; };
['blood1', 'blood2', 'blood3', 'hand', 'drip', 'pool', 'oil', 'water'].forEach((n, i) => cell(n, i, 0));
['rust', 'rustrun', 'soot', 'moss', 'mud', 'crack', 'leaves', 'butts'].forEach((n, i) => cell(n, i, 1));
for (let i = 0; i < 8; i++) cell(`epi${i}`, i, 2);
cell('smear', 0, 3, 2, 1); cell('g_help', 2, 3, 2, 1); cell('g_dont', 4, 3, 2, 1); cell('g_tally', 6, 3, 1, 1); cell('g_eye', 7, 3, 1, 1);
cell('pol_text', 0, 4, 2, 1); cell('pol_en', 2, 4, 2, 1); cell('pol_110', 4, 4, 1, 1); cell('pol_band', 5, 4, 3, 1);
cell('amb_text', 0, 5, 2, 1); cell('amb_mirror', 2, 5, 2, 1); cell('amb_star', 4, 5, 1, 1); cell('amb_119', 5, 5, 1, 1); cell('amb_band', 6, 5, 2, 1);
cell('amb_hosp', 0, 6, 4, 1); cell('road_amb', 4, 6, 3, 1); cell('road_arrow', 7, 6, 1, 1);
cell('road_no', 0, 7, 3, 1); cell('g_still', 3, 7, 3, 1); cell('cross_paint', 6, 7, 1, 1); cell('road_p', 7, 7, 1, 1);
cell('shards', 0, 8); cell('chalk', 1, 8, 2, 1); cell('steps', 3, 8, 2, 1); cell('skid', 5, 8, 3, 1);
cell('bullets', 0, 9); cell('burn', 1, 9); cell('vomit', 2, 9); cell('wax', 3, 9); cell('ashes', 4, 9); cell('paw', 5, 9); cell('water2', 6, 9); cell('stain2', 7, 9);

export function splat(ctx, x, y, r, col, n = 18) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < n; k++) { // 濺點
    const a = R() * Math.PI * 2, d = r * rr(0.8, 2.6), s = r * rr(0.04, 0.22);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, Math.PI * 2); ctx.fill();
    if (R() < 0.4) { ctx.lineWidth = s * 0.8; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.stroke(); }
  }
  for (let k = 0; k < 9; k++) { // 不規則邊緣
    const a = R() * Math.PI * 2;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * rr(0.3, 0.55), 0, Math.PI * 2); ctx.fill();
  }
}
export const BLOOD = (a = 0.92) => `rgba(${rr(70, 95) | 0},${rr(6, 14) | 0},${rr(6, 12) | 0},${a})`;
export function softBlob(ctx, x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(0.6, `rgba(${rgb},${a * 0.6})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function text(ctx, s, x, y, size, { font = FONT_TC, color = '#000', weight = 'bold', align = 'center', base = 'middle', stretch = 1, stroke = null } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(stretch, 1);
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.strokeStyle = stroke[0]; ctx.lineWidth = stroke[1]; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = color; ctx.fillText(s, 0, 0);
  ctx.restore();
}
// 用雜訊挖掉部分像素(磨損、剝落)
export function wear(ctx, x, y, w, h, amt, scale = 6) {
  const img = ctx.getImageData(x, y, w, h), d = img.data, n = fbm(w, h, scale, Math.max(1, Math.round(scale * h / w)), 3);
  for (let i = 0; i < w * h; i++) { const k = ss(1 - amt - 0.08, 1 - amt + 0.08, n[i]); d[i * 4 + 3] *= 1 - k; }
  ctx.putImageData(img, x, y);
}
const DH = 2560;
const DECAL_TEX = lazySteps(function* () { // [perf] 分段:每一格之後 yield(prepareOutdoorSteps 一格一格畫;直接呼叫則同步畫完)
  const [c, ctx] = canvas(2048, DH);
  const C = (n) => DECAL_RECTS[n];
  const inCell = (n, fn) => { const [x, y, w, h] = C(n); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); };
  // 血跡
  yield;
  inCell('blood1', () => { splat(ctx, 128, 128, 44, BLOOD()); softBlob(ctx, 128, 128, 30, '40,4,4', 0.5); });
  yield;
  inCell('blood2', () => { for (let k = 0; k < 5; k++) splat(ctx, rr(70, 186), rr(70, 186), rr(10, 26), BLOOD(0.85), 8); });
  yield;
  inCell('blood3', () => { splat(ctx, 128, 90, 30, BLOOD()); for (let k = 0; k < 6; k++) { ctx.fillStyle = BLOOD(0.85); const x = rr(100, 156), w = rr(3, 7); ctx.fillRect(x, 90, w, rr(60, 160)); ctx.beginPath(); ctx.arc(x + w / 2, 90 + rr(60, 160), w * 0.9, 0, 7); ctx.fill(); } });
  yield;
  inCell('hand', () => {
    ctx.fillStyle = BLOOD(0.9);
    ctx.beginPath(); ctx.ellipse(128, 160, 42, 50, 0, 0, 7); ctx.fill();
    [[-38, -52, 0.5], [-14, -72, 0.15], [10, -74, -0.05], [32, -62, -0.2]].forEach(([dx, dy, a]) => { ctx.save(); ctx.translate(128 + dx, 150 + dy); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 11, 34, 0, 0, 7); ctx.fill(); ctx.restore(); });
    ctx.save(); ctx.translate(76, 176); ctx.rotate(-0.9); ctx.beginPath(); ctx.ellipse(0, 0, 12, 30, 0, 0, 7); ctx.fill(); ctx.restore();
    for (let k = 0; k < 5; k++) { const x = rr(96, 168); ctx.fillRect(x, 190, rr(3, 6), rr(20, 60)); }
    wear(ctx, 0, 0, 256, 256, 0.25, 10);
  });
  yield;
  inCell('drip', () => { for (let k = 0; k < 9; k++) { ctx.fillStyle = BLOOD(rr(0.6, 0.95)); const x = rr(20, 236), w = rr(3, 9), l = rr(60, 240); ctx.fillRect(x, 0, w, l); ctx.beginPath(); ctx.arc(x + w / 2, l, w * 0.8, 0, 7); ctx.fill(); } });
  yield;
  inCell('pool', () => { ctx.fillStyle = 'rgba(45,4,4,0.95)'; ctx.beginPath(); for (let a = 0; a < 6.3; a += 0.3) { const r = rr(70, 110); ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 0.8); } ctx.fill(); softBlob(ctx, 128, 128, 120, '30,2,2', 0.4); });
  yield;
  inCell('oil', () => { softBlob(ctx, 128, 128, 120, '8,8,8', 0.75); softBlob(ctx, 110, 140, 70, '0,0,0', 0.5); for (let k = 0; k < 6; k++) softBlob(ctx, rr(40, 216), rr(40, 216), rr(10, 30), '5,5,5', 0.5); });
  yield;
  inCell('water', () => { softBlob(ctx, 128, 128, 124, '20,20,18', 0.45); wear(ctx, 0, 0, 256, 256, 0.3, 5); });
  yield;
  inCell('rust', () => { softBlob(ctx, 128, 128, 110, '95,45,18', 0.8); softBlob(ctx, 128, 128, 50, '70,30,10', 0.6); wear(ctx, 0, 0, 256, 256, 0.25, 8); });
  yield;
  inCell('rustrun', () => { for (let k = 0; k < 7; k++) { const x = rr(40, 216), w = rr(8, 26); const g = ctx.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(110,50,20,0.85)'); g.addColorStop(1, 'rgba(110,50,20,0)'); ctx.fillStyle = g; ctx.fillRect(x, 0, w, rr(120, 256)); } wear(ctx, 0, 0, 256, 256, 0.2, 10); });
  yield;
  inCell('soot', () => { softBlob(ctx, 128, 150, 120, '10,8,6', 0.85); softBlob(ctx, 128, 60, 90, '15,12,10', 0.6); wear(ctx, 0, 0, 256, 256, 0.2, 6); });
  yield;
  inCell('moss', () => { for (let k = 0; k < 40; k++) softBlob(ctx, rr(30, 226), rr(30, 226), rr(8, 30), `${rr(40, 60) | 0},${rr(60, 80) | 0},${rr(25, 35) | 0}`, 0.7); });
  yield;
  inCell('mud', () => { for (let k = 0; k < 30; k++) softBlob(ctx, rr(20, 236), rr(60, 250), rr(6, 28), '60,45,30', 0.7); });
  yield;
  inCell('crack', () => { ctx.strokeStyle = 'rgba(10,10,10,0.85)'; for (let k = 0; k < 4; k++) { let x = 128, y = 128, a = R() * 7; ctx.lineWidth = rr(1, 3); ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 14; s++) { a += rr(-0.6, 0.6); x += Math.cos(a) * 10; y += Math.sin(a) * 10; ctx.lineTo(x, y); } ctx.stroke(); } });
  yield;
  inCell('leaves', () => { ctx.drawImage(LEAF_CARD().image, 0, 0, 256, 256); });
  yield;
  inCell('butts', () => { for (let k = 0; k < 14; k++) { ctx.save(); ctx.translate(rr(20, 236), rr(20, 236)); ctx.rotate(R() * 7); ctx.fillStyle = '#d8d0c0'; ctx.fillRect(-9, -2.5, 12, 5); ctx.fillStyle = '#b07a3a'; ctx.fillRect(3, -2.5, 7, 5); ctx.fillStyle = '#222'; ctx.fillRect(-10, -2.5, 2, 5); ctx.restore(); } softBlob(ctx, 128, 128, 60, '40,40,40', 0.25); });
  // 墓誌銘(刻字:暗色字 + 亮邊)
  const epis = [['✝', '安息主懷', '1931 — 1968'], ['', '陳 公 志 明 之 墓', '民國五十七年'], ['✝', 'R.I.P.', 'MARIA LIN'], ['', '林 氏 秀 英', '慈母 安息'], ['✝', 'IN MEMORIAM', '1955'], ['', '無名氏', '聖心醫院 代葬'], ['✝', '主內安息', '王 若 瑟'], ['', '慈父 安息', '永遠懷念']];
  epis.forEach(([a, b, d], i) => inCell(`epi${i}`, () => {
    const eng = (s, y, sz, f) => { text(ctx, s, 129, y + 1.5, sz, { font: f, color: 'rgba(235,230,215,0.35)', weight: 'normal' }); text(ctx, s, 128, y, sz, { font: f, color: 'rgba(25,22,18,0.9)', weight: 'normal' }); };
    if (a) eng(a, 52, 54, 'serif');
    const lat = /^[A-Z.]/.test(b);
    eng(b, 128, lat ? 30 : b.length > 5 ? 26 : 34, lat ? 'Georgia,serif' : FONT_KAI);
    eng(d, 196, /[A-Z]/.test(d) ? 22 : 22, /[A-Z]/.test(d) ? 'Georgia,serif' : FONT_KAI);
    wear(ctx, 0, 0, 256, 256, 0.18, 12);
  }));
  // 塗鴉、拖行血痕
  yield;
  inCell('smear', (w, h) => { ctx.strokeStyle = BLOOD(0.8); ctx.lineCap = 'round'; for (let k = 0; k < 4; k++) { ctx.lineWidth = rr(18, 40); ctx.beginPath(); ctx.moveTo(20, h / 2 + rr(-30, 30)); ctx.bezierCurveTo(180, h / 2 + rr(-50, 50), 320, h / 2 + rr(-50, 50), w - 20, h / 2 + rr(-20, 20)); ctx.stroke(); } wear(ctx, 0, 0, w, h, 0.35, 16); });
  const graffiti = (n, s, size, col) => inCell(n, (w, h) => { ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(rr(-0.08, 0.08)); text(ctx, s, 0, 0, size, { color: col, font: FONT_TC, weight: '900' }); ctx.restore(); for (let k = 0; k < 8; k++) { ctx.fillStyle = col; ctx.fillRect(rr(40, w - 40), h / 2 + size * 0.35, rr(2, 4), rr(10, 60)); } wear(ctx, 0, 0, w, h, 0.15, 10); });
  graffiti('g_help', '救 命', 150, 'rgba(120,10,8,0.92)');
  graffiti('g_dont', '別 進 去', 120, 'rgba(20,20,20,0.9)');
  graffiti('g_still', '他們還在裡面', 104, 'rgba(110,12,10,0.9)');
  yield;
  inCell('g_tally', () => { ctx.strokeStyle = 'rgba(30,25,20,0.9)'; ctx.lineWidth = 5; for (let g = 0; g < 4; g++) { const ox = 20 + (g % 2) * 118, oy = 30 + Math.floor(g / 2) * 110; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(ox + k * 20, oy); ctx.lineTo(ox + k * 20 + rr(-4, 4), oy + 80); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(ox - 8, oy + 70); ctx.lineTo(ox + 76, oy + 10); ctx.stroke(); } });
  yield;
  inCell('g_eye', () => { ctx.strokeStyle = 'rgba(15,15,15,0.9)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(128, 128, 100, 52, 0, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(110,10,8,0.9)'; ctx.beginPath(); ctx.arc(128, 128, 34, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(10,10,10,0.95)'; ctx.beginPath(); ctx.arc(128, 128, 14, 0, 7); ctx.fill(); });
  // 警車塗裝
  yield;
  inCell('pol_text', (w, h) => text(ctx, '警 察', w / 2, h / 2 + 6, 170, { color: '#1d3f8f', weight: '900' }));
  yield;
  inCell('pol_en', (w, h) => text(ctx, 'POLICE', w / 2, h / 2 + 4, 150, { color: '#1d3f8f', weight: '900', font: 'Arial Black,Arial,sans-serif', stretch: 0.9 }));
  yield;
  inCell('pol_110', (w, h) => text(ctx, '110', w / 2, h / 2 + 4, 150, { color: '#1d3f8f', weight: '900', font: 'Arial Black,Arial,sans-serif', stretch: 0.8 }));
  yield;
  inCell('pol_band', (w, h) => { ctx.fillStyle = '#1d3f8f'; ctx.fillRect(0, 70, w, 116); for (let x = 0; x < w; x += 58) { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x, 70 + ((x / 58) % 2) * 58, 58, 58); } ctx.fillStyle = '#c8a020'; ctx.fillRect(0, 60, w, 10); ctx.fillRect(0, 186, w, 10); });
  // 救護車塗裝
  yield;
  inCell('amb_text', (w, h) => text(ctx, '救 護 車', w / 2, h / 2 + 6, 150, { color: '#c01818', weight: '900' }));
  yield;
  inCell('amb_mirror', (w, h) => { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); text(ctx, '救 護 車', w / 2, h / 2 + 6, 150, { color: '#c01818', weight: '900' }); ctx.restore(); });
  yield;
  inCell('amb_star', (w, h) => {
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.fillStyle = '#1f4fb0';
    for (let k = 0; k < 3; k++) { ctx.save(); ctx.rotate((k * Math.PI) / 3); ctx.fillRect(-26, -110, 52, 220); ctx.restore(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 80); ctx.lineTo(0, -80); ctx.stroke();
    ctx.beginPath(); for (let t = -70; t <= 70; t += 4) ctx.lineTo(Math.sin(t * 0.12) * 18, t); ctx.stroke();
    ctx.restore();
  });
  yield;
  inCell('amb_119', (w, h) => text(ctx, '119', w / 2, h / 2 + 4, 150, { color: '#c01818', weight: '900', font: 'Arial Black,Arial,sans-serif', stretch: 0.8 }));
  yield;
  inCell('amb_band', (w, h) => { ctx.fillStyle = '#c01818'; ctx.fillRect(0, 80, w, 70); ctx.fillStyle = '#e8b020'; ctx.fillRect(0, 160, w, 16); for (let x = 0; x < w; x += 64) { ctx.fillStyle = '#c01818'; ctx.fillRect(x, 186, 32, 30); } });
  yield;
  inCell('amb_hosp', (w, h) => { text(ctx, '聖心醫院', w * 0.3, h / 2, 120, { color: '#c01818', weight: '900' }); text(ctx, 'SACRED HEART HOSPITAL', w * 0.72, h / 2 + 8, 66, { color: '#c01818', weight: 'bold', font: 'Arial,sans-serif', stretch: 0.8 }); });
  // 地面標線(黃漆,磨損)
  yield;
  inCell('road_amb', (w, h) => { text(ctx, '救護車專用', w / 2, h / 2, 150, { color: 'rgba(214,170,30,0.95)', weight: '900', stretch: 1.0 }); wear(ctx, 0, 0, w, h, 0.42, 14); });
  yield;
  inCell('road_arrow', (w, h) => { ctx.fillStyle = 'rgba(225,225,215,0.92)'; ctx.beginPath(); ctx.moveTo(128, 18); ctx.lineTo(210, 110); ctx.lineTo(156, 110); ctx.lineTo(156, 238); ctx.lineTo(100, 238); ctx.lineTo(100, 110); ctx.lineTo(46, 110); ctx.closePath(); ctx.fill(); wear(ctx, 0, 0, w, h, 0.45, 10); });
  yield;
  inCell('road_no', (w, h) => { text(ctx, '禁止停車', w / 2, h / 2, 160, { color: 'rgba(210,40,30,0.9)', weight: '900' }); wear(ctx, 0, 0, w, h, 0.45, 14); });
  yield;
  inCell('road_p', (w, h) => { text(ctx, 'P', w / 2, h / 2 + 10, 220, { color: 'rgba(225,225,215,0.9)', weight: '900', font: 'Arial Black,Arial' }); wear(ctx, 0, 0, w, h, 0.45, 10); });
  yield;
  inCell('cross_paint', () => { ctx.fillStyle = 'rgba(200,30,25,0.9)'; ctx.fillRect(98, 30, 60, 196); ctx.fillRect(30, 98, 196, 60); wear(ctx, 0, 0, 256, 256, 0.3, 10); });
  // 碎玻璃(亮點)、粉筆人形、血腳印、煞車痕
  yield;
  inCell('shards', () => { for (let k = 0; k < 160; k++) { const x = 128 + (R() - 0.5) * 220 * R(), y = 128 + (R() - 0.5) * 220 * R(), s = rr(1.5, 6); ctx.fillStyle = `rgba(${rr(170, 235) | 0},${rr(190, 240) | 0},${rr(200, 245) | 0},${rr(0.5, 0.95)})`; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * rr(0.4, 1), y + s * rr(0.2, 0.8)); ctx.lineTo(x - s * rr(0.4, 1), y + s * rr(0.1, 0.7)); ctx.fill(); } });
  yield;
  inCell('chalk', (w, h) => {
    ctx.strokeStyle = 'rgba(230,230,220,0.85)'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(70, 120, 30, 34, 0, 0, 7); ctx.stroke(); // 頭
    ctx.beginPath(); ctx.moveTo(98, 100); ctx.lineTo(150, 40); ctx.lineTo(176, 52); ctx.lineTo(130, 104); ctx.lineTo(300, 92); ctx.lineTo(380, 30); ctx.lineTo(400, 46); ctx.lineTo(330, 110); ctx.lineTo(470, 96); ctx.lineTo(474, 120);
    ctx.lineTo(330, 140); ctx.lineTo(420, 210); ctx.lineTo(400, 226); ctx.lineTo(300, 150); ctx.lineTo(132, 146); ctx.lineTo(160, 220); ctx.lineTo(136, 228); ctx.lineTo(98, 140); ctx.stroke();
    splat(ctx, 70, 150, 26, 'rgba(60,8,6,0.75)', 10);
  });
  yield;
  inCell('steps', (w, h) => { for (let k = 0; k < 7; k++) { const x = 40 + k * 64, y = h / 2 + (k % 2 ? 26 : -26); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 2 + rr(-0.15, 0.15)); ctx.fillStyle = `rgba(80,8,6,${0.9 - k * 0.1})`; ctx.beginPath(); ctx.ellipse(0, -10, 13, 22, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 22, 10, 12, 0, 0, 7); ctx.fill(); ctx.restore(); } wear(ctx, 0, 0, w, h, 0.2, 12); });
  yield;
  inCell('skid', (w, h) => { for (const y of [70, 186]) { const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(8,8,8,0)'); g.addColorStop(0.25, 'rgba(8,8,8,0.7)'); g.addColorStop(1, 'rgba(8,8,8,0.85)'); ctx.fillStyle = g; ctx.fillRect(0, y - 22, w, 44); } wear(ctx, 0, 0, w, h, 0.25, 20); });
  yield;
  inCell('bullets', () => { for (let k = 0; k < 9; k++) { const x = rr(30, 226), y = rr(30, 226); softBlob(ctx, x, y, 14, '20,18,16', 0.8); ctx.fillStyle = 'rgba(5,5,5,0.95)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); } });
  yield;
  inCell('burn', () => { softBlob(ctx, 128, 128, 120, '6,5,4', 0.9); softBlob(ctx, 128, 128, 70, '0,0,0', 0.7); });
  yield;
  inCell('vomit', () => { for (let k = 0; k < 20; k++) softBlob(ctx, 128 + rr(-70, 70), 128 + rr(-50, 50), rr(10, 40), '70,72,30', 0.7); });
  yield;
  inCell('wax', () => { for (let k = 0; k < 14; k++) softBlob(ctx, 128 + rr(-90, 90), 128 + rr(-90, 90), rr(6, 22), '220,210,180', 0.85); });
  yield;
  inCell('ashes', () => { for (let k = 0; k < 50; k++) { const g = rr(40, 95) | 0; softBlob(ctx, 128 + rr(-100, 100), 128 + rr(-100, 100), rr(6, 30), `${g},${g - 2},${g - 4}`, 0.7); } });
  yield;
  inCell('paw', () => { for (let k = 0; k < 6; k++) { const x = 30 + k * 38, y = 128 + (k % 2 ? 20 : -20); ctx.fillStyle = 'rgba(70,8,6,0.85)'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); for (const a of [-0.7, -0.25, 0.25, 0.7]) { ctx.beginPath(); ctx.arc(x + Math.sin(a) * 13, y - Math.cos(a) * 13, 4, 0, 7); ctx.fill(); } } });
  yield;
  inCell('water2', () => { softBlob(ctx, 128, 128, 120, '10,12,12', 0.55); });
  yield;
  inCell('stain2', () => { for (let k = 0; k < 8; k++) softBlob(ctx, 128 + rr(-60, 60), 128 + rr(-60, 60), rr(30, 70), '40,30,20', 0.35); });
  // 血跡格(噴濺、滴落、手印、垂流、血泊、拖痕、鞋印):寫實版在貼圖 Worker 畫好後蓋掉上面的簡圖(src/art/stainset.js OUTDOOR)。
  // 這張 2048×2560 的畫布等血跡格畫好才第一次上傳(只上傳一次;之前材質綁的是空貼圖)
  const t = new THREE.Texture();
  t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  const names = Object.keys(OUTDOOR).filter((n) => DECAL_RECTS[n]);
  const T = paintTextures('art/stains:outdoor', { seed: 1 }, Object.fromEntries(names.map((n) => [n, { wrap: false }])));
  texturesReady().then(() => {
    for (const n of names) {
      const img = T[n].image, [x, y, w, h] = DECAL_RECTS[n];
      if (!img) continue;
      ctx.clearRect(x, y, w, h);
      ctx.save();
      if (!T[n].flipY) { ctx.translate(0, y * 2 + h); ctx.scale(1, -1); } // Worker 的 ImageBitmap 已上下翻轉
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      img.close?.(); T[n].image = null; // 畫進圖集後就不需要了
    }
    t.image = c; t.needsUpdate = true;
  });
  return t;
});
export const decalUV = (name) => { const [x, y, w, h] = DECAL_RECTS[name]; return [x / 2048, 1 - (y + h) / DH, w / 2048, h / DH]; };

// ---------- 不透明標籤圖集 po_label(2048×1024)----------
const LABEL_RECTS = {};
const lcell = (name, x, y, w, h) => { LABEL_RECTS[name] = [x, y, w, h]; };
for (let i = 0; i < 16; i++) lcell(`plate${i}`, (i % 4) * 256, Math.floor(i / 4) * 128, 256, 128); // 車牌(0..1024, 0..512)
lcell('er_sign', 1024, 0, 1024, 256); lcell('hosp_stone', 1024, 256, 1024, 256);
lcell('plaque', 0, 512, 512, 256); lcell('poster', 512, 512, 256, 384); lcell('poster2', 768, 512, 256, 384);
lcell('pay', 1024, 512, 256, 256); lcell('hv', 1280, 512, 256, 128); lcell('bio', 1280, 640, 256, 128);
lcell('exit', 1536, 512, 256, 128); lcell('staff', 1536, 640, 256, 128); lcell('ambonly', 1792, 512, 256, 128); lcell('nopark', 1792, 640, 256, 128);
lcell('gauge', 1024, 768, 128, 128); lcell('gauge2', 1152, 768, 128, 128); lcell('panel', 1280, 768, 256, 256); lcell('valvetag', 1536, 768, 128, 128); lcell('fire', 1664, 768, 128, 128);
lcell('busstop', 1792, 768, 256, 128); lcell('flamm', 1792, 896, 256, 128); lcell('gen_plate', 1536, 896, 256, 128);
lcell('vent', 0, 768, 256, 256); lcell('wastebin', 256, 896, 256, 128); lcell('taxi', 256, 768, 256, 128); lcell('monitor', 512, 896, 128, 128); lcell('cabinet', 640, 896, 128, 128); lcell('o2', 768, 896, 128, 128); lcell('wreath', 896, 896, 128, 128);
const PLATES = ['ABK-3317', 'RDX-0921', 'BEM-5582', 'APN-7106', 'RBF-2240', 'AJQ-8873', 'BKV-5532', 'RCL-0457', 'AXT-9015', 'BHN-1268', 'ATE-6649', 'RGY-3380', 'BCW-7721', 'AMK-0094', 'RNE-4436', 'BLT-2187'];
const LABEL_TEX = lazy(() => {
  const [c, ctx] = canvas(2048, 1024);
  ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 2048, 1024);
  const inR = (n, fn) => { const [x, y, w, h] = LABEL_RECTS[n]; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); };
  const grime = (w, h, a = 0.25) => { for (let k = 0; k < 18; k++) softBlob(ctx, rr(0, w), rr(0, h), rr(w * 0.05, w * 0.3), '60,50,35', a * R()); };
  PLATES.forEach((p, i) => inR(`plate${i}`, (w, h) => {
    ctx.fillStyle = '#e9e9e2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 16);
    text(ctx, p, w / 2, h / 2 + 6, 84, { font: FONT_PLATE, color: '#111', stretch: 0.78 });
    ctx.fillStyle = '#555'; [[22, 22], [w - 22, 22]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); });
    grime(w, h, 0.35);
  }));
  inR('er_sign', (w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d01a14'); g.addColorStop(1, '#a8100c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.fillRect(60, 78, 100, 100); ctx.fillStyle = '#d01a14'; ctx.fillRect(98, 88, 24, 80); ctx.fillRect(70, 116, 80, 24);
    text(ctx, '急 診', 380, h / 2 + 6, 150, { color: '#fff', weight: '900' });
    text(ctx, 'EMERGENCY', 760, h / 2 + 8, 92, { color: '#fff', weight: '900', font: 'Arial Black,Arial,sans-serif', stretch: 0.82 });
    softBlob(ctx, 860, 60, 120, '30,10,8', 0.45); softBlob(ctx, 120, 220, 90, '30,10,8', 0.4);
  });
  inR('hosp_stone', (w, h) => {
    const n = fbm(256, 64, 16, 4, 3);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) { const v = 26 + n[y * 256 + x] * 30 + R() * 10; ctx.fillStyle = `rgb(${v},${v},${v + 2})`; ctx.fillRect(x * 4, y * 4, 4, 4); }
    const eng = (s, x, y, sz, f, col) => { text(ctx, s, x + 2, y + 2, sz, { font: f, color: 'rgba(0,0,0,0.7)', weight: 'bold' }); text(ctx, s, x, y, sz, { font: f, color: col, weight: 'bold' }); };
    eng('聖 心 醫 院', w / 2, 100, 132, FONT_KAI, '#b89a52');
    eng('SACRED HEART HOSPITAL  ·  EST. 1962', w / 2, 200, 44, 'Georgia,"Times New Roman",serif', '#a48a4a');
    softBlob(ctx, 200, 230, 160, '40,60,30', 0.35);
  });
  inR('plaque', (w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#5a4a2a'); g.addColorStop(1, '#3a2e18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a7444'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
    text(ctx, '耶 穌 聖 心', w / 2, 70, 64, { font: FONT_KAI, color: '#c8b070' });
    text(ctx, '凡勞苦擔重擔的人，可以到我這裡來，', w / 2, 140, 26, { font: FONT_KAI, color: '#b8a060', weight: 'normal' });
    text(ctx, '我就使你們得安息。', w / 2, 178, 26, { font: FONT_KAI, color: '#b8a060', weight: 'normal' });
    text(ctx, '— 瑪竇福音 11:28', w / 2, 218, 20, { font: FONT_KAI, color: '#a89050', weight: 'normal' });
    for (let k = 0; k < 14; k++) softBlob(ctx, rr(0, w), rr(0, h), rr(10, 60), '60,110,90', 0.45); // 銅綠
  });
  const poster = (n, title, sub, bg, fg) => inR(n, (w, h) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(w / 2, 150, 70, 0, 7); ctx.fill();
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(w / 2, 130, 34, 0, 7); ctx.fill(); ctx.fillRect(w / 2 - 50, 170, 100, 60);
    text(ctx, title, w / 2, 270, 34, { color: fg, weight: '900' });
    text(ctx, sub, w / 2, 315, 18, { color: fg, weight: 'bold' });
    for (let k = 0; k < 12; k++) softBlob(ctx, rr(0, w), rr(0, h), rr(10, 70), '90,80,60', 0.35);
    ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.moveTo(w, h); ctx.lineTo(w - rr(40, 90), h); ctx.lineTo(w, h - rr(60, 140)); ctx.fill(); // 撕掉的角
    ctx.save(); ctx.translate(w * 0.5, h * 0.55); ctx.rotate(-0.2); text(ctx, '騙 子', 0, 0, 60, { color: 'rgba(130,10,10,0.85)', weight: '900' }); ctx.restore();
  });
  poster('poster', '大新照護中心', '讓每一位家人，都回得來', '#9cb8c4', '#2a4a5a');
  poster('poster2', '捐血一袋 救人一命', '聖心醫院 捐血中心 B1', '#c4a49c', '#5a2a2a');
  inR('pay', (w, h) => { ctx.fillStyle = '#2a3440'; ctx.fillRect(0, 0, w, h); text(ctx, '繳 費 機', w / 2, 40, 38, { color: '#e8e8e8' }); text(ctx, 'PAY STATION', w / 2, 80, 22, { color: '#c8c8c8', font: 'Arial' }); ctx.fillStyle = '#0c1a10'; ctx.fillRect(40, 110, 176, 90); text(ctx, 'ERR 404', w / 2, 155, 30, { color: '#3a6a3a', font: 'monospace' }); });
  const sign = (n, a, b, bg, fg) => inR(n, (w, h) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12); text(ctx, a, w / 2, h * 0.42, 44, { color: fg }); text(ctx, b, w / 2, h * 0.78, 20, { color: fg, font: 'Arial' }); grime(w, h, 0.3); });
  sign('hv', '⚡ 高壓危險', 'DANGER HIGH VOLTAGE', '#e8c020', '#111');
  sign('bio', '☣ 醫療廢棄物', 'BIOHAZARD', '#e8c020', '#a01010');
  sign('exit', '出口 EXIT', '→', '#1a7a3a', '#fff');
  sign('staff', '員工專用', 'STAFF ONLY', '#e8e8e2', '#a01010');
  sign('ambonly', '救護車專用', 'AMBULANCE ONLY', '#c01818', '#fff');
  sign('nopark', '禁止停車', 'NO PARKING', '#1a3a8a', '#fff');
  sign('busstop', '聖心醫院站', '12 · 35 · 紅 7', '#2a5a9a', '#fff');
  sign('flamm', '嚴禁煙火', 'NO FLAMES', '#c01818', '#fff');
  sign('gen_plate', '207 專用', '勿拔　工務 2003', '#c8ccc8', '#222');
  const gauge = (n, red) => inR(n, (w, h) => {
    ctx.fillStyle = '#ddd8c8'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); ctx.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); ctx.stroke(); }
    ctx.strokeStyle = '#c01010'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(64, 64, 48, Math.PI * 1.85, Math.PI * 2.25); ctx.stroke();
    const a = Math.PI * 0.75 + (red ? 1.38 : 0.55) * Math.PI; ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); ctx.stroke();
    text(ctx, 'kg/cm²', 64, 92, 12, { color: '#333', font: 'Arial', weight: 'normal' });
    softBlob(ctx, 64, 64, 60, '120,110,80', 0.3);
  });
  gauge('gauge', false); gauge('gauge2', true);
  inR('panel', (w, h) => { ctx.fillStyle = '#b8bcb4'; ctx.fillRect(0, 0, w, h); for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#3a8a3a' : '#a02020'; ctx.beginPath(); ctx.arc(40 + (k % 3) * 80, 60 + Math.floor(k / 3) * 70, 16, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(20 + (k % 3) * 80, 88 + Math.floor(k / 3) * 70, 40, 10); } text(ctx, 'MAIN 主電源', w / 2, 220, 22, { color: '#222' }); grime(w, h, 0.4); });
  inR('valvetag', (w, h) => { ctx.fillStyle = '#c8a020'; ctx.fillRect(0, 0, w, h); text(ctx, 'V-17', w / 2, 50, 34, { color: '#111', font: 'Arial Black' }); text(ctx, '常閉 N.C.', w / 2, 96, 20, { color: '#111' }); });
  inR('fire', (w, h) => { ctx.fillStyle = '#c01818'; ctx.fillRect(0, 0, w, h); text(ctx, '消防', w / 2, 64, 44, { color: '#fff' }); });
  inR('vent', (w, h) => { ctx.fillStyle = '#4a4c4a'; ctx.fillRect(0, 0, w, h); for (let y = 10; y < h; y += 18) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(10, y, w - 20, 9); ctx.fillStyle = '#6a6c6a'; ctx.fillRect(10, y + 9, w - 20, 3); } });
  inR('taxi', (w, h) => { ctx.fillStyle = '#e8e4d8'; ctx.fillRect(0, 0, w, h); text(ctx, 'TAXI', w / 2, 44, 52, { color: '#1a1a1a', font: 'Arial Black' }); text(ctx, '計 程 車', w / 2, 100, 34, { color: '#a01010' }); });
  inR('monitor', (w, h) => { ctx.fillStyle = '#0a1210'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#2a8a4a'; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x < w; x += 2) ctx.lineTo(x, 64 + (x % 40 < 4 ? -30 : 0) + Math.sin(x) * 2); ctx.stroke(); text(ctx, '0', 100, 24, 20, { color: '#3aaa5a', font: 'monospace' }); });
  inR('cabinet', (w, h) => { ctx.fillStyle = '#d8dcd8'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#8a8e8a'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8); ctx.fillStyle = '#c01818'; ctx.fillRect(54, 30, 20, 60); ctx.fillRect(34, 50, 60, 20); });
  inR('o2', (w, h) => { ctx.fillStyle = '#2a6a3a'; ctx.fillRect(0, 0, w, h); text(ctx, 'O₂', w / 2, 50, 44, { color: '#fff', font: 'Arial Black' }); text(ctx, '醫用氧氣', w / 2, 100, 22, { color: '#fff' }); });
  inR('wreath', (w, h) => { ctx.fillStyle = '#f0ece0'; ctx.fillRect(0, 0, w, h); text(ctx, '安息', w / 2, 46, 40, { color: '#111', font: FONT_KAI }); text(ctx, '主懷', w / 2, 96, 40, { color: '#111', font: FONT_KAI }); });
  inR('wastebin', (w, h) => { ctx.fillStyle = '#d8b020'; ctx.fillRect(0, 0, w, h); text(ctx, '☣ 感染性廢棄物', w / 2, 50, 30, { color: '#a01010' }); text(ctx, 'INFECTIOUS WASTE', w / 2, 96, 20, { color: '#111', font: 'Arial' }); });
  return tex(c, { repeat: false });
});
export const labelUV = (name) => { const [x, y, w, h] = LABEL_RECTS[name]; return [x / 2048, 1 - (y + h) / 1024, w / 2048, h / 1024]; };
export const PLATE_COUNT = PLATES.length;
// 封鎖線(可平鋪)
const TAPE = lazy(() => {
  const [c, ctx] = canvas(1024, 64);
  ctx.fillStyle = '#e8c41a'; ctx.fillRect(0, 0, 1024, 64);
  text(ctx, '警戒線  請勿跨越   POLICE LINE  DO NOT CROSS', 512, 34, 34, { color: '#111', font: FONT_TC, weight: '900', stretch: 0.92 });
  ctx.fillStyle = 'rgba(80,60,20,0.25)'; for (let k = 0; k < 30; k++) ctx.fillRect(R() * 1024, 0, rr(4, 30), 64);
  const t = tex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});
// 黃黑警示斜紋
const HAZARD = lazy(() => {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#d8b020'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#141414';
  for (let k = -4; k < 8; k++) { ctx.beginPath(); ctx.moveTo(k * 64, 0); ctx.lineTo(k * 64 + 32, 0); ctx.lineTo(k * 64 + 32 + 256, 256); ctx.lineTo(k * 64 + 256, 256); ctx.fill(); }
  const n = fbm(256, 256, 8, 8, 3), img = ctx.getImageData(0, 0, 256, 256), d = img.data;
  for (let i = 0; i < 65536; i++) { const w = ss(0.55, 0.75, n[i]) * 0.6; d[i * 4] = d[i * 4] * (1 - w) + 70 * w; d[i * 4 + 1] = d[i * 4 + 1] * (1 - w) + 64 * w; d[i * 4 + 2] = d[i * 4 + 2] * (1 - w) + 58 * w; }
  ctx.putImageData(img, 0, 0);
  return tex(c);
});

// ---------- 註冊材質 ----------
const std = (o) => new THREE.MeshStandardMaterial(o);
let done = false;
// [perf] 載入分時:這些程式貼圖可以先一張一張畫(lazy,畫過就快取),initMats 之後直接拿現成的
export const prepaint = () => [NIGHT_ENV, GRIME, GLASS_DIRT, GLASS_CRACK, GRASS_CARD, LEAF_CARD, DECAL_TEX, LABEL_TEX, TAPE, HAZARD];
export function initMats() {
  if (done) return;
  done = true;
  // 車漆
  const P = {
    white: [0xd2d2cc], silver: [0x9da1a5, { metal: 0.6, rough: 0.36 }], black: [0x121315, { rough: 0.32 }], blue: [0x1e2c48], red: [0x761612], green: [0x1e3a2b],
    beige: [0xb4a486], gray: [0x585c60, { metal: 0.5 }], taxi: [0xd8a41c], maroon: [0x4a1418], skyblue: [0x6e8eaa], police: [0xe2e2de, { rough: 0.38 }], amb: [0xe8e8e4, { rough: 0.4 }], hearse: [0x0a0a0c, { rough: 0.22, metal: 0.45, dust: 0.7 }],
  };
  for (const [k, [c, o]] of Object.entries(P)) registerMat(`po_paint_${k}`, paintMat(c, o));
  registerMat('po_paint_burnt', paintMat(0x1a1715, { rough: 0.9, metal: 0.2, dust: 0.35 }));
  const env = NIGHT_ENV();
  registerMat('po_glass', std({ map: GLASS_DIRT(), transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.4, envMap: env, envMapIntensity: 1.2 }));
  registerMat('po_glass_crack', std({ map: GLASS_CRACK(), transparent: true, depthWrite: false, roughness: 0.15, metalness: 0.35, envMap: env, envMapIntensity: 1.1 }));
  registerMat('po_gap', std({ color: 0x020202, roughness: 1 }));
  registerMat('po_under', std({ color: 0x0a0a0a, roughness: 1, side: THREE.DoubleSide }));
  registerMat('po_curtain', std({ color: 0x4a1a1e, roughness: 1, side: THREE.DoubleSide }));
  registerMat('po_headlight', std({ color: 0xb8c4cc, roughness: 0.06, metalness: 0.75, envMap: env, envMapIntensity: 1.5 }));
  registerMat('po_taillight', std({ color: 0x6a0a08, roughness: 0.1, metalness: 0.2, emissive: 0x200000, emissiveIntensity: 1, envMap: env, envMapIntensity: 1 }));
  registerMat('po_amber', std({ color: 0xb06010, roughness: 0.1, metalness: 0.2, envMap: env, envMapIntensity: 1 }));
  registerMat('po_bluelens', std({ color: 0x0a1446, roughness: 0.1, metalness: 0.2, emissive: 0x000418, emissiveIntensity: 1, envMap: env, envMapIntensity: 1 }));
  // 內容型貼圖(車牌/招牌/海報/刻字、貼花、封鎖線、警示斜紋、草葉剪影)
  registerMat('po_label', std({ map: LABEL_TEX(), roughness: 0.55, metalness: 0.1 }));
  registerMat('po_decal', std({ map: DECAL_TEX(), transparent: true, depthWrite: false, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  registerMat('po_tape', std({ map: TAPE(), roughness: 0.6, side: THREE.DoubleSide }));
  registerMat('po_hazard', std({ map: HAZARD(), roughness: 0.7 }));
  registerMat('po_grass_card', std({ map: GRASS_CARD(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  registerMat('po_leaf_card', std({ map: LEAF_CARD(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  // 材質庫沒有的顏色:只註冊純色鍵(一般表面不自帶貼圖,交給結構代理的 PBR/三平面投影)
  const pl = (k, c, r = 0.55, m = 0, o = {}) => registerMat(k, o.raw ? std({ color: c, roughness: r, metalness: m, ...o.raw }) : [c, r, m, o.opacity ?? 1, o.em ?? 0, o.ei ?? 0]);
  pl('po_hedge', 0x2c3a22, 1); pl('po_moss', 0x34442a, 1); pl('po_sand', 0x8a7a5e, 1); pl('po_ash', 0x48464a, 1); pl('po_coal', 0x161618, 0.45, 0.2);
  pl('po_granite', 0x2c2c2e, 0.35); pl('po_firebrick', 0x8a5a3e, 0.95); pl('po_soot', 0x0e0c0a, 1); pl('po_orange', 0xd85a12, 0.5); pl('po_reflect', 0xe8e8e0, 0.3);
  pl('po_bag_black', 0x0e0e10, 0.35, 0.1); pl('po_bag_red', 0x9a1410, 0.4); pl('po_bag_yellow', 0xc8a418, 0.45); pl('po_bodybag', 0x14161c, 0.3, 0.1);
  pl('po_fabric_dirty', 0x8a8270, 1); pl('po_fabric_pink', 0xa87a80, 1); pl('po_suitcase', 0x2a3a4a, 0.5); pl('po_suitcase2', 0x5a2a2a, 0.5);
  pl('po_cable', 0x0c0c0c, 0.6); pl('po_mattress', 0x9aa8a0, 0.95); pl('po_line_white', 0xc8c8c0, 0.85); pl('po_line_yellow', 0xb8962a, 0.85);
  pl('po_skin_doll', 0xd8c0b0, 0.6); pl('po_hair', 0x2a1a10, 0.9); pl('po_pole', 0x2e3432, 0.55, 0.6); pl('po_green_paint', 0x2a4a3a, 0.6, 0.4);
  pl('po_play_red', 0x8a2a22, 0.6); pl('po_play_yellow', 0xb8902a, 0.6); pl('po_play_blue', 0x2a4a7a, 0.6);
  pl('po_puddle', 0x0a0c0c, 0.02, 0.5, { raw: { envMap: env, envMapIntensity: 1.2, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } });
  pl('po_water_dark', 0x0c1414, 0.04, 0.4, { raw: { envMap: env, envMapIntensity: 0.8, transparent: true, opacity: 0.9, depthWrite: false } });
  pl('po_lamp_glass', 0xb0a080, 0.2, 0, { em: 0xff9a40, ei: 1.6 }); pl('po_lamp_off', 0x8a8478, 0.2, 0.2);
  pl('po_bulb', 0xfff0c8, 0.3, 0, { em: 0xffc070, ei: 2.2 }); pl('po_candle_flame', 0xffd080, 1, 0, { em: 0xffa040, ei: 3 }); pl('po_ember', 0x501008, 0.9, 0, { em: 0xff4a10, ei: 1.6 });
}
export const dustTexture = GRIME;
