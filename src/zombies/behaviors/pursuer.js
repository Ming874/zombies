// 追獵者(追逐戰專用,由 src/zombies/chase.js 生成與收回):殺不死——子彈讓牠變慢、重擊/爆頭讓牠踉蹌;
// 沿導航場追(會上下樓梯)、推開/捶開關著的門、翻過矮障礙;抓到人 → 重傷 + 擊倒(由 chase.caught 結算),然後退回黑暗。
// 狀態:roar 現身咆哮、chase 追、attack 捶門、stagger 被重擊、stun 門在臉上被甩上、climb 翻越、grab 抓人、spawn 消失(收回)
import { K, lerp, env, clamp, entered, trackState } from './kit.js';

const VAULT_H = 1.05, VAULT_T = 0.55, ZR = 0.4;
const LEG_O = { toe: 0.06, wide: 0.06 }, CLIMB_O = { th: 0, kn: 0, toe: 0.05, wide: 0.12 };
const _vault = { x: 0, z: 0, top: 0 };
const ARM = ['L', 'R'];

export function init(z) { z._slow = 0; z._stgCd = 0; z._grabbed = false; z.specialCd = 0; }

export function think(dt, ctx, dist, toX, toZ, w) {
  const T = this.T, world = ctx.world;
  this._slow = Math.max(0, this._slow - dt * 0.9);
  this._stgCd -= dt;
  const slowK = 1 - 0.55 * Math.min(1, this._slow);
  let dealt = 0;
  const C = ctx.game?.chase, safeT = !!(C && C.isSafe && C.isSafe(this.target));
  // 追逐結束/目標已在安全處:不再抓人。逃進金水商行(chase 設 _bangT):追到店門口(不進店區)捶一下再退開;其他 → 直接退開
  if (this._retreat || safeT) {
    if (this._bangT > 0) {
      this._bangT -= dt;
      if (this._bangT <= 0) { C?.bang?.(this, true); this.go('recover'); return 0; } // 走不到店門口:不捶了(捲門照樣放下)
      if (this.state === 'chase') {
        const zn = this._stopZone, Zat = (x, z) => world.zoneAt?.(x, this.pos.y + 0.2, z)?.id === zn;
        if (Zat(this.pos.x + w.x * 1.3, this.pos.z + w.z * 1.3) || Zat(this.pos.x, this.pos.z) || this.blocked || dist < 2) { this._bangT = 0; this._bang = true; this.go('attack'); }
        else { w.speed = this.speed * slowK; return 0; }
      } else if (this.state === 'grab' || this.state === 'roar' || this.state === 'recover' || this.state === 'attack') { this.go('chase'); return 0; }
    }
    if (this.state === 'attack' && this._bang) { // 在店門口(不進店)捶一下,然後退開
      w.speed = 0; w.face = Math.atan2(toX, toZ);
      if (this.cross(0.3)) C?.bang?.(this);
      if (this.st > 1.1) { this._bang = false; this.go('recover'); }
      return 0;
    }
    if (!(this._bangT > 0) && this.state !== 'recover' && this.state !== 'spawn') { this._retreat = true; this.go('recover'); } // 踉蹌/暈眩/翻越中:讓動作做完
  }
  switch (this.state) {
    case 'roar': // 現身:咆哮(房主與代理都會播 roar)
      w.speed = 0;
      w.face = Math.atan2(toX, toZ);
      if (this.st > 1.25) this.go('chase');
      break;
    case 'chase': {
      // 看得到又靠近時爆發加速;子彈讓牠變慢
      w.speed = (this.los && dist < 7 ? T.burst : this.speed) * slowK;
      if (dist < T.reach + 0.1 && this._canHit(world)) { this.go('grab'); this._grabbed = false; break; }
      if (this.blocked && world.blockedBy) {
        const what = world.blockedBy(this.pos.x, this.pos.y, this.pos.z, w.x, w.z, Math.min(T.radius, ZR));
        if (what === 'box' && world.hitBox && world.hitBox.leaf) { this.go('attack'); break; } // 門擋住:捶門(doors.js 依推力把門撞開)
        if (world.vaultAhead && world.vaultAhead(this.pos.x, this.pos.y, this.pos.z, w.x, w.z, Math.min(T.radius, ZR), VAULT_H, _vault)) {
          const v = this.vault || (this.vault = { x0: 0, z0: 0, x1: 0, z1: 0, h: 0 });
          v.x0 = this.pos.x; v.z0 = this.pos.z; v.x1 = _vault.x; v.z1 = _vault.z; v.h = _vault.top - this.pos.y;
          this.go('climb');
        }
      }
      break;
    }
    case 'attack': // 捶門:門開了(不再被擋)或捶太久就回去追
      w.speed = this.speed * 0.4;
      if ((!this.blocked && this.st > 0.35) || this.st > 4) this.go('chase');
      break;
    case 'climb': // 翻越(位移由 zombie.js 的 _climbMove 處理)
      w.speed = 0;
      w.face = Math.atan2(this.vault.x1 - this.vault.x0, this.vault.z1 - this.vault.z0);
      if (this.st > VAULT_T) { this.rootY = 0; this.go('chase'); this.vel.x = Math.sin(this.heading) * this.speed; this.vel.z = Math.cos(this.heading) * this.speed; }
      break;
    case 'stagger': case 'stun':
      w.speed = 0;
      if (this.st > (this.state === 'stun' ? 1.0 : 0.55)) this.go('chase');
      break;
    case 'grab': // 撲抓:0.35 秒時判定(抓到 → chase.caught 結算傷害與擊倒)
      w.speed = this.st < 0.35 ? this.speed * 0.6 : 0;
      w.face = Math.atan2(toX, toZ);
      if (this.cross(0.35) && !this._grabbed) {
        this._grabbed = true;
        if (dist < T.reach + 0.45 && this._canHit(world)) dealt = ctx.game?.chase?.caught(this, this.target) || 0;
      }
      if (this.st > 1.1) this.go('chase');
      break;
    case 'recover': { // 追逐結束:停一下、轉身退開(chase.js 在沒人看著時讓牠消失)
      const hd = this.dist || 1e-3;
      w.x = -toX / hd; w.z = -toZ / hd; w.speed = this.st > 0.8 ? 2.2 : 0;
      if (this.st < 0.8) w.face = Math.atan2(toX, toZ);
      break;
    }
    case 'spawn': // 收回:隱身(chase.js 稍後移除)
      w.speed = 0;
      break;
    default: this.go('chase');
  }
  return dealt;
}

