import * as THREE from 'three';
import { createWeaponModel, createKnifeModel, createGrenadeModel } from './models.js';
import { MuzzleFlash } from './flash.js';
import { sfx } from '../audio.js';

// 武器數值表(價格、傷害、射速…都集中在這裡調整)
// 價格依實測經濟(購物 bot:第 1~8 回合每回合收入約 124/153/207/246/363/331/459/595,爆頭率高;一般玩家約少兩成,累計約 100/220/390/585/875/1140):
// 存錢的話第 2 回合後買得起左輪/霰彈槍、第 3 回合 AK、第 4 回合 M4A1、第 5~6 回合巴雷特;
// 邊買彈藥/改裝邊升級時,bot 在第 3/4/5/7/10 回合依序買到左輪/霰彈槍/AK/M4A1/巴雷特(約每 1.5 回合一把)
// ads:{ zoom 視野倍率, spread 開鏡散布(弧度;光學鏡 ≤ 1mrad:10m 內 1cm), time 開鏡秒數, optic 'iron' 機械瞄具 | 'reddot' 紅點反射鏡 | 'acog' 放大光學鏡 | 'sniper' 狙擊鏡, scope 全螢幕狙擊鏡 } | null;pellets 霰彈彈丸數;penetrate 可穿透隻數(每穿一隻 ×penMul)
// falloff:[近, 遠] 公尺(近距離以內全傷害,遠距離以外為 minDmg 倍);recoil:連發時的水平後座圖樣(×pitch)與隨機量;bloom 每發增加的散布
// stats:商店顯示用 0..1;flash/casing:槍口火光與拋殼樣式;move:持槍移速倍率(重武器較慢)
export const WEAPONS = {
  pistol: {
    name: '手槍', desc: 'Glock 17 · 9mm 半自動', price: 0, damage: 25, rpm: 380, auto: false,
    mag: 17, reserveStart: 85, reserveCap: 136, reload: 1.5, spread: 0.008, kick: 0.035, pitch: 0.011,
    hold: [0.1, -0.1, -0.4], slot: 1, ads: { zoom: 1.2, spread: 0.0024, time: 0.15, optic: 'iron' },
    falloff: [18, 45], minDmg: 0.55, bloom: 0.004, moveSpread: 1.2, recoil: { yaw: [0], rand: 0.5 },
    flash: 'pistol', casing: 'pistol', casingSize: [0.0099, 0.019],
    stats: { damage: 0.2, rate: 0.55, accuracy: 0.62, range: 0.38, mobility: 0.95 },
  },
  revolver: {
    name: '左輪', desc: 'Colt Python · .357 Magnum', price: 120, damage: 70, rpm: 130, auto: false,
    mag: 6, reserveStart: 30, reserveCap: 48, reload: 2.6, spread: 0.006, kick: 0.075, pitch: 0.03,
    hold: [0.1, -0.105, -0.38], slot: 2, ads: null, penetrate: 1, penMul: 0.6,
    falloff: [25, 60], minDmg: 0.6, bloom: 0.008, moveSpread: 1.4, recoil: { yaw: [0], rand: 0.6 },
    flash: 'revolver', casing: 'pistol', casingSize: [0.0096, 0.033],
    stats: { damage: 0.45, rate: 0.22, accuracy: 0.82, range: 0.6, mobility: 0.88 },
  },
  shotgun: {
    name: '霰彈槍', desc: 'Remington 870 · 12 號泵動', price: 180, damage: 22, pellets: 8, rpm: 70, auto: false,
    mag: 7, reserveStart: 28, reserveCap: 56, reload: 0.5, reloadOpen: 0.3, reloadClose: 0.32,
    spread: 0.062, kick: 0.085, pitch: 0.045, hold: [0.15, -0.16, -0.58], slot: 3,
    ads: { zoom: 1.15, spread: 0.046, time: 0.2, optic: 'iron' }, pump: true, shellReload: true,
    falloff: [6, 18], minDmg: 0.18, bloom: 0, moveSpread: 0.3, recoil: { yaw: [0], rand: 0.5 },
    flash: 'shotgun', casing: 'shell', move: 0.96,
    stats: { damage: 0.82, rate: 0.16, accuracy: 0.22, range: 0.2, mobility: 0.72 },
  },
  ak47: {
    name: 'AK-47', desc: '7.62×39mm · 全自動 · Kobra 紅點鏡', price: 300, damage: 35, rpm: 600, auto: true,
    mag: 30, reserveStart: 90, reserveCap: 180, reload: 2.5, spread: 0.014, kick: 0.05, pitch: 0.016,
    hold: [0.17, -0.17, -0.66], slot: 4, ads: { zoom: 1.5, spread: 0.0009, time: 0.22, optic: 'reddot' }, penetrate: 1, penMul: 0.65,
    falloff: [30, 70], minDmg: 0.65, bloom: 0.0035, moveSpread: 1.6,
    recoil: { yaw: [0, 0.15, 0.3, 0.35, 0.2, -0.15, -0.45, -0.55, -0.35, 0.05, 0.45, 0.6, 0.4, 0, -0.4, -0.6, -0.45, -0.05, 0.4, 0.55], rand: 0.25 },
    flash: 'rifle', casing: 'rifle', casingSize: [0.0113, 0.039], move: 0.97,
    stats: { damage: 0.5, rate: 0.75, accuracy: 0.5, range: 0.7, mobility: 0.6 },
  },
  m4a1: {
    name: 'M4A1', desc: '5.56×45mm · 全自動 · 3× ACOG 光學鏡', price: 450, damage: 30, rpm: 780, auto: true,
    mag: 30, reserveStart: 90, reserveCap: 180, reload: 2.1, spread: 0.01, kick: 0.036, pitch: 0.011,
    hold: [0.17, -0.17, -0.62], slot: 5, ads: { zoom: 3, spread: 0.0007, time: 0.28, optic: 'acog' }, penetrate: 1, penMul: 0.6,
    falloff: [35, 80], minDmg: 0.65, bloom: 0.0025, moveSpread: 1.5,
    recoil: { yaw: [0, 0.1, 0.18, 0.12, -0.05, -0.15, -0.1, 0.05, 0.15, 0.12], rand: 0.18 },
    flash: 'carbine', casing: 'rifle', casingSize: [0.0096, 0.045], move: 0.98,
    stats: { damage: 0.44, rate: 0.9, accuracy: 0.72, range: 0.75, mobility: 0.66 },
  },
  barrett: {
    name: '巴雷特', desc: 'Barrett M82A1 · .50 BMG 半自動狙擊', price: 1350, damage: 260, rpm: 70, auto: false,
    mag: 10, reserveStart: 20, reserveCap: 50, reload: 3.6, spread: 0.06, kick: 0.15, pitch: 0.075,
    hold: [0.22, -0.225, -0.74], slot: 6, ads: { zoom: 6, spread: 0.0005, time: 0.42, scope: true, optic: 'sniper' }, penetrate: 3, penMul: 0.7,
    falloff: null, minDmg: 1, bloom: 0, moveSpread: 1.0, recoil: { yaw: [0], rand: 0.35 },
    flash: 'brake', casing: 'rifle', casingSize: [0.0204, 0.099], move: 0.88,
    stats: { damage: 1, rate: 0.12, accuracy: 0.97, range: 1, mobility: 0.28 },
  },
};

