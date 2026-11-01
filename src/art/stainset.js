// ===== 血跡貼花集:每一格的畫法、圖集版面、算圖 =====
// 純函式(Worker 與主執行緒共用)。版面是固定的(stainLayout),主執行緒不用等 Worker 就知道每格的 UV。
// 每格:w×h 像素、ppm 像素/公尺(內容依真實尺寸畫:手長 18~19cm、指距 1.8~2.1cm、鞋長 28cm…)、
//      k = 呼叫端尺寸 → 實際尺寸的倍數(讓舊的擺放參數維持合理的真實大小)、floor 地面用(沒有重力方向)。
import {
  rng, hashStr, buf, blur, compose, packNR, handModel, handPrint, drips, run, clawSet, chips, drop, spatter, floorDrop,
  pool, smear, curve, footPrint, seg, poly, ell, vnoise, fbm, clamp, sstep,
} from './stains.js';

const PLASTER = [208, 201, 186]; // 刮掉漆露出的灰泥/底材(偏暖、略暗,不要比牆面亮太多)
export const CELLS = {
  // ---- 牆面 ----
  // 手掌按在牆上往下滑:上方完整掌印,下面是指紋拉出的條紋,最後往下滴
  hand0: { w: 224, h: 384, ppm: 700, k: 0.76, age: 0.5, por: 0.25, flake: 0.15, rim: 0.6, ex: 2.0, paint(B, R, c) {
    const M = handModel(R, { spread: R.r(0.15, 0.45) }), left = R() < 0.4;
    // 滑下的距離短一點、拖痕淡得快(長長一整片條紋像刷子刷的);垂流少、長短不一
    const g = handPrint(B, R, M, { x: c.w / 2 + R.r(-10, 10), y: 150, ang: R.r(-0.1, 0.1), ppm: c.ppm, left, thr: 0.3, tx: R.r(-0.3, 0.3), ty: R.r(-0.2, 0.3), seed: R.i(0, 1e5), load: 1.05, slide: { len: R.r(38, 68), ang: R.r(-0.09, 0.09), pow: 1.7, end: 0.16, wob: 1.6 } });
    drips(B, R, { n: 3, y0: g.gy0 + 40, len: 150, w0: 2.4, thr: 0.36, gap: 9 });
  } },
  // 兩隻手推在牆上(一隻完整、一隻只有手指和上半掌),往下滴
  hand1: { w: 288, h: 352, ppm: 700, k: 0.98, age: 0.72, por: 0.2, flake: 0.25, rim: 0.6, ex: 2.0, paint(B, R, c) {
    const s = R.i(0, 1e5);
    handPrint(B, R, handModel(R, { spread: R.r(0.2, 0.5) }), { x: 88, y: 238, ang: R.r(0.08, 0.2), ppm: c.ppm, left: true, thr: 0.3, tx: R.r(-0.2, 0.2), ty: 0.1, seed: s, load: 1.0 });
    handPrint(B, R, handModel(R, { spread: R.r(0.25, 0.6), pp: 0.8 }), { x: 204, y: 214, ang: R.r(-0.22, -0.08), ppm: c.ppm, left: false, thr: 0.44, tx: R.r(-0.2, 0.2), ty: 0.55, seed: s + 7, load: 0.85 });
    drips(B, R, { n: 7, len: 120, w0: 2.4, thr: 0.32, gap: 6 });
  } },
  // 瘋狂的抓痕:四組 4 道指甲溝,掉漆露出白色灰泥,一組溝裡有乾血、起點有指腹的血
  claw0: { w: 288, h: 416, ppm: 650, k: 0.92, age: 0.86, por: 0.1, rim: 0.4, ex: 2.6, sub: PLASTER, dustCol: [74, 66, 56], paint(B, R, c) {
    const PX = new Float32Array(c.w * c.h);
    const sets = [
      { x: 92, y: 34, ang: R.r(-0.2, 0.05), len: 46, sp: 1.9, bend: R.r(-0.06, 0.06), dep: 1, blood: 0.95 },
      { x: 178, y: 62, ang: R.r(0.05, 0.22), len: 50, sp: 1.8, bend: R.r(-0.05, 0.05), dep: 0.92 },
      { x: 128, y: 168, ang: R.r(-0.18, 0), len: 33, sp: 1.85, bend: 0.05, dep: 0.85, blood: 0.55 },
      { x: 218, y: 214, ang: R.r(0.25, 0.45), len: 24, sp: 2.0, bend: -0.04, dep: 0.7, n: 3 },
    ];
    for (const S of sets) clawSet(B, R, S, c.ppm, PX);
    chips(B, PX, c.ppm, R.i(0, 1e5), 1);
    const halo = blur(PX, c.w, c.h, 10);
    for (let i = 0; i < PX.length; i++) B.dust[i] = Math.max(B.dust[i], halo[i] * 0.2); // 手抓過的地方一圈手垢
  } },
  // 兩組長長往下拖的抓痕(沒有血),灰塵卡在溝裡
  claw1: { w: 224, h: 416, ppm: 600, k: 0.78, age: 0.9, por: 0.1, ex: 2.6, sub: PLASTER, dustCol: [70, 62, 52], paint(B, R, c) {
    const PX = new Float32Array(c.w * c.h);
    clawSet(B, R, { x: 84, y: 26, ang: R.r(-0.1, 0.02), len: 58, sp: 1.95, bend: R.r(0.03, 0.08), dep: 1 }, c.ppm, PX);
    clawSet(B, R, { x: 150, y: 96, ang: R.r(0.04, 0.14), len: 46, sp: 1.85, bend: R.r(-0.06, 0), dep: 0.8, n: 3 }, c.ppm, PX);
    chips(B, PX, c.ppm, R.i(0, 1e5), 0.9);
    const halo = blur(PX, c.w, c.h, 10);
    for (let i = 0; i < PX.length; i++) B.dust[i] = Math.max(B.dust[i], halo[i] * 0.18);
  } },
  // 撞擊噴濺 + 一排往下流的血
  drip0: { w: 160, h: 448, ppm: 380, k: 0.84, age: 0.6, por: 0.15, flake: 0.25, rim: 0.6, ex: 2.2, paint(B, R, c) {
    spatter(B, R, { x: 80 + R.r(-8, 8), y: 52, R: 62, n: 70, rm: 10, dir: R.r(0, 6.28), cone: Math.PI, rmax: 2.4, spikes: 12, mist: 50 });
    smear(B, R, curve([80 + R.r(-30, -10), 44], [70, 54], [96, 62], [80 + R.r(20, 45), 70], 16), { wd: (u) => 16 * (1 - 0.5 * u), load: (u) => 1.0 * (1 - u * 0.7), bristles: 40, dry: 0.4 });
    drips(B, R, { n: 9, y0: 30, y1: 96, len: 360, w0: 3.0, thr: 0.4, gap: 5 });
  } },
  // 牆上噴濺(子彈/刀砍的方向性噴射)+ 幾條垂流
  splat0: { w: 256, h: 256, ppm: 520, k: 1.0, age: 0.55, por: 0.2, flake: 0.2, rim: 0.7, ex: 2.0, paint(B, R, c) {
    const dir = R.r(-0.5, 0.5) + (R() < 0.5 ? 0 : Math.PI);
    spatter(B, R, { x: 128 - Math.cos(dir) * 40, y: 112, R: 125, n: 170, rm: 13, dir, cone: 1.05, rmax: 3.2, spikes: 16, mist: 140 });
    drips(B, R, { n: 4, y0: 80, y1: 150, len: 130, w0: 2.6, thr: 0.45, gap: 8 });
  } },
  // 牆上的抹痕(手臂/身體沿牆滑下):起點厚、刷毛條紋、越往下越乾
  smearW: { w: 192, h: 384, ppm: 420, k: 1.0, age: 0.7, por: 0.25, flake: 0.15, rim: 0.5, ex: 2.0, paint(B, R, c) {
    const x0 = 90 + R.r(-10, 10);
    smear(B, R, curve([x0, 24], [x0 + R.r(-20, 20), 120], [x0 + R.r(-25, 25), 230], [x0 + R.r(-15, 25), 330], 40), { wd: (u) => 64 * (1 - 0.35 * u), load: (u) => 1.15 * Math.pow(1 - u, 0.75) + 0.08, bristles: 80, clump: 0.45, dry: 0.5 });
    drips(B, R, { n: 4, y0: 24, y1: 120, len: 140, w0: 2.4, thr: 0.5, gap: 10 });
  } },
  // ---- 地面 ----
  // 新鮮血泊:亮面、厚、液面邊緣微凸;旁邊的滴點
  pool0: { w: 320, h: 320, ppm: 290, k: 1.0, floor: 1, age: 0.04, por: 0, rim: 0.15, ex: 3.2, paint(B, R, c) {
    pool(B, R, [[160, 166, 92], [96 + R.r(-10, 10), 112, 38], [228, 226 + R.r(-10, 10), 34]], { edge: 2.2, tv: 1.6, center: 0.5, warp: 0.16, clots: 70 });
    for (let k = 0; k < 14; k++) { const a = R() * 6.28, d = R.r(120, 150); floorDrop(B, R, 160 + Math.cos(a) * d, 160 + Math.sin(a) * d, R.r(1.6, 4.2), 1.1, a); }
  } },
  // 放了很久的血泊:邊緣乾成深褐、龜裂,中間還黏;外圈淡黃的血清環;有人踩過走出去
  pool1: { w: 320, h: 320, ppm: 290, k: 1.0, floor: 1, age: 0.85, por: 0, flake: 0.6, rim: 0.9, ex: 2.6, dustCol: [150, 120, 74], dustA: 0.55, paint(B, R, c) {
    const sdf = pool(B, R, [[148, 150, 88], [208, 104, 40], [92, 214, 36]], { edge: 2.2, tv: 1.5, center: 0.6, warp: 0.18, sdf: true, clots: 30 });
    for (let i = 0; i < sdf.length; i++) {
      const d = sdf[i];
      if (d > -1 && d < 5) B.dust[i] = Math.max(B.dust[i], 0.4 * (1 - Math.abs(d - 1.5) / 3.5));
      if (d < 0) B.ag[i] = -0.55 * sstep(-6, -40, d);
    }
    footPrint(B, R, { kind: 'shoe', tread: 'lug', x: 236, y: 300, ang: 0.55, ppm: c.ppm, left: false, load: 0.85, slip: 5 });
    footPrint(B, R, { kind: 'shoe', tread: 'lug', x: 296, y: 230, ang: 0.62, ppm: c.ppm, left: true, load: 0.42, thr: 0.38 });
  } },
  // 拖行:起點的血泊 → 寬條紋帶,邊上有手指抓地的細線,越拖越乾
  drag0: { w: 224, h: 512, ppm: 170, k: 0.82, floor: 1, age: 0.78, por: 0, flake: 0.25, rim: 0.6, ex: 1.8, paint(B, R, c) {
    const P = curve([112, 488], [112 + R.r(-30, 30), 340], [112 + R.r(-30, 30), 170], [100 + R.r(-15, 15), 18], 48);
    pool(B, R, [[112, 470, 30], [92, 452, 16]], { edge: 2, tv: 1.4, warp: 0.1 });
    smear(B, R, P, { wd: (u) => 78 * (1 - 0.25 * u), load: (u) => 1.3 * Math.pow(1 - u, 0.9) + 0.06, bristles: 44, clump: 0.5, dry: 0.5, wander: 0.2 });
    // 手指抓地:四道細線,在帶子一側
    const f0 = R.r(0.12, 0.25), f1 = f0 + R.r(0.25, 0.4), fs = R.i(0, 1e5);
    for (let f = 0; f < 4; f++) {
      const L = [];
      for (let k = Math.round(f0 * 48); k <= Math.round(f1 * 48); k++) {
        const a = P[Math.max(0, k - 1)], b = P[Math.min(48, k + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
        const u = (k - f0 * 48) / ((f1 - f0) * 48), o = 44 + f * 3.4 * (1 - 0.35 * u) + (vnoise(k * 0.18, f, fs) - 0.5) * 3;
        L.push(P[k][0] - (ty / tl) * o, P[k][1] + (tx / tl) * o, 0.85, 0.75 * (1 - u * 0.7));
      }
      poly(B.t, c.w, c.h, L, 1);
    }
    for (let k = 0; k < 18; k++) { const p = P[R.i(0, 48)]; floorDrop(B, R, p[0] + R.r(-60, 60), p[1] + R.r(-10, 10), R.r(1, 2.4), 1, null); }
  } },
  // 地上被抹過(拖把/手):幾道弧形的淡抹痕
  smearF: { w: 224, h: 448, ppm: 200, k: 0.93, floor: 1, age: 0.85, por: 0, flake: 0.2, rim: 0.5, ex: 1.6, paint(B, R, c) {
    // 拖把/抹布來回抹:方向、寬度都不規則,互相重疊,後抹的比較淡
    for (let k = 0; k < 6; k++) {
      const cx = R.r(50, 174), cy = R.r(60, 390), a = R.r(-0.9, 0.9) + (R() < 0.5 ? 0 : Math.PI), L = R.r(90, 170), bend = R.r(-50, 50);
      const ax = cx - Math.cos(a) * L / 2, ay = cy - Math.sin(a) * L / 2, bx = cx + Math.cos(a) * L / 2, by = cy + Math.sin(a) * L / 2;
      const nx = -Math.sin(a) * bend, ny = Math.cos(a) * bend;
      const P = curve([ax, ay], [ax + (bx - ax) / 3 + nx, ay + (by - ay) / 3 + ny], [ax + (bx - ax) * 2 / 3 + nx, ay + (by - ay) * 2 / 3 + ny], [bx, by], 30);
      const ld = R.r(0.45, 1.0) * (1 - k * 0.08), w0 = R.r(26, 40);
      smear(B, R, P, { wd: (u) => w0 * (0.55 + 0.45 * sstep(0, 0.12, u)) * (1 - 0.35 * u), load: (u) => ld * sstep(0, 0.06, u) * Math.pow(1 - u, 1.1) + 0.03, bristles: 60, clump: 0.5, dry: 0.55 });
    }
  } },
  // 鞋印:沾到血的運動鞋走三步,一步比一步淡、紋路越來越不完整
  feet0: { w: 160, h: 512, ppm: 290, k: 0.5, floor: 1, age: 0.8, por: 0, flake: 0.3, rim: 0.6, ex: 1.6, paint(B, R, c) {
    const tread = R() < 0.6 ? 'lug' : 'bar';
    footPrint(B, R, { kind: 'shoe', tread, x: 98, y: 502, ang: -0.08, ppm: c.ppm, left: false, load: 1.05, slip: 4 });
    footPrint(B, R, { kind: 'shoe', tread, x: 62, y: 300, ang: 0.07, ppm: c.ppm, left: true, load: 0.62, thr: 0.34 });
    footPrint(B, R, { kind: 'shoe', tread, x: 99, y: 98, ang: -0.06, ppm: c.ppm, left: false, load: 0.36, thr: 0.42 });
  } },
  // 赤腳(小腳/病人):三步
  feet1: { w: 144, h: 448, ppm: 300, k: 0.48, floor: 1, age: 0.78, por: 0, flake: 0.2, rim: 0.6, ex: 1.6, paint(B, R, c) {
    footPrint(B, R, { kind: 'bare', x: 86, y: 436, ang: -0.06, ppm: c.ppm, left: false, load: 1.0, L: 21 });
    footPrint(B, R, { kind: 'bare', x: 56, y: 286, ang: 0.08, ppm: c.ppm, left: true, load: 0.68, L: 21, thr: 0.34 });
    footPrint(B, R, { kind: 'bare', x: 88, y: 136, ang: -0.04, ppm: c.ppm, left: false, load: 0.42, L: 21, thr: 0.4 });
  } },
  // 地上的滴血軌跡(邊走邊滴):圓點、扇貝邊、往前的小濺點
  dripF: { w: 128, h: 448, ppm: 300, k: 0.48, floor: 1, age: 0.75, por: 0, flake: 0.15, rim: 0.8, ex: 1.6, paint(B, R, c) {
    let y = 430, x = 64;
    while (y > 16) {
      x = clamp(x + R.r(-6, 6), 30, 98);
      floorDrop(B, R, x, y, R.r(1.6, 3.6), R.r(0.9, 1.3), -Math.PI / 2 + R.r(-0.3, 0.3));
      if (R() < 0.3) floorDrop(B, R, x + R.r(-5, 5), y + R.r(-5, 5), R.r(1, 2), 1, null);
      y -= R.r(20, 48);
    }
  } },
  // 地上的刮痕:家具腳拖過的兩對平行刮線 + 門板刮過的弧線
  scratchF: { w: 192, h: 384, ppm: 140, k: 0.98, floor: 1, age: 0.9, por: 0, ex: 1.8, sub: [196, 194, 186], dustCol: [40, 36, 32], dustA: 0.6, paint(B, R, c) {
    const PX = new Float32Array(c.w * c.h);
    for (const x0 of [48 + R.r(-6, 6), 48 + 84 + R.r(-6, 6)]) for (const dx of [0, 3.5 + R.r(0, 2)]) {
      const L = [], Q = [], y0 = R.r(20, 60), y1 = R.r(300, 370), seed = R.i(0, 1e5);
      for (let y = y0; y <= y1; y += 2) { const u = (y - y0) / (y1 - y0), x = x0 + dx + (vnoise(y * 0.02, dx, seed) - 0.5) * 3 + u * 6; const d = 0.5 * sstep(0, 0.05, u) * (1 - sstep(0.9, 1, u)) * (0.7 + 0.3 * Math.sin(y * 0.9 + seed)); L.push(x, y, 0.9, d); Q.push(x, y, 2.6, d); }
      poly(B.gd, c.w, c.h, L, 2); poly(PX, c.w, c.h, Q, 3);
      for (let k = 0; k < L.length; k += 4) B.dust[(L[k + 1] | 0) * c.w + (L[k] | 0) + 2] = 0.5; // 橡膠擦痕
    }
    // 門板刮出的弧
    const cx = R.r(-20, 20), cy = R.r(20, 60), r0 = R.r(150, 175), A = [];
    for (let a = 0.2; a < 1.35; a += 0.012) A.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, 0.8, 0.35 * (0.6 + 0.4 * Math.sin(a * 37)));
    poly(B.gd, c.w, c.h, A, 2);
    chips(B, PX, c.ppm, R.i(0, 1e5), 0.5);
  } },
  // 從高處滴下的一大滴(皇冠狀濺開)
  splatF: { w: 192, h: 192, ppm: 240, k: 0.94, floor: 1, age: 0.55, por: 0, flake: 0.2, rim: 0.8, ex: 1.7, paint(B, R, c) {
    // 一大滴從高處落下:圓形本體、短的扇貝狀冠刺、靠近的小衛星滴
    floorDrop(B, R, 96, 96, 17, 1.35, null);
    for (let k = 0; k < 26; k++) { const a = R() * 6.283, d = R.r(22, 30) + Math.pow(R(), 2) * 55; drop(B, 96 + Math.cos(a) * d, 96 + Math.sin(a) * d, R.r(0.6, 2.4) * (1 - d / 120), a, R.r(1, 1.5 + d / 50), R.r(0.7, 1.1), 0.3); }
    for (let k = 0; k < 40; k++) { const a = R() * 6.283, d = R.r(24, 80); ell(B.t, c.w, c.h, 96 + Math.cos(a) * d, 96 + Math.sin(a) * d, R.r(0.4, 0.9), R.r(0.4, 0.8), a, R.r(0.35, 0.7), 0); }
  } },
};

// ---------------------------------------------------------------- 版面(固定;架子打包,依高度排序)
export const ATLAS = { W: 2048, H: 1024, GAP: 8 };
let LAYOUT = null;
export function stainLayout() {
  if (LAYOUT) return LAYOUT;
  const names = Object.keys(CELLS).sort((a, b) => CELLS[b].h - CELLS[a].h || CELLS[b].w - CELLS[a].w || (a < b ? -1 : 1));
  const L = {};
  let x = 0, y = 0, sh = 0;
  for (const n of names) {
    const c = CELLS[n];
    if (x + c.w > ATLAS.W) { x = 0; y += sh + ATLAS.GAP; sh = 0; }
    L[n] = { x, y, w: c.w, h: c.h };
    x += c.w + ATLAS.GAP; sh = Math.max(sh, c.h);
  }
  if (y + sh > ATLAS.H) console.warn('[stains] 圖集放不下', y + sh);
  LAYOUT = L;
  return L;
}
// UV 矩形(與 props/indoor/atlas.js region() 相同慣例:v 往上、內縮半像素)
export function cellUV(name) {
  const r = stainLayout()[name], W = ATLAS.W, H = ATLAS.H;
  return { u0: (r.x + 0.5) / W, v0: 1 - (r.y + r.h - 0.5) / H, u1: (r.x + r.w - 0.5) / W, v1: 1 - (r.y + 0.5) / H, w: r.w, h: r.h };
}
export function renderCell(name, seed = 1) {
  const c = CELLS[name], R = rng((seed * 7919) ^ hashStr(name)), B = buf(c.w, c.h);
  c.paint(B, R, c);
  const C = compose(B, { ...c, seed: seed + hashStr(name) % 1000 });
  C.ppm = c.ppm; C.ex = c.ex;
  return C;
}

// ---------------------------------------------------------------- 其他用途的單張
// 玻璃上的手印(油脂/霧氣):白色 + alpha;size 像素(正方形,手約佔 85%)
export function ghostHandRGBA(seed, size = 256) {
  const R = rng(seed * 31 + 5), B = buf(size, size), ppm = size / 0.22;
  const M = handModel(R, { spread: R.r(0.25, 0.6), pp: 1.05 });
  const g = handPrint(B, R, M, { x: size * 0.56, y: size * 0.93, ang: R.r(-0.06, 0.06), ppm, thr: 0.28, tx: R.r(-0.2, 0.2), ty: R.r(-0.1, 0.25), seed: R.i(0, 1e5), load: 1 });
  void g;
  const out = new Uint8ClampedArray(size * size * 4), s = ppm / 100;
  for (let i = 0; i < size * size; i++) {
    const t = B.t[i];
    if (t <= 0.01) continue;
    const x = i % size, y = (i / size) | 0;
    // 油脂印:大致均勻的霧面 + 斑駁;細微的皮紋只當顆粒(不是條紋)
    const grain = vnoise(x * 0.6, y * 0.25, seed + 7);
    const a = clamp(t * 1.9) * (0.85 + 0.15 * grain) * (0.82 + 0.45 * (fbm(x / s * 1.3, y / s * 1.3, seed + 3, 3) - 0.5));
    out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = clamp(a) * 255;
  }
  return out;
}
// 濕腳印(水):白 + alpha(材質給顏色與光澤);w×h(腳跟在下)
export function wetFootRGBA(seed, w = 128, h = 256) {
  const R = rng(seed * 13 + 3), B = buf(w, h), ppm = h / 0.27;
  footPrint(B, R, { kind: 'bare', x: w * 0.5, y: h * 0.96, ang: 0, ppm, left: false, load: 1, L: 24.5, thr: 0.26 });
  const tb = blur(B.t, w, h, 2), out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const t = B.t[i];
    if (t <= 0.01) continue;
    const rim = clamp((t - tb[i]) * 3); // 水漬邊緣較深
    const x = i % w, y = (i / w) | 0, dry = fbm(x * 0.05, y * 0.05, seed + 3, 3); // 沒踩濕的斑
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255; out[i * 4 + 3] = clamp((t * 1.3 + rim * 0.4) * (0.65 + 0.6 * dry)) * 255;
  }
  return out;
}
// 戰鬥噴濺(乘法混色用):新鮮、方向性
export function fxSpatterRGBA(seed, S = 256) {
  const R = rng(seed * 17 + 1), B = buf(S, S), ppm = S / 0.6, dir = R.r(0, 6.28);
  spatter(B, R, { x: S / 2 - Math.cos(dir) * S * 0.12, y: S / 2 - Math.sin(dir) * S * 0.12, R: S * 0.46, n: 150, rm: S * 0.055, dir, cone: 1.2, rmax: S * 0.013, spikes: 16, mist: 120 });
  return compose(B, { ppm, age: 0.02, rim: 0.1, seed }).rgba;
}
// 寫在牆上的血字(手指塗):mask = 字的 alpha(0..1);回傳 RGBA。px = 每字像素(決定比例)
export function bloodWriting(mask, w, h, seed, px = 96) {
  const R = rng(seed * 101 + 9), B = buf(w, h), ppm = px / 0.3;
  const core = blur(mask, w, h, Math.max(1, px * 0.03));
  for (let i = 0; i < w * h; i++) {
    const m = mask[i];
    if (m <= 0.01) continue;
    const x = i % w, y = (i / w) | 0;
    // 手指沾血:筆畫中間厚、邊緣薄;沾一次寫幾筆 → 大塊的濃淡;指紋條紋
    let v = m * (0.45 + 0.9 * core[i]) * (0.7 + 0.6 * fbm(x / px * 1.6, y / px * 1.6, seed, 3));
    const st = fbm(x / px * 7, y / px * 2.2, seed + 5, 2);
    v *= 0.6 + 0.65 * st;
    if (v < 0.4 && fbm(x / px * 9, y / px * 9, seed + 9, 2) > 0.35 + v) v *= 0.15; // 乾刷斷裂
    B.t[i] = v;
  }
  drips(B, R, { n: Math.max(2, Math.round(w / px * 1.1)), len: px * 1.3, w0: Math.max(1.6, px * 0.032), thr: 0.45, gap: px * 0.35, step: 2 });
  return compose(B, { ppm, age: 0.55, por: 0.15, rim: 0.6, seed }).rgba;
}
export { seg, ell, run, drop, rng };
// 向量版的垂流(給直接在 Canvas 2D 上畫的地方:油漆字、門板):起點寬 w0、越流越細、略彎,末端淚滴形的珠子
export function dripPath(ctx, x, y, w0, len, R, col) {
  const n = Math.max(4, Math.ceil(len / 6)), L = [], Rt = [];
  let px = x;
  for (let k = 0; k <= n; k++) {
    const u = k / n, wd = (w0 / 2) * (1 - 0.6 * Math.pow(u, 0.8));
    px += (R() - 0.5) * Math.min(1.2, w0 * 0.25);
    L.push([px - wd, y + u * len]); Rt.push([px + wd, y + u * len]);
  }
  const ew = w0 * 0.36, ey = y + len;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  ctx.bezierCurveTo(px - ew * 1.1, ey + ew * 1.2, px + ew * 1.1, ey + ew * 1.2, Rt[n][0], Rt[n][1]);
  for (let k = n; k >= 0; k--) ctx.lineTo(Rt[k][0], Rt[k][1]);
  ctx.closePath();
  ctx.fill();
}
// ---------------------------------------------------------------- 室外貼花圖集(po_decal)的血跡格
// 名稱與 src/map/props/outdoor/mats.js 的格子相同;只輸出 albedo(那個材質沒有法線)
export const OUTDOOR = {
  blood1: { w: 256, h: 256, ppm: 360, age: 0.6, flake: 0.2, rim: 0.7, paint(B, R) { spatter(B, R, { x: 128, y: 128, R: 120, n: 110, rm: 16, cone: Math.PI, rmax: 3, spikes: 18, mist: 80 }); } },
  blood2: { w: 256, h: 256, ppm: 360, age: 0.65, flake: 0.2, rim: 0.8, paint(B, R) { for (let k = 0; k < 7; k++) floorDrop(B, R, R.r(50, 206), R.r(50, 206), R.r(3, 9), R.r(1, 1.3), R() < 0.5 ? null : R() * 6.28); } },
  blood3: { w: 256, h: 256, ppm: 420, age: 0.55, por: 0.15, flake: 0.2, rim: 0.6, paint(B, R) {
    spatter(B, R, { x: 128, y: 80, R: 100, n: 90, rm: 14, dir: R.r(0, 6.28), cone: Math.PI, rmax: 2.6, spikes: 14, mist: 60 });
    drips(B, R, { n: 6, y0: 60, y1: 110, len: 150, w0: 3, thr: 0.45, gap: 8 });
  } },
  hand: { w: 256, h: 256, ppm: 820, age: 0.6, por: 0.15, flake: 0.2, rim: 0.6, paint(B, R) {
    handPrint(B, R, handModel(R, { spread: 0.35 }), { x: 128, y: 190, ang: R.r(-0.1, 0.1), ppm: 820, thr: 0.32, tx: 0.1, ty: 0.15, seed: 4, load: 1 });
    drips(B, R, { n: 5, len: 60, w0: 2.6, thr: 0.35, gap: 6 });
  } },
  drip: { w: 256, h: 256, ppm: 300, age: 0.6, flake: 0.2, rim: 0.6, paint(B, R) {
    smear(B, R, curve([10, 8], [90, 14], [170, 4], [246, 10], 20), { wd: 12, load: () => 1, bristles: 40, dry: 0.3 });
    drips(B, R, { n: 10, y0: 2, y1: 30, len: 230, w0: 3.2, thr: 0.4, gap: 8 });
  } },
  pool: { w: 256, h: 256, ppm: 240, age: 0.08, rim: 0.2, paint(B, R) { pool(B, R, [[128, 132, 80], [80, 90, 30], [180, 180, 28]], { edge: 2, tv: 1.6, center: 0.5, warp: 0.15, clots: 40 }); } },
  smear: { w: 512, h: 256, ppm: 240, age: 0.75, flake: 0.25, rim: 0.6, paint(B, R) {
    const P = curve([20, 128 + R.r(-20, 20)], [180, 128 + R.r(-50, 50)], [330, 128 + R.r(-50, 50)], [492, 128 + R.r(-20, 20)], 48);
    smear(B, R, P, { wd: (u) => 110 * (1 - 0.3 * u), load: (u) => 1.25 * Math.pow(1 - u, 0.9) + 0.06, bristles: 90, clump: 0.3, dry: 0.5 });
  } },
  steps: { w: 512, h: 256, ppm: 300, age: 0.8, flake: 0.25, rim: 0.6, paint(B, R) {
    for (let k = 0; k < 4; k++) footPrint(B, R, { kind: 'shoe', tread: 'lug', x: 20 + k * 128, y: 128 + (k % 2 ? 22 : -22), ang: Math.PI / 2 + R.r(-0.08, 0.08), ppm: 300, left: k % 2 === 1, load: 1 - k * 0.2, thr: 0.3 + k * 0.04 });
  } },
};
export function renderOutdoor(name, seed = 1) {
  const c = OUTDOOR[name], R = rng((seed * 131) ^ hashStr(name)), B = buf(c.w, c.h);
  c.paint(B, R, c);
  return compose(B, { ...c, seed });
}
