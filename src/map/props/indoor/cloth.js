import * as THREE from 'three';

// 布料幾何:隔簾(有褶、破洞、下襬撕裂)、蓋在人形上的白布(高度場 + 鬆弛)、垂掛的床單邊。

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

function gridGeo(nx, nz, fn) {
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, p = fn(i / nx, j / nz, i, j);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = p[3] ?? i / nx; uv[k * 2 + 1] = p[4] ?? j / nz;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 隔簾:沿折線 path(XZ,y=top),由 top 垂到 bottom;pleat 褶深;holes 破洞比例;rag 下襬撕裂程度;bunch 收攏(0..1)
export function curtainGeo(path, top, bottom, { pleat = 0.035, holes = 0, rag = 0, seed = 1, bunch = 0 } = {}) {
  const rnd = (() => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); segs.push([path[i - 1], path[i], total, l]); total += l; }
  const along = (s) => {
    for (const [a, b, s0, l] of segs) if (s <= s0 + l + 1e-6) { const t = (s - s0) / l; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -(b[1] - a[1]) / l, (b[0] - a[0]) / l]; }
    const [, b, , l] = segs[segs.length - 1], a = segs[segs.length - 1][0];
    return [b[0], b[1], -(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  const len = total * (1 - bunch * 0.75);
  const nx = Math.max(4, Math.ceil(len / 0.07)), ny = 3;
  const H = top - bottom;
  const cut = []; // 每欄下襬撕裂高度
  for (let i = 0; i <= nx; i++) cut.push(rag * (rnd() < 0.35 ? rnd() * 0.6 : rnd() * 0.08) * H);
  for (let i = 1; i < nx; i++) cut[i] = (cut[i - 1] + cut[i] * 2 + cut[i + 1]) / 4;
  const pos = [], uv = [], nor = [];
  const P = (i, j) => {
    const u = i / nx, s = u * len, v = j / ny;
    const [x, z, nX, nZ] = along(s);
    const y = top - v * (H - cut[i]);
    const amp = pleat * (1 + bunch * 2.5) * (0.6 + 0.4 * v);
    const w = Math.sin((s / (0.11 * (1 - bunch * 0.6))) * Math.PI * 2) * amp + Math.sin(s * 7.3 + seed) * 0.01 * v;
    return [x + nX * w, y, z + nZ * w, (s / (1 - bunch * 0.75)) * 0.5, 1 - (top - y) * 0.5];
  };
  const skip = new Set();
  if (holes > 0) for (let k = 0; k < holes * 12; k++) { // 破洞:隨機矩形區塊
    const i0 = (rnd() * nx) | 0, j0 = 2 + ((rnd() * (ny - 3)) | 0), w = 1 + ((rnd() * 4) | 0), h = 1 + ((rnd() * 3) | 0);
    for (let i = i0; i < Math.min(nx, i0 + w); i++) for (let j = j0; j < Math.min(ny, j0 + h); j++) skip.add(j * nx + i);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (skip.has(j * nx + i)) continue;
    const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1);
    for (const q of [a, c, b, b, c, d]) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); }
  }
  // 平滑法線(同位置平均),再複製一份反向三角形當背面(材質庫是單面材質)
  const n = pos.length / 3, nrm = new Float32Array(n * 3), acc = new Map();
  for (let i = 0; i < n; i += 3) {
    const a = i * 3, b = a + 3, c = a + 6;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) {
      const j = (i + k) * 3, key = `${Math.round(pos[j] * 1e4)},${Math.round(pos[j + 1] * 1e4)},${Math.round(pos[j + 2] * 1e4)}`;
      const e = acc.get(key) || [0, 0, 0];
      e[0] += fx; e[1] += fy; e[2] += fz;
      acc.set(key, e);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = i * 3, e = acc.get(`${Math.round(pos[j] * 1e4)},${Math.round(pos[j + 1] * 1e4)},${Math.round(pos[j + 2] * 1e4)}`);
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    nrm[j] = e[0] / l; nrm[j + 1] = e[1] / l; nrm[j + 2] = e[2] / l;
  }
  const P2 = new Float32Array(n * 6), N2 = new Float32Array(n * 6), U2 = new Float32Array(n * 4);
  P2.set(pos); N2.set(nrm); U2.set(uv);
  for (let i = 0; i < n; i += 3) for (let k = 0; k < 3; k++) {
    const src = i + [0, 2, 1][k], dst = n + i + k;
    for (let c = 0; c < 3; c++) { P2[dst * 3 + c] = pos[src * 3 + c]; N2[dst * 3 + c] = -nrm[src * 3 + c]; }
    U2[dst * 2] = uv[src * 2]; U2[dst * 2 + 1] = uv[src * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U2, 2));
  void nor;
  return g;
}

