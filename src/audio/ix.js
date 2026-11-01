// 門、置物櫃、紙張(地圖)、按鍵音:取自 test 分支 src/audio/interact.js 的同名函式(合成;沒有樣本時的完整版本)。
// 一次性聲音走 core.js 的 emit():給 pos({x,y,z})= 3D 定位(遮蔽、殘響、距離衰減),pos 為 null = 玩家手上/耳邊。
// AudioContext 未建立時全部安全地不做事。
import { A, emit, gain, filter, burst, tone, metal, shaper, playBuf, curve, duck, baked, rand, pick } from './core.js';

function click(d, t, f, g) {
  burst(d, t, { type: 'bandpass', f, q: 6, dur: 0.008, g });
  burst(d, t + 0.002, { type: 'bandpass', f: f * 0.55, q: 3, dur: 0.018, g: g * 0.6 });
}
function clack(d, t, f, g) {
  burst(d, t, { type: 'highpass', f: 1600, dur: 0.018, g: g * 0.8 });
  burst(d, t, { type: 'bandpass', f, q: 3.5, dur: 0.05, g });
  tone(d, t, { f: f * 0.18, f1: f * 0.09, dur: 0.05, g: g * 0.5 });
  metal(d, t + 0.001, f * 1.7, g * 0.22, 0.07);
}
function slide(d, t, f0, f1, dur, g) {
  burst(d, t, { type: 'bandpass', f: f0, f1, q: 2.2, dur: dur * 0.6, a: dur * 0.4, g });
}
// 刮擦/卡頓摩擦(stick-slip)
function squeal(d, t, f0, f1, dur, g, q = 18, rate = [25, 45]) {
  const b = burst(d, t, { type: 'bandpass', f: f0, f1, q, dur: dur * 0.5, a: dur * 0.5, g });
  const r = rand(rate[0], rate[1]);
  b.g.gain.cancelScheduledValues(t);
  b.g.gain.setValueCurveAtTime(curve(Math.max(32, Math.ceil(dur * 120)), (u) => g * Math.sin(Math.PI * u) * (0.45 + 0.55 * Math.abs(Math.sin(u * dur * r * Math.PI))) * (Math.random() < 0.08 ? 0.3 : 1)), t, dur);
  return b;
}
const DEV = import.meta.env?.DEV;
const playSample = () => null; // main 沒有這些錄音樣本:一律用合成版本
const warn = (e) => { if (DEV) console.warn('[audio/ix]', e); };
// 同 audio.js 的 safe(不從 audio.js 匯入,避免循環相依)
const safe = (fn) => (...a) => { if (!A.ctx) return; try { return fn(...a); } catch (e) { warn(e); } };
const P = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : null);

