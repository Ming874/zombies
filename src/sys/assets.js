// ===== 網路資源佇列 → assets(貼圖、模型等「看得到但不是必要」的下載)=====
// 慢速網路(數百 KB/s)時,所有東西同時下載會讓關鍵檔(主程式、物理 Worker + WASM、殭屍建模 Worker)排在
// 幾十個貼圖/模型後面。這裡把非關鍵下載集中排隊:
//   - 閘門:main.js 在關鍵檔就緒(或最多等一段時間)後 assets.open(),之前只排隊不下載;按「開始遊戲」也會打開
//   - 同時下載數上限(選單 4、遊戲中 2:多人連線時不把下行頻寬塞滿),fetch 一律 priority:'low'
//   - 優先序:assets.setPriority(fn) → fn(item) 回傳數字(越小越先;依玩家位置每次挑選時重算)
//   - 圖片在背景執行緒解碼(createImageBitmap,已上下翻轉、不預乘、不做色彩轉換),每幀最多交付一張
//     (交付 = 呼叫端換上貼圖 → 那一幀才上傳 GPU;一次上傳十張會頓)
// API:
//   assets.image(url, { meta, prio }) → Promise<ImageBitmap | HTMLImageElement>
//   assets.task(fn, { meta, prio }) → 輪到時才執行 fn()(回傳 Promise,例如 GLTFLoader.loadAsync),佔一個下載名額直到完成
//   assets.progress → { total, done, failed, bytes, active, queued, open }
const G = globalThis;
const items = [];
const ready = []; // 已解碼、等待逐幀交付
let active = 0, opened = false, prioFn = null, seq = 0, dripArmed = false, dripTimer = 0;
const stat = { total: 0, done: 0, failed: 0, bytes: 0, t0: 0, tOpen: 0, tDone: 0 };
const listeners = new Set();
export const assets = {
  concurrency: 4,
  hiRes: true, // 基本貼圖都載完後是否換上 1K 顏色圖(低畫質關閉)
  prepare: null, // async (root, meta) → 模型交付前的準備(main.js 設為背景預編譯 shader)
  image(url, opts = {}) { return enqueue({ kind: 'image', url, ...opts }); },
  task(fn, opts = {}) { return enqueue({ kind: 'task', fn, ...opts }); },
  open(reason = '') {
    if (opened) return;
    opened = true;
    stat.tOpen = performance.now();
    if (reason) performance.mark?.('hz:assets-open:' + reason);
    pump();
  },
  get isOpen() { return opened; },
  setPriority(fn) { prioFn = fn; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get progress() { return { ...stat, active, queued: items.length, pending: ready.length, open: opened }; },
  get idle() { return opened && !items.length && !active && !ready.length; },
};

function enqueue(it) {
  stat.total++;
  if (!stat.t0) stat.t0 = performance.now();
  it.seq = seq++;
  it.prio ??= 50;
  return new Promise((resolve, reject) => {
    it.resolve = resolve; it.reject = reject;
    items.push(it);
    pump();
  });
}
function prio(it) {
  if (!prioFn || !it.meta) return it.prio;
  try { const p = prioFn(it); return Number.isFinite(p) ? p : it.prio; } catch { return it.prio; }
}
function pump() {
  if (!opened) return;
  while (active < assets.concurrency && items.length) {
    let bi = 0, bp = Infinity;
    for (let i = 0; i < items.length; i++) { const p = prio(items[i]) + items[i].seq * 1e-4; if (p < bp) { bp = p; bi = i; } }
    const it = items.splice(bi, 1)[0];
    active++;
    run(it).then((v) => finish(it, v, null), (e) => finish(it, null, e || new Error('load failed')));
  }
}
function finish(it, v, err) {
  active--;
  if (err) { stat.failed++; it.reject(err); emit(); pump(); return; }
  if (it.kind === 'image') { ready.push([it, v]); drip(); } else { stat.done++; it.resolve(v); emit(); }
  pump();
}
async function run(it) {
  if (it.kind === 'task') {
    const v = await it.fn();
    // 下載的模型:交給呼叫端(加進場景)之前先在背景把材質的 shader 編好,第一次畫到時才不會同步編譯卡住
    const root = v && (v.scene?.isObject3D ? v.scene : v.isObject3D ? v : null);
    if (root && assets.prepare) { try { await assets.prepare(root, it.meta); } catch { /* 編譯失敗就照舊在第一次繪製時編 */ } }
    return v;
  }
  const res = await fetch(it.url, { priority: 'low', credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${it.url}`);
  const blob = await res.blob();
  stat.bytes += blob.size;
  if (typeof G.createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { /* 退回 <img> */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image(), u = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(u); img.decode ? img.decode().then(() => resolve(img), () => resolve(img)) : resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('decode ' + it.url)); };
    img.src = u;
  });
}
// 每幀交付一張(rAF;分頁在背景時 rAF 停 → 用 setTimeout 慢慢交付)
function drip() {
  if (dripArmed || !ready.length) return;
  dripArmed = true;
  let fired = false;
  const step = () => {
    if (fired) return;
    fired = true;
    dripArmed = false;
    clearTimeout(dripTimer);
    const [it, v] = ready.shift();
    stat.done++;
    it.resolve(v);
    if (!items.length && !active && !ready.length) stat.tDone = performance.now();
    emit();
    drip();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
  dripTimer = setTimeout(step, 250);
}
function emit() { for (const fn of listeners) { try { fn(stat); } catch { /* 忽略 */ } } }
