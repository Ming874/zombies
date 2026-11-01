import * as THREE from 'three';
import { pbrTex, onPbrFail, PBR_SETS } from './pbr.js';
import { SURF as PROC, TRIM } from './texdefs.js';
import { procTextures, procClone } from './proctex.js';
import { wearTexture, WEAR_VERT_PARS, WEAR_VERT, WEAR_FRAG_PARS, WEAR_SETUP, WEAR_ALBEDO, WEAR_NORMAL } from './wear.js';
import { surfaceUniforms as SU } from '../../mats/surface.js';

// 結構表面材質(牆/地板/天花板/收邊)。多數用 CC0 PBR 貼圖組,以「色調 tint + 飽和度 sat + 縮放 tile + 旋轉 rot」
// 從同一組貼圖衍生出不同表面;沒有對應照片貼圖的(兒童壁紙、軟包、空心磚、地墊…)用程式貼圖。
// 幾何 UV 是世界座標公尺,頂點色疊上每面牆的色調與髒污漸層,頂點屬性 aWear 是每面牆/每區的破舊度。
// 所有結構材質共用一段著色器(wear.js):依世界座標疊上牆腳污漬、漏水潮痕、流痕、霉斑、地板髒污/積水、天花板水損,
// 不跟著貼圖重複 → 長走廊不會一眼看出平鋪。
// 欄位:pbr 貼圖組;tile 一張貼圖幾公尺;tint 乘色;gain 亮度倍率;sat 飽和度(0 = 灰階再染色);rough 粗糙度倍率;n 法線強度
//      wear [髒污, 水漬, 霉, 積水];cav AO 壓暗反照率(縫線/凹處);peel 剝落層 { set, tile, amt, scale, flake, tint, under, n }
//      gen 程式貼圖鍵(texdefs.js);fb PBR 載入失敗時改用的程式貼圖鍵
const S = (pbr, tile, o = {}) => ({ pbr, tile, ...o });
// 油漆牆:細緻灰泥(完整的漆面)+ 依世界雜訊與每面牆破舊度露出的剝落層(殘留漆片 + 底下的灰泥)
const PAINT = (tint, o = {}) => S('plaster_paint', 2.5, {
  tint, norm: 1, sat: 0.15, rough: 0.82, n: 0.7, cav: 0.25, fb: o.fb,
  peel: { set: 'paint_peeling', tile: 1.3, amt: o.peel ?? 0.55, scale: o.ps ?? 0.42, flake: 0.42, tint, under: o.under ?? 0xa29c8e, n: 1.2 }, // 底下的灰泥 ≈ 0.37(原本 0.25:剝落處像潑墨的黑斑)
  wear: o.wear ?? [0.85, 0.7, 0.45, 0], ...o,
});
// 亮光漆護牆(油性漆,有碎點與擦傷)
const GLOSS = (tint, o = {}) => S('gloss_paint', 1.6, { tint, norm: 1, sat: 0.12, rough: 0.55, n: 0.8, cav: 0.2, det: 0.4, wear: [0.9, 0.35, 0.35, 0], ...o });
// 方磁磚(12.5cm 舊釉面磚,原創貼圖 tools/textures/gen_tile.py),染色。tv: 12 = 每片從貼圖 12×12 片裡隨機挑一片 + 旋轉
// → 裂縫/缺角不會每 1.5m 重複;每片些微傾斜(法線)→ 反光一片一片不同。舊磚有一層灰膜:粗糙度比新釉面高
// 反照率:tint = 平均反照率(norm),舊白磚 ≈ 0.6(新的 0.8;手電筒近照時才不會整面燈箱似的發白)
const TILESQ = (tint, o = {}) => S('tile_sq', 1.5, { tint, norm: 1, sat: 0.25, rough: 1.3, n: 1, cav: 0.55, tv: 12, det: 0.3, wear: [0.8, 0.55, 0.4, 0], ...o });
export const SURFACES = {
  // ---- 牆:油漆(各種顏色;破舊度各異) ----
  paint_green: PAINT(0x9db8a2, { fb: 'paint_green' }),
  paint_mint: PAINT(0xb2d0c0, { fb: 'paint_mint', peel: 0.65 }),
  paint_olive: PAINT(0xb2b28a, { fb: 'paint_olive', peel: 0.6, wear: [0.95, 0.85, 0.55, 0] }),
  paint_white: PAINT(0xcdc9bd, { fb: 'paint_white' }), // 舊白漆 ≈ 0.6(手電筒近照不要整片發白)
  paint_sterile: PAINT(0xd3d5d1, { fb: 'paint_sterile', peel: 0.18, wear: [0.5, 0.35, 0.12, 0], rough: 0.6 }),
  paint_gray: PAINT(0xa4acb0, { fb: 'paint_gray', peel: 0.45 }),
  paint_cream: PAINT(0xd2c6a6, { fb: 'paint_cream', peel: 0.5 }),
  paint_blue: PAINT(0xa4bcd0, { fb: 'paint_blue', peel: 0.55 }),
  paint_pink: PAINT(0xdcb4b0, { fb: 'paint_pink', peel: 0.6 }),
  paint_yellow: PAINT(0xd0c090, { fb: 'paint_cream', peel: 0.7, wear: [1, 0.9, 0.5, 0] }), // 菸燻泛黃
  paint_ochre: PAINT(0xc4a676, { fb: 'paint_olive', peel: 0.55 }),
  // 護牆下段
  dado_green: GLOSS(0x4c7656, { fb: 'dado_green' }),
  dado_teal: GLOSS(0x3e6c68, { fb: 'dado_teal' }),
  dado_gray: GLOSS(0x6a7276, { fb: 'dado_gray', sat: 0.05 }),
  dado_rose: GLOSS(0x9c7680, { fb: 'dado_rose', sat: 0.05 }),
  dado_navy: GLOSS(0x38485e, { fb: 'dado_gray', sat: 0.05 }),
  dado_ox: GLOSS(0x763c32, { fb: 'dado_rose', sat: 0.05 }),
  dado_brown: S('wood_old', 1.6, { tint: 0x9a7a5e, rot: Math.PI / 2, wear: [0.8, 0.3, 0.3, 0] }),
  dado_wood: S('wood_panel', 2.1, { tint: 0xb89480, sat: 0.7, rough: 0.75, cav: 0.35, wear: [0.6, 0.3, 0.25, 0] }), // 木作凸板護牆
  dado_vinyl: S('plaster_paint', 2.5, { tint: 0xbab4a2, norm: 1, sat: 0.1, rough: 0.38, n: 0.35, wear: [0.9, 0.2, 0.2, 0] }), // 塑膠護牆板
  // 磁磚
  tile_white: TILESQ(0xcdd1c9, { fb: 'tile_white' }),
  tile_green: TILESQ(0x96c8ae, { fb: 'tile_green', sat: 0.45 }),
  tile_subway: { gen: 'tile_subway', wear: [0.8, 0.5, 0.35, 0] },
  tile_blue: TILESQ(0xa2bed2, { fb: 'tile_blue', sat: 0.4 }),
  tile_pink: TILESQ(0xd8b0ac, { fb: 'tile_pink', sat: 0.4 }),
  tile_cream: TILESQ(0xd2c5a8, { fb: 'tile_white', sat: 0.35 }),
  tile_long: S('tile_wall', 1.27, { tint: 0xf0ece0, cav: 0.5, wear: [0.8, 0.5, 0.35, 0] }), // 細長直磚
  // 灰泥/清水模/磚/石/木/壁紙
  plaster: S('plaster_paint', 3.0, { tint: 0xd4c8ae, norm: 1, sat: 0.2, rough: 0.9, n: 0.9, peel: { set: 'paint_peeling', tile: 1.6, amt: 0.35, scale: 0.3, flake: 0.42, tint: 0xe8dcc4, under: 0x9e9280, n: 1 } }),
  plaster_chapel: S('plaster', 2.6, { tint: 0xe0caa4, sat: 1, wear: [0.8, 0.9, 0.7, 0] }),
  plaster_dorm: S('plaster_mould', 2.4, { tint: 0xe8e2cc, gain: 1.35, sat: 0.35, wear: [0.8, 0.8, 0.7, 0] }),
  plaster_mould: S('plaster_mould', 2.4, { tint: 0xd8d4c0, gain: 1.4, sat: 0.6, wear: [1, 1, 1, 0] }),
  plaster_blue: S('plaster_blue', 2.4, { tint: 0xdce8e4, gain: 1.2, sat: 0.7, wear: [0.9, 0.8, 0.6, 0] }),
  plaster_damaged: S('plaster_damaged', 2.4, { tint: 0xe4dcd0, gain: 1.1, sat: 0.8, cav: 0.35, wear: [0.9, 0.8, 0.5, 0] }),
  wallpaper_old: S('wallpaper_old', 2.0, { tint: 0xd8c8b0, gain: 1.25, sat: 0.8, rough: 0.9, wear: [0.8, 0.9, 0.5, 0] }),
  marble_wall: { gen: 'marble_wall', wear: [0.6, 0.4, 0.2, 0] },
  concrete_wall: S('concrete_wall', 2.3, { tint: 0xbab4ac, wear: [1, 0.9, 0.6, 0] }),
  concrete_wet_wall: S('concrete_wet', 2.2, { tint: 0xa8a69e, rough: 0.55, wear: [1, 1, 0.9, 0] }),
  cmu_paint: { gen: 'cmu_paint', wear: [0.9, 0.7, 0.5, 0] },
  cmu_red: { gen: 'cmu_red', wear: [0.9, 0.7, 0.5, 0] },
  brick: S('brick', 1.5, { tint: 0x9a8c84, cav: 0.4, wear: [1, 0.8, 0.5, 0] }),
  brick_old: S('brick', 1.7, { tint: 0xa8a098, sat: 0.75, cav: 0.4 }),
  brick_white: S('brick_white', 2.0, { tint: 0xe4ddd0, gain: 1.15, sat: 0.55, cav: 0.4, wear: [1, 0.9, 0.7, 0] }),
  stone_wall: S('stone_wall', 2.5, { tint: 0xc8c0b0, cav: 0.4, wear: [1, 1, 0.9, 0] }),
  wood_panel: S('wood_panel', 2.1, { tint: 0x9c8070, sat: 0.65, rough: 0.9, cav: 0.35, wear: [0.6, 0.5, 0.3, 0] }),
  wallpaper_ducks: { gen: 'wallpaper_ducks', wear: [0.8, 0.8, 0.5, 0] },
  wallpaper_stars: { gen: 'wallpaper_stars', wear: [0.8, 0.8, 0.5, 0] },
  wallpaper_animals: { gen: 'wallpaper_animals', wear: [0.8, 0.8, 0.5, 0] },
  padded: { gen: 'padded', wear: [0.7, 0.4, 0.2, 0] },
  facade: S('plaster', 3.8, { tint: 0xa6a298, sat: 0.3, wear: [0.6, 0.8, 0.6, 0] }),
  facade_dark: S('concrete_wall', 2.4, { tint: 0x9a968e, wear: [0.6, 0.8, 0.6, 0] }),
  // ---- 地板 ----
  tile_ward: S('tile_ward', 1.8, { cav: 0.4, rough: 0.8, scuff: 0.8, wear: [0.9, 0, 0, 0] }), // 打過蠟的塑膠地磚:灰膜下仍有一點光澤(走道被踩亮處會反光)
  tile_ward_b: S('tile_lobby', 1.4, { tint: 0xd4ccbc, cav: 0.4, rough: 0.8, scuff: 0.8, wear: [0.8, 0, 0, 0] }),
  tile_lobby: S('tile_lobby', 2.0, { tint: 0xe4dccc, cav: 0.4, rough: 0.8, scuff: 0.8, wear: [0.8, 0, 0, 0] }),
  terrazzo: S('terrazzo', 1.1, { rough: 0.55, tint: 0xd8d2c8, scuff: 0.8, det: 0.3, wear: [0.7, 0, 0, 0] }),
  checker: S('checker_bw', 1.6, { tint: 0xe8e4dc, rough: 0.7, cav: 0.4, scuff: 0.8, det: 0.3, wear: [0.9, 0, 0, 0.15] }), // 黑白棋盤(餐廳)
  linoleum: S('linoleum', 2.0, { scuff: 0.8, tint: 0xb4c4b4, sat: 0.55 }),
  linoleum_b: S('linoleum', 2.3, { scuff: 0.8, tint: 0xd6c6a6, sat: 0.06, rot: Math.PI / 2 }),
  linoleum_c: S('linoleum', 2.2, { scuff: 0.8, tint: 0xa8b6c8, sat: 0.08 }),
  linoleum_d: S('linoleum', 2.0, { scuff: 0.8, tint: 0xd4aeaa, sat: 0.08, rot: Math.PI / 2 }),
  lino_sheet: { gen: 'linoleum', scuff: 0.9, wear: [0.85, 0, 0, 0] }, // 大理石紋塑膠布(病房)
  lino_sheet_b: { gen: 'linoleum_b', scuff: 0.9, wear: [0.85, 0, 0, 0] },
  lino_sheet_c: { gen: 'linoleum_c', scuff: 0.9, wear: [0.85, 0, 0, 0] },
  lino_sheet_d: { gen: 'linoleum_d', scuff: 0.9, wear: [0.85, 0, 0, 0] },
  lino_pattern: S('lino_pattern', 1.5, { scuff: 0.8, tint: 0xd0b498, sat: 0.55, rough: 0.8, wear: [0.9, 0, 0, 0] }), // 七〇年代花紋地板
  vct: { gen: 'tile_ward_b', scuff: 0.9, wear: [0.85, 0, 0, 0] },
  rubber: S('rubber_floor', 2.0, { tint: 0x9aa4a8, gain: 1.6, rough: 0.9, wear: [0.6, 0, 0, 0] }),
  anti_skid: S('anti_skid', 1.2, { tint: 0xd8d0c8, sat: 0.4, cav: 0.5, wear: [0.9, 0, 0, 0.35] }), // 止滑磚(太平間/洗衣房/廚房)
  tile_white_floor: S('tile_white', 1.6, { scuff: 0.8, rough: 0.8, cav: 0.45, wear: [0.8, 0, 0, 0.2] }),
  concrete: S('concrete', 3.0, { wear: [0.9, 0, 0, 0.15] }),
  concrete_paint: S('concrete', 3.2, { tint: 0xc8c0b0, wear: [0.9, 0, 0, 0.1] }),
  concrete_wet: S('concrete_wet', 2.0, { rough: 0.42, wear: [0.9, 0, 0, 0.8] }),
  epoxy: S('epoxy', 3.0, { scuff: 0.8, tint: 0xb8c0b4, gain: 1.6, sat: 0.35, rough: 0.6, wear: [0.8, 0, 0, 0.3] }), // 環氧樹脂地坪
  wood_floor: S('wood_floor', 2.0, { cav: 0.3, wear: [0.8, 0, 0, 0] }),
  wood_gym: S('wood_floor', 2.6, { tint: 0xe6c49a, sat: 1.25, wear: [0.6, 0, 0, 0] }),
  wood_parquet: { gen: 'wood_parquet', wear: [0.7, 0, 0, 0] },
  wood_old: S('wood_old', 2.0, { wear: [0.9, 0, 0, 0] }),
  carpet: S('carpet_dirty', 1.5, { tint: 0xb8b0a0, gain: 1.4, sat: 0.6, rough: 1, wear: [0.8, 0, 0, 0] }),
  carpet_blue: S('carpet', 0.8, { tint: 0xa6b0c0, sat: 0.4, wear: [0.8, 0, 0, 0] }),
  carpet_kids: { gen: 'carpet_kids', wear: [0.7, 0, 0, 0] },
  padded_floor: { gen: 'padded_floor', wear: [0.6, 0, 0, 0] },
  stone: S('stone', 1.8, { wear: [0.8, 0, 0, 0.5] }),
  asphalt: S('asphalt', 3.2, { wear: [0.5, 0, 0, 0.2] }),
  paving: S('paving', 3.0, { wear: [0.5, 0, 0, 0.1] }),
  gravel: S('gravel', 2.0, { wear: [0, 0, 0, 0] }),
  grass: S('grass', 2.5, { wear: [0, 0, 0, 0] }),
  soil: S('dirt', 2.2, { wear: [0, 0, 0, 0] }),
  roof_gravel: S('roof_gravel', 2.2, { wear: [0.3, 0, 0, 0.3] }),
  metal_grate: S('metal_grate', 0.5, { metal: 0.75, alphaTest: 0.5, side: 2, wear: [0, 0, 0, 0] }),
  // ---- 天花板 ----
  // 礦纖板:每片依位置換一片圖樣 + 轉 90° 的倍數 + 色差(tv = 每張貼圖 3×3 片)→ 長走廊看不出 2m 的重複
  ceil_tile: S('ceiling_fissured', 2.0, { tint: 0xc6c2b6, norm: 1, sat: 0.9, n: 1.1, tv: 3, wear: [0, 0.18, 0.3, 0] }),
  ceil_tile_b: S('ceiling_fissured', 2.0, { tint: 0xb2a690, norm: 1, sat: 1, n: 1.1, tv: 3, wear: [0, 0.45, 0.6, 0] }),
  ceil_tile_c: S('ceiling_tile2', 2.4, { tint: 0xc8c6bc, gain: 0.95, wear: [0, 0.8, 0.4, 0] }), // 另一款礦纖板(格線較密)
  ceil_plaster: S('plaster_paint', 3.0, { tint: 0xb0aa9c, norm: 1, sat: 0.2, wear: [0, 0.9, 0.6, 0] }),
  ceil_concrete: S('concrete', 2.6, { tint: 0x8c8882, wear: [0, 0.9, 0.6, 0] }),
  ceil_wood: S('wood_panel', 2.1, { tint: 0x8a7264, sat: 0.6, wear: [0, 0.6, 0.3, 0] }),
  vault_stone: S('stone_wall', 2.5, { tint: 0xb8b0a0, wear: [0, 1, 0.9, 0] }),
  // ---- 門窗、欄杆、金屬 ----
  steel_brushed: S('steel', 1.0, { metal: 1, rough: 0.55, wear: [0.3, 0.2, 0, 0] }),
  steel_dirty: S('steel', 0.8, { metal: 0.85, rough: 0.9, tint: 0xb0aea6, wear: [0.5, 0.4, 0.2, 0] }),
  rust: S('rust', 2.2, { metal: 0.3, wear: [0.3, 0.3, 0.2, 0] }),
  iron: S('rust', 1.2, { metal: 0.5, tint: 0x4a4440, sat: 0.4, rough: 0.8, wear: [0, 0, 0, 0] }),
  door_wood: S('wood_old', 2.0, { tint: 0x9a7458, rot: Math.PI / 2, wear: [0.6, 0.3, 0.2, 0] }),
  door_dark: S('wood_panel', 2.1, { tint: 0x7a6050, sat: 0.6, wear: [0.5, 0.3, 0.2, 0] }),
  door_mint: S('metal_painted', 1.4, { tint: 0x9cc4b0, sat: 0.4, rough: 0.75, wear: [0.6, 0.3, 0.2, 0] }),
  door_cream: S('metal_painted', 1.4, { tint: 0xd8ccb0, sat: 0.3, rough: 0.75, wear: [0.6, 0.3, 0.2, 0] }),
  door_gray: S('metal_painted', 1.2, { tint: 0x7c8488, sat: 0.3, rough: 0.8, wear: [0.6, 0.3, 0.2, 0] }),
  door_red: S('metal_painted', 1.2, { tint: 0xa8443a, sat: 0.7, rough: 0.7, wear: [0.6, 0.3, 0.2, 0] }),
  door_white: S('metal_painted', 1.3, { tint: 0xe4e2da, sat: 0.5, rough: 0.7, wear: [0.6, 0.3, 0.2, 0] }),
  door_teal: S('metal_painted', 1.3, { tint: 0x5f8f8a, sat: 0.45, rough: 0.75, wear: [0.6, 0.3, 0.2, 0] }),
  board: S('wood_old', 1.8, { tint: 0xb4a490, wear: [0.3, 0.2, 0.2, 0] }),
  runner: S('carpet', 0.8, { tint: 0x9a3a32, sat: 0.7, wear: [0.8, 0, 0, 0] }),
  chainlink: S('chainlink', 1.0, { metal: 0.8, alphaTest: 0.45, side: 2, wear: [0, 0, 0, 0] }),
  // ---- 標示、告示、貼花、地板色帶 ----
  atlas_signs: { atlas: 'signs', rough: 0.42 },
  atlas_boards: { atlas: 'boards', rough: 0.85 },
  decal_leak: { decal: 'grime_leak', rough: 0.95 },
  decal_crack: { decal: 'cracks', rough: 0.95 },
  floor_line: { solid: 0xffffff, rough: 0.5, wear: [1, 0, 0, 0] },
  drain: S('metal_grate', 0.3, { metal: 0.8, rough: 0.6, alphaTest: 0.5, side: 2, wear: [0, 0, 0, 0] }),
  glass: { gen: 'glass' },
  blinds: { gen: 'blinds' },
  curtain: { gen: 'curtain' },
  bush: { gen: 'bush' },
};

