import { caps } from './caps.js';

// 模組 Worker 池 + RPC。結果裡的 TypedArray / ArrayBuffer / ImageBitmap 會自動以 transferable 零複製傳回。
//
// 主執行緒:
//   const pool = createPool(() => new Worker(new URL('../x/y.worker.js', import.meta.url), { type: 'module' }), { name: 'y' });
//   if (pool.available) const out = await pool.call('method', [arg1, arg2], { transfer: [buf], priority: 1 });
//   (new Worker(new URL('字串常值', import.meta.url), ...) 必須寫在同一個運算式裡,Vite 才會打包 Worker)
// Worker 內:
//   import { serve } from '../sys/workers.js';
//   serve({ method(arg1, arg2) { return result; } });   // 可回傳 Promise
//
// 失敗處理:Worker 載入失敗(不支援模組 Worker、import 鏈碰到 DOM、CSP…)時 pool.failed = true,
// 排隊中的工作全部 reject,呼叫端應退回同步版本。單一工作丟例外只會 reject 那個工作。
// 跨來源隔離(crossOriginIsolated)時用 SharedArrayBuffer 即時統計各 Worker 忙碌狀態;否則由回覆訊息統計。

export const pools = []; // 給效能面板列出
const now = () => performance.now();
let nextId = 1;
const SLOT = 4; // 每個 Worker 在統計陣列中的欄位數:[忙碌中, 完成數, 忙碌毫秒, 保留]

export function transferables(v, out = [], seen = new Set(), depth = 0) {
  if (!v || typeof v !== 'object' || depth > 10 || seen.has(v)) return out;
  if (ArrayBuffer.isView(v)) {
    const b = v.buffer;
    if (b instanceof ArrayBuffer && !seen.has(b)) { seen.add(b); out.push(b); }
    return out;
  }
  if (v instanceof ArrayBuffer || (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap)) { seen.add(v); out.push(v); return out; }
  seen.add(v);
  if (Array.isArray(v)) { for (const x of v) transferables(x, out, seen, depth + 1); return out; }
  const proto = Object.getPrototypeOf(v);
  if (proto === Object.prototype || proto === null) for (const k in v) transferables(v[k], out, seen, depth + 1);
  return out;
}

class WorkerPool {
  constructor(factory, { name = 'worker', size, max = 6, idleMs = 15000, maxInFlight = 2 } = {}) {
    this.factory = factory;
    this.name = name;
    this.size = Math.max(1, size ?? Math.min(max, caps.cores - 1));
    this.idleMs = idleMs;
    this.maxInFlight = maxInFlight;
    this.queue = [];
    this.slots = [];
    this.failed = !caps.useWorkers;
    this.loadFails = 0;
    this.done = 0;
    this.errors = 0;
    this.workMs = 0; // Worker 端實際計算時間總和
    this.waitMs = 0; // 排隊 + 傳輸
    this.spawned = 0;
    this.stats = caps.sab ? new Int32Array(new SharedArrayBuffer(4 * SLOT * this.size)) : null;
    this._idleT = 0;
    pools.push(this);
  }

  get available() { return !this.failed; }
  get inFlight() { let n = 0; for (const s of this.slots) n += s.jobs.size; return n; }
  get alive() { return this.slots.filter((s) => !s.dead).length; }
  get busy() {
    if (this.stats) { let n = 0; for (const s of this.slots) if (!s.dead && Atomics.load(this.stats, s.i * SLOT) === 1) n++; return n; }
    return this.slots.filter((s) => !s.dead && s.jobs.size > 0).length;
  }

  call(method, args = [], { transfer = [], priority = 0 } = {}) {
    if (this.failed) return Promise.reject(new Error(`${this.name}: Worker 不可用`));
    return new Promise((resolve, reject) => {
      const job = { id: nextId++, method, args, transfer, resolve, reject, t: now(), priority };
      if (priority > 0) {
        let i = 0;
        while (i < this.queue.length && this.queue[i].priority >= priority) i++;
        this.queue.splice(i, 0, job);
      } else this.queue.push(job);
      this._pump();
    });
  }

