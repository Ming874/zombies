import { _internal } from '../audio.js';

// 轉場的小聲音(程式合成,走 ui 匯流排;AudioContext 還沒建立時什麼都不做)。
// 映像管關機/開機、標題卡落下的悶響、睜眼的吸氣、監視器跳格的雜訊、燈篙點亮時低低的嗡。
const A = () => _internal?.A;
let noiseBuf = null;
function ctxOut(gain = 1) {
  const a = A();
  const ctx = a?.ctx;
  if (!ctx || ctx.state !== 'running') return null;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(a.bus?.ui || a.bus?.sfx || ctx.destination);
  setTimeout(() => out.disconnect(), 4000);
  return { ctx, out, t: ctx.currentTime + 0.005 };
}
function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function osc(o, type, f0, f1, t, dur, g, att = 0.004) {
  const { ctx, out } = o;
  const s = ctx.createOscillator(), e = ctx.createGain();
  s.type = type;
  s.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(g, t + att);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(e).connect(out);
  s.start(t);
  s.stop(t + dur + 0.05);
}
function hiss(o, t, dur, g, type = 'bandpass', f = 2400, q = 0.8, att = 0.01, f1 = f) {
  const { ctx, out } = o;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), e = ctx.createGain();
  s.buffer = noise(ctx);
  s.loop = true;
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  fl.Q.value = q;
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(g, t + att);
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(e).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}
const safe = (fn) => (...a) => { try { const o = ctxOut(); if (o) fn(o, ...a); } catch { /* 聲音失敗不影響畫面 */ } };

export const msfx = {
  // 映像管關機:繼電器喀、靜電、高頻往下掉
  crtOff: safe((o) => {
    const t = o.t;
    osc(o, 'square', 140, 60, t, 0.05, 0.12);
    hiss(o, t, 0.12, 0.09, 'highpass', 3000, 0.5);
    osc(o, 'sine', 7800, 1900, t + 0.02, 0.42, 0.035, 0.01);
    osc(o, 'sine', 60, 32, t, 0.3, 0.12, 0.01);
  }),
  crtOn: safe((o) => {
    const t = o.t;
    hiss(o, t, 0.35, 0.06, 'highpass', 2500, 0.5, 0.05);
    osc(o, 'sine', 2600, 7600, t + 0.03, 0.5, 0.02, 0.08);
    osc(o, 'square', 90, 50, t, 0.06, 0.08);
  }),
  // 監視器跳格:很短的雜訊
  roll: safe((o) => { hiss(o, o.t, 0.5, 0.045, 'bandpass', 1800, 0.6, 0.03, 900); }),
  // 標題卡:遠處的一聲悶響(不嚇人)
  thud: safe((o) => { osc(o, 'sine', 70, 38, o.t, 1.4, 0.22, 0.02); hiss(o, o.t, 0.5, 0.05, 'lowpass', 300, 0.7, 0.02); }),
  // 睜眼:吸一口氣
  breath: safe((o) => { hiss(o, o.t, 0.9, 0.05, 'bandpass', 900, 0.9, 0.35, 1500); }),
  // 燈篙亮起:低低的嗡一下(不是 37.8Hz 的誘集聲,只是點燈的電)
  hum: safe((o) => { osc(o, 'sawtooth', 120, 118, o.t, 1.6, 0.012, 0.25); osc(o, 'sine', 240, 240, o.t, 1.2, 0.01, 0.2); }),
};
