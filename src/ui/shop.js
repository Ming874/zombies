import * as THREE from 'three';
import './shop.css';
import { ICON } from './icons.js';
import { WEAPONS } from '../weapons/weapon.js';
import { createDisplayGun } from '../weapons/models.js';
import { pickupModel } from '../pickups.js';
import { buildVest, statOf, moddedStats, MOD_DEFS, roman, weaponName, modTotal, MOD_MAX } from '../shop.js';
import { sfx } from '../audio.js';
import { SPECIAL, waveKind } from '../game/waves.js';

// 商店介面:分頁(武器 / 彈藥 / 改裝 / 裝備)、左側清單、右側 3D 預覽 + 數值條(與手上武器比較)+ 購買。
// 3D 預覽用獨立的小 WebGLRenderer,只在商店開啟時運作,關閉時釋放。
// 操作:滑鼠點選 / 雙擊購買 / 按鈕;鍵盤 1–4 或 ←→ Q Tab 切分頁、↑↓ W S 選擇、Enter 空白鍵 購買、E 離開、Esc 暫停、N 下一回合。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STAT_ROWS = [['damage', '傷害'], ['rate', '射速'], ['accuracy', '精準'], ['range', '射程'], ['mobility', '機動']];
const fmt = (v, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const WICON = { pistol: 'pistol', revolver: 'revolver', shotgun: 'shotgun', ak47: 'rifle', m4a1: 'rifle', barrett: 'sniper' };
const BADGE = { weapon: '武器 · WEAPON', ammo: '彈藥 · AMMUNITION', mod: '改裝 · MODIFICATION', gear: '裝備 · EQUIPMENT' };
const AFFORD = new Set(['buy', 'part']);

// ---------- 3D 預覽 ----------
class Preview {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
    this.camera.position.set(0, 0.42, 3.6);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff2e2, 0x2a2420, 1.25));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.8);
    key.position.set(2.2, 3, 2.6);
    const rim = new THREE.DirectionalLight(0xffb070, 2.2);
    rim.position.set(-3, 1.4, -2.5);
    const fill = new THREE.DirectionalLight(0x9fb8d0, 0.8);
    fill.position.set(-2, -0.5, 2);
    this.scene.add(key, rim, fill);
    // 地面陰影圓盤
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.rotY = -1.2;
    this.tilt = 0.12;
    this.auto = 1;
    this.popT = 0;
    this.key = '';
    this.own = []; // 需要釋放的資源(背心的材質/貼圖)
    host.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY };
      this.auto = 0;
      host.setPointerCapture?.(e.pointerId);
    });
    host.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.rotY += (e.clientX - this.drag.x) * 0.012;
      this.tilt = Math.max(-0.5, Math.min(0.7, this.tilt + (e.clientY - this.drag.y) * 0.006));
      this.drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { this.drag = null; clearTimeout(this.autoT); this.autoT = setTimeout(() => { this.auto = 1; }, 2500); };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }

  start() {
    if (this.renderer) { // [motion] 第二次以後:沿用同一個 context(shader 已編好,開店不再卡 0.5~1.3 秒)
      if (!this.raf) this._loop();
      this.resize();
      return;
    }
    // 每次開啟都換新的 canvas(釋放後舊 canvas 的 context 已遺失)
    this.canvas?.remove();
    this.canvas = document.createElement('canvas');
    this.host.prepend(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch { this.renderer = null; return; }
    const r = this.renderer;
    r.debug.checkShaderErrors = !import.meta.env?.PROD; // [motion] 正式版不查 shader 錯誤日誌(getProgramInfoLog 會同步等編譯完成,開店卡 0.6 秒)
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._loop();
  }

  _loop() {
    let last = performance.now();
    const loop = (now) => {
      if (!this.renderer) { this.raf = 0; return; }
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.auto) this.rotY += dt * 0.45;
      // 購買時:轉一圈並彈一下
      if (this.popT > 0) {
        this.popT = Math.max(0, this.popT - dt);
        const k = this.popT / 0.6;
        this.rotY += dt * 11 * k * k;
        this.pivot.scale.setScalar(1 + 0.16 * Math.sin(k * Math.PI));
      }
      this.pivot.rotation.set(this.tilt, this.rotY, 0, 'XYZ');
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // [motion] 店門拉起時(還沒走到店裡)在閒置時段先建好預覽的 context,並用 compileAsync 把每種商品模型的 shader 編好:
  // 第一次開店不再卡 0.5~1.3 秒(KHR_parallel_shader_compile:不擋主執行緒)
  // ok():現在可以做嗎(選單閒置、或燈篙熄的時候;開場演出與戰鬥中不做 —— 第一個步驟含環境貼圖的 PMREM,約 0.6 秒)
  warm(list, ok = () => true) {
    if (this._warm) return;
    this._warm = true;
    const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 250 }) : setTimeout(fn, 60));
    const items = list || [];
    let i = -1;
    const step = async () => {
      if (this.raf) return; // 商店已經開了:正常流程接手
      if (!ok()) { setTimeout(() => idle(step), 1000); return; }
      if (i < 0) { this.start(); cancelAnimationFrame(this.raf); this.raf = 0; i = 0; return idle(step); }
      const r = this.renderer;
      if (!r || i >= items.length) { this.clear(); this.key = ''; this._warmDone = performance.now(); return; }
      this.show(items[i++]);
      try { await r.compileAsync(this.scene, this.camera); } catch { /* 舊瀏覽器:第一次畫的時候再編 */ }
      idle(step);
    };
    idle(step);
  }

  // [motion] 關店只停止繪製、清掉模型,保留 renderer 與 canvas(下次開店不用重建 context、重編 shader)
  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clear();
    this.key = '';
  }

  dispose() {
    this.stop();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.canvas?.remove();
    this.canvas = null;
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(10, this.host.clientWidth), h = Math.max(10, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    this.pivot.clear();
    this.pivot.scale.setScalar(1);
    for (const o of this.own) o?.dispose?.(); // 背心部分材質沒有貼圖(map 為 null)
    this.own.length = 0;
  }

  pop() { this.popT = 0.6; }

  // 依商品顯示模型
  show(pv) {
    const key = pv ? `${pv.type}:${pv.id || ''}` : '';
    if (key === this.key) return;
    this.key = key;
    this.clear();
    if (!pv) return;
    this.rotY = pv.type === 'gun' ? 0.32 : pv.type.startsWith('vest') ? 0.45 : 0.62; // 每個商品從好看的角度開始轉
    this.tilt = pv.type === 'gun' ? 0.1 : 0.22;
    this.auto = 1;
    let obj = null;
    if (pv.type === 'gun') {
      try { obj = createDisplayGun(pv.id); } catch { obj = null; }
      if (obj) { const w = new THREE.Group(); obj.rotation.y = Math.PI / 2; w.add(obj); obj = w; }
    } else if (pv.type === 'vest_light' || pv.type === 'vest_heavy') {
      obj = buildVest(pv.type === 'vest_heavy');
      obj.traverse((o) => { if (o.isMesh) { this.own.push(o.geometry); if (!this.own.includes(o.material)) this.own.push(o.material, o.material.map); } });
    } else if (pv.type === 'grenade' || pv.type === 'grenade3') {
      obj = new THREE.Group();
      const at = pv.type === 'grenade' ? [[0, 0.2, 0]] : [[-0.06, 0.4, 0], [0.06, -0.7, 0], [0, 1.6, 0.07]];
      for (const [x, ry, z] of at) { const g = pickupModel('grenade'); g.position.set(x, 0, z + x * 0.6); g.rotation.set(0, ry, x * 3); obj.add(g); }
    } else if (pv.type === 'medkit') obj = pickupModel('med');
    else if (pv.type === 'ammo' || pv.type === 'bigammo') obj = pickupModel(pv.type);
    if (!obj) { // 尚未有模型:問號板
      obj = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x3a3c3a, roughness: 0.6 }));
      this.own.push(obj.geometry, obj.material);
    }
    // 置中並縮放到固定大小
    const wrap = new THREE.Group();
    wrap.add(obj);
    const box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = 1.75 / Math.max(size.x, size.y * 1.6, size.z, 1e-3);
    obj.position.sub(c);
    wrap.scale.setScalar(s);
    this.pivot.add(wrap);
    this.shadow.position.y = -size.y * s * 0.5 - 0.02;
    this.shadow.scale.set(Math.max(0.6, size.x * s * 0.6), 1, 1);
  }
}

