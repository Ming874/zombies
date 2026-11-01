// 回合難度曲線(第 1~20+ 回合)與計分:數量、類型組成、血量倍率、生成節奏、特殊回合、連殺、回合獎勵、本機最佳紀錄。
// 這裡只決定「數字與組成」;出生點挑選與實際生成(pickSpawn / spawnZombie)在 flow.js,由 AI 模組負責。
//
// 曲線設計(bot 實測:第 1~8 回合每回合約 50~95 秒):
//   1~4 回合:每回合引入一種新殭屍(行屍 → 狂奔者 → 爬行者 → 膿腫者 + 尖叫者),同場上限低、生成慢,讓玩家熟悉。
//   6~10 回合:第三波新類型依序登場(手術者 → 束縛病患 → 焦屍 → 潛行者 → 防護衣士兵),之後比例慢慢提高;
//   各新類型偏好在對應的區域出生(手術室/鍋爐房/太平間/隔離病房…,見 spawnAffinity)。
//   5、10、15、20… 首領回合:巨屍數 = 回合/5。
//   特殊回合([w4] 正典的招牌):第 6 波廣播(封院第 6 天的那一句)、第 8 波停電(那一層樓的燈具調暗、潛行者變多);
//   之後 13、18、23… 停電 / 狂奔 / 膿毒 輪流,11、16、21… 警鈴 / 廣播 輪流。效果(燈、警鈴、噪音)在 flow.js 的 _fx*。
//   5 回合起一般殭屍血量 +6%/回合,15 回合後再加速(第 10 回合 ×1.36、第 15 回合 ×1.66、第 20 回合 ×2.21),逼玩家升級武器與改裝。
//   同場上限 6 → 16(效能預算:16 隻時 game.update < 4ms)、生成間隔 1.9 → 0.6 秒。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- 回合類型 ----------
export const SPECIAL = {
  boss: { name: '最大的一波', sub: '最老的醒了 · 引他撞牆，再打頭', cls: 'red' },
  dark: { name: '停電的一波', sub: '這層樓的燈熄了，只剩緊急照明 · 潛行的會從暗處來，手電筒別關', cls: 'red' },
  rush: { name: '跑很快的一波', sub: '剛打第一針的人跑得最快 · 背靠牆角，別被包夾', cls: 'red' },
  swarm: { name: '會爆的一波', sub: '悶熱的晚上，脹氣的會出來 · 在遠處引爆膿腫者', cls: 'gold' },
  pa: { name: '廣播的一波', sub: '天花板的喇叭在叫人去大廳 · 牠們會從喇叭那邊過來', cls: 'gold' },
  alarm: { name: '警鈴的一波', sub: '火警鈴一直響 · 牠們來得又多又急', cls: 'red' },
};
const LATE3 = ['dark', 'rush', 'swarm'], LATE2 = ['alarm', 'pa'];
export function waveKind(n) {
  if (n >= 5 && n % 5 === 0) return 'boss';
  if (n === 6) return 'pa'; // 封院第 6 天:「鄭玉蘭護理長，請至一樓大廳。」
  if (n >= 8 && n % 5 === 3) return LATE3[((n - 8) / 5) % 3]; // 第 8 波 = 停電(正典招牌)
  if (n >= 11 && n % 5 === 1) return LATE2[((n - 11) / 5) % 2];
  return '';
}

