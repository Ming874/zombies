import './perf.css';
import { caps } from './caps.js';
import { pools } from './workers.js';

// ===== 效能監看 → game.perf;F3 開關效能面板 =====
//   game.perf.begin('physics') … game.perf.end('physics')   自訂計時(面板會列出;?perf 時也寫進 performance.measure)
//   game.perf.time('physics', ms)                            直接回報一段耗時
//   game.perf.source('標籤', () => '文字')                   在面板加一行(回傳 null 不顯示)
// ?perf:一開始就打開面板,並把每幀 update/render 寫成 performance.measure(DevTools Performance 的 Timings 軌可看)

const now = () => performance.now();
const fmt = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(d));
const big = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n | 0));
const MB = (b) => (b / 1048576).toFixed(0);

export class Perf {
  constructor(game) {
    this.game = game;
    this.custom = {};
    this.sources = [];
    this.measure = caps.flags.has('perf');
    this.frames = 0;
    this.jank = 0; // 幀間隔 > 50ms 的次數
    this.longTasks = 0;
    this.upd = 0;
    this.rnd = 0;
    this.hist = new Float32Array(150);
    this.histGpu = new Float32Array(150);
    this.hi = 0;
    this._b = {};
    this._next = 0;
    this.el = null;
    try { new PerformanceObserver((l) => { this.longTasks += l.getEntries().length; }).observe({ type: 'longtask' }); } catch { /* 不支援 */ }
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.toggle(); } });
    if (caps.flags.has('perf')) this.toggle(true);
  }

  begin(name) { this._b[name] = now(); }
  end(name) { const t = this._b[name]; if (t != null) { this._b[name] = null; this.time(name, now() - t, t); } }
  time(name, ms, start) {
    const c = this.custom[name] || (this.custom[name] = { ms, max: ms, last: ms });
    c.ms += (ms - c.ms) * 0.1;
    c.max = Math.max(c.max * 0.997, ms);
    c.last = ms;
    if (this.measure && start != null) performance.measure('hz:' + name, { start, end: start + ms });
  }
  source(label, fn) { this.sources.push([label, fn]); }

  // 主迴圈每幀呼叫:dtMs = rAF 間隔;t0 = 本幀開始;updMs / rndMs = update / render 的 JS 時間
  frame(dtMs, t0, updMs, rndMs) {
    this.frames++;
    if (dtMs > 50 && this.frames > 2) this.jank++;
    this.upd += (updMs - this.upd) * 0.1;
    this.rnd += (rndMs - this.rnd) * 0.1;
    this.hist[this.hi] = dtMs;
    const q = this.game.quality;
    this.histGpu[this.hi] = q && q.gpu.ms != null ? q.gpu.ms : 0;
    this.hi = (this.hi + 1) % this.hist.length;
    if (this.measure) {
      performance.measure('hz:update', { start: t0, end: t0 + updMs });
      performance.measure('hz:render', { start: t0 + updMs, end: t0 + updMs + rndMs });
      if (this.frames % 600 === 0) for (const n of ['hz:update', 'hz:render', ...Object.keys(this.custom).map((k) => 'hz:' + k)]) performance.clearMeasures(n);
    }
    if (this.el && now() >= this._next) { this._next = now() + 250; this.draw(); }
  }

  toggle(on = !this.el?.classList.contains('on')) {
    if (!this.el) this.build();
    this.el.classList.toggle('on', on);
    this.measure = on || caps.flags.has('perf');
    const q = this.game.quality;
    if (q?.gpu) q.gpu.detail = on || caps.flags.has('gpuprof'); // 面板開著時逐 pass 計 GPU 時間
    if (on) this.draw();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'perfpanel';
    this.txt = document.createElement('div');
    this.cv = document.createElement('canvas');
    this.cv.width = this.hist.length * 2;
    this.cv.height = 46;
    el.append(this.txt, this.cv);
    document.body.appendChild(el);
    this.el = el;
  }

  draw() {
    const g = this.game, r = g.renderer, info = r.info, q = g.quality ? g.quality.stats : null;
    const L = [];
    const warn = (ok, s) => (ok ? s : `<span class="w">${s}</span>`);
    L.push(`<span class="h">效能 F3</span>  <span class="d">${q ? `${q.preset} · 動態解析度 ${q.dynamicRes ? '開' : '關'}` : ''}</span>`);
    if (q) {
      L.push(`FPS ${warn(q.fps > 55, fmt(q.fps, 0).padStart(3))}  幀 ${fmt(q.frameMs)}ms  p99 ${warn(q.frameP99 < 25, fmt(q.frameP99))}  最長 ${warn(q.frameMax < 50, fmt(q.frameMax, 0))}`);
      L.push(`CPU 更新 ${fmt(this.upd, 2)}  渲染 ${fmt(this.rnd, 2)} ms   GPU ${q.gpuTimer ? (q.gpuMs == null ? '…' : warn(q.gpuMs < 14, fmt(q.gpuMs, 2)) + ' ms') : '<span class="d">無計時擴充</span>'}`);
      L.push(`解析度 ${fmt(q.pixelRatio, 2)}×  ${q.width}×${q.height}`);
      const gp = g.quality.gpu;
      if (gp?.detail && gp.done) L.push(`GPU 分段 ${gp.table().slice(0, 9).map(([k, v]) => `${k} ${fmt(v, 2)}`).join('  ')}`);
    }
    L.push(`Draw ${warn(info.render.calls < 350, String(info.render.calls))}  三角形 ${big(info.render.triangles)}  線 ${big(info.render.lines)}  點 ${big(info.render.points)}`);
    L.push(`幾何 ${info.memory.geometries}  貼圖 ${info.memory.textures}  Shader ${info.programs ? info.programs.length : '—'}`);
    const m = performance.memory;
    if (m) L.push(`JS Heap ${MB(m.usedJSHeapSize)} / ${MB(m.totalJSHeapSize)} MB  (上限 ${MB(m.jsHeapSizeLimit)})`);
    L.push(`卡頓 >50ms ${warn(this.jank === 0, String(this.jank))}  長任務 ${this.longTasks}`);
    for (const p of pools) {
      const i = p.info();
      L.push(`Worker ${i.name.padEnd(5)} ${i.failed ? '<span class="b">停用</span>' : `${i.busy}/${i.alive}(${i.size}) 忙  佇列 ${i.queued}  完成 ${i.done}${i.errors ? `  <span class="b">錯 ${i.errors}</span>` : ''}`}`);
    }
    for (const [k, c] of Object.entries(this.custom)) L.push(`${k} ${fmt(c.ms, 2)} ms  (最大 ${fmt(c.max, 1)})`);
    for (const [label, fn] of this.sources) {
      let s = null;
      try { s = fn(); } catch { s = '—'; }
      if (s != null) L.push(`${label} ${s}`);
    }
    L.push(`<span class="d">隔離 ${caps.isolated ? '✓' : '✗'}  SAB ${caps.sab ? '✓' : '✗'}  Offscreen ${caps.offscreen ? '✓' : '✗'}  核心 ${caps.cores}</span>`);
    this.txt.innerHTML = L.join('\n');
    this.graph();
  }

  graph() {
    const c = this.cv, x = c.getContext('2d'), H = c.height, n = this.hist.length, sc = H / 50;
    x.clearRect(0, 0, c.width, H);
    for (let k = 0; k < n; k++) {
      const i = (this.hi + k) % n, v = this.hist[i];
      x.fillStyle = v < 17.5 ? '#4fbf6a' : v < 34 ? '#e8c44a' : '#e0503c';
      const h = Math.min(H, v * sc);
      x.fillRect(k * 2, H - h, 2, h);
      const gv = this.histGpu[i];
      if (gv > 0) { x.fillStyle = '#6aa8ff'; x.fillRect(k * 2, H - Math.min(H, gv * sc) - 1, 2, 2); }
    }
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(0, H - 16.7 * sc, c.width, 1);
    x.fillRect(0, H - 33.3 * sc, c.width, 1);
  }
}
