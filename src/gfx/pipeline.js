import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { alphaGuard } from './gbuf.js';
import './pcss.js'; // 柔和半影的 ShaderChunk 修改(要在任何 shader 編譯之前)
import * as S from './shaders.js';
import { WET } from '../map/weather/wet.js';

// ===== GfxPass:場景 pass + GPU 寫實效果(取代 composer 的第一個 RenderPass)=====
// 只多十來個全螢幕 draw(CPU 幾乎不變),把閒著的 GPU 拿來做:
//   場景 → 自己的 MSAA HalfFloat + DepthTexture(alpha = 粗糙度/金屬,見 gbuf.js)
//   → ½ 準備(深度 + 重建法線)→ ½ GTAO + 雙邊 → ½ SSR(地板/水窪)→ ½ 體積光(手電筒/月光陰影圖 + 燈泡光暈)
//   → 合成(深度感知放大)→ TAA(抖動投影)→ 寫進 composer 的 readBuffer;之後手持武器、清 NaN、Bloom、PostShader、調色照舊。
// 手持武器在這之後才畫 → 沒有 AO/SSR/TAA。各效果開關/樣本數都是 uniform 或 RT 尺寸,不會編新 shader
// (全部材質在 this.materials,開機時 warmup.precompilePasses 一起編好)。
//   game.gfx.configure({ ao, ssr, vol, taa, msaa, boost })   等級 0..3(quality.js 依預設檔與自動調整呼叫)
//   game.gfx.stats                                            目前生效的等級與解析度

// Halton(2,3) 8 點,像素單位 [-0.5, 0.5)
const HALTON = [];
for (let i = 1; i <= 8; i++) {
  const h = (b) => { let f = 1, r = 0, n = i; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  HALTON.push([h(2) - 0.5, h(3) - 0.5]);
}
export const LEVELS = {
  ao: [null, { slices: 1, steps: 4, radius: 0.9 }, { slices: 2, steps: 6, radius: 1.15 }, { slices: 3, steps: 8, radius: 1.3 }],
  ssr: [null, { steps: 12, dist: 5, rough: 0.32 }, { steps: 24, dist: 9, rough: 0.5 }, { steps: 40, dist: 13, rough: 0.62 }],
  vol: [null, { steps: 6, dist: 22 }, { steps: 12, dist: 30 }, { steps: 20, dist: 40 }],
};

function rt(w, h, o = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, ...o });
  return t;
}
const NEAREST = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };

