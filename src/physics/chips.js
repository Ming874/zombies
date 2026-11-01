import * as THREE from 'three';

// 子彈打在牆上/地上濺出的碎屑(有物理、會彈跳滾動):全部共用一個 InstancedMesh(1 個 draw call)
export const CHIP_KINDS = {
  concrete: [0x8d8a82, 0x67645d], plaster: [0xbab6aa, 0x8f8b80], tile: [0xdcdcd4, 0xa4a6a0], wood: [0x70503a, 0x4a3324],
  glass: [0xb4d2d2, 0x86a6a8], metal: [0x6a6c6e, 0x3e4042], flesh: [0x5e0c0a, 0x360404], stone: [0x77736a, 0x55524b],
};

export function createChipMesh(scene, cap) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.04 });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'physics-chips';
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m = new THREE.Matrix4(), c = new THREE.Color();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < cap; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, c.set(0x888888)); }
  scene.add(mesh);
  let dirty = false, cdirty = false;
  return {
    mesh,
    set(i, vis, o, sx, sy, sz) {
      p.set(vis[o], vis[o + 1], vis[o + 2]);
      q.set(vis[o + 3], vis[o + 4], vis[o + 5], vis[o + 6]);
      mesh.setMatrixAt(i, m.compose(p, q, s.set(sx, sy, sz)));
      dirty = true;
    },
    hide(i) { mesh.setMatrixAt(i, zero); dirty = true; },
    color(i, hex) { mesh.setColorAt(i, c.set(hex)); cdirty = true; },
    flush() {
      if (dirty) { mesh.instanceMatrix.needsUpdate = true; dirty = false; }
      if (cdirty) { mesh.instanceColor.needsUpdate = true; cdirty = false; }
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
