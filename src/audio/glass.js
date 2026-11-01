import { emit, burst, tone, metal, rand } from './core.js';
import * as S from './samples.js';

// 玻璃聲(physics/penetration.js、physics/glassfx.js 用):
//  crack   子彈打穿、玻璃沒碎:清脆的「啪」+ 高音一叮 + 裂紋擴散的細碎爆裂
//  shatter 舊窗(退火玻璃)整片碎落:錄音(world/glass_break_*)+ 碎片陸續落地的叮噹
//  crumble 強化玻璃崩成小粒:嘩啦的沙沙聲 + 大量細碎聲
//  tinkle  碎片落地;break 大碎片在地上再碎;crunch 踩到地上的碎玻璃(玩家自己的聲音,不定位)
const POS = { x: 0, y: 0, z: 0 };
const at = (p) => { POS.x = p.x; POS.y = p.y; POS.z = p.z; return POS; };
const TINK = [1, 1.47, 2.13];

export function glass(kind, pos, size = 0.5, sprint = false) {
  if (kind === 'crunch') return crunch(size, sprint);
  if (!pos) return;
  const big = kind === 'shatter' || kind === 'crumble';
  const h = emit({ pos: at(pos), cat: 'fx', prio: big ? 2 : 1, room: big ? 0.55 : 0.3, hall: big ? 0.3 : 0, ref: big ? 2.5 : 1.5, dur: big ? 2.2 : 0.6, gain: big ? 2 : 1.2, maxDist: big ? 55 : 30, track: false });
  if (!h) return;
  const t = h.t, d = h.in;
  if (kind === 'crack') {
    burst(d, t, { type: 'highpass', f: 3200, dur: 0.012, a: 0.0004, g: 0.55 }); // 啪
    tone(d, t, { f: 190, f1: 90, dur: 0.035, g: 0.12 });
    metal(d, t + 0.002, rand(3800, 5400), 0.07, rand(0.1, 0.18), TINK);
    for (let i = 0; i < 7; i++) burst(d, t + 0.004 + Math.pow(Math.random(), 1.5) * 0.09, { type: 'bandpass', f: rand(5500, 9500), q: 6, dur: 0.004, g: rand(0.03, 0.07) }); // 裂紋擴散
  } else if (kind === 'shatter') {
    const rec = S.play('glass', { h, g: 0.55 + 0.4 * Math.min(1, size) });
    if (!rec) {
      burst(d, t, { type: 'highpass', f: 2500, dur: 0.035, a: 0.0005, g: 0.6 });
      burst(d, t, { type: 'bandpass', f: 4200, q: 0.7, dur: 0.28, g: 0.35 });
      burst(d, t, { type: 'lowpass', f: 900, f1: 200, dur: 0.06, g: 0.2 });
    }
    for (let i = 0; i < 26; i++) metal(d, t + 0.25 + Math.pow(Math.random(), 1.4) * 1.2, rand(2400, 8000), rand(0.01, 0.035), rand(0.04, 0.2), TINK); // 碎片落地
  } else if (kind === 'crumble') {
    burst(d, t, { type: 'highpass', f: 2800, dur: 0.02, a: 0.0005, g: 0.5 });
    burst(d, t, { buf: 'pink', type: 'highpass', f: 3500, dur: 0.55, a: 0.02, g: 0.22 }); // 嘩啦
    if (!S.play('glass', { h, g: 0.35, rate: 1.25 })) burst(d, t, { type: 'bandpass', f: 5200, q: 0.8, dur: 0.3, g: 0.3 });
    for (let i = 0; i < 46; i++) burst(d, t + 0.05 + Math.pow(Math.random(), 1.2) * 0.9, { type: 'bandpass', f: rand(4500, 10000), q: 5, dur: 0.006, g: rand(0.02, 0.06) }); // 小粒灑落
  } else if (kind === 'break') {
    burst(d, t, { type: 'highpass', f: 3000, dur: 0.01, g: 0.3 });
    for (let i = 0; i < 3; i++) metal(d, t + rand(0, 0.08), rand(2600, 6500), 0.04, rand(0.05, 0.14), TINK);
  } else { // tinkle
    const s = Math.min(1, size * 6 + 0.25);
    metal(d, t, rand(2800, 7000) / (0.6 + s), 0.035 * s, rand(0.04, 0.12), TINK);
    burst(d, t, { type: 'bandpass', f: rand(6000, 9000), q: 4, dur: 0.005, g: 0.04 * s });
  }
}

// 踩碎玻璃:顆粒摩擦 + 幾聲細碎(數量 0..1)
function crunch(n, sprint) {
  const h = emit({ bus: 'sfx', prio: 2, room: 0.15, dur: 0.35, gain: sprint ? 1.1 : 0.8 });
  if (!h) return;
  const t = h.t, d = h.in, k = 0.4 + 0.6 * n;
  burst(d, t, { type: 'bandpass', f: rand(2800, 3800), q: 1.2, dur: 0.06, a: 0.004, g: 0.14 * k });
  burst(d, t + 0.01, { buf: 'pink', type: 'highpass', f: 4000, dur: 0.08, a: 0.01, g: 0.08 * k });
  for (let i = 0; i < 4 + n * 8; i++) burst(d, t + rand(0, 0.09), { type: 'bandpass', f: rand(5000, 10500), q: 6, dur: 0.004, g: rand(0.02, 0.05) * k });
  if (Math.random() < 0.5) metal(d, t + rand(0.01, 0.05), rand(4500, 7500), 0.012 * k, 0.05, TINK);
}
