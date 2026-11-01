// 真人錄音(public/audio/folk/,來源、授權與剪輯紀錄見 public/credits/audio.md)。
//
// 1) 取樣哼唱樂器(folk.js 的 hum_wcf / hum_thh / hum_hkk 用它,取代共振峰合成的 iHum):
//    取樣表 = 一個 MP3 裡排好幾個「長音」,每個 = 錄音自己的起音 + 一段交叉淡化好的迴圈(整數個週期、頭尾互相關最大),
//    根音是量出來的(YIN)。iVox() 照簡譜旋律挑最近的根音、用 playbackRate 移調(多半在 ±3 半音內,避免共振峰跟著跑),
//    同音高有兩個 take 時輪流用;連音 = 交叉淡化 + 從前一個音滑過來的滑音;同音重唱 = 小小的「嗯—嗯」;
//    不規則的顫音(速度會飄、每個音延遲出現)、慢的音高漂移、樂句前吸一口氣(鼻子吸氣的真實錄音)、氣聲。
//    阿嬤:成年女聲的哼聲往下移(調性 A,約低三個半音)、顫音寬而不穩、音量顫抖、氣多、句尾往下掉。
//    孩子:女童唱的單音(G 大調五聲的音剛好都有),顫音淺、句子越來越小聲。
// 2) 錄音片段(folk.js 的 clip 配方):太平間/納骨堂/禮拜堂的誦經循環(龍山寺 ×2、xserra 的比丘尼誦經 + 木魚)、
//    戶外很遠的北管樂句、收音機的老唱片〈豐原調〉(只留唱的部分)、育嬰區錄音帶裡大人唱的〈天黑黑〉。
// 全部在暖機完成(performance mark 'hz:warm')之後才下載;單聲道、16~24 kHz,在背景執行緒解碼(samples.js 的佇列);
// 150 秒沒用就釋放(要再用時從 HTTP 快取重新解碼)。載入失敗時 folk.js 退回原本的合成版本。
import { A, gain, filter, rand, clamp, burst } from './core.js';
import { fetchBuf } from './samples.js';

