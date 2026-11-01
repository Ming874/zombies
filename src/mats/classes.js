// 表面類別(物品材質):道具/互動物件的純色材質依「類別」決定細節(烤漆掉漆、不鏽鋼拉絲、木紋、布紋、皮紋、灰塵、指紋…)。
// 類別存在每個頂點的 UV 編碼裡(src/mats/encode.js),著色器(src/mats/surface.js)依類別查參數表 → 不需要額外材質或 draw call。
// 參數(每類 4 個 vec4):
//  P0 反照率亮度下限、上限(線性;金屬 = F0)、金屬度、基礎粗糙度(< 0 = 用材質本身的)
//  P1 粗糙度起伏、指紋/油污、刮痕、積灰
//  P2 邊角磨損寬度(公尺)、磨損型態、紋理型態、紋理一格幾公尺
//  P3 凹凸深度(公尺)、色塊斑駁、次表面暖光(包覆光)、髒污
export const WEAR = { NONE: 0, CHIP: 1, SCUFF: 2, POLISH: 3, VARNISH: 4, FRAY: 5, SHINE: 6, CHIPWOOD: 7 };
export const GRAIN = { NONE: 0, BRUSH: 1, WOOD: 2, WEAVE: 3, LEATHER: 4, PAPER: 5, CARD: 6, PEEL: 7, RUST: 8, PLUSH: 9, STONE: 10 };

