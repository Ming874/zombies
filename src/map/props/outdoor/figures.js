import * as THREE from 'three';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, tube, extrude, gridSurface, smoothNormals, keepUV, V3, HALF, TAU, lerp, clamp, sstep, noise1 } from './kit.js';
import { decalUV } from './mats.js';

// 程式雕塑的人形雕像(石材):長袍 + 斗篷/頭紗 + 頭部 + 手;站姿,面向 +Z,腳底在 y=0。
// 尺寸以身高 H(公尺)為準;皺褶以截面上的正弦起伏 + 雜訊表現。

const g2 = (d2, r) => Math.exp(-d2 / (r * r));
// 截面放樣:ys = 高度表;ring(y) 回傳 { rx, rz, cx, cz };fold(y, θ) 回傳半徑倍率;open = [θa(y)](0 = 封閉)
function loft(ys, ring, { n = 36, fold = null, open = null, inset = 0, flip = false } = {}) {
  const rows = [];
  for (const y of ys) {
    const { rx, rz, cx = 0, cz = 0 } = ring(y);
    const oa = open ? open(y) : 0, r = [];
    for (let i = 0; i <= n; i++) {
      const th = oa ? lerp(oa, TAU - oa, i / n) : (i / n) * TAU;
      const f = (fold ? fold(y, th) : 1);
      r.push(new V3(cx + Math.sin(th) * (rx * f - inset), y, cz + Math.cos(th) * (rz * f - inset)));
    }
    rows.push(r);
  }
  return smoothNormals(gridSurface(rows, { flip: !flip }), 0.3);
}
// 頭部:橢球 + 高斯五官(鼻、眉骨、顴骨、下巴、眼窩)
function head(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 28, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * rx, y = p.getY(i) * ry, z = p.getZ(i) * rz;
    if (z > 0) {
      const nx = x / rx, ny = y / ry;
      let d = 0;
      d += g2(nx * nx * 4 + (ny + 0.1) ** 2 * 1.2, 0.35) * 0.16 * (1 - sstep(-0.1, 0.25, ny)) * sstep(-0.55, -0.2, ny); // 鼻
      d += g2((ny - 0.22) ** 2 * 6 + nx * nx * 0.6, 0.5) * 0.06; // 眉骨
      d -= g2((Math.abs(nx) - 0.36) ** 2 * 5 + (ny - 0.1) ** 2 * 7, 0.42) * 0.09; // 眼窩
      d += g2((Math.abs(nx) - 0.55) ** 2 * 3 + (ny + 0.15) ** 2 * 4, 0.5) * 0.05; // 顴骨
      d += g2(nx * nx * 3 + (ny + 0.82) ** 2 * 6, 0.4) * 0.07; // 下巴
      d -= g2(nx * nx * 2.2 + (ny + 0.5) ** 2 * 30, 0.35) * 0.03; // 嘴縫
      z += d * rz;
    }
    if (y < -0.4 * ry) { x *= 1 - 0.25 * sstep(-0.4, -1, y / ry); z *= 1 - 0.12 * sstep(-0.4, -1, y / ry); }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
// 手(合掌或攤開):簡化成手掌 + 四指一片 + 拇指
function hand(open = false) {
  const P = new Parts();
  P.add('x', sph(0.05, 12, 10).scale(0.8, 1.15, 0.32), M(0, 0.06, 0));
  P.add('x', sph(0.045, 12, 10).scale(0.75, 1.25, 0.26), M(0, 0.135, open ? 0.008 : 0, open ? -0.2 : 0, 0, 0));
  P.add('x', sph(0.018, 8, 6).scale(1, 2.2, 1), M(-0.038, 0.07, 0.008, 0, 0, open ? 0.8 : 0.35));
  return P;
}
const reMat = (P, key) => { const out = new Parts(); for (const [, l] of P.map) for (const g of l) out.add(key, g); return out; };

// ---------- 長袍人形 ----------
// pose: 'pray'(合掌,聖母)| 'heart'(右手指心、左手攤開,聖心耶穌)| 'angel'(低頭、雙手垂握)
export function robedFigure(H, { pose = 'pray', key = 'marble', veil = true, seed = 1 } = {}) {
  const P = new Parts();
  const s = H / 1.7;
  const ph = (k) => noise1(seed * 13.1 + k);
  // 長袍:下擺外擴、腰身收、胸肩
  const robeRing = (y) => {
    const t = y / H;
    const rx = (t < 0.55 ? lerp(0.165, 0.105, sstep(0, 0.55, t)) : t < 0.76 ? lerp(0.105, 0.125, sstep(0.55, 0.76, t)) : lerp(0.125, 0.04, sstep(0.76, 0.86, t) ** 0.8)) * H;
    const rz = (t < 0.55 ? lerp(0.13, 0.08, sstep(0, 0.55, t)) : t < 0.76 ? lerp(0.08, 0.085, sstep(0.55, 0.76, t)) : lerp(0.085, 0.04, sstep(0.76, 0.86, t))) * H;
    return { rx, rz, cz: t < 0.1 ? 0.02 * H * (1 - t / 0.1) : 0 };
  };
  const fold = (y, th) => {
    const t = y / H, w = 1 - sstep(0.1, 0.62, t);
    return 1 + w * (0.07 * Math.sin(th * 7 + ph(1) * 3 + t * 6) + 0.035 * Math.sin(th * 13 + ph(2) * 5)) + 0.012 * Math.sin(th * 5 + t * 20);
  };
  const ys = [];
  for (let i = 0; i <= 22; i++) ys.push((i / 22) * 0.85 * H);
  P.add(key, loft(ys, robeRing, { n: 48, fold }));
  P.add(key, lathe([[0, 0], [0.17 * H * 1.05, 0], [0.17 * H * 1.06, 0.004]], 40).scale(1, 1, 0.8)); // 底面
  // 頸、頭
  P.add(key, cyl(0.032 * H, 0.04 * H, 0.06 * H, 14), M(0, 0.86 * H, 0.004 * H));
  const hy = 0.915 * H, tiltX = pose === 'pray' ? 0.22 : pose === 'angel' ? 0.38 : 0.08;
  P.add(key, head(0.052 * H, 0.066 * H, 0.058 * H), M(0, hy, 0.01 * H, tiltX, pose === 'heart' ? 0 : 0.12, 0));
  // 腳尖(露出下擺)
  for (const sx of [-1, 1]) P.add(key, sph(0.032 * H, 10, 8).scale(0.8, 0.5, 1.6), M(sx * 0.045 * H, 0.012 * H, 0.13 * H));
  // 手臂與手
  const handP = (open) => reMat(hand(open), key);
  if (pose === 'pray' || pose === 'angel') {
    const hy2 = (pose === 'pray' ? 0.68 : 0.52) * H;
    for (const sx of [-1, 1]) {
      const sh = new V3(sx * 0.12 * H, 0.79 * H, -0.01 * H), el = new V3(sx * 0.13 * H, 0.62 * H, 0.04 * H), wr = new V3(sx * 0.025 * H, hy2, 0.1 * H);
      P.add(key, tube([sh, el, wr], 0.032 * H, { radial: 10, seg: 10 }));
      P.add(key, lathe([[0.03 * H, 0], [0.045 * H, 0.06 * H], [0.06 * H, 0.1 * H], [0.058 * H, 0.105 * H]], 14), M(wr.x * 0.9, wr.y - 0.09 * H, wr.z - 0.01 * H, -0.3, 0, -sx * 0.25)); // 寬袖口
    }
    P.merge(handP(false), M(0, hy2 - 0.02 * H, 0.105 * H, -0.35, 0, 0, s * 1.05));
  } else { // 聖心:右手(-X)舉到胸前指著心,左手(+X)向外攤開
    const shR = new V3(-0.12 * H, 0.79 * H, -0.01 * H), elR = new V3(-0.15 * H, 0.63 * H, 0.06 * H), wrR = new V3(-0.05 * H, 0.7 * H, 0.12 * H);
    P.add(key, tube([shR, elR, wrR], 0.032 * H, { radial: 10, seg: 10 }));
    P.merge(handP(false), M(wrR.x, wrR.y, wrR.z, -0.2, 0.5, 1.2, s));
    const shL = new V3(0.12 * H, 0.79 * H, -0.01 * H), elL = new V3(0.2 * H, 0.64 * H, 0.03 * H), wrL = new V3(0.29 * H, 0.56 * H, 0.08 * H);
    P.add(key, tube([shL, elL, wrL], 0.032 * H, { radial: 10, seg: 10 }));
    P.add(key, lathe([[0.03 * H, 0], [0.05 * H, 0.06 * H], [0.065 * H, 0.1 * H]], 14), M(wrL.x - 0.03 * H, wrL.y + 0.02 * H, wrL.z, 0, 0, 1.0));
    P.merge(handP(true), M(wrL.x + 0.02 * H, wrL.y - 0.01 * H, wrL.z + 0.01 * H, 0.2, -0.4, -0.6, s));
    // 胸前的聖心(紅心 + 金色光芒 + 荊棘冠)
    const heartShape = [[0, -0.05], [0.04, -0.01], [0.045, 0.02], [0.03, 0.04], [0.012, 0.038], [0, 0.025], [-0.012, 0.038], [-0.03, 0.04], [-0.045, 0.02], [-0.04, -0.01]].map(([x, y]) => [x * H, y * H]);
    P.add('plastic_red', extrude(heartShape, 0.02 * H, { bevel: 0.004 * H, seg: 2 }), M(0.0, 0.73 * H, 0.098 * H));
    P.add('rubber', tor(0.022 * H, 0.004 * H, 5, 16), M(0, 0.735 * H, 0.11 * H));
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; P.add('bronze', box(0.004 * H, 0.04 * H, 0.004 * H), M(Math.sin(a) * 0.05 * H, 0.735 * H + Math.cos(a) * 0.05 * H, 0.1 * H, 0, 0, -a)); }
    P.add('bronze', cyl(0.004 * H, 0.012 * H, 0.04 * H, 8), M(0, 0.79 * H, 0.105 * H));
  }
  // 斗篷 / 頭紗:包住頭頂與背後,前方開口
  if (veil) {
    const mantleRing = (y) => {
      const t = y / H;
      if (t > 0.86) { const k = (t - 0.86) / 0.13; return { rx: lerp(0.075, 0.0, sstep(0.3, 1, k)) * H + 0.06 * H * (1 - k) * 0, rz: lerp(0.08, 0.0, sstep(0.35, 1, k)) * H, cz: -0.005 * H }; }
      const r = robeRing(Math.min(y, 0.84 * H));
      const sh = sstep(0.7, 0.84, t);
      return { rx: r.rx * (1 + 0.12) + 0.015 * H + sh * 0.025 * H, rz: r.rz * 1.15 + 0.02 * H, cz: r.cz - 0.01 * H };
    };
    const openA = (y) => { const t = y / H; return t > 0.95 ? 0.0001 : t > 0.86 ? lerp(0.62, 0.3, (t - 0.86) / 0.09) : t > 0.6 ? lerp(1.15, 0.62, (t - 0.6) / 0.26) : lerp(1.05, 1.15, t / 0.6); };
    const mfold = (y, th) => 1 + (1 - sstep(0.75, 0.9, y / H)) * 0.05 * Math.sin(th * 5 + ph(3) * 4 + y * 3) + 0.02 * Math.sin(th * 11);
    const ysM = [];
    for (let i = 0; i <= 26; i++) ysM.push(lerp(0.08 * H, 0.985 * H, i / 26));
    P.add(key, loft(ysM, mantleRing, { n: 40, fold: mfold, open: openA }));
    P.add(key, loft(ysM, mantleRing, { n: 40, fold: mfold, open: openA, inset: 0.008 * H, flip: true }));
  }
  return P;
}

