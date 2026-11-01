// 擬音:槍聲(錄音樣本 + 合成低頻衝擊/機件 + 室內外尾音)、換彈(依各槍動畫時間軸分段)、空膛、開鏡/狙擊鏡、拋殼落地(依材質)、
// 泵動、投擲/爆炸(依距離:近/遠錄音交叉 + 聲速延遲)、近戰、玩家受傷、命中回饋、彈著、殭屍動作。
// 合成版本是完整的備援:樣本沒載入或缺檔時一樣好聽。
import { A, emit, burst, tone, metal, bubble, shaper, gain, filter, rand, pick, curve, duck, muffle, playBuf, baked, prebake, clamp, hurtFilter } from './core.js';
import { grunt } from './voices.js';
import * as S from './samples.js';

// ---------- 小積木 ----------
export function click(d, t, f, g) {
  burst(d, t, { type: 'bandpass', f, q: 6, dur: 0.008, g });
  burst(d, t + 0.002, { type: 'bandpass', f: f * 0.55, q: 3, dur: 0.018, g: g * 0.6 });
}
export function clack(d, t, f, g) {
  burst(d, t, { type: 'highpass', f: 1600, dur: 0.018, g: g * 0.8 });
  burst(d, t, { type: 'bandpass', f, q: 3.5, dur: 0.05, g });
  tone(d, t, { f: f * 0.18, f1: f * 0.09, dur: 0.05, g: g * 0.5 });
  metal(d, t + 0.001, f * 1.7, g * 0.22, 0.07);
}
export function slide(d, t, f0, f1, dur, g) {
  burst(d, t, { type: 'bandpass', f: f0, f1, q: 2.2, dur: dur * 0.6, a: dur * 0.4, g });
}
export function cloth(d, t, dur, g) {
  burst(d, t, { buf: 'pink', type: 'bandpass', f: rand(1300, 2200), f1: rand(900, 1500), q: 0.8, dur: dur * 0.6, a: dur * 0.4, g });
}
function rattle(d, t, kind, g, surf = 'tile') {
  const f = kind === 'metal' ? 2300 : kind === 'alu' ? 3100 : kind === 'heavy' ? 1300 : 1500;
  const soft = surf === 'carpet' || surf === 'grass' ? 0.25 : surf === 'wood' ? 0.6 : 1;
  let tt = t, gg = g;
  for (let i = 0; i < 4; i++) {
    burst(d, tt, { type: 'bandpass', f: f * rand(0.85, 1.15) * (soft < 1 ? 0.6 : 1), q: 3, dur: 0.04, g: gg * soft });
    burst(d, tt, { type: 'lowpass', f: 600, dur: 0.05, g: gg * 0.6 });
    if (kind !== 'plastic' && soft > 0.5) metal(d, tt, f * rand(0.9, 1.3), gg * 0.25 * soft, kind === 'heavy' ? 0.16 : 0.09);
    tt += rand(0.06, 0.12) * (1 - i * 0.2);
    gg *= 0.55;
  }
  if (surf === 'water') for (let i = 0; i < 3; i++) bubble(d, t + rand(0, 0.08), rand(300, 700), g * 0.4, 0.05);
}
// 刮擦/卡頓摩擦(stick-slip)
export function squeal(d, t, f0, f1, dur, g, q = 18, rate = [25, 45]) {
  const b = burst(d, t, { type: 'bandpass', f: f0, f1, q, dur: dur * 0.5, a: dur * 0.5, g });
  const r = rand(rate[0], rate[1]);
  b.g.gain.cancelScheduledValues(t);
  b.g.gain.setValueCurveAtTime(curve(Math.max(32, Math.ceil(dur * 120)), (u) => g * Math.sin(Math.PI * u) * (0.45 + 0.55 * Math.abs(Math.sin(u * dur * r * Math.PI))) * (Math.random() < 0.08 ? 0.3 : 1)), t, dur);
  return b;
}
// 樣本(有就疊在 h 上)否則跑合成 fn
const smp = (key, h, o, fn) => { if (S.play(key, { h, ...o })) return true; if (fn) fn(); return false; };

// ---------- 地面材質 ----------
// 玩家腳下材質:有 World 就直接查(快取 0.2s),否則用最近一次腳步回報的值
let surfT = -1;
export function surfaceHere() {
  const w = A.world, L = A.L, n = A.ctx ? A.ctx.currentTime : 0;
  if (w && w.surfaceAt && n - surfT > 0.2) {
    surfT = n;
    try { A.surface = w.surfaceAt(L.x, L.y - 1.65, L.z) || A.surface; } catch { /* 保留舊值 */ }
  }
  return A.surface;
}
export function surfaceAt(pos) {
  const w = A.world;
  if (w && w.surfaceAt && pos) { try { return w.surfaceAt(pos.x, (pos.y ?? 0) - 0.2, pos.z) || A.surface; } catch { /* 忽略 */ } }
  return A.surface;
}
const HARD = { tile: 1, concrete: 1, metal: 1, asphalt: 1, gravel: 0.6, wood: 0.7 };

// 彈殼/霰彈殼落地(合成):kind 'brass' | 'heavy'(.50)| 'hull'(塑膠霰彈殼)
export function casing(d, t, f, g, kind = 'brass', surf = 'tile', bounces) {
  if (surf === 'water') { // 撲通
    bubble(d, t, rand(500, 800), g * 0.8, 0.06);
    burst(d, t, { type: 'lowpass', f: 1600, f1: 400, dur: 0.06, g: g * 0.4 });
    return;
  }
  const soft = { carpet: 0.15, grass: 0.12, gravel: 0.45, wood: 0.55, concrete: 0.8, asphalt: 0.75, metal: 1.3, tile: 1 }[surf] ?? 1;
  const ringDecay = { metal: 1.6, tile: 1, concrete: 0.7, asphalt: 0.6, wood: 0.35, gravel: 0.3, carpet: 0.1, grass: 0.08 }[surf] ?? 1;
  const n = bounces ?? (surf === 'carpet' || surf === 'grass' ? 1 : surf === 'gravel' || surf === 'wood' ? 2 : kind === 'heavy' ? 2 : 3);
  let tt = t, gg = g, gap = rand(0.08, 0.11);
  for (let i = 0; i < n; i++) {
    if (kind === 'hull') { // 塑膠殼:空心的「咚」,沒有金屬鈴聲
      burst(d, tt, { type: 'bandpass', f: rand(900, 1400) * (soft < 0.5 ? 0.7 : 1), q: 4, dur: 0.03, g: gg * 1.6 * Math.min(1, soft + 0.3) });
      burst(d, tt, { type: 'lowpass', f: 700, dur: 0.03, g: gg * 0.8 });
      if (surf === 'metal') metal(d, tt, 1800, gg * 0.2, 0.05, [1, 2.4]); // 底部銅蓋
    } else {
      if (soft > 0.3) metal(d, tt, f * rand(0.94, 1.06), gg * soft, (kind === 'heavy' ? 0.16 : 0.09) * ringDecay * (1 - i * 0.18), kind === 'heavy' ? [1, 2.32, 4.1, 6.3] : [1, 2.71, 4.93, 7.6]);
      burst(d, tt, { type: soft > 0.5 ? 'highpass' : 'bandpass', f: soft > 0.5 ? 5000 : 2200, dur: 0.008, g: gg * 0.6 * Math.max(soft, 0.3) });
      if (soft < 0.5) burst(d, tt, { type: 'lowpass', f: 900, dur: 0.03, g: gg * 0.5 }); // 悶的落地
    }
    if (surf === 'gravel') for (let k = 0; k < 4; k++) burst(d, tt + rand(0, 0.05), { type: 'bandpass', f: rand(2500, 6000), q: 4, dur: 0.008, g: gg * 0.25 });
    tt += gap;
    gap *= rand(0.55, 0.7);
    gg *= 0.5;
  }
  if (n > 2 && (surf === 'tile' || surf === 'concrete' || surf === 'metal')) // 滾動
    burst(d, tt, { type: 'bandpass', f: f * 0.8, q: 6, dur: 0.18, a: 0.05, g: g * 0.06 });
}