const W = WEAR, G = GRAIN;
// [名稱, P0, P1, P2, P3]
const DEFS = [
  ['none', [0, 1, 0, -1], [0, 0, 0, 0], [0, 0, 0, 1], [0, 0, 0, 0]],
  // 烤漆鋼板(櫃子、置物櫃、病床床架、推車):漆是介電質;邊角掉漆露出底漆/鋼板,周圍一圈鏽
  ['enamel', [0.035, 0.56, 0, -1], [0.16, 0.35, 0.35, 1], [0.009, W.CHIP, G.PEEL, 0.5], [0.00003, 0.22, 0, 1]],
  // 不鏽鋼(拉絲):F0 ≈ 0.5,拉絲方向的粗糙度條紋、指紋
  ['steel', [0.42, 0.58, 0.82, 0.36], [0.16, 0.55, 0.3, 0.6], [0.004, W.POLISH, G.BRUSH, 0.35], [0.000012, 0.1, 0, 0.5]],
  // 鍍鉻(床欄、點滴架、輪椅):很亮、很滑,指紋與水漬
  ['chrome', [0.5, 0.62, 1, 0.12], [0.06, 0.85, 0.18, 0.5], [0, W.NONE, G.NONE, 1], [0.000006, 0.06, 0, 0.45]],
  // 互動物件的「金屬」:保留原本的明暗(深色鐵件、灰色機殼都有),拉絲 + 刮痕 + 邊角磨亮
  ['ixmetal', [0.1, 0.6, 0.8, -1], [0.18, 0.55, 0.45, 0.6], [0.004, W.POLISH, G.BRUSH, 0.3], [0.00001, 0.14, 0, 0.6]],
  ['alu', [0.5, 0.68, 0.82, 0.42], [0.2, 0.45, 0.5, 0.6], [0.004, W.POLISH, G.BRUSH, 0.25], [0.00001, 0.14, 0, 0.6]],
  // 黃銅/青銅/金:凹處氧化變暗,邊角被摸亮
  ['brass', [0.35, 0.6, 0.9, 0.36], [0.22, 0.6, 0.35, 0.6], [0.006, W.POLISH, G.PEEL, 0.4], [0.00001, 0.22, 0, 0.7]],
  ['iron', [0.2, 0.32, 0.75, 0.62], [0.2, 0.2, 0.3, 0.8], [0.005, W.POLISH, G.RUST, 0.4], [0.00012, 0.25, 0, 0.8]],
  ['rust', [0.04, 0.22, 0, 0.88], [0.12, 0, 0.1, 0.6], [0, W.NONE, G.RUST, 0.5], [0.0004, 0.35, 0, 0.9]],
  // 硬塑膠(椅子、儀器外殼):微橘皮、刮痕、邊角磨白
  ['plastic', [0.032, 0.56, 0, -1], [0.18, 0.5, 0.45, 0.8], [0.005, W.SCUFF, G.PEEL, 0.4], [0.00002, 0.18, 0, 0.85]],
  // 人造皮(座椅、床墊、診療台):皮紋,常坐的邊角變亮
  ['vinyl', [0.03, 0.55, 0, -1], [0.14, 0.4, 0.2, 0.6], [0.008, W.SHINE, G.LEATHER, 0.22], [0.00018, 0.14, 0, 0.7]],
  ['leather', [0.025, 0.4, 0, -1], [0.18, 0.25, 0.25, 0.6], [0.01, W.SCUFF, G.LEATHER, 0.3], [0.00022, 0.2, 0, 0.7]],
  // 布(床單、隔簾、制服):織紋,很粗糙
  // 白床單/白布上限 0.46(放了二十年、泛黃發灰;0.55 在手電筒下整片發白)
  ['fabric', [0.03, 0.46, 0, 0.92], [0.06, 0, 0, 0.4], [0.006, W.FRAY, G.WEAVE, 0.08], [0.00035, 0.16, 0, 0.8]],
  ['plush', [0.03, 0.55, 0, 0.98], [0.04, 0, 0, 0.6], [0, W.NONE, G.PLUSH, 0.12], [0.0005, 0.18, 0, 0.9]],
  // 上漆木材(桌子、長椅、衣櫃):木紋,邊角漆面磨掉變淺變粗
  ['wood', [0.03, 0.45, 0, -1], [0.14, 0.3, 0.35, 0.8], [0.006, W.VARNISH, G.WOOD, 0.9], [0.00012, 0.12, 0, 0.7]],
  ['woodraw', [0.03, 0.4, 0, 0.82], [0.12, 0, 0.2, 0.9], [0.008, W.VARNISH, G.WOOD, 0.8], [0.0003, 0.2, 0, 0.9]],
  // 上漆的木頭玩具/家具:漆掉了露出木頭
  ['paintwood', [0.035, 0.56, 0, -1], [0.14, 0.3, 0.4, 0.8], [0.007, W.CHIPWOOD, G.PEEL, 0.5], [0.00004, 0.14, 0, 0.8]],
  ['rubber', [0.03, 0.2, 0, 0.88], [0.08, 0, 0.2, 1], [0.004, W.SCUFF, G.PEEL, 0.3], [0.00006, 0.12, 0, 0.9]],
  ['paper', [0.25, 0.5, 0, 0.9], [0.06, 0.15, 0, 0.6], [0.004, W.FRAY, G.PAPER, 0.25], [0.00008, 0.12, 0, 0.8]],
  ['cardboard', [0.14, 0.42, 0, 0.94], [0.06, 0, 0, 0.8], [0.008, W.FRAY, G.CARD, 0.5], [0.00014, 0.22, 0, 0.9]],
  // 陶瓷/大理石(洗手台、馬桶、瓷像):釉面很滑,水漬與皂垢
  ['ceramic', [0.3, 0.62, 0, -1], [0.1, 0.55, 0.2, 0.6], [0.003, W.SCUFF, G.PEEL, 0.5], [0.00001, 0.12, 0, 0.9]],
  // 亮面(上亮漆的木頭、螢幕、深色玻璃、鏡子):指紋、灰塵
  ['gloss', [0.02, 0.58, 0, -1], [0.08, 0.8, 0.25, 0.7], [0.003, W.SCUFF, G.NONE, 1], [0.000006, 0.08, 0, 0.6]],
  ['wax', [0.25, 0.56, 0, 0.55], [0.12, 0.2, 0.1, 0.7], [0, W.NONE, G.STONE, 0.15], [0.00006, 0.12, 0.35, 0.6]],
  ['skin', [0.12, 0.48, 0, -1], [0.12, 0.3, 0.05, 0.5], [0.004, W.SCUFF, G.PEEL, 0.15], [0.00002, 0.12, 0.3, 0.6]],
  ['bone', [0.2, 0.5, 0, 0.6], [0.16, 0.1, 0.2, 0.7], [0.004, W.POLISH, G.STONE, 0.2], [0.0001, 0.22, 0.2, 0.9]],
  ['flesh', [0.02, 0.2, 0, 0.35], [0.3, 0.6, 0, 0], [0, W.NONE, G.STONE, 0.12], [0.0003, 0.3, 0.25, 0.6]],
  ['stone', [0.06, 0.55, 0, -1], [0.12, 0, 0.1, 0.9], [0.006, W.SCUFF, G.STONE, 0.5], [0.0002, 0.16, 0, 0.9]],
  // 粗糙的通用面(木頭/布/紙/粗塑膠,互動物件的 matte)
  ['matte', [0.03, 0.56, 0, -1], [0.1, 0.1, 0.15, 0.9], [0.005, W.SCUFF, G.STONE, 0.4], [0.00006, 0.16, 0, 0.8]],
  // 軟木/泡棉(r2 從 cardboard 分出來:紙箱的瓦楞、膠帶、印刷不能出現在軟木板上)
  ['corkfoam', [0.1, 0.45, 0, 0.94], [0.08, 0, 0, 0.6], [0.006, W.FRAY, G.STONE, 0.25], [0.00025, 0.2, 0, 0.8]],
];
export const CLASS = Object.fromEntries(DEFS.map((d, i) => [d[0], i]));
export const N_CLASS = 32; // uniform 陣列大小(5 位元)
export const CLASS_PARAMS = (() => {
  const a = new Float32Array(N_CLASS * 16);
  DEFS.forEach((d, i) => { for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) a[i * 16 + k * 4 + j] = d[k + 1][j]; });
  return a;
})();

