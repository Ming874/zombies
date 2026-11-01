import './interact.css';
import { withKeys } from '../ui/icons.js';
import * as THREE from 'three';
import { ix as ixs } from '../audio.js';
import { captions, cutEl } from '../ui/captions.js';

// 互動系統的介面:按住進度條、字幕(電話/收音機/廣播)、紙條與錄音帶閱讀器、密碼鍵盤/病歷終端、保險絲盒、身上的道具。
// HUD 元件掛在 #hud(沿用 hud.css 的 .hd / .hd-bar / .fill 樣式);全螢幕面板(閱讀器等)掛在 body。
// 面板開著時:單人遊戲暫停世界(不放開滑鼠鎖定);多人世界不停,受傷或移動就自動收起。
// 按鍵在 window 捕獲階段處理(比 flow.js / input.js 早),面板吃掉的按鍵不會切武器、不會走路。
const mk = (cls, html = '', tag = 'div') => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { note: '紙條', letter: '信', log: '紀錄', chart: '病歷', photo: '照片', tape: '錄音帶', drawing: '蠟筆畫', poster: '告示', whiteboard: '白板', logbook: '登記簿', polaroid: '拍立得', report: '通報單', video: '錄影帶' };
const _v = new THREE.Vector3();
// 老式電話聽筒圖示(響鈴提示用)
const PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class IxUI {
  constructor(game) {
    this.game = game;
    this.ix = null;
    const hud = game.ui?.hudEl || document.body;
    this.holdEl = hud.appendChild(mk('hd ix-hold hd-hide', '<span></span><div class="hd-bar"><div class="fill"></div></div>'));
    this.holdTxt = this.holdEl.children[0];
    this.holdFill = this.holdEl.querySelector('.fill');
    this.invEl = hud.appendChild(mk('hd ix-inv hd-hide'));
    this.subs = [];
    this._hold = { on: null, k: -1 };
    this.modal = null;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.modal && !this.modal.keepOnUnlock) this.closeModal(false); });
  }

  // ---------- 按住進度 ----------
  holdBar(label, k) {
    const on = label && k > 0.001 ? label : null;
    if (on !== this._hold.on) { this._hold.on = on; this.holdEl.classList.toggle('hd-hide', !on); if (on) this.holdTxt.textContent = `${on}…`; }
    if (on) { const q = Math.round(k * 200); if (q !== this._hold.k) { this._hold.k = q; this.holdFill.style.transform = `scaleX(${q / 200})`; } }
  }

  // ---------- 身上的道具 ----------
  setInv(list) {
    this.invEl.classList.toggle('hd-hide', !list.length);
    this.invEl.innerHTML = list.map((it) => `<span>${esc(it.name)}${it.n > 1 ? ` <b>×${it.n}</b>` : ''}</span>`).join('');
  }

  // ---------- 字幕 ----------
  // say({ who, text, ms, color, tag, critical, speak }) → handle { close() }
  // 放在唯一的字幕區(src/ui/captions.js):有 who = 說話的字(一次一個人;同一個人的上一句變淡);沒有 who = 聲音字幕(有人在講就不出、限頻)
  // speak = 實際說話的秒數(沒給就用 ms 估);critical = 劇情的句子(不會被擋)
  say(o) {
    const who = o.who || '', sound = !who;
    if (sound ? !captions.sound(o.text) : !o.critical && !captions.can(who)) return { e: null, close() {} };
    const lines = String(o.text || '').split('\n');
    const e = mk(`ix-sub${o.tag ? ' ' + o.tag : ''}${sound ? ' snd' : ''}`, `${who ? `<b style="color:${o.color || '#cfd8d2'}">${esc(who)}</b>` : ''}<span>${lines.map(esc).join('<br>')}</span>`);
    captions.root().appendChild(e);
    const ms = sound ? Math.min(o.ms || 2200, 2600) : Math.max(o.ms || 0, 1400 + [...String(o.text || '')].length * 200); // 至少夠讀完(語音很快時也不會一閃就走);聲音字幕短短的
    const h = { e, t: setTimeout(() => h.close(), ms), close() { clearTimeout(h.t); captions.drop(h.q); if (!e.isConnected) return; e.classList.add('out'); setTimeout(() => e.remove(), 400); } };
    h.q = captions.add({ el: e, who, kind: sound ? 'sound' : 'speech', critical: !!o.critical, until: captions.now() + (o.speak ?? Math.max(0.6, ms / 1000 - 1.2)), cut: () => { clearTimeout(h.t); cutEl(e); } });
    this.subs.push(h);
    if (this.subs.length > 6) this.subs.shift();
    return h;
  }
  clearSubs() { for (const h of this.subs) h.close(); this.subs.length = 0; }

  // ---------- 面板共用 ----------
  openModal(m) {
    this.closeModal(false);
    const g = this.game;
    this.modal = m;
    if (this.ix) this.ix.modal = m;
    m.paused = !g.net && g.state === 'playing' && !g.paused;
    if (m.paused) g.paused = true; // 單人:世界暫停(不放開滑鼠鎖定)
    m.hurt = g.player?.lastHurt;
    document.body.appendChild(m.el);
    requestAnimationFrame(() => m.el.classList.add('on'));
    if (g.net) m.watch = setInterval(() => { if (g.player.lastHurt !== m.hurt) this.closeModal(); }, 150); // 多人:受傷就收起
    if (g.input) { g.input.fireHeld = false; g.input.firePressed = false; }
  }
  closeModal(sound = true) {
    const m = this.modal;
    if (!m) return;
    this.modal = null;
    if (this.ix) this.ix.modal = null;
    clearInterval(m.watch);
    m.onClose?.(sound);
    m.el.classList.remove('on');
    setTimeout(() => m.el.remove(), 220);
    const g = this.game;
    if (m.paused && g.paused && !document.getElementById('pause')?.classList.contains('on')) g.paused = false; // 是我們暫停的(不是 Esc 叫出的暫停選單)才恢復
  }
  onKey(e) {
    const m = this.modal;
    if (!m) return;
    if (e.code === 'Escape') { this.closeModal(); return; } // 放開滑鼠鎖定 → 暫停選單照常出現
    if (e.code === 'KeyJ' && !e.repeat && this.game.deduce) { e.stopImmediatePropagation(); e.preventDefault(); this.closeModal(false); this.game.deduce.open(); return; } // [story] 閱讀器開著也能直接翻推理本
    if (this.game.net && MOVE.has(e.code) && !m.keys?.has?.(e.code)) { this.closeModal(); return; } // 多人:一移動就收起(世界沒停)
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.repeat && e.code === 'KeyE') return;
    if (m.onKey?.(e) === true) return;
    if (e.code === 'KeyE' || e.code === 'Tab' || (!this.game.net && MOVE.has(e.code) && !m.keys?.has?.(e.code))) this.closeModal();
  }

  // ---------- 紙條 / 錄音帶 ----------
  // note:{ id, kind, title, author, date, body, lines }。tape 時 opts.player = 正在播的 { idx } 會即時標示目前那一行
  reader(note, opts = {}) {
    const kind = note.kind || 'note', tape = kind === 'tape';
    const hand = /note|letter|drawing|log|whiteboard|logbook/.test(kind) && kind !== 'chart';
    const el = mk(`ix-modal ix-reader ${tape ? 'tape' : 'paper'}${hand ? ' hand' : ''} k-${kind}`);
    const body = tape && note.lines
      ? `<ol class="tr">${note.lines.map(([who, text]) => `<li><b>${esc(who)}</b>${esc(text)}</li>`).join('')}</ol>`
      : `<div class="tx">${esc(note.body).replace(/\n/g, '<br>')}</div>`;
    el.innerHTML = `<div class="sheet"><div class="kd">${esc(KIND[kind] || '文件')}${note.where && typeof note.where === 'string' ? ` · ${esc(note.where)}` : ''}</div>
      <h2>${esc(note.title)}</h2>${note.author || note.date ? `<div class="meta">${esc([note.author, note.date].filter(Boolean).join(' · '))}</div>` : ''}${body}</div>
      <div class="ft">${withKeys(tape ? '[E] 收起（錄音帶繼續播） · [J] 筆記本 · [Esc] 暫停選單' : '[E] 收起 · [J] 筆記本 · [Esc] 暫停選單')}${this.game.net ? ' · 移動或受傷會自動收起' : ''}</div>`;
    const m = { el, kind: 'reader', note, onClose: (s) => { if (s) ixs.paperClose(); opts.onClose?.(); } };
    if (tape) m.mark = (i) => { const li = el.querySelectorAll('.tr li'); li.forEach((x, j) => x.classList.toggle('on', j === i)); li[i]?.scrollIntoView?.({ block: 'nearest' }); };
    this.openModal(m);
    ixs.paper();
    return m;
  }

  // ---------- 密碼鍵盤 / 病歷終端 ----------
  // o:{ title, len(位數), sub, terminal:true(輸入後顯示回應而不是開鎖), check(code) → { ok, text } }
  keypad(o) {
    const len = o.len || 4;
    const el = mk(`ix-modal ix-keypad${o.terminal ? ' term' : ''}`);
    el.innerHTML = `<div class="pad"><div class="kt">${esc(o.title)}</div>${o.sub ? `<div class="ks">${esc(o.sub)}</div>` : ''}
      <div class="disp">${'<i></i>'.repeat(len)}</div><div class="out"></div>
      <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '↵'].map((k) => `<span>${k}</span>`).join('')}</div>
      <div class="ft">${withKeys('[0]~[9] 輸入 · [Enter] 確認 · [⌫] 刪除 · [E] 離開')}</div></div>`;
    const cells = [...el.querySelectorAll('.disp i')], out = el.querySelector('.out');
    let code = '', lock = false;
    const show = () => cells.forEach((c, i) => { c.textContent = code[i] ?? ''; c.classList.toggle('on', i < code.length); });
    const flash = (k) => { const s = [...el.querySelectorAll('.keys span')].find((x) => x.textContent === String(k)); if (s) { s.classList.add('hit'); setTimeout(() => s.classList.remove('hit'), 120); } };
    const submit = () => {
      if (lock || !code.length) return;
      const r = o.check(code) || {};
      out.innerHTML = esc(r.text || '').replace(/\n/g, '<br>');
      el.classList.toggle('ok', !!r.ok); el.classList.toggle('bad', !r.ok && !o.terminal);
      if (r.ok && !o.terminal) { lock = true; setTimeout(() => this.closeModal(false), 900); return; }
      code = ''; setTimeout(show, o.terminal ? 0 : 450);
    };
    const m = {
      el, kind: 'keypad', keys: new Set(),
      onKey: (e) => {
        const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
        if (d) { if (code.length < len) { code += d[1]; ixs.dtmf(d[1]); flash(d[1]); show(); if (code.length === len && !o.terminal) setTimeout(submit, 160); } return true; }
        if (e.code === 'Backspace') { code = code.slice(0, -1); flash('⌫'); show(); return true; }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { flash('↵'); submit(); return true; }
        return false;
      },
      onClose: o.onClose,
    };
    show();
    this.openModal(m);
    return m;
  }

  // ---------- 保險絲盒 / 配電 ----------
  // o:{ title, sub(), rows() → [{ label, on, can }], toggle(i) }
  panel(o) {
    const el = mk('ix-modal ix-fuse');
    const draw = () => {
      el.innerHTML = `<div class="pad"><div class="kt">${esc(o.title)}</div><div class="ks">${esc(o.sub?.() || '')}</div>
        <ul>${o.rows().map((r, i) => `<li class="${r.on ? 'on' : ''}${r.can === false ? ' no' : ''}"><kbd class="kc">${i + 1}</kbd><span>${esc(r.label)}</span><em>${r.on ? '供電中' : r.can === false ? '無法供電' : '斷電'}</em></li>`).join('')}</ul>
        <div class="ft">${withKeys(`[1]~[${o.rows().length}] 切換供電 · [E] 關上`)}</div></div>`;
    };
    const m = {
      el, kind: 'panel', keys: new Set(), redraw: draw,
      onKey: (e) => { const d = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if (d) { const i = +d[1] - 1; if (i >= 0 && i < o.rows().length) { o.toggle(i); draw(); } return true; } return false; },
      onClose: o.onClose,
    };
    draw();
    this.openModal(m);
    return m;
  }

  // ---------- 響鈴方向提示(細、去飽和;看得到電話時淡出) ----------
  // set:正在響的電話 { pos, li };最多 3 個。畫面外 → 貼著畫面邊緣、箭頭指方向;畫面內但被牆擋住 → 在電話的位置淡淡標一下
  // 響鈴的電話:畫面外/背後 → 螢幕邊緣的徽章(電話圖示 + 「電話 · 17m」+ 指向它的箭頭);畫面內 → 電話上方的鈴聲標記
  // (每響一聲擴散一圈;隔著牆半透明)。徽章與標記都跟著鈴聲節奏(響 1 秒、停 2 秒)放大、變亮。走到能接的距離:提示列變成琥珀色。
  ringMarks(game, set) {
    this._ringOn = set.size > 0;
    this.rings ||= [];
    const hud = this.game.ui?.hudEl || document.body, cam = game.camera, p = game.player, L = game.world.layout;
    const Wd = window.innerWidth, Ht = window.innerHeight, t = performance.now() / 1000;
    cam.updateMatrixWorld(); // 投影用這一幀的相機(不用上一幀渲染時的)
    const eye = p.pos.y + (p.eyeH || 1.6);
    let i = 0;
    for (const P of set) {
      if (i >= 3) break;
      let m = this.rings[i];
      if (!m) {
        m = this.rings[i] = { el: hud.appendChild(mk('hd ix-ring', `<b class="rip"></b><b class="rip r2"></b><i class="badge">${PHONE_SVG}</i><i class="dir"><u></u></i><span></span>`)), los: false, losT: 0, txt: '', mode: '' };
        [m.rip, m.rip2, m.badge, m.dir, m.lab] = m.el.children;
      }
      i++;
      const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (t - m.losT > 0.25 || m.P !== P) { m.losT = t; m.P = P; m.los = game.world.hasLineOfSight(p.pos.x, eye, p.pos.z, P.pos.x, P.pos.y + 0.05, P.pos.z); }
      _v.set(P.pos.x, P.pos.y + 0.42, P.pos.z).project(cam); // 標記在電話上方 42cm
      const behind = _v.z > 1;
      let x = behind ? -_v.x : _v.x, y = behind ? -_v.y : _v.y;
      const inView = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86;
      if (!inView) { const k = 0.84 / Math.max(Math.abs(x), Math.abs(y), 1e-3); x *= k; y *= k; }
      const sx = (x * 0.5 + 0.5) * Wd, sy = (-y * 0.5 + 0.5) * Ht;
      const dl = L ? L.levelOfY(P.pos.y - 0.6) - L.levelOfY(p.pos.y + 0.3) : 0;
      const txt = `電話 · ${Math.max(1, Math.round(d))}m${dl > 0 ? ' ↑樓上' : dl < 0 ? ' ↓樓下' : ''}`;
      if (txt !== m.txt) { m.txt = txt; m.lab.textContent = txt; }
      const mode = inView ? (m.los || d < 3.5 ? 'see' : 'wall') : 'edge';
      if (mode !== m.mode) { m.mode = mode; m.el.className = `hd ix-ring ${mode}`; }
      // 鈴聲節奏(與 phones.js / 音效同一個 3 秒週期):u = 這一聲響了多久
      const u = (P.t || 0) % 3, ring = u < 1.1, beat = ring ? Math.sin(Math.min(1, u / 1.1) * Math.PI) : 0;
      const near = d < 2.8 && mode === 'see';
      let op = mode === 'edge' ? 0.96 : mode === 'wall' ? 0.72 : near ? 0.38 : 0.95;
      op *= 0.8 + 0.2 * beat;
      m.el.style.opacity = op.toFixed(2);
      m.el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`;
      m.badge.style.transform = `scale(${(1 + 0.16 * beat).toFixed(3)}) rotate(${ring ? (Math.sin(u * 40) * 9 * beat).toFixed(1) : 0}deg)`; // 響的時候圖示抖動
      const rk = Math.min(1, u / 1.3);
      m.rip.style.transform = `scale(${(0.8 + rk * 1.9).toFixed(3)})`; m.rip.style.opacity = (u < 1.3 ? (1 - rk) * 0.9 : 0).toFixed(2);
      const u2 = u - 0.35, rk2 = Math.min(1, Math.max(0, u2) / 1.3);
      m.rip2.style.transform = `scale(${(0.8 + rk2 * 1.9).toFixed(3)})`; m.rip2.style.opacity = (u2 > 0 && u2 < 1.3 ? (1 - rk2) * 0.6 : 0).toFixed(2);
      if (mode === 'edge') m.dir.style.transform = `rotate(${(Math.atan2(x, y) * 180 / Math.PI).toFixed(0)}deg)`; // 0° = 上,順時針
    }
    for (let j = i; j < (this.rings?.length || 0); j++) { const m = this.rings[j]; if (m.P) { m.el.style.opacity = '0'; m.P = null; m.mode = ''; } }
    // 看著響鈴的電話(能接):提示列跟著鈴聲變琥珀色
    const pe = this.game.ui?.hud?.promptEl, f = this.ix?.focus;
    if (pe) { const on = !!(f && f.kind === 'phone' && [...set].some((P) => P.e === f)); if (on !== pe.classList.contains('ix-answer')) pe.classList.toggle('ix-answer', on); }
  }
  ringClear() { for (const m of this.rings || []) { m.el.style.opacity = '0'; m.P = null; m.mode = ''; } this.game.ui?.hud?.promptEl?.classList.remove('ix-answer'); }

  update() {}
}