// ---------- 槍聲 ----------
// out 輸出增益、vol 層總量、crack 爆裂頻率、body 中頻吠聲、thump 低頻、room/hall 殘響、mech 擊發機構、cls 尾音類別
export const GUN = {
  pistol: { out: 1.8, vol: 0.62, crack: 4400, body: 1350, bq: 1.4, thump: 160, thumpEnd: 50, tdur: 0.11, bdur: 0.14, room: 0.55, hall: 0.18, mech: 2700, slide: 2500, casing: 4100, sharp: 1, drive: 3, cls: 'pistol', smp: 0.95 },
  revolver: { out: 0.9, vol: 0.95, crack: 3000, body: 820, bq: 1.1, thump: 92, thumpEnd: 33, tdur: 0.26, bdur: 0.34, room: 0.8, hall: 0.45, mech: 1900, ring: 3600, sharp: 1.35, drive: 4, cls: 'magnum', smp: 1.7 },
  shotgun: { out: 1.1, vol: 1.0, crack: 2500, body: 540, bq: 0.9, thump: 72, thumpEnd: 30, tdur: 0.24, bdur: 0.36, room: 0.95, hall: 0.6, mech: 1500, sharp: 1.7, drive: 5, pump: 0.36, cls: 'shotgun', smp: 1.5 },
  ak47: { out: 1.3, vol: 0.86, crack: 3300, body: 650, bq: 1.6, thump: 86, thumpEnd: 36, tdur: 0.16, bdur: 0.23, room: 0.65, hall: 0.32, mech: 1500, bolt: 1150, casing: 2700, sharp: 1.15, drive: 4.5, cls: 'rifle', smp: 1.25 },
  m4a1: { out: 1.75, vol: 0.74, crack: 5800, body: 1600, bq: 1.2, thump: 118, thumpEnd: 44, tdur: 0.12, bdur: 0.16, room: 0.55, hall: 0.26, mech: 2500, bolt: 1950, spring: 840, casing: 4500, sharp: 0.9, drive: 3.5, cls: 'rifle', smp: 0.95 },
  barrett: { out: 0.74, vol: 1.15, crack: 7200, body: 430, bq: 0.8, thump: 54, thumpEnd: 22, tdur: 0.42, bdur: 0.5, room: 1.1, hall: 1.1, mech: 1100, casing: 2050, sharp: 2.4, drive: 6, big: true, cls: 'big', smp: 2.4 },
};
const CASE_T = { pistol: [0.38, 0.6], ak47: [0.42, 0.62], m4a1: [0.38, 0.58], barrett: [0.7, 0.9] };

// 槍聲本體(不含彈殼、泵動):合成。d 輸出、t 起點、v 音量、k 音高
function gunBody(d, t, g, v, k) {
  click(d, t, g.mech * 1.8 * k, 0.18 * v); // 擊發機構
  const sat = shaper(g.drive, d);
  burst(sat, t + 0.002, { type: 'highpass', f: 900, dur: 0.03 * g.sharp, a: 0.0004, g: 1.1 * v }); // 爆音瞬態
  burst(d, t + 0.002, { type: 'lowpass', f: g.crack * k, f1: 420, q: 0.9, dur: g.tdur * 1.6, a: 0.0006, g: 0.95 * v }); // 主爆裂
  burst(d, t + 0.003, { type: 'bandpass', f: g.body * k, f1: g.body * 0.45, q: g.bq, dur: g.bdur, g: 0.85 * v }); // 中頻吠聲(各槍音色差異主要在這)
  tone(d, t + 0.001, { f: g.thump * k, f1: g.thumpEnd, dur: g.tdur * 1.6, a: 0.001, g: 1.0 * v }); // 低頻身體
  tone(d, t + 0.001, { type: 'triangle', f: g.thump * 2.1 * k, f1: g.thumpEnd * 1.5, dur: g.tdur, g: 0.3 * v });
  burst(d, t + rand(0.035, 0.065), { type: 'bandpass', f: 1300, q: 0.8, dur: 0.16, g: 0.2 * v }); // 近距反射
  burst(d, t + rand(0.09, 0.13), { type: 'bandpass', f: 800, q: 0.7, dur: 0.22, g: 0.09 * v });
  mech(d, t, g, v);
  if (g.ring) metal(d, t + 0.002, g.ring, 0.09 * v, 0.35, [1, 1.47, 2.09, 2.9]);
  if (g.big) bigLayers(d, t, v);
}
// 機件往復(滑套/槍機/緩衝彈簧):錄音槍聲上也疊一層,讓連發每發都有細微不同的機械聲
function mech(d, t, g, v) {
  if (g.slide) { burst(d, t + 0.026, { type: 'bandpass', f: g.slide * rand(0.95, 1.05), q: 4, dur: 0.02, g: 0.2 * v }); click(d, t + rand(0.065, 0.075), 3200, 0.12 * v); }
  if (g.bolt) { burst(d, t + 0.03, { type: 'bandpass', f: g.bolt * rand(0.95, 1.05), q: 3, dur: 0.03, g: 0.2 * v }); metal(d, t + rand(0.05, 0.06), g.bolt * 1.6, 0.06 * v, 0.05); }
  if (g.spring) tone(d, t + 0.045, { type: 'triangle', f: g.spring * rand(0.97, 1.03), f1: g.spring * 0.92, dur: 0.1, g: 0.035 * v });
}

// 巴雷特 .50 BMG:制退器側噴的爆壓、胸腔低頻壓力波、長尾音與遠處回聲、槍管後座的沉重機件
function bigLayers(d, t, v) {
  const sat = shaper(7, d);
  burst(sat, t + 0.001, { type: 'bandpass', f: 2600, q: 0.5, dur: 0.05, a: 0.0003, g: 0.9 * v }); // 制退器側噴
  tone(d, t, { f: 40, f1: 18, dur: 0.75, a: 0.003, g: 1.25 * v }); // 壓力波
  tone(d, t + 0.004, { f: 68, f1: 30, dur: 0.4, g: 0.6 * v });
  burst(d, t + 0.01, { buf: 'brown', type: 'lowpass', f: 260, f1: 55, dur: 1.4, a: 0.02, g: 0.95 * v }); // 長低頻轟鳴
  burst(d, t + 0.02, { buf: 'pink', type: 'bandpass', f: 900, f1: 260, q: 0.6, dur: 0.9, a: 0.03, g: 0.25 * v }); // 空氣的撕裂尾音
  for (const [dt, g] of [[0.11, 0.22], [0.24, 0.14], [0.43, 0.09], [0.7, 0.05]]) burst(d, t + dt * rand(0.92, 1.08), { type: 'lowpass', f: 1400, f1: 300, dur: 0.3, g: g * v }); // 牆面/遠處拍擊回聲
  clack(d, t + 0.05, 700, 0.35 * v); // 槍管後座 + 槍機
  metal(d, t + 0.06, 520, 0.12 * v, 0.3, [1, 1.9, 3.1, 4.6]);
}
// 戶外尾音:槍聲在開闊地滾動的長尾(低通噪音緩慢衰減 + 遠處建物的幾次拍擊),依槍的類別
const TAIL = { pistol: [0.9, 0.35, 1400], magnum: [1.6, 0.5, 1100], shotgun: [1.8, 0.55, 900], rifle: [1.5, 0.45, 1200], big: [3, 0.75, 700] };
function tailSynth(d, t, cls) {
  const [len, g, f] = TAIL[cls] || TAIL.rifle;
  burst(d, t + 0.03, { buf: 'pink', type: 'lowpass', f, f1: f * 0.3, dur: len, a: 0.05, g: g * 0.55 });
  burst(d, t + 0.05, { buf: 'brown', type: 'lowpass', f: 320, f1: 80, dur: len * 0.8, a: 0.08, g: g * 0.8 });
  let tt = t + rand(0.18, 0.3), gg = g * 0.5;
  for (let i = 0; i < 3; i++) { burst(d, tt, { type: 'bandpass', f: f * rand(0.6, 1), q: 0.7, dur: 0.25, g: gg }); tt += rand(0.25, 0.6); gg *= 0.55; }
}
const tailFor = (cls) => baked(`tail|${cls}`, 3, (TAIL[cls] || TAIL.rifle)[0] + 1.2, (dst, t0) => tailSynth(dst, t0, cls), 1, 24000);

// 預烘焙:每把槍 4 個合成變體(自動連射時每發只剩一個 BufferSource)
const bakedBody = (id, g) => baked(`gun|${id}`, 4, g.big ? 2.2 : 1.1 + g.tdur * 2, (dst, t0) => gunBody(dst, t0, g, g.vol * rand(0.93, 1.03), rand(0.96, 1.04)));
const bakedMech = (id, g) => baked(`mech|${id}`, 4, 0.3, (dst, t0) => { mech(dst, t0, g, g.vol); tone(dst, t0 + 0.001, { f: g.thump * rand(0.95, 1.05), f1: g.thumpEnd, dur: g.tdur * 1.4, a: 0.001, g: 0.55 * g.vol }); });
// 彈殼:依材質 × 種類各 3 個變體
function casingAt(d, t, f, g, kind, surf, bounces) {
  const set = baked(`case|${kind}|${surf}|${f}|${bounces ?? 'x'}`, 3, 0.7, (dst, t0) => casing(dst, t0, f, g, kind, surf, bounces), 1, 32000);
  if (set) playBuf(d, t, pick(set), { rate: rand(0.94, 1.06) });
  else casing(d, t, f, g, kind, surf, bounces);
}

