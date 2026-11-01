import * as THREE from 'three';
import { registerMat } from '../../materials.js';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, beam, tube, sagLine, extrude, keepUV, pool, dyn, put, solid, animate, animPool, startLoop, V3, HALF, TAU, lerp, clamp, hash } from './kit.js';
import { decalUV, labelUV, canvas, tex } from './mats.js';
import { labelQuad } from './cars.js';
import { bindModel } from './gltf.js';

// 工業類大型障礙物與機械:子母車、運轉中的發電機組、磚造焚化爐、頂樓水塔、冷氣主機。
// 也提供地下工業房間用的機械零件(管線、閥門、配電箱、棧板、油桶…)。

// 貼在平面上的貼花(局部座標:中心 c、法線方向 n 為 'x+'|'x-'|'z+'|'z-'|'y+')
export function flatDecal(P, name, cx, cy, cz, w, h, face = 'z+', rot = 0) {
  const [u, v, uw, vh] = decalUV(name);
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh);
  g.rotateZ(rot);
  if (face === 'z-') g.rotateY(Math.PI);
  else if (face === 'x+') g.rotateY(HALF);
  else if (face === 'x-') g.rotateY(-HALF);
  else if (face === 'y+') g.rotateX(-HALF);
  g.translate(cx, cy, cz);
  P.add('po_decal', keepUV(g));
}
export function flatLabel(P, name, cx, cy, cz, w, h, face = 'z+') {
  const g = labelQuad(name, w, h);
  if (face === 'z-') g.rotateY(Math.PI);
  else if (face === 'x+') g.rotateY(HALF);
  else if (face === 'x-') g.rotateY(-HALF);
  g.translate(cx, cy, cz);
  P.add('po_label', g);
}

// ---------- 垃圾袋(Poly Haven 模型;備援為程式生成的鼓脹袋子)----------
export function bagFallback(key = 'po_bag_black', s = 1) {
  const P = new Parts();
  const g = new THREE.SphereGeometry(0.27, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.08 * Math.sin(x * 23 + y * 17) + 0.06 * Math.sin(z * 29 - y * 11) + 0.035 * Math.sin(x * 61 + z * 47);
    p.setXYZ(i, x * n, (y < 0 ? y * 0.85 : y * 1.05) * n + 0.24, z * n);
  }
  g.computeVertexNormals();
  g.scale(s, s, s);
  P.add(key, g);
  P.add(key, cyl(0.02, 0.06, 0.1, 8), M(0, 0.55 * s, 0, 0, 0, 0, s));
  P.add(key, tor(0.03, 0.012, 5, 10), M(0, 0.62 * s, 0, 0.4, 0, 0, s));
  return P;
}
// 寫實模型一個 4.5k 三角形:只給前 12 個(子母車裡、主要垃圾堆),其餘用程式袋子(~300 三角形)
const bagN = new WeakMap();
export function trashBag(ctx, x, y, z, yaw = 0, s = 1, tilt = [0, 0]) {
  const n = (bagN.get(ctx) || 0) + 1;
  bagN.set(ctx, n);
  const hi = n <= 12;
  const p = pool(ctx, hi ? 'trashbag' : 'trashbag_lo', () => bagFallback(), 64);
  if (hi) bindModel(p, 'trashbag', [], { origin: 'base' });
  p.add(M(x, y, z, tilt[0], yaw, tilt[1], s, s * (0.85 + hash(x * 7 + z) * 0.3), s));
}

