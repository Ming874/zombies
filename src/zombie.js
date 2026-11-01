import * as THREE from 'three';
import { sfx } from './audio.js';
import { getVariant, instantiate, variantReady } from './zombies/model.js';
import { POSES, HIT } from './zombies/poses.js';
import { allMaterials } from './zombies/materials.js';
import { realisticMaterials } from './zombies/realistic.js';

export const ZOMBIE_HP = 150;

// 血條顏色:150 綠 → 100 橘 → 50 紅(中間線性漸變,≤50 維持紅)
const GREEN = [46, 204, 64];
const ORANGE = [255, 159, 26];
const RED = [225, 29, 29];
export function hpColor(hp) {
  let a, b, t;
  if (hp >= 150) return GREEN;
  if (hp >= 100) { a = ORANGE; b = GREEN; t = (hp - 100) / 50; }
  else if (hp > 50) { a = RED; b = ORANGE; t = (hp - 50) / 50; }
  else return RED;
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 外觀類型與出現權重:模型、材質、身體語言來自 src/zombies/(程式生成 + 寫實模型),血量/速度/攻擊全部相同。
// 爬行者(多半沒有腿)與追獵者(追逐戰專用)的身形只適合牠們自己的行動方式,不列入
const LOOKS = { walker: 36, runner: 12, bloater: 6, brute: 4, screamer: 7, stalker: 5, surgeon: 8, burned: 8, hazmat: 6, straitjacket: 8 };
export const LOOK_TYPES = Object.keys(LOOKS);
// 只挑已經建好變體的類型(還在背景建模的先跳過,生成時才不會在主執行緒同步建模);都還沒好就用行屍
function pickLook() {
  const ok = LOOK_TYPES.filter((t) => variantReady(t));
  if (!ok.length) return 'walker';
  let r = Math.random() * ok.reduce((s, t) => s + LOOKS[t], 0);
  for (const t of ok) if ((r -= LOOKS[t]) <= 0) return t;
  return ok[0];
}

// 斷肢個體的斷口(血肉 + 骨頭),所有殭屍共用幾何與材質
let STUMP = null;
const _UP = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
function stumpParts() {
  if (!STUMP) {
    STUMP = {
      geo: new THREE.SphereGeometry(1, 14, 10),
      meat: new THREE.MeshStandardMaterial({ color: 0x4a0907, roughness: 0.38, metalness: 0.05, emissive: 0x120101 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xd9cfb6, roughness: 0.55 }),
    };
  }
  return STUMP;
}

// 預先在背景編譯殭屍材質的 shader(主畫面 + 手電筒陰影的深度 pass):three 第一次畫到才編譯會卡住主執行緒。
// 所有變體的頂點格式相同,借一個行屍變體的幾何與骨架,給每種材質(含寫實模型的兩種)各掛一個代理
const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const warmKeep = []; // 代理材質留著:dispose 會讓 three 回收剛編好的 program
function depthOf(m) { // 仿照 WebGLShadowMap.getDepthMaterial(program 依參數共用)
  const d = new THREE.MeshDepthMaterial();
  d.side = m.shadowSide != null ? m.shadowSide : SHADOW_SIDE[m.side];
  d.alphaMap = m.alphaMap || null;
  d.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest || 0;
  d.map = m.map || null;
  return d;
}
export function warmZombies(renderer, scene, camera) {
  const v = getVariant('walker');
  const inst = instantiate(v);
  const g = new THREE.Group();
  for (const m of [...allMaterials(), ...realisticMaterials()]) {
    const d = depthOf(m);
    warmKeep.push(d);
    for (const mm of [m, d]) {
      const p = new THREE.SkinnedMesh(v.geometry, mm);
      p.bind(inst.mesh.skeleton, inst.mesh.bindMatrix);
      g.add(p);
    }
  }
  g.add(inst.mesh);
  return renderer.compileAsync(g, camera, scene).catch(() => {}).finally(() => inst.mesh.skeleton.dispose());
}

function makeBar() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(1.0, 0.13, 1);
  sprite.renderOrder = 10;
  return { c, tex, sprite };
}

