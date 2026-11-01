import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { pbrTex } from '../../hospital/pbr.js';
import { makeWet, groundLevel } from '../../weather.js';
import { rng as mkRng } from '../ctx.js';
import { Parts, M, box, rbox, cyl, rod, tube, sagLine, keepUV, put, animate, V3, HALF, TAU, lerp, hash } from './kit.js';
import { canvas, tex, lazy, text, softBlob, rr, R } from './mats.js';
import { groundDecal } from './cars.js';
import { placeVehicle } from './vehicles.js';
import { flatDecal } from './industrial.js';
import { BAND, strip, line, dashed, litter, puddle } from './ground.js';
import { tree, shrub } from './nature.js';
import { jersey, sandbagWall, canopy } from './camp.js';
import { lamp } from './furniture.js';

// 地圖外圍景(玩家到不了,只負責讓邊界可信):
//  北:圍牆外的舊公寓背面(窗戶零星亮著、鐵窗、冷氣、頂樓水塔)與電線桿;
//  西:枯樹林與一棟窗戶還亮著的老屋;
//  東:圍籬外的街道(人行道、車道標線、熄滅的路燈、棄置/燒毀的車、拒馬)與騎樓店面(鐵捲門、招牌);
//  南:疏散車潮塞在封鎖的路上(車門大開、車頂行李)、軍方哨塔與緩慢掃動的探照燈。
// 全部靜態合併(1F 群組);不登記碰撞(地圖邊界本身已由牆/圍籬封閉)。

// ---------- 立面貼圖(窗格;亮窗用自發光貼圖)----------
const FACADE = lazy(() => {
  const out = [];
  for (let v = 0; v < 3; v++) {
    const W = 512, H = 512;
    const [c, x] = canvas(W, H), [ce, xe] = canvas(W, H);
    const base = v === 0 ? [92, 84, 76] : v === 1 ? [118, 112, 100] : [74, 70, 66];
    x.fillStyle = `rgb(${base.join(',')})`; x.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) softBlob(x, rr(0, W), rr(0, H), rr(20, 120), '40,36,30', rr(0.05, 0.25)); // 污漬、水痕
    for (let k = 0; k < 30; k++) { const gx = rr(0, W); const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(30,26,20,0.3)'); g.addColorStop(1, 'rgba(30,26,20,0)'); x.fillStyle = g; x.fillRect(gx, rr(0, H * 0.5), rr(2, 8), rr(60, 300)); }
    xe.fillStyle = '#000'; xe.fillRect(0, 0, W, H);
    // 4 × 4 窗(每格 128px = 3m)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const ox = i * 128 + 28, oy = j * 128 + 30, ww = 72, hh = 66;
      const kind = R();
      x.fillStyle = '#1a1c1e'; x.fillRect(ox - 6, oy - 6, ww + 12, hh + 14); // 窗框陰影
      const lit = kind > 0.93, broken = kind < 0.12, boarded = kind > 0.12 && kind < 0.2;
      x.fillStyle = lit ? '#d8b070' : broken ? '#050505' : '#1e2428'; x.fillRect(ox, oy, ww, hh);
      if (!lit && !broken) { const g = x.createLinearGradient(ox, oy, ox + ww, oy + hh); g.addColorStop(0, 'rgba(90,100,110,0.35)'); g.addColorStop(1, 'rgba(20,24,28,0)'); x.fillStyle = g; x.fillRect(ox, oy, ww, hh); }
      if (boarded) { x.fillStyle = '#5a4a36'; for (let b = 0; b < 3; b++) x.fillRect(ox - 4, oy + 8 + b * 22, ww + 8, 14); }
      x.strokeStyle = '#2a2c2c'; x.lineWidth = 3; x.beginPath(); x.moveTo(ox + ww / 2, oy); x.lineTo(ox + ww / 2, oy + hh); x.stroke(); // 窗櫺
      if (R() < 0.45) { x.strokeStyle = '#3a3a38'; x.lineWidth = 2; for (let b = 0; b <= 6; b++) { x.beginPath(); x.moveTo(ox - 4 + b * (ww + 8) / 6, oy - 4); x.lineTo(ox - 4 + b * (ww + 8) / 6, oy + hh + 6); x.stroke(); } } // 鐵窗
      x.fillStyle = '#6a6660'; x.fillRect(ox - 8, oy + hh + 6, ww + 16, 6); // 窗台
      if (lit) { xe.fillStyle = R() < 0.7 ? '#ffb860' : '#8ab0ff'; xe.fillRect(ox, oy, ww, hh); if (R() < 0.5) { xe.fillStyle = '#000'; xe.fillRect(ox + rr(5, 40), oy + 10, 22, hh - 10); } } // 亮窗(偶爾有人影)
      if (R() < 0.25) { x.fillStyle = '#d8d8d0'; x.fillRect(ox + ww * 0.6, oy + hh * 0.3, 26, 18); x.fillStyle = '#555'; x.beginPath(); x.arc(ox + ww * 0.6 + 13, oy + hh * 0.3 + 9, 6, 0, TAU); x.fill(); } // 冷氣
    }
    out.push({ map: tex(c), em: tex(ce) });
  }
  return out;
});
// 店面招牌圖集(512×512:8 格 256×64)
const SHOPS = ['藥 局', '便 利 商 店', '當 舖', '小 吃 店', '五 金 行', '診 所', '網 咖', '旅 社'];
const SHOP_TEX = lazy(() => {
  const [c, x] = canvas(512, 512);
  const cols = ['#1a5a2a', '#b81c16', '#1a3a7a', '#c8a020', '#3a3a3a', '#e8e8e0', '#4a1a6a', '#7a2a1a'];
  SHOPS.forEach((s, i) => {
    const ox = (i % 2) * 256, oy = Math.floor(i / 2) * 128;
    x.fillStyle = cols[i]; x.fillRect(ox, oy, 256, 128);
    text(x, s, ox + 128, oy + 64, 58, { color: i === 5 ? '#b81c16' : '#f0ece0', weight: '900' });
    for (let k = 0; k < 6; k++) softBlob(x, ox + rr(0, 256), oy + rr(0, 128), rr(10, 60), '30,25,20', 0.35);
  });
  return tex(c, { repeat: false });
});

