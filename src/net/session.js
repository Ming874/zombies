import * as THREE from 'three';
import { sfx, resume as resumeAudio } from '../audio.js';
import { settings } from '../ui/settings.js';
import { WEAPONS } from '../weapons/weapon.js';
import { F, BIN, NONE, W_KNIFE, W_BOOM, Writer, Reader, makeState, writeState, readState, WEAPON_IDS, PARTS, code, name } from './protocol.js';
import { Interp } from './interp.js';
import { Avatar } from './avatar.js';
import { ZombieSync } from './zsync.js';
import { CoopMode } from './coop.js';
import { PvpMode } from './pvp.js';
import { NetHud } from './hud.js';

// 多人連線的一場比賽(game.net)。
// 原則:每一端只模擬自己的玩家;房主另外模擬回合、出怪、殭屍 AI 並廣播快照;
// 打殭屍 → 命中送給房主結算;打玩家 → 命中送給被打的人(由被打的人驗證、套用防彈衣並回報死亡)。
// 與遊戲的整合點(都是明確的呼叫,不改內部流程):
//   game.update 開頭 net.update(dt)、本機玩家更新後 net.afterPlayer(dt);
//   combat:每發曳光 net.onShot(終點, 打中肉體)、丟手榴彈 net.onGrenade(起點, 速度)、對遠端玩家的傷害 net.damageRemote(p, 量, 來源, 種類)、
//           game.extraTargets(對戰時把遠端玩家的命中盒加進射線/近戰判定)、game.addNade / explode(z, fxOnly) / killFx(z, hit)。
// 其餘以「實例層級的方法包裝」掛上(hook),離開連線時全部還原,單人模式行為不變。
const INTERP_DELAY = 100; // 遠端玩家插值延遲(ms)
const SEND_MS = 50, SEND_FAST_MS = 25;
const SHOT_FAR = 70; // 太遠的遠端開火不畫特效
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const r2 = (x) => Math.round(x * 100) / 100;
const fin = (...a) => a.every((x) => typeof x === 'number' && Number.isFinite(x));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// 每發子彈(未乘部位倍率)可能的最大傷害:武器傷害 × 改裝上限 1.5;小刀背刺 154;手榴彈對人 230×0.6
function maxHit(wpn) {
  if (wpn === W_KNIFE) return 160;
  if (wpn === W_BOOM) return 140;
  const d = WEAPONS[WEAPON_IDS[wpn]];
  return d ? d.damage * 1.5 + 1 : 40;
}

// 遠端玩家:放進 game.players,讓殭屍可以追/打(§3.6 介面:pos/alive/downed/id/knock/addShake/hurt)
export class RemotePlayer {
  constructor(s, info) {
    this.s = s;
    this.id = info.id;
    this.name = info.name || `玩家${info.id + 1}`;
    this.remote = true;
    this.connected = info.conn !== false;
    this.rtt = info.rtt || 0;
    this.pos = new THREE.Vector3(s.game.world.start.x, s.game.world.start.y || 0, s.game.world.start.z);
    this.vx = 0; this.vz = 0; this.yaw = 0; this.pitch = 0;
    this.alive = false; this.up = true; this.downed = false; this.hp = 100; this.maxHp = 100; this.armor = 0;
    this.flags = 0; this.weapon = 'pistol'; this.rt = NONE; this.rp = 0;
    this.buf = new Interp(10, 40, [3], [7, 8, 9]); // x y z yaw pitch vx vz flags weapon hp
    this.sv = new Float32Array(10);
    this.st = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, flags: 0, hp: 100 };
    this.has = false;
    this.lastMsg = 0;
    this.avatar = null;
    this.stats = { kills: 0, deaths: 0, downs: 0, revives: 0, coins: 0 };
    this._shakeT = 0;
    this.bud = { t: 0, b: 0 }; // 對我造成的傷害額度(對戰驗證)
    this.zbud = { t: 0, b: 0 }; // 對殭屍的傷害額度(房主驗證)
    // 對戰模式射線/近戰用的「目標」:欄位與殭屍相同(combat 以同一套流程處理),位置 = 畫面上看到的角色位置
    this.target = {
      remote: this, type: 'player', alive: false, pos: this.pos, vel: new THREE.Vector3(), heading: 0, headH: 1.62, T: { coins: 0, radius: 0.35, mass: 1 },
      root: null, meshes: [], hitboxes: [], damage: (a, part, hit) => s.pvpHit(this, a, part, hit),
    };
  }
  hurt(amount, t, src) { return this.s.damageRemote(this, amount, src); }
  // 房主的殭屍撞擊、對戰時的爆炸:送給本人套用;合作時隊友的爆炸不推人
  knock(dx, dz, kind) {
    if (!fin(dx, dz) || (kind === 'explosion' && !this.s.pvp) || (kind !== 'explosion' && !this.s.isHost)) return;
    this.s.send('kn', [r2(dx), r2(dz)], this.id);
  }
  addShake(a) {
    if (!this.s.isHost || a < 0.08) return;
    const t = performance.now();
    if (t - this._shakeT < 200) return;
    this._shakeT = t;
    this.s.send('sh', r2(a), this.id);
  }
}

