import * as THREE from 'three';
import { registerMat } from '../../materials.js';
import {
  rnd, rr, reseed, clamp01, smooth, hex3, css, canvas, fbm, noiseFields, sampleN, NS, blotches, grain, scratches, blob, toTex,
} from './tex.js';

// 室內道具的共用材質(都是共用實例,靜態網格才能依材質合併成極少的 draw call):
//  一般表面 → 材質庫鍵(見 SURF;結構代理負責 PBR 升級)
//  pi_lab   文字/圖片圖集(藥盒標籤、病歷、告示、海報、書背、蠟筆畫、畫像…)
//  pi_glow  自發光圖集(監視器波形、監控畫面、叫號燈、X 光片燈箱、燭火、LED)
//  pi_decal 透明貼花圖集(血泊、噴濺、拖痕、手印、腳印、水漬、抓痕)
//  pi_noise 電視雪花(動態)

// ---------------------------------------------------------------- 表面鍵 → 材質庫鍵
// 一般表面一律用材質庫(src/map/materials.js)的共用材質:結構代理會把這些鍵升級成 PBR + 物件空間三平面投影,
// 合併後的靜態網格也吃得到。材質庫沒有的顏色用 registerMat 註冊新鍵(只有顏色/粗糙度/金屬度)。
// 值:字串 = 既有鍵;陣列 = 新鍵定義 [顏色, 粗糙度, 金屬度, 不透明度, 自發光, 強度]
const SURF = {
  // 油漆金屬
  enamel_white: 'metal_white', enamel_green: 'metal_green', enamel_gray: 'metal_gray',
  enamel_cream: [0xc4b996, 0.5, 0.3], enamel_mint: [0x8fae9a, 0.5, 0.3], enamel_blue: [0x86a0b2, 0.5, 0.3], enamel_dark: [0x383b3a, 0.55, 0.4],
  enamel_red: [0x8a2620, 0.5, 0.3], enamel_yellow: [0xb08a26, 0.5, 0.3], enamel_black: [0x1a1a1a, 0.55, 0.4], enamel_orange: [0xa8521e, 0.5, 0.3],
  enamel_teal: [0x3a706e, 0.5, 0.3], enamel_olive: [0x5a6040, 0.55, 0.3], enamel_beige: [0xb0a486, 0.5, 0.3], enamel_navy: [0x283850, 0.5, 0.3], enamel_pink: [0xc09494, 0.5, 0.3],
  // 塑膠
  pl_white: 'plastic_white', pl_beige: 'plastic_beige', pl_black: 'plastic_black', pl_blue: 'plastic_blue', pl_red: 'plastic_red', pl_yellow: 'plastic_yellow', pl_green: 'plastic_green',
  pl_gray: [0x86888a, 0.45], pl_dark: [0x353737, 0.5], pl_pink: [0xd08a9c, 0.42], pl_orange: [0xc8621e, 0.42], pl_teal: [0x2a8282, 0.42], pl_amber: [0x8a5012, 0.3],
  pl_purple: [0x644684, 0.42], pl_ltblue: [0x86aec8, 0.42], pl_cream: [0xd8ccaa, 0.45], pl_clear: 'pi_clear',
  // 布料
  fab_blue: 'fabric_blue', fab_green: 'fabric_green', fab_white: 'fabric_white', fab_red: 'fabric_red',
  fab_brown: [0x56402e, 1], fab_beige: [0xa09274, 1], fab_pink: [0xb8869a, 1], fab_gray: [0x646462, 1], fab_navy: [0x242e46, 1], fab_yellow: [0xb09a4c, 1],
  fab_scrub: [0x568484, 1], fab_canvas: [0x9c9276, 1], fab_floral: [0x86686a, 1], fab_check: [0x667686, 1], gauze: [0xd6d2c6, 1],
  plush_brown: [0x765232, 1], plush_pink: [0xc89aa4, 1], plush_white: [0xc8c4b8, 1], plush_blue: [0x7694b8, 1],
  cloth_black: [0x151515, 1], cloth_purple: [0x46204c, 1],
  // 皮革 / 塑膠皮
  leather_brown: 'leather', vinyl_blue: 'vinyl_seat',
  vinyl_teal: [0x2c6464, 0.45], vinyl_orange: [0xa04e1c, 0.45], vinyl_black: [0x191919, 0.45], vinyl_green: [0x385638, 0.45], vinyl_red: [0x741c1c, 0.45],
  vinyl_cream: [0xb0a488, 0.45], vinyl_mauve: [0x745660, 0.45], vinyl_gray: [0x565a5c, 0.45], leather_black: [0x1c1816, 0.55], leather_ox: [0x461814, 0.55],
  lead_apron: [0x283c56, 0.5], lead_apron2: [0x642838, 0.5], mattress: [0x3c5a64, 0.5],
  // 金屬
  chrome: 'chrome', steel: 'steel', alu: 'aluminum', bronze: 'bronze', iron: 'cast_iron', rust: 'rust',
  brass: [0xa8843c, 0.32, 0.9], galv: [0x868a86, 0.5, 0.75], gold: [0xc09a4a, 0.25, 1], rust_dark: [0x3c2216, 0.9, 0.3],
  // 橡膠
  rubber: 'rubber', rubber_gray: [0x464646, 0.9], rubber_red: [0x642020, 0.85], rubber_blue: [0x284676, 0.85],
  // 皮膚 / 肉
  skin_dummy: [0xd0b098, 0.5], skin_doll: [0xe2cebe, 0.35], skin_pale: [0xb0a090, 0.5], skin_dead: [0x84908a, 0.55], meat: 'flesh', blood_dry: [0x360a08, 0.6],
  // 其他
  ceramic: [0xe0ded6, 0.15], marble: 'marble', bone: 'bone', stone: 'stone_statue', plaster: [0xd2ccbe, 0.9],
  wax: 'candle_wax', wax_red: [0x861c16, 0.55], paper: 'paper', cardboard: 'cardboard', cork: [0x946a44, 0.95], foam: [0xc2ae66, 1],
  leaf_dead: 'leaves_dead', soil: 'soil', bark: 'bark',
  wood_toy: 'wood_light', wood_dark: 'wood_dark', wood_old: 'wood_old', wood_red: [0x862a1e, 0.6], wood_blue: [0x38588a, 0.6], wood_green: [0x487848, 0.6],
  wood_yellow: [0xc09a36, 0.6], wood_white: [0xccc8bc, 0.6],
  film: [0x101418, 0.2], screen_dark: 'screen_off', glass_dark: [0x1a2428, 0.06, 0.3], glass_green: [0x284632, 0.1], glass_amber: [0x56320e, 0.12],
  // 舊的可平鋪鍵 → 材質庫
  pi_wood_oak: 'wood_light', pi_wood_dark: 'wood_dark', pi_steel: 'steel', pi_linen: 'fabric_white', pi_mattress: [0x3c5a64, 0.5],
  pi_curtain: 'fabric_curtain', pi_cardboard: 'cardboard', pi_rust: 'rust',
};
const keyCache = new Map();
// 表面名 → 材質庫鍵(必要時註冊新鍵 pi_<名稱>)
export function surfKey(name) {
  let k = keyCache.get(name);
  if (k) return k;
  const d = SURF[name];
  if (typeof d === 'string') k = d;
  else if (Array.isArray(d)) { k = name.startsWith('pi_') ? name.replace('pi_', 'pi_m_') : `pi_${name}`; registerMat(k, d); }
  else k = name; // 直接是材質庫鍵(glass、paper…)
  keyCache.set(name, k);
  return k;
}

