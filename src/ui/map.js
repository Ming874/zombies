import './map.css';
import { parseLayout } from '../map/levels.js';
import { sfx, ix as ixs } from '../audio.js';
import { canvas } from './mapink.js';
import { PX, buildFloor } from './mapdraw.js';
import { sheetGeom, tornOutline, paperCanvas, grimeCanvas, stains, creaseWear, drawFrame, TAPES } from './mappaper.js';
import { storyNotes, playerMarks } from './mapnotes.js';

// 全螢幕地圖(M):從牆上撕下來的「避難逃生路線圖 / 樓層平面配置圖」(四張一疊,1962 年設計、2003 年修訂的影印本)。
// 在黑暗裡用手電筒照著看:暖色光圈、四周暗角、手微微晃。
//  - 每層的圖面畫一次(src/ui/mapdraw.js)快取起來;沒走過的地方是印壞的淡影印,走過的地方(玩家周圍的半徑,牆會擋)變清楚。
//  - 迷霧每局重來;每幀只記錄玩家所在的格子(格子變了才算一次揭開)。地圖關著時不畫任何東西。
//  - 合成(紙上的墨:淡影印 + 清楚的部分 + 圖框圖例 + 故事筆跡 + 鉛筆記號)只在打開、翻頁、迷霧明顯變多時做一次;
//    打開時每幀只移動 DOM:圖釘、手晃、光圈(transform,不重畫)。
//  - 打開/收起是展開/摺起的動畫;PgUp/PgDn 翻頁(紙聲)。
// 對外:open(game) close() floor(d) update(game) track(game) resetRun() reveal(zoneId) poi(id, {x, z, level, label})
const INK_ROT = -0.3; // 影印時紙放歪了一點(度)
const REVEAL_IN = 5.5, REVEAL_OUT = 8.5; // 揭開半徑(格):室內 / 戶外
const PIN_COL = ['#b8241c', '#2f5fa8', '#c79a1c', '#3d7f45', '#e8e2d4', '#7a3f9a'];
const OPEN_SIGHT = (k) => !(k === '#' || k === 'E' || k === 'W');
const DEBUG = /[?&]mapdebug/.test(location.search); // ?mapdebug:印出每層繪製與合成的毫秒數

// 舊的單層地圖(world.solid)轉成同一套 layout 介面
function legacyLayout(w) {
  const W = w.w, H = w.h, rows = [];
  for (let r = 0; r < H; r++) { let s = ''; for (let c = 0; c < W; c++) s += w.isSolidCell(c, r) ? '#' : '.'; rows.push(s); }
  return { W, H, CELL: 2, levels: [{ id: '1F', name: '一樓', index: 0, y: 0, rows }], stairs: [], zones: [], obstacles: [], supplies: [], BUILDING: { c0: 0, r0: 0, c1: W - 1, r1: H - 1 },
    charAt: (li, c, r) => (c < 0 || r < 0 || c >= W || r >= H ? '#' : rows[r][c]), zoneAt: () => null, levelOfY: () => 0 };
}

