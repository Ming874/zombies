import * as THREE from 'three';
import { OCC, OCC_GLSL, WL, WL_MAX } from './wet.js';

// 雨(全部在 GPU:實例化四邊形在頂點著色器裡循環、受光、遮蔽;CPU 每幀只更新 uniform):
//  - 雨絲:近層(鏡頭周圍 12m 盒)+ 中層(30m 盒,往視線方向偏移);每滴依「相對鏡頭的速度 × 曝光時間」拉成動態模糊的細線,
//         寬度不足一像素時改成降低覆蓋率(髮絲般的細線,不是方塊)。亮度 = 場景光照:光源池的點光源(依前向散射相位,
//         逆光的雨滴最亮)、手電筒錐(背向散射閃光)、閃電、極弱的環境光 → 暗處幾乎看不到,路燈與手電筒前一片雨幕
//  - 遠景雨幕:兩層跟著鏡頭的圓柱殼,程式產生的細密雨紋 + 光源附近的雨霧光暈,隨霧淡出
//  - 濺水:落在遮雨高度圖上(地面、車頂、長椅、雨棚頂…)的小水冠與飛濺水珠
//  - 屋簷滴水:烘焙出的邊緣點,水珠在邊緣長大 → 落下 → 濺開
//  - 遮蔽:每滴查遮雨高度圖(屋頂/遮雨棚/室內沒有雨)

// ---- 共用光照 uniform(每幀由 updateRainLights 寫入)----
export const RL_MAX = 14;
export const RL = {
  uRLPos: { value: Array.from({ length: RL_MAX }, () => new THREE.Vector4()) }, // xyz 位置, w 範圍
  uRLCol: { value: Array.from({ length: RL_MAX }, () => new THREE.Vector4()) }, // rgb 顏色×強度, w 衰減指數
  uRLN: { value: 0 },
  uFlPos: { value: new THREE.Vector3() }, uFlDir: { value: new THREE.Vector3(0, 0, -1) }, uFlCol: { value: new THREE.Vector3() },
  uFlCone: { value: new THREE.Vector4(0.8, 0.99, 30, 1.8) }, // 外圈 cos、內圈 cos、範圍、衰減
  uRAmb: { value: new THREE.Vector3(0.002, 0.0024, 0.003) },
  uFogD: { value: 0.03 },
  uCam: { value: new THREE.Vector3() },
  uTime: { value: 0 },
};
const LIGHT_GLSL = /* glsl */`
#define RL_MAX ${RL_MAX}
uniform vec4 uRLPos[ RL_MAX ]; uniform vec4 uRLCol[ RL_MAX ]; uniform int uRLN;
uniform vec3 uFlPos; uniform vec3 uFlDir; uniform vec3 uFlCol; uniform vec4 uFlCone; uniform vec3 uRAmb; uniform float uFogD;
uniform vec3 uCam; uniform float uTime;
// 雨滴受光:vd = 鏡頭 → 雨滴的單位向量。點光源用前向散射(光源在雨滴後方時最亮),手電筒用背向閃光
vec3 rainLight( vec3 p, vec3 vd ) {
  vec3 c = uRAmb;
  for ( int i = 0; i < RL_MAX; i ++ ) {
    if ( i >= uRLN ) break;
    vec3 dl = p - uRLPos[ i ].xyz;
    float d2 = max( dot( dl, dl ), 0.09 ), d = sqrt( d2 );
    float r = uRLPos[ i ].w;
    float win = r > 0.0 ? clamp( 1.0 - pow( d / r, 4.0 ), 0.0, 1.0 ) : 1.0;
    float cs = - dot( dl / d, vd );
    float ph = 0.35 + 2.6 * pow( max( cs, 0.0 ), 5.0 ) + 0.3 * pow( max( - cs, 0.0 ), 6.0 );
    c += uRLCol[ i ].rgb * ( win * win * ph / pow( d, uRLCol[ i ].w ) );
  }
  vec3 fl = p - uFlPos;
  float fd = length( fl ) + 1e-3;
  vec3 fdir = fl / fd;
  float cone = smoothstep( uFlCone.x, uFlCone.y, dot( fdir, uFlDir ) );
  float fwin = clamp( 1.0 - pow( fd / uFlCone.z, 4.0 ), 0.0, 1.0 );
  float fph = 0.45 + 1.1 * pow( max( dot( fdir, vd ), 0.0 ), 10.0 );
  c += uFlCol * ( cone * fwin * fwin * fph / max( pow( fd, uFlCone.w ), 0.25 ) );
  return c;
}
float rainFog( float d ) { float f = uFogD * d; return exp( - f * f ); }
// 亮度軟壓縮:貼近光源的雨滴不會爆白,遠一點的仍看得到(1/d² 的動態範圍太大)
// 先做感知壓縮(亮度^0.6,保留色相):逆光的雨滴是高對比的閃點,路燈周圍幾公尺都看得到雨,不只燈泡旁邊
vec3 rainSat( vec3 c ) { float m = max( c.r, max( c.g, c.b ) ); c *= pow( max( m, 1e-6 ), - 0.4 ); m = pow( max( m, 1e-6 ), 0.6 ); return c / ( 1.0 + m * 0.7 ); }
`;
const seeds = (n, k = 4) => { const a = new Float32Array(n * k); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
const quadGeo = (n, pos) => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(n), 4));
  g.instanceCount = 0;
  return g;
};
const mk = (geo, mat, name, order) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = order; m.name = name; return m; };

