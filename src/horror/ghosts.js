import * as THREE from 'three';
import { createPool } from '../sys/workers.js';
import { unpack } from '../sys/pack.js';
import { idle } from '../sys/sched.js';
import { getVariantAt } from '../zombies/model.js';
import { ghost as gsfx } from '../audio/ghost.js';

// 幻影:半透明的人影(護士、病人、孩子…)。模型沿用 src/zombies/model.js 的建模(倖存者外觀 + 指定服裝),
// 在背景 Worker 建好後於閒置時段「烘焙」成靜態姿勢(CPU 蒙皮一次)→ 一般 Mesh,不用每幀算骨架。
// 材質:菲涅耳邊緣光 + 閃爍 + 掃描線 + 輕微頂點漂移,腳部淡出;'pale' 加法混合(發白光)、'shade' 深色半透明(背光剪影)。
// 不投影、不受光、不擋子彈(raycast 關閉);子彈穿過時冒出寒氣並消失。同時最多 2 個(兩個固定槽位)。
// 消失條件:被手電筒照到、被直視一段時間、靠太近、時間到、換樓層、被子彈打穿。
export const FIGS = {
  nurse: { outfit: 'scrubs', fem: 1, skin: 'fair', hair: '#1b1714', seed: 7101 },
  patient: { outfit: 'gown', fem: 1, skin: 'light', hair: '#141210', longHair: 1, seed: 7202 },
  man: { outfit: 'gown', fem: 0, skin: 'medium', hair: null, seed: 7303 },
  child: { outfit: 'civilian', fem: 1, skin: 'fair', hair: '#1a1410', longHair: 1, seed: 7404, scale: 0.6 },
};
// 姿勢:骨頭名 → [x, y, z] 旋轉(弧度;模型面向 +z、手臂自然下垂)
const POSES = {
  stand: { head: [0.34, 0, 0], neck: [0.12, 0, 0], clavL: [0, 0, -0.06], clavR: [0, 0, 0.06], spine: [0.05, 0, 0] },
  tilt: { head: [0.18, 0, 0.5], neck: [0.05, 0, 0.18], clavL: [0, 0, -0.08], clavR: [0, 0, 0.04] },
  push: { spine: [0.12, 0, 0], head: [0.22, 0, 0], upperArmL: [-1.0, 0, 0.12], upperArmR: [-1.0, 0, -0.12], forearmL: [-0.4, 0, 0], forearmR: [-0.4, 0, 0] },
  reach: { head: [0.26, 0, 0.22], upperArmR: [-1.35, 0, -0.1], forearmR: [-0.15, 0, 0], spine: [0.08, 0, 0] },
  runA: { spine: [0.18, 0, 0], thighL: [-0.75, 0, 0], shinL: [0.95, 0, 0], thighR: [0.5, 0, 0], shinR: [0.35, 0, 0], upperArmL: [0.55, 0, 0], upperArmR: [-0.65, 0, 0], forearmL: [-0.5, 0, 0], forearmR: [-0.7, 0, 0], head: [-0.1, 0, 0] },
  runB: { spine: [0.18, 0, 0], thighR: [-0.75, 0, 0], shinR: [0.95, 0, 0], thighL: [0.5, 0, 0], shinL: [0.35, 0, 0], upperArmR: [0.55, 0, 0], upperArmL: [-0.65, 0, 0], forearmR: [-0.5, 0, 0], forearmL: [-0.7, 0, 0], head: [-0.1, 0, 0] },
};
// 每個角色需要的姿勢
const NEED = { nurse: ['push', 'stand'], patient: ['stand', 'tilt', 'reach'], man: ['stand', 'reach', 'runA', 'runB'], child: ['runA', 'runB', 'stand'] };

