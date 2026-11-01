// 潛行者:四肢細長,四腳著地像蜘蛛一樣爬,在室內會翻上天花板倒吊著爬(只是視覺:位置仍在地面導航上,
// 命中盒跟著骨架到天花板)。被手電筒照住會尖嘶、退開;繞到玩家背後或沒被注視時才從天花板落下撲擊。
// 狀態:chase 地面追擊、wander 天花板爬行、hit 天花板上被照到退開、knock 地面被照到退開、
//       fall 從天花板落下、leap 撲擊、recover 撲完、attack 爪擊
import { sfx } from '../../audio.js';
import { K, lerp, env, rand, sstep, clamp, TAU, litBy, trackState, entered, paced, pacedDone } from './kit.js';

const CEIL = { wander: 1, hit: 1 };
const THIGH = ['thighL', 'thighR'], SHIN = ['shinL', 'shinR'], FOOT = ['footL', 'footR'];
const FALL_T = 0.42, LEAP_T = 0.5;
// 四足姿勢參數(可在測試時調整)
export const Q = {
  hipH: 0.78, hipZ: -0.3, tilt: -0.12, spine: 0.1, chest: 0.05, neck: -0.95, head: -0.35,
  armF: -2.5, armB: -1.9, armZ: 0.35, elS: 0.15, elW: 0.9, lift: 0.45,
  legF: -1.8, legB: -1.25, legZ: 0.22, knee: 0.75, kneeW: 1.5,
};
(globalThis.__Z3Q ||= {}).stalker = Q; // 除錯:測試頁可直接調整姿勢參數

export function init(z) { z._ceil = 0; z._ceilH = 3.3; z._ceilT = 0; z._litT = 0; z._litQ = 0; z._isLit = false; z._flee = 0; z.specialCd = rand(0.5, 2); }

