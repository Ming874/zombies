import * as THREE from 'three';
import { casingGeo, shellGeos, ENV_MAP } from './models.js';
import { fxSpatterRGBA } from '../art/stainset.js';

// 武器特效(全部物件池 / InstancedMesh,更新時零配置):
//   Debris  受光照的碎屑/血滴/木屑/磁磚碎片/玻璃碎片(InstancedMesh + instanceColor)
//   Glow    加法混色的火花/餘燼(沿速度拉長)
//   Puffs   面向鏡頭的煙/粉塵/血霧/水霧/火球(自訂著色器,一個 draw call)
//   Decals  彈孔/焦痕/牆上血跡(乘法混色,貼合法線,上限 120 個,舊的淡出)
//   Casings 拋殼(黃銅彈殼、紅色霰彈殼;物理彈跳、落地聲)
//   Tracers 曳光(加法混色細長方塊)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1), _nz = new THREE.Vector3(0, 0, -1), _t = new THREE.Vector3(), _e = new THREE.Euler();
const rand = (a, b) => a + Math.random() * (b - a);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
let rs = 1234;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

const copy3 = (A, i, j) => { A[i] = A[j]; A[i + 1] = A[j + 1]; A[i + 2] = A[j + 2]; };

// 地面高度查詢(多樓層 World 的 groundY,沒有時用 fallback)
function floorAt(world, x, y, z, fb) {
  const g = world && world.groundY ? world.groundY(x, z, y) : null;
  return g === null || g === undefined || !(g <= y + 0.3) ? fb : g;
}

// ======================= 碎屑(受光照) =======================
class Debris {
  constructor(scene, world, cap = 420) {
    this.world = world;
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    const F = (n) => new Float32Array(cap * n);
    this.P = F(3); this.V = F(3); this.S = F(3); this.R = F(3); this.W = F(3); this.C = F(3);
    this.life = F(1); this.max = F(1); this.floor = F(1); this.bounce = F(1); this.drag = F(1); this.grav = F(1); this.rest = new Uint8Array(cap);
    this.n = 0;
  }

  // 尺寸 (sx, sy, sz) 公尺;color 0xRRGGBB;opt:{bounce, drag, grav, spin}
  spawn(x, y, z, vx, vy, vz, sx, sy, sz, color, life, floorY, bounce = 0.3, drag = 0.4, grav = 9.8, spin = 12) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
    const i3 = i * 3;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.V[i3] = vx; this.V[i3 + 1] = vy; this.V[i3 + 2] = vz;
    this.S[i3] = sx; this.S[i3 + 1] = sy; this.S[i3 + 2] = sz;
    this.R[i3] = rnd() * 6.28; this.R[i3 + 1] = rnd() * 6.28; this.R[i3 + 2] = rnd() * 6.28;
    this.W[i3] = (rnd() - 0.5) * spin; this.W[i3 + 1] = (rnd() - 0.5) * spin; this.W[i3 + 2] = (rnd() - 0.5) * spin;
    _c.setHex(color);
    this.C[i3] = _c.r; this.C[i3 + 1] = _c.g; this.C[i3 + 2] = _c.b;
    this.life[i] = life; this.max[i] = life; this.floor[i] = floorY; this.bounce[i] = bounce; this.drag[i] = drag; this.grav[i] = grav; this.rest[i] = 0;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    copy3(this.P, i3, j3); copy3(this.V, i3, j3); copy3(this.S, i3, j3); copy3(this.R, i3, j3); copy3(this.W, i3, j3); copy3(this.C, i3, j3);
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.floor[i] = this.floor[j]; this.bounce[i] = this.bounce[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j]; this.rest[i] = this.rest[j];
  }

  update(dt) {
    const { P, V, S, R, W, C } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      if (this.rest[i]) continue;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 2] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      R[i3] += W[i3] * dt; R[i3 + 1] += W[i3 + 1] * dt; R[i3 + 2] += W[i3 + 2] * dt;
      const fl = this.floor[i] + S[i3 + 1] * 0.5;
      if (P[i3 + 1] < fl) {
        P[i3 + 1] = fl;
        if (V[i3 + 1] < -0.6 && this.bounce[i] > 0) {
          V[i3 + 1] *= -this.bounce[i]; V[i3] *= 0.6; V[i3 + 2] *= 0.6;
          W[i3] *= 0.5; W[i3 + 2] *= 0.5;
        } else { this.rest[i] = 1; R[i3] = 0; R[i3 + 2] = (R[i3 + 2] > 0 ? 1 : -1) * 0.05; }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const k = Math.min(1, this.life[i] / Math.min(0.6, this.max[i] * 0.4)); // 最後一段縮小消失
      _q.setFromEuler(_e.set(R[i3], R[i3 + 1], R[i3 + 2]));
      _s.set(S[i3] * k, S[i3 + 1] * k, S[i3 + 2] * k);
      _p.set(P[i3], P[i3 + 1], P[i3 + 2]);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(i, _c.setRGB(C[i3], C[i3 + 1], C[i3 + 2]));
    }
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