// ---------- 數量與組成 ----------
// 8, 11, 14, 18, 22, 26, 30, 32(狂奔)、40, 45 … 第 15 回合 73、第 20 回合 103
export function waveCount(n) {
  const base = 5 + 3 * n + Math.floor(Math.min(n, 12) ** 2 / 10) + 3 * Math.max(0, n - 12);
  const k = waveKind(n);
  return Math.round(base * (k === 'rush' ? 0.9 : k === 'alarm' ? 1.12 : 1));
}
export function waveBrutes(n) {
  if (n < 5) return 0;
  if (n % 5 === 0) return n / 5; // 首領回合
  return n > 10 ? Math.floor((n - 6) / 5) : 0; // 第 11 回合起一般回合也會有巨屍
}
// 第三波新類型:[首次出現回合, 起始比例, 每回合增加, 上限]
export const NEW_MIX = {
  screamer: [4, 0.035, 0.004, 0.07],
  surgeon: [6, 0.05, 0.005, 0.1],
  straitjacket: [7, 0.05, 0.005, 0.1],
  burned: [8, 0.05, 0.005, 0.09],
  stalker: [9, 0.045, 0.005, 0.09],
  hazmat: [10, 0.035, 0.004, 0.07],
};
// 一般殭屍的比例(其餘為行屍;特殊類型總和過高時等比例縮小,行屍至少 15%)
export function waveMix(n) {
  const k = waveKind(n);
  let runner = n >= 2 ? Math.min(0.3, 0.06 + 0.025 * n) : 0;
  let crawler = n >= 3 ? Math.min(0.16, 0.07 + 0.012 * n) : 0;
  let bloater = n >= 4 ? Math.min(0.14, 0.02 + 0.013 * n) : 0;
  if (k === 'rush') { runner = Math.min(0.6, runner * 2); crawler *= 0.5; }
  else if (k === 'swarm') { bloater = 0.22; crawler = 0.3; runner *= 0.5; }
  else if (k === 'dark') { runner *= 0.75; crawler *= 1.2; }
  const m = { runner, crawler, bloater };
  for (const t in NEW_MIX) {
    const [from, base, per, max] = NEW_MIX[t];
    let v = n >= from ? Math.min(max, base + per * (n - from)) : 0;
    if (k === 'rush' && (t === 'straitjacket' || t === 'stalker')) v *= 1.5; // 狂奔之夜:衝撞與撲擊型也變多
    if (k === 'swarm' && (t === 'burned' || t === 'surgeon')) v *= 1.3;
    if (k === 'dark' && t === 'stalker') v = Math.max(v * 2, 0.1); // 停電:潛行者提早出現、比例 ×2
    if (k === 'alarm' && t === 'screamer') v *= 1.5;
    m[t] = v;
  }
  let sum = 0;
  for (const t in m) sum += m[t];
  if (sum > 0.85) for (const t in m) m[t] *= 0.85 / sum;
  m.walker = Math.max(0, 1 - Math.min(0.85, sum));
  return m;
}
// 首次出現的回合(保證至少一隻)
const INTRO = { 2: ['runner'], 3: ['crawler'], 4: ['bloater', 'screamer'], 6: ['surgeon'], 7: ['straitjacket'], 8: ['burned'], 9: ['stalker'], 10: ['hazmat'] };
// 每回合上限(尖叫者太多會一直暈眩)
const CAP = { screamer: 3 };

// 出怪清單:各類型依比例取整數量(不逐隻擲骰,避免某回合運氣差),洗牌;開場先出行屍暖身,巨屍放在回合中後段
export function waveRoster(n, rand = Math.random) {
  const count = waveCount(n), brutes = Math.min(waveBrutes(n), Math.max(1, Math.floor(count / 6)));
  const m = waveMix(n), rest = count - brutes;
  const num = {};
  for (const t in m) if (t !== 'walker') num[t] = Math.min(CAP[t] ?? 99, Math.round(rest * m[t]));
  for (const t of INTRO[n] || []) if (!num[t]) num[t] = 1;
  const list = [];
  for (const t in num) for (let i = 0; i < num[t]; i++) list.push(t);
  while (list.length < rest) list.push('walker');
  list.length = rest;
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  // 開場前兩隻換成行屍(狂奔之夜除外)
  if (waveKind(n) !== 'rush') {
    for (let i = 0; i < Math.min(2, list.length); i++) {
      if (list[i] === 'walker') continue;
      const j = list.findIndex((t, k) => k > 1 && t === 'walker');
      if (j > 0) [list[i], list[j]] = [list[j], list[i]];
    }
  }
  for (let k = 0; k < brutes; k++) list.splice(Math.floor(list.length * (0.35 + 0.5 * ((k + rand()) / brutes))), 0, 'brute');
  return list;
}

// 生成節奏:同場上限、平均間隔(秒)、開場連續快速生成數、第一隻出現前的延遲
export function wavePace(n) {
  const k = waveKind(n), rush = k === 'rush', alarm = k === 'alarm';
  return {
    maxAlive: Math.min(16, 5 + n + (rush || alarm ? 2 : 0)),
    interval: Math.max(0.6, 2.0 - 0.1 * n) * (rush ? 0.75 : alarm ? 0.7 : 1),
    burst: Math.min(5, 1 + Math.floor(n / 3)) + (rush || alarm ? 1 : 0),
    delay: n === 1 ? 4 : 2.5,
  };
}

// 一般殭屍血量倍率(巨屍已在 zombie.js 依回合 +60/回合,不再疊加)
export function hpMul(n, type) {
  if (type === 'brute' || n <= 4) return 1;
  return 1 + 0.06 * (n - 4) + 0.01 * Math.max(0, n - 15) ** 2;
}

