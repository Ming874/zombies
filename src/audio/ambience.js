// 區域環境音:依區域 mood 平滑切換的環境音床(合成常駐層 + 錄音音床 + 隨機定位事件)、依區域實際尺寸算出的殘響空間(rooms.js),
// 定位循環音(發電機、電視雜訊、故障燈管、監視器、電話…,依距離自動啟停,遠的不佔 CPU)、斷電效果。
// 錄音音床(醫院空調底噪、日光燈嗡聲、地下室滴水、戶外風聲…)第一次用到才載入,載好前由合成層撐場,載好後淡入、合成層退後。
// 沒有人呼叫 setZone 時,若有 World(或 levels.js)就依聆聽者位置自動判斷區域。
import { radioNext } from './folk.js';
import { A, onTick, emit, gain, filter, burst, tone, metal, bubble, rand, pick, clamp, curve, setSpace, around, distTo, levelOf, playBuf } from './core.js';
import { vocal } from './voices.js';
import * as SM from './samples.js';
import { parseLayout } from '../map/levels.js';
import { spaceForZone, THEME_SPACE } from './rooms.js';

const ctxNow = () => A.ctx.currentTime;

// ---------- 常駐層(合成) ----------
function noise(kind = 'pink') {
  const s = A.ctx.createBufferSource();
  s.buffer = A.noise[kind];
  s.loop = true;
  s.start(ctxNow(), Math.random() * 3);
  return s;
}
function osc(type, f, dest) {
  const o = A.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  if (dest) o.connect(dest);
  o.start();
  return o;
}
function lfo(f, depth, param) { return osc('sine', f, gain(depth, param)); }
// 隨機慢速起伏(陣風、水波):每次 tick 給一個新目標
function wander(param, lo, hi, tmin, tmax) { return { param, lo, hi, tmin, tmax, next: 0 }; }

// 錄音音床:解碼好的循環緩衝(單聲道)用兩個不同起點的音源左右分開 → 去相關的立體聲寬度;還沒載入時每次 tick 檢查,載好才開始並淡入
function recBed(key, out, wide = 0.7) {
  const g = gain(0, out), L = { srcs: [], started: false };
  L.ev = (now, lay) => {
    if (L.started) { if (lay) lay.started = true; return; }
    const b = SM.loop(key);
    if (!b) return;
    L.started = true;
    if (lay) lay.started = true;
    for (const pan of [-wide, wide]) {
      const s = A.ctx.createBufferSource();
      s.buffer = b.b; s.loop = true;
      s.playbackRate.value = rand(0.985, 1.015);
      const p = A.ctx.createStereoPanner();
      p.pan.value = pan;
      s.connect(p); p.connect(g);
      s.start(now, rand(0, b.b.duration));
      L.srcs.push(s);
    }
    g.gain.setTargetAtTime(b.g, now, 1.5);
  };
  L.rec = key;
  return L;
}
// 火焰劈啪:直接產生一段循環緩衝(不用每次 tick 建節點)
let CRACK = null;
function crackleBuf() {
  if (CRACK && CRACK.ctx === A.ctx) return CRACK.b;
  const sr = 24000, len = sr * 4, b = A.ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  for (let k = 0; k < 110; k++) {
    const i0 = (Math.random() * len) | 0, a = rand(0.05, 0.4) * (Math.random() < 0.08 ? 2.5 : 1), m = (sr * rand(0.001, 0.006)) | 0;
    let y = 0;
    for (let i = 0; i < m && i0 + i < len; i++) { y += 0.6 * (Math.random() * 2 - 1 - y); d[i0 + i] += y * a * Math.exp(-i / (m * 0.25)); }
  }
  CRACK = { ctx: A.ctx, b };
  return b;
}
function crackle(dest, g = 1) {
  const s = A.ctx.createBufferSource();
  s.buffer = crackleBuf(); s.loop = true; s.playbackRate.value = rand(0.9, 1.1);
  s.connect(filter('highpass', 1200, 0.6, gain(g, dest)));
  s.start(A.ctx.currentTime, rand(0, 4));
  return s;
}

