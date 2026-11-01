import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from '../../materials.js';
import { sfx } from '../../../audio.js';

// 戶外道具共用工具:幾何基本形、依材質收集合併(Parts)、靜態實例池(InstancedMesh)、
// 動態物件(物理代理:userData.dynamic + 實例化渲染)、放置/碰撞/連通性檢查、音效迴圈。
// 座標:公尺,+Y 向上;物件本地 +Z 為「正面」(與 ctx.wallSpots 的 yaw 一致),yaw 0 = 面向 -Z。

export const TAU = Math.PI * 2, HALF = Math.PI / 2;
export const V3 = THREE.Vector3;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
// 平滑一維雜訊(-1..1)
export const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };

const _v = new V3(), _s = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
// 變換矩陣:位置 + 旋轉(YXZ:先 yaw 再 pitch 再 roll)+ 縮放
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
export const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

// ---------- 基本形 ----------
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w, h, d, r = 0.02, s = 1) => new RoundedBoxGeometry(w, h, d, s, Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2) * 0.999));
export const cyl = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sph = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
export const tor = (R, r, rs = 8, ts = 24, arc = TAU) => new THREE.TorusGeometry(R, r, rs, ts, arc);
export const plane = (w, h) => new THREE.PlaneGeometry(w, h);
// 車削:pts = [[半徑, y], ...]
export const lathe = (pts, seg = 24, a0 = 0, a1 = TAU) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg, a0, a1 - a0);
export const xf = (g, m) => { g.applyMatrix4(m); return g; };
export const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => xf(g, M(x, y, z, rx, ry, rz));

// 2D 輪廓擠出(沿 +Z,置中);pts = [[x, y], ...];holes 為輪廓陣列
export function extrude(pts, depth, { bevel = 0, seg = 1, holes = [], cs = 6 } = {}) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const d = Math.max(1e-4, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: seg, curveSegments: cs });
  g.translate(0, 0, -d / 2);
  return g;
}

// 兩點間的圓柱(管線、桿件)
const UP = new V3(0, 1, 0);
export function rod(a, b, r, seg = 10, r2 = r) {
  const d = new V3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// 兩點間的方條;side 指定寬度方向(會正交化)
export function beam(a, b, w, t, side = new V3(1, 0, 0)) {
  const y = new V3().subVectors(b, a), len = y.length();
  y.divideScalar(len);
  const x = side.clone().addScaledVector(y, -side.dot(y));
  if (x.lengthSq() < 1e-8) x.set(0, 0, 1).addScaledVector(y, -y.z);
  x.normalize();
  const z = new V3().crossVectors(x, y);
  const g = new THREE.BoxGeometry(w, len, t);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  return g;
}
// 沿曲線的管(電纜、水管、鍊條)
export function tube(points, r, { seg = 0, radial = 6, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  const n = seg || Math.max(4, Math.round(curve.getLength() * 8));
  return new THREE.TubeGeometry(curve, n, r, radial, closed);
}
// 下垂的纜線:兩端點之間以拋物線下垂 sag 公尺
export function sagLine(a, b, sag, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new V3().lerpVectors(a, b, t).add(new V3(0, -sag * 4 * t * (1 - t), 0))); }
  return pts;
}

