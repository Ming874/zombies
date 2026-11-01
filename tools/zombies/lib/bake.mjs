// 貼圖「殭屍化」烘焙:把網格在 UV 空間光柵化成位置圖(每個像素對應的 3D 位置/法線/部位),
// 效果都以 3D 位置計算(和程式生成殭屍的頂點上色同一套思路),所以頭/身體貼圖接縫兩側連續:
//   死人皮膚(去飽和、灰綠/灰黃、斑駁、屍斑、大理石紋血管、瘀青)、凹陷發黑的眼窩、發紫的嘴唇、白濁的眼球、
//   黃褐色牙齒、從嘴角流到下巴/領口的血、咬痕/撕裂傷(肉、壞死邊緣、往下流的血、衣服吸血暈開)、手上的血、
//   汙垢(鞋/褲腳/膝蓋/手)、衣服泛黃發髒。
// 輸出:顏色圖(RGB,A = 濕潤度:血/傷口/眼睛 → 執行期 shader 降低粗糙度)與皮膚遮罩(放進法線圖 A,執行期次表面散射用)。
import { noise3, fbm, rng, sstep, clamp, lerp, G } from '../../../src/zombies/anatomy.js';

// ---------- 色彩 ----------
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const toS = (x) => { x = x <= 0 ? 0 : x >= 1 ? 1 : x; return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255); };
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [LIN[(v >> 16) & 255], LIN[(v >> 8) & 255], LIN[v & 255]]; };

// 部位(主要權重骨骼 → 粗分類)
export const PART = { head: 0, neck: 1, torso: 2, arm: 3, hand: 4, leg: 5, foot: 6 };
export function partOf(bone) {
  if (bone === 'head' || bone === 'jaw') return PART.head;
  if (bone === 'neck') return PART.neck;
  if (/^(hand)/.test(bone)) return PART.hand;
  if (/^(clav|upperArm|forearm)/.test(bone)) return PART.arm;
  if (/^(thigh|shin)/.test(bone)) return PART.leg;
  if (/^foot/.test(bone)) return PART.foot;
  return PART.torso;
}

// ---------- UV 空間光柵化 ----------
// tris:Uint32Array 索引;V:{ uv, pos, nor, part, eye, inner }(逐頂點)。回傳每個像素的位置/法線/部位/眼/口內 + 覆蓋旗標
export function raster(index, V, W, H) {
  const n = W * H;
  const M = { W, H, pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), part: new Uint8Array(n), eye: new Float32Array(n), inner: new Float32Array(n), cov: new Uint8Array(n) };
  const { uv, pos, nor, part, eye, inner } = V;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ax = uv[a * 2] * W - 0.5, ay = uv[a * 2 + 1] * H - 0.5, bx = uv[b * 2] * W - 0.5, by = uv[b * 2 + 1] * H - 0.5, cx = uv[c * 2] * W - 0.5, cy = uv[c * 2 + 1] * H - 0.5;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const i = y * W + x;
      const inn = inner[a] * w0 + inner[b] * w1 + inner[c] * w2;
      if (M.cov[i] && inn > M.inner[i] + 0.01) continue;
      for (let k = 0; k < 3; k++) {
        M.pos[i * 3 + k] = pos[a * 3 + k] * w0 + pos[b * 3 + k] * w1 + pos[c * 3 + k] * w2;
        M.nor[i * 3 + k] = nor[a * 3 + k] * w0 + nor[b * 3 + k] * w1 + nor[c * 3 + k] * w2;
      }
      M.part[i] = w0 >= w1 && w0 >= w2 ? part[a] : w1 >= w2 ? part[b] : part[c];
      M.eye[i] = eye[a] * w0 + eye[b] * w1 + eye[c] * w2;
      M.inner[i] = inn;
      M.cov[i] = 1;
    }
  }
  return M;
}
// 填滿 UV 島外的像素(多源 BFS,拿最近的島內像素的屬性):縮圖/雙線性取樣時接縫不會露出原本健康的顏色
export function dilate(M) {
  const { W, H } = M, n = W * H, q = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = 0; i < n; i++) if (M.cov[i]) q[t++] = i;
  while (h < t) {
    const j = q[h++], x = j % W, y = (j / W) | 0;
    for (let k = 0; k < 4; k++) {
      const xx = k === 0 ? x + 1 : k === 1 ? x - 1 : x, yy = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (M.cov[i]) continue;
      for (let c = 0; c < 3; c++) { M.pos[i * 3 + c] = M.pos[j * 3 + c]; M.nor[i * 3 + c] = M.nor[j * 3 + c]; }
      M.part[i] = M.part[j]; M.eye[i] = M.eye[j]; M.inner[i] = M.inner[j]; M.cov[i] = 2;
      q[t++] = i;
    }
  }
}