// 結構材質的共用 shader 修改(共用同一個 onBeforeCompile → 共用 shader 程式;每個材質自己的 uniform):
//  uSat 飽和度;uNoTile 防重複取樣(低頻雜訊決定每一塊用哪個偏移,兩個偏移之間交叉淡化 → 看不出貼圖重複)
//  WEAR 歲月層(wear.js);LAYER 剝落層(第二組貼圖:殘留漆片/底層灰泥,遮罩 = 世界雜訊 × 每面牆的破舊度)
const NOTILE = `
uniform float uSat;
uniform float uNoTile;
uniform float uCavity;
uniform float uTileVar;
float ntHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float ntNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( ntHash( i ), ntHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ntHash( i + vec2( 0.0, 1.0 ) ), ntHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
// 片狀材質(天花板礦纖板):每一片換成貼圖裡隨機的一片,並轉 0/90/180/270°;法線 xy 要轉回來(tvRotN)
float tvK( vec2 id ) { return floor( ntHash( id ) * 4.0 ); }
vec2 tvRot( vec2 c, float k ) { return k < 1.0 ? c : k < 2.0 ? vec2( - c.y, c.x ) : k < 3.0 ? - c : vec2( c.y, - c.x ); }
vec2 tvRotN( vec2 n, vec2 uv ) { if ( uTileVar < 0.5 ) return n; float k = tvK( floor( uv * uTileVar ) ); return tvRot( n, mod( 4.0 - k, 4.0 ) ); }
vec3 tvShade( vec2 uv ) {
  if ( uTileVar < 0.5 ) return vec3( 1.0 );
  float h = ntHash( floor( uv * uTileVar ) + 41.7 );
  vec3 s = vec3( 0.93 + 0.1 * fract( h * 13.1 ) );
  if ( h > 0.93 ) s *= vec3( 1.06, 1.06, 1.04 ); // 後來換上的新板
  else if ( h > 0.85 ) s *= vec3( 0.96, 0.9, 0.76 ); // 泛黃受潮
  else if ( h < 0.05 ) s *= vec3( 0.82, 0.8, 0.76 ); // 燻黑
  return uTileVar > 6.0 ? mix( vec3( 1.0 ), s, 0.45 ) : s; // 小磁磚:色差溫和(補過的磚、髒一點的磚)
}
vec4 ntTex( sampler2D t, vec2 uv ) {
  vec4 res;
  vec2 dx = dFdx( uv ), dy = dFdy( uv );
  if ( uTileVar > 0.5 ) {
    vec2 g = uv * uTileVar, id = floor( g ), c = g - id - 0.5;
    float h2 = ntHash( id + 17.3 );
    vec2 src = floor( vec2( h2, fract( h2 * 7.13 ) ) * uTileVar );
    res = textureGrad( t, ( src + tvRot( c, tvK( id ) ) + 0.5 ) / uTileVar, dx, dy );
  } else if ( uNoTile < 0.5 ) {
    res = texture2D( t, uv );
  } else {
    float k = ntNoise( uv * 0.43 ) * 0.7 + ntNoise( uv * 1.31 + 17.0 ) * 0.3;
    float l = k * 7.0; float f = fract( l ); float ia = floor( l );
    vec2 oa = sin( vec2( 3.0, 7.0 ) * ia ), ob = sin( vec2( 3.0, 7.0 ) * ( ia + 1.0 ) );
    res = mix( textureGrad( t, uv + oa, dx, dy ), textureGrad( t, uv + ob, dx, dy ), smoothstep( 0.25, 0.75, f ) );
  }
  return res;
}
#ifdef LAYER
uniform sampler2D tL2c;
uniform sampler2D tL2n;
uniform sampler2D tL2o;
uniform vec4 uL2;
uniform vec3 uL2col;
uniform vec3 uL2under;
#endif
`;
function structHook(shader) {
  const U = this.userData;
  Object.assign(shader.uniforms, { uSat: U.uSat, uNoTile: U.uNoTile, uCavity: U.uCavity, uTileVar: U.uTileVar, tWear: U.tWear, uWear: U.uWear, uWear2: U.uWear2, uSurfG: SU.uSurfG });
  if (U.L2) Object.assign(shader.uniforms, U.L2);
  const C = THREE.ShaderChunk;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + WEAR_VERT_PARS)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WEAR_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', NOTILE + WEAR_FRAG_PARS + 'void main() {')
    .replace('#include <map_fragment>', WEAR_SETUP + `
#ifdef USE_MAP
	vec4 sampledDiffuseColor = ntTex( map, vMapUv );
	sampledDiffuseColor.rgb *= tvShade( vMapUv );
	float satL = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
	sampledDiffuseColor.rgb = max( mix( vec3( satL ), sampledDiffuseColor.rgb, uSat ), 0.0 );
	diffuseColor *= sampledDiffuseColor;
	#ifdef LAYER
	vec2 l2uv = vMapUv * uL2.x + vec2( 0.37, 0.11 );
	vec4 l2c = ntTex( tL2c, l2uv );
	float l2l = dot( l2c.rgb, vec3( 0.299, 0.587, 0.114 ) );
	float flake = smoothstep( uL2.y - 0.07, uL2.y + 0.07, l2l );
	vec3 l2 = mix( uL2under * ( 0.55 + l2l ), uL2col * ( 0.7 + 0.45 * l2l ), flake );
	l2 *= 1.0 - 0.3 * smoothstep( 0.0, 0.5, flake ) * ( 1.0 - smoothstep( 0.5, 1.0, flake ) ); // 漆片邊緣的陰影
	diffuseColor.rgb = mix( diffuseColor.rgb, l2, wxPeel );
	#endif
#endif`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + WEAR_ALBEDO)
    .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = ntTex( roughnessMap, vRoughnessMapUv );
	#ifdef LAYER
	texelRoughness = mix( texelRoughness, ntTex( tL2o, l2uv ) * vec4( 1.0, uL2.w, 1.0, 1.0 ), wxPeel );
	#endif
	roughnessFactor *= texelRoughness.g;
	diffuseColor.rgb *= mix( 1.0, texelRoughness.r, uCavity );
#endif
roughnessFactor = clamp( roughnessFactor + wxRough - wxWet * 0.85, 0.04, 1.0 );`)
    .replace('#include <normal_fragment_maps>', `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 mapN = ntTex( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy = tvRotN( mapN.xy, vNormalMapUv );
	#ifdef LAYER
	vec3 l2n = ntTex( tL2n, l2uv ).xyz * 2.0 - 1.0;
	mapN = mix( mapN, vec3( l2n.xy * uL2.z / max( normalScale.x, 0.05 ), l2n.z ), wxPeel );
	#endif
	mapN.xy *= normalScale * ( 1.0 - wxWet * 0.85 );
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd() * ( 1.0 - wxWet * 0.85 ), faceDirection );
#endif
` + WEAR_NORMAL)
    .replace('#include <aomap_fragment>', C.aomap_fragment.replace('texture2D( aoMap, vAoMapUv )', 'ntTex( aoMap, vAoMapUv )'));
}
// 有規則圖樣(磁磚、磚、石塊、棋盤、木板)的貼圖不能打亂
const PATTERNED = new Set(['ceiling_fissured', 'tile_ward', 'tile_lobby', 'tile_white', 'tile_wall', 'brick', 'stone_wall', 'wood_panel', 'ceiling_tile', 'metal_grate', 'paving', 'wood_floor', 'wood_old', 'concrete_wall', 'carpet', 'chainlink', 'stone',
  'tile_sq', 'checker_bw', 'lino_pattern', 'anti_skid', 'rubber_floor', 'ceiling_tile2', 'brick_white', 'wallpaper_old', 'plaster_damaged']);
const DEF_WEAR = [0.8, 0.6, 0.4, 0];
const _lc = new THREE.Color();
const lumOf = (hex) => { _lc.set(hex); return Math.max(0.03, 0.2126 * _lc.r + 0.7152 * _lc.g + 0.0722 * _lc.b); };
// 共用的 uniform 物件(每個材質一份)
function wearUniforms(m, def, gen) {
  const w = def?.wear || DEF_WEAR;
  m.userData.uSat = m.userData.uSat || { value: 1 };
  m.userData.uNoTile = m.userData.uNoTile || { value: 0 };
  m.userData.uCavity = { value: def?.cav ?? (gen ? 0 : 0.25) };
  m.userData.uTileVar = { value: def?.tv ?? 0 };
  m.userData.tWear = { value: wearTexture() };
  m.userData.uWear = { value: new THREE.Vector4(w[0], w[1], w[2], w[3]) };
  m.userData.uWear2 = { value: new THREE.Vector4(def?.peel?.amt ?? 0, def?.peel?.scale ?? 0.4, def?.scuff ?? 0, def?.det ?? (def?.alphaTest ? 0 : 0.8)) }; // w = 近距離細節(釉面磚/亮面較弱)
  m.onBeforeCompile = structHook;
  m.customProgramCacheKey = () => 'struct' + (m.defines?.LAYER !== undefined ? 'L' : '');
}

const cache = new Map();
export function surf(key) {
  let m = cache.get(key);
  if (m) return m;
  const def = SURFACES[key];
  if (def?.pbr && PBR_SETS[def.pbr]) {
    const set = PBR_SETS[def.pbr];
    const o = { tile: def.tile, rot: def.rot || 0 };
    m = new THREE.MeshStandardMaterial({
      color: def.tint ?? 0xffffff, roughness: def.rough ?? 1, metalness: def.metal ?? 0, vertexColors: true,
      map: pbrTex(def.pbr, 'color', o), normalMap: pbrTex(def.pbr, 'normal', o),
    });
    if (def.gain) m.color.multiplyScalar(def.gain);
    if (def.norm) m.color.multiplyScalar(def.norm / lumOf(set.avg)); // tint = 想要的平均反照率(除掉貼圖本身的亮度)
    const orm = pbrTex(def.pbr, 'orm', o);
    m.roughnessMap = orm;
    if (set.ao) { m.aoMap = orm; m.aoMapIntensity = def.ao ?? 1; }
    const n = def.n ?? 1;
    m.normalScale.set(n, n);
    if (set.alpha) { m.alphaMap = pbrTex(def.pbr, 'opacity', o); m.alphaTest = def.alphaTest ?? 0.5; }
    if (def.side === 2) m.side = THREE.DoubleSide;
    m.userData.uSat = { value: def.sat ?? 1 };
    m.userData.uNoTile = { value: def.noTile ?? (PATTERNED.has(def.pbr) ? 0 : 1) };
    wearUniforms(m, def, false);
    // 剝落層
    const P = def.peel;
    if (P && PBR_SETS[P.set]) {
      const c2 = new THREE.Color(P.tint ?? def.tint ?? 0xffffff), u2 = new THREE.Color(P.under ?? 0x8a8478);
      m.defines = { ...(m.defines || {}), LAYER: '' };
      m.userData.L2 = {
        tL2c: { value: pbrTex(P.set, 'color', { tile: 1 }) }, tL2n: { value: pbrTex(P.set, 'normal', { tile: 1 }) }, tL2o: { value: pbrTex(P.set, 'orm', { tile: 1 }) },
        uL2: { value: new THREE.Vector4(def.tile / (P.tile || 1.3), P.flake ?? 0.42, P.n ?? 1, P.rough ?? 1.15) },
        uL2col: { value: c2 }, uL2under: { value: u2 },
      };
    }
    // PBR 下載失敗 → 換成程式貼圖
    const fb = def.fb || key;
    if (PROC[fb]) onPbrFail(def.pbr, () => {
      const p = procTextures(fb);
      m.map = p.tex; m.normalMap = null; m.roughnessMap = null; m.aoMap = null; m.alphaMap = null;
      if (p.bump) { m.bumpMap = p.bump; m.bumpScale = PROC[fb].bump ?? 1; }
      m.color.set(0xffffff); m.userData.uSat.value = 1; m.userData.uNoTile.value = 0; m.roughness = PROC[fb].rough ?? 0.85;
      if (m.defines) delete m.defines.LAYER;
      m.needsUpdate = true;
    });
  } else if (def?.atlas) { // 程式繪製的標示圖集(Worker 畫好前是透明的;內容依目前地圖,見 setAtlasData)
    const p = procTextures(def.atlas + '@' + (atlasCur?.id || 'none'), { kind: 'atlas', placeholder: 'rgba(0,0,0,0)', data: atlasCur });
    m = new THREE.MeshStandardMaterial({ map: p.tex, roughness: def.rough ?? 0.6, alphaTest: 0.5, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    m.userData.noShadow = true;
  } else if (def?.decal) { // 半透明貼花(漏水流痕、裂縫)
    m = new THREE.MeshStandardMaterial({ map: decalTex(def.decal), roughness: def.rough ?? 0.9, transparent: true, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.userData.noShadow = true;
  } else if (def?.solid !== undefined) { // 純色(頂點色)+ 歲月層,例如地板色帶
    m = new THREE.MeshStandardMaterial({ color: def.solid, roughness: def.rough ?? 0.6, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    wearUniforms(m, def, true);
    m.userData.noShadow = true;
  } else if (def?.gen || PROC[key]) {
    const gk = def?.gen || key, pd = PROC[gk];
    const p = procTextures(gk, { placeholder: pd.ph || '#77736a' });
    m = new THREE.MeshStandardMaterial({ map: p.tex, roughness: pd.rough ?? 0.85, metalness: pd.metal ?? 0, vertexColors: true });
    if (p.bump) { m.bumpMap = p.bump; m.bumpScale = pd.bump ?? 1; }
    if (pd.alphaTest) m.alphaTest = pd.alphaTest;
    if (pd.side === 2) m.side = THREE.DoubleSide;
    if (pd.transparent) {
      m.transparent = true; m.depthWrite = false; m.envMapIntensity = pd.env ?? 1.5;
      // [perf6] 雙面透明的平面玻璃一次畫完:three 預設畫兩次(背面、正面),每次都改 side + needsUpdate → 每幀重算兩次 program 參數;
      // 平面片沒有自己遮自己的問題,一次畫的結果相同(多片重疊處只有混合順序不同,同材質看不出差別)
      if (m.side === THREE.DoubleSide) m.forceSinglePass = true;
    }
    else wearUniforms(m, def || { wear: [0.7, 0.6, 0.4, 0] }, true);
  } else if (key === 'TRIM_MATTE' || key === 'TRIM_GLOSS' || key === 'TRIM_METAL') {
    const [r, mt] = { TRIM_MATTE: [0.78, 0], TRIM_GLOSS: [0.3, 0.05], TRIM_METAL: [0.42, 0.85] }[key];
    m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: r, metalness: mt, vertexColors: true });
    wearUniforms(m, { wear: [0.5, 0.25, 0.15, 0] }, true);
  } else {
    const d = TRIM[key] || [0xff00ff, 1];
    m = new THREE.MeshStandardMaterial({ color: d[0], roughness: d[1], metalness: d[2] ?? 0, vertexColors: true });
  }
  m.name = 's:' + key;
  cache.set(key, m);
  return m;
}
export const surfKeys = () => [...cache.keys()];
// 標示圖集的內容(atlas.js 的 atlasData(L));換地圖時呼叫,已建立的圖集材質會換上新貼圖
let atlasCur = null;
export function setAtlasData(data) {
  if (atlasCur?.id === data?.id) return;
  atlasCur = data;
  for (const [k, def] of Object.entries(SURFACES)) {
    if (!def.atlas || !cache.has(k)) continue;
    cache.get(k).map = procTextures(def.atlas + '@' + data.id, { kind: 'atlas', placeholder: 'rgba(0,0,0,0)', data }).tex;
  }
}
// 新地圖註冊自己的表面材質(鍵 → 定義,格式同 SURFACES)
export function registerSurfaces(defs) { for (const [k, v] of Object.entries(defs)) { SURFACES[k] = v; cache.delete(k); } }
// 貼花貼圖(public/textures/decals/*.webp)
const DECAL_BASE = ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/') + 'textures/decals/';
const decals = new Map();
function decalTex(name) {
  let t = decals.get(name);
  if (t) return t;
  t = new THREE.TextureLoader().load(DECAL_BASE + name + '.webp', undefined, undefined, () => console.warn('[surfaces] 貼花載入失敗', name));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  decals.set(name, t);
  return t;
}
// 貼圖的公尺尺寸(UV 位移用)
export function surfSize(key) {
  const d = SURFACES[key];
  if (d?.pbr) return [d.tile, d.tile];
  const p = PROC[d?.gen || key];
  return p ? p.size : [1, 1];
}
// v 是否要從地面起算(只有畫了牆腳/頂端細節的程式貼圖需要)
export const isRoomMapped = (key) => { const d = SURFACES[key]; if (d?.pbr) return false; return !!PROC[d?.gen || key]?.room; };
export { procClone };