// ---------------------------------------------------------------- 矩形打包(圖集)
class Packer {
  // 天際線(skyline)打包:每次找最低可放的位置(bottom-left),浪費很少
  constructor(w, h, pad = 3) { this.w = w; this.h = h; this.pad = pad; this.sky = [{ x: 0, y: 0, w }]; this.y = 0; }
  alloc(w, h) {
    const p = this.pad, W = w + p * 2, H = h + p * 2, sky = this.sky;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + W > this.w) break;
      let y = 0, rem = W;
      for (let j = i; j < sky.length && rem > 0; j++) { y = Math.max(y, sky[j].y); rem -= sky[j].w; }
      if (rem > 0 || y + H > this.h) continue;
      if (!best || y < best.y) best = { x, y, i };
    }
    if (!best) { console.warn('[props-in] 圖集已滿', w, h); return null; }
    const seg = { x: best.x, y: best.y + H, w: W };
    let i = best.i;
    const end = best.x + W;
    while (i < sky.length && sky[i].x < end) {
      const s = sky[i];
      if (s.x + s.w <= end) sky.splice(i, 1);
      else { s.w -= end - s.x; s.x = end; break; }
    }
    sky.splice(best.i, 0, seg);
    for (let k = sky.length - 1; k > 0; k--) if (sky[k].y === sky[k - 1].y) { sky[k - 1].w += sky[k].w; sky.splice(k, 1); }
    this.y = Math.max(this.y, seg.y);
    return { x: best.x + p, y: best.y + p, w, h };
  }
}

function makeAtlas(W, H, key, makeMat) {
  const [c, cx] = canvas(W, H);
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, W, H);
  const A = { c, cx, W, H, packer: new Packer(W, H, 3), rects: new Map(), tex: null, mat: null };
  A.tex = toTex(c, { repeat: false });
  A.mat = makeMat(A.tex);
  registerMat(key, A.mat);
  return A;
}