export const ORDER = ['pistol', 'revolver', 'shotgun', 'ak47', 'm4a1', 'barrett'];

const MOD_KEYS = ['damage', 'mag', 'reload', 'spread'];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const env = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// 關鍵影格:[t, px, py, pz, rx, ry, rz],依時間做平滑內插
function keyPose(keys, t, out) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const u = ease(clamp01((t - a[0]) / (b[0] - a[0] || 1)));
  for (let k = 1; k < 7; k++) out[k - 1] = lerp(a[k], b[k], u);
  return out;
}
// 小刀:從右下進場 → 右上蓄力 → 斜劈到左下 → 收回
const KNIFE_KEYS = [
  [0, 0.38, -0.42, -0.36, -0.15, 0.3, -0.3],
  [0.09, 0.26, -0.05, -0.42, -0.3, 0.5, -0.6],
  [0.17, 0.06, -0.11, -0.5, -0.42, 0.1, 0.5],
  [0.25, -0.18, -0.24, -0.46, -0.38, -0.3, 1.15],
  [0.36, -0.36, -0.44, -0.4, -0.3, -0.45, 1.35],
  [0.6, 0.38, -0.62, -0.34, -0.15, 0.3, -0.3],
];
// 手榴彈:舉起 → 拔插銷 → 往後上方蓄力 → 投出 → 收手
const NADE_KEYS = [
  [0, 0.26, -0.42, -0.4, 0.4, 0, 0],
  [0.18, 0.09, -0.11, -0.36, 0.1, -0.25, 0.15],
  [0.3, 0.1, -0.1, -0.35, 0.12, -0.2, 0.2],
  [0.45, 0.2, 0.03, -0.3, -0.5, 0.25, 0.3],
  [0.55, 0.03, 0.07, -0.62, 0.5, -0.15, -0.2],
  [0.72, 0.06, -0.3, -0.55, 0.9, -0.2, -0.2],
  [0.95, 0.25, -0.65, -0.4, 0.6, 0, 0],
];
const _pose = new Array(6).fill(0);
const _v = new THREE.Vector3();

