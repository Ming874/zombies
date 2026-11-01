import * as THREE from 'three';
import { paintTexture, paintTextures } from '../sys/texworker.js';

// 殭屍共用材質。顏色細節(屍斑、瘀青、血、汙垢、凹處陰影)都畫在頂點色上,
// 貼圖只負責可平鋪的微細節:毛孔、皺紋、血管、布料織紋、髮絲。
// 貼圖產生器在 materials.paint.js,由貼圖 Worker 用 OffscreenCanvas 畫(不支援時主執行緒畫同一份),
// 這裡立刻拿到 THREE.Texture,畫好後自動更新。
//
// 皮膚 shader(所有殭屍共用一個 program 'zskin'):
//  - 頂點色 alpha = 濕潤度 0..1(血、傷口、嘴):粗糙度降低 → 濕亮反光;> 1 = 餘燼自發光(焦屍的裂縫,值 1..2)
//  - 次表面散射近似:直接光用 wrap lighting(明暗交界處往暗面滲進一點帶色的光;濕的血肉偏紅、死皮偏灰綠)
// 眼睛 shader('zeye'):手電筒(在相機上)照到時的反光(眼底反射):N·V 越正越亮,只在手電筒光錐內、距離衰減。
// ZU 是全域 uniform(動畫層每幀更新一次):uFlash 手電筒開關、uTime 時間(餘燼閃爍)。

const NS = 'zombies/materials:';
const SRGB = {}, LINEAR = { srgb: false };
export const ZU = { uFlash: { value: 1 }, uTime: { value: 0 } };

// 次表面:替換 RE_Direct_Physical 的入射光(只在 zskin 程式裡)
const SSS = `float zWet = clamp( vColor.a, 0.0, 1.0 );
	float zWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.55 ) / 1.55 );
	vec3 zSss = mix( vec3( 0.30, 0.25, 0.22 ), vec3( 0.80, 0.16, 0.10 ), zWet * zWet );
	reflectedLight.directDiffuse += max( zWrapNL - dotNL, 0.0 ) * directLight.color * zSss * BRDF_Lambert( material.diffuseColor );`;

function skinShader(sh) {
  Object.assign(sh.uniforms, ZU);
  sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader
    .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      `vec3 irradiance = dotNL * directLight.color;\n#ifdef USE_COLOR_ALPHA\n\t${SSS}\n#endif`,
    ))
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
#ifdef USE_COLOR_ALPHA
float zW = vColor.a > 1.0 ? 0.3 : vColor.a;
roughnessFactor = mix( roughnessFactor, 0.2, smoothstep( 0.15, 1.0, zW ) );
#endif`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#ifdef USE_COLOR_ALPHA
float zEmb = max( vColor.a - 1.0, 0.0 );
if ( zEmb > 0.0 ) {
	float zFl = 0.72 + 0.18 * sin( uTime * 7.3 + vViewPosition.x * 3.1 ) + 0.1 * sin( uTime * 17.0 + vViewPosition.y * 5.0 );
	totalEmissiveRadiance += vec3( 2.6, 0.75, 0.16 ) * zEmb * zEmb * zFl;
}
#endif`,
    );
}

