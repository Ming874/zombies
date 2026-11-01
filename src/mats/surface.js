import * as THREE from 'three';
import { paintTexture } from '../sys/texworker.js';
import { CLASS_PARAMS, CLASS } from './classes.js';
import { ENC_MIN, encodeSurface } from './encode.js';

// 物品表面著色器(onBeforeCompile,掛在共用材質上):道具合併後的頂點色材質(plain:*)、可推動道具(pi_dyn_*)、互動物件(ix:*)。
// 依頂點 UV 裡的編碼(src/mats/encode.js)取得類別與面內座標 → 細節貼圖(Worker 畫的,src/mats/detail.paint.js):
//   色塊斑駁/污漬、木紋/布紋/皮紋/拉絲、刮痕、指紋油污、邊角磨損(掉漆露出鋼板與鏽圈、塑膠磨白、木頭漆面磨掉)、
//   地面附近的污垢、朝上面的積灰、凹凸、金屬/介電質分開、反照率校正、蠟/皮膚的包覆暖光、室內環境反射。
// 沒有編碼的幾何(戶外道具、其他系統)完全不變。同一種 shader 給所有類別(參數表 uniform)→ 不會因類別增加 program。
const U = {
  tSurfA: { value: null },
  tSurfB: { value: null },
  tSurfC: { value: null },
  tSurfEnv: { value: null },
  uSurfP: { value: CLASS_PARAMS },
  uSurfG: { value: new THREE.Vector4(0, 4.2, -4.2, 1.0) }, // x 細節開關 y 樓層高 z 最低樓層地面 y w 室內反射強度
  uSurfD: { value: new THREE.Vector4(0, 0, 0, 0) }, // 開發:x = 除錯輸出(1 斑駁 2 積灰 3 缺口雜訊 4 法線 5 粗糙度 6 面內座標 7 微起伏 8 刮痕 9 磨損)
};
export const surfaceUniforms = U;