function ceilingHere(z, world) {
  if ((z._ceilT -= 0.016) > 0) return z._ceilH;
  z._ceilT = 0.4;
  const c = world.ceilAt ? world.ceilAt(z.pos.x, z.pos.z, z.pos.y) - z.pos.y : Infinity;
  z._ceilH = c > 2.2 && c < 4.6 ? c : 0;
  return z._ceilH;
}
// 玩家有沒有在看牠(視線方向與玩家→牠的夾角)
function watched(p, z) {
  const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
  return -(dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / d > 0.35; // 約 ±70°
}
const lit = (z, p, world) => litBy(p, world, z.pos.x, z.pos.y + (CEIL[z.state] ? z._ceilH - 0.4 : 0.6), z.pos.z, z.T.lit.cone, z.T.lit.range);

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, Pn = T.pounce, world = ctx.world, p = this.target;
  let dealt = 0;
  const hd = this.dist || 1e-3;
  const ch = ceilingHere(this, world);
  // 手電筒:持續照到 0.2 秒就退開
  // 手電筒(視線射線較貴:每 0.1 秒判斷一次)
  if ((this._litQ -= dt) <= 0) { this._litQ = 0.1; this._isLit = (this.state === 'chase' || this.state === 'wander') && hd < T.lit.range && lit(this, p, world); }
  const isLit = this._isLit && (this.state === 'chase' || this.state === 'wander');
  this._litT = isLit ? this._litT + dt : Math.max(0, this._litT - dt * 2);
  switch (this.state) {
    case 'chase':
      w.speed = this.speed;
      if (this._litT > 0.2) { this.go('knock'); this._flee = T.lit.flee; break; }
      // 室內、離得遠、沒被照:翻上天花板
      if (ch && dist > 5.5 && this.specialCd <= 0 && !isLit) { this.go('wander'); this.specialCd = 1; break; }
      if (this.los && this.line === 1 && dist > Pn.min && dist < Pn.max && this.specialCd <= 0 && !watched(p, this)) { leap(this, toX, toZ, hd); break; }
      if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); }
      if (dist < T.reach - 0.15 && this._canHit(world)) w.speed = 0;
      break;
    case 'wander': // 天花板上爬:沿導航場前進;到了露天處或很近且背對牠 → 落下
      w.speed = this.speed * 0.95;
      if (this._litT > 0.2) { this.go('hit'); this._flee = T.lit.flee; break; }
      // 落下撲人算一次「天花板掉落」驚嚇:跟伏擊共用導演的節奏(被拒絕就繼續在頭頂上跟著,最多等 6 秒;貼到 1.5m 內一定掉)
      if (!ch || dist < 1.5 || (dist < Pn.max && (!watched(p, this) || dist < 2.4) && this.st > 0.6 && paced(this, ctx, 'ceilingDrop', dt))) { this.go('fall'); if (ch) pacedDone(this, ctx, 'ceilingDrop'); }
      break;
    case 'hit': case 'knock': { // 被照到:尖嘶、往反方向逃一陣子
      w.x = -toX / hd; w.z = -toZ / hd; w.speed = this.speed * 1.15;
      if (this.st < 0.25) w.speed = 0;
      if (this.st > this._flee) { this.go(this.state === 'hit' && ch ? 'wander' : 'chase'); this.specialCd = rand(0.8, 2); this._litT = 0; }
      break;
    }
    case 'fall':
      w.speed = 0;
      w.face = Math.atan2(toX, toZ);
      if (this.st > FALL_T) { if (dist < Pn.max + 0.5 && this.line === 1) leap(this, toX, toZ, hd); else { this.go('recover'); } }
      break;
    case 'leap': {
      const L = this.leap;
      w.face = Math.atan2(L.x, L.z);
      if (this.st < 0.12) { w.speed = 0; break; } // 蓄勢
      w.x = L.x; w.z = L.z; w.speed = Pn.speed; w.instant = true;
      if (!L.hit && dist < 1.0 && this._canHit(world)) { L.hit = true; dealt = Pn.dmg; p.knock?.(L.x * 5, L.z * 5); K.say('bite', p.pos); }
      if (this.st > LEAP_T || (this.blocked && this.st > 0.2)) this.go('recover');
      break;
    }
    case 'recover':
      w.speed = this.speed * 0.15;
      if (this.st > 0.55) { this.go('chase'); this.specialCd = lerp(Pn.cd[0], Pn.cd[1], Math.random()); }
      break;
    case 'attack':
      w.speed = 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(0.4) && dist < T.reach + 0.35 && this._canHit(world)) { dealt = T.dmg; K.say('bite', p.pos); }
      if (this.st > 0.75) { this.go('chase'); this.attackCd = T.cd - 0.75; }
      break;
    default: this.go('chase');
  }
  return dealt;
}
function leap(z, toX, toZ, hd) {
  const L = z.leap || (z.leap = { x: 0, z: 0, hit: false });
  L.x = toX / hd; L.z = toZ / hd; L.hit = false;
  z.go('leap');
}

