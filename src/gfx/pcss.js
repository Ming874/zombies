import * as THREE from 'three';

// ===== 柔和半影(PCSS 式的接觸變硬陰影;極致畫質)=====
// three r186 的 PCF 陰影圖是比較取樣(sampler2DShadow),讀不到原始深度 → 用「多個參考深度的比較」估計遮擋物距離:
//   搜尋區 8 點,各在 接收深度 / 少 Δ / 少 3Δ 三個參考值比較 → 擋住的比例 f0、遮擋物離得夠遠的比例 f1、f3
//   → 遮擋物與接收面距離越大(f1/f0、f3/f0 越大)半影越寬;再用 12 點 Vogel 盤以那個寬度過濾。
// 開關與參數走每盞燈既有的 shadowRadius uniform:radius < 0 = PCSS,整數部分 = 搜尋半徑(texel)、小數部分 = Δ(陰影圖深度單位)。
// 一般畫質 radius ≥ 0 走原本 three 的 5 點路徑(畫面不變)。ShaderChunk 在模組載入時改好 → 開機就是這版,執行期切換不重編。
const C = THREE.ShaderChunk;
const MARK = 'HZ_PCSS';
if (!C.shadowmap_pars_fragment.includes(MARK)) {
  const head = /float getShadow\( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord \) \{\s*float shadow = 1\.0;\s*shadowCoord\.xyz \/= shadowCoord\.w;\s*shadowCoord\.z \+= shadowBias;\s*bool inFrustum = [^;]+;\s*bool frustumTest = [^;]+;\s*if \( frustumTest \) \{/;
  const m = C.shadowmap_pars_fragment.match(head);
  if (m) {
    // 接收面深度斜率(螢幕空間導數 → 陰影圖 uv 空間):大範圍搜尋時,斜著被照的地板/牆不會把自己當成遮擋物
    const pre = m[0].replace('float shadow = 1.0;', `float shadow = 1.0;
			vec3 hzP = shadowCoord.xyz / shadowCoord.w, hzDx = dFdx( hzP ), hzDy = dFdy( hzP );
			float hzDet = hzDx.x * hzDy.y - hzDy.x * hzDx.y;
			vec2 hzG = abs( hzDet ) > 1e-12 ? vec2( hzDy.y * hzDx.z - hzDx.y * hzDy.z, hzDx.x * hzDy.z - hzDy.x * hzDx.z ) / hzDet : vec2( 0.0 );
			hzG = clamp( hzG, vec2( - 4.0 ), vec2( 4.0 ) );`);
    C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace(head, `${pre}
				if ( shadowRadius < 0.0 ) { // ${MARK}
					float pr = - shadowRadius, sr = floor( pr ), gap = fract( pr );
					vec2 ts = vec2( 1.0 ) / shadowMapSize;
					float ph = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
					float f0 = 0.0, f1 = 0.0, f3 = 0.0;
					for ( int i = 0; i < 8; i ++ ) {
						vec2 o = vogelDiskSample( i, 8, ph ) * sr * ts;
						vec2 uv = shadowCoord.xy + o;
						float z = shadowCoord.z + dot( hzG, o ) - 0.0003;
						f0 += 1.0 - texture( shadowMap, vec3( uv, z ) );
						f1 += 1.0 - texture( shadowMap, vec3( uv, z - gap ) );
						f3 += 1.0 - texture( shadowMap, vec3( uv, z - gap * 3.0 ) );
					}
					if ( f0 < 0.01 ) return 1.0; // 搜尋區內都沒有遮擋物:全亮(大部分像素在這裡結束)
					float spread = clamp( ( 0.4 * f1 + 0.6 * f3 ) / f0, 0.0, 1.0 );
					float w = mix( 1.0, sr * 0.85, spread * spread );
					float s = 0.0;
					for ( int i = 0; i < 12; i ++ ) { vec2 o = vogelDiskSample( i, 12, ph + 1.3 ) * w * ts; s += texture( shadowMap, vec3( shadowCoord.xy + o, shadowCoord.z + dot( hzG, o ) ) ); }
					return mix( 1.0, s / 12.0, shadowIntensity );
				}`);
  } else console.warn('[pcss] three 的 PCF getShadow 格式不同,柔和半影停用');
}

// game.pcss(on):手電筒與月光切換(只改 shadow.radius,是 uniform)
const R0 = new WeakMap();
export function installPCSS(game) {
  const conf = () => [
    [game.player?.flashlight, 22, 0.012], // 手電筒(透視深度:近處 1m ≈ 0.01)
    [game.hospital?.atmo?.moon, 7, 0.006], // 月光(正交 300m 深度:Δ ≈ 1.8m)
  ];
  let state = null;
  game.pcss = (on) => {
    on = !!on;
    state = on;
    for (const [L, sr, gap] of conf()) {
      if (!L?.shadow) continue;
      const s = L.shadow;
      if (!R0.has(s)) R0.set(s, s.radius);
      s.radius = on ? -(sr + gap) : R0.get(s);
    }
  };
  game.pcss.state = () => state;
}