// vSC(類別、旗標、亂數)用 flat:插值後的小誤差經過 hash(sin × 43758)會變成逐像素亂跳的貼圖偏移 → 一點一點的雜訊
const VS_PARS = /* glsl */`
varying vec4 vSF;
flat varying vec4 vSC;
varying vec3 vSW;
`;
const VS_MAIN = /* glsl */`
	{
		vec4 sw = vec4( transformed, 1.0 );
		vec3 ot = modelMatrix[ 3 ].xyz;
		#ifdef USE_BATCHING
			sw = batchingMatrix * sw;
			ot += batchingMatrix[ 3 ].xyz;
		#endif
		#ifdef USE_INSTANCING
			sw = instanceMatrix * sw;
			ot += instanceMatrix[ 3 ].xyz;
		#endif
		vSW = ( modelMatrix * sw ).xyz;
		vSF = vec4( 0.0 );
		vSC = vec4( 0.0 );
		if ( uv.x >= ${ENC_MIN.toFixed(1)} && uv.y >= ${ENC_MIN.toFixed(1)} ) {
			float px = floor( uv.x / 128.0 ), py = floor( uv.y / 128.0 );
			float qx = uv.x - px * 128.0, qy = uv.y - py * 128.0;
			px -= 32768.0; py -= 32768.0;
			float cls = floor( px / 512.0 ), wq = px - cls * 512.0;
			float fl = floor( py / 8192.0 ), rem = py - fl * 8192.0, sd = floor( rem / 512.0 ), hq = rem - sd * 512.0;
			sd += fract( sin( dot( ot, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ) * 16.0; // 可推動道具/實例:位置也算進亂數
			vSF = vec4( qx / 127.0, qy / 127.0, max( wq, 1.0 ) * 0.008, max( hq, 1.0 ) * 0.008 );
			vSC = vec4( cls, fl, sd, 1.0 );
		}
	}
`;
const FS_PARS = /* glsl */`
uniform sampler2D tSurfA;
uniform sampler2D tSurfB;
uniform sampler2D tSurfC;
uniform sampler2D tSurfEnv;
uniform vec4 uSurfP[ 128 ];
uniform vec4 uSurfG;
uniform vec4 uSurfD;
varying vec4 vSF;
flat varying vec4 vSC;
varying vec3 vSW;
float gSurfSSS = 0.0;
float gSurfSheen = 0.0;
float gSurfIn = 0.0;
float surfLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
// 紋理高度(依紋理型態組合兩張細節圖的通道)
float surfH( int g, vec4 A, vec4 B ) {
	if ( g == 2 ) return B.r;
	if ( g == 3 ) return B.g;
	if ( g == 4 ) return B.b;
	if ( g == 8 ) return A.r * 0.5 + B.b * 0.5;
	if ( g == 9 ) return B.g * 0.5 + A.r * 0.5;
	return A.r;
}
`;
// 主程式:顏色(反照率)之後
const FS_COLOR = /* glsl */`
	vec2 sTc = vec2( vSF.x * vSF.z, vSF.y * vSF.w );
	vec2 sTx = dFdx( sTc ), sTy = dFdy( sTc );
	vec3 sWx = dFdx( vSW ), sWy = dFdy( vSW ); // 垂直流痕用(世界座標;導數放在分支外)
	#ifdef FLAT_SHADED
		vec3 sGN = normalize( cross( dFdx( vSW ), dFdy( vSW ) ) );
	#else
		vec3 sGN = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz ); // 世界座標法線(世界座標的螢幕導數精度不夠,會一塊一塊的)
	#endif
	float sOn = step( 0.5, vSC.w ) * step( 0.5, uSurfG.x ) * step( 0.5, vSC.x );
	float sRough = 0.0, sMetal = 0.0, sAO = 1.0;
	vec2 sdH = vec2( 0.0 );
	if ( sOn > 0.5 ) {
		int sC = int( vSC.x + 0.5 ) * 4;
		vec4 P0 = uSurfP[ sC ], P1 = uSurfP[ sC + 1 ], P2 = uSurfP[ sC + 2 ], P3 = uSurfP[ sC + 3 ];
		int fl = int( vSC.y + 0.5 ), gt = int( P2.z + 0.5 ), wt = int( P2.y + 0.5 );
		vec2 off = fract( sin( vec2( vSC.z * 12.9898 + vSC.x * 3.17, vSC.z * 78.233 + vSC.x * 1.31 ) ) * 43758.5453 ) * 8.0;
		vec2 tA = ( sTc + off ) * 2.0, tB = ( sTc + off ) / P2.w, tM = ( sTc + off ) * 0.3 + 0.37;
		vec2 aX = sTx * 2.0, aY = sTy * 2.0, bX = sTx / P2.w, bY = sTy / P2.w;
		float tpp = max( length( aX ), length( aY ) ) * 1024.0; // 一個像素涵蓋幾個細節貼圖像素
		float hf1 = 1.0 - smoothstep( 1.2, 4.0, tpp );
		vec4 A = textureGrad( tSurfA, tA, aX, aY );
		vec4 C = textureGrad( tSurfC, tA, aX, aY ); // r 缺口雜訊 g 第二組雜訊 b 纖維
		vec4 Cm = textureGrad( tSurfC, tM, sTx * 0.3, sTy * 0.3 ); // 大尺度:r 斑駁 g 水漬
		vec4 B = textureGrad( tSurfB, tB, bX, bY );
		vec4 AX = textureGrad( tSurfA, tA + aX, aX, aY ), AY = textureGrad( tSurfA, tA + aY, aX, aY );
		vec4 BX = textureGrad( tSurfB, tB + bX, bX, bY ), BY = textureGrad( tSurfB, tB + bY, bX, bY );
		vec3 col = diffuseColor.rgb;
		float L = surfLum( col );
		col *= clamp( L, P0.x, P0.y ) / max( L, 1e-4 ); // 反照率校正:不要死黑、不要過亮的白
		float metal = P0.z, rough = P0.w >= 0.0 ? P0.w : roughness;
		float mac = Cm.r, stain = Cm.g;
		col *= 1.0 + ( mac - 0.5 ) * P3.y * 2.0;
		col = mix( col, col * vec3( 1.04, 1.0, 0.93 ), ( 1.0 - mac ) * P3.y ); // 舊的地方偏黃
		rough += ( mac - 0.5 ) * P1.x + ( C.r - 0.5 ) * P1.x * 0.5;
		// 紋理
		float h = surfH( gt, A, B ), hx = surfH( gt, AX, BX ), hy = surfH( gt, AY, BY );
		if ( gt == 1 ) { rough += ( C.b - 0.5 ) * 0.1 * hf1; col *= 0.97 + 0.06 * C.b; }
		else if ( gt == 2 ) { col *= mix( 0.6, 1.16, B.r ); rough += ( 0.5 - B.r ) * 0.12; }
		else if ( gt == 3 ) { col *= 0.76 + 0.36 * B.g; }
		else if ( gt == 4 ) { col *= 0.84 + 0.22 * B.b; rough -= ( B.b - 0.5 ) * 0.14; }
		else if ( gt == 5 ) { col *= 0.94 + 0.1 * C.b; }
		else if ( gt == 6 ) { col *= 0.94 + 0.09 * C.b * ( 0.6 + 0.6 * A.r ) + 0.05 * ( A.r - 0.5 ); } // 牛皮紙:纖維很淡(太明顯會像木紋夾板)
		else if ( gt == 7 ) { col *= 0.97 + 0.05 * A.r; }
		else if ( gt == 8 ) { col = mix( col, col * vec3( 1.3, 0.94, 0.7 ), B.b * 0.6 ) * ( 0.8 + 0.3 * A.r ); }
		else if ( gt == 9 ) { col *= 0.72 + 0.4 * h; }
		else if ( gt == 10 ) { col *= 0.9 + 0.2 * A.r; }
		// 刮痕(遠處淡出:一個像素蓋住好幾個貼圖像素時,細刮痕只會變成閃爍的雜點)
		float scr = A.g * P1.z * hf1;
		if ( metal > 0.5 ) { rough = mix( rough, rough + 0.1, scr ); }
		else { col = mix( col, col * 1.2 + 0.02, scr * 0.55 ); rough = mix( rough, min( 1.0, rough + 0.2 ), scr ); }
		h -= scr * 0.35; hx -= AX.g * P1.z * 0.35; hy -= AY.g * P1.z * 0.35;
		// 指紋、油污、擦拭痕:亮面上變霧
		float smg = A.b * P1.y;
		rough = mix( rough, max( rough + 0.14, 0.34 ), smg );
		col *= 1.0 - smg * 0.05;
		// 髒污:大塊水漬、靠近地面被踢髒、接觸陰影
		float hf = mod( vSW.y - uSurfG.z + 0.03, uSurfG.y );
		float kick = 1.0 - smoothstep( 0.0, 0.38, hf );
		float grime = P3.w * ( smoothstep( 0.42, 0.95, stain ) * 0.55 + kick * 0.55 );
		col = mix( col, vec3( surfLum( col ) ) * vec3( 1.06, 1.0, 0.86 ), grime * 0.35 ) * ( 1.0 - grime * 0.3 );
		rough = mix( rough, min( 1.0, rough + 0.18 ), grime * 0.5 );
		sAO = 1.0 - kick * kick * 0.45 * P3.w;
		// 垂直面上的流痕(水漬、髒水往下流的痕跡):沿著面的水平座標 × 世界高度取纖維圖 → 直條紋
		float vert = 1.0 - smoothstep( 0.3, 0.6, abs( sGN.y ) );
		if ( vert > 0.01 && P3.w > 0.0 ) {
			vec2 th = normalize( vec2( -sGN.z, sGN.x ) + 1e-5 );
			vec2 tS = vec2( vSW.y * 0.8, dot( vSW.xz, th ) * 6.0 ) + off * 0.11;
			vec2 sX = vec2( sWx.y * 0.8, dot( sWx.xz, th ) * 6.0 ), sY = vec2( sWy.y * 0.8, dot( sWy.xz, th ) * 6.0 );
			float st = textureGrad( tSurfC, tS, sX, sY ).b;
			float streak = smoothstep( 0.5, 0.85, st ) * smoothstep( 0.25, 0.75, Cm.g ) * vert * P3.w * ( 0.55 + 0.45 * kick );
			col = mix( col, col * vec3( 0.7, 0.66, 0.6 ), streak * 0.6 );
			rough = mix( rough, min( 1.0, rough + 0.12 ), streak );
		}
		// 紙箱(r2):側面的瓦楞細稜、頂面的封箱膠帶、側面的印刷字塊(褪色、磨掉)、放在地上吸水的水漬線
		if ( gt == 6 ) {
			float bW = vSF.z, bH = vSF.w, bh = fract( sin( vSC.z * 91.7 + 3.1 ) * 43758.5453 );
			float side = 1.0 - step( 0.5, abs( sGN.y ) );
			float fpx = max( abs( sTx.x ), abs( sTy.x ) ) / 0.008;
			float fk = ( 1.0 - smoothstep( 0.2, 0.6, fpx ) ) * step( 0.1, min( bW, bH ) ) * side;
			float fl0 = sin( sTc.x * 785.4 ), fl1 = sin( ( sTc.x + sTx.x ) * 785.4 ), fl2 = sin( ( sTc.x + sTy.x ) * 785.4 );
			h += fl0 * 0.5 * fk; hx += fl1 * 0.5 * fk; hy += fl2 * 0.5 * fk;
			col *= 1.0 + fl0 * 0.04 * fk;
			float pw = max( max( length( sTx ), length( sTy ) ), 0.0008 );
			if ( sGN.y > 0.7 && min( bW, bH ) > 0.25 && bh > 0.25 ) {
				float td = abs( vSF.y - 0.5 ) * bH - 0.024;
				float tape = 1.0 - smoothstep( - pw, pw, td );
				col = mix( col, col * vec3( 0.8, 0.68, 0.5 ) + 0.012, tape * 0.9 );
				col *= 1.0 - 0.25 * exp( - td * td / ( pw * pw * 2.0 + 1e-7 ) ) * min( 1.0, 0.0015 / pw );
				rough = mix( rough, 0.3 + 0.2 * A.r, tape );
			}
			// 每個面各自決定(同一疊箱子的四個面不會每面同一個位置都有同一塊字)
			float fh = fract( sin( dot( floor( sGN.xz * 1.9 + 0.5 ), vec2( 41.3, 17.9 ) ) + vSC.z * 7.31 + bh * 13.0 ) * 43758.5453 );
			if ( side > 0.5 && bW > 0.25 && bH > 0.18 && fh > 0.42 ) {
				vec2 pm = vec2( vSF.x * bW, vSF.y * bH ) - vec2( bW * ( 0.08 + 0.3 * fract( fh * 7.3 ) ), bH * ( 0.42 + 0.22 * fract( fh * 3.1 ) ) );
				vec2 bs = vec2( min( 0.12 + 0.18 * fract( fh * 5.7 ), bW * 0.5 ), min( 0.06 + 0.08 * fract( fh * 2.3 ), bH * 0.3 ) );
				if ( pm.x > 0.0 && pm.y > 0.0 && pm.x < bs.x && pm.y < bs.y ) {
					vec2 ci = floor( pm / vec2( 0.018, 0.028 ) ), cf = fract( pm / vec2( 0.018, 0.028 ) );
					float ch = fract( sin( dot( ci + fh * 17.0, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
					// 方塊字:每格 1~2 豎 + 1~3 橫(像中文印刷字);每行從左邊開始、長度不一;每三行空一行
					float inC = step( 0.12, cf.x ) * step( cf.x, 0.88 ) * step( 0.1, cf.y ) * step( cf.y, 0.9 );
					float v1 = step( abs( cf.x - 0.25 - 0.2 * fract( ch * 5.1 ) ), 0.06 ), v2 = step( abs( cf.x - 0.72 + 0.15 * fract( ch * 2.9 ) ), 0.06 ) * step( 0.4, fract( ch * 7.7 ) );
					float h1 = step( abs( cf.y - 0.2 - 0.12 * fract( ch * 9.7 ) ), 0.05 ), h2 = step( abs( cf.y - 0.52 - 0.1 * fract( ch * 4.3 ) ), 0.05 ) * step( 0.3, fract( ch * 3.3 ) );
					float h3 = step( abs( cf.y - 0.82 ), 0.05 ) * step( 0.45, fract( ch * 6.1 ) );
					float rowL = ( 0.45 + 0.55 * fract( sin( ci.y * 17.3 + fh * 31.0 ) * 43758.5453 ) ) * bs.x / 0.018;
					float glyph = step( 0.08, ch ) * inC * max( max( v1, v2 ), max( h1, max( h2, h3 ) ) ) * step( 1.0, mod( ci.y, 3.0 ) + 0.5 ) * step( ci.x, rowL );
					vec3 ink = fract( bh * 3.7 ) > 0.4 ? vec3( 0.035, 0.035, 0.04 ) : vec3( 0.04, 0.07, 0.13 );
					float wornI = 0.75 * smoothstep( 0.15, 0.5, C.g + A.r * 0.3 ) * ( 1.0 - smoothstep( 0.2, 0.45, pw / 0.018 ) ); // 字太小(遠)就淡出
					col = mix( col, ink, glyph * wornI );
				}
			}
			float hfl = mod( vSW.y - uSurfG.z + 0.03, uSurfG.y ) - 0.03;
			float wl = 0.04 + 0.06 * Cm.g + 0.02 * C.r;
			float wpw = max( max( length( sWx ), length( sWy ) ), 0.001 );
			float wet = 1.0 - smoothstep( wl - wpw, wl + wpw, hfl );
			float tl = exp( - ( hfl - wl ) * ( hfl - wl ) / ( 0.000016 + wpw * wpw ) ) * min( 1.0, 0.004 / wpw );
			col *= mix( 1.0, 0.66, wet * side ) * ( 1.0 - 0.3 * tl * side );
			rough = mix( rough, 0.98, wet * side * 0.5 );
		}
		if ( gt == 9 ) gSurfSheen = 0.55; else if ( gt == 3 ) gSurfSheen = 0.2;
		// 靠近地面:鞋子、推車輪子的黑色擦痕(非金屬)
		if ( metal < 0.5 ) col = mix( col, vec3( 0.035, 0.032, 0.03 ), A.g * kick * 0.55 * P3.w );
		// 邊角磨損(面內座標 → 到邊的距離,公尺)
		float dU = ( fl & 1 ) != 0 ? min( vSF.x, 1.0 - vSF.x ) * vSF.z : 9.0;
		float dV = ( fl & 2 ) != 0 ? min( vSF.y, 1.0 - vSF.y ) * vSF.w : 9.0;
		float dE = min( dU, dV );
		// 邊緣接近度 + 兩個尺度的雜訊 → 一塊一塊的缺口(不是一條均勻的線);靠近地面的邊被踢得更多
		float eN = 1.0 - smoothstep( 0.0, P2.x * ( 1.5 + kick * 1.5 ), dE );
		float wn = C.r * 0.62 + mac * 0.38;
		float wv = eN * 0.8 + wn * 0.62 - 0.2;
		float wear = wt > 0 && P2.x > 0.0 ? smoothstep( 0.6, 0.66, wv ) : 0.0;
		// 面中間的撞擊缺口/擦傷(烤漆、塗漆木、塑膠):少量、不規則
		if ( wt == 1 || wt == 7 || wt == 2 ) { float ic = C.r * 0.45 + A.r * 0.3 + C.g * 0.25 - ( 1.0 - Cm.r ) * 0.12; wear = max( wear, smoothstep( 0.735, 0.755, ic ) * ( wt == 2 ? 0.6 : 1.0 ) ); wv = max( wv, ic - 0.14 ); }
		if ( wt == 1 ) { // 掉漆:裸鋼 + 外圈底漆/鏽
			float rim = clamp( smoothstep( 0.5, 0.6, wv ) - wear, 0.0, 1.0 );
			col = mix( col, mix( vec3( 0.16, 0.13, 0.1 ), vec3( 0.2, 0.08, 0.03 ), C.g ), rim * 0.35 );
			float rust = smoothstep( 0.45, 0.85, C.g ); // 缺口裡:灰色底漆/鋼板,舊的地方生鏽
			col = mix( col, mix( vec3( 0.3, 0.29, 0.28 ), vec3( 0.17, 0.075, 0.03 ), rust ) * ( 0.8 + 0.3 * A.r ), wear );
			metal = mix( metal, 0.6 * ( 1.0 - rust ), wear );
			rough = mix( rough, 0.5 + 0.3 * rust, wear );
			h -= wear * 0.6; hx -= wear * 0.6; hy -= wear * 0.6;
		} else if ( wt == 2 ) { col = mix( col, col * 1.32 + 0.03, wear * 0.75 ); rough = mix( rough, min( 1.0, rough + 0.25 ), wear ); }
		else if ( wt == 3 ) { col *= 1.0 + 0.3 * wear; rough *= 1.0 - 0.45 * wear; }
		else if ( wt == 4 ) { col = mix( col, col * 1.4 + vec3( 0.035, 0.022, 0.01 ), wear * 0.8 ); rough = mix( rough, 0.78, wear ); }
		else if ( wt == 5 ) { col = mix( col, col * 1.22 + 0.03, wear * 0.65 ); }
		else if ( wt == 6 ) { col *= 1.0 - 0.14 * wear; rough = mix( rough, rough * 0.5, wear ); }
		else if ( wt == 7 ) { col = mix( col, vec3( 0.2, 0.12, 0.06 ) * ( 0.75 + 0.5 * C.b ), wear ); rough = mix( rough, 0.75, wear ); h -= wear * 0.6; hx -= wear * 0.6; hy -= wear * 0.6; }
		// 積灰(朝上的面:一層薄灰,大範圍濃淡;不做細碎顆粒 → 金屬/介電質不會混成雜訊)
		float dust = P1.w * smoothstep( 0.55, 0.97, sGN.y ) * ( 0.15 + 0.85 * smoothstep( 0.3, 0.85, mac ) ) * 0.55;
		col = mix( col, vec3( 0.26, 0.245, 0.22 ), dust * 0.6 );
		rough = mix( rough, 0.9, dust * 0.8 );
		metal *= 1.0 - dust * 0.7;
		diffuseColor.rgb = col;
		if ( uSurfD.x > 0.5 ) { int dm = int( uSurfD.x + 0.5 ); totalEmissiveRadiance = dm == 1 ? vec3( mac ) : dm == 2 ? vec3( dust ) : dm == 3 ? vec3( C.r ) : dm == 4 ? vec3( sGN * 0.5 + 0.5 ) : dm == 5 ? vec3( rough ) : dm == 7 ? vec3( A.r ) : dm == 8 ? vec3( A.g ) : dm == 9 ? vec3( wear ) : vec3( fract( sTc ), 0.0 ); diffuseColor.rgb = vec3( 0.0 ); metal = 0.0; rough = 1.0; }
		sRough = clamp( rough, 0.045, 1.0 );
		sMetal = clamp( metal, 0.0, 1.0 );
		sdH = vec2( hx - h, hy - h ) * P3.x * ( 0.35 + 0.65 * hf1 );
		gSurfSSS = P3.z;
		gSurfIn = 1.0;
	}
`;
const FS_RM = /* glsl */`
	if ( sOn > 0.5 ) { roughnessFactor = sRough; metalnessFactor = sMetal; }
`;
// 凹凸(three 的 bumpmap 方法,有限差分在螢幕空間;dFdx 放在分支外)
const FS_NORMAL = /* glsl */`
	{
		vec3 sPos = - vViewPosition, sSX = dFdx( sPos ), sSY = dFdy( sPos );
		vec3 sR1 = cross( sSY, normal ), sR2 = cross( normal, sSX );
		float sDet = dot( sSX, sR1 ) * faceDirection;
		vec3 sGrad = sign( sDet ) * ( sdH.x * sR1 + sdH.y * sR2 );
		float sGl = length( sGrad ), sDl = abs( sDet );
		sGrad *= min( 1.0, 0.45 * sDl / max( sGl, 1e-20 ) ); // 最多傾斜 ~24°(輪廓邊上的導數會亂跳,不能變成亮點)
		if ( sOn > 0.5 && sDl > 1e-20 ) normal = normalize( sDl * normal - sGrad );
	}
`;
const FS_AO = /* glsl */`
	reflectedLight.indirectDiffuse *= sAO;
	reflectedLight.indirectSpecular *= sAO;
`;
// 蠟、皮膚、骨頭:明暗交界往暗面包覆一點暖色(次表面散射的近似)
// (只加在漫射:加在 irradiance 會連鏡面一起放大,輪廓邊上 dotNV≈0 時鏡面項會爆亮)
const SSS_FROM = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const SSS_TO = /* glsl */`reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
	if ( gSurfSSS > 0.0 ) {
		float sNL = dot( geometryNormal, directLight.direction );
		float sWrap = saturate( ( sNL + gSurfSSS ) / ( 1.0 + gSurfSSS ) );
		reflectedLight.directDiffuse += max( sWrap - dotNL, 0.0 ) * directLight.color * vec3( 1.0, 0.7, 0.56 ) * BRDF_Lambert( material.diffuseContribution );
	}
	if ( gSurfSheen > 0.0 ) { // 絨毛/布的光澤:掠射角(輪廓)的纖維反光,背光也有一點(絨毛透光)
		float sNV = saturate( dot( geometryNormal, geometryViewDir ) );
		float sNL2 = saturate( dot( geometryNormal, directLight.direction ) * 0.6 + 0.4 );
		reflectedLight.directDiffuse += directLight.color * sNL2 * pow( 1.0 - sNV, 3.0 ) * gSurfSheen * sqrt( max( material.diffuseContribution, vec3( 0.0 ) ) ) * 0.35;
	}`;