// ======================================================================
// 雨絲
// ======================================================================
export const STREAK_MAX = 18000;
export function streakMesh() {
  const g = quadGeo(STREAK_MAX, [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...RL, ...OCC,
      uBoxN: { value: new THREE.Vector3(12, 10, 12) }, uBoxM: { value: new THREE.Vector3(30, 18, 30) }, uNearF: { value: 0.22 },
      uCtr: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector2() }, uWindV: { value: new THREE.Vector3() }, uCamV: { value: new THREE.Vector3() },
      uFall: { value: 8.5 }, uExpo: { value: 0.032 }, uInt: { value: 1 }, uPx: { value: 0.0015 }, uK: { value: 0.45 }, uTint: { value: new THREE.Color(0.86, 0.93, 1.0) },
    },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      ${LIGHT_GLSL}
      ${OCC_GLSL}
      uniform vec3 uBoxN; uniform vec3 uBoxM; uniform float uNearF; uniform vec3 uCtr; uniform vec2 uDrift; uniform vec3 uWindV; uniform vec3 uCamV;
      uniform float uFall; uniform float uExpo; uniform float uInt; uniform float uPx; uniform float uK;
      varying vec3 vCol; varying vec2 vUv; varying float vA;
      void main() {
        float nearL = step( aSeed.w, uNearF );
        vec3 B = mix( uBoxM, uBoxN, nearL );
        float h = fract( aSeed.w * 13.7 ), h2 = fract( aSeed.w * 71.3 );
        float diam = 0.0015 + 0.003 * h * h; // 雨滴直徑 1.5~4.5mm
        float sp = 0.72 + 0.32 * sqrt( h ); // 大雨滴落得快
        vec3 ctr = mix( uCtr, uCam, nearL );
        vec3 base = ctr - B * 0.5;
        vec3 off = vec3( uDrift.x, - uTime * uFall * sp, uDrift.y );
        vec3 rel = mod( aSeed.xyz * B + off - base, B ) / B;
        vec3 p = base + rel * B;
        // 小擾動:陣風下雨絲不完全平行
        p.x += sin( uTime * ( 1.3 + h2 ) + aSeed.x * 40.0 ) * 0.04;
        p.z += cos( uTime * ( 1.1 + h ) + aSeed.z * 40.0 ) * 0.04;
        vec3 vel = vec3( uWindV.x * ( 0.85 + 0.3 * h2 ), - uFall * sp, uWindV.z * ( 0.85 + 0.3 * h2 ) );
        vec3 vr = vel - uCamV; // 相對鏡頭的速度 → 動態模糊方向與長度
        vec3 tail = p - vr * uExpo;
        vec4 hv = viewMatrix * vec4( p, 1.0 ), tv = viewMatrix * vec4( tail, 1.0 );
        float dist = max( - hv.z, 0.01 );
        // 螢幕上的方向(太短時當成點)
        vec2 sh = hv.xy / max( - hv.z, 0.05 ), st = tv.xy / max( - tv.z, 0.05 );
        vec2 sd = st - sh;
        float sl = length( sd );
        vec2 dir = sl > 1e-5 ? sd / sl : vec2( 0.0, - 1.0 );
        vec2 nrm = vec2( - dir.y, dir.x );
        float w = max( diam, uPx * dist * 1.3 );
        float w0 = w;
        w += 0.006 * ( 1.0 - smoothstep( 0.3, 1.8, dist ) ); // 太近的雨滴失焦:變寬變淡
        vec4 v = mix( hv, tv, position.y );
        v.xy += nrm * position.x * w + dir * ( position.y - 0.5 ) * w; // 兩端各延伸半個寬度(點狀時是圓點)
        float occ = occH( p.xz );
        float edge = ( 1.0 - smoothstep( 0.4, 0.5, max( abs( rel.x - 0.5 ), abs( rel.z - 0.5 ) ) ) ) * smoothstep( 0.0, 0.06, rel.y ) * ( 1.0 - smoothstep( 0.92, 1.0, rel.y ) );
        float cover = sqrt( clamp( diam / w0, 0.01, 1.0 ) ) * ( w0 / w ); // 次像素:改用覆蓋率(開根號:受光雨滴是很亮的閃點,遠處仍看得到)
        vec3 vd = ( p - uCam ) / max( length( p - uCam ), 1e-3 );
        vec3 L = rainLight( p, vd );
        vA = step( occ, p.y ) * edge * smoothstep( 0.2, 0.6, dist ) * cover * rainFog( dist ) * step( fract( aSeed.w * 7.31 ), uInt );
        vCol = rainSat( L * uK * ( 0.45 + 1.1 * h2 * h2 ) ); // 每滴的閃光程度不同(大小、角度)
        vUv = vec2( position.x + 0.5, position.y );
        gl_Position = projectionMatrix * v;
        if ( vA < 0.0005 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform float uK; uniform vec3 uTint;
      varying vec3 vCol; varying vec2 vUv; varying float vA;
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        float core = exp( - x * x * 3.0 );
        float along = smoothstep( 0.0, 0.18, vUv.y ) * ( 1.0 - smoothstep( 0.72, 1.0, vUv.y ) );
        float a = vA * core * along;
        if ( a < 0.0008 ) discard;
        // 折射色調:雨滴偏冷、中心較白
        vec3 c = vCol * mix( uTint, vec3( 1.0 ), core * 0.5 );
        gl_FragColor = vec4( c * a, 8.0 ); // a = 8:[gpu] TAA 反應式標記(src/gfx/gbuf.js);加法混合不用 alpha
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, // 螢幕空間展開的四邊形方向不固定
  });
  // 加法混合直接用 (c*a, 1):src 係數 ONE(避免 alpha 在半精度裡被壓掉)
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation;
  return mk(g, m, 'rain', 20);
}

