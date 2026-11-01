import * as THREE from 'three';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, beam, tube, sagLine, keepUV, pool, dyn, put, solid, animate, V3, HALF, TAU, lerp, clamp } from './kit.js';
import { labelUV, decalUV } from './mats.js';
import { groundDecal, labelQuad } from './cars.js';

// 街道設施:路燈(實例池)、警用拒馬 + 封鎖線、路錐/垃圾桶(動態)、長椅、公車亭、旗桿、石碑、停車設施、行李、屍袋…

// ---------- 路燈 ----------
// 高桿(停車場/車道):錐形鋼桿 + 彎臂 + 眼鏡蛇燈頭;矮桿(廣場):燈籠頭
function lampParts(kind, on, glass = null) {
  const P = new Parts();
  const lit = glass || 'po_lamp_glass';
  if (kind === 'tall') {
    P.add('po_pole', cyl(0.055, 0.095, 7.2, 14), M(0, 3.6, 0));
    P.add('po_pole', box(0.36, 0.03, 0.36), M(0, 0.015, 0));
    for (const [x, z] of [[0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]]) P.add('steel', cyl(0.014, 0.014, 0.06, 6), M(x, 0.05, z));
    P.add('po_pole', cyl(0.11, 0.11, 0.5, 14), M(0, 0.25, 0)); // 檢修門段
    P.add('rust', box(0.1, 0.22, 0.012), M(0, 0.4, 0.108));
    P.add('po_pole', tube([new V3(0, 7.0, 0), new V3(0.05, 7.5, 0), new V3(0.5, 7.75, 0), new V3(1.4, 7.8, 0)], 0.045, { radial: 8, seg: 16 }));
    P.add('metal_gray', rbox(0.78, 0.14, 0.32, 0.06), M(1.62, 7.78, 0, 0, 0, -0.06));
    P.add(on ? lit : 'po_lamp_off', rbox(0.5, 0.04, 0.24, 0.03), M(1.66, 7.7, 0, 0, 0, -0.06));
  } else {
    P.add('po_green_paint', cyl(0.05, 0.07, 3.4, 12), M(0, 1.7, 0));
    P.add('po_green_paint', lathe([[0.16, 0], [0.16, 0.12], [0.1, 0.2], [0.075, 0.5], [0.06, 0.55]], 16), M(0, 0, 0));
    P.add('po_green_paint', cyl(0.07, 0.05, 0.08, 12), M(0, 3.42, 0));
    P.add(on ? lit : 'po_lamp_off', lathe([[0.0, 0], [0.12, 0.02], [0.17, 0.25], [0.15, 0.42], [0.0, 0.44]], 12), M(0, 3.46, 0));
    P.add('po_green_paint', lathe([[0.2, 0], [0.18, 0.05], [0.06, 0.16], [0.0, 0.2]], 12), M(0, 3.9, 0));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; P.add('po_green_paint', box(0.015, 0.42, 0.015), M(Math.cos(a) * 0.16, 3.67, Math.sin(a) * 0.16)); }
  }
  return P;
}
// 路燈:回傳燈頭世界座標;on 時登記鈉燈光源
export function streetLamp(ctx, x, y, z, yaw = 0, { kind = 'tall', on = true, flicker = 0, zone = null, glass = null, lean = 0 } = {}) {
  pool(ctx, `lamp_${kind}_${on ? 1 : 0}${glass ? '_' + glass : ''}`, () => lampParts(kind, on, glass), 24).add(M(x, y, z, 0, yaw, lean));
  const hx = kind === 'tall' ? 1.62 : 0, hy = kind === 'tall' ? 7.62 : 3.65;
  const p = new V3(hx, hy, 0).applyAxisAngle(new V3(0, 0, 1), lean).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(x, y, z));
  if (on) ctx.light({ x: p.x, y: p.y - 0.15, z: p.z, color: 0xffa048, intensity: kind === 'tall' ? 22 : 9, distance: kind === 'tall' ? 24 : 12, kind: 'sodium', flicker, zone: zone?.id, glow: kind === 'tall' ? 1.7 : 1.0 });
  solid(ctx, x, y, z, 0.24, kind === 'tall' ? 7.2 : 3.4, 0.24, 'heavy');
  return p;
}
// 被撞彎、倒在車頂的路燈(單件,靜態合併):path 為桿身經過的世界座標點(由下往上,第一點為桿底)
export function bentLamp(ctx, path) {
  const P = new Parts(), b = path[0];
  P.add('po_pole', box(0.36, 0.03, 0.36), M(b.x, b.y + 0.015, b.z));
  P.add('po_pole', cyl(0.11, 0.11, 0.5, 14), M(b.x, b.y + 0.25, b.z, 0.06, 0, 0.05));
  P.add('po_pole', tube(path, 0.07, { radial: 10, seg: 60, tension: 0.2 }));
  P.add('rust', sph(0.1, 10, 8).scale(1.3, 0.7, 1.1), M(path[1].x, path[1].y, path[1].z));
  const tip = path[path.length - 1], pre = path[path.length - 2];
  const dir = new V3().subVectors(tip, pre).normalize();
  const arm = [tip, tip.clone().addScaledVector(dir, 0.4).add(new V3(0, 0.02, 0.15)), tip.clone().addScaledVector(dir, 0.9).add(new V3(0, -0.35, 0.35))];
  P.add('po_pole', tube(arm, 0.04, { radial: 8 }));
  const head = arm[2];
  P.add('metal_gray', rbox(0.78, 0.14, 0.32, 0.06), M(head.x, head.y - 0.2, head.z, 0.5, Math.atan2(-dir.z, dir.x), -1.1));
  P.add('po_gap', rbox(0.5, 0.03, 0.24, 0.02), M(head.x, head.y - 0.26, head.z, 0.5, Math.atan2(-dir.z, dir.x), -1.1));
  P.add('rubber', tube([head.clone().add(new V3(0, -0.1, 0)), head.clone().add(new V3(0.1, -0.8, 0.05)), head.clone().add(new V3(0.15, -1.3, 0.1))], 0.008, { radial: 4 })); // 垂下的電線
  put(ctx, P, 0, 0, 0);
  solid(ctx, b.x, b.y, b.z, 0.3, 1.0, 0.3, 'heavy');
}

