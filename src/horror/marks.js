import * as THREE from 'three';
import { WRITINGS } from './lines.js';
import { paintTexture } from '../sys/texworker.js';
import { bloodWriting, dripPath, rng } from '../art/stainset.js';

// 痕跡與「看得見的靈異」:濕腳印、玻璃上的手印、牆上的字、門縫下的光與走過的影子、隔簾後的人影、鏡子裡的臉、
// 電視雜訊裡的臉、電梯門縫的光。腳印與手印各用一個 InstancedMesh(每個實例自己的透明度),
// 字跡每則一個網格(貼圖不同,最多 MAXW 則,舊的回收)。全部受燈光與手電筒照明(標準材質),不投影。
const MAXF = 28, MAXH = 14, MAXW = 10;
const FONT_HAND = '"DFKai-SB", "BiauKai", "標楷體", "KaiTi", "STKaiti", serif';
const FONT_SANS = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

// ---------- 貼圖(canvas;第一次用到才畫) ----------
let footTex = null, handTex = null;
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// 濕腳印:解剖比例的赤腳(腳跟、外側足弓、前掌、五趾;足弓內側懸空),水漬邊緣較深(src/art/stainset.js;貼圖 Worker 畫)
function footTexture() {
  if (footTex) return footTex;
  footTex = paintTexture('art/stains:wetFoot', { seed: 3, w: 128, h: 256 }, { wrap: false, anisotropy: 4 });
  return footTex;
}
// 玻璃上的手印:油脂/霧氣的掌印(指節橫紋、指腹、掌丘、掌紋、壓力不均與皮紋;src/art/stainset.js;貼圖 Worker 畫)
function handTexture() {
  if (handTex) return handTex;
  handTex = paintTexture('art/stains:ghostHand', { seed: 5, size: 256 }, { wrap: false, anisotropy: 4 });
  return handTex;
}
// 字跡貼圖:依風格畫手寫字(每個字隨機旋轉/大小/基線)
const STYLE = {
  marker: { col: '#121212', font: FONT_SANS, w: 600, rough: 0.6 },
  paint: { col: '#6e1610', font: FONT_SANS, w: 800, drip: 1, rough: 1 },
  chalk: { col: '#d6d4c8', font: FONT_HAND, w: 500, chalk: 1, rough: 0.8 },
  crayon: { col: '#2f4f9c', font: FONT_HAND, w: 700, crayon: 1, rough: 1.6 },
  scratch: { col: '#c9c1ae', font: FONT_HAND, w: 300, scratch: 1, rough: 1 },
  smear: { col: '#2a0605', font: FONT_HAND, w: 900, drip: 1, smear: 1, rough: 1.3 },
};
export function writingCanvas(text, style = 'marker', seed = 1) {
  const S = STYLE[style] || STYLE.marker;
  let s = seed >>> 0 || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lines = String(text).split('\n'), px = 96;
  const cols = Math.max(...lines.map((l) => [...l].length));
  const W = Math.ceil(cols * px * 1.05 + px * 0.6), H = Math.ceil(lines.length * px * 1.25 + px * (S.drip ? 0.9 : 0.4));
  const c = document.createElement('canvas'); c.width = Math.min(2048, W); c.height = Math.min(1024, H);
  const x = c.getContext('2d', S.smear ? { willReadFrequently: true } : undefined);
  x.textBaseline = 'middle'; x.textAlign = 'center';
  const R = rng(seed);
  lines.forEach((ln, li) => {
    [...ln].forEach((ch, ci) => {
      if (ch === ' ' || ch === '　') return;
      const cx = px * 0.4 + ci * px * 1.05 + px / 2 + (r() - 0.5) * 8 * S.rough, cy = px * 0.3 + li * px * 1.25 + px / 2 + (r() - 0.5) * 10 * S.rough;
      const sz = px * (0.86 + r() * 0.22);
      x.save(); x.translate(cx, cy); x.rotate((r() - 0.5) * 0.22 * S.rough);
      x.font = `${S.w} ${sz}px ${S.font}`;
      if (S.chalk || S.crayon) {
        for (let k = 0; k < (S.crayon ? 5 : 7); k++) { x.globalAlpha = S.crayon ? 0.3 : 0.18; x.fillStyle = S.col; x.fillText(ch, (r() - 0.5) * 3, (r() - 0.5) * 3); }
      } else if (S.scratch) {
        x.lineWidth = 1.4; x.strokeStyle = S.col;
        for (let k = 0; k < 3; k++) { x.globalAlpha = 0.55; x.strokeText(ch, (r() - 0.5) * 2.5, (r() - 0.5) * 2.5); }
      } else if (S.smear) { // 手指沾血寫:先畫成遮罩(白),最後整張換成血(厚薄、條紋、乾刷斷裂、往下流)
        x.globalAlpha = 1; x.fillStyle = '#fff'; x.fillText(ch, 0, 0);
        x.globalAlpha = 0.45; x.fillText(ch, 1.5 + r() * 2.5, 1 + r() * 2);
      } else {
        x.globalAlpha = 0.93; x.fillStyle = S.col; x.fillText(ch, 0, 0);
      }
      x.restore();
      // 油漆往下流:越流越細、末端淚滴
      if (S.drip && !S.smear && r() < 0.45) { x.globalAlpha = 0.85; dripPath(x, cx + (r() - 0.5) * sz * 0.5, cy + sz * 0.28, 2.5 + r() * 3, 12 + r() * px * 0.8, R, S.col); }
    });
  });
  if (S.smear) {
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data, n = c.width * c.height, m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = d[i * 4 + 3] / 255;
    img.data.set(bloodWriting(m, c.width, c.height, seed, px));
    x.putImageData(img, 0, 0);
    return c;
  }
  // 磨損
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < c.width * c.height / 220; i++) { x.globalAlpha = r() * (S.chalk ? 0.7 : 0.35); x.fillRect(r() * c.width, r() * c.height, 1 + r() * 3, 1 + r() * 2); }
  return c;
}
// 剪影(隔簾後的人、鏡子裡的臉):柔邊的黑色人形 + 背光
function silhouetteCanvas(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = kind === 'face' ? 160 : 256;
  const x = c.getContext('2d');
  if (kind === 'face') { // 鏡子:長髮遮住半張臉的蒼白女人(很淡)
    x.filter = 'blur(3px)';
    x.fillStyle = 'rgba(10,10,12,0.95)'; x.beginPath(); x.ellipse(64, 74, 40, 62, 0, 0, Math.PI * 2); x.fill(); // 頭髮
    x.fillRect(26, 70, 76, 90);
    x.fillStyle = 'rgba(205,212,218,0.95)'; x.beginPath(); x.ellipse(66, 80, 22, 32, 0.05, 0, Math.PI * 2); x.fill(); // 臉
    x.fillStyle = 'rgba(10,10,12,1)'; x.fillRect(40, 44, 40, 36); // 瀏海
    x.fillStyle = 'rgba(20,20,26,0.9)'; x.beginPath(); x.ellipse(57, 84, 5, 3.5, 0, 0, 6.3); x.ellipse(76, 84, 5, 3.5, 0, 0, 6.3); x.fill(); // 眼窩
    x.filter = 'none';
    return c;
  }
  // 隔簾:站著的人(頭微傾),外圍是透過布的背光
  x.save(); x.translate(64, 124); x.scale(1, 2); // 橢圓形的背光,邊緣淡到 0(不會看到方形的邊)
  const g = x.createRadialGradient(0, 0, 4, 0, 0, 62);
  g.addColorStop(0, 'rgba(255,214,160,0.85)'); g.addColorStop(0.6, 'rgba(255,205,150,0.45)'); g.addColorStop(1, 'rgba(255,214,160,0)');
  x.fillStyle = g; x.fillRect(-64, -64, 128, 128);
  x.restore();
  x.globalCompositeOperation = 'destination-out';
  x.filter = 'blur(4px)';
  x.fillStyle = '#000';
  x.beginPath(); x.ellipse(70, 48, 15, 19, 0.25, 0, Math.PI * 2); x.fill(); // 頭(歪向一邊)
  x.beginPath(); x.moveTo(40, 74); x.quadraticCurveTo(64, 62, 90, 76); x.lineTo(96, 150); x.lineTo(88, 236); x.lineTo(44, 236); x.lineTo(34, 150); x.closePath(); x.fill(); // 身體(病人袍)
  x.beginPath(); x.moveTo(36, 80); x.lineTo(26, 170); x.lineTo(34, 172); x.lineTo(44, 90); x.fill(); // 手臂
  x.beginPath(); x.moveTo(92, 82); x.lineTo(104, 168); x.lineTo(96, 170); x.lineTo(84, 92); x.fill();
  x.filter = 'none';
  return c;
}

