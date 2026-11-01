// 驚嚇導演(本機,每位玩家各自一套):依張力、回合階段、冷卻與「驚嚇強度」設定決定什麼時候可以嚇人。
// 原則:
//  - 安靜的時間累積「恐懼值」(dread),累積夠了才放事件;戰鬥中只允許極輕的東西(耳語、聲音)。
//  - 大場面(停電、燈一盞盞熄滅、身後的人影)保留給回合間休息與探索,不在打鬥中;大場面進行中拒絕所有其他驚嚇。
//  - 兩個相位不再完全分開(GAMEPLAY_AUDIT §4.1):打鬥中的空檔(張力低、回合開始 20 秒後)可以有少數幾個「小」鬼事件
//    (FIGHT_GHOST,每一波 FIGHT_BUDGET 個、間隔 35 秒);休息中有少數幾個跟殭屍有關的節拍(習慣群醒來、禁忌的伏擊、
//    裝死的那邊傳來動靜;KINDS 的 rest:true,每次休息 REST_BEATS 個)。戰鬥還是讀得清楚:不遮聲音、不關燈、不改門。
//  - 跳嚇(jump)之間有全域冷卻,不連發;大場面之後有一段「喘息」。
//  - 開局 60 秒內不閃燈、不放大場面(只有耳語與環境音)。
//
// 給其他模組的穩定介面(ambush 代理等;呼叫端請用 game.horror?.director 防護):
//   director.request(kind, { weight = 1, pos }) → true = 現在可以放這種驚嚇(已套用全域冷卻、張力節奏、大場面鎖)
//   director.notify(kind, { weight, pos })      → 記錄「剛剛嚇過了」(request 回傳 true 後真的放了就呼叫)
//   kind:'ambush' | 'ceilingDrop'(伏擊代理)、'chase'(殭屍代理的追逐)、以及本模組自己的種類(見 KINDS)
//   追逐:request('chase') → 開始時 notify('chase', { dur }) 鎖住其他驚嚇 dur 秒 → 結束時 notify('chaseEnd', { calm = 20 })
//        (或 director.chaseEnd({ calm })):解鎖,calm 秒內不放鬼;director.chasing → 追逐中
//   director.level      → 'off' | 'low' | 'normal' | 'high'(設定 驚嚇強度)
//   director.tension    → 0..1(戰鬥張力:最近殭屍距離、場上數量、血量、剛受傷)
//   director.dread      → 0..100(安靜累積的恐懼值)
//   director.bigActive  → 大場面進行中
//   director.act        → 1..3 這一局進行到第幾幕(回合與時間;越後面越正面)
//   director.weight(kind) → 疲勞後的權重倍率(同一種用過越多次越低、同一類連續出現降權)
// 驚嚇強度 'off' 時 request 一律回傳 false(呼叫端應退回一般行為,例如伏擊改成普通出怪)。

