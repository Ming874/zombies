// 劇情層的音效積木:無線電(雜訊 + 人聲頻帶的音床,開關有靜噪「嘶」聲)、院內廣播提示音(PA 叮咚)、錄音帶機構(放入/播放/停止/退出 + 磁帶嘶聲)。
// sfx.radio(on, level):開/關無線電音床(level 0..1,預設 0.6);劇情語音字幕播放時開著,營造對講機質感。
// sfx.pa(kind):'up' 廣播前的上行叮咚、'down' 廣播後的下行叮咚、'alert' 緊急代碼三響;像從天花板喇叭傳出(頻寬窄、空間殘響長、多支喇叭的時間差)。
// sfx.tape(kind):'insert' | 'play' | 'stop' | 'eject';play 之後有磁帶嘶聲與馬達聲,stop/eject 時停止。
import { A, emit, gain, filter, burst, tone, metal, shaper, rand, clamp } from './core.js';
import { click, clack } from './foley.js';
import { cassetteStop } from './folk.js';

// ---------- 無線電 ----------
const RD = { nodes: null, on: false };
function radioBed() {
  const ctx = A.ctx;
  const out = gain(0, A.bus.sfx);
  const band = filter('bandpass', 1700, 0.7, filter('lowpass', 3400, 0.7, filter('highpass', 300, 0.7, out)));
  const n = ctx.createBufferSource();
  n.buffer = A.noise.pink; n.loop = true;
  const ng = gain(0.06, band);
  n.connect(ng);
  n.start(ctx.currentTime, Math.random() * 3);
  // 收訊忽強忽弱 + 偶爾的劈啪(低頻振盪器調變增益)
  const fl = ctx.createOscillator();
  fl.type = 'sine'; fl.frequency.value = rand(0.15, 0.35);
  fl.connect(gain(0.025, ng.gain));
  fl.start();
  const hum = ctx.createOscillator();
  hum.type = 'sawtooth'; hum.frequency.value = 60;
  hum.connect(filter('lowpass', 400, 0.7, gain(0.004, band)));
  hum.start();
  return { out, srcs: [n, fl, hum], band };
}
function squelch(d, t, g = 0.12) {
  burst(d, t, { type: 'bandpass', f: 2200, q: 0.6, dur: 0.12, a: 0.004, g });
  click(d, t, 2400, g * 0.8);
}
export function radio(on = true, level = 0.6) {
  if (!A.ctx) return;
  const n = A.ctx.currentTime;
  if (on) {
    if (!RD.nodes) RD.nodes = radioBed();
    RD.nodes.out.gain.setTargetAtTime(clamp(level, 0, 1) * 1.2, n, 0.08);
    if (!RD.on) { const h = emit({ bus: 'sfx', prio: 5, dur: 0.4, gain: 1 }); if (h) squelch(h.in, h.t); }
    RD.on = true;
    return;
  }
  if (!RD.nodes) return;
  const N = RD.nodes;
  RD.nodes = null;
  RD.on = false;
  const h = emit({ bus: 'sfx', prio: 5, dur: 0.4, gain: 1 });
  if (h) { click(h.in, h.t, 2000, 0.1); burst(h.in, h.t + 0.01, { type: 'bandpass', f: 1800, q: 0.7, dur: 0.06, g: 0.06 }); }
  N.out.gain.setTargetAtTime(0, n, 0.03);
  setTimeout(() => { for (const s of N.srcs) { try { s.stop(); } catch { /* 已停 */ } } N.out.disconnect(); }, 300);
}

// 收音機的尖叫(回授嘯叫):活屍 6 m 內又看不到時、207 門口、地下室燒壞(REDESIGN §2.4.5)。k 0..1 = 強度;long = 燒壞那一聲(長、越拉越高、最後「啪」)
export function screech(k = 0.6, long = false) {
  const len = long ? 3.2 : 1.1 + k * 0.4;
  const h = emit({ bus: 'sfx', prio: 7, room: 0.25, dur: len + 0.4, gain: 0.5 + k * 0.5 });
  if (!h) return;
  const d = h.in, t = h.t, f0 = rand(1650, 2100);
  tone(d, t, { type: 'square', f: f0, f1: f0 * (long ? 2.6 : 1.35), glide: len, a: 0.05, hold: len * 0.7, dur: len * 0.3, g: 0.05 + k * 0.06 });
  tone(d, t + 0.03, { type: 'sawtooth', f: f0 * 1.5, f1: f0 * (long ? 3.4 : 1.8), glide: len, a: 0.08, hold: len * 0.6, dur: len * 0.35, g: 0.02 + k * 0.03, detune: 12 });
  burst(d, t, { type: 'bandpass', f: 2600, q: 0.8, dur: len, a: 0.02, g: 0.05 + k * 0.05, buf: 'pink' });
  if (long) { burst(d, t + len, { type: 'highpass', f: 3000, q: 0.7, dur: 0.05, g: 0.4 }); click(d, t + len + 0.01, 1800, 0.3); }
}