let inited = false;
function initEdges() {
  if (inited) return;
  inited = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  FACADE().forEach((f, i) => {
    const m = std({ map: f.map, emissiveMap: f.em, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.92 });
    f.map.repeat.set(1 / 12, 1 / 12); f.em.repeat.set(1 / 12, 1 / 12);
    registerMat(`po_facade${i}`, makeWet(m, { darken: 0.25, gloss: 0.4 }));
  });
  const road = std({ color: 0x9a968e, roughness: 1, map: pbrTex('asphalt', 'color', { tile: 3.2 }), normalMap: pbrTex('asphalt', 'normal', { tile: 3.2 }) });
  road.roughnessMap = pbrTex('asphalt', 'orm', { tile: 3.2 }); road.aoMap = road.roughnessMap;
  registerMat('po_road', makeWet(road, { puddle: 0.9, darken: 0.42, gloss: 0.6 }));
  registerMat('po_shopsign', std({ map: SHOP_TEX(), roughness: 0.6, emissive: 0x000000 }));
  registerMat('po_roof_tar', makeWet(std({ color: 0x2a2a2c, roughness: 0.9 }), { puddle: 0.6, darken: 0.2, gloss: 0.6 }));
  registerMat('po_searchbeam', new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 3.0); float a = f * pow(1.0 - vT, 2.2) * 0.055; gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
}

