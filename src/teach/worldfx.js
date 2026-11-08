import * as THREE from 'three';

// ===== 真實遊戲場景的「拆解」效果:線框、純色(src/teach/lessons 的世界場景共用)=====
// 用 scene.overrideMaterial 讓整個醫院改用同一種材質畫。
// 線框的坑:醫院的靜態幾何全部合在 BatchedMesh 裡(src/map/hospital/batch.js,perObjectFrustumCulled = false)。
// three r186 的 BatchedMesh.onBeforeRender 會依材質是不是線框把多重繪製的起點/數量乘 2(線框索引是兩倍長),
// 但「可見性沒變」時直接沿用上一次算好的陣列 —— 那可能是陰影 pass(非線框)算的 → 只畫出一半、位置錯亂的線。
// 所以:這一個 pass 的線框狀態跟上次算的不一樣時,先把 _visibilityChanged 設起來,逼它照當前材質重算。

const patched = new WeakSet();

function patchBatched(scene) {
  scene.traverse((o) => {
    if (!o.isBatchedMesh || patched.has(o)) return;
    patched.add(o);
    const orig = o.onBeforeRender;
    o.onBeforeRender = function (renderer, sc, camera, geometry, material, group) {
      const w = !!material?.wireframe;
      if (w !== !!this._hzWire) { this._visibilityChanged = true; this._hzWire = w; }
      return orig.call(this, renderer, sc, camera, geometry, material, group);
    };
  });
}

export const WIRE = new THREE.MeshBasicMaterial({ color: 0x5fe0a8, wireframe: true, fog: false });
export const FLAT = new THREE.MeshBasicMaterial({ color: 0x9aa6a2, fog: false });
export const CLAY = new THREE.MeshLambertMaterial({ color: 0xb8b2a8 });

// mode: null(原本的樣子)| 'wire' | 'flat' | 'clay'
export function override(game, mode, color) {
  const sc = game.scene;
  patchBatched(sc);
  const m = mode === 'wire' ? WIRE : mode === 'flat' ? FLAT : mode === 'clay' ? CLAY : null;
  if (m && color != null) m.color.set(color);
  sc.overrideMaterial = m;
}
