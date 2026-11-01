import * as THREE from 'three';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, tube, extrude, keepUV, pool, put, solid, animPool, V3, HALF, TAU, lerp, clamp, hash } from './kit.js';
import { decalUV } from './mats.js';
import { labelQuad } from './cars.js';
import { flatDecal } from './industrial.js';
import { robedFigure, clothOverHead, angel, plinth } from './figures.js';
import { bindModel } from './gltf.js';

// 宗教與紀念類:中庭乾涸噴水池 + 聖母像、廣場聖心耶穌像(臉被白布蓋住)、墓園墓碑/十字架/天使像/空墓穴/蠟燭。

// 地面貼花(世界座標由呼叫者以 put 放置)
function gDecal(P, name, x, z, sx, sz, rot = 0, y = 0.006) {
  const [u, v, w, h] = decalUV(name);
  const g = new THREE.PlaneGeometry(sx, sz).rotateX(-HALF);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * w, v + uv.getY(i) * h);
  g.rotateY(rot).translate(x, y, z);
  P.add('po_decal', keepUV(g));
}
// 落葉片(alphaTest 卡片):平躺在地面/池底
function leafCards(P, cx, cz, r, n, rng, y = 0.012) {
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r, s = rng.range(0.35, 0.7);
    P.add('po_leaf_card', new THREE.PlaneGeometry(s, s).rotateX(-HALF), M(cx + Math.cos(a) * d, y + k * 0.0015, cz + Math.sin(a) * d, rng.range(-0.08, 0.08), rng() * TAU, rng.range(-0.08, 0.08)));
  }
}

// ---------- 乾涸噴水池 + 聖母像 ----------
export function fountain(ctx, o, zone) {
  const rng = ctx.rng, P = new Parts();
  const R1 = 1.86, R0 = 1.58, Hw = 0.5;
  // 池壁(含頂部圓角壓頂)與池底
  P.add('stone_statue', lathe([[R0, 0.06], [R0, Hw - 0.06], [R0 - 0.03, Hw - 0.02], [R0 + 0.02, Hw + 0.03], [R1 + 0.04, Hw + 0.03], [R1 + 0.06, Hw - 0.03], [R1, Hw - 0.06], [R1, 0.0]], 64));
  P.add('concrete', cyl(R0, R0, 0.08, 48), M(0, 0.04, 0));
  P.add('stone_statue', lathe([[R1 + 0.12, 0], [R1 + 0.12, 0.06], [R1, 0.08]], 64));
  // 中央台座(線腳)與上層小水盤
  P.add('stone_statue', lathe([[0, 0.66], [0.82, 0.66], [0.84, 0.6], [0.72, 0.56], [0.55, 0.48], [0.5, 0.2], [0.62, 0.16], [0.68, 0.08], [0.68, 0.08]].reverse(), 40));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; P.add('bronze', rod(new V3(Math.cos(a) * 0.62, 0.56, Math.sin(a) * 0.62), new V3(Math.cos(a) * 0.86, 0.46, Math.sin(a) * 0.86), 0.022, 8)); P.add('bronze', tor(0.024, 0.008, 5, 10), M(Math.cos(a) * 0.86, 0.46, Math.sin(a) * 0.86, 0, -a, HALF)); }
  // 青苔、裂縫、水痕、池底落葉與一灘積水
  for (let k = 0; k < 10; k++) { const a = rng() * TAU; gDecal(P, rng() < 0.6 ? 'moss' : 'crack', Math.cos(a) * (R0 + R1) / 2, Math.sin(a) * (R0 + R1) / 2, 0.6, 0.45, a, Hw + 0.035); }
  for (let k = 0; k < 6; k++) { const a = rng() * TAU; gDecal(P, rng() < 0.5 ? 'leaves' : 'stain2', Math.cos(a) * 1.05, Math.sin(a) * 1.05, 1.1, 1.1, rng() * TAU, 0.085); }
  leafCards(P, 0, 0, R0 - 0.15, 26, rng, 0.088);
  P.add('po_puddle', new THREE.CircleGeometry(0.55, 24).rotateX(-HALF), M(0.75, 0.083, -0.6, 0, 0, 0, 1.4, 1, 0.8));
  gDecal(P, 'moss', 0, 0, 1.5, 1.5, 0, 0.665);
  put(ctx, P, o.x, o.y, o.z, 0);
  // 聖母像:載入 Poly Haven 寫實雕像(戴冠長袍坐像),失敗時用程式生成的祈禱聖母
  const st = pool(ctx, 'fountain_statue', () => { const F = robedFigure(1.55, { pose: 'pray', key: 'marble', seed: 5 }); return F; }, 2);
  bindModel(st, 'gothic', [], { origin: 'base' });
  st.add(M(o.x, o.y + 0.66, o.z, 0, o.yaw ?? 0, 0));
  solid(ctx, o.x, o.y, o.z, (R1 + 0.12) * 2 * 0.92, Hw + 0.05, (R1 + 0.12) * 2 * 0.92, 'stone');
  solid(ctx, o.x, o.y, o.z, 1.5, 2.6, 1.5, 'stone');
  ctx.event({ kind: 'statue_mary', x: o.x, y: o.y + 1.6, z: o.z, zone: zone?.id });
}

