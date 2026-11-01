import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLASS } from '../mats/classes.js';
import { encodeSurface, seedSurface, FLAG_V } from '../mats/encode.js';
import { applySurface } from '../mats/surface.js';

// 互動物件的建模工具:零件用局部座標描述(公尺;原點在地面/牆面,+Z 朝房間內),顏色烘進頂點色。
//  靜態零件 → 依「樓層 × 材質」合併成少數幾個網格(整層互動物件的外殼 ≈ 6 個 draw call)
//  會動的零件 → 同一種零件做成 InstancedMesh 池(開關撥桿、指示燈、聽筒、櫃門…一層一種一個 draw call)
//  獨立網格只留給「有自己貼圖狀態」的東西(電視螢幕、販賣機面板)
// 材質全部在建構時建好、整局不換(main.js 開機時整個場景一起預編譯 shader;執行期不會新增 program)。
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  _e.set(rx, ry, rz, 'YXZ');
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
};

const GEO = new Map();
const geo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); g.userData.shared = true; GEO.set(key, g); } return g; };
export const G = {
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: (n = 12) => geo('cyl' + n, () => new THREE.CylinderGeometry(0.5, 0.5, 1, n)),
  cone: (n = 12, top = 0.5) => geo(`cone${n}|${top}`, () => new THREE.CylinderGeometry(top * 0.5, 0.5, 1, n)),
  sph: (n = 10) => geo('sph' + n, () => new THREE.SphereGeometry(0.5, n, Math.max(6, (n * 0.7) | 0))),
  torus: (t = 0.15, n = 16) => geo(`tor${t}|${n}`, () => new THREE.TorusGeometry(0.5, t, 6, n)),
  plane: () => geo('plane', () => new THREE.PlaneGeometry(1, 1)),
};
const col = (c) => (c instanceof THREE.Color ? c : new THREE.Color(c));

