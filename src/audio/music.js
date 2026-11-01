// 程式生成的恐怖配樂(環境音已移到 ambience.js)。
// 常駐層:低頻 drone、不和諧弦樂 cluster(顫音隨威脅升高)。
// 排程層(200ms lookahead):心跳、戰鬥打擊脈動(7/8 拍)、隨機事件(走音音樂盒、金屬刮擦、遠處撞擊、低語、驚嚇漸強、低音和弦)。
// 有錄音配樂播放時(tracks.js),程式配樂自動退到背景只留脈動、心跳與點綴。
// 配樂狀態:menu(主選單)、fight(回合中,自動分成 explore 探索 / tension 緊張 / fight 激戰三段強度)、boss(巨屍在場)、
// break / shop(回合間休息、補給)、dead(遊戲結束)。也可以直接 setMood('explore'|'tension') 指定。
// 強度 = max(最近殭屍的距離緊張度, 最近的戰鬥活動:開槍/受傷/近戰);升級快(1 秒)、降級慢(10 秒),每段至少停留 8 秒,切換時錄音配樂交叉淡化。
// 情境覆蓋(每 0.4 秒判斷,優先順序由上而下;都是 folk.js 烘焙的原創配樂床,循環播放、交叉淡化):
//   chase 追逐(game.chase 演出中;北管通鼓 + 大鑼 + 低音弦樂頑固音型 + 嗩吶哭喊)、touqi 頭七(低鑼、引魂鈴、合唱)、
//   blackout 停電類大場面之後 28 秒(幾乎只剩空間)、dread 休息時恐懼值高(嗡鳴、氣聲合唱、預置鋼琴、遠處走音的《望春風》音樂盒)。
//   shop 補給站 = 溫暖的舊電鋼琴《六月茉莉》。配樂床還沒烘焙好時先用 fb 指定的錄音配樂(追逐 → boss)。
// 探索/休息的錄音配樂會「留白」:播 70~140 秒後淡出、安靜 30~75 秒再換下一首(tracks.js);留白時合成層也壓到很低。
// 區域色彩(folk 事件):病房 → 遠處的音樂盒/孩子哼唱片段、太平間/禮拜堂 → 誦經片段、戶外 → 遠處的北管鑼鼓/引魂鈴。
import { A, onTick, burst, tone, metal, gain, filter, rand, pick, clamp, curve } from './core.js';
import { ambienceLevel } from './ambience.js';
import * as TR from './tracks.js';
import { FS, folkBuf, fragment, folkTheme } from './folk.js';