// 一次性聲音:pos 有效 = 3D(fx 聲道條),否則 = 玩家手上/耳邊(非定位,o.self 為自身殘響送出)
function E(pos, o) {
  const p = P(pos);
  if (p) return emit({ cat: 'fx', ref: 1.5, track: false, ...o, pos: p });
  return emit({ bus: 'sfx', prio: o.prio ?? 4, dur: o.dur, delay: o.delay, gain: o.gain ?? 1, room: o.self ?? 0.1, hall: o.selfHall ?? 0 });
}
// 揚聲器/電話頻寬:輸入 → 輕微飽和 → 高通 → 低通 → dest(回傳輸入節點)
const band = (dest, lo, hi, k = 1.4) => shaper(k, filter('highpass', lo, 0.75, filter('lowpass', hi, 0.75, dest)));
// 隨機顆粒調幅(紙張皺摺、木纖維撕裂、滾輪顫動):把 burst 的包絡換成隨機曲線
function grain(b, t, dur, g, rate, dens, lo = 0.05) {
  b.g.gain.cancelScheduledValues(t);
  b.g.gain.setValueCurveAtTime(curve(Math.max(16, Math.ceil(dur * rate)), (u) => g * (Math.random() < dens ? rand(0.6, 1) : rand(lo, lo * 4)) * Math.min(1, u * 12, (1 - u) * 12 + 0.02)), t, dur);
  return b;
}
const crinkle = (d, t, dur, g, f = 3200) => grain(burst(d, t, { type: 'bandpass', f, q: 0.7, dur, g }), t, dur, g, 120, 0.35);
// 刮擦/卡頓摩擦:foley.squeal 的 g 是窄帶濾波之後的量(Q 越高、頻率越低越小聲),這裡換成和頻寬無關的音量 lv
const sq = (d, t, f0, f1, dur, lv, q = 18, rate) => squeal(d, t, f0, f1, dur, lv * Math.sqrt((q * 1000) / f0), q, rate);
function bashSynth(d, t, hv) { // 殭屍捶門的一下:門板受力 + 門板共鳴 + 門閂/鉸鏈/門把在門框裡的金屬顫動(巨屍:更低、更重、木頭裂聲與落灰)
  const k = hv ? 0.7 : 1;
  tone(d, t, { f: 95 * k, f1: 45 * k, dur: hv ? 0.35 : 0.18, g: hv ? 0.9 : 0.6 });
  burst(d, t, { type: 'lowpass', f: 1400 * k, f1: 150, dur: hv ? 0.3 : 0.15, g: hv ? 0.8 : 0.55 });
  burst(d, t, { type: 'bandpass', f: 420 * k, q: 2.5, dur: 0.1, g: 0.3 });
  for (let i = 0; i < (hv ? 6 : 4); i++) metal(d, t + 0.01 + rand(0, 0.12) * (1 + i * 0.4), rand(1500, 2800), 0.04 * (1 - i * 0.12), 0.07, [1, 2.4, 3.7]);
  burst(d, t + 0.02, { type: 'bandpass', f: 900, q: 1.2, dur: 0.2, g: 0.08 });
  if (hv) {
    burst(d, t + 0.005, { type: 'highpass', f: 2200, dur: 0.04, g: 0.25 });
    for (let i = 0; i < 8; i++) burst(d, t + rand(0.05, 0.6), { type: 'bandpass', f: rand(2500, 6000), q: 4, dur: 0.012, g: rand(0.02, 0.05) });
  }
}
const DOOR_OPEN = { fire: 1.8, cell: 1, ward: 3.2, glass: 2, wood: 1 }, DOOR_CLOSE = { fire: 0.7, cell: 1, ward: 1.8, glass: 2.2, wood: 0.8 }; // 依種類的音量
const DTMF = '123A456B789C*0#D';

