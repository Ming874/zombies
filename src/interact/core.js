import * as THREE from 'three';
import { sfx } from '../audio.js';

// 互動系統核心(game.interact):登記可互動物件、視線瞄準(節流、只掃自己的代理清單)、按 E / 按住 E、冷卻與一次性、
// 與商店/補給櫃/合作救援的 E 鍵仲裁、旗標(game.flags)與道具(game.inventory)。
// 每幀成本:提示文字 + 按住進度;瞄準每秒 12 次,只對前 3 名候選做一次 world.rayDistance(不對場景網格做射線)。
// 多人:互動物件預設只在本機生效(金幣、道具、旗標都是個人的);門的開關另外同步(src/interact/doors.js)。
//
// register(target, opts) → handle
//  target:THREE.Object3D(取世界座標;dynamic:true 時每次掃描都重新取)或 {x,y,z}
//  opts:{ id, kind, name, prompt(字串或 (ctx)=>字串), hold(秒), holdText, onTap(按住型物件的「點一下」動作), tapText,
//         once:false|'round'|'run', cooldown(秒), when(ctx)→true|false|'不能用的原因', require:{ item, n, flag, coins },
//         reach(預設 2.0m), radius(瞄準半徑,預設 0.25m), look(預設 true;false = 靠近就能用), los(預設 true), priority,
//         dynamic, moveCancel(預設 true), interruptOnHurt(預設 true), holdReset, scope:'map'|'run',
//         onUse(ctx)(回傳 false = 沒有消耗次數), onHoldStart, onHoldCancel, onFocus, onBlur }
//  ctx:{ game, player, ix, e, obj, flags, inv, mp, isHost }
const TICK = 1 / 12;
const CONE_PAD = (4 * Math.PI) / 180;
const _dir = new THREE.Vector3(), _p = new THREE.Vector3();

// ---------- 旗標:這一局的劇情/機關狀態(know.* / meta.* 跨局記在 localStorage) ----------
const FKEY = 'shh.flags.v1';
export class Flags {
  constructor(onChange) {
    this.m = new Map();
    this.meta = {};
    this.onChange = onChange;
    try { this.meta = JSON.parse(localStorage.getItem(FKEY) || '{}') || {}; } catch { this.meta = {}; }
  }
  static persistent(k) { return k.startsWith('know.') || k.startsWith('meta.'); }
  get(k) { return Flags.persistent(k) ? this.meta[k] : this.m.get(k); }
  has(k) { const v = this.get(k); return v !== undefined && v !== false && v !== 0 && v !== null; }
  set(k, v = true) {
    if (this.get(k) === v) return v;
    if (Flags.persistent(k)) { this.meta[k] = v; try { localStorage.setItem(FKEY, JSON.stringify(this.meta)); } catch { /* 無痕模式 */ } }
    else this.m.set(k, v);
    this.onChange?.(k, v);
    return v;
  }
  inc(k, n = 1) { return this.set(k, (Number(this.get(k)) || 0) + n); }
  clear(k) { if (Flags.persistent(k)) { delete this.meta[k]; try { localStorage.setItem(FKEY, JSON.stringify(this.meta)); } catch { /* 略 */ } } else this.m.delete(k); }
  resetRun() { this.m.clear(); }
  list() { return { run: Object.fromEntries(this.m), meta: { ...this.meta } }; }
}

