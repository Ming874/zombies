import * as THREE from 'three';
import './motion.css';
import { settings } from './settings.js';
import { _internal } from '../audio.js';
import { heartBeats } from '../audio/music.js';
import { msfx } from './motion.sfx.js';

// 轉場與手感(「過度動畫」)。所有 3D 畫面的轉場都是 PostShader 的 uniform(src/game/post.js),DOM 只動 opacity/transform。
// 每個來源(頻道)各自寫自己的值,每幀合成後寫進 uniform:
//   fade = 1-Π(1-f) · lid/tint/desat/crt/dawn/beat 取最大 · vig/grain/roll 相加
// 映像管關機/開機是 canvas 元素本身的縮放(WAAPI,合成器執行緒),主執行緒忙著上傳貼圖時也順
// API(game.motion):veil / letterbox / dawn / beat / card / cards / credits / coldOpen / revive / death / pause / on
// 減少動態(settings.motion = 'auto' | 'full' | 'reduced';auto 跟著作業系統的 prefers-reduced-motion):
//   沒有晃動、眼皮、映像管收線與捲動;轉場改成 ≤160ms 的交叉淡化;循環動畫停止
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// cubic-bezier(x1,y1,x2,y2) → t ↦ y(與 CSS 同一條曲線)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-4 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(clamp(t, 0, 1));
  };
}
export const EASE = {
  linear: (t) => t,
  out: bezier(0.2, 0.7, 0.2, 1), // --mo-out
  in: bezier(0.5, 0, 0.75, 0), // --mo-in
  inOut: bezier(0.65, 0, 0.35, 1), // --mo-inout
  needle: bezier(0.3, 0.75, 0.15, 1), // 類比物件:臨界阻尼
  ink: bezier(0.25, 0.1, 0.25, 1),
};
const PROPS = ['fade', 'lid', 'tint', 'vig', 'desat', 'grain', 'crt', 'roll', 'dawn', 'beat', 'hurt'];
const SUM = new Set(['vig', 'grain', 'roll']);
const COLD_CARD = { title: '〈第七暝〉', sub: '聖心醫院　·　霧港市舊港區', line: '農曆七月初一　00:00' };