// build(out) → { srcs:[要 stop 的音源], w:[wander], ev?(now) 層內排程 }
const LAYERS = {
  r_roomtone(out) { return recBed('roomtone', out); },
  r_hum(out) { return recBed('hum', out, 0.4); },
  r_buzzbad(out) { return recBed('buzzbad', out, 0.4); },
  r_flicker(out) { return recBed('flicker', out, 0.3); },
  r_drips(out) { return recBed('drips', out, 0.8); },
  r_faucet(out) { return recBed('faucet', out, 0.3); },
  r_wind(out) { return recBed('wind', out, 0.8); },
  r_howl(out) { return recBed('howl', out, 0.8); },
  r_graveyard(out) { return recBed('graveyard', out, 0.8); },
  r_generator(out) { return recBed('generator', out, 0.5); },
  r_ac(out) { return recBed('ac', out, 0.5); },
  r_screams(out) { return recBed('screams', out, 0.9); },
  r_horde(out) { return recBed('horde', out, 0.9); },
  hum(out) { // 日光燈管 120Hz 嗡鳴(台灣 60Hz 市電)+ 安定器的嘶嘶
    const o = osc('sawtooth', 120);
    o.connect(filter('lowpass', 800, 0.7, filter('highpass', 100, 0.7, gain(0.011, out))));
    const n = noise('white');
    n.connect(filter('highpass', 6500, 0.7, gain(0.0016, out)));
    const g2 = gain(0.004, out);
    const o2 = osc('square', 120);
    o2.connect(filter('bandpass', 2600, 2, g2));
    return { srcs: [o, n, o2], w: [wander(g2.gain, 0.0005, 0.006, 0.3, 2)] };
  },
  buzz(out) { // 緊急燈/老舊鎮流器的粗糙蜂鳴
    const o = osc('square', 120);
    const g = gain(0.006, out);
    o.connect(filter('bandpass', 1500, 1.4, g));
    const o2 = osc('sawtooth', 240);
    o2.connect(filter('lowpass', 500, 0.7, gain(0.006, out)));
    return { srcs: [o, o2], w: [wander(g.gain, 0.002, 0.01, 0.15, 1)] };
  },
  whine(out) { // 冷白日光燈的高頻電子嘯叫(很小聲)
    const o = osc('sine', 7350), o2 = osc('sine', 7395);
    const g = gain(0.0012, out);
    o.connect(g); o2.connect(g);
    lfo(0.11, 25, o.frequency);
    return { srcs: [o, o2], w: [wander(g.gain, 0.0004, 0.0016, 2, 6)] };
  },
  hvac(out) { // 空調箱:低沉氣流 + 風管共鳴 + 馬達 59Hz
    const n = noise('brown');
    const pk = filter('peaking', 190, 3);
    pk.gain.value = 8;
    const g = gain(0.05, out);
    n.connect(filter('lowpass', 300, 0.7, pk));
    pk.connect(g);
    lfo(0.07, 0.012, g.gain);
    const m = osc('sine', 59);
    m.connect(gain(0.006, out));
    return { srcs: [n, m] };
  },
  tone(out) { // 房間底噪
    const n = noise('pink');
    n.connect(filter('highpass', 60, 0.7, filter('lowpass', 450, 0.7, gain(0.018, out))));
    return { srcs: [n] };
  },
  wind(out, strong = false) { // 陣風:棕噪音 + 帶通掃動 + 隨機起伏
    const n = noise('brown');
    const bp = filter('bandpass', 420, 0.6);
    const g = gain(strong ? 0.09 : 0.06, out);
    n.connect(bp);
    bp.connect(filter('lowpass', strong ? 1800 : 1200, 0.6, g));
    const n2 = noise('pink');
    const bp2 = filter('bandpass', 1400, 1.6);
    const g2 = gain(0.006, out);
    n2.connect(bp2);
    bp2.connect(g2);
    return { srcs: [n, n2], w: [wander(g.gain, strong ? 0.04 : 0.02, strong ? 0.16 : 0.09, 0.6, 2.5), wander(bp.frequency, 250, strong ? 1100 : 750, 0.8, 3), wander(g2.gain, 0.001, strong ? 0.025 : 0.012, 0.5, 2), wander(bp2.frequency, 900, 2400, 1, 3)] };
  },
  windStrong(out) { return LAYERS.wind(out, true); },
  whistle(out) { // 風灌過欄杆/破窗的嘯聲
    const n = noise('white');
    const bp = filter('bandpass', 1100, 28);
    const g = gain(0.03, out);
    n.connect(bp);
    bp.connect(g);
    return { srcs: [n], w: [wander(bp.frequency, 650, 1500, 1, 4), wander(g.gain, 0.0, 0.05, 0.8, 3)] };
  },
  leaves(out) { // 枯葉、樹叢沙沙
    const n = noise('pink');
    const g = gain(0.01, out);
    n.connect(filter('highpass', 2500, 0.7, g));
    return { srcs: [n], w: [wander(g.gain, 0.002, 0.03, 0.3, 1.5)] };
  },
  fog(out) { // 濃霧:悶的遠方低鳴
    const n = noise('pink'), b = noise('brown');
    n.connect(filter('lowpass', 650, 0.6, gain(0.008, out)));
    b.connect(filter('lowpass', 90, 0.7, gain(0.04, out)));
    return { srcs: [n, b] };
  },
  draft(out) { // 樓梯間的穿堂風
    const n = noise('pink');
    const bp = filter('bandpass', 340, 1.1);
    const g = gain(0.02, out);
    n.connect(bp);
    bp.connect(g);
    return { srcs: [n], w: [wander(g.gain, 0.008, 0.035, 1, 4), wander(bp.frequency, 220, 520, 2, 5)] };
  },
  water(out) { // 積水:拍岸 + 細流
    const b = noise('brown');
    const g = gain(0.04, out);
    b.connect(filter('lowpass', 520, 0.8, g));
    const w = noise('white');
    const g2 = gain(0.004, out);
    w.connect(filter('bandpass', 2300, 1.2, g2));
    return {
      srcs: [b, w], w: [wander(g.gain, 0.015, 0.06, 0.4, 1.6), wander(g2.gain, 0.001, 0.008, 0.08, 0.3)],
      ev(now, L) { if (Math.random() < 0.25) bubble(L.out, now + rand(0.05, 0.25), rand(250, 900), rand(0.006, 0.02), rand(0.03, 0.08)); },
    };
  },
  rumble(out) { // 地下室的低頻隆隆(管線、遠處機械)
    const b = noise('brown');
    b.connect(filter('lowpass', 95, 0.7, gain(0.06, out)));
    const o = osc('sine', 41), o2 = osc('sine', 42.3);
    const g = gain(0.008, out);
    o.connect(g); o2.connect(g);
    return { srcs: [b, o, o2] };
  },
  fire(out) { // 焚化爐:火焰低吼 + 劈啪
    const b = noise('brown');
    const g = gain(0.05, out);
    b.connect(filter('lowpass', 480, 0.7, g));
    const o = osc('sine', 52);
    o.connect(gain(0.006, out));
    return { srcs: [b, o, crackle(out, 0.12)], w: [wander(g.gain, 0.03, 0.08, 0.2, 1)] };
  },
  machine(out) { // 機房:馬達嗡鳴 + 規律的機械撞擊
    const o = osc('sawtooth', 60);
    o.connect(filter('lowpass', 380, 0.8, gain(0.008, out)));
    const o2 = osc('square', 30);
    o2.connect(filter('lowpass', 110, 0.7, gain(0.012, out)));
    const n = noise('pink');
    n.connect(filter('bandpass', 900, 2, gain(0.004, out)));
    let next = 0;
    return {
      srcs: [o, o2, n],
      ev(now, L) {
        if (now < next) return;
        next = now + 0.78;
        tone(L.out, now + 0.1, { f: 85, f1: 50, dur: 0.12, g: 0.02 });
        burst(L.out, now + 0.1, { type: 'bandpass', f: 1300, q: 3, dur: 0.02, g: 0.008 });
      },
    };
  },
  organ(out) { // 禮拜堂:管風琴殘響般的低沉持續音,和弦極慢地改變
    const lp = filter('lowpass', 520, 0.7, gain(1, out));
    const sw = gain(0.6, lp);
    lfo(0.045, 0.35, sw.gain);
    const fs = [65.41, 98.0, 130.81, 155.56];
    const os = fs.map((f, i) => { const o = osc(i % 2 ? 'triangle' : 'sine', f * (1 + (i - 1.5) * 0.0015)); o.connect(gain(0.012 / (1 + i * 0.3), sw)); return o; });
    let next = 0;
    const CH = [[65.41, 98.0, 130.81, 155.56], [61.74, 92.5, 123.47, 146.83], [58.27, 87.31, 116.54, 138.59], [69.3, 103.83, 138.59, 164.81]];
    return {
      srcs: os,
      ev(now) {
        if (now < next) return;
        next = now + rand(14, 26);
        const c = pick(CH);
        os.forEach((o, i) => o.frequency.setTargetAtTime(c[i] * (1 + (i - 1.5) * 0.0015), now, 4));
      },
    };
  },
  fridge(out) { // 冰箱壓縮機
    const o = osc('sawtooth', 60);
    o.connect(filter('lowpass', 260, 0.8, gain(0.012, out)));
    const o2 = osc('sine', 120);
    o2.connect(gain(0.004, out));
    const n = noise('white');
    const g = gain(0.0012, out);
    n.connect(filter('bandpass', 3100, 4, g));
    return { srcs: [o, o2, n], w: [wander(g.gain, 0.0003, 0.002, 0.5, 3)] };
  },
  radio(out) { // 收音機:靜電雜訊 + 收訊時有時無的台灣老歌(公有領域旋律,folk.js 合成:大廣弦 + 月琴)+ 偶爾的 AM 1207 台呼 + 調頻的口哨聲
    const n = noise('white');
    const g = gain(0.006, out);
    const bp = filter('bandpass', 2100, 0.7, g);
    n.connect(bp);
    const mus = filter('bandpass', 950, 1.1, gain(1, out));
    const het = osc('sine', 1200);
    const hg = gain(0.0008, out);
    het.connect(hg);
    let next = 0, step = 0;
    const MEL = [4, 7, 9, 12, 9, 7, 4, 7, 4, 2, 0, 2, 4, 7, 2, 0]; // 還沒烘焙好時的備用旋律(五聲音階)
    const fade = gain(1, out);
    return {
      srcs: [n, het], w: [wander(g.gain, 0.002, 0.012, 0.1, 0.8), wander(het.frequency, 500, 2200, 2, 6), wander(hg.gain, 0, 0.0016, 1, 4)],
      ev(now) { // 一段老歌(收訊忽大忽小)→ 幾秒靜電 → 下一段
        if (now < next) return;
        const b = radioNext();
        if (b) {
          const s = A.ctx.createBufferSource(), g = gain(0, fade);
          s.buffer = b; s.playbackRate.value = rand(0.985, 1.01); s.connect(g);
          const t = now + 0.05, len = b.duration / s.playbackRate.value;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.008, t + 0.8); g.gain.setValueAtTime(0.008, t + len - 1.2); g.gain.linearRampToValueAtTime(0, t + len);
          s.start(t); s.stop(t + len + 0.05);
          fade.gain.cancelScheduledValues(t);
          for (let k = 0; k < len; k += rand(1.5, 4)) fade.gain.setTargetAtTime(rand(0.35, 1), t + k, 0.4); // 收訊飄移
          next = now + len + rand(3, 9);
          return;
        }
        next = now + 0.48;
        const f = 392 * Math.pow(2, MEL[step++ % MEL.length] / 12) * (1 + Math.sin(now * 0.7) * 0.012);
        const v = 0.004 * (0.4 + 0.6 * Math.abs(Math.sin(now * 0.13)));
        tone(mus, now + 0.05, { type: 'triangle', f, dur: 0.42, a: 0.01, g: v });
        if (step % 3 === 1) tone(mus, now + 0.05, { type: 'triangle', f: 196, dur: 0.3, g: v * 0.6 });
      },
    };
  },
  neon(out) { // 霓虹燈管
    const o = osc('sawtooth', 120);
    const g = gain(0.003, out);
    o.connect(filter('bandpass', 3400, 4, g));
    const o2 = osc('sine', 240);
    o2.connect(gain(0.002, out));
    return { srcs: [o, o2], w: [wander(g.gain, 0.001, 0.005, 0.2, 2)], ev(now, L) { if (Math.random() < 0.03) burst(L.out, now, { type: 'highpass', f: 4000, dur: 0.02, g: 0.01 }); } };
  },
  clock(out) { // 掛鐘滴答
    let next = 0, tk = 0;
    return {
      srcs: [],
      ev(now, L) {
        if (now < next) return;
        if (next === 0) next = now;
        next += 1;
        tk ^= 1;
        burst(L.out, next, { type: 'bandpass', f: tk ? 3300 : 2500, q: 5, dur: 0.012, g: 0.02 });
        burst(L.out, next, { type: 'bandpass', f: 800, q: 3, dur: 0.02, g: 0.008 });
      },
    };
  },
};
// 各層音量正規化(量測後:每層 1.0 ≈ -40 LUFS)
const LV = { hum: 1.27, buzz: 2.5, whine: 1.5, hvac: 0.63, tone: 2.5, wind: 1.07, windStrong: 2, whistle: 4, leaves: 2.8, fog: 1.4, draft: 4.5, water: 1.15, rumble: 1, fire: 1, machine: 1.3, organ: 0.85, fridge: 1.8, radio: 2.5, neon: 2.5, clock: 1,
  r_roomtone: 0.32, r_hum: 0.3, r_buzzbad: 0.3, r_flicker: 0.32, r_drips: 0.4, r_faucet: 0.32, r_wind: 0.36, r_howl: 0.34, r_graveyard: 0.34, r_generator: 0.32, r_ac: 0.3, r_screams: 0.32, r_horde: 0.32 };