export class WeaponSystem {
  constructor(weaponScene) {
    this.scene = weaponScene;
    this.models = {};
    this.inv = {}; // id -> {mag, reserve}
    this.mods = {}; // id -> {damage, mag, reload, spread}(改裝倍率,預設 1)
    for (const id of ORDER) this.mods[id] = { damage: 1, mag: 1, reload: 1, spread: 1 };
    this.current = null;
    this.reloading = 0; // 剩餘秒數(霰彈逐發裝填時為 1)
    this.reloadTotal = 1;
    this.cooldown = 0;
    this.raise = 1; // 1=放下,0=舉起
    this.kickZ = 0; this.kickRot = 0; this.kickRoll = 0; this.kickYaw = 0;
    this.bobT = 0;
    this.idleT = 0;
    this.flashT = 0;
    this.sinceShot = 9; // 距上一發的秒數(槍機/滑套動畫用)
    this.onFire = null; // (def, id, speedNorm) => void
    this.onEvent = null; // (kind, data) => void:'eject' | 'knife' | 'throw' | 'pin' | 'drop'
    this.swayX = 0; this.swayY = 0; this.swayVX = 0; this.swayVY = 0; this.roll = 0;
    // 開鏡
    this.aim = false; // 玩家是否按住右鍵(由 input 設定)
    this.aiming = false; // 目前是否處於開鏡(含過渡)
    this.ads = 0; // 0..1 開鏡過渡
    this.zoom = 1; // 目前視野倍率
    this.scoped = false; // 狙擊鏡/放大光學鏡:鏡內畫面已接手(手持模型隱藏)
    this.scopeAmt = 0; // 0..1 鏡內畫面(HUD)淡入程度
    this.dotAmt = 0; // 0..1 紅點反射鏡光點亮度
    this.optic = null; // 目前武器的瞄具種類(WEAPONS[id].ads.optic)
    this.bloom = 0; // 連射累積的額外散布
    this.shotIdx = 0; // 後座圖樣索引
    this.pump = 0; // 霰彈泵動行程 0..1
    this.pumpT = 9; // 距上次開火(泵動動畫)
    this.pumped = true;
    this.shell = null; // 霰彈逐發裝填狀態 {phase, t, u, loaded, stop, chamber}
    this.action = null; // 小刀/手榴彈動作 {kind, t, dur, done}
    this.autoReload = 0;
    this.fireQueue = 0;
    this.lowAmmoWarned = false;
    this._st = { pump: 0, phase: null, u: 0, left: null, palm: null }; // 傳給槍模動畫的狀態(重複使用)

    for (const id of ORDER) {
      const m = createWeaponModel(id);
      m.root.visible = false;
      m.root.position.set(...WEAPONS[id].hold);
      this.scene.add(m.root);
      m.flash = new MuzzleFlash(WEAPONS[id].flash, m.info);
      m.flash.group.position.copy(m.info.muzzle);
      m.root.add(m.flash.group);
      // 開鏡姿勢:讓照門 → 準星這條線落在相機光軸上(畫面正中央),照門離眼睛 eye 公尺
      const s = m.info.sight;
      if (s) {
        const th = Math.atan2(s.rear[1] - s.front[1], s.front[0] - s.rear[0]);
        const yr = s.rear[1], zr = -s.rear[0];
        const y2 = yr * Math.cos(th) - zr * Math.sin(th), z2 = yr * Math.sin(th) + zr * Math.cos(th);
        m.adsPos = [0, -y2, -s.eye - z2];
        m.adsRot = th;
      }
      this.models[id] = m;
    }
    this.knife = createKnifeModel();
    this.nade = createGrenadeModel();
    for (const o of [this.knife.root, this.nade.root]) { o.visible = false; this.scene.add(o); }
    this.give('pistol');
    this.switchTo('pistol', true);
  }

