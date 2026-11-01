// 尖叫者:骨瘦如柴、下顎脫臼垂著。保持距離,看到玩家就蓄力尖叫:
//  - 召喚:附近(路徑 30m 內)的殭屍進入狂暴(加速、立刻重新找路衝向玩家),出怪計時器提前
//  - 暈眩:聽得到(11m 內、看得到)的本機玩家畫面模糊、視角飄移、耳鳴
// 對策:牠很脆弱(70 血),蓄力時被打中會中斷(stagger);被逼近時會往後退,太近才抓人
import * as THREE from 'three';
import { sfx } from '../../audio.js';
import { K, clamp, lerp, env, rand, entered, trackState, paced, pacedDone } from './kit.js';
import { daze } from './daze.js';

const ARM_L = 'L', ARM_R = 'R';
const LEG_O = { toe: 0.04, wide: 0.03 }; // 步態參數(共用,不每幀配置)

export function init(z) {
  z.specialCd = rand(1.5, 3);
  z._retreat = 0;
  z.jawSkew = (Math.random() - 0.5) * 0.5; // 脫臼的下顎歪向一邊
}

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, S = T.scream, world = ctx.world;
  let dealt = 0;
  switch (this.state) {
    case 'chase': {
      const hd = this.dist || 1e-3;
      if (this.los && this.d3 > S.min && this.d3 < S.max && this.specialCd <= 0) {
        if (paced(this, ctx, 'ambush', dt, 3)) { this.go('scream'); this.jawT = 0; break; }
        w.speed = 0; w.face = Math.atan2(toX, toZ); // 等靈異導演點頭(最多 3 秒):站著直勾勾地盯著你
        break;
      }
      if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); break; }
      // 被逼近又還在冷卻:往後退(保持距離),退一陣子就停
      if (this.los && dist < 6.5 && dist > 2.2 && this.specialCd > 1.2 && this._retreat < 2.2) {
        this._retreat += dt;
        w.x = -toX / hd; w.z = -toZ / hd; w.speed = this.speed * 0.85; w.face = Math.atan2(toX, toZ);
      } else if (dist > 7) this._retreat = Math.max(0, this._retreat - dt * 0.5);
      if (dist < T.reach - 0.1 && this._canHit(world)) w.speed = 0;
      break;
    }
    case 'scream':
      w.speed = 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(S.wind)) { call(this, ctx); pacedDone(this, ctx, 'ambush'); }
      if (this.st > S.dur) { this.go('chase'); this.specialCd = lerp(S.cd[0], S.cd[1], Math.random()); this._retreat = 0; }
      break;
    case 'attack':
      w.speed = dist > T.reach * 0.8 ? this.speed * 0.3 : 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(0.42) && dist < T.reach + 0.35 && this._canHit(world)) { dealt = T.dmg; K.say('bite', this.target.pos); }
      if (this.st > 0.8) { this.go('chase'); this.attackCd = T.cd - 0.8; }
      break;
    case 'stagger': // 尖叫被打斷
      w.speed = 0;
      if (this.st > 0.7) this.go('chase');
      break;
    default: this.go('chase');
  }
  return dealt;
}

// 召喚:附近的殭屍狂暴、改走最新的路;出怪提前
function call(z, ctx) {
  const S = z.T.scream, g = ctx.game;
  for (const o of ctx.zombies) {
    if (o === z || !o.alive || o._proxy || o.type === 'screamer') continue;
    const dx = o.pos.x - z.pos.x, dz = o.pos.z - z.pos.z, dy = o.pos.y - z.pos.y;
    if (dx * dx + dz * dz > S.call * S.call || Math.abs(dy) > 4.5) continue;
    frenzy(o, S.frenzy);
    o.alerted = true;
    o._repathT = 0; o._noProg = 0;
    if (o.state === 'idle') o.go('chase');
  }
  if (g && g.phase === 'fighting' && g.toSpawn > 0) { g.spawnTimer = Math.min(g.spawnTimer, 0.4); g.spawnBurst = (g.spawnBurst || 0) + 1; }
}
// 狂暴:暫時加速(由 frenzyTick 還原)
export function frenzy(o, t) {
  if (!(o._frenzyT > 0)) o._speed0 = o.speed;
  o._frenzyT = t;
  o.speed = o._speed0 * (o.type === 'brute' ? 1.25 : 1.45);
}
export function frenzyTick(o, dt) {
  if (!(o._frenzyT > 0)) return;
  o._frenzyT -= dt;
  if (o._frenzyT <= 0) o.speed = o._speed0;
}