// 32³ 平滑雜訊(塵埃/霧的濃淡)
function noise3D(n = 32) {
  let a = new Float32Array(n * n * n);
  let s = 1234567;
  for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; }
  const idx = (x, y, z) => ((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n);
  for (let pass = 0; pass < 3; pass++) for (const ax of [0, 1, 2]) {
    const b = new Float32Array(a.length);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0;
      for (let k = -2; k <= 2; k++) v += a[ax === 0 ? idx(x + k, y, z) : ax === 1 ? idx(x, y + k, z) : idx(x, y, z + k)] * [1, 4, 6, 4, 1][k + 2];
      b[idx(x, y, z)] = v / 16;
    }
    a = b;
  }
  let lo = 1, hi = 0;
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const u8 = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) { const v = (a[i] - lo) / (hi - lo); u8[i] = Math.round(255 * v * v * (3 - 2 * v)); }
  const t = new THREE.Data3DTexture(u8, n, n, n);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export class GfxPass extends Pass {
  constructor(game) {
    super();
    this.needsSwap = false;
    this.hzName = 'scene';
    this.game = game;
    this.guard = alphaGuard(game.renderer.getContext());
    this.cfg = { ao: 2, ssr: 2, vol: 2, taa: true, msaa: 4, boost: 0, aoStrength: 1, ssrStrength: 1.3, volStrength: 1, sharp: 0.18, flashK: 0.12, moonK: 0.3, lampK: 0.45 };
    this.live = { ao: 0, ssr: 0, vol: 0, taa: false };
    this.frame = 0;
    this.submitMs = 0; // 場景繪製的 JS 時間(自動調整用來分辨 CPU/GPU 瓶頸)
    this.w = 4; this.h = 4;
    this.depthTex = new THREE.DepthTexture(4, 4);
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: this.depthTex, stencilBuffer: false });
    this.sceneRT.texture.name = 'gfx.scene';
    this.prepRT = rt(2, 2, NEAREST);
    this.aoRT = rt(2, 2, { ...NEAREST, type: THREE.UnsignedByteType, format: THREE.RedFormat });
    this.aoBlurRT = rt(2, 2, { ...NEAREST, type: THREE.UnsignedByteType, format: THREE.RedFormat });
    this.pyrRT = rt(2, 2, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.ssrRT = rt(2, 2, NEAREST);
    this.volRT = [rt(2, 2), rt(2, 2)];
    this.compRT = rt(4, 4, NEAREST);
    this.histRT = [rt(4, 4), rt(4, 4)];
    // 輸出(多重取樣 + 深度):合成/TAA 結果寫進來,手持武器畫在上面(武器的 MSAA 邊緣)→ 複製到 composer 的緩衝。
    // 這樣 composer 的 rt1/rt2 不用多重取樣:之後清 NaN、鏡頭雨滴、Bloom、PostShader 每一道都少寫 4 倍樣本 + 解析
    this.outRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: false });
    this.outRT.resolveDepthBuffer = false;
    this.outRT.texture.name = 'gfx.out';
    this.noise = noise3D();
    this.quad = new FullScreenQuad(null);
    this.pm0 = new THREE.Matrix4(); // 沒抖動的投影
    this.vp = new THREE.Matrix4(); this.prevVP = new THREE.Matrix4();
    this.camPrev = new THREE.Vector3(); this.camPos = new THREE.Vector3(); this.reset = 2;
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3();

    const U = (this.U = { uProjInfo: { value: new THREE.Vector4(1, 1, 0, 0) }, uNF: { value: new THREE.Vector2(0.05, 120) }, uFull: { value: new THREE.Vector2(4, 4) }, uHalf: { value: new THREE.Vector2(2, 2) }, uFrame: { value: 0 } });
    const mk = (fs, uniforms, name) => {
      const m = new THREE.ShaderMaterial({ name, vertexShader: S.VERT, fragmentShader: fs, uniforms: { ...U, ...uniforms }, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
      return m;
    };
    const tex = (v = null) => ({ value: v });
    this.mPrep = mk(S.PREP, { tDepth: tex(this.depthTex) }, 'gfx.prep');
    this.mAO = mk(S.AO, { tPrep: tex(this.prepRT.texture), uRadius: { value: 0.9 }, uSlices: { value: 2 }, uSteps: { value: 6 }, uMaxPx: { value: 80 }, uTemporal: { value: 1 }, uPow: { value: 1.8 } }, 'gfx.ao');
    this.mAOBlur = mk(S.AOBLUR, { tAO: tex(this.aoRT.texture), tPrep: tex(this.prepRT.texture) }, 'gfx.aoblur');
    this.mDown = mk(S.DOWN, { tColor: tex(this.sceneRT.texture) }, 'gfx.down');
    this.mSSR = mk(S.SSR, {
      tColor: tex(this.sceneRT.texture), tPyr: tex(this.pyrRT.texture), tPrep: tex(this.prepRT.texture),
      uView: { value: new THREE.Matrix4() }, uInvView: { value: new THREE.Matrix4() },
      uSteps: { value: 24 }, uMaxDist: { value: 9 }, uMaxRough: { value: 0.5 }, uJitter: { value: 1 }, uPyrMax: { value: 5 },
      uRainT: WET.uRainT, uRain: WET.uRain, uRipple: WET.uRipple,
    }, 'gfx.ssr');
    this.mVol = mk(S.VOL, {
      tPrep: tex(this.prepRT.texture), tPrev: tex(null), tNoise: tex(this.noise),
      uInvView: this.mSSR.uniforms.uInvView, uPrevVP: { value: this.prevVP }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uSteps: { value: 12 }, uMaxDist: { value: 30 }, uSigma: { value: 0.03 }, uFogD: { value: 0.025 }, uReset: { value: 1 }, uBlend: { value: 0.2 }, uDust: { value: 0.6 },
      uFOn: { value: 0 }, uFPos: { value: new THREE.Vector3() }, uFDir: { value: new THREE.Vector3(0, 0, -1) }, uFCos: { value: new THREE.Vector2(0.8, 0.9) }, uFRange: { value: 30 },
      uFShadowM: { value: new THREE.Matrix4() }, tFShadow: tex(null), uFShadow: { value: 0 },
      uMOn: { value: 0 }, uMDir: { value: new THREE.Vector3(0, -1, 0) }, uMCol: { value: new THREE.Vector3() }, uMShadowM: { value: new THREE.Matrix4() }, tMShadow: tex(null), uMShadow: { value: 0 },
      uLPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uLCol: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uLN: { value: 0 },
    }, 'gfx.vol');
    this.mComp = mk(S.COMP, {
      tColor: tex(this.sceneRT.texture), tDepth: tex(this.depthTex), tPrep: tex(this.prepRT.texture), tAO: tex(this.aoBlurRT.texture), tSSR: tex(this.ssrRT.texture), tVol: tex(this.volRT[0].texture),
      uAO: { value: 0 }, uSSR: { value: 0 }, uVol: { value: 0 }, uFlashCol: { value: new THREE.Vector3() }, uFogD: this.mVol.uniforms.uFogD, uAOLuma: { value: 0.6 }, uDebug: { value: 0 },
    }, 'gfx.comp');
    this.mTAA = mk(S.TAA, {
      tCur: tex(this.compRT.texture), tHist: tex(this.histRT[0].texture), tDepth: tex(this.depthTex),
      uInvView: this.mSSR.uniforms.uInvView, uVP: { value: this.vp }, uPrevVP: { value: this.prevVP }, uReset: { value: 1 }, uAlpha: { value: 0.1 },
    }, 'gfx.taa');
    this.mCopy = mk(S.COPY, { tSrc: tex(null), uSharp: { value: 0.18 } }, 'gfx.copy');
    this.mBlit = mk(S.COPY, { tSrc: tex(this.outRT.texture), uSharp: { value: 0 } }, 'gfx.blit');
    this.materials = [this.mPrep, this.mAO, this.mAOBlur, this.mDown, this.mSSR, this.mVol, this.mComp, this.mTAA, this.mCopy, this.mBlit];
    this.configure({});
  }

  // 等級 0..3;boost(自動調整)加在 ao/ssr/vol 上(原本關著的效果不會被打開)
  configure(o) {
    Object.assign(this.cfg, o);
    const c = this.cfg, b = c.boost | 0, lv = (k) => (c[k] > 0 ? Math.max(1, Math.min(3, (c[k] | 0) + b)) : 0);
    const before = this.live.taa;
    this.live = { ao: lv('ao'), ssr: lv('ssr'), vol: lv('vol'), taa: !!c.taa };
    if (this.live.taa !== before) this.reset = 2;
    for (const t of [this.sceneRT, this.outRT]) if (t.samples !== (c.msaa | 0)) { t.samples = c.msaa | 0; t.dispose(); }
    const A = LEVELS.ao[this.live.ao], R = LEVELS.ssr[this.live.ssr], V = LEVELS.vol[this.live.vol];
    if (A) { const u = this.mAO.uniforms; u.uSlices.value = A.slices; u.uSteps.value = A.steps; u.uRadius.value = A.radius; }
    if (R) { const u = this.mSSR.uniforms; u.uSteps.value = R.steps; u.uMaxDist.value = R.dist; u.uMaxRough.value = R.rough; }
    if (V) { const u = this.mVol.uniforms; u.uSteps.value = V.steps; u.uMaxDist.value = V.dist; }
    this.mAO.uniforms.uTemporal.value = this.live.taa ? 1 : 0;
    this.mSSR.uniforms.uJitter.value = this.live.taa && this.live.ssr >= 2 ? 1 : 0;
  }
  get any() { const l = this.live; return l.ao > 0 || l.ssr > 0 || l.vol > 0 || l.taa; }
  get stats() { return { ...this.live, boost: this.cfg.boost, w: this.w, h: this.h, msaa: this.sceneRT.samples }; }

  setSize(w, h) {
    w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.sceneRT.setSize(w, h);
    for (const t of [this.prepRT, this.aoRT, this.aoBlurRT, this.pyrRT, this.ssrRT, ...this.volRT]) t.setSize(hw, hh);
    for (const t of [this.compRT, this.outRT, ...this.histRT]) t.setSize(w, h);
    this.U.uFull.value.set(w, h);
    this.U.uHalf.value.set(hw, hh);
    this.mSSR.uniforms.uPyrMax.value = Math.max(0, Math.floor(Math.log2(Math.max(hw, hh))) - 2);
    this.reset = 2;
  }

  dispose() {
    for (const t of [this.sceneRT, this.outRT, this.prepRT, this.aoRT, this.aoBlurRT, this.pyrRT, this.ssrRT, this.compRT, ...this.volRT, ...this.histRT]) t.dispose();
    for (const m of this.materials) m.dispose();
    this.noise.dispose();
  }

  // 每幀的光源/霧參數(全部只是 uniform 值)
  updateLights() {
    const g = this.game, u = this.mVol.uniforms, v = this._v, k = this.cfg.volStrength;
    const fog = g.scene.fog;
    const fogD = fog ? fog.density : 0.02;
    u.uFogD.value = fogD;
    u.uSigma.value = (0.01 + fogD * 0.7) * k;
    u.uTime.value = g.time || 0;
    // 手電筒
    const F = g.player?.flashlight;
    const fon = !!F && F.intensity > 0.01 && g.player.flashOn !== false;
    u.uFOn.value = fon ? 1 : 0;
    if (fon) {
      F.getWorldPosition(u.uFPos.value);
      F.target.getWorldPosition(v);
      u.uFDir.value.copy(v).sub(u.uFPos.value).normalize();
      u.uFCos.value.set(Math.cos(F.angle), Math.cos(F.angle * (1 - F.penumbra)));
      u.uFRange.value = F.distance || 30;
      const sm = F.castShadow && g.renderer.shadowMap.enabled && F.shadow.map ? F.shadow.map.depthTexture : null;
      u.tFShadow.value = sm;
      u.uFShadow.value = sm ? 1 : 0;
      if (sm) u.uFShadowM.value.copy(F.shadow.matrix);
      this.mComp.uniforms.uFlashCol.value.set(F.color.r, F.color.g, F.color.b).multiplyScalar(F.intensity * this.cfg.flashK);
    } else this.mComp.uniforms.uFlashCol.value.set(0, 0, 0);
    // 月光(靜態陰影圖)
    const M = g.hospital?.atmo?.moon;
    const mon = !!M && M.intensity > 0.01;
    u.uMOn.value = mon ? 1 : 0;
    if (mon) {
      M.getWorldPosition(v); M.target.getWorldPosition(this._v2);
      u.uMDir.value.copy(this._v2).sub(v).normalize();
      u.uMCol.value.set(M.color.r, M.color.g, M.color.b).multiplyScalar(M.intensity * this.cfg.moonK);
      const sm = M.castShadow && g.renderer.shadowMap.enabled && M.shadow.map ? M.shadow.map.depthTexture : null;
      u.tMShadow.value = sm;
      u.uMShadow.value = sm ? 1 : 0;
      if (sm) u.uMShadowM.value.copy(M.shadow.matrix);
    }
    // 燈(光源池裡亮著的 PointLight,最多 8 盞:取最亮/最近的)
    const pool = g.hospital?.lights?.pool || [];
    const cam = g.camera.position, list = this._lamps || (this._lamps = []);
    list.length = 0;
    for (const p of pool) {
      const l = p.light;
      if (!l || l.intensity < 0.02) continue;
      l.getWorldPosition(v);
      const d2 = v.distanceToSquared(cam);
      list.push([l.intensity / (d2 + 4), l, v.x, v.y, v.z]);
    }
    list.sort((a, b) => b[0] - a[0]);
    const n = Math.min(8, list.length);
    for (let i = 0; i < n; i++) {
      const [, l, x, y, z] = list[i];
      u.uLPos.value[i].set(x, y, z, l.distance || 8);
      u.uLCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity * this.cfg.lampK);
    }
    u.uLN.value = n;
  }

  render(renderer, writeBuffer, readBuffer) {
    const g = this.game, cam = g.camera, prof = g.quality?.gpu, L = this.live, U = this.U;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    if (g.weaponPass) g.weaponPass.enabled = !this.any; // 有效果時手持武器在這個 pass 裡畫(見 outRT)
    // 不需要任何效果(低畫質):直接畫進 composer 的緩衝,省掉一次複製與解析
    if (!this.any) {
      renderer.setRenderTarget(readBuffer);
      renderer.clear(true, true, false);
      const t0 = performance.now();
      renderer.render(g.scene, cam);
      this.submitMs = performance.now() - t0;
      prof?.split('post');
      renderer.autoClear = ac;
      this.reset = 2;
      return;
    }
    this.frame++;
    U.uFrame.value = this.frame % 1024;
    // 相機瞬移(出生、復活、劇情傳送):歷史作廢
    if (cam.getWorldPosition(this.camPos).distanceTo(this.camPrev) > 2.5) this.reset = 2;
    this.camPrev.copy(this.camPos);
    // TAA:投影加次像素抖動(只在這次場景繪製期間;之後還原,遊戲邏輯/射線看到的是原本的投影)
    const pm = cam.projectionMatrix;
    this.pm0.copy(pm);
    if (L.taa) {
      const j = HALTON[this.frame % 8];
      pm.elements[8] += (j[0] * 2) / this.w;
      pm.elements[9] += (j[1] * 2) / this.h;
    }
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear(true, true, false);
    this.guard.set(true);
    const t0 = performance.now();
    try { renderer.render(g.scene, cam); } finally { this.guard.set(false); }
    this.submitMs = performance.now() - t0;
    prof?.split('post');
    const e = pm.elements;
    U.uProjInfo.value.set(1 / e[0], 1 / e[5], e[8], e[9]);
    U.uNF.value.set(cam.near, cam.far);
    if (L.taa) pm.copy(this.pm0);
    this.mSSR.uniforms.uView.value.copy(cam.matrixWorldInverse);
    this.mSSR.uniforms.uInvView.value.copy(cam.matrixWorld);
    this.vp.multiplyMatrices(this.pm0, cam.matrixWorldInverse);
    const reset = this.reset > 0;
    const draw = (m, target) => { this.quad.material = m; renderer.setRenderTarget(target); this.quad.render(renderer); };

    prof?.pass('gfx:prep');
    draw(this.mPrep, this.prepRT);
    if (L.ao) { prof?.pass('gfx:ao'); draw(this.mAO, this.aoRT); draw(this.mAOBlur, this.aoBlurRT); }
    if (L.ssr) { prof?.pass('gfx:ssr'); draw(this.mDown, this.pyrRT); draw(this.mSSR, this.ssrRT); }
    if (L.vol) {
      prof?.pass('gfx:vol');
      this.updateLights();
      const i = this.frame & 1, vu = this.mVol.uniforms;
      vu.tPrev.value = this.volRT[i ^ 1].texture;
      vu.uReset.value = reset ? 1 : 0;
      vu.uCam.value.copy(this.camPos);
      vu.uBlend.value = 0.2;
      draw(this.mVol, this.volRT[i]);
      this.mComp.uniforms.tVol.value = this.volRT[i].texture;
    }
    prof?.pass('gfx:comp');
    const cu = this.mComp.uniforms;
    cu.uAO.value = L.ao ? this.cfg.aoStrength : 0;
    cu.uSSR.value = L.ssr ? this.cfg.ssrStrength : 0;
    cu.uVol.value = L.vol ? 1 : 0;
    cu.uDebug.value = this.debug | 0; // game.gfx.debug = 1 AO / 2 SSR / 3 體積光(除錯)
    const out = this.outRT;
    draw(this.mComp, L.taa ? this.compRT : out);
    if (L.taa) {
      prof?.pass('gfx:taa');
      const i = this.frame & 1, tu = this.mTAA.uniforms;
      tu.tHist.value = this.histRT[i ^ 1].texture;
      tu.uReset.value = reset ? 1 : 0;
      draw(this.mTAA, this.histRT[i]);
      this.mCopy.uniforms.tSrc.value = this.histRT[i].texture;
      this.mCopy.uniforms.uSharp.value = this.cfg.sharp;
      draw(this.mCopy, out);
    }
    // 手持武器:畫在 AO/SSR/體積光/TAA 之後(不受影響),自己的深度、多重取樣邊緣
    if (g.weaponScene && g.weaponCamera) {
      prof?.pass('weapon');
      renderer.setRenderTarget(out);
      renderer.clearDepth();
      renderer.render(g.weaponScene, g.weaponCamera);
    }
    prof?.pass('gfx:out');
    draw(this.mBlit, readBuffer);
    this.prevVP.copy(this.vp);
    if (this.reset > 0) this.reset--;
    renderer.autoClear = ac;
  }
}
