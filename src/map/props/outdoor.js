import * as THREE from 'three';
import { initMats, prepaint } from './outdoor/mats.js';
import { initGround } from './outdoor/ground.js';
import { initNature } from './outdoor/nature.js';
import { initPlay } from './outdoor/play.js';
import { initCamp } from './outdoor/camp.js';
import { initFurniture } from './outdoor/furniture.js';
import { buildObstacle } from './outdoor/obstacles.js';
import { THEMES } from './outdoor/themes.js';
import { dressEdgesSteps } from './outdoor/edges.js';
import { resetEnv } from './outdoor/env.js';
import { resetCars } from './outdoor/cars.js';
import { resetVehicles } from './outdoor/vehicles.js';
import { resetFurniture } from './outdoor/furniture.js';
import { scene8Room } from './indoor/scene8.js';

// 戶外與工業區道具(停車場、後巷、墓園、遊戲場、中庭、頂樓、逃生梯、地下工業房間、納骨堂)
// 以及大型障礙物('X' 格:車、救護車、靈車、子母車、發電機、焚化爐、噴水池、雕像、水塔、冷氣主機…)。
// 模型與擺設在 src/map/props/outdoor/*.js:
//   kit.js 幾何/合併/實例池/動態物件   mats.js 材質與程式貼圖   gltf.js 下載模型(CC0)
//   vehicles.js 車輛   obstacles.js 大型障礙物   street.js 路燈拒馬   furniture.js 街道家具   nature.js 植物烏鴉   play.js 遊樂設施
//   camp.js 災難現場(帳篷/屍袋/檢查站)   ground.js 地面標線/緣石/人孔/雜物   industrial.js 管線機械   figures.js 雕像人形
//   basement.js 地下室工業房間   edges.js 地圖外圍景   themes.js 各主題擺設   env.js 天氣共用狀態(風/閃電/燈具閃爍)
export const OUTDOOR_THEMES = new Set([
  'alley', 'playground', 'cemetery', 'yard', 'ambulance_bay', 'plaza', 'parking', 'courtyard', 'rooftop', 'fire_escape',
  'tunnel', 'ossuary', 'boiler', 'dock', 'ramp', 'incinerator', 'pump', 'machine', 'stair_ext',
]);

function initAll() { initMats(); initGround(); initNature(); initPlay(); initCamp(); initFurniture(); }
// [perf] 分段版(載入時由 hospital 建構呼叫):程式貼圖一張一步、各模組的材質初始化各一步(全部都有「做過就略過」)
export function* prepareOutdoorSteps() {
  for (const f of prepaint()) { if (f.step) while (!f.step()) yield; else f(); yield; }
  for (const f of [initMats, initGround, initNature, initPlay, initCamp, initFurniture]) { f(); yield; }
}
// 每個新的擺設 ctx(= 每次建世界/換地圖)只做一次:歸零模組計數器(同地圖、同種子 → 每個客戶端結果相同)、外圍景
const begun = new WeakSet(), spent = new WeakMap(); // 每個 ctx 的戶外擺設耗時(ms)
function begin(ctx) { for (const _ of beginSteps(ctx)) { /* 同步跑完 */ } }
// [perf] 分段版:dressWorldSteps 在第一個戶外區域/障礙物之前先 yield* 這個(順序與同步版相同)
export function* beginSteps(ctx) {
  if (begun.has(ctx)) return;
  begun.add(ctx);
  initAll();
  resetEnv(); resetCars(); resetVehicles(); resetFurniture();
  let ms = 0, t0 = performance.now();
  try {
    const it = dressEdgesSteps(ctx);
    while (!it.next().done) { ms += performance.now() - t0; yield; t0 = performance.now(); }
  } catch (e) { console.error('[props-out] 外圍景失敗', e); }
  spent.set(ctx, ms + performance.now() - t0);
}
export function dressOutdoor(ctx, zone) {
  begin(ctx);
  const fn = THEMES[zone.theme];
  if (!fn) return;
  const t0 = performance.now();
  try { fn(ctx, zone); } catch (e) { console.error('[props-out] 擺設失敗', zone.id, e); }
  scene8Room(ctx, zone); // [scene8] 地下室工業房間、墓園、遊戲場的故事層(Room 規劃器:不擋路、碰撞照登記)
  spent.set(ctx, (spent.get(ctx) || 0) + performance.now() - t0);
}

// 大型障礙物:佔滿 rect 的格子並登記碰撞
export function dressObstacle(ctx, o) {
  begin(ctx);
  const t0 = performance.now();
  const ok = buildObstacle(ctx, o);
  spent.set(ctx, (spent.get(ctx) || 0) + performance.now() - t0);
  if (o === ctx.L.obstacles[ctx.L.obstacles.length - 1]) console.log('[props-out] 戶外擺設', Math.round(spent.get(ctx)), 'ms');
  if (ok) return;
  // 未知種類:有碰撞的方塊(確保碰撞/導航/視線正確)
  const h = 1.5;
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.sx * 0.9, h, o.sz * 0.9), ctx.mat('metal_gray'));
  m.position.set(o.x, o.y + h / 2, o.z);
  ctx.add(m, { collide: true });
}