// ---------- 取樣表(scratchpad/vocals/scripts/prep_hum.py 產生;秒) ----------
// n: [根音 Hz, 起音起點, 迴圈起點, 迴圈終點, 終點];br: 吸氣 [起, 訖]
export const SETS = {
  // drotzruhn〈Humming C D A for alexggqs〉(Freesound 439504,CC0)前半段的乾聲:A3 / C4 / D4 各兩個 take(已做頻譜對齊);
  // 吸氣:PSsoundproject〈Woman humming a nondescript tune〉(Wikimedia Commons,CC0)
  ama: { f: 'folk/hum_ama_sheet.mp3', sr: 22050, n: [[223.63, 0.02, 1.19769, 2.1729, 2.25292], [222.73, 2.31292, 4.16308, 5.15723, 5.23725], [263.43, 5.29725, 8.36464, 9.62559, 9.70562], [262.93, 9.76562, 10.12406, 10.76721, 10.84725], [296.91, 10.90725, 11.19795, 12.32659, 12.40663], [297.94, 12.46663, 12.91996, 13.90107, 13.98108]], br: [[14.04108, 14.45108], [14.51108, 15.00108], [15.06108, 15.50108]] },
  // f-r-a-g-i-l-e〈Child Chops, Glitchy Sampler, Dry〉(Freesound 500743,CC0):女童唱的 E4 G4 A4 B4 C5 D5 E5(避開削波、剪接聲的那幾個);
  //   原本每個音只有 0.16~0.3 秒 → 穩定段先把音高拉平(±30 音分內),再用相位對齊的隨機顆粒接長,迴圈約 1 秒
  //   (短迴圈會有每秒 7 次的機械脈動;不拉平的話顆粒之間音高不同,交叉淡化會互相抵消、變粗糙)
  kid: { f: 'folk/hum_kid_sheet.mp3', sr: 22050, n: [[335.7, 0.02, 0.78571, 1.64406, 1.70408], [391.78, 1.76408, 1.97506, 2.93481, 2.99483], [440.11, 3.05483, 3.60105, 4.73066, 4.79067], [489.91, 4.85067, 5.25321, 6.3062, 6.36621], [521.91, 6.42621, 6.95646, 8.07716, 8.13717], [587.93, 8.19717, 8.93494, 9.79726, 9.85729], [637.61, 9.91729, 10.3757, 11.4855, 11.54554]], br: [[11.60554, 12.09554]] },
};
// ---------- 錄音片段(scratchpad/vocals/scripts/prep_clips.py 產生) ----------
// ls/le:迴圈點(檔案前後各留 0.5 秒邊界,解碼器的前置延遲不會落在接縫上);parts:片段在檔案裡的位置
export const CLIPS = {
  chant_a: { f: 'folk/chant_longshan_a_loop.mp3', sr: 16000, dur: 23.8, ls: 0.5, le: 23.3 }, // 吳燦政,龍山寺 2013-05-25(CC BY 3.0)
  chant_b: { f: 'folk/chant_longshan_b_loop.mp3', sr: 16000, dur: 21.4, ls: 0.5, le: 20.9 }, // 吳燦政,龍山寺 2012-11-03(CC BY 3.0)
  chant_c: { f: 'folk/chant_muyu_loop.mp3', sr: 16000, dur: 21.952, ls: 0.5, le: 21.452 }, // xserra〈buddhist-2.wav〉(CC BY 4.0):比丘尼 + 木魚(濾掉 1845 Hz 的電器嘯音)
  bg_1: { f: 'folk/beiguan_far_1.mp3', sr: 16000, dur: 21.4 }, // 〈什牌・倒旗〉彰化縣文化局(CC BY 3.0 TW)
  bg_2: { f: 'folk/beiguan_far_2.mp3', sr: 16000, dur: 17.18 },
  bg_3: { f: 'folk/beiguan_far_3.mp3', sr: 16000, dur: 22.92 },
  fy: { f: 'folk/radio_fengyuan_sung.mp3', sr: 16000, dur: 24.55, parts: [[0, 14.66], [15.46, 24.55]] }, // 林茂賢示範〈豐原調〉(臺中市政府文化局,CC0)
  thh: { f: 'folk/tape_thinn_oo_oo.mp3', sr: 16000, dur: 40.25 }, // Tè Khái-sū〈Thinn-oo-oo.mp3〉(CC BY-SA 4.0;改過的檔案同樣以 CC BY-SA 4.0 釋出)
};

