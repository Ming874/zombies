import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assets } from './sys/assets.js';
import { precompile } from './sys/warmup.js';
import { createDisplayGun } from './weapons/models.js';
import { WEAPONS } from './weapons/weapon.js';
import { sfx } from './audio.js';

// 金水商行:1F 便利商店改成的武器商店(world.shop 的櫃台;店面取自 test 分支 src/shop.js)。
// 本檔是店面實體(貨架、冰箱、櫃台、收銀機、武器牆、終端機、霓虹招牌、捲門);商品與購買介面在 src/ui.js(main 的規則:每 5 回合開店)。
// 店面在遊戲建立時就建好(碰撞盒要在 buildNav 之前登記);商店階段 setOpen(true) 捲門拉起、霓虹點亮,其他時間關閉。
const weaponName = (id) => WEAPONS[id]?.name || id;
const weaponPrice = (id) => WEAPONS[id]?.price ?? 999;
const pickupModel = () => null; // main 不賣裝備/補給品:展示櫃不放掉落物模型

// =====================================================================
// 店面實體
// =====================================================================
let seed = 4242;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const rr = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[(rnd() * a.length) | 0];
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function put(g, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return g.applyMatrix4(_m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)));
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.01, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
function norm(g) { // 合併前統一屬性(position/normal/uv,非索引)
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  return g.index ? g.toNonIndexed() : g;
}
// [perf6] 純色材質(MeshStandardMaterial、沒有任何貼圖/自發光/自訂 shader、不透明)依「完全相同的參數」
// 併成一個開了頂點色的共用材質(顏色寫進頂點色,和 color 一模一樣)→ 店面的展示品(槍、掉落物、商品)幾十種顏色變成少數幾個 draw call
const PLAIN_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];
const plainVC = new Map();
function plainOf(mat) {
  if (!mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.transparent || mat.alphaTest > 0 || mat.vertexColors || mat.wireframe || mat.fog === false || mat.toneMapped === false) return null;
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return null;
  if (mat.defines && Object.keys(mat.defines).some((k) => k !== 'STANDARD')) return null;
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) return null;
  if (PLAIN_KEYS.some((k) => mat[k]) || mat.opacity !== 1 || mat.blending !== THREE.NormalBlending || mat.depthWrite === false || mat.colorWrite === false) return null;
  const key = [mat.roughness, mat.metalness, mat.side, mat.flatShading ? 1 : 0, mat.envMapIntensity ?? 1, mat.shadowSide ?? '-'].join('|');
  let v = plainVC.get(key);
  if (!v) {
    v = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: mat.roughness, metalness: mat.metalness, side: mat.side, flatShading: mat.flatShading, envMapIntensity: mat.envMapIntensity ?? 1 });
    v.shadowSide = mat.shadowSide;
    v.name = 'shop:plain:' + key;
    plainVC.set(key, v);
  }
  return v;
}
// 依材質分桶的靜態幾何(最後合併成少數網格,降低 draw call)
class Buckets {
  constructor() { this.map = new Map(); this.copies = new Map(); }
  add(mat, g) { if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(norm(g)); }
  // 把整個物件樹(槍、掉落物模型)攤平成靜態幾何;mtx = 物件相對店面座標的矩陣
  // [perf6] 外來物件的材質用複本:展示槍和第一人稱槍共用材質時,同一個材質每幀在兩個場景(燈光數不同)之間切換 program
  // (每次切換 three 都要重算 program 參數)。複本的 program 鍵相同 → 不會多編 shader;userData(磨損 uniform)共用
  addObject(obj, mtx) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(mtx, o.matrixWorld));
      let m = this.copies.get(o.material);
      if (!m) {
        m = plainOf(o.material) ? o.material : o.material.clone();
        if (m !== o.material) { m.userData = o.material.userData; m.userData.shopCopy = true; this.owned = (this.owned || []).concat(m); }
        this.copies.set(o.material, m);
      }
      this.add(m, g);
    });
  }
  flush(parent, shadow = true) {
    // 純色材質 → 共用頂點色材質(同參數的併成一桶;顏色是線性值,與頂點色的解讀一致)
    for (const [mat, list] of [...this.map]) {
      const v = plainOf(mat);
      if (!v) continue;
      const c = mat.color;
      for (const g of list) {
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      this.map.delete(mat);
      if (!this.map.has(v)) this.map.set(v, []);
      this.map.get(v).push(...list);
    }
    for (const [mat, list] of this.map) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.userData.own = true; // 店面自己的合併幾何(dispose 時釋放;材質是共用的)
      m.castShadow = shadow && !mat.transparent;
      m.receiveShadow = !mat.transparent;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      for (const g of list) g.dispose();
    }
    this.map.clear();
  }
}

