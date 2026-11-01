// 第三波新殭屍的聲音:每種的語音聲紋(包裝 voices.js 的 groan/alert/attack/pain/die)+ 專屬音效。
// 全部用現有錄音移調/截取 + 共振峰合成(voices.vocal)混用;頻繁的低吼/痛叫預烘焙變體,不在遊戲當下即時合成。
// audio.js 只有一行註冊:sfx 物件裡 ...zvoices2(safe)。
//  zScream(pos) 尖叫者的召喚尖叫   zInhale(pos) 蓄力吸氣   zDaze(k) 本機玩家暈眩(耳鳴 + 悶音)
//  zBlade(pos, kind) 刀刃:0 互刮預警 / 1 揮砍   zBreath(pos, type) 喘息   zCrackle(pos) 焦屍的火燒劈啪   zSizzle(pos) 燒傷
//  zRespirator(pos) 防毒面具呼吸   zMaskHit(pos) 打中面具   zCharge(pos) 束縛病患衝撞的狂叫   zGlass(pos) 撞破玻璃
//  zHiss(pos, k) 潛行者嘶聲   zSkitter(pos, ceil) 潛行者爬行的手指敲擊聲
import { A, emit, burst, tone, metal, rand, pick, duck, muffle, baked, playBuf } from './core.js';
import { voices, vocal } from './voices.js';
import { zStep } from './steps.js';
import * as SM from './samples.js';
import { sting } from './tracks.js';

