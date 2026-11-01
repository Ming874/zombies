// ===== GfxPass 的全螢幕 shader(src/gfx/pipeline.js)=====
// 全部是 ShaderMaterial(WebGL2 → GLSL ES 3.00:可用 texelFetch / textureLod / sampler2DShadow / sampler3D)。
// 樣本數、強度都是 uniform(迴圈有固定上限再 break)→ 換畫質、自動調整都不重編。
// 座標:uv 原點左下、視空間 y 朝上、相機看 -z;深度貼圖 [0,1] 透視深度。

export const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

// 共用:深度 → 視空間距離、uv + 距離 → 視空間位置(含 TAA 抖動的投影)
export const COMMON = /* glsl */`
#ifndef PI
#define PI 3.141592653589793
#endif
uniform vec4 uProjInfo; // 1/P00, 1/P11, P02, P12(目前幀、含抖動)
uniform vec2 uNF; // near, far
uniform vec2 uFull; uniform vec2 uHalf; // 全解析度 / 半解析度像素數
uniform float uFrame;
float linZ( float d ) { return uNF.x * uNF.y / ( uNF.y - ( uNF.y - uNF.x ) * d ); }
vec3 vpos( vec2 uv, float L ) { return vec3( ( uv * 2.0 - 1.0 + uProjInfo.zw ) * uProjInfo.xy * L, - L ); }
vec2 vproj( vec3 P ) { return ( P.xy / ( uProjInfo.xy * - P.z ) - uProjInfo.zw ) * 0.5 + 0.5; }
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
float bayer4( vec2 p ) { ivec2 q = ivec2( mod( p, 4.0 ) ); int i = q.x + q.y * 4;
  int b[ 16 ] = int[ 16 ]( 0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5 ); return ( float( b[ i ] ) + 0.5 ) / 16.0; }
// NaN/Inf/負值 → 0;極亮(手電筒貼牆)夾到 59,不再整個變黑(舊的 SanitizeShader 會把 ≥ 60 當成無效值)
vec3 sanitize( vec3 c ) { return vec3( c.r >= 0.0 && c.r < 1e4 ? min( c.r, 59.0 ) : 0.0, c.g >= 0.0 && c.g < 1e4 ? min( c.g, 59.0 ) : 0.0, c.b >= 0.0 && c.b < 1e4 ? min( c.b, 59.0 ) : 0.0 ); }
`;

// ---- 半解析度準備:棋盤式取深度(交錯取最近/最遠,邊緣兩邊都有代表)+ 由全解析度深度重建法線 → RGBA16F(距離, 視空間法線)
export const PREP = /* glsl */`
uniform sampler2D tDepth;
${COMMON}
vec3 vposPx( ivec2 p, float L ) { return vpos( ( vec2( p ) + 0.5 ) / uFull, L ); }
float zAt( ivec2 p ) { return linZ( texelFetch( tDepth, clamp( p, ivec2( 0 ), ivec2( uFull ) - 1 ), 0 ).x ); }
void main() {
  ivec2 q = ivec2( gl_FragCoord.xy ), b = q * 2, lim = ivec2( uFull ) - 1;
  ivec2 p0 = min( b, lim ), p1 = min( b + ivec2( 1, 0 ), lim ), p2 = min( b + ivec2( 0, 1 ), lim ), p3 = min( b + ivec2( 1, 1 ), lim );
  float d0 = texelFetch( tDepth, p0, 0 ).x, d1 = texelFetch( tDepth, p1, 0 ).x, d2 = texelFetch( tDepth, p2, 0 ).x, d3 = texelFetch( tDepth, p3, 0 ).x;
  bool far = ( ( q.x + q.y ) & 1 ) == 1;
  ivec2 p = p0; float d = d0;
  if ( far ? d1 > d : d1 < d ) { d = d1; p = p1; }
  if ( far ? d2 > d : d2 < d ) { d = d2; p = p2; }
  if ( far ? d3 > d : d3 < d ) { d = d3; p = p3; }
  float c = linZ( d );
  if ( d >= 0.99999 ) { gl_FragColor = vec4( uNF.y, 0.0, 0.0, 1.0 ); return; }
  float l = zAt( p - ivec2( 1, 0 ) ), r = zAt( p + ivec2( 1, 0 ) ), bo = zAt( p - ivec2( 0, 1 ) ), t = zAt( p + ivec2( 0, 1 ) );
  vec3 P = vposPx( p, c );
  vec3 dx = abs( r - c ) < abs( c - l ) ? vposPx( p + ivec2( 1, 0 ), r ) - P : P - vposPx( p - ivec2( 1, 0 ), l );
  vec3 dy = abs( t - c ) < abs( c - bo ) ? vposPx( p + ivec2( 0, 1 ), t ) - P : P - vposPx( p - ivec2( 0, 1 ), bo );
  vec3 N = normalize( cross( dx, dy ) );
  gl_FragColor = vec4( c, N );
}`;

