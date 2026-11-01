// 分頁在背景時 rAF 會停、主執行緒的 setTimeout 會被節流到每秒一次(久了甚至每分鐘一次)。
// 連線中仍需推進模擬(房主要跑殭屍與回合),改用 Worker 裡的計時器叫醒主執行緒(Worker 計時器不受那種節流)。
// 用法:const t = backgroundTicker((dt) => game.update(dt), 20); t.start(); … t.stop();
export function backgroundTicker(fn, hz = 20) {
  let w = null, id = 0, last = 0;
  const tick = () => {
    const t = performance.now();
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
    last = t;
    try { fn(dt); } catch (e) { console.error(e); }
  };
  return {
    start() {
      if (w || id) return;
      last = performance.now();
      try {
        const url = URL.createObjectURL(new Blob([`let i=0;onmessage=(e)=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(0),e.data)}`], { type: 'text/javascript' }));
        w = new Worker(url);
        URL.revokeObjectURL(url);
        w.onmessage = tick;
        w.postMessage(1000 / hz);
      } catch {
        w = null;
        id = setInterval(tick, 1000 / hz); // 退而求其次(會被節流,但至少不會完全停)
      }
    },
    stop() {
      if (w) { w.terminate(); w = null; }
      if (id) { clearInterval(id); id = 0; }
    },
    get running() { return !!(w || id); },
  };
}