const MOODS = {
  explore: { drone: 0.5, pad: 0.35, pulse: 0, amb: 1, ev: { box: 0.6, scrape: 1, boom: 1, whisper: 1.5, stinger: 0, cluster: 1, folk: 1.2 }, gap: [7, 14] },
  tension: { drone: 0.65, pad: 0.5, pulse: 0.25, amb: 1, ev: { box: 0.3, scrape: 2, boom: 2, whisper: 1, stinger: 1, cluster: 1, folk: 0.4 }, gap: [5, 11] },
  menu: { drone: 0.6, pad: 0.45, pulse: 0, amb: 0.85, ev: { box: 1.5, scrape: 1, boom: 1, whisper: 2, stinger: 0, cluster: 1, folk: 1.5 }, gap: [6, 12] },
  fight: { drone: 0.7, pad: 0.5, pulse: 0.4, amb: 1, ev: { box: 0.5, scrape: 2, boom: 2, whisper: 1, stinger: 1.5, cluster: 1 }, gap: [5, 11] },
  boss: { drone: 1, pad: 0.85, pulse: 1, amb: 0.8, ev: { box: 0, scrape: 2, boom: 2, whisper: 0, stinger: 2, cluster: 2 }, gap: [4, 8], tempo: 1.2 },
  break: { drone: 0.45, pad: 0.35, pulse: 0, amb: 1, ev: { box: 1, scrape: 1, boom: 1, whisper: 2, stinger: 0, cluster: 1, folk: 1.5 }, gap: [6, 13] },
  shop: { drone: 0.12, pad: 0.08, pulse: 0, amb: 1, ev: { box: 0.5, scrape: 0.2, boom: 0.3, whisper: 0.5, stinger: 0, cluster: 0 }, gap: [8, 16], bed: 'bed_safe', fb: 'shop' },
  dead: { drone: 0.35, pad: 0, pulse: 0, amb: 0.45, ev: {}, gap: [99, 99] },
  // 情境覆蓋(配樂床;bed = folk.js 的烘焙鍵,fb = 還沒烘焙好時的錄音配樂)
  chase: { drone: 0, pad: 0, pulse: 0, amb: 0.8, ev: {}, gap: [99, 99], bed: 'bed_chase', fb: 'boss' },
  touqi: { drone: 0, pad: 0, pulse: 0, amb: 0.8, ev: {}, gap: [99, 99], bed: 'bed_touqi' },
  blackout: { drone: 0, pad: 0, pulse: 0, amb: 0.9, ev: { whisper: 1, scrape: 0.5 }, gap: [10, 18], bed: 'bed_blackout' },
  dread: { drone: 0, pad: 0, pulse: 0, amb: 1, ev: { whisper: 1, folk: 1.5, scrape: 0.5 }, gap: [9, 16], bed: 'bed_dread', fb: 'explore' },
};
const BEDV = { bed_chase: 1.15, bed_touqi: 1.25, bed_blackout: 0.9, bed_dread: 1.05, bed_safe: 1.25 }; // 配樂床的音量:追逐 ≈ 錄音配樂(約 -19 dB),補給站略低,恐懼/頭七 -24、停電 -27

const CLUSTERS = [[0, 1, 6, 7, 11], [-2, 0, 1, 5, 6], [0, 3, 4, 8, 13], [-1, 0, 5, 6, 10], [0, 1, 2, 7, 8], [-5, 0, 1, 6, 12]];
const ROOTS = [36.71, 34.65, 38.89, 32.7]; // D1 C#1 D#1 C1
const BOX = [0, 1, 3, 6, 7, 10, 12, 13];

const M = {
  started: false, mood: 'fight', sub: 'tension', subT: 0, upT: 0, downT: 0, moodSet: false, tension: 0, tTarget: 0, health: 0, pain: 0, spike: 0, spikeEnd: 0,
  nextBeat: 0, step: 0, bar: 0, nextHeart: 0, nextEvent: 0, nextRetune: 0, nextSwell: 0, trackMix: 0,
};