// 斷電時會停的層
const ELECTRIC = new Set(['hum', 'buzz', 'whine', 'hvac', 'fridge', 'radio', 'neon', 'machine', 'r_roomtone', 'r_hum', 'r_buzzbad', 'r_flicker', 'r_ac']);
// 錄音音床存在時,對應的合成層退到這個比例(避免兩層打架)
// (0 = 錄音載好後整層拆掉,省音訊執行緒)
const SYNTH_BACK = { hum: ['r_hum', 0.3], hvac: ['r_roomtone', 0], tone: ['r_roomtone', 0], buzz: ['r_buzzbad', 0], wind: ['r_wind', 0.35], windStrong: ['r_howl', 0], water: ['r_drips', 0.4], machine: ['r_generator', 0], fog: ['r_graveyard', 0.5] };
// 區域燈光 → 額外的錄音電器聲
// [ghost] 燈光基調改成穩定:fluoro_dying 改用低沉嗡聲、各音床的 flicker 事件權重降到 1/10
const LIGHT_BED = { fluoro: ['r_hum', 0.5], fluoro_cold: ['r_hum', 0.6], fluoro_dying: ['r_buzzbad', 0.3], emergency: ['r_buzzbad', 0.4], monitor: ['r_hum', 0.3], surgical: ['r_hum', 0.5] };

// ---------- 各 mood 的音床 ----------
// (殭屍般的遠處呻吟/屍群聲已移除:殭屍叫聲只能來自真的在附近的殭屍,見 core.js 的 ZV 距離模型)
// L 常駐層音量、ev 隨機事件權重、gap 事件間隔、sp 預設殘響空間
const BEDS = {
  corridor: { L: { hum: 0.9, hvac: 0.7, tone: 0.6, r_roomtone: 0.8 }, ev: { drip: 0.6, flicker: 0.12, door: 0.5, knock: 0.3, pipe: 0.4, gurney: 0.25 }, gap: [3, 9], sp: 'corridor' },
  ward: { L: { hum: 0.5, hvac: 0.5, tone: 0.6, wind: 0.2, r_roomtone: 0.6 }, ev: { monitor: 0.7, drip: 0.4, flicker: 0.08, creak: 0.7, gurney: 0.3 }, gap: [3, 9], sp: 'room' },
  clinical: { L: { hum: 0.7, hvac: 0.8, whine: 0.6, tone: 0.4, r_roomtone: 0.5 }, ev: { monitor: 1.2, flicker: 0.06, drip: 0.3, clank: 0.5, creak: 0.3 }, gap: [3, 10], sp: 'tile' },
  lobby: { L: { wind: 0.7, tone: 1, hvac: 0.2, r_wind: 0.35, r_roomtone: 0.3 }, ev: { pigeon: 0.7, drip: 0.8, door: 0.5, debris: 0.6, thunder: 0.3, creak: 0.4 }, gap: [3, 8], sp: 'hall' },
  chapel: { L: { organ: 0.9, wind: 0.3, tone: 0.5, r_roomtone: 0.2 }, ev: { creak: 0.6, whisper: 0.35, drip: 0.3, bell: 0.2 }, gap: [5, 12], sp: 'chapel' },
  safe: { L: { fridge: 0.9, radio: 0.7, neon: 0.7, tone: 0.2 }, ev: { fridgeClick: 0.4 }, gap: [10, 20], sp: 'small' },
  emergency: { L: { hum: 0.5, buzz: 0.9, hvac: 0.4, tone: 0.4, r_buzzbad: 0.6, r_roomtone: 0.5 }, ev: { alarm: 0.6, monitor: 0.6, door: 0.5, flicker: 0.1, gurney: 0.4 }, gap: [3, 8], sp: 'room' },
  basement: { L: { rumble: 0.8, tone: 0.7, hvac: 0.25, r_drips: 0.9, r_roomtone: 0.3 }, ev: { drip: 1.6, pipe: 1.2, clank: 0.7, rat: 0.5 }, gap: [2, 6], sp: 'tunnel' },
  flooded: { L: { water: 0.9, rumble: 0.5, tone: 0.5, r_drips: 1.1 }, ev: { drip: 2, plop: 1.2, pipe: 0.6 }, gap: [1.5, 5], sp: 'tunnel' },
  morgue: { L: { fridge: 0.6, hum: 0.6, hvac: 0.5, tone: 0.5, r_faucet: 0.6, r_roomtone: 0.4 }, ev: { drip: 0.8, clank: 0.5, creak: 0.4, flicker: 0.06, gurney: 0.3 }, gap: [3, 9], sp: 'tile' },
  industrial: { L: { machine: 1.2, fire: 0.8, rumble: 0.6, hvac: 0.3, r_generator: 0.9 }, ev: { clank: 1.2, pipe: 1, steam: 0.8 }, gap: [2, 6], sp: 'industrial' },
  nursery: { L: { hum: 0.3, tone: 0.6, wind: 0.2 }, ev: { musicbox: 0.9, creak: 0.6, laughFar: 0.12, mobile: 0.6 }, gap: [5, 12], sp: 'room' },
  psych: { L: { hum: 0.6, whine: 0.7, tone: 0.5, r_screams: 0.22 }, ev: { knock: 1.2, scream: 0.2, flicker: 0.06, mutter: 0.5 }, gap: [3, 9], sp: 'corridor' },
  office: { L: { hum: 0.6, hvac: 0.5, tone: 0.4, clock: 0.7, r_ac: 0.45 }, ev: { creak: 0.5, flicker: 0.06, phoneFar: 0.15 }, gap: [5, 12], sp: 'small' },
  stair: { L: { draft: 0.8, tone: 0.5, buzz: 0.4, r_howl: 0.25 }, ev: { clank: 0.7, door: 0.8, stepsFar: 0.3, drip: 0.4 }, gap: [3, 9], sp: 'stair' },
  outdoor: { L: { wind: 1.3, leaves: 0.7, r_wind: 1 }, ev: { dog: 0.6, crow: 0.8, thunder: 0.25, siren: 0.45, chain: 0.4, owl: 0.3 }, gap: [4, 10], sp: 'outdoor' },
  outdoor_fog: { L: { wind: 0.8, fog: 0.8, r_graveyard: 0.9 }, ev: { crow: 1, dog: 0.4, bell: 0.25, chain: 0.4, owl: 0.4, siren: 0.25 }, gap: [5, 11], sp: 'outdoor' },
  roof: { L: { windStrong: 0.8, whistle: 0.6, r_howl: 1 }, ev: { flap: 0.8, crow: 0.3, thunder: 0.3, chain: 0.6, siren: 0.5 }, gap: [4, 9], sp: 'open' },
};
// (舊)區域主題 → 殘響空間表,保留供參考;實際由 rooms.js 依區域尺寸/材質計算
const THEME_SPACE_OLD = {
  corridor: 'corridor', ward: 'room', psych_cell: 'padded', stairwell: 'stair', stair_ext: 'outdoor', lobby: 'hall', chapel: 'chapel',
  tunnel: 'tunnel', ossuary: 'tunnel', pump: 'tunnel', ramp: 'tunnel', boiler: 'industrial', dock: 'industrial', incinerator: 'industrial', machine: 'industrial',
  morgue: 'tile', autopsy: 'tile', surgery: 'tile', delivery: 'tile', laundry: 'tile', cafeteria: 'room', shop: 'small', office: 'small', director: 'small',
  security: 'small', monitor: 'small', archive: 'small', dorm: 'room', xray: 'room', ct: 'room', waiting: 'room', supply: 'room', rehab: 'room',
  pharmacy: 'room', icu: 'room', er: 'room', nursery: 'room', playroom: 'room', peds_ward: 'room', courtyard: 'outdoor', alley: 'outdoor',
  playground: 'outdoor', cemetery: 'outdoor', yard: 'outdoor', ambulance_bay: 'outdoor', plaza: 'outdoor', parking: 'open', rooftop: 'open', fire_escape: 'open',
};

// ---------- 狀態 ----------
const AM = { mood: null, zone: null, zoneObj: null, explicit: false, pending: null, layers: {}, nextEv: 0, power: 1, powerAt: 0, level: 1, autoT: 0, layout: null, layoutReq: false, out: null };

function layerOut() {
  if (!AM.out || AM.outCtx !== A.ctx) { AM.out = gain(1, A.bus.amb); AM.outCtx = A.ctx; AM.layers = {}; }
  return AM.out;
}

// 套用 mood:各層平滑淡入淡出,沒用到的層淡出 6 秒後拆掉
function applyBed(tc = 1.6) {
  if (!A.ctx) return;
  const bed = BEDS[AM.mood] || BEDS.corridor, now = ctxNow(), out = layerOut();
  const want = { ...bed.L };
  const lb = AM.zoneObj && LIGHT_BED[AM.zoneObj.light];
  if (lb) want[lb[0]] = Math.max(want[lb[0]] || 0, lb[1]);
  for (const k in want) { const sb = SYNTH_BACK[k]; if (sb && want[sb[0]] && SM.loop(LAYERS_REC[sb[0]])) want[k] *= sb[1]; }
  for (const k in AM.layers) if (!(k in want)) want[k] = 0;
  for (const k in want) {
    let L = AM.layers[k];
    const tgt = want[k] * (LV[k] ?? 1) * (ELECTRIC.has(k) ? AM.power : 1) * AM.level;
    if (!L) {
      if (tgt <= 0) continue;
      const g = gain(0, out);
      const b = LAYERS[k](g);
      L = AM.layers[k] = { g, out: g, ...b, base: want[k] };
    }
    L.base = want[k];
    L.g.gain.setTargetAtTime(tgt, now, tc);
    L.off = tgt <= 0 ? now + tc * 4 : 0;
  }
}

function dropLayer(k) {
  const L = AM.layers[k];
  for (const s of L.srcs) { try { s.stop(); } catch { /* 已停 */ } }
  setTimeout(() => L.g.disconnect(), 100);
  delete AM.layers[k];
}