// 皮膚參考色:臉頰附近(頭部貼圖)的中位數(線性 RGB)
export function skinRef(M, img, pts) {
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < M.W * M.H; i++) {
    if (M.cov[i] !== 1 || M.eye[i] > 0.1) continue;
    const x = M.pos[i * 3], y = M.pos[i * 3 + 1], z = M.pos[i * 3 + 2];
    let near = false;
    for (const p of pts) if ((x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2 < 0.018 * 0.018) near = true;
    if (!near) continue;
    rs.push(LIN[img[i * 4]]); gs.push(LIN[img[i * 4 + 1]]); bs.push(LIN[img[i * 4 + 2]]);
  }
  if (rs.length < 20) return [0.42, 0.26, 0.2];
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

// ---------- 殭屍化 ----------
// look:每個角色的外觀參數(characters.mjs);ctx:{ ref 皮膚參考色, eyes, mouth, HC, wounds, drips, kind: 'body'|'head'|'hair'|'gear' }
const DEAD = { grey: '#8e9089', green: '#7f8a6c', yellow: '#998f62', blue: '#7c8090', ash: '#76736e' };
const BLOOD = hex('#460605'), BLOOD_DRY = hex('#200605'), FLESH = hex('#5e1612'), FLESH_DK = hex('#1c0303'), NECRO = hex('#1c1416');
const FAT = hex('#a88c4c'), BRUISE = hex('#3a2038'), LIVOR = hex('#4a2030'), VEIN = hex('#2a3438'), LIPS = hex('#2e2228');
const RAWLID = hex('#5a1418'), DERMIS = hex('#6a2a26'), SOCK = hex('#3a2a34'), TEETH = hex('#8a7448'), GUM = hex('#3a1414'), MILK = hex('#b4b2a4'), DIRT = hex('#5a4a36'), STAIN = hex('#8a7448');

export function zombify(img, M, look, ctx) {
  const { W, H } = M, n = W * H, out = new Uint8ClampedArray(n * 4), skinOut = new Uint8Array(n);
  const ref = ctx.ref, refL = lum(ref[0], ref[1], ref[2]), rsum = ref[0] + ref[1] + ref[2];
  const rr = ref[0] / rsum, rg = ref[1] / rsum, rb = ref[2] / rsum;
  const ref2 = ctx.ref2 || ref, r2sum = ref2[0] + ref2[1] + ref2[2], r2L = lum(ref2[0], ref2[1], ref2[2]);
  const dead0 = hex(DEAD[look.tint || 'grey']), deadL = lum(...dead0);
  // 深膚色的人死後仍是深色:目標亮度往原本膚色靠
  const toneL = lerp(deadL, refL, look.keepTone ?? 0.55) * 0.86, dead = dead0.map((v) => (v * toneL) / deadL);
  const decay = look.decay ?? 0.5, blood = look.blood ?? 0.6, dirt = look.dirt ?? 0.5, K = look.seed * 13.7;
  const alphaTex = ctx.kind === 'hair', headTex = ctx.kind === 'head';
  const tol = headTex ? [0.06, 0.13] : [0.04, 0.085]; // 頭部貼圖幾乎都是皮膚(耳朵、鼻翼較紅也算)
  const mo = ctx.mouth, collarY = ctx.collarY;
  const c = [0, 0, 0], tmp = [0, 0, 0];
  const mixc = (col, t) => { c[0] += (col[0] - c[0]) * t; c[1] += (col[1] - c[1]) * t; c[2] += (col[2] - c[2]) * t; };
  const mul = (col, t) => { c[0] *= 1 + (col[0] - 1) * t; c[1] *= 1 + (col[1] - 1) * t; c[2] *= 1 + (col[2] - 1) * t; };
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o + 3] = img[o + 3];
    c[0] = LIN[img[o]]; c[1] = LIN[img[o + 1]]; c[2] = LIN[img[o + 2]];
    const x = M.pos[i * 3], y = M.pos[i * 3 + 1], z = M.pos[i * 3 + 2], nz = M.nor[i * 3 + 2];
    const part = M.part[i], eye = M.eye[i], inner = M.inner[i];
    const L = lum(c[0], c[1], c[2]), sum = c[0] + c[1] + c[2] + 1e-6;
    // 皮膚判定:色度(r,g,b 比例)接近臉頰參考色、亮度在合理範圍(深色頭髮、衣服排除)
    const dch = Math.hypot(c[0] / sum - rr, c[1] / sum - rg, c[2] / sum - rb), kL = L / (refL + 1e-6);
    const dch2 = Math.hypot(c[0] / sum - ref2[0] / r2sum, c[1] / sum - ref2[1] / r2sum, c[2] / sum - ref2[2] / r2sum), kL2 = L / (r2L + 1e-6);
    let skin = Math.max((1 - sstep(tol[0], tol[1], dch)) * sstep(0.22, 0.42, kL) * (1 - sstep(2.0, 3.0, kL)), (1 - sstep(tol[0], tol[1], dch2)) * sstep(0.22, 0.42, kL2) * (1 - sstep(2.0, 3.0, kL2)));
    // 臉部(髮際線以下的正面):除了眉毛/鬍子等深色,一律算皮膚(鼻翼、嘴角、耳朵較紅也要變成死人膚色)
    if (part === PART.head && z > ctx.HC.z + 0.015 && y < ctx.eyes[0].y + 0.035 && Math.abs(x) < 0.08) skin = Math.max(skin, 0.92 * sstep(0.16, 0.32, kL));
    if (ctx.kind === 'gear' || alphaTex) skin *= 0.25;
    if (eye > 0.4 || inner > 0.4) skin = 0;
    let wet = 0;
    if (ctx.healthy) { // 倖存者:顏色不動,只算皮膚遮罩(次表面散射)與眼睛/嘴唇的光澤
      out[o] = img[o]; out[o + 1] = img[o + 1]; out[o + 2] = img[o + 2];
      if (!alphaTex) out[o + 3] = Math.round(Math.max(eye > 0.4 ? 0.85 : 0, inner > 0.4 ? 0.6 : 0) * 255);
      skinOut[i] = Math.round(clamp(skin, 0, 1) * 255);
      continue;
    }

    // ---- 衣物:泛黃發灰、體液汙漬 ----
    const cloth = 1 - skin;
    if (cloth > 0) {
      tmp[0] = c[0] + (L - c[0]) * 0.18; tmp[1] = c[1] + (L - c[1]) * 0.18; tmp[2] = c[2] + (L - c[2]) * 0.18;
      c[0] += (tmp[0] * 0.84 - c[0]) * cloth; c[1] += (tmp[1] * 0.78 - c[1]) * cloth; c[2] += (tmp[2] * 0.64 - c[2]) * cloth;
      const st = sstep(0.12, 0.4, fbm(x * 6 + K, y * 6, z * 6, 3)) * (part === PART.torso ? 0.7 : 0.4) * cloth;
      mul(STAIN.map((v) => v * 1.5), st * 0.55);
    }
    // ---- 汙垢:鞋、褲腳、膝蓋、手 ----
    const low = sstep(0.6, 0.02, y) * 1.2 + (part === PART.hand ? 0.5 : 0) + G((y - 0.5) ** 2, 0.07) * Math.max(0, nz) * 0.9;
    const grime = clamp(sstep(-0.15, 0.4, fbm(x * 3.5 + K, y * 3.5 + 9, z * 3.5, 3) + low * 0.55) * dirt, 0, 1);
    mul(DIRT.map((v) => v * 1.7), grime * 0.85);
    // 細碎的髒點
    const spk = sstep(0.55, 0.7, noise3(x * 140 + K, y * 140, z * 140)) * dirt * (0.4 + low * 0.6);
    mul(DIRT.map((v) => v * 1.2), spk * 0.6);

    // ---- 死人皮膚 ----
    if (skin > 0.01) {
      const m = fbm(x * 7 + K, y * 7, z * 7, 3);
      const kd = clamp(kL, 0.15, 2.2);
      tmp[0] = dead[0] * kd; tmp[1] = dead[1] * kd; tmp[2] = dead[2] * kd;
      // 斑駁:偏綠 ↔ 偏紫
      const sm = sstep(-0.25, 0.3, m);
      tmp[0] *= lerp(0.93, 1.07, sm); tmp[1] *= lerp(1.04, 0.9, sm); tmp[2] *= lerp(0.9, 1.06, sm);
      const amt = clamp((look.pale ?? 0.9) * skin, 0, 1);
      c[0] += (tmp[0] - c[0]) * amt; c[1] += (tmp[1] - c[1]) * amt; c[2] += (tmp[2] - c[2]) * amt;
      // 大理石紋(皮下血管腐敗後的網狀紋路):細、成片出現;頸、胸、肩、上臂、大腿較明顯,臉上少
      const region = part === PART.neck ? 1 : part === PART.torso ? 0.85 : part === PART.arm ? 0.75 : part === PART.leg ? 0.7 : part === PART.head ? (y > ctx.eyes[0].y && Math.abs(x) > 0.045 ? 0.6 : 0.3) : 0.35;
      const patch = sstep(0.0, 0.35, fbm(x * 2.6 + K, y * 2.6 + 3, z * 2.6, 2) + decay * 0.25);
      if (patch > 0.01) {
        const r1 = 1 - Math.abs(noise3(x * 34 + K, y * 26, z * 34)), r2 = 1 - Math.abs(noise3(x * 85, y * 70 + K, z * 85));
        const vein = (sstep(0.955, 0.99, r1) + sstep(0.95, 0.985, r2) * 0.55) * patch * region * (0.3 + decay * 0.7) * skin;
        mul(VEIN.map((v) => v * 2.4), clamp(vein, 0, 1) * 0.8);
      }
      // 瘀青、屍斑(手腳末端)
      const br = sstep(0.3, 0.52, fbm(x * 4.5 + 31 + K, y * 4.5, z * 4.5, 3)) * skin * (0.5 + decay * 0.5);
      mixc(BRUISE.map((v) => v * (0.6 + kd * 0.5)), br * 0.5);
      const liv = (part === PART.hand || part === PART.foot ? 0.65 : part === PART.leg ? sstep(0.6, 0.2, y) * 0.5 : 0) * sstep(-0.3, 0.2, fbm(x * 9, y * 9 + K, z * 9, 2)) * skin;
      mixc(LIVOR.map((v) => v * (0.7 + kd * 0.4)), liv * 0.6);
      // 表皮剝落:幾片露出暗紅的真皮,邊緣翻起的死皮較白
      const sn = fbm(x * 5 + 77 + K, y * 5, z * 5, 3);
      const slip = sstep(0.5, 0.56, sn) * decay * skin * (part === PART.head ? 0.35 : 1);
      const edge = clamp(sstep(0.44, 0.5, sn) - sstep(0.5, 0.56, sn), 0, 1) * decay * skin * (part === PART.head ? 0.35 : 1);
      if (edge > 0) mixc(tmp.map((v) => v * 1.35), edge * 0.5);
      if (slip > 0) { mixc([DERMIS[0] * (0.7 + kd * 0.3), DERMIS[1] * (0.7 + kd * 0.3), DERMIS[2] * (0.7 + kd * 0.3)], slip * 0.8); wet = Math.max(wet, slip * 0.45); }
      // 指尖發黑
      if (part === PART.hand && ctx.tips) for (const tp of ctx.tips) { const d2 = (x - tp.x) ** 2 + (y - tp.y) ** 2 + (z - tp.z) ** 2; if (d2 < 0.0025) mul([0.45, 0.4, 0.45], skin * sstep(0.05, 0.0, Math.sqrt(d2)) * 0.6); }
    }

    // ---- 臉:眼窩、嘴唇、眼球、口內 ----
    if (part === PART.head) {
      for (const e of ctx.eyes) {
        const d = Math.hypot(x - e.x, (y - e.y) * 1.15, z - e.z);
        const sock = (1 - sstep(0.013, 0.04, d)) * (1 - sstep(0.4, 0.7, eye)) * (look.sockets ?? 0.9);
        mul(SOCK.map((v) => v * 2.1), sock * 0.95);
        const bag = G((x - e.x) ** 2 * 0.5 + (y - e.y + 0.018) ** 2 * 3, 0.013) * (1 - sstep(0.4, 0.7, eye));
        mul(SOCK.map((v) => v * 1.9), bag * 0.75);
        // 下眼瞼外翻、潰爛發紅(眼球周圍一圈)
        const lid = G((x - e.x) ** 2 * 0.7 + (y - e.y + 0.01) ** 2 * 4 + (z - e.z - 0.004) ** 2, 0.008) * (1 - sstep(0.3, 0.6, eye));
        mixc(RAWLID, lid * 0.6);
        wet = Math.max(wet, lid * 0.5);
      }
      // 顴骨下凹陷的臉頰、太陽穴(臉頰骨骼往下 2cm)
      if (ctx.cheeks) for (const ch of ctx.cheeks) {
        const hol = G((x - ch.x) ** 2 * 1.4 + (y - ch.y + 0.024) ** 2 * 2.2 + (z - ch.z) ** 2, 0.02);
        mul([0.6, 0.58, 0.66], hol * 0.55 * skin);
        const tem = G((x - ch.x * 1.25) ** 2 + (y - ch.y - 0.045) ** 2 + (z - ch.z + 0.035) ** 2, 0.02);
        mul([0.68, 0.64, 0.72], tem * 0.45 * skin);
      }
      // 鼻孔、鼻翼周圍發黑
      if (ctx.nose) { const nd = G((x - ctx.nose.x) ** 2 * 0.6 + (y - ctx.nose.y + 0.016) ** 2 * 2 + (z - ctx.nose.z + 0.002) ** 2, 0.011); mul([0.45, 0.38, 0.42], nd * 0.6); }
      const lx = (x - mo.x) / 0.028, ly = (y - mo.y) / 0.012, lip = (1 - sstep(0.75, 1.15, Math.hypot(lx, ly))) * sstep(mo.z - 0.02, mo.z - 0.005, z);
      if (lip > 0) { mixc(LIPS, lip * 0.75); mul([0.6, 0.55, 0.6], lip * sstep(0.3, 0.6, noise3(x * 600, y * 300 + K, z * 600)) * 0.6); wet = Math.max(wet, lip * 0.3); }
    }
    if (eye > 0.05) {
      const st = look.eyes || 'milky', e = clamp(eye, 0, 1);
      if (st === 'red') {
        // 充血:鞏膜整片暗紅、瞳孔放大
        if (L > 0.12) mixc([0.3 + L * 0.25, 0.025, 0.02], e * 0.85);
        else mixc([0.01, 0.005, 0.005], e * 0.7);
      } else {
        // 白濁(白內障):瞳孔/虹膜只剩淡淡的影子;邊緣有血絲
        const keep = L < 0.06 ? 0.5 : 0.18;
        tmp[0] = MILK[0] * (0.75 + L * 0.6); tmp[1] = MILK[1] * (0.75 + L * 0.6); tmp[2] = MILK[2] * (0.72 + L * 0.5);
        c[0] += (tmp[0] - c[0]) * e * (1 - keep); c[1] += (tmp[1] - c[1]) * e * (1 - keep); c[2] += (tmp[2] - c[2]) * e * (1 - keep);
        const vs = sstep(0.93, 0.985, 1 - Math.abs(noise3(x * 420 + K, y * 420, z * 420))) * e;
        mixc([0.35, 0.02, 0.02], vs * 0.65);
      }
      wet = Math.max(wet, e * 0.9);
    }
    if (inner > 0.05) {
      const t = clamp(inner, 0, 1);
      const sat = (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])) / (Math.max(c[0], c[1], c[2]) + 1e-4);
      if (L > 0.22 && sat < 0.35) { mixc(TEETH.map((v) => v * (0.8 + L * 0.4)), t * 0.75); mul([0.35, 0.3, 0.25], t * sstep(0.2, 0.5, fbm(x * 200, y * 200 + K, z * 200, 2)) * 0.7); }
      else mixc(GUM, t * 0.8);
      c[0] *= 1 - t * 0.4; c[1] *= 1 - t * 0.4; c[2] *= 1 - t * 0.4;
      wet = Math.max(wet, t * 0.7);
    }

    // ---- 傷口:不規則的撕裂邊緣、紅黑的肉、壞死發黑的邊、周圍瘀紫 ----
    let bl = 0, soak = 0;
    for (const w of ctx.wounds) {
      let d2;
      if (w.b) {
        const abx = w.b.x - w.a.x, aby = w.b.y - w.a.y, abz = w.b.z - w.a.z, l2 = abx * abx + aby * aby + abz * abz;
        const tt = clamp(((x - w.a.x) * abx + (y - w.a.y) * aby + (z - w.a.z) * abz) / l2, 0, 1);
        d2 = (x - w.a.x - abx * tt) ** 2 + (y - w.a.y - aby * tt) ** 2 + (z - w.a.z - abz * tt) ** 2;
      } else d2 = (x - w.c.x) ** 2 + (y - w.c.y) ** 2 + (z - w.c.z) ** 2;
      if (d2 < (w.r * 6) ** 2) {
        const d = Math.sqrt(d2), q = d / w.r + fbm(x * 70 + w.k, y * 70, z * 70, 2) * 0.7;
        soak = Math.max(soak, G(d2, w.r * 3.2) * (0.8 + fbm(x * 14 + w.k, y * 14, z * 14, 2) * 0.6));
        const core = sstep(1.0, 0.55, q), rim = clamp(sstep(1.9, 1.0, q) - core, 0, 1), halo = clamp(sstep(3.2, 1.6, q) - rim - core, 0, 1);
        if (halo > 0) { mixc(BRUISE.map((v) => v * 0.9), halo * 0.45 * skin); mixc(LIVOR, halo * 0.25 * skin); }
        if (rim > 0) { mixc(NECRO, rim * 0.88); wet = Math.max(wet, rim * 0.5); }
        if (core > 0) {
          const fib = 0.5 + 0.5 * Math.sin((x * 0.6 + z) * 900 + y * 40 + noise3(x * 40 + w.k, y * 40, z * 40) * 6);
          mixc([FLESH[0] * (1 - fib * 0.45), FLESH[1] * (1 - fib * 0.6), FLESH[2] * (1 - fib * 0.6)], core);
          mixc(FAT, core * sstep(0.62, 0.68, noise3(x * 120 + w.k, y * 120, z * 120)) * 0.5);
          mixc(FLESH_DK, core * sstep(0.7, 0.0, q) * 0.95);
          mixc(BLOOD_DRY, core * sstep(0.1, 0.35, fbm(x * 90 + w.k, y * 90, z * 90, 2)) * 0.7); // 結痂
          wet = Math.max(wet, core * 0.9);
        }
      }
      // 傷口往下流的血
      for (const dr of w.drips) {
        const dy = dr.y - y;
        if (dy < 0 || dy > dr.len) continue;
        const wob = noise3(x * 30 + dr.k, y * 6, z * 30) * 0.008;
        const tt = dy / dr.len, wid = dr.w * (1 - tt * 0.5);
        bl = Math.max(bl, G((x - dr.x + wob) ** 2 + (z - dr.z) ** 2 * 0.3, wid) * (1 - tt * tt) * sstep(-0.3, 0.2, nz * dr.side + 0.1));
      }
    }
    // ---- 嘴邊、下巴流下的血;領口吸血 ----
    if (z > ctx.HC.z - 0.03) {
      for (const dr of ctx.drips) {
        const dy = dr.y - y;
        if (dy < -0.003 || dy > dr.len) continue;
        const wob = noise3(x * 25 + dr.k, y * 5, z * 25) * 0.009;
        const tt = Math.max(0, dy) / dr.len, wid = dr.w * (1 - tt * 0.55);
        const broken = sstep(-0.35, 0.1, noise3(x * 90 + dr.k, y * 40, z * 90)); // 乾掉剝落的地方斷斷續續
        const a = G((x - dr.x + wob) ** 2, wid) * (1 - tt * tt) * sstep(-0.4, 0.1, nz) * lerp(1, broken, tt) * lerp(1, 0.7, tt);
        bl = Math.max(bl, a);
        if (skin < 0.5) soak = Math.max(soak, G((x - dr.x + wob) ** 2, wid * 2.6) * (1 - tt) * 0.75); // 布料吸血:比皮膚上寬
      }
      if (ctx.chin) bl = Math.max(bl, G((x - ctx.chin.x) ** 2 * 0.7 + (y - ctx.chin.y) ** 2 * 1.4 + (z - ctx.chin.z) ** 2, ctx.chin.r) * (0.55 + 0.45 * fbm(x * 40, y * 40 + K, z * 40, 2)));
      // 嘴唇周圍抹開的血
      bl = Math.max(bl, G((x - mo.x) ** 2 * 0.6 + (y - mo.y + 0.006) ** 2 * 2 + (z - mo.z) ** 2, 0.016) * sstep(-0.1, 0.4, fbm(x * 60 + K, y * 60, z * 60, 2) + 0.2) * (look.mouthBlood ?? 0.6));
      // 領口/胸前吸了從嘴流下來的血
      if (collarY && skin < 0.5) soak = Math.max(soak, G((x - mo.x) ** 2 * 0.8 + (y - collarY) ** 2 * 0.22, 0.095) * (look.mouthBlood ?? 0.6) * 1.25 * (0.6 + fbm(x * 12 + K, y * 12, z * 12, 2) * 0.8));
    }
    // 手上的血
    if (part === PART.hand) bl = Math.max(bl, sstep(-0.1, 0.3, fbm(x * 18 + K, y * 18, z * 18, 3)) * blood);
    // 衣服上大片吸血(胸口、肚子、肩膀),往下拉長
    if (ctx.soaks && skin < 0.5) for (const so of ctx.soaks) {
      const dy = y - so.c.y, d2 = (x - so.c.x) ** 2 + (z - so.c.z) ** 2 + (dy < 0 ? dy * dy * 0.22 : dy * dy * 1.3);
      if (d2 > so.r * so.r * 9) continue;
      soak = Math.max(soak, G(d2, so.r) * (0.7 + fbm(x * 9 + so.k, y * 9, z * 9, 3) * 0.9) * so.a);
    }
    // 手抹過的血痕:幾道平行的指痕
    if (ctx.smears) for (const sm of ctx.smears) {
      const px = x - sm.a.x, py = y - sm.a.y, pz = z - sm.a.z;
      const t = (px * sm.d.x + py * sm.d.y + pz * sm.d.z) / sm.len;
      if (t < -0.05 || t > 1.05) continue;
      const ox = px - sm.d.x * t * sm.len, oy = py - sm.d.y * t * sm.len, oz = pz - sm.d.z * t * sm.len;
      const across = ox * sm.s.x + oy * sm.s.y + oz * sm.s.z, off = ox * ox + oy * oy + oz * oz - across * across;
      if (off > 0.0016) continue; // 離表面太遠(另一側)
      let f = 0;
      for (let k = 0; k < sm.n; k++) f = Math.max(f, G((across - (k - (sm.n - 1) / 2) * 0.018) ** 2, 0.0055));
      const fade = sstep(1.05, 0.55, t) * sstep(-0.05, 0.08, t) * (0.6 + 0.4 * noise3(x * 50 + sm.k, y * 50, z * 50));
      bl = Math.max(bl, f * fade * sm.a2);
    }
    // 噴濺(前面較多)
    const spl = sstep(0.34, 0.42, fbm(x * 11 + 5 + K, y * 11, z * 11, 3)) * sstep(-0.2, 0.5, nz) * blood;
    bl = Math.max(bl, spl * (y > 0.6 ? 0.85 : 0.45));
    bl = clamp(bl * (0.6 + blood * 0.5), 0, 1);
    if (bl > 0.01) {
      const b = sstep(0.22, 0.6, bl + fbm(x * 30 + K, y * 30, z * 30, 2) * 0.35);
      const fresh = sstep(0.45, 0.95, bl);
      const bc = [lerp(BLOOD_DRY[0], BLOOD[0], fresh), lerp(BLOOD_DRY[1], BLOOD[1], fresh), lerp(BLOOD_DRY[2], BLOOD[2], fresh)];
      const det = 0.6 + 0.4 * clamp(L / 0.25, 0, 1.5); // 保留一點底下的紋理
      mixc(bc.map((v) => v * det), b * lerp(0.6, 0.88, fresh));
      wet = Math.max(wet, b * fresh * 0.85);
    }
    if (soak > 0.02 && skin < 0.5) {
      const s2 = soak * (1 - skin);
      // 布料吸了血:核心暗紅(新鮮處偏紅、乾掉的偏褐),外圈淡紅褐的暈染;遠處也看得出是血
      const core = sstep(0.34, 0.64, s2), halo = clamp(sstep(0.07, 0.34, s2) - core, 0, 1);
      mul([0.66, 0.36, 0.3], halo * 0.8);
      const fr = sstep(0.2, 0.6, fbm(x * 16 + K, y * 16, z * 16, 2) + 0.35) * sstep(0.5, 0.9, s2);
      const bc = [lerp(BLOOD_DRY[0], BLOOD[0] * 1.5, fr), lerp(BLOOD_DRY[1], BLOOD[1] * 1.3, fr), lerp(BLOOD_DRY[2], BLOOD[2] * 1.3, fr)];
      mixc(bc.map((v) => v * (0.95 + L * 0.6)), core * 0.92);
      wet = Math.max(wet, core * fr * 0.7);
    }

    out[o] = toS(c[0]); out[o + 1] = toS(c[1]); out[o + 2] = toS(c[2]);
    if (!alphaTex) out[o + 3] = Math.round(clamp(wet, 0, 1) * 255);
    skinOut[i] = Math.round(clamp(Math.max(skin, wet > 0.8 ? 0.6 : 0), 0, 1) * 255);
  }
  return { color: out, skin: skinOut };
}

