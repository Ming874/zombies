// 靈異音效:耳邊低語(雙耳 HRTF,離耳朵約 0.3m、跟著頭轉)、頸後呼吸、刺擊、突然的寂靜、天花板裡爬行、
// 玻璃上的手印吱聲、濕腳步、牆上刮字、鬼護士推車的輪子、電梯「叮」、燈管一盞盞斷電、搖籃曲哼唱、子彈穿過鬼魂的寒氣。
// 第二輪:院內廣播(PA)的合成女聲與濾波、繞著頭轉的低語(orbit)、敲牆/敲抽屜、隔簾吊環、護理呼叫鈴、手電筒接觸不良、病歷板夾子、擦身而過的風聲、廣播故障尖嘯。
// 低語是程式合成:噪音經共振峰塑形成「音節」(依字元決定子音/母音 → 同一個字聽起來一樣,像真的語言),加吸氣、唇齒音;
// 可以聽不清(murmur)或一字一音(syllabic)。另疊 public/audio/world/whispers_*.mp3(CC-BY,見 credits/audio.md)當底層氣聲。
// 濾波:'phone'(電話聽筒:窄頻、失真、劈啪)、'radio'(收音機:窄頻、雜訊床、斷訊)。
// 耳邊低語接到 A.sum(不經過爆炸耳鳴/受傷低通):世界變悶的時候,耳邊的聲音反而更清楚。
// 給離線量測:whisperVoice(ctx, …) / ghostChain(ctx, …) 不依賴即時 context,renderBinaural() 用 OfflineAudioContext 量左右聲道。
import { A, gain, filter, rand, pick, clamp, emit, burst, tone, metal, duck, shaper, curve } from './core.js';
import { vocal } from './voices.js';
import { knockAt, musicBox } from './ambience.js';
import { boxAt } from './folk.js';
import { squeal } from './foley.js';
import * as SM from './samples.js';
import { scare } from './scares.js';
import { sting } from './tracks.js';

const vg = (v) => v * v;
// ---- 每個 context 自己的噪音(離線量測用自己的 context)----
const RES = new WeakMap();
function res(ctx) {
  let r = RES.get(ctx);
  if (r) return r;
  const n = Math.floor(ctx.sampleRate * 3), w = ctx.createBuffer(1, n, ctx.sampleRate), p = ctx.createBuffer(1, n, ctx.sampleRate);
  const a = w.getChannelData(0), b = p.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    a[i] = x;
    b0 = 0.99765 * b0 + x * 0.099046; b1 = 0.963 * b1 + x * 0.2965164; b2 = 0.57 * b2 + x * 1.0526913;
    b[i] = (b0 + b1 + b2 + x * 0.1848) * 0.16;
  }
  r = { white: w, pink: p };
  RES.set(ctx, r);
  return r;
}
const G = (ctx, v, d) => { const g = ctx.createGain(); g.gain.value = v; if (d) g.connect(d); return g; };
const F = (ctx, type, f, q = 0.7, d) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (d) b.connect(d); return b; };
function noiseSrc(ctx, kind, t, end) { const s = ctx.createBufferSource(); s.buffer = res(ctx)[kind]; s.loop = true; s.start(t, Math.random() * 2.5); s.stop(end); return s; }

// ---------- 音節化 ----------
// 中文字 → 一個音節;標點 → 停頓;「……」→ 長停頓(可能吸一口氣)。rate = 每秒音節數(低語慢)
export function syllabify(text, rate = 3.4) {
  const out = [];
  let t = 0;
  const chars = [...String(text || '')];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], c = ch.codePointAt(0);
    if (ch === '…' || ch === '⋯') { if (chars[i + 1] === ch) i++; out.push({ i, k: 'pause', t, d: 0.42 }); t += 0.42; continue; }
    if ('，、,;；：:—－'.includes(ch)) { out.push({ i, k: 'pause', t, d: 0.24 }); t += 0.24; continue; }
    if ('。！？!?.'.includes(ch)) { out.push({ i, k: 'pause', t, d: 0.4 }); t += 0.4; continue; }
    if ('「」『』（）()〔〕《》〈〉"\''.includes(ch) || /\s/.test(ch)) { out.push({ i, k: 'skip', t, d: 0 }); continue; }
    const d = (1 / rate) * (0.82 + ((c * 2654435761) % 1000) / 1000 * 0.36);
    out.push({ i, k: 'syl', t, d, c });
    t += d;
  }
  return { list: out, dur: t };
}
// 字元 → 子音/母音(確定性:同一個字每次都一樣)
const VOW = { a: [850, 1220, 2810], o: [600, 920, 2700], e: [560, 1650, 2700], i: [330, 2650, 3300], u: [380, 860, 2600], y: [320, 2000, 2900], er: [520, 1400, 1800], ai: [800, 1700, 2800], ao: [750, 1000, 2700] };
const VK = Object.keys(VOW);
const CONS = ['s', 'sh', 'sh', 'h', 'h', 'f', 't', 'k', 'ts', 'x', 'n', 'l', '', ''];
const sylOf = (c) => ({ v: VK[(c * 7 + (c >> 3)) % VK.length], c: CONS[(c * 13 + (c >> 5)) % CONS.length], tone: (c >> 2) % 4 });

