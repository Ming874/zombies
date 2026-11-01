import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// 槍模座標:原點在握把頂端,槍口朝 -Z,上方為 +Y,單位公尺(真實尺寸)。
// 建模時用「f = 往槍口方向的距離」描述側面輪廓,z = -f。
// 配色依真槍:
//   Glock 17  黑色聚合物槍身(點刻紋握把) + 深灰氮化滑套
//   Colt Python 皇家藍鋼(royal blue) + 方格紋胡桃木握把 + 金色小馬徽
//   AK-47(AKM) 磷化黑鋼 + 漆面樺木積層護木/槍托/握把 + 肋條鋼彈匣
//   M4A1      黑色硬陽極鋁 + 黑色聚合物 + 四面皮卡汀尼導軌(RIS)
//   M82A1     磷化消光黑鋼板機匣 + 黑色聚合物握把 + 橡膠托底/托腮 + 消光黑鋁狙擊鏡(鍍膜鏡片)
// 同材質零件會合併成一個 mesh(每把槍約 10–20 個 draw call)。
// info.sight = { rear:[f,y], front:[f,y], eye }:照門與準星(狙擊鏡為目鏡/物鏡)的位置,開鏡時讓這條線對準畫面中心,eye = 眼睛到照門的距離。

const HALF = Math.PI / 2;

