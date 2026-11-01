import * as THREE from 'three';

import { World } from './map/collision.js';
import { buildHospitalSteps } from './map/hospital.js';
import { warmPMREM } from './sys/warmup.js';
import { buildBlockout } from './map/blockout.js';
import { Player } from './player.js';
import { WeaponSystem } from './weapons/weapon.js';
import { prewarm } from './zombies/model.js';
import { Hazards } from './zombies/hazards.js';
import { Coins } from './coins.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';
import { setupPost } from './game/post.js';
import { fxMethods } from './game/fx.js';
import { combatMethods } from './game/combat.js';
import { flowMethods } from './game/flow.js';
import { inputMethods } from './game/input.js';
import { createPhysics } from './physics/index.js';
import { applyTruth } from './physics/truth.js';
import { Weather } from './map/weather.js';
import { installProgramSort } from './sys/drawsort.js';
import { instrument } from './gfx/gpuprof.js';

// 遊戲主體:建立渲染器/場景/各系統,並跑主迴圈。
// 細節分在 src/game/*:fx(粒子/血池)、combat(射擊/傷害/爆炸)、flow(回合/出怪/商店/死亡)、input(輸入)、post(後處理)
export class Game {
  // opts.deferred:只建最基本的欄位,其餘由 buildSteps() 分段建構(main.js 分時執行,載入時主執行緒不會被佔住好幾秒)
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.deferredBuild = !!opts.deferred;
    this.ui = new UI();
    this.state = 'menu'; // menu | playing | dead
    this.phase = 'fighting'; // fighting | collecting | break | shop
    this.time = 0;
    this.shopUIOpen = false;
    this.input = { fireHeld: false, firePressed: false };
    this.look = { x: 0, y: 0 };
    this.net = null; // 連線層(多人模式時由 src/net 設定)
    if (!opts.deferred) { const it = this.buildSteps(); while (!it.next().done) { /* 同步建完 */ } }
  }

  // [perf] 建構流程(generator):每一段之後 yield;yield 出 Promise 時,分時執行器會等它完成(同步建構時略過)
  *buildSteps() {
    // ---- 渲染器 ----
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = !import.meta.env.PROD; // 正式版不查 shader 錯誤日誌(那些查詢會同步等編譯完成;建構期間的預編譯也適用)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // r18x 已棄用 PCFSoftShadowMap(會退回 PCF 並警告)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;
    this._dsort = installProgramSort(renderer); // [draws] 不透明物件依 shader program 分組繪製(src/sys/drawsort.js)

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

    // ---- 世界 ----
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
    yield;
    this.deferRainBake = !!this.deferredBuild; // [perf] 分時載入:遮雨圖等 main.js 開始畫面前再烘
    this.weather = new Weather(this); // 雨、濕地、低霧、閃電、暴風雲與城市剪影(src/map/weather.js;每幀掛在 hospital.update 之後)
    yield;
    // 室內環境反射(src/mats/surface.js)與大氣環境貼圖會在建構中就地做 PMREM:先在背景把它的 shader 編好
    yield warmPMREM(this, [], { sizes: [256] }).catch(() => {});
    yield* this.buildGameplayWorldSteps(); // 補給站店面與補給點(碰撞盒要在 buildNav 之前登記)
    this.truth = applyTruth(this.world, this.hospital); // [physics] 碰撞高度 = 看到的高度、道具材質(src/physics/truth.js)
    yield;
    // [draws] 靜態幾何 → 每材質一個 BatchedMesh(區塊實例 + PVS;src/map/hospital/batch.js),分段執行
    try { if (this.hospital.batchSteps) yield* this.hospital.batchSteps(this); } catch (e) { console.error('[hospital] 靜態批次失敗', e); }
    this.world.buildNav(); // 場景與道具的碰撞盒都登記好之後才建導航
    yield;

    this.player = new Player(this.camera, this.world);
    sfx.attachGame(this); // [audio] 視線遮蔽、樓層悶音、地面材質、房間殘響、畫質、玩家狀態(蹲下/喘息)
    this.players = [this.player]; // 多人時會加入遠端玩家(殭屍追最近的)
    this.weapons = new WeaponSystem(this.weaponScene);
    this.weapons.onFire = (def, id, speed) => this.fire(def, id, speed);
    yield;
    this.coins = new Coins(this.scene);
    this.coins.player = this.player;
    this.coins.world = this.world;
    this.coins.onGain = (n) => {
      this.player.coins += n;
      this.ui.setCoins(this.player.coins);
      this.ui.coinGain(n);
    };
    this.zombies = [];
    this.queue = [];
    this.hazards = new Hazards(this.scene);
    this.zctx = { player: this.player, players: this.players, world: this.world, zombies: this.zombies, hazards: this.hazards, game: this };

    // 槍口閃光燈(照亮環境)
    this.muzzleLight = new THREE.PointLight(0xffa850, 0, 14, 2);
    this.scene.add(this.muzzleLight);

    this.ray = new THREE.Raycaster();
    this.makeParticles();
    // 物理(src/physics:Rapier WASM,預設在 Web Worker 非同步載入;載入前或失敗時 ready=false,遊戲照舊運作)
    this.physics = createPhysics(this);
    yield;
    setupPost(this);
    yield;

    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.initCombat(); // 先建好(含固定存在的爆炸閃光燈):光源數量是 shader 參數,之後的任何預編譯才會用對的光源數
    yield;
    this.initGameplay(); // 掉落物、商店介面、HUD、設定、按鍵(src/game/flow.js)
    this.resetRun();
    this.setMood('menu');
    this.ui.setHP(this.player.hp, this.player.maxHp);
    this.updateAmmoHud();
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

  // 導航場的目標:所有活著且未倒地的玩家(重複使用同一個陣列,不每幀配置)
  flowTargets() {
    const out = this._flowT || (this._flowT = []);
    out.length = 0;
    for (let i = 0; i < this.players.length; i++) { const p = this.players[i]; if (p.alive !== false && !p.downed) out.push(p.pos); }
    return out;
  }

  // ---------- 主更新 ----------
  update(dt) {
    this.time += dt;
    if (this.net) this.net.update(dt); // [net] 多人連線:殭屍快照、遠端玩家、回合同步、多人 HUD(src/net/session.js)
    this.hospital.update(this.time, dt, this.player);
    this.horror?.update(dt); // [ghost] 靈異導演、耳語、幻影(src/horror)
    this.post.uniforms.time.value = this.time % 100;
    this.grade?.update(dt); // [gpu] 分區 LUT 權重、驚嚇色差脈衝(src/gfx/grade.js)
    this.updateParticles(dt);
    this.updateCombat(dt); // 武器:開鏡視野、準心/狙擊鏡、手榴彈、彈殼與彈孔等特效(src/game/combat.js)

    if (this.state !== 'playing') {
      // 選單/死亡:只更新場景動畫與鏡頭飄移;順便預先建好殭屍模型
      this.coins.update(dt, this.player);
      this.updateIdle(dt);
      prewarm();
      return;
    }

    const paused = this.paused || this.shopUIOpen;
    if (paused && !this.net) return; // [net] 多人模式世界不暫停,只是本機玩家不能操作

    const p = this.player;
    p.update(dt, !paused && !p.downed && p.alive !== false); // [net] 倒地/陣亡/多人暫停選單時不能移動
    this.physics.begin(dt); // 物理:送出上一幀的命令,Worker 與下面的遊戲邏輯平行步進
    if (this.net) this.net.afterPlayer(dt); // [net] 倒地/觀戰鏡頭、遠端角色動畫、送出本機狀態
    const targets = this.flowTargets();
    if (targets.length) this.world.updateFlow(targets);
    sfx.listener(p.pos.x, p.pos.y + (p.eyeH || 1.65), p.pos.z, p.yaw);
    sfx.setHealth(p.hp / p.maxHp);

    if (this.phase !== 'fighting') prewarm(); // 回合間的空檔繼續預建殭屍模型
    const w = this.weapons;
    w.update(dt, this.input, p.speedNorm, p.sprinting, this.look);
    this.updateAmmoHud();

    // 出怪、回合結束、休息倒數(src/game/flow.js)
    this.updateRound(dt);

    // 殭屍更新(傷害套用到牠攻擊的那位玩家)
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      const dmg = z.update(dt, this.zctx);
      if (dmg > 0) {
        this.damagePlayer(z.target || p, dmg, z.pos);
        if (this.state !== 'playing') return;
      }
      if (!z.alive) {
        z.corpse -= dt;
        if (z.corpse <= 0) { z.dispose(); this.zombies.splice(i, 1); }
      }
    }

    this.physics.update(dt); // 物理:套用剛體姿態(布娃娃、道具、碎片)

    const hz = this.hazards.update(dt, p, this.world);
    if (hz > 0) {
      this.damagePlayer(p, hz, null);
      if (this.state !== 'playing') return;
    }

    // 配樂氣氛:最近的殭屍越近越緊張;巨屍在場時切換 boss 配樂
    let near = 99, boss = false;
    for (const z of this.zombies) if (z.alive) { near = Math.min(near, z.dist); boss ||= z.type === 'brute'; }
    sfx.setTension(Math.max(0, Math.min(1, 1 - (near - 1.5) / 12)));
    if (this.phase === 'fighting') this.setMood(boss ? 'boss' : 'fight');

    this.coins.update(dt, p);
    // 商店、掉落物、補給點、醫療包、HUD(src/game/flow.js)
    this.updateGameplay(dt);

    // 低血量心跳暗角([motion] 有 game.motion 時由它合成:邊緣壓紅 + 跟著真正的心跳聲)
    if (!this.motion) this.post.uniforms.hurt.value = p.hp < 35 ? (1 - p.hp / 35) * 0.7 + Math.sin(this.time * 6) * 0.1 : Math.max(0, 1 - (this.time - p.lastHurt) * 2) * 0.5;
  }

  render() {
    this._dsort?.tick();
    const prof = this.quality?.gpu;
    if (prof?.ext && this.composer.passes.length !== this._profN) { instrument(this, prof); this._profN = this.composer.passes.length; } // 新插入的 pass(鏡頭雨滴)也包進分段計時
    this.composer.render();
  }
}

Object.assign(Game.prototype, fxMethods, combatMethods, flowMethods, inputMethods);
