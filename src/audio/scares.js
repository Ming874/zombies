// 心理驚嚇音:25 種,全部 3D 定位(沒給位置就放在玩家身後/側面的合理距離),
// 音量克制、不刺耳,靠「位置、距離、殘響與留白」嚇人;同一種 1.5 秒內不重複。錄音(第一次用到才載入)與合成混用。
// 大驚嚇(bang/door_slam/glass/scream_far/lights_off/cell_door)偶爾疊一個錄音的配樂刺擊(最多 45 秒一次)。
// kind:whisper child_laugh phone_ring tv_static music_box bang scream_far footsteps_above door_slam glass breath_close crying
//       metal_scrape lights_off heartbeat_spike knock monitor_flatline drawer cell_door coffin_knock radio_voice generator
//       lights_flicker eating horde sting
import { A, emit, gain, filter, burst, tone, metal, rand, pick, curve, around, duck, muffle, playBuf, shaper } from './core.js';
import { vocal } from './voices.js';
import { whisperAt, childLaugh, musicBox, screamAt, phoneBell, knockAt, powerCut } from './ambience.js';
import { squeal } from './foley.js';
import { heartSpike } from './music.js';
import * as SM from './samples.js';
import { sting } from './tracks.js';

// 錄音循環音床截一段來用(電視雜訊、殭屍進食、遠處屍群…);沒載入時回傳 false 並開始載入
function loopSeg(key, h, at, len, g, rate = 1) {
  const L = SM.loop(key);
  if (!L) return false;
  const off = rand(0, Math.max(0, L.b.duration - len * rate - 0.5));
  playBuf(h.in, h.t + at, L.b, { off, len, rate, g: L.g * g, fi: Math.min(0.3, len * 0.2), fo: Math.min(0.8, len * 0.3) });
  return true;
}
let stingT = -99;
function bigSting(p = 0.35) { // 大驚嚇偶爾配一個錄音刺擊
  const n = A.ctx.currentTime;
  if (n - stingT < 45 || Math.random() > p) return;
  stingT = n;
  sting(pick(['scare1', 'scare2', 'scare3']), 0.8, 5);
}

const behind = (a, b, spread = 1.1, dy = 0) => around(rand(a, b), Math.PI + rand(-spread, spread), dy);
const side = (a, b, dy = 0) => around(rand(a, b), rand(-Math.PI, Math.PI), dy);
const out = (pos, o) => emit({ pos, cat: 'scare', bus: 'scare', prio: 4, room: 0.7, hall: 0.4, ref: 1.5, maxDist: 70, ...o });
// 讓定位點在 dur 秒內移動 (dx, dz)(聲道條會跟著)
function glide(p, dx, dz, dur) {
  const n = Math.max(1, Math.round(dur / 0.05)), sx = dx / n, sz = dz / n;
  let i = 0;
  const iv = setInterval(() => { p.x += sx; p.z += sz; if (++i >= n) clearInterval(iv); }, 50);
}

