// 互動物件音效:玩家能操作的機關與道具(電燈開關、電話、販賣機、鋼琴、音樂盒、電梯、火警、廣播、門、置物櫃、抽屜、藥櫃、
// 水龍頭、打字機、護理站呼叫鈴、收音機/電視、輪椅/推床、紙張、錄音帶)。死寂醫院裡克制、寫實的機械擬音,不卡通。
// 全部即時合成(部分疊錄音樣本:門的吱嘎/鐵門、金屬刮擦、硬幣、鐵扣、老式電話鈴、電視雜訊;沒載入時一樣有完整的合成版本)。
// 一次性音效走 emit()(全域發聲上限 + 優先權 2..5);給 pos({x,y,z})= 3D 定位,pos 為 null = 玩家自己手上/耳邊(非定位)。
// 循環音(電話鈴、火警鈴、水龍頭)只登記狀態:聆聽者進入範圍(同樓層 ±1)才建立節點,離開或停止就拆掉;A.world 換掉(換地圖)時自動停掉定位循環音。
// 聽筒音(撥號音、忙線音、未掛好警示音、空線雜訊、錄音帶底噪)是非定位的單例音床,關掉就拆。鈴聲/水流這類重複的波形直接算樣本(只算一次)。
// AudioContext 未建立時全部安全地不做事、不丟例外(循環音的登記照樣記下,context 建好後自動開始)。
//
// 介面(ix.*):
//  開關   switchClick(pos, on)
//  電話   ringStart(key, pos, kind)(kind:'bell' 老式電話雙鈴 | 'trill' 90 年代電子話機 | 'payphone' 公共電話)ringStop(key) ringing(key)
//         pickup(pos) hangup(pos) dialTone(on) busyTone(on) offHook(on) dtmf(digit) lineNoise(on)
//         phoneVoice(text, { voice:'woman'|'man'|'child'|'old', pos, filter:'phone'|'radio'|'pa'|'tv', gain }) → { dur, stop() }
//  販賣機 coin(pos) vendButton(pos) vendDrop(pos) canOpen() drink() vendDeny(pos)
//  樂器   pianoNote(pos, midi, vel) musicBoxWind(pos) musicBox(pos, n, slow)(回傳秒數)mobileChime(pos)
//  電梯   elevatorDing(pos) elevatorDoor(pos, open) elevatorMotor(pos)
//  火警/廣播 alarmPull(pos) alarmStart(key, pos) alarmStop(key) paKey(pos) micFeedback(pos)
//  門     doorOpen(pos, kind) doorClose(pos, kind)(kind:'fire' | 'cell' | 'ward' | 'glass' | 'wood')doorBash(pos, heavy) barricade(pos) barricadeBreak(pos) doorKnock(pos, n)
//  收納   lockerOpen/lockerClose(pos) drawerOpen/drawerClose(pos) cabinetOpen/cabinetClose(pos) rummage(pos)
//  水     tapStart(key, pos, dirty) tapStop(key) tapSqueak(pos) pipeKnock(pos)
//  其他   typeKey(pos) typeReturn(pos) nurseCall(pos) tuneSweep(pos) tvOn(pos) tvOff(pos) wheelSqueak(pos) gurneyRoll(pos)(這兩個會跟隨傳入的位置物件)
//         paper() paperClose() pageTurn() tapeLine(on) stats()
import { A, emit, onTick, gain, filter, burst, tone, metal, bubble, shaper, playBuf, curve, duck, baked, rand, pick, clamp, distTo, levelOf } from './core.js';
import { click, clack, slide, squeal } from './foley.js';
import * as S from './samples.js';
import { MEL as FMEL } from './folk.js';

const DEV = import.meta.env?.DEV;
const warn = (e) => { if (DEV) console.warn('[audio/ix]', e); };
// 同 audio.js 的 safe/always(不從 audio.js 匯入,避免循環相依)
const safe = (fn) => (...a) => { if (!A.ctx) return; try { return fn(...a); } catch (e) { warn(e); } };
const always = (fn) => (...a) => { try { return fn(...a); } catch (e) { warn(e); } };
const P = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : null);

// 一次性聲音:pos 有效 = 3D(fx 聲道條),否則 = 玩家手上/耳邊(非定位,o.self 為自身殘響送出)
function E(pos, o) {
  const p = P(pos);
  if (p) return emit({ cat: 'fx', ref: 1.5, track: false, ...o, pos: p });
  return emit({ bus: 'sfx', prio: o.prio ?? 4, dur: o.dur, delay: o.delay, gain: o.gain ?? 1, room: o.self ?? 0.1, hall: o.selfHall ?? 0 });
}
function osc(type, f, dest) { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest); o.start(); return o; }
function noiseSrc(kind, dest) { const s = A.ctx.createBufferSource(); s.buffer = A.noise[kind]; s.loop = true; if (dest) s.connect(dest); s.start(A.ctx.currentTime, Math.random() * 3); return s; }
// 揚聲器/電話頻寬:輸入 → 輕微飽和 → 高通 → 低通 → dest(回傳輸入節點)
const band = (dest, lo, hi, k = 1.4) => shaper(k, filter('highpass', lo, 0.75, filter('lowpass', hi, 0.75, dest)));
// 隨機顆粒調幅(紙張皺摺、木纖維撕裂、滾輪顫動):把 burst 的包絡換成隨機曲線
function grain(b, t, dur, g, rate, dens, lo = 0.05) {
  b.g.gain.cancelScheduledValues(t);
  b.g.gain.setValueCurveAtTime(curve(Math.max(16, Math.ceil(dur * rate)), (u) => g * (Math.random() < dens ? rand(0.6, 1) : rand(lo, lo * 4)) * Math.min(1, u * 12, (1 - u) * 12 + 0.02)), t, dur);
  return b;
}
const crinkle = (d, t, dur, g, f = 3200) => grain(burst(d, t, { type: 'bandpass', f, q: 0.7, dur, g }), t, dur, g, 120, 0.35);
// 刮擦/卡頓摩擦:foley.squeal 的 g 是窄帶濾波之後的量(Q 越高、頻率越低越小聲),這裡換成和頻寬無關的音量 lv
const sq = (d, t, f0, f1, dur, lv, q = 18, rate) => squeal(d, t, f0, f1, dur, lv * Math.sqrt((q * 1000) / f0), q, rate);
const hashPos = (p) => (((Math.floor(p.x * 3.7) * 73856093) ^ (Math.floor(p.z * 3.7) * 19349663)) >>> 0);
// 錄音循環音床截一段(電視雜訊);沒載入時回傳 false(並開始載入)
function seg(key, h, at, len, g) {
  const L = S.loop(key);
  if (!L) return false;
  playBuf(h.in, h.t + at, L.b, { off: rand(0, Math.max(0, L.b.duration - len - 0.5)), len, g: L.g * g, fi: 0.02, fo: Math.min(0.4, len * 0.3) });
  return true;
}

// ---------- 直接算樣本的緩衝(鈴、水流、劈啪;只算一次,之後每次播放只剩一個 BufferSource) ----------
const BUF = new Map();
function norm(d, to) {
  let pk = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
  if (pk > 0) { const k = to / pk; for (let i = 0; i < d.length; i++) d[i] *= k; }
  return d;
}
function mkBuf(key, secs, sr, fill) {
  let b = BUF.get(key);
  if (b) return b;
  const n = Math.ceil(secs * sr);
  b = A.ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  fill(d, sr, n);
  norm(d, 0.5);
  BUF.set(key, b);
  return b;
}
const fadeEnd = (d, sr, s) => { const m = Math.min(d.length, Math.floor(s * sr)); for (let i = 0; i < m; i++) d[d.length - 1 - i] *= i / m; };
// 鈴錘一擊:1.5ms 的衰減噪音脈衝(寫進激發訊號)
function strikeAt(x, sr, t, a) {
  const i0 = Math.round(t * sr), m = Math.max(8, Math.round(sr * 0.0015));
  for (let j = 0; j < m && i0 + j < x.length; j++) x[i0 + j] += a * (Math.random() * 2 - 1) * Math.exp(-j / (m * 0.3));
}
// 模態共振(兩極點共振器組):x 激發訊號(循環使用),modes = [[頻率, 衰減秒, 振幅]…];skip 預熱樣本數(循環音:接縫處於穩態,接起來無縫)
function modal(d, sr, x, modes, skip = 0) {
  const n = d.length, xl = x.length;
  for (const [f, tau, a] of modes) {
    if (f > sr * 0.45) continue;
    const w = (2 * Math.PI * f) / sr, r = Math.exp(-1 / (tau * sr)), c = 2 * r * Math.cos(w), r2 = r * r, k = a * Math.sin(w);
    let y1 = 0, y2 = 0;
    for (let i = 0, N = n + skip; i < N; i++) {
      const y = c * y1 - r2 * y2 + x[i % xl];
      y2 = y1; y1 = y;
      if (i >= skip) d[i - skip] += y * k;
    }
  }
}

// ---------- 電話鈴(一個循環 = 響 1 秒) ----------
// bell:兩個鈴碗被 20Hz 鈴錘交替敲擊;payphone:較大的單鈴、兩個音靠得很近(拍頻刺耳)、鈴錘更粗暴、飽和
const RING = {
  bell: { rate: 20, gongs: [[1180, [1, 2.31, 3.94, 5.8]], [1420, [1, 2.27, 3.86, 5.6]]], tau: 0.6, clat: 0.15, drive: 1.5 },
  payphone: { rate: 25, gongs: [[880, [1, 1.52, 2.18, 3.73, 5.4]], [925, [1, 2.2, 3.7, 5.3]]], tau: 0.75, clat: 0.4, drive: 3 },
};
function bellRing(kind) {
  const R = RING[kind];
  return mkBuf(`ring|${kind}`, 2.6, 24000, (d, sr, n) => {
    const all = new Float32Array(n);
    R.gongs.forEach(([f, rat], gi) => {
      const x = new Float32Array(n);
      for (let k = 0, tt = gi / (2 * R.rate); tt < 1; k++, tt += 1 / R.rate) strikeAt(x, sr, tt + rand(0, 0.0012), rand(0.8, 1) * Math.min(1, (k + 1) / 3)); // 前幾下鈴錘還在起動
      modal(d, sr, x, rat.map((r, i) => [f * r, R.tau / (1 + i * 0.8), 1 / (1 + i * 0.6)]));
      for (let i = 0; i < n; i++) all[i] += x[i];
    });
    norm(d, 1);
    const kd = Math.tanh(R.drive);
    for (let i = 0; i < n; i++) d[i] = Math.tanh(R.drive * (d[i] + all[i] * R.clat)) / kd; // 鈴錘本身的金屬碰撞 + 小喇叭般的飽和
    fadeEnd(d, sr, 0.4);
  });
}
// trill:兩個音每秒切換 16 次的電子振鈴(壓電蜂鳴片,近似方波),「嘟嚕嚕—嘟嚕嚕」兩段
function trillBuf() {
  return mkBuf('ring|trill', 1.05, 24000, (d, sr, n) => {
    const fa = 1270, fb = 1610, on = [[0, 0.4], [0.6, 1]];
    const w = (2 * Math.PI * 3300) / sr, r = Math.exp(-1 / (0.0025 * sr)), c = 2 * r * Math.cos(w), r2 = r * r, kr = Math.sin(w) * 0.5;
    let ph = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let e = 0;
      for (const [a, b] of on) if (t >= a && t < b) e = Math.min(1, (t - a) / 0.003, (b - t) / 0.003);
      const f = Math.floor(t * 32) % 2 ? fb : fa;
      ph += (2 * Math.PI * f) / sr;
      let s = 0;
      for (let k = 1; k <= 7; k += 2) if (f * k < sr * 0.45) s += Math.sin(ph * k) / k; // 只取奇次諧波,避免混疊
      s *= e;
      const y = c * y1 - r2 * y2 + s; // 壓電片共振
      y2 = y1; y1 = y;
      d[i] = s * 0.55 + y * kr;
    }
  });
}
// 火警鈴:2 秒穩態循環(24Hz 鈴錘打大鈴碗,預熱 4 秒讓接縫處於穩態)
function alarmBuf() {
  return mkBuf('alarm', 2, 24000, (d, sr, n) => {
    const x = new Float32Array(n);
    for (let k = 0; k < 48; k++) strikeAt(x, sr, k / 24 + rand(0, 0.0015), rand(0.82, 1));
    const f = 880;
    modal(d, sr, x, [[f, 0.7, 1], [f * 1.52, 0.45, 0.3], [f * 2.18, 0.4, 0.6], [f * 3.73, 0.25, 0.4], [f * 5.4, 0.15, 0.25]], Math.round(4 * sr));
    norm(d, 1);
    for (let i = 0; i < n; i++) d[i] = Math.tanh(1.6 * (d[i] + x[i] * 0.2));
  });
}
// 水流:水柱打在洗手台的寬頻嘶聲(白噪音過兩段一階濾波,跑兩遍讓循環接縫處於穩態)+ 上滑的氣泡(Minnaert 共振)
function waterBuf() {
  return mkBuf('water', 3, 24000, (d, sr, n) => {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    let l1 = 0, l2 = 0;
    const ph = rand(0, 6.283);
    for (let p = 0; p < 2; p++) for (let i = 0; i < n; i++) {
      l1 += 0.55 * (w[i] - l1); l2 += 0.1 * (l1 - l2);
      if (p) d[i] = (l1 - l2) * 0.35 * (1 + 0.22 * Math.sin((6.283 * 3 * i) / n + ph) + 0.12 * Math.sin((6.283 * 7 * i) / n)); // 水量的起伏(整數週期,接縫一致)
    }
    for (let b = 0; b < 220; b++) {
      const f0 = 450 * Math.pow(8, Math.random()), tau = 0.003 + 0.01 * Math.pow(1000 / f0, 0.7) * Math.random();
      const i0 = (Math.random() * n) | 0, L = Math.ceil(tau * 5 * sr), k = Math.exp(-1 / (tau * sr)), w0 = (2 * Math.PI * f0) / sr, dw = (w0 * 0.6) / L;
      let ph = 0, e = rand(0.08, 0.4) * (Math.random() < 0.1 ? 2 : 1);
      for (let j = 0; j < L; j++) { ph += w0 + dw * j; d[(i0 + j) % n] += e * Math.sin(ph); e *= k; } // 上滑 60%、指數衰減
    }
  });
}
// 空線上的劈啪(稀疏的小爆音)
function crackBuf() {
  return mkBuf('crack', 3, 16000, (d, sr, n) => {
    for (let k = 0; k < 45; k++) {
      const i0 = (Math.random() * n) | 0, a = rand(0.05, 0.4) * (Math.random() < 0.1 ? 2.5 : 1), m = (sr * rand(0.0005, 0.003)) | 0;
      let y = 0;
      for (let i = 0; i < m; i++) { y += 0.6 * (Math.random() * 2 - 1 - y); d[(i0 + i) % n] += y * a * Math.exp(-i / (m * 0.25)); }
    }
  });
}
// 棘輪「喀」:小金屬片的高頻模態 + 機身
function ratchetBuf(v) {
  return mkBuf(`ratchet|${v}`, 0.05, 32000, (d, sr, n) => {
    const x = new Float32Array(n);
    strikeAt(x, sr, 0.001, 1);
    const k = rand(0.9, 1.12);
    modal(d, sr, x, [[4700 * k, 0.006, 1], [6900 * k, 0.004, 0.7], [9300 * k, 0.003, 0.4], [1250 * k, 0.008, 0.5]]);
    for (let i = 0; i < n; i++) d[i] += x[i] * 0.15;
    fadeEnd(d, sr, 0.01);
  });
}

