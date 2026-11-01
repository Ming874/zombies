// 手術者:縫著手術刀刃的病患。弓著背、刀刃前伸地快步逼近,貼身時左右左三連斬(每刀命中都讓玩家流血),
// 連斬後收刀喘息(recover,受到的傷害 ×1.3)——對策:拉開距離、繞開它的正面,趁空檔集中火力。
import { sfx } from '../../audio.js';
import { K, lerp, env, rand, dot, entered, trackState, localRel } from './kit.js';

const COMBO_T0 = 0.32; // 第一刀命中時間
const R = { dx: 0, dz: 0, dy: 0, d: 0 };
const LEG_O = { toe: 0.08, wide: 0.06 }; // 步態參數(共用,不每幀配置)

export function init(z) { z._scrapeT = rand(2, 5); }

const hitAt = (T, i) => COMBO_T0 + i * T.combo.gap;
const comboEnd = (T) => hitAt(T, T.combo.hits - 1) + 0.28;

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, world = ctx.world;
  let dealt = 0;
  switch (this.state) {
    case 'chase':
      if (dist < T.reach + 0.25 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); K.say('zAttack', this.type, this.vp); }
      if (dist < T.reach - 0.2 && this._canHit(world)) w.speed = 0;
      // 逼近時刀刃互刮的聲音(預警)
      if (dist < 9 && this.los && (this._scrapeT -= dt) <= 0) { this._scrapeT = rand(2.5, 5); sfx.zBlade?.(this.vp, 0); }
      break;
    case 'attack': {
      w.face = Math.atan2(toX, toZ);
      w.speed = this.st < comboEnd(T) - 0.1 && dist > 0.8 ? this.speed * 0.45 : 0; // 邊砍邊往前逼
      for (let i = 0; i < T.combo.hits; i++) {
        if (this.cross(hitAt(T, i))) {
          sfx.zBlade?.(this.vp, 1);
          if (dist < T.reach + 0.35 && this._canHit(world)) {
            dealt += T.dmg;
            if (this.target === ctx.player) this._cut = true; // 本機玩家:姿勢函式負責上流血
          }
        }
      }
      if (this.st > comboEnd(T)) this.go('recover');
      break;
    }
    case 'recover': // 收刀喘息:破綻
      w.speed = 0;
      if (this.st > 0.9) { this.go('chase'); this.attackCd = T.cd - 0.9; }
      break;
    case 'stagger':
      w.speed = 0;
      if (this.st > 0.5) this.go('chase');
      break;
    default: this.go('chase');
  }
  return dealt;
}

export function dmgMul(z, m) { return z.state === 'recover' ? m * 1.3 : m; }
export function hurt(z, dmg, part) { if (part === 'head' && dmg > 45 && z.state === 'chase') z.go('stagger'); }
export function death(z) { if (z.deathKind === 'kneel' && Math.random() < 0.5) z.deathKind = 'front'; }

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state, T = this.T;
  const f = Math.min(1, sp / 2);
  const amp = 0.42 * f + 0.03;
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const atk = S === 'attack', rec = S === 'recover' ? env(st, 0, 0.15, 0.6, 0.9) : 0;
  const stag = S === 'stagger' ? env(st, 0, 0.08, 0.25, 0.5) : 0;
  const ext = this._legs(ph, amp, 0.9 * f + 0.1, 0.18 + rec * 0.1, LEG_O);
  this._hipsTo(ext);
  b.hips.rotation.y = Math.sin(ph) * 0.16 * f;
  b.hips.rotation.z = Math.sin(ph) * 0.05 * f;
  // 弓背前傾、頭低著往上瞪
  const lean = 0.5 + 0.12 * f - rec * 0.2 - stag * 0.4;
  b.spine.rotation.set(lean * 0.6, -b.hips.rotation.y, -b.hips.rotation.z);
  b.chest.rotation.set(lean * 0.45, -b.hips.rotation.y * 0.5, 0);
  b.neck.rotation.x = -0.15;
  b.head.rotation.set(-0.45 + rec * 0.3, 0, Math.sin(this.t * 0.9) * 0.08);
  this._look(toX, toZ, 0.9);
  // 刀刃:平常往前外側張開(像要擁抱你);三連斬左右輪流從上斜劈到對側
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = k ? 'R' : 'L';
    let x = -0.95 + Math.sin(ph + k * Math.PI) * 0.15 * f + Math.sin(this.t * 1.4 + k * 2) * 0.05;
    let z = 0.55, el = 0.45, wr = 0.15;
    if (atk) {
      for (let i = k; i < T.combo.hits; i += 2) { // 左手第 0、2 刀,右手第 1 刀
        const h = hitAt(T, i);
        const up = env(st, h - 0.2, h - 0.08, h - 0.06, h), sw = env(st, h - 0.07, h, h + 0.05, h + 0.2);
        x = lerp(x, -2.4, up); z = lerp(z, 1.0, up); el = lerp(el, 0.9, up);
        x = lerp(x, -0.7, sw); z = lerp(z, -0.45, sw); el = lerp(el, 0.1, sw); wr = lerp(wr, -0.4, sw);
      }
    }
    x = lerp(x, -0.3, rec); z = lerp(z, 0.3, rec); el = lerp(el, 0.2, rec);
    this._arm(L, s, x, z, el, wr);
  }
  if (atk) { b.chest.rotation.y += Math.sin(st * 14) * 0.25 * env(st, 0.1, 0.2, comboEnd(T) - 0.2, comboEnd(T)); b.spine.rotation.x += 0.15; }
  b.jaw.rotation.x = 0.12 + (atk ? 0.4 : 0) + rec * 0.3 + Math.sin(this.t * 3) * 0.04;
  this._jaw(0.12);
  // 流血:房主由 AI 判定命中;代理端用距離/朝向近似(本機玩家)
  if (atk) for (let i = 0; i < T.combo.hits; i++) if (this.cross(hitAt(T, i))) bleedCheck(this, ctx);
  if (entered(this, 'recover')) sfx.zBreath?.(this.vp, this.type);
  trackState(this);
  this.rootY = 0;
}

function bleedCheck(z, ctx) {
  let hit = false;
  if (!z._proxy) { hit = !!z._cut; z._cut = false; }
  else {
    localRel(z, ctx, R);
    const fx = Math.sin(z.heading), fz = Math.cos(z.heading);
    hit = R.d < z.T.reach + 0.3 && Math.abs(R.dy) < 1.2 && (R.dx * fx + R.dz * fz) > R.d * 0.3 && ctx.player.alive !== false;
  }
  if (!hit) return;
  const B = z.T.bleed;
  dot(ctx, 'bleed', B.dps, B.t);
  const g = ctx.game;
  if (g && g.ui && (g._bleedMsgT || -99) < (g.time || 0) - 6) { g._bleedMsgT = g.time || 0; g.ui.feed?.('你被割傷了 · 流血中', { icon: 'skull', color: '#ff5a4a', ms: 2400 }); }
}