// ======================= 火花(加法混色,沿速度拉長) =======================
class Glow {
  constructor(scene, world, cap = 260) {
    this.world = world;
    this.cap = cap;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const F = (n) => new Float32Array(cap * n);
    this.P = F(3); this.V = F(3); this.C = F(3);
    this.life = F(1); this.max = F(1); this.floor = F(1); this.size = F(1); this.grav = F(1); this.drag = F(1);
    this.n = 0;
  }

  // color 為 HDR 線性 RGB(可 > 1,會產生泛光)
  spawn(x, y, z, vx, vy, vz, r, g, b, life, size, floorY, grav = 9.8, drag = 0.6) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
    const i3 = i * 3;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.V[i3] = vx; this.V[i3 + 1] = vy; this.V[i3 + 2] = vz;
    this.C[i3] = r; this.C[i3 + 1] = g; this.C[i3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.floor[i] = floorY; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    copy3(this.P, i3, j3); copy3(this.V, i3, j3); copy3(this.C, i3, j3);
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.floor[i] = this.floor[j]; this.size[i] = this.size[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
  }

  update(dt) {
    const { P, V, C } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 2] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (P[i3 + 1] < this.floor[i]) { P[i3 + 1] = this.floor[i]; V[i3 + 1] *= -0.35; V[i3] *= 0.5; V[i3 + 2] *= 0.5; }
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const sp = Math.hypot(V[i3], V[i3 + 1], V[i3 + 2]);
      const k = this.life[i] / this.max[i];
      _t.set(V[i3], V[i3 + 1], V[i3 + 2]);
      if (sp > 1e-3) _q.setFromUnitVectors(_z, _t.multiplyScalar(1 / sp)); else _q.identity();
      const s = this.size[i];
      _s.set(s, s, s + sp * 0.018);
      _p.set(P[i3], P[i3 + 1], P[i3 + 2]);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      const f = k * k * (2 - k);
      this.mesh.setColorAt(i, _c.setRGB(C[i3] * f, C[i3 + 1] * f, C[i3 + 2] * f));
    }
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

// ======================= 煙/粉塵/霧(面向鏡頭的實例化著色器) =======================
function puffAtlas() {
  // 2×2 張柔和雲狀圖(灰階,alpha 在 A)
  const S = 128, [c, x] = canvas(S * 2, S * 2);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = Math.floor(v / 2) * S;
    const img = x.createImageData(S, S), d = img.data;
    const blobs = [];
    for (let b = 0; b < 9; b++) blobs.push([S / 2 + (rnd() - 0.5) * S * 0.4, S / 2 + (rnd() - 0.5) * S * 0.4, S * (0.14 + rnd() * 0.16)]);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      let a = 0;
      for (const [bx, by, br] of blobs) { const dd = Math.hypot(px - bx, py - by) / br; a += Math.max(0, 1 - dd * dd); }
      const r = Math.hypot(px - S / 2, py - S / 2) / (S / 2);
      a = Math.min(1, a * 0.55) * Math.max(0, 1 - r * r) * (0.75 + rnd() * 0.25);
      const i = (py * S + px) * 4;
      const l = 200 + rnd() * 55;
      d[i] = l; d[i + 1] = l; d[i + 2] = l; d[i + 3] = a * 255;
    }
    x.putImageData(img, ox, oy);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

const PUFF_VS = `
attribute vec3 aPos; attribute vec4 aCol; attribute vec3 aMisc; // misc: size, rot, variant
varying vec2 vUv; varying vec4 vCol; varying float vFog;
uniform float fogDensity;
void main(){
  float s = aMisc.x, r = aMisc.y, v = aMisc.z;
  vec2 c = vec2(mod(v, 2.0), floor(v / 2.0));
  vUv = (uv + c) * 0.5;
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float cs = cos(r), sn = sin(r);
  vec2 p = position.xy * s;
  mv.xy += vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
}`;
const PUFF_FS = `
uniform sampler2D map; uniform vec3 fogColor; uniform float additive;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.004) discard;
  vec3 col = vCol.rgb * (0.75 + 0.25 * t.r);
  if (additive > 0.5) { gl_FragColor = vec4(col * a * (1.0 - vFog), 1.0); }
  else { gl_FragColor = vec4(mix(col, fogColor, vFog), a); }
}`;

class Puffs {
  constructor(scene, additive, cap = 260) {
    this.cap = cap;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, additive: { value: additive ? 1 : 0 } }]),
      vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.uniforms.map.value = Puffs.tex || (Puffs.tex = puffAtlas());
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    scene.add(this.mesh);
    const F = (n) => new Float32Array(cap * n);
    this.P = F(3); this.V = F(3); this.C = F(3);
    this.life = F(1); this.max = F(1); this.s0 = F(1); this.s1 = F(1); this.a0 = F(1); this.rot = F(1); this.spin = F(1); this.var = F(1); this.rise = F(1); this.drag = F(1); this.fadeIn = F(1);
    this.scal = [this.life, this.max, this.s0, this.s1, this.a0, this.rot, this.spin, this.var, this.rise, this.drag, this.fadeIn];
    this.n = 0;
  }

  // 尺寸從 s0 長到 s1;alpha 峰值 a;rise 為向上浮力(負值往下沉)
  spawn(x, y, z, vx, vy, vz, s0, s1, r, g, b, a, life, rise = 0.3, drag = 1.5, fadeIn = 0.08) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
    const i3 = i * 3;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.V[i3] = vx; this.V[i3 + 1] = vy; this.V[i3 + 2] = vz;
    this.C[i3] = r; this.C[i3 + 1] = g; this.C[i3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.rot[i] = rnd() * 6.28; this.spin[i] = (rnd() - 0.5) * 1.2; this.var[i] = (rnd() * 4) | 0; this.rise[i] = rise; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    copy3(this.P, i3, j3); copy3(this.V, i3, j3); copy3(this.C, i3, j3);
    const L = this.scal;
    for (let k = 0; k < L.length; k++) L[k][i] = L[k][j];
  }

  update(dt) {
    const { P, V, C } = this, ap = this.aPos.array, ac = this.aCol.array, am = this.aMisc.array;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 2] *= dr; V[i3 + 1] = V[i3 + 1] * dr + this.rise[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3, i4 = i * 4;
      const u = 1 - this.life[i] / this.max[i];
      const a = this.a0[i] * Math.min(1, u / this.fadeIn[i]) * (1 - u) * (1 - u * 0.4);
      ap[i3] = P[i3]; ap[i3 + 1] = P[i3 + 1]; ap[i3 + 2] = P[i3 + 2];
      ac[i4] = C[i3]; ac[i4 + 1] = C[i3 + 1]; ac[i4 + 2] = C[i3 + 2]; ac[i4 + 3] = a;
      am[i3] = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - u) * (1 - u)); am[i3 + 1] = this.rot[i]; am[i3 + 2] = this.var[i];
    }
    this.geo.instanceCount = this.n;
    if (this.n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; }
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }
}

