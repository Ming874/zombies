import * as THREE from 'three';

// 窗玻璃的裂紋與破洞(程式產生,不用貼圖):每片玻璃的 4 個頂點帶同一組資料(頂點屬性),
// 片段著色器依資料畫出:
//  - 彈孔:乾淨的小洞(約 9mm)+ 外圈白霧狀的崩口
//  - 蛛網裂紋:放射裂紋(微彎、長短不一)+ 同心環(每個扇形各自一段弦,有的沒有)
//  - 多次命中:裂紋半徑變大、彈著點之間與往框邊的長裂紋把網路連起來,最後整片失效
//  - 碎掉:退火玻璃(舊窗)只剩框邊不規則的尖齒;強化玻璃(櫃台隔板)只剩一圈碎粒
//  - 強化玻璃第一次中彈:整片細碎龜裂(還留在框裡)
// 裂紋是「亮的折射細線」:線上的法線依每一小段隨機傾斜(手電筒/燈照到時有的段反光)、粗糙度很低,
// 窗另一側的點光源透過裂縫散射進來(自發光項)。地圖上原本就破的窗(貼圖格 1/2/3)也改用同一套。
// 與 weather/wet.js 的窗玻璃雨滴 hook 相容(包在它外面,先呼叫它再改字串;只在既有 include 後面插入)。

