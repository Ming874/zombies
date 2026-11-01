import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assets } from '../../../sys/assets.js';

// 下載的 CC0 寫實模型(Poly Haven,署名見 public/credits/props-out.md)。
// 每個模型只載入一次;零件(幾何+材質)烘入相對矩陣並正規化原點後,交給實例池共用。
// 載入失敗時保留程式生成的備援外觀(實例池一開始就是備援)。
const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/props/`;
export const MODELS = {
  barrel: { file: 'barrel_01/Barrel_01_1k.gltf', tex: 512 },
  trashbag: { file: 'trashbag/trashbag_1k.gltf', tex: 512 },
  tyre: { file: 'old_tyre/old_tyre_1k.gltf', tex: 512 },
  trashcan: { file: 'metal_trash_can/metal_trash_can_1k.gltf', tex: 512 },
  covered_car: { file: 'covered_car/covered_car_1k.gltf', tex: 1024 },
  gravestone: { file: 'gravestone_broken_slab/gravestone_broken_slab.gltf', tex: 512 },
  gothic: { file: 'gothic_statue/gothic_statue_1k.gltf', tex: 1024 },
  shutter: { file: 'rollershutter_door/rollershutter_door_1k.gltf', tex: 512 },
  walllamp: { file: 'industrial_wall_lamp/industrial_wall_lamp_1k.gltf', tex: 256 },
  generator: { file: 'portable_generator/portable_generator_1k.gltf', tex: 512 },
  bench: { file: 'painted_wooden_bench/painted_wooden_bench_1k.gltf', tex: 512 },
  wetsign: { file: 'wetfloorsign_01/WetFloorSign_01_1k.gltf', tex: 256 },
  utilitybox: { file: 'utility_box_01/utility_box_01_1k.gltf', tex: 512 },
  propane: { file: 'propane_tank/propane_tank_1k.gltf', tex: 256 },
  crate: { file: 'wooden_crate_02/wooden_crate_02_1k.gltf', tex: 512 },
  seclight: { file: 'security_light/security_light_1k.gltf', tex: 256 },
};
let loader = null;
const cache = new Map();
export function loadModel(key) {
  let p = cache.get(key);
  if (!p) {
    const spec = MODELS[key];
    loader ??= new GLTFLoader();
    // 下載排隊(src/sys/assets.js);fix 在佇列內做,交付前會用最終材質在背景預編譯 shader(含實例池版本)
    p = assets.task(() => loader.loadAsync(BASE + spec.file).then((g) => { fix(g.scene, spec.tex); return g.scene; }), { meta: { model: key, outdoor: true }, prio: 30 });
    p.catch((e) => console.warn('[props-out] 模型載入失敗,改用程式模型', key, e?.message || e));
    cache.set(key, p);
  }
  return p;
}

// 透射材質改成低不透明度;大貼圖縮小(省顯示記憶體)
function fix(root, maxTex) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transmission > 0) { m.transmission = 0; m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.roughness = Math.min(m.roughness, 0.15); }
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        const t = m[k];
        if (!t || seen.has(t) || !t.image || t.image.width <= maxTex) continue;
        seen.add(t);
        try {
          const c = document.createElement('canvas');
          c.width = c.height = maxTex;
          c.getContext('2d').drawImage(t.image, 0, 0, maxTex, maxTex);
          t.image = c;
          t.needsUpdate = true;
        } catch { /* 保留原圖 */ }
      }
    }
  });
}

const hasName = (o, names) => { for (let p = o; p; p = p.parent) if (names.includes(p.name)) return true; return false; };
// 取出指定節點(名稱或其祖先名稱在 names 中;names 為空 = 全部)的零件;
// origin:'base' = 底面中心為原點,'center' = 包圍盒中心;xform 為額外的正規化矩陣(旋轉/縮放)
export function extract(root, names = [], { origin = 'base', xform = null } = {}) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && (!names.length || hasName(o, names))) meshes.push(o); });
  const pre = xform || new THREE.Matrix4();
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  for (const m of meshes) {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(pre, m.matrixWorld)));
  }
  const c = box.getCenter(new THREE.Vector3());
  const T = new THREE.Matrix4().makeTranslation(-c.x, -(origin === 'base' ? box.min.y : c.y), -c.z).multiply(pre);
  const byMat = new Map();
  for (const m of meshes) {
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const l = byMat.get(m.material) || [];
    l.push(g.index ? g : g);
    byMat.set(m.material, l);
  }
  const parts = [];
  for (const [mat, l] of byMat) {
    const geo = l.length === 1 ? l[0] : mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)));
    if (geo) parts.push({ geo, mat });
  }
  return { parts, size: box.getSize(new THREE.Vector3()) };
}

// 載入完成後把實例池換成模型零件
export function bindModel(pool, key, names, opts) {
  if (pool._bound) return;
  pool._bound = true;
  loadModel(key).then((root) => { const { parts } = extract(root, names, opts); if (parts.length) pool.setParts(parts); }).catch(() => {});
}