export function startMusic() {
  if (!A.ctx || (M.started && M.ctx === A.ctx)) return;
  M.started = true;
  M.ctx = A.ctx;
  M.layers = false;
  const now = A.ctx.currentTime;
  buildLayers();
  const t = now + 0.5;
  Object.assign(M, { nextBeat: t, nextHeart: t, nextEvent: t + rand(3, 6), nextRetune: t + rand(20, 35), nextSwell: t + 2, quietSince: 0 });
  applyMood(2.5);
  syncTracks();
}
// 實際要用的狀態(fight 依強度分段)
const trackMood = () => M.ov || (M.mood === 'fight' ? M.sub : M.mood);
// 配樂床播放器(循環的烘焙緩衝 → 配樂匯流排;交叉淡化)
const BD = { key: null, s: null, g: null, wait: null };
function bedSet(key) {
  if (key === BD.key || !A.ctx) return;
  const n = A.ctx.currentTime, fast = key === 'bed_chase' || BD.key === 'bed_chase';
  if (BD.s) {
    const { s, g } = BD;
    g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + (fast ? 1.2 : 3.5));
    try { s.stop(n + 3.7); } catch { /* 已停 */ }
    setTimeout(() => { try { g.disconnect(); } catch { /* 已斷 */ } }, 4000);
  }
  BD.key = null; BD.s = BD.g = null;
  if (!key) return;
  const b = folkBuf(key, 9);
  if (!b) return;
  const s = A.ctx.createBufferSource(), g = gain(0, A.bus.music);
  g.connect(gain(0.45, A.send.music.hall));
  s.buffer = b; s.loop = true; s.connect(g);
  s.start(n, key === 'bed_chase' ? 0 : rand(0, b.duration * 0.9));
  g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(BEDV[key] ?? 1.5, n + (key === 'bed_chase' ? 0.5 : 4));
  Object.assign(BD, { key, s, g });
}
// 依目前狀態切換錄音配樂/配樂床
function syncTracks() {
  const k = trackMood(), m = MOODS[k] || {};
  BD.wait = null;
  if (m.bed && A.ctx) {
    if (folkBuf(m.bed, 9)) { TR.setTrackMood('bed'); bedSet(m.bed); return; }
    BD.wait = m.bed; bedSet(null); TR.setTrackMood(m.fb || 'bed'); return;
  }
  bedSet(null);
  TR.setTrackMood(k);
}
// 情境覆蓋:追逐 > 頭七 > 停電 > 恐懼累積
function overlay(t) {
  if (M.mood === 'menu' || M.mood === 'dead') return null;
  const g = A.game;
  try { if (g && g.chase && g.chase.P && g.chase.P.on) return 'chase'; } catch { /* 略 */ }
  if (t < FS.touqiUntil) return 'touqi';
  if (t < FS.blackUntil) return 'blackout';
  const D = g && g.horror && g.horror.director;
  if (D && M.mood === 'break' && !D.chasing && D.dread > 55 && D.tension < 0.3) return 'dread';
  return null;
}
function updateOverlay(t) {
  const w = overlay(t);
  if (w === M.ov) { M.ovT = 0; return; }
  if (w !== 'chase') { if (!M.ovT) M.ovT = t; if (t - M.ovT < (w ? 1.5 : 4)) return; } // 進入要穩定 1.5 秒、離開 4 秒(追逐立刻)
  M.ov = w; M.ovT = 0;
  syncTracks();
  applyMood(w === 'chase' ? 0.8 : 3);
}
const P = () => MOODS[trackMood()] || MOODS.fight;

// 常駐的 drone 與弦樂層(錄音配樂播放一段時間後整組停掉省 CPU,沒有錄音時再建回來)
function buildLayers() {
  if (M.layers) return;
  M.layers = true;
  const ctx = A.ctx;
  const mus = A.bus.music, hall = A.send.music.hall;
  M.srcs = [];

  // ---- drone ----
  M.droneOut = gain(0, mus);
  M.droneOut.connect(gain(0.35, hall));
  const dlp = filter('lowpass', 170, 2.5, M.droneOut);
  const dl = ctx.createOscillator();
  dl.frequency.value = 0.043;
  dl.connect(gain(80, dlp.frequency));
  dl.start();
  M.srcs.push(dl);
  const breath = gain(0.75, dlp);
  const bl = ctx.createOscillator();
  bl.frequency.value = 0.071;
  bl.connect(gain(0.22, breath.gain));
  bl.start();
  M.srcs.push(bl);
  M.drone = [];
  [['sawtooth', 1, 0.16], ['sawtooth', 1.0068, 0.16], ['triangle', 2.12, 0.12], ['sine', 1, 0.18], ['sawtooth', 1.498, 0.06]].forEach(([type, r, g]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = ROOTS[0] * r;
    o.connect(gain(g, breath));
    o.start();
    M.srcs.push(o);
    M.drone.push({ o, r });
  });

  // ---- 弦樂 cluster ----
  M.padOut = gain(0, mus);
  M.padOut.connect(gain(0.6, hall));
  M.padSwell = gain(0.6, M.padOut);
  M.padLp = filter('lowpass', 1000, 0.8, M.padSwell);
  M.trem = ctx.createOscillator();
  M.trem.frequency.value = 5;
  M.tremDepth = gain(0.08);
  M.trem.connect(M.tremDepth);
  M.trem.start();
  M.srcs.push(M.trem);
  const vib = ctx.createOscillator();
  vib.frequency.value = 4.7;
  const vibD = gain(7, null);
  vib.connect(vibD);
  vib.start();
  M.srcs.push(vib);
  M.pad = CLUSTERS[0].map((st, i) => {
    const tg = gain(0.8, null);
    M.tremDepth.connect(tg.gain);
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.7 + (1.4 * i) / 4;
    tg.connect(pan);
    pan.connect(M.padLp);
    const f = 146.83 * Math.pow(2, st / 12);
    const oscs = [-6, 6].map((c) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = c + rand(-3, 3);
      vibD.connect(o.detune);
      o.connect(gain(0.045, tg));
      o.start();
      M.srcs.push(o);
      return o;
    });
    return { oscs };
  });
}