// ---------- 低語合成(任何 context)----------
// o:text、mode 'syllabic'|'murmur'、g 音量、voiced 0..1(微弱的聲帶音:鬼魂「快要」說得出話)、f0、breath、clicks、rate、pitch(共振峰倍率)、
//    noise(元音裡的氣聲量,預設 1)、voiceGain(聲帶音增益,預設 0.05;院內廣播的合成女聲用 0.5)
export function whisperVoice(ctx, dest, t0, o = {}) {
  const murmur = o.mode === 'murmur';
  const syl = syllabify(o.text || '……', o.rate ?? (murmur ? 4.2 : 3.3));
  const lead = o.breath === false ? 0.05 : 0.55; // 開口前吸一口氣
  const T = t0 + lead, end = T + syl.dur + 0.6;
  const g0 = o.g ?? 0.5, fs = o.pitch ?? rand(1.08, 1.2); // 共振峰偏高(女聲/孩子)
  const out = G(ctx, 1, dest);
  // 元音:白噪音 → 三個共振峰帶通(頻率逐音節自動化)→ 包絡
  const env = G(ctx, 0, out);
  const nz = noiseSrc(ctx, 'white', t0, end);
  const pre = F(ctx, 'lowpass', murmur ? 3200 : 6500, 0.5);
  const nzg = G(ctx, o.noise ?? 1); nz.connect(nzg); nzg.connect(pre);
  const fq = murmur ? [5, 7, 8] : [7, 11, 13], fg = [1, 0.75, 0.42];
  const bps = [0, 1, 2].map((k) => { const b = F(ctx, 'bandpass', 900, fq[k]); pre.connect(b); b.connect(G(ctx, fg[k] * 3.2, env)); return b; });
  // 聲帶音(很弱):鋸齒 → 同一組共振峰
  let osc = null;
  const voiced = o.voiced ?? (murmur ? 0 : 0.18);
  if (voiced > 0) {
    osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = o.f0 ?? 205;
    const og = G(ctx, voiced * (o.voiceGain ?? 0.05));
    osc.connect(og);
    for (const b of bps) og.connect(b);
    osc.start(T); osc.stop(end);
  }
  // 子音:s(高通嘶聲)、sh(帶通)、h(寬帶)
  const sEnv = G(ctx, 0, out), shEnv = G(ctx, 0, out);
  const hs = noiseSrc(ctx, 'white', t0, end);
  hs.connect(F(ctx, 'highpass', 5200, 0.7, sEnv));
  const sh = F(ctx, 'bandpass', 2900, 1.6, shEnv);
  hs.connect(sh);
  const at = (p, v, t) => p.linearRampToValueAtTime(v, t);
  env.gain.setValueAtTime(0, t0); sEnv.gain.setValueAtTime(0, t0); shEnv.gain.setValueAtTime(0, t0);
  const times = []; // 每個字元的出現時間(相對 t0;字幕同步用)
  let last = 'a';
  for (const s of syl.list) {
    const t = T + s.t;
    times[s.i] = t - t0;
    if (s.k !== 'syl') continue;
    const S = sylOf(s.c), V = VOW[S.v], P = VOW[last], d = s.d;
    last = S.v;
    const pk = g0 * rand(0.7, 1) * (murmur ? 0.8 : 1);
    // 子音
    let cv = 0.045;
    if (S.c === 's' || S.c === 'ts' || S.c === 'x') { at(sEnv.gain, 0, t); at(sEnv.gain, pk * (S.c === 'x' ? 0.25 : 0.42), t + 0.03); at(sEnv.gain, 0, t + 0.09); cv = 0.08; }
    if (S.c === 'sh' || S.c === 'x') { sh.frequency.setValueAtTime(S.c === 'x' ? 3600 : 2700, t); at(shEnv.gain, 0, t); at(shEnv.gain, pk * 0.55, t + 0.035); at(shEnv.gain, 0, t + 0.1); cv = 0.09; }
    if (S.c === 'h' || S.c === 'f') { at(shEnv.gain, 0, t); at(shEnv.gain, pk * 0.18, t + 0.03); at(shEnv.gain, 0, t + 0.07); }
    if ((S.c === 't' || S.c === 'k' || S.c === 'ts') && !murmur) { // 塞音:極短的爆破
      const b = ctx.createBufferSource(); b.buffer = res(ctx).white;
      const bf = F(ctx, 'bandpass', S.c === 'k' ? 1800 : 3800, 1.2); const bg = G(ctx, 0, out);
      b.connect(bf); bf.connect(bg);
      bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(pk * 0.6, t + 0.004); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      b.start(t, Math.random()); b.stop(t + 0.04);
    }
    // 母音:共振峰從上一個母音滑到這個,聲調讓第二共振峰稍微上下
    const tv = t + cv, k1 = fs * (S.tone === 1 ? 1.06 : S.tone === 3 ? 0.95 : 1);
    for (let k = 0; k < 3; k++) {
      bps[k].frequency.setValueAtTime(P[k] * fs, tv);
      bps[k].frequency.linearRampToValueAtTime(V[k] * (k === 1 ? k1 : fs), tv + Math.min(0.08, d * 0.4));
      if (S.tone === 2) bps[k].frequency.linearRampToValueAtTime(V[k] * fs * (k === 1 ? 1.08 : 1), t + d * 0.9);
    }
    if (osc) { const f0 = (o.f0 ?? 205) * [1, 1.12, 0.92, 1.05][S.tone]; osc.frequency.setValueAtTime(f0, tv); osc.frequency.linearRampToValueAtTime(f0 * (S.tone === 3 ? 0.85 : 1.03), t + d); }
    at(env.gain, 0, tv);
    at(env.gain, pk, tv + Math.min(0.06, d * 0.3));
    at(env.gain, pk * 0.55, t + d * 0.78);
    at(env.gain, 0, t + d);
  }
  // 吸氣(開口前)與句尾的吐氣
  if (o.breath !== false) breathIn(ctx, out, t0, 0.45, g0 * 0.5);
  breathOut(ctx, out, T + syl.dur + 0.05, 0.5, g0 * 0.35);
  // 唇齒音:句首與隨機
  if (o.clicks !== false) {
    lipClick(ctx, out, T - 0.06, g0 * 0.8);
    for (const s of syl.list) if (s.k === 'pause' && Math.random() < 0.5) lipClick(ctx, out, T + s.t + s.d * 0.6, g0 * 0.6);
  }
  return { end, dur: end - t0, times, len: syl.dur + lead };
}
function breathIn(ctx, d, t, dur, g) {
  const s = noiseSrc(ctx, 'pink', t, t + dur + 0.05), f = F(ctx, 'bandpass', 700, 0.9), e = G(ctx, 0, d);
  s.connect(f); f.connect(e);
  f.frequency.setValueAtTime(650, t); f.frequency.linearRampToValueAtTime(1500, t + dur);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.8); e.gain.linearRampToValueAtTime(0, t + dur);
}
function breathOut(ctx, d, t, dur, g) {
  const s = noiseSrc(ctx, 'pink', t, t + dur + 0.05), f = F(ctx, 'bandpass', 1300, 0.8), e = G(ctx, 0, d);
  s.connect(f); f.connect(e);
  f.frequency.setValueAtTime(1300, t); f.frequency.linearRampToValueAtTime(500, t + dur);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.06); e.gain.linearRampToValueAtTime(0, t + dur);
}
function lipClick(ctx, d, t, g) {
  const b = ctx.createBufferSource(); b.buffer = res(ctx).white;
  const f = F(ctx, 'bandpass', 2400 + Math.random() * 1600, 3), e = G(ctx, 0, d);
  b.connect(f); f.connect(e);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * 0.9, t + 0.0015); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  b.start(t, Math.random()); b.stop(t + 0.02);
}