export class NetSession {
  constructor(game, client, lobby, start) {
    this.game = game;
    this.client = client;
    this.lobby = lobby;
    this.room = start.room;
    this.me = start.you;
    this.hostSlot = start.room.host;
    this.match = start.match;
    this.seed = start.seed || 1;
    this.mapId = start.mapId || null; // 房間指定的地圖(多地圖;目前只有一張)
    this.late = !!start.late;
    this.settings = start.room.settings || {};
    this.remotes = new Map();
    this.hooks = [];
    this.handlers = new Map();
    this.unsub = [];
    this.active = false;
    this.renderTime = 0;
    this.lastUpdate = 0;
    this.w = new Writer(4096);
    this.r = new Reader();
    this.out = makeState();
    this.inp = makeState();
    this.lastSend = 0;
    this.seq = 0;
    this.targets = []; // 對戰:遠端玩家命中盒(game.extraTargets)
    // 遠端位置的合理範圍:取自目前地圖的大小與樓層高度(不寫死任何一張地圖)
    const W = game.world, ys = (W.layout?.levels || []).map((l) => l.y).filter(Number.isFinite);
    this.bounds = { x1: (W.sizeX || 400) + 4, z1: (W.sizeZ || 400) + 4, y0: (ys.length ? Math.min(...ys) : -20) - 8, y1: (ys.length ? Math.max(...ys) : 40) + 16 };
    this.zs = new ZombieSync(this);
    this.mode = start.room.mode === 'pvp' ? new PvpMode(this) : new CoopMode(this);
    this.hud = new NetHud(this);
  }

  get isHost() { return this.hostSlot === this.me; }
  get pvp() { return !!this.mode.pvp; }
  myName() { return this.client.name; }
  nameOf(slot) { return slot === this.me ? this.myName() : this.remotes.get(slot)?.name ?? '?'; }

  // ---------- game.net 介面 ----------
  send(type, data, to) { return this.client.game(type, data, to); }
  on(type, fn) {
    let l = this.handlers.get(type);
    if (!l) this.handlers.set(type, (l = []));
    l.push(fn);
  }
  // 對遠端玩家造成傷害:殭屍(房主模擬)→ 送給該玩家;本機玩家的子彈/爆炸 → 合作不誤傷、對戰算 PvP 傷害
  damageRemote(p, amount, src, kind) {
    if (!p || !p.remote || !(amount > 0) || !this.active) return 0;
    const g = this.game;
    const fromZombie = kind !== 'explosion' && !!src && (src.zombie || g.zombies.some((z) => z.pos === src || z.vp === src));
    if (fromZombie) {
      if (!this.isHost || !p.alive || p.downed || !p.connected) return 0;
      this.send('hurt', [r2(Math.min(amount, 250)), fin(src.x) ? r2(src.x) : null, fin(src.z) ? r2(src.z) : null], p.id);
      return amount;
    }
    if (this.pvp && p.alive && !(p.flags & F.SHIELD)) { this.queuePvp(p.id, 0, amount, kind === 'explosion' ? W_BOOM : code(WEAPON_IDS, g.weapons.current)); return amount; }
    return 0;
  }
  // combat:每一道曳光的終點(打中肉體 = 遠端畫面噴血)
  onShot(end, flesh) { this.mode.onFire?.(); this.recordShot(end, flesh); }
  // combat:本機丟出手榴彈 → 其他人模擬同一條拋物線(只有特效)
  onGrenade(p, v) {
    if (!fin(p.x, p.y, p.z, v.x, v.y, v.z)) return;
    this.send('nd', [r2(p.x), r2(p.y), r2(p.z), r2(v.x), r2(v.y), r2(v.z), Math.round(this.client.serverNow())]);
  }

