// 殭屍語音:共振峰(formant)合成。聲門脈衝 + 氣聲噪音 → 喉音嘎吱(vocal fry)調幅 → 三個共振峰帶通 → 飽和 → 包絡。
// 每次呼叫都重新隨機音高曲線、母音路徑、嘎吱節奏,不會聽起來像同一個樣本重播。
import { A, emit, burst, tone, bubble, shaper, gain, filter, rand, pick, curve, duck, baked, playBuf } from './core.js';
import * as SM from './samples.js';

// 母音共振峰(成年男性,Hz)
const VOW = {
  u: [300, 870, 2240], o: [570, 840, 2410], uh: [640, 1190, 2390], a: [730, 1090, 2440],
  ae: [660, 1720, 2410], e: [530, 1840, 2480], i: [270, 2290, 3010], er: [490, 1350, 1690],
};

// 各類型聲紋
const TYPE = {
  walker: { f0: [70, 105], dur: [1.3, 2.4], vow: ['uh', 'o', 'u', 'a', 'er'], fs: 1, q: 6, breath: 0.28, fry: [20, 36], fryD: 0.55, sub: 0.12, body: 0.1, drive: 2.2, lp: 2600, gurgle: 0.08, gain: 0.5, jit: 0.05, wob: 0.03 },
  runner: { f0: [150, 235], dur: [0.5, 1.0], vow: ['a', 'ae', 'e', 'uh'], fs: 1.08, q: 4.5, breath: 0.75, fry: [45, 80], fryD: 0.4, sub: 0, body: 0.1, drive: 4.2, lp: 5600, gurgle: 0, gain: 0.48, jit: 0.1, wob: 0.06 },
  crawler: { f0: [100, 150], dur: [0.9, 1.6], vow: ['u', 'er', 'uh'], fs: 1.02, q: 7, breath: 0.55, fry: [8, 15], fryD: 0.75, sub: 0, body: 0.04, drive: 3, lp: 2800, gurgle: 0.75, gain: 0.5, jit: 0.07, wob: 0.05 },
  bloater: { f0: [52, 72], dur: [1.2, 2.2], vow: ['o', 'u', 'uh'], fs: 0.8, q: 6, breath: 0.3, fry: [11, 19], fryD: 0.6, sub: 0.5, body: 0.4, drive: 2.8, lp: 1300, gurgle: 1, gain: 0.58, jit: 0.05, wob: 0.04 },
  brute: { f0: [41, 60], dur: [1.4, 2.6], vow: ['a', 'o', 'uh'], fs: 0.76, q: 5.5, breath: 0.4, fry: [24, 34], fryD: 0.5, sub: 0.95, body: 0.75, drive: 4, lp: 1700, gurgle: 0.12, gain: 0.45, jit: 0.04, wob: 0.03 },
};

// 各情境的音高輪廓 u∈[0,1]
const CONTOUR = {
  groan: (u, k) => 0.86 + 0.2 * Math.sin(Math.min(1, u / 0.35) * Math.PI * 0.5) - 0.22 * Math.max(0, u - 0.35) * k,
  attack: (u) => (u < 0.15 ? 0.9 + (u / 0.15) * 0.4 : 1.3 - (u - 0.15) * 0.45),
  pain: (u) => 1.45 - 0.5 * Math.sqrt(u),
  die: (u) => (u < 0.1 ? 1 + u : 1.1 - 0.6 * Math.pow((u - 0.1) / 0.9, 0.8)),
  roar: (u) => (u < 0.25 ? 0.8 + (u / 0.25) * 0.55 : u < 0.75 ? 1.35 + 0.05 * Math.sin(u * 30) : 1.35 - (u - 0.75) * 2.2),
  shriek: (u) => (u < 0.2 ? 0.7 + u * 2.2 : 1.14 + 0.25 * Math.sin((u - 0.2) * 9) * (1 - u)),
};

// 聲門波形:諧波以 n^-1.2 衰減,比鋸齒波柔和、有喉音質感
const WAVES = new WeakMap(); // PeriodicWave 屬於建立它的 context(烘焙用的離線 context 要各自建)
function glottal() {
  const w = WAVES.get(A.ctx);
  if (w) return w;
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const a = Math.pow(k, -1.2);
    re[k] = a * 0.35 * (k % 3 === 0 ? -1 : 1);
    im[k] = a * (k % 2 ? 1 : -0.85);
  }
  const pw = A.ctx.createPeriodicWave(re, im);
  WAVES.set(A.ctx, pw);
  return pw;
}

