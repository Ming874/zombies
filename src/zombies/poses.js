// 各種殭屍外觀的姿勢動畫(取自 test 分支的 zombie.js 與 behaviors/*.js,只保留外觀:走路、手臂、頭、下顎、攻擊動作)。
// 這裡的殭屍只有一種玩法(血量、速度、攻擊都相同),外觀類型只決定模型與身體語言。
// this = Zombie;狀態只有 'chase' / 'attack',this.st = 攻擊動畫時間(已依 HIT 換算,讓出手瞬間對上實際傷害的時間點)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const env = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t)); // 進場 a→b、退場 c→d 的包絡

// 攻擊動畫裡「打中」的時間點(秒);zombie.js 用它把 0.25 秒的出手時間對齊到動畫
export const HIT = { walker: 0.58, runner: 0.4, bloater: 0.5, brute: 0.7, screamer: 0.4, stalker: 0.3, surgeon: 0.32, burned: 0.55, hazmat: 0.7, straitjacket: 0.48 };

const RUN_O = { toe: 0.05, wide: 0.05 };

export const POSES = {
  walker(dt, toX, toZ) {
    const b = this.b, sp = this.speedNow, f = Math.min(1, sp / 0.8), st = this.st;
    const amp = 0.3 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.55 * f + 0.06, 0.07, { toe: 0.1, wide: 0.04 });
    this._hipsTo(ext);
    b.hips.rotation.z = Math.sin(ph) * 0.07 * f + (this.limpA ? -this.limpSide * 0.06 * Math.max(0, Math.sin(ph + (this.limpSide > 0 ? 0 : Math.PI))) : 0);
    b.hips.rotation.y = Math.sin(ph) * 0.12 * f;
    b.spine.rotation.set(this.lean * 0.6, -b.hips.rotation.y * 0.7, -b.hips.rotation.z * 0.8 + this.tilt * 0.15);
    b.chest.rotation.set(this.lean * 0.4 + 0.04 * Math.sin(ph * 2) * f, -b.hips.rotation.y * 0.4, 0);
    b.neck.rotation.x = 0.1;
    b.head.rotation.set(-0.08 + Math.sin(ph * 2) * 0.05 * f, 0, this.tilt + Math.sin(this.t * 0.7) * 0.09);
    this._look(toX, toZ, 0.8);
    const atk = this.state === 'attack';
    const raise = atk ? env(st, 0, 0.35, 0.75, 1.1) : 0;
    const clamp2 = atk ? env(st, 0.42, 0.56, 0.75, 1.05) : 0;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const reach = this.armStyle === 'reach' || (this.armStyle === 'one' && k === 0);
      let x, z, el, wr;
      if (reach) {
        x = -1.32 - 0.1 * Math.sin(this.t * 1.3 + k * 2) + Math.sin(ph + k * Math.PI) * 0.06 * f;
        z = 0.14; el = 0.25 + 0.08 * Math.sin(this.t * 1.7 + k); wr = 0.35;
      } else {
        x = -Math.sin(ph + k * Math.PI) * 0.32 * f + 0.06;
        z = 0.08; el = 0.2 + 0.15 * f; wr = 0.12;
      }
      x = lerp(x, -1.6, raise) + clamp2 * 0.1;
      z = lerp(z, 0.45, raise) - clamp2 * 0.62;
      el = lerp(el, 0.35, raise);
      this._arm(L, s, x, z, el, wr);
    }
    b.spine.rotation.x += clamp2 * 0.35;
    b.head.rotation.x += clamp2 * 0.35;
    b.jaw.rotation.x = 0.06 + clamp2 * 0.55 + raise * 0.2;
    this._jaw(0.06);
  },

  runner(dt, toX, toZ) {
    const b = this.b, sp = this.speedNow, st = this.st, atk = this.state === 'attack';
    const f = clamp(sp / 4, 0, 1);
    const amp = lerp(0.3, 0.82, f) * Math.min(1, sp / 0.6 + 0.05);
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const crouch = 0.1 + f * 0.08, lean = 0.2 + 0.35 * f;
    const ext = this._legs(ph, amp, lerp(0.6, 1.8, f), crouch, RUN_O);
    this._hipsTo(ext);
    b.hips.rotation.y = Math.sin(ph) * 0.2 * f;
    b.hips.rotation.z = Math.sin(ph) * 0.05 * f;
    b.spine.rotation.set(lean * 0.6, -b.hips.rotation.y * 1.2, -b.hips.rotation.z);
    b.chest.rotation.set(lean * 0.5, -b.hips.rotation.y * 0.6, 0);
    b.neck.rotation.x = 0.1;
    b.head.rotation.set(-lean * 0.8, 0, 0);
    // 抽搐:不定時的猛甩頭
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = 0.6 + Math.random() * 2.5; this.twitch = 1; this.twitchDir = (Math.random() - 0.5) * 2; }
    this.twitch = Math.max(0, this.twitch - dt * 5);
    b.head.rotation.z += this.twitch * this.twitchDir * 0.5 + Math.sin(this.t * 31) * 0.03;
    b.head.rotation.y += this.twitch * this.twitchDir * 0.3;
    this._look(toX, toZ, 0.7);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const sw = Math.sin(ph + k * Math.PI);
      let x = -0.35 + sw * 0.95 * f - 0.25 * f + Math.sin(this.t * 7 + k * 3) * 0.15;
      let z = 0.3 + 0.15 * Math.sin(ph * 2 + k), el = 0.9 + 0.5 * f;
      if (atk) { // 左右輪流爪擊
        const u = k ? env(st, 0.28, 0.45, 0.52, 0.7) : env(st, 0.0, 0.17, 0.24, 0.42);
        x = lerp(0.5, -1.9, u); z = lerp(0.6, 0.0, u) + 0.2; el = lerp(1.0, 0.2, u);
      }
      this._arm(L, s, x, z, el, 0.25);
    }
    if (atk) { b.spine.rotation.x += 0.2; b.chest.rotation.y += Math.sin(st * 9) * 0.25; }
    b.jaw.rotation.x = 0.22 + Math.sin(this.t * 9) * 0.1;
    this._jaw(0.2);
  },

  bloater(dt, toX, toZ) {
    const b = this.b, sp = this.speedNow, st = this.st;
    const f = Math.min(1, sp / 0.7);
    const amp = 0.2 * f + 0.02;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.35 * f + 0.05, 0.08, { toe: 0.25, wide: 0.1 });
    this._hipsTo(ext);
    const bump = this.state === 'attack' ? env(st, 0.25, 0.5, 0.6, 0.95) : 0;
    b.hips.rotation.z = Math.sin(ph) * 0.15 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.08 * f;
    b.spine.rotation.set(-0.1 + bump * 0.3, -b.hips.rotation.y, -b.hips.rotation.z * 0.6);
    b.chest.rotation.set(0.05, 0, 0);
    b.neck.rotation.x = 0.15;
    b.head.rotation.set(-0.05, 0, Math.sin(this.t * 0.6) * 0.15);
    this._look(toX, toZ, 0.6);
    b.belly.scale.setScalar(1 + 0.04 * Math.sin(this.t * 2.2) + 0.03 * Math.sin(ph * 2) * f);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      this._arm(L, s, -0.2 + Math.sin(ph + k * Math.PI) * 0.12 * f - bump * 0.9, 0.5 + 0.04 * Math.sin(this.t + k), 0.6 + bump * 0.3, 0.2);
    }
    b.jaw.rotation.x = 0.1;
    this._jaw(0.1);
  },

  brute(dt, toX, toZ) { // 攻擊 = 雙手高舉往下砸
    const b = this.b, sp = this.speedNow, st = this.st, atk = this.state === 'attack';
    const f = Math.min(1, sp / 1.1);
    const amp = 0.28 * f + 0.02;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const raise = atk ? env(st, 0.05, 0.6, 0.66, 0.76) : 0;
    const smash = atk ? env(st, 0.66, 0.76, 1.0, 1.4) : 0;
    const ext = this._legs(ph, amp, 0.55 * f + 0.05, 0.16 + smash * 0.25, { toe: 0.15, wide: 0.1 });
    this._hipsTo(ext);
    b.hips.rotation.z = Math.sin(ph) * 0.08 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.12 * f;
    b.spine.rotation.set(0.28 - raise * 0.25 + smash * 0.6, -b.hips.rotation.y, -b.hips.rotation.z);
    b.chest.rotation.set(0.18 + 0.03 * Math.sin(ph * 2) * f - raise * 0.15 + smash * 0.35, -b.hips.rotation.y * 1.2, 0);
    b.neck.rotation.x = 0.18;
    b.head.rotation.set(-0.35, 0, 0);
    this._look(toX, toZ, 0.6);
    b.belly.scale.setScalar(1 + 0.05 * Math.sin(this.t * 1.6));
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const sw = Math.sin(ph + k * Math.PI);
      let x = 0.05 - sw * 0.32 * f, z = 0.32, el = 0.35;
      x = lerp(x, -2.9, raise); z = lerp(z, 0.25, raise); el = lerp(el, 0.6, raise);
      x = lerp(x, -0.55, smash); z = lerp(z, 0.2, smash); el = lerp(el, 0.15, smash);
      this._arm(L, s, x, z, el, 0.1);
    }
    b.jaw.rotation.x = 0.1 + smash * 0.4;
    this._jaw(0.1);
  },

  screamer(dt, toX, toZ) { // 骨瘦如柴、手臂垂得很長、下顎脫臼歪一邊
    const b = this.b, sp = this.speedNow, st = this.st;
    const f = Math.min(1, sp / 1.6);
    const amp = 0.34 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.6 * f + 0.06, 0.1, { toe: 0.04, wide: 0.03 });
    this._hipsTo(ext);
    b.hips.rotation.z = Math.sin(ph) * 0.06 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.14 * f;
    const lean = 0.32 + 0.1 * f;
    b.spine.rotation.set(lean, -b.hips.rotation.y * 0.8, Math.sin(this.t * 1.3) * 0.05);
    b.chest.rotation.set(0.15, -b.hips.rotation.y * 0.4, 0);
    b.neck.rotation.x = 0.35;
    b.head.rotation.set(-0.15 + Math.sin(ph * 2) * 0.04 * f, 0, Math.sin(this.t * 0.8) * 0.1);
    this._look(toX, toZ, 0.9);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      let x = -Math.sin(ph + k * Math.PI) * 0.4 * f + 0.1 + Math.sin(this.t * 1.7 + k) * 0.04;
      let z = 0.12, el = 0.15 + 0.1 * f;
      if (this.state === 'attack') { const u = env(st, k ? 0.2 : 0.1, k ? 0.38 : 0.3, 0.5, 0.8); x = lerp(x, -1.7, u); z = lerp(z, 0.2, u); el = lerp(el, 0.2, u); }
      this._arm(L, s, x, z, el, -0.3);
    }
    const jawOpen = 0.55 + 0.12 * Math.sin(this.t * 2.3);
    b.jaw.rotation.set(jawOpen, 0, this.jawSkew);
    b.jaw.position.y -= 0.012;
    this._jaw(jawOpen);
  },

  stalker(dt, toX, toZ) {
    // 四肢細長(test 版四腳著地、會爬上天花板);這裡維持直立,極度駝背、長臂往前垂著走,命中盒高度與其他殭屍相同
    const b = this.b, sp = this.speedNow, st = this.st;
    const f = Math.min(1, sp / 1.8);
    const amp = 0.32 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.7 * f + 0.08, 0.18, { toe: 0.05, wide: 0.06 });
    this._hipsTo(ext);
    b.hips.rotation.y = Math.sin(ph) * 0.14 * f;
    b.hips.rotation.z = Math.sin(ph) * 0.06 * f;
    b.spine.rotation.set(0.45 + 0.06 * f, -b.hips.rotation.y * 0.8, 0);
    b.chest.rotation.set(0.3, -b.hips.rotation.y * 0.4, Math.sin(this.t * 0.9) * 0.04);
    b.neck.rotation.x = -0.35;
    b.head.rotation.set(-0.45 + Math.sin(this.t * 3.1) * 0.04, 0, Math.sin(this.t * 0.7) * 0.12);
    this._look(toX, toZ, 0.9);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      let x = -0.55 - Math.sin(ph + k * Math.PI) * 0.3 * f + Math.sin(this.t * 1.5 + k) * 0.05, z = 0.2, el = 0.5;
      if (this.state === 'attack') { const u = env(st, k ? 0.15 : 0.05, k ? 0.35 : 0.25, 0.45, 0.75); x = lerp(x, -2.2, u); z = lerp(z, 0.15, u); el = lerp(el, 0.15, u); }
      this._arm(L, s, x, z, el, -0.5);
    }
    b.jaw.rotation.x = 0.3 + Math.sin(this.t * 4) * 0.08;
    this._jaw(0.3);
  },

  surgeon(dt, toX, toZ) { // 縫著手術刀的雙手往前外側張開;攻擊 = 一記斜劈
    const b = this.b, sp = this.speedNow, st = this.st, atk = this.state === 'attack';
    const f = Math.min(1, sp / 2);
    const amp = 0.42 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.9 * f + 0.1, 0.18, { toe: 0.08, wide: 0.06 });
    this._hipsTo(ext);
    b.hips.rotation.y = Math.sin(ph) * 0.16 * f;
    b.hips.rotation.z = Math.sin(ph) * 0.05 * f;
    const lean = 0.5 + 0.12 * f;
    b.spine.rotation.set(lean * 0.6, -b.hips.rotation.y, -b.hips.rotation.z);
    b.chest.rotation.set(lean * 0.45, -b.hips.rotation.y * 0.5, 0);
    b.neck.rotation.x = -0.15;
    b.head.rotation.set(-0.45, 0, Math.sin(this.t * 0.9) * 0.08);
    this._look(toX, toZ, 0.9);
    const h = HIT.surgeon, k0 = this.slashSide;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      let x = -0.95 + Math.sin(ph + k * Math.PI) * 0.15 * f + Math.sin(this.t * 1.4 + k * 2) * 0.05;
      let z = 0.55, el = 0.45, wr = 0.15;
      if (atk && k === k0) {
        const up = env(st, h - 0.2, h - 0.08, h - 0.06, h), sw = env(st, h - 0.07, h, h + 0.05, h + 0.2);
        x = lerp(x, -2.4, up); z = lerp(z, 1.0, up); el = lerp(el, 0.9, up);
        x = lerp(x, -0.7, sw); z = lerp(z, -0.45, sw); el = lerp(el, 0.1, sw); wr = lerp(wr, -0.4, sw);
      }
      this._arm(L, s, x, z, el, wr);
    }
    if (atk) { b.chest.rotation.y += Math.sin(st * 14) * 0.25 * env(st, 0.1, 0.2, h + 0.1, h + 0.3); b.spine.rotation.x += 0.15; }
    b.jaw.rotation.x = 0.12 + (atk ? 0.4 : 0) + Math.sin(this.t * 3) * 0.04;
    this._jaw(0.12);
  },

  burned(dt, toX, toZ) { // 肌腱熱收縮的拳擊姿勢;攻擊 = 往前撲抓
    const b = this.b, sp = this.speedNow, st = this.st;
    const f = Math.min(1, sp / 1.2);
    const amp = 0.2 * f + 0.02; // 步子小、僵硬
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.35 * f + 0.12, 0.16, { toe: 0.12, wide: 0.07 });
    this._hipsTo(ext);
    b.hips.rotation.z = Math.sin(ph) * 0.09 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.06 * f;
    const grab = this.state === 'attack' ? env(st, 0.2, 0.5, 0.65, 1.0) : 0;
    b.spine.rotation.set(0.32 + grab * 0.3, -b.hips.rotation.y, -b.hips.rotation.z * 0.8);
    b.chest.rotation.set(0.18 + grab * 0.15, 0, Math.sin(this.t * 0.7) * 0.05);
    b.neck.rotation.x = 0.25;
    b.head.rotation.set(-0.35 + Math.sin(ph * 2) * 0.03 * f, 0, Math.sin(this.t * 0.5 + this.seed) * 0.15);
    this._look(toX, toZ, 0.7);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      let x = -0.75 + Math.sin(ph + k * Math.PI) * 0.06 * f, z = 0.28, el = 1.75;
      x = lerp(x, -1.8, grab); el = lerp(el, 0.5, grab); z = lerp(z, 0.4, grab);
      this._arm(L, s, x, z, el, 0.7);
    }
    b.jaw.rotation.x = 0.35 + Math.sin(this.t * 1.1) * 0.08 + grab * 0.3; // 嘴唇燒掉了,永遠露齒
    this._jaw(0.35);
  },

  hazmat(dt, toX, toZ) { // 防護衣臃腫、手臂稍微張開;攻擊 = 右手揮拳
    const b = this.b, sp = this.speedNow, st = this.st, atk = this.state === 'attack';
    const f = Math.min(1, sp / 1.1);
    const amp = 0.3 * f + 0.02;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const wind = atk ? env(st, 0.05, 0.5, 0.6, 0.7) : 0, punch = atk ? env(st, 0.6, 0.7, 0.85, 1.3) : 0;
    const ext = this._legs(ph, amp, 0.5 * f + 0.06, 0.1 + punch * 0.1, { toe: 0.12, wide: 0.09 });
    this._hipsTo(ext);
    b.hips.rotation.z = Math.sin(ph) * 0.07 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.1 * f;
    b.spine.rotation.set(0.12 - wind * 0.15 + punch * 0.3, -b.hips.rotation.y * 0.8 + wind * 0.5 - punch * 0.6, -b.hips.rotation.z * 0.7);
    b.chest.rotation.set(0.06, -b.hips.rotation.y * 0.4 + wind * 0.3 - punch * 0.4, 0);
    b.neck.rotation.x = 0.12;
    b.head.rotation.set(-0.12 + Math.sin(ph * 2) * 0.02 * f, 0, 0);
    this._look(toX, toZ, 0.7);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      let x = -Math.sin(ph + k * Math.PI) * 0.3 * f - 0.05, z = 0.22, el = 0.4;
      if (k === 1) { x = lerp(x, 0.4, wind); z = lerp(z, 0.5, wind); el = lerp(el, 1.9, wind); x = lerp(x, -1.55, punch); z = lerp(z, 0.05, punch); el = lerp(el, 0.15, punch); }
      else { x = lerp(x, -0.9, wind + punch); el = lerp(el, 1.4, wind + punch); }
      this._arm(L, s, x, z, el, 0.1);
    }
    b.jaw.rotation.x = 0.05;
  },

  straitjacket(dt, toX, toZ) { // 雙臂交叉綁在胸前,上半身左右甩著平衡;攻擊 = 頭槌
    const b = this.b, sp = this.speedNow, st = this.st;
    const f = Math.min(1, sp / 2);
    const amp = 0.36 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const butt = this.state === 'attack' ? env(st, 0.2, 0.42, 0.5, 0.85) : 0;
    const ext = this._legs(ph, amp, 0.7 * f + 0.06, 0.08, { toe: 0.06, wide: 0.05 });
    this._hipsTo(ext);
    b.hips.rotation.y = Math.sin(ph) * 0.22 * f;
    b.hips.rotation.z = Math.sin(ph) * 0.1 * f + Math.sin(this.t * 2.3) * 0.04;
    const lean = 0.18;
    b.spine.rotation.set(lean * 0.6 - butt * 0.4, -b.hips.rotation.y * 1.3, -b.hips.rotation.z * 1.6 + Math.sin(this.t * 3.1) * 0.06);
    b.chest.rotation.set(lean * 0.45 + butt * 0.2, -b.hips.rotation.y * 0.6, 0);
    b.neck.rotation.x = 0.05;
    const headX = -0.15 - butt * 0.7 + (this.state === 'attack' ? env(st, 0.42, 0.48, 0.55, 0.8) * 1.3 : 0);
    b.head.rotation.set(headX, 0, Math.sin(this.t * 1.7) * 0.2);
    this._look(toX, toZ, 0.8);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      this._arm(L, s, -0.3 - 0.06 * Math.sin(ph + k * Math.PI) * f, -0.05, 1.75 - k * 0.12, 0.2, -0.3 + k * 0.08);
      b['forearm' + L].rotation.z = s * -1.15;
    }
    b.jaw.rotation.x = this.V.P.muzzle ? 0.02 : 0.2 + Math.sin(this.t * 5) * 0.06;
    if (!this.V.P.muzzle) this._jaw(0.2);
  },
};