export class Zombie {
  constructor(scene, x, z, round) {
    this.scene = scene;
    this.hp = ZOMBIE_HP;
    this.alive = true;
    this.dying = 0;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.speed = Math.min(2.7, 1.0 + round * 0.07 + Math.random() * 0.45);
    this.attackT = 0;
    this.attackCd = 0;
    this.groanT = 2 + Math.random() * 5;
    this.heading = Math.random() * 6.28;
    this.lean = 0.12 + Math.random() * 0.15;
    this.limp = Math.random() < 0.3 ? 0.5 : 1;

    // ---- 模型:骨架 SkinnedMesh + 掛在骨骼上的隱形命中盒 ----
    const look = (this.look = pickLook());
    const v = (this.V = getVariant(look));
    const inst = instantiate(v);
    this.mesh = inst.mesh;
    this.b = inst.bones;
    this.boneList = inst.list;
    this.rest = inst.rest;
    for (const n of ['spine', 'chest', 'neck', 'head']) this.b[n].rotation.order = 'YXZ';
    this.meshes = inst.hits; // 射線只打命中盒(userData.part:head / body / arm / leg / armor)
    for (const h of this.meshes) h.userData.zombie = this;
    // 巨屍的模型本身約 2.2m:這裡只是外觀,縮回接近一般身高
    this.k = (0.95 + Math.random() * 0.1) * (look === 'brute' ? 1.06 / v.P.s : 1);
    this.mesh.scale.setScalar(this.k);
    this.legT = v.legT;
    this.legS = v.legS;
    this.hipY = this.b.hips.position.y;
    this.headH = v.rig.HC.y * this.k;

    // ---- 動畫狀態(只影響外觀) ----
    this.state = 'chase';
    this.st = 0;
    this.t = Math.random() * 100;
    this.ph = Math.random() * 6.28;
    this.seed = Math.random() * 100;
    this.speedNow = 0;
    const r = Math.random();
    this.armStyle = look !== 'walker' ? 'none' : r < 0.5 ? 'reach' : r < 0.75 ? 'one' : 'hang';
    this.limpSide = Math.random() < 0.5 ? 1 : -1;
    this.limpA = this.limp < 1 ? 0.5 + Math.random() * 0.5 : 0;
    this.tilt = (Math.random() - 0.5) * 0.5;
    this.twitchT = 1 + Math.random() * 3;
    this.twitch = 0;
    this.twitchDir = 0;
    this.jawSkew = (Math.random() - 0.5) * 0.5;
    this.slashSide = 0;
    this.jawT = 0;
    this.flinch = 0; this.flinchV = 0; this.roll = 0; this.rollV = 0; this.headKick = 0;
    this.rootY = 0; this.rootPitch = 0; this.rootRoll = 0;
    // 生成時就少一截前臂或手掌的個體:骨骼縮成 0、接上斷口
    const amp = v.P.amp, ab = amp && this.b[amp];
    if (ab && ab.parent) { ab.scale.setScalar(0); this._stump(ab.parent.name, amp, amp.startsWith('hand') ? 0.032 : 0.042); }

    const root = new THREE.Group();
    this.root = root;
    root.rotation.order = 'YXZ';
    root.add(this.mesh);

    // 頭頂血條
    this.bar = makeBar();
    this.bar.sprite.position.set(0, this.headH + 0.32, 0);
    root.add(this.bar.sprite);
    this.drawBar();

    root.position.copy(this.pos);
    scene.add(root);
  }