export function hurt(z, dmg) {
  // 蓄力中被打:尖叫中斷(對策);已經叫出來了就不中斷
  if (z.state === 'scream' && z.st < z.T.scream.wind + 0.05 && dmg > 4) { z.go('stagger'); z.specialCd = 2.5; sfx.zPain?.(z.type, z.vp); }
}
export function death(z) { if (z.deathKind === 'kneel') z.deathKind = 'back'; }

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state, T = this.T;
  const f = Math.min(1, sp / 1.6);
  const amp = 0.34 * f + 0.03;
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const sc = S === 'scream';
  const wind = sc ? env(st, 0, T.scream.wind * 0.85, T.scream.wind, T.scream.wind + 0.12) : 0; // 蓄力:往後仰、吸氣
  const yell = sc ? env(st, T.scream.wind, T.scream.wind + 0.1, T.scream.dur - 0.35, T.scream.dur) : 0; // 尖叫:往前伸頸
  const stag = S === 'stagger' ? env(st, 0, 0.08, 0.35, 0.7) : 0;
  const ext = this._legs(ph, amp, 0.6 * f + 0.06, 0.1 + wind * 0.12 + stag * 0.2, LEG_O);
  this._hipsTo(ext);
  b.hips.rotation.z = Math.sin(ph) * 0.06 * f;
  b.hips.rotation.y = Math.sin(ph) * 0.14 * f;
  const lean = 0.32 + 0.1 * f;
  b.spine.rotation.set(lean - wind * 0.55 + yell * 0.35 - stag * 0.4, -b.hips.rotation.y * 0.8, Math.sin(this.t * 1.3) * 0.05);
  b.chest.rotation.set(0.15 - wind * 0.35 + yell * 0.15, -b.hips.rotation.y * 0.4, 0);
  b.neck.rotation.x = 0.35 - wind * 0.6 + yell * 0.25;
  b.head.rotation.set(-0.15 - wind * 0.5 - yell * 0.35 + Math.sin(ph * 2) * 0.04 * f, 0, Math.sin(this.t * 0.8) * 0.1);
  if (!sc) this._look(toX, toZ, 0.9);
  // 尖叫時全身發抖
  const shiver = yell * (Math.sin(this.t * 53) * 0.5 + Math.sin(this.t * 37) * 0.5);
  b.head.rotation.z += shiver * 0.05;
  b.chest.rotation.z += shiver * 0.03;
  // 手臂:垂得很長、手指張開;蓄力時往後張開,尖叫時向前伸出抓空氣
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? ARM_R : ARM_L;
    let x = -Math.sin(ph + k * Math.PI) * 0.4 * f + 0.1 + Math.sin(this.t * 1.7 + k) * 0.04;
    let z = 0.12, el = 0.15 + 0.1 * f;
    x = lerp(x, 0.55, wind); z = lerp(z, 0.75, wind); el = lerp(el, 0.4, wind);
    x = lerp(x, -1.25, yell); z = lerp(z, 0.55, yell); el = lerp(el, 0.15, yell);
    if (S === 'attack') { const u = env(st, k ? 0.2 : 0.1, k ? 0.38 : 0.3, 0.5, 0.8); x = lerp(x, -1.7, u); z = lerp(z, 0.2, u); el = lerp(el, 0.2, u); }
    this._arm(L, s, x, z, el, -0.3 - yell * 0.3);
  }
  // 脫臼的下顎:平常就垂著、歪一邊;尖叫時張到不可能的角度並往下脫
  const jawOpen = 0.55 + 0.12 * Math.sin(this.t * 2.3) + wind * 0.25 + yell * 0.85;
  b.jaw.rotation.set(jawOpen, 0, this.jawSkew * (1 + yell));
  b.jaw.position.y -= 0.012 + yell * 0.018;
  b.jaw.position.z += yell * 0.012;
  this._jaw(jawOpen);
  // 進入尖叫:聲音 + 暈眩(每一端各自判斷本機玩家)
  if (sc && this.cross(T.scream.wind)) shriek(this, ctx);
  else if (entered(this, 'scream')) { /* 蓄力的吸氣聲 */ sfx.zInhale?.(this.vp); }
  trackState(this);
  this.rootY = 0;
}

const _e = new THREE.Vector3();
function shriek(z, ctx) {
  sfx.zScream?.(z.vp);
  const g = ctx.game, p = ctx.player;
  if (!g || !p || p.alive === false) return;
  const S = z.T.scream;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z, dy = p.pos.y - z.pos.y;
  const d = Math.hypot(dx, dz) + Math.abs(dy) * 2;
  if (d > S.daze) return;
  _e.set(z.pos.x, z.pos.y + 1.5, z.pos.z);
  const seen = !ctx.world.hasLineOfSight || ctx.world.hasLineOfSight(_e.x, _e.y, _e.z, p.pos.x, p.pos.y + 1.5, p.pos.z);
  const k = clamp(1.15 - d / S.daze, 0, 1) * (seen ? 1 : 0.45);
  daze(g, k);
}
