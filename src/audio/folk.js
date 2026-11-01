// 台灣民間的聲音:公有領域的旋律 + 真人錄音(人聲、誦經、北管)+ 程式合成的演奏 + 依情境出現的「現場」聲音(增加恐懼感,但不嘲弄)。
//
// 旋律(全部公有領域,依據寫在 public/credits/audio.md):
//   鄧雨賢(1906–1944,逝世已逾 50 年)作曲:《望春風》(1933)《雨夜花》(1934)—— 只用旋律:作詞的李臨秋、周添旺著作權仍在,
//     一律只哼、只用樂器演奏,不唱詞;任何程式、字幕、署名、文件裡都不寫任何歌詞(只寫曲名)
//   作者不詳的傳統民謠:《天黑黑》《火金姑》《思想起》《丟丟銅仔》《桃花過渡》《六月茉莉》《一隻鳥仔哮啾啾》〈豐原調〉(歌仔曲調)
//   原創(本專案):北管風的嗩吶短句、牽亡歌風的哀歌、追逐/停電/恐懼/頭七/補給站的配樂床
//   (簡譜依記憶整理成五聲音階的單旋律,節奏簡化)
// 真人錄音(vox.js;CC0 / CC BY / CC BY-SA,署名與剪輯紀錄見 public/credits/audio.md;暖機完成後才下載,失敗時退回合成版):
//   阿嬤哼《望春風》、孩子哼《天黑黑》《火金姑》= 真人哼聲/童聲的取樣樂器(錄音的單音 + 迴圈,照簡譜演奏,不是合成的共振峰)
//   誦經 = 龍山寺的長輩誦經(兩段)+ 比丘尼誦經與木魚(xserra;三段都是循環,只在原地完整播,不變調、不剪成配樂片段)、
//   戶外的北管 =〈什牌・倒旗〉的三個自然起落的樂句、
//   收音機的老唱片 = 林茂賢示範演唱〈豐原調〉(只留唱的部分,過 AM 窄頻)、育嬰區的錄音帶 = 大人唱的〈天黑黑〉(過卡帶)
// 仍然合成的:音樂盒、卡帶電子琴《雨夜花》(沒有可用的器樂錄音)、收音機裡的大廣弦 + 月琴(和老唱片輪播)、嗩吶、西索米、引魂鈴、哀歌、
//   配樂床、配樂裡的誦經片段;
//   在閒置時間用 OfflineAudioContext 烘焙成 12~22.05kHz 單聲道緩衝(自己的快取,一次只烘焙一個,150 秒沒用就釋放)。
//   執行期每個聲音只是一個 BufferSource + 一條定位聲道。
//
// 情境(本機,每位玩家各自;都先問驚嚇導演 request('ambient'),真的放了才 notify,共用它的冷卻與恐懼值):
//   病房/小兒科/育嬰室 → 空病房裡孩子哼《天黑黑》《火金姑》:在 8~12 公尺外(常隔著牆),走近 5 公尺內就淡掉,找不到人
//   小兒科/育嬰室/遊戲室 → 隔壁有台錄音機在放大人唱的《天黑黑》(封院那年家屬錄給孩子的帶子),很小聲,走近就停
//   護理站的錄音機 → 自己播起《雨夜花》(卡帶抖音、掉音、嘶聲);按下錄音機就停,走遠也停
//   太平間/納骨堂/禮拜堂 → 遠處的誦經(助念),離開、開打或追逐時淡出
//   戶外(下雨的院區)→ 很遠的北管鑼鼓與嗩吶、出殯的西索米樂隊、引魂鈴(間隔很長,一局只會聽到少數幾次)
//   導演事件:lullaby → 音樂盒《望春風》(走近就發條鬆掉、停下);nurse(阿嬤)→ 老婦人哼《望春風》= 她就在附近;
//            child → 孩子的哼唱;touqi(頭七)→ 牽亡歌風的哀歌 + 引魂鈴(配樂同時進 touqi 狀態);停電類 → 配樂進 blackout 狀態
//   宗教與喪葬的聲音:稀少、低調、完整演出,不拿來當跳嚇,不變調取笑。
import { A, onTick, emit, gain, filter, tone, burst, metal, rand, pick, clamp, bake, shaper, distTo, around } from './core.js';
import { iVox, iRecord, iTape, VOICE, CLIPS, voxLoad, voxBuf, voxFailed, voxGC, voxRelease, voxState } from './vox.js';

const SR = 22050; // 預設烘焙取樣率;頻寬窄的(收音機、哼唱、誦經)用更低的取樣率省記憶體(配方的 sr)

