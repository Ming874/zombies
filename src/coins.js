import * as THREE from 'three';
import { sfx } from './audio.js';
import { makeGlow } from './map/textures.js';

const COIN_GEO = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20);
const EDGE_GEO = new THREE.TorusGeometry(0.068, 0.007, 6, 20);
const COIN_MAT = new THREE.MeshStandardMaterial({ color: 0xe3b32a, metalness: 1, roughness: 0.28, emissive: 0x6b4a00, emissiveIntensity: 0.55 });
const glowTex = makeGlow('rgba(255,225,120,0.9)', 'rgba(255,170,30,0)');

export class Coins {
  constructor(scene) {
    this.scene = scene;
    this.piles = [];
    this.collecting = false;
    this.onGain = null; // (amount, pile) => void
    this.pendingDone = null;
  }

  get total() { return this.piles.reduce((s, p) => s + p.count, 0); }

  // 在(x,y,z)掉落 n 枚(y = 地面高度);附近已有金幣堆就疊上去,不新增堆
  drop(x, y, z, n = 5) {
    for (const p of this.piles) {
      if (!p.flying && Math.hypot(p.group.position.x - x, p.group.position.z - z) < 0.45 && Math.abs(p.group.position.y - y) < 0.5) {
        this._add(p, n);
        return p;
      }
    }
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    glow.scale.set(0.7, 0.7, 1);
    glow.position.y = 0.12;
    group.add(glow);
    const pile = { group, count: 0, flying: false, t: 0, delay: 0, from: new THREE.Vector3(), glow, spin: Math.random() * 6 };
    this.scene.add(group);
    this.piles.push(pile);
    this._add(pile, n);
    return pile;
  }

  _add(pile, n) {
    for (let k = 0; k < n; k++) {
      const i = pile.count++;
      const col = Math.floor(i / 5), layer = i % 5;
      const coin = new THREE.Mesh(COIN_GEO, COIN_MAT);
      const edge = new THREE.Mesh(EDGE_GEO, COIN_MAT);
      edge.rotation.x = Math.PI / 2;
      coin.add(edge);
      const ang = col * 2.4;
      const off = col === 0 ? 0 : 0.06;
      coin.position.set(Math.cos(ang) * off + (Math.random() - 0.5) * 0.022, 0.012 + layer * 0.021, Math.sin(ang) * off + (Math.random() - 0.5) * 0.022);
      coin.rotation.y = Math.random() * 6.28;
      coin.rotation.z = (Math.random() - 0.5) * 0.12;
      coin.castShadow = false;
      pile.group.add(coin);
    }
  }

  // 回合結束:所有金幣堆飛向玩家並加進庫存
  collectAll() {
    this.collecting = true;
    this.piles.forEach((p, i) => {
      p.flying = true;
      p.t = 0;
      p.delay = i * 0.05;
      p.from.copy(p.group.position);
    });
    if (!this.piles.length) this.collecting = false;
  }

  update(dt, player) {
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const p = this.piles[i];
      p.spin += dt;
      p.glow.material.opacity = 0.4 + Math.sin(p.spin * 4) * 0.15;
      if (!p.flying) { p.group.rotation.y += dt * 0.6; continue; }
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt / 0.8;
      const e = Math.min(1, p.t);
      const k = e * e * (3 - 2 * e);
      const tx = player.pos.x, tz = player.pos.z, ty = player.pos.y + 1.2;
      p.group.position.x = p.from.x + (tx - p.from.x) * k;
      p.group.position.z = p.from.z + (tz - p.from.z) * k;
      p.group.position.y = p.from.y + (ty - p.from.y) * k + Math.sin(e * Math.PI) * 0.8;
      p.group.rotation.y += dt * 14;
      p.group.scale.setScalar(1 - 0.5 * k);
      if (p.t >= 1) {
        sfx.coin(i);
        if (this.onGain) this.onGain(p.count, p);
        this.scene.remove(p.group);
        this.piles.splice(i, 1);
      }
    }
    if (this.collecting && this.piles.length === 0) {
      this.collecting = false;
      if (this.pendingDone) { const f = this.pendingDone; this.pendingDone = null; f(); }
    }
  }

  clear() {
    for (const p of this.piles) this.scene.remove(p.group);
    this.piles.length = 0;
    this.collecting = false;
  }
}
