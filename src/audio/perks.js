// 職業能力與裝備的合成音效(src/game/perks.js):電擊槍、閃身鞋、綠色針筒、背後撲臉
import { A, emit, burst, tone, rand } from './core.js';

// 電擊槍:高頻劈啪 + 低頻嗡鳴;n = 連鎖幾隻(越多劈啪越長)
export function zap(pos, n = 1) {
  const h = emit({ pos, bus: 'sfx', prio: 6, room: 0.25, dur: 1.2, gain: 1.1, maxDist: 50 });
  if (!h) return;
  const len = 0.25 + Math.min(10, n) * 0.035;
  burst(h.in, h.t, { type: 'highpass', f: 2600, q: 0.7, dur: len, hold: len * 0.4, g: 0.55 });
  tone(h.in, h.t, { type: 'sawtooth', f: 118, dur: len, hold: len * 0.5, g: 0.16 });
  tone(h.in, h.t, { type: 'square', f: 177, dur: len * 0.8, g: 0.07 });
  for (let i = 0, k = 6 + n * 2; i < k; i++) burst(h.in, h.t + rand(0, len), { type: 'bandpass', f: rand(2800, 7000), q: 3, dur: rand(0.008, 0.02), g: rand(0.5, 1) });
}

// 閃身鞋:吸氣似的上掃 + 落地的悶響
export function blink() {
  const h = emit({ bus: 'sfx', prio: 7, room: 0.2, dur: 1.4, gain: 0.9 });
  if (!h) return;
  burst(h.in, h.t, { type: 'bandpass', f: 380, f1: 4200, glide: 0.42, q: 1.2, dur: 0.5, g: 0.6 });
  tone(h.in, h.t, { f: 210, f1: 880, glide: 0.4, dur: 0.45, g: 0.14 });
  tone(h.in, h.t + 0.46, { f: 90, f1: 46, dur: 0.3, g: 0.35 });
  burst(h.in, h.t + 0.46, { type: 'lowpass', f: 600, dur: 0.25, g: 0.4 });
}

// 綠色針筒:針帽「喀」+ 推藥的嘶聲
export function inject() {
  const h = emit({ bus: 'sfx', prio: 7, room: 0.1, dur: 0.8, gain: 0.9 });
  if (!h) return;
  tone(h.in, h.t, { type: 'square', f: 1900, dur: 0.025, g: 0.12 });
  burst(h.in, h.t + 0.08, { type: 'highpass', f: 5200, dur: 0.32, hold: 0.1, g: 0.32 });
  tone(h.in, h.t + 0.1, { f: 520, f1: 760, dur: 0.35, g: 0.05 });
}

// 背後撲臉:貼在耳邊的尖嘯(掃頻帶通噪音 + 刺耳的高音)
export function shriek(pos) {
  const h = emit({ pos, bus: 'sfx', prio: 9, room: 0.15, dur: 1.4, gain: 1.4, nocap: true });
  if (!h) return;
  burst(h.in, h.t, { type: 'bandpass', f: 900, f1: 2600, glide: 0.25, q: 2.5, dur: 0.7, hold: 0.15, g: 0.9 });
  burst(h.in, h.t, { type: 'bandpass', f: 1500, f1: 3400, glide: 0.3, q: 4, dur: 0.6, g: 0.5 });
  tone(h.in, h.t, { type: 'sawtooth', f: 620, f1: 980, glide: 0.2, dur: 0.55, g: 0.08 });
  burst(h.in, h.t, { type: 'lowpass', f: 220, dur: 0.35, g: 0.9 }); // 撞上來的悶響
  if (A.ctx) tone(h.in, h.t + 0.02, { f: 70, f1: 40, dur: 0.4, g: 0.5 });
}
