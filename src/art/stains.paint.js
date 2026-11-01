// 血跡貼花的貼圖產生器(自動註冊:'art/stains:<名稱>';在貼圖 Worker 裡跑,不卡主執行緒)
import { stainLayout, renderCell, ATLAS, ghostHandRGBA, wetFootRGBA, OUTDOOR, renderOutdoor } from './stainset.js';
import { packNR } from './stains.js';

// 整張圖集:map(albedo + alpha,sRGB)與 nr(R = 法線 x、G = 粗糙度、B = 法線 y;半解析度)
export function atlas(make, args) {
  const L = stainLayout(), seed = args.seed ?? 1;
  const [mc, mx] = make(ATLAS.W, ATLAS.H), [nc, nx] = make(ATLAS.W / 2, ATLAS.H / 2);
  nx.fillStyle = 'rgb(128,217,128)'; nx.fillRect(0, 0, ATLAS.W / 2, ATLAS.H / 2);
  for (const [name, r] of Object.entries(L)) {
    const C = renderCell(name, seed);
    mx.putImageData(new ImageData(C.rgba, C.w, C.h), r.x, r.y);
    const N = packNR(C, 2);
    nx.putImageData(new ImageData(N.data, N.w, N.h), r.x / 2, r.y / 2);
  }
  return { map: mc, nr: nc };
}
// 玻璃上的鬼手印(白色;材質給顏色)
export function ghostHand(make, args) {
  const S = args.size ?? 256, [c, x] = make(S, S);
  x.putImageData(new ImageData(ghostHandRGBA(args.seed ?? 1, S), S, S), 0, 0);
  return c;
}
// 濕腳印(白色;材質給顏色與光澤)
export function wetFoot(make, args) {
  const w = args.w ?? 128, h = args.h ?? 256, [c, x] = make(w, h);
  x.putImageData(new ImageData(wetFootRGBA(args.seed ?? 1, w, h), w, h), 0, 0);
  return c;
}
// 室外貼花圖集的血跡格(每格一張;主執行緒畫進 po_decal 圖集)
export function outdoor(make, args) {
  const out = {};
  for (const name of Object.keys(OUTDOOR)) {
    const C = renderOutdoor(name, args.seed ?? 1), [c, x] = make(C.w, C.h);
    x.putImageData(new ImageData(C.rgba, C.w, C.h), 0, 0);
    out[name] = c;
  }
  return out;
}
