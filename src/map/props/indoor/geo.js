import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from '../../materials.js';
import { initAtlas, surfKey, labRect, glowRect, decalRect } from './atlas.js';
import { classOfKey } from '../../../mats/classes.js';
import { encodeSurface, plainEligible, FLAG_V } from '../../../mats/encode.js';

// 道具建模工具:B(builder)以「表面鍵」收集幾何,最後依材質合併成模板(Template)。
// 表面鍵:道具表面名(如 'enamel_white'、'pl_beige'、'chrome')→ 經 atlas.surfKey 對應到材質庫鍵(共用材質,UV 以公尺計);
//         L(rect)/G(rect)/D(rect) → 圖集區塊(標籤、自發光、貼花),平面 UV 對應整塊。
// 座標:公尺;模板原點在底面中心,+Z 為正面(朝房間內),+Y 向上。

const V3 = THREE.Vector3, M4 = THREE.Matrix4;
const _m = new M4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
export const HALF = Math.PI / 2;

export const L = (rect) => ({ kind: 'rect', mat: 'pi_lab', rect });
export const G = (rect) => ({ kind: 'rect', mat: 'pi_glow', rect });
export const D = (rect) => ({ kind: 'rect', mat: rect.mat || 'pi_decal', rect }); // rect.mat:血跡圖集(pi_stain)
export { labRect, glowRect, decalRect, surfKey };

const surfCache = new Map();
function surf(s) {
  if (typeof s === 'object') return { kind: s.kind, mat: mat(s.mat), rect: s.rect };
  let r = surfCache.get(s);
  if (r) return r;
  initAtlas();
  const m = mat(surfKey(s));
  r = { kind: 'tile', mat: m, scale: m.userData.uvScale ?? 1, cls: plainEligible(m) ? classOfKey(m.name) : 0 };
  surfCache.set(s, r);
  return r;
}