// 室內:鏡面反射改取室內環境(漫射的環境光仍是場景的,與牆面一致)
const ENV_FROM = 'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );';
const ENV_TO = 'vec4 envMapColor = mix( textureCubeUV( envMap, envMapRotation * reflectVec, roughness ), textureCubeUV( tSurfEnv, envMapRotation * reflectVec, roughness ) * uSurfG.w, gSurfIn );';

function hook(shader) {
  shader.uniforms.tSurfA = U.tSurfA;
  shader.uniforms.tSurfB = U.tSurfB;
  shader.uniforms.tSurfC = U.tSurfC;
  shader.uniforms.tSurfEnv = U.tSurfEnv;
  shader.uniforms.uSurfP = U.uSurfP;
  shader.uniforms.uSurfG = U.uSurfG;
  shader.uniforms.uSurfD = U.uSurfD;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VS_PARS)
    .replace('#include <fog_vertex>', '#include <fog_vertex>\n' + VS_MAIN);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FS_PARS)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + FS_COLOR)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FS_RM)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FS_NORMAL)
    .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + FS_AO)
    .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(SSS_FROM, SSS_TO))
    .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(ENV_FROM, ENV_TO));
}
const done = new WeakSet();
const cacheKey = () => 'surf1';
// 把表面細節掛到一個(共用的)MeshStandardMaterial 上
export function applySurface(m) {
  if (!m || done.has(m) || !m.isMeshStandardMaterial) return m;
  ensureDetail();
  m.onBeforeCompile = hook;
  m.customProgramCacheKey = cacheKey;
  m.needsUpdate = true;
  done.add(m);
  return m;
}
export const hasSurface = (m) => done.has(m);

