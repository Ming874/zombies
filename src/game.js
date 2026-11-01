import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { World } from './map/collision.js';
import { buildHospital } from './map/hospital.js';
import { makeBloodSplat } from './map/textures.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS, ORDER } from './weapons/weapon.js';
import { Zombie, LOOK_TYPES, warmZombies } from './zombie.js';
import { prewarm, variantReady } from './zombies/model.js';
import { loadRealistic } from './zombies/realistic.js';
import { ZU } from './zombies/materials.js';
import { assets } from './sys/assets.js';
import { uploads } from './sys/uploads.js';
import { Coins } from './coins.js';
import { Shop } from './shop.js';
import { UI } from './ui.js';
import { sfx, resume as resumeAudio } from './audio.js';

const PostShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aspect: { value: 1 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float aspect; uniform float hurt;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * 0.012; // 邊緣輕微色差
      vec4 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c.a = 1.0;
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 0.8 - hurt * 0.5);
      float v = smoothstep(0.95, 0.2, length(d * vec2(aspect * 0.8, 1.0)));
      c.rgb *= mix(0.45, 1.0, v);
      c.rgb += (hash(vUv * 900.0 + time) - 0.5) * 0.022;
      c.r += hurt * 0.12;
      gl_FragColor = c;
    }`,
};

// 清掉 HDR 緩衝裡偶發的 NaN/Inf,避免 Bloom 把整個畫面染成全黑
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (!(c.r >= 0.0 && c.r < 60.0)) c.r = 0.0;
      if (!(c.g >= 0.0 && c.g < 60.0)) c.g = 0.0;
      if (!(c.b >= 0.0 && c.b < 60.0)) c.b = 0.0;
      c.a = 1.0;
      gl_FragColor = c;
    }`,
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ui = new UI();
    this.state = 'menu'; // menu | playing | dead
    this.phase = 'fighting'; // fighting | collecting | break | shop
    this.time = 0;
    this.shopUIOpen = false;
    this.input = { fireHeld: false, firePressed: false };
    this.look = { x: 0, y: 0 };

    // ---- 渲染器 ----
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;
    // 殭屍模型:寫實角色(GLB)排隊下載、貼圖逐幀上傳;程式生成的變體在背景 Worker 預建
    uploads.attach(renderer);
    assets.open();
    loadRealistic();
    prewarm();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050606);
    this.scene.fog = new THREE.FogExp2(0x0a0d0c, 0.022);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 90);
    this.scene.add(this.camera);

    // 手持武器獨立一層,避免穿牆
    this.weaponScene = new THREE.Scene();
    this.weaponCamera = new THREE.PerspectiveCamera(52, 1, 0.01, 5);
    this.weaponScene.add(new THREE.HemisphereLight(0xc4d0cc, 0x3a342d, 2.4));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-1.5, 2.5, 1.2);
    this.weaponScene.add(key);
    this.weaponLight = new THREE.PointLight(0xffa850, 0, 3, 2);
    this.weaponScene.add(this.weaponLight);

    // ---- 世界 ----
    this.world = new World();
    this.hospital = buildHospital(this.world);
    this.scene.add(this.hospital.group);
    this.world.buildNav();

    this.player = new Player(this.camera, this.world);
    this.weapons = new WeaponSystem(this.weaponScene);
    this.weapons.onFire = (def, id, speed) => this.fire(def, id, speed);
    this.coins = new Coins(this.scene);
    this.coins.onGain = (n) => {
      this.player.coins += n;
      this.ui.setCoins(this.player.coins);
      this.ui.coinGain(n);
    };
    this.zombies = [];
    this.shop = null;

    // 槍口閃光燈(照亮環境)
    this.muzzleLight = new THREE.PointLight(0xffa850, 0, 14, 2);
    this.scene.add(this.muzzleLight);

    this.ray = new THREE.Raycaster();
    this.tmpV = new THREE.Vector3();
    this.bloodTex = makeBloodSplat();
    this.bloodMat = new THREE.MeshBasicMaterial({ map: this.bloodTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: 0xcccccc });
    this.pools = [];
    this.makeParticles();
    this.tracers = [];

    // ---- 後處理 ----
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const wp = new RenderPass(this.weaponScene, this.weaponCamera);
    wp.clear = false;
    wp.clearDepth = true;
    this.composer.addPass(wp);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.6, 0.92);
    this.composer.addPass(this.bloom);
    this.post = new ShaderPass(PostShader);
    this.composer.addPass(this.post);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.resetRun();
    this.ui.setHP(this.player.hp, this.player.maxHp);
    this.updateAmmoHud();
    sfx.setMood('menu');
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weaponCamera.aspect = w / h;
    this.weaponCamera.updateProjectionMatrix();
    this.post.uniforms.aspect.value = w / h;
  }

  // ---------- 粒子 ----------
  makeParticles() {
    this.particles = [];
    const geo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
    this.blood = new THREE.MeshBasicMaterial({ color: 0x6a0808 });
    this.spark = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    this.dust = new THREE.MeshBasicMaterial({ color: 0x8a8578 });
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(geo, this.blood);
      m.visible = false;
      this.scene.add(m);
      this.particles.push({ m, v: new THREE.Vector3(), life: 0 });
    }
    this.pIdx = 0;
  }

  burst(pos, normal, kind, n) {
    const mat = kind === 'blood' ? this.blood : kind === 'spark' ? this.spark : this.dust;
    for (let i = 0; i < n; i++) {
      const p = this.particles[this.pIdx++ % this.particles.length];
      p.m.material = mat;
      p.m.visible = true;
      p.m.position.copy(pos);
      const sp = kind === 'blood' ? 2.6 : 3.2;
      p.v.set((Math.random() - 0.5) * sp, Math.random() * sp * 0.7, (Math.random() - 0.5) * sp).addScaledVector(normal, sp * 0.5);
      p.life = 0.35 + Math.random() * 0.4;
      p.m.scale.setScalar(kind === 'blood' ? 0.8 + Math.random() : 0.6 + Math.random() * 0.6);
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.multiplyScalar(0.2); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.06) * 0.5;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
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
  }

  addPool(x, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloodMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6.28;
    m.position.set(x, 0.015 + this.pools.length * 0.0002, z);
    m.scale.set(0.2, 0.2, 1);
    this.scene.add(m);
    this.pools.push({ mesh: m, grow: 0, size: 1.0 + Math.random() * 0.8 });
  }

  // ---------- 射擊 ----------
  fire(def, id, speedNorm) {
    const cam = this.camera;
    this.player.kick(def.pitch, def.pitch * 0.9);
    cam.updateMatrixWorld(true);
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const spread = def.spread * (1 + speedNorm * 1.6 + (this.player.sprinting ? 1 : 0));
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, -1).normalize().applyQuaternion(cam.quaternion);

    this.muzzleLight.position.copy(origin).addScaledVector(dir, 0.8);
    this.muzzleLight.intensity = 38;
    this.weaponLight.intensity = 6;
    setTimeout(() => { this.weaponLight.intensity = 0; }, 45);

    const liveZ = this.zombies.filter((z) => z.alive);
    for (const z of liveZ) z.root.updateMatrixWorld(true);
    const live = liveZ.flatMap((z) => z.meshes);
    this.ray.set(origin, dir);
    this.ray.near = 0;
    this.ray.far = 90;
    const hits = this.ray.intersectObjects(live, false);
    const wallDist = this.world.rayDistance(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 90);
    const end = new THREE.Vector3();

    if (hits.length && hits[0].distance < wallDist) {
      const h = hits[0];
      const z = h.object.userData.zombie;
      const part = h.object.userData.part;
      const head = part === 'head';
      const dmg = def.damage * (head ? 2 : 1);
      end.copy(h.point);
      const killed = z.damage(dmg, part);
      this.burst(h.point, dir.clone().negate(), 'blood', head ? 14 : 8);
      this.ui.hitMarker(head);
      (head ? sfx.headshot : sfx.hit)();
      if (killed) this.onKill(z);
    } else {
      end.copy(origin).addScaledVector(dir, wallDist);
      const n = dir.clone().negate();
      this.burst(end, n, 'spark', 4);
      this.burst(end, n, 'dust', 4);
      sfx.wall();
    }

    // 曳光
    const start = new THREE.Vector3(0.18, -0.12, -0.8).applyMatrix4(cam.matrixWorld);
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });

    this.updateAmmoHud();
  }

  onKill(z) {
    this.coins.drop(z.pos.x, z.pos.z, 5);
    this.addPool(z.pos.x, z.pos.z);
    z.corpse = 6;
  }

  // ---------- 流程 ----------
  resetRun() {
    for (const z of this.zombies) z.dispose();
    this.zombies.length = 0;
    this.coins.clear();
    for (const p of this.pools) this.scene.remove(p.mesh);
    this.pools.length = 0;
    if (this.shop) { this.shop.dispose(); this.shop = null; }
    this.player.hp = this.player.maxHp;
    this.player.coins = 0;
    this.player.pos.set(this.world.start.x, 0, this.world.start.z);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.vx = this.player.vz = 0;
    // 重新給武器(只剩手槍)
    this.weapons.inv = {};
    this.weapons.give('pistol');
    this.weapons.switchTo('pistol', true);
    this.round = 0;
    this.ui.setCoins(0);
    this.ui.setHP(this.player.hp, this.player.maxHp);
  }

  begin() {
    resumeAudio();
    if (!this.ambientStarted) { sfx.ambient(); this.ambientStarted = true; }
    this.resetRun();
    this.state = 'playing';
    this.startRound(1);
  }

  startRound(n) {
    this.round = n;
    this.toSpawn = 5 + 3 * (n - 1);
    this.spawnTimer = 3;
    this.maxAlive = Math.min(12, 6 + Math.floor(n / 2));
    this.phase = 'fighting';
    this.weapons.resupply();
    if (this.shop) { this.shop.dispose(); this.shop = null; }
    for (const p of this.pools) this.scene.remove(p.mesh);
    this.pools.length = 0;
    this.ui.setRound(n);
    this.ui.banner(`第 ${n} 回合`, `殭屍 ${this.toSpawn} 隻`, 3000);
    this.ui.prompt(null);
    sfx.roundStart();
    sfx.setMood(n % 5 === 0 ? 'boss' : 'fight'); // 每 5 回合(商店開放前)是高潮回合
    this.updateAmmoHud();
  }

  zombiesLeft() {
    return this.toSpawn + this.zombies.filter((z) => z.alive).length;
  }

  spawnZombie() {
    const p = this.player.pos;
    const pts = this.world.spawns.map((s) => ({ s, d: Math.hypot(s.x - p.x, s.z - p.z) }));
    let cand = pts.filter((q) => q.d > 14);
    if (!cand.length) cand = [pts.sort((a, b) => b.d - a.d)[0]];
    const s = cand[(Math.random() * cand.length) | 0].s;
    const z = new Zombie(this.scene, s.x + (Math.random() - 0.5) * 1.2, s.z + (Math.random() - 0.5) * 1.2, this.round);
    this.zombies.push(z);
    this.toSpawn--;
  }

  endRound() {
    this.phase = 'collecting';
    this.ui.banner(`第 ${this.round} 回合結束`, '收集金幣中…', 3000);
    sfx.roundEnd();
    sfx.setMood('break');
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    this.ui.setHP(this.player.hp, this.player.maxHp);
    const after = () => {
      if (this.state !== 'playing') return;
      if (this.round % 5 === 0) {
        this.phase = 'shop';
        this.shop = new Shop(this.scene, this.world);
        this.ui.banner('武器商店開放', '前往醫院大門(南側玄關)購買武器', 5000);
        sfx.setMood('shop');
      } else {
        this.phase = 'break';
        this.breakTimer = 6;
      }
    };
    if (this.coins.piles.length) {
      this.coins.collectAll();
      this.coins.pendingDone = after;
    } else setTimeout(after, 1500);
  }

  openShop() {
    this.shopUIOpen = true;
    this.ui.renderShop(this.player, this.weapons, (id, price) => this.buy(id, price));
    this.ui.overlay('shop', true);
    document.exitPointerLock();
    this.input.fireHeld = false;
  }

  closeShop(relock = true) {
    this.shopUIOpen = false;
    this.ui.overlay('shop', false);
    if (relock && this.state === 'playing') this.canvas.requestPointerLock();
  }

  buy(id, price) {
    if (this.player.coins < price) { sfx.deny(); return; }
    this.player.coins -= price;
    if (id === 'ammo') this.weapons.refillAll();
    else {
      const owned = this.weapons.has(id);
      this.weapons.give(id);
      if (!owned) this.weapons.switchTo(id);
    }
    sfx.buy();
    this.ui.setCoins(this.player.coins);
    this.updateAmmoHud();
    this.ui.renderShop(this.player, this.weapons, (i, p) => this.buy(i, p));
  }

  nextRound() {
    if (this.shopUIOpen) this.closeShop();
    this.startRound(this.round + 1);
  }

  updateAmmoHud() {
    const w = this.weapons;
    this.ui.setAmmo(w.def.name, w.ammo.mag, w.ammo.reserve, w.reloading > 0);
  }

  die() {
    this.state = 'dead';
    sfx.setMood('dead');
    document.exitPointerLock();
    this.input.fireHeld = false;
    document.getElementById('deadinfo').innerHTML = `你撐到了第 <b>${this.round}</b> 回合<br />累積金幣 ${this.player.coins}`;
    this.ui.overlay('dead', true);
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    this.hospital.update(this.time);
    this.post.uniforms.time.value = this.time % 100;
    this.updateParticles(dt);
    ZU.uTime.value = this.time; // 殭屍材質:焦屍裂縫的餘燼閃爍
    ZU.uFlash.value = this.player.flashOn ? 1 : 0; // 手電筒照到殭屍眼睛的反光
    // 選單與回合間:繼續預建殭屍模型;全部類型都有變體後預先編譯殭屍 shader(第一隻出現時才不會卡)
    if (this.state !== 'playing' || this.phase !== 'fighting') prewarm();
    if (!this.zWarm && LOOK_TYPES.every(variantReady)) { this.zWarm = true; warmZombies(this.renderer, this.scene, this.camera); }

    if (this.state !== 'playing') {
      // 選單/死亡:鏡頭保持,只更新場景動畫
      this.coins.update(dt, this.player);
      return;
    }

    const paused = this.paused || this.shopUIOpen;
    if (paused) return;

    const p = this.player;
    p.update(dt, true);
    this.world.updateFlow(p.pos.x, p.pos.z);

    const w = this.weapons;
    w.update(dt, this.input, p.speedNorm, p.sprinting, this.look);
    this.updateAmmoHud();

    // 殭屍生成
    if (this.phase === 'fighting') {
      const alive = this.zombies.filter((z) => z.alive).length;
      this.spawnTimer -= dt;
      if (this.toSpawn > 0 && alive < this.maxAlive && this.spawnTimer <= 0) {
        this.spawnZombie();
        this.spawnTimer = Math.max(0.6, 1.8 - this.round * 0.08);
      }
    }

    // 殭屍更新
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const dmg = z.update(dt, p, this.world, this.zombies);
      if (dmg > 0 && p.hp > 0) {
        p.hurt(dmg, this.time);
        this.ui.damageFlash();
        this.ui.setHP(p.hp, p.maxHp);
        if (p.hp <= 0) { this.die(); return; }
      }
      if (!z.alive) {
        z.corpse -= dt;
        if (z.corpse <= 0) { z.dispose(); this.zombies.splice(i, 1); }
      }
    }

    this.coins.update(dt, p);
    this.ui.setZombies(this.phase === 'fighting' ? this.zombiesLeft() : 0);

    // 配樂:最近的殭屍越近越緊張、低血量心跳
    let near = 99;
    for (const z of this.zombies) if (z.alive) near = Math.min(near, Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z));
    sfx.setTension(Math.max(0, Math.min(1, 1 - (near - 1.5) / 12)));
    sfx.setHealth(p.hp / p.maxHp);

    // 回合狀態
    if (this.phase === 'fighting' && this.toSpawn === 0 && !this.zombies.some((z) => z.alive)) this.endRound();
    if (this.phase === 'break') {
      this.breakTimer -= dt;
      this.ui.prompt(`下一回合 ${Math.ceil(this.breakTimer)} 秒後開始(按 N 立即開始)`);
      if (this.breakTimer <= 0) this.nextRound();
    }
    if (this.phase === 'shop' && this.shop) {
      this.shop.update(dt, this.time);
      this.ui.prompt(this.shop.near(p) ? '按 E 開啟商店 · 按 N 開始下一回合' : '前往醫院大門(南側)購買武器 · 按 N 開始下一回合');
    }
    if (this.phase === 'collecting') this.ui.prompt(null);

    // 低血量心跳暗角
    this.post.uniforms.hurt.value = p.hp < 35 ? (1 - p.hp / 35) * 0.7 + Math.sin(this.time * 6) * 0.1 : Math.max(0, 1 - (this.time - p.lastHurt) * 2) * 0.5;
  }

  render() {
    // 武器相機與主相機同步 FOV 外的設定(位置固定在原點)
    this.composer.render();
  }

  // ---------- 輸入 ----------
  bindInput() {
    const canvas = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.state === 'playing' && !this.shopUIOpen) {
        this.paused = true;
        this.ui.overlay('pause', true);
      }
      if (locked) {
        this.paused = false;
        this.ui.overlay('pause', false);
        this.ui.overlay('menu', false);
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.state !== 'playing') return;
      this.player.look(e.movementX, e.movementY);
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas || e.button !== 0) return;
      this.input.fireHeld = true;
      this.input.firePressed = true;
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.input.fireHeld = false; });
    document.addEventListener('wheel', (e) => {
      if (this.state === 'playing' && !this.paused && !this.shopUIOpen) this.weapons.cycle(e.deltaY > 0 ? 1 : -1);
    });
    document.addEventListener('keydown', (e) => {
      this.player.keys[e.code] = true;
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE' && this.phase === 'shop' && this.shop) {
        if (this.shopUIOpen) this.closeShop();
        else if (this.shop.near(this.player)) this.openShop();
      }
      if (e.code === 'Escape' && this.shopUIOpen) this.closeShop(false), this.ui.overlay('pause', true), (this.paused = true);
      if (this.paused || this.shopUIOpen) {
        if (e.code === 'KeyN' && this.phase === 'shop') this.nextRound();
        return;
      }
      if (e.code === 'KeyR') { this.weapons.startReload(); }
      if (e.code === 'KeyF') this.player.toggleFlashlight();
      if (e.code === 'KeyN' && this.phase === 'shop') this.nextRound();
      if (e.code === 'KeyN' && this.phase === 'break') this.nextRound();
      const m = /^Digit([1-4])$/.exec(e.code);
      if (m) {
        const id = ORDER[Number(m[1]) - 1];
        if (this.weapons.has(id)) this.weapons.switchTo(id);
      }
    });
    document.addEventListener('keyup', (e) => { this.player.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.player.keys = {}; this.input.fireHeld = false; });

    const lock = () => { resumeAudio(); canvas.requestPointerLock(); };
    document.getElementById('startBtn').onclick = () => {
      document.getElementById('menu').classList.remove('on');
      this.ui.showHud(true);
      this.begin();
      lock();
    };
    document.getElementById('resumeBtn').onclick = lock;
    document.getElementById('pause').onclick = lock;
    document.getElementById('restartBtn').onclick = () => {
      this.ui.overlay('dead', false);
      this.begin();
      lock();
    };
    document.getElementById('shopNext').onclick = () => this.nextRound();
  }
}