export function compose(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'XYZ') {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  return new M4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// ---------- UV ----------
// 盒狀投影:每個三角形依法線主軸選平面;mode 'unit' 以包圍盒正規化到 0..1(色票用),'m' 以公尺計。
// 平面內若含物件最長軸,u 沿最長軸(木紋順著長邊)
function boxUV(g, mode, scale = 1, off = [0, 0]) {
  const p = g.attributes.position.array, cnt = p.length / 3;
  const uv = new Float32Array(cnt * 2);
  g.computeBoundingBox();
  const bb = g.boundingBox, mn = [bb.min.x, bb.min.y, bb.min.z];
  const sz = [Math.max(1e-4, bb.max.x - bb.min.x), Math.max(1e-4, bb.max.y - bb.min.y), Math.max(1e-4, bb.max.z - bb.min.z)];
  const long = sz[0] >= sz[1] && sz[0] >= sz[2] ? 0 : sz[2] >= sz[1] ? 2 : 1;
  const AX = [[2, 1], [0, 2], [0, 1]]; // 法線主軸 → 預設 (u, v) 軸
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const X = Math.abs(uy * vz - uz * vy), Y = Math.abs(uz * vx - ux * vz), Z = Math.abs(ux * vy - uy * vx);
    const ax = X >= Y && X >= Z ? 0 : Y >= Z ? 1 : 2;
    let [a, b] = AX[ax];
    if (b === long) [a, b] = [b, a];
    for (let k = 0; k < 3; k++) {
      const j = i + k * 3, o = (j / 3) * 2;
      if (mode === 'unit') { uv[o] = (p[j + a] - mn[a]) / sz[a]; uv[o + 1] = (p[j + b] - mn[b]) / sz[b]; }
      else { uv[o] = p[j + a] * scale + off[0]; uv[o + 1] = p[j + b] * scale + off[1]; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 倒角盒(44 個三角形;倒角面為平面,邊緣有高光)
export function chamferBox(w, h, d, r) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos = [], nor = [];
  const P = (sx, sy, sz, f) => (f === 0 ? [sx * hx, sy * (hy - r), sz * (hz - r)] : f === 1 ? [sx * (hx - r), sy * hy, sz * (hz - r)] : [sx * (hx - r), sy * (hy - r), sz * hz]);
  const tri = (a, b, c, n) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
    const l = Math.hypot(...n);
    for (let k = 0; k < 3; k++) nor.push(n[0] / l, n[1] / l, n[2] / l);
  };
  const quad = (a, b, c, d2, n) => { tri(a, b, c, n); tri(a, c, d2, n); };
  const S = [-1, 1];
  for (const s of S) {
    quad(P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0), [s, 0, 0]);
    quad(P(-1, s, -1, 1), P(1, s, -1, 1), P(1, s, 1, 1), P(-1, s, 1, 1), [0, s, 0]);
    quad(P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2), [0, 0, s]);
  }
  for (const a of S) for (const b of S) {
    quad(P(a, b, -1, 0), P(a, b, 1, 0), P(a, b, 1, 1), P(a, b, -1, 1), [a, b, 0]); // X-Y 邊
    quad(P(a, -1, b, 0), P(a, 1, b, 0), P(a, 1, b, 2), P(a, -1, b, 2), [a, 0, b]); // X-Z 邊
    quad(P(-1, a, b, 1), P(1, a, b, 1), P(1, a, b, 2), P(-1, a, b, 2), [0, a, b]); // Y-Z 邊
  }
  for (const a of S) for (const b of S) for (const c of S) tri(P(a, b, c, 0), P(a, b, c, 1), P(a, b, c, 2), [a, b, c]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// 把 0..1 的 uv 映射到矩形(win:色票內的子視窗,讓同一色票在不同物件上有不同髒污)
function remapUV(g, rect, win) {
  const uv = g.attributes.uv.array;
  const du = rect.u1 - rect.u0, dv = rect.v1 - rect.v0;
  const [w0, w1, w2, w3] = win || [0, 0, 1, 1];
  for (let i = 0; i < uv.length; i += 2) {
    const u = Math.min(1, Math.max(0, uv[i])), v = Math.min(1, Math.max(0, uv[i + 1]));
    uv[i] = rect.u0 + (w0 + u * (w2 - w0)) * du;
    uv[i + 1] = rect.v0 + (w1 + v * (w3 - w1)) * dv;
  }
}

function normUV(g) {
  const uv = g.attributes.uv.array;
  let mu = 0, mv = 0;
  for (let i = 0; i < uv.length; i += 2) { mu = Math.max(mu, uv[i]); mv = Math.max(mv, uv[i + 1]); }
  if (mu > 1 || mv > 1) for (let i = 0; i < uv.length; i += 2) { uv[i] /= Math.max(1, mu); uv[i + 1] /= Math.max(1, mv); }
}

function clean(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

// ---------- 掃掠管(轉角圓滑的折線管,框架、扶手、點滴架用) ----------
function polyBend(pts, bend, seg = 3) {
  const P = pts.map((p) => new V3(...p));
  if (P.length < 3 || bend <= 0) return P;
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const da = new V3().subVectors(a, b), dc = new V3().subVectors(c, b);
    const la = da.length(), lc = dc.length();
    const t = Math.min(bend, la * 0.45, lc * 0.45);
    const p0 = b.clone().addScaledVector(da, t / la), p2 = b.clone().addScaledVector(dc, t / lc);
    for (let k = 0; k <= seg; k++) {
      const u = k / seg, iu = 1 - u;
      out.push(new V3(iu * iu * p0.x + 2 * iu * u * b.x + u * u * p2.x, iu * iu * p0.y + 2 * iu * u * b.y + u * u * p2.y, iu * iu * p0.z + 2 * iu * u * b.z + u * u * p2.z));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}

export function sweepGeo(pts, r, radial = 8, { closed = false, caps = true, bend = 0, rEnd = null } = {}) {
  const P = polyBend(pts, bend);
  if (closed) P.push(P[0].clone());
  const n = P.length;
  const T = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    return new V3().subVectors(b, a).normalize();
  });
  // 平行移動標架
  let N = new V3(0, 1, 0);
  if (Math.abs(T[0].dot(N)) > 0.9) N.set(1, 0, 0);
  N.addScaledVector(T[0], -N.dot(T[0])).normalize();
  const frames = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]);
      N.applyQuaternion(q);
      N.addScaledVector(T[i], -N.dot(T[i])).normalize();
    }
    frames.push([N.clone(), new V3().crossVectors(T[i], N).normalize()]);
  }
  const pos = [], nor = [], uv = [];
  let acc = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) { acc += P[i].distanceTo(P[i - 1]); lens.push(acc); }
  const ring = (i) => {
    const out = [];
    const rr = rEnd ? r + (rEnd - r) * (lens[i] / acc) : r;
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const [Nn, Bn] = frames[i];
      const d = new V3().addScaledVector(Nn, Math.cos(a)).addScaledVector(Bn, Math.sin(a));
      out.push([P[i].clone().addScaledVector(d, rr), d, k / radial, lens[i]]);
    }
    return out;
  };
  const rings = P.map((_, i) => ring(i));
  const push = (v) => { pos.push(v[0].x, v[0].y, v[0].z); nor.push(v[1].x, v[1].y, v[1].z); uv.push(v[2], v[3]); };
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) {
    const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k], d = rings[i + 1][k + 1];
    push(a); push(c); push(b); push(b); push(c); push(d);
  }
  if (caps && !closed) for (const [i, s] of [[0, -1], [n - 1, 1]]) {
    const t = T[i].clone().multiplyScalar(s), c = [P[i], t, 0.5, lens[i]];
    for (let k = 0; k < radial; k++) {
      const a = [rings[i][k][0], t, 0, lens[i]], b = [rings[i][k + 1][0], t, 1, lens[i]];
      if (s > 0) { push(c); push(a); push(b); } else { push(c); push(b); push(a); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.userData.len = acc;
  return g;
}

// 圓角多邊形路徑:pts = [[x, y, 圓角半徑], ...]
export function roundShape(pts, path = new THREE.Shape()) {
  const n = pts.length, P = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = P(i);
    if (!r) { if (i === 0) path.moveTo(x, y); else path.lineTo(x, y); continue; }
    const [ax, ay] = P(i - 1), [bx, by] = P(i + 1);
    const la = Math.hypot(ax - x, ay - y), lb = Math.hypot(bx - x, by - y), t = Math.min(r, la / 2, lb / 2);
    const x1 = x + ((ax - x) / la) * t, y1 = y + ((ay - y) / la) * t, x2 = x + ((bx - x) / lb) * t, y2 = y + ((by - y) / lb) * t;
    if (i === 0) path.moveTo(x1, y1); else path.lineTo(x1, y1);
    path.quadraticCurveTo(x, y, x2, y2);
  }
  path.closePath();
  return path;
}

// 圓柱:側面上下兩端是邊(會磨損),端蓋沒有
const capFlags = (nx, ny, nz) => (Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz)) ? 0 : FLAG_V);

