import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerProvider, registerSurvivorProvider, autoHitboxes, BONES, getVariantAt } from './model.js';
import { ZU } from './materials.js';
import { assets } from '../sys/assets.js';
import { uploads } from '../sys/uploads.js';
import { idle } from '../sys/sched.js';
import { caps } from '../sys/caps.js';

// 寫實殭屍:Microsoft Rocketbox 的真人角色(MIT,署名見 public/credits/zombie-models.md),
// 由 tools/zombies/build.mjs 離線轉成遊戲骨架(22 根 BONES、靜止姿勢、權重重新對應)並把貼圖殭屍化,
// 這裡只把 GLB 的幾何轉成與程式生成殭屍相同的頂點格式、組出變體,經 model.js 的提供者接縫「附加」在程式變體之後:
// 動畫、行為、命中盒、斷肢、噴血、布娃娃、連線同步的變體編號全部沿用。
//   - 註冊在載入本模組時就完成(各端變體數一致);GLB 在資源佇列(低優先)下載完才可用,之前那些編號用程式變體代替
//   - 低畫質不下載(維持程式生成)
//   - 材質:兩種 program(皮膚/衣物 'zrb' 與頭髮 alphaTest),所有角色共用;暖機時用 realisticMaterials() 先編好
// 倖存者(多人的玩家角色)也用同一套:public/models/survivors/<id>.glb(健康外觀,右手握槍的手指),進入多人房間才下載。
//     顏色圖 A = 濕潤度(血、傷口、眼睛 → 降低粗糙度)、法線圖 A = 皮膚遮罩(次表面散射),兩者都反著存在 255..128;頂點色 A = 眼球(手電筒的眼底反光)

// 類型 → 角色 id(public/models/zombies/<id>.glb)。順序就是變體編號(接在程式變體之後),只能往後加
export const BODIES = {
  walker: ['nurse', 'doctor', 'guard', 'worker', 'man', 'oldman', 'woman'],
  runner: ['athlete', 'jogger', 'paramedic'],
};
// 手電筒照到眼睛的反光、眼睛自發光(狂奔者的眼睛發紅光,和程式生成的一致)
const EYES = { walker: { shine: 0x7a8a60, glow: 0x000000 }, runner: { shine: 0xff5020, glow: 0x5a0802 } };
const BASE = `${import.meta.env?.BASE_URL ?? '/'}models/`;
// 倖存者:順序 = model.js 的 SURVIVOR_LOOKS(座位)
export const SURVIVORS = ['soldier', 'medic', 'builder', 'hoodie', 'police', 'hunter', 'firefighter', 'biker'];
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const LOADED = {}; // id → 已載入的外觀資料
const FROM = {};
const stat = { loaded: 0, failed: 0, ms: 0 };

for (const [type, ids] of Object.entries(BODIES)) {
  FROM[type] = registerProvider(type, (t, seed, opt) => make(t, ids[opt.k - FROM[t]]), 0, { append: ids.length, ready: (k) => !!LOADED[ids[k - FROM[type]]] });
}

const SV = []; // 座位 → 倖存者變體(載好後建一次)
registerSurvivorProvider((i) => {
  if (SV[i]) return SV[i];
  const S = LOADED['s:' + SURVIVORS[i]];
  if (!S) return null;
  return (SV[i] = { ...make('survivor', 's:' + SURVIVORS[i]), eyeKey: 'brown', k: i });
});

function make(type, id) {
  const S = LOADED[id];
  if (!S) return null;
  return {
    type, geometry: S.geometry, slots: S.slots, rig: S.rig, P: { ...S.P }, eyeKey: null, external: id,
    legT: S.legT, legS: S.legS, hitboxes: autoHitboxes(S.rig, S.P, type), mouth: S.mouth.clone(), ownMaterials: S.materials[type] || S.materials.survivor, materials: S.materials[type] || S.materials.survivor,
  };
}

// ---------- 材質 ----------
const SHINE = { value: new THREE.Color() };
function rbShader(sh, m) {
  sh.uniforms.uFlash = ZU.uFlash;
  sh.uniforms.uShine = m.userData.uShine || SHINE;
  sh.uniforms.uGlow = m.userData.uGlow || SHINE;
  sh.fragmentShader = 'uniform float uFlash;\nuniform vec3 uShine;\nuniform vec3 uGlow;\nfloat zrbWet = 0.0;\nfloat zrbSkin = 0.0;\n' + sh.fragmentShader
    .replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      `vec3 irradiance = dotNL * directLight.color;
	float zWrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 );
	vec3 zSss = mix( vec3( 0.30, 0.25, 0.22 ), vec3( 0.80, 0.16, 0.10 ), zrbWet * zrbWet );
	reflectedLight.directDiffuse += max( zWrapNL - dotNL, 0.0 ) * directLight.color * zSss * BRDF_Lambert( material.diffuseColor ) * zrbSkin;`,
    ))
    .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef ZRB_WET
	zrbWet = saturate( ( 1.0 - sampledDiffuseColor.a ) * 2.008 ); // A 反著存:255 = 乾、128 = 全濕
	diffuseColor.a = opacity;
