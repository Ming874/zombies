import './horror.css';
import { captions, cutEl } from '../ui/captions.js';

// 靈異字幕(耳邊低語的字一個一個浮出,跟著合成語音的音節時間)與畫面結霜。DOM 元素只在第一次用到時建立。
const now = () => performance.now() / 1000;
export class GhostSubs {
  constructor() { this.el = null; this.lines = []; this.frostEl = null; this.frostK = 0; this.frostShown = -1; }
  _root() { return (this.el = captions.root()); } // 唯一的字幕區(src/ui/captions.js)
  // o:text、ear、filter、times(每個字元相對 t0 的秒數;undefined 的字元跟著前一個)、t0、clock() → 秒、hold(說完後停留秒數)、tag(小字標籤)、cap(事件字幕樣式)
  // o.who = 說話的人(沒有就用 tag);o.critical = 劇情的句子(不會被擋)。別人還在講 → 不出(回傳 null)
  show(o) {
    const who = o.who ?? o.tag ?? '';
    if (!o.critical && !captions.can(who)) return null;
    const root = this._root();
    const el = document.createElement('div');
    el.className = 'gh-line' + (o.cap ? ' cap' : '');
    if (o.ear) el.dataset.ear = o.ear;
    if (o.filter) el.dataset.f = o.filter;
    if (o.style) el.dataset.s = o.style; // 'past':回憶裡的字幕
    if (o.tag) { const s = document.createElement('small'); s.textContent = o.tag; el.appendChild(s); }
    const chars = [], text = [...String(o.text || '')];
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = ch === '\n' ? 'c br' : 'c';
      if (ch !== '\n') s.textContent = ch;
      el.appendChild(s);
      chars.push(s);
    }
    root.appendChild(el);
    const clock = o.clock || now, t0 = o.t0 ?? clock();
    // 字元時間:沒有給的就跟前一個;全部沒有 → 每字 0.28 秒
    const times = [];
    let last = o.lead ?? 0.3;
    for (let i = 0; i < chars.length; i++) { const t = o.times?.[i]; if (Number.isFinite(t)) last = t; else if (!o.times) last = (o.lead ?? 0.3) + i * 0.28; times.push(last); }
    // 停留時間至少夠讀完:字出完之後再留 1.4 秒 + 每字 0.2 秒(合成語音很快時字幕不會一閃就走)
    const shownAt = t0 + (times[times.length - 1] ?? 0), n = chars.length;
    const L = { el, chars, times, t0, clock, shown: 0, end: shownAt + Math.max(o.hold ?? 1.6, 1.4 + n * 0.2), out: 0 };
    this.lines.push(L);
    // 一個字幕區:別人的字收掉、同一個人的上一句變淡(src/ui/captions.js)
    const left = Math.max(0, (times[times.length - 1] ?? 0) - (clock() - t0));
    L.q = captions.add({ el, who, kind: 'speech', critical: !!o.critical, until: captions.now() + left + 0.3, cut: () => this._drop(L, true) });
    return L;
  }
  _drop(L, cut = false) {
    const i = this.lines.indexOf(L);
    if (i >= 0) this.lines.splice(i, 1);
    if (cut) { cutEl(L.el); return; }
    captions.drop(L.q);
    L.el.classList.add('out');
    setTimeout(() => L.el.remove(), 1400);
  }
  update() {
    for (let k = this.lines.length - 1; k >= 0; k--) {
      const L = this.lines[k], t = L.clock() - L.t0;
      while (L.shown < L.chars.length && L.times[L.shown] <= t) L.chars[L.shown++].classList.add('on');
      if (L.clock() > L.end) this._drop(L);
    }
  }
  clear() { for (const L of [...this.lines]) this._drop(L); }
  // ---- 結霜 ----
  frost(k) {
    k = Math.max(0, Math.min(1, k));
    if (!this.frostEl) {
      if (k <= 0) return;
      const el = document.createElement('div');
      el.id = 'gh-frost';
      el.style.backgroundImage = `url(${frostTexture()})`;
      const hud = document.getElementById('hud');
      if (hud) hud.parentNode.insertBefore(el, hud); else document.body.appendChild(el);
      this.frostEl = el;
    }
    if (Math.abs(k - this.frostShown) < 0.01) return;
    this.frostShown = k;
    this.frostEl.style.opacity = (k * 0.72).toFixed(3);
  }
}

// 霜花貼圖:從畫面四邊長進來的冰晶枝(細白線)+ 霧面顆粒
function frostTexture() {
  const W = 768, H = 432, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  let s = 20261027;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // 霧面
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(200,220,240,0)'); g.addColorStop(1, 'rgba(205,225,245,0.55)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const px = r() * W, py = r() * H, e = Math.min(px, W - px, py, H - py) / (H * 0.5); if (r() > 1 - e * 1.4) continue; x.fillStyle = `rgba(235,245,255,${(0.08 + r() * 0.25).toFixed(2)})`; x.fillRect(px, py, 1 + r() * 1.5, 1 + r() * 1.5); }
  // 冰晶枝
  x.lineCap = 'round';
  const branch = (px, py, ang, len, w, depth) => {
    if (depth > 4 || len < 3) return;
    let cx = px, cy = py;
    x.strokeStyle = `rgba(238,246,255,${(0.35 - depth * 0.05).toFixed(2)})`;
    x.lineWidth = w;
    x.beginPath(); x.moveTo(cx, cy);
    const n = 6;
    for (let i = 0; i < n; i++) {
      ang += (r() - 0.5) * 0.35;
      cx += Math.cos(ang) * len / n; cy += Math.sin(ang) * len / n;
      x.lineTo(cx, cy);
      if (r() < 0.55) { const sa = ang + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.5); branch(cx, cy, sa, len * (0.35 + r() * 0.25), w * 0.7, depth + 1); x.strokeStyle = `rgba(238,246,255,${(0.35 - depth * 0.05).toFixed(2)})`; x.lineWidth = w; x.beginPath(); x.moveTo(cx, cy); }
    }
    x.stroke();
  };
  for (let i = 0; i < 70; i++) {
    const side = i % 4, t = r();
    const [px, py, a] = side === 0 ? [t * W, 0, Math.PI / 2] : side === 1 ? [t * W, H, -Math.PI / 2] : side === 2 ? [0, t * H, 0] : [W, t * H, Math.PI];
    branch(px, py, a + (r() - 0.5) * 0.9, 50 + r() * 120, 1.6, 0);
  }
  return c.toDataURL('image/png');
}
