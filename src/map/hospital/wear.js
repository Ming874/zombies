import * as THREE from 'three';
import { prng } from './paint.js';

// 結構表面的「歲月」層:一張可平鋪的 RGBA 雜訊貼圖 + 著色器片段,依世界座標(不會跟著貼圖重複)疊上
// 牆腳污漬帶、天花板漏水的水漬圈(潮痕)、往下流的污痕、霉斑、地板髒污與積水、天花板水損。
// 每個頂點有 aWear(0 乾淨 ~ 1 破舊;每面牆/每區不同),每種材質有 uWear(髒污、水漬、霉、潮濕)強度。
// 雜訊通道:R = 大塊 fbm(水漬)、G = 中頻高對比 fbm(剝落/霉)、B = 縱向條紋(流痕)、A = 細胞斑點(霉點/滴痕頭)
let tex = null;
export function wearTexture() {
  if (tex) return tex;
  const N = 256, data = new Uint8Array(N * N * 4), R = prng(0x5eed);
  const lattice = (n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = R(); return a; };
  const vn = (L, Px, Py, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % Px) + Px) % Px, x1 = (x0 + 1) % Px, y0 = ((yi % Py) + Py) % Py, y1 = (y0 + 1) % Py;
    const a = L[y0 * Px + x0], b = L[y0 * Px + x1], c = L[y1 * Px + x0], d = L[y1 * Px + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  // 可平鋪 fbm:第 k 個八度的週期 = base × 2^k(格數必須整除才能無縫)
  const fbm = (px, py, oct, gain = 0.5) => {
    const lats = [];
    for (let k = 0; k < oct; k++) lats.push({ L: lattice((px << k) * (py << k)), Px: px << k, Py: py << k });
    return (u, v) => { let s = 0, a = 1, n = 0; for (const o of lats) { s += a * vn(o.L, o.Px, o.Py, u * o.Px, v * o.Py); n += a; a *= gain; } return s / n; };
  };
  const fR = fbm(4, 4, 5, 0.55), fG = fbm(8, 8, 4, 0.6), fB = fbm(32, 3, 3, 0.45);
  // 細胞斑點(F1 距離,12×12 格)
  const C = 12, pts = new Float32Array(C * C * 2);
  for (let i = 0; i < C * C; i++) { pts[i * 2] = R(); pts[i * 2 + 1] = R(); }
  const cell = (u, v) => {
    const x = u * C, y = v * C, xi = Math.floor(x), yi = Math.floor(y);
    let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, k = (((cy % C) + C) % C) * C + (((cx % C) + C) % C);
      const dx = cx + pts[k * 2] - x, dy = cy + pts[k * 2 + 1] - y;
      d = Math.min(d, dx * dx + dy * dy);
    }
    return Math.sqrt(d);
  };
  const ch = [new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N), new Float32Array(N * N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, i = y * N + x;
    ch[0][i] = fR(u, v);
    ch[1][i] = fG(u, v);
    ch[2][i] = fB(u, v);
    ch[3][i] = 1 - Math.min(1, cell(u, v) * 1.6);
  }
  // 每個通道拉伸到 0..1(G 再加對比)
  for (let c = 0; c < 4; c++) {
    let lo = 1e9, hi = -1e9;
    for (const v of ch[c]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < N * N; i++) {
      let v = (ch[c][i] - lo) / (hi - lo || 1);
      if (c === 1) v = v * v * (3 - 2 * v);
      data[i * 4 + c] = Math.round(v * 255);
    }
  }
  tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---- 頂點著色器 ----
export const WEAR_VERT_PARS = /* glsl */`
attribute float aWear;
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vWear;
`;
export const WEAR_VERT = /* glsl */`
	vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vWNrm = normalize( mat3( modelMatrix ) * objectNormal );
	vWear = aWear;
`;

