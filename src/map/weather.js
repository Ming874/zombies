import * as THREE from 'three';
import { surf } from './hospital/surfaces.js';
import { sfx, _internal as AUDIO } from '../audio.js';
import { assets } from '../sys/assets.js';
import { ENV, WIND, LIGHT_MODS, GLOWS } from './props/outdoor/env.js';
import { WET, OCC, makeWet, makeGlassWet } from './weather/wet.js';
import { RainOcclusion } from './weather/occlusion.js';
import { RL, streakMesh, curtainMesh, splashMesh, dripMesh, setDrips, updateRainLights } from './weather/rain.js';
import { lensPass } from './weather/lens.js';
import { materials as zombieMaterials } from '../zombies/materials.js';

export { WET, OCC, makeWet, makeGlassWet }; // 戶外道具從這裡 import makeWet

// 天氣與夜空(戶外):
//  - 雨(src/map/weather/rain.js):GPU 實例化雨絲(近層 + 中層,依相對速度動態模糊、受光源池/手電筒/閃電照亮,暗處幾乎看不見)、
//    遠景雨幕、濺水、屋簷滴水;遮蔽用俯視烘焙的遮雨高度圖(weather/occlusion.js:屋頂、雨棚、車頂、室內都沒有雨)
//  - 濕地(weather/wet.js):淋得到雨的表面才濕(變暗、粗糙度下降、立面流痕)、水窪(鏡面 + 漣漪 + 路燈倒影光柱)、
//    濕度隨雨量累積/變乾、窗玻璃上的水珠與水痕
//  - 鏡頭雨滴(weather/lens.js):露天抬頭時打在鏡頭上的水滴(高/極致畫質)
//  - 低霧:貼地的數層霧片(依戶外遮罩淡出,不進室內)
//  - 閃電:雲層閃光 + 偶爾的閃電形狀 + 月光平行光短暫增亮 + sfx.thunder(距離公尺,音效模組依聲速延遲)
//  - 雨聲:sfx.setRain(雨量, 室外程度)(遮雨圖算出頭頂有沒有遮蔽、附近多遠有露天、中間有沒有牆;低矮雨棚下雨聲較響)
//  - 夜空:快速飄動的暴風雲(月光鑲邊)、地平線外的城市剪影(零星亮窗、閃爍航空障礙燈、遠方火光)
// 依 game.quality 調整數量;每幀不配置新物件。game.js 只加兩行(import + new Weather(this)),
// 每幀更新掛在 hospital.update 之後(環境光、霧色由 atmosphere 先算好,這裡再疊加閃電);
// 鏡頭雨滴 pass 掛在 hospital.attachRenderer 之後插進 composer(預編譯前就在,不會第一次下雨才編譯)。

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; };

// ======================================================================
// 地圖遮罩
// ======================================================================
// 雨停高度:每格最上面的實心面(樓板/屋頂/牆頂);地圖外一圈 = 地面層高度(遠景地面)
// 地面層 = 戶外可走格最多的那層(醫院是 1F);頂層有戶外可走格時另做一張頂樓霧片遮罩
export function groundLevel(L) {
  let best = 0, bn = -1;
  const OW = L.F.OUTDOOR | L.F.WALK;
  L.levels.forEach((lv, li) => { let n = 0; for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) if ((L.flagsAt(li, c, r) & OW) === OW) n++; if (n > bn) { bn = n; best = li; } });
  return best;
}
function buildMasks(L) {
  const W = L.W + 2, H = L.H + 2, nL = L.levels.length, top = L.levels[nL - 1];
  const gLi = groundLevel(L), gY = L.levels[gLi].y;
  const inB = (c, r) => (L.inBuilding ? L.inBuilding(c, r) : false);
  const rain = new Float32Array(W * H);
  const fog = new Uint8Array(W * H * 4);
  let roofCells = 0;
  for (let r = -1; r <= L.H; r++) for (let c = -1; c <= L.W; c++) {
    const k = (r + 1) * W + (c + 1);
    let y = gY;
    const inMap = c >= 0 && r >= 0 && c < L.W && r < L.H;
    if (inMap) {
      if (L.roofed && L.roofed(c, r)) y = top.y + L.LEVEL_H;
      else {
        y = -50;
        for (let li = nL - 1; li >= 0; li--) {
          const ch = L.charAt(li, c, r);
          if (ch === '_' || ch === 'o' || ch === '%') continue;
          const ly = L.levels[li].y;
          if (ch === '#' || ch === 'E') y = ly + (li === gLi && !inB(c, r) ? 3.0 : L.LEVEL_H);
          else if (ch === 'W') y = ly + L.LEVEL_H;
          else y = ly;
          break;
        }
      }
    }
    rain[k] = y;
    // 霧片遮罩:G = 地面層戶外(地圖外也算)、B = 頂層戶外平台
    const g1 = !inMap || (Math.abs(y - gY) < 0.5 && ((L.flagsAt(gLi, c, r) & L.F.OUTDOOR) || ('|#'.includes(L.charAt(gLi, c, r)) && !inB(c, r))));
    const roof = inMap && nL - 1 !== gLi && Math.abs(y - top.y) < 0.5 && (L.flagsAt(nL - 1, c, r) & L.F.WALK);
    if (roof) roofCells++;
    fog[k * 4] = 0; fog[k * 4 + 1] = g1 ? 255 : 0; fog[k * 4 + 2] = roof ? 255 : 0; fog[k * 4 + 3] = 255;
  }
  const rt = new THREE.DataTexture(rain, W, H, THREE.RedFormat, THREE.FloatType);
  rt.minFilter = rt.magFilter = THREE.NearestFilter;
  rt.needsUpdate = true;
  const ft = new THREE.DataTexture(fog, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  ft.minFilter = ft.magFilter = THREE.LinearFilter;
  ft.needsUpdate = true;
  // 地圖座標 → 遮罩 uv:u = (x/CELL + 1) / W
  const xf = new THREE.Vector4(1 / (L.CELL * W), 1 / (L.CELL * H), 1 / W, 1 / H);
  // 每層每格附近(8 格內)是否有露天格(玩家在深處室內時不畫雨)
  const near = L.levels.map((lv) => {
    const open = new Uint8Array(L.W * L.H), out = new Uint8Array(L.W * L.H);
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) open[r * L.W + c] = rain[(r + 1) * W + c + 1] <= lv.y + 0.6 ? 1 : 0;
    const R = 8;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      let f = 0;
      for (let dr = -R; dr <= R && !f; dr++) for (let dc = -R; dc <= R; dc++) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= L.W || rr >= L.H || open[rr * L.W + cc]) { f = 1; break; }
      }
      out[r * L.W + c] = f;
    }
    return out;
  });
  return { rain, rainTex: rt, fogTex: ft, xf, near, W, H, gLi, gY, topY: top.y, roofCells };
}

