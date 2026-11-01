import * as THREE from 'three';
import { Game } from './game.js';
import { Quality } from './sys/quality.js';
import { Perf } from './sys/perf.js';
import { caps } from './sys/caps.js';
import { idle } from './sys/sched.js';
import { precompile, precompilePasses, initPrograms, warmDraw, warmDrawScene, warmPMREM, uploadSceneTextures, yieldNow, runSliced, gpuDrain, warmCubeFromEquirect, warmShadows } from './sys/warmup.js';
import { backgroundTicker } from './sys/ticker.js';
import { texStats, texturesReady } from './sys/texworker.js';
import { prewarm, whenTypesReady, variantStats, getVariant, instantiate, forceVariant, VARIANT_TYPES } from './zombies/model.js';
import { allMaterials as allZombieMaterials } from './zombies/materials.js';
import { loadRealistic, realisticMaterials, realisticStats } from './zombies/realistic.js'; // 寫實殭屍(載入本模組即註冊變體數,要在 prewarm 之前)
import { stainWarmMesh } from './art/stainmat.js';
import * as audio from './audio.js';
import { initNet } from './net/lobby.js';
import { installHorror } from './horror/index.js';
import { installDeduce } from './story/deduce.js';
import { installObjectives } from './story/objectives.js';
import { installMotion } from './ui/motion.js';
import { startPhysicsWorker, physicsLoad } from './physics/index.js';
import { assets } from './sys/assets.js';
import { installStreaming } from './sys/stream.js';
import { loadUI } from './sys/loadui.js';
import { pools } from './sys/workers.js';
import { uploads } from './sys/uploads.js';
import { initGpuHint, gpuLabel } from './ui/gpuhint.js';

performance.mark('hz:boot');
let game = null;
let warmStage = 0; // 戰鬥用 shader 預熱進度(0..4,4 = hz:warm)
installPWA();

// ---- 關鍵檔先下載:物理 Worker(+WASM)與殭屍建模 Worker 在建世界(數秒的同步工作)之前就開始抓;
//      貼圖/模型在 assets 佇列等閘門打開(關鍵檔就緒、最多 12 秒、或玩家按開始)才依距離排序下載 ----
startPhysicsWorker();
prewarm();
// Chrome 的模組 Worker 要主執行緒有空檔才會真正開始執行;接下來建世界是好幾秒的同步工作 →
// 先讓出主執行緒到 Worker 開機(腳本已下載並執行:物理開始抓 WASM、殭屍開始在背景建模),最多等 2.5 秒。
// 建模池的每一個 Worker 都要等到:只等第一個的話,其餘幾個要等建世界做完才開機,變體(與戰鬥 shader 預熱)晚 7~8 秒
await new Promise((resolve) => {
  const t0 = performance.now();
  const tick = () => {
    const ph = physicsLoad.state, mp = pools.find((p) => p.name === 'model');
    const physUp = ph !== 'script', modelUp = !mp || mp.failed || (mp.slots.length > 0 && mp.slots.every((s) => s.ready || s.dead));
    if ((physUp && modelUp) || performance.now() - t0 > 2500) { performance.mark(modelUp ? 'hz:workers' : 'hz:workers:timeout'); resolve(); } else setTimeout(tick, 10);
  };
  tick();
});
let buildSteps = 0, built = false; // 世界分段建構的進度(載入條用)
const loading = loadUI(() => {
  const p = game?.physics, v = variantStats(), a = assets.progress, ph = physicsLoad.state;
  const physOK = !p ? 0 : p.ready || p.failed || ph === 'off' || ph === 'failed' ? 1 : ph === 'wasm' || ph === 'main' ? 0.55 : 0.15;
  const fin = a.done + a.failed;
  return {
    playing: game?.state === 'playing',
    steps: [
      ['世界', built ? 1 : Math.min(0.95, buildSteps / 260), built ? '' : '建構中', 2],
      ['物理', physOK, ph === 'wasm' ? '編譯中' : ph === 'main' ? '載入中' : '下載中'],
      ['殭屍', v.ready / v.total, `${v.ready}/${v.total}`],
      ['著色器', warmStage / 4, warmStage ? '編譯中' : '等待中'],
      ['貼圖與模型', a.total ? fin / a.total : a.open ? 1 : 0, a.open ? `${fin}/${a.total}${a.bytes ? ' · ' + (a.bytes / 1048576).toFixed(1) + ' MB' : ''}` : '等待中', 3],
    ],
  };
});