// 閒置時間預先算好波形(登記循環音時算它要用的;context 啟動幾秒後再把全部排進去,每個閒置片段算一個),第一次響不會卡一幀
function idle(fn) { const f = () => { try { if (A.ctx) fn(); } catch (e) { warn(e); } }; if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 1500 }); else setTimeout(f, 30); }
const GEN = [() => bellRing('bell'), trillBuf, () => bellRing('payphone'), alarmBuf, waterBuf, crackBuf, () => ratchetBuf(0), () => ratchetBuf(1), () => ratchetBuf(2)];
let genI = -1;
function pregen() { if (genI >= 0 && genI < GEN.length) idle(() => { GEN[genI++](); pregen(); }); }
const bufFor = (L) => (L.kind === 'alarm' ? alarmBuf() : L.kind === 'tap' ? waterBuf() : L.arg === 'trill' ? trillBuf() : bellRing(L.arg === 'payphone' ? 'payphone' : 'bell'));

// ---------- 定位循環音(電話鈴、火警鈴、水龍頭) ----------
// 只登記狀態;聆聽者進入範圍才建立節點(一條 loop 聲道條 + 種類自己的音源),離開範圍或停止就拆。pos 為 null = 非定位(永遠在範圍內)
const LP = new Map(); // id → { kind, arg, pos, t0(登記時間,節奏相位用), live, retry }
const RPER = 3; // 台灣式電話鈴節奏:響 1 秒、停 2 秒
function ringBuild(L, out, t) {
  const kind = L.arg === 'trill' || L.arg === 'payphone' ? L.arg : 'bell';
  const rec = kind === 'bell' && !!S.get('scare.phone'); // 老式電話:有錄音(Western Electric 500 的鈴)就整段都用錄音,不中途換
  const buf = rec ? null : kind === 'trill' ? trillBuf() : bellRing(kind);
  const k = Math.max(0, Math.ceil((t - L.t0 - 0.03) / RPER));
  let next = L.t0 + k * RPER, last = next - RPER;
  if (buf && k > 0 && t - last < 0.85) playBuf(out, t, buf, { off: t - last }); // 走進範圍時正在響:從中間接上
  const once = (at) => {
    last = at;
    if (!rec) { playBuf(out, at, buf, { g: kind === 'trill' ? 0.8 : kind === 'payphone' ? 0.7 : 1 }); return; }
    const h = { in: out, t: at };
    S.play('scare.phone', { h, p: 0, g: 2, off: 0.04, len: 1, fo: 0.08 });
    S.play('scare.phone', { h, p: 0, g: 2, at: 0.97, off: 2.2, len: 1.3, fi: 0.05, fo: 0.8 }); // 鈴錘停下後鈴碗自然的餘韻
  };
  return {
    ev(now) { while (next < now + 0.15) { if (next > now - 0.25) once(Math.max(next, now)); next += RPER; } },
    stop() { const ph = A.ctx.currentTime - last; if (kind !== 'trill' && ph > 0.03 && ph < 1) bellTail(L.pos, kind === 'payphone' ? 880 : 1180, 0.35, 0.15); }, // 響到一半被接起:鈴碗短短的餘韻
  };
}
function bellTail(pos, f, len, g, far) {
  const h = E(pos, { prio: 3, room: far ? 0.8 : 0.6, hall: far ? 0.5 : 0, ref: far ? 4 : 2, roll: far ? 0.85 : 1, maxDist: far ? 44 : 30, dur: len + 0.5, gain: g });
  if (!h) return;
  metal(h.in, h.t, f, 0.1, len, [1, 1.52, 2.18, 3.73]);
  metal(h.in, h.t, f * 1.2, 0.05, len * 0.8, [1, 2.27]);
}
function alarmBuild(L, out, t) {
  const b = alarmBuf(), s = A.ctx.createBufferSource();
  s.buffer = b; s.loop = true; s.playbackRate.value = rand(0.985, 1.015);
  const g = gain(0, out);
  s.connect(g);
  s.start(t, rand(0, b.duration));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + (t - L.t0 < 0.3 ? 0.15 : 0.03)); // 剛拉下:鈴錘從靜止起動
  return { srcs: [s], stop() { bellTail(L.pos, 880 * s.playbackRate.value, 1.1, 0.45, true); } }; // 斷電後大鈴碗的長餘韻
}
function tapBuild(L, out, t) {
  const b = waterBuf(), s = A.ctx.createBufferSource(), dirty = !!L.arg;
  s.buffer = b; s.loop = true; s.playbackRate.value = dirty ? rand(0.82, 0.9) : rand(0.96, 1.04);
  const g = gain(0, out);
  s.connect(g);
  s.start(t, rand(0, b.duration));
  const left = 3.2 - (t - L.t0);
  if (dirty && left > 0.3) { // 水管裡有空氣:先一陣一陣地噴、咳,再慢慢流順
    const p = g.gain;
    let tt = t;
    p.setValueAtTime(0, t);
    while (tt < t + left) {
      const u = (tt - t) / left, on = rand(0.08, 0.3) * (1 + u), off = rand(0.06, 0.3) * (1 - u * 0.7);
      p.setTargetAtTime(rand(0.5, 1), tt, 0.01);
      p.setTargetAtTime(rand(0, 0.08), tt + on, 0.015);
      burst(out, tt, { type: 'bandpass', f: rand(700, 1600), q: 1, dur: 0.06, a: 0.004, g: rand(0.15, 0.3) }); // 空氣噴出「噗」
      if (Math.random() < 0.5) bubble(out, tt + on * 0.5, rand(110, 260), 0.25, 0.08); // 管裡低沉的咕嚕
      tt += on + off;
    }
    p.setTargetAtTime(1, tt, 0.25);
  } else g.gain.setTargetAtTime(1, t, 0.12);
  let nx = t + rand(2, 5);
  return { srcs: [s], ev: dirty ? (now) => { if (now < nx) return; nx = now + rand(2, 6); bubble(out, now + 0.05, rand(120, 240), 0.12, 0.09); } : null }; // 髒水:偶爾還會咕嚕一下
}
const LK = {
  ring: { r: 42, prio: 4, room: 0.7, hall: 0.35, ref: 3, roll: 0.9, gain: 0.5, build: ringBuild }, // 響的電話要在 15~40m 外也聽得到方向(循聲找電話)
  alarm: { r: 35, prio: 5, room: 0.8, hall: 0.5, ref: 4, roll: 0.85, gain: 0.64, build: alarmBuild },
  tap: { r: 10, prio: 3, room: 0.5, hall: 0, ref: 1.2, roll: 1.1, gain: 0.5, build: tapBuild },
};
function up(L, now) {
  const K = LK[L.kind];
  let h;
  if (L.pos) h = emit({ pos: L.pos, cat: 'loop', prio: K.prio, dur: 1e6, room: K.room, hall: K.hall, ref: K.ref, roll: K.roll, maxDist: K.r + 8, gain: 0, track: false, nocap: true });
  else {
    const g = gain(0, A.bus.sfx);
    h = { in: g, t: now + 0.006, dead: false, strip: null, kill() { const n = A.ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.05); setTimeout(() => { try { g.disconnect(); } catch { /* 已斷 */ } }, 150); } };
  }
  if (!h) { L.retry = now + 1; return; }
  const out = gain(K.gain, h.in);
  const b = K.build(L, out, h.t) || {};
  h.in.gain.setTargetAtTime(1, h.t, 0.02);
  L.live = { h, out, ctx: A.ctx, srcs: b.srcs || [], ev: b.ev, stop: b.stop };
  if (b.ev) b.ev(now);
}
function down(L, stopped) {
  const v = L.live;
  if (!v) return;
  L.live = null;
  if (v.ctx !== A.ctx) return;
  if (stopped && v.stop) { try { v.stop(); } catch (e) { warn(e); } }
  v.h.kill();
  setTimeout(() => { for (const s of v.srcs) { try { s.stop(); } catch { /* 已停 */ } } try { v.out.disconnect(); } catch { /* 已斷 */ } }, 160);
}
function lpCheck(L, now) {
  if (L.t0 < 0 || L.t0 > now + 1) L.t0 = now; // 還沒有 context 時登記的,或換了 context
  const K = LK[L.kind];
  let near = true;
  if (L.pos) near = Math.abs(levelOf(L.pos.y - 0.3) - levelOf(A.L.y - 1.65)) <= 1 && distTo(L.pos) < (L.live ? K.r + 4 : K.r);
  if (near && !L.live && now >= L.retry) up(L, now);
  else if (!near && L.live) down(L, false);
}
function lpStart(kind, key, pos, arg) {
  if (key == null) return;
  const id = `${kind[0]}:${key}`, p = P(pos), o = LP.get(id);
  if (o && o.arg === arg && (o.pos ? p && Math.abs(o.pos.x - p.x) + Math.abs(o.pos.y - (p.y ?? 1.2)) + Math.abs(o.pos.z - p.z) < 0.1 : !p)) return; // 已經在響:不重來
  lpStop(id);
  const L = { kind, arg, pos: p ? { x: p.x, y: p.y ?? 1.2, z: p.z } : null, t0: A.ctx ? A.ctx.currentTime : -1, live: null, retry: 0 };
  LP.set(id, L);
  if (A.ctx) { if (L.pos && distTo(L.pos) > LK[kind].r) idle(() => bufFor(L)); lpCheck(L, A.ctx.currentTime); } // 還在遠處:先在閒置時間算好波形
}
function lpStop(id) {
  const L = LP.get(id);
  if (!L) return;
  LP.delete(id);
  down(L, true);
}

// ---------- 聽筒音床(非定位單例) ----------
const HS = {}; // 名稱 → { out, srcs, ev, ctx }
const LINE = ['dial', 'busy', 'howl']; // 線路狀態音同時只有一個
function hsOn(k, build) {
  const L = HS[k];
  if (L && L.ctx === A.ctx) return;
  HS[k] = { ...build(A.ctx.currentTime), ctx: A.ctx };
}
function hsOff(k, tc = 0.012) {
  const L = HS[k];
  if (!L) return;
  delete HS[k];
  if (L.ctx !== A.ctx) return;
  const n = A.ctx.currentTime, p = L.out.gain;
  p.cancelScheduledValues(n); p.setValueAtTime(p.value, n); p.setTargetAtTime(0, n, tc);
  setTimeout(() => { for (const s of L.srcs) { try { s.stop(); } catch { /* 已停 */ } } try { L.out.disconnect(); } catch { /* 已斷 */ } }, tc * 7000 + 80);
}
// 電話線路音:正弦組 → 電話頻寬(300–3400Hz)+ 聽筒失真 + 線路嘶聲
function lineTone(n, freqs, lvl, drive = 1.3, hiss = 0.02) {
  const out = gain(0, A.bus.sfx), b = band(out, 300, 3400, drive), mix = gain(0.28, b);
  const srcs = freqs.map((f) => osc('sine', f, mix));
  srcs.push(noiseSrc('pink', gain(hiss, b)));
  out.gain.setTargetAtTime(lvl, n, 0.008);
  return { out, mix, srcs };
}
// 斷續的線路音(忙線 0.5/0.5、警示音 0.1/0.1):每次 tick 往前排一段開關
function gate(p, on, off, lvl) {
  let next = A.ctx.currentTime + on, st = true;
  p.value = lvl;
  return (now) => { while (next < now + 0.15) { const t = Math.max(next, now); st = !st; p.setTargetAtTime(st ? lvl : 0, t, 0.003); next = t + (st ? on : off); } };
}
const DTMF = '123A456B789C*0#D';