// ---------- 材質 ----------
const VS = `
uniform float uTime; uniform float uWob; uniform float uH;
varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
void main(){
  vec3 p = position;
  float w = sin(uTime * 2.3 + p.y * 7.0) * 0.012 + sin(uTime * 5.1 + p.y * 13.0 + p.x * 9.0) * 0.004;
  p += normal * w * uWob;
  p.x += sin(uTime * 1.3 + p.y * 2.0) * 0.016 * uWob * smoothstep(0.0, 1.8, p.y);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vY = p.y / uH;
  vec4 mv = viewMatrix * wp;
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uFog; uniform float uDissolve; uniform float uShade;
varying vec3 vN; varying vec3 vV; varying float vY; varying float vD;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  if (hash(floor(gl_FragCoord.xy * 0.5) + floor(uTime * 12.0)) < uDissolve) discard;
  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(fr, 2.3);
  float flick = 0.84 + 0.16 * sin(uTime * 23.0 + vY * 4.0) * sin(uTime * 7.3);
  float scan = 0.86 + 0.14 * sin(vY * 150.0 - uTime * 6.0);
  float feet = smoothstep(0.02, 0.32, vY);
  float fog = exp(-pow(uFog * vD, 2.0));
  if (uShade > 0.5) {
    float a = (0.78 + rim * 0.22) * uAlpha * mix(0.4, 1.0, feet) * fog * flick;
    gl_FragColor = vec4(uColor * rim * 0.9, a);
  } else {
    float a = (rim * 1.3 + 0.06) * flick * scan * feet * uAlpha * fog;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
}`;
function makeMat(shade) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uWob: { value: 1 }, uH: { value: 1.75 }, uColor: { value: new THREE.Color(shade ? 0x8fb0d8 : 0xb8d4ff) }, uAlpha: { value: 0 }, uFog: { value: 0.03 }, uDissolve: { value: 0 }, uShade: { value: shade ? 1 : 0 } },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false, name: shade ? 'ghost-shade' : 'ghost-pale',
    blending: shade ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}

