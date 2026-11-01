// 背景工作排程:requestIdleCallback(Safari 沒有時用 setTimeout 模擬,每次最多給 8ms)
const ric = typeof requestIdleCallback === 'function'
  ? (cb, o) => requestIdleCallback(cb, o)
  : (cb) => setTimeout(() => { const t = performance.now(); cb({ didTimeout: false, timeRemaining: () => Math.max(0, 8 - (performance.now() - t)) }); }, 1);

// 單次:在下一個閒置時段執行 fn(deadline),回傳 Promise<fn 的結果>
export function idle(fn, timeout = 1000) {
  return new Promise((res, rej) => ric((dl) => { try { res(fn(dl)); } catch (e) { rej(e); } }, { timeout }));
}

// 佇列:一個閒置時段內盡量多跑幾個小工作(每個工作應 < 幾 ms;大工作請自己切塊)
const queue = [];
let armed = false;
function pump(dl) {
  armed = false;
  while (queue.length && (dl.didTimeout || dl.timeRemaining() > 2)) {
    const { fn, res, rej } = queue.shift();
    try { res(fn()); } catch (e) { rej(e); }
  }
  if (queue.length) arm();
}
function arm() { if (!armed) { armed = true; ric(pump, { timeout: 4000 }); } }
export function idleTask(fn) {
  return new Promise((res, rej) => { queue.push({ fn, res, rej }); arm(); });
}
export const idleQueued = () => queue.length;

// 閒置時預先抓資源(進 HTTP 快取 / Service Worker 快取),之後真正載入時不卡網路
export function preload(urls) {
  return Promise.all(urls.map((u) => idleTask(() => fetch(u, { priority: 'low' }).then((r) => r.ok && r.arrayBuffer()).catch(() => null))));
}
