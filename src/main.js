import { Game } from './game.js';
import { Quality } from './sys/quality.js';
import { precompile, precompilePasses, initPrograms, warmPMREM, uploadSceneTextures, yieldNow, runSliced, gpuDrain, warmCubeFromEquirect, warmShadows, warmDrawScene } from './sys/warmup.js';
import { prewarm } from './zombies/model.js';
import { loadRealistic } from './zombies/realistic.js'; // 寫實殭屍(載入本模組即註冊變體數,要在 prewarm 之前)
import { assets } from './sys/assets.js';
import { installStreaming } from './sys/stream.js';
import { uploads } from './sys/uploads.js';
import * as audio from './audio.js';

// 載入流程取自 test 分支 src/main.js(去掉多人連線、劇情、靈異、物理):
// 世界分段建構(每段之後讓出主執行緒,選單照常可用)→ 畫質管理 → 背景預編譯 shader、上傳貼圖 → 才開始畫第一幀。
performance.mark('hz:boot');
prewarm(); // 殭屍變體:有 Worker 時立刻全部平行送到 Worker 池建模

const startBtn = document.getElementById('startBtn');
const label = startBtn.textContent;
startBtn.disabled = true;
startBtn.textContent = '載入中…';
let steps = 0;

const game = new Game(document.getElementById('game'), { deferred: true });
await runSliced(game.buildSteps(), { budget: 12, onStep: (n) => { steps = n; if (!(n % 10)) startBtn.textContent = `載入中… ${Math.min(95, Math.round(n / 2.6))}%`; } });
game.bindInput();
window.__game = game; // 除錯用:在瀏覽器 console 操作 __game

// ---- 效能基礎建設 ----
game.renderer.info.autoReset = false; // 一幀內多個 pass 的 draw call 合計(主迴圈每幀歸零)
game.quality = new Quality(game); // 畫質預設檔(依 GPU 自動挑選)+ 動態解析度(src/sys/quality.js)
installStreaming(game); // 貼圖下載順序:玩家附近 → 同層 → 其他樓層
uploads.attach(game.renderer); // 串流貼圖每幀最多上傳一張
// 下載的模型交付前:先在背景編好 shader(含實例池版本),再把貼圖逐幀上傳 → 第一次畫到時不會同步編譯/上傳
assets.prepare = async (root) => {
  await precompile(game, root, { instanced: true });
  const tex = new Set();
  root.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap']) if (m?.[k]?.image) tex.add(m[k]); });
  for (const t of tex) await uploads.add(t);
};
loadRealistic(); // 寫實殭屍模型排進下載佇列
assets.hiRes = game.quality.preset !== 'low'; // 低畫質:不下載 1K 顏色圖
game.quality.on('change', (k, q) => { assets.hiRes = q.preset !== 'low'; game.hospital.setQuality?.(q); });
game.hospital.setQuality?.(game.quality); // 光源池大小、道具顯示距離跟著畫質
assets.open('built');
{
  const begin0 = game.begin;
  game.begin = function (...a) { assets.concurrency = 3; return begin0.apply(this, a); };
}

// ---- 主迴圈 ----
let last = performance.now(), raf = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dtMs = now - last;
  last = now;
  const dt = Math.min(0.05, Math.max(0, dtMs / 1000)); // dt 上限:卡頓或切回分頁時不會一次跳太遠
  game.renderer.info.reset();
  const t0 = performance.now();
  game.update(dt);
  const t1 = performance.now();
  game.quality.beginGpu();
  game.render();
  game.quality.endGpu();
  const t2 = performance.now();
  game.quality.sample(dtMs, t2 - t0, t2 - t1);
}

// ---- 分頁隱藏:暫停(停止渲染、暫停音訊) ----
let audioSuspended = false;
document.addEventListener('visibilitychange', () => {
  const ctx = audio._internal?.A?.ctx;
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    if (game.state === 'playing' && !game.paused && !game.shopUIOpen) { game.paused = true; game.ui.overlay('pause', true); }
    if (ctx && ctx.state === 'running') { ctx.suspend(); audioSuspended = true; }
  } else {
    if (audioSuspended && ctx) ctx.resume();
    audioSuspended = false;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
});

// ---- 啟動:世界 shader 先在背景編好、貼圖上傳完再開始畫(第一幀不會整個卡住) ----
async function boot() {
  await yieldNow();
  try {
    // 等距柱狀環境貼圖的 PMREM shader 先在背景編好(否則預編譯途中 three 就地轉換 → 同步等編譯)
    await Promise.all([warmPMREM(game, [game.scene, game.weaponScene]), warmCubeFromEquirect(game)]);
    const all = Promise.all([
      precompile(game, game.scene),
      precompile(game, game.weaponScene, { target: game.weaponScene, camera: game.weaponCamera, shadows: false }),
      precompilePasses(game),
      game.weather?.occ?.precompile?.(), // 遮雨圖覆寫材質的變體
    ]);
    const res = await Promise.race([all, new Promise((r) => setTimeout(() => r(null), 60000))]);
    if (res) await initPrograms(new Set([...res[0].programs, ...res[1].programs]));
  } catch (e) { console.warn('[warmup]', e); }
  // 開始畫面前:貼圖上傳、每個物件離屏畫一次(幾何上傳 / 頂點格式變體),分批、每批之間讓出主執行緒
  try {
    await uploadSceneTextures(game);
    await warmShadows(game);
    await warmDrawScene(game, { all: true, batch: 16 });
    if (game.deferRainBake) { game.deferRainBake = false; await gpuDrain(game.renderer, 3000); game.weather?.bakeNow?.(); }
    await gpuDrain(game.renderer, 3000);
  } catch (e) { console.warn('[warmup]', e); }
  performance.mark('hz:warm'); // 地圖(M)在選單閒置時先把紙張與各層圖面畫好(src/ui/map.js)
  last = performance.now();
  if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  startBtn.disabled = false;
  startBtn.textContent = label;
  console.log('[boot]', JSON.stringify({ steps, ms: Math.round(performance.now()) }));
}
boot();