function dropLayers() {
  if (!M.layers) return;
  M.layers = false;
  const n = A.ctx.currentTime;
  M.droneOut.gain.setTargetAtTime(0, n, 0.3);
  M.padOut.gain.setTargetAtTime(0, n, 0.3);
  const srcs = M.srcs, outs = [M.droneOut, M.padOut];
  setTimeout(() => { for (const o of srcs) { try { o.stop(); } catch { /* 已停 */ } } for (const g of outs) g.disconnect(); }, 2000);
}

function applyMood(tc = 2) {
  if (!M.started || !M.layers) { if (M.started) ambienceLevel(P().amb); return; }
  const m = P();
  const n = A.ctx.currentTime, back = (1 - 0.75 * M.trackMix) * (TR.resting() ? 0.3 : 1);
  M.droneOut.gain.setTargetAtTime(m.drone * 0.3 * back, n, tc);
  M.padOut.gain.setTargetAtTime(m.pad * 1.6 * back, n, tc);
  ambienceLevel(m.amb);
}

export function setMood(mood) {
  if (!MOODS[mood]) return;
  M.moodSet = true;
  if (mood === M.mood) return;
  const prev = M.mood;
  M.mood = mood;
  if (mood === 'fight') { M.sub = 'tension'; M.subT = A.ctx ? A.ctx.currentTime : 0; }
  if (mood === 'menu' || mood === 'dead') M.ov = null;
  syncTracks();
  if (!M.started) return;
  applyMood(mood === 'dead' ? 0.6 : 2);
  const n = A.ctx.currentTime;
  if (mood === 'dead') deathChord(n + 0.05);
  else if (prev === 'dead' && M.layers) M.drone.forEach((x) => x.o.frequency.setTargetAtTime(ROOTS[0] * x.r, n, 2));
  if (mood === 'boss' && prev !== 'boss') stinger(n + 0.05, 1.4);
  M.nextEvent = Math.min(M.nextEvent, n + rand(2, 4));
}

// 回合開始/結束時的預設氣氛(主線程若有明確 setMood 則以它為準)
export function autoMood(mood) {
  if (M.mood === 'boss' && mood === 'fight') return;
  const keep = M.moodSet;
  setMood(mood);
  M.moodSet = keep;
}

export const musicState = () => ({ mood: M.mood, sub: M.sub, overlay: M.ov || null, bed: BD.key, bedWait: BD.wait, resting: TR.resting(), intensity: +(M.intensity || 0).toFixed(2), tension: +M.tension.toFixed(2), trackMix: M.trackMix, layers: M.layers });
export const musicMood = () => trackMood();
export function setTension(x) { M.tTarget = clamp(+x || 0, 0, 1); }
export function setHealth(r) { M.health = clamp((0.45 - (+r || 0)) / 0.45, 0, 1); }
export function addPain(v) { M.pain = Math.min(1, M.pain + v); }
// 驚嚇:心跳突然變快變大,sec 秒內慢慢平復
export function heartSpike(sec = 8) {
  if (!A.ctx) return;
  M.spike = 1;
  M.spikeEnd = A.ctx.currentTime + sec;
  M.spikeLen = sec;
}