// ======================================================================
// 遠景雨幕(跟著鏡頭的兩層圓柱殼,逐頂點受光)
// ======================================================================
export function curtainMesh() {
  const radii = [15, 30], seg = 56, rings = 8, H = 30;
  const pos = [], lay = [], idx = [];
  radii.forEach((R, li) => {
    const o = pos.length / 3;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * R, (j / rings - 0.5) * H, Math.sin(a) * R);
      lay.push(li);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = o + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLay', new THREE.Float32BufferAttribute(lay, 1));
  g.setIndex(idx);
  g.setDrawRange(0, idx.length);
  g.userData.perLayer = rings * seg * 6;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...RL, ...OCC, uWindV: { value: new THREE.Vector3() }, uFall: { value: 8.5 }, uInt: { value: 1 }, uK: { value: 0.45 }, uHaze: { value: 0.05 }, uFlash: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aLay;
      ${LIGHT_GLSL}
      uniform float uK;
      varying vec3 vW; varying vec3 vL; varying float vLay; varying float vD;
      void main() {
        vec3 w = position + uCam;
        vW = w; vLay = aLay;
        vec3 vd = normalize( position );
        vL = rainSat( rainLight( w, vd ) * uK );
        vec4 mv = viewMatrix * vec4( w, 1.0 );
        vD = length( position );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${OCC_GLSL}
      uniform vec3 uCam; uniform float uTime; uniform float uFogD; uniform vec3 uWindV; uniform float uFall; uniform float uInt; uniform float uK; uniform float uHaze; uniform float uFlash;
      varying vec3 vW; varying vec3 vL; varying float vLay; varying float vD;
      float ch( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
      float ch2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float cn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( ch2( i ), ch2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ch2( i + vec2( 0.0, 1.0 ) ), ch2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
      void main() {
        if ( vW.y < occH( vW.xz ) ) discard;
        vec3 rp = vW - uCam;
        float ang = atan( rp.z, rp.x );
        vec2 tg = vec2( - sin( ang ), cos( ang ) );
        float u = ang * vD; // 沿圓周的公尺
        float slant = dot( uWindV.xz, tg ) / uFall;
        float y = vW.y;
        float cw = 0.045 * vD / 15.0;
        float uu = ( u + y * slant ) / cw;
        float ci = floor( uu ), fx = fract( uu ) - 0.5;
        float hc = ch( ci + vLay * 113.0 );
        float sp = 0.8 + 0.4 * hc;
        float seg = 1.4;
        float yy = ( y + uTime * uFall * sp ) / seg + hc * 37.0;
        float id = floor( yy ), fy = fract( yy );
        float on = step( ch( ci * 1.7 + id * 3.1 + vLay ), 0.35 * uInt );
        float s = on * smoothstep( 0.0, 0.08, fy ) * ( 1.0 - smoothstep( 0.18, 0.3, fy ) ) * smoothstep( 0.18, 0.0, abs( fx - ( ch( ci + id ) - 0.5 ) * 0.5 ) );
        // 陣風捲起的雨幕(低頻雜訊,隨風移動)
        float sheet = 0.45 + 0.55 * cn( vec2( u * 0.08 - uTime * uWindV.x * 0.05, y * 0.06 + uTime * 0.25 ) );
        float vfade = smoothstep( 0.0, 3.0, 15.0 - abs( y - uCam.y ) );
        float fogA = exp( - pow( uFogD * vD, 2.0 ) );
        vec3 col = vL * ( s * sheet * fogA + uHaze * ( 1.0 - fogA * 0.5 ) * sheet * uInt );
        col *= vfade;
        if ( max( col.r, max( col.g, col.b ) ) < 1e-4 ) discard;
        gl_FragColor = vec4( col, 1.0 ); // 雨幕是低頻的霧狀層:交給 TAA 正常累積(不標反應式)
      }`,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
  });
  return mk(g, m, 'rain-curtain', 19);
}

// ======================================================================
// 濺水(落在遮雨高度圖上)
// ======================================================================
export const SPLASH_MAX = 1200;
export function splashMesh() {
  const g = quadGeo(SPLASH_MAX, [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...RL, ...OCC, uBox: { value: new THREE.Vector2(18, 18) }, uCtr: { value: new THREE.Vector3() }, uInt: { value: 1 }, uK: { value: 0.5 }, uTint: { value: new THREE.Color(0.86, 0.93, 1.0) } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      ${LIGHT_GLSL}
      ${OCC_GLSL}
      uniform vec2 uBox; uniform vec3 uCtr; uniform float uInt; uniform float uK;
      varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vCol; varying float vSeed;
      float h1( float n ) { return fract( sin( n ) * 43758.5453 ); }
      void main() {
        float life = 0.22 + 0.16 * aSeed.w;
        float tt = uTime / life + aSeed.z * 7.0;
        float cyc = floor( tt ), age = fract( tt );
        vec2 p = ( aSeed.xy + vec2( h1( cyc * 12.9898 + aSeed.x * 78.2 ), h1( cyc * 39.35 + aSeed.y * 11.1 ) ) ) * uBox;
        vec2 base = uCtr.xz - uBox * 0.5;
        p = base + mod( p - base, uBox );
        float y = occH( p );
        vec3 wp = vec3( p.x, y, p.y );
        float d = length( wp - uCam );
        float vis = step( abs( y - uCam.y + 1.0 ), 7.0 ) * step( h1( cyc * 3.7 + aSeed.w * 91.0 ), uInt );
        float s = 0.07 + 0.08 * aSeed.w;
        // 直立的看板(水平方向朝鏡頭)
        vec3 toC = uCam - wp; toC.y = 0.0;
        vec3 rt = normalize( vec3( toC.z, 0.0, - toC.x ) + 1e-5 );
        vec3 q = wp + rt * position.x * s * 1.6 + vec3( 0.0, position.y * s, 0.0 ) - normalize( toC + 1e-5 ) * 0.02;
        vec4 mv = viewMatrix * vec4( q, 1.0 );
        vA = vis * ( 1.0 - smoothstep( 10.0, 15.0, d ) ) * smoothstep( 0.4, 1.0, d ) * rainFog( d );
        vCol = rainSat( rainLight( wp + vec3( 0.0, 0.05, 0.0 ), normalize( wp - uCam ) ) * uK );
        vUv = vec2( position.x + 0.5, position.y ); vAge = age; vSeed = aSeed.w;
        gl_Position = projectionMatrix * mv;
        if ( vA < 0.001 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTint;
      varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vCol; varying float vSeed;
      void main() {
        vec2 q = ( vUv - vec2( 0.5, 0.0 ) ) * vec2( 1.6, 1.0 );
        float t = vAge;
        // 水冠:往上張開的薄壁(早期)
        float cr = abs( abs( q.x ) - ( 0.08 + 0.35 * t ) );
        float crown = smoothstep( 0.035, 0.0, cr ) * smoothstep( 0.5 * ( 1.0 - t ) + 0.05, 0.0, q.y ) * ( 1.0 - smoothstep( 0.0, 0.55, t ) );
        // 飛濺水珠:拋物線
        float drops = 0.0;
        for ( int i = 0; i < 5; i ++ ) {
          float a = ( float( i ) - 2.0 ) * 0.38 + ( fract( vSeed * 17.0 * float( i + 1 ) ) - 0.5 ) * 0.3;
          vec2 dp = vec2( sin( a ) * 0.62 * t, 1.25 * t * cos( a ) - 1.5 * t * t );
          drops += smoothstep( 0.035, 0.0, length( q - dp ) );
        }
        float a = ( crown * 0.45 + drops * 0.8 ) * vA * ( 1.0 - t * t );
        if ( a < 0.002 ) discard;
        gl_FragColor = vec4( vCol * uTint * a, 8.0 );
      }`,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
  });
  return mk(g, m, 'rain-splash', 21);
}

// ======================================================================
// 屋簷/雨棚/車頂邊緣滴水
// ======================================================================
export const DRIP_MAX = 800;
export function dripMesh() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aDrip', new THREE.InstancedBufferAttribute(new Float32Array(DRIP_MAX * 4), 4)); // x, 邊緣 y, z, 落地 y
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(DRIP_MAX), 4));
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({
    uniforms: { ...RL, uRain: { value: 1 }, uPx: { value: 0.0015 }, uK: { value: 0.5 }, uRange: { value: 22 } },
    vertexShader: /* glsl */`
      attribute vec4 aDrip; attribute vec4 aSeed;
      ${LIGHT_GLSL}
      uniform float uRain; uniform float uPx; uniform float uRange; uniform float uK;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vPh;
      void main() {
        vec3 e = aDrip.xyz;
        float fallH = max( aDrip.y - aDrip.w, 0.05 );
        float tf = sqrt( 2.0 * fallH / 9.8 ); // 落下時間
        float hang = ( 0.5 + 1.6 * aSeed.x ) / ( 0.4 + uRain ); // 水珠在邊緣長大的時間(雨越大越快)
        float per = hang + tf + 0.25;
        float t = mod( uTime + aSeed.y * 50.0, per );
        vec3 p = e; float len = 0.0; float rad = 0.0025; float ph = 0.0;
        if ( t < hang ) { rad = 0.0012 + 0.0025 * ( t / hang ); ph = 0.0; }
        else if ( t < hang + tf ) { float tt = t - hang; p.y = e.y - 0.5 * 9.8 * tt * tt; len = 9.8 * tt * 0.024 + 0.004; ph = 1.0; }
        else { p.y = aDrip.w; ph = 2.0; rad = 0.004 + 0.02 * ( t - hang - tf ) / 0.25; }
        float d = length( p - uCam );
        vec4 hv = viewMatrix * vec4( p, 1.0 );
        float dist = max( - hv.z, 0.01 );
        float w = max( rad * 2.0, uPx * dist * 1.4 );
        vec4 v = hv;
        vec3 up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz;
        vec2 dir = normalize( up.xy + 1e-5 );
        vec2 nrm = vec2( - dir.y, dir.x );
        float L = max( len, w );
        v.xy += nrm * position.x * w + dir * position.y * L;
        float cover = clamp( rad * 2.0 / w, 0.06, 1.0 );
        vA = cover * ( 1.0 - smoothstep( uRange * 0.7, uRange, d ) ) * smoothstep( 0.3, 0.8, d ) * rainFog( d ) * step( aSeed.z, 0.35 + 0.65 * uRain ) * ( ph > 1.5 ? 1.0 - ( t - hang - tf ) / 0.25 : 1.0 );
        vCol = rainSat( rainLight( p, normalize( p - uCam ) ) * uK );
        vUv = vec2( position.x + 0.5, position.y ); vPh = ph;
        gl_Position = projectionMatrix * v;
        if ( vA < 0.001 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vPh;
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        float a = vA * exp( - x * x * 3.0 ) * smoothstep( 0.0, 0.2, vUv.y ) * ( 1.0 - smoothstep( 0.8, 1.0, vUv.y ) );
        if ( a < 0.001 ) discard;
        gl_FragColor = vec4( vCol * a * ( vPh < 0.5 ? 1.6 : 1.0 ), 8.0 );
      }`,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
  });
  return mk(g, m, 'rain-drips', 21);
}
export function setDrips(mesh, list) {
  const a = mesh.geometry.attributes.aDrip, n = Math.min(DRIP_MAX, list.length);
  for (let i = 0; i < n; i++) { const e = list[i]; a.setXYZW(i, e.x, e.y - 0.02, e.z, e.land); }
  a.needsUpdate = true;
  mesh.userData.n = n;
}

