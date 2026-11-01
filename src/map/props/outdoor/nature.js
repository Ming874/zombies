import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { makeWet } from '../../weather.js';
import { Parts, M, sph, cyl, keepUV, pool, animPool, solid, V3, HALF, TAU, lerp, clamp, hash } from './kit.js';
import { canvas, tex, lazy, rr, R } from './mats.js';
import { ENV, windify } from './env.js';
import { sfx } from '../../../audio.js';

// 植物與動物:枯樹(程式分枝,實例化,頂點著色器隨風擺動)、灌木枯枝、草叢/雜草卡片(隨風擺)、牆面枯藤、
// 停在高處的烏鴉(待機動作;玩家靠近時飛走,過一陣子再回來)。

// ---------- 貼圖 ----------
// 草葉卡片圖集(512×256):左半偏綠、右半枯黃;下緣 = 根部
const GRASS_TEX = lazy(() => {
  const [c, ctx] = canvas(512, 256);
  for (let half = 0; half < 2; half++) {
    const ox = half * 256;
    ctx.save(); ctx.beginPath(); ctx.rect(ox, 0, 256, 256); ctx.clip();
    for (let k = 0; k < 120; k++) {
      const x = ox + rr(8, 248), h = rr(70, 250), lean = rr(-46, 46), w = rr(1.6, 4.2);
      const t = R();
      const col = half === 0
        ? (t < 0.5 ? [rr(52, 80), rr(70, 98), rr(32, 46)] : t < 0.8 ? [rr(84, 110), rr(92, 112), rr(44, 60)] : [rr(110, 140), rr(100, 120), rr(60, 76)])
        : (t < 0.55 ? [rr(120, 160), rr(104, 132), rr(62, 82)] : t < 0.85 ? [rr(92, 118), rr(84, 104), rr(52, 66)] : [rr(60, 80), rr(56, 70), rr(40, 50)]);
      const g = ctx.createLinearGradient(0, 256, 0, 256 - h);
      g.addColorStop(0, `rgb(${(col[0] * 0.45) | 0},${(col[1] * 0.45) | 0},${(col[2] * 0.45) | 0})`);
      g.addColorStop(1, `rgb(${col.map((v) => v | 0).join(',')})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w, 256); ctx.quadraticCurveTo(x + lean * 0.25, 256 - h * 0.6, x + lean, 256 - h); ctx.quadraticCurveTo(x + lean * 0.25 + w * 0.4, 256 - h * 0.6, x + w, 256); ctx.fill();
      if (half === 1 && R() < 0.12) { ctx.fillStyle = `rgba(${(col[0] * 0.9) | 0},${(col[1] * 0.8) | 0},${(col[2] * 0.6) | 0},1)`; ctx.beginPath(); ctx.ellipse(x + lean, 256 - h, 3, 9, lean * 0.01, 0, TAU); ctx.fill(); } // 穗
    }
    ctx.restore();
  }
  return tex(c, { repeat: false });
});
// 枯藤(爬牆植物):256×512,垂直主莖 + 分枝 + 乾枯小葉
const IVY_TEX = lazy(() => {
  const [c, ctx] = canvas(256, 512);
  const vine = (x, y, a, len, w, d) => {
    ctx.strokeStyle = `rgb(${rr(40, 60) | 0},${rr(32, 44) | 0},${rr(22, 30) | 0})`; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < len; s += 6) {
      a += rr(-0.35, 0.35);
      x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      ctx.lineTo(x, y);
      if (R() < 0.5) { // 葉
        const lx = x + rr(-10, 10), ly = y + rr(-8, 8), s2 = rr(4, 9), dead = R() < 0.55;
        ctx.fillStyle = dead ? `rgb(${rr(70, 110) | 0},${rr(50, 72) | 0},${rr(26, 36) | 0})` : `rgb(${rr(34, 52) | 0},${rr(50, 70) | 0},${rr(26, 34) | 0})`;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(rr(0, TAU)); ctx.beginPath(); ctx.moveTo(0, -s2); ctx.lineTo(s2 * 0.8, 0); ctx.lineTo(0, s2 * 0.7); ctx.lineTo(-s2 * 0.8, 0); ctx.fill(); ctx.restore();
      }
      if (d < 3 && R() < 0.06) { vine(x, y, a + rr(-1.2, 1.2), len * 0.4, w * 0.6, d + 1); ctx.beginPath(); ctx.moveTo(x, y); }
    }
    ctx.stroke();
  };
  for (let k = 0; k < 7; k++) vine(rr(40, 216), 512, -HALF + rr(-0.3, 0.3), rr(300, 520), rr(2.5, 4.5), 0);
  return tex(c, { repeat: false });
});

let inited = false;
export function initNature() {
  if (inited) return;
  inited = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // 樹皮(隨風擺動;tree 模式用本地高度當權重 → 只用在實例池)
  const bark = mat('po_bark');
  registerMat('po_bark_wind', makeWet(windify(bark.clone(), { mode: 'tree', amp: 0.16, h: 5.5 }), { darken: 0.35, gloss: 0.5 }));
  registerMat('po_twig_wind', makeWet(windify(std({ color: 0x3a3028, roughness: 1 }), { mode: 'tree', amp: 0.22, h: 2.2 }), { darken: 0.3, gloss: 0.4 }));
  registerMat('po_grass_wind', windify(std({ map: GRASS_TEX(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1 }), { mode: 'grass', amp: 0.14 }));
  registerMat('po_leafcard_wind', windify(std({ map: mat('po_leaf_card').map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }), { mode: 'tree', amp: 0.28, h: 5 }));
  registerMat('po_twigcard_wind', windify(std({ map: TWIG_TEX(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, color: 0x8a8070 }), { mode: 'tree', amp: 0.22, h: 5.5 }));
  registerMat('po_ivy', std({ map: IVY_TEX(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  registerMat('po_crow', std({ color: 0x0b0b0d, roughness: 0.35, metalness: 0.15 }));
  registerMat('po_crow_beak', std({ color: 0x18161a, roughness: 0.5 }));
  registerMat('po_crow_eye', std({ color: 0x050505, roughness: 0.1, emissive: 0x110800, emissiveIntensity: 1 }));
}

// ======================================================================
// 枯樹
// ======================================================================
// 開口圓柱(樹枝段):a→b,半徑 r0→r1
function limb(a, b, r0, r1, seg = 7) {
  const d = new V3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len * 1.04, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// 細枝卡片(256×256 透明:分岔的黑色細枝,樹梢用)
const TWIG_TEX = lazy(() => {
  const [c, ctx] = canvas(256, 256);
  ctx.lineCap = 'round';
  const br = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.strokeStyle = `rgb(${(28 + d * 6) | 0},${(24 + d * 5) | 0},${(20 + d * 4) | 0})`; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + x2) / 2 + rr(-6, 6), (y + y2) / 2 + rr(-6, 6), x2, y2); ctx.stroke();
    if (d < 5 && len > 6) for (let k = 0; k < 2 + (R() < 0.4 ? 1 : 0); k++) br(x2, y2, a + rr(-0.75, 0.75), len * rr(0.55, 0.78), w * 0.68, d + 1);
  };
  for (let k = 0; k < 3; k++) br(128 + rr(-20, 20), 256, -HALF + rr(-0.35, 0.35), rr(60, 90), 4.5, 0);
  return tex(c, { repeat: false });
});
// kind:'oak' 寬展 / 'poplar' 高瘦(中央主幹)/ 'gnarl' 墓園老樹(粗矮扭曲)/ 'snag' 斷頭枯樹 / 'sapling' 細苗(含支柱)
function treeParts(kind, seed) {
  const P = new Parts();
  let sd = seed * 9301 + 49297;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const rng = (a, b) => a + rnd() * (b - a);
  const cfg = {
    oak: { h: 2.4, r: 0.22, limbs: [3, 4], ang: [0.55, 0.95], depth: 3, kLen: 0.72, kR: 0.62, up: 0.12, wob: 0.06, len0: 2.4, twig: 1.2 },
    poplar: { h: 5.6, r: 0.17, limbs: [5, 7], ang: [0.35, 0.6], depth: 2, kLen: 0.6, kR: 0.5, up: 0.3, wob: 0.04, len0: 1.6, twig: 0.9, excurrent: true },
    gnarl: { h: 1.7, r: 0.38, limbs: [3, 4], ang: [0.8, 1.25], depth: 3, kLen: 0.78, kR: 0.6, up: -0.05, wob: 0.16, len0: 2.6, twig: 1.3 },
    snag: { h: 3.4, r: 0.24, limbs: [2, 2], ang: [0.6, 1.0], depth: 1, kLen: 0.55, kR: 0.5, up: 0.05, wob: 0.08, len0: 1.2, twig: 0.7, broken: true },
    sapling: { h: 1.4, r: 0.05, limbs: [3, 4], ang: [0.4, 0.8], depth: 2, kLen: 0.65, kR: 0.6, up: 0.3, wob: 0.05, len0: 0.9, twig: 0.7 },
  }[kind];
  const up = new V3(0, 1, 0), tmp = new V3();
  // 一段會彎的枝幹:回傳末端點/方向/半徑
  const grow = (a, dir, len, r0, r1, wob, upK) => {
    const segs = Math.max(2, Math.round(len / 0.45));
    let p = a.clone(); const d = dir.clone();
    for (let i = 0; i < segs; i++) {
      d.x += rng(-wob, wob); d.z += rng(-wob, wob); d.y += upK; d.normalize();
      const q = p.clone().addScaledVector(d, len / segs);
      const ra = lerp(r0, r1, i / segs), rb = lerp(r0, r1, (i + 1) / segs);
      P.add(ra > 0.025 ? 'po_bark_wind' : 'po_twig_wind', limb(p, q, ra, rb, ra > 0.1 ? 10 : ra > 0.04 ? 7 : 4));
      p = q;
    }
    return { p, d, r: r1 };
  };
  const twigCard = (p, d, s) => { // 兩片交叉的細枝卡片
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(s, s).translate(0, s / 2, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, tmp.copy(d).lerp(up, 0.35).normalize());
      const m = new THREE.Matrix4().compose(p, q.multiply(new THREE.Quaternion().setFromAxisAngle(up, k * HALF + rnd())), new V3(1, 1, 1));
      P.add('po_twigcard_wind', g, m);
    }
  };
  const branch = (a, dir, len, r, depth) => {
    const e = grow(a, dir, len, r, r * 0.72, cfg.wob, cfg.up * 0.25);
    if (depth <= 0) { twigCard(e.p, e.d, cfg.twig * rng(0.8, 1.2)); return; }
    const n = Math.round(rng(2, 3.4)), base = rnd() * TAU;
    for (let k = 0; k < n; k++) {
      const az = base + (k / n) * TAU + rng(-0.4, 0.4), tilt = rng(0.35, 0.75);
      const side = new V3(Math.cos(az), 0, Math.sin(az));
      const nd = e.d.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)).normalize();
      branch(e.p, nd, len * cfg.kLen * rng(0.8, 1.1), e.r * cfg.kR * rng(0.85, 1.05), depth - 1);
    }
    if (rnd() < 0.5) twigCard(e.p, e.d, cfg.twig * 0.7);
  };
  // 樹根隆起
  const r0 = cfg.r;
  if (kind !== 'sapling') for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + rng(-0.3, 0.3); P.add('po_bark_wind', limb(new V3(0, 0.3, 0), new V3(Math.cos(a) * r0 * 2.6, -0.04, Math.sin(a) * r0 * 2.6), r0 * 0.5, r0 * 0.1, 6)); }
  // 主幹
  const t = grow(new V3(0, -0.05, 0), new V3(rng(-0.06, 0.06), 1, rng(-0.06, 0.06)).normalize(), cfg.h, r0, r0 * (cfg.excurrent ? 0.55 : 0.78), cfg.wob * 0.5, 0.02);
  if (cfg.broken) { P.add('wood_old', cyl(t.r * 0.9, t.r, 0.08, 8), M(t.p.x, t.p.y, t.p.z, 0.35, 0, 0.25)); P.add('wood_old', new THREE.ConeGeometry(t.r * 0.8, 0.35, 6), M(t.p.x + 0.04, t.p.y + 0.1, t.p.z, 0.2, 0, 0.5)); }
  if (cfg.excurrent) { // 白楊:主幹繼續往上,沿途長出短側枝
    const top = grow(t.p, t.d, cfg.h * 0.45, t.r, 0.02, cfg.wob * 0.4, 0.02);
    twigCard(top.p, top.d, cfg.twig);
    for (let k = 0; k < 9; k++) {
      const f = 0.25 + k * 0.085, p = new V3(0, cfg.h * f + cfg.h * 0.45 * f * 0.3, 0), az = k * 2.4;
      branch(p, new V3(Math.cos(az) * 0.8, 1.1, Math.sin(az) * 0.8).normalize(), cfg.len0 * (1 - f * 0.5), cfg.r * 0.32 * (1 - f * 0.4), cfg.depth - 1);
    }
  }
  const nL = Math.round(rng(cfg.limbs[0], cfg.limbs[1] + 0.99)), base = rnd() * TAU;
  if (!cfg.excurrent) for (let k = 0; k < nL; k++) {
    const az = base + (k / nL) * TAU + rng(-0.3, 0.3), tilt = rng(cfg.ang[0], cfg.ang[1]);
    const nd = new V3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    branch(t.p, nd, cfg.len0 * rng(0.85, 1.15), t.r * rng(0.55, 0.75), cfg.depth - (cfg.broken ? 0 : 1));
  }
  if (kind === 'sapling') { // 支柱 + 綁帶
    P.add('wood_old', cyl(0.025, 0.025, 1.7, 6), M(0.12, 0.85, 0, 0, 0, -0.05));
    P.add('rubber', new THREE.TorusGeometry(0.06, 0.01, 4, 10).rotateX(HALF), M(0.06, 1.1, 0));
  }
  // 少數殘存的枯葉簇
  if (kind === 'oak' || kind === 'gnarl') for (let k = 0; k < 4; k++) {
    const y = cfg.h + rng(0.6, 1.8), a = rng(0, TAU), d = rng(0.6, 1.8);
    P.add('po_leafcard_wind', new THREE.PlaneGeometry(0.6, 0.6), M(Math.cos(a) * d, y, Math.sin(a) * d, rng(-1, 1), rng(0, TAU), rng(-1, 1)));
  }
  return P;
}
const TREE_VAR = { oak: 3, poplar: 1, gnarl: 2, snag: 1, sapling: 1 };
export function tree(ctx, kind, x, y, z, s = 1, yaw = 0, collide = true) {
  const v = Math.floor(hash(x * 3.1 + z * 7.7) * TREE_VAR[kind]);
  const p = pool(ctx, `tree_${kind}_${v}`, () => treeParts(kind, v * 17 + kind.length), 16);
  p.add(M(x, y, z, 0, yaw, 0, s));
  if (collide && kind !== 'sapling') { const r = { oak: 0.42, poplar: 0.32, gnarl: 0.6, snag: 0.4 }[kind] * s; solid(ctx, x, y, z, r, 3, r, 'log'); }
}

// ======================================================================
// 草叢 / 雜草 / 灌木
// ======================================================================
// 草叢:3 片交叉卡片;dry = 用枯黃半邊
function tuftParts(dry, tall) {
  const P = new Parts();
  for (let k = 0; k < 3; k++) {
    const w = tall ? 0.55 : 0.5, h = tall ? 0.85 : 0.42;
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setX(i, (dry ? 0.5 : 0) + a.getX(i) * 0.5);
    P.add('po_grass_wind', keepUV(g), M(0, 0, 0, 0, (k / 3) * Math.PI + 0.3, 0));
  }
  return P;
}
export function tuft(ctx, x, y, z, { dry = false, tall = false, s = 1 } = {}) {
  const key = `tuft_${dry ? 1 : 0}${tall ? 1 : 0}`;
  const p = pool(ctx, key, () => tuftParts(dry, tall), 256);
  p.add(M(x, y, z, 0, hash(x * 13.1 + z * 3.7) * TAU, 0, s, s * (0.8 + hash(x + z * 9.1) * 0.5), s));
}
// 沿線段撒草(牆腳、圍籬下、裂縫)
export function tuftLine(ctx, rng, x0, z0, x1, z1, y, n, opt = {}) {
  for (let k = 0; k < n; k++) {
    const t = rng(), j = (rng() - 0.5) * (opt.jitter ?? 0.3);
    const L = Math.hypot(x1 - x0, z1 - z0) || 1;
    tuft(ctx, lerp(x0, x1, t) - (z1 - z0) / L * j, y, lerp(z0, z1, t) + (x1 - x0) / L * j, { dry: rng() < (opt.dryP ?? 0.6), tall: rng() < (opt.tallP ?? 0.2), s: rng.range(0.7, 1.25) * (opt.s ?? 1) });
  }
}
export function tuftPatch(ctx, rng, x, z, y, r, n, opt = {}) {
  for (let k = 0; k < n; k++) { const a = rng() * TAU, d = Math.sqrt(rng()) * r; tuft(ctx, x + Math.cos(a) * d, y, z + Math.sin(a) * d, { dry: rng() < (opt.dryP ?? 0.5), tall: rng() < (opt.tallP ?? 0.25), s: rng.range(0.7, 1.3) * (opt.s ?? 1) }); }
}
// 枯灌木(細枝叢)
function shrubParts(seed) {
  const P = new Parts();
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 16; k++) {
    const a = rnd() * TAU, tl = 0.3 + rnd() * 0.9;
    const base = new V3(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
    const d = new V3(Math.cos(a) * tl, 0.5 + rnd() * 0.8, Math.sin(a) * tl).normalize();
    const len = 0.5 + rnd() * 0.7;
    const mid = base.clone().addScaledVector(d, len * 0.55);
    P.add('po_twig_wind', limb(base, mid, 0.018, 0.011, 4));
    for (let j = 0; j < 3; j++) { const d2 = d.clone().add(new V3(rnd() - 0.5, rnd() * 0.4, rnd() - 0.5)).normalize(); P.add('po_twig_wind', limb(mid, mid.clone().addScaledVector(d2, len * 0.5), 0.01, 0.004, 3)); }
  }
  for (let k = 0; k < 3; k++) { const a = rnd() * TAU; P.add('po_leafcard_wind', new THREE.PlaneGeometry(0.5, 0.5), M(Math.cos(a) * 0.3, 0.5 + rnd() * 0.4, Math.sin(a) * 0.3, rnd() * 2, rnd() * 3, rnd())); }
  return P;
}
export function shrub(ctx, x, y, z, s = 1) {
  const v = Math.floor(hash(x * 1.7 + z * 2.3) * 3);
  pool(ctx, `shrub_${v}`, () => shrubParts(101 + v * 37), 64).add(M(x, y, z, 0, hash(x + z) * TAU, 0, s));
}
// 牆面枯藤:貼在牆面(x,z 為牆面上的點,yaw 讓 +Z 朝外),寬 w、高 h
export function ivy(P, x, y, z, yaw, w, h, flip = false) {
  const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0.03);
  if (flip) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setX(i, 1 - a.getX(i)); }
  P.add('po_ivy', keepUV(g), M(x, y, z, 0, yaw, 0));
}

// ======================================================================
// 烏鴉
// ======================================================================
function crowBody(folded = true) {
  const P = new Parts();
  P.add('po_crow', sph(0.09, 12, 8).scale(1.75, 0.95, 1), M(0, 0.12, 0, 0, 0, 0.12));
  P.add('po_crow', sph(0.055, 10, 8), M(0.15, 0.2, 0));
  P.add('po_crow_beak', new THREE.ConeGeometry(0.022, 0.08, 6).rotateZ(-HALF), M(0.225, 0.192, 0));
  for (const s of [-1, 1]) P.add('po_crow_eye', sph(0.009, 6, 4), M(0.185, 0.215, s * 0.03));
  P.add('po_crow', new THREE.ConeGeometry(0.05, 0.16, 4).rotateZ(HALF).scale(1, 0.35, 1), M(-0.2, 0.1, 0, 0, 0, -0.25)); // 尾
  if (folded) for (const s of [-1, 1]) P.add('po_crow', sph(0.07, 8, 6).scale(1.9, 0.6, 0.4), M(-0.02, 0.14, s * 0.075, 0, 0, 0.15));
  for (const s of [-1, 1]) { P.add('po_crow_beak', cyl(0.006, 0.006, 0.07, 4), M(0.02, 0.035, s * 0.03)); P.add('po_crow_beak', new THREE.BoxGeometry(0.05, 0.006, 0.012), M(0.04, 0.003, s * 0.03)); }
  return P;
}
function crowWings() {
  const P = new Parts();
  for (const s of [-1, 1]) { // 張開的翅膀(淺 V 形,外側羽尖)
    const g = new THREE.PlaneGeometry(0.22, 0.38).rotateX(HALF);
    P.add('po_crow', g, M(-0.01, 0.05, s * 0.2, s * 0.25, 0, 0));
    P.add('po_crow', new THREE.PlaneGeometry(0.16, 0.12).rotateX(HALF), M(-0.06, 0.1, s * 0.42, s * 0.4, 0, 0));
  }
  return P;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3();
// x,y,z = 腳底;yaw = 面向(本地 +X 為頭)
export function crow(ctx, x, y, z, yaw = 0) {
  const st = { mode: 0, t0: 0, gone: 0, dir: 0, ph: hash(x * 7 + z) * 10 };
  const sit = animPool(ctx, 'crow_sit', () => crowBody(true), 24);
  const fly = animPool(ctx, 'crow_fly', () => crowBody(false), 24);
  const wing = animPool(ctx, 'crow_wing', () => crowWings(), 24);
  for (const pl of [sit, fly, wing]) for (const im of pl.meshes) im.castShadow = false;
  const base = M(x, y, z, 0, yaw, 0);
  // 狀態機在 sit 的回呼裡跑(每幀一次),fly/wing 只讀狀態
  sit.add(base, (t, m) => {
    const dx = ENV.px - x, dz = ENV.pz - z, d2 = dx * dx + dz * dz, near = d2 < 42 && Math.abs(ENV.py - y) < 5;
    if (st.mode === 0 && near) {
      st.mode = 1; st.t0 = t; st.dir = Math.atan2(dz, -dx) + (hash(t) - 0.5) * 1.2;
      try { (sfx.crow || sfx.flap)?.({ x, y: y + 0.3, z }); } catch { /* 無 */ }
    } else if (st.mode === 1 && t - st.t0 > 4.5) { st.mode = 2; st.gone = t + 25 + hash(t * 3) * 40; }
    else if (st.mode === 2 && t > st.gone && d2 > 200) st.mode = 0;
    if (st.mode !== 0) { m.makeScale(0, 0, 0); return; }
    // 待機:轉頭(整隻小幅轉向)、偶爾低頭啄、抖一下
    const k = t * 0.6 + st.ph;
    const turn = Math.sin(k) * 0.5 + (Math.sin(k * 3.1) > 0.97 ? 0.6 : 0);
    const peck = Math.max(0, Math.sin(t * 2.3 + st.ph * 3)) ** 12 * 0.5;
    _e.set(0, turn, -peck, 'YXZ');
    m.compose(_p.set(0, 0, 0), _q.setFromEuler(_e), _s.set(1, 1 + Math.sin(t * 9 + st.ph) * 0.01, 1));
  });
  const flight = (t, m, wings) => {
    if (st.mode !== 1) { m.makeScale(0, 0, 0); return; }
    const a = t - st.t0, c = Math.cos(st.dir - yaw), s = Math.sin(st.dir - yaw), sp = 4.5 * a + 1.2 * a * a;
    _p.set(c * sp, 0.6 * a + 1.1 * a * a * 0.5 + Math.min(a * 3, 0.6) + (wings ? 0.14 : 0), -s * sp);
    const flap = wings ? Math.sin(t * 22) : 0;
    _e.set(0, Math.atan2(s, c), 0.35 - Math.min(0.3, a * 0.2), 'YXZ');
    _q.setFromEuler(_e);
    m.compose(_p, _q, _s.set(1, wings ? flap : 1, 1));
  };
  fly.add(base, (t, m) => flight(t, m, false));
  wing.add(base, (t, m) => flight(t, m, true));
}