// ---------- 零件收集器 ----------
// 材質別名(wood/paint/gloss/rust)合併時歸到基本材質(draw call 不變),但保留表面類別(src/mats:木紋、掉漆、亮面、鏽)
const ixBase = (mat) => mat?.userData?.ixBase || mat;
const ixCls = (mat) => mat?.userData?.ixCls || 0;
export class Model {
  constructor() { this.parts = []; }
  add(mat, color, g, m) { this.parts.push({ mat: ixBase(mat), cls: ixCls(mat), color: col(color), g, m }); return this; }
  // 方塊:中心 (x,y,z)、尺寸 (sx,sy,sz)、旋轉 (rx,ry,rz)
  box(mat, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) { return this.add(mat, color, G.box(), T(x, y, z, rx, ry, rz, sx, sy, sz)); }
  // 底對齊的方塊(y0 = 底面)
  slab(mat, color, x, y0, z, sx, sy, sz, ry = 0) { return this.box(mat, color, x, y0 + sy / 2, z, sx, sy, sz, 0, ry); }
  cyl(mat, color, x, y, z, d, h, n = 12, rx = 0, ry = 0, rz = 0, d2 = d) { return this.add(mat, color, G.cyl(n), T(x, y, z, rx, ry, rz, d, h, d2)); }
  cone(mat, color, x, y, z, d, h, top = 0.5, n = 12, rx = 0, ry = 0, rz = 0) { return this.add(mat, color, G.cone(n, top), T(x, y, z, rx, ry, rz, d, h, d)); }
  sph(mat, color, x, y, z, d, n = 10, sy = d, sz = d) { return this.add(mat, color, G.sph(n), T(x, y, z, 0, 0, 0, d, sy, sz)); }
  torus(mat, color, x, y, z, d, t = 0.15, rx = 0, ry = 0, rz = 0, n = 16) { return this.add(mat, color, G.torus(t, n), T(x, y, z, rx, ry, rz, d, d, d)); }
  // 平面(+Z 朝外):貼圖面板、紙張
  quad(mat, x, y, z, w, h, rx = 0, ry = 0, rz = 0, color = 0xffffff) { if (mat && mat.proxy) return this.add(mat.mat, color, uvPlane(mat.uv), T(x, y, z, rx, ry, rz, w, h, 1)); return this.add(mat, color, G.plane(), T(x, y, z, rx, ry, rz, w, h, 1)); }
  // 合併成單一幾何(局部座標);mats 篩選材質
  geometry(mat) {
    const list = [];
    for (const p of this.parts) if (!mat || p.mat === mat) list.push(bake(p, p.m));
    if (!list.length) return null;
    const g = mergeGeometries(list);
    for (const x of list) x.dispose();
    return g;
  }
  mats() { return [...new Set(this.parts.map((p) => p.mat))]; }
}
// 單位零件的表面編碼方式:盒子/平面 = 原生 UV 四邊都是邊;圓柱 = 側面上下兩端是邊、端蓋沒有;球/環 = 沒有邊
const capFlags = (nx, ny, nz) => (Math.abs(ny) > Math.max(Math.abs(nx), Math.abs(nz)) ? 0 : FLAG_V);
const flagsOf = (g) => (g.type === 'BoxGeometry' || g.type === 'PlaneGeometry' ? null : g.type === 'CylinderGeometry' ? capFlags : () => 0);
function bake(p, m) {
  const g = (p.g.index ? p.g.toNonIndexed() : p.g.clone());
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (p.cls && g.attributes.uv) {
    const f = flagsOf(p.g);
    encodeSurface(g, m, p.cls, { mode: 'uv', flags: f || ((nx, ny, nz) => 3) });
    const e = m.elements;
    seedSurface(g, (Math.imul(Math.round(e[12] * 97) ^ Math.round(e[14] * 131), 0x9e3779b1) >>> 28) & 15);
  }
  g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) { c[i] = p.color.r; c[i + 1] = p.color.g; c[i + 2] = p.color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// ---------- 貼圖:所有靜態標籤/紙張/面板畫在同一張圖集(2048×1024)裡 ----------
// canvasTex(name, w, h, draw) → 圖集裡的一塊(依名稱快取);texMat(name, 區塊, { basic }) → { mat, uv } 代理,
// Model.quad 遇到代理就改 UV。整個互動系統的貼圖物件只有兩個材質(受光的紙/牌子、不受光的螢幕/燈箱)→ 每層 2 個 draw call。
// 會變內容的(電視螢幕、打字機的紙)傳 { own: true } 用自己的畫布。
const AW = 2048, AH = 1024, PAD = 4;
const ATL = { canvas: null, ctx: null, tex: null, x: PAD, y: PAD, row: 0, regions: new Map(), dirty: false, lit: null, unlit: null };
function atlasInit() {
  if (ATL.canvas) return;
  ATL.canvas = document.createElement('canvas');
  ATL.canvas.width = AW; ATL.canvas.height = AH;
  ATL.ctx = ATL.canvas.getContext('2d');
  ATL.ctx.fillStyle = '#808080'; ATL.ctx.fillRect(0, 0, AW, AH);
  ATL.tex = new THREE.CanvasTexture(ATL.canvas);
  ATL.tex.colorSpace = THREE.SRGBColorSpace;
  ATL.tex.anisotropy = 4;
  ATL.lit = new THREE.MeshStandardMaterial({ map: ATL.tex, roughness: 0.78, metalness: 0, vertexColors: true, name: 'ixt:atlas' });
  ATL.unlit = new THREE.MeshBasicMaterial({ map: ATL.tex, toneMapped: true, name: 'ixt:atlasGlow' });
}
const TEX = new Map();
export function canvasTex(name, w, h, draw, { srgb = true, repeat = false, own = false } = {}) {
  if (own) { // 自己的畫布(內容會變)
    let t = TEX.get(name);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    TEX.set(name, t);
    return t;
  }
  atlasInit();
  let r = ATL.regions.get(name);
  if (r) return r;
  if (ATL.x + w + PAD > AW) { ATL.x = PAD; ATL.y += ATL.row + PAD; ATL.row = 0; }
  if (ATL.y + h + PAD > AH) { console.warn('[interact] 圖集滿了', name); ATL.x = PAD; ATL.y = PAD; ATL.row = 0; }
  const x = ATL.x, y = ATL.y, g = ATL.ctx;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
  draw(g, w, h);
  g.restore();
  // 邊緣往外複製幾個像素(縮小取樣時不會吃到隔壁的圖)
  g.drawImage(ATL.canvas, x, y, w, 1, x, y - PAD, w, PAD); g.drawImage(ATL.canvas, x, y + h - 1, w, 1, x, y + h, w, PAD);
  g.drawImage(ATL.canvas, x, y - PAD, 1, h + PAD * 2, x - PAD, y - PAD, PAD, h + PAD * 2); g.drawImage(ATL.canvas, x + w - 1, y - PAD, 1, h + PAD * 2, x + w, y - PAD, PAD, h + PAD * 2);
  ATL.x += w + PAD * 2; ATL.row = Math.max(ATL.row, h + PAD);
  r = { region: true, name, uv: [x / AW, 1 - (y + h) / AH, (x + w) / AW, 1 - y / AH] };
  ATL.regions.set(name, r);
  ATL.dirty = true;
  return r;
}
export const atlasStats = () => ({ regions: ATL.regions.size, used: ATL.y + ATL.row });
export const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
export const HAND = '"DFKai-SB", "BiauKai", "KaiTi", "Microsoft JhengHei", serif';

// ---------- 材質(全部共用;依粗糙度/金屬度只分少數幾種 → 每層 draw call 少) ----------
let MATS = null;
export function mats() {
  if (MATS) return MATS;
  const std = (o) => applySurface(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
  const matte = std({ roughness: 0.82, metalness: 0, name: 'ix:matte' }); // 木頭、布、紙、粗塑膠
  const plastic = std({ roughness: 0.42, metalness: 0, name: 'ix:plastic' }); // 塑膠殼、烤漆、亮面
  const metal = std({ roughness: 0.45, metalness: 0.72, name: 'ix:metal' }); // 不鏽鋼、鐵件、生鏽的鐵
  // 別名:同一個基本材質(合併/BatchedMesh 照舊),表面類別不同;直接拿來建網格也可以(同一個 program)
  const alias = (base, cls, name) => { const a = applySurface(base.clone()); a.name = name; a.userData.ixBase = base; a.userData.ixCls = CLASS[cls]; return a; };
  matte.userData.ixCls = CLASS.matte; plastic.userData.ixCls = CLASS.plastic; metal.userData.ixCls = CLASS.ixmetal;
  MATS = {
    matte, wood: alias(matte, 'wood', 'ix:wood'), plastic, paint: alias(plastic, 'enamel', 'ix:paint'), gloss: alias(plastic, 'gloss', 'ix:gloss'), metal, rust: alias(metal, 'rust', 'ix:rust'),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, name: 'ix:glass' }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true, name: 'ix:glow' }), // 常亮的小燈(不會變)
    led: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true, name: 'ix:led' }), // 指示燈池:亮度用 instanceColor
  };
  return MATS;
}
// 有貼圖的材質:圖集區塊 → { mat, uv } 代理(Model.quad 會改 UV);自己的貼圖 → 一般材質
const TMATS = new Map();
export function texMat(name, tex, { basic = false, rough = 0.7, transparent = false, alphaTest = 0 } = {}) {
  if (tex && tex.region) { atlasInit(); return { proxy: true, mat: basic ? ATL.unlit : ATL.lit, uv: tex.uv }; }
  let m = TMATS.get(name);
  if (m) return m;
  m = basic ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, transparent, alphaTest, name: 'ixt:' + name })
    : new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0, transparent, alphaTest, vertexColors: true, name: 'ixt:' + name });
  TMATS.set(name, m);
  return m;
}
function uvPlane(uv) { // 單位平面,UV 換成圖集區塊
  const g = new THREE.PlaneGeometry(1, 1), a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  return g;
}