// 一般化網格曲面:rings[i][j] = V3;回傳 BufferGeometry(四邊形依 keep(i,j) 過濾);
// uvFn(p, i, j) 可指定 uv;flip 反轉面向
export function gridSurface(rings, { keep = null, flip = false, uvFn = null, closeJ = false } = {}) {
  const ni = rings.length, nj = rings[0].length;
  const pos = [], uv = [];
  const push = (p, i, j) => { pos.push(p.x, p.y, p.z); if (uvFn) { const t = uvFn(p, i, j); uv.push(t[0], t[1]); } else uv.push(i / (ni - 1), j / (nj - 1)); };
  const J = closeJ ? nj : nj - 1;
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < J; j++) {
    if (keep && !keep(i, j)) continue;
    const j1 = (j + 1) % nj;
    const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j1], d = rings[i][j1];
    if (!flip) { push(a, i, j); push(b, i + 1, j); push(c, i + 1, j1); push(a, i, j); push(c, i + 1, j1); push(d, i, j1); }
    else { push(a, i, j); push(c, i + 1, j1); push(b, i + 1, j); push(a, i, j); push(d, i, j1); push(c, i + 1, j1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (uvFn) g.userData.keepUV = true;
  return g;
}
// 平滑法線(同位置頂點平均),gridSurface 這類非索引幾何用
export function smoothNormals(g, crease = 1) {
  g.computeVertexNormals();
  const p = g.attributes.position.array, n = g.attributes.normal.array, map = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const k = `${Math.round(p[i] * 2e3)},${Math.round(p[i + 1] * 2e3)},${Math.round(p[i + 2] * 2e3)}`;
    const e = map.get(k);
    if (e) e.push(i); else map.set(k, [i]);
  }
  const out = new Float32Array(n.length);
  for (const e of map.values()) {
    for (const i of e) {
      let x = 0, y = 0, z = 0;
      for (const j of e) { const d = n[i] * n[j] + n[i + 1] * n[j + 1] + n[i + 2] * n[j + 2]; if (d >= crease) { x += n[j]; y += n[j + 1]; z += n[j + 2]; } }
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}

// 盒狀 UV 投影(公尺 × s):讓所有道具的貼圖密度一致(材質升級成 PBR 時不會拉伸)
export function boxUV(g, s = 1) {
  const p = g.attributes.position.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const X = Math.abs(uy * vz - uz * vy), Y = Math.abs(uz * vx - ux * vz), Z = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const j = i + k * 3, o = (j / 3) * 2;
      if (X >= Y && X >= Z) { uv[o] = p[j + 2] * s; uv[o + 1] = p[j + 1] * s; }
      else if (Y >= Z) { uv[o] = p[j] * s; uv[o + 1] = p[j + 2] * s; }
      else { uv[o] = p[j] * s; uv[o + 1] = p[j + 1] * s; }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 統一成 非索引 + position/normal/uv
export function norm(g) {
  const keepUV = g.userData.keepUV;
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!keepUV || !g.attributes.uv) boxUV(g, 1);
  g.userData.keepUV = keepUV;
  g.clearGroups();
  return g;
}
export const keepUV = (g) => { g.userData.keepUV = true; return g; };
const resolve = (k) => (typeof k === 'string' ? mat(k) : k);

// ---------- Parts:依材質收集幾何,合併成每材質一個網格 ----------
export class Parts {
  constructor() { this.map = new Map(); }
  add(key, g, m) {
    if (m) g.applyMatrix4(m);
    let l = this.map.get(key);
    if (!l) this.map.set(key, (l = []));
    l.push(g);
    return this;
  }
  // 把另一組 Parts 以矩陣 m 併入
  merge(other, m) { for (const [k, l] of other.map) for (const g of l) this.add(k, m ? g.clone().applyMatrix4(m) : g.clone()); return this; }
  // [{ geo, mat }](實例池用)
  list() {
    const out = [];
    for (const [k, l] of this.map) { const geo = mergeGeometries(l.map(norm)); if (geo) out.push({ geo, mat: resolve(k) }); }
    return out;
  }
  group({ shadow = true } = {}) {
    const g = new THREE.Group();
    for (const { geo, mat: m } of this.list()) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = shadow && !m.transparent;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

// ---------- 放置 ----------
// 加入靜態物件(合併);x,y,z,yaw 為世界座標
export function put(ctx, obj, x, y, z, yaw = 0, opt = {}) {
  if (obj instanceof Parts) obj = obj.group();
  obj.position.set(x, y, z);
  obj.rotation.set(0, yaw, 0);
  return ctx.add(obj, { static: true, collide: false, ...opt });
}
// 只登記碰撞(不可見方塊,登記後移出場景):cx,cz 中心、sx,sz 尺寸、h 高、y0 底;mat:材質(子彈穿透/彈著效果,見 physics/truth.js)
export function solid(ctx, cx, y0, cz, sx, h, sz, mat = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz));
  m.position.set(cx, y0 + h / 2, cz);
  m.visible = false;
  ctx.add(m, { collide: true, static: false, shrink: 0, mat });
  ctx.group.remove(m);
  m.geometry.dispose();
}
// 旋轉後的本地盒(以 yaw 轉)換成世界 AABB 碰撞
export function solidLocal(ctx, x, y, z, yaw, lx, lz, sx, h, sz, mat = null) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
  const ex = Math.abs(sx * c) + Math.abs(sz * s), ez = Math.abs(sx * s) + Math.abs(sz * c);
  solid(ctx, wx, y, wz, ex, h, ez, mat);
}

// ---------- 實例池(重複物件:InstancedMesh,static:false)----------
const POOLS = new WeakMap();
const HULL = new THREE.MeshBasicMaterial({ visible: false });
class Pool {
  constructor(ctx, name, parts, cap, dyn) {
    this.ctx = ctx; this.name = name; this.cap = cap; this.dyn = dyn; this.n = 0;
    this.mats = []; this.proxies = []; this.hidden = []; this.meshes = []; this.parts = parts;
    this.build(parts);
  }
  build(parts) {
    // 舊的實例網格要從「實際的父節點」移除(場景建構器會把道具搬到各樓層群組,只從 ctx.group 移除會留下舊網格一直被畫)
    for (const im of this.meshes) { im.parent?.remove(im); im.dispose?.(); }
    this.meshes = parts.map(({ geo, mat: m, shadow = true }) => {
      const im = new THREE.InstancedMesh(geo, resolve(m), this.cap);
      im.name = `po_${this.name}`;
      im.count = this.n;
      im.userData.pool = this; // [draws] 場景建構器據此判斷能否烘進靜態批次(src/map/hospital/batch.js:靜態區塊池、未綁定下載模型)
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      // 只有大件投影:小雜物、鏤空卡片、輪胎等不進陰影 pass
      im.castShadow = shadow && !im.material.transparent && !(im.material.alphaTest > 0) && (this.dyn || geo.boundingSphere.radius > 0.45);
      im.receiveShadow = true;
      for (let i = 0; i < this.n; i++) im.setMatrixAt(i, this.mats[i]);
      if (this.dyn) { im.frustumCulled = false; im.onBeforeRender = () => this.sync(im); }
      this.ctx.add(im, { static: false, collide: false });
      return im;
    });
  }
  // 換成新的零件(例如 GLTF 載入完成)
  setParts(parts) { this.parts = parts; this.build(parts); }
  add(m) {
    if (this.baked) { // [draws] 已烘進靜態批次(src/map/hospital/batch.js)後又加實例:改回實例池顯示(舊實例在批次裡會多畫一次,但不會缺)
      console.warn('[props-out] 已烘焙的實例池又加入實例', this.name);
      this.baked = false;
      for (const im of this.meshes) if (!im.parent) this.ctx.add(im, { static: false, collide: false });
    }
    if (this.n >= this.cap) { this.cap *= 2; this.build(this.parts); }
    const i = this.n++;
    this.mats.push(m.clone());
    for (const im of this.meshes) { im.setMatrixAt(i, m); im.count = this.n; im.instanceMatrix.needsUpdate = true; im.boundingSphere = null; }
    return i;
  }
  // 動態:每幀從代理物件同步實例矩陣(物理代理移動代理物件即可)
  sync(im) {
    const inv = _inv.copy(im.matrixWorld).invert();
    let dirty = false;
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[i];
      if (!p.parent || !p.visible) { if (!this.hidden[i]) { this.hidden[i] = true; this.mats[i].makeScale(0, 0, 0); dirty = true; } continue; }
      if (this.hidden[i]) { this.hidden[i] = false; this.mats[i].identity().elements[0] = 2; } // 強制重設
      _tmp.multiplyMatrices(inv, p.matrixWorld);
      const a = _tmp.elements, b = this.mats[i].elements;
      let same = true;
      for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-6) { same = false; break; }
      if (same && im.userData.synced) continue;
      this.mats[i].copy(_tmp);
      dirty = true;
    }
    if (dirty || !im.userData.synced) {
      for (const mm of this.meshes) { for (let i = 0; i < this.n; i++) mm.setMatrixAt(i, this.mats[i]); mm.instanceMatrix.needsUpdate = true; mm.userData.synced = true; }
    }
  }
}
const _inv = new THREE.Matrix4(), _tmp = new THREE.Matrix4();