// ======================= 貼花(乘法混色) =======================
// 圖集 4×2:0 混凝土彈孔、1 磁磚彈孔、2 木頭彈孔、3 金屬凹痕、4 玻璃裂痕、5 泥土/柏油、6 爆炸焦痕、7 血跡
export const DECAL = { concrete: 0, tile: 1, wood: 2, metal: 3, glass: 4, dirt: 5, scorch: 6, blood: 7 };
function decalAtlas() {
  const S = 256, [c, x] = canvas(S * 4, S * 2);
  x.clearRect(0, 0, S * 4, S * 2);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); x.beginPath(); x.rect(-S / 2, -S / 2, S, S); x.clip(); fn(); x.restore(); };
  const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  const radial = (r0, r1, stops) => { const g = x.createRadialGradient(0, 0, r0, 0, 0, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
  const chips = (n, rMin, rMax, col, sz) => { for (let k = 0; k < n; k++) { const a = rnd() * 6.28, r = rMin + rnd() * (rMax - rMin); x.fillStyle = col(); x.beginPath(); x.ellipse(Math.cos(a) * r, Math.sin(a) * r, sz * (0.5 + rnd()), sz * (0.3 + rnd() * 0.6), a, 0, 6.28); x.fill(); } };
  const cracks = (n, len, w, col) => { x.strokeStyle = col; for (let k = 0; k < n; k++) { let a = rnd() * 6.28, px = 0, py = 0; x.lineWidth = w; x.beginPath(); x.moveTo(0, 0); const segs = 4 + (rnd() * 4) | 0; for (let s = 0; s < segs; s++) { a += (rnd() - 0.5) * 0.9; const l = len * (0.4 + rnd() * 0.6) / segs; px += Math.cos(a) * l; py += Math.sin(a) * l; x.lineTo(px, py); } x.stroke(); } };
  // 0 混凝土:深色中心 + 崩落碎口 + 粉塵暈
  cell(0, () => {
    x.fillStyle = radial(0, 110, [[0, rgba(150, 150, 150, 0.35)], [1, rgba(150, 150, 150, 0)]]); x.fillRect(-128, -128, 256, 256);
    chips(26, 14, 46, () => { const v = 80 + rnd() * 50; return rgba(v, v * 0.98, v * 0.94, 0.85); }, 9);
    x.fillStyle = radial(0, 30, [[0, rgba(5, 5, 5, 1)], [0.55, rgba(20, 20, 18, 1)], [1, rgba(60, 58, 55, 0.0)]]); x.beginPath(); x.arc(0, 0, 30, 0, 6.28); x.fill();
    cracks(5, 70, 1.6, rgba(60, 60, 58, 0.6));
  });
  // 1 磁磚:放射裂紋 + 碎裂中心
  cell(1, () => {
    cracks(9, 120, 2, rgba(40, 40, 40, 0.75));
    cracks(7, 60, 1.2, rgba(70, 70, 70, 0.6));
    chips(14, 6, 26, () => rgba(70, 70, 70, 0.8), 7);
    x.fillStyle = radial(0, 22, [[0, rgba(8, 8, 8, 1)], [0.7, rgba(30, 30, 30, 0.95)], [1, rgba(80, 80, 80, 0)]]); x.beginPath(); x.arc(0, 0, 22, 0, 6.28); x.fill();
  });
  // 2 木頭:撕裂木纖維
  cell(2, () => {
    for (let k = 0; k < 22; k++) { x.strokeStyle = rgba(60 + rnd() * 30, 40 + rnd() * 20, 25, 0.75); x.lineWidth = 2 + rnd() * 4; const y = (rnd() - 0.5) * 40; x.beginPath(); x.moveTo(-20 - rnd() * 50, y); x.lineTo(20 + rnd() * 50, y + (rnd() - 0.5) * 8); x.stroke(); }
    x.fillStyle = radial(0, 26, [[0, rgba(10, 6, 4, 1)], [0.6, rgba(35, 22, 12, 1)], [1, rgba(70, 45, 25, 0)]]); x.beginPath(); x.ellipse(0, 0, 26, 18, 0, 0, 6.28); x.fill();
  });
  // 3 金屬:凹痕 + 刮擦
  cell(3, () => {
    x.fillStyle = radial(0, 40, [[0, rgba(30, 30, 32, 1)], [0.45, rgba(70, 70, 75, 0.9)], [0.8, rgba(120, 120, 125, 0.5)], [1, rgba(160, 160, 160, 0)]]); x.beginPath(); x.arc(0, 0, 40, 0, 6.28); x.fill();
    x.fillStyle = rgba(10, 10, 10, 1); x.beginPath(); x.arc(0, 0, 10, 0, 6.28); x.fill();
    cracks(6, 50, 1, rgba(90, 90, 95, 0.5));
  });
  // 4 玻璃:蜘蛛網裂紋
  cell(4, () => {
    cracks(14, 128, 1.4, rgba(90, 100, 105, 0.8));
    x.strokeStyle = rgba(100, 110, 115, 0.6); x.lineWidth = 1;
    for (const r of [20, 38, 60]) { x.beginPath(); for (let k = 0; k <= 14; k++) { const a = (k / 14) * 6.28; const rr = r * (0.8 + rnd() * 0.4); k ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.stroke(); }
    x.fillStyle = rgba(30, 35, 38, 0.95); x.beginPath(); x.arc(0, 0, 8, 0, 6.28); x.fill();
  });
  // 5 泥土/柏油:深色濺開
  cell(5, () => {
    chips(30, 8, 50, () => rgba(40 + rnd() * 20, 34 + rnd() * 15, 28, 0.7), 10);
    x.fillStyle = radial(0, 28, [[0, rgba(10, 8, 6, 1)], [1, rgba(40, 32, 25, 0)]]); x.beginPath(); x.arc(0, 0, 28, 0, 6.28); x.fill();
  });
  // 6 焦痕:放射狀燻黑
  cell(6, () => {
    x.fillStyle = radial(0, 124, [[0, rgba(8, 7, 6, 1)], [0.35, rgba(20, 18, 16, 0.95)], [0.7, rgba(45, 40, 36, 0.6)], [1, rgba(70, 65, 60, 0)]]); x.fillRect(-128, -128, 256, 256);
    for (let k = 0; k < 60; k++) { const a = rnd() * 6.28, r0 = 30 + rnd() * 40, r1 = r0 + 30 + rnd() * 60; x.strokeStyle = rgba(15, 13, 12, 0.35 + rnd() * 0.3); x.lineWidth = 2 + rnd() * 6; x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke(); }
    chips(40, 20, 110, () => rgba(10, 9, 8, 0.6), 5);
  });
  // 7 血跡:寫實噴濺(src/art/stainset.js:方向性噴射、衛星滴與尾巴、霧點;新鮮血色)
  x.putImageData(new ImageData(fxSpatterRGBA(7, S), S, S), 3 * S, S);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

const DECAL_VS = `
attribute float aCell; attribute float aFade;
varying vec2 vUv; varying float vA; varying float vFog;
uniform float fogDensity;
void main(){
  vec2 c = vec2(mod(aCell, 4.0), floor(aCell / 4.0));
  vUv = vec2((uv.x + c.x) * 0.25, 1.0 - (1.0 - uv.y + c.y) * 0.5);
  vA = aFade;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
}`;
const DECAL_FS = `
uniform sampler2D map;
varying vec2 vUv; varying float vA; varying float vFog;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA * (1.0 - vFog);
  gl_FragColor = vec4(mix(vec3(1.0), t.rgb, a), 1.0);
}`;

class Decals {
  constructor(scene, cap = 120) {
    this.cap = cap;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aFade = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.aCell);
    geo.setAttribute('aFade', this.aFade);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: DECAL_VS, fragmentShader: DECAL_FS, fog: true,
      transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    mat.uniforms.map.value = decalAtlas();
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.next = 0;
    this.used = 0;
  }

  // n:表面法線(單位向量);size 公尺;cell:DECAL.*;life 秒
  add(p, n, size, cell, life = 60) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.used = Math.min(this.cap, this.used + 1);
    _q.setFromUnitVectors(_z, n);
    _q2.setFromAxisAngle(_z, rnd() * 6.28);
    _q.multiply(_q2);
    _p.copy(p).addScaledVector(n, 0.004 + (i % 7) * 0.0004);
    _s.set(size, size, 1);
    this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.aCell.array[i] = cell;
    this.aFade.array[i] = 1;
    this.life[i] = life; this.max[i] = life;
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aCell.needsUpdate = true;
    this.aFade.needsUpdate = true;
    // 池子快滿時,讓最舊的幾個加速淡出
    if (this.used >= this.cap - 10) for (let k = 0; k < 6; k++) { const j = (this.next + k) % this.cap; this.life[j] = Math.min(this.life[j], 1.5 + k * 0.4); }
  }

  update(dt) {
    let dirty = false;
    const f = this.aFade.array;
    for (let i = 0; i < this.used; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const v = this.life[i] <= 0 ? 0 : Math.min(1, this.life[i] / 2.5);
      if (v !== f[i]) { f[i] = v; dirty = true; }
    }
    if (dirty) this.aFade.needsUpdate = true;
  }

  clear() { this.used = 0; this.next = 0; this.mesh.count = 0; }
}

// ======================= 拋殼 =======================
const CASE_KINDS = ['pistol', 'rifle', 'shell'];
class Casings {
  constructor(scene, world, cap = 64) {
    this.world = world;
    this.cap = cap;
    // 不受場景燈光影響(手電筒近距離會過曝):和手持武器一樣用環境反射上色,落地後逐漸變暗融入場景
    const mk = (refl) => new THREE.MeshBasicMaterial({ color: 0xffffff, envMap: ENV_MAP, reflectivity: refl, combine: THREE.MultiplyOperation });
    const brass = mk(0.45), plastic = mk(0.12);
    const [hull, base] = shellGeos();
    this.meshes = {
      pistol: [new THREE.InstancedMesh(casingGeo('pistol'), brass, cap)],
      rifle: [new THREE.InstancedMesh(casingGeo('rifle'), brass, cap)],
      shell: [new THREE.InstancedMesh(hull, plastic, cap), new THREE.InstancedMesh(base, brass, cap)],
    };
    this.cols = { pistol: [new THREE.Color(0xb08a45)], rifle: [new THREE.Color(0xb08a45)], shell: [new THREE.Color(0x7a1a12), new THREE.Color(0xb08a45)] };
    for (const k of CASE_KINDS) for (const m of this.meshes[k]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, _c.set(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.list = { pistol: [], rifle: [], shell: [] };
    this.pool = [];
    this.onLand = null; // (pos, surface, kind) => void
  }

  // pos/vel 世界座標;size [直徑, 長度];spin 弧度/秒
  spawn(kind, pos, vel, size, scale0 = 1) {
    const L = this.list[kind];
    let c;
    if (L.length >= this.cap) c = L.shift();
    else c = this.pool.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), size: [0, 0], t: 0, rest: false, bounces: 0, floor: 0, s0: 1 };
    c.p.copy(pos); c.v.copy(vel);
    c.q.setFromEuler(_e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28));
    c.w.set(rand(-25, 25), rand(-25, 25), rand(-25, 25));
    c.size[0] = size[0]; c.size[1] = size[1];
    c.t = 0; c.rest = false; c.bounces = 0; c.s0 = scale0;
    c.floor = floorAt(this.world, pos.x, pos.y, pos.z, pos.y - 1.6);
    L.push(c);
  }

  update(dt) {
    for (const kind of CASE_KINDS) {
      const L = this.list[kind], M = this.meshes[kind];
      for (let i = L.length - 1; i >= 0; i--) {
        const c = L[i];
        c.t += dt;
        if (c.t > 12) { L[i] = L[L.length - 1]; L.pop(); this.pool.push(c); continue; }
        if (c.rest) continue;
        c.v.y -= 9.8 * dt;
        c.v.multiplyScalar(Math.exp(-0.25 * dt));
        // 牆:沿速度方向探測
        const sp = c.v.length();
        if (sp > 0.5 && this.world) {
          const step = sp * dt + 0.01;
          const d = this.world.rayDistance(c.p.x, c.p.y, c.p.z, c.v.x / sp, c.v.y / sp, c.v.z / sp, step);
          if (d < step) { c.v.x *= -0.35; c.v.z *= -0.35; }
        }
        c.p.addScaledVector(c.v, dt);
        _q2.setFromEuler(_e.set(c.w.x * dt, c.w.y * dt, c.w.z * dt));
        c.q.multiply(_q2);
        const r = c.size[0] * 0.5;
        if (c.p.y < c.floor + r) {
          c.p.y = c.floor + r;
          if (c.v.y < -0.8 && c.bounces < 4) {
            if (this.onLand && (c.bounces === 0 || c.v.y < -1.4)) this.onLand(c.p, kind, c.bounces);
            c.bounces++;
            c.v.y *= -0.38; c.v.x *= 0.55; c.v.z *= 0.55;
            c.w.multiplyScalar(0.6);
          } else {
            c.rest = true;
            c.restT = c.t;
            c.q.setFromEuler(_e.set(0, rnd() * 6.28, rnd() * 6.28)); // 躺平:長軸水平、隨機方位
          }
        }
      }
      for (let i = 0; i < L.length; i++) {
        const c = L[i];
        const s = c.s0 + (1 - c.s0) * Math.min(1, c.t / 0.25);
        _p.set(c.p.x, c.p.y - (c.t > 11 ? (c.t - 11) * 0.02 : 0), c.p.z);
        if (kind === 'shell') _s.set(s, s, s);
        else { const w = (c.size[0] * s) / (kind === 'rifle' ? 0.24 : 0.52); _s.set(w, w, c.size[1] * s); }
        _m.compose(_p, c.q, _s);
        const lum = c.rest ? Math.max(0.28, 0.75 - (c.t - c.restT) * 0.3) : Math.max(0.55, 1 - c.t * 0.6);
        const C = this.cols[kind];
        for (let j = 0; j < M.length; j++) { M[j].setMatrixAt(i, _m); M[j].setColorAt(i, _c.copy(C[j]).multiplyScalar(lum)); }
      }
      for (const m of M) { m.count = L.length; if (L.length) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
    }
  }

  clear() { for (const k of CASE_KINDS) { this.pool.push(...this.list[k]); this.list[k].length = 0; for (const m of this.meshes[k]) m.count = 0; } }
}

// ======================= 曳光 =======================
class Tracers {
  constructor(scene, cap = 48) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: true }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = Array.from({ length: cap }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, life: 0, w: 0, col: [1, 1, 1], speed: 0 }));
    this.n = 0;
  }

  // 子彈拖影:從 a 飛向 b(速度 speed m/s,拖影長 len)
  add(a, b, w, life, r, g, bl, speed = 0) {
    if (this.n >= this.cap) return;
    const it = this.items[this.n++];
    it.a.copy(a); it.b.copy(b); it.t = 0; it.life = life; it.w = w; it.col[0] = r; it.col[1] = g; it.col[2] = bl; it.speed = speed;
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) { const j = --this.n; const tmp = this.items[i]; this.items[i] = this.items[j]; this.items[j] = tmp; }
    }
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      const k = 1 - it.t / it.life;
      _t.subVectors(it.b, it.a);
      const L = _t.length();
      if (L < 1e-4) { this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      _t.multiplyScalar(1 / L);
      let s0 = 0, s1 = L;
      if (it.speed > 0) { const head = Math.min(L, it.t * it.speed + L * 0.25); s1 = head; s0 = Math.max(0, head - Math.max(2, L * 0.35)); }
      _q.setFromUnitVectors(_nz, _t);
      _p.copy(it.a).addScaledVector(_t, s0);
      _s.set(it.w, it.w, Math.max(0.01, s1 - s0));
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      this.mesh.setColorAt(i, _c.setRGB(it.col[0] * k, it.col[1] * k, it.col[2] * k));
    }
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }

  clear() { this.n = 0; this.mesh.count = 0; }
}