// 各新類型的聲紋(同 voices.js TYPE 欄位)與錄音替代(移調的舊錄音)
const TYPE = {
  screamer: { f0: [170, 260], dur: [1.0, 1.8], vow: ['i', 'e', 'ae'], fs: 1.12, q: 4, breath: 1.15, fry: [50, 80], fryD: 0.45, sub: 0, body: 0.02, drive: 3.4, lp: 6200, gurgle: 0.15, gain: 0.42, jit: 0.12, wob: 0.07 },
  stalker: { f0: [120, 180], dur: [0.6, 1.2], vow: ['i', 'er', 'u'], fs: 1.1, q: 6, breath: 1.4, fry: [9, 14], fryD: 0.9, sub: 0, body: 0, drive: 3, lp: 5200, gurgle: 0.3, gain: 0.4, jit: 0.1, wob: 0.06 },
  surgeon: { f0: [80, 120], dur: [1.1, 2.0], vow: ['u', 'uh', 'o', 'er'], fs: 0.96, q: 6.5, breath: 0.65, fry: [14, 24], fryD: 0.7, sub: 0.1, body: 0.12, drive: 2.6, lp: 2400, gurgle: 0.65, gain: 0.48, jit: 0.06, wob: 0.04 },
  burned: { f0: [65, 95], dur: [1.0, 1.9], vow: ['a', 'uh', 'er'], fs: 0.95, q: 4.5, breath: 1.25, fry: [24, 40], fryD: 0.8, sub: 0.15, body: 0.15, drive: 5.5, lp: 2100, gurgle: 0.25, gain: 0.46, jit: 0.08, wob: 0.05 },
  hazmat: { f0: [72, 98], dur: [1.2, 2.2], vow: ['o', 'u', 'uh'], fs: 0.9, q: 7, breath: 0.5, fry: [18, 28], fryD: 0.55, sub: 0.3, body: 0.3, drive: 2.4, lp: 900, gurgle: 0.05, gain: 0.55, jit: 0.04, wob: 0.03 },
  pursuer: { f0: [48, 66], dur: [1.2, 2.2], vow: ['o', 'u', 'uh'], fs: 0.82, q: 6, breath: 0.9, fry: [16, 26], fryD: 0.7, sub: 0.7, body: 0.5, drive: 4.5, lp: 1500, gurgle: 0.2, gain: 0.5, jit: 0.04, wob: 0.03 },
  straitjacket: { f0: [140, 210], dur: [0.6, 1.2], vow: ['a', 'ae', 'uh'], fs: 1.04, q: 5, breath: 0.6, fry: [30, 50], fryD: 0.35, sub: 0, body: 0.05, drive: 3.2, lp: 4200, gurgle: 0, gain: 0.46, jit: 0.1, wob: 0.08 },
};
// 合成一句:束縛病患的「尖笑」= 一串短促的 ha(音高逐漸下降);其他直接用共振峰合成
function voc(dst, t, S) {
  if (!S.laugh) return vocal(dst, t, S);
  const n = 4 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) vocal(dst, t + i * 0.15, { ...S, dur: 0.11, f0: S.f0 * (1.15 - i * 0.05), contour: 'attack', att: 0.01, rel: 0.06, vows: ['a', 'a', 'uh'] });
  return t + n * 0.15;
}
function spec(type, mode) {
  const T = TYPE[type];
  const S = { ...T, mode, f0: rand(T.f0[0], T.f0[1]), dur: rand(T.dur[0], T.dur[1]), fs: T.fs * rand(0.93, 1.07), fryRate: rand(T.fry[0], T.fry[1]), vows: [pick(T.vow), pick(T.vow), pick(T.vow)], att: 0.1, rel: 0.3, k: rand(0.6, 1.4) };
  if (type === 'screamer' && mode === 'groan') S.contour = 'shriek'; // 尖細的嗚咽
  if (type === 'straitjacket' && mode === 'groan' && Math.random() < 0.6) S.laugh = 1;
  if (type === 'stalker') { S.breath *= 1.4; S.gain *= 0.8; }
  if (mode === 'attack') { S.f0 *= rand(1.25, 1.5); S.dur = rand(0.32, 0.6); S.drive *= 1.6; S.breath *= 1.3; S.gain *= 1.25; S.att = 0.03; S.rel = 0.22; S.vows = ['a', pick(['a', 'ae', 'i']), 'uh']; }
  else if (mode === 'pain') { S.f0 *= rand(1.4, 1.8); S.dur = rand(0.2, 0.36); S.drive *= 1.3; S.gain *= 1.8; S.att = 0.015; S.rel = 0.45; S.makeup = 5; S.vows = [pick(['a', 'ae', 'e']), 'uh', 'uh']; S.contour = 'pain'; }
  else if (mode === 'die') { S.dur *= 1.15; S.gurgle = Math.min(1, S.gurgle + 0.5); S.gain *= 1.1; S.att = 0.05; S.rel = 0.5; S.vows = [pick(['a', 'uh']), 'o', 'u']; S.contour = 'die'; }
  return S;
}
// 錄音:[key, 增益, 移調]
const VOX = {
  screamer: { groan: [['zr.scream', 0.35, 5], ['zc.hiss', 0.8, 4]], alert: [['zr.scream', 0.9, 4]], attack: [['zr.attack', 1, 4], ['zr.scream', 0.6, 3]], pain: [['z.pain', 1, 5]], die: [['zr.scream', 0.8, 1], ['z.die', 1, 4]] },
  stalker: { groan: [['zc.hiss', 1, 2], ['zc.hiss', 1, -2]], alert: [['zc.hiss', 1.2, 0]], attack: [['zr.attack', 1, -2], ['zc.hiss', 1.2, 3]], pain: [['zc.hiss', 1, 5], ['z.pain', 0.9, 3]], die: [['zc.gurgle', 1, 1], ['z.die', 1, 2]] },
  surgeon: { groan: [['zc.gurgle', 1, -1], ['zw.groan', 0.9, -1]], alert: [['z.growl', 1, -1]], attack: [['z.attack', 1, 0], ['zr.attack', 0.9, -2]], pain: [['z.pain', 1, -1]], die: [['z.die', 1, -1], ['zc.gurgle', 1, -2]] },
  burned: { groan: [['zw.groan', 0.9, -2], ['z.growl', 0.9, -3]], alert: [['z.growl', 1, -2]], attack: [['z.attack', 1, -2]], pain: [['z.pain', 1, -2], ['z.hit', 1, -1]], die: [['z.die', 1, -3]] },
  hazmat: { groan: [['z.growl', 0.8, -3]], alert: [['zx.growl', 0.9, 2]], attack: [['z.attack', 1, -3]], pain: [['z.grunt', 1, -2]], die: [['z.die', 1, -3]] },
  pursuer: { groan: [['zx.growl', 1, -2], ['z.growl', 1, -6]], alert: [['zx.roar', 0.9, -3]], attack: [['zx.roar', 1, -1], ['z.attack', 1.1, -6]], pain: [['z.grunt', 1, -5]], die: [['zx.roar', 1, -4]] },
  straitjacket: { groan: [['z.grunt', 0.9, 2]], alert: [['zr.scream', 0.7, 0]], attack: [['z.grunt', 1.1, 1], ['z.attack', 1, 1]], pain: [['z.pain', 1, 1]], die: [['z.die', 1, 1]] },
};
const MIX = { groan: 0.5, alert: 0.65, attack: 0.65, pain: 0.6, die: 0.75 };
const REC_G = { groan: 1.6, alert: 2.1, attack: 2.4, pain: 2.4, die: 1.8 };
const SYN_G = { groan: 0.55, alert: 0.6, attack: 0.72, pain: 1.1, die: 0.72 };
const PRIO = { groan: 2, alert: 5, attack: 5, pain: 3, die: 4 };
const busy = new WeakMap();
let prebaked = false;
const VN = { pain: 4, attack: 4, groan: 3 }, VL = { pain: 0.8, attack: 1, groan: 2.4 };