function spaceFor(zone, mood) {
  const fb = zone && THEME_SPACE[zone.theme] ? THEME_SPACE[zone.theme] : (BEDS[mood] || BEDS.corridor).sp;
  return zone ? spaceForZone(zone, mood, fb) : fb;
}
// 錄音層名稱 → LOOPS key
const LAYERS_REC = { r_roomtone: 'roomtone', r_hum: 'hum', r_buzzbad: 'buzzbad', r_flicker: 'flicker', r_drips: 'drips', r_faucet: 'faucet', r_wind: 'wind', r_howl: 'howl', r_graveyard: 'graveyard', r_generator: 'generator', r_ac: 'ac', r_screams: 'screams', r_horde: 'horde' };

function apply(zoneId, mood, zoneObj) {
  AM.zone = zoneId;
  AM.zoneObj = zoneObj || null;
  const m = BEDS[mood] ? mood : AM.mood || 'corridor';
  const moodChanged = m !== AM.mood;
  AM.mood = m;
  setSpace(spaceFor(zoneObj, m));
  applyBed();
  if (moodChanged) AM.nextEv = Math.min(AM.nextEv, ctxNow() + rand(1, 3));
}

function zoneById(id) {
  const lay = (A.world && A.world.layout) || AM.layout;
  return lay && lay.zones ? lay.zones.find((z) => z.id === id) : null;
}

// 對外:進入新區域(門口來回時有 0.35 秒防抖)
export function setZone(zoneId, mood) {
  AM.explicit = true;
  if (!A.ctx) { AM.zone = zoneId; AM.mood = BEDS[mood] ? mood : AM.mood; return; }
  if (zoneId === AM.zone && (mood === AM.mood || !BEDS[mood])) { AM.pending = null; return; }
  AM.pending = { zoneId, mood, at: ctxNow() + (AM.zone ? 0.35 : 0) };
}

// 配樂狀態影響環境音量(死亡時變小)
export function ambienceLevel(x) {
  AM.level = clamp(x, 0, 1.2);
  if (A.ctx && AM.out && AM.outCtx === A.ctx) applyBed(1);
}

// 斷電:電器類常駐層停掉 sec 秒,之後閃爍恢復
export function powerCut(sec = 8) {
  if (!A.ctx) return;
  AM.power = 0;
  AM.powerAt = ctxNow() + sec;
  applyBed(0.08);
}

export function startAmbience() {
  if (!A.ctx) return;
  layerOut();
  if (!AM.mood) AM.mood = 'corridor';
  setSpace(spaceFor(AM.zoneObj || zoneById(AM.zone), AM.mood), true);
  applyBed(2.5);
  AM.nextEv = ctxNow() + rand(2, 5);
}

// ---------- 自動判斷區域(沒有外部 setZone 時) ----------
function autoZone(now) {
  if (AM.explicit || now - AM.autoT < 0.5) return;
  AM.autoT = now;
  const L = A.L, feet = L.y - 1.65;
  let z = null;
  if (A.world && A.world.zoneAt) { try { z = A.world.zoneAt(L.x, feet, L.z); } catch { z = null; } }
  else {
    if (!AM.layout) {
      if (AM.layoutReq) return;
      AM.layoutReq = true; // 只在沒有 World 時才自己解析一次佈局
      try { AM.layout = parseLayout(); } catch { return; }
    }
    const lay = AM.layout, [c, r] = lay.cellOf(L.x, L.z);
    z = lay.zoneAt(lay.levelOfY(feet), c, r);
  }
  if (!z) { // 不在任何區域內:用該樓層預設
    const lay = (A.world && A.world.layout) || AM.layout;
    if (lay && lay.levelDefault && lay.levels) {
      const li = lay.levelOfY ? lay.levelOfY(feet) : 1, lv = lay.levels[li], dz = lv && lay.levelDefault[lv.id];
      if (dz) z = { id: `_${lv.id}`, ...dz };
    }
  }
  const id = z ? z.id : null;
  if (id !== AM.zone) {
    if (!AM.pendAuto || AM.pendAuto.id !== id) AM.pendAuto = { id, at: now + 0.35 };
    else if (now >= AM.pendAuto.at) { apply(id, z ? z.mood : 'outdoor', z); AM.pendAuto = null; }
  } else AM.pendAuto = null;
}

// ---------- 環境中的隨機定位事件 ----------
// 隨機方位:距離 a~b 公尺、高度 dy(相對聆聽者眼睛)
const spot = (a, b, dy = 0) => around(rand(a, b), rand(-Math.PI, Math.PI), dy);
const ev = (pos, o = {}) => emit({ pos, cat: 'amb', bus: 'amb', prio: 0, track: false, room: 0.5, ref: 1.5, maxDist: 60, ...o });