// ---------- 烘焙:CPU 蒙皮一次 → 靜態幾何(位置 + 法線,共用原本的索引) ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1);
function bake(v, poseKey) {
  const rig = v.rig, bones = rig.bones, pose = POSES[poseKey] || {};
  const world = [], skin = [];
  for (const b of bones) {
    const r = pose[b.name];
    _q.setFromEuler(_e.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
    const local = new THREE.Matrix4();
    if (b.parent) { const pb = bones[rig.index[b.parent]]; local.compose(new THREE.Vector3().subVectors(b.head, pb.head), _q, _one); world[b.i] = world[rig.index[b.parent]].clone().multiply(local); }
    else world[b.i] = local.compose(b.head.clone(), _q, _one);
    skin[b.i] = world[b.i].clone().multiply(_m.makeTranslation(-b.head.x, -b.head.y, -b.head.z));
  }
  const g = v.geometry, P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const E = skin.map((m) => m.elements);
  for (let i = 0; i < n; i++) {
    const px = P.getX(i), py = P.getY(i), pz = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    let ox = 0, oy = 0, oz = 0, qx = 0, qy = 0, qz = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (w <= 0) continue;
      const e = E[SI.getComponent(i, k)];
      ox += w * (e[0] * px + e[4] * py + e[8] * pz + e[12]); oy += w * (e[1] * px + e[5] * py + e[9] * pz + e[13]); oz += w * (e[2] * px + e[6] * py + e[10] * pz + e[14]);
      qx += w * (e[0] * nx + e[4] * ny + e[8] * nz); qy += w * (e[1] * nx + e[5] * ny + e[9] * nz); qz += w * (e[2] * nx + e[6] * ny + e[10] * nz);
    }
    const l = Math.hypot(qx, qy, qz) || 1;
    pos[i * 3] = ox; pos[i * 3 + 1] = oy; pos[i * 3 + 2] = oz;
    nor[i * 3] = qx / l; nor[i * 3 + 1] = qy / l; nor[i * 3 + 2] = qz / l;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (g.index) out.setIndex(g.index);
  out.computeBoundingSphere();
  return out;
}

// ---------- 模型快取(背景建模 + 閒置時烘焙) ----------
class Models {
  constructor() { this.geo = {}; this.src = {}; this.started = false; this.pool = null; this.state = 'idle'; }
  // 開始準備(選單或開局時呼叫一次;全部在背景)
  warm() {
    if (this.started) return;
    this.started = true;
    this.state = 'building';
    try { this.pool = createPool(() => new Worker(new URL('../zombies/model.worker.js', import.meta.url), { type: 'module' }), { name: 'ghost', size: 1, max: 1, idleMs: 6000 }); } catch { this.pool = null; }
    const jobs = Object.entries(FIGS).map(([k, f]) => this._build(k, f));
    Promise.allSettled(jobs).then(() => { this.state = 'ready'; });
  }
  async _build(key, f) {
    let v = null;
    if (this.pool && this.pool.available) {
      try { v = unpack(await this.pool.call('build', ['survivor', f.seed, f], { priority: 0 })); } catch { v = null; }
    }
    if (!v) { try { v = getVariantAt('walker', f.seed % 6); } catch { v = null; } } // 退路:現成的殭屍變體
    if (!v) return;
    this.src[key] = v;
    for (const p of NEED[key]) await idle(() => { this.geo[key + ':' + p] = bake(v, p); }, 2000);
  }
  get(key, pose) {
    const g = this.geo[key + ':' + pose] || this.geo[key + ':' + NEED[key][0]];
    if (g) return g;
    // 還沒烘焙好:找任何一個已完成的
    for (const k in this.geo) return this.geo[k];
    return null;
  }
  ready(key) { return !!this.geo[key + ':' + NEED[key][0]]; }
}
export const models = new Models();

// ---------- 槽位與行為 ----------
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();
export class Apparitions {
  constructor(h, scene, n = 2) { // n:同時幾個(驚嚇用 2;回憶的回音人影用 6,同一個 shader)
    this.h = h;
    this.scene = scene;
    this.slots = Array.from({ length: n }, () => {
      const pale = makeMat(false), shade = makeMat(true);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), pale);
      mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false; mesh.raycast = () => {};
      mesh.renderOrder = 6;
      mesh.name = 'ghost';
      // 深度預先繪製:只留最外層表面(不然加法混合會透出身體裡層的管狀結構,像假人)
      const depth = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uWob: { value: 1 }, uH: { value: 1.75 } }, vertexShader: VS, fragmentShader: 'void main(){}', colorWrite: false, depthWrite: true, transparent: true, fog: false, name: 'ghost-depth' });
      const dm = new THREE.Mesh(mesh.geometry, depth);
      dm.renderOrder = 5; dm.castShadow = false; dm.frustumCulled = false; dm.raycast = () => {};
      mesh.add(dm);
      scene.add(mesh);
      // 推車(護士用):簡單的箱子 + 把手,同一種材質
      const cart = new THREE.Mesh(cartGeo(), pale);
      cart.visible = false; cart.castShadow = false; cart.raycast = () => {}; cart.frustumCulled = false; cart.renderOrder = 6;
      scene.add(cart);
      return { mesh, cart, pale, shade, depth, dm, a: null };
    });
    this.count = 0;
    this.log = [];
    this.losT = 0;
    this.lastShot = 9;
  }
  get active() { return this.slots.filter((s) => s.a).length; }
  free() { return this.slots.find((s) => !s.a) || null; }
  // spec:fig、pose、look('pale'|'shade')、x、y、z、yaw、dur、path(每秒移動 {vx,vz} 或 [{x,z}…])、speed、
  //       vanish {flash, look, lookT, near}、cart、onEnd(why)、alpha、fadeIn、tag(種類,記錄用)、anim(['runA','runB'] 交替)
  spawn(spec) {
    const s = this.free();
    if (!s) return null;
    const geo = models.get(spec.fig || 'patient', spec.pose || 'stand');
    if (!geo) return null;
    const m = s.mesh, mat = spec.look === 'shade' ? s.shade : s.pale;
    m.geometry = geo; m.material = mat; s.dm.geometry = geo;
    const sc = FIGS[spec.fig]?.scale ?? 1;
    m.scale.setScalar(sc * (spec.scale ?? 1));
    m.position.set(spec.x, spec.y, spec.z);
    m.rotation.set(0, spec.yaw ?? 0, 0);
    m.visible = true;
    mat.uniforms.uAlpha.value = 0; mat.uniforms.uDissolve.value = 0; mat.uniforms.uWob.value = spec.wob ?? 1;
    mat.uniforms.uH.value = 1.75 * sc;
    if (spec.cart) { s.cart.material = mat; s.cart.visible = true; }
    const a = s.a = { ...spec, mat, t: 0, look: 0, out: -1, why: null, alpha: spec.alpha ?? (spec.look === 'shade' ? 0.92 : 1), fadeIn: spec.fadeIn ?? 0.6, i: 0, flashT: 0 };
    a.vanish = { flash: true, look: 0.985, lookT: 0.35, near: 0, ...(spec.vanish || {}) };
    this.count++;
    this.log.push(spec.tag || spec.fig);
    if (this.log.length > 20) this.log.shift();
    return a;
  }
  // 讓某個幻影消失(why:'flash' | 'look' | 'near' | 'time' | 'shot' | 'level' | 'force')
  dismiss(a, why = 'force', fast = false) {
    if (!a || a.out >= 0) return;
    a.out = 0; a.outDur = fast ? 0.18 : 0.5; a.why = why;
    if (why !== 'time') gsfx.vanish({ x: a.x, y: a.y + 1.4, z: a.z }, why === 'shot' ? 0.6 : 1);
    a.onVanish?.(why, a);
    this.h.emit('apparition:vanish', { tag: a.tag, why });
  }
  clear() { for (const s of this.slots) if (s.a) this._end(s); }
  _end(s) { const a = s.a; s.a = null; s.mesh.visible = false; s.cart.visible = false; a.onEnd?.(a.why || 'time', a); }
  update(dt, game) {
    const cam = game.camera, p = game.player;
    let any = false;
    for (const s of this.slots) if (s.a) any = true;
    if (!any) { this.lastShot = game.weapons?.sinceShot ?? 9; return; }
    cam.getWorldDirection(_f);
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const fog = game.scene.fog?.density ?? 0.03;
    const shot = game.weapons && game.weapons.sinceShot < this.lastShot; // 這一幀開了槍
    this.lastShot = game.weapons?.sinceShot ?? 9;
    this.losT -= dt;
    const doLos = this.losT <= 0;
    if (doLos) this.losT = 0.12;
    const W = game.world;
    for (const s of this.slots) {
      const a = s.a;
      if (!a) continue;
      a.t += dt;
      const m = s.mesh, mat = a.mat;
      // 移動
      if (a.vx || a.vz) { a.x += (a.vx || 0) * dt; a.z += (a.vz || 0) * dt; }
      if (a.path && a.path.length) {
        const tg = a.path[0], dx = tg.x - a.x, dz = tg.z - a.z, d = Math.hypot(dx, dz), st = (a.speed ?? 1) * dt;
        if (d <= st) { a.x = tg.x; a.z = tg.z; a.path.shift(); if (!a.path.length) a.arrived = true; }
        else { a.x += dx / d * st; a.z += dz / d * st; a.yaw = Math.atan2(dx, dz); }
      }
      if (a.anim && a.t - (a.animT || 0) > (a.animDt ?? 0.16)) { a.animT = a.t; a.i ^= 1; const g = models.get(a.fig, a.anim[a.i]); if (g) { m.geometry = g; s.dm.geometry = g; } }
      if (a.face) a.yaw = Math.atan2(cx - a.x, cz - a.z); // 一直轉向玩家
      m.position.set(a.x, a.y + (a.bob ? Math.abs(Math.sin(a.t * 9)) * 0.04 : 0), a.z);
      m.rotation.y = a.yaw ?? 0;
      if (s.cart.visible) { const sy = Math.sin(a.yaw), cyw = Math.cos(a.yaw); s.cart.position.set(a.x + sy * 0.38, a.y, a.z + cyw * 0.38); s.cart.rotation.y = a.yaw; }
      // 透明度
      let k;
      if (a.out >= 0) { a.out += dt; k = Math.max(0, 1 - a.out / a.outDur); mat.uniforms.uDissolve.value = Math.min(1, a.out / a.outDur); if (a.out >= a.outDur) { this._end(s); continue; } }
      else k = Math.min(1, a.t / a.fadeIn);
      mat.uniforms.uAlpha.value = k * a.alpha * (a.flick ? (Math.random() < 0.06 ? 0.2 : 1) : 1);
      mat.uniforms.uTime.value = game.time;
      mat.uniforms.uFog.value = fog;
      const du = s.depth.uniforms; du.uTime.value = game.time; du.uWob.value = mat.uniforms.uWob.value; du.uH.value = mat.uniforms.uH.value;
      s.dm.visible = a.out < 0 || a.out < a.outDur * 0.5; // 消散時先拿掉深度,讓溶解看得出來
      if (a.out >= 0) continue;
      // ---- 消失條件 ----
      const hy = a.y + 1.35 * (FIGS[a.fig]?.scale ?? 1);
      const dx = a.x - cx, dy = hy - cy, dz = a.z - cz, d = Math.hypot(dx, dy, dz) || 1;
      const dot = (dx * _f.x + dy * _f.y + dz * _f.z) / d;
      a.dist = d; a.dot = dot;
      if (doLos) a.los = W.hasLineOfSight ? W.hasLineOfSight(cx, cy, cz, a.x, hy, a.z) : true;
      // 被子彈穿過:準心射線離身體中心線 < 0.42m,而且比牆近
      if (shot && dot > 0.9) {
        _v.set(a.x - cx, 0, a.z - cz);
        const along = dx * _f.x + dy * _f.y + dz * _f.z;
        _c.set(cx + _f.x * along, cy + _f.y * along, cz + _f.z * along);
        const lat = Math.hypot(_c.x - a.x, _c.z - a.z), yy = _c.y - a.y;
        if (along > 0 && lat < 0.42 && yy > 0.1 && yy < 1.9 && (!W.rayDistance || W.rayDistance(cx, cy, cz, _f.x, _f.y, _f.z, along + 0.5) >= along - 0.3)) {
          this.h.fx?.mist(_c.x, _c.y, _c.z, _f);
          gsfx.mist({ x: _c.x, y: _c.y, z: _c.z });
          this.dismiss(a, 'shot', true);
          continue;
        }
      }
      const V = a.vanish;
      const lvl = Math.abs((p.pos.y + 0.3) - (a.y + 0.3)) > 2.5;
      if (lvl && !a.anyLevel) { this.dismiss(a, 'level', true); continue; }
      if (V.flash && p.flashOn && a.los && d < 24 && dot > Math.cos(0.5)) { a.flashT += dt; if (a.flashT > (V.flashT ?? 0.12)) { this.dismiss(a, 'flash'); continue; } }
      if (V.look && a.los && dot > V.look) { a.look += dt; if (a.look > V.lookT) { this.dismiss(a, 'look'); continue; } }
      if (V.near && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < V.near) { this.dismiss(a, 'near'); continue; }
      if (a.arrived && a.endOnArrive) { this.dismiss(a, 'time'); continue; }
      if (a.t > (a.dur ?? 6)) { this.dismiss(a, 'time'); continue; }
      a.onTick?.(a, dt);
    }
  }
  // 預先編譯兩種材質(避免第一次出現時卡一下)
  precompile(renderer, scene, camera) {
    if (!renderer?.compileAsync) return;
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.2, 8, 6);
    for (const s of this.slots.slice(0, 1)) for (const m of [s.pale, s.shade]) { const x = new THREE.Mesh(geo, m); x.frustumCulled = false; g.add(x); }
    scene.add(g);
    renderer.compileAsync(g, camera, scene).catch(() => {}).finally(() => { scene.remove(g); geo.dispose(); });
  }
}
function cartGeo() {
  const parts = [];
  const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); parts.push(b); };
  box(0.55, 0.04, 0.85, 0, 0.92, 0); box(0.55, 0.04, 0.85, 0, 0.5, 0); box(0.52, 0.03, 0.8, 0, 0.18, 0);
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.4, 0.4]) box(0.025, 0.85, 0.025, sx, 0.52, sz);
  box(0.5, 0.025, 0.025, 0, 1.0, -0.45);
  const geo = new THREE.BufferGeometry();
  // 手動合併(避免多一個 import)
  let n = 0; for (const p of parts) n += p.index.count;
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const p of parts) {
    const P = p.attributes.position.array, N = p.attributes.normal.array;
    for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
    for (const i of p.index.array) idx.push(i + base);
    base += P.length / 3;
    p.dispose();
  }
  void n;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.translate(0, 0, 0.45); // 原點在把手(推車往 +z 延伸)
  return geo;
}