// ---- GTAO(Jimenez 2016 / XeGTAO 的切片積分):每像素 uSlices 片 × 兩側 uSteps 步,半解析度
export const AO = /* glsl */`
uniform sampler2D tPrep;
uniform float uRadius; uniform float uSlices; uniform float uSteps; uniform float uMaxPx; uniform float uTemporal; uniform float uPow;
${COMMON}
#define HPI 1.5707963
float fastAcos( float x ) { float a = abs( x ); float r = ( - 0.156583 * a + HPI ) * sqrt( 1.0 - a ); return x >= 0.0 ? r : PI - r; }
void main() {
  ivec2 q = ivec2( gl_FragCoord.xy );
  vec4 c = texelFetch( tPrep, q, 0 );
  float L = c.x;
  if ( L >= uNF.y * 0.98 ) { gl_FragColor = vec4( 1.0 ); return; }
  vec2 uv = ( vec2( q ) + 0.5 ) / uHalf;
  vec3 P = vpos( uv, L ), N = normalize( c.yzw ), V = normalize( - P );
  float rPx = min( uRadius / ( L * uProjInfo.x ) * 0.5 * uHalf.x, uMaxPx );
  if ( rPx < 1.5 ) { gl_FragColor = vec4( 1.0 ); return; }
  float fr = uRadius * 0.62, fMul = - 1.0 / fr, fAdd = ( uRadius - fr ) / fr + 1.0;
  float rot = bayer4( gl_FragCoord.xy ) + uTemporal * fract( uFrame * 0.618034 );
  float jit = fract( ign( gl_FragCoord.xy ) + uTemporal * uFrame * 0.7548777 );
  float vis = 0.0;
  for ( int s = 0; s < 4; s ++ ) {
    if ( float( s ) >= uSlices ) break;
    float phi = ( float( s ) + rot ) * PI / uSlices;
    vec2 dir = vec2( cos( phi ), sin( phi ) );
    vec3 dv = vec3( dir, 0.0 );
    vec3 ortho = dv - dot( dv, V ) * V;
    vec3 axis = normalize( cross( ortho, V ) );
    vec3 pn = N - axis * dot( N, axis );
    float pl = length( pn ) + 1e-4;
    float cosN = clamp( dot( pn, V ) / pl, 0.0, 1.0 );
    float n = sign( dot( ortho, pn ) ) * fastAcos( cosN );
    float lo0 = cos( n + HPI ), lo1 = cos( n - HPI );
    float hc0 = lo0, hc1 = lo1;
    for ( int j = 0; j < 10; j ++ ) {
      if ( float( j ) >= uSteps ) break;
      float t = ( float( j ) + jit ) / uSteps;
      vec2 off = dir * max( t * t * rPx, float( j ) + 1.0 ) / uHalf;
      vec2 u0 = uv + off, u1 = uv - off;
      vec3 S0 = vpos( u0, texture2D( tPrep, u0 ).x ) - P;
      vec3 S1 = vpos( u1, texture2D( tPrep, u1 ).x ) - P;
      float l0 = length( S0 ), l1 = length( S1 );
      float w0 = clamp( l0 * fMul + fAdd, 0.0, 1.0 ), w1 = clamp( l1 * fMul + fAdd, 0.0, 1.0 );
      hc0 = max( hc0, mix( lo0, dot( S0, V ) / max( l0, 1e-4 ), w0 ) );
      hc1 = max( hc1, mix( lo1, dot( S1, V ) / max( l1, 1e-4 ), w1 ) );
    }
    float h0 = - fastAcos( hc1 ), h1 = fastAcos( hc0 );
    h0 = n + clamp( h0 - n, - HPI, HPI );
    h1 = n + clamp( h1 - n, - HPI, HPI );
    float sn = sin( n );
    vis += pl * ( ( cosN + 2.0 * h0 * sn - cos( 2.0 * h0 - n ) ) + ( cosN + 2.0 * h1 * sn - cos( 2.0 * h1 - n ) ) ) * 0.25;
  }
  vis = pow( clamp( vis / uSlices, 0.0, 1.0 ), uPow ); // 物理的 GTAO 在 90° 牆角只有 ~0.75:加次方讓接地感看得出來
  gl_FragColor = vec4( vis, 0.0, 0.0, 1.0 );
}`;

