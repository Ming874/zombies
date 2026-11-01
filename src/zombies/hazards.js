import * as THREE from 'three';
import { sfx } from '../audio.js';

// 膿腫者的酸液彈、地上的酸池、爆炸後的毒氣雲(多樓層 3D)。
// update() 回傳本幀要扣玩家的血量(以 5 為單位結算,避免每幀都觸發受傷音效)
const GRAV = 9.8;

function canvasTex(S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = canvasTex(128, (x, S) => {
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(240,255,170,1)');
  g.addColorStop(0.3, 'rgba(170,220,60,0.6)');
  g.addColorStop(1, 'rgba(90,140,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
});
const splatTex = canvasTex(256, (x, S) => {
  const c = S / 2;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * S * 0.28, r = S * (0.08 + Math.random() * 0.14);
    const px = c + Math.cos(a) * d, py = c + Math.sin(a) * d;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(200,230,90,0.85)');
    g.addColorStop(0.7, 'rgba(150,190,40,0.6)');
    g.addColorStop(1, 'rgba(120,160,20,0)');
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40; i++) { // 氣泡
    const a = Math.random() * Math.PI * 2, d = Math.random() * S * 0.3;
    x.strokeStyle = 'rgba(235,255,170,0.7)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + Math.random() * 6, 0, Math.PI * 2);
    x.stroke();
  }
});
const smokeTex = canvasTex(128, (x, S) => {
  for (let i = 0; i < 30; i++) {
    const px = S / 2 + (Math.random() - 0.5) * S * 0.5, py = S / 2 + (Math.random() - 0.5) * S * 0.5, r = S * (0.15 + Math.random() * 0.2);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
});

const blobGeo = new THREE.SphereGeometry(0.07, 12, 10);
const blobMat = new THREE.MeshBasicMaterial({ color: 0xc8f060 });
const poolGeo = new THREE.PlaneGeometry(1, 1);
const HIST = 12;
const _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _nrm = { x: 0, y: 1, z: 0 };
const _at = { x: 0, y: 0, z: 0 };

export class Hazards {
  constructor(scene) {
    this.scene = scene;
    this.shots = [];
    this.pools = [];
    this.clouds = [];
    this.flashes = [];
    this.acc = 0;
    this.dots = { bleed: 0, bleedDps: 0, burn: 0, burnDps: 0 }; // 持續傷害(手術者的流血、焦屍的燒傷):剩餘秒數 + 每秒傷害
  }

  // 對本機玩家的持續傷害;同種類取較長/較痛的那個(不疊加)
  dot(kind, dps, t) {
    const d = this.dots;
    if (!(kind in d)) return;
    d[kind] = Math.max(d[kind], t);
    d[kind + 'Dps'] = Math.max(d[kind] > 0.05 ? d[kind + 'Dps'] : 0, dps);
  }

  // 拋物線吐射:飛行時間依水平距離而定(可以對不同樓層吐)
  spit(from, target) {
    const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - from.y;
    const d = Math.hypot(dx, dz);
    const T = Math.min(1.3, Math.max(0.45, d / 11));
    const vel = new THREE.Vector3(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(blobGeo, blobMat));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
    glow.scale.setScalar(0.6);
    g.add(glow);
    g.position.copy(from);
    this.scene.add(g);
    const trail = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 - i * 0.07 }));
      s.scale.setScalar(0.35 - i * 0.04);
      s.position.copy(from);
      this.scene.add(s);
      trail.push(s);
    }
    const hist = Array.from({ length: HIST }, () => g.position.clone()); // 軌跡環形緩衝(避免每幀配置)
    this.shots.push({ g, vel, trail, hist, hi: 0, t: 0 });
  }

  // 地上的酸池;n = 地面法線(樓梯上會順著坡面傾斜)
  pool(x, y, z, r = 1.25, n = null) {
    const m = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: splatTex, transparent: true, depthWrite: false, color: 0xb0e050, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const glow = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
    _n.set(n ? n.x : 0, n ? n.y : 1, n ? n.z : 0).normalize();
    _q.setFromUnitVectors(_up, _n);
    _qs.setFromAxisAngle(_up, Math.random() * 6.28);
    for (const o of [m, glow]) { o.quaternion.copy(_q).multiply(_qs); o.rotateX(-Math.PI / 2); }
    m.position.set(x + _n.x * 0.02, y + 0.02 + Math.random() * 0.004, z + _n.z * 0.02);
    m.scale.setScalar(0.1);
    glow.position.set(x + _n.x * 0.03, y + 0.03, z + _n.z * 0.03);
    glow.scale.setScalar(r * 2.6);
    this.scene.add(m, glow);
    this.pools.push({ m, glow, r, t: 0, life: 5.5, sizzle: 0, x, y, z, nx: _n.x, ny: _n.y, nz: _n.z });
  }

  gas(x, y, z) {
    const sprites = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: 0x8faa30, opacity: 0 }));
      const a = Math.random() * 6.28, d = Math.random() * 1.4;
      s.position.set(x + Math.cos(a) * d, y + 0.3 + Math.random() * 1.6, z + Math.sin(a) * d);
      s.userData = { base: 1.6 + Math.random() * 1.6, spin: (Math.random() - 0.5) * 0.6, rise: 0.05 + Math.random() * 0.15 };
      this.scene.add(s);
      sprites.push(s);
    }
    this.clouds.push({ x, y, z, sprites, t: 0, life: 6, r: 2.4, losT: 0, los: true });
  }

  flash(pos, size = 5) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.flashes.push({ s, t: 0, size });
  }

  // 酸液落點(已在空氣中的點):往下找地面放酸池;下方太遠或沒有地面就不留
  _land(world, x, y, z) {
    const gy = world.groundY ? world.groundY(x, z, y) : 0;
    if (gy === null || gy === undefined || y - gy > 3.6) return;
    if (world.normalAt) world.normalAt(x, z, gy + 0.05, _nrm);
    else { _nrm.x = 0; _nrm.y = 1; _nrm.z = 0; }
    this.pool(x, gy, z, 1.25, _nrm);
  }

  _removeShot(i) {
    const s = this.shots[i];
    this.scene.remove(s.g, ...s.trail);
    s.g.children[1].material.dispose();
    for (const t of s.trail) t.material.dispose();
    this.shots.splice(i, 1);
  }

  update(dt, player, world) {
    this.world = world;
    const pp = player.pos, ph = player.height || 1.8;
    // ---- 酸液彈:分段前進,每段用 3D 射線檢查牆/樓板/天花板/道具,並檢查玩家身體 ----
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], p = s.g.position, v = s.vel;
      s.t += dt;
      const n = Math.max(1, Math.ceil((Math.hypot(v.x, v.y, v.z) * dt) / 0.3));
      const h = dt / n;
      let done = false;
      for (let k = 0; k < n && !done; k++) {
        v.y -= GRAV * h;
        const sx = v.x * h, sy = v.y * h, sz = v.z * h;
        const len = Math.hypot(sx, sy, sz);
        if (len < 1e-6) continue;
        const dx = sx / len, dy = sy / len, dz = sz / len;
        const hit = world.rayDistance ? world.rayDistance(p.x, p.y, p.z, dx, dy, dz, len) : len;
        // 玩家(直立膠囊,半徑 0.45):線段在水平面上最接近玩家軸心的點
        const h2 = sx * sx + sz * sz;
        let u = h2 > 1e-9 ? ((pp.x - p.x) * sx + (pp.z - p.z) * sz) / h2 : 0;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const qx = p.x + sx * u, qy = p.y + sy * u, qz = p.z + sz * u;
        const hitPlayer = u * len <= hit && (qx - pp.x) ** 2 + (qz - pp.z) ** 2 < 0.2025 && qy > pp.y + 0.1 && qy < pp.y + ph + 0.1;
        if (hitPlayer) {
          this.acc += 15;
          sfx.splash(pp);
          this._land(world, qx, Math.min(qy, pp.y + 0.3), qz);
          done = true;
        } else if (hit < len) {
          const back = Math.max(0, hit - 0.05);
          _at.x = p.x + dx * back; _at.y = p.y + dy * back; _at.z = p.z + dz * back;
          sfx.splash(_at);
          this._land(world, _at.x, _at.y, _at.z);
          done = true;
        } else p.set(p.x + sx, p.y + sy, p.z + sz);
      }
      if (!done && (s.t > 3 || p.y < -20)) { this._land(world, p.x, p.y, p.z); done = true; }
      if (done) { this._removeShot(i); continue; }
      s.hi = (s.hi + 1) % HIST;
      s.hist[s.hi].copy(p);
      for (let k = 0; k < s.trail.length; k++) s.trail[k].position.copy(s.hist[(s.hi - Math.min(HIST - 1, k * 2 + 1) + HIST) % HIST]);
    }
    // ---- 酸池:站在池面上(腳底貼近池面高度;跳起來可避開)才受傷 ----
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t += dt;
      const grow = Math.min(1, p.t / 0.35);
      const fade = Math.min(1, (p.life - p.t) / 1.5);
      p.m.scale.setScalar(p.r * 2 * (0.2 + 0.8 * grow));
      p.m.material.opacity = 0.9 * fade;
      p.glow.material.opacity = (0.25 + Math.sin(p.t * 7) * 0.08) * fade;
      const ex = pp.x - p.x, ez = pp.z - p.z;
      const above = pp.y - (p.y - (p.nx * ex + p.nz * ez) / p.ny); // 腳底離池面(樓梯上池面是斜的)
      const inside = ex * ex + ez * ez < (p.r * 0.85) ** 2 && above < 0.4 && above > -0.6 && fade > 0.3;
      if (inside) this.acc += 6 * dt;
      p.sizzle -= dt;
      if (p.sizzle <= 0) { p.sizzle = inside ? 0.6 : 1.4; sfx.sizzle(p.m.position); }
      if (p.t >= p.life) {
        this.scene.remove(p.m, p.glow);
        p.m.material.dispose();
        p.glow.material.dispose();
        this.pools.splice(i, 1);
      }
    }
    // ---- 毒氣:範圍內、同一層的高度,且雲中心看得到玩家(不穿牆/樓板) ----
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      const a = Math.min(1, c.t / 0.4) * Math.min(1, (c.life - c.t) / 2);
      for (const s of c.sprites) {
        const u = s.userData;
        s.scale.setScalar(u.base * (0.6 + c.t * 0.18));
        s.material.rotation += u.spin * dt;
        s.material.opacity = 0.55 * a;
        s.position.y += u.rise * dt;
      }
      const near = Math.hypot(pp.x - c.x, pp.z - c.z) < c.r && pp.y + 1.2 > c.y - 0.3 && pp.y < c.y + 2.6;
      if (near && (c.losT -= dt) <= 0) {
        c.losT = 0.3;
        c.los = !world.hasLineOfSight || world.hasLineOfSight(c.x, c.y + 1.0, c.z, pp.x, pp.y + 1.2, pp.z);
      }
      if (near && c.los && a > 0.3) this.acc += 7 * dt;
      if (c.t >= c.life) {
        for (const s of c.sprites) { this.scene.remove(s); s.material.dispose(); }
        this.clouds.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      f.s.material.opacity = Math.max(0, 1 - f.t / 0.35);
      f.s.scale.setScalar(f.size * (1 + f.t * 2));
      if (f.t > 0.35) { this.scene.remove(f.s); f.s.material.dispose(); this.flashes.splice(i, 1); }
    }
    const D = this.dots;
    if (D.bleed > 0) { this.acc += D.bleedDps * Math.min(dt, D.bleed); D.bleed -= dt; }
    if (D.burn > 0) { this.acc += D.burnDps * Math.min(dt, D.burn); D.burn -= dt; }
    if (this.acc >= 5) {
      const d = Math.floor(this.acc / 5) * 5;
      this.acc -= d;
      return d;
    }
    return 0;
  }

  clear() {
    for (const s of this.shots) { this.scene.remove(s.g, ...s.trail); }
    for (const p of this.pools) this.scene.remove(p.m, p.glow);
    for (const c of this.clouds) for (const s of c.sprites) this.scene.remove(s);
    for (const f of this.flashes) this.scene.remove(f.s);
    this.shots.length = this.pools.length = this.clouds.length = this.flashes.length = 0;
    this.acc = 0;
    this.dots.bleed = this.dots.burn = 0;
  }
}