// ---------- 傷口/血跡配置(依角色種子) ----------
// verts:{ pos, nor, part } 供在指定部位挑表面點;spec:look.wounds = [{ kind, at, r }]
export function plan(look, rig, verts) {
  const r = rng(look.seed * 7919 + 13);
  const pick = (test) => {
    const cand = [];
    for (let i = 0; i < verts.count; i++) if (test(verts.pos[i * 3], verts.pos[i * 3 + 1], verts.pos[i * 3 + 2], verts.part[i], verts.nor[i * 3 + 2])) cand.push(i);
    if (!cand.length) return null;
    const i = cand[(r() * cand.length) | 0];
    return { x: verts.pos[i * 3], y: verts.pos[i * 3 + 1], z: verts.pos[i * 3 + 2], nx: verts.nor[i * 3], ny: verts.nor[i * 3 + 1], nz: verts.nor[i * 3 + 2] };
  };
  const B = (n) => rig.bones.find((b) => b.name === n);
  const AT = {
    neck: (x, y, z, p, nz) => p === PART.neck && nz > -0.2,
    neckL: (x, y, z, p, nz) => p === PART.neck && x > 0.01,
    neckR: (x, y, z, p, nz) => p === PART.neck && x < -0.01,
    shoulderL: (x, y, z, p) => (p === PART.torso || p === PART.arm) && x > 0.1 && y > B('chest').head.y + 0.05,
    shoulderR: (x, y, z, p) => (p === PART.torso || p === PART.arm) && x < -0.1 && y > B('chest').head.y + 0.05,
    forearmL: (x, y, z, p) => p === PART.arm && x > 0 && y < B('forearmL').head.y - 0.04,
    forearmR: (x, y, z, p) => p === PART.arm && x < 0 && y < B('forearmR').head.y - 0.04,
    upperArmL: (x, y, z, p) => p === PART.arm && x > 0 && y > B('forearmL').head.y + 0.04,
    upperArmR: (x, y, z, p) => p === PART.arm && x < 0 && y > B('forearmR').head.y + 0.04,
    torso: (x, y, z, p, nz) => p === PART.torso && nz > 0.3 && y > B('spine').head.y,
    belly: (x, y, z, p, nz) => p === PART.torso && nz > 0.4 && y < B('chest').head.y && y > B('hips').head.y,
    side: (x, y, z, p, nz) => p === PART.torso && Math.abs(nz) < 0.4 && y > B('spine').head.y,
    thighL: (x, y, z, p, nz) => p === PART.leg && x > 0 && y > B('shinL').head.y + 0.05 && nz > 0,
    thighR: (x, y, z, p, nz) => p === PART.leg && x < 0 && y > B('shinR').head.y + 0.05 && nz > 0,
    shinL: (x, y, z, p, nz) => p === PART.leg && x > 0 && y < B('shinL').head.y - 0.05 && nz > 0,
    shinR: (x, y, z, p, nz) => p === PART.leg && x < 0 && y < B('shinR').head.y - 0.05 && nz > 0,
    cheek: (x, y, z, p, nz) => p === PART.head && nz > 0.3 && Math.abs(x) > 0.03 && y < rig.HC.y && y > rig.mouth.y,
    scalp: (x, y, z, p) => p === PART.head && y > rig.HC.y + 0.06,
  };
  const wounds = [];
  for (const w of look.wounds || []) {
    const s = pick(AT[w.at] || AT.torso);
    if (!s) continue;
    const c = { x: s.x, y: s.y, z: s.z }, rad = w.r || 0.028;
    const wd = { kind: w.kind, c, r: rad, k: r() * 50, drips: [] };
    if (w.kind === 'gash') {
      // 沿表面切線的方向
      let dx = r() - 0.5, dy = r() - 0.5, dz = r() - 0.5;
      const dn = dx * s.nx + dy * s.ny + dz * s.nz;
      dx -= dn * s.nx; dy -= dn * s.ny; dz -= dn * s.nz;
      const l = Math.hypot(dx, dy, dz) || 1, len = rad * (w.len || 3);
      wd.a = { x: c.x - (dx / l) * len / 2, y: c.y - (dy / l) * len / 2, z: c.z - (dz / l) * len / 2 };
      wd.b = { x: c.x + (dx / l) * len / 2, y: c.y + (dy / l) * len / 2, z: c.z + (dz / l) * len / 2 };
    }
    const nd = w.drips ?? 3;
    for (let k = 0; k < nd; k++) wd.drips.push({ x: c.x + r.range(-1, 1) * rad, y: c.y, z: c.z, len: r.range(0.06, 0.3) * (w.flow ?? 1), w: r.range(0.002, 0.005), k: r() * 50, side: s.nz >= 0 ? 1 : -1 });
    wounds.push(wd);
  }
  // 嘴角往下的血:沿下巴、脖子流到領口
  const mo = rig.mouth, mb = look.mouthBlood ?? 0.6, drips = [];
  for (let k = 0, nn = 2 + Math.round(mb * 5); k < nn; k++) drips.push({ x: mo.x + r.range(-0.022, 0.022), y: mo.y - 0.004, len: r.range(0.03, 0.06 + mb * 0.18), w: r.range(0.0014, 0.0026 + mb * 0.0012), k: r() * 50 });
  // 衣服上大片吸血:軀幹正面/側面
  const soaks = [];
  for (let k = 0, nn = look.soaks ?? 2; k < nn; k++) {
    const y0 = B('hips').head.y + 0.06, y1 = B('neck').head.y - 0.12;
    const s = pick(k % 2 === 0 ? (x, y, z, p, nz) => p === PART.torso && nz > 0.5 && z > 0.03 && y > y0 && y < y1 : (x, y, z, p, nz) => p === PART.torso && Math.abs(x) > 0.09 && Math.abs(nz) < 0.6 && y > y0 && y < y1);
    if (s) soaks.push({ c: { x: s.x, y: s.y, z: s.z }, r: r.range(0.07, 0.12) * (look.blood ?? 0.7) + 0.03, a: r.range(0.9, 1.2), k: r() * 50 });
  }
  // 血手抹過的痕跡:軀幹正面、大腿,往下斜拖
  const smears = [];
  for (let k = 0, nn = Math.round((look.smears ?? 2) * (0.6 + r() * 0.8)); k < nn; k++) {
    const s = pick(k % 3 === 2 ? (x, y, z, p, nz) => p === PART.leg && nz > 0.4 && y > 0.6 : (x, y, z, p, nz) => p === PART.torso && nz > 0.45);
    if (!s) continue;
    // 拖曳方向:沿表面往下(偏左或偏右)
    let dx = r.range(-0.5, 0.5), dy = -1, dz = 0;
    const dn = dx * s.nx + dy * s.ny + dz * s.nz;
    dx -= dn * s.nx; dy -= dn * s.ny; dz -= dn * s.nz;
    const dl = Math.hypot(dx, dy, dz) || 1, d = { x: dx / dl, y: dy / dl, z: dz / dl };
    const sx = s.ny * d.z - s.nz * d.y, sy = s.nz * d.x - s.nx * d.z, sz = s.nx * d.y - s.ny * d.x, sl = Math.hypot(sx, sy, sz) || 1;
    smears.push({ a: { x: s.x, y: s.y, z: s.z }, d, s: { x: sx / sl, y: sy / sl, z: sz / sl }, len: r.range(0.1, 0.24), n: 3 + (r() < 0.5 ? 1 : 0), a2: r.range(0.75, 1), k: r() * 50 });
  }
  const chin = mb > 0.2 ? { x: mo.x + r.range(-0.01, 0.01), y: mo.y - 0.03, z: mo.z - 0.005, r: 0.012 + mb * 0.018 } : null;
  return { wounds, drips, chin, smears, soaks };
}

// 身體貼圖的第二個皮膚參考色:手部像素的中位數(手臂/手常比臉曬得深);戴手套(色度差太多)就不用
export function handRef(M, img, ref) {
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < M.W * M.H; i++) {
    if (M.cov[i] !== 1 || M.part[i] !== PART.hand) continue;
    rs.push(LIN[img[i * 4]]); gs.push(LIN[img[i * 4 + 1]]); bs.push(LIN[img[i * 4 + 2]]);
  }
  if (rs.length < 50 || !ref) return null;
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  const h = [med(rs), med(gs), med(bs)], hs = h[0] + h[1] + h[2], rsum = ref[0] + ref[1] + ref[2];
  const d = Math.hypot(h[0] / hs - ref[0] / rsum, h[1] / hs - ref[1] / rsum, h[2] / hs - ref[2] / rsum);
  return d < 0.09 ? h : null;
}