// ======================================================================
// 每幀:把光源池/槍口/爆炸/手電筒寫進共用 uniform(只收戶外的光源:室內燈被牆擋住,不該照亮窗外的雨)
// ======================================================================
const _v = new THREE.Vector3(), _q = new THREE.Vector3();
const _sc = new Float32Array(RL_MAX);
const lightOut = (occ, x, y, z) => { const h = occ.heightAt(x, z); return h <= y + 1.2 && h >= y - 4; };
export function updateRainLights(game, occ, flash, moonI, gY = 0) {
  const pool = game.hospital?.lights?.pool || [];
  const P = RL.uRLPos.value, C = RL.uRLCol.value;
  let n = 0;
  const add = (l, k = 1) => {
    if (n >= RL_MAX || !l || !(l.intensity > 0.01) || !l.visible) return;
    const p = l.position;
    // 在屋頂/樓板下(室內)的燈不算;牆上的壁燈(頭頂有簷口)看旁邊 1m 有沒有露天(而且露天處的高度與燈相近,不是牆腳的縫)
    if (occ && !(lightOut(occ, p.x, p.y, p.z) || (p.y > gY - 1 && lightOut(occ, p.x + 1, p.y, p.z)) || (p.y > gY - 1 && (lightOut(occ, p.x - 1, p.y, p.z) || lightOut(occ, p.x, p.y, p.z + 1) || lightOut(occ, p.x, p.y, p.z - 1))))) return; // 地下室的燈只看正上方
    P[n].set(p.x, p.y, p.z, l.distance || 0);
    C[n].set(l.color.r * l.intensity * k, l.color.g * l.intensity * k, l.color.b * l.intensity * k, l.decay ?? 2);
    n++;
  };
  for (let i = 0; i < pool.length; i++) add(pool[i].light);
  add(game.muzzleLight);
  add(game.boomLight);
  RL.uRLN.value = n;
  // 濕地倒影:挑對鏡頭最亮的 WL_MAX 盞(強度 / 距離²)
  const cam = game.camera.position, WP = WL.uWLPos.value, WC = WL.uWLCol.value;
  let m = 0;
  for (let k = 0; k < n; k++) _sc[k] = (C[k].x + C[k].y + C[k].z) / (1 + (P[k].x - cam.x) ** 2 + (P[k].y - cam.y) ** 2 + (P[k].z - cam.z) ** 2);
  for (; m < Math.min(WL_MAX, n); m++) {
    let bi = -1, bs = 0;
    for (let k = 0; k < n; k++) if (_sc[k] > bs) { bs = _sc[k]; bi = k; }
    if (bi < 0) break;
    _sc[bi] = -1;
    WP[m].copy(P[bi]); WC[m].set(C[bi].x, C[bi].y, C[bi].z);
  }
  WL.uWLN.value = m;
  // 手電筒
  const fl = game.player?.flashlight;
  if (fl && fl.visible && game.player.flashOn !== false && fl.intensity > 0) {
    fl.getWorldPosition(_v);
    fl.target.getWorldPosition(_q);
    RL.uFlPos.value.copy(_v);
    RL.uFlDir.value.copy(_q).sub(_v).normalize();
    RL.uFlCol.value.set(fl.color.r, fl.color.g, fl.color.b).multiplyScalar(fl.intensity);
    const outer = Math.cos(fl.angle), inner = Math.cos(fl.angle * (1 - fl.penumbra));
    RL.uFlCone.value.set(outer, Math.max(inner, outer + 0.001), fl.distance || 30, fl.decay ?? 2);
  } else RL.uFlCol.value.set(0, 0, 0);
  // 環境:極弱的月光/天光 + 閃電
  const a = 0.0008 + moonI * 0.0015 + flash * 0.6;
  RL.uRAmb.value.set(a * 0.85, a * 0.92, a * 1.1);
}
