import * as THREE from 'three';

import { World } from './map/collision.js';
import { buildHospitalSteps } from './map/hospital.js';
import { buildBlockout } from './map/blockout.js';
import { Weather } from './map/weather.js';
import { makeBloodSplat } from './map/textures.js';
import { applyTruth } from './physics/truth.js';
import { warmPMREM } from './sys/warmup.js';
import { installProgramSort } from './sys/drawsort.js';
import { setupPost } from './game/post.js';
import { buildInteract } from './interact/index.js';
import { MapUI } from './ui/map.js';
import { Player } from './player.js';
import { WeaponSystem, ORDER } from './weapons/weapon.js';
import { Zombie, LOOK_TYPES, warmZombies } from './zombie.js';
import { prewarm, variantReady } from './zombies/model.js';
import { ZU } from './zombies/materials.js';
import { Coins } from './coins.js';
import { Shop } from './shop.js';
import { UI } from './ui.js';
import { sfx, resume as resumeAudio } from './audio.js';

// 出怪點:從離玩家 SPAWN_MIN 公尺以外的出生點隨機挑一個,但只挑走路距離 SPAWN_PATH 公尺以內的
// (地圖有四層,太遠的出生點殭屍要繞好幾分鐘才到);都不符合時退回走路距離最近的一個
const SPAWN_MIN = 14, SPAWN_PATH = 60;