let reloadH = null, lastShot = 0, physCase = -99;
const RKEY = { pistol: 'pistol.magin', revolver: 'rev.load', ak47: 'ak.magin', m4a1: 'm4.magin', barrett: 'sniper.round' }; // 判斷換彈錄音是否已載入
const GUNS = Object.keys(GUN);
// 開機時(選單中)先烘焙最常用的合成層
export function prebakeFoley() {
  for (const id of GUNS) { const g = GUN[id]; prebake(`mech|${id}`, 4, 0.3, (dst, t0) => { mech(dst, t0, g, g.vol); tone(dst, t0 + 0.001, { f: g.thump * rand(0.95, 1.05), f1: g.thumpEnd, dur: g.tdur * 1.4, a: 0.001, g: 0.55 * g.vol }); }); }
  for (const c of ['pistol', 'rifle', 'shotgun', 'magnum', 'big']) prebake(`tail|${c}`, 3, (TAIL[c] || TAIL.rifle)[0] + 1.2, (dst, t0) => tailSynth(dst, t0, c), 1, 24000);
  prebake('hit', 6, 0.35, (dst, t0) => hitSynth({ in: dst, t: t0 }, rand(0.85, 1.2)));
  for (const s of ['concrete', 'tile', 'wood', 'metal']) prebake(`wall|${s}`, 5, 0.8, (dst, t0) => wallSynth(dst, t0, s), 1, 32000);
}

// 目前的武器(由 switch/shot/reload/adsIn 的 id 得知)
const wpn = (id) => { if (id && GUN[id]) A.weapon = id; return A.weapon || 'pistol'; };
const RIFLE = { ak47: 1, m4a1: 1, barrett: 1, shotgun: 1 };