// ---------- 小工具:數值條 ----------
// 單一數值條:a = 目前值(0..1),b = 購買/升級後(綠色延伸),mark = 比較對象(手上武器)的刻度
function bar(a, b = a, mark = null) {
  const hi = Math.max(a, b);
  return `<div class="sh-bar">${b > a + 1e-3 ? `<i class="nx" style="transform:scaleX(${hi.toFixed(3)})"></i>` : ''}<i class="cur" style="transform:scaleX(${Math.min(a, b).toFixed(3)})"></i>${b < a - 1e-3 ? `<i class="dn" style="left:${(b * 100).toFixed(1)}%;width:${((a - b) * 100).toFixed(1)}%"></i>` : ''}${mark != null ? `<b class="mk" style="left:${(Math.min(1, mark) * 100).toFixed(1)}%"></b>` : ''}</div>`;
}
const delta = (d) => (Math.abs(d) < 1 ? '<em></em>' : `<em class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}</em>`);
// 數量格子(手榴彈/醫療包):已有 / 購買後新增 / 空
const pips = (have, add, cap) => `<span class="sh-cnt">${Array.from({ length: cap }, (_, i) => `<i class="${i < have ? 'on' : i < have + add ? 'nx' : ''}"></i>`).join('')}</span>`;

// ---------- 商店介面 ----------
export class ShopUI {
  constructor(ui) {
    this.ui = ui;
    this.tabIx = 0;
    this.sel = {};
    this.isOpen = false;
    const root = (this.root = document.createElement('div'));
    root.id = 'shopui';
    root.innerHTML = `
      <div class="sh-panel">
        <div class="sh-head">
          <div class="sh-title"><b>金水商行</b><small>KIM-SUI STORE · 臨時補給點</small></div>
          <div class="sh-rest"></div>
          <div class="sh-coins">${ICON.coin}<span>0</span></div>
        </div>
        <div class="sh-tabs"></div>
        <div class="sh-body">
          <div class="sh-list"></div>
          <div class="sh-detail">
            <div class="sh-view"><span class="badge"></span><span class="hint">拖曳旋轉</span><div class="sh-stamp"></div></div>
            <div class="sh-info"></div>
          </div>
        </div>
        <div class="sh-foot">
          <span><kbd>1</kbd>–<kbd>4</kbd>分頁</span><span><kbd>↑</kbd><kbd>↓</kbd>選擇</span><span><kbd>Enter</kbd>購買</span><span><kbd>E</kbd>離開</span>
          <span class="sp"></span>
          <button class="sh-btn ghost" data-act="close">離開<kbd>E</kbd></button>
          <button class="sh-btn ghost" id="shopNext">不等了，直接開始下一波<kbd>N</kbd></button>
        </div>
        <div class="sh-toast"></div>
      </div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.panel = q('.sh-panel');
    this.tabsEl = q('.sh-tabs');
    this.listEl = q('.sh-list');
    this.infoEl = q('.sh-info');
    this.restEl = q('.sh-rest');
    this.coinBox = q('.sh-coins');
    this.coinEl = q('.sh-coins span');
    this.badge = q('.sh-view .badge');
    this.stampEl = q('.sh-stamp');
    this.toastEl = q('.sh-toast');
    this.preview = new Preview(q('.sh-view'));

    // 滑鼠(事件委派)
    this.tabsEl.addEventListener('click', (e) => { const t = e.target.closest('.sh-tab'); if (t) this.setTab(+t.dataset.i); });
    this.listEl.addEventListener('click', (e) => { const it = e.target.closest('.sh-item'); if (it) this.select(it.dataset.key, true); });
    this.listEl.addEventListener('dblclick', (e) => { const it = e.target.closest('.sh-item'); if (it) { this.select(it.dataset.key); this.buy(); } });
    this.listEl.addEventListener('mouseover', (e) => {
      const it = e.target.closest('.sh-item');
      if (!it || it.dataset.key === this._hoverKey) return;
      this._hoverKey = it.dataset.key;
      const now = performance.now();
      if (now - (this._hoverT || 0) > 70) { this._hoverT = now; sfx.shopHover(); }
    });
    this.infoEl.addEventListener('click', (e) => { if (e.target.closest('[data-act="buy"]')) this.buy(); });
    q('[data-act="close"]').addEventListener('click', () => this.game?.closeShop(true));
    root.addEventListener('mousedown', (e) => { if (e.target === root) this.game?.closeShop(true); }); // 點面板外關閉
  }

  get tabs() { return this._tabs || []; }
  get tab() { return this.tabs[this.tabIx] || { items: [] }; }
  get items() { return this.tab.items.filter((i) => !i.header); }
  get item() { return this.items.find((i) => i.key === this.sel[this.tab.id]) || this.items[0] || null; }

  open(game) {
    this.game = game;
    this.isOpen = true;
    clearTimeout(this._closeT);
    this.root.classList.remove('closing');
    this.root.classList.add('on');
    this.coinShown = game.player.coins;
    this.coinEl.textContent = this.coinShown;
    this._tabs = game.shopTabs();
    // 第一次開啟:有買得起的新武器就停在武器頁,否則跳到彈藥/改裝
    if (!this._opened) {
      this._opened = true;
      const t = this.tabs.findIndex((x) => x.items.some((i) => !i.header && AFFORD.has(i.state)));
      if (t >= 0) this.tabIx = t;
    }
    this.refresh();
    this.preview.start();
    this.preview.show(this.item?.preview);
    // 第一次開商店:操作說明(新手提示,只出現一次)
    const T = this.ui.tips;
    if (T?.enabled && !T.has('shopui')) {
      T.seen.add('shopui');
      T._save();
      setTimeout(() => { if (this.isOpen) this.toast('[1]–[4] 切換分頁 · ↑↓ 選擇 · Enter 購買 · 雙擊也能購買 · E 離開', 'info', 5200); }, 450);
    }
  }

  // 店門拉起時呼叫:預覽的 shader 先在背景編好
  warm() {
    try {
      const pv = [];
      for (const t of this.game?.shopTabs?.() || []) for (const it of t.items || []) if (it.preview && !pv.some((q) => q.type === it.preview.type && q.id === it.preview.id)) pv.push(it.preview);
      const g = this.game;
      this.preview.warm(pv, () => !g || (g.state === 'menu' ? !g.motion?.busy && !document.hidden : g.state === 'playing' && g.phase !== 'fighting'));
    } catch (e) { console.warn('[shop] warm', e); }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    // [motion] 關門:面板往下 10px 淡出(160ms),不擋操作(pointer-events:none)
    this.root.classList.add('closing');
    this.root.classList.remove('on');
    clearTimeout(this._closeT);
    this._closeT = setTimeout(() => this.root.classList.remove('closing'), 170);
    this.preview.stop();
  }

  coins(n) {
    if (!this.isOpen) return;
    this.coinEl.textContent = n;
    this.coinBox.classList.remove('bump', 'poor');
    void this.coinBox.offsetWidth; // 重新觸發動畫(只在購買時)
    this.coinBox.classList.add('bump');
  }

  refresh() {
    this._tabs = this.game.shopTabs();
    this.renderTabs();
    this.renderList();
    this.renderInfo();
    const g = this.game;
    const sp = SPECIAL[waveKind((g.round || 0) + 1)];
    this.restEl.innerHTML = g.phase === 'shop' || g.phase === 'break'
      ? `下一波還有 <b>${Math.max(0, Math.ceil(g.restT))}</b> 秒${g.net ? '' : ' · 買東西時暫停'}<br />下一波：第 ${(g.round || 0) + 1} 波${sp ? ` · <i>${esc(sp.name)}</i>` : ''}` : '';
  }

  renderTabs() {
    this.tabsEl.innerHTML = this.tabs.map((t, i) => {
      const n = t.items.filter((x) => !x.header && AFFORD.has(x.state)).length;
      return `<div class="sh-tab${i === this.tabIx ? ' on' : ''}" data-i="${i}"><kbd>${i + 1}</kbd>${esc(t.name)}${n ? `<span class="cnt">${n}</span>` : ''}</div>`;
    }).join('');
  }

  _icon(it) {
    if (it.kind === 'weapon' || it.kind === 'mod') return it.kind === 'mod' ? ICON[it.icon] || ICON.gear : ICON[WICON[it.id]] || ICON.rifle;
    return ICON[it.icon] || ICON.ammo;
  }

  renderList() {
    const t = this.tab, cur = this.item, g = this.game, coins = g.player.coins;
    if (!this.items.length) { this.listEl.innerHTML = `<div class="sh-empty">${esc(t.empty || '目前沒有商品')}</div>`; return; }
    this.listEl.innerHTML = t.items.map((it) => {
      if (it.header) {
        const tot = it.total != null ? `<span class="tot">改裝 ${it.total}/${MOD_MAX}</span>` : '';
        return `<div class="sh-group"><span>${esc(it.name)}</span>${tot}</div>`;
      }
      let right;
      if (it.state === 'owned') right = '<span class="tag own">已擁有</span>';
      else if (it.state === 'equipped') right = '<span class="tag eq">使用中</span>';
      else if (it.state === 'max') right = `<span class="tag max">${it.kind === 'mod' ? '已滿級' : it.id === 'heal' ? '生命已滿' : it.def?.armor && g.player.maxArmor > it.def.armor ? '已有更好' : '已滿'}</span>`;
      else if (it.state === 'na') right = `<span class="tag na">${it.id === 'armor_fix' ? '需要背心' : '未到貨'}</span>`;
      else if (it.state === 'part') right = `<span class="pr part">${ICON.coin}${it.price}<small>${it.quote.part.mags} 個彈匣</small></span>`;
      else right = `<span class="pr">${ICON.coin}${it.price}${it.state === 'poor' ? `<small>差 ${it.price - coins}</small>` : ''}</span>`;
      const lv = it.kind === 'mod' ? `<span class="sh-pips">${Array.from({ length: it.max }, (_, k) => `<i class="${k < it.level ? 'on' : ''}"></i>`).join('')}</span>` : '';
      const name = it.kind === 'mod' ? `${esc(MOD_DEFS[it.mod].name)}${lv}` : esc(it.name);
      const slot = it.kind === 'weapon' && it.slot ? `<kbd class="slot">${it.slot}</kbd>` : '';
      return `<div class="sh-item ${it.state}${cur && it.key === cur.key ? ' sel' : ''}" data-key="${esc(it.key)}"><span class="ic">${this._icon(it)}${slot}</span><span class="nm"><b>${name}</b><small>${esc(it.sub || '')}</small></span>${right}</div>`;
    }).join('');
    this.listEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }

  // ---------- 詳情 ----------
  renderInfo() {
    const it = this.item, g = this.game, p = g.player;
    if (!it) { this.infoEl.innerHTML = ''; this.preview.show(null); this.badge.textContent = ''; return; }
    this.preview.show(it.preview);
    this.badge.textContent = BADGE[it.kind] || '';
    let body = '';
    if (it.kind === 'weapon') body = this._weaponInfo(it);
    else if (it.kind === 'mod') body = this._modInfo(it);
    else if (it.kind === 'ammo') body = this._ammoInfo(it);
    else body = this._gearInfo(it, p);
    const st = it.state;
    const LABEL = {
      weapon: { buy: '購買', poor: '錢不夠', owned: '裝備', equipped: '使用中' },
      mod: { buy: '升級', poor: '錢不夠', max: '已滿級' },
      ammo: { buy: '補滿', poor: '錢不夠', max: '已滿', part: `購買 ${it.quote?.part?.mags || 0} 個彈匣` },
      gear: { buy: it.id === 'heal' ? '治療' : it.id === 'armor_fix' ? '修補' : '購買', poor: '錢不夠', max: it.id === 'heal' ? '生命已滿' : it.id === 'armor_fix' ? '無需修補' : '已滿', na: '需要背心' },
    };
    const label = LABEL[it.kind]?.[st] || (st === 'na' ? '未到貨' : '購買');
    const disabled = st === 'equipped' || st === 'max' || st === 'na';
    const showPrice = st === 'buy' || st === 'poor' || st === 'part';
    const short = st === 'poor' ? `<small>還差 ${it.price - p.coins}</small>` : '';
    const price = showPrice ? `<div class="sh-price${st === 'poor' ? ' poor' : ''}">${ICON.coin}${it.price}${short}</div>` : '';
    const title = it.kind === 'mod'
      ? `${esc(MOD_DEFS[it.mod].name)} ${st === 'max' ? roman(it.max) : roman(it.level + 1)}<small>${esc(weaponName(it.weapon))} · 等級 ${it.level}/${it.max}</small>`
      : `${esc(it.name)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}`;
    this.infoEl.innerHTML = `<h3>${title}</h3><div class="sh-buy">${price}<button class="sh-btn${st === 'poor' ? ' poor' : ''}" data-act="buy" ${disabled ? 'disabled' : ''}>${label}<kbd>Enter</kbd></button></div>
      <div class="sh-desc">${esc(it.desc || '')}</div>${body}`;
  }

  // 武器:五項數值條,刻度 = 手上武器(含改裝);右側數字顯示差值
  _weaponInfo(it) {
    const g = this.game, w = g.weapons, id = it.id, def = WEAPONS[id];
    const mine = moddedStats(id, w.has(id) ? w.mods?.[id] : {});
    const cmp = w.current && w.current !== id ? w.current : null;
    const other = cmp ? moddedStats(cmp, w.mods?.[cmp]) : null;
    const rows = STAT_ROWS.map(([k, label]) => {
      const a = mine[k] ?? 0, o = other ? other[k] ?? 0 : null;
      return `<span>${label}</span>${bar(a, a, o)}<em>${Math.round(a * 100)}</em>${o != null ? delta((a - o) * 100) : '<em></em>'}`;
    }).join('');
    const head = other ? `<div class="sh-cmp"><i class="mk"></i>刻度:手上的 <b>${esc(weaponName(cmp))}</b>${modTotal(g, cmp) ? `(改裝 ${modTotal(g, cmp)})` : ''} · 右側為差值</div>` : '';
    let facts = '';
    if (def) {
      const owned = w.has(id), v = (k) => (owned ? statOf(w, id, k) : def[k]);
      const dmg = v('damage');
      facts = `<div class="sh-facts"><span>傷害<b>${fmt(dmg, dmg % 1 ? 1 : 0)}${def.pellets ? ` ×${def.pellets}` : ''}</b></span><span>射速<b>${def.rpm}</b> RPM</span><span>彈匣<b>${Math.round(v('mag'))}</b></span>`
        + `<span>換彈<b>${fmt(def.shellReload ? v('reload') : v('reload'), 2)}s</b>${def.shellReload ? '/發' : ''}</span><span>備彈上限<b>${def.reserveCap}</b></span>`
        + `${def.penetrate ? `<span>穿透<b>${def.penetrate}</b> 隻</span>` : ''}${def.ads ? `<span>開鏡<b>${def.ads.zoom}×</b>${def.ads.scope ? ' 狙擊鏡' : ''}</span>` : ''}<span><b>${def.auto ? '全自動' : def.pump ? '泵動' : '半自動'}</b></span>`
        + `${owned && modTotal(g, id) ? `<span>改裝<b>${modTotal(g, id)}/${MOD_MAX}</b></span>` : ''}</div>`;
    }
    return `${head}<div class="sh-stats cmp">${rows}</div>${facts}`;
  }

  // 改裝:等級軌(每級價格遞增)、升級前後數值條、受影響的數字
  _modInfo(it) {
    const g = this.game, w = g.weapons, id = it.weapon, def = WEAPONS[id], D = MOD_DEFS[it.mod];
    const mods = w.mods?.[id] || {};
    const maxed = it.state === 'max';
    const cur = moddedStats(id, mods);
    const nxt = maxed ? cur : moddedStats(id, { ...mods, [it.mod]: D.mul[it.level + 1] });
    const track = `<div class="sh-track">${it.prices.map((pr, i) => {
      const cls = i < it.level ? 'done' : i === it.level ? 'next' : 'lock';
      return `<div class="${cls}"><b>${roman(i + 1)}</b><span>${esc(D.tiers[i])}</span><small>${i < it.level ? `${ICON.check}已安裝` : `${ICON.coin}${pr}`}</small></div>`;
    }).join('')}</div>`;
    const rows = STAT_ROWS.map(([k, label]) => {
      const a = cur[k] ?? 0, b = nxt[k] ?? a;
      return `<span>${label}</span>${bar(a, b)}<em class="${b > a + 1e-3 ? 'up' : ''}">${Math.round(b * 100)}</em>${delta((b - a) * 100)}`;
    }).join('');
    let facts = '';
    if (def) {
      const after = (k) => def[k] * (k === it.mod && !maxed ? D.mul[it.level + 1] : mods[k] ?? 1);
      const line = (k, label, d = 0, unit = '') => {
        const now = statOf(w, id, k), nx = k === 'mag' ? Math.round(after(k)) : after(k);
        const hot = k === it.mod && !maxed;
        return `<span class="${hot ? 'hot' : ''}">${label}<b>${fmt(now, d)}${unit}</b>${hot ? ` → <b class="up">${fmt(nx, d)}${unit}</b>` : ''}</span>`;
      };
      facts = `<div class="sh-facts">${line('damage', '傷害', def.damage % 1 || it.mod === 'damage' ? 1 : 0)}${line('mag', '彈匣')}${line('reload', '換彈', 2, 's')}${line('spread', '散布', 4)}</div>`;
    }
    return `${track}<div class="sh-stats">${rows}</div>${facts}`;
  }

  // 彈藥:彈匣/備彈條(綠色 = 購買後)
  _ammoInfo(it) {
    const g = this.game, w = g.weapons;
    if (it.id === 'ammo_all') {
      const rows = (it.quotes || []).map((q) => `<span>${esc(weaponName(q.id))}</span>${bar((q.mag + q.reserve) / (q.magCap + q.resCap), 1)}<em>${q.missing ? `+${q.missing}` : '滿'}</em><em class="pr">${q.missing ? q.price : ''}</em>`).join('');
      const save = it.full > it.price ? `<span>原價<b class="strike">${it.full}</b></span><span>省下<b class="up">${it.full - it.price}</b></span>` : '';
      return `<div class="sh-stats ammo">${rows}</div><div class="sh-facts">${save}<span>每一波開始也會自動補 <b>2</b> 個彈匣</span></div>`;
    }
    const q = it.quote, part = it.state === 'part' && q.part;
    const add = part ? q.part.rounds : q.missing;
    const m2 = Math.min(q.magCap, q.mag + add), r2 = Math.min(q.resCap, q.reserve + Math.max(0, add - (q.magCap - q.mag)));
    const rows = `<span>彈匣</span>${bar(q.mag / q.magCap, m2 / q.magCap)}<em>${q.mag}</em><em class="${m2 > q.mag ? 'up' : ''}">${m2 > q.mag ? `→${m2}` : ''}</em>`
      + `<span>備彈</span>${bar(q.reserve / q.resCap, r2 / q.resCap)}<em>${q.reserve}</em><em class="${r2 > q.reserve ? 'up' : ''}">${r2 > q.reserve ? `→${r2}` : ''}</em>`;
    const facts = `<div class="sh-facts"><span>缺少<b>${q.missing}</b> 發</span><span>單價<b>${q.per}</b>/發</span><span>補滿<b>${q.price}</b></span><span>每個彈匣<b>${q.perMag}</b></span>${part ? `<span class="warn">錢只夠買 <b>${q.part.mags}</b> 個彈匣（+${q.part.rounds} 發）</span>` : ''}${w.current === it.weapon ? '<span><b>手上武器</b></span>' : ''}</div>`;
    return `<div class="sh-stats ammo">${rows}</div>${facts}`;
  }

  _gearInfo(it, p) {
    const d = it.def || {};
    if (d.armor || it.id === 'armor_fix') {
      const max = Math.max(p.maxArmor || 0, d.armor || 0, 1), now = p.armor || 0;
      const after = d.armor ? Math.max(now, d.armor) : p.maxArmor || 0;
      const rows = `<span>護甲</span>${bar(now / 100, after / 100)}<em>${Math.ceil(now)}</em><em class="${after > now ? 'up' : ''}">${after > now ? `→${Math.ceil(after)}` : ''}</em>`;
      return `<div class="sh-stats ammo">${rows}</div><div class="sh-facts"><span>吸收<b>60%</b> 傷害</span><span>上限<b>${max}</b></span>${d.armor ? `<span>${d.armor >= 100 ? '插板 · 移動不受影響' : '輕量 · 不影響移動'}</span>` : `<span>修補費<b>${d.per || 2}</b>/點</span>`}</div>`;
    }
    if (it.id === 'grenade' || it.id === 'grenade3') {
      const have = p.grenades || 0, add = Math.max(0, Math.min(d.add, d.cap - have));
      return `<div class="sh-facts big"><span>持有 ${pips(have, it.state === 'max' ? 0 : add, d.cap)}<b>${have}/${d.cap}</b></span><span>投擲鍵<b>G</b></span><span>引信<b>約 3 秒</b></span><span>半徑<b>約 6m</b></span></div>`;
    }
    if (it.id === 'medkit') {
      const have = p.medkits || 0;
      return `<div class="sh-facts big"><span>持有 ${pips(have, it.state === 'max' ? 0 : 1, d.cap)}<b>${have}/${d.cap}</b></span><span>使用鍵<b>H</b></span><span>回復<b>50</b> / 2 秒</span></div>`;
    }
    if (it.id === 'heal') {
      const rows = `<span>生命</span>${bar(p.hp / p.maxHp, 1)}<em>${Math.ceil(p.hp)}</em><em class="${p.hp < p.maxHp ? 'up' : ''}">${p.hp < p.maxHp ? `→${p.maxHp}` : ''}</em>`;
      return `<div class="sh-stats ammo">${rows}</div><div class="sh-facts"><span>每點生命<b>1</b> 元</span><span>每一波結束時也會自動回復 <b>20</b></span></div>`;
    }
    return '';
  }

  setTab(i) {
    const n = this.tabs.length;
    i = ((i % n) + n) % n;
    if (i === this.tabIx) return;
    this.tabIx = i;
    sfx.shopTab();
    this.renderTabs();
    this.renderList();
    this.renderInfo();
  }

  select(key, sound = false) {
    if (this.sel[this.tab.id] === key) return;
    this.sel[this.tab.id] = key;
    if (sound) sfx.uiClick();
    for (const el of this.listEl.querySelectorAll('.sh-item')) el.classList.toggle('sel', el.dataset.key === key);
    this.listEl.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    this.renderInfo();
  }

  move(d) {
    const list = this.items;
    if (!list.length) return;
    const i = Math.max(0, list.findIndex((x) => x.key === this.item?.key));
    this.select(list[Math.max(0, Math.min(list.length - 1, i + d))].key);
    sfx.shopHover();
  }

  buy() {
    const it = this.item;
    if (!it || !this.game) return;
    const key = it.key;
    this.sel[this.tab.id] = key;
    const r = this.game.buy(key);
    this.refresh();
    if (r.ok) {
      this.coinShown = this.game.player.coins;
      if (!r.equip) { this.coins(this.coinShown); this._float(`−${r.price}`); }
      this.toast(r.equip ? r.msg : `${r.msg} · −${r.price}`, 'ok');
      this.listEl.querySelector(`[data-key="${CSS.escape(key)}"]`)?.classList.add('ok-flash');
      this.infoEl.querySelector('.sh-btn')?.animate([{ filter: 'brightness(1.9)' }, { filter: 'none' }], { duration: 450 });
      this.stamp(r.equip ? '已裝備' : r.sound === 'upgrade' ? '升級完成' : r.sound === 'ammo' ? '已補充' : r.sound === 'heal' ? '已治療' : '已購買', r.sound === 'upgrade' ? 'up' : r.equip ? 'eq' : '');
      if (!r.equip) this.preview.pop();
    } else {
      this.toast(r.msg || '無法購買', r.reason === 'coins' ? 'bad' : 'max');
      const pr = this.infoEl.querySelector('.sh-price');
      pr?.classList.remove('shake'); void pr?.offsetWidth; pr?.classList.add('shake');
      if (r.reason === 'coins') { this.coinBox.classList.remove('poor', 'bump'); void this.coinBox.offsetWidth; this.coinBox.classList.add('poor'); }
      this.panel.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 220 });
    }
  }

  // 預覽上的大印章(購買/升級/裝備成功)
  stamp(text, cls = '') {
    const s = this.stampEl;
    s.textContent = text;
    s.className = `sh-stamp ${cls}`;
    s.getAnimations().forEach((a) => a.cancel());
    s.animate([
      { opacity: 0, transform: 'translate(-50%, -50%) rotate(-9deg) scale(1.7)' }, { opacity: 1, transform: 'translate(-50%, -50%) rotate(-9deg) scale(.96)', offset: 0.14 },
      { opacity: 1, transform: 'translate(-50%, -50%) rotate(-9deg) scale(1)', offset: 0.22 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translate(-50%, -50%) rotate(-9deg) scale(1.04)' },
    ], { duration: 1300, easing: 'ease-out' });
  }

  _float(text) {
    const pr = this.coinBox.getBoundingClientRect(), pp = this.panel.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'sh-float';
    f.textContent = text;
    f.style.left = `${pr.left - pp.left + 20}px`;
    f.style.top = `${pr.bottom - pp.top + 2}px`;
    this.panel.appendChild(f);
    f.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(26px)' }], { duration: 900, easing: 'ease-in' }).onfinish = () => f.remove();
  }

  toast(text, kind = 'ok', ms = 1800) {
    const t = this.toastEl;
    t.textContent = text;
    t.className = `sh-toast ${kind}`;
    t.getAnimations().forEach((a) => a.cancel());
    t.animate([{ opacity: 0, transform: 'translate(-50%, -6px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: Math.min(0.12, 220 / ms) }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
  }

  // 由遊戲的按鍵處理轉來(商店開啟時所有按鍵都到這裡)
  onKey(e) {
    const g = this.game;
    const c = e.code;
    const dig = /^Digit([1-4])$/.exec(c) || /^Numpad([1-4])$/.exec(c);
    if (dig) { this.setTab(+dig[1] - 1); return; }
    switch (c) {
      case 'ArrowUp': case 'KeyW': e.preventDefault(); this.move(-1); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); this.move(1); break;
      case 'Home': e.preventDefault(); this.move(-99); break;
      case 'End': e.preventDefault(); this.move(99); break;
      case 'ArrowLeft': case 'KeyA': case 'KeyQ': this.setTab(this.tabIx - 1); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); this.setTab(this.tabIx + 1); break;
      case 'Tab': e.preventDefault(); this.setTab(this.tabIx + (e.shiftKey ? -1 : 1)); break;
      case 'Enter': case 'NumpadEnter': case 'Space': e.preventDefault(); this.buy(); break;
      case 'KeyE': g.closeShop(true); break;
      case 'Escape': g.closeShop(false); g.paused = true; g.ui.overlay('pause', true); break;
      case 'KeyN': if (!g.net) g.nextRound(); break; // 多人時 N(準備)由連線模組處理
      default:
    }
  }
}