// 在圖集上配置一塊並繪製;draw(ctx, w, h) 以區塊左上為原點。回傳 UV 矩形(內縮半像素)
function region(A, key, w, h, draw) {
  let r = A.rects.get(key);
  if (r) return r;
  const a = A.packer.alloc(w, h);
  if (!a) return A.rects.values().next().value;
  // 先畫在獨立小畫布(getImageData 類操作才不會受座標轉換影響),再貼進圖集
  const [tc, tx] = canvas(w, h);
  if (A.clear) tx.clearRect(0, 0, w, h);
  draw(tx, w, h);
  const cx = A.cx, p = A.packer.pad - 1;
  if (A.clear) cx.clearRect(a.x - p, a.y - p, w + p * 2, h + p * 2);
  cx.drawImage(tc, a.x, a.y);
  // 邊緣外擴(避免 mipmap 混到隔壁):從小畫布複製邊緣(不要從圖集自己複製,會整張拷貝很慢)
  cx.drawImage(tc, 0, 0, w, 1, a.x, a.y - p, w, p);
  cx.drawImage(tc, 0, h - 1, w, 1, a.x, a.y + h, w, p);
  cx.drawImage(tc, 0, 0, 1, h, a.x - p, a.y, p, h);
  cx.drawImage(tc, w - 1, 0, 1, h, a.x + w, a.y, p, h);
  A.tex.needsUpdate = true;
  r = { u0: (a.x + 0.5) / A.W, v0: 1 - (a.y + h - 0.5) / A.H, u1: (a.x + w - 0.5) / A.W, v1: 1 - (a.y + 0.5) / A.H, w, h };
  A.rects.set(key, r);
  return r;
}

let LAB = null, GLOW = null, DECAL = null;
// 開發用:各圖集用量(依 key 前綴)
export function atlasStats() {
  const out = {};
  for (const [name, A] of [['lab', LAB], ['glow', GLOW], ['decal', DECAL]]) {
    if (!A) continue;
    const by = {};
    for (const [k, r] of A.rects) { const p = k.split(':')[0]; by[p] = by[p] || [0, 0]; by[p][0]++; by[p][1] += r.w * r.h; }
    out[name] = { used: Math.round((A.packer.y / A.H) * 100) + '%', by: Object.entries(by).map(([p, [n, a]]) => `${p}:${n}/${Math.round(a / 1000)}k`).join(' ') };
  }
  return out;
}
export function labRect(key, w, h, draw) { return region(LAB, key, w, h, draw); }
export function glowRect(key, w, h, draw) { return region(GLOW, key, w, h, draw); }
export function decalRect(key, w, h, draw) { return region(DECAL, key, w, h, draw); }

// ---------------------------------------------------------------- 雪花雜訊(動態)
let noiseTex = null;
function buildNoise() {
  const S = 128;
  const [c, cx] = canvas(S, S);
  const img = cx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = rnd() * 255 * (0.75 + 0.25 * Math.sin(y * 0.9));
    const i = (y * S + x) * 4;
    img.data[i] = v * 0.92; img.data[i + 1] = v; img.data[i + 2] = v * 1.05; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  noiseTex = toTex(c);
  noiseTex.magFilter = THREE.NearestFilter;
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: noiseTex, emissiveIntensity: 0.75, roughness: 0.25 });
  registerMat('pi_noise', m);
  let last = 0;
  m.userData.tick = () => { // 由網格的 onBeforeRender 呼叫
    const t = performance.now();
    if (t - last < 45) return;
    last = t;
    noiseTex.offset.set(Math.random(), Math.random());
  };
}

// ---------------------------------------------------------------- 初始化
let ready = false;
export function initAtlas() {
  if (ready) return;
  ready = true;
  buildNoise();
  LAB = makeAtlas(2048, 2560, 'pi_lab', // [scene r4] 2048→2304 高:故事道具的告示/家書/布條;[scene8] →2560(鍋爐/焚化/監控/封院告示)
    (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0 }));
  GLOW = makeAtlas(2048, 1024, 'pi_glow', (t) => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.2 }));
  DECAL = makeAtlas(2048, 1024, 'pi_decal', (t) => {
    t.premultiplyAlpha = false;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.35, metalness: 0 });
  });
  DECAL.cx.clearRect(0, 0, 2048, 1024);
  DECAL.clear = true;
  registerMat('pi_fluid', [0xc8b060, 0.1, 0, 0.55]);
  registerMat('pi_clear', [0xd0dce0, 0.08, 0, 0.32]);
  registerMat('pi_iv', [0xe0eee8, 0.12, 0, 0.45]);
}

export { rr, rnd, css };
