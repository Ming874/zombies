import { B, tpl, HALF, L, THREE } from './parts.js';
import { form, fileCover, drugBox, bottleLabel, decal, spines, sw } from './art.js';
import { D } from './geo.js';
import { placeM } from './place.js';

// 小雜物用的純色(標籤圖集內的色票 → 每種雜物只有一個材質 = 一個 InstancedMesh)
const HEX = {
  paper: '#d6d2c2', pl_amber: '#8a5012', pl_white: '#dcdad0', pl_blue: '#2e5e96', pl_clear: '#b8c4c8', steel: '#8a8c8e', pl_orange: '#c8621e', gauze: '#d6d2c6',
  meat: '#4a1210', pl_ltblue: '#86aec8', ceramic: '#e0ded6', soil: '#2e241a', pl_red: '#a82a22', alu: '#a8acb0', pl_beige: '#c4b896', cardboard: '#8a7050',
  fab_red: '#6a1a1c', leather_black: '#1c1816', gold: '#c09a4a', wood_white: '#e8e4dc', pl_black: '#161616', leaf_dead: '#5a4a2a', plaster: '#d2ccbe', stone: '#7a7870',
  glass_amber: '#56320e', glass_green: '#284632', fab_white: '#c8c6bc', pl_yellow: '#d8b030', rubber_gray: '#464646', wax: '#e0d6bc', film: '#101418', pl_gray: '#86888a',
};
const K = (n) => (HEX[n] ? L(sw(HEX[n])) : n);
// 小雜物(InstancedMesh 共用,每種一個 draw call):紙張、藥瓶、藥盒、針筒、紗布、手套、紙杯、餐盤、碎玻璃、
// 病歷夾、書、積木、錄影帶、枯葉、菸蒂、天花板碎塊…;以及地面/牆面貼花。

