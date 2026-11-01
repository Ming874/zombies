// 音訊核心:AudioContext、混音匯流排、分區殘響、可重用的 3D 聲道條(strip)、遮蔽與空氣吸收、全域發聲上限(依優先權搶占)、
// 閒置時間預先烘焙、基本音源。沒有 AudioContext 時,外部呼叫一律安全地不做事。
//
// 訊號流:
//  音效(sfx/amb/scare)→ cat.sfx ┐
//  殭屍語音(voice)    → cat.voice ├→ mix → 悶音濾波(爆炸耳鳴/倒地)→ 受傷低通(受傷/低血量)→ sum → 黏合壓縮 → 限幅 → 硬天花板(-1.1 dBFS)→ 主音量 → 喇叭
//  配樂(music)→ 閃避 → cat.music ┘
//  介面音效 → cat.ui(跟音效音量)→ sum(不受悶音/低通影響)
//  殘響:區域殘響(兩個 convolver 交叉淡化,換區時載入依房間尺寸算出的空間)、回聲(戶外/隧道的離散反射)、配樂大廳殘響
//
// 使用者音量(0..1,記在 localStorage 'hz.audio.vol'):master / music / sfx / voice

export const A = {
  ctx: null,
  bus: {},
  L: { x: 0, y: 1.65, z: 0, yaw: 0, fx: 0, fz: -1 }, // 聆聽者(玩家眼睛);fx/fz 面向
  vol: loadVol(), // 使用者音量設定 0..1
  world: null, // attachWorld/attachGame 後可做視線遮蔽、地面材質查詢、區域判斷
  game: null, // attachGame 後可讀畫質預設、玩家狀態(體力、蹲下)
  surface: 'tile', // 玩家目前腳下材質(彈殼落地等用)
  live: [], // 目前發聲中的聲音(全域上限)
  stats: { emitted: 0, culled: 0, stolen: 0, capped: 0, los: 0, rays: 0, tickMs: 0, bakeMs: 0, baked: 0, zcull: 0, zcap: 0, zsteal: 0, znopos: 0, zframe: 0 },
  zvLive: [], // 目前發聲中的殭屍語音
};

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const vg = (v) => v * v; // 音量滑桿 → 增益(近似對數感受)
export const BUSES = ['master', 'music', 'sfx', 'voice'];

function loadVol() {
  const v = { master: 1, music: 1, sfx: 1, voice: 1 };
  try {
    const s = JSON.parse(localStorage.getItem('hz.audio.vol') || 'null');
    if (s) for (const k in v) if (Number.isFinite(s[k])) v[k] = clamp(s[k], 0, 1);
  } catch { /* 無痕模式等 */ }
  return v;
}

function setParams(node, o) {
  for (const k in o) node[k].value = o[k];
  return node;
}

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

// ---------- 畫質 ----------
// 依 game.quality 預設檔決定全域發聲上限與是否用 HRTF(低畫質改等功率平移,省音訊執行緒)
const CAPS = { low: 28, medium: 40, high: 52, ultra: 64 };
function preset() { try { return A.game?.quality?.preset || 'high'; } catch { return 'high'; } }
export const voiceCap = () => A.capOverride || CAPS[preset()] || 48;
const hrtfOn = () => A.hrtf !== false && preset() !== 'low';

// ---------- 初始化 ----------
const ticks = [];
export const onTick = (fn) => ticks.push(fn); // 50ms 排程(配樂、環境、循環音共用一個計時器)

export function attach(ctx) {
  A.ctx = ctx;
  const v = A.vol;
  A.outVol = gain(vg(v.master), ctx.destination);
  A.master = A.outVol; // 設定選單的舊後備路徑會找 A.master
  const ceil = ctx.createWaveShaper(); // 硬天花板:線性到 0.74,之後柔和飽和到 0.877(保證峰值 < -1 dBFS)
  ceil.curve = ceilCurve();
  ceil.oversample = 'none';
  ceil.connect(A.outVol);
  const limiter = setParams(ctx.createDynamicsCompressor(), { threshold: -4, knee: 0, ratio: 20, attack: 0.001, release: 0.09 });
  limiter.connect(ceil);
  const glue = setParams(ctx.createDynamicsCompressor(), { threshold: -12, knee: 8, ratio: 2, attack: 0.01, release: 0.2 });
  glue.connect(limiter);
  A.sum = gain(0.82, glue);
  A.hpLp = filter('lowpass', 20000, 0.6, A.sum); // 受傷/低血量:世界變悶
  A.muffle = filter('lowpass', 20000, 0.5, A.hpLp); // 爆炸耳鳴/倒地
  A.mix = gain(1, A.muffle);
  A.cat = { sfx: gain(vg(v.sfx), A.mix), voice: gain(vg(v.voice), A.mix), music: gain(vg(v.music), A.mix), ui: gain(vg(v.sfx), A.sum) };
  A.bus.sfx = gain(1, A.cat.sfx);
  A.duckVoice = gain(1, A.cat.voice); // 大爆炸時殭屍語音也稍微讓開
  A.bus.voice = gain(0.26, A.duckVoice);
  A.bus.scare = gain(0.75, A.cat.sfx);
  A.duckAmb = gain(1, A.cat.sfx);
  A.bus.amb = gain(0.7, A.duckAmb);
  A.duck = gain(1, A.cat.music);
  A.bus.music = gain(0.17, A.duck);
  A.bus.ui = gain(1, A.cat.ui);

  // ---- 殘響 ----
  A.zrIn = gain(1);
  A.zrOut = gain(1, A.mix);
  A.hallX = gain(0); // 區域殘響時間超過上限時,部分送進大廳網路補長尾巴(建好 A.hall 後接上)
  A.zr = [0, 1].map((i) => {
    const c = ctx.createConvolver();
    const g = gain(i === 0 ? 1 : 0, c);
    A.zrIn.connect(g);
    c.connect(A.zrOut);
    return { c, g, key: null };
  });
  A.zrCur = 0;
  A.echo = makeEcho();
  A.hall = makeHall(3.2);
  A.hall.out.connect(gain(0.55, A.mix));
  A.duckRev = gain(1, A.hall);
  A.zrIn.connect(A.hallX);
  A.hallX.connect(A.hall);
  const sends = (k) => ({ room: gain(vg(v[k]), A.zrIn), echo: gain(vg(v[k]), A.echo.in), hall: gain(vg(v[k]), A.hall) });
  A.send = { sfx: sends('sfx'), voice: sends('voice'), music: { hall: gain(vg(v.music), A.duckRev) } };
  A.room = A.send.sfx.room; // 舊名相容
  A.noise = { white: noiseBuf(ctx, 'white'), pink: noiseBuf(ctx, 'pink'), brown: noiseBuf(ctx, 'brown') };
  A.curves = {};
  A.recentPain = [];
  A.selfStrips = new Map();
  A.live = [];
  A.zvLive = [];
  A.lastDuck = -1;
  A.muffleUntil = 0;
  for (const k in POOLS) POOLS[k].strips = [];
  setListener(A.L.x, A.L.y, A.L.z, A.L.yaw, true);
  setSpace(A.space || 'corridor', true);
  if (A.timer) clearInterval(A.timer);
  if (typeof ctx.startRendering !== 'function') A.timer = setInterval(tick, 50);
  return ctx;
}

