import { Hud } from './ui/hud.js';
import { ShopUI } from './ui/shop.js';
import { MapUI } from './ui/map.js';
import { Menu } from './ui/menu.js';
import { Tips } from './ui/tips.js';
import { settings } from './ui/settings.js';

const $ = (id) => document.getElementById(id);

// 介面總管:HUD(src/ui/hud.js)、商店(src/ui/shop.js)、地圖(src/ui/map.js)、選單與設定(src/ui/menu.js)。
// 保留舊的方法名稱(setHP / setAmmo / banner / prompt / pickup …)給其他模組直接呼叫。
export class UI {
  constructor() {
    this.hudEl = $('hud');
    this.hud = new Hud(this.hudEl);
    this.tips = new Tips(this.hudEl); // 新手提示(src/ui/tips.js)
    this.shop = new ShopUI(this);
    this.map = new MapUI(this);
    this.menu = new Menu(this);
    this.hitTimer = 0;
    this.onHit = null; // 命中統計(flow.js 設定)
    this._lastHurt = null;
    this._lastHp = null;
  }

  attach(game) {
    this.game = game;
    this.menu.attach(game);
  }

  showHud(on) { this.hudEl.classList.toggle('on', on); }

  overlay(id, on) {
    if (id === 'shop') { if (on) { if (this.game) this.game.openShop(); } else this.game?.closeShop(false); return; }
    const el = $(id);
    if (el && id !== 'menu' && !on && el.classList.contains('on')) { // [motion] 暫停/倒下的卡片收起時淡出 140ms(不擋點擊)
      el.classList.add('mo-closing');
      clearTimeout(el._moT);
      el._moT = setTimeout(() => el.classList.remove('mo-closing'), 150);
    } else if (el && on) { clearTimeout(el._moT); el.classList.remove('mo-closing'); }
    if (el) el.classList.toggle('on', on);
    if (id === 'pause') { this.menu.onPause(on); this.game?.motion?.pause(on); } // [motion] 世界變暗、褪色(160ms),繼續時亮回來
  }

  // ---------- HUD(轉給 Hud) ----------
  setHP(hp, max) { this.hud.setHP(hp, max); }
  setArmor(a, max) { this.hud.setArmor(a, max); }
  setAmmo(name, mag, reserve, reloading, cap, tier = 0) { this.hud.setAmmo(name, mag, reserve, reloading, cap, tier); }
  setCoins(n, instant = false) { this.hud.setCoins(n, instant); }
  setScore(n, instant = false) { this.hud.setScore(n, instant); }
  streak(n, mul, gap, t) { this.hud.streak(n, mul, gap, t); }
  coinGain(n) { this.hud.coinGain(n); }
  spend(n) { this.hud.spend(n); }
  pickup(text, color, o) { this.hud.pickup(text, color, o); }
  setRound(n) { this.hud.setRound(n); }
  setZombies(n) { this.hud.setZombies(n); }
  setRest(sec, canSkip = true, next = '') { this.hud.setRest(sec, canSkip, next); }
  setRoundText(html) { this.hud.setRoundText(html); }
  banner(text, sub = '', ms = 3500, cls = '') { this.hud.banner(text, sub, ms, cls); }
  prompt(text, dim = false) { this.hud.prompt(text, dim); }
  feed(text, o = {}) { this.hud.feed(text, o); } // 右側訊息列(多人時連線模組也會用)
  killPop(n, tag, kind) { this.hud.killPop(n, tag, kind); }
  healing(k) { this.hud.healing(k); }
  showDeath(summary) { this.menu.showDeath(summary); }
  resetRun() { this.hud.reset(); this.tips.clearQueue(); this.map.resetRun(); this._lastHurt = null; this._lastHp = null; }

  hitMarker(head) {
    const el = $('hit');
    if (el) {
      el.className = head ? 'head' : '';
      el.style.opacity = 1;
      clearTimeout(this.hitTimer);
      this.hitTimer = setTimeout(() => { el.style.opacity = 0; }, 120);
    }
    this.onHit?.(head);
  }

  // [motion] 受傷:邊緣暗紅,強度跟傷害走(最多 .62,不做全螢幕紅閃),偏向受傷的那一側;40ms 起、520ms 退
  damageFlash(amount = 15, src = null, p = null) {
    if (!settings.get('hurtFx')) return;
    const el = $('damage');
    if (!el) return;
    const k = Math.min(0.62, 0.22 + (amount || 0) / 40);
    let dx = 0;
    if (src && p) { // 來源在畫面的哪一側(-1 左 … 1 右)
      const ax = src.x - p.pos.x, az = src.z - p.pos.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      const a = Math.atan2(ax * c - az * s, -ax * s - az * c);
      dx = Math.max(-1, Math.min(1, Math.sin(a) * 1.4));
    }
    el.style.setProperty('--dx', dx.toFixed(2));
    el.getAnimations?.().forEach((a) => a.cancel());
    el.animate([{ opacity: 0 }, { opacity: k, offset: 0.07 }, { opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if (this.game?.motion) this.game.motion._hitK = Math.min(0.6, 0.3 + (amount || 0) / 60);
  }

  // 每幀(遊戲進行中、未暫停)
  update(game, dt) {
    const p = game.player;
    this.hud.setHP(p.hp, p.maxHp);
    this.hud.setArmor(p.armor, p.maxArmor);
    this.hud.setStamina(p.stamina);
    this.hud.setInv(p.grenades || 0, p.medkits || 0);
    // 受傷方向:用 lastHurtFrom(讀完就清掉,避免沒有來源的傷害沿用舊方向)
    if (p.lastHurt !== this._lastHurt) {
      const dmg = this._lastHp != null ? this._lastHp - p.hp : 10;
      this._lastHurt = p.lastHurt;
      if (p.lastHurtFrom && settings.get('hurtFx')) this.hud.hurt(p.lastHurtFrom.x, p.lastHurtFrom.z, Math.min(1, Math.max(0.2, dmg / 25)));
      p.lastHurtFrom = null;
    }
    this._lastHp = p.hp;
    this.hud.update(game, dt);
    this.tips.update(dt);
    this.map.track(game); // 地圖迷霧:只記錄走到哪一格(格子沒變就不做事)
    if (this.map.isOpen) this.map.update(game);
  }
}
