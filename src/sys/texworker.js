import * as THREE from 'three';
import { caps } from './caps.js';
import { createPool } from './workers.js';
import { PAINTERS } from './painters.js';

// ===== 程式生成貼圖:在 Worker 用 OffscreenCanvas 畫好,以 ImageBitmap 傳回 =====
//
// 1) 把產生器寫在任一個 src/**/xxx.paint.js(會被自動註冊,主執行緒與 Worker 共用;不用改其他檔):
//      export function wall(make, args) {           // args 必須可 structured clone(數字/字串/陣列/物件)
//        const [c, ctx] = make(512, 512);            // make(w, h, { read: true }) → 會大量 getImageData 時加 read
//        ...只用 Canvas 2D API 作畫...               // 不可碰 document/window/Image/THREE;要亂數請用 args.seed 自己建
//        return c;                                   // 或回傳多張:return { map: c1, bump: c2 }
//      }
//    鍵 = 路徑 + ':' + 函式名,例如 src/map/textures.paint.js 的 wall → 'map/textures:wall'
// 2) 主執行緒:
//      import { paintTexture, paintTextures, texturesReady } from '../sys/texworker.js';
//      const t = paintTexture('map/textures:wall', { seed: 3 }, { repeat: [2, 1] });           // 立刻回傳 THREE.Texture
//      const { map, bump } = paintTextures('zombies/materials:skin', null, { map: {}, bump: { srgb: false } });
//      await texturesReady();                                                               // (可選)等全部畫完
//    回傳的貼圖一開始沒有影像,畫好後自動 needsUpdate;可以馬上指定給材質(shader 不會因此重編)。
//    選項:srgb(預設 true;法線/凹凸/粗糙度/alpha 圖請設 false)、wrap(預設 true = RepeatWrapping)、
//          repeat(數字或 [x, y])、anisotropy(預設 8)、setup(tex)(其他自訂設定)。
// 3) 方向:ImageBitmap 已在 Worker 端上下翻轉並設 flipY = false;主執行緒備援用 <canvas> + flipY = true。
//    兩種結果與 THREE.CanvasTexture 相同,UV 不用改。
// 4) 沒有 Worker / OffscreenCanvas(或網址帶 ?noworker / ?notexworker)時,在主執行緒同步畫同一份程式。

let pool;
function texPool() {
  if (pool === undefined) {
    pool = caps.useWorkers && caps.offscreen && caps.imageBitmap && !caps.flags.has('notexworker')
      ? createPool(() => new Worker(new URL('./tex.worker.js', import.meta.url), { type: 'module' }), { name: 'tex', max: 2, idleMs: 10000 })
      : null;
  }
  return pool && pool.available ? pool : null;
}

export const texStats = { worker: 0, main: 0, mainMs: 0, workerMs: 0, pending: 0 };
const pending = new Set();

function makeTex(o = {}) {
  const t = new THREE.Texture();
  if (o.wrap !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.repeat != null) { const r = [].concat(o.repeat); t.repeat.set(r[0], r[1] ?? r[0]); }
  t.anisotropy = o.anisotropy ?? 8;
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (o.setup) o.setup(t);
  return t;
}
function fill(t, img, bitmap) {
  t.image = img;
  t.flipY = !bitmap;
  t.needsUpdate = true;
}
const mainMake = (w, h, o) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', o && o.read ? { willReadFrequently: true } : undefined)];
};
function paintMain(key, args, out) {
  const fn = PAINTERS[key];
  if (!fn) throw new Error(`沒有貼圖產生器 ${key}(要寫在 src/**/*.paint.js)`);
  const t0 = performance.now();
  const res = fn(mainMake, args || {});
  const names = Object.keys(out);
  for (const n of names) fill(out[n], res.getContext ? res : res[n] || Object.values(res)[0], false);
  texStats.main++;
  texStats.mainMs += performance.now() - t0;
}

// spec = { 輸出名稱: 選項 };回傳 { 輸出名稱: THREE.Texture }
export function paintTextures(key, args, spec) {
  const out = {};
  for (const [n, o] of Object.entries(spec)) out[n] = makeTex(o);
  const p = texPool();
  if (!p) { paintMain(key, args, out); return out; }
  texStats.pending++;
  const t0 = performance.now();
  const job = p.call('paint', [key, args ?? null]).then((r) => {
    for (const [n, t] of Object.entries(out)) {
      const b = r.one || r.many[n] || Object.values(r.many)[0];
      fill(t, b, true);
    }
    texStats.worker++;
    texStats.workerMs += performance.now() - t0;
  }, (e) => {
    if (!p.failed) console.warn('[tex] worker 畫貼圖失敗,改主執行緒', key, e.message);
    paintMain(key, args, out);
  }).finally(() => { texStats.pending--; pending.delete(job); });
  pending.add(job);
  return out;
}

// 單張:產生器回傳多張時取 opts.pick(或第一張)
export function paintTexture(key, args, opts = {}) {
  return paintTextures(key, args, { [opts.pick || 'one']: opts })[opts.pick || 'one'];
}

export function texturesReady() { return Promise.all([...pending]).then(() => texStats); }
export const texPoolInfo = () => (pool ? pool.info() : null);