export const EVENTS = {
  drip(near) {
    const h = ev(spot(near ? 1.5 : 3, near ? 5 : 11, rand(-1.4, 1.5)), { dur: 0.6, room: 0.8, gain: 2.4 });
    if (!h) return;
    if (SM.play('amb.drip', { h, g: 0.7, p: 2 })) return;
    const f = rand(900, 1900);
    bubble(h.in, h.t, f, 0.08, 0.05);
    if (Math.random() < 0.5) bubble(h.in, h.t + rand(0.08, 0.2), f * rand(1.1, 1.4), 0.03, 0.04);
  },
  plop() {
    const h = ev(spot(3, 12, -1.5), { dur: 0.8, room: 0.8, gain: 2 });
    if (!h) return;
    burst(h.in, h.t, { type: 'lowpass', f: 900, f1: 300, dur: 0.06, g: 0.15 });
    bubble(h.in, h.t + 0.01, rand(250, 500), 0.12, 0.08);
    for (let i = 0; i < 3; i++) bubble(h.in, h.t + rand(0.05, 0.3), rand(500, 1100), 0.03, 0.04);
  },
  flicker() { // 頭上的燈管閃爍:劈啪 + 嗡聲斷續
    const h = ev(spot(1, 6, 1.4), { dur: 1.2, room: 0.2, gain: 2 });
    if (!h) return;
    const dur = rand(0.3, 0.9), o = A.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const g = gain(0, filter('bandpass', 1800, 1.5, h.in));
    g.gain.setValueCurveAtTime(curve(48, () => (Math.random() < 0.45 ? 0.04 : 0)), h.t, dur);
    o.connect(g);
    o.start(h.t);
    o.stop(h.t + dur + 0.05);
    burst(h.in, h.t, { type: 'highpass', f: 3500, dur: 0.015, g: 0.05 });
    if (Math.random() < 0.4) metal(h.in, h.t + dur, rand(3000, 4200), 0.01, 0.15, [1, 2.4]); // 燈管冷卻的「叮」
  },
  moan() { // 遠處某處的呻吟
    const h = ev(spot(14, 30, rand(-3, 3)), { dur: 3.4, room: 0.9, hall: 0.6, ref: 4, gain: 1, cat: 'amb' });
    if (!h) return;
    if (Math.random() < 0.5 && SM.play('z.groan', { h, g: 0.1, semi: rand(-3, 0) })) return;
    vocal(h.in, h.t, {
      mode: 'groan', f0: rand(65, 95), dur: rand(1.8, 3), fs: rand(0.9, 1.05), q: 6, vows: [pick(['uh', 'o']), pick(['o', 'u']), 'u'],
      breath: 0.3, fryRate: rand(18, 30), fryD: 0.5, sub: 0.1, drive: 2, lp: 1500, gurgle: 0.1, gain: 0.05, jit: 0.05, wob: 0.04, att: 0.4, rel: 0.8, k: 1,
    });
  },
  door() { // 遠處鐵門:吱嘎 → 碰撞
    const h = ev(spot(12, 28, rand(-2, 2)), { dur: 3, room: 1, hall: 0.6, ref: 4, gain: 0.6 });
    if (!h) return;
    if (SM.play(pick(['door.slam', 'door.metal']), { h, g: 0.5 })) return;
    const dur = rand(0.9, 1.6);
    const b = burst(h.in, h.t, { type: 'bandpass', f: rand(380, 520), f1: rand(250, 700), q: 14, dur: dur * 0.5, a: dur * 0.5, g: 0.25 });
    b.g.gain.cancelScheduledValues(h.t);
    b.g.gain.setValueCurveAtTime(curve(128, (u) => 0.22 * Math.sin(Math.PI * u) * (0.5 + 0.5 * Math.sin(u * dur * rand(25, 45)))), h.t, dur);
    const tt = h.t + dur + rand(0.1, 0.6);
    tone(h.in, tt, { f: 70, f1: 30, dur: 0.8, g: 0.35 });
    burst(h.in, tt, { type: 'lowpass', f: 900, f1: 120, dur: 0.5, g: 0.35 });
    metal(h.in, tt, rand(220, 340), 0.07, 0.9, [1, 1.8, 2.9, 4.2]);
  },
  knock() { // 隔間牆後面的敲擊(三下、停、再一下)
    const h = ev(spot(4, 12), { dur: 3, room: 0.6, gain: 1.2 });
    if (!h) return;
    const n = pick([2, 3, 3, 4]);
    let t = h.t;
    for (let i = 0; i < n; i++) { knockAt(h.in, t, 0.5); t += rand(0.28, 0.4); }
    if (Math.random() < 0.5) knockAt(h.in, t + rand(0.8, 1.4), 0.6);
  },
  pipe() { // 管線熱脹冷縮的敲擊與低吟
    const h = ev(spot(3, 14, rand(0, 2)), { dur: 3, room: 0.8, gain: 1.2 });
    if (!h) return;
    if (Math.random() < 0.5) for (let i = 0, t = h.t; i < pick([2, 3, 5]); i++, t += rand(0.12, 0.3)) metal(h.in, t, rand(500, 900), 0.06, 0.4, [1, 2.4, 3.9, 5.7]);
    else {
      const f = rand(70, 120);
      tone(h.in, h.t, { type: 'sawtooth', f, f1: f * rand(0.85, 1.15), dur: rand(1.2, 2.2), a: 0.5, g: 0.02 });
      burst(h.in, h.t, { type: 'bandpass', f: f * 4, q: 8, dur: 1.4, a: 0.5, g: 0.04 });
    }
  },
  creak() { // 建築物沉降的嘎吱
    const h = ev(spot(4, 14, rand(-1, 2.5)), { dur: 2, room: 0.7, gain: 9 });
    if (!h) return;
    const f = rand(280, 700), dur = rand(0.5, 1.2);
    const b = burst(h.in, h.t, { type: 'bandpass', f, f1: f * rand(0.75, 1.3), q: 16, dur: dur * 0.5, a: dur * 0.5, g: 0.12 });
    b.g.gain.cancelScheduledValues(h.t);
    b.g.gain.setValueCurveAtTime(curve(64, (u) => 0.1 * Math.sin(Math.PI * u) * (0.4 + 0.6 * Math.abs(Math.sin(u * dur * rand(18, 40))))), h.t, dur);
  },
  monitor() { // 遠處仍在運作的生理監視器嗶聲(偶爾變成長音)
    const h = ev(spot(6, 16), { dur: 6, room: 0.6, gain: 1.5 });
    if (!h) return;
    const flat = Math.random() < 0.18, f = pick([880, 960, 1000]);
    if (flat) tone(h.in, h.t, { f, dur: 3.5, hold: 2.5, a: 0.01, g: 0.02 });
    else for (let i = 0; i < pick([3, 4, 5]); i++) tone(h.in, h.t + i * rand(0.75, 0.95), { f, dur: 0.1, a: 0.004, g: 0.022 });
  },
  clank() { // 遠處金屬碰撞
    const h = ev(spot(8, 24, rand(-2, 2)), { dur: 2, room: 0.9, hall: 0.4, ref: 3, gain: 1 });
    if (!h) return;
    if (SM.play('impact.metal', { h, g: 0.5, p: 2 })) return;
    metal(h.in, h.t, rand(260, 520), 0.08, 0.9, [1, 1.9, 3.1, 4.4]);
    burst(h.in, h.t, { type: 'lowpass', f: 900, f1: 200, dur: 0.15, g: 0.12 });
  },
  gurney() { // 遠處有人推著輪床(輪子規律吱吱 + 滾動)
    const h = ev(spot(10, 24), { dur: 4, room: 0.8, hall: 0.3, ref: 3, gain: 1.4 });
    if (!h) return;
    const dur = rand(2, 3.2);
    burst(h.in, h.t, { buf: 'brown', type: 'lowpass', f: 300, dur: dur * 0.5, a: dur * 0.5, g: 0.12 });
    for (let t = 0.1; t < dur; t += rand(0.28, 0.34)) burst(h.in, h.t + t, { type: 'bandpass', f: rand(1700, 2000), q: 18, dur: 0.06, a: 0.02, g: 0.05 });
  },
  pigeon() { // 大廳天窗上的鴿子拍翅
    const h = ev(spot(5, 15, rand(4, 8)), { dur: 2, room: 0.8, hall: 0.5, gain: 6 });
    if (!h) return;
    for (let i = 0, t = h.t; i < pick([5, 7, 9]); i++, t += rand(0.07, 0.11)) burst(h.in, t, { buf: 'pink', type: 'bandpass', f: rand(800, 1400), q: 0.8, dur: 0.06, a: 0.015, g: 0.18 });
  },
  debris() { // 細小碎屑從高處掉落
    const h = ev(spot(3, 12, rand(-1, 3)), { dur: 1.5, room: 0.8, gain: 8 });
    if (!h) return;
    for (let i = 0; i < 6; i++) burst(h.in, h.t + rand(0, 0.6) + i * 0.05, { type: 'bandpass', f: rand(2000, 6000), q: 4, dur: 0.01, g: rand(0.03, 0.08) });
  },
  thunder() { // 遠方悶雷(非定位,寬)
    const h = emit({ bus: 'amb', dur: 6, hall: 0.6, gain: 0.4 });
    if (!h) return;
    const t = h.t;
    tone(h.in, t, { f: rand(35, 50), f1: 22, dur: 3.5, a: 0.4, g: 0.12 });
    burst(h.in, t, { buf: 'brown', type: 'lowpass', f: 260, f1: 60, dur: 3.6, a: 0.25, g: 0.25 });
    for (let i = 0; i < 4; i++) burst(h.in, t + rand(0.2, 2.2), { buf: 'brown', type: 'lowpass', f: rand(200, 420), f1: 80, dur: rand(0.6, 1.2), a: 0.1, g: rand(0.06, 0.14) });
  },
  bell() { // 遠方教堂鐘聲
    const h = ev(spot(30, 45, 8), { dur: 9, room: 0.3, hall: 0.8, ref: 25, roll: 0.5, maxDist: 80, gain: 1.6 });
    if (!h) return;
    for (let i = 0; i < pick([1, 2, 3]); i++) metal(h.in, h.t + i * 3.2, 196 * rand(0.98, 1.02), 0.05, 5, [0.5, 1, 1.19, 1.5, 2, 2.53, 2.66, 3.01]);
  },
  alarm() { // 某處斷斷續續的警報蜂鳴
    const h = ev(spot(15, 30), { dur: 4, room: 0.8, hall: 0.5, ref: 5, gain: 1.8 });
    if (!h) return;
    for (let i = 0; i < pick([3, 4, 6]); i++) tone(h.in, h.t + i * 0.55, { type: 'square', f: 760, dur: 0.3, hold: 0.15, g: 0.012 });
  },
  rat() { // 老鼠吱吱 + 小爪子
    const h = ev(spot(2, 8, -1.5), { dur: 1.5, room: 0.4, gain: 4 });
    if (!h) return;
    for (let i = 0; i < pick([2, 3]); i++) tone(h.in, h.t + i * rand(0.1, 0.2), { f: rand(3500, 5200), f1: rand(3000, 4500), dur: 0.05, a: 0.005, g: 0.02 });
    for (let i = 0; i < 10; i++) burst(h.in, h.t + 0.3 + i * rand(0.03, 0.05), { type: 'bandpass', f: rand(3000, 5000), q: 5, dur: 0.006, g: 0.04 });
  },
  steam() { // 蒸汽洩漏
    const h = ev(spot(4, 12, rand(0, 2)), { dur: 2.5, room: 0.6, gain: 1.2 });
    if (!h) return;
    burst(h.in, h.t, { type: 'highpass', f: 2500, dur: rand(0.8, 1.6), a: 0.04, g: 0.08 });
  },
  musicbox() { // 新生兒室某處的走音音樂盒片段
    const h = ev(spot(4, 10, -0.5), { dur: 7, room: 0.7, hall: 0.4, gain: 1.4 });
    if (!h) return;
    musicBox(h.in, h.t, 4 + ((Math.random() * 5) | 0), 0.05);
  },
  mobile() { // 嬰兒床吊飾的細碎叮噹
    const h = ev(spot(2, 7, 0.3), { dur: 3, room: 0.5, gain: 1.2 });
    if (!h) return;
    for (let i = 0; i < 5; i++) metal(h.in, h.t + rand(0, 1.5), rand(2400, 4200), 0.008, 0.6, [1, 2.76]);
  },
  laughFar() { // 很遠很遠的孩童笑聲(極少)
    const h = ev(spot(15, 25, rand(-2, 3)), { dur: 3, room: 1, hall: 0.8, ref: 3, gain: 0.13 });
    if (!h) return;
    childLaugh(h.in, h.t, 0.5);
  },
  whisper() {
    const h = ev(spot(3, 8), { dur: 3, room: 0.8, hall: 0.6, gain: 1.1, cat: 'amb' });
    if (!h) return;
    whisperAt(h.in, h.t, rand(1.2, 2), 0.25);
  },
  scream() { // 隔離房某處的遠處尖叫(悶)
    const h = ev(spot(16, 30), { dur: 3, room: 1, hall: 0.8, ref: 3, gain: 0.08 });
    if (!h) return;
    screamAt(h.in, h.t, 0.3);
  },
  mutter() { // 精神科:喃喃自語
    const h = ev(spot(4, 10), { dur: 4, room: 0.6, gain: 0.55 });
    if (!h) return;
    for (let i = 0, t = h.t; i < pick([3, 4, 5]); i++) {
      const d = rand(0.25, 0.6);
      vocal(h.in, t, { mode: 'groan', contour: 'groan', f0: rand(95, 130), dur: d, fs: 1.05, q: 6, vows: [pick(['uh', 'e', 'o']), pick(['a', 'u', 'i']), 'uh'], breath: 0.5, fryRate: 50, fryD: 0.3, sub: 0, drive: 1.5, lp: 2200, gurgle: 0, gain: 0.12, jit: 0.04, wob: 0.03, att: 0.04, rel: 0.1, k: 1 });
      t += d + rand(0.1, 0.5);
    }
  },
  phoneFar() { // 遠處辦公室電話響兩聲就斷
    if (A.game?.interact?.ringFar?.(10, 24, 60)) return; // [interact] 優先讓 10~24m 外一支真的電話響(循聲找得到、接得起來)
    const h = ev(spot(26, 36), { dur: 4, room: 0.9, gain: 0.45 }); // 否則只在很遠的地方(隔好幾道牆,走過去也找不到是正常的)
    if (!h) return;
    phoneBell(h.in, h.t, 1.2, 0.15);
  },
  stepsFar() { // 樓梯間上/下方的腳步(隔樓板)
    const h = ev(around(rand(2, 5), rand(-Math.PI, Math.PI), pick([-4.2, 4.2])), { dur: 3.5, room: 0.8, gain: 7 });
    if (!h) return;
    for (let i = 0, t = h.t; i < pick([4, 6, 8]); i++, t += rand(0.42, 0.55)) {
      burst(h.in, t, { type: 'lowpass', f: 420, f1: 120, dur: 0.07, g: 0.3 });
      burst(h.in, t, { type: 'bandpass', f: 1500, q: 1.3, dur: 0.016, g: 0.1 });
    }
  },
  fridgeClick() { // 冰箱壓縮機啟動/停止
    const h = emit({ bus: 'amb', dur: 1, room: 0.3, gain: 4 });
    if (!h) return;
    burst(h.in, h.t, { type: 'lowpass', f: 400, f1: 120, dur: 0.06, g: 0.06 });
    metal(h.in, h.t, rand(700, 900), 0.01, 0.2);
  },
  dog() { // 遠處狗吠(兩三聲)
    const h = ev(spot(30, 45, 0), { dur: 4, room: 0.3, hall: 0.6, ref: 18, roll: 0.6, maxDist: 70, gain: 0.1 });
    if (!h) return;
    if (SM.play('amb.dog', { h, g: 2 })) return;
    for (let i = 0, t = h.t; i < pick([2, 3, 4]); i++, t += rand(0.35, 0.6)) bark(h.in, t);
  },
  crow() { // 烏鴉
    const h = ev(spot(12, 30, rand(4, 10)), { dur: 3, room: 0.3, hall: 0.4, ref: 8, maxDist: 60, gain: 3 });
    if (!h) return;
    if (SM.play('amb.crow', { h, g: 0.15 })) return;
    for (let i = 0, t = h.t; i < pick([1, 2, 3]); i++, t += rand(0.4, 0.7)) caw(h.in, t);
  },
  owl() {
    const h = ev(spot(20, 35, rand(4, 8)), { dur: 3, room: 0.3, hall: 0.4, ref: 10, maxDist: 60, gain: 2.8 });
    if (!h) return;
    for (const [dt, d] of [[0, 0.25], [0.45, 0.15], [0.7, 0.5]]) tone(h.in, h.t + dt, { f: 380, f1: 340, dur: d, a: 0.05, g: 0.03 });
  },
  siren() { // 很遠的警笛:美式長鳴或歐式高低音,緩緩飄過(經過時都卜勒下滑),隔著城市很悶
    const dur = rand(8, 12);
    const h = emit({ bus: 'amb', prio: 1, dur: dur + 0.5, hall: 0.8, echo: 0.5, gain: 1.6 });
    if (!h) return;
    const t = h.t, wail = Math.random() < 0.6, dop = rand(0.9, 0.96), pan = A.ctx.createStereoPanner();
    const g = gain(0, filter('lowpass', rand(900, 1400), 0.7, pan));
    pan.pan.setValueAtTime(rand(-0.9, -0.3), t);
    pan.pan.linearRampToValueAtTime(rand(0.3, 0.9), t + dur);
    pan.connect(h.in);
    for (const [type, mul, gg] of [['triangle', 1, 1], ['sawtooth', 2.01, 0.12]]) {
      const o = A.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueCurveAtTime(curve(128, (u) => mul * (wail ? 650 + 260 * Math.sin(u * dur * 0.9 * Math.PI) : (Math.floor(u * dur * 1.6) % 2 ? 730 : 590)) * (u > 0.5 ? 1 - (1 - dop) * Math.min(1, (u - 0.5) * 6) : 1)), t, dur);
      o.connect(gain(gg, g));
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    g.gain.setValueCurveAtTime(curve(48, (u) => 0.006 * Math.pow(Math.sin(Math.PI * u), 1.5)), t, dur);
  },
  hordeFar() { // 很遠的屍群呻吟(戶外,偶爾)
    const h = ev(spot(35, 50, 0), { dur: 7, room: 0.3, hall: 0.9, ref: 20, roll: 0.6, maxDist: 80, gain: 0.5 });
    if (!h) return;
    const L = SM.loop('horde');
    if (L) playBuf(h.in, h.t, L.b, { off: rand(0, Math.max(0, L.b.duration - 7)), len: 6, g: L.g * 0.9, fi: 1.5, fo: 2 });
  },
  chain() { // 鐵絲網圍籬被風吹得碰撞
    const h = ev(spot(6, 18), { dur: 2, room: 0.3, gain: 5.5 });
    if (!h) return;
    for (let i = 0; i < pick([4, 6, 8]); i++) metal(h.in, h.t + rand(0, 1.2), rand(1800, 3200), 0.012, 0.12, [1, 2.4, 3.7]);
  },
  flap() { // 頂樓防水布被強風拍打
    const h = ev(spot(4, 12), { dur: 2, room: 0.2, gain: 5.5 });
    if (!h) return;
    for (let i = 0, t = h.t; i < pick([3, 5, 7]); i++, t += rand(0.12, 0.25)) burst(h.in, t, { buf: 'pink', type: 'bandpass', f: rand(500, 900), q: 0.7, dur: 0.07, a: 0.01, g: 0.25 });
  },
};

// ---------- 共用的聲音片段(驚嚇音也會用) ----------
export function knockAt(d, t, g) {
  tone(d, t, { f: rand(110, 140), f1: 70, dur: 0.09, g: g * 0.7 });
  burst(d, t, { type: 'lowpass', f: 900, f1: 250, dur: 0.06, g: g * 0.5 });
  burst(d, t, { type: 'bandpass', f: rand(700, 1000), q: 3, dur: 0.03, g: g * 0.3 });
}
export function musicBox(d, t, n, g, sagTo = 0.996) {
  const BOX = [0, 1, 3, 6, 7, 10, 12, 13];
  let tt = t, gap = rand(0.32, 0.45), sag = 1;
  const base = pick([587.33, 523.25, 622.25]);
  for (let i = 0; i < n; i++) {
    const f = base * Math.pow(2, pick(BOX) / 12) * sag * rand(0.985, 1.015);
    tone(d, tt, { f, dur: 1.2, a: 0.002, g });
    tone(d, tt, { f: f * 3.98, dur: 0.35, a: 0.001, g: g * 0.36 });
    tone(d, tt, { f: f * 6.3, dur: 0.12, a: 0.001, g: g * 0.2 });
    tt += gap;
    gap *= rand(1.04, 1.14); // 發條快沒了
    sag *= rand(sagTo - 0.004, sagTo + 0.002);
  }
  return tt;
}
// 氣聲低語:子音嘶聲 + 共振峰濾波的氣流
export function whisperAt(d, t, dur, g) {
  const n = Math.max(3, Math.round(dur * rand(3.5, 5)));
  const V = [[300, 870, 2240], [640, 1190, 2390], [530, 1840, 2480], [270, 2290, 3010], [570, 840, 2410], [490, 1350, 1690]];
  let tt = t;
  for (let i = 0; i < n; i++) {
    const sl = rand(0.12, 0.26), v = pick(V), k = rand(0.95, 1.12);
    const c = Math.random();
    if (c < 0.35) burst(d, tt, { type: 'highpass', f: rand(4500, 6500), dur: rand(0.05, 0.1), a: 0.02, g: g * 0.5 }); // s
    else if (c < 0.55) burst(d, tt, { type: 'bandpass', f: rand(2400, 3400), q: 2, dur: rand(0.05, 0.09), a: 0.02, g: g * 0.5 }); // sh
    else if (c < 0.7) burst(d, tt, { type: 'bandpass', f: rand(1500, 3500), q: 1, dur: 0.012, g: g * 0.6 }); // t/k
    const t1 = tt + 0.04;
    for (let f = 0; f < 3; f++) burst(d, t1, { buf: 'pink', type: 'bandpass', f: v[f] * k, f1: v[f] * k * rand(0.9, 1.1), q: 9 + f * 3, dur: sl * 0.55, a: sl * 0.45, g: g * [1, 0.7, 0.4][f] * 2.2 });
    tt += sl + rand(0.02, 0.09) + (Math.random() < 0.2 ? rand(0.15, 0.3) : 0);
  }
  return tt;
}
// 孩童笑聲:高音、短促的「哈」串,最後拖慢走音
export function childLaugh(d, t, g) {
  const n = pick([4, 5, 6]);
  let tt = t, f0 = rand(380, 470);
  for (let i = 0; i < n; i++) {
    const dur = rand(0.09, 0.13);
    burst(d, tt, { buf: 'pink', type: 'bandpass', f: 1600, q: 1, dur: 0.03, g: g * 0.15 }); // h
    vocal(d, tt + 0.015, { mode: 'groan', contour: 'pain', f0: f0, dur, fs: 1.38, q: 5, vows: ['a', 'ae', 'uh'], breath: 0.45, fryRate: 70, fryD: 0.15, sub: 0, drive: 1.5, lp: 6000, gurgle: 0, gain: g * 0.6, jit: 0.03, wob: 0.02, att: 0.012, rel: 0.05, k: 1, makeup: 2.4 });
    tt += dur + rand(0.05, 0.08);
    f0 *= rand(0.94, 0.99);
  }
  return tt;
}
export function screamAt(d, t, g, far = true) {
  const S = { mode: 'groan', contour: 'shriek', f0: rand(560, 760), dur: rand(1.2, 1.7), fs: 1.25, q: 4, vows: ['a', 'ae', 'i'], breath: 0.6, fryRate: 80, fryD: 0.15, sub: 0, drive: 3, lp: far ? 3200 : 7000, gurgle: 0, gain: g, jit: 0.08, wob: 0.05, att: 0.08, rel: 0.4, k: 1, makeup: 2.6 };
  vocal(d, t, S);
}
export function phoneBell(d, t, dur, g) { // 老式電鈴:兩個鈴鐺被 20Hz 鈴錘交替敲擊
  const ctx = A.ctx;
  const am = ctx.createGain();
  am.gain.value = 0;
  const lp = filter('lowpass', 5000, 0.7, d);
  am.connect(lp);
  const N = Math.ceil(dur * 20);
  am.gain.setValueCurveAtTime(curve(N * 8, (u, i) => { const ph = (i % 8) / 8; return g * Math.exp(-ph * 4) * (i < N * 8 - 8 ? 1 : 0); }), t, dur);
  const srcs = [];
  for (const [f, a] of [[1150, 1], [1150 * 2.76, 0.35], [1220, 0.8], [1220 * 2.76, 0.28], [1150 * 5.4, 0.12]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f * rand(0.995, 1.005);
    o.connect(gain(a * 0.5, am));
    o.start(t);
    o.stop(t + dur + 0.3);
    srcs.push(o);
  }
  burst(am, t, { type: 'bandpass', f: 3000, q: 2, dur: dur * 0.9, hold: 0, a: 0.01, g: 0.15 });
}
function bark(d, t) {
  const f = rand(380, 520);
  vocal(d, t, { mode: 'attack', contour: 'attack', f0: f * 0.5, dur: rand(0.14, 0.22), fs: 1.15, q: 4, vows: ['a', 'uh', 'uh'], breath: 0.8, fryRate: 60, fryD: 0.3, sub: 0, drive: 4, lp: 2400, gurgle: 0, gain: 0.35, jit: 0.06, wob: 0.03, att: 0.01, rel: 0.06, k: 1, makeup: 3 });
}
function caw(d, t) {
  const f = rand(700, 900);
  const o = A.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 0.85, t + 0.25);
  const g = gain(0, filter('bandpass', 1300, 2.5, d));
  g.gain.setValueCurveAtTime(curve(32, (u) => 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.3)) * (0.6 + 0.4 * Math.random())), t, 0.28);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.3);
  burst(d, t, { type: 'bandpass', f: 2200, q: 3, dur: 0.25, a: 0.02, g: 0.15 });
}

