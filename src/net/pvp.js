import * as THREE from 'three';
import { sfx } from '../audio.js';
import { WEAPONS, ORDER } from '../weapons/weapon.js';
import { WEAPON_IDS, NONE, W_KNIFE, W_BOOM, name } from './protocol.js';

// 對戰死鬥:每人各自為戰。射擊端判定命中 → 被打的人驗證/套用傷害 → 死亡時廣播 'dead'(擊殺者、武器、爆頭)。
// 房主統計比分並廣播('ps'),先到擊殺上限或時間到就結束('pe')。陣亡 4 秒後在離敵人最遠的出生點重生,重生後 2 秒無敵(開槍就解除)。
// 武器與商店規則:沒有回合、金幣與商店(商店不開門、殭屍不掉落物品);每次出生選一把主武器(6 把全開放),
// 另外固定配手槍與 1 顆手榴彈;補給點(彈藥/醫療)每條命可用一次。可選「殭屍騷擾」:房主持續產生少量殭屍攻擊所有人。
const WARMUP = 6, RESPAWN = 4, SHIELD = 2;
const PREF = 'hz.pvpPrimary';
const _v = new THREE.Vector3();
const WNAME = (w) => (w === 'knife' ? '小刀' : w === 'grenade' ? '手榴彈' : WEAPONS[w]?.name || '');