const C = {
  paper: () => tpl('c:paper', (b) => { const g = new THREE.PlaneGeometry(0.21, 0.297, 2, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.06); g.computeVertexNormals(); b.raw(L(form(0)), g, new THREE.Matrix4().makeRotationX(-HALF).setPosition(0, 0.004, 0), 'rect'); b.meta.cap = 4096; }),
  paper2: () => tpl('c:paper2', (b) => { const g = new THREE.PlaneGeometry(0.21, 0.297, 1, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (p.getY(i) > 0.1 ? 0.03 : 0)); g.computeVertexNormals(); b.raw(L(form(3)), g, new THREE.Matrix4().makeRotationX(-HALF).setPosition(0, 0.004, 0), 'rect'); b.meta.cap = 4096; }),
  paper3: () => tpl('c:paper3', (b) => { b.raw(L(form(4)), new THREE.PlaneGeometry(0.21, 0.297), new THREE.Matrix4().makeRotationX(-HALF).setPosition(0, 0.003, 0), 'rect'); b.meta.cap = 4096; }),
  crumple: () => tpl('c:crumple', (b) => { const g = new THREE.IcosahedronGeometry(0.035, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.7 + Math.sin(i * 12.9898) * 0.3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); } g.computeVertexNormals(); b.raw(K('paper'), g, new THREE.Matrix4().makeTranslation(0, 0.028, 0)); }),
  pillbottle: () => tpl('c:pillbottle', (b) => { b.lathe(K('pl_amber'), [[0, 0], [0.018, 0], [0.019, 0.004], [0.019, 0.062], [0.016, 0.066], [0, 0.066]], 0, 0, 0, { seg: 10 }); b.cyl(K('pl_white'), 0.02, 0.016, 0, 0.073, 0, { seg: 10 }); b.cyl(L(bottleLabel(0)), 0.0195, 0.035, 0, 0.032, 0, { seg: 10, open: true }); }),
  pillbottle2: () => tpl('c:pillbottle2', (b) => { b.lathe(K('pl_white'), [[0, 0], [0.024, 0], [0.025, 0.004], [0.025, 0.085], [0.016, 0.092], [0.012, 0.1], [0, 0.1]], 0, 0, 0, { seg: 10 }); b.cyl(K('pl_blue'), 0.014, 0.018, 0, 0.108, 0, { seg: 10 }); b.cyl(L(bottleLabel(5)), 0.0255, 0.05, 0, 0.045, 0, { seg: 10, open: true }); }),
  pillbox: () => tpl('c:pillbox', (b) => { b.box(K('paper'), 0.1, 0.05, 0.035, 0, 0.025, 0); b.plane(L(drugBox(1)), 0.098, 0.048, 0, 0.025, 0.0178); b.plane(L(drugBox(1)), 0.098, 0.048, 0, 0.025, -0.0178, { ry: Math.PI }); }),
  pillbox2: () => tpl('c:pillbox2', (b) => { b.box(K('paper'), 0.12, 0.06, 0.04, 0, 0.03, 0); b.plane(L(drugBox(2)), 0.118, 0.058, 0, 0.03, 0.0205); b.plane(L(drugBox(6)), 0.118, 0.058, 0, 0.03, -0.0205, { ry: Math.PI }); }),
  pillbox3: () => tpl('c:pillbox3', (b) => { b.box(K('paper'), 0.09, 0.045, 0.03, 0, 0.0225, 0); b.plane(L(drugBox(4)), 0.088, 0.043, 0, 0.0225, 0.0155); b.plane(L(drugBox(9)), 0.088, 0.043, 0, 0.0225, -0.0155, { ry: Math.PI }); }),
  vial: () => tpl('c:vial', (b) => { b.lathe(K('glass_amber'), [[0, 0], [0.011, 0], [0.011, 0.04], [0.006, 0.046], [0.006, 0.05], [0, 0.05]], 0, 0, 0, { seg: 8 }); b.cyl(K('pl_red'), 0.0075, 0.008, 0, 0.053, 0, { seg: 8 }); }),
  syringe: () => tpl('c:syringe', (b) => { b.cyl(K('pl_clear'), 0.007, 0.08, 0, 0.008, 0, { axis: 'z', seg: 8 }); b.cyl(K('pl_white'), 0.005, 0.05, 0, 0.008, -0.06, { axis: 'z', seg: 6 }); b.box(K('pl_white'), 0.022, 0.003, 0.004, 0, 0.008, -0.085); b.cyl(K('steel'), 0.0006, 0.035, 0, 0.008, 0.058, { axis: 'z', seg: 3 }); b.cyl(K('pl_orange'), 0.0025, 0.008, 0, 0.008, 0.044, { axis: 'z', seg: 6 }); }),
  gauze: () => tpl('c:gauze', (b) => { const g = new THREE.IcosahedronGeometry(0.04, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.abs(Math.sin(i * 7.31)) * 0.4; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.45, p.getZ(i) * k); } g.computeVertexNormals(); b.raw(K('gauze'), g, new THREE.Matrix4().makeTranslation(0, 0.015, 0)); b.sph(K('meat'), 0.02, 0.01, 0.022, 0.0, { sy: 0.35, ws: 6, hs: 4 }); }),
  glove: () => tpl('c:glove', (b) => { b.box(K('pl_ltblue'), 0.08, 0.012, 0.1, 0, 0.006, 0, { r: 0.005 }); for (let i = 0; i < 4; i++) b.rod(K('pl_ltblue'), 0.008, [-0.03 + i * 0.02, 0.006, 0.05], [-0.032 + i * 0.022, 0.006, 0.12 - Math.abs(i - 1.5) * 0.012], { seg: 5 }); b.rod(K('pl_ltblue'), 0.009, [0.04, 0.006, 0.01], [0.075, 0.006, 0.06], { seg: 5 }); }),
  cup: () => tpl('c:cup', (b) => { b.lathe(K('paper'), [[0, 0], [0.028, 0], [0.04, 0.1], [0.041, 0.102], [0.038, 0.102], [0.026, 0.004], [0, 0.004]], 0, 0, 0, { seg: 12 }); }),
  mug: () => tpl('c:mug', (b) => { b.lathe(K('ceramic'), [[0, 0], [0.04, 0], [0.042, 0.095], [0.038, 0.095], [0.036, 0.01], [0, 0.01]], 0, 0, 0, { seg: 12 }); b.tor(K('ceramic'), 0.024, 0.006, 0.045, 0.05, 0, { rs: 5, ts: 10, arc: Math.PI, rz: -HALF }); b.cyl(K('soil'), 0.037, 0.002, 0, 0.06, 0, { seg: 10 }); }),
  can: () => tpl('c:can', (b) => { b.cyl(K('pl_red'), 0.033, 0.115, 0, 0.0575, 0, { seg: 12 }); b.cyl(K('alu'), 0.03, 0.006, 0, 0.118, 0, { seg: 12 }); }),
  tray: () => tpl('c:tray', (b) => { b.box(K('pl_beige'), 0.45, 0.012, 0.35, 0, 0.006, 0, { r: 0.004 }); for (const s of [-1, 1]) { b.box(K('pl_beige'), 0.45, 0.025, 0.008, 0, 0.015, s * 0.171); b.box(K('pl_beige'), 0.008, 0.025, 0.35, s * 0.221, 0.015, 0); } b.cyl(K('ceramic'), 0.08, 0.012, -0.1, 0.018, 0.02, { seg: 14 }); b.cyl(K('soil'), 0.06, 0.004, -0.1, 0.026, 0.02, { seg: 10 }); b.lathe(K('ceramic'), [[0, 0], [0.04, 0], [0.055, 0.05], [0.05, 0.05], [0.036, 0.008], [0, 0.008]], 0.12, 0.012, -0.06, { seg: 12 }); b.box(K('steel'), 0.012, 0.004, 0.16, 0.08, 0.016, 0.1, { ry: 0.3 }); }),
  shard: () => tpl('c:shard', (b) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.002, 0, 0.06, 0.002, 0.01, 0.02, 0.002, 0.07, 0.06, 0.002, 0.01, 0.05, 0.002, 0.06, 0.02, 0.002, 0.07], 3)); g.computeVertexNormals(); b.raw('glass', g); b.meta.cap = 4096; }),
  file: () => tpl('c:file', (b) => { b.box(K('cardboard'), 0.24, 0.012, 0.32, 0, 0.006, 0); b.plane(L(fileCover(0)), 0.23, 0.31, 0, 0.0125, 0, { rx: -HALF }); b.box(K('paper'), 0.22, 0.008, 0.3, 0.01, 0.006, 0.0); }),
  file2: () => tpl('c:file2', (b) => { b.box(K('cardboard'), 0.24, 0.012, 0.32, 0, 0.006, 0); b.plane(L(fileCover(2)), 0.23, 0.31, 0, 0.0125, 0, { rx: -HALF }); }),
  book: () => tpl('c:book', (b) => { b.box(K('fab_red'), 0.16, 0.035, 0.23, 0, 0.0175, 0, { r: 0.003 }); b.box(K('paper'), 0.15, 0.03, 0.222, 0.006, 0.0175, 0); }),
  bible: () => tpl('c:bible', (b) => { b.box(K('leather_black'), 0.14, 0.04, 0.2, 0, 0.02, 0, { r: 0.004 }); b.box(K('paper'), 0.13, 0.034, 0.192, 0.006, 0.02, 0); b.box(K('gold'), 0.04, 0.001, 0.006, 0, 0.0405, -0.03); b.box(K('gold'), 0.006, 0.001, 0.06, 0, 0.0405, -0.02); }),
  block: () => tpl('c:block', (b) => { b.box(K('wood_white'), 0.05, 0.05, 0.05, 0, 0.025, 0, { r: 0.004 }); b.meta.cap = 2048; }),
  vhs: () => tpl('c:vhs', (b) => { b.box(K('pl_black'), 0.188, 0.025, 0.104, 0, 0.0125, 0, { r: 0.002 }); b.box(K('paper'), 0.1, 0.001, 0.05, -0.03, 0.0255, 0); }),
  leaf: () => tpl('c:leaf', (b) => { const g = new THREE.CircleGeometry(0.035, 6); g.scale(1, 0.5, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.3); g.computeVertexNormals(); b.raw(K('leaf_dead'), g, new THREE.Matrix4().makeRotationX(-HALF).setPosition(0, 0.004, 0)); b.meta.cap = 4096; }),
  butt: () => tpl('c:butt', (b) => { b.cyl(K('paper'), 0.0045, 0.03, 0, 0.0045, 0, { axis: 'z', seg: 6 }); b.cyl(K('pl_orange'), 0.0047, 0.012, 0, 0.0045, 0.02, { axis: 'z', seg: 6 }); }),
  debris: () => tpl('c:debris', (b) => { b.box(K('plaster'), 0.18, 0.016, 0.14, 0, 0.008, 0, { ry: 0.3 }); b.box(K('plaster'), 0.08, 0.014, 0.06, 0.12, 0.007, 0.07, { ry: 1.1 }); b.meta.cap = 2048; }),
  rubble: () => tpl('c:rubble', (b) => { const g = new THREE.DodecahedronGeometry(0.035, 0); g.scale(1, 0.6, 0.8); b.raw(K('stone'), g, new THREE.Matrix4().makeTranslation(0, 0.018, 0)); b.meta.cap = 4096; }),
  bandage: () => tpl('c:bandage', (b) => { b.cyl(K('gauze'), 0.025, 0.05, 0, 0.025, 0, { seg: 10 }); b.tube(K('gauze'), [[0.02, 0.003, 0], [0.12, 0.003, 0.05], [0.2, 0.003, 0.0]], 0.012, { seg: 3, bend: 0.05 }); }),
  ampoule: () => tpl('c:ampoule', (b) => { b.lathe(K('glass_amber'), [[0, 0], [0.006, 0], [0.006, 0.025], [0.0025, 0.03], [0.004, 0.036], [0, 0.04]], 0, 0, 0, { seg: 6, rz: HALF }); b.meta.cap = 2048; }),
  bottle: () => tpl('c:bottle', (b) => { b.lathe(K('glass_green'), [[0, 0], [0.035, 0], [0.036, 0.16], [0.014, 0.21], [0.013, 0.25], [0, 0.25]], 0, 0, 0, { seg: 10 }); }),
  shoe: () => tpl('c:shoe', (b) => { b.box(K('pl_white'), 0.1, 0.03, 0.26, 0, 0.015, 0, { r: 0.012 }); b.box(K('fab_white'), 0.09, 0.06, 0.15, 0, 0.05, -0.04, { r: 0.03 }); }),
  diaper: () => tpl('c:diaper', (b) => { b.box(K('fab_white'), 0.18, 0.04, 0.12, 0, 0.02, 0, { r: 0.018 }); }),
  babybottle: () => tpl('c:babybottle', (b) => { b.lathe(K('pl_clear'), [[0, 0], [0.03, 0], [0.032, 0.12], [0.026, 0.13], [0, 0.13]], 0, 0, 0, { seg: 10 }); b.cyl(K('pl_yellow'), 0.028, 0.02, 0, 0.14, 0, { seg: 10 }); b.lathe(K('rubber_gray'), [[0.012, 0], [0.012, 0.01], [0.007, 0.03], [0, 0.04]], 0, 0.15, 0, { seg: 8 }); b.cyl(K('fab_white'), 0.029, 0.05, 0, 0.03, 0, { seg: 10 }); }),
  crayon: () => tpl('c:crayon', (b) => { b.cyl(K('wood_white'), 0.005, 0.08, 0, 0.005, 0, { axis: 'x', seg: 6 }); b.meta.cap = 2048; }),
  tape: () => tpl('c:tape', (b) => { b.cyl(K('pl_black'), 0.05, 0.02, 0, 0.01, 0, { seg: 12 }); b.tube(K('film'), [[0.03, 0.002, 0.03], [0.15, 0.002, 0.1], [0.25, 0.002, 0.02], [0.32, 0.002, 0.15]], 0.0035, { seg: 2, bend: 0.06 }); }),
  ballx: () => tpl('c:ball', (b) => { b.sph(K('pl_white'), 0.06, 0, 0.06, 0, { ws: 12, hs: 8 }); }),
  candle_s: () => tpl('c:candle_s', (b) => { b.lathe(K('wax'), [[0, 0], [0.02, 0], [0.02, 0.05], [0.012, 0.055], [0, 0.052]], 0, 0, 0, { seg: 8 }); b.cyl(K('pl_black'), 0.0012, 0.01, 0, 0.058, 0, { seg: 3 }); }),
};
const cache = new Map();
export function ctpl(name) { let t = cache.get(name); if (!t) { t = C[name](); cache.set(name, t); } return t; }
export const CLUTTER = Object.keys(C);