// ======================================================================
// 夜空:暴風雲(透明,只畫在天空像素上)+ 城市剪影(不透明,深度略小於 1 讓雲與閃光擋不到)+ 閃電形狀
// ======================================================================
const SKY_NOISE = /* glsl */`
  float h1( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
  float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float n2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( h2( i ), h2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h2( i + vec2( 0.0, 1.0 ) ), h2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
  float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * n2( p ); p = p * 2.02 + vec2( 1.7, 9.2 ); a *= 0.5; } return s; }
`;
function cloudMesh() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color() }, uMoon: { value: new THREE.Vector3(0.25, 0.42, 0.87).normalize() }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector2(1, 0) }, uCover: { value: 0.62 }, uWind: { value: new THREE.Vector2(0.012, 0.005) }, uFire: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uFog; uniform vec3 uMoon; uniform float uFlash; uniform vec2 uFlashDir; uniform float uCover; uniform vec2 uWind; uniform float uFire;
      varying vec3 vDir;
      ${SKY_NOISE}
      void main() {
        vec3 d = normalize( vDir );
        float up = d.y;
        if ( up < -0.03 ) discard;
        vec2 cp = d.xz / ( max( up, 0.0 ) + 0.1 ) * 0.75 + uWind * uTime;
        float c = fbm( cp ), c2 = fbm( cp * 2.7 + vec2( 5.2, 1.3 ) + uWind * uTime * 0.6 );
        float cov = smoothstep( 1.0 - uCover - 0.12, 1.0 - uCover + 0.22, c * 0.72 + c2 * 0.28 );
        float m = max( dot( d, uMoon ), 0.0 );
        float edge = cov * ( 1.0 - cov ) * 4.0;
        vec3 col = vec3( 0.022, 0.026, 0.036 ) + vec3( 0.03, 0.034, 0.045 ) * c2;
        col += vec3( 0.32, 0.37, 0.48 ) * pow( m, 14.0 ) * ( 0.25 + edge ) + vec3( 0.05, 0.06, 0.08 ) * pow( m, 3.0 ) * edge;
        // 遠方城市的光害映在雲底 + 兩處火光
        float az = atan( d.z, d.x );
        float low = exp( - up * 9.0 );
        col += vec3( 0.07, 0.045, 0.03 ) * low * cov;
        float fire = exp( - abs( az - 2.35 ) * 7.0 ) + 0.6 * exp( - abs( az + 0.9 ) * 9.0 );
        col += vec3( 0.32, 0.12, 0.03 ) * fire * uFire * exp( - up * 14.0 ) * ( 0.75 + 0.25 * sin( uTime * 2.3 + c * 9.0 ) ) * cov;
        // 閃電:雲朵從內部被照亮
        float fd = max( dot( normalize( d.xz + 1e-4 ), uFlashDir ), 0.0 );
        vec3 fl = vec3( 0.6, 0.66, 0.85 ) * uFlash * ( 0.2 + 0.8 * pow( fd, 4.0 ) ) * ( 0.35 + c2 * 1.1 );
        col += fl * ( 0.4 + cov );
        float a = max( cov * 0.93, uFlash * 0.5 * pow( fd, 2.0 ) ) * smoothstep( -0.03, 0.1, up );
        col = mix( uFog * 1.1, col, smoothstep( -0.02, 0.18, up ) * 0.85 + 0.15 );
        gl_FragColor = vec4( col, a );
      }`,
    transparent: true, depthWrite: false, depthTest: true, fog: false, side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(86, 32, 16), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -900;
  mesh.name = 'storm-clouds';
  return mesh;
}
function skylineMesh() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color() }, uFlash: { value: 0 }, uSeed: { value: 0 }, uFire: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uFog; uniform float uFlash; uniform float uSeed; uniform float uFire;
      varying vec3 vDir;
      ${SKY_NOISE}
      void main() {
        vec3 d = normalize( vDir );
        float az = atan( d.z, d.x ) + uSeed;
        float el = d.y / max( length( d.xz ), 1e-4 );
        // 遠層:密集的低矮樓房
        float u1 = az * 41.0, i1 = floor( u1 ), f1 = fract( u1 );
        float H1 = 0.008 + 0.042 * pow( h1( i1 ), 2.2 ) + 0.012 * step( 0.8, h1( i1 + 3.0 ) ) * step( abs( f1 - 0.5 ), 0.2 );
        float b1 = step( 0.05, f1 ) * step( f1, 0.96 ) * step( el, H1 );
        // 近層:稀疏的高樓(有退縮的屋頂、天線)
        float u2 = az * 15.0 + 3.7, i2 = floor( u2 ), f2 = fract( u2 );
        float on2 = step( 0.42, h1( i2 + 11.0 ) ), w2 = 0.28 + 0.45 * h1( i2 + 5.0 );
        float H2 = 0.035 + 0.1 * pow( h1( i2 + 2.0 ), 1.4 );
        float in2 = on2 * step( abs( f2 - 0.5 ), w2 * 0.5 );
        float top2 = H2 + 0.012 * step( abs( f2 - 0.5 ), w2 * 0.22 );
        float ant = on2 * step( 0.55, h1( i2 + 7.0 ) ) * step( abs( f2 - 0.5 - w2 * 0.15 ), 0.0025 ) * step( el, top2 + 0.03 );
        float b2 = max( in2 * step( el, top2 ), ant );
        float ground = step( el, 0.002 );
        if ( b1 + b2 + ground < 0.5 ) discard;
        bool nearB = b2 > 0.5;
        float haze = smoothstep( -0.06, 0.04, el );
        vec3 col = uFog * mix( 0.62, nearB ? 0.38 : 0.5, haze );
        // 窗戶(少數亮著,偶爾閃爍)
        float k = nearB ? 1700.0 : 2400.0;
        vec2 wq = vec2( az * k, el * k * 1.15 );
        vec2 wi = floor( wq ), wf = fract( wq );
        float win = step( 0.28, wf.x ) * step( wf.x, 0.72 ) * step( 0.3, wf.y ) * step( wf.y, 0.78 ) * step( 0.0005, el ) * ( 1.0 - ground * step( el, 0.0 ) );
        float hw = h2( wi + ( nearB ? 7.0 : 0.0 ) );
        float lit = step( 0.968, hw ) * ( 0.65 + 0.35 * step( 0.3, fract( sin( floor( uTime * ( 0.2 + hw ) + hw * 50.0 ) ) * 4375.85 ) ) );
        vec3 wc = mix( vec3( 1.0, 0.72, 0.42 ), vec3( 0.65, 0.78, 1.0 ), step( 0.988, hw ) );
        col += wc * win * lit * 0.22 * ( b1 + b2 > 0.5 ? 1.0 : 0.0 );
        // 航空障礙燈(天線頂端,慢閃紅光)
        float tip = ant * step( top2 + 0.026, el );
        col += vec3( 1.0, 0.08, 0.05 ) * tip * step( 0.5, fract( uTime * 0.6 + h1( i2 ) ) ) * 2.0 * ( 0.4 + 0.6 * uFire );
        // 閃電時剪影更暗(背光)
        col *= 1.0 - 0.35 * uFlash;
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide, depthWrite: true, depthTest: true, fog: false,
  });
  const g = new THREE.CylinderGeometry(80, 80, 32, 64, 1, true).translate(0, 7, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -999;
  mesh.name = 'skyline';
  return mesh;
}
// 閃電形狀(畫在 canvas 上的分岔閃電)
function boltMesh() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  const branch = (px, py, ang, len, w, depth) => {
    let a = ang;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < len; s += 10) {
      a += (Math.random() - 0.5) * 0.9;
      a = Math.max(Math.PI * 0.2, Math.min(Math.PI * 0.8, a));
      px += Math.cos(a) * 10; py += Math.sin(a) * 10;
      x.lineTo(px, py);
      if (depth < 2 && Math.random() < 0.08) { const sp = [px, py]; x.stroke(); branch(sp[0], sp[1], a + (Math.random() < 0.5 ? -0.6 : 0.6), len * 0.35, w * 0.55, depth + 1); x.beginPath(); x.moveTo(px, py); }
    }
    x.lineWidth = w; x.stroke();
  };
  x.strokeStyle = 'rgba(200,215,255,0.35)'; x.shadowColor = 'rgba(160,180,255,1)'; x.shadowBlur = 18;
  x.lineCap = 'round'; x.lineJoin = 'round';
  branch(128, 0, Math.PI / 2, 520, 9, 0);
  x.strokeStyle = 'rgba(245,248,255,1)'; x.shadowBlur = 6;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: t }, uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }',
    fragmentShader: 'uniform sampler2D uMap; uniform float uA; varying vec2 vUv; void main(){ vec4 c = texture2D( uMap, vUv ); gl_FragColor = vec4( c.rgb * 2.2, c.a * uA ); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 28), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -899;
  mesh.visible = false;
  mesh.name = 'lightning-bolt';
  return mesh;
}

// ======================================================================
// 低霧:貼地霧片
// ======================================================================
function fogSheet(masks, y, channel, i) {
  const L = masks.W * 2, Hh = masks.H * 2;
  const g = new THREE.PlaneGeometry(L + 120, Hh + 120, 1, 1).rotateX(-Math.PI / 2).translate(L / 2 - 2, y, Hh / 2 - 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMask: { value: masks.fogTex }, uMaskXf: { value: masks.xf }, uCol: { value: new THREE.Color() }, uA: { value: 0.16 }, uFog: { value: 0.03 }, uFlash: { value: 0 }, uSeed: { value: i * 17.3 } },
    vertexShader: 'varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; vec4 mv = viewMatrix * w; vD = length( mv.xyz ); gl_Position = projectionMatrix * mv; }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uMask; uniform vec4 uMaskXf; uniform vec3 uCol; uniform float uA; uniform float uFog; uniform float uFlash; uniform float uSeed;
      varying vec3 vW; varying float vD;
      ${SKY_NOISE}
      void main() {
        vec2 p = vW.xz * 0.045 + vec2( uTime * 0.012, uTime * 0.004 ) + uSeed;
        float n = fbm( p ) * 0.7 + fbm( p * 2.6 - vec2( uTime * 0.01, 0.0 ) ) * 0.3;
        float m = texture2D( uMask, vW.xz * uMaskXf.xy + uMaskXf.zw ).${channel};
        float a = smoothstep( 0.32, 0.75, n ) * m * uA * smoothstep( 1.5, 7.0, vD ) * exp( - pow( uFog * vD * 0.5, 2.0 ) * 0.5 );
        if ( a < 0.003 ) discard;
        gl_FragColor = vec4( uCol * ( 1.0 + uFlash * 2.5 ), a );
      }`,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.name = 'fog-bank';
  return mesh;
}