// ======================= 總管 =======================
export class WeaponFX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.debris = new Debris(scene, world);
    this.glow = new Glow(scene, world);
    this.smoke = new Puffs(scene, false, 300);
    this.fire = new Puffs(scene, true, 140);
    this.decals = new Decals(scene, 120);
    this.casings = new Casings(scene, world);
    this.tracers = new Tracers(scene);
  }

  floor(x, y, z) { return floorAt(this.world, x, y, z, y - 1.7); }

  update(dt) {
    this.debris.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.fire.update(dt);
    this.decals.update(dt);
    this.casings.update(dt);
    this.tracers.update(dt);
  }

  clear() {
    this.debris.clear(); this.glow.clear(); this.smoke.clear(); this.fire.clear(); this.decals.clear(); this.casings.clear(); this.tracers.clear();
  }

  // ---------- 命中效果(依材質) ----------
  // p 命中點、n 表面法線、d 子彈方向、mat 材質、power 0..1(大口徑更誇張)。熱路徑:不建立閉包/物件
  impact(p, n, d, mat, power = 0.4) {
    const I = this._I || (this._I = { p: new THREE.Vector3(), n: new THREE.Vector3(), rx: 0, ry: 0, rz: 0, k: 1, fl: 0 });
    I.p.copy(p); I.n.copy(n);
    I.fl = this.floor(p.x, p.y, p.z);
    I.k = 0.6 + power;
    const dn = d.x * n.x + d.y * n.y + d.z * n.z; // 反射方向(碎屑往外噴)
    I.rx = d.x - 2 * dn * n.x; I.ry = d.y - 2 * dn * n.y; I.rz = d.z - 2 * dn * n.z;
    const k = I.k, fl = I.fl;
    switch (mat) {
      case 'flesh': // 血霧 + 血滴
        for (let i = 0; i < 3 + power * 4; i++) this.smoke.spawn(p.x, p.y, p.z, (rnd() - 0.5) * 0.8 + d.x * 0.5, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.8 + d.z * 0.5, 0.05, 0.3 * k, 0.15, 0.012, 0.01, 0.5, 0.5 * rand(0.7, 1.3), -0.3, 3, 0.04);
        for (let i = 0; i < 6 + power * 8; i++) { const s = rand(0.005, 0.01); this._sprayV(2.6, 1.6); this.debris.spawn(p.x, p.y, p.z, _t.x, _t.y, _t.z, s, s, s * 1.5, 0x320404, rand(0.5, 1.4), fl, 0, 0.3, 9.8, 4); }
        return;
      case 'water':
        for (let i = 0; i < 10 * k; i++) this.debris.spawn(p.x, p.y + 0.02, p.z, (rnd() - 0.5) * 1.2, rand(1.5, 3.6) * k, (rnd() - 0.5) * 1.2, 0.012, 0.02, 0.012, 0x9fb4b8, rand(0.4, 0.9), fl - 0.05, 0, 0.2);
        this._dust(4, 0.55, 0.62, 0.64, 0.4, 0.45, 0.9);
        return;
      case 'metal':
        this._sparks(10 + power * 14, 6);
        this._dust(2, 0.3, 0.3, 0.32, 0.35, 0.25, 0.8);
        this._decal(DECAL.metal, 0.07, power);
        return;
      case 'wood':
        this._chunk(6 + power * 6, 0x6a4a2c, 0.012, 3.2, 3, 26);
        this._dust(3, 0.42, 0.33, 0.24, 0.45, 0.35);
        this._decal(DECAL.wood, 0.075, power);
        return;
      case 'tile':
        this._chunk(6 + power * 6, 0xd8d8d0, 0.011, 3.6, 2.4, 24);
        this._chunk(3, 0x8a8a84, 0.007, 3, 2);
        this._dust(3, 0.62, 0.62, 0.6, 0.45, 0.35);
        this._sparks(2, 4);
        this._decal(DECAL.tile, 0.11, power);
        return;
      case 'glass':
        for (let i = 0; i < 10 + power * 10; i++) this.debris.spawn(p.x, p.y, p.z, (rnd() - 0.5) * 2 + d.x * 2, rand(-0.5, 1.5), (rnd() - 0.5) * 2 + d.z * 2, rand(0.008, 0.02), 0.002, rand(0.008, 0.025), 0xb8d4dc, rand(1.5, 3), fl, 0.2, 0.3, 9.8, 20);
        this._decal(DECAL.glass, 0.18, power);
        return;
      case 'grass':
      case 'gravel':
      case 'asphalt':
      case 'dirt':
        this._chunk(5 + power * 5, mat === 'grass' ? 0x3a3a22 : 0x2e2c2a, 0.012, 2.6, 2.4);
        this._dust(4, 0.36, 0.32, 0.27, 0.5, 0.5);
        this._decal(DECAL.dirt, 0.1, power);
        return;
      case 'carpet':
      case 'fabric':
        this._dust(4, 0.4, 0.38, 0.36, 0.4, 0.3, 1.2);
        this._decal(DECAL.dirt, 0.06, power);
        return;
      case 'brick':
        this._chunk(7 + power * 6, 0x6e3424, 0.013, 3.4);
        this._dust(4, 0.5, 0.36, 0.3, 0.5, 0.45);
        this._decal(DECAL.concrete, 0.1, power);
        return;
      default: // concrete / plaster / paint
        this._chunk(6 + power * 7, 0x8c8a84, 0.012, 3.4);
        this._dust(4, 0.58, 0.57, 0.54, 0.55, 0.45);
        this._sparks(power > 0.6 ? 4 : 1, 4);
        this._decal(DECAL.concrete, 0.09, power);
    }
  }

  // 沿法線/反射方向的隨機噴射速度 → _t
  _sprayV(speed, cone) {
    const I = this._I, n = I.n;
    const s = speed * rand(0.4, 1.2);
    return _t.set((n.x * 0.7 + I.rx * 0.3 + (rnd() - 0.5) * cone) * s, (n.y * 0.7 + I.ry * 0.3 + (rnd() - 0.5) * cone + 0.25) * s, (n.z * 0.7 + I.rz * 0.3 + (rnd() - 0.5) * cone) * s);
  }
  _dust(cnt, r, g, b, a, s1, life = 1.6) {
    const I = this._I, p = I.p, n = I.n, k = I.k;
    for (let i = 0; i < cnt; i++) this.smoke.spawn(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, (n.x + (rnd() - 0.5) * 0.8) * 1.4 * k, (n.y + (rnd() - 0.5) * 0.8) * 1.4 * k + 0.2, (n.z + (rnd() - 0.5) * 0.8) * 1.4 * k, 0.05, s1 * k * rand(0.7, 1.3), r, g, b, a, life * rand(0.7, 1.2), 0.15, 2.6, 0.05);
  }
  _chunk(cnt, color, sz, speed, life = 2.2, spin = 18) {
    const I = this._I, p = I.p, n = I.n;
    for (let i = 0; i < cnt; i++) {
      this._sprayV(speed * I.k, 1.2);
      const s = sz * rand(0.5, 1.4);
      this.debris.spawn(p.x + n.x * 0.02, p.y + n.y * 0.02, p.z + n.z * 0.02, _t.x, _t.y, _t.z, s, s * rand(0.4, 0.9), s * rand(0.6, 1.2), color, life * rand(0.6, 1.3), I.fl, 0.3, 0.5, 9.8, spin);
    }
  }
  _sparks(cnt, speed) {
    const I = this._I, p = I.p, n = I.n;
    for (let i = 0; i < cnt; i++) {
      this._sprayV(speed * I.k, 1.6);
      this.glow.spawn(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01, _t.x, _t.y, _t.z, 5, 2.6, 0.9, rand(0.15, 0.45), rand(0.006, 0.012), I.fl, 9.8, 0.8);
    }
  }
  _decal(cell, size, power) { this.decals.add(this._I.p, this._I.n, size * rand(0.85, 1.15) * (0.75 + power * 0.6), cell, 50); }

  // 槍口煙(世界座標,開火後的輕煙)
  muzzleSmoke(p, d, amount = 1) {
    for (let i = 0; i < 2 * amount; i++) this.smoke.spawn(p.x, p.y, p.z, d.x * 1.2 + (rnd() - 0.5) * 0.3, d.y * 1.2 + 0.15, d.z * 1.2 + (rnd() - 0.5) * 0.3, 0.04, 0.35 * amount, 0.5, 0.5, 0.5, 0.12 * Math.min(1.5, amount), 1.4 * rand(0.8, 1.3), 0.12, 2.2, 0.02);
  }
}