// ---------- 排程 ----------
let rr = 0;
onTick((t) => {
  const ctx = A.ctx;
  if (!M.started || M.ctx !== ctx || (ctx.state !== 'running' && typeof ctx.startRendering !== 'function')) return;
  const ahead = t + 0.2;
  if (M.mood === 'fight') updateSub(t);
  if (t - (M.ovCk || 0) > 0.4) { M.ovCk = t; updateOverlay(t); if (BD.wait && folkBuf(BD.wait, 9)) syncTracks(); TR.trackTick(t); }
  const m = P();
  M.tension += (M.tTarget - M.tension) * 0.07;
  M.intensity = Math.max(M.tension, A.combatT ? clamp(1 - (t - A.combatT) / 14, 0, 1) * 0.75 : 0);
  M.pain = Math.max(0, M.pain - 0.015);
  const T = M.tension;
  const tm = Math.max(TR.trackLevel(), BD.s ? 1 : 0);
  if (Math.abs(tm - M.trackMix) > 0.05) { M.trackMix = tm; if (!tm) buildLayers(); applyMood(3); M.quietSince = t; }
  if (M.trackMix > 0.95 && M.layers && t - M.quietSince > 8) dropLayers(); // 錄音配樂穩定播放:停掉常駐合成層
  const back = (1 - 0.75 * M.trackMix) * (TR.resting() ? 0.3 : 1); // 留白時合成層也幾乎退掉

  if (M.layers && (rr++ & 3) === 0) { // 每 200ms 更新一次即可
    M.trem.frequency.setTargetAtTime(4 + T * 6 + (M.mood === 'boss' ? 2 : 0), t, 0.5);
    M.tremDepth.gain.setTargetAtTime(0.05 + T * 0.45, t, 0.5);
    M.padLp.frequency.setTargetAtTime(800 + T * 1700 + (M.mood === 'boss' ? 600 : 0), t, 0.8);
    M.droneOut.gain.setTargetAtTime(m.drone * 0.3 * (1 + T * 0.4) * back, t, 1.5);
  }
  if (M.layers && t > M.nextSwell) {
    M.padSwell.gain.setTargetAtTime(rand(0.25, 1), t, rand(2, 4));
    M.nextSwell = t + rand(5, 12);
  }
  if (M.layers && t > M.nextRetune) {
    const cl = pick(CLUSTERS);
    M.pad.forEach((v, i) => v.oscs.forEach((o) => o.frequency.setTargetAtTime(146.83 * Math.pow(2, cl[i] / 12), t, rand(2, 4))));
    if (Math.random() < 0.5) { const r = pick(ROOTS); M.drone.forEach((d) => d.o.frequency.setTargetAtTime(r * d.r, t, 5)); }
    M.nextRetune = t + rand(18, 40);
  }

  // 心跳:低血量、剛受傷、威脅很高、驚嚇時
  let sp = 0;
  if (M.spike > 0) { sp = clamp((M.spikeEnd - t) / (M.spikeLen || 8), 0, 1); if (sp <= 0) M.spike = 0; }
  const hb = Math.max(M.health, M.pain * 0.8, Math.max(0, T - 0.55) * 1.4, sp);
  if (hb > 0.05 && M.mood !== 'dead') {
    if (M.nextHeart < t) M.nextHeart = t + 0.05;
    while (M.nextHeart < ahead) { heart(M.nextHeart, Math.min(1.25, hb + sp * 0.3)); M.nextHeart += 60 / (62 + hb * 72 + sp * 30); }
  } else M.nextHeart = t;

  // 戰鬥脈動
  const pl = M.trackMix > 0.5 ? 0 : M.mood === 'boss' ? 1 : m.pulse > 0 ? m.pulse * (0.45 + T * 0.9) : 0;
  const eighth = 60 / (96 * (m.tempo || 1)) / 2;
  if (pl > 0.02) {
    if (M.nextBeat < t) M.nextBeat = t + 0.05;
    while (M.nextBeat < ahead) { beat(M.nextBeat, M.step, pl * (1 - 0.35 * M.trackMix)); M.nextBeat += eighth; M.step = (M.step + 1) % 7; if (!M.step) M.bar++; }
  } else M.nextBeat = t;
  M.pulseOff = M.trackMix > 0.5;

  // 隨機事件(有錄音配樂時減少)
  if (t > M.nextEvent) {
    const ev = m.ev, keys = Object.keys(ev), tot = keys.reduce((s, k) => s + ev[k], 0);
    if (tot > 0 && Math.random() > M.trackMix * 0.5) {
      let r = Math.random() * tot, k = keys[0];
      for (const kk of keys) { r -= ev[kk]; if (r <= 0) { k = kk; break; } }
      EVENTS[k](t + 0.05);
    }
    M.nextEvent = t + rand(m.gap[0], m.gap[1]) * (1 - T * 0.3) * (TR.resting() ? 1.6 : 1);
  }
});

