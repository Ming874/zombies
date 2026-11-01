// 殭屍類型數值表(血量、速度、攻擊、金幣…集中在這裡調整)
export const TYPES = {
  walker: {
    name: '行屍', hp: 150, speed: [0.95, 1.4], coins: 6, radius: 0.34, mass: 1, reach: 1.05, dmg: 10, cd: 1.5, turn: 6,
  },
  runner: {
    name: '狂奔者', hp: 90, speed: [3.9, 4.5], coins: 8, radius: 0.32, mass: 0.9, reach: 1.0, dmg: 6, cd: 1.0, turn: 10,
    lunge: { min: 2.2, max: 4.2, speed: 7.6, dmg: 14, cd: [2.5, 4.5] },
  },
  crawler: {
    name: '爬行者', hp: 80, speed: [1.35, 1.7], coins: 7, radius: 0.3, mass: 0.7, reach: 1.0, dmg: 8, cd: 1.1, turn: 4,
  },
  bloater: {
    name: '膿腫者', hp: 220, speed: [0.75, 0.95], coins: 12, radius: 0.46, mass: 1.8, reach: 1.15, dmg: 8, cd: 1.6, turn: 3.5,
    spit: { min: 3.5, max: 14, cd: [3.2, 4.8], dmg: 15 }, explode: { radius: 3.2, player: 30, zombie: 80 },
  },
  brute: {
    name: '巨屍', hp: 900, speed: [1.1, 1.25], coins: 45, radius: 0.58, mass: 5, reach: 1.7, dmg: 25, cd: 2.2, turn: 3,
    charge: { min: 4.5, max: 15, speed: 7.4, dmg: 32, cd: [6, 9] }, bodyArmor: 0.55,
  },
  // ---- 第三波新增:行為在 src/zombies/behaviors/<type>.js、外觀在 src/zombies/looks.js ----
  // 順序決定連線的類型代碼(net/protocol.js 的 ZTYPES = Object.keys(TYPES)),只能往後加。
  // groan:閒置低吼間隔基準(秒);counter:首次出現時的對策提示
  screamer: { // 尖叫者:骨瘦如柴、下顎脫臼;保持距離尖叫 → 召來附近殭屍(加速直奔玩家)+ 玩家暈眩。脆弱,命中可打斷尖叫
    name: '尖叫者', hp: 70, speed: [1.7, 2.1], coins: 14, radius: 0.3, mass: 0.7, reach: 1.0, dmg: 7, cd: 1.2, turn: 7, groan: 5,
    scream: { min: 3.5, max: 20, cd: [9, 13], wind: 0.7, dur: 2.0, call: 30, frenzy: 6, daze: 11 },
    counter: '尖叫會召來屍群並讓你暈眩 · 優先射殺，命中可打斷尖叫',
  },
  stalker: { // 潛行者:四肢細長,在天花板上倒爬;被手電筒照到會尖嘶退開,繞到背後才撲下來
    name: '潛行者', hp: 120, speed: [2.7, 3.2], coins: 16, radius: 0.32, mass: 0.8, reach: 1.15, dmg: 16, cd: 1.3, turn: 9, groan: 6,
    pounce: { min: 1.5, max: 4.5, speed: 7.2, dmg: 22, cd: [3, 5] }, lit: { cone: 0.42, range: 20, flee: 1.4 },
    counter: '怕光 · 用手電筒照住他會退開，別讓他繞到背後',
  },
  surgeon: { // 手術者:縫著手術刀的病患,快速三連斬造成流血;連斬後有硬直空檔
    name: '手術者', hp: 170, speed: [2.0, 2.4], coins: 15, radius: 0.34, mass: 1, reach: 1.3, dmg: 7, cd: 1.7, turn: 8, groan: 4,
    combo: { hits: 3, gap: 0.22 }, bleed: { dps: 4, t: 5 },
    counter: '三連斬會讓你流血 · 拉開距離，趁連斬後的空檔反擊',
  },
  burned: { // 焦屍:全身焦黑冒煙;接觸會燒傷(持續傷害)、身邊有熱浪;爆炸傷害加倍,子彈打焦殼稍弱
    name: '焦屍', hp: 160, speed: [1.25, 1.55], coins: 13, radius: 0.35, mass: 1, reach: 1.1, dmg: 9, cd: 1.4, turn: 6, groan: 4,
    burn: { dps: 5, t: 3, aura: 1.4, auraDps: 5 }, blastMul: 2.2, bulletMul: 0.85,
    counter: '別讓他貼身（會燒傷） · 爆炸傷害加倍',
  },
  hazmat: { // 清理隊員(萬嵐白天清理隊):防護衣與防彈板讓子彈打身體效果差;防毒面具(頭)是弱點;掉落較好的物資
    name: '清理隊員', hp: 360, speed: [1.0, 1.2], coins: 32, radius: 0.38, mass: 1.6, reach: 1.15, dmg: 16, cd: 1.8, turn: 4.5, groan: 5,
    bodyArmor: 0.35, maskMul: 1.4,
    counter: '防護衣擋子彈 · 瞄準防毒面具',
  },
  straitjacket: { // 束縛病患:雙臂綁在胸前,用頭撞;蹲低後低頭狂奔衝撞(撞牆會暈眩),撞得開輕道具
    name: '束縛病患', hp: 140, speed: [1.45, 1.75], coins: 12, radius: 0.33, mass: 1.1, reach: 0.95, dmg: 12, cd: 1.3, turn: 7, groan: 3.5,
    charge: { min: 3, max: 11, speed: 6.6, dmg: 20, cd: [4, 6.5] },
    counter: '蹲低就是要衝撞 · 側閃讓他撞牆，趁暈眩爆頭',
  },
  // 追逐戰專用(src/zombies/chase.js 生成,不在出怪表裡):殺不死,子彈只會讓他踉蹌/變慢;比走路快、比衝刺慢
  pursuer: {
    name: '追獵者', hp: 99999, speed: [4.1, 4.1], coins: 0, radius: 0.36, mass: 3, reach: 1.25, dmg: 0, cd: 1, turn: 10, groan: 3, chaseOnly: true,
    burst: 4.7, catchDmg: 45,
  },
};