// ---------- 聖心耶穌像(石基座刻字;臉被白布蓋住)----------
export function sacredHeart(ctx, o, zone) {
  const rng = ctx.rng, P = new Parts();
  // 兩階石台 + 基座 + 銅牌
  P.add('po_granite', box(3.3, 0.16, 3.3), M(0, 0.08, 0));
  P.add('po_granite', box(2.6, 0.16, 2.6), M(0, 0.24, 0));
  const B = new Parts();
  plinth(B, 1.2, 1.6, 'stone_statue', 0.1);
  P.merge(B, M(0, 0.32, 0));
  P.add('stone_statue', box(1.0, 0.12, 1.0), M(0, 0.32 + 1.66, 0));
  P.add('po_label', labelQuad('plaque', 0.8, 0.4), M(0, 1.15, 0.6 + 0.004));
  P.add('bronze', box(0.84, 0.44, 0.02), M(0, 1.15, 0.595));
  // 聖像(白布蓋臉,脖子繫繩)
  const H = 2.05, fy = 2.04;
  const F = robedFigure(H, { pose: 'heart', veil: false, key: 'marble', seed: 9 });
  P.merge(F, M(0, fy, 0));
  P.add('fabric_white', clothOverHead(0, fy + H * 0.915, 0.012, 0.074, 0.3, 4));
  P.add('wood_old', tor(0.062, 0.007, 5, 20).rotateX(HALF), M(0, fy + H * 0.86, 0.008)); // 繩子
  P.add('wood_old', rod(new V3(0.03, fy + H * 0.86, 0.07), new V3(0.05, fy + H * 0.8, 0.09), 0.006, 4));
  // 苔痕、雨痕
  for (let k = 0; k < 4; k++) flatDecal(P, rng() < 0.5 ? 'moss' : 'stain2', rng.range(-0.5, 0.5), rng.range(0.6, 1.7), 0.6 + 0.003, 0.5, 0.6, 'z+');
  // 基座前:蠟燭殘段、枯萎花束、照片、蠟淚
  for (let k = 0; k < 9; k++) {
    const x = rng.range(-1.0, 1.0), z = rng.range(0.75, 1.15), h = rng.range(0.04, 0.16);
    P.add('candle_wax', cyl(0.025, 0.028, h, 10), M(x, 0.32 + h / 2, z));
    P.add('rubber', cyl(0.002, 0.002, 0.012, 3), M(x, 0.32 + h + 0.006, z));
  }
  gDecal(P, 'wax', 0, 0.95, 2.0, 0.6, 0, 0.325);
  for (let k = 0; k < 3; k++) { // 花束(紙包 + 枯花)
    const x = rng.range(-1.1, 1.1), z = rng.range(0.9, 1.2), a = rng() * TAU;
    P.add('paper', lathe([[0.0, 0], [0.04, 0.02], [0.1, 0.3], [0.09, 0.32]], 10), M(x, 0.33, z, HALF - 0.15, a, 0));
    for (let j = 0; j < 6; j++) P.add(j % 2 ? 'leaves_dead' : 'candle_wax', sph(0.03, 6, 5), M(x + Math.cos(a) * (0.3 + j * 0.01), 0.36 + (j % 3) * 0.02, z - Math.sin(a) * (0.3 + j * 0.01)));
  }
  P.add('paper', box(0.1, 0.004, 0.14), M(0.4, 0.33, 0.95, 0, 0.3, 0)); // 相片
  const yaw = o.yaw ?? 0;
  put(ctx, P, o.x, o.y, o.z, yaw);
  // 一支還亮著的蠟燭(燭光)
  const cpos = new V3(-0.35, 0.32 + 0.12, 0.98).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(o.x, o.y, o.z));
  const flame = new Parts();
  flame.add('candle_wax', cyl(0.03, 0.032, 0.12, 10), M(0, -0.06, 0));
  flame.add('po_candle_flame', sph(0.012, 8, 6).scale(1, 2.2, 1), M(0, 0.03, 0));
  const fp = animPool(ctx, 'flames', () => flame, 32);
  fp.add(M(cpos.x, cpos.y, cpos.z), (t, m) => { const s = 1 + Math.sin(t * 13 + 1) * 0.08 + Math.sin(t * 29) * 0.05; m.makeScale(1, s, 1); });
  ctx.light({ x: cpos.x, y: cpos.y + 0.1, z: cpos.z, color: 0xffa040, intensity: 2.2, distance: 5, kind: 'candle', flicker: 0.5, zone: zone?.id });
  solid(ctx, o.x, o.y, o.z, 2.7, 0.4, 2.7, 'stone');
  solid(ctx, o.x, o.y, o.z, 1.3, 4.2, 1.3, 'stone');
  ctx.event({ kind: 'statue_veiled', x: o.x, y: o.y + 3.8, z: o.z, zone: zone?.id });
}

