// ===== 貼圖上傳排程 → uploads =====
// 串流進來的貼圖如果等到「第一次畫到」才上傳,常常好幾張(1~2K、含 mipmap)擠在同一幀 → 數十到數百 ms 的卡頓
// (進新區域、模型剛交付、殭屍模型載完時特別明顯)。改成在這裡排隊:每幀最多上傳一張(下一個 rAF 開頭、渲染之前),
// 前一幀已經很慢時先跳過;超過 maxSize 的先在背景執行緒縮小(createImageBitmap resize,不佔主執行緒)。
//   uploads.attach(renderer)          main.js 建好渲染器後呼叫
//   await uploads.add(texture)        排隊上傳(回傳時已在 GPU 上)
const q = [];
let R = null, armed = false, lastT = 0, skips = 0;
export const uploads = {
  maxSize: 1024, // 串流貼圖上限(殭屍/道具在畫面上不會大到需要 2K)
  done: 0, ms: 0, // 統計
  attach(renderer) { R = renderer; arm(); },
  add(tex) {
    if (!tex || tex.isRenderTargetTexture) return Promise.resolve(tex);
    return new Promise((resolve) => { q.push([tex, resolve]); arm(); });
  },
  get pending() { return q.length; },
};

function arm() {
  if (armed || !R || !q.length) return;
  armed = true;
  const step = (t) => {
    armed = false;
    // 上一幀已經超時:這幀不加重(最多連跳 2 幀;載入期間每幀都慢,不能因此一直不上傳)
    const slow = lastT && t - lastT > 40 && skips < 2;
    lastT = t;
    skips = slow ? skips + 1 : 0;
    if (!slow && q.length) {
      const [tex, resolve] = q.shift();
      shrink(tex).then(() => {
        const a = performance.now();
        try { if (tex.image) R.initTexture(tex); } catch (e) { console.warn('[uploads]', e?.message || e); }
        uploads.done++; uploads.ms += performance.now() - a;
        resolve(tex);
      });
    }
    if (q.length) { armed = true; requestAnimationFrame(step); }
  };
  requestAnimationFrame(step);
}

// 太大的圖先在背景縮小(只處理可直接建立 ImageBitmap 的來源;方向/預乘/色彩不變)
async function shrink(tex) {
  const img = tex.image, max = uploads.maxSize;
  const w = img?.width || 0, h = img?.height || 0;
  if (!(w > max || h > max) || typeof createImageBitmap !== 'function' || tex.isDataTexture || tex.isCompressedTexture) return;
  if (!(img instanceof ImageBitmap || (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) || (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement))) return;
  const k = max / Math.max(w, h), isBmp = img instanceof ImageBitmap;
  // ImageBitmap 上傳時 three 不理 flipY:原本靠 flipY 翻轉的 <img>/<canvas> 來源,縮小時一併翻好
  const flip = !isBmp && tex.flipY;
  try {
    const bmp = await createImageBitmap(img, { resizeWidth: Math.max(1, Math.round(w * k)), resizeHeight: Math.max(1, Math.round(h * k)), resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: flip ? 'flipY' : 'from-image' });
    if (isBmp) img.close?.();
    tex.image = bmp;
    if (flip) tex.flipY = false;
    tex.needsUpdate = true;
  } catch { /* 縮不了就原圖上傳 */ }
}
