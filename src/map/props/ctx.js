import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from '../materials.js';

// 道具擺設的共用工具(場景建構器建立一個 ctx,交給各道具模組使用)。
// 座標:世界座標,公尺;格子 (c, r) 中心 = ((c+0.5)*CELL, 樓層 y, (r+0.5)*CELL);yaw 0 = 面向 -Z(北)。

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[(f() * arr.length) | 0];
  f.chance = (p) => f() < p;
  return f;
}

const SIDES = { N: [0, -1, 0], S: [0, 1, Math.PI], W: [-1, 0, Math.PI / 2], E: [1, 0, -Math.PI / 2] };

export function createDressCtx({ layout, world, group, seed = 1234 }) {
  const L = layout, CELL = L.CELL, F = L.F;
  const occ = L.levels.map(() => new Uint8Array(L.W * L.H));
  const statics = [];
  const lights = [], events = [];
  const box = new THREE.Box3();
  const isWalk = (li, c, r) => (L.flagsAt(li, c, r) & F.WALK) !== 0;
  const isSolid = (li, c, r) => (L.flagsAt(li, c, r) & (F.WALL | F.WINDOW | F.ELEVATOR)) !== 0;
  const isDoor = (li, c, r) => L.charAt(li, c, r) === '+';
  const isPlain = (li, c, r) => '.,"~'.includes(L.charAt(li, c, r)); // 沒有特殊用途的可走格
  const nearDoor = (li, c, r) => isDoor(li, c, r) || isDoor(li, c + 1, r) || isDoor(li, c - 1, r) || isDoor(li, c, r + 1) || isDoor(li, c, r - 1);

  const ctx = {
    L, world, group, mat, CELL,
    rng: rng(seed),
    isWalk, isSolid, isDoor, isPlain, nearDoor,
    center(li, c, r) { return new THREE.Vector3((c + 0.5) * CELL, L.levels[li].y, (r + 0.5) * CELL); },
    // 區域內可放道具的格子:可走、非門、非樓梯/出生點/補給/商店,且不緊貼門口
    cells(zone, { allowNearDoor = false } = {}) {
      const li = zone.levelIndex, out = [];
      for (const [c0, r0, c1, r1] of zone.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (!isPlain(li, c, r) || occ[li][r * L.W + c]) continue;
        if (!allowNearDoor && nearDoor(li, c, r)) continue;
        out.push({ c, r, li, x: (c + 0.5) * CELL, y: L.levels[li].y, z: (r + 0.5) * CELL });
      }
      return out;
    },
    // 靠牆位置:每個可放的格子 × 每一面實牆。x/z 為牆面上的點,yaw 讓物件的 +Z 面朝房間內
    wallSpots(zone, opts) {
      const out = [];
      for (const cell of ctx.cells(zone, opts)) for (const [side, [dc, dr, yaw]] of Object.entries(SIDES)) {
        if (!isSolid(cell.li, cell.c + dc, cell.r + dr)) continue;
        out.push({ ...cell, side, yaw, x: cell.x + dc * CELL * 0.5, z: cell.z + dr * CELL * 0.5, nx: -dc, nz: -dr });
      }
      return out;
    },
    occupied: (li, c, r) => occ[li][r * L.W + c] === 1,
    occupy(li, c, r) { if (c >= 0 && r >= 0 && c < L.W && r < L.H) occ[li][r * L.W + c] = 1; },
    // 把物件加進場景。collide:登記碰撞盒(世界 AABB,shrink 往內縮);
    // static:最後依材質合併(只能用 mat() 的共用材質、不會再動的物件);block:標記佔用格子
    add(obj, { collide = false, shrink = 0.05, static: isStatic = true, block = collide, mat = null, tag = null } = {}) {
      group.add(obj);
      obj.updateMatrixWorld(true);
      if (collide || block) {
        box.setFromObject(obj);
        if (collide) {
          const sx = Math.max(0.05, box.max.x - box.min.x - shrink * 2), sz = Math.max(0.05, box.max.z - box.min.z - shrink * 2);
          const b = world.addBox((box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, sx, sz, box.max.y - box.min.y, box.min.y);
          if (b) { if (mat) b.mat = mat; if (tag) b.tag = tag; } // 材質/來源模板(子彈穿透、彈著效果;physics/truth.js)
        }
        if (block) {
          const li = L.levelOfY(box.min.y + 0.2);
          for (let c = Math.floor(box.min.x / CELL); c <= Math.floor((box.max.x - 1e-3) / CELL); c++)
            for (let r = Math.floor(box.min.z / CELL); r <= Math.floor((box.max.z - 1e-3) / CELL); r++) ctx.occupy(li, c, r);
        }
      }
      if (isStatic) obj.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) statics.push(o); });
      return obj;
    },
    // 燈具登記(場景建構器的光源池會挑玩家附近的燈具放真正的點光源)
    // { x, y, z, color, intensity, distance, kind, flicker: 0..1, zone }
    light(spec) { lights.push(spec); return spec; },
    // 腳本事件錨點 { kind, x, y, z, zone, ... }
    event(spec) { events.push(spec); return spec; },
    lights, events,
    // 合併靜態網格:同材質合成一個網格(大量減少 draw call)
    finalize() {
      const byMat = new Map();
      for (const m of statics) {
        if (!m.parent || Array.isArray(m.material)) continue;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.applyMatrix4(m.matrixWorld);
        const list = byMat.get(m.material) || [];
        list.push(g);
        byMat.set(m.material, list);
        m.parent.remove(m);
      }
      for (const [material, geos] of byMat) {
        for (let i = 0; i < geos.length; i += 400) { // 分批避免單一網格過大
          const merged = mergeGeometries(geos.slice(i, i + 400));
          if (!merged) continue;
          const mesh = new THREE.Mesh(merged, material);
          mesh.castShadow = !material.transparent;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          group.add(mesh);
        }
      }
      statics.length = 0;
      return { lights, events };
    },
  };
  return ctx;
}