// 世界分段建構(src/game.js buildSteps):每段之後讓出主執行緒 → 建構期間選單可操作、載入條會動、Worker 結果照常處理。
// 建構中按「開始」:先記下,建好後再開始(spawn 仍等 hz:warm)
game = new Game(document.getElementById('game'), { deferred: true });
let earlyStart = false;
const onEarlyStart = (e) => { if (!built && e.target?.closest?.('#startBtn')) { earlyStart = true; e.stopPropagation(); const b = e.target.closest('#startBtn'); b.classList.add('loading'); b.dataset.label ||= b.firstChild?.textContent || ''; if (b.firstChild) b.firstChild.textContent = '載入中…'; } };
document.addEventListener('click', onEarlyStart, true);
await runSliced(game.buildSteps(), { budget: 12, onStep: (n) => { buildSteps = n; } });
built = true;
document.removeEventListener('click', onEarlyStart, true);
game.warmed = false; // hz:warm 之前開局:先不出怪(flow.updateRound),第一隻殭屍出現時不會現場編譯 shader
game.bindInput();
initNet(game); // [net] 主選單的多人連線入口(src/net/lobby.js)
installHorror(game); // [ghost] 靈異系統:驚嚇導演、耳語、幻影、靈異事件(src/horror)
installDeduce(game); // [story] 線索卡、推理本(J)、擲筊、頭七(src/story)
installObjectives(game); // [story] 目標鏈、區域解鎖、提示(src/story/objectives.js)
installMotion(game); // [motion] 轉場與手感:開機、開場、燈篙節拍、受傷、倒下、暫停(src/ui/motion.js;全部是 post 的 uniform)
window.__game = game; // 除錯用:在瀏覽器 console 操作 __game
if (earlyStart) { // 建構途中按過開始:現在照常開始(按鈕的處理在 bindInput 才綁上)
  const b = document.getElementById('startBtn');
  if (b) { b.classList.remove('loading'); if (b.firstChild && b.dataset.label) b.firstChild.textContent = b.dataset.label; setTimeout(() => b.onclick?.(), 0); }
  // 不是在使用者手勢裡開局 → 瀏覽器不給滑鼠鎖定:開局後(開場演出結束)還沒鎖定就顯示暫停層,玩家點一下即鎖定繼續
  let tries = 0;
  const iv = setInterval(() => {
    if (++tries > 240) { clearInterval(iv); return; }
    if (game.state !== 'playing' || game.motion?.busy) return;
    clearInterval(iv);
    if (document.pointerLockElement !== game.canvas && !game.paused) { game.paused = true; game.ui.overlay('pause', true); }
  }, 250);
}

// ---- 效能基礎建設 ----
game.renderer.info.autoReset = false; // 一幀內多個 pass 的 draw call 合計(主迴圈每幀歸零)
game.renderer.debug.checkShaderErrors = !import.meta.env.PROD; // 正式版不查 shader 錯誤日誌(那些查詢會同步等編譯完成)
game.quality = new Quality(game); // 畫質預設檔 + 動態解析度(src/sys/quality.js)
game.perf = new Perf(game); // F3 效能面板(src/sys/perf.js)
if (caps.flags.has('gpuprof')) game.quality.gpu.detail = true; // ?gpuprof:逐 pass 計 GPU 時間(src/gfx/gpuprof.js)
prewarm(); // 殭屍變體:有 Worker 時立刻全部平行送到 Worker 池建模
performance.mark('hz:game');
window.__perfVariants = variantStats; // 測試用
window.__forceVariant = forceVariant; // 測試用:下一隻生成的殭屍用指定變體
window.__assets = assets; // 測試用:下載佇列進度
window.__physLoad = physicsLoad;
installStreaming(game); // 下載順序:玩家附近 → 同層 → 其他樓層
uploads.attach(game.renderer); // 串流貼圖每幀最多上傳一張(src/sys/uploads.js)
// 下載的模型交付前:先在背景編好 shader(含實例池版本),再把貼圖逐幀上傳 → 加進場景、第一次畫到時不會同步編譯/上傳
assets.prepare = async (root) => {
  await precompile(game, root, { instanced: true });
  const tex = new Set();
  root.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap']) if (m?.[k]?.image) tex.add(m[k]); });
  for (const t of tex) await uploads.add(t);
};
loadRealistic(game); // 寫實殭屍模型排進下載佇列(低畫質不載)
window.__realistic = realisticStats; // 測試用
assets.hiRes = game.quality.preset !== 'low'; // 低畫質:不下載 1K 顏色圖(省頻寬與顯示記憶體)
game.quality.on('change', (k, q) => { assets.hiRes = q.preset !== 'low'; });
game.hospital.setQuality?.(game.quality); // 光源池大小、道具顯示距離跟著畫質
game.quality.on('change', (k, q) => game.hospital.setQuality?.(q));
{
  const t0 = performance.now();
  const gate = setInterval(() => {
    const v = variantStats(), ph = physicsLoad.state;
    const ok = (ph === 'ready' || ph === 'failed' || ph === 'off') && (v.ready >= v.total || !v.pool || v.pool.failed);
    if (ok || performance.now() - t0 > 10000) { clearInterval(gate); assets.open(ok ? 'critical' : 'timeout'); }
  }, 100);
  const begin0 = game.begin;
  game.begin = function (...a) { assets.open('start'); assets.concurrency = 3; return begin0.apply(this, a); }; // 遊戲中少開幾條連線(多人時不塞滿下行)
}

