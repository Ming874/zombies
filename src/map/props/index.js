import { dressIndoor, INDOOR_THEMES } from './indoor.js';
import { dressOutdoor, dressObstacle, beginSteps, OUTDOOR_THEMES } from './outdoor.js';

// 道具擺設入口:依區域 theme 分派到室內 / 戶外工業兩個模組,再擺大型障礙物('X' 格)。
// 商店('shop' 主題)由 src/shop.js 自己建,這裡跳過。
export function dressWorld(ctx) { for (const _ of dressWorldSteps(ctx)) { /* 同步跑完 */ } }
// [perf] 分段版:每個區域/障礙物之後 yield(載入時由 main.js 分時執行,主執行緒不會被整個擺設流程佔住好幾秒)
export function* dressWorldSteps(ctx) {
  for (const zone of ctx.L.zones) {
    if (zone.theme === 'shop') continue;
    if (INDOOR_THEMES.has(zone.theme)) dressIndoor(ctx, zone);
    else if (OUTDOOR_THEMES.has(zone.theme)) { yield* beginSteps(ctx); dressOutdoor(ctx, zone); }
    yield;
  }
  for (const o of ctx.L.obstacles) { yield* beginSteps(ctx); dressObstacle(ctx, o); yield; }
}