// ---------- 載入(暖機之後) ----------
export const VX = { loads: 0, fails: 0, bytes: 0, ms: 0, warmAt: -1 };
const VS = new Map(); // key → { st: 'wait'|'load'|'ok'|'fail', b, p, used }
let warmP = null;
const tnow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const cnow = () => tnow() / 1000; // 秒(不用 A.ctx.currentTime:烘焙時 A.ctx 暫時是 OfflineAudioContext)
function warm() { // 等 hz:warm(shader 預編譯、世界建置都做完);45 秒保底
  if (warmP) return warmP;
  const t0 = tnow();
  warmP = new Promise((res) => {
    const chk = () => {
      let ok = A.voxNow;
      try { ok = ok || performance.getEntriesByName('hz:warm').length > 0; } catch { ok = true; }
      if (ok || tnow() - t0 > 45000) { VX.warmAt = +(tnow() / 1000).toFixed(1); res(); } else setTimeout(chk, 500);
    };
    chk();
  });
  return warmP;
}
export function voxLoad(key) {
  let e = VS.get(key);
  if (e) { e.used = cnow(); return e.p; }
  const S = SETS[key] || CLIPS[key];
  if (!S || !A.ctx) return Promise.resolve(null);
  e = { st: 'wait', b: null, used: cnow(), p: null };
  VS.set(key, e);
  e.p = warm().then(() => {
    if (VS.get(key) !== e) return null;
    e.st = 'load';
    const t0 = tnow();
    return fetchBuf(S.f, S.sr, true).then((b) => {
      VX.ms += tnow() - t0;
      if (VS.get(key) !== e) return null;
      if (!b) { e.st = 'fail'; VX.fails++; return null; }
      e.b = b; e.st = 'ok'; VX.loads++; VX.bytes += b.length * 4;
      return b;
    });
  });
  return e.p;
}
export function voxBuf(key) { const e = VS.get(key); if (!e) return null; e.used = cnow(); return e.b; }
export const voxFailed = (key) => VS.get(key)?.st === 'fail';
export const voxKnown = (key) => !!(SETS[key] || CLIPS[key]);
// 150 秒沒用的釋放(folk.js 每 10 秒叫一次);烘焙結果與 folk 快取裡的片段各自有自己的參照
export function voxGC() {
  const n = cnow();
  for (const [k, e] of VS) if (e.st === 'ok' && n - e.used > 150) { VS.delete(k); VX.bytes -= e.b.length * 4; }
}
// 烘焙完就用不到的來源(收音機的唱片、錄音帶、哼唱的取樣表):沒有別的配方在等它就馬上釋放(要再烘焙時從 HTTP 快取重新解碼)
export function voxRelease(key) { const e = VS.get(key); if (e && e.st === 'ok') { VS.delete(key); VX.bytes -= e.b.length * 4; VX.rel = (VX.rel || 0) + 1; } }
export const voxState = () => ({ ...VX, mb: +(VX.bytes / 1048576).toFixed(2), sets: [...VS].map(([k, e]) => `${k}:${e.st}`) });