// ---------- 旋律(簡譜) ----------
// 記號:1~7 音級、0 休止;' 高八度、, 低八度;- 延長一拍、_ 減半、. 附點;| 只是小節線
const DEG = [0, 0, 2, 4, 5, 7, 9, 11];
function parse(s) {
  const n = [];
  for (const tk of s.trim().split(/\s+/)) {
    const m = /^([0-7])([',]*)([-_.]*)$/.exec(tk);
    if (!m) continue;
    let st = m[1] === '0' ? null : DEG[+m[1]];
    if (st !== null) for (const c of m[2]) st += c === "'" ? 12 : -12;
    let b = 1;
    for (const c of m[3]) b = c === '_' ? b / 2 : c === '.' ? b * 1.5 : b + 1;
    n.push([st, b]);
  }
  return n;
}
export const MEL = {
  wcf: { name: '望春風', pd: '鄧雨賢 1933(旋律)', bpm: 66, key: 76, s: "1. 1_ 6, 1 | 2 3 5 3 | 2. 2_ 1 2 | 3--- | 5. 5_ 3 5 | 6 1' 6 5 | 3. 5_ 3 2 | 1---" },
  uyh: { name: '雨夜花', pd: '鄧雨賢 1934(旋律)', bpm: 74, key: 67, s: "3. 3_ 5 6 | 1' 6 5- | 6 1' 6 5 | 3 2-- | 3. 5_ 3 2 | 1 2 3- | 2 1 6, 1 | 6,---" },
  thh: { name: '天黑黑', pd: '傳統童謠', bpm: 92, key: 74, s: '5 5 3- | 5 5 3- | 6 6 5 3 | 2 3 5- | 3 3 2 1 | 2 3 2- | 1 2 3 5 | 2---' },
  hkk: { name: '火金姑', pd: '傳統童謠', bpm: 84, key: 74, s: "5 3 5- | 6 5 3- | 5 5 6 1' | 6 5 3- | 2 3 5 3 | 2 1 2- | 3 2 1 6, | 1---" },
  ssk: { name: '思想起', pd: '恆春傳統民謠', bpm: 58, key: 69, s: "6-- 5_ 6_ | 1'- 6 5 | 3-- 5_ 3_ | 2--- | 1 2 3 5 | 3 2 1 6, | 1---" },
  dtt: { name: '丟丟銅仔', pd: '宜蘭傳統民謠', bpm: 108, key: 67, s: '5 6 5 3 | 2 3 5- | 6 5 3 2 | 1 2 3- | 5 5 6 5 | 3 2 1 2 | 3 5 2 3 | 1---' },
  thgd: { name: '桃花過渡', pd: '傳統民謠(車鼓)', bpm: 116, key: 69, s: "1 1 2 3 | 5 3 5- | 6 5 3 5 | 2--- | 3 5 6 1' | 6 5 3 2 | 1 2 3 5 | 1---" },
  lyml: { name: '六月茉莉', pd: '傳統民謠', bpm: 70, key: 67, s: "3 5 6 1' | 6 5 3- | 5 3 2 3 | 1--- | 2 3 5 3 | 2 1 6,- | 1 2 3 2 | 1---" },
  jcn: { name: '一隻鳥仔哮啾啾', pd: '傳統民謠', bpm: 60, key: 62, s: '6, 1 2 3 | 2 1 6,- | 5, 6, 1 2 | 3--- | 5 3 2 1 | 2 3 1 6, | 5, 6, 1 2 | 6,---' },
  bg: { name: '北管風短句', pd: '原創', bpm: 120, key: 74, s: "5 6 1' 6 | 5 3 5- | 3 5 3 2 | 1---" },
  wail: { name: '追逐的嗩吶', pd: '原創', bpm: 144, key: 74, s: "1'- 6_ 5_ 3-" },
  lament: { sr: 16000, name: '哀歌(牽亡歌風)', pd: '原創', bpm: 54, key: 69, s: '6-- 5 | 3- 2 1 | 2-- 3 | 6,--- | 1 2 3- | 5 3 2 1 | 2 1 6,- | 6,---' },
  jingle: { sr: 12000, name: 'AM 1207 台呼', pd: '原創', bpm: 132, key: 72, s: "5 1' 3' 2'- 1'--" },
};
for (const k in MEL) MEL[k].n = parse(MEL[k].s);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ct = (c) => Math.pow(2, c / 1200);
// 旋律 → [{ t, d, f, st, b }](秒);o.bars 只取前幾小節
export function seq(id, o = {}) {
  const M = MEL[id], sp = 60 / (o.bpm ?? M.bpm), key = o.key ?? M.key, lim = o.bars ? o.bars * 4 : 1e9;
  const notes = [];
  let t = 0, beats = 0;
  for (const [st, b] of M.n) {
    if (beats >= lim) break;
    if (st !== null) notes.push({ t, d: b * sp, f: hz(key + st), st, b });
    t += b * sp; beats += b;
  }
  return { notes, len: t, sp, key };
}
// 每小節的和弦(依小節第一個音):1/3/5 → I、6 → vi(小)、2 → V、4 → IV
function chords(N, cb) {
  const bar = 4 * N.sp, nb = Math.ceil(N.len / bar - 0.01);
  for (let i = 0; i < nb; i++) {
    const n = N.notes.find((x) => x.t >= i * bar - 0.01) || N.notes[N.notes.length - 1];
    const s = ((n.st % 12) + 12) % 12;
    const [root, minor] = s === 9 ? [-3, true] : s === 2 ? [7, false] : s === 5 ? [5, false] : [0, false];
    for (let b = 0; b < 4; b++) cb(i * bar + b * N.sp, root, minor, b);
  }
}

// ---------- 烘焙時用的小工具(A.ctx 此時是 OfflineAudioContext) ----------
const osc = (type, f) => { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
function lfo(t0, t1, f, depth, ...params) { const o = osc('sine', f), g = gain(depth); o.connect(g); for (const p of params) g.connect(p); o.start(t0); o.stop(t1); return g; }
// 持續音的包絡:頭尾用等功率淡入淡出(配樂床接成循環時頭尾互補,音量不跳)
function sus(p, t0, len, T, v) {
  const n = 32, up = new Float32Array(n), dn = new Float32Array(n);
  for (let i = 0; i < n; i++) { const u = i / (n - 1); up[i] = v * Math.sin((u * Math.PI) / 2); dn[i] = v * Math.cos((u * Math.PI) / 2); }
  p.setValueCurveAtTime(up, t0, T); // 曲線起點就是 0(不能和同一時間點的 setValue 重疊) p.setValueCurveAtTime(dn, t0 + len, T);
}

// ---------- 樂器 ----------
function iBox(d, t0, N, o = {}) { // 音樂盒:簧片 + 泛音 + 滾筒的小喀聲;wind = 發條越來越鬆(越來越慢),det = 走音
  const L = N.notes.length, wind = o.wind ?? 0.5, det = o.det ?? 10, sag = o.sag ?? 0.02;
  let t = t0, pt = 0, i = 0;
  for (const n of N.notes) {
    const u = i++ / L;
    t += (n.t - pt) * (1 + wind * u * u); pt = n.t;
    const f = n.f * (1 - sag * u * u) * ct(rand(-det, det)), g = 0.07 * (1 - 0.35 * u);
    tone(d, t, { f, dur: 1.5, a: 0.002, g });
    tone(d, t, { f: f * 4.07, dur: 0.28, a: 0.001, g: g * 0.28 });
    if (f * 6.8 < A.ctx.sampleRate * 0.45) tone(d, t, { f: f * 6.8, dur: 0.08, a: 0.001, g: g * 0.11 });
    burst(d, t, { type: 'highpass', f: 4500, dur: 0.006, g: 0.02 });
    if (n.b >= 2 || i % 4 === 1) tone(d, t + 0.003, { f: f / 2, dur: 1.2, a: 0.002, g: g * 0.4 });
  }
}
function iCassette(d, t0, N, o = {}) { // 卡帶裡的電子琴伴奏帶:抖音(wow/flutter)、掉音、嘶聲、磁頭飽和
  const end = t0 + N.len + 2;
  const drop = gain(1, d), bus = gain(0.9, shaper(1.8, filter('highpass', 150, 0.7, filter('lowpass', o.lp ?? 3800, 0.7, drop))));
  const W = gain(1);
  { const a = osc('sine', rand(0.45, 0.7)), ga = gain(o.wow ?? 16, W); a.connect(ga); a.start(t0); a.stop(end); const b = osc('sine', rand(5.5, 7.5)), gb = gain(4, W); b.connect(gb); b.start(t0); b.stop(end); }
  const T = (t, op) => { const r = tone(bus, t, op); W.connect(r.osc.detune); return r; };
  for (const n of N.notes) {
    const hold = Math.max(0.05, n.d * 0.85 - 0.06), t = t0 + n.t;
    T(t, { f: n.f, a: 0.03, hold, dur: 0.18, g: 0.07 });
    T(t, { f: n.f * 2, a: 0.03, hold, dur: 0.15, g: 0.022 });
    T(t, { type: 'triangle', f: n.f * 3, a: 0.02, hold: hold * 0.6, dur: 0.12, g: 0.01 });
  }
  chords(N, (tt, root, minor, b) => { // 低音在 1、3 拍,和弦在 2、4 拍(老伴奏帶的「蹦恰」)
    const t = t0 + tt;
    if (b % 2 === 0) T(t, { type: 'triangle', f: hz(N.key - 24 + root + (b === 2 ? 7 : 0)), a: 0.01, hold: N.sp * 0.5, dur: 0.2, g: 0.06 });
    else for (const iv of [0, minor ? 3 : 4, 7]) T(t, { type: 'triangle', f: hz(N.key - 12 + root + iv), a: 0.01, hold: N.sp * 0.3, dur: 0.12, g: 0.012 });
  });
  burst(drop, t0, { type: 'highpass', f: 3800, a: 0.3, hold: N.len + 0.8, dur: 0.4, g: 0.006 });
  const ts = []; for (let k = 0, m = 2 + ((Math.random() * 3) | 0); k < m; k++) ts.push(t0 + rand(1.5, N.len - 1));
  ts.sort((a, b) => a - b);
  let last = t0;
  for (const tt of ts) { if (tt < last + 0.5) continue; const w = rand(0.06, 0.25), v = rand(0.08, 0.35); drop.gain.setValueAtTime(1, tt); drop.gain.linearRampToValueAtTime(v, tt + 0.025); drop.gain.setValueAtTime(v, tt + 0.025 + w); drop.gain.linearRampToValueAtTime(1, tt + 0.07 + w); last = tt + 0.1 + w; }
}
function trem(d, t, f, dur, rate, g, type = 'triangle', decay = 18) {
  const o = osc(type, f), e = gain(0, d), n = Math.max(8, Math.ceil(dur * 200)), c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const u = (i / n) * dur, ph = (u * rate) % 1; c[i] = g * Math.exp((-ph * decay) / rate) * (1 - (0.5 * u) / dur); }
  o.connect(e); e.gain.setValueCurveAtTime(c, t, dur); o.start(t); o.stop(t + dur + 0.05);
}
function pluck(d, t, f, g) { tone(d, t, { type: 'triangle', f, dur: 0.4, a: 0.002, g }); tone(d, t, { f: f * 2, dur: 0.14, a: 0.001, g: g * 0.5 }); burst(d, t, { type: 'bandpass', f: 2600, q: 1.5, dur: 0.01, g: g * 0.4 }); }
function iRadio(d, t0, N) { // AM 收音機裡的老唱片:大廣弦(拉弦,鼻音重)+ 月琴(撥弦、長音滾奏),頻寬只有 380~2700Hz
  const end = t0 + N.len + 1.5;
  const hp = filter('highpass', 380, 0.8, filter('lowpass', 2700, 0.8, shaper(2.2, d)));
  const s = osc('sawtooth', N.notes[0].f), env = gain(0);
  const nas = filter('peaking', 1400, 1.2); nas.gain.value = 7;
  s.connect(nas); nas.connect(filter('lowpass', 2400, 0.7, env)); env.connect(gain(0.5, hp));
  lfo(t0, end, 5.6, 22, s.detune);
  env.gain.setValueAtTime(0, t0);
  N.notes.forEach((n, i) => {
    const t = t0 + n.t, nx = N.notes[i + 1];
    s.frequency.setValueAtTime(n.f * 0.955, t); s.frequency.exponentialRampToValueAtTime(n.f, t + 0.07); // 從下面滑上來
    env.gain.setTargetAtTime(0.32, t, 0.02); env.gain.setTargetAtTime(0.22, t + 0.1, 0.12);
    if (!nx || nx.t - (n.t + n.d) > 0.01) env.gain.setTargetAtTime(0, t + n.d - 0.06, 0.03);
    pluck(hp, t, n.f / 2, 0.05);
    if (n.b >= 2) trem(hp, t + 0.1, n.f / 2, n.d - 0.15, 10, 0.022); // 月琴長音的滾奏
  });
  chords(N, (tt, root, minor, b) => { if (b === 0 || b === 2) pluck(hp, t0 + tt, hz(N.key - 24 + root + (b === 2 ? 7 : 0)), 0.04); });
  s.start(t0); s.stop(end);
}
function iHum(d, t0, N, o = {}) { // 閉口哼唱(「嗯——」):鋸齒波聲門源 → 鼻音共振峰;孩子音高高、穩;阿嬤低、抖、氣多
  const end = t0 + N.len + 1, det = o.det ?? 10, G = o.g ?? 0.5;
  const s = osc('sawtooth', N.notes[0].f), env = gain(0, d), lp = filter('lowpass', o.lp ?? 950, 0.6);
  s.connect(lp);
  lp.connect(filter('bandpass', o.f1 ?? 290, 3, gain(1.5, env)));
  lp.connect(filter('bandpass', o.f2 ?? 1050, 5, gain(0.25, env)));
  lp.connect(filter('bandpass', 2500, 8, gain(0.05, env)));
  lfo(t0, end, o.vr ?? 5.2, o.vib ?? 18, s.detune);
  lfo(t0, end, 0.31, o.shaky ?? 8, s.detune);
  burst(env, t0, { buf: 'pink', type: 'bandpass', f: 1300, q: 0.8, a: 0.2, hold: N.len, dur: 0.5, g: o.breath ?? 0.05 });
  env.gain.setValueAtTime(0, t0);
  const L = N.notes.length;
  N.notes.forEach((n, i) => {
    const t = t0 + n.t, nx = N.notes[i + 1], fade = o.fade ? 1 - (o.fade * i) / L : 1;
    s.frequency.setTargetAtTime(n.f * ct(rand(-det, det)), t, o.port ?? 0.035);
    env.gain.setTargetAtTime(G * fade, t, 0.05); env.gain.setTargetAtTime(G * 0.7 * fade, t + Math.min(n.d * 0.5, 0.4), 0.2);
    if (!nx || nx.t - (n.t + n.d) > 0.01) env.gain.setTargetAtTime(0, t + n.d - 0.08, 0.06);
  });
  s.start(t0); s.stop(end);
}
function iSuona(d, t0, N, o = {}) { // 嗩吶:雙簧的亮、鼻、帶沙;滑音進音、上倚音、寬顫音
  const end = t0 + N.len + 1;
  const a = osc('sawtooth', N.notes[0].f), b = osc('square', N.notes[0].f);
  b.detune.value = 7;
  const env = gain(0, d);
  const ws = shaper(2.6, filter('lowpass', o.lp ?? 5000, 0.7, env));
  const p2 = filter('peaking', 2900, 2, ws); p2.gain.value = 7;
  const p1 = filter('peaking', 1150, 1.4, p2); p1.gain.value = 11;
  const hp = filter('highpass', 450, 0.7, p1);
  a.connect(gain(0.5, hp)); b.connect(gain(0.3, hp));
  const vg = lfo(t0, end, 6.2, o.vib ?? 26, a.detune); vg.connect(b.detune);
  env.gain.setValueAtTime(0, t0);
  N.notes.forEach((n, i) => {
    const t = t0 + n.t, nx = N.notes[i + 1];
    let tt = t;
    if (n.d > 0.25 && Math.random() < 0.35) { for (const x of [a, b]) x.frequency.setValueAtTime(n.f * 1.12, t); tt = t + 0.045; } // 上倚音
    for (const x of [a, b]) { x.frequency.setValueAtTime(n.f * 0.9, tt); x.frequency.exponentialRampToValueAtTime(n.f, tt + 0.07); }
    env.gain.setTargetAtTime(o.g ?? 0.35, t, 0.025);
    if (!nx || nx.t - (n.t + n.d) > 0.01) env.gain.setTargetAtTime(0, t + n.d - 0.05, 0.04);
  });
  a.start(t0); b.start(t0); a.stop(end); b.stop(end);
}
// 打擊:北管的大鑼(低、長、微微下滑)、小鑼(音高往上翹)、鈔、鼓;西索米的小鼓;木魚;磬;引魂鈴(手搖法鈴)
function gongBig(d, t, g = 0.4, f = 92) {
  [1, 1.47, 2.09, 2.56, 3.21, 4.1, 5.3].forEach((r, i) => tone(d, t, { f: f * r * rand(0.995, 1.005), f1: f * r * 0.985, glide: 2.5, dur: 4.5 / (1 + i * 0.35), a: 0.004 + i * 0.002, g: g / (1 + i * 0.7) }));
  burst(d, t, { buf: 'pink', type: 'lowpass', f: 1500, f1: 300, dur: 0.6, g: g * 0.25 });
}
function gongSmall(d, t, g = 0.2) { tone(d, t, { f: 560, f1: 650, glide: 0.25, dur: 1.1, g }); tone(d, t, { f: 885, f1: 1027, glide: 0.25, dur: 0.6, g: g * 0.4 }); burst(d, t, { type: 'bandpass', f: 2500, q: 1, dur: 0.05, g: g * 0.3 }); }
function cymbal(d, t, g = 0.15, dur = 0.5) { burst(d, t, { type: 'highpass', f: 3800, dur, g }); burst(d, t, { type: 'bandpass', f: 6500, q: 1.5, dur: dur * 0.6, g: g * 0.6 }); }
function drum(d, t, g = 0.4, f = 120) { tone(d, t, { f, f1: f * 0.55, glide: 0.15, dur: 0.28, a: 0.002, g }); burst(d, t, { type: 'lowpass', f: 600, dur: 0.07, g: g * 0.4 }); }
function snare(d, t, g = 0.2) { burst(d, t, { type: 'bandpass', f: 2400, q: 0.7, dur: 0.13, g }); tone(d, t, { f: 190, f1: 160, dur: 0.07, g: g * 0.6 }); }
function woodfish(d, t, g = 0.3) { tone(d, t, { f: 540, f1: 500, glide: 0.05, dur: 0.09, a: 0.0008, g }); tone(d, t, { f: 1370, dur: 0.035, a: 0.0005, g: g * 0.35 }); burst(d, t, { type: 'bandpass', f: 1800, q: 2, dur: 0.015, g: g * 0.3 }); }
function bowl(d, t, g = 0.15) { metal(d, t, 690, g, 4.5, [1, 2.71, 5.15, 8.2]); }
function handbell(d, t, g = 0.12, n = 9) { for (let i = 0; i < n; i++) metal(d, t + i * 0.075 + rand(0, 0.012), 2150 * rand(0.997, 1.003), g * (1 - i / (n * 1.4)), 0.9, [1, 1.52, 2.37, 3.3]); }
function bowed(d, t, f, dur, g) { // 拉奏的金屬(弓擦鐵片):非諧波分音慢慢長出來
  [1, 2.41, 3.93, 5.4].forEach((r, i) => { if (f * r < A.ctx.sampleRate * 0.42) tone(d, t + i * 0.2, { f: f * r * rand(0.998, 1.002), a: dur * 0.45, hold: dur * 0.15, dur: dur * 0.5, g: g / (1 + i) }); });
  burst(d, t, { buf: 'pink', type: 'bandpass', f: f * 2.41, q: 25, a: dur * 0.5, dur: dur * 0.5, g: g * 1.5 });
}
function prep(d, t, f, g = 0.12) { // 預置鋼琴的低音:不和諧泛音 + 螺絲的嗡嗡震動
  tone(d, t, { type: 'triangle', f, dur: 4, a: 0.003, g });
  tone(d, t, { f: f * 2.02, dur: 2, a: 0.003, g: g * 0.33 });
  tone(d, t, { f: f * 3.7, dur: 0.8, a: 0.002, g: g * 0.25 });
  tone(d, t, { f: f * 5.9, dur: 0.4, a: 0.002, g: g * 0.12 });
  burst(d, t, { type: 'bandpass', f: f * 8, q: 10, dur: 0.5, g: g * 0.25 });
  burst(d, t, { type: 'lowpass', f: 300, dur: 0.05, g: g * 0.8 });
}
function choir(d, t, dur, fs, g, F = [330, 750]) { // 氣聲合唱「嗚——」
  for (const f of fs) {
    const s = osc('sawtooth', f * rand(0.997, 1.003)), env = gain(0, d);
    s.connect(filter('bandpass', F[0], 5, env)); s.connect(filter('bandpass', F[1], 7, gain(0.4, env)));
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(g, t + dur * 0.45); env.gain.setValueAtTime(g, t + dur * 0.55); env.gain.linearRampToValueAtTime(0, t + dur);
    s.start(t); s.stop(t + dur + 0.1);
  }
  burst(d, t, { buf: 'pink', type: 'bandpass', f: 500, q: 2, a: dur * 0.45, hold: dur * 0.1, dur: dur * 0.45, g: g * 0.6 });
}
const VOW = [[700, 1150], [480, 850], [330, 750], [290, 2100], [430, 1800], [260, 1100]];
function iChant(d, t0, beats, sp) { // 助念:木魚每拍一下、磬起頭,三個低沉的男聲在同一個音上唸(只有母音、聽不出字)
  for (let k = 0; k < beats; k++) woodfish(d, t0 + k * sp, k % 4 === 0 ? 0.3 : 0.22);
  bowl(d, t0 + 0.02, 0.1); bowl(d, t0 + 16 * sp + 0.02, 0.08);
  const end = t0 + beats * sp + 1;
  for (const [f, g, off] of [[110, 1, 0], [110.6, 0.8, 0.03], [82.4, 0.5, 0.05]]) {
    const s = osc('sawtooth', f), env = gain(0, d), F1 = filter('bandpass', 500, 5), F2 = filter('bandpass', 1000, 7);
    s.connect(F1); s.connect(F2); F1.connect(gain(1.2, env)); F2.connect(gain(0.5, env));
    env.gain.setValueAtTime(0, t0);
    for (let k = 1; k < beats - 1; k++) {
      const t = t0 + k * sp + off, ph = k % 8;
      if (ph === 0) { env.gain.setTargetAtTime(0, t, 0.08); s.frequency.setTargetAtTime(f, t, 0.1); continue; } // 換氣
      const v = pick(VOW);
      F1.frequency.setTargetAtTime(v[0], t, 0.03); F2.frequency.setTargetAtTime(v[1], t, 0.03);
      env.gain.setTargetAtTime(0.12 * g, t, 0.03); env.gain.setTargetAtTime(0.07 * g, t + sp * 0.6, 0.05);
      if (ph === 7) s.frequency.setTargetAtTime(f * 0.89, t, 0.25); // 句尾往下
    }
    env.gain.setTargetAtTime(0, t0 + (beats - 1) * sp, 0.1);
    s.start(t0); s.stop(end);
  }
}
function iLament(d, t0, N) { // 牽亡歌風的哀歌:女聲「啊/喔」、長音尾端往下掉的哭腔、寬顫音;引魂鈴每小節、低鑼每兩小節
  const end = t0 + N.len + 2;
  const s = osc('sawtooth', N.notes[0].f), env = gain(0, d), lp = filter('lowpass', 3500, 0.7, env);
  const F1 = filter('bandpass', 820, 6, lp), F2 = filter('bandpass', 1250, 8, gain(0.6, lp)), F3 = filter('bandpass', 2800, 10, gain(0.2, lp));
  s.connect(F1); s.connect(F2); s.connect(F3);
  lfo(t0, end, 5.8, 38, s.detune);
  burst(env, t0, { buf: 'pink', type: 'bandpass', f: 1500, q: 1, a: 0.5, hold: N.len, dur: 0.8, g: 0.03 });
  env.gain.setValueAtTime(0, t0);
  N.notes.forEach((n, i) => {
    const t = t0 + n.t, nx = N.notes[i + 1], o = i % 2;
    s.frequency.setTargetAtTime(n.f, t, 0.06);
    F1.frequency.setTargetAtTime(o ? 560 : 820, t, 0.1); F2.frequency.setTargetAtTime(o ? 900 : 1250, t, 0.1);
    env.gain.setTargetAtTime(0.4, t, 0.08);
    if (n.b >= 2) { s.frequency.setTargetAtTime(n.f * ct(-160), t + n.d * 0.72, 0.12); env.gain.setTargetAtTime(0.22, t + n.d * 0.72, 0.15); }
    if (!nx || nx.t - (n.t + n.d) > 0.01) env.gain.setTargetAtTime(0, t + n.d - 0.1, 0.1);
  });
  const bar = 4 * N.sp;
  for (let k = 0; k * bar < N.len; k++) { handbell(d, t0 + k * bar, 0.05, 7); if (k % 2 === 0) gongBig(d, t0 + k * bar + 0.02, 0.16, 80); }
  s.start(t0); s.stop(end);
}
function iSicmi(d, t0, N) { // 西索米(出殯的西洋樂隊):薩克斯風吹旋律、長號墊低音、慢步行進鼓
  const end = t0 + N.len + 1.5;
  const s = osc('sawtooth', N.notes[0].f), env = gain(0, d);
  const p1 = filter('peaking', 650, 1.2, filter('lowpass', 2600, 0.7, env)); p1.gain.value = 8;
  const p2 = filter('peaking', 1500, 1.5, p1); p2.gain.value = 5;
  s.connect(p2);
  lfo(t0, end, 5, 16, s.detune);
  burst(env, t0, { type: 'bandpass', f: 2000, q: 1, a: 0.3, hold: N.len, dur: 0.5, g: 0.02 });
  env.gain.setValueAtTime(0, t0);
  N.notes.forEach((n, i) => {
    const t = t0 + n.t, nx = N.notes[i + 1];
    s.frequency.setTargetAtTime(n.f, t, 0.03);
    env.gain.setTargetAtTime(0.3, t, 0.04); env.gain.setTargetAtTime(0.24, t + 0.15, 0.2);
    if (!nx || nx.t - (n.t + n.d) > 0.01) env.gain.setTargetAtTime(0, t + n.d - 0.06, 0.05);
  });
  const lpB = filter('lowpass', 500, 0.8, d);
  chords(N, (tt, root, minor, b) => {
    const t = t0 + tt;
    if (b % 2 === 0) { drum(d, t, 0.3, 70); tone(lpB, t, { type: 'sawtooth', f: hz(N.key - 24 + root + (b === 2 ? 7 : 0)), a: 0.03, hold: N.sp * 0.7, dur: 0.15, g: 0.05 }); }
    else snare(d, t, 0.1);
  });
  cymbal(d, t0, 0.08, 1.2);
  s.start(t0); s.stop(end);
}
function iBeiguan(d, t0) { // 北管鑼鼓(遠處的廟會/出陣):D 大鑼 + 鼓、c 鈔、s 小鑼;第三小節起嗩吶進來
  const e8 = 60 / 132 / 2, P = 'D.c.s.c.D.ccs.c.D.c.s.ccDsc.D.c.';
  for (let rep = 0; rep < 2; rep++) for (let k = 0; k < P.length; k++) {
    const t = t0 + (rep * P.length + k) * e8, c = P[k];
    if (c === 'D') { gongBig(d, t, 0.3, 98); drum(d, t, 0.3, 110); } else if (c === 'c') cymbal(d, t, 0.07, 0.25); else if (c === 's') gongSmall(d, t, 0.12);
  }
  iSuona(d, t0 + 16 * e8, seq('bg'), { g: 0.3 });
  iSuona(d, t0 + 40 * e8, seq('bg', { key: 76 }), { g: 0.28 });
}

// ---------- 配樂床(循環) ----------
function bedChase(d, t0) { // 追逐:北管通鼓的急促節奏 + 大鑼、低音弦樂的半音頑固音型、高音顫音群、嗩吶的下墜哭喊(144 BPM、8 小節)
  const sp = 60 / 144, s16 = sp / 4, P = 'X..x..X.x.X..xx.', OST = [0, 0, 3, 0, 1, 0, -2, 0];
  const ost = filter('lowpass', 900, 1.5, d), hi = filter('lowpass', 3200, 0.7, d);
  for (let bar = 0; bar < 8; bar++) {
    const tb = t0 + bar * 4 * sp;
    for (let k = 0; k < 16; k++) if (P[k] !== '.') drum(d, tb + k * s16, P[k] === 'X' ? 0.45 : 0.22, P[k] === 'X' ? 105 : 150);
    if (bar % 4 === 0) gongBig(d, tb, 0.4, 86);
    if (bar % 4 === 2) cymbal(d, tb, 0.12, 0.9);
    for (let k = 0; k < 8; k++) { const f = hz(38 + OST[k] + (bar >= 4 && k % 4 === 2 ? 12 : 0)); for (const dt of [-8, 8]) tone(ost, tb + (k * sp) / 2, { type: 'sawtooth', f, detune: dt, a: 0.005, hold: sp * 0.25, dur: 0.12, g: 0.05 }); }
    if (bar === 4) for (const f of [587.3, 622.3, 830.6]) trem(hi, tb, f * rand(0.998, 1.002), 16 * sp, 1 / s16, 0.012, 'triangle', 30); // 高音顫音群(後四小節)
  }
  iSuona(d, t0 + 13 * sp, seq('wail'), { g: 0.22, lp: 4500 });
  iSuona(d, t0 + 29 * sp, seq('wail', { key: 73 }), { g: 0.22, lp: 4500 });
}
function bedBlackout(d, t0, len, T) { // 停電:幾乎只剩空間 —— 極低的嗡鳴、偶爾一聲弓擦金屬、預置鋼琴的低音
  const dr = gain(0, d); sus(dr.gain, t0, len, T, 1);
  [[41.2, 0.14], [41.7, 0.12], [82.6, 0.03]].forEach(([f, g]) => { const o = osc('sine', f); o.connect(gain(g, dr)); o.start(t0); o.stop(t0 + len + T); });
  bowed(d, t0 + 3, 311, 6, 0.02); bowed(d, t0 + 14, 277, 7, 0.018);
  prep(d, t0 + 9, 55, 0.1); prep(d, t0 + 19.5, 58.3, 0.08);
}
function bedDread(d, t0, len, T) { // 恐懼累積:D 的低音嗡鳴(慢慢拍頻)、氣聲合唱的起伏、預置鋼琴、遠處走音的音樂盒片段(《望春風》前五個音)
  const dr = gain(0, filter('lowpass', 240, 0.7, d)); sus(dr.gain, t0, len, T, 1);
  [['sawtooth', 73.4, 0.05], ['sawtooth', 73.7, 0.05], ['sine', 36.7, 0.1]].forEach(([ty, f, g]) => { const o = osc(ty, f); o.connect(gain(g, dr)); o.start(t0); o.stop(t0 + len + T); });
  choir(d, t0 + 5, 8, [146.8, 155.6, 220], 0.02); choir(d, t0 + 20, 9, [130.8, 138.6, 196], 0.02);
  prep(d, t0 + 2, 73.4, 0.1); prep(d, t0 + 16.5, 69.3, 0.09); prep(d, t0 + 26, 77.8, 0.08);
  const N = seq('wcf'); N.notes = N.notes.slice(0, 5);
  iBox(gain(0.45, filter('lowpass', 2600, 0.7, d)), t0 + 11, N, { det: 30, wind: 1.2, sag: 0.04 });
  bowed(d, t0 + 23, 233, 6, 0.012);
}
function bedSafe(d, t0) { // 補給站(溫暖):舊電鋼琴慢慢彈《六月茉莉》、柔和的和弦墊、一點卡帶的溫度(輕微抖音、嘶聲)
  const N = seq('lyml'), out = filter('lowpass', 4200, 0.7, d), W = gain(1);
  { const a = osc('sine', 0.5), ga = gain(6, W); a.connect(ga); a.start(t0); a.stop(t0 + N.len + 4); }
  const T = (dst, t, op) => { const r = tone(dst, t, op); W.connect(r.osc.detune); };
  for (const n of N.notes) { const t = t0 + n.t; T(out, t, { f: n.f, a: 0.006, dur: 1.8, g: 0.06 }); T(out, t, { f: n.f * 2, a: 0.004, dur: 0.6, g: 0.015 }); T(out, t, { f: n.f * 3.01, a: 0.003, dur: 0.25, g: 0.006 }); }
  const pad = filter('lowpass', 1200, 0.7, out);
  chords(N, (tt, root, minor, b) => {
    const t = t0 + tt;
    if (b === 0) for (const iv of [0, minor ? 3 : 4, 7]) T(pad, t, { type: 'triangle', f: hz(N.key - 12 + root + iv), a: 0.4, hold: N.sp * 2.4, dur: 0.6, g: 0.012 });
    if (b % 2 === 0) T(out, t, { f: hz(N.key - 24 + root + (b === 2 ? 7 : 0)), a: 0.01, hold: N.sp * 0.6, dur: 0.4, g: 0.05 });
  });
  burst(out, t0, { type: 'highpass', f: 5000, a: 0.5, hold: N.len, dur: 0.5, g: 0.0015 });
}
function bedTouqi(d, t0, len, T) { // 頭七:很低的嗡鳴、遠處的低鑼、引魂鈴、氣聲合唱「喔——」(稀少、肅穆)
  const dr = gain(0, filter('lowpass', 200, 0.7, d)); sus(dr.gain, t0, len, T, 1);
  for (const f of [55, 55.3]) { const o = osc('sawtooth', f); o.connect(gain(0.05, dr)); o.start(t0); o.stop(t0 + len + T); }
  gongBig(d, t0 + 0.02, 0.3, 80); gongBig(d, t0 + 12, 0.24, 80);
  handbell(d, t0 + 6, 0.06, 7); handbell(d, t0 + 18, 0.05, 7);
  choir(d, t0 + 2, 9, [110, 164.8, 116.5], 0.015, [480, 850]);
}

// ---------- 配方 ----------
// len 渲染長度(秒);loop:循環床(多渲染 T 秒尾巴疊回開頭);rms 正規化目標
const RX = {
  box_wcf: { len: () => seq('wcf').len * 1.6 + 2, fn: (d, t) => iBox(d, t, seq('wcf'), { wind: 0.55, det: 12, sag: 0.025 }), rms: 0.06 },
  cas_uyh: { sr: 16000, len: () => seq('uyh').len + 2.5, fn: (d, t) => iCassette(d, t, seq('uyh')), rms: 0.07 },
  radio_ssk: { sr: 12000, len: () => seq('ssk').len + 2, fn: (d, t) => iRadio(d, t, seq('ssk')), rms: 0.07 },
  radio_dtt: { sr: 12000, len: () => seq('dtt').len + 2, fn: (d, t) => iRadio(d, t, seq('dtt')), rms: 0.07 },
  radio_thgd: { sr: 12000, len: () => seq('thgd').len + 2, fn: (d, t) => iRadio(d, t, seq('thgd')), rms: 0.07 },
  radio_lyml: { sr: 12000, len: () => seq('lyml').len + 2, fn: (d, t) => iRadio(d, t, seq('lyml')), rms: 0.07 },
  radio_uyh: { sr: 12000, len: () => seq('uyh', { key: 64 }).len + 2, fn: (d, t) => iRadio(d, t, seq('uyh', { key: 64 })), rms: 0.07 },
  jingle: { len: () => 4, fn: (d, t) => { const N = seq('jingle'); iCassette(filter('highpass', 380, 0.8, filter('lowpass', 2800, 0.8, d)), t, N, { wow: 22 }); for (const n of N.notes) metal(d, t + n.t, n.f * 2, 0.02, 1.2, [1, 2.76, 5.4]); }, rms: 0.07 },
  // 哼唱:真人的取樣樂器(vox.js;vox = 先載好的取樣表,暖機後才載)。fb = 取樣載入失敗時的合成版(共振峰)
  //   孩子:G 調(錄音裡的女童剛好唱了 G 大調五聲的每個音,幾乎不用移調);阿嬤:A 調(比合成版的 C 調低三個半音 = 比較老;取樣的根音 A3/C4/D4,移調都在 ±3 半音內)
  hum_thh: { sr: 22050, vox: 'kid', len: () => seq('thh', { bpm: 78 }).len + 2.2, fn: (d, t) => iVox(d, t + 0.6, seq('thh', { key: 67, bpm: 78 }), VOICE.kid, { fade: 0.45 }), fb: (d, t) => iHum(d, t, seq('thh', { bpm: 78 }), { vib: 14, shaky: 10, lp: 1100, f1: 330, f2: 1250, breath: 0.04, fade: 0.5 }), rms: 0.05, vrms: 0.07 },
  hum_hkk: { sr: 22050, vox: 'kid', len: () => seq('hkk', { bpm: 72 }).len + 2.2, fn: (d, t) => iVox(d, t + 0.6, seq('hkk', { key: 67, bpm: 72 }), VOICE.kid, { fade: 0.45 }), fb: (d, t) => iHum(d, t, seq('hkk', { bpm: 72 }), { vib: 14, shaky: 10, lp: 1100, f1: 330, f2: 1250, breath: 0.04, fade: 0.5 }), rms: 0.05, vrms: 0.07 },
  hum_wcf: { sr: 22050, vox: 'ama', len: () => seq('wcf', { bpm: 56, bars: 4 }).len + 2.2, fn: (d, t) => iVox(d, t + 0.6, seq('wcf', { key: 57, bpm: 56, bars: 4 }), VOICE.ama), fb: (d, t) => iHum(d, t, seq('wcf', { key: 60, bpm: 56, bars: 4 }), { vib: 34, vr: 5.9, shaky: 16, lp: 800, f1: 260, f2: 950, breath: 0.09, det: 18, port: 0.06 }), rms: 0.05 },
  // 錄音片段(clip:直接用解碼好的錄音,不烘焙;loop 的迴圈點在 vox.js 的 CLIPS)。誦經、北管各有幾段,ALT 隨機挑
  chant_a: { clip: 'chant_a', loop: true, g: 0.75 },
  chant_b: { clip: 'chant_b', loop: true, g: 0.75 },
  chant_c: { clip: 'chant_c', loop: true, g: 0.8 },
  bg_1: { clip: 'bg_1', g: 1.3 }, bg_2: { clip: 'bg_2', g: 1.3 }, bg_3: { clip: 'bg_3', g: 1.3 },
  // 錄音過播放鏈再烘焙:收音機裡的老唱片〈豐原調〉(兩段)、錄音帶裡的〈天黑黑〉
  rec_fy1: { sr: 12000, vox: 'fy', len: () => CLIPS.fy.parts[0][1] - CLIPS.fy.parts[0][0] + 1.2, fn: (d, t) => iRecord(d, t, voxBuf('fy'), CLIPS.fy.parts[0][0], CLIPS.fy.parts[0][1] - CLIPS.fy.parts[0][0]), rms: 0.07 },
  rec_fy2: { sr: 12000, vox: 'fy', len: () => CLIPS.fy.parts[1][1] - CLIPS.fy.parts[1][0] + 1.2, fn: (d, t) => iRecord(d, t, voxBuf('fy'), CLIPS.fy.parts[1][0], CLIPS.fy.parts[1][1] - CLIPS.fy.parts[1][0]), rms: 0.07 },
  tape_thh: { sr: 16000, vox: 'thh', len: () => CLIPS.thh.dur + 1.4, fn: (d, t) => iTape(d, t, voxBuf('thh')), rms: 0.05 },
  sicmi: { sr: 16000, len: () => seq('jcn').len + 2, fn: (d, t) => iSicmi(d, t, seq('jcn')), rms: 0.07 },
  beiguan: { len: () => (60 / 132 / 2) * 64 + 4, fn: (d, t) => iBeiguan(d, t), rms: 0.08 },
  bell: { len: () => 9, fn: (d, t) => { for (let k = 0; k < 4; k++) handbell(d, t + k * 2.2, 0.12, 8 + k); }, rms: 0.05 },
  lament: { len: () => seq('lament').len + 4, fn: (d, t) => iLament(d, t, seq('lament')), rms: 0.06 },
  chant: { sr: 16000, loop: true, len: () => (60 / 100) * 32, T: 3, fn: (d, t) => iChant(d, t, 32, 0.6), rms: 0.06 },
  bed_chase: { loop: true, len: () => (60 / 144) * 32, T: 4, fn: (d, t) => bedChase(d, t), rms: 0.1 },
  bed_blackout: { sr: 16000, loop: true, len: () => 24, T: 4, fn: (d, t, L, T) => bedBlackout(d, t, L, T), rms: 0.05 },
  bed_dread: { sr: 16000, loop: true, len: () => 32, T: 5, fn: (d, t, L, T) => bedDread(d, t, L, T), rms: 0.06 },
  bed_safe: { sr: 16000, loop: true, len: () => seq('lyml').len, T: 3, fn: (d, t) => bedSafe(d, t), rms: 0.07 },
  bed_touqi: { loop: true, len: () => 24, T: 4, fn: (d, t, L, T) => bedTouqi(d, t, L, T), rms: 0.05 },
};
export const FOLK_KEYS = Object.keys(RX);

// ---------- 烘焙快取 ----------
const FC = new Map(); // key → { b, used, live }
const PIN = new Set(['bed_chase', 'box_wcf', 'hum_wcf']); // 常駐:事件一來就要能放(共約 5 MB)
const FQ = [];
let busy = false;
const now = () => (A.ctx ? A.ctx.currentTime : 0);
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 30)); // 等真正的閒置時間(建圖一次 2~15ms)
function post(b, R, len, rms = R.rms) { // 循環:尾巴疊回開頭;一次性:去掉尾端靜音;最後正規化到目標 RMS(峰值限制在 0.9)
  const sr = b.sampleRate;
  let n = b.length;
  if (R.loop) n = Math.round(len * sr);
  else { const x = b.getChannelData(0); while (n > sr && Math.abs(x[n - 1]) < 2e-4) n--; n = Math.min(b.length, n + Math.round(sr * 0.1)); }
  const out = A.ctx.createBuffer(1, n, sr), y = out.getChannelData(0), x = b.getChannelData(0);
  y.set(x.subarray(0, n));
  if (R.loop) for (let i = n; i < x.length; i++) y[i - n] += x[i];
  let e = 0, pk = 0;
  for (let i = 0; i < n; i++) { e += y[i] * y[i]; const a = Math.abs(y[i]); if (a > pk) pk = a; }
  const r = Math.sqrt(e / n) || 1e-6, k = Math.min(rms / r, 0.9 / (pk || 1));
  for (let i = 0; i < n; i++) y[i] *= k;
  return out;
}
// 要用錄音的配方:錄音載好(或確定載不到 → 用 fb)才能烘焙;還在等的先跳過,載好時再叫 pumpF
const VWAIT = new Set();
function canBake(key) {
  const R = RX[key];
  if (!R || !R.vox || voxBuf(R.vox) || voxFailed(R.vox)) return true;
  if (!VWAIT.has(R.vox)) { VWAIT.add(R.vox); voxLoad(R.vox).then(() => { VWAIT.delete(R.vox); pumpF(); }); }
  return false;
}
function pumpF() {
  if (busy || !FQ.length || !A.ctx || !FQ.some((j) => canBake(j.key))) return;
  busy = true;
  idle(() => {
    FQ.sort((a, b) => b.pr - a.pr);
    const i = FQ.findIndex((j) => canBake(j.key));
    if (i < 0 || !A.ctx) { busy = false; return; }
    const { key } = FQ.splice(i, 1)[0], e = FC.get(key), R = RX[key];
    if (!e || !R) { busy = false; pumpF(); return; }
    const fn = R.vox && !voxBuf(R.vox) ? R.fb : R.fn; // 錄音載入失敗 → 合成版(沒有合成版的就不放)
    if (!fn) { FC.delete(key); busy = false; pumpF(); return; }
    if (fn === R.fb) FS.fallback[key] = 1;
    const len = R.len(), T = R.T ?? 0;
    let p;
    const c0 = performance.now();
    try { p = bake(len + T + (R.loop ? 0 : 0.5), (d, t) => fn(d, t, len, T), 1, R.sr || SR); } catch (err) { if (import.meta.env?.DEV) console.warn('[folk]', key, err); FC.delete(key); busy = false; pumpF(); return; }
    const ms = performance.now() - c0;
    FS.bakeMs += ms; FS.ms[key] = +ms.toFixed(1);
    p.then((b) => {
      if (FC.get(key) === e && A.ctx) { e.b = post(b, R, len, fn === R.fb ? R.rms : R.vrms ?? R.rms); FS.baked++; }
      if (R.vox && !FQ.some((j) => RX[j.key] && RX[j.key].vox === R.vox)) voxRelease(R.vox); // 烘焙完、沒有別的配方要用 → 來源錄音馬上釋放
      busy = false; pumpF();
    }, () => { FC.delete(key); busy = false; pumpF(); });
  });
}
// 取得烘焙好的緩衝(沒有就排程;pr 越大越先)。clip 配方 = 直接用解碼好的錄音(暖機後才載)
export function folkBuf(key, pr = 5) {
  const R = RX[key];
  if (!R || !A.ctx || A.noBake || typeof OfflineAudioContext === 'undefined') return null;
  let e = FC.get(key);
  if (!e) {
    e = { b: null, used: now(), live: 0 };
    FC.set(key, e);
    if (R.clip) voxLoad(R.clip).then((b) => { if (FC.get(key) !== e) return; if (b) { e.b = b; FS.clips++; } else FC.delete(key); });
    else { FQ.push({ key, pr }); pumpF(); }
  }
  e.used = now();
  return e.b;
}
// 同一種聲音有幾段真人錄音的:隨機挑已載好的(不連續重複);都還在載 → null(等);全部載入失敗 → 合成版
const ALT = { chant: ['chant_a', 'chant_b', 'chant_c'], beiguan: ['bg_1', 'bg_2', 'bg_3'] };
const altLast = {};
function alt(key, pr = 5) {
  const L = ALT[key];
  if (!L) return key;
  const ok = [];
  let pend = false;
  for (const k of L) { if (folkBuf(k, pr)) ok.push(k); else if (!voxFailed(RX[k].clip)) pend = true; }
  if (ok.length) { const f = ok.filter((k) => k !== altLast[key]), k = pick(f.length ? f : ok); altLast[key] = k; return k; }
  return pend ? null : key;
}
export function folkPrebake(keys, pr = 1) { for (const k of keys) for (const kk of ALT[k] || [k]) folkBuf(kk, pr); }