  // 套用改裝後的數值(mag 取整數)
  stat(id, key) {
    const d = WEAPONS[id];
    if (!d) return 0;
    const m = this.mods[id];
    const k = m && MOD_KEYS.includes(key) && Number.isFinite(m[key]) ? m[key] : 1;
    const v = d[key] * k;
    return key === 'mag' ? Math.max(1, Math.round(v)) : v;
  }

  has(id) { return !!this.inv[id]; }

  give(id) {
    const def = WEAPONS[id];
    if (!def) return;
    if (!this.mods[id]) this.mods[id] = { damage: 1, mag: 1, reload: 1, spread: 1 };
    if (!this.inv[id]) this.inv[id] = { mag: this.stat(id, 'mag'), reserve: def.reserveStart };
    else {
      this.inv[id].mag = Math.max(this.inv[id].mag, this.stat(id, 'mag'));
      this.inv[id].reserve = def.reserveCap;
    }
  }

  refillAll() {
    for (const id in this.inv) {
      this.inv[id].mag = this.stat(id, 'mag');
      this.inv[id].reserve = WEAPONS[id].reserveCap;
    }
  }

  // 每回合開始每把槍補給一個彈匣([w4 經濟] 以前兩個:彈藥幾乎不用買)
  resupply() {
    for (const id in this.inv) {
      const d = WEAPONS[id];
      this.inv[id].reserve = Math.min(d.reserveCap, this.inv[id].reserve + this.stat(id, 'mag'));
    }
  }

  switchTo(id, instant = false) {
    if (!this.inv[id] || (id === this.current && !instant)) return;
    if (this.current) this.models[this.current].root.visible = false;
    this.current = id;
    this.models[id].root.visible = true;
    this.reloading = 0;
    this.shell = null;
    this.raise = instant ? 0 : 1;
    this.cooldown = 0.2;
    this.ads = 0;
    this.zoom = 1;
    this.scoped = false;
    this.scopeAmt = 0;
    this.dotAmt = 0;
    this.aiming = false;
    this.bloom = 0;
    this.pump = 0;
    this.pumpT = 9;
    this.pumped = true;
    this.autoReload = 0;
    this.fireQueue = 0;
    this.lowAmmoWarned = false;
    if (!instant) sfx.switch(id);
  }

  cycle(dir) {
    const owned = ORDER.filter((id) => this.inv[id]);
    const i = owned.indexOf(this.current);
    this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }

  get def() { return WEAPONS[this.current]; }
  get ammo() { return this.inv[this.current]; }
  get magSize() { return this.stat(this.current, 'mag'); }
  get flashing() { return this.flashT > 0; }
  get busy() { return !!this.action; }

  startReload() {
    const a = this.ammo, d = this.def, id = this.current;
    if (this.reloading > 0 || this.shell || this.action || a.mag >= this.stat(id, 'mag') || a.reserve <= 0) return;
    if (d.shellReload) { // 霰彈:打開 → 逐發裝填 → (空膛時)泵動上膛
      this.shell = { phase: 'open', t: 0, u: 0, loaded: false, stop: false, chamber: a.mag === 0 };
      this.reloading = 1;
      return;
    }
    this.reloading = this.reloadTotal = this.stat(id, 'reload');
    sfx.reload(id, this.reloadTotal, a.mag === 0);
    if (id === 'revolver') this._revDrop = 6 - a.mag; // 擺出彈巢時倒出空彈殼
  }