// 合成的音色依類型加層(悶在面具後、呼吸嘶聲…)
function synth(h, type, mode) {
  const S = spec(type, mode);
  S.gain *= SYN_G[mode] ?? 1;
  if (mode === 'alert') S.dur *= 1.4;
  voc(h.in, h.t, S);
  if (type === 'hazmat') burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1800, q: 1.5, dur: S.dur * 0.8, a: 0.1, g: 0.06 });
  if (type === 'stalker') burst(h.in, h.t, { buf: 'white', type: 'highpass', f: 3500, q: 0.7, dur: S.dur, a: 0.05, g: 0.08 });
  return S.dur;
}
function say(type, pos, mode) {
  if (!A.ctx) return null;
  const old = pos && typeof pos === 'object' ? busy.get(pos) : null;
  if (old && !old.dead && old.end > A.ctx.currentTime + 0.1 && (old.mode === 'die' || (old.prio > PRIO[mode] && mode !== 'pain' && mode !== 'die'))) return null;
  const o = { pos, bus: 'voice', zv: mode, cat: 'voice', prio: PRIO[mode], room: 0.35, ref: type === 'hazmat' ? 1.9 : 1.6 };
  let h = null;
  const list = VOX[type][mode];
  if (list && Math.random() < MIX[mode]) {
    const [key, g, semi] = pick(list);
    h = SM.play(key, { ...o, semi: semi + rand(-0.6, 0.6), p: 0.4, g: g * REC_G[mode] * (type === 'hazmat' ? 0.7 : 1) });
  }
  if (!h && (mode === 'pain' || mode === 'attack' || mode === 'groan')) {
    if (!prebaked) { prebaked = true; prebakeVoices2(); }
    const set = baked(`v2|${type}|${mode}`, VN[mode], VL[mode], (dst, t0) => voc(dst, t0, spec(type, mode)), 1, 24000);
    if (set) {
      const b = pick(set), r = rand(0.95, 1.05);
      h = emit({ ...o, dur: b.duration / r });
      if (h) playBuf(h.in, h.t, b, { rate: r, g: SYN_G[mode] ?? 1 });
    }
  }
  if (!h) {
    h = emit({ ...o, dur: TYPE[type].dur[1] * 1.6 + 0.3 });
    if (h) synth(h, type, mode);
  }
  if (!h) return null;
  if (old && old !== h && !old.dead && old.mode !== 'die') old.kill();
  h.mode = mode;
  if (pos && typeof pos === 'object') busy.set(pos, h);
  // 類型的附加層
  if (type === 'hazmat' && mode !== 'pain') respir(h, 0.4);
  if (type === 'burned' && mode === 'groan') crackleOn(h.in, h.t, 0.6);
  return h;
}