// ======================================================================
// Weather
// ======================================================================
// 地圖天氣設定:地圖資料 layout.weather 或 new Weather(game, cfg) 傳入(兩者都沒有就用預設);
// 區域可在 zone.weather = { rain, fog } 放倍率(玩家進入時平滑過渡)。執行期可 setConfig() 改,換地圖時 dispose()。
export const WEATHER_DEFAULT = {
  rain: 0.78, // 基本雨量 0..1(0 = 不下雨)
  rainVar: 0.28, // 雨量隨時間起伏
  wet: 0.85, // 地面濕度上限(依雨量累積、停雨後慢慢變乾)
  wind: 0.6,
  fog: 1, // 低霧強度倍率(0 = 關)
  fogH: [0.18, 0.55, 0.95], // 地面層霧片高度(公尺,相對地面層)
  roofFog: true, // 頂層戶外平台的霧片
  clouds: 0.62, // 雲量
  skyline: true, skylineSeed: 0, fires: 1, // 城市剪影(種子 = 方位偏移)、地平線火光
  lightning: [14, 40], // 閃電間隔秒數(null = 不打雷)
};
const QLEVEL = { low: 0, medium: 1, high: 2, ultra: 3 };
// 各畫質:雨絲數、近層比例、遠景雨幕層數、濺水數、滴水點數、漣漪層數、燈光倒影、鏡頭雨滴、低霧片數
const Q = {
  streaks: [2500, 6000, 11000, 16000], nearF: [0.25, 0.3, 0.32, 0.32], curtain: [0, 1, 2, 2],
  splash: [0, 300, 600, 1000], drips: [0, 180, 380, 650], ripple: [0, 1, 2, 3], refl: [0, 1, 1, 1], lens: [0, 0, 1, 1], sheets: [0, 2, 3, 3],
};
const DRIFT_WRAP = 60; // 雨絲盒(12m / 30m)的公倍數:風的累積位移在這裡歸零不會跳
const _f = new THREE.Vector3();
export class Weather {
  constructor(game, cfg = null) {
    this.game = game;
    this.ok = false;
    this.cfg = { ...WEATHER_DEFAULT, ...(game.world?.layout?.weather || {}), ...(cfg || {}) };
    try { this.init(game); this.ok = true; } catch (e) { console.warn('[weather] 初始化失敗', e); }
  }
  init(game) {
    const L = game.world.layout, scene = game.scene;
    this.L = L;
    this.root = new THREE.Group();
    this.root.name = 'weather';
    scene.add(this.root);
    const masks = (this.masks = buildMasks(L));
    this.occ = new RainOcclusion(game, L, masks);
    this.rain = streakMesh();
    this.curtain = curtainMesh();
    this.splash = splashMesh();
    this.drips = dripMesh();
    this.clouds = cloudMesh();
    this.skyline = skylineMesh();
    this.bolt = boltMesh();
    const fh = this.cfg.fogH, sheetA = [0.16, 0.12, 0.08];
    this.sheets = [...fh.map((h, i) => fogSheet(masks, masks.gY + h, 'g', i)), fogSheet(masks, masks.topY + 0.3, 'b', 9)];
    this.sheets.forEach((sh, i) => (sh.userData.a = i < fh.length ? sheetA[Math.min(i, 2)] : 0.1));
    this.root.add(this.rain, this.curtain, this.splash, this.drips, this.clouds, this.skyline, this.bolt, ...this.sheets);
    // 戶外地板變濕(結構材質:先注入再交給原本的 hook);窗玻璃的水珠/水痕
    // [水窪, 變暗, 光澤](r2:整夜的雨 → 泥土/柏油/鋪面再暗一點;凹處積水見 wet.js uCav)
    const WETS = { asphalt: [0.85, 0.46, 0.6], paving: [0.6, 0.42, 0.55], gravel: [0.25, 0.38, 0.45], grass: [0.0, 0.22, 0.3], roof_gravel: [0.55, 0.36, 0.5], metal_grate: [0, 0.15, 0.5], soil: [0.8, 0.48, 0.5] };
    for (const [k, [pd, d, gl]] of Object.entries(WETS)) { try { makeWet(surf(k), { puddle: pd, darken: d, gloss: gl }); } catch { /* 沒有這個材質 */ } }
    try { makeGlassWet(surf('glass')); } catch { /* 沒有玻璃 */ }
    // 殭屍淋到雨時皮膚/衣服/頭髮變濕亮(同一套逐像素淋雨判定:室內、屋簷下的不會濕;開機預編譯前就注入,不會遊戲中途重編)
    try { const ZM = zombieMaterials(); makeWet(ZM.skin, { darken: 0.08, gloss: 0.6 }); makeWet(ZM.cloth, { darken: 0.3, gloss: 0.42 }); makeWet(ZM.hair, { darken: 0.25, gloss: 0.5 }); } catch (e) { console.warn('[weather] 殭屍濕潤材質失敗', e); }
    // 燈具調整(閃爍路燈、跟著亮度的燈罩)
    this.mods = [];
    const fx = game.hospital?.lights?.fixtures || [];
    for (const md of LIGHT_MODS) {
      let best = null, bd = 0.6;
      for (const f of fx) { const d = Math.abs(f.x - md.x) + Math.abs(f.y - md.y) + Math.abs(f.z - md.z); if (d < bd) { bd = d; best = f; } }
      if (!best) continue;
      if (md.mode) best.mode = md.mode;
      if (md.state !== undefined) best.state = md.state;
      if (md.glow !== undefined) best.glow = md.glow;
      if (md.mat) this.mods.push({ f: best, m: md.mat, ei: md.ei ?? md.mat.emissiveIntensity });
    }
    this.glows = GLOWS.slice();
    // 閃電
    this.atmo = game.hospital?.atmo || null;
    this.moonBase = this.atmo ? this.atmo.moon.intensity : 0;
    this.moonCol = this.atmo ? this.atmo.moon.color.clone() : new THREE.Color();
    this.flashCol = new THREE.Color(0xc8d8ff);
    this.nextStrike = 6 + Math.random() * 10;
    this.strikeT = -99; this.strikeK = 1; this.thunderAt = -1; this.thunderDist = 1500;
    this.flash = 0;
    this.rainK = this.cfg.rain;
    this.wet = this.cfg.rain > 0 ? this.cfg.wet : 0; // 開場時已經下了好一陣子
    this.pud = this.wet;
    this.zoneK = { rain: 1, fog: 1 };
    this.drift = new THREE.Vector2();
    this.camPrev = new THREE.Vector3(); this.camV = new THREE.Vector3(); this.camInit = false;
    this.lensAmt = 0;
    this.audioT = 0; this.audioOut = 0; this.drum = 0;
    this.q = -1;
    this.t = 0;
    // 遮雨高度圖:先烘一次(之後下載的模型進場景時節流重烘);完成後重新取屋簷滴水點
    this.occ.onBake = () => this.placeDrips();
    // [perf] game.deferRainBake:分時載入時先不烘(第一次烘焙要上傳全部幾何,~0.3-0.5 秒長任務);main.js 在幾何分批上傳完後才烘
    this.bakeNow = () => { try { this.occ.bake([this.root]); this.occ.lastBake = 0; } catch (e) { console.warn('[weather] 遮雨圖烘焙失敗', e); } };
    if (!game.deferRainBake) this.bakeNow();
    this.applyConfig();
    // 每幀更新:接在 hospital.update 之後(atmosphere 已先設好霧色/環境光)
    const H = (this.H = game.hospital);
    if (H && typeof H.update === 'function') {
      const base = (this.baseUpdate = H.update);
      this.hook = (time, dt, player) => { base.call(H, time, dt, player); this.update(time, dt, player); };
      H.update = this.hook;
    }
    // 後處理建好時(post.js 會呼叫 hospital.attachRenderer)插入鏡頭雨滴 pass
    if (H && typeof H.attachRenderer === 'function') {
      const baseA = (this.baseAttach = H.attachRenderer);
      this.attachHook = (r, g) => { const res = baseA.call(H, r, g); this.attachPost(g || game); return res; };
      H.attachRenderer = this.attachHook;
    } else if (game.composer) this.attachPost(game);
  }
  attachPost(game) {
    const c = game.composer;
    if (!c || this.lens) return;
    try {
      this.lens = lensPass();
      this.lens.hzName = 'lens'; // GPU 分段計時的名稱(src/gfx/gpuprof.js)
      let i = c.passes.indexOf(game.bloom);
      if (i < 0) i = c.passes.indexOf(game.post);
      if (i < 0) i = Math.max(0, c.passes.length - 1);
      c.insertPass(this.lens, i);
      this.lens.enabled = true; // 開著讓 boot 的 precompilePasses 編好;第一次 update 再依狀態關掉
    } catch (e) { console.warn('[weather] 鏡頭雨滴 pass 失敗', e); this.lens = null; }
  }
  // 遮雨圖讀回後重新找屋簷滴水點(分幀掃描,見 update)
  placeDrips() { this.occ.edgesStart(800, 7); }