// ---------- 耳邊聲道:濾波 → 乾(HRTF 定位)+ 濕(貼近的小空間) ----------
// 頭部座標:+x 右、+y 上、+z 後(前方 = -z)
export const EAR = { left: [-0.3, 0.02, -0.03], right: [0.3, 0.02, -0.03], behind: [0.09, 0.05, 0.32], near: [0.06, 0.04, -0.28] };
export function ghostChain(ctx, dest, o = {}) {
  const t = o.t ?? ctx.currentTime, end = o.end ?? t + 10;
  const input = G(ctx, 1);
  let x = input;
  const extra = [];
  if (o.filter === 'pa') { // 院內廣播:天花板喇叭(窄頻、推得有點破)+ 走廊另一頭的第二支喇叭(晚 65ms、更悶)
    const hp = F(ctx, 'highpass', 330, 0.8), pk = F(ctx, 'peaking', 2300, 1.1), lp = F(ctx, 'lowpass', 4200, 0.8);
    pk.gain.value = 5;
    x.connect(hp); hp.connect(pk); pk.connect(lp);
    const sat = ctx.createWaveShaper(), n = 512, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(1.8 * (i / (n - 1) * 2 - 1)) / Math.tanh(1.8);
    sat.curve = c; lp.connect(sat);
    const far = ctx.createDelay(0.2); far.delayTime.value = 0.065;
    sat.connect(far); far.connect(F(ctx, 'lowpass', 1800, 0.7, G(ctx, 0.5, dest)));
    x = sat;
  } else if (o.filter === 'phone' || o.filter === 'radio') {
    const ph = o.filter === 'phone';
    const hp = F(ctx, 'highpass', ph ? 420 : 320, 0.8), lp = F(ctx, 'lowpass', ph ? 3100 : 3600, 0.9), pk = F(ctx, 'peaking', ph ? 1700 : 1300, 1.2);
    pk.gain.value = 7;
    x.connect(hp); hp.connect(pk); pk.connect(lp);
    const sat = ctx.createWaveShaper(), n = 512, c = new Float32Array(n), k = ph ? 2.4 : 3.2;
    for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / Math.tanh(k);
    sat.curve = c; lp.connect(sat);
    // 斷訊:輸出音量隨機掉下去
    const drop = G(ctx, 1);
    sat.connect(drop);
    const N = Math.max(8, Math.ceil((end - t) * 25));
    drop.gain.setValueCurveAtTime(curve(N, () => (Math.random() < (ph ? 0.05 : 0.09) ? rand(0.05, 0.4) : 1)), t, Math.max(0.1, end - t));
    // 線路雜訊床
    const bed = noiseSrc(ctx, ph ? 'white' : 'pink', t, end + 0.2), bf = F(ctx, 'bandpass', ph ? 2200 : 1700, 0.7), bg = G(ctx, 0);
    bed.connect(bf); bf.connect(bg); bg.connect(drop);
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(ph ? 0.012 : 0.05, t + 0.15); bg.gain.setValueAtTime(ph ? 0.012 : 0.05, end - 0.2); bg.gain.linearRampToValueAtTime(0, end);
    if (!ph) { const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 60; hum.connect(F(ctx, 'lowpass', 300, 0.7, G(ctx, 0.006, drop))); hum.start(t); hum.stop(end); }
    x = drop;
    extra.push(bed);
  }
  const p = ctx.createPanner();
  p.panningModel = o.hrtf === false ? 'equalpower' : 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = o.ref ?? 0.3;
  p.rolloffFactor = o.roll ?? 1;
  p.maxDistance = 60;
  const dry = G(ctx, o.dry ?? 1);
  x.connect(dry); dry.connect(p);
  // 近場:HRTF 不模擬「貼在耳邊」的頭影,另外把遠側耳朵再壓低(ild -1 = 左耳、+1 = 右耳)
  const ild = clamp(o.ild ?? 0, -1, 1);
  if (Math.abs(ild) > 0.05) {
    const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
    p.connect(sp);
    sp.connect(G(ctx, ild > 0 ? 1 - 0.62 * ild : 1), 0).connect(mg, 0, 0);
    sp.connect(G(ctx, ild < 0 ? 1 + 0.62 * ild : 1), 1).connect(mg, 0, 1);
    mg.connect(dest);
  } else p.connect(dest);
  if (o.wetDest) { const w = G(ctx, o.wet ?? 0.1, o.wetDest); x.connect(w); }
  else if (o.wet) { // 離線:一點點早期反射(很近的牆)
    const d1 = ctx.createDelay(0.1); d1.delayTime.value = 0.011; const d2 = ctx.createDelay(0.1); d2.delayTime.value = 0.019;
    const w = G(ctx, o.wet); x.connect(w); w.connect(d1); w.connect(d2);
    const wl = F(ctx, 'lowpass', 3500, 0.7, dest); d1.connect(wl); d2.connect(wl);
  }
  const setPos = (px, py, pz) => { if (p.positionX) { p.positionX.value = px; p.positionY.value = py; p.positionZ.value = pz; } else p.setPosition(px, py, pz); };
  return { in: input, panner: p, setPos };
}
// 頭部座標 → 世界座標(用聆聽者位置與 yaw)
function headToWorld(off, out) {
  const L = A.L, c = Math.cos(L.yaw), s = Math.sin(L.yaw);
  // 右 = (cos, 0, -sin);後 = (sin, 0, cos)
  out.x = L.x + off[0] * c + off[2] * s;
  out.y = L.y + off[1];
  out.z = L.z - off[0] * s + off[2] * c;
  return out;
}