export const foley = {
  shot(id, pos, remote = false) {
    const g = GUN[id] || GUN.pistol;
    if (!remote) { wpn(id); A.combatT = A.ctx.currentTime; }
    const out = remote ? g.out * 0.55 : g.out;
    const h = pos
      ? emit({ pos, cat: 'gun', prio: 6, room: g.room, hall: g.hall * 1.4, echo: g.room * 1.2, dur: g.big ? 2.4 : 1.4, ref: g.big ? 9 : 5, roll: 0.75, maxDist: g.big ? 200 : 140, gain: out, track: false })
      : emit({ bus: 'sfx', prio: 8, room: g.room, hall: g.big ? 0.5 : 0, echo: g.room * (g.big ? 1.6 : 1), dur: g.big ? 3.2 : 2, gain: out * rand(0.92, 1.04) });
    if (!h) return;
    const t = h.t, v = g.vol, k = rand(0.96, 1.04);
    const smp = S.play(`gun.${id}`, { h, g: g.smp, p: 0.35 });
    if (smp) { // 錄音 + 合成低頻(衝擊感)與機件
      const mk = bakedMech(id, g);
      if (mk) playBuf(h.in, t, pick(mk), { rate: rand(0.97, 1.03) });
      else tone(h.in, t + 0.001, { f: g.thump * k, f1: g.thumpEnd, dur: g.tdur * 1.4, a: 0.001, g: 0.55 * v });
      if (g.big) { tone(h.in, t, { f: 40, f1: 18, dur: 0.7, a: 0.003, g: 0.9 * v }); burst(h.in, t + 0.01, { buf: 'brown', type: 'lowpass', f: 240, f1: 55, dur: 1.3, a: 0.02, g: 0.6 * v }); }
    } else {
      const bk = bakedBody(id, g);
      if (bk) playBuf(h.in, t, pick(bk), { rate: k });
      else gunBody(h.in, t, g, v, k);
    }
    if (A.outdoor) { // 戶外:長而滾動的尾音(室內交給區域殘響)
      const tl = tailFor(g.cls);
      if (tl) playBuf(h.in, t, pick(tl), { rate: rand(0.94, 1.06), g: remote ? 0.8 : 1 });
    }
    if (!remote) {
      const surf = surfaceHere();
      const ct = CASE_T[id];
      // 有實體拋殼系統(sfx.casing 最近有被呼叫)就交給它;巴雷特開狙擊鏡時不拋實體殼,這裡補合成
      const phys = A.ctx.currentTime - physCase < 20 && !(id === 'barrett' && A.ads);
      if (ct && g.casing && !phys) casingAt(h.in, t + rand(ct[0], ct[1]), g.casing, (g.big ? 0.09 : 0.05) * v * rand(0.7, 1.1), g.big ? 'heavy' : 'brass', surf);
      duck(g.big ? 0.3 : 0.5, g.big ? 0.9 : 0.3, g.big);
      if (g.big && A.ctx.currentTime - lastShot > 0.5) muffle(0.25, 0.08, 0.6); // 巨響後耳朵短暫一悶
      lastShot = A.ctx.currentTime;
    } else if (g.pump) pump(h.in, t + g.pump, 0.6, 'tile', false);
  },

  // 空膛擊發:手槍/左輪用手槍版,步槍類用步槍版
  dry(id) {
    const w = wpn(id);
    const h = emit({ bus: 'sfx', prio: 4, room: 0.15, dur: 0.4, gain: 1.4 });
    if (!h) return;
    if (S.play(RIFLE[w] ? 'dry.rifle' : 'dry.pistol', { h, g: 0.5 })) return;
    click(h.in, h.t, RIFLE[w] ? 2800 : 3600, 0.3);
    burst(h.in, h.t + 0.012, { type: 'bandpass', f: RIFLE[w] ? 1300 : 1700, q: 3, dur: 0.025, g: 0.18 });
    metal(h.in, h.t + 0.012, 2900, 0.04, 0.05);
  },

  // 換彈:dur = 實際換彈秒數(改裝後會變快),整段時間軸依比例縮放;empty = 空膛(要放槍機/滑套)。
  // 霰彈槍每裝一發呼叫一次(逐發裝填)
  reload(id, dur, empty) {
    wpn(id);
    if (id === 'shotgun') return shellIn();
    if (reloadH) reloadH.kill();
    const NOM = { pistol: 1.5, revolver: 2.6, ak47: 2.5, m4a1: 2.1, barrett: 3.6 };
    const len = Number.isFinite(dur) && dur > 0 ? dur : NOM[id] || 1.5;
    const h = emit({ bus: 'sfx', prio: 4, room: 0.2, dur: len + 0.8, gain: 0.38 });
    if (!h) return;
    reloadH = h;
    // 整段換彈(錄音 + 合成)第一次用到後烘焙成緩衝:之後每次只剩一個 BufferSource(否則一次要建 60~100 個節點)
    const surf = surfaceHere(), em = empty !== false, hard = (HARD[surf] ?? 0) >= 0.7, q = Math.round(len * 10) / 10, rec = S.has(RKEY[id]) ? 1 : 0;
    const set = baked(`reload|${id}|${q}|${em ? 1 : 0}|${hard ? 1 : 0}|${rec}`, 2, q + 0.8, (dst, t0) => reloadSeq({ in: dst, t: t0 }, id, q, em, hard ? 'tile' : 'carpet'), 1, 32000);
    if (set) { playBuf(h.in, h.t, pick(set), { rate: rand(0.985, 1.015) }); return; }
    reloadSeq(h, id, len, em, surf);
  },

  // 泵動上膛(霰彈槍開火後/裝填完)
  pump() {
    const h = emit({ bus: 'sfx', prio: 4, room: 0.15, dur: 0.9, gain: 0.5 });
    if (!h) return;
    if (!S.play('sg.pump', { h, g: 0.9 })) pump(h.in, h.t, 1, surfaceHere(), false);
  },

  switch(id) {
    if (reloadH) { reloadH.kill(); reloadH = null; }
    const w = wpn(id);
    const h = emit({ bus: 'sfx', prio: 4, room: 0.15, dur: 0.7, gain: 0.8 });
    if (!h) return;
    const heavy = w === 'barrett' || w === 'shotgun' || w === 'ak47';
    S.play('holster', { h, g: 0.55, semi: heavy ? -2 : 0 });
    cloth(h.in, h.t, 0.22, 0.13);
    clack(h.in, h.t + 0.13, heavy ? 1500 : 2200, 0.16);
    click(h.in, h.t + 0.22, 2800, 0.12);
    metal(h.in, h.t + 0.24, heavy ? 2600 : 3500, 0.025, 0.08);
  },

  // 開鏡/收鏡:衣物摩擦 + 槍托貼臉的輕微碰觸;巴雷特的狙擊鏡多一聲鏡環「喀」與屏息
  adsIn(id) {
    const w = wpn(id);
    A.ads = true;
    const h = emit({ bus: 'sfx', prio: 3, room: 0.06, dur: 0.8, gain: 1.4 });
    if (!h) return;
    if (!S.play('ads', { h, g: 0.35, len: 0.32, fo: 0.08 })) burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1700, f1: 2600, q: 0.9, dur: 0.08, a: 0.05, g: 0.09 });
    click(h.in, h.t + 0.11, 2400, 0.05);
    burst(h.in, h.t + 0.11, { type: 'lowpass', f: 380, dur: 0.05, g: 0.08 });
    if (w === 'barrett') { // 狙擊鏡:鏡環喀 + 輕微吸氣(屏息)
      click(h.in, h.t + 0.3, 1900, 0.06);
      metal(h.in, h.t + 0.3, 4200, 0.012, 0.06, [1, 2.3]);
      burst(h.in, h.t + 0.36, { buf: 'pink', type: 'bandpass', f: 1500, f1: 2300, q: 1.1, dur: 0.25, a: 0.2, g: 0.03 });
    }
  },
  adsOut(id) {
    const w = wpn(id);
    A.ads = false;
    const h = emit({ bus: 'sfx', prio: 3, room: 0.06, dur: 0.6, gain: 1.4 });
    if (!h) return;
    if (!S.play('ads', { h, g: 0.25, off: 0.05, len: 0.25, fo: 0.08, rate: 1.1 })) burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 1900, f1: 1200, q: 0.9, dur: 0.07, a: 0.04, g: 0.08 });
    click(h.in, h.t + 0.07, 1900, 0.035);
    if (w === 'barrett') burst(h.in, h.t + 0.05, { buf: 'pink', type: 'bandpass', f: 1100, f1: 600, q: 1, dur: 0.3, a: 0.05, g: 0.035 }); // 吐氣
  },

  // 彈殼落地(實體拋殼系統在每次彈跳時呼叫):pos 位置、surf 地面材質、kind 'pistol'|'rifle'|'shell'、n 第幾次彈跳
  casing(pos, surf, kind, n = 0) {
    physCase = A.ctx.currentTime;
    const s = surf || surfaceAt(pos), big = kind === 'rifle' && A.weapon === 'barrett';
    const h = emit({ pos, cat: 'casing', prio: 1, room: 0.12, dur: 0.6, ref: 1, roll: 1.2, maxDist: 16, gain: (n ? 0.5 : 1) * (big ? 1.5 : 1), track: false });
    if (!h) return;
    const semi = kind === 'pistol' ? 2.5 : big ? -5 : 0;
    if (kind === 'shell') {
      if (HARD[s] && s !== 'metal' && S.play('sg.shelldrop', { h, g: 0.45, len: n ? 0.18 : undefined, fo: n ? 0.05 : 0 })) return;
      casingAt(h.in, h.t, 0, 0.06, 'hull', s, n ? 1 : 2);
      return;
    }
    const key = s === 'tile' || s === 'metal' ? 'casing.tile' : s === 'concrete' || s === 'asphalt' ? 'casing.concrete' : null;
    if (key && S.play(key, { h, g: s === 'metal' ? 0.5 : 0.4, semi, len: n ? 0.15 : undefined, fo: n ? 0.04 : 0 })) {
      if (s === 'metal') metal(h.in, h.t, (big ? 1400 : 3800) * rand(0.95, 1.05), 0.03, 0.18, [1, 2.71, 4.93]); // 鋼板共鳴
      return;
    }
    casingAt(h.in, h.t, big ? 2050 : kind === 'pistol' ? 4100 : 3600, (big ? 0.09 : 0.05) * rand(0.7, 1.1), big ? 'heavy' : 'brass', s, n ? 1 : 2);
  },

  // ---------- 投擲 / 爆炸 / 近戰 ----------
  // 拔插銷:插銷環的金屬摩擦 + 環晃動的叮噹
  grenadePin() {
    const h = emit({ bus: 'sfx', prio: 4, room: 0.12, dur: 0.6 });
    if (!h) return;
    const t = h.t;
    slide(h.in, t, 3000, 4600, 0.07, 0.12); // 拉環摩擦
    metal(h.in, t + 0.07, 3900, 0.07, 0.12, [1, 2.2, 3.6]); // 拉環叮
    for (let i = 0; i < 3; i++) metal(h.in, t + 0.12 + i * rand(0.05, 0.08), rand(4200, 5200), 0.02 * (1 - i * 0.25), 0.06, [1, 2.4]); // 環晃動
    cloth(h.in, t, 0.12, 0.05);
  },
  // 投出:保險片彈開(飛片)+ 揮臂風切
  grenadeThrow() {
    const h = emit({ bus: 'sfx', prio: 4, room: 0.15, dur: 1 });
    if (!h) return;
    const t = h.t;
    metal(h.in, t, 2650, 0.08, 0.18, [1, 2.76, 4.3]); // 保險片彈開
    click(h.in, t, 2000, 0.12);
    metal(h.in, t + rand(0.25, 0.4), rand(3000, 3600), 0.015, 0.08, [1, 2.5]); // 保險片落地
    burst(h.in, t + 0.02, { buf: 'pink', type: 'bandpass', f: 600, f1: 2400, glide: 0.1, q: 1.1, dur: 0.22, a: 0.06, g: 0.35 }); // 揮臂風切
    cloth(h.in, t, 0.25, 0.1);
  },
  grenadeBounce(pos) {
    const surf = surfaceAt(pos);
    const h = emit({ pos, cat: 'fx', prio: 3, room: 0.3, dur: 0.8, ref: 2, track: false });
    if (!h) return;
    const t = h.t, soft = surf === 'grass' || surf === 'carpet' ? 0.35 : surf === 'wood' ? 0.7 : 1;
    if (surf === 'water') { burst(h.in, t, { type: 'lowpass', f: 1500, f1: 300, dur: 0.12, g: 0.6 }); for (let i = 0; i < 4; i++) bubble(h.in, t + rand(0, 0.15), rand(300, 700), 0.15, 0.06); return; }
    if (soft >= 0.7 && S.play('nade.bounce', { h, g: 0.6 * soft })) { if (surf === 'metal') metal(h.in, t, rand(380, 520), 0.12, 0.4, [1, 1.8, 2.9]); return; }
    burst(h.in, t, { type: 'lowpass', f: 700, f1: 160, dur: 0.06, g: 0.55 }); // 鑄鐵殼體的悶擊
    metal(h.in, t, rand(780, 1100), 0.2 * soft, 0.1 * soft, [1, 2.2, 3.7, 5.1]);
    burst(h.in, t, { type: 'bandpass', f: 2200, q: 2, dur: 0.015, g: 0.3 * soft });
    if (surf === 'gravel') for (let i = 0; i < 6; i++) burst(h.in, t + rand(0, 0.08), { type: 'bandpass', f: rand(2500, 6000), q: 4, dur: 0.01, g: 0.12 });
    if (surf === 'metal') metal(h.in, t, rand(380, 520), 0.15, 0.4, [1, 1.8, 2.9]);
  },
  // 爆炸:近(< 15m)用近距錄音、遠(> 40m)用遠距錄音,中間交叉;遠處依聲速延遲到達、高頻被空氣吃掉(聲道條低通)
  explosion(pos, size = 1) {
    const sz = clamp(Number.isFinite(size) ? size : 1, 0.2, 1.5);
    let d = 0;
    if (pos) d = Math.hypot(pos.x - A.L.x, (pos.y ?? 1) - A.L.y, pos.z - A.L.z);
    const delay = d > 12 ? Math.min(0.5, d / 343) : 0;
    const h = pos
      ? emit({ pos, cat: 'fx', prio: 8, room: 1, hall: 0.7, echo: 1.1, dur: 4.5, delay, ref: 5 + sz * 4, roll: 0.6, maxDist: 160, gain: 0.95, track: false })
      : emit({ bus: 'sfx', prio: 8, room: 1, hall: 0.7, echo: 1.1, dur: 4.5, gain: 0.95 });
    if (!h) return;
    const t = h.t, dd = h.in, v = 0.6 + sz * 0.4;
    const near = clamp(1 - (d - 15) / 25, 0, 1), far = clamp((d - 8) / 25, 0, 1);
    let rec = false;
    if (near > 0.02) rec = !!S.play('explosion', { h, g: 0.95 * v * near, p: 1.2 });
    if (far > 0.02) rec = !!S.play('explosion.far', { h, g: 1.1 * v * far, p: 1 }) || rec;
    if (!rec) {
      const sat = shaper(5, dd);
      burst(sat, t, { type: 'highpass', f: 700, dur: 0.035, a: 0.0005, g: 1.1 * v }); // 衝擊波的爆裂
      burst(dd, t + 0.002, { type: 'lowpass', f: 3200, f1: 180, dur: 0.6, a: 0.001, g: 1.0 * v }); // 爆炸主體
      burst(dd, t + 0.01, { type: 'bandpass', f: 420, f1: 120, q: 0.7, dur: 0.8, g: 0.7 * v });
      for (let i = 0; i < 26; i++) burst(dd, t + rand(0.25, 2.6) * (i < 10 ? 0.5 : 1), { type: 'bandpass', f: rand(1500, 6500), q: 3, dur: rand(0.01, 0.03), g: rand(0.02, 0.08) * v }); // 碎屑落下
      for (let i = 0; i < 5; i++) metal(dd, t + rand(0.3, 1.4), rand(3500, 7000), 0.02 * v, 0.2, [1, 1.53, 2.31]); // 玻璃碎片
    } else if (d < 20) for (let i = 0; i < 10; i++) burst(dd, t + rand(0.3, 2.2), { type: 'bandpass', f: rand(1500, 6500), q: 3, dur: rand(0.01, 0.03), g: rand(0.02, 0.06) * v }); // 碎屑落下(近)
    tone(dd, t, { f: 58, f1: 20, dur: 1.4 + sz * 0.6, a: 0.002, g: 1.2 * v }); // 次低頻壓力
    burst(dd, t + 0.03, { buf: 'brown', type: 'lowpass', f: 320, f1: 50, dur: 2.6 + sz, a: 0.04, g: 0.9 * v }); // 長轟鳴
    const big = d < 30 * sz;
    setTimeout(() => { duck(big ? 0.22 : 0.45, big ? 1.4 : 0.8, big); }, delay * 1000);
    if (d < 9 * sz) { // 太近:耳鳴 + 世界變悶
      const c = 1 - d / (9 * sz);
      muffle(0.55 + 0.4 * c, 0.4 + sz * 0.6, 3);
      tinnitus(0.04 + 0.06 * c, 2.5 + sz * 1.5);
    }
  },
  knifeSwing() {
    A.combatT = A.ctx.currentTime;
    const h = emit({ bus: 'sfx', prio: 4, room: 0.08, dur: 0.6, gain: 0.9 });
    if (!h) return;
    const t = h.t, r = rand(0.9, 1.15);
    S.play('knife.swing', { h, g: 0.5 });
    burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 700 * r, f1: 3000 * r, glide: 0.09, q: 1.4, dur: 0.17, a: 0.05, g: 0.3 }); // 刀刃劃破空氣
    burst(h.in, t + 0.1, { buf: 'pink', type: 'bandpass', f: 2400 * r, f1: 900, q: 1.2, dur: 0.1, g: 0.12 });
    cloth(h.in, t, 0.2, 0.08);
    metal(h.in, t + 0.02, 5200, 0.012, 0.08, [1, 1.7]);
  },
  knifeHit(pos, flesh = true) {
    const h = emit(pos ? { pos, cat: 'fx', prio: 4, room: 0.18, dur: 0.9, ref: 1.5, gain: 1.4, track: false } : { bus: 'sfx', prio: 4, room: 0.18, dur: 0.9, gain: 1.1 });
    if (!h) return;
    const t = h.t;
    if (flesh) {
      if (S.play('knife.stab', { h, g: 0.75 })) { if (Math.random() < 0.6) S.play('flesh.tear', { h, g: 0.35, at: 0.06 }); return; }
      burst(h.in, t, { type: 'bandpass', f: 440, f1: 170, q: 5, dur: 0.1, g: 0.55 }); // 刺入
      tone(h.in, t, { f: 150, f1: 55, dur: 0.1, g: 0.4 });
      burst(h.in, t + 0.005, { type: 'lowpass', f: 2400, f1: 500, dur: 0.07, g: 0.3 }); // 濕
      burst(h.in, t + 0.002, { type: 'highpass', f: 2600, dur: 0.012, g: 0.16 }); // 軟骨
      burst(h.in, t + 0.12, { type: 'bandpass', f: 600, f1: 300, q: 3, dur: 0.08, g: 0.2 }); // 拔出
    } else {
      S.play('impact.metal', { h, g: 0.3 });
      metal(h.in, t, rand(2900, 3500), 0.12, 0.18, [1, 2.4, 4.1, 5.9]);
      burst(h.in, t, { type: 'highpass', f: 3000, dur: 0.02, g: 0.3 });
      burst(h.in, t + 0.01, { type: 'bandpass', f: 3200, f1: 1900, q: 2, dur: 0.08, g: 0.1 }); // 刮
      for (let i = 0; i < 4; i++) burst(h.in, t + rand(0.03, 0.25), { type: 'bandpass', f: rand(3500, 6500), q: 5, dur: 0.01, g: 0.04 });
    }
  },

  // ---------- 玩家 ----------
  hurt(amount) {
    A.combatT = A.ctx.currentTime;
    const h = emit({ bus: 'sfx', prio: 6, room: 0.12, dur: 1, gain: 0.75 });
    if (!h) return;
    tone(h.in, h.t, { f: 95, f1: 38, dur: 0.3, g: 0.75 });
    burst(h.in, h.t, { type: 'lowpass', f: 500, f1: 100, dur: 0.22, g: 0.45 });
    burst(h.in, h.t, { type: 'bandpass', f: 900, q: 1, dur: 0.06, g: 0.2 }); // 皮肉
    const now = A.ctx.currentTime;
    if (now - (A.gruntT || -9) > 0.55) { // 悶哼不要每下都叫
      A.gruntT = now;
      if (!S.play('player.hurt', { h, g: 0.55, at: 0.02 })) grunt(h.in, h.t + 0.03);
    }
    hurtFilter(NaN, clamp((Number.isFinite(amount) ? amount : 15) / 30, 0.25, 1));
  },
  knock() {
    const h = emit({ bus: 'sfx', prio: 7, room: 0.2, dur: 1.2, gain: 0.75 });
    if (!h) return;
    burst(h.in, h.t, { buf: 'pink', type: 'bandpass', f: 400, f1: 1600, q: 1.2, dur: 0.22, a: 0.12, g: 0.3 }); // 風切
    tone(h.in, h.t + 0.12, { f: 80, f1: 32, dur: 0.35, g: 0.95 });
    burst(h.in, h.t + 0.12, { type: 'lowpass', f: 700, f1: 90, dur: 0.3, g: 0.6 });
    rattle(h.in, h.t + 0.16, 'metal', 0.06, surfaceHere());
    if (!S.play('player.hit', { h, g: 0.6, at: 0.12 })) grunt(h.in, h.t + 0.14, true);
    duck(0.6, 0.4);
    muffle(0.35, 0.15, 0.8);
    hurtFilter(NaN, 1);
  },
  armorHit() { // 防彈板吸收:悶的拍擊 + 陶瓷板的「叩」
    const h = emit({ bus: 'sfx', prio: 5, room: 0.1, dur: 0.5, gain: 1.2 });
    if (!h) return;
    const t = h.t;
    burst(h.in, t, { type: 'lowpass', f: 1300, f1: 280, dur: 0.08, g: 0.5 });
    burst(h.in, t, { type: 'bandpass', f: 1800, q: 4, dur: 0.03, g: 0.3 });
    metal(h.in, t + 0.002, rand(2700, 3100), 0.05, 0.08, [1, 2.3]);
    tone(h.in, t, { f: 125, f1: 60, dur: 0.12, g: 0.4 });
    burst(h.in, t + 0.01, { buf: 'pink', type: 'bandpass', f: 2500, q: 0.8, dur: 0.07, g: 0.08 }); // 尼龍布
  },

  // ---------- 命中回饋 ----------
  hit() {
    const h = emit({ bus: 'sfx', prio: 4, room: 0.12, dur: 0.5, gain: 0.95 });
    if (!h) return;
    const t = h.t, r = rand(0.85, 1.2);
    if (S.play('flesh.hit', { h, g: 0.5, p: 1 })) { tone(h.in, t, { f: 150 * r, f1: 50, dur: 0.08, g: 0.22 }); return; }
    const set = baked('hit', 6, 0.35, (dst, t0) => hitSynth({ in: dst, t: t0 }, rand(0.85, 1.2)));
    if (set) { playBuf(h.in, t, pick(set), { rate: rand(0.95, 1.05) }); return; }
    hitSynth(h, r);
  },
  headshot() {
    const h = emit({ bus: 'sfx', prio: 5, room: 0.18, dur: 0.8, gain: 0.8 });
    if (!h) return;
    if (S.play('flesh.head', { h, g: 0.6 })) { tone(h.in, h.t + 0.01, { f: 1900, dur: 0.09, g: 0.05 }); tone(h.in, h.t + 0.01, { f: 2870, dur: 0.07, g: 0.03 }); return; }
    const set = baked('headshot', 4, 0.45, (dst, t0) => headSynth({ in: dst, t: t0 }));
    if (set) { playBuf(h.in, h.t, pick(set), { rate: rand(0.96, 1.04) }); return; }
    headSynth(h);
  },
  // 子彈打到牆/地:pos 有給就定位,surface 決定音色(混凝土碎屑/金屬跳彈/木頭/磁磚碎片/水花)
  wall(pos, surface) {
    const surf = surface || (pos ? surfaceAt(pos) : 'concrete');
    const h = pos ? emit({ pos, cat: 'fx', prio: 1, room: 0.3, dur: 1, ref: 2, gain: 1.6, maxDist: 40, track: false }) : emit({ bus: 'sfx', prio: 1, room: 0.25, dur: 1, gain: 1.2 });
    if (!h) return;
    const t = h.t;
    const metalHit = surf === 'metal';
    const key = metalHit ? 'impact.metal' : surf === 'water' || surf === 'wood' || surf === 'carpet' || surf === 'grass' || surf === 'glass' || surf === 'fabric' ? null : 'impact.concrete';
    let rec = false;
    if (key) rec = !!S.play(key, { h, g: metalHit ? 0.35 : 0.45 });
    if (!rec) {
      const set = baked(`wall|${surf}`, 5, 0.8, (dst, t0) => wallSynth(dst, t0, surf), 1, 32000);
      if (set) playBuf(h.in, t, pick(set), { rate: rand(0.92, 1.08) });
      else wallSynth(h.in, t, surf);
    } else if (surf === 'tile') metal(h.in, t + 0.01, rand(3500, 4500), 0.03, 0.06, [1, 1.6]); // 磁磚碎片
    if (Math.random() < (metalHit ? 0.45 : surf === 'concrete' || surf === 'tile' || surf === 'asphalt' ? 0.1 : 0)) { // 跳彈呼嘯
      if (!S.play('ricochet', { h, g: 0.3, at: 0.01 })) {
        const p = A.ctx.createStereoPanner();
        p.pan.setValueAtTime(rand(-0.6, 0), t);
        p.pan.linearRampToValueAtTime(rand(0.4, 0.9) * (Math.random() < 0.5 ? -1 : 1), t + 0.35);
        p.connect(h.in);
        tone(p, t + 0.01, { f: rand(2600, 3400), f1: rand(1200, 1600), dur: 0.35, g: 0.05, a: 0.005 });
      }
    }
  },

  // ---------- 殭屍動作 ----------
  bite(pos) {
    const h = emit({ pos, cat: 'fx', prio: 5, room: 0.15, dur: 0.9, ref: 1.5, gain: 1.5, track: false });
    if (!h) return;
    const t = h.t;
    click(h.in, t, 3200, 0.3); // 牙齒
    if (S.play(Math.random() < 0.2 ? 'bite.bone' : 'flesh.bite', { h, g: 0.7, at: 0.015 })) { if (Math.random() < 0.4) S.play('flesh.tear', { h, g: 0.3, at: 0.12 }); return; }
    const tear = burst(h.in, t + 0.02, { type: 'bandpass', f: 1300, q: 1.4, dur: 0.22, a: 0.02, g: 0.5 });
    tear.g.gain.cancelScheduledValues(t + 0.02);
    tear.g.gain.setValueCurveAtTime(curve(48, (u) => 0.5 * Math.pow(1 - u, 1.4) * (Math.random() < 0.35 ? 1 : 0.25)), t + 0.02, 0.22); // 撕裂顆粒
    tone(h.in, t + 0.03, { f: 300, f1: 110, dur: 0.15, g: 0.3 });
    burst(h.in, t + 0.04, { type: 'lowpass', f: 1800, f1: 400, dur: 0.1, g: 0.3 });
  },
  // 爬行者手掌拍地 + 身體拖行(錄音拖行循環隨機截一段)
  crawl(pos) {
    const h = emit({ pos, cat: 'step', prio: 2, room: 0.15, dur: 1.1, maxDist: 22, gain: 3.2 });
    if (!h) return;
    const t = h.t;
    burst(h.in, t, { type: 'lowpass', f: 1100, f1: 260, dur: 0.06, g: 0.4 }); // 手拍地
    if (S.play('zc.drag', { h, g: 0.12, off: rand(0, 8), len: rand(0.6, 0.9), fi: 0.08, fo: 0.25, at: 0.05 })) return;
    burst(h.in, t + 0.08, { buf: 'pink', type: 'bandpass', f: 700, f1: 450, q: 1.3, dur: 0.4, a: 0.2, g: 0.35 }); // 身體拖行
    burst(h.in, t + 0.12, { type: 'highpass', f: 3000, dur: 0.3, a: 0.1, g: 0.03 });
    if (Math.random() < 0.5) bubble(h.in, t + 0.2, rand(180, 300), 0.06);
  },
  // 巨屍重踏
  stomp(pos) {
    const h = emit({ pos, cat: 'fx', prio: 3, room: 0.45, dur: 1.2, ref: 3, roll: 0.9, gain: 0.6, maxDist: 60 });
    if (!h) return;
    const t = h.t;
    const rec = S.play('zx.stomp', { h, g: 0.9 });
    tone(h.in, t, { f: 50, f1: 27, dur: 0.45, g: rec ? 0.6 : 1 });
    if (!rec) {
      burst(h.in, t, { type: 'lowpass', f: 280, f1: 60, dur: 0.35, g: 0.8 });
      burst(h.in, t, { type: 'bandpass', f: 900, q: 1, dur: 0.04, g: 0.3 });
    }
    for (let i = 0; i < 6; i++) burst(h.in, t + rand(0.05, 0.5), { type: 'bandpass', f: rand(2500, 6000), q: 4, dur: 0.012, g: rand(0.02, 0.05) }); // 震落碎屑
  },
  wallImpact(pos) {
    const h = emit({ pos, cat: 'fx', prio: 6, room: 0.6, hall: 0.45, dur: 2, ref: 4, roll: 0.8, gain: 0.7, maxDist: 80, track: false });
    if (!h) return;
    const t = h.t;
    S.play('body.heavy', { h, g: 0.6 });
    tone(h.in, t, { f: 62, f1: 24, dur: 0.9, g: 1 });
    burst(h.in, t, { type: 'lowpass', f: 1600, f1: 90, dur: 0.7, g: 0.9 });
    burst(h.in, t, { type: 'highpass', f: 1800, dur: 0.05, g: 0.6 }); // 混凝土碎裂
    for (let i = 0; i < 5; i++) metal(h.in, t + rand(0, 0.15), rand(380, 900), 0.08, 0.25); // 金屬框架
    for (let i = 0; i < 14; i++) burst(h.in, t + rand(0.15, 1.4), { type: 'bandpass', f: rand(1500, 6000), q: 3, dur: 0.02, g: rand(0.02, 0.07) });
    duck(0.5, 0.6);
  },
  thud(pos, heavy = false) {
    const h = emit({ pos, cat: 'fx', prio: 2, room: 0.3, dur: 1, ref: heavy ? 3 : 1.8, gain: heavy ? 0.7 : 0.8, track: false });
    if (!h) return;
    const t = h.t, surf = surfaceAt(pos);
    const rec = surf !== 'water' && S.play(heavy ? 'body.heavy' : 'body.fall', { h, g: heavy ? 0.8 : 0.6 });
    tone(h.in, t, { f: heavy ? 60 : 95, f1: heavy ? 26 : 40, dur: heavy ? 0.4 : 0.22, g: (heavy ? 1 : 0.65) * (rec ? 0.5 : 1) });
    if (!rec) {
      burst(h.in, t, { type: 'lowpass', f: heavy ? 400 : 550, f1: 110, dur: heavy ? 0.3 : 0.18, g: heavy ? 0.85 : 0.55 });
      burst(h.in, t + 0.01, { buf: 'pink', type: 'bandpass', f: 1200, q: 0.7, dur: 0.1, g: 0.15 }); // 衣物
      burst(h.in, t + rand(0.1, 0.16), { type: 'lowpass', f: 700, f1: 200, dur: 0.06, g: 0.25 }); // 四肢落地
      burst(h.in, t + rand(0.18, 0.26), { type: 'lowpass', f: 600, f1: 200, dur: 0.05, g: 0.15 });
    }
    if (surf === 'water') for (let i = 0; i < 8; i++) bubble(h.in, t + rand(0, 0.4), rand(200, 600), 0.12, 0.07);
    else if (surf === 'metal') metal(h.in, t, rand(300, 420), 0.12, 0.5, [1, 1.8, 2.9, 4.2]);
    if (heavy) duck(0.7, 0.4);
  },
  spit(pos) {
    const h = emit({ pos, cat: 'fx', prio: 4, room: 0.3, dur: 1.2, ref: 2, gain: 2.3 });
    if (!h) return;
    const t = h.t;
    if (S.play('zb.spit', { h, g: 0.22 })) return;
    burst(h.in, t, { buf: 'pink', type: 'bandpass', f: 1100, f1: 1600, q: 1.2, dur: 0.12, a: 0.18, g: 0.35 }); // 喉嚨蓄痰
    burst(h.in, t + 0.3, { type: 'bandpass', f: 700, q: 2, dur: 0.05, g: 0.55 }); // 噴出
    burst(h.in, t + 0.3, { type: 'lowpass', f: 2200, f1: 500, dur: 0.08, g: 0.3 });
    for (let i = 0; i < 4; i++) bubble(h.in, t + 0.32 + i * 0.03, rand(250, 500), 0.06);
  },
  splash(pos) {
    const h = emit({ pos, cat: 'fx', prio: 3, room: 0.25, dur: 1.2, ref: 1.8, track: false });
    if (!h) return;
    const t = h.t;
    if (!S.play('zb.splat', { h, g: 0.6 })) {
      burst(h.in, t, { type: 'lowpass', f: 1900, f1: 300, dur: 0.12, g: 0.6 });
      for (let i = 0; i < 8; i++) bubble(h.in, t + rand(0.02, 0.3), rand(400, 900), rand(0.03, 0.07), 0.03);
    }
    burst(h.in, t + 0.04, { type: 'highpass', f: 3200, dur: 0.6, a: 0.06, g: 0.1 }); // 腐蝕滋滋
  },
  sizzle(pos) {
    const h = emit({ pos, cat: 'fx', prio: 0, room: 0.15, dur: 1, maxDist: 16, ref: 1.2, gain: 0.7, track: false });
    if (!h) return;
    const t = h.t, dur = rand(0.55, 0.8);
    if (S.play('acid.sizzle', { h, g: 0.3, off: rand(0, 1.5), len: dur, fi: 0.05, fo: 0.2 })) return;
    const b = burst(h.in, t, { type: 'highpass', f: rand(2600, 3400), dur, a: 0.05, g: 0.12 });
    b.g.gain.cancelScheduledValues(t);
    b.g.gain.setValueCurveAtTime(curve(64, (u) => 0.12 * Math.sin(Math.PI * u) * (Math.random() < 0.2 ? 1.8 : 0.6)), t, dur); // 劈啪
    for (let i = 0; i < 3; i++) bubble(h.in, t + rand(0, dur), rand(300, 600), 0.03, 0.04);
  },
  // 腫脹者爆開
  burst(pos) {
    const h = emit({ pos, cat: 'fx', prio: 7, room: 0.5, hall: 0.4, dur: 2.2, ref: 4, roll: 0.85, gain: 0.97, track: false });
    if (!h) return;
    const t = h.t;
    const rec = S.play('gore.burst', { h, g: 0.9 });
    if (rec) { S.play('gore.splat', { h, g: 0.5, at: rand(0.15, 0.3) }); S.play('gore.splat', { h, g: 0.35, at: rand(0.45, 0.8) }); }
    tone(h.in, t, { f: 72, f1: 24, dur: 0.6, g: rec ? 0.7 : 1 });
    burst(h.in, t, { type: 'lowpass', f: 950, f1: 80, dur: 0.5, g: rec ? 0.5 : 1 });
    if (!rec) {
      burst(h.in, t + 0.005, { type: 'bandpass', f: 600, f1: 250, q: 0.8, dur: 0.3, g: 0.7 }); // 濕爆
      for (let i = 0; i < 25; i++) burst(h.in, t + rand(0.08, 1.3), { type: 'lowpass', f: rand(900, 2600), f1: 300, dur: 0.05, g: rand(0.04, 0.12) }); // 血肉雨
      for (let i = 0; i < 14; i++) bubble(h.in, t + rand(0.05, 0.8), rand(120, 380), rand(0.05, 0.12), 0.07);
    }
    duck(0.45, 0.6);
  },
};