// ---------- 電話語音(聽不清楚的人聲,長度對齊字幕) ----------
const SYL = 1 / 4.5; // 約每秒 4.5 個字
const CJK = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
function speechPlan(text) {
  const segs = [];
  let n = 0, p = 0;
  const sp = () => { if (n > 0) { segs.push({ n: Math.max(1, Math.round(n)) }); n = 0; } };
  const pz = (s) => { sp(); p += s; };
  const pp = () => { if (p > 0) { segs.push({ p: Math.min(p, 1.6) }); p = 0; } };
  for (const ch of String(text ?? '')) {
    if (CJK.test(ch)) { pp(); n += 1; }
    else if (/[A-Za-z0-9]/.test(ch)) { pp(); n += 0.4; } // 拉丁字母/數字:約 2.5 個字元一個音節
    else if (ch === '…' || ch === '⋯') pz(0.3); // 「……」= 0.6 秒
    else if ('，、,;；:：'.includes(ch)) pz(0.3);
    else if ('。！？!?.'.includes(ch)) pz(0.5);
    else if ('—～~ー'.includes(ch)) { if (n > 0) n += 0.6; } // 拖長音
    else if (/\s/.test(ch)) pz(0.12);
  }
  sp(); pp();
  let dur = 0;
  for (const s of segs) dur += s.n ? s.n * SYL : s.p;
  return { segs, dur };
}
// 聲紋:f0 基頻、fs 共振峰倍率、r 聲調起伏、br 氣聲、jit 抖動、trem 老人的顫音、g 音量(響度對齊)
const VOX = {
  woman: { f0: 205, fs: 1.17, r: 1.25, br: 0.1, jit: 0.012, trem: 0, g: 0.9 },
  man: { f0: 112, fs: 1, r: 0.9, br: 0.07, jit: 0.012, trem: 0 },
  child: { f0: 285, fs: 1.3, r: 1.3, br: 0.12, jit: 0.015, trem: 0, g: 0.75 },
  old: { f0: 150, fs: 1.06, r: 0.8, br: 0.22, jit: 0.03, trem: 0.035 },
};
// 傳輸:lo/hi 頻寬、drive 失真、hiss 底噪、drop 斷訊頻率倍率;radio 有靜噪「嘶」、pa 有號角喇叭共鳴與遠處喇叭的時間差、tv 有 60Hz 嗡聲
const VF = {
  phone: { lo: 300, hi: 3400, drive: 1.6, hiss: 0.012, drop: 1 },
  radio: { lo: 380, hi: 2800, drive: 3, hiss: 0.035, drop: 1.6, sq: true },
  pa: { lo: 350, hi: 4200, drive: 1.9, hiss: 0.008, drop: 0.25, horn: 1600, far: true, room: 0.9, hall: 1.1 },
  tv: { lo: 140, hi: 5500, drive: 1.3, hiss: 0.014, drop: 0.35, hum: true },
};
// 母音共振峰(成年男性,Hz);韻母 = 依序滑過的母音;聲母 = [類型, 噪音中心頻率, 長度, 噪音量]
const VW = { a: [800, 1250, 2700], o: [520, 880, 2600], e: [480, 1480, 2550], i: [290, 2250, 3000], u: [330, 760, 2450], y: [290, 1850, 2350], r: [500, 1400, 1700], n: [280, 1150, 2500] };
const FINV = ['a', 'a', 'o', 'e', 'e', 'i', 'i', 'u', 'u', 'y', 'r', 'ai', 'ao', 'ei', 'ou', 'ia', 'ie', 'ua', 'uo', 'ye', 'iao', 'iou', 'uai', 'uei'].map((s) => [...s].map((c) => VW[c]));
const INI = {
  b: ['st', 1100, 0.02, 0.3], p: ['as', 1100, 0.06, 0.32], d: ['st', 3200, 0.02, 0.3], t: ['as', 3200, 0.06, 0.32], g: ['st', 1900, 0.02, 0.3], k: ['as', 1900, 0.065, 0.32],
  m: ['na', 0, 0.05, 0], n: ['na', 0, 0.045, 0], l: ['li', 0, 0.04, 0], r: ['li', 0, 0.05, 0], f: ['fr', 2400, 0.07, 0.16], h: ['fr', 1300, 0.06, 0.2],
  s: ['fr', 4600, 0.085, 0.3], x: ['fr', 3700, 0.085, 0.28], sh: ['fr', 2900, 0.085, 0.3],
  z: ['af', 4400, 0.055, 0.28], c: ['af', 4400, 0.075, 0.3], zh: ['af', 2800, 0.055, 0.28], ch: ['af', 2800, 0.075, 0.3], j: ['af', 3500, 0.055, 0.28], q: ['af', 3500, 0.075, 0.3],
};
const INIK = ['', '', '', ...Object.keys(INI)];
const TONES = [1, 2, 3, 4, 4, 4, 0]; // 四聲最常見,偶爾輕聲
const TONE = [(u) => 0.95 - 0.06 * u, () => 1.12, (u) => 0.9 + 0.25 * u * u, (u) => 0.86 - 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.25)), (u) => 1.2 - 0.4 * u];
const VWAVE = new WeakMap(); // PeriodicWave 屬於建立它的 context
function vwave() {
  let w = VWAVE.get(A.ctx);
  if (!w) {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = Math.pow(k, -1.25) * (k % 2 ? 1 : 0.8);
    w = A.ctx.createPeriodicWave(re, im);
    VWAVE.set(A.ctx, w);
  }
  return w;
}
const sm1 = (c, k) => { let y = c[0]; for (let i = 0; i < c.length; i++) { y += k * (c[i] - y); c[i] = y; } };
// 逐音節產生 200Hz 的控制曲線(音高含國語四聲 + 句子的下傾、三個共振峰、有聲/噪音振幅、子音噪音頻率、斷訊),整句只用一組節點
function speak(h, segs, V, F) {
  const ctx = A.ctx, R = 200;
  let N = 0;
  for (const s of segs) N += Math.round((s.n ? s.n * SYL : s.p) * R);
  N = Math.max(N, 4);
  const F0 = new Float32Array(N), F1 = new Float32Array(N), F2 = new Float32Array(N), F3 = new Float32Array(N), VA = new Float32Array(N), NA = new Float32Array(N), NF = new Float32Array(N).fill(2500), DR = new Float32Array(N).fill(1);
  const base = V.f0 * rand(0.94, 1.06), fs = V.fs * rand(0.97, 1.03), nfk = Math.sqrt(fs);
  let i = 0, a1 = 500 * fs, a2 = 1500 * fs, a3 = 2500 * fs, jw = 0;
  for (const s of segs) {
    const len = Math.round((s.n ? s.n * SYL : s.p) * R);
    if (!s.n) { // 停頓:長的偶爾換一口氣
      const br = len > 40 && Math.random() < 0.55;
      for (let j = 0; j < len && i < N; j++, i++) { F0[i] = base; F1[i] = a1; F2[i] = a2; F3[i] = a3; NF[i] = 1700; NA[i] = br ? 0.05 * Math.sin((Math.PI * j) / len) ** 2 : 0; }
      continue;
    }
    const w = [];
    let ws = 0, acc = 0;
    for (let k = 0; k < s.n; k++) { const x = rand(0.75, 1.25) * (k === s.n - 1 ? 1.35 : 1); w.push(x); ws += x; } // 音節長度隨機但總長固定,句尾拉長
    for (let k = 0; k < s.n; k++) {
      const j0 = Math.round((acc / ws) * len);
      acc += w[k];
      const sl = Math.round((acc / ws) * len) - j0;
      const ik = pick(INIK), ini = INI[ik], fin = pick(FINV), tn = pick(TONES), coda = Math.random() < 0.3;
      const decl = 1.06 - (0.15 * k) / s.n, st = tn === 0 ? 0.55 : rand(0.72, 1);
      const cn = ini ? Math.min(Math.round(sl * 0.45), Math.round(ini[2] * R)) : 0, gap = ini && (ini[0] === 'st' || ini[0] === 'as' || ini[0] === 'af') ? 2 : 0;
      for (let j = 0; j < sl && i < N; j++, i++) {
        const u = clamp((j - cn) / Math.max(1, sl - cn), 0, 1);
        const q = u * (fin.length - 1), vi = Math.min(fin.length - 1, q | 0), vj = Math.min(fin.length - 1, vi + 1), fr = q - vi, e = fr * fr * (3 - 2 * fr);
        let f1 = fin[vi][0] + (fin[vj][0] - fin[vi][0]) * e, f2 = fin[vi][1] + (fin[vj][1] - fin[vi][1]) * e, f3 = fin[vi][2] + (fin[vj][2] - fin[vi][2]) * e;
        let va = 0, na = 0;
        if (j < cn) { // 子音
          const ty = ini[0];
          if (ty === 'na') { va = 0.3 * st; f1 = 280; f2 = ik === 'm' ? 1000 : 1600; f3 = 2500; }
          else if (ty === 'li') { va = 0.5 * st; f1 = 380; f2 = ik === 'r' ? 1300 : 1100; f3 = ik === 'r' ? 1700 : 2600; }
          else if (j >= gap) {
            const x = (j - gap) / Math.max(1, cn - gap);
            na = ini[3] * (ty === 'fr' ? Math.sqrt(Math.sin(Math.PI * Math.min(1, x * 1.1))) : ty === 'as' ? Math.max(Math.exp(-(j - gap) / 1.5), 0.55 * (1 - x)) : ty === 'af' ? Math.max(Math.exp(-(j - gap) / 2), 0.6 * Math.sin(Math.PI * x)) : Math.exp(-(j - gap) / 1.2));
            NF[i] = ini[1] * nfk;
          }
        } else { // 母音(+ 鼻音韻尾)
          va = st * Math.min(1, (j - cn + 1) / 4) * Math.min(1, (sl - j) / 5);
          if (coda && u > 0.65) { const b = (u - 0.65) / 0.35; f1 += (VW.n[0] - f1) * b; f2 += (VW.n[1] - f2) * b; f3 += (VW.n[2] - f3) * b; va *= 1 - 0.45 * b; }
          if (ini && ini[0] === 'as' && j - cn < 4) { na = 0.12 * (1 - (j - cn) / 4); NF[i] = 1500 * nfk; } // 送氣
        }
        jw = (jw + (Math.random() - 0.5) * V.jit) * 0.92;
        F0[i] = base * decl * (1 + (TONE[tn](u) - 1) * V.r) * (1 + jw) * (1 + V.trem * Math.sin((i / R) * 2 * Math.PI * 5.5));
        a1 = F1[i] = f1 * fs; a2 = F2[i] = f2 * fs; a3 = F3[i] = f3 * fs;
        VA[i] = va * (1 + V.trem * 2 * Math.sin((i / R) * 2 * Math.PI * 5.5)); NA[i] = na;
      }
    }
  }
  for (; i < N; i++) { F0[i] = base; F1[i] = a1; F2[i] = a2; F3[i] = a3; }
  sm1(F0, 0.3); sm1(F1, 0.35); sm1(F2, 0.35); sm1(F3, 0.35); sm1(VA, 0.55);
  // 斷訊:隨機 40–120ms 的掉訊,開頭帶一下劈啪
  const t = h.t, D = N / R, drops = [];
  if (F.drop > 0) for (let x = Math.round((rand(0.6, 2.2) * R) / F.drop); x < N - 2; x += Math.round((rand(1.2, 3) * R) / F.drop)) { const m = Math.round(rand(8, 24)); for (let j = x; j < Math.min(N, x + m); j++) DR[j] = 0.03; drops.push(x); }
  const out = gain(1, h.in), dr = gain(1, out);
  dr.gain.setValueCurveAtTime(DR, t, D);
  let pre = dr;
  if (F.horn) { pre = filter('peaking', F.horn, 1.2, dr); pre.gain.value = 6; }
  const lp = filter('lowpass', F.hi, 0.75, pre), hp = filter('highpass', F.lo, 0.75, lp), sat = shaper(F.drive, hp);
  const src = ctx.createOscillator();
  src.setPeriodicWave(vwave());
  src.frequency.value = F0[0];
  src.frequency.setValueCurveAtTime(F0, t, D);
  const nz = ctx.createBufferSource();
  nz.buffer = A.noise.white; nz.loop = true;
  const voiced = gain(0, sat), mk = gain(1.2, voiced), bn = gain(V.br);
  voiced.gain.setValueCurveAtTime(VA, t, D);
  nz.connect(bn);
  [F1, F2, F3].forEach((c, k) => {
    const b = filter('bandpass', c[0], [5, 8, 11][k]);
    b.frequency.setValueCurveAtTime(c, t, D);
    src.connect(b); bn.connect(b);
    b.connect(gain([1, 0.55, 0.3][k], mk));
  });
  const cf = filter('bandpass', NF[0], 1.4), ng = gain(0, sat);
  cf.frequency.setValueCurveAtTime(NF, t, D);
  ng.gain.setValueCurveAtTime(NA, t, D);
  nz.connect(cf); cf.connect(ng);
  nz.connect(gain(F.hiss, hp)); // 線路嘶聲
  src.start(t); nz.start(t, rand(0, 3));
  src.stop(t + D + 0.05); nz.stop(t + D + 0.05);
  for (const x of drops) burst(h.in, t + x / R, { type: 'highpass', f: 2500, dur: 0.005, g: 0.04 });
  if (F.hum) tone(hp, t, { type: 'sawtooth', f: 60, dur: 0.05, hold: D, a: 0.05, g: 0.012 });
  if (F.far) { const fd = ctx.createDelay(0.2); fd.delayTime.value = rand(0.05, 0.08); dr.connect(fd); fd.connect(filter('lowpass', 1800, 0.7, gain(0.4, out))); }
  if (F.sq) { burst(h.in, t, { type: 'bandpass', f: 2200, q: 0.6, dur: 0.12, a: 0.004, g: 0.08 }); burst(h.in, t + D, { type: 'bandpass', f: 2200, q: 0.6, dur: 0.15, a: 0.004, g: 0.1 }); } // 對講機的靜噪「嘶」
  let done = false;
  return () => {
    if (done || A.ctx !== ctx) return;
    done = true;
    const n = ctx.currentTime;
    if (n >= t + D) return;
    out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0, n + 0.04);
    for (const s of [src, nz]) { try { s.stop(n + 0.06); } catch { /* 已停 */ } }
    h.kill();
  };
}