// ---------- 即時:鬼魂匯流排 ----------
function bus() {
  if (!A.bus.ghost) {
    A.bus.ghost = gain(1, A.sum); // 不經過悶音/受傷低通
    A.bus.ghostWet = gain(1, A.send.voice.room);
  }
  A.bus.ghost.gain.value = vg(A.vol.sfx ?? 1) * 0.95;
  return A.bus.ghost;
}
const LIVE = []; // 跟著頭轉的聲音:{ chain, off, end }
const _p = { x: 0, y: 0, z: 0 };
// 每幀(horror.update):更新跟著頭的聲音位置
export function track() {
  if (!A.ctx || !LIVE.length) return;
  const n = A.ctx.currentTime;
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const v = LIVE[i];
    if (n > v.end) { LIVE.splice(i, 1); continue; }
    if (v.drift) { v.off[0] += v.drift[0] / 60; v.off[2] += v.drift[2] / 60; }
    if (v.orbit) { const O = v.orbit, a = O.a + O.w * (n - O.t0), r = O.r + (O.dr || 0) * (n - O.t0); v.off[0] = Math.sin(a) * r; v.off[1] = O.y ?? 0.03; v.off[2] = Math.cos(a) * r; } // a = 0 在正後方
    headToWorld(v.off, _p);
    v.chain.setPos(_p.x, _p.y, _p.z);
  }
}
// 取一個發聲名額(全域上限、優先權),再改接到自己的聲道
function slot(prio, dur) {
  const h = emit({ bus: 'scare', prio, dur });
  if (!h) return null;
  try { h.in.disconnect(); } catch { /* 已斷 */ }
  return h;
}

// 耳邊低語。o:text、ear 'left'|'right'|'behind'|'near'、filter、mode、g、prio、pos(世界座標:收音機/電話在場景裡)
// 回傳 { t0, end, dur, times, ear, kill() } 或 null
export function whisper(o = {}) {
  if (!A.ctx) return null;
  const ctx = A.ctx;
  const sy = syllabify(o.text || '……', o.rate ?? (o.mode === 'murmur' ? 4.2 : 3.3));
  const dur = 0.55 + sy.dur + 0.9;
  const h = slot(o.prio ?? 7, dur);
  if (!h) return null;
  const t0 = h.t + (o.delay ?? 0), end = t0 + dur + 0.3;
  const world = o.pos && Number.isFinite(o.pos.x);
  const off = (EAR[o.ear] || EAR.left).slice();
  const pa = o.filter === 'pa';
  const ch = ghostChain(ctx, bus(), { t: t0, end, filter: o.filter, ref: world ? (pa ? 3 : 1.2) : 0.3, roll: world ? (pa ? 0.6 : 1.1) : 1, wetDest: pa ? A.send.sfx.hall : A.bus.ghostWet, wet: pa ? 0.55 : world ? 0.25 : 0.06, hrtf: pa ? false : o.hrtf, ild: world || o.orbit ? 0 : off[0] / 0.3 });
  h.in.connect(ch.in);
  const v = whisperVoice(ctx, h.in, t0, { text: o.text, mode: o.mode, g: (o.g ?? 0.55) * (o.filter ? 1.6 : 1), voiced: o.voiced, f0: o.f0, pitch: o.pitch, breath: o.breath, noise: o.noise, voiceGain: o.voiceGain, rate: o.rate, clicks: o.clicks });
  // 錄音的氣聲底層(輕;scare 類別第一次用到才載入,沒載好就只有合成)
  if (!o.filter && o.layer !== false) SM.play('scare.whisper', { h: { in: h.in, t: t0 }, g: 0.16, off: rand(0, 0.8), len: Math.min(dur, 3), fi: 0.4, fo: 0.8 });
  if (world) ch.setPos(o.pos.x, o.pos.y ?? A.L.y, o.pos.z);
  else {
    LIVE.push({ chain: ch, off, end, drift: o.drift || null, orbit: o.orbit ? { r: 0.5, w: 1.8, a: 0, ...o.orbit, t0 } : null });
    headToWorld(off, _p); ch.setPos(_p.x, _p.y, _p.z);
  }
  return { t0, end, dur, times: v.times, lead: 0.55, ear: o.ear, kill: () => h.kill() };
}

