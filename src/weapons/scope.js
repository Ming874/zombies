import './scope.css';

// 畫面正中央的武器 HUD:動態準心(依散布張開)、命中標記(一般/爆頭/擊殺)、瞄具:
//   'sniper' 巴雷特全螢幕狙擊鏡(米位線、暗角、色差、呼吸晃動與屏息)
//   'acog'   3× 放大光學鏡(目鏡圓窗、橡膠眼罩、外圍暗化、發光人字準心)
//   'reddot' 紅點反射鏡的準直光點
// 子彈一律從眼睛沿相機正前方飛出(hitscan),所以準心/光點永遠畫在畫面正中央 = 彈著點(任何距離都沒有視差);
// 開槍後的「跳鏡」只移動視角與鏡筒陰影,準心本身不偏離中心。
const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
};
const SKULL = '<svg class="skull" viewBox="0 0 24 24"><path fill="#ff3326" d="M12 2C6.9 2 3 5.6 3 10.3c0 2.7 1.3 4.9 3.3 6.3V20c0 .6.4 1 1 1h1.5v-2h1.4v2h3.6v-2h1.4v2h1.5c.6 0 1-.4 1-1v-3.4c2-1.4 3.3-3.6 3.3-6.3C21 5.6 17.1 2 12 2zm-3.6 12.2c-1.3 0-2.2-1-2.2-2.3s1-2.3 2.2-2.3 2.2 1 2.2 2.3-.9 2.3-2.2 2.3zm3.6 2.4l-1.3-2.3h2.6L12 16.6zm3.6-2.4c-1.3 0-2.2-1-2.2-2.3s1-2.3 2.2-2.3 2.2 1 2.2 2.3-.9 2.3-2.2 2.3z"/></svg>';
const LENS = { sniper: 0.94, acog: 0.8 }; // 鏡窗直徑(畫面短邊比例)
const RED = 'rgba(255,58,36,1)';

export class CenterHud {
  constructor() {
    const old = document.getElementById('crosshair'); // 舊準心由這裡接手
    if (old) old.style.display = 'none';
    // ---- 瞄準鏡(放在遊戲畫布之後、HUD 之前:血條/彈藥仍顯示在鏡外黑邊上) ----
    const s = (this.scope = el('div'));
    s.id = 'wx-scope';
    this.lens = el('div', 'lens', s);
    this.shade = el('div', 'shade', this.lens);
    this.cv = { sniper: el('canvas', 'rt sniper', this.lens), acog: el('canvas', 'rt acog', this.lens) };
    el('div', 'glare', this.lens);
    this.info = el('div', 'info', s);
    this.info.innerHTML = '<span class="z"></span><span class="hint"> · 按住 Shift 屏息</span><div class="breath"><i></i></div>';
    this.zoomText = this.info.querySelector('.z');
    this.breathBar = this.info.querySelector('.breath');
    this.breathFill = this.info.querySelector('.breath i');
    this.blink = el('div', 'blink', s);
    const game = document.getElementById('game');
    if (game && game.parentNode) game.after(s); else document.body.prepend(s);
    // ---- 準心、紅點 ----
    const r = (this.ret = el('div'));
    r.id = 'wx-reticle';
    this.parts = {};
    for (const k of ['t', 'b', 'l', 'r', 'd', 'ring']) this.parts[k] = el('i', k, r);
    this.dot = el('div');
    this.dot.id = 'wx-dot';
    // ---- 命中標記 ----
    const h = (this.hit = el('div'));
    h.id = 'wx-hit';
    for (let i = 0; i < 4; i++) el('i', '', h);
    h.insertAdjacentHTML('beforeend', SKULL);
    document.body.append(r, this.dot, h);

    this.size = 0;
    this.style = ''; // 目前鏡窗樣式 'sniper' | 'acog'
    this.scopeOp = -1;
    this.scopedOn = false;
    this.lastGap = -1;
    this.lastOp = -1;
    this.lastDot = -1;
    this.kind = '';
    // 呼吸
    this.t = Math.random() * 10;
    this.stam = 1; // 屏息體力 0..1(滿 = 3 秒)
    this.tired = 0; // 喘氣剩餘秒數
    this.hold = 0;
    this.jit = 0;
    this.sway = { x: 0, y: 0 };
    this.ox = 0; this.oy = 0;
    window.addEventListener('resize', () => this._layout(true));
  }

