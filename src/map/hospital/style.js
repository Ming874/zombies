import { prng, hashStr } from './paint.js';

// 區域 → 牆/地板/天花板做法。同一個 levels.js 的 wall 鍵,依主題/樓層會換成不同的配方
// (護牆板高度與材質、腰線、踢腳板、扶手、牆角護條、推床防撞條、磁磚高度、色帶…),讓每一區看起來都不一樣。
// 牆配方:up 上段材質、low 下段材質(到 dado 高)、rail 腰線、base 踢腳板、hand 扶手、guard 牆角護條、
//         bumper 推床防撞條、stripe 色帶(樓梯間/地下室)、top 天花板下的飾帶、pilaster 壁柱、tint 色調、
//         wear 破舊度基準(0 乾淨 ~ 1 破舊;每面牆再隨機 ±)、kick 門邊不鏽鋼護板
// 長走廊用 vars(多種配方)分段:醫院常是一段一段整修的,不同段的牆面處理不同,也避免 80m 一成不變。
const W = (up, o = {}) => ({ up, ...o });
const COR1 = W('paint_cream', { low: 'dado_green', dado: 1.1, rail: 'trim_wood', base: 'trim_rubber', hand: 'trim_wood', guard: 'trim_steel', wear: 0.55, kick: 1 });
const COR2 = W('paint_mint', { low: 'dado_teal', dado: 1.0, rail: 'trim_steel', base: 'trim_rubber', hand: 'trim_steel', guard: 'trim_steel', bumper: 'trim_white', tint: [0.98, 1.0, 0.98], wear: 0.6, kick: 1 });
const COR3 = W('paint_sterile', { low: 'dado_vinyl', dado: 1.25, base: 'trim_rubber', guard: 'trim_white', tint: [0.97, 0.98, 1.02], wear: 0.25 });
const THEME_WALL = {
  corridor: {
    '1F': [COR1, W('paint_green', { low: 'tile_long', dado: 1.4, rail: 'trim_dark', base: 'trim_rubber', hand: 'trim_wood', guard: 'trim_steel', wear: 0.65, kick: 1 }),
      W('paint_cream', { low: 'dado_vinyl', dado: 1.2, rail: 'trim_steel', base: 'trim_rubber', bumper: 'trim_gray', guard: 'trim_steel', wear: 0.4, kick: 1 }), COR1],
    '2F': [COR2, W('paint_mint', { low: 'paint_green', dado: 1.0, rail: 'trim_wood', base: 'trim_rubber', hand: 'trim_wood', bumper: 'trim_white', wear: 0.75, kick: 1 }),
      W('paint_white', { low: 'dado_teal', dado: 1.0, rail: 'trim_steel', base: 'trim_rubber', hand: 'trim_steel', guard: 'trim_steel', wear: 0.55, kick: 1 }), COR2],
    '3F': [COR3, W('paint_sterile', { low: 'dado_gray', dado: 1.25, base: 'trim_rubber', guard: 'trim_white', wear: 0.35 }), COR3],
    B1: [W('concrete_wall', { base: 'trim_concrete', stripe: 'trim_yellow', wear: 0.8 }), W('cmu_paint', { base: 'trim_concrete', stripe: 'trim_yellow', wear: 0.8 }),
      W('brick_white', { base: 'trim_concrete', stripe: 'trim_yellow', wear: 0.85 })],
  },
  ward: W('paint_mint', { low: 'dado_teal', dado: 0.9, bumper: 'trim_white', base: 'trim_rubber', wear: 0.6, kick: 1 }),
  pharmacy: W('paint_olive', { low: 'dado_brown', dado: 1.1, rail: 'trim_wood', base: 'trim_rubber', wear: 0.65 }),
  waiting: W('paint_cream', { low: 'dado_wood', dado: 1.0, rail: 'trim_wood', base: 'trim_wood', bumper: 'trim_wood_light', tint: [1.03, 1.0, 0.94], wear: 0.6 }),
  xray: W('paint_white', { low: 'dado_gray', dado: 1.2, base: 'trim_rubber', stripe: 'trim_yellow', wear: 0.5, kick: 1 }),
  ct: W('paint_sterile', { low: 'dado_vinyl', dado: 1.2, base: 'trim_rubber', bumper: 'trim_gray', wear: 0.35, kick: 1 }),
  rehab: W('paint_ochre', { low: 'dado_wood', dado: 1.0, hand: 'trim_wood', base: 'trim_wood', wear: 0.55 }),
  cafeteria: W('paint_yellow', { low: 'tile_subway', dado: 1.6, rail: 'trim_dark', base: 'trim_dark', top: 'trim_dark', wear: 0.7 }),
  er: W('paint_sterile', { low: 'tile_white', dado: 1.5, rail: 'trim_steel', base: 'trim_rubber', guard: 'trim_steel', bumper: 'trim_steel', tint: [1.02, 0.97, 0.96], wear: 0.7, kick: 1 }),
  chapel: W('plaster_chapel', { low: 'dado_wood', dado: 1.2, rail: 'trim_wood', base: 'trim_wood', pilaster: 'trim_stone', wear: 0.6 }),
  lobby: W('plaster', { low: 'marble_wall', dado: 1.2, rail: 'trim_marble', base: 'trim_stone', top: 'trim_marble', wear: 0.45 }),
  shop: W('paint_white', { low: 'dado_gray', dado: 1.0, base: 'trim_rubber', wear: 0.3 }),
  security: W('paint_gray', { low: 'dado_navy', dado: 1.1, base: 'trim_rubber', rail: 'trim_dark', wear: 0.55 }),
  stairwell: { '1F': W('cmu_paint', { stripe: 'trim_red', base: 'trim_concrete', wear: 0.6 }), '2F': W('cmu_paint', { stripe: 'trim_green', base: 'trim_concrete', wear: 0.65 }),
    '3F': W('cmu_paint', { stripe: 'trim_gray', base: 'trim_concrete', wear: 0.55 }), B1: W('concrete_wall', { stripe: 'trim_yellow', base: 'trim_concrete', wear: 0.85 }) },
  surgery: W('paint_sterile', { low: 'tile_green', dado: 2.3, rail: 'trim_steel', base: 'trim_steel', guard: 'trim_steel', wear: 0.35, kick: 1 }),
  icu: W('paint_sterile', { low: 'paint_blue', dado: 1.0, bumper: 'trim_white', base: 'trim_rubber', guard: 'trim_steel', rail: 'trim_steel', tint: [0.97, 1.0, 1.02], wear: 0.4, kick: 1 }),
  nursery: W('wallpaper_ducks', { low: 'dado_rose', dado: 1.0, rail: 'trim_white', base: 'trim_white', wear: 0.6 }),
  delivery: W('paint_pink', { low: 'tile_pink', dado: 1.8, rail: 'trim_white', base: 'trim_rubber', wear: 0.5, kick: 1 }),
  playroom: W('wallpaper_stars', { low: 'dado_teal', dado: 1.0, rail: 'trim_white', base: 'trim_white', wear: 0.6 }),
  peds_ward: W('wallpaper_animals', { low: 'dado_green', dado: 1.0, rail: 'trim_white', base: 'trim_white', wear: 0.65 }),
  director: W('wallpaper_old', { low: 'dado_wood', dado: 1.05, rail: 'trim_wood', base: 'trim_wood', top: 'trim_wood', wear: 0.6 }),
  office: W('paint_yellow', { low: 'dado_brown', dado: 0.9, rail: 'trim_wood', base: 'trim_wood', wear: 0.65 }),
  psych_cell: W('padded', { wear: 0.5 }),
  monitor: W('paint_gray', { low: 'dado_gray', dado: 1.0, base: 'trim_rubber', tint: [0.95, 0.97, 1.02], wear: 0.55 }),
  dorm: W('plaster_dorm', { low: 'dado_brown', dado: 1.0, rail: 'trim_wood', base: 'trim_wood', wear: 0.75 }),
  morgue: W('tile_white', { base: 'trim_steel', tint: [0.94, 0.98, 1.02], wear: 0.6 }),
  autopsy: W('tile_cream', { low: 'tile_white', dado: 1.6, rail: 'trim_steel', base: 'trim_steel', tint: [1.0, 0.97, 0.95], wear: 0.7 }),
  archive: W('paint_yellow', { low: 'brick_white', dado: 1.6, rail: 'trim_dark', base: 'trim_concrete', tint: [1.02, 0.99, 0.92], wear: 0.8 }),
  laundry: W('paint_blue', { low: 'tile_blue', dado: 1.5, rail: 'trim_dark', base: 'trim_dark', wear: 0.75 }),
  supply: W('paint_gray', { low: 'dado_gray', dado: 1.2, base: 'trim_rubber', tint: [0.98, 1.0, 0.95], wear: 0.7 }),
  tunnel: W('concrete_wall', { base: 'trim_concrete', stripe: 'trim_yellow', tint: [0.95, 0.95, 0.9], wear: 0.85 }),
  ossuary: W('stone_wall', { wear: 0.9 }),
  boiler: W('brick', { low: 'dado_gray', dado: 1.0, base: 'trim_concrete', tint: [1.04, 0.98, 0.9], wear: 0.9 }),
  pump: W('plaster_mould', { low: 'concrete_wet_wall', dado: 0.8, tint: [0.9, 0.96, 0.98], wear: 0.95 }),
  dock: W('cmu_paint', { stripe: 'trim_yellow', base: 'trim_concrete', tint: [0.96, 0.95, 0.9], wear: 0.8 }),
  ramp: W('concrete_wall', { stripe: 'trim_yellow', wear: 0.8 }),
  incinerator: W('brick', { wear: 0.95 }),
  machine: W('cmu_paint', { base: 'trim_concrete', tint: [0.92, 0.94, 0.95], wear: 0.7 }),
  stair_ext: W('concrete_wet_wall', { wear: 0.9 }),
};
export const FACADE = W('facade', { wear: 0.6 }), COURT = W('facade_dark', { tint: [0.92, 0.95, 0.92], wear: 0.6 }), BOUNDARY = W('brick_old', { wear: 0.7 });
export const REVEAL = W('paint_white', { tint: [0.92, 0.92, 0.9], wear: 0.5 });
export const REVEAL_B1 = W('concrete_wall', { tint: [0.95, 0.95, 0.92], wear: 0.8 }); // 地下室的門洞/窗洞側邊是清水模,不是白漆
export const revealFor = (lvId) => (lvId === 'B1' ? REVEAL_B1 : REVEAL);