// ---------- 實例池:同一種會動的零件 ----------
// 會動的零件全部進 BatchedMesh(每層 × 每種材質一個 → 一個 draw call;不同形狀的零件也能同一批),
// 每個零件一個實例(矩陣 + 顏色),逐實例視錐剔除。建好時每個實例都先寫一次顏色 → shader 一開始就是「有實例顏色」版本(開機預編譯,不會執行期重編)。
export class Pool {
  constructor(kit, name, model, mat, { shadow = false } = {}) {
    this.kit = kit; this.name = name; this.model = model; this.mat = ixBase(mat); this.shadow = shadow;
    this.items = []; // { li, m: Matrix4, c: Color|null, bm: BatchedMesh, k: 實例 id }
    this.geo = null;
  }
  add(li, m, c = null) { const i = this.items.length; this.items.push({ li, m: m.clone(), c: c ? col(c).clone() : null, bm: null, k: -1 }); return i; }
  set(i, m) { const it = this.items[i]; it.m.copy(m); if (it.bm) it.bm.setMatrixAt(it.k, it.m); }
  color(i, c) { const it = this.items[i]; (it.c || (it.c = new THREE.Color())).copy(col(c)); if (it.bm) it.bm.setColorAt(it.k, it.c); }
}
const WHITE = new THREE.Color(1, 1, 1);
function buildBatches(kit, pools, own) {
  const groups = new Map(); // `${li}|${mat.uuid}` → { li, mat, pools:Set }
  for (const p of pools.values()) {
    if (!p.items.length) continue;
    p.geo ||= p.model.geometry();
    if (!p.geo) continue;
    for (const it of p.items) {
      const k = it.li + '|' + p.mat.uuid;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = { li: it.li, mat: p.mat, pools: new Set(), n: 0 }));
      g.pools.add(p); g.n++;
    }
  }
  let n = 0;
  for (const g of groups.values()) {
    let verts = 0;
    for (const p of g.pools) verts += p.geo.attributes.position.count;
    const bm = new THREE.BatchedMesh(g.n, verts, 0, g.mat);
    bm.name = `ix-batch:${g.mat.name}:${g.li}`;
    bm.castShadow = false; bm.receiveShadow = true;
    for (const p of g.pools) {
      const gid = bm.addGeometry(p.geo);
      for (const it of p.items) {
        if (it.li !== g.li) continue;
        it.bm = bm; it.k = bm.addInstance(gid);
        bm.setMatrixAt(it.k, it.m);
        bm.setColorAt(it.k, it.c || WHITE);
      }
    }
    kit.group(g.li).add(bm);
    own.push(bm);
    n++;
  }
  return n;
}

