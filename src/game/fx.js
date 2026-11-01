import * as THREE from 'three';
import { stainMaterial, stainPlane } from '../art/stainmat.js';

// 粒子(血、火花、灰塵、膽汁)、曳光、地上的血池。以 mixin 方式掛到 Game 上
let poolGeo = null; // 血泊:共用的寫實血跡材質(src/art/stainmat.js,新鮮血泊格;亮面、液面邊緣的法線)
const _gn = { x: 0, y: 1, z: 0 }, _yUp = new THREE.Vector3(0, 1, 0), _v1 = new THREE.Vector3(), _q1 = new THREE.Quaternion();
export const fxMethods = {
  makeParticles() {
    this.particles = [];
    const geo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
    this.pmat = {
      blood: new THREE.MeshBasicMaterial({ color: 0x6a0808 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffb060 }),
      dust: new THREE.MeshBasicMaterial({ color: 0x8a8578 }),
      bile: new THREE.MeshBasicMaterial({ color: 0x9aa828 }),
    };
    for (let i = 0; i < 200; i++) {
      const m = new THREE.Mesh(geo, this.pmat.blood);
      m.visible = false;
      this.scene.add(m);
      this.particles.push({ m, v: new THREE.Vector3(), life: 0, floor: 0 });
    }
    this.pIdx = 0;
    this.tracers = [];
    this.pools = [];
  },

  // floorY:粒子落地的高度(多樓層時傳入命中點所在樓層的地面)
  burst(pos, normal, kind, n, floorY = pos.y - 2) {
    const mat = this.pmat[kind] || this.pmat.dust;
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pIdx++ % this.particles.length];
      p.m.material = mat;
      p.m.visible = true;
      p.m.position.copy(pos);
      const sp = kind === 'blood' || kind === 'bile' ? 2.6 : 3.2;
      p.v.set((Math.random() - 0.5) * sp, Math.random() * sp * 0.7, (Math.random() - 0.5) * sp).addScaledVector(normal, sp * 0.5);
      p.life = 0.35 + Math.random() * 0.4;
      p.floor = this.world.groundY ? this.world.groundY(pos.x, pos.z, pos.y) ?? floorY : floorY;
      p.m.scale.setScalar(kind === 'blood' ? 0.8 + Math.random() : 0.6 + Math.random() * 0.6);
    }
  },

  tracer(start, end) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  },

  updateParticles(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < p.floor + 0.02) { p.m.position.y = p.floor + 0.02; p.v.multiplyScalar(0.2); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.06) * 0.5;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    this.muzzleLight.intensity *= Math.pow(0.0001, dt);
    if (this.muzzleLight.intensity < 0.3) this.muzzleLight.intensity = 0;
    for (const p of this.pools) {
      if (p.grow < 1) {
        p.grow = Math.min(1, p.grow + dt * 0.4);
        const s = p.size * (0.15 + 0.85 * p.grow);
        p.mesh.scale.set(s, s, 1);
      }
    }
  },

  // 地上的血池(y 為地面高度)
  addPool(x, y, z) {
    if (!poolGeo) poolGeo = stainPlane('pool0', 0.62); // 格內的血泊約佔 75%:舊貼圖的可見範圍較小
    const m = new THREE.Mesh(poolGeo, stainMaterial());
    m.renderOrder = 1;
    m.receiveShadow = true;
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6.28;
    m.position.set(x, y + 0.015 + (this.pools.length % 20) * 0.0004, z);
    const n = this.world.normalAt ? this.world.normalAt(x, z, y + 0.05, _gn) : null;
    if (n && n.y < 0.999) { // 樓梯上:貼著坡面
      _q1.setFromUnitVectors(_yUp, _v1.set(n.x, n.y, n.z));
      m.quaternion.premultiply(_q1);
      m.position.y += 0.05;
    }
    m.scale.set(0.2, 0.2, 1);
    this.scene.add(m);
    this.pools.push({ mesh: m, grow: 0, size: 1.0 + Math.random() * 0.8 });
  },

  clearPools() {
    for (const p of this.pools) this.scene.remove(p.mesh); // 幾何與材質共用,不釋放
    this.pools.length = 0;
  },
};