  // 鏡窗大小:直徑取偶數像素,置中時邊界落在整數像素上(米位線/人字的中心 = 畫面正中央)
  _layout(force = false) {
    const st = this.style || 'sniper';
    const W = window.innerWidth, H = window.innerHeight;
    const D = 2 * Math.round((Math.min(W, H) * LENS[st]) / 2);
    if (!force && D === this.size) return;
    this.size = D;
    Object.assign(this.lens.style, { width: `${D}px`, height: `${D}px`, marginLeft: `${-D / 2}px`, marginTop: `${-D / 2}px` });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const k of ['sniper', 'acog']) {
      const c = this.cv[k];
      c.width = c.height = Math.round(D * dpr);
      if (k === 'sniper') this._drawMilDot(c.getContext('2d'), c.width, dpr);
      else this._drawChevron(c.getContext('2d'), c.width, dpr);
    }
  }

  // 米位線十字(Mil-Dot):外側粗柱(深色 + 淺色描邊,亮處暗處都看得見)、中央細線與米位點為照明紅色、下方測距刻度
  _drawMilDot(x, S, dpr) {
    const R = S / 2, c = R;
    x.clearRect(0, 0, S, S);
    const post = 4.2 * dpr, thin = 1.2 * dpr, inner = R * 0.36, mil = inner / 5;
    // 粗柱:先畫淺色外框(在黑暗中勾出輪廓)再畫深色本體
    const posts = (pad) => {
      x.fillRect(0, c - post / 2 - pad, c - inner + pad, post + pad * 2);
      x.fillRect(c + inner - pad, c - post / 2 - pad, c - inner + pad, post + pad * 2);
      x.fillRect(c - post / 2 - pad, c + inner - pad, post + pad * 2, c - inner + pad);
      x.fillRect(c - post / 2 - pad, 0, post + pad * 2, c - inner + pad);
    };
    x.fillStyle = 'rgba(190,200,190,0.38)';
    posts(1.1 * dpr);
    x.fillStyle = 'rgba(4,6,5,0.96)';
    posts(0);
    // 照明細線 + 米位點(紅色微光)
    x.save();
    x.shadowColor = 'rgba(255,40,20,0.9)';
    x.shadowBlur = 5 * dpr;
    x.fillStyle = RED;
    x.fillRect(c - inner, c - thin / 2, inner * 2, thin);
    x.fillRect(c - thin / 2, c - inner, thin, inner * 2);
    for (let i = 1; i <= 4; i++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        x.beginPath();
        x.ellipse(c + dx * mil * i, c + dy * mil * i, (dy ? 2.3 : 1.7) * dpr, (dx ? 2.3 : 1.7) * dpr, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    for (let i = 2; i <= 8; i += 2) { const w = 10 * dpr, y = c + mil * 0.5 * i; x.fillRect(c - w / 2, y - thin / 2, w, thin); } // 測距刻度
    x.font = `${10 * dpr}px sans-serif`;
    for (const n of [2, 4]) x.fillText(String(n * 100), c + 8 * dpr, c + mil * n + 4 * dpr);
    x.restore();
    this._centerDot(x, c, 3.6 * dpr);
  }

  // ACOG 人字(TA31 風格):中央發光紅色人字(尖端 = 瞄準點)、下方測距細線與刻度、左右水平細線
  _drawChevron(x, S, dpr) {
    const R = S / 2, c = R;
    x.clearRect(0, 0, S, S);
    const thin = 1.2 * dpr, halo = 1.1 * dpr;
    const lines = (pad) => {
      x.fillRect(c - thin / 2 - pad, c + R * 0.055 - pad, thin + pad * 2, R * 0.42 + pad * 2); // 下方測距線
      for (const [k, w] of [[1, 0.075], [2, 0.06], [3, 0.048], [4, 0.038], [5, 0.03]]) {
        const y = c + R * (0.055 + k * 0.075);
        x.fillRect(c - (R * w) / 2 - pad, y - thin / 2 - pad, R * w + pad * 2, thin + pad * 2);
      }
      x.fillRect(c - R + R * 0.08 - pad, c - thin / 2 - pad, R * 0.62 + pad * 2, thin + pad * 2); // 左右水平線
      x.fillRect(c + R * 0.3 - pad, c - thin / 2 - pad, R * 0.62 + pad * 2, thin + pad * 2);
    };
    x.fillStyle = 'rgba(200,205,195,0.4)';
    lines(halo);
    x.fillStyle = 'rgba(6,7,6,0.95)';
    lines(0);
    // 發光人字:尖端在正中央
    const w = R * 0.055, hgt = R * 0.05, sw = 2.4 * dpr;
    x.save();
    x.shadowColor = 'rgba(255,50,20,1)';
    x.shadowBlur = 7 * dpr;
    x.strokeStyle = RED;
    x.lineWidth = sw;
    x.lineJoin = 'miter';
    x.beginPath();
    x.moveTo(c - w, c + hgt);
    x.lineTo(c, c);
    x.lineTo(c + w, c + hgt);
    x.stroke();
    x.restore();
    x.fillStyle = 'rgba(255,240,230,0.9)';
    x.beginPath(); x.arc(c, c, 0.9 * dpr, 0, Math.PI * 2); x.fill();
  }

  _centerDot(x, c, r) {
    const g = x.createRadialGradient(c, c, 0, c, c, r);
    g.addColorStop(0, 'rgba(255,90,60,1)');
    g.addColorStop(0.45, 'rgba(255,40,20,0.9)');
    g.addColorStop(1, 'rgba(255,30,10,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.fill();
  }

  // 命中標記:kind 'hit' | 'head' | 'kill';headKill 爆頭擊殺多一個骷髏
  marker(kind, headKill = false) {
    const h = this.hit;
    h.className = kind === 'kill' ? (headKill ? 'kill head' : 'kill') : kind === 'head' ? 'head' : '';
    if (this._anim) this._anim.cancel();
    const dur = kind === 'kill' ? 520 : kind === 'head' ? 300 : 200;
    this._anim = h.animate([
      { opacity: 1, transform: `scale(${kind === 'kill' ? 1.7 : 1.35})` },
      { opacity: 1, transform: 'scale(1)', offset: 0.28 },
      { opacity: 0, transform: 'scale(1)' },
    ], { duration: dur, easing: 'ease-out' });
  }

  // 開槍時鏡內跳動(鏡筒陰影偏移;視角本身的後座由相機處理)
  kick(a = 1) { this.jit = Math.min(1.5, this.jit + a); }

  // 每幀:回傳狙擊鏡呼吸晃動(弧度 {x: 水平, y: 垂直})
  // o = { show, scoped, scope(0..1 鏡內畫面淡入), optic, zoom, dot(0..1 紅點), ads, gapPx, shotgun, holdBreath, moving, busy }
  update(dt, o) {
    const sniper = o.optic === 'sniper';
    // ---- 呼吸(只有狙擊鏡) ----
    const breathing = o.scoped && sniper;
    const want = breathing && o.holdBreath && this.stam > 0 && this.tired <= 0;
    if (want) {
      this.stam -= dt / 3;
      if (this.stam <= 0) { this.stam = 0; this.tired = 3; }
    } else this.stam = Math.min(1, this.stam + dt / (this.tired > 0 ? 5 : 2.2));
    if (this.tired > 0) this.tired -= dt;
    this.hold += ((want ? 1 : 0) - this.hold) * Math.min(1, dt * 5);
    this.t += dt * (this.tired > 0 ? 1.7 : 1);
    this.jit *= Math.exp(-dt * 4);
    const A = 0.0042 * (1 - 0.93 * this.hold) * (o.moving ? 2.6 : 1) * (this.tired > 0 ? 1.9 : 1);
    const t = this.t;
    const sx = (Math.sin(t * 0.83) + 0.45 * Math.sin(t * 2.07 + 1.3)) * A + Math.sin(t * 23) * this.jit * 0.0012;
    const sy = (0.62 * Math.sin(t * 1.66) + 0.5 * Math.sin(t * 1.13 + 2.1)) * A + Math.cos(t * 19) * this.jit * 0.0015;
    const on = breathing ? 1 : 0;
    this.sway.x += (sx * on - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (sy * on - this.sway.y) * Math.min(1, dt * 8);

    // ---- 瞄準鏡:鏡內畫面隨開鏡行程淡入;換掉手持模型的那一刻用短暫黑幕遮住 ----
    const amt = o.show && (o.optic === 'sniper' || o.optic === 'acog') ? o.scope || 0 : 0;
    if (amt > 0 && o.optic !== this.style) {
      this.style = o.optic;
      this.scope.className = `${o.optic}${amt > 0 ? ' on' : ''}`;
      this.zoomText.textContent = `${Math.round(o.zoomMax || 1)}×${o.optic === 'acog' ? ' ACOG' : ''}`;
      this._layout(true);
    }
    if (Math.abs(amt - this.scopeOp) > 0.004) {
      this.scopeOp = amt;
      this.scope.classList.toggle('on', amt > 0);
      this.scope.style.opacity = amt.toFixed(3);
    }
    const scoped = !!(o.show && o.scoped);
    if (scoped !== this.scopedOn) {
      this.scopedOn = scoped;
      this.blink.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 170, easing: 'ease-out' });
    }
    if (amt > 0) {
      // 鏡筒陰影隨晃動/後座偏移(眼距視差);準心畫布不動,永遠在正中央
      const px = this.size * 0.5;
      const tx = -this.sway.x * px * 9 - this.jit * 6, ty = this.sway.y * px * 9 + this.jit * 10;
      this.ox += (tx - this.ox) * Math.min(1, dt * 10);
      this.oy += (ty - this.oy) * Math.min(1, dt * 10);
      this.shade.style.transform = `translate(${this.ox.toFixed(1)}px,${this.oy.toFixed(1)}px)`;
      if (sniper) {
        this.breathFill.style.width = `${(this.stam * 100).toFixed(0)}%`;
        this.breathBar.classList.toggle('tired', this.tired > 0);
      }
    }

    // ---- 紅點反射鏡光點 ----
    const dot = o.show ? o.dot || 0 : 0;
    if (Math.abs(dot - this.lastDot) > 0.01) { this.lastDot = dot; this.dot.style.opacity = dot.toFixed(2); }

    // ---- 腰射準心(開鏡/鏡內畫面/紅點出現時淡出) ----
    const op = !o.show || amt > 0.05 ? 0 : Math.max(0, 1 - o.ads * 1.8) * (o.busy ? 0.35 : 1);
    if (Math.abs(op - this.lastOp) > 0.01) { this.lastOp = op; this.ret.style.opacity = op.toFixed(2); }
    const kind = o.shotgun ? 'shotgun' : '';
    if (kind !== this.kind) { this.kind = kind; this.ret.className = kind; }
    const gap = Math.max(3, Math.min(120, o.gapPx));
    if (op > 0 && Math.abs(gap - this.lastGap) > 0.25) {
      this.lastGap = gap;
      const P = this.parts;
      P.t.style.transform = `translateY(${-gap.toFixed(1)}px)`;
      P.b.style.transform = `translateY(${gap.toFixed(1)}px)`;
      P.l.style.transform = `translateX(${-gap.toFixed(1)}px)`;
      P.r.style.transform = `translateX(${gap.toFixed(1)}px)`;
      const d = gap * 2;
      Object.assign(P.ring.style, { width: `${d.toFixed(1)}px`, height: `${d.toFixed(1)}px`, left: `${-gap.toFixed(1)}px`, top: `${-gap.toFixed(1)}px` });
    }
    return this.sway;
  }

  hide() {
    this.scopedOn = false;
    this.scopeOp = 0;
    this.scope.classList.remove('on');
    this.scope.style.opacity = '0';
    this.ret.style.opacity = '0';
    this.dot.style.opacity = '0';
    this.lastOp = 0;
    this.lastDot = 0;
  }
}
