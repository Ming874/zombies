import * as THREE from 'three';
import './hud.css';
import { ICON, withKeys } from './icons.js';

// 遊戲中 HUD(全部用 JS 建 DOM)。效能:數值有變才寫 DOM、動畫只用 transform/opacity、每幀不讀版面。
const mk = (cls, html = '', tag = 'div') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 訊息/撿取:同一句還在畫面上(還沒開始淡出)→ 加「×N」、重新計時,不疊兩行一樣的
function merge(box, key, life) {
  for (const e of box.children) {
    if (e.dataset.k !== key) continue;
    const a = e.getAnimations()[0], t = +(a?.currentTime ?? 0);
    if (!a || t > life * 0.7) return false; // 快淡掉了:另起一行
    const n = (+e.dataset.n || 1) + 1;
    e.dataset.n = n;
    let c = e.querySelector(':scope > .hd-x');
    if (!c) { c = document.createElement('b'); c.className = 'hd-x'; e.insertBefore(c, e.querySelector(':scope > small')); }
    c.textContent = ` ×${n}`;
    a.currentTime = Math.min(t, life * 0.12);
    return true;
  }
  return false;
}
const _v = new THREE.Vector3();
const PICK_ICON = { ammo: ICON.ammo, med: ICON.medkit, grenade: ICON.grenade, armor: ICON.shield, heal: ICON.heal, coin: ICON.coin };