// 解析參數(類型 × 情境 × 隨機)
function spec(type, mode, over = {}) {
  const T = TYPE[type] || TYPE.walker;
  const S = { ...T, mode };
  S.f0 = rand(T.f0[0], T.f0[1]);
  S.dur = rand(T.dur[0], T.dur[1]);
  S.fs = T.fs * rand(0.92, 1.08);
  S.fryRate = rand(T.fry[0], T.fry[1]);
  S.vows = [pick(T.vow), pick(T.vow), pick(T.vow)];
  S.att = 0.12;
  S.rel = 0.3;
  S.k = rand(0.6, 1.4);
  if (mode === 'attack') {
    S.f0 *= rand(1.25, 1.45); S.dur = rand(0.32, 0.6); S.drive *= 1.6; S.breath *= 1.3; S.gain *= 1.25; S.att = 0.04; S.rel = 0.25;
    S.vows = ['a', pick(['a', 'ae', 'uh']), 'uh'];
  } else if (mode === 'pain') {
    S.f0 *= rand(1.4, 1.7); S.dur = rand(0.2, 0.36); S.drive *= 1.3; S.gain *= 1.8; S.att = 0.015; S.rel = 0.45; S.makeup = 5;
    S.vows = [pick(['a', 'ae', 'e']), 'uh', 'uh'];
  } else if (mode === 'die') {
    S.dur = rand(T.dur[0] * 1.1, T.dur[1] * 1.15); S.gurgle = Math.min(1, T.gurgle + 0.45); S.gain *= 1.15; S.att = 0.05; S.rel = 0.5;
    S.vows = [pick(['a', 'uh']), pick(['o', 'uh']), 'u'];
  }
  return Object.assign(S, over);
}