// 換彈時間軸:各段時間 = 槍模動畫的關鍵影格(models.js 的 anim)× 實際換彈秒數。有樣本就用錄音,否則合成。
function reloadSeq(h, id, len, empty, surf) {
  const d = h.in, t0 = h.t, at = (u) => u * len;
  const P = (key, u, g, fn, o) => { if (!S.play(key, { h, at: at(u), g, ...o })) fn(t0 + at(u)); };
  cloth(d, t0, 0.25, 0.1);
  if (id === 'revolver') { // 擺出 0.05~0.2 → 退殼 0.32(實體彈殼會自己落地出聲)→ 逐發裝填 → 轉彈巢 0.6 → 合上 0.88
    P('rev.open', 0.07, 1.2, (t) => { click(d, t, 2200, 0.3); slide(d, t + 0.1, 1500, 2600, 0.1, 0.18); clack(d, t + 0.21, 2600, 0.28); });
    P('rev.eject', 0.28, 0.9, (t) => slide(d, t, 1300, 800, 0.08, 0.15));
    for (let i = 0; i < 6; i++) P('rev.load', 0.4 + i * 0.035 + rand(-0.005, 0.005), 0.8, (t) => { metal(d, t, rand(2600, 3000), 0.07, 0.05); click(d, t + 0.02, 2000, 0.14); });
    P('rev.spin', 0.62, 0.7, (t) => { for (let i = 0; i < 5; i++) click(d, t + i * 0.03, 3000, 0.1 * (1 - i * 0.15)); });
    P('rev.close', 0.86, 1.2, (t) => clack(d, t, 2400, 0.42));
    if (Math.random() < 0.6) P('rev.cock', 0.95, 0.9, (t) => { click(d, t, 1700, 0.3); click(d, t + 0.04, 2600, 0.22); });
  } else if (id === 'barrett') { // 卸下 0.1~0.3 → 裝上 0.46~0.62 → 拉機柄 0.7 → 放開 0.85
    click(d, t0 + at(0.08), 2100, 0.3); // 彈匣卡榫
    slide(d, t0 + at(0.12), 900, 600, 0.16, 0.24); // 沉重彈匣滑出
    rattle(d, t0 + at(0.34), 'heavy', 0.12, surf); // 舊彈匣落地
    P('sniper.round', 0.5, 1, (t) => slide(d, t, 650, 1100, 0.18, 0.22)); // 新彈匣推入
    clack(d, t0 + at(0.6), 800, 0.6);
    tone(d, t0 + at(0.6), { f: 110, f1: 55, dur: 0.12, g: 0.3 });
    if (empty) {
      P('sniper.charge', 0.7, 1.1, (t) => { slide(d, t, 1900, 950, 0.2, 0.3); clack(d, t + 0.4, 700, 0.85); });
      metal(d, t0 + at(0.85), 620, 0.1, 0.35, [1, 1.9, 3.1, 4.6]);
      tone(d, t0 + at(0.85), { f: 90, f1: 45, dur: 0.14, g: 0.35 });
    }
  } else if (id === 'ak47') { // 傾斜 0.08 → 撥下彈匣 0.18~0.36 → 新彈匣 0.5~0.66 → (空膛)拉機柄 0.8
    P('ak.magout', 0.17, 1.1, (t) => { clack(d, t, 1100, 0.4); slide(d, t + 0.09, 1200, 700, 0.15, 0.2); });
    rattle(d, t0 + at(0.38), 'metal', 0.09, surf);
    P('ak.magin', 0.5, 1.1, (t) => { slide(d, t, 700, 1300, 0.12, 0.18); click(d, t + 0.12, 1600, 0.2); clack(d, t + 0.32, 1000, 0.55); });
    tone(d, t0 + at(0.62), { f: 140, f1: 70, dur: 0.08, g: 0.15 });
    if (empty) P('ak.bolt', 0.8, 1.1, (t) => { slide(d, t, 2100, 1100, 0.13, 0.25); clack(d, t + 0.16, 1400, 0.65); });
  } else if (id === 'm4a1') { // 釋放 0.08 → 掉落 0.1~0.3 → 裝入 0.52~0.76(手掌拍入)→ (空膛)放槍機 0.88
    P('m4.magout', 0.08, 1.1, (t) => { click(d, t, 3000, 0.28); slide(d, t + 0.03, 2200, 1500, 0.09, 0.18); });
    rattle(d, t0 + at(0.34), 'alu', 0.08, surf);
    P('m4.magin', 0.55, 1.1, (t) => { slide(d, t, 1400, 2400, 0.12, 0.2); clack(d, t + 0.17, 1800, 0.45); });
    burst(d, t0 + at(0.74), { type: 'lowpass', f: 320, dur: 0.06, g: 0.3 }); // 手掌拍入
    tone(d, t0 + at(0.74), { f: 120, f1: 70, dur: 0.07, g: 0.22 });
    if (empty) P('m4.charge', 0.86, 1, (t) => { slide(d, t, 2600, 1600, 0.1, 0.22); clack(d, t + 0.17, 2300, 0.55); tone(d, t + 0.17, { type: 'triangle', f: 900, f1: 820, dur: 0.14, g: 0.04 }); });
  } else { // 手槍:釋放 0.07 → 彈匣滑出 0.1~0.3 → 新彈匣 0.52~0.78 → (空膛)放滑套 0.86
    P('pistol.magout', 0.07, 1.1, (t) => { click(d, t, 2600, 0.28); slide(d, t + 0.04, 1800, 900, 0.12, 0.18); });
    if (Math.random() < 0.7) rattle(d, t0 + at(0.36), 'plastic', 0.08, surf);
    P('pistol.magin', 0.6, 1.1, (t) => { slide(d, t, 900, 1800, 0.14, 0.18); clack(d, t + 0.18, 1500, 0.42); });
    if (empty) P(Math.random() < 0.5 ? 'pistol.release' : 'pistol.slide', 0.86, 1, (t) => { slide(d, t, 2200, 1200, 0.06, 0.25); clack(d, t + 0.08, 2100, 0.5); metal(d, t + 0.08, 3300, 0.05, 0.12); });
  }
}