// ---------- 樂器 ----------
const MEL = FMEL.wcf.n.filter((x) => x[0] !== null).map(([st, b]) => [st - 5, b]); // 《望春風》(鄧雨賢 1933,只用旋律;半音、拍)
const LUL = [[4, 0.5], [4, 0.5], [7, 2], [4, 0.5], [4, 0.5], [7, 2], [4, 0.5], [7, 0.5], [12, 1], [11, 1.5], [9, 0.5], [9, 1], [7, 1]]; // 布拉姆斯搖籃曲開頭
function combNote(d, t, f, g) { // 音梳簧片:基音 + 兩個不諧和的高次振動
  tone(d, t, { f, dur: 1.1, a: 0.002, g });
  tone(d, t, { f: f * 3.98, dur: 0.3, a: 0.001, g: g * 0.35 });
  if (f * 6.3 < 15000) tone(d, t, { f: f * 6.3, dur: 0.1, a: 0.001, g: g * 0.15 });
}
const PWAVE = new WeakMap();
function pianoWave(reg) { // 鋼琴弦的泛音:擊弦點在弦長約 1/8,8 的倍數泛音較弱;低音區泛音多、高音區少
  let m = PWAVE.get(A.ctx);
  if (!m) { m = []; PWAVE.set(A.ctx, m); }
  if (!m[reg]) {
    const n = [40, 24, 10][reg], re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) im[k] = Math.pow(k, -[0.9, 1.1, 1.4][reg]) * (0.25 + 0.75 * Math.abs(Math.sin((Math.PI * k) / 8)));
    m[reg] = A.ctx.createPeriodicWave(re, im);
  }
  return m[reg];
}

// ---------- 門 ----------
function bashSynth(d, t, hv) { // 殭屍捶門的一下:門板受力 + 門板共鳴 + 門閂/鉸鏈/門把在門框裡的金屬顫動(巨屍:更低、更重、木頭裂聲與落灰)
  const k = hv ? 0.7 : 1;
  tone(d, t, { f: 95 * k, f1: 45 * k, dur: hv ? 0.35 : 0.18, g: hv ? 0.9 : 0.6 });
  burst(d, t, { type: 'lowpass', f: 1400 * k, f1: 150, dur: hv ? 0.3 : 0.15, g: hv ? 0.8 : 0.55 });
  burst(d, t, { type: 'bandpass', f: 420 * k, q: 2.5, dur: 0.1, g: 0.3 });
  for (let i = 0; i < (hv ? 6 : 4); i++) metal(d, t + 0.01 + rand(0, 0.12) * (1 + i * 0.4), rand(1500, 2800), 0.04 * (1 - i * 0.12), 0.07, [1, 2.4, 3.7]);
  burst(d, t + 0.02, { type: 'bandpass', f: 900, q: 1.2, dur: 0.2, g: 0.08 });
  if (hv) {
    burst(d, t + 0.005, { type: 'highpass', f: 2200, dur: 0.04, g: 0.25 });
    for (let i = 0; i < 8; i++) burst(d, t + rand(0.05, 0.6), { type: 'bandpass', f: rand(2500, 6000), q: 4, dur: 0.012, g: rand(0.02, 0.05) });
  }
}
function keySynth(d, t) { // 打字機一鍵:按鍵 → 字桿揮起 → 字錘打在滾筒上 → 擒縱機構推進一格
  click(d, t, 2200, 0.06);
  burst(d, t + 0.02, { type: 'bandpass', f: 1500, q: 1, dur: 0.012, a: 0.008, g: 0.03 });
  const ts = t + rand(0.035, 0.045);
  burst(d, ts, { type: 'highpass', f: 3500, dur: 0.008, g: 0.45 });
  burst(d, ts, { type: 'bandpass', f: rand(650, 800), q: 3, dur: 0.035, g: 0.35 });
  tone(d, ts, { f: 180, f1: 110, dur: 0.03, g: 0.1 });
  click(d, ts + rand(0.018, 0.026), rand(3800, 4600), 0.12);
  metal(d, ts + 0.02, rand(5200, 6000), 0.01, 0.04, [1, 2.4]);
}
function contents(d, t, n) { // 抽屜裡的東西跟著滑動:筆、藥瓶、迴紋針
  for (let i = 0; i < n; i++) {
    const tt = t + rand(0, 0.15);
    if (Math.random() < 0.5) metal(d, tt, rand(2500, 4200), 0.015, 0.05, [1, 2.7]);
    else burst(d, tt, { type: 'bandpass', f: rand(1200, 2500), q: 3, dur: 0.02, g: 0.06 });
  }
}
function clink(d, t, n) { for (let i = 0; i < n; i++) metal(d, t + i * rand(0.05, 0.12), rand(2400, 3600), 0.025 * (1 - i * 0.15), 0.18, [1, 2.32, 4.25]); } // 玻璃藥瓶互碰
const DOOR_OPEN = { fire: 1.8, cell: 1, ward: 3.2, glass: 2, wood: 1 }, DOOR_CLOSE = { fire: 0.7, cell: 1, ward: 1.8, glass: 2.2, wood: 0.8 }; // 依種類的音量
// 廣播喇叭:定位 = 那支天花板喇叭;沒給位置 = 整棟的廣播(長殘響)
const paOut = (pos, dur, g) => E(pos, { prio: 4, room: 0.9, hall: 1, echo: 0.5, ref: 3, roll: 0.8, maxDist: 60, dur, gain: g, self: 0.9, selfHall: 1.2 });
const speaker = (d, k = 1.6) => band(d, 180, 5000, k);

