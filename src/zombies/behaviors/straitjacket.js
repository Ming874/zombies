// 束縛病患:雙臂被拘束衣綁在胸前,只能用頭撞。走路忽快忽慢、搖搖晃晃;看到玩家且路線暢通時
// 蹲低(crouch,尖笑)→ 低頭狂奔衝撞(charge):撞到玩家擊退,撞開沿路的輕道具;撞上牆會暈眩(stun,受到傷害 ×1.6),
// 撞到窗戶會撞得玻璃碎屑四濺。對策:看到牠蹲低就往側邊閃,讓牠撞牆,再趁暈眩爆頭。
import * as THREE from 'three';
import { sfx } from '../../audio.js';
import { K, lerp, env, rand, sstep, trackState, entered } from './kit.js';

const ZR = 0.4;
// 綁住的雙臂姿勢參數(上臂前舉 ax、外展 az、內旋 ay、手肘 el、前臂扭轉 fy)
export const Q = { ax: -0.3, az: -0.05, ay: -0.3, el: 1.75, fz: -1.15 };
(globalThis.__Z3Q ||= {}).straitjacket = Q; // 除錯:測試頁可直接調整姿勢參數
const _imp = new THREE.Vector3();
const LEG_O = { toe: 0.06, wide: 0.05 }; // 步態參數(共用,不每幀配置)
const FOREARM = ['forearmL', 'forearmR'];

export function init(z) { z.specialCd = rand(1, 3); z._lurch = rand(0, 6); }

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, C = T.charge, world = ctx.world, p = this.target;
  let dealt = 0;
  switch (this.state) {
    case 'chase': {
      // 忽快忽慢的蹣跚:一陣衝刺、一陣拖步
      const u = Math.sin(this.t * 1.9 + this._lurch);
      w.speed *= u > 0.3 ? 1.55 : 0.75;
      if (this.los && this.line === 1 && dist > C.min && dist < C.max && this.specialCd <= 0) { this.go('crouch'); break; }
      if (dist < T.reach + 0.15 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); }
      if (dist < T.reach - 0.1 && this._canHit(world)) w.speed = 0;
      break;
    }
    case 'crouch': // 蓄力:蹲低、低頭對準
      w.speed = 0;
      w.face = Math.atan2(toX, toZ);
      if (this.st > 0.6) { const hd = this.dist || 1; this.charge = { x: toX / hd, z: toZ / hd, hit: false, pushT: 0 }; this.go('charge'); }
      break;
    case 'charge': {
      const ch = this.charge;
      w.x = ch.x; w.z = ch.z; w.instant = true;
      w.speed = C.speed * Math.min(1, 0.4 + this.st * 3);
      w.face = Math.atan2(ch.x, ch.z);
      const ph = ctx.game && ctx.game.physics;
      if (ph && ph.impulseAt && (ch.pushT -= dt) <= 0) { ch.pushT = 0.12; _imp.set(this.pos.x + ch.x * 0.8, this.pos.y + 0.8, this.pos.z + ch.z * 0.8); ph.impulseAt(_imp, 0.9, 3.5); }
      if (!ch.hit && dist < T.radius + 0.6 && this._canHit(world)) {
        ch.hit = true;
        dealt = C.dmg;
        p.knock?.(ch.x * 8, ch.z * 8);
        if (p === ctx.player) p.addShake?.(0.45);
        K.say('knock');
        this.go('recover');
      } else if (this.blocked && this.st > 0.2) {
        const what = world.blockedBy ? world.blockedBy(this.pos.x, this.pos.y, this.pos.z, ch.x, ch.z, Math.min(T.radius, ZR)) : 'cell';
        if (what === 'box' && ph && ph.impulseAt) { const b = world.hitBox; _imp.set((b.minX + b.maxX) / 2, this.pos.y + 0.6, (b.minZ + b.maxZ) / 2); ph.impulseAt(_imp, 1.6, 7); }
        this._glass = window_(world, this.pos, ch) ? 1 : 0; // 撞到窗戶(姿勢函式負責玻璃碎屑)
        this.go('stun');
      } else if (this.st > 1.7) this.go('recover');
      break;
    }
    case 'stun':
      w.speed = 0;
      if (this.st > 1.9) { this.go('chase'); this.specialCd = lerp(C.cd[0], C.cd[1], Math.random()); }
      break;
    case 'recover':
      w.speed = this.speed * 0.2;
      if (this.st > 0.7) { this.go('chase'); this.specialCd = lerp(C.cd[0], C.cd[1], Math.random()); }
      break;
    case 'attack': // 頭槌
      w.speed = dist > T.reach * 0.7 ? this.speed * 0.5 : 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(0.45) && dist < T.reach + 0.35 && this._canHit(world)) { dealt = T.dmg; K.say('knock'); }
      if (this.st > 0.9) { this.go('chase'); this.attackCd = T.cd - 0.9; }
      break;
    default: this.go('chase');
  }
  return dealt;
}
// 前方那格是不是窗
function window_(world, pos, ch) {
  const L = world.layout;
  if (!L || !L.flagsAt || !L.F) return false;
  const x = pos.x + ch.x * 0.9, z = pos.z + ch.z * 0.9;
  const li = L.levelOfY(pos.y + 0.3);
  return !!(L.flagsAt(li, Math.floor(x / L.CELL), Math.floor(z / L.CELL)) & L.F.WINDOW);
}

