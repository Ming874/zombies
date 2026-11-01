// ===== GPU 分段計時(EXT_disjoint_timer_query_webgl2)=====
// 同一時間只能有一個 TIME_ELAPSED 查詢(不能巢狀)→ 用「分段」:mark('名稱') 結束上一段並開始新的一段,
// end() 結束最後一段。一幀內同名的段相加。結果晚 1~3 幀才拿得到(非阻塞輪詢;GPU_DISJOINT 時丟掉那幀)。
//   prof.begin()            每幀 render 前(開始 'frame' 段)
//   prof.pass('bloom')      只在 detail 模式切段(F3 面板開著、?gpuprof、或測試時設 detail = true)
//   prof.end()              每幀 render 後
//   prof.ms                 最近一幀的 GPU 總時間(ms;沒有擴充功能時一直是 null)
//   prof.seg / prof.last    各段的平滑值 / 最近一幀的值(ms)
export class GpuProfiler {
  constructor(gl) {
    this.gl = gl;
    this.ext = (gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2')) || null;
    this.free = [];
    this.frames = [];
    this.cur = null;
    this.active = null;
    this.name = null;
    this.detail = false;
    this.ms = null;
    this.msA = 0; // 其中場景繪製段(frame/scene/shadow)
    this.seg = {};
    this.last = {};
    this.lost = 0;
    this.done = 0;
  }
  begin() {
    if (!this.ext || this.cur) return;
    this.cur = { q: [], n: [] };
    this.mark('frame');
  }
  mark(name) {
    const c = this.cur;
    if (!c) return;
    const gl = this.gl, T = this.ext.TIME_ELAPSED_EXT;
    if (this.active) gl.endQuery(T);
    const q = this.free.pop() || gl.createQuery();
    gl.beginQuery(T, q);
    this.active = q;
    this.name = name;
    c.q.push(q);
    c.n.push(name);
  }
  pass(name) { if (this.detail && this.cur) this.mark(name); }
  // 場景繪製結束:非 detail 模式也切一段(自動調整要分開「場景段」與「之後的全螢幕 pass」)
  split(name) { if (!this.detail && this.cur) this.mark(name); }
  end() {
    if (!this.cur) return;
    if (this.active) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.frames.push(this.cur);
    this.cur = null;
    this.active = null;
    this.name = null;
    this.poll();
  }
  poll() {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.frames.length) {
      const f = this.frames[0], lastQ = f.q[f.q.length - 1];
      if (!gl.getQueryParameter(lastQ, gl.QUERY_RESULT_AVAILABLE)) break;
      this.frames.shift();
      let tot = 0;
      const per = {};
      for (let i = 0; i < f.q.length; i++) {
        const ms = gl.getQueryParameter(f.q[i], gl.QUERY_RESULT) / 1e6;
        tot += ms;
        per[f.n[i]] = (per[f.n[i]] || 0) + ms;
        this.free.push(f.q[i]);
      }
      if (disjoint || !(tot > 0)) { this.lost++; continue; }
      this.ms = tot;
      this.msA = (per.frame || 0) + (per.scene || 0) + (per.shadow || 0);
      this.done++;
      this.last = per;
      for (const k in this.seg) if (!(k in per)) this.seg[k] *= 0.9; // 這幀沒有這段(pass 關掉了)→ 慢慢歸零
      for (const k in per) this.seg[k] = k in this.seg ? this.seg[k] + (per[k] - this.seg[k]) * 0.1 : per[k];
    }
    // GPU 落後太多:丟掉最舊的(查詢物件可以重用,舊結果作廢)
    while (this.frames.length > 6) for (const q of this.frames.shift().q) this.free.push(q);
  }
  // 依耗時排序的分段(ms,平滑值)
  table() { return Object.entries(this.seg).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]); }
}

// 包住 composer 的每個 pass 與陰影圖(detail 模式才真的切段;沒開時只多一次函式呼叫)
export function instrument(game, prof) {
  const c = game.composer;
  if (c) for (const p of c.passes) {
    if (p.__prof) continue;
    p.__prof = true;
    const r = p.render, name = p.hzName || passName(p, game);
    p.render = function (...a) { prof.pass(name); return r.apply(this, a); };
  }
  const sm = game.renderer.shadowMap;
  if (!sm.__prof) {
    sm.__prof = true;
    const orig = sm.render;
    sm.render = function (...a) {
      if (!prof.detail || !prof.cur) return orig.apply(this, a);
      const back = prof.name;
      prof.mark('shadow');
      try { return orig.apply(this, a); } finally { prof.mark(back || 'scene'); }
    };
  }
}

function passName(p, game) {
  if (p.isRenderPass) return p.scene === game.weaponScene ? 'weapon' : 'scene';
  if (p === game.bloom) return 'bloom';
  if (p === game.post) return 'post';
  if (p.isOutputPass) return 'output';
  return p.constructor?.name || 'pass';
}
