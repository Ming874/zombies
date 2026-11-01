import * as THREE from 'three';
import { paintTextures } from '../sys/texworker.js';
import { registerMat } from '../map/materials.js';
import { CELLS, cellUV, ATLAS } from './stainset.js';
import { surfaceUniforms as SU } from '../mats/surface.js';

// ===== 血跡貼花的共用材質 pi_stain =====
// 圖集在貼圖 Worker 畫好(src/art/stains.paint.js):map(albedo + alpha,2048×1024)與 nr(半解析度:R/B = 切線空間法線 xy、
// G = 粗糙度)。一個 MeshStandardMaterial(透明、不寫深度、polygonOffset)給所有血跡用:室內靜態貼花(合併成每層一個網格)、
// 屍體下的血泊、天花板滴下的血漬。nr 的法線在 shader 裡由 RB 重建 z;roughnessMap 原生讀 G。
// 記憶體:map 8MB + nr 2MB(含 mipmap 約 13.4MB)。
let TEX = null, MAT = null;
export function stainTextures() {
  if (!TEX) TEX = paintTextures('art/stains:atlas', { seed: 1 }, { map: { wrap: false, anisotropy: 8 }, nr: { srgb: false, wrap: false, anisotropy: 8 } });
  return TEX;
}
const NR_DECODE = 'vec4 nrT = texture2D( normalMap, vNormalMapUv );\n\tvec3 mapN = vec3( nrT.r * 2.0 - 1.0, nrT.b * 2.0 - 1.0, 0.0 );\n\tmapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );';
export function stainMaterial() {
  if (MAT) return MAT;
  const T = stainTextures();
  MAT = new THREE.MeshStandardMaterial({
    name: 'pi_stain', map: T.map, normalMap: T.nr, roughnessMap: T.nr, roughness: 1, metalness: 0, envMapIntensity: 0.6,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const chunk = THREE.ShaderChunk.normal_fragment_maps.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', NR_DECODE);
  if (chunk === THREE.ShaderChunk.normal_fragment_maps) console.warn('[stains] normal_fragment_maps 改版了,法線解碼沒套上');
  // r2:血膜很薄,會跟著底下牆面/地面的微凹凸(灰泥顆粒、橘皮、麻點)→ 用物品細節貼圖(src/mats/surface.js 的 tSurfA.r,
  // 一格 0.5m)在世界座標取樣:凹凸法線、凹處血積得比較深、薄的地方只沾到凸點(邊緣跟著表面紋理斷開)。
  // 沒有這層時整片血跡是平的,像貼紙。細節貼圖還沒畫好或低畫質(uSurfG.x = 0)時維持原樣。
  MAT.onBeforeCompile = (sh) => {
    sh.uniforms.tSurfA = SU.tSurfA;
    sh.uniforms.uSurfG = SU.uSurfG;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStW;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
	{
		vec4 stw = vec4( transformed, 1.0 );
		#ifdef USE_BATCHING
			stw = batchingMatrix * stw;
		#endif
		#ifdef USE_INSTANCING
			stw = instanceMatrix * stw;
		#endif
		vStW = ( modelMatrix * stw ).xyz;
	}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStW;\nuniform sampler2D tSurfA;\nuniform vec4 uSurfG;')
      .replace('#include <map_fragment>', `#include <map_fragment>
	vec3 stNw = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz ), stA = abs( stNw );
	vec2 stUv = ( stA.y > 0.6 ? vStW.xz : ( stA.x > stA.z ? vStW.zy : vStW.xy ) ) * 2.0;
	float stH = texture2D( tSurfA, stUv ).r;
	float stK = step( 0.5, uSurfG.x );
	{
		float a0 = diffuseColor.a;
		// 薄處只沾到凸點;厚的血泊不受影響
		diffuseColor.a = mix( a0, a0 * smoothstep( 0.18, 0.62, stH + a0 * 0.55 ), stK * ( 1.0 - a0 ) * 0.9 );
		diffuseColor.rgb *= mix( 1.0, 0.8 + 0.36 * stH, stK );
	}`)
      .replace('#include <normal_fragment_maps>', chunk + `
	if ( stK > 0.5 ) {
		vec3 sp = - vViewPosition, sx = dFdx( sp ), sy = dFdy( sp );
		vec3 r1 = cross( sy, normal ), r2 = cross( normal, sx );
		float det = dot( sx, r1 ) * faceDirection;
		vec2 dh = vec2( dFdx( stH ), dFdy( stH ) ) * 0.0005;
		vec3 g = sign( det ) * ( dh.x * r1 + dh.y * r2 );
		float gl = length( g ), dl = abs( det );
		g *= min( 1.0, 0.4 * dl / max( gl, 1e-20 ) );
		if ( dl > 1e-20 ) normal = normalize( dl * normal - g );
	}`);
  };
  MAT.customProgramCacheKey = () => 'stain-nr2';
  registerMat('pi_stain', MAT);
  return MAT;
}
// 室內貼花種類 → 圖集格(v = 變體;格數不夠時 v 用左右鏡像當另一個變體;牆面版有重力方向,地面版沒有)
const PICK = {
  hand: { wall: ['hand0', 'hand1'], floor: ['hand1'] },
  scratch: { wall: ['claw0', 'claw1'], floor: ['scratchF'] },
  drip: { wall: ['drip0'], floor: ['dripF'] },
  splat: { wall: ['splat0'], floor: ['splatF'] },
  smear: { wall: ['smearW'], floor: ['smearF'] },
  drag: { wall: ['smearW'], floor: ['drag0'] },
  pool: { wall: ['splat0'], floor: ['pool0', 'pool1'] },
  feet: { wall: ['hand1'], floor: ['feet0', 'feet1'] },
};
export const isStainKind = (kind) => !!PICK[kind];
// UV 矩形(props/indoor 的 rect 慣例)+ mat 鍵 + k(尺寸倍數)
export function stainRect(kind, v = 0, floor = false) {
  const L = PICK[kind];
  if (!L) return null;
  stainMaterial();
  const list = floor ? L.floor : L.wall, name = list[v % list.length], flip = ((v / list.length) | 0) % 2 === 1;
  const r = { ...cellUV(name), mat: 'pi_stain', k: CELLS[name].k, cell: name };
  if (flip) [r.u0, r.u1] = [r.u1, r.u0];
  return r;
}
// 把 0..1 的 UV 對到某一格
export function stainUV(g, name, flip = false) {
  const r = cellUV(name), uv = g.attributes.uv.array;
  const u0 = flip ? r.u1 : r.u0, u1 = flip ? r.u0 : r.u1;
  for (let i = 0; i < uv.length; i += 2) { uv[i] = u0 + uv[i] * (u1 - u0); uv[i + 1] = r.v0 + uv[i + 1] * (r.v1 - r.v0); }
  g.attributes.uv.needsUpdate = true;
  return g;
}
// 一格的平面(XY,朝 +Z;寬 = size,高依格的比例)
export function stainPlane(name, size = 1, flip = false) {
  const c = CELLS[name];
  return stainUV(new THREE.PlaneGeometry(size, (size * c.h) / c.w), name, flip);
}
// 預編譯用的代表(與靜態合併網格、血泊同一個 program)
export function stainWarmMesh() {
  const m = new THREE.Mesh(stainPlane('pool0', 0.01), stainMaterial());
  m.frustumCulled = false;
  m.name = 'stain-warm';
  return m;
}
export { ATLAS };
