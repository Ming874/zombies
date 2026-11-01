// 樣本庫:public/audio/**.mp3(CC0 / CC-BY,署名見 public/credits/audio.md)。
// AudioContext 建立後依類別分批背景載入:fetch → decodeAudioData(在背景執行緒解碼,不卡主執行緒),同時最多 3 個請求。
// 每個事件依 bank.js 的 sr 解碼成較低取樣率(殭屍語音 24kHz、腳步 32kHz…,記憶體省一半以上;播放時自動重取樣)。
// world/scare 類別第一次用到才載(之前用合成版本);環境音床(LOOPS)降成單聲道、太久沒用會釋放。
// 同一事件多個變體隨機挑選(不連續重複)+ 輕微音高/音量隨機。缺檔或載入失敗時 play() 回傳 null,呼叫端退回合成版本。
import { A, emit, playBuf, rand } from './core.js';
import { BANK, CATS, LAZY, LOOPS } from './bank.js';

export { BANK, LOOPS };
const BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/`;
const SB = { buf: new Map(), fail: new Set(), cat: {}, last: {}, ok: 0, bad: 0, bytes: 0, secs: 0, pcm: 0, ms: 0, q: [], active: 0, started: false, loops: new Map(), loopReq: new Map() };
const fileSR = new Map(); // 檔案 → 解碼取樣率
for (const k in BANK) for (const f of BANK[k].f) fileSR.set(f, Math.max(fileSR.get(f) || 0, BANK[k].sr || 0));

function fileList(cat) {
  const out = new Set();
  for (const k in BANK) if (BANK[k].cat === cat) for (const f of BANK[k].f) out.add(f);
  return [...out];
}

function pump() {
  while (SB.active < 3 && SB.q.length) {
    const job = SB.q.shift();
    SB.active++;
    const t0 = performance.now();
    fetch(BASE + job.f)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((ab) => { SB.bytes += ab.byteLength; return decode(ab, job.sr); })
      .then((b) => job.ok(job.mono ? toMono(b) : b))
      .catch(() => { SB.fail.add(job.f); SB.bad++; job.ok(null); })
      .finally(() => { SB.ms += performance.now() - t0; SB.active--; pump(); });
  }
}

// 指定取樣率解碼:用該取樣率的 OfflineAudioContext(解碼結果會重取樣到它的取樣率;AudioBuffer 可在任何 context 播放)
const decoders = new Map();
function decoderFor(sr) {
  const real = A.ctx;
  if (!sr || !real || sr >= real.sampleRate || typeof OfflineAudioContext === 'undefined') return real;
  let d = decoders.get(sr);
  if (!d) { try { d = new OfflineAudioContext(1, 1, sr); } catch { d = real; } decoders.set(sr, d); }
  return d;
}
function decode(ab, sr) {
  const ctx = decoderFor(sr);
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab, res, rej); // 舊版 Safari 只支援 callback
    if (p && p.then) p.then(res, rej);
  });
}
function toMono(b) {
  if (b.numberOfChannels < 2) return b;
  const m = new AudioBuffer({ numberOfChannels: 1, length: b.length, sampleRate: b.sampleRate });
  const o = m.getChannelData(0), l = b.getChannelData(0), r = b.getChannelData(1);
  for (let i = 0; i < o.length; i++) o[i] = (l[i] + r[i]) * 0.5;
  return m;
}
const pcmMB = (b) => (b.length * b.numberOfChannels * 4) / 1048576;

function enqueue(f, sr, front, mono) {
  return new Promise((ok) => SB.q[front ? 'unshift' : 'push']({ f, sr, mono, ok }));
}

// 載入某類別(回傳 Promise,全部完成時 resolve;重複呼叫共用同一個)
export function loadCat(cat, front = false) {
  if (SB.cat[cat]) return SB.cat[cat];
  if (!A.ctx) return Promise.resolve();
  const files = fileList(cat).filter((f) => !SB.buf.has(f) && !SB.fail.has(f));
  SB.cat[cat] = Promise.all(files.map((f) => enqueue(f, fileSR.get(f), front).then((b) => {
    if (!b) return;
    SB.buf.set(f, b); SB.ok++; SB.secs += b.duration; SB.pcm += pcmMB(b);
  })));
  pump();
  return SB.cat[cat];
}

// 啟動時依優先順序排入非延遲類別(戰鬥要用的先載;配樂用串流,不在這裡)
export function startLoading() {
  if (SB.started || !A.ctx) return;
  SB.started = true;
  CATS.filter((c) => !LAZY.has(c)).forEach((c, i) => setTimeout(() => loadCat(c), i * 300));
}

export const ready = (cats = CATS.filter((c) => !LAZY.has(c))) => Promise.all(cats.map((c) => loadCat(c)));

// 單一檔案(folk 的真人錄音,見 vox.js):排進同一個載入佇列(同時最多 3 個、背景解碼成 sr 單聲道);失敗回傳 null
export function fetchBuf(f, sr, mono = true) {
  if (!A.ctx) return Promise.resolve(null);
  const p = enqueue(f, sr, false, mono);
  pump();
  return p;
}

// 隨機取一個已載入的變體(不連續重複):回傳 { b 緩衝, g 增益(事件 g × 檔案正規化 n) };沒有就觸發該類別載入並回傳 null
const PICK = { b: null, g: 1 };
export function get(key) {
  const B = BANK[key];
  if (!B || A.noSamples) return null; // A.noSamples:測試用,強制走合成
  let n = 0;
  for (const f of B.f) if (SB.buf.has(f)) n++;
  if (!n) { if (A.ctx && !SB.cat[B.cat]) loadCat(B.cat, true); return null; }
  let k = (Math.random() * n) | 0;
  if (n > 1 && B.f.indexOf(SB.last[key]) >= 0) { // 不連續重複同一個檔案
    let j = 0, idx = -1;
    for (let i = 0; i < B.f.length; i++) if (SB.buf.has(B.f[i])) { if (B.f[i] === SB.last[key]) idx = j; j++; }
    if (k === idx) k = (k + 1 + ((Math.random() * (n - 1)) | 0)) % n;
  }
  let j = 0;
  for (let i = 0; i < B.f.length; i++) {
    if (!SB.buf.has(B.f[i])) continue;
    if (j++ === k) { SB.last[key] = B.f[i]; PICK.b = SB.buf.get(B.f[i]); PICK.g = (B.g ?? 1) * (B.n ? B.n[i] : 1); return PICK; }
  }
  return null;
}
export const buf = (key) => { const p = get(key); return p ? p.b : null; };
export const has = (key) => !!BANK[key] && BANK[key].f.some((f) => SB.buf.has(f));
export const known = (key) => !!BANK[key];
export const _bufOf = (f) => SB.buf.get(f); // 測試用:依檔名取緩衝

// 播放:o.h 傳入既有的發聲 handle 就疊在同一個聲道條上(錄音 + 合成分層);否則自己 emit(o 同 emit 參數)。
// o.g 增益、o.p 音高隨機(半音)、o.semi 固定移調、o.at 延遲、o.off/len 截取片段、o.fi/fo 淡入淡出、o.rate 額外速度倍率
export function play(key, o = {}) {
  if (!A.ctx) return null;
  const pk = get(key);
  if (!pk) return null;
  const b = pk.b, B = BANK[key];
  const rate = Math.pow(2, ((rand(-1, 1) * (o.p ?? B.p ?? 0.6)) + (o.semi ?? 0)) / 12) * (o.rate ?? 1);
  const len = o.len ?? (b.duration - (o.off ?? 0)) / rate;
  const g = pk.g * (o.g ?? 1) * Math.pow(10, (rand(-1, 1) * (B.v ?? 1.5)) / 20);
  const h = o.h || emit({ ...o, gain: o.gain ?? 1, dur: o.dur ?? len + (o.at ?? 0) + 0.05 });
  if (!h) return null;
  playBuf(h.in, h.t + (o.at ?? 0), b, { rate, g, off: o.off, len: o.len, fi: o.fi, fo: o.fo ?? (o.len ? 0.03 : 0) });
  return h;
}

// ---------- 環境音床(循環) ----------
// loop(key) → { b, g } 或 null(第一次會開始載入);每 40 秒檢查一次,90 秒沒用到的音床釋放
export function loop(key) {
  const L = LOOPS[key];
  if (!L || !A.ctx || A.noSamples) return null;
  const have = SB.loops.get(key);
  if (have) { have.used = A.ctx.currentTime; return have; }
  if (!SB.loopReq.has(key)) {
    const f = L.f[(Math.random() * L.f.length) | 0], i = L.f.indexOf(f);
    SB.loopReq.set(key, enqueue(f, L.sr, false, true).then((b) => {
      if (!b) return;
      SB.loops.set(key, { b, g: L.n ? L.n[i] : 1, used: A.ctx ? A.ctx.currentTime : 0 });
      SB.pcm += pcmMB(b);
    }));
    pump();
  }
  return null;
}
export function loopReady(key) { loop(key); return SB.loopReq.get(key) || Promise.resolve(); }
let gcT = 0;
export function loopGC(now, inUse) {
  if (now - gcT < 40) return;
  gcT = now;
  for (const [k, v] of SB.loops) if (!inUse.has(k) && now - v.used > 90) { SB.pcm -= pcmMB(v.b); SB.loops.delete(k); SB.loopReq.delete(k); }
}

export function stats() {
  const files = Object.values(BANK).reduce((s, B) => s + B.f.length, 0);
  return { files, loaded: SB.ok, failed: SB.bad, failedFiles: [...SB.fail].slice(0, 10), mb: +(SB.bytes / 1048576).toFixed(2), bufferSec: +SB.secs.toFixed(1), pcmMB: +SB.pcm.toFixed(1), loops: [...SB.loops.keys()], loadMs: Math.round(SB.ms), pending: SB.q.length + SB.active };
}
