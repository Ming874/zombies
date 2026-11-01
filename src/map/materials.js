import * as THREE from 'three';

// 場景材質庫:所有牆面/地板/道具都用 mat(鍵) 取得共用材質(共用材質才能合併幾何、減少 draw call)。
// 目前是純色佔位;場景代理會換成 public/textures/ 的 PBR 貼圖(載入失敗時退回程式貼圖/純色)。
// 鍵名清單即為介面:新增可以,改名/刪除前要同步所有使用者。
const DEF = {
  // ---- 地板 ----
  tile_ward: [0x8a8f86, 0.6], tile_lobby: [0x9a968c, 0.5], terrazzo: [0x8e8a82, 0.35], linoleum: [0x7f8a80, 0.55],
  tile_white: [0xb8bab4, 0.4], concrete: [0x6e6c66, 0.95], concrete_wet: [0x45443f, 0.45], wood_floor: [0x5a4330, 0.7],
  carpet: [0x4a3c3a, 1], padded: [0xc9c4b4, 0.95], stone: [0x5e5b54, 0.9], asphalt: [0x3a3a3a, 0.95],
  paving: [0x77736a, 0.9], gravel: [0x6a665e, 1], grass: [0x4d5a36, 1], roof_gravel: [0x55534e, 1], metal_grate: [0x4a4b4c, 0.6],
  // ---- 牆 ----
  paint_green: [0x7d9284, 0.85], paint_white: [0xb4b6ae, 0.85], paint_gray: [0x86888a, 0.85], tile_wall: [0xc2c4bc, 0.45],
  plaster: [0xa8a294, 0.95], concrete_wall: [0x6f6e69, 0.95], brick: [0x6e3e2e, 0.9], stone_wall: [0x605c54, 0.95],
  wood_panel: [0x4a3424, 0.6], wallpaper_kids: [0xb8a890, 0.9],
  // ---- 天花板 ----
  ceiling_tile: [0x9c9a90, 0.95], ceiling_concrete: [0x5c5b57, 1],
  // ---- 道具 ----
  metal_white: [0xc8c8c0, 0.45, 0.4], metal_green: [0x5f7a6c, 0.5, 0.4], metal_gray: [0x77797a, 0.5, 0.5], steel: [0x9a9c9e, 0.52, 0.85],
  chrome: [0xd0d4d8, 0.15, 1], rust: [0x6a3e24, 0.85, 0.4], cast_iron: [0x2e2e2e, 0.7, 0.7], aluminum: [0xb0b4b8, 0.4, 0.85],
  plastic_white: [0xd8d6cc, 0.4], plastic_beige: [0xc4b896, 0.45], plastic_blue: [0x3e6e9a, 0.4], plastic_black: [0x1e1e1e, 0.5],
  plastic_red: [0x9a2a22, 0.45], plastic_green: [0x3e7a52, 0.45], plastic_yellow: [0xc8a83a, 0.45], rubber: [0x161616, 0.9],
  fabric_blue: [0x5a7a9a, 1], fabric_green: [0x5e7e68, 1], fabric_white: [0xc8c6bc, 1], fabric_curtain: [0x7a9a90, 1],
  fabric_red: [0x6a2222, 1], leather: [0x2a1e18, 0.6], vinyl_seat: [0x3a4a5a, 0.5],
  wood_dark: [0x3a2a1e, 0.6], wood_light: [0x8a6a48, 0.6], wood_old: [0x5a4a3a, 0.85], cardboard: [0x8a7050, 0.95], paper: [0xd8d4c4, 1],
  glass: [0x9ab0b8, 0.05, 0, 0.25], glass_frosted: [0xc8d0d4, 0.4, 0, 0.6], screen_off: [0x101418, 0.2],
  car_white: [0xc8c8c4, 0.3, 0.6], car_dark: [0x1e2228, 0.3, 0.6], car_police: [0x14181e, 0.3, 0.6], car_red: [0x7a1a16, 0.3, 0.6],
  tire: [0x141414, 0.95], marble: [0xc8c4bc, 0.25], stone_statue: [0x8a8880, 0.9], bronze: [0x5a4a2a, 0.4, 0.9],
  candle_wax: [0xe0d8c0, 0.6], bone: [0xc8bc9a, 0.6], flesh: [0x5a1a1a, 0.4], soil: [0x3a2e22, 1], bark: [0x3a3028, 1],
  leaves_dead: [0x5a4a2a, 1], water: [0x1a2a2a, 0.05, 0, 0.75],
  // ---- 自發光 ----
  glow_white: [0xffffff, 1, 0, 1, 0xf0f8f0, 2.0], glow_warm: [0xffe0b0, 1, 0, 1, 0xffc070, 2.0], glow_red: [0xff3020, 1, 0, 1, 0xff2010, 2.5],
  glow_green: [0x60ff90, 1, 0, 1, 0x30ff70, 2.0], glow_screen: [0x88c0d0, 1, 0, 1, 0x6aa8c0, 1.4], glow_amber: [0xffa040, 1, 0, 1, 0xff8020, 2.0],
  flame: [0xffc060, 1, 0, 1, 0xff9020, 3.0],
};
const cache = new Map();
// mat(key):共用材質;未知的鍵回傳洋紅色以便發現錯字
export function mat(key) {
  let m = cache.get(key);
  if (m) return m;
  const d = DEF[key];
  if (!d) {
    console.warn('[materials] 未知材質鍵', key);
    m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  } else {
    const [color, roughness = 0.8, metalness = 0, opacity = 1, emissive = 0, ei = 0] = d;
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
  }
  m.name = key;
  cache.set(key, m);
  return m;
}
export const MAT_KEYS = Object.keys(DEF);
// 各模組可在 import 時註冊額外材質鍵(避免多人同時改這個檔案):registerMat('fabric_pink', [0xc89aa0, 1])
// 也可直接傳入現成的 THREE.Material
export function registerMat(key, def) {
  if (def && def.isMaterial) { def.name = key; cache.set(key, def); return def; }
  if (!DEF[key]) DEF[key] = def;
  return mat(key);
}
// 走訪所有已建立的共用材質(場景建構器用來把道具材質升級成三平面 PBR)
export function forEachMat(fn) { for (const [k, m] of cache) fn(m, k); }
// 由場景代理在載入 PBR 貼圖後覆寫特定鍵的材質(保留同一個實例,已建好的網格自動更新)
export function upgradeMat(key, props) {
  const m = mat(key);
  Object.assign(m, props);
  m.needsUpdate = true;
  return m;
}