// ---------- 警用拒馬(鐵架 + 交叉腳 + 刺絲捲)----------
function barricadeParts() {
  const P = new Parts(), L = 1.9, H = 1.0, D = 0.8;
  for (const s of [-1, 1]) { // 兩端交叉腳(X 形)
    const x = s * (L / 2 - 0.05);
    P.add('cast_iron', beam(new V3(x, 0.02, -D / 2), new V3(x, H, D / 2), 0.05, 0.05));
    P.add('cast_iron', beam(new V3(x, 0.02, D / 2), new V3(x, H, -D / 2), 0.05, 0.05));
    for (const z of [-D / 2, D / 2]) P.add('rubber', box(0.12, 0.02, 0.12), M(x, 0.01, z));
  }
  P.add('cast_iron', box(L, 0.05, 0.05), M(0, H * 0.52, 0)); // 中橫桿
  for (const z of [-0.3, 0.3]) P.add('cast_iron', box(L, 0.04, 0.04), M(0, 0.18, z));
  // 上橫樑:紅白反光條
  for (let k = 0; k < 6; k++) P.add(k % 2 ? 'po_reflect' : 'plastic_red', box(L / 6, 0.14, 0.06), M(-L / 2 + (k + 0.5) * (L / 6), H - 0.05, 0));
  // 刺絲捲(螺旋)
  const pts = [];
  for (let t = 0; t <= 1; t += 1 / 140) { const a = t * TAU * 22; pts.push(new V3(-L / 2 + 0.05 + t * (L - 0.1), H + 0.2 + Math.sin(a) * 0.17, Math.cos(a) * 0.17)); }
  P.add('steel', tube(pts, 0.004, { radial: 3, seg: 600, tension: 0.2 }));
  for (let k = 0; k < 120; k++) { const p = pts[(k * 7) % pts.length]; P.add('steel', box(0.03, 0.004, 0.004), M(p.x, p.y, p.z, 0, k, k * 0.7)); }
  return P;
}
export function barricade(ctx, x, y, z, yaw) {
  pool(ctx, 'barricade', barricadeParts, 16).add(M(x, y, z, 0, yaw, 0));
  const c = Math.abs(Math.cos(yaw)) > 0.5;
  solid(ctx, x, y, z, c ? 1.9 : 0.8, 1.4, c ? 0.8 : 1.9, 'mesh');
}
// 封鎖線:a→b(世界座標)下垂的膠帶;broken 時從中間斷掉垂地
export function tape(P, a, b, { sag = 0.12, broken = false, w = 0.075 } = {}) {
  const len = a.distanceTo(b), n = Math.max(6, Math.round(len * 6));
  const pts = [];
  if (!broken) for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new V3().lerpVectors(a, b, t).add(new V3(0, -sag * 4 * t * (1 - t), 0))); }
  else { // 斷成兩截:各自垂到地面
    const ground = Math.min(a.y, b.y) - 0.99;
    for (const [p, q] of [[a, b], [b, a]]) {
      const pp = [];
      for (let i = 0; i <= n / 2; i++) { const t = i / n; const v = new V3().lerpVectors(p, q, t); v.y = Math.max(ground + 0.01, p.y - (p.y - ground) * Math.min(1, t * 3.2) ** 1.5); pp.push(v); }
      addTape(P, pp, w);
    }
    return;
  }
  addTape(P, pts, w);
}
function addTape(P, pts, w) {
  const pos = [], uv = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += pts[i].distanceTo(pts[i - 1]);
    const tw = Math.sin(i * 0.9) * 0.6; // 微扭
    const up = new V3(Math.sin(tw) * 0.3, Math.cos(tw), 0).normalize().multiplyScalar(w / 2);
    pos.push(pts[i].x - up.x, pts[i].y - up.y, pts[i].z - up.z, pts[i].x + up.x, pts[i].y + up.y, pts[i].z + up.z);
    uv.push(acc / 1.4, 0, acc / 1.4, 1);
  }
  const idx = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  P.add('po_tape', keepUV(g));
}