// ---------- 程式貼圖 ----------
let seed = 9137;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// 可平鋪的值雜訊 fbm(cx/cy 為最粗一層的格數,兩者不同可做出拉長的紋理)
function fbm(W, H, cx, cy, oct) {
  const out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const nx = cx << o, ny = cy << o;
    const g = new Float32Array(nx * ny);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < H; y++) {
      const fy = (y / H) * ny, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const r0 = iy * nx, r1 = ((iy + 1) % ny) * nx;
      for (let x = 0; x < W; x++) {
        const fx = (x / W) * nx, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx), ix1 = (ix + 1) % nx;
        const a = g[r0 + ix], b = g[r0 + ix1], c = g[r1 + ix], d = g[r1 + ix1];
        out[y * W + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

// fn(x, y, i) 回傳 [r,g,b](0..255)
function paint(W, H, fn) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const [r, g, b] = fn(x, y, i);
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex3 = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// 木紋:沿 u 方向的年輪 + 纖維 + 導管孔;checker>0 時另外刻出方格紋(左輪握把)
function woodTextures(dark, mid, light, rings, checker = 0) {
  const W = 512, H = 512;
  const warp = fbm(W, H, 2, 3, 4);
  const fiber = fbm(W, H, 2, 96, 3);
  const pore = fbm(W, H, 8, 160, 2);
  const blot = fbm(W, H, 3, 3, 3);
  const D = hex3(dark), Mi = hex3(mid), L = hex3(light);
  const height = new Float32Array(W * H);
  const map = paint(W, H, (x, y, i) => {
    const w = (y / H) * rings + warp[i] * 1.3 + fiber[i] * 0.2;
    const ring = w - Math.floor(w);
    const late = Math.exp(-(((ring - 0.82) / 0.09) ** 2));
    let c = mix3(Mi, L, clamp01((blot[i] - 0.35) * 1.6) * 0.55);
    c = mix3(c, D, clamp01(late * 0.38 + (fiber[i] - 0.45) * 0.75));
    const p = pore[i] < 0.28 ? (0.28 - pore[i]) * 1.6 : 0;
    c = mix3(c, D, p);
    let h = 0.6 + (fiber[i] - 0.5) * 0.5 - late * 0.25 - p * 0.6;
    if (checker) {
      const P = checker;
      const a = ((x + y) % P) / P, b = ((x - y + 4096) % P) / P;
      const tri = Math.min(1 - Math.abs(2 * a - 1), 1 - Math.abs(2 * b - 1));
      const groove = smooth(0.0, 0.35, tri);
      c = mix3(mix3(D, [0, 0, 0], 0.4), c, 0.62 + groove * 0.38);
      h = h * 0.25 + groove * 0.75;
    }
    height[i] = h;
    return c;
  });
  const bump = paint(W, H, (x, y, i) => { const v = clamp01(height[i]) * 255; return [v, v, v]; });
  return { map: tex(map, true), bump: tex(bump) };
}

// 金屬:微刮痕、拉絲與斑駁,用作 roughness/bump
function metalTexture() {
  const S = 256;
  const blot = fbm(S, S, 4, 4, 4);
  const brush = fbm(S, S, 2, 64, 3);
  const c = paint(S, S, (x, y, i) => {
    const v = 150 + (blot[i] - 0.5) * 70 + (brush[i] - 0.5) * 60;
    return [v, v, v];
  });
  const ctx = c.getContext('2d');
  for (let k = 0; k < 90; k++) { // 細刮痕
    const x = rnd() * S, y = rnd() * S, a = (rnd() - 0.5) * 0.6, l = 6 + rnd() * 40;
    ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '90,90,90' : '220,220,220'},${0.25 + rnd() * 0.35})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return tex(c);
}

// 聚合物點刻紋(Glock 握把、AR 握把)
function stippleTexture() {
  const S = 256;
  const n = fbm(S, S, 16, 16, 2);
  const c = paint(S, S, (x, y, i) => { const v = 110 + n[i] * 60; return [v, v, v]; });
  const ctx = c.getContext('2d');
  for (let k = 0; k < 2600; k++) {
    const x = rnd() * S, y = rnd() * S, r = 0.8 + rnd() * 1.8, v = rnd() < 0.5 ? 40 + rnd() * 40 : 190 + rnd() * 60;
    for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) { // 邊界重複,保持可平鋪
      if (ox && (x + ox < -4 || x + ox > S + 4)) continue;
      if (oy && (y + oy < -4 || y + oy > S + 4)) continue;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return tex(c);
}

// 斜紋布(手套、袖子)
function fabricTextures() {
  const S = 256;
  const n = fbm(S, S, 6, 6, 4);
  const thread = fbm(S, S, 64, 4, 2);
  const h = new Float32Array(S * S);
  const map = paint(S, S, (x, y, i) => {
    const tw = 0.5 + 0.5 * Math.sin(((x + y) / 4) * Math.PI * 2) * (((x >> 2) & 1) ? 1 : 0.6);
    const v = 0.72 + tw * 0.12 + (n[i] - 0.5) * 0.3 + (thread[i] - 0.5) * 0.1;
    h[i] = tw * 0.7 + thread[i] * 0.3;
    const g = clamp01(v) * 255;
    return [g, g, g];
  });
  const bump = paint(S, S, (x, y, i) => { const v = h[i] * 255; return [v, v, v]; });
  return { map: tex(map, true), bump: tex(bump) };
}

// 簡易環境貼圖(等距柱狀):昏暗病房、天花板日光燈管 → 金屬才有反射
function envTexture() {
  const W = 512, H = 256;
  const n = fbm(W, H, 8, 4, 4);
  const c = paint(W, H, (x, y, i) => {
    const v = y / H;
    let col = v < 0.5 ? mix3([112, 120, 114], [84, 90, 86], v / 0.5) : mix3([70, 72, 66], [34, 34, 32], (v - 0.5) / 0.5);
    col = mix3(col, [col[0] * 1.3, col[1] * 1.3, col[2] * 1.25], n[i]);
    return col;
  });
  const ctx = c.getContext('2d');
  const tube = (x, y, w, h, a) => {
    const g = ctx.createLinearGradient(0, y - h * 3, 0, y + h * 3);
    g.addColorStop(0, 'rgba(220,240,230,0)');
    g.addColorStop(0.5, `rgba(235,250,240,${a})`);
    g.addColorStop(1, 'rgba(220,240,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 6, y - h * 3, w + 12, h * 6);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y - h / 2, w, h);
  };
  tube(40, 40, 120, 5, 1);
  tube(300, 30, 90, 5, 0.95);
  tube(200, 72, 70, 4, 0.7);
  tube(420, 64, 60, 4, 0.6);
  ctx.fillStyle = 'rgba(160,150,120,0.35)'; // 走廊盡頭暖色
  ctx.fillRect(110, 112, 60, 22);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ENV = envTexture();
export const ENV_MAP = ENV; // 拋殼等世界物件共用的環境反射
const METAL = metalTexture();
const STIPPLE = stippleTexture();
const AKWOOD = woodTextures(0x1e0e08, 0x48261a, 0x603422, 26);
const PYWOOD = woodTextures(0x2a140a, 0x55301a, 0x74452a, 12, 11);
const FABRIC = fabricTextures();

// uv:每公尺幾個貼圖週期(盒狀投影)
function std(o, uv = 12, env = 1) {
  const m = new THREE.MeshStandardMaterial({ envMap: ENV, envMapIntensity: env, ...o });
  m.userData.uv = uv;
  return m;
}
// 邊角磨損(倒角/圓角上的三角形有 wear = 1;src/weapons/models.js markWear):
//  金屬:表面處理(發藍、磷化、陽極、塗層)磨掉露出亮鋼,粗糙度變低;聚合物:磨亮、變淺
//  用材質本身的粗糙度圖(拉絲/點刻紋)當破碎遮罩,不會是一條均勻的亮線。每把槍的金屬件共用同一種 program
function wearHook(shader) {
  shader.uniforms.uWear = this.userData.wearU;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float wear;\nvarying float vWear;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWear = wear;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vWear;\nuniform vec4 uWear;')
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float wN = texture2D( roughnessMap, vRoughnessMapUv * 2.3 + 0.31 ).g;
		float w = vWear * smoothstep( 0.54, 0.68, wN ) * uWear.x; // 一段一段的磨痕,不是整條亮邊
		if ( uWear.w < 0.5 ) {
			diffuseColor.rgb = mix( diffuseColor.rgb, vec3( uWear.y ), w );
			metalnessFactor = mix( metalnessFactor, 1.0, w );
			roughnessFactor = mix( roughnessFactor, uWear.z, w );
		} else {
			diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.7 + 0.015, w * 0.7 );
			roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.55, w );
		}
	}`);
}
const wearKey = () => 'wwear1';
function addWear(m, k = 0.85, bare = 0.5, rough = 0.24, poly = 0) {
  m.userData.wearU = { value: new THREE.Vector4(k, bare, rough, poly) };
  m.onBeforeCompile = wearHook;
  m.customProgramCacheKey = wearKey;
  return m;
}
function metal(color, rough, metalness, env = 1, bump = 0.6, wear = 0.85) {
  return addWear(std({ color, roughness: rough, metalness, roughnessMap: METAL, bumpMap: METAL, bumpScale: bump }, 9, env), wear);
}

const M = {
  slide: metal(0x3d4145, 0.4, 0.65, 1.1),
  steel: metal(0x3a3c3d, 0.5, 0.6, 1),
  worn: metal(0x7a7d80, 0.3, 0.95, 1.2, 0.3),
  blued: metal(0x1b2534, 0.16, 1, 1.5, 0.15),
  anodized: metal(0x323438, 0.46, 0.35, 0.9, 0.4),
  magSteel: metal(0x383939, 0.55, 0.5, 0.9),
  usgi: metal(0x3c403c, 0.62, 0.35, 0.8),
  dark: std({ color: 0x050505, roughness: 0.9, metalness: 0 }, 12, 0.2),
  polymer: addWear(std({ color: 0x272828, roughness: 0.82, metalness: 0, bumpMap: STIPPLE, bumpScale: 1.2, roughnessMap: STIPPLE }, 40, 0.6), 0.7, 0, 0, 1),
  polySmooth: std({ color: 0x1c1d1e, roughness: 0.62, metalness: 0.05, bumpMap: METAL, bumpScale: 0.3 }, 14, 0.7),
  rubber: std({ color: 0x141414, roughness: 0.95, metalness: 0, bumpMap: STIPPLE, bumpScale: 0.8 }, 30, 0.3),
  white: std({ color: 0xe9e6da, roughness: 0.5, emissive: 0x2a2a26 }, 12, 0.5),
  red: std({ color: 0xc8281c, roughness: 0.4, emissive: 0x3a0604 }, 12, 0.5),
  gold: std({ color: 0xdcae4c, roughness: 0.28, metalness: 1 }, 12, 1.4),
  copper: std({ color: 0xb8714a, roughness: 0.32, metalness: 1 }, 12, 1.2),
  akWood: new THREE.MeshPhysicalMaterial({ map: AKWOOD.map, color: 0x8a7c74, bumpMap: AKWOOD.bump, bumpScale: 0.35, roughness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.28, envMap: ENV, envMapIntensity: 0.9 }),
  pyWood: std({ map: PYWOOD.map, color: 0x8a7c74, bumpMap: PYWOOD.bump, bumpScale: 3, roughness: 0.55 }, 16, 0.8),
  glove: std({ map: FABRIC.map, color: 0x34352f, bumpMap: FABRIC.bump, bumpScale: 0.8, roughness: 0.92 }, 40, 0.35),
  knuckle: std({ color: 0x1c1d1c, roughness: 0.55, bumpMap: STIPPLE, bumpScale: 0.6 }, 30, 0.5),
  leather: std({ color: 0x3a352d, roughness: 0.7, bumpMap: STIPPLE, bumpScale: 0.4 }, 40, 0.4),
  sleeveIn: std({ color: 0x15170f, roughness: 1 }, 12, 0.1),
  sleeve: std({ map: FABRIC.map, color: 0x47503d, bumpMap: FABRIC.bump, bumpScale: 0.8, roughness: 1 }, 30, 0.3),
  park: metal(0x2b2d2e, 0.58, 0.45, 0.85, 0.55),
  scope: metal(0x1c1d1f, 0.4, 0.5, 1.05, 0.25),
  // 鍍膜鏡片:近乎全反射的深色玻璃 + 彩虹鍍膜(紫/綠反光)
  lens: new THREE.MeshPhysicalMaterial({ color: 0x0b1416, metalness: 0.15, roughness: 0.03, envMap: ENV, envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 1, iridescenceIOR: 1.75, iridescenceThicknessRange: [260, 640], emissive: 0x0a0618, emissiveIntensity: 1 }),
  sgSteel: metal(0x23262a, 0.34, 0.8, 1.3, 0.3), // 870 皇家藍黑鋼
  alloy: metal(0x1d1f21, 0.55, 0.4, 0.8, 0.45), // 扳機座(黑色鋁合金)
  ivory: std({ color: 0xbdb4a2, roughness: 0.6 }, 12, 0.4), // 托底板白色間隔片
  hull: std({ color: 0x8c1912, roughness: 0.42, emissive: 0x120202 }, 30, 0.7), // 霰彈殼紅色塑膠
  brass: std({ color: 0xc89b4a, roughness: 0.26, metalness: 1 }, 12, 1.5),
  bladeCoat: metal(0x202224, 0.62, 0.35, 0.7, 0.5), // 刀身黑色塗層
  edge: metal(0xa9adb0, 0.22, 1, 1.4, 0.15), // 開鋒面
  leatherBrown: std({ color: 0x4a2f1d, roughness: 0.72, bumpMap: STIPPLE, bumpScale: 0.5 }, 30, 0.45),
  olive: std({ color: 0x3b4430, roughness: 0.62, metalness: 0.25, bumpMap: METAL, bumpScale: 0.4 }, 14, 0.7),
  yellow: std({ color: 0xb59a2a, roughness: 0.5 }, 12, 0.4),
  // 夜光準星(氚管綠點)與光纖(橘紅):自發光 > 1 → 暗處也看得到(與 white/red 同一種 shader 參數,不會多編 program)
  tritium: std({ color: 0xc8ffcc, roughness: 0.35, emissive: 0x5cff74, emissiveIntensity: 1.8 }, 12, 0.4),
  fiber: std({ color: 0xff8a4a, roughness: 0.3, emissive: 0xff4a12, emissiveIntensity: 2.4 }, 12, 0.4),
};
M.akWood.userData.uv = 4;
const SGWOOD = woodTextures(0x160b05, 0x3a2112, 0x603b22, 16);
M.sgWood = new THREE.MeshPhysicalMaterial({ map: SGWOOD.map, color: 0x9c8c82, bumpMap: SGWOOD.bump, bumpScale: 0.4, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.3, envMap: ENV, envMapIntensity: 0.85 });
M.sgWood.userData.uv = 4;

// ---------- 幾何工具 ----------
// 圓角多邊形:pts = [[x, y, 圓角半徑], ...]
function roundPath(pts, path = new THREE.Shape()) {
  const n = pts.length;
  const P = (i) => pts[(i + n) % n];
  for (let i = 0; i < n; i++) {
    const [x, y, r = 0] = P(i);
    if (!r) {
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
      continue;
    }
    const [ax, ay] = P(i - 1), [bx, by] = P(i + 1);
    const la = Math.hypot(ax - x, ay - y), lb = Math.hypot(bx - x, by - y);
    const t = Math.min(r, la / 2, lb / 2);
    const x1 = x + ((ax - x) / la) * t, y1 = y + ((ay - y) / la) * t;
    const x2 = x + ((bx - x) / lb) * t, y2 = y + ((by - y) / lb) * t;
    if (i === 0) path.moveTo(x1, y1);
    else path.lineTo(x1, y1);
    path.quadraticCurveTo(x, y, x2, y2);
  }
  path.closePath();
  return path;
}

function extrudeShape(pts, depth, o) {
  const b = o.bevel ?? Math.min(0.0015, depth * 0.3);
  const shape = roundPath(pts);
  if (o.holes) for (const h of o.holes) shape.holes.push(roundPath(h, new THREE.Path()));
  const d = Math.max(1e-5, depth - 2 * b);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: o.seg ?? 2, curveSegments: o.cs ?? 5,
  });
  geo.translate(0, 0, -d / 2);
  return markWear(geo, (nx, ny, nz) => Math.abs(nz) > 0.1 && Math.abs(nz) < 0.985); // 倒角面(法線介於側面與正面之間)= 邊角
}

// 邊角磨損標記(每個三角形一個值,存在 wear 屬性):倒角、圓角這些「邊」上的三角形 = 1
// 在零件還是局部座標時判斷(之後的旋轉/平移不影響);合併時沒有標記的零件補 0
function markWear(geo, isEdge) {
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position.array, w = new Float32Array(p.length / 3);
  for (let i = 0; i + 8 < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (isEdge(nx, ny, nz)) w[i / 3] = w[i / 3 + 1] = w[i / 3 + 2] = 1;
  }
  geo.setAttribute('wear', new THREE.BufferAttribute(w, 1));
  return geo;
}

// 側面輪廓 [f, y, r] 擠出成厚度 w(沿 X 置中於 o.x)
function side(pts, w, o = {}) {
  const geo = extrudeShape(pts, w, o);
  geo.rotateY(HALF); // shape x(f) → -z,擠出方向 → x
  if (o.x) geo.translate(o.x, 0, 0);
  return geo;
}

// 截面 [x, y, r] 沿槍管方向擠出,從 f0 到 f1
function sect(pts, f0, f1, o = {}) {
  const geo = extrudeShape(pts, f1 - f0, o);
  geo.translate(0, 0, -(f0 + f1) / 2);
  return geo;
}

// 車削件:prof = [[f, r], ...](逆時針:由軸心出發、沿外壁往前、再回到軸心)
function lathe(prof, seg = 24, y = 0, x = 0) {
  const geo = new THREE.LatheGeometry(prof.map(([f, r]) => new THREE.Vector2(r, f)), seg);
  geo.rotateX(-HALF);
  geo.translate(x, y, 0);
  return geo;
}

function box(w, h, d, x, y, f, r = 0.0004) {
  let geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999) : new THREE.BoxGeometry(w, h, d);
  if (r > 0) geo = markWear(geo, (nx, ny, nz) => Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz)) < 0.985); // 圓角
  geo.translate(x, y, -f);
  return geo;
}
const cylX = (r, len, x, y, f, seg = 14) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(HALF).translate(x, y, -f);
const cylY = (r, len, x, y, f, seg = 14) => new THREE.CylinderGeometry(r, r, len, seg).translate(x, y, -f);
const cylZ = (r, f0, f1, x, y, seg = 16) => new THREE.CylinderGeometry(r, r, f1 - f0, seg).rotateX(HALF).translate(x, y, -(f0 + f1) / 2);
const rot = (geo, rx, ry, rz, px = 0, py = 0, pf = 0) => {
  geo.translate(-px, -py, pf);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  return geo.translate(px, py, -pf);
};

// 俯視輪廓 [x, f, r] 擠出成高度 h(沿 Y 置中於 y)
function top(pts, h, y, o = {}) {
  const geo = extrudeShape(pts.map(([x, f, r]) => [x, -f, r]), h, o);
  geo.rotateX(HALF); // (x, s, 擠出) → (x, -擠出, s)
  return geo.translate(0, y, 0);
}

// 兩點之間的圓管:a, b = [x, y, f]
function rod(r, a, b, seg = 12) {
  const A = new THREE.Vector3(a[0], a[1], -a[2]), d = new THREE.Vector3(b[0], b[1], -b[2]).sub(A);
  const len = d.length();
  const geo = new THREE.CylinderGeometry(r, r, len, seg).translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return geo.translate(A.x, A.y, A.z);
}

// 側面滾花的圓柱(沿 Y):n 個齒
function knurlY(r, h, n, x, y, f) {
  const geo = new THREE.CylinderGeometry(r, r, h, n * 2, 1);
  const p = geo.attributes.position, step = Math.PI / n;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i);
    if (Math.hypot(px, pz) < r * 0.99) continue;
    if (Math.round(Math.atan2(pz, px) / step) % 2) { p.setX(i, px * 0.9); p.setZ(i, pz * 0.9); }
  }
  return geo.translate(x, y, -f);
}

// 對每個三角形依法線主軸做盒狀 UV 投影(公尺 × s)
function boxUV(g, s) {
  const p = g.attributes.position.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const X = Math.abs(uy * vz - uz * vy), Y = Math.abs(uz * vx - ux * vz), Z = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const j = i + k * 3, o = (j / 3) * 2;
      let u, v;
      if (X >= Y && X >= Z) { u = p[j + 2]; v = p[j + 1]; }
      else if (Y >= Z) { u = p[j + 2]; v = p[j]; }
      else { u = p[j]; v = p[j + 1]; }
      uv[o] = u * s;
      uv[o + 1] = v * s;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function prep(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'wear') g.deleteAttribute(k);
  if (!g.attributes.wear) g.setAttribute('wear', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  g.clearGroups();
  g.scale(100, 100, 100); // toCreasedNormals 以 0.01 單位量化頂點,先放大避免毫米級零件被合併
  g = toCreasedNormals(g, 0.62);
  g.scale(0.01, 0.01, 0.01);
  return g;
}

// 依材質收集幾何,最後合併成每材質一個 mesh
class Kit {
  constructor() { this.map = new Map(); }
  add(mat, ...geos) {
    let l = this.map.get(mat);
    if (!l) this.map.set(mat, (l = []));
    l.push(...geos);
  }
  build(parent) {
    for (const [mat, list] of this.map) {
      const geo = mergeGeometries(list.map(prep));
      boxUV(geo, mat.userData.uv ?? 12);
      geo.computeBoundingSphere();
      parent.add(new THREE.Mesh(geo, mat));
    }
    this.map.clear();
    return parent;
  }
}

// 沿方向 (df, dy) 走 s 的 2D 點
const at = (p, d, s, q = [0, 0], t = 0) => [p[0] + d[0] * s + q[0] * t, p[1] + d[1] * s + q[1] * t];
const groupAt = (parent, x, y, f) => { const g = new THREE.Group(); g.position.set(x, y, -f); parent.add(g); return g; };

// 彎曲彈匣側面:前緣圓弧半徑 R、以槍口方向 (fc,yc) 為圓心
function arcBand(fc, yc, r0, r1, a0, a1, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([fc + Math.cos(a) * r1, yc + Math.sin(a) * r1]); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([fc + Math.cos(a) * r0, yc + Math.sin(a) * r0]); }
  return pts;
}

// 皮卡汀尼導軌(頂面朝 +Y,之後可旋轉到側面/底面)
function picatinny(k, mat, f0, f1, base) {
  const W = 0.0106, H = 0.0094;
  const profile = (h) => [[-W * 0.78, 0, 0], [W * 0.78, 0, 0], [W * 0.78, h * 0.35, 0], [W, h * 0.55, 0.0004], [W * 0.82, h, 0.0005], [-W * 0.82, h, 0.0005], [-W, h * 0.55, 0.0004], [-W * 0.78, h * 0.35, 0]];
  const geos = [sect(profile(H - 0.003), f0, f1, { bevel: 0.0004, seg: 1 })];
  for (let f = f0 + 0.003; f + 0.0052 <= f1 - 0.001; f += 0.01) geos.push(sect(profile(H), f, f + 0.0052, { bevel: 0.0004, seg: 1 }));
  for (const g of geos) { g.applyMatrix4(base); k.add(mat, g); }
}

// ---------- 手 ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 以基底向量擺放:手指(伸直時)指向 fingerDir、掌心朝 palmN,原點在手腕
function handBasis(wrist, fingerDir, palmN) {
  const z = fingerDir.clone().normalize().negate();
  const y = palmN.clone().normalize().negate();
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(wrist);
}

const FINGERS = [ // [x, z, 長度(近/中/遠), 粗細]
  [-0.0285, -0.084, [0.043, 0.026, 0.021], 1.0],
  [-0.0095, -0.087, [0.047, 0.029, 0.022], 1.02],
  [0.0095, -0.085, [0.044, 0.027, 0.021], 0.98],
  [0.0275, -0.078, [0.035, 0.021, 0.018], 0.86],
];

// side: 1=右手 -1=左手;pose.curl[i]=[掌指, 近端, 遠端] 彎曲角,pose.spread[i]
// pose.thumb={dir:[x,y,z](以右手座標表示:-x=拇指側、-y=掌心側、-z=指尖方向), roll, curl:[a,b]}
function buildHand(k, side, place, pose) {
  const s = side;
  const add = (mat, geo, m) => { geo.applyMatrix4(m); k.add(mat, geo); };
  const P = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const R = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry * s, rz * s));
  // 手掌、掌心皮革、指節護甲、袖口
  const palm = new RoundedBoxGeometry(0.08, 0.029, 0.082, 4, 0.0135);
  const pp = palm.attributes.position;
  for (let i = 0; i < pp.count; i++) { // 往手腕收窄、手背微拱
    const t = clamp01((pp.getZ(i) + 0.041) / 0.082);
    pp.setX(i, pp.getX(i) * (1 - t * 0.14));
    pp.setY(i, pp.getY(i) + (pp.getY(i) > 0 ? 0.004 * (1 - (pp.getX(i) / 0.04) ** 2) : 0));
  }
  add(M.glove, palm, place.clone().multiply(P(0, 0, -0.047)));
  add(M.glove, new RoundedBoxGeometry(0.034, 0.03, 0.052, 2, 0.012), place.clone().multiply(P(-0.024 * s, -0.004, -0.032)).multiply(R(0, 0.25, 0))); // 拇指球
  add(M.leather, new RoundedBoxGeometry(0.066, 0.006, 0.062, 2, 0.0028), place.clone().multiply(P(0.002 * s, -0.0135, -0.05)));
  const cuff = new THREE.CylinderGeometry(0.0292, 0.0302, 0.05, 20, 1, true).rotateX(HALF).scale(1.12, 0.88, 1);
  add(M.glove, cuff, place.clone().multiply(P(0, 0.001, 0.013)));
  add(M.knuckle, new RoundedBoxGeometry(0.036, 0.0035, 0.026, 2, 0.0016), place.clone().multiply(P(0.006 * s, 0.0262, 0.012)));
  // 四指:三節,關節處球形重疊
  FINGERS.forEach(([fx, fz, L, th], i) => {
    const c = pose.curl[i];
    add(M.knuckle, new THREE.SphereGeometry(0.0085 * th, 12, 8).scale(1.05, 0.62, 1), place.clone().multiply(P(fx * s, 0.0135, fz + 0.004)));
    let m = place.clone().multiply(P(fx * s, 0.001, fz)).multiply(R(0, pose.spread[i], 0));
    for (let j = 0; j < 3; j++) {
      m = m.clone().multiply(R(-c[j], 0, 0));
      const r = (0.0102 - j * 0.0007) * th;
      const seg = new THREE.CapsuleGeometry(r, L[j], 4, 12).rotateX(HALF).translate(0, 0, -L[j] / 2);
      add(M.glove, seg, m);
      if (j === 0) add(M.knuckle, new RoundedBoxGeometry(r * 1.25, 0.0032, L[j] * 0.5, 2, 0.0015), m.clone().multiply(P(0, r * 0.9, -L[j] * 0.52)));
      if (j === 2) add(M.leather, new THREE.SphereGeometry(r * 0.96, 10, 8).scale(1, 0.9, 1.05), m.clone().multiply(P(0, -0.001, -L[j])));
      m = m.multiply(P(0, 0, -L[j]));
    }
  });
  // 拇指
  const t = pose.thumb;
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), V(t.dir[0] * s, t.dir[1], t.dir[2]).normalize());
  let m = place.clone().multiply(P(-0.032 * s, -0.007, -0.024)).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(R(0, 0, t.roll ?? 0));
  const TL = [0.036, 0.031, 0.026];
  for (let j = 0; j < 3; j++) {
    if (j > 0) m = m.clone().multiply(R(-t.curl[j - 1], 0, 0));
    const r = [0.0128, 0.0108, 0.0098][j];
    add(M.glove, new THREE.CapsuleGeometry(r, TL[j], 4, 12).rotateX(HALF).translate(0, 0, -TL[j] / 2), m);
    if (j === 2) add(M.leather, new THREE.SphereGeometry(r * 0.97, 10, 8), m.clone().multiply(P(0, -0.001, -TL[j])));
    m = m.multiply(P(0, 0, -TL[j]));
  }
}

// 前臂袖子:從手套袖口往手肘;開口內縮(暗色內裡)、反摺袖口、繞軸扭轉的皺褶
function buildSleeve(k, wrist, elbow, side) {
  const dir = new THREE.Vector3().subVectors(elbow, wrist);
  const len = dir.length();
  const prof = [[0, 0.0298], [0.003, 0.0338], [0.011, 0.0356], [0.021, 0.0352], [0.029, 0.0346]];
  for (let i = 1; i <= 14; i++) {
    const f = 0.029 + (i / 14) * (len - 0.029);
    prof.push([f, 0.0346 + (f / len) * 0.012 + Math.sin(i * 1.7) * 0.001]);
  }
  prof.push([len, 0]);
  const orient = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.clone().normalize()));
  orient.setPosition(wrist);
  const geo = lathe(prof, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), f = -p.getZ(i), a = Math.atan2(y, x);
    const w = 1 + (f > 0.03 ? 0.06 * Math.sin(a * 3 + f * 38 * side) + 0.035 * Math.sin(a * 5 - f * 61) : 0.012 * Math.sin(a * 7));
    p.setXYZ(i, x * w * 1.1, y * w * 0.92, p.getZ(i));
  }
  k.add(M.sleeve, geo.applyMatrix4(orient));
  k.add(M.sleeveIn, lathe([[0.035, 0], [0, 0.0298]], 24).scale(1.1, 0.92, 1).applyMatrix4(orient));
}

const GRIP_CURL = [[1.3, 1.35, 0.45], [1.42, 1.4, 0.45], [1.45, 1.4, 0.45], [1.5, 1.35, 0.45]];
const TRIGGER_CURL = [0.5, 1.05, 0.5];

// 右手握持角度為 a(握把後傾)的握把;c=握把中心頂端 (f,y),depth=握把前後厚度
function rightGripHand(k, a, c, depth, halfW, opt = {}) {
  const d = V(0, -Math.cos(a), Math.sin(a)); // 沿握把往下
  const p = V(0, -Math.sin(a), -Math.cos(a)); // 垂直握把往前
  const center = V(0, c[1], -c[0]).addScaledVector(d, opt.s ?? 0.042);
  const wrist = center.clone().addScaledVector(p, depth * 0.5 + 0.009 - 0.084 + (opt.reach ?? 0)).add(V(halfW + 0.0135, 0, 0));
  const place = handBasis(wrist, p, V(-1, 0, 0));
  const curl = GRIP_CURL.map((v) => v.slice());
  curl[0] = opt.index ?? TRIGGER_CURL;
  buildHand(k, 1, place, { curl, spread: [0.2, 0, 0.04, 0.1], thumb: opt.thumb ?? { dir: [-0.3, -0.55, -0.78], roll: 0, curl: [0.2, 0.25] } });
  const w = new THREE.Vector3(0, 0, 0.034).applyMatrix4(place);
  buildSleeve(k, w, w.clone().add(opt.elbow ?? V(0.1, -0.24, 0.4)), 1);
  return { place, d, p };
}

// 左手托住長槍護木:c=托握點(護木底部中心),朝向往右包覆
function leftForeHand(k, f, yBottom, halfW, opt = {}) {
  const palmCenter = V(-halfW * 0.55, yBottom - 0.012, -f);
  const fingerDir = V(1, 0.35, -0.12).normalize();
  const palmN = V(0.45, 1, 0).normalize();
  const wrist = palmCenter.clone().addScaledVector(fingerDir, -0.047);
  const place = handBasis(wrist, fingerDir, palmN);
  buildHand(k, -1, place, {
    curl: [[0.55, 1.2, 0.55], [0.6, 1.25, 0.6], [0.62, 1.25, 0.6], [0.7, 1.2, 0.55]],
    spread: [0.08, 0.02, -0.03, -0.1],
    thumb: { dir: [-0.75, -0.35, -0.55], roll: 0, curl: [0.15, 0.2] },
  });
  const w = new THREE.Vector3(0, 0, 0.034).applyMatrix4(place);
  buildSleeve(k, w, w.clone().add(opt.elbow ?? V(-0.2, -0.26, 0.42)), -1);
  return palmCenter;
}

// 手槍:左手包住右手指外側(拇指朝前)
function leftSupportHand(k, a, c, depth, halfW) {
  const d = V(0, -Math.cos(a), Math.sin(a));
  const p = V(0, -Math.sin(a), -Math.cos(a));
  const center = V(0, c[1], -c[0]).addScaledVector(d, 0.05);
  const wrist = center.clone().addScaledVector(p, depth * 0.5 + 0.032 - 0.084).add(V(-(halfW + 0.026), 0, 0));
  const place = handBasis(wrist, p, V(1, 0, 0));
  buildHand(k, -1, place, {
    curl: [[1.3, 1.3, 0.45], [1.35, 1.35, 0.45], [1.4, 1.35, 0.45], [1.45, 1.3, 0.45]],
    spread: [0.0, 0.0, 0.05, 0.12],
    thumb: { dir: [-0.35, -0.1, -0.93], roll: 0, curl: [0.1, 0.15] },
  });
  const w = new THREE.Vector3(0, 0, 0.034).applyMatrix4(place);
  buildSleeve(k, w, w.clone().add(V(-0.1, -0.48, 0.12)), -1);
}

// 換彈時左手離開護木去抓彈匣(跟著彈匣下去再上來),結束前回到護木
function leftToMag(st, t, x, y, z) {
  const L = st && st.left;
  if (!L) return;
  const h = st.palm, g = smooth(0.03, 0.13, t) * (1 - smooth(0.7, 0.84, t));
  L.position.set(h.x + (x - h.x) * g, h.y + (y - h.y) * g, h.z + (z - h.z) * g);
  L.rotation.set(-0.15 * g, 0.35 * g, -1.35 * g);
}

const AK_DOT = { fc: 0.072, y: 0.0982 }; // AK 紅點鏡:鏡身中心(往槍口距離)與窗口中心高度
const M4_ACOG_Y = 0.104; // M4 ACOG 光軸高度

// ---------- Kobra 式反射式紅點鏡(AK 左側軌座):窗框 + 前伸遮光罩 + 亮度旋鈕 ----------
// 紅點本身是準直光:永遠落在彈道上(畫面正中央),由 HUD 畫(src/weapons/scope.js),不隨槍身晃動。
// fc:鏡身中心(往槍口距離)、WY:窗口中心高度;窗口內開口 ±0.0155 × ±0.0145
function kobraGeos(k, fc, WY) {
  const P = M.park, L = 0.074, f0 = fc - L / 2, f1 = fc + L / 2;
  k.add(P, box(0.042, 0.007, L + 0.006, 0, WY - 0.0145 - 0.0035, fc, 0.0015)); // 底板
  k.add(P, box(0.03, 0.004, L - 0.01, 0, WY - 0.0145 - 0.0085, fc, 0.001));
  for (const sx of [-1, 1]) {
    k.add(P, side([[f0, WY - 0.0146], [f1, WY - 0.0146], [f1 + 0.006, WY + 0.0185, 0.003], [f0 + 0.006, WY + 0.0185, 0.003], [f0, WY + 0.012, 0.002]], 0.0042, { x: sx * 0.0176, bevel: 0.0008 }));
  }
  k.add(P, box(0.0394, 0.0042, L + 0.004, 0, WY + 0.0166, fc + 0.004, 0.0012)); // 頂罩
  // 前窗框(四邊細框)與後框唇
  k.add(P, box(0.031, 0.0026, 0.004, 0, WY + 0.0137, f1 - 0.002, 0.0006));
  k.add(P, box(0.031, 0.0026, 0.004, 0, WY - 0.0137, f1 - 0.002, 0.0006));
  for (const sx of [-1, 1]) k.add(P, box(0.0026, 0.027, 0.004, sx * 0.0142, WY, f1 - 0.002, 0.0006));
  k.add(M.lens, box(0.031, 0.0012, 0.0016, 0, WY - 0.0124, f1 - 0.0045, 0)); // 前鏡片下緣反光
  // 亮度旋鈕(右)、電池蓋(左)、側軌座支臂與夾桿(左側往下夾住機匣側軌)
  k.add(M.worn, cylX(0.0068, 0.003, 0.0213, WY - 0.003, fc - 0.012, 20));
  k.add(P, cylX(0.0064, 0.007, 0.024, WY - 0.003, fc - 0.012, 20));
  for (let i = 0; i < 10; i++) k.add(M.dark, rot(box(0.0072, 0.0009, 0.0012, 0.024, WY - 0.003 + 0.0062, fc - 0.012, 0), (i / 10) * Math.PI * 2, 0, 0, 0.024, WY - 0.003, fc - 0.012));
  k.add(P, cylX(0.0058, 0.006, -0.022, WY + 0.002, fc + 0.014, 16));
  k.add(M.steel, box(0.009, 0.006, 0.05, -0.0205, WY - 0.0215, fc + 0.004, 0.0015));
  k.add(M.steel, box(0.004, 0.056, 0.05, -0.0245, WY - 0.0465, fc + 0.004, 0.0015));
  k.add(M.steel, rot(box(0.004, 0.006, 0.034, -0.0275, WY - 0.064, fc - 0.006, 0.0015), 0.25, 0, 0, -0.0275, WY - 0.064, fc - 0.006));
  k.add(M.worn, cylX(0.0032, 0.006, -0.0272, WY - 0.064, fc + 0.014, 12));
}

// ---------- 3× ACOG 式光學瞄準鏡(TA31 風格:前寬後窄的鋁合金鏡身、頂部光纖、平頂座) ----------
// 開鏡後的放大畫面與發光人字準心由 HUD 畫(src/weapons/scope.js);AY = 光軸高度
function acogGeos(k, AY) {
  const A = M.anodized;
  k.add(M.rubber, lathe([[-0.049, 0.0126], [-0.049, 0.0184], [-0.0465, 0.0192], [-0.039, 0.019], [-0.0372, 0.018], [-0.0372, 0.0126], [-0.049, 0.0126]], 36, AY)); // 橡膠眼罩
  k.add(A, lathe([[-0.0375, 0], [-0.0375, 0.0168], [-0.033, 0.0174], [-0.0145, 0.0174], [-0.0125, 0.0162], [-0.0125, 0]], 36, AY)); // 目鏡筒
  for (let i = 0; i < 2; i++) k.add(M.dark, lathe([[-0.031 + i * 0.006, 0.0172], [-0.031 + i * 0.006, 0.01755], [-0.0298 + i * 0.006, 0.01755], [-0.0298 + i * 0.006, 0.0172]], 36, AY));
  k.add(M.lens, cylZ(0.0124, -0.0478, -0.0472, 0, AY, 32));
  // 鏡身(前寬後窄的圓角六角截面)
  k.add(A, sect([[-0.0166, AY - 0.0152, 0.005], [0.0166, AY - 0.0152, 0.005], [0.0176, AY + 0.0118, 0.006], [0.0108, AY + 0.0186, 0.004], [-0.0108, AY + 0.0186, 0.004], [-0.0176, AY + 0.0118, 0.006]], -0.0145, 0.064, { bevel: 0.0016 }));
  k.add(A, sect([[-0.0206, AY - 0.0192, 0.006], [0.0206, AY - 0.0192, 0.006], [0.0216, AY + 0.0142, 0.007], [0.0128, AY + 0.0218, 0.005], [-0.0128, AY + 0.0218, 0.005], [-0.0216, AY + 0.0142, 0.007]], 0.058, 0.106, { bevel: 0.002 }));
  k.add(A, lathe([[0.1055, 0.0162], [0.1055, 0.0188], [0.1105, 0.0188], [0.1112, 0.0176], [0.1112, 0.0162], [0.1055, 0.0162]], 36, AY)); // 物鏡遮光環
  k.add(M.lens, cylZ(0.0168, 0.1056, 0.1062, 0, AY, 32));
  // 頂部光纖集光管(自發光)+ 護槽、上/右調整蓋
  k.add(A, box(0.0094, 0.0052, 0.058, 0, AY + 0.0228, 0.074, 0.0015));
  k.add(M.fiber, cylZ(0.0023, 0.047, 0.101, 0, AY + 0.0262, 10));
  for (let i = 0; i < 4; i++) k.add(M.dark, box(0.0096, 0.0016, 0.0022, 0, AY + 0.0262, 0.053 + i * 0.0135, 0));
  k.add(A, cylY(0.0068, 0.0055, 0, AY + 0.0205, 0.029, 24));
  k.add(A, cylX(0.0068, 0.0055, 0.0195, AY + 0.001, 0.029, 24));
  // 平頂快拆座:底座 + 左側兩顆拇指螺帽
  k.add(A, box(0.026, AY - 0.0152 - 0.0692 + 0.002, 0.07, 0, (AY - 0.0152 + 0.0692) / 2, 0.036, 0.0015));
  for (const f of [0.012, 0.06]) {
    k.add(M.worn, cylX(0.0062, 0.0055, -0.0158, 0.0745, f, 18));
    k.add(M.steel, box(0.003, 0.012, 0.004, -0.0188, 0.0745, f, 0.0006));
  }
}

// ---------- Glock 17 ----------
function buildPistol(g) {
  const k = new Kit(), ks = new Kit(), km = new Kit();
  const slide = new THREE.Group(), mag = new THREE.Group();
  g.add(slide, mag);
  const SW = 0.0128, SB = 0.0165, ST = 0.0455, BORE = 0.031;

  // 滑套:頂部兩側倒角的截面
  ks.add(M.slide, sect([[-SW, SB, 0.0005], [SW, SB, 0.0005], [SW, 0.0402, 0.0012], [0.0093, ST, 0.0014], [-0.0093, ST, 0.0014], [-SW, 0.0402, 0.0012]], -0.024, 0.1612, { bevel: 0.0014 }));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 8; i++) ks.add(M.dark, box(0.0008, 0.019, 0.0012, sx * (SW - 0.0002), 0.0285, -0.0205 + i * 0.0029, 0)); // 後防滑紋
    for (let i = 0; i < 6; i++) ks.add(M.dark, box(0.0008, 0.015, 0.0011, sx * (SW - 0.0002), 0.0295, 0.121 + i * 0.0028, 0)); // 前防滑紋
  }
  // 退殼口 + 槍管節套
  ks.add(M.dark, box(0.0142, 0.003, 0.041, 0.0022, ST - 0.0013, 0.056, 0));
  ks.add(M.worn, box(0.0116, 0.003, 0.0365, 0.0016, ST - 0.0012, 0.0545, 0.0005));
  ks.add(M.dark, box(0.0012, 0.0085, 0.041, SW - 0.0003, 0.0395, 0.056, 0));
  ks.add(M.worn, box(0.001, 0.0062, 0.033, SW - 0.0001, 0.0392, 0.0565, 0.0003));
  ks.add(M.worn, box(0.0014, 0.0035, 0.012, SW + 0.0002, 0.0405, 0.029, 0.0004)); // 抽殼鉤
  // 照門與準星:三點式氚管夜光(白環 + 綠色自發光點,暗處也對得準)
  ks.add(M.polySmooth, box(0.016, 0.0024, 0.009, 0, ST + 0.0011, -0.016, 0.0006));
  for (const sx of [-1, 1]) {
    ks.add(M.polySmooth, box(0.0058, 0.0058, 0.0078, sx * 0.0051, ST + 0.0032, -0.0165, 0.0006));
    ks.add(M.white, cylZ(0.0013, -0.0209, -0.0203, sx * 0.0051, ST + 0.0034, 14));
    ks.add(M.tritium, cylZ(0.0008, -0.0211, -0.0205, sx * 0.0051, ST + 0.0034, 12));
  }
  ks.add(M.polySmooth, box(0.0034, 0.0052, 0.0055, 0, ST + 0.0024, 0.152, 0.0007));
  ks.add(M.white, cylZ(0.0013, 0.1488, 0.1494, 0, ST + 0.0032, 14));
  ks.add(M.tritium, cylZ(0.0008, 0.1486, 0.1492, 0, ST + 0.0032, 12));
  // 槍口:槍管冠部、膛線暗孔、復進簧導桿
  ks.add(M.worn, lathe([[0.15, 0], [0.15, 0.0068], [0.1611, 0.0068], [0.1617, 0.0062], [0.1617, 0.0046], [0.1555, 0.0046], [0.1555, 0]], 24, BORE));
  ks.add(M.dark, cylZ(0.0045, 0.1555, 0.1558, 0, BORE, 16));
  ks.add(M.polySmooth, lathe([[0.15, 0], [0.15, 0.0042], [0.1612, 0.0042], [0.1616, 0.0034], [0.1616, 0]], 18, 0.0212));
  ks.build(slide);

  // 槍身(聚合物):握把後傾 22°,前握把指凹
  const A = (22 * Math.PI) / 180;
  const d = [-Math.sin(A), -Math.cos(A)], p = [Math.cos(A), -Math.sin(A)];
  const F0 = [0.019, -0.01], B0 = at(F0, p, -0.05);
  const F = (s, bump = 0) => [...at(F0, d, s, p, bump), 0.008];
  const B = (s) => at(B0, d, s);
  const frame = [
    [-0.021, 0.0165, 0.001], [-0.0335, 0.0135, 0.003], [-0.031, 0.0082, 0.003], [...at(B(0.012), p, 0.0005), 0.008],
    [...B(0.045), 0.02], [...at(B(0.079), p, -0.0018), 0.003], [...at(F(0.08), p, 0.0016), 0.003],
    [...F(0.068), 0.01], [...F(0.036, 0.0012), 0.03], F(0.01),
    [...F0, 0.004], [0.022, -0.0042, 0.002], [0.073, -0.0042, 0.001], [0.0745, -0.0015, 0.0015], [0.1505, -0.0015, 0.002], [0.1578, 0.0035, 0.003], [0.1578, 0.0165, 0.001],
  ];
  k.add(M.polymer, side(frame, 0.0286, { bevel: 0.0026, seg: 3 }));
  // 護弓(方形前緣)
  k.add(M.polymer, side([[0.02, -0.002], [0.0758, -0.002, 0.001], [0.0765, -0.0125, 0.002], [0.0742, -0.0218, 0.004], [0.066, -0.0248, 0.004], [0.026, -0.0248, 0.007], [0.0172, -0.0152, 0.004]], 0.0118, {
    bevel: 0.0018, holes: [[[0.0262, -0.0046, 0.002], [0.0662, -0.0046, 0.002], [0.0675, -0.0122, 0.003], [0.0646, -0.0193, 0.003], [0.029, -0.0193, 0.005], [0.0228, -0.0126, 0.003]]],
  }));
  // 扳機(含安全片)
  k.add(M.polySmooth, side([[0.0405, -0.003], [0.0465, -0.003], [0.0456, -0.0105, 0.004], [0.0428, -0.0175, 0.0015], [0.0398, -0.0172, 0.0015], [0.0412, -0.0105, 0.004]], 0.0062, { bevel: 0.0012 }));
  k.add(M.dark, side([[0.0442, -0.0058], [0.0476, -0.0062], [0.0464, -0.0138, 0.003], [0.0436, -0.0152, 0.001]], 0.0018, { bevel: 0.0004 }));
  // 下導軌(防塵蓋底部)與溝槽
  for (const sx of [-1, 1]) k.add(M.dark, box(0.0007, 0.0012, 0.064, sx * 0.0141, 0.0012, 0.117, 0));
  k.add(M.dark, box(0.0288, 0.0014, 0.0035, 0, -0.0006, 0.128, 0));
  // 銷、滑套卡榫、分解桿、彈匣釋放鈕
  for (const [f, y] of [[-0.011, 0.0045], [0.037, 0.0045], [0.0595, 0.0105]]) k.add(M.worn, cylX(0.0017, 0.0294, 0, y, f, 12));
  k.add(M.steel, side([[0.033, 0.0138], [0.0605, 0.0138, 0.001], [0.0605, 0.0104, 0.001], [0.038, 0.0094], [0.033, 0.0104]], 0.0012, { x: -0.0148, bevel: 0.0003 }));
  k.add(M.steel, side([[0.0655, 0.0148], [0.0708, 0.0148, 0.0006], [0.0702, 0.0098, 0.0008], [0.066, 0.0098, 0.0008]], 0.0312, { bevel: 0.0004 }));
  k.add(M.polySmooth, rot(box(0.0026, 0.0072, 0.0058, -0.0148, -0.0108, 0.0205, 0.0008), -A, 0, 0, -0.0148, -0.0108, 0.0205));
  k.build(g);

  // 彈匣(換彈時沿握把滑出)
  const C0 = at(at(F0, p, -0.025), p, 0.003);
  const mc = (s, t) => at(C0, d, s, p, t);
  km.add(M.polySmooth, side([mc(-0.012, -0.0165), mc(-0.012, 0.0165), [...mc(0.079, 0.0165), 0.002], [...mc(0.079, -0.0165), 0.002]], 0.022, { bevel: 0.001 }));
  km.add(M.worn, side([mc(-0.0135, -0.012), mc(-0.0135, 0.004), [...mc(-0.011, 0.006), 0.001], [...mc(-0.011, -0.014), 0.001]], 0.012, { bevel: 0.0004 })); // 頂端子彈
  km.add(M.polymer, side([
    at(B(0.08), p, -0.0016), at(F(0.08), p, 0.0016), [...at(F(0.0875), p, 0.0018), 0.002], [...at(B(0.0875), p, -0.0034), 0.0025],
  ], 0.0262, { bevel: 0.0016 }));
  km.build(mag);

  return {
    muzzle: new THREE.Vector3(0, BORE, -0.163), length: 0.2, slide, mag,
    sight: { rear: [-0.0165, ST + 0.0061], front: [0.152, ST + 0.005], eye: 0.43 },
    grip: { a: A, c: [0.019 - 0.025 * Math.cos(A), -0.01 + 0.025 * Math.sin(A)], depth: 0.05, halfW: 0.0143 },
    anim(shot, reload, empty) {
      const lock = empty && (reload < 0 || reload < 0.86);
      const k1 = shot < 0.085 ? Math.sin((shot / 0.085) * Math.PI) : 0;
      slide.position.z = lock ? 0.026 : k1 * 0.026;
      const out = reload < 0 ? 0 : smooth(0.08, 0.3, reload) * (1 - smooth(0.52, 0.78, reload));
      mag.position.set(0, -Math.cos(A) * out * 0.2, Math.sin(A) * out * 0.2);
    },
  };
}

// ---------- Colt Python 6" ----------
function buildRevolver(g) {
  const k = new Kit(), kd = new Kit(), kc = new Kit();
  const BORE = 0.034, CY = 0.0195, CR = 0.0205;
  // 槍身框架(含彈巢窗口)
  k.add(M.blued, side([
    [-0.012, 0.047, 0.004], [0.0838, 0.047, 0.0015], [0.0838, -0.0058, 0.002], [0.061, -0.0092, 0.004], [0.0125, -0.0102, 0.003],
    [0.0062, -0.04, 0.012], [-0.008, -0.068, 0.012], [-0.017, -0.08, 0.005], [-0.043, -0.082, 0.006],
    [-0.048, -0.062, 0.016], [-0.0365, -0.03, 0.02], [-0.0262, 0.01, 0.012], [-0.0222, 0.03, 0.006],
  ], 0.0244, { bevel: 0.0022, seg: 3, holes: [[[0.0262, -0.0028, 0.002], [0.0742, -0.0028, 0.002], [0.0742, 0.0412, 0.002], [0.0262, 0.0412, 0.002]]] }));
  k.add(M.blued, side([[0.0165, -0.002], [0.0262, -0.002], [0.0262, 0.0405], [0.0165, 0.0405, 0.004], [0.011, 0.02, 0.006]], 0.0372, { bevel: 0.003, seg: 3 })); // 後擋板
  k.add(M.dark, box(0.0079, 0.0012, 0.054, 0, 0.0472, 0.054, 0)); // 頂條消光紋
  // 照門(可調)
  k.add(M.blued, side([[0.0015, 0.0468], [0.0262, 0.0468], [0.0248, 0.0508, 0.001], [0.0062, 0.0532, 0.001], [0.0015, 0.0532, 0.0005]], 0.0122, { bevel: 0.0008 }));
  for (const sx of [-1, 1]) k.add(M.blued, box(0.0042, 0.0042, 0.0042, sx * 0.0038, 0.0552, 0.0034, 0.0005));
  k.add(M.worn, cylX(0.0014, 0.0135, 0, 0.0505, 0.019, 10));
  // 槍管、全長下護套、通風肋、準星
  k.add(M.blued, lathe([[0.08, 0], [0.08, 0.0098], [0.2288, 0.0098], [0.2302, 0.0086], [0.2302, 0.0047], [0.223, 0.0047], [0.223, 0]], 28, BORE));
  k.add(M.dark, cylZ(0.0046, 0.2229, 0.2232, 0, BORE, 16));
  k.add(M.blued, side([[0.0836, 0.031], [0.2288, 0.031], [0.2296, 0.0115, 0.008], [0.2235, 0.0038, 0.004], [0.0836, 0.0038]], 0.0192, { bevel: 0.0042, seg: 3 }));
  const vents = [];
  for (let i = 0; i < 6; i++) vents.push([[0.097 + i * 0.0205, 0.0447, 0.0016], [0.112 + i * 0.0205, 0.0447, 0.0016], [0.112 + i * 0.0205, 0.0482, 0.0016], [0.097 + i * 0.0205, 0.0482, 0.0016]]);
  k.add(M.blued, side([[0.0836, 0.0405], [0.2265, 0.0405], [0.2265, 0.0526, 0.0012], [0.0836, 0.0526]], 0.0086, { bevel: 0.0008, holes: vents }));
  k.add(M.dark, box(0.0055, 0.0004, 0.13, 0, 0.0527, 0.157, 0)); // 肋條頂部防眩紋
  k.add(M.blued, side([[0.2045, 0.0524], [0.2262, 0.0524], [0.2262, 0.0606, 0.0012], [0.222, 0.0612, 0.0008]], 0.0032, { bevel: 0.0005 }));
  k.add(M.red, box(0.0034, 0.0028, 0.0022, 0, 0.0582, 0.2185, 0.0003));
  // 握把護弓、扳機、擊錘、彈巢釋放鈕、側板螺絲
  k.add(M.blued, side([[0.009, -0.006], [0.0625, -0.006], [0.0595, -0.016, 0.006], [0.049, -0.0305, 0.01], [0.022, -0.0325, 0.01], [0.0095, -0.022, 0.006]], 0.0094, {
    bevel: 0.0016, holes: [[[0.0165, -0.0105, 0.003], [0.0545, -0.0105, 0.004], [0.046, -0.0255, 0.008], [0.0245, -0.0265, 0.008], [0.0168, -0.0195, 0.004]]],
  }));
  k.add(M.worn, side([[0.0305, -0.008], [0.0362, -0.008], [0.0352, -0.016, 0.005], [0.0302, -0.0232, 0.0015], [0.0278, -0.0226, 0.0015], [0.0312, -0.0158, 0.005]], 0.0068, { bevel: 0.0012 }));
  k.add(M.blued, side([[-0.0175, 0.0255], [-0.0058, 0.0315], [-0.0082, 0.0462], [-0.0198, 0.0572, 0.004], [-0.0348, 0.0602, 0.005], [-0.0372, 0.0548, 0.003], [-0.0222, 0.0462, 0.004], [-0.0205, 0.031]], 0.0082, { bevel: 0.0014 }));
  for (let i = 0; i < 5; i++) k.add(M.dark, box(0.0084, 0.0006, 0.0011, 0, 0.0598 - i * 0.0011, -0.031 + i * 0.0024, 0)); // 擊錘防滑紋
  k.add(M.worn, side([[0.0028, 0.0225], [0.0142, 0.0225, 0.0015], [0.0142, 0.0305, 0.0015], [0.0028, 0.0305]], 0.003, { x: -0.0134, bevel: 0.0006 }));
  for (const [f, y] of [[-0.004, 0.0045], [0.018, -0.0045], [-0.0165, 0.02]]) {
    k.add(M.worn, cylX(0.0028, 0.0012, 0.0125, y, f, 16));
    k.add(M.dark, box(0.0006, 0.0006, 0.0048, 0.0132, y, f, 0));
  }
  // 方格紋胡桃木握把 + 金色小馬徽 + 握把螺絲
  const grip = [[0.0098, -0.0118, 0.004], [0.0035, -0.04, 0.014], [-0.009, -0.07, 0.014], [-0.0175, -0.0855, 0.008], [-0.045, -0.0878, 0.012], [-0.0508, -0.062, 0.018], [-0.0385, -0.026, 0.02], [-0.0295, 0.0085, 0.006], [-0.0175, 0.0065, 0.004], [0.006, -0.006, 0.004]];
  k.add(M.pyWood, side(grip, 0.0372, { bevel: 0.0055, seg: 4 }));
  for (const sx of [-1, 1]) {
    k.add(M.gold, cylX(0.0046, 0.0012, sx * 0.0184, -0.0205, -0.0158, 24));
    k.add(M.worn, cylX(0.0032, 0.0012, sx * 0.0183, -0.048, -0.024, 16));
  }
  k.build(g);

  // 彈巢擺出組:樞軸在彈巢左下方(沿 Z),換彈時繞 Z 軸往左擺出
  const PX = -0.0105, PY = 0.0028;
  const drum = groupAt(g, PX, PY, 0);
  const spin = groupAt(drum, -PX, CY - PY, 0);
  // 彈巢:帶凹槽的截面擠出(6 個彈膛孔),後段無凹槽
  const fl = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const flute = Math.pow(Math.max(0, Math.cos(6 * (a - Math.PI / 2 - Math.PI / 6))), 18);
    const r = CR - flute * 0.0032;
    fl.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const chambers = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3, ring = [];
    for (let j = 0; j < 20; j++) { const b = (j / 20) * Math.PI * 2; ring.push([Math.cos(a) * 0.0145 + Math.cos(b) * 0.0046, Math.sin(a) * 0.0145 + Math.sin(b) * 0.0046]); }
    chambers.push(ring);
  }
  kc.add(M.blued, sect(fl, 0.0352, 0.0712, { bevel: 0.0012, seg: 2, holes: chambers, cs: 2 }));
  kc.add(M.blued, lathe([[0.0272, 0], [0.0272, CR - 0.001], [0.0282, CR], [0.0354, CR], [0.0354, 0]], 48));
  for (let i = 0; i < 6; i++) { // 彈巢止動槽、彈頭
    const a = Math.PI / 2 + Math.PI / 6 + (i * Math.PI) / 3;
    kc.add(M.dark, rot(box(0.0034, 0.0012, 0.0052, Math.cos(a) * CR, Math.sin(a) * CR, 0.0322, 0), 0, 0, a - HALF, Math.cos(a) * CR, Math.sin(a) * CR, 0.0322));
    const b = Math.PI / 2 + (i * Math.PI) / 3;
    kc.add(M.copper, lathe([[0.058, 0], [0.058, 0.0044], [0.0655, 0.0043], [0.068, 0.0028], [0.068, 0]], 12, Math.sin(b) * 0.0145, Math.cos(b) * 0.0145));
    kc.add(M.dark, cylZ(0.0012, 0.0679, 0.0682, Math.cos(b) * 0.0145, Math.sin(b) * 0.0145, 8));
  }
  kc.add(M.worn, lathe([[0.0712, 0], [0.0712, 0.0042], [0.0722, 0.0042], [0.0722, 0]], 16)); // 中心軸
  kc.build(spin);
  // 退殼桿(收在下護套內)、彈巢臂
  kd.add(M.worn, cylZ(0.0026, 0.0722, 0.156, -PX, CY - PY, 12));
  kd.add(M.worn, lathe([[0.156, 0], [0.156, 0.0036], [0.162, 0.0036], [0.163, 0.0028], [0.163, 0]], 16, CY - PY, -PX));
  kd.add(M.blued, box(0.007, 0.012, 0.004, 0.003, (CY - PY) / 2, 0.0735, 0.001));
  kd.build(drum);

  let shots = 0, last = 9;
  return {
    muzzle: new THREE.Vector3(0, BORE, -0.232), length: 0.3, drum,
    grip: { a: (28 * Math.PI) / 180, c: [-0.012, -0.004], depth: 0.046, halfW: 0.0186 },
    anim(shot, reload) {
      if (shot < last) shots++;
      last = shot;
      const sw = reload < 0 ? 0 : smooth(0.05, 0.2, reload) * (1 - smooth(0.8, 0.94, reload));
      drum.rotation.z = sw * 1.25;
      spin.rotation.z = ((shots + Math.min(1, shot / 0.09)) * Math.PI) / 3 + (reload < 0 ? 0 : smooth(0.6, 0.85, reload) * Math.PI * 2);
    },
  };
}
// ---------- AK-47(AKM) ----------
function buildAK(g) {
  const k = new Kit(), kb = new Kit(), km = new Kit();
  const BORE = 0.045;
  // 沖壓機匣
  k.add(M.steel, side([[-0.048, 0.006, 0.002], [-0.048, 0.0555, 0.002], [0.2065, 0.0555, 0.002], [0.2122, 0.0495, 0.002], [0.2122, 0.002, 0.002], [0.146, -0.0028, 0.002], [0.08, -0.0028, 0.002], [0.062, 0.0005], [-0.03, 0.0005, 0.002]], 0.0372, { bevel: 0.0014 }));
  // 防塵蓋(拱形截面 + 橫肋)與復進簧卡榫
  const arch = (w, top) => {
    const pts = [[-w, 0.052], [w, 0.052]];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push([Math.cos(a) * w, 0.061 + Math.sin(a) * (top - 0.061)]); }
    return pts;
  };
  k.add(M.steel, sect(arch(0.0194, 0.0728), -0.051, 0.196, { bevel: 0.0012, cs: 2 }));
  for (const f of [-0.032, -0.018, -0.004, 0.01]) k.add(M.steel, sect(arch(0.0199, 0.0736), f, f + 0.0045, { bevel: 0.0012, cs: 2 }));
  k.add(M.worn, lathe([[-0.059, 0], [-0.059, 0.0042], [-0.0565, 0.0052], [-0.05, 0.0052], [-0.05, 0]], 18, 0.0625));
  // 表尺座、表尺板(帶缺口)
  k.add(M.steel, side([[0.19, 0.051], [0.2425, 0.051], [0.2425, 0.0625, 0.002], [0.2, 0.0742, 0.003], [0.19, 0.0742, 0.002]], 0.031, { bevel: 0.0015 }));
  k.add(M.steel, rot(box(0.0205, 0.0026, 0.083, 0, 0.0808, 0.25, 0.0008), 0.045, 0, 0, 0, 0.0808, 0.29));
  k.add(M.steel, side([[0.2, 0.0742], [0.215, 0.0742], [0.215, 0.0795], [0.2, 0.0795]], 0.012, { bevel: 0.0008 })); // 表尺板墊高
  for (const sx of [-1, 1]) k.add(M.steel, box(0.0072, 0.0062, 0.0036, sx * 0.0068, 0.0857, 0.2105, 0.0006));
  k.add(M.worn, box(0.0245, 0.0045, 0.008, 0, 0.0832, 0.243, 0.0008)); // 表尺游標
  // 上護木(木)+ 導氣管、導氣箍、前段
  k.add(M.akWood, sect([[-0.0172, 0.055, 0.004], [0.0172, 0.055, 0.004], [0.0182, 0.068, 0.009], [0.012, 0.0815, 0.006], [-0.012, 0.0815, 0.006], [-0.0182, 0.068, 0.009]], 0.2445, 0.404, { bevel: 0.003, seg: 3 }));
  k.add(M.steel, lathe([[0.4, 0], [0.4, 0.0108], [0.462, 0.0108], [0.462, 0]], 22, 0.0688));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.add(M.dark, cylX(0.0016, 0.0218, sx * 0.0003, 0.0688, 0.425 + i * 0.011, 10));
  k.add(M.steel, side([[0.455, 0.0342], [0.4925, 0.0342, 0.002], [0.4965, 0.05], [0.4965, 0.0782, 0.004], [0.463, 0.0802, 0.004], [0.455, 0.075]], 0.0262, { bevel: 0.0018 }));
  k.add(M.steel, new THREE.TorusGeometry(0.0072, 0.0016, 8, 16).rotateY(HALF).translate(-0.0145, 0.04, -0.474)); // 前背帶環
  // 槍管、準星座(帶護耳)、刺刀座、通條、制退器
  k.add(M.steel, lathe([[0.2, 0], [0.2, 0.0106], [0.31, 0.0102], [0.59, 0.0093], [0.59, 0]], 24, BORE));
  k.add(M.steel, lathe([[0.558, 0], [0.558, 0.0138], [0.5925, 0.0138], [0.5925, 0]], 24, BORE));
  k.add(M.steel, side([[0.569, 0.05], [0.5905, 0.05], [0.5875, 0.0882, 0.002], [0.5745, 0.0882, 0.002]], 0.0132, { bevel: 0.0012 }));
  for (const sx of [-1, 1]) k.add(M.steel, side([[0.5715, 0.07], [0.5895, 0.07], [0.5895, 0.0975, 0.0045], [0.5735, 0.0975, 0.0045]], 0.0028, { x: sx * 0.0086, bevel: 0.0006 }));
  k.add(M.worn, cylY(0.0014, 0.0095, 0, 0.0883, 0.5815, 10));
  k.add(M.steel, box(0.012, 0.0062, 0.018, 0, 0.0285, 0.578, 0.001));
  k.add(M.worn, cylZ(0.0029, 0.435, 0.585, 0, 0.0262, 10));
  k.add(M.worn, lathe([[0.585, 0], [0.585, 0.0042], [0.5935, 0.0042], [0.595, 0.003], [0.595, 0]], 14, 0.0262));
  k.add(M.steel, lathe([[0.592, 0], [0.592, 0.0118], [0.6265, 0.0118], [0.6295, 0.0098], [0.6295, 0.0052], [0.62, 0.0052], [0.62, 0]], 24, BORE));
  k.add(M.dark, cylZ(0.0051, 0.6198, 0.6202, 0, BORE, 14));
  k.add(M.dark, box(0.0236, 0.0055, 0.0035, 0, BORE + 0.0085, 0.627, 0)); // 斜切制退口
  // 下護木(木,掌部隆起)+ 護木箍
  k.add(M.akWood, side([[0.2122, 0.0525, 0.003], [0.4195, 0.0525, 0.003], [0.4195, 0.0052, 0.006], [0.396, -0.0012, 0.012], [0.36, -0.0072, 0.04], [0.262, -0.0072, 0.04], [0.226, -0.0012, 0.01], [0.2122, 0.0035, 0.004]], 0.0506, { bevel: 0.0085, seg: 4 }));
  k.add(M.steel, side([[0.4195, -0.0002], [0.4335, -0.0002], [0.4335, 0.0548, 0.002], [0.4195, 0.0548]], 0.0522, { bevel: 0.0016 }));
  k.add(M.steel, side([[0.421, 0.03], [0.4325, 0.03], [0.4325, 0.046], [0.421, 0.046]], 0.003, { x: 0.0272, bevel: 0.0006 }));
  k.add(M.steel, side([[0.2045, 0.002], [0.2165, 0.002], [0.2165, 0.054], [0.2045, 0.054]], 0.0518, { bevel: 0.0015 }));
  // 槍托(木)+ 鋼製托底板 + 背帶環、上下托尾鐵片
  const stock = [[-0.044, 0.0548, 0.004], [-0.2985, 0.0365, 0.006], [-0.3045, 0.0295, 0.003], [-0.3115, -0.0855, 0.004], [-0.2955, -0.0905, 0.006], [-0.17, -0.043, 0.07], [-0.08, -0.008, 0.03], [-0.044, 0.0045, 0.004]];
  k.add(M.akWood, side(stock, 0.0405, { bevel: 0.0085, seg: 4 }));
  k.add(M.steel, side([[-0.3035, 0.0372, 0.002], [-0.3105, 0.0374, 0.002], [-0.3185, -0.0872, 0.003], [-0.3115, -0.0915, 0.002]], 0.0425, { bevel: 0.0015 }));
  k.add(M.steel, box(0.024, 0.003, 0.034, 0, 0.0535, -0.057, 0.001));
  k.add(M.steel, new THREE.TorusGeometry(0.0085, 0.0018, 8, 16).rotateY(HALF).translate(-0.0215, -0.058, 0.262));
  // 握把(木)與底部螺絲
  const grip = [[0.0235, 0.0005, 0.002], [-0.0245, 0.0005, 0.002], [-0.0335, -0.03, 0.022], [-0.0505, -0.0965, 0.006], [-0.0405, -0.1045, 0.006], [-0.0098, -0.1035, 0.008], [0.0035, -0.06, 0.03], [0.0165, -0.02, 0.02]];
  k.add(M.akWood, side(grip, 0.0325, { bevel: 0.0068, seg: 4 }));
  k.add(M.worn, rot(cylY(0.0045, 0.003, 0, -0.1035, -0.025, 16), 0, 0, 0));
  // 護弓(沖壓鋼條)、彈匣卡榫、扳機、快慢機、鉚釘、彈匣導槽凹痕
  k.add(M.steel, side([[0.0155, 0.0006], [0.0845, 0.0006], [0.0845, -0.0105, 0.002], [0.0785, -0.0335, 0.008], [0.0262, -0.0342, 0.01], [0.0155, -0.0185, 0.006]], 0.0102, {
    bevel: 0.0012, holes: [[[0.0262, -0.004, 0.002], [0.0742, -0.004, 0.002], [0.0705, -0.0272, 0.006], [0.0302, -0.0275, 0.006], [0.0262, -0.0165, 0.004]]],
  }));
  k.add(M.steel, side([[0.0795, -0.002], [0.0855, -0.002], [0.0855, -0.0215, 0.002], [0.0795, -0.0195, 0.002]], 0.0162, { bevel: 0.0008 }));
  k.add(M.worn, side([[0.0405, 0.0], [0.0462, 0.0], [0.0452, -0.0122, 0.005], [0.0402, -0.0222, 0.0015], [0.0372, -0.0215, 0.0015], [0.0405, -0.0102, 0.004]], 0.0072, { bevel: 0.0012 }));
  k.add(M.steel, side([[-0.0375, 0.0362, 0.008], [-0.019, 0.0526, 0.002], [0.1185, 0.0545, 0.002], [0.1225, 0.0395, 0.003], [0.1115, 0.0372, 0.003], [0.1045, 0.0458, 0.002], [-0.019, 0.0448], [-0.0305, 0.034]], 0.0026, { x: 0.0199, bevel: 0.0006 }));
  k.add(M.steel, cylX(0.0085, 0.0026, 0.0201, 0.0408, -0.0292, 22));
  for (const [f, y] of [[-0.0405, 0.012], [-0.0405, 0.042], [-0.02, 0.0132], [0.0305, 0.0128], [0.176, 0.0105], [0.188, 0.0105], [0.2, 0.0105], [0.176, 0.036], [0.2, 0.036], [0.135, 0.004]]) {
    k.add(M.worn, cylX(0.0021, 0.0386, 0, y, f, 12));
  }
  for (const sx of [-1, 1]) k.add(M.steel, box(0.0016, 0.012, 0.038, sx * 0.0186, 0.021, 0.116, 0.003));
  k.add(M.dark, box(0.0012, 0.0118, 0.088, 0.0181, 0.0462, 0.104, 0)); // 退殼口
  k.add(M.steel, box(0.0036, 0.016, 0.1, -0.0196, 0.033, 0.08, 0.001)); // 左側瞄具軌
  kobraGeos(k, AK_DOT.fc, AK_DOT.y);
  k.build(g);

  // 槍機(含拉機柄,開火時後座)
  const bolt = new THREE.Group();
  g.add(bolt);
  kb.add(M.worn, box(0.0018, 0.0098, 0.084, 0.0177, 0.0462, 0.104, 0.0006));
  kb.add(M.worn, cylX(0.0038, 0.017, 0.0272, 0.0468, 0.1555, 12));
  kb.add(M.worn, lathe([[0, 0], [0, 0.0058], [0.008, 0.0066], [0.0142, 0.0052], [0.0158, 0]], 16).rotateY(-HALF).translate(0.0335, 0.0468, -0.1555));
  kb.build(bolt);

  // 彎彈匣(30 發,肋條鋼板)
  const mag = groupAt(g, 0, 0.002, 0.146);
  const R2 = 0.33, R1 = R2 + 0.061, fc = R2, yc = 0;
  const a0 = Math.PI, a1 = Math.PI + 0.54;
  km.add(M.magSteel, side(arcBand(fc, yc, R2, R1, a0 - 0.035, a1, 20), 0.0242, { bevel: 0.0018, cs: 2 }));
  for (const r of [R2 + 0.013, R2 + 0.0295, R2 + 0.046]) km.add(M.magSteel, side(arcBand(fc, yc, r, r + 0.0042, a0 + 0.06, a1 - 0.03, 16), 0.0266, { bevel: 0.0012, cs: 2 }));
  const bot = (r, a) => [fc + Math.cos(a) * r, yc + Math.sin(a) * r];
  const [p0, p1] = [bot(R2 - 0.002, a1), bot(R1 + 0.003, a1)];
  const n = [Math.cos(a1 + HALF) * -0.0065, Math.sin(a1 + HALF) * -0.0065];
  km.add(M.magSteel, side([[p1[0] + 0.0015, p1[1]], [p0[0], p0[1]], [p0[0] + n[0], p0[1] + n[1], 0.002], [p1[0] + n[0] + 0.0015, p1[1] + n[1], 0.002]], 0.0272, { bevel: 0.0015 }));
  km.add(M.magSteel, box(0.016, 0.006, 0.004, 0, 0.0012, -0.0012, 0.001));
  km.build(mag);

  return {
    muzzle: new THREE.Vector3(0, BORE, -0.632), length: 0.95, bolt, mag,
    // 開鏡看紅點鏡窗口(光軸 = 窗口中心線);機械瞄具在窗口下緣共線
    sight: { rear: [AK_DOT.fc - 0.037, AK_DOT.y], front: [AK_DOT.fc + 0.037, AK_DOT.y], eye: 0.17, optic: 'reddot' },
    grip: { a: (18 * Math.PI) / 180, c: [-0.0005, 0.0005], depth: 0.047, halfW: 0.0163 },
    fore: { f: 0.33, y: -0.0072, halfW: 0.0253 },
    anim(shot, reload, empty, st) {
      const c = shot < 0.07 ? Math.sin((shot / 0.07) * Math.PI) : 0;
      bolt.position.z = c * 0.075;
      const t = reload < 0 ? 0 : reload;
      const tilt = smooth(0.08, 0.2, t) * (1 - smooth(0.62, 0.78, t));
      const drop = smooth(0.18, 0.36, t) * (1 - smooth(0.5, 0.66, t));
      mag.rotation.x = tilt * 0.45;
      mag.position.y = 0.002 - drop * 0.3;
      leftToMag(st, t, -0.036, -0.105 - drop * 0.3, -0.15 + tilt * 0.02);
    },
  };
}

// ---------- M4A1(RIS 四面導軌) ----------
function buildM4(g) {
  const k = new Kit(), kb = new Kit(), km = new Kit();
  const BORE = 0.0405;
  // 下機匣(含彈匣井、緩衝管座)
  k.add(M.anodized, side([[-0.0685, 0.0225], [0.1125, 0.0225], [0.1125, 0.0095, 0.003], [0.1072, -0.032, 0.002], [0.098, -0.0342, 0.002], [0.0418, -0.0342, 0.002], [0.0392, -0.0052, 0.002], [-0.031, -0.0052, 0.002], [-0.0515, 0.0005, 0.006], [-0.0685, 0.0085, 0.006]], 0.0252, { bevel: 0.0016 }));
  k.add(M.anodized, side([[0.0405, -0.0335], [0.1075, -0.0335], [0.1072, -0.0362, 0.001], [0.0405, -0.0362, 0.001]], 0.0292, { bevel: 0.0012 })); // 彈匣井口外擴
  // 上機匣(平頂)+ 前進助推器 + 拋殼擋
  k.add(M.anodized, side([[-0.0685, 0.0222], [0.1135, 0.0222], [0.1135, 0.0598, 0.0015], [-0.0685, 0.0598, 0.0015]], 0.0282, { bevel: 0.0016 }));
  k.add(M.anodized, side([[-0.06, 0.035], [-0.026, 0.035], [-0.016, 0.044, 0.006], [-0.026, 0.0565, 0.004], [-0.06, 0.0565, 0.004]], 0.012, { x: 0.0165, bevel: 0.003 }));
  k.add(M.anodized, lathe([[-0.064, 0], [-0.064, 0.0074], [-0.058, 0.0074], [-0.058, 0]], 20, 0.0468, 0.0215));
  k.add(M.worn, lathe([[-0.0705, 0], [-0.0705, 0.0066], [-0.0642, 0.0068], [-0.0642, 0]], 20, 0.0468, 0.0215));
  for (let i = 0; i < 4; i++) k.add(M.dark, rot(box(0.0006, 0.0136, 0.0058, 0.0215, 0.0468, -0.0672, 0), 0, 0, (i * Math.PI) / 4, 0.0215, 0.0468, -0.0672));
  k.add(M.anodized, side([[-0.026, 0.038], [-0.008, 0.038], [-0.011, 0.054, 0.003], [-0.026, 0.056, 0.003]], 0.008, { x: 0.0158, bevel: 0.002 }));
  // 拋殼口(防塵蓋打開下垂)
  k.add(M.dark, box(0.0012, 0.0142, 0.066, 0.0136, 0.0418, 0.027, 0));
  k.add(M.anodized, rot(box(0.0012, 0.013, 0.064, 0.0152, 0.0285, 0.027, 0.0004), 0, 0, 0.55, 0.0142, 0.0348, 0.027));
  // 拉機柄
  k.add(M.anodized, side([[-0.077, 0.0512], [-0.0655, 0.0512], [-0.0655, 0.0592, 0.001], [-0.077, 0.0592, 0.001]], 0.042, { bevel: 0.0014 }));
  k.add(M.anodized, side([[-0.068, 0.0512], [-0.012, 0.0512], [-0.012, 0.0585], [-0.068, 0.0585]], 0.0106, { bevel: 0.001 }));
  // 頂部導軌 + 折疊照門(已倒下)+ 3× ACOG 光學瞄準鏡
  picatinny(k, M.anodized, -0.064, 0.1125, new THREE.Matrix4().makeTranslation(0, 0.0598, 0));
  k.add(M.anodized, side([[-0.062, 0.069], [-0.05, 0.069], [-0.051, 0.0765, 0.002], [-0.06, 0.0775, 0.002], [-0.062, 0.074]], 0.0262, { bevel: 0.0015 }));
  k.add(M.anodized, box(0.0205, 0.0032, 0.03, 0, 0.0786, -0.037, 0.0008)); // 倒下的照門板
  acogGeos(k, M4_ACOG_Y);
  // 握把(A2,點刻紋)
  k.add(M.polymer, side([[0.0205, -0.0018], [-0.0225, -0.0018], [-0.0305, -0.03, 0.01], [-0.0525, -0.0985, 0.008], [-0.0405, -0.1065, 0.006], [-0.0115, -0.1045, 0.008], [-0.0018, -0.0705, 0.012], [0.0045, -0.0548, 0.004], [0.0022, -0.0462, 0.006], [0.0122, -0.0222, 0.012], [0.0205, -0.0102]], 0.0302, { bevel: 0.006, seg: 3 }));
  // 護弓、扳機、快慢機、槍機卡榫、彈匣釋放鈕、分解銷
  k.add(M.anodized, side([[0.0115, -0.0035], [0.0465, -0.0035], [0.0465, -0.0302, 0.003], [0.0105, -0.0345, 0.004]], 0.0102, { bevel: 0.0012, holes: [[[0.0162, -0.0078, 0.002], [0.0415, -0.0078, 0.002], [0.0415, -0.0258, 0.002], [0.0162, -0.0288, 0.002]]] }));
  k.add(M.worn, side([[0.0262, -0.0038], [0.0318, -0.0038], [0.0308, -0.0142, 0.005], [0.0262, -0.0232, 0.0015], [0.0234, -0.0225, 0.0015], [0.0265, -0.0128, 0.004]], 0.0062, { bevel: 0.0012 }));
  k.add(M.steel, cylX(0.0068, 0.0022, -0.0138, 0.0118, -0.0092, 22));
  k.add(M.steel, side([[-0.0115, 0.0098], [0.0058, 0.0108], [0.0068, 0.0138, 0.0012], [-0.0115, 0.0142]], 0.0024, { x: -0.0152, bevel: 0.0005 }));
  k.add(M.steel, side([[0.0645, 0.0062], [0.0815, 0.0062, 0.002], [0.0815, 0.0225, 0.002], [0.0705, 0.0225]], 0.0028, { x: -0.0138, bevel: 0.0006 }));
  k.add(M.worn, cylX(0.0045, 0.0034, 0.0135, 0.0025, 0.0305, 18));
  k.add(M.anodized, lathe([[0, 0.0045], [0, 0.0078], [0.0028, 0.0078], [0.0028, 0.0045]], 22).rotateY(-HALF).translate(0.0124, 0.0025, -0.0305));
  for (const [f, y] of [[-0.0405, 0.0142], [0.1065, 0.0178], [0.0102, 0.0072], [0.0305, 0.0072]]) k.add(M.worn, cylX(0.0026, 0.0278, 0, y, f, 14));
  // RIS 護木(四面導軌,左/下裝防滑蓋)
  const ris = [[-0.0198, 0.0207, 0.004], [0.0198, 0.0207, 0.004], [0.0198, 0.0603, 0.004], [-0.0198, 0.0603, 0.004]];
  k.add(M.anodized, sect(ris, 0.1155, 0.2925, { bevel: 0.0015 }));
  const R = (rz, y, x) => new THREE.Matrix4().makeTranslation(x, y, 0).multiply(new THREE.Matrix4().makeRotationZ(rz));
  picatinny(k, M.anodized, 0.1195, 0.2885, R(0, 0.0603, 0));
  picatinny(k, M.anodized, 0.1195, 0.2885, R(-HALF, BORE, 0.0198));
  for (const [rz, x, y] of [[HALF, -0.0198 - 0.0048, BORE], [Math.PI, 0, 0.0207 - 0.0048]]) { // 防滑蓋(帶橫肋)
    const m = R(rz, y, x);
    const cover = sect([[-0.0122, -0.0045, 0.002], [0.0122, -0.0045, 0.002], [0.0122, 0.003, 0.002], [-0.0122, 0.003, 0.002]], 0.124, 0.285, { bevel: 0.0014 });
    k.add(M.polySmooth, cover.applyMatrix4(m));
    for (let f = 0.13; f < 0.282; f += 0.008) k.add(M.polySmooth, box(0.022, 0.002, 0.0034, 0, 0.0038, f, 0.0008).applyMatrix4(m));
  }
  k.add(M.anodized, lathe([[0.108, 0], [0.108, 0.0305], [0.1132, 0.0322], [0.1182, 0.0322], [0.1182, 0]], 28, BORE)); // 三角環
  k.add(M.anodized, lathe([[0.2905, 0], [0.2905, 0.0262], [0.2985, 0.0215], [0.2985, 0]], 28, BORE)); // 護木前蓋
  // 槍管(M203 段差)、導氣管、A2 準星座、消焰器
  k.add(M.steel, lathe([[0.29, 0], [0.29, 0.0092], [0.352, 0.0092], [0.354, 0.0078], [0.386, 0.0078], [0.388, 0.0092], [0.4935, 0.0088], [0.4935, 0]], 24, BORE));
  k.add(M.steel, cylZ(0.0026, 0.292, 0.305, 0, BORE + 0.012, 10));
  k.add(M.steel, lathe([[0.2995, 0], [0.2995, 0.0142], [0.3335, 0.0142], [0.3335, 0]], 24, BORE));
  k.add(M.steel, side([[0.3005, 0.0515], [0.3325, 0.0515], [0.3325, 0.0722], [0.3195, 0.0722], [0.3045, 0.058]], 0.0162, { bevel: 0.0014 }));
  for (const sx of [-1, 1]) k.add(M.steel, side([[0.3045, 0.0565], [0.3325, 0.0565], [0.3325, 0.0985, 0.003], [0.3215, 0.0985, 0.003]], 0.0032, { x: sx * 0.0081, bevel: 0.0007 }));
  k.add(M.worn, box(0.0026, 0.0168, 0.0026, 0, 0.0805, 0.3265, 0.0004));
  k.add(M.steel, box(0.0118, 0.0068, 0.02, 0, 0.0262, 0.318, 0.001));
  k.add(M.steel, new THREE.TorusGeometry(0.0078, 0.0018, 8, 16).rotateY(HALF).translate(0, 0.0178, -0.322));
  k.add(M.steel, lathe([[0.4915, 0], [0.4915, 0.0108], [0.4955, 0.0108], [0.4955, 0]], 20, BORE));
  k.add(M.steel, lathe([[0.4955, 0], [0.4955, 0.0112], [0.5345, 0.0112], [0.5365, 0.0098], [0.5365, 0.0062], [0.527, 0.0062], [0.527, 0]], 28, BORE));
  k.add(M.dark, cylZ(0.0061, 0.5268, 0.5272, 0, BORE, 14));
  for (let i = 0; i < 5; i++) {
    const a = HALF + (i - 2) * (Math.PI / 3);
    const x = Math.cos(a) * 0.0109, y = BORE + Math.sin(a) * 0.0109;
    k.add(M.dark, rot(box(0.003, 0.0014, 0.024, x, y, 0.519, 0), 0, 0, a - HALF, x, y, 0.519));
  }
  // 緩衝管、城堡螺帽、背帶板、伸縮托
  k.add(M.anodized, lathe([[-0.258, 0], [-0.258, 0.0142], [-0.0685, 0.0142], [-0.0685, 0]], 24, BORE));
  k.add(M.steel, lathe([[-0.0775, 0], [-0.0775, 0.0182], [-0.0705, 0.0182], [-0.0705, 0]], 24, BORE));
  for (let i = 0; i < 6; i++) k.add(M.dark, rot(box(0.0035, 0.004, 0.0072, 0, BORE + 0.0168, -0.074, 0), 0, 0, (i * Math.PI) / 3, 0, BORE, -0.074));
  k.add(M.steel, lathe([[-0.0705, 0], [-0.0705, 0.0222], [-0.0688, 0.0222], [-0.0688, 0]], 24, BORE));
  k.add(M.polySmooth, sect([[-0.0205, BORE - 0.0178, 0.006], [0.0205, BORE - 0.0178, 0.006], [0.0205, BORE + 0.0185, 0.008], [-0.0205, BORE + 0.0185, 0.008]], -0.2985, -0.163, { bevel: 0.004, seg: 3 }));
  k.add(M.polySmooth, side([[-0.178, 0.03], [-0.2985, 0.03], [-0.3005, -0.066, 0.004], [-0.2835, -0.0688, 0.006], [-0.196, 0.022, 0.012]], 0.0262, { bevel: 0.0035, seg: 3 }));
  k.add(M.polySmooth, side([[-0.205, 0.016], [-0.29, 0.016], [-0.291, -0.055, 0.003], [-0.282, -0.057, 0.004]], 0.0292, { bevel: 0.0025 }));
  k.add(M.rubber, side([[-0.2965, 0.0612, 0.004], [-0.3095, 0.0612, 0.004], [-0.3135, -0.0715, 0.004], [-0.3005, -0.0722, 0.004]], 0.0442, { bevel: 0.003 }));
  for (let i = 0; i < 9; i++) k.add(M.rubber, box(0.045, 0.0018, 0.004, 0, 0.05 - i * 0.0135, -0.31 + i * 0.0004, 0.0008));
  k.add(M.polySmooth, side([[-0.172, 0.016], [-0.21, 0.016], [-0.212, 0.008, 0.002], [-0.176, 0.008, 0.002]], 0.012, { bevel: 0.002 }));
  k.build(g);

  // 槍機框(從拋殼口可見)
  const bolt = new THREE.Group();
  g.add(bolt);
  kb.add(M.worn, box(0.0016, 0.0118, 0.062, 0.0128, 0.0418, 0.027, 0.0005));
  kb.add(M.dark, box(0.0012, 0.0024, 0.03, 0.0132, 0.0388, 0.038, 0));
  kb.build(bolt);

  // STANAG 鋁彈匣(微彎)
  const mag = groupAt(g, 0, 0, 0);
  const R2 = 0.95, fc = 0.105 + R2, yc = -0.004;
  const a1 = Math.PI + 0.19;
  km.add(M.usgi, side(arcBand(fc, yc, R2, R2 + 0.0632, Math.PI - 0.03, a1, 10), 0.0222, { bevel: 0.0015, cs: 2 }));
  for (const r of [R2 + 0.012, R2 + 0.046]) km.add(M.usgi, side(arcBand(fc, yc, r, r + 0.006, Math.PI + 0.045, a1 - 0.012, 8), 0.0242, { bevel: 0.0012, cs: 2 }));
  const bp = (r) => [fc + Math.cos(a1) * r, yc + Math.sin(a1) * r];
  const [q0, q1] = [bp(R2 - 0.002), bp(R2 + 0.0652)];
  km.add(M.polySmooth, side([[q1[0], q1[1]], [q0[0], q0[1]], [q0[0] - 0.001, q0[1] - 0.007, 0.002], [q1[0] - 0.001, q1[1] - 0.007, 0.002]], 0.0262, { bevel: 0.0016 }));
  km.build(mag);

  return {
    muzzle: new THREE.Vector3(0, BORE, -0.538), length: 0.84, bolt, mag,
    sight: { rear: [-0.049, M4_ACOG_Y], front: [0.1112, M4_ACOG_Y], eye: 0.075, optic: 'acog' }, // ACOG 光軸(目鏡 → 物鏡)
    grip: { a: (24 * Math.PI) / 180, c: [-0.0012, -0.0018], depth: 0.044, halfW: 0.0151 },
    fore: { f: 0.215, y: 0.0107, halfW: 0.0285 },
    anim(shot, reload, empty, st) {
      const c = shot < 0.055 ? Math.sin((shot / 0.055) * Math.PI) : 0;
      const lock = empty && (reload < 0 || reload < 0.88);
      bolt.position.z = lock ? 0.05 : c * 0.05;
      const drop = reload < 0 ? 0 : smooth(0.1, 0.3, reload) * (1 - smooth(0.52, 0.76, reload));
      mag.position.y = -drop * 0.3;
      leftToMag(st, reload < 0 ? 0 : reload, -0.032, -0.105 - drop * 0.3, -0.075);
    },
  };
}

// ---------- Remington 870(12 號泵動霰彈槍) ----------
// 皇家藍黑鋼機匣、核桃木槍托與帶溝槽的泵動護木、7 發管狀彈倉、黃銅準星珠。原點在槍托握腕頂端
export const SHELL = { len: 0.068, r: 0.0102, head: 0.012 }; // 12 號霰彈(公尺)
// 霰彈:彈頭朝 -Z、以中心為原點;回傳 [紅色塑膠殼, 黃銅底]
export function shellGeos(len = SHELL.len, r = SHELL.r, head = SHELL.head) {
  const base = lathe([[0, 0], [0, r * 1.09], [0.0012, r * 1.09], [0.0012, r * 0.99], [head, r * 0.99], [head, 0]], 18);
  const hull = lathe([[head - 0.001, 0], [head - 0.001, r * 0.97], [len - 0.004, r * 0.97], [len - 0.0015, r * 0.86], [len, r * 0.35], [len, 0]], 18);
  return [hull.translate(0, 0, len / 2), base.translate(0, 0, len / 2)];
}
// 黃銅彈殼(拋殼粒子用,彈口朝 -Z、以中心為原點,長 1):kind 'rifle' 瓶頸彈殼 / 'pistol' 直筒
export function casingGeo(kind) {
  const r = kind === 'rifle' ? 0.12 : 0.26;
  const prof = kind === 'rifle'
    ? [[0, 0], [0, r * 1.02], [0.03, r * 1.02], [0.035, r * 0.85], [0.06, r * 0.86], [0.065, r], [0.7, r * 0.93], [0.78, r * 0.62], [1, r * 0.6], [1, r * 0.5], [0.9, r * 0.5], [0.9, 0]]
    : [[0, 0], [0, r * 1.04], [0.06, r * 1.04], [0.07, r * 0.88], [0.11, r * 0.9], [0.12, r], [1, r * 0.97], [1, r * 0.86], [0.85, r * 0.86], [0.85, 0]];
  return lathe(prof, 12).translate(0, 0, 0.5);
}
function buildShotgun(g) {
  const k = new Kit(), kf = new Kit(), kb = new Kit(), ks = new Kit();
  const S = M.sgSteel;
  const BORE = 0.037, RB = 0.0108, TUBE = 0.0135, TR = 0.0124, RW = 0.0142, RT = 0.057, RBOT = -0.003, RF = 0.205;
  // 機匣:圓角頂部截面 + 側面淺壓痕 + 機匣前端環
  k.add(S, sect([[-RW, RBOT, 0.0015], [RW, RBOT, 0.0015], [RW, RT - 0.012, 0.002], [RW - 0.0036, RT, 0.007], [-RW + 0.0036, RT, 0.007], [-RW, RT - 0.012, 0.002]], -0.004, RF, { bevel: 0.0012 }));
  for (const sx of [-1, 1]) k.add(S, side([[0.012, 0.004], [0.19, 0.004], [0.19, 0.019, 0.002], [0.012, 0.019, 0.002]], 0.0012, { x: sx * (RW - 0.0001), bevel: 0.0004 }));
  k.add(M.dark, box(0.0006, 0.0006, 0.17, RW + 0.0004, 0.0195, 0.101, 0)); // 壓痕陰影線
  k.add(M.dark, box(0.0006, 0.0006, 0.17, -RW - 0.0004, 0.0195, 0.101, 0));
  k.add(M.dark, box(0.004, 0.0007, 0.19, 0, RT + 0.0001, 0.1, 0)); // 頂部消光瞄準溝
  // 拋殼口(右)、裝填口(底部)與托彈板
  k.add(M.dark, box(0.001, 0.027, 0.088, RW - 0.0002, 0.036, 0.117, 0));
  k.add(M.dark, box(0.023, 0.0012, 0.088, 0, RBOT + 0.0003, 0.152, 0));
  k.add(M.worn, box(0.017, 0.0006, 0.074, 0, RBOT - 0.0004, 0.148, 0.0002));
  // 扳機座(黑色鋁合金)、護弓、扳機、橫閂保險(左側紅環)、泵動釋放桿、固定銷
  k.add(M.alloy, side([[-0.002, RBOT + 0.001], [0.1, RBOT + 0.001], [0.096, RBOT - 0.009, 0.003], [0.006, RBOT - 0.01, 0.005]], 0.0236, { bevel: 0.0014 }));
  k.add(M.alloy, side([[0.012, RBOT - 0.006], [0.09, RBOT - 0.006], [0.086, -0.03, 0.01], [0.066, -0.0385, 0.01], [0.024, -0.0365, 0.012], [0.012, -0.022, 0.006]], 0.0118, {
    bevel: 0.0015, holes: [[[0.02, -0.014, 0.003], [0.08, -0.014, 0.003], [0.076, -0.028, 0.008], [0.063, -0.0318, 0.006], [0.027, -0.0305, 0.008], [0.02, -0.022, 0.004]]],
  }));
  k.add(M.worn, side([[0.0445, RBOT - 0.008], [0.0505, RBOT - 0.008], [0.049, -0.0215, 0.005], [0.0445, -0.0285, 0.0015], [0.0415, -0.028, 0.0015], [0.045, -0.02, 0.004]], 0.0064, { bevel: 0.0012 }));
  k.add(M.worn, cylX(0.0042, 0.031, 0, -0.0098, 0.0905, 16));
  k.add(M.red, cylX(0.0043, 0.0022, -0.0145, -0.0098, 0.0905, 16));
  k.add(M.worn, side([[0.093, -0.0055], [0.104, -0.0055, 0.001], [0.101, -0.0105, 0.002], [0.093, -0.0105]], 0.0016, { x: -0.0126, bevel: 0.0004 }));
  for (const f of [0.022, 0.081]) {
    k.add(M.worn, cylX(0.0021, 2 * RW + 0.0008, 0, 0.0055, f, 12));
    for (const sx of [-1, 1]) k.add(M.dark, cylX(0.0009, 0.0006, sx * (RW + 0.0004), 0.0055, f, 8));
  }
  // 槍管(機匣環、細微收窄、冠狀槍口)與黃銅準星珠
  k.add(S, lathe([[RF - 0.004, 0], [RF - 0.004, 0.0134], [RF + 0.012, 0.0134], [RF + 0.016, RB + 0.0004], [0.656, RB - 0.0004], [0.659, RB - 0.0012], [0.659, 0.0092], [0.645, 0.0092], [0.645, 0]], 32, BORE));
  k.add(M.dark, cylZ(0.0092, 0.6448, 0.6452, 0, BORE, 18));
  k.add(S, box(0.005, 0.0035, 0.007, 0, BORE + RB + 0.0008, 0.648, 0.001));
  k.add(M.fiber, new THREE.SphereGeometry(0.0021, 14, 10).translate(0, BORE + RB + 0.0034, -0.6485)); // 光纖準星珠(暗處發亮)
  // 彈倉管、槍管夾環(連接槍管與彈倉)、彈倉蓋(滾花)與背帶環
  k.add(S, cylZ(TR, RF - 0.004, 0.604, 0, TUBE, 28));
  k.add(S, lathe([[0.572, 0], [0.572, TR + 0.0028], [0.594, TR + 0.0028], [0.594, 0]], 28, TUBE));
  k.add(S, side([[0.574, TUBE + TR], [0.592, TUBE + TR], [0.592, BORE - RB + 0.002], [0.574, BORE - RB + 0.002]], 0.0105, { bevel: 0.0012 }));
  const cap = [[0.6, 0], [0.6, TR + 0.0016]];
  for (let f = 0.602; f < 0.628; f += 0.0026) cap.push([f, TR + 0.0016], [f + 0.0006, TR + 0.0024], [f + 0.0014, TR + 0.0024], [f + 0.002, TR + 0.0016]);
  cap.push([0.63, TR + 0.0012], [0.634, 0.0085], [0.634, 0]);
  k.add(S, lathe(cap, 36, TUBE));
  k.add(M.worn, new THREE.TorusGeometry(0.0075, 0.0017, 8, 18).rotateY(HALF).translate(0, TUBE - TR - 0.0068, -0.62));
  // 槍托(依真槍托腮落差 1.5"、托踵落差 2.5"):握腕 + 半手槍式握把 + 托身(較寬,大圓角)、白色間隔片、通風橡膠托底板、背帶釘
  k.add(M.sgWood, side([[-0.002, RT - 0.005, 0.002], [-0.02, 0.046, 0.012], [-0.058, 0.032, 0.04], [-0.15, 0.0225, 0.02], [-0.15, -0.084, 0.01], [-0.118, -0.0715, 0.012], [-0.097, -0.0655, 0.012], [-0.073, -0.0455, 0.016], [-0.05, -0.0225, 0.016], [-0.026, -0.0105, 0.008], [-0.002, RBOT - 0.002, 0.002]], 0.0322, { bevel: 0.0074, seg: 4 }));
  k.add(M.sgWood, side([[-0.13, 0.0242, 0.004], [-0.364, -0.0055, 0.004], [-0.3705, -0.1365, 0.004], [-0.356, -0.1425, 0.012], [-0.2, -0.0985, 0.06], [-0.13, -0.0778, 0.004]], 0.0405, { bevel: 0.0105, seg: 4 }));
  k.add(M.ivory, side([[-0.3655, -0.003, 0.003], [-0.3695, -0.0032, 0.003], [-0.3755, -0.1395, 0.003], [-0.3715, -0.1393, 0.003]], 0.0398, { bevel: 0.0012 }));
  k.add(M.rubber, side([[-0.3695, -0.0024, 0.004], [-0.3945, -0.0034, 0.008], [-0.4015, -0.1405, 0.008], [-0.3755, -0.1408, 0.004]], 0.0418, { bevel: 0.004, seg: 3 }));
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) k.add(M.dark, box(0.0012, 0.019, 0.016, sx * 0.0212, -0.02 - i * 0.031, -0.3835 - i * 0.0015, 0.003)); // 托底板通風孔
  k.add(M.worn, cylY(0.0034, 0.008, 0, -0.1335, -0.31, 12));
  k.add(M.worn, new THREE.TorusGeometry(0.0078, 0.0017, 8, 18).rotateY(HALF).translate(0, -0.1415, 0.31));
  k.build(g);

  // 槍機(拋殼口內;泵動時往後縮進機匣,露出黑色彈膛)
  const bolt = groupAt(g, 0, 0, 0.073);
  kb.add(M.worn, box(0.0006, 0.022, 0.084, RW + 0.0004, 0.036, 0.044, 0.0002));
  kb.add(M.steel, box(0.0008, 0.0045, 0.012, RW + 0.0007, 0.0425, 0.078, 0.0003)); // 抽殼鉤
  kb.add(M.dark, box(0.0004, 0.0014, 0.07, RW + 0.0008, 0.0305, 0.046, 0));
  kb.build(bolt);

  // 泵動護木(木質、9 道環溝)+ 兩根動作桿;泵動時整組後移
  const pump = groupAt(g, 0, 0, 0);
  const fsec = (s, l = 1) => [ // s:外輪廓縮放(以彈倉管為中心)、l:頂部唇緣高度
    [-0.0205 * s, TUBE + (0.0345 - TUBE) * l, 0.004], [-0.0238 * s, TUBE + 0.0065 * s, 0.011], [-0.0182 * s, TUBE - 0.0222 * s, 0.012], [0.0182 * s, TUBE - 0.0222 * s, 0.012],
    [0.0238 * s, TUBE + 0.0065 * s, 0.011], [0.0205 * s, TUBE + (0.0345 - TUBE) * l, 0.004], [0.0126, BORE - 0.0028, 0.002], [0.0112, BORE - 0.0085, 0.004], [0, BORE - RB - 0.0006], [-0.0112, BORE - 0.0085, 0.004], [-0.0126, BORE - 0.0028, 0.002],
  ];
  kf.add(M.sgWood, sect(fsec(0.95, 0.96), 0.262, 0.452, { bevel: 0.002, seg: 2, cs: 3 }));
  kf.add(M.sgWood, sect(fsec(0.985), 0.256, 0.276, { bevel: 0.0045, seg: 3, cs: 3 }));
  kf.add(M.sgWood, sect(fsec(0.985), 0.438, 0.458, { bevel: 0.0045, seg: 3, cs: 3 }));
  for (let f = 0.283; f < 0.43; f += 0.0162) kf.add(M.sgWood, sect(fsec(1.0), f, f + 0.0102, { bevel: 0.0022, seg: 2, cs: 3 }));
  kf.add(M.dark, sect(fsec(0.9, 0.9), 0.2565, 0.2575, { bevel: 0 }));
  for (const sx of [-1, 1]) kf.add(S, box(0.0024, 0.0042, 0.088, sx * 0.0104, TUBE - 0.0045, 0.214, 0.0005));
  kf.build(pump);

  // 托彈(換彈時左手拿的那顆)
  const [hull, base] = shellGeos();
  ks.add(M.hull, hull);
  ks.add(M.brass, base);
  const inHand = new THREE.Group();
  ks.build(inHand);
  const LP = [0.15, RBOT]; // 裝填口(f, y)

  return {
    muzzle: new THREE.Vector3(0, BORE, -0.662), length: 1.03, bolt, pump,
    eject: [0.118, 0.04, RW + 0.004],
    sight: { rear: [0.004, RT + 0.0028], front: [0.6485, BORE + RB + 0.0055], eye: 0.36 },
    grip: { a: 0.55, c: [-0.047, 0.018], depth: 0.054, halfW: 0.0158, elbow: V(0.18, -0.34, 0.24), s: 0.034, index: [0.35, 0.75, 0.45] },
    fore: { f: 0.36, y: TUBE - 0.0222, halfW: 0.0238 },
    handProp(left) { // 左手指間夾一顆霰彈(只在逐發裝填時顯示)
      const s = inHand.clone();
      s.rotation.set(-1.25, 0.0, 0.0);
      s.position.set(0.026, 0.018, -0.006);
      s.visible = false;
      left.add(s);
      left.userData.shell = s;
    },
    // st.pump:0..1 泵動行程(0=前、1=後);st.phase:'open'|'shell'|'close' 與 st.u(該階段 0..1)
    anim(shot, reload, empty, st) {
      const p = st ? st.pump : 0;
      pump.position.z = p * 0.086;
      bolt.scale.z = 1 - p * 0.9;
      const L = st && st.left;
      if (!L) return;
      const home = st.palm, ph = st.phase, u = st.u;
      // 左手:平常跟著護木;裝填時離開護木,從下方把子彈推進裝填口
      const away = ph === 'open' ? smooth(0, 1, u) : ph === 'close' ? 1 - smooth(0, 0.55, u) : ph === 'shell' ? 1 : 0;
      let ay = LP[1] - home.y - 0.03, az = -LP[0] - home.z + 0.012, show = false;
      if (ph === 'shell') {
        const up = smooth(0, 0.34, u) * (1 - smooth(0.66, 0.97, u)); // 帶子彈上來
        const push = smooth(0.36, 0.58, u) * (1 - smooth(0.64, 0.9, u)); // 推入彈倉
        ay += -0.065 * (1 - up) + push * 0.012;
        az += -push * 0.04;
        show = u < 0.6;
      }
      L.position.set(home.x + 0.012 * away, home.y + ay * away, home.z + p * 0.086 * (1 - away) + az * away);
      L.rotation.set(0.35 * away, 0.2 * away, -0.25 * away);
      if (L.userData.shell) L.userData.shell.visible = show;
    },
  };
}

// ---------- Barrett M82A1(.50 BMG) ----------
// 沖壓鋼板上機匣(前段大型散熱孔、槍管短後座)、AR 式握把、10 發直彈匣、頂部導軌架大型狙擊鏡
function buildBarrett(g) {
  const k = new Kit(), kr = new Kit(), kb = new Kit(), kc = new Kit(), km = new Kit();
  const BORE = 0.062, UT = 0.104, UB = 0.028, UW = 0.029, LW = 0.026, SY = 0.153;
  const P = M.park;

  // 上機匣後段(頂部兩側倒角)、側面壓筋、橫銷
  k.add(P, sect([[-UW, UB, 0.002], [UW, UB, 0.002], [UW, UT - 0.007, 0.002], [UW - 0.006, UT, 0.002], [-UW + 0.006, UT, 0.002], [-UW, UT - 0.007, 0.002]], -0.3, 0.3, { bevel: 0.0016 }));
  for (const sx of [-1, 1]) {
    k.add(P, box(0.0016, 0.005, 0.56, sx * UW, 0.0928, 0.0, 0.0006));
    k.add(P, box(0.0016, 0.004, 0.22, sx * UW, 0.038, -0.17, 0.0006));
  }
  for (const [f, y] of [[-0.272, 0.064], [-0.214, 0.052], [0.262, 0.05], [0.21, 0.078], [-0.12, 0.078]]) k.add(M.worn, cylX(0.0028, 2 * UW + 0.0016, 0, y, f, 14));
  // 頂部導軌
  picatinny(k, P, -0.215, 0.29, new THREE.Matrix4().makeTranslation(0, UT, 0));

  // 拋殼口(右側)與可見的槍機
  k.add(M.dark, box(0.0012, 0.03, 0.1, UW - 0.0002, 0.066, 0.1, 0));
  const bolt = new THREE.Group();
  g.add(bolt);
  kb.add(M.worn, box(0.0014, 0.024, 0.056, UW, 0.066, 0.12, 0.0005));
  kb.add(M.dark, box(0.0008, 0.003, 0.04, UW + 0.0008, 0.06, 0.12, 0));
  kb.build(bolt);
  // 拉機柄(右側,換彈時往後拉)
  k.add(M.dark, box(0.0012, 0.008, 0.112, UW - 0.0002, 0.08, -0.025, 0));
  const ch = new THREE.Group();
  g.add(ch);
  kc.add(P, box(0.024, 0.008, 0.014, UW + 0.011, 0.08, 0.022, 0.002));
  kc.add(M.polySmooth, lathe([[0, 0], [0, 0.0085], [0.004, 0.0098], [0.02, 0.0098], [0.025, 0.007], [0.0262, 0]], 20).rotateY(-HALF).translate(UW + 0.018, 0.08, -0.022));
  kc.build(ch);

  // 上機匣前段:兩側鋼板開大型長圓散熱孔,可看見裡面的槍管
  const holes = [];
  for (let i = 0; i < 4; i++) { const f0 = 0.316 + i * 0.058; holes.push([[f0, 0.047, 0.012], [f0 + 0.046, 0.047, 0.012], [f0 + 0.046, 0.083, 0.012], [f0, 0.083, 0.012]]); }
  for (const sx of [-1, 1]) k.add(P, side([[0.296, UB], [0.556, UB, 0.002], [0.556, UT - 0.006, 0.004], [0.548, UT, 0.002], [0.296, UT]], 0.004, { x: sx * (UW - 0.002), holes, bevel: 0.0008 }));
  k.add(P, sect([[-UW + 0.003, UT - 0.008], [UW - 0.003, UT - 0.008], [UW - 0.002, UT - 0.006, 0.002], [UW - 0.006, UT, 0.002], [-UW + 0.006, UT, 0.002], [-UW + 0.002, UT - 0.006, 0.002]], 0.296, 0.55, { bevel: 0.001 }));
  k.add(P, sect([[-UW + 0.003, UB], [UW - 0.003, UB], [UW - 0.003, UB + 0.005], [-UW + 0.003, UB + 0.005]], 0.296, 0.55, { bevel: 0.001 }));
  k.add(P, box(2 * UW - 0.002, UT - UB - 0.004, 0.008, 0, (UT + UB) / 2, 0.552, 0.002)); // 前端板
  k.add(P, lathe([[0.548, 0], [0.548, 0.026], [0.561, 0.026], [0.564, 0.0225], [0.564, 0]], 28, BORE)); // 槍管襯套

  // 提把(機匣前段頂部)
  k.add(P, side([[0.33, UT - 0.002], [0.476, UT - 0.002], [0.463, UT + 0.056, 0.012], [0.343, UT + 0.056, 0.012]], 0.014, { bevel: 0.002, holes: [[[0.352, UT + 0.007, 0.003], [0.454, UT + 0.007, 0.003], [0.445, UT + 0.043, 0.008], [0.361, UT + 0.043, 0.008]]] }));
  k.add(M.rubber, sect([[-0.0105, UT + 0.042, 0.003], [0.0105, UT + 0.042, 0.003], [0.0105, UT + 0.06, 0.008], [-0.0105, UT + 0.06, 0.008]], 0.356, 0.45, { bevel: 0.002 }));
  for (const f of [0.338, 0.468]) {
    k.add(P, box(0.03, 0.008, 0.024, 0, UT + 0.002, f, 0.002));
    k.add(M.worn, cylX(0.0036, 0.032, 0, UT + 0.004, f, 12));
  }

  // 下機匣(握把/扳機/彈匣井)
  k.add(P, side([[-0.07, UB + 0.002], [0.274, UB + 0.002], [0.274, 0.004, 0.004], [0.266, -0.026, 0.004], [0.084, -0.026, 0.003], [0.078, 0.0, 0.002], [-0.07, 0.0]], 2 * LW, { bevel: 0.0016 }));
  k.add(P, side([[0.084, -0.022], [0.266, -0.022], [0.266, -0.031, 0.002], [0.084, -0.031, 0.002]], 2 * LW + 0.006, { bevel: 0.0015 })); // 彈匣井口外擴
  k.add(M.dark, box(0.036, 0.002, 0.156, 0, -0.0312, 0.169, 0));
  // 槍托(下機匣後段)、橡膠托底、托腮、背帶環
  k.add(P, side([[-0.06, UT - 0.002], [-0.3, UT - 0.002], [-0.418, UT - 0.008, 0.006], [-0.43, UT - 0.02, 0.006], [-0.434, -0.068, 0.006], [-0.42, -0.08, 0.008], [-0.33, -0.05, 0.03], [-0.17, -0.006, 0.05], [-0.06, 0.0]], 2 * LW, { bevel: 0.004, seg: 3 }));
  k.add(M.rubber, side([[-0.43, UT - 0.008, 0.006], [-0.468, UT - 0.012, 0.012], [-0.472, -0.074, 0.012], [-0.432, -0.082, 0.006]], 2 * LW + 0.006, { bevel: 0.005, seg: 3 }));
  for (let i = 0; i < 9; i++) k.add(M.rubber, box(2 * LW + 0.007, 0.0024, 0.004, 0, UT - 0.028 - i * 0.0175, -0.4692 + i * 0.0004, 0.0008));
  k.add(M.rubber, sect([[-0.024, UT - 0.004, 0.002], [0.024, UT - 0.004, 0.002], [0.022, UT + 0.01, 0.007], [-0.022, UT + 0.01, 0.007]], -0.405, -0.225, { bevel: 0.003, seg: 3 }));
  k.add(M.steel, new THREE.TorusGeometry(0.0085, 0.0019, 8, 16).rotateY(HALF).translate(0, -0.072, 0.37));
  k.add(P, box(0.012, 0.008, 0.02, 0, -0.062, -0.37, 0.002));
  // 握把(A2 式點刻紋)、大型護弓、扳機、保險、彈匣卡榫
  k.add(M.polymer, side([[0.0205, -0.0018], [-0.0225, -0.0018], [-0.0305, -0.03, 0.01], [-0.0525, -0.0985, 0.008], [-0.0405, -0.1065, 0.006], [-0.0115, -0.1045, 0.008], [-0.0018, -0.0705, 0.012], [0.0045, -0.0548, 0.004], [0.0022, -0.0462, 0.006], [0.0122, -0.0222, 0.012], [0.0205, -0.0102]], 0.0302, { bevel: 0.006, seg: 3 }));
  k.add(P, side([[0.006, 0.001], [0.08, 0.001], [0.08, -0.012, 0.002], [0.072, -0.036, 0.008], [0.016, -0.037, 0.008], [0.009, -0.025, 0.004]], 0.012, {
    bevel: 0.0014, holes: [[[0.017, -0.0045, 0.002], [0.071, -0.0045, 0.002], [0.066, -0.029, 0.006], [0.021, -0.03, 0.006], [0.017, -0.022, 0.003]]],
  }));
  k.add(M.worn, side([[0.0362, -0.0038], [0.0418, -0.0038], [0.0408, -0.0142, 0.005], [0.0362, -0.0232, 0.0015], [0.0334, -0.0225, 0.0015], [0.0365, -0.0128, 0.004]], 0.0062, { bevel: 0.0012 }));
  k.add(M.steel, cylX(0.0075, 0.0024, -LW - 0.001, 0.013, -0.012, 22));
  k.add(M.steel, side([[-0.014, 0.0098], [0.006, 0.0108], [0.007, 0.0138, 0.0012], [-0.014, 0.0142]], 0.0024, { x: -LW - 0.0025, bevel: 0.0005 }));
  k.add(M.worn, cylX(0.0048, 0.004, LW + 0.001, -0.01, 0.079, 16));

  // 折疊兩腳架(收起時腳往前貼在槍管下)
  k.add(P, box(0.05, 0.014, 0.036, 0, UB - 0.006, 0.506, 0.002));
  k.add(P, side([[0.49, UB - 0.012], [0.524, UB - 0.012], [0.524, UB - 0.027, 0.004], [0.49, UB - 0.027, 0.004]], 0.03, { bevel: 0.0015 }));
  k.add(M.worn, cylX(0.0042, 0.066, 0, UB - 0.02, 0.512, 14));
  for (const sx of [-1, 1]) {
    const p0 = [sx * 0.024, UB - 0.02, 0.512], p1 = [sx * 0.017, 0.011, 0.745], p2 = [sx * 0.0135, 0.0085, 0.858];
    k.add(P, cylX(0.0085, 0.012, sx * 0.024, UB - 0.02, 0.512, 16)); // 鉸鏈
    k.add(P, rod(0.0068, p0, p1, 14));
    k.add(M.steel, rod(0.0052, p1, p2, 12));
    k.add(P, rod(0.0085, [p1[0], p1[1] + 0.0003, p1[2] - 0.012], [p1[0], p1[1] - 0.0002, p1[2] + 0.006], 16)); // 伸縮鎖環
    for (let i = 0; i < 4; i++) k.add(M.dark, cylX(0.0016, 0.0108, p1[0] - sx * 0.0004, p1[1] - 0.0004 - i * 0.0003, p1[2] + 0.024 + i * 0.019, 8));
    k.add(M.rubber, box(0.024, 0.009, 0.036, sx * 0.0135, 0.0075, 0.874, 0.0035)); // 腳墊
  }
  k.add(P, box(0.04, 0.005, 0.01, 0, 0.0115, 0.79, 0.0012)); // 收納夾

  // 槍管組(開火時短後座):機匣內段、凹槽外露段、雙室制退器
  const barrel = new THREE.Group();
  g.add(barrel);
  kr.add(M.steel, lathe([[0.0, 0], [0.0, 0.0195], [0.566, 0.0195], [0.566, 0]], 24, BORE));
  const fl = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, r = 0.0176 - Math.pow(Math.max(0, Math.cos(8 * a)), 2.5) * 0.0028;
    fl.push([Math.cos(a) * r, BORE + Math.sin(a) * r]);
  }
  kr.add(M.steel, sect(fl, 0.586, 0.842, { bevel: 0.0006, seg: 1, cs: 1 }));
  kr.add(M.steel, lathe([[0.56, 0], [0.56, 0.0188], [0.582, 0.0186], [0.588, 0.0176], [0.588, 0]], 24, BORE));
  kr.add(M.steel, lathe([[0.838, 0], [0.838, 0.0176], [0.846, 0.0178], [0.864, 0.0178], [0.864, 0]], 24, BORE));
  const B0 = 0.86;
  kr.add(P, box(0.044, 0.044, 0.028, 0, BORE, B0 + 0.014, 0.005));
  const plate = [[-0.022, B0 + 0.026], [-0.037, B0 + 0.04, 0.004], [-0.037, B0 + 0.096, 0.003], [0, B0 + 0.1145, 0.006], [0.037, B0 + 0.096, 0.003], [0.037, B0 + 0.04, 0.004], [0.022, B0 + 0.026]];
  for (const sy of [-1, 1]) kr.add(P, top(plate, 0.0065, BORE + sy * 0.0205, { bevel: 0.001 }));
  for (const fb of [0.046, 0.08, 0.114]) kr.add(P, top([[-0.036, B0 + fb - 0.017], [0, B0 + fb], [0.036, B0 + fb - 0.017], [0.036, B0 + fb - 0.026], [0, B0 + fb - 0.009], [-0.036, B0 + fb - 0.026]], 0.036, BORE, { bevel: 0.001 }));
  kr.add(M.dark, cylZ(0.0088, B0 + 0.1, B0 + 0.1155, 0, BORE, 16));
  kr.build(barrel);

  // 狙擊鏡(5-25×56,34mm 鏡管):目鏡(屈光度環、倍率環滾花)、鏡管、旋鈕座、大物鏡、遮光罩、鍍膜鏡片、翻蓋式鏡頭蓋
  const ring = [[-0.104, 0], [-0.104, 0.0192]];
  for (let f = -0.102; f < -0.074; f += 0.0028) ring.push([f, 0.0192], [f + 0.0006, 0.0202], [f + 0.0016, 0.0202], [f + 0.0022, 0.0192]);
  ring.push([-0.072, 0.0192], [-0.072, 0]);
  k.add(M.scope, lathe(ring, 40, SY));
  k.add(M.scope, lathe([[-0.181, 0], [-0.181, 0.0186], [-0.1855, 0.0198], [-0.187, 0.0226], [-0.1835, 0.0238], [-0.15, 0.0238], [-0.14, 0.0226], [-0.12, 0.0206], [-0.106, 0.0186], [-0.104, 0]], 44, SY));
  for (let i = 0; i < 3; i++) k.add(M.dark, lathe([[-0.176 + i * 0.008, 0], [-0.176 + i * 0.008, 0.02395], [-0.1748 + i * 0.008, 0.02395], [-0.1748 + i * 0.008, 0]], 44, SY));
  k.add(M.scope, cylZ(0.017, -0.074, 0.112, 0, SY, 40));
  k.add(M.scope, lathe([[0.108, 0], [0.108, 0.0172], [0.122, 0.0186], [0.152, 0.0316], [0.162, 0.034], [0.214, 0.034], [0.2165, 0.0334], [0.2165, 0.0305], [0.2105, 0.0296], [0.2105, 0]], 48, SY));
  k.add(M.scope, lathe([[0.2165, 0.0315], [0.2165, 0.0338], [0.268, 0.0338], [0.2705, 0.0332], [0.2705, 0.0315], [0.2165, 0.0315]], 48, SY)); // 遮光罩
  k.add(M.dark, lathe([[0.2165, 0.0334], [0.2165, 0.03415], [0.2185, 0.03415], [0.2185, 0.0334]], 48, SY));
  k.add(M.lens, cylZ(0.0296, 0.2105, 0.2109, 0, SY, 44));
  k.add(M.lens, cylZ(0.0186, -0.1814, -0.1808, 0, SY, 36));
  // 翻蓋式鏡頭蓋:物鏡蓋鉸鏈在上緣、往上翻開約 100°;目鏡蓋鉸鏈在左緣、往左前方翻開
  const R1 = 0.0356, R2 = 0.0256;
  k.add(M.polySmooth, rot(new THREE.CylinderGeometry(R1, R1, 0.0036, 44).translate(0, 0, -R1), 0.17, 0, 0).translate(0, SY + R1, -0.2735));
  k.add(M.polySmooth, lathe([[0.2685, 0.0336], [0.2685, 0.0356], [0.2745, 0.0356], [0.2745, 0.0336], [0.2685, 0.0336]], 48, SY));
  k.add(M.polySmooth, box(0.016, 0.0065, 0.009, 0, SY + R1 + 0.001, 0.2715, 0.0015));
  k.add(M.polySmooth, new THREE.CylinderGeometry(R2, R2, 0.0036, 40).rotateZ(HALF).translate(-R2 - 0.003, SY, 0.1895 - R2));
  k.add(M.polySmooth, lathe([[-0.1915, 0.0236], [-0.1915, 0.0256], [-0.1855, 0.0256], [-0.1855, 0.0236], [-0.1915, 0.0236]], 44, SY));
  k.add(M.polySmooth, box(0.008, 0.012, 0.01, -R2 - 0.001, SY, -0.1885, 0.0015));
  const TF = 0.018;
  k.add(M.scope, box(0.04, 0.04, 0.062, 0, SY, TF, 0.009)); // 旋鈕座
  const turret = (rz, rb, hb, rc, hc, ticks) => {
    const y0 = SY + 0.018;
    const list = [cylY(rb, hb, 0, y0 + hb / 2, TF, 32), cylY(rc, 0.006, 0, y0 + hb + 0.003, TF, 36), knurlY(rc, hc, 26, 0, y0 + hb + 0.006 + hc / 2, TF), cylY(rc * 0.8, 0.0024, 0, y0 + hb + 0.006 + hc + 0.0012, TF, 28)];
    for (const geo of list) k.add(M.scope, rot(geo, 0, 0, rz, 0, SY, TF));
    for (let i = 0; i < ticks; i++) { // 刻度
      const len = i % 5 ? 0.0024 : 0.0042, yt = y0 + hb + 0.006;
      const tk = rot(box(0.0007, len, 0.0006, 0, yt - len / 2, TF + rc + 0.0002, 0), 0, (i / ticks) * Math.PI * 2, 0, 0, yt, TF);
      k.add(M.white, rot(tk, 0, 0, rz, 0, SY, TF));
    }
  };
  turret(0, 0.012, 0.008, 0.0155, 0.014, 20); // 高低
  turret(-HALF, 0.012, 0.008, 0.0155, 0.014, 20); // 風偏
  turret(HALF, 0.011, 0.005, 0.0172, 0.01, 0); // 視差
  // 鏡環與環座(夾在導軌上,左側橫向螺帽)
  for (const rf of [-0.052, 0.074]) {
    k.add(M.scope, lathe([[rf - 0.0095, 0.0171], [rf - 0.0095, 0.0218], [rf - 0.0082, 0.0229], [rf + 0.0082, 0.0229], [rf + 0.0095, 0.0218], [rf + 0.0095, 0.0171]], 36, SY));
    for (const sx of [-1, 1]) k.add(M.dark, box(0.0012, 0.0008, 0.0192, sx * 0.0226, SY, rf, 0)); // 環蓋分模線
    k.add(M.scope, side([[rf - 0.013, UT + 0.0092], [rf + 0.013, UT + 0.0092], [rf + 0.0095, SY - 0.016, 0.004], [rf - 0.0095, SY - 0.016, 0.004]], 0.03, { bevel: 0.002 }));
    k.add(M.scope, box(0.0062, 0.013, 0.026, -0.0185, UT + 0.0065, rf, 0.0015));
    k.add(M.scope, box(0.0062, 0.013, 0.026, 0.0185, UT + 0.0065, rf, 0.0015));
    k.add(M.worn, cylX(0.0056, 0.0055, -0.0235, UT + 0.0068, rf, 6));
    k.add(M.worn, cylX(0.0028, 0.004, 0.0232, UT + 0.0068, rf, 12));
    for (const sx of [-1, 1]) for (const df of [-0.0045, 0.0045]) k.add(M.worn, cylX(0.0017, 0.004, sx * 0.0222, SY + 0.0062, rf + df, 10));
  }
  k.build(g);

  // 10 發直彈匣(鋼板、側面壓筋、頂端露出 .50 BMG 子彈)
  const mag = groupAt(g, 0, 0, 0);
  km.add(M.magSteel, side([[0.092, 0.022], [0.246, 0.022], [0.246, -0.118, 0.003], [0.092, -0.118, 0.003]], 0.034, { bevel: 0.0018 }));
  for (const sx of [-1, 1]) for (const f of [0.128, 0.208]) km.add(M.magSteel, side([[f - 0.009, -0.034], [f + 0.009, -0.034], [f + 0.009, -0.108, 0.004], [f - 0.009, -0.108, 0.004]], 0.002, { x: sx * 0.0175, bevel: 0.0007 }));
  km.add(M.magSteel, side([[0.087, -0.114], [0.251, -0.114], [0.251, -0.128, 0.004], [0.087, -0.128, 0.004]], 0.038, { bevel: 0.002 }));
  km.add(M.gold, lathe([[0.104, 0], [0.104, 0.0102], [0.168, 0.0098], [0.18, 0.0074], [0.2, 0.0074], [0.2, 0]], 18, 0.029));
  km.add(M.copper, lathe([[0.2, 0], [0.2, 0.0066], [0.214, 0.0064], [0.234, 0.0034], [0.243, 0]], 18, 0.029));
  km.build(mag);

  return {
    muzzle: new THREE.Vector3(0, BORE, -0.976), length: 1.44, barrel, bolt, ch, mag,
    eject: [0.11, 0.07, UW + 0.006], brake: B0 + 0.06,
    grip: { a: (24 * Math.PI) / 180, c: [-0.0012, -0.0018], depth: 0.044, halfW: 0.0151, elbow: V(0.16, -0.3, 0.3) },
    fore: { f: 0.36, y: UB, halfW: UW, elbow: V(-0.22, -0.3, 0.4) },
    sight: { rear: [-0.187, SY], front: [0.2705, SY], eye: 0.09, optic: 'sniper' },
    anim(shot, reload, empty, st) {
      const c = shot < 0.16 ? Math.sin((shot / 0.16) * Math.PI) : 0;
      barrel.position.z = c * 0.026;
      const t = reload < 0 ? 0 : reload;
      const out = smooth(0.1, 0.3, t) * (1 - smooth(0.46, 0.62, t)); // 卸下 → 裝上新彈匣
      mag.position.set(0, -out * 0.3, -out * 0.03);
      const pull = smooth(0.7, 0.78, t) * (1 - smooth(0.84, 0.87, t)); // 拉機柄到底再放開
      ch.position.z = pull * 0.09;
      const lock = empty && (reload < 0 || reload < 0.84);
      bolt.position.z = Math.max(c * 0.045, pull * 0.045, lock ? 0.045 : 0);
      const L = st && st.left;
      if (!L) return;
      // 左手:去抓彈匣 → 跟著彈匣下去再上來 → 越過機匣頂拉右側機柄 → 回到托握位置
      const h = st.palm;
      const toMag = smooth(0.04, 0.12, t) * (1 - smooth(0.6, 0.68, t));
      const toCh = smooth(0.62, 0.7, t) * (1 - smooth(0.88, 0.97, t));
      const mx = 0, my = -0.06 - out * 0.3, mz = -0.17 - out * 0.03; // 彈匣前緣
      const cx = UW + 0.02, cy = 0.105, cz = -0.03 + pull * 0.09; // 機柄上方
      L.position.set(h.x + (mx - h.x) * toMag + (cx - h.x) * toCh, h.y + (my - h.y) * toMag + (cy - h.y) * toCh, h.z + (mz - h.z) * toMag + (cz - h.z) * toCh);
      L.rotation.set(-0.4 * toMag + 0.3 * toCh, 0.5 * toMag - 0.3 * toCh, -1.1 * toMag + 2.2 * toCh);
    },
  };
}

// ---------- 戰術刀(KA-BAR 式):刀身朝 +Y、刃口朝前(-Z),原點在護手中心 ----------
function knifeGeos(k) {
  k.add(M.bladeCoat, side([[-0.012, 0.004], [0.0205, 0.004, 0.002], [0.022, 0.112, 0.06], [0.0032, 0.18], [-0.0055, 0.157, 0.012], [-0.012, 0.134]], 0.0046, { bevel: 0.0009, cs: 8 }));
  k.add(M.edge, side([[0.0128, 0.012], [0.0212, 0.012], [0.0228, 0.112, 0.06], [0.0038, 0.1795], [0.0016, 0.1735], [0.0142, 0.114, 0.05]], 0.0049, { bevel: 0.0004, cs: 8 }));
  k.add(M.dark, side([[-0.0068, 0.026], [-0.0022, 0.026], [-0.0022, 0.112, 0.002], [-0.0068, 0.106, 0.002]], 0.0048, { bevel: 0.0002 })); // 血槽
  k.add(M.park, box(0.016, 0.0058, 0.062, 0, -0.0012, 0.004, 0.0022)); // 護手
  for (let i = 0; i < 10; i++) k.add(M.leatherBrown, new THREE.CylinderGeometry(0.0124, 0.0124, 0.0094, 22).scale(0.74, 1, 1).translate(0, -0.0094 - i * 0.0101, -0.002));
  k.add(M.park, new THREE.CylinderGeometry(0.0128, 0.0118, 0.012, 22).scale(0.76, 1, 1).translate(0, -0.1135, -0.002));
  k.add(M.park, new THREE.SphereGeometry(0.0118, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.76, 0.5, 1).translate(0, -0.1195, -0.002));
  k.add(M.worn, cylX(0.0026, 0.0185, 0, -0.1135, -0.002, 12)); // 尾端鉚釘
}

// ---------- M67 破片手榴彈:彈體球心為原點 ----------
function grenadeGeos(k, withPin = true) {
  const R = 0.0318;
  k.add(M.olive, new THREE.SphereGeometry(R, 28, 20).scale(1, 1.06, 1));
  k.add(M.yellow, new THREE.TorusGeometry(R * 0.86, 0.0006, 6, 32).rotateX(HALF).translate(0, R * 0.52, 0));
  k.add(M.olive, cylY(0.0118, 0.012, 0, R + 0.002, 0, 20));
  k.add(M.park, cylY(0.0098, 0.018, 0, R + 0.012, 0, 18)); // 引信
  k.add(M.park, cylY(0.0062, 0.006, 0, R + 0.024, 0, 14));
  const arc = []; // 握片(貼著彈體往下彎)
  for (let i = 0; i <= 6; i++) { const a = 0.15 + i * 0.16; arc.push([Math.sin(a) * (R + 0.003), Math.cos(a) * (R + 0.003) + 0.012 * (1 - i / 6)]); }
  for (let i = 0; i < 6; i++) {
    const [z0, y0] = arc[i], [z1, y1] = arc[i + 1];
    const l = Math.hypot(z1 - z0, y1 - y0);
    k.add(M.park, rot(box(0.012, 0.0014, l + 0.001, 0, (y0 + y1) / 2, -(z0 + z1) / 2, 0.0004), Math.atan2(y1 - y0, -(z1 - z0)) * -1, 0, 0, 0, (y0 + y1) / 2, -(z0 + z1) / 2));
  }
  if (withPin) {
    k.add(M.worn, new THREE.TorusGeometry(0.0108, 0.0013, 8, 22).translate(0.016, R + 0.012, 0.004));
    k.add(M.worn, cylX(0.0011, 0.024, 0.004, R + 0.013, 0.0, 8));
  }
}

const BUILDERS = { pistol: buildPistol, revolver: buildRevolver, shotgun: buildShotgun, ak47: buildAK, m4a1: buildM4, barrett: buildBarrett };

// ---------- 手臂 ----------
// 右手直接併進 hands;左手放在以掌心為樞軸的群組(換彈/泵動時可以整隻移動、轉動)
function buildHands(g, id, info) {
  const k = new Kit(), kl = new Kit();
  const gr = info.grip;
  let palm;
  if (id === 'pistol' || id === 'revolver') {
    rightGripHand(k, gr.a, gr.c, gr.depth, gr.halfW, { elbow: V(0.07, -0.5, 0.12) });
    leftSupportHand(kl, gr.a, gr.c, gr.depth, gr.halfW);
    palm = V(-0.04, gr.c[1] - 0.05, -gr.c[0]);
  } else {
    rightGripHand(k, gr.a, gr.c, gr.depth, gr.halfW, { elbow: gr.elbow ?? V(0.15, -0.3, 0.28), thumb: gr.thumb ?? { dir: [-0.2, -0.7, -0.68], roll: 0, curl: [0.25, 0.3] }, s: gr.s, reach: gr.reach, index: gr.index });
    palm = leftForeHand(kl, info.fore.f, info.fore.y, info.fore.halfW, { elbow: info.fore.elbow });
  }
  k.build(g);
  const left = new THREE.Group(), inner = new THREE.Group();
  left.position.copy(palm);
  inner.position.copy(palm).negate();
  left.add(inner);
  g.add(left);
  kl.build(inner);
  if (info.handProp) info.handProp(left, palm); // 例:霰彈槍左手拿的子彈
  return { left, palm };
}

const cache = {};
function built(id) {
  if (!cache[id]) {
    const gun = new THREE.Group();
    const info = BUILDERS[id](gun);
    const rest = []; // 活動零件的初始姿勢(展示槍要用未作動的狀態)
    gun.traverse((o) => rest.push([o.position.clone(), o.quaternion.clone()]));
    cache[id] = { gun, info, rest, used: false };
  }
  return cache[id];
}

// 除錯/調校用:取得槍模共用資訊(握把、開鏡點…)
export function weaponInfo(id) { return built(id).info; }

// 建立第一人稱用的武器模型(含雙手)
export function createWeaponModel(id) {
  const c = built(id);
  const gun = c.used ? c.gun.clone() : c.gun;
  c.used = true;
  const root = new THREE.Group();
  root.add(gun);
  const hands = new THREE.Group();
  root.add(hands);
  const { left, palm } = buildHands(hands, id, c.info);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(c.info.muzzle);
  root.add(muzzle);
  const eject = new THREE.Object3D(); // 拋殼口
  const e = c.info.eject || [0, 0.04, 0.02];
  eject.position.set(e[2], e[1], -e[0]);
  root.add(eject);
  return { root, gun, hands, muzzle, eject, left, palm, info: c.info };
}

// 第一人稱小刀(右手正握)。回傳 { root, blade };root 原點在握把頂端,刀身朝上
export function createKnifeModel() {
  const k = new Kit();
  knifeGeos(k);
  rightGripHand(k, 0, [0.002, -0.006], 0.028, 0.0098, { s: 0.05, reach: 0.006, elbow: V(0.1, -0.38, 0.26), index: [1.25, 1.35, 0.45], thumb: { dir: [-0.15, -0.95, -0.25], roll: 0, curl: [0.3, 0.35] } });
  const root = new THREE.Group();
  k.build(root);
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.17, -0.004);
  root.add(tip);
  return { root, tip };
}

// 第一人稱手榴彈(右手握持)。回傳 { root, nade, pin }:nade 是手上那顆(放手時隱藏)、pin 是拉環(拔掉時隱藏)
export function createGrenadeModel() {
  const kn = new Kit(), kp = new Kit(), kh = new Kit();
  grenadeGeos(kn, false);
  kp.add(M.worn, new THREE.TorusGeometry(0.0108, 0.0013, 8, 22).translate(0.016, 0.0438, 0.004));
  kp.add(M.worn, cylX(0.0011, 0.024, 0.004, 0.0448, 0.0, 8));
  const root = new THREE.Group(), nade = new THREE.Group(), pin = new THREE.Group();
  root.add(nade);
  nade.add(pin);
  kn.build(nade);
  kp.build(pin);
  // 手:掌心貼著彈體右後方,手指往左前包住,拇指壓住握片
  const wrist = V(0.052, -0.022, 0.078);
  const place = handBasis(wrist, V(-0.5, 0.18, -0.85), V(-0.85, 0.15, -0.3));
  buildHand(kh, 1, place, { curl: [[0.75, 1.0, 0.55], [0.82, 1.05, 0.55], [0.9, 1.05, 0.5], [1.0, 1.0, 0.5]], spread: [0.12, 0.02, -0.05, -0.12], thumb: { dir: [-0.55, 0.55, -0.6], roll: 0, curl: [0.25, 0.3] } });
  const w = new THREE.Vector3(0, 0, 0.034).applyMatrix4(place);
  buildSleeve(kh, w, w.clone().add(V(0.1, -0.22, 0.4)), 1);
  kh.build(root);
  return { root, nade, pin };
}

// 世界中飛行的手榴彈(拉環已拔、握片已彈開)
let nadeProto = null;
export function createGrenadeProjectile() {
  if (!nadeProto) {
    const k = new Kit();
    const R = 0.0318;
    k.add(M.olive, new THREE.SphereGeometry(R, 20, 14).scale(1, 1.06, 1));
    k.add(M.yellow, new THREE.TorusGeometry(R * 0.86, 0.0006, 6, 24).rotateX(HALF).translate(0, R * 0.52, 0));
    k.add(M.park, cylY(0.0098, 0.03, 0, R + 0.008, 0, 14));
    nadeProto = new THREE.Group();
    k.build(nadeProto);
    nadeProto.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  return nadeProto.clone();
}

// 商店展示用:只有槍(與第一人稱共用幾何)
export function createDisplayGun(id) {
  const c = built(id);
  const g = c.gun.clone();
  let i = 0;
  g.traverse((o) => {
    const r = c.rest[i++];
    if (r) { o.position.copy(r[0]); o.quaternion.copy(r[1]); }
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// 若 public/models/<id>.glb 存在就換成網路下載的模型(自動縮放到真槍長度、對齊握把)
const loader = new GLTFLoader();
export async function tryLoadGLB(model, id) {
  const url = `${import.meta.env.BASE_URL}models/${id}.glb`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const type = head.headers.get('content-type') || '';
    if (!head.ok || type.includes('text/html')) return false;
    const gltf = await loader.loadAsync(url);
    const obj = gltf.scene;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const wrapper = new THREE.Group();
    wrapper.add(obj);
    if (size.x > size.z) wrapper.rotation.y = HALF; // 讓槍管朝向 -Z
    wrapper.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(wrapper);
    const size2 = box2.getSize(new THREE.Vector3());
    const s = model.info.length / Math.max(size2.z, 1e-4);
    wrapper.scale.setScalar(s);
    wrapper.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(wrapper);
    const center = box3.getCenter(new THREE.Vector3());
    // 槍管前端對齊原本槍口,握把大約落在原點
    wrapper.position.set(-center.x, -box3.max.y + 0.05 - 0.0, -center.z - model.info.length * 0.28);
    model.gun.clear();
    model.gun.add(wrapper);
    model.info.anim = null;
    return true;
  } catch {
    return false;
  }
}
