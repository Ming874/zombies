import * as THREE from 'three';

// 濕地材質(注入 MeshStandardMaterial,所有戶外地板/道具/立面共用同一組 uniform 物件):
//  - 淋得到雨才濕:世界座標沿法線往外 15cm 查遮雨高度圖(occlusion.js)→ 屋簷下、車底、室內是乾的;立面有直向流痕
//  - 濕度會累積與變乾(weather.js 依雨量積分 uWet;水窪水位 uPudLv 跟得更慢)
//  - 水窪:近乎鏡面 + 雨滴漣漪(多層、每格隨機落點與時間的圓環波)
//  - 燈光倒影:路燈/點光源在濕地面拉成直向光柱(把光源對地面鏡射後在視線方向比角度;水窪銳利、濕地面較散)
//  - 玻璃:室外窗的水珠與往下流的水痕(只在淋得到雨的那面窗)

// 遮雨高度圖(occlusion.js 烘焙完成後換成 12.5cm 的打包深度 RGBA8,uOccPk = 1;之前用 2m 格子遮罩的直接高度)
export const OCC = { uOcc: { value: null }, uOccXf: { value: new THREE.Vector4(0, 0, 0, 0) }, uOccOn: { value: 0 }, uOccPk: { value: 0 }, uOccY: { value: new THREE.Vector2(0, 1) } };
// uWet 濕度、uRainT 時間、uRain 雨量、uRipple 漣漪層數(0 = 關)、uPudLv 水窪水位、uWRefl 燈光倒影強度(0 = 關)
// 濕地倒影用的戶外光源(最多 6 盞,世界座標;rain.js updateRainLights 每幀從光源池挑:只收戶外的燈,室內燈不會穿牆倒映在水窪裡)
export const WL_MAX = 6;
export const WL = {
  uWLPos: { value: Array.from({ length: WL_MAX }, () => new THREE.Vector4()) }, // xyz 位置, w 範圍
  uWLCol: { value: Array.from({ length: WL_MAX }, () => new THREE.Vector3()) }, // 顏色 × 強度
  uWLN: { value: 0 },
};
// uExpT 淋雨判定取樣數(1 = 低畫質單點,4 = 柔和邊緣)
export const WET = { ...WL, uWet: { value: 0.85 }, uRainT: { value: 0 }, uRain: { value: 0.8 }, uRipple: { value: 2 }, uPudLv: { value: 0.85 }, uWRefl: { value: 1 }, uExpT: { value: 4 }, ...OCC };