// 每種驚嚇:tier 層級(small 背景 / medium 看得見的事件或伏擊 / big 演出)、cd 這種本身的冷卻(秒,normal 強度)、
// jump 算不算「跳嚇」(跳嚇之間有全域間隔)、act 最早第幾幕(1:有人在 → 2:看得見的痕跡 → 3:正面遭遇)、
// cat 分類(同一類連續出現會降權:疲勞)、w 基本權重(index.js 挑事件用)
export const KINDS = {
  // 外部(伏擊代理、新殭屍)
  ambush: { tier: 'medium', cd: 28, jump: true, ext: true, act: 1, cat: 'host' },
  ceilingDrop: { tier: 'medium', cd: 40, jump: true, ext: true, act: 1, cat: 'host' },
  // 休息時的「習慣群」醒來(src/zombies/ambush.js):玩家自己的行為造成的(背對、開槍、太大聲),不看恐懼值與層級間隔,
  // 只看大場面鎖、跳嚇間隔與每次休息的預算(REST_BEATS)
  habit: { tier: 'medium', cd: 10, jump: true, ext: true, act: 1, cat: 'host', rest: true },
  zbeat: { tier: 'small', cd: 25, ext: true, act: 1, cat: 'host', rest: true }, // 休息時:裝死的那邊傳來一點動靜(腳步、悶響)
  // ---- small ----
  whisper: { tier: 'small', cd: 14, act: 1, cat: 'voice', w: 1.1 },
  ambient: { tier: 'small', cd: 35, act: 1, cat: 'sound', w: 0.8 },
  flicker: { tier: 'small', cd: 60, act: 2, cat: 'light', w: 0.35 },
  signal: { tier: 'small', cd: 40, act: 1, cat: 'light' }, // 殭屍靠近時附近的燈閃一下
  crawl: { tier: 'small', cd: 70, act: 1, cat: 'sound', w: 0.6 },
  silence: { tier: 'small', cd: 90, act: 2, cat: 'sound', w: 0.4 },
  lullaby: { tier: 'small', cd: 120, act: 1, cat: 'device', w: 0.5 },
  radioOn: { tier: 'small', cd: 100, act: 1, cat: 'device', w: 0.45 },
  phoneRing: { tier: 'small', cd: 110, act: 1, cat: 'device', w: 0.55 },
  underDoor: { tier: 'small', cd: 80, act: 1, cat: 'door' },
  pace: { tier: 'small', cd: 75, act: 1, cat: 'presence', w: 1.0 },
  knockFollow: { tier: 'small', cd: 90, act: 2, cat: 'presence', w: 0.8 },
  breathBehind: { tier: 'small', cd: 80, act: 1, cat: 'presence', w: 0.7 },
  circle: { tier: 'small', cd: 110, act: 2, cat: 'voice', w: 0.6 },
  runBehind: { tier: 'small', cd: 90, act: 1, cat: 'presence', w: 0.7 },
  gurneyPass: { tier: 'small', cd: 100, act: 1, cat: 'sound', w: 0.6 },
  nurseCall: { tier: 'small', cd: 110, act: 1, cat: 'device', w: 0.6 },
  paHijack: { tier: 'small', cd: 150, act: 2, cat: 'device', w: 0.6 },
  doorClose: { tier: 'small', cd: 80, act: 1, cat: 'door', w: 0.8 },
  // ---- medium ----
  door: { tier: 'medium', cd: 50, jump: true, act: 2, cat: 'door', w: 0.5 },
  doorCreep: { tier: 'medium', cd: 60, act: 1, cat: 'door', w: 0.7 },
  doorOpen: { tier: 'medium', cd: 70, act: 1, cat: 'door', w: 1.0 },
  cart: { tier: 'medium', cd: 60, act: 1, cat: 'object', w: 0.5 },
  rollToward: { tier: 'medium', cd: 80, act: 2, cat: 'object', w: 0.6 },
  moveBehind: { tier: 'medium', cd: 70, act: 2, cat: 'object', w: 0.7 },
  throw: { tier: 'medium', cd: 110, jump: true, act: 2, cat: 'object', w: 0.7 },
  footprints: { tier: 'medium', cd: 90, act: 2, cat: 'trace', w: 0.85 },
  handprints: { tier: 'medium', cd: 90, act: 2, cat: 'trace', w: 0.8 },
  writing: { tier: 'medium', cd: 100, act: 2, cat: 'trace', w: 0.8 },
  coldBreath: { tier: 'medium', cd: 90, act: 1, cat: 'cold', w: 0.6 },
  tvFace: { tier: 'medium', cd: 110, act: 2, cat: 'device', w: 0.6 },
  elevator: { tier: 'medium', cd: 140, act: 1, cat: 'device', w: 0.55 },
  anchor: { tier: 'medium', cd: 40, act: 1, cat: 'device', w: 0.7 },
  fall: { tier: 'medium', cd: 70, jump: true, act: 2, cat: 'object', w: 0.4 },
  cellKnock: { tier: 'medium', cd: 120, act: 2, cat: 'presence', w: 0.9 },
  rollcall: { tier: 'medium', cd: 300, act: 2, cat: 'presence', w: 1.5 },
  figure: { tier: 'medium', cd: 80, act: 2, cat: 'figure', w: 1.1 },
  window: { tier: 'medium', cd: 90, act: 2, cat: 'figure', w: 0.8 },
  child: { tier: 'medium', cd: 100, act: 2, cat: 'figure', w: 0.6 },
  nurse: { tier: 'medium', cd: 120, act: 2, cat: 'figure', w: 0.8 },
  curtain: { tier: 'medium', cd: 90, act: 2, cat: 'figure', w: 0.9 },
  mirror: { tier: 'medium', cd: 90, act: 2, cat: 'figure', w: 1.2 },
  peripheral: { tier: 'medium', cd: 100, act: 2, cat: 'figure', w: 0.8 },
  flashFlick: { tier: 'medium', cd: 130, act: 2, cat: 'figure', w: 1.0 },
  reflection: { tier: 'medium', cd: 120, act: 2, cat: 'figure', w: 1.2 },
  apparition: { tier: 'medium', cd: 80, act: 1, cat: 'figure' }, // 劇情組用的通稱(STORY.md §12)
  call: { tier: 'small', cd: 0, act: 1, cat: 'device' }, // 接起電話之後的來電腳本(玩家觸發,只記錄)
  // ---- big(第三幕) ----
  behind: { tier: 'big', cd: 150, jump: true, act: 3, cat: 'figure', w: 1 },
  lightsDie: { tier: 'big', cd: 170, act: 3, cat: 'light', w: 1.1 },
  blackout: { tier: 'big', cd: 200, act: 3, cat: 'light', w: 0.5 },
  creeper: { tier: 'big', cd: 240, jump: true, act: 3, cat: 'figure', w: 1.2 },
  doorSlamSeq: { tier: 'big', cd: 240, jump: true, act: 3, cat: 'door', w: 0.9 },
  blackoutChange: { tier: 'big', cd: 260, act: 3, cat: 'light', w: 1.0 },
  // ---- 第三輪(src/horror/haunts.js;劇情回報見 lines.js STORY3)----
  frostEdge: { tier: 'small', cd: 110, act: 1, cat: 'cold', w: 0.7 },
  flatline: { tier: 'small', cd: 130, act: 1, cat: 'device', w: 0.7 },
  radio1999: { tier: 'small', cd: 360, act: 1, cat: 'device', w: 0.6 },
  whistle: { tier: 'small', cd: 240, act: 1, cat: 'sound', w: 0.5 },
  shadowPass: { tier: 'medium', cd: 110, act: 1, cat: 'presence', w: 0.9 },
  nameCall: { tier: 'medium', cd: 300, act: 2, cat: 'voice', w: 0.8 },
  swingBulb: { tier: 'medium', cd: 160, act: 2, cat: 'light', w: 0.8 },
  darkFollow: { tier: 'medium', cd: 180, act: 2, cat: 'light', w: 0.8 },
  curtainDraw: { tier: 'medium', cd: 130, act: 2, cat: 'figure', w: 0.9 },
  beamFigure: { tier: 'medium', cd: 140, act: 2, cat: 'figure', w: 1.0 },
  ballRoll: { tier: 'medium', cd: 200, act: 2, cat: 'object', w: 0.7 },
  windowFog: { tier: 'medium', cd: 150, act: 2, cat: 'trace', w: 0.8 },
  redEnvelope: { tier: 'medium', cd: 300, act: 2, cat: 'object', w: 0.6 },
  shoulderTap: { tier: 'medium', cd: 260, jump: true, act: 2, cat: 'presence', w: 0.6 },
  touqi: { tier: 'medium', cd: 9999, act: 1, cat: 'figure' }, // 頭七:第 7 次靜默期由 index.js 指定(不進隨機清單)
  corridorOut: { tier: 'big', cd: 420, act: 2, cat: 'light', w: 1.2 }, // 走廊一路熄燈(罕見)
  windowFace: { tier: 'big', cd: 360, jump: true, bj: true, act: 2, cat: 'figure', w: 0.9 },
  doorBurst: { tier: 'big', cd: 360, jump: true, bj: true, act: 2, cat: 'door', w: 0.9 },
  mirrorRush: { tier: 'big', cd: 360, jump: true, bj: true, act: 2, cat: 'figure', w: 0.8 },
  memory: { tier: 'small', cd: 0, act: 1, cat: 'memory' }, // 回憶(memories.js 自己排;這裡只記錄)
  // 殭屍代理的追逐(外部):request('chase') → notify('chase', { dur }) 期間鎖住其他驚嚇;結束 notify('chaseEnd', { calm })
  chase: { tier: 'small', cd: 60, ext: true, act: 1, cat: 'host' },
};
// bj:大跳嚇。每一幕最多一個(驚嚇強度「高」不限)
for (const k of ['behind', 'creeper', 'doorSlamSeq']) KINDS[k].bj = true;
const TIER = {
  small: { dread: 16, cost: 12, gap: 22 },
  medium: { dread: 40, cost: 34, gap: 45 },
  big: { dread: 75, cost: 100, gap: 150 },
};
// 驚嚇強度:rate 恐懼累積倍率、cd 冷卻倍率、big 允許大場面、medium 允許看得見的事件
export const INTENSITY = {
  off: { rate: 0, cd: 99, medium: false, big: false },
  low: { rate: 0.5, cd: 1.8, medium: true, big: false },
  normal: { rate: 1, cd: 1, medium: true, big: true },
  high: { rate: 1.6, cd: 0.65, medium: true, big: true },
};
export const LEVELS = ['off', 'low', 'normal', 'high'];
const CALM_START = 60; // 開局多少秒內不放 medium/big 與閃燈
const REST_BEATS = { off: 0, low: 1, normal: 3, high: 4 }; // 每次休息最多幾個「跟殭屍有關」的節拍(習慣群醒來、禁忌的伏擊、動靜)
// 打鬥中可以有的小鬼事件:只出聲音、裝置、一閃的燈或邊緣的霜,不遮戰鬥的聲音(不放 silence、runBehind)、不關燈、不動門
export const FIGHT_GHOST = new Set(['whisper', 'flicker', 'lullaby', 'phoneRing', 'nurseCall', 'paHijack', 'frostEdge', 'flatline', 'pace', 'knockFollow']);
const FIGHT_BUDGET = { off: 0, low: 1, normal: 2, high: 3 }; // 每一波最多幾個
const LIGHT_KINDS = new Set(['flicker', 'signal', 'lightsDie', 'blackout', 'blackoutChange', 'swingBulb', 'darkFollow', 'corridorOut']);
// 誘集期間(回合進行中)也可以有的:不是鬼的東西(宿主、伏擊、殭屍靠近的閃燈、天花板裡的爬行)。
// 其他全部是「鬼」:只在靜默期(回合之間的休息)出現(STORY.md §1.9、§4.2、§12)
export const FIGHT_OK = new Set(['ambient', 'signal', 'crawl', 'ambush', 'ceilingDrop', 'chase']);