// ---------- 取樣哼唱樂器 ----------
const ct = (c) => Math.pow(2, c / 1200);
const osc = (type, f) => { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
// 角色:g 音量、att 起音、rel 收尾、xf 連音交叉淡化、port 滑音時間、scoop 起音從下面滑上來(音分)、
//   vib/vr/vj/vdel 顫音深度(音分)/速度/速度飄移/延遲出現、drift 慢漂移(音分)、det 每個音的音準誤差、
//   trem 音量顫抖、fall 句尾往下掉(音分)、breath 吸氣音量(1 = 錄音裡的自然比例)、brRate 吸氣播放速度、
//   air 氣聲(粉紅噪音)、lp 音色低通、rub 節奏的自由度(秒)、arc 樂句中段的音量隆起
export const VOICE = {
  ama: { set: 'ama', g: 1, att: 0.11, rel: 0.42, xf: 0.1, port: 0.12, scoop: -35, vib: 34, vr: 4.6, vj: 0.22, vdel: 0.28, drift: 12, det: 10, trem: 0.16, fall: -55, breath: 1.7, brRate: 0.92, air: 0.018, lp: 2900, rub: 0.045, arc: 0.18 },
  kid: { set: 'kid', g: 1, att: 0.045, rel: 0.2, xf: 0.06, port: 0.05, scoop: -20, vib: 16, vr: 5.6, vj: 0.12, vdel: 0.32, drift: 6, det: 8, trem: 0.05, fall: -25, breath: 0.6, brRate: 1.22, air: 0.003, lp: 7000, rub: 0.02, arc: 0.12 },
};
function pickNote(S, f, last) {
  let best = -1, bd = 1e9;
  S.n.forEach((n, i) => { const d = Math.abs(Math.log2(f / n[0])) * 12 + (i === last ? 0.3 : 0); if (d < bd) { bd = d; best = i; } });
  return best;
}
// d 輸出、t0 開始時間(第一個音之前留 0.6 秒給吸氣)、N = folk.seq() 的旋律、V 角色、o.fade 越唱越小聲(0..1)
// 回傳 false = 取樣還沒載好(呼叫端用合成版)
export function iVox(d, t0, N, V, o = {}) {
  const S = SETS[V.set], b = voxBuf(V.set);
  if (!S || !b) return false;
  const ctx = A.ctx, end = t0 + N.len + 2.5, notes = N.notes, L = notes.length;
  const out = gain(V.g ?? 1, V.lp ? filter('lowpass', V.lp, 0.6, d) : d);
  const amp = gain(1 - (V.trem || 0) / 2, out);
  // 音量顫抖(老人):跟顫音差不多快,但自己飄
  if (V.trem) { const to = osc('sine', V.vr * 0.93), tg = gain((V.trem || 0) / 2); to.connect(tg); tg.connect(amp.gain); for (let t = t0; t < end; t += rand(0.3, 0.7)) to.frequency.setTargetAtTime(V.vr * rand(0.8, 1.15), t, 0.2); to.start(t0); to.stop(end); }
  // 顫音:正弦的速度自己慢慢飄(不規則)→ 深度包絡 vg(每個音延遲出現)
  const vo = osc('sine', V.vr), vg = gain(0); vo.connect(vg);
  for (let t = t0; t < end; t += rand(0.25, 0.55)) vo.frequency.setTargetAtTime(V.vr * (1 + rand(-V.vj, V.vj)), t, 0.12);
  vo.start(t0); vo.stop(end);
  // 慢的音高漂移
  const dro = osc('sine', rand(0.15, 0.3)), dg = gain(V.drift || 0); dro.connect(dg); dro.start(t0); dro.stop(end);
  const dro2 = osc('sine', rand(0.5, 0.8)), dg2 = gain((V.drift || 0) * 0.4); dro2.connect(dg2); dro2.start(t0); dro2.stop(end);
  // 樂句(休止符分開)
  const phr = [];
  notes.forEach((n, i) => { const pv = notes[i - 1]; if (!pv || n.t - (pv.t + pv.d) > 0.01) phr.push([i]); else phr[phr.length - 1].push(i); });
  let last = -1, prev = null;
  const vEnv = vg.gain;
  vEnv.setValueAtTime(0, t0);
  for (const P of phr) {
    const a = notes[P[0]], z = notes[P[P.length - 1]], ts = t0 + a.t, te = t0 + z.t + z.d, plen = te - ts;
    // 吸氣(鼻子):句首前結束
    if (V.breath && S.br.length) {
      const br = S.br[(Math.random() * S.br.length) | 0], rate = V.brRate * rand(0.95, 1.05), bl = (br[1] - br[0]) / rate, st = Math.max(t0 - 0.55, ts - bl - rand(0.04, 0.12));
      const bs = ctx.createBufferSource(); bs.buffer = b; bs.playbackRate.value = rate;
      const bg = gain(V.breath * (P[0] === 0 ? 1 : rand(0.6, 0.9)), out); bs.connect(bg);
      bs.start(st, br[0], bl); bs.stop(st + bl + 0.02);
    }
    // 氣聲(整句的粉紅噪音,跟著樂句的音量)
    if (V.air) burst(amp, ts, { buf: 'pink', type: 'bandpass', f: V.set === 'kid' ? 2600 : 1500, q: 0.6, a: Math.min(0.2, plen * 0.3), hold: Math.max(0, plen - 0.35), dur: 0.35, g: V.air });
    // 樂句的音量弧線:中段稍微隆起、句尾放鬆
    const pg = gain(0, amp);
    const arc = V.arc || 0, fadeK = o.fade ? 1 - (o.fade * P[0]) / L : 1;
    pg.gain.setValueAtTime(fadeK * (1 - arc * 0.5), ts - 0.05);
    pg.gain.linearRampToValueAtTime(fadeK * (1 + arc * 0.5), ts + plen * 0.55);
    pg.gain.linearRampToValueAtTime(fadeK * (1 - arc), te);
    prev = null;
    for (const i of P) {
      const n = notes[i], legIn = !!prev, legOut = P.includes(i + 1);
      const t = t0 + n.t + (i ? rand(-V.rub, V.rub) : 0);
      const f = n.f * ct(rand(-V.det, V.det));
      let k = pickNote(S, f, last);
      // 同音高有兩個 take:跟上一個不一樣的那個
      if (k === last) { const alt = S.n.findIndex((m, j) => j !== k && Math.abs(Math.log2(m[0] / S.n[k][0])) * 12 < 0.3); if (alt >= 0) k = alt; }
      last = k;
      const sm = S.n[k], rate = f / sm[0];
      const src = ctx.createBufferSource();
      src.buffer = b; src.loop = true; src.loopStart = sm[2]; src.loopEnd = sm[3]; src.playbackRate.value = rate;
      vg.connect(src.detune); dg.connect(src.detune); dg2.connect(src.detune);
      const g = gain(0, pg); src.connect(g);
      const same = legIn && Math.abs(1200 * Math.log2(prev.f / f)) < 40;
      let ton, lv = 1;
      if (legIn && !same) { // 連音:新音從迴圈裡進來(不重起音),交叉淡化 + 滑音
        const x0 = t - V.xf * 0.5, x1 = t + V.xf * 0.5;
        ton = x0;
        src.start(x0, sm[2] + rand(0, (sm[3] - sm[2]) * 0.5));
        g.gain.setValueAtTime(0, x0); g.gain.linearRampToValueAtTime(1, x1);
        const c = clamp(1200 * Math.log2(prev.f / f), -600, 600);
        src.detune.setValueAtTime(c, x0); src.detune.setTargetAtTime(0, x0, V.port / 3);
        prev.g.gain.setValueAtTime(prev.lv, x0); prev.g.gain.linearRampToValueAtTime(0, x1);
        prev.src.detune.setTargetAtTime(-c * 0.7, x0, V.port / 3);
        prev.src.stop(x1 + 0.03);
      } else if (same) { // 同音重唱:前一個收一點、新的從起音進來(「嗯—嗯」)
        const x0 = t - 0.06;
        ton = t - 0.01;
        prev.g.gain.setValueAtTime(prev.lv, x0); prev.g.gain.linearRampToValueAtTime(0, t + 0.02);
        prev.src.stop(t + 0.05);
        src.start(ton, sm[1] + Math.min(0.04, (sm[2] - sm[1]) * 0.3));
        lv = 0.92;
        g.gain.setValueAtTime(0, ton); g.gain.linearRampToValueAtTime(lv, ton + V.att * 0.7);
      } else { // 句首:取樣自己的起音,從下面一點點滑上來
        ton = t;
        src.start(t, sm[1]);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + V.att);
        if (V.scoop) { src.detune.setValueAtTime(V.scoop * rand(0.6, 1.2), t); src.detune.setTargetAtTime(0, t, 0.05); }
      }
      // 顫音:每個音一開始淺,延遲之後才出來
      const vd = Math.min(V.vdel, n.d * 0.45);
      vEnv.setTargetAtTime(V.vib * 0.2, ton, 0.04);
      vEnv.setTargetAtTime(V.vib * rand(0.75, 1.25), ton + vd, 0.18);
      if (!legOut) { // 句尾:放掉 + 音高往下掉
        const tEnd = t0 + n.t + n.d, rel = Math.min(V.rel, n.d * 0.6), r0 = Math.max(ton + V.att + 0.02, tEnd - rel);
        g.gain.setValueAtTime(lv, r0); g.gain.linearRampToValueAtTime(0, r0 + rel);
        if (V.fall) src.detune.setTargetAtTime(V.fall * rand(0.7, 1.2), r0, rel / 2);
        src.stop(r0 + rel + 0.05);
        prev = null;
      } else prev = { src, g, f, lv };
    }
  }
  return true;
}

