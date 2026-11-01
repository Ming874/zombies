// 配樂用的音訊核心(取自 test 分支 src/audio/core.js 的一部分):匯流排、大廳殘響、噪音緩衝、50ms 排程、基本音源。
// 掛在 src/audio.js 的主音量節點之後;沒有 AudioContext 時外部呼叫一律不做事。
//  配樂(錄音 + 合成)→ bus.music ┐
//  心跳等點綴            → bus.sfx  ├→ 主音量(audio.js 的 master)
//  遠處撞擊              → bus.amb  ┘
//  合成配樂的殘響 → send.music.hall / send.sfx.hall → 大廳殘響(回授延遲網路)→ 主音量

export const A = {
  ctx: null,
  bus: {},
  send: {},
  noise: null,
  combatT: 0, // 最近一次戰鬥活動(開槍、受傷)的 AudioContext 時間,配樂據此判斷激戰程度
  ambLevel: 1, // 環境嗡鳴的音量比例(配樂狀態決定,audio.js 的 ambient 套用)
  ambG: null,
};

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function gain(v, dest) {
  const g = A.ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

export function filter(type, f, q = 0.7, dest) {
  const b = A.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}

export function curve(n, fn) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1), i);
  return c;
}

// ---------- 初始化 ----------
const ticks = [];
export const onTick = (fn) => ticks.push(fn); // 50ms 排程(配樂共用一個計時器)

// master = audio.js 的主音量節點
export function attach(ctx, master) {
  A.ctx = ctx;
  A.bus.music = gain(0.17, master);
  A.bus.sfx = gain(1, master);
  A.bus.amb = gain(0.7, master);
  A.hall = makeHall(3.2);
  A.hall.out.connect(gain(0.55, master));
  A.send.music = { hall: gain(1, A.hall) };
  A.send.sfx = { hall: gain(1, A.hall) };
  A.noise = { white: noiseBuf(ctx, 'white'), pink: noiseBuf(ctx, 'pink'), brown: noiseBuf(ctx, 'brown') };
  if (A.timer) clearInterval(A.timer);
  A.timer = setInterval(tick, 50);
  return ctx;
}

// 配樂狀態決定環境嗡鳴的音量
export function ambienceLevel(v) {
  A.ambLevel = v;
  if (A.ambG) A.ambG.gain.setTargetAtTime(v, A.ctx.currentTime, 2);
}

// 大廳殘響(便宜的回授延遲網路):預延遲 → 低通 → 4 條互質長度的梳狀濾波(延遲 + 阻尼低通 + 回授)→ 左右各兩條 → 全通擴散。
// 回授量依目標殘響時間 rt:g = 10^(-3·delay/rt)。回傳輸入節點(.out 為輸出)
function makeHall(rt = 3.2) {
  const ctx = A.ctx;
  const inG = gain(1);
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.035;
  const lp = filter('lowpass', 3800, 0.5);
  inG.connect(pre);
  pre.connect(lp);
  const out = gain(1);
  const sides = [ctx.createStereoPanner(), ctx.createStereoPanner()];
  sides[0].pan.value = -0.7; sides[1].pan.value = 0.7;
  const ap = [filter('allpass', 900, 0.6), filter('allpass', 2300, 0.6)];
  for (let i = 0; i < 2; i++) { sides[i].connect(ap[i]); ap[i].connect(out); }
  [0.0897, 0.1013, 0.1171, 0.1283].forEach((dt, i) => {
    const d = ctx.createDelay(0.5);
    d.delayTime.value = dt;
    const damp = filter('lowpass', 2600 - i * 250, 0.5);
    const fb = gain(Math.pow(10, (-3 * dt) / rt) * 0.96);
    lp.connect(d);
    d.connect(damp);
    damp.connect(fb);
    fb.connect(d);
    damp.connect(gain(0.32, sides[i & 1]));
  });
  inG.out = out;
  return inG;
}

// 噪音緩衝(粉紅/棕噪音頭尾交叉淡化,循環播放不爆點)
function noiseBuf(ctx, kind, secs = 4) {
  const sr = ctx.sampleRate, len = sr * secs;
  const b = ctx.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  if (kind !== 'white') {
    const n = Math.floor(sr * 0.25);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      d[len - n + i] = d[len - n + i] * (1 - k) + d[i] * k;
    }
  }
  return b;
}

let rr = 0;
function tick() {
  if (!A.ctx) return;
  const now = A.ctx.currentTime;
  rr++;
  for (const fn of ticks) { try { fn(now, rr); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio tick]', e); } }
}

// ---------- 基本音源 ----------
// 噪音爆發:濾波器頻率可從 f 掃到 f1;包絡 = 線性起音 + (保持) + 指數衰減
export function burst(dest, t, o) {
  const ctx = A.ctx;
  const src = ctx.createBufferSource();
  src.buffer = A.noise[o.buf ?? 'white'];
  src.loop = true;
  const dur = o.dur ?? 0.1;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.glide ?? dur));
  const g = ctx.createGain();
  const a = o.a ?? 0.001, hold = o.hold ?? 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.g ?? 1, t + a);
  if (hold) g.gain.setValueAtTime(o.g ?? 1, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t, Math.random() * 3);
  src.stop(t + a + hold + dur + 0.03);
  return { src, f, g };
}

// 振盪器音:可掃頻
export function tone(dest, t, o) {
  const ctx = A.ctx;
  const osc = ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave);
  else osc.type = o.type ?? 'sine';
  const dur = o.dur ?? 0.2;
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + (o.glide ?? dur));
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const a = o.a ?? 0.002, hold = o.hold ?? 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.g ?? 1, t + a);
  if (hold) g.gain.setValueAtTime(o.g ?? 1, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(t + a + hold + dur + 0.03);
  return { osc, g };
}

// 金屬撞擊:非諧波分音
export function metal(dest, t, f, g, decay = 0.08, ratios = [1, 2.76, 5.4, 8.93]) {
  const ny = A.ctx.sampleRate * 0.45;
  ratios.forEach((r, i) => {
    const fr = f * r * rand(0.99, 1.01);
    if (fr < Math.min(18000, ny)) tone(dest, t, { f: fr, dur: decay / (1 + i * 0.6), g: g / (1 + i * 0.9), a: 0.0005 }); // 超過可聽範圍/取樣上限的分音略過
  });
}