// 核心合成:輸出到 dest,起點 t
export function vocal(dest, t, S) {
  const ctx = A.ctx, dur = S.dur;
  const contour = CONTOUR[S.contour || S.mode] || CONTOUR.groan;
  // 音高曲線:輪廓 × 慢速搖晃 × 隨機漫步抖動
  let w = 0;
  const wobRate = rand(2, 5), wobPh = rand(0, 6);
  const fc = curve(Math.max(32, Math.ceil(dur * 80)), (u) => {
    w = (w + (Math.random() - 0.5) * S.jit) * 0.9;
    return Math.max(18, S.f0 * contour(u, S.k) * (1 + w + Math.sin(u * dur * wobRate * 6.283 + wobPh) * S.wob));
  });
  const end = t + dur + 0.05;
  const mix = gain(1);
  const src = ctx.createOscillator();
  src.setPeriodicWave(glottal());
  src.frequency.setValueCurveAtTime(fc, t, dur);
  src.connect(mix);
  src.start(t);
  src.stop(end);
  if (S.sub > 0) {
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.setValueCurveAtTime(fc.map((f) => f * 0.5), t, dur);
    sub.connect(gain(S.sub, mix));
    sub.start(t);
    sub.stop(end);
  }
  const nz = ctx.createBufferSource();
  nz.buffer = A.noise.pink;
  nz.loop = true;
  nz.connect(filter('highpass', 350, 0.7, gain(S.breath * 2.2, mix)));
  nz.start(t, Math.random() * 3);
  nz.stop(end);

  // 嘎吱調幅(每個週期深度隨機)+ 咕嚕(不規則、會斷續)
  const am = gain(1);
  mix.connect(am);
  const M = Math.max(64, Math.ceil(dur * 500));
  let ph = 0, depth = S.fryD, gph = 0, gdepth = 0;
  const gRate = rand(7, 15);
  const amc = curve(M, (u) => {
    const dt = dur / M;
    ph += dt * S.fryRate * 6.283 * rand(0.85, 1.15);
    if (ph > 6.283) { ph -= 6.283; depth = S.fryD * rand(0.5, 1.2); }
    gph += dt * gRate * 6.283;
    if (gph > 6.283) { gph -= 6.283; gdepth = Math.random() < 0.3 ? 1 : rand(0.2, 0.8); }
    const fry = 1 - depth * (0.5 + 0.5 * Math.cos(ph));
    const gur = 1 - S.gurgle * gdepth * Math.max(0, Math.sin(gph));
    return Math.max(0, fry * gur);
  });
  am.gain.setValueCurveAtTime(amc, t, dur);

  // 共振峰
  const sum = gain(S.makeup ?? 3.2);
  const vs = S.vows.map((v) => VOW[v] || VOW.uh);
  const fg = [1, 0.62, 0.3];
  for (let k = 0; k < 3; k++) {
    const bp = filter('bandpass', vs[0][k] * S.fs, S.q * (1 + k * 0.6));
    bp.frequency.setValueAtTime(vs[0][k] * S.fs, t);
    bp.frequency.linearRampToValueAtTime(vs[1][k] * S.fs * rand(0.95, 1.05), t + dur * 0.5);
    bp.frequency.linearRampToValueAtTime(vs[2][k] * S.fs, t + dur);
    am.connect(bp);
    bp.connect(gain(fg[k], sum));
  }
  am.connect(gain(0.05, sum)); // 少量原始聲源,保留粗糙感
  if (S.body) am.connect(filter('lowpass', 260, 0.7, gain(S.body, sum))); // 胸腔:基頻與次諧波繞過共振峰
  const lp = filter('lowpass', S.lp, 0.8);
  sum.connect(shaper(S.drive, lp));
  // 振幅包絡:起音、呼吸般的起伏、釋放
  const env = gain(1, dest);
  lp.connect(env);
  let sw = 0;
  const ec = curve(Math.max(32, Math.ceil(dur * 60)), (u) => {
    sw = sw * 0.85 + (Math.random() - 0.5) * 0.25;
    const a = Math.min(1, (u * dur) / S.att);
    const r = Math.min(1, ((1 - u) * dur) / S.rel);
    return S.gain * a * a * Math.pow(r, 1.5) * (1 + sw);
  });
  env.gain.setValueCurveAtTime(ec, t, dur);
  // 咕嚕型加上真正的液體氣泡
  if (S.gurgle > 0.4) {
    const n = Math.floor(dur * 14 * S.gurgle);
    for (let i = 0; i < n; i++) bubble(dest, t + rand(0, dur * 0.9), rand(140, 420), S.gain * rand(0.05, 0.14), rand(0.03, 0.07));
  }
  return end;
}