// ---------- 播放 ----------
// 定位播放:o 同 emit(pos、cat、bus、room、hall、ref、roll、maxDist、gain);o.lp 低通、o.rate、o.fi/fo 淡入淡出、o.off/len 截取片段
const LIVE = [];
export function playFolk(key, o = {}) {
  const b = folkBuf(key, 8);
  if (!b) return null;
  const rate = o.rate ?? 1, off = o.off ?? 0, len = o.len ?? (b.duration - off) / rate;
  const h = emit({ cat: 'amb', prio: 2, room: 0.5, hall: 0.4, ref: 2, roll: 1.1, ...o, dur: len + 0.5, track: false });
  if (!h) return null;
  const s = A.ctx.createBufferSource();
  s.buffer = b; s.playbackRate.value = rate;
  const g = gain(0, o.lp ? filter('lowpass', o.lp, 0.6, h.in) : h.in);
  s.connect(g);
  const fi = o.fi ?? 0.02, fo = o.fo ?? 0.3, v = o.g ?? 1;
  g.gain.setValueAtTime(0, h.t); g.gain.linearRampToValueAtTime(v, h.t + fi);
  g.gain.setValueAtTime(v, h.t + Math.max(fi, len - fo)); g.gain.linearRampToValueAtTime(0, h.t + len);
  s.start(h.t, off); s.stop(h.t + len + 0.05);
  const e = FC.get(key); if (e) { e.live++; s.onended = () => { e.live--; }; }
  const L = { key, h, s, g, pos: o.pos || null, end: h.t + len, stopD: o.stopD || 0, fadeD: o.fadeD || 0, done: false, tag: o.tag || key };
  LIVE.push(L);
  return L;
}
// 停下:wind = 發條鬆掉(速度與音高一起往下掉);否則淡出
export function stopFolk(L, sec = 1.2, wind = false) {
  if (!L || L.done || !A.ctx) return;
  L.done = true;
  const n = A.ctx.currentTime;
  try {
    if (wind) { L.s.playbackRate.cancelScheduledValues(n); L.s.playbackRate.setValueAtTime(L.s.playbackRate.value, n); L.s.playbackRate.linearRampToValueAtTime(0.3, n + sec); }
    L.g.gain.cancelScheduledValues(n); L.g.gain.setValueAtTime(L.g.gain.value, n); L.g.gain.linearRampToValueAtTime(0, n + sec);
    L.s.stop(n + sec + 0.05);
  } catch { /* 已停 */ }
  L.h.kill && setTimeout(() => L.h.kill(), sec * 1000);
  if (wind) { const h = emit({ pos: L.pos, cat: 'amb', prio: 2, room: 0.4, ref: 1.5, dur: 0.4 }); if (h) { burst(h.in, h.t + sec, { type: 'bandpass', f: 2200, q: 3, dur: 0.02, g: 0.05 }); metal(h.in, h.t + sec + 0.01, 3100, 0.012, 0.15, [1, 2.4]); } }
}
// 遠方的聲音(戶外的鑼鼓、樂隊):放在聆聽者某個方向 dist 公尺外(世界座標,轉頭時方向不變)
function farPos(dist, ang = rand(0, Math.PI * 2)) { const L = A.L; return { x: L.x + Math.cos(ang) * dist, y: L.y + rand(0, 4), z: L.z + Math.sin(ang) * dist }; }

