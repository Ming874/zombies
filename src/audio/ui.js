// 介面、商店、拾取、裝備、多人提示音:清楚但不吵,音色延續醫院主題(監視器嗶聲、老收銀機、無線電對講)。
import { A, emit, burst, tone, metal, gain, filter, rand, pick, curve, duck, muffle, baked, playBuf } from './core.js';
import { click, clack, slide, cloth, squeal, tinnitus } from './foley.js';
import { grunt } from './voices.js';
import * as SM from './samples.js';
import { sting } from './tracks.js';

const rl = {};
const limit = (k, s) => { const n = performance.now() / 1000; if (n - (rl[k] ?? -9) < s) return false; rl[k] = n; return true; }; // 牆鐘時間(離線量測時每個 context 都從 0 開始)
const U = (o = {}) => emit({ bus: 'ui', prio: 4, dur: 1, ...o });
// 短的合成提示音:第一次之後烘焙成緩衝(每次只剩一個 BufferSource,不必每次建 6~10 個節點)
function cue(name, h, len, synth) {
  const set = baked(`cue|${name}`, 2, len, (dst, t0) => synth({ in: dst, t: t0 }), 1, 32000);
  if (set) { playBuf(h.in, h.t, pick(set), { rate: rand(0.99, 1.01) }); return; }
  synth(h);
}
const F = (o = {}) => emit({ bus: 'sfx', prio: 4, room: 0.12, dur: 1, ...o }); // 有實體感的手部動作(走音效匯流排)

function velcro(d, t, dur, g) { // 魔鬼氈撕開:密集不規則的爆裂顆粒
  const b = burst(d, t, { type: 'bandpass', f: 2800, q: 0.8, dur, g });
  b.g.gain.cancelScheduledValues(t);
  b.g.gain.setValueCurveAtTime(curve(Math.ceil(dur * 300), (u) => g * (Math.random() < 0.45 ? 1 : 0.15) * (1 - u * 0.4)), t, dur);
}