// 一棟樓:x0..x1 寬、z0..z1 深、h 高;front = 面向地圖的那面('z+' 'z-' 'x+' 'x-');v = 立面款式
function building(P, x0, z0, x1, z1, h, front, v, rng, { shop = -1, roofStuff = true } = {}) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const fk = `po_facade${v}`;
  P.add(fk, box(w, h, d), M(cx, h / 2, cz));
  P.add('po_roof_tar', box(w - 0.4, 0.05, d - 0.4), M(cx, h + 0.02, cz));
  P.add('concrete', box(w + 0.1, 0.5, d + 0.1).translate(0, 0, 0), M(cx, h + 0.0, cz).multiply(M(0, 0.25, 0)));
  if (roofStuff) { // 頂樓水塔、鐵皮加蓋、天線
    if (rng() < 0.7) { const tx = cx + rng.range(-w * 0.3, w * 0.3), tz = cz + rng.range(-d * 0.2, d * 0.2); P.add('steel', cyl(0.7, 0.7, 1.4, 12), M(tx, h + 1.6, tz)); for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) P.add('rust', box(0.08, 0.9, 0.08), M(tx + a, h + 0.45, tz + b)); }
    if (rng() < 0.6) { const ax = cx + rng.range(-w * 0.3, w * 0.3), az = cz + rng.range(-d * 0.2, d * 0.2), aw = rng.range(3, 6); P.add('rust', box(aw, 2.2, rng.range(2.5, 4)), M(ax, h + 1.1, az)); P.add('rust', box(aw + 0.4, 0.06, 4.2), M(ax, h + 2.25, az, 0.06, 0, 0)); }
    if (rng() < 0.5) P.add('steel', cyl(0.03, 0.04, 4, 5), M(cx + rng.range(-w * 0.4, w * 0.4), h + 2, cz));
  }
  // 面向地圖的立面:騎樓店面(鐵捲門 + 招牌)與鐵窗陽台
  const fz = front === 'z+' ? z1 : front === 'z-' ? z0 : null, fx = front === 'x+' ? x1 : front === 'x-' ? x0 : null;
  const along = fz !== null ? [x0, x1] : [z0, z1], sgn = front.endsWith('+') ? 1 : -1;
  if (shop >= 0) {
    const n = Math.max(1, Math.floor((along[1] - along[0]) / 4));
    for (let k = 0; k < n; k++) {
      const a = along[0] + (k + 0.5) * (along[1] - along[0]) / n, s = (shop + k) % 8;
      const pos = (off, yy) => (fz !== null ? [a, yy, fz + sgn * off] : [fx + sgn * off, yy, a]);
      const yaw = fz !== null ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? HALF : -HALF);
      const sg = new THREE.PlaneGeometry(3.2, 0.8);
      const uv = sg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ((s % 2) * 256 + uv.getX(i) * 256) / 512, 1 - (Math.floor(s / 2) * 128 + (1 - uv.getY(i)) * 128) / 512);
      const [px, py, pz] = pos(0.35, 3.3);
      P.add('po_shopsign', keepUV(sg), M(px, py, pz, 0, yaw, 0));
      const [bx, by, bz] = pos(0.3, 3.3);
      P.add('metal_gray', box(3.3, 0.9, 0.08), M(bx, by, bz, 0, yaw, 0).multiply(M(0, 0, -0.06)));
      const [sx, sy, sz] = pos(0.08, 1.4);
      P.add('rust', box(3.4, 2.8, 0.06), M(sx, sy, sz, 0, yaw, 0)); // 鐵捲門(簡化;紋路用貼花)
      for (let r2 = 0; r2 < 14; r2++) { const [lx, ly, lz] = pos(0.115, 0.1 + r2 * 0.2); P.add('steel', box(3.4, 0.02, 0.02), M(lx, ly, lz, 0, yaw, 0)); }
      if (rng() < 0.5) { const [gx, gy, gz] = pos(0.12, 1.3); flatDecal(P, rng.pick(['g_help', 'g_dont', 'g_eye', 'g_tally']), gx, gy, gz, 2.2, 1.1, fz !== null ? (sgn > 0 ? 'z+' : 'z-') : (sgn > 0 ? 'x+' : 'x-')); }
    }
  }
  // 牆面污漬帶
  if (fz !== null) flatDecal(P, 'rustrun', cx, h * 0.6, fz + sgn * 0.02, w * 0.6, h * 0.5, sgn > 0 ? 'z+' : 'z-');
}
// 電線桿 + 橫擔 + 變壓器
function pole(P, x, z, h = 9) {
  P.add('concrete', cyl(0.13, 0.17, h, 8), M(x, h / 2, z));
  P.add('wood_dark', box(1.8, 0.1, 0.1), M(x, h - 0.6, z));
  P.add('wood_dark', box(1.4, 0.1, 0.1), M(x, h - 1.2, z));
  for (const s of [-0.75, -0.25, 0.25, 0.75]) P.add('plastic_white', cyl(0.03, 0.04, 0.12, 6), M(x + s, h - 0.48, z));
  if (hash(x + z) < 0.5) { P.add('metal_gray', cyl(0.25, 0.25, 0.8, 10), M(x + 0.35, h - 2.2, z)); }
}
function wires(P, a, b, n = 3) { for (let k = 0; k < n; k++) { const o = (k - (n - 1) / 2) * 0.5; P.add('po_cable', tube(sagLine(new V3(a.x + o, a.y, a.z), new V3(b.x + o, b.y, b.z), 0.9 + k * 0.1, 14), 0.015, { radial: 3 })); } }