// 材質庫鍵(src/map/materials.js 與 props/indoor/atlas.js 註冊的 pi_*)→ 類別
const RULES = [
  [/^(metal_(white|green|gray)|pi_enamel_\w+)$/, 'enamel'],
  [/^(steel|pi_steel|pi_galv)$/, 'steel'],
  [/^chrome$/, 'chrome'],
  [/^aluminum$/, 'alu'],
  [/^(bronze|pi_brass|pi_gold)$/, 'brass'],
  [/^cast_iron$/, 'iron'],
  [/^(rust|pi_rust|pi_rust_dark|pi_m_rust)$/, 'rust'],
  [/^(plastic_\w+|pi_pl_\w+)$/, 'plastic'],
  [/^(vinyl_seat|pi_vinyl_\w+|pi_lead_apron2?|pi_mattress|pi_m_mattress)$/, 'vinyl'],
  [/^(leather|pi_leather_\w+)$/, 'leather'],
  [/^(fabric_\w+|pi_fab_\w+|pi_gauze|pi_cloth_\w+|pi_m_linen)$/, 'fabric'],
  [/^pi_plush_\w+$/, 'plush'],
  [/^(wood_dark|wood_light)$/, 'wood'],
  [/^(wood_old)$/, 'woodraw'],
  [/^pi_wood_(red|blue|green|yellow|white)$/, 'paintwood'],
  [/^(rubber|tire|pi_rubber_\w+)$/, 'rubber'],
  [/^paper$/, 'paper'],
  [/^cardboard$/, 'cardboard'],
  [/^(pi_cork|pi_foam)$/, 'corkfoam'],
  [/^(pi_ceramic|marble)$/, 'ceramic'],
  [/^(screen_off|pi_film|pi_glass_dark|pi_glass_green|pi_glass_amber)$/, 'gloss'],
  [/^(candle_wax|pi_wax_red)$/, 'wax'],
  [/^pi_skin_\w+$/, 'skin'],
  [/^bone$/, 'bone'],
  [/^(flesh|pi_blood_dry)$/, 'flesh'],
  [/^(stone_statue|pi_plaster)$/, 'stone'],
];
const keyCls = new Map();
export function classOfKey(key) {
  if (!key) return 0;
  let c = keyCls.get(key);
  if (c !== undefined) return c;
  c = 0;
  for (const [re, n] of RULES) if (re.test(key)) { c = CLASS[n]; break; }
  keyCls.set(key, c);
  return c;
}
