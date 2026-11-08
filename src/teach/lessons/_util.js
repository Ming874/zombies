import * as THREE from 'three';

// 各章共用的小工具與道具
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const rad = THREE.MathUtils.degToRad;
export const deg = THREE.MathUtils.radToDeg;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, ...o });

// 簡單的膠囊人(殭屍/玩家的替身):原點在腳底、面向 +Z
export function dummy(color = 0x6f8f6a, o = {}) {
  const g = new THREE.Group();
  const m = std(color, { roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.86, 6, 14), m);
  body.position.y = 0.76;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), m);
  head.position.y = 1.56;
  for (const x of [body, head]) { x.castShadow = true; x.receiveShadow = true; g.add(x); }
  if (o.eyes !== false) {
    const em = new THREE.MeshBasicMaterial({ color: o.eye ?? 0xffe28a });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), em); e.position.set(s * 0.075, 1.6, 0.175); g.add(e); }
  }
  if (o.arms) {
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 8), m);
      a.rotation.x = -Math.PI / 2 + 0.15;
      a.position.set(s * 0.33, 1.22, 0.3);
      a.castShadow = true;
      g.add(a);
    }
  }
  g.userData.body = body;
  g.userData.head = head;
  g.userData.mat = m;
  return g;
}

// 地上的目標圈
export function ring(r = 0.6, color = 0xffcf5a) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.position.y = 0.01;
  m.renderOrder = 2;
  return m;
}

// 三軸箭頭(X 紅、Y 綠、Z 藍),回傳 group;標籤由呼叫的人用 T.label 加
export function axes(len = 3, o = {}) {
  const g = new THREE.Group();
  const C = [0xff5a4a, 0x5fe0a8, 0x4aa8ff], D = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  D.forEach((d, i) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(...d), new THREE.Vector3(0, o.y ?? 0.01, 0), len, C[i], 0.3, 0.16);
    a.line.material.linewidth = 2;
    g.add(a);
    if (o.neg !== false) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, o.y ?? 0.01, 0), new THREE.Vector3(-d[0] * len, (o.y ?? 0.01) - d[1] * len * 0, -d[2] * len)]);
      if (i !== 1) g.add(new THREE.Line(geo, new THREE.LineDashedMaterial({ color: C[i], dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.5 })).computeLineDistances());
    }
  });
  return g;
}

// 線段(兩點或很多點),回傳 THREE.Line;line.set(points) 更新
export function line(points = [new THREE.Vector3(), new THREE.Vector3()], color = 0xffcf5a, o = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = o.dashed ? new THREE.LineDashedMaterial({ color, dashSize: o.dash ?? 0.15, gapSize: o.gap ?? 0.1, transparent: true, opacity: o.opacity ?? 1, depthTest: o.depthTest ?? true }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: o.opacity ?? 1, depthTest: o.depthTest ?? true });
  const L = new THREE.Line(geo, mat);
  if (o.dashed) L.computeLineDistances();
  L.set = (pts) => {
    const pos = L.geometry.attributes.position;
    if (pos.count !== pts.length) { L.geometry.dispose(); L.geometry = new THREE.BufferGeometry().setFromPoints(pts); }
    else { pts.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z)); pos.needsUpdate = true; L.geometry.computeBoundingSphere(); }
    if (o.dashed) L.computeLineDistances();
    return L;
  };
  return L;
}

// 一盞會發光的小燈泡(看得到燈在哪)
export function bulb(color = 0xffe7b0, r = 0.12) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color }));
}

// 箱子(木箱色)
export function crate(s = 1, color = 0x8a6a45) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0), std(color, { roughness: 0.85 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

// 漸進動畫:每幀呼叫 step(k 0..1),結束呼叫 end
export function tween(T, dur, step, end) {
  let t = 0, alive = true;
  const f = T.every((dt) => {
    if (!alive) return;
    t = Math.min(1, t + dt / dur);
    step(t);
    if (t >= 1) { alive = false; end?.(); }
  });
  return { stop() { alive = false; }, f };
}