// ---------- 定位循環音 ----------
// kind:'generator' 'tv_static' 'fluorescent' 'water_drip' 'wind' 'fire' 'machine_hum' 'radio' 'monitor' 'phone' 'music_box'
//       'alarm' 'clock' 'fridge' 'neon' 'candles' 'incubator' 'cctv' 'ac' 'screams' 'horde' 'eating' 'breathing';聆聽者靠近才建立節點。
// 有錄音的種類先用錄音(第一次用到時載入,沒載好前用合成版本)
const LOOP_REC = { generator: ['generator', 0.9], tv_static: ['tv', 0.7], fluorescent: ['buzzbad', 0.9], water_drip: ['faucet', 1.2], wind: ['howl', 0.8], machine_hum: ['ac', 0.8], phone: ['phone', 0.5], music_box: ['musicbox', 0.8], screams: ['screams', 0.9], horde: ['horde', 0.9], eating: ['eating', 1.2], breathing: ['breathfast', 0.6] };
// 用環境層的建構函式做定位循環音:層內排程寫到 L.out,這裡把輸出節點包進去
function layerLoop(k, o) { const b = LAYERS[k](o); const L = { out: o }; return { ...b, ev: b.ev ? (now) => b.ev(now, L) : undefined }; }
const LOOPK = {
  monitor: { r: 12, g: 1, room: 0.4, build() { // 生理監視器:規律的嗶聲(偶爾變快)
    let next = 0, bpm = rand(58, 80);
    return { srcs: [], ev(now, L) { if (now < next) return; next = now + 60 / bpm; if (Math.random() < 0.02) bpm = rand(55, 110); tone(L.d, now + 0.05, { f: 960, dur: 0.08, a: 0.003, g: 0.05 }); } };
  } },
  phone: { r: 16, g: 1, room: 0.6, build(d) { const L = { srcs: [] }; let next = 0; L.ev = (now) => { if (now < next) return; next = now + 6; phoneBell(d, now + 0.05, 2, 0.08); }; return L; } },
  music_box: { r: 10, g: 1, room: 0.6, build(d) { let next = 0; return { srcs: [], ev(now) { if (now < next) return; next = now + rand(9, 14); musicBox(d, now + 0.05, 10, 0.04, 0.994); } }; } },
  alarm: { r: 30, g: 1, room: 0.7, build(d) { const o = osc('square', 760); const g = gain(0, filter('lowpass', 2500, 0.7, d)); o.connect(g); let next = 0, on = false; return { srcs: [o], ev(now) { if (now < next) return; on = !on; next = now + (on ? 0.35 : 0.5); g.gain.setTargetAtTime(on ? 0.02 : 0, now, 0.01); } }; } },
  clock: { r: 8, g: 1, room: 0.4, build(d) { return layerLoop('clock', gain(3, d)); } },
  fridge: { r: 10, g: 1, room: 0.3, build(d) { return layerLoop('fridge', gain(3, d)); } },
  neon: { r: 10, g: 1, room: 0.3, build(d) { return layerLoop('neon', gain(4, d)); } },
  candles: { r: 6, g: 1, room: 0.3, build(d) { return { srcs: [crackle(d, 0.05)] }; } }, // 燭芯的細小劈啪
  incubator: { r: 9, g: 1, room: 0.3, build(d) { const o = osc('sine', 120); o.connect(gain(0.008, d)); const n = noise('pink'); n.connect(filter('bandpass', 700, 1, gain(0.01, d))); let next = 0; return { srcs: [o, n], ev(now, L) { if (now < next) return; next = now + rand(3, 6); for (let i = 0; i < 2; i++) tone(L.d, now + 0.05 + i * 0.18, { f: 1760, dur: 0.06, g: 0.015 }); } }; } },
  cctv: { r: 9, g: 1, room: 0.3, build(d) { const o = osc('sawtooth', 60); o.connect(filter('lowpass', 300, 0.7, gain(0.006, d))); const n = noise('white'); const g = gain(0.004, d); n.connect(filter('bandpass', 4200, 1.5, g)); return { srcs: [o, n], w: [wander(g.gain, 0.001, 0.008, 0.2, 1.2)] }; } },
  ac: { r: 14, g: 1, room: 0.4, build(d) { return LOOPK.machine_hum.build(d); } },
  screams: { r: 25, g: 1, room: 0.8, build() { return { srcs: [] }; } },
  horde: { r: 45, g: 1, room: 0.8, build() { return { srcs: [] }; } },
  eating: { r: 10, g: 1, room: 0.5, build(d) { let next = 0; return { srcs: [], ev(now, L) { if (now < next) return; next = now + rand(0.3, 0.7); burst(L.d, now + 0.05, { type: 'bandpass', f: rand(600, 1400), q: 2, dur: 0.12, a: 0.02, g: 0.06 }); } }; } },
  breathing: { r: 6, g: 1, room: 0.2, build() { return { srcs: [] }; } },
  generator: { r: 28, g: 1.2, room: 0.6, build(d) { // 柴油發電機:低頻引擎脈動 + 金屬震顫
    const o = osc('sawtooth', 29);
    o.connect(filter('lowpass', 180, 1, gain(0.12, d)));
    const o2 = osc('square', 58);
    o2.connect(filter('bandpass', 400, 2, gain(0.03, d)));
    const n = noise('pink');
    const g = gain(0.02, d);
    n.connect(filter('bandpass', 2600, 1.5, g));
    lfo(14.5, 0.012, g.gain); // 汽缸點火的顫動
    return { srcs: [o, o2, n] };
  } },
  tv_static: { r: 16, g: 1, room: 0.4, build(d) {
    const n = noise('white');
    const g = gain(0.05, d);
    n.connect(filter('lowpass', 7000, 0.7, filter('highpass', 900, 0.7, g)));
    const o = osc('sawtooth', 60);
    o.connect(filter('lowpass', 300, 0.7, gain(0.006, d)));
    return { srcs: [n, o], w: [wander(g.gain, 0.02, 0.07, 0.05, 0.4)], ev(now, L) { if (Math.random() < 0.05) burst(L.d, now, { type: 'highpass', f: 2000, dur: 0.02, g: 0.12 }); } };
  } },
  fluorescent: { r: 12, g: 1, room: 0.3, build(d) { // 故障燈管:嗡 + 劈啪 + 斷續
    const o = osc('sawtooth', 120);
    const g = gain(0.02, d);
    o.connect(filter('bandpass', 1900, 1.2, g));
    return { srcs: [o], w: [wander(g.gain, 0, 0.035, 0.05, 0.6)], ev(now, L) { if (Math.random() < 0.08) burst(L.d, now, { type: 'highpass', f: 3500, dur: 0.012, g: 0.08 }); } };
  } },
  water_drip: { r: 14, g: 1.4, room: 0.9, build() {
    let next = 0;
    return { srcs: [], ev(now, L) { if (now < next) return; next = now + rand(0.7, 2.2); const f = rand(1100, 1700); bubble(L.d, now + 0.05, f, 0.09, 0.05); if (Math.random() < 0.4) bubble(L.d, now + 0.18, f * 1.25, 0.03, 0.04); } };
  } },
  wind: { r: 16, g: 1, room: 0.2, build(d) { // 破窗灌風
    const n = noise('pink');
    const bp = filter('bandpass', 900, 6);
    const g = gain(0.06, d);
    n.connect(bp);
    bp.connect(g);
    return { srcs: [n], w: [wander(bp.frequency, 500, 1500, 1, 4), wander(g.gain, 0.01, 0.1, 0.8, 3)] };
  } },
  fire: { r: 18, g: 1.2, room: 0.4, build(d) {
    const b = noise('brown');
    const g = gain(0.12, d);
    b.connect(filter('lowpass', 650, 0.7, g));
    return { srcs: [b, crackle(d, 0.35)], w: [wander(g.gain, 0.06, 0.16, 0.15, 0.8)] };
  } },
  machine_hum: { r: 18, g: 1, room: 0.5, build(d) {
    const o = osc('sawtooth', 60);
    o.connect(filter('lowpass', 500, 0.8, gain(0.04, d)));
    const o2 = osc('sine', 180);
    o2.connect(gain(0.01, d));
    const n = noise('pink');
    n.connect(filter('bandpass', 1200, 3, gain(0.012, d)));
    return { srcs: [o, o2, n] };
  } },
  radio: { r: 12, g: 1, room: 0.3, build(d) { return LAYERS.radio(gain(4, d)); } },
};
const LOOPS = new Map();
export function loopStart(key, kind, pos) {
  if (!LOOPK[kind] || !pos || !Number.isFinite(pos.x)) return;
  loopStop(key);
  LOOPS.set(key, { kind, pos: { x: pos.x, y: pos.y ?? 1.5, z: pos.z }, live: null });
}
export function loopStop(key) {
  const L = LOOPS.get(key);
  if (!L) return;
  stopLive(L);
  LOOPS.delete(key);
}
function startLive(L) {
  const K = LOOPK[L.kind];
  const h = emit({ pos: L.pos, cat: 'loop', bus: 'amb', prio: 2, dur: 1e6, room: K.room, ref: 1.5, roll: 1.1, maxDist: K.r + 6, gain: 0, track: false, nocap: true });
  if (!h) return;
  const g = gain(K.g, h.in);
  const R = LOOP_REC[L.kind], rb = R && SM.loop(R[0]);
  let b;
  if (rb) { // 錄音循環(單聲道,從隨機位置開始)
    const s = A.ctx.createBufferSource();
    s.buffer = rb.b; s.loop = true; s.playbackRate.value = rand(0.97, 1.03);
    s.connect(gain(rb.g * R[1] * 3.2, g));
    s.start(h.t, rand(0, rb.b.duration));
    b = { srcs: [s], rec: R[0] };
  } else b = K.build(g);
  h.in.gain.setTargetAtTime(1, h.t, 0.25);
  L.live = { h, g, ...b, d: g };
}
function stopLive(L) {
  const v = L.live;
  if (!v) return;
  L.live = null;
  v.h.kill();
  if (v.h.strip) v.h.strip.end = A.ctx.currentTime + 0.1;
  setTimeout(() => { for (const s of v.srcs) { try { s.stop(); } catch { /* 已停 */ } } v.g.disconnect(); }, 150);
}
function wanderTick(w, now) {
  if (!w) return;
  for (const x of w) if (now >= x.next) { x.param.setTargetAtTime(rand(x.lo, x.hi), now, rand(x.tmin, x.tmax) * 0.5); x.next = now + rand(x.tmin, x.tmax); }
}