// ---- 片段著色器 ----
// uWear = (髒污, 水漬/流痕, 霉, 積水);uWear2 = (剝落量, 剝落雜訊尺度, 鞋印擦痕, 近距離細節強度)
// uSurfG(src/mats/surface.js 共用):x = 細節開關(細節圖畫好、非低畫質)
export const WEAR_FRAG_PARS = /* glsl */`
uniform sampler2D tWear;
uniform vec4 uWear;
uniform vec4 uWear2;
uniform vec4 uSurfG;
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vWear;
`;
// 先算出遮罩(map 之前):wxKind 0 牆 / 1 地 / 2 天花;wxPeel 剝落;wxWet 積水
export const WEAR_SETUP = /* glsl */`
	vec3 wxN = normalize( vWNrm );
	vec3 wxA = abs( wxN );
	float wxIsFloor = step( 0.6, wxN.y ), wxIsCeil = step( 0.6, - wxN.y );
	vec2 wxUv = wxA.y > 0.6 ? vWPos.xz : ( wxA.x > wxA.z ? vec2( vWPos.z, vWPos.y ) : vec2( vWPos.x, vWPos.y ) );
	float wxH = mod( vWPos.y + 4.2005, 4.2 );
	vec4 wxNA = texture2D( tWear, wxUv * vec2( 0.09, 0.12 ) );
	vec4 wxNB = texture2D( tWear, wxUv * 0.33 + vec2( 0.31, 0.57 ) );
	float wxW = clamp( vWear, 0.0, 1.0 );
	float wxPeel = 0.0, wxWet = 0.0, wxRough = 0.0;
	float wxPx = length( fwidth( vWPos ) ); // 一個像素幾公尺(細線反鋸齒;導數在分支外)
	// 牆面細裂縫:中頻雜訊的等高線(對比拉高的通道 → 線細、粗細不一),另一組雜訊決定哪裡有。
	// 只有油漆/灰泥牆(有剝落層:uWear2.x > 0)要算;uniform 分支,裡面的 fwidth 仍然有效
	// 近距離細節(r2):牆面貼圖 ~400 像素/公尺,0.5~2m 內手電筒照下去是一片平的;疊兩層世界座標的高頻雜訊
	// (灰泥顆粒 / 小麻點,約 1.5cm 與 5mm)→ 反照率 ±4% + 凹凸;像素大於 3.5mm 時淡出(遠處本來就看不到)。
	// 用已綁定的 tWear(不多佔 sampler);低畫質關閉(uSurfG.x)
	float wxDh = 0.5, wxDk = 0.0;
	if ( uSurfG.x > 0.5 && uWear2.w > 0.0 ) {
		wxDh = texture2D( tWear, wxUv * 7.3 + vec2( 0.21, 0.37 ) ).g * 0.62 + texture2D( tWear, wxUv * 23.1 + vec2( 0.67, 0.11 ) ).a * 0.38;
		wxDk = ( 1.0 - smoothstep( 0.0008, 0.0035, wxPx ) ) * uWear2.w;
	}
	float wxCv = 0.5, wxCw = 1.0;
	if ( uWear2.x > 0.0 ) {
		wxCv = texture2D( tWear, wxUv * 0.23 + vec2( 0.77, 0.19 ) ).g + ( texture2D( tWear, wxUv * 1.1 + vec2( 0.4, 0.66 ) ).r - 0.5 ) * 0.06;
		wxCw = fwidth( wxCv );
	}
	{
		// 剝落:中頻雜訊 × 每面牆的破舊度;牆腳(反潮)與牆頂(漏水)更容易剝
		float pn = texture2D( tWear, wxUv * uWear2.y + vec2( 0.13, 0.71 ) ).g * 0.75 + wxNA.r * 0.25;
		float edge = ( 1.0 - smoothstep( 0.0, 0.9, wxH ) ) * 0.22 + smoothstep( 2.4, 3.4, wxH ) * 0.12;
		float th = 1.02 - uWear2.x * ( 0.25 + 0.6 * wxW * wxW ) - edge * wxW;
		wxPeel = ( 1.0 - wxIsFloor - wxIsCeil ) * smoothstep( th, th + 0.035, pn );
	}
`;
// 近距離細節的凹凸(normal_fragment_maps 之後;three 的 bumpmap 方法,導數在 uniform 分支內)
export const WEAR_NORMAL = /* glsl */`
	if ( uSurfG.x > 0.5 && uWear2.w > 0.0 ) {
		vec3 dP = - vViewPosition, dSx = dFdx( dP ), dSy = dFdy( dP );
		vec3 dR1 = cross( dSy, normal ), dR2 = cross( normal, dSx );
		float dDet = dot( dSx, dR1 ) * faceDirection;
		vec2 dH = vec2( dFdx( wxDh ), dFdy( wxDh ) ) * 0.0003 * wxDk * ( 1.0 - wxWet * 0.85 );
		vec3 dG = sign( dDet ) * ( dH.x * dR1 + dH.y * dR2 );
		float dGl = length( dG ), dDl = abs( dDet );
		dG *= min( 1.0, 0.3 * dDl / max( dGl, 1e-20 ) );
		if ( dDl > 1e-20 ) normal = normalize( dDl * normal - dG );
	}
`;
// 顏色(color_fragment 之後)
export const WEAR_ALBEDO = /* glsl */`
	{
		vec3 wc = vec3( 1.0 );
		if ( wxIsFloor + wxIsCeil < 0.5 ) {
			// 大面積的不均勻(老化、清潔不均)+ 越破舊越灰暗
			wc *= mix( 1.0, 0.8 + 0.34 * wxNA.g, uWear.x * 0.55 );
			wc *= 1.0 - 0.16 * wxW * uWear.x;
			// 牆腳污漬帶(高度不規則)
			float band = 1.0 - smoothstep( 0.02, 0.14 + 0.32 * wxNB.g * ( 0.4 + wxW ), wxH );
			wc *= mix( vec3( 1.0 ), vec3( 0.5, 0.46, 0.4 ), band * uWear.x * ( 0.45 + 0.55 * wxW ) );
			// 天花板漏水的水漬(內部泛黃、邊緣一圈深色潮痕)
			float st = wxNA.r * 0.82 + wxNB.r * 0.18 + smoothstep( 1.8, 3.4, wxH ) * 0.2 - ( 1.0 - wxW ) * 0.22;
			float th = 0.8 - 0.16 * uWear.y;
			float ins = smoothstep( th, th + 0.06, st );
			float rim = smoothstep( th - 0.014, th, st ) * ( 1.0 - smoothstep( th + 0.004, th + 0.03, st ) );
			wc *= mix( vec3( 1.0 ), vec3( 0.84, 0.76, 0.6 ), ins * uWear.y * 0.75 );
			wc *= mix( vec3( 1.0 ), vec3( 0.55, 0.45, 0.32 ), rim * uWear.y * 0.9 );
			// 由上往下的流痕
			float sk = texture2D( tWear, vec2( wxUv.x * 0.5, wxUv.y * 0.07 ) + vec2( 0.7, 0.2 ) ).b;
			sk = smoothstep( 0.58, 0.9, sk ) * smoothstep( 0.6, 3.3, wxH ) * uWear.y * ( 0.25 + wxW );
			wc *= 1.0 - 0.32 * sk;
			// 霉(牆腳與零星斑點)
			float md = wxNB.g * 0.6 + wxNA.a * 0.25 + ( 1.0 - smoothstep( 0.0, 1.1, wxH ) ) * 0.3 + smoothstep( 2.9, 3.4, wxH ) * 0.12;
			md = smoothstep( 0.66, 0.86, md ) * uWear.z * ( 0.3 + wxW );
			wc *= mix( vec3( 1.0 ), vec3( 0.3, 0.34, 0.24 ), clamp( md, 0.0, 1.0 ) );
			wxRough += md * 0.2 + band * 0.08;
			// 漆面粉化不均(只在油漆/灰泥牆:有剝落層的材質;軟包、磁磚、亮光漆不變)
			wxRough += max( wxNB.r - 0.45, 0.0 ) * 0.25 * uWear.x * step( 0.001, uWear2.x );
			if ( uWear.x > 0.7 ) {
				// 病床/推車撞出來的橫向擦痕(0.6~1.1m 高,黑灰色、短、斷斷續續)
				float sb = smoothstep( 0.55, 0.7, wxH ) * ( 1.0 - smoothstep( 0.95, 1.15, wxH ) );
				float ss = texture2D( tWear, vec2( wxH * 1.7, wxUv.x * 0.6 ) + vec2( 0.21, 0.43 ) ).b;
				float scw = smoothstep( 0.8, 0.93, ss ) * sb * ( 0.4 + wxW ) * smoothstep( 0.35, 0.65, wxNB.a + wxNA.g * 0.4 );
				wc *= 1.0 - 0.32 * scw;
				wxRough += 0.12 * scw;
				// 拆掉的告示板/掛鐘/海報留下的「鬼影」:被蓋住的地方沒被燻黃、沒積灰 → 比四周乾淨的長方形;
				// 框:邊上一圈灰線 + 四角釘孔;海報:四角膠帶殘膠(泛黃的小長方形)
				float cw = 1.9, gi = floor( wxUv.x / cw ), lvl = floor( ( vWPos.y + 0.3 ) / 4.2 );
				float gh = ntHash( vec2( gi * 1.37 + lvl * 17.1, lvl + 3.3 ) );
				if ( gh > 0.84 ) {
					float g2 = fract( gh * 71.3 ), g3 = fract( gh * 13.7 ), g4 = fract( gh * 5.91 ), poster = step( 0.55, fract( gh * 29.3 ) );
					vec2 sz = vec2( 0.26 + 0.6 * g2, 0.3 + 0.55 * g3 );
					vec2 q = vec2( wxUv.x - ( gi + 0.3 + 0.4 * g4 ) * cw, wxH - ( 1.25 + 0.45 * fract( gh * 3.7 ) ) );
					vec2 e = abs( q ) - sz * 0.5;
					float sd = max( e.x, e.y ), aw = max( wxPx, 0.0012 );
					float ins = 1.0 - smoothstep( - aw, aw, sd );
					wc = mix( wc, sqrt( wc ) * vec3( 0.985, 1.0, 1.015 ), ins * ( 0.9 - 0.35 * poster ) );
					wxRough -= 0.05 * ins;
					float lw = max( 0.0035, aw * 1.5 ), le = sd / lw;
					wc *= 1.0 - 0.28 * exp( - le * le ) * ( 0.0035 / lw ) * ( 1.0 - poster );
					vec2 hq = abs( q ) - ( sz * 0.5 - 0.028 );
					float hole = ( 1.0 - smoothstep( 0.0025, 0.0025 + aw, length( hq ) ) ) * min( 1.0, 0.003 / aw );
					wc *= 1.0 - 0.8 * hole * ( 1.0 - poster );
					vec2 tq = abs( abs( q ) - ( sz * 0.5 - vec2( 0.025, 0.012 ) ) ) - vec2( 0.03, 0.014 );
					float tape = ( 1.0 - smoothstep( - aw, aw, max( tq.x, tq.y ) ) ) * poster;
					wc *= mix( vec3( 1.0 ), vec3( 0.93, 0.84, 0.62 ), tape * 0.75 );
					wxRough -= 0.15 * tape;
				}
				// 細裂縫(油漆/灰泥牆)
				if ( uWear2.x > 0.0 ) {
					// 線寬 0.0025(雜訊單位);遠處像素比線寬大時加寬反鋸齒、但按覆蓋率變淡(平均顏色不變,遠處牆面不會整片變暗)
					float cwid = wxCw * 1.1 + 0.0025;
					float ck = ( 1.0 - smoothstep( 0.0, cwid, abs( wxCv - 0.5 ) ) ) * ( 0.0025 / cwid ) * smoothstep( 0.6, 0.78, wxNA.r * 0.55 + wxNB.g * 0.45 + wxW * 0.18 );
					wc *= 1.0 - 0.42 * ck;
					wxRough += 0.1 * ck;
				}
			}
		} else if ( wxIsFloor > 0.5 ) {
			// 地板:大片髒污(走道磨亮、角落積灰由頂點色處理)
			float d = smoothstep( 0.42, 0.86, wxNA.r * 0.65 + wxNB.g * 0.35 );
			wc *= mix( vec3( 1.0 ), vec3( 0.6, 0.56, 0.48 ), d * uWear.x * ( 0.35 + 0.65 * wxW ) );
			wxRough += d * uWear.x * 0.22; // 積灰的地方霧面(沒人走的地方);走道被踩亮的地方才反光
			// 塑膠/磁磚地板:鞋跟與推床輪子的黑色擦痕(短、斜向),走道磨亮的地方粗糙度較低
			if ( uWear2.z > 0.0 ) {
				vec2 sp = vec2( vWPos.x * 0.83 + vWPos.z * 0.56, vWPos.z * 0.83 - vWPos.x * 0.56 );
				float sc = texture2D( tWear, vec2( sp.x * 0.11, sp.y * 1.6 ) + vec2( 0.4, 0.1 ) ).b;
				float sc2 = texture2D( tWear, vec2( sp.y * 0.13, sp.x * 1.4 ) + vec2( 0.8, 0.6 ) ).b;
				float scuff = max( smoothstep( 0.8, 0.9, sc ), smoothstep( 0.82, 0.92, sc2 ) * 0.8 ) * smoothstep( 0.35, 0.7, wxNB.a + wxNA.g * 0.5 );
				wc *= 1.0 - scuff * 0.42 * uWear2.z;
				float polish = smoothstep( 0.55, 0.25, wxNA.r ) * ( 1.0 - d );
				wxRough -= polish * 0.16 * uWear2.z;
			}
			// 積水:暗、亮面、法線變平
			float wet = wxNA.g * 0.7 + wxNB.r * 0.3;
			float wt = 0.86 - 0.3 * uWear.w;
			wxWet = smoothstep( wt, wt + 0.03, wet ) * step( 0.01, uWear.w );
			wc *= 1.0 - 0.28 * wxWet;
			wc *= mix( vec3( 1.0 ), vec3( 0.7, 0.62, 0.5 ), smoothstep( wt - 0.05, wt, wet ) * ( 1.0 - wxWet ) * step( 0.01, uWear.w ) * 0.6 );
		} else {
			// 天花板水損:泛黃水漬 + 深色潮痕
			float st = wxNA.r * 0.8 + wxNB.r * 0.2 - ( 1.0 - wxW ) * 0.28;
			float th = 0.76 - 0.14 * uWear.y;
			float ins = smoothstep( th, th + 0.05, st );
			float rim = smoothstep( th - 0.012, th, st ) * ( 1.0 - smoothstep( th + 0.003, th + 0.025, st ) );
			wc *= mix( vec3( 1.0 ), vec3( 0.78, 0.68, 0.5 ), ins * uWear.y );
			wc *= mix( vec3( 1.0 ), vec3( 0.48, 0.38, 0.26 ), rim * uWear.y );
			float md = smoothstep( 0.72, 0.9, wxNB.g * 0.7 + wxNA.a * 0.3 ) * uWear.z * wxW;
			wc *= mix( vec3( 1.0 ), vec3( 0.3, 0.32, 0.25 ), md );
			// 礦纖板水漬:漏水的地方才有,而且是一片一片連著(低頻世界雜訊在每片中心取樣 → 同一區相鄰幾片一起受潮),
			// 不是每片隨機一個圓。形狀 = 扭曲過的距離場等高線(不規則的阿米巴形),潮線 = 同一個場的幾條等高線
			// (外圈最深、內圈較淡,水乾了好幾次);被 T-bar 切斷(每片是分開的板子);最嚴重的片有霉點。
			// 導數在分支外先算好(textureGrad),分支內不用隱式導數。
			if ( uTileVar > 0.5 ) {
				vec2 tg = vWPos.xz * 1.5, tid = floor( tg ), tp = tg - tid;
				vec2 tgx = dFdx( tg ), tgy = dFdy( tg );
				float tpx = max( length( tgx ), length( tgy ) );
				vec2 tcw = ( tid + 0.5 ) / 1.5;
				float leak = textureLod( tWear, tcw * vec2( 0.09, 0.12 ), 0.0 ).r * 0.7 + textureLod( tWear, tcw * 0.21 + vec2( 0.17, 0.83 ), 0.0 ).g * 0.3;
				float th = ntHash( tid + 3.7 );
				float sev = leak + ( th - 0.5 ) * 0.2 + ( wxW - 0.5 ) * 0.16 + uWear.y * 0.12;
				if ( sev > 0.64 && tpx < 0.6 ) {
					float k = smoothstep( 0.64, 0.86, sev );
					// 水從哪裡進來:偏向片的一角(水沿著 T-bar 流進來)
					vec2 tc = 0.5 + ( vec2( ntHash( tid + 9.1 ), ntHash( tid + 5.3 ) ) - 0.5 ) * 0.7;
					vec2 wq = tp - tc + ( vec2( textureGrad( tWear, tg * 0.23 + 0.1, tgx * 0.23, tgy * 0.23 ).g, textureGrad( tWear, tg * 0.23 + 0.6, tgx * 0.23, tgy * 0.23 ).g ) - 0.5 ) * 0.42;
					float n1 = textureGrad( tWear, tg * 0.41 + vec2( 0.3, 0.7 ), tgx * 0.41, tgy * 0.41 ).r;
					float n2 = textureGrad( tWear, tg * 1.37 + vec2( 0.52, 0.11 ), tgx * 1.37, tgy * 1.37 ).g;
					float f = ( 0.16 + 0.5 * k ) - length( wq * vec2( 1.0, 0.75 + 0.5 * fract( th * 7.0 ) ) ) + ( n1 - 0.5 ) * 0.24 + ( n2 - 0.5 ) * 0.08;
					float aw = max( 0.006, tpx * 0.9 ); // 潮線寬度(遠處加寬,不會閃爍)
					float tins = smoothstep( - aw, aw, f );
					float e0 = f / ( aw * 1.6 ), e1 = ( f - 0.075 - 0.04 * n2 ) / ( aw * 1.3 ), e2 = ( f - 0.19 - 0.05 * n1 ) / ( aw * 1.2 );
					float rk = 0.006 / aw; // 遠處潮線加寬時按覆蓋率變淡
					float r0 = exp( - e0 * e0 ) * rk;
					float r1 = exp( - e1 * e1 ) * step( 0.1, 0.16 + 0.5 * k ) * rk;
					float r2 = exp( - e2 * e2 ) * step( 0.25, 0.16 + 0.5 * k ) * rk;
					float mot = 0.8 + 0.4 * n2;
					wc *= mix( vec3( 1.0 ), vec3( 0.9, 0.8, 0.6 ), tins * ( 0.3 + 0.45 * k ) * mot );
					wc *= mix( vec3( 1.0 ), vec3( 0.66, 0.53, 0.36 ), clamp( r0 * 0.8 + r1 * 0.45 + r2 * 0.3, 0.0, 1.0 ) * ( 0.55 + 0.45 * k ) );
					// 最嚴重的:中間一圈礦物沉積變深 + 黑霉點
					float core = smoothstep( 0.22, 0.42, f ) * smoothstep( 0.6, 1.0, k );
					wc *= mix( vec3( 1.0 ), vec3( 0.62, 0.52, 0.4 ), core * 0.6 );
					float spot = smoothstep( 0.72, 0.9, textureGrad( tWear, tg * 2.3 + 0.37, tgx * 2.3, tgy * 2.3 ).a ) * tins * smoothstep( 0.5, 0.9, k );
					wc *= mix( vec3( 1.0 ), vec3( 0.26, 0.27, 0.22 ), spot * 0.8 );
				}
			}
		}
		diffuseColor.rgb *= wc * ( 1.0 + ( wxDh - 0.5 ) * 0.09 * wxDk );
	}
`;