// ---------- 對外:殭屍語音 ----------
// 每種殭屍 × 情境有自己的錄音組(移調讓體型聽得出來:巨屍/腫脹者壓低、奔跑者拉高),與共振峰合成混用增加變化;
// 同一隻殭屍同時只會發一個聲音(新的叫聲切掉舊的,死亡除外),也避免一群殭屍疊成噪音。
const SEMI = { walker: 0, runner: 3, crawler: 1.5, bloater: -3, brute: -5 };
const REF = { brute: 2.4, bloater: 1.9 };
// [樣本 key, 增益, 額外移調]:依情境與類型挑一組(隨機)
const VOX = {
  groan: {
    walker: [['zw.groan', 1, 0], ['z.growl', 0.8, -1]],
    runner: [['z.growl', 0.9, 2], ['z.grunt', 0.9, 3]],
    crawler: [['zc.hiss', 0.9, 0], ['zc.gurgle', 1, 0], ['zw.groan', 0.8, 3]],
    bloater: [['zb.belch', 1, 0], ['zb.gurgle', 1, 0], ['zb.retch', 0.8, 0]],
    brute: [['zx.growl', 1, 0], ['z.growl', 1, -4], ['zw.groan', 0.9, -5]],
  },
  alert: {
    walker: [['z.growl', 1, 0], ['zw.groan', 1, 1.5]],
    runner: [['zr.scream', 1, 0]],
    crawler: [['zc.hiss', 1.1, 0]],
    bloater: [['zb.retch', 1, 0], ['zb.belch', 1, -1]],
    brute: [['zx.roar', 0.9, 0], ['zx.growl', 1.1, 0]],
  },
  attack: {
    walker: [['z.attack', 1, 0], ['z.devour', 0.9, 0]],
    runner: [['zr.attack', 1, 0], ['z.attack', 1, 3]],
    crawler: [['zc.hiss', 1.1, 1], ['z.attack', 0.9, 2]],
    bloater: [['z.attack', 1, -3], ['zb.retch', 1, 0]],
    brute: [['z.attack', 1.1, -5], ['zx.growl', 1.1, 0]],
  },
  pain: {
    walker: [['z.pain', 1, 0], ['z.hit', 0.9, 0], ['z.grunt', 0.9, 0]],
    runner: [['z.pain', 1, 2.5], ['z.hit', 0.9, 3]],
    crawler: [['z.pain', 1, 1.5], ['zc.hiss', 0.8, 2]],
    bloater: [['z.pain', 1, -3], ['zb.gurgle', 0.9, 1]],
    brute: [['z.pain', 1.1, -5], ['z.grunt', 1.1, -4]],
  },
  die: {
    walker: [['z.die', 1, 0]],
    runner: [['z.die', 1, 2.5], ['zr.scream', 0.7, -2]],
    crawler: [['z.die', 1, 1.5], ['zc.gurgle', 1, -1]],
    bloater: [['zb.vomit', 1, 0], ['z.die', 1, -3]],
    brute: [['zx.roar', 1, -2], ['z.die', 1.2, -5]],
  },
};
// 用錄音的機率(其餘用合成)
const MIX = { groan: 0.8, alert: 0.85, attack: 0.75, pain: 0.7, die: 0.8 };
// 各情境的音量(量測後:3 公尺處 低吼 ≈ -27、發現 ≈ -22、攻擊 ≈ -21、痛叫 ≈ -27、死亡 ≈ -24 LUFS),錄音與合成分開校正
const REC_G = { groan: 1.7, alert: 2.2, attack: 2.5, pain: 2.5, die: 1.8 };
// 各類型錄音的音量(巨屍的咆哮錄音本身很猛,要壓;走屍稍微提)
const TYPE_G = { walker: 1.1, runner: 0.75, crawler: 1, bloater: 0.7, brute: 0.45 };
const SYN_G = { groan: 0.5, alert: 0.56, attack: 0.7, pain: 1.1, die: 0.7 };
const busy = new WeakMap(); // 聲源物件 → 目前的語音 handle
function claim(pos, h, mode) {
  if (!pos || typeof pos !== 'object') return;
  const old = busy.get(pos);
  if (old && old !== h && !old.dead && old.mode !== 'die') old.kill();
  if (h) { h.mode = mode; busy.set(pos, h); }
}
// 同一隻殭屍正在死亡/尖嘯/攻擊時,不被低優先的低吼蓋掉
function blocked(pos, prio, mode) {
  if (!pos || typeof pos !== 'object' || !A.ctx) return false;
  const old = busy.get(pos);
  return !!old && !old.dead && old.end > A.ctx.currentTime + 0.1 && (old.mode === 'die' || (old.prio > prio && mode !== 'pain' && mode !== 'die'));
}
function say(type, pos, mode, prio, over) {
  if (blocked(pos, prio, mode)) return null;
  const o = { pos, bus: 'voice', zv: mode, cat: 'voice', prio, room: 0.35, ref: REF[type] ?? 1.6 };
  const list = VOX[mode] && (VOX[mode][type] || VOX[mode].walker);
  if (!over && list && Math.random() < (MIX[mode] ?? 0.6)) {
    const [key, g, semi] = pick(list);
    const h = SM.play(key, { ...o, semi: (SEMI[type] ?? 0) * (key.startsWith(`z${type[0]}.`) ? 0.3 : 1) + semi + rand(-0.7, 0.7), p: 0.4, g: g * (REC_G[mode] ?? 1) * (TYPE_G[type] ?? 1) });
    if (h) { claim(pos, h, mode); return h; }
  }
  const sm = mode === 'alert' ? 'attack' : mode;
  // 頻繁的低吼、痛叫與攻擊吼叫:各類型預烘焙多個變體(不必每次即時合成,一次合成要建 20~60 個節點)
  if (!over && (sm === 'pain' || sm === 'attack' || sm === 'groan')) {
    const set = baked(`v|${type}|${sm}`, VN[sm], VL[sm], (dst, t0) => vocal(dst, t0, spec(type, sm)), 1, 24000);
    if (set) {
      const b = pick(set), r = rand(0.95, 1.05);
      const h = emit({ ...o, dur: b.duration / r });
      if (h) { playBuf(h.in, h.t, b, { rate: r, g: SYN_G[mode] ?? 1 }); claim(pos, h, mode); }
      return h;
    }
  }
  const S = spec(type, sm, over);
  if (mode === 'alert') S.dur *= 1.6;
  S.gain *= SYN_G[mode] ?? 1;
  const h = emit({ ...o, dur: S.dur + 0.2 });
  if (!h) return null;
  vocal(h.in, h.t, S);
  claim(pos, h, mode);
  return h;
}