// ---- AO 4×4 雙邊模糊(4×4 Bayer 旋轉的週期剛好被平均掉;深度差大的不混)
export const AOBLUR = /* glsl */`
uniform sampler2D tAO; uniform sampler2D tPrep;
${COMMON}
void main() {
  ivec2 q = ivec2( gl_FragCoord.xy ), lim = ivec2( uHalf ) - 1;
  float L0 = texelFetch( tPrep, q, 0 ).x;
  float s = 0.0, w = 0.0;
  for ( int y = - 1; y <= 2; y ++ ) for ( int x = - 1; x <= 2; x ++ ) {
    ivec2 p = clamp( q + ivec2( x, y ), ivec2( 0 ), lim );
    float L = texelFetch( tPrep, p, 0 ).x;
    float k = max( 0.0, 1.0 - abs( L - L0 ) / ( 0.04 * L0 + 0.03 ) );
    s += texelFetch( tAO, p, 0 ).r * k; w += k;
  }
  gl_FragColor = vec4( w > 0.0 ? s / w : 1.0, 0.0, 0.0, 1.0 );
}`;

// ---- 色彩金字塔:場景顏色縮到半解析度(之後 three 產生 mipmap,SSR 依粗糙度取模糊層)
export const DOWN = /* glsl */`
uniform sampler2D tColor;
varying vec2 vUv;
${COMMON}
void main() { gl_FragColor = vec4( sanitize( texture2D( tColor, vUv ).rgb ), 1.0 ); }`;

// 雨滴漣漪(與 src/map/weather/wet.js 的 wRipple 同一個公式 → 水窪倒影跟材質上的漣漪對得上)
const RIPPLE = /* glsl */`
uniform float uRainT; uniform float uRain; uniform float uRipple;
float wHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec2 wRipple( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );
  for ( int k = 0; k < 3; k ++ ) {
    if ( float( k ) >= uRipple ) break;
    vec2 q = p * 3.3 + vec2( 17.3, 5.1 ) * float( k );
    vec2 i = floor( q ), f = fract( q );
    float h = wHash( i + float( k ) * 7.13 );
    float ph = t * ( 0.9 + 0.5 * h ) + h * 11.0;
    float age = fract( ph ), cyc = floor( ph );
    if ( wHash( i + cyc * 0.731 ) > 0.25 + 0.75 * uRain ) continue;
    vec2 c = vec2( wHash( i + cyc * 1.37 + 3.3 ), wHash( i + cyc * 2.11 + 5.7 ) ) * 0.5 + 0.25;
    vec2 d = f - c;
    float r = length( d ) + 1e-4;
    float R = age * 0.34;
    float x = ( r - R ) * 24.0;
    float env = ( 1.0 - age ) * ( 1.0 - age ) * exp( - x * x * 0.3 ) * ( 1.0 - smoothstep( 0.3, 0.42, r ) );
    g += d / r * sin( x * 1.7 ) * env;
  }
  return g;
}`;