  // 開始小刀/手榴彈動作;回傳是否成功
  startAction(kind) {
    if (this.action || this.raise > 0.5) return false;
    this.action = { kind, t: 0, dur: kind === 'knife' ? 0.6 : 0.95, hit: false, pin: false, thrown: false };
    this.reloading = 0;
    this.shell = null;
    if (kind === 'knife') { this.knife.root.visible = true; sfx.knifeSwing(); }
    else { this.nade.root.visible = true; this.nade.nade.visible = true; this.nade.pin.visible = true; }
    return true;
  }

  // 目前的散布(弧度):腰射/開鏡內插 × 移動 × 連射累積 × 改裝
  spreadNow(speedNorm = 0, sprinting = false) {
    const d = this.def;
    const e = this.ads;
    const hip = d.spread, ads = d.ads ? d.ads.spread : hip;
    let s = hip + (ads - hip) * e;
    s *= 1 + speedNorm * (d.moveSpread ?? 1.5) * (1 - 0.7 * e) + (sprinting ? 1 : 0);
    s += this.bloom * (1 - 0.5 * e);
    return s * (this.mods[this.current]?.spread ?? 1);
  }

  // 本發的後座力:[pitch 倍率, yaw 弧度];依連發次數走圖樣
  recoilKick() {
    const d = this.def, r = d.recoil;
    const i = this.shotIdx;
    const yaw = (r.yaw[i % r.yaw.length] + (Math.random() - 0.5) * 2 * r.rand) * d.pitch;
    const climb = d.auto ? (i < 6 ? 1 : 0.75) : 1;
    const adsK = 1 - this.ads * (d.ads && d.ads.scope ? 0.2 : 0.4);
    const out = this._rk || (this._rk = [0, 0]);
    out[0] = d.pitch * climb * adsK;
    out[1] = yaw * adsK;
    return out;
  }