// ---------- 情境 ----------
export const FS = { blackUntil: -1, touqiUntil: -1, baked: 0, bakeMs: 0, ms: {}, cues: [], last: {}, clips: 0, fallback: {} };
const BLACK = new Set(['blackout', 'lightsDie', 'corridorOut', 'blackoutChange', 'darkFollow']);
const C = { H: null, off: null, next: {}, t: 0, zone: null, theme: '', chant: null, cas: null, hum: null, tape: null };
const CD = { hum: [150, 230], ama: [80, 120], cassette: [240, 380], chant: [200, 320], beiguan: [260, 400], sicmi: [480, 720], bell: [200, 320], tape: [360, 560] };
const ready = (k, n) => n >= (C.next[k] ?? 0);
const cool = (k, n) => { C.next[k] = n + rand(...CD[k]); };
function log(k) { FS.last[k] = +now().toFixed(1); FS.cues.push(`${now().toFixed(0)}:${k}`); if (FS.cues.length > 20) FS.cues.shift(); }
function D() { return A.game && A.game.horror && A.game.horror.director; }
function ask(pos, w = 0.8) { const d = D(); if (!d) return false; try { return d.request('ambient', { weight: w, pos }); } catch { return false; } }
function tell(pos) { const d = D(); try { d && d.notify('ambient', { pos }); } catch { /* 略 */ } }

