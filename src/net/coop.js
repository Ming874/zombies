import * as THREE from 'three';
import { sfx } from '../audio.js';
import { F, NONE } from './protocol.js';

// 合作生存:房主跑回合/出怪,廣播回合開始('rs')與結束('re');其他人照著切換階段。
// 回合間是商店階段(phase 'shop',商店捲門拉起):每人用自己的金幣在實體商店購買;按 N 準備 / 取消,
// 全員準備就倒數 3 秒開始,否則 REST_MP 秒到了自動開始(房主計時,快照帶倒數)。
// 金幣、擊殺獎勵、掉落物(彈匣/醫療包/手榴彈)、補給點都是「各人各自」:只在擊殺者的畫面生成、只有他撿得到,不需同步。
// 血量歸零先倒地 30 秒(坐地持手槍、可以開槍),隊友靠近按住 E 3 秒救起;流血至死則觀戰到下一回合重生;全員倒地才結束。
const REST_MP = 45, READY_LEFT = 3, BLEED = 30, REVIVE_TIME = 3, REVIVE_DIST = 1.8;
const QCODE = { walker: 'W', runner: 'R', crawler: 'C', bloater: 'B', brute: 'X' };
const QTYPE = { W: 'walker', R: 'runner', C: 'crawler', B: 'bloater', X: 'brute' };
const isRest = (ph) => ph === 'shop' || ph === 'break';
const _v = new THREE.Vector3();

export class CoopMode {
  constructor(s) {
    this.s = s;
    this.g = s.game;
    this.pvp = false;
    this.votes = new Set();
    this.voted = false;
    this.timer = -1;
    this.lastPhase = null;
    this.allowNext = false;
    this.allowEnd = false;
    this.downT = 0;
    this.dead = false;
    this.spectating = false;
    this.specIdx = 0;
    this.reviveSlot = NONE;
    this.reviveP = 0;
    this.reviving = false;
    this.downB = 0;
    this.overT = 0;
    this.over = false;
    this.shieldT = 0;
    this.queue = ''; // 本回合完整出怪表(房主轉移時接手剩下的)
    this.total = 0;
    this.stats = { kills: 0, downs: 0, revives: 0 };
    this.team = new Map(); // slot → 統計(房主彙整,用於結算)
  }