const VERT_PARS = /* glsl */`
attribute vec4 aCkA; attribute vec4 aCkB; attribute vec4 aCkC; attribute vec4 aCkD; attribute vec4 aCkE;
varying vec4 vCkA; varying vec4 vCkB; varying vec4 vCkC; varying vec4 vCkD; varying vec4 vCkE;
`;
const VERT_MAIN = /* glsl */`
	vCkA = aCkA; vCkB = aCkB; vCkC = aCkC; vCkD = aCkD; vCkE = aCkE;
`;
const FRAG_PARS = /* glsl */`
varying vec4 vCkA; // 片內座標 u,v(公尺)、片寬、片高
varying vec4 vCkB; // 種子、受損(0..1;≥ 1.9 = 碎掉)、強化玻璃(1)、有效旗標(7)
varying vec4 vCkC; // 彈著點 1、2(u,v)
varying vec4 vCkD; // 彈著點 3、4
varying vec4 vCkE; // 各彈著點的裂紋半徑(公尺;負值 = 大破洞)
float ckH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
// 單一彈著點:x 裂紋線、y 崩口白霧、z 破洞(1 = 透明);pert 累加法線擾動(片內座標)
vec3 ckHit( vec2 p, vec2 c, float R, float sd, float aa, inout vec2 pert ) {
	vec3 o = vec3( 0.0 );
	float big = R < 0.0 ? 1.0 : 0.0;
	R = abs( R );
	vec2 d = p - c;
	float r = length( d );
	if ( R < 1e-4 || r > R * 1.3 ) return o;
	float ang = atan( d.y, d.x );
	float hole = big > 0.5 ? R * 0.28 : 0.0045;
	float jag = big > 0.5 ? 0.5 + 0.5 * ckH( vec2( floor( ang * 3.2 + sd ), sd ) ) : 0.85 + 0.15 * sin( ang * 7.0 + sd * 13.0 );
	if ( r < hole * jag ) { o.z = 1.0; return o; }
	o.y = big > 0.5 ? 0.0 : 1.0 - smoothstep( hole * 1.4, hole * 3.6, r );
	float N = 9.0 + floor( ckH( vec2( sd, 3.1 ) ) * 7.0 );
	float sec = 6.2831853 / N;
	float a = ang + ( 0.05 * sin( r * 29.0 + sd * 11.0 ) + 0.025 * sin( r * 83.0 + sd * 5.0 ) ) * min( 1.0, r * 12.0 );
	float lw = 0.0002 + 0.0005 * ( 1.0 - clamp( r / R, 0.0, 1.0 ) ); // 越外面越細
	float cov = clamp( 2.5 * lw / max( aa, 1e-5 ), 0.55, 1.0 ); // 比一個像素細:變淡一點(看起來細,不是粗白線)
	float k0 = floor( a / sec + 0.5 );
	for ( int j = - 1; j <= 1; j ++ ) { // 放射裂紋(最近的三條;每條在中段分岔一次)
		float k = k0 + float( j );
		float h1 = ckH( vec2( k, sd ) ), h2 = ckH( vec2( k + 7.3, sd ) ), h3 = ckH( vec2( k + 2.9, sd ) );
		float ak = ( k + ( h1 - 0.5 ) * 0.7 ) * sec;
		float len = R * ( 0.35 + 0.65 * h2 );
		float da = a - ak;
		float dist = abs( sin( da ) ) * r;
		float rf = len * ( 0.35 + 0.35 * h3 ); // 分岔點之後多一條斜出去的
		if ( r > rf ) { float ab = ak + ( h3 > 0.5 ? 0.32 : - 0.32 ) * sec; vec2 q = d - rf * vec2( cos( ak ), sin( ak ) ); float db = abs( dot( q, vec2( - sin( ab ), cos( ab ) ) ) ); if ( dot( q, vec2( cos( ab ), sin( ab ) ) ) > 0.0 && r < len * 0.85 ) dist = min( dist, db ); }
		float m = ( 1.0 - smoothstep( lw, lw + aa, dist ) ) * step( 0.0, cos( da ) ) * ( 1.0 - smoothstep( len * 0.7, len, r ) );
		if ( m > 0.002 ) {
			float t = ckH( vec2( floor( r * 45.0 ) + k * 13.0, sd + 4.0 ) ) - 0.5; // 每 2cm 一段各自傾斜:有的段反光
			pert += vec2( - sin( ak ), cos( ak ) ) * t * m * 1.8;
			o.x = max( o.x, m * cov * min( 1.0, 0.7 + 0.8 * abs( t ) ) );
		}
	}
	float sa = floor( a / sec ), mid = ( sa + 0.5 ) * sec;
	for ( int j = 0; j < 3; j ++ ) { // 同心環:每個扇形各自一段弦(有的沒有)
		float hj = ckH( vec2( sa * 3.0 + float( j ), sd + 1.7 ) );
		if ( hj > 0.72 ) continue;
		float rho = min( R * ( 0.15 + 0.19 * float( j ) ), 0.03 + 0.035 * float( j ) ) * ( 0.85 + 0.3 * hj ); // 同心環只在彈著點附近(大裂紋外圈只有放射線)
		float dist = abs( r * cos( a - mid ) - rho * cos( sec * 0.5 ) );
		float m = 1.0 - smoothstep( lw * 0.8, lw * 0.8 + aa, dist );
		if ( m > 0.002 ) {
			float t = ckH( vec2( sa + float( j ) * 5.0, sd + 9.0 ) ) - 0.5;
			pert += vec2( cos( mid ), sin( mid ) ) * t * m * 1.8;
			o.x = max( o.x, m * cov * min( 1.0, 0.7 + 0.8 * abs( t ) ) );
		}
	}
	return o;
}
// 兩點之間的長裂紋(鋸齒狀),回傳線遮罩
float ckSeg( vec2 p, vec2 a, vec2 b, float sd, float aa, inout vec2 pert ) {
	vec2 ab = b - a; float L = length( ab );
	if ( L < 0.01 ) return 0.0;
	vec2 t = ab / L, n = vec2( - t.y, t.x );
	float s = dot( p - a, t );
	if ( s < 0.0 || s > L ) return 0.0;
	float off = 0.0035 * sin( s * 37.0 + sd * 7.0 ) + 0.0015 * sin( s * 131.0 + sd * 3.0 );
	float dist = abs( dot( p - a, n ) - off );
	float m = 1.0 - smoothstep( 0.0003, 0.0003 + aa, dist );
	float tj = ckH( vec2( floor( s * 40.0 ), sd ) ) - 0.5;
	if ( m > 0.002 ) pert += n * tj * m * 1.8;
	return m * clamp( 0.0008 / max( aa, 1e-5 ), 0.55, 1.0 ) * min( 1.0, 0.7 + 0.8 * abs( tj ) );
}
// 強化玻璃整片龜裂(小塊多邊形網)
float ckCraze( vec2 p, float sd, float aa, inout vec2 pert ) {
	vec2 g = p / 0.024, i = floor( g ), f = fract( g ), b1 = vec2( 0.0 );
	float d1 = 9.0, d2 = 9.0;
	for ( int y = - 1; y <= 1; y ++ ) for ( int x = - 1; x <= 1; x ++ ) {
		vec2 o = vec2( float( x ), float( y ) );
		vec2 q = o + vec2( ckH( i + o + sd ), ckH( i + o + sd + 17.3 ) ) - f;
		float dd = dot( q, q );
		if ( dd < d1 ) { d2 = d1; d1 = dd; b1 = i + o; } else if ( dd < d2 ) d2 = dd;
	}
	float e = sqrt( d2 ) - sqrt( d1 );
	float m = 1.0 - smoothstep( 0.035, 0.035 + aa / 0.024 * 1.5, e );
	pert += ( vec2( ckH( b1 + 3.3 ), ckH( b1 + 8.1 ) ) - 0.5 ) * 0.7;
	return m;
}
// 碎掉後留在框邊的玻璃:回傳 1 = 還有玻璃;edge = 斷口亮邊
float ckRemnant( vec2 p, vec2 S, float sd, float temp, float aa, out float edge ) {
	float eL = p.x, eR = S.x - p.x, eB = p.y, eT = S.y - p.y;
	float e = min( min( eL, eR ), min( eB, eT ) );
	float s = e == eB ? p.x : e == eT ? p.x + 3.1 : e == eL ? p.y + 7.7 : p.y + 11.3;
	float P = 0.075;
	float ti = floor( s / P ), f = fract( s / P );
	float h0 = ckH( vec2( ti, sd ) );
	float H = temp > 0.5 ? 0.004 + 0.01 * h0 : 0.01 + ( 0.03 + 0.15 * h0 * h0 ) * pow( 1.0 - abs( 2.0 * f - 1.0 ), 0.75 );
	if ( temp < 0.5 ) {
		float cn = min( min( length( p ), length( p - vec2( S.x, 0.0 ) ) ), min( length( p - S ), length( p - vec2( 0.0, S.y ) ) ) );
		H += 0.2 * ( 1.0 - smoothstep( 0.0, 0.32, cn ) ) * ( 0.4 + 0.6 * ckH( vec2( sd, floor( p.x / S.x * 1.99 ) + 2.0 * floor( p.y / S.y * 1.99 ) ) ) );
	}
	edge = 1.0 - smoothstep( 0.0, 0.003 + aa, abs( H - e ) );
	return step( e, H );
}
`;
// 顏色、透明度、破洞(在 color_fragment 之後:頂點色已套用)
const FRAG_MAP = /* glsl */`
	float ckL = 0.0, ckC = 0.0; vec2 ckP = vec2( 0.0 );
	if ( vCkB.w > 6.5 && ( vCkB.y > 0.001 || abs( vCkE.x ) + abs( vCkE.y ) + abs( vCkE.z ) + abs( vCkE.w ) > 0.0 ) ) {
		vec2 p = vCkA.xy;
		float aa = max( fwidth( p.x ), fwidth( p.y ) ) * 1.3; // 一個像素寬(公尺):細線反鋸齒
		float sd = vCkB.x, dmg = vCkB.y, temp = vCkB.z, hole = 0.0;
		if ( dmg >= 1.9 ) { // 框邊殘留的玻璃:稍微亮一點、不透明一點(看得出是一片片尖玻璃),斷口是亮線
			float ed; if ( ckRemnant( p, vCkA.zw, sd, temp, aa, ed ) < 0.5 ) discard;
			ckL = max( ckL, ed );
			diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.78, 0.86, 0.84 ), 0.28 );
			diffuseColor.a = max( diffuseColor.a, 0.5 );
		}
		vec3 h;
		h = ckHit( p, vCkC.xy, vCkE.x, sd + 1.0, aa, ckP ); ckL = max( ckL, h.x ); ckC = max( ckC, h.y ); hole = max( hole, h.z );
		h = ckHit( p, vCkC.zw, vCkE.y, sd + 2.0, aa, ckP ); ckL = max( ckL, h.x ); ckC = max( ckC, h.y ); hole = max( hole, h.z );
		h = ckHit( p, vCkD.xy, vCkE.z, sd + 3.0, aa, ckP ); ckL = max( ckL, h.x ); ckC = max( ckC, h.y ); hole = max( hole, h.z );
		h = ckHit( p, vCkD.zw, vCkE.w, sd + 4.0, aa, ckP ); ckL = max( ckL, h.x ); ckC = max( ckC, h.y ); hole = max( hole, h.z );
		if ( dmg > 0.3 && dmg < 1.9 ) { // 受損越多:彈著點之間、往框邊的長裂紋
			if ( vCkE.y != 0.0 ) ckL = max( ckL, ckSeg( p, vCkC.xy, vCkC.zw, sd + 5.0, aa, ckP ) );
			if ( vCkE.z != 0.0 && dmg > 0.45 ) ckL = max( ckL, ckSeg( p, vCkC.zw, vCkD.xy, sd + 6.0, aa, ckP ) );
			if ( vCkE.w != 0.0 && dmg > 0.6 ) ckL = max( ckL, ckSeg( p, vCkD.xy, vCkD.zw, sd + 7.0, aa, ckP ) );
			vec2 c1 = vCkC.xy, S = vCkA.zw;
			vec2 ed = vec2( c1.x < S.x * 0.5 ? 0.0 : S.x, c1.y ) + vec2( 0.0, ( ckH( vec2( sd, 1.0 ) ) - 0.5 ) * S.y * 0.6 );
			if ( dmg > 0.5 && vCkE.x != 0.0 ) ckL = max( ckL, ckSeg( p, c1, ed, sd + 8.0, aa, ckP ) );
			vec2 eb = vec2( c1.x + ( ckH( vec2( sd, 2.0 ) ) - 0.5 ) * S.x * 0.5, c1.y < S.y * 0.5 ? 0.0 : S.y );
			if ( dmg > 0.7 && vCkE.x != 0.0 ) ckL = max( ckL, ckSeg( p, c1, eb, sd + 9.0, aa, ckP ) );
		}
		if ( temp > 0.5 && dmg > 0.3 ) ckL = max( ckL, ckCraze( p, sd, aa, ckP ) * 0.8 );
		if ( hole > 0.5 ) discard;
		diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.95, 0.93 ), max( ckL, ckC ) * 0.8 );
		diffuseColor.a = max( diffuseColor.a, ckL * 0.62 + ckC * 0.7 );
	}
`;
const FRAG_ROUGH = /* glsl */`
	roughnessFactor = mix( roughnessFactor, 0.03, ckL );
	roughnessFactor = mix( roughnessFactor, 0.5, ckC );
`;
const FRAG_NORMAL = /* glsl */`
	if ( ckL + ckC > 0.002 ) {
		vec3 ckUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		vec3 ckT = normalize( cross( ckUp, normal ) + 1e-5 );
		vec3 ckBt = cross( normal, ckT );
		normal = normalize( normal + ( ckT * ckP.x + ckBt * ckP.y ) * 0.4 );
	}
`;
// 裂縫是亮線:窗另一側的點光源從裂縫散射進來、同側的燈讓斷面微亮,手電筒(聚光燈)照到的裂縫會亮起來
const FRAG_EMIT = /* glsl */`
	if ( ckL > 0.01 ) {
		vec3 ckPv = - vViewPosition;
		vec3 ckAcc = vec3( 0.0 );
		#if NUM_POINT_LIGHTS > 0
		vec3 ckNv = normalize( vNormal );
		float ckSc = dot( - ckPv, ckNv );
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
			{
				vec3 dl = pointLights[ i ].position - ckPv;
				float dd = length( dl );
				if ( dd < 16.0 ) ckAcc += pointLights[ i ].color * ( ( dot( dl, ckNv ) * ckSc < 0.0 ? 0.55 : 0.12 ) / ( 1.0 + dd * dd * 0.6 ) );
			}
		}
		#pragma unroll_loop_end
		#endif
		#if NUM_SPOT_LIGHTS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
			{
				vec3 dl = spotLights[ i ].position - ckPv;
				float dd = length( dl );
				float sf = smoothstep( spotLights[ i ].coneCos, spotLights[ i ].penumbraCos, dot( dl / dd, spotLights[ i ].direction ) );
				ckAcc += spotLights[ i ].color * sf * 0.1 / ( 1.0 + dd * dd * 0.35 );
			}
		}
		#pragma unroll_loop_end
		#endif
		totalEmissiveRadiance += min( ckAcc * ckL * 0.4, vec3( 0.9 ) );
	}
`;