export function ensure() {
  if (A.ctx) return A.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    return attach(new AC({ latencyHint: 'interactive' }));
  } catch {
    return null;
  }
}

function ceilCurve() {
  const n = 8192, c = new Float32Array(n), k = 0.74, h = 0.885 - k;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= k ? a : k + h * Math.tanh((a - k) / h));
  }
  return c;
}

// ---------- 音量(設定選單用) ----------
export function setVolume(kind, v) {
  if (!(kind in A.vol)) return;
  A.vol[kind] = clamp(+v || 0, 0, 1);
  try { localStorage.setItem('hz.audio.vol', JSON.stringify(A.vol)); } catch { /* 忽略 */ }
  if (!A.ctx) return;
  const t = A.ctx.currentTime, V = A.vol, set = (p, x) => p.setTargetAtTime(x, t, 0.04);
  set(A.outVol.gain, vg(V.master));
  set(A.cat.sfx.gain, vg(V.sfx));
  set(A.cat.ui.gain, vg(V.sfx));
  set(A.cat.voice.gain, vg(V.voice));
  for (const k in A.send.sfx) set(A.send.sfx[k].gain, vg(V.sfx));
  for (const k in A.send.voice) set(A.send.voice[k].gain, vg(V.voice));
  set(A.cat.music.gain, vg(V.music));
  set(A.send.music.hall.gain, vg(V.music));
}
export const getVolume = (kind) => A.vol[kind];

// ---------- 殘響脈衝 ----------
// 早期反射(er 個)+ 平行牆面的顫動回聲(flutter)+ 越後面越暗的指數衰減
export function makeIR(ctx, o) {
  const sr = ctx.sampleRate, dur = o.dur, len = Math.floor(sr * dur * 0.78), pre = o.pre ?? 0.01; // 衰減到 -47dB 就截斷(省卷積運算)
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let k = 0; k < (o.er ?? 12); k++) {
      const i = Math.floor((pre + Math.random() * (o.erSpan ?? 0.06)) * sr);
      if (i < len) d[i] += (Math.random() < 0.5 ? -1 : 1) * (0.8 - k * 0.035) * (o.erG ?? 1);
    }
    if (o.flutter) { // 走廊/樓梯間:固定間隔的反射串
      const per = o.flutter * (ch ? 1.07 : 1);
      for (let tt = pre + per, a = 0.5; tt < Math.min(dur, 0.6); tt += per, a *= 0.82) d[Math.floor(tt * sr)] += (ch ? -a : a) * (o.flutterG ?? 0.6);
    }
    let y = 0;
    const damp = o.damp ?? 0.6, bright = o.bright ?? 0.92;
    for (let i = Math.floor(pre * sr); i < len; i++) {
      const u = i / (len / 0.78);
      const a = Math.max(0.02, bright - damp * u);
      y += a * (Math.random() * 2 - 1 - y);
      d[i] += y * Math.exp((-6.9 * i) / sr / dur) * 0.6;
    }
    const fade = Math.floor(sr * 0.02); // 尾端淡出避免截斷
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
  }
  return b;
}

// 空間預設(沒有區域幾何時用):dur 殘響長度、wet 送出量、echo 離散回聲(戶外遠處建物、隧道)
export const SPACES = {
  padded: { ir: { dur: 0.28, pre: 0.003, damp: 0.85, bright: 0.45, er: 6, erSpan: 0.012 }, wet: 0.35, echo: 0 },
  small: { ir: { dur: 0.55, pre: 0.004, damp: 0.7, bright: 0.8, er: 10, erSpan: 0.02 }, wet: 0.6, echo: 0 },
  room: { ir: { dur: 0.9, pre: 0.006, damp: 0.6, bright: 0.85, er: 12, erSpan: 0.03 }, wet: 0.75, echo: 0 },
  corridor: { ir: { dur: 1.5, pre: 0.008, damp: 0.5, bright: 0.9, er: 14, erSpan: 0.05, flutter: 0.016, flutterG: 0.35 }, wet: 0.9, echo: 0.05, e: [0.07, 0.11, 0.25] },
  tile: { ir: { dur: 1.7, pre: 0.006, damp: 0.35, bright: 0.96, er: 16, erSpan: 0.03, flutter: 0.012, flutterG: 0.3 }, wet: 1, echo: 0 },
  hall: { ir: { dur: 3.6, pre: 0.03, damp: 0.75, bright: 0.85, er: 18, erSpan: 0.09 }, wet: 1.15, echo: 0.12, e: [0.13, 0.19, 0.3] },
  chapel: { ir: { dur: 4.2, pre: 0.025, damp: 0.85, bright: 0.75, er: 16, erSpan: 0.08 }, wet: 1.25, echo: 0.05, e: [0.1, 0.16, 0.25] },
  stair: { ir: { dur: 2.3, pre: 0.005, damp: 0.4, bright: 0.95, er: 16, erSpan: 0.03, flutter: 0.021, flutterG: 0.45 }, wet: 1.2, echo: 0.1, e: [0.045, 0.065, 0.4] },
  tunnel: { ir: { dur: 2.8, pre: 0.012, damp: 0.6, bright: 0.85, er: 14, erSpan: 0.05, flutter: 0.028, flutterG: 0.3 }, wet: 1.1, echo: 0.35, e: [0.12, 0.17, 0.45] },
  industrial: { ir: { dur: 2.1, pre: 0.01, damp: 0.5, bright: 0.9, er: 14, erSpan: 0.06 }, wet: 1, echo: 0.15, e: [0.09, 0.14, 0.3] },
  outdoor: { ir: { dur: 0.6, pre: 0.012, damp: 0.9, bright: 0.6, er: 4, erSpan: 0.03, erG: 0.6 }, wet: 0.22, echo: 0.55, e: [0.31, 0.47, 0.32], out: true },
  open: { ir: { dur: 0.5, pre: 0.012, damp: 0.9, bright: 0.55, er: 3, erSpan: 0.02, erG: 0.5 }, wet: 0.16, echo: 0.4, e: [0.48, 0.66, 0.22], out: true },
};
const irCache = new Map();
const IR_MAX = 2.2; // 卷積脈衝的殘響時間上限(秒);更長的空間另外加大廳延遲網路的送出量