export class MapUI {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
    this.floors = new Map(); // li → { crisp, faint }
    this.pois = new Map();
    const root = (this.root = document.createElement('div'));
    root.id = 'mapui';
    root.innerHTML = `
      <div class="mp-hold">
        <div class="mp-shadow"></div><div class="mp-pg p2"></div><div class="mp-pg p1"></div>
        <div class="mp-tabs"></div>
        <div class="mp-sheet"><canvas class="paper"></canvas><canvas class="base"></canvas><canvas class="grime"></canvas><div class="mp-pins"></div></div>
        <div class="mp-tapes"></div><div class="mp-flip"></div>
        <svg class="mp-clipper" viewBox="0 0 60 84"><defs><linearGradient id="mpclipg" x1="0" x2="1"><stop offset="0" stop-color="#2a2a2c"/><stop offset=".45" stop-color="#4a4a4e"/><stop offset="1" stop-color="#151516"/></linearGradient></defs>
          <path d="M19 48 L16 13 L44 13 L41 48" fill="none" stroke="#6f6f6a" stroke-width="1.8"/><path d="M16 48 L12 6 Q12 2 16 2 L44 2 Q48 2 48 6 L44 48" fill="none" stroke="#b9b8b2" stroke-width="2.6"/>
          <path d="M6 84 L12 46 L48 46 L54 84 Z" fill="url(#mpclipg)"/><rect x="11" y="45" width="38" height="5" rx="2" fill="#5a5a5e"/><path d="M14 52 L10 80" stroke="rgba(255,255,255,.16)" stroke-width="1.5"/></svg>
      </div>
      <div class="mp-anim"><div class="half l"></div><div class="half r"><i class="back"></i><i class="shade"></i></div></div>
      <div class="mp-light"><i class="tint"></i><i class="dark"></i></div>
      <div class="mp-keys"><kbd>PgUp</kbd><kbd>PgDn</kbd>翻樓層<span></span><kbd>M</kbd>收起地圖</div>`;
    document.body.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.hold = q('.mp-hold'); this.sheetEl = q('.mp-sheet'); this.tabsEl = q('.mp-tabs'); this.pinsEl = q('.mp-pins'); this.flipEl = q('.mp-flip');
    this.paperEl = q('canvas.paper'); this.baseEl = q('canvas.base'); this.grimeEl = q('canvas.grime');
    this.anim = q('.mp-anim'); this.halfL = q('.half.l'); this.halfR = q('.half.r');
    this.lightT = q('.mp-light .tint'); this.lightD = q('.mp-light .dark');
    this.pins = new Map();
    this.sway = { x: 0, a: 0, yaw: null };
    window.addEventListener('resize', () => { if (this.isOpen) this._fit(); });
    setTimeout(() => this._prewarm(), 2000);
    root.addEventListener('animationend', (e) => { if (e.target === root && root.classList.contains('closing')) this._hide(); });
  }

  // ---------- 預熱:暖機完成(hz:warm)後、還在選單時,用閒置時間分幾段把紙、字型、各層圖面先畫好 ----------
  // 第一次合成要初始化字型(標楷體、明體)、濾鏡與圖樣,約 200ms;在選單裡做掉,開局後第一次按 M 就只剩幾毫秒。
  // 開局了就停(剩下的留到第一次打開時再做);遊戲中不做任何事。
  _prewarm() {
    const g = this.ui?.game;
    const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 120));
    if (!g?.world || !performance.getEntriesByName('hz:warm').length) { setTimeout(() => this._prewarm(), 1500); return; }
    this._layout(g);
    const steps = [
      () => { if (!this.sheet) this._makeSheet(); },
      () => { const c = canvas(8, 8).getContext('2d'); for (const f of ['"DFKai-SB", "BiauKai", "標楷體", "KaiTi", serif', '"Noto Serif TC", "Source Han Serif TC", "PMingLiU", serif', '"Microsoft JhengHei", sans-serif', '"Bahnschrift", sans-serif']) { c.font = `700 14px ${f}`; c.fillText('聖心醫院避難逃生路線圖燈不能熄第七晚', 0, 8); } },
      () => this._floor(this.L.start?.level ?? 0),
      () => { this.li = this.L.start?.level ?? 0; this.game = g; this._compose(); this.comp = null; }, // 第一次合成(字型、濾鏡、圖樣初始化)
      ...this.L.levels.map((l) => () => this._floor(l.index)),
    ];
    const run = () => {
      if (!steps.length || g.state === 'playing' || this.isOpen) return;
      try { steps.shift()(); } catch (e) { console.warn('[map] prewarm', e); return; }
      idle(run);
    };
    idle(run);
  }

  // ---------- 資料來源(每幀會被 track 呼叫:用 world 判斷有沒有換地圖) ----------
  _layout(game) {
    const w = game.world;
    if (w && w === this._world) return this.L;
    this._world = w;
    const L = w?.layout || (w?.solid && w.w ? legacyLayout(w) : (this._parsed ||= parseLayout()));
    if (L !== this.L) this._setLayout(L);
    return L;
  }
  _setLayout(L) {
    this.L = L;
    for (const f of this.floors.values()) { f.crisp.width = 0; f.faint.width = 0; }
    this.floors.clear();
    this.G = sheetGeom(L);
    this.sheet = null; // 紙(輪廓、紙張、髒汙)在第一次打開時才做
    this.comp = null;
    this._resetFog();
  }
  _resetFog() {
    const L = this.L, n = L.levels.length, N = L.W * L.H;
    this.fog = { lv: Array.from({ length: n }, () => new Uint8Array(N)), n: new Array(n).fill(0) };
    this.seen = new Set();
    this.marksN = 0;
    this._last = -1;
    this._vis = new Uint32Array(N); this._q = new Int32Array(N); this._stamp = 0;
    for (const p of this.pois.values()) p.seen = !!p.always;
  }
  resetRun() { if (this.L) { this._resetFog(); this.comp = null; } } // 新的一局:迷霧重來

  // ---------- 迷霧:每幀(遊戲進行中)記錄玩家走到哪;格子沒變就什麼都不做 ----------
  track(game) {
    const p = game.player;
    if (!p?.pos) return;
    this._g = game;
    const L = this._layout(game), C = L.CELL || 2;
    const li = this._levelOf(game, p.pos.y), c = Math.floor(p.pos.x / C), r = Math.floor(p.pos.z / C);
    const key = (li * L.H + r) * L.W + c;
    if (key === this._last) return;
    this._last = key;
    if (!(c >= 0 && r >= 0 && c < L.W && r < L.H && li >= 0 && li < L.levels.length)) return; // 地圖外或座標壞掉(NaN)
    const k = L.charAt(li, c, r);
    this._reveal(li, c, r, k === ',' || k === '"' || k === 'z' ? REVEAL_OUT : REVEAL_IN);
  }
  _levelOf(game, y) { return game.world?.levelAt ? game.world.levelAt(y + 0.2) : this.L.levelOfY ? this.L.levelOfY(y + 0.2) : 0; }
  // 從 (c0, r0) 往外擴散(四鄰),碰到牆停;牆、窗、電梯本身也算看過
  _reveal(li, c0, r0, R) {
    const L = this.L, W = L.W, H = L.H, F = this.fog.lv[li], vis = this._vis, q = this._q, R2 = R * R;
    const stamp = ++this._stamp, shut = this._shutCells(li);
    let added = 0, qt = 0;
    const mark = (i) => { if (!F[i]) { F[i] = 1; added++; } };
    const i0 = r0 * W + c0;
    vis[i0] = stamp; q[qt++] = i0; mark(i0);
    for (let qh = 0; qh < qt; qh++) {
      const i = q[qh], c = i % W, r = (i / W) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
        const j = nr * W + nc;
        if (!OPEN_SIGHT(L.charAt(li, nc, nr)) || shut.has(j)) { mark(j); continue; } // 牆、窗、電梯、上鎖的門:看得到它,看不到後面
        if ((dc && dr) || vis[j] === stamp || (nc - c0) ** 2 + (nr - r0) ** 2 > R2) continue;
        vis[j] = stamp; mark(j); q[qt++] = j;
      }
    }
    if (added) { this.fog.n[li] += added; this._seeAround(li); }
  }
  _shutCells(li) { // 這一層還鎖著的門所在的格子
    const out = new Set(), L = this.L, C = L.CELL || 2, g = this._g, ix = g?.interact;
    for (const w of ix?.doors?.list || []) {
      if (!w.lock || w.li !== li || w.lock.open) continue;
      const f = w.lock.flag;
      if (f && (ix.flags?.has?.(f) || g.objectives?.has?.(f))) continue;
      out.add(Math.floor(w.cz / C) * L.W + Math.floor(w.cx / C));
    }
    return out;
  }
  // 揭開的格子上如果有補給櫃、樓梯、劇情點,記下來(之後畫鉛筆記號)
  _seeAround(li) {
    const L = this.L, F = this.fog.lv[li], C = L.CELL || 2, W = L.W;
    const at = (x, z) => F[Math.floor(z / C) * W + Math.floor(x / C)];
    for (const s of this._supplies()) {
      const k = `s${s.x},${s.z}`;
      if ((s.level ?? 0) === li && !this.seen.has(k) && at(s.x, s.z)) { this.seen.add(k); this.marksN++; }
    }
    for (const s of L.stairs || []) {
      if (s.lower !== li && s.upper !== li) continue;
      const k = `t${s.id}@${li}`;
      if (this.seen.has(k)) continue;
      let hit = false;
      for (let r = s.r0; r <= s.r1 && !hit; r++) for (let c = s.c0; c <= s.c1; c++) if (F[r * W + c]) { hit = true; break; }
      if (hit) { this.seen.add(k); this.marksN++; }
    }
    for (const p of this.pois.values()) if (!p.seen && (p.level ?? 0) === li && at(p.x, p.z)) { p.seen = true; this.marksN++; }
  }
  _supplies() { const g = this.game || this._g; const w = g?.world; return w?.supplies?.length ? w.supplies : this.L.supplies || []; }

  // 劇情系統:整區揭開(例如拿到平面圖上的某一頁)、登記劇情點
  reveal(zoneId) {
    const L = this.L, z = L?.zones?.find((q) => q.id === zoneId);
    if (!z) return;
    const F = this.fog.lv[z.levelIndex];
    for (const [c0, r0, c1, r1] of z.rects) for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) if (c >= 0 && r >= 0 && c < L.W && r < L.H && !F[r * L.W + c]) { F[r * L.W + c] = 1; this.fog.n[z.levelIndex]++; }
    this._seeAround(z.levelIndex);
  }
  poi(id, o) { if (o) this.pois.set(id, { ...o, seen: !!o.always }); else this.pois.delete(id); this.marksN++; }

  // ---------- 開關 ----------
  open(game) {
    this.game = game; this._g = game;
    this._layout(game);
    this.track(game);
    const p = game.player;
    this.me = this._levelOf(game, p.pos.y);
    this.li = this.me;
    if (!this.sheet) this._makeSheet();
    this._tabs();
    this._fit();
    this._compose();
    this.isOpen = true;
    const root = this.root;
    root.classList.remove('closing');
    root.classList.add('on');
    this._unfold();
    this.update(game);
    if (ixs.paper) ixs.paper(); else sfx.uiClick();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    ixs.paperClose?.();
    if (this._reduced()) { this._hide(); return; }
    this._snapshotHalves();
    this.root.classList.add('closing');
    this.hold.style.visibility = 'hidden';
    this.anim.className = 'mp-anim fold';
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => this._hide(), 600); // animationend 沒來(分頁在背景)也要收掉
  }
  _hide() {
    clearTimeout(this._hideT);
    if (this.isOpen) return;
    this.root.classList.remove('on', 'closing');
    this.anim.className = 'mp-anim';
    this._freeHalves();
  }
  _reduced() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }

  floor(d) {
    if (!this.L || !this.isOpen) return;
    const n = this.L.levels.length, li = Math.max(0, Math.min(n - 1, this.li + d));
    if (li === this.li) return;
    this._flip(d);
    this.li = li;
    this._tabs();
    this._compose();
    this.update(this.game);
    (ixs.pageTurn || ixs.paper)?.();
  }

  // ---------- 紙(四張共用) ----------
  _makeSheet() {
    const G = this.G, sh = tornOutline(G);
    this.sheet = sh;
    const paper = paperCanvas(G, sh), grime = grimeCanvas(G, sh);
    for (const [el, src] of [[this.paperEl, paper], [this.grimeEl, grime]]) { el.width = src.width; el.height = src.height; el.getContext('2d').drawImage(src, 0, 0); src.width = 0; }
    this.baseEl.width = G.W; this.baseEl.height = G.H;
    this.bx = this.baseEl.getContext('2d');
    for (const el of [this.hold, this.sheetEl]) { el.style.width = `${G.W}px`; el.style.height = `${G.H}px`; }
    this.sheetEl.style.clipPath = sh.clip;
    for (const el of this.root.querySelectorAll('.mp-pg')) el.style.clipPath = sh.clip;
    this.root.style.setProperty('--ink-rot', `${INK_ROT}deg`);
    this.root.querySelector('.mp-tapes').innerHTML = TAPES(G).map(([x, y, a], i) => `<i style="left:${x}px;top:${y}px;transform:translate(-50%,-50%) rotate(${a}rad)" class="t${i}"></i>`).join('');
    const clip = this.root.querySelector('.mp-clipper'); // 長尾夾夾在左邊(夾身壓在紙邊,把手翻到紙外)
    clip.style.left = '-32px'; clip.style.top = `${Math.round(G.H * 0.24 - 42)}px`;
    this.anim.style.width = `${G.W}px`; this.anim.style.height = `${G.H}px`;
  }

  _fit() {
    const G = this.G, vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.min((vw - 40) / (G.W + 90), (vh - 46) / (G.H + 36));
    this.k = k;
    this.root.style.setProperty('--k', k.toFixed(4));
    for (const el of [this.hold, this.anim]) { el.style.marginLeft = `${-G.W / 2}px`; el.style.marginTop = `${-G.H / 2}px`; }
    this._place(0, 0, 0);
  }
  _place(dx, dy, a) { // 手晃:整疊紙一起動(只改 transform)
    const t = `translate(${(dx - 26 * this.k).toFixed(1)}px, ${(dy - 14).toFixed(1)}px) scale(${this.k.toFixed(4)}) rotate(${a.toFixed(3)}deg)`;
    this.hold.style.transform = t;
    this.anim.style.transform = t;
  }

  _tabs() {
    const L = this.L, n = L.levels.length, G = this.G;
    const gap = Math.min(150, (G.H - 260) / Math.max(1, n));
    this.tabsEl.innerHTML = L.levels.slice().reverse().map((l, i) => `<div class="tab${l.index === this.li ? ' on' : ''}${l.index === this.me ? ' me' : ''}" style="top:${110 + i * gap}px"><b>${l.id}</b><i></i></div>`).join('');
  }

  // ---------- 合成:這一層的墨 ----------
  _floor(li) {
    let f = this.floors.get(li);
    if (!f) { const t0 = performance.now(); f = buildFloor(this.L, li); this.floors.set(li, f); if (DEBUG) console.log(`[map] floor ${this.L.levels[li].id} drawn in ${Math.round(performance.now() - t0)}ms`); }
    return f;
  }
  _locks() {
    const g = this.game, ix = g?.interact, out = [];
    for (const w of ix?.doors?.list || []) {
      if (!w.lock) continue;
      const L = this.L, C = L.CELL || 2, flag = w.lock.flag;
      const open = !!(w.lock.open || (flag && (ix.flags?.has?.(flag) || g.objectives?.has?.(flag))));
      const z = L.zones?.find((q) => q.id === w.lock.door);
      const c = Math.floor(w.cx / C), r = Math.floor(w.cz / C), F = this.fog.lv[w.li];
      const name = z ? (/^\S+ (\d+)$/.exec(z.name)?.[1] || z.name) : '';
      out.push({ li: w.li, x: w.cx, z: w.cz, open, axis: w.leaves?.[0]?.axis, rects: z?.rects, name, seen: !!F?.[r * L.W + c] });
    }
    return out;
  }
  _state() {
    const L = this.L, g = this.game;
    const supplies = this._supplies().map((s) => ({ ...s, seen: this.seen.has(`s${s.x},${s.z}`) }));
    const stairs = (L.stairs || []).map((s) => ({ ...s, seen: this.seen.has(`t${s.id}@${this.li}`) })).filter((s) => s.lower === this.li || s.upper === this.li);
    return { shop: g?.world?.shop || L.shop, supplies, stairs, locks: this._locks(), pois: [...this.pois.values()] };
  }
  _sig(st) { return `${this.li}|${this.fog.n[this.li]}|${this.marksN}|${st.locks.map((k) => `${k.open ? 1 : 0}${k.seen ? 1 : 0}`).join('')}|${this._team() ? 1 : 0}`; }
  _team() { return (this.game?.players?.length || 1) > 1; }

  _compose() {
    const st = this._state(), sig = this._sig(st);
    if (this.comp?.sig === sig) return false; // 內容沒變(同一層、迷霧與記號都一樣):畫布上已經是這一張
    const t0 = performance.now();
    const L = this.L, G = this.G, li = this.li, x = this.bx, f = this._floor(li);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, G.W, G.H);
    // 1. 走過的地方:清楚的影印(迷霧遮罩,邊緣柔化)
    const m = this._mask(li);
    x.save(); x.translate(G.ox, G.oy);
    x.drawImage(f.crisp, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    x.filter = 'blur(6px)'; x.imageSmoothingEnabled = true;
    x.drawImage(m, 0, 0, G.pw, G.ph);
    x.filter = 'none';
    x.restore();
    // 2. 沒走過的地方:印壞的淡影印(反向遮罩),墊在清楚的那一層後面
    const hw = f.faint.width, hh = f.faint.height;
    if (!this.tmp || this.tmp.width !== hw) this.tmp = canvas(hw, hh);
    const t = this.tmp.getContext('2d');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, hw, hh); t.drawImage(f.faint, 0, 0);
    t.globalCompositeOperation = 'destination-out'; t.filter = 'blur(3px)'; t.drawImage(m, 0, 0, hw, hh); t.filter = 'none';
    x.save(); x.globalCompositeOperation = 'destination-over'; x.drawImage(this.tmp, G.ox, G.oy, G.pw, G.ph); x.restore();
    // 3. 圖框、標題欄、圖例
    drawFrame(x, G, L, li, { team: this._team() });
    // 4. 故事的筆跡(紙上本來就有的)
    x.save(); x.translate(G.ox, G.oy); storyNotes(x, L, li); x.restore();
    // 5. 摺痕磨掉的墨、這一張自己的汙漬
    creaseWear(x, G);
    stains(x, G, li);
    // 6. 玩家的鉛筆記號
    x.save(); x.translate(G.ox, G.oy); playerMarks(x, L, li, st); x.restore();
    this.comp = { sig, t: performance.now(), n: this.fog.n[li] };
    if (DEBUG) console.log(`[map] compose ${L.levels[li].id} ${Math.round(performance.now() - t0)}ms`);
    return true;
  }
  _mask(li) {
    const L = this.L, F = this.fog.lv[li];
    if (!this.maskC) { this.maskC = canvas(L.W, L.H); this.maskImg = this.maskC.getContext('2d').createImageData(L.W, L.H); }
    if (this.maskC.width !== L.W || this.maskC.height !== L.H) { this.maskC.width = L.W; this.maskC.height = L.H; this.maskImg = this.maskC.getContext('2d').createImageData(L.W, L.H); }
    const d = this.maskImg.data;
    for (let i = 0; i < F.length; i++) d[i * 4 + 3] = F[i] ? 255 : 0;
    this.maskC.getContext('2d').putImageData(this.maskImg, 0, 0);
    return this.maskC;
  }

  // ---------- 每幀(打開時):手晃、光圈、圖釘;迷霧明顯變多才重新合成 ----------
  update(game) {
    if (!this.isOpen) return;
    this.game = game;
    const now = performance.now(), t = now / 1000, p = game.player;
    // 邊走邊看:新揭開的格子夠多(或隔一陣子)才重畫
    const n = this.fog.n[this.li], cn = this.comp?.n ?? 0;
    if (now - (this.comp?.t || 0) > 600 && (n - cn >= 6 || now - (this.comp?.t || 0) > 2500)) this._compose();
    // 手晃 + 轉頭時紙跟著偏一點
    const sw = this.sway, yaw = p.yaw || 0;
    if (sw.yaw == null) sw.yaw = yaw;
    const dyaw = Math.atan2(Math.sin(yaw - sw.yaw), Math.cos(yaw - sw.yaw));
    sw.yaw = yaw;
    sw.x += (Math.max(-24, Math.min(24, dyaw * 260)) - sw.x) * 0.08;
    const k = this.k || 1;
    const dx = (Math.sin(t * 0.83) * 3.5 + Math.sin(t * 2.1) * 1.2) * k * 1.6 - sw.x * k, dy = (Math.sin(t * 1.13 + 1) * 2.6 + Math.sin(t * 2.7) * 0.8) * k * 1.6;
    this._place(dx, dy, Math.sin(t * 0.61) * 0.28 + Math.sin(t * 1.7) * 0.08 + sw.x * 0.01);
    // 手電筒光圈:慢慢游移,偏向自己的圖釘(照著自己在哪裡);手電筒關著就小一圈、暗一點
    const on = p.flashOn !== false;
    const pin = this._pinScreen(game);
    const lx = Math.sin(t * 0.37) * 44 + Math.sin(t * 1.3) * 8 - sw.x * 3 + pin[0] * 0.3, ly = Math.sin(t * 0.29 + 1.2) * 30 + Math.sin(t * 1.1) * 6 - 20 + pin[1] * 0.3;
    this._ls = (this._ls ?? 1) + ((on ? 1 : 0.8) - (this._ls ?? 1)) * 0.12; // 開關手電筒時光圈慢慢縮放
    const s = this._ls;
    const lt = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) scale(${s})`;
    this.lightT.style.transform = lt; this.lightD.style.transform = lt;
    this.root.classList.toggle('dim', !on);
    this._pins(game);
  }

  _pinScreen(game) { // 自己的圖釘相對畫面中央的位置(px;不在這一層就回傳 0)
    const p = game.player, L = this.L, G = this.G, C = L.CELL || 2;
    if (!p?.pos || this._levelOf(game, p.pos.y) !== this.li) return [0, 0];
    return [((G.ox + (p.pos.x / C) * PX) - G.W / 2) * this.k, ((G.oy + (p.pos.z / C) * PX) - G.H / 2) * this.k];
  }

  _pins(game) {
    const L = this.L, G = this.G, C = L.CELL || 2;
    const alive = new Set();
    (game.players || [game.player]).forEach((pl, i) => {
      if (!pl || pl.alive === false || !pl.pos) return;
      alive.add(pl);
      let e = this.pins.get(pl);
      const me = pl === game.player;
      if (!e) {
        const el = document.createElement('div');
        el.className = `pin${me ? ' me' : ''}`;
        el.innerHTML = '<i class="tick"></i><i class="sh"></i><i class="hd"></i><b></b>';
        el.style.setProperty('--pc', me ? PIN_COL[0] : PIN_COL[1 + ((i - 1) % (PIN_COL.length - 1))]);
        this.pinsEl.appendChild(el);
        e = { el, tick: el.querySelector('.tick'), lab: el.querySelector('b'), txt: '' };
        this.pins.set(pl, e);
      }
      const li = this._levelOf(game, pl.pos.y), here = li === this.li;
      const px = G.ox + (pl.pos.x / C) * PX, py = G.oy + (pl.pos.z / C) * PX;
      e.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      e.el.classList.toggle('away', !here);
      e.tick.style.transform = `rotate(${(-(pl.yaw || 0)).toFixed(3)}rad)`;
      const txt = me ? (here ? '' : `我在 ${L.levels[li]?.id || ''}`) : `${pl.name || pl.nick || '隊友'}${here ? '' : ` · ${L.levels[li]?.id || ''}`}`;
      if (txt !== e.txt) { e.txt = txt; e.lab.textContent = txt; }
    });
    for (const [pl, e] of this.pins) if (!alive.has(pl)) { e.el.remove(); this.pins.delete(pl); }
    if (this.me !== this._levelOf(game, game.player.pos.y)) { this.me = this._levelOf(game, game.player.pos.y); this._tabs(); }
  }

  // ---------- 動畫:展開 / 摺起(對摺的右半張繞摺線轉過來)、翻頁 ----------
  _snapshot(x, sx0, w) { // 把紙 + 墨 + 髒汙畫成一張(給動畫用)
    const G = this.G;
    x.drawImage(this.paperEl, sx0 / 2, 0, w / 2, G.H / 2, 0, 0, w, G.H);
    x.save(); x.translate(-sx0, 0); x.translate(G.W / 2, G.H / 2); x.rotate((INK_ROT * Math.PI) / 180); x.translate(-G.W / 2, -G.H / 2); x.drawImage(this.baseEl, 0, 0); x.restore();
    x.globalCompositeOperation = 'multiply';
    x.drawImage(this.grimeEl, sx0 / 2, 0, w / 2, G.H / 2, 0, 0, w, G.H);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(this.paperEl, sx0 / 2, 0, w / 2, G.H / 2, 0, 0, w, G.H);
    x.globalCompositeOperation = 'source-over';
  }
  _snapshotHalves() {
    const G = this.G, hw = Math.round(G.W / 2);
    this._freeHalves();
    for (const [el, sx0, w] of [[this.halfL, 0, hw], [this.halfR, hw, G.W - hw]]) {
      const c = canvas(w, G.H);
      c.className = 'snap';
      this._snapshot(c.getContext('2d'), sx0, w);
      el.style.width = `${w}px`;
      el.prepend(c);
      if (el === this.halfR) { // 摺起來時看到的背面:空白,但薄紙透出一點反過來的墨
        const bk = canvas(w, G.H), bx = bk.getContext('2d');
        bk.className = 'snap';
        bx.fillStyle = '#c9b993'; bx.fillRect(0, 0, w, G.H);
        bx.globalCompositeOperation = 'multiply'; bx.globalAlpha = 0.13;
        bx.translate(w, 0); bx.scale(-1, 1); bx.drawImage(c, 0, 0);
        bx.globalCompositeOperation = 'destination-in'; bx.globalAlpha = 1; bx.drawImage(c, 0, 0);
        el.querySelector('.back').appendChild(bk);
      }
    }
    this.halfR.style.left = `${hw}px`;
  }
  _freeHalves() { for (const c of this.anim.querySelectorAll('canvas.snap')) { c.width = 0; c.remove(); } }
  _unfold() {
    clearTimeout(this._hideT);
    if (this._reduced()) { this.hold.style.visibility = ''; this.anim.className = 'mp-anim'; return; }
    this._snapshotHalves();
    this.hold.style.visibility = 'hidden';
    this.anim.className = 'mp-anim';
    void this.anim.offsetWidth; // 重新開始動畫
    this.anim.className = 'mp-anim unfold';
    clearTimeout(this._unfoldT);
    this._unfoldT = setTimeout(() => { if (!this.isOpen) return; this.hold.style.visibility = ''; this.hold.classList.remove('show'); void this.hold.offsetWidth; this.hold.classList.add('show'); this.anim.className = 'mp-anim'; this._freeHalves(); }, 540);
  }
  _flip(d) {
    if (this._reduced()) return;
    const G = this.G;
    if (!this.flipC) { this.flipC = canvas(G.W, G.H); this.flipEl.appendChild(this.flipC); }
    const x = this.flipC.getContext('2d');
    x.clearRect(0, 0, G.W, G.H);
    this._snapshot(x, 0, G.W);
    this.flipEl.className = 'mp-flip';
    void this.flipEl.offsetWidth;
    this.flipEl.className = `mp-flip go ${d > 0 ? 'up' : 'down'}`;
  }
}