// 掛到玻璃材質上(建立場景後、預編譯前呼叫一次)
export function installCrackShader(m) {
  if (!m || m.userData.glassCrack || !m.isMeshStandardMaterial) return m;
  m.userData.glassCrack = true;
  const prev = m.onBeforeCompile;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  m.onBeforeCompile = function (s, r) {
    if (hasPrev) prev.call(this, s, r);
    s.vertexShader = s.vertexShader
      .replace('void main() {', VERT_PARS + 'void main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', FRAG_PARS + 'void main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  };
  const key = hasPrev ? (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey() : prev.toString()) : '';
  m.customProgramCacheKey = () => 'glasscrack1|' + key;
  m.needsUpdate = true;
  return m;
}

// ======================================================================
// 每片玻璃的狀態(CPU 端)→ 寫進頂點屬性
// ======================================================================
const ATTRS = ['aCkA', 'aCkB', 'aCkC', 'aCkD', 'aCkE'];
const MAX_HIT = 4;
export const BROKEN = 2; // 受損值 ≥ 1.9:碎掉
const rnd = (s) => { const x = Math.sin(s * 91.345 + 7.13) * 43758.5453; return x - Math.floor(x); };

export class GlassPanes {
  constructor() {
    this.list = []; // { mesh, vi, W, H, seed, tempered, dmg, hits: [u,v,R]... }
    this.meshes = new Set();
  }

  // 玻璃網格加上屬性(全部 0 = 沒有資料);同一材質的其他網格也要加(否則讀到預設值 (0,0,0,1))
  prepareMesh(mesh) {
    if (this.meshes.has(mesh)) return;
    this.meshes.add(mesh);
    const g = mesh.geometry, n = g.attributes.position.count;
    for (const a of ATTRS) if (!g.attributes[a]) { const at = new THREE.BufferAttribute(new Float32Array(n * 4), 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(a, at); }
  }

  // 登記一片玻璃(ref = { mesh, vi } 四個頂點:左下、右下、右上、左上);k = 原本的貼圖格(0 完整 / 1 裂 / 2 破洞 / 3 碎)
  add(ref, W, H, k, tempered, seed) {
    if (!ref || !ref.mesh) return -1;
    this.prepareMesh(ref.mesh);
    const P = { mesh: ref.mesh, vi: ref.vi, W, H, seed: seed % 97 + 1, tempered: tempered ? 1 : 0, dmg: 0, hits: [] };
    const r1 = rnd(seed), r2 = rnd(seed + 1.7), r3 = rnd(seed + 3.1);
    if (k === 1) { P.hits.push([W * (0.25 + 0.5 * r1), H * (0.25 + 0.5 * r2), 0.28 + 0.3 * r3]); P.dmg = 0.35; }
    else if (k === 2) { P.hits.push([W * (0.3 + 0.4 * r1), H * (0.3 + 0.4 * r2), -(0.32 + 0.22 * r3)]); P.dmg = 0.4; }
    else if (k === 3) { P.dmg = BROKEN; if (r1 < 0.6) P.hits.push([W * r2, H * r3, 0.18]); }
    // 底圖一律用「髒污完整」那一格(裂紋/破洞都由 shader 畫)
    const uv = ref.mesh.geometry.attributes.uv;
    const j = rnd(seed + 5.5) * 0.04;
    uv.setXY(ref.vi, 0.02 + j, 0.52); uv.setXY(ref.vi + 1, 0.46 + j, 0.52); uv.setXY(ref.vi + 2, 0.46 + j, 0.96); uv.setXY(ref.vi + 3, 0.02 + j, 0.96);
    uv.needsUpdate = true;
    this.list.push(P);
    const i = this.list.length - 1;
    this.write(i);
    return i;
  }

  broken(i) { return i >= 0 && this.list[i].dmg >= 1.9; }
  damage(i) { return i >= 0 ? this.list[i].dmg : 0; }

  // 片內座標 (u,v) 是否在既有的大破洞裡(子彈直接穿過)
  inHole(i, u, v) {
    const P = this.list[i];
    for (const [hu, hv, R] of P.hits) if (R < 0 && Math.hypot(u - hu, v - hv) < -R * 0.28 * 0.75) return true;
    return false;
  }

  // 中彈:add = 這一發的受損量;回傳 true = 這一發讓整片失效(呼叫端負責碎裂效果)
  hit(i, u, v, add) {
    const P = this.list[i];
    if (P.dmg >= 1.9) return false;
    const R0 = 0.09 + Math.min(1, add) * 0.3;
    for (const h of P.hits) if (h[2] > 0) h[2] = Math.min(Math.max(P.W, P.H) * 0.8, h[2] * (1 + add * 0.55)); // 舊裂紋跟著延伸
    if (P.hits.length >= MAX_HIT) P.hits.shift();
    P.hits.push([u, v, R0]);
    if (P.tempered) P.dmg = P.dmg < 0.3 && add < 0.5 ? 0.6 : 2; // 強化玻璃:先整片龜裂,再一發就整片崩落
    else P.dmg += add;
    const fail = P.dmg >= 1;
    if (fail) P.dmg = BROKEN;
    this.write(i);
    return fail;
  }

  shatter(i) {
    const P = this.list[i];
    if (P.dmg >= 1.9) return false;
    P.dmg = BROKEN;
    this.write(i);
    return true;
  }

  write(i) {
    const P = this.list[i], g = P.mesh.geometry, vi = P.vi;
    const A = g.attributes.aCkA, B = g.attributes.aCkB, C = g.attributes.aCkC, D = g.attributes.aCkD, E = g.attributes.aCkE;
    const h = P.hits, hv = (k, c) => (h[k] ? h[k][c] : 0);
    const corners = [[0, 0], [P.W, 0], [P.W, P.H], [0, P.H]];
    for (let k = 0; k < 4; k++) {
      A.setXYZW(vi + k, corners[k][0], corners[k][1], P.W, P.H);
      B.setXYZW(vi + k, P.seed, P.dmg, P.tempered, 7);
      C.setXYZW(vi + k, hv(0, 0), hv(0, 1), hv(1, 0), hv(1, 1));
      D.setXYZW(vi + k, hv(2, 0), hv(2, 1), hv(3, 0), hv(3, 1));
      E.setXYZW(vi + k, hv(0, 2), hv(1, 2), hv(2, 2), hv(3, 2));
    }
    for (const a of [A, B, C, D, E]) { a.addUpdateRange(vi * 4, 16); a.needsUpdate = true; }
  }
}