// ---------- 院內廣播提示音 ----------
// 頻寬窄的天花板喇叭 + 長殘響;兩支喇叭有時間差(遠處那支較暗)
const PA_NOTES = { up: [[523.25, 0], [659.25, 0.42], [783.99, 0.84]], down: [[783.99, 0], [659.25, 0.42], [523.25, 0.84]], alert: [[880, 0], [880, 0.3], [880, 0.6]] };
export function pa(kind = 'up') {
  const notes = PA_NOTES[kind] || PA_NOTES.up;
  const h = emit({ bus: 'sfx', prio: 6, room: 0.9, hall: 1.2, echo: 0.6, dur: 4.5, gain: 0.55 });
  if (!h) return;
  const spk = filter('bandpass', 1400, 0.55, shaper(1.6, filter('highpass', 380, 0.7, h.in)));
  const far = A.ctx.createDelay(0.2);
  far.delayTime.value = rand(0.055, 0.085);
  far.connect(filter('lowpass', 1800, 0.7, gain(0.45, h.in)));
  spk.connect(far);
  for (const [f, dt] of notes) {
    const t = h.t + dt;
    if (kind === 'alert') { tone(spk, t, { type: 'square', f, dur: 0.18, hold: 0.06, a: 0.005, g: 0.05 }); continue; }
    tone(spk, t, { f, dur: 1.4, a: 0.004, g: 0.16 }); // 鐵琴般的叮
    tone(spk, t, { f: f * 2.01, dur: 0.5, a: 0.003, g: 0.05 });
    tone(spk, t, { f: f * 3.98, dur: 0.18, a: 0.002, g: 0.02 });
  }
  burst(h.in, h.t - 0.05, { type: 'bandpass', f: 900, q: 0.8, dur: 0.05, a: 0.02, hold: 2.2, g: 0.008 }); // 擴音器開啟的底噪
  click(h.in, h.t - 0.06, 1500, 0.05);
}

// ---------- 錄音帶 ----------
const TP = { hiss: null };
function hissOn() {
  if (TP.hiss || !A.ctx) return;
  const n = A.ctx.createBufferSource();
  n.buffer = A.noise.pink; n.loop = true;
  const g = gain(0, filter('highpass', 2500, 0.6, filter('lowpass', 9000, 0.6, A.bus.sfx)));
  n.connect(g);
  const m = A.ctx.createOscillator(); // 馬達
  m.type = 'sawtooth'; m.frequency.value = 50;
  const mg = gain(0.0025, filter('lowpass', 300, 0.7, A.bus.sfx));
  m.connect(mg);
  n.start(A.ctx.currentTime, Math.random() * 3); m.start();
  g.gain.setTargetAtTime(0.02, A.ctx.currentTime, 0.15);
  TP.hiss = { n, m, g, mg };
}
function hissOff() {
  const H = TP.hiss;
  if (!H) return;
  TP.hiss = null;
  const n = A.ctx.currentTime;
  H.g.gain.setTargetAtTime(0, n, 0.05);
  H.m.frequency.setTargetAtTime(15, n, 0.15); // 馬達減速
  H.mg.gain.setTargetAtTime(0, n, 0.12);
  setTimeout(() => { try { H.n.stop(); H.m.stop(); } catch { /* 已停 */ } H.g.disconnect(); H.mg.disconnect(); }, 700);
}
export function tape(kind = 'play') {
  if (kind === 'insert' || kind === 'play' || kind === 'eject') cassetteStop();
  const h = emit({ bus: 'sfx', prio: 5, room: 0.1, dur: 1, gain: 1.1 });
  if (!h) return;
  const t = h.t, d = h.in;
  if (kind === 'insert') { clack(d, t, 1300, 0.25); click(d, t + 0.18, 2200, 0.12); clack(d, t + 0.32, 900, 0.3); } // 卡帶推入 + 蓋子關上
  else if (kind === 'eject') { hissOff(); clack(d, t, 1100, 0.3); burst(d, t + 0.02, { type: 'bandpass', f: 1600, q: 2, dur: 0.12, g: 0.05 }); metal(d, t + 0.05, 2400, 0.02, 0.12, [1, 2.5]); }
  else if (kind === 'stop') { hissOff(); clack(d, t, 1500, 0.32); click(d, t + 0.03, 2600, 0.1); }
  else { // play:按鍵壓下的機械聲 + 馬達起轉
    clack(d, t, 1700, 0.3);
    click(d, t + 0.025, 2900, 0.1);
    burst(d, t + 0.05, { type: 'lowpass', f: 300, f1: 900, dur: 0.25, a: 0.05, g: 0.04 });
    hissOn();
  }
}
export const storyState = () => ({ radio: RD.on, tape: !!TP.hiss });