// ---------- 包裝 voices.js:新類型走這裡,其他照舊 ----------
for (const m of ['groan', 'alert', 'attack', 'pain', 'die']) {
  const orig = voices[m];
  voices[m] = (type, pos) => (TYPE[type] ? say(type, pos, m) : orig(type, pos));
}
export function prebakeVoices2() {
  if (!A.ctx) return;
  for (const ty in TYPE) for (const m of ['pain', 'attack', 'groan']) baked(`v2|${ty}|${m}`, VN[m], VL[m], (dst, t0) => voc(dst, t0, spec(ty, m)), 1, 24000, 1);
}

// ---------- 音效層 ----------
function crackleOn(dest, t, dur, g = 1) {
  const n = Math.floor(dur * rand(14, 26));
  for (let i = 0; i < n; i++) burst(dest, t + rand(0, dur), { buf: 'white', type: 'bandpass', f: rand(1500, 6000), q: 2, dur: rand(0.004, 0.02), a: 0.0005, g: rand(0.08, 0.35) * g });
  burst(dest, t, { buf: 'brown', type: 'lowpass', f: 400, q: 0.7, dur, a: 0.1, g: 0.18 * g }); // 低沉的燃燒聲
}
function respir(h, at = 0) {
  const t = h.t + at;
  burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 1400, f1: 2600, glide: 0.8, q: 2.5, dur: 0.75, a: 0.25, g: 0.22 }); // 吸氣(閥門尖細)
  const ex = burst(h.in, t + 1.05, { buf: 'pink', type: 'bandpass', f: 900, f1: 600, glide: 0.8, q: 1.8, dur: 0.8, a: 0.05, g: 0.3 }); // 吐氣(閥門拍動)
  const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
  lfo.frequency.value = rand(22, 30); lg.gain.value = 0.12;
  lfo.connect(lg); lg.connect(ex.g.gain);
  lfo.start(t + 1.05); lfo.stop(t + 1.95);
}