function onScare(e) {
  const k = e && e.kind, n = now();
  if (BLACK.has(k)) FS.blackUntil = n + 28;
  if (k === 'touqi') { FS.touqiUntil = n + 75; setTimeout(() => lament(), 3500); }
  else if (k === 'nurse') ama(e.pos);
  else if (k === 'child') childHum(e.pos, true);
}
function bind() {
  const H = A.game && A.game.horror;
  if (!H || H === C.H || typeof H.on !== 'function') return;
  try { C.off && C.off(); } catch { /* 舊的 */ }
  C.H = H; C.off = H.on('scare', onScare);
}

// 阿嬤:老婦人哼《望春風》的第一句(她就在附近);很輕,在玩家身後或事件位置
export function ama(pos) {
  const n = now();
  if (!ready('ama', n)) return null;
  const L = playFolk('hum_wcf', { pos: pos || around(rand(3.5, 5.5), Math.PI + rand(-0.8, 0.8), -0.2), cat: 'scare', prio: 5, room: 0.6, hall: 0.4, ref: 1.6, g: 0.9, lp: 2400, fi: FS.fallback.hum_wcf ? 0.6 : 0.08, fo: 1.2, tag: 'ama' }); // 真人版開頭是吸氣,不淡入
  if (L) { cool('ama', n); log('ama'); }
  return L;
}
// 孩子的哼唱(《天黑黑》或《火金姑》):在 8~12 公尺外,走近 5 公尺內就淡掉
export function childHum(pos, forced = false) {
  const n = now();
  if (!forced && !ready('hum', n)) return null;
  const p = pos || around(rand(8, 12), rand(-2.2, 2.2), 0);
  const L = playFolk(pick(['hum_thh', 'hum_hkk']), { pos: p, cat: 'scare', prio: 4, room: 0.7, hall: 0.5, ref: 3, g: 1.3, fi: 0.9, fo: 1.5, fadeD: 5, tag: 'hum' });
  if (L) { cool('hum', n); log('hum'); C.hum = L; }
  return L;
}
// 錄音帶裡大人唱的《天黑黑》(封院那年家屬錄給孩子的帶子):隔壁房間 9~13 公尺外,很小聲;走近 5 公尺就淡掉,找不到那台錄音機
export function tapeThh(pos) {
  const n = now();
  const L = playFolk('tape_thh', { pos: pos || around(rand(9, 13), rand(-2.4, 2.4), -0.6), cat: 'scare', prio: 3, room: 0.7, hall: 0.4, ref: 2.2, g: 0.85, lp: 3000, fi: 0.05, fo: 1.5, fadeD: 5, tag: 'tape' });
  if (L) { cool('tape', n); cool('hum', n); log('tape'); C.tape = L; }
  return L;
}
// 音樂盒《望春風》:發條越來越鬆;走近 stopD 公尺就「喀」一聲停下(ghost.lullaby、互動音樂盒共用)
export function boxAt(pos, o = {}) {
  const L = playFolk('box_wcf', { pos, cat: 'scare', prio: 5, room: 0.8, hall: 0.5, ref: 2, g: 1, fi: 0.05, fo: 0.4, stopD: o.stopD ?? 3.2, tag: 'box' });
  if (L) log('box');
  return L;
}
export function lament() {
  const L = playFolk('lament', { pos: farPos(rand(22, 30)), cat: 'amb', prio: 3, room: 0.3, hall: 1, ref: 12, roll: 1, maxDist: 80, g: 0.9, lp: 3000, fi: 2, fo: 3, tag: 'lament' });
  if (L) log('lament');
  return L;
}
// 錄音機自己播起《雨夜花》;玩家按下錄音機時(sfx.tape)停掉
export function cassetteStop() { if (C.cas) { stopFolk(C.cas, 0.25, true); C.cas = null; } }
function cassetteAt(e) {
  const p = e.pos, L = playFolk('cas_uyh', { pos: { x: p.x, y: p.y, z: p.z }, cat: 'amb', prio: 2, room: 0.5, hall: 0.3, ref: 1.4, g: 0.9, fi: 0.4, fo: 0.8, tag: 'cassette' });
  if (L) { C.cas = L; L.ixPos = p; log('cassette'); }
  return L;
}
function chantAt(z, lvY) {
  const r = z.rects[0], x = ((r[0] + r[2]) / 2 + 0.5) * 2, zz = ((r[1] + r[3]) / 2 + 0.5) * 2;
  const pos = { x, y: lvY + 1.2, z: zz };
  const k = alt('chant', 8), b = k && folkBuf(k, 8);
  if (!b) return null;
  const h = emit({ pos, cat: 'loop', bus: 'amb', prio: 1, dur: 1e6, room: 0.8, hall: 0.6, ref: 3, roll: 1, maxDist: 40, track: false, nocap: true });
  if (!h) return null;
  const s = A.ctx.createBufferSource(), Q = RX[k].clip && CLIPS[RX[k].clip];
  s.buffer = b; s.loop = true;
  if (Q && Q.le) { s.loopStart = Q.ls; s.loopEnd = Q.le; } // 錄音循環:檔案前後的邊界不進迴圈
  const g = gain(0, filter('lowpass', 2600, 0.6, h.in));
  s.connect(g); s.start(h.t, Q && Q.le ? rand(Q.ls, Q.le - 2) : 0); // 從迴圈裡隨機的地方開始(每次聽到的開頭不同)
  g.gain.setValueAtTime(0, h.t); g.gain.linearRampToValueAtTime(0.7 * (RX[k].g ?? 1), h.t + 5);
  const e = FC.get(k); if (e) e.live++;
  log('chant');
  return { h, s, g, zone: z.id, e };
}
function chantStop(sec = 3) {
  const c = C.chant;
  if (!c) return;
  C.chant = null;
  const n = now();
  try { c.g.gain.cancelScheduledValues(n); c.g.gain.setValueAtTime(c.g.gain.value, n); c.g.gain.linearRampToValueAtTime(0, n + sec); c.s.stop(n + sec + 0.1); } catch { /* 已停 */ }
  setTimeout(() => { try { c.h.kill(); } catch { /* 略 */ } if (c.e) c.e.live--; }, sec * 1000 + 200);
}

