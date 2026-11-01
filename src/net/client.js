// 連線用戶端:WebSocket 連線、斷線自動重連(用 token 接回原本的座位)、JSON/二進位收送、
// 延遲與時鐘同步(取最低延遲的樣本估計伺服器時間)、頻寬統計。
import { PROTO } from './protocol.js';

const utf8Len = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; };
const RETRY = [300, 700, 1200, 2000, 3000, 4000, 5000];
const DEAD_MS = 7000; // 這麼久沒收到任何東西(伺服器每 5 秒廣播延遲、每 2 秒回 pong)就當連線已死,主動重連

export class NetClient {
  constructor() {
    this.ws = null;
    this.status = 'idle'; // idle | connecting | open | reconnecting | closed
    this.id = 0;
    this.name = '';
    this.token = null;
    this.handlers = new Map();
    this.onBinary = null;
    this.rtt = 0;
    this.jitter = 0;
    this.offset = 0; // 伺服器時間 − 本機 performance.now()
    this.synced = false;
    this.samples = [];
    this.want = false;
    this.lostAt = 0;
    this.retry = 0;
    this.stats = { inB: 0, outB: 0, inM: 0, outM: 0, inBps: 0, outBps: 0, inMps: 0, outMps: 0, binIn: 0, binOut: 0 };
    this._acc = { inB: 0, outB: 0, inM: 0, outM: 0 };
    this._timers = [];
  }

