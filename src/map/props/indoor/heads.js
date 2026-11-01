import { headGeo } from '../../../zombies/anatomy.js';

// 借用殭屍的頭部雕塑產生「太像真人」的 CPR 假人臉(恐怖谷):五官端正、閉眼、無表情。
let cache;
export function dummyHead() {
  if (cache !== undefined) return cache;
  try {
    const H = { w: 0.95, h: 0.95, d: 0.95, brow: 0.5, sock: 0.35, cheek: 0.7, thin: 0.15, jaw: 0.88, lips: 0.55, nose: 0.85, mouthW: 0.85, seed: 3.7, decay: 0 };
    const { geo } = headGeo(H);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    cache = geo;
  } catch (e) {
    console.warn('[props-in] 假人頭部雕塑失敗,改用球體', e);
    cache = null;
  }
  return cache;
}
