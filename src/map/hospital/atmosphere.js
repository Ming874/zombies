import * as THREE from 'three';

// 夜空(漸層 + 雲 + 月亮 + 星星)、月光(冷藍平行光,靜態陰影)、環境光、霧與氛圍切換、
// 天窗月光柱與窗外斜射光(加法混合的體積)+ 漂浮塵埃。
export const MOON_DIR = new THREE.Vector3(-0.2, -1, -0.42).normalize(); // 月光行進方向(陰影用)
const MOON_SKY = new THREE.Vector3(0.25, 0.42, 0.87).normalize(); // 天空中月亮看起來的位置(南偏東,低空)

const skyMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(0x1a2230) }, uMoon: { value: MOON_SKY }, uFogAmt: { value: 1 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uFog; uniform vec3 uMoon; uniform float uFogAmt;
    varying vec3 vDir;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
    void main(){
      vec3 d = normalize(vDir);
      float up = max(d.y, 0.0);
      vec3 zen = vec3(0.012, 0.02, 0.045), hor = vec3(0.05, 0.065, 0.09);
      vec3 col = mix(hor, zen, pow(up, 0.5));
      // 星星
      vec2 sp = d.xz / (d.y + 0.35) * 220.0;
      float st = step(0.9988, h(floor(sp))) * smoothstep(0.08, 0.5, up);
      col += vec3(0.5, 0.55, 0.7) * st * (0.15 + 0.35 * h(floor(sp) + 3.1));
      // 月亮與光暈
      float m = dot(d, normalize(uMoon));
      float disc = smoothstep(0.99935, 0.99955, m);
      vec2 mp = (d.xy - uMoon.xy) * 900.0;
      float crater = 0.85 + 0.15 * n(mp * 0.08);
      col += vec3(0.92, 0.95, 1.0) * disc * 2.2 * crater;
      col += vec3(0.35, 0.42, 0.6) * (pow(max(m, 0.0), 900.0) * 0.8 + pow(max(m, 0.0), 40.0) * 0.18 + pow(max(m, 0.0), 6.0) * 0.05);
      // 雲(月亮附近的雲邊發亮)
      vec2 cp = d.xz / (d.y + 0.18) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
      float c = fbm(cp);
      float cl = smoothstep(0.42, 0.78, c) * smoothstep(0.0, 0.25, up);
      vec3 cloud = vec3(0.045, 0.05, 0.065) + vec3(0.2, 0.24, 0.32) * pow(max(m, 0.0), 8.0) * (1.0 - smoothstep(0.55, 0.9, c));
      col = mix(col, cloud, cl * 0.92);
      // 地平線融入霧色
      float fh = exp(-up * 7.0);
      col = mix(col, uFog, clamp(fh * uFogAmt + (1.0 - up) * 0.15 * uFogAmt, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
});

// 體積光(天窗月光柱、窗戶斜光):沿光束的高度淡出、邊緣柔化、看穿越長越亮
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uFogDensity: { value: 0.03 }, uStrength: { value: 0.22 } },
  vertexShader: `
    attribute float aT; attribute float aU; attribute float aK;
    varying float vT; varying float vU; varying float vK; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vD;
    void main(){
      vT = aT; vU = aU; vK = aK;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz);
      vec4 mv = viewMatrix * wp;
      vD = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime; uniform float uFogDensity; uniform float uStrength;
    varying float vT; varying float vU; varying float vK; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vD;
    void main(){
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float edge = smoothstep(0.0, 0.22, vU) * smoothstep(1.0, 0.78, vU);
      float along = smoothstep(1.0, 0.82, vT) * (1.0 - vT * 0.65) * smoothstep(0.0, 0.12, vT);
      float shimmer = 0.75 + 0.25 * sin(vW.x * 3.1 + vW.z * 2.3 + uTime * 0.7) * sin(vW.y * 2.7 - uTime * 0.4);
      float near = smoothstep(0.4, 2.0, vD);
      float fog = exp(-pow(uFogDensity * vD * 0.6, 2.0));
      float a = facing * edge * along * shimmer * near * fog * vK * uStrength;
      gl_FragColor = vec4(vec3(0.42, 0.52, 0.72) * a, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
});

// 漂浮塵埃(在光柱裡才亮)
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSize: { value: 7 }, uBox: { value: new THREE.Vector4() }, uY: { value: new THREE.Vector2() }, uShift: { value: new THREE.Vector2() } },
  vertexShader: `
    uniform float uTime; uniform float uSize; uniform vec4 uBox; uniform vec2 uY; uniform vec2 uShift;
    attribute vec3 aSeed; varying float vA;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.11 + aSeed.x * 6.28) * 0.35;
      p.z += cos(uTime * 0.09 + aSeed.y * 6.28) * 0.35;
      p.y = uY.x + mod(p.y - uY.x - uTime * (0.03 + aSeed.z * 0.05), uY.y - uY.x);
      // 這個高度的光柱橫截面
      float t = (uY.y - p.y);
      vec2 o = uShift * t;
      vec2 q = p.xz - o;
      float inside = step(uBox.x, q.x) * step(q.x, uBox.z) * step(uBox.y, q.y) * step(q.y, uBox.w);
      vA = mix(0.06, 1.0, inside) * (0.4 + 0.6 * fract(aSeed.x * 13.7));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * (0.5 + aSeed.z) / max(0.5, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; gl_FragColor = vec4(vec3(0.75, 0.8, 0.9) * vA * (1.0 - d * 4.0) * 0.35, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

export function buildAtmosphere(K, { root, scene, groundMat }) {
  const { L } = K;
  // ---- 天空 ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), skyMat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  root.add(sky);

  // ---- 月光(靜態陰影,只在第一幀與需要時更新) ----
  const moon = new THREE.DirectionalLight(0x9db4e6, 1.25);
  const center = new THREE.Vector3(60, 0, 50);
  moon.position.copy(center).addScaledVector(MOON_DIR, -140);
  moon.target.position.copy(center);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -82; sc.right = 82; sc.top = 82; sc.bottom = -82; sc.near = 20; sc.far = 320;
  sc.updateProjectionMatrix();
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.06;
  moon.shadow.autoUpdate = false;
  moon.shadow.needsUpdate = true;
  root.add(moon, moon.target);

  // ---- 環境光(半球光;色調跟著氛圍) ----
  const hemi = new THREE.HemisphereLight(0x8090b0, 0x141210, 0.3);
  root.add(hemi);

  // ---- 天窗月光柱 ----
  const beams = [];
  const beamGeo = buildBeamGeometry(L, K);
  if (beamGeo) {
    const m = new THREE.Mesh(beamGeo.geo, beamMat);
    m.name = 'moonbeams';
    m.renderOrder = 10;
    m.frustumCulled = false;
    root.add(m);
    beams.push(m);
  }
  // 塵埃(天窗光柱)
  let dust = null;
  if (beamGeo?.sky) {
    const s = beamGeo.sky, n = 700;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const yy = s.y0 + t * (s.y1 - s.y0);
      const h = s.y1 - yy;
      pos[i * 3] = s.x0 - 1 + Math.random() * (s.x1 - s.x0 + 2) + s.sx * h;
      pos[i * 3 + 1] = yy;
      pos[i * 3 + 2] = s.z0 - 1 + Math.random() * (s.z1 - s.z0 + 2) + s.sz * h;
      seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    dustMat.uniforms.uBox.value.set(s.x0, s.z0, s.x1, s.z1);
    dustMat.uniforms.uY.value.set(s.y0, s.y1);
    dustMat.uniforms.uShift.value.set(s.sx, s.sz);
    dust = new THREE.Points(g, dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 11;
    root.add(dust);
  }

  // ---- 遠景:地圖外的泥地(四塊,不和地圖重疊 → 不會 z-fighting) ----
  const W = L.W * L.CELL, H = L.H * L.CELL, E = 260;
  const gp = [], gu = [], gi = [];
  for (const [ax, az, bx, bz] of [[-E, -E, W + E, 0], [-E, H, W + E, H + E], [-E, 0, 0, H], [W, 0, W + E, H]]) {
    const b = gp.length / 3;
    for (const [x, z] of [[ax, bz], [bx, bz], [bx, az], [ax, az]]) { gp.push(x, -0.02, z); gu.push(x, -z); }
    gi.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(gp.length).fill(0).map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
  gg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(gp.length).fill(0.7), 3));
  gg.setIndex(gi);
  const ground = new THREE.Mesh(gg, groundMat);
  ground.receiveShadow = true;
  ground.name = 'far-ground';
  root.add(ground);

  // ---- 氛圍切換 ----
  const cur = { fog: new THREE.Color(0x0b0f0c), density: 0.03, ambient: 0.3, tint: new THREE.Color(0x9fb8a8), env: 0.15, out: 0 };
  const tgtC = new THREE.Color(), tgtT = new THREE.Color();
  let first = true;
  const _dc = new THREE.Color(), _dp = new THREE.Color(0xb88a9a), _dh = new THREE.Color(0xa8b2dc);
  const api = {
    sky, moon, hemi, beams, dust, ground,
    dawn: 0,
    setDawn(t) { api.dawn = Math.max(0, Math.min(1, +t || 0)); },
    envIntensity: 0.14,
    update(t, dt, cam, mood, outdoor) {
      skyMat.uniforms.uTime.value = t;
      beamMat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      sky.position.copy(cam.position);
      // 氛圍平滑過渡(室內外切換快一點)
      const k = first ? 1 : 1 - Math.exp(-dt * (outdoor !== cur.out ? 2.2 : 1.2));
      first = false;
      tgtC.setHex(mood.fog); tgtT.setHex(mood.tint);
      cur.fog.lerp(tgtC, k);
      cur.tint.lerp(tgtT, k);
      cur.density += (mood.density - cur.density) * k;
      cur.ambient += (mood.ambient - cur.ambient) * k;
      cur.out += ((outdoor ? 1 : 0) - cur.out) * k;
      if (scene.fog) { scene.fog.color.copy(cur.fog); scene.fog.density = cur.density * 0.85; }
      if (scene.background && scene.background.isColor) scene.background.copy(cur.fog);
      skyMat.uniforms.uFog.value.copy(cur.fog);
      skyMat.uniforms.uFogAmt.value = 0.75 + cur.density * 6;
      hemi.color.copy(cur.tint);
      hemi.groundColor.copy(cur.tint).multiplyScalar(0.18);
      hemi.intensity = cur.ambient * (0.32 + cur.out * 0.45);
      // [scene r4] 天亮(結局):霧/天空/半球光往冷藍帶粉的黎明色靠(t = 0 時完全不動)
      if (api.dawn > 0) {
        const d = api.dawn;
        _dc.setHex(0x8e92b8).lerp(_dp, 0.45 * d);
        if (scene.fog) { scene.fog.color.lerp(_dc, d * 0.85); scene.fog.density *= 1 - 0.25 * d; }
        if (scene.background && scene.background.isColor) scene.background.lerp(_dc, d * 0.85);
        skyMat.uniforms.uFog.value.lerp(_dc, d * 0.9);
        hemi.color.lerp(_dh, d * 0.8);
        hemi.groundColor.lerp(_dp, d * 0.15);
        hemi.intensity += d * 0.7;
      }
      scene.environmentIntensity = api.envIntensity * (0.35 + cur.ambient * 0.9 + cur.out * 0.5);
      if (api.dawn > 0) scene.environmentIntensity += api.dawn * 0.25;
      beamMat.uniforms.uFogDensity.value = cur.density;
      glowFog(cur.density);
    },
    get current() { return cur; },
  };
  return api;
}
let glowFog = () => {};
export function onGlowFog(fn) { glowFog = fn; }

// 光柱幾何:天窗(頂層 'o')沿月光方向往下投到地面;窗戶的斜射光
function buildBeamGeometry(L, K) {
  const pos = [], nor = [], aT = [], aU = [], aK = [];
  const quad = (a, b, c, d, n, t0, t1, k) => { // a-b 為上緣(t0),d-c 為下緣(t1)
    for (const [p, t, u] of [[a, t0, 0], [b, t0, 1], [c, t1, 1], [a, t0, 0], [c, t1, 1], [d, t1, 0]]) { pos.push(...p); nor.push(...n); aT.push(t); aU.push(u); aK.push(k); }
  };
  const prism = (x0, z0, x1, z1, yTop, yBot, sx, sz, k, t0 = 0, t1 = 1) => {
    const h = yTop - yBot;
    const top = [[x0, yTop, z0], [x1, yTop, z0], [x1, yTop, z1], [x0, yTop, z1]];
    const bot = top.map(([x, , z]) => [x + sx * h, yBot, z + sz * h]);
    const sides = [[0, 1, [0, 0, -1]], [1, 2, [1, 0, 0]], [2, 3, [0, 0, 1]], [3, 0, [-1, 0, 0]]];
    for (const [i, j, n] of sides) quad(top[i], top[j], bot[j], bot[i], n, t0, t1, k);
  };
  const top = L.levels.length - 1, tl = L.levels[top];
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) if (tl.rows[r][c] === 'o') { x0 = Math.min(x0, c * 2); x1 = Math.max(x1, c * 2 + 2); z0 = Math.min(z0, r * 2); z1 = Math.max(z1, r * 2 + 2); }
  const sx = MOON_DIR.x / -MOON_DIR.y, sz = MOON_DIR.z / -MOON_DIR.y; // 每下降 1m 的水平位移
  let sky = null;
  if (x1 > x0) {
    const yTop = tl.y + 0.6, yMid = L.levels[top - 1].y, yBot = L.levels[top - 2]?.y ?? 0;
    // 上段:天窗 → 二樓樓板
    prism(x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, yTop, yMid, sx, sz, 1.0, 0, 0.5);
    // 下段:穿過二樓挑空落到大廳地面(取挑空範圍交集)
    const m = L.levels[top - 1];
    let vx0 = 1e9, vz0 = 1e9, vx1 = -1e9, vz1 = -1e9;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) if (m.rows[r][c] === 'o') { vx0 = Math.min(vx0, c * 2); vx1 = Math.max(vx1, c * 2 + 2); vz0 = Math.min(vz0, r * 2); vz1 = Math.max(vz1, r * 2 + 2); }
    const dh = yTop - yMid;
    const ax0 = Math.max(x0 + 0.3 + sx * dh, vx0 + 0.6), ax1 = Math.min(x1 - 0.3 + sx * dh, vx1 - 0.6), az0 = Math.max(z0 + 0.3 + sz * dh, vz0 + 0.6), az1 = Math.min(z1 - 0.3 + sz * dh, vz1 - 0.6);
    if (ax1 > ax0 && az1 > az0) prism(ax0, az0, ax1, az1, yMid, yBot + 0.02, sx, sz, 1.0, 0.5, 1);
    sky = { x0: x0 + 0.3, z0: z0 + 0.3, x1: x1 - 0.3, z1: z1 - 0.3, y0: yBot, y1: yTop, sx, sz };
  }
  // 窗戶斜射光:面向月光那側(南、東)的外窗,光往室內斜下 2.6m
  const hx = -MOON_DIR.x, hz = -MOON_DIR.z, hl = Math.hypot(hx, hz);
  for (const w of K.windowInfo || []) {
    if (w.zone?.id === 'f2_ward_207') continue; // [scene r4] 207 的窗不畫月光柱:夜裡房間只有檯燈
    if (w.boarded || w.store || !(w.outA || w.outB)) continue;
    const outN = w.axis === 'z' ? [0, w.outB ? 1 : -1] : [w.outB ? 1 : -1, 0];
    const facing = (outN[0] * hx + outN[1] * hz) / hl;
    if (facing < 0.35) continue;
    if (((w.c * 7 + w.r * 13 + w.li * 5) % 3) === 0) continue; // 不是每扇都有
    const y0 = L.levels[w.li].y;
    const dx = -outN[0], dz = -outN[1]; // 往室內
    const inner = w.axis === 'z' ? [w.c * 2 + 0.15, w.r * 2 + (dz > 0 ? 2 : 0), w.c * 2 + 1.85] : [w.c * 2 + (dx > 0 ? 2 : 0), w.r * 2 + 0.15, w.r * 2 + 1.85];
    const drop = 1.5 / 1.0, run = 2.4;
    // 斜光:從窗洞(0.9~2.4)往室內下方投射
    const yTop = y0 + 2.35, yBot = y0 + 0.05;
    const slx = dx * (run / (yTop - yBot)), slz = dz * (run / (yTop - yBot));
    void drop;
    if (w.axis === 'z') prism(inner[0], inner[1] - 0.001, inner[2], inner[1] + 0.001, yTop, yBot, slx, slz, 0.35, 0, 1);
    else prism(inner[0] - 0.001, inner[1], inner[0] + 0.001, inner[2], yTop, yBot, slx, slz, 0.35, 0, 1);
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  geo.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  geo.setAttribute('aK', new THREE.Float32BufferAttribute(aK, 1));
  return { geo, sky };
}

// 低解析度的夜晚環境貼圖(PMREM):上暗藍、地平線霧灰、下方近黑,讓金屬/濕地/玻璃有反射
export function makeEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){ vec3 d = normalize(vD); float u = d.y;
      vec3 c = u > 0.0 ? mix(vec3(0.16,0.19,0.25), vec3(0.05,0.07,0.12), pow(u, 0.6)) : mix(vec3(0.1,0.1,0.1), vec3(0.03,0.028,0.025), pow(-u, 0.5));
      float moon = pow(max(dot(d, normalize(vec3(0.25,0.42,0.87))), 0.0), 60.0) * 3.0;
      float panels = step(0.92, fract(d.x * 3.0 + 0.5)) * step(0.0, u) * step(u, 0.5) * 0.15;
      gl_FragColor = vec4(c + vec3(0.6,0.7,0.9) * moon + panels, 1.0); }`,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.02);
  pm.dispose();
  return rt.texture;
}