// ---------- 程式貼圖 ----------
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repeat); }
  return t;
}
function noise(x, w, h, amt, alpha = 1) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; if (alpha < 1) d[i + 3] *= alpha; }
  x.putImageData(img, 0, 0);
}
const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
function woodTex() {
  const [c, x] = cv(256, 256);
  x.fillStyle = '#6b4a30'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(${rnd() < 0.5 ? '40,24,12' : '150,110,72'},${rr(0.08, 0.3)})`;
    x.lineWidth = rr(0.6, 2.4);
    const y0 = rr(0, 256);
    x.beginPath(); x.moveTo(0, y0);
    for (let k = 0; k <= 8; k++) x.lineTo(k * 32, y0 + Math.sin(k * 0.8 + i) * rr(1, 5));
    x.stroke();
  }
  noise(x, 256, 256, 14);
  return tex(c, { repeat: [2, 1] });
}
function slatTex() { // 槽板牆:水平溝槽 + 鋁條
  const [c, x] = cv(256, 256);
  x.fillStyle = '#3b413c'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 8; k++) {
    const y = k * 32;
    x.fillStyle = '#1b1e1c'; x.fillRect(0, y + 22, 256, 7);
    x.fillStyle = '#8c9190'; x.fillRect(0, y + 22, 256, 1.5);
    x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(0, y, 256, 2);
  }
  noise(x, 256, 256, 10);
  return tex(c, { repeat: [3, 1.5] });
}
function pegTex() {
  const [c, x] = cv(128, 128);
  x.fillStyle = '#c9c6bb'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#4a4740';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 2.4, 0, 6.3); x.fill(); }
  noise(x, 128, 128, 10);
  return tex(c, { repeat: [6, 4] });
}
function stripTex() { // 層板價格條
  const [c, x] = cv(512, 32);
  x.fillStyle = '#e8c834'; x.fillRect(0, 0, 512, 32);
  x.font = `700 20px ${FONT}`; x.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    x.fillStyle = '#fff'; x.fillRect(i * 64 + 4, 4, 56, 24);
    x.fillStyle = '#1a1a1a'; x.fillText(`$${(rnd() * 90 + 9) | 0}`, i * 64 + 12, 17);
  }
  noise(x, 512, 32, 18);
  return tex(c, { repeat: [3, 1] });
}
function packTex(kind) { // 商品包裝:白底灰階設計,由 instanceColor 上色
  const [c, x] = cv(128, 128);
  x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 128, 128);
  if (kind === 'bag') {
    x.fillStyle = '#9b9b9b'; x.fillRect(0, 0, 128, 24); x.fillRect(0, 104, 128, 24);
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(64, 60, 40, 26, -0.2, 0, 6.3); x.fill();
    x.fillStyle = '#2a2a2a'; x.font = `900 22px ${FONT}`; x.textAlign = 'center'; x.fillText(pick(['洋芋片', '鮮蝦條', '餅乾', '玉米脆']), 64, 68);
    x.fillStyle = '#c8b070'; x.beginPath(); x.arc(40, 92, 9, 0, 6.3); x.arc(84, 90, 7, 0, 6.3); x.fill();
  } else if (kind === 'box') {
    x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, 128, 40);
    x.fillStyle = '#222'; x.font = `900 24px ${FONT}`; x.textAlign = 'center'; x.fillText(pick(['蘇打餅', '燕麥片', '夾心酥']), 64, 30);
    x.fillStyle = '#d6d0c0'; x.fillRect(16, 56, 96, 56);
    x.fillStyle = '#a89870'; for (let i = 0; i < 6; i++) x.fillRect(22 + (i % 3) * 30, 62 + ((i / 3) | 0) * 26, 22, 18);
  } else if (kind === 'cup') {
    x.fillStyle = '#8a8a8a'; x.fillRect(0, 40, 128, 50);
    x.fillStyle = '#fff'; x.font = `900 26px ${FONT}`; x.textAlign = 'center'; x.fillText('泡麵', 64, 74);
  } else if (kind === 'label') { // 寶特瓶/罐頭標籤(圓柱 UV 的中段)
    x.fillStyle = '#5c5c5c'; x.fillRect(0, 34, 128, 60);
    x.fillStyle = '#fff'; x.font = `900 18px ${FONT}`; x.textAlign = 'center';
    for (let i = 0; i < 2; i++) x.fillText(pick(['茶', 'COLA', '水', 'JUICE', '咖啡']), 32 + i * 64, 70);
    x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(0, 36, 128, 3);
  }
  noise(x, 128, 128, 10);
  return tex(c);
}
function neonTex(lines, w = 1024, h = 256) { // lines = [[text, color, size, y]]
  const [c, x] = cv(w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [t, col, size, y, font] of lines) {
    x.font = `${font || 700} ${size}px ${FONT}`;
    x.lineJoin = 'round';
    for (const [lw, a, blur] of [[size * 0.16, 0.35, size * 0.5], [size * 0.09, 0.9, size * 0.18], [size * 0.035, 1, 0]]) {
      x.save(); x.globalAlpha = a; x.shadowColor = col; x.shadowBlur = blur; x.strokeStyle = lw < size * 0.05 ? '#fff8ec' : col; x.lineWidth = lw;
      x.strokeText(t, w / 2, y * h); x.restore();
    }
  }
  return tex(c);
}
function signTex(draw, w = 512, h = 128) { const [c, x] = cv(w, h); draw(x, w, h); return tex(c); }
function glowTex() {
  const [c, x] = cv(128, 128);
  const g = x.createRadialGradient(64, 40, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,220,0.85)'); g.addColorStop(0.45, 'rgba(255,220,180,0.25)'); g.addColorStop(1, 'rgba(255,200,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return tex(c);
}
function shutterFallbackTex() { // 捲門貼圖載入前的程式版本(與下載貼圖的旋轉 UV 一致:u = 高度、v = 寬度)
  const [c, x] = cv(256, 256);
  x.fillStyle = '#9a9c98'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 8) { x.fillStyle = 'rgba(30,30,30,.55)'; x.fillRect(i, 0, 1.5, 256); x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(i + 2, 0, 1, 256); }
  noise(x, 256, 256, 22);
  return tex(c);
}

// ---------- 共用材質 ----------
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  MAT = {
    wood: std({ map: woodTex(), roughness: 0.55, metalness: 0 }),
    top: std({ color: 0x232527, roughness: 0.28, metalness: 0.1 }),
    kick: std({ color: 0x111213, roughness: 0.8 }),
    steel: std({ color: 0x8d9093, roughness: 0.38, metalness: 0.85 }),
    alu: std({ color: 0xb9bcbf, roughness: 0.32, metalness: 0.8 }),
    dark: std({ color: 0x24282a, roughness: 0.6, metalness: 0.35 }),
    paint: std({ color: 0xd8d5cc, roughness: 0.7 }),
    slat: std({ map: slatTex(), roughness: 0.55, metalness: 0.15 }),
    peg: std({ map: pegTex(), roughness: 0.8 }),
    shelf: std({ color: 0xdedcd4, roughness: 0.5, metalness: 0.3 }),
    strip: std({ map: stripTex(), roughness: 0.6 }),
    enamel: std({ color: 0xe9e8e2, roughness: 0.35, metalness: 0.05 }),
    rubber: std({ color: 0x151515, roughness: 0.9 }),
    velvet: std({ color: 0x2a1416, roughness: 1 }),
    cardboard: std({ color: 0x9a7a52, roughness: 0.95 }),
    glass: std({ color: 0xbfd6dc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.2, 1.0) }), // 吸頂燈面板(超過 1 讓 Bloom 帶光暈)
    lampCold: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.25, 1.35) }),
    track: std({ color: 0x1c1c1c, roughness: 0.5, metalness: 0.5 }),
    mag: std({ color: 0x1d1f20, roughness: 0.55, metalness: 0.4 }),
    brass: std({ color: 0xb08a3a, roughness: 0.3, metalness: 0.9 }),
    ammoBox: std({ map: signTex((x, w, h) => {
      const cols = ['#7a1d16', '#2c3a22', '#1d2a3a', '#5a4a1a'];
      for (let i = 0; i < 4; i++) {
        const X = (i % 2) * (w / 2), Y = ((i / 2) | 0) * (h / 2);
        x.fillStyle = cols[i]; x.fillRect(X, Y, w / 2, h / 2);
        x.fillStyle = '#efe6cf'; x.font = `900 ${h * 0.13}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(['9MM', '5.56', '7.62', '.357'][i], X + w / 4, Y + h * 0.17);
        x.font = `700 ${h * 0.07}px ${FONT}`; x.fillText('50 RDS · FMJ', X + w / 4, Y + h * 0.34);
      }
      noise(x, w, h, 14);
    }, 256, 128), roughness: 0.8 }),
    soldOut: std({ map: signTex((x, w, h) => {
      x.fillStyle = '#b89a6a'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#6a5030'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
      x.fillStyle = '#7a1a12'; x.font = `900 ${h * 0.5}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('缺貨 · 補貨中', w / 2, h / 2 + 3);
      noise(x, w, h, 24);
    }, 384, 128), roughness: 0.95, side: THREE.DoubleSide }),
  };
  return MAT;
}

// GLB 道具(Poly Haven CC0,見 public/credits/gameplay.md);載入失敗時保留程式生成的替代品
const BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
const MODELS = {
  register: 'cashregister_01/CashRegister_01_1k.gltf',
  monitor: 'television_02/television_02_1k.gltf',
  tv: 'television_01/Television_01_1k.gltf',
  shelf: 'shelf_01/Shelf_01_1k.gltf',
  rack: 'worn_metal_rack/worn_metal_rack_1k.gltf',
  clock: 'wall_clock/wall_clock_1k.gltf',
};
const gltfCache = {};
let loader = null;
function loadModel(key) {
  if (!gltfCache[key]) {
    loader ||= new GLTFLoader();
    // 下載排隊(src/sys/assets.js);材質在佇列內先調整好,交付前才會用最終的材質狀態在背景預編譯 shader
    gltfCache[key] = assets.task(() => loader.loadAsync(`${BASE}models/props/${MODELS[key]}`).then((g) => {
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const m = o.material;
        if (m && m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.22; m.depthWrite = false; m.roughness = 0.05; }
      });
      return g.scene;
    }), { meta: { model: key, shop: true }, prio: 25 });
  }
  return gltfCache[key];
}

// ---------- 量測店面空間 ----------
// 本地座標:原點 = 櫃台中心地面,+Z 朝顧客(店內),-Z 朝櫃台後牆,X 為橫向
function frame(S) {
  let fx, fz;
  if (S.stand) { fx = S.x - S.stand.x; fz = S.z - S.stand.z; } else { fx = -Math.sin(S.yaw || 0); fz = -Math.cos(S.yaw || 0); }
  const l = Math.hypot(fx, fz) || 1;
  fx /= l; fz /= l;
  // 對齊到最近的軸(網格地圖)
  if (Math.abs(fx) > Math.abs(fz)) { fx = Math.sign(fx); fz = 0; } else { fz = Math.sign(fz) || 1; fx = 0; }
  const rot = Math.atan2(-fx, -fz);
  const ax = { x: Math.cos(rot), z: -Math.sin(rot) }, az = { x: Math.sin(rot), z: Math.cos(rot) }; // 本地 X / Z 在世界的方向
  return { rot, ax, az, toWorld: (lx, lz) => ({ x: S.x + ax.x * lx + az.x * lz, z: S.z + ax.z * lx + az.z * lz }) };
}

function measure(world, S, F) {
  const y0 = S.y || 0;
  const R = { back: 2.8, front: 5, leftB: 4, rightB: 4, leftF: 5, rightF: 5, ceil: 3.2, solidL: false, solidR: false, frontOpen: true, doors: [] };
  const toL = (x, z) => ({ x: (x - S.x) * F.ax.x + (z - S.z) * F.ax.z, z: (x - S.x) * F.az.x + (z - S.z) * F.az.z });
  const L = world.layout;
  const cell = S.cells?.[0];
  const zone = L && cell ? L.zoneAt(cell.level ?? S.level, cell.c, cell.r) : null;
  const rect = zone?.rects.find(([c0, r0, c1, r1]) => cell.c >= c0 && cell.c <= c1 && cell.r >= r0 && cell.r <= r1);
  if (rect) {
    const [c0, r0, c1, r1] = rect, C = L.CELL, li = cell.level ?? S.level;
    const pts = [toL(c0 * C, r0 * C), toL((c1 + 1) * C, (r1 + 1) * C)];
    R.leftB = R.leftF = -Math.min(pts[0].x, pts[1].x);
    R.rightB = R.rightF = Math.max(pts[0].x, pts[1].x);
    R.back = -Math.min(pts[0].z, pts[1].z);
    R.front = Math.max(pts[0].z, pts[1].z);
    R.ceil = L.CEIL_H ?? 3.4;
    // 牆的種類:取矩形外側一圈的字元
    const edge = (dx, dz) => {
      const out = [];
      if (dx) { const c = dx < 0 ? c0 - 1 : c1 + 1; for (let r = r0; r <= r1; r++) out.push({ ch: L.charAt(li, c, r), x: (c + 0.5) * C, z: (r + 0.5) * C }); }
      else { const r = dz < 0 ? r0 - 1 : r1 + 1; for (let c = c0; c <= c1; c++) out.push({ ch: L.charAt(li, c, r), x: (c + 0.5) * C, z: (r + 0.5) * C }); }
      return out;
    };
    const side = (lx, lz) => { // 本地方向 → 世界方向的那一邊
      const wx = Math.round(F.ax.x * lx + F.az.x * lz), wz = Math.round(F.ax.z * lx + F.az.z * lz);
      return edge(wx, wz);
    };
    const solid = (cells) => cells.every((q) => '#EX'.includes(q.ch));
    R.solidL = solid(side(-1, 0));
    R.solidR = solid(side(1, 0));
    const fr = side(0, 1);
    R.frontOpen = false;
    // 門口:相鄰的門格合併成一扇門 {x, w}
    const dx = fr.filter((q) => q.ch === '+').map((q) => toL(q.x, q.z).x).sort((a, b) => a - b);
    for (const x of dx) {
      const last = R.doors[R.doors.length - 1];
      if (last && x - last.x1 < C + 0.1) last.x1 = x; else R.doors.push({ x0: x, x1: x });
    }
    R.doors = R.doors.map((d) => ({ x: (d.x0 + d.x1) / 2, w: d.x1 - d.x0 + C }));
  } else {
    // 舊地圖/找不到區域:用射線量(0.5m 高度在窗台下,窗戶也會擋)
    const ray = (lx, lz, dx, dz, max, h = 0.5) => {
      const p = F.toWorld(lx, lz);
      return world.rayDistance(p.x, y0 + h, p.z, F.ax.x * dx + F.az.x * dz, 0, F.ax.z * dx + F.az.z * dz, max);
    };
    R.back = Math.max(1.6, ray(0, 0, 0, -1, 6));
    const bz = -Math.min(R.back * 0.55, 1.4);
    R.leftB = ray(0, bz, -1, 0, 9); R.rightB = ray(0, bz, 1, 0, 9);
    R.front = Math.min(6.5, ray(0, 1, 0, 1, 12) + 1);
    R.leftF = Math.min(7, ray(0, 2, -1, 0, 12)); R.rightF = Math.min(7, ray(0, 2, 1, 0, 12));
    R.solidL = R.leftF < 6.9 && Math.abs(ray(0, 2, -1, 0, 12, 1.6) - R.leftF) < 0.2;
    R.solidR = R.rightF < 6.9 && Math.abs(ray(0, 2, 1, 0, 12, 1.6) - R.rightF) < 0.2;
    R.frontOpen = R.front >= 6.4;
    const up = world.rayDistance(S.x, y0 + 1.5, S.z, 0, 1, 0, 4);
    R.ceil = up < 3.9 ? 1.5 + up : 3.2;
  }
  return R;
}

// ---------- 模型零件 ----------
// 展示槍:createDisplayGun 可能還不支援新武器(合併前),失敗就回傳 null
function displayGun(id) {
  try { return createDisplayGun(id); } catch { return null; }
}
// 槍放上牆:側面朝顧客(+Z)、槍口朝 -X;回傳以中心對齊的 Group
function gunOnWall(id) {
  const gun = displayGun(id);
  if (!gun) return null;
  const wrap = new THREE.Group();
  gun.rotation.y = Math.PI / 2;
  wrap.add(gun);
  wrap.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(wrap);
  const c = b.getCenter(new THREE.Vector3());
  gun.position.sub(c);
  wrap.userData.size = b.getSize(new THREE.Vector3());
  return wrap;
}

// =====================================================================
export class Shop {
  // [draws] 店面整組(含店招、捲門)在玩家位置看不到時(src/map/hospital/vis.js 的 PVS)不畫
  _pvs() {
    const H = this.game?.hospital;
    if (!H?.pvsBoxRegions) return true;
    if (!this._pvsQ) { this.group.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(this.group); this._pvsQ = H.pvsBoxRegions(b.min.y + 0.3, b.min.x, b.min.z, b.max.x, b.max.z); }
    return H.pvsTestRegions(this._pvsQ);
  }
  // opts.game:用來預先編譯 shader;opts.models = false 可關閉 GLB 載入(測試用)
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.game = opts.game || null;
    const S = (this.S = world.shop);
    this.F = frame(S);
    this.R = measure(world, S, this.F);
    this.y = S.y || 0;
    this.open = false;
    this.k = 0; // 捲門開啟程度 0..1
    this.target = 0;
    this.neon = 0;
    this.t = 0;
    this.boxes = [];
    this.anim = [];
    this.levelId = world.layout?.levels?.[S.level]?.id || '';
    // 店面所在區域名稱(提示文字用)與店名字樣:都從地圖資料來,地圖可用 layout.shopBrand 覆寫
    this.zoneName = (world.zoneAt ? world.zoneAt(S.x, (S.y || 0) + 0.2, S.z) : null)?.name || '';
    this.brand = { sign: '金水商行（臨時補給點）', en: 'KIM-SUI STORE · SUPPLY POINT', term: '金水商行 · 收銀機', ...(world.layout?.shopBrand || {}) };
    this.group = new THREE.Group();
    this.group.position.set(S.x, this.y, S.z);
    this.group.rotation.y = this.F.rot;
    this.detail = new THREE.Group(); // 遠距離時隱藏的細節(商品、槍、模型)
    this.group.add(this.detail);
    const st = S.stand || this.F.toWorld(0, 1.8);
    this.standPos = new THREE.Vector3(st.x, this.y, st.z);
    this.pos = new THREE.Vector3(S.x, this.y, S.z);
    seed = 4242;
    this.B = new Buckets(); // 靜態、常駐
    this.D = new Buckets(); // 靜態、細節
    // [perf] opts.steps:建構改成分段(this.steps 是 generator,呼叫端 yield* 跑完;載入時分時執行)
    const self = this, steps = (function* () { yield* self._buildSteps(); self._finishBuild(scene, opts); })();
    if (opts.steps) { this.steps = steps; return; }
    for (const _ of steps) { /* 同步跑完 */ }
  }

  _finishBuild(scene, opts) {
    this._flushProducts();
    this.B.flush(this.group);
    this.D.flush(this.detail, false);
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.setOpen(false, true);
    if (opts.models !== false) this._loadModels();
  }

  // ---------- 碰撞盒(本地 AABB → 世界 AABB) ----------
  _collide(x0, x1, z0, z1, h = 1.05) {
    const a = this.F.toWorld(x0, z0), b = this.F.toWorld(x1, z1);
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, sx = Math.abs(a.x - b.x), sz = Math.abs(a.z - b.z);
    this.boxes.push(this.world.addBox(cx, cz, sx, sz, h, this.y));
  }

  *_buildSteps() {
    const M = mats(), R = this.R, B = this.B, D = this.D;
    const back = R.back, ceil = R.ceil;
    const L = Math.min(R.leftB, 6.5), Rt = Math.min(R.rightB, 6.5);
    const fasciaY = Math.min(2.45, ceil - 0.55);
    this.fasciaY = fasciaY;
    const CW = 1.85; // 中央櫃台半寬

    // ===== 櫃台 =====
    B.add(M.wood, put(box(CW * 2, 0.86, 0.66), 0, 0.53, 0));
    B.add(M.kick, put(box(CW * 2 - 0.04, 0.1, 0.6), 0, 0.05, -0.02));
    B.add(M.top, put(rbox(CW * 2 + 0.08, 0.045, 0.8, 0.012), 0, 0.985, 0.02));
    B.add(M.alu, put(box(CW * 2 + 0.08, 0.02, 0.012), 0, 0.95, 0.42)); // 前緣收邊
    B.add(M.dark, put(box(CW * 2 - 0.1, 0.03, 0.5), 0, 0.42, -0.1)); // 內側層板
    // 櫃台正面標誌板
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshStandardMaterial({
      map: signTex((x, w, h) => {
        x.fillStyle = '#1d3a33'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#c9b27a'; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
        x.fillStyle = '#e8dcc0'; x.font = `900 58px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(this.brand.sign, w / 2, h * 0.42);
        x.font = `700 22px ${FONT}`; x.fillStyle = '#c9b27a'; x.fillText(this.brand.en, w / 2, h * 0.78);
        noise(x, w, h, 16);
      }, 1024, 248), roughness: 0.6,
    }));
    plaque.position.set(0, 0.6, 0.334);
    this.group.add(plaque);

    // ===== 兩側玻璃展示櫃(櫃台延伸到牆,把櫃台後方完全隔開) =====
    const cases = [];
    for (const s of [-1, 1]) {
      const x0 = s * CW, x1 = s * (s < 0 ? L : Rt);
      const w = Math.abs(x1 - x0);
      if (w < 0.3) continue;
      const cx = (x0 + x1) / 2;
      B.add(M.wood, put(box(w, 0.62, 0.62), cx, 0.31 + 0.04, 0));
      B.add(M.kick, put(box(w - 0.02, 0.08, 0.56), cx, 0.04, -0.02));
      B.add(M.velvet, put(box(w - 0.04, 0.02, 0.58), cx, 0.67, 0));
      for (const [yy, zz, sx, sy, sz] of [[0.66, 0.31, w, 0.025, 0.025], [0.66, -0.31, w, 0.025, 0.025], [1.0, 0.31, w, 0.025, 0.025], [1.0, -0.31, w, 0.025, 0.025]]) B.add(M.alu, put(box(sx, sy, sz), cx, yy, zz));
      for (let k = 0; k <= Math.max(1, Math.round(w / 1.2)); k++) {
        const xx = x0 + (x1 - x0) * (k / Math.max(1, Math.round(w / 1.2)));
        for (const zz of [0.31, -0.31]) B.add(M.alu, put(box(0.025, 0.34, 0.025), xx, 0.83, zz));
      }
      // 玻璃(前面 + 頂面)
      const glass = new THREE.Mesh(mergeGeometries([norm(put(new THREE.PlaneGeometry(w, 0.34), cx, 0.83, 0.312)), norm(put(new THREE.PlaneGeometry(w, 0.62), cx, 1.0, 0, 0, -Math.PI / 2))]), M.glass);
      glass.renderOrder = 2;
      this.group.add(glass);
      cases.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1) });
      // 燈條
      D.add(M.lamp, put(box(w - 0.1, 0.012, 0.02), cx, 0.985, 0.27));
    }
    // 展示櫃內的商品:手榴彈、醫療包、彈藥箱、背心
    const shows = ['grenade', 'med', 'ammo', 'vest', 'grenade', 'med', 'bigammo', 'vest_h'];
    let si = 0;
    for (const c of cases) {
      for (let x = c.x0 + 0.35; x < c.x1 - 0.3; x += 0.62) {
        const kind = shows[si++ % shows.length];
        const obj = pickupModel(kind);
        if (!obj) continue;
        const s = kind.startsWith('vest') ? 0.62 : kind === 'grenade' ? 1.3 : kind === 'bigammo' ? 0.62 : 0.85;
        const y = kind.startsWith('vest') ? 0.69 : 0.68 + (obj.userData.half || 0.1) * s;
        const mtx = new THREE.Matrix4().compose(_p.set(x, y, 0.02), _q.setFromEuler(_e.set(kind.startsWith('vest') ? -1.35 : 0, rr(-0.5, 0.5), 0)), _s.set(s, s, s));
        D.addObject(obj, mtx);
      }
    }
    this._collide(-L, Rt, -0.42, 0.42, 1.01); // [physics] 碰撞頂 = 檯面(1.0075)
    // 櫃台上方到天花板的隱形牆(只擋人與殭屍的移動;子彈、視線、聲音、物理照常穿過):
    // 跳躍最高 0.63m + 可踏上 0.46m > 檯面 1.01m,玩家會跳上櫃台(殭屍上不去的安全台)、掉進後面,貼著櫃台原地跳又翻不回來
    this._collide(-L, Rt, -0.42, 0.42, ceil);
    this.boxes[this.boxes.length - 1].moveOnly = true;
    this._cw = { L, Rt };

    // ===== 捲門上方的招牌箱(捲門收在裡面) =====
    const fw = L + Rt, fcx = (Rt - L) / 2, fh = ceil - fasciaY;
    B.add(M.dark, put(box(fw, fh, 0.08), fcx, fasciaY + fh / 2, 0.52));
    B.add(M.dark, put(box(fw, 0.06, 0.48), fcx, fasciaY + 0.03, 0.3));
    B.add(M.dark, put(box(fw, fh, 0.05), fcx, fasciaY + fh / 2, 0.06));
    B.add(M.alu, put(box(fw, 0.03, 0.03), fcx, fasciaY + 0.015, 0.57));
    // 招牌燈箱(左右兩側的印刷字)
    const lbMat = new THREE.MeshStandardMaterial({
      map: signTex((x, w, h) => {
        x.fillStyle = '#122a24'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#d8ccb0'; x.font = `700 ${h * 0.44}px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'center';
        x.fillText('彈藥 · 醫療 · 防具 · 武器', w / 2, h * 0.44);
        x.font = `600 ${h * 0.17}px ${FONT}`; x.fillStyle = '#8fb3a6'; x.fillText('AMMO · MEDICAL · ARMOR · WEAPONS', w / 2, h * 0.82);
        noise(x, w, h, 12);
      }, 1024, 160), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5,
    });
    lbMat.emissiveMap = lbMat.map;
    this.lightbox = lbMat;
    const lbH = Math.min(0.5, fh - 0.18);
    for (const s of [-1, 1]) {
      const x0 = s * 1.6, x1 = s * (s < 0 ? L : Rt) - s * 0.2;
      const w = Math.abs(x1 - x0);
      if (w < 1) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, lbH), lbMat);
      m.position.set((x0 + x1) / 2, fasciaY + fh / 2, 0.565);
      this.group.add(m);
    }
    // 霓虹招牌「金水商行 OPEN」
    this.neonMat = new THREE.MeshBasicMaterial({ map: neonTex([['金水商行', '#ff9a3c', 150, 0.4, 900], ['OPEN', '#ff3b30', 74, 0.84, 900]]), transparent: true, depthWrite: false, toneMapped: false });
    const neonW = Math.min(2.6, 2 * CW + 0.4), neonH = Math.min(fh - 0.1, neonW / 4 * 1.05);
    B.add(M.dark, put(box(neonW * 0.86, neonH * 0.92, 0.02), 0, fasciaY + fh / 2, 0.565));
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(neonW, neonW / 4), this.neonMat);
    neon.position.set(0, fasciaY + fh / 2, 0.59);
    neon.scale.y = Math.min(1, neonH / (neonW / 4));
    neon.renderOrder = 3;
    this.group.add(neon);
    this.neonGlow = new THREE.Mesh(new THREE.PlaneGeometry(neonW * 1.5, neonW / 2.4), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.neonGlow.position.set(0, fasciaY + fh / 2 - 0.05, 0.62);
    this.group.add(this.neonGlow);

    // ===== 捲門(三段) =====
    yield;
    this._shutters(cases, CW, fasciaY);

    // ===== 櫃台後方:武器展示牆、鐵架、層架 =====
    yield;
    yield* this._armory(L, Rt, back, ceil, CW);
    yield;

    // ===== 櫃台上:收銀機、終端機、小物 =====
    this._counterTop(CW);

    // ===== 顧客區:貨架、冰箱、低櫃、冰櫃 =====
    yield;
    this._floor(R);
    yield;

    // ===== 天花板燈與主光源 =====
    const fl = Math.min(R.leftF, 6), fr = Math.min(R.rightF, 6), front = Math.min(R.front, 6);
    for (const lx of [-fl * 0.5, fr * 0.5]) for (const lz of [front * 0.3, front * 0.75]) {
      if (lz < 0.9) continue;
      B.add(M.dark, put(box(0.66, 0.05, 1.26), lx, ceil - 0.025, lz));
      B.add(M.lamp, put(box(0.58, 0.012, 1.18), lx, ceil - 0.055, lz));
    }
    B.add(M.dark, put(box(0.66, 0.05, 1.26), fcx, ceil - 0.025, -back * 0.55));
    B.add(M.lampCold, put(box(0.58, 0.012, 1.18), fcx, ceil - 0.055, -back * 0.55));
    // 主光源直接加在場景(不跟著群組隱藏,避免場景光源數量改變導致 shader 重編)
    this.light = new THREE.PointLight(0xffd9a8, 5.5, 12, 1.5);
    const lp = this.F.toWorld(0, Math.min(0.7, front * 0.2)); // 櫃台正上方:同時照亮櫃台、武器牆與店內
    this.light.position.set(lp.x, this.y + ceil - 0.45, lp.z);
    this.scene.add(this.light);
  }

  _shutters(cases, CW, fasciaY) {
    const segs = [{ x0: -CW, x1: CW }, ...cases];
    const H = fasciaY - 1.0;
    this.shutterH = H;
    this.shutterMat = new THREE.MeshStandardMaterial({ map: shutterFallbackTex(), color: 0xb8bab4, roughness: 0.5, metalness: 0.65, side: THREE.DoubleSide });
    // 下載的捲門貼圖:板條區在 u 0.005..0.70(對應高度)、v 0.38..0.751(對應寬度 1.08m)
    const U0 = 0.005, UH = 0.773 / 2.4, V0 = 0.38, VW = 0.371 / 1.08;
    this.shutters = [];
    const decal = new THREE.MeshStandardMaterial({
      map: signTex((x, w, h) => {
        x.clearRect(0, 0, w, h);
        x.save(); x.translate(w / 2, h / 2); x.rotate(-0.04);
        x.fillStyle = 'rgba(170,20,14,.9)'; x.font = `900 ${h * 0.34}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.shadowColor = 'rgba(150,10,5,.8)'; x.shadowBlur = 6;
        x.fillText('打完這一波才開門', 0, -h * 0.12);
        x.font = `700 ${h * 0.17}px ${FONT}`; x.fillText('招魂燈亮著　不要敲門', 0, h * 0.26);
        x.restore();
        x.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 900; i++) { x.globalAlpha = rnd() * 0.8; x.fillRect(rnd() * w, rnd() * h, rr(1, 4), rr(1, 3)); }
        for (let i = 0; i < 22; i++) { x.globalAlpha = 0.6; x.fillRect(rr(0, w), rr(0, h * 0.4), 2, rr(10, 60)); }
      }, 1024, 256), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2,
    });
    segs.forEach((sg, i) => {
      const w = sg.x1 - sg.x0, n = Math.max(1, Math.ceil(w / 1.08));
      const parts = [];
      for (let k = 0; k < n; k++) {
        const a = sg.x0 + (w * k) / n, b = sg.x0 + (w * (k + 1)) / n, tw = b - a;
        const g = new THREE.PlaneGeometry(tw, H);
        const uv = g.attributes.uv;
        for (let j = 0; j < uv.count; j++) { // 旋轉 UV:寬度 → v、高度 → u
          const px = uv.getX(j), py = uv.getY(j);
          uv.setXY(j, U0 + py * H * UH, V0 + px * tw * VW);
        }
        parts.push(norm(put(g, (a + b) / 2, H / 2, 0)));
      }
      const grp = new THREE.Group();
      const sh = new THREE.Mesh(mergeGeometries(parts), this.shutterMat);
      sh.castShadow = sh.receiveShadow = true;
      grp.add(sh);
      const bar = new THREE.Mesh(box(w, 0.06, 0.07), mats().steel);
      bar.position.set((sg.x0 + sg.x1) / 2, 0.03, 0);
      grp.add(bar);
      if (i === 0) { // 中央捲門:塗鴉警語 + 鎖扣
        const d = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.9, 3), Math.min(H * 0.8, 0.75)), decal);
        d.position.set(0, H * 0.55, 0.012);
        grp.add(d);
        const lock = new THREE.Mesh(rbox(0.07, 0.1, 0.05, 0.01), mats().steel);
        lock.position.set(0, -0.02, 0.05);
        grp.add(lock);
      }
      grp.position.set(0, 1.0, 0.3);
      this.group.add(grp);
      this.shutters.push({ grp, delay: i === 0 ? 0 : 0.18 * i });
      // 導軌
      for (const xx of [sg.x0, sg.x1]) this.B.add(mats().steel, put(box(0.05, H, 0.09), xx, 1.0 + H / 2, 0.3));
    });
    // 載入下載的捲門 PBR 貼圖(失敗就維持程式貼圖)
    const tl = new THREE.TextureLoader(), dir = `${BASE}models/props/rollershutter_door/textures/rollershutter_door_`;
    assets.task(() => tl.loadAsync(`${dir}diff_1k.jpg`), { meta: { model: 'shutter', shop: true }, prio: 25 }).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      this.shutterMat.map = t; this.shutterMat.color.set(0x9a9c98); this.shutterMat.needsUpdate = true;
      return assets.task(() => Promise.all([tl.loadAsync(`${dir}nor_gl_1k.jpg`), tl.loadAsync(`${dir}arm_1k.jpg`)]), { meta: { model: 'shutter', shop: true }, prio: 26 });
    }).then(([n, arm]) => {
      this.shutterMat.normalMap = n;
      this.shutterMat.roughnessMap = this.shutterMat.metalnessMap = arm;
      this.shutterMat.roughness = 1; this.shutterMat.metalness = 0.45; // 沒有環境貼圖時金屬度太高會發黑
      this.shutterMat.needsUpdate = true;
    }).catch(() => {});
  }

  *_armory(L, Rt, back, ceil, CW) {
    const M = mats(), B = this.B, D = this.D;
    const wz = -back + 0.2; // 獨立式槽板架,離牆 20cm(不受牆面裝飾影響)
    const pw = Math.min(5, L + Rt - 1.4), pcx = (Rt - L) / 2;
    for (const s of [-1, 1]) B.add(M.dark, put(box(0.06, 2.6, 0.18), pcx + s * (pw / 2 + 0.09), 1.3, wz - 0.06)); // 立柱
    B.add(M.dark, put(box(pw + 0.24, 0.06, 0.3), pcx, 0.03, wz - 0.06)); // 底座
    B.add(M.dark, put(box(pw, 0.8, 0.04), pcx, 0.42, wz - 0.02)); // 下方背板
    // 槽板牆 + 外框
    const slat = new THREE.Mesh(new THREE.PlaneGeometry(pw, 1.75), M.slat);
    slat.material.map.repeat.set(pw / 1.2, 1.75 / 1.2);
    slat.position.set(pcx, 1.72, wz + 0.03);
    slat.receiveShadow = true;
    this.group.add(slat);
    B.add(M.dark, put(box(pw + 0.12, 1.87, 0.03), pcx, 1.72, wz + 0.012));
    for (const s of [-1, 1]) B.add(M.alu, put(box(0.04, 1.8, 0.05), pcx + s * (pw / 2 + 0.03), 1.72, wz + 0.04));
    B.add(M.alu, put(box(pw + 0.1, 0.04, 0.05), pcx, 2.62, wz + 0.04));
    B.add(M.alu, put(box(pw + 0.1, 0.04, 0.05), pcx, 0.83, wz + 0.04));
    // 「槍枝 GUNS」小燈箱
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.26), new THREE.MeshBasicMaterial({
      map: signTex((x, w, h) => {
        x.fillStyle = '#0d0f0e'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#f0e6d0'; x.font = `900 ${h * 0.62}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('槍枝 GUNS', w / 2, h / 2 + 2);
      }, 512, 102), color: new THREE.Color(1.1, 1.05, 0.95),
    }));
    sign.position.set(pcx, Math.min(ceil - 0.3, 2.86), wz + 0.03);
    this.group.add(sign);
    // 展示槍(真實尺寸)
    const RACK = [
      { id: 'ak47', x: -1.18, y: 1.84 }, { id: 'm4a1', x: 1.18, y: 1.84 }, { id: 'revolver', x: 0, y: 1.4 },
    ];
    this.tagSlots = [];
    const washGeo = [];
    for (const r of RACK) {
      yield;
      const x = pcx + r.x * Math.min(1, pw / 5);
      const gun = gunOnWall(r.id);
      const len = gun ? gun.userData.size.x : r.id === 'barrett' ? 1.45 : r.id === 'shotgun' ? 1.0 : 0.85;
      if (gun) D.addObject(gun, new THREE.Matrix4().compose(_p.set(x, r.y, wz + 0.11), _q.identity(), _s.set(1, 1, 1)));
      else { // 尚未到貨:牛皮紙缺貨卡
        D.add(M.soldOut, put(new THREE.PlaneGeometry(0.5, 0.17), x, r.y, wz + 0.05, 0, 0, rr(-0.06, 0.06)));
        B.add(M.steel, put(cyl(0.004, 0.004, 0.06, 6), x, r.y + 0.1, wz + 0.06, 0, Math.PI / 2));
      }
      for (const s of [-1, 1]) { // 掛鉤
        B.add(M.steel, put(cyl(0.006, 0.006, 0.12, 6), x + s * len * 0.28, r.y - 0.07, wz + 0.09, 0, Math.PI / 2));
        B.add(M.steel, put(cyl(0.006, 0.006, 0.04, 6), x + s * len * 0.28, r.y - 0.055, wz + 0.15));
      }
      this.tagSlots.push({ id: r.id, x, y: r.y - 0.19 - (r.id === 'barrett' ? 0.03 : 0), z: wz + 0.045 });
      washGeo.push(norm(put(new THREE.PlaneGeometry(len + 0.7, 0.75), x, r.y + 0.02, wz + 0.036)));
      // 吸頂軌道燈
      B.add(M.track, put(cyl(0.035, 0.03, 0.14, 10), x, ceil - 0.2, wz + 0.9, 0, -0.6));
      B.add(M.track, put(box(0.02, 0.14, 0.02), x, ceil - 0.08, wz + 0.88));
      D.add(M.lamp, put(cyl(0.022, 0.022, 0.01, 10), x, ceil - 0.27, wz + 0.86, 0, -0.6));
    }
    B.add(M.track, put(box(pw, 0.03, 0.05), pcx, ceil - 0.015, wz + 0.88));
    // 配件:兩側小層板上的子彈盒、掛鉤上的彈匣
    for (const s of [-1, 1]) {
      const ax = pcx + s * (pw / 2 - 0.5);
      B.add(M.shelf, put(box(0.78, 0.02, 0.2), ax, 1.0, wz + 0.13));
      for (const k of [-1, 1]) B.add(M.steel, put(box(0.02, 0.1, 0.18), ax + k * 0.34, 0.96, wz + 0.12));
      for (let k = 0; k < 5; k++) if (rnd() > 0.15) D.add(M.ammoBox, put(box(0.12, 0.075, 0.085), ax - 0.3 + k * 0.15, 1.048, wz + 0.12, rr(-0.12, 0.12)));
      for (let k = 0; k < 3; k++) D.add(M.ammoBox, put(box(0.12, 0.075, 0.085), ax - 0.15 + k * 0.15, 1.123, wz + 0.12, rr(-0.15, 0.15)));
      for (let k = 0; k < 3; k++) {
        D.add(M.mag, put(rbox(0.032, 0.2, 0.075, 0.008), ax - 0.15 + k * 0.15, 1.6, wz + 0.1, 0, 0, s * 0.1));
        B.add(M.steel, put(cyl(0.005, 0.005, 0.1, 6), ax - 0.15 + k * 0.15, 1.72, wz + 0.09, 0, Math.PI / 2));
      }
    }
    this.wash = new THREE.Mesh(mergeGeometries(washGeo), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffd6a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.wash);
    // 價格吊牌(一張貼圖集,狀態改變時重畫)
    const [c, x] = cv(512, 256);
    this.tagCanvas = { c, x };
    this.tagTex = tex(c);
    const tg = [];
    this.tagSlots.forEach((t, i) => {
      const g = new THREE.PlaneGeometry(0.44, 0.11);
      const uv = g.attributes.uv, col = i % 2, row = (i / 2) | 0;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, (col + uv.getX(j)) / 2, 1 - (row + 1 - uv.getY(j)) / 4);
      tg.push(norm(put(g, t.x, t.y, t.z)));
    });
    this.tags = new THREE.Mesh(mergeGeometries(tg), new THREE.MeshStandardMaterial({ map: this.tagTex, roughness: 0.8, emissive: 0xffffff, emissiveMap: this.tagTex, emissiveIntensity: 0.06 }));
    this.group.add(this.tags);
    this.drawTags(null);

    // 角落:鐵架(GLB)與木層架(GLB),放彈藥箱、醫療包、紙箱
    const side = (s) => (s < 0 ? L : Rt);
    for (const s of [-1, 1]) {
      const edge = s * (side(s) - 0.55);
      if (Math.abs(edge - pcx) < pw / 2 + 0.5) continue; // 空間不夠
      this._slot('rack', { x: edge, y: 0, z: -back + 0.34, ry: 0 }, () => this._fallbackRack());
      for (const [yy, kind, sc] of [[0.42, 'ammo', 1], [0.42, 'ammo', 1], [0.91, 'bigammo', 0.8], [1.4, 'med', 0.8], [1.4, 'ammo', 0.9], [0.02, 'bigammo', 0.85]]) {
        if (rnd() < 0.2) continue;
        const obj = pickupModel(kind);
        if (!obj) continue;
        D.addObject(obj, new THREE.Matrix4().compose(_p.set(edge + rr(-0.25, 0.25), yy + (obj.userData.half || 0.1) * sc + 0.01, -back + 0.33), _q.setFromEuler(_e.set(0, rr(-0.3, 0.3), 0)), _s.set(sc, sc, sc)));
      }
      const mid = s * (pw / 2 + 0.8) + pcx;
      if (Math.abs(mid) + 0.55 < side(s) - 1.05) {
        this._slot('shelf', { x: mid, y: 0, z: -back + 0.02, ry: 0 }, () => this._fallbackShelf());
        // Shelf_01 的層板高度(由模型量得)
        for (const h of [0.379, 0.661, 0.942, 1.224, 1.505, 1.787]) {
          for (let k = 0; k < 4; k++) {
            if (rnd() < 0.3) continue;
            const xx = mid - 0.36 + k * 0.24 + rr(-0.03, 0.03), r = rnd();
            if (r < 0.35) D.add(M.cardboard, put(box(0.2, 0.16, 0.2), xx, h + 0.08, -back + 0.14, rr(-0.2, 0.2)));
            else if (r < 0.6) D.add(M.ammoBox, put(box(0.12, 0.075, 0.085), xx, h + 0.038, -back + 0.15, rr(-0.3, 0.3)));
            else {
              const o = pickupModel(r < 0.8 ? 'med' : 'ammo'), sc = 0.5;
              if (o) D.addObject(o, new THREE.Matrix4().compose(_p.set(xx, h + (o.userData.half || 0.1) * sc + 0.005, -back + 0.14), _q.setFromEuler(_e.set(0, rr(-0.3, 0.3), 0)), _s.set(sc, sc, sc)));
            }
          }
        }
      }
    }
    // 時鐘(停在 3:07)
    this._slot('clock', { x: pcx + Math.min(2.4, pw / 2 + 0.2), y: Math.min(ceil - 0.32, 2.95), z: -back + 0.02, ry: 0 }, () => this._fallbackClock(), (o) => {
      o.traverse((m) => {
        if (/hour/.test(m.name)) m.rotation.z = -(3 + 7 / 60) / 12 * Math.PI * 2;
        if (/minute/.test(m.name)) m.rotation.z = -7 / 60 * Math.PI * 2;
        if (/second/.test(m.name)) m.rotation.z = -41 / 60 * Math.PI * 2;
      });
    });
  }

  _counterTop(CW) {
    const M = mats(), D = this.D;
    // 收銀機(GLB,抽屜朝店員)
    this._slot('register', { x: -CW + 0.45, y: 1.007, z: -0.06, ry: Math.PI + 0.25 }, () => this._fallbackRegister(), (o) => {
      o.traverse((m) => { if (m.isMesh && m.material?.color && !m.material.transparent) { m.material = m.material.clone(); m.material.color.multiplyScalar(0.62); } }); // 舊收銀機漆面偏白,壓暗一點
    });
    // 終端機螢幕(GLB 銀色 CRT,螢幕朝顧客)
    this._slot('monitor', { x: CW - 0.5, y: 1.007, z: -0.1, ry: -0.3 }, () => this._fallbackMonitor());
    const [c, x] = cv(256, 192);
    this.term = { c, x, t: 0 };
    this.termTex = tex(c);
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.255, 0.19), new THREE.MeshBasicMaterial({ map: this.termTex, toneMapped: false }));
    this.screen.position.set(CW - 0.5 - 0.009, 1.007 + 0.233, -0.1 + 0.129);
    this.screen.rotation.set(-0.06, -0.3, 0);
    this.group.add(this.screen);
    this.drawTerminal(true);
    // 服務鈴、刷卡機、壓克力立牌
    D.add(M.dark, put(cyl(0.04, 0.045, 0.018, 16), 0.15, 1.016, 0.2));
    D.add(M.brass, put(new THREE.SphereGeometry(0.034, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.15, 1.025, 0.2));
    D.add(M.kick, put(rbox(0.08, 0.03, 0.16, 0.01), -0.35, 1.022, 0.12, 0.2, 0.2));
    const stand = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshStandardMaterial({
      map: signTex((x2, w, h) => {
        x2.fillStyle = '#f2ece0'; x2.fillRect(0, 0, w, h);
        x2.fillStyle = '#b8281c'; x2.fillRect(0, 0, w, h * 0.22);
        x2.fillStyle = '#fff'; x2.font = `900 ${h * 0.15}px ${FONT}`; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('金水商行 營業須知', w / 2, h * 0.11);
        x2.fillStyle = '#222'; x2.font = `700 ${h * 0.13}px ${FONT}`;
        ['休息時間才營業', '站在櫃台前按 E 買東西', '錢不夠，阿伯先讓你賒 · 被咬到的不要進來'].forEach((t, i) => x2.fillText(t, w / 2, h * (0.4 + i * 0.2), w - 12));
      }, 256, 168), roughness: 0.4,
    }));
    stand.position.set(0.55, 1.08, 0.22);
    stand.rotation.set(-0.2, 0.15, 0);
    this.group.add(stand);
    D.add(M.alu, put(box(0.2, 0.012, 0.06), 0.55, 1.012, 0.2, 0.15));
  }

  _floor(R) {
    const M = mats(), B = this.B;
    const fl = Math.min(R.leftF, 6.5), fr = Math.min(R.rightF, 6.5), front = Math.min(R.front, 6.5);
    const clear = (x0, x1) => !R.doors.some((d) => d.x + d.w / 2 > x0 - 0.4 && d.x - d.w / 2 < x1 + 0.4); // 門口前不放東西
    // ---- 雙面貨架 ----
    if (front >= 3.4) {
      const z0 = 1.25, z1 = Math.min(front - 1.25, 3.5);
      for (const s of [-1, 1]) {
        const w = s < 0 ? fl : fr;
        if (w < 3.4) continue;
        const gx = s * Math.min(3.05, w - 2.1);
        this._gondola(gx, z0, z1);
        this._collide(gx - 0.47, gx + 0.47, z0 - 0.05, z1 + 0.05, 1.5);
      }
    }
    // ---- 冰箱(靠實心側牆) ----
    for (const s of [-1, 1]) {
      const w = s < 0 ? fl : fr, solid = s < 0 ? R.solidL : R.solidR;
      if (!solid || front < 2.6) continue;
      const doors = Math.max(2, Math.min(4, Math.floor((front - 1.0) / 0.8)));
      const z0 = 0.85, z1 = z0 + doors * 0.78;
      this._fridges(s * (w - 0.37), z0, doors, s);
      this._collide(s < 0 ? -w : w - 0.76, s < 0 ? -w + 0.76 : w, z0 - 0.02, z1 + 0.02, 2.1);
    }
    // ---- 窗邊低櫃(不擋窗) ----
    for (const s of [-1, 1]) {
      const w = s < 0 ? fl : fr, solid = s < 0 ? R.solidL : R.solidR;
      if (solid || w > 6.6 || front < 2.6) continue;
      const z0 = 0.85, z1 = Math.min(front - 1.15, 3.9);
      const x = s * (w - 0.24);
      B.add(M.wood, put(box(0.46, 0.8, z1 - z0), x, 0.44, (z0 + z1) / 2));
      B.add(M.top, put(box(0.5, 0.03, z1 - z0 + 0.04), x, 0.855, (z0 + z1) / 2));
      B.add(M.kick, put(box(0.42, 0.06, z1 - z0 - 0.02), x, 0.03, (z0 + z1) / 2));
      // 糖果與報紙
      for (let z = z0 + 0.2; z < z1 - 0.15; z += 0.32) {
        if (rnd() < 0.3) continue;
        this._product(pick(['bag', 'box', 'cup']), x + rr(-0.1, 0.1), 0.87, z, rr(-0.4, 0.4), rnd() < 0.15);
      }
      this._collide(Math.min(x - 0.25, x + 0.25), Math.max(x - 0.25, x + 0.25), z0, z1, 0.9);
    }
    // ---- 前窗下的冰淇淋冰櫃 ----
    if (!R.frontOpen && front > 3.6 && fr > 3.5 && clear(2.4, 4.2)) {
      const cx = Math.min(3.3, fr - 1.4), cz = front - 0.42;
      B.add(M.enamel, put(rbox(1.5, 0.82, 0.68, 0.04), cx, 0.41, cz));
      B.add(M.kick, put(box(1.44, 0.07, 0.62), cx, 0.035, cz));
      B.add(M.alu, put(box(1.5, 0.04, 0.7), cx, 0.84, cz));
      const lid = new THREE.Mesh(norm(put(new THREE.PlaneGeometry(1.4, 0.6), cx, 0.865, cz, 0, -Math.PI / 2)), M.glass);
      this.group.add(lid);
      for (let i = 0; i < 9; i++) this._product('box', cx + rr(-0.6, 0.6), 0.62, cz + rr(-0.22, 0.22), rr(0, 6), false, 0.6);
      this._collide(cx - 0.76, cx + 0.76, cz - 0.35, cz + 0.35, 0.9);
    }
    // ---- 角落電視(緊急廣播) ----
    const tvSide = R.solidL ? -1 : 1, tw = tvSide < 0 ? fl : fr;
    const tx = tvSide * (tw - 0.45), tz = Math.min(front - 0.5, 0.75);
    this._slot('tv', { x: tx, y: Math.min(R.ceil - 0.7, 2.45), z: tz, ry: -tvSide * 0.9 }, () => this._fallbackTV());
    B.add(M.dark, put(box(0.4, 0.03, 0.5), tx, Math.min(R.ceil - 0.7, 2.45) - 0.02, tz));
    B.add(M.dark, put(box(0.04, R.ceil - Math.min(R.ceil - 0.7, 2.45), 0.04), tx, (R.ceil + Math.min(R.ceil - 0.7, 2.45)) / 2, tz));
    const [c, x] = cv(128, 96);
    this.tvc = { c, x };
    this.tvTex = tex(c);
    this.tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.29), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    this.tvAt = { x: tx, y: Math.min(R.ceil - 0.7, 2.45), z: tz, ry: -tvSide * 0.9 };
    this.group.add(this.tvScreen);
    this._placeTVScreen();
    // ---- 前窗內側的 OPEN 霓虹(朝走廊) ----
    if (!R.frontOpen && front > 2) {
      this.neon2Mat = new THREE.MeshBasicMaterial({ map: neonTex([['OPEN', '#ff3b30', 150, 0.5, 900]], 512, 256), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const n2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), this.neon2Mat);
      n2.position.set(-Math.min(3.2, fl - 1.6), 1.9, front - 0.12); // 面向走廊(從店內看是反的,跟真的霓虹一樣)
      this.group.add(n2);
      for (const s of [-1, 1]) B.add(M.steel, put(cyl(0.003, 0.003, R.ceil - 2.12, 4), n2.position.x + s * 0.4, (R.ceil + 2.12) / 2, front - 0.12));
    }
    // ---- 門口腳踏墊與海報 ----
    for (const d of R.doors) B.add(M.rubber, put(box(Math.min(2.2, d.w - 0.4), 0.012, 0.9), d.x, 0.006, front - 0.55));
  }

  // 雙面貨架:沿 Z 方向,兩面朝 ±X
  _gondola(x, z0, z1) {
    const M = mats(), B = this.B, len = z1 - z0, cz = (z0 + z1) / 2;
    B.add(M.kick, put(box(0.9, 0.1, len), x, 0.05, cz));
    B.add(M.peg, put(box(0.04, 1.32, len - 0.04), x, 0.76, cz));
    for (const s of [-1, 1]) B.add(M.shelf, put(box(0.94, 1.48, 0.04), x, 0.74, s < 0 ? z0 - 0.02 : z1 + 0.02)); // 端板
    B.add(M.shelf, put(box(0.2, 0.04, len + 0.08), x, 1.5, cz));
    for (const h of [0.14, 0.52, 0.9, 1.26]) {
      for (const s of [-1, 1]) {
        B.add(M.shelf, put(box(0.4, 0.025, len), x + s * 0.22, h, cz));
        B.add(M.strip, put(box(0.012, 0.045, len), x + s * 0.425, h - 0.005, cz));
        // 商品:沿 Z 排列,偶爾空缺或倒下
        const kind = h < 0.3 ? pick(['box', 'cup']) : h > 1.1 ? pick(['bag', 'bag', 'box']) : pick(['bag', 'box', 'cup', 'bottle']);
        const sz = { bag: 0.19, box: 0.21, cup: 0.12, bottle: 0.08 }[kind];
        for (let z = z0 + sz / 2 + 0.03; z < z1 - sz / 2; z += sz + 0.02) {
          if (rnd() < 0.22) continue;
          const fallen = rnd() < 0.06;
          for (let d = 0; d < (kind === 'bag' ? 1 : 2); d++) this._product(kind, x + s * (0.12 + d * 0.15), h + 0.013, z, s > 0 ? 0 : Math.PI, fallen);
        }
      }
    }
  }

  // 冰箱:門朝 +X(s=-1 靠左牆)或 -X(s=1 靠右牆)
  _fridges(x, z0, n, s) {
    const M = mats(), B = this.B, face = -s; // 門的朝向(本地 X 方向)
    const W = n * 0.78, cz = z0 + W / 2, D = 0.72, H = 2.02;
    B.add(M.enamel, put(box(D, 0.24, W + 0.04), x, H - 0.12, cz));
    B.add(M.kick, put(box(D - 0.04, 0.12, W), x, 0.06, cz));
    for (const k of [0, n]) B.add(M.enamel, put(box(D, H, 0.04), x, H / 2, z0 + k * 0.78));
    B.add(M.enamel, put(box(0.04, H, W), x - face * (D / 2 - 0.02), H / 2, cz));
    // 頂部燈箱
    const hdr = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, 0.18), new THREE.MeshBasicMaterial({
      map: signTex((c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#0a4c7a'); g.addColorStop(1, '#0c6aa0');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.fillStyle = '#e6f4ff'; c.font = `900 ${h * 0.62}px ${FONT}`; c.textBaseline = 'middle';
        c.fillText('冷飲 COLD DRINKS', 24, h / 2 + 2);
        c.fillStyle = '#9fd4ff'; c.font = `700 ${h * 0.34}px ${FONT}`; c.textAlign = 'right'; c.fillText('ICE · 冰', w - 24, h / 2);
      }, 1024, 72), color: new THREE.Color(1.15, 1.15, 1.15),
    }));
    hdr.position.set(x + face * (D / 2 + 0.003), H - 0.12, cz);
    hdr.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.group.add(hdr);
    // 內部背板發光(可閃爍)
    this.fridgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 1.05, 1.15) });
    const back = new THREE.Mesh(norm(put(new THREE.PlaneGeometry(W - 0.06, H - 0.42), x - face * (D / 2 - 0.05), 0.12 + (H - 0.42) / 2 + 0.04, cz, face > 0 ? Math.PI / 2 : -Math.PI / 2)), this.fridgeMat);
    this.group.add(back);
    // 層架與飲料
    for (const h of [0.2, 0.56, 0.92, 1.28, 1.6]) {
      B.add(M.shelf, put(box(D - 0.12, 0.015, W - 0.04), x - face * 0.02, h, cz));
      for (let z = z0 + 0.06; z < z0 + W - 0.04; z += 0.085) {
        if (rnd() < 0.18) continue;
        const kind = h > 1.5 ? 'can' : rnd() < 0.7 ? 'bottle' : 'can';
        for (let d = 0; d < 3; d++) this._product(kind, x + face * (0.2 - d * 0.12), h + 0.008, z, rr(0, 6), false);
      }
    }
    // 門:鋁框 + 玻璃 + 把手
    const glass = [];
    for (let k = 0; k < n; k++) {
      const zc = z0 + 0.39 + k * 0.78, fx = x + face * (D / 2 - 0.01);
      for (const dz of [-0.37, 0.37]) B.add(M.alu, put(box(0.04, H - 0.38, 0.04), fx, 0.12 + (H - 0.38) / 2, zc + dz));
      for (const yy of [0.14, H - 0.26]) B.add(M.alu, put(box(0.04, 0.05, 0.78), fx, yy, zc));
      B.add(M.alu, put(cyl(0.012, 0.012, 0.9, 8), fx + face * 0.05, 1.05, zc + 0.3));
      for (const yy of [0.62, 1.48]) B.add(M.alu, put(box(0.05, 0.02, 0.02), fx + face * 0.03, yy, zc + 0.3));
      glass.push(norm(put(new THREE.PlaneGeometry(0.72, H - 0.42), fx, 0.12 + (H - 0.42) / 2 + 0.04, zc, face > 0 ? Math.PI / 2 : -Math.PI / 2)));
    }
    const gm = new THREE.Mesh(mergeGeometries(glass), mats().glass);
    gm.renderOrder = 2;
    this.group.add(gm);
  }

  // 商品(累積到 InstancedMesh)
  _product(kind, x, y, z, ry = 0, fallen = false, scale = 1) {
    this._prods ||= {};
    (this._prods[kind] ||= []).push({ x, y, z, ry, fallen, scale, color: PRODUCT_COLORS[kind][(rnd() * PRODUCT_COLORS[kind].length) | 0] });
  }
  _flushProducts() {
    const geo = productGeos();
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (const kind in this._prods) {
      const list = this._prods[kind], G = geo[kind];
      const im = new THREE.InstancedMesh(G.geo, G.mat, list.length);
      list.forEach((p, i) => {
        const h = G.h * p.scale;
        if (p.fallen) m.compose(_p.set(p.x, p.y + G.d / 2, p.z), _q.setFromEuler(_e.set(Math.PI / 2, p.ry, rr(-0.3, 0.3))), _s.set(p.scale, p.scale, p.scale));
        else m.compose(_p.set(p.x, p.y + h / 2, p.z), _q.setFromEuler(_e.set(0, p.ry + rr(-0.12, 0.12), 0)), _s.set(p.scale, p.scale, p.scale));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.set(p.color));
      });
      im.castShadow = false;
      im.receiveShadow = true;
      this.detail.add(im);
    }
    this._prods = {};
  }

  // ---------- GLB 道具位 ----------
  _slot(key, at, fallback, setup) {
    this._slots ||= [];
    const fb = fallback();
    fb.position.set(at.x, at.y, at.z);
    fb.rotation.y = at.ry || 0;
    this.detail.add(fb);
    this._slots.push({ key, at, fb, setup });
  }
  _loadModels() {
    const jobs = (this._slots || []).map((s) => loadModel(s.key).then((scene) => {
      if (this.disposed) return;
      const o = scene.clone(true);
      o.position.set(s.at.x, s.at.y, s.at.z);
      o.rotation.y = s.at.ry || 0;
      if (s.setup) s.setup(o);
      this.detail.remove(s.fb);
      s.fb.traverse((m) => m.geometry?.dispose());
      this.detail.add(o);
      s.model = o;
    }).catch(() => { /* 保留替代品 */ }));
    // 模型材質由下載佇列在交付前就在背景編好(src/sys/assets.js prepare);這裡補編店面其餘部分(非同步、正確的 HDR 目標狀態)
    Promise.all(jobs).then(() => {
      if (this.disposed || !this.game?.renderer) return;
      precompile(this.game, this.group).catch(() => { /* 略過 */ });
    });
  }
  _fallbackRegister() {
    const g = new THREE.Group(), M = mats();
    const a = new THREE.Mesh(rbox(0.42, 0.2, 0.42, 0.02), M.dark); a.position.y = 0.1; g.add(a);
    const b = new THREE.Mesh(rbox(0.3, 0.16, 0.2, 0.02), M.dark); b.position.set(0, 0.26, 0.08); b.rotation.x = -0.4; g.add(b);
    return g;
  }
  _fallbackMonitor() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(rbox(0.38, 0.36, 0.34, 0.03), mats().paint); a.position.set(0, 0.2, -0.05); g.add(a);
    return g;
  }
  _fallbackTV() {
    const g = new THREE.Group();
    const a = new THREE.Mesh(rbox(0.58, 0.44, 0.44, 0.03), mats().wood); a.position.y = 0.22; g.add(a);
    return g;
  }
  _fallbackRack() {
    const g = new THREE.Group(), M = mats();
    for (const h of [0.05, 0.45, 0.89, 1.33, 1.8]) { const s = new THREE.Mesh(box(0.92, 0.03, 0.6), M.dark); s.position.y = h; g.add(s); }
    for (const x of [-0.44, 0.44]) for (const z of [-0.28, 0.28]) { const p = new THREE.Mesh(box(0.035, 1.9, 0.035), M.dark); p.position.set(x, 0.95, z); g.add(p); }
    return g;
  }
  _fallbackShelf() {
    const g = new THREE.Group(), M = mats();
    for (const h of [0.08, 0.6, 1.1, 1.6, 2.06]) { const s = new THREE.Mesh(box(1, 0.03, 0.26), M.paint); s.position.set(0, h, 0.13); g.add(s); }
    for (const x of [-0.49, 0.49]) { const p = new THREE.Mesh(box(0.025, 2.08, 0.26), M.paint); p.position.set(x, 1.04, 0.13); g.add(p); }
    return g;
  }
  _fallbackClock() {
    const g = new THREE.Group();
    const f = new THREE.Mesh(cyl(0.16, 0.16, 0.04, 24), mats().paint); f.rotation.x = Math.PI / 2; f.position.z = 0.02; g.add(f);
    return g;
  }
  _placeTVScreen() {
    const a = this.tvAt;
    // 電視模型螢幕約在正面中央偏左上(依 Television_01 外型)
    const lx = -0.05, ly = 0.25, lz = 0.215;
    const c = Math.cos(a.ry), s = Math.sin(a.ry);
    this.tvScreen.position.set(a.x + lx * c + lz * s, a.y + ly, a.z - lx * s + lz * c);
    this.tvScreen.rotation.set(0, a.ry, 0);
  }

  // ---------- 動態貼圖 ----------
  drawTags(weapons) {
    const { c, x } = this.tagCanvas;
    x.clearRect(0, 0, c.width, c.height);
    this.tagSlots.forEach((t, i) => {
      const col = i % 2, row = (i / 2) | 0, X = col * 256, Y = row * 64;
      const has = weapons?.has?.(t.id), na = !WEAPONS[t.id];
      x.fillStyle = has ? '#2b4a30' : '#d9d1bd'; x.fillRect(X + 4, Y + 4, 248, 56);
      x.fillStyle = has ? '#9fe0a8' : '#b8281c'; x.fillRect(X + 4, Y + 4, 10, 56);
      x.fillStyle = has ? '#dff5e2' : '#1c1c1c'; x.font = `900 24px ${FONT}`; x.textBaseline = 'middle';
      x.fillText(weaponName(t.id), X + 24, Y + 24);
      x.font = `700 20px ${FONT}`; x.textAlign = 'right';
      x.fillStyle = has ? '#9fe0a8' : na ? '#7a7a7a' : '#b8281c';
      x.fillText(has ? '已購買' : na ? '即將到貨' : `$ ${weaponPrice(t.id)}`, X + 244, Y + 44);
      x.textAlign = 'left';
    });
    this.tagTex.needsUpdate = true;
    this._tagKey = weapons ? Object.keys(weapons.inv || {}).sort().join() : '';
  }

  drawTerminal(force = false) {
    const { c, x } = this.term, w = c.width, h = c.height;
    const blink = ((this.t * 2) | 0) % 2;
    const key = `${this.open ? 1 : 0}${blink}${this.k > 0.98 ? 1 : 0}`;
    if (!force && key === this._termKey) return;
    this._termKey = key;
    x.fillStyle = '#04100a'; x.fillRect(0, 0, w, h);
    x.font = `700 15px Consolas, ${FONT}`; x.textBaseline = 'top';
    if (this.open) {
      x.fillStyle = '#7dffa0'; x.fillText(this.brand.term, 10, 10);
      x.fillStyle = '#3fae62'; x.fillRect(10, 32, w - 20, 1);
      x.fillStyle = '#b9ffcc';
      ['[1] 武器', '[2] 彈藥', '[3] 改裝', '[4] 裝備'].forEach((t, i) => x.fillText(t, 14, 44 + i * 22));
      x.fillStyle = '#ffd27a'; x.fillText('按 E 跟金水伯買東西', 14, 140);
      x.fillStyle = '#7dffa0'; x.fillText(blink ? '> _' : '>', 14, 164);
    } else {
      x.fillStyle = '#ff6a5a'; x.fillText('金水商行 鐵門拉下來了', 10, 12);
      x.fillStyle = '#c98a80'; x.fillText('打完這一波', 10, 44); x.fillText('才會開門', 10, 64);
      x.fillStyle = '#ff6a5a'; x.fillText(blink ? '● LOCKED' : '  LOCKED', 10, 140);
    }
    for (let y = 0; y < h; y += 3) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, y, w, 1); }
    this.termTex.needsUpdate = true;
  }

  drawTV() { // 雜訊 + 緊急廣播字幕
    const { c, x } = this.tvc, w = c.width, h = c.height;
    const img = x.createImageData(w, h), d = img.data;
    const roll = (this.t * 40) % h;
    for (let i = 0; i < d.length; i += 4) {
      const y = (i / 4 / w) | 0;
      const v = Math.random() * 150 + (Math.abs(y - roll) < 4 ? 60 : 0);
      d[i] = v * 0.85; d[i + 1] = v * 0.9; d[i + 2] = v; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (((this.t / 3) | 0) % 2 === 0) {
      x.fillStyle = 'rgba(160,0,0,.85)'; x.fillRect(0, h - 26, w, 20);
      x.fillStyle = '#fff'; x.font = `700 13px ${FONT}`; x.textBaseline = 'middle';
      const msg = '緊急廣播：請留在室內　鎖好門窗　不要前往醫院　';
      const off = (this.t * 30) % (msg.length * 13);
      x.fillText(msg + msg, -off, h - 16);
    }
    this.tvTex.needsUpdate = true;
  }

  // ---------- 狀態 ----------
  setOpen(open, instant = false) {
    if (this.open === open && !instant) return;
    this.open = open;
    this.target = open ? 1 : 0;
    this.fastK = false;
    if (instant) { this.k = this.target; this.neon = open ? 1 : 0; this._applyK(); this._applyNeon(); }
    else {
      sfx.shutter(this.pos, open);
      this.neonT = open ? 1.6 : 0; // 霓虹延遲點亮
    }
    this.drawTerminal(true);
  }

  // [zombies-w3] 追逐戰:捲門只拉到一半(k 0..1,不開店、不點霓虹)讓玩家鑽進來;fast = 猛力拉下
  setShutter(k, fast = false) {
    this.open = false;
    if (Math.abs(this.target - k) < 1e-3) return;
    sfx.shutter(this.pos, k > this.k);
    this.target = k;
    this.fastK = fast;
    this.drawTerminal(true);
  }

  // 櫃台後方是封閉的:萬一還是有人進去(連線位置修正、傳送…),待 0.6 秒就送回櫃台前、面向櫃台
  _guardBehind(dt, p) {
    const q = p?.pos;
    if (!q || !this._cw || Math.abs(q.y - this.y) > 1.2) { this._behindT = 0; return; }
    const dx = q.x - this.S.x, dz = q.z - this.S.z;
    const lx = dx * this.F.ax.x + dz * this.F.ax.z, lz = dx * this.F.az.x + dz * this.F.az.z;
    if (lz > -0.45 || lz < -this.R.back - 0.3 || lx < -this._cw.L || lx > this._cw.Rt) { this._behindT = 0; return; }
    if ((this._behindT = (this._behindT || 0) + dt) < 0.6) return;
    this._behindT = 0;
    const s = this.standPos;
    p.place?.(s.x, this.y, s.z, Math.atan2(this.F.az.x, this.F.az.z));
    p.vx = p.vz = p.vy = 0;
    console.info('[shop] 玩家在櫃台後方,送回櫃台前');
  }

  // 互動:'open' 可開啟商店、'closed' 在櫃台前但未開放、null 不在範圍
  interact(p) {
    if (Math.abs((p.pos.y || 0) - this.y) > 1.3) return null;
    const dx = p.pos.x - this.S.x, dz = p.pos.z - this.S.z;
    const lx = dx * this.F.ax.x + dz * this.F.ax.z, lz = dx * this.F.az.x + dz * this.F.az.z;
    if (lz < 0.2 || lz > 2.7 || Math.abs(lx) > 2.4) return null;
    return this.open && this.k > 0.6 ? 'open' : 'closed';
  }
  near(p) { return this.interact(p) === 'open'; }

  _applyK() {
    const H = this.shutterH;
    this.shutters.forEach((s, i) => {
      const k = Math.max(0, Math.min(1, (this.k - s.delay * (this.target ? 1 : 0)) / (1 - s.delay)));
      const e = k * k * (3 - 2 * k);
      s.grp.position.y = 1.0 + e * (H + 0.02);
      s.grp.visible = e < 0.999;
    });
    if (this.wash) this.wash.material.opacity = this.k * 0.55;
  }
  _applyNeon() {
    const n = this.neon;
    this.neonMat.color.setScalar(0.12 + n * 1.25);
    this.neonGlow.material.opacity = n * 0.35;
    if (this.neon2Mat) this.neon2Mat.color.setScalar(0.12 + n * 1.25);
    this.lightbox.emissiveIntensity = n * 0.9;
  }

  update(dt, t, player) {
    this.t = t;
    this._guardBehind(dt, player);
    // 捲門
    if (this.k !== this.target) {
      const up = this.target > this.k, sp = (up ? 1 / 2.6 : 1 / 2.1) * (this.fastK ? 3.5 : 1);
      this.k = up ? Math.min(this.target, this.k + dt * sp) : Math.max(this.target, this.k - dt * sp); // [zombies-w3] 可停在中間(setShutter)
      if (this.k === this.target) this.fastK = false;
      this._applyK();
    }
    // 霓虹:開店時延遲並閃爍點亮,關店立即熄滅
    let n = this.neon;
    if (this.open) {
      if (this.neonT > 0) { this.neonT -= dt; n = this.neonT < 0.7 && Math.random() < 0.35 ? 0.9 : 0.05; }
      else n = Math.random() < 0.004 ? 0.4 : Math.min(1, n + dt * 4);
    } else n = Math.max(0, n - dt * 6);
    if (Math.abs(n - this.neon) > 1e-3) { this.neon = n; this._applyNeon(); }
    // 冰箱燈管:偶爾閃爍
    if (this.fridgeMat) {
      const f = Math.sin(t * 23) * Math.sin(t * 3.7) > 0.93 ? 0.35 : 1;
      this.fridgeMat.color.setRGB(0.95 * f, 1.05 * f, 1.15 * f);
    }
    // 遠距離/不同樓層時隱藏細節
    const p = player?.pos;
    let near = true, close = true;
    if (p) {
      const d = Math.hypot(p.x - this.S.x, p.z - this.S.z), dy = Math.abs((p.y || 0) - this.y);
      near = d < 42 && dy < 5;
      close = d < 22 && dy < 2;
      this.group.visible = d < 70 && dy < 9 && this._pvs();
    }
    this.detail.visible = near;
    this.light.intensity = near ? 5.5 : 0;
    if (close) {
      this._tvT = (this._tvT || 0) - dt;
      if (this._tvT <= 0) { this._tvT = 1 / 12; this.drawTV(); }
      this.drawTerminal();
    }
    const w = this.game?.weapons;
    if (w) {
      const key = Object.keys(w.inv || {}).sort().join();
      if (key !== this._tagKey) this.drawTags(w);
    }
  }

  // 拆除店面(換地圖時):移除場景物件與碰撞盒(登記在建立時的那個 World),釋放自己的合併幾何與動態貼圖;
  // 共用材質、商品幾何與 GLB 快取留給下一次重建
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    this.scene.remove(this.light);
    this.light.dispose?.();
    for (const b of this.boxes) this.world.removeBox(b);
    this.boxes.length = 0;
    this.group.traverse((o) => { if (o.userData.own) o.geometry.dispose(); });
    for (const m of [...(this.B?.owned || []), ...(this.D?.owned || [])]) m.dispose(); // [perf6] 外來物件材質的複本
    for (const t of [this.tagTex, this.termTex, this.tvTex]) t?.dispose();
    this.anim.length = 0;
  }
}