game.perf.source('顯示卡', () => gpuLabel(game.quality.detected?.gpu)); // 雙顯卡筆電常用到內顯,面板上直接看得到
initGpuHint(game); // 內顯 / 軟體算圖時在主選單提醒切換高效能 GPU
game.perf.source('殭屍', () => {
  const v = variantStats();
  const alive = game.zombies ? game.zombies.filter((z) => z.alive).length : 0;
  return `${alive} 隻  變體 ${v.ready}/${v.total}(Worker ${v.worker}、同步 ${v.sync}${v.warmMs != null ? `、${v.warmMs}ms` : ''})`;
});
game.perf.source('貼圖', () => `Worker ${texStats.worker}  主執行緒 ${texStats.main}${texStats.pending ? `  畫圖中 ${texStats.pending}` : ''}`);
game.perf.source('物理', () => {
  const p = game.physics;
  if (!p) return null;
  const c = game.perf.custom.physics;
  const ms = c ? c.ms : p.stats?.ms ?? p.ms ?? p.stepMs ?? p.lastStepMs;
  return ms != null ? `${ms.toFixed(2)} ms${p.stats?.bodies != null ? `  剛體 ${p.stats.bodies}` : ''}` : '—';
});

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
  game.perf.frame(dtMs, t0, t1 - t0, t2 - t1);
  game.quality.sample(dtMs, t2 - t0, t2 - t1);
}

// ---- 分頁隱藏:單人暫停(停止渲染、暫停音訊);連線中改由 Worker 計時器在背景繼續模擬(不渲染) ----
const bg = backgroundTicker((dt) => game.update(Math.min(0.05, dt)), 20);
let audioSuspended = false;
document.addEventListener('visibilitychange', () => {
  const ctx = audio._internal?.A?.ctx;
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = 0;
    if (game.net) { bg.start(); return; }
    if (game.state === 'playing' && !game.paused && !game.shopUIOpen) { game.paused = true; game.ui.overlay?.('pause', true); }
    if (ctx && ctx.state === 'running') { ctx.suspend(); audioSuspended = true; }
  } else {
    bg.stop();
    if (audioSuspended && ctx) ctx.resume();
    audioSuspended = false;
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
});

