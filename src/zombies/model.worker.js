import { serve } from '../sys/workers.js';
import { pack } from '../sys/pack.js';
import { buildShape } from './model.js';

// 殭屍變體建模 Worker:在背景執行緒跑 buildShape(純數學:管狀體、頭部雕塑、位移、頂點上色、蒙皮權重、合併),
// 把 position/normal/uv/color/skinIndex/skinWeight/index 等 TypedArray + 骨架/命中盒資料零複製傳回主執行緒。
// 注意:model.js 的 import 鏈在模組頂層不可碰 DOM(document/window),否則這個 Worker 載入失敗、會自動退回同步建模。
serve({
  build: (type, seed, opt) => pack(buildShape(type, seed, opt)),
});