// ---------- 對外 ----------
export const ix = {
  // ---- 開關 ----
  switchClick: safe((pos, on = true) => { // 老式牆面撥桿開關:撥桿越過彈簧前的摩擦 → 彈簧接點「啪」 → 電木面板與接線盒的共鳴
    const h = E(pos, { prio: 3, room: 0.35, dur: 0.4, ref: 1.2, gain: 5.5 });
    if (!h) return;
    const d = h.in, t = h.t, k = on ? 1 : 0.88;
    burst(d, t, { type: 'bandpass', f: 2200 * k, q: 1.5, dur: 0.014, a: 0.006, g: 0.04 });
    const t1 = t + rand(0.016, 0.028);
    click(d, t1, 4200 * k, 0.45);
    burst(d, t1, { type: 'bandpass', f: 900 * k, q: 5, dur: 0.03, g: 0.3 });
    tone(d, t1, { f: 240 * k, f1: 140, dur: 0.035, g: 0.12 });
    if (on && Math.random() < 0.3) burst(d, t1 + 0.002, { type: 'highpass', f: 7000, dur: 0.005, g: 0.07 }); // 老舊接點的細小電弧
  }),

  // ---- 電話 ----
  ringStart: always((key, pos, kind = 'bell') => { if (kind === 'bell' && A.ctx) S.buf('scare.phone'); lpStart('ring', key, pos, kind); }), // 老式電話:先開始載入錄音
  ringStop: always((key) => lpStop(`r:${key}`)),
  ringing: (key) => LP.has(`r:${key}`),
  pickup: safe((pos) => { // 聽筒滑出底座 → 掛勾彈起(兩組接點)→ 捲線晃動
    const h = E(pos, { prio: 4, room: 0.3, dur: 0.8, ref: 1.2, gain: 3.5 });
    if (!h) return;
    const d = h.in, t = h.t;
    burst(d, t, { type: 'bandpass', f: 1800, q: 1.2, dur: 0.06, a: 0.02, g: 0.06 });
    clack(d, t + 0.04, 1250, 0.18);
    click(d, t + 0.07, 2900, 0.25);
    click(d, t + 0.085, 2400, 0.15);
    burst(d, t + 0.1, { buf: 'pink', type: 'bandpass', f: 900, q: 1, dur: 0.15, a: 0.03, g: 0.04 });
  }),
  hangup: safe((pos) => { // 聽筒摔回底座:塑膠撞擊 + 掛勾壓下 + 鈴碗被震得「叮」一聲 + 聽筒彈一下落定
    const h = E(pos, { prio: 4, room: 0.35, dur: 1.2, ref: 1.3, gain: 3.5 });
    if (!h) return;
    const d = h.in, t = h.t;
    clack(d, t, 950, 0.45);
    tone(d, t, { f: 150, f1: 75, dur: 0.07, g: 0.25 });
    click(d, t + 0.006, 2600, 0.3);
    metal(d, t + 0.01, rand(1160, 1200), 0.03, 0.7, [1, 2.31, 3.94]);
    clack(d, t + rand(0.06, 0.08), 1300, 0.1);
  }),
  dialTone: safe((on = true) => { // 撥號音 350+440Hz
    if (!on) return hsOff('dial');
    for (const k of LINE) if (k !== 'dial') hsOff(k);
    hsOn('dial', (n) => lineTone(n, [350, 440], 0.06, 1.25));
  }),
  busyTone: safe((on = true) => { // 忙線音 480+620Hz,0.5 秒響 0.5 秒停
    if (!on) return hsOff('busy');
    for (const k of LINE) if (k !== 'busy') hsOff(k);
    hsOn('busy', (n) => { const L = lineTone(n, [480, 620], 0.06, 1.25); L.ev = gate(L.mix.gain, 0.5, 0.5, 0.28); return L; });
  }),
  offHook: safe((on = true) => { // 聽筒沒掛好的刺耳警示音(1400+2060+2450+2600Hz 快速斷續,越來越大聲)
    if (!on) return hsOff('howl');
    for (const k of LINE) if (k !== 'howl') hsOff(k);
    hsOn('howl', (n) => {
      const L = lineTone(n, [1400, 2060, 2450, 2600], 0.3, 2.2, 0.01);
      const p = L.out.gain;
      p.cancelScheduledValues(n); p.setValueAtTime(0.03, n); p.linearRampToValueAtTime(0.15, n + 4);
      L.ev = gate(L.mix.gain, 0.1, 0.1, 0.2);
      return L;
    });
  }),
  dtmf: safe((digit) => { // 按鍵音:手指壓下塑膠鍵(直接聽到)+ 雙頻音(從聽筒裡)
    const h = E(null, { prio: 4, dur: 0.45, gain: 0.7 });
    if (!h) return;
    clack(h.in, h.t, 1900, 0.06);
    const i = DTMF.indexOf(String(digit ?? '').toUpperCase().charAt(0));
    if (i < 0) return;
    const b = band(gain(0.25, h.in), 300, 3400, 1.2);
    for (const f of [[697, 770, 852, 941][i >> 2], [1209, 1336, 1477, 1633][i & 3]]) tone(b, h.t + 0.01, { f, dur: 0.012, hold: 0.1, a: 0.004, g: 0.2 });
  }),
  lineNoise: safe((on = true) => { // 接通了但對方不說話:很小聲的線路嘶聲 + 劈啪 + 若有似無的呼吸
    if (!on) return hsOff('open', 0.05);
    hsOn('open', (n) => {
      const out = gain(0, A.bus.sfx), b = band(out, 300, 3400, 1.4), nz = noiseSrc('pink', gain(0.012, b));
      const ck = A.ctx.createBufferSource();
      ck.buffer = crackBuf(); ck.loop = true; ck.playbackRate.value = rand(0.9, 1.1);
      ck.connect(gain(0.05, b));
      ck.start(n, rand(0, 3));
      const bp = filter('bandpass', 900, 1.2), bg = gain(0, b);
      nz.connect(bp); bp.connect(bg);
      out.gain.setTargetAtTime(1, n, 0.1);
      let next = n + rand(1, 2.5);
      return {
        out, srcs: [nz, ck],
        ev(now) { // 吸氣(較高、較輕)→ 吐氣(較低、較長);偶爾憋住一口氣,偶爾嘴唇的濕聲
          if (now < next) return;
          const t = Math.max(next, now) + 0.05;
          next = t + rand(3.8, 5.5);
          if (Math.random() < 0.15) { next += rand(2, 4); return; }
          const p = bg.gain, f = bp.frequency;
          f.setTargetAtTime(1500, t, 0.1); p.setTargetAtTime(0.035, t, 0.35); p.setTargetAtTime(0, t + 0.9, 0.12);
          f.setTargetAtTime(800, t + 1.2, 0.2); p.setTargetAtTime(0.06, t + 1.2, 0.15); p.setTargetAtTime(0, t + 1.6, 0.45);
          if (Math.random() < 0.08) burst(b, t + 2.6, { type: 'bandpass', f: rand(1200, 2000), q: 3, dur: 0.02, g: 0.06 });
        },
      };
    });
  }),
  phoneVoice: (text, opts) => { // 一定回傳 { dur, stop }(沒有 context 時 dur 照算,字幕可以對時)
    let plan = { segs: [], dur: 0 };
    try { plan = speechPlan(text); } catch (e) { warn(e); }
    const res = { dur: plan.dur, stop() {} };
    if (!A.ctx || !plan.segs.some((s) => s.n)) return res;
    try {
      const o = typeof opts === 'string' ? { voice: opts } : opts || {};
      const F = VF[o.filter] || VF.phone, V = VOX[o.voice] || VOX.woman, p = P(o.pos);
      const g = 0.17 * (V.g ?? 1) * (Number.isFinite(o.gain) ? o.gain : 1);
      const h = p ? emit({ pos: p, cat: 'fx', prio: 5, room: F.room ?? 0.3, hall: F.hall ?? 0, ref: 1.5, dur: plan.dur + 0.6, gain: g }) : emit({ bus: 'sfx', prio: 5, room: F.room ? 0.6 : 0.04, hall: F.hall ?? 0, dur: plan.dur + 0.6, gain: g });
      if (!h) return res;
      const st = speak(h, plan.segs, V, F);
      res.stop = () => { try { st(); } catch (e) { warn(e); } };
    } catch (e) { warn(e); }
    return res;
  },

  // ---- 販賣機 ----
  coin: safe((pos) => { // 投幣:投幣口的第一下 → 沿斜槽彈跳滾落(間隔越來越短)→ 識別器電磁閥 → 落進錢箱
    const h = E(pos, { prio: 3, room: 0.3, dur: 1.4, ref: 1.2, gain: 1.6 });
    if (!h) return;
    const d = h.in, t = h.t;
    if (!S.play('ui.coin', { h, g: 0.3, len: 0.25, fo: 0.08 })) metal(d, t, rand(4200, 4800), 0.06, 0.18, [1, 2.76, 5.4]);
    let tt = t + rand(0.07, 0.1), gap = rand(0.07, 0.09), g = 0.05;
    for (let i = 0; i < 6; i++) {
      metal(d, tt, rand(2600, 4200), g, 0.06, [1, 2.76]);
      burst(d, tt, { type: 'bandpass', f: rand(1800, 2600), q: 4, dur: 0.012, g: g * 1.4 });
      tt += gap; gap *= rand(0.72, 0.85); g *= 0.85;
    }
    clack(d, tt + 0.04, 1100, 0.12);
    tone(d, tt + 0.04, { f: 320, f1: 240, dur: 0.08, g: 0.05 }); // 機箱板金
    metal(d, tt + 0.12, rand(3000, 3800), 0.05, 0.25, [1, 2.76, 5.4]);
    metal(d, tt + 0.15, rand(3400, 4200), 0.03, 0.15, [1, 2.76]);
  }),
  vendButton: safe((pos) => { // 塑膠按鍵 + 微動開關 + 小蜂鳴片「嗶」
    const h = E(pos, { prio: 3, room: 0.3, dur: 0.6, ref: 1.2, gain: 1.3 });
    if (!h) return;
    const d = h.in, t = h.t;
    clack(d, t, 1500, 0.16);
    click(d, t + 0.012, 3200, 0.14);
    tone(filter('bandpass', 2600, 2.5, d), t + 0.06, { type: 'square', f: 2350, dur: 0.02, hold: 0.11, a: 0.004, g: 0.05 });
  }),
  vendDrop: safe((pos) => { // 出貨:繼電器 → 馬達與貨道彈簧轉動 → 推桿放開 → 罐子沉重地掉進取物口、彈一下、滾到一邊
    const h = E(pos, { prio: 4, room: 0.45, dur: 3, ref: 1.6, gain: 0.65 });
    if (!h) return;
    const d = h.in, t = h.t, md = rand(0.9, 1.3);
    click(d, t, 1800, 0.12);
    tone(filter('lowpass', 900, 0.8, d), t, { type: 'sawtooth', f: 80, f1: 105, glide: 0.3, dur: 0.12, hold: md, a: 0.08, g: 0.06 });
    tone(d, t, { type: 'triangle', f: 760, f1: 820, glide: md, dur: 0.1, hold: md, a: 0.1, g: 0.012 }); // 齒輪嘯聲
    grain(burst(d, t, { type: 'bandpass', f: 1400, q: 2, dur: 0.1, hold: md, a: 0.05, g: 0.04 }), t, md, 0.04, 40, 0.5, 0.2);
    const tf = t + md + 0.05, tl = tf + rand(0.28, 0.36);
    burst(d, tf, { type: 'bandpass', f: 900, q: 1.5, dur: 0.05, g: 0.15 });
    tone(d, tl, { f: 130, f1: 70, dur: 0.18, g: 0.55 });
    burst(d, tl, { type: 'lowpass', f: 1200, f1: 200, dur: 0.15, g: 0.45 });
    metal(d, tl, rand(380, 460), 0.1, 0.3, [1, 1.9, 3.1]); // 鐵皮取物口
    metal(d, tl + 0.003, rand(1700, 2100), 0.05, 0.12, [1, 2.4]); // 罐身
    tone(d, tl + 0.16, { f: 160, f1: 90, dur: 0.08, g: 0.18 });
    burst(d, tl + 0.18, { type: 'bandpass', f: 700, q: 1.5, dur: 0.25, a: 0.03, g: 0.05 });
    burst(d, tl + 0.4, { type: 'lowpass', f: 600, dur: 0.05, g: 0.08 });
  }),
  canOpen: safe(() => { // 拉環「喀」→ 破封 → 嘶— → 細細的氣泡聲
    const h = E(null, { prio: 4, dur: 1.2 });
    if (!h) return;
    const d = h.in, t = h.t;
    click(d, t, 2600, 0.2);
    burst(d, t + 0.025, { type: 'highpass', f: 2500, dur: 0.02, a: 0.001, g: 0.5 });
    burst(d, t + 0.03, { type: 'bandpass', f: 5500, f1: 3500, q: 0.7, dur: 0.35, a: 0.005, g: 0.18 });
    metal(d, t + 0.03, 1900, 0.03, 0.08, [1, 2.4]);
    grain(burst(d, t + 0.1, { type: 'highpass', f: 4000, dur: 0.1, hold: 0.6, g: 0.03 }), t + 0.1, 0.7, 0.03, 160, 0.3);
  }),
  drink: safe(() => { // 罐子傾斜、液體晃動 → 兩大口吞嚥 → 吐一口氣
    const h = E(null, { prio: 3, dur: 2, gain: 0.9 });
    if (!h) return;
    const d = h.in, t = h.t;
    for (let i = 0; i < 4; i++) bubble(d, t + rand(0, 0.15), rand(500, 900), 0.04, 0.04);
    let tt = t + 0.25;
    for (let k = 0; k < 2; k++, tt += rand(0.45, 0.55)) {
      tone(d, tt, { f: 210, f1: 95, dur: 0.07, g: 0.22 }); // 喉頭
      burst(d, tt, { type: 'lowpass', f: 700, f1: 200, dur: 0.06, g: 0.15 });
      bubble(d, tt + 0.02, rand(250, 380), 0.08, 0.06);
      bubble(d, tt + 0.05, rand(400, 600), 0.04, 0.05);
      click(d, tt + 0.09, 1100, 0.05);
    }
    burst(d, tt + 0.1, { buf: 'pink', type: 'bandpass', f: 1200, q: 0.7, dur: 0.35, a: 0.08, g: 0.04 });
  }),
  vendDeny: safe((pos) => { // 退幣:電磁閥 → 幾枚硬幣沿退幣道落進金屬杯
    const h = E(pos, { prio: 3, room: 0.35, dur: 1.4, ref: 1.3, gain: 1.5 });
    if (!h) return;
    const d = h.in, t = h.t;
    clack(d, t, 1200, 0.15);
    let tt = t + 0.12;
    for (let i = 0, n = pick([2, 3, 4]); i < n; i++) {
      for (let j = 0; j < 3; j++) metal(d, tt + j * rand(0.03, 0.06), rand(3200, 5000), 0.04 * (1 - j * 0.25), 0.12, [1, 2.76]);
      tt += rand(0.06, 0.12);
    }
    metal(d, tt, rand(850, 1000), 0.04, 0.35, [1, 2.2, 3.6]); // 退幣杯共鳴
  }),

  // ---- 樂器 ----
  pianoNote: safe((pos, midi = 60, vel = 0.7) => { // 走音的老直立鋼琴:琴槌 + 2~3 條稍微不準的弦(拍頻)+ 兩段衰減;每個琴鍵固定走音量
    const m = clamp(Math.round(+midi || 60), 21, 108), v = clamp(Number.isFinite(+vel) ? +vel : 0.7, 0.05, 1);
    const f0 = 440 * Math.pow(2, (m - 69) / 12), hs = ((m * 2654435761) >>> 0) / 4294967296;
    const off = (hs - 0.5) * 34, spread = 3 + hs * 9, reg = m < 48 ? 0 : m < 72 ? 1 : 2;
    const sus = clamp(5.5 - (m - 40) * 0.05, 2.8, 5.5);
    const h = E(pos, { prio: 3, room: 0.7, hall: 0.35, dur: sus + 0.6, ref: 2, gain: 0.55 });
    if (!h) return;
    const d = h.in, t = h.t;
    const env = gain(0, d), lp = filter('lowpass', Math.min(9000, f0 * (3 + v * 12)), 0.5, env);
    lp.frequency.setTargetAtTime(Math.min(6000, f0 * 2.2), t + 0.02, 0.5 + (2 - reg) * 0.3); // 高次泛音先消失
    const pk = 0.2 * v * v + 0.03;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(pk, t + 0.004);
    env.gain.setTargetAtTime(pk * 0.32, t + 0.006, 0.09 + (2 - reg) * 0.08); // 第一段快速衰減
    env.gain.setTargetAtTime(0.0001, t + 0.35, sus / 4.5); // 第二段長餘音
    const w = pianoWave(reg), nS = m < 34 ? 1 : m < 46 ? 2 : 3;
    for (let i = 0; i < nS; i++) {
      const o = A.ctx.createOscillator();
      o.setPeriodicWave(w);
      o.frequency.value = f0;
      o.detune.value = off + (i - (nS - 1) / 2) * spread + rand(-1, 1);
      o.connect(lp);
      o.start(t);
      o.stop(t + sus + 0.4);
    }
    burst(d, t, { type: 'lowpass', f: Math.min(5000, f0 * 6), f1: 300, dur: 0.035, g: 0.06 * v }); // 琴槌
    tone(d, t, { f: 95, f1: 55, dur: 0.05, g: 0.05 * v }); // 擊弦機的木頭聲
  }),
  musicBoxWind: safe((pos) => { // 上發條:棘爪滑過棘輪齒的連續「喀」(越轉越緊)+ 發條繃緊,轉 2~4 下、中間換手
    const h = E(pos, { prio: 3, room: 0.3, dur: 3, ref: 1, gain: 2 });
    if (!h) return;
    const d = h.in;
    let tt = h.t;
    for (let k = 0, turns = pick([2, 3, 3, 4]); k < turns; k++) {
      const n = pick([5, 6, 7]), t0 = tt;
      for (let i = 0; i < n; i++) {
        playBuf(d, tt, ratchetBuf((Math.random() * 3) | 0), { rate: rand(0.95, 1.05), g: 0.25 + i * 0.03 });
        tt += rand(0.045, 0.06) * (1 + k * 0.08);
      }
      burst(d, t0, { type: 'bandpass', f: 900 + k * 120, q: 3, dur: (tt - t0) * 0.5, a: (tt - t0) * 0.5, g: 0.012 });
      tt += rand(0.18, 0.28);
    }
  }),
  musicBox: safe((pos, n = 8, slow = true) => { // 哀傷的小曲;slow:發條快沒了,越來越慢、音高往下掉(false = 只在最後幾個音放慢)。回傳長度(秒)
    const cnt = clamp(Math.round(+n || 8), 1, 48), s = !!slow, at = [], fq = [];
    let tt = 0, beat = rand(0.34, 0.4), sag = 1;
    const base = 880 * rand(0.97, 1);
    for (let i = 0; i < cnt; i++) { // 先算好每個音的時間(emit 的長度要剛好)
      const [st, len] = MEL[i % MEL.length];
      at.push(tt); fq.push(base * Math.pow(2, st / 12) * sag * rand(0.994, 1.006));
      tt += beat * len;
      beat = Math.min(1.4, beat * (s ? rand(1.05, 1.11) : cnt - i <= 4 ? 1.12 : 1));
      if (s) sag *= rand(0.993, 0.997);
    }
    const h = E(pos, { prio: 3, room: 0.6, hall: 0.25, dur: tt + 1.5, ref: 1.2, gain: 1.4 });
    if (!h) return 0;
    for (let i = 0; i < cnt; i++) {
      combNote(h.in, h.t + at[i], fq[i], 0.05 * rand(0.8, 1));
      if (i % 4 === 0 || MEL[i % MEL.length][1] > 1) combNote(h.in, h.t + at[i] + 0.004, fq[i] / 2, 0.025); // 低音簧片
    }
    return tt;
  }),
  mobileChime: safe((pos) => { // 嬰兒床吊鈴:玻璃/金屬吊飾輕碰 + 很小聲、走音的搖籃曲
    const h = E(pos, { prio: 3, room: 0.6, hall: 0.3, dur: 6.5, ref: 1.2, gain: 1.6 });
    if (!h) return;
    const d = h.in, t = h.t;
    for (let i = 0; i < 9; i++) metal(d, t + rand(0, 3.5), rand(2800, 5200), rand(0.006, 0.014), rand(0.4, 0.9), Math.random() < 0.5 ? [1, 2.76, 5.4] : [1, 2.32, 4.25]);
    let tt = t + 0.4, beat = 0.3, sag = 1;
    const base = 1046.5 * rand(0.96, 0.99);
    for (let i = 0, k = pick([7, 9, 13]); i < k; i++) {
      const [st, len] = LUL[i];
      combNote(d, tt, base * Math.pow(2, st / 12) * sag, 0.012);
      tt += beat * len; beat *= 1.03; sag *= 0.998;
    }
  }),

  // ---- 電梯 ----
  elevatorDing: safe((pos) => { // 到站繼電器 + 鐘片「叮」(老舊鐘片帶一點拍頻)
    const h = E(pos, { prio: 4, room: 0.7, hall: 0.4, dur: 3, ref: 2 });
    if (!h) return;
    const d = h.in, t = h.t + 0.02, f = rand(1290, 1330);
    click(d, h.t, 1800, 0.05);
    tone(d, t, { f, dur: 1.8, a: 0.002, g: 0.12 });
    tone(d, t, { f: f * 1.003, dur: 1.6, a: 0.002, g: 0.04 });
    tone(d, t, { f: f * 2.756, dur: 0.6, a: 0.001, g: 0.035 });
    tone(d, t, { f: f * 5.404, dur: 0.2, a: 0.001, g: 0.012 });
  }),
  elevatorDoor: safe((pos, open = true) => { // 門機繼電器 → 門板在軌道上沉重地隆隆滑動(老滾輪偶爾卡一下)→ 結束的撞擊(關門較重、門鎖扣上)
    const dur = rand(1.6, 2.1);
    const h = E(pos, { prio: 4, room: 0.6, hall: 0.2, dur: dur + 1.2, ref: 2, gain: 0.8 });
    if (!h) return;
    const d = h.in, t = h.t;
    click(d, t, 1500, 0.08);
    tone(filter('lowpass', 420, 0.8, d), t, { type: 'sawtooth', f: open ? 62 : 58, f1: open ? 74 : 66, glide: dur, dur: 0.25, hold: dur - 0.25, a: 0.2, g: 0.07 });
    grain(burst(d, t, { buf: 'brown', type: 'lowpass', f: 380, q: 0.8, dur: 0.3, hold: dur - 0.3, a: 0.25, g: 0.3 }), t, dur, 0.3, 30, 0.7, 0.15);
    burst(d, t, { type: 'bandpass', f: 1100, q: 2.5, dur: 0.2, hold: dur - 0.4, a: 0.2, g: 0.02 });
    if (Math.random() < 0.4) sq(d, t + rand(0.2, dur * 0.6), rand(1300, 1900), rand(1100, 1600), rand(0.25, 0.45), 0.1, 22);
    const te = t + dur;
    if (open) { tone(d, te, { f: 85, f1: 50, dur: 0.18, g: 0.25 }); burst(d, te, { type: 'lowpass', f: 700, f1: 150, dur: 0.12, g: 0.2 }); metal(d, te + 0.01, rand(260, 320), 0.04, 0.3, [1, 1.9, 3.1]); }
    else { tone(d, te, { f: 70, f1: 36, dur: 0.35, g: 0.5 }); burst(d, te, { type: 'lowpass', f: 1000, f1: 120, dur: 0.22, g: 0.4 }); metal(d, te, rand(200, 260), 0.07, 0.6, [1, 1.8, 2.9, 4.2]); clack(d, te + 0.12, 1300, 0.12); duck(0.85, 0.3); }
  }),
  elevatorMotor: safe((pos) => { // 接觸器吸合 → 馬達與鋼索的嗡聲轉速升高、持續、減速 → 煞車「咚」+ 鋼索晃動(約 3 秒)
    const L = 3;
    const h = E(pos, { prio: 3, room: 0.7, hall: 0.4, dur: L + 1.2, ref: 3, roll: 0.9, gain: 0.6 });
    if (!h) return;
    const d = h.in, t = h.t;
    clack(d, t, 900, 0.18);
    const o = A.ctx.createOscillator(), o2 = A.ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'triangle';
    for (const [x, k] of [[o, 1], [o2, 8]]) { const f = x.frequency; f.setValueAtTime(14 * k, t); f.exponentialRampToValueAtTime(48 * k, t + 0.9); f.setValueAtTime(48 * k, t + L - 0.7); f.exponentialRampToValueAtTime(16 * k, t + L); }
    const g = gain(0, filter('lowpass', 520, 0.9, d)), g2 = gain(0, d);
    for (const [p, v] of [[g.gain, 0.1], [g2.gain, 0.008]]) { p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(v, t + 0.9); p.setValueAtTime(v, t + L - 0.7); p.exponentialRampToValueAtTime(0.0001, t + L + 0.05); }
    o.connect(g); o2.connect(g2);
    o.start(t); o2.start(t); o.stop(t + L + 0.1); o2.stop(t + L + 0.1);
    burst(d, t + 0.1, { buf: 'pink', type: 'bandpass', f: 250, f1: 700, glide: 0.9, q: 1.5, dur: 0.6, hold: L - 1.3, a: 0.7, g: 0.05 }); // 鋼索過滑輪
    tone(d, t + L, { f: 75, f1: 40, dur: 0.25, g: 0.35 });
    clack(d, t + L + 0.01, 800, 0.2);
    metal(d, t + L + 0.02, rand(140, 180), 0.04, 0.8, [1, 2.1, 3.4]);
  }),

  // ---- 火警 / 廣播 ----
  alarmPull: safe((pos) => { // 手動報警機:拉桿被往下拉 → 卡榫鎖住「喀鏘」(舊式偶爾有玻璃棒斷裂)
    const h = E(pos, { prio: 5, room: 0.5, dur: 0.8, ref: 1.3, gain: 1.3 });
    if (!h) return;
    const d = h.in, t = h.t;
    slide(d, t, 1800, 1200, 0.09, 0.05);
    clack(d, t + 0.09, 1050, 0.4);
    metal(d, t + 0.095, rand(1900, 2300), 0.05, 0.12, [1, 2.4, 3.9]);
    tone(d, t + 0.09, { f: 180, f1: 110, dur: 0.06, g: 0.15 });
    if (Math.random() < 0.4) for (let i = 0; i < 3; i++) metal(d, t + 0.1 + rand(0, 0.08), rand(5000, 7000), 0.012, 0.06, [1, 2.3]);
  }),
  alarmStart: always((key, pos) => lpStart('alarm', key, pos, 0)), // 火警鈴(台灣常見的圓形電鈴,連續「鈴————」),傳很遠
  alarmStop: always((key) => lpStop(`a:${key}`)),
  paKey: safe((pos) => { // 麥克風按下:擴大機「噗」+ 開關喀 + 底噪浮起(從天花板喇叭)
    const h = paOut(pos, 1.5, 1);
    if (!h) return;
    const spk = speaker(h.in), t = h.t;
    tone(spk, t, { f: 120, f1: 60, dur: 0.12, g: 0.5 });
    click(spk, t + 0.003, 1500, 0.3);
    burst(spk, t + 0.01, { type: 'bandpass', f: 1200, q: 0.6, dur: 0.5, hold: 0.3, a: 0.05, g: 0.01 });
  }),
  micFeedback: safe((pos) => { // 喇叭回授:尖銳的嘯叫指數變大、音高微微飄移 → 有人把推桿拉下「喀」;遠處另一支喇叭晚一點、較暗
    const L = rand(0.9, 1.4);
    const h = paOut(pos, L + 3, 0.55);
    if (!h) return;
    const d = h.in, t = h.t, spk = speaker(d, 2.2), f = rand(2300, 3100);
    const o = A.ctx.createOscillator();
    o.frequency.value = f;
    o.frequency.setValueCurveAtTime(curve(48, (u) => f * (1 + 0.004 * Math.sin(u * L * 6 * 6.283) + Math.max(0, u - 0.6) * 0.02)), t, L);
    const g = gain(0, spk);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + L * 0.75); g.gain.setValueAtTime(0.09, t + L * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + L + 0.06);
    o.connect(g); o.start(t); o.stop(t + L + 0.1);
    tone(spk, t + L * 0.3, { f: rand(620, 780), dur: 0.1, hold: L * 0.6, a: L * 0.3, g: 0.012 }); // 低一點的第二個嘯叫模式
    const far = A.ctx.createDelay(0.2);
    far.delayTime.value = rand(0.055, 0.085);
    spk.connect(far);
    far.connect(filter('lowpass', 1800, 0.7, gain(0.4, d)));
    click(d, t + L + 0.04, 1300, 0.08);
  }),

  // ---- 門 ----
  doorOpen: safe((pos, kind = 'ward') => {
    const k = DOOR_OPEN[kind] ? kind : 'ward';
    const h = E(pos, { prio: 3, room: 0.7, hall: 0.25, dur: 3.2, ref: 2, gain: DOOR_OPEN[k] });
    if (!h) return;
    const d = h.in, t = h.t;
    if (k === 'fire') { // 防火門:推桿「喀鏘」→ 門閂縮回 → 沉重的鉸鏈低鳴 + 門板帶動的空氣 + 閉門器油壓嘶聲
      clack(d, t, 900, 0.35); metal(d, t + 0.005, 1500, 0.06, 0.15, [1, 2.4, 3.9]); click(d, t + 0.05, 2600, 0.15);
      tone(d, t, { f: 140, f1: 80, dur: 0.08, g: 0.2 });
      sq(d, t + 0.18, rand(260, 340), rand(220, 300), rand(0.6, 0.9), 0.2, 12, [12, 22]);
      burst(d, t + 0.2, { buf: 'pink', type: 'lowpass', f: 500, dur: 0.6, a: 0.25, g: 0.06 });
      burst(d, t + 0.4, { type: 'bandpass', f: 2200, q: 0.8, dur: 0.6, a: 0.3, g: 0.008 });
    } else if (k === 'cell') { // 隔離房鐵門:門閂滑開 → 到底「鏘」→ 鉸鏈呻吟
      if (!S.play('scrape', { h, g: 0.25, len: 0.45, fo: 0.12 })) sq(d, t, rand(900, 1200), rand(700, 900), 0.4, 0.2, 20);
      clack(d, t + 0.45, 700, 0.4); metal(d, t + 0.45, rand(380, 450), 0.08, 0.6, [1, 1.8, 2.9, 4.2]);
      sq(d, t + 0.7, rand(180, 240), rand(150, 200), rand(0.9, 1.3), 0.25, 10, [10, 18]);
    } else if (k === 'ward') { // 病房美耐板門:壓下門把 → 斜舌縮回 → 輕輕推開(偶爾鉸鏈吱一聲)
      click(d, t, 2400, 0.2); clack(d, t + 0.04, 1400, 0.14); click(d, t + 0.09, 3200, 0.08);
      burst(d, t + 0.12, { buf: 'pink', type: 'bandpass', f: 600, q: 0.6, dur: 0.5, a: 0.25, g: 0.05 });
      if (Math.random() < 0.4 && !S.play('door.creak', { h, g: 0.1, semi: 3, at: 0.15, len: 0.6, fo: 0.2 })) sq(d, t + 0.15, rand(500, 700), rand(400, 600), 0.5, 0.12, 14, [18, 40]);
    } else if (k === 'glass') { // 鋁框玻璃門:門把 + 鋁框顫動 + 玻璃輕響 + 地鉸鏈
      clack(d, t, 1800, 0.2);
      for (let i = 0; i < 4; i++) metal(d, t + 0.03 + rand(0, 0.12), rand(900, 1500), 0.03, 0.12, [1, 2.3, 3.7]);
      metal(d, t + 0.04, rand(2600, 3400), 0.015, 0.4, [1, 2.76, 5.4]);
      burst(d, t + 0.1, { buf: 'pink', type: 'bandpass', f: 800, q: 0.6, dur: 0.5, a: 0.2, g: 0.04 });
      if (Math.random() < 0.5) sq(d, t + 0.15, rand(1800, 2400), rand(1500, 2000), 0.25, 0.08, 25);
    } else { // 老木門:門把 → 慢慢被推開的長吱嘎
      click(d, t, 1600, 0.12);
      if (!S.play('door.creak', { h, g: 0.5, at: 0.05 })) {
        const f = rand(300, 550), dur = rand(1.2, 2);
        sq(d, t + 0.05, f, f * rand(0.7, 1.4), dur, 0.3, 14, [18, 40]);
        tone(filter('lowpass', 300, 0.7, d), t + 0.05, { type: 'sawtooth', f: rand(80, 100), dur: dur * 0.5, a: dur * 0.5, g: 0.05 });
      }
    }
  }),
  doorClose: safe((pos, kind = 'ward') => {
    const k = DOOR_CLOSE[kind] ? kind : 'ward';
    const h = E(pos, { prio: 3, room: 0.8, hall: 0.35, dur: 4.6, ref: 2.2, gain: DOOR_CLOSE[k] });
    if (!h) return;
    const d = h.in, t = h.t;
    if (k === 'fire') { // 閉門器拉回(嘶)→ 沉重的鋼門撞上門框 → 門閂卡入 + 推桿震動
      burst(d, t, { type: 'bandpass', f: 2000, q: 0.8, dur: 0.3, a: 0.25, g: 0.008 });
      const tc = t + 0.5;
      tone(d, tc, { f: 66, f1: 30, dur: 0.5, g: 0.8 });
      burst(d, tc, { type: 'lowpass', f: 1100, f1: 100, dur: 0.4, g: 0.7 });
      metal(d, tc, rand(170, 220), 0.12, 1.1, [1, 1.8, 2.9, 4.2, 5.6]);
      clack(d, tc + 0.02, 1400, 0.3);
      for (let i = 0; i < 4; i++) metal(d, tc + 0.05 + i * rand(0.04, 0.07), rand(1600, 2600), 0.025 * (1 - i * 0.2), 0.08, [1, 2.4]);
      duck(0.7, 0.4);
    } else if (k === 'cell') { // 隔離房鐵門重重關上 + 門閂震動
      if (!S.play('door.cell', { h, g: 0.75 })) { tone(d, t, { f: 70, f1: 30, dur: 0.5, g: 0.8 }); metal(d, t, rand(180, 240), 0.2, 1.4, [1, 1.8, 2.9, 4.2, 5.6]); burst(d, t, { type: 'lowpass', f: 1200, f1: 150, dur: 0.3, g: 0.5 }); }
      duck(0.7, 0.45);
    } else if (k === 'ward') { // 空心門板的悶響 + 斜舌彈進門扣
      tone(d, t, { f: 120, f1: 70, dur: 0.12, g: 0.4 });
      burst(d, t, { type: 'lowpass', f: 900, f1: 200, dur: 0.1, g: 0.35 });
      burst(d, t, { type: 'bandpass', f: 350, q: 3, dur: 0.06, g: 0.2 });
      click(d, t + 0.005, 2800, 0.2);
      clack(d, t + 0.01, 1500, 0.12);
    } else if (k === 'glass') { // 鋁框拍上 + 玻璃一陣細顫
      burst(d, t, { type: 'bandpass', f: 1000, q: 1, dur: 0.06, g: 0.3 });
      tone(d, t, { f: 180, f1: 110, dur: 0.06, g: 0.2 });
      for (let i = 0; i < 5; i++) metal(d, t + rand(0, 0.06), rand(700, 1300), 0.04, 0.15, [1, 2.3, 3.7]);
      grain(burst(d, t + 0.01, { type: 'bandpass', f: 4200, q: 2, dur: 0.3, g: 0.03 }), t + 0.01, 0.3, 0.03, 90, 0.5);
      metal(d, t + 0.005, rand(2800, 3600), 0.02, 0.5, [1, 2.76, 5.4]);
    } else { // 老木門:最後一點吱嘎 → 木頭撞上門框 → 門閂
      sq(d, t, rand(350, 500), rand(300, 420), 0.25, 0.15, 12, [18, 40]);
      tone(d, t + 0.25, { f: 100, f1: 55, dur: 0.18, g: 0.5 });
      burst(d, t + 0.25, { type: 'lowpass', f: 800, f1: 150, dur: 0.15, g: 0.45 });
      burst(d, t + 0.25, { type: 'bandpass', f: 280, q: 2.5, dur: 0.1, g: 0.25 });
      clack(d, t + 0.27, 1100, 0.12);
    }
  }),
  doorBash: safe((pos, heavy = false) => { // 每次呼叫 = 一下;烘焙成變體,連續捶門時每下只剩一個 BufferSource
    const hv = !!heavy;
    const h = E(pos, { prio: 5, room: 0.6, hall: hv ? 0.3 : 0.1, dur: hv ? 1.4 : 0.9, ref: hv ? 3 : 2, roll: 0.9, maxDist: 50, gain: hv ? 2 : 2.2 });
    if (!h) return;
    const set = baked(`ix|bash|${+hv}`, 4, hv ? 1.1 : 0.6, (dst, t0) => bashSynth(dst, t0, hv), 1, 32000);
    if (set) playBuf(h.in, h.t, pick(set), { rate: rand(0.94, 1.06), g: rand(0.85, 1) });
    else bashSynth(h.in, h.t, hv);
    if (hv) duck(0.75, 0.35);
  }),
  doorKnock: safe((pos, n = 3) => { // 門的另一邊有人用指節敲門:悶、慢,最後一下停頓比較久
    const h = E(pos, { prio: 4, room: 0.55, hall: 0.05, dur: 0.6 + n * 0.55, ref: 1.6, roll: 1, maxDist: 26, gain: 1.5 });
    if (!h) return;
    let t = h.t;
    for (let i = 0; i < n; i++) {
      tone(h.in, t, { f: rand(92, 120), f1: 58, dur: 0.11, g: 0.45 });
      burst(h.in, t, { type: 'lowpass', f: 650, f1: 180, dur: 0.07, g: 0.38 });
      burst(h.in, t, { type: 'bandpass', f: rand(380, 520), q: 2.5, dur: 0.03, g: 0.12 });
      t += i === n - 2 ? rand(0.75, 1.05) : rand(0.34, 0.46);
    }
  }),
  barricade: safe((pos) => { // 釘木板:木板靠上門框 → 3~4 下鐵鎚(釘子越打越深,音高變高)→ 木板受力的吱嘎
    const h = E(pos, { prio: 4, room: 0.6, dur: 3.2, ref: 2, gain: 1.05 });
    if (!h) return;
    const d = h.in, t = h.t;
    burst(d, t, { type: 'bandpass', f: 500, q: 1.5, dur: 0.08, g: 0.25 });
    tone(d, t, { f: 160, f1: 100, dur: 0.07, g: 0.2 });
    let tt = t + rand(0.4, 0.55), nf = rand(2600, 3000);
    for (let i = 0, n = pick([3, 4, 4]); i < n; i++) {
      metal(d, tt, nf, 0.12, 0.09, [1, 2.4, 3.9]);
      burst(d, tt, { type: 'highpass', f: 3000, dur: 0.01, g: 0.3 });
      tone(d, tt, { f: rand(170, 210), f1: 110, dur: 0.08, g: 0.3 });
      burst(d, tt, { type: 'bandpass', f: rand(600, 900), q: 2, dur: 0.07, g: 0.25 });
      tt += rand(0.32, 0.45); nf *= rand(1.04, 1.08);
    }
    sq(d, tt, rand(300, 450), rand(250, 380), rand(0.4, 0.6), 0.2, 10, [14, 26]);
  }),
  barricadeBreak: safe((pos) => { // 木板撐到極限 → 斷裂(木纖維撕裂、釘子被拔出)→ 木板落地彈跳 + 木屑
    const h = E(pos, { prio: 5, room: 0.7, hall: 0.3, dur: 3, ref: 2.5, roll: 0.9, maxDist: 55, gain: 0.8 });
    if (!h) return;
    const d = h.in, t = h.t, tc = t + 0.28;
    sq(d, t, rand(260, 340), rand(180, 240), 0.3, 0.25, 9, [20, 40]);
    burst(d, tc, { type: 'highpass', f: 1800, dur: 0.05, g: 0.5 });
    tone(d, tc, { f: 120, f1: 50, dur: 0.25, g: 0.6 });
    burst(d, tc, { type: 'lowpass', f: 1500, f1: 200, dur: 0.2, g: 0.5 });
    grain(burst(d, tc, { type: 'bandpass', f: 2800, q: 0.8, dur: 0.05, hold: 0.25, g: 0.2 }), tc, 0.3, 0.2, 150, 0.4);
    sq(d, tc + 0.05, rand(1600, 2200), rand(2400, 3000), 0.12, 0.12, 18);
    let tt = tc + rand(0.35, 0.5);
    for (let i = 0, n = pick([2, 3]); i < n; i++) {
      const g = 1 - i * 0.25;
      tone(d, tt, { f: rand(140, 200), f1: 90, dur: 0.1, g: 0.35 * g });
      burst(d, tt, { type: 'bandpass', f: rand(500, 800), q: 2, dur: 0.09, g: 0.3 * g });
      burst(d, tt + rand(0.08, 0.12), { type: 'bandpass', f: rand(600, 900), q: 2, dur: 0.05, g: 0.1 * g });
      tt += rand(0.15, 0.3);
    }
    for (let i = 0; i < 8; i++) burst(d, tc + rand(0.05, 1.2), { type: 'bandpass', f: rand(2000, 5000), q: 3, dur: 0.015, g: rand(0.02, 0.06) });
    duck(0.7, 0.4);
  }),

  // ---- 收納 ----
  lockerOpen: safe((pos) => { // 薄鐵置物櫃:扳起門閂 → 門板「嗡」地彈開 + 鉸鏈 + 門板晃動
    const h = E(pos, { prio: 3, room: 0.5, dur: 1.6, ref: 1.5, gain: 1.5 });
    if (!h) return;
    const d = h.in, t = h.t, t1 = t + 0.12;
    if (!S.play('pick.ammobox', { h, g: 0.5 })) { clack(d, t, 1700, 0.2); click(d, t + 0.02, 3000, 0.1); }
    metal(d, t1, rand(190, 240), 0.06, 0.35, [1, 1.47, 2.09, 2.9]);
    sq(d, t1 + 0.05, rand(1100, 1500), rand(900, 1200), rand(0.25, 0.4), 0.1, 20);
    for (let i = 0; i < 3; i++) metal(d, t1 + 0.04 + rand(0, 0.3), rand(1200, 2200), 0.02, 0.08, [1, 2.4]);
    burst(d, t1, { buf: 'pink', type: 'bandpass', f: 700, q: 0.7, dur: 0.3, a: 0.1, g: 0.04 });
  }),
  lockerClose: safe((pos) => { // 板金拍上 + 嗡鳴 + 門閂落下 + 整排置物櫃跟著震
    const h = E(pos, { prio: 3, room: 0.55, dur: 1.4, ref: 1.6, gain: 2.4 });
    if (!h) return;
    const d = h.in, t = h.t;
    tone(d, t, { f: 150, f1: 80, dur: 0.12, g: 0.4 });
    burst(d, t, { type: 'bandpass', f: 600, q: 1, dur: 0.1, g: 0.35 });
    metal(d, t, rand(220, 280), 0.1, 0.45, [1, 1.47, 2.09, 2.9, 3.6]);
    if (!S.play('pick.ammobox', { h, g: 0.45, at: 0.02 })) clack(d, t + 0.02, 1500, 0.25);
    for (let i = 0; i < 5; i++) metal(d, t + 0.05 + i * rand(0.03, 0.06), rand(1400, 2600), 0.03 * (1 - i * 0.15), 0.06, [1, 2.4]);
  }),
  drawerOpen: safe((pos) => { // 金屬滑軌(滾珠隆隆)或木抽屜(木頭摩擦),同一個抽屜固定材質;滑到底 + 裡面的東西滑動
    const p = P(pos), wood = p ? (hashPos(p) & 1) === 1 : Math.random() < 0.5;
    const h = E(pos, { prio: 3, room: 0.45, dur: 1.2, ref: 1.3, gain: 1.3 });
    if (!h) return;
    const d = h.in, t = h.t, dur = rand(0.35, 0.5), te = t + dur;
    if (wood) { sq(d, t, rand(500, 700), rand(400, 550), dur, 0.15, 6, [30, 60]); burst(d, t, { buf: 'pink', type: 'bandpass', f: 900, q: 1, dur: dur * 0.6, a: dur * 0.4, g: 0.12 }); }
    else { grain(burst(d, t, { type: 'bandpass', f: 2600, q: 1.5, dur, g: 0.08 }), t, dur, 0.08, 90, 0.6, 0.2); burst(d, t, { buf: 'brown', type: 'lowpass', f: 400, dur: dur * 0.6, a: dur * 0.4, g: 0.12 }); }
    tone(d, te, { f: wood ? 140 : 180, f1: 90, dur: 0.06, g: 0.25 });
    clack(d, te, wood ? 700 : 1400, 0.1);
    contents(d, te, 3);
  }),
  drawerClose: safe((pos) => {
    const p = P(pos), wood = p ? (hashPos(p) & 1) === 1 : Math.random() < 0.5;
    const h = E(pos, { prio: 3, room: 0.45, dur: 1, ref: 1.3 });
    if (!h) return;
    const d = h.in, t = h.t, dur = rand(0.22, 0.32), te = t + dur;
    if (wood) burst(d, t, { buf: 'pink', type: 'bandpass', f: 800, q: 1, dur: dur * 0.5, a: dur * 0.5, g: 0.1 });
    else grain(burst(d, t, { type: 'bandpass', f: 2400, q: 1.5, dur, g: 0.07 }), t, dur, 0.07, 90, 0.6, 0.2);
    tone(d, te, { f: wood ? 110 : 150, f1: 70, dur: 0.1, g: 0.4 }); // 撞到底
    burst(d, te, { type: 'lowpass', f: 900, f1: 200, dur: 0.08, g: 0.3 });
    if (!wood) metal(d, te, rand(300, 380), 0.05, 0.25, [1, 1.8, 2.9]); // 鐵櫃身
    contents(d, te + 0.01, 3);
  }),
  cabinetOpen: safe((pos) => { // 鏡面藥櫃:磁吸扣「啵」地放開 → 小鉸鏈 → 鏡子輕響 → 瓶子互碰
    const h = E(pos, { prio: 3, room: 0.5, dur: 1.2, ref: 1.2, gain: 2.5 });
    if (!h) return;
    const d = h.in, t = h.t;
    click(d, t, 1300, 0.12);
    tone(d, t, { f: 300, f1: 200, dur: 0.02, g: 0.08 });
    if (Math.random() < 0.6) sq(d, t + 0.06, rand(1600, 2200), rand(1300, 1800), 0.18, 0.06, 24);
    metal(d, t + 0.08, rand(3000, 3800), 0.01, 0.25, [1, 2.76, 5.4]);
    clink(d, t + 0.1, pick([2, 3, 4]));
  }),
  cabinetClose: safe((pos) => { // 門板帶風 → 磁吸扣吸上 → 鏡子震一下 → 瓶子互碰
    const h = E(pos, { prio: 3, room: 0.5, dur: 1, ref: 1.2, gain: 1.6 });
    if (!h) return;
    const d = h.in, t = h.t, tc = t + 0.12;
    burst(d, t, { buf: 'pink', type: 'bandpass', f: 900, q: 0.8, dur: 0.12, a: 0.06, g: 0.04 });
    clack(d, tc, 1100, 0.2);
    tone(d, tc, { f: 220, f1: 150, dur: 0.04, g: 0.15 });
    metal(d, tc, rand(3200, 4200), 0.02, 0.12, [1, 2.76, 5.4]);
    clink(d, tc + 0.03, pick([2, 3]));
  }),
  rummage: safe((pos) => { // 翻找(約 1 秒):紙張皺摺 + 翻動 + 幾下小東西碰撞(塑膠、金屬、藥瓶)
    const L = rand(0.9, 1.2);
    const h = E(pos, { prio: 3, room: 0.3, dur: L + 0.5, ref: 1.2, gain: 1.6 });
    if (!h) return;
    const d = h.in, t = h.t;
    crinkle(d, t, L, 0.08);
    burst(d, t, { buf: 'pink', type: 'bandpass', f: 700, q: 0.6, dur: L * 0.5, a: L * 0.5, g: 0.04 });
    for (let i = 0; i < 4; i++) {
      const tt = t + rand(0.05, L), c = Math.random();
      if (c < 0.4) burst(d, tt, { type: 'bandpass', f: rand(600, 1400), q: 3, dur: 0.03, g: 0.1 });
      else if (c < 0.7) metal(d, tt, rand(2000, 3500), 0.02, 0.08, [1, 2.7]);
      else for (let j = 0; j < 4; j++) burst(d, tt + j * 0.025, { type: 'bandpass', f: rand(2500, 4000), q: 4, dur: 0.01, g: 0.04 }); // 藥丸在瓶裡搖
    }
  }),

  // ---- 水 ----
  tapStart: always((key, pos, dirty = false) => lpStart('tap', key, pos, dirty ? 1 : 0)),
  tapStop: always((key) => lpStop(`t:${key}`)),
  tapSqueak: safe((pos) => { // 老水龍頭把手轉動的卡頓吱聲
    const h = E(pos, { prio: 3, room: 0.5, dur: 1, ref: 1.2 });
    if (!h) return;
    click(h.in, h.t, 2200, 0.06);
    sq(h.in, h.t + 0.02, rand(1300, 1800), rand(1500, 2300), rand(0.3, 0.55), 0.3, 26, [20, 40]);
  }),
  pipeKnock: safe((pos) => { // 水錘:牆裡的鐵管連續悶響(遞減)+ 水在管裡流過
    const h = E(pos, { prio: 3, room: 0.6, hall: 0.2, dur: 2.4, ref: 2, roll: 0.9, maxDist: 40 });
    if (!h) return;
    const lp = filter('lowpass', 1400, 0.7, h.in);
    let tt = h.t, g = 0.5;
    for (let i = 0, n = pick([2, 3, 3, 4]); i < n; i++) {
      tone(lp, tt, { f: rand(70, 95), f1: 40, dur: 0.18, g });
      burst(lp, tt, { type: 'lowpass', f: 900, f1: 150, dur: 0.1, g: g * 0.7 });
      metal(lp, tt, rand(240, 330), g * 0.25, 0.35, [1, 2.67, 5.2]);
      tt += rand(0.12, 0.45); g *= rand(0.55, 0.85);
    }
    burst(lp, tt, { type: 'bandpass', f: 400, q: 1, dur: 0.4, a: 0.05, g: 0.04 });
  }),

  // ---- 打字機 / 呼叫鈴 ----
  typeKey: safe((pos) => {
    const h = E(pos, { prio: 2, room: 0.35, dur: 0.4, ref: 1.2, gain: 4 });
    if (!h) return;
    const set = baked('ix|key', 6, 0.25, keySynth, 1, 32000);
    if (set) playBuf(h.in, h.t, pick(set), { rate: rand(0.97, 1.03), g: rand(0.8, 1) });
    else keySynth(h.in, h.t);
  }),
  typeReturn: safe((pos) => { // 邊界鈴「叮」→ 換行棘輪 → 滑架被推回左邊 → 撞到邊界擋塊
    const h = E(pos, { prio: 3, room: 0.4, dur: 2.2, ref: 1.3, gain: 1.2 });
    if (!h) return;
    const d = h.in, t = h.t;
    metal(d, t, rand(2350, 2500), 0.1, 1, [1, 2.76, 4.1, 5.4]);
    let tt = t + rand(0.35, 0.5);
    for (let i = 0; i < 2; i++, tt += 0.07) { click(d, tt, 2800, 0.15); metal(d, tt + 0.002, 3600, 0.02, 0.05, [1, 2.4]); }
    slide(d, tt, 900, 1400, 0.3, 0.12);
    burst(d, tt, { buf: 'brown', type: 'lowpass', f: 400, dur: 0.18, a: 0.12, g: 0.15 });
    const te = tt + 0.3;
    clack(d, te, 900, 0.35);
    tone(d, te, { f: 160, f1: 90, dur: 0.06, g: 0.25 });
    metal(d, te, 1300, 0.04, 0.12, [1, 2.4]);
  }),
  nurseCall: safe((pos) => { // 呼叫鈕 + 護理站的「叮—咚」(小喇叭)
    const h = E(pos, { prio: 4, room: 0.7, hall: 0.35, dur: 3, ref: 2 });
    if (!h) return;
    const d = h.in, t = h.t, spk = band(d, 400, 4500, 1.3);
    clack(d, t, 1600, 0.12);
    click(d, t + 0.01, 3000, 0.1);
    for (const [f, dt] of [[1318.5, 0.2], [1046.5, 0.75]]) {
      tone(spk, t + dt, { f, dur: 0.9, a: 0.006, g: 0.08 });
      tone(spk, t + dt, { f: f * 2, dur: 0.25, a: 0.004, g: 0.02 });
    }
  }),

  // ---- 收音機 / 電視 ----
  tuneSweep: safe((pos) => { // 轉動調諧鈕:電台之間的雜訊 + 拍頻嘯聲(掃過電台時音高先降到零再升起)+ 一閃而過的電台片段 + 劈啪
    const L = rand(1.1, 1.4);
    const h = E(pos, { prio: 3, room: 0.3, dur: L + 0.5, ref: 1.5, gain: 0.7 });
    if (!h) return;
    const d = h.in, t = h.t, spk = band(d, 220, 4200, 1.8);
    grain(burst(spk, t, { type: 'bandpass', f: 2400, q: 0.5, dur: 0.05, hold: L, a: 0.01, g: 0.1 }), t, L, 0.1, 60, 0.6, 0.12);
    for (let k = 0; k < 2; k++) {
      const c = rand(0.2, 0.8), w = rand(0.15, 0.3), fm = rand(2500, 4000);
      const o = A.ctx.createOscillator(), g = gain(0, spk);
      o.frequency.value = fm;
      o.frequency.setValueCurveAtTime(curve(48, (u) => 40 + fm * Math.min(1, Math.abs(u - c) / w)), t, L);
      g.gain.setValueCurveAtTime(curve(48, (u) => 0.03 * Math.max(0, 1 - Math.abs(u - c) / (w * 1.4))), t, L);
      o.connect(g); o.start(t); o.stop(t + L + 0.05);
    }
    const tc = t + L * rand(0.35, 0.65);
    burst(spk, tc, { type: 'bandpass', f: 900, q: 2, dur: 0.12, hold: 0.06, a: 0.03, g: 0.08 });
    tone(filter('bandpass', 1000, 1.5, spk), tc, { type: 'sawtooth', f: rand(180, 260), dur: 0.1, hold: 0.08, a: 0.02, g: 0.03 });
    for (let i = 0; i < 6; i++) burst(spk, t + rand(0, L), { type: 'highpass', f: 2500, dur: 0.008, g: rand(0.05, 0.12) });
  }),
  tvOn: safe((pos) => { // 映像管電視開機:電源鍵 + 繼電器 → 消磁線圈的 60Hz「嗡」→ 返馳變壓器的高頻嘯聲(很小聲)→ 雜訊
    const h = E(pos, { prio: 3, room: 0.4, dur: 3.5, ref: 1.6 });
    if (!h) return;
    const d = h.in, t = h.t, fw = Math.min(15625, A.ctx.sampleRate * 0.42);
    click(d, t, 1700, 0.15);
    clack(d, t + 0.01, 800, 0.12);
    tone(filter('lowpass', 500, 0.7, d), t + 0.03, { type: 'sawtooth', f: 60, dur: 0.6, a: 0.005, g: 0.12 });
    tone(d, t + 0.03, { f: 120, dur: 0.4, g: 0.08 });
    tone(d, t + 0.1, { f: fw * 0.93, f1: fw, glide: 0.5, dur: 1.2, hold: 1.2, a: 0.3, g: 0.003 });
    if (!seg('tv', h, 0.25, 0.8, 0.8)) burst(d, t + 0.25, { type: 'bandpass', f: 3000, q: 0.4, dur: 0.4, hold: 0.4, a: 0.02, g: 0.1 });
    burst(d, t + 0.25, { type: 'highpass', f: 3000, dur: 0.15, g: 0.06 });
    for (let i = 0; i < 5; i++) burst(d, t + 0.2 + rand(0, 0.8), { type: 'highpass', f: 4000, dur: 0.006, g: rand(0.03, 0.08) });
  }),
  tvOff: safe((pos) => { // 關機:開關 + 映像管「啵」+ 靜電放電的細小劈啪 + 嘯聲消失
    const h = E(pos, { prio: 3, room: 0.4, dur: 1.2, ref: 1.6, gain: 2.5 });
    if (!h) return;
    const d = h.in, t = h.t, fw = Math.min(15625, A.ctx.sampleRate * 0.42);
    click(d, t, 1600, 0.15);
    tone(d, t + 0.01, { f: 95, f1: 38, dur: 0.12, g: 0.3 });
    burst(d, t + 0.01, { type: 'lowpass', f: 1000, f1: 120, dur: 0.08, g: 0.25 });
    tone(d, t, { f: fw, f1: fw * 0.8, dur: 0.3, g: 0.002 });
    for (let i = 0; i < 5; i++) burst(d, t + 0.05 + rand(0, 0.5), { type: 'highpass', f: 3500, dur: 0.006, g: rand(0.02, 0.06) });
  }),

  // ---- 輪子 ----
  wheelSqueak: safe((pos) => { // 輪椅/推床的輪子每轉一圈吱一聲 + 滾動 + 椅架鬆動
    const L = rand(0.9, 1.2);
    const h = E(pos, { prio: 2, room: 0.4, dur: L + 0.5, ref: 1.3, track: true, gain: 1.5 });
    if (!h) return;
    const d = h.in, t = h.t, per = rand(0.38, 0.5), f = rand(1500, 2300);
    burst(d, t, { buf: 'brown', type: 'lowpass', f: 320, dur: 0.3, hold: L - 0.4, a: 0.1, g: 0.08 });
    for (let tt = t + rand(0, 0.15); tt < t + L - 0.1; tt += per * rand(0.93, 1.07)) sq(d, tt, f * rand(0.97, 1.03), f * rand(1.05, 1.15), rand(0.09, 0.15), 0.2, 16, [40, 70]);
    for (let i = 0; i < 3; i++) metal(d, t + rand(0, L), rand(1800, 3000), 0.01, 0.05, [1, 2.4]);
  }),
  gurneyRoll: safe((pos) => { // 推床沉重地滾過:低沉隆隆 + 地磚接縫的喀咚 + 鐵架與點滴架的顫動
    const L = rand(1.4, 1.8);
    const h = E(pos, { prio: 3, room: 0.45, dur: L + 0.6, ref: 1.8, track: true });
    if (!h) return;
    const d = h.in, t = h.t;
    grain(burst(d, t, { buf: 'brown', type: 'lowpass', f: 450, dur: 0.3, hold: L - 0.3, a: 0.15, g: 0.18 }), t, L, 0.18, 25, 0.75, 0.15);
    for (let tt = t + 0.1; tt < t + L - 0.1; tt += rand(0.22, 0.3)) tone(d, tt, { f: rand(90, 120), f1: 60, dur: 0.05, g: 0.12 });
    grain(burst(d, t, { type: 'bandpass', f: 2000, q: 1.5, dur: 0.2, hold: L - 0.2, a: 0.1, g: 0.05 }), t, L, 0.05, 50, 0.4);
    for (let i = 0; i < 7; i++) metal(d, t + rand(0, L), rand(1200, 2800), 0.015, 0.06, [1, 2.4, 3.7]);
    if (Math.random() < 0.5) sq(d, t + rand(0.2, L - 0.4), rand(1100, 1500), rand(1200, 1700), 0.2, 0.1, 14, [30, 50]);
  }),

  // ---- 紙張 / 錄音帶 ----
  paper: safe(() => { // 拿起紙條:皺摺 + 攤開的低頻「啪」+ 尾端的細碎
    const h = E(null, { prio: 4, dur: 0.9, gain: 0.9 });
    if (!h) return;
    const d = h.in, t = h.t;
    crinkle(d, t, rand(0.35, 0.5), 0.12, 3600);
    burst(d, t + 0.08, { buf: 'pink', type: 'bandpass', f: 600, q: 0.7, dur: 0.18, a: 0.08, g: 0.06 });
    crinkle(d, t + 0.3, 0.2, 0.05, 5000);
  }),
  pageTurn: safe(() => { // 翻一張紙(地圖換樓層):掃過的沙沙聲 + 紙角拍一下
    const h = E(null, { prio: 4, dur: 0.6, gain: 1.1 });
    if (!h) return;
    const d = h.in, t = h.t;
    slide(d, t, rand(3000, 3600), rand(1500, 1900), 0.24, 0.05);
    crinkle(d, t + 0.03, 0.16, 0.045, 4400);
    burst(d, t + 0.21, { buf: 'pink', type: 'bandpass', f: 430, q: 0.8, dur: 0.07, a: 0.03, g: 0.05 });
  }),
  paperClose: safe(() => { // 摺起來收好
    const h = E(null, { prio: 4, dur: 0.7, gain: 1.35 });
    if (!h) return;
    const d = h.in, t = h.t;
    crinkle(d, t, 0.25, 0.08, 3000);
    burst(d, t + 0.12, { buf: 'pink', type: 'bandpass', f: 500, q: 0.7, dur: 0.12, a: 0.05, g: 0.05 });
    slide(d, t + 0.25, 2500, 1800, 0.12, 0.04);
  }),
  tapeLine: safe((on = true) => { // 錄音帶放音的底噪:磁帶嘶聲(帶顫動)+ 錄進去的電源嗡聲(慢速音高起伏 = wow)+ 偶爾掉音
    if (!on) return hsOff('tape', 0.06);
    hsOn('tape', (n) => {
      const out = gain(0, A.bus.sfx), hg = gain(0.028, filter('highpass', 1800, 0.6, filter('lowpass', 8500, 0.6, out)));
      const nz = noiseSrc('pink', hg), fl = osc('sine', rand(6, 9), gain(0.003, hg.gain));
      const hum = osc('sawtooth', 100, gain(0.006, filter('lowpass', 420, 0.7, out))), wow = osc('sine', rand(0.45, 0.7), gain(0.7, hum.frequency));
      out.gain.setTargetAtTime(1, n, 0.12);
      let next = n + rand(2, 5);
      return {
        out, srcs: [nz, fl, hum, wow],
        ev(now) { if (now < next) return; next = now + rand(3, 8); const t = now + 0.05; hg.gain.setTargetAtTime(0.006, t, 0.01); hg.gain.setTargetAtTime(0.028, t + rand(0.05, 0.12), 0.02); },
      };
    });
  }),

  stats: always(() => { let live = 0; for (const L of LP.values()) if (L.live) live++; return { loops: LP.size, live, keys: [...LP.keys()], handset: Object.keys(HS), bufs: BUF.size }; }),
};

// ---------- 排程(50ms) ----------
let lpT = 0, LW = null;
onTick((now) => {
  if (genI < 0 && now > 3) { genI = 0; pregen(); }
  if (A.world !== LW) { if (LW) for (const [id, L] of LP) if (L.pos) lpStop(id); LW = A.world; } // 換地圖:舊地圖上的定位循環音全部停掉
  for (const k in HS) { const L = HS[k]; if (L.ctx !== A.ctx) { delete HS[k]; continue; } if (L.ev) L.ev(now); }
  if (!LP.size) return;
  const chk = now - lpT > 0.25 || now < lpT;
  if (chk) lpT = now;
  for (const L of LP.values()) {
    const v = L.live;
    if (v && (v.ctx !== A.ctx || v.h.dead)) L.live = null; // 換了 context 或聲道條被搶走:下次檢查重建
    if (chk) lpCheck(L, now);
    if (L.live && L.live.ev) L.live.ev(now);
  }
});