// 靜態實例池依 24m 區塊切開:每塊一組 InstancedMesh,包圍球只涵蓋該區塊 → 視錐剔除有效
// (整張地圖一個 InstancedMesh 的話,包圍球涵蓋全圖,永遠不會被剔除)。零件(幾何/材質)各區塊共用。
const REGION = 24;
class RegionPool {
  constructor(ctx, name, parts, cap) { this.ctx = ctx; this.name = name; this.parts = parts; this.cap = cap; this.subs = new Map(); }
  sub(x, z) {
    const k = `${Math.floor(x / REGION)},${Math.floor(z / REGION)}`;
    let p = this.subs.get(k);
    if (!p) { p = new Pool(this.ctx, `${this.name}@${k}`, this.parts, Math.max(4, Math.min(this.cap, 16)), false); p.owner = this; this.subs.set(k, p); }
    return p;
  }
  add(m) { const e = m.elements; return this.sub(e[12], e[14]).add(m); }
  setParts(parts) { this.parts = parts; for (const p of this.subs.values()) p.setParts(parts); }
  get meshes() { const out = []; for (const p of this.subs.values()) out.push(...p.meshes); return out; }
  get n() { let n = 0; for (const p of this.subs.values()) n += p.n; return n; }
}
// 取得(或建立)命名的靜態實例池;build() 回傳 Parts 或 [{geo, mat}]
export function pool(ctx, name, build, cap = 32) {
  let ps = POOLS.get(ctx);
  if (!ps) POOLS.set(ctx, (ps = new Map()));
  let p = ps.get(name);
  if (!p) {
    const parts = build();
    p = new RegionPool(ctx, name, parts instanceof Parts ? parts.list() : parts, cap);
    ps.set(name, p);
  }
  return p;
}
export function instance(ctx, name, build, x, y, z, yaw = 0, s = 1, tilt = [0, 0]) {
  return pool(ctx, name, build).add(M(x, y, z, tilt[0], yaw, tilt[1], s));
}

