// 以 WebAudio 即時合成所有音效(不需任何音檔);配樂(錄音串流 + 程式合成)、雨聲、門與地圖紙張的 3D 音效在 src/audio/
// (src/audio/core.js 取自 test 分支:混音匯流排、3D 定位、遮蔽、殘響;這裡原本的合成音效仍直接走自己的 master)
import { A, attach as attachCore, setListener } from './audio/core.js';
import { startMusic, setMood, setTension, setHealth, addPain } from './audio/music.js';
import { sting, preloadStings, resumeTracks } from './audio/tracks.js';
import { setRain, thunder, preloadRain } from './audio/weather.js';
import { ix } from './audio/ix.js';

export { ix };
export const _internal = { A }; // map/weather.js 讀取(沒有 sfx.thunder 時的備援)

let ctx = null;
let master = null;
let reverb = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  // 室內殘響
  const len = ctx.sampleRate * 1.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const rg = ctx.createGain();
  rg.gain.value = 0.35;
  reverb.connect(rg);
  rg.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  attachCore(ctx);
  return ctx;
}

// AudioContext 只能在使用者互動後恢復;第一次互動(點擊、按鍵)就啟動配樂,選單也聽得到
let booted = false;
function boot() {
  if (booted || !ctx) return;
  booted = true;
  startMusic();
  preloadStings();
  setTimeout(preloadRain, 1500); // 雨聲錄音在選單時就背景載入
}
export function resume() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().then(boot, () => {});
  else boot();
  resumeTracks();
}
if (typeof document !== 'undefined') {
  const unlock = () => { resume(); if (ctx && ctx.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(e, unlock, true); };
  for (const e of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(e, unlock, true);
}

function out(node, wet = 0.3) {
  node.connect(master);
  if (wet > 0) {
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s);
    s.connect(reverb);
  }
}

function noise(dur, type, f0, f1, vol, wet = 0.3, delay = 0, q = 1) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  out(g, wet);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(type, f0, f1, dur, vol, wet = 0.2, delay = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  out(g, wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SHOT = {
  pistol: { crack: 5200, dur: 0.16, vol: 0.55, thump: 160, tdur: 0.1 },
  revolver: { crack: 3600, dur: 0.34, vol: 0.9, thump: 90, tdur: 0.22 },
  ak47: { crack: 4200, dur: 0.24, vol: 0.85, thump: 85, tdur: 0.16 },
  m4a1: { crack: 6000, dur: 0.2, vol: 0.7, thump: 110, tdur: 0.13 },
};

export const sfx = {
  shot(id) {
    const s = SHOT[id] || SHOT.pistol;
    noise(s.dur, 'lowpass', s.crack, 300, s.vol, 0.45);
    noise(0.04, 'highpass', 3000, 1000, s.vol * 0.7, 0.2);
    tone('sine', s.thump, 38, s.tdur, s.vol * 0.9, 0.2);
    if (ctx) A.combatT = ctx.currentTime; // 配樂:最近的戰鬥活動
  },
  dry() { tone('square', 1800, 1500, 0.03, 0.12, 0); },
  reload(id) {
    const slow = id === 'revolver' ? 1.4 : 1;
    tone('square', 900, 400, 0.05, 0.14, 0.05);
    noise(0.05, 'bandpass', 2500, 1500, 0.2, 0.05, 0.35 * slow, 3);
    tone('square', 700, 300, 0.06, 0.16, 0.05, 0.9 * slow);
    noise(0.07, 'bandpass', 1800, 900, 0.22, 0.05, 1.35 * slow, 2);
  },
  hit() { noise(0.1, 'lowpass', 900, 200, 0.5, 0.1); tone('sine', 140, 50, 0.1, 0.4, 0.05); },
  headshot() { noise(0.12, 'bandpass', 1400, 400, 0.6, 0.2, 0, 2); tone('triangle', 900, 200, 0.12, 0.25, 0.1); },
  wall() { noise(0.08, 'bandpass', 3500, 1200, 0.2, 0.2, 0, 2); },
  zombieDie() { tone('sawtooth', 190, 55, 0.7, 0.28, 0.35); noise(0.5, 'lowpass', 600, 120, 0.25, 0.2); },
  groan(dist = 8) {
    const v = Math.max(0, 0.28 - dist * 0.012);
    if (v <= 0.01) return;
    const f = 70 + Math.random() * 40;
    tone('sawtooth', f * 1.6, f, 1.1, v, 0.5);
    noise(1.0, 'bandpass', 380, 220, v * 0.9, 0.4, 0, 6);
  },
  attack() { tone('sawtooth', 220, 90, 0.35, 0.25, 0.3); },
  hurt() {
    tone('sine', 100, 40, 0.35, 0.8, 0.2); noise(0.25, 'lowpass', 500, 100, 0.5, 0.2);
    if (ctx) A.combatT = ctx.currentTime;
    addPain(0.5); // 配樂:受傷後心跳
  },
  coin(i = 0) { tone('sine', 1200 + (i % 5) * 120, 1800 + (i % 5) * 120, 0.12, 0.12, 0.2); tone('sine', 2400, 3000, 0.1, 0.05, 0.2, 0.05); },
  buy() { tone('triangle', 600, 900, 0.15, 0.2, 0.2); tone('triangle', 900, 1400, 0.2, 0.2, 0.2, 0.12); },
  deny() { tone('square', 200, 150, 0.2, 0.2, 0); },
  step() { noise(0.09, 'lowpass', 500, 150, 0.22, 0.25); },
  switch() { noise(0.06, 'bandpass', 2000, 1000, 0.18, 0.05, 0, 2); tone('square', 500, 300, 0.05, 0.1, 0.05, 0.04); },
  // 回合開始/結束:串流的錄音刺擊(還沒載好時用合成版)
  roundStart() {
    if (sting('round', 0.9, 6)) return;
    tone('sawtooth', 110, 55, 1.4, 0.25, 0.6); tone('sine', 55, 40, 1.8, 0.4, 0.5);
  },
  roundEnd() {
    if (sting('gong', 0.9, 7)) return;
    tone('triangle', 440, 440, 0.4, 0.15, 0.5); tone('triangle', 660, 660, 0.6, 0.15, 0.5, 0.2);
  },
  ambient() {
    // 低頻環境嗡鳴 + 偶爾的遠處聲響
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 120;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    o.connect(f);
    f.connect(g);
    // 嗡鳴音量跟著配樂狀態(music.js 的 amb)
    A.ambG = ctx.createGain();
    A.ambG.gain.value = A.ambLevel ?? 1;
    g.connect(A.ambG);
    out(A.ambG, 0.2);
    o.start();
    setInterval(() => {
      if (Math.random() < 0.5) noise(0.6, 'lowpass', 400, 80, 0.06, 0.9);
      else tone('sine', 90 + Math.random() * 60, 50, 0.9, 0.05, 0.9);
    }, 7000);
  },

  // ---- 配樂 ----
  setMood(m) { setMood(m); }, // 'menu' | 'fight' | 'boss' | 'break' | 'shop' | 'dead'
  setTension(x) { setTension(x); }, // 0..1:最近的殭屍越近越緊張
  setHealth(r) { setHealth(r); }, // 玩家血量比例 0..1(低血量:心跳)

  // ---- 地圖 / 天氣 / 門(3D 音效走 src/audio/core.js)----
  listener(x, y, z, yaw) { if (A.ctx) setListener(x, y, z, yaw); }, // 每幀:聆聽者位置(玩家眼睛)
  attachGame(game) { A.game = game; A.world = game.world || null; }, // 視線遮蔽、樓層悶音用的 World
  setRain(level, outdoorFactor) { try { setRain(level, outdoorFactor); } catch { /* 音效失敗不影響遊戲 */ } }, // 說明見 src/audio/weather.js
  thunder(dist, delay) { if (A.ctx) thunder(dist, delay); },
  pickupDeny() { this.deny(); },
  uiClick() { tone('square', 1400, 1200, 0.02, 0.06, 0); },
  shutter(pos, open) { // 店面捲門:鐵捲門的隆隆聲(拉起較長、放下較短較重)
    noise(open ? 2.2 : 1.6, 'bandpass', open ? 900 : 700, open ? 1300 : 420, 0.22, 0.4, 0, 1.5);
    noise(open ? 2.2 : 1.6, 'lowpass', 260, 120, 0.25, 0.3);
    if (!open) tone('sine', 90, 45, 0.3, 0.35, 0.3, 1.5);
  },
  // test 地圖裡由環境音系統/驚嚇導演處理的聲音:main 沒有這些系統,不出聲
  loopStart() {}, loopStop() {}, crow() {}, flap() {}, door() {}, scare() {}, thud() {},
};
