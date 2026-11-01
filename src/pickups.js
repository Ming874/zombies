import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from './weapons/weapon.js';
import { sfx } from './audio.js';
import { hpMul } from './game/waves.js';
import { precompile } from './sys/warmup.js';

// 殭屍掉落物(彈藥箱、大彈藥箱、醫療包、手榴彈)與補給點(彈藥櫃、醫療櫃)。
// 掉落時從屍體彈出一道拋物線落地,之後懸浮旋轉;地面發光圓環 + 淡淡光柱方便在黑暗中找到。
// 走近自動撿取(支援多樓層:比對腳下高度);滿了就不撿。不使用任何動態光源。

// ---------- 掉落數值(集中調整) ----------
// ammo / med / grenade 為每次擊殺的機率;big = 必掉大彈藥箱(取代一般彈藥)
// [w4 經濟] 手榴彈掉落 ×2 左右(焦屍、膿腫者、清理隊員都在要求爆炸;補給櫃與開場彈匣收緊了,火力改從地上撿);
// 第三波的新類型各自有一列(以前全部套行屍)
export const DROP_TABLE = {
  walker: { ammo: 0.16, med: 0.045, grenade: 0.026 },
  runner: { ammo: 0.18, med: 0.05, grenade: 0.03 },
  crawler: { ammo: 0.16, med: 0.05, grenade: 0.026 },
  bloater: { ammo: 0.3, med: 0.12, grenade: 0.12 },
  brute: { ammo: 0, med: 0.7, grenade: 0.75, big: true },
  screamer: { ammo: 0.18, med: 0.06, grenade: 0.04 },
  stalker: { ammo: 0.22, med: 0.06, grenade: 0.04 },
  surgeon: { ammo: 0.2, med: 0.12, grenade: 0.03 },
  burned: { ammo: 0.2, med: 0.05, grenade: 0.07 },
  hazmat: { ammo: 0.34, med: 0.1, grenade: 0.12 },
  straitjacket: { ammo: 0.2, med: 0.06, grenade: 0.03 },
};

export const DROP_RULES = {
  lowAmmo: 1.5, // 目前武器 彈匣+備彈 少於 1.5 個彈匣…
  lowAmmoMul: 2.5, // …彈藥機率 ×2.5
  noAmmoMul: 4, // 備彈用完時 ×4
  pity: 10, // 仁慈機制:連續 10 殺沒掉彈藥 → 必掉
  lowHp: 0.4, // 血量低於 40%…
  lowHpMul: 2.2, // …醫療包機率 ×2.2
  critHp: 0.2, // 低於 20%…
  critHpMul: 3.5, // …×3.5
  medPity: 8, // 血量低於一半時,連續 8 殺沒掉醫療包 → 必掉
  medMax: 4, // 地上未撿的醫療包上限(避免洗版)
  heal: 35, // 醫療包回復量(滿血時改為收進背包)
  grenadeCap: 6, medkitCap: 3,
  life: 40, // 存在秒數(地圖大,給玩家時間繞回來撿)
  blink: 8, // 最後幾秒閃爍(地面光圈同時縮小)
  reach: 1.25, // 自動撿取水平距離
  reachY: 1.2, // 撿取高度差(多樓層)
  magnet: 2.6, // 磁吸距離:用得到的掉落物在這個距離內會飛向玩家(同樓層、看得到)
  lateAmmo: 0.5, // 後期殭屍血量變多:彈藥機率 × (1 + 0.5 × (血量倍率 − 1))
  max: 32, // 場上上限,超過時移除最舊的
};

// 外觀:光色、圓環/光柱大小、懸浮高度、模型縮放
const LOOK = {
  mag: { color: 0xffa52e, css: '#ffc35a', ring: 1.3, beam: 2.5, beamW: 0.55, glow: 0.95, hover: 0.48, scale: 1.75 },
  ammo: { color: 0xffa52e, css: '#ffc35a', ring: 1.3, beam: 2.5, beamW: 0.55, glow: 0.95, hover: 0.42, scale: 1.12 },
  bigammo: { color: 0xffb83a, css: '#ffd27a', ring: 1.9, beam: 3.4, beamW: 0.8, glow: 1.4, hover: 0.5, scale: 1.08 },
  med: { color: 0x3cff86, css: '#7dffae', ring: 1.3, beam: 2.5, beamW: 0.55, glow: 0.95, hover: 0.44, scale: 1.1 },
  grenade: { color: 0xe0ff6a, css: '#e4f58a', ring: 1.1, beam: 2.2, beamW: 0.45, glow: 0.8, hover: 0.4, scale: 2.1 },
};
// 彈匣容量(套用改裝):武器系統有 stat() 就用
const magOf = (w, id) => (typeof w.stat === 'function' ? Math.round(w.stat(id, 'mag')) || WEAPONS[id].mag : Math.round(WEAPONS[id].mag * (w.mods?.[id]?.mag ?? 1)));

const FLY = 0.62; // 拋物線飛行時間
const ARC = 0.75; // 拋物線額外高度
const SETTLE = 0.28; // 落地小彈跳時間
const RISE = 0.75; // 浮起時間

// 音效:武器代理會在 audio 裡實作 pickupAmmo / pickupMed / pickupDeny;未合併前退回現有音效
const say = (name, fallback, ...a) => (sfx[name] || sfx[fallback])?.(...a);