// ---------- Builder ----------
let triCount = 0;
export const stats = { get tris() { return triCount; } };

export class B {
  constructor(name = '') {
    this.name = name;
    this.parts = new Map(); // material → [geo]
    this.stack = [new M4()];
    this.tops = []; // 可放東西的平面 {x0,z0,x1,z1,y}
    this.meta = {};
    this.win = null; // 色票子視窗(髒污變化)
  }
  top() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) { this.stack.push(this.top().clone().multiply(compose(x, y, z, rx, ry, rz, s))); return this; }
  pushM(m) { this.stack.push(this.top().clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  at(x, y, z, rx, ry, rz, fn) { this.push(x, y, z, rx, ry, rz); fn(this); return this.pop(); }
  // 加入幾何(以目前座標系);uvMode: 'box'(盒狀投影)/'native'(幾何原生 UV,0..1)/'rect'(平面直接對應)
  geo(s, g, local, uvMode = 'box', nativeScale = null) {
    const S = surf(s);
    const type = g.type;
    g = clean(g);
    if (S.cls) {
      // 純色表面:UV 改存表面編碼(類別、面內座標、面的尺寸;src/mats/encode.js)→ 合併後的共用材質靠它畫細節
      const m = local ? this.top().clone().multiply(local) : this.top();
      if (uvMode === 'native' && g.attributes.uv) encodeSurface(g, m, S.cls, { mode: 'uv', flags: type === 'CylinderGeometry' ? capFlags : () => 0 });
      else encodeSurface(g, m, S.cls, { mode: 'box' });
      g.applyMatrix4(m);
      let l = this.parts.get(S.mat);
      if (!l) this.parts.set(S.mat, (l = []));
      l.push(g);
      return g;
    }
    if (S.kind === 'pal') {
      if (uvMode === 'box' || !g.attributes.uv) boxUV(g, 'unit');
      else normUV(g);
      remapUV(g, S.rect, this.win);
    } else if (S.kind === 'rect') {
      if (!g.attributes.uv || uvMode === 'box') boxUV(g, 'unit');
      remapUV(g, S.rect);
    } else if (uvMode === 'keep' && g.attributes.uv) {
      // 保留呼叫者算好的 UV(例如隔簾頂端的網眼帶要對齊)
    } else {
      const sc = S.scale ?? 1, off = [this._off(), this._off()];
      if (uvMode === 'native' && nativeScale && g.attributes.uv) {
        const uv = g.attributes.uv.array;
        for (let i = 0; i < uv.length; i += 2) { uv[i] = uv[i] * nativeScale[0] * sc + off[0]; uv[i + 1] = uv[i + 1] * nativeScale[1] * sc + off[1]; }
      } else boxUV(g, 'm', sc, off);
    }
    const m = local ? this.top().clone().multiply(local) : this.top();
    g.applyMatrix4(m);
    let l = this.parts.get(S.mat);
    if (!l) this.parts.set(S.mat, (l = []));
    l.push(g);
    return g;
  }
  _off() { this._o = ((this._o ?? 0.37) * 9301 + 0.4927) % 1; return this._o * 3; }
  // 盒子(中心座標);o.r 圓角
  box(s, w, h, d, x = 0, y = 0, z = 0, o = {}) {
    const r = Math.min(o.r ?? 0, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = r > 0.0015 ? (o.round ? new RoundedBoxGeometry(w, h, d, o.seg ?? 1, r) : chamferBox(w, h, d, r)) : new THREE.BoxGeometry(w, h, d);
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0), 'box');
  }
  // 盒子(以最小/最大角)
  bb(s, x0, y0, z0, x1, y1, z1, o = {}) { return this.box(s, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o); }
  // 圓柱(中心座標;axis 'y'|'x'|'z')
  cyl(s, r, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg ?? 10, 1, !!o.open, o.t0 ?? 0, o.tl ?? Math.PI * 2);
    const ax = o.axis === 'x' ? [0, 0, -HALF] : o.axis === 'z' ? [HALF, 0, 0] : [0, 0, 0];
    const local = compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0).multiply(compose(0, 0, 0, ...ax));
    return this.geo(s, g, local, o.boxuv ? 'box' : 'native', [Math.PI * 2 * r, h]);
  }
  // 兩點間的圓桿
  rod(s, r, a, b, o = {}) {
    const A = new V3(...a), Bp = new V3(...b), d = new V3().subVectors(Bp, A), len = d.length();
    const g = new THREE.CylinderGeometry(o.r2 ?? r, r, len, o.seg ?? 6, 1, !!o.open);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    const local = new M4().compose(A.clone().add(Bp).multiplyScalar(0.5), q, new V3(1, 1, 1));
    return this.geo(s, g, local, 'native', [Math.PI * 2 * r, len]);
  }
  // 掃掠管:pts 折線,bend 轉角半徑
  tube(s, pts, r, o = {}) {
    const g = sweepGeo(pts, r, o.seg ?? 6, { closed: o.closed, caps: o.caps ?? true, bend: o.bend ?? r * 3, rEnd: o.rEnd });
    return this.geo(s, g, o.m || null, 'native', [Math.PI * 2 * r, 1]);
  }
  // 車削:prof [[r, y], ...]
  lathe(s, prof, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.LatheGeometry(prof.map(([r, yy]) => new THREE.Vector2(Math.max(0, r), yy)), o.seg ?? 16, o.p0 ?? 0, o.pl ?? Math.PI * 2);
    let len = 0;
    for (let i = 1; i < prof.length; i++) len += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    const rmax = Math.max(...prof.map((p) => p[0]));
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), 'native', [Math.PI * 2 * rmax, len]);
  }
  // 擠出:pts 為 XY 平面的輪廓([x, y, 圓角]),沿 +Z 擠出 depth(置中)
  ext(s, pts, depth, x = 0, y = 0, z = 0, o = {}) {
    const shape = roundShape(pts);
    if (o.holes) for (const h of o.holes) shape.holes.push(roundShape(h, new THREE.Path()));
    const b = Math.min(o.bevel ?? 0.004, depth * 0.3);
    const d = Math.max(1e-4, depth - 2 * b);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: o.bseg ?? 1, curveSegments: o.cs ?? 6 });
    g.translate(0, 0, -d / 2);
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), 'box');
  }
  sph(s, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.SphereGeometry(r, o.ws ?? 12, o.hs ?? 8, 0, Math.PI * 2, o.t0 ?? 0, o.tl ?? Math.PI);
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx ?? 1, o.sy ?? 1, o.sz ?? 1), 'native', [Math.PI * 2 * r, Math.PI * r]);
  }
  tor(s, R, r, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.TorusGeometry(R, r, o.rs ?? 6, o.ts ?? 20, o.arc ?? Math.PI * 2);
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0), 'native', [Math.PI * 2 * R, Math.PI * 2 * r]);
  }
  // 平面(預設朝 +Z);rect 表面時整面對應圖集區塊
  plane(s, w, h, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.PlaneGeometry(w, h, o.ws ?? 1, o.hs ?? 1);
    if (o.flipU) { const uv = g.attributes.uv.array; for (let i = 0; i < uv.length; i += 2) uv[i] = 1 - uv[i]; }
    return this.geo(s, g, compose(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0), typeof s === 'object' ? 'rect' : 'box');
  }
  raw(s, g, local = null, uvMode = 'box', ns = null) { return this.geo(s, g, local, uvMode, ns); }
  // 合併其他模板(子組件)
  add(t, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sc = 1) {
    const m = this.top().clone().multiply(compose(x, y, z, rx, ry, rz, sc));
    for (const { mat: mm, geo } of t.parts) {
      const g = geo.clone().applyMatrix4(m);
      let l = this.parts.get(mm);
      if (!l) this.parts.set(mm, (l = []));
      l.push(g);
    }
    for (const tp of t.tops || []) {
      const a = new V3(tp.x0, tp.y, tp.z0).applyMatrix4(m), b = new V3(tp.x1, tp.y, tp.z1).applyMatrix4(m);
      this.tops.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), y: a.y });
    }
    return this;
  }
  // 可放置物品的頂面(模板座標)
  surface(x0, z0, x1, z1, y) { this.tops.push({ x0, z0, x1, z1, y }); return this; }
  build() {
    const parts = [];
    const bbox = new THREE.Box3();
    for (const [m, list] of this.parts) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list);
      if (!g) continue;
      g.computeBoundingBox();
      g.computeBoundingSphere();
      bbox.union(g.boundingBox);
      parts.push({ mat: m, geo: g });
      triCount += g.attributes.position.count / 3;
    }
    return { name: this.name, parts, bbox, tops: this.tops, meta: this.meta, tris: parts.reduce((s, p) => s + p.geo.attributes.position.count / 3, 0) };
  }
}

// 模板快取:同一名稱只建一次
const T = new Map();
export const tplTime = new Map(); // 開發用:各模板建構時間(依名稱前綴)
export function tpl(name, fn) {
  let t = T.get(name);
  if (!t) {
    const t0 = performance.now();
    const b = new B(name);
    fn(b);
    t = b.build();
    T.set(name, t);
    const k = name.split(/[:#]/)[0];
    const e = tplTime.get(k) || { ms: 0, n: 0, tris: 0 };
    e.ms += performance.now() - t0; e.n++; e.tris = Math.max(e.tris, t.tris);
    tplTime.set(k, e);
  }
  return t;
}
// 帶變體的模板:variant 為字串或數字
export const tplv = (name, v, fn) => tpl(`${name}#${v}`, (b) => fn(b, v));

// 便利:4 個角
export const corners = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]];
export { V3, M4 };