export const ui = {
  // ---------- 金幣 / 購買 / 回合 ----------
  coin(i = 0) {
    const h = U({ room: 0.15, dur: 0.9, gain: 0.8 });
    if (!h) return;
    const f = 2093 * Math.pow(2, ((i % 6) * 2) / 12);
    if (SM.play(i > 6 && Math.random() < 0.3 ? 'ui.coins' : 'ui.coin', { h, g: 0.5, semi: (i % 6) * 0.6 })) { metal(h.in, h.t + 0.02, f * 1.5, 0.025, 0.2, [1, 2.756]); return; }
    metal(h.in, h.t, f, 0.1, 0.3, [1, 2.756, 5.404]);
    metal(h.in, h.t + 0.035, f * 1.5, 0.05, 0.2, [1, 2.756]);
    burst(h.in, h.t, { type: 'highpass', f: 6000, dur: 0.01, g: 0.05 });
  },
  buy() {
    const h = U({ room: 0.2, dur: 2.8 });
    if (!h) return;
    if (SM.play('ui.confirm', { h, g: 0.6 })) return;
    clack(h.in, h.t, 900, 0.25); // 收銀機械
    [1319, 1661, 1976].forEach((f, k) => metal(h.in, h.t + 0.08 + k * 0.07, f, 0.07, 0.6, [1, 2.0, 3.01, 4.1]));
    for (let k = 0; k < 5; k++) metal(h.in, h.t + 0.2 + k * 0.05, rand(2600, 3600), 0.03, 0.15, [1, 2.756]);
  },
  deny() {
    const h = U({ room: 0.1, dur: 0.8 });
    if (!h) return;
    if (SM.play('ui.deny', { h, g: 0.55 })) return;
    const lp = filter('lowpass', 700, 1, h.in);
    tone(lp, h.t, { type: 'sawtooth', f: 110, dur: 0.11, hold: 0.04, g: 0.18 });
    tone(lp, h.t + 0.15, { type: 'sawtooth', f: 104, dur: 0.16, hold: 0.06, g: 0.18 });
    burst(h.in, h.t, { type: 'lowpass', f: 300, dur: 0.08, g: 0.2 });
  },
  roundStart() { // 串流的錄音刺擊 + 合成的金屬刮升/撞擊
    const rec = sting('round', 0.9, 6);
    const h = emit({ bus: 'sfx', prio: 6, room: 0.3, hall: 0.8, dur: 4, gain: rec ? 0.18 : 0.33 });
    if (!h) return;
    const t = h.t;
    burst(h.in, t, { type: 'bandpass', f: 700, f1: 3200, q: 2, dur: 0.15, a: 0.55, g: 0.06 }); // 金屬刮升
    tone(h.in, t + 0.6, { f: 55, f1: 28, dur: 2.2, g: 0.7 }); // 深沉撞擊
    burst(h.in, t + 0.6, { buf: 'brown', type: 'lowpass', f: 260, f1: 60, dur: 1.6, g: 0.6 });
    const lp = filter('lowpass', 200, 2, h.in); // 不和諧銅管刺擊
    lp.frequency.setValueAtTime(200, t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 1.0);
    lp.frequency.exponentialRampToValueAtTime(260, t + 2.8);
    for (const f of [73.4, 77.8, 110, 146.8 * 1.01]) tone(lp, t + 0.6, { type: 'sawtooth', f, dur: 1.8, a: 0.3, g: 0.07 });
  },
  roundEnd() { // 銅鑼錄音 + 合成的低沉銅鑼與三個下降的鐘聲
    const rec = sting('gong', 0.9, 7);
    const h = emit({ bus: 'sfx', prio: 6, room: 0.3, hall: 0.7, dur: 4, gain: rec ? 0.3 : 0.66 });
    if (!h) return;
    metal(h.in, h.t, 110, 0.22, 3.2, [1, 2.24, 3.38, 4.57, 5.9]); // 低沉銅鑼
    [1175, 1047, 880].forEach((f, k) => metal(h.in, h.t + 0.5 + k * 0.42, f * rand(0.985, 1.0), 0.035, 1.1, [1, 3.98, 6.3]));
  },

  uiClick() {
    if (!limit('click', 0.03)) return;
    const h = U({ dur: 0.4, gain: 6 });
    if (!h) return;
    if (SM.play('ui.click', { h, g: 0.12 })) return;
    burst(h.in, h.t, { type: 'bandpass', f: 2600, q: 3, dur: 0.008, g: 0.22 });
    tone(h.in, h.t, { f: 1800, dur: 0.025, g: 0.04 });
    burst(h.in, h.t, { type: 'lowpass', f: 500, dur: 0.015, g: 0.08 });
  },
  uiHover() {
    if (!limit('hover', 0.045)) return;
    const h = U({ prio: 2, dur: 0.3, gain: 4 });
    if (!h) return;
    if (SM.play('ui.hover', { h, g: 0.06 })) return;
    tone(h.in, h.t, { f: 2400, f1: 2300, dur: 0.02, g: 0.016 });
    burst(h.in, h.t, { type: 'highpass', f: 6000, dur: 0.004, g: 0.025 });
  },
  countdown(n) { // 監視器般的倒數嗶聲;0 = 開始
    const h = U({ dur: 2, room: 0.2, hall: 0.2, gain: n > 0 ? 3 : 1 });
    if (!h) return;
    const t = h.t;
    if (n > 0) {
      const f = n <= 3 ? 1175 : 988;
      tone(h.in, t, { f, dur: 0.1, a: 0.003, g: 0.08 });
      tone(h.in, t, { f: f * 2, dur: 0.06, g: 0.012 });
    } else {
      tone(h.in, t, { f: 70, f1: 35, dur: 0.5, g: 0.45 });
      burst(h.in, t, { type: 'lowpass', f: 600, f1: 90, dur: 0.4, g: 0.25 });
      tone(h.in, t, { f: 740, dur: 0.45, a: 0.005, g: 0.06 });
      metal(h.in, t, 220, 0.04, 1.2, [1, 2.24, 3.38]);
    }
  },

  // ---------- 商店 ----------
  shopOpen() { // 終端機開機 + 門鈴兩聲
    const h = U({ dur: 1.6, room: 0.15 });
    if (!h) return;
    const t = h.t;
    burst(h.in, t, { type: 'lowpass', f: 300, dur: 0.05, g: 0.18 });
    tone(h.in, t + 0.02, { f: 420, f1: 1250, glide: 0.12, dur: 0.14, g: 0.045 });
    tone(h.in, t + 0.02, { f: 840, f1: 2500, glide: 0.12, dur: 0.1, g: 0.012 });
    tone(filter('lowpass', 300, 0.7, h.in), t, { type: 'sawtooth', f: 60, dur: 0.5, a: 0.15, g: 0.02 });
    metal(h.in, t + 0.25, 1319, 0.035, 0.9, [1, 2.0, 3.01]);
    metal(h.in, t + 0.55, 1047, 0.035, 1.1, [1, 2.0, 3.01]);
  },
  shopClose() {
    const h = U({ dur: 0.8, gain: 3 });
    if (!h) return;
    SM.play('ui.back', { h, g: 0.08 });
    tone(h.in, h.t, { f: 1250, f1: 420, glide: 0.12, dur: 0.13, g: 0.04 });
    click(h.in, h.t + 0.12, 1800, 0.12);
  },
  shopTab() {
    if (!limit('tab', 0.05)) return;
    const h = U({ dur: 0.3, gain: 5 });
    if (!h) return;
    cue('tab', h, 0.12, (x) => { click(x.in, x.t, 2200, 0.16); tone(x.in, x.t, { f: rand(1450, 1550), dur: 0.03, g: 0.03 }); });
  },
  shopHover() {
    if (!limit('shover', 0.04)) return;
    const h = U({ dur: 0.1, gain: 6 });
    if (h) tone(h.in, h.t, { f: 3000, dur: 0.012, g: 0.014 });
  },
  upgrade() { // 棘輪扳手 + 卡榫鎖上 + 上升的叮
    const h = F({ dur: 2, room: 0.2 });
    if (!h) return;
    const t = h.t;
    for (let i = 0; i < 6; i++) click(h.in, t + i * 0.045, 3000 * rand(0.95, 1.05), 0.12);
    clack(h.in, t + 0.3, 1800, 0.3);
    tone(h.in, t + 0.3, { f: 140, f1: 80, dur: 0.07, g: 0.2 });
    [659, 830, 988, 1319].forEach((f, k) => metal(h.in, t + 0.42 + k * 0.07, f, 0.035, 0.5, [1, 2.0, 3.0]));
  },
  cashRegister() { // 老式收銀機:按鍵 → 鈴 → 抽屜彈出 → 零錢
    const h = F({ dur: 2.4, room: 0.25, gain: 0.7 });
    if (!h) return;
    const t = h.t;
    if (SM.play('ui.register', { h, g: 0.7 })) return;
    for (let i = 0; i < 3; i++) click(h.in, t + i * 0.08, 1800, 0.15);
    metal(h.in, t + 0.28, 2640, 0.09, 1.2, [1, 2.0, 3.0, 4.2]);
    slide(h.in, t + 0.32, 600, 300, 0.22, 0.2);
    clack(h.in, t + 0.52, 900, 0.3);
    for (let k = 0; k < 6; k++) metal(h.in, t + 0.56 + k * 0.03, rand(2600, 3600), 0.025, 0.15, [1, 2.756]);
  },
  // 商店捲門:葉片在捲軸上連續卡嗒 + 馬達 + 結束時的撞擊
  shutter(pos, open = true) {
    const dur = rand(2, 2.4);
    const h = pos ? emit({ pos, cat: 'fx', prio: 3, room: 0.6, hall: 0.3, dur: dur + 3, ref: 2.5, gain: 1.1, track: false }) : F({ dur: dur + 3, room: 0.5 });
    if (!h) return;
    const t = h.t;
    if (SM.play(open ? 'shutter.open' : 'shutter.close', { h, g: 0.8 })) { if (!open) duck(0.75, 0.4); return; }
    const am = gain(0);
    am.connect(h.in);
    const rate = rand(26, 34), N = Math.ceil(dur * rate * 6);
    am.gain.setValueCurveAtTime(curve(N, (u, i) => { const ph = (i % 6) / 6; return (0.4 + 0.6 * Math.random()) * Math.exp(-ph * 5) * Math.min(1, u * 8, (1 - u) * 8); }), t, dur);
    burst(am, t, { type: 'bandpass', f: 1300, q: 1.5, dur: 0.05, hold: dur, a: 0.01, g: 0.22 });
    for (const f of [640, 1130, 1790]) tone(am, t, { f: f * rand(0.97, 1.03), dur: 0.05, hold: dur, a: 0.01, g: 0.03 });
    tone(filter('lowpass', 420, 0.7, h.in), t, { type: 'sawtooth', f: open ? 95 : 110, f1: open ? 112 : 92, dur: dur, a: 0.15, g: 0.035 }); // 馬達
    burst(h.in, t, { buf: 'brown', type: 'lowpass', f: 160, dur: dur * 0.6, a: dur * 0.4, g: 0.12 });
    const te = t + dur;
    if (open) { // 捲到頂
      tone(h.in, te, { f: 90, f1: 50, dur: 0.2, g: 0.3 });
      metal(h.in, te, 300, 0.06, 0.4, [1, 1.8, 2.9]);
      click(h.in, te + 0.05, 1500, 0.15);
    } else { // 落到底
      tone(h.in, te, { f: 70, f1: 32, dur: 0.45, g: 0.6 });
      burst(h.in, te, { type: 'lowpass', f: 900, f1: 90, dur: 0.35, g: 0.5 });
      for (let k = 0; k < 4; k++) metal(h.in, te + rand(0, 0.1), rand(250, 500), 0.05, 0.4, [1, 1.8, 2.9]);
      duck(0.7, 0.4);
    }
  },
  // 門:creak 木門慢慢被推開 / slam 甩上 / metal 鐵門
  door(pos, kind = 'creak') {
    const h = pos ? emit({ pos, cat: 'fx', prio: 3, room: 0.8, hall: 0.4, dur: 3, ref: 2.2, gain: kind === 'creak' ? 4 : kind === 'metal' ? 0.8 : 1, track: false }) : F({ dur: 3, room: 0.6, gain: kind === 'creak' ? 3 : 0.8 });
    if (!h) return;
    const t = h.t;
    if (SM.play(`door.${kind}`, { h, g: 0.8 })) { if (kind === 'slam' || kind === 'cell') duck(0.65, 0.5); return; }
    if (kind === 'slam') {
      burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 500, f1: 1200, q: 1, dur: 0.1, a: 0.08, g: 0.06 });
      tone(h.in, t + 0.08, { f: 68, f1: 30, dur: 0.5, g: 0.85 });
      burst(h.in, t + 0.08, { type: 'lowpass', f: 1100, f1: 100, dur: 0.4, g: 0.75 });
      burst(h.in, t + 0.08, { type: 'bandpass', f: 380, q: 1.5, dur: 0.12, g: 0.45 });
      metal(h.in, t + 0.09, 2300, 0.07, 0.1, [1, 2.4]);
      for (let k = 0; k < 4; k++) metal(h.in, t + 0.1 + rand(0, 0.2), rand(400, 900), 0.025, 0.3);
      duck(0.65, 0.5);
    } else if (kind === 'metal') {
      squeal(h.in, t, rand(900, 1300), rand(1100, 1500), 0.7, 0.09, 25);
      const tt = t + 0.75;
      metal(h.in, tt, rand(180, 240), 0.22, 1.5, [1, 1.8, 2.9, 4.2, 5.6]);
      tone(h.in, tt, { f: 70, f1: 30, dur: 0.5, g: 0.5 });
      burst(h.in, tt, { type: 'lowpass', f: 1200, f1: 150, dur: 0.3, g: 0.4 });
      clack(h.in, tt + 0.05, 1400, 0.3);
    } else {
      const f = rand(300, 550), dur = rand(1.2, 2);
      squeal(h.in, t, f, f * rand(0.7, 1.4), dur, 0.15, 14, [18, 40]);
      const o = A.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = rand(80, 100);
      const g = gain(0, filter('lowpass', 300, 0.7, h.in));
      g.gain.setValueCurveAtTime(curve(64, (u) => 0.02 * Math.sin(Math.PI * u) * (0.5 + 0.5 * Math.random())), t, dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
      if (Math.random() < 0.5) burst(h.in, t + dur, { type: 'lowpass', f: 500, f1: 150, dur: 0.12, g: 0.2 }); // 撞到門擋
    }
  },

  // ---------- 拾取 / 裝備 ----------
  pickupAmmo() {
    const h = F({ dur: 0.8, gain: 0.9 });
    if (!h) return;
    const t = h.t;
    if (SM.play('pick.ammo', { h, g: 0.8 })) return;
    clack(h.in, t, 1500, 0.28);
    for (let i = 0; i < 5; i++) metal(h.in, t + 0.05 + i * rand(0.025, 0.04), rand(2600, 4200), 0.03, 0.06, [1, 2.7]); // 子彈互碰
    cloth(h.in, t + 0.1, 0.15, 0.06);
    click(h.in, t + 0.22, 2600, 0.12);
  },
  pickupMed() {
    const h = F({ dur: 1.4, gain: 1.2 });
    if (!h) return;
    const t = h.t;
    if (SM.play(Math.random() < 0.6 ? 'med.zip' : 'med.velcro', { h, g: 0.5 })) { const c = U({ dur: 1 }); if (c) { tone(c.in, c.t + 0.1, { f: 659, dur: 0.25, a: 0.01, g: 0.02 }); tone(c.in, c.t + 0.18, { f: 988, dur: 0.35, a: 0.01, g: 0.016 }); } return; }
    click(h.in, t, 2400, 0.18); // 塑膠扣
    burst(h.in, t + 0.02, { type: 'bandpass', f: 1100, q: 2.5, dur: 0.03, g: 0.15 });
    burst(h.in, t + 0.08, { buf: 'pink', type: 'bandpass', f: 2500, q: 0.9, dur: 0.1, a: 0.03, g: 0.09 }); // 包裝
    const c = U({ dur: 1 });
    if (c) { tone(c.in, c.t + 0.1, { f: 659, dur: 0.25, a: 0.01, g: 0.025 }); tone(c.in, c.t + 0.18, { f: 988, dur: 0.35, a: 0.01, g: 0.02 }); }
  },
  pickupDeny() {
    if (!limit('pdeny', 0.5)) return;
    const h = U({ dur: 0.4, gain: 2 });
    if (!h) return;
    cue('pdeny', h, 0.3, (x) => { burst(x.in, x.t, { type: 'lowpass', f: 300, dur: 0.06, g: 0.2 }); tone(filter('lowpass', 600, 0.8, x.in), x.t, { type: 'sawtooth', f: 98, dur: 0.12, hold: 0.03, g: 0.05 }); });
  },
  pickupItem() {
    const h = F({ dur: 0.9, gain: 1.6 });
    if (!h) return;
    SM.play('pick.ammobox', { h, g: 0.25 });
    cloth(h.in, h.t, 0.15, 0.08);
    click(h.in, h.t + 0.06, 2000, 0.14);
    const c = U({ dur: 0.6 });
    if (c) { tone(c.in, c.t + 0.06, { f: 880, dur: 0.15, g: 0.018 }); tone(c.in, c.t + 0.11, { f: 1320, dur: 0.2, g: 0.013 }); }
  },
  armorEquip() { // 魔鬼氈 × 2 + 束帶 + 防彈板
    const h = F({ dur: 1.4, gain: 0.9 });
    if (!h) return;
    const t = h.t;
    if (SM.play('med.velcro', { h, g: 0.75 })) { clack(h.in, t + 0.72, 900, 0.3); tone(h.in, t + 0.72, { f: 120, f1: 60, dur: 0.1, g: 0.22 }); cloth(h.in, t + 0.8, 0.2, 0.08); return; }
    velcro(h.in, t, 0.22, 0.25);
    slide(h.in, t + 0.3, 1200, 1800, 0.15, 0.12);
    velcro(h.in, t + 0.5, 0.16, 0.2);
    clack(h.in, t + 0.72, 900, 0.3);
    tone(h.in, t + 0.72, { f: 120, f1: 60, dur: 0.1, g: 0.22 });
    cloth(h.in, t + 0.8, 0.2, 0.08);
  },
  heal() { // 針筒推藥的嘶聲 + 鬆一口氣 + 溫暖的和弦
    const h = F({ dur: 1.8 });
    if (!h) return;
    const t = h.t;
    SM.play(Math.random() < 0.5 ? 'med.bandage' : 'med.cloth', { h, g: 0.45 });
    burst(h.in, t, { type: 'highpass', f: 4500, dur: 0.3, a: 0.05, g: 0.045 });
    burst(h.in, t + 0.35, { buf: 'pink', type: 'bandpass', f: 900, f1: 500, q: 1, dur: 0.45, a: 0.1, g: 0.1 });
    const c = U({ dur: 1.5 });
    if (c) { tone(c.in, c.t + 0.3, { f: 523, dur: 0.6, a: 0.03, g: 0.022 }); tone(c.in, c.t + 0.4, { f: 784, dur: 0.7, a: 0.03, g: 0.017 }); }
  },
  // 掉落物落地(定位):彈藥箱 = 木/金屬悶響 + 箱內子彈晃動、醫療包 = 軟的布包、手榴彈 = 金屬叮
  pickupLand(pos, kind = 'ammo') {
    const h = emit({ pos, cat: 'fx', prio: 1, room: 0.2, dur: 0.6, ref: 1.5, maxDist: 25, gain: 1.4, track: false });
    if (!h) return;
    const t = h.t;
    if (kind === 'med' || kind === 'health') { burst(h.in, t, { type: 'lowpass', f: 600, f1: 180, dur: 0.06, g: 0.25 }); burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 1400, q: 0.8, dur: 0.06, g: 0.06 }); return; }
    if (kind === 'grenade') { metal(h.in, t, rand(900, 1200), 0.05, 0.12, [1, 2.2, 3.7]); burst(h.in, t, { type: 'lowpass', f: 700, f1: 200, dur: 0.05, g: 0.2 }); return; }
    burst(h.in, t, { type: 'lowpass', f: 500, f1: 120, dur: 0.07, g: 0.35 });
    burst(h.in, t, { type: 'bandpass', f: rand(700, 1000), q: 3, dur: 0.03, g: 0.15 });
    for (let i = 0; i < 3; i++) metal(h.in, t + rand(0, 0.06), rand(2600, 4000), 0.012, 0.05, [1, 2.7]);
  },
  lowAmmo() {
    if (!limit('low', 0.9)) return;
    const h = U({ dur: 0.4, gain: 3 });
    if (!h) return;
    cue('low', h, 0.3, (x) => { click(x.in, x.t, 3200, 0.08); click(x.in, x.t + 0.09, 3200, 0.07); tone(x.in, x.t, { f: 1600, dur: 0.03, g: 0.015 }); });
  },

  // ---------- 多人 ----------
  playerJoin() { // 無線電接通 + 上升兩音
    const h = U({ dur: 0.8, gain: 1.6 });
    if (!h) return;
    burst(h.in, h.t, { type: 'bandpass', f: 2000, q: 1, dur: 0.06, g: 0.06 });
    tone(h.in, h.t + 0.05, { type: 'triangle', f: 660, dur: 0.1, g: 0.04 });
    tone(h.in, h.t + 0.16, { type: 'triangle', f: 990, dur: 0.16, g: 0.04 });
  },
  playerLeave() {
    const h = U({ dur: 0.8, gain: 1.6 });
    if (!h) return;
    tone(h.in, h.t, { type: 'triangle', f: 880, dur: 0.1, g: 0.035 });
    tone(h.in, h.t + 0.11, { type: 'triangle', f: 587, dur: 0.2, g: 0.035 });
    burst(h.in, h.t + 0.32, { type: 'bandpass', f: 1800, q: 1, dur: 0.12, g: 0.04 });
  },
  chat() { // 對講機「喀」+ 短嗶
    if (!limit('chat', 0.08)) return;
    const h = U({ dur: 0.3, gain: 3 });
    if (!h) return;
    cue('chat', h, 0.2, (x) => { click(x.in, x.t, 2400, 0.09); tone(x.in, x.t + 0.02, { f: 1320, dur: 0.05, g: 0.025 }); burst(x.in, x.t + 0.08, { type: 'bandpass', f: 2200, q: 1.2, dur: 0.03, g: 0.02 }); });
  },
  revive(pos) {
    if (pos && Number.isFinite(pos.x)) { // 隊友被救起(定位)
      const h = emit({ pos, cat: 'fx', prio: 3, room: 0.3, dur: 1.5, ref: 2, gain: 1.2, track: false });
      if (!h) return;
      cloth(h.in, h.t, 0.25, 0.12);
      burst(h.in, h.t + 0.2, { buf: 'pink', type: 'bandpass', f: 1500, f1: 2400, q: 1.2, dur: 0.25, a: 0.2, g: 0.12 });
      return;
    }
    muffle(0, 0, 0.6); // 自己被救起:世界恢復清晰
    const h = F({ dur: 2, room: 0.15 });
    if (!h) return;
    burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1500, f1: 2500, q: 1.2, dur: 0.3, a: 0.25, g: 0.16 }); // 倒抽一口氣
    tone(h.in, h.t + 0.5, { f: 60, f1: 40, dur: 0.15, g: 0.3 });
    const c = U({ dur: 2 });
    if (c) for (const f of [392, 494, 587]) tone(c.in, c.t + 0.4, { f, dur: 1.2, a: 0.08, g: 0.016 });
  },
  downed(pos) {
    if (pos && Number.isFinite(pos.x)) { // 隊友倒地
      const h = emit({ pos, cat: 'fx', prio: 4, room: 0.4, dur: 1.5, ref: 2.5, gain: 1, track: false });
      if (h) { tone(h.in, h.t, { f: 60, f1: 26, dur: 0.4, g: 0.8 }); burst(h.in, h.t, { type: 'lowpass', f: 400, f1: 110, dur: 0.3, g: 0.7 }); grunt(h.in, h.t + 0.05, true); }
      const c = U({ dur: 0.8 });
      if (c) { tone(c.in, c.t, { f: 880, dur: 0.12, g: 0.03 }); tone(c.in, c.t + 0.16, { f: 660, dur: 0.16, g: 0.03 }); }
      return;
    }
    const h = F({ dur: 1.5, room: 0.3 }); // 自己倒地:重摔 + 世界變悶(直到 revive)
    if (!h) return;
    tone(h.in, h.t, { f: 60, f1: 26, dur: 0.4, g: 0.9 });
    burst(h.in, h.t, { type: 'lowpass', f: 400, f1: 110, dur: 0.3, g: 0.8 });
    grunt(h.in, h.t + 0.02, true);
    muffle(0.7, Infinity);
    tinnitus(0.03, 3);
    duck(0.5, 1.5);
  },
  killConfirm() {
    if (!limit('kill', 0.05)) return;
    const h = U({ dur: 0.4, gain: 2 });
    if (!h) return;
    cue('kill', h, 0.25, (x) => { metal(x.in, x.t, 2300, 0.07, 0.07, [1, 2.7]); tone(x.in, x.t, { f: 90, f1: 55, dur: 0.08, g: 0.14 }); burst(x.in, x.t, { type: 'highpass', f: 7000, dur: 0.01, g: 0.035 }); });
  },
};