// ---------- 道具:鑰匙、保險絲、油桶…(每局重來;多人時各自的) ----------
export const ITEMS = {
  fuse: { name: '保險絲', icon: '⌁' }, oil: { name: '油桶', icon: '⛽' }, 'card.security': { name: '門禁卡', icon: '▣' },
  oilrice: { name: '油飯', icon: '◉' }, hongbao: { name: '紅包', icon: '▤' }, slip: { name: '紙條', icon: '▭' },
};
export class Inventory {
  constructor(onChange) { this.m = new Map(); this.onChange = onChange; }
  name(id) { return ITEMS[id]?.name || (id.startsWith('key.') ? `鑰匙（${ITEMS[id]?.label || id.slice(4)}）` : id); }
  count(id) { return this.m.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  add(id, n = 1) { this.m.set(id, this.count(id) + n); this.onChange?.(id, this.count(id), n); return this.count(id); }
  take(id, n = 1) { if (!this.has(id, n)) return false; const v = this.count(id) - n; if (v > 0) this.m.set(id, v); else this.m.delete(id); this.onChange?.(id, v, -n); return true; }
  list() { return [...this.m.entries()].map(([id, n]) => ({ id, n, name: this.name(id) })); }
  clear() { this.m.clear(); this.onChange?.(null, 0, 0); }
}

export class Interact {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.list = [];
    this.byId = new Map();
    this.focus = null;
    this.hold = null; // { e, t, hurt, tap }
    this.pk = null; // 目前的提示 { text, dim, e }
    this.scanT = 0;
    this.ev = new Map();
    this.tickers = new Set();
    this.timers = [];
    this.ringing = new Set(); // 正在響的電話(畫面邊緣的方向提示用)
    this.modal = null; // 閱讀器/鍵盤/保險絲盒(src/interact/ui.js)
    this._cand = [];
    this.flags = game.flags = new Flags((k, v) => this.emit('flag', k, v));
    this.inv = game.inventory = new Inventory((id, n, d) => { this.ui?.setInv(this.inv.list()); this.emit('item', id, n, d); });
    this.stats = { scans: 0, rays: 0, uses: 0 };
  }

  // ---------- 事件(給驚嚇導演、目標系統用):'use' 'focus' 'flag' 'item' 'ring' 'note' ----------
  on(ev, fn) { if (!this.ev.has(ev)) this.ev.set(ev, new Set()); this.ev.get(ev).add(fn); return () => this.ev.get(ev)?.delete(fn); }
  emit(ev, ...a) { const s = this.ev.get(ev); if (s) for (const fn of s) { try { fn(...a); } catch (e) { console.warn('[interact]', ev, e); } } }
  // 每幀更新(動畫):回傳取消函式;不需要時要取消,避免閒置物件每幀跑
  tick(fn) { this.tickers.add(fn); return () => this.tickers.delete(fn); }
  // 遊戲時間計時器(單人暫停時跟著停):回傳取消函式
  after(sec, fn) { const t = { at: (this.game.time || 0) + sec, fn }; this.timers.push(t); return () => { t.fn = null; }; }

  register(target, o = {}) {
    const isObj = target && target.isObject3D;
    const e = {
      kind: 'thing', name: '', reach: 2.0, radius: 0.25, look: true, los: true, priority: 0, hold: 0, once: false, cooldown: 0,
      moveCancel: true, interruptOnHurt: true, scope: 'map', enabled: true, dynamic: false, ...o,
      obj: isObj ? target : null, pos: { x: 0, y: 0, z: 0 }, used: false, usedRound: -1, cdUntil: -1, n: 0, holdP: 0,
    };
    if (!e.id) e.id = `${e.kind}@${this.list.length}`;
    e.reach = Math.max(2.0, e.reach); // 至少 2m(站在桌邊、低頭看地上的東西也搆得到)
    if (typeof target === 'function') e.posFn = target;
    else if (isObj && !e.dynamic) { target.updateWorldMatrix(true, false); target.getWorldPosition(_p); e.pos.x = _p.x; e.pos.y = _p.y; e.pos.z = _p.z; }
    else if (!isObj && target) { e.pos.x = target.x; e.pos.y = target.y; e.pos.z = target.z; }
    if (o.offset) { e.pos.x += o.offset.x || 0; e.pos.y += o.offset.y || 0; e.pos.z += o.offset.z || 0; }
    e.setEnabled = (v) => { e.enabled = !!v; if (!v && this.focus === e) this._blur(); };
    e.remove = () => this.remove(e);
    e.setPos = (x, y, z) => { e.pos.x = x; e.pos.y = y; e.pos.z = z; };
    this.list.push(e);
    this.byId.set(e.id, e);
    return e;
  }
  remove(e) {
    const i = this.list.indexOf(e);
    if (i < 0) return;
    this.list.splice(i, 1);
    if (this.byId.get(e.id) === e) this.byId.delete(e.id);
    if (this.focus === e) this._blur();
    if (this.hold?.e === e) this.hold = null;
  }
  get(id) { return this.byId.get(id) || null; }
  find(pred) { return this.list.filter(typeof pred === 'string' ? (e) => e.kind === pred : pred); }
  where(e) { if (e.dynamic && e.obj) { e.obj.getWorldPosition(_p); return _p; } if (e.posFn) { const q = e.posFn(); _p.set(q.x, q.y, q.z); return _p; } return _p.set(e.pos.x, e.pos.y, e.pos.z); }