// ---------- 子母車(綠色鐵製垃圾子車):本地 X 長、Z 深,斜面朝 +Z ----------
function dumpsterParts(lidOpen, rng) {
  const P = new Parts(), L = 3.3, zb = -0.78, zf = 0.55, zt = 0.86, y0 = 0.16, y1 = 1.28, T = 0.03;
  const side = [[zb, y0], [zf, y0], [zt, y1], [zb - 0.04, y1 + 0.02]];
  for (const s of [-1, 1]) P.add('metal_green', extrude(side, T).rotateY(HALF), M(s * (L / 2 - T / 2), 0, 0)); // 兩端梯形板(擠出方向 x)
  P.add('metal_green', box(L, T, zf - zb), M(0, y0, (zb + zf) / 2)); // 底板
  P.add('metal_green', box(L, y1 - y0 + 0.02, T), M(0, (y0 + y1) / 2 + 0.01, zb - 0.02)); // 背板
  const fl = Math.hypot(zt - zf, y1 - y0), fa = Math.atan2(zt - zf, y1 - y0);
  P.add('metal_green', box(L, fl, T), M(0, (y0 + y1) / 2, (zf + zt) / 2, -fa, 0, 0)); // 斜前板
  // 上緣捲邊、加強肋、叉車套管、腳輪
  P.add('metal_green', tube([new V3(-L / 2, y1 + 0.02, zb - 0.04), new V3(L / 2, y1 + 0.02, zb - 0.04)], 0.03, { radial: 6, seg: 2 }));
  P.add('metal_green', tube([new V3(-L / 2, y1, zt), new V3(L / 2, y1, zt)], 0.03, { radial: 6, seg: 2 }));
  for (let k = 0; k < 5; k++) {
    const x = -L / 2 + 0.35 + k * ((L - 0.7) / 4);
    P.add('metal_green', box(0.08, fl, 0.05), M(x, (y0 + y1) / 2, (zf + zt) / 2 + 0.025, -fa, 0, 0));
    P.add('metal_green', box(0.08, y1 - y0, 0.05), M(x, (y0 + y1) / 2, zb - 0.05));
  }
  for (const s of [-1, 1]) {
    P.add('metal_green', box(0.14, 0.12, 1.1), M(s * (L / 2 + 0.06), 0.62, -0.1)); // 叉車套管
    P.add('po_gap', box(0.1, 0.08, 1.12), M(s * (L / 2 + 0.07), 0.62, -0.1));
    P.add('metal_green', box(0.1, 0.5, 0.1), M(s * (L / 2 + 0.03), 0.9, zb + 0.1));
  }
  for (const [x, z] of [[-L / 2 + 0.25, zb + 0.2], [L / 2 - 0.25, zb + 0.2], [-L / 2 + 0.25, zf - 0.15], [L / 2 - 0.25, zf - 0.15]]) {
    P.add('cast_iron', box(0.12, 0.05, 0.12), M(x, y0 - 0.03, z));
    P.add('rubber', cyl(0.06, 0.06, 0.05, 12).rotateX(HALF), M(x + 0.03, 0.06, z));
  }
  // 兩片蓋子(黑色塑膠,鉸鏈在背側上緣)
  const lidW = L / 2 - 0.04, lidD = zt - zb + 0.08;
  for (const [i, open] of [[0, 0.04], [1, lidOpen]]) {
    const x = (i ? 1 : -1) * (lidW / 2 + 0.02);
    const g = rbox(lidW, 0.05, lidD, 0.02).translate(0, 0.025, lidD / 2);
    P.add('plastic_black', g, M(x, y1 + 0.04, zb - 0.06, -open + Math.atan2(0.02, lidD), 0, 0));
    P.add('plastic_black', box(lidW * 0.9, 0.03, 0.05), M(x, y1 + 0.06, zb - 0.06 + Math.cos(open) * 0.3, -open, 0, 0).multiply(M(0, 0, 0.3)));
  }
  // 鏽痕與塗鴉
  for (let k = 0; k < 4; k++) flatDecal_(P, 'rustrun', -L / 2 + 0.4 + k * 0.8 + rng() * 0.3, 0.75, zb - 0.07, 0.5, 0.9, 'z-');
  // 前斜面的鏽斑、污漬與塗鴉
  const frontDecal = (name, x, t, w, h) => { const y = lerp(y0, y1, t), z = lerp(zf, zt, t) + 0.032; const [u, v, uw, vh] = decalUV(name); const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u + uv.getX(i) * uw, v + uv.getY(i) * vh); g.rotateX(-fa).translate(x, y, z); P.add('po_decal', keepUV(g)); };
  frontDecal('rustrun', -0.9 + rng() * 0.4, 0.55, 0.6, 0.9);
  frontDecal('rust', 1.1, 0.25, 0.7, 0.5);
  frontDecal(rng() < 0.5 ? 'g_eye' : 'g_tally', 0.2, 0.55, 0.6, 0.6);
  frontDecal('stain2', -0.3, 0.3, 0.9, 0.6);
  return P;
}
function flatDecal_(P, ...a) { flatDecal(P, ...a); }
export function dumpster(ctx, o, zone) {
  const rng = ctx.rng, yaw = o.axis === 'NS' ? HALF : 0;
  const open = rng.range(0.6, 1.1);
  const P = dumpsterParts(open, rng);
  // 裡面的垃圾袋(從半開的蓋子露出)與外面散落
  const g = put(ctx, P, o.x, o.y, o.z, yaw);
  const local = (lx, lz) => new V3(lx, 0, lz).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(o.x, o.y, o.z));
  for (let k = 0; k < 5; k++) { const p = local(rng.range(0.2, 1.4), rng.range(-0.5, 0.4)); trashBag(ctx, p.x, o.y + 0.9 + rng.range(0, 0.25), p.z, rng.range(0, 6), rng.range(0.9, 1.2), [rng.range(-0.4, 0.4), rng.range(-0.4, 0.4)]); }
  void g; void zone;
  solid(ctx, o.x, o.y, o.z, yaw ? 1.8 : 3.6, 1.4, yaw ? 3.6 : 1.8, 'metal');
}