// 在房間地上撒雜物:n 個,area 可限定矩形 {x0,z0,x1,z1};near:{x,z,r} 集中在某點附近
export function scatter(R, name, n, o = {}) {
  const t = ctpl(name);
  const cells = [...R.plain];
  let placed = 0;
  for (let k = 0; k < n * 4 && placed < n; k++) {
    let x, z;
    if (o.near) { const a = R.rng() * Math.PI * 2, d = Math.sqrt(R.rng()) * o.near.r; x = o.near.x + Math.cos(a) * d; z = o.near.z + Math.sin(a) * d; }
    else if (o.area) { x = R.rand(o.area.x0, o.area.x1); z = R.rand(o.area.z0, o.area.z1); }
    else { const key = R.pick(cells); x = ((key % R.L.W) + R.rng()) * R.L.CELL; z = (((key / R.L.W) | 0) + R.rng()) * R.L.CELL; }
    if (!o.any && !R.freeAt(x, z, 0.05)) continue;
    const s = o.s ? R.rand(o.s[0], o.s[1]) : 1;
    R.I(name, t, x, (o.y ?? R.y) + (o.dy ?? 0), z, R.rng() * Math.PI * 2, o.rx ?? 0, o.rz ?? 0, s, o.colors ? R.pick(o.colors) : o.color);
    placed++;
  }
  return placed;
}
// 在頂面(R.topOf 回傳的矩形)上放雜物
export function onSurface(R, top, name, n, o = {}) {
  const t = ctpl(name);
  for (let k = 0; k < n; k++) {
    const x = R.rand(top.x0 + 0.04, top.x1 - 0.04), z = R.rand(top.z0 + 0.04, top.z1 - 0.04);
    R.I(name, t, x, top.y, z, o.yaw ?? R.rng() * Math.PI * 2, 0, 0, 1, o.colors ? R.pick(o.colors) : o.color);
  }
}