// ---------- 建構器 ----------
export function createKit({ root, levelGroups = null, levelOfY = null }) {
  const statics = new Map(); // li → Map(mat → [geo])
  const pools = new Map();
  const own = []; // 自己建的網格(dispose 用)
  const groups = new Map();
  const kit = {
    mats: mats(),
    group(li) {
      if (levelGroups && levelGroups[li]) return levelGroups[li];
      let g = groups.get(li);
      if (!g) { g = new THREE.Group(); g.name = 'ix-level-' + li; root.add(g); groups.set(li, g); }
      return g;
    },
    // 靜態:model 的零件經 matrix(世界)變換後收進該樓層的合併桶
    static(model, matrix, li) {
      let byMat = statics.get(li);
      if (!byMat) statics.set(li, (byMat = new Map()));
      for (const p of model.parts) {
        _m.multiplyMatrices(matrix, p.m);
        const list = byMat.get(p.mat) || [];
        list.push(bake(p, _m));
        byMat.set(p.mat, list);
      }
    },
    // 獨立網格(有自己的貼圖狀態或要整個移動的物件):每種材質一個子網格
    mesh(model, matrix, li, { shadow = false, name = 'ix-mesh' } = {}) {
      const o = new THREE.Group();
      o.name = name;
      for (const mat of model.mats()) {
        const m = new THREE.Mesh(model.geometry(mat), mat);
        m.castShadow = shadow && !mat.transparent; m.receiveShadow = true;
        o.add(m);
        own.push(m);
      }
      o.matrixAutoUpdate = true;
      matrix.decompose(o.position, o.quaternion, o.scale);
      kit.group(li).add(o);
      return o;
    },
    pool(name, make, mat, opt) { let p = pools.get(name); if (!p) { const m = new Model(); make(m); p = new Pool(kit, name, m, mat, opt); pools.set(name, p); } return p; },
    finish() {
      let n = 0;
      for (const [li, byMat] of statics) {
        for (const [mat, list] of byMat) {
          for (let i = 0; i < list.length; i += 4000) { // 每層每種材質合成一個網格
            const g = mergeGeometries(list.slice(i, i + 4000));
            if (!g) continue;
            g.computeBoundingSphere();
            const m = new THREE.Mesh(g, mat);
            m.name = `ix-static:${mat.name}:${li}`;
            m.castShadow = mat === MATS.matte || mat === MATS.plastic || mat === MATS.metal; m.receiveShadow = true; // 小燈、玻璃、貼圖不投影(少畫陰影 pass)
            m.matrixAutoUpdate = false; m.updateMatrix();
            kit.group(li).add(m);
            own.push(m);
            n++;
          }
          for (const g of list) g.dispose();
        }
      }
      statics.clear();
      if (ATL.dirty && ATL.tex) { ATL.tex.needsUpdate = true; ATL.dirty = false; }
      kit.batches = buildBatches(kit, pools, own);
      return n;
    },
    dispose() {
      for (const m of own) { m.parent?.remove(m); m.geometry?.dispose(); }
      own.length = 0;
      for (const g of groups.values()) root.remove(g);
      groups.clear(); pools.clear();
    },
    objects() { return own.slice(); }, // 預編譯用(src/main.js warmRuntime → game.interact.warmList)
    stats() { return { meshes: own.length, pools: [...pools.values()].map((p) => `${p.name}:${p.items.length}`) }; },
  };
  return kit;
}