const RE = {
  ward: /ward|peds|nursery|playroom|icu|dorm|rehab|psych/,
  chant: /morgue|ossuary|chapel/,
  kids: /peds|nursery|playroom/,
  outdoor: /yard|plaza|parking|playground|rooftop|cemetery|courtyard|garden|stair_ext|fire_escape|dock|ramp/,
};
function zoneHere() {
  const L = A.L, w = A.world;
  try { return w && w.zoneAt ? w.zoneAt(L.x, L.y - 1.65, L.z) : null; } catch { return null; }
}
function nearZombie(r) { const zs = A.game && A.game.zombies; if (!zs) return false; for (const z of zs) if (z.alive && z.dist < r) return true; return false; }

function scene(n) {
  const g = A.game, d = D();
  if (!g || g.state !== 'playing' || !d || d.level === 'off' || (g.net && g.net.pvp)) { chantStop(1.5); return; }
  const quiet = d.silent && !d.chasing && !d.bigActive && d.tension < 0.3;
  const z = zoneHere(), th = (z && z.theme) || '';
  if (th !== C.theme) { // 換區域:先烘焙這裡可能用到的(閒置時間、低優先權)
    if (RE.ward.test(th)) folkPrebake(RE.kids.test(th) ? ['hum_thh', 'hum_hkk', 'tape_thh'] : ['hum_thh', 'hum_hkk']);
    else if (RE.chant.test(th)) folkPrebake(['chant']);
    else if (A.outdoor || RE.outdoor.test(th)) folkPrebake(['beiguan', 'bell', 'sicmi']);
  }
  C.zone = z; C.theme = th;
  const H = g.horror;
  if (H && H.quiet >= 5 && !C.warmT) { C.warmT = true; folkPrebake(['lament', 'bed_touqi']); } // 頭七快到了
  if (d.act >= 2 && !C.warmB) { C.warmB = true; folkPrebake(['bed_blackout']); }
  // 誦經:人在太平間/納骨堂/禮拜堂、安靜時才有;離開、開打或追逐就淡出
  if (C.chant && (!quiet || !z || z.id !== C.chant.zone)) { chantStop(quiet ? 3 : 1.2); cool('chant', n); }
  if (!quiet) { if (C.cas && !d.silent) { stopFolk(C.cas, 1.5); C.cas = null; } return; }
  if (!C.chant && z && RE.chant.test(th) && ready('chant', n) && Math.random() < 0.3 && ask(null, 0.6)) {
    const lv = A.world && A.world.layout && A.world.layout.levels && A.world.layout.levels[z.levelIndex];
    C.chant = chantAt(z, lv ? lv.y : A.L.y - 1.65);
    if (C.chant) tell(null); else alt('chant', 6);
  }
  // 孩子的哼唱:病房類、附近沒有殭屍
  const kidLive = LIVE.some((L) => !L.done && (L.tag === 'hum' || L.tag === 'tape'));
  if (RE.ward.test(th) && !kidLive && ready('hum', n) && Math.random() < 0.035 && !nearZombie(18)) {
    if (!folkBuf('hum_thh', 4) || !folkBuf('hum_hkk', 4)) { /* 先烘焙,下次再放 */ } else if (ask(null, 0.8)) { if (childHum(null)) tell(null); }
  }
  // 小兒科/育嬰室/遊戲室:隔壁房間的錄音機在放大人唱的《天黑黑》(家屬錄給孩子的帶子),很小聲、隔著牆;走近 5 公尺就停
  else if (RE.kids.test(th) && !kidLive && ready('tape', n) && Math.random() < 0.02 && !nearZombie(18)) {
    if (folkBuf('tape_thh', 4) && ask(null, 0.6)) { if (tapeThh(null)) tell(null); }
  }
  // 錄音機自己播起來:附近 6~18 公尺內有錄音機(同一層)
  if (!C.cas && ready('cassette', n) && Math.random() < 0.04 && g.interact && g.interact.find) {
    let best = null, bd = 99;
    try { for (const e of g.interact.find('cassette')) { const p = e.pos, dd = Math.hypot(p.x - A.L.x, p.z - A.L.z); if (Math.abs(p.y - A.L.y) < 2.5 && dd > 6 && dd < 18 && dd < bd) { bd = dd; best = e; } } } catch { best = null; }
    if (best && folkBuf('cas_uyh', 4) && ask(best.pos, 0.7)) { if (cassetteAt(best)) { tell(best.pos); cool('cassette', n); } }
  }
  // 戶外:遠方的北管、西索米、引魂鈴(很少)
  const out = A.outdoor || RE.outdoor.test(th);
  if (out && Math.random() < 0.025) {
    const k0 = pick(['beiguan', 'sicmi', 'bell']), k = ready(k0, n) ? alt(k0, 3) : null; // 北管 = 三段真實錄音之一
    if (k && folkBuf(k, 3) && ask(null, 0.7)) {
      const L = playFolk(k, { pos: farPos(k0 === 'bell' ? rand(25, 35) : rand(55, 75)), cat: 'amb', prio: 1, room: 0.2, hall: 1.2, ref: k0 === 'bell' ? 10 : 28, roll: 1, maxDist: 160, g: 0.9 * (RX[k].g ?? 1), lp: k0 === 'bell' ? 5000 : 1700, fi: RX[k].clip ? 0.05 : 3, fo: RX[k].clip ? 0.5 : 4, tag: k0 });
      if (L) { tell(null); cool(k0, n); log(k0); }
    }
  }
}

