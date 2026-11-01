// 埋伏 / 天花板掉落的音效(src/zombies/ambush.js 使用):全部即時合成(沒有新增錄音檔),跳嚇偶爾疊一個既有的錄音刺擊。
// ambushSfx(kind, pos, k):AudioContext 未建立時不做事,任何合成錯誤也不往外丟;同一種 0.25 秒內不重複。
//  sting(pos, k)   跳嚇刺擊:低頻重擊 + 刺耳的弦樂不協和音簇 + 氣流(k = 強度 0..1)
//  scratch(pos)    天花板夾層裡的抓刮、拖動(悶,隔著天花板)
//  rattle(pos)     通風格柵被從上面推得喀喀響
//  drip(pos)       血滴落到地上
//  breath(pos)     「屍體」微弱、潮濕的呼吸(很近才聽得到)
//  crash(pos)      格柵/天花板碎裂、掉下來
import { A, emit, burst, tone, metal, rand, pick, filter, gain, duck } from './core.js';
import { squeal } from './foley.js';
import { knockAt } from './ambience.js';
import { vocal } from './voices.js';
import { sting as recSting } from './tracks.js';

const out = (pos, o) => emit({ pos, cat: 'scare', bus: 'scare', prio: 5, room: 0.6, hall: 0.3, ref: 1.5, maxDist: 40, ...o });
let recT = -99;

const K = {
  sting(pos, k = 1) {
    const h = emit({ bus: 'scare', prio: 9, room: 0.5, hall: 0.4, dur: 2.2, gain: 0.55 + 0.45 * k });
    if (!h) return;
    const t = h.t;
    tone(h.in, t, { f: 58, f1: 26, dur: 0.95, g: 0.95 }); // 重擊
    burst(h.in, t, { type: 'lowpass', f: 700, f1: 70, dur: 0.55, g: 0.85 });
    burst(h.in, t, { type: 'highpass', f: 2600, dur: 0.22, a: 0.004, g: 0.28 }); // 氣流
    const bp = filter('bandpass', 2400, 0.7, gain(1, h.in));
    for (const f of [1170, 1243, 1318, 1402, 1490]) tone(bp, t + rand(0, 0.012), { type: 'sawtooth', f: f * rand(0.99, 1.01), f1: f * 1.07, glide: 0.8, dur: 0.75, hold: 0.12, a: 0.006, g: 0.055 }); // 不協和音簇
    tone(h.in, t, { type: 'square', f: 92, f1: 46, dur: 0.5, g: 0.06 });
    duck(0.35, 0.9, true);
    if (k > 0.6 && A.ctx.currentTime - recT > 40 && Math.random() < 0.55) { recT = A.ctx.currentTime; recSting(pick(['scare1', 'scare3']), 0.55 * k, 3.5); }
  },
  scratch(pos) {
    const h = out(pos, { room: 0.4, ref: 1.6, dur: 3.5, gain: 1.6 });
    if (!h) return;
    const lp = filter('lowpass', 900, 0.7, h.in);
    let t = h.t;
    for (let i = 0, n = pick([2, 3, 4]); i < n; i++) {
      squeal(lp, t, rand(1300, 1900), rand(900, 1300), rand(0.35, 0.8), 0.07, 9, [28, 55]); // 指甲抓過
      burst(lp, t, { buf: 'brown', type: 'lowpass', f: 380, dur: rand(0.3, 0.6), a: 0.1, g: 0.18 }); // 身體拖過夾層
      t += rand(0.5, 0.9);
    }
    if (Math.random() < 0.5) knockAt(lp, t + 0.1, 0.5);
  },
  rattle(pos) {
    const h = out(pos, { room: 0.5, ref: 1.5, dur: 1.4, gain: 1.4 });
    if (!h) return;
    for (let i = 0, n = pick([4, 6, 8]); i < n; i++) metal(h.in, h.t + i * rand(0.05, 0.09), rand(900, 1500), 0.05, 0.06, [1, 2.3, 3.9]);
    burst(h.in, h.t, { type: 'bandpass', f: 600, q: 2, dur: 0.4, a: 0.05, g: 0.08 });
  },
  drip(pos) {
    const h = out(pos, { room: 0.7, hall: 0.2, ref: 0.6, roll: 1.4, maxDist: 16, dur: 0.6, gain: 0.9 });
    if (!h) return;
    tone(h.in, h.t, { f: rand(1300, 1900), f1: rand(600, 800), dur: 0.05, g: 0.05 });
    burst(h.in, h.t, { type: 'bandpass', f: 2600, q: 3, dur: 0.02, g: 0.06 });
  },
  breath(pos) {
    const h = out(pos, { room: 0.2, ref: 0.5, roll: 1.6, maxDist: 8, dur: 2.4, gain: 0.7 });
    if (!h) return;
    burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 800, f1: 1300, q: 1.3, dur: 0.6, a: 0.45, g: 0.08 }); // 吸
    burst(h.in, h.t + 1.1, { buf: 'pink', type: 'bandpass', f: 700, f1: 380, q: 1.2, dur: 0.7, a: 0.15, g: 0.1 }); // 吐
    vocal(h.in, h.t + 1.12, { mode: 'groan', contour: 'groan', f0: rand(62, 74), dur: 0.6, fs: 0.92, q: 6, vows: ['uh', 'u', 'u'], breath: 1.3, fryRate: 18, fryD: 0.8, sub: 0, drive: 2, lp: 1100, gurgle: 0.5, gain: 0.04, jit: 0.04, wob: 0.03, att: 0.1, rel: 0.3, k: 1 });
  },
  crash(pos) {
    const h = out(pos, { room: 0.9, hall: 0.4, ref: 2.5, dur: 2.2, gain: 1.6, prio: 7 });
    if (!h) return;
    const t = h.t;
    burst(h.in, t, { type: 'highpass', f: 1800, dur: 0.05, a: 0.001, g: 0.5 }); // 裂開
    burst(h.in, t, { type: 'lowpass', f: 1400, f1: 200, dur: 0.35, g: 0.55 });
    tone(h.in, t, { f: 90, f1: 40, dur: 0.3, g: 0.4 });
    for (let i = 0; i < 9; i++) metal(h.in, t + Math.pow(Math.random(), 1.5) * 0.6, rand(700, 2400), rand(0.02, 0.05), rand(0.05, 0.14), [1, 2.4, 3.7]); // 格柵/吊架
    for (let i = 0; i < 14; i++) burst(h.in, t + 0.05 + Math.random() * 0.9, { type: 'bandpass', f: rand(1500, 4500), q: 2, dur: 0.02, g: rand(0.03, 0.08) }); // 碎屑
  },
};
const last = {};
export function ambushSfx(kind, pos, k) {
  if (!A.ctx || !K[kind]) return;
  const now = performance.now();
  if (now - (last[kind] ?? -1e9) < 250) return;
  last[kind] = now;
  try { K[kind](pos && Number.isFinite(pos.x) ? { x: pos.x, y: pos.y, z: pos.z } : null, k); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio ambush]', e); }
}