// ---- 啟動:世界 shader 先在背景編好再開始畫(第一幀不會整個卡住),最多等 4 秒 ----
let sceneReady = null; // 場景 program 全部可用時 resolve(warmRuntime 的離屏繪製要等它,否則會在繪製時同步編譯場景材質)
async function boot() {
  let ready;
  sceneReady = new Promise((r) => { ready = r; });
  // 光源數量是 shader 參數:第一次 updateCombat 才加進場景的爆炸閃光燈(boomLight)若在預編譯之後才出現,
  // 第一幀會把全部 program 同步重編一次(慢機器上 5~15 秒的凍結)→ 預編譯前先初始化
  game.initCombat?.();
  // 殭屍與常見特效材質:每種殭屍的第一個變體一建好就預編譯(與場景預編譯平行,不等它做完)
  const warmed = whenTypesReady().then(() => { performance.mark('hz:variants'); warmStage = 1; return idle(warmRuntime, 300); })
    .catch((e) => console.warn('[warmup]', e)).finally(() => {
      warmStage = 4; game.warmed = true;
      // [motion] 商店 3D 預覽(獨立的小 context)在選單閒置時先建好、shader 先編(含環境貼圖的 PMREM):第一次開店不卡
      setTimeout(() => { if (!game.ui.shop.game) game.ui.shop.game = game; game.ui.shop.warm?.(); }, 1200);
    });
  await yieldNow(); // 先讓模組執行完(DOMContentLoaded、選單可互動),編譯分批在之後的任務裡做
  const t = performance.now();
  try {
    // 等距柱狀環境貼圖的 PMREM shader 先在背景編好(否則預編譯途中 three 就地轉換 → 同步等編譯 1~2 秒)
    await Promise.all([warmPMREM(game, [game.scene, game.weaponScene]), warmCubeFromEquirect(game)]);
    performance.mark('hz:pmrem');
    const all = Promise.all([
      precompile(game, game.scene),
      precompile(game, game.weaponScene, { target: game.weaponScene, camera: game.weaponCamera, shadows: false }),
      precompilePasses(game),
      game.weather?.occ?.precompile?.(), // 遮雨圖覆寫材質的變體(烘焙延到下面幾何上傳完之後)
    ]);
    // 等全部 program 編好才開始畫(不再用 4 秒逾時:先畫的話第一幀會在主執行緒上同步等還沒編完的 shader,數秒凍結);
    // 編譯期間選單與載入條照常可用。最多等 60 秒
    const res = await Promise.race([all, new Promise((r) => setTimeout(() => r(null), 60000))]);
    performance.mark('hz:compiled');
    if (res) {
      game.perf.time('預編譯', performance.now() - t);
      await initPrograms(new Set([...res[0].programs, ...res[1].programs]));
      performance.mark('hz:programs');
    }
  } catch (e) { console.warn('[warmup]', e); }
  // 開始畫面前:貼圖上傳、每個物件離屏畫一次(幾何上傳 / ANGLE 頂點格式變體),分批、每批之間讓出主執行緒
  try {
    const t2 = performance.now();
    await uploadSceneTextures(game);
    await warmShadows(game);
    await warmDrawScene(game, { all: true, batch: 16 });
    // 先等 GPU 把離屏繪製做完(不然烘焙的讀回會在主執行緒上等整串繪製),烘焙後再等一次才開始畫面
    if (game.deferRainBake) { game.deferRainBake = false; await gpuDrain(game.renderer, 3000); game.weather?.bakeNow?.(); }
    await gpuDrain(game.renderer, 3000);
    performance.measure('hz:prewarm', { start: t2 });
  } catch (e) { console.warn('[warmup]', e); }
  performance.measure('hz:precompile', { start: t });
  ready();
  // [perf6] 殭屍/特效材質的離屏繪製(warmRuntime 最後一步,hz:warm)通常在開始畫面出現後 0.3~0.5 秒才落地:
  // 第一次真的畫到這些蒙皮/特效變體時 ANGLE 在 GPU 行程編 D3D shader(實測 0.6~0.8 秒),剛開始動的選單畫面整個停住。
  // 開始畫面前先等它做完(最多 3 秒,慢機器上殭屍變體還沒建好就不等)並等 GPU 消化,停頓留在載入畫面裡
  await Promise.race([warmed, new Promise((r) => setTimeout(r, 3000))]);
  await gpuDrain(game.renderer, 3000);
  performance.mark('hz:firstframe');
  last = performance.now();
  if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  // 殭屍與常見特效材質:每種殭屍的第一個變體一建好就在閒置時段預編譯(不等全部變體、也不等貼圖下載),
  // 第一隻殭屍出現/第一槍不會頓一下
}
boot();