// 每 50ms:正在播的聲音跟距離互動(音樂盒走近就停、孩子走近就淡、錄音機走遠就停);每秒:情境
onTick((n) => {
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const L = LIVE[i];
    if (L.done || n > L.end + 0.2) { LIVE.splice(i, 1); if (C.cas === L) C.cas = null; continue; }
    if (!L.pos) continue;
    const d = distTo(L.pos);
    if (L.stopD && d < L.stopD) stopFolk(L, 1.6, true);
    else if (L.fadeD && d < L.fadeD) stopFolk(L, 1.8);
    else if (L === C.cas && d > 28) { stopFolk(L, 2); C.cas = null; }
  }
  if (n - C.t < 1) return;
  C.t = n;
  bind();
  try { scene(n); } catch (e) { if (import.meta.env?.DEV) console.warn('[folk scene]', e); }
  if (((n | 0) % 10) === 0) { // 150 秒沒用就釋放(烘焙結果、解碼好的錄音)
    for (const [k, e] of FC) if (e.b && !e.live && !PIN.has(k) && n - e.used > 150) FC.delete(k);
    voxGC();
  }
});

// 換地圖 / 重開:停掉所有正在播的、清掉冷卻
export function folkReset() {
  for (const L of LIVE) stopFolk(L, 0.2);
  LIVE.length = 0;
  chantStop(0.3);
  C.cas = null; C.tape = null; C.next = {}; C.warmT = C.warmB = false;
  FS.blackUntil = FS.touqiUntil = -1;
}
export const folkTheme = () => C.theme;
export const folkState = () => ({ cache: [...FC].map(([k, e]) => `${k}${e.b ? `:${e.b.duration.toFixed(1)}s` : '(烘焙中)'}${e.live ? `×${e.live}` : ''}`), queued: FQ.length, live: LIVE.filter((L) => !L.done).map((L) => L.tag), chant: !!C.chant, cassette: !!C.cas, theme: C.theme, cues: FS.cues.slice(-8), ms: FS.ms, blackout: FS.blackUntil > now(), touqi: FS.touqiUntil > now(), baked: FS.baked, bakeMs: +FS.bakeMs.toFixed(1), clips: FS.clips, fallback: Object.keys(FS.fallback), vox: voxState() });
// 讓其他模組(劇情)直接放:kind 'ama' | 'child' | 'tape' | 'box' | 'lament' | 'bell' | 'beiguan' | 'sicmi' | 'cassette'
export function folkCue(kind, pos) {
  if (kind === 'ama') return !!ama(pos);
  if (kind === 'child') return !!childHum(pos, true);
  if (kind === 'tape') return !!tapeThh(pos);
  if (kind === 'box') return !!(pos && boxAt(pos));
  if (kind === 'lament') return !!lament();
  if (kind === 'cassette' && pos) return !!cassetteAt({ pos });
  const k = alt(kind, 6);
  if (k && RX[k] && !RX[k].loop) return !!playFolk(k, { pos: pos || farPos(rand(40, 60)), cat: 'amb', prio: 2, hall: 1, ref: pos ? 2 : 20, maxDist: 160, lp: pos ? 0 : 1800, fi: RX[k].clip ? 0.05 : 1, fo: 2, g: RX[k].g ?? 1 });
  return false;
}
// 收音機(ambience 的 radio 層):下一段要播的老歌(偶爾先放台呼)。回傳緩衝或 null(還在烘焙)
// rec_fy = 真人唱的〈豐原調〉老唱片;其他是合成的大廣弦 + 月琴器樂
const RADIO = ['rec_fy1', 'radio_ssk', 'radio_dtt', 'rec_fy2', 'radio_thgd', 'radio_lyml', 'radio_uyh'];
let rIdx = (Math.random() * RADIO.length) | 0;
export function radioNext() {
  if (Math.random() < 0.3) { const j = folkBuf('jingle', 3); if (j) return j; }
  for (let i = 0; i < RADIO.length; i++) { const k = RADIO[(rIdx + i) % RADIO.length], b = folkBuf(k, 3); if (b) { rIdx = (rIdx + i + 1) % RADIO.length; return b; } }
  return null;
}
// 片段(配樂的區域色彩):從烘焙好的旋律裡截 3~7 秒,很遠、很輕(非定位,配樂匯流排)
export function fragment(key, o = {}) {
  const k = key === 'chant' ? key : alt(key, 2), b = k && folkBuf(k, 2); // 真人誦經只在原地完整地播(循環),不剪成配樂片段 → 片段用合成版
  if (!b || !A.ctx) return false;
  const len = Math.min(b.duration, rand(3, 7)), off = rand(0, Math.max(0, b.duration - len));
  const h = emit({ bus: 'music', prio: 0, room: 0.2, hall: 1, echo: 0.4, dur: len + 0.3, gain: o.g ?? 0.5 });
  if (!h) return false;
  const p = A.ctx.createStereoPanner(); p.pan.value = rand(-0.8, 0.8);
  const lp = filter('lowpass', o.lp ?? 1800, 0.6, h.in); p.connect(lp);
  const s = A.ctx.createBufferSource(), g = gain(0, p);
  s.buffer = b; s.playbackRate.value = o.rate ?? (RX[k].clip ? 1 : rand(0.97, 1.0)); s.connect(g); // 錄音(誦經、北管)不變調
  g.gain.setValueAtTime(0, h.t); g.gain.linearRampToValueAtTime(1, h.t + 1); g.gain.setValueAtTime(1, h.t + len - 1.2); g.gain.linearRampToValueAtTime(0, h.t + len);
  s.start(h.t, off); s.stop(h.t + len + 0.05);
  return true;
}
export const _folk = { RX, MEL, seq, FC, LIVE, C, bed: (k) => folkBuf(k, 6), alt, radioNext, fragment }; // 測試用(window.__sfx._internal.folk)