// ---------- 其他靈異音效(即時;全部安全:沒有 context 時不做事)----------
const out = (pos, o) => emit({ pos, cat: 'scare', bus: 'scare', prio: 5, room: 0.6, hall: 0.3, ref: 1.5, maxDist: 60, ...o });
// 頸後呼吸:冰冷的吸吐兩三次,跟著頭(在身後)
export function breathNeck(g = 1, ear = 'behind') { // ear:'behind'(頸後)| 'left' | 'right'(貼著那一側的耳朵)
  if (!A.ctx) return;
  const ctx = A.ctx, dur = 4.2, h = slot(7, dur);
  if (!h) return;
  const ch = ghostChain(ctx, bus(), { t: h.t, end: h.t + dur, ref: 0.3, wetDest: A.bus.ghostWet, wet: 0.04 });
  h.in.connect(ch.in);
  let t = h.t;
  for (let i = 0; i < pick([2, 3]); i++) { breathIn(ctx, h.in, t, 0.7, 0.28 * g); breathOut(ctx, h.in, t + 0.8, 0.9, 0.34 * g); t += rand(1.5, 1.8); }
  const off = (EAR[ear] || EAR.behind).slice(); if (!EAR[ear] || ear === 'behind') off[0] = rand(-0.12, 0.12);
  LIVE.push({ chain: ch, off, end: h.t + dur + 0.3 });
  headToWorld(off, _p); ch.setPos(_p.x, _p.y, _p.z);
}
// 刺擊:'swell' 反向膨脹 → 重擊、'hit' 不協和重擊、'shimmer' 高頻玻璃音簇、'sub' 低頻下沉
export function stinger(kind = 'hit', g = 1) {
  const h = emit({ bus: 'scare', prio: 8, dur: 4, room: 0.4, hall: 0.8 });
  if (!h) return;
  const t = h.t, d = h.in;
  if (kind === 'swell') {
    const b = burst(d, t, { buf: 'pink', type: 'bandpass', f: 400, f1: 4200, q: 0.6, dur: 0.05, a: 1.3, g: 0.22 * g }); void b;
    for (const f of [233, 247, 311, 466]) tone(d, t, { type: 'sawtooth', f: f * 0.5, f1: f, glide: 1.3, dur: 0.15, a: 1.3, g: 0.012 * g });
    tone(d, t + 1.3, { f: 55, f1: 28, dur: 1.2, g: 0.5 * g });
    burst(d, t + 1.3, { type: 'lowpass', f: 1800, f1: 120, dur: 0.6, g: 0.4 * g });
  } else if (kind === 'shimmer') {
    for (const f of [2093, 2217, 2489, 2960, 3136]) tone(d, t + rand(0, 0.08), { f, dur: 2.4, a: 0.02, g: 0.012 * g });
    burst(d, t, { type: 'highpass', f: 6000, dur: 1.4, a: 0.3, g: 0.04 * g });
  } else if (kind === 'sub') {
    tone(d, t, { f: 48, f1: 22, dur: 2.5, a: 0.15, g: 0.6 * g });
    burst(d, t, { buf: 'brown', type: 'lowpass', f: 200, dur: 1.6, a: 0.2, g: 0.35 * g });
  } else {
    for (const f of [92.5, 98, 138.6, 146.8]) tone(d, t, { type: 'sawtooth', f, dur: 1.6, a: 0.004, g: 0.05 * g });
    burst(d, t, { type: 'lowpass', f: 3000, f1: 200, dur: 0.5, g: 0.5 * g });
    for (let i = 0; i < 4; i++) metal(d, t + rand(0, 0.03), rand(1200, 2600), 0.03 * g, 0.9, [1, 1.41, 2.3]);
    if (Math.random() < 0.5) sting(pick(['scare1', 'scare2', 'scare3']), 0.6, 4);
  }
  duck(0.5, 1.2);
}
// 突然的寂靜:環境音與配樂在 0.4 秒內被抽掉,dur 秒後慢慢回來
export function silence(dur = 4, depth = 0.04) {
  if (!A.ctx) return;
  const n = A.ctx.currentTime;
  for (const node of [A.duckAmb, A.duck, A.duckRev]) {
    const p = node.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(n); else { p.cancelScheduledValues(n); p.setValueAtTime(p.value, n); }
    p.setTargetAtTime(depth, n, 0.12);
    p.setTargetAtTime(1, n + dur, 1.2);
  }
  // 耳鳴般的極細高頻(寂靜「聽得見」)
  const h = emit({ bus: 'scare', prio: 3, dur: dur + 1 });
  if (h) tone(h.in, h.t + 0.3, { f: 7900, dur: 0.8, hold: dur * 0.7, a: 0.6, g: 0.0035 });
}
// 天花板裡有東西爬過去(從頭頂一側到另一側)
export function crawl(dur = 5) {
  if (!A.ctx) return null;
  const L = A.L, a = rand(0, Math.PI * 2);
  const p = { x: L.x + Math.cos(a) * 3, y: L.y + 1.25, z: L.z + Math.sin(a) * 3 };
  const h = out(p, { room: 0.35, hall: 0, ref: 1.6, dur: dur + 1, gain: 2.2, prio: 6 });
  if (!h) return null;
  const vx = -Math.cos(a) * 6 / dur, vz = -Math.sin(a) * 6 / dur;
  const iv = setInterval(() => { p.x += vx * 0.05; p.z += vz * 0.05; }, 50);
  setTimeout(() => clearInterval(iv), dur * 1000);
  const lp = filter('lowpass', 1300, 0.7, h.in);
  let t = h.t;
  while (t < h.t + dur) {
    knockAt(lp, t, rand(0.25, 0.5)); // 手/膝蓋
    if (Math.random() < 0.6) burst(lp, t + 0.06, { buf: 'pink', type: 'bandpass', f: rand(600, 1400), q: 2, dur: rand(0.15, 0.3), a: 0.08, g: 0.06 }); // 拖過去
    if (Math.random() < 0.15) squeal(lp, t + 0.1, rand(1500, 2200), rand(1100, 1500), rand(0.3, 0.6), 0.05, 12, [30, 60]); // 指甲
    t += rand(0.22, 0.42) * (Math.random() < 0.15 ? 2.5 : 1);
  }
  return p;
}
// 手掌按在玻璃上的吱聲
export function squeak(pos) {
  const h = out(pos, { room: 0.3, ref: 1.2, dur: 1.2, gain: 1.6 });
  if (!h) return;
  squeal(h.in, h.t, rand(1800, 2600), rand(1300, 1900), rand(0.25, 0.45), 0.07, 22, [40, 70]);
  tone(h.in, h.t, { f: 140, f1: 90, dur: 0.12, g: 0.15 }); // 掌心拍上去
}
// 濕腳步(赤腳)
export function wetStep(pos, g = 1) {
  const h = out(pos, { room: 0.5, ref: 1.6, dur: 0.6, gain: 1.4 * g, prio: 3 });
  if (!h) return;
  burst(h.in, h.t, { type: 'lowpass', f: 900, f1: 250, dur: 0.07, g: 0.35 });
  burst(h.in, h.t + 0.01, { type: 'bandpass', f: rand(1100, 1700), q: 2.5, dur: 0.09, a: 0.01, g: 0.12 }); // 水聲
  if (Math.random() < 0.5) burst(h.in, h.t + 0.06, { type: 'highpass', f: 3000, dur: 0.05, g: 0.04 });
}
// 牆上刮出字(指甲/粉筆在灰泥上)
export function scrawl(pos, dur = 2) {
  const h = out(pos, { room: 0.5, ref: 1.4, dur: dur + 0.5, gain: 1.8 });
  if (!h) return;
  let t = h.t;
  while (t < h.t + dur) { const d = rand(0.12, 0.35); burst(h.in, t, { type: 'bandpass', f: rand(2200, 3800), q: 3, dur: d * 0.5, a: d * 0.5, g: 0.09 }); t += d + rand(0.03, 0.12); }
}
// 鬼護士的推車:輪子吱吱、瓶罐輕碰(pos 物件會被跟隨)
export function cart(pos, dur = 6) {
  const h = out(pos, { room: 0.7, hall: 0.3, ref: 2, dur: dur + 0.5, gain: 1.6, prio: 5 });
  if (!h) return;
  let t = h.t;
  while (t < h.t + dur) {
    squeal(h.in, t, rand(1400, 1900), rand(1200, 1600), rand(0.18, 0.3), 0.05, 20, [20, 40]);
    if (Math.random() < 0.4) metal(h.in, t + rand(0.1, 0.3), rand(2800, 4200), 0.012, 0.3, [1, 2.4, 3.1]); // 玻璃瓶
    burst(h.in, t, { buf: 'brown', type: 'lowpass', f: 260, dur: 0.4, a: 0.1, g: 0.08 });
    t += rand(0.55, 0.75);
  }
}
// 電梯到了:機械聲 → 「叮」→ 門滑開
export function elevator(pos) {
  const h = out(pos, { room: 0.8, hall: 0.4, ref: 2.5, dur: 6, gain: 1.4, prio: 5 });
  if (!h) return;
  const t = h.t;
  burst(h.in, t, { buf: 'brown', type: 'lowpass', f: 180, dur: 0.6, a: 1.2, hold: 0.6, g: 0.25 }); // 車廂到站
  metal(h.in, t + 2.2, 1318.5, 0.08, 1.6, [1, 2.0, 3.01]);
  burst(h.in, t + 2.6, { type: 'lowpass', f: 700, dur: 0.3, a: 0.6, hold: 0.4, g: 0.12 }); // 門滑開
  tone(h.in, t + 2.6, { type: 'sawtooth', f: 85, dur: 0.2, a: 0.5, hold: 0.5, g: 0.01 });
}
// 一盞燈斷電:繼電器「喀」+ 燈管冷卻的「叮」
export function tubeOff(pos) {
  const h = out(pos, { room: 0.5, ref: 2, dur: 1.2, gain: 1.5, prio: 4 });
  if (!h) return;
  tone(h.in, h.t, { f: 70, f1: 40, dur: 0.12, g: 0.3 });
  burst(h.in, h.t, { type: 'bandpass', f: 1800, q: 1, dur: 0.03, g: 0.18 });
  metal(h.in, h.t + rand(0.05, 0.2), rand(3200, 4300), 0.01, 0.2, [1, 2.4]);
}
// 搖籃曲:音樂盒《望春風》(阿嬤在 207 病房哼給病人聽的那首;走近 3 公尺就發條鬆掉停下);還沒烘焙好時用合成的小曲 + 很輕的女聲哼唱
export function lullaby(pos) {
  if (pos && boxAt(pos)) return;
  const h = out(pos, { room: 0.8, hall: 0.6, ref: 2, dur: 12, gain: 1.3, prio: 5 });
  if (!h) return;
  const end = musicBox(h.in, h.t, 10, 0.045, 0.993);
  const notes = [392, 440, 392, 330, 349, 330, 294];
  let t = h.t + 0.4;
  for (const f of notes) { vocal(filter('lowpass', 1800, 0.7, gain(0.5, h.in)), t, { mode: 'groan', contour: 'groan', f0: f * 0.5, dur: 0.7, fs: 1.3, q: 9, vows: ['u', 'u', 'u'], breath: 0.6, fryRate: 5, fryD: 0.05, sub: 0, drive: 1.1, lp: 2500, gurgle: 0, gain: 0.1, jit: 0.01, wob: 0.03, att: 0.15, rel: 0.3, k: 0.2, makeup: 2 }); t += 0.82; }
  void end;
}
// 冷風(寒氣進來)+ 結霜的細碎劈啪
export function gust(g = 1) {
  const h = emit({ bus: 'scare', prio: 4, dur: 3.5 });
  if (!h) return;
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 500, f1: 1400, q: 0.7, dur: 1.6, a: 1.1, g: 0.09 * g });
  for (let i = 0; i < 14; i++) metal(h.in, h.t + 0.6 + Math.pow(Math.random(), 1.5) * 2.2, rand(5000, 9000), 0.004 * g, 0.03, [1, 1.6]);
}
// 子彈穿過鬼魂:冷霧嘶聲 + 一聲反向吸氣
export function mist(pos) {
  const h = out(pos, { room: 0.4, ref: 2, dur: 1.6, gain: 1.6, prio: 6 });
  if (!h) return;
  burst(h.in, h.t, { type: 'highpass', f: 3500, dur: 0.8, a: 0.02, g: 0.08 });
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 2200, f1: 600, q: 0.9, dur: 0.9, a: 0.05, g: 0.1 });
}
// 鬼魂消失:反向的吸氣 + 高頻消散
export function vanish(pos, g = 1) {
  const h = pos ? out(pos, { room: 0.5, ref: 2.5, dur: 1.4, gain: 1.4 * g, prio: 6 }) : emit({ bus: 'scare', prio: 6, dur: 1.4 });
  if (!h) return;
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 500, f1: 2600, q: 0.8, dur: 0.05, a: 0.55, g: 0.12 * g });
  tone(h.in, h.t + 0.5, { f: 3200, f1: 5200, dur: 0.5, g: 0.006 * g });
}
// 長而慢的開門吱呀
export function creakLong(pos, dur = 3.5) {
  const h = out(pos, { room: 0.8, hall: 0.4, ref: 2, dur: dur + 0.5, gain: 1.6 });
  if (!h) return;
  if (SM.play('door.creak', { h, g: 0.7, rate: 0.62 })) return;
  squeal(h.in, h.t, rand(300, 420), rand(220, 300), dur, 0.1, 30, [8, 16]);
}
export const giggle = (pos) => scare('child_laugh', pos);
// ---- 第二輪 ----
// 敲牆(指節敲在灰泥/門板)或敲冰櫃抽屜(metal:悶的金屬聲);n 下
export function knock(pos, n = 3, o = {}) {
  const h = out(pos, { room: 0.6, hall: 0.2, ref: 1.6, dur: n * 0.45 + 1, gain: (o.g ?? 1) * 1.5, prio: 5 });
  if (!h) return;
  const d = o.metal ? filter('lowpass', 900, 0.8, h.in) : h.in;
  let t = h.t;
  for (let i = 0; i < n; i++) {
    knockAt(d, t, 0.55 * (i === n - 1 ? 1.15 : 1));
    if (o.metal) metal(d, t + 0.005, rand(260, 380), 0.05, 0.5, [1, 1.8, 2.9]);
    t += (o.gap ?? 0.32) * rand(0.85, 1.2);
  }
}
// 隔簾吊環在軌道上滑過去(有人拉了簾子)
export function rings(pos) {
  const h = out(pos, { room: 0.5, ref: 1.5, dur: 1.6, gain: 1.4, prio: 4 });
  if (!h) return;
  const dur = rand(0.6, 0.9);
  for (let i = 0; i < 9; i++) metal(h.in, h.t + (i / 9) * dur + rand(0, 0.03), rand(2600, 4200), 0.012, 0.12, [1, 1.5, 2.6]);
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1800, q: 0.8, dur: dur * 0.6, a: dur * 0.4, g: 0.05 }); // 布料
}
// 護理呼叫鈴(病床的叫人鈴):叮—咚 兩次
export function callBell(pos) {
  const h = out(pos, { room: 0.8, hall: 0.5, ref: 2.5, dur: 4, gain: 1.2, prio: 5 });
  if (!h) return;
  for (let r = 0; r < 2; r++) {
    const t = h.t + r * 1.4;
    tone(h.in, t, { f: 659.3, dur: 0.9, a: 0.004, g: 0.05 }); tone(h.in, t, { f: 1318.5, dur: 0.3, a: 0.003, g: 0.012 });
    tone(h.in, t + 0.45, { f: 523.3, dur: 1.1, a: 0.004, g: 0.05 }); tone(h.in, t + 0.45, { f: 1046.5, dur: 0.35, a: 0.003, g: 0.012 });
  }
}
// 手電筒接觸不良:手邊(非定位)的劈啪 + 嗡
export function flashBuzz(dur = 0.7) {
  const h = emit({ bus: 'sfx', prio: 4, dur: dur + 0.3 });
  if (!h) return;
  for (let i = 0; i < 6; i++) burst(h.in, h.t + rand(0, dur), { type: 'highpass', f: 3000, dur: 0.012, g: 0.05 });
  tone(filter('bandpass', 900, 2, h.in), h.t, { type: 'square', f: 120, dur: dur * 0.5, hold: dur * 0.5, a: 0.01, g: 0.004 });
}
// 病歷板的夾子「喀」(鄭玉蘭出現時的聲音,STORY.md §2.10)
export function clip(pos) {
  const h = out(pos, { room: 0.6, ref: 1.4, dur: 0.8, gain: 1.3, prio: 3 });
  if (!h) return;
  burst(h.in, h.t, { type: 'bandpass', f: 2600, q: 2, dur: 0.02, g: 0.25 });
  metal(h.in, h.t + 0.004, rand(1900, 2600), 0.03, 0.15, [1, 2.3]);
}
// 有東西擦身而過的風聲(pos 物件會被跟隨)
export function whoosh(pos, g = 1) {
  const h = out(pos, { room: 0.3, ref: 1.2, dur: 1.2, gain: 1.5 * g, prio: 5 });
  if (!h) return;
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 500, f1: 1600, q: 0.9, dur: 0.35, a: 0.25, g: 0.14 });
}
// 院內廣播故障:回授尖嘯 → 「喀」一聲斷掉
export function paGlitch() {
  const h = emit({ bus: 'scare', prio: 6, dur: 2, room: 0.6, hall: 0.9 });
  if (!h) return;
  tone(filter('bandpass', 2800, 3, h.in), h.t, { f: 2750, f1: 3150, glide: 0.7, dur: 0.25, hold: 0.5, a: 0.15, g: 0.03 });
  burst(h.in, h.t + 0.9, { type: 'lowpass', f: 900, f1: 200, dur: 0.05, g: 0.2 });
}