// ---------- 程式貼圖 ----------
let seed = 7331;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const rr = (a, b) => a + rnd() * (b - a);

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function blot(x, S, n, r0, r1, rgb, a0, a1) {
  for (let i = 0; i < n; i++) {
    const px = rnd() * S, py = rnd() * S, r = rr(r0, r1);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${rgb},${rr(a0, a1)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

function grain(x, S, amt) {
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

// 沿貼圖邊緣取點(每個面的 UV 都是 0..1,貼圖邊 = 面的邊 → 邊角磨損)
function edgePt(S, depth) {
  const side = (rnd() * 4) | 0, t = rnd() * S, d = Math.pow(rnd(), 2) * depth;
  return side === 0 ? [t, d] : side === 1 ? [t, S - d] : side === 2 ? [d, t] : [S - d, t];
}

// 烤漆金屬:斑駁、刮痕、邊角掉漆、底部污垢
function paintTex(base, chips = 120) {
  const S = 256;
  const [c, x] = cv(S, S);
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  blot(x, S, 26, 10, 50, '255,255,225', 0.03, 0.08);
  blot(x, S, 30, 12, 60, '18,20,8', 0.05, 0.14);
  const g = x.createLinearGradient(0, S * 0.5, 0, S);
  g.addColorStop(0, 'rgba(32,26,14,0)');
  g.addColorStop(1, 'rgba(32,26,14,0.5)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(185,182,160,${rr(0.12, 0.4)})`;
    x.lineWidth = rr(0.5, 1.2);
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.28, l = rr(4, 34);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  for (let i = 0; i < chips; i++) {
    const [px, py] = edgePt(S, 14), r = rr(1, 4.5);
    x.fillStyle = `rgba(70,48,28,${rr(0.4, 0.7)})`; // 鏽圈
    x.beginPath();
    x.ellipse(px, py, r * 1.5, r * 1.2, rnd() * 3, 0, 6.28);
    x.fill();
    x.fillStyle = `rgba(128,126,114,${rr(0.6, 0.95)})`; // 裸金屬
    x.beginPath();
    x.ellipse(px, py, r, r * 0.7, rnd() * 3, 0, 6.28);
    x.fill();
  }
  grain(x, S, 16);
  return toTex(c);
}

// 白色硬殼塑膠:污漬、磨痕,一角有乾掉的血手印
function shellTex() {
  const S = 256;
  const [c, x] = cv(S, S);
  x.fillStyle = '#e2dfd4';
  x.fillRect(0, 0, S, S);
  blot(x, S, 24, 12, 60, '120,110,90', 0.03, 0.08);
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, 'rgba(70,60,45,0)');
  g.addColorStop(1, 'rgba(70,60,45,0.35)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) {
    x.strokeStyle = `rgba(90,85,75,${rr(0.08, 0.25)})`;
    x.lineWidth = rr(0.5, 1.5);
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.28, l = rr(5, 30);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  // 沾血的手抓過留下的拖痕:四道指痕往斜下拖 + 掌緣 + 噴濺
  const bx = S * 0.74, by = S * 0.2;
  x.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const sx = bx + k * 11 + rr(-2, 2), sy = by + Math.abs(k - 1.6) * 5, len = rr(34, 62);
    for (let n = 0; n < 7; n++) {
      x.strokeStyle = `rgba(88,9,7,${rr(0.07, 0.2)})`;
      x.lineWidth = rr(2, 6.5) * (1 - n * 0.07);
      x.beginPath();
      x.moveTo(sx + rr(-1.5, 1.5), sy + rr(0, 4));
      x.quadraticCurveTo(sx - len * 0.12, sy + len * 0.5, sx - len * rr(0.2, 0.3), sy + len * rr(0.75, 1));
      x.stroke();
    }
  }
  blot(x, S, 5, 4, 12, '84,8,6', 0.2, 0.45);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(80,8,6,${rr(0.25, 0.6)})`;
    x.beginPath();
    x.arc(bx + rr(-30, 60), by + rr(-20, 70), rr(0.5, 2), 0, 6.28);
    x.fill();
  }
  grain(x, S, 10);
  return toTex(c);
}

const BRIDGE = 'ABDOPQRU0689';
// 模板噴字:per-char 繪製,圓形字母切出模板橋,噴漆邊緣、剝落
function stencilTex(lines, color, { bridges = true, wear = 1 } = {}, W = 512, H = 256) {
  const [c, x] = cv(W, H);
  x.textBaseline = 'middle';
  x.textAlign = 'center';
  for (const [txt, size, yy] of lines) {
    x.font = `700 ${size}px Impact, "Arial Narrow", "Microsoft JhengHei", sans-serif`;
    const chars = [...txt], gap = size * 0.08;
    const ws = chars.map((ch) => x.measureText(ch).width + gap);
    let px = W / 2 - ws.reduce((s, v) => s + v, 0) / 2;
    const py = yy * H;
    chars.forEach((ch, i) => {
      const cx = px + ws[i] / 2;
      x.save();
      x.fillStyle = color;
      x.shadowColor = color;
      x.shadowBlur = 2.5;
      x.fillText(ch, cx, py);
      x.restore();
      if (bridges && BRIDGE.includes(ch)) {
        x.save();
        x.globalCompositeOperation = 'destination-out';
        x.fillRect(cx - size * 0.035, py - size * 0.7, size * 0.07, size * 1.4);
        x.restore();
      }
      px += ws[i];
    });
  }
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600 * wear; i++) {
    x.globalAlpha = rr(0.2, 0.9);
    x.fillRect(rnd() * W, rnd() * H, rr(1, 4), rr(1, 3));
  }
  for (let i = 0; i < 18 * wear; i++) { // 刮痕
    x.globalAlpha = rr(0.5, 1);
    x.lineWidth = rr(1, 2.5);
    const px = rnd() * W, py = rnd() * H, a = rr(-0.6, 0.6);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * rr(20, 90), py + Math.sin(a) * rr(10, 40));
    x.stroke();
  }
  return toTex(c);
}

// 地面發光圓環(白色,由材質上色)
function ringTex() {
  const S = 256, h = S / 2;
  const [c, x] = cv(S, S);
  const g = x.createRadialGradient(h, h, 0, h, h, h * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = '#fff';
  x.shadowColor = '#fff';
  x.shadowBlur = 10;
  x.lineWidth = h * 0.05;
  x.beginPath();
  x.arc(h, h, h * 0.62, 0, 6.2832);
  x.stroke();
  x.lineWidth = h * 0.028;
  x.globalAlpha = 0.85;
  for (let i = 0; i < 12; i++) { // 外圈刻度
    const a = (i / 12) * 6.2832;
    x.beginPath();
    x.arc(h, h, h * 0.82, a, a + 0.32);
    x.stroke();
  }
  return toTex(c);
}

// 垂直光柱:水平高斯 + 由下往上淡出,帶細微條紋
function beamTex() {
  const W = 64, H = 256;
  const [c, x] = cv(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const streak = Array.from({ length: W }, () => 0.75 + rnd() * 0.25);
  for (let j = 0; j < H; j++) {
    const v = 1 - j / H; // 0 = 底部
    const vf = Math.pow(1 - v, 1.7) * Math.min(1, v * 14 + 0.25);
    for (let i = 0; i < W; i++) {
      const u = (i / (W - 1)) * 2 - 1;
      const a = (Math.exp(-u * u * 9) * 0.55 + Math.exp(-u * u * 60) * 0.45) * vf * streak[i];
      const k = (j * W + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.min(255, a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return toTex(c);
}

function glowTex() {
  const S = 128, h = S / 2;
  const [c, x] = cv(S, S);
  const g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return toTex(c);
}

// ---------- 幾何工具 ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  g.clearGroups();
  return g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one));
}
const rbox = (w, h, d, r = 0.004, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);
const cyl = (r, l, n = 12) => new THREE.CylinderGeometry(r, r, l, n);
function tube(pts, r, n = 24) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), n, r, 6);
}
function mesh(parts, mat, shadow = true) {
  const m = new THREE.Mesh(mergeGeometries(parts), mat);
  m.castShadow = shadow;
  return m;
}
function decal(w, h, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.renderOrder = 1;
  return m;
}

// ---------- 共用材質 / 模型樣板(第一次用到時建立) ----------
const R = {};

function shared() {
  if (R.ready) return R;
  R.ready = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const decalMat = (map, emissive) => std({
    map, transparent: true, depthWrite: false, roughness: 0.75, metalness: 0.1,
    emissive, emissiveMap: map, emissiveIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  R.mat = {
    olive: std({ map: paintTex('#4a5233'), roughness: 0.64, metalness: 0.35 }),
    yellow: std({ map: paintTex('#a88a2a', 60), roughness: 0.6, metalness: 0.25 }),
    steel: std({ color: 0x3e403c, roughness: 0.38, metalness: 0.9 }),
    rubber: std({ color: 0x141412, roughness: 0.92 }),
    mag: std({ color: 0x2a2c30, roughness: 0.45, metalness: 0.6 }), // 鋁合金彈匣(黑色陽極)
    pmag: std({ color: 0x8a7652, roughness: 0.7 }), // 聚合物彈匣(沙色)
    strap: std({ color: 0x7a6a48, roughness: 0.95 }),
    brass: std({ color: 0xc89b44, roughness: 0.28, metalness: 1 }),
    copper: std({ color: 0xa8603a, roughness: 0.32, metalness: 1 }),
    shell: std({ map: shellTex(), roughness: 0.36, metalness: 0 }),
    red: std({ color: 0xb3121a, roughness: 0.42, emissive: 0x5a0408, emissiveIntensity: 0.5 }),
    plastic: std({ color: 0x2a2c2e, roughness: 0.55 }),
    stencilS: decalMat(stencilTex([['CTG 5.56MM M855', 54, 0.27], ['840 RDS  BALL', 46, 0.53], ['LOT  LC-24K113-007', 30, 0.78]], '#d6c15a'), 0x6a5a20),
    stencilB: decalMat(stencilTex([['AMMUNITION', 66, 0.25], ['7.62MM · 5.56MM · 9MM', 36, 0.52], ['彈藥補給  M2A1', 34, 0.77]], '#dccb6a'), 0x6a5a20),
    label: decalMat(stencilTex([['大新® 居家急救包', 46, 0.3], ['FIRST AID KIT', 60, 0.7]], '#a8121a', { bridges: false, wear: 0.35 }), 0x400004), // 正典:回神居家急救包
  };
  R.tex = { ring: ringTex(), beam: beamTex(), glow: glowTex() };
  R.geo = {
    ring: new THREE.PlaneGeometry(1, 1),
    beam: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
  };
  R.proto = {
    ring: new THREE.MeshBasicMaterial({ map: R.tex.ring, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    beam: new THREE.MeshBasicMaterial({ map: R.tex.beam, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    glow: new THREE.SpriteMaterial({ map: R.tex.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  R.mat.grenade = std({ map: grenadeTex(), roughness: 0.62, metalness: 0.25 });
  R.mat.fuze = std({ color: 0x5c5f58, roughness: 0.42, metalness: 0.85 });
  R.tmpl = { mag: buildMagPack(), ammo: buildAmmoCan(), bigammo: buildBigCrate(), med: buildMedkit(), grenade: buildGrenade() };
  return R;
}

// 模型樣板的複本(商店展示櫃、UI 預覽用);userData.half = 中心到底部的距離
export function pickupModel(kind) {
  shared();
  const t = R.tmpl[kind];
  if (!t) return null;
  const g = t.group.clone();
  g.userData.half = t.half;
  return g;
}

// M67 破片手榴彈:橄欖綠球體(黃色識別帶 + 模板字)、引信座、保險握片、拉環與插銷
function grenadeTex() {
  const S = 256;
  const [c, x] = cv(S, S);
  x.fillStyle = '#4b5434'; x.fillRect(0, 0, S, S);
  blot(x, S, 30, 8, 40, '20,24,10', 0.06, 0.16);
  blot(x, S, 20, 8, 30, '200,200,160', 0.03, 0.08);
  x.fillStyle = '#c9a72a'; x.fillRect(0, S * 0.36, S, S * 0.05); // 黃色識別帶(球體 UV 的赤道附近)
  x.fillStyle = 'rgba(230,220,150,.85)'; x.font = '700 15px Impact, "Arial Narrow", sans-serif'; x.textAlign = 'center';
  x.fillText('GRENADE HAND FRAG M67', S * 0.5, S * 0.5);
  x.fillText('LOT 12-07', S * 0.5, S * 0.57);
  for (let i = 0; i < 70; i++) { // 刮痕
    x.strokeStyle = `rgba(150,150,120,${rr(0.1, 0.35)})`; x.lineWidth = rr(0.5, 1.2);
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.28, l = rr(3, 16);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  grain(x, S, 14);
  return toTex(c);
}
function buildGrenade() {
  const M = R.mat;
  const body = new THREE.SphereGeometry(0.032, 20, 14);
  body.scale(1, 1.1, 1);
  const fz = [], lever = [], ring = [];
  fz.push(at(cyl(0.0125, 0.026, 14), 0, 0.044)); // 引信座
  fz.push(at(cyl(0.0095, 0.012, 12), 0, 0.061));
  fz.push(at(cyl(0.004, 0.032, 8), 0, 0.053, 0, 0, 0, Math.PI / 2)); // 插銷
  // 保險握片:沿球體側面往下彎
  lever.push(at(tube([[0.004, 0.066, 0], [0.018, 0.064, 0], [0.03, 0.05, 0], [0.037, 0.025, 0], [0.038, 0, 0], [0.034, -0.018, 0]], 0.0035, 18)));
  lever.push(at(rbox(0.008, 0.06, 0.012, 0.002, 1), 0.036, 0.012, 0, 0, 0, -0.08));
  ring.push(at(new THREE.TorusGeometry(0.0125, 0.0018, 6, 18), -0.022, 0.053, 0, 0, Math.PI / 2, 0));
  const g = new THREE.Group();
  const b = new THREE.Mesh(body, M.grenade);
  b.castShadow = true;
  g.add(b, mesh(fz, M.fuze), mesh(lever, M.olive), mesh(ring, M.steel));
  return { group: g, half: 0.035 };
}

// 軍綠色金屬彈藥箱(M19A1 風格):箱蓋、密封膠條、壓筋、鉸鏈、側邊凸輪扣環、提把、模板噴字
// 原點在箱體中心,回傳 { group, half: 中心到底部的距離 }
function canParts(L, H, W, big) {
  const M = R.mat, olive = [], steel = [], rubber = [];
  const lidH = big ? 0.036 : 0.03, bodyTop = H / 2 - lidH;
  olive.push(at(rbox(L, H - lidH, W, big ? 0.014 : 0.011), 0, -lidH / 2));
  olive.push(at(rbox(L + 0.008, lidH, W + 0.008, 0.009), 0, bodyTop + lidH / 2));
  olive.push(at(rbox(L - 0.07, 0.006, W - 0.045, 0.003, 1), 0, H / 2 + 0.002)); // 箱蓋壓印凸面
  rubber.push(at(new THREE.BoxGeometry(L - 0.004, 0.006, W - 0.004), 0, bodyTop - 0.001)); // 密封膠條
  for (const s of [-1, 1]) {
    olive.push(at(rbox(L - 0.05, 0.011, 0.006, 0.0025, 1), 0, -H / 2 + (big ? 0.012 : 0.016), s * (W / 2 + 0.0012))); // 長邊壓筋
    for (const zz of [-1, 1]) olive.push(at(rbox(0.007, H - lidH - 0.05, 0.012, 0.003, 1), s * (L / 2 + 0.0015), -lidH / 2 - 0.006, zz * W * 0.26)); // 端面壓筋
  }
  // 鉸鏈(-X 端)
  steel.push(at(cyl(0.0075, W - 0.03), -L / 2 - 0.006, bodyTop + 0.004, 0, Math.PI / 2));
  for (const zz of [-0.32, 0, 0.32]) olive.push(at(rbox(0.012, 0.022, W * 0.18, 0.003, 1), -L / 2 - 0.004, bodyTop - 0.004, zz * W));
  // 凸輪扣環(+X 端):扣片 + 轉軸 + 下方掛鉤
  olive.push(at(rbox(0.009, H * 0.58, W * 0.36, 0.003, 1), L / 2 + 0.011, bodyTop - H * 0.27, 0, 0, 0, -0.05));
  olive.push(at(rbox(0.014, 0.018, W * 0.4, 0.004, 1), L / 2 + 0.013, bodyTop - H * 0.56, 0)); // 扣片末端加厚
  steel.push(at(cyl(0.0065, W * 0.44), L / 2 + 0.011, bodyTop + 0.006, 0, Math.PI / 2));
  steel.push(at(rbox(0.01, 0.016, W * 0.24, 0.003, 1), L / 2 + 0.005, -H * 0.36, 0));
  return { olive, steel, rubber, bodyTop };
}

function buildAmmoCan() {
  const M = R.mat, L = 0.3, H = 0.19, W = 0.13;
  const { olive, steel, rubber } = canParts(L, H, W, false);
  // 提把:立起的鋼線提把 + 箱蓋上的固定耳
  const top = H / 2;
  steel.push(at(tube([[-0.072, top + 0.004, 0], [-0.066, top + 0.03, 0], [-0.04, top + 0.04, 0], [0.04, top + 0.04, 0], [0.066, top + 0.03, 0], [0.072, top + 0.004, 0]], 0.0055)));
  for (const s of [-1, 1]) olive.push(at(rbox(0.02, 0.012, 0.024, 0.003, 1), s * 0.072, top + 0.004));
  rubber.push(at(cyl(0.0085, 0.07, 10), 0, top + 0.04, 0, 0, 0, Math.PI / 2)); // 提把握套
  const g = new THREE.Group();
  g.add(mesh(olive, M.olive), mesh(steel, M.steel), mesh(rubber, M.rubber));
  for (const s of [-1, 1]) g.add(decal(0.24, 0.12, M.stencilS, 0, -0.005, s * (W / 2 + 0.0035), s > 0 ? 0 : Math.PI));
  return { group: g, half: H / 2 };
}

// STANAG 彈匣側面輪廓(x = 前後, y = 長度,頂端為供彈口),擠出厚度 = z
function magParts() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.064, 0);
  s.quadraticCurveTo(0.067, -0.09, 0.082, -0.172);
  s.lineTo(0.088, -0.186);
  s.lineTo(0.024, -0.19);
  s.lineTo(0.021, -0.176);
  s.quadraticCurveTo(0.006, -0.09, 0, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 1, curveSegments: 10 });
  body.translate(0, 0, -0.011);
  // 供彈口上的兩發子彈(彈殼 + 彈頭朝前)
  const brass = [at(cyl(0.0046, 0.042, 10), 0.03, 0.0035, -0.004, 0, 0, Math.PI / 2), at(cyl(0.0046, 0.042, 10), 0.028, -0.004, 0.004, 0, 0, Math.PI / 2)];
  const tip = [at(new THREE.ConeGeometry(0.0042, 0.016, 10), 0.059, 0.0035, -0.004, 0, 0, -Math.PI / 2), at(new THREE.ConeGeometry(0.0042, 0.016, 10), 0.057, -0.004, 0.004, 0, 0, -Math.PI / 2)];
  return { body: at(body), brass, tip };
}

// 彈匣包(殭屍最常掉的彈藥):兩個 STANAG 彈匣(黑色鋁 + 沙色聚合物)並排、尼龍綁帶綁在一起,供彈口露出子彈
function buildMagPack() {
  const M = R.mat, mag = [], pmag = [], brass = [], copper = [], strap = [];
  [-1, 1].forEach((s, k) => {
    const P = magParts();
    const place = new THREE.Matrix4().makeTranslation(-0.044 + (k ? 0.004 : 0), 0.095 - (k ? 0.006 : 0), s * 0.0128);
    (k ? pmag : mag).push(P.body.applyMatrix4(place));
    for (const g of P.brass) brass.push(g.applyMatrix4(place));
    for (const g of P.tip) copper.push(g.applyMatrix4(place));
  });
  for (const y of [0.03, -0.045]) { // 兩條綁帶
    strap.push(at(new THREE.BoxGeometry(0.084, 0.018, 0.058), 0.004, y, 0));
  }
  const g = new THREE.Group();
  g.add(mesh(mag, M.mag), mesh(pmag, M.pmag), mesh(brass, M.brass), mesh(copper, M.copper), mesh(strap, M.strap));
  return { group: g, half: 0.098 };
}

// 大彈藥箱(M2A1 風格,更大):黃色識別帶、兩端繩把、箱蓋上綁著兩個 M4 彈匣
function buildBigCrate() {
  const M = R.mat, L = 0.48, H = 0.27, W = 0.22;
  const { olive, steel, rubber } = canParts(L, H, W, true);
  const yellow = [at(rbox(L + 0.005, 0.026, W + 0.005, 0.004, 1), 0, 0.075)];
  const strap = [];
  for (const s of [-1, 1]) { // 端面繩把
    strap.push(at(tube([[s * (L / 2 + 0.006), H * 0.02, -0.07], [s * (L / 2 + 0.03), -H * 0.06, -0.045], [s * (L / 2 + 0.036), -H * 0.1, 0], [s * (L / 2 + 0.03), -H * 0.06, 0.045], [s * (L / 2 + 0.006), H * 0.02, 0.07]], 0.007, 20)));
    for (const zz of [-0.07, 0.07]) steel.push(at(rbox(0.012, 0.03, 0.022, 0.003, 1), s * (L / 2 + 0.004), H * 0.02, zz));
  }
  // 彈匣:平躺在箱蓋上,長度沿 X,左右兩個
  const mag = [], pmag = [], brass = [], copper = [];
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  const top = H / 2 + 0.006;
  [[-0.046, 0.03, 0], [0.042, -0.01, 0.05]].forEach(([zz, xx, rot], k) => {
    const P = magParts();
    const place = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeTranslation(xx + 0.095, top + 0.0127, zz - 0.044)).multiply(basis);
    (k ? pmag : mag).push(P.body.applyMatrix4(place));
    for (const g of P.brass) brass.push(g.applyMatrix4(place));
    for (const g of P.tip) copper.push(g.applyMatrix4(place));
  });
  for (const xx of [-0.045, 0.065]) { // 尼龍綁帶繞過彈匣與箱蓋
    strap.push(at(new THREE.BoxGeometry(0.03, 0.004, W - 0.02), xx, top + 0.028, 0));
    for (const s of [-1, 1]) strap.push(at(new THREE.BoxGeometry(0.03, 0.03, 0.004), xx, top + 0.012, s * (W / 2 - 0.012)));
  }
  steel.push(at(rbox(0.036, 0.008, 0.03, 0.002, 1), -0.045, top + 0.031, 0.04)); // 綁帶扣
  const g = new THREE.Group();
  g.add(mesh(olive, M.olive), mesh(steel, M.steel), mesh(rubber, M.rubber), mesh(yellow, M.yellow), mesh(strap, M.strap), mesh(mag, M.mag), mesh(pmag, M.pmag), mesh(brass, M.brass), mesh(copper, M.copper));
  for (const s of [-1, 1]) g.add(decal(0.34, 0.17, M.stencilB, 0, -0.03, s * (W / 2 + 0.0035), s > 0 ? 0 : Math.PI));
  return { group: g, half: H / 2 };
}

function crossShape(a, t) {
  const h = a / 2, k = t / 2, s = new THREE.Shape();
  [[-k, h], [k, h], [k, k], [h, k], [h, -k], [k, -k], [k, -h], [-k, -h], [-k, -k], [-h, -k], [-h, k], [-k, k]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.0012, bevelSegments: 1 });
}

// 白/紅硬殼急救箱:前後兩片外殼(中間接縫 + 密封條)、紅十字、提把、兩個扣件、底部鉸鏈
function buildMedkit() {
  const M = R.mat, W = 0.36, H = 0.25, D = 0.11;
  const shell = [], red = [], plastic = [], steel = [];
  for (const s of [-1, 1]) shell.push(at(rbox(W, H, D / 2 - 0.002, 0.022, 3), 0, 0, s * (D / 4 + 0.001)));
  plastic.push(at(new THREE.BoxGeometry(W - 0.012, H - 0.012, 0.008), 0, 0, 0)); // 接縫密封條
  for (const s of [-1, 1]) {
    red.push(at(crossShape(0.112, 0.037), 0, 0.03, s * (D / 2 - 0.0005), 0, s > 0 ? 0 : Math.PI));
  }
  // 提把
  plastic.push(at(rbox(0.13, 0.022, 0.03, 0.009, 2), 0, H / 2 + 0.036));
  for (const s of [-1, 1]) plastic.push(at(rbox(0.02, 0.042, 0.026, 0.006, 1), s * 0.058, H / 2 + 0.016));
  // 扣件:跨過接縫的扣座 + 翻扣片 + 鋼製轉軸
  for (const s of [-1, 1]) {
    plastic.push(at(rbox(0.04, 0.016, 0.046, 0.004, 1), s * 0.128, H / 2 + 0.004));
    plastic.push(at(rbox(0.034, 0.006, 0.032, 0.002, 1), s * 0.128, H / 2 + 0.014, 0.003, 0.12));
    steel.push(at(cyl(0.0035, 0.046, 8), s * 0.128, H / 2 + 0.012, 0.019, 0, 0, Math.PI / 2));
  }
  // 底部鉸鏈
  for (const s of [-1, 1]) plastic.push(at(cyl(0.0085, 0.06, 10), s * 0.1, -H / 2 - 0.002, 0, 0, 0, Math.PI / 2));
  const g = new THREE.Group();
  g.add(mesh(shell, M.shell), mesh(red, M.red), mesh(plastic, M.plastic), mesh(steel, M.steel));
  for (const s of [-1, 1]) g.add(decal(0.17, 0.085, M.label, 0, -0.068, s * (D / 2 + 0.0015), s > 0 ? 0 : Math.PI));
  return { group: g, half: H / 2 };
}

const ease = (t) => t * t * (3 - 2 * t);

// ---------- 掉落物管理 ----------
export class Pickups {
  constructor(scene, world = null) {
    this.scene = scene;
    this.world = world; // 可選:落點避開牆、貼地
    this.items = [];
    this.dry = 0; // 連續沒掉彈藥的擊殺數
    this.medDry = 0; // 低血量時連續沒掉醫療包的擊殺數
    this.stats = {}; // 各類型擊殺與掉落統計
    this.denyT = 0;
    this.warmed = false;
    this._v = new THREE.Vector3();
  }

  // 目前的掉落機率(含仁慈機制);供 roll 與測試使用
  chances(type, game) {
    const T = DROP_TABLE[type] || DROP_TABLE.walker, Q = DROP_RULES;
    const w = game.weapons, a = w.ammo, p = game.player;
    const cap = a ? magOf(w, w.current) : 1;
    let am = 1;
    if (a && a.reserve === 0 && a.mag < cap) am = Q.noAmmoMul;
    else if (a && a.mag + a.reserve < cap * Q.lowAmmo) am = Q.lowAmmoMul;
    const hr = p.hp / (p.maxHp || 100);
    const mm = hr < Q.critHp ? Q.critHpMul : hr < Q.lowHp ? Q.lowHpMul : 1;
    const medsOut = this.items.filter((it) => it.kind === 'med' && it.state !== 'take').length;
    const late = 1 + Q.lateAmmo * (hpMul(game.round || 1, type) - 1);
    return {
      ammo: T.big ? 0 : Math.min(1, T.ammo * am * late), med: medsOut >= Q.medMax ? 0 : Math.min(1, T.med * mm), grenade: T.grenade || 0,
      ammoPity: !T.big && this.dry + 1 >= Q.pity, medPity: hr < 0.5 && this.medDry + 1 >= Q.medPity && medsOut < Q.medMax,
    };
  }

  // 擊殺時依類型擲骰(擊殺流程呼叫);回傳掉出的種類
  roll(z, game, rand = Math.random) {
    const T = DROP_TABLE[z.type] || DROP_TABLE.walker;
    const c = this.chances(z.type, game), p = game.player;
    const kinds = [];
    if (T.big) kinds.push('bigammo');
    else if (c.ammoPity || rand() < c.ammo) kinds.push('mag');
    this.dry = kinds.length ? 0 : this.dry + 1;
    if (c.medPity || rand() < c.med) kinds.push('med');
    if (p.hp < p.maxHp * 0.5) this.medDry = kinds.includes('med') ? 0 : this.medDry + 1;
    if (rand() < c.grenade) kinds.push('grenade');
    this.stats[z.type] ||= { kills: 0 };
    const st = this.stats[z.type];
    st.kills++;
    for (const k of kinds) st[k === 'mag' ? 'ammo' : k] = (st[k === 'mag' ? 'ammo' : k] || 0) + 1;
    if (game.noDrops) return kinds; // 測試/統計模式:只擲骰不生成
    const y = z.pos.y || 0;
    const h = z.type === 'crawler' ? 0.45 : z.type === 'brute' ? 1.45 : 1.05;
    const a0 = Math.random() * Math.PI * 2;
    kinds.forEach((k, i) => this.drop(z.pos.x, y, z.pos.z, k, { h, ang: a0 + i * 2.6 }));
    return kinds;
  }

  // 在 (x, y, z) 掉落一個 kind('ammo' | 'bigammo' | 'med');y = 腳下地面高度
  drop(x, y, z, kind = 'ammo', o = {}) {
    const L = LOOK[kind];
    if (!L) return null;
    shared();
    // 落點:往隨機方向彈出 0.55–0.9 m(避開屍體與金幣),不穿牆、貼地
    const ang = o.ang ?? Math.random() * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
    let d = 0.55 + Math.random() * 0.35;
    const w = this.world, tgt = new THREE.Vector3();
    if (w) d = Math.max(0, Math.min(d, w.rayDistance(x, y + 0.4, z, dx, 0, dz, d + 0.4) - 0.4));
    tgt.set(x + dx * d, y, z + dz * d);
    if (w) {
      w.resolve(tgt, 0.3);
      const g = w.groundY ? w.groundY(tgt.x, tgt.z, y) : y;
      if (g == null || Math.abs(g - y) > 1) tgt.set(x, y, z);
      else tgt.y = g;
    }

    const root = new THREE.Group();
    root.position.copy(tgt);
    const holder = new THREE.Group();
    const model = R.tmpl[kind].group.clone();
    model.scale.setScalar(L.scale);
    holder.add(model);
    const col = new THREE.Color(L.color);
    const ring = new THREE.Mesh(R.geo.ring, R.proto.ring.clone());
    ring.material.color.copy(col);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const beam = new THREE.Mesh(R.geo.beam, R.proto.beam.clone());
    beam.material.color.copy(col).multiplyScalar(1.5); // 核心略超過 1,讓 Bloom 帶出一點光暈
    beam.scale.set(L.beamW, L.beam, 1);
    const glow = new THREE.Sprite(R.proto.glow.clone());
    glow.material.color.copy(col);
    glow.scale.setScalar(L.glow);
    root.add(ring, beam, glow, holder);
    const from = new THREE.Vector3(x - tgt.x, y + (o.h ?? 1.05) - tgt.y, z - tgt.z);
    holder.position.copy(from);
    const it = {
      kind, L, root, holder, ring, beam, glow, from, half: R.tmpl[kind].half * L.scale,
      age: 0, ground: -1, state: 'fly', yaw: Math.random() * 6.28, tx: (Math.random() - 0.5) * 4, tz: (Math.random() - 0.5) * 4,
      blink: 0, denied: false, take: 0, takeFrom: new THREE.Vector3(), magT: 0, pull: false,
    };
    this.scene.add(root);
    this.items.push(it);
    if (this.items.length > DROP_RULES.max) this._remove(0);
    return it;
  }

  // 預先編譯掉落物用到的 shader(第一次掉落時才不會卡頓)
  _warm(game) {
    this.warmed = true;
    shared();
    const g = new THREE.Group();
    for (const k in R.tmpl) g.add(R.tmpl[k].group.clone());
    g.add(new THREE.Mesh(R.geo.ring, R.proto.ring), new THREE.Mesh(R.geo.beam, R.proto.beam), new THREE.Sprite(R.proto.glow));
    // 背景平行編譯(與實際繪製同樣的 HDR 目標/光源/陰影狀態;同步 compile 會卡住建構期間的主執行緒)
    precompile(game, g).catch(() => { /* 略過 */ });
  }

  update(dt, game) {
    if (!this.warmed && game.renderer) this._warm(game);
    const p = game.player, cam = game.camera.position, Q = DROP_RULES;
    const py = p.pos.y || 0;
    this.denyT -= dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], L = it.L, h = it.holder, pos = it.root.position;
      it.age += dt;
      let glowK = 0;

      if (it.state === 'fly') {
        const t = Math.min(1, it.age / FLY), u = 1 - t;
        h.position.set(it.from.x * u, it.from.y * u + it.half * t + ARC * 4 * t * u, it.from.z * u);
        it.yaw += dt * 7 * u + dt;
        h.rotation.set(it.tx * u, it.yaw, it.tz * u);
        if (t >= 1) { it.state = 'idle'; it.ground = 0; say('pickupLand', null, pos, it.kind); }
      } else if (it.state === 'idle') {
        it.ground += dt;
        it.yaw += dt * 0.9;
        const bob = Math.sin(it.age * 2.3) * 0.035;
        let y;
        if (it.ground < SETTLE) y = it.half + Math.sin((it.ground / SETTLE) * Math.PI) * 0.06; // 落地小彈跳
        else y = it.half + (L.hover + bob - it.half) * ease(Math.min(1, (it.ground - SETTLE) / RISE));
        h.position.set(0, y, 0);
        h.rotation.set(Math.sin(it.age * 1.3) * 0.05, it.yaw, Math.cos(it.age * 1.1) * 0.05);
        glowK = ease(Math.min(1, it.ground / (SETTLE + RISE)));
      } else { // taken:縮小飛向玩家(take < 0 = 排隊等待)
        it.take += dt / 0.22;
        const u = Math.max(0, Math.min(1, it.take)), e = u * u;
        h.position.set(
          it.takeFrom.x + (p.pos.x - pos.x - it.takeFrom.x) * e,
          it.takeFrom.y + (py + 1.15 - pos.y - it.takeFrom.y) * e,
          it.takeFrom.z + (p.pos.z - pos.z - it.takeFrom.z) * e,
        );
        h.scale.setScalar(1 - 0.85 * u);
        it.ring.material.opacity = (1 - u) * 1.1;
        it.ring.scale.setScalar(L.ring * (1 + u * 0.7));
        it.beam.material.opacity = (1 - u) * 0.35;
        it.glow.material.opacity = (1 - u) * 0.6;
        if (u >= 1) this._remove(i);
        continue;
      }

      // 壽命:最後幾秒閃爍(越來越快)、地面光圈跟著縮小,最後 0.35 秒縮小消失
      const rem = Q.life - it.age;
      let vis = 1, shrink = 1;
      if (rem < Q.blink) {
        shrink = 0.45 + 0.55 * Math.max(0, rem / Q.blink);
        it.blink += dt * (2.2 + (1 - rem / Q.blink) * 7);
        const on = it.blink % 1 < 0.62;
        h.visible = on;
        vis = on ? 1 : 0.2;
        if (rem < 0.35) h.scale.setScalar(Math.max(0.01, rem / 0.35));
        if (rem <= 0) { this._remove(i); continue; }
      }

      // 遠距補償:越遠光暈與光柱越寬,在黑暗的長廊盡頭也找得到
      const far = Math.min(1, Math.max(0, (Math.hypot(cam.x - pos.x, cam.z - pos.z) - 6) / 20));
      const pulse = Math.sin(it.age * 3.1);
      it.ring.material.opacity = (0.62 + 0.22 * pulse) * glowK * vis;
      it.ring.scale.setScalar(L.ring * (1 + 0.035 * pulse) * shrink);
      it.ring.rotation.z += dt * 0.5;
      it.beam.material.opacity = (0.26 + 0.04 * Math.sin(it.age * 1.7)) * (1 + far * 0.6) * glowK * vis;
      it.beam.scale.x = L.beamW * (1 + far * 1.3);
      it.beam.rotation.y = Math.atan2(cam.x - pos.x, cam.z - pos.z); // 只繞 Y 軸面向鏡頭
      it.glow.position.y = h.position.y;
      it.glow.scale.setScalar(L.glow * (1 + far * 1.8));
      it.glow.material.opacity = (0.3 + 0.08 * pulse) * (1 + far * 0.4) * Math.max(glowK, it.state === 'fly' ? 0.5 : 0) * vis;

      // 撿取:磁吸範圍內、用得到的東西先滑向玩家,進入撿取距離後套用
      if (it.state !== 'idle' || p.hp <= 0 || p.downed) continue;
      const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z, dh = Math.hypot(dx, dz), dy = Math.abs(py - pos.y);
      if (dh < Q.magnet && dh > Q.reach * 0.6 && dy < 0.6 && it.ground > SETTLE) {
        it.magT -= dt;
        if (it.magT <= 0) { // 每 0.4 秒重新判斷:用不用得到、有沒有隔牆
          it.magT = 0.4;
          const w = this.world;
          it.pull = this.wants(it, game) && (!w?.hasLineOfSight || w.hasLineOfSight(pos.x, pos.y + 0.35, pos.z, p.pos.x, py + 0.35, p.pos.z));
        }
        if (it.pull) {
          const k = Math.min(1, dt * (2.5 + 5 * (1 - dh / Q.magnet))), ox = pos.x, oz = pos.z;
          pos.x += dx * k; pos.z += dz * k;
          const g = this.world?.groundY ? this.world.groundY(pos.x, pos.z, pos.y + 0.3) : pos.y;
          if (g == null || Math.abs(g - pos.y) > 0.5) { pos.x = ox; pos.z = oz; it.pull = false; } else pos.y = g;
        }
      } else it.magT = 0;
      const near = dh < Q.reach && dy < Q.reachY;
      if (!near) { it.denied = false; continue; }
      if (this.apply(it, game)) {
        it.state = 'take';
        it.take = 0;
        it.takeFrom.copy(h.position);
        h.visible = true;
      } else if (!it.denied) {
        it.denied = true;
        if (this.denyT <= 0) {
          this.denyT = 1.6;
          game.ui.pickup(it.kind === 'med' ? '生命與醫療包都已滿' : it.kind === 'grenade' ? '手榴彈已滿' : '彈藥已滿', '#a3a39a');
          say('pickupDeny', 'deny');
        }
      }
    }
  }

  // 撿了有沒有用(只判斷,不套用;磁吸用)
  wants(it, game) {
    const w = game.weapons, p = game.player, Q = DROP_RULES;
    if (it.kind === 'med') return p.hp < p.maxHp || (p.medkits || 0) < Q.medkitCap;
    if (it.kind === 'grenade') return (p.grenades || 0) < Q.grenadeCap;
    for (const id in w.inv) {
      const d = WEAPONS[id], a = w.inv[id];
      if (d && (a.reserve < d.reserveCap || (it.kind === 'bigammo' && a.mag < magOf(w, id)))) return true;
    }
    return false;
  }

  // 套用效果;已滿時回傳 false(留在地上)
  apply(it, game) {
    const w = game.weapons, p = game.player, ui = game.ui, L = it.L, Q = DROP_RULES;
    const count = () => { if (game.stats) game.stats.pickups = (game.stats.pickups || 0) + 1; };
    if (it.kind === 'med') {
      const gain = Math.min(Q.heal, p.maxHp - p.hp);
      if (gain > 0) { // 受傷:直接回血
        p.hp += gain;
        ui.setHP(p.hp, p.maxHp);
        ui.pickup(`+${Math.round(gain)} 生命`, L.css, { icon: 'med', panel: 'health' });
      } else if ((p.medkits || 0) < Q.medkitCap) { // 滿血:收進背包(按 H 使用)
        p.medkits = (p.medkits || 0) + 1;
        ui.pickup('醫療包 +1', L.css, { icon: 'med', sub: `按 H 使用 · 持有 ${p.medkits}/${Q.medkitCap}`, panel: 'medkit' });
      } else return false;
      count();
      say('pickupMed', 'switch');
      return true;
    }
    if (it.kind === 'grenade') {
      if ((p.grenades || 0) >= Q.grenadeCap) return false;
      p.grenades = (p.grenades || 0) + 1;
      ui.pickup('手榴彈 +1', L.css, { icon: 'grenade', sub: `按 G 投擲 · 持有 ${p.grenades}/${Q.grenadeCap}`, panel: 'grenade' });
      count();
      say('pickupItem', 'switch');
      return true;
    }
    const ids = Object.keys(w.inv).filter((id) => WEAPONS[id]).sort((a, b) => (b === w.current) - (a === w.current)); // 目前武器優先
    if (it.kind === 'bigammo') {
      if (ids.every((id) => w.inv[id].mag >= magOf(w, id) && w.inv[id].reserve >= WEAPONS[id].reserveCap)) return false;
      for (const id of ids) { w.inv[id].mag = Math.max(w.inv[id].mag, magOf(w, id)); w.inv[id].reserve = Math.max(w.inv[id].reserve, WEAPONS[id].reserveCap); }
      ui.pickup('大彈藥箱', L.css, { icon: 'ammo', sub: '所有武器彈藥補滿', panel: 'ammo' });
    } else {
      const got = [];
      for (const id of ids) {
        const d = WEAPONS[id], a = w.inv[id], m = magOf(w, id);
        const n = Math.min(id === w.current ? m : Math.ceil(m / 2), d.reserveCap - a.reserve);
        if (n > 0) { a.reserve += n; got.push(`+${n} ${d.name}`); }
      }
      if (!got.length) return false;
      ui.pickup(`彈匣 ${got[0]}`, L.css, { icon: 'ammo', sub: got.slice(1).join(' · '), panel: 'ammo' });
    }
    if (w.ammo.mag === 0) w.startReload(); // 空槍撿到彈藥直接換彈
    if (game.updateAmmoHud) game.updateAmmoHud();
    count();
    say('pickupAmmo', 'switch');
    return true;
  }

  // 回合結束:同樓層、看得到、40m 內而且用得到的掉落物跟金幣一起飛向玩家;其餘留在原地照常倒數
  collectAll(game) {
    const p = game.player, w = this.world, py = p.pos.y || 0;
    let n = 0;
    for (const it of this.items) {
      if (it.state !== 'idle') continue;
      const pos = it.root.position;
      if (Math.abs(pos.y - py) > 1.5 || Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) > 40) continue;
      if (w?.hasLineOfSight && !w.hasLineOfSight(pos.x, pos.y + 1.5, pos.z, p.pos.x, py + 1.6, p.pos.z)) continue; // 視線高度:隔牆的不收,櫃台、矮牆後面的照收
      if (!this.wants(it, game) || !this.apply(it, game)) continue;
      it.state = 'take';
      it.take = -n * 0.12; // 一個接一個飛過來
      it.takeFrom.copy(it.holder.position);
      it.holder.visible = true;
      n++;
    }
    return n;
  }

  _remove(i) {
    const it = this.items[i];
    this.scene.remove(it.root);
    it.ring.material.dispose();
    it.beam.material.dispose();
    it.glow.material.dispose();
    this.items.splice(i, 1);
  }

  dispose() { this.clear(); } // 共用模型/材質(R)留著給下一張地圖

  clear() {
    while (this.items.length) this._remove(this.items.length - 1);
    this.dry = 0;
    this.medDry = 0;
    this.stats = {};
    this.denyT = 0;
  }
}

// =====================================================================
// 補給點:world.supplies = [{ kind: 'ammo' | 'health', x, y, z, level }]
// 實體模型(彈藥補給櫃 / 醫療櫃),E 鍵使用;每次燈篙每位玩家一次,用完亮紅燈並顯示冷卻。
// [w4 經濟] 彈藥櫃只補「手上這把」;每個櫃子每位玩家一夜最多 night 次(用完就整夜亮紅燈 → 要換樓層找下一個)
// =====================================================================
export const SUPPLY_RULES = { reach: 1.9, reachY: 1.3, night: 3 };
const SUP = {
  ammo: { name: '彈藥補給櫃', color: 0xffb347, css: '#ffc35a', verb: '補充彈藥' },
  health: { name: '醫療櫃', color: 0x5dff9a, css: '#7dffae', verb: '使用醫療櫃' },
};

function screenTex(kind, ready) {
  const [c, x] = cv(256, 128);
  x.fillStyle = '#050807'; x.fillRect(0, 0, 256, 128);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = ready ? (kind === 'ammo' ? '#ffc35a' : '#7dffae') : '#ff5a4a';
  x.font = '900 40px "Microsoft JhengHei", sans-serif';
  x.fillText(ready ? (kind === 'ammo' ? '彈藥 OK' : '醫療 OK') : '冷卻中', 128, 48);
  x.font = '700 22px "Microsoft JhengHei", sans-serif';
  x.fillStyle = ready ? '#cfd8cf' : '#c98a80';
  x.fillText(ready ? '按 E 補給' : '下一波補充', 128, 96);
  for (let y = 0; y < 128; y += 3) { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, y, 256, 1); }
  return toTex(c);
}

function stencilPlate(lines, color, w = 512, h = 160) {
  const [c, x] = cv(w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const [t, size, y] of lines) { x.font = `900 ${size}px "Microsoft JhengHei", Impact, sans-serif`; x.fillStyle = color; x.fillText(t, w / 2, y * h); }
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 700; i++) { x.globalAlpha = rr(0.2, 0.8); x.fillRect(rnd() * w, rnd() * h, rr(1, 3), rr(1, 3)); }
  return toTex(c);
}

let SM = null; // 補給點共用材質
function supplyMats() {
  if (SM) return SM;
  shared();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  SM = {
    dark: std({ color: 0x2a2d2b, roughness: 0.6, metalness: 0.5 }),
    white: std({ color: 0xdedbd2, roughness: 0.42, metalness: 0.15 }),
    glass: std({ color: 0xcfe3e8, roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false }),
    inside: std({ color: 0x1a1d1c, roughness: 0.9 }),
    ammoPlate: std({ map: stencilPlate([['彈藥 AMMO', 92, 0.42], ['每一波每人一次', 34, 0.82]], '#d6c15a'), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    medPlate: std({ map: stencilPlate([['醫療 MEDICAL', 84, 0.42], ['每一波每人一次', 34, 0.82]], '#b3121a'), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  return SM;
}

// 彈藥補給櫃:鋼製棧板 + 開放式軍綠鐵櫃,層架上放彈藥箱,頂上狀態燈
function buildAmmoStation() {
  const M = supplyMats(), g = new THREE.Group();
  const W = 0.96, H = 1.28, D = 0.52, olive = [], dark = [], steel = [];
  dark.push(at(new THREE.BoxGeometry(W + 0.06, 0.1, D + 0.06), 0, 0.05));
  for (const x of [-0.42, 0, 0.42]) dark.push(at(new THREE.BoxGeometry(0.08, 0.04, D + 0.06), x, 0.12));
  for (const s of [-1, 1]) olive.push(at(rbox(0.035, H, D, 0.008, 1), s * (W / 2 - 0.0175), 0.14 + H / 2));
  olive.push(at(rbox(W, 0.035, D, 0.008, 1), 0, 0.14 + H - 0.0175));
  olive.push(at(new THREE.BoxGeometry(W - 0.04, H - 0.04, 0.02), 0, 0.14 + H / 2, -D / 2 + 0.01));
  for (const h of [0.16, 0.56, 0.95]) {
    olive.push(at(new THREE.BoxGeometry(W - 0.06, 0.025, D - 0.04), 0, 0.14 + h));
    steel.push(at(new THREE.BoxGeometry(W - 0.06, 0.03, 0.012), 0, 0.14 + h + 0.01, D / 2 - 0.03));
  }
  for (const s of [-1, 1]) steel.push(at(cyl(0.012, 0.18, 8), s * 0.3, 0.14 + H + 0.03, 0, 0, 0, Math.PI / 2)); // 提把
  g.add(mesh(olive, R.mat.olive), mesh(dark, M.dark, false), mesh(steel, R.mat.steel, false));
  // 層架上的彈藥箱
  const put = (k, x, y, ry, s = 1) => { const o = R.tmpl[k].group.clone(); o.position.set(x, y + R.tmpl[k].half * s, 0.02); o.rotation.y = ry; o.scale.setScalar(s); g.add(o); };
  put('bigammo', 0, 0.14 + 0.175, 0.04, 0.9);
  put('ammo', -0.22, 0.14 + 0.575, 0.08); put('ammo', 0.2, 0.14 + 0.575, -0.06);
  put('ammo', -0.18, 0.14 + 0.965, -0.1); put('med', 0.24, 0.14 + 0.965, 0.1, 0.55);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), M.ammoPlate);
  plate.position.set(0, 0.14 + H - 0.12, D / 2 + 0.002);
  g.add(plate);
  return { g, W, D, H: H + 0.14, lampY: H + 0.2, screenAt: [W / 2 - 0.19, H - 0.08, D / 2 + 0.004] };
}

// 醫療櫃:鋼架上的白色鐵櫃,玻璃門內是急救箱,門板下半部紅十字
function buildHealthStation() {
  const M = supplyMats(), g = new THREE.Group();
  const W = 0.78, H = 1.0, D = 0.34, Y0 = 0.66, white = [], dark = [], steel = [], red = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) dark.push(at(new THREE.BoxGeometry(0.04, Y0, 0.04), x * (W / 2 - 0.04), Y0 / 2, z * (D / 2 - 0.04)));
  dark.push(at(new THREE.BoxGeometry(W - 0.04, 0.03, D - 0.04), 0, 0.12));
  dark.push(at(new THREE.BoxGeometry(W, 0.03, D), 0, Y0 - 0.015));
  white.push(at(rbox(W, H, D, 0.015, 2), 0, Y0 + H / 2));
  white.push(at(rbox(W - 0.03, H - 0.03, 0.025, 0.008, 1), 0, Y0 + H / 2, D / 2 + 0.012)); // 門板
  steel.push(at(cyl(0.01, 0.16, 8), W / 2 - 0.07, Y0 + H * 0.55, D / 2 + 0.04)); // 把手
  for (const yy of [0.62, 0.48]) steel.push(at(new THREE.BoxGeometry(0.03, 0.02, 0.03), W / 2 - 0.07, Y0 + H * yy, D / 2 + 0.03));
  red.push(at(new THREE.BoxGeometry(0.2, 0.065, 0.006), 0, Y0 + 0.24, D / 2 + 0.027)); // 紅十字(門板下半)
  red.push(at(new THREE.BoxGeometry(0.065, 0.2, 0.006), 0, Y0 + 0.24, D / 2 + 0.027));
  g.add(mesh(white, M.white), mesh(dark, M.dark, false), mesh(steel, R.mat.steel, false), mesh(red, R.mat.red, false));
  // 玻璃窗與內容物
  const win = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, H * 0.42), M.inside);
  win.position.set(0, Y0 + H * 0.7, D / 2 + 0.025);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, H * 0.42), M.glass);
  glass.position.set(0, Y0 + H * 0.7, D / 2 + 0.03);
  glass.renderOrder = 2;
  g.add(win, glass);
  for (const x of [-0.15, 0.15]) {
    const o = R.tmpl.med.group.clone();
    o.scale.setScalar(0.42);
    o.position.set(x, Y0 + H * 0.52 + R.tmpl.med.half * 0.42, D / 2 + 0.005);
    g.add(o);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.17), M.medPlate);
  plate.position.set(0, Y0 + 0.08, D / 2 + 0.027);
  g.add(plate);
  return { g, W, D, H: Y0 + H, lampY: Y0 + H + 0.05, screenAt: [0, Y0 + 0.46, D / 2 + 0.028], screenW: 0.3 };
}

export class Supplies {
  constructor(scene, world, list = world.supplies || []) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.t = 0;
    for (const s of list) this.add(s);
  }

  add(s) {
    shared();
    const M = supplyMats();
    const y = s.y || 0, w = this.world;
    const B = s.kind === 'health' ? buildHealthStation() : buildAmmoStation();
    // 朝向:附近有牆就背靠牆;否則面向最空曠的方向
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dz]) => ({ dx, dz, d: w.rayDistance ? w.rayDistance(s.x, y + 0.5, s.z, dx, 0, dz, 6) : 6 }));
    const wall = dirs.reduce((a, b) => (b.d < a.d ? b : a));
    const open = dirs.reduce((a, b) => (b.d > a.d ? b : a));
    const face = wall.d < 1.5 ? { dx: -wall.dx, dz: -wall.dz } : open;
    const root = new THREE.Group();
    let px = s.x, pz = s.z;
    if (wall.d < 1.5) { const k = Math.max(0, wall.d - B.D / 2 - 0.06); px += wall.dx * k; pz += wall.dz * k; }
    root.position.set(px, y, pz);
    root.rotation.y = Math.atan2(face.dx, face.dz);
    root.add(B.g);
    // 狀態燈(自發光圓頂)與小螢幕
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2, 0.6), toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lampMat);
    lamp.position.set(B.W / 2 - 0.12, B.lampY - 0.06, 0);
    const base = new THREE.Mesh(cyl(0.05, 0.03, 12), M.dark);
    base.position.set(B.W / 2 - 0.12, B.lampY - 0.075, 0);
    const sw = B.screenW || 0.28;
    const scrMat = new THREE.MeshBasicMaterial({ map: screenTex(s.kind, true), toneMapped: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 2), scrMat);
    scr.position.set(...B.screenAt);
    root.add(lamp, base, scr);
    // 地面光圈(與掉落物同款,不用動態光源)
    const ring = new THREE.Mesh(R.geo.ring, R.proto.ring.clone());
    ring.material.color.set(SUP[s.kind === 'health' ? 'health' : 'ammo'].color);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.025, B.D / 2 + 0.55);
    ring.scale.setScalar(1.25);
    root.add(ring);
    root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this.scene.add(root);
    const fw = Math.abs(Math.cos(root.rotation.y)) > 0.5;
    const box = w.addBox ? w.addBox(px, pz, fw ? B.W : B.D, fw ? B.D : B.W, B.H, y) : null;
    const st = {
      ...s, y, kind: s.kind === 'health' ? 'health' : 'ammo', root, lampMat, scrMat, ring, box, used: new Set(), ready: true, pulse: Math.random() * 6,
      front: { x: px + face.dx * (B.D / 2 + 0.6), z: pz + face.dz * (B.D / 2 + 0.6) },
    };
    this.list.push(st);
    return st;
  }

  _state(st, ready) {
    if (st.ready === ready) return;
    st.ready = ready;
    st.scrMat.map.dispose();
    st.scrMat.map = screenTex(st.kind, ready);
    st.lampMat.color.setRGB(...(ready ? [0.3, 2, 0.6] : [2.2, 0.15, 0.1]));
  }

  // 新回合:所有補給點重新可用(一夜的次數 st.uses 不清);新的一局(reset)才全部歸零
  newRound() { for (const st of this.list) { st.used.clear(); this._state(st, this.left(st, { id: 'local' }) > 0); } }
  reset() { for (const st of this.list) st.uses = null; this.newRound(); }

  left(st, p) { return SUPPLY_RULES.night - (st.uses?.get(p.id ?? 'local') || 0); } // 這一夜還能用幾次
  canUse(st, p) { return !st.used.has(p.id ?? 'local') && this.left(st, p) > 0; }

  // 玩家可互動的最近補給點
  nearest(p) {
    let best = null, bd = SUPPLY_RULES.reach;
    for (const st of this.list) {
      if (Math.abs((p.pos.y || 0) - st.y) > SUPPLY_RULES.reachY) continue;
      const d = Math.min(Math.hypot(p.pos.x - st.root.position.x, p.pos.z - st.root.position.z) - 0.35, Math.hypot(p.pos.x - st.front.x, p.pos.z - st.front.z));
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  promptFor(st, p) {
    const S = SUP[st.kind], n = this.left(st, p);
    if (this.canUse(st, p)) return { text: `按 [E] ${S.verb}（今晚還能用 ${n} 次）`, dim: false };
    return { text: n > 0 ? `${S.name} · 已使用，下一波補充` : `${S.name} · 今晚用完了`, dim: true };
  }

  // 使用;回傳 { ok, msg }
  use(st, game) {
    const p = game.player, w = game.weapons, ui = game.ui, S = SUP[st.kind];
    if (!this.canUse(st, p)) { say('pickupDeny', 'deny'); return { ok: false, msg: this.left(st, p) > 0 ? '這一波已經用過了' : '今晚用完了' }; }
    if (st.kind === 'ammo') {
      const id = w.current, inv = w.inv[id];
      if (!inv || !WEAPONS[id] || (inv.mag >= magOf(w, id) && inv.reserve >= WEAPONS[id].reserveCap)) {
        say('pickupDeny', 'deny');
        ui.pickup(`${WEAPONS[id]?.name || ''} 彈藥已滿`, '#a3a39a');
        return { ok: false, msg: '彈藥已滿' };
      }
      inv.mag = Math.max(inv.mag, magOf(w, id)); inv.reserve = Math.max(inv.reserve, WEAPONS[id].reserveCap);
      if (game.updateAmmoHud) game.updateAmmoHud();
      ui.pickup(`${WEAPONS[id].name} 彈藥補滿`, S.css, { icon: 'ammo', sub: `${S.name} · 只補手上這把 · 今晚還能用 ${this.left(st, p) - 1} 次`, panel: 'ammo' });
      say('pickupAmmo', 'switch');
    } else {
      const gain = p.maxHp - p.hp;
      if (gain <= 0) { say('pickupDeny', 'deny'); ui.pickup('生命已滿', '#a3a39a'); return { ok: false, msg: '生命已滿' }; }
      p.hp = p.maxHp;
      ui.setHP(p.hp, p.maxHp);
      ui.pickup(`+${Math.round(gain)} 生命`, S.css, { icon: 'med', sub: S.name, panel: 'health' });
      say('heal', 'pickupMed');
    }
    st.used.add(p.id ?? 'local');
    (st.uses ||= new Map()).set(p.id ?? 'local', (st.uses.get(p.id ?? 'local') || 0) + 1);
    this._state(st, false);
    if (game.net?.send) game.net.send('supplyUse', { i: this.list.indexOf(st) });
    return { ok: true };
  }

  update(dt, game) {
    this.t += dt;
    const p = game.player;
    for (const st of this.list) {
      const d = Math.hypot(p.pos.x - st.root.position.x, p.pos.z - st.root.position.z), dy = Math.abs((p.pos.y || 0) - st.y);
      const vis = d < 45 && dy < 5;
      if (st.root.visible !== vis) st.root.visible = vis;
      if (!vis) continue;
      const ready = this.canUse(st, p);
      if (ready !== st.ready) this._state(st, ready);
      const k = 0.5 + 0.5 * Math.sin(this.t * 3 + st.pulse);
      st.ring.material.opacity = ready ? 0.35 + 0.25 * k : 0;
      st.ring.rotation.z += dt * 0.4;
      if (!ready) st.lampMat.color.setRGB(1.2 + k, 0.1, 0.08);
    }
  }

  dispose() {
    for (const st of this.list) {
      this.scene.remove(st.root);
      if (st.box && this.world.removeBox) this.world.removeBox(st.box);
      st.ring.material.dispose();
    }
    this.list.length = 0;
  }
}