const K = {
  whisper(pos) { // 耳邊低語
    const p = pos || behind(0.5, 0.9, 0.9, 0.05);
    const h = out(p, { room: 0.25, hall: 0.1, ref: 0.5, roll: 1.2, dur: 3.2, gain: 1.5 });
    if (!h) return;
    if (!SM.play('scare.whisper', { h, g: 0.6, off: rand(0, 5), len: rand(2.2, 3), fi: 0.4, fo: 0.8 })) whisperAt(h.in, h.t, rand(1.4, 2.2), 0.32);
    if (Math.random() < 0.4) { // 另一側又一個聲音
      const h2 = out(behind(0.6, 1, 1.5), { room: 0.3, ref: 0.5, dur: 2.6, delay: rand(0.5, 0.9), gain: 1.1 });
      if (h2) whisperAt(h2.in, h2.t, rand(0.8, 1.3), 0.22);
    }
  },
  child_laugh(pos) { // 遠處孩童笑聲,有時再慢一拍、走音地笑一次
    const p = pos || behind(7, 13, 1.3);
    const h = out(p, { room: 0.9, hall: 0.7, ref: 2, dur: 5, gain: 0.8 });
    if (!h) return;
    if (SM.play('scare.laugh', { h, g: 0.7 })) return;
    const end = childLaugh(h.in, h.t, 0.55);
    if (Math.random() < 0.5) {
      const lp = filter('lowpass', 2400, 0.7, gain(0.5, h.in));
      vocal(lp, end + rand(0.6, 1.1), { mode: 'groan', contour: 'pain', f0: rand(300, 340), dur: 0.5, fs: 1.3, q: 5, vows: ['a', 'uh', 'uh'], breath: 0.5, fryRate: 40, fryD: 0.3, sub: 0, drive: 1.6, lp: 4000, gurgle: 0, gain: 0.35, jit: 0.02, wob: 0.06, att: 0.02, rel: 0.25, k: 1, makeup: 2.4 });
    }
  },
  phone_ring(pos) { // 老式電話響兩聲,第三聲響到一半突然停
    const p = pos || side(8, 14, -0.6);
    const h = out(p, { room: 0.8, hall: 0.5, ref: 2.5, dur: 8.5, gain: 2.2 });
    if (!h) return;
    if (SM.play('scare.phone', { h, g: 0.35 })) { SM.play('scare.phone', { h, g: 0.35, at: 3.8 }); SM.play('scare.phone', { h, g: 0.35, at: 7.6, len: 0.5, fo: 0.05 }); return; }
    phoneBell(h.in, h.t, 1.8, 0.11);
    phoneBell(h.in, h.t + 3.8, 1.8, 0.11);
    phoneBell(h.in, h.t + 7.6, 0.35, 0.11);
  },
  tv_static(pos) { // 電視自己打開:雜訊 + 嗡聲 + 模糊人聲 → 映像管「啪」地關掉
    const p = pos || side(4, 9, -0.4);
    const dur = rand(2.6, 3.8);
    const h = out(p, { room: 0.5, hall: 0.2, ref: 1.6, dur: dur + 1, gain: 1.2 });
    if (!h) return;
    const t = h.t;
    if (!loopSeg('tv', h, 0, dur, 1)) {
      const st = burst(h.in, t, { type: 'bandpass', f: 3200, q: 0.4, dur: 0.05, hold: dur, a: 0.01, g: 0.12 });
      st.g.gain.cancelScheduledValues(t);
      st.g.gain.setValueCurveAtTime(curve(Math.ceil(dur * 40), (u) => 0.12 * (u < 0.03 ? u / 0.03 : 1) * (0.6 + 0.4 * Math.random()) * (Math.random() < 0.04 ? 0.2 : 1)), t, dur);
    }
    tone(filter('lowpass', 400, 0.7, h.in), t, { type: 'sawtooth', f: 60, dur: dur, hold: dur * 0.6, a: 0.02, g: 0.025 });
    const vf = filter('bandpass', 1100, 1.5, h.in); // 雜訊後面若有似無的人聲
    vocal(vf, t + dur * 0.35, { mode: 'groan', contour: 'groan', f0: rand(90, 120), dur: dur * 0.4, fs: 1.05, q: 6, vows: ['uh', 'e', 'o'], breath: 0.3, fryRate: 30, fryD: 0.3, sub: 0, drive: 2, lp: 2500, gurgle: 0, gain: 0.18, jit: 0.05, wob: 0.03, att: 0.2, rel: 0.2, k: 1 });
    burst(h.in, t + dur, { type: 'lowpass', f: 900, f1: 150, dur: 0.08, g: 0.25 }); // 關機
    tone(h.in, t + dur, { f: 8200, f1: 6000, dur: 0.5, g: 0.006 });
  },
  music_box(pos) { // 音樂盒:發條快鬆的走音旋律,最後一個音拖長下垂
    const p = pos || side(5, 9, -0.6);
    const h = out(p, { room: 0.7, hall: 0.5, ref: 2, dur: 12, gain: 1.4 });
    if (!h) return;
    if (SM.play('scare.musicbox', { h, g: 0.6, off: rand(0, 8), len: rand(7, 9), fi: 0.2, fo: 1.5 })) return;
    const end = musicBox(h.in, h.t, 9 + ((Math.random() * 4) | 0), 0.05, 0.99);
    const o = A.ctx.createOscillator(), g = gain(0, h.in);
    o.frequency.setValueAtTime(587, end);
    o.frequency.exponentialRampToValueAtTime(540, end + 2);
    g.gain.setValueAtTime(0.0001, end);
    g.gain.linearRampToValueAtTime(0.04, end + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, end + 2.2);
    o.connect(g);
    o.start(end);
    o.stop(end + 2.3);
  },
  bang(pos) { // 重擊:牆/門後被猛力撞了兩三下,最後一下最重
    const p = pos || side(6, 12);
    const h = out(p, { room: 0.9, hall: 0.6, ref: 3, roll: 0.9, dur: 3.5, gain: 0.9 });
    if (!h) return;
    const n = pick([1, 2, 3]);
    let t = h.t;
    for (let i = 0; i < n; i++) {
      const g = i === n - 1 ? 1 : 0.6;
      tone(h.in, t, { f: rand(68, 80), f1: 32, dur: 0.38, g: 0.8 * g });
      burst(h.in, t, { type: 'lowpass', f: 800, f1: 90, dur: 0.32, g: 0.7 * g });
      burst(h.in, t, { type: 'bandpass', f: 320, q: 1.2, dur: 0.08, g: 0.4 * g });
      for (let k = 0; k < 3; k++) metal(h.in, t + rand(0, 0.06), rand(300, 800), 0.04 * g, 0.25);
      t += rand(0.45, 0.7);
    }
    duck(0.65, 0.6);
    bigSting(0.3);
  },
  scream_far(pos) { // 遠處女性尖叫(隔著走廊與牆,悶而長的殘響)
    const p = pos || side(24, 34, rand(-2, 3));
    const h = out(p, { room: 1, hall: 1, ref: 6, roll: 0.8, dur: 4, gain: 0.22 });
    if (!h) return;
    if (!SM.play('scare.scream', { h, g: 0.45 })) screamAt(h.in, h.t, 0.5);
    bigSting(0.25);
  },
  footsteps_above(pos) { // 天花板上方有人慢慢走過(隔樓板:只剩悶的低頻)
    const L = A.L, a = rand(0, Math.PI * 2);
    const p = pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: L.x + Math.cos(a) * 2.5, y: L.y - 1.65 + 4.2, z: L.z + Math.sin(a) * 2.5 };
    const n = pick([6, 8, 10]), gap = rand(0.5, 0.62);
    const h = out(p, { room: 0.6, hall: 0.2, ref: 2.2, dur: n * gap + 1.5, gain: 2.2 });
    if (!h) return;
    glide(p, -Math.cos(a) * 5, -Math.sin(a) * 5, n * gap);
    for (let i = 0; i < n; i++) {
      const t = h.t + i * gap * rand(0.95, 1.05);
      tone(h.in, t, { f: 58, f1: 36, dur: 0.18, g: 0.5 });
      burst(h.in, t, { type: 'lowpass', f: 380, f1: 90, dur: 0.12, g: 0.55 });
      if (Math.random() < 0.3) burst(h.in, t + 0.05, { type: 'bandpass', f: rand(250, 450), q: 10, dur: 0.2, a: 0.1, g: 0.05 }); // 樓板嘎吱
    }
    if (Math.random() < 0.5) burst(h.in, h.t + n * gap + 0.3, { buf: 'brown', type: 'lowpass', f: 300, dur: 0.6, a: 0.25, g: 0.4 }); // 拖動家具
  },
  door_slam(pos) { // 甩門
    const p = pos || side(8, 16);
    const h = out(p, { room: 1, hall: 0.8, ref: 3, roll: 0.9, dur: 3, gain: 0.8 });
    if (!h) return;
    if (SM.play('door.slam', { h, g: 0.9 })) { duck(0.6, 0.5); bigSting(0.3); return; }
    const t = h.t;
    burst(h.in, t - 0.002, { buf: 'pink', type: 'bandpass', f: 500, f1: 1200, q: 1, dur: 0.12, a: 0.1, g: 0.08 }); // 門扇揮過的風
    tone(h.in, t + 0.1, { f: 68, f1: 30, dur: 0.5, g: 0.9 });
    burst(h.in, t + 0.1, { type: 'lowpass', f: 1100, f1: 100, dur: 0.4, g: 0.8 });
    burst(h.in, t + 0.1, { type: 'bandpass', f: 380, q: 1.5, dur: 0.12, g: 0.5 });
    metal(h.in, t + 0.11, 2300, 0.08, 0.1, [1, 2.4]); // 門鎖
    for (let k = 0; k < 4; k++) metal(h.in, t + 0.12 + rand(0, 0.2), rand(400, 900), 0.03, 0.3); // 門框/玻璃震動
    duck(0.6, 0.5);
  },
  glass(pos) { // 玻璃碎裂
    const p = pos || side(6, 12);
    const h = out(p, { room: 0.8, hall: 0.4, ref: 2.5, dur: 3, gain: 2.2 });
    if (!h) return;
    if (SM.play('glass', { h, g: 0.8 })) { bigSting(0.2); return; }
    const t = h.t;
    burst(h.in, t, { type: 'highpass', f: 2500, dur: 0.035, a: 0.0005, g: 0.6 }); // 裂開
    burst(h.in, t, { type: 'bandpass', f: 4200, q: 0.7, dur: 0.28, g: 0.35 });
    burst(h.in, t, { type: 'lowpass', f: 900, f1: 200, dur: 0.06, g: 0.2 });
    for (let i = 0; i < 34; i++) { // 碎片
      const tt = t + Math.pow(Math.random(), 1.8) * 1.1;
      metal(h.in, tt, rand(2200, 8500), rand(0.01, 0.04), rand(0.04, 0.25), [1, 1.47, 2.13]);
    }
    for (let i = 0; i < 8; i++) metal(h.in, t + rand(1.1, 1.9), rand(3000, 7000), 0.012, 0.1, [1, 1.6]); // 晚落下的碎渣
  },
  breath_close(pos) { // 耳後沉重、潮濕的呼吸
    const p = pos || behind(0.4, 0.55, 0.7, -0.05);
    const cyc = pick([2, 3]);
    const h = out(p, { room: 0.15, hall: 0, ref: 0.45, roll: 1.3, dur: cyc * 1.75 + 0.6, gain: 1 });
    if (!h) return;
    if (Math.random() < 0.4 && loopSeg('breathfast', h, 0, cyc * 1.6, 0.35, 0.82)) return; // 錄音的喘息降速降調:不像人
    let t = h.t;
    for (let i = 0; i < cyc; i++) {
      burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 1100, f1: 1800, q: 1.4, dur: 0.45, a: 0.35, g: 0.18 }); // 吸
      const t2 = t + 0.85;
      burst(h.in, t2, { buf: 'pink', type: 'bandpass', f: 900, f1: 480, q: 1.2, dur: 0.6, a: 0.12, g: 0.22 }); // 吐
      vocal(h.in, t2 + 0.02, { mode: 'groan', contour: 'groan', f0: rand(70, 85), dur: 0.55, fs: 0.95, q: 6, vows: ['uh', 'u', 'u'], breath: 1.2, fryRate: 22, fryD: 0.7, sub: 0, drive: 2, lp: 1400, gurgle: 0.3, gain: 0.08, jit: 0.04, wob: 0.03, att: 0.08, rel: 0.25, k: 1 });
      if (Math.random() < 0.5) burst(h.in, t2 + 0.5, { type: 'bandpass', f: 2200, q: 4, dur: 0.012, g: 0.05 }); // 口水
      t += rand(1.6, 1.9);
    }
  },
  crying(pos) { // 某處有人在啜泣
    const p = pos || side(9, 15, rand(-1, 1));
    const n = pick([2, 3]);
    const h = out(p, { room: 1, hall: 0.8, ref: 2, dur: n * 2.2 + 1, gain: 0.36 });
    if (!h) return;
    if (SM.play('scare.cry', { h, g: 0.45 })) return;
    let t = h.t;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < pick([2, 3]); k++) burst(h.in, t + k * 0.11, { buf: 'pink', type: 'bandpass', f: 1500, f1: 2100, q: 1.3, dur: 0.05, a: 0.02, g: 0.12 }); // 抽噎
      const dur = rand(0.9, 1.4);
      vocal(h.in, t + 0.4, { mode: 'groan', contour: 'die', f0: rand(300, 350), dur, fs: 1.22, q: 6, vows: ['uh', 'u', 'u'], breath: 0.75, fryRate: 9, fryD: 0.55, sub: 0, drive: 1.4, lp: 3500, gurgle: 0, gain: 0.3, jit: 0.07, wob: 0.09, att: 0.08, rel: 0.4, k: 1, makeup: 2.6 });
      t += 0.4 + dur + rand(0.4, 0.8);
    }
  },
  metal_scrape(pos) { // 有東西被拖著刮過地面(鐵床、手術台)
    const p = pos ? { x: pos.x, y: pos.y, z: pos.z } : side(8, 16);
    const dur = rand(2.2, 3.4);
    const h = out(p, { room: 0.9, hall: 0.5, ref: 2.5, dur: dur + 1, gain: 2.3 });
    if (!h) return;
    glide(p, rand(-2, 2), rand(-2, 2), dur);
    if (SM.play('scrape', { h, g: 0.5 })) return;
    const f0 = rand(900, 1500);
    squeal(h.in, h.t, f0, f0 * rand(0.6, 0.85), dur, 0.18, 28);
    squeal(h.in, h.t + 0.05, f0 * 1.47, f0 * 1.2, dur * 0.9, 0.08, 30);
    burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 320, dur: dur * 0.5, a: dur * 0.5, g: 0.2 }); // 重物拖地
  },
  lights_off() { // 斷電:斷路器「喀咚」→ 變壓器降頻嗚咽 → 一片死寂(環境電器音停 8~11 秒)
    const h = emit({ bus: 'scare', room: 0.8, hall: 0.6, dur: 3 });
    if (!h) return;
    const t = h.t;
    tone(h.in, t, { f: 62, f1: 30, dur: 0.4, g: 0.6 });
    burst(h.in, t, { type: 'lowpass', f: 700, f1: 120, dur: 0.15, g: 0.5 });
    metal(h.in, t, 1300, 0.05, 0.08, [1, 2.3]);
    const o = A.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t + 0.02);
    o.frequency.exponentialRampToValueAtTime(38, t + 1.7);
    const lp = filter('lowpass', 900, 0.8, h.in);
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.7);
    const g = gain(0, lp);
    g.gain.setValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g);
    o.start(t + 0.02);
    o.stop(t + 1.9);
    for (let i = 0; i < 4; i++) metal(h.in, t + rand(0.1, 0.9), rand(3000, 4500), 0.008, 0.15, [1, 2.4]); // 燈管熄滅
    powerCut(rand(7, 11));
    bigSting(0.4);
  },
  heartbeat_spike() { // 心跳驟升 + 血液衝上耳朵
    const h = emit({ bus: 'scare', dur: 2 });
    if (h) burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 220, dur: 0.4, a: 0.35, g: 0.5 });
    heartSpike(8);
    muffle(0.3, 1.2, 2.5);
  },
};
K.knock = (pos) => { // 額外:敲門三下
  const h = out(pos || side(3, 7), { room: 0.6, dur: 2, gain: 1.4 });
  if (h) for (let i = 0; i < 3; i++) knockAt(h.in, h.t + i * 0.32, 0.6);
};
// ---- 對應場景道具事件的驚嚇(indoor 代理的 props events)----
K.monitor_flatline = (pos) => { // 生理監視器:心跳嗶聲越來越快 → 一聲長長的平線
  const h = out(pos || side(3, 8, -0.3), { room: 0.6, hall: 0.2, ref: 1.8, dur: 8, gain: 1.6 });
  if (!h) return;
  let t = h.t, gap = rand(0.8, 0.95);
  const f = pick([880, 960, 1000]);
  for (let i = 0; i < 7; i++) { tone(h.in, t, { f, dur: 0.09, a: 0.004, g: 0.03 }); t += gap; gap *= 0.82; }
  tone(h.in, t + 0.2, { f, dur: 3.2, hold: 2.8, a: 0.01, g: 0.03 });
};
K.drawer = (pos) => { // 太平間冰櫃抽屜自己滑出來:金屬滾輪刮擦 → 撞到底
  const p = pos ? { x: pos.x, y: pos.y, z: pos.z } : side(4, 9);
  const h = out(p, { room: 0.9, hall: 0.3, ref: 2, dur: 3.5, gain: 1.8 });
  if (!h) return;
  const dur = rand(1.1, 1.6);
  if (!SM.play('scrape', { h, g: 0.35, len: dur, fo: 0.2 })) squeal(h.in, h.t, rand(700, 1000), rand(500, 700), dur, 0.12, 22);
  burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 300, dur: dur * 0.6, a: dur * 0.4, g: 0.15 });
  const te = h.t + dur;
  tone(h.in, te, { f: 75, f1: 35, dur: 0.4, g: 0.5 });
  metal(h.in, te, rand(300, 420), 0.1, 0.9, [1, 1.8, 2.9, 4.2]);
  burst(h.in, te, { type: 'lowpass', f: 1200, f1: 150, dur: 0.25, g: 0.35 });
};
K.cell_door = (pos) => { // 隔離房鐵門猛力撞上 + 鐵鍊/門閂震動
  const h = out(pos || side(5, 12), { room: 1, hall: 0.6, ref: 3, roll: 0.9, dur: 3.5, gain: 0.9 });
  if (!h) return;
  if (!SM.play('door.cell', { h, g: 0.9 })) { tone(h.in, h.t, { f: 70, f1: 30, dur: 0.5, g: 0.8 }); metal(h.in, h.t, rand(180, 240), 0.2, 1.4, [1, 1.8, 2.9, 4.2, 5.6]); }
  for (let i = 0; i < 6; i++) metal(h.in, h.t + 0.08 + i * rand(0.04, 0.08), rand(1800, 3200), 0.02 * (1 - i * 0.12), 0.1, [1, 2.4, 3.7]); // 鐵鍊
  duck(0.65, 0.5);
  bigSting(0.3);
};
K.coffin_knock = (pos) => { // 棺材/冰櫃「裡面」傳來的敲擊與抓刮(悶)
  const h = out(pos || side(3, 7, -0.6), { room: 0.4, ref: 1.6, dur: 4, gain: 1.6 });
  if (!h) return;
  const lp = filter('lowpass', 520, 0.7, h.in);
  let t = h.t;
  for (let i = 0, n = pick([3, 4, 5]); i < n; i++) { knockAt(lp, t, 0.8); t += rand(0.3, 0.55); }
  if (Math.random() < 0.6) squeal(lp, t + 0.4, rand(1400, 2000), rand(1100, 1500), rand(0.6, 1.1), 0.1, 10, [30, 60]); // 指甲抓刮
};
K.radio_voice = (pos) => { // 對講機突然出聲:雜訊 → 扭曲的模糊人聲 → 「喀」斷掉
  const h = out(pos || side(4, 9), { room: 0.4, ref: 1.6, dur: 4, gain: 1.3 });
  if (!h) return;
  const t = h.t, dur = rand(1.6, 2.4);
  burst(h.in, t, { type: 'bandpass', f: 2200, q: 0.6, dur: 0.2, a: 0.01, g: 0.12 });
  const bp = filter('bandpass', 1500, 2.2, h.in), sat = shaper(4, bp);
  for (let i = 0, tt = t + 0.25; i < pick([3, 4]); i++) { const d = rand(0.25, 0.5); vocal(sat, tt, { mode: 'groan', contour: 'groan', f0: rand(110, 150), dur: d, fs: 1.05, q: 6, vows: [pick(['uh', 'e', 'o']), pick(['a', 'i']), 'uh'], breath: 0.6, fryRate: 50, fryD: 0.3, sub: 0, drive: 2, lp: 3000, gurgle: 0, gain: 0.12, jit: 0.05, wob: 0.03, att: 0.03, rel: 0.08, k: 1 }); tt += d + rand(0.05, 0.2); }
  burst(h.in, t + 0.2, { type: 'bandpass', f: 3000, q: 0.5, dur: 0.05, hold: dur, a: 0.02, g: 0.025 });
  burst(h.in, t + dur + 0.3, { type: 'bandpass', f: 2400, q: 3, dur: 0.015, g: 0.2 });
};
K.generator = (pos) => { // 發電機自己發動(地下室)
  const h = out(pos || side(10, 20, -1), { room: 0.8, hall: 0.4, ref: 4, dur: 7.5, gain: 0.9 });
  if (!h) return;
  if (!SM.play('gen.start', { h, g: 0.7 })) { const o = A.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(8, h.t); o.frequency.exponentialRampToValueAtTime(29, h.t + 3); const g = gain(0, filter('lowpass', 200, 1, h.in)); g.gain.setValueAtTime(0.0001, h.t); g.gain.exponentialRampToValueAtTime(0.12, h.t + 1.5); g.gain.setTargetAtTime(0, h.t + 5, 0.5); o.connect(g); o.start(h.t); o.stop(h.t + 7); }
};
K.lights_flicker = (pos) => { // 燈管啟動器喀喀閃爍、終於亮起
  const h = out(pos || around(rand(2, 5), rand(-1, 1), 1.3), { room: 0.4, ref: 1.6, dur: 3, gain: 1.4 });
  if (!h) return;
  if (SM.play('fluoro.on', { h, g: 0.6 })) return;
  for (let i = 0; i < 5; i++) { burst(h.in, h.t + i * rand(0.15, 0.35), { type: 'highpass', f: 3500, dur: 0.015, g: 0.08 }); tone(h.in, h.t + i * rand(0.15, 0.35), { type: 'square', f: 120, dur: 0.06, g: 0.01 }); }
};
K.eating = (pos) => { // 轉角後面有殭屍在進食(濕黏的咀嚼)
  const p = pos || side(4, 9);
  const h = out(p, { cat: 'scare', room: 0.6, ref: 1.4, dur: 7, gain: 1.8 });
  if (!h) return;
  if (!loopSeg('eating', h, 0, rand(4.5, 6.5), 1.2)) for (let i = 0; i < 10; i++) { burst(h.in, h.t + i * rand(0.3, 0.6), { type: 'bandpass', f: rand(600, 1400), q: 2, dur: 0.12, a: 0.02, g: 0.15 }); }
  if (Math.random() < 0.6) SM.play('flesh.tear', { h, g: 0.3, at: rand(1, 3) });
};
K.horde = (pos) => { // 很遠的地方傳來一大群殭屍的呻吟
  const h = out(pos || side(30, 45, rand(-2, 4)), { room: 1, hall: 1, ref: 10, roll: 0.6, maxDist: 90, dur: 9, gain: 0.7 });
  if (!h) return;
  if (!loopSeg('horde', h, 0, rand(6, 8), 0.7)) for (let i = 0; i < 6; i++) vocal(h.in, h.t + rand(0, 4), { mode: 'groan', f0: rand(65, 100), dur: rand(1.8, 3), fs: rand(0.9, 1.05), q: 6, vows: ['uh', 'o', 'u'], breath: 0.3, fryRate: rand(18, 30), fryD: 0.5, sub: 0.1, drive: 2, lp: 1200, gurgle: 0.1, gain: 0.04, jit: 0.05, wob: 0.04, att: 0.4, rel: 0.8, k: 1 });
};
K.sting = () => { stingT = -99; bigSting(1); }; // 只要配樂刺擊
export const SCARE_KINDS = Object.keys(K);

const last = {};
export function scare(kind, pos) {
  const fn = K[kind];
  if (!fn || !A.ctx) return;
  const now = performance.now() / 1000; // 牆鐘時間(離線量測時每個 context 都從 0 開始)
  if (now - (last[kind] ?? -99) < 1.5) return;
  last[kind] = now;
  fn(pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, y: pos.y ?? A.L.y, z: pos.z } : null);
}