// ---------- 離線量測:耳邊低語的左右聲道 ----------
export async function renderBinaural(ear = 'left', text = '二〇七的燈……還亮著嗎？', o = {}) {
  const sr = 44100, dur = 4;
  const ctx = new OfflineAudioContext(2, sr * dur, sr);
  const off = EAR[ear] || EAR.left;
  const ch = ghostChain(ctx, ctx.destination, { t: 0, end: dur, filter: o.filter, wet: 0.06, ild: off[0] / 0.3 });
  ch.setPos(off[0], off[1], off[2]); // 聆聽者在原點、面向 -z
  whisperVoice(ctx, ch.in, 0.02, { text, g: 0.5 });
  const buf = await ctx.startRendering();
  const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
  const L = rms(buf.getChannelData(0)), R = rms(buf.getChannelData(1));
  return { ear, L: +L.toFixed(5), R: +R.toFixed(5), dB: +(20 * Math.log10((L + 1e-9) / (R + 1e-9))).toFixed(1) };
}
// ---------- 第三輪(src/horror/haunts.js)----------
// 總開關跳脫:「喀——咚」,燈管的嗡聲被抽掉
export function breaker(pos) {
  const h = out(pos, { room: 0.7, hall: 0.6, ref: 3, dur: 2.5, gain: 1.6, prio: 7, maxDist: 80 });
  if (!h) return;
  burst(h.in, h.t, { type: 'bandpass', f: 1400, q: 1.5, dur: 0.03, g: 0.5 });
  metal(h.in, h.t + 0.004, rand(500, 700), 0.12, 0.25, [1, 2.2, 3.1]);
  tone(h.in, h.t + 0.02, { f: 70, f1: 32, dur: 0.6, g: 0.5 });
  tone(h.in, h.t, { type: 'sawtooth', f: 120, f1: 40, dur: 0.5, a: 0.002, g: 0.03 });
}
// 生理監視器:嗶聲越來越慢(n 聲,間隔 i0 → i1);回傳總長(秒)
export function beeps(pos, n = 7, i0 = 0.8, i1 = 1.6) {
  let total = 0; for (let i = 0; i < n; i++) total += i0 + (i1 - i0) * (i / Math.max(1, n - 1));
  const h = out(pos, { room: 0.6, hall: 0.3, ref: 2, dur: total + 1, gain: 1.1, prio: 4 });
  if (!h) return total;
  let t = h.t;
  for (let i = 0; i < n; i++) { tone(h.in, t, { f: 980, dur: 0.11, a: 0.004, g: 0.1 }); t += i0 + (i1 - i0) * (i / Math.max(1, n - 1)); }
  return total;
}
// 收音機自己轉台:掃頻雜訊 + 外差口哨
export function tune(pos, dur = 2.4) {
  const h = out(pos, { room: 0.5, ref: 1.8, dur: dur + 0.5, gain: 1.3, prio: 5 });
  if (!h) return;
  burst(h.in, h.t, { type: 'bandpass', f: 600, f1: 2600, q: 2.5, dur: dur * 0.4, a: dur * 0.3, g: 0.08 });
  for (let i = 0; i < 4; i++) tone(h.in, h.t + rand(0, dur * 0.8), { f: rand(900, 2400), f1: rand(400, 3000), dur: rand(0.15, 0.4), a: 0.03, g: 0.02 });
}
// 球滾過地板(pos 物件會被跟隨)/ 彈跳 / 輕拍
export function roll(pos, dur = 3) {
  const h = out(pos, { room: 0.4, ref: 1.4, dur: dur + 0.4, gain: 1.4, prio: 4 });
  if (!h) return;
  burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 380, f1: 160, dur: dur * 0.85, a: 0.15, g: 0.16 });
}
export function bounce(pos, g = 1) {
  const h = out(pos, { room: 0.5, ref: 1.6, dur: 0.6, gain: 1.4 * g, prio: 4 });
  if (!h) return;
  tone(h.in, h.t, { f: 190, f1: 120, dur: 0.09, g: 0.3 });
  burst(h.in, h.t, { type: 'bandpass', f: 900, q: 1.2, dur: 0.04, g: 0.12 });
}
// 吊燈的電線/鍊子晃到盡頭(吱)
export function chain(pos, g = 1) {
  const h = out(pos, { room: 0.4, ref: 1.4, dur: 0.8, gain: 1.2 * g, prio: 3 });
  if (!h) return;
  squeal(h.in, h.t, rand(820, 980), rand(600, 720), rand(0.25, 0.4), 0.035, 16, [25, 45]);
  metal(h.in, h.t + 0.02, rand(2400, 3200), 0.01, 0.1, [1, 1.6]);
}
// 玻璃外的人呼了一口氣
export function exhale(pos, g = 1) {
  const h = out(pos, { room: 0.3, ref: 1.2, dur: 1.8, gain: 1.4 * g, prio: 4 });
  if (!h) return;
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 700, f1: 420, q: 0.8, dur: 1.1, a: 0.25, g: 0.1 });
}
// 遠處有人在吹口哨(鬼月禁忌:暗暝莫吹口哨),五聲音階、走音
export function whistle(pos, dur = 3.2) {
  const h = out(pos, { room: 0.8, hall: 0.7, ref: 3, dur: dur + 1.2, gain: 1.2, prio: 4, maxDist: 70 });
  if (!h) return;
  const notes = [1175, 1047, 880, 1047, 784, 880], n = notes.length;
  for (let i = 0; i < n; i++) { const t = h.t + (i / n) * dur, f = notes[i] * rand(0.985, 1.01); tone(h.in, t, { f, f1: f * rand(0.97, 1.0), dur: dur / n * 0.9, a: 0.05, g: 0.045 }); }
  burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1000, q: 3, dur, a: 0.2, g: 0.012 }); // 氣聲
}
// 回憶的背景:2003 年的病房/大廳/夜裡(人聲嘈雜、監視器嗶聲、遠處電話、口罩下的呼吸與腳步、磁帶嘶聲;頻寬像舊錄音)
// kind 'ward' | 'lobby' | 'night' | 'dock';回傳 handle(kill() 提早結束)
export function pastBed(dur = 18, kind = 'ward') {
  const h = emit({ bus: 'scare', prio: 6, dur: dur + 1.5, room: 0.5, hall: 0.6, gain: 1 });
  if (!h) return null;
  const d = filter('lowpass', 3400, 0.7, h.in), t0 = h.t + 0.6, T = t0 + dur - 0.8;
  const crowd = kind === 'lobby' ? 0.05 : kind === 'night' ? 0.008 : kind === 'dock' ? 0.012 : 0.03;
  for (let t = t0; t < T; t += rand(0.5, 1.1)) burst(d, t, { buf: 'pink', type: 'bandpass', f: rand(380, 900), q: rand(2, 4), dur: rand(0.4, 1.0), a: 0.25, g: crowd });
  if (kind === 'ward' || kind === 'night') for (let t = t0 + rand(0, 1); t < T; t += 1.05) tone(d, t, { f: 980, dur: 0.08, a: 0.003, g: kind === 'night' ? 0.018 : 0.03 });
  if (kind === 'ward' || kind === 'lobby') for (let t = t0 + rand(2, 5); t < T - 2; t += rand(6, 9)) for (let i = 0; i < 2; i++) { tone(d, t + i * 0.45, { f: 1250, dur: 0.35, a: 0.01, g: 0.012 }); tone(d, t + i * 0.45, { f: 1550, dur: 0.35, a: 0.01, g: 0.01 }); }
  if (kind === 'dock') for (let t = t0 + 1; t < T; t += rand(2.5, 4)) tone(d, t, { type: 'sawtooth', f: rand(55, 70), dur: 1.4, a: 0.4, g: 0.012 }); // 發財車怠速
  for (let t = t0 + 1; t < T; t += rand(0.45, 0.6)) if (Math.random() < (kind === 'night' ? 0.15 : 0.5)) burst(d, t, { type: 'lowpass', f: 700, dur: 0.05, g: 0.035 });
  burst(d, t0, { buf: 'pink', type: 'highpass', f: 2500, dur: dur - 0.8, a: 1, g: 0.012 });
  return h;
}
export const ghostState = () => ({ live: LIVE.length });
export const ghost = { whisper, track, breathNeck, stinger, silence, crawl, squeak, wetStep, scrawl, cart, elevator, tubeOff, lullaby, gust, mist, vanish, creakLong, giggle, knock, rings, callBell, flashBuzz, clip, whoosh, paGlitch, pastBed, breaker, beeps, tune, roll, bounce, chain, exhale, whistle, renderBinaural, syllabify, state: ghostState, EAR };