// ---------- 墓碑(實例池):直立圓頂碑、十字架、方尖碑、台式墓、斷碑(模型)----------
function tombParts(kind) {
  const P = new Parts();
  if (kind === 'slab') {
    P.add('stone_statue', box(0.7, 0.12, 0.34), M(0, 0.06, 0));
    P.add('stone_statue', extrude([[-0.28, 0], [0.28, 0], [0.28, 0.72], [0.24, 0.82], [0.12, 0.88], [0, 0.9], [-0.12, 0.88], [-0.24, 0.82], [-0.28, 0.72]], 0.12, { bevel: 0.01, seg: 1, cs: 2 }), M(0, 0.1, 0));
  } else if (kind === 'cross') {
    P.add('stone_statue', box(0.55, 0.22, 0.45), M(0, 0.11, 0));
    P.add('stone_statue', box(0.4, 0.14, 0.32), M(0, 0.29, 0));
    P.add('stone_statue', box(0.12, 1.15, 0.12), M(0, 0.9, 0));
    P.add('stone_statue', box(0.62, 0.12, 0.12), M(0, 1.15, 0));
  } else if (kind === 'obelisk') {
    P.add('po_granite', box(0.6, 0.3, 0.6), M(0, 0.15, 0));
    P.add('po_granite', new THREE.CylinderGeometry(0.16, 0.24, 1.5, 4, 1).rotateY(Math.PI / 4), M(0, 1.05, 0));
    P.add('po_granite', new THREE.ConeGeometry(0.16, 0.22, 4).rotateY(Math.PI / 4), M(0, 1.91, 0));
  } else if (kind === 'chinese') { // 中式墓碑:墓龜 + 弧肩碑面
    P.add('po_granite', box(1.3, 0.14, 0.9), M(0, 0.07, 0.15));
    P.add('po_granite', extrude([[-0.42, 0], [0.42, 0], [0.42, 0.78], [0.3, 0.86], [-0.3, 0.86], [-0.42, 0.78]], 0.14, { bevel: 0.012, seg: 1, cs: 2 }), M(0, 0.14, -0.1));
    P.add('po_granite', box(1.05, 0.5, 0.12), M(0, 0.35, -0.1).multiply(M(0, 0, 0)));
    P.add('stone_statue', box(1.2, 0.2, 0.1), M(0, 0.24, 0.55));
  } else if (kind === 'ledger') { // 台式墓
    P.add('stone_statue', box(0.9, 0.35, 2.0), M(0, 0.175, 0));
    P.add('stone_statue', box(0.98, 0.08, 2.08), M(0, 0.39, 0));
  }
  return P;
}
export function tomb(ctx, kind, x, y, z, yaw = 0, tilt = [0, 0], s = 1) {
  pool(ctx, `tomb_${kind}`, () => tombParts(kind), 32).add(M(x, y - 0.02, z, tilt[0], yaw, tilt[1], s));
}
export function brokenSlab(ctx, x, y, z, yaw = 0, s = 1) {
  const p = pool(ctx, 'tomb_broken', () => { const P = tombParts('slab'); return P; }, 16);
  bindModel(p, 'gravestone', [], { origin: 'base' });
  p.add(M(x, y - 0.02, z, 0, yaw, 0, s));
}
// 墓碑正面的墓誌銘(貼在碑面上;local:碑面中心高 y、碑面法線 +Z,半厚 t)
export function epitaph(P, n, x, y, z, yaw, w, h, cy, t) {
  const [u, v, uw, vh] = decalUV(`epi${n % 8}`);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh);
  g.translate(0, cy, t + 0.003).rotateY(yaw).translate(x, y, z);
  P.add('po_decal', keepUV(g));
}