// ---------- 布(蓋臉的白布):以球面 + 下垂的高度場近似 ----------
export function clothOverHead(cx, cy, cz, r, drop, seed = 3) {
  const rows = [], n = 36, m = 18;
  for (let j = 0; j <= m; j++) {
    const row = [], v = j / m; // v:0 = 頭頂, 1 = 下襬
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * TAU;
      let x, y, z;
      if (v < 0.45) { const phi = (v / 0.45) * HALF * 1.05; x = Math.sin(phi) * Math.sin(th) * r * 1.08; z = Math.sin(phi) * Math.cos(th) * r * 1.12; y = Math.cos(phi) * r * 1.05; }
      else { const k = (v - 0.45) / 0.55; const neck = 1 - 0.38 * Math.exp(-(((k - 0.32) / 0.12) ** 2)); const rr = r * (1.12 + k * 1.1) * neck * (1 + (0.16 * Math.sin(th * 7 + seed) + 0.08 * Math.sin(th * 13 + seed * 2)) * k); x = Math.sin(th) * rr; z = Math.cos(th) * rr * 1.04; y = -k * drop + 0.05 * k * Math.sin(th * 3 + seed) - 0.03 * k * Math.abs(Math.sin(th * 2)); }
      row.push(new V3(cx + x, cy + y, cz + z));
    }
    rows.push(row);
  }
  return smoothNormals(gridSurface(rows, { flip: true }), 0.3);
}