// 人形(仰躺):回傳 (x,z) 處高出床面的高度;z 由頭(-)到腳(+)
export function bodyHeight(x, z, o = {}) {
  const sc = o.scale ?? 1;
  x /= sc; z /= sc;
  const e = (cx, cz, rx, rz, h) => { const d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2; return d < 1 ? h * Math.sqrt(1 - d) : 0; };
  let h = 0;
  h = Math.max(h, e(0, -0.8, 0.1, 0.12, 0.2)); // 頭
  h = Math.max(h, e(0, -0.62, 0.07, 0.06, 0.1)); // 頸
  h = smax(h, e(0, -0.38, 0.23, 0.25, 0.21), 0.05); // 胸
  h = smax(h, e(0, -0.08, 0.2, 0.2, 0.18), 0.05); // 腹
  h = smax(h, e(0, 0.12, 0.2, 0.14, 0.17), 0.05); // 骨盆
  for (const s of [-1, 1]) {
    h = smax(h, e(s * 0.1, 0.42, 0.085, 0.28, 0.13), 0.04); // 大腿
    h = smax(h, e(s * 0.1, 0.78, 0.065, 0.2, 0.1), 0.03); // 小腿
    h = Math.max(h, e(s * 0.1 + s * 0.02, 0.96, 0.05, 0.05, 0.17)); // 腳尖朝上
    h = smax(h, e(s * 0.27, -0.25, 0.05, 0.28, 0.08), 0.03); // 手臂
    h = Math.max(h, e(s * 0.27, 0.08, 0.05, 0.07, 0.07)); // 手
  }
  return h * sc;
}

// 白布蓋人形:寬 w、長 len(床面範圍),布邊垂下 drop;回傳以床面中心為原點的幾何(y=0 為床面)
export function sheetOverBody({ w = 0.9, len = 1.95, drop = 0.3, cw = 1.4, cl = 2.25, body = true, seed = 3, bodyScale = 1, offZ = 0 } = {}) {
  const nx = 30, nz = 56;
  const hx = cw / 2, hz = cl / 2;
  const Hf = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -hx + (i / nx) * cw, z = -hz + (j / nz) * cl;
    Hf[j * (nx + 1) + i] = body ? bodyHeight(x, z - offZ, { scale: bodyScale }) : 0;
  }
  // 布的張力:多次鬆弛(取 max(高度場, 鄰居平均 - 下垂))
  let cur = Float32Array.from(Hf);
  for (let it = 0; it < 26; it++) {
    const nxt = new Float32Array(cur.length);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const a = cur[j * (nx + 1) + Math.max(0, i - 1)], b = cur[j * (nx + 1) + Math.min(nx, i + 1)], c = cur[Math.max(0, j - 1) * (nx + 1) + i], d = cur[Math.min(nz, j + 1) * (nx + 1) + i];
      nxt[k] = Math.max(Hf[k], (a + b + c + d) / 4 - 0.004);
    }
    cur = nxt;
  }
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ph = r() * 10;
  return gridGeo(nx, nz, (u, v, i, j) => {
    let x = -hx + u * cw, z = -hz + v * cl;
    let y = cur[j * (nx + 1) + i] + 0.012;
    // 床緣外垂下
    const ox = Math.max(0, Math.abs(x) - w / 2), oz = Math.max(0, Math.abs(z) - len / 2);
    const o = Math.max(ox, oz);
    if (o > 0) {
      const t = Math.min(1, o / 0.06);
      y = y * (1 - t) + 0.012 * t - Math.min(drop, Math.max(0, o - 0.02) * 1.6);
      const pull = Math.min(o, drop * 0.85);
      if (ox > 0) x = Math.sign(x) * (w / 2 + Math.min(ox, 0.04) + (ox - Math.min(ox, 0.04)) * 0.08) + Math.sin(z * 18 + ph) * 0.015 * Math.min(1, ox * 5);
      if (oz > 0) z = Math.sign(z) * (len / 2 + Math.min(oz, 0.04) + (oz - Math.min(oz, 0.04)) * 0.08) + Math.sin(x * 18 + ph) * 0.015 * Math.min(1, oz * 5);
      void pull;
    }
    y += Math.sin(x * 23 + z * 7 + ph) * 0.004 + Math.sin(z * 31 + ph * 2) * 0.003;
    return [x, y, z, x * 0.7 + 0.3, z * 0.7];
  });
}

// 一般布料垂掛:長方形布(w × d)蓋在高度 fn(x,z) 上
export function drape(w, d, fn, { nx = 24, nz = 24, seed = 2, wrinkle = 0.01 } = {}) {
  const ph = seed * 1.7;
  return gridGeo(nx, nz, (u, v) => {
    const x = (u - 0.5) * w, z = (v - 0.5) * d;
    const y = fn(x, z) + Math.sin(x * 19 + ph) * wrinkle * 0.6 + Math.sin(z * 23 + ph * 2) * wrinkle * 0.5;
    return [x, y, z, x * 0.7, z * 0.7];
  });
}