// ---------- 運轉中的發電機組 ----------
registerMat('po_gen_yellow', [0xb8901e, 0.55, 0.3]);
function genCanopy() {
  const P = new Parts(), L = 3.1, H = 1.45, D = 1.18, y0 = 0.42;
  P.add('po_gen_yellow', rbox(L, H, D, 0.03), M(0, y0 + H / 2, 0));
  // 側面百葉、門縫、門把
  for (const s of [-1, 1]) {
    for (let d = 0; d < 3; d++) {
      const x = -L / 2 + 0.55 + d * 1.0;
      P.add('po_gap', box(0.004, H - 0.16, 0.006), M(x - 0.45, y0 + H / 2, s * (D / 2 + 0.001)));
      for (let k = 0; k < 7; k++) P.add('rubber', box(0.62, 0.035, 0.03), M(x, y0 + 0.35 + k * 0.08, s * (D / 2 + 0.012), s * 0.6, 0, 0));
      P.add('chrome', rbox(0.04, 0.12, 0.03, 0.01), M(x + 0.36, y0 + H * 0.55, s * (D / 2 + 0.02)));
    }
    flatLabel(P, 'gen_plate', 0.9, y0 + H - 0.22, s * (D / 2 + 0.003), 0.36, 0.18, s > 0 ? 'z+' : 'z-');
    flatLabel(P, 'hv', -0.9, y0 + H - 0.22, s * (D / 2 + 0.003), 0.3, 0.15, s > 0 ? 'z+' : 'z-');
  }
  // 散熱端(-X):水箱格柵
  P.add('rubber', box(0.02, H - 0.2, D - 0.2), M(-L / 2 - 0.005, y0 + H / 2, 0));
  for (let k = 0; k < 12; k++) P.add('metal_gray', box(0.03, 0.025, D - 0.2), M(-L / 2 - 0.02, y0 + 0.16 + k * 0.1, 0));
  // 控制端(+X):打開的控制面板門
  P.add('rubber', box(0.02, 0.6, 0.7), M(L / 2 + 0.005, y0 + H - 0.5, 0));
  P.add('po_label', labelQuad('panel', 0.62, 0.55).rotateY(HALF), M(L / 2 + 0.018, y0 + H - 0.5, 0));
  for (const [z, n] of [[-0.18, 'gauge'], [0.18, 'gauge2']]) P.add('po_label', labelQuad(n, 0.12, 0.12).rotateY(HALF), M(L / 2 + 0.02, y0 + H - 0.2, z));
  P.add('po_gen_yellow', box(0.7, 0.62, 0.025), M(L / 2 + 0.33, y0 + H - 0.5, 0.36, 0, -1.2, 0));
  // 車頂:排氣消音器、吊環、排氣管(含防雨蓋)
  P.add('steel', cyl(0.16, 0.16, 0.9, 14).rotateZ(HALF), M(0.4, y0 + H + 0.18, 0.2));
  for (const x of [0, 0.8]) P.add('cast_iron', box(0.06, 0.16, 0.25), M(x, y0 + H + 0.08, 0.2));
  P.add('steel', tube([new V3(0.85, y0 + H + 0.18, 0.2), new V3(0.97, y0 + H + 0.2, 0.2), new V3(1.0, y0 + H + 0.32, 0.2), new V3(1.0, y0 + H + 1.0, 0.2)], 0.065, { radial: 12, seg: 12 }));
  P.add('rust', cyl(0.075, 0.075, 0.3, 12), M(1.0, y0 + H + 0.85, 0.2));
  P.add('rust', cyl(0.085, 0.085, 0.012, 12), M(1.0, y0 + H + 1.02, 0.25, 0.7, 0, 0)); // 防雨蓋
  for (const [x, z] of [[-1.4, -0.5], [1.4, -0.5], [-1.4, 0.5], [1.4, 0.5]]) P.add('steel', tor(0.05, 0.012, 6, 12), M(x, y0 + H + 0.05, z));
  flatDecal(P, 'soot', 0.9, y0 + H + 0.005, 0.2, 0.9, 0.7, 'y+');
  return P;
}
function genBase() {
  const P = new Parts(), L = 3.3, D = 1.24;
  P.add('metal_gray', rbox(L, 0.34, D, 0.02), M(0, 0.25, 0)); // 底油箱
  for (const z of [-0.52, 0.52]) P.add('cast_iron', box(L + 0.1, 0.08, 0.14), M(0, 0.04, z));
  P.add('cast_iron', cyl(0.06, 0.06, 0.05, 12), M(1.2, 0.44, 0.5));
  P.add('plastic_red', cyl(0.05, 0.05, 0.04, 12), M(1.2, 0.48, 0.5)); // 油箱蓋
  flatDecal(P, 'oil', 0, 0.003, 0, 4, 2.4, 'y+');
  return P;
}
// 煙霧貼圖(柔邊圓)
let smokeTex = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(180,180,180,0.55)'); g.addColorStop(0.5, 'rgba(150,150,150,0.25)'); g.addColorStop(1, 'rgba(120,120,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  smokeTex = tex(c, { repeat: false });
  return smokeTex;
}
export function generator(ctx, o, zone) {
  const yaw = o.axis === 'NS' ? HALF : 0;
  put(ctx, genBase(), o.x, o.y, o.z, yaw);
  // 機殼:動態物件(微幅震動)
  const canopy = genCanopy().group();
  canopy.position.set(o.x, o.y, o.z);
  canopy.rotation.y = yaw;
  ctx.add(canopy, { static: false });
  const mesh0 = canopy.children[0];
  animate(mesh0, (t) => {
    canopy.position.set(o.x + Math.sin(t * 157) * 0.0012, o.y + Math.sin(t * 211) * 0.0015, o.z + Math.cos(t * 173) * 0.0012);
    canopy.updateMatrixWorld(true);
  });
  // 排氣煙(幾片會上升淡出的煙霧)
  const ex = new V3(0.97, 0.42 + 1.45 + 1.0, 0.2).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(o.x, o.y, o.z));
  const sm = new THREE.SpriteMaterial({ map: smokeTexture(), color: 0x6a6a6a, transparent: true, depthWrite: false, opacity: 0.5 });
  const puffs = [];
  for (let k = 0; k < 5; k++) { const s = new THREE.Sprite(sm.clone()); s.position.copy(ex); s.userData.ph = k / 5; ctx.add(s, { static: false }); puffs.push(s); }
  animate(mesh0, (t) => {
    for (const s of puffs) {
      const ph = (t * 0.35 + s.userData.ph) % 1;
      s.position.set(ex.x + ph * 0.6 + Math.sin(t + s.userData.ph * 9) * 0.1, ex.y + ph * 2.6, ex.z + ph * 0.3);
      const sc = 0.25 + ph * 1.4;
      s.scale.set(sc, sc, sc);
      s.material.opacity = 0.42 * (1 - ph) * Math.min(1, ph * 6);
    }
  });
  // 配電箱(立架)+ 電纜:發電機 → 配電箱 → 沿地面拉到建築的破窗
  const L = ctx.L, C = L.CELL;
  const local = (lx, ly, lz) => new V3(lx, ly, lz).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(o.x, o.y, o.z));
  const P = new Parts();
  const bx = local(-1.0, 0, -1.25);
  P.add('metal_gray', box(0.62, 0.9, 0.3), M(bx.x, o.y + 1.05, bx.z));
  P.add('metal_gray', box(0.6, 0.86, 0.02), M(bx.x + 0.42, o.y + 1.05, bx.z + 0.3, 0, -1.0, 0));
  P.add('po_label', labelQuad('panel', 0.5, 0.5), M(bx.x, o.y + 1.1, bx.z + 0.152));
  P.add('po_label', labelQuad('hv', 0.3, 0.15), M(bx.x + 0.42 + 0.21, o.y + 1.3, bx.z + 0.3 + 0.17 - 0.012, 0, -1.0, 0));
  for (const dx of [-0.25, 0.25]) P.add('cast_iron', box(0.05, 0.62, 0.05), M(bx.x + dx, o.y + 0.31, bx.z));
  // 找最近的窗(或門)把電纜拉進建築
  let target = null, best = 1e9;
  const li = o.levelIndex, c0 = Math.floor(o.x / C), r0 = Math.floor(o.z / C);
  for (let r = r0; r < r0 + 8; r++) for (let c = c0 - 6; c <= c0 + 6; c++) {
    const ch = L.charAt(li, c, r);
    if (ch !== 'W' && ch !== '+') continue;
    const d = Math.hypot(c - c0, r - r0);
    if (d < best) { best = d; target = { c, r, ch }; }
  }
  const cab = (a, b, sag = 0.02, r = 0.022) => P.add('rubber', tube([a, ...sagLine(a, b, sag, 6).slice(1, -1), b], r, { radial: 6 }));
  const gOut = local(1.62, 0.9, 0.3);
  const onG = (v) => new V3(v.x, o.y + 0.03, v.z);
  cab(gOut, local(1.7, 0.03, 0.4), 0.05);
  cab(local(1.7, 0.03, 0.4), onG(local(1.5, 0, -1.0)), 0.0, 0.022);
  cab(onG(local(1.5, 0, -1.0)), new V3(bx.x + 0.1, o.y + 0.6, bx.z + 0.1), 0.05);
  if (target) {
    const wz = target.r * C - 0.02, wx = (target.c + 0.5) * C;
    const pts = [new V3(bx.x - 0.1, o.y + 0.62, bx.z + 0.1), new V3(bx.x - 0.2, o.y + 0.03, bx.z - 0.2)];
    const mid = new V3((bx.x + wx) / 2 + 0.4, o.y + 0.03, (bx.z + wz) / 2);
    pts.push(mid, new V3(wx + 0.3, o.y + 0.03, wz - 0.1), new V3(wx + 0.3, o.y + 0.5, wz - 0.03), new V3(wx + 0.2, o.y + (target.ch === 'W' ? L.WINDOW_SILL + 0.05 : 0.05), wz - 0.02), new V3(wx + 0.1, o.y + (target.ch === 'W' ? L.WINDOW_SILL + 0.02 : 0.03), wz + 0.6));
    P.add('rubber', tube(pts, 0.03, { radial: 6, tension: 0.3 }));
    const pts2 = pts.map((p, i) => (i > 0 && i < pts.length - 1 ? p.clone().add(new V3(0.12, 0, 0.05)) : p.clone().add(new V3(0.06, 0, 0))));
    P.add('po_cable', tube(pts2, 0.018, { radial: 5, tension: 0.3 }));
  }
  // 工作燈(三腳架 LED 投光燈)朝建築
  const wl = local(1.9, 0, -1.6);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; P.add('cast_iron', rod(new V3(wl.x + Math.cos(a) * 0.5, o.y, wl.z + Math.sin(a) * 0.5), new V3(wl.x, o.y + 1.3, wl.z), 0.015, 5)); }
  P.add('steel', rod(new V3(wl.x, o.y + 1.3, wl.z), new V3(wl.x, o.y + 1.9, wl.z), 0.02, 6));
  P.add('cast_iron', box(0.6, 0.04, 0.04), M(wl.x, o.y + 1.92, wl.z, 0, yaw, 0));
  for (const s of [-1, 1]) {
    const hp = new V3(s * 0.22, 0, 0).applyAxisAngle(new V3(0, 1, 0), yaw).add(wl);
    P.add('cast_iron', rbox(0.26, 0.2, 0.08, 0.02), M(hp.x, o.y + 2.02, hp.z, -0.5, yaw + Math.PI, 0));
    P.add('po_bulb', box(0.22, 0.16, 0.01), M(hp.x, o.y + 2.0, hp.z, -0.5, yaw + Math.PI, 0).multiply(M(0, 0, 0.045)));
  }
  cab(new V3(wl.x, o.y + 1.5, wl.z), onG(wl.clone().add(new V3(0.3, 0, 0.3))), 0.0, 0.012);
  put(ctx, P, 0, 0, 0);
  // 光源與音效
  ctx.light({ x: wl.x, y: o.y + 2.0, z: wl.z - 0.4, color: 0xffb060, intensity: 14, distance: 15, kind: 'work', flicker: 0.12, zone: zone?.id });
  const gp = { x: o.x, y: o.y + 1, z: o.z };
  startLoop('gen', 'generator', gp);
  ctx.event({ kind: 'generator', x: o.x, y: o.y, z: o.z, zone: zone?.id });
  solid(ctx, o.x, o.y, o.z, yaw ? 1.3 : 3.4, 2.0, yaw ? 3.4 : 1.3, 'heavy');
  solid(ctx, bx.x, o.y, bx.z, 0.7, 1.5, 0.4, 'metal');
}

