import * as THREE from 'three';

// ===== 逐像素的光源提前跳過(ShaderChunk,模組載入時、任何 shader 編譯之前)=====
// three 的 lights_fragment_begin 對每盞點光源/聚光燈都無條件跑一次 RE_Direct(GGX 鏡面 + 漫射 + 我們加的包覆光/絨毛光),
// 即使這個像素在燈的範圍(distance)外、或在聚光燈的光錐外(這時 directLight.color = 0、visible = false)。
// 光源池有 8 盞點光源(高畫質),走廊/病房裡大部分像素只在其中 1~3 盞的範圍內 → 其餘的 BRDF 白算。
// 改成 visible 才算:color = 0 時 RE_Direct 的所有項(漫射、鏡面、清漆、絨毛、包覆光、zombie 次表面)都正比於 color → 結果完全相同。
// 分支條件在空間上很連續(燈的範圍是一顆球)→ GPU 的波前很少分歧。分支裡沒有貼圖取樣/導數(D3D11 FXC 不會抱怨)。
// 陰影查詢維持在分支外(原本的位置與條件),program 數不變(只改原始碼,不加 define)。
const C = THREE.ShaderChunk;
const MARK = 'HZ_LCULL';
const CALL = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
if (!C.lights_fragment_begin.includes(MARK)) {
  const src = C.lights_fragment_begin;
  const iP = src.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  const iS = src.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )');
  const iD = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const cP = iP >= 0 ? src.indexOf(CALL, iP) : -1, cS = iS >= 0 ? src.indexOf(CALL, iS) : -1;
  if (iP >= 0 && iS > iP && iD > iS && cP > iP && cP < iS && cS > iS && cS < iD) {
    const guard = `if ( directLight.visible ) ${CALL} // ${MARK}`;
    C.lights_fragment_begin = src.slice(0, cP) + guard + src.slice(cP + CALL.length, cS) + guard + src.slice(cS + CALL.length);
  } else console.warn('[lightcull] three 的 lights_fragment_begin 格式不同,光源提前跳過停用');
}
export const LIGHT_CULL = C.lights_fragment_begin.includes(MARK);