// 位置 → 樓層代號與區域(新多樓層 World 有 layout/zoneAt;舊地圖沒有就只顯示 1F)
export function zoneInfo(world, p) {
  const L = world.layout;
  let lvl = null, zone = null;
  if (L) {
    const li = world.levelAt ? world.levelAt(p.y + 0.2) : L.levelOfY(p.y + 0.2);
    lvl = L.levels[li]?.id;
    zone = world.zoneAt ? world.zoneAt(p.x, p.y + 0.2, p.z) : L.zoneAt(li, Math.floor(p.x / L.CELL), Math.floor(p.z / L.CELL));
  } else if (world.zoneAt) zone = world.zoneAt(p.x, p.y + 0.2, p.z);
  return { lvl: lvl || '1F', id: zone?.id || '', name: zone?.name || '' };
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.v = {}; // 已寫入 DOM 的值(避免重複寫)
    this.coinShown = 0;
    this.coinTarget = 0;
    this.arcs = [];
    this.zoneT = 0;
    this.zoneSeen = new Set();
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    window.addEventListener('resize', () => { this.W = window.innerWidth; this.H = window.innerHeight; });

    const add = (e) => (root.appendChild(e), e);
    this.loc = add(mk('hd hd-loc', `<span class="hd-floor">1F</span><span class="hd-zone"></span><span class="hd-maphint">${withKeys('[M] 地圖')}</span>`));
    this.floorEl = this.loc.children[0];
    this.zoneEl = this.loc.children[1];
    this.zoneBig = add(mk('hd hd-zonebig'));
    this.round = add(mk('hd hd-round', '<div class="hd-rn">第 <b>1</b> 波</div><div class="hd-rs">還有 <b>0</b> 隻</div>'));
    this.round.id = 'roundinfo'; // 對戰模式(src/net/pvp.js)會用這個 id 隱藏回合資訊
    this.roundNum = this.round.querySelector('b');
    this.roundSub = this.round.children[1];
    this.coins = add(mk('hd hd-coins', `<span class="hd-cgain"></span>${ICON.coin}<b>0</b>`));
    this.coinGainEl = this.coins.children[0];
    this.coinNum = this.coins.querySelector('b');
    this.scoreEl = add(mk('hd hd-score', '分數 <b>0</b>'));
    this.scoreNum = this.scoreEl.querySelector('b');
    this.scoreShown = 0;
    this.scoreTarget = 0;
    this.streakEl = add(mk('hd hd-streak hd-hide', '<b></b><span></span><div class="hd-bar"><div class="fill"></div></div>'));
    this.streakNum = this.streakEl.children[0];
    this.streakMul = this.streakEl.children[1];
    this.streakFill = this.streakEl.querySelector('.fill');
    this.streakEnd = 0;
    this.streakLen = 1;

    this.vitals = add(mk('hd hd-vitals', `
      <div class="hd-row hd-hp">${ICON.cross}<b class="num">100</b><div class="hd-bar"><div class="trail"></div><div class="fill"></div><div class="seg"></div></div></div>
      <div class="hd-row hd-ar off">${ICON.shield}<b class="num">0</b><div class="hd-bar"><div class="fill"></div></div></div>
      <div class="hd-row hd-st hd-hide">${ICON.bolt}<div class="hd-bar"><div class="fill"></div></div></div>`));
    const [hp, ar, st] = this.vitals.children;
    this.hpRow = hp; this.hpNum = hp.querySelector('.num'); this.hpFill = hp.querySelector('.fill'); this.hpTrail = hp.querySelector('.trail');
    this.arRow = ar; this.arNum = ar.querySelector('.num'); this.arFill = ar.querySelector('.fill');
    this.stRow = st; this.stFill = st.querySelector('.fill');

    this.weapon = add(mk('hd hd-weapon', `<div class="hd-wname"></div><div class="hd-ammo"><b class="mag">0</b><span class="res">/ 0</span></div>
      <div class="hd-inv"><span class="g">${ICON.grenade}<b>0</b><kbd class="kc">G</kbd></span><span class="m">${ICON.medkit}<b>0</b><kbd class="kc">H</kbd></span></div>`));
    this.wName = this.weapon.children[0];
    this.ammoEl = this.weapon.children[1];
    this.magEl = this.ammoEl.children[0];
    this.resEl = this.ammoEl.children[1];
    this.gEl = this.weapon.querySelector('.g');
    this.mEl = this.weapon.querySelector('.m');

    this.dmg = add(mk('hd hd-dmg'));
    for (let i = 0; i < 5; i++) { const a = mk('', '', 'i'); this.dmg.appendChild(a); this.arcs.push({ el: a, t: -9, x: 0, z: 0, op: -1 }); }
    this.pops = add(mk('hd hd-pops'));
    this.feedEl = add(mk('hd hd-feed'));
    this.promptEl = add(mk('hd hd-prompt hd-hide'));
    this.warnEl = add(mk('hd hd-warn hd-hide'));
    this.healEl = add(mk('hd hd-heal hd-hide', '治療中<div class="hd-bar"><div class="fill"></div></div>'));
    this.healFill = this.healEl.querySelector('.fill');
    this.wp = add(mk('hd hd-wp hd-hide', `<i class="arr"></i>${ICON.cart}<span></span><small>金水商行</small>`));
    this.wpArr = this.wp.children[0];
    this.wpTxt = this.wp.querySelector('span');
    this.wpSub = this.wp.querySelector('small');
    this.pickEl = add(mk('hd hd-pick'));
    this.bannerEl = add(mk('hd hd-banner'));
  }

  // ---------- 小工具 ----------
  _set(key, val, fn) { if (this.v[key] === val) return false; this.v[key] = val; fn(val); return true; }
  _flash(e, color) {
    e.animate([{ transform: 'scale(1.22)', filter: `drop-shadow(0 0 8px ${color})` }, { transform: 'scale(1)', filter: 'none' }], { duration: 650, easing: 'ease-out' });
  }

  // ---------- 生命 / 護甲 / 耐力 ----------
  setHP(hp, max) {
    const r = Math.max(0, Math.min(1, hp / (max || 100)));
    const n = Math.ceil(Math.max(0, hp));
    this._set('hp', n, (v) => { this.hpNum.textContent = v; });
    this._set('hpr', Math.round(r * 1000), () => {
      this.hpFill.style.transform = `scaleX(${r})`;
      this.hpTrail.style.transform = `scaleX(${r})`;
    });
    this._set('hplow', r < 0.35 && n > 0, (v) => this.hpRow.classList.toggle('low', v));
  }
  setArmor(a, max) {
    const n = Math.ceil(Math.max(0, a || 0));
    this._set('ar', n, (v) => { this.arNum.textContent = v; });
    this._set('arr', max > 0 ? Math.round((a / max) * 1000) : 0, (v) => { this.arFill.style.transform = `scaleX(${v / 1000})`; });
    this._set('aroff', !(max > 0 && n > 0), (v) => this.arRow.classList.toggle('off', v));
  }
  setStamina(s) {
    const has = typeof s === 'number' && Number.isFinite(s);
    this._set('sthas', has, (v) => this.stRow.classList.toggle('hd-hide', !v));
    if (!has) return;
    const q = Math.round(Math.max(0, Math.min(1, s)) * 200);
    this._set('st', q, (v) => {
      this.stFill.style.transform = `scaleX(${v / 200})`;
      this.stRow.classList.toggle('tired', v < 50);
      this.stRow.classList.toggle('full', v >= 200);
    });
  }
  healing(k) { // k = 0..1 進度;null = 不在治療
    this._set('heal', k == null ? -1 : Math.round(k * 100), (v) => {
      this.healEl.classList.toggle('hd-hide', v < 0);
      this.hpRow.classList.toggle('heal', v >= 0);
      if (v >= 0) this.healFill.style.transform = `scaleX(${v / 100})`;
    });
  }

  // ---------- 武器 / 道具 ----------
  // tier = 這把武器的改裝總等級(名稱旁顯示小菱形)
  setAmmo(name, mag, reserve, reloading, cap = 0, tier = 0) {
    // [motion] 換武器:名稱與彈藥跟著放下/舉起的節奏淡入、從下面 .35em 升上來(280ms)
    const prevName = this.v.wname;
    if (this._set('wname', name, () => {}) && prevName != null) {
      this.weapon.getAnimations().forEach((a) => a.cancel());
      this.weapon.animate([{ opacity: 0.15, translate: '0 .35em' }, { opacity: 1, translate: '0 0' }], { duration: 280, delay: 120, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
    }
    this._set('wn', `${name}|${reloading ? 1 : 0}|${tier}`, () => {
      this.wName.innerHTML = (tier ? `<i class="tier" title="改裝等級">${'◆'.repeat(Math.min(tier, 9))}</i>` : '') + esc(name) + (reloading ? '<em>換彈中…</em>' : '');
    });
    this._set('mag', mag, (v) => { this.magEl.textContent = v; });
    this._set('res', reserve, (v) => { this.resEl.textContent = `/ ${v}`; });
    const st = mag === 0 ? (reserve === 0 ? 'empty dry' : 'empty') : cap && mag <= Math.max(1, Math.floor(cap * 0.25)) ? 'low' : '';
    this._set('ammost', st + (reserve === 0 ? ' dry' : ''), (v) => { this.ammoEl.className = `hd-ammo ${v}`; });
    // 中央提示
    let warn = '', cls = '';
    if (!reloading) {
      if (mag === 0 && reserve === 0) { warn = '沒有彈藥'; cls = 'red blink'; }
      else if (mag === 0 || (cap && mag <= Math.max(1, Math.floor(cap * 0.25)) && reserve > 0)) { warn = '按 [R] 換彈'; cls = mag === 0 ? 'red' : ''; }
      else if (reserve === 0 && cap && mag <= cap) { warn = '彈藥不足'; cls = ''; }
    }
    this.warn(warn, cls);
  }
  warn(text, cls = '') {
    this._set('warn', text + '|' + cls, () => {
      this.warnEl.className = `hd hd-warn ${cls}${text ? '' : ' hd-hide'}`;
      if (text) this.warnEl.innerHTML = withKeys(text);
    });
  }
  setInv(g = 0, m = 0) {
    this._set('g', g, (v) => { this.gEl.children[1].textContent = v; this.gEl.classList.toggle('zero', !v); });
    this._set('m', m, (v) => { this.mEl.children[1].textContent = v; this.mEl.classList.toggle('zero', !v); });
  }
  flashPanel(which, color) {
    if (which === 'ammo') this._flash(this.magEl, color);
    else if (which === 'health') this._flash(this.hpNum, color);
    else if (which === 'armor') this._flash(this.arNum, color);
    else if (which === 'grenade') this._flash(this.gEl, color);
    else if (which === 'medkit') this._flash(this.mEl, color);
  }

  // ---------- 金幣 ----------
  setCoins(n, instant = false) {
    this.coinTarget = n;
    if (instant || n < this.coinShown) { this.coinShown = n; this.coinNum.textContent = n; this.v.coins = n; }
  }
  coinGain(n) {
    this._gain = (this._gainT > performance.now() ? this._gain : 0) + n;
    this._gainT = performance.now() + 1400;
    this.coinGainEl.textContent = `+${this._gain}`;
    this.coinGainEl.getAnimations().forEach((a) => a.cancel());
    this.coinGainEl.animate([{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'none', offset: 0.12 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translateY(-.3em)' }], { duration: 1800, easing: 'ease-out' });
  }
  spend(n) { // 購買時的負數跳字
    this.coinGainEl.textContent = `−${n}`;
    this.coinGainEl.getAnimations().forEach((a) => a.cancel());
    this.coinGainEl.animate([{ opacity: 1, color: '#ff8a70' }, { opacity: 0, transform: 'translateY(.6em)', color: '#ff8a70' }], { duration: 900, easing: 'ease-in' });
  }

  // ---------- 分數 / 連殺 ----------
  setScore(n, instant = false) {
    this.scoreTarget = n;
    if (instant || n < this.scoreShown) { this.scoreShown = n; this.scoreNum.textContent = n.toLocaleString('en-US'); }
  }
  // 連殺:數字 + 分數倍率 + 剩餘時間條(gap 秒內再殺一隻才延續;用遊戲時間 t,暫停/購物時不倒數)
  streak(n, mul, gap, t) {
    if (n < 2) { this._set('stk', 0, () => this.streakEl.classList.add('hd-hide')); this.streakEnd = 0; return; }
    this.streakEnd = t + gap;
    this.streakLen = gap;
    this.v.stk = n;
    this.streakEl.classList.remove('hd-hide');
    this.streakNum.textContent = `${n} 連殺`;
    this.streakMul.textContent = `×${mul.toFixed(1)}`;
    this.streakEl.classList.toggle('hot', n >= 5);
    this.streakNum.getAnimations().forEach((a) => a.cancel());
    this.streakNum.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }

  // ---------- 回合 ----------
  setRound(n) { this._set('round', n, (v) => { this.roundNum.textContent = v; }); }
  setZombies(n) {
    this._set('rs', `z${n}`, () => { this.roundSub.className = 'hd-rs'; this.roundSub.innerHTML = `還有 <b>${n}</b> 隻`; });
  }
  // next = 下一回合是特殊/首領回合時的名稱
  setRest(sec, canSkip = true, next = '') {
    const s = Math.max(0, Math.ceil(sec));
    this._set('rs', `r${s}|${canSkip}|${next}`, () => {
      this.roundSub.className = `hd-rs rest${s <= 5 ? ' urgent' : ''}`;
      this.roundSub.innerHTML = `休息 <b>${s}</b> 秒${next ? ` · 下一波 <i class="nx">${esc(next)}</i>` : ''}${canSkip ? ` · ${withKeys('[N] 不等了')}` : ''}`;
    });
  }
  setRoundText(html) { this._set('rs', `t${html}`, () => { this.roundSub.className = 'hd-rs'; this.roundSub.innerHTML = html; }); }

  // ---------- 區域 ----------
  setZone(lvl, name, id) {
    const changed = this._set('zone', `${lvl}|${id}`, () => {
      this.floorEl.textContent = lvl;
      this.zoneEl.textContent = name;
      this.zoneEl.animate([{ opacity: 0, transform: 'translateX(-.6em)' }, { opacity: 0.9, transform: 'none' }], { duration: 450, easing: 'ease-out' });
    });
    if (!changed || !name) return;
    // 第一次進入的區域(或換樓層)才顯示大標題,避免在走廊來回時一直跳
    const key = `${lvl}|${id}`;
    const floorChange = this._lastLvl && this._lastLvl !== lvl;
    this._lastLvl = lvl;
    if (this.zoneSeen.has(key) && !floorChange) return;
    this.zoneSeen.add(key);
    this.zoneBig.innerHTML = `<b>${esc(lvl)}</b> · ${esc(name)}`;
    this.zoneBig.getAnimations().forEach((a) => a.cancel());
    this.zoneBig.animate([
      { opacity: 0, transform: 'translateY(.3em)', letterSpacing: '.5em' }, { opacity: 1, transform: 'none', letterSpacing: '.32em', offset: 0.18 },
      { opacity: 1, offset: 0.78 }, { opacity: 0 },
    ], { duration: 3600, easing: 'ease-out' });
  }

  // ---------- 提示 ----------
  prompt(text, dim = false) {
    this._set('prompt', text ? `${dim ? 1 : 0}${text}` : '', () => {
      this.promptEl.className = `hd hd-prompt${text ? '' : ' hd-hide'}${dim ? ' dim' : ''}`;
      if (text) this.promptEl.innerHTML = withKeys(text);
    });
  }

  // [motion] 墨水滲開(模糊 → 清楚、微縮)、副標晚 160ms;新橫幅來時舊的先往上淡出(260ms),不硬切
  banner(text, sub = '', ms = 3500, cls = '') {
    // 上一個橫幅至少讀得完(1.9 秒)才換:例如「燈篙暗了」之後 1.4 秒就來的「金水商行開門了」
    const shown = performance.now() - (this._bannerT0 || -1e9), MIN = 1900;
    clearTimeout(this._bannerQ);
    if (shown < MIN && this._bannerLive && cls !== 'red') { this._bannerQ = setTimeout(() => this.banner(text, sub, ms, cls), MIN - shown); return; } // 紅色(危險:巨屍、追逐)馬上蓋過去
    this._bannerT0 = performance.now();
    this._bannerLive = true;
    clearTimeout(this._bannerEnd);
    this._bannerEnd = setTimeout(() => { this._bannerLive = false; }, ms);
    const e = this.bannerEl;
    const R = document.documentElement.classList.contains('mo-reduced');
    let delay = 0;
    const run = e.getAnimations().find((a) => a.playState === 'running');
    if (run) {
      const t = run.currentTime || 0, d = run.effect?.getTiming?.().duration || 0;
      if (t > 60 && t < d - 120) { // 舊的還看得到:複製一份淡出
        const g = e.cloneNode(true);
        g.style.opacity = '1';
        e.after(g);
        g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-.25em)' }], { duration: R ? 120 : 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = () => g.remove();
        delay = R ? 0 : 150;
      }
    }
    e.className = `hd hd-banner ${cls}`;
    e.innerHTML = `${esc(text)}${sub ? `<small>${withKeys(sub)}</small>` : ''}`;
    e.getAnimations().forEach((a) => a.cancel());
    const inK = Math.min(0.3, 520 / ms), outK = Math.min(0.3, 700 / ms), OUT = 'cubic-bezier(.2,.7,.2,1)', IO = 'cubic-bezier(.65,0,.35,1)';
    const kf = R
      ? [{ opacity: 0 }, { opacity: 1, offset: inK }, { opacity: 1, offset: 1 - outK }, { opacity: 0 }]
      : [{ opacity: 0, filter: 'blur(7px)', transform: 'scale(1.05)', easing: OUT }, { opacity: 1, filter: 'blur(0px)', transform: 'none', offset: inK },
        { opacity: 1, filter: 'blur(0px)', transform: 'none', offset: 1 - outK, easing: IO }, { opacity: 0, filter: 'blur(3px)', transform: 'translateY(-.18em)' }];
    e.animate(kf, { duration: ms, delay, fill: 'backwards' });
  }

  // 右側訊息列(多人時連線代理也會用):o = { color, icon, html }
  feed(text, o = {}) {
    const life = o.ms || 4200, key = String(text);
    if (merge(this.feedEl, key, life)) return; // 同一句還在畫面上:合併成「×2」並重新計時(不疊兩行一樣的)
    const e = mk('hd-msg', `${o.icon && ICON[o.icon] ? ICON[o.icon] : ''}${o.html ? text : esc(text)}`);
    e.dataset.k = key;
    if (o.color) e.style.setProperty('--c', o.color);
    this.feedEl.appendChild(e);
    while (this.feedEl.children.length > 4) this.feedEl.firstChild.remove(); // 最多 4 行(一次太多訊息讀不完)
    e.animate([{ opacity: 0, transform: 'translateX(1.5em)' }, { opacity: 1, transform: 'none', offset: 0.06 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: 'translateX(.8em)' }], { duration: life, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => e.remove();
  }

  // 擊殺跳字(準心右上)
  killPop(amount, tag = '', kind = '') {
    const e = mk(`hd-pop ${kind}`, `+${amount}${tag ? `<small>${esc(tag)}</small>` : ''}`);
    this.pops.appendChild(e);
    while (this.pops.children.length > 4) this.pops.firstChild.remove();
    const dy = (this.pops.children.length - 1) * -1.1;
    e.animate([
      { opacity: 0, transform: `translate(-.4em, ${dy + 0.6}em) scale(.8)` }, { opacity: 1, transform: `translate(0, ${dy}em) scale(1.12)`, offset: 0.12 },
      { opacity: 1, transform: `translate(0, ${dy - 0.4}em) scale(1)`, offset: 0.6 }, { opacity: 0, transform: `translate(.2em, ${dy - 1.6}em)` },
    ], { duration: 1300, easing: 'ease-out', fill: 'forwards' }).onfinish = () => e.remove();
  }

  // 撿取訊息;o = { sub, icon:'ammo'|'med'|'grenade'|..., panel:'ammo'|'health'|... }
  pickup(text, color = '#ffc35a', o = {}) {
    const key = `${text}|${o.sub || ''}`;
    if (merge(this.pickEl, key, 2000)) { if (o.panel) this.flashPanel(o.panel, color); return; } // 同一個東西連續撿:合併成「×2」
    const e = mk('hd-pk', `${o.icon && PICK_ICON[o.icon] ? PICK_ICON[o.icon] : ''}${esc(text)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`);
    e.dataset.k = key;
    e.style.color = color;
    this.pickEl.appendChild(e);
    while (this.pickEl.children.length > 3) this.pickEl.firstChild.remove();
    e.animate([
      { opacity: 0, transform: 'translateY(1em) scale(.9)' }, { opacity: 1, transform: 'scale(1.06)', offset: 0.1 }, { transform: 'scale(1)', offset: 0.18 },
      { opacity: 1, offset: 0.72 }, { opacity: 0, transform: 'translateY(-2.4em)' },
    ], { duration: 2000, easing: 'ease-out', fill: 'forwards' }).onfinish = () => e.remove();
    if (o.panel) this.flashPanel(o.panel, color);
  }

  // 受傷方向:記下來源位置,每幀依目前朝向旋轉紅色弧
  hurt(x, z, strength = 1) {
    let a = this.arcs.find((q) => Math.hypot(q.x - x, q.z - z) < 1.2 && performance.now() - q.t < 1500);
    if (!a) a = this.arcs.reduce((o, q) => (q.t < o.t ? q : o));
    a.x = x; a.z = z; a.t = performance.now(); a.k = Math.min(1, 0.55 + strength * 0.45);
  }

  // ---------- 每幀 ----------
  update(game, dt) {
    const p = game.player, now = performance.now();
    // 金幣滾動
    if (this.coinShown !== this.coinTarget) {
      const d = this.coinTarget - this.coinShown;
      this.coinShown += Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * Math.min(1, dt * 7)));
      if ((d > 0 && this.coinShown > this.coinTarget) || (d < 0 && this.coinShown < this.coinTarget)) this.coinShown = this.coinTarget;
      this._set('coins', this.coinShown, (v) => { this.coinNum.textContent = v; });
    }
    // 分數滾動
    if (this.scoreShown !== this.scoreTarget) {
      const d = this.scoreTarget - this.scoreShown;
      this.scoreShown += Math.max(1, Math.round(d * Math.min(1, dt * 8)));
      if (this.scoreShown > this.scoreTarget) this.scoreShown = this.scoreTarget;
      this.scoreNum.textContent = this.scoreShown.toLocaleString('en-US');
    }
    // 連殺剩餘時間(遊戲時間)
    if (this.streakEnd) {
      const k = (this.streakEnd - game.time) / this.streakLen;
      if (k <= 0) { this.streakEnd = 0; this.v.stk = 0; this.streakEl.classList.add('hd-hide'); }
      else this.streakFill.style.transform = `scaleX(${k.toFixed(3)})`;
    }
    // 受傷方向弧
    for (const a of this.arcs) {
      const age = (now - a.t) / 1000;
      const op = age < 1.6 ? Math.min(1, (1.6 - age) / 0.9) * a.k : 0;
      if (op <= 0) { if (a.op !== 0) { a.el.style.opacity = 0; a.op = 0; } continue; }
      const dx = a.x - p.pos.x, dz = a.z - p.pos.z;
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      const ang = Math.atan2(dx * c - dz * s, -dx * s - dz * c); // 0 = 前方,順時針為正
      a.el.style.transform = `rotate(${(ang * 57.2958).toFixed(1)}deg)`;
      a.el.style.opacity = op.toFixed(2);
      a.op = op;
    }
    // 區域(每 0.25 秒查一次)
    this.zoneT -= dt;
    if (this.zoneT <= 0) {
      this.zoneT = 0.25;
      const z = zoneInfo(game.world, p.pos);
      this.setZone(z.lvl, z.name, z.id);
    }
    this._waypoint(game);
  }

  _waypoint(game) {
    const shop = game.shop, p = game.player;
    let show = game.phase === 'shop' && shop && game.state === 'playing' && !game.shopUIOpen;
    let d = 0;
    if (show) {
      const t = shop.standPos || shop.pos;
      d = Math.hypot(t.x - p.pos.x, t.z - p.pos.z);
      const dy = t.y - p.pos.y;
      if (d < 4.5 && Math.abs(dy) < 1.5) show = false;
      else {
        _v.set(t.x, t.y + 1.4, t.z).project(game.camera);
        let x = _v.x, y = _v.y;
        const behind = _v.z > 1;
        if (behind) { x = -x; y = -y; }
        const m = 0.9;
        let edge = behind || Math.abs(x) > m || Math.abs(y) > m;
        if (edge) { const k = m / Math.max(Math.abs(x), Math.abs(y), 1e-3); x *= k; y *= k; if (behind && Math.abs(y) < m) y = -m; }
        const sx = ((x + 1) / 2) * this.W, sy = ((1 - y) / 2) * this.H;
        this.wp.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -50%)`;
        this._set('wpedge', edge, (v) => this.wp.classList.toggle('edge', v));
        if (edge) this.wpArr.style.transform = `rotate(${Math.atan2(x, y).toFixed(2)}rad)`;
        const floor = Math.abs(dy) > 2 ? (dy < 0 ? ' ↓' : ' ↑') : '';
        this._set('wpd', `${Math.round(d)}${floor}`, (v) => { this.wpTxt.textContent = `${v.replace(/ .*/, '')}m${floor}`; });
        this._set('wps', shop.levelId || '', (v) => { this.wpSub.textContent = v ? `金水商行 · ${v}` : '金水商行'; });
      }
    }
    this._set('wpshow', !!show, (v) => this.wp.classList.toggle('hd-hide', !v));
  }

  reset() {
    clearTimeout(this._bannerQ);
    for (const k of ['feedEl', 'pops', 'pickEl']) this[k].replaceChildren();
    this.streakEnd = 0;
    this.v.stk = 0;
    this.streakEl.classList.add('hd-hide');
    this.setScore(0, true);
    for (const a of this.arcs) { a.t = -9; a.op = -1; a.el.style.opacity = 0; }
    this.zoneSeen.clear();
    this._lastLvl = null;
    this.healing(null);
    this.prompt(null);
  }
}