  drawBar() {
    const { c, tex } = this.bar;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, 128, 16);
    const [r, g, b] = hpColor(this.hp);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(2, 2, Math.max(0, 124 * (this.hp / ZOMBIE_HP)), 12);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(2, 2, Math.max(0, 124 * (this.hp / ZOMBIE_HP)), 4);
    tex.needsUpdate = true;
  }

  // part 只影響受擊動作(往後仰、甩頭)與倒法;傷害倍率由呼叫端算好
  damage(amount, part = 'body') {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    const k = Math.min(2, amount / 30) * (this.look === 'brute' ? 0.3 : this.look === 'bloater' ? 0.5 : 1);
    this.flinchV += (part === 'head' ? 7 : 4.5) * k;
    this.rollV += (Math.random() - 0.5) * 9 * k;
    if (part === 'head') this.headKick = Math.min(1.2, this.headKick + 0.7);
    this.drawBar();
    if (this.hp <= 0) {
      this.alive = false;
      this.dying = 0.0001;
      this.bar.sprite.visible = false;
      const r = Math.random();
      this.deathKind = this.look === 'brute' ? 'kneel' : part === 'head' ? (r < 0.65 ? 'back' : 'kneel') : r < 0.4 ? 'front' : r < 0.72 ? 'back' : 'kneel';
      this.deathSide = Math.random() < 0.5 ? 1 : -1;
      this.rootY = Math.max(0, this.rootY);
      sfx.zombieDie();
      return true;
    }
    return false;
  }

  // 回傳要對玩家造成的傷害(0 = 沒攻擊)
  update(dt, player, world, others) {
    this.t += dt;
    if (!this.alive) {
      if (this.dying > 0) this._dead(dt, world);
      return 0;
    }
    let dealt = 0;
    const toX = player.pos.x - this.pos.x, toZ = player.pos.z - this.pos.z;
    const dist = Math.hypot(toX, toZ);

    // 方向:近距離且視線通暢就直線,否則走導航場
    let dx = 0, dz = 0, moving = true;
    if (dist < 4 && world.hasLineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z)) {
      dx = toX / dist; dz = toZ / dist;
    } else {
      const f = world.flowDir(this.pos.x, this.pos.z, this._dir || (this._dir = { x: 0, z: 0 }));
      if (f) { dx = f.x; dz = f.z; } else { dx = toX / (dist || 1); dz = toZ / (dist || 1); }
    }

    const reach = 1.05;
    if (dist < reach) moving = false;

    // 攻擊
    this.attackCd -= dt;
    if (dist < reach + 0.15) {
      if (this.attackCd <= 0) {
        this.attackT = 0.5;
        this.attackCd = 1.1;
        this.slashSide = Math.random() < 0.5 ? 0 : 1;
        sfx.attack();
      }
      if (this.attackT > 0) {
        const before = this.attackT;
        this.attackT -= dt;
        if (before > 0.25 && this.attackT <= 0.25) dealt = 10;
      }
    } else if (this.attackT > 0) this.attackT = 0;

    // 移動
    const sp = moving ? this.speed * this.limp : 0;
    const k = Math.min(1, dt * 6);
    this.vel.x += (dx * sp - this.vel.x) * k;
    this.vel.z += (dz * sp - this.vel.z) * k;
    // 與其他殭屍分離
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const ax = this.pos.x - o.pos.x, az = this.pos.z - o.pos.z;
      const d2 = ax * ax + az * az;
      if (d2 < 0.5 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        this.vel.x += (ax / d) * (0.7 - d) * 4 * dt * 10;
        this.vel.z += (az / d) * (0.7 - d) * 4 * dt * 10;
      }
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    world.resolve(this.pos, 0.34);
    // 別疊在玩家身上
    if (dist < 0.75) {
      const nx = (this.pos.x - player.pos.x) / (dist || 1), nz = (this.pos.z - player.pos.z) / (dist || 1);
      this.pos.x = player.pos.x + nx * 0.75;
      this.pos.z = player.pos.z + nz * 0.75;
    }

    // 朝向
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    const target = dist < 5 ? Math.atan2(toX, toZ) : speedNow > 0.1 ? Math.atan2(this.vel.x, this.vel.z) : this.heading;
    this.heading += wrapA(target - this.heading) * Math.min(1, dt * 7);

    // 動畫:攻擊的 0.25 秒出手時間對齊到各外觀攻擊動作的命中瞬間
    this.speedNow = speedNow;
    if (this.attackT > 0) { this.state = 'attack'; this.st = ((0.5 - this.attackT) * HIT[this.look]) / 0.25; }
    else { this.state = 'chase'; this.st = 0; }
    this.mesh.castShadow = dist < 11; // 遠處的不進陰影貼圖
    this._resetPose();
    POSES[this.look].call(this, dt, toX, toZ);
    this._reactions(dt);
    this._applyRoot();

    // 呻吟
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 4 + Math.random() * 6;
      sfx.groan(dist);
      this.jawT = 1.3;
    }
    this.jawT = Math.max(0, this.jawT - dt);
    return dealt;
  }

  // ======================= 姿勢工具(poses.js 使用) =======================
  _resetPose() {
    const L = this.boneList;
    for (let i = 0; i < L.length; i++) { L[i].rotation.set(0, 0, 0); L[i].position.copy(this.rest[i]); }
    this.b.belly.scale.setScalar(1);
  }

  // 雙腿步態;回傳著地腿的垂直長度(用來讓骨盆跟著上下)
  _legs(ph, amp, knee, crouch, o = {}) {
    const b = this.b;
    let ext = 0;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const p = ph + k * Math.PI;
      const bad = this.limpA && this.limpSide === s ? this.limpA : 0;
      const c = Math.cos(p);
      const th = -amp * (1 - bad * 0.5) * Math.sin(p) - crouch + (o.th ?? 0);
      const kn = knee * (1 - bad * 0.8) * Math.pow(Math.max(0, c), 1.3) + crouch * 1.6 + 0.03 + (o.kn ?? 0);
      b['thigh' + L].rotation.set(th, s * ((o.toe ?? 0.06) + bad * 0.3), s * (o.wide ?? 0.03));
      b['shin' + L].rotation.x = kn;
      b['foot' + L].rotation.x = -(th + kn) * 0.85 + bad * 0.55 * Math.max(0, c) + (o.foot ?? 0);
      ext = Math.max(ext, this.legT * Math.cos(th) + this.legS * Math.cos(th + kn));
    }
    return ext;
  }
  _hipsTo(ext, extra = 0) { this.b.hips.position.y = this.hipY - (this.legT + this.legS - ext) - extra; }
  // 步伐相位依實際移動距離推進(腳不打滑)
  _advance(dt, amp, sp) { this.ph += (dt * Math.PI * sp) / (2 * (this.legT + this.legS) * Math.sin(Math.max(amp, 0.12))); }
  _arm(L, s, x, z, elbow, wrist = 0, y = 0) {
    const b = this.b;
    b['upperArm' + L].rotation.set(x, s * y, s * z);
    b['forearm' + L].rotation.x = -elbow;
    b['hand' + L].rotation.x = wrist;
  }
  _look(toX, toZ, amt = 1) {
    const rel = clamp(wrapA(Math.atan2(toX, toZ) - this.heading), -1.1, 1.1) * amt;
    this.b.neck.rotation.y += rel * 0.4;
    this.b.head.rotation.y += rel * 0.55;
  }
  // 呻吟時張嘴
  _jaw(base) {
    const g = this.jawT > 0 ? Math.sin((1 - this.jawT / 1.3) * Math.PI) * 0.4 : 0;
    this.b.jaw.rotation.x = Math.max(this.b.jaw.rotation.x, base + g);
  }

  // 受擊彈簧:往後仰、側傾、爆頭甩頭
  _reactions(dt) {
    const b = this.b;
    this.flinchV += (-this.flinch * 70 - this.flinchV * 10) * dt;
    this.flinch += this.flinchV * dt;
    this.rollV += (-this.roll * 60 - this.rollV * 9) * dt;
    this.roll += this.rollV * dt;
    this.headKick *= Math.pow(0.015, dt);
    b.spine.rotation.x -= this.flinch * 0.4;
    b.chest.rotation.x -= this.flinch * 0.4;
    b.chest.rotation.z += this.roll * 0.3;
    b.head.rotation.x -= this.flinch * 0.5 + this.headKick * 0.9;
    b.head.rotation.z += this.roll * 0.5;
  }

  _applyRoot() {
    this.root.position.set(this.pos.x, this.rootY, this.pos.z);
    this.root.rotation.set(this.rootPitch, this.heading, this.rootRoll);
  }

  _stump(parent, child, r) {
    const S = stumpParts();
    const pb = this.b[parent], cb = this.b[child];
    const g = new THREE.Group();
    g.position.copy(cb.position);
    g.quaternion.setFromUnitVectors(_UP, _dir.copy(cb.position).normalize());
    const meat = new THREE.Mesh(S.geo, S.meat);
    meat.scale.set(r, r * 0.45, r);
    const bone = new THREE.Mesh(S.geo, S.bone);
    bone.scale.set(r * 0.32, r * 0.5, r * 0.32);
    bone.position.y = r * 0.12;
    g.add(meat, bone);
    pb.add(g);
  }

  // ======================= 死亡:往後倒 / 往前撲倒 / 跪下再側倒 =======================
  _dead(dt, world) {
    this.dying += dt;
    const t = this.dying, b = this.b, side = this.deathSide;
    this.vel.multiplyScalar(Math.pow(0.03, dt));
    this.pos.addScaledVector(this.vel, dt);
    world.resolve(this.pos, 0.3);
    const sm = Math.min(1, dt * 9);
    const R = (bone, x, y, z) => { const r = b[bone].rotation; r.x += (x - r.x) * sm; r.y += (y - r.y) * sm; r.z += (z - r.z) * sm; };
    const fall = (t0, t1) => {
      const u = clamp((t - t0) / (t1 - t0), 0, 1);
      return u < 1 ? u * u : 1 - Math.exp(-(t - t1) * 9) * Math.sin((t - t1) * 22) * 0.05;
    };
    const limpLegs = (kn) => { for (const L of ['L', 'R']) { R('thigh' + L, -0.15, 0, 0); R('shin' + L, kn, 0, 0); R('foot' + L, 0.4, 0, 0); } };
    let e;
    switch (this.deathKind) {
      case 'back':
        e = fall(0.12, 0.85);
        this.rootPitch = -e * 1.5;
        this.rootY = e * 0.13;
        limpLegs(t < 0.4 ? 0.7 : 0.2);
        R('spine', -0.15, 0, 0); R('chest', -0.1, 0, 0); R('neck', -0.2, 0, 0); R('head', -0.35, e * side * 0.7, 0);
        R('upperArmL', -2.3 * e, 0, 0.5); R('upperArmR', -2.1 * e, 0, -0.6); R('forearmL', -0.3, 0, 0); R('forearmR', -0.5, 0, 0);
        break;
      case 'front':
        e = fall(0.08, 0.7);
        this.rootPitch = e * 1.48;
        this.rootY = e * 0.12;
        limpLegs(t < 0.35 ? 0.8 : 0.15);
        R('spine', 0.2, 0, 0); R('chest', 0.1, 0, 0); R('neck', 0, 0, 0); R('head', -0.2, side * 1.1 * e, 0);
        R('upperArmL', -0.5 + e * 0.4, 0, 0.35); R('upperArmR', -0.9 + e * 0.6, 0, -0.5); R('forearmL', -0.4, 0, 0); R('forearmR', -0.8, 0, 0);
        break;
      default: { // kneel:先跪下,再側倒
        const k1 = sstep(0, 0.45, t);
        const h = this.legT * 0.98 + 0.07;
        b.hips.position.y += ((this.hipY - (this.hipY - h) * k1) - b.hips.position.y) * sm;
        for (const L of ['L', 'R']) { R('thigh' + L, -0.1 * k1, 0, 0); R('shin' + L, 1.5 * k1, 0, 0); R('foot' + L, 0.5 * k1, 0, 0); }
        R('spine', 0.35, 0, 0); R('chest', 0.2, 0, 0); R('head', 0.3, 0, side * 0.3);
        R('upperArmL', 0.1, 0, 0.1); R('upperArmR', 0.1, 0, -0.1); R('forearmL', -0.2, 0, 0); R('forearmR', -0.2, 0, 0);
        e = fall(0.6, 1.3);
        this.rootRoll = side * e * 1.42;
        this.rootY = e * 0.16 * this.V.P.s * this.k;
      }
    }
    if (this.corpse !== undefined && this.corpse < 1.5) this.rootY -= (1.5 - this.corpse) * 0.3; // 屍體最後沉進地板
    this._applyRoot();
  }

  dispose() {
    this.scene.remove(this.root);
    // 每個實例的骨架各有一張 GPU 骨骼貼圖,不 dispose 就每隻殭屍漏一張
    if (this.mesh.skeleton) this.mesh.skeleton.dispose();
    this.bar.tex.dispose();
    this.bar.sprite.material.dispose();
  }
}