  _spawn() {
    const i = this.slots.findIndex((s) => s.dead);
    const idx = i >= 0 ? i : this.slots.length;
    if (idx >= this.size) return null;
    let w;
    try { w = this.factory(); } catch (e) { this._fail(e); return null; }
    const s = { w, i: idx, jobs: new Map(), ready: false, dead: false };
    w.onmessage = (e) => this._onMessage(s, e.data);
    w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this._onError(s, e); };
    w.onmessageerror = () => this._onError(s, new Error('messageerror'));
    if (this.stats) {
      for (let k = 0; k < SLOT; k++) Atomics.store(this.stats, idx * SLOT + k, 0);
      w.postMessage({ __init: { stats: this.stats.buffer, slot: idx } });
    }
    this.slots[idx] = s;
    this.spawned++;
    return s;
  }

  _pick() {
    let best = null;
    for (const s of this.slots) if (!s.dead && s.jobs.size < this.maxInFlight && (!best || s.jobs.size < best.jobs.size)) best = s;
    // 所有活著的都在忙 → 還有名額就開新的
    if ((!best || best.jobs.size > 0) && this.alive < this.size) return this._spawn() || best;
    return best;
  }

  _pump() {
    clearTimeout(this._idleT);
    while (this.queue.length && !this.failed) {
      const s = this._pick();
      if (!s) break;
      const job = this.queue.shift();
      s.jobs.set(job.id, job);
      job.sent = now();
      try { s.w.postMessage({ id: job.id, m: job.method, a: job.args }, job.transfer); }
      catch (e) { s.jobs.delete(job.id); job.reject(e); }
    }
    if (!this.queue.length && !this.inFlight && this.idleMs > 0) this._idleT = setTimeout(() => this.terminate(), this.idleMs);
  }

  _onMessage(s, d) {
    if (d && d.__ready) { s.ready = true; this.loadFails = 0; return; }
    const job = s.jobs.get(d.id);
    if (!job) return;
    s.jobs.delete(d.id);
    s.ready = true;
    this.done++;
    this.workMs += d.ms || 0;
    this.waitMs += Math.max(0, now() - job.t - (d.ms || 0));
    if (!this.stats) s.lastMs = d.ms;
    if (d.ok) job.resolve(d.r);
    else { this.errors++; job.reject(new Error(`${this.name}.${job.method}: ${d.e}`)); }
    this._pump();
  }

  _onError(s, e) {
    if (s.dead) return;
    if (s.ready) { // 執行中的非同步例外:記錄後繼續用
      console.warn(`[${this.name}] worker error`, e && (e.message || e));
      return;
    }
    // 載入失敗:這個 Worker 作廢,工作退回佇列;連續失敗兩次就整個池停用
    s.dead = true;
    try { s.w.terminate(); } catch { /* 已經死了 */ }
    for (const job of s.jobs.values()) this.queue.unshift(job);
    s.jobs.clear();
    if (++this.loadFails >= 2) this._fail(e);
    else this._pump();
  }

  _fail(e) {
    if (this.failed) return;
    this.failed = true;
    console.warn(`[${this.name}] Worker 不可用,改用主執行緒:`, (e && (e.message || e.type)) || e);
    for (const s of this.slots) { s.dead = true; try { s.w.terminate(); } catch { /* ignore */ } for (const j of s.jobs.values()) this.queue.push(j); s.jobs.clear(); }
    for (const j of this.queue.splice(0)) j.reject(new Error(`${this.name}: Worker 不可用`));
  }

  // 閒置一段時間後關掉所有 Worker 釋放記憶體(之後有工作會再開)
  terminate() {
    if (this.inFlight || this.queue.length) return;
    for (const s of this.slots) if (!s.dead) { s.dead = true; s.w.terminate(); }
    this.slots.length = 0;
  }

  info() {
    return { name: this.name, size: this.size, alive: this.alive, busy: this.busy, queued: this.queue.length, inFlight: this.inFlight, done: this.done, errors: this.errors, failed: this.failed, workMs: Math.round(this.workMs) };
  }
}

export function createPool(factory, opts) { return new WorkerPool(factory, opts); }

// ---------- Worker 端 ----------
export function serve(handlers) {
  let stats = null, slot = 0;
  const g = globalThis;
  g.onmessage = async (e) => {
    const d = e.data;
    if (d && d.__init) { stats = new Int32Array(d.__init.stats); slot = d.__init.slot; return; }
    const t0 = now();
    if (stats) Atomics.store(stats, slot * SLOT, 1);
    let msg, tr;
    try {
      const fn = handlers[d.m];
      if (!fn) throw new Error(`未知方法 ${d.m}`);
      let r = fn(...(d.a || []));
      if (r && typeof r.then === 'function') r = await r;
      msg = { id: d.id, ok: 1, r, ms: now() - t0 };
      tr = transferables(r);
    } catch (err) {
      msg = { id: d.id, ok: 0, e: String((err && (err.stack || err.message)) || err), ms: now() - t0 };
    }
    if (stats) {
      Atomics.store(stats, slot * SLOT, 0);
      Atomics.add(stats, slot * SLOT + 1, 1);
      Atomics.add(stats, slot * SLOT + 2, Math.round(msg.ms));
    }
    g.postMessage(msg, tr || []);
  };
  g.postMessage({ __ready: 1 });
}
