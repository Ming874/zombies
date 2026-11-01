import * as THREE from 'three';

// ===== 免費的 G-buffer:場景 HDR 緩衝的 alpha 通道帶粗糙度/金屬旗標 =====
// 不加 draw call、不加 MRT:所有不透明的 MeshStandard/Physical 材質把 alpha 寫成
//   a = 2 + 粗糙度 × 0.9 + (金屬 ? 1 : 0)        → 2.0~2.9 非金屬、3.0~3.9 金屬
// 其他不透明材質(Basic/Lambert/天空/ShaderMaterial)照舊寫 1;背景清成 1。SSR 只處理 2 ≤ a < 3.95 的像素。
// 透明物件(血跡、霧片、光暈、雨)在場景 pass 期間用 alpha MAX 混合(見 alphaGuard):不會把底下的編碼洗掉;
// 想要 TAA「反應式」處理的特效(雨絲:細、快、半透明)直接輸出 a = 8 → TAA 那些像素主要用當前幀。
// 這段改的是 ShaderChunk(模組載入時、任何 shader 編譯之前)→ 所有 program 一開機就是新版本,執行期不會重編。
// 粗糙度用的是濕地/磨損修改過的最終值(wet.js、surfaces.js 都在 opaque_fragment 之前改 roughnessFactor)。
const C = THREE.ShaderChunk;
if (!C.opaque_fragment.includes('HZ_GBUF')) {
  C.opaque_fragment = C.opaque_fragment.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
#if defined( OPAQUE ) && defined( STANDARD ) && ! defined( PREMULTIPLIED_ALPHA ) // HZ_GBUF
	diffuseColor.a = 2.0 + clamp( roughnessFactor, 0.0, 1.0 ) * 0.9 + step( 0.5, metalnessFactor );
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
}

// 場景 pass 期間:混合時 alpha 一律取 MAX(透明物件不會改寫底下的編碼;寫 a = 8 的特效會留下標記)。
// 只在場景 pass 打開;three 有快取混合狀態,所以這裡記住它要求的 alpha 方程式,開關時重新下一次。
export function alphaGuard(gl) {
  if (gl.__hzGuard) return gl.__hzGuard;
  const be = gl.blendEquation.bind(gl), bes = gl.blendEquationSeparate.bind(gl);
  let rgb = gl.FUNC_ADD, a = gl.FUNC_ADD, on = false;
  gl.blendEquation = (m) => { rgb = a = m; if (on) bes(m, gl.MAX); else be(m); };
  gl.blendEquationSeparate = (m1, m2) => { rgb = m1; a = m2; bes(m1, on ? gl.MAX : m2); };
  const g = {
    set(v) { v = !!v; if (on === v) return; on = v; bes(rgb, on ? gl.MAX : a); },
  };
  gl.__hzGuard = g;
  return g;
}