// ---------- 細節貼圖(Worker 畫;畫好上傳後才打開細節) ----------
let detailOK = 0, wantOn = true;
function ensureDetail() {
  if (U.tSurfA.value) return;
  const opt = { srgb: false, anisotropy: 8, setup: (t) => { t.onUpdate = () => { detailOK++; refresh(); }; } };
  U.tSurfA.value = paintTexture('mats/detail:surfA', { size: 1024 }, opt);
  U.tSurfB.value = paintTexture('mats/detail:surfB', { size: 1024 }, opt);
  U.tSurfC.value = paintTexture('mats/detail:surfC', { size: 512 }, opt);
}
function refresh() { U.uSurfG.value.x = detailOK >= 3 && wantOn && U.tSurfEnv.value ? 1 : 0; }
// 畫質:低畫質關掉細節(uniform,不換 program)
export function setSurfaceQuality(on) { wantOn = !!on; refresh(); }

// ---------- 室內環境貼圖(PMREM,和場景環境貼圖同尺寸 → 同一組 cubeUV 定義) ----------
// 昏暗的天花板(礦纖板格線 + 幾排日光燈管)、灰綠牆、一側窗戶的月光、深色地板
export function makeIndoorEnv(renderer) {
  const scene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`varying vec3 vD;
      void main(){
        vec3 d = normalize( vD ); vec3 c;
        if ( d.y > 0.22 ) {
          vec2 p = d.xz / d.y * 2.4;
          c = vec3( 0.09, 0.093, 0.088 );
          vec2 g = abs( fract( p / 0.6 ) - 0.5 );
          c *= 0.82 + 0.18 * step( 0.47, max( g.x, g.y ) );
          float row = abs( fract( p.y / 2.4 + 0.5 ) - 0.5 ) * 2.4, seg = fract( p.x / 2.4 + 0.5 );
          float tube = ( 1.0 - smoothstep( 0.05, 0.085, row ) ) * smoothstep( 0.12, 0.16, seg ) * smoothstep( 0.88, 0.84, seg );
          c += vec3( 0.86, 0.96, 0.9 ) * ( tube * 0.65 + exp( -row * 7.0 ) * 0.05 ) * exp( -length( p ) * 0.12 );
        } else if ( d.y > -0.12 ) {
          float t = ( d.y + 0.12 ) / 0.34;
          c = mix( vec3( 0.06, 0.066, 0.06 ), vec3( 0.14, 0.15, 0.138 ), t );
          float az = atan( d.z, d.x );
          c *= 0.85 + 0.15 * step( 0.5, fract( az * 1.6 ) );
          float win = smoothstep( 0.32, 0.2, abs( az - 0.9 ) ) * smoothstep( -0.02, 0.04, d.y ) * smoothstep( 0.2, 0.13, d.y );
          c += vec3( 0.05, 0.075, 0.12 ) * win;
        } else c = vec3( 0.034, 0.032, 0.029 );
        gl_FragColor = vec4( c, 1.0 );
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  m.dispose();
  return rt.texture;
}

// ---------- 區域亮度(簡易的區域探針):鏡面反射的室內環境亮度跟著玩家附近的燈 ----------
// 環境貼圖是固定的一張「有開燈的病房」;燈全壞的房間裡金屬只剩很暗的反射,手術燈下的不鏽鋼就亮。
// 每幀用光源池(玩家附近真正亮著的點光源)估計眼睛位置的照度,平滑地調整 uSurfG.w(uniform,不換 program)
let envK = 1;
export function updateSurfaces(game, dt = 1 / 60) {
  const pool = game.hospital?.lights?.pool, cam = game.camera;
  if (!pool || !cam) return;
  const p = cam.position;
  let E = 0;
  for (const pl of pool) {
    const L = pl.light || pl;
    if (!L || !(L.intensity > 0)) continue;
    const d2 = L.position.distanceToSquared(p), r = L.distance || 8;
    if (d2 > r * r * 1.5) continue;
    E += L.intensity / Math.max(1.5, d2);
  }
  const want = Math.min(1.7, Math.max(0.5, 0.5 + 0.35 * E));
  envK += (want - envK) * Math.min(1, dt * 2.5);
  U.uSurfG.value.w = envK;
}

// ---------- 場景合併之後:合併出來的頂點色材質、實例化小物件 ----------
// 由互動系統建構完(src/interact/index.js buildInteract,在預編譯之前)呼叫
const instMats = new Map();
export function upgradeWorldSurfaces(game) {
  const t0 = performance.now();
  ensureDetail();
  if (!U.tSurfEnv.value && game.renderer) { try { U.tSurfEnv.value = makeIndoorEnv(game.renderer); } catch (e) { console.warn('[mats] 室內環境貼圖失敗', e); } }
  refresh();
  const H = game.hospital || {};
  const roots = H.propGroups || (H.group ? [H.group] : []);
  const st = { plain: 0, inst: 0 };
  const seen = new Set();
  for (const r of roots) r.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.name && m.name.startsWith('plain:')) { if (!seen.has(m)) { seen.add(m); if (!done.has(m)) { applySurface(m); st.plain++; } } return; }
    // 實例化小物件(模板 UV 有編碼)用的是材質庫的純色材質:換成加上細節的複本(材質庫本身不動,才不影響下次合併)
    if (o.isInstancedMesh && /^pi_inst_/.test(o.name) && !m.map && !m.transparent && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && !done.has(m)) {
      const U2 = o.geometry.attributes.uv;
      if (!U2 || U2.array[0] < ENC_MIN) return;
      let c = instMats.get(m);
      if (!c) { c = applySurface(m.clone()); c.name = m.name + '+surf'; instMats.set(m, c); }
      o.material = c;
      st.inst++;
    }
  });
  const q = game.quality;
  if (q && !game._surfQ) {
    game._surfQ = true;
    const set = () => setSurfaceQuality(q.preset !== 'low');
    set();
    q.on?.('change', set);
  }
  if (typeof location !== 'undefined' && /[?&]matlab/.test(location.search)) window.__mats = { THREE, applySurface, encodeSurface, U, CLASS, game }; // 開發:材質檢查頁用
  console.log('[mats] surfaces', JSON.stringify({ ...st, ms: +(performance.now() - t0).toFixed(1) }));
  return st;
}