  ctx(e) {
    const g = this.game;
    return { game: g, player: g.player, ix: this, e, obj: e?.obj, flags: this.flags, inv: this.inv, mp: !!g.net, isHost: !g.net || !!g.net.isHost };
  }

  // ---------- 生命週期 ----------
  newRound() { for (const e of this.list) if (e.once === 'round') e.usedRound = -1; this.emit('round', this.game.round); }
  resetRun() {
    for (const e of this.list) { e.used = false; e.usedRound = -1; e.cdUntil = -1; e.n = 0; e.holdP = 0; e.reset?.(this.ctx(e)); }
    this.hold = null;
    this.timers.length = 0;
    this.ringing.clear();
    this._blur();
    this.flags.resetRun();
    this.inv.clear();
    this.ui?.closeModal?.();
    this.ui?.clearSubs?.();
    this.emit('reset');
  }
  clear(scope = 'map') {
    for (const e of this.list.slice()) if (scope === 'all' || e.scope === scope) { e.dispose?.(); this.remove(e); }
    this.tickers.clear();
    this.timers.length = 0;
  }

  // ---------- 能不能互動 ----------
  available() {
    const g = this.game, p = g.player;
    if (!p || g.state !== 'playing' || g.paused || g.shopUIOpen || this.modal) return false;
    if (g.ui?.map?.isOpen || g.healT > 0 || p.alive === false || p.downed) return false;
    const s = g.net;
    if (s) {
      if (s.mode?.dead) return false;
      if (s.remotes) for (const rp of s.remotes.values()) { // 合作:旁邊有倒地的隊友 → E 給救援用
        if (rp.downed && rp.connected && Math.hypot(rp.pos.x - p.pos.x, rp.pos.z - p.pos.z) + Math.abs(rp.pos.y - p.pos.y) < 1.9) return false;
      }
    }
    return true;
  }
  // 不能用的原因(字串)或 null
  denyOf(e, ctx) {
    const g = this.game, nm = e.name || '';
    if (e.once === 'round' && e.usedRound === g.round) return e.usedText || `${nm} · 下一波再來`;
    if (e.once && e.once !== 'round' && e.used) return e.usedText || `${nm} · 已經用過了`;
    if (e.cdUntil > g.time) return e.cdText || `${nm} · 稍後再試`;
    const rq = e.require;
    if (rq) {
      if (rq.item && !this.inv.has(rq.item, rq.n || 1)) return rq.text || `${nm} · 需要 ${this.inv.name(rq.item)}${rq.n > 1 ? `（${this.inv.count(rq.item)}/${rq.n}）` : ''}`;
      if (rq.flag && !this.flags.has(rq.flag)) return rq.text || `${nm} · 還不能用`;
      if (rq.coins && (g.player.coins || 0) < rq.coins) return rq.text || `${nm} · 需要 ${rq.coins} 元`;
    }
    if (e.when) { const w = e.when(ctx); if (w === false) return `${nm} · 現在不能用`; if (typeof w === 'string') return w; }
    return null;
  }
  promptOf(e, ctx) {
    const deny = this.denyOf(e, ctx);
    if (deny) return { text: deny, dim: true, e };
    let t = typeof e.prompt === 'function' ? e.prompt(ctx) : e.prompt;
    if (t == null || t === '') return null;
    if (typeof t === 'object') return { text: t.text, dim: !!t.dim, e };
    if (t.includes('[E]')) return { text: t, dim: false, e };
    if (e.hold > 0) {
      if (this.hold?.e === e && this.hold.t >= 0.22) return { text: `${e.holdText || t}…`, dim: false, e };
      const tap = e.onTap ? (typeof e.tapText === 'function' ? e.tapText(ctx) : e.tapText) : null;
      return { text: tap ? `按 [E] ${tap} · 按住 [E] ${t}` : `按住 [E] ${t}`, dim: false, e };
    }
    return { text: `按 [E] ${t}`, dim: false, e };
  }