// ---- 螢幕空間反射(半解析度,只做朝上的面:地板、水窪、車頂)
// 粗糙度/金屬來自場景緩衝的 alpha(gbuf.js);命中點顏色從色彩金字塔取(越粗糙/越遠取越模糊的層);
// 沒打到 = 不加(場景顏色裡原本的環境貼圖反射就是退路)
export const SSR = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tPyr; uniform sampler2D tPrep;
uniform mat4 uView; uniform mat4 uInvView;
uniform float uSteps; uniform float uMaxDist; uniform float uMaxRough; uniform float uJitter; uniform float uPyrMax;
${COMMON}
${RIPPLE}
vec2 hash2( vec2 p ) { return fract( sin( vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 ); }
void main() {
  ivec2 q = ivec2( gl_FragCoord.xy );
  vec2 uv = ( vec2( q ) + 0.5 ) / uHalf;
  vec4 pr = texelFetch( tPrep, q, 0 );
  float L = pr.x;
  float a = texture2D( tColor, uv ).a;
  if ( a < 2.0 || a > 3.95 || L >= uNF.y * 0.95 ) { gl_FragColor = vec4( 0.0 ); return; }
  float metal = step( 2.95, a ), rough = clamp( ( a - 2.0 - metal ) / 0.9, 0.0, 1.0 );
  vec3 Nw = ( uInvView * vec4( pr.yzw, 0.0 ) ).xyz;
  if ( rough > uMaxRough || Nw.y < 0.7 ) { gl_FragColor = vec4( 0.0 ); return; }
  vec3 P = vpos( uv, L );
  vec3 W = ( uInvView * vec4( P, 1.0 ) ).xyz;
  vec3 nW = vec3( 0.0, 1.0, 0.0 ); // 地板是平的:用真正的上方向(重建法線在遠處會抖)
  if ( Nw.y < 0.97 ) nW = normalize( Nw );
  if ( rough < 0.12 && uRain > 0.02 && uRipple > 0.5 ) { vec2 g = wRipple( W.xz, uRainT ) * 0.16 * ( 0.4 + 0.6 * uRain ) * ( 1.0 - smoothstep( 7.0, 18.0, L ) ); nW = normalize( vec3( - g.x, 1.0, - g.y ) ); }
  if ( uJitter > 0.5 && rough > 0.05 ) { // 粗糙面:法線在 GGX 尺度內隨機偏(TAA 收斂)
    vec2 xi = hash2( vec2( q ) + fract( uFrame * 0.618 ) * 97.0 );
    float th = atan( rough * rough * sqrt( xi.x / max( 1.0 - xi.x, 1e-3 ) ) ), ph = 6.2831853 * xi.y;
    vec3 tA = normalize( cross( nW, vec3( 0.0, 0.0, 1.0 ) ) ), tB = cross( nW, tA );
    nW = normalize( nW * cos( th ) + ( tA * cos( ph ) + tB * sin( ph ) ) * sin( th ) * 0.6 );
  }
  vec3 N = normalize( ( uView * vec4( nW, 0.0 ) ).xyz );
  vec3 Vd = normalize( P );
  vec3 R = reflect( Vd, N );
  float toCam = 1.0 - smoothstep( - 0.15, 0.35, R.z ); // 往鏡頭方向的反射:畫面上沒有資料
  if ( toCam <= 0.0 ) { gl_FragColor = vec4( 0.0 ); return; }
  float jit = uJitter > 0.5 ? fract( ign( gl_FragCoord.xy ) + uFrame * 0.7548777 ) : bayer4( gl_FragCoord.xy );
  float stepL = uMaxDist / uSteps;
  float tPrev = 0.0, tHit = - 1.0;
  vec2 hitUV = vec2( 0.0 );
  vec3 O = P + N * ( 0.03 + 0.004 * L );
  for ( int i = 0; i < 48; i ++ ) {
    if ( float( i ) >= uSteps ) break;
    float t = ( float( i ) + jit ) * stepL * ( 1.0 + float( i ) * 0.06 );
    vec3 Y = O + R * t;
    if ( Y.z > - uNF.x ) break;
    vec2 su = vproj( Y );
    if ( su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0 ) break;
    float sL = texture2D( tPrep, su ).x;
    float dz = - Y.z - sL;
    if ( dz > 0.0 && dz < 0.25 + t * 0.12 ) {
      float t0 = tPrev, t1 = t; // 二分法收斂到交點
      for ( int k = 0; k < 5; k ++ ) {
        float tm = 0.5 * ( t0 + t1 );
        vec3 Ym = O + R * tm;
        float dm = - Ym.z - texture2D( tPrep, vproj( Ym ) ).x;
        if ( dm > 0.0 ) t1 = tm; else t0 = tm;
      }
      tHit = t1; hitUV = vproj( O + R * t1 );
      break;
    }
    tPrev = t;
  }
  if ( tHit < 0.0 ) { gl_FragColor = vec4( 0.0 ); return; }
  vec2 e = smoothstep( vec2( 0.0 ), vec2( 0.07 ), hitUV ) * smoothstep( vec2( 0.0 ), vec2( 0.07 ), 1.0 - hitUV );
  float conf = e.x * e.y * toCam * ( 1.0 - smoothstep( 0.55, 1.0, tHit / ( uMaxDist * 2.2 ) ) );
  float hitL = texture2D( tPrep, hitUV ).x;
  if ( hitL >= uNF.y * 0.95 ) conf *= 0.3; // 打到天空:淡一點(天空本身也在色彩金字塔裡)
  float lod = clamp( rough * 7.0 * clamp( tHit / max( L, 0.5 ) * 2.0 + 0.3, 0.3, 1.6 ), 0.0, uPyrMax );
  vec3 col = textureLod( tPyr, hitUV, lod ).rgb;
  float NoV = clamp( dot( N, - Vd ), 0.0, 1.0 );
  float F0 = mix( rough < 0.12 ? 0.025 : 0.04, 0.5, metal );
  float F = F0 + ( 1.0 - F0 ) * pow( 1.0 - NoV, 5.0 );
  float spec = F * ( 1.0 - rough ) * ( 1.0 - rough * 0.6 );
  gl_FragColor = vec4( col * spec * conf, conf );
}`;

// ---- 體積光(半解析度):手電筒與月光沿視線取樣它們的陰影圖(真正被擋住的光柱)+ 燈泡光暈的解析積分
// rgb = 月光 + 燈(世界空間重投影累積);a = 手電筒(跟著鏡頭的光束:同一個 uv 累積,不重投影)
export const VOL = /* glsl */`
uniform sampler2D tPrep; uniform sampler2D tPrev; uniform sampler3D tNoise;
uniform mat4 uInvView; uniform mat4 uPrevVP; uniform vec3 uCam; uniform float uTime;
uniform float uSteps; uniform float uMaxDist; uniform float uSigma; uniform float uFogD; uniform float uReset; uniform float uBlend; uniform float uDust;
uniform float uFOn; uniform vec3 uFPos; uniform vec3 uFDir; uniform vec2 uFCos; uniform float uFRange; uniform mat4 uFShadowM; uniform sampler2DShadow tFShadow; uniform float uFShadow;
uniform float uMOn; uniform vec3 uMDir; uniform vec3 uMCol; uniform mat4 uMShadowM; uniform sampler2DShadow tMShadow; uniform float uMShadow;
uniform vec4 uLPos[ 8 ]; uniform vec3 uLCol[ 8 ]; uniform int uLN;
${COMMON}
float hg( float c, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / ( 12.566371 * pow( max( 1.0 + g2 - 2.0 * g * c, 1e-3 ), 1.5 ) ); }
float shadowAt( sampler2DShadow m, mat4 M, vec3 X, float bias ) {
  vec4 s = M * vec4( X, 1.0 ); s.xyz /= s.w;
  if ( s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0 ) return 1.0;
  return texture( m, vec3( s.xy, s.z - bias ) );
}
void main() {
  ivec2 q = ivec2( gl_FragCoord.xy );
  vec2 uv = ( vec2( q ) + 0.5 ) / uHalf;
  float L = texelFetch( tPrep, q, 0 ).x;
  vec3 Wp = ( uInvView * vec4( vpos( uv, L ), 1.0 ) ).xyz;
  vec3 rd = Wp - uCam; float D = length( rd ); rd /= max( D, 1e-4 );
  float Dm = min( D, uMaxDist );
  // 燈:點光源的單次散射在均勻介質中有解析解 ∫ 1/(h²+(t-tc)²) dt
  vec3 lamp = vec3( 0.0 );
  for ( int i = 0; i < 8; i ++ ) {
    if ( i >= uLN ) break;
    vec3 oc = uLPos[ i ].xyz - uCam;
    float tc = dot( oc, rd ), h = sqrt( max( dot( oc, oc ) - tc * tc, 0.0025 ) );
    float I = ( atan( ( Dm - tc ) / h ) - atan( - tc / h ) ) / h;
    float win = clamp( 1.0 - pow( h / uLPos[ i ].w, 4.0 ), 0.0, 1.0 );
    float fogT = exp( - uFogD * uFogD * max( tc, 0.0 ) * max( tc, 0.0 ) );
    lamp += uLCol[ i ] * I * win * win * fogT;
  }
  lamp *= uSigma * 0.0796; // 等向相位 1/4π
  // 手電筒 + 月光:沿視線步進取樣陰影圖
  float jit = fract( ign( gl_FragCoord.xy ) + uFrame * 0.7548777 );
  float dt = Dm / uSteps;
  float fl = 0.0, mo = 0.0;
  float phM = hg( dot( rd, - uMDir ), 0.45 );
  for ( int i = 0; i < 32; i ++ ) {
    if ( float( i ) >= uSteps ) break;
    float t = ( float( i ) + jit ) * dt;
    vec3 X = uCam + rd * t;
    float T = exp( - uFogD * uFogD * t * t ); // 與材質的 FogExp2 同一條衰減
    float dens = mix( 1.0, texture( tNoise, X * 0.16 + vec3( uTime * 0.013, - uTime * 0.021, uTime * 0.009 ) ).r * 1.9, uDust );
    if ( uFOn > 0.5 ) {
      vec3 Lf = X - uFPos; float d = length( Lf ); vec3 l = Lf / max( d, 1e-3 );
      float ca = dot( l, uFDir );
      if ( ca > uFCos.x && d < uFRange ) {
        float spot = smoothstep( uFCos.x, uFCos.y, ca );
        float fall = 1.0 / max( d * d, 0.3 ) * pow( clamp( 1.0 - pow( d / uFRange, 4.0 ), 0.0, 1.0 ), 2.0 );
        float sh = uFShadow > 0.5 ? shadowAt( tFShadow, uFShadowM, X, 0.0006 ) : 1.0;
        fl += spot * fall * sh * dens * T * hg( dot( l, - rd ), 0.18 ) * smoothstep( 0.5, 1.8, t );
      }
    }
    if ( uMOn > 0.5 ) mo += ( uMShadow > 0.5 ? shadowAt( tMShadow, uMShadowM, X, 0.0012 ) : 1.0 ) * dens * T;
  }
  vec4 cur = vec4( lamp + uMCol * ( mo * dt * phM * uSigma ), fl * dt * uSigma );
  // 時間累積:月光/燈依世界座標重投影;手電筒光束跟著鏡頭(同一個 uv)
  vec4 pc = uPrevVP * vec4( Wp, 1.0 );
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  bool ok = uReset < 0.5 && pc.w > 0.0 && puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0;
  vec3 h = texture2D( tPrev, puv ).rgb;
  float ha = texture2D( tPrev, uv ).a;
  h = clamp( h, cur.rgb * 0.25 - 0.002, cur.rgb * 4.0 + 0.002 ); // 歷史與目前差太多(遮蔽改變)就不信
  vec3 rgb = ok ? mix( h, cur.rgb, uBlend ) : cur.rgb;
  float a = uReset < 0.5 ? mix( ha, cur.a, min( 1.0, uBlend * 1.6 ) ) : cur.a;
  gl_FragColor = vec4( max( rgb, 0.0 ), max( a, 0.0 ) );
}`;

// ---- 合成(全解析度):AO / SSR / 體積光以深度感知的雙邊權重從半解析度放大,套到場景顏色上
// 輸出 alpha = 場景的 G-buffer alpha(TAA 用它判斷反應式像素)
export const COMP = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tPrep; uniform sampler2D tAO; uniform sampler2D tSSR; uniform sampler2D tVol;
uniform float uAO; uniform float uSSR; uniform float uVol; uniform vec3 uFlashCol; uniform float uFogD; uniform float uAOLuma; uniform float uDebug;
varying vec2 vUv;
${COMMON}
void main() {
  vec4 c = texture2D( tColor, vUv );
  c.rgb = sanitize( c.rgb );
  float d = texture2D( tDepth, vUv ).x;
  float L = linZ( d );
  vec2 hp = vUv * uHalf - 0.5;
  ivec2 b = ivec2( floor( hp ) ), lim = ivec2( uHalf ) - 1;
  vec2 f = hp - floor( hp );
  ivec2 o[ 4 ] = ivec2[ 4 ]( ivec2( 0, 0 ), ivec2( 1, 0 ), ivec2( 0, 1 ), ivec2( 1, 1 ) );
  float bw[ 4 ] = float[ 4 ]( ( 1.0 - f.x ) * ( 1.0 - f.y ), f.x * ( 1.0 - f.y ), ( 1.0 - f.x ) * f.y, f.x * f.y );
  float ao = 0.0, ws = 0.0; vec4 sr = vec4( 0.0 ), vo = vec4( 0.0 );
  for ( int k = 0; k < 4; k ++ ) {
    ivec2 p = clamp( b + o[ k ], ivec2( 0 ), lim );
    float Lk = texelFetch( tPrep, p, 0 ).x;
    float w = bw[ k ] * exp( - abs( Lk - L ) / ( 0.03 * L + 0.02 ) ) + 1e-5;
    ws += w;
    if ( uAO > 0.0 ) ao += texelFetch( tAO, p, 0 ).r * w;
    if ( uSSR > 0.0 ) sr += texelFetch( tSSR, p, 0 ) * w;
    if ( uVol > 0.0 ) vo += texelFetch( tVol, p, 0 ) * w;
  }
  ao /= ws; sr /= ws; vo /= ws;
  float fogF = 1.0 - exp( - uFogD * uFogD * L * L );
  float sky = step( 0.99999, d );
  if ( uAO > 0.0 ) {
    float luma = dot( c.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    float k = uAO * ( 1.0 - fogF ) * ( 1.0 - sky ) * ( 1.0 - uAOLuma * smoothstep( 0.2, 2.5, luma ) );
    c.rgb *= mix( 1.0, ao, clamp( k, 0.0, 1.0 ) );
  }
  if ( uSSR > 0.0 ) c.rgb += sr.rgb * uSSR * ( 1.0 - 0.85 * fogF );
  if ( uVol > 0.0 ) c.rgb += ( vo.rgb + vo.a * uFlashCol ) * uVol;
  if ( uDebug > 0.5 ) { // 除錯檢視:1 AO、2 SSR(×4)、3 體積光(×4)
    c.rgb = uDebug < 1.5 ? vec3( ao ) : uDebug < 2.5 ? sr.rgb * 4.0 + vec3( 0.0, 0.0, sr.a * 0.05 ) : ( vo.rgb + vo.a * uFlashCol ) * 4.0;
  }
  gl_FragColor = vec4( c.rgb, c.a );
}`;

// ---- TAA(全解析度):YCoCg 變異數裁剪、Catmull-Rom 取歷史、亮度加權混合;a ≥ 4.2 的反應式像素(雨絲)多用當前幀
export const TAA = /* glsl */`
uniform sampler2D tCur; uniform sampler2D tHist; uniform sampler2D tDepth;
uniform mat4 uInvView; uniform mat4 uVP; uniform mat4 uPrevVP; uniform float uReset; uniform float uAlpha;
varying vec2 vUv;
${COMMON}
vec3 toY( vec3 c ) { return vec3( 0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, - 0.25 * c.r + 0.5 * c.g - 0.25 * c.b ); }
vec3 fromY( vec3 y ) { return vec3( y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z ); }
vec3 tm( vec3 c ) { return c / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }
vec3 itm( vec3 c ) { return c / max( 1.0 - max( c.r, max( c.g, c.b ) ), 1e-3 ); }
vec3 histCR( vec2 uv ) { // Catmull-Rom 5 次雙線性取樣
  vec2 sp = uv * uFull, tc = floor( sp - 0.5 ) + 0.5, f = sp - tc;
  vec2 w0 = f * ( - 0.5 + f * ( 1.0 - 0.5 * f ) ), w1 = 1.0 + f * f * ( - 2.5 + 1.5 * f ), w2 = f * ( 0.5 + f * ( 2.0 - 1.5 * f ) ), w3 = f * f * ( - 0.5 + 0.5 * f );
  vec2 w12 = w1 + w2, t0 = ( tc - 1.0 ) / uFull, t3 = ( tc + 2.0 ) / uFull, t12 = ( tc + w2 / w12 ) / uFull;
  vec3 r = texture2D( tHist, vec2( t12.x, t0.y ) ).rgb * ( w12.x * w0.y ) + texture2D( tHist, vec2( t0.x, t12.y ) ).rgb * ( w0.x * w12.y )
    + texture2D( tHist, t12 ).rgb * ( w12.x * w12.y ) + texture2D( tHist, vec2( t3.x, t12.y ) ).rgb * ( w3.x * w12.y ) + texture2D( tHist, vec2( t12.x, t3.y ) ).rgb * ( w12.x * w3.y );
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max( r / ws, 0.0 );
}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy ), lim = ivec2( uFull ) - 1;
  vec4 c0 = texelFetch( tCur, p, 0 );
  vec3 m1 = vec3( 0.0 ), m2 = vec3( 0.0 );
  float dMin = 1.0; vec2 dOff = vec2( 0.0 );
  for ( int y = - 1; y <= 1; y ++ ) for ( int x = - 1; x <= 1; x ++ ) {
    ivec2 pp = clamp( p + ivec2( x, y ), ivec2( 0 ), lim );
    vec3 s = toY( tm( texelFetch( tCur, pp, 0 ).rgb ) );
    m1 += s; m2 += s * s;
    float d = texelFetch( tDepth, pp, 0 ).x;
    if ( d < dMin ) { dMin = d; dOff = vec2( x, y ); }
  }
  vec3 mu = m1 / 9.0, sg = sqrt( max( m2 / 9.0 - mu * mu, 0.0 ) );
  vec3 cur = toY( tm( c0.rgb ) );
  // 用 3×3 內最近的深度重投影(物體邊緣的歷史跟著前景走,不會拖影)
  vec2 uvD = vUv + dOff / uFull;
  vec4 W = uInvView * vec4( vpos( uvD, linZ( dMin ) ), 1.0 );
  vec4 cc = uVP * W, pc = uPrevVP * W;
  vec2 vel = ( cc.xy / cc.w - pc.xy / pc.w ) * 0.5;
  vec2 huv = vUv - vel;
  float a = uAlpha;
  float react = smoothstep( 4.2, 7.0, c0.a );
  a = max( a, react * 0.8 );
  a = max( a, clamp( length( vel * uFull ) * 0.015, 0.0, 0.25 ) );
  if ( uReset > 0.5 || huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0 ) a = 1.0;
  vec3 h = toY( tm( histCR( huv ) ) );
  // 變異數 AABB 裁剪(朝中心夾)
  float g = mix( 1.25, 0.75, react );
  vec3 bmin = mu - g * sg, bmax = mu + g * sg;
  vec3 ctr = 0.5 * ( bmin + bmax ), ext = 0.5 * ( bmax - bmin ) + 1e-4;
  vec3 v = h - ctr, u = abs( v / ext );
  float m = max( u.x, max( u.y, u.z ) );
  if ( m > 1.0 ) h = ctr + v / m;
  // 亮度加權(避免高光閃爍)
  float wc = a / ( 1.0 + cur.x ), wh = ( 1.0 - a ) / ( 1.0 + h.x );
  vec3 r = ( cur * wc + h * wh ) / ( wc + wh );
  gl_FragColor = vec4( itm( fromY( r ) ), 1.0 );
}`;

// ---- 複製到 composer 的緩衝(多重取樣;之後手持武器畫在上面),順便輕微銳化(TAA 會軟一點)
export const COPY = /* glsl */`
uniform sampler2D tSrc; uniform float uSharp;
varying vec2 vUv;
${COMMON}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy ), lim = ivec2( uFull ) - 1;
  vec3 c = texelFetch( tSrc, p, 0 ).rgb;
  if ( uSharp > 0.0 ) {
    vec3 a = texelFetch( tSrc, clamp( p + ivec2( 0, 1 ), ivec2( 0 ), lim ), 0 ).rgb, b = texelFetch( tSrc, clamp( p - ivec2( 0, 1 ), ivec2( 0 ), lim ), 0 ).rgb;
    vec3 d = texelFetch( tSrc, clamp( p + ivec2( 1, 0 ), ivec2( 0 ), lim ), 0 ).rgb, e = texelFetch( tSrc, clamp( p - ivec2( 1, 0 ), ivec2( 0 ), lim ), 0 ).rgb;
    vec3 lo = min( min( a, b ), min( d, e ) ), hi = max( max( a, b ), max( d, e ) );
    c = clamp( c + ( c - ( a + b + d + e ) * 0.25 ) * uSharp, min( c, lo ), max( c, hi ) ); // 夾在鄰居範圍內:高對比邊緣不會出現光圈
  }
  gl_FragColor = vec4( max( c, 0.0 ), 1.0 );
}`;