export const OCC_GLSL = /* glsl */`
uniform sampler2D uOcc; uniform vec4 uOccXf; uniform float uOccOn; uniform float uOccPk; uniform vec2 uOccY;
float occH( vec2 xz ) {
  vec4 t = texture2D( uOcc, xz * uOccXf.xy + uOccXf.zw );
  // 打包深度(three packDepthToRGBA)→ 高度
  return uOccPk > 0.5 ? uOccY.x - dot( t, vec4( 255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0 ) ) * uOccY.y : t.r;
}
`;
const WET_PARS = /* glsl */`
uniform float uWet; uniform float uRainT; uniform float uRain; uniform float uRipple; uniform float uPudLv; uniform float uWRefl; uniform float uExpT;
uniform vec4 uWLPos[ ${WL_MAX} ]; uniform vec3 uWLCol[ ${WL_MAX} ]; uniform int uWLN;
uniform float uPuddle; uniform float uPudMin; uniform float uDarken; uniform float uGloss; uniform float uCav;
${OCC_GLSL}
varying vec3 vWetPos;
float wHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float wNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wHash( i ), wHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wHash( i + vec2( 0.0, 1.0 ) ), wHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
// 淋雨程度 0..1:四點比對遮雨高度(邊緣柔和)
float wExposure( vec3 p ) {
  if ( uOccOn < 0.5 ) return 1.0;
  float y = p.y + 0.06;
  if ( uExpT < 2.0 ) return step( occH( p.xz ), y );
  return 0.25 * ( step( occH( p.xz + vec2( 0.09, 0.04 ) ), y ) + step( occH( p.xz + vec2( - 0.04, 0.09 ) ), y )
    + step( occH( p.xz + vec2( - 0.09, - 0.04 ) ), y ) + step( occH( p.xz + vec2( 0.04, - 0.09 ) ), y ) );
}
// 雨滴漣漪:每層一張 ~0.3m 的格子,每格每個週期換一個落點;圓環往外擴散、振幅衰減 → 回傳高度場梯度(世界 xz)
vec2 wRipple( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );
  for ( int k = 0; k < 3; k ++ ) {
    if ( float( k ) >= uRipple ) break;
    vec2 q = p * 3.3 + vec2( 17.3, 5.1 ) * float( k );
    vec2 i = floor( q ), f = fract( q );
    float h = wHash( i + float( k ) * 7.13 );
    float ph = t * ( 0.9 + 0.5 * h ) + h * 11.0;
    float age = fract( ph ), cyc = floor( ph );
    if ( wHash( i + cyc * 0.731 ) > 0.25 + 0.75 * uRain ) continue; // 雨小時落點少
    vec2 c = vec2( wHash( i + cyc * 1.37 + 3.3 ), wHash( i + cyc * 2.11 + 5.7 ) ) * 0.5 + 0.25;
    vec2 d = f - c;
    float r = length( d ) + 1e-4;
    float R = age * 0.34;
    float x = ( r - R ) * 24.0;
    float env = ( 1.0 - age ) * ( 1.0 - age ) * exp( - x * x * 0.3 ) * ( 1.0 - smoothstep( 0.3, 0.42, r ) );
    g += d / r * sin( x * 1.7 ) * env;
  }
  return g;
}
`;
const WET_ROUGH = /* glsl */`
	vec3 wNw = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz );
	float wUp = smoothstep( 0.72, 0.95, wNw.y );
	float wW = uWet * wExposure( vWetPos + wNw * 0.15 );
	float wN = wNoise( vWetPos.xz * 0.21 ) * 0.62 + wNoise( vWetPos.xz * 0.83 + 3.1 ) * 0.28 + wNoise( vWetPos.xz * 3.7 ) * 0.1;
	float wSt = wNoise( vec2( dot( vWetPos.xz, vec2( wNw.z, - wNw.x ) ) * 3.0, vWetPos.y * 0.4 ) ); // 立面流痕
	float wPud = max( smoothstep( 0.67 - 0.12 * uPudLv, 0.71 - 0.12 * uPudLv, wN ) * uPuddle * step( 0.02, uPudLv ), uPudMin ) * wW * wUp;
	// 凹處積水(r2):裂縫、磚縫、龜裂泥土的縫裡先積水(ORM 的 AO 通道 = 凹處)→ 細細的反光線,不是整片乾的
	#ifdef USE_ROUGHNESSMAP
	wPud = max( wPud, uCav * smoothstep( 0.82, 0.45, texelRoughness.r ) * wW * wUp * smoothstep( 0.05, 0.4, uPudLv ) * ( 0.55 + 0.45 * wN ) );
	#endif
	float wDamp = wW * mix( 0.45 + 0.55 * wSt, 0.65 + 0.35 * wN, wUp );
	diffuseColor.rgb *= 1.0 - min( 0.85, uDarken * ( 0.75 + 0.5 * roughnessFactor ) ) * wDamp; // 粗糙多孔的(泥土、柏油)吸水變暗得多,亮面的少
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 0.3, wPud );
	roughnessFactor = mix( roughnessFactor, roughnessFactor * ( 1.0 - uGloss ) + 0.06, wDamp );
	roughnessFactor = mix( roughnessFactor, 0.03, wPud );
`;
const WET_NORMAL = /* glsl */`
	vec2 wg = vec2( 0.0 );
	if ( wPud > 0.01 ) {
		float wFar = 1.0 - smoothstep( 7.0, 18.0, length( vViewPosition ) ); // 遠處的細漣漪會閃爍(取樣不足)→ 淡出
		if ( uRipple > 0.5 && uRain > 0.02 && wFar > 0.0 ) wg = wRipple( vWetPos.xz, uRainT ) * 0.16 * ( 0.4 + 0.6 * uRain ) * wFar;
		vec3 wFlat = normalize( ( viewMatrix * vec4( - wg.x, 1.0, - wg.y, 0.0 ) ).xyz );
		normal = normalize( mix( normal, wFlat, wPud ) );
	}
`;
// 燈光倒影:戶外光源對地面鏡射,在螢幕切線空間比較「這個像素的視線」與「鏡像光源的方向」;
// 水面的漣漪與粗糙讓倒影沿垂直方向拉長(濕馬路上的路燈光柱)
const WET_REFL = /* glsl */`
	if ( uWRefl > 0.0 && uWLN > 0 && wW * wUp > 0.03 ) {
		vec3 wP = - vViewPosition;
		vec2 wsP = wP.xy / max( - wP.z, 1e-3 ) + wg * 0.6;
		float wSx = mix( 0.03, 0.006, wPud ), wSy = mix( 0.22, 0.07, wPud );
		float wK = mix( 0.12, 1.0, wPud ) * wW * wUp * uWRefl;
		vec3 wAcc = vec3( 0.0 );
		for ( int i = 0; i < ${WL_MAX}; i ++ ) {
			if ( i >= uWLN ) break;
			vec3 lw = uWLPos[ i ].xyz;
			float hL = lw.y - vWetPos.y;
			if ( hL < 0.05 ) continue;
			vec3 lm = ( viewMatrix * vec4( lw.x, vWetPos.y - hL, lw.z, 1.0 ) ).xyz; // 鏡像光源(視空間)
			if ( lm.z > - 0.2 ) continue;
			float rng = uWLPos[ i ].w;
			float win = rng > 0.0 ? clamp( 1.0 - pow( length( lw - vWetPos ) / ( rng * 1.6 ), 4.0 ), 0.0, 1.0 ) : 1.0;
			vec2 dd = wsP - lm.xy / - lm.z;
			float e = exp( - ( dd.x * dd.x / ( wSx * wSx ) + dd.y * dd.y / ( wSy * wSy ) ) );
			wAcc += uWLCol[ i ] * ( e * win * win / max( dot( lm, lm ), 1.0 ) );
		}
		reflectedLight.indirectSpecular += min( wAcc * wK * ( 0.012 / ( wSx * wSy * 40.0 ) ), vec3( 6.0 ) );
	}
`;
const WET_VERT = /* glsl */`
	{
		vec4 wetP = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
		wetP = instanceMatrix * wetP;
		#endif
		vWetPos = ( modelMatrix * wetP ).xyz;
	}
`;
// 把濕潤效果注入 MeshStandardMaterial(可疊在其他 onBeforeCompile 之前:先改字串、再呼叫原本的 hook)
// puddle:水窪量(0 = 沒有水窪,只變暗變亮);darken:濕了變暗程度;gloss:粗糙度下降程度;full:整面都是水
export function makeWet(m, opts = {}) {
  const { puddle = 0, darken = 0.3, gloss = 0.55, full = false } = opts;
  if (!m || m.userData.wet) return m;
  // cav:凹處積水(只對 ORM 打包的 PBR 粗糙度貼圖有意義:R = AO);預設 = 粗糙度貼圖是 pbrTex 來的就開
  const cav = opts.cav ?? (m.roughnessMap?.userData?.pbr ? 1 : 0);
  m.userData.wet = { uPuddle: { value: Math.min(1, puddle) }, uPudMin: { value: full ? 1 : 0 }, uDarken: { value: darken }, uGloss: { value: gloss }, uCav: { value: cav } };
  const prev = m.onBeforeCompile;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = function (s, r) {
    Object.assign(s.uniforms, WET, this.userData.wet);
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'varying vec3 vWetPos;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + WET_VERT);
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', WET_PARS + 'void main() {')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WET_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + WET_NORMAL)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + WET_REFL);
    if (hasPrev) prev.call(this, s, r);
  };
  const key = hasPrev ? (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey() : prev.toString()) : '';
  m.customProgramCacheKey = () => 'wet2|' + key;
  m.needsUpdate = true;
  return m;
}

// ======================================================================
// 窗玻璃上的雨:靜止水珠(出現→慢慢蒸發)+ 往下流的水痕(彎彎曲曲的細線,前端一顆大水珠)
// 只畫在「窗外那一面淋得到雨」的玻璃上(沿玻璃法線兩側各 0.6m 查遮雨高度)
// ======================================================================
const GLASS_PARS = /* glsl */`
uniform float uWet; uniform float uRainT; uniform float uRain;
${OCC_GLSL}
varying vec3 vWetPos;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
// 回傳 xy = 玻璃面上的法線擾動(水平 u、垂直 v),z = 水量
vec3 gDrops( vec2 q, float t ) {
  vec3 o = vec3( 0.0 );
  // 靜止水珠(兩種大小)
  for ( int k = 0; k < 2; k ++ ) {
    float sc = k == 0 ? 19.0 : 42.0;
    vec2 g = q * sc + float( k ) * 3.7;
    vec2 i = floor( g ), f = fract( g ) - 0.5;
    float h = gHash( i + float( k ) * 9.1 );
    float life = fract( t * ( 0.03 + 0.05 * h ) + h * 7.0 );
    float on = step( gHash( i + floor( t * ( 0.03 + 0.05 * h ) + h * 7.0 ) * 1.31 ), 0.25 + 0.5 * uRain );
    vec2 c = ( vec2( gHash( i + 1.7 ), gHash( i + 4.3 ) ) - 0.5 ) * 0.45;
    float rad = ( 0.1 + 0.2 * gHash( i + 9.1 ) ) * smoothstep( 0.0, 0.04, life ) * ( 1.0 - 0.6 * life );
    vec2 d = f - c;
    d.y *= 1.0 + 0.35 * step( 0.5, gHash( i + 2.2 ) ); // 有些被重力拉成水滴狀
    float dl = length( d );
    float b = on * smoothstep( rad, rad * 0.75, dl );
    o.xy += d / max( rad, 1e-3 ) * b;
    o.z = max( o.z, b );
  }
  // 流下的水痕:每 5cm 一欄,約 1/3 的欄有水滴往下滑
  float cu = q.x * 20.0, ci = floor( cu );
  float ch = gHash( vec2( ci, 3.1 ) );
  if ( ch < 0.2 + 0.3 * uRain ) {
    float sp = 0.06 + 0.16 * gHash( vec2( ci, 7.7 ) );
    float P = 2.4;
    float head = - fract( t * sp / P + ch * 13.0 ) * P; // 相對窗頂往下的位置(公尺)
    float vy = fract( q.y / P ) * P - P;
    float dy = vy - head; // > 0 = 水滴上方的水痕
    float fx = ( fract( cu ) - 0.5 - 0.22 * sin( q.y * 9.0 + ch * 40.0 ) - 0.1 * sin( q.y * 23.0 + ch * 9.0 ) ) / 20.0;
    float hr = 0.006 + 0.004 * gHash( vec2( ci, 1.9 ) );
    float hd = length( vec2( fx, dy * 0.75 ) );
    float bead = smoothstep( hr, hr * 0.7, hd );
    float tw = 0.0024 * clamp( 1.0 - dy / 0.9, 0.0, 1.0 ) * step( 0.0, dy );
    float trail = smoothstep( tw, tw * 0.4, abs( fx ) ) * step( 0.0, dy ) * 0.6;
    o.xy += vec2( fx / hr, dy * 0.75 / hr ) * bead + vec2( fx / max( tw, 1e-4 ), 0.0 ) * trail * 0.5;
    o.z = max( o.z, max( bead, trail ) );
  }
  return o;
}
`;
const GLASS_MAP = /* glsl */`
	vec3 gNw = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz );
	vec3 gT = normalize( vec3( - gNw.z, 0.0, gNw.x ) + 1e-5 );
	float gExp = 0.0;
	if ( uOccOn > 0.5 && uWet > 0.01 && abs( gNw.y ) < 0.5 ) {
		vec2 gO = gNw.xz * 0.6;
		gExp = max( step( occH( vWetPos.xz + gO ), vWetPos.y - 0.2 ), step( occH( vWetPos.xz - gO ), vWetPos.y - 0.2 ) );
	}
	vec3 gD = vec3( 0.0 );
	if ( gExp > 0.5 ) gD = gDrops( vec2( dot( vWetPos.xz, gT.xz ), vWetPos.y ), uRainT ) * min( 1.0, uWet * 1.4 );
	diffuseColor.a = max( diffuseColor.a, gD.z * 0.4 );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.5, 0.55, 0.58 ), gD.z * 0.4 );
`;
const GLASS_NORMAL = /* glsl */`
	if ( gD.z > 0.01 ) {
		vec3 gPert = ( gT * gD.x + vec3( 0.0, 1.0, 0.0 ) * gD.y ) * 0.55;
		normal = normalize( normal + ( viewMatrix * vec4( gPert, 0.0 ) ).xyz );
	}
`;
// 窗外的燈透過水珠折射進眼睛:燈在玻璃另一側、而且接近視線方向時水珠最亮(水珠是小透鏡)
const GLASS_EMIT = /* glsl */`
	#if NUM_POINT_LIGHTS > 0
	if ( gD.z > 0.01 ) {
		vec3 gP = - vViewPosition;
		vec3 gNv = normalize( vNormal );
		float gSc = dot( - gP, gNv );
		vec3 gAcc = vec3( 0.0 );
		vec3 gV = normalize( gP );
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
			{
				vec3 dl = pointLights[ i ].position - gP;
				float dd = length( dl );
				if ( dot( dl, gNv ) * gSc < 0.0 && dd < 14.0 ) {
					float al = max( dot( dl / dd, gV ), 0.0 );
					gAcc += pointLights[ i ].color * ( ( 0.25 + 5.0 * pow( al, 10.0 ) ) / ( 1.0 + dd * dd ) );
				}
			}
		}
		#pragma unroll_loop_end
		totalEmissiveRadiance += min( gAcc * gD.z * 0.5, vec3( 4.0 ) );
	}
	#endif
`;
const GLASS_ROUGH = /* glsl */`
	roughnessFactor = mix( roughnessFactor, 0.04, gD.z );
`;
export function makeGlassWet(m) {
  if (!m || m.userData.glassWet || !m.isMeshStandardMaterial) return m;
  m.userData.glassWet = true;
  const prev = m.onBeforeCompile;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = function (s, r) {
    Object.assign(s.uniforms, WET);
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'varying vec3 vWetPos;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + WET_VERT);
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', GLASS_PARS + 'void main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + GLASS_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + GLASS_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLASS_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLASS_EMIT);
    if (hasPrev) prev.call(this, s, r);
  };
  const key = hasPrev ? (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey() : prev.toString()) : '';
  m.customProgramCacheKey = () => 'wetglass|' + key;
  m.needsUpdate = true;
  return m;
}
