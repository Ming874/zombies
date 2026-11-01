import * as THREE from 'three';
import { prng, hashStr } from './paint.js';

// 燈具:依區域 light 類型擺放(天花日光燈/故障閃爍/冷白/手術燈/紅色緊急燈/裸燈泡/鈉燈/夜燈/螢幕光/暖光),
// 燈罩外殼合併成靜態網格,發光部分用 InstancedMesh(每幀更新亮度 → 閃爍/熄滅),再加加法混合的光暈。
// 真正的 PointLight 只有固定 N 盞(光源池),每幀挑玩家附近最重要的燈具套上去(數量固定 → 不重編 shader)。
const KINDS = {
  fluoro: { color: 0xdcebe2, cd: 9, dist: 9, glow: 1.2, shape: 'tube', gain: 2.2 },
  fluoro_dying: { color: 0xd4e6d2, cd: 8, dist: 8, glow: 1.1, shape: 'tube', gain: 2.0 },
  fluoro_cold: { color: 0xe2eeff, cd: 10, dist: 9, glow: 1.2, shape: 'tube', gain: 2.4 },
  warm: { color: 0xffd6a0, cd: 14, dist: 10, glow: 1.3, shape: 'tube', gain: 2.2 },
  surgical: { color: 0xfff4e6, cd: 16, dist: 8, glow: 1.2, shape: 'disc', gain: 2.6 },
  emergency: { color: 0xff2a18, cd: 7, dist: 8.5, glow: 0.9, shape: 'lens', gain: 3.0 },
  beacon: { color: 0xff3020, cd: 9, dist: 10, glow: 1.4, shape: 'lens', gain: 3.5 },
  bare_bulb: { color: 0xffc27a, cd: 6.5, dist: 8.5, glow: 0.8, shape: 'bulb', gain: 4.0 },
  sodium: { color: 0xff9440, cd: 12, dist: 11, glow: 1.4, shape: 'pack', gain: 2.6 },
  nightlight: { color: 0xff9ab4, cd: 1.6, dist: 5, glow: 0.4, shape: 'small', gain: 2.0 },
  monitor: { color: 0x86c2e0, cd: 3, dist: 6, glow: 0.0, shape: null, gain: 1 },
  candle: { color: 0xffa040, cd: 2.8, dist: 7, glow: 0.3, shape: null, gain: 1 },
  lamp: { color: 0xffc888, cd: 5.5, dist: 7.5, glow: 0.5, shape: null, gain: 1 },
  fire: { color: 0xff6a20, cd: 20, dist: 13, glow: 0.0, shape: null, gain: 1 },
  sconce: { color: 0xffb468, cd: 3.2, dist: 7, glow: 0.55, shape: 'sconce', gain: 2.6 }, // 壁燈(燭台造型)
  exit: { color: 0x2cff6a, cd: 0.8, dist: 3.5, glow: 0.5, shape: 'exit', gain: 1.6 }, // 緊急出口標示燈
  street: { color: 0xff9a48, cd: 30, dist: 22, glow: 2.0, shape: null, gain: 1 },
};
// 每種燈的狀態機率:[常亮, 閃爍, 熄滅]
// [ghost] 基調改成「穩定、偏暗、偏冷」:一般燈不再隨機閃爍(閃爍變成驚嚇導演的事件,見 src/horror);
// 老化燈管(fluoro_dying)是穩定但暗的(dim),壞掉的就熄滅;只有少數刻意挑選的燈(走廊盡頭的一支燈管等)會偶爾輕微閃一下(mode 'broken')。
const STATES = {
  fluoro: [0.93, 0, 0.07], fluoro_dying: [0.64, 0, 0.36], fluoro_cold: [0.97, 0, 0.03], warm: [1, 0, 0], surgical: [1, 0, 0],
  emergency: [1, 0, 0], bare_bulb: [0.8, 0, 0.2], sodium: [1, 0, 0], nightlight: [1, 0, 0], sconce: [0.86, 0, 0.14], exit: [0.94, 0, 0.06],
};
// 只有螢幕光/夜燈/檯燈的房間:補幾盞大多壞掉的天花燈(還亮的那幾盞很暗)
const SPARSE = { monitor: [0.4, 0, 0.6], nightlight: [0.2, 0, 0.8], lamp: [0.4, 0, 0.6] };
const MODE = { fluoro: 'tube', fluoro_dying: 'tube', fluoro_cold: 'tube', warm: 'steady', surgical: 'tube', emergency: 'pulse', beacon: 'beacon', bare_bulb: 'sway', sodium: 'buzz', nightlight: 'steady', monitor: 'screen', candle: 'candle', lamp: 'steady', fire: 'fire', street: 'buzz', sconce: 'tube', exit: 'tube' };
// 刻意擺的壞燈(偶爾輕微閃):每區最多一盞
const BROKEN_ZONES = new Set(['f1_corridor', 'f2_corridor', 'f3_corridor', 'b1_tunnel', 'b1_morgue', 'b1_archive']);
// 開局安靜期:這個時間(遊戲時間)之前連壞燈也不閃(hospital.update 在每局開始時設定 = 開局 + 60 秒)
const CALM = { until: 0 };

// 閃爍函數(確定性;JS 與發光件共用)
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export function flickerValue(f, t) {
  if (f.state === 2) return 0;
  const p = f.phase;
  switch (f.mode) {
    // 刻意擺的壞燈(以及戶外標成閃爍的路燈,weather.js 設成 tube/1):大部分時間穩定(微弱起伏),每 9~13 秒一次短促的兩三下
    case 'broken': case 'tube': {
      if (f.state !== 1 || t < CALM.until) return 1;
      const per = 9 + (p % 4.5), k = (t + p * 3.7) % per;
      if (k < 0.45) { const q = hash(Math.floor(t * 18 + p * 7)); return q < 0.35 ? 0.12 : q < 0.55 ? 0.6 : 1; }
      return 0.96 + 0.03 * Math.sin(t * 2.3 + p);
    }
    case 'pulse': return 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(t * 1.4 + p)), 2); // 緊急燈:慢慢「呼吸」,不閃
    case 'beacon': { const a = (t * 3.4 + p) % (Math.PI * 2); return 0.15 + 0.85 * Math.pow(Math.max(0, Math.cos(a)), 6); }
    case 'buzz': return f.state === 1 && t >= CALM.until ? (hash(Math.floor(t * 6 + p)) < 0.15 ? 0.3 : 0.92 + 0.08 * Math.sin(t * 47)) : 0.95 + 0.05 * Math.sin(t * 1.3 + p) * Math.sin(t * 0.7);
    case 'candle': return 0.78 + 0.14 * Math.sin(t * 9.1 + p) * Math.sin(t * 5.3 + p * 2) + 0.08 * Math.sin(t * 23 + p);
    case 'fire': return 0.7 + 0.2 * Math.sin(t * 7.3 + p) * Math.sin(t * 3.1) + 0.1 * Math.sin(t * 17 + p * 3);
    case 'screen': return 0.88 + 0.07 * Math.sin(t * 0.9 + p) + 0.04 * Math.sin(t * 3.1 + p * 2); // 螢幕光:緩慢起伏(不再逐格跳動)
    case 'sway': return f.state === 1 && t >= CALM.until ? (hash(Math.floor(t * 11 + p)) < 0.25 ? 0.15 : 1) : 1;
    default: return 1;
  }
}

