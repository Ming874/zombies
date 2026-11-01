// 防護衣士兵:厚重的防護衣 + 防彈板(胸腹命中盒 = 護甲,×0.35;手腳 ×0.7),防毒面具是弱點(頭 ×2 × 1.4)。
// 步伐沉穩、不會踉蹌,透過面具的呼吸聲老遠就聽得到;近身一記重拳把人打退。死後掉落較好的物資。
import { sfx } from '../../audio.js';
import { DROP_TABLE } from '../../pickups.js';
import { K, lerp, env, rand, trackState, entered } from './kit.js';

// 掉落:大彈藥箱 + 高機率醫療包/手榴彈(pickups.roll 依類型查表)
DROP_TABLE.hazmat ||= { ammo: 0, med: 0.6, grenade: 0.45, big: true };

const LEG_O = { toe: 0.12, wide: 0.09 }; // 步態參數(共用,不每幀配置)

export function init(z) { z._breathT = rand(0.5, 2.5); }

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, world = ctx.world, p = this.target;
  let dealt = 0;
  switch (this.state) {
    case 'chase':
      if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); }
      if (dist < T.reach - 0.15 && this._canHit(world)) w.speed = 0;
      break;
    case 'attack':
      w.speed = 0;
      if (this.st < 0.5) w.face = Math.atan2(toX, toZ);
      if (this.cross(0.68) && dist < T.reach + 0.45 && this._canHit(world)) {
        dealt = T.dmg;
        const hd = this.dist || 1;
        p.knock?.((toX / hd) * 6, (toZ / hd) * 6);
        K.say('knock');
      }
      if (this.st > 1.35) { this.go('chase'); this.attackCd = T.cd - 1.35; }
      break;
    default: this.go('chase');
  }
  return dealt;
}

export function dmgMul(z, m, part) {
  if (part === 'head') return m * z.T.maskMul;
  if (part === 'arm' || part === 'leg') return m * 0.7;
  return m;
}
export function hurt(z, dmg, part) {
  if (part === 'head' && dmg > 20) sfx.zMaskHit?.(z.vp); // 打中面具:鏡片/濾罐的破裂聲,讓玩家知道打對地方
}

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
  const f = Math.min(1, sp / 1.1);
  const amp = 0.3 * f + 0.02;
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const atk = S === 'attack';
  const wind = atk ? env(st, 0.05, 0.5, 0.6, 0.7) : 0, punch = atk ? env(st, 0.6, 0.7, 0.85, 1.3) : 0;
  const ext = this._legs(ph, amp, 0.5 * f + 0.06, 0.1 + punch * 0.1, LEG_O);
  this._hipsTo(ext);
  // 重步:每步震動地面(遠處省略)
  const n = Math.floor((ph + Math.PI / 2) / Math.PI);
  if (n !== this._hstep) { this._hstep = n; if (f > 0.3 && this.dist < 20) K.say('stomp', this.vp); }
  b.hips.rotation.z = Math.sin(ph) * 0.07 * f;
  b.hips.rotation.y = Math.sin(ph) * 0.1 * f;
  b.spine.rotation.set(0.12 - wind * 0.15 + punch * 0.3, -b.hips.rotation.y * 0.8 + wind * 0.5 - punch * 0.6, -b.hips.rotation.z * 0.7);
  b.chest.rotation.set(0.06, -b.hips.rotation.y * 0.4 + wind * 0.3 - punch * 0.4, 0);
  b.neck.rotation.x = 0.12;
  b.head.rotation.set(-0.12 + Math.sin(ph * 2) * 0.02 * f, 0, 0);
  this._look(toX, toZ, 0.7);
  // 手臂:稍微張開(防護衣臃腫);右手揮拳
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? 'R' : 'L';
    let x = -Math.sin(ph + k * Math.PI) * 0.3 * f - 0.05, z = 0.22, el = 0.4;
    if (k === 1) { x = lerp(x, 0.4, wind); z = lerp(z, 0.5, wind); el = lerp(el, 1.9, wind); x = lerp(x, -1.55, punch); z = lerp(z, 0.05, punch); el = lerp(el, 0.15, punch); }
    else { x = lerp(x, -0.9, wind + punch); el = lerp(el, 1.4, wind + punch); }
    this._arm(L, s, x, z, el, 0.1);
  }
  b.jaw.rotation.x = 0.05;
  // 呼吸器:吸氣/吐氣(本機玩家 25m 內)
  this._breathT -= dt;
  if (this._breathT <= 0 && this.dist < 25) { this._breathT = rand(2.6, 3.6); K.say('zRespirator', this.vp); }
  if (entered(this, 'attack')) { /* 揮拳前的悶吼由 zAttack 處理 */ }
  trackState(this);
  this.rootY = 0;
}