// ---------- 商品幾何(共用) ----------
const PRODUCT_COLORS = {
  bag: [0xe0b030, 0xd84a2a, 0x3a8ad0, 0x48a050, 0xc03a90, 0xe8e0c0],
  box: [0xc84030, 0x2a6aa8, 0xe8c050, 0x7a4a2a, 0x3a8a5a],
  cup: [0xd83a2a, 0xe8a030, 0x2a7ac0, 0xf0f0f0],
  bottle: [0x6ab0e0, 0x8a5a2a, 0x2a2a2a, 0xe08a20, 0x50a050, 0xd0e8f0],
  can: [0xc02020, 0xd0d0d0, 0x2050b0, 0x30a050, 0xe0c020, 0x202020],
};
let PG = null;
function productGeos() {
  if (PG) return PG;
  const lathe = new THREE.LatheGeometry([[0, 0], [0.031, 0], [0.033, 0.012], [0.033, 0.15], [0.026, 0.18], [0.013, 0.205], [0.012, 0.225], [0.013, 0.232], [0, 0.232]].map(([a, b]) => new THREE.Vector2(a, b)), 10);
  lathe.translate(0, -0.116, 0);
  const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.55, ...o });
  PG = {
    bag: { geo: new RoundedBoxGeometry(0.06, 0.25, 0.18, 2, 0.022), mat: std(packTex('bag'), { roughness: 0.35 }), h: 0.25, d: 0.06 },
    box: { geo: new THREE.BoxGeometry(0.07, 0.27, 0.2), mat: std(packTex('box')), h: 0.27, d: 0.07 },
    cup: { geo: new THREE.CylinderGeometry(0.052, 0.04, 0.105, 12), mat: std(packTex('cup')), h: 0.105, d: 0.1 },
    bottle: { geo: lathe, mat: std(packTex('label'), { roughness: 0.15, metalness: 0.05 }), h: 0.232, d: 0.066 },
    can: { geo: new THREE.CylinderGeometry(0.033, 0.033, 0.122, 12), mat: std(packTex('label'), { roughness: 0.3, metalness: 0.7 }), h: 0.122, d: 0.066 },
  };
  return PG;
}