// fight 強度分段:升級要持續 1 秒、降級要持續 10 秒,每段至少 8 秒
function updateSub(t) {
  const I = M.intensity || 0;
  const want = I >= 0.55 ? 'fight' : I >= 0.18 ? 'tension' : 'explore';
  const rank = { explore: 0, tension: 1, fight: 2 };
  if (want === M.sub) { M.upT = M.downT = 0; return; }
  if (t - M.subT < 8 && rank[want] < rank[M.sub]) return;
  if (rank[want] > rank[M.sub]) { if (!M.upT) M.upT = t; if (t - M.upT < 1) return; }
  else { if (!M.downT) M.downT = t; if (t - M.downT < 10) return; }
  M.sub = want; M.subT = t; M.upT = M.downT = 0;
  syncTracks();
  applyMood(want === 'fight' ? 1.2 : 3);
}

// ---------- 樂器 ----------
function out(bus = 'music', hall = 0.5, pan = 0) {
  const g = gain(1, A.bus[bus]);
  if (hall) g.connect(gain(hall, bus === 'music' ? A.send.music.hall : A.send.sfx.hall));
  setTimeout(() => g.disconnect(), 12000);
  if (!pan) return g;
  const p = A.ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(g);
  return p;
}

// [motion] 排程好的心跳(AudioContext 時間, 強度):畫面暗角跟著真正的 lub-dub 跳(src/ui/motion.js)
export const heartBeats = [];
function heart(t, v) {
  heartBeats.push([t, v]);
  if (heartBeats.length > 6) heartBeats.shift();
  const d = gain(1, A.bus.sfx);
  tone(d, t, { f: 58, f1: 40, dur: 0.16, g: 0.34 * v });
  burst(d, t, { type: 'lowpass', f: 130, dur: 0.09, g: 0.2 * v });
  tone(d, t + 0.27, { f: 52, f1: 36, dur: 0.14, g: 0.24 * v });
  setTimeout(() => d.disconnect(), 2000);
}

