import { createWeaponModel } from './models.js';
import { MuzzleFlash } from './flash.js';
import { sfx } from '../audio.js';

// 武器數值表(價格、傷害、射速…都集中在這裡調整);flash 是槍口火光樣式(只影響外觀)
export const WEAPONS = {
  pistol: {
    name: '手槍', desc: 'Glock 17 · 半自動', price: 0, damage: 25, rpm: 380, auto: false,
    mag: 17, reserveStart: 85, reserveCap: 136, reload: 1.5, spread: 0.007, kick: 0.035, pitch: 0.011,
    hold: [0.1, -0.1, -0.4], slot: 1, flash: 'pistol',
  },
  revolver: {
    name: '左輪', desc: 'Colt Python · 357 Magnum', price: 100, damage: 70, rpm: 130, auto: false,
    mag: 6, reserveStart: 30, reserveCap: 48, reload: 2.6, spread: 0.005, kick: 0.075, pitch: 0.03,
    hold: [0.1, -0.105, -0.38], slot: 2, flash: 'revolver',
  },
  ak47: {
    name: 'AK-47', desc: '7.62×39mm · 全自動', price: 250, damage: 35, rpm: 600, auto: true,
    mag: 30, reserveStart: 90, reserveCap: 180, reload: 2.5, spread: 0.014, kick: 0.05, pitch: 0.016,
    hold: [0.17, -0.17, -0.66], slot: 3, flash: 'rifle',
  },
  m4a1: {
    name: 'M4A1', desc: '5.56×45mm · 全自動', price: 400, damage: 30, rpm: 780, auto: true,
    mag: 30, reserveStart: 90, reserveCap: 180, reload: 2.1, spread: 0.01, kick: 0.036, pitch: 0.011,
    hold: [0.17, -0.17, -0.62], slot: 4, flash: 'carbine',
  },
};

export const ORDER = ['pistol', 'revolver', 'ak47', 'm4a1'];

export class WeaponSystem {
  constructor(weaponScene) {
    this.scene = weaponScene;
    this.models = {};
    this.inv = {}; // id -> {mag, reserve}
    this.current = null;
    this.reloading = 0; // 剩餘秒數
    this.cooldown = 0;
    this.raise = 1; // 1=放下,0=舉起
    this.kickZ = 0; this.kickRot = 0; this.kickRoll = 0; this.kickYaw = 0;
    this.bobT = 0;
    this.idleT = 0;
    this.flashT = 0;
    this.sinceShot = 9; // 距上一發的秒數(滑套/槍機動畫用)
    this.onFire = null; // (def, id) => void
    this.onEmptyDry = null;
    this.swayX = 0; this.swayY = 0; this.swayVX = 0; this.swayVY = 0; this.roll = 0;
    this._st = { pump: 0, phase: null, u: 0, left: null, palm: null }; // 傳給槍模動畫的狀態(重複使用)

    // 槍模(含戴手套的雙手與袖子,src/weapons/models.js)+ 依槍種的槍口火光(src/weapons/flash.js)
    for (const id of ORDER) {
      const m = createWeaponModel(id);
      m.root.visible = false;
      m.root.position.set(...WEAPONS[id].hold);
      this.scene.add(m.root);
      m.flash = new MuzzleFlash(WEAPONS[id].flash, m.info);
      m.flash.group.position.copy(m.info.muzzle);
      m.root.add(m.flash.group);
      this.models[id] = m;
    }
    this.give('pistol');
    this.switchTo('pistol', true);
  }

  has(id) { return !!this.inv[id]; }

  give(id) {
    const def = WEAPONS[id];
    if (!this.inv[id]) this.inv[id] = { mag: def.mag, reserve: def.reserveStart };
    else {
      this.inv[id].mag = def.mag;
      this.inv[id].reserve = def.reserveCap;
    }
  }

  refillAll() {
    for (const id in this.inv) {
      this.inv[id].mag = WEAPONS[id].mag;
      this.inv[id].reserve = WEAPONS[id].reserveCap;
    }
  }

  // 每回合開始補給兩個彈匣
  resupply() {
    for (const id in this.inv) {
      const d = WEAPONS[id];
      this.inv[id].reserve = Math.min(d.reserveCap, this.inv[id].reserve + d.mag * 2);
    }
  }

  switchTo(id, instant = false) {
    if (!this.inv[id] || (id === this.current && !instant)) return;
    if (this.current) this.models[this.current].root.visible = false;
    this.current = id;
    this.models[id].root.visible = true;
    this.reloading = 0;
    this.raise = instant ? 0 : 1;
    this.cooldown = 0.2;
    if (!instant) sfx.switch();
  }

  cycle(dir) {
    const owned = ORDER.filter((id) => this.inv[id]);
    const i = owned.indexOf(this.current);
    this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }

  get def() { return WEAPONS[this.current]; }
  get ammo() { return this.inv[this.current]; }

  startReload() {
    const a = this.ammo, d = this.def;
    if (this.reloading > 0 || a.mag >= d.mag || a.reserve <= 0) return;
    this.reloading = d.reload;
    this.reloadTotal = d.reload;
    sfx.reload(this.current);
  }

  update(dt, input, speedNorm, sprinting, look) {
    const d = this.def, a = this.ammo, m = this.models[this.current];
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    this.idleT += dt;
    this.raise = Math.max(0, this.raise - dt / 0.35);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const take = Math.min(d.mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = 0;
      }
    }

    const canShoot = this.reloading <= 0 && this.raise < 0.4 && !sprinting;
    const wantFire = d.auto ? input.fireHeld : input.firePressed;
    if (wantFire && this.cooldown <= 0 && canShoot) {
      if (a.mag > 0) {
        a.mag--;
        this.cooldown = 60 / d.rpm;
        this.kickZ += d.kick;
        this.kickRot += d.kick * 3.2;
        this.kickRoll += (Math.random() - 0.5) * d.kick * 2.2;
        this.kickYaw += (Math.random() - 0.5) * d.kick * 1.2;
        this.flashT = 0.05;
        m.flash.fire();
        this.sinceShot = 0;
        this.idleT = 0;
        sfx.shot(this.current);
        if (this.onFire) this.onFire(d, this.current, speedNorm);
        if (a.mag === 0 && a.reserve > 0) setTimeout(() => this.startReload(), 250);
      } else if (input.firePressed) {
        sfx.dry();
        this.cooldown = 0.25;
        this.startReload();
      }
    }
    input.firePressed = false;

    this._animate(dt, d, a, m, speedNorm, sprinting, look);
  }

  // ---- 視角模型動畫 ----
  _animate(dt, d, a, m, speedNorm, sprinting, look) {
    // 慣性擺動:彈簧阻尼,讓槍身落後於視線
    this.swayVX += ((-look.x * 0.0011 - this.swayX) * 160 - this.swayVX * 18) * dt;
    this.swayVY += ((-look.y * 0.0011 - this.swayY) * 160 - this.swayVY * 18) * dt;
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX + this.swayVX * dt));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY + this.swayVY * dt));
    look.x = look.y = 0;
    // 後座回正
    this.kickZ += (0 - this.kickZ) * Math.min(1, dt * 14);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 11);
    this.kickRoll += (0 - this.kickRoll) * Math.min(1, dt * 9);
    this.kickYaw += (0 - this.kickYaw) * Math.min(1, dt * 10);
    // 移動擺動 + 呼吸
    this.bobT += dt * (sprinting ? 11 : 7.5) * speedNorm;
    const bobAmp = 0.008 * speedNorm * (sprinting ? 1.8 : 1);
    const bx = Math.sin(this.bobT) * bobAmp;
    const by = Math.abs(Math.cos(this.bobT)) * bobAmp * 0.9;
    const br = 1 - speedNorm;
    const breathY = Math.sin(this.idleT * 1.35) * 0.0016 * br, breathX = Math.sin(this.idleT * 0.7) * 0.0009 * br;
    this.roll += ((sprinting ? 0 : -speedNorm * 0.02 * Math.sign(this.swayVX || 0)) - this.roll) * Math.min(1, dt * 4);

    const h = d.hold;
    let px = h[0] + bx + this.swayX + breathX, py = h[1] - by + this.swayY + breathY, pz = h[2] + this.kickZ;
    let rx = 0.03 + this.kickRot, ry = 0.07 + this.kickYaw, rz = this.roll + this.kickRoll;
    if (sprinting) { px += -0.05; py += -0.06; rx += 0.1; ry += 0.55; }
    if (this.raise > 0) { py -= this.raise * 0.35; rx -= this.raise * 0.8; }
    let rl = -1;
    if (this.reloading > 0) {
      const t = 1 - this.reloading / this.reloadTotal;
      rl = t;
      const s = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7);
      py -= 0.13 * s;
      rx += 0.5 * s;
      rz += 0.35 * s;
      px -= 0.03 * s;
    }
    // 滑套後座、槍機往復、換彈時彈匣/彈巢與左手的動作(各槍在 models.js 定義)
    const st = this._st;
    st.left = m.left; st.palm = m.palm;
    if (m.info.anim) m.info.anim(this.sinceShot, rl, a.mag === 0, st);
    m.root.position.set(px, py, pz);
    m.root.rotation.set(rx, ry, rz);

    // 槍口火光
    if (this.flashT > 0) this.flashT -= dt;
    m.flash.update(dt, false);
  }

  get flashing() { return this.flashT > 0; }
}
