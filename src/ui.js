import { WEAPONS } from './weapons/weapon.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.hud = $('hud');
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.gainTimer = 0;
    this.shopItems = [
      { id: 'revolver', type: 'weapon' },
      { id: 'ak47', type: 'weapon' },
      { id: 'm4a1', type: 'weapon' },
      { id: 'ammo', type: 'ammo', name: '彈藥補給', desc: '補滿所有已擁有武器的彈藥', price: 100 },
    ];
  }

  showHud(on) { this.hud.classList.toggle('on', on); }
  overlay(id, on) { $(id).classList.toggle('on', on); }

  setHP(hp, max) {
    $('hpfill').style.width = `${Math.max(0, (hp / max) * 100)}%`;
    $('hpnum').textContent = Math.ceil(hp);
  }

  setAmmo(name, mag, reserve, reloading) {
    $('wname').textContent = reloading ? `${name} · 換彈中…` : name;
    $('mag').textContent = mag;
    $('reserve').textContent = reserve;
  }

  setCoins(n) { $('coinnum').textContent = n; }

  coinGain(n) {
    const el = $('coingain');
    this._gain = (this._gain || 0) + n;
    el.textContent = `+${this._gain}`;
    el.style.opacity = 1;
    clearTimeout(this.gainTimer);
    this.gainTimer = setTimeout(() => { el.style.opacity = 0; this._gain = 0; }, 1400);
  }

  setRound(n) { $('round').textContent = n; }
  setZombies(n) { $('zleft').textContent = n; }

  banner(text, sub = '', ms = 3500) {
    const el = $('banner');
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    el.style.opacity = 1;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.style.opacity = 0; }, ms);
  }

  prompt(text) {
    const el = $('prompt');
    if (performance.now() < (this.noteUntil || 0)) return; // 短訊息(pickup)顯示中
    if (text) { el.textContent = text; el.style.display = 'block'; } else el.style.display = 'none';
  }

  // 短訊息(例如「門口有東西擋著」):借用提示列顯示 1.6 秒
  pickup(text) {
    const el = $('prompt');
    el.textContent = text;
    el.style.display = 'block';
    this.noteUntil = performance.now() + 1600;
  }

  hitMarker(head) {
    const el = $('hit');
    el.className = head ? 'head' : '';
    el.style.opacity = 1;
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => { el.style.opacity = 0; }, 120);
  }

  damageFlash() {
    const el = $('damage');
    el.style.transition = 'none';
    el.style.opacity = 0.9;
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .6s';
      el.style.opacity = 0;
    });
  }

  // 商店:onBuy(itemId) 由遊戲處理並回傳是否成功
  renderShop(player, weapons, onBuy) {
    $('shopcoins').textContent = player.coins;
    const root = $('shopitems');
    root.innerHTML = '';
    for (const it of this.shopItems) {
      const row = document.createElement('div');
      row.className = 'item';
      let name, desc, price, label, disabled;
      if (it.type === 'weapon') {
        const w = WEAPONS[it.id];
        const owned = weapons.has(it.id);
        name = w.name;
        desc = `${w.desc} · 傷害 ${w.damage} · 彈匣 ${w.mag}`;
        price = owned ? Math.floor(w.price / 2) : w.price;
        label = owned ? '補滿彈藥' : '購買';
        if (owned) desc += '(已擁有,補彈半價)';
      } else {
        name = it.name; desc = it.desc; price = it.price; label = '購買';
      }
      disabled = player.coins < price;
      row.innerHTML = `<div class="nm">${name}<small>${desc}</small></div><div class="pr">${price} 金幣</div>`;
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.disabled = disabled;
      btn.onclick = () => { onBuy(it.id, price); };
      row.appendChild(btn);
      root.appendChild(row);
    }
  }
}
