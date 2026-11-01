import { paintSurface } from './texdefs.js';
import { paintAtlas } from './atlas.js';

// 貼圖 Worker:用 OffscreenCanvas 畫程式貼圖,轉成 ImageBitmap(已上下翻轉)傳回主執行緒,不卡主迴圈
self.onmessage = async (e) => {
  const { id, key, kind, data } = e.data;
  try {
    const s = kind === 'atlas' ? paintAtlas(key, data) : paintSurface(key);
    const color = await createImageBitmap(s.c, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    const bump = s.hc ? await createImageBitmap(s.hc, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }) : null;
    self.postMessage({ id, key, color, bump, meta: s.meta || null }, bump ? [color, bump] : [color]);
  } catch (err) {
    self.postMessage({ id, key, error: String(err && err.stack || err) });
  }
};