  // ---------- 生命週期 ----------
  start() {
    const g = this.game;
    this.active = true;
    g.net = this;
    g.player.id = this.me;
    g.player.name = this.myName();
    for (const p of this.room.players) if (p.id !== this.me) this.addRemote(p);
    this.install();
    this.mode.install?.();
    this.listen();
    this.hud.mount();
    // 與單人 begin() 相同的音訊準備
    resumeAudio();
    if (!g.ambientStarted) { sfx.ambient?.(); g.ambientStarted = true; }
    try { settings.apply(); } catch { /* 設定模組未就緒 */ }
    g.resetRun();
    g.state = 'playing';
    g.paused = false;
    g.weaponScene.visible = true;
    g.ui.showHud(true);
    for (const id of ['menu', 'dead', 'pause']) g.ui.overlay(id, false);
    this.mode.begin();
    this.zs.begin();
    this.startTicker();
  }

  // 背景分頁時瀏覽器會停掉 requestAnimationFrame:用 Worker 計時器(背景不太會被節流)在畫面停住時繼續跑模擬(不渲染),
  // 讓房主的殭屍/回合、本機狀態送出都不中斷。
  // 只在 rAF 停了(50ms 以上沒有更新)才補跑;以實際經過時間分段(每段 ≤ 50ms)推進,房主在背景時殭屍也照正常速度
  startTicker() {
    this.lastUpdate = performance.now();
    try {
      const src = 'let t=null;onmessage=(e)=>{clearInterval(t);t=e.data>0?setInterval(()=>postMessage(0),e.data):null;};';
      this.tickUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.ticker = new Worker(this.tickUrl);
      this.ticker.onmessage = () => {
        const now = performance.now();
        if (!this.active || !(now - this.lastUpdate >= 50)) return;
        let left = Math.min(0.25, (now - this.lastUpdate) / 1000);
        try { while (left > 1e-3 && this.active) { const dt = Math.min(0.05, left); this.game.update(dt); left -= dt; } } catch (e) { console.error('[net] 背景更新', e); }
        this.lastUpdate = now;
      };
      this.ticker.postMessage(50);
    } catch { this.ticker = null; }
  }
  stopTicker() {
    if (this.ticker) { this.ticker.postMessage(0); this.ticker.terminate(); this.ticker = null; }
    if (this.tickUrl) { URL.revokeObjectURL(this.tickUrl); this.tickUrl = null; }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._resumeT);
    const g = this.game;
    for (const off of this.unsub) off();
    this.unsub.length = 0;
    this.client.onBinary = null;
    this.mode.stop?.();
    this.stopTicker();
    this.uninstall();
    for (const rp of this.remotes.values()) this.dropRemote(rp);
    this.remotes.clear();
    g.players.length = 0;
    g.players.push(g.player);
    g.player.id = 'local';
    g.player.downed = false;
    g.player.alive = true;
    g.extraTargets = null;
    if (g.shopUIOpen) g.closeShop(false);
    g.ui.map?.close?.();
    g.net = null;
    this.zs.stop();
    this.hud.unmount();
    g.resetRun();
    for (const n of g.nades || []) g.scene.remove(n.mesh);
    if (g.nades) g.nades.length = 0;
    g.state = 'menu';
    g.paused = false;
    g.phase = 'fighting';
    g.weaponScene.visible = false;
    g.setMood?.('menu');
    g.ui.showHud(false);
  }

  // ---------- 方法包裝 ----------
  hook(obj, key, make) {
    if (!obj || typeof obj[key] !== 'function') return;
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const orig = obj[key];
    this.hooks.push([obj, key, orig, had]);
    obj[key] = make(orig);
  }
  uninstall() {
    for (let i = this.hooks.length - 1; i >= 0; i--) {
      const [obj, key, orig, had] = this.hooks[i];
      if (had) obj[key] = orig; else delete obj[key];
    }
    this.hooks.length = 0;
  }
  install() {
    const g = this.game, s = this;
    // 擊殺:代理殭屍 / 遠端玩家的擊殺 / 金幣歸屬。包在 flow 的 onKill(金幣獎勵、掉落、統計)外面:
    // 本機的擊殺照原本流程一次跑完;隊友的擊殺只留屍體(金幣與掉落在他自己的畫面生成)
    this.hook(g, 'onKill', (orig) => function (z, killer, hit) { return s.zs.onKill(z, killer, hit, orig); });
    // 代理殭屍(膿腫者)爆開只做特效與物理,傷害由房主結算
    this.hook(g, 'explode', (orig) => function (z, fxOnly) { return orig.call(this, z, fxOnly || !!(z && z._proxy)); });
    // 本機玩家死亡 → 合作:倒地;對戰:陣亡等待重生
    this.hook(g, 'die', (orig) => function () { return s.mode.onLocalDeath(orig); });
    // 只有房主出怪
    this.hook(g, 'spawnZombie', (orig) => function (...a) { return s.isHost ? orig.apply(this, a) : null; });
    this.hook(g, 'zombiesLeft', (orig) => function () { return s.isHost ? orig.call(this) : s.zs.hostLeft(); });
    // 房主的酸液彈廣播給其他人(各端各自模擬是否打中自己)
    this.origSpit = g.hazards.spit;
    this.hook(g.hazards, 'spit', (orig) => function (from, to) {
      orig.call(this, from, to);
      if (s.isHost) s.send('hz', ['s', r2(from.x), r2(from.y), r2(from.z), r2(to.x), r2(to.y), r2(to.z)]);
    });
    // 暫停選單的「回到主選單」= 離開房間
    this.hook(g, 'quitToMenu', () => function () { s.lobby.leaveRoom(); });
  }

  // ---------- 網路事件 ----------
  listen() {
    const c = this.client, g = this.game;
    const on = (t, fn) => this.unsub.push(c.on(t, fn));
    c.onBinary = (ab) => this.onBinary(ab);
    on('g', (m) => {
      const l = this.handlers.get(m.k);
      if (l) for (const fn of l) { try { fn(m.d, m.f); } catch (e) { console.error('[net]', m.k, e); } }
    });
    on('peer', (m) => this.onPeer(m.p, m));
    on('left', (m) => this.onLeft(m.id, m.why));
    on('host', (m) => this.setHost(m.id));
    on('pings', (m) => { for (const [id, rtt] of m.r) { const rp = this.remotes.get(id); if (rp) rp.rtt = rtt; else if (id === this.me) this.myRtt = rtt; } });
    on('chat', (m) => this.hud.chatLine(m.name, m.text, m.id === this.me));
    on('reconnecting', () => this.hud.reconnecting(true));
    // 重新連上:伺服器在 welcome 告訴我們座位有沒有保住(超過保留時間就結束這場);保住的話緊接著送 joined(房間現況)
    on('reconnected', (m) => {
      clearTimeout(this._resumeT);
      if (!m.resumed) { this.lobby.matchLost('重新連線失敗：座位已釋出'); return; }
      this._resumeT = setTimeout(() => { if (this.active) this.lobby.matchLost('重新連線失敗：座位已釋出'); }, 5000);
    });
    on('joined', (m) => {
      if (!m.resumed || !this.active) return;
      clearTimeout(this._resumeT);
      this.hud.reconnecting(false);
      this.onResumed(m);
    });
    on('lost', () => this.lobby.matchLost('與伺服器的連線中斷'));

    // 遊戲事件
    this.on('hurt', (d, f) => { // 殭屍攻擊(房主結算)
      if (f !== this.hostSlot || !Array.isArray(d) || !fin(d[0])) return;
      const src = fin(d[1], d[2]) ? { x: d[1], z: d[2] } : null;
      g.damagePlayer(g.player, clamp(d[0], 0, 250), src);
    });
    this.on('kn', (d, f) => {
      if (!Array.isArray(d) || !fin(d[0], d[1]) || (f !== this.hostSlot && !this.pvp)) return;
      const k = Math.hypot(d[0], d[1]), lim = 12;
      const m = k > lim ? lim / k : 1;
      g.player.knock(d[0] * m, d[1] * m);
    });
    this.on('sh', (d, f) => { if (f === this.hostSlot && fin(d)) g.player.addShake(clamp(d, 0, 1)); });
    this.on('hz', (d, f) => {
      if (f !== this.hostSlot || this.isHost || !Array.isArray(d)) return;
      if (d[0] === 's' && fin(d[1], d[2], d[3], d[4], d[5], d[6])) this.origSpit.call(g.hazards, new THREE.Vector3(d[1], d[2], d[3]), new THREE.Vector3(d[4], d[5], d[6]));
    });
    // 別人丟的手榴彈:同一條拋物線,只有特效(傷害由丟的人那一端結算);依延遲補上已經飛行的時間
    this.on('nd', (d, f) => {
      const rp = this.remotes.get(f);
      if (!rp || !Array.isArray(d) || !fin(d[0], d[1], d[2], d[3], d[4], d[5]) || Math.hypot(d[3], d[4], d[5]) > 40) return;
      if (Math.hypot(d[0] - rp.pos.x, d[2] - rp.pos.z) > 6) return;
      const late = fin(d[6]) ? clamp((this.client.serverNow() - d[6]) / 1000, 0, 0.6) : 0.1;
      g.addNade(new THREE.Vector3(d[0], d[1], d[2]), new THREE.Vector3(d[3], d[4], d[5]), { owner: rp, harmless: true, t: 0.28 + late });
    });
    this.zs.listen();
    this.mode.listen();
  }

  onResumed(m) {
    // 重連後同步房間成員(可能有人在斷線期間離開/加入)與房主
    this.setHost(m.room.host);
    const ids = new Set(m.room.players.map((p) => p.id));
    for (const rp of [...this.remotes.values()]) if (!ids.has(rp.id)) this.onLeft(rp.id, 'leave');
    for (const p of m.room.players) if (p.id !== this.me) this.onPeer(p, {});
    this.sendState(true);
  }

  onPeer(p, m) {
    if (p.id === this.me) return;
    let rp = this.remotes.get(p.id);
    if (!rp) {
      rp = this.addRemote(p);
      this.hud.feed(`${rp.name} 加入了遊戲`, 'join');
      sfx.playerJoin?.();
      if (this.isHost) this.mode.onJoin?.(rp);
      return;
    }
    const was = rp.connected;
    rp.name = p.name;
    rp.connected = p.conn !== false;
    if (rp.avatar) rp.avatar.name = rp.name;
    if (was && !rp.connected) { rp.alive = false; rp.target.alive = false; this.hud.feed(`${rp.name} 連線中斷…`, 'warn'); }
    if (!was && rp.connected) { this.hud.feed(`${rp.name} 重新連線`, 'join'); if (this.isHost) this.mode.onJoin?.(rp, true); }
  }

  onLeft(id, why) {
    const rp = this.remotes.get(id);
    if (!rp) return;
    this.hud.feed(`${rp.name} ${why === 'kick' ? '被移出房間' : why === 'timeout' ? '連線逾時' : '離開了遊戲'}`, 'leave');
    sfx.playerLeave?.();
    this.dropRemote(rp);
    this.remotes.delete(id);
    this.mode.onLeave?.(rp);
  }

  setHost(id) {
    if (id === this.hostSlot) return;
    const wasHost = this.isHost;
    this.hostSlot = id;
    this.room.host = id;
    if (this.isHost && !wasHost) {
      this.hud.feed('你成為新的房主（接手模擬殭屍與回合）', 'host');
      this.zs.becomeHost();
      this.mode.becomeHost?.();
    } else if (!this.isHost && wasHost) {
      this.zs.becomeClient();
      this.mode.becomeClient?.();
    }
    if (!this.isHost) this.hud.feed(`${this.nameOf(id)} 成為房主`, 'host');
  }

  addRemote(info) {
    const rp = new RemotePlayer(this, info);
    this.remotes.set(rp.id, rp);
    this.game.players.push(rp);
    return rp;
  }
  dropRemote(rp) {
    const g = this.game, i = g.players.indexOf(rp);
    if (i >= 0) g.players.splice(i, 1);
    for (const z of g.zombies) if (z.target === rp) z.target = null;
    if (rp.avatar) { rp.avatar.dispose(); rp.avatar = null; }
    rp.alive = false;
    rp.target.alive = false;
  }
  ensureAvatar(rp) {
    if (rp.avatar) return rp.avatar;
    const a = new Avatar(this.game.scene, { look: rp.id, name: rp.name, team: !this.pvp });
    a.onStep = (pos, sprint) => sfx.remoteStep?.(pos, this.game.world.surfaceAt ? this.game.world.surfaceAt(pos.x, pos.y, pos.z) : 'tile', sprint);
    rp.avatar = a;
    const T = rp.target;
    T.root = a.root;
    T.pos = a.root.position; // 射擊判定用畫面上看到的(插值後)位置
    // 命中盒跟著模型:寫實角色下載好、換掉程式生成的模型時也要更新
    a.onModel = () => { T.meshes = a.hits; T.hitboxes = a.hits; for (const h of a.hits) h.userData.zombie = T; };
    a.onModel();
    return a;
  }

  // ---------- 二進位訊息 ----------
  onBinary(ab) {
    if (!this.active || ab.byteLength < 4) return;
    const r = this.r.set(ab);
    const kind = r.dv.getUint8(0);
    try {
      if (kind === BIN.STATE) { if (readState(r, this.inp)) this.onState(this.inp); }
      else if (kind === BIN.ZSNAP) this.zs.onSnapshot(r);
    } catch (e) { console.warn('[net] 封包格式錯誤', e.message); }
  }

  onState(s) {
    const rp = this.remotes.get(s.slot);
    if (!rp) return;
    const B = this.bounds;
    // 驗證:位置限制在地圖範圍內(量化後本來就是有限值)
    s.x = clamp(s.x, -4, B.x1); s.z = clamp(s.z, -4, B.z1); s.y = clamp(s.y, B.y0, B.y1);
    s.pitch = clamp(s.pitch, -1.6, 1.6);
    rp.lastMsg = performance.now();
    const buf = rp.buf;
    // 瞬移(重生、傳送)或剛復活:清掉插值歷史,避免滑過去
    if (rp.has && (Math.hypot(s.x - rp.pos.x, s.z - rp.pos.z) > 4 || Math.abs(s.y - rp.pos.y) > 2.5 || ((s.flags & F.ALIVE) && !(rp.flags & F.ALIVE)))) buf.clear();
    const base = buf.pushAfterGap(s.time, 260);
    if (base >= 0) {
      const v = buf.v;
      v[base] = s.x; v[base + 1] = s.y; v[base + 2] = s.z; v[base + 3] = s.yaw; v[base + 4] = s.pitch;
      v[base + 5] = s.vx; v[base + 6] = s.vz; v[base + 7] = s.flags; v[base + 8] = s.weapon; v[base + 9] = s.hp;
    }
    rp.has = true;
    rp.pos.set(s.x, s.y, s.z);
    rp.vx = s.vx; rp.vz = s.vz; rp.yaw = s.yaw; rp.pitch = s.pitch;
    rp.flags = s.flags;
    rp.up = !!(s.flags & F.ALIVE) && !(s.flags & F.DEAD); // 依對方自己回報的狀態:活著(含倒地)
    rp.alive = rp.up && rp.connected;
    rp.downed = !!(s.flags & F.DOWNED);
    rp.hp = s.hp; rp.armor = s.armor;
    rp.weapon = name(WEAPON_IDS, s.weapon, 'pistol');
    rp.rt = s.rt; rp.rp = s.rp;
    // 開火:曳光、槍口火光、彈著
    for (let i = 0; i < s.nShots; i++) { const k = i * 4; this.remoteShot(rp, s.shots[k], s.shots[k + 1], s.shots[k + 2], s.shots[k + 3]); }
    // 打殭屍:房主結算;其他人只做受擊反應
    for (let i = 0; i < s.nZ; i++) { const k = i * 4; this.zs.onRemoteHit(rp, s.zh[k], name(PARTS, s.zh[k + 1], 'body'), s.zh[k + 2], s.zh[k + 3]); }
    // 打玩家:打到我才處理(驗證傷害上限);打到別人只噴血
    for (let i = 0; i < s.nP; i++) {
      const k = i * 4;
      if (s.ph[k] === this.me) this.mode.onPvpHit?.(rp, name(PARTS, s.ph[k + 1], 'body'), this.validPvp(rp, s.ph[k + 2], s.ph[k + 3]), s.ph[k + 3]);
    }
  }
  // 對戰傷害驗證:每發上限依武器,每位射手另有每秒額度(擋掉竄改過的封包)
  validPvp(rp, dmg, wpn) {
    if (!(dmg > 0)) return 0;
    dmg = Math.min(dmg, maxHit(wpn));
    const b = rp.bud, now = performance.now();
    b.b = Math.min(700, b.b + ((now - (b.t || now)) / 1000) * 1400);
    b.t = now;
    if (!b.init) { b.init = true; b.b = 700; }
    const d = Math.min(dmg, b.b);
    b.b -= d;
    return d;
  }

  remoteShot(rp, ex, ey, ez, flesh) {
    const a = rp.avatar, g = this.game;
    if (!a || !a.visible) return;
    a.fire();
    const from = a.muzzleWorld(_v);
    const cam = g.camera.position;
    sfx.remoteShot?.(rp.weapon, from);
    if (from.distanceTo(cam) > SHOT_FAR && Math.hypot(ex - cam.x, ey - cam.y, ez - cam.z) > SHOT_FAR) return;
    if (!g.wfx) g.initCombat();
    const to = _v2.set(ex, ey, ez);
    if (g.ballistics) g.ballistics.remote(from, to); // [physics] 子彈沿途打破的玻璃、穿過的道具(只有效果)
    const big = rp.weapon === 'barrett';
    g.wfx.tracers.add(from, to, big ? 0.012 : 0.006, big ? 0.12 : 0.07, big ? 2.2 : 1.6, big ? 1.8 : 1.25, big ? 1.4 : 0.8, big ? 900 : 600);
    const d = _v3.subVectors(to, from);
    const L = d.length();
    if (L < 1e-3) return;
    d.multiplyScalar(1 / L);
    if (flesh) {
      _n.copy(d).negate();
      g.wfx.impact(to, _n, d, 'flesh', 0.5);
      g.burst(to, _n, 'blood', 5);
    } else if (L < 139) { // 有打到東西(不是射向遠方)
      const n = g._surfaceNormal(to, d, _n);
      g.wfx.impact(to, n, d, g._surfaceMat(to, n), 0.5);
    }
    // 槍口火光照亮環境(本機沒在開火時才借用 muzzleLight,不新增光源)
    if (g.muzzleLight.intensity < 4 && from.distanceTo(cam) < 30) { g.muzzleLight.position.copy(from); g.muzzleLight.intensity = big ? 38 : 22; }
  }

  // ---------- 本機輸出 ----------
  recordShot(end, blood) {
    const s = this.out;
    if (s.nShots >= 24) return;
    const k = s.nShots++ * 4;
    s.shots[k] = end.x; s.shots[k + 1] = end.y; s.shots[k + 2] = end.z; s.shots[k + 3] = blood ? 1 : 0;
  }
  // flags:1 = 爆炸、2 = 近戰(房主用來決定斷肢與布娃娃)
  queueZHit(id, part, dmg, flags = 0) {
    const s = this.out;
    if (s.nZ >= 32) return;
    const k = s.nZ++ * 4;
    s.zh[k] = id; s.zh[k + 1] = code(PARTS, part); s.zh[k + 2] = dmg; s.zh[k + 3] = flags;
  }
  queuePvp(slot, part, dmg, wpn) {
    const s = this.out;
    if (s.nP >= 32) return;
    const k = s.nP++ * 4;
    s.ph[k] = slot; s.ph[k + 1] = typeof part === 'number' ? part : code(PARTS, part); s.ph[k + 2] = dmg; s.ph[k + 3] = wpn;
  }
  // 射擊端判定命中遠端玩家(對戰);hit = combat 的命中資訊(近戰用小刀代碼)
  pvpHit(rp, amount, part, hit) {
    if (!this.pvp || !rp.alive || (rp.flags & F.SHIELD) || this.mode.dead) return false;
    this.queuePvp(rp.id, part, amount, hit?.melee ? W_KNIFE : code(WEAPON_IDS, this.game.weapons.current));
    return false; // 擊殺由被打的人回報
  }

  sendState(force = false) {
    const g = this.game, p = g.player, s = this.out, w = g.weapons;
    const t = performance.now();
    const pending = s.nShots || s.nZ || s.nP;
    if (!force && t - this.lastSend < (pending ? SEND_FAST_MS : SEND_MS)) return;
    if (!this.client.open) return;
    this.lastSend = t;
    s.seq = (this.seq = (this.seq + 1) & 0xffff);
    s.time = Math.round(this.client.serverNow()) >>> 0;
    s.x = p.pos.x; s.y = p.pos.y; s.z = p.pos.z; s.yaw = p.yaw; s.pitch = p.pitch; s.vx = p.vx || 0; s.vz = p.vz || 0;
    const m = this.mode;
    s.flags = (p.alive !== false && !m.dead ? F.ALIVE : 0) | (p.downed ? F.DOWNED : 0) | (p.sprinting ? F.SPRINT : 0) | (w.reloading > 0 ? F.RELOAD : 0)
      | ((w.ads || 0) > 0.5 ? F.ADS : 0) | (p.flashOn ? F.LIGHT : 0) | (m.dead ? F.DEAD : 0) | (m.shieldT > 0 ? F.SHIELD : 0)
      | (m.reviving ? F.REVIVE : 0) | (g.paused ? F.MENU : 0) | (this.hud.chatOpen ? F.CHAT : 0) | (g.shopUIOpen ? F.SHOP : 0) | (m.spectating ? F.SPECTATE : 0);
    s.weapon = code(WEAPON_IDS, w.current);
    s.hp = p.hp; s.armor = p.armor || 0;
    s.rt = m.reviveSlot ?? NONE; s.rp = m.reviveP || 0;
    this.client.sendBin(writeState(this.w, s));
    s.nShots = s.nZ = s.nP = 0;
  }

  // ---------- 每幀 ----------
  update(dt) {
    if (!this.active) return;
    const now = performance.now();
    if (now > this.lastUpdate) this.lastUpdate = now;
    this.renderTime = this.client.serverNow() - INTERP_DELAY;
    for (const rp of this.remotes.values()) {
      // 斷線或很久沒有狀態:殭屍先不追(但不算陣亡,全員倒地的判定看 rp.up)
      if (rp.has && now - rp.lastMsg > 3000) rp.alive = false;
    }
    // 對戰:能被打中的遠端玩家(活著、沒有重生保護、畫面上看得到)
    const T = this.targets;
    T.length = 0;
    if (this.pvp) {
      for (const rp of this.remotes.values()) {
        const ok = !!rp.avatar && rp.alive && rp.avatar.visible && !(rp.flags & F.SHIELD);
        rp.target.alive = ok;
        rp.target.heading = rp.yaw + Math.PI;
        if (ok) T.push(rp.target);
      }
    }
    this.game.extraTargets = T.length ? T : null;
    this.zs.update(dt);
    this.mode.update(dt);
    this.hud.update(dt);
    if (this.game.state !== 'playing') this.animateRemotes(dt);
  }

  afterPlayer(dt) {
    if (!this.active) return;
    // 防呆:任何非有限值(NaN)都還原成上一個正常狀態,避免一路擴散到鏡頭/音效/網路
    const p = this.game.player;
    if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.yaw + p.pitch + (p.vx || 0) + (p.vz || 0) + (p.shake || 0))) {
      const g0 = this._good;
      if (g0) { p.pos.set(g0[0], g0[1], g0[2]); p.yaw = g0[3]; p.pitch = g0[4]; } else { const st = this.game.world.start; p.pos.set(st.x, st.y || 0, st.z); p.yaw = 0; p.pitch = 0; }
      p.vx = p.vz = 0; p.shake = 0;
      this.game.camera.position.set(p.pos.x, p.pos.y + 1.65, p.pos.z);
    } else {
      const g0 = this._good || (this._good = [0, 0, 0, 0, 0]);
      g0[0] = p.pos.x; g0[1] = p.pos.y; g0[2] = p.pos.z; g0[3] = p.yaw; g0[4] = p.pitch;
    }
    this.mode.afterPlayer(dt);
    this.animateRemotes(dt);
    this.sendState();
  }

  animateRemotes(dt) {
    const cam = this.game.camera, blink = (performance.now() / 110) | 0;
    for (const rp of this.remotes.values()) {
      if (!rp.has) { if (rp.avatar) rp.avatar.setVisible(false); continue; }
      const a = this.ensureAvatar(rp);
      const v = rp.sv;
      const r = rp.buf.sample(this.renderTime, v);
      if (r < 0) continue;
      const st = rp.st;
      // 封包晚到:用速度外插最多 120ms
      const ex = r === 1 ? Math.min(rp.buf.over, 0.12) : 0;
      st.x = v[0] + v[5] * ex; st.y = v[1]; st.z = v[2] + v[6] * ex;
      st.yaw = v[3]; st.pitch = v[4]; st.vx = v[5]; st.vz = v[6]; st.flags = v[7]; st.hp = v[9];
      if (!rp.connected) st.flags &= ~F.LIGHT;
      a.setVisible(rp.connected || (rp.flags & F.ALIVE));
      // 對戰重生保護:角色閃爍
      if (this.pvp && (rp.flags & F.SHIELD) && a.visible) a.root.visible = (blink & 1) === 0;
      a.setWeapon(name(WEAPON_IDS, v[8], 'pistol'));
      a.drawPlate(rp.hp, rp.maxHp, rp.downed, this.mode.plateExtra?.(rp) || (rp.connected ? '' : '斷線中'));
      a.update(dt, st, cam);
    }
  }
}