// ---------- 天使雕像(墓園):長袍人形 + 雙翼 ----------
function wing(H, side) {
  const pts = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([t * 0.42 * H, (0.32 - 0.95 * t * t) * H * 0.5 + 0.1 * H * Math.sin(t * Math.PI)]); }
  for (let k = 9; k >= 0; k--) { const t = k / 10; pts.push([t * 0.42 * H, (0.04 - 0.55 * t) * H * 0.5 + 0.02 * H * Math.sin(t * 20)]); } // 羽毛鋸齒
  const g = extrude(pts.map(([x, y]) => [x, y]), 0.03 * H, { bevel: 0.006 * H, seg: 1 });
  if (side < 0) g.scale(-1, 1, 1);
  return g;
}
export function angel(H, key = 'stone_statue', seed = 2) {
  const P = robedFigure(H, { pose: 'angel', key, veil: false, seed });
  for (const s of [-1, 1]) P.add(key, wing(H, s), M(s * 0.08 * H, 0.78 * H, -0.09 * H, 0.15, s * -0.5, s * 0.15));
  // 頭髮(短捲髮帽)
  P.add(key, new THREE.SphereGeometry(0.06 * H, 14, 10, 0, TAU, 0, Math.PI * 0.55).scale(1, 1.05, 1.05), M(0, 0.925 * H, 0.0, 0.38, 0, 0));
  return P;
}

// ---------- 底座 ----------
export function plinth(P, w, h, key = 'stone_statue', cap = 0.06) {
  P.add(key, box(w + 0.16, 0.14, w + 0.16), M(0, 0.07, 0));
  P.add(key, box(w, h - 0.14 - cap, w), M(0, 0.14 + (h - 0.14 - cap) / 2, 0));
  P.add(key, box(w + 0.1, cap, w + 0.1), M(0, h - cap / 2, 0));
}

const show = (ctx, P, x, y, z) => { const g = P.group(); g.position.set(x, y, z); ctx.add(g, { static: true }); };
export const GALLERY = {
  mary: (ctx, o) => { const P = robedFigure(1.6, { pose: 'pray' }); show(ctx, P, o.x, 0, o.z); return 1.2; },
  jesus: (ctx, o) => { const P = robedFigure(1.9, { pose: 'heart', veil: false, key: 'marble' }); P.add('fabric_white', clothOverHead(0, 1.9 * 0.915, 0.012, 0.072, 0.2)); show(ctx, P, o.x, 0, o.z); return 1.4; },
  angel: (ctx, o) => { show(ctx, angel(1.5), o.x, 0, o.z); return 1.1; },
};