const VN = { pain: 5, attack: 5, groan: 4 }, VL = { pain: 0.8, attack: 1, groan: 2.9 }; // 變體數、長度
export function prebakeVoices() {
  for (const ty of Object.keys(TYPE)) for (const m of ['pain', 'attack', 'groan']) prebakeSet(ty, m);
}
function prebakeSet(type, m) { baked(`v|${type}|${m}`, VN[m], VL[m], (dst, t0) => vocal(dst, t0, spec(type, m)), 1, 24000, 1); }

export const voices = {
  // 閒置低吼(各類型自己的聲音)
  groan(type, pos) {
    // 舊版呼叫 groan(dist):沒有位置時改成正前方對應距離
    if (typeof type === 'number') {
      const L = A.L;
      return say('walker', { x: L.x - Math.sin(L.yaw) * type, y: 1.6, z: L.z - Math.cos(L.yaw) * type }, 'groan', 1);
    }
    return say(type, pos, 'groan', 2);
  },
  // 發現玩家:走屍低吼轉高、奔跑者尖嘯、爬行者嘶聲、腫脹者乾嘔、巨屍短吼
  alert(type, pos) {
    if (type === 'runner' && Math.random() < 0.5) return voices.shriek(pos);
    return say(type, pos, 'alert', 5);
  },
  attack(type, pos) {
    const h = say(type, pos, 'attack', 5);
    if (h && (type === 'runner' || type === 'brute')) burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1600, q: 0.8, dur: 0.2, a: 0.05, g: 0.25 });
    return h;
  },
  pain(type, pos) {
    // 全自動連發時,同一位置的痛叫不重疊
    const now = A.ctx ? A.ctx.currentTime : 0;
    const recentPain = A.recentPain;
    for (let i = recentPain.length - 1; i >= 0; i--) if (now - recentPain[i].t > 0.35) recentPain.splice(i, 1);
    if (pos && recentPain.some((r) => Math.hypot(r.x - pos.x, r.z - pos.z) < 0.8)) return null;
    if (pos) recentPain.push({ t: now, x: pos.x, z: pos.z });
    return say(type, pos, 'pain', 3);
  },
  die(type, pos) {
    const h = say(type, pos, 'die', 4);
    if (h) {
      // 斷氣時的喉音雜響
      const t = h.t + 0.4 * rand(1, 2);
      burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 500, f1: 220, q: 2, dur: 0.6, a: 0.12, g: 0.1 });
    }
    return h;
  },
  shriek(pos) {
    if (blocked(pos, 6)) return;
    if (Math.random() < 0.7) {
      const h = SM.play('zr.scream', { pos, bus: 'voice', zv: 'shriek', cat: 'voice', prio: 6, room: 0.45, hall: 0.25, ref: 2, p: 0.8, g: 3 });
      if (h) { claim(pos, h, 'shriek'); return; }
    }
    const S = spec('runner', 'groan', {
      contour: 'shriek', f0: rand(470, 640), dur: rand(0.85, 1.15), vows: ['i', 'ae', 'a'], fs: 1.15, q: 3.5, drive: 6, breath: 1.1, fryRate: rand(60, 90), fryD: 0.3, gain: 0.33, lp: 7500, att: 0.06, rel: 0.35, jit: 0.12, wob: 0.05, makeup: 2.4,
    });
    const h = emit({ pos, bus: 'voice', zv: 'shriek', cat: 'voice', prio: 6, dur: S.dur + 0.4, room: 0.45, hall: 0.25, ref: 2 });
    if (!h) return;
    claim(pos, h, 'shriek');
    // 吸氣 → 尖嘯
    burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1800, f1: 3800, q: 1.2, dur: 0.22, a: 0.18, g: 0.18 });
    vocal(h.in, h.t + 0.18, S);
    // 上方再疊一層高八度的破音
    vocal(h.in, h.t + 0.2, { ...S, f0: S.f0 * 2.02, gain: 0.11, drive: 8, vows: ['i', 'e', 'ae'] });
  },
  roar(pos) {
    if (blocked(pos, 7)) return;
    if (Math.random() < 0.8) { // 錄音咆哮 + 合成胸腔共鳴
      const h = SM.play(Math.random() < 0.75 ? 'zx.roar' : 'z.roar', { pos, bus: 'voice', zv: 'roar', cat: 'voice', prio: 7, room: 0.55, hall: 0.45, ref: 4, roll: 0.8, gain: 0.8, g: 1.45, semi: -1, p: 1 });
      if (h) { claim(pos, h, 'roar'); tone(h.in, h.t + 0.1, { f: 38, f1: 30, dur: 1.6, a: 0.4, g: 0.5 }); duck(0.6, 0.8); return; }
    }
    const S = spec('brute', 'groan', {
      contour: 'roar', f0: rand(46, 56), dur: rand(1.7, 2.1), vows: ['o', 'a', 'a'], q: 4, drive: 7, sub: 1.1, breath: 0.9, fryRate: rand(28, 34), fryD: 0.55, gain: 0.85, lp: 3200, att: 0.25, rel: 0.5, makeup: 3.6,
    });
    const h = emit({ pos, bus: 'voice', zv: 'roar', cat: 'voice', prio: 7, dur: S.dur + 0.6, room: 0.55, hall: 0.45, ref: 4, roll: 0.8, gain: 0.41 });
    if (!h) return;
    claim(pos, h, 'roar');
    vocal(h.in, h.t, S);
    vocal(h.in, h.t + 0.03, { ...S, f0: S.f0 * 1.5, gain: 0.3, fs: 0.9, drive: 9, sub: 0 }); // 上層嘶吼
    burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 520, f1: 900, q: 0.9, dur: S.dur * 0.75, a: 0.3, hold: 0.4, g: 0.35 });
    tone(h.in, h.t + 0.1, { f: 38, f1: 30, dur: S.dur, a: 0.4, g: 0.6 }); // 胸腔共鳴
    duck(0.6, 0.8);
  },
  gurgle(pos) {
    if (blocked(pos, 2)) return;
    if (Math.random() < 0.6) { const h = SM.play(pick(['zb.gurgle', 'acid.bubble', 'zb.belch']), { pos, bus: 'voice', zv: 'gurgle', cat: 'voice', prio: 2, room: 0.3, ref: 1.6, g: 0.7, len: rand(1, 1.8), fo: 0.4 }); if (h) { claim(pos, h, 'groan'); return; } }
    const dur = rand(0.8, 1.4);
    const h = emit({ pos, bus: 'voice', zv: 'gurgle', cat: 'voice', prio: 2, dur: dur + 0.2, room: 0.3, ref: 1.6 });
    if (!h) return;
    claim(pos, h, 'groan');
    const n = Math.floor(dur * rand(16, 26));
    for (let i = 0; i < n; i++) bubble(h.in, h.t + rand(0, dur), rand(110, 360), rand(0.08, 0.2), rand(0.03, 0.08));
    burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 300, q: 2, dur: dur * 0.7, a: 0.15, g: 0.35 });
    vocal(h.in, h.t + 0.1, spec('bloater', 'groan', { dur: dur * 0.8, gain: 0.25 }));
  },
};

// 玩家受傷的悶哼(非定位)
export function grunt(dest, t, big = false) {
  vocal(dest, t, {
    mode: 'pain', contour: 'pain', f0: rand(105, 125) * (big ? 0.9 : 1), dur: big ? rand(0.3, 0.4) : rand(0.18, 0.26), fs: 1, q: 5,
    vows: [pick(['uh', 'a']), 'uh', 'er'], breath: 0.5, fryRate: 60, fryD: 0.2, sub: 0, drive: 1.6, lp: 3200, gurgle: 0, gain: big ? 0.42 : 0.3,
    jit: 0.03, wob: 0.01, att: 0.012, rel: 0.12, k: 1,
  });
}