// ---------- 磚造焚化爐(高煙囪、鐵門、灰燼)----------
export function incinerator(ctx, o, zone) {
  const P = new Parts(), S = 3.5, H = 2.5;
  P.add('brick', box(S, H, S), M(0, H / 2, 0));
  P.add('concrete', box(S + 0.16, 0.12, S + 0.16), M(0, H + 0.06, 0));
  P.add('brick', box(S * 0.7, 0.6, S * 0.7), M(0, H + 0.42, 0));
  P.add('concrete', box(S + 0.3, 0.15, S + 0.5), M(0, 0.075, 0.1));
  // 煙囪(錐形、鋼箍、頂蓋)
  const ch = new THREE.CylinderGeometry(0.42, 0.56, 9.5, 4, 1).rotateY(Math.PI / 4);
  P.add('brick', ch, M(-0.6, H + 0.7 + 4.75, -0.6));
  for (let k = 0; k < 6; k++) { const y = H + 1.5 + k * 1.45, r = lerp(0.56, 0.42, (y - H - 0.7) / 9.5) * 1.42 + 0.01; P.add('rust', new THREE.CylinderGeometry(r, r, 0.06, 4, 1, true).rotateY(Math.PI / 4), M(-0.6, y, -0.6)); }
  P.add('concrete', box(0.75, 0.12, 0.75), M(-0.6, H + 0.7 + 9.56, -0.6));
  P.add('po_soot', box(0.5, 0.02, 0.5), M(-0.6, H + 0.7 + 9.63, -0.6));
  // 爐門(+Z 面):鑄鐵門 + 鉸鏈 + 門閂;下方灰門半開
  const fz = S / 2 + 0.01;
  P.add('rust', box(1.25, 0.1, 0.12), M(0, 1.52, fz + 0.03));
  P.add('cast_iron', rbox(0.95, 0.75, 0.06, 0.015), M(0, 1.05, fz + 0.03));
  for (let k = 0; k < 3; k++) P.add('cast_iron', box(0.85, 0.04, 0.02), M(0, 0.78 + k * 0.27, fz + 0.065));
  for (const y of [0.8, 1.3]) P.add('rust', box(0.18, 0.06, 0.04), M(-0.52, y, fz + 0.04));
  P.add('steel', rod(new V3(0.3, 1.05, fz + 0.09), new V3(0.55, 1.05, fz + 0.09), 0.015, 6));
  P.add('cast_iron', box(0.6, 0.32, 0.04), M(0.08, 0.32, fz + 0.18, -0.9, 0, 0));
  P.add('po_soot', box(0.56, 0.3, 0.02), M(0, 0.32, fz - 0.005));
  // 灰燼堆、煤灰痕
  const ash = new THREE.SphereGeometry(0.8, 14, 8, 0, TAU, 0, Math.PI / 2);
  P.add('po_ash', ash, M(0.1, 0.12, fz + 0.75, 0, 0, 0, 1, 0.25, 0.7));
  flatDecal(P, 'soot', 0, 1.9, fz + 0.002, 1.6, 1.4, 'z+');
  flatDecal(P, 'soot', 0, 0.5, fz + 0.002, 1.0, 0.8, 'z+');
  flatDecal(P, 'ashes', 0.1, 0.152, fz + 1.2, 2.2, 1.6, 'y+');
  P.add('po_label', labelQuad('flamm', 0.5, 0.25), M(1.1, 1.75, fz + 0.005));
  // 斜靠的鏟子與醫療廢棄物袋
  P.add('wood_old', rod(new V3(1.35, 0.15, fz + 0.12), new V3(1.5, 1.45, fz + 0.03), 0.02, 6));
  P.add('rust', box(0.22, 0.02, 0.28), M(1.33, 0.2, fz + 0.15, -1.3, 0, 0.1));
  for (let k = 0; k < 3; k++) P.merge(bagFallback(k % 2 ? 'po_bag_red' : 'po_bag_yellow', 0.85), M(-1.3 + k * 0.3, 0.15 + (k === 2 ? 0.32 : 0), fz + 0.5 + k * 0.05, 0.1 * k, k, 0.2 * k));
  const yaw = o.yaw ?? HALF;
  put(ctx, P, o.x, o.y, o.z, yaw);
  solid(ctx, o.x, o.y, o.z, S + 0.2, H + 0.8, S + 0.2, 'stone');
  const cp = new V3(-0.6, 0, -0.6).applyAxisAngle(new V3(0, 1, 0), yaw);
  solid(ctx, o.x + cp.x, o.y, o.z + cp.z, 0.9, 12.8, 0.9, 'stone');
  ctx.event({ kind: 'incinerator', x: o.x, y: o.y, z: o.z, zone: zone?.id });
}