// 帶「每實例透明度」的標準材質(InstancedMesh 用)
function instMat(map, o) {
  const m = new THREE.MeshStandardMaterial({ name: 'ghost-mark', map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...o });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  m.customProgramCacheKey = () => 'ghost-inst-alpha';
  return m;
}
function instPool(geo, mat, n, name) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.name = name;
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', a);
  im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.raycast = () => {};
  const items = [];
  for (let i = 0; i < n; i++) items.push({ i, on: false, t: 0, born: 0, alpha: 0, target: 0, life: 0 });
  return { im, a, items, next: 0 };
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// ---- 第三輪的痕跡:各自一個小畫家(上面那些貼圖不動;src/horror/haunts.js 用) ----
// 一個人的影子(貼地):腳在畫布上緣、頭在下緣;手上拿著病歷板
export function shadowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 192;
  const g = c.getContext('2d');
  g.filter = 'blur(5px)'; g.fillStyle = '#000';
  for (const [x, y, rx, ry, r] of [[26, 42, 7, 32, 0.05], [38, 42, 7, 32, -0.05], [32, 100, 16, 32, 0], [32, 156, 11, 14, 0], [44, 118, 8, 20, 0.5]]) { g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 6.29); g.fill(); }
  return c;
}
// 窗玻璃外的一口霧氣;text 是手指在霧上抹出來的字(mirror:從外面寫的,裡面看是反的)
export function drawFog(c, text = '', mirror = true) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const gr = g.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W * 0.48);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.25).toFixed(2) + ')'; const r = Math.random() * 2.2, a = Math.random() * 6.28, d = Math.random() * W * 0.42; g.fillRect(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d * 0.8, r, r); }
  if (text) {
    g.save(); g.globalCompositeOperation = 'destination-out';
    g.translate(W / 2, H / 2); if (mirror) g.scale(-1, 1);
    const lines = String(text).split('\n'), fs = Math.min(64, (W * 0.82) / Math.max(...lines.map((l) => [...l].length)));
    g.font = '700 ' + fs + 'px "Noto Sans TC", "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.filter = 'blur(1.2px)'; g.lineWidth = fs * 0.12; g.strokeStyle = '#000'; g.fillStyle = '#000';
    lines.forEach((l, i) => { const y = (i - (lines.length - 1) / 2) * fs * 1.15; g.strokeText(l, 0, y); g.fillText(l, 0, y); });
    g.restore();
  }
  return c;
}
// 金水商行的小皮球(等距柱狀貼圖)
export function ballTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b8352b'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e9e2cf'; g.fillRect(0, 50, 256, 28);
  g.fillStyle = '#b8352b'; g.font = '700 20px "Noto Sans TC", "Microsoft JhengHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('金水商行', 64, 64); g.fillText('金水商行', 192, 64);
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 128, 2, 1);
  return c;
}
// 地上的紅包(鬼月禁忌:紅包不要撿)
export function envelopeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#a8191c'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#d9a640'; g.lineWidth = 3; g.strokeRect(5, 5, 118, 54);
  g.fillStyle = '#d9a640'; g.beginPath(); g.arc(64, 32, 11, 0, 6.29); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 128, Math.random() * 64, 3, 1);
  return c;
}