// 眼睛:手電筒反光(眼底反射)
function eyeShader(sh) {
  Object.assign(sh.uniforms, { uFlash: ZU.uFlash, uShine: sh.uniforms.uShine || { value: new THREE.Color(0, 0, 0) } });
  sh.fragmentShader = 'uniform float uFlash;\nuniform vec3 uShine;\n' + sh.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
{
	vec3 zv = normalize( vViewPosition );
	float zCone = smoothstep( 0.8, 0.93, zv.z );
	float zFace = pow( saturate( dot( normal, zv ) ), 10.0 );
	float zDist = 1.0 / ( 1.0 + dot( vViewPosition, vViewPosition ) * 0.006 );
	totalEmissiveRadiance += uShine * zFace * zCone * zDist * uFlash;
}`,
  );
}

let M = null;
export function materials() {
  if (M) return M;
  const sk = paintTextures(NS + 'skin', null, { map: SRGB, bump: LINEAR });
  const cl = paintTextures(NS + 'cloth', null, { map: SRGB, alpha: LINEAR });
  const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: sk.map, bumpMap: sk.bump, bumpScale: 2.6, roughness: 0.66 });
  skinMat.onBeforeCompile = skinShader;
  skinMat.customProgramCacheKey = () => 'zskin2';
  // 眼睛:iris 虹膜色、emissive 虹膜自發光、shine 手電筒反光色、cloud 白內障程度(0..1)
  const eye = (iris, emissive, intensity, shine, cloud = 0.5) => {
    const e = paintTextures(NS + 'eye', { iris, glow: intensity > 0.9, cloud }, { map: { wrap: false, anisotropy: 1 }, glow: { wrap: false, anisotropy: 1 } });
    const m = new THREE.MeshStandardMaterial({ map: e.map, roughness: 0.08, emissive, emissiveMap: e.glow, emissiveIntensity: intensity });
    const u = { value: new THREE.Color(shine) };
    m.onBeforeCompile = (sh) => { sh.uniforms.uShine = u; eyeShader(sh); };
    m.customProgramCacheKey = () => 'zeye';
    return m;
  };
  M = {
    skin: skinMat,
    cloth: new THREE.MeshStandardMaterial({
      vertexColors: true, map: cl.map, alphaMap: cl.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.93,
    }),
    gear: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }),
    bone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }),
    hair: new THREE.MeshStandardMaterial({ vertexColors: true, map: paintTexture(NS + 'hair', null, SRGB), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.62 }),
    glow: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xb8a878, emissive: 0x5a6a0a, emissiveIntensity: 0.6, roughness: 0.18 }),
    // 刀刃/器械:與 gear 同一個 program(只差數值)
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.95 }),
    // 防毒面具鏡片:深色、非常光滑(手電筒下有一道亮反光)
    lens: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.6 }),
    eye: {
      walker: eye('#8d9088', 0x3a3a30, 0.18, 0x6a7a50, 0.62),
      runner: eye('#a01808', 0xff3010, 1.5, 0xff5020, 0.25),
      crawler: eye('#b8b090', 0x403a28, 0.2, 0x8a8a60, 0.7),
      bloater: eye('#b8c020', 0xc8e020, 1.3, 0xc0e040, 0.4),
      brute: eye('#ff5a10', 0xff4a08, 1.7, 0xff6a20, 0.2),
      screamer: eye('#e8e4d8', 0x605a50, 0.3, 0xd8e0e8, 0.9), // 全白、幾乎看不到瞳孔
      stalker: eye('#101010', 0x000000, 0.0, 0x9adcc8, 0.0), // 全黑大瞳孔,照到時泛綠的眼底反光(像夜行動物)
      surgeon: eye('#6a6458', 0x2a2620, 0.15, 0xa09070, 0.55),
      burned: eye('#d8d0c0', 0x3a2a20, 0.15, 0xb0a090, 1.0), // 煮熟的眼球:不透明灰白
      hazmat: eye('#7a8070', 0x303028, 0.15, 0x8a9070, 0.6),
      straitjacket: eye('#5a6a40', 0x2a3018, 0.2, 0xc8d070, 0.3),
      pursuer: eye('#d01808', 0xff2008, 1.4, 0xff3010, 0.15), // 追獵者:繃帶縫隙裡兩點紅光
    },
  };
  return M;
}
// 全部殭屍材質(預編譯/預畫用:新類型、新材質不會在戰鬥中第一次出現才編譯)
export function allMaterials() {
  const m = materials();
  return [m.skin, m.cloth, m.gear, m.bone, m.hair, m.glow, m.metal, m.lens, ...Object.values(m.eye)];
}