// 動態物件(可被推動/打飛):回傳代理物件 proxy(物理代理移動它,外觀由實例池跟隨)。
// proxy.userData.dynamic = { mass(kg), shape:'box'|'cylinder'|'sphere', friction, restitution, size:[x,y,z](本地,完整尺寸), radius?, height? }
// 代理原點 = 碰撞形狀中心;圓柱軸為本地 Y。proxy 內有一個不可見的外殼網格(供包圍盒與射線)。
export function dynPool(ctx, name, build, spec, cap = 16) {
  let ps = POOLS.get(ctx);
  if (!ps) POOLS.set(ctx, (ps = new Map()));
  let p = ps.get(name);
  if (!p) {
    const parts = build();
    p = new Pool(ctx, name, parts instanceof Parts ? parts.list() : parts, cap, true);
    p.spec = spec;
    const [sx, sy, sz] = spec.size;
    p.hull = spec.shape === 'cylinder' ? new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 10) : spec.shape === 'sphere' ? new THREE.SphereGeometry(sx / 2, 10, 8) : new THREE.BoxGeometry(sx, sy, sz);
    ps.set(name, p);
  }
  return p;
}
// 放一個動態物件:x,y,z 為碰撞形狀中心;rot = [rx, ry, rz](YXZ)
export function dyn(ctx, name, build, spec, x, y, z, rot = [0, 0, 0], scale = 1) {
  const p = dynPool(ctx, name, build, spec);
  const proxy = new THREE.Object3D();
  proxy.name = `dyn_${name}`;
  proxy.position.set(x, y, z);
  proxy.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
  if (scale !== 1) proxy.scale.setScalar(scale);
  const s = p.spec;
  proxy.userData.dynamic = { mass: s.mass * scale ** 3, shape: s.shape, friction: s.friction ?? 0.6, restitution: s.restitution ?? 0.1, size: s.size.map((v) => v * scale), ...(s.shape === 'cylinder' ? { radius: (s.size[0] / 2) * scale, height: s.size[1] * scale } : {}), ...(s.shape === 'sphere' ? { radius: (s.size[0] / 2) * scale } : {}) };
  const hull = new THREE.Mesh(p.hull, HULL);
  hull.visible = false;
  proxy.add(hull);
  ctx.add(proxy, { static: false, collide: false });
  proxy.updateMatrixWorld(true);
  p.proxies.push(proxy);
  p.add(proxy.matrixWorld);
  return proxy;
}

// ---------- 動畫(只在可見時更新,不需要外部 update 掛勾)----------
// fn(t 秒, mesh) 在網格每次渲染前呼叫;回傳 mesh
export function animate(mesh, fn) {
  const prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...a) { prev.apply(this, a); fn(performance.now() / 1000, this); };
  return mesh;
}

// ---------- 音效迴圈(AudioContext 要等使用者互動後才存在)----------
export function startLoop(key, kind, pos) {
  if (typeof window === 'undefined') return;
  const go = () => setTimeout(() => { try { sfx.loopStart(key, kind, pos); } catch { /* 忽略 */ } }, 250);
  if (navigator.userActivation?.hasBeenActive) { go(); return; }
  const h = () => { removeEventListener('pointerdown', h, true); removeEventListener('keydown', h, true); go(); };
  addEventListener('pointerdown', h, true);
  addEventListener('keydown', h, true);
}