// ---------------------------------------------------------------- 貼花
// 地面貼花:kind 見 art.decal;size 公尺;靜態合併(pi_decal 材質)
export function floorDecal(R, kind, x, z, size, o = {}) {
  const v = o.v ?? R.rng.int(0, 1);
  const rect = decal(kind, v, true);
  const asp = rect.h / rect.w;
  size *= rect.k ?? 1; // 血跡格依真實尺寸畫(手長、鞋長…):k 把舊的擺放尺寸換算成真實大小
  const t = tpl(`dec:${kind}:${v}:f:${size.toFixed(2)}`, (b) => b.plane(D(rect), size, size * asp, 0, 0, 0, { rx: -HALF }));
  R.put(t, x, z, o.yaw ?? R.rng() * Math.PI * 2, { y: (o.y ?? R.y) + 0.004 + R.rng() * 0.002 });
}
// 牆面貼花(在牆段 run 的 t 位置、高度 y)
export function wallDecal(R, run, t, y, kind, size, o = {}) {
  const v = o.v ?? R.rng.int(0, 1);
  const rect = decal(kind, v);
  const asp = rect.h / rect.w;
  size *= rect.k ?? 1;
  const tp = tpl(`wdec:${kind}:${v}:${size.toFixed(2)}`, (b) => b.plane(D(rect), size, size * asp, 0, 0, 0));
  const p = R.wallPos(run, t, 0.006 + R.rng() * 0.003);
  R.put(tp, p.x, p.z, run.yaw, { y: R.y + y, rz: o.rot ?? 0 });
}
export { placeM, spines, B };