export function death(z) { if (z.state === 'charge') z.deathKind = 'front'; }

// ======================= 動畫 =======================
const _g = new THREE.Vector3();
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
  const run = S === 'charge';
  const f = Math.min(1, sp / (run ? 6 : 2));
  const amp = run ? 0.75 * f + 0.05 : 0.36 * f + 0.03;
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const crouch = S === 'crouch' ? sstep(0, 0.35, st) : 0;
  const stun = S === 'stun' ? env(st, 0, 0.2, 1.6, 1.9) : 0;
  const butt = S === 'attack' ? env(st, 0.2, 0.42, 0.5, 0.85) : 0;
  const ext = this._legs(ph, amp, run ? 1.5 : 0.7 * f + 0.06, 0.08 + crouch * 0.45 + stun * 0.15, LEG_O);
  this._hipsTo(ext);
  b.hips.rotation.y = Math.sin(ph) * (run ? 0.15 : 0.22) * f;
  b.hips.rotation.z = Math.sin(ph) * 0.1 * f + Math.sin(this.t * 2.3) * 0.04;
  // 沒有手臂可以平衡:上半身左右甩
  const lean = run ? 0.75 : 0.18 + crouch * 0.55;
  b.spine.rotation.set(lean * 0.6 - butt * 0.4 + stun * 0.2, -b.hips.rotation.y * 1.3, -b.hips.rotation.z * 1.6 + Math.sin(this.t * 3.1) * 0.06 + Math.sin(this.t * 2.6) * 0.25 * stun);
  b.chest.rotation.set(lean * 0.45 + butt * 0.2, -b.hips.rotation.y * 0.6, 0);
  b.neck.rotation.x = run ? 0.25 : 0.05 + crouch * 0.3;
  // 頭:衝撞時低頭(頭頂朝前);頭槌先往後仰再猛力往前
  const headX = run ? 0.65 : -0.15 + crouch * 0.5 - butt * 0.7 + env(st, 0.42, 0.48, 0.55, 0.8) * (S === 'attack' ? 1.3 : 0);
  b.head.rotation.set(headX + stun * 0.6, 0, Math.sin(this.t * 1.7) * 0.2 * (1 - crouch) + Math.sin(this.t * 7) * 0.12 * stun);
  if (!run && !stun) this._look(toX, toZ, 0.8);
  // 雙臂交叉綁在胸前(左右手掌搭在對側肩膀附近)
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? 'R' : 'L';
    this._arm(L, s, Q.ax - 0.06 * Math.sin(ph + k * Math.PI) * f - crouch * 0.3, Q.az, Q.el - k * 0.12, 0.2, Q.ay + k * 0.08);
    b[FOREARM[k]].rotation.z = s * Q.fz;
  }
  b.jaw.rotation.x = this.V.P.muzzle ? 0.02 : 0.2 + crouch * 0.6 + (run ? 0.5 : 0) + Math.sin(this.t * 5) * 0.06;
  if (!this.V.P.muzzle) this._jaw(0.2);
  if (entered(this, 'charge')) sfx.zCharge?.(this.vp);
  else if (entered(this, 'stun')) stunFx(this, ctx);
  trackState(this);
  this.rootY = 0;
  this.rootPitch = run ? 0.12 * f : 0;
}

// 撞牆:灰塵(撞到窗戶 → 玻璃碎屑 + 碎玻璃聲)
function stunFx(z, ctx) {
  sfx.wallImpact?.(z.vp);
  const fx = ctx.game && ctx.game.wfx;
  const hx = Math.sin(z.heading), hz = Math.cos(z.heading);
  _g.set(z.pos.x + hx * 0.45, z.pos.y + 1.5, z.pos.z + hz * 0.45);
  if (z._glass) sfx.zGlass?.(_g);
  if (!fx) return;
  const fl = fx.floor(_g.x, _g.y, _g.z);
  for (let i = 0; i < (z._glass ? 34 : 10); i++) {
    const s = rand(0.006, 0.022);
    if (z._glass) fx.debris.spawn(_g.x, _g.y + rand(-0.4, 0.4), _g.z, -hx * rand(0.5, 2.5) + rand(-1.5, 1.5), rand(0, 2.5), -hz * rand(0.5, 2.5) + rand(-1.5, 1.5), s, 0.002, s * 1.4, 0xb8d4dc, rand(1.5, 3), fl, 0.2, 0.3, 9.8, 20);
    else fx.smoke.spawn(_g.x, _g.y + rand(-0.3, 0.3), _g.z, rand(-0.5, 0.5), rand(0, 0.5), rand(-0.5, 0.5), 0.05, 0.4, 0.5, 0.48, 0.45, 0.15, rand(0.8, 1.5), 0.1, 2, 0.05);
  }
}
