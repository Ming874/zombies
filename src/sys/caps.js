// 瀏覽器能力偵測(模組載入時算一次;主執行緒與 Worker 都能 import,不碰 DOM)
const G = globalThis;
const nav = G.navigator || {};
const inWorker = typeof G.WorkerGlobalScope !== 'undefined' && G instanceof G.WorkerGlobalScope;

function moduleWorkerOK() {
  if (inWorker || typeof G.Worker === 'undefined') return false;
  let ok = false;
  try { new G.Worker('blob://', { get type() { ok = true; return 'module'; } }).terminate(); } catch { /* 只是測試選項是否被讀取 */ }
  return ok;
}
function offscreen2d() {
  try { return typeof G.OffscreenCanvas !== 'undefined' && !!new G.OffscreenCanvas(1, 1).getContext('2d'); } catch { return false; }
}

export const caps = {
  inWorker,
  cores: Math.max(1, nav.hardwareConcurrency || 4),
  memory: nav.deviceMemory || 0, // GB(只有 Chromium 有)
  moduleWorker: moduleWorkerOK(),
  offscreen: offscreen2d(),
  imageBitmap: typeof G.createImageBitmap === 'function',
  // 跨來源隔離(COOP: same-origin + COEP: require-corp)才能用 SharedArrayBuffer;沒有時一律走 postMessage
  isolated: !!G.crossOriginIsolated,
  sab: !!G.crossOriginIsolated && typeof G.SharedArrayBuffer === 'function',
  idle: typeof G.requestIdleCallback === 'function',
  heap: !!(G.performance && G.performance.memory),
  // 除錯旗標:?noworker 強制走同步備援;?perf 一開始就打開效能面板並寫 performance.measure
  flags: (() => { try { return new URLSearchParams(G.location?.search || ''); } catch { return new URLSearchParams(); } })(),
};
caps.useWorkers = caps.moduleWorker && !caps.flags.has('noworker');