// 圓柱面貼花(水塔、桶身):中心角 a、高 y、寬 w(弧長)、高 h、半徑 r
export function cylDecal(P, name, cx, cz, r, a, y, w, h) {
  const [u, v, uw, vh] = decalUV(name);
  const n = 6, pos = [], uvs = [];
  const pt = (i, j) => { const ang = a + ((i / n) - 0.5) * (w / r); return new V3(cx + Math.cos(ang) * (r + 0.006), y + (j - 0.5) * h, cz + Math.sin(ang) * (r + 0.006)); };
  for (let i = 0; i < n; i++) {
    const a0 = pt(i, 0), a1 = pt(i, 1), b0 = pt(i + 1, 0), b1 = pt(i + 1, 1);
    const U0 = u + (1 - i / n) * uw, U1 = u + (1 - (i + 1) / n) * uw;
    pos.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z, a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
    uvs.push(U0, v, U1, v + vh, U1, v, U0, v, U0, v + vh, U1, v + vh);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  P.add('po_decal', keepUV(g));
}

// ---------- 頂樓鐵製水塔:角鐵支架 + 交叉斜撐 + 圓桶 + 爬梯 + 出水管 ----------
export function waterTower(ctx, o, zone) {
  const rng = ctx.rng, P = new Parts();
  const legH = 1.9, top = 0.92, bot = 1.22, R = 1.12, TH = 2.1, ty = legH + 0.12;
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of corners) {
    const a = new V3(sx * bot, 0.12, sz * bot), b = new V3(sx * top, legH, sz * top);
    P.add('rust', beam(a, b, 0.1, 0.012, new V3(1, 0, 0)), M(0, 0, -sz * 0.045));
    P.add('rust', beam(a, b, 0.1, 0.012, new V3(0, 0, 1)), M(-sx * 0.045, 0, 0));
    P.add('concrete', box(0.4, 0.12, 0.4), M(a.x, 0.06, a.z));
    P.add('rust', box(0.26, 0.02, 0.26), M(a.x, 0.13, a.z));
  }
  for (let k = 0; k < 4; k++) { // 四面:水平繫樑 + X 斜撐
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
    const at = (c, y) => { const f = lerp(bot, top, (y - 0.12) / (legH - 0.12)); return new V3(c[0] * f, y, c[1] * f); };
    for (const y of [0.75, legH - 0.04]) P.add('rust', beam(at([ax, az], y), at([bx, bz], y), 0.08, 0.012, new V3(0, 1, 0)));
    P.add('rust', rod(at([ax, az], 0.2), at([bx, bz], 0.72), 0.012, 5));
    P.add('rust', rod(at([bx, bz], 0.2), at([ax, az], 0.72), 0.012, 5));
    P.add('rust', rod(at([ax, az], 0.8), at([bx, bz], legH - 0.08), 0.012, 5));
    P.add('rust', rod(at([bx, bz], 0.8), at([ax, az], legH - 0.08), 0.012, 5));
  }
  P.add('metal_gray', box(2.2, 0.06, 2.2), M(0, legH + 0.03, 0));
  for (const s of [-1, 1]) P.add('rust', box(2.2, 0.12, 0.08), M(0, legH - 0.04, s * 0.7));
  // 桶身(焊縫環、錐形頂蓋、人孔、通氣管)
  P.add('metal_gray', cyl(R, R, TH, 28), M(0, ty + TH / 2, 0));
  for (let k = 0; k <= 4; k++) P.add('rust', tor(R + 0.005, 0.012, 4, 36).rotateX(HALF), M(0, ty + 0.05 + k * (TH - 0.1) / 4, 0));
  P.add('metal_gray', lathe([[0, 0.36], [0.12, 0.34], [R + 0.03, 0.03], [R + 0.03, 0]], 28), M(0, ty + TH, 0));
  P.add('rust', cyl(0.28, 0.28, 0.08, 16), M(0.35, ty + TH + 0.22, 0.2, 0, 0, -0.29));
  P.add('rust', rod(new V3(-0.3, ty + TH + 0.2, -0.3), new V3(-0.3, ty + TH + 0.6, -0.3), 0.04, 8));
  P.add('rust', cyl(0.07, 0.04, 0.06, 8), M(-0.3, ty + TH + 0.62, -0.3));
  for (let k = 0; k < 9; k++) { const a = rng() * TAU; cylDecal(P, rng() < 0.7 ? 'rustrun' : 'rust', 0, 0, R, a, ty + TH * rng.range(0.3, 0.85), rng.range(0.4, 0.9), rng.range(0.7, 1.4)); }
  // 爬梯(+Z 面)
  const lz = R + 0.25, ladTop = ty + TH + 0.3;
  for (const s of [-1, 1]) P.add('rust', box(0.04, ladTop, 0.04), M(s * 0.22, ladTop / 2, lz));
  for (let y = 0.3; y < ladTop - 0.1; y += 0.3) P.add('rust', cyl(0.012, 0.012, 0.44, 6).rotateZ(HALF), M(0, y, lz));
  for (const y of [legH + 0.4, ty + TH - 0.2]) for (const s of [-1, 1]) P.add('rust', box(0.03, 0.03, 0.2), M(s * 0.22, y, lz - 0.12));
  // 出水管 + 閘閥(紅色手輪)、溢流管
  const pipe = [new V3(0, ty, 0), new V3(0, 0.35, 0), new V3(0.05, 0.25, 0.1), new V3(-0.2, 0.22, 0.6), new V3(-1.5, 0.22, 1.2), new V3(-2.4, 0.22, 1.2)];
  P.add('rust', tube(pipe, 0.05, { radial: 8, tension: 0.1 }));
  P.add('rust', cyl(0.08, 0.08, 0.18, 10).rotateZ(HALF), M(-0.9, 0.22, 1.06));
  P.add('plastic_red', tor(0.1, 0.012, 5, 16).rotateX(HALF), M(-0.9, 0.42, 1.06));
  P.add('rust', rod(new V3(-0.9, 0.22, 1.06), new V3(-0.9, 0.42, 1.06), 0.012, 5));
  P.add('rust', tube([new V3(R * 0.7, ty + TH - 0.15, R * 0.7), new V3(R * 0.9, ty + TH - 0.2, R * 0.9), new V3(1.3, 1.0, 1.3), new V3(1.32, 0.12, 1.32)], 0.03, { radial: 6 }));
  flatDecal(P, 'water', 1.3, 0.004, 1.4, 1.4, 1.2, 'y+');
  flatDecal(P, 'rust', 0, 0.004, 0, 2.6, 2.6, 'y+');
  put(ctx, P, o.x, o.y, o.z, o.yaw ?? 0);
  solid(ctx, o.x, o.y, o.z, 2.6, ty + TH + 0.4, 2.6, 'metal');
  ctx.event({ kind: 'water_tower', x: o.x, y: o.y, z: o.z, zone: zone?.id });
}