// 霰彈逐發裝填:從彈帶拿殼 → 壓入彈倉 → 托彈板卡榫
function shellIn() {
  const h = emit({ bus: 'sfx', prio: 4, room: 0.18, dur: 0.6, gain: 0.45 });
  if (!h) return;
  const d = h.in, tt = h.t;
  cloth(d, tt, 0.08, 0.05);
  if (S.play('sg.insert', { h, g: 0.9, at: 0.02 })) return;
  burst(d, tt + 0.08, { type: 'bandpass', f: 1100, f1: 750, q: 2, dur: 0.05, g: 0.22 }); // 壓入彈倉
  click(d, tt + 0.125, 2300, 0.2); // 托彈板卡榫
  burst(d, tt + 0.13, { type: 'lowpass', f: 500, dur: 0.04, g: 0.18 });
  metal(d, tt + 0.13, rand(1700, 1900), 0.025, 0.05, [1, 2.5]);
}

function hitSynth(h, r) {
  const t = h.t;
  burst(h.in, t, { type: 'bandpass', f: 950 * r, f1: 280, q: 1, dur: 0.09, g: 0.45 });
  tone(h.in, t, { f: 150 * r, f1: 50, dur: 0.08, g: 0.32 });
  burst(h.in, t + 0.008, { type: 'lowpass', f: 2600, f1: 500, dur: 0.05, g: 0.22 }); // 濕潤噴濺
  burst(h.in, t + 0.012, { type: 'bandpass', f: 420, f1: 180, q: 5, dur: 0.07, g: 0.2 }); // squelch
  if (Math.random() < 0.3) burst(h.in, t + 0.002, { type: 'highpass', f: 2500, dur: 0.012, g: 0.18 }); // 骨裂
}
function headSynth(h) {
  const t = h.t;
  burst(h.in, t, { type: 'highpass', f: 2400, dur: 0.016, g: 0.55 }); // 頭骨碎裂
  burst(h.in, t, { type: 'bandpass', f: 1600, q: 3, dur: 0.05, g: 0.4 });
  tone(h.in, t, { f: 180, f1: 60, dur: 0.09, g: 0.3 });
  for (let i = 0; i < 4; i++) burst(h.in, t + 0.015 + i * rand(0.02, 0.04), { type: 'lowpass', f: rand(1500, 3000), f1: 400, dur: 0.045, g: 0.16 }); // 噴濺
  tone(h.in, t + 0.01, { f: 1900, dur: 0.09, g: 0.07 }); // 爆頭提示音(輕)
  tone(h.in, t + 0.01, { f: 2870, dur: 0.07, g: 0.04 });
}
// 彈著合成(依材質)
function wallSynth(d, t, surf) {
  if (surf === 'water') { burst(d, t, { type: 'lowpass', f: 2600, f1: 500, dur: 0.1, g: 0.35 }); for (let i = 0; i < 5; i++) bubble(d, t + rand(0, 0.12), rand(500, 1200), 0.08, 0.04); return; }
  if (surf === 'metal') { // 金屬板:叮
    metal(d, t, rand(1800, 2600), 0.14, 0.25, [1, 2.2, 3.5, 5.3]);
    burst(d, t, { type: 'highpass', f: 3000, dur: 0.02, g: 0.3 });
  } else if (surf === 'wood') {
    burst(d, t, { type: 'bandpass', f: rand(900, 1300), q: 2.5, dur: 0.05, g: 0.32 });
    burst(d, t, { type: 'lowpass', f: 700, f1: 200, dur: 0.06, g: 0.2 });
    for (let i = 0; i < 4; i++) burst(d, t + rand(0.02, 0.2), { type: 'bandpass', f: rand(2000, 4000), q: 3, dur: 0.015, g: 0.04 }); // 木屑
  } else if (surf === 'glass') { // 玻璃:碎裂 + 落下的細碎
    burst(d, t, { type: 'highpass', f: 2500, dur: 0.03, g: 0.3 });
    for (let i = 0; i < 10; i++) metal(d, t + Math.pow(Math.random(), 1.6) * 0.5, rand(2500, 8000), rand(0.008, 0.025), rand(0.04, 0.16), [1, 1.47, 2.13]);
  } else if (surf === 'carpet' || surf === 'grass' || surf === 'fabric') { // 軟:悶的「噗」+ 少量碎屑
    burst(d, t, { type: 'lowpass', f: 900, f1: 250, dur: 0.06, g: 0.3 });
    burst(d, t, { buf: 'pink', type: 'bandpass', f: 1800, q: 0.8, dur: 0.05, g: 0.1 });
  } else {
    burst(d, t, { type: 'bandpass', f: rand(2800, 3800), q: 2, dur: 0.03, g: 0.24 });
    burst(d, t, { type: 'lowpass', f: 1300, f1: 300, dur: 0.06, g: 0.14 });
    const chips = surf === 'tile' ? 8 : 6;
    for (let i = 0; i < chips; i++) burst(d, t + rand(0.03, 0.35), { type: 'bandpass', f: rand(4000, 7000), q: 5, dur: 0.01, g: rand(0.02, 0.05) }); // 碎屑落下
    if (surf === 'tile') metal(d, t + 0.01, rand(3500, 4500), 0.03, 0.06, [1, 1.6]); // 磁磚碎片
    burst(d, t + 0.02, { type: 'highpass', f: 5000, dur: 0.25, a: 0.05, g: 0.025 }); // 粉塵
  }
}

// 泵動:滑套後拉(退殼)→ 前推上膛;eject 時塑膠殼落地
function pump(d, t, g, surf, eject) {
  slide(d, t, 900, 1500, 0.09, 0.3 * g);
  clack(d, t + 0.09, 1250, 0.5 * g);
  metal(d, t + 0.09, 2100, 0.05 * g, 0.08);
  slide(d, t + 0.17, 1500, 1000, 0.07, 0.25 * g);
  clack(d, t + 0.25, 1700, 0.6 * g);
  tone(d, t + 0.25, { f: 160, f1: 80, dur: 0.06, g: 0.2 * g });
  if (eject) casingAt(d, t + rand(0.5, 0.65), 0, 0.06 * g, 'hull', surf);
}

// 耳鳴:非定位、不受悶音影響
export function tinnitus(g, dur) {
  const h = emit({ bus: 'ui', prio: 7, dur: dur + 0.3, gain: 1 });
  if (!h) return;
  const f = rand(3700, 4300);
  tone(h.in, h.t, { f, dur, a: 0.05, g });
  tone(h.in, h.t, { f: f * 1.013, dur: dur * 0.8, a: 0.08, g: g * 0.4 });
}