// ---------- 動態小物:路錐、垃圾桶、紙箱、棧板、輪胎、桶子… ----------
function coneParts() {
  const P = new Parts();
  P.add('po_orange', lathe([[0.025, 0.7], [0.045, 0.69], [0.16, 0.06], [0.0, 0.06]].reverse(), 16), M(0, -0.36, 0));
  P.add('po_reflect', lathe([[0.075, 0.5], [0.105, 0.36], [0.112, 0.33], [0.081, 0.47]], 16), M(0, -0.36, 0));
  P.add('po_reflect', lathe([[0.122, 0.27], [0.138, 0.2], [0.142, 0.18], [0.126, 0.25]], 16), M(0, -0.36, 0));
  P.add('rubber', box(0.4, 0.04, 0.4), M(0, -0.34, 0));
  return P;
}
export const cone = (ctx, x, y, z, yaw = 0, fallen = false) => fallen
  ? dyn(ctx, 'cone', coneParts, { mass: 2.5, shape: 'cylinder', size: [0.4, 0.72, 0.4], friction: 0.7, restitution: 0.15 }, x, y + 0.2, z, [HALF, yaw, 0])
  : dyn(ctx, 'cone', coneParts, { mass: 2.5, shape: 'cylinder', size: [0.4, 0.72, 0.4], friction: 0.7, restitution: 0.15 }, x, y + 0.36, z, [0, yaw, 0]);

export const GALLERY = {
  lamp: (ctx, o) => { streetLamp(ctx, o.x, 0, o.z, 0, { kind: 'tall' }); streetLamp(ctx, o.x + 3, 0, o.z, Math.PI, { kind: 'short' }); return 4; },
  bentlamp: (ctx, o) => { bentLamp(ctx, [new V3(o.x + 3.3, 0, o.z), new V3(o.x + 3.25, 0.85, o.z), new V3(o.x + 1.35, 2.1, o.z + 0.1), new V3(o.x + 0.8, 2.68, o.z + 0.12), new V3(o.x - 1.0, 2.7, o.z + 0.2), new V3(o.x - 2.2, 2.66, o.z + 0.3)]); return 2; },
  barricade: (ctx, o) => {
    barricade(ctx, o.x, 0, o.z, 0); barricade(ctx, o.x + 2.2, 0, o.z, 0.1);
    const P = new Parts();
    tape(P, new V3(o.x - 1, 1.05, o.z), new V3(o.x + 4, 1.0, o.z + 0.3));
    tape(P, new V3(o.x - 1, 0.95, o.z + 0.6), new V3(o.x - 1, 0.9, o.z + 3), { broken: true });
    put(ctx, P, 0, 0, 0);
    for (let k = 0; k < 3; k++) cone(ctx, o.x - 1 + k * 0.8, 0, o.z + 1.4, 0, k === 2);
    return 1.4;
  },
};