export class Director {
  constructor(horror) {
    this.h = horror;
    this.t = 0; // 本局經過時間(遊戲時間,暫停不走)
    this.dread = 0;
    this.tension = 0;
    this.calm = 0; // 連續多少秒沒有殭屍在 14m 內
    this.bigUntil = 0;
    this.last = {}; // kind → 上次時間
    this.lastTier = { small: -1e9, medium: -1e9, big: -1e9 };
    this.lastJump = -1e9;
    this.roundT = 0; // 本回合(或本次休息)開始後的秒數
    this.phase = 'fighting';
    this.log = [];
    this.fired = 0;
    this.denied = 0;
    this.uses = {}; // 這一局每種用了幾次(疲勞)
    this.lastAny = -1e9; // 上一個(非耳語)驚嚇的時間
    this.recent = []; // 最近的驚嚇 [{ kind, cat, t }]
    this.bigJumps = {}; // 幕 → 這一幕放過幾個大跳嚇
    this.calmUntil = 0; // 追逐結束後的喘息(這段時間不放鬼)
    this.chaseUntil = 0;
    this.restBeats = 0; // 這次休息用掉幾個殭屍節拍
    this.fightGhosts = 0; // 這一波用掉幾個小鬼事件
    this.lastFightGhost = -1e9;
  }
  // 第幾幕:第 1~2 回合 = 1(有人在)、3~5 = 2(看得見的痕跡)、6 以後 = 3(正面遭遇);靜默期拖很久也會往後推
  get act() {
    const r = this.h.game?.round || 1;
    let a = r <= 2 ? 1 : r <= 5 ? 2 : 3;
    if (this.t > 900) a = Math.max(a, 3); else if (this.t > 420) a = Math.max(a, 2);
    return a;
  }
  // 疲勞:同一種用過 n 次 → 1/(1+0.9n);和最近兩次同一類 → ×0.35;剛剛(60 秒內)同一類 → ×0.6
  weight(kind) {
    const K = KINDS[kind] || {};
    let w = 1 / (1 + 0.9 * (this.uses[kind] || 0));
    const r = this.recent, n = r.length;
    if (K.cat && n >= 2 && r[n - 1].cat === K.cat && r[n - 2].cat === K.cat) w *= 0.35;
    else if (K.cat && n && r[n - 1].cat === K.cat && this.t - r[n - 1].t < 60) w *= 0.6;
    return w;
  }
  get level() {
    const s = this.h.settings?.get?.('scare');
    if (this.h.game?.net?.pvp) return s === 'off' ? 'off' : 'low'; // 對戰:只留背景(非正史模擬戰,不要干擾對打)
    return LEVELS.includes(s) ? s : 'normal';
  }
  get I() { return INTENSITY[this.level]; }
  get bigActive() { return this.t < this.bigUntil; }
  // 靜默期:回合之間的休息(誘集器關閉);多人時連線層的 'wait' 也算
  get silent() { const ph = this.h.game?.phase; return ph === 'shop' || ph === 'break' || ph === 'wait'; }
  // 新的一局
  reset() {
    this.t = 0; this.dread = 0; this.tension = 0; this.calm = 0; this.bigUntil = 0; this.roundT = 0;
    this.last = {}; this.lastTier = { small: -1e9, medium: -1e9, big: -1e9 }; this.lastJump = -1e9; this.log.length = 0; this.uses = {}; this.recent.length = 0; this.lastAny = -1e9;
    this.bigJumps = {}; this.calmUntil = 0; this.chaseUntil = 0; this.restBeats = 0; this.fightGhosts = 0; this.lastFightGhost = -1e9;
  }
  // 每幀(遊戲中、非暫停):張力與恐懼值
  update(dt, game) {
    this.t += dt;
    const p = game.player;
    if (game.phase !== this.phase) { this.phase = game.phase; this.roundT = 0; this.restBeats = 0; if (game.phase === 'fighting') this.fightGhosts = 0; } else this.roundT += dt;
    let near = 99, alive = 0;
    for (const z of game.zombies) if (z.alive) { alive++; if (z.dist < near) near = z.dist; }
    const hp = p.hp / (p.maxHp || 100), hurt = Math.max(0, 1 - (game.time - (p.lastHurt ?? -99)) / 3);
    const tz = Math.max(0, Math.min(1, 1 - (near - 2) / 14));
    const tgt = Math.min(1, tz * 0.75 + Math.min(1, alive / 10) * 0.15 + Math.max(0, 0.35 - hp) * 1.2 + hurt * 0.4);
    this.tension += (tgt - this.tension) * Math.min(1, dt * (tgt > this.tension ? 4 : 0.8));
    this.calm = near < 14 ? 0 : this.calm + dt;
    // 恐懼:安靜時累積(休息時間、探索更快),戰鬥張力高時停止
    const quiet = this.tension < 0.25 ? 1 : this.tension < 0.5 ? 0.3 : 0;
    const phaseK = game.phase === 'shop' || game.phase === 'break' ? 1.5 : this.calm > 10 ? 1.2 : 0.7;
    const esc = 1 + Math.min(1, this.t / 900) * 0.6 + Math.min(10, game.round || 0) * 0.04; // 一局越後面累積越快
    this.dread = Math.min(100, this.dread + dt * quiet * phaseK * esc * this.I.rate * 1.15);
  }
  // 現在能不能放某層級的驚嚇(不看種類冷卻)
  allowTier(tier, game, skipGap = false) {
    const I = this.I;
    if (I.rate <= 0) return false;
    if (this.h.game?.net?.pvp && tier !== 'small') return false; // 對戰:只留背景
    if (this.bigActive) return false;
    if (tier !== 'small' && !I.medium) return false;
    if (tier === 'big' && !I.big) return false;
    if (tier !== 'small' && this.t < CALM_START) return false;
    const T = TIER[tier];
    if (!skipGap && this.t - this.lastTier[tier] < T.gap * I.cd) return false;
    if (tier === 'big') { // 大場面:不在打鬥中;休息時間或長時間沒有殭屍靠近
      if (this.tension > 0.2) return false;
      const ph = game?.phase;
      if (!(ph === 'shop' || ph === 'break' || ph === 'wait')) return false;
      if (ph === 'shop' && this.roundT < 6) return false; // 「商店開放」橫幅期間不搶戲
    }
    if (tier === 'medium' && this.tension > 0.55) return false;
    return true;
  }
  // ---- 穩定介面 ----
  request(kind, o = {}) {
    const K = KINDS[kind] || { tier: 'medium', cd: 30, jump: true, ext: true };
    const game = this.h.game, I = this.I;
    const w = Math.max(0.2, o.weight ?? 1);
    const deny = () => { this.denied++; return false; };
    if (!game || game.state !== 'playing') return deny();
    if (K.rest && (!this.silent || this.restBeats >= (REST_BEATS[this.level] ?? 2))) return deny(); // 休息時的殭屍節拍:有預算
    if (!this.allowTier(K.tier, game, kind === 'whisper' || !!K.rest)) return deny(); // 耳語只看自己的冷卻(進新區域的那句不要被別的小事件擋掉)
    if (this.t - (this.last[kind] ?? -1e9) < K.cd * I.cd * w) return deny();
    if (K.jump && this.t - this.lastJump < (K.tier === 'big' ? 60 : 18) * I.cd * w) return deny(); // 跳嚇不連發
    if (K.jump && this.t - this.lastTier.big < 40 * I.cd) return deny(); // 大場面之後的喘息
    if (this.phase === 'fighting' && this.roundT < 6) return deny(); // 回合剛開始
    if (!K.ext && kind !== 'whisper' && kind !== 'call' && this.t - this.lastAny < (K.tier === 'small' ? 7 : 12) * I.cd) return deny(); // 任兩個驚嚇之間至少隔幾秒(不疊在一起)
    if (!this.silent && !FIGHT_OK.has(kind) && !this.fightGhostOk(kind)) return deny(); // 鬼只在靜默期(打鬥中的空檔例外:少數小事件)
    if (!K.ext && kind !== 'whisper' && kind !== 'call' && this.t < this.calmUntil) return deny(); // 追逐剛結束:喘口氣
    if (K.bj && this.level !== 'high' && (this.bigJumps[this.act] || 0) >= 1 && !o.force) return deny(); // 大跳嚇一幕一個
    if (!K.ext && !o.force && (K.act || 1) > this.act) return deny(); // 還沒到那一幕
    if (this.t < CALM_START && LIGHT_KINDS.has(kind)) return deny(); // 開局 60 秒內燈不閃
    // 恐懼值不夠:外部(伏擊)看得見的驚嚇只要求一半門檻(牠們本身就是戰鬥的一部分)
    const need = K.rest ? 0 : TIER[K.tier].dread * (K.ext ? 0.5 : 1) * Math.min(1.6, w);
    if (this.dread < need && !o.force) return deny();
    return true;
  }
  // 打鬥中的空檔可不可以放這個小鬼事件:回合開始 20 秒後、張力低(附近沒有活屍)、沒在追逐、這一波還有預算、上一個 35 秒前。
  // flow 有波內節奏(game._pace:高峰之後暫停出怪 8~15 秒)時,只排在暫停的那一段(那時張力門檻放寬到 0.5)
  fightGhostOk(kind) {
    if (!FIGHT_GHOST.has(kind) || this.phase !== 'fighting') return false;
    const pace = this.h.game?._pace, relax = !!pace && pace.relax > 0;
    if (pace && typeof pace.relax === 'number' && !relax) return false;
    if (this.roundT < 20 || this.tension > (relax ? 0.5 : 0.35) || this.chasing) return false;
    if (this.fightGhosts >= (FIGHT_BUDGET[this.level] ?? 1)) return false;
    return this.t - this.lastFightGhost >= 35 * this.I.cd;
  }
  notify(kind, o = {}) {
    if (kind === 'chaseEnd') return this.chaseEnd(o);
    const K = KINDS[kind] || { tier: 'medium', jump: true };
    if (!this.silent && !FIGHT_OK.has(kind) && FIGHT_GHOST.has(kind)) { this.fightGhosts++; this.lastFightGhost = this.t; }
    if (kind === 'chase') { this.chaseUntil = this.t + (o.dur ?? 30); this.hold(o.dur ?? 30); }
    if (K.bj) this.bigJumps[this.act] = (this.bigJumps[this.act] || 0) + 1;
    if (K.rest) this.restBeats++;
    const w = Math.max(0.2, o.weight ?? 1);
    this.last[kind] = this.t;
    this.lastTier[K.tier] = this.t;
    this.uses[kind] = (this.uses[kind] || 0) + 1;
    if (!K.ext && kind !== 'whisper' && kind !== 'call') this.lastAny = this.t;
    this.recent.push({ kind, cat: K.cat || 'other', t: this.t });
    if (this.recent.length > 8) this.recent.shift();
    if (K.jump) this.lastJump = this.t;
    this.dread = Math.max(0, this.dread - TIER[K.tier].cost * w);
    if (K.tier === 'big') this.bigUntil = this.t + (o.dur ?? 12);
    this.fired++;
    this.log.push(`${this.t.toFixed(1)}:${kind}`);
    if (this.log.length > 40) this.log.shift();
    this.h.emit?.('scare', { kind, tier: K.tier, pos: o.pos || null });
  }
  // 大場面:演出期間鎖住其他驚嚇
  hold(sec) { this.bigUntil = Math.max(this.bigUntil, this.t + sec); }
  // 追逐結束(殭屍代理):解開追逐的鎖,calm 秒內不放鬼、恐懼值壓到 35 以下(不要一逃完就被嚇)
  chaseEnd(o = {}) {
    if (this.chaseUntil > this.t) { this.bigUntil = Math.min(this.bigUntil, this.t); this.chaseUntil = this.t; }
    this.calmUntil = this.t + (o.calm ?? 20);
    this.dread = Math.min(this.dread, 35);
    return true;
  }
  get chasing() { return this.t < this.chaseUntil; }
  stats() { return { level: this.level, act: this.act, t: +this.t.toFixed(1), dread: +this.dread.toFixed(1), tension: +this.tension.toFixed(2), calm: +this.calm.toFixed(1), big: this.bigActive, chase: this.chasing, bigJumps: { ...this.bigJumps }, restBeats: this.restBeats, fightGhosts: this.fightGhosts, fired: this.fired, denied: this.denied, log: this.log.slice(-10) }; }
}