export class Marks {
  constructor(h, scene) {
    this.h = h; this.scene = scene;
    this.root = new THREE.Group(); this.root.name = 'ghost-marks';
    scene.add(this.root);
    this.feet = null; this.hands = null; this.writes = []; this.wIdx = 0;
    this.fx = []; // 進行中的特殊效果(門縫光、剪影、電視臉、電梯光)
    this._feet(); this._hands(); this._strip(); this._sil('face'); this._sil('curtain'); this._tv(); this._lift();
    for (const m of [this.strip, this.faceM, this.curtM, this.tv, this.lift]) m.visible = false;
  }
  // 預編譯用:每種材質一個代表(可見、在畫面外)
  warmList() { return [this.feet.im, this.hands.im, this.strip, this.faceM, this.curtM, this.tv, this.lift]; }
  // 字跡材質的代表(參數與 write() 建的完全一樣 → 同一個 shader)
  warmWriting() {
    const c = document.createElement('canvas'); c.width = c.height = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ name: 'ghost-writing', map: tex(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.85 }));
    m.frustumCulled = false;
    return m;
  }
  _feet() {
    if (!this.feet) {
      const g = new THREE.PlaneGeometry(0.13, 0.26); g.rotateX(-Math.PI / 2);
      this.feet = instPool(g, instMat(footTexture(), { color: 0x0c0f10, roughness: 0.06, metalness: 0.1 }), MAXF, 'ghost-feet');
      this.root.add(this.feet.im);
    }
    return this.feet;
  }
  _hands() {
    if (!this.hands) {
      const g = new THREE.PlaneGeometry(0.2, 0.2);
      this.hands = instPool(g, instMat(handTexture(), { color: 0xd8e2e8, roughness: 0.35, emissive: 0x1a2228, side: THREE.DoubleSide }), MAXH, 'ghost-hands');
      this.root.add(this.hands.im);
    }
    return this.hands;
  }
  _put(P, x, y, z, yaw, o = {}) {
    const it = P.items[P.next]; P.next = (P.next + 1) % P.items.length;
    _e.set(o.rx ?? 0, yaw, o.rz ?? 0); _q.setFromEuler(_e); _s.setScalar(o.s ?? 1);
    if (o.mirror) _s.x *= -1;
    P.im.setMatrixAt(it.i, _m4.compose(_p.set(x, y, z), _q, _s));
    P.im.instanceMatrix.needsUpdate = true;
    P.im.count = Math.max(P.im.count, it.i + 1);
    Object.assign(it, { on: true, t: 0, alpha: 0, target: o.alpha ?? 0.8, life: o.life ?? 30, fade: o.fade ?? 0.35 });
    P.a.array[it.i] = 0; P.a.needsUpdate = true;
    return it;
  }
  // 一個濕腳印(x,z 地面;yaw 前進方向;left 左腳)
  foot(x, y, z, yaw, left, o = {}) { const ox = Math.cos(yaw) * (left ? -0.1 : 0.1), oz = -Math.sin(yaw) * (left ? -0.1 : 0.1); return this._put(this._feet(), x + ox, y + 0.012, z + oz, yaw + Math.PI, { mirror: left, life: o.life ?? 26, alpha: 0.75, fade: 0.25 }); }
  // 玻璃上的手印(nx,nz = 玻璃朝玩家那面的法線)
  hand(x, y, z, nx, nz, o = {}) { return this._put(this._hands(), x + nx * 0.012, y, z + nz * 0.012, Math.atan2(nx, nz), { rz: (Math.random() - 0.5) * 0.6, s: o.s ?? (0.85 + Math.random() * 0.3), mirror: Math.random() < 0.5, life: o.life ?? 40, alpha: 0.55, fade: 0.6 }); }
  // 牆上的字(w = WRITINGS 的一筆;x,y,z 牆面上的中心;nx,nz 牆的法線)
  write(w, x, y, z, nx, nz, o = {}) {
    let m = o.keep ? null : this.writes[this.wIdx];
    const seed = [...w.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
    const c = writingCanvas(w.text, w.style, seed);
    const t = tex(c);
    const hgt = (w.size ?? 0.2) * (c.height / 96) * 0.82, wid = hgt * c.width / c.height;
    if (!m) {
      m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ name: 'ghost-writing', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.85 }));
      m.castShadow = false; m.receiveShadow = false; m.raycast = () => {};
      m.name = 'ghost-writing';
      this.root.add(m);
      if (o.keep) (this.statics ||= []).push(m); else this.writes[this.wIdx] = m;
    } else m.material.map?.dispose();
    if (!o.keep) this.wIdx = (this.wIdx + 1) % MAXW;
    m.material.map = t; m.material.roughness = w.style === 'paint' || w.style === 'smear' ? 0.45 : 0.9; m.material.needsUpdate = true;
    m.material.opacity = o.alpha ?? 1;
    m.scale.set(wid, hgt, 1);
    m.position.set(x + nx * 0.008, y, z + nz * 0.008);
    m.rotation.set(0, Math.atan2(nx, nz), (Math.random() - 0.5) * 0.08);
    m.visible = true;
    m.userData.w = w;
    if (o.fadeIn) { m.material.opacity = 0; this.fx.push({ type: 'fadein', m, t: 0, dur: o.fadeIn, to: o.alpha ?? 1 }); }
    return m;
  }
  // 門縫下的光與走過的影子:門中心 (x,z)、門寬方向 (ux,uz)、朝玩家的法線 (nx,nz)
  _strip() {
    if (!this.strip) {
      this.strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        uniforms: { uK: { value: 0 }, uS: { value: -1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uK; uniform float uS; varying vec2 vUv; void main(){ float edge = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x); float fall = pow(1.0-vUv.y, 2.2); float sh = 1.0 - smoothstep(0.16, 0.04, abs(vUv.x - uS)) * 0.95; gl_FragColor = vec4(vec3(1.0,0.78,0.5) * fall * edge * sh * uK, 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, name: 'ghost-strip',
      }));
      this.strip.raycast = () => {}; this.strip.frustumCulled = false;
      this.root.add(this.strip);
    }
    return this.strip;
  }
  underDoor(x, y, z, ux, uz, nx, nz, dur = 5) {
    const m = this._strip();
    // 平面躺在地上:本地 X 沿門寬、本地 +Y 從門縫往玩家(亮邊在門縫那側)
    let X = new THREE.Vector3(ux, 0, uz).normalize();
    const Y = new THREE.Vector3(nx, 0, nz).normalize();
    if (X.z * Y.x - X.x * Y.z < 0) X = X.negate();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    m.scale.set(0.95, 0.5, 1);
    m.position.set(x + nx * 0.25, y + 0.006, z + nz * 0.25);
    m.visible = true;
    this.fx.push({ type: 'strip', m, t: 0, dur });
  }
  // 隔簾上的人影 / 鏡子裡的臉:x,y,z 中心、nx,nz 朝向玩家;w,h 尺寸;回傳效果物件(可呼叫 end())
  _sil(kind) {
    const key = kind === 'face' ? 'faceM' : 'curtM';
    if (!this[key]) {
      const c = silhouetteCanvas(kind);
      const mat = kind === 'face'
        ? new THREE.MeshBasicMaterial({ name: 'ghost-face', map: tex(c), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: true })
        : new THREE.MeshBasicMaterial({ name: 'ghost-curtain', map: tex(c), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, fog: true });
      this[key] = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      this[key].raycast = () => {}; this[key].frustumCulled = false;
      this.root.add(this[key]);
    }
    return this[key];
  }
  silhouette(kind, x, y, z, nx, nz, w, h, dur = 5) {
    const m = this._sil(kind);
    m.scale.set(w, h, 1);
    const off = kind === 'face' ? 0.012 : 0.1; // 隔簾有皺褶(±6cm),剪影要貼在皺褶外面
    m.position.set(x + nx * off, y, z + nz * off);
    m.rotation.set(0, Math.atan2(nx, nz), 0);
    m.visible = true;
    const e = { type: 'sil', m, t: 0, dur, peak: kind === 'face' ? 0.85 : 0.8, out: -1, x, z, kind, end() { if (this.out < 0) this.out = 0; } };
    this.fx.push(e);
    return e;
  }
  // 電視雜訊裡的臉:螢幕中心、法線、寬高
  _tv() {
    if (!this.tv) {
      const c = document.createElement('canvas'); c.width = 96; c.height = 72;
      const t = tex(c); t.colorSpace = THREE.SRGBColorSpace;
      this.tv = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ name: 'ghost-tv', map: t, toneMapped: false, fog: true }));
      this.tv.userData.c = c; this.tv.raycast = () => {};
      this.root.add(this.tv);
    }
    return this.tv;
  }
  tvFace(x, y, z, nx, nz, w, h, dur = 2.6) {
    const m = this._tv();
    m.scale.set(w, h, 1);
    m.position.set(x + nx * 0.012, y, z + nz * 0.012);
    m.rotation.set(0, Math.atan2(nx, nz), 0);
    m.visible = true;
    this.fx.push({ type: 'tv', m, t: 0, dur, k: 0 });
  }
  // 電梯門縫透出的光(門中心、朝外法線)
  _lift() {
    if (!this.lift) {
      this.lift = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ name: 'ghost-lift', color: 0xfff0d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      this.lift.raycast = () => {};
      this.root.add(this.lift);
    }
    return this.lift;
  }
  liftGlow(x, y, z, nx, nz, dur = 7) {
    const m = this._lift();
    m.scale.set(0.05, 2.15, 1);
    m.position.set(x + nx * 0.06, y + 1.1, z + nz * 0.06);
    m.rotation.set(0, Math.atan2(nx, nz), 0);
    m.visible = true;
    this.fx.push({ type: 'lift', m, t: 0, dur });
  }
  clear() {
    for (const P of [this.feet, this.hands]) if (P) { for (const it of P.items) { it.on = false; P.a.array[it.i] = 0; } P.a.needsUpdate = true; P.im.count = 0; }
    for (const m of this.writes) if (m) m.visible = false;
    for (const e of this.fx) e.m.visible = false;
    this.fx.length = 0;
  }
  update(dt) {
    for (const P of [this.feet, this.hands]) {
      if (!P) continue;
      let dirty = false;
      for (const it of P.items) {
        if (!it.on) continue;
        it.t += dt;
        const a = it.t < it.fade ? it.target * (it.t / it.fade) : it.t > it.life ? Math.max(0, it.target * (1 - (it.t - it.life) / 4)) : it.target;
        if (Math.abs(a - P.a.array[it.i]) > 0.004) { P.a.array[it.i] = a; dirty = true; }
        if (it.t > it.life + 4) it.on = false;
      }
      if (dirty) P.a.needsUpdate = true;
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      e.t += dt;
      const u = e.t / e.dur;
      if (e.type === 'fadein') { e.m.material.opacity = Math.min(e.to, e.to * (e.t / e.dur)); if (u >= 1) this.fx.splice(i, 1); continue; }
      if (e.type === 'strip') {
        const k = Math.min(1, e.t / 0.6) * Math.min(1, Math.max(0, (e.dur - e.t) / 0.8));
        e.m.material.uniforms.uK.value = k * 0.9;
        e.m.material.uniforms.uS.value = u < 0.3 ? -1 : -0.3 + (u - 0.3) / 0.35 * 1.6; // 影子從一邊走到另一邊
        if (u >= 1) { e.m.visible = false; this.fx.splice(i, 1); }
        continue;
      }
      if (e.type === 'sil') {
        let k = Math.min(1, e.t / (e.kind === 'face' ? 0.35 : 0.9));
        if (e.out >= 0) { e.out += dt; k = Math.max(0, 1 - e.out / 0.35); }
        else if (u >= 1) e.out = 0;
        e.m.material.opacity = k * e.peak * (0.85 + 0.15 * Math.sin(e.t * 9));
        if (e.out >= 0.35) { e.m.visible = false; this.fx.splice(i, 1); }
        continue;
      }
      if (e.type === 'tv') {
        e.k += dt;
        if (e.k > 1 / 15) { e.k = 0; drawTV(e.m.userData.c, Math.min(1, Math.max(0, (u - 0.15) / 0.5))); e.m.material.map.needsUpdate = true; }
        if (u >= 1) { e.m.visible = false; this.fx.splice(i, 1); }
        continue;
      }
      if (e.type === 'lift') {
        const k = u < 0.35 ? 0 : Math.min(1, (u - 0.35) / 0.1) * Math.min(1, (1 - u) / 0.15);
        e.m.material.opacity = k * 0.9;
        e.m.scale.x = 0.02 + k * 0.06;
        if (u >= 1) { e.m.visible = false; this.fx.splice(i, 1); }
      }
    }
  }
  // 場景佈置:一開始就在牆上的字(依 WRITINGS 的 static 項目,擺在該區的實牆上)
  placeStatic(K, L) {
    if (!K?.faces) return 0;
    let n = 0;
    const SOLID = (ch) => ch === '#' || ch === 'E';
    for (const w of WRITINGS) {
      if (w.kind !== 'static') continue;
      const faces = K.faces.filter((f) => f.kind === 'room' && f.zone?.id === w.zone && !f.win && f.a1 - f.a0 >= 2.2);
      let seed = [...w.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11);
      const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      faces.sort((a, b) => (b.a1 - b.a0) - (a.a1 - a.a0));
      let done = false;
      for (const f of faces.slice(0, 6)) {
        for (let k = 0; k < 8 && !done; k++) {
          const a = f.a0 + 0.9 + r() * Math.max(0.01, f.a1 - f.a0 - 1.8);
          const isH = f.dir === 'N' || f.dir === 'S';
          const c = isH ? Math.floor(a / 2) : f.c, rr = isH ? f.r : Math.floor(a / 2);
          if (!SOLID(L.charAt(f.li, c, rr)) || !SOLID(L.charAt(f.li, isH ? Math.floor((a - 0.7) / 2) : f.c, isH ? f.r : Math.floor((a - 0.7) / 2))) || !SOLID(L.charAt(f.li, isH ? Math.floor((a + 0.7) / 2) : f.c, isH ? f.r : Math.floor((a + 0.7) / 2)))) continue;
          const x = isH ? a : f.fixed, z = isH ? f.fixed : a;
          const m = this.write(w, x, f.y + (w.h ?? 1.5), z, f.nx, f.nz, { keep: true });
          m.userData.static = true;
          done = true; n++;
        }
        if (done) break;
      }
    }
    return n;
  }
}
// 電視雜訊:k 0..1 = 臉浮現的程度
function drawTV(c, k) {
  const x = c.getContext('2d'), W = c.width, H = c.height;
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i - W / 2) / (W * 0.18), v = (j - H * 0.5) / (H * 0.36);
    const r2 = u * u + v * v;
    let face = r2 < 1 ? 1 : 0; // 頭
    const ex = Math.abs(u) - 0.42, ey = v + 0.18;
    if (ex * ex + ey * ey * 1.6 < 0.05) face = -1; // 眼窩
    if (Math.abs(u) < 0.25 && Math.abs(v - 0.5) < 0.07) face = -0.7; // 嘴
    const n = Math.random() * 255;
    let val = n * (1 - k * 0.55) + (face > 0 ? 170 : face < 0 ? 15 : 60) * k * 0.55;
    if (j % 3 === 0) val *= 0.8;
    const p = (j * W + i) * 4;
    d[p] = val * 0.92; d[p + 1] = val; d[p + 2] = val * 1.05; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
}