// 第 n 回合的出怪清單:第 1 回合只有行屍,之後逐步加入新類型(首次出現的回合保證至少一隻)
// 地圖是 4 層約 17000m²:每回合數量隨回合加速成長,搭配 pace() 的同場上限與生成間隔讓節奏保持緊湊
export function roster(n) {
  const count = 5 + 3 * n + Math.floor((n * n) / 10); // 8, 11, 14, 18, 22, 26, 30, 35 … 第 10 回合 45
  const brutes = n >= 5 ? 1 + Math.floor((n - 5) / 4) : 0;
  const pr = n >= 2 ? Math.min(0.32, 0.08 + 0.03 * n) : 0;
  const pc = n >= 3 ? 0.13 : 0;
  const pb = n >= 4 ? Math.min(0.15, 0.04 + 0.015 * n) : 0;
  const list = [];
  for (let i = 0; i < count - brutes; i++) {
    const r = Math.random();
    list.push(r < pr ? 'runner' : r < pr + pc ? 'crawler' : r < pr + pc + pb ? 'bloater' : 'walker');
  }
  const intro = { 2: 'runner', 3: 'crawler', 4: 'bloater' }[n];
  if (intro && !list.includes(intro)) list[1 + Math.floor(Math.random() * (list.length - 1))] = intro;
  for (let k = 0; k < brutes; k++) list.splice(Math.floor(list.length * (0.35 + 0.5 * Math.random())), 0, 'brute');
  return list;
}

// 第 n 回合的節奏:同場上限、平均生成間隔(秒)、開場連續快速生成的數量
export function pace(n) {
  return {
    maxAlive: Math.min(16, 7 + n),
    interval: Math.max(0.55, 1.75 - 0.1 * n),
    burst: Math.min(5, 2 + Math.floor(n / 3)),
  };
}
