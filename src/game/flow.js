import { Zombie } from '../zombies/zombie.js';
import { TYPES } from '../zombies/types.js';
import { spawnAffinity } from './waves.js'; // [zombies-w3] 新類型的出生區域偏好
import { Shop, shopTabs, purchase, modTotal } from '../shop.js';
import { Pickups, Supplies } from '../pickups.js';
import { sfx, resume as resumeAudio, ix as ixs, ghost } from '../audio.js';
import { settings } from '../ui/settings.js';
import { buildInteract } from '../interact/index.js';
import { createAmbush } from '../zombies/ambush.js';
import { createChase } from '../zombies/chase.js'; // [zombies-w3] 追逐戰
import { createNoise } from './noise.js'; // [w4] 噪音:出生點偏向最近的大噪音(game.noise)
import { roundTail } from './roundtail.js'; // [zombies-w3] 回合收尾:卡住/走不到的搬近、最後幾隻獵殺、伏擊預留放回
import { waveRoster, wavePace, waveKind, hpMul, SPECIAL, restTime, roundBonus, cleanBonus, POINTS, HOW_MUL, streakMul, streakTier, roundScore, saveBest } from './waves.js';

// 回合流程:重開、開始/結束回合、出怪、休息與商店、補給、醫療包、擊殺獎勵、計分、死亡結算。以 mixin 方式掛到 Game 上
// 難度曲線與計分數值在 src/game/waves.js
export const REST_TIME = 30; // 每回合結束後的休息(商店開放)秒數(首領回合前 40 秒,見 waves.js restTime)
const HEAL = { time: 2, amount: 50 }; // 醫療包:2 秒內回 50
const STREAK_GAP = 4; // 連殺:兩次擊殺間隔 4 秒內
// [w4 節奏] 波內的高峰與山谷(L4D 的 build-up → peak → relax):張力 ≥ PEAK 維持 PEAK_HOLD 秒 → 暫停出怪 RELAX 秒
// (場上的照打),之後補一段連發。總數不變,只改「什麼時候出」。兩次山谷之間至少隔 RELAX_COOL 秒
const PACE = { PEAK: 0.62, HOLD: 4, RELAX: [8, 15], COOL: 18, MIN_LEFT: 4 };
// [w4 反站樁] 同一個點(4m 內)站超過 CAMP_T 秒:先在身後放一個聲音預警,WARN 秒後出生點可以出在身後 14~40m(權重 ×3)
const CAMP = { R: 4, T: 40, WARN: 2.5 };
// [w4 特殊波] 停電波:只動燈具的 dim(強度;不新增燈、不動 ov/gate,鬼的閃燈與配電盤照常),這些種類保持亮著
const DARK_KEEP = new Set(['exit', 'emergency', 'candle', 'fire', 'monitor', 'lamp', 'nightlight', 'street', 'sodium', 'beacon']);
const DARK_K = 0.06, DARK_ZONE_KEEP = new Set(['f2_ward_207']); // 207 的窗(守燈)不熄
const BONUS = { head: 0.5, melee: 1 }; // 爆頭 / 近戰額外金幣(基礎金幣倍率)
const TYPE_NAME = { walker: '（建議，同 menu.js:14）活屍', runner: '快跑的', crawler: '爬的', bloater: '會爆的', brute: '巨屍' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// [N6] 一波結束時的小字:世界裡的事,不是成績(數字在暫停選單)
const QUIET = ['走廊安靜下來了', '外面只剩下雨聲', '牠們退回暗處了', '遠處有人在咳嗽', '燈篙暗下去了', '樓上的腳步停了', '風從破窗吹進來'];

export const flowMethods = {
  // 世界建構時呼叫(在 world.buildNav 之前):店面與補給點都會登記碰撞盒。位置全部來自 world(world.shop / world.supplies)。
  // 換地圖(loadMap):舊 World 還在時先 disposeGameplayWorld(),新 World 與場景建好後再呼叫這個(一樣在 buildNav 之前)
  buildGameplayWorld() { for (const _ of this.buildGameplayWorldSteps()) { /* 同步跑完 */ } },
  // [perf] 分段版:各建構之間 yield(載入時分時執行)
  *buildGameplayWorldSteps() {
    if (this.shop || this.supplies) this.disposeGameplayWorld();
    this.shop = new Shop(this.scene, this.world, { game: this, steps: true });
    yield* this.shop.steps;
    this.shop.steps = null;
    yield;
    this.supplies = new Supplies(this.scene, this.world);
    yield;
    buildInteract(this); // 互動物件與門(src/interact;碰撞盒要在 buildNav 之前)
    yield;
    if (this.pickups) { this.pickups.clear(); this.pickups.world = this.world; } // 掉落物改用新世界做貼地/撞牆
    if (this.coins) this.coins.world = this.world;
  },

  // 拆掉店面、補給櫃與地上的掉落物(各自從建立時的 World 移除碰撞盒)
  disposeGameplayWorld() {
    if (this.shopUIOpen) this.closeShop(false);
    this.shop?.dispose();
    this.supplies?.dispose();
    this.pickups?.clear();
    this.interact?.disposeMap?.();
    this.shop = this.supplies = null;
  },

  // 建構子最後呼叫一次:掉落物、按鍵、統計掛鉤、設定
  initGameplay() {
    if (this._gpInit) return;
    this._gpInit = true;
    if (!this.shop) this.buildGameplayWorld(); // 舊的建構流程沒呼叫時的保險
    this.pickups = new Pickups(this.scene, this.world);
    try { this.pickups._warm(this); } catch { /* 預先編譯掉落物 shader(載入時就做,避免第一次掉落卡頓) */ }
    this.ui.attach(this);
    settings.attach(this);
    // 射擊統計(命中率):包住 onFire,同一次開火裡出現命中標記(準心的 hit/head/kill)才算命中;霰彈任一彈丸命中即算
    const fire = this.weapons.onFire;
    this.weapons.onFire = (...a) => {
      if (this.state === 'playing') this.stats.shots++;
      this._inFire = true;
      this._shotHit = false;
      try { return fire(...a); } finally { this._inFire = false; }
    };
    const markHit = () => {
      if (this._inFire && !this._shotHit && this.state === 'playing') { this._shotHit = true; this.stats.hits++; }
    };
    this.ui.onHit = markHit; // 舊版 ui.hitMarker
    this.initCombat?.(); // 準心 HUD(combat.js)先建好,才能掛命中統計
    const ch = this.chud;
    if (ch && typeof ch.marker === 'function') {
      const mk = ch.marker.bind(ch);
      ch.marker = (...a) => { markHit(); return mk(...a); };
    }
    // 生成後套用回合血量倍率(waves.js);不改出生點挑選與生成本身(AI 模組負責)
    const spawn = this.spawnZombie;
    this.spawnZombie = (...a) => {
      const z = spawn.apply(this, a);
      if (z && !z._hpScaled) {
        z._hpScaled = true;
        const k = hpMul(this.round || 1, z.type);
        if (k !== 1) { z.maxHp = Math.round(z.maxHp * k); z.hp = z.maxHp; }
      }
      return z;
    };
    // 擊殺:在原本的 onKill(金幣、血池)之後加上獎勵、掉落與統計
    const kill = this.onKill;
    this.onKill = (...a) => { kill.apply(this, a); this.afterKill(...a); };
    // 爆炸造成的擊殺不算近戰
    for (const k of ['explode', 'explodeAt']) {
      const f = this[k];
      if (typeof f !== 'function') continue;
      this[k] = (...a) => { const prev = this._killHow; this._killHow = 'explosion'; try { return f.apply(this, a); } finally { this._killHow = prev; } };
    }
    for (const k of ['melee', 'knife', 'meleeAttack', 'stab']) {
      const f = this[k];
      if (typeof f !== 'function') continue;
      this[k] = (...a) => { const prev = this._killHow; this._killHow = 'melee'; try { return f.apply(this, a); } finally { this._killHow = prev; } };
    }
    this.noise = createNoise(this); // [w4] 要在 onFire / explode 包好之後(它再包一層)
    window.addEventListener('keydown', (e) => this.onGameplayKey(e), true); // 捕獲階段:比 input.js 先處理
    this.weaponScene.visible = false; // 標題畫面不顯示手持武器
    this.chase = createChase(this); // [zombies-w3] 追逐戰(src/zombies/chase.js)
    this.ambush = createAmbush(this); // [ambush] 埋伏/天花板掉落(src/zombies/ambush.js;場景物件在開機預編譯前就建好)
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.canvas && this.ui.map.isOpen) this.ui.map.close();
    });
  },

  resetRun() {
    for (const z of this.zombies) z.dispose();
    this.zombies.length = 0;
    this.coins.clear();
    this.clearPools();
    this.hazards.clear();
    this.pickups?.clear();
    this.supplies?.reset();
    this.shop?.setOpen(false, true);
    if (this.shopUIOpen) this.closeShop(false);
    this.physics?.reset(); // 物理:道具回原位、清掉布娃娃與碎片
    this.interact?.resetRun(); // 互動物件、門、旗標與道具歸零
    this.ambush?.reset(); // [ambush] 假屍體、格柵、血漬
    this.chase?.reset(); // [zombies-w3]
    const p = this.player, st = this.world.start;
    p.hp = p.maxHp;
    p.alive = true;
    p.downed = false;
    p.armor = p.maxArmor = 0;
    p.grenades = 0;
    p.medkits = 0;
    p.coins = 0;
    p.lastHurtFrom = null;
    if (p.place) p.place(st.x, st.y || 0, st.z, st.yaw || 0); // 位置 + 清掉速度/跳躍/蹲姿
    else { p.pos.set(st.x, st.y || 0, st.z); p.yaw = st.yaw || 0; p.pitch = 0; p.vx = p.vz = 0; }
    // 重新給武器(只剩手槍),清除改裝
    this.weapons.inv = {};
    this.weapons.mods = {};
    this.upgrades = {};
    this.weapons.give('pistol');
    this.weapons.switchTo('pistol', true);
    this.round = 0;
    this.kills = 0;
    this.phase = 'fighting';
    this.restT = 0;
    this.healT = 0;
    this.stats = { kills: 0, headshots: 0, melee: 0, shots: 0, hits: 0, time: 0, streak: 0, bestStreak: 0, lastKill: -99, earned: 0, pickups: 0, byType: {}, score: 0, clean: 0, spent: 0 };
    this.rstats = null; // 本回合統計(startRound 建立)
    this.lastRound = null; // [N6] 上一波的數字(暫停選單)
    this._fxEnd(); // [w4 特殊波] 燈回來、警鈴停
    this.noise?.reset(); // [w4] 換地圖後重新接門的事件
    this.ui.resetRun?.();
    this.ui.setCoins(0, true);
    this.ui.setScore?.(0, true);
    this.ui.setHP(p.hp, p.maxHp);
    this.ui.setArmor?.(0, 0);
  },

  setMood(m) {
    if (this.mood === m) return;
    this.mood = m;
    sfx.setMood(m);
  },

  begin() {
    resumeAudio();
    if (!this.ambientStarted) { sfx.ambient(); this.ambientStarted = true; }
    settings.apply(); // AudioContext 建立後才能套用音量
    this.resetRun();
    this.state = 'playing';
    this.paused = false;
    this.weaponScene.visible = true;
    this.motion?.onBegin?.(); // [motion] 從倒下重來:眼睛張開
    this.startRound(1);
  },

  startRound(n) {
    this.round = n;
    this.queue = waveRoster(n);
    this.toSpawn = this.queue.length;
    const P = wavePace(n);
    this.maxAlive = P.maxAlive;
    this.spawnEvery = P.interval;
    this.spawnBurst = P.burst;
    this.spawnTimer = P.delay;
    this._pace = { hot: 0, relax: 0, cool: 12, n: 0, burst: P.burst + 1 }; // [w4 節奏]
    this.phase = 'fighting';
    this.weapons.resupply();
    this._shopCloseT = 0; // 捲門:店裡沒人才拉下(updateRound 檢查);玩家在裡面就等他出來,不會被關在店裡
    if (!this._shopHasPlayer()) this.shop?.setOpen(false); else this._shopClosePending = true;
    this.supplies?.newRound();
    this.interact?.newRound();
    if (this.shopUIOpen) this.closeShop(false);
    this.clearPools();
    // 本回合統計(回合結束的小結、無傷獎勵)
    const S = this.stats;
    this.rstats = { t0: this.time, kills: S.kills, heads: S.headshots, shots: S.shots, hits: S.hits, score: S.score, earned: S.earned };
    this.ui.setRound(n);
    const kind = waveKind(n), sp = SPECIAL[kind];
    this._fxStart(kind); // [w4 特殊波] 停電 / 廣播 / 警鈴
    const tail = this.queue.includes('brute') ? ` · 巨屍 ${this.queue.filter((t) => t === 'brute').length}` : '';
    const total = this.toSpawn;
    // [motion] 橫幅、聲音、邊緣紅光同一幀;開場演出中或戰鬥 shader 還沒預熱(先不出怪)時,等到真的開始才亮
    const show = () => {
      if (this.state !== 'playing' || this.round !== n || this.phase !== 'fighting') return;
      if (sp) this.ui.banner(`第 ${n} 波`, `招魂燈亮了，活屍被叫過來了 · ${sp.name} · ${total} 隻${tail}`, 3600, sp.cls);
      else this.ui.banner(`第 ${n} 波`, `招魂燈亮了，活屍被叫過來了 · ${total} 隻${tail}`, 3000, '');
      if (sp && kind !== 'boss') this.ui.feed(`${sp.name}：${sp.sub}`, { icon: 'skull', color: sp.cls === 'gold' ? '#e8c860' : '#ff6a5a', ms: 6500 });
      sfx.roundStart();
      this.motion?.beat('on', { k: sp ? 0.62 : 0.5 });
    };
    if (this.motion) this.motion.whenReady(show); else show();
    this.ui.prompt(null);
    this.updateAmmoHud();
    this.tutorial?.('round', n);
  },

  zombiesLeft() {
    return this.toSpawn + this.zombies.filter((z) => z.alive).length;
  },

  // 出生點(type:要生的殭屍種類;通風口只給爬行者):
  //  必要:路徑可達、所有玩家都看不到(眼睛 → 出生點頭/腳兩條 3D 視線;45m 外有霧不算)、直線距離 > 14m、
  //        沿導航路徑 18~55m、不在本機玩家正後方 25m 內(不會在背後憑空冒出來)
  //  加權:同樓層 ×3 > 相鄰樓層 ×1.4 > 隔兩層;暗處 ×1.5、門後 ×1.4、通風口 ×2.2;路徑 22~42m 最好;
  //        6 秒內用過的 ×0.15(不連續從同一個洞冒出來)。太久沒有殭屍接近玩家(_calmT)時改挑近一點的(14~35m)
  //  符合的太少時依序放寬
  pickSpawn(type = 'walker', maxFd = Infinity) {
    const w = this.world, L = w.layout, now = this.time;
    const players = this.players.filter((p) => p.alive !== false && !p.downed);
    if (!players.length) players.push(this.player);
    const calm = (this._calmT || 0) > 12;
    const camp = this.campBehind?.(); // [w4 反站樁] 站樁太久:身後 14m 外可以出,而且優先(出生前已經有聲音預警)
    const nz = this.noise; nz?.prime(); // [w4 噪音] 這次挑點用的「最近最大的噪音」
    const cand = [];
    for (const s of w.spawns) {
      if (s.bad || (s.vent && type !== 'crawler')) continue;
      const sy = s.y || 0;
      let ed = Infinity, lv = 9, seen = false, behind = false, back = false;
      for (const p of players) {
        const dx = s.x - p.pos.x, dz = s.z - p.pos.z, ddy = sy - p.pos.y, hd = Math.hypot(dx, dz);
        ed = Math.min(ed, hd + Math.abs(ddy) * 2);
        lv = Math.min(lv, Math.abs(s.level - L.levelOfY(p.pos.y + 0.3)));
        if (!seen && hd + Math.abs(ddy) < 45) {
          const ey = p.pos.y + (p.eyeH || 1.6);
          seen = w.hasLineOfSight(p.pos.x, ey, p.pos.z, s.x, sy + 1.5, s.z) || w.hasLineOfSight(p.pos.x, ey, p.pos.z, s.x, sy + 0.4, s.z);
        }
        if (p === this.player && Math.abs(ddy) < 2.5 && -dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw) < -hd * 0.35) {
          if (hd < (camp ? 14 : 25)) behind = true;
          else if (camp && hd <= 40) back = true;
        }
      }
      const fd = w.flowDistance ? w.flowDistance(s.x, sy, s.z) : ed;
      cand.push({ s, ed, lv, seen, behind, back, fd });
    }
    const lo = calm ? 14 : 18, hi = calm ? 35 : 55;
    const weight = (q) => {
      let k = q.lv === 0 ? 3 : q.lv === 1 ? 1.4 : 0.35;
      if (q.s.dark) k *= 1.5;
      if (q.s.door) k *= 1.4;
      if (q.s.vent) k *= 2.2;
      k *= spawnAffinity(type, q.s, L); // [zombies-w3] 手術者在手術室、焦屍在鍋爐房…
      if (now - (q.s._used ?? -99) < 6) k *= 0.15;
      if (Number.isFinite(q.fd)) k *= q.fd < lo + 4 ? 0.7 : q.fd > (calm ? 30 : 42) ? 0.6 : 1;
      if (q.back) k *= 3; // [w4 反站樁]
      if (nz) k *= nz.spawnWeight(q.s); // [w4 噪音] 越吵的地方附近越容易出(只改權重,不改「看不到、夠遠」這些條件)
      return k;
    };
    const tiers = [
      (q) => Number.isFinite(q.fd) && !q.seen && q.ed > 14 && q.fd >= lo && q.fd <= hi && !q.behind,
      (q) => Number.isFinite(q.fd) && !q.seen && q.ed > 12 && q.fd >= 14 && q.fd <= 80 && !q.behind,
      (q) => Number.isFinite(q.fd) && !q.seen && q.ed > 10,
      (q) => !q.seen && q.ed > 8,
      (q) => q.ed > 8,
      () => true,
    ];
    for (const ok of tiers) {
      const pool = cand.filter((q) => ok(q) && !(q.fd > maxFd)); // maxFd:移動既有殭屍時只挑比牠現在更近的
      if (!pool.length) continue;
      let sum = 0;
      for (const q of pool) sum += (q.wt = weight(q));
      let r = Math.random() * sum;
      for (const q of pool) if ((r -= q.wt) <= 0) { q.s._used = now; this._lastBack = q.back; return q.s; }
      pool[0].s._used = now;
      this._lastBack = pool[0].back;
      return pool[0].s;
    }
    return maxFd < Infinity ? null : w.spawns.find((s) => !s.bad) || w.spawns[0];
  },

  spawnZombie(type = this.queue.shift() || 'walker') {
    const at = this._ambAt; // [ambush] 埋伏現身:指定位置(所有玩家都看不到的掩蔽點/天花板),不加隨機偏移
    this._lastBack = false;
    const s = at || this.pickSpawn(type);
    const j = at ? 0 : s.vent ? 0.15 : 1.1; // 出生點周圍 0.6m 內保證淨空(collision.js 檢查過)
    const pos = { x: s.x + (Math.random() - 0.5) * j, y: s.y || 0, z: s.z + (Math.random() - 0.5) * j };
    const z = new Zombie(this.scene, pos, this.round, type);
    if (s.yaw !== undefined) z.heading = s.yaw; // 從通風口爬出來:面向房內
    // 記下最後命中的部位(爆頭獎勵/統計用);不改變原本行為
    const dmg = z.damage;
    z.damage = (amount, part, ...rest) => { z._lastPart = part; z._lastHitT = this.time; return dmg.call(z, amount, part, ...rest); };
    z._born = this.time;
    z._farT = 0;
    this.zombies.push(z);
    this.toSpawn = Math.max(0, this.toSpawn - 1);
    if (this._lastBack && !at) { z.alerted = true; sfx.groan?.(type, { x: pos.x, y: pos.y + 1.4, z: pos.z }); } // [w4 反站樁] 從身後來的:出生時先叫一聲(聲音預警)
    this.ambush?.onSpawn(z); // [ambush] 部分改放到埋伏點(角落裝死 / 天花板上)
    if (type === 'brute') this.ui.banner('巨屍出現', '他會咆哮後衝鋒 · 引他撞牆再打頭', 3500, 'red');
    return z;
  },

  // 每幀:出怪、回合結束、休息倒數(取代 game.update 裡原本的出怪/回合區塊)
  // 有玩家(或隊友)站在金水商行裡面?
  _shopHasPlayer() {
    const W = this.world;
    if (!W?.zoneAt || !this.shop) return false;
    for (const p of this.players || [this.player]) { const q = p?.pos; if (q && W.zoneAt(q.x, q.y + 0.2, q.z)?.id === 'f1_store') return true; }
    return false;
  },
  _updateShopClose(dt) {
    if (!this._shopClosePending) return;
    if (this.phase !== 'fighting') { this._shopClosePending = false; return; }
    if (!this._shopHasPlayer()) { this._shopClosePending = false; this.shop?.setOpen(false); return; }
    const t0 = this._shopCloseT || 0, t = (this._shopCloseT = t0 + dt);
    if (t0 === 0 || (t0 < 8 && t >= 8)) this.ui.feed(t0 === 0 ? '對講機 · 金水伯：「少年仔，快出來！要拉鐵門了！」' : '對講機 · 金水伯：「快點啦！」', { icon: 'warn', color: '#e8b46a', ms: 4200 });
    if (t >= 20) { // 還是不出來:送到大廳,再拉下
      for (const p of this.players || [this.player]) { const q = p?.pos; if (q && p === this.player && this.world.zoneAt(q.x, q.y + 0.2, q.z)?.id === 'f1_store') { const s = this.world.layout?.start; if (s) p.place?.(s.x, s.y || 0, s.z, p.yaw); } }
      this._shopClosePending = false;
      this.shop?.setOpen(false);
    }
  },
  updateRound(dt) {
    this._updateShopClose(dt);
    // 載入後馬上開局、戰鬥 shader 還在背景預熱(main.js warmRuntime):先不出怪、不擺假屍體,最多等 12 秒
    this.spawnHeld = this.phase === 'fighting' && this.warmed === false && (this._warmHold = (this._warmHold || 0) + dt) < 12;
    this.ambush?.update(dt); // [ambush] 觸發、線索、假屍體
    this.chase?.update(dt); // [zombies-w3] 追逐戰:導演觸發、逃脫/被抓判定、各端的畫面與聲音
    if (this.phase === 'fighting') {
      let alive = 0, near = Infinity, lurk = 0; // lurk:埋伏中的(不佔同場上限,但回合要等牠們)
      for (const z of this.zombies) if (z.alive) { if (z.amb?.dormant) { lurk++; continue; } alive++; if (z.dist < near && Math.abs(z.dy || 0) < 3) near = z.dist; }
      const held = this.ambush?.reserved || 0; // [ambush] 預留給虛擬埋伏點的(還沒現身、仍算在 toSpawn 裡)
      const relax = this._updatePace(dt, near, alive, held); // [w4 節奏] 山谷:暫停出怪
      this._updateCamp(dt); // [w4 反站樁]
      this._fxTick(dt); // [w4 特殊波]
      // 壓力:太久沒有殭屍接近玩家(12m 內)→ 出怪間隔減半、出生點挑近一點、遠處閒晃的殭屍移近(長回合不會冷場);山谷裡不算
      this._calmT = near < 12 || relax ? 0 : (this._calmT || 0) + dt;
      this.spawnTimer -= dt * (this._calmT > 8 ? 2 : 1);
      if (!this.spawnHeld && !relax && this.toSpawn > held && alive < this.maxAlive && this.spawnTimer <= 0) {
        if (this.spawnZombie()) alive++; // 這一幀剛出的也算活著(否則最後一隻出生的那一幀會誤判清場)
        if (this.spawnBurst > 0) { this.spawnBurst--; this.spawnTimer = 0.45; } else this.spawnTimer = this.spawnEvery * (0.7 + Math.random() * 0.6);
      }
      this._relocateStragglers(dt);
      roundTail(this, dt, alive, lurk, held); // [zombies-w3]
      if (alive === 0 && this.toSpawn <= held) { if ((lurk || held) && this.ambush) this.ambush.hunt(); else this.endRound(); } // 只剩預留/裝死的:收尾(放回佇列、起身),回合不會卡住
    } else if (this.phase === 'collecting') {
      this.collectT -= dt;
      if (this.collectT <= 0 && !this.coins.collecting) this.openRest();
    } else if (this.phase === 'shop' || this.phase === 'break') {
      if (this.net) { // [net] 多人:休息倒數與開始下一回合由連線層控制(g.breakTimer),這裡只同步顯示
        if (Number.isFinite(this.breakTimer)) this.restT = Math.max(0, this.breakTimer - 0.5);
        return;
      }
      const prev = Math.ceil(this.restT);
      this.restT -= dt;
      const now = Math.ceil(this.restT);
      if (now !== prev && now <= 5 && now > 0) sfx.countdown(now);
      if (this.restT <= 0) this.nextRound();
    }
  },

  // ---------- [w4 特殊波] 每個端都跑(燈與聲音是本機的;多人時客戶端在 'rs' 也會呼叫 startRound),出怪仍由房主決定 ----------
  _fxStart(kind) {
    this._fxEnd();
    if (!kind || kind === 'boss' || kind === 'rush' || kind === 'swarm') return;
    const fx = (this._fx = { kind, t: 0, lis: new Set(), q: [], dimmed: [], li: -1, liT: 0, pulse: 3 });
    if (kind === 'dark') { ghost?.breaker?.(this._ear(0, 4)); sfx.pa?.('down'); this._fxDarken(this._liOf(this.player.pos), true); }
    else if (kind === 'pa') { const st = this.world.start; fx.at = { x: st.x, y: (st.y || 0) + 3.2, z: st.z }; sfx.pa?.('up'); }
    else if (kind === 'alarm') { const s = this._fxFar(); fx.at = s ? { x: s.x, y: (s.y || 0) + 2.2, z: s.z } : this._ear(0, 20); ixs.alarmStart?.('wave-alarm', fx.at); }
  },
  _fxTick(dt) {
    const fx = this._fx;
    if (!fx) return;
    fx.t += dt;
    if (fx.kind === 'dark') {
      // 換樓層 3 秒後,那一層也熄(停電跟著你,不能上樓躲);一幀最多熄 6 盞(一盞一盞暗下去)
      const li = this._liOf(this.player.pos);
      if (li !== fx.li) { fx.li = li; fx.liT = 0; } else if (!fx.lis.has(li) && (fx.liT += dt) > 3) this._fxDarken(li);
      for (let k = 0; k < 6 && fx.q.length; k++) { const f = fx.q.pop(); if (f._bo === undefined) { f._bo = f.dim; f.dim = f._bo * DARK_K; fx.dimmed.push(f); } }
      return;
    }
    // 廣播 / 警鈴:每隔幾秒在喇叭或警鈴那裡發出大噪音 → 出生點偏向那裡(src/game/noise.js;追擊照舊全知)
    if ((fx.pulse -= dt) > 0) return;
    fx.pulse = fx.kind === 'pa' ? 9 : 6;
    this.noise?.emit?.(fx.at, fx.kind === 'pa' ? 60 : 50, fx.kind);
    if (fx.kind === 'pa' && fx.t > 4 && Math.random() < 0.5) sfx.pa?.(Math.random() < 0.5 ? 'up' : 'alert');
  },
  _fxEnd() {
    const fx = this._fx;
    if (!fx) return;
    this._fx = null;
    for (const f of fx.dimmed) if (f._bo !== undefined) { f.dim = f._bo; f._bo = undefined; }
    if (fx.kind === 'alarm') ixs.alarmStop?.('wave-alarm');
    if (fx.kind === 'dark' && fx.dimmed.length) ghost?.breaker?.(this._ear(0, 4));
  },
  _fxDarken(li, now = false) {
    const fx = this._fx, F = this.hospital?.lights?.fixtures;
    if (!fx || !F || li < 0 || fx.lis.has(li)) return;
    fx.lis.add(li);
    const p = this.player.pos, list = F.filter((f) => f.li === li && !f.ext && !f.link && !DARK_KEEP.has(f.kind) && !DARK_ZONE_KEEP.has(f.zone?.id) && f._bo === undefined);
    list.sort((a, b) => ((b.x - p.x) ** 2 + (b.z - p.z) ** 2) - ((a.x - p.x) ** 2 + (a.z - p.z) ** 2)); // pop() 從最近的開始熄
    fx.q.push(...list);
    if (!now) ghost?.breaker?.(this._ear(0, 6));
  },
  _liOf(pos) { return this.world.layout?.levelOfY ? this.world.layout.levelOfY(pos.y + 0.3) : 0; },
  _ear(dy, d) { const p = this.player.pos, a = this.player.yaw || 0; return { x: p.x + Math.sin(a) * d, y: p.y + 1.6 + dy, z: p.z + Math.cos(a) * d }; }, // 身後 d 公尺
  _fxFar() { // 警鈴:同一層、路徑 25~50m 的出生點(看不到的地方響)
    const p = this.player.pos, li = this._liOf(p), W = this.world;
    const c = W.spawns.filter((s) => !s.bad && !s.vent && s.level === li && Math.hypot(s.x - p.x, s.z - p.z) > 22);
    const far = c.filter((s) => { const fd = W.flowDistance?.(s.x, s.y || 0, s.z); return fd > 25 && fd < 50; });
    const L = far.length ? far : c;
    return L.length ? L[(Math.random() * L.length) | 0] : null;
  },

  // [w4 節奏] 張力:單人/房主本機導演的 tension(唯讀),再和「全隊最近的殭屍距離 + 場上數量」取大(合作時隊友被包圍也算)。
  // 回傳這一幀是不是山谷(不出怪)
  _updatePace(dt, near, alive, held) {
    const pc = this._pace;
    if (!pc) return false;
    if (pc.relax > 0) {
      pc.relax -= dt;
      if (pc.relax > 0) return true;
      pc.cool = PACE.COOL; // 山谷結束:補一段連發(下一段)
      this.spawnBurst = Math.max(this.spawnBurst, pc.burst);
      this.spawnTimer = Math.min(this.spawnTimer, 0.6);
      return false;
    }
    if (pc.cool > 0) { pc.cool -= dt; return false; }
    if (this.spawnHeld || this.toSpawn - held < PACE.MIN_LEFT) { pc.hot = 0; return false; } // 最後幾隻不放山谷(收尾規則接手)
    const team = Math.max(0, Math.min(1, 1 - (near - 2) / 14)) * 0.75 + Math.min(1, alive / 10) * 0.15;
    const ten = Math.max(this.horror?.director?.tension || 0, team);
    pc.hot = ten >= PACE.PEAK ? pc.hot + dt : Math.max(0, pc.hot - dt * 0.5);
    if (pc.hot < PACE.HOLD) return false;
    pc.hot = 0; pc.n++;
    pc.relax = PACE.RELAX[0] + Math.random() * (PACE.RELAX[1] - PACE.RELAX[0]);
    return true;
  },
  // [w4 反站樁] 只看本機玩家(單人/房主;合作時隊友的站樁不追,寫在報告裡)
  _updateCamp(dt) {
    const c = this._camp || (this._camp = { x: 0, y: 0, z: 0, t: 0, on: false, armT: 0, acc: 0, warnT: -99 });
    if ((c.acc += dt) < 1) return;
    c.acc = 0;
    const p = this.player.pos;
    if (Math.hypot(p.x - c.x, p.z - c.z) > CAMP.R || Math.abs(p.y - c.y) > 1.5) { c.x = p.x; c.y = p.y; c.z = p.z; c.t = 0; c.on = false; return; }
    c.t += 1;
    if (c.t < CAMP.T || c.on) return;
    c.on = true; c.armT = this.time + CAMP.WARN; // 預警:身後 18m 左右有東西在叫,再過幾秒才會真的從那邊來
    const yaw = this.player.yaw || 0, bx = p.x + Math.sin(yaw) * 18, bz = p.z + Math.cos(yaw) * 18;
    sfx.groan?.('walker', { x: bx, y: p.y + 1.4, z: bz });
    c.warnT = this.time;
  },
  campBehind() { const c = this._camp; return !!(c?.on && this.phase === 'fighting' && this.time >= c.armT); },

  // 離所有玩家太遠的殭屍(卡住的由殭屍自己處理):沒人看得到一段時間後移到較近的隱蔽出生點(大地圖保持節奏);
  // 冷場(_calmT > 15 秒)時最遠的那隻馬上移近
  _relocateStragglers(dt) {
    const w = this.world;
    this._strT = (this._strT || 0) - dt;
    if (this._strT > 0) return;
    this._strT = 1;
    let far0 = null, fd0 = 30;
    for (const z of this.zombies) {
      if (!z.alive || z._proxy || z.amb) continue; // [ambush] 埋伏中的由 ambush 自己搬
      const fd = w.flowDistance ? w.flowDistance(z.pos.x, z.pos.y, z.pos.z) : z.dist;
      const reach = Number.isFinite(fd);
      if (z.type === 'brute' && reach) continue; // 巨屍只有走不到時才移
      const far = !reach || fd > 55;
      z._farT = far && !z.los ? (z._farT || 0) + 1 : 0;
      if (reach && fd > fd0 && !z.los && this.time - z._born > 8) { fd0 = fd; far0 = z; }
      if (z._farT >= (reach ? 20 : 6) && this.time - z._born > 10 && (z._warp ? z._warp(this.zctx, false, reach ? fd - 12 : Infinity) : true)) { z._farT = 0; z._born = this.time; }
    }
    if (far0 && (this._calmT || 0) > 15 && far0._warp && far0._warp(this.zctx, false, fd0 - 12)) { far0._born = this.time; this._calmT = 8; }
  },

  endRound() {
    this._fxEnd();
    this.phase = 'collecting';
    this.collectT = 1.4;
    const n = this.round, p = this.player, S = this.stats, R = this.rstats;
    // 回合小結:擊殺、爆頭、命中率、用時;整回合沒受傷 → 無傷獎勵。
    // [N6] 山谷不講分數:橫幅只說世界裡發生的事;數字收進 this.lastRound,暫停選單(menu.js onPause)與結算畫面才看得到
    this.roundClean = !!R && !(p.lastHurt >= R.t0);
    if (R) {
      const k = S.kills - R.kills, h = S.headshots - R.heads, sh = S.shots - R.shots, acc = sh ? Math.round(((S.hits - R.hits) / sh) * 100) : 0;
      R.dur = this.time - R.t0;
      this.lastRound = { n, kills: k, heads: h, acc, dur: R.dur, time: mmss(R.dur), clean: this.roundClean, bonus: 0, cleanBonus: 0 };
    }
    this.ui.banner('招魂燈熄了', QUIET[(n - 1) % QUIET.length], 3200, '');
    // 回合分數
    const pts = roundScore(n, this.roundClean);
    this._addScore(pts);
    this.setMood('break');
    sfx.roundEnd();
    this.motion?.beat('off'); // [motion] 世界吐一口氣:暗角放開、紅退掉
    p.hp = Math.min(p.maxHp, p.hp + 20);
    this.ui.setHP(p.hp, p.maxHp);
    this.coins.collectAll();
    this.pickups?.collectAll?.(this); // 地上用得到的彈匣/醫療包也一起收
  },

  // 休息時間:商店捲門拉起、補給站開放;發回合獎勵
  openRest() {
    if (this.state !== 'playing') return;
    const n = this.round;
    this.phase = 'shop';
    this.restT = restTime(n + 1);
    this.setMood('shop');
    this.shop?.setOpen(true);
    if (!this.ui.shop.game) this.ui.shop.game = this;
    this.ui.shop.warm?.(); // [motion] 商店預覽的 context 與 shader 先在背景準備好(第一次開店不卡)
    const bonus = roundBonus(n);
    const clean = this.roundClean ? cleanBonus(n) : 0;
    this.player.coins += bonus + clean;
    this.stats.earned += bonus + clean;
    if (clean) this.stats.clean++;
    this.ui.setCoins(this.player.coins);
    this.ui.coinGain(bonus + clean); // 錢包旁邊小小跳一下;清場/無傷的明細只在暫停選單(lastRound)
    if (this.lastRound?.n === n) { this.lastRound.bonus = bonus; this.lastRound.cleanBonus = clean; }
    const where = [this.shop?.levelId, this.shop?.zoneName].filter(Boolean).join(' ') || '金水商行';
    const next = waveKind(n + 1), sp = SPECIAL[next];
    // 順序:捲門聲 → 劇情的歌與對講機 → 最後才是這行小字(休息秒數與 [N] 在 HUD 的回合欄一直看得到)
    this.ui.banner('鐵門拉起來了', `金水伯在 ${where} 等你${sp ? ` · 下一波：${sp.name}` : ''}`, 4200, '');
    this.tutorial?.('shop');
  },

  // ---------- 商店 ----------
  openShop() {
    if (this.shopUIOpen || !this.shop?.open || this.state !== 'playing') return;
    this.shopUIOpen = true;
    this.input.fireHeld = false;
    this.ui.prompt(null);
    this.ui.shop.open(this);
    if (document.pointerLockElement) document.exitPointerLock();
    sfx.shopOpen();
  },

  closeShop(relock = true) {
    if (!this.shopUIOpen) return;
    this.shopUIOpen = false;
    this.ui.shop.close();
    sfx.shopClose();
    if (relock && this.state === 'playing') {
      try { const r = this.canvas.requestPointerLock(); if (r?.catch) r.catch(() => {}); } catch { /* 需要使用者手勢 */ }
    }
  },

  shopTabs() { return shopTabs(this); },

  // 購買(UI 呼叫,傳商品或商品 key);回傳 purchase 的結果並處理音效與 HUD
  buy(item) {
    const r = purchase(this, item);
    if (r.ok) {
      if (r.equip) sfx.switch();
      else {
        sfx.cashRegister();
        if (r.sound === 'upgrade') sfx.upgrade();
        else if (r.sound === 'armor') sfx.armorEquip();
        else if (r.sound === 'ammo') sfx.pickupAmmo();
        else if (r.sound === 'heal') sfx.heal();
        else if (r.sound === 'item') sfx.pickupItem();
        else sfx.buy();
        this.ui.spend?.(r.price);
      }
      this.ui.setCoins(this.player.coins);
      this.ui.setHP(this.player.hp, this.player.maxHp);
      this.ui.setArmor?.(this.player.armor, this.player.maxArmor);
      this.updateAmmoHud();
    } else sfx.deny();
    return r;
  },

  nextRound() {
    if (this.state !== 'playing' || (this.phase !== 'shop' && this.phase !== 'break')) return;
    if (this.shopUIOpen) this.closeShop();
    this.startRound(this.round + 1);
  },

  // ---------- 醫療包(H) ----------
  useMedkit() {
    const p = this.player;
    if (this.state !== 'playing' || this.healT > 0 || p.hp <= 0 || p.downed) return false;
    if (!(p.medkits > 0)) { this.ui.pickup('沒有醫療包', '#a3a39a'); sfx.pickupDeny(); return false; }
    if (p.hp >= p.maxHp) { this.ui.pickup('生命已滿', '#a3a39a'); sfx.pickupDeny(); return false; }
    p.medkits--;
    this.healT = HEAL.time;
    this.healLeft = HEAL.amount;
    sfx.heal();
    return true;
  },

  _updateHeal(dt) {
    if (!(this.healT > 0)) { this.ui.healing(null); return; }
    const p = this.player;
    const step = Math.min(this.healLeft, (HEAL.amount / HEAL.time) * dt);
    this.healLeft -= step;
    this.healT -= dt;
    p.hp = Math.min(p.maxHp, p.hp + step);
    this.ui.setHP(p.hp, p.maxHp);
    this.ui.healing(1 - Math.max(0, this.healT) / HEAL.time);
    // 治療中放下武器、不能射擊
    const w = this.weapons;
    if (typeof w.raise === 'number') w.raise = Math.max(w.raise, 0.9);
    this.input.fireHeld = false;
    this.input.firePressed = false;
    if (this.healT <= 0 || p.hp >= p.maxHp) {
      this.healT = 0;
      this.ui.healing(null);
      this.ui.pickup(`治療完成 · 生命 ${Math.ceil(p.hp)}`, '#7dffae', { icon: 'heal', panel: 'health' });
    }
  },

  // ---------- 擊殺獎勵 ----------
  // 第三個參數:'melee'/'explosion' 字串,或 onKill 的命中資料(物理布娃娃用的 { point, dir, force, melee } / { blast })
  afterKill(z, killer = this.player, hit = null) {
    if (killer && killer !== this.player) return; // 隊友的擊殺由連線層處理
    let how = typeof hit === 'string' ? hit : hit?.melee ? 'melee' : hit?.blast ? 'explosion' : null;
    how = how || this._killHow || (z._lastPart === 'melee' ? 'melee' : null);
    const near = Math.hypot(z.pos.x - this.player.pos.x, z.pos.z - this.player.pos.z) < 2.6;
    if (!how && near && this.weapons.sinceShot > 0.35) how = 'melee'; // 沒開槍的近距離擊殺 = 近戰
    const head = how !== 'explosion' && how !== 'melee' && z._lastPart === 'head';
    const base = z.T?.coins ?? TYPES[z.type]?.coins ?? 5;
    const bonus = Math.round(base * ((head ? BONUS.head : 0) + (how === 'melee' ? BONUS.melee : 0)));
    if (bonus > 0) this.coins.drop(z.pos.x, z.pos.y, z.pos.z, bonus);
    const S = this.stats;
    S.kills++;
    if (head) S.headshots++;
    if (how === 'melee') S.melee++;
    S.earned += base + bonus;
    S.byType[z.type] = (S.byType[z.type] || 0) + 1;
    S.streak = this.time - S.lastKill <= STREAK_GAP ? S.streak + 1 : 1;
    S.lastKill = this.time;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    // 分數:類型基本分 × 爆頭/近戰/爆炸 × 連殺倍率
    const mul = streakMul(S.streak) * (head ? HOW_MUL.head : how === 'melee' ? HOW_MUL.melee : how === 'explosion' ? HOW_MUL.explosion : 1);
    this._addScore(Math.round((POINTS[z.type] || 100) * mul));
    const tag = how === 'melee' ? '近戰' : head ? '爆頭' : how === 'explosion' ? '爆炸' : '';
    this.ui.killPop(base + bonus, tag, how === 'melee' ? 'melee' : head ? 'head' : '');
    this.ui.streak?.(S.streak >= 5 ? S.streak : 0, streakMul(S.streak), STREAK_GAP, this.time); // [N6] 連殺計數只在 5 隻以上才亮(倍率照算)
    const name = TYPES[z.type]?.name || TYPE_NAME[z.type] || '殭屍';
    const tier = streakTier(S.streak);
    if (z.type === 'brute' || how === 'melee' || (head && z.type === 'bloater')) { // 一般爆頭只在準心旁跳字,不洗訊息列
      this.ui.feed(`${tag ? `${tag} · ` : ''}擊殺 ${name} <b>+${base + bonus}</b>`, { icon: how === 'melee' ? 'knife' : head ? 'head' : 'skull', color: z.type === 'brute' ? '#ff6a5a' : head ? '#ff9a6a' : '#e8e3d6', html: true });
    }
    if (tier) { // 連殺門檻:金幣獎勵(掉在屍體上,回合結束一起收);[N6] 字幕很少、很淡,沒有稱號(waves.js STREAKS)
      const [, label, coins] = tier;
      if (coins > 0) { this.coins.drop(z.pos.x, z.pos.y, z.pos.z, coins); S.earned += coins; }
      if (label) this.ui.feed(label, { color: '#a8a294', ms: 2400 });
    }
    this.pickups?.roll(z, this);
  },

  // 加分(HUD 跳動)
  _addScore(n) {
    if (!(n > 0)) return;
    this.stats.score += n;
    this.ui.setScore?.(this.stats.score);
  },

  // ---------- 按鍵(E 互動、N 下一回合、H 醫療包、M 地圖) ----------
  onGameplayKey(e) {
    if (this.state !== 'playing') return;
    if (this.shopUIOpen) { // 商店介面吃掉所有按鍵
      e.stopPropagation();
      if (!e.repeat || /Arrow/.test(e.code)) this.ui.shop.onKey(e);
      return;
    }
    if (this.ui.map.isOpen) {
      if (['KeyM', 'Escape', 'PageUp', 'PageDown', 'Tab'].includes(e.code)) {
        e.stopPropagation();
        e.preventDefault();
        if (e.code === 'PageUp') this.ui.map.floor(1);
        else if (e.code === 'PageDown') this.ui.map.floor(-1);
        else this.ui.map.close();
        return;
      }
    }
    if (this.paused || e.repeat) return;
    switch (e.code) {
      case 'KeyE': {
        this.player.keys.KeyE = true; // [net] 合作模式按住 E 救援隊友要讀這個(放開時 input.js 的 keyup 會清掉)
        e.stopPropagation();
        if (this.interact?.press()) return; // 互動物件(看著的電話、門、開關…;與商店/補給櫃的優先順序在 interact.pick)
        const s = this.shop?.interact(this.player);
        if (s === 'open') { this.openShop(); return; }
        if (s === 'closed') { this.ui.pickup('金水商行只在休息時間開門（打完這一波）', '#a3a39a'); sfx.pickupDeny(); return; }
        const st = this.supplies?.nearest(this.player);
        if (st) this.supplies.use(st, this);
        return;
      }
      case 'KeyN':
        if (this.net) return; // [net] 多人:N = 準備/取消準備,由連線模組自己的按鍵處理(這裡再呼叫一次會互相抵銷)
        e.stopPropagation();
        this.nextRound();
        return;
      case 'KeyH':
        this.useMedkit();
        return;
      case 'KeyM':
        e.preventDefault();
        this.ui.map.open(this);
        return;
      default:
    }
  },

  // 標題畫面/死亡畫面:鏡頭緩慢飄移(game.update 在非遊戲狀態時呼叫)
  updateIdle(dt) {
    if (this.state === 'playing') return;
    this._idleT = (this._idleT || 0) + dt;
    const t = this._idleT, cam = this.camera, st = this.world.start, p = this.player;
    if (this.state === 'menu') {
      cam.position.set(st.x + Math.sin(t * 0.05) * 0.35, (st.y || 0) + 1.65 + Math.sin(t * 0.37) * 0.025, st.z + Math.cos(t * 0.04) * 0.25);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(0.06 + Math.sin(t * 0.11) * 0.035, (st.yaw || 0) + Math.sin(t * 0.07) * 0.28, Math.sin(t * 0.13) * 0.012);
    } else if (this.state === 'dead') { // 倒在地上慢慢往旁邊傾
      const k = Math.min(1, t / 1.2);
      cam.position.y += ((p.pos.y || 0) + 0.35 - cam.position.y) * Math.min(1, dt * 2.5);
      cam.rotation.z += (0.9 * k - cam.rotation.z) * Math.min(1, dt * 2);
    }
  },

  // ---------- 新手提示(src/ui/tips.js;每張只出現一次) ----------
  tutorial(id, n) {
    const T = this.ui.tips;
    if (!T || this.state !== 'playing') return;
    if (id === 'round') {
      if (n === 1) { T.show('move', 1.5); T.show('lantern', 9); T.show('shoot', 4); }
      else if (n === 2) T.show('map', 5);
    } else T.show(id, id === 'shop' ? 2.5 : 0);
  },
  // 每 0.5 秒檢查一次情境(都是便宜的判斷)
  updateTutorial(dt) {
    const T = this.ui.tips;
    if (!T?.enabled || (this._tutT = (this._tutT || 0) - dt) > 0) return;
    this._tutT = 0.5;
    const p = this.player, w = this.weapons;
    const cap = w.magSize || 1;
    if (w.ammo && w.ammo.mag <= Math.max(1, Math.floor(cap * 0.25)) && !(w.reloading > 0)) T.show('reload');
    if (this.pickups?.items.some((it) => it.state === 'idle')) T.show('drop', 1);
    if ((p.grenades || 0) > 0) T.show('grenade');
    if ((p.medkits || 0) > 0) T.show('medkit');
    if (p.hp > 0 && p.hp < p.maxHp * 0.4) T.show('lowhp');
    if (p.exhausted) T.show('stamina');
    if (this.supplies?.nearest(p)) T.show('supply');
    for (const z of this.zombies) {
      if (!z.alive || !(z.dist < 18)) continue;
      if (z.type === 'brute') T.show('brute');
      else if (z.type === 'bloater') T.show('bloater');
      else if (z.los && z.dist < 14 && this.round >= 1) T.show('head', 0.5);
    }
  },

  // ---------- 每幀(game.update 在暫停檢查之後呼叫) ----------
  updateGameplay(dt) {
    const p = this.player;
    this.stats.time += dt;
    this.updateTutorial(dt);
    this._updateHeal(dt);
    this.interact?.update(dt);
    this.pickups?.update(dt, this);
    this.supplies?.update(dt, this);
    this.shop?.update(dt, this.time, p);
    // 互動提示
    let prompt = null, dim = false;
    const ix = this.interact?.pick();
    if (ix) ({ text: prompt, dim } = ix);
    else if (!(this.healT > 0)) {
      const s = this.shop?.interact(p);
      if (s === 'open') prompt = '按 [E] 進金水商行';
      else if (s === 'closed') { prompt = '金水商行 · 打完這一波才開門'; dim = true; }
      else {
        const st = this.supplies?.nearest(p);
        if (st) ({ text: prompt, dim } = this.supplies.promptFor(st, p));
      }
    }
    this.ui.prompt(prompt, dim);
    // 回合資訊
    if (this.phase === 'fighting') { if (this.spawnHeld) this.ui.setRoundText('招魂燈還沒亮……'); else this.ui.setZombies(this.zombiesLeft()); } // [motion] 預熱中先不出怪:不要說謊
    else if (this.phase === 'shop' || this.phase === 'break') this.ui.setRest(this.restT, !this.net, SPECIAL[waveKind(this.round + 1)]?.name || '');
    else if (this.phase === 'collecting') this.ui.setRoundText('招魂燈熄了');
    this.ui.update(this, dt);
  },

  updateAmmoHud() {
    const w = this.weapons;
    const cap = typeof w.stat === 'function' ? Math.round(w.stat(w.current, 'mag')) : Math.round(w.def.mag * (w.mods?.[w.current]?.mag ?? 1));
    const prev = this._ammoLow;
    this.ui.setAmmo(w.def.name, w.ammo.mag, w.ammo.reserve, w.reloading > 0, cap, modTotal(this, w.current));
    const low = w.ammo.mag <= Math.max(1, Math.floor(cap * 0.25)) && w.ammo.mag > 0;
    if (low && !prev && this.state === 'playing') sfx.lowAmmo();
    this._ammoLow = low;
  },

  die() {
    this.state = 'dead';
    this.weaponScene.visible = false;
    this.player.alive = false;
    this.healT = 0;
    this.setMood('dead');
    if (this.shopUIOpen) this.closeShop(false);
    this.ui.map.close();
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.fireHeld = false;
    this._idleT = 0;
    this.ui.tips?.clearQueue();
    const sum = this.deathSummary();
    if (this.motion?.death) this.motion.death(() => { if (this.state === 'dead') this.ui.showDeath(sum); }); // [motion] 倒下的 1.8 秒:褪色、眼皮闔上,然後結算卡
    else this.ui.showDeath(sum);
  },

  deathSummary() {
    const S = this.stats;
    const run = {
      round: this.round, kills: S.kills, headshots: S.headshots, melee: S.melee, score: S.score, clean: S.clean,
      accuracy: S.shots ? S.hits / S.shots : 0, shots: S.shots, hits: S.hits, time: S.time, bestStreak: S.bestStreak, streak: S.bestStreak, earned: S.earned, byType: S.byType, pickups: S.pickups || 0,
    };
    // 本機最佳紀錄(多人模式不記)
    if (!this.net) Object.assign(run, saveBest(run, this.mapId)); // mapId:多地圖時各地圖分開記(未設定 = 共用)
    return run;
  },

  // 回主選單
  quitToMenu() {
    if (this.shopUIOpen) this.closeShop(false);
    this.ui.map.close();
    this.resetRun();
    this.state = 'menu';
    this.paused = false;
    this.weaponScene.visible = false;
    this.setMood('menu');
    this.ui.showHud(false);
    this.ui.overlay('pause', false);
    this.ui.overlay('dead', false);
    this.ui.overlay('menu', true);
    this.motion?.toMenu?.(); // [motion] 監視器重新開機
    if (document.pointerLockElement) document.exitPointerLock();
  },
};