// ---------- 格子工具:佔用、連通性(有碰撞的道具不能把區域切斷)----------
// 該格是否可走且未被佔用
const walkFree = (ctx, li, c, r) => (ctx.L.flagsAt(li, c, r) & ctx.L.F.WALK) !== 0 && !ctx.occupied(li, c, r);
// 區域內(可走、未佔用)格子的連通塊數;extra 為假設要佔用的格子
function components(ctx, zone, extra) {
  const L = ctx.L, li = zone.levelIndex, W = L.W;
  const inZone = new Set();
  for (const [c0, r0, c1, r1] of zone.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * W + c;
    if (walkFree(ctx, li, c, r) && !(extra && extra.has(k))) inZone.add(k);
  }
  const seen = new Set();
  let n = 0;
  for (const k0 of inZone) {
    if (seen.has(k0)) continue;
    n++;
    const st = [k0];
    seen.add(k0);
    while (st.length) {
      const k = st.pop(), c = k % W, r = (k - c) / W;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (r + dr) * W + c + dc;
        if (inZone.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }
      }
    }
  }
  return n;
}
// 佔用 cells([[c,r]...])後區域是否仍維持原本的連通塊數
export function keepsConnected(ctx, zone, cells) {
  const W = ctx.L.W;
  const base = zone._po_comp ?? (zone._po_comp = components(ctx, zone));
  const extra = new Set(cells.map(([c, r]) => r * W + c));
  return components(ctx, zone, extra) <= base;
}
// 世界 AABB 覆蓋的格子
export function cellsOf(ctx, x0, z0, x1, z1) {
  const C = ctx.L.CELL, out = [];
  for (let c = Math.floor(x0 / C); c <= Math.floor((x1 - 1e-3) / C); c++) for (let r = Math.floor(z0 / C); r <= Math.floor((z1 - 1e-3) / C); r++) out.push([c, r]);
  return out;
}
// 該格四周是否有牆/圍籬/欄杆/障礙物/非可走(靠邊格)→ 回傳朝向(物件 +Z 朝向空地)與邊方向
export function edgeInfo(ctx, li, c, r) {
  const L = ctx.L, F = L.F;
  const out = [];
  for (const [dc, dr, yaw] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, HALF], [1, 0, -HALF]]) {
    const f = L.flagsAt(li, c + dc, r + dr);
    if (!(f & F.WALK) || (f & F.DOOR)) out.push({ dc, dr, yaw, wall: (f & (F.WALL | F.WINDOW | F.ELEVATOR)) !== 0, fence: (f & (F.FENCE | F.RAIL)) !== 0, door: (f & F.DOOR) !== 0 });
  }
  return out;
}
// 隨機打散
export function shuffle(rng, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- 動畫實例池(風扇、鞦韆、漂浮物…:每幀由 fn 計算局部變換)----------
// add(base, fn):fn(t, out:Matrix4) 寫入局部動畫矩陣(相對 base);全部實例共用一個 draw call(每材質)
const _am = new THREE.Matrix4();
class AnimPool {
  constructor(ctx, name, parts, cap) {
    this.items = [];
    this.last = -1;
    this.meshes = parts.map(({ geo, mat: m }) => {
      const im = new THREE.InstancedMesh(geo, resolve(m), cap);
      im.name = `po_anim_${name}`;
      im.count = 0;
      im.castShadow = !im.material.transparent;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.onBeforeRender = () => this.update();
      ctx.add(im, { static: false, collide: false });
      return im;
    });
  }
  add(base, fn) {
    this.items.push({ base: base.clone(), fn });
    for (const im of this.meshes) { im.count = this.items.length; im.setMatrixAt(this.items.length - 1, base); im.instanceMatrix.needsUpdate = true; }
  }
  update() {
    const t = performance.now() / 1000;
    if (t === this.last) return;
    this.last = t;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      _am.identity();
      it.fn(t, _am);
      _tmp.multiplyMatrices(it.base, _am);
      for (const im of this.meshes) im.setMatrixAt(i, _tmp);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}
export function animPool(ctx, name, build, cap = 16) {
  let ps = POOLS.get(ctx);
  if (!ps) POOLS.set(ctx, (ps = new Map()));
  let p = ps.get('anim_' + name);
  if (!p) { const parts = build(); p = new AnimPool(ctx, name, parts instanceof Parts ? parts.list() : parts, cap); ps.set('anim_' + name, p); }
  return p;
}
