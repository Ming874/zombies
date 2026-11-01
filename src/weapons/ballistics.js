import * as THREE from 'three';

// 射線 vs 殭屍命中盒(解析解,零配置):命中盒是掛在骨骼上的單位球/單位圓柱(y 軸、高 1)/單位方塊,
// 把射線轉到命中盒的區域座標後直接求交;先用每隻殭屍的包圍球做粗篩。
// 結果寫進 HITS[0..n)(依距離排序,每隻殭屍只留最近的命中盒)。

const _inv = new THREE.Matrix4(), _o = new THREE.Vector3(), _e = new THREE.Vector3();
export const HITS = Array.from({ length: 32 }, () => ({ z: null, h: null, t: 0, part: 'body', bone: '' }));

function kindOf(h) {
  let k = h.userData._k;
  if (!k) {
    const t = h.geometry.type;
    k = h.userData._k = t.startsWith('Sphere') ? 1 : t.startsWith('Cylinder') ? 2 : 3;
  }
  return k;
}

// 區域座標中的射線 o + t d(d 不必正規化,t 與世界距離一致),回傳最近的非負 t 或 -1
function hitLocal(k, ox, oy, oz, dx, dy, dz) {
  if (k === 1) { // 單位球
    const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    let t = (-b - s) / a;
    if (t < 0) t = (-b + s) / a;
    return t >= 0 ? t : -1;
  }
  if (k === 2) { // 單位圓柱:x²+z² ≤ 1、|y| ≤ 0.5
    let best = -1;
    const a = dx * dx + dz * dz;
    if (a > 1e-12) {
      const b = ox * dx + oz * dz, c = ox * ox + oz * oz - 1;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const t1 = (-b - s) / a, t2 = (-b + s) / a;
        if (t1 >= 0) { const y = oy + dy * t1; if (y >= -0.5 && y <= 0.5) best = t1; }
        if (best < 0 && t2 >= 0) { const y = oy + dy * t2; if (y >= -0.5 && y <= 0.5) best = t2; }
      }
    }
    if (Math.abs(dy) > 1e-12) {
      const ta = (-0.5 - oy) / dy, tb = (0.5 - oy) / dy;
      if (ta >= 0 && (best < 0 || ta < best)) { const x = ox + dx * ta, z = oz + dz * ta; if (x * x + z * z <= 1) best = ta; }
      if (tb >= 0 && (best < 0 || tb < best)) { const x = ox + dx * tb, z = oz + dz * tb; if (x * x + z * z <= 1) best = tb; }
    }
    return best;
  }
  // 單位方塊 [-0.5, 0.5]³(slab)
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz, d = i === 0 ? dx : i === 1 ? dy : dz;
    if (Math.abs(d) < 1e-12) { if (o < -0.5 || o > 0.5) return -1; continue; }
    let a = (-0.5 - o) / d, b = (0.5 - o) / d;
    if (a > b) { const tmp = a; a = b; b = tmp; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  if (t1 < 0) return -1;
  return t0 >= 0 ? t0 : t1;
}

// 包圍球(粗篩):中心在腳底上方,半徑依體型
function broad(z, ox, oy, oz, dx, dy, dz, maxD) {
  const big = z.type === 'brute', low = z.type === 'crawler';
  const R = big ? 1.75 : low ? 1.15 : 1.2;
  const cx = z.pos.x - ox, cy = z.pos.y + (big ? 1.15 : low ? 0.35 : 0.95) - oy, cz = z.pos.z - oz;
  const tca = cx * dx + cy * dy + cz * dz;
  if (tca < -R || tca - R > maxD) return false;
  const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
  return d2 <= R * R;
}

// origin/dir:世界座標(dir 為單位向量);回傳命中數量
export function castZombies(zombies, origin, dir, maxD) {
  let n = 0;
  const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
  for (let zi = 0; zi < zombies.length; zi++) {
    const z = zombies[zi];
    if (!z.alive || !broad(z, ox, oy, oz, dx, dy, dz, maxD)) continue;
    z.root.updateMatrixWorld(true);
    let bt = Infinity, bh = null;
    const hb = z.hitboxes;
    for (let i = 0; i < hb.length; i++) {
      const h = hb[i];
      const m = h.matrixWorld;
      if (Math.abs(m.determinant()) < 1e-12) continue; // 被斷掉的部位(縮放為 0)
      _inv.copy(m).invert();
      _o.set(ox, oy, oz).applyMatrix4(_inv);
      _e.set(ox + dx, oy + dy, oz + dz).applyMatrix4(_inv).sub(_o);
      const t = hitLocal(kindOf(h), _o.x, _o.y, _o.z, _e.x, _e.y, _e.z);
      if (t >= 0 && t < bt && t <= maxD) { bt = t; bh = h; }
    }
    if (!bh || n >= HITS.length) continue;
    // 依距離插入排序
    let j = n++;
    while (j > 0 && HITS[j - 1].t > bt) {
      const a = HITS[j], b = HITS[j - 1];
      a.z = b.z; a.h = b.h; a.t = b.t; a.part = b.part; a.bone = b.bone;
      j--;
    }
    const r = HITS[j];
    r.z = z; r.h = bh; r.t = bt; r.part = bh.userData.part || 'body'; r.bone = bh.parent ? bh.parent.name : '';
  }
  return n;
}