  // ---------- 瞄準(每秒 12 次) ----------
  scan() {
    const g = this.game, cam = g.camera, w = g.world;
    this.stats.scans++;
    cam.getWorldDirection(_dir);
    const ex = cam.position.x, ey = cam.position.y, ez = cam.position.z;
    const C = this._cand;
    C.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.enabled) continue;
      const q = this.where(e);
      const dx = q.x - ex, dy = q.y - ey, dz = q.z - ez;
      if (dy > 1.4 || dy < -2.2) continue;
      const r = e.reach;
      if (dx * dx + dz * dz + dy * dy * 0.36 > r * r) continue; // 距離:高低差只算六成(低頭看桌上的東西不會太嚴)
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      let s;
      if (e.look !== false) {
        const dot = (dx * _dir.x + dy * _dir.y + dz * _dir.z) / d;
        if (dot < Math.cos(Math.atan(e.radius / d) + CONE_PAD)) continue;
        s = 1 + dot - 0.05 * d + e.priority * 0.02;
      } else s = 0.4 - 0.05 * d + e.priority * 0.02;
      C.push(s, i, d, dx / d, dy / d, dz / d);
    }
    let best = null;
    for (let k = 0; k < 3 && C.length; k++) { // 前 3 名才做視線檢查
      let bi = -1, bs = -1e9;
      for (let j = 0; j < C.length; j += 6) if (C[j] > bs) { bs = C[j]; bi = j; }
      if (bi < 0) break;
      const e = this.list[C[bi + 1]], d = C[bi + 2];
      C[bi] = -1e9;
      if (e.los !== false && w?.rayDistance) {
        this.stats.rays++;
        const hit = w.rayDistance(ex, ey, ez, C[bi + 3], C[bi + 4], C[bi + 5], d);
        if (hit < d - e.radius - 0.15 - (e.losPad ?? 0.25)) continue; // 放在台面/櫃子上的東西:自己底下的碰撞盒不算擋住
      }
      best = e;
      break;
    }
    if (best !== this.focus) {
      if (this.focus) this._blur();
      if (best) { this.focus = best; best.onFocus?.(this.ctx(best)); this.emit('focus', best); }
    }
  }
  _blur() { const f = this.focus; this.focus = null; if (f) f.onBlur?.(this.ctx(f)); }

  // 給 flow.js:目前要顯示的提示(含與商店/補給櫃的優先順序)
  pick() {
    if (!this.available()) return null;
    const pk = this.pk;
    if (!pk) return null;
    const g = this.game, p = g.player, e = pk.e;
    const shop = g.shop?.interact?.(p);
    if (shop === 'open' && (e.look === false || e.priority < 60)) return null; // 商店開放時櫃台優先
    if (e.look === false && g.supplies?.nearest?.(p)) return null; // 只靠近就能用的物件讓補給櫃
    return pk;
  }

  // 按下 E(flow.js onGameplayKey 呼叫;回傳 true = 已處理)
  press() {
    const pk = this.pick();
    if (!pk) return false;
    const e = pk.e, ctx = this.ctx(e), deny = this.denyOf(e, ctx);
    if (deny) { this.game.ui.pickup(deny, '#a3a39a'); sfx.pickupDeny(); return true; }
    if (e.hold > 0) {
      this.hold = { e, t: 0, hurt: this.game.player.lastHurt };
      if (!(e.holdP > 0)) e.holdP = 0;
      if (!e.onTap) e.onHoldStart?.(ctx);
      return true;
    }
    this.use(e, ctx);
    return true;
  }
  // 直接觸發(測試、腳本、目標系統用;不檢查距離/視線)
  use(e, ctx = this.ctx(e), fn = e.onUse) {
    if (typeof e === 'string') e = this.get(e);
    if (!e) return false;
    let r;
    try { r = fn?.(ctx); } catch (err) { console.warn('[interact]', e.id, err); }
    if (r === false) return false;
    const g = this.game;
    e.n++;
    if (e.once === 'round') e.usedRound = g.round;
    else if (e.once) e.used = true;
    if (e.cooldown > 0) e.cdUntil = g.time + e.cooldown;
    this.stats.uses++;
    this.emit('use', e, ctx);
    return true;
  }
  _cancelHold(reset = false) {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    if (reset || h.e.holdReset) h.e.holdP = 0;
    if (h.t >= 0.22 || !h.e.onTap) h.e.onHoldCancel?.(this.ctx(h.e));
  }

  // ---------- 每幀(flow.js updateGameplay 呼叫) ----------
  update(dt) {
    const g = this.game, p = g.player;
    if (this.timers.length) {
      const now = g.time;
      for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; if (!t.fn) { this.timers.splice(i, 1); continue; } if (now >= t.at) { this.timers.splice(i, 1); try { t.fn(); } catch (err) { console.warn('[interact] after', err); } } }
    }
    for (const fn of this.tickers) { try { if (fn(dt, g.time) === false) this.tickers.delete(fn); } catch (err) { this.tickers.delete(fn); console.warn('[interact] tick', err); } }
    const ok = this.available();
    if ((this.scanT -= dt) <= 0) { this.scanT = TICK; if (ok) this.scan(); else if (this.focus) this._blur(); }
    // 按住
    const h = this.hold;
    if (h) {
      const e = h.e;
      const lost = !ok || this.focus !== e;
      const moved = e.moveCancel && (p.sprinting || p.onGround === false);
      const hurt = e.interruptOnHurt && p.lastHurt > h.hurt;
      if (!p.keys.KeyE || lost || moved || hurt) {
        if (!p.keys.KeyE && e.onTap && h.t < 0.22 && !lost) { this.hold = null; this.use(e, this.ctx(e), e.onTap); }
        else this._cancelHold(hurt);
      } else {
        if (e.onTap && h.t < 0.22 && h.t + dt >= 0.22) e.onHoldStart?.(this.ctx(e));
        h.t += dt;
        if (!e.onTap || h.t >= 0.22) e.holdP = Math.min(1, e.holdP + dt / e.hold);
        if (e.holdP >= 1) { this.hold = null; e.holdP = 0; this.use(e, this.ctx(e)); }
      }
    }
    // 放開後慢慢退回(和合作救援一樣是 2 倍速退)
    for (const e of this.list) if (e.holdP > 0 && this.hold?.e !== e) e.holdP = Math.max(0, e.holdP - dt * 2 / Math.max(0.3, e.hold));
    this.pk = ok && this.focus ? this.promptOf(this.focus, this.ctx(this.focus)) : null;
    const hp = this.hold && (this.hold.t >= 0.22 || !this.hold.e.onTap) ? this.hold.e : this.focus && this.focus.holdP > 0 ? this.focus : null;
    this.ui?.holdBar(hp ? hp.holdText || (typeof hp.prompt === 'string' ? hp.prompt : hp.name) : null, hp ? hp.holdP : 0);
    this.ui?.update?.(dt);
    if (this.ringing.size || this.ui?._ringOn) this.ui?.ringMarks?.(this.game, this.ringing);
  }
}