export const ix = {
  // ---- 門 ----
  doorOpen: safe((pos, kind = 'ward') => {
    const k = DOOR_OPEN[kind] ? kind : 'ward';
    const h = E(pos, { prio: 3, room: 0.7, hall: 0.25, dur: 3.2, ref: 2, gain: DOOR_OPEN[k] });
    if (!h) return;
    const d = h.in, t = h.t;
    if (k === 'fire') { // 防火門:推桿「喀鏘」→ 門閂縮回 → 沉重的鉸鏈低鳴 + 門板帶動的空氣 + 閉門器油壓嘶聲
      clack(d, t, 900, 0.35); metal(d, t + 0.005, 1500, 0.06, 0.15, [1, 2.4, 3.9]); click(d, t + 0.05, 2600, 0.15);
      tone(d, t, { f: 140, f1: 80, dur: 0.08, g: 0.2 });
      sq(d, t + 0.18, rand(260, 340), rand(220, 300), rand(0.6, 0.9), 0.2, 12, [12, 22]);
      burst(d, t + 0.2, { buf: 'pink', type: 'lowpass', f: 500, dur: 0.6, a: 0.25, g: 0.06 });
      burst(d, t + 0.4, { type: 'bandpass', f: 2200, q: 0.8, dur: 0.6, a: 0.3, g: 0.008 });
    } else if (k === 'cell') { // 隔離房鐵門:門閂滑開 → 到底「鏘」→ 鉸鏈呻吟
      if (!playSample('scrape', { h, g: 0.25, len: 0.45, fo: 0.12 })) sq(d, t, rand(900, 1200), rand(700, 900), 0.4, 0.2, 20);
      clack(d, t + 0.45, 700, 0.4); metal(d, t + 0.45, rand(380, 450), 0.08, 0.6, [1, 1.8, 2.9, 4.2]);
      sq(d, t + 0.7, rand(180, 240), rand(150, 200), rand(0.9, 1.3), 0.25, 10, [10, 18]);
    } else if (k === 'ward') { // 病房美耐板門:壓下門把 → 斜舌縮回 → 輕輕推開(偶爾鉸鏈吱一聲)
      click(d, t, 2400, 0.2); clack(d, t + 0.04, 1400, 0.14); click(d, t + 0.09, 3200, 0.08);
      burst(d, t + 0.12, { buf: 'pink', type: 'bandpass', f: 600, q: 0.6, dur: 0.5, a: 0.25, g: 0.05 });
      if (Math.random() < 0.4 && !playSample('door.creak', { h, g: 0.1, semi: 3, at: 0.15, len: 0.6, fo: 0.2 })) sq(d, t + 0.15, rand(500, 700), rand(400, 600), 0.5, 0.12, 14, [18, 40]);
    } else if (k === 'glass') { // 鋁框玻璃門:門把 + 鋁框顫動 + 玻璃輕響 + 地鉸鏈
      clack(d, t, 1800, 0.2);
      for (let i = 0; i < 4; i++) metal(d, t + 0.03 + rand(0, 0.12), rand(900, 1500), 0.03, 0.12, [1, 2.3, 3.7]);
      metal(d, t + 0.04, rand(2600, 3400), 0.015, 0.4, [1, 2.76, 5.4]);
      burst(d, t + 0.1, { buf: 'pink', type: 'bandpass', f: 800, q: 0.6, dur: 0.5, a: 0.2, g: 0.04 });
      if (Math.random() < 0.5) sq(d, t + 0.15, rand(1800, 2400), rand(1500, 2000), 0.25, 0.08, 25);
    } else { // 老木門:門把 → 慢慢被推開的長吱嘎
      click(d, t, 1600, 0.12);
      if (!playSample('door.creak', { h, g: 0.5, at: 0.05 })) {
        const f = rand(300, 550), dur = rand(1.2, 2);
        sq(d, t + 0.05, f, f * rand(0.7, 1.4), dur, 0.3, 14, [18, 40]);
        tone(filter('lowpass', 300, 0.7, d), t + 0.05, { type: 'sawtooth', f: rand(80, 100), dur: dur * 0.5, a: dur * 0.5, g: 0.05 });
      }
    }
  }),
  doorClose: safe((pos, kind = 'ward') => {
    const k = DOOR_CLOSE[kind] ? kind : 'ward';
    const h = E(pos, { prio: 3, room: 0.8, hall: 0.35, dur: 4.6, ref: 2.2, gain: DOOR_CLOSE[k] });
    if (!h) return;
    const d = h.in, t = h.t;
    if (k === 'fire') { // 閉門器拉回(嘶)→ 沉重的鋼門撞上門框 → 門閂卡入 + 推桿震動
      burst(d, t, { type: 'bandpass', f: 2000, q: 0.8, dur: 0.3, a: 0.25, g: 0.008 });
      const tc = t + 0.5;
      tone(d, tc, { f: 66, f1: 30, dur: 0.5, g: 0.8 });
      burst(d, tc, { type: 'lowpass', f: 1100, f1: 100, dur: 0.4, g: 0.7 });
      metal(d, tc, rand(170, 220), 0.12, 1.1, [1, 1.8, 2.9, 4.2, 5.6]);
      clack(d, tc + 0.02, 1400, 0.3);
      for (let i = 0; i < 4; i++) metal(d, tc + 0.05 + i * rand(0.04, 0.07), rand(1600, 2600), 0.025 * (1 - i * 0.2), 0.08, [1, 2.4]);
      duck(0.7, 0.4);
    } else if (k === 'cell') { // 隔離房鐵門重重關上 + 門閂震動
      if (!playSample('door.cell', { h, g: 0.75 })) { tone(d, t, { f: 70, f1: 30, dur: 0.5, g: 0.8 }); metal(d, t, rand(180, 240), 0.2, 1.4, [1, 1.8, 2.9, 4.2, 5.6]); burst(d, t, { type: 'lowpass', f: 1200, f1: 150, dur: 0.3, g: 0.5 }); }
      duck(0.7, 0.45);
    } else if (k === 'ward') { // 空心門板的悶響 + 斜舌彈進門扣
      tone(d, t, { f: 120, f1: 70, dur: 0.12, g: 0.4 });
      burst(d, t, { type: 'lowpass', f: 900, f1: 200, dur: 0.1, g: 0.35 });
      burst(d, t, { type: 'bandpass', f: 350, q: 3, dur: 0.06, g: 0.2 });
      click(d, t + 0.005, 2800, 0.2);
      clack(d, t + 0.01, 1500, 0.12);
    } else if (k === 'glass') { // 鋁框拍上 + 玻璃一陣細顫
      burst(d, t, { type: 'bandpass', f: 1000, q: 1, dur: 0.06, g: 0.3 });
      tone(d, t, { f: 180, f1: 110, dur: 0.06, g: 0.2 });
      for (let i = 0; i < 5; i++) metal(d, t + rand(0, 0.06), rand(700, 1300), 0.04, 0.15, [1, 2.3, 3.7]);
      grain(burst(d, t + 0.01, { type: 'bandpass', f: 4200, q: 2, dur: 0.3, g: 0.03 }), t + 0.01, 0.3, 0.03, 90, 0.5);
      metal(d, t + 0.005, rand(2800, 3600), 0.02, 0.5, [1, 2.76, 5.4]);
    } else { // 老木門:最後一點吱嘎 → 木頭撞上門框 → 門閂
      sq(d, t, rand(350, 500), rand(300, 420), 0.25, 0.15, 12, [18, 40]);
      tone(d, t + 0.25, { f: 100, f1: 55, dur: 0.18, g: 0.5 });
      burst(d, t + 0.25, { type: 'lowpass', f: 800, f1: 150, dur: 0.15, g: 0.45 });
      burst(d, t + 0.25, { type: 'bandpass', f: 280, q: 2.5, dur: 0.1, g: 0.25 });
      clack(d, t + 0.27, 1100, 0.12);
    }
  }),
  doorBash: safe((pos, heavy = false) => { // 每次呼叫 = 一下;烘焙成變體,連續捶門時每下只剩一個 BufferSource
    const hv = !!heavy;
    const h = E(pos, { prio: 5, room: 0.6, hall: hv ? 0.3 : 0.1, dur: hv ? 1.4 : 0.9, ref: hv ? 3 : 2, roll: 0.9, maxDist: 50, gain: hv ? 2 : 2.2 });
    if (!h) return;
    const set = baked(`ix|bash|${+hv}`, 4, hv ? 1.1 : 0.6, (dst, t0) => bashSynth(dst, t0, hv), 1, 32000);
    if (set) playBuf(h.in, h.t, pick(set), { rate: rand(0.94, 1.06), g: rand(0.85, 1) });
    else bashSynth(h.in, h.t, hv);
    if (hv) duck(0.75, 0.35);
  }),
  doorKnock: safe((pos, n = 3) => { // 門的另一邊有人用指節敲門:悶、慢,最後一下停頓比較久
    const h = E(pos, { prio: 4, room: 0.55, hall: 0.05, dur: 0.6 + n * 0.55, ref: 1.6, roll: 1, maxDist: 26, gain: 1.5 });
    if (!h) return;
    let t = h.t;
    for (let i = 0; i < n; i++) {
      tone(h.in, t, { f: rand(92, 120), f1: 58, dur: 0.11, g: 0.45 });
      burst(h.in, t, { type: 'lowpass', f: 650, f1: 180, dur: 0.07, g: 0.38 });
      burst(h.in, t, { type: 'bandpass', f: rand(380, 520), q: 2.5, dur: 0.03, g: 0.12 });
      t += i === n - 2 ? rand(0.75, 1.05) : rand(0.34, 0.46);
    }
  }),
  barricade: safe((pos) => { // 釘木板:木板靠上門框 → 3~4 下鐵鎚(釘子越打越深,音高變高)→ 木板受力的吱嘎
    const h = E(pos, { prio: 4, room: 0.6, dur: 3.2, ref: 2, gain: 1.05 });
    if (!h) return;
    const d = h.in, t = h.t;
    burst(d, t, { type: 'bandpass', f: 500, q: 1.5, dur: 0.08, g: 0.25 });
    tone(d, t, { f: 160, f1: 100, dur: 0.07, g: 0.2 });
    let tt = t + rand(0.4, 0.55), nf = rand(2600, 3000);
    for (let i = 0, n = pick([3, 4, 4]); i < n; i++) {
      metal(d, tt, nf, 0.12, 0.09, [1, 2.4, 3.9]);
      burst(d, tt, { type: 'highpass', f: 3000, dur: 0.01, g: 0.3 });
      tone(d, tt, { f: rand(170, 210), f1: 110, dur: 0.08, g: 0.3 });
      burst(d, tt, { type: 'bandpass', f: rand(600, 900), q: 2, dur: 0.07, g: 0.25 });
      tt += rand(0.32, 0.45); nf *= rand(1.04, 1.08);
    }
    sq(d, tt, rand(300, 450), rand(250, 380), rand(0.4, 0.6), 0.2, 10, [14, 26]);
  }),
  barricadeBreak: safe((pos) => { // 木板撐到極限 → 斷裂(木纖維撕裂、釘子被拔出)→ 木板落地彈跳 + 木屑
    const h = E(pos, { prio: 5, room: 0.7, hall: 0.3, dur: 3, ref: 2.5, roll: 0.9, maxDist: 55, gain: 0.8 });
    if (!h) return;
    const d = h.in, t = h.t, tc = t + 0.28;
    sq(d, t, rand(260, 340), rand(180, 240), 0.3, 0.25, 9, [20, 40]);
    burst(d, tc, { type: 'highpass', f: 1800, dur: 0.05, g: 0.5 });
    tone(d, tc, { f: 120, f1: 50, dur: 0.25, g: 0.6 });
    burst(d, tc, { type: 'lowpass', f: 1500, f1: 200, dur: 0.2, g: 0.5 });
    grain(burst(d, tc, { type: 'bandpass', f: 2800, q: 0.8, dur: 0.05, hold: 0.25, g: 0.2 }), tc, 0.3, 0.2, 150, 0.4);
    sq(d, tc + 0.05, rand(1600, 2200), rand(2400, 3000), 0.12, 0.12, 18);
    let tt = tc + rand(0.35, 0.5);
    for (let i = 0, n = pick([2, 3]); i < n; i++) {
      const g = 1 - i * 0.25;
      tone(d, tt, { f: rand(140, 200), f1: 90, dur: 0.1, g: 0.35 * g });
      burst(d, tt, { type: 'bandpass', f: rand(500, 800), q: 2, dur: 0.09, g: 0.3 * g });
      burst(d, tt + rand(0.08, 0.12), { type: 'bandpass', f: rand(600, 900), q: 2, dur: 0.05, g: 0.1 * g });
      tt += rand(0.15, 0.3);
    }
    for (let i = 0; i < 8; i++) burst(d, tc + rand(0.05, 1.2), { type: 'bandpass', f: rand(2000, 5000), q: 3, dur: 0.015, g: rand(0.02, 0.06) });
    duck(0.7, 0.4);
  }),

  lockerOpen: safe((pos) => { // 薄鐵置物櫃:扳起門閂 → 門板「嗡」地彈開 + 鉸鏈 + 門板晃動
    const h = E(pos, { prio: 3, room: 0.5, dur: 1.6, ref: 1.5, gain: 1.5 });
    if (!h) return;
    const d = h.in, t = h.t, t1 = t + 0.12;
    if (!playSample('pick.ammobox', { h, g: 0.5 })) { clack(d, t, 1700, 0.2); click(d, t + 0.02, 3000, 0.1); }
    metal(d, t1, rand(190, 240), 0.06, 0.35, [1, 1.47, 2.09, 2.9]);
    sq(d, t1 + 0.05, rand(1100, 1500), rand(900, 1200), rand(0.25, 0.4), 0.1, 20);
    for (let i = 0; i < 3; i++) metal(d, t1 + 0.04 + rand(0, 0.3), rand(1200, 2200), 0.02, 0.08, [1, 2.4]);
    burst(d, t1, { buf: 'pink', type: 'bandpass', f: 700, q: 0.7, dur: 0.3, a: 0.1, g: 0.04 });
  }),
  // ---- 紙張 / 錄音帶 ----
  paper: safe(() => { // 拿起紙條:皺摺 + 攤開的低頻「啪」+ 尾端的細碎
    const h = E(null, { prio: 4, dur: 0.9, gain: 0.9 });
    if (!h) return;
    const d = h.in, t = h.t;
    crinkle(d, t, rand(0.35, 0.5), 0.12, 3600);
    burst(d, t + 0.08, { buf: 'pink', type: 'bandpass', f: 600, q: 0.7, dur: 0.18, a: 0.08, g: 0.06 });
    crinkle(d, t + 0.3, 0.2, 0.05, 5000);
  }),
  pageTurn: safe(() => { // 翻一張紙(地圖換樓層):掃過的沙沙聲 + 紙角拍一下
    const h = E(null, { prio: 4, dur: 0.6, gain: 1.1 });
    if (!h) return;
    const d = h.in, t = h.t;
    slide(d, t, rand(3000, 3600), rand(1500, 1900), 0.24, 0.05);
    crinkle(d, t + 0.03, 0.16, 0.045, 4400);
    burst(d, t + 0.21, { buf: 'pink', type: 'bandpass', f: 430, q: 0.8, dur: 0.07, a: 0.03, g: 0.05 });
  }),
  paperClose: safe(() => { // 摺起來收好
    const h = E(null, { prio: 4, dur: 0.7, gain: 1.35 });
    if (!h) return;
    const d = h.in, t = h.t;
    crinkle(d, t, 0.25, 0.08, 3000);
    burst(d, t + 0.12, { buf: 'pink', type: 'bandpass', f: 500, q: 0.7, dur: 0.12, a: 0.05, g: 0.05 });
    slide(d, t + 0.25, 2500, 1800, 0.12, 0.04);
  }),
  dtmf: safe((digit) => { // 按鍵音:手指壓下塑膠鍵(直接聽到)+ 雙頻音(從聽筒裡)
    const h = E(null, { prio: 4, dur: 0.45, gain: 0.7 });
    if (!h) return;
    clack(h.in, h.t, 1900, 0.06);
    const i = DTMF.indexOf(String(digit ?? '').toUpperCase().charAt(0));
    if (i < 0) return;
    const b = band(gain(0.25, h.in), 300, 3400, 1.2);
    for (const f of [[697, 770, 852, 941][i >> 2], [1209, 1336, 1477, 1633][i & 3]]) tone(b, h.t + 0.01, { f, dur: 0.012, hold: 0.1, a: 0.004, g: 0.2 });
  }),
};
