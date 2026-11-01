import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { stainMaterial, stainPlane } from '../art/stainmat.js';

// 埋伏用的小型場景物件(全部共用幾何/材質,不配置 PointLight):
//  - 通風格柵:天花板(散布在走廊/房間,固定種子 → 各端一致)+ 牆腳通風口(L.vents),全部一個 InstancedMesh;
//    天花板掉落時那一格縮成 0,換成「打開的黑洞」(另一個 InstancedMesh)+ 一塊掉下來的格柵(物理碎片;沒有物理時自己做動畫)
//  - 天花板破洞掉落時的碎板、血滴(小方塊池)與地上的小血漬(圓片池)
//  - 屍體下的血泊(假屍體與裝死的殭屍共用,看起來一模一樣)
const GRILLE = 0.6;

function box(w, h, d, x, y, z, c, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// 格柵幾何(本地座標:y = 0 為安裝面(天花板),朝 -Y):黑色內襯、外框、斜百葉。parts:'full' | 'open'(只剩外框 + 黑洞)| 'loose'(掉下來的那片)
function grilleGeo(parts) {
  const H = GRILLE / 2, FR = [0.4, 0.4, 0.38], SL = [0.3, 0.3, 0.29], BK = [0.012, 0.012, 0.012];
  const list = [];
  if (parts !== 'loose') list.push(box(GRILLE - 0.04, 0.004, GRILLE - 0.04, 0, -0.003, 0, BK));
  {
    const fz = parts === 'loose' ? 0 : -0.009, t = 0.012;
    list.push(box(GRILLE, t, 0.035, 0, fz, -H + 0.0175, FR), box(GRILLE, t, 0.035, 0, fz, H - 0.0175, FR));
    list.push(box(0.035, t, GRILLE - 0.07, -H + 0.0175, fz, 0, FR), box(0.035, t, GRILLE - 0.07, H - 0.0175, fz, 0, FR));
  }
  if (parts !== 'open') for (let i = 0; i < 8; i++) list.push(box(GRILLE - 0.07, 0.005, 0.03, 0, parts === 'loose' ? 0.004 : -0.014, -H + 0.06 + i * ((GRILLE - 0.12) / 7), SL, 0.55));
  const g = mergeGeometries(list);
  list.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createAmbushProps(game, L, grilles, vents) {
  const group = new THREE.Group();
  group.name = 'ambush-props';
  game.scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.62 });
  const gFull = grilleGeo('full'), gOpen = grilleGeo('open'), gLoose = grilleGeo('loose');
  const nG = grilles.length, n = nG + vents.length;
  const inst = new THREE.InstancedMesh(gFull, mat, Math.max(1, n));
  const open = new THREE.InstancedMesh(gOpen, mat, Math.max(1, nG));
  inst.name = 'ambush-grilles'; open.name = 'ambush-hatches';
  for (const m of [inst, open]) { m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.raycast = () => {}; group.add(m); }
  const base = []; // 每個實例的原始矩陣
  const place = (i, x, y, z, yaw, wall, sx = 1, sz = 1) => {
    _q.setFromEuler(_e.set(0, yaw, 0));
    if (wall) _q.multiply(_q2.setFromEuler(_e.set(-Math.PI / 2, 0, 0)));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, 1, sz));
    base[i] = _m.clone();
    inst.setMatrixAt(i, _m);
  };
  grilles.forEach((g, i) => { place(i, g.x, g.y - 0.002, g.z, g.rot, false); open.setMatrixAt(i, ZERO); });
  // 牆腳通風口:wall = 通風口所在的牆面方向;格柵面向房內、離地約 0.15~0.5m
  vents.forEach((v, j) => {
    const o = 0.016, C = L.CELL;
    const P = { N: [(v.c + 0.5) * C, v.r * C + o, 0], S: [(v.c + 0.5) * C, (v.r + 1) * C - o, Math.PI], E: [(v.c + 1) * C - o, (v.r + 0.5) * C, -Math.PI / 2], W: [v.c * C + o, (v.r + 0.5) * C, Math.PI / 2] }[v.wall] || [(v.c + 0.5) * C, v.r * C + o, 0];
    place(nG + j, P[0], v.y + 0.33, P[1], P[2], true, 0.95, 0.62);
  });
  inst.instanceMatrix.needsUpdate = true;
  open.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  open.frustumCulled = false; // 打開的黑洞一開始全部縮成 0:包圍球會是退化的(整組被剔除、永遠畫不出來),不做剔除(一個 draw call)
  const state = new Uint8Array(Math.max(1, nG)); // 0 正常 / 1 晃動中 / 2 已打開
  let dirty = false, dirtyO = false;

  // ---- 掉下來的碎片(格柵、天花板碎板):有物理用物理碎片,否則自己做落下/彈跳 ----
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a6, roughness: 0.95 });
  const tileGeo = new THREE.BoxGeometry(0.34, 0.016, 0.31);
  const falling = [], loose = [];
  function drop(mesh, vx, vz, spin) {
    mesh.castShadow = true;
    group.add(mesh);
    loose.push(mesh);
    if (loose.length > 16) { const o = loose.shift(); o.userData.rec?.remove?.(); o.parent?.remove(o); const k = falling.findIndex((f) => f.m === o); if (k >= 0) falling.splice(k, 1); }
    const ph = game.physics;
    if (ph?.ready && ph.addDebris) {
      mesh.updateMatrixWorld(true);
      const rec = ph.addDebris(mesh, { vel: { x: vx, y: -0.6, z: vz }, spin, life: 14, mass: 1.6, shape: 'box', friction: 0.8, restitution: 0.2, onExpire: (m) => { const k = loose.indexOf(m); if (k >= 0) loose.splice(k, 1); } });
      if (rec) { mesh.userData.rec = rec; return; }
    }
    const fy = game.world.groundY(mesh.position.x, mesh.position.z, mesh.position.y - 0.3);
    falling.push({ m: mesh, vx, vy: -0.6, vz, wx: spin.x, wz: spin.z, floor: (fy ?? mesh.position.y - 3) + 0.012, bounce: 0 });
  }

  // ---- 血滴與地上的血漬 ----
  const dripMat = new THREE.MeshBasicMaterial({ color: 0x3a0404 });
  const dripGeo = new THREE.BoxGeometry(0.009, 0.028, 0.009);
  const drips = [];
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(dripGeo, dripMat); m.visible = false; m.raycast = () => {}; group.add(m); drips.push({ m, vy: 0, floor: 0, on: false, spot: null }); }
  // 地上的小血漬與屍體下的血泊:共用的寫實血跡材質(src/art/stainmat.js;滴落濺開格 / 新鮮血泊格)
  const splatMat = stainMaterial();
  const splatGeo = stainPlane('splatF', 2).rotateX(-Math.PI / 2);
  const splats = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(splatGeo, splatMat); m.visible = false; m.raycast = () => {}; m.renderOrder = 1; group.add(m); splats.push({ m, key: null, r: 0 }); }
  let splatI = 0;
  const splatFor = (spot) => {
    let s = splats.find((q) => q.key === spot);
    if (!s) { s = splats[splatI++ % splats.length]; s.key = spot; s.r = 0.03; s.m.visible = true; s.m.position.set(spot.x + (Math.random() - 0.5) * 0.08, spot.y + 0.008, spot.z + (Math.random() - 0.5) * 0.08); s.m.scale.setScalar(s.r); }
    return s;
  };

  // 屍體下的血泊(與 fx.js 的血池同一個材質;暖機時已編好)
  const poolMat = stainMaterial();
  const poolGeo = stainPlane('pool0', 0.75).rotateX(-Math.PI / 2);
  const pools = [];
  // 預編譯用的原型(看不到):掉落中的格柵/碎板是一般網格 + 會投影、血泊,開機預編譯掃場景時一起編好
  for (const m of [new THREE.Mesh(gLoose, mat), new THREE.Mesh(tileGeo, tileMat), new THREE.Mesh(poolGeo, poolMat)]) { m.visible = false; m.castShadow = m.material !== poolMat; m.raycast = () => {}; group.add(m); }

  const api = {
    group, inst, open,
    // 格柵 i 換成「被頂開的黑洞」並掉一片格柵下來(天花板掉落)
    breakGrille(i) {
      if (i < 0 || i >= nG || state[i] === 2) return;
      state[i] = 2;
      inst.setMatrixAt(i, ZERO); dirty = true;
      open.setMatrixAt(i, base[i]); dirtyO = true;
      const g = grilles[i], m = new THREE.Mesh(gLoose, mat);
      m.position.set(g.x, g.y - 0.03, g.z);
      m.rotation.set((Math.random() - 0.5) * 0.4, g.rot, (Math.random() - 0.5) * 0.4);
      drop(m, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 7 });
    },
    // 天花板破洞:掉兩三塊碎板
    breakTiles(x, y, z) {
      for (let k = 0, nn = 2 + (Math.random() < 0.5 ? 1 : 0); k < nn; k++) {
        const m = new THREE.Mesh(tileGeo, tileMat);
        m.position.set(x + (Math.random() - 0.5) * 0.4, y - 0.05, z + (Math.random() - 0.5) * 0.4);
        m.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 6.28, (Math.random() - 0.5) * 0.8);
        drop(m, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, { x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 9 });
      }
    },
    // 有東西在上面推:格柵輕微晃動(amt 0..1)
    jiggle(i, amt) {
      if (i < 0 || i >= nG || state[i] === 2) return;
      if (amt <= 0) { if (state[i] === 1) { inst.setMatrixAt(i, base[i]); state[i] = 0; dirty = true; } return; }
      state[i] = 1;
      const g = grilles[i];
      _q.setFromEuler(_e.set((Math.random() - 0.5) * 0.05 * amt, g.rot, (Math.random() - 0.5) * 0.05 * amt));
      _m.compose(_p.set(g.x, g.y - 0.002 - Math.random() * 0.012 * amt, g.z), _q, _s.set(1, 1, 1));
      inst.setMatrixAt(i, _m); dirty = true;
    },
    isOpen: (i) => state[i] === 2,
    // 血滴:從 (x, y, z) 落到 floorY,落地後加大地上的血漬
    drip(spot, x, y, z) {
      const d = drips.find((q) => !q.on);
      if (!d) return false;
      d.on = true; d.spot = spot; d.vy = -0.3; d.floor = spot.y + 0.01;
      d.m.position.set(x, y, z); d.m.visible = true;
      return true;
    },
    splat(spot, grow) { const s = splatFor(spot); s.r = Math.min(0.24, s.r + grow); s.m.scale.setScalar(s.r); },
    // 屍體下的血泊:回傳網格(removePool 移除)
    pool(x, y, z, size) {
      const m = new THREE.Mesh(poolGeo, poolMat);
      m.position.set(x, y + 0.012 + (pools.length % 12) * 0.0004, z);
      m.rotation.y = Math.random() * Math.PI * 2;
      m.scale.set(size, 1, size * (0.8 + Math.random() * 0.35));
      m.renderOrder = 1;
      m.raycast = () => {};
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
      pools.push(m);
      return m;
    },
    removePool(m) { const i = pools.indexOf(m); if (i >= 0) pools.splice(i, 1); m?.parent?.remove(m); },
    update(dt) {
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i], m = f.m;
        f.vy -= 9.8 * dt;
        m.position.x += f.vx * dt; m.position.y += f.vy * dt; m.position.z += f.vz * dt;
        m.rotation.x += f.wx * dt; m.rotation.z += f.wz * dt;
        if (m.position.y <= f.floor) {
          m.position.y = f.floor;
          if (++f.bounce > 2 || Math.abs(f.vy) < 1) { m.rotation.x = 0; m.rotation.z = 0; falling.splice(i, 1); continue; }
          f.vy = -f.vy * 0.25; f.vx *= 0.4; f.vz *= 0.4; f.wx *= 0.3; f.wz *= 0.3;
        }
      }
      for (const d of drips) {
        if (!d.on) continue;
        d.vy -= 9.8 * dt;
        d.m.position.y += d.vy * dt;
        if (d.m.position.y <= d.floor) { d.on = false; d.m.visible = false; api.onDrip?.(d.spot, d.m.position); }
      }
      if (dirty) { inst.instanceMatrix.needsUpdate = true; dirty = false; }
      if (dirtyO) { open.instanceMatrix.needsUpdate = true; dirtyO = false; }
    },
    // 新的一局:格柵全部裝回去、清掉碎片/血滴/血漬
    reset() {
      for (let i = 0; i < nG; i++) { if (state[i]) inst.setMatrixAt(i, base[i]); open.setMatrixAt(i, ZERO); state[i] = 0; }
      inst.instanceMatrix.needsUpdate = true; open.instanceMatrix.needsUpdate = true;
      for (const m of loose) { m.userData.rec?.remove?.(); m.parent?.remove(m); }
      loose.length = 0; falling.length = 0;
      for (const d of drips) { d.on = false; d.m.visible = false; }
      for (const s of splats) { s.key = null; s.m.visible = false; }
      for (const m of pools) m.parent?.remove(m);
      pools.length = 0;
    },
    dispose() {
      api.reset();
      game.scene.remove(group);
      for (const g of [gFull, gOpen, gLoose, tileGeo, dripGeo, splatGeo, poolGeo]) g.dispose();
      for (const m of [mat, tileMat, dripMat]) { m.map?.dispose(); m.dispose(); } // 血跡材質是共用的,不釋放
      inst.dispose(); open.dispose();
    },
  };
  return api;
}