export function zvoices2(safe) {
  return {
    zScream: safe((pos) => {
      const h = emit({ pos, bus: 'voice', zv: 'scream', cat: 'voice', prio: 7, dur: 2.2, room: 0.5, hall: 0.4, ref: 3.5, maxDist: 60 });
      if (!h) return;
      busy.get(pos)?.kill?.();
      h.mode = 'die'; busy.set(pos, h); // 尖叫期間不被別的叫聲切掉
      SM.play('zr.scream', { h, semi: 5, p: 0.3, g: 2.2 });
      SM.play('zr.scream', { h, semi: -2, p: 0.3, g: 1.4, at: 0.05 });
      const S = { ...spec('screamer', 'groan'), contour: 'shriek', f0: rand(620, 820), dur: rand(1.5, 1.8), vows: ['i', 'ae', 'i'], fs: 1.25, q: 3, drive: 7, breath: 1.3, fryRate: rand(70, 100), fryD: 0.25, gain: 0.38, lp: 8000, att: 0.05, rel: 0.5, makeup: 2.4 };
      vocal(h.in, h.t, S);
      vocal(h.in, h.t + 0.02, { ...S, f0: S.f0 * 1.51, gain: 0.14, drive: 9, vows: ['i', 'e', 'i'] }); // 不和諧的上層
      vocal(h.in, h.t + 0.04, { ...S, f0: S.f0 * 0.5, gain: 0.12, drive: 5, vows: ['a', 'ae', 'a'] });
      duck(0.45, 1.2, true);
    }),
    zInhale: safe((pos) => {
      const h = emit({ pos, bus: 'voice', zv: 'pain', cat: 'voice', prio: 6, dur: 0.8, room: 0.3, ref: 2 });
      if (h) burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 900, f1: 3200, glide: 0.6, q: 1.6, dur: 0.5, a: 0.35, g: 0.5 });
    }),
    zDaze: safe((k = 1) => {
      muffle(0.55 + 0.35 * k, 0.5 + k, 2.4);
      const h = emit({ bus: 'sfx', prio: 8, dur: 3.2, nocap: true });
      if (h) { tone(h.in, h.t, { f: rand(5200, 6400), dur: 2.8, a: 0.04, g: 0.05 * k }); tone(h.in, h.t, { f: 3100, dur: 1.8, a: 0.04, g: 0.02 * k }); }
    }),
    zBlade: safe((pos, kind = 0) => {
      const h = emit({ pos, cat: 'fx', prio: kind ? 4 : 3, dur: 0.9, room: 0.25, ref: 1.4 });
      if (!h) return;
      if (kind) { // 揮砍:破空 + 金屬輕響
        if (!SM.play('knife.swing', { h, semi: -2, g: 1.4 })) burst(h.in, h.t, { buf: 'white', type: 'bandpass', f: 2600, f1: 900, q: 1.4, dur: 0.18, a: 0.03, g: 0.5 });
        metal(h.in, h.t + 0.05, rand(2400, 3200), 0.06, 0.25);
      } else { // 兩片刀刃互刮
        if (!SM.play('scrape', { h, semi: 7, g: 0.8, len: 0.7, fo: 0.2 })) burst(h.in, h.t, { buf: 'white', type: 'bandpass', f: 4200, f1: 6800, glide: 0.5, q: 6, dur: 0.6, a: 0.05, g: 0.35 });
        metal(h.in, h.t, rand(1800, 2400), 0.05, 0.6, [1, 2.4, 3.9, 6.2]);
      }
    }),
    zBreath: safe((pos, type) => {
      const h = emit({ pos, bus: 'voice', zv: 'breath', cat: 'voice', prio: 2, dur: 1.4, room: 0.3, ref: 1.4 });
      if (!h) return;
      for (let i = 0; i < 3; i++) burst(h.in, h.t + i * 0.42, { buf: 'pink', type: 'bandpass', f: i % 2 ? 700 : 1100, q: 1.2, dur: 0.3, a: 0.08, g: type === 'surgeon' ? 0.3 : 0.22 });
    }),
    zCrackle: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 1, dur: 0.8, room: 0.15, ref: 1.2, maxDist: 16 });
      if (h) crackleOn(h.in, h.t, rand(0.35, 0.6), 0.8);
    }),
    zSizzle: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 5, dur: 0.8, room: 0.1, ref: 1.5 });
      if (!h) return;
      if (!SM.play('acid.sizzle', { h, g: 1.2, semi: -3 })) burst(h.in, h.t, { buf: 'white', type: 'highpass', f: 3000, q: 0.7, dur: 0.6, a: 0.01, g: 0.4 });
      crackleOn(h.in, h.t, 0.3, 1.2);
    }),
    zRespirator: safe((pos) => {
      const h = emit({ pos, bus: 'voice', zv: 'breath', cat: 'voice', prio: 2, dur: 2.2, room: 0.3, ref: 1.6, maxDist: 28 });
      if (h) respir(h);
    }),
    zMaskHit: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 5, dur: 0.6, room: 0.2, ref: 1.8 });
      if (!h) return;
      if (!SM.play('glass', { h, semi: 4, g: 0.7, len: 0.35, fo: 0.1 })) burst(h.in, h.t, { buf: 'white', type: 'highpass', f: 4000, q: 1, dur: 0.15, a: 0.002, g: 0.5 });
      burst(h.in, h.t + 0.02, { buf: 'pink', type: 'bandpass', f: 2500, q: 1, dur: 0.5, a: 0.01, g: 0.25 }); // 濾罐漏氣
    }),
    zCharge: safe((pos) => {
      const h = emit({ pos, bus: 'voice', zv: 'attack', cat: 'voice', prio: 6, dur: 1.4, room: 0.4, hall: 0.2, ref: 2.4 });
      if (!h) return;
      if (!SM.play('zr.scream', { h, semi: -1, g: 1.8 })) voc(h.in, h.t, { ...spec('straitjacket', 'attack'), laugh: 1 });
    }),
    zGlass: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 6, dur: 1.2, room: 0.4, ref: 2.5 });
      if (!h) return;
      if (!SM.play('glass', { h, g: 1.6 })) { burst(h.in, h.t, { buf: 'white', type: 'highpass', f: 3000, q: 0.8, dur: 0.5, a: 0.002, g: 0.6 }); for (let i = 0; i < 8; i++) metal(h.in, h.t + rand(0, 0.4), rand(3000, 6000), 0.05, 0.12); }
    }),
    zHiss: safe((pos, k = 1) => {
      const h = emit({ pos, bus: 'voice', zv: 'pain', cat: 'voice', prio: 5, dur: 1.0, room: 0.3, ref: 2 });
      if (!h) return;
      if (!SM.play('zc.hiss', { h, semi: 3 + k * 2, g: 1.6 + k })) burst(h.in, h.t, { buf: 'white', type: 'bandpass', f: 4500, q: 0.9, dur: 0.7, a: 0.03, g: 0.4 + k * 0.3 });
      if (k) vocal(h.in, h.t + 0.05, { ...spec('stalker', 'attack'), contour: 'shriek', f0: rand(380, 480), dur: 0.5, gain: 0.25 });
    }),
    zSkitter: safe((pos, ceil = false) => {
      const h = emit({ pos, cat: 'step', prio: 2, dur: 0.4, room: 0.15, ref: 1.3, maxDist: 20 });
      if (!h) return;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) burst(h.in, h.t + i * rand(0.03, 0.07), { buf: 'white', type: 'bandpass', f: ceil ? rand(1800, 2600) : rand(1200, 2200), q: 3, dur: 0.02, a: 0.001, g: rand(0.25, 0.5) });
    }),
    // ---- 追逐戰(src/zombies/chase.js) ----
    // 開始:刺擊配樂 + 世界壓低;結束:on = false(只做淡出用的小音)
    zChase: safe((on = true) => {
      if (on) { sting(pick(['scare1', 'scare3']), 1.1, 6); duck(0.5, 1.5, true); }
      else { const h = emit({ bus: 'sfx', prio: 4, dur: 2.5, nocap: true }); if (h) tone(h.in, h.t, { f: 98, f1: 55, dur: 2.2, a: 0.3, g: 0.08 }); }
    }),
    // 心跳(非定位;k 0..1 越大越響、越急)
    zHeart: safe((k = 1) => {
      const h = emit({ bus: 'sfx', prio: 6, dur: 0.8, nocap: true });
      if (!h) return;
      if (!SM.play('scare.heart', { h, g: 0.35 + 0.65 * k, len: 0.55, fo: 0.15 })) { tone(h.in, h.t, { f: 52, f1: 40, dur: 0.16, a: 0.008, g: 0.5 * k }); tone(h.in, h.t + 0.2, { f: 48, f1: 38, dur: 0.2, a: 0.008, g: 0.35 * k }); }
    }),
    // 安全點的指引音:緊急出口那種短促的雙音(定位,隔牆會悶)
    zBeacon: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 5, dur: 0.6, room: 0.3, ref: 3, maxDist: 70 });
      if (!h) return;
      tone(h.in, h.t, { f: 1318, dur: 0.09, a: 0.004, g: 0.22, type: 'triangle' });
      tone(h.in, h.t + 0.13, { f: 1760, dur: 0.12, a: 0.004, g: 0.2, type: 'triangle' });
    }),
    // 被抓:撲擊的悶響 + 骨頭
    zGrab: safe((pos) => {
      const h = emit({ pos, cat: 'fx', prio: 8, dur: 1.2, room: 0.3, ref: 2 });
      if (!h) return;
      if (!SM.play('body.heavy', { h, g: 1.3 })) burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 300, q: 0.7, dur: 0.4, a: 0.005, g: 0.9 });
      SM.play('bite.bone', { h, g: 1.1, at: 0.08 });
    }),
    // 潛行者沒有一般腳步聲(由 zSkitter 處理)
    zStep: safe((type, pos, surface) => { if (type !== 'stalker') zStep(type, pos, surface); }),
  };
}
