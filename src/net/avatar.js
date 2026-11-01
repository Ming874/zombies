import * as THREE from 'three';
import { survivorVariant, survivorUpgraded, instantiate } from '../zombies/model.js';
import { createDisplayGun } from '../weapons/models.js';
import { makeFlashStar, makeGlow } from '../map/textures.js';
import { F } from './protocol.js';

// 遠端玩家角色:倖存者模型 + 右手骨骼上的展示槍。
// 下半身:依速度與移動方向播放走/跑/後退/側移步態(髖部轉向移動方向,上半身反向轉回正面);
// 上半身:脊椎/胸/頸分攤俯仰角,雙手以兩段式 IK 握住槍(槍的姿勢由瞄準方向決定);
// 另有開火後座、換彈、衝刺持槍、倒地(坐地單手持手槍)、救援(跪姿)、死亡倒下、名牌。
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = Array.from({ length: 12 }, () => V());
const _q = Array.from({ length: 8 }, () => new THREE.Quaternion());
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

// 槍在右手中的固定相對姿勢(手部骨骼座標;骨骼靜止姿勢與模型座標同向:+X 角色左、+Y 上、+Z 前):
// 槍口(槍 -Z)沿手的長軸(-Y)、槍的上方(槍 +Y)朝拇指側(+Z)、槍的右側(槍 +X)朝手背(-X)
const GUN_IN_HAND = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
const GUN_IN_HAND_POS = V(0.017, -0.074, 0.027);
const GUN_IN_HAND_INV = GUN_IN_HAND.clone().invert();
// 左手托護木:掌心朝上、手指朝前偏內(以槍座標表示手的三軸)
const LEFT_ON_FORE = (() => {
  const X = V(0, -1, 0); // 手背朝下(左手掌心是 -X)
  const Y = V(-0.38, 0, 1).normalize(); // 手的 +Y(手腕方向)= 長軸反向:手指朝前(槍 -Z)偏右(槍 +X)
  const Z = V().crossVectors(X, Y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
})();
const PALM_R = V(0.016, -0.065, 0.012), PALM_L = V(-0.016, -0.062, 0.0);

// 各武器的持槍方式:support = 左手在槍座標的位置;stock = 槍托到握把的距離(步槍抵肩)
const HOLD = {
  pistol: { kind: 'pistol', support: V(-0.03, -0.052, 0.006) },
  revolver: { kind: 'pistol', support: V(-0.032, -0.056, 0.004) },
  ak47: { kind: 'rifle', support: V(0, -0.034, -0.33), stock: 0.3 },
  m4a1: { kind: 'rifle', support: V(0, -0.028, -0.235), stock: 0.29 },
  shotgun: { kind: 'rifle', support: V(0, -0.04, -0.37), stock: 0.31 },
  barrett: { kind: 'rifle', support: V(0, -0.05, -0.45), stock: 0.33 },
};

let flashTex = null, glowTex = null, beamTex = null;
const coneGeo = new THREE.ConeGeometry(1, 1, 20, 4, true).translate(0, -0.5, 0).rotateX(Math.PI / 2); // 尖端在原點、往槍口方向(-Z)張開
const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
// 光錐亮度沿長度衰減(尖端亮、遠端全黑 = 加法混色下不可見)
function beamGradient() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, '#5a5a5a');
  g.addColorStop(1, '#000000');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Avatar {
  // opts: { look, name, team(隊友:名牌穿牆可見 + 血條) }
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.look = opts.look ?? 0;
    this.onModel = null; // 換模型後(命中盒是新的)通知連線層
    this.root = new THREE.Group();
    scene.add(this.root);
    // 槍:掛在右手骨骼上
    this.mount = new THREE.Group();
    this.mount.quaternion.copy(GUN_IN_HAND);
    this.mount.position.copy(GUN_IN_HAND_POS);
    this._setModel(survivorVariant(this.look));
    this._upT = 0;
    this.guns = {};
    this.weapon = null;
    this.muzzle = V(0, 0.03, -0.2);
    if (!flashTex) { flashTex = makeFlashStar(); glowTex = makeGlow('rgba(255,244,220,1)', 'rgba(255,220,160,0)'); beamTex = beamGradient(); coneMat.map = beamTex; coneMat.needsUpdate = true; }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.mount.add(this.flash);
    // 手電筒(假光錐 + 光暈,不新增真實光源以免著色器重編)
    this.beam = new THREE.Mesh(coneGeo, coneMat);
    this.beam.scale.set(1.15, 1.15, 6.5);
    this.beam.renderOrder = 2;
    this.lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    this.lamp.scale.setScalar(0.22);
    this.mount.add(this.beam, this.lamp);

    // 名牌
    this.team = opts.team !== false;
    this.name = opts.name || '';
    this.plateC = document.createElement('canvas');
    this.plateC.width = 512;
    this.plateC.height = 128;
    this.plateT = new THREE.CanvasTexture(this.plateC);
    this.plateT.colorSpace = THREE.SRGBColorSpace;
    this.plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.plateT, transparent: true, depthWrite: false, depthTest: !this.team, sizeAttenuation: false, fog: false }));
    this.plate.scale.set(0.3, 0.075, 1);
    this.plate.center.set(0.5, 0);
    this.plate.renderOrder = 998;
    scene.add(this.plate);
    this._plateKey = '';

    // 動畫狀態
    this.ph = Math.random() * 6;
    this.stepN = 0;
    this.hipYaw = 0;
    this.lean = 0;
    this.kick = 0;
    this.flashT = 0;
    this.reloadB = 0;
    this.sprintB = 0;
    this.downB = 0;
    this.reviveB = 0;
    this.deadT = -1;
    this.deadSide = 1;
    this.t = Math.random() * 10;
    this.visible = true;
    this.speed = 0;
    this.onStep = null; // (pos) => void 腳步聲
  }

  // 角色模型(開局時寫實模型還沒下載完就先用程式生成的,下載好再換)
  _setModel(v) {
    if (this.mesh) { this.root.remove(this.mesh); this.mesh.skeleton?.dispose(); }
    this.v = v;
    const inst = instantiate(v);
    this.mesh = inst.mesh;
    this.b = inst.bones;
    this.list = inst.list;
    this.rest = inst.rest;
    this.hits = inst.hits; // 隱形命中盒(對戰模式射線用)
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) this.b[n].rotation.order = 'YXZ';
    this.root.add(this.mesh);
    this.legT = v.legT;
    this.legS = v.legS;
    this.hipY = this.b.hips.position.y;
    this.shoulderY = v.rig.bones[v.rig.index.upperArmR].head.y;
    this.sw = v.rig.sw * v.P.s;
    this.headH = v.rig.HC.y;
    const arm = (L) => {
      const R = v.rig, u = R.bones[R.index['upperArm' + L]], f = R.bones[R.index['forearm' + L]];
      return {
        up: this.b['upperArm' + L], fo: this.b['forearm' + L], ha: this.b['hand' + L],
        la: u.head.distanceTo(u.tail), lb: f.head.distanceTo(f.tail),
        restU: u.tail.clone().sub(u.head).normalize(), restF: f.tail.clone().sub(f.head).normalize(),
      };
    };
    this.armR = arm('R');
    this.armL = arm('L');
    this.b.handR.add(this.mount);
    if (this.onModel) this.onModel(this);
  }

  setWeapon(id) {
    if (id === this.weapon) return;
    if (this.weapon && this.guns[this.weapon]) this.guns[this.weapon].visible = false;
    this.weapon = id;
    let g = this.guns[id];
    if (!g) {
      try { g = createDisplayGun(id); } catch { try { g = createDisplayGun(id === 'pistol' || id === 'revolver' ? 'pistol' : 'm4a1'); } catch { g = new THREE.Group(); } }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      this.mount.add(g);
      const box = new THREE.Box3().setFromObject(g);
      g.userData.muzzle = V(0, Math.min(0.035, box.max.y * 0.6), Number.isFinite(box.min.z) ? box.min.z : -0.2);
      g.userData.len = Number.isFinite(box.min.z) ? box.max.z - box.min.z : 0.3;
      this.guns[id] = g;
    }
    g.visible = true;
    this.muzzle.copy(g.userData.muzzle);
    this.flash.position.copy(this.muzzle);
    this.beam.position.set(0, this.muzzle.y - 0.02, this.muzzle.z * 0.6);
    this.lamp.position.copy(this.beam.position);
    this.hold = HOLD[id] || (g.userData.len > 0.5 ? { kind: 'rifle', support: V(0, -0.03, -g.userData.len * 0.36), stock: 0.3 } : HOLD.pistol);
  }

  // 開火:後座 + 槍口火光
  fire() {
    this.kick = Math.min(1.4, this.kick + (this.hold?.kind === 'pistol' ? 1 : 0.7));
    this.flashT = 0.05;
    this.flash.material.rotation = Math.random() * 6.28;
    const s = this.hold?.kind === 'pistol' ? 0.16 : 0.24;
    this.flash.scale.set(s * (0.8 + Math.random() * 0.4), s * (0.8 + Math.random() * 0.4), 1);
  }
  muzzleWorld(out) { this.mount.updateWorldMatrix(true, false); return out.copy(this.muzzle).applyMatrix4(this.mount.matrixWorld); }

  drawPlate(hp, maxHp, downed, extra = '') {
    const key = `${this.name}|${Math.ceil(hp)}|${downed}|${this.team}|${extra}`;
    if (key === this._plateKey) return;
    this._plateKey = key;
    const c = this.plateC, x = c.getContext('2d');
    x.clearRect(0, 0, 512, 128);
    x.font = 'bold 44px "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 7;
    x.strokeStyle = 'rgba(0,0,0,0.85)';
    const label = downed ? `✚ ${this.name}` : this.name;
    x.strokeText(label, 256, 40, 500);
    x.fillStyle = downed ? '#ff6a5a' : this.team ? '#bfe9ff' : '#ffb0a0';
    x.fillText(label, 256, 40, 500);
    if (this.team) {
      const f = clamp(hp / (maxHp || 100), 0, 1);
      x.fillStyle = 'rgba(0,0,0,0.7)';
      x.fillRect(136, 82, 240, 20);
      x.fillStyle = downed ? '#c0392b' : f > 0.6 ? '#4cd964' : f > 0.3 ? '#ffb02e' : '#ff3b30';
      x.fillRect(139, 85, 234 * f, 14);
      if (extra) { x.font = 'bold 30px sans-serif'; x.fillStyle = '#ffd84a'; x.strokeText(extra, 256, 116); x.fillText(extra, 256, 116); }
    }
    this.plateT.needsUpdate = true;
  }

  setVisible(on) {
    this.visible = on;
    this.root.visible = on;
    this.plate.visible = on;
  }

  // s:取樣後的狀態 {x,y,z,yaw,pitch,vx,vz,flags,hp};cam:本機鏡頭(名牌與陰影距離)
  update(dt, s, cam) {
    this.t += dt;
    if (!this.v.external && (this._upT -= dt) <= 0) { this._upT = 1; if (survivorUpgraded(this.look)) this._setModel(survivorVariant(this.look)); }
    const b = this.b, root = this.root;
    const alive = (s.flags & F.ALIVE) && !(s.flags & F.DEAD);
    const downed = !!(s.flags & F.DOWNED) && alive;
    const sprint = !!(s.flags & F.SPRINT) && alive && !downed;
    const reloading = !!(s.flags & F.RELOAD);
    const reviving = !!(s.flags & F.REVIVE) && alive && !downed;
    this.downB = damp(this.downB, downed ? 1 : 0, 6, dt);
    this.sprintB = damp(this.sprintB, sprint ? 1 : 0, 7, dt);
    this.reviveB = damp(this.reviveB, reviving ? 1 : 0, 7, dt);
    this.reloadB = damp(this.reloadB, reloading ? 1 : 0, 7, dt);
    this.kick *= Math.exp(-dt * 16);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = true; } else this.flash.visible = false;
    const light = !!(s.flags & F.LIGHT) && alive;
    this.beam.visible = light;
    this.lamp.visible = light;

    // ---- 根節點 ----
    root.position.set(s.x, s.y, s.z);
    const yaw = s.yaw + Math.PI;
    root.rotation.order = 'YXZ';

    // ---- 死亡:往後倒,躺在地上 ----
    if (!alive) {
      if (this.deadT < 0) { this.deadT = 0; this.deadSide = Math.random() < 0.5 ? 1 : -1; }
      this.deadT += dt;
      this._dead(yaw);
      this._plate(s, cam, false);
      return;
    }
    this.deadT = -1;
    root.rotation.set(0, yaw, 0);
    this.mount.visible = true;

    // ---- 移動方向(角色座標) ----
    const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
    const fwd = -s.vx * sin - s.vz * cos, side = s.vx * cos - s.vz * sin;
    const sp = Math.hypot(s.vx, s.vz) * (1 - this.downB);
    this.speed = sp;
    const moving = sp > 0.25;
    const back = moving && fwd < -0.35 * sp;
    const ma = Math.atan2(side, back ? -fwd : fwd); // 相對前進(或後退)方向的偏角,正 = 往右
    this.hipYaw = damp(this.hipYaw, moving ? -clamp(ma, -1.05, 1.05) * (back ? -1 : 1) * 0.85 : 0, 8, dt);

    // ---- 步態 ----
    const run = clamp((sp - 2.2) / 2.5, 0, 1);
    const amp = moving ? lerp(0.32, 0.72, run) : 0;
    const prev = this.ph;
    this.ph += ((back ? -1 : 1) * dt * Math.PI * sp) / (2 * (this.legT + this.legS) * Math.sin(Math.max(amp, 0.12)));
    const n = Math.floor((this.ph + Math.PI / 2) / Math.PI);
    if (n !== this.stepN) { this.stepN = n; if (moving && this.onStep) this.onStep(root.position, sprint); }
    if (!moving) this.ph = prev + wrapA(Math.round(prev / Math.PI) * Math.PI - prev) * Math.min(1, dt * 6); // 停下時雙腳收回
    this._resetPose();
    const crouch = 0.05 + run * 0.06 + this.reviveB * 0.55;
    const ext = this._legs(this.ph, amp, lerp(0.5, 1.4, run) * (moving ? 1 : 0), crouch);
    b.hips.position.y = this.hipY - (this.legT + this.legS - ext) - this.reviveB * 0.18;
    if (this.reviveB > 0.01) { // 單膝跪地
      const k = this.reviveB;
      b.thighR.rotation.x = lerp(b.thighR.rotation.x, 0.25, k); b.shinR.rotation.x = lerp(b.shinR.rotation.x, 1.9, k);
      b.thighL.rotation.x = lerp(b.thighL.rotation.x, -1.25, k); b.shinL.rotation.x = lerp(b.shinL.rotation.x, 1.35, k);
      b.footR.rotation.x = lerp(b.footR.rotation.x, 0.9, k);
    }
    const sway = Math.sin(this.ph) * (moving ? 0.06 + run * 0.05 : 0);
    b.hips.rotation.set(0, this.hipYaw + sway * 0.8, -sway * 0.5);
    // 呼吸
    const breathe = Math.sin(this.t * 1.7) * 0.012;

    // ---- 上半身:抵銷髖部旋轉、分攤俯仰 ----
    const pitch = clamp(s.pitch, -1.3, 1.3) * (1 - this.downB * 0.4);
    const leanF = 0.04 + run * 0.12 + this.sprintB * 0.12 + this.reviveB * 0.35;
    const counter = -(this.hipYaw + sway * 0.8);
    b.spine.rotation.set(leanF - pitch * 0.22 + breathe, counter * 0.45, sway * 0.4);
    b.chest.rotation.set(-pitch * 0.22 - breathe * 0.5, counter * 0.55, -sway * 0.2);
    b.neck.rotation.set(-pitch * 0.22, 0, 0);
    b.head.rotation.set(-pitch * 0.3 - leanF * 0.6, 0, 0);

    // ---- 倒地:坐在地上、往後靠、左手撐地 ----
    const D = this.downB;
    if (D > 0.01) {
      b.hips.position.y = lerp(b.hips.position.y, this.hipY * 0.2, D);
      b.hips.position.z = lerp(b.hips.position.z, -0.06, D);
      b.hips.rotation.x = lerp(b.hips.rotation.x, -0.25, D);
      for (const [L, sg] of [['L', 1], ['R', -1]]) {
        b['thigh' + L].rotation.set(lerp(b['thigh' + L].rotation.x, -1.3, D), sg * 0.18 * D, sg * 0.12 * D);
        b['shin' + L].rotation.x = lerp(b['shin' + L].rotation.x, L === 'L' ? 0.25 : 0.9, D);
        b['foot' + L].rotation.x = lerp(b['foot' + L].rotation.x, 0.35, D);
      }
      b.spine.rotation.x = lerp(b.spine.rotation.x, -0.3 - pitch * 0.1, D);
      b.chest.rotation.x = lerp(b.chest.rotation.x, 0.05 - pitch * 0.15, D);
      b.head.rotation.x = lerp(b.head.rotation.x, 0.15 - pitch * 0.35, D);
    }
    root.updateMatrixWorld(true);

    // ---- 槍的目標姿勢(角色座標)----
    const hold = this.hold || HOLD.pistol;
    const pistolLike = hold.kind === 'pistol' || D > 0.5;
    const ap = pitch + this.kick * (pistolLike ? 0.22 : 0.1);
    const d = _v[0].set(0, Math.sin(ap), Math.cos(ap));
    const up = _v[1].set(0, Math.cos(ap), -Math.sin(ap));
    // 肩膀中點(角色座標)
    const shR = this.armR.up.getWorldPosition(_v[2]), shL = this.armL.up.getWorldPosition(_v[3]);
    const piv = _v[4].addVectors(shR, shL).multiplyScalar(0.5);
    this.root.worldToLocal(piv);
    const grip = _v[5];
    if (pistolLike) grip.copy(piv).addScaledVector(d, 0.44 - this.kick * 0.05).addScaledVector(up, 0.02).add(_v[6].set(-0.02, 0, 0));
    else grip.copy(piv).add(_v[6].set(-this.sw * 0.55, 0, 0)).addScaledVector(d, (hold.stock ?? 0.3) - this.kick * 0.06).addScaledVector(up, 0.07);
    // 槍的朝向:槍 -Z = d、槍 +Y = up
    const gz = _v[6].copy(d).negate(), gx = _v[7].crossVectors(up, gz);
    const gunQ = _q[0].setFromRotationMatrix(_m.makeBasis(gx, up, gz));
    // 衝刺:槍斜放胸前(步槍)或垂在身側(手槍)
    const S = this.sprintB;
    if (S > 0.01) {
      const sq = _q[1].setFromEuler(_e.set(pistolLike ? 1.0 : 0.75, pistolLike ? 0.1 : -0.8, pistolLike ? 0 : 0.35));
      gunQ.slerp(sq, S);
      grip.lerp(_v[8].set(pistolLike ? -0.2 : -0.04, this.shoulderY - (pistolLike ? 0.5 : 0.28), pistolLike ? 0.12 : 0.24), S);
    }
    // 換彈:槍往下、側傾
    const R = this.reloadB;
    if (R > 0.01) {
      gunQ.multiply(_q[1].setFromEuler(_e.set(0.35 * R, 0, 0.55 * R)));
      grip.y -= 0.09 * R;
      grip.z -= 0.05 * R;
    }
    // 救援:槍放低
    if (this.reviveB > 0.01) {
      gunQ.slerp(_q[1].setFromEuler(_e.set(1.1, -0.4, 0.2)), this.reviveB);
      grip.lerp(_v[8].set(-0.15, b.hips.position.y + 0.15, 0.2), this.reviveB);
    }
    // 轉成世界座標
    const rootQ = root.quaternion;
    const gripW = root.localToWorld(_v[9].copy(grip));
    const gunQW = _q[2].copy(rootQ).multiply(gunQ);
    // 右手
    const handRQ = _q[3].copy(gunQW).multiply(GUN_IN_HAND_INV);
    const wristR = _v[10].copy(GUN_IN_HAND_POS).applyQuaternion(handRQ).negate().add(gripW);
    this._ik(this.armR, wristR, _v[11].set(-0.7, -0.8, -0.35), handRQ);
    // 左手
    if (D > 0.5) { // 倒地:左手往後撐地
      b.upperArmL.rotation.set(0.75, 0, 0.35);
      b.forearmL.rotation.set(-0.25, 0, 0);
      b.handL.rotation.set(-0.9, 0, 0);
    } else if (S > 0.6 && pistolLike) { // 手槍衝刺:左手擺動
      const sw = Math.sin(this.ph + Math.PI) * 0.7;
      b.upperArmL.rotation.set(-sw, 0, 0.12);
      b.forearmL.rotation.set(-0.9, 0, 0);
    } else {
      const sup = hold.kind === 'pistol' && !pistolLike ? HOLD.pistol.support : pistolLike ? (HOLD[this.weapon]?.kind === 'pistol' ? hold.support : HOLD.pistol.support) : hold.support;
      const supW = _v[8].copy(sup);
      if (R > 0.05 && !pistolLike) supW.lerp(_v[10].set(0.02, -0.1 - 0.07 * Math.max(0, Math.sin(this.t * 3.2)), -0.06), R); // 換彈:左手去換彈匣
      supW.applyQuaternion(gunQW).add(gripW);
      const handLQ = pistolLike ? _q[4].copy(handRQ) : _q[4].copy(gunQW).multiply(LEFT_ON_FORE);
      const wristL = supW.sub(_v[10].copy(PALM_L).applyQuaternion(handLQ));
      this._ik(this.armL, wristL, _v[11].set(0.75, -0.75, -0.3), handLQ);
    }
    this._plate(s, cam, downed);
  }

  _plate(s, cam, downed) {
    const p = this.plate;
    p.position.set(s.x, s.y + (downed ? 1.15 : this.headH + 0.32), s.z);
    if (cam) {
      const d = cam.position.distanceTo(p.position);
      p.material.opacity = this.team ? clamp(1.3 - d / 70, 0.35, 1) : clamp(1.2 - d / 28, 0, 1);
      p.visible = this.visible && p.material.opacity > 0.02;
      this.mesh.castShadow = d < 16;
    }
  }

  _ik(arm, wrist, poleLocal, handQW) {
    const root = this.root;
    const S = arm.up.getWorldPosition(_v[2]);
    const dir = _v[3].subVectors(wrist, S);
    let d = dir.length();
    dir.divideScalar(d || 1);
    const a = arm.la, b = arm.lb;
    d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pole = _v[4].copy(poleLocal).applyQuaternion(root.quaternion);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = _v[5].copy(S).addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
    const T = _v[6].copy(S).addScaledVector(dir, d);
    const rootInv = _q[5].copy(root.quaternion).invert();
    // 上臂
    const dU = _v[7].subVectors(E, S).normalize().applyQuaternion(rootInv);
    const qU = _q[6].setFromUnitVectors(arm.restU, dU).premultiply(root.quaternion);
    arm.up.parent.getWorldQuaternion(_q[7]);
    arm.up.quaternion.copy(_q[7].invert().multiply(qU));
    // 前臂
    const dF = _v[7].subVectors(T, E).normalize().applyQuaternion(rootInv);
    const qF = _q[7].setFromUnitVectors(arm.restF, dF).premultiply(root.quaternion);
    arm.fo.quaternion.copy(_q[6].invert()).multiply(qF);
    // 手
    arm.ha.quaternion.copy(qF.invert()).multiply(handQW);
  }

  _resetPose() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) { L[i].rotation.set(0, 0, 0); L[i].position.copy(this.rest[i]); }
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head']) this.b[n].rotation.order = 'YXZ';
  }

  _legs(ph, amp, knee, crouch) {
    const b = this.b;
    let ext = 0;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const p = ph + k * Math.PI, c = Math.cos(p);
      const th = -amp * Math.sin(p) - crouch;
      const kn = knee * Math.pow(Math.max(0, c), 1.3) + crouch * 1.6 + 0.04;
      b['thigh' + L].rotation.set(th, s * 0.05, s * 0.035);
      b['shin' + L].rotation.x = kn;
      b['foot' + L].rotation.x = -(th + kn) * 0.85;
      ext = Math.max(ext, this.legT * Math.cos(th) + this.legS * Math.cos(th + kn));
    }
    return ext;
  }

  _dead(yaw) {
    const t = this.deadT, b = this.b, side = this.deadSide;
    this._resetPose();
    const u = clamp((t - 0.05) / 0.6, 0, 1);
    const e = u < 1 ? u * u : 1;
    this.root.rotation.set(-e * 1.45, yaw, 0);
    this.root.position.y += e * 0.12;
    b.hips.rotation.set(0, 0, 0);
    for (const L of ['L', 'R']) { b['thigh' + L].rotation.set(-0.15 - (1 - e) * 0.3, 0, 0); b['shin' + L].rotation.x = 0.25 + (1 - e) * 0.5; b['foot' + L].rotation.x = 0.4; }
    b.spine.rotation.set(-0.1, 0, 0); b.chest.rotation.set(-0.05, 0, 0); b.head.rotation.set(-0.3, side * 0.7 * e, 0);
    b.upperArmL.rotation.set(-2.2 * e, 0, 0.5); b.upperArmR.rotation.set(-2.0 * e, 0, -0.6);
    b.forearmL.rotation.x = -0.3; b.forearmR.rotation.x = -0.5;
    this.mount.visible = t < 0.4; // 槍脫手
    this.beam.visible = this.lamp.visible = false;
    this.flash.visible = false;
  }

  dispose() {
    this.mesh?.skeleton?.dispose(); // 每個實例的骨骼貼圖
    this.scene.remove(this.root);
    this.scene.remove(this.plate);
    this.plateT.dispose();
    this.plate.material.dispose();
    this.flash.material.dispose();
    this.lamp.material.dispose();
  }
}
