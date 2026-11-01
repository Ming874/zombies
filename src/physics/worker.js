// 物理 Web Worker(module worker):Rapier 在背景執行緒步進,主執行緒只送命令、收姿態。
// crossOriginIsolated 時姿態寫在 SharedArrayBuffer(雙緩衝 + Atomics 序號,主執行緒同一幀就能讀到結果);
// 否則用可轉移(transferable)的 ArrayBuffer 來回傳遞,不複製也不產生垃圾。
import RAPIER from '@dimforge/rapier3d-compat';
import { createCore, OUT_LEN, H } from './core.js';

let core = null, ctl = null, bufs = null;
const epoch = () => performance.timeOrigin + performance.now(); // 與主執行緒比對用的絕對時間
self.postMessage({ t: 'boot', at: epoch() }); // 腳本已下載、模組已執行(接著 init 下載 WASM)

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      const t0 = performance.now(), tInit = epoch();
      await RAPIER.init();
      core = createCore(RAPIER);
      // 暖機:先讓 WASM 熱起來,第一次真正步進才不會卡
      core.exec([['sbox', -1, 0, -1, 0, 5, 0.5, 5], ['body', 0, 1, [0, 1, 0, 0, 0, 0, 1], null, [0, 0.2, 0.2, 0.2, 0, 0, 0, 0, 0, 0, 1], { mass: 1 }]]);
      for (let i = 0; i < 20; i++) core.step(H);
      core.exec([['reset'], ['sboxdel', -1]]);
      core.output(new Float32Array(OUT_LEN));
      core.takeEvents();
      if (m.sab) {
        ctl = new Int32Array(m.sab, 0, 4);
        bufs = [new Float32Array(m.sab, 16, OUT_LEN), new Float32Array(m.sab, 16 + OUT_LEN * 4, OUT_LEN)];
      }
      self.postMessage({ t: 'ready', ms: performance.now() - t0, sab: !!bufs, tInit, tReady: epoch() });
      return;
    }
    if (m.t !== 'frame' || !core) return;
    core.exec(m.cmds);
    core.step(m.dt);
    const events = core.takeEvents();
    if (bufs) {
      const s = Atomics.load(ctl, 0) + 1;
      core.output(bufs[s & 1]);
      Atomics.store(ctl, 0, s); // 寫完才更新序號:主執行緒看到新序號時資料一定完整
      self.postMessage({ t: 'out', events });
    } else {
      const out = m.buf ? new Float32Array(m.buf) : new Float32Array(OUT_LEN);
      core.output(out);
      self.postMessage({ t: 'out', buf: out.buffer, events }, [out.buffer]);
    }
  } catch (err) {
    self.postMessage({ t: 'error', message: String(err?.message || err) });
  }
};
