import * as THREE from 'three';

// 戶外道具與天氣共用的執行期狀態:src/map/weather.js 每幀寫入,道具動畫(風吹、烏鴉、霓虹)讀取。
// 只放純量與共用 uniform 物件(不配置新物件),道具模組在建構時就能引用。
export const ENV = {
  t: 0, dt: 0, // 秒
  px: 0, py: 0, pz: 0, // 玩家腳底
  wind: 0.6, gust: 0, // 風力(0..1.5)
  rain: 0, wet: 0, // 降雨強度、地面濕度(0..1)
  flash: 0, // 閃電亮度(0..1)
  out: 1, // 玩家在戶外的程度(0..1)
  q: 2, // 畫質等級 0 低 / 1 中 / 2 高 / 3 極致
};

// 風吹動畫共用 uniform(草、樹、晾衣繩、旗子):所有材質共用同一組物件,每幀只更新一次
export const WIND = { uWindT: { value: 0 }, uWind: { value: 0.6 }, uGust: { value: 0 } };

// 執行期才套用的燈具調整(由 weather.js 在場景建好後依座標比對 hospital.lights.fixtures):
// { x, y, z, mode:'tube'|'buzz'|…, state:0 常亮 / 1 閃爍, mat:要跟著亮度變化的自發光材質, ei:基準亮度 }
export const LIGHT_MODS = [];
export function lightMod(spec) { LIGHT_MODS.push(spec); return spec; }

// 自己控制亮度的發光材質(霓虹招牌、警示燈…):fn(t) → 0..1;weather.js 每幀更新 emissiveIntensity = ei × fn(t)
export const GLOWS = [];
export function glowMat(m, ei, fn, perm = false) { GLOWS.push({ m, ei, fn, perm }); return m; }
// 新地圖開始擺設前清空(換地圖 / 重建時不留舊的燈具調整與發光材質;perm = 共用材質,保留)
export function resetEnv() { LIGHT_MODS.length = 0; for (let i = GLOWS.length - 1; i >= 0; i--) if (!GLOWS[i].perm) GLOWS.splice(i, 1); ENV.flash = 0; }

// 風吹頂點動畫:mode 'grass'(uv.y 越高擺越大)| 'tree'(本地高度越高擺越大,只用在實例池)| 'cloth'(uv.x 越遠離掛點擺越大)
// amp:最大位移(公尺);h:參考高度(tree 模式)。模式與參數都是 uniform → 所有風吹材質共用同一份 shader 程式碼(少編譯幾個 program)
const WIND_MODE = { grass: 0, tree: 1, cloth: 2 };
export function windify(m, { mode = 'grass', amp = 0.12, h = 4 } = {}) {
  const prev = m.onBeforeCompile;
  const hasPrev = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  m.userData.wind = { uWAmp: { value: amp }, uWH: { value: h }, uWMode: { value: WIND_MODE[mode] ?? 0 } };
  m.onBeforeCompile = function (s, r) {
    Object.assign(s.uniforms, WIND, this.userData.wind);
    s.vertexShader = s.vertexShader
      .replace('void main() {', 'uniform float uWindT;\nuniform float uWind;\nuniform float uGust;\nuniform float uWAmp;\nuniform float uWH;\nuniform float uWMode;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{
		vec4 wO = vec4( 0.0, 0.0, 0.0, 1.0 );
		#ifdef USE_INSTANCING
		wO = instanceMatrix * wO;
		#endif
		wO = modelMatrix * wO;
		vec4 wV = modelMatrix * vec4( position, 1.0 );
		bool isTree = uWMode > 0.5 && uWMode < 1.5;
		vec2 wp = isTree ? wO.xz : wV.xz;
		float ph = wp.x * 0.21 + wp.y * 0.17;
		float sway = sin( uWindT * 1.31 + ph ) * 0.6 + sin( uWindT * 2.73 + ph * 1.7 ) * 0.25 + sin( uWindT * 6.1 + ph * 3.1 ) * 0.15;
		float k = isTree ? pow( max( 0.0, position.y - 0.4 ) / uWH, 1.6 ) : uWMode > 1.5 ? uv.x : uv.y * uv.y;
		float a = uWAmp * k * ( uWind * 0.7 + uGust );
		transformed.x += ( sway * 0.8 + 0.5 * uGust ) * a;
		transformed.z += sin( uWindT * 1.07 + ph * 1.3 ) * 0.45 * a;
		if ( uWMode > 1.5 ) transformed.y += sin( uWindT * 3.3 + uv.x * 7.0 + ph ) * a * 0.35;
	}`);
    if (hasPrev) prev.call(this, s, r);
  };
  const key = hasPrev ? (m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? m.customProgramCacheKey() : prev.toString()) : '';
  m.customProgramCacheKey = () => 'wind|' + key;
  return m;
}

// 共用暫存(避免每幀配置)
export const TMP = { v: new THREE.Vector3(), c: new THREE.Color() };
