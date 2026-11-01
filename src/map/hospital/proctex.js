import * as THREE from 'three';
import { paintSurface, SURF as PROC } from './texdefs.js';
import { paintAtlas } from './atlas.js';

// 程式貼圖管理:先回傳佔位 Texture,再由 Worker(OffscreenCanvas)畫好後就地換圖。
// 不支援 Worker/OffscreenCanvas 時,改在主執行緒分批(每幀一張)畫。
const pending = new Map(); // id → { tex, bump, cb }
let workers = null, rr = 0, nextId = 1, useWorker = null;
const mainQueue = [];
export const procStats = { requested: 0, done: 0, ms: 0, worker: false };

function initWorkers() {
  if (useWorker !== null) return;
  useWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
  if (!useWorker) return;
  try {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => finish(e.data);
      w.onerror = () => { useWorker = false; for (const [id, p] of pending) { pending.delete(id); mainQueue.push(p); } pumpMain(); };
      workers.push(w);
    }
    procStats.worker = true;
  } catch {
    useWorker = false;
  }
}
function finish(d) {
  const p = pending.get(d.id);
  if (!p) return;
  pending.delete(d.id);
  if (d.error) { console.warn('[proctex] worker 失敗,改用主執行緒', d.key, d.error); mainQueue.push(p); pumpMain(); return; }
  apply(p, d.color, d.bump, true, d.meta);
}
function apply(p, color, bump, bitmap, meta) {
  for (const t of [p.tex, ...p.clones, ...(p.bump ? [p.bump, ...p.bumpClones] : [])]) t.dispose(); // 佔位圖尺寸不同,重新配置
  p.tex.image = color;
  p.tex.flipY = !bitmap;
  p.tex.needsUpdate = true;
  for (const c of p.clones) { c.flipY = !bitmap; c.needsUpdate = true; }
  if (p.bump && bump) { p.bump.image = bump; p.bump.flipY = !bitmap; p.bump.needsUpdate = true; for (const c of p.bumpClones) { c.flipY = !bitmap; c.needsUpdate = true; } }
  procStats.done++;
  if (p.cb) p.cb(meta);
}
let pumping = false;
function pumpMain() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const p = mainQueue.shift();
    if (!p) { pumping = false; return; }
    const t0 = performance.now();
    const s = p.kind === 'atlas' ? paintAtlas(p.key, p.data) : paintSurface(p.key);
    procStats.ms += performance.now() - t0;
    apply(p, s.c, s.hc, false, s.meta);
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
function ph(color = '#808080', size = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, size, size);
  return c;
}
const cache = new Map();
// 取得程式貼圖(Texture 立即可用,內容稍後填入)。kind = 'surface' | 'atlas'
// data:圖集的內容(可序列化,會傳給 Worker)
export function procTextures(key, { kind = 'surface', srgb = true, placeholder = '#7a7a76', bump = true, cb = null, data = null } = {}) {
  const ck = kind + ':' + key;
  let p = cache.get(ck);
  if (p) { if (cb) { if (p.ready) cb(p.meta); else p.cbs.push(cb); } return p; }
  initWorkers();
  const tex = new THREE.Texture(ph(placeholder));
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const def = kind === 'surface' ? PROC[key] : null;
  if (def) tex.repeat.set(1 / def.size[0], 1 / def.size[1]);
  let b = null;
  if (bump && kind === 'surface') {
    b = new THREE.Texture(ph('#808080'));
    b.colorSpace = THREE.NoColorSpace;
    b.wrapS = b.wrapT = THREE.RepeatWrapping;
    b.repeat.copy(tex.repeat);
    b.needsUpdate = true;
  }
  p = { key, kind, data, tex, bump: b, clones: [], bumpClones: [], cbs: cb ? [cb] : [], ready: false, meta: null };
  p.cb = (meta) => { p.ready = true; p.meta = meta; for (const f of p.cbs) f(meta); p.cbs.length = 0; };
  cache.set(ck, p);
  procStats.requested++;
  if (useWorker && workers) {
    const id = nextId++;
    pending.set(id, p);
    workers[rr++ % workers.length].postMessage({ id, key, kind, data });
  } else { mainQueue.push(p); pumpMain(); }
  return p;
}
// 同一張程式貼圖的複本(不同 repeat)
export function procClone(p, repeat) {
  const t = p.tex.clone();
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  p.clones.push(t);
  return t;
}