function beat(t, s, v) {
  const d = out('music', 0.35);
  const boss = M.mood === 'boss';
  const accent = s === 0 ? 1 : s === 2 || s === 4 ? 0.7 : 0;
  if (accent) { // 低沉太鼓
    tone(d, t, { f: 78, f1: 38, dur: 0.38, g: 0.26 * v * accent });
    burst(d, t, { type: 'lowpass', f: 220, f1: 70, dur: 0.18, g: 0.16 * v * accent });
    burst(d, t, { type: 'bandpass', f: 320, f1: 180, q: 1.5, dur: 0.12, g: 0.14 * v * accent });
  }
  if (s === 6 && Math.random() < M.tension) tone(d, t, { f: 70, f1: 36, dur: 0.3, g: 0.3 * v });
  burst(d, t, { type: 'bandpass', f: s % 2 ? 6800 : 5200, q: 6, dur: 0.025, g: 0.03 * v * (0.4 + M.tension) }); // 時鐘般的滴答
  if (boss) {
    if (s === 1 || s === 3 || s === 5) tone(d, t, { f: 55, f1: 32, dur: 0.22, g: 0.25 * v });
    if (s === 0 && M.bar % 2 === 0) brass(t, 1.6, 0.06);
    if (s === 3 && Math.random() < 0.3) metal(d, t, rand(900, 1300), 0.03, 0.5, [1, 2.4, 3.9]);
  }
}

function brass(t, dur, g) {
  const d = out('music', 0.5);
  const lp = filter('lowpass', 200, 2, d);
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur * 0.3);
  lp.frequency.exponentialRampToValueAtTime(220, t + dur);
  for (const f of [73.42, 77.78, 103.83, 146.83]) tone(lp, t, { type: 'sawtooth', f: f * rand(0.996, 1.004), dur, a: dur * 0.25, g });
}