function rngSeed(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class PvpMode {
  constructor(s) {
    this.s = s;
    this.g = s.game;
    this.pvp = true;
    this.scores = new Map(); // slot → {k, d}
    this.endAt = 0;
    this.dead = false;
    this.spectating = false;
    this.respawnT = 0;
    this.shieldT = 0;
    this.warmup = WARMUP;
    this.lastAttacker = null;
    this.killer = null;
    this.over = false;
    this.zT = 4;
    this.reviveSlot = NONE;
    this.reviveP = 0;
    this.reviving = false;
    let pref = null;
    try { pref = localStorage.getItem(PREF); } catch { /* 忽略 */ }
    this.primary = WEAPONS[pref] ? pref : (WEAPONS.m4a1 ? 'm4a1' : ORDER[ORDER.length - 1]);
    this.limit = s.settings.kills || 20;
    this.minutes = s.settings.minutes || 8;
  }

  weapons() { return WEAPON_IDS.filter((id) => WEAPONS[id]); }

  install() {
    const s = this.s, g = this.g;
    s.hook(g.coins, 'drop', () => () => null); // 對戰不掉金幣
    s.hook(g, 'startRound', () => () => {}); // 沒有回合
    s.hook(g, 'endRound', () => () => {});
    s.hook(g, 'nextRound', () => () => {});
    s.hook(g, 'openRest', () => () => {});
    s.hook(g, 'openShop', () => () => {}); // 對戰沒有商店
    if (g.shop) s.hook(g.shop, 'interact', () => () => null); // 商店櫃台不顯示「休息時間開放」的提示
    // 選武器:陣亡/暖身時按數字鍵
    this.onKey = (e) => {
      if (!s.hud.pickerOpen || s.hud.chatOpen) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const id = this.weapons()[Number(m[1]) - 1];
      if (id) { e.stopImmediatePropagation(); this.pick(id); }
    };
    window.addEventListener('keydown', this.onKey, true);
  }
  stop() { window.removeEventListener('keydown', this.onKey, true); this.stopUi(); }

  listen() {
    const s = this.s;
    s.on('dead', (d, f) => {
      if (!Array.isArray(d) || !s.remotes.has(f)) return;
      const by = Number.isInteger(d[0]) && (d[0] === s.me || s.remotes.has(d[0])) ? d[0] : -1;
      this.onDeath(f, by, typeof d[1] === 'string' ? d[1].slice(0, 12) : '', !!d[2]);
    });
    s.on('ps', (d, f) => {
      if (f !== s.hostSlot || !d || !Array.isArray(d.s)) return;
      this.scores = new Map(d.s.filter((r) => Array.isArray(r)).map(([id, k, dd]) => [id, { k: k | 0, d: dd | 0 }]));
      if (d.e > 0) this.endAt = d.e;
    });
    s.on('pe', (d, f) => { if (f === s.hostSlot && d && Array.isArray(d.t)) this.finish(d); });
  }

  begin() {
    const g = this.g, s = this.s;
    g.phase = 'pvp';
    g.round = 0;
    g.toSpawn = 0;
    g.queue = [];
    for (const p of s.room.players) this.scores.set(p.id, { k: 0, d: 0 });
    // 開場位置:用房間種子打亂出生點,依座位分配(各端算出來一樣,不用另外同步)
    const pts = this.spawnPoints();
    const r = rngSeed(this.s.seed);
    for (let i = pts.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [pts[i], pts[j]] = [pts[j], pts[i]]; }
    this.spawnAt = s.late ? this.pickSpawn() : pts[s.me % pts.length];
    this.loadout();
    this.place(this.spawnAt);
    this.warmup = s.late ? 0.5 : WARMUP;
    if (s.isHost) { this.endAt = s.client.serverNow() + (this.warmup + this.minutes * 60) * 1000; this.broadcast(); }
    s.hud.picker(this.weapons(), this.primary, (id) => this.pick(id), '選擇主武器（數字鍵）· 另配手槍與 1 顆手榴彈');
    s.hud.center(s.late ? '中途加入對戰' : `對戰死鬥 · 模擬戰（非正史） · 先拿到 ${this.limit} 殺獲勝`, 3500);
    document.body.classList.add('mp-pvp'); // 隱藏回合資訊(見 hud.css)
  }
  stopUi() { document.body.classList.remove('mp-pvp'); }

  spawnPoints() {
    const w = this.g.world, out = [];
    for (const p of w.spawns || []) out.push({ x: p.x, y: p.y || 0, z: p.z });
    if (w.start) out.push({ x: w.start.x, y: w.start.y || 0, z: w.start.z });
    for (const p of w.supplies || []) out.push({ x: p.x, y: p.y || 0, z: p.z });
    return out.length ? out : [{ x: (w.sizeX || 60) / 2, y: 0, z: (w.sizeZ || 60) / 2 }];
  }
  // 重生點:離活著的敵人越遠越好,避開敵人視線
  pickSpawn() {
    const g = this.g, w = g.world;
    let best = null, bs = -Infinity;
    for (const p of this.spawnPoints()) {
      let d = 60;
      let seen = false;
      for (const e of this.s.remotes.values()) {
        if (!e.alive) continue;
        const dd = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) + Math.abs(e.pos.y - p.y) * 2;
        d = Math.min(d, dd);
        if (!seen && dd < 30 && w.hasLineOfSight(e.pos.x, e.pos.y + 1.6, e.pos.z, p.x, p.y + 1.6, p.z)) seen = true;
      }
      const score = d - (seen ? 25 : 0) + Math.random() * 6;
      if (score > bs) { bs = score; best = p; }
    }
    return best;
  }
  place(pt) {
    const p = this.g.player, L = this.g.world;
    const x = pt.x + (Math.random() - 0.5) * 0.6, z = pt.z + (Math.random() - 0.5) * 0.6;
    // 面向地圖中心
    const cx = (L.sizeX || 60) / 2, cz = (L.sizeZ || 50) / 2;
    const yaw = Math.atan2(-(cx - x), -(cz - z));
    if (p.place) p.place(x, pt.y, z, yaw); else { p.pos.set(x, pt.y, z); p.yaw = yaw; p.vx = p.vz = 0; }
    L.resolve?.(p.pos, 0.35);
    p.pitch = 0;
  }
  loadout() {
    const g = this.g, w = g.weapons, p = g.player;
    w.inv = {};
    w.give('pistol');
    if (this.primary !== 'pistol' && WEAPONS[this.primary]) w.give(this.primary);
    w.refillAll();
    w.switchTo(this.primary in w.inv ? this.primary : 'pistol', true);
    p.hp = p.maxHp = 100;
    p.armor = 0;
    p.maxArmor = 0;
    p.grenades = 1;
    p.medkits = 0;
    p.alive = true;
    p.downed = false;
    g.healT = 0;
    g.supplies?.newRound(); // 補給點每條命一次
    g.ui.setHP(p.hp, p.maxHp);
    g.ui.setArmor?.(0, 0);
    g.ui.setGrenades?.(1);
    g.updateAmmoHud?.();
  }
  pick(id) {
    if (!WEAPONS[id]) return;
    this.primary = id;
    try { localStorage.setItem(PREF, id); } catch { /* 忽略 */ }
    this.s.hud.pickerSelect(id);
    sfx.uiClick?.();
    if (this.warmup > 0) this.loadout(); // 暖身時立刻換
  }

  // 被別的玩家打中(傷害已由 session.validPvp 驗證)
  onPvpHit(rp, part, dmg, wpn) {
    const g = this.g;
    if (this.dead || this.over || this.warmup > 0 || this.shieldT > 0 || g.state !== 'playing' || !(dmg > 0)) return;
    const boom = wpn === W_BOOM, knife = wpn === W_KNIFE;
    const mul = boom || knife ? 1 : part === 'head' ? 2 : part === 'leg' || part === 'arm' ? 0.85 : 1;
    this.lastAttacker = { slot: rp.id, w: knife ? 'knife' : boom ? 'grenade' : name(WEAPON_IDS, wpn, rp.weapon), head: part === 'head' && !boom && !knife, t: performance.now() };
    g.damagePlayer(g.player, dmg * mul, rp.pos);
  }

  onLocalDeath() {
    const g = this.g, p = g.player, s = this.s;
    if (this.dead || this.over) return;
    const la = this.lastAttacker && performance.now() - this.lastAttacker.t < 8000 ? this.lastAttacker : null;
    const by = la ? la.slot : -1;
    s.send('dead', [by, la ? la.w : null, la?.head ? 1 : 0]);
    this.dead = true;
    this.spectating = true;
    p.alive = false;
    p.hp = 0;
    g.healT = 0;
    this.respawnT = RESPAWN;
    this.killer = by >= 0 ? s.remotes.get(by) : null;
    this.lastAttacker = null;
    if (g.shopUIOpen) g.closeShop();
    g.ui.map?.close?.();
    this.onDeath(s.me, by, la?.w, la?.head);
    s.hud.picker(this.weapons(), this.primary, (id) => this.pick(id), '重生武器（數字鍵）');
    s.sendState(true);
  }

  onDeath(victim, by, w, head) {
    const s = this.s, g = this.g;
    const sv = this.scores.get(victim) || { k: 0, d: 0 };
    sv.d++;
    this.scores.set(victim, sv);
    const killer = by >= 0 && by !== victim ? by : null;
    if (killer !== null) { const sk = this.scores.get(killer) || { k: 0, d: 0 }; sk.k++; this.scores.set(killer, sk); }
    const vn = victim === s.me ? '你' : s.nameOf(victim);
    const wn = WNAME(w);
    if (killer === null) s.hud.feed(`${vn} 陣亡`, 'dead');
    else s.hud.kill(killer === s.me ? '你' : s.nameOf(killer), vn, wn, head, killer === s.me ? 'kill' : victim === s.me ? 'dead' : 'pvp');
    if (killer === s.me) {
      sfx.killConfirm?.();
      g.chud?.marker('kill', !!head);
      s.hud.center(`擊殺 ${s.nameOf(victim)}${head ? ' · 爆頭' : ''}`, 1600);
    }
    if (s.isHost) this.broadcast();
  }

  broadcast() {
    const s = this.s;
    s.send('ps', { s: [...this.scores].map(([id, v]) => [id, v.k, v.d]), e: Math.round(this.endAt) });
  }
  table() {
    const s = this.s, rows = [];
    for (const [id, v] of this.scores) if (id === s.me || s.remotes.has(id)) rows.push([id, v.k, v.d]);
    rows.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
    return rows;
  }
  hostTimer() { return Math.max(0, (this.endAt - this.s.client.serverNow()) / 1000); }

  finish(d) {
    const g = this.g, s = this.s;
    if (this.over) return;
    this.over = true;
    g.state = 'dead';
    document.exitPointerLock?.();
    g.input.fireHeld = false;
    s.hud.pickerClose();
    s.hud.respawn(-1);
    const rows = d.t.filter((r) => Array.isArray(r));
    const win = rows[0];
    s.hud.results({
      title: win && win[0] === s.me ? '你贏了！' : '對戰結束',
      sub: win ? `冠軍：${s.nameOf(win[0])} · ${win[1]} 殺` : '',
      cols: ['名次', '玩家', '擊殺', '陣亡', 'K/D'],
      rows: rows.map(([id, k, dd], i) => [i + 1, s.nameOf(id) + (id === s.me ? '（你）' : ''), k, dd, (k / Math.max(1, dd)).toFixed(2)]),
      again: true,
    });
  }

  becomeHost() { if (!this.endAt) this.endAt = this.s.client.serverNow() + this.minutes * 60000; this.broadcast(); }
  onJoin(rp) {
    if (!this.scores.has(rp.id)) this.scores.set(rp.id, { k: 0, d: 0 });
    this.s.zs.sendAllTo(rp.id);
    this.broadcast();
  }
  onLeave(rp) { if (this.s.isHost) { this.scores.delete(rp.id); this.broadcast(); } }

  update(dt) {
    const s = this.s, g = this.g;
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (g.state !== 'playing' || this.over) return;
    g.phase = 'pvp';
    if (this.warmup > 0) {
      this.warmup -= dt;
      s.hud.countdown(Math.ceil(this.warmup));
      if (this.warmup <= 0) {
        s.hud.countdown(0);
        s.hud.pickerClose();
        this.loadout();
        this.shieldT = 1;
        s.hud.center('開始！', 1200);
        sfx.roundStart?.();
      }
    }
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.respawn();
    }
    if (s.isHost) {
      // 結束條件
      let top = 0;
      for (const v of this.scores.values()) top = Math.max(top, v.k);
      if (top >= this.limit || (this.endAt && s.client.serverNow() >= this.endAt)) {
        const d = { t: this.table() };
        s.send('pe', d);
        this.finish(d);
        return;
      }
      // 殭屍騷擾
      if (s.settings.zombies && this.warmup <= 0) {
        this.zT -= dt;
        let alive = 0;
        for (const z of g.zombies) if (z.alive) alive++;
        const cap = 2 + Math.ceil((s.remotes.size + 1) / 2);
        if (this.zT <= 0 && alive < cap) {
          this.zT = 5 + Math.random() * 4;
          g.round = Math.max(1, Math.min(8, 1 + Math.floor((performance.now() / 60000) % 8)));
          const r = Math.random();
          g.spawnZombie(r < 0.65 ? 'walker' : r < 0.9 ? 'runner' : 'crawler');
          g.toSpawn = 0;
        }
      }
    }
  }

  respawn() {
    const g = this.g, s = this.s;
    this.dead = false;
    this.spectating = false;
    this.killer = null;
    this.place(this.pickSpawn());
    this.loadout();
    this.shieldT = SHIELD;
    g.weaponScene.visible = true;
    s.hud.pickerClose();
    s.hud.center('重生 · 2 秒無敵（開槍即解除）', 1400);
    s.sendState(true);
  }
  // 本機開火:重生保護立刻解除(不能邊無敵邊打人)
  onFire() { if (this.shieldT > 0 && this.warmup <= 0) this.shieldT = 0; }

  afterPlayer(dt) {
    const g = this.g, p = g.player, cam = g.camera, s = this.s;
    if (this.warmup > 0) { // 暖身:原地不動、不能開槍
      p.pos.x = this.spawnAt.x; p.pos.z = this.spawnAt.z;
      p.vx = p.vz = 0;
      g.input.fireHeld = false;
      g.input.firePressed = false;
    }
    if (this.dead) {
      g.weaponScene.visible = false;
      g.input.fireHeld = false;
      g.input.firePressed = false;
      // 死亡鏡頭:倒在地上,看向擊殺者
      cam.position.y = p.pos.y + 0.45;
      const k = this.killer?.avatar;
      if (k && this.killer.alive) {
        const t = k.root.position;
        _v.set(t.x, t.y + 1.3, t.z);
        cam.lookAt(_v);
      }
      s.hud.respawn(Math.max(0, this.respawnT), this.killer?.name);
    } else {
      if (!g.weaponScene.visible && g.state === 'playing') g.weaponScene.visible = true;
      s.hud.respawn(-1);
    }
  }

  plateExtra(rp) { return ''; }
}
