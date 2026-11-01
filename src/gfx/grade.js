import * as THREE from 'three';

// ===== 最後一道:色調映射 + 分區 3D LUT 調色 + 底片顆粒(取代 OutputPass)=====
// ACES 與 three 的 ACESFilmicToneMapping 同一條曲線(曝光同樣讀 renderer.toneMappingExposure);uTM = 1 改用 AgX(uniform,不重編)。
// 色調映射、sRGB 之後在顯示空間查三張 32³ LUT 並依區域權重混合:
//   cold   醫院室內(日光燈慘綠、陰影偏青)
//   warm   207 / 安全屋 / 禮拜堂 / 辦公室(鎢絲燈琥珀)
//   sodium 戶外(鈉燈橘的亮部、月光青藍的陰影)
// 顆粒在顯示空間加(中間調最多、純黑與高光少),每幀換一次。驚嚇時的色差在 PostShader(scare uniform)。

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// slope/offset/power(ASC CDL)+ 飽和度 + 陰影/亮部分離色調 + 對比(繞 0.42 的 S 曲線)
function gradeFn(p) {
  return (r, g, b) => {
    let c = [r, g, b];
    c = c.map((v, i) => Math.pow(Math.max(0, v * p.slope[i] + p.offset[i]), p.power[i]));
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    c = c.map((v) => l + (v - l) * p.sat);
    const sh = 1 - smooth(0.0, 0.42, l), hi = smooth(0.45, 1.0, l);
    c = c.map((v, i) => v + p.shadow[i] * sh + p.high[i] * hi);
    if (p.contrast !== 1) c = c.map((v) => { const x = Math.min(1, Math.max(0, v)); const k = p.contrast; const s = x < 0.42 ? 0.42 * Math.pow(x / 0.42, k) : 1 - 0.58 * Math.pow((1 - x) / 0.58, k); return s; });
    return c.map((v) => Math.min(1, Math.max(0, v)));
  };
}
export const GRADES = {
  cold: { slope: [0.98, 1.0, 1.02], offset: [-0.004, 0.0, 0.006], power: [1.03, 1.0, 0.99], sat: 0.94, shadow: [-0.008, 0.006, 0.014], high: [-0.012, 0.006, 0.004], contrast: 1.04 },
  warm: { slope: [1.04, 1.0, 0.94], offset: [0.003, 0.002, -0.002], power: [0.98, 1.0, 1.03], sat: 0.98, shadow: [0.008, 0.004, -0.002], high: [0.014, 0.004, -0.016], contrast: 1.03 },
  sodium: { slope: [1.04, 0.99, 0.92], offset: [-0.006, 0.0, 0.012], power: [1.0, 1.0, 0.98], sat: 0.95, shadow: [-0.01, 0.004, 0.02], high: [0.03, 0.008, -0.03], contrast: 1.07 },
};
export function makeLut(fn, n = 32) {
  const d = new Uint8Array(n * n * n * 4);
  let i = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const o = fn(r / (n - 1), g / (n - 1), b / (n - 1));
    d[i++] = Math.round(o[0] * 255); d[i++] = Math.round(o[1] * 255); d[i++] = Math.round(o[2] * 255); d[i++] = 255;
  }
  const t = new THREE.Data3DTexture(d, n, n, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uTM: { value: 0 },
    tLut0: { value: null }, tLut1: { value: null }, tLut2: { value: null }, uLutW: { value: new THREE.Vector3(1, 0, 0) }, uLut: { value: 0 },
    uGrain: { value: 0 }, uTime: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTM;
    uniform sampler3D tLut0; uniform sampler3D tLut1; uniform sampler3D tLut2; uniform vec3 uLutW; uniform float uLut;
    uniform float uGrain; uniform float uTime;
    varying vec2 vUv;
    ${THREE.ShaderChunk.tonemapping_pars_fragment}
    float gh( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    vec3 oetf( vec3 c ) { return mix( c * 12.92, 1.055 * pow( max( c, 0.0 ), vec3( 0.41666 ) ) - 0.055, step( 0.0031308, c ) ); }
    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;
      c = uTM > 0.5 ? AgXToneMapping( c ) : ACESFilmicToneMapping( c );
      c = oetf( saturate( c ) );
      if ( uLut > 0.001 ) {
        vec3 uvw = c * ( 31.0 / 32.0 ) + 0.5 / 32.0;
        vec3 l = texture( tLut0, uvw ).rgb * uLutW.x + texture( tLut1, uvw ).rgb * uLutW.y + texture( tLut2, uvw ).rgb * uLutW.z;
        c = mix( c, l, uLut );
      }
      if ( uGrain > 0.0 ) {
        vec2 p = floor( gl_FragCoord.xy / 1.5 ) + fract( uTime * 7.31 ) * vec2( 113.0, 71.0 );
        float n = ( gh( p ) + gh( p + 17.3 ) - 1.0 );
        float lum = dot( c, vec3( 0.299, 0.587, 0.114 ) );
        c += n * uGrain * ( 0.35 + 2.6 * lum * ( 1.0 - lum ) ) * smoothstep( 0.0, 0.05, lum );
      }
      c += ( gh( gl_FragCoord.xy + fract( uTime ) * 61.0 ) - 0.5 ) / 255.0; // 抖色:暗部漸層不出現色階
      gl_FragColor = vec4( c, 1.0 );
    }`,
};

const COLD = new Set(['corridor', 'ward', 'clinical', 'lobby', 'emergency', 'basement', 'flooded', 'morgue', 'nursery', 'psych', 'stair']);
const WARM = { chapel: 1, safe: 1, lamp207: 1, office: 0.6 };
const SODIUM = { outdoor: 1, outdoor_fog: 1, roof: 1, industrial: 0.8 };

// 每幀:依目前區域把 LUT 權重慢慢移過去;驚嚇脈衝(PostShader 的 scare)衰減
export function installGrade(game, pass) {
  const u = pass.uniforms;
  u.tLut0.value = makeLut(gradeFn(GRADES.cold));
  u.tLut1.value = makeLut(gradeFn(GRADES.warm));
  u.tLut2.value = makeLut(gradeFn(GRADES.sodium));
  const w = new THREE.Vector3(1, 0, 0), tgt = new THREE.Vector3();
  const st = { scare: 0, enabled: true, lut: 0.9, grain: 0.022 };
  const TIER = { small: 0.18, medium: 0.6, big: 1.0 };
  let off = null;
  const hook = () => {
    if (off || !game.horror?.on) return;
    off = game.horror.on('scare', (e) => { const k = (TIER[e?.tier] ?? 0.4) + (e?.kind === 'ambush' || e?.kind === 'ceilingDrop' ? 0.3 : 0); st.scare = Math.min(1.2, Math.max(st.scare, k)); });
  };
  return {
    st,
    pulse(k = 1) { st.scare = Math.min(1.2, Math.max(st.scare, k)); },
    update(dt) {
      hook();
      const H = game.hospital, m = H?.mood;
      if (m === undefined) tgt.set(1, 0, 0);
      else {
        const wa = WARM[m] || 0, so = SODIUM[m] || 0, co = COLD.has(m) ? 1 : Math.max(0, 1 - wa - so);
        tgt.set(co, wa, so);
      }
      const s = tgt.x + tgt.y + tgt.z || 1;
      tgt.multiplyScalar(1 / s);
      w.lerp(tgt, 1 - Math.exp(-dt * 1.4));
      u.uLutW.value.copy(w);
      // 回憶(past)與結局天亮(dawn)有自己設計好的調色:那時候分區 LUT 淡出,不疊上去
      const P0 = game.post?.uniforms, own = P0 ? Math.max(P0.past?.value || 0, (P0.dawn?.value || 0) * 0.8) : 0;
      u.uLut.value = st.enabled ? st.lut * (1 - Math.min(1, own)) : 0;
      u.uGrain.value = st.enabled ? st.grain : 0;
      u.uTime.value = (game.time || 0) % 100;
      u.toneMappingExposure.value = game.renderer.toneMappingExposure;
      st.scare *= Math.exp(-dt * 2.2);
      const P = game.post?.uniforms;
      if (P?.scare) P.scare.value = st.scare < 0.002 ? 0 : st.scare;
    },
  };
}