// ---------- 錄音片段的播放鏈(在 folk.js 的烘焙裡用) ----------
// 收音機裡的老唱片:AM 的窄頻(380~2700 Hz)+ 喇叭的飽和 + 鼻音的中頻 + 唱盤轉速不穩 + 炒豆聲與底噪
export function iRecord(d, t0, b, off = 0, len = b.duration - off) {
  const end = t0 + len + 1;
  const ws = filter('highpass', 380, 0.8, filter('lowpass', 2700, 0.8, d));
  const sh = A.ctx.createWaveShaper(); const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); } sh.curve = c; sh.connect(ws);
  const nas = filter('peaking', 1400, 1.2, sh); nas.gain.value = 5;
  const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(gain(1.3, nas));
  const w = osc('sine', rand(0.5, 0.7)), wg = gain(rand(6, 10)); w.connect(wg); wg.connect(s.detune); w.start(t0); w.stop(end);
  s.start(t0, off, len); s.stop(t0 + len + 0.02);
  for (let k = 0, m = Math.round(len * 6); k < m; k++) burst(ws, t0 + rand(0, len), { type: 'highpass', f: 1800, dur: 0.004, g: rand(0.004, 0.03) });
  burst(ws, t0, { type: 'bandpass', f: 1700, q: 0.5, a: 0.3, hold: len, dur: 0.4, g: 0.01 });
}
// 錄音帶:頻寬(150~3800 Hz)、磁頭飽和、抖音(wow/flutter)、偶爾的掉音、嘶聲;前後有按鍵的「喀」
export function iTape(d, t0, b, off = 0, len = b.duration - off) {
  const end = t0 + len + 1.2, ts = t0 + 0.35;
  const drop = gain(1, d), bus = gain(0.9, filter('highpass', 150, 0.7, filter('lowpass', 3800, 0.7, drop)));
  const sh = A.ctx.createWaveShaper(); const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); } sh.curve = c; sh.connect(bus);
  const s = A.ctx.createBufferSource(); s.buffer = b; s.connect(gain(1.1, sh));
  const w1 = osc('sine', rand(0.45, 0.7)), g1 = gain(14); w1.connect(g1); g1.connect(s.detune);
  const w2 = osc('sine', rand(5.5, 7.5)), g2 = gain(4); w2.connect(g2); g2.connect(s.detune);
  w1.start(t0); w2.start(t0); w1.stop(end); w2.stop(end);
  s.start(ts, off, len); s.stop(ts + len + 0.02);
  burst(d, t0, { type: 'bandpass', f: 2400, q: 2, dur: 0.02, g: 0.05 }); burst(d, t0 + 0.004, { type: 'lowpass', f: 400, dur: 0.03, g: 0.05 }); // 按下播放
  burst(drop, ts - 0.2, { type: 'highpass', f: 3800, a: 0.2, hold: len + 0.2, dur: 0.3, g: 0.006 }); // 嘶聲
  const dt = []; for (let k = 0, m = 2 + ((Math.random() * 3) | 0); k < m; k++) dt.push(ts + rand(2, len - 1));
  dt.sort((x, y) => x - y);
  let last = ts;
  for (const tt of dt) { // 掉音
    if (tt < last + 0.5) continue;
    const ww = rand(0.06, 0.22), v = rand(0.12, 0.4);
    drop.gain.setValueAtTime(1, tt); drop.gain.linearRampToValueAtTime(v, tt + 0.025); drop.gain.setValueAtTime(v, tt + 0.025 + ww); drop.gain.linearRampToValueAtTime(1, tt + 0.07 + ww); last = tt + 0.1 + ww;
  }
  burst(d, ts + len + 0.25, { type: 'bandpass', f: 2000, q: 2, dur: 0.02, g: 0.05 }); // 帶子走完(自動跳起)
}
