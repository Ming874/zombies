import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// 鏡頭上的雨滴(全螢幕 pass,插在 Bloom 之前;高/極致畫質才開):
//  在露天處抬頭時雨滴打在「鏡頭」上:兩種大小的格子各有一顆隨機位置/大小/壽命的水滴,
//  出現 → 慢慢往下滑、拉長 → 蒸發。水滴內是折射後(上下顛倒、縮小、模糊)的畫面 + 暗邊 + 一點高光,
//  所以在暗處幾乎看不見,背後有燈時才亮。uAmt 由 weather.js 依「淋雨 × 抬頭程度」累積、不淋雨時慢慢消退;
//  uAmt 為 0 時整個 pass 關掉(不花任何成本)。
export const LensShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmt: { value: 0 }, uAspect: { value: 1.7 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmt; uniform float uAspect;
    varying vec2 vUv;
    float lh( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    // xy = 水滴內的法線(-1..1),z = 遮罩,w = 半徑(uv)
    vec4 drop( vec2 uv, float sc, float t, float amt, float salt ) {
      vec2 g = vec2( uv.x * uAspect, uv.y ) * sc;
      vec2 id = floor( g ), f = fract( g ) - 0.5;
      float rate = 0.05 + 0.07 * lh( id + salt );
      float ph = t * rate + lh( id + 2.3 + salt ) * 9.0;
      float life = fract( ph ), cyc = floor( ph );
      float on = step( lh( id + cyc * 0.37 + salt ), amt );
      vec2 c = ( vec2( lh( id + cyc * 1.1 + 3.1 ), lh( id + cyc * 2.3 + 7.7 ) ) - 0.5 ) * 0.5;
      c.y -= life * life * 0.35 * step( 0.6, lh( id + cyc + 5.5 ) ); // 有些往下滑
      float r = ( 0.09 + 0.16 * lh( id + cyc * 3.7 + 9.9 ) ) * smoothstep( 0.0, 0.03, life ) * ( 1.0 - smoothstep( 0.6, 1.0, life ) );
      vec2 d = f - c;
      d.y *= 1.0 - 0.35 * life; // 滑動時拉長
      float dl = length( d );
      float m = on * smoothstep( r, r * 0.55, dl ); // 鏡頭上的水滴是失焦的:邊緣柔和
      return vec4( d / max( r, 1e-3 ), m, r / sc );
    }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      vec4 a = drop( vUv, 5.0, uTime, uAmt, 0.0 );
      vec4 b = drop( vUv + vec2( 0.37, 0.11 ), 9.0, uTime * 1.13, uAmt * 0.8, 17.0 );
      vec4 d = a.z >= b.z ? a : b;
      if ( d.z > 0.002 ) {
        float r = d.w;
        vec2 n = d.xy;
        vec2 ruv = vUv - n * r * 1.6 * vec2( 1.0 / uAspect, 1.0 ); // 球面水滴:上下左右顛倒的縮小影像
        float bl = r * 0.12;
        vec3 rc = ( texture2D( tDiffuse, ruv ).rgb * 2.0 + texture2D( tDiffuse, ruv + vec2( bl, 0.0 ) ).rgb + texture2D( tDiffuse, ruv - vec2( bl, 0.0 ) ).rgb
          + texture2D( tDiffuse, ruv + vec2( 0.0, bl ) ).rgb + texture2D( tDiffuse, ruv - vec2( 0.0, bl ) ).rgb ) / 6.0;
        float e = length( n );
        rc *= 1.0 - 0.45 * smoothstep( 0.55, 1.0, e ); // 暗邊(水滴邊緣把光折走)
        float lum = dot( rc, vec3( 0.3, 0.6, 0.1 ) );
        rc += vec3( 0.9, 0.95, 1.0 ) * pow( max( dot( normalize( vec3( n, 1.2 ) ), normalize( vec3( - 0.35, 0.55, 1.0 ) ) ), 0.0 ), 60.0 ) * ( 0.035 + lum * 1.2 );
        c.rgb = mix( c.rgb, rc, d.z * 0.85 );
      }
      gl_FragColor = c;
    }`,
};

export function lensPass() {
  const p = new ShaderPass(LensShader);
  p.name = 'rain-lens';
  return p;
}