export function installMotion(game) {
  const U = game.post.uniforms;
  const CH = new Map(); // 頻道名 → { prop: value, fadeCol, tintCol }
  const tweens = [];
  const subs = new Map();
  const deferred = [];
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const root = document.documentElement;
  let t0 = performance.now(), last = t0;
  const ch = (name) => { let c = CH.get(name); if (!c) CH.set(name, (c = {})); return c; };

  const M = {
    EASE,
    busy: false, // 開場/死亡等演出中(暫停選單、回合橫幅會等)
    coldCard: { ...COLD_CARD }, // [story] 可以覆寫開場標題卡的字
    get reduced() { const m = settings.get('motion'); return m === 'reduced' || (m !== 'full' && !!mq?.matches); },
    on(ev, fn) { if (!subs.has(ev)) subs.set(ev, new Set()); subs.get(ev).add(fn); return () => subs.get(ev).delete(fn); },
    emit(ev, d) { const s = subs.get(ev); if (s) for (const fn of [...s]) { try { fn(d); } catch (e) { console.warn('[motion]', ev, e); } } },
    // 頻道的值:立即設定 / 補間(回傳 Promise,被同一個頻道+屬性的新補間取代時也會 resolve)
    set(name, prop, v) { const c = ch(name); c[prop] = v; for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].c === c && tweens[i].p === prop) { tweens[i].res(); tweens.splice(i, 1); } },
    get(name, prop) { return CH.get(name)?.[prop] ?? 0; },
    to(name, prop, v, ms = 300, ease = 'out') {
      const c = ch(name);
      for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].c === c && tweens[i].p === prop) { tweens[i].res(); tweens.splice(i, 1); }
      const from = c[prop] ?? 0;
      if (!(ms > 0) || from === v) { c[prop] = v; return Promise.resolve(); }
      return new Promise((res) => tweens.push({ c, p: prop, from, to: v, t0: performance.now(), ms, e: typeof ease === 'function' ? ease : EASE[ease] || EASE.out, res }));
    },
    clear(name) { const c = CH.get(name); if (!c) return; for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].c === c) { tweens[i].res(); tweens.splice(i, 1); } CH.delete(name); },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    // 等演出結束(而且戰鬥 shader 已預熱)才做:回合橫幅等
    whenReady(fn) { if (!M.busy && game.warmed !== false) fn(); else deferred.push(fn); },

    // ---------- 給劇情/結局 ----------
    veil(a, ms = 600, o = {}) {
      const c = ch('veil');
      if (o.color) { const k = new THREE.Color(o.color); c.fadeCol = [k.r, k.g, k.b]; }
      if (o.hud != null) hudVeil(a, ms);
      return M.to('veil', 'fade', clamp(a, 0, 1), M.reduced ? Math.min(ms, 160) : ms, o.ease || (a > (c.fade || 0) ? 'inOut' : 'out'));
    },
    letterbox(on, ms = 900) {
      const lb = ensureLetterbox();
      root.classList.toggle('mo-cine', !!on); // 電影模式:準心收起來
      lb.style.setProperty('--mo-lb-ms', `${M.reduced ? Math.min(ms, 160) : ms}ms`);
      lb.classList.toggle('on', !!on);
      return M.wait(ms);
    },
    dawn(t, ms = 0) {
      const k = clamp(+t || 0, 0, 1);
      M.to('dawn', 'vig', -0.28 * k, ms, 'inOut');
      M.to('dawn', 'grain', -0.25 * k, ms, 'inOut');
      return M.to('dawn', 'dawn', k, ms, 'inOut');
    },
    card: (o) => showCard(o),
    cards(list) {
      let cur = null, stop = false;
      const p = (async () => { for (const o of list) { if (stop) break; cur = showCard(o); await cur; } })();
      p.skip = () => cur?.skip();
      p.skipAll = () => { stop = true; cur?.skip(); };
      return p;
    },
    credits: (o) => showCredits(o),

    // ---------- 節拍:燈篙亮/暗、頭七 ----------
    beat(kind, o = {}) {
      const R = M.reduced;
      if (kind === 'on') { // 燈篙亮了:邊緣一口紅(220ms 起、1.8s 退),暗角收緊並保持到燈篙暗
        const c = ch('pulse');
        c.tintCol = [0.62, 0.09, 0.03];
        M.to('pulse', 'tint', o.k ?? 0.5, R ? 120 : 220, 'out').then(() => M.to('pulse', 'tint', 0, R ? 600 : 1800, 'inOut'));
        M.to('fight', 'vig', 0.12, 1500, 'inOut');
        M.to('fight', 'grain', 0.3, 1500, 'inOut');
        msfx.hum?.();
      } else if (kind === 'off') { // 燈篙暗了:吐一口氣(暗角放開、稍微去飽和)
        M.to('fight', 'vig', 0, 2400, 'inOut');
        M.to('fight', 'grain', 0, 2400, 'inOut');
        M.to('exhale', 'vig', -0.1, 900, 'out').then(() => M.to('exhale', 'vig', 0, 2600, 'inOut'));
        M.to('exhale', 'desat', 0.12, 900, 'out').then(() => M.to('exhale', 'desat', 0, 3200, 'inOut'));
      } else if (kind === 'touqi') { // 頭七:她站在那裡的時候,世界慢慢褪色、變冷
        M.to('touqi', 'desat', 0.32, 2600, 'inOut');
        M.to('touqi', 'vig', 0.16, 2600, 'inOut');
      } else if (kind === 'touqi-end') {
        M.to('touqi', 'desat', 0, 3200, 'inOut');
        M.to('touqi', 'vig', 0, 3200, 'inOut');
      } else if (kind === 'dark') { // 停電:眼睛適應(先更黑、再慢慢看得到一點),顆粒變粗
        M.to('dark', 'fade', 0.32, 70, 'out').then(() => M.to('dark', 'fade', 0, R ? 300 : 1600, 'out'));
        M.to('dark', 'grain', 0.5, 400, 'out');
        M.to('dark', 'vig', 0.1, 600, 'out');
      } else if (kind === 'light') { // 燈回來:刺眼一下(≤12% 的白,120ms),顆粒退回
        const c = ch('glare');
        c.fadeCol = [0.9, 0.92, 0.88];
        if (!R) M.to('glare', 'fade', 0.12, 60, 'out').then(() => M.to('glare', 'fade', 0, 260, 'inOut'));
        M.to('dark', 'grain', 0, 1200, 'inOut');
        M.to('dark', 'vig', 0, 1200, 'inOut');
      } else if (kind === 'chase') { // 追逐開始:邊緣一口紅
        const c = ch('pulse');
        c.tintCol = [0.6, 0.06, 0.02];
        M.to('pulse', 'tint', 0.55, R ? 120 : 160, 'out').then(() => M.to('pulse', 'tint', 0, 1400, 'inOut'));
        M.to('chase', 'vig', 0.1, 800, 'out');
      } else if (kind === 'chase-end') {
        M.to('chase', 'vig', 0, 1800, 'inOut');
      } else if (kind === 'gate') { // 回憶的放映機門:兩下很淡的亮度閃(≤10%)
        if (R) return;
        const g = ch('gate');
        g.fadeCol = [0, 0, 0];
        (async () => { await M.to('gate', 'fade', 0.1, 60, 'out'); await M.to('gate', 'fade', 0.02, 90); await M.to('gate', 'fade', 0.08, 60); await M.to('gate', 'fade', 0, 160); })();
      }
    },

    // ---------- 暫停 ----------
    pause(on) {
      M.to('pause', 'fade', on ? 0.32 : 0, on ? 160 : 200, on ? 'out' : 'inOut');
      M.to('pause', 'desat', on ? 0.35 : 0, on ? 160 : 200, 'out');
    },

    // 每幀(包在 game.update 之後)
    update() {
      M._bootFrame?.();
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const w = tweens[i], k = clamp((now - w.t0) / w.ms, 0, 1);
        w.c[w.p] = w.from + (w.to - w.from) * w.e(k);
        if (k >= 1) { tweens.splice(i, 1); w.res(); }
      }
      frameDrivers(now, dt);
      compose();
      if (deferred.length && !M.busy && game.warmed !== false) for (const fn of deferred.splice(0)) { try { fn(); } catch (e) { console.warn('[motion]', e); } }
    },
  };
  game.motion = M;

  // ---------- 合成 ----------
  const black = [0, 0, 0];
  function compose() {
    let keep = 1, fadeMax = 0, fadeCol = black, tintMax = 0, tintCol = null;
    const o = { lid: 0, desat: 0, crt: 0, dawn: 0, beat: 0, hurt: 0, vig: 0, grain: 0, roll: 0 };
    for (const c of CH.values()) {
      const f = c.fade || 0;
      if (f > 0) { keep *= 1 - clamp(f, 0, 1); if (f > fadeMax) { fadeMax = f; fadeCol = c.fadeCol || black; } }
      const t = c.tint || 0;
      if (t > tintMax) { tintMax = t; tintCol = c.tintCol || null; }
      for (const p of PROPS) {
        if (p === 'fade' || p === 'tint') continue;
        const v = c[p];
        if (!v) continue;
        if (SUM.has(p)) o[p] += v; else if (v > o[p]) o[p] = v;
      }
    }
    U.fade.value = 1 - keep;
    const isBlack = U.fade.value > 0.97; // 全黑時:準心、載入條不要浮在黑畫面上
    if (isBlack !== M._black) { M._black = isBlack; root.classList.toggle('mo-black', isBlack); }
    U.fadeCol.value.setRGB(fadeCol[0], fadeCol[1], fadeCol[2]);
    U.tint.value = tintMax;
    if (tintCol) U.tintCol.value.setRGB(tintCol[0], tintCol[1], tintCol[2]);
    U.lid.value = o.lid; U.desat.value = o.desat; U.crt.value = o.crt; U.dawn.value = o.dawn;
    U.beat.value = o.beat; U.vig.value = o.vig; U.grain.value = o.grain; U.roll.value = o.roll % 1;
    U.hurt.value = o.hurt;
  }

  // ---------- 每幀驅動:選單呼吸、受傷/低血量、心跳 ----------
  function frameDrivers(now, dt) {
    const R = M.reduced, st = game.state;
    root.classList.toggle('mo-reduced', R);
    if (game.player) { game.player.kickMul = R ? 0 : 1; game.player.shakeMul = R ? 0.25 : 1; }
    // 選單:監視器 + 7 秒呼吸(= 燈篙的週期)
    const menuOn = st === 'menu' && $('menu')?.classList.contains('on');
    const mc = ch('menu');
    if (menuOn && !mc.leaving) { mc.crt = 1; mc.vig = R ? 0 : 0.07 * Math.sin(((now - t0) / 7000) * Math.PI * 2); } else if (!mc.leaving) { mc.crt = 0; mc.vig = 0; }
    // 受傷:剛受傷的脈衝 + 低血量(邊緣壓紅、中心去飽和)
    const p = game.player, hc = ch('hurt');
    const fx = settings.get('hurtFx') !== false;
    if (st === 'playing' && p && fx) {
      const low = p.hp < 35 && p.hp > 0 ? (1 - p.hp / 35) : 0;
      const fresh = Math.max(0, 1 - (game.time - (p.lastHurt ?? -99)) * 2.2) * (M._hitK || 0.45);
      hc.hurt = Math.min(1, low * 0.85 + fresh);
    } else hc.hurt = st === 'dead' ? hc.hurt * Math.max(0, 1 - dt * 1.5) : 0;
    // 心跳:暗角跟著真正排程的心跳聲(lub-dub)
    const ctx = _internal?.A?.ctx;
    let b = 0;
    if (ctx && heartBeats.length && fx && st === 'playing') {
      const at = ctx.currentTime;
      for (const [t, v] of heartBeats) {
        const x = at - t;
        if (x < 0 || x > 0.9) continue;
        b = Math.max(b, Math.min(1, v) * (Math.exp(-x * 9) + 0.55 * (x > 0.27 ? Math.exp(-(x - 0.27) * 9) : 0)));
      }
    }
    hc.beat = R ? b * 0.4 : b;
  }

  // ---------- HUD 的淡入淡出(DOM) ----------
  function hudVeil(a, ms) {
    const h = $('hud');
    if (!h) return;
    h.style.transition = `opacity ${M.reduced ? Math.min(ms, 160) : ms}ms cubic-bezier(.2,.7,.2,1)`;
    h.style.opacity = String(1 - clamp(a, 0, 1));
  }
  M.hudHold = (on) => { const h = $('hud'); if (!h) return; h.classList.toggle('mo-hold', !!on); if (!on) { h.classList.add('mo-enter'); setTimeout(() => h.classList.remove('mo-enter'), 1400); } };
  M.hudShow = (ms = 400) => hudVeil(0, ms);
  M.hudHide = (ms = 300) => hudVeil(1, ms);

  // ---------- 黑邊 ----------
  let lbEl = null;
  function ensureLetterbox() {
    if (lbEl) return lbEl;
    lbEl = document.createElement('div');
    lbEl.id = 'mo-lb';
    lbEl.innerHTML = '<i></i><i></i>';
    document.body.appendChild(lbEl);
    return lbEl;
  }

  // ---------- 字卡(全螢幕,墨水滲開) ----------
  function showCard(o = {}) {
    const el = document.createElement('div');
    el.className = `mo-card${o.className ? ' ' + o.className : ''}${o.align ? ' a-' + o.align : ''}`;
    if (o.z) el.style.zIndex = o.z;
    if (o.bg === false) el.classList.add('clear');
    const parts = [];
    if (o.kicker) parts.push(`<div class="k">${esc(o.kicker)}</div>`);
    if (o.title) parts.push(`<div class="t">${esc(o.title)}</div>`);
    if (o.sub) parts.push(`<div class="s">${esc(o.sub)}</div>`);
    el.innerHTML = `<div class="in">${parts.join('')}</div>`;
    const inner = el.firstChild;
    if (o.image) {
      const box = document.createElement('div');
      box.className = 'img';
      const im = typeof o.image === 'string' ? Object.assign(new Image(), { src: o.image, alt: '' }) : o.image;
      box.appendChild(im);
      inner.prepend(box);
    }
    for (const ln of o.lines || []) {
      const d = document.createElement('div');
      d.className = 'l';
      if (ln instanceof HTMLElement) d.appendChild(ln);
      else if (ln && typeof ln === 'object' && 'html' in ln) d.innerHTML = ln.html;
      else d.textContent = String(ln);
      inner.appendChild(d);
    }
    [...inner.children].forEach((c, i) => c.style.setProperty('--i', i));
    document.body.appendChild(el);
    const R = M.reduced;
    const ms = (v) => (v != null && v < 50 ? v * 1000 : v); // 秒或毫秒都收(< 50 視為秒)
    const fadeIn = R ? 160 : ms(o.fadeIn) ?? 1200, fadeOut = R ? 160 : ms(o.fadeOut) ?? 800;
    const hold = ms(o.hold) ?? Math.max(3500, ((o.title || '').length + (o.sub || '').length + (o.lines || []).reduce((s, l) => s + (typeof l === 'string' ? l.length : 20), 0)) * 250);
    el.style.setProperty('--mo-cin', `${fadeIn}ms`);
    el.style.setProperty('--mo-outms', `${fadeOut}ms`);
    let done, timer = 0, gone = false;
    const p = new Promise((r) => { done = r; });
    const close = (ms) => {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      el.style.setProperty('--mo-outms', `${ms}ms`);
      el.classList.add('out');
      setTimeout(() => { el.remove(); done(); }, ms);
    };
    requestAnimationFrame(() => el.classList.add('on'));
    timer = setTimeout(() => close(fadeOut), fadeIn + hold);
    p.skip = () => close(Math.min(fadeOut, 220));
    p.el = el;
    return p;
  }

  // ---------- 片尾名單(慢慢往上捲,可跳過) ----------
  function showCredits(o = {}) {
    const el = document.createElement('div');
    el.className = 'mo-credits';
    if (o.z) el.style.zIndex = o.z;
    el.innerHTML = `<div class="roll">${(o.blocks || []).map((b) => `<section>${b.h ? `<h4>${esc(b.h)}</h4>` : ''}${(b.lines || []).map((l) => `<p>${esc(l)}</p>`).join('')}</section>`).join('')}${o.tail ? `<section class="tail"><p>${esc(o.tail)}</p></section>` : ''}</div>`;
    document.body.appendChild(el);
    const roll = el.firstChild;
    let done, gone = false, raf = 0;
    const p = new Promise((r) => { done = r; });
    const speed = o.pxps || 38 * (o.speed || 1); // speed = 倍率(1 = 每秒 38px,約 1080p 一行字 1 秒);pxps = 直接指定每秒像素
    const H = () => roll.scrollHeight, VH = () => window.innerHeight;
    let y = VH(), tPrev = performance.now(), fast = 1;
    const step = (now) => {
      const dt = Math.min(0.1, (now - tPrev) / 1000);
      tPrev = now;
      y -= speed * fast * dt;
      roll.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      if (y < -H() + VH() * 0.42) return finish(1600);
      raf = requestAnimationFrame(step);
    };
    const finish = (ms) => { if (gone) return; gone = true; cancelAnimationFrame(raf); el.classList.add('out'); el.style.setProperty('--mo-outms', `${ms}ms`); setTimeout(() => { el.remove(); done(); }, ms); };
    requestAnimationFrame(() => { el.classList.add('on'); raf = requestAnimationFrame(step); });
    p.skip = () => finish(400);
    p.fast = (k = 3) => { fast = k; };
    p.el = el;
    return p;
  }

  // ---------- 映像管關機 / 開機:直接縮放 canvas 元素(合成器執行緒跑,主執行緒在上傳貼圖時也不會卡) ----------
  let lineEl = null;
  const crtLine = () => { if (!lineEl) { lineEl = document.createElement('div'); lineEl.id = 'mo-crtline'; document.body.appendChild(lineEl); } return lineEl; };
  const IN = 'cubic-bezier(.5,0,.75,0)', OUT = 'cubic-bezier(.2,.7,.2,1)';
  M.crtOff = (ms = 420) => {
    const cv = game.canvas;
    const a = cv.animate([{ transform: 'none', easing: IN }, { transform: 'scale(1, .004)', offset: 0.62, easing: IN }, { transform: 'scale(0, .004)' }], { duration: ms, fill: 'forwards' });
    crtLine().animate([{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 0.95, transform: 'scaleX(1)', offset: 0.58, easing: IN }, { opacity: 0.9, transform: 'scaleX(.015)', offset: 0.96 }, { opacity: 0, transform: 'scaleX(0)' }], { duration: ms, fill: 'forwards' });
    return a;
  };
  M.crtOn = (ms = 620) => {
    const cv = game.canvas;
    cv.getAnimations().forEach((x) => x.cancel());
    crtLine().animate([{ opacity: 0.9, transform: 'scaleX(.02)' }, { opacity: 0.9, transform: 'scaleX(1)', offset: 0.3 }, { opacity: 0 }], { duration: ms * 0.7, easing: OUT });
    return cv.animate([{ transform: 'scale(.02, .004)', easing: OUT }, { transform: 'scale(1, .004)', offset: 0.3, easing: OUT }, { transform: 'none' }], { duration: ms });
  };

  // ---------- 開場:選單(監視器)→ 遊戲 ----------
  M.coldOpen = async (begin) => {
    if (M.busy) return;
    M.busy = true;
    const R = M.reduced, menu = $('menu'), mc = ch('menu'), co = ch('co');
    try {
      mc.leaving = true;
      root.classList.add('mo-cold');
      menu?.classList.add('mo-leave');
      // 1) 監視器關機:畫面收成一條線、再收成一點(380ms),喀一聲 + 高頻退去
      msfx.crtOff?.();
      let off = null;
      if (R) await M.to('co', 'fade', 1, 140, 'in');
      else { off = M.crtOff(420); await off.finished.catch(() => {}); }
      co.fade = 1; mc.crt = 0; mc.vig = 0;
      menu?.classList.remove('on', 'mo-leave');
      mc.leaving = false;
      M.hudHold(true);
      game.ui.showHud(true);
      begin();
      M.emit('coldopen:start');
      if (typeof M.coldPre === 'function') { try { await M.coldPre(); } catch (e) { console.warn('[motion] coldPre', e); } } // [story] 前情卡(src/story/moments.js M1)
      // 2) 標題卡(≤3.8 秒;任何按鍵/點擊都跳過)
      const C = M.coldCard;
      const card = showCard({ className: 'cold', title: C.title, sub: C.sub, lines: C.line ? [C.line] : [], fadeIn: 650, hold: 1250, fadeOut: 420, z: 60 });
      setTimeout(() => off?.cancel(), 700); // 卡片的黑底蓋住之後才把 canvas 放回原狀(post 的 fade 已經是全黑)
      // 跳過:空白鍵 / Enter / Esc / 點擊(移動鍵不算:一開始就按著 W 的人不會錯過標題)
      const skip = (e) => { if (e.type === 'keydown' && (e.repeat || !/^(Space|Enter|NumpadEnter|Escape)$/.test(e.code))) return; card.skip(); };
      addEventListener('keydown', skip, true);
      addEventListener('mousedown', skip, true);
      setTimeout(() => msfx.thud?.(), 120);
      await card;
      removeEventListener('keydown', skip, true);
      removeEventListener('mousedown', skip, true);
      M.emit('coldopen:end');
      // 3) 睜眼:黑 → 眼皮半開、眨一下、全開;HUD 依序出現
      if (R) { co.lid = 0; await M.to('co', 'fade', 0, 160, 'out'); M.hudHold(false); }
      else {
        co.lid = 1;
        msfx.breath?.();
        M.to('co', 'fade', 0, 360, 'out');
        await M.to('co', 'lid', 0.36, 560, 'out');
        await M.to('co', 'lid', 0.52, 150, 'inOut');
        M.hudHold(false);
        await M.to('co', 'lid', 0, 620, 'out');
      }
    } catch (e) { console.warn('[motion] coldOpen', e); M.hudHold(false); } finally {
      root.classList.remove('mo-cold');
      M.clear('co');
      mc.leaving = false;
      M.busy = false;
    }
    // 演出中途放開了滑鼠(按了 Esc):補上暫停選單
    if (game.state === 'playing' && !document.pointerLockElement && !game.paused && !game.shopUIOpen && !game.bookOpen && !game.net) { game.paused = true; game.ui.overlay('pause', true); }
  };

  // ---------- 回主選單:映像管開機(一點 → 一條線 → 全畫面) ----------
  M.toMenu = () => {
    const mc = ch('menu');
    M.clear('death'); M.clear('pause'); M.clear('fight'); M.clear('pulse'); M.clear('exhale');
    if (M.reduced) { ch('back').fade = 1; M.to('back', 'fade', 0, 160); return; }
    ch('back').fade = 0.5;
    msfx.crtOn?.();
    M.crtOn(620);
    M.to('back', 'fade', 0, 1200, 'out').then(() => M.clear('back'));
    $('menu')?.classList.add('mo-enter');
    setTimeout(() => $('menu')?.classList.remove('mo-enter'), 1400);
  };

  // ---------- 倒下 ----------
  // 1.9 秒:HUD 退、世界褪色、眼皮慢慢闔上、心跳停;然後結算卡(依序浮上)
  M.death = (show) => {
    const R = M.reduced;
    M.busy = true;
    M.clear('fight'); M.clear('pulse'); M.clear('pause');
    M.hudHide(R ? 160 : 320);
    M.to('death', 'desat', 0.9, R ? 200 : 1400, 'out');
    if (!R) M.to('death', 'lid', 0.82, 1700, 'in');
    M.to('death', 'fade', 0.6, R ? 300 : 1800, 'out');
    const d = $('dead');
    d?.classList.add('mo-stagger');
    setTimeout(() => { M.busy = false; try { show(); } catch (e) { console.warn(e); } }, R ? 300 : 1750);
  };
  // 重新開始/回到遊戲:眼睛張開
  M.onBegin = () => {
    M.clear('pause'); M.clear('fight'); M.clear('pulse'); M.clear('exhale'); M.clear('dawn'); M.clear('touqi'); M.clear('dark'); M.clear('glare'); M.clear('chase');
    const d = CH.get('death');
    $('hud') && ($('hud').style.opacity = '1');
    if (d) {
      if (M.reduced) { M.clear('death'); return; }
      d.desat = 0.5; d.fade = 0.6; d.lid = 0.8;
      M.to('death', 'fade', 0, 420, 'out');
      M.to('death', 'desat', 0, 900, 'out');
      M.to('death', 'lid', 0, 700, 'out').then(() => M.clear('death'));
    }
  };

  // ---------- 阿嬤叫你回來(單人回神;邏輯在劇情層) ----------
  M.revive = async ({ line = '阿孫，回神喔！', hold = 1600 } = {}) => {
    M.busy = true;
    const v = ch('revive');
    M.hudHide(M.reduced ? 160 : 400);
    await M.to('revive', 'fade', 1, M.reduced ? 160 : 500, 'inOut');
    const card = showCard({ className: 'ama', title: line, fadeIn: 900, hold, fadeOut: 500, z: 60 });
    await card;
    $('hud') && ($('hud').style.opacity = '1');
    M.hudHold(true);
    if (!M.reduced) { v.lid = 1; msfx.breath?.(); M.to('revive', 'fade', 0, 300); await M.to('revive', 'lid', 0.4, 420, 'out'); await M.to('revive', 'lid', 0.55, 140); M.hudHold(false); await M.to('revive', 'lid', 0, 520, 'out'); } else { M.hudHold(false); await M.to('revive', 'fade', 0, 160); }
    M.clear('revive');
    M.busy = false;
  };

  // ---------- 字型預熱:標題卡用的明體(大字)先在畫面外排一次版,開場時不會在黑畫面裡等字型 ----------
  {
    const fw = document.createElement('div');
    fw.id = 'mo-fontwarm';
    fw.setAttribute('aria-hidden', 'true');
    fw.innerHTML = `<div class="mo-card cold"><div class="in"><div class="t">${esc(COLD_CARD.title)}</div><div class="s">${esc(COLD_CARD.sub)}</div><div class="l">${esc(COLD_CARD.line)}</div></div></div><div class="mo-card ama"><div class="in"><div class="t">阿孫，回神喔！</div></div></div>`;
    document.body.appendChild(fw);
    setTimeout(() => fw.remove(), 20000);
  }

  // ---------- 開機:選單依序淡入;第一個畫面畫出來時,監視器開機(一點 → 一條線 → 全畫面,再慢慢暖起來) ----------
  {
    const menu = $('menu');
    menu?.classList.remove('mo-boot');
    menu?.classList.add('mo-reveal', 'mo-nosig');
    setTimeout(() => menu?.classList.remove('mo-reveal'), 2600);
    const b = ch('boot');
    b.fade = 1;
    let frames = 0, started = false;
    const power = () => {
      if (started) return;
      started = true;
      menu?.classList.remove('mo-nosig');
      if (M.reduced) { M.to('boot', 'fade', 0, 160).then(() => M.clear('boot')); return; }
      b.fade = 0.5;
      M.crtOn(680);
      M.to('boot', 'fade', 0, 1600, 'out').then(() => M.clear('boot'));
    };
    M._bootFrame = () => { if (!started && ++frames === 3) power(); };
    setTimeout(power, 9000); // 保險:畫面一直沒開始畫
  }

  // ---------- 選單的錄影機時鐘:2003/05/12 23:59:13 往上走,走到 00:00:00 就跳格、退回去(永遠到不了早上) ----------
  {
    const START = 23 * 3600 + 59 * 60 + 13, END = 24 * 3600;
    let sec = START, hold = 0;
    const fmt = (s) => { const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, q = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(q).padStart(2, '0')}`; };
    setInterval(() => {
      const menu = $('menu'), clk = menu?.querySelector('.mn-osd .clk');
      if (!clk || !menu.classList.contains('on') || document.hidden) return;
      if (hold > 0) { if (--hold === 0) { sec = START; clk.textContent = `2003/05/12 (一) ${fmt(sec)}`; } return; }
      sec++;
      if (sec >= END) { // 午夜:日期跳一下,畫面捲一格,時間退回 23:59:13
        clk.textContent = '2003/05/13 (二) 00:00:00';
        clk.classList.remove('mid'); void clk.offsetWidth; clk.classList.add('mid');
        hold = 2;
        M.menuGlitch();
        return;
      }
      clk.textContent = `2003/05/12 (一) ${fmt(sec)}`;
    }, 1000);
  }
  // 監視器跳格:畫面往上捲一格(0.7 秒)+ 很短的雜訊;減少動態時只暗一下
  M.menuGlitch = () => {
    if (game.state !== 'menu') return;
    msfx.roll?.();
    if (M.reduced) { M.to('glitch', 'fade', 0.25, 80).then(() => M.to('glitch', 'fade', 0, 160)); return; }
    const g = ch('glitch');
    g.roll = 0;
    M.to('glitch', 'roll', 1, 700, 'inOut').then(() => { g.roll = 0; });
    M.to('glitch', 'fade', 0.18, 120).then(() => M.to('glitch', 'fade', 0, 500));
  };

  // 包住 game.update:每幀在遊戲更新之後合成 uniform(暫停/選單時一樣會跑)
  const up = game.update.bind(game);
  game.update = (dt) => { up(dt); M.update(); };
  return M;
}