  update(dt, input, speedNorm, sprinting, look) {
    const id = this.current, d = this.def, a = this.ammo, m = this.models[id];
    const magSize = this.stat(id, 'mag');
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    this.pumpT += dt;
    this.idleT += dt;
    this.raise = Math.max(0, this.raise - dt / 0.35);
    this.bloom *= Math.exp(-dt * (this.sinceShot > 0.12 ? 6 : 1.5));
    if (this.sinceShot > 0.32) this.shotIdx = 0;

    // ---- 一般換彈 ----
    if (this.reloading > 0 && !this.shell) {
      this.reloading -= dt;
      const t = 1 - this.reloading / this.reloadTotal;
      if (this._revDrop && t > 0.32) { if (this.onEvent) this.onEvent('drop', { id, n: this._revDrop }); this._revDrop = 0; }
      if (this.reloading <= 0) {
        const take = Math.min(magSize - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = 0;
      }
    }
    // ---- 霰彈逐發裝填 ----
    if (this.shell) this._shellReload(dt, d, a, magSize, input);
    // ---- 自動換彈(打空後) ----
    if (this.autoReload > 0) { this.autoReload -= dt; if (this.autoReload <= 0) this.startReload(); }

    // ---- 小刀/手榴彈 ----
    const act = this.action;
    if (act) {
      act.t += dt;
      if (act.kind === 'knife' && !act.hit && act.t >= 0.17) { act.hit = true; if (this.onEvent) this.onEvent('knife'); }
      if (act.kind === 'grenade') {
        if (!act.pin && act.t >= 0.24) { act.pin = true; this.nade.pin.visible = false; if (this.onEvent) this.onEvent('pin'); }
        if (!act.thrown && act.t >= 0.52) { act.thrown = true; this.nade.nade.visible = false; sfx.grenadeThrow(); if (this.onEvent) this.onEvent('throw'); }
      }
      if (act.t >= act.dur) { this.action = null; this.knife.root.visible = false; this.nade.root.visible = false; }
    }

    // ---- 開鏡 ----
    const canAim = !!d.ads && this.reloading <= 0 && !sprinting && !this.action && this.raise < 0.6 && (!d.pump || this.pumpT > 0.62 || this.pumped);
    const want = this.aim && canAim;
    this.ads = clamp01(this.ads + (want ? dt : -dt * 1.3) / (d.ads ? d.ads.time : 0.2));
    if (want !== this.aiming) { this.aiming = want; (want ? sfx.adsIn : sfx.adsOut)(this.current); }
    const e = ease(this.ads);
    const optic = d.ads ? d.ads.optic || (d.ads.scope ? 'sniper' : 'iron') : null;
    const overlay = optic === 'acog' || optic === 'sniper';
    this.optic = optic;
    // 放大光學鏡/狙擊鏡:開鏡行程的後 45%(槍身貼近眼睛)鏡內畫面(HUD)逐漸淡入,與 3D 槍身交叉溶接;過 0.6 換掉手持模型(HUD 用短暫黑幕遮住切換)
    this.scopeAmt = overlay ? ease(clamp01((this.ads - 0.55) / 0.45)) : 0;
    this.scoped = this.scopeAmt >= 0.6;
    // 紅點反射鏡:準直光點,鏡窗來到眼前才看得到
    this.dotAmt = optic === 'reddot' ? ease(clamp01((this.ads - 0.6) / 0.35)) : 0;
    // 視野倍率在對數空間內插(視覺上等速放大,6× 也不會在最後幾幀暴衝);離開時同一條曲線反向
    const Z = d.ads ? d.ads.zoom : 1;
    this.zoom = Math.pow(Z, e);

    // ---- 開火 ----
    const canShoot = this.reloading <= 0 && this.raise < 0.4 && !sprinting && !this.action && (!d.pump || this.pumped);
    if (this.shell && input.firePressed && a.mag > 0 && this.shell.phase === 'shell') this.shell.stop = true; // 裝填中按開火:裝完這顆就停
    // 半自動:冷卻/泵動/裝填中的點擊先記下,一可以開火就打出(手感更跟手)
    if (!d.auto && input.firePressed && !(this.cooldown <= 0 && canShoot)) this.fireQueue = this.shell && this.shell.stop ? 0.9 : 0.22;
    this.fireQueue = Math.max(0, (this.fireQueue || 0) - dt);
    const wantFire = d.auto ? input.fireHeld : input.firePressed || (this.fireQueue > 0 && this.cooldown <= 0 && canShoot && a.mag > 0);
    if (wantFire && this.cooldown <= 0 && canShoot) {
      this.fireQueue = 0;
      if (a.mag > 0) {
        a.mag--;
        this.cooldown = 60 / d.rpm;
        const k = 1 - this.ads * (d.ads && d.ads.scope ? 0.3 : 0.55);
        this.kickZ += d.kick * k;
        this.kickRot += d.kick * 3.2 * k;
        this.kickRoll += (Math.random() - 0.5) * d.kick * 2.2 * k;
        this.kickYaw += (Math.random() - 0.5) * d.kick * 1.2 * k;
        this.flashT = d.flash === 'brake' ? 0.07 : d.flash === 'shotgun' ? 0.06 : 0.045;
        m.flash.fire();
        this.sinceShot = 0;
        this.idleT = 0;
        sfx.shot(id);
        if (this.onFire) this.onFire(d, id, speedNorm);
        this.bloom = Math.min(this.bloom + (d.bloom || 0), 0.05);
        this.shotIdx++;
        if (d.pump) { this.pumpT = 0; this.pumped = false; }
        else if (d.casing && id !== 'revolver' && this.onEvent) this.onEvent('eject', { id, m });
        if (a.mag === 0 && a.reserve > 0) this.autoReload = d.pump ? 0.75 : 0.28;
        if (a.mag <= Math.ceil(magSize * 0.25) && a.mag > 0 && !this.lowAmmoWarned) { this.lowAmmoWarned = true; sfx.lowAmmo(); }
      } else if (input.firePressed) {
        sfx.dry(id);
        this.cooldown = 0.25;
        this.startReload();
      }
    }
    if (a.mag > Math.ceil(magSize * 0.25)) this.lowAmmoWarned = false;
    input.firePressed = false;

    // ---- 霰彈泵動(開火後自動拉一次) ----
    if (d.pump) {
      if (!this.pumped) {
        const t = this.pumpT;
        this.pump = smooth(0.16, 0.34, t) * (1 - smooth(0.4, 0.58, t));
        if (!this._pumpSfx && t > 0.16) { this._pumpSfx = true; sfx.pump?.(); }
        if (!this._pumpEject && t > 0.3) { this._pumpEject = true; if (this.onEvent) this.onEvent('eject', { id, m }); }
        if (t >= 0.6) { this.pumped = true; this.pump = 0; this._pumpSfx = this._pumpEject = false; }
      } else if (!this.shell) this.pump = 0;
    }

    // 放大光學鏡:槍身在開鏡行程 80% 時就貼到眼前,鏡內畫面淡入時目鏡已在正中央(交叉溶接時兩個圓重合)
    this._animate(dt, d, a, m, speedNorm, sprinting, look, overlay ? ease(clamp01(this.ads / 0.8)) : e);
  }

  // 霰彈逐發裝填:open → shell × n → close(空膛時含泵動)
  _shellReload(dt, d, a, magSize, input) {
    const s = this.shell, rm = this.mods[this.current]?.reload ?? 1;
    s.t += dt;
    const T = (s.phase === 'open' ? d.reloadOpen : s.phase === 'shell' ? d.reload : d.reloadClose + (s.chamber ? 0.3 : 0)) * rm;
    s.u = clamp01(s.t / T);
    if (s.phase === 'shell' && !s.loaded && s.u >= 0.56) {
      s.loaded = true;
      if (a.reserve > 0 && a.mag < magSize) { a.mag++; a.reserve--; sfx.reload(this.current); }
    }
    if (s.phase === 'close' && s.chamber) { // 空膛:最後拉一次泵動上膛
      const u = s.t / T;
      this.pump = smooth(0.3, 0.55, u) * (1 - smooth(0.6, 0.85, u));
      if (!s.pumpSfx && u > 0.3) { s.pumpSfx = true; sfx.pump?.(); }
    }
    if (s.u >= 1) {
      s.t = 0; s.u = 0; s.loaded = false;
      if (s.phase === 'open') s.phase = a.reserve > 0 ? 'shell' : 'close';
      else if (s.phase === 'shell') { if (a.mag >= magSize || a.reserve <= 0 || s.stop) s.phase = 'close'; }
      else { this.shell = null; this.reloading = 0; this.pump = 0; this.pumped = true; return; }
    }
    this.reloading = 1;
    this.reloadTotal = 1;
  }

  // ---- 視角模型動畫 ----
  _animate(dt, d, a, m, speedNorm, sprinting, look, e) {
    const ne = 1 - e;
    // 慣性擺動:彈簧阻尼,讓槍身落後於視線
    const tx = -look.x * 0.0011 * (1 - 0.75 * e), ty = -look.y * 0.0011 * (1 - 0.75 * e);
    this.swayVX += ((tx - this.swayX) * 160 - this.swayVX * 18) * dt;
    this.swayVY += ((ty - this.swayY) * 160 - this.swayVY * 18) * dt;
    this.swayX += this.swayVX * dt;
    this.swayY += this.swayVY * dt;
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    look.x = look.y = 0;
    // 後座回正
    const heavy = d.flash === 'brake' ? 0.55 : 1;
    this.kickZ += (0 - this.kickZ) * Math.min(1, dt * 14 * heavy);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 11 * heavy);
    this.kickRoll += (0 - this.kickRoll) * Math.min(1, dt * 9);
    this.kickYaw += (0 - this.kickYaw) * Math.min(1, dt * 10);
    // 移動擺動 + 呼吸
    this.bobT += dt * (sprinting ? 11 : 7.5) * speedNorm;
    const bobAmp = 0.008 * speedNorm * (sprinting ? 1.8 : 1) * (1 - 0.88 * e);
    const bx = Math.sin(this.bobT) * bobAmp;
    const by = Math.abs(Math.cos(this.bobT)) * bobAmp * 0.9;
    const br = (1 - speedNorm) * (1 - 0.92 * e);
    const breathY = Math.sin(this.idleT * 1.35) * 0.0016 * br, breathX = Math.sin(this.idleT * 0.7) * 0.0009 * br;
    this.roll += ((sprinting ? 0 : -speedNorm * 0.02 * Math.sign(this.swayVX || 0)) - this.roll) * Math.min(1, dt * 4);

    const h = d.hold;
    let px = h[0] + bx + this.swayX + breathX, py = h[1] - by + this.swayY + breathY, pz = h[2];
    let rx = 0.03, ry = 0.07, rz = this.roll;
    if (m.adsPos && e > 0) {
      px = lerp(px, m.adsPos[0] + bx * 0.3 + this.swayX * 0.4 + breathX * 0.2, e);
      py = lerp(py, m.adsPos[1] - by * 0.3 + this.swayY * 0.4 + breathY * 0.2, e);
      pz = lerp(pz, m.adsPos[2], e);
      rx = lerp(rx, m.adsRot, e);
      ry = lerp(ry, 0, e);
      rz *= ne;
    }
    pz += this.kickZ;
    rx += this.kickRot;
    ry += this.kickYaw;
    rz += this.kickRoll;

    if (sprinting) { px += -0.05; py += -0.06; rx += 0.1; ry += 0.55; }
    if (this.raise > 0) { py -= this.raise * 0.35; rx -= this.raise * 0.8; }
    const st = this._st;
    st.left = m.left; st.palm = m.palm; st.pump = this.pump; st.phase = null; st.u = 0;
    let rl = -1;
    if (this.shell) { // 霰彈裝填:槍身右傾、抬高,露出底部裝填口
      const s = this.shell;
      const tilt = s.phase === 'open' ? smooth(0, 1, s.u) : s.phase === 'close' ? 1 - smooth(0.4, 1, s.u) : 1;
      rz -= 0.62 * tilt; rx += 0.16 * tilt; ry -= 0.12 * tilt; py += 0.03 * tilt; px -= 0.03 * tilt;
      if (s.phase === 'shell') { const k = Math.sin(s.u * Math.PI); py += 0.006 * k; rx -= 0.03 * smooth(0.4, 0.6, s.u); }
      st.phase = s.phase; st.u = s.u;
    } else if (this.reloading > 0) {
      const t = 1 - this.reloading / this.reloadTotal;
      rl = t;
      const s = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7);
      const k = d.flash === 'brake' ? 0.6 : 1;
      py -= 0.13 * s * k;
      rx += 0.5 * s * k;
      rz += 0.35 * s * k;
      px -= 0.03 * s;
    }
    // 小刀/手榴彈:槍放低移出畫面
    const act = this.action;
    if (act) {
      const u = act.t / act.dur;
      const low = act.kind === 'knife' ? env(u, 0, 0.14, 0.62, 0.95) : env(u, 0, 0.18, 0.75, 1);
      py -= low * 0.3; rx -= low * 0.5; rz -= low * 0.3; px += low * 0.05;
      const keys = act.kind === 'knife' ? KNIFE_KEYS : NADE_KEYS;
      const P = keyPose(keys, act.t, _pose);
      const root = act.kind === 'knife' ? this.knife.root : this.nade.root;
      root.position.set(P[0], P[1], P[2]);
      root.rotation.set(P[3], P[4], P[5]);
    }
    // 滑套後座、槍機往復、換彈時彈匣/彈巢動作(各槍在 models.js 定義)
    if (m.info.anim) m.info.anim(this.sinceShot, rl, a.mag === 0, st);
    m.root.position.set(px, py, pz);
    m.root.rotation.set(rx, ry, rz);
    m.root.visible = !this.scoped;

    // 槍口火光
    if (this.flashT > 0) this.flashT -= dt;
    m.flash.update(dt, this.scoped);
  }
}
