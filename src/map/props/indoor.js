// 室內道具與房間擺設(醫療、公共空間、辦公、宗教、兒童、地下室室內房間)。
// 每個 theme 一個擺設函式(src/map/props/indoor/th_*.js),道具模型在 src/map/props/indoor/*.js。
// 規劃器 Room(indoor/place.js)負責:不擋路的可達性檢查、碰撞登記(ctx.add)、區域內依材質合併、實例化小物件、可推動道具。
import { Room } from './indoor/place.js';
import { THEMES } from './indoor/themes.js';
import { dressVignette } from './indoor/vignettes.js';
import { stairMark } from './indoor/story.js';
import { roomStory } from './indoor/story5.js';
import { dressSars } from './indoor/sars.js';
import { dressServices } from './indoor/services.js';
import { scene8Indoor } from './indoor/scene8.js';

export const INDOOR_THEMES = new Set([
  'xray', 'ct', 'pharmacy', 'cafeteria', 'rehab', 'waiting', 'er', 'chapel', 'lobby', 'security', 'corridor', 'stairwell',
  'ward', 'surgery', 'icu', 'nursery', 'delivery', 'playroom', 'peds_ward',
  'director', 'office', 'psych_cell', 'monitor', 'dorm',
  'morgue', 'autopsy', 'archive', 'laundry', 'supply',
]);

export function dressIndoor(ctx, zone) {
  const fn = THEMES[zone.theme];
  if (!fn) return;
  const R = new Room(ctx, zone);
  try {
    fn(R, zone);
    dressVignette(R, zone); // 環境敘事小場景(路障、檢傷、隔離、血跡…)
    dressSars(R, zone); // 2003 SARS 封院:量體溫站、口罩/防護衣、隔離告示、封鎖膠帶、塑膠布
    if (zone.theme === 'stairwell') stairMark(R, zone); // [scene r4] 樓梯間的大樓層數字
    roomStory(R, zone); // [scene r5] ICU/小兒科/產房/院長室/廣播室/監控室/洗衣房的故事層
    scene8Indoor(R, zone); // [scene8] 監控室、ICU 護理站牆、餐廳封院層、小兒病房、洗衣房晾衣架…
    dressServices(R, zone); // [scene6] 設備層:緊急照明燈、乾洗手機、避難方向指示燈、護角、磨耗與泥腳印
  } catch (e) {
    console.warn('[props-in] 擺設失敗', zone.id, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
  }
  R.done();
}