const tubeGeo = new THREE.BoxGeometry(1.18, 0.02, 0.26);
const discGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 18);
const bulbGeo = new THREE.SphereGeometry(0.055, 10, 8);
const lensGeo = new THREE.BoxGeometry(0.26, 0.09, 0.03);
const packGeo = new THREE.BoxGeometry(0.2, 0.14, 0.03);
const smallGeo = new THREE.BoxGeometry(0.07, 0.05, 0.015);
const sconceGeo = new THREE.CylinderGeometry(0.05, 0.075, 0.13, 10, 1);
const exitGeo = new THREE.PlaneGeometry(0.36, 0.16);
const SHAPES = { tube: tubeGeo, disc: discGeo, bulb: bulbGeo, lens: lensGeo, pack: packGeo, small: smallGeo, sconce: sconceGeo, exit: exitGeo };
// 緊急出口標示燈的面板(綠底白色奔跑人形 + 出口 EXIT),發光件用這張貼圖,亮度仍由每個實例的顏色控制
let exitTex = null;
// 日光燈的壓克力稜鏡擴散板:兩根燈管的亮帶、細小稜鏡格紋、四周暗邊、泛黃與板內的死蟲斑點
// (box 的底面 UV:u 沿燈長、v 沿燈寬)
let diffTex = null;
function diffuserTexture() {
  if (diffTex) return diffTex;
  const W = 256, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = x.createImageData(W, H);
  let sd = 9137; const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = j / (H - 1), u = i / (W - 1);
    const tube = Math.exp(-(((v - 0.33) / 0.09) ** 2)) + Math.exp(-(((v - 0.67) / 0.09) ** 2));
    const ends = Math.min(1, Math.min(u, 1 - u) / 0.06), sides = Math.min(1, Math.min(v, 1 - v) / 0.1);
    const prism = 0.93 + 0.07 * (((i >> 1) + (j >> 1)) & 1);
    let k = (0.5 + 0.55 * tube) * prism * (0.55 + 0.45 * ends) * (0.6 + 0.4 * sides);
    const o = (j * W + i) * 4;
    img.data[o] = Math.min(255, k * 255); img.data[o + 1] = Math.min(255, k * 250); img.data[o + 2] = Math.min(255, k * 232); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // 板內積的死蟲與灰塵(擴散板底部的黑點,集中在兩端)
  for (let n = 0; n < 70; n++) {
    const end = rnd() < 0.5 ? rnd() * 0.25 : 1 - rnd() * 0.25;
    x.fillStyle = `rgba(20,16,10,${0.25 + rnd() * 0.5})`;
    x.beginPath(); x.ellipse(end * W, (0.15 + rnd() * 0.7) * H, 0.6 + rnd() * 1.6, 0.4 + rnd() * 1.0, rnd() * 3, 0, 7); x.fill();
  }
  const g = x.createLinearGradient(0, 0, W, 0); // 一端泛黃
  g.addColorStop(0, 'rgba(140,110,40,0.25)'); g.addColorStop(0.4, 'rgba(140,110,40,0)'); g.addColorStop(1, 'rgba(120,100,50,0.08)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  diffTex = new THREE.CanvasTexture(c);
  diffTex.colorSpace = THREE.SRGBColorSpace;
  diffTex.anisotropy = 4;
  return diffTex;
}
function exitTexture() {
  if (exitTex) return exitTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 112;
  const x = c.getContext('2d');
  x.fillStyle = '#0f8a3c'; x.fillRect(0, 0, 256, 112);
  x.strokeStyle = '#dff8e6'; x.lineWidth = 4; x.strokeRect(5, 5, 246, 102);
  // 門框 + 奔跑的人
  x.fillStyle = '#f2fff4'; x.fillRect(16, 18, 52, 78); x.fillStyle = '#0f8a3c'; x.fillRect(22, 24, 40, 72);
  x.fillStyle = '#f2fff4'; x.strokeStyle = '#f2fff4'; x.lineCap = 'round'; x.lineWidth = 7;
  x.beginPath(); x.arc(92, 30, 8, 0, 6.28); x.fill();
  x.beginPath(); x.moveTo(90, 40); x.lineTo(82, 64); x.lineTo(96, 76); x.lineTo(94, 94); x.moveTo(82, 64); x.lineTo(68, 72); x.lineTo(60, 90);
  x.moveTo(88, 46); x.lineTo(104, 56); x.moveTo(88, 46); x.lineTo(72, 50); x.stroke();
  x.font = 'bold 34px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif'; x.textBaseline = 'middle'; x.fillText('出口', 124, 38);
  x.font = 'bold 30px Arial, sans-serif'; x.fillText('EXIT', 126, 80);
  exitTex = new THREE.CanvasTexture(c);
  exitTex.colorSpace = THREE.SRGBColorSpace;
  exitTex.anisotropy = 4;
  return exitTex;
}

// 光暈 billboard(加法混合、自己算霧)
const glowMat = new THREE.ShaderMaterial({
  uniforms: { uFogDensity: { value: 0.03 } },
  vertexShader: `
    uniform float uFogDensity;
    varying vec3 vCol; varying vec2 vUv; varying float vFog;
    void main() {
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float s = length(instanceMatrix[0].xyz);
      float d = length(mv.xyz);
      mv.xyz += normalize(-mv.xyz) * min(0.45, d * 0.4); // 往鏡頭拉近一點,避免被天花板切掉
      mv.xy += position.xy * s;
      gl_Position = projectionMatrix * mv;
      vCol = instanceColor; vUv = uv;
      float fd = uFogDensity * d;
      vFog = exp(-fd * fd) * smoothstep(0.3, 1.6, d);
    }`,
  fragmentShader: `
    varying vec3 vCol; varying vec2 vUv; varying float vFog;
    void main() {
      vec2 p = vUv - 0.5;
      float r2 = dot(p, p) * 4.0;
      float g = exp(-r2 * 5.5) * 0.85 + exp(-r2 * 28.0) * 0.6;
      gl_FragColor = vec4(vCol * g * vFog, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

export const setGlowFog = (d) => { glowMat.uniforms.uFogDensity.value = d; };
export function buildLights(K, { root, propLights = [], poolSize = 8 }) {
  const { L, B } = K;
  const fixtures = [];
  const near = (li, x, z, d) => fixtures.some((f) => f.li === li && (f.x - x) ** 2 + (f.z - z) ** 2 < d * d);
  const add = (spec) => {
    const k = KINDS[spec.kind] || KINDS.fluoro;
    const R = spec.R;
    const st = spec.states || STATES[spec.kind] || [1, 0, 0];
    const roll = R ? R() : 0;
    const state = spec.state ?? (roll < st[0] ? 0 : roll < st[0] + st[1] ? 1 : 2);
    const f = {
      x: spec.x, y: spec.y, z: spec.z, li: spec.li, zone: spec.zone || null, kind: spec.kind, mode: spec.mode || MODE[spec.kind] || 'steady',
      color: new THREE.Color(spec.color ?? k.color), cd: spec.cd ?? k.cd, dist: spec.dist ?? k.dist, glow: spec.glow ?? k.glow, shape: spec.shape === undefined ? k.shape : spec.shape,
      gain: k.gain, state, phase: R ? R() * 100 : Math.abs(spec.x * 7.31 + spec.z * 3.17) % 100, ov: 1, cur: 1, inst: -1, glowIdx: -1, axis: spec.axis || 'x', hang: spec.hang || 0,
      sway: spec.kind === 'bare_bulb' ? (R ? R.r(0.03, 0.09) : 0.05) : 0, ox: 0, oz: 0, prop: !!spec.prop, gate: 1,
      dim: spec.dim ?? (spec.kind === 'fluoro_dying' ? 0.55 + 0.33 * hash(spec.x * 3.17 + spec.z * 7.71) : 1), // 老化燈管:穩定但偏暗
    };
    fixtures.push(f);
    return f;
  };
  const isOpen = (li, c, r) => { const ch = L.charAt(li, c, r); return !'#WE=_o%|X'.includes(ch) && !'^v<>'.includes(ch); };

  // ---- 依區域擺天花燈 ----
  for (const zone of L.zones) {
    const li = zone.levelIndex, lt = zone.light;
    if (!lt || lt === 'moon' || lt === 'none') continue; // 燭光/檯燈/爐火/螢幕光不放天花燈,但下面會補壁燈或稀疏的壞燈
    const R = prng(hashStr('light' + zone.id));
    const outdoorZone = ['alley', 'plaza', 'parking', 'ambulance_bay', 'playground', 'cemetery', 'yard', 'courtyard', 'rooftop', 'fire_escape'].includes(zone.theme);
    if (outdoorZone) continue; // 戶外燈另外處理(外牆壁燈/路燈由道具)
    const ceilKinds = ['fluoro', 'fluoro_dying', 'fluoro_cold', 'warm', 'surgical', 'bare_bulb'];
    if (ceilKinds.includes(lt)) {
      const corridor = zone.theme === 'corridor';
      const sp = corridor ? 6.2 : lt === 'bare_bulb' ? 4.6 : 4.4;
      for (const [c0, r0, c1, r1] of zone.rects) {
        const w = (c1 - c0 + 1) * 2, h = (r1 - r0 + 1) * 2, alongX = w >= h;
        const len = Math.max(w, h), wid = Math.min(w, h);
        const nA = Math.max(1, Math.round(len / sp)), nB = wid >= 7.5 ? Math.max(1, Math.round(wid / 5)) : 1;
        for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
          const along = ((i + 0.5) * len) / nA, across = ((j + 0.5) * wid) / nB;
          const x = alongX ? c0 * 2 + along : c0 * 2 + across, z = alongX ? r0 * 2 + across : r0 * 2 + along;
          const c = Math.min(c1, Math.floor(x / 2)), r = Math.min(r1, Math.floor(z / 2));
          if (!isOpen(li, c, r)) continue;
          const yC = L.ceilY(li, c, r);
          if (!Number.isFinite(yC) || yC - L.levels[li].y > 5) continue;
          if (near(li, x, z, sp * 0.62)) continue;
          let kind = lt;
          if (lt === 'surgical' && !(i === Math.floor(nA / 2) && j === 0)) kind = 'fluoro_cold';
          const hang = (kind === 'fluoro_dying' && R() < 0.22) ? R.r(0.35, 0.75) : 0;
          add({ x, y: yC - (kind === 'bare_bulb' ? R.r(0.45, 0.8) : kind === 'surgical' ? 1.05 : 0.05), z, li, zone, kind, R, axis: alongX ? 'x' : 'z', hang, yC });
        }
      }
    }
    // 稀疏的壞天花燈(螢幕光/夜燈/檯燈的房間)
    const sparse = SPARSE[lt] || (lt === 'emergency' ? (zone.theme === 'stairwell' ? [0.5, 0, 0.5] : [0.4, 0, 0.6]) : null);
    if (sparse) {
      for (const [c0, r0, c1, r1] of zone.rects) {
        const w = (c1 - c0 + 1) * 2, h = (r1 - r0 + 1) * 2;
        const nA = Math.max(1, Math.round(Math.max(w, h) / 7)), alongX = w >= h;
        for (let i = 0; i < nA; i++) {
          const along = ((i + 0.5) * Math.max(w, h)) / nA, x = alongX ? c0 * 2 + along : c0 * 2 + w / 2, z = alongX ? r0 * 2 + h / 2 : r0 * 2 + along;
          const c = Math.min(c1, Math.floor(x / 2)), r = Math.min(r1, Math.floor(z / 2));
          if (!isOpen(li, c, r)) continue;
          const yC = L.ceilY(li, c, r);
          if (!Number.isFinite(yC) || yC - L.levels[li].y > 5 || near(li, x, z, 3)) continue;
          add({ x, y: yC - 0.05, z, li, zone, kind: 'fluoro_dying', R, axis: alongX ? 'x' : 'z', states: sparse, yC });
        }
      }
      // 至少一盞還微弱地亮著(整間全黑的話,玩家只看得到手電筒照到的地方)
      const mine = fixtures.filter((f) => f.zone === zone && f.kind === 'fluoro_dying');
      if (mine.length && mine.every((f) => f.state === 2)) { mine[0].state = 0; mine[0].dim = 0.32; }
    }
    // 牆燈:紅色緊急燈(樓梯間/急診)、鈉燈(地下工業區)、夜燈(兒童區)、燭台壁燈(燭光區)、焚化爐旁的鈉燈
    const wl = lt === 'candle' ? 'sconce' : lt === 'fire' ? 'sodium' : lt;
    if (wl === 'emergency' || wl === 'sodium' || wl === 'nightlight' || wl === 'sconce') {
      const faces = K.faces.filter((f) => f.zone === zone && f.kind === 'room' && f.li === li && f.a1 - f.a0 >= 1.9);
      const step = wl === 'nightlight' ? 7 : wl === 'emergency' ? (zone.theme === 'stairwell' ? 5 : 7.5) : wl === 'sconce' ? (zone.theme === 'ossuary' ? 3.5 : 6.5) : 8.5;
      let acc = R() * step;
      for (const f of faces) {
        for (let a = f.a0 + 0.8; a < f.a1 - 0.6; a += 0.5) {
          acc += 0.5;
          if (acc < step) continue;
          acc = 0;
          const isH = f.dir === 'N' || f.dir === 'S', off = 0.07;
          const x = isH ? a : f.fixed + f.nx * off, z = isH ? f.fixed + f.nz * off : a;
          const yy = f.y + (wl === 'nightlight' ? 0.32 : wl === 'emergency' ? 2.45 : wl === 'sconce' ? 1.95 : 2.75);
          if (yy > f.y + f.top - 0.15) continue;
          add({ x, y: yy, z, li, zone, kind: wl, R, axis: isH ? 'x' : 'z', wall: f, color: wl === 'nightlight' && R() < 0.4 ? 0x9ab4ff : undefined });
        }
      }
    }
  }
  // ---- 走廊的明暗節奏:一段亮、一段暗(只剩一盞很暗的),長直段的盡頭留一盞亮燈把人吸過去 ----
  for (const zone of L.zones) {
    if (zone.theme !== 'corridor') continue;
    const list = fixtures.filter((f) => f.zone === zone && f.shape === 'tube');
    const blocks = new Map();
    for (const f of list) {
      const along = f.axis === 'x' ? f.x : f.z, across = f.axis === 'x' ? f.z : f.x;
      const key = f.axis + Math.round(across) + ':' + Math.floor(along / 13);
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(f);
    }
    for (const [key, fs] of blocks) {
      const R2 = prng(hashStr(zone.id + key));
      const dark = R2() < (zone.light === 'fluoro_cold' ? 0.12 : 0.34);
      if (dark) { const keep = (R2() * fs.length) | 0; fs.forEach((f, i) => { f.state = i === keep ? 0 : 2; if (i === keep) f.dim = 0.3; }); }
    }
    for (const [c0, r0, c1, r1] of zone.rects) {
      const w = c1 - c0 + 1, h = r1 - r0 + 1;
      if (Math.max(w, h) < 10) continue;
      const inR = list.filter((f) => f.x >= c0 * 2 && f.x <= (c1 + 1) * 2 && f.z >= r0 * 2 && f.z <= (r1 + 1) * 2);
      if (!inR.length) continue;
      const key = (f) => (w >= h ? f.x : f.z);
      inR.sort((a, b) => key(a) - key(b));
      for (const f of [inR[0], inR[inR.length - 1]]) { f.state = 0; f.lure = true; f.dim = 1; }
    }
  }
  // ---- [ghost] 刻意擺的壞燈:每個指定區域一盞(走廊最長直段的盡頭那支;其他區域離中心最遠的那支) ----
  for (const zone of L.zones) {
    if (!BROKEN_ZONES.has(zone.id)) continue;
    const list = fixtures.filter((f) => f.zone === zone && (f.shape === 'tube' || f.shape === 'bulb'));
    if (!list.length) continue;
    const [c0, r0, c1, r1] = zone.rects.reduce((a, b) => ((b[2] - b[0]) * (b[3] - b[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? b : a));
    const cx = (c0 + c1 + 1), cz = (r0 + r1 + 1), alongX = c1 - c0 >= r1 - r0;
    let best = null, bd = -1;
    for (const f of list) { const d = alongX ? Math.abs(f.x - cx) - Math.abs(f.z - cz) * 2 : Math.abs(f.z - cz) - Math.abs(f.x - cx) * 2; if (d > bd) { bd = d; best = f; } }
    if (best) { best.state = 1; best.mode = 'broken'; best.dim = 0.85; best.lure = false; }
  }
  // 其他任何「閃爍」狀態一律改回穩定(閃爍只剩壞燈與事件)
  for (const f of fixtures) if (f.state === 1 && f.mode !== 'broken') f.state = 0;
  // ---- 緊急出口標示燈:樓梯間門(走廊側)與一樓通往戶外的門(室內側)上方 ----
  for (const d of K.doorList || []) {
    if (!d.axis) continue;
    const runStart = d.run[0] === (d.axis === 'z' ? d.c : d.r);
    if (!runStart) continue;
    const sa = d.za?.theme === 'stairwell', sb = d.zb?.theme === 'stairwell';
    let side = 0;
    if (sa !== sb) side = sa ? 1 : -1; // 標示貼在非樓梯間那一側
    else if (L.levels[d.li].id === '1F' && d.outA !== d.outB) side = d.outA ? 1 : -1;
    if (!side) continue;
    const mid = ((d.run[0] + d.run[1] + 1) / 2) * 2, y = L.levels[d.li].y + d.h + 0.24;
    const off = 0.07, wall = d.axis === 'z' ? { nx: 0, nz: side } : { nx: side, nz: 0 };
    const fixed = d.axis === 'z' ? (side > 0 ? (d.r + 1) * 2 : d.r * 2) : (side > 0 ? (d.c + 1) * 2 : d.c * 2);
    const x = d.axis === 'z' ? mid : fixed + side * off, z = d.axis === 'z' ? fixed + side * off : mid;
    add({ x, y, z, li: d.li, zone: side > 0 ? d.zb : d.za, kind: 'exit', R: prng(hashStr(`exit${d.li},${d.c},${d.r}`)), wall, axis: d.axis === 'z' ? 'x' : 'z' });
  }
  // ---- 戶外:外牆鈉燈(出入口上方)與急診旋轉警示燈 ----
  for (const d of K.doorList || []) {
    if (!(d.outA || d.outB) || L.levels[d.li].id !== '1F') continue;
    const R = prng(hashStr(`ext${d.c},${d.r}`));
    if (R() < 0.25) continue;
    const out = d.outA ? -1 : 1;
    const x = d.axis === 'z' ? d.c * 2 + 1 : d.c * 2 + 1 + out * 1.07, z = d.axis === 'z' ? d.r * 2 + 1 + out * 1.07 : d.r * 2 + 1;
    const er = (d.za?.theme === 'er' || d.zb?.theme === 'er');
    add({ x, y: 3.15, z, li: d.li, zone: null, kind: er ? 'beacon' : 'sodium', R, axis: d.axis === 'z' ? 'x' : 'z', ext: true });
  }
  // ---- 道具登記的燈(蠟燭、檯燈、路燈…) ----
  for (const p of propLights) {
    const li = L.levelOfY(p.y - 0.3);
    const kind = KINDS[p.kind] ? p.kind : 'lamp';
    const f = add({ x: p.x, y: p.y, z: p.z, li, zone: p.zone ? L.zones.find((z) => z.id === p.zone) || null : L.zoneAt(li, Math.floor(p.x / 2), Math.floor(p.z / 2)), kind, color: p.color, cd: p.intensity, dist: p.distance, shape: null, state: 0, mode: p.flicker > 0.5 ? 'candle' : MODE[kind] || 'steady', prop: true });
    f.glow = p.glow ?? (kind === 'candle' ? 0.3 : kind === 'street' ? 2.0 : 0.5);
    if (p.w207) f.w207 = p.w207;
  }
  // ---- 道具沒放燈的燭光/檯燈/爐火/螢幕區:補一盞 ----
  for (const zone of L.zones) {
    const lt = zone.light;
    if (!['candle', 'lamp', 'fire', 'monitor'].includes(lt)) continue;
    if (fixtures.some((f) => f.zone === zone)) continue;
    const li = zone.levelIndex, [c0, r0, c1, r1] = zone.rects[0];
    const R = prng(hashStr('fb' + zone.id));
    const n = lt === 'candle' ? Math.min(4, 1 + ((c1 - c0 + r1 - r0) / 4) | 0) : 1;
    for (let i = 0; i < n; i++) {
      const c = R.i(c0, c1), r = R.i(r0, r1);
      if (!isOpen(li, c, r)) continue;
      add({ x: c * 2 + 1 + R.r(-0.5, 0.5), y: L.levels[li].y + (lt === 'fire' ? 0.8 : lt === 'monitor' ? 1.1 : 1.0), z: r * 2 + 1 + R.r(-0.5, 0.5), li, zone, kind: lt, R, shape: null, state: 0 });
    }
  }

  const story = storyLights(K, fixtures, add, root);

  // ---- 燈罩外殼(靜態合併) + 發光件(InstancedMesh) ----
  const byShape = {};
  for (const f of fixtures) {
    const k = KINDS[f.kind] || KINDS.fluoro;
    if (!f.shape) continue;
    (byShape[f.shape] ||= []).push(f);
    const li = f.li;
    if (f.shape === 'tube') {
      const [sx, sz] = f.axis === 'x' ? [1.32, 0.4] : [0.4, 1.32];
      if (f.hang) { // 一端垂下的燈管
        const ang = Math.asin(Math.min(0.9, f.hang / 1.3));
        f.tilt = ang;
        housing(B, li, 'trim_white', f.x, f.y - f.hang / 2, f.z, sx, 0.07, sz, f.axis, ang);
        f.y -= f.hang / 2 + 0.05;
        B.box(li, 'trim_black', f.x - 0.006 + (f.axis === 'x' ? -0.6 : 0), f.y + f.hang / 2, f.z - 0.006 + (f.axis === 'z' ? -0.6 : 0), f.x + 0.006 + (f.axis === 'x' ? -0.6 : 0), f.y + f.hang + 0.1, f.z + 0.006 + (f.axis === 'z' ? -0.6 : 0), {});
      } else {
        B.box(li, 'trim_white', f.x - sx / 2, f.y - 0.02, f.z - sz / 2, f.x + sx / 2, f.y + 0.05, f.z + sz / 2, {});
        f.y -= 0.03;
      }
    } else if (f.shape === 'disc') { // 手術燈:吊臂 + 三個燈頭
      B.box(li, 'trim_white', f.x - 0.04, f.y + 0.1, f.z - 0.04, f.x + 0.04, f.y + 1.05, f.z + 0.04, {});
      B.box(li, 'trim_white', f.x - 0.45, f.y + 0.05, f.z - 0.05, f.x + 0.45, f.y + 0.13, f.z + 0.05, {});
      for (const dx of [-0.42, 0, 0.42]) {
        const g = new THREE.CylinderGeometry(0.3, 0.24, 0.16, 18);
        const m = new THREE.Matrix4().makeTranslation(f.x + dx, f.y, f.z);
        B.geo(li, 'trim_white', g, m);
      }
      f.extra = [-0.42, 0.42];
      f.y -= 0.09;
    } else if (f.shape === 'bulb') {
      const top = f.yC ?? f.y + 0.7;
      B.box(li, 'trim_black', f.x - 0.005, f.y + 0.05, f.z - 0.005, f.x + 0.005, top, f.z + 0.005, {});
      B.box(li, 'trim_dark', f.x - 0.025, f.y + 0.04, f.z - 0.025, f.x + 0.025, f.y + 0.1, f.z + 0.025, {});
    } else if (f.shape === 'lens' || f.shape === 'pack' || f.shape === 'small' || f.shape === 'sconce' || f.shape === 'exit') {
      const ax = f.axis === 'x', w = f.shape === 'small' ? 0.1 : f.shape === 'lens' ? 0.34 : f.shape === 'sconce' ? 0.11 : f.shape === 'exit' ? 0.42 : 0.3;
      const hh = f.shape === 'small' ? 0.08 : f.shape === 'sconce' ? 0.2 : f.shape === 'exit' ? 0.22 : 0.2;
      if (f.shape === 'sconce') { // 黃銅托架
        const nx = f.wall ? f.wall.nx : 0, nz = f.wall ? f.wall.nz : 0;
        B.box(li, 'trim_brass', Math.min(f.x, f.x - nx * 0.07) - 0.012, f.y - 0.12, Math.min(f.z, f.z - nz * 0.07) - 0.012, Math.max(f.x, f.x - nx * 0.07) + 0.012, f.y - 0.08, Math.max(f.z, f.z - nz * 0.07) + 0.012, {});
      }
      const back = f.wall ? -0.07 : -0.06;
      const nx = f.wall ? f.wall.nx : 0, nz = f.wall ? f.wall.nz : 0;
      const bx0 = f.x + nx * back, bz0 = f.z + nz * back;
      const front = f.shape === 'exit' ? -0.006 : f.shape === 'sconce' ? -0.05 : 0; // 發光面不能和外殼前面重疊(z-fighting)
      const fx = f.x + nx * front, fz = f.z + nz * front;
      B.box(li, f.shape === 'pack' ? 'trim_dark' : f.shape === 'sconce' ? 'trim_brass' : 'trim_white', Math.min(bx0, fx) - (ax ? w / 2 : 0.0), f.y - hh / 2, Math.min(bz0, fz) - (ax ? 0 : w / 2), Math.max(bx0, fx) + (ax ? w / 2 : 0), f.y + hh / 2, Math.max(bz0, fz) + (ax ? 0 : w / 2), {});
    }
  }
  const emissive = [];
  for (const [shape, list] of Object.entries(byShape)) {
    const n = list.length * (shape === 'disc' ? 3 : 1);
    const im = new THREE.InstancedMesh(SHAPES[shape], new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true, map: shape === 'exit' ? exitTexture() : shape === 'tube' ? diffuserTexture() : null }), n);
    im.name = 'fixtures-' + shape;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let i = 0;
    for (const f of list) {
      const rotY = f.axis === 'z' ? Math.PI / 2 : 0;
      const parts = shape === 'disc' ? [0, ...f.extra] : [0];
      f.inst = { mesh: im, i0: i, n: parts.length };
      for (const dx of parts) {
        e.set(f.tilt ? (f.axis === 'z' ? f.tilt : 0) : 0, rotY, f.tilt && f.axis === 'x' ? f.tilt : 0);
        if (f.shape === 'lens' || f.shape === 'pack' || f.shape === 'small' || f.shape === 'sconce' || f.shape === 'exit') e.set(0, f.wall ? Math.atan2(f.wall.nx, f.wall.nz) : rotY, 0);
        q.setFromEuler(e);
        m4.compose(p.set(f.x + dx, f.y, f.z), q, s);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, f.color);
        i++;
      }
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = false;
    root.add(im);
    emissive.push(im);
  }
  // 光暈
  const glowList = fixtures.filter((f) => f.glow > 0);
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, Math.max(1, glowList.length));
  glow.name = 'fixture-glow';
  glow.frustumCulled = false;
  glow.renderOrder = 5;
  {
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    glowList.forEach((f, i) => { f.glowIdx = i; m4.makeScale(f.glow, f.glow, f.glow).setPosition(f.x, f.y - 0.06, f.z); glow.setMatrixAt(i, m4); glow.setColorAt(i, c.copy(f.color).multiplyScalar(0.25)); });
    glow.count = glowList.length;
  }
  root.add(glow);

  // ---- 光源池 ----
  const pool = [];
  const makePool = (n) => {
    while (pool.length < n) {
      const pl = new THREE.PointLight(0xffffff, 0, 8, 2);
      pl.castShadow = false;
      root.add(pl);
      pool.push({ light: pl, f: null, fade: 0 });
    }
    while (pool.length > n) { const p = pool.pop(); root.remove(p.light); p.light.dispose(); }
  };
  makePool(poolSize);

  const nF = fixtures.length;
  const score = new Float32Array(nF), want = new Int32Array(64);
  const tmpC = new THREE.Color();
  const _m4 = new THREE.Matrix4();
  // 2D 視線(牆擋光):在玩家樓層的格子上走 DDA
  const blocked = (li, x0, z0, x1, z1) => {
    let c = Math.floor(x0 / 2), r = Math.floor(z0 / 2);
    const c1 = Math.floor(x1 / 2), r1 = Math.floor(z1 / 2);
    const dx = x1 - x0, dz = z1 - z0;
    const sx = Math.sign(dx), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(2 / dx) : 1e9, tdz = dz !== 0 ? Math.abs(2 / dz) : 1e9;
    let tx = dx !== 0 ? ((sx > 0 ? (c + 1) * 2 - x0 : x0 - c * 2) / Math.abs(dx)) : 1e9;
    let tz = dz !== 0 ? ((sz > 0 ? (r + 1) * 2 - z0 : z0 - r * 2) / Math.abs(dz)) : 1e9;
    for (let k = 0; k < 40; k++) {
      if (c === c1 && r === r1) return false;
      if (tx < tz) { c += sx; tx += tdx; } else { r += sz; tz += tdz; }
      const ch = L.charAt(li, c, r);
      if ((ch === '#' || ch === 'E') && !(c === c1 && r === r1)) return true;
    }
    return false;
  };
  let lastPick = -1;
  const api = {
    fixtures, pool, emissive, glow, story,
    setDawn: story.setDawn,
    setPoolSize(n) { makePool(Math.max(0, Math.min(16, n | 0))); },
    // [ghost] 開局安靜期:t 之前連壞燈也不閃(驚嚇導演的閃燈事件也會等這段時間過去)
    calmUntil(t) { CALM.until = t; },
    get calm() { return CALM.until; },
    update(t, dt, px, py, pz, fx, fz, playerLi, visibleLevels) {
      // 1) 每個燈具目前的亮度(閃爍 × 事件覆寫)
      for (let i = 0; i < nF; i++) {
        const f = fixtures[i];
        let v = flickerValue(f, t) * f.ov * f.dim * f.gate; // gate:[scene r4] 故事用的總開關(互動的配電盤只動 ov/state)
        f.cur = v;
        if (f.sway) { f.ox = Math.sin(t * 1.3 + f.phase) * f.sway; f.oz = Math.cos(t * 1.1 + f.phase * 0.7) * f.sway * 0.7; }
      }
      // 2) 發光件與光暈
      for (let i = 0; i < nF; i++) {
        const f = fixtures[i];
        if (f.inst !== -1) {
          tmpC.copy(f.color).multiplyScalar(f.state === 2 ? 0.06 : 0.08 + f.cur * f.gain);
          for (let k = 0; k < f.inst.n; k++) f.inst.mesh.setColorAt(f.inst.i0 + k, tmpC);
          if (f.sway && f.inst.n === 1) { _m4.makeTranslation(f.x + f.ox, f.y, f.z + f.oz); f.inst.mesh.setMatrixAt(f.inst.i0, _m4); f.inst.mesh.instanceMatrix.needsUpdate = true; }
        }
        if (f.glowIdx >= 0) {
          tmpC.copy(f.color).multiplyScalar(f.cur * 0.32 * (f.kind === 'candle' ? 1.6 : 1));
          glow.setColorAt(f.glowIdx, tmpC);
          if (f.sway) { _m4.makeScale(f.glow, f.glow, f.glow).setPosition(f.x + f.ox, f.y - 0.06, f.z + f.oz); glow.setMatrixAt(f.glowIdx, _m4); glow.instanceMatrix.needsUpdate = true; }
        }
      }
      for (const f of story.linked) for (const k of f.link) k.mat.color.copy(k.base).multiplyScalar(k.k0 + f.cur * k.k1);
      for (const im of emissive) if (im.instanceColor) im.instanceColor.needsUpdate = true;
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
      // 3) 挑燈(依距離、樓層、視線、朝向;已在用的燈加分避免跳動)
      const nW = Math.min(want.length, pool.length);
      let cnt = 0;
      for (let i = 0; i < nF; i++) {
        const f = fixtures[i];
        score[i] = 0;
        if (f.cur < 0.02 || !visibleLevels[f.li]) continue;
        const dx = f.x - px, dz = f.z - pz, dy = f.y - py;
        const d2 = dx * dx + dz * dz + dy * dy * 2.5;
        if (d2 > 900) continue;
        let s = (f.cd * f.cur) / (d2 + 6);
        const dl = Math.abs(f.li - playerLi);
        if (dl === 1) s *= 0.3; else if (dl > 1) s *= 0.05;
        const dot = (dx * fx + dz * fz) / (Math.sqrt(dx * dx + dz * dz) + 0.01);
        s *= dot > 0.25 ? 1.3 : dot < -0.3 ? 0.7 : 1;
        if (f.pooled) s *= 1.35;
        score[i] = s;
        cnt++;
      }
      // 取前 nW(簡單選擇;nF 小)
      let picked = 0;
      for (let k = 0; k < nW + 6 && picked < nW; k++) {
        let bi = -1, bs = 0;
        for (let i = 0; i < nF; i++) if (score[i] > bs) { bs = score[i]; bi = i; }
        if (bi < 0) break;
        score[bi] = -1;
        const f = fixtures[bi];
        if (f.li === playerLi && !f.ext && blocked(playerLi, px, pz, f.x, f.z) && ((f.x - px) ** 2 + (f.z - pz) ** 2) > 9) { if (k < nW + 5) continue; }
        want[picked++] = bi;
      }
      // 4) 指派(保留已在的,換掉沒被選上的)
      const nP = pool.length;
      for (let j = 0; j < nP; j++) pool[j].keep = false;
      for (let i = 0; i < nF; i++) fixtures[i].pooled = false;
      for (let k = 0; k < picked; k++) {
        const f = fixtures[want[k]];
        for (let j = 0; j < nP; j++) if (pool[j].f === f) { pool[j].keep = true; f.pooled = true; break; }
      }
      for (let k = 0; k < picked; k++) {
        const f = fixtures[want[k]];
        if (f.pooled) continue;
        for (let j = 0; j < nP; j++) { const pl = pool[j]; if (pl.keep) continue; pl.f = f; pl.keep = true; pl.fade = 0; f.pooled = true; break; }
      }
      for (const pl of pool) {
        const L2 = pl.light;
        if (!pl.keep || !pl.f) { pl.fade = Math.max(0, pl.fade - dt * 5); L2.intensity *= pl.fade; if (pl.fade <= 0) { pl.f = null; L2.intensity = 0; } continue; }
        const f = pl.f;
        pl.fade = Math.min(1, pl.fade + dt * 4);
        L2.color.copy(f.color);
        L2.distance = f.dist;
        L2.decay = 2;
        const wo = f.wall ? 0.32 : 0; // 壁燈的點光源離牆一點,牆上不會有刺眼的光斑
        L2.position.set(f.x + f.ox + (f.wall ? f.wall.nx * wo : 0), f.y - (f.shape === 'tube' ? 0.25 : f.shape === 'disc' ? 0.2 : 0), f.z + f.oz + (f.wall ? f.wall.nz * wo : 0));
        L2.intensity = f.cd * f.cur * pl.fade;
      }
      lastPick = picked;
    },
    get picked() { return lastPick; },
    // 事件用:找某區域/範圍內的燈具
    find(pred) { return fixtures.filter(pred); },
    // 換地圖時:拿掉光源池的燈、釋放發光件材質
    dispose() {
      makePool(0);
      for (const im of emissive) { im.material.dispose(); im.dispose?.(); }
      glow.dispose?.();
    },
  };
  return api;
}

// 傾斜的燈罩(一端掉下來)
function housing(B, li, key, x, y, z, sx, sy, sz, axis, ang) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(axis === 'z' ? ang : 0, 0, axis === 'x' ? ang : 0));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  B.geo(li, key, g, m);
}

// ======================================================================
// [scene r4] 故事燈光:207 的檯燈是房間唯一的光、2F 北翼照明被切斷(暗區)、金水商行的暖光、
// 207 的窗(從後巷看是整棟唯一亮著的窗,亮度跟著檯燈這個燈具走:停電/發電機沒油/熄燈結局都會一起暗)、天亮(結局)
// ======================================================================
function storyLights(K, fixtures, add, root) {
  const { L } = K;
  const linked = [];
  const lamp = fixtures.find((f) => f.w207 === 'lamp') || null;
  for (const f of fixtures) {
    if (f.prop) continue;
    const zid = f.zone?.id;
    // 207 天花板的燈壞了:檯燈是唯一的光
    if (zid === 'f2_ward_207') { f.state = 2; f.gate = 0; } // 配電盤送電時會把 state 2 的燈救回來 → 用 gate 關死
    // 2F 北翼走廊(207 前後):「北側照明:人為切斷」→ 只剩護理站壁燈與 207 門內的光
    else if (zid === 'f2_corridor' && f.z < 30.5 && f.x > 62 && f.x < 90) { f.state = 2; f.gate = 0; }
    // [scene r5] 3F 監控室門口那一段走廊不亮:讓門裡漏出來的 CRT 藍光被看見(「被錄下來的真相」)
    else if (zid === 'f3_corridor' && f.x > 76 && f.x < 104 && f.z < 30) { f.state = 2; f.gate = 0; }
    // 金水商行:鎢絲燈的暖色(安全的地方)
    else if (f.zone?.theme === 'shop') { f.color.setHex(0xffd0a0); f.cd *= 1.05; f.dim = 1; if (f.state === 2) f.state = 0; }
  }
  // ---- 207 的窗:窗簾後面透出的暖光(朝外的單面板;室內看不到) ----
  const win = (K.windowInfo || []).find((w) => w.zone?.id === 'f2_ward_207');
  // 窗正下方 1F 後門上的鈉燈不亮(後巷裡只剩那扇窗)
  if (win) for (const f of fixtures) if ((f.kind === 'sodium' || f.ext) && !f.zone && Math.abs(f.x - win.x) < 5 && Math.abs(f.z - win.z) < 3) { f.state = 2; f.gate = 0; }
  let glowMat = null, shaft = null, dawnF = null;
  if (win && lamp) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(80, 104, 6, 70, 84, 112);
    g.addColorStop(0, '#fff2d6'); g.addColorStop(0.35, '#ffc98a'); g.addColorStop(0.8, '#a0562a'); g.addColorStop(1, '#4a2410');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    // 窗簾的皺褶(直條)與窗框十字的影子
    for (let x = 0; x < 128; x += 6) { c.fillStyle = `rgba(60,24,8,${0.06 + 0.08 * Math.abs(Math.sin(x * 0.7))})`; c.fillRect(x, 0, 3, 128); }
    c.fillStyle = 'rgba(30,12,4,0.55)'; c.fillRect(0, 0, 18, 128); c.fillRect(110, 0, 18, 128); // 兩側拉起的窗簾
    // 檯燈罩與陪病椅椅背的剪影(低處)
    c.fillStyle = 'rgba(40,16,6,0.6)'; c.beginPath(); c.moveTo(86, 92); c.lineTo(104, 92); c.lineTo(99, 80); c.lineTo(91, 80); c.fill();
    c.fillRect(30, 96, 30, 32);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    glowMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x000000, toneMapped: true });
    const ly = L.levels[win.li].y;
    const w = (win.u1 - 0.035) - (win.u0 + 0.07);
    const geo = new THREE.PlaneGeometry(w, 1.36);
    const mesh = new THREE.Mesh(geo, glowMat);
    const wPos = win.wf + win.inDir * 0.25, uMid = (win.u0 + 0.07 + win.u1 - 0.035) / 2;
    if (win.axis === 'z') { mesh.position.set(uMid, ly + 1.66, wPos); mesh.rotation.y = win.inDir > 0 ? Math.PI : 0; }
    else { mesh.position.set(wPos, ly + 1.66, uMid); mesh.rotation.y = win.inDir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    mesh.name = 'w207-window-glow';
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.raycast = () => {};
    root.add(mesh);
    lamp.link = [{ mat: glowMat, base: new THREE.Color(0xffd4a0), k0: 0.0, k1: 2.3 }];
    linked.push(lamp);
    // 窗外的光暈(加法混合的柔光片,朝外):從後巷遠遠就看得到「那一扇亮著的窗」
    const hc = document.createElement('canvas'); hc.width = 64; hc.height = 64;
    const h2 = hc.getContext('2d'); const hg = h2.createRadialGradient(32, 34, 2, 32, 34, 31);
    hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(0.35, 'rgba(255,255,255,0.35)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    h2.fillStyle = hg; h2.fillRect(0, 0, 64, 64);
    const htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace;
    const haloMat = new THREE.MeshBasicMaterial({ map: htex, color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.9), haloMat);
    halo.position.copy(mesh.position); halo.rotation.copy(mesh.rotation);
    if (win.axis === 'z') halo.position.z -= win.inDir * 0.45; else halo.position.x -= win.inDir * 0.45;
    halo.name = 'w207-window-halo'; halo.raycast = () => {}; halo.renderOrder = 5;
    root.add(halo);
    lamp.link.push({ mat: haloMat, base: new THREE.Color(0xffb878), k0: 0, k1: 0.55 });
    // ---- 天亮時從窗戶照進 207 的冷光(平常 ov = 0,不會被燈池選到)+ 一道淡淡的光柱 ----
    const nx = win.axis === 'z' ? 0 : win.inDir, nz = win.axis === 'z' ? win.inDir : 0;
    dawnF = add({ x: win.x + nx * 2.3, y: ly + 1.9, z: win.z + nz * 2.3, li: win.li, zone: null, kind: 'lamp', color: 0xc0c8f4, cd: 24, dist: 11, glow: 0, shape: null, state: 0, mode: 'steady' });
    dawnF.prop = true; dawnF.gate = 0; // 不屬於任何區域 → 配電盤不會碰它
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 64;
    const s2 = sc.getContext('2d'); const sg = s2.createLinearGradient(0, 0, 0, 64);
    sg.addColorStop(0, 'rgba(255,255,255,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    s2.fillStyle = sg; s2.fillRect(0, 0, 64, 64);
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.MeshBasicMaterial({ map: stex, color: 0xd0d8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true });
    shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.2), sm);
    // 從窗往房內斜下(朝床的方向)
    shaft.position.set(win.x + nx * 1.5, ly + 1.0, win.z + nz * 1.5);
    shaft.rotation.set(win.axis === 'z' ? -Math.PI / 2 + 0.55 * win.inDir : 0, win.axis === 'z' ? 0 : Math.PI / 2, win.axis === 'z' ? 0 : -Math.PI / 2 + 0.55 * win.inDir);
    shaft.visible = false; shaft.name = 'w207-dawn-shaft'; shaft.raycast = () => {};
    root.add(shaft);
  }
  // ---- 天亮(結局):t 0..1;只改顏色/強度(不加減燈、不切 visible 以外的東西) ----
  const outdoorK = new Set(['sodium', 'street', 'beacon']);
  const outF = fixtures.filter((f) => outdoorK.has(f.kind) && f.gate > 0);
  let lastT = 0;
  const setDawn = (t) => {
    t = Math.max(0, Math.min(1, +t || 0));
    if (t === lastT) return;
    lastT = t;
    for (const f of outF) f.gate = 1 - 0.55 * t;
    if (dawnF) dawnF.gate = t;
    if (lamp?.link) { lamp.link[0].k1 = 2.3 + 0.8 * t; if (lamp.link[1]) lamp.link[1].k1 = 0.55 * (1 - 0.4 * t); } // 天亮了窗還是要看得出亮著
    if (shaft) { shaft.visible = t > 0.02; shaft.material.opacity = 0.3 * t; }
    K.atmo?.setDawn?.(t);
  };
  return { linked, lamp, window: win, glowMat, dawnF, shaft, setDawn };
}