  install() {
    const s = this.s, g = this.g, m = this;
    s.hook(g, 'startRound', (orig) => function (n) {
      orig.call(this, n);
      if (s.isHost) {
        m.queue = (g.queue || []).map((t) => QCODE[t] || 'W').join('');
        m.total = g.toSpawn;
        s.send('rs', { n, c: g.toSpawn, m: g.maxAlive, q: m.queue });
        m.onRoundStart(n);
      }
    });
    s.hook(g, 'endRound', (orig) => function () {
      if (s.isHost) { orig.call(this); s.send('re', { n: g.round }); m.onRoundEnd(); }
      else if (m.allowEnd) orig.call(this);
    });
    // 下一回合:只有房主的倒數能真的開始;玩家按 N / 商店的按鈕 = 切換準備
    s.hook(g, 'nextRound', (orig) => function () {
      if (s.isHost && m.allowNext) return orig.call(this);
      m.toggleVote();
    });
    // 商店開放的橫幅:沿用遊戲的文字(地點、店名),只改休息秒數與 N 的說明
    s.hook(g, 'openRest', (orig) => function (...a) {
      const ui = g.ui, banner = ui.banner;
      ui.banner = function (title, sub = '', ...b) {
        if (typeof sub === 'string') sub = sub.replace(/休息 \d+ 秒/, `休息 ${REST_MP} 秒`).replace(/\[N\] ?直接開始下一波/, '[N] 準備（全員準備就開始）');
        return banner.call(this, title, sub, ...b);
      };
      try { return orig.apply(this, a); } finally { ui.banner = banner; }
    });
    // 商店介面:多人時世界不暫停;「開始下一回合」按鈕改成準備(含人數),休息秒數即時更新
    if (g.ui.shop && typeof g.ui.shop.refresh === 'function') {
      s.hook(g.ui.shop, 'refresh', (orig) => function (...a) { const r = orig.apply(this, a); m.shopText(); return r; });
    }
    // 按鍵:N = 準備/取消(遊戲本身的 N 在多人時不一定會呼叫 nextRound,這裡統一處理;與 nextRound 包裝之間有防重複);
    // E 按住 = 救援(遊戲的互動鍵處理可能攔下 E,不進 player.keys,這裡另外記)
    this.onKey = (e) => {
      if (e.code === 'KeyE') this.holdE = e.type === 'keydown';
      if (e.code !== 'KeyN' || e.type !== 'keydown' || e.repeat || s.hud.chatOpen || g.state !== 'playing' || !isRest(g.phase)) return;
      e.stopImmediatePropagation();
      this.toggleVote();
    };
    this.onBlur = () => { this.holdE = false; };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
  }
  // 切換準備:同一次按鍵可能同時經過遊戲的 N 處理與這裡,200ms 內只算一次
  toggleVote() {
    const g = this.g, t = performance.now();
    if (g.state !== 'playing' || !isRest(g.phase) || t - (this._voteT || 0) < 200) return;
    this._voteT = t;
    this.vote(!this.voted);
  }
  stop() {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKey, true);
    window.removeEventListener('blur', this.onBlur);
  }

  // 商店介面上的多人資訊(開啟/購買時重畫,每 0.15 秒由 hud.update 更新):休息秒數(商店文字的第一個 <b>)與準備按鈕
  shopText() {
    const g = this.g, ui = g.ui.shop;
    if (!g.shopUIOpen || !ui) return;
    const sec = ui.restEl?.querySelector('b'), t = String(Math.max(0, Math.ceil(g.restT || 0)));
    if (sec && sec.textContent !== t) sec.textContent = t;
    const btn = document.getElementById('shopNext');
    const label = `${this.voted ? '取消準備' : '準備下一波'} ${this.readyCount()}/${this.needed()}<kbd>N</kbd>`;
    if (btn && btn.innerHTML !== label) btn.innerHTML = label;
  }

  listen() {
    const s = this.s, g = this.g;
    s.on('rs', (d, f) => {
      if (f !== s.hostSlot || !d) return;
      if (g.shopUIOpen) g.closeShop();
      g.startRound(d.n | 0);
      g.queue = [];
      g.toSpawn = d.c | 0;
      this.queue = typeof d.q === 'string' ? d.q.slice(0, 400) : '';
      this.total = d.c | 0;
      this.onRoundStart(d.n);
    });
    s.on('re', (d, f) => {
      if (f !== s.hostSlot) return;
      if (g.phase === 'fighting') { this.allowEnd = true; g.endRound(); this.allowEnd = false; }
      this.onRoundEnd();
    });
    s.on('vote', (d, f) => { if (s.isHost) { if (d) this.votes.add(f); else this.votes.delete(f); this.sendVotes(); } });
    s.on('rv', (d, f) => { if (f === s.hostSlot && Array.isArray(d)) { this.votes = new Set(d); this.voted = this.votes.has(s.me); } });
    s.on('down', (d, f) => {
      const rp = s.remotes.get(f);
      if (!rp) return;
      rp.downed = true;
      s.hud.feed(`${rp.name} 倒地了！靠近按住 E 救援`, 'down');
      sfx.downed?.(rp.pos);
      this.bump(f, 'downs');
    });
    s.on('up', (d, f) => {
      const rp = s.remotes.get(f);
      if (rp) rp.downed = false;
      if (!(d?.by >= 0)) { if (rp) s.hud.feed(`${rp.name} 撐過了這一波`, 'revive'); return; }
      const by = d.by === s.me ? '你' : s.nameOf(d.by);
      if (rp) s.hud.feed(`${by} 救起了 ${rp.name}`, 'revive');
      if (d.by === s.me) { this.stats.revives++; s.hud.center('救援成功', 1500); sfx.revive?.(rp?.pos); }
      this.bump(d.by, 'revives');
    });
    s.on('bleed', (d, f) => { const rp = s.remotes.get(f); if (rp) s.hud.feed(`${rp.name} 失血過多……這一波打完會被叫回來`, 'dead'); });
    s.on('rev', (d, f) => { if (this.g.player.downed && !this.dead && s.remotes.get(f)?.connected) this.revive(f); });
    s.on('go', (d, f) => { if (f === s.hostSlot && d && Array.isArray(d.t)) this.gameOver(d); });
    // 中途加入:房主送目前回合、階段、補償金幣
    s.on('sync', (d, f) => {
      if (f !== s.hostSlot || !d) return;
      const n = Math.max(1, d.n | 0);
      if (d.phase === 'fighting') {
        g.startRound(n);
        g.queue = [];
        g.toSpawn = d.c | 0;
        this.queue = typeof d.q === 'string' ? d.q.slice(0, 400) : '';
        this.total = d.total | 0;
      } else {
        g.round = n;
        g.ui.setRound?.(n);
        g.phase = 'shop';
        g.restT = Math.max(1, d.t || REST_MP);
        g.shop?.setOpen(true);
        g.setMood?.('shop');
      }
      if (Array.isArray(d.v)) { this.votes = new Set(d.v); this.voted = this.votes.has(s.me); }
      const coins = Math.max(0, Math.min(5000, d.coins | 0));
      if (coins > 0) { g.player.coins += coins; g.ui.setCoins(g.player.coins); g.ui.coinGain?.(coins); s.hud.feed(`中途加入：獲得 ${coins} 元`, 'coin'); }
    });
  }

  hostTimer() { return isRest(this.g.phase) ? Math.max(0, this.timer) : -1; }

  begin() {
    const s = this.s, g = this.g;
    if (s.isHost) {
      g.startRound(1);
    } else {
      // 等房主的 'rs' / 'sync'(不屬於任何回合階段,本機不會自己出怪或倒數)
      g.phase = 'wait';
      g.round = 0;
      s.hud.center(s.late ? '中途加入：同步中…' : '等待房主開始…', 3000);
    }
    this.pos0();
  }
  // 出生位置:起點附近依座位錯開
  pos0() {
    const g = this.g, st = g.world.start, k = this.s.me;
    const a = k * 1.3;
    const p = g.player.pos;
    p.set(st.x + Math.cos(a) * (k ? 1.2 : 0), st.y || 0, st.z + Math.sin(a) * (k ? 1.2 : 0));
    g.world.resolve?.(p, 0.35);
  }

  // 新玩家加入(房主):補送殭屍與回合狀態
  onJoin(rp, back = false) {
    const s = this.s, g = this.g;
    s.zs.sendAllTo(rp.id);
    const phase = g.phase === 'fighting' ? 'fighting' : 'shop';
    s.send('sync', { n: g.round, c: g.toSpawn, total: this.total, q: this.queue, phase, t: this.hostTimer(), v: [...this.votes], coins: back ? 0 : Math.max(0, (g.round - 1) * 40) }, rp.id);
    this.sendVotes();
  }
  onLeave(rp) { if (this.s.isHost) { this.votes.delete(rp.id); this.sendVotes(); } }
  becomeHost() {
    const g = this.g;
    // 從最後一張快照接手回合狀態
    const H = this.s.zs.host;
    if (H.round) g.round = H.round;
    if (g.phase === 'fighting') {
      g.toSpawn = Math.max(0, H.toSpawn | 0);
      // 出怪表:房主已經出了前 total − toSpawn 隻,剩下的照原本的順序
      const rest = this.queue.slice(Math.max(0, this.queue.length - g.toSpawn));
      g.queue = Array.from({ length: g.toSpawn }, (_, i) => QTYPE[rest[i]] || 'walker');
      g.maxAlive = Math.min(14, 6 + Math.floor(g.round / 2));
      g.spawnEvery = g.spawnEvery || 2;
      g.spawnBurst = 0;
      g.spawnTimer = 2;
    } else if (g.phase === 'wait') {
      // 還沒收到任何回合資訊就接手:直接開始目前回合
      g.startRound(Math.max(1, H.round || 1));
    } else this.timer = Math.max(5, H.timer > 0 ? H.timer : 10);
    this.votes = new Set(this.voted ? [this.s.me] : []);
    this.sendVotes();
  }

  vote(on) {
    const s = this.s, g = this.g;
    if (!isRest(g.phase) || this.voted === on) return;
    this.voted = on;
    if (s.isHost) { if (on) this.votes.add(s.me); else this.votes.delete(s.me); this.sendVotes(); }
    else { if (on) this.votes.add(s.me); else this.votes.delete(s.me); s.send('vote', on ? 1 : 0, s.hostSlot); }
    sfx.uiClick?.();
    this.shopText();
  }
  sendVotes() { if (this.s.isHost) this.s.send('rv', [...this.votes]); }
  needed() {
    let n = 1;
    for (const rp of this.s.remotes.values()) if (rp.connected) n++;
    return n;
  }
  readyCount() {
    let n = this.votes.has(this.s.me) ? 1 : 0;
    for (const rp of this.s.remotes.values()) if (rp.connected && this.votes.has(rp.id)) n++;
    return n;
  }
  allReady() { return this.readyCount() >= this.needed(); }

  onRoundStart() {
    this.votes.clear();
    this.voted = false;
    this.timer = -1;
    if (this.dead) this.respawn();
    this.over = false;
  }
  onRoundEnd() {
    const p = this.g.player;
    if (p.downed && !this.dead) this.revive(null, 25); // 回合結束自動起身
  }
  onZombieKilled(z, slot) {
    if (slot === this.s.me) this.stats.kills++;
    this.bump(slot, 'kills');
  }
  bump(slot, key) {
    if (slot === undefined || slot === null || slot === NONE || slot < 0) return;
    const t = this.team.get(slot) || { kills: 0, downs: 0, revives: 0 };
    t[key]++;
    this.team.set(slot, t);
  }

  // ---- 倒地 / 救援 / 觀戰 ----
  onLocalDeath() {
    const g = this.g, p = g.player, s = this.s;
    if (p.downed || this.dead || this.over) return;
    p.downed = true;
    p.hp = 0;
    g.healT = 0;
    this.downT = BLEED;
    this.stats.downs++;
    this.bump(s.me, 'downs');
    if (g.weapons.has('pistol') && g.weapons.current !== 'pistol') g.weapons.switchTo('pistol');
    if (g.shopUIOpen) g.closeShop();
    g.ui.map?.close?.();
    s.send('down', 1);
    sfx.downed?.();
    s.hud.center('你倒地了！撐住，等隊友救援', 2500);
    s.sendState(true);
  }
  revive(by, hp = 35) {
    const g = this.g, p = g.player, s = this.s;
    p.downed = false;
    p.alive = true;
    p.hp = Math.min(p.maxHp, hp);
    g.ui.setHP(p.hp, p.maxHp);
    this.downT = 0;
    this.shieldT = 1.5;
    s.send('up', { by: by ?? -1 });
    sfx.revive?.();
    if (by !== null && by !== undefined) s.hud.center(`${s.nameOf(by)} 把你救起來了`, 2000);
    s.sendState(true);
  }
  bleedOut() {
    const g = this.g, p = g.player, s = this.s;
    p.downed = false;
    p.alive = false;
    p.hp = 0;
    this.dead = true;
    this.spectating = true;
    s.send('bleed', 1);
    s.hud.center('你失血過多……這一波打完，阿嬤會叫你回來', 3500);
    s.sendState(true);
  }
  respawn() {
    const g = this.g, p = g.player;
    this.dead = false;
    this.spectating = false;
    p.alive = true;
    p.downed = false;
    p.hp = p.maxHp;
    g.ui.setHP(p.hp, p.maxHp);
    this.pos0();
    p.vx = p.vz = 0;
    g.weaponScene.visible = true;
    this.shieldT = 2;
    this.s.hud.center('你醒過來了', 1800);
    this.s.sendState(true);
  }

  gameOver(d) {
    const g = this.g, s = this.s;
    if (this.over) return;
    this.over = true;
    g.state = 'dead';
    g.setMood?.('dead');
    if (g.shopUIOpen) g.closeShop(false);
    document.exitPointerLock?.();
    g.input.fireHeld = false;
    s.hud.results({
      title: '全員倒下', sub: `撐到第 ${d.n} 波`,
      cols: ['玩家', '擊殺', '倒地', '救援'],
      rows: d.t.map(([id, k, dn, rv]) => [s.nameOf(id) + (id === s.me ? '（你）' : ''), k, dn, rv]),
    });
  }

  // 每幀:房主檢查全員倒地、商店階段倒數;其他人用快照的倒數
  update(dt) {
    const s = this.s, g = this.g, p = g.player;
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (g.state !== 'playing') return;
    // 倒地流血
    if (p.downed && !this.dead) {
      this.downT -= dt;
      if (this.downT <= 0) this.bleedOut();
    }
    if (s.isHost) {
      // 商店階段:多人版的倒數(全員準備就提早開始);g.restT 跟著倒數,流程本身的計時永遠不會先歸零
      if (g.phase !== this.lastPhase && isRest(g.phase)) this.timer = REST_MP;
      if (isRest(g.phase)) {
        this.timer -= dt;
        if (this.allReady() && this.timer > READY_LEFT) this.timer = READY_LEFT;
        this.setRest(this.timer);
        if (this.timer <= 0) { this.allowNext = true; g.nextRound(); this.allowNext = false; }
      }
      // 全員倒地 → 結束
      let standing = p.alive !== false && !p.downed && !this.dead ? 1 : 0;
      for (const rp of s.remotes.values()) if (rp.connected && rp.up && !rp.downed) standing++;
      if (!standing && g.phase === 'fighting') {
        this.overT += dt;
        if (this.overT > 0.8 && !this.over) {
          const rows = [[s.me, ...this.tally(s.me)]];
          for (const rp of s.remotes.values()) rows.push([rp.id, ...this.tally(rp.id)]);
          const d = { n: g.round, t: rows };
          s.send('go', d);
          this.gameOver(d);
        }
      } else this.overT = 0;
    } else if (isRest(g.phase)) {
      const H = s.zs.host;
      this.setRest(H.timer >= 0 ? H.timer - (performance.now() - H.t) / 1000 : 99);
    }
    this.lastPhase = g.phase;
  }
  // 商店階段的倒數交給遊戲顯示:restT 取整數秒再減一點點(流程本身每幀扣 dt 不會跨過整數 → 不會自己倒數或開始下一回合),
  // 最後 5 秒的倒數音效在這裡播;gameplay 版 flow.js 在多人時改用 breakTimer 推算 restT(= breakTimer − 0.5)
  setRest(t) {
    const g = this.g, n = Math.max(1, Math.ceil(t));
    g.restT = n - 0.001;
    g.breakTimer = g.restT + 0.5;
    if (n !== this._beep) { if (n <= 5 && this._beep !== undefined) sfx.countdown?.(n); this._beep = n; }
  }
  tally(slot) { const t = this.team.get(slot) || { kills: 0, downs: 0, revives: 0 }; return [t.kills, t.downs, t.revives]; }

  // 本機玩家更新後:倒地鏡頭、觀戰鏡頭、救援
  afterPlayer(dt) {
    const s = this.s, g = this.g, p = g.player, cam = g.camera;
    this.downB += ((p.downed ? 1 : 0) - this.downB) * Math.min(1, dt * 5);
    if (this.downB > 0.01 && !this.dead) {
      cam.position.y -= 1.0 * this.downB;
      cam.rotation.z += 0.12 * this.downB;
      if (p.downed && g.weapons.current !== 'pistol' && g.weapons.has('pistol')) g.weapons.switchTo('pistol', true);
    }
    // 觀戰:跟在活著的隊友後上方
    if (this.dead) {
      g.weaponScene.visible = false;
      g.input.fireHeld = false;
      if (g.input.firePressed) { this.specIdx++; g.input.firePressed = false; }
      let t = null, n = 0;
      for (const r of s.remotes.values()) if (r.alive && r.avatar) n++;
      if (n) { let i = this.specIdx % n; for (const r of s.remotes.values()) if (r.alive && r.avatar && i-- === 0) { t = r; break; } }
      if (t) {
        const a = t.avatar.root.position;
        const back = _v.set(Math.sin(t.yaw), 0, Math.cos(t.yaw)).multiplyScalar(2.6);
        cam.position.set(a.x + back.x, a.y + 2.1, a.z + back.z);
        cam.lookAt(a.x, a.y + 1.4, a.z);
        s.hud.spectate(t.name);
      } else s.hud.spectate(null);
    } else {
      if (!g.weaponScene.visible && g.state === 'playing') g.weaponScene.visible = true;
      s.hud.spectate(null);
    }
    // 救援:靠近倒地隊友,按住 E
    this.reviving = false;
    let cand = null, cd = REVIVE_DIST;
    if (!p.downed && !this.dead && p.alive !== false) {
      for (const rp of s.remotes.values()) {
        if (!rp.downed || !rp.connected) continue;
        const d = Math.hypot(rp.pos.x - p.pos.x, rp.pos.z - p.pos.z) + Math.abs(rp.pos.y - p.pos.y);
        if (d < cd) { cd = d; cand = rp; }
      }
    }
    if (cand && (this.holdE || p.keys.KeyE) && !g.shopUIOpen && !g.paused) {
      if (this.reviveSlot !== cand.id) { this.reviveSlot = cand.id; this.reviveP = 0; }
      this.reviveP += dt / REVIVE_TIME;
      this.reviving = true;
      if (this.reviveP >= 1) { s.send('rev', 1, cand.id); this.reviveP = 0; this.reviveSlot = NONE; this.reviving = false; }
    } else { this.reviveP = Math.max(0, this.reviveP - dt * 2); if (this.reviveP <= 0) this.reviveSlot = NONE; }
    s.hud.revive(cand, this.reviving ? this.reviveP : 0, p.downed && !this.dead ? this.downT : -1, this.helper());
  }
  // 倒地時:誰正在救我
  helper() {
    for (const rp of this.s.remotes.values()) if ((rp.flags & F.REVIVE) && rp.rt === this.s.me) return { name: rp.name, p: rp.rp };
    return null;
  }
  plateExtra(rp) { return rp.downed && rp.connected ? '倒地 · 按住 E 救援' : ''; }
}