// 探照燈(哨塔上,光束緩慢掃動)
function searchlight(ctx, x, y, z) {
  const P = new Parts();
  for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) P.add('rust', rod(new V3(x + a, 0, z + b), new V3(x + a * 0.6, y, z + b * 0.6), 0.06, 6));
  for (let k = 1; k < 4; k++) { const t = k / 4, s = lerp(1.2, 0.72, t); P.add('rust', box(s * 2, 0.06, 0.06), M(x, y * t, z - s)); P.add('rust', box(s * 2, 0.06, 0.06), M(x, y * t, z + s)); }
  P.add('wood_old', box(1.8, 0.1, 1.8), M(x, y, z));
  for (const s of [-1, 1]) { P.add('wood_old', box(1.8, 1.0, 0.05), M(x, y + 0.55, z + s * 0.88)); P.add('wood_old', box(0.05, 1.0, 1.8), M(x + s * 0.88, y + 0.55, z)); }
  P.add('po_canvas_olive', box(2.2, 0.06, 2.2), M(x, y + 2.2, z, 0.05, 0, 0));
  for (const [a, b] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) P.add('wood_old', box(0.08, 2.2, 0.08), M(x + a, y + 1.1, z + b));
  put(ctx, P, 0, 0, 0);
  // 光束(加法錐體)+ 燈頭,一起繞 y 緩慢擺動
  const g = new THREE.Group();
  g.position.set(x, y + 1.3, z);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 14).rotateX(HALF), mat('cast_iron'));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), mat('glow_white'));
  lens.position.z = 0.26;
  head.add(lens);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 3.2, 45, 20, 1, true).rotateX(HALF).translate(0, 0, 22.8), mat('po_searchbeam'));
  cone.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2 === 1) a[i] = 1 - v; });
  cone.frustumCulled = false;
  cone.renderOrder = 9;
  g.add(head, cone);
  ctx.add(g, { static: false });
  animate(head, (t) => { g.rotation.set(0.22 + Math.sin(t * 0.13) * 0.06, Math.PI + Math.sin(t * 0.21) * 0.9, 0); });
}