// ---------- 排程 ----------
let loopT = 0, rr2 = 0;
onTick((now) => {
  if (!AM.out || AM.outCtx !== A.ctx) return; // 尚未啟動
  autoZone(now);
  if (AM.pending && now >= AM.pending.at) { const p = AM.pending; AM.pending = null; apply(p.zoneId, p.mood, zoneById(p.zoneId)); }
  if (AM.power < 1 && now >= AM.powerAt) { // 復電:先閃兩下
    AM.power = 1;
    SM.play('fluoro.on', { bus: 'amb', prio: 2, gain: 0.5, room: 0.3, g: 0.5 });
    applyBed(0.05);
    for (const k in AM.layers) if (ELECTRIC.has(k)) { const p = AM.layers[k].g.gain; p.setValueAtTime(0, now + 0.15); p.setTargetAtTime(AM.layers[k].base * (LV[k] ?? 1) * AM.level, now + 0.35, 0.05); }
  }
  let recNew = false;
  for (const k in AM.layers) {
    const L = AM.layers[k];
    if (L.off && now > L.off) { dropLayer(k); continue; }
    if (L.rec && !L.started && L.ev) { L.ev(now, L); if (L.started) recNew = true; continue; }
    wanderTick(L.w, now);
    if (L.ev && !L.off) L.ev(now, L);
  }
  if (recNew) applyBed(2);
  if ((rr2++ & 63) === 0) { const use = new Set(); for (const k in AM.layers) if (AM.layers[k].rec) use.add(AM.layers[k].rec); for (const L of LOOPS.values()) if (L.live && L.live.rec) use.add(L.live.rec); SM.loopGC(now, use); }
  const bed = BEDS[AM.mood];
  if (bed && now > AM.nextEv && AM.level > 0.2) {
    const keys = Object.keys(bed.ev), tot = keys.reduce((s, k) => s + bed.ev[k], 0);
    let r = Math.random() * tot, k = keys[0];
    for (const kk of keys) { r -= bed.ev[kk]; if (r <= 0) { k = kk; break; } }
    try { EVENTS[k](); } catch (e) { if (import.meta.env?.DEV) console.warn('[amb]', k, e); }
    AM.nextEv = now + rand(bed.gap[0], bed.gap[1]);
  }
  if (now - loopT > 0.25) { // 循環音依距離啟停
    loopT = now;
    for (const L of LOOPS.values()) {
      const K = LOOPK[L.kind], d = distTo(L.pos), sameish = Math.abs(levelOf(L.pos.y - 0.3) - levelOf(A.L.y - 1.65)) <= 1;
      if (!L.live && d < K.r + 8 && LOOP_REC[L.kind]) SM.loop(LOOP_REC[L.kind][0]); // 快走到時先載錄音
      if (!L.live && d < K.r && sameish) startLive(L);
      else if (L.live && (d > K.r + 5 || !sameish)) stopLive(L);
    }
  }
  for (const L of LOOPS.values()) if (L.live) { wanderTick(L.live.w, now); if (L.live.ev) L.live.ev(now, L.live); }
});

