// 自動註冊 src/**/*.paint.js 的所有具名匯出函式為貼圖產生器(主執行緒與貼圖 Worker 共用同一份)。
// 鍵 = 'src 下的路徑去掉 .paint.js' + ':' + 函式名,例如 src/zombies/materials.paint.js 的 skin → 'zombies/materials:skin'
const mods = import.meta.glob('../**/*.paint.js', { eager: true });
export const PAINTERS = {};
for (const [path, m] of Object.entries(mods)) {
  const ns = path.replace(/^\.\.\//, '').replace(/\.paint\.js$/, '');
  for (const [name, fn] of Object.entries(m)) if (typeof fn === 'function') PAINTERS[`${ns}:${name}`] = fn;
}