// 天使墓(底座 + 天使像)
export function angelMonument(P, x, z, yaw, rng) {
  const B = new Parts();
  plinth(B, 0.7, 0.9, 'stone_statue', 0.06);
  B.merge(angel(1.45, 'stone_statue', Math.floor(rng() * 100)), M(0, 0.9, 0));
  P.merge(B, M(x, 0, z, 0, yaw, 0));
}

// 新挖的空墓穴:深色坑口 + 土堆 + 插著的鐵鏟 + 木板
export function openGrave(P, x, z, yaw, rng) {
  const L = new Parts();
  L.add('po_gap', box(0.9, 0.01, 2.0), M(0, 0.003, 0));
  for (const s of [-1, 1]) L.add('po_soil', box(0.06, 0.4, 2.0), M(s * 0.45, -0.18, 0));
  for (const s of [-1, 1]) L.add('po_soil', box(0.9, 0.4, 0.06), M(0, -0.18, s * 1.0));
  const mound = new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, HALF);
  const p = mound.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 + 0.12 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7)));
  mound.computeVertexNormals();
  L.add('po_soil', mound, M(0.95, 0, 0.1, 0, 0.3, 0, 0.55, 0.42, 1.05));
  L.add('wood_old', rod(new V3(1.15, 0.1, -0.6), new V3(1.3, 1.25, -0.75), 0.018, 6));
  L.add('rust', box(0.22, 0.3, 0.02), M(1.13, 0.12, -0.58, 0.15, 0.6, 0.12));
  L.add('wood_old', box(0.25, 0.03, 2.2), M(-0.7, 0.015, 0.0, 0, 0.12, 0));
  gDecal(L, 'mud', 0.4, 0.2, 2.4, 2.8, 0.3);
  P.merge(L, M(x, 0, z, 0, yaw, 0));
  void rng;
}

export const GALLERY = {
  fountain: (ctx, o) => { fountain(ctx, { ...o, yaw: 0 }, null); return 1.5; },
  statue: (ctx, o) => { sacredHeart(ctx, { ...o, yaw: 0 }, null); return 2.8; },
  tombs: (ctx, o) => {
    const kinds = ['slab', 'cross', 'obelisk', 'chinese', 'ledger'];
    const P = new Parts();
    kinds.forEach((k, i) => tomb(ctx, k, o.x - 3 + i * 1.5, 0, o.z, 0));
    brokenSlab(ctx, o.x + 4.5, 0, o.z, 0);
    epitaph(P, 1, o.x - 3, 0.1, o.z, 0, 0.42, 0.42, 0.45, 0.06);
    angelMonument(P, o.x, o.z + 2.5, 0, ctx.rng);
    openGrave(P, o.x + 3, o.z + 2.5, 0, ctx.rng);
    put(ctx, P, 0, 0, 0);
    return 1;
  },
};