export const _LAYERS = LAYERS, _BEDS = BEDS;

// 換地圖:停掉所有定位循環音、清掉區域/佈局快取,下一次 tick 依新 World 的區域重新判斷(新地圖的區域資料由新的 World 提供)
export function resetAmbience() {
  for (const k of [...LOOPS.keys()]) loopStop(k);
  Object.assign(AM, { zone: null, zoneObj: null, explicit: false, pending: null, pendAuto: null, layout: null, layoutReq: false, power: 1, autoT: -9 });
  if (A.ctx && AM.out && AM.outCtx === A.ctx) applyBed(1);
}
// 資料驅動的擴充點:新地圖可以註冊自己的 mood 音床(格式同 BEDS:L 常駐層音量、ev 隨機事件權重、gap 事件間隔、sp 預設殘響空間)
export function defineMood(name, bed) {
  if (!name || !bed) return;
  BEDS[name] = { L: {}, ev: {}, gap: [4, 10], sp: 'room', ...bed };
}
export const MOODS_LIST = () => Object.keys(BEDS);
export const ambState = () => ({ mood: AM.mood, zone: AM.zone, space: A.space, rt: A.spaceInfo && (A.spaceInfo.rt ?? A.spaceInfo.ir?.dur), layers: Object.keys(AM.layers).map((k) => k + (AM.layers[k].rec && !AM.layers[k].started ? '(載入中)' : '')), loops: [...LOOPS.values()].filter((l) => l.live).length + '/' + LOOPS.size, power: AM.power, explicit: AM.explicit });
export const LOOP_KINDS = Object.keys(LOOPK);