#endif`)
    .replace('#include <color_fragment>', `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor.rgb *= vColor.rgb;
#endif`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 0.16, zrbWet );`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef ZRB_WET
	zrbSkin = saturate( ( 1.0 - texture2D( normalMap, vNormalMapUv ).a ) * 2.008 );
#endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_COLOR_ALPHA
{
	vec3 zv = normalize( vViewPosition );
	float zCone = smoothstep( 0.8, 0.93, zv.z );
	float zFace = pow( saturate( dot( normal, zv ) ), 8.0 );
	float zDist = 1.0 / ( 1.0 + dot( vViewPosition, vViewPosition ) * 0.006 );
	totalEmissiveRadiance += ( uShine * zFace * zCone * zDist * uFlash + uGlow ) * vColor.a;
}
#endif`);
}
// kind:'skin'(身體、頭、裝備:不透明,帶濕潤度/皮膚遮罩)| 'hair'(頭髮、睫毛:alphaTest、雙面)
function rbMaterial(kind, map, normalMap, eyes) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap, roughness: kind === 'hair' ? 0.62 : 0.8, metalness: 0 });
  m.normalScale.set(1, -1); // glTF 的 UV 方向 + 導數切線(同 GLTFLoader)
  if (kind === 'hair') { m.alphaTest = 0.5; m.side = THREE.DoubleSide; } else m.defines = { ZRB_WET: '' };
  m.userData.uShine = { value: new THREE.Color(eyes ? eyes.shine : 0) };
  m.userData.uGlow = { value: new THREE.Color(eyes ? eyes.glow : 0) };
  m.onBeforeCompile = (sh) => rbShader(sh, m);
  m.customProgramCacheKey = () => 'zrb1';
  return m;
}
// 暖機用:與實際材質同 program 的代表材質(貼圖先用 1x1 佔位;program 只看「有沒有貼圖」,不看內容)
let TPL = null;
export function realisticMaterials() {
  if (!TPL) {
    const px = (r, g, b, a, srgb) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
    TPL = [rbMaterial('skin', px(255, 255, 255, 255, true), px(128, 128, 255, 255), EYES.walker), rbMaterial('hair', px(255, 255, 255, 255, true), px(128, 128, 255, 255), null)];
  }
  return TPL;
}