// ---------- 經濟 ----------
export const restTime = (next) => (waveKind(next) === 'boss' ? 40 : 30); // 回合間休息秒數(首領回合前多 10 秒準備)
export const roundBonus = (n) => 20 + 10 * n; // 清場獎勵
export const cleanBonus = (n) => 10 + 5 * n; // 整回合沒受傷的額外獎勵

// ---------- 計分 ----------
export const POINTS = { walker: 100, runner: 130, crawler: 110, bloater: 160, brute: 1000, screamer: 150, stalker: 170, surgeon: 160, burned: 150, hazmat: 300, straitjacket: 140 };

// ---------- 出生區域偏好(flow.js 的 pickSpawn 加權用) ----------
// 新類型偏好出生在「合理」的地方:手術者在手術室/加護病房、焦屍在鍋爐/焚化爐、防護衣士兵在太平間/放射科/地下通道、
// 束縛病患在隔離病房、尖叫者在育嬰室/兒童病房/禮拜堂、潛行者在暗處的室內(要有天花板可以爬)
const AFF = {
  surgeon: { surgery: 5, icu: 3, er: 3, autopsy: 3, delivery: 2.5, ward: 1.5 },
  burned: { boiler: 5, incinerator: 5, machine: 3, pump: 2.5, laundry: 2.5 },
  hazmat: { morgue: 3, autopsy: 3, ossuary: 3, xray: 3, ct: 3, pharmacy: 2.5, tunnel: 2, dock: 2.5, ramp: 2, ambulance_bay: 2, parking: 1.5 },
  straitjacket: { psych_cell: 6, security: 2, dorm: 2, monitor: 2 },
  screamer: { nursery: 4, peds_ward: 4, playroom: 4, chapel: 3, ward: 2 },
  stalker: { tunnel: 3, archive: 3, supply: 3, stairwell: 2, corridor: 1.5, morgue: 2 },
};
export function spawnAffinity(type, s, L) {
  const A = AFF[type];
  if (!A) return 1;
  if (s._theme === undefined) s._theme = (L && L.zoneAt && L.zoneAt(s.level, s.c, s.r)?.theme) || '';
  let k = A[s._theme] || 1;
  if (type === 'stalker') { if (s.outdoor) k *= 0.25; if (s.dark) k *= 1.6; }
  return k;
}
export const HOW_MUL = { head: 1.5, melee: 2, explosion: 1.25 };
export const streakMul = (s) => 1 + 0.1 * clamp(s - 1, 0, 10); // 連殺倍率:每多一殺 +0.1,最高 ×2
export const roundScore = (n, clean) => Math.round(250 * n * (clean ? 1.5 : 1));
// 連殺門檻:[殺數, 字幕, 金幣獎勵]。[N6] 不再有「殺戮狂潮/死神降臨」這類稱號:他們曾經是病人。
// 字幕只在少數門檻出現、只說數字(空字串 = 只給錢,不出字);分數倍率與錢照舊
export const STREAKS = [[3, '', 0], [5, '', 10], [8, '一口氣倒下八個', 15], [12, '', 20], [16, '一口氣倒下十六個', 25], [20, '', 30]];
export function streakTier(s) {
  for (let i = STREAKS.length - 1; i >= 0; i--) if (s === STREAKS[i][0]) return STREAKS[i];
  if (s > 20 && s % 5 === 0) return [s, s % 10 === 0 ? `一口氣倒下 ${s} 個` : '', 30];
  return null;
}

// ---------- 本機最佳紀錄(localStorage;隱私模式/被封鎖時安靜失敗) ----------
const BEST_KEY = 'shh.best.v1';
const bestKey = (scope) => (scope ? `${BEST_KEY}:${scope}` : BEST_KEY); // scope = 地圖 id(多地圖時各自記錄)
export function loadBest(scope = '') {
  try {
    const b = JSON.parse(localStorage.getItem(bestKey(scope)) || 'null');
    return b && typeof b === 'object' ? b : null;
  } catch { return null; }
}
// 回傳 { best(更新後), prev(更新前), isNew: { score, round, kills, streak } }
export function saveBest(run, scope = '') {
  const prev = loadBest(scope);
  const best = { ...(prev || {}) };
  const isNew = {};
  for (const k of ['score', 'round', 'kills', 'streak', 'time']) {
    if (!(run[k] > (prev?.[k] ?? -1))) continue;
    best[k] = run[k];
    if (prev && k !== 'time') isNew[k] = true;
  }
  if (isNew.score || !prev) best.date = Date.now();
  best.runs = (prev?.runs || 0) + 1;
  try { localStorage.setItem(bestKey(scope), JSON.stringify(best)); } catch { /* 略過 */ }
  return { best, prev, isNew };
}