  // 執行期改設定(換地圖、劇情雨變大…):只覆蓋給的欄位
  setConfig(cfg) { Object.assign(this.cfg, cfg || {}); if (this.ok) this.applyConfig(); }
  applyConfig() {
    const c = this.cfg;
    const ku = this.skyline.material.uniforms;
    ku.uSeed.value = c.skylineSeed || 0; ku.uFire.value = c.fires ?? 1;
    this.clouds.material.uniforms.uFire.value = c.fires ?? 1;
    this.skyline.userData.on = !!c.skyline;
    if (!c.lightning) this.nextStrike = Infinity;
    else if (!Number.isFinite(this.nextStrike)) this.nextStrike = this.t + c.lightning[0];
    this.applyQuality();
  }
  applyQuality() {
    const q = this.game.quality;
    const lv = q ? (QLEVEL[q.preset] ?? 2) : 2;
    const fogQ = q ? q.get('fog') : 'high';
    this.q = lv;
    ENV.q = lv;
    const rainy = this.cfg.rain > 0;
    this.rain.geometry.instanceCount = rainy ? Q.streaks[lv] : 0;
    this.rain.material.uniforms.uNearF.value = Q.nearF[lv];
    this.splash.geometry.instanceCount = rainy ? Q.splash[lv] : 0;
    this.drips.geometry.instanceCount = rainy ? Math.min(Q.drips[lv], this.drips.userData.n || 0) : 0;
    const cg = this.curtain.geometry, per = cg.userData.perLayer, nc = rainy ? Q.curtain[lv] : 0;
    cg.setDrawRange(nc >= 2 ? 0 : per, nc >= 2 ? per * 2 : nc === 1 ? per : 0);
    this.curtain.userData.on = nc > 0;
    this.lensOn = !!Q.lens[lv];
    const ns = fogQ === 'low' || !this.cfg.fog ? 0 : Q.sheets[lv], nG = this.cfg.fogH.length;
    this.sheets.forEach((s, i) => { s.userData.on = i < nG ? i < Math.min(nG, ns) : this.cfg.roofFog && ns >= 2 && this.masks.roofCells > 8; });
    WET.uRipple.value = Q.ripple[lv];
    WET.uWRefl.value = Q.refl[lv];
    WET.uExpT.value = lv >= 1 ? 4 : 1;
  }

