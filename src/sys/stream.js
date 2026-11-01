import * as THREE from 'three';
import { assets } from './assets.js';
import { SURFACES } from '../map/hospital/surfaces.js';

// ===== 依玩家位置決定下載順序(src/sys/assets.js 的優先序)=====
// 數字 = 「大約幾公尺外才會看到」:目前所在區域的地板/牆面貼圖 0 → 附近區域(距離)→ 同一層其他地方用到的 +10
// → 其他樓層每層 +14;同一組貼圖先載顏色,再載粗糙度/AO、法線。補給站模型以店面距離計,戶外模型約 30m。
const MAP_COST = { color: 0, opacity: 0, orm: 3, normal: 5, hi: 45 }; // hi = 1K 顏色圖升級(附近樓層的基本圖都載完之後)
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'emissiveMap'];
const LEVEL_COST = 14, FLOOR_ANY = 10;

export function installStreaming(game) {
  const L = game.world?.layout;
  if (!L) return;
  const usage = new Map(); // 貼圖組 → [[樓層, x0, z0, x1, z1, 附加成本]]
  const add = (set, li, x0, z0, x1, z1, extra) => { let a = usage.get(set); if (!a) usage.set(set, (a = [])); a.push([li, x0, z0, x1, z1, extra]); };
  // 1) 區域的地板/牆/天花板表面(精確到區域)
  for (const z of L.zones || []) {
    for (const key of [z.floor, z.wall, z.ceil]) {
      const set = key && SURFACES[key]?.pbr;
      if (!set) continue;
      for (const [c0, r0, c1, r1] of z.rects) add(set, z.levelIndex, c0 * L.CELL, r0 * L.CELL, (c1 + 1) * L.CELL, (r1 + 1) * L.CELL, 0);
    }
  }
  // 2) 場景中所有用到該貼圖組的網格(合併網格的包圍盒常涵蓋整層 → 視為「這層某處」)
  const box = new THREE.Box3();
  game.scene.updateMatrixWorld(true);
  game.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    let sets = null;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k of TEX_KEYS) { const s = m[k]?.userData?.pbr; if (s) (sets ||= new Set()).add(s); }
    }
    if (!sets) return;
    const g = o.geometry;
    if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox?.(); box.copy(o.boundingBox || g.boundingBox || box.makeEmpty()); }
    else { if (!g.boundingBox) g.computeBoundingBox(); box.copy(g.boundingBox); }
    if (box.isEmpty()) return;
    box.applyMatrix4(o.matrixWorld);
    const li = Math.max(0, L.levelOfY(box.min.y + 0.25)), li2 = Math.max(li, L.levelOfY(box.max.y - 0.3));
    for (const s of sets) for (let l = li; l <= li2; l++) add(s, l, box.min.x, box.min.z, box.max.x, box.max.z, FLOOR_ANY);
  });
  const shop = L.shop;
  const dist = (p, li, x0, z0, x1, z1) => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
  assets.setPriority((it) => {
    const p = game.player?.pos, m = it.meta;
    if (!p || !m) return it.prio;
    const li = Math.max(0, L.levelOfY(p.y + 0.3));
    if (m.pbr) {
      const u = usage.get(m.pbr);
      if (!u) return it.prio;
      let best = Infinity;
      for (const [l, x0, z0, x1, z1, extra] of u) {
        const d = dist(p, li, x0, z0, x1, z1) + Math.abs(l - li) * LEVEL_COST + extra;
        if (d < best) best = d;
      }
      return best + (MAP_COST[m.map] ?? 4);
    }
    if (m.shop && shop) return Math.hypot(shop.x - p.x, shop.z - p.z) + Math.abs((shop.level ?? 1) - li) * LEVEL_COST;
    if (m.outdoor) return 30 + Math.abs(1 - li) * LEVEL_COST;
    return it.prio;
  });
  return { usage };
}