// ---------- GLB → 變體資料 ----------
// 轉成與程式生成殭屍相同的頂點格式(Float32 位置/法線/UV/RGBA 色、Uint16 骨骼索引、Float32 權重):
// 同一種頂點格式 → ANGLE 不必另外產生 shader 變體,暖機畫過的組合就涵蓋
function toFloat(g, mat) {
  const n = g.attributes.position.count, out = new THREE.BufferGeometry();
  const get = (name, size, Arr) => {
    const a = g.attributes[name], arr = new Arr(n * size);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a.getComponent(i, c);
    return arr;
  };
  const pos = get('position', 3, Float32Array), nor = get('normal', 3, Float32Array), w = get('skinWeight', 4, Float32Array);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mat);
  for (let i = 0; i < n; i++) {
    v.fromArray(pos, i * 3).applyMatrix4(mat).toArray(pos, i * 3); // KHR_mesh_quantization 的反量化在節點變換裡
    v.fromArray(nor, i * 3).applyMatrix3(nm).normalize().toArray(nor, i * 3);
    const s = w[i * 4] + w[i * 4 + 1] + w[i * 4 + 2] + w[i * 4 + 3] || 1;
    for (let c = 0; c < 4; c++) w[i * 4 + c] /= s;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(get('uv', 2, Float32Array), 2));
  out.setAttribute('color', new THREE.BufferAttribute(get('color', 4, Float32Array), 4));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(get('skinIndex', 4, Uint16Array), 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
  out.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array), 1));
  return out;
}
const ORDER = ['body', 'head', 'extra'];
function extract(gltf, id, types) {
  const hz = gltf.scene.userData.hz;
  if (!hz || hz.v !== 1 || hz.bones.length !== BONES.length || hz.bones.some((b, i) => b[0] !== BONES[i])) throw new Error('骨架資料不符');
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
  parts.sort((a, b) => ORDER.indexOf(a.material.name) - ORDER.indexOf(b.material.name));
  const geometry = mergeGeometries(parts.map((o) => toFloat(o.geometry, o.matrixWorld)), true);
  geometry.computeBoundingSphere();
  for (const o of parts) o.geometry.dispose();
  const kinds = parts.map((o) => (o.material.alphaTest > 0 ? 'hair' : 'skin'));
  const tex = [];
  for (const o of parts) { const m = o.material; if (m.map) { m.map.anisotropy = 4; tex.push(m.map); } if (m.normalMap) tex.push(m.normalMap); }
  // 每種類型一組材質(眼睛反光/發光顏色不同;program 共用)
  const materials = {};
  for (const t of types) materials[t] = parts.map((o, i) => rbMaterial(kinds[i], o.material.map, o.material.normalMap, EYES[t] || EYES.walker));
  for (const o of parts) o.material.dispose();
  const bones = hz.bones.map(([name, parent, hx, hy, hzz, tx, ty, tz], i) => ({ name, i, parent, head: new THREE.Vector3(hx, hy, hzz), tail: new THREE.Vector3(tx, ty, tz) }));
  const index = Object.fromEntries(BONES.map((n, i) => [n, i]));
  const P = { legless: 0, ...hz.P };
  // sw/hw 與 makeRig 相同:縮放前的半寬(使用端會乘 P.s)
  const rig = { bones, index, HC: V3(hz.HC), sw: Math.abs(bones[index.upperArmL].head.x) / P.s, hw: Math.abs(bones[index.thighL].head.x) / P.s };
  return {
    geometry, materials, rig, P, tex, slots: kinds, mouth: V3(hz.mouth),
    legT: bones[index.thighL].head.distanceTo(bones[index.thighL].tail), legS: bones[index.shinL].head.distanceTo(bones[index.shinL].tail),
  };
}

// ---------- 載入 ----------
let started = false, sStarted = false, G = null, loader = null;
const off = () => G?.quality?.preset === 'low' || caps.flags.has('noreal'); // 低畫質(或除錯旗標 ?noreal):只用程式生成(省下載與顯示記憶體)
function load(key, url, types, prio) {
  const t0 = performance.now();
  loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // 回傳的不是場景物件 → 資源佇列不會拿 GLB 自帶的材質去預編譯(用的是 realisticMaterials 那兩個 program)
  return assets.task(() => loader.loadAsync(url).then((g) => extract(g, key, types)), { meta: { zombieModel: key }, prio })
    .then(async (S) => {
      // 貼圖逐張上傳 GPU(src/sys/uploads.js:每幀最多一張、超過 1K 先在背景縮小;第一次畫到時才上傳會頓)
      for (const t of S.tex) await uploads.add(t);
      LOADED[key] = S;
      // 馬上建好變體(只是組裝,很快):回合進行中載好的也立刻能被挑到,不必等回合間的 prewarm
      for (const t of types) if (BODIES[t]) getVariantAt(t, FROM[t] + BODIES[t].indexOf(key));
      stat.loaded++;
      stat.ms = Math.round(performance.now() - t0);
    })
    .catch((e) => { stat.failed++; console.warn('[realistic] 模型載入失敗,維持程式生成', key, e?.message || e); });
}
export function loadRealistic(game) {
  if (started) return;
  started = true;
  G = game;
  if (off()) return;
  const typesOf = {};
  for (const [t, ids] of Object.entries(BODIES)) for (const id of ids) (typesOf[id] ||= []).push(t);
  for (const id of Object.keys(typesOf)) load(id, BASE + 'zombies/' + id + '.glb', typesOf[id], 8); // [perf] 殭屍模型決定 hz:warm(開局出怪的時間點),排在大部分貼圖前面
}
// 進入多人房間時才下載倖存者模型(單人不需要);優先序高於殭屍(隊友一開局就看得到)
export function loadSurvivors() {
  if (sStarted || off()) return;
  sStarted = true;
  for (const id of SURVIVORS) load('s:' + id, BASE + 'survivors/' + id + '.glb', ['survivor'], 20);
}
export const realisticStats = () => ({ ...stat, total: Object.values(BODIES).reduce((a, b) => a + b.length, 0) + (sStarted ? SURVIVORS.length : 0) });