  update(time, dt, player) {
    if (!this.ok) return;
    const g = this.game, cam = g.camera, cfg = this.cfg;
    if (!this.qOff && g.quality) { this.applyQuality(); this.qOff = g.quality.on('change', () => this.applyQuality()); }
    this.t += dt;
    const t = this.t;
    // ---- 共用狀態 ----
    const p = player?.pos || cam.position;
    ENV.t = t; ENV.dt = dt; ENV.px = p.x; ENV.py = p.y; ENV.pz = p.z;
    const gust = Math.max(0, noise1(t * 0.13) * 0.9 + noise1(t * 0.41 + 7) * 0.35) * (cfg.wind / 0.6);
    ENV.gust = gust;
    ENV.wind = cfg.wind * (0.9 + 0.4 * noise1(t * 0.05 + 3));
    WIND.uWindT.value = t % 3600; WIND.uWind.value = ENV.wind; WIND.uGust.value = gust;
    // 區域倍率(zone.weather)平滑過渡
    const zw = this.H?.zone?.weather, zk = Math.min(1, dt * 1.5);
    this.zoneK.rain += ((zw?.rain ?? 1) - this.zoneK.rain) * zk;
    this.zoneK.fog += ((zw?.fog ?? 1) - this.zoneK.fog) * zk;
    // 雨量:緩慢變化(毛毛雨 ↔ 大雨)
    const base = cfg.rain;
    const target = base > 0 ? clamp(base + cfg.rainVar * noise1(t * 0.011 + 1.3) + cfg.rainVar * 0.5 * Math.max(0, noise1(t * 0.037)), 0.15, 1) : 0;
    this.rainK += (target - this.rainK) * Math.min(1, dt * 0.2);
    const rk = this.rainK * this.zoneK.rain;
    ENV.rain = rk;
    // 濕度:下雨時累積(雨越大越快),停雨後慢慢變乾;水窪水位跟得更慢
    const wetT = cfg.wet * clamp(rk * 1.8, 0, 1);
    this.wet += wetT > this.wet ? (wetT - this.wet) * Math.min(1, dt * (0.015 + 0.08 * rk)) : (wetT - this.wet) * Math.min(1, dt * 0.006);
    this.pud += (this.wet - this.pud) * Math.min(1, dt * (this.wet > this.pud ? 0.02 : 0.004));
    ENV.wet = WET.uWet.value = clamp(this.wet, 0, 1);
    WET.uPudLv.value = clamp(this.pud, 0, 1);
    WET.uRain.value = rk;
    WET.uRainT.value = t % 1000;
    const out = this.atmo ? this.atmo.current.out : 1;
    ENV.out = out;
    // ---- 遮雨高度圖:下載的模型進場景後重烘;屋簷滴水點分幀掃描 ----
    this.occ.maybeRebake(t, assets, [this.root]);
    if (this.occ.edgeJob) { const list = this.occ.edgesStep(1.5); if (list) { setDrips(this.drips, list); this.applyQuality(); } }
    // ---- 玩家附近有沒有露天 ----
    const L = this.L;
    const li = Math.max(0, L.levelOfY(p.y + 0.3));
    const c = Math.floor(p.x / L.CELL), r = Math.floor(p.z / L.CELL);
    const nearOpen = c < 0 || r < 0 || c >= L.W || r >= L.H || this.masks.near[li][r * L.W + c] === 1;
    const under = li < this.masks.gLi; // 地下室
    // ---- 鏡頭速度(動態模糊用;瞬移時歸零)----
    if (!this.camInit) { this.camPrev.copy(cam.position); this.camInit = true; }
    _f.copy(cam.position).sub(this.camPrev).divideScalar(Math.max(dt, 1e-3));
    if (_f.lengthSq() > 15 * 15) _f.set(0, 0, 0);
    this.camV.lerp(_f, Math.min(1, dt * 12));
    this.camPrev.copy(cam.position);
    // ---- 雨 ----
    const raining = nearOpen && rk > 0.01 && !under;
    const windX = 0.5 + 1.5 * ENV.wind + gust * 2.2, windZ = 0.25 + 0.7 * gust;
    this.drift.x = (this.drift.x + windX * dt) % DRIFT_WRAP;
    this.drift.y = (this.drift.y + windZ * dt) % DRIFT_WRAP;
    const fogD = g.scene.fog ? g.scene.fog.density : 0.03;
    RL.uCam.value.copy(cam.position);
    RL.uTime.value = t % 2000;
    RL.uFogD.value = fogD;
    if (rk > 0.01 && !under) updateRainLights(g, this.occ, this.flash, this.moonBase, this.masks.gY); // 濕地倒影也用(室內看得到窗外)
    cam.getWorldDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1);
    _f.normalize();
    const ru = this.rain.material.uniforms;
    this.rain.visible = raining && this.rain.geometry.instanceCount > 0;
    ru.uCtr.value.copy(cam.position).addScaledVector(_f, 10);
    ru.uDrift.value.copy(this.drift);
    ru.uWindV.value.set(windX, 0, windZ);
    ru.uCamV.value.copy(this.camV);
    ru.uInt.value = Math.min(1, 0.25 + 0.8 * rk);
    const h = g.renderer.domElement.height || 720;
    ru.uPx.value = 2 / (h * cam.projectionMatrix.elements[5]);
    const cu2 = this.curtain.material.uniforms;
    this.curtain.visible = raining && !!this.curtain.userData.on;
    cu2.uWindV.value.set(windX, 0, windZ); cu2.uInt.value = rk;
    const su = this.splash.material.uniforms;
    this.splash.visible = raining && this.splash.geometry.instanceCount > 0;
    su.uCtr.value.copy(cam.position).addScaledVector(_f, 5); su.uInt.value = Math.min(1, 0.2 + rk);
    const du = this.drips.material.uniforms;
    this.drips.visible = raining && this.drips.geometry.instanceCount > 0;
    du.uRain.value = rk; du.uPx.value = ru.uPx.value;
    // ---- 鏡頭雨滴:露天 × 抬頭 → 累積;否則慢慢蒸發 ----
    if (this.lens) {
      const exposedCam = raining && this.occ.exposed(cam.position.x, cam.position.y, cam.position.z);
      const pitch = player?.pitch ?? 0;
      const hit = exposedCam && this.lensOn ? rk * Math.pow(clamp((pitch + 0.1) / 0.9, 0, 1), 1.5) : 0;
      this.lensAmt = clamp(this.lensAmt + hit * dt * 0.2 - dt * (hit > 0 ? 0.015 : 0.05), 0, 0.32);
      if (!this.lensOn) this.lensAmt = 0;
      this.lens.enabled = this.lensAmt > 0.01;
      const lu = this.lens.uniforms;
      lu.uAmt.value = this.lensAmt; lu.uTime.value = t % 1000;
      lu.uAspect.value = cam.aspect || 1.7;
    }
    // ---- 雨聲(10Hz)----
    this.audioT -= dt;
    if (this.audioT <= 0) { this.audioT = 0.1; this.updateAudio(p, li, rk, under); }
    // ---- 天空層跟著鏡頭 ----
    this.clouds.position.copy(cam.position);
    this.skyline.position.copy(cam.position);
    const cu = this.clouds.material.uniforms, ku = this.skyline.material.uniforms;
    const fogC = g.scene.fog ? g.scene.fog.color : this.moonCol;
    cu.uTime.value = t % 5000; ku.uTime.value = t % 5000;
    cu.uFog.value.copy(fogC); ku.uFog.value.copy(fogC);
    cu.uWind.value.set(0.006 + 0.01 * ENV.wind, 0.003);
    cu.uCover.value = cfg.clouds + 0.25 * rk;
    this.clouds.visible = !under;
    this.skyline.visible = !under && !!this.skyline.userData.on;
    // ---- 霧片 ----
    const nG = cfg.fogH.length;
    for (let i = 0; i < this.sheets.length; i++) {
      const s = this.sheets[i];
      s.visible = !!s.userData.on && !under && (i < nG ? li <= this.masks.gLi + 1 || out > 0.5 : li >= L.levels.length - 2);
      if (!s.visible) continue;
      const u = s.material.uniforms;
      u.uTime.value = t % 5000; u.uFog.value = fogD; u.uFlash.value = this.flash * out;
      u.uA.value = s.userData.a * cfg.fog * this.zoneK.fog;
      u.uCol.value.copy(fogC).multiplyScalar(1.6).addScalar(0.015);
    }
    // ---- 閃電 ----
    this.updateLightning(t, dt, out, under);
    // ---- 燈具/霓虹 ----
    for (let i = 0; i < this.mods.length; i++) { const md = this.mods[i]; md.m.emissiveIntensity = md.ei * (md.f.cur ?? 1); }
    for (let i = 0; i < this.glows.length; i++) { const gl = this.glows[i]; gl.m.emissiveIntensity = gl.ei * gl.fn(t); }
    // 下雨時能見度稍差
    if (g.scene.fog && out > 0.01) g.scene.fog.density *= 1 + 0.18 * rk * out;
  }

  // 雨聲:頭頂露天 = 1;否則找附近(1.2~8m)淋得到雨的點,中間的牆擋住、窗戶削弱 → 室外程度;
  // 低矮的遮蔽(雨棚、屋簷、車庫)下雨打在頂上更響(雨量略增)
  updateAudio(p, li, rk, under) {
    const occ = this.occ, L = this.L, eye = p.y + 1.6;
    let o = 0, drum = 0;
    if (!under && rk > 0.005) {
      if (occ.exposed(p.x, eye, p.z)) o = 1;
      else {
        const roof = occ.heightAt(p.x, p.z) - eye;
        for (let ri = 0; ri < 5 && o < 0.95; ri++) {
          const rr = [1.2, 2.5, 4, 6, 8.5][ri];
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + ri * 0.3;
            const x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
            if (!occ.exposed(x, p.y + 0.3, z)) continue;
            const tr = this.losTrans(li, p.x, p.z, x, z);
            if (tr > 0) o = Math.max(o, tr * (1 - rr / 11));
          }
        }
        o *= 0.9;
        if (o > 0.3 && roof < 3.5) drum = clamp(1 - roof / 3.5, 0, 1) * clamp((o - 0.3) / 0.4, 0, 1);
      }
    }
    this.audioOut += (o - this.audioOut) * 0.35;
    this.drum = drum;
    try { sfx.setRain(rk > 0.005 && !under ? Math.min(1, rk * (1 + 0.35 * drum)) : 0, this.audioOut); } catch { /* 音效失敗不影響遊戲 */ }
  }
  // 玩家層的格子視線:牆擋住、窗戶剩 35%、門 80%
  losTrans(li, x0, z0, x1, z1) {
    const L = this.L, d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.5));
    let tr = 1, pc = -999, pr = -999;
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const c = Math.floor(x / L.CELL), r = Math.floor(z / L.CELL);
      if (c === pc && r === pr) continue;
      pc = c; pr = r;
      if (c < 0 || r < 0 || c >= L.W || r >= L.H) continue;
      const ch = L.charAt(li, c, r);
      if (ch === '#' || ch === 'E') return 0;
      if (ch === 'W') tr *= 0.35;
      else if (ch === '+') tr *= 0.8;
    }
    return tr;
  }

  updateLightning(t, dt, out, under) {
    if (t > this.nextStrike && this.cfg.lightning) this.strike(t);
    // 閃光波形:主閃 + 兩次餘閃
    const k = t - this.strikeT;
    let f = 0;
    if (k >= 0 && k < 1.2) {
      f = Math.exp(-(((k - 0.03) / 0.045) ** 2)) + 0.55 * Math.exp(-(((k - 0.21) / 0.05) ** 2)) + 0.8 * Math.exp(-(((k - 0.46) / 0.07) ** 2)) + 0.25 * Math.exp(-(((k - 0.75) / 0.12) ** 2));
      f = Math.min(1, f) * this.strikeK;
    }
    this.flash = f;
    ENV.flash = f;
    const vis = under ? 0 : 1;
    this.clouds.material.uniforms.uFlash.value = f * vis;
    this.skyline.material.uniforms.uFlash.value = f * vis;
    this.bolt.visible = !!this.boltShow && vis > 0 && k >= 0 && k < 0.55 && f > 0.25;
    if (this.bolt.visible) { this.bolt.position.copy(this.boltOff).add(this.game.camera.position); this.bolt.material.uniforms.uA.value = Math.min(1, f * 1.3); }
    // 月光平行光閃一下(陰影擋住室內;沒開陰影時只在戶外閃)
    if (this.atmo) {
      const sh = this.game.renderer.shadowMap.enabled ? 1 : out;
      const moon = this.atmo.moon;
      if (f > 0.001 || this._flashOn) {
        moon.intensity = this.moonBase + f * 9 * sh * vis;
        moon.color.copy(this.moonCol).lerp(this.flashCol, Math.min(1, f * 1.5));
        this.atmo.hemi.intensity += f * 0.9 * out * vis;
        if (this.game.scene.fog) this.game.scene.fog.color.addScalar(f * 0.05 * out * vis);
        this._flashOn = f > 0.001;
      }
    }
    // 沒有 sfx.thunder 時的備援:環境音事件(延遲到聲音抵達才播)
    if (this.thunderAt > 0 && t >= this.thunderAt) {
      this.thunderAt = -1;
      try { AUDIO?.AMB?.EVENTS?.thunder?.(); } catch { /* 音效失敗不影響遊戲 */ }
    }
  }
  // 打一道閃電(劇情/除錯也可呼叫:game.weather.strike())
  strike(t = this.t) {
    const [a0, a1] = this.cfg.lightning || [14, 40];
    this.strikeT = t;
    this.nextStrike = t + a0 + Math.random() * (a1 - a0);
    const a = Math.random() * Math.PI * 2;
    this.clouds.material.uniforms.uFlashDir.value.set(Math.cos(a), Math.sin(a));
    const dist = Math.random() ** 0.7; // 0 近 .. 1 遠
    this.strikeK = 1.05 - dist * 0.5;
    this.thunderDist = 300 + dist * 5200; // 公尺
    // 雷聲:閃電亮起的當下呼叫,音效模組依聲速(343m/s,最多 8 秒)延遲
    try {
      if (typeof sfx.thunder === 'function') sfx.thunder(this.thunderDist);
      else this.thunderAt = t + Math.min(8, this.thunderDist / 343);
    } catch { /* 音效失敗不影響遊戲 */ }
    this.boltShow = Math.random() < 0.65 - dist * 0.25;
    this.bolt.position.set(Math.cos(a) * 78, 14 + Math.random() * 4, Math.sin(a) * 78);
    this.bolt.lookAt(0, this.bolt.position.y, 0);
    this.bolt.scale.set(Math.random() < 0.5 ? -1 : 1, 1, 1);
    this.boltOff = this.bolt.position.clone();
  }

  // 換地圖 / 關閉時呼叫:拆掉每幀掛勾、移除網格、釋放 GPU 資源、恢復月光與乾地面
  dispose() {
    if (this.H && this.H.update === this.hook) this.H.update = this.baseUpdate;
    if (this.H && this.H.attachRenderer === this.attachHook) this.H.attachRenderer = this.baseAttach;
    if (this.qOff) { this.qOff(); this.qOff = null; }
    if (this.atmo) { this.atmo.moon.intensity = this.moonBase; this.atmo.moon.color.copy(this.moonCol); }
    if (this.lens) {
      const c = this.game.composer;
      if (c) { const i = c.passes.indexOf(this.lens); if (i >= 0) c.passes.splice(i, 1); }
      this.lens.dispose?.();
      this.lens = null;
    }
    try { sfx.setRain(0, 0); } catch { /* 忽略 */ }
    if (this.root) {
      this.root.parent?.remove(this.root);
      const seen = new Set();
      this.root.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const m = o.material;
        if (m && !seen.has(m)) {
          seen.add(m);
          for (const v of Object.values(m.uniforms || {})) { const tx = v?.value; if (tx?.isTexture && !seen.has(tx) && tx !== OCC.uOcc.value) { seen.add(tx); tx.dispose(); } }
          m.dispose();
        }
      });
    }
    this.occ?.dispose();
    this.masks?.rainTex.dispose(); this.masks?.fogTex.dispose();
    OCC.uOcc.value = null; OCC.uOccOn.value = 0;
    WET.uWet.value = 0; WET.uRain.value = 0; WET.uPudLv.value = 0; ENV.flash = 0; ENV.rain = 0;
    RL.uRLN.value = 0;
    this.mods = []; this.glows = [];
    this.ok = false;
  }
}
