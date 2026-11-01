// 焦屍:全身焦黑、裂縫透出餘燼光,一直冒煙掉火星。熱收縮造成的「拳擊姿勢」(雙臂彎曲舉在胸前)、僵硬小碎步。
// 貼身抓人會燒傷(持續傷害),站在牠身邊 1.4m 內也會被熱浪燙到;爆炸傷害 ×2.2,子彈打焦殼(非頭部)×0.85。
import * as THREE from 'three';
import { sfx } from '../../audio.js';
import { K, lerp, env, rand, dot, localRel, trackState } from './kit.js';

const R = { dx: 0, dz: 0, dy: 0, d: 0 };
const _v = new THREE.Vector3();
const LEG_O = { toe: 0.12, wide: 0.07 }; // 步態參數(共用,不每幀配置)
const EMIT = ['chest', 'upperArmL', 'upperArmR', 'head', 'forearmL', 'forearmR', 'thighL', 'spine'];

export function init(z) { z._emT = Math.random() * 0.2; z._smT = Math.random() * 0.4; z._crT = rand(0.3, 1); }

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, world = ctx.world;
  let dealt = 0;
  switch (this.state) {
    case 'chase':
      w.speed *= 0.85 + 0.3 * Math.max(0, Math.sin(this.t * 1.7 + this.seed)); // 一頓一頓的
      if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); }
      if (dist < T.reach - 0.1 && this._canHit(world)) w.speed = 0;
      break;
    case 'attack':
      w.speed = dist > T.reach * 0.8 ? this.speed * 0.4 : 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(0.55) && dist < T.reach + 0.4 && this._canHit(world)) { dealt = T.dmg; K.say('bite', this.target.pos); if (this.target === ctx.player) this._cut = true; }
      if (this.st > 1.05) { this.go('chase'); this.attackCd = T.cd - 1.05; }
      break;
    default: this.go('chase');
  }
  return dealt;
}

export function dmgMul(z, m, part, hit) {
  if (hit && hit.explosive) return m * z.T.blastMul;
  return part === 'head' ? m : m * z.T.bulletMul;
}
let lastCtx = null;
export function death(z) {
  if (z.deathKind === 'kneel' && Math.random() < 0.6) z.deathKind = 'front';
  // 倒下時噴出一陣火星與煙
  const fx = lastCtx && lastCtx.game && lastCtx.game.wfx;
  if (!fx) return;
  for (let i = 0; i < 26; i++) fx.glow.spawn(z.pos.x + rand(-0.3, 0.3), z.pos.y + rand(0.4, 1.4), z.pos.z + rand(-0.3, 0.3), rand(-1.2, 1.2), rand(0.5, 2.6), rand(-1.2, 1.2), 4.2, 1.3, 0.25, rand(0.6, 1.4), rand(0.008, 0.016), z.pos.y, -1.2, 1.1);
  for (let i = 0; i < 6; i++) fx.smoke.spawn(z.pos.x + rand(-0.3, 0.3), z.pos.y + rand(0.3, 1.3), z.pos.z + rand(-0.3, 0.3), 0, 0.4, 0, 0.15, 0.7, 0.12, 0.11, 0.1, 0.4, rand(1.5, 2.5), 0.5, 1.5, 0.1);
}

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  lastCtx = ctx;
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
  const f = Math.min(1, sp / 1.2);
  const amp = 0.2 * f + 0.02; // 步子小、僵硬
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const ext = this._legs(ph, amp, 0.35 * f + 0.12, 0.16, LEG_O);
  this._hipsTo(ext);
  b.hips.rotation.z = Math.sin(ph) * 0.09 * f;
  b.hips.rotation.y = Math.sin(ph) * 0.06 * f;
  const grab = S === 'attack' ? env(st, 0.2, 0.5, 0.65, 1.0) : 0;
  b.spine.rotation.set(0.32 + grab * 0.3, -b.hips.rotation.y, -b.hips.rotation.z * 0.8);
  b.chest.rotation.set(0.18 + grab * 0.15, 0, Math.sin(this.t * 0.7) * 0.05);
  b.neck.rotation.x = 0.25;
  b.head.rotation.set(-0.35 + Math.sin(ph * 2) * 0.03 * f, 0, Math.sin(this.t * 0.5 + this.seed) * 0.15);
  this._look(toX, toZ, 0.7);
  // 拳擊姿勢:上臂往前抬、手肘彎曲、手握拳舉在胸前(肌腱熱收縮);抓人時往前撲抓
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? 'R' : 'L';
    let x = -0.75 + Math.sin(ph + k * Math.PI) * 0.06 * f, z = 0.28, el = 1.75, wr = 0.7;
    x = lerp(x, -1.8, grab); el = lerp(el, 0.5, grab); z = lerp(z, 0.4, grab);
    this._arm(L, s, x, z, el, wr);
  }
  b.jaw.rotation.x = 0.35 + Math.sin(this.t * 1.1) * 0.08 + grab * 0.3; // 嘴唇燒掉了,永遠露齒
  this._jaw(0.35);
  // 熱浪 + 燒傷(本機玩家)
  localRel(this, ctx, R);
  const near = R.d < this.T.burn.aura && Math.abs(R.dy) < 1.2 && ctx.player.alive !== false;
  if (near) dot(ctx, 'burn', this.T.burn.auraDps, 0.25);
  if (S === 'attack' && this.cross(0.55)) {
    const hit = this._proxy ? R.d < this.T.reach + 0.4 && Math.abs(R.dy) < 1.2 : !!this._cut;
    this._cut = false;
    if (hit) { dot(ctx, 'burn', this.T.burn.dps, this.T.burn.t); sfx.zSizzle?.(ctx.player.pos); }
  }
  trackState(this);
  this.rootY = 0;
  // 火星與煙(本機玩家 30m 內)
  if (R.d > 30 || Math.abs(R.dy) > 6) return;
  const fx = ctx.game && ctx.game.wfx;
  if (!fx) return;
  this._emT -= dt; this._smT -= dt; this._crT -= dt;
  if (this._emT <= 0) {
    this._emT = rand(0.05, 0.16) * (R.d > 14 ? 2 : 1);
    const bone = b[EMIT[(Math.random() * EMIT.length) | 0]];
    bone.getWorldPosition(_v);
    fx.glow.spawn(_v.x + rand(-0.08, 0.08), _v.y, _v.z + rand(-0.08, 0.08), rand(-0.3, 0.3), rand(0.6, 1.6), rand(-0.3, 0.3), 4.5, 1.4, 0.25, rand(0.8, 1.8), rand(0.006, 0.012), this.pos.y - 1, -0.9, 0.6);
  }
  if (this._smT <= 0) {
    this._smT = rand(0.25, 0.5);
    b.chest.getWorldPosition(_v);
    fx.smoke.spawn(_v.x + rand(-0.1, 0.1), _v.y + rand(-0.2, 0.3), _v.z + rand(-0.1, 0.1), rand(-0.1, 0.1), 0.35, rand(-0.1, 0.1), 0.12, 0.55, 0.14, 0.13, 0.12, 0.28, rand(1.5, 2.6), 0.45, 1.2, 0.15);
  }
  if (this._crT <= 0 && R.d < 14) { this._crT = rand(0.35, 0.9); K.say('zCrackle', this.vp); }
}