export class Game {
  // opts.deferred:只建最基本的欄位,其餘由 buildSteps() 分段建構(main.js 分時執行,載入時主執行緒不會被佔住好幾秒)
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.deferredBuild = !!opts.deferred;
    this.ui = new UI();
    this.ui.game = this;
    this.state = 'menu'; // menu | playing | dead
    this.phase = 'fighting'; // fighting | collecting | break | shop
    this.time = 0;
    this.shopUIOpen = false;
    this.input = { fireHeld: false, firePressed: false };
    this.look = { x: 0, y: 0 };
    if (!opts.deferred) { const it = this.buildSteps(); while (!it.next().done) { /* 同步建完 */ } }
  }

  // 建構流程(generator):每一段之後 yield;yield 出 Promise 時,分時執行器會等它完成(同步建構時略過)
  *buildSteps() {
    // ---- 渲染器 ----
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = !import.meta.env.PROD;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;
    this._dsort = installProgramSort(renderer); // 不透明物件依 shader program 分組繪製(src/sys/drawsort.js)

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050606);
    this.scene.fog = new THREE.FogExp2(0x0a0d0c, 0.022);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 120);
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
    yield;

    // ---- 世界:聖心醫院四層 + 戶外(src/map;取自 test 分支)----
    // 網址帶 ?blockout 時用灰盒場景;正式場景建構失敗時也退回灰盒(並撤銷失敗前登記的碰撞盒)
    this.world = new World();
    const nBoxes = this.world.boxes.length;
    let built = null;
    if (!new URLSearchParams(location.search).has('blockout')) {
      try { built = yield* buildHospitalSteps(this.world, this.world.layout, this.scene); } catch (e) {
        console.warn('[world] 場景建構失敗,改用灰盒:', e);
        this.world.truncateBoxes(nBoxes);
        built = null;
      }
    }
    this.hospital = built && built.group ? built : buildBlockout(this.world, this.world.layout, this.scene);
    this.scene.add(this.hospital.group);
    if (this.hospital.events) this.hospital.events.auto = false; // main 沒有驚嚇事件:地圖只當場景(燈管老化的閃爍照舊)
    yield;
    this.deferRainBake = !!this.deferredBuild; // 分時載入:遮雨圖等 main.js 開始畫面前再烘
    this.weather = new Weather(this); // 雨、濕地、低霧、閃電、暴風雲與城市剪影(每幀掛在 hospital.update 之後)
    yield;
    yield warmPMREM(this, [], { sizes: [256] }).catch(() => {});
    // 店面與門(碰撞盒要在 buildNav 之前登記)
    this.shop = new Shop(this.scene, this.world, { game: this, steps: true });
    yield* this.shop.steps;
    this.shop.steps = null;
    yield;
    buildInteract(this);
    yield;
    this.truth = applyTruth(this.world, this.hospital); // 碰撞高度 = 看到的高度(欄杆、床…)
    yield;
    // 靜態幾何 → 每材質一個 BatchedMesh(區塊實例 + PVS;src/map/hospital/batch.js),分段執行
    try { if (this.hospital.batchSteps) yield* this.hospital.batchSteps(this); } catch (e) { console.error('[hospital] 靜態批次失敗', e); }
    this.world.buildNav(); // 場景與道具的碰撞盒都登記好之後才建導航
    yield;

    this.player = new Player(this.camera, this.world);
    sfx.attachGame(this); // 3D 音效的視線遮蔽、樓層悶音(門、雨聲)
    this.weapons = new WeaponSystem(this.weaponScene);
    this.weapons.onFire = (def, id, speed) => this.fire(def, id, speed);
    this.coins = new Coins(this.scene);
    this.coins.onGain = (n) => {
      this.player.coins += n;
      this.ui.setCoins(this.player.coins);
      this.ui.coinGain(n);
    };
    this.zombies = [];

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
    yield;

    // ---- 後處理(src/game/post.js:GPU 效果、Bloom、調色、分區 LUT)與地圖(M)----
    setupPost(this);
    this.map = this.ui.map = new MapUI(this.ui);
    yield;

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
      p.gy = (this.world.groundY(pos.x, pos.z, pos.y) ?? pos.y - 1) + 0.02; // 落在這一層的地面
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
      if (p.m.position.y < p.gy) { p.m.position.y = p.gy; p.v.multiplyScalar(0.2); }
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

  addPool(x, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bloodMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6.28;
    m.position.set(x, y + 0.015 + this.pools.length * 0.0002, z);
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
    this.coins.drop(z.pos.x, z.pos.y, z.pos.z, 5);
    this.addPool(z.pos.x, z.pos.y, z.pos.z);
    z.corpse = 6;
  }

  // ---------- 流程 ----------
  resetRun() {
    for (const z of this.zombies) z.dispose();
    this.zombies.length = 0;
    this.coins.clear();
    for (const p of this.pools) this.scene.remove(p.mesh);
    this.pools.length = 0;
    this.shop.setOpen(false, true);
    if (this.shopUIOpen) this.closeShop(false);
    this.interact.resetRun(); // 門回到地圖的初始狀態
    this.ui.map.resetRun(); // 地圖迷霧每局重來
    this.hospital.reset?.();
    this.player.hp = this.player.maxHp;
    this.player.coins = 0;
    const st = this.world.start;
    this.player.pos.set(st.x, st.y || 0, st.z);
    this.player.yaw = st.yaw || 0;
    this.player.pitch = 0;
    this.player.vx = this.player.vz = 0;
    this.player.update(0, false); // 鏡頭放到起點(選單畫面)
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
    this.shop.setOpen(false);
    this.interact.newRound();
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
    const p = this.player.pos, W = this.world;
    // 通風口出生點是 test 的爬行者專用,main 不用
    const pts = W.spawns.filter((s) => !s.vent).map((s) => ({ s, d: Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z), path: W.flowDistance(s.x, s.y, s.z) }));
    const far = pts.filter((q) => q.d > SPAWN_MIN);
    let cand = far.filter((q) => q.path <= SPAWN_PATH);
    if (!cand.length && far.length) cand = [far.reduce((a, b) => (b.path < a.path ? b : a))];
    if (!cand.length) cand = [pts.sort((a, b) => b.d - a.d)[0]];
    const s = cand[(Math.random() * cand.length) | 0].s;
    const z = new Zombie(this.scene, s.x + (Math.random() - 0.5) * 1.2, s.z + (Math.random() - 0.5) * 1.2, this.round, s.y);
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
        this.shop.setOpen(true); // 捲門拉起、霓虹點亮
        this.ui.banner('武器商店開放', '前往一樓便利商店（金水商行）購買武器', 5000);
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
    this.ui.map.close();
    document.exitPointerLock();
    this.input.fireHeld = false;
    document.getElementById('deadinfo').innerHTML = `你撐到了第 <b>${this.round}</b> 回合<br />累積金幣 ${this.player.coins}`;
    this.ui.overlay('dead', true);
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    this.hospital.update(this.time, dt, this.player); // 樓層可見性、PVS、燈光、氛圍、門扇;天氣也掛在這裡
    this.post.uniforms.time.value = this.time % 100;
    this.grade?.update(dt); // 分區 LUT 權重(src/gfx/grade.js)
    this.shop.update(dt, this.time, this.player); // 捲門、霓虹、價格牌
    const p0 = this.player;
    sfx.listener(p0.pos.x, p0.pos.y + 1.65, p0.pos.z, p0.yaw);
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
    this.world.updateFlow([p.pos]);
    this.interact.update(dt); // 門(看著門按 E 開關;殭屍會推開關著的門)
    this.ui.map.track(this); // 地圖迷霧:記錄走過的格子
    if (this.ui.map.isOpen) this.ui.map.update(this);

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
    for (const z of this.zombies) if (z.alive) near = Math.min(near, Math.hypot(z.pos.x - p.pos.x, (z.pos.y - p.pos.y) * 2, z.pos.z - p.pos.z));
    sfx.setTension(Math.max(0, Math.min(1, 1 - (near - 1.5) / 12)));
    sfx.setHealth(p.hp / p.maxHp);

    // 回合狀態
    if (this.phase === 'fighting' && this.toSpawn === 0 && !this.zombies.some((z) => z.alive)) this.endRound();
    // 提示列:看著門時是門的提示,否則依回合階段
    let prompt = null;
    if (this.phase === 'break') {
      this.breakTimer -= dt;
      prompt = `下一回合 ${Math.ceil(this.breakTimer)} 秒後開始(按 N 立即開始)`;
      if (this.breakTimer <= 0) this.nextRound();
    }
    const shopNear = this.phase === 'shop' && this.shop.near(p);
    if (this.phase === 'shop') prompt = shopNear ? '按 E 開啟商店 · 按 N 開始下一回合' : '前往一樓便利商店（金水商行）購買武器 · 按 N 開始下一回合';
    const ix = shopNear ? null : this.interact.pick();
    if (ix) prompt = typeof ix.text === 'string' ? ix.text : ix.text?.text || null;
    this.ui.prompt(prompt);

    // 低血量心跳暗角
    this.post.uniforms.hurt.value = p.hp < 35 ? (1 - p.hp / 35) * 0.7 + Math.sin(this.time * 6) * 0.1 : Math.max(0, 1 - (this.time - p.lastHurt) * 2) * 0.5;
  }

  render() {
    this._dsort?.tick();
    this.composer.render();
  }

  // ---------- 輸入 ----------
  bindInput() {
    const canvas = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.ui.map.isOpen) this.ui.map.close();
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
      if (document.pointerLockElement !== canvas || this.state !== 'playing' || this.ui.map.isOpen) return;
      this.player.look(e.movementX, e.movementY);
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas || e.button !== 0 || this.ui.map.isOpen) return;
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
      // 地圖(M):PgUp/PgDn 翻樓層,M/Esc/Tab 收起
      if (this.ui.map.isOpen && ['KeyM', 'Escape', 'PageUp', 'PageDown', 'Tab'].includes(e.code)) {
        e.preventDefault();
        if (e.code === 'PageUp') this.ui.map.floor(1);
        else if (e.code === 'PageDown') this.ui.map.floor(-1);
        else this.ui.map.close();
        return;
      }
      if (e.code === 'KeyE' && !e.repeat) {
        if (this.shopUIOpen) this.closeShop();
        else if (this.phase === 'shop' && this.shop.near(this.player)) this.openShop();
        else this.interact.press(); // 看著的門:開/關
      }
      if (e.code === 'KeyM' && !e.repeat && !this.paused && !this.shopUIOpen) { e.preventDefault(); this.ui.map.open(this); }
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