export function stinger(t, dur = 2.5) {
  const d = out('music', 0.4);
  const g = gain(0, d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  const lp = filter('lowpass', 400, 1.5, g);
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(4000, t + dur);
  const base = pick([146.83, 155.56, 138.59]);
  for (const st of [0, 1, 6, 11, 13]) {
    const o = A.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * Math.pow(2, st / 12), t);
    o.frequency.linearRampToValueAtTime(base * Math.pow(2, (st + 0.6) / 12), t + dur);
    o.connect(gain(0.12, lp));
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  burst(g, t, { type: 'bandpass', f: 800, f1: 6000, q: 2, dur: 0.05, a: dur, g: 0.4 });
  tone(out('music', 0.8), t + dur, { f: 60, f1: 28, dur: 1.4, g: 0.35 });
}

function deathChord(t) {
  const d = out('music', 0.7);
  const lp = filter('lowpass', 2500, 1, d);
  lp.frequency.setValueAtTime(2500, t);
  lp.frequency.exponentialRampToValueAtTime(150, t + 6);
  for (const st of [0, 1, 5, 6, 11, 12]) {
    const o = A.ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 146.83 * Math.pow(2, st / 12);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 6);
    const g = gain(0, lp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
    o.connect(g);
    o.start(t);
    o.stop(t + 7.1);
  }
  tone(d, t, { f: 50, f1: 22, dur: 4, g: 0.6 });
  burst(d, t, { buf: 'brown', type: 'lowpass', f: 200, f1: 40, dur: 3, g: 0.5 });
  if (M.layers) M.drone.forEach((x) => x.o.frequency.setTargetAtTime(ROOTS[3] * x.r * 0.75, t, 3));
}

const EVENTS = {
  box(t) { // 走音、越轉越慢的音樂盒
    const d = out('music', 0.7, rand(-0.6, 0.6));
    const n = 4 + ((Math.random() * 6) | 0);
    let tt = t, gap = rand(0.32, 0.45), sag = 1;
    const base = pick([587.33, 523.25, 622.25]);
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, pick(BOX) / 12) * sag * rand(0.985, 1.015);
      tone(d, tt, { f, dur: 1.2, a: 0.002, g: 0.05 });
      tone(d, tt, { f: f * 3.98, dur: 0.35, a: 0.001, g: 0.018 });
      tone(d, tt, { f: f * 6.3, dur: 0.12, a: 0.001, g: 0.01 });
      tt += gap;
      gap *= rand(1.04, 1.14);
      sag *= rand(0.99, 0.998);
    }
  },
  scrape(t) { // 金屬刮擦
    const d = out('music', 0.8, rand(-0.8, 0.8));
    const dur = rand(1.6, 3);
    const f0 = rand(900, 1500);
    for (const r of [1, 1.47]) {
      const b = burst(d, t, { type: 'bandpass', f: f0 * r, f1: f0 * r * rand(0.55, 0.8), q: 28, dur: dur * 0.5, a: dur * 0.5, g: 0.35 });
      b.f.Q.value = 30;
    }
    burst(d, t, { buf: 'pink', type: 'bandpass', f: 600, q: 1, dur: dur * 0.6, a: dur * 0.4, g: 0.03 });
  },
  boom(t) { // 遠處撞擊
    const d = out('amb', 1.2, rand(-0.7, 0.7));
    const lp = filter('lowpass', 500, 0.7, d);
    tone(lp, t, { f: rand(40, 55), f1: 25, dur: 1.4, g: 0.35 });
    burst(lp, t, { buf: 'brown', type: 'lowpass', f: 220, f1: 50, dur: 1, g: 0.35 });
    if (Math.random() < 0.5) metal(lp, t + 0.02, rand(180, 320), 0.05, 1.2, [1, 2.3, 3.7]);
  },
  whisper(t) { // 低語般的氣聲
    const d = out('music', 0.9, rand(-0.9, 0.9));
    const dur = rand(1.5, 2.6);
    const g = gain(0, d);
    g.gain.setValueCurveAtTime(curve(64, (u) => 0.18 * Math.sin(Math.PI * u) * (0.4 + 0.6 * Math.abs(Math.sin(u * rand(8, 14))))), t, dur);
    const src = A.ctx.createBufferSource();
    src.buffer = A.noise.pink;
    src.loop = true;
    for (const [f, q] of [[pick([700, 500, 300]), 8], [pick([1100, 1800, 2300]), 10], [2600, 12]]) {
      const bp = filter('bandpass', f, q, g);
      bp.frequency.linearRampToValueAtTime(f * rand(0.8, 1.2), t + dur);
      src.connect(bp);
    }
    src.start(t, Math.random() * 3);
    src.stop(t + dur + 0.1);
  },
  stinger(t) { stinger(t, rand(1.8, 3)); },
  folk() { // 區域色彩:從烘焙好的民謠/儀式聲裡截一小段,很遠、很輕(沒烘焙好就先排程,這次跳過)
    const th = folkTheme(), out = A.outdoor || /yard|plaza|parking|playground|rooftop|cemetery|courtyard|garden|dock|ramp/.test(th);
    if (out) fragment(pick(['beiguan', 'bell', 'beiguan']), { lp: 1400, g: 0.35 });
    else if (/morgue|ossuary|chapel/.test(th)) fragment('chant', { lp: 1500, g: 0.3 });
    else if (/ward|peds|nursery|playroom|icu|dorm/.test(th)) fragment(pick(['box_wcf', 'hum_thh', 'box_wcf']), { lp: 2200, g: 0.3 });
    else if (/tunnel|pump|machine|laundry|incinerator/.test(th)) EVENTS.scrape(A.ctx.currentTime + 0.05);
    else fragment(pick(['box_wcf', 'radio_ssk', 'hum_wcf']), { lp: 1800, g: 0.28 });
  },
  cluster(t) { // 低音鋼琴般的小二度和弦
    const d = out('music', 0.8);
    const base = pick([73.42, 65.41, 69.3]);
    for (const st of [0, 1, 6, 12]) {
      const f = base * Math.pow(2, st / 12);
      tone(d, t, { type: 'triangle', f, dur: 4, a: 0.004, g: 0.08 });
      tone(d, t, { f: f * 2.01, dur: 2, a: 0.004, g: 0.03 });
    }
  },
};