  // 同源的 /ws(HTTPS 頁面 → wss://);測試時可用 ?server=ws://… 指定其他伺服器
  url() {
    const q = new URLSearchParams(location.search).get('server');
    if (q && /^wss?:\/\//.test(q)) return q;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  // 連上並完成 hello;resolve 伺服器的 welcome
  connect(name) {
    this.name = name;
    this.want = true;
    if (this.status === 'open') return Promise.resolve({ id: this.id, name: this.name });
    return new Promise((resolve, reject) => {
      const done = (m) => { this.off('welcome', done); this.off('_fail', fail); resolve(m); };
      const fail = (e) => { this.off('welcome', done); this.off('_fail', fail); reject(e); };
      this.on('welcome', done);
      this.on('_fail', fail);
      this._open();
    });
  }

  _open() {
    this.status = this.lostAt ? 'reconnecting' : 'connecting';
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { this._closed(e); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this._send({ t: 'hello', v: PROTO, name: this.name, token: this.token });
    };
    ws.onmessage = (ev) => this._message(ev.data);
    ws.onclose = (ev) => { if (this.ws === ws) this._closed(ev); };
    ws.onerror = () => {};
  }

  _message(data) {
    this.lastRx = performance.now();
    if (typeof data !== 'string') {
      this._acc.inB += data.byteLength;
      this._acc.inM++;
      this.stats.binIn++;
      if (this.onBinary) this.onBinary(data);
      return;
    }
    this._acc.inB += utf8Len(data);
    this._acc.inM++;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    switch (m.t) {
      case 'welcome': {
        const resumed = !!this.lostAt;
        this.id = m.id;
        this.name = m.name;
        this.token = m.token;
        this.status = 'open';
        this.lostAt = 0;
        this._startTimers();
        // 一連上就連續量幾次延遲,讓時鐘同步盡快收斂
        for (let i = 0; i < 5; i++) setTimeout(() => this.ping(), 60 + i * 120);
        if (resumed) this.emit('reconnected', m);
        break;
      }
      case 'pong': {
        const now = performance.now(), rtt = now - m.c;
        if (rtt < 0 || rtt > 30000) break;
        this.jitter += (Math.abs(rtt - this.rtt) - this.jitter) * 0.2;
        this.rtt = this.rtt ? this.rtt + (rtt - this.rtt) * 0.25 : rtt;
        this.samples.push({ rtt, off: m.s + rtt / 2 - now });
        if (this.samples.length > 12) this.samples.shift();
        let best = this.samples[0];
        for (const s of this.samples) if (s.rtt < best.rtt) best = s;
        if (!this.synced || Math.abs(best.off - this.offset) > 60) this.offset = best.off;
        else this.offset += (best.off - this.offset) * 0.15;
        this.synced = true;
        break;
      }
      default:
    }
    this.emit(m.t, m);
  }

  _closed(ev) {
    this._stopTimers();
    this.ws = null;
    // 版本不符(伺服器已更新):不再重試,請使用者重新整理
    if (ev && ev.code === 4000) {
      const was = this.status;
      this.want = false;
      this.status = 'closed';
      this.lostAt = 0;
      this.token = null;
      if (was === 'connecting') this.emit('_fail', new Error('遊戲已更新，請重新整理頁面'));
      else this.emit('lost', { reason: 'version' });
      return;
    }
    if (this.status === 'connecting' && !this.token) {
      this.status = 'closed';
      this.emit('_fail', new Error('無法連線到伺服器'));
      return;
    }
    if (!this.want) { this.status = 'closed'; this.emit('closed', ev); return; }
    // 非預期斷線:重試 25 秒(伺服器保留座位 20 秒)
    if (!this.lostAt) { this.lostAt = performance.now(); this.emit('reconnecting'); }
    if (performance.now() - this.lostAt > 25000) {
      this.status = 'closed';
      this.lostAt = 0;
      this.token = null;
      this.emit('lost');
      return;
    }
    this.status = 'reconnecting';
    const d = RETRY[Math.min(this.retry++, RETRY.length - 1)];
    setTimeout(() => { if (this.want && !this.ws) this._open(); }, d);
  }

  _startTimers() {
    this._stopTimers();
    this.lastRx = performance.now();
    this._timers.push(setInterval(() => {
      // 網路靜默斷掉時瀏覽器可能很久都不會觸發 close(關閉握手卡住):收不到東西就自己斷開、走重連
      if (this.status === 'open' && performance.now() - this.lastRx > DEAD_MS) { this._drop(); return; }
      this.ping();
    }, 2000));
    this._timers.push(setInterval(() => {
      const a = this._acc, s = this.stats;
      s.inBps = a.inB; s.outBps = a.outB; s.inMps = a.inM; s.outMps = a.outM;
      s.inB += a.inB; s.outB += a.outB; s.inM += a.inM; s.outM += a.outM;
      a.inB = a.outB = a.inM = a.outM = 0;
    }, 1000));
  }
  _stopTimers() { for (const t of this._timers) clearInterval(t); this._timers.length = 0; }
  _drop() {
    const ws = this.ws;
    this.ws = null; // 之後這條連線的 onclose 不再處理
    if (ws) { ws.onmessage = null; try { ws.close(4001, 'timeout'); } catch { /* 忽略 */ } }
    this._closed({ code: 4001 });
  }

  ping() { if (this.status === 'open') this._send({ t: 'ping', c: performance.now() }); }
  serverNow() { return performance.now() + this.offset; }
  get open() { return this.status === 'open' && this.ws && this.ws.readyState === 1; }

  _send(obj) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    const s = JSON.stringify(obj);
    ws.send(s);
    this._acc.outB += utf8Len(s);
    this._acc.outM++;
    return true;
  }
  send(t, obj = {}) { obj.t = t; return this._send(obj); }
  // 遊戲事件(房間內轉發);to = 指定座位
  game(k, d, to) { return this._send(to === undefined || to === null ? { t: 'g', k, d } : { t: 'g', k, d, to }); }
  sendBin(view) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    if (ws.bufferedAmount > 256 * 1024) return false; // 網路塞住:丟掉這幀狀態(下一幀會補上)
    ws.send(view);
    this._acc.outB += view.byteLength;
    this._acc.outM++;
    this.stats.binOut++;
    return true;
  }

  on(t, fn) { let l = this.handlers.get(t); if (!l) this.handlers.set(t, (l = new Set())); l.add(fn); return () => this.off(t, fn); }
  off(t, fn) { this.handlers.get(t)?.delete(fn); }
  emit(t, m) {
    const l = this.handlers.get(t);
    if (!l) return;
    for (const fn of [...l]) { try { fn(m); } catch (e) { console.error('[net]', t, e); } }
  }

  close() {
    this.want = false;
    this.lostAt = 0;
    this.token = null;
    this._stopTimers();
    if (this.ws) { try { this.ws.close(1000, 'bye'); } catch { /* 忽略 */ } }
    this.ws = null;
    this.status = 'closed';
  }
}