// ---------- 頂樓冷氣主機(箱型冷凝機組:兩組頂吹風扇、鰭片盤管、銅管)----------
function fanBlades() {
  const P = new Parts();
  P.add('cast_iron', cyl(0.06, 0.06, 0.08, 10), M(0, 0, 0));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; P.add('metal_gray', box(0.24, 0.006, 0.11), M(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17, 0, -a, 0.35)); }
  return P;
}
export function acUnit(ctx, o, zone) {
  const rng = ctx.rng, P = new Parts();
  const W = 1.72, H = 1.22, D = 1.5, y0 = 0.16;
  for (const z of [-D / 2 + 0.15, D / 2 - 0.15]) { P.add('cast_iron', box(W + 0.2, 0.1, 0.12), M(0, 0.1, z)); for (const x of [-W / 2, W / 2]) P.add('rubber', box(0.16, 0.05, 0.16), M(x, 0.025, z)); }
  P.add('metal_white', box(W, 0.06, D), M(0, y0 + 0.03, 0));
  P.add('metal_white', box(W, 0.08, D), M(0, y0 + H - 0.04, 0));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P.add('metal_white', box(0.08, H, 0.08), M(x * (W / 2 - 0.04), y0 + H / 2, z * (D / 2 - 0.04)));
  const coil = (cx, cz, w, rot) => { // 鰭片盤管:深色凹面 + 護網
    P.add('rubber', box(w, H - 0.2, 0.02), M(cx, y0 + H / 2, cz, 0, rot, 0));
    for (let k = 0; k < 10; k++) P.add('steel', box(w, 0.006, 0.006), M(cx, y0 + 0.14 + k * 0.1, cz, 0, rot, 0).multiply(M(0, 0, 0.02 * Math.sign(cz + cx || 1))));
    for (let k = 0; k < 8; k++) P.add('steel', box(0.006, H - 0.2, 0.006), M(cx, y0 + H / 2, cz, 0, rot, 0).multiply(M(-w / 2 + (k + 0.5) * (w / 8), 0, 0.02 * Math.sign(cz + cx || 1))));
  };
  coil(0, D / 2 - 0.02, W - 0.16, 0); coil(0, -D / 2 + 0.02, W - 0.16, 0); coil(-W / 2 + 0.02, 0, D - 0.16, HALF);
  P.add('metal_white', box(0.02, H - 0.16, D - 0.16), M(W / 2 - 0.01, y0 + H / 2, 0));
  for (const [y, z] of [[0.3, -0.6], [0.3, 0.6], [1.15, -0.6], [1.15, 0.6]]) P.add('steel', cyl(0.012, 0.012, 0.01, 6).rotateZ(HALF), M(W / 2 + 0.002, y0 + y, z));
  P.add('po_label', labelQuad('hv', 0.3, 0.15).rotateY(HALF), M(W / 2 + 0.002, y0 + H - 0.3, 0.3));
  const fz = [-0.38, 0.38];
  for (const z of fz) {
    P.add('metal_white', new THREE.CylinderGeometry(0.34, 0.36, 0.22, 28, 1, true), M(0, y0 + H + 0.11, z));
    for (let k = 0; k < 3; k++) P.add('steel', tor(0.1 + k * 0.11, 0.004, 3, 28).rotateX(HALF), M(0, y0 + H + 0.22, z));
    for (let k = 0; k < 6; k++) P.add('steel', box(0.7, 0.006, 0.006), M(0, y0 + H + 0.22, z, 0, (k / 6) * Math.PI, 0));
  }
  P.add('rubber', tube([new V3(-W / 2 - 0.02, y0 + 0.5, 0.3), new V3(-W / 2 - 0.15, y0 + 0.45, 0.3), new V3(-W / 2 - 0.2, 0.08, 0.3), new V3(-W / 2 - 0.6, 0.06, 0.32), new V3(-W / 2 - 1.6, 0.06, 0.4)], 0.03, { radial: 6 }));
  P.add('bronze', tube([new V3(-W / 2 - 0.02, y0 + 0.35, 0.45), new V3(-W / 2 - 0.12, y0 + 0.3, 0.45), new V3(-W / 2 - 0.18, 0.06, 0.45), new V3(-W / 2 - 0.6, 0.05, 0.47), new V3(-W / 2 - 1.6, 0.05, 0.55)], 0.012, { radial: 6 }));
  P.add('steel', box(0.05, 1.1, 0.05), M(W / 2 + 0.3, 0.55, -D / 2 + 0.1));
  P.add('metal_gray', box(0.2, 0.3, 0.14), M(W / 2 + 0.3, 1.05, -D / 2 + 0.18));
  P.add('rubber', tube([new V3(W / 2 + 0.3, 0.92, -D / 2 + 0.18), new V3(W / 2 + 0.15, 0.6, -D / 2 + 0.2), new V3(W / 2 + 0.02, y0 + 0.4, -D / 2 + 0.3)], 0.012, { radial: 5 }));
  for (let k = 0; k < 3; k++) flatDecal(P, 'rustrun', rng.range(-0.6, 0.6), y0 + 0.4, D / 2 + 0.035, 0.4, 0.8, 'z+');
  flatDecal(P, 'water', 0, 0.004, 0, 2.2, 2.0, 'y+');
  const yaw = o.yaw ?? (rng.int(0, 3) * HALF);
  put(ctx, P, o.x, o.y, o.z, yaw);
  const fp = animPool(ctx, 'acfan', fanBlades, 16);
  fz.forEach((z, i) => {
    const base = M(o.x, o.y, o.z, 0, yaw, 0).multiply(M(0, y0 + H + 0.12, z));
    const sp = i === 0 && rng.chance(0.6) ? rng.range(0.4, 1.2) : 0, ph = rng() * TAU;
    fp.add(base, (t, m) => m.makeRotationY(ph + t * sp + (sp ? Math.sin(t * 0.7) * 0.4 : 0)));
  });
  solid(ctx, o.x, o.y, o.z, 1.9, y0 + H + 0.25, 1.9, 'metal');
  void zone;
}

export const GALLERY = {
  dumpster: (ctx, o) => { dumpster(ctx, { ...o, sx: 4, sz: 2, axis: 'EW' }); return 1.5; },
  generator: (ctx, o) => { generator(ctx, { ...o, levelIndex: 1, axis: 'EW' }); return 2; },
  incinerator: (ctx, o) => { incinerator(ctx, { ...o, yaw: 0 }); return 4; },
  water_tower: (ctx, o) => { waterTower(ctx, o, null); return 4.5; },
  ac_unit: (ctx, o) => { acUnit(ctx, { ...o, yaw: 0 }, null); return 1.5; },
};