async function warmRuntime() {
  const g = new THREE.Group();
  const inst = instantiate(getVariant('walker', 0));
  const ZM = [...allZombieMaterials(), ...realisticMaterials()], its = []; // [zombies-w3] 全部殭屍材質(含新類型的眼睛、刀刃、鏡片、寫實殭屍)
  inst.mesh.material = ZM; // 只編譯、不渲染
  g.add(inst.mesh);
  for (const o of game.deduce?.warmObjects?.() || []) g.add(o); // [story] 筊杯
  g.add(stainWarmMesh()); // 寫實血跡材質(靜態貼花、血泊、滴落血漬共用)
  for (const o of game.horror?.warmObjects?.() || []) g.add(o); // [ghost] 靈異材質(幻影、痕跡、字跡、寒氣)一起預編譯與離屏畫一次
  // 執行期才會建立的常見材質型態(曳光、血池/貼花、光暈與血條 sprite、粒子):program 只看功能旗標(貼圖/霧…),不看顏色數值
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  const line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), quad = new THREE.PlaneGeometry(1, 1);
  for (const fog of [true, false]) {
    g.add(new THREE.Line(line, new THREE.LineBasicMaterial({ fog, transparent: true })));
    for (const map of [tex, null]) {
      g.add(new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ fog, map, transparent: true })));
      g.add(new THREE.Sprite(new THREE.SpriteMaterial({ fog, map, transparent: true })));
    }
  }
  performance.mark('hz:warm:start');
  const own = game.interact?.warmList?.() || []; // [interact] 互動物件與門(BatchedMesh 變體與陰影深度變體):跟著 hz:warm 編好
  const [res, resIx] = await Promise.all([precompile(game, g), own.length ? precompile(game, { traverse: (fn) => { for (const o of own) o.traverse(fn); }, updateMatrixWorld() {} }) : null]);
  if (resIx) for (const p of resIx.programs) res.programs.add(p);
  performance.mark('hz:warm:compiled');
  warmStage = 2;
  await initPrograms(res.programs);
  performance.mark('hz:warm:init');
  warmStage = 3;
  await texturesReady();
  performance.mark('hz:warm:tex');
  await sceneReady;
  // 再真的畫一次(離屏):每種殭屍材質 × 蒙皮頂點格式、特效物件,連同陰影 pass
  await idle(() => {
    const v = getVariant('walker', 0), draws = new THREE.Group();
    inst.mesh.material = v.materials;
    draws.add(inst.mesh);
    for (const t of VARIANT_TYPES) { const it = instantiate(getVariant(t, 0)); its.push(it.mesh.skeleton); draws.add(it.mesh); } // [zombies-w3] 每種類型各畫一次(頂點格式/材質組合),新類型第一次出現不會頓
    for (const m of ZM) {
      const sm = new THREE.SkinnedMesh(v.geometry, m);
      sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix);
      // 排序也要包圍球:沒給的話 three 會逐頂點蒙皮算一次(每個代理 ~40k 頂點,合計 ~170ms 長任務)
      if (!v.geometry.boundingSphere) v.geometry.computeBoundingSphere();
      sm.boundingSphere = (inst.mesh.boundingSphere || v.geometry.boundingSphere).clone();
      draws.add(sm);
    }
    for (const o of [...g.children]) if (o !== inst.mesh) draws.add(o);
    warmDraw(game, [draws]);
  }, 300);
  inst.mesh.skeleton.dispose();
  for (const s of its) s.dispose();
  performance.mark('hz:warm');
  return res;
}

// ---- PWA:manifest、圖示;正式版才註冊 Service Worker(public/sw.js) ----
function installPWA() {
  const head = document.head, base = import.meta.env.BASE_URL || '/';
  const link = (rel, href, extra = {}) => { if (head.querySelector(`link[rel="${rel}"]`)) return; const l = document.createElement('link'); l.rel = rel; l.href = href; Object.assign(l, extra); head.appendChild(l); };
  link('manifest', base + 'manifest.webmanifest');
  link('icon', base + 'icons/icon.svg', { type: 'image/svg+xml' });
  link('apple-touch-icon', base + 'icons/icon-192.png');
  if (!head.querySelector('meta[name="theme-color"]')) { const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#050606'; head.appendChild(m); }
  // 動態載入的程式片段已不存在(舊分頁遇上新部署且快取裡沒有):重新整理拿新版。遊戲/連線中不打斷,回到選單才重整
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault?.();
    console.warn('[sw] 程式片段載入失敗,回到選單時重新整理', e.payload?.message || '');
    const t = setInterval(() => { if (!game || (game.state !== 'playing' && !game.net)) { clearInterval(t); location.reload(); } }, 1000);
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || caps.flags.has('nosw')) return;
  // 固定網址 sw.js:build 會把檔案清單與雜湊寫進 sw.js(vite.config.js),內容每版都不同 →
  // 瀏覽器每次導覽都會比對,新版一部署就安裝(不用等這裡註冊)。第一次註冊等關鍵檔下載完(資源閘門打開),
  // 安裝時預先快取程式碼才不會跟第一次載入搶頻寬
  const t0 = performance.now();
  const t = setInterval(() => {
    if (!assets.isOpen && performance.now() - t0 < 30000) return;
    clearInterval(t);
    // 網址相同時 register 不會檢查更新(瀏覽器自己的導覽後檢查會延遲約一分鐘)→ 主動 update():新部署立刻安裝
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).then((r) => r.update()).catch((e) => console.warn('[sw]', e.message));
  }, 500);
}