export function hurt(z, dmg) {
  if (CEIL[z.state] && dmg > 30 && Math.random() < 0.5) z.go('fall'); // 在天花板上被重擊:掉下來
}
export function death(z) { z.deathKind = z._ceil > 0.5 ? 'front' : z.state === 'leap' ? 'front' : 'flat'; }

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, s0 = this.V.P.s, st = this.st, S = this.state;
  const ch = ceilingHere(this, ctx.world);
  // 天花板程度(0 地面 → 1 倒吊):上去時一躍翻身,落下時較快
  const want = CEIL[S] && ch ? 1 : 0;
  this._ceil += clamp(want - this._ceil, -dt / (S === 'fall' ? FALL_T * 0.8 : 0.45), dt / 0.5);
  const c = this._ceil, flip = sstep(0.15, 0.85, c);
  const sp = this.speedNow;
  const f = Math.min(1, sp / 2.6);
  this.ph += dt * TAU * Math.max(0.2, sp * 0.9) / 1.35 * (S === 'attack' ? 0.2 : 1);
  const ph = this.ph;
  const leapK = S === 'leap' ? env(st, 0.08, 0.16, LEAP_T - 0.1, LEAP_T) : 0;
  const crouchK = S === 'leap' ? env(st, 0, 0.06, 0.1, 0.16) : S === 'fall' ? env(st, FALL_T - 0.15, FALL_T, 9, 10) : 0;
  const recoil = S === 'hit' || S === 'knock' ? env(st, 0, 0.08, 0.3, 0.55) : 0;
  // 身體:四腳著地,前高後低、背拱起
  b.hips.position.set(0, (Q.hipH - crouchK * 0.18 + leapK * 0.1) * s0, Q.hipZ * s0);
  b.hips.rotation.set(Math.PI / 2 - Q.tilt - leapK * 0.15 + recoil * 0.25, 0, Math.sin(ph) * 0.1 * f);
  b.spine.rotation.set(Q.spine + Math.sin(ph * 2) * 0.05 * f - recoil * 0.2, Math.sin(ph) * 0.12 * f, 0);
  b.chest.rotation.set(Q.chest, -Math.sin(ph) * 0.1 * f, Math.sin(ph) * 0.12 * f);
  b.neck.rotation.set(Q.neck + recoil * 0.4, 0, 0);
  // 倒吊時頭要反過來看玩家(脖子扭到不可能的角度)
  b.head.rotation.set(Q.head + Math.sin(this.t * 3.1) * 0.04 - recoil * 0.3, 0, Math.PI * flip * 0.85 + Math.sin(this.t * 0.7) * 0.12);
  this._look(toX, toZ, 0.9 * (1 - flip));
  // 對角步態:左前腳 + 右後腳一組
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? 'R' : 'L';
    const ua = ((((ph + k * Math.PI) % TAU) + TAU) % TAU) / TAU; // 0..1 支撐 0~0.6、擺動 0.6~1
    const stance = ua < 0.6, q = stance ? ua / 0.6 : (ua - 0.6) / 0.4;
    let ax = stance ? lerp(Q.armF, Q.armB, q) : lerp(Q.armB, Q.armF, sstep(0, 1, q));
    let el = stance ? Q.elS : lerp(Q.elS, Q.elW, Math.sin(Math.PI * q));
    ax = lerp(ax, -1.7, 1 - f); el = lerp(el, Q.elS, 1 - f);
    ax = lerp(ax, -2.8, leapK); el = lerp(el, 0.2, leapK);
    ax = lerp(ax, -1.2, recoil); el = lerp(el, 1.8, recoil);
    if (S === 'attack' && k === 0) { const u = env(st, 0.1, 0.3, 0.42, 0.7); ax = lerp(ax, -3.0, u); el = lerp(el, 0.3, u); }
    this._arm(L, s, ax, Q.armZ + (stance ? 0 : Q.lift * Math.sin(Math.PI * q) * 0.3), el, -0.5);
    // 後腳(與另一側前腳同步)
    const ul = ((((ph + (k ? 0 : Math.PI)) % TAU) + TAU) % TAU) / TAU;
    const st2 = ul < 0.6, q2 = st2 ? ul / 0.6 : (ul - 0.6) / 0.4;
    let lx = st2 ? lerp(Q.legF, Q.legB, q2) : lerp(Q.legB, Q.legF, sstep(0, 1, q2));
    let kn = st2 ? Q.knee : lerp(Q.knee, Q.kneeW, Math.sin(Math.PI * q2));
    lx = lerp(lx, -1.55, 1 - f); kn = lerp(kn, Q.knee, 1 - f);
    lx = lerp(lx, -0.6, leapK); kn = lerp(kn, 0.2, leapK);
    lx = lerp(lx, -2.2, crouchK); kn = lerp(kn, 2.2, crouchK);
    b[THIGH[k]].rotation.set(lx, s * 0.2, s * Q.legZ);
    b[SHIN[k]].rotation.x = kn;
    b[FOOT[k]].rotation.x = 0.9;
  }
  b.jaw.rotation.x = 0.35 + Math.sin(this.t * 6) * 0.08 + recoil * 0.6 + leapK * 0.5 + (S === 'attack' ? 0.4 : 0);
  this._jaw(0.35);
  // 倒吊:整個翻過來貼著天花板(落下時順勢翻回來)
  this.rootRoll = Math.PI * flip;
  this.rootY = (ch || 3.3) * c;
  this.rootPitch = S === 'leap' ? -0.15 * leapK : 0;
  if (entered(this, 'hit') || entered(this, 'knock')) sfx.zHiss?.(this.vp, 1);
  else if (entered(this, 'fall')) sfx.zHiss?.(this.vp, 0);
  trackState(this);
  // 爬行聲:手腳拍地/抓天花板(本機玩家 18m 內)
  const step = Math.floor(ph / Math.PI);
  if (step !== this._skN) { this._skN = step; if (sp > 0.5 && this.dist < 18) K.say('zSkitter', this.vp, c > 0.5); }
}
