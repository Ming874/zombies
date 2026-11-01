import * as THREE from 'three';

// 寒氣粒子:呼出的白氣(寒氣事件時,每 3 秒左右一口)與子彈穿過鬼魂時的冷霧。
// 一個 THREE.Points(一次 draw call),每個點有自己的大小/透明度;沒有粒子時整個隱藏。
const N = 40;
const _f = new THREE.Vector3();
const VS = `
attribute float aSize; attribute float aAlpha; uniform float uScale;
varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.05, -mv.z); vA = aAlpha; gl_Position = projectionMatrix * mv; }`;
const FS = `
varying float vA;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard;
  float n = 0.75 + 0.25 * h(floor(gl_PointCoord * 9.0));
  gl_FragColor = vec4(vec3(0.86, 0.9, 0.96), vA * smoothstep(0.5, 0.05, r) * n); }`;
export class ColdFx {
  constructor(scene) {
    this.pos = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.p = Array.from({ length: N }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.1, s1: 0.5, a0: 0.3 }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ name: 'ghost-cold', uniforms: { uScale: { value: 500 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false; this.pts.visible = false; this.pts.renderOrder = 7; this.pts.raycast = () => {};
    this.pts.name = 'ghost-cold';
    scene.add(this.pts);
    this.next = 0; this.live = 0;
    this.breathT = 0;
  }
  _emit(x, y, z, vx, vy, vz, life, s0, s1, a0) {
    const q = this.p[this.next]; this.next = (this.next + 1) % N;
    Object.assign(q, { on: true, x, y, z, vx, vy, vz, t: 0, life, s0, s1, a0 });
  }
  // 子彈穿過:冷霧往外散(dir = 子彈方向)
  mist(x, y, z, dir) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.28, sp = 0.25 + Math.random() * 0.5;
      this._emit(x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.2,
        Math.cos(a) * sp + (dir?.x || 0) * 0.5, 0.1 + Math.random() * 0.25, Math.sin(a) * sp + (dir?.z || 0) * 0.5, 1.1 + Math.random() * 0.8, 0.12, 0.6 + Math.random() * 0.4, 0.32);
    }
  }
  // 呼出一口白氣(相機前方、下方一點)
  exhale(cam, k = 1) {
    const f = _f; cam.getWorldDirection(f);
    const p = cam.position;
    for (let i = 0; i < 4; i++) {
      const sp = 0.4 + Math.random() * 0.25;
      this._emit(p.x + f.x * 0.3 + (Math.random() - 0.5) * 0.04, p.y - 0.1 + f.y * 0.3, p.z + f.z * 0.3 + (Math.random() - 0.5) * 0.04,
        f.x * sp + (Math.random() - 0.5) * 0.08, 0.06 + Math.random() * 0.06, f.z * sp + (Math.random() - 0.5) * 0.08, 1.4 + Math.random() * 0.6, 0.06, 0.5 + Math.random() * 0.2, 0.42 * k);
    }
  }
  update(dt, game, cold) {
    // 寒氣夠冷時自動呼氣(呼吸節奏約 3 秒)
    if (cold > 0.25) { this.breathT -= dt; if (this.breathT <= 0) { this.breathT = 2.6 + Math.random() * 1.1; this.exhale(game.camera, Math.min(1, cold * 1.2)); } }
    let live = 0;
    for (let i = 0; i < N; i++) {
      const q = this.p[i];
      if (!q.on) { this.alpha[i] = 0; continue; }
      q.t += dt;
      if (q.t >= q.life) { q.on = false; this.alpha[i] = 0; continue; }
      live++;
      const u = q.t / q.life;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.vx *= 1 - dt * 1.4; q.vz *= 1 - dt * 1.4; q.vy += dt * 0.03;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.size[i] = q.s0 + (q.s1 - q.s0) * Math.sqrt(u);
      this.alpha[i] = q.a0 * Math.min(1, u * 6) * (1 - u) * (1 - u);
    }
    this.live = live;
    this.pts.visible = live > 0;
    if (!live) return;
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
    const r = game.renderer, cam = game.camera;
    this.mat.uniforms.uScale.value = (r.domElement.height) / (2 * Math.tan((cam.fov * Math.PI) / 360));
  }
  clear() { for (const q of this.p) q.on = false; this.pts.visible = false; }
}