// 換空間:key 為預設名稱,或傳入 { key, ir, wet, echo, e, out }(rooms.js 依房間尺寸算出)。
// 新 IR 載入閒置的 convolver,輸入端交叉淡化(舊空間的殘響尾巴自然消失)
export function setSpace(key, now = false) {
  const S = typeof key === 'object' && key ? key : SPACES[key] || SPACES.corridor;
  const k = typeof key === 'object' && key ? key.key : SPACES[key] ? key : 'corridor';
  A.space = k;
  A.spaceInfo = S;
  A.outdoor = !!S.out;
  if (!A.ctx) return;
  const t = A.ctx.currentTime, tc = now ? 0.001 : 0.25;
  let slot = A.zr.findIndex((z) => z.key === k);
  if (slot < 0) {
    slot = 1 - A.zrCur;
    const z = A.zr[slot];
    let ir = irCache.get(k);
    if (!ir || ir.sampleRate !== A.ctx.sampleRate) {
      ir = makeIR(A.ctx, S.ir.dur > IR_MAX ? { ...S.ir, dur: IR_MAX } : S.ir);
      if (irCache.size > 40) irCache.delete(irCache.keys().next().value);
      irCache.set(k, ir);
    }
    z.c.buffer = ir;
    z.key = k;
  }
  A.zr.forEach((z, i) => z.g.gain.setTargetAtTime(i === slot ? S.wet : 0, t, tc));
  const extra = S.ir && S.ir.dur > IR_MAX ? Math.min(0.5, (S.ir.dur - IR_MAX) * 0.25) : 0; // 超長殘響的尾巴
  if (A.hallX) A.hallX.gain.setTargetAtTime(extra, t, tc);
  A.zrCur = slot;
  const E = A.echo, e = S.e || [0.25, 0.37, 0.3];
  E.in.gain.setTargetAtTime(S.echo, t, tc * 2);
  E.dl.delayTime.setTargetAtTime(e[0], t, now ? 0.001 : 0.6);
  E.dr.delayTime.setTargetAtTime(e[1], t, now ? 0.001 : 0.6);
  E.fl.gain.setTargetAtTime(e[2], t, tc);
  E.fr.gain.setTargetAtTime(e[2] * 0.9, t, tc);
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

// 回聲網路:左右兩條不同長度的延遲 + 回授 + 低通(每次反射越來越暗)
function makeEcho() {
  const ctx = A.ctx;
  const inG = gain(0);
  const lp = filter('lowpass', 2600, 0.5);
  const hp = filter('highpass', 160, 0.5, lp);
  inG.connect(hp);
  const out = gain(0.8, A.mix);
  const side = (pan, t) => {
    const d = ctx.createDelay(1.2);
    d.delayTime.value = t;
    const fb = gain(0.3);
    const damp = filter('lowpass', 2200, 0.5, fb);
    lp.connect(d);
    d.connect(damp);
    fb.connect(d);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    d.connect(p);
    p.connect(out);
    return [d, fb];
  };
  const [dl, fl] = side(-0.55, 0.25), [dr, fr] = side(0.55, 0.37);
  return { in: inG, dl, dr, fl, fr };
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

// 柔性飽和曲線(快取)
export function shaper(k, dest) {
  const ws = A.ctx.createWaveShaper();
  const key = k.toFixed(2);
  if (!A.curves[key]) {
    const n = 1024, c = new Float32Array(n), t = Math.tanh(k);
    for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / t;
    A.curves[key] = c;
  }
  ws.curve = A.curves[key];
  ws.oversample = '2x';
  if (dest) ws.connect(dest);
  return ws;
}

// ---------- 聆聽者 ----------
let lsT = -1, lsX = 1e9, lsY = 0, lsZ = 0, lsYaw = 0;
export function setListener(x, y, z, yaw, force = false) {
  const L = A.L;
  L.x = x; L.y = y; L.z = z; L.yaw = yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  L.fx = fx; L.fz = fz;
  if (!A.ctx) return;
  const now = performance.now();
  const moved = Math.abs(x - lsX) + Math.abs(y - lsY) + Math.abs(z - lsZ), turned = Math.abs(yaw - lsYaw);
  if (!force && (now - lsT < 33 || (moved < 0.03 && turned < 0.01))) return;
  lsT = now; lsX = x; lsY = y; lsZ = z; lsYaw = yaw;
  const l = A.ctx.listener;
  if (l.positionX) {
    l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
    l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}

export function distTo(p) {
  const L = A.L;
  return Math.hypot(p.x - L.x, (p.y ?? 1.2) - L.y, p.z - L.z);
}

// 聆聽者附近的相對位置(驚嚇音沒給位置時用):ang 0 = 正前方,π = 正後方
export function around(dist, ang, dy = 0) {
  const L = A.L, a = L.yaw + ang;
  return { x: L.x - Math.sin(a) * dist, y: L.y + dy, z: L.z - Math.cos(a) * dist };
}

// ---------- 樓層、遮蔽、空氣吸收 ----------
const LEVEL_H = 4.2;
export function levelOf(y) {
  const w = A.world;
  if (w && w.levelAt) { try { return w.levelAt(y); } catch { /* 用預設 */ } }
  return Math.floor((y + 0.5) / LEVEL_H);
}

// 一條射線是否通(world.rayDistance,命中距離 ≥ 全長 - 5cm 視為通)。回傳命中距離(通 = Infinity)
function ray(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.05) return Infinity;
  A.stats.rays++;
  let h;
  try { h = A.world.rayDistance(ax, ay, az, dx / d, dy / d, dz / d, d); } catch { return Infinity; }
  return h >= d - 0.05 ? Infinity : h;
}

// 遮蔽量 0(通)..1(厚牆):中心射線;擋住時再試左右各偏 0.7m、上方 1.2m 三條(轉角/矮櫃台後面 = 繞射,部分遮蔽),
// 並從聲源反向打一條估計牆厚(薄門板/隔間 < 0.35m 比較透)
function occlusion(px, py, pz, d) {
  const L = A.L;
  A.stats.los++;
  const h1 = ray(L.x, L.y, L.z, px, py, pz);
  if (h1 === Infinity) return 0;
  if (d < 15) {
    const ux = px - L.x, uz = pz - L.z, ul = Math.hypot(ux, uz) || 1, sx = (-uz / ul) * 0.7, sz = (ux / ul) * 0.7;
    if (ray(L.x, L.y, L.z, px + sx, py, pz + sz) === Infinity || ray(L.x, L.y, L.z, px - sx, py, pz - sz) === Infinity || ray(L.x, L.y, L.z, px, py + 1.2, pz) === Infinity) return 0.4;
  }
  const h2 = ray(px, py, pz, L.x, L.y, L.z);
  const thick = h2 === Infinity ? 0 : d - h1 - h2;
  return thick < 0.35 ? 0.7 : 1;
}

// 填入 AC = { cut 低通頻率, g 直達聲增益, rv 殘響送出倍率 }(重用同一個物件,不配置)
const AC = { cut: 20000, g: 1, rv: 1, occ: 0, fl: 0 };
const OCC = new WeakMap();
export function acoustics(px, py, pz, d, s) {
  let cut = 20000 / (1 + d * 0.17); // 空氣吸收 + 遠處繞射:10m ≈ 7kHz、30m ≈ 3.3kHz
  let g = 1, rv = 1;
  const fl = Math.abs(levelOf(py - 0.3) - levelOf(A.L.y - 1.65));
  let occ = fl ? 1 : 0;
  if (A.world && A.world.rayDistance && d > 1.4) {
    const fy = levelOf(py - 0.3) * LEVEL_H, sy = Math.max(py, fy + 1.1); // 抬到離地 1.1m 再測,避免矮櫃台/欄杆把腳步聲整個擋掉
    const key = s && (s.key || s);
    let c = key ? OCC.get(key) : null;
    const L = A.L, now = A.ctx.currentTime;
    if (c && now - c.t < 0.25 && Math.abs(c.lx - L.x) + Math.abs(c.lz - L.z) < 0.5 && Math.abs(c.sx - px) + Math.abs(c.sz - pz) < 0.5) occ = c.v;
    else {
      occ = occlusion(px, sy, pz, d);
      if (key) { if (!c) { c = { t: 0, lx: 0, lz: 0, sx: 0, sz: 0, v: 0 }; OCC.set(key, c); } c.t = now; c.lx = L.x; c.lz = L.z; c.sx = px; c.sz = pz; c.v = occ; }
    }
  }
  if (occ > 0) {
    if (fl && occ >= 0.7) { cut = Math.min(cut, 560 / fl); g = Math.pow(0.38, fl); rv = 0.5; } // 隔著樓板:只剩低頻
    else if (occ < 0.5) { cut = Math.min(cut, 2600); g = 0.72; } // 轉角/門邊:繞射
    else if (occ < 0.9) { cut = Math.min(cut, 1800); g = 0.6; rv = 0.9; } // 薄門板/隔間
    else { cut = Math.min(cut, 1100); g = 0.46; rv = 0.85; } // 厚牆
  }
  AC.cut = Math.max(120, cut); AC.g = g; AC.rv = rv; AC.occ = occ; AC.fl = fl;
  return AC;
}
const revDist = (d) => (0.75 + Math.min(1.3, d / 9)) / (1 + d * 0.07); // 擴散場:殘響量和距離關係不大

// ---------- 殭屍語音的距離模型 ----------
// 殭屍叫聲只有在真的靠近時聽得到:panner 的反比衰減(ref/roll)之外,再乘一段平滑淡出,r0 公尺開始變小、r1 公尺完全無聲;
// 隔牆/隔樓板時可聽距離縮短(× ZV_OCC)、聲音更小更悶;超出可聽距離的叫聲根本不建立節點。
// 同時發聲的殭屍語音有上限(依畫質 3~6 個),滿了由「距離 ÷ 重要度」最小(最近)的勝出,最遠的淡出讓位。
//            r0   r1   ref  roll  重要度 空氣吸收倍率
export const ZV = {
  groan: [7, 14, 1.4, 1.3, 1, 1.4], // 閒置低吼/呻吟
  gurgle: [6, 12, 1.4, 1.3, 1, 1.4],
  breath: [3.5, 8, 1.2, 1.4, 0.8, 1.4], // 喘息、防毒面具呼吸
  pain: [9, 16, 1.5, 1.25, 1.2, 1.3],
  die: [10, 18, 1.6, 1.2, 1.6, 1.3],
  attack: [12, 24, 1.8, 1.15, 1.5, 1.2],
  alert: [13, 25, 1.8, 1.15, 1.5, 1.2], // 發現玩家
  shriek: [15, 30, 2, 1.1, 2, 1.6], // 奔跑者尖嘯
  roar: [18, 34, 3, 1, 2.2, 1.5], // 巨屍咆哮
  scream: [25, 55, 3.5, 0.9, 2.5, 2.3], // 尖叫者的召喚尖叫:傳得遠,但遠處很悶
};
// 遮蔽時的可聽距離倍率:隔樓板(每層)/厚牆/薄牆/繞射
// (不同樓層但射線看似暢通 = 經由樓梯/挑空傳來:仍視為繞射)
export const zvOcc = (occ, fl) => (fl && occ >= 0.7 ? 0.45 / fl : fl ? 0.7 : occ >= 0.9 ? 0.5 : occ >= 0.5 ? 0.62 : occ > 0 ? 0.82 : 1);
// 淡出曲線(r0 之前 1,r1 之後 0,中間二次)
export const zvFade = (d, r0, r1) => (d <= r0 ? 1 : d >= r1 ? 0 : (1 - (d - r0) / (r1 - r0)) ** 2);
const ZV_CAP = { low: 3, medium: 4, high: 5, ultra: 6 };
export const zvCap = () => ZV_CAP[preset()] || 5;
const ZK = { key: null }; // 給 acoustics 用的快取鍵(以聲源物件為 key,和聲道條共用)
// 殭屍語音的進場判斷:回傳 -1 = 不發聲,否則 = 排序值(距離 ÷ 重要度,遮蔽時加倍)
function zvAdmit(Z, pos, d, now) {
  ZK.key = pos;
  const py = pos.y ?? 1.2, ac = acoustics(pos.x, py, pos.z, d, ZK);
  const k = zvOcc(ac.occ, ac.fl);
  if (d > Z[1] * k) { A.stats.zcull++; return -1; }
  const eff = (d / Z[4]) * (k < 1 ? 1.8 : 1);
  const L = A.zvLive;
  for (let i = L.length - 1; i >= 0; i--) if (L[i].dead || L[i].end <= now) { L[i] = L[L.length - 1]; L.pop(); }
  if (L.length < zvCap()) return eff;
  let wi = 0;
  for (let i = 1; i < L.length; i++) if (L[i].eff > L[wi].eff) wi = i;
  if (eff >= L[wi].eff * 0.85) { A.stats.zcap++; return -1; }
  L[wi].kill(); // 最遠的讓位
  L[wi] = L[L.length - 1]; L.pop();
  A.stats.zsteal++;
  return eff;
}
export const zvState = () => ({ live: A.zvLive.filter((h) => !h.dead && h.end > (A.ctx ? A.ctx.currentTime : 0)).map((h) => `${h.zmode}@${h.d.toFixed(1)}m`), cap: zvCap() });

// ---------- 聲道條(重用) ----------
// 每類別預先(延遲)建立固定數量的聲道條:增益 → 低通(空氣吸收/遮蔽/背後頭影)→ panner → 遮蔽增益 → 匯流排,外加殘響/回聲送出。
// 每個聲音只建一個自己的增益節點接到聲道條上;聲道條滿了就依優先權/距離搶占。位置可即時跟隨移動中的聲源。
// hrtf:近距離(< hrtfD 公尺)時用 HRTF(前後上下分得出來),遠的用等功率平移(省運算)
const POOLS = {
  voice: { max: 8, hrtfD: 9, bus: 'voice' }, // 殭屍語音
  step: { max: 8, hrtfD: 6, bus: 'sfx' }, // 腳步、拖行
  fx: { max: 14, hrtfD: 4, bus: 'sfx' }, // 其他定位音效
  gun: { max: 6, hrtfD: 6, bus: 'sfx', steal: true }, // 遠端玩家槍聲(新的一定要出聲)
  scare: { max: 3, hrtfD: 99, bus: 'scare' },
  amb: { max: 8, hrtfD: 4, bus: 'amb' }, // 環境中的定位事件(滴水、管線、烏鴉)
  loop: { max: 10, hrtfD: 0, bus: 'amb' }, // 定位循環音(發電機、電視)
  casing: { max: 4, hrtfD: 0, bus: 'sfx', steal: true }, // 彈殼落地(近、短、多)
};
export const poolInfo = () => {
  const o = {}, n = A.ctx ? A.ctx.currentTime : 0;
  for (const k in POOLS) { const p = POOLS[k]; let a = 0; for (const s of p.strips) if (s.vg && s.end > n) a++; o[k] = `${a}/${p.strips.length}/${p.max}`; }
  return o;
};

function makeStrip(pool) {
  const ctx = A.ctx;
  const s = { pool, vg: null, h: null, end: 0, prio: 0, d: 0, src: null, upd: 0, room: 0, hall: 0, echo: 0, t0: 0, model: 'equalpower', losT: -9, lx: 0, lz: 0, sx: 0, sz: 0, occV: 0, px: 1e9, py: 0, pz: 0, cut: 0, og: 0, rvv: 0 };
  s.in = gain(1);
  s.lp = filter('lowpass', 18000, 0.5);
  const p = (s.pan = ctx.createPanner());
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.maxDistance = 120;
  s.occ = gain(1, A.bus[pool.bus]);
  s.in.connect(s.lp);
  s.lp.connect(p);
  p.connect(s.occ);
  const snd = pool.bus === 'voice' ? A.send.voice : A.send.sfx;
  s.sr = gain(0, snd.room);
  s.se = gain(0, snd.echo);
  s.sh = gain(0, snd.hall);
  s.in.connect(s.sr);
  s.in.connect(s.se);
  s.in.connect(s.sh);
  return s;
}

function release(s) {
  if (s.vg) { try { s.vg.disconnect(); } catch { /* 已斷 */ } }
  if (s.h) s.h.dead = true;
  s.vg = null;
  s.h = null;
  s.src = null;
}

function fadeKill(g, n, len = 0.04) {
  g.gain.cancelScheduledValues(n);
  g.gain.setValueAtTime(g.gain.value, n);
  g.gain.linearRampToValueAtTime(0, n + len);
}

function grab(pool, prio, d, now, model) {
  let free = null, other = null;
  for (const s of pool.strips) if (!s.vg || s.end <= now) { if (s.model === model) { free = s; break; } if (!other) other = s; }
  if (!free && pool.strips.length < pool.max) { const s = makeStrip(pool); s.pan.panningModel = model; s.model = model; pool.strips.push(s); return { s, late: 0 }; }
  free = free || other;
  if (free) { release(free); return { s: free, late: 0 }; }
  let vic = null;
  for (const s of pool.strips) {
    if (pool.steal) { if (!vic || s.t0 < vic.t0) vic = s; } // 搶最舊的
    else if (!vic || s.prio < vic.prio || (s.prio === vic.prio && s.d > vic.d)) vic = s; // 先犧牲優先權低、其次最遠的
  }
  if (!pool.steal && (prio < vic.prio || (prio === vic.prio && d >= vic.d))) return null;
  const old = vic.vg;
  fadeKill(old, now);
  setTimeout(() => { try { old.disconnect(); } catch { /* 已斷 */ } }, 90);
  if (vic.h) vic.h.dead = true;
  vic.vg = null;
  vic.h = null;
  A.stats.stolen++;
  return { s: vic, late: 0.045 }; // 等舊聲音淡出再開始
}

// 更新聲道條的位置/濾波/遮蔽/殘響送出(init = 立即設定;否則平滑滑動)
function pv(prm, v, t) { prm.setValueAtTime(v, t); }
function pt(prm, v, t) { prm.setTargetAtTime(v, t, 0.08); }
function place(s, init, t0) {
  const p = s.src, ctx = A.ctx, t = t0 ?? ctx.currentTime, L = A.L;
  const py = p.y ?? 1.2;
  const dx = p.x - L.x, dz = p.z - L.z, d = Math.hypot(dx, py - L.y, dz);
  s.d = d;
  const ac = acoustics(p.x, py, p.z, d, s);
  let cut = ac.cut, og = ac.g;
  if (s.zv) { // 殭屍語音:可聽距離外淡到無聲;隔牆/樓板更小聲、更悶;距離越遠高頻掉越多
    const Z = s.zv, k = zvOcc(ac.occ, ac.fl);
    og = Math.pow(ac.g, 1.6) * zvFade(d, Z[0] * k, Z[1] * k);
    cut = Math.min(cut, 20000 / (1 + d * 0.17 * Z[5])) * (ac.occ > 0 ? 0.75 : 1);
    if (ac.fl && ac.occ < 0.7) { og *= 0.6; cut = Math.min(cut, 2200); } // 別的樓層經由開口傳來
    s.zg = og;
  }
  if (s.model !== 'HRTF' && d > 0.5) { // 等功率平移沒有頭影:在背後的聲音稍微暗一點,前後才分得出來
    const back = -(dx * L.fx + dz * L.fz) / (Math.hypot(dx, dz) || 1);
    if (back > 0) cut *= 1 - 0.45 * back;
  }
  // 只在數值真的變了才排自動化(每個持續中的 setTarget 都會讓參數變成逐樣本計算:panner 逐樣本算方位、biquad 逐樣本算係數,很貴)
  const pan = s.pan;
  if (init || Math.abs(p.x - s.px) + Math.abs(py - s.py) + Math.abs(p.z - s.pz) > 0.04) {
    if (pan.positionX) { pv(pan.positionX, p.x, t); pv(pan.positionY, py, t); pv(pan.positionZ, p.z, t); } else pan.setPosition(p.x, py, p.z);
    s.px = p.x; s.py = py; s.pz = p.z;
  }
  cut = Math.max(120, cut);
  const rv = revDist(d) * ac.rv;
  if (init) {
    pv(s.lp.frequency, cut, t); pv(s.occ.gain, og, t);
    pv(s.sr.gain, s.room * rv, t); pv(s.se.gain, s.echo * rv, t); pv(s.sh.gain, s.hall * rv, t);
    s.cut = cut; s.og = og; s.rvv = rv;
    return;
  }
  if (Math.abs(cut - s.cut) > s.cut * 0.1) { pt(s.lp.frequency, cut, t); s.cut = cut; }
  if (Math.abs(og - s.og) > 0.04 || (og === 0) !== (s.og === 0)) { pt(s.occ.gain, og, t); s.og = og; }
  if (Math.abs(rv - s.rvv) > s.rvv * 0.15 + 0.01) { pt(s.sr.gain, s.room * rv, t); pt(s.se.gain, s.echo * rv, t); pt(s.sh.gain, s.hall * rv, t); s.rvv = rv; }
}

// ---------- 全域發聲上限 ----------
// 所有聲音(定位或非定位)都登記在 A.live;超過上限時犧牲「優先權最低 → 最遠 → 最舊」的,新聲音比它更不重要就直接不播。
// 優先權參考:9 倒地/死亡、8 自己開槍/近爆炸、7 驚嚇/咆哮、6 尖嘯/遠端槍聲、5 殭屍攻擊/受傷、4 換彈/介面/拾取、
//            3 殭屍痛叫/死亡/近戰、2 腳步/低吼、1 彈著/彈殼、0 環境細節
function purge(now) {
  const L = A.live;
  for (let i = L.length - 1; i >= 0; i--) {
    const h = L[i];
    if (h.dead || h.end <= now) {
      if (!h.strip && !h.dead) { try { h.in.disconnect(); } catch { /* 已斷 */ } }
      h.dead = true;
      L[i] = L[L.length - 1];
      L.pop();
    }
  }
}
function kill(h, now) {
  h.dead = true;
  fadeKill(h.in, now);
  const g = h.in, s = h.strip;
  if (s && s.h === h) { s.vg = null; s.h = null; s.end = 0; }
  setTimeout(() => { try { g.disconnect(); } catch { /* 已斷 */ } }, 90);
}
// 回傳 -1 = 拒絕;否則 = 要延後開始的秒數(等被搶的聲音淡出)
function admit(prio, d, now) {
  purge(now);
  const L = A.live;
  if (L.length < voiceCap()) return 0;
  let vi = -1;
  for (let i = 0; i < L.length; i++) {
    const h = L[i], v = vi >= 0 ? L[vi] : null;
    if (!v || h.prio < v.prio || (h.prio === v.prio && (h.d > v.d + 0.5 || (Math.abs(h.d - v.d) <= 0.5 && h.t0 < v.t0)))) vi = i;
  }
  const v = L[vi];
  if (v.prio > prio || (v.prio === prio && v.d < d - 0.5)) { A.stats.capped++; return -1; }
  kill(v, now);
  L[vi] = L[L.length - 1];
  L.pop();
  A.stats.stolen++;
  return 0.03;
}
// 換地圖:舊地圖上所有定位中的聲音快速淡出、聲道條全部釋放
export function stopPositional() {
  if (!A.ctx) return;
  const n = A.ctx.currentTime;
  for (const k in POOLS) for (const s of POOLS[k].strips) if (s.vg) { fadeKill(s.vg, n, 0.08); const g = s.vg; setTimeout(() => { try { g.disconnect(); } catch { /* 已斷 */ } }, 150); if (s.h) s.h.dead = true; s.vg = null; s.h = null; s.src = null; s.end = 0; }
  purge(n);
}
export const liveCount = () => { if (A.ctx) purge(A.ctx.currentTime); return A.live.length; };

// 發聲:回傳 h = { in(接到這裡), t(開始時間), d, end, kill() };被距離剔除、超過上限或搶不到聲道條時回傳 null
// o:pos 位置(物件會被即時跟隨,track:false 則複製)、cat 聲道條類別、bus 匯流排、prio 優先權、dur 長度、delay、gain、
//    room/hall/echo 殘響送出、ref/roll 距離衰減、maxDist 剔除距離、nocap 不算進全域上限(長時間循環音)
export function emit(o = {}) {
  const ctx = A.ctx;
  if (!ctx) return null;
  const now = ctx.currentTime;
  const pos = o.pos && Number.isFinite(o.pos.x) && Number.isFinite(o.pos.z) ? o.pos : null;
  const delay = o.delay ?? 0, dur = o.dur ?? 1, prio = o.prio ?? (pos ? 1 : 3);
  let d = 0, zeff = 0;
  const Z = o.zv ? ZV[o.zv] || ZV.groan : null;
  if (Z && !pos) { A.stats.znopos++; return null; } // 殭屍語音一定要有位置(不可變成非定位的 2D 聲音)
  if (pos) {
    d = distTo(pos);
    if (!(d <= (Z ? Z[1] : o.maxDist ?? 45))) { A.stats[Z ? 'zcull' : 'culled']++; return null; }
    if (Z) { zeff = zvAdmit(Z, pos, d, now); if (zeff < 0) return null; }
  }
  let late = 0;
  if (!o.nocap) { late = admit(prio, d, now); if (late < 0) return null; }
  const vgN = gain(o.gain ?? 1);
  const h = {
    in: vgN, t: now + 0.006 + delay + late, d, end: now + delay + late + dur + 0.2, prio, t0: now, strip: null, dead: false,
    kill() { // 淡出並提早結束(不再佔用上限名額)
      if (this.dead || !A.ctx) return;
      const n = A.ctx.currentTime;
      fadeKill(vgN, n, 0.05);
      this.end = Math.min(this.end, n + 0.08);
      if (this.strip && this.strip.h === this) this.strip.end = this.end;
    },
  };
  A.stats.emitted++;
  if (!pos) { // 非定位(玩家自己的聲音、介面):接到共用的固定送出聲道,每個聲音只多一個增益節點
    vgN.connect(selfStrip(o.bus ?? 'sfx', o.room ?? 0, o.echo ?? (o.room ? o.room * 0.7 : 0), o.hall ?? 0));
    h.end += 0.1;
    if (!o.nocap) A.live.push(h);
    else setTimeout(() => vgN.disconnect(), (delay + dur + 2.5) * 1000);
    return h;
  }
  const pool = POOLS[o.cat] || POOLS.fx;
  const model = hrtfOn() && d < (o.hrtfD ?? pool.hrtfD) ? 'HRTF' : 'equalpower';
  const got = grab(pool, prio, d, now, model);
  if (!got) { vgN.disconnect(); A.stats.culled++; return null; }
  const s = got.s;
  h.t += got.late;
  h.end += got.late;
  s.vg = vgN;
  s.h = h;
  s.end = h.end;
  s.t0 = now;
  s.prio = prio;
  s.src = o.track === false ? { x: pos.x, y: pos.y, z: pos.z } : pos; // 預設跟著聲源物件移動(殭屍 vp 每幀就地更新)
  s.key = pos; // 遮蔽快取用原始物件
  s.room = o.room ?? 0;
  s.hall = o.hall ?? 0;
  s.echo = o.echo ?? s.room * 0.7;
  s.pan.refDistance = Z ? Z[2] * (o.ref ? Math.max(0.8, Math.min(1.6, o.ref / 1.6)) : 1) : o.ref ?? 1.5;
  s.pan.rolloffFactor = Z ? Z[3] : o.roll ?? 1.1;
  s.zv = Z;
  if (model !== s.model) { s.pan.panningModel = model; s.model = model; }
  s.upd = now;
  place(s, true, now + got.late);
  vgN.connect(s.in);
  h.strip = s;
  if (!o.nocap) A.live.push(h);
  if (Z) { h.eff = zeff; h.zmode = o.zv; A.zvLive.push(h); }
  return h;
}

// 非定位聲音共用的送出聲道(依匯流排與量化後的殘響/回聲/大廳送出量重用)
function selfStrip(bus, room, echo, hall) {
  const q = (x) => Math.round(x * 20) / 20;
  const k = `${bus}|${q(room)}|${q(echo)}|${q(hall)}`;
  let s = A.selfStrips.get(k);
  if (!s) {
    s = gain(1, A.bus[bus]);
    const snd = bus === 'voice' ? A.send.voice : A.send.sfx;
    if (room) s.connect(gain(q(room), snd.room));
    if (echo) s.connect(gain(q(echo), snd.echo));
    if (hall) s.connect(gain(q(hall), snd.hall));
    A.selfStrips.set(k, s);
  }
  return s;
}

// 50ms 排程:清掉播完的聲音、跟隨移動的聲源、輪流更新遮蔽(每條約 150ms 一次)、其他模組的 tick
let rr = 0;
export function tick() {
  const ctx = A.ctx;
  if (!ctx) return;
  const c0 = performance.now();
  const now = ctx.currentTime;
  purge(now);
  let budget = 8; // 每次最多做 8 條的完整聲學更新(含射線查詢,有快取)
  for (const k in POOLS) {
    for (const s of POOLS[k].strips) {
      if (!s.vg) continue;
      if (s.end <= now) { release(s); continue; }
      if (now - s.upd > 0.15 && budget > 0) { budget--; s.upd = now; place(s, false); }
    }
  }
  rr++;
  for (const fn of ticks) { try { fn(now, rr); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio tick]', e); } }
  A.stats.tickMs += performance.now() - c0;
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

// 液體氣泡:正弦快速上滑
export function bubble(dest, t, f, g, len = 0.05) {
  tone(dest, t, { f, f1: f * rand(1.6, 2.3), glide: len * 0.7, dur: len, g, a: 0.003 });
}

// 播放 AudioBuffer(樣本或預烘焙的合成音):rate 音高倍率、off 起點、len 長度、fi/fo 淡入淡出
export function playBuf(dest, t, buf, o = {}) {
  const ctx = A.ctx;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = o.rate ?? 1;
  if (o.loop) { src.loop = true; if (o.ls != null) { src.loopStart = o.ls; src.loopEnd = o.le ?? buf.duration; } }
  let out = src;
  const g = o.g ?? 1;
  if (o.fi || o.fo || (o.len && o.len < buf.duration - 0.05) || Math.abs(g - 1) > 0.01) {
    const e = ctx.createGain();
    const len = o.len ?? (buf.duration - (o.off ?? 0)) / (o.rate ?? 1);
    e.gain.setValueAtTime(o.fi ? 0.0001 : g, t);
    if (o.fi) e.gain.linearRampToValueAtTime(g, t + o.fi);
    if (o.fo && !o.loop) { e.gain.setValueAtTime(g, t + Math.max(o.fi ?? 0, len - o.fo)); e.gain.linearRampToValueAtTime(0.0001, t + len); }
    src.connect(e);
    out = e;
  }
  out.connect(dest);
  src.start(t, o.off ?? 0);
  if (o.len && !o.loop) src.stop(t + o.len + 0.02);
  return { src, g: out };
}

// ---------- 預先烘焙 ----------
// 把一段合成音渲染成 AudioBuffer(頻繁播放的短音效,執行期只剩一個 BufferSource)。sr 可降取樣率省記憶體(低頻為主的聲音)
export function bake(secs, fn, ch = 1, sr) {
  const real = A.ctx;
  const rate = sr || real.sampleRate;
  const oc = new OfflineAudioContext(ch, Math.ceil(secs * rate), rate);
  A.ctx = oc;
  try { fn(oc.destination, 0.002); } finally { A.ctx = real; }
  return oc.startRendering();
}
// 烘焙快取:key → 變體陣列。第一次要用時排進閒置佇列(不在遊戲當下建圖),完成前回傳 null(呼叫端即時合成);
// 至少有一個變體完成就可以用。總量上限約 MAXSEC 聲道秒,超過丟最久沒用的
const BK = new Map(); // key → { bufs: [], want, len, fn, ch, sr, used, pend }
const Q = []; // 待烘焙工作(每項 = 一個變體)
let bakeCh = 0, pumping = false;
const MAXSEC = 160; // 約 30MB 上限(以 48kHz 單聲道換算)
const chSec = (b) => b.duration * b.numberOfChannels * (b.sampleRate / 48000);
function evict() {
  while (bakeCh > MAXSEC && BK.size > 1) {
    let old = null, ok = null;
    for (const [k, e] of BK) if (e.bufs.length && (!old || e.used < old.used)) { old = e; ok = k; }
    if (!old) break;
    for (const b of old.bufs) bakeCh -= chSec(b);
    BK.delete(ok);
  }
}
function schedule(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 120 });
  else setTimeout(() => fn({ timeRemaining: () => 8 }), 16);
}
function pump() {
  if (pumping || !Q.length) return;
  pumping = true;
  schedule((dl) => {
    pumping = false;
    const c0 = performance.now();
    // 每個閒置片段最多花約 4ms 建圖(渲染本身在音訊背景執行緒)
    while (Q.length && performance.now() - c0 < Math.min(4, Math.max(1.5, dl.timeRemaining ? dl.timeRemaining() - 1 : 4))) {
      Q.sort((a, b) => b.pr - a.pr);
      const j = Q.shift(), e = BK.get(j.key);
      if (!e || !A.ctx) continue;
      let p;
      try { p = bake(e.len, e.fn, e.ch, e.sr); } catch { e.pend--; continue; }
      p.then((b) => { e.pend--; if (BK.get(j.key) === e) { e.bufs.push(b); bakeCh += chSec(b); A.stats.baked++; evict(); } }, () => { e.pend--; });
    }
    A.stats.bakeMs += performance.now() - c0;
    pump();
  });
}
// 取得烘焙組:沒有就排程(pr 優先權:遊戲中第一次用到的插隊)
export function baked(key, n, len, fn, ch = 1, sr, pr = 5) {
  let e = BK.get(key);
  if (!e) {
    if (!A.ctx || A.noBake || typeof OfflineAudioContext === 'undefined') return null;
    e = { bufs: [], want: n, len, fn, ch, sr, used: 0, pend: n };
    BK.set(key, e);
    for (let i = 0; i < n; i++) Q.push({ key, pr: pr - i * 0.01 });
    pump();
  }
  e.used = A.ctx ? A.ctx.currentTime : 0;
  return e.bufs.length ? e.bufs : null;
}
// 預先排程(開機/選單時,低優先權)
export function prebake(key, n, len, fn, ch = 1, sr) { return baked(key, n, len, fn, ch, sr, 1); }
export const bakeStats = () => ({ sets: BK.size, queued: Q.length, chSec: +bakeCh.toFixed(1), mb: +((bakeCh * 48000 * 4) / 1048576).toFixed(1), ms: +A.stats.bakeMs.toFixed(0) });

// ---------- 混音動態 ----------
// 音樂/環境(big:連殭屍語音)暫時壓低
export function duck(depth = 0.55, release = 0.35, big = false) {
  if (!A.ctx) return;
  const n = A.ctx.currentTime;
  if (n - A.lastDuck < 0.15 && depth >= A.lastDepth - 0.05) return; // 連射時不必每發重排自動化
  A.lastDuck = n;
  A.lastDepth = depth;
  for (const node of big ? [A.duck, A.duckAmb, A.duckRev, A.duckVoice] : [A.duck, A.duckAmb, A.duckRev]) {
    const p = node.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(n);
    else { p.cancelScheduledValues(n); p.setValueAtTime(p.value, n); }
    p.setTargetAtTime(node === A.duckAmb ? Math.min(1, depth + 0.2) : node === A.duckVoice ? Math.min(1, depth + 0.35) : depth, n, 0.01);
    p.setTargetAtTime(1, n + 0.06, release);
  }
}

// 悶音(爆炸耳鳴、倒地):amount 0..1,hold 秒後恢復(Infinity = 直到 unmuffle);較弱的悶音不會蓋掉正在進行的強悶音
export function muffle(amount, hold = 0.3, release = 2) {
  if (!A.ctx) return;
  const p = A.muffle.frequency, n = A.ctx.currentTime;
  const cut = 20000 * Math.pow(1 - clamp(amount, 0, 0.98), 2.6);
  if (amount > 0 && n < A.muffleUntil && cut > A.muffleCut) return;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(n); else p.cancelScheduledValues(n);
  p.setTargetAtTime(Math.max(160, cut), n, 0.03);
  A.muffleCut = cut;
  A.muffleUntil = amount > 0 ? n + (Number.isFinite(hold) ? hold + release * 0.5 : 1e9) : 0;
  if (Number.isFinite(hold)) p.setTargetAtTime(20000, n + hold, release / 3);
}

// 受傷低通:血量比例 r(0..1)決定常駐的悶感(< 35% 才開始,量化成 400Hz 一階,不會每幀重排自動化),
// pain 0..1 是剛受傷的瞬間悶一下(約 1 秒恢復)
let hpBase = 20000, hpSet = 20000, hpPainT = 0;
export function hurtFilter(r, pain = 0) {
  if (!A.ctx) return;
  const n = A.ctx.currentTime, p = A.hpLp.frequency;
  if (Number.isFinite(r)) hpBase = r < 0.35 ? Math.round((3200 + (clamp(r, 0, 1) / 0.35) * 9000) / 400) * 400 : 20000;
  if (pain > 0) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(n); else p.cancelScheduledValues(n);
    p.setTargetAtTime(Math.min(hpBase, 900 + 5000 * (1 - clamp(pain, 0, 1))), n, 0.015);
    p.setTargetAtTime(hpBase, n + 0.12, 0.35);
    hpSet = hpBase;
    hpPainT = n + 0.5;
    return;
  }
  if (hpBase !== hpSet && n > hpPainT) { p.setTargetAtTime(hpBase, n, 0.6); hpSet = hpBase; }
}

// 隨機曲線(setValueCurveAtTime 用)
export function curve(n, fn) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1), i);
  return c;
}
