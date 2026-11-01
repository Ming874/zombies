import { serve } from './workers.js';
import { PAINTERS } from './painters.js';

// 貼圖 Worker:用 OffscreenCanvas 跑 *.paint.js 的產生器,轉成 ImageBitmap(零複製)傳回主執行緒。
// ImageBitmap 上傳 WebGL 時瀏覽器會忽略 UNPACK_FLIP_Y / PREMULTIPLY,所以在這裡先上下翻轉、不預乘 alpha,
// 主執行緒設 texture.flipY = false,結果與原本的 CanvasTexture(flipY = true)完全相同。
const make = (w, h, o) => {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext('2d', o && o.read ? { willReadFrequently: true } : undefined)];
};

let optsOK = true;
async function bitmap(c) {
  if (optsOK) {
    try { return await createImageBitmap(c, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }); } catch { optsOK = false; }
  }
  const f = new OffscreenCanvas(c.width, c.height), x = f.getContext('2d');
  x.setTransform(1, 0, 0, -1, 0, c.height);
  x.drawImage(c, 0, 0);
  return f.transferToImageBitmap();
}

serve({
  async paint(key, args) {
    const fn = PAINTERS[key];
    if (!fn) throw new Error(`沒有貼圖產生器 ${key}`);
    const out = fn(make, args || {});
    if (out instanceof OffscreenCanvas) return { one: await bitmap(out) };
    const many = {};
    for (const [k, c] of Object.entries(out)) many[k] = await bitmap(c);
    return { many };
  },
});
