// 場景建構器的擴充點(新地圖用,不必改醫院的檔案):
//  registerStyles   主題 → 牆/地板/天花板配方與破舊度(style.js)
//  registerSurfaces 表面材質鍵 → 定義(surfaces.js);registerPbrSets 新的 PBR 貼圖組(pbr.js)
//  registerSignage  標示圖集的科別名稱、吊牌、告示、字跡(atlas.js;內容會隨地圖資料傳進貼圖 Worker)
//  registerEvents / registerEventBias 驚嚇事件種類與各區域的權重(events.js)
// 所有程序擺放都用以區域/位置雜湊的種子亂數 → 多人連線時各端建出一樣的地圖。
export { registerStyles } from './style.js';
export { registerSurfaces } from './surfaces.js';
export { registerPbrSets } from './pbr.js';
export { registerSignage } from './atlas.js';
export { registerEvents, registerEventBias } from './events.js';