// 殺不死:傷害一律歸零,改成減速/踉蹌
export function dmgMul(z, m, part, hit) {
  const amt = (hit && hit.dmg) || 25;
  z._slow = Math.min(1.4, z._slow + amt / 120);
  if ((part === 'head' || amt > 70 || (hit && hit.explosive)) && z._stgCd <= 0 && (z.state === 'chase' || z.state === 'attack')) { z._stgCd = 2.2; z.go('stagger'); }
  z.flinchV += 2.5; z.rollV += (Math.random() - 0.5) * 4;
  return 0;
}
export function death() {}

// ======================= 動畫 =======================
export function pose(dt, ctx, dist, toX, toZ) {
  const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
  const f = clamp(sp / 4.2, 0, 1);
  const amp = lerp(0.3, 0.78, f) * Math.min(1, sp / 0.6 + 0.05);
  this._advance(dt, amp, sp);
  const ph = this.ph;
  const roar = S === 'roar' ? env(st, 0.05, 0.35, 1.0, 1.25) : 0;
  const pound = S === 'attack' ? 1 : 0;
  const stg = S === 'stagger' ? env(st, 0, 0.08, 0.3, 0.55) : S === 'stun' ? env(st, 0, 0.1, 0.7, 1.0) : 0;
  const grab = S === 'grab' ? env(st, 0.05, 0.3, 0.7, 1.1) : 0;
  const climb = S === 'climb' ? Math.sin(Math.PI * clamp(st / VAULT_T, 0, 1)) : 0;
  let o = LEG_O;
  if (climb) { o = CLIMB_O; o.th = -1.2 * climb; o.kn = 1.8 * climb; }
  const ext = this._legs(ph, climb ? 0 : amp, lerp(0.6, 1.7, f), 0.12 + f * 0.08 + stg * 0.15, o);
  this._hipsTo(ext);
  b.hips.rotation.y = Math.sin(ph) * 0.18 * f;
  b.hips.rotation.z = Math.sin(ph) * 0.06 * f;
  // 弓著背、頭往前探;跑起來整個人往前倒
  const lean = 0.35 + 0.4 * f - roar * 0.45 + grab * 0.25 - stg * 0.5;
  b.spine.rotation.set(lean * 0.6, -b.hips.rotation.y * 1.1, -b.hips.rotation.z);
  b.chest.rotation.set(lean * 0.45, -b.hips.rotation.y * 0.5, 0);
  b.neck.rotation.x = 0.1 - roar * 0.3;
  b.head.rotation.set(-0.35 - roar * 0.5 + stg * 0.5 + Math.sin(this.t * 2.3) * 0.05, 0, Math.sin(this.t * 1.3) * 0.08 + stg * 0.3);
  if (!roar && !stg) this._look(toX, toZ, 0.8);
  for (let k = 0; k < 2; k++) {
    const s = k ? -1 : 1, L = ARM[k];
    const sw = Math.sin(ph + k * Math.PI);
    // 右手(骨鋸)往前垂、左手擺動;咆哮時張開;捶門時輪流舉高砸下;撲抓時雙手往前
    let x = (k ? -0.55 : -0.25) + sw * 0.7 * f, z = 0.25 + (k ? 0.05 : 0.15), el = 0.5 + 0.4 * f;
    x = lerp(x, -0.6, roar); z = lerp(z, 1.0, roar); el = lerp(el, 0.6, roar);
    if (pound) { const u = 0.5 + 0.5 * Math.sin(st * 9 + k * Math.PI); x = lerp(-2.7, -1.2, u); z = 0.3; el = lerp(0.9, 0.2, u); }
    x = lerp(x, -1.75, grab); z = lerp(z, 0.25, grab); el = lerp(el, 0.25, grab);
    x = lerp(x, -1.1, climb); el = lerp(el, 0.3, climb);
    x = lerp(x, -0.2, stg); z = lerp(z, 0.45, stg);
    this._arm(L, s, x, z, el, 0.2);
  }
  b.jaw.rotation.x = 0.1 + roar * 0.9 + grab * 0.5 + f * 0.15;
  this._jaw(0.1);
  // 落地沉重的腳步(本機玩家 25m 內):每一步一記悶響
  const n = Math.floor((ph + Math.PI / 2) / Math.PI);
  if (n !== this._pstep) { this._pstep = n; if (f > 0.3 && this.dist < 25) K.say('stomp', this.vp); }
  if (entered(this, 'grab')) K.say('zAttack', this.type, this.vp);
  trackState(this);
  this.rootPitch = S === 'climb' ? climb * 0.3 : 0;
  if (S === 'climb') this.rootY = climb * ((this.vault ? this.vault.h : 0.9) + 0.1);
  else this.rootY = 0;
  // 收回:隱身
  this.root.visible = !(S === 'spawn' && st > 0.05);
}