const FLOOR_BY_THEME = {
  corridor: { '1F': 'tile_ward', '2F': 'lino_sheet_b', '3F': 'lino_sheet_c', B1: 'epoxy' },
  ward: 'lino_sheet', icu: 'lino_sheet_c', xray: 'vct', ct: 'lino_sheet_b', pharmacy: 'vct', security: 'carpet_blue', monitor: 'rubber',
  archive: 'vct', nursery: 'lino_sheet_d', peds_ward: 'lino_pattern', cafeteria: 'checker', laundry: 'anti_skid', er: 'lino_sheet_c',
  chapel: 'wood_parquet', rehab: 'wood_gym', director: 'wood_floor', dorm: 'wood_old', playroom: 'carpet_kids', office: 'carpet',
  dock: 'concrete_paint', boiler: 'concrete_paint', supply: 'epoxy', machine: 'epoxy', morgue: 'anti_skid', autopsy: 'anti_skid',
  waiting: 'tile_lobby', surgery: 'tile_white_floor', delivery: 'tile_white_floor',
};
const FLOOR_BY_KEY = { tile_white: 'tile_white_floor', padded: 'padded_floor' };
export function floorKey(zone, lvId) {
  if (!zone) return lvId === 'B1' ? 'epoxy' : 'concrete';
  const t = FLOOR_BY_THEME[zone.theme];
  if (t) return typeof t === 'string' ? t : t[lvId] || zone.floor;
  return FLOOR_BY_KEY[zone.floor] || zone.floor || 'concrete';
}
// 天花板:ceil 鍵優先,其次主題
const CEIL_BY_THEME = {
  lobby: 'ceil_plaster', chapel: 'ceil_wood', director: 'ceil_wood', dorm: 'ceil_plaster', psych_cell: 'ceil_plaster',
  stairwell: 'ceil_concrete', morgue: 'ceil_concrete', autopsy: 'ceil_plaster', dock: 'ceil_concrete', ramp: 'ceil_concrete',
  incinerator: 'ceil_concrete', boiler: 'ceil_concrete', machine: 'ceil_concrete', tunnel: 'ceil_concrete', pump: 'ceil_concrete', supply: 'ceil_concrete',
  laundry: 'ceil_tile_b', archive: 'ceil_tile_b', stair_ext: 'ceil_concrete', ossuary: 'vault_stone',
  surgery: 'ceil_tile_c', icu: 'ceil_tile_c', delivery: 'ceil_tile_c', ct: 'ceil_tile_c', office: 'ceil_tile_c', monitor: 'ceil_tile_c', security: 'ceil_tile_c',
};
export function ceilKey(zone, lvId) {
  if (!zone) return lvId === 'B1' ? 'ceil_concrete' : 'ceil_tile';
  if (zone.ceil === 'pipes') return 'ceil_concrete';
  if (zone.ceil === 'vault') return 'vault_stone';
  if (zone.theme === 'corridor') return lvId === '3F' ? 'ceil_plaster' : lvId === '2F' ? 'ceil_tile_c' : lvId === 'B1' ? 'ceil_concrete' : 'ceil_tile';
  return CEIL_BY_THEME[zone.theme] || (zone.light === 'fluoro_dying' ? 'ceil_tile_b' : 'ceil_tile');
}
// at:沿牆的世界座標(公尺);有 vars 的配方依「整修段」(約 14~22m 一段)挑一種
export function wallRecipe(zone, lvId, at = null) {
  if (!zone) { const c = THEME_WALL.corridor[lvId] || THEME_WALL.corridor['1F']; return Array.isArray(c) ? c[0] : c; }
  let t = THEME_WALL[zone.theme];
  if (!t) return W(zone.wall || 'paint_white');
  if (!t.up) t = t[lvId] || t['1F'] || Object.values(t)[0];
  if (Array.isArray(t)) {
    if (at == null) return t[0];
    const seg = Math.floor((at + 7) / 18);
    return t[prng(hashStr(zone.id + ':' + seg))() * t.length | 0];
  }
  return t;
}
// 每個區域的色調(固定,依區域 id 雜湊)× 配方色調
const tintCache = new Map();
export function zoneTint(zone, recipe) {
  const key = (zone ? zone.id : 'none') + '|' + recipe.up;
  let t = tintCache.get(key);
  if (t) return t;
  const R = prng(hashStr(key));
  const k = R.r(0.9, 1.04), base = recipe.tint || [1, 1, 1];
  t = [base[0] * k * R.r(0.97, 1.03), base[1] * k * R.r(0.97, 1.03), base[2] * k * R.r(0.96, 1.03)];
  tintCache.set(key, t);
  return t;
}
// 區域的破舊度基準(地板/天花板也用)
const THEME_WEAR = { psych_cell: 0.45, surgery: 0.35, icu: 0.4, ct: 0.35, shop: 0.2, lobby: 0.5, ossuary: 0.95, pump: 0.95, incinerator: 0.9, tunnel: 0.85, boiler: 0.85, stair_ext: 0.9 };
export function zoneWear(zone, lvId) {
  if (!zone) return lvId === 'B1' ? 0.85 : 0.6;
  const w = THEME_WEAR[zone.theme] ?? (lvId === 'B1' ? 0.8 : zone.theme === 'corridor' && lvId === '3F' ? 0.35 : 0.6);
  return Math.min(1, Math.max(0, w + (prng(hashStr('zw' + zone.id))() - 0.5) * 0.3));
}
// 新地圖註冊自己的主題配方:registerStyles({ walls: { theme: 配方 | { 樓層: 配方 | [配方…] } }, floors: { theme: 鍵 | { 樓層: 鍵 } }, ceils: { theme: 鍵 }, wear: { theme: 0..1 } })
export function registerStyles({ walls, floors, ceils, wear } = {}) {
  if (walls) Object.assign(THEME_WALL, walls);
  if (floors) Object.assign(FLOOR_BY_THEME, floors);
  if (ceils) Object.assign(CEIL_BY_THEME, ceils);
  if (wear) Object.assign(THEME_WEAR, wear);
  tintCache.clear();
}
export const OUTDOOR_THEMES = new Set(['alley', 'playground', 'cemetery', 'yard', 'ambulance_bay', 'plaza', 'parking', 'courtyard', 'rooftop', 'fire_escape']);