// 地圖四邊:依地面層邊界格判斷類型 — 牆('#')→ 舊樓背面 / 枯樹林;圍籬('|')→ 街道 + 店面。
// 每邊用本地座標:u 沿邊(0..len)、v 往外的距離;P2 轉回世界座標。
const SIDE_DEF = (MW, MH) => ({
  N: { o: [0, 0], A: [1, 0], N: [0, -1], len: MW, front: 'z+', axis: 'EW' },
  S: { o: [0, MH], A: [1, 0], N: [0, 1], len: MW, front: 'z-', axis: 'EW' },
  W: { o: [0, 0], A: [0, 1], N: [-1, 0], len: MH, front: 'x+', axis: 'NS' },
  E: { o: [MW, 0], A: [0, 1], N: [1, 0], len: MH, front: 'x-', axis: 'NS' },
});
const P2 = (sd, u, v) => [sd.o[0] + sd.A[0] * u + sd.N[0] * v, sd.o[1] + sd.A[1] * u + sd.N[1] * v];
const RECT = (sd, u0, v0, u1, v1) => { const a = P2(sd, u0, v0), b = P2(sd, u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
function sideType(L, li, side) {
  let w = 0, f = 0;
  const n = side === 'N' || side === 'S' ? L.W : L.H;
  for (let k = 0; k < n; k++) {
    const [c, r] = side === 'N' ? [k, 0] : side === 'S' ? [k, L.H - 1] : side === 'W' ? [0, k] : [L.W - 1, k];
    const ch = L.charAt(li, c, r);
    if (ch === '#') w++; else if (ch === '|') f++;
  }
  return f > w ? 'street' : 'backs';
}
// 舊樓背面 + 電線桿
function sideBacks(ctx, P, sd, y, rng, v0 = 3.4) {
  let i = 0;
  for (let u = -14; u < sd.len + 10; i++) {
    const w = rng.range(22, 32), d = rng.range(9, 13), h = rng.range(10, 17), vv = v0 + rng.range(0, 1.5);
    const [x0, z0, x1, z1] = RECT(sd, u, vv, u + w, vv + d);
    building(P, x0, z0, x1, z1, h, sd.front, i % 3, rng, { roofStuff: true });
    if (rng() < 0.6) { // 背面逃生梯(之字形)
      const fu = u + rng.range(3, w - 6);
      for (let f = 1; f * 3.2 < h - 1; f++) {
        const yy = y + f * 3.2, [cx, cz] = P2(sd, fu + 2, vv - 0.6), [ax, az] = P2(sd, fu + (f % 2 ? 0.3 : 3.7), vv - 0.6), [bx, bz] = P2(sd, fu + (f % 2 ? 3.7 : 0.3), vv - 0.6);
        P.add('rust', box(sd.A[0] ? 4.2 : 1.2, 0.06, sd.A[0] ? 1.2 : 4.2), M(cx, yy, cz));
        P.add('rust', rod(new V3(ax, yy, az), new V3(bx, yy + 3.2, bz), 0.05, 4));
      }
    }
    u += w + rng.range(1.5, 4);
  }
  let prev = null;
  for (let u = 6; u < sd.len; u += 22) {
    const [x, z] = P2(sd, u, 1.2);
    pole(P, x, z, 9.5);
    if (prev) wires(P, new V3(prev[0], y + 9.0, prev[1]), new V3(x, y + 9.0, z), 3);
    prev = [x, z];
  }
}
// 枯樹林 + 一棟老屋(窗戶還亮著)
function sideForest(ctx, P, sd, y, rng) {
  for (let k = 0; k < sd.len / 4.5; k++) { const [x, z] = P2(sd, rng.range(-8, sd.len + 8), rng.range(3, 26)); tree(ctx, rng.pick(['oak', 'gnarl', 'snag', 'poplar']), x, y, z, rng.range(0.9, 1.5), rng() * TAU, false); }
  for (let k = 0; k < sd.len / 3.5; k++) { const [x, z] = P2(sd, rng.range(-5, sd.len + 5), rng.range(2.5, 18)); shrub(ctx, x, y, z, rng.range(0.8, 1.6)); }
  const [hx, hz] = P2(sd, sd.len * 0.36, 16);
  const [x0, z0, x1, z1] = [hx - 5, hz - 4, hx + 5, hz + 4];
  building(P, x0, z0, x1, z1, 6.4, sd.front, 1, rng, { roofStuff: false });
  P.add('rust', new THREE.CylinderGeometry(0.01, 6.6, 3, 4, 1).rotateY(Math.PI / 4).scale(1.05, 1, 0.82), M(hx, y + 6.4 + 1.5, hz));
}
// 街道:人行道、車道標線、熄滅的路燈、棄置/燒毀的車、對面騎樓店面
function sideStreet(ctx, P, sd, y, rng, { cars = 4, lamps = 'dead' } = {}) {
  const L2 = sd.len;
  const strip3 = (v0, v1, key, h) => { const [x0, z0, x1, z1] = RECT(sd, -20, v0, L2 + 20, v1); P.add(key, box(x1 - x0, h, z1 - z0), M((x0 + x1) / 2, y + h / 2 - (h < 0.05 ? h / 2 : 0), (z0 + z1) / 2)); };
  strip3(0.6, 3.2, 'po_curb', 0.15);
  strip3(3.2, 12.2, 'po_road', 0.02);
  strip3(12.2, 15.0, 'po_curb', 0.15);
  const [ax, az] = P2(sd, -10, 7.7), [bx, bz] = P2(sd, L2 + 10, 7.7);
  dashed(P, BAND.yellow, ax, az, bx, bz, 0.14, 3, 3, { y: y + 0.015 });
  for (const v of [3.6, 11.8]) { const [cx, cz] = P2(sd, -10, v), [dx, dz] = P2(sd, L2 + 10, v); line(P, BAND.white, cx, cz, dx, dz, 0.12, { y: y + 0.015 }); }
  for (let k = 0; k < L2 / 12; k++) { const a = P2(sd, rng() * L2, rng.range(4, 11.5)), b = P2(sd, rng() * L2, rng.range(4, 11.5)); strip(P, BAND.tar, [a, b], 0.2, { us: 3, y: y + 0.014 }); }
  for (let k = 0; k < L2 / 8; k++) { const [x, z] = P2(sd, rng.range(-10, L2 + 10), rng.range(4, 11.5)); puddle(P, rng, x, z, rng.range(0.6, 1.5), 1.6, 0.9, y + 0.012); }
  let i = 0;
  for (let u = -6; u < L2 + 6; i++) {
    const len = rng.range(10, 18);
    const [x0, z0, x1, z1] = RECT(sd, u, 15.5, u + len, 26);
    building(P, x0, z0, x1, z1, rng.range(8, 16), sd.front, i % 3, rng, { shop: i * 2 + (sd.front.length) });
    u += len + rng.range(0.4, 3);
  }
  for (let u = 4; u < L2; u += 18) { const [x, z] = P2(sd, u, 2.2); lamp(ctx, x, y + 0.15, z, Math.atan2(-sd.N[1], sd.N[0]), lamps === 'mixed' && u % 36 < 18 ? 'flicker' : 'dead', { kind: 'tall' }); }
  for (let k = 0; k < cars; k++) {
    const u = (k + 0.5) * L2 / cars + rng.range(-4, 4), burnt = rng() < 0.4, lane = rng() < 0.5 ? 5.6 : 9.8;
    const [x, z] = P2(sd, u, lane);
    placeVehicle(ctx, { x, y, z, sx: sd.axis === 'EW' ? 4 : 2, sz: sd.axis === 'EW' ? 2 : 4, axis: sd.axis, levelIndex: 1 }, rng() < 0.5 ? 'sedan' : 'hatch', {
      noCollide: true, yawJitter: rng.range(-0.3, 0.3), ...(burnt ? { paint: 'po_paint_burnt', brokenP: 1, rearP: 1, flats: [1, 1, 1, 1], crack: false } : { open: [rng.range(0.4, 1.1), 0, 0, 0], brokenP: 0.3 }),
      ground: burnt ? (GP) => groundDecal(GP, 'burn', 0, 0, 5.4, 3.2, 0, 0.012) : null,
    });
  }
}
// 醫院南側:疏散車潮塞在封鎖的路上、檢查站延伸、哨塔探照燈(只在醫院地圖)
function hospitalSouth(ctx, P, sd, y, rng, MW) {
  const sz0 = sd.o[1] + 0.6;
  P.add('po_road', box(8, 0.02, 2.6), M(60, y, sz0 + 1.3)); // 封鎖柵門外的車道(接到停車場出口)
  for (const [x, lane, paint] of [[18, 1, null], [30, -1, 'po_paint_burnt'], [44, 1, null], [78, 1, null], [92, -1, null], [106, 1, null]]) {
    placeVehicle(ctx, { x, y, z: sz0 + 7.1 + lane * 2.1, sx: 4, sz: 2, axis: 'EW', levelIndex: 1 }, rng.pick(['sedan', 'hatch', 'van', 'sedan']), {
      noCollide: true, yawJitter: rng.range(-0.08, 0.08), flip: lane < 0, open: paint ? [0, 0, 0, 0] : [rng.range(0.6, 1.2), rng() < 0.4 ? rng.range(0.5, 1) : 0, rng() < 0.5 ? rng.range(0.6, 1.1) : 0, 0], ...(paint ? { paint, brokenP: 1, flats: [1, 1, 1, 1] } : { brokenP: 0.25 }),
      decorate: (car) => { if (!paint && rng() < 0.6) { const yy = car.roofY(-0.4) + 0.05; car.P.add(rng.pick(['po_suitcase', 'po_suitcase2', 'po_tarp']), rbox(0.9, 0.35, 0.7, 0.05), M(-0.4, yy + 0.18, 0, 0, rng.range(-0.2, 0.2), 0)); } },
      ground: (GP) => { litter(GP, rng, 0, 1.8 * (lane > 0 ? -1 : 1), 1.2, 4, ['flyer', 'news', 'bag', 'missing']); },
    });
  }
  canopy(ctx, 60, y, sz0 + 7.2, HALF + 0.04);
  for (let k = 0; k < 3; k++) jersey(ctx, 66.5 + k * 2.1, y, sz0 + 3.2, 0);
  sandbagWall(ctx, 52, y, sz0 + 3.0, 56, sz0 + 3.0, 3, rng);
  searchlight(ctx, 72.5, y + 4.2, sz0 + 3.6);
  for (let k = 0; k < 4; k++) jersey(ctx, MW + 4.6 + k * 2.1, y, sd.o[1] + 4, 0); // 東街南端的拒馬
}

export function dressEdges(ctx) { for (const _ of dressEdgesSteps(ctx)) { /* 同步跑完 */ } }
// [perf] 分段版:每一側之後 yield(載入時分時執行)
export function* dressEdgesSteps(ctx) {
  initEdges();
  const rng = mkRng(424242), P = new Parts();
  const L = ctx.L, gLi = groundLevel(L), y = L.levels[gLi].y;
  const MW = L.W * L.CELL, MH = L.H * L.CELL;
  const hospital = L.zones.some((z) => z.id === 'f1_parking' && JSON.stringify(z.rects) === '[[1,38,58,48]]');
  const sides = SIDE_DEF(MW, MH);
  for (const k of ['N', 'W', 'E', 'S']) {
    const sd = sides[k], type = sideType(L, gLi, k);
    if (type === 'street') sideStreet(ctx, P, sd, y, rng, { cars: hospital && k === 'S' ? 0 : 3, lamps: k === 'S' ? 'mixed' : 'dead' });
    else if (hospital && k === 'W') sideForest(ctx, P, sd, y, rng);
    else sideBacks(ctx, P, sd, y, rng);
    yield;
  }
  if (hospital) { hospitalSouth(ctx, P, sides.S, y, rng, MW); yield; }
  put(ctx, P, 0, 0, 0);
}
