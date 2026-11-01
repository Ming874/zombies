import * as THREE from 'three';
import { sfx } from './audio.js';

const EYE = 1.65;
const RADIUS = 0.35;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(world.start.x, world.start.y || 0, world.start.z);
    this.yaw = 0; // 朝北(往醫院深處,-Z)
    this.pitch = 0;
    this.keys = {};
    this.hp = 100;
    this.maxHp = 100;
    this.coins = 0;
    this.speedNorm = 0;
    this.sprinting = false;
    this.bobT = 0;
    this.stepT = 0;
    this.recoilBank = 0;
    this.shake = 0;
    this.lastHurt = -10;

    // 手電筒
    this.flashlight = new THREE.SpotLight(0xfff1d6, 75, 30, 0.62, 0.95, 1.8);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.2;
    this.flashlight.shadow.camera.far = 28;
    this.flashlight.shadow.bias = -0.0004;
    this.flashlight.position.set(0.12, -0.08, 0);
    camera.add(this.flashlight);
    const target = new THREE.Object3D();
    target.position.set(0.12, -0.08, -5);
    camera.add(target);
    this.flashlight.target = target;
    this.flashOn = true;
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
    this.flashlight.visible = this.flashOn;
    sfx.dry();
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  kick(pitch, yawRand) {
    this.pitch = Math.min(1.45, this.pitch + pitch);
    this.recoilBank += pitch;
    this.yaw += (Math.random() - 0.5) * yawRand;
  }

  hurt(amount, t) {
    this.hp = Math.max(0, this.hp - amount);
    this.shake = 0.35;
    this.lastHurt = t;
    sfx.hurt();
  }

  update(dt, canMove) {
    let fx = 0, fz = 0;
    if (canMove) {
      if (this.keys.KeyW) fz -= 1;
      if (this.keys.KeyS) fz += 1;
      if (this.keys.KeyA) fx -= 1;
      if (this.keys.KeyD) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    this.sprinting = !!(this.keys.ShiftLeft || this.keys.ShiftRight) && fz < 0 && canMove;
    const speed = this.sprinting ? 5.4 : 3.3;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    this.vx = (this.vx || 0) + (wx * speed - (this.vx || 0)) * Math.min(1, dt * 10);
    this.vz = (this.vz || 0) + (wz * speed - (this.vz || 0)) * Math.min(1, dt * 10);
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    this.world.resolve(this.pos, RADIUS); // 水平碰撞 + 腳底貼地(上下樓梯、站上矮台)
    const sp = Math.hypot(this.vx, this.vz);
    this.speedNorm = Math.min(1, sp / 3.3);

    // 鏡頭擺動與腳步聲
    this.bobT += dt * sp * 1.9;
    const prev = this.stepT;
    this.stepT = Math.floor(this.bobT / Math.PI);
    if (this.stepT !== prev && sp > 1) sfx.step();

    // 後座力回復
    const rec = this.recoilBank * Math.min(1, dt * 5);
    this.recoilBank -= rec;
    this.pitch -= rec * 0.7;

    this.shake = Math.max(0, this.shake - dt);
    const bobY = Math.sin(this.bobT * 2) * 0.035 * this.speedNorm;
    const bobX = Math.cos(this.bobT) * 0.025 * this.speedNorm;
    const sh = this.shake * (Math.random() - 0.5) * 0.08;
    this.camera.position.set(this.pos.x + bobX * cos, this.pos.y + EYE + bobY + sh, this.pos.z - bobX * sin);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + sh, this.yaw, 0);
  }

  get eye() {
    return this.camera.position;
  }
}
