import * as THREE from 'three';
import { sfx } from '../audio.js';
import { WeaponFX, DECAL } from '../weapons/fx.js';
import { CenterHud } from '../weapons/scope.js';
import { castZombies, HITS } from '../weapons/ballistics.js';
import { createGrenadeProjectile } from '../weapons/models.js';
import { Ballistics, powerOf } from '../physics/penetration.js';

// 射擊、擊殺、爆炸、手榴彈、近戰、開鏡視野、玩家受傷。以 mixin 方式掛到 Game 上
// 熱路徑(fire / updateCombat)只用下列暫存物件,不配置新記憶體
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _end = new THREE.Vector3(), _n = new THREE.Vector3();
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _m = new THREE.Vector3();
const _q = new THREE.Quaternion(), _nd = new THREE.Vector3(), _c = new THREE.Vector3();
const HIT = { bone: '', point: new THREE.Vector3(), dir: new THREE.Vector3(), dmg: 0, range: 0, weapon: '', explosive: false, melee: false }; // 傳給 z.damage 的命中資訊(重複使用)
const AGG = { hits: 0, head: false, kill: false };
const ONE = [null]; // 小刀用:只對單一殭屍做射線
const rand = (a, b) => a + Math.random() * (b - a);
const RAD = Math.PI / 180;
const NADE_R = 0.034;
const _sn = { x: 0, y: 1, z: 0 }, _bc = new THREE.Vector3(); // 樓梯坡面法線(手榴彈滾下樓梯)

// 障礙物種類 → 材質
const OBST_MAT = { statue: 'concrete', fountain: 'concrete', barricade: 'wood', health: 'wood', ammo: 'wood' };

export const combatMethods = {
  // 所有對玩家的傷害都經過這裡:防彈衣吸收、受傷方向、死亡判定。src = 傷害來源位置(可省略)
  // kind:'explosion'(手榴彈等)讓連線層分辨來源(多人:對戰算 PvP 傷害、合作不誤傷)
  damagePlayer(p, amount, src = null, kind = null) {
    if (!(amount > 0) || this.state !== 'playing') return 0;
    if (p !== this.player) return this.net ? this.net.damageRemote(p, amount, src, kind) : 0; // 遠端隊友交給連線層
    if (p.hp <= 0) return 0;
    const dealt = p.hurt(amount, this.time, src);
    this.ui.damageFlash(dealt, src, p); // [motion] 依傷害大小與方向
    this.ui.setHP(p.hp, p.maxHp);
    if (this.ui.setArmor) this.ui.setArmor(p.armor, p.maxArmor);
    if (p.hp <= 0) this.die();
    return dealt;
  },

  // ---------- 初始化(第一次 updateCombat 時) ----------
  initCombat() {
    if (this.wfx) return;
    this.wfx = new WeaponFX(this.scene, this.world);
    this.ballistics = this.world.ballistics = new Ballistics(this); // [physics] 子彈穿透/玻璃/鐵網(src/physics/penetration.js;翻越也會查櫃台玻璃)
    this.chud = new CenterHud();
    this.nades = []; // 飛行中的手榴彈
    this.gore = []; // 噴血源
    this.gorePool = [];
    this.boomLight = new THREE.PointLight(0xffa04a, 0, 24, 2); // 爆炸閃光(固定存在,避免 shader 重編)
    this.scene.add(this.boomLight);
    this.baseFov = this.camera.fov;
    this.baseWFov = this.weaponCamera.fov;
    this._mul = { speedMul: { base: 1, out: NaN }, sensMul: { base: 1, out: NaN } };
    this._sway = { x: 0, y: 0 };
    this._recoilYaw = 0;
    this._wl = 0;
    this._boom = 0;
    this._hudOpt = { show: false, scoped: false, scope: 0, optic: null, zoomMax: 1, dot: 0, ads: 0, gapPx: 8, shotgun: false, holdBreath: false, moving: false, busy: false };
    this.weapons.onEvent = (k, d) => this.weaponEvent(k, d);
    this.wfx.casings.onLand = (p, kind, n) => {
      const surf = this.world.surfaceAt ? this.world.surfaceAt(p.x, p.y, p.z) : 'tile';
      if (sfx.casing) sfx.casing(p, surf, kind, n);
    };
  },

  // 依 FOV 倍率換算(度)
  _fovFor(base, zoom) { return (2 * Math.atan(Math.tan((base * RAD) / 2) / zoom)) / RAD; },

  // 其他系統也可能設定 speedMul/sensMul:記住我們寫入的值,被別人改過就以新值為基準
  _setMul(key, f) {
    const p = this.player, s = this._mul[key];
    if (p[key] !== s.out) s.base = p[key];
    p[key] = s.base * f;
    s.out = p[key];
  },

  // ---------- 每幀(在 Game.update 開頭呼叫) ----------
  updateCombat(dt) {
    if (!this.wfx) this.initCombat();
    const p = this.player, w = this.weapons, cam = this.camera;
    const playing = this.state === 'playing';
    const active = playing && !this.paused && !this.shopUIOpen;
    if (!playing) { w.aim = false; this.input.aimHeld = false; }
    const zoom = active ? w.zoom : 1;
    const fov = this._fovFor(this.baseFov, zoom);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const wfov = this._fovFor(this.baseWFov, 1 + (Math.min(zoom, 2) - 1) * 0.5);
    if (Math.abs(this.weaponCamera.fov - wfov) > 1e-3) { this.weaponCamera.fov = wfov; this.weaponCamera.updateProjectionMatrix(); }
    const ho = this._hudOpt;
    if (!active) {
      ho.show = false; ho.scoped = false; ho.scope = 0; ho.dot = 0;
      this.chud.update(0, ho);
      return;
    }
    const def = w.def;
    const scopeGun = !!(def.ads && def.ads.scope);
    w.aim = !!this.input.aimHeld && !p.downed;
    // 開鏡:移速與靈敏度
    this._setMul('speedMul', (def.move ?? 1) * (def.ads ? 1 - 0.4 * w.ads : 1));
    this._setMul('sensMul', 1 / Math.pow(zoom, 0.92));
    // 巴雷特開鏡時 Shift 改為屏息(不衝刺)
    const scopeMode = scopeGun && (w.scoped || (w.aiming && w.ads > 0.05));
    if (scopeMode) p.keys.ShiftLeft = p.keys.ShiftRight = false;
    else if (this.input.shift && !p.keys.ShiftLeft && !p.keys.ShiftRight) p.keys.ShiftLeft = true;
    // 水平後座回正(約一半)
    const rec = this._recoilYaw * Math.min(1, dt * 5);
    this._recoilYaw -= rec;
    p.yaw -= rec * 0.5;
    // 中央 HUD + 呼吸晃動
    const spread = w.spreadNow(p.speedNorm, p.sprinting);
    ho.show = true;
    ho.scoped = w.scoped;
    ho.scope = w.scopeAmt; // 狙擊鏡/ACOG 鏡內畫面淡入
    ho.optic = w.optic;
    ho.zoomMax = def.ads ? def.ads.zoom : 1;
    ho.dot = w.dotAmt; // 紅點反射鏡光點
    ho.ads = w.ads;
    ho.gapPx = (Math.tan(spread) / Math.tan((cam.fov * RAD) / 2)) * (window.innerHeight / 2);
    ho.shotgun = !!def.pellets;
    ho.holdBreath = !!this.input.shift;
    ho.moving = p.speedNorm > 0.2;
    ho.busy = w.busy || w.reloading > 0;
    const sw = this.chud.update(dt, ho);
    p.yaw += sw.x - this._sway.x;
    p.pitch += sw.y - this._sway.y;
    this._sway.x = sw.x;
    this._sway.y = sw.y;
    // 手持武器的槍口光
    if (this._wl > 0) { this._wl -= dt; if (this._wl <= 0) this.weaponLight.intensity = 0; }
    // 爆炸閃光衰減
    if (this._boom > 0) {
      this._boom = Math.max(0, this._boom - dt);
      const k = this._boom / 0.35;
      this.boomLight.intensity = 85 * k * k * (0.85 + Math.random() * 0.3);
    } else this.boomLight.intensity = 0;
    this._updateNades(dt);
    if (this.ballistics) this.ballistics.update(dt); // [physics] 玻璃碎片
    this._updateGore(dt);
    this.wfx.update(dt);
  },

  // ---------- 武器事件 ----------
  weaponEvent(kind, data) {
    if (kind === 'eject') this._eject(data.id, data.m, 1);
    else if (kind === 'drop') this._eject(data.id, this.weapons.models[data.id], data.n);
    else if (kind === 'knife') this.meleeHit();
    else if (kind === 'throw') this.releaseGrenade();
    else if (kind === 'pin') sfx.grenadePin();
  },

  // 拋殼:從視角模型的拋殼口換算到世界座標(依兩台相機 FOV 差修正,讓彈殼出現在畫面上同一位置)
  _eject(id, m, n) {
    const W = this.weapons.def, cam = this.camera, wc = this.weaponCamera;
    const kind = W.casing;
    if (!kind || !m || this.weapons.scoped) return;
    m.root.updateMatrixWorld(true);
    m.eject.getWorldPosition(_a); // 手持場景座標 = 相機座標
    const k = Math.tan((cam.fov * RAD) / 2) / Math.tan((wc.fov * RAD) / 2);
    _a.x *= k; _a.y *= k;
    cam.updateMatrixWorld(true);
    _p.copy(_a).applyMatrix4(cam.matrixWorld);
    // 拋出方向:槍身右上方(相機座標)
    _q.setFromRotationMatrix(m.root.matrixWorld);
    const p = this.player;
    for (let i = 0; i < n; i++) {
      if (id === 'revolver') _b.set(rand(-0.2, 0.2), -1.2, rand(-0.2, 0.3)); // 擺出彈巢倒出空殼
      else if (kind === 'shell') _b.set(rand(1.4, 2.2), rand(1.2, 1.8), rand(-0.2, 0.3));
      else if (id === 'ak47') _b.set(rand(2.4, 3.4), rand(0.8, 1.4), rand(-0.9, -0.3));
      else if (id === 'barrett') _b.set(rand(1.6, 2.4), rand(0.9, 1.4), rand(-0.5, 0));
      else _b.set(rand(2, 3), rand(1.5, 2.3), rand(0.1, 0.6));
      _b.applyQuaternion(_q).applyQuaternion(cam.quaternion);
      _b.x += p.vx || 0; _b.z += p.vz || 0;
      _m.copy(_p);
      if (n > 1) _m.x += rand(-0.02, 0.02), _m.z += rand(-0.02, 0.02);
      this.wfx.casings.spawn(kind, _m, _b, W.casingSize || [0.02, 0.07], k * 0.9);
    }
  },

  // ---------- 開火 ----------
  fire(def, id, speedNorm) {
    if (!this.wfx) this.initCombat();
    const w = this.weapons, p = this.player, cam = this.camera;
    cam.updateMatrixWorld(true);
    const origin = cam.getWorldPosition(_o);
    const spread = w.spreadNow(speedNorm, p.sprinting);
    // 後座力(依圖樣)
    const rk = w.recoilKick();
    p.kick(rk[0], 0);
    p.yaw += rk[1];
    this._recoilYaw += rk[1];
    const pellets = def.pellets || 1;
    const dmg = w.stat(id, 'damage');
    AGG.hits = 0; AGG.head = false; AGG.kill = false;
    this._killMark = false;
    for (let i = 0; i < pellets; i++) {
      const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      _d.set(Math.cos(a) * Math.tan(r), Math.sin(a) * Math.tan(r), -1).normalize().applyQuaternion(cam.quaternion);
      this._bullet(origin, _d, def, id, dmg, i, pellets);
    }
    // 槍口閃光(照亮環境)
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const big = def.flash === 'brake' ? 2 : def.flash === 'shotgun' ? 1.6 : def.flash === 'pistol' ? 0.8 : 1;
    this.muzzleLight.position.copy(origin).addScaledVector(_f, 0.8);
    this.muzzleLight.intensity = 38 * big;
    this.weaponLight.intensity = 6 * Math.min(1.6, big);
    this._wl = 0.045;
    // 槍口煙(大口徑)
    if (big >= 1.6 || id === 'revolver') this.wfx.muzzleSmoke(_a.copy(origin).addScaledVector(_f, w.scoped ? 1.2 : 0.75).addScaledVector(_up, w.scoped ? -0.08 : -0.12), _f, big);
    if (w.scoped) this.chud.kick(1);
    if (def.flash === 'brake') p.addShake(w.scoped ? 0.12 : 0.25);
    // 命中標記(擊殺時由 onKill 顯示)
    if (AGG.hits && !this._killMark) {
      this.chud.marker(AGG.head ? 'head' : 'hit');
      (AGG.head ? sfx.headshot : sfx.hit)();
    }
    this.updateAmmoHud();
  },

  // 傷害距離衰減
  _falloff(def, t) {
    const f = def.falloff;
    if (!f) return 1;
    if (t <= f[0]) return 1;
    if (t >= f[1]) return def.minDmg;
    return 1 - ((1 - def.minDmg) * (t - f[0])) / (f[1] - f[0]);
  },

  // 單一子彈/彈丸:穿透殭屍(每穿一隻 × penMul),最後打到牆/地板
  _bullet(o, d, def, id, dmg0, idx, pellets) {
    const maxD = 140;
    const W = this.world, B = this.ballistics;
    let lim = W.rayDistance(o.x, o.y, o.z, d.x, d.y, d.z, maxD);
    const P0 = powerOf(def, id);
    if (B) lim = B.trace(o, d, lim, maxD, P0); // [physics] 依材質與厚度穿過玻璃/木板/鐵網/可穿透道具
    const endBox = B ? B.endBox : W.rayBox;
    const n = castZombies(this._targets(), o, d, lim);
    const pen = def.penetrate || 0, penMul = def.penMul ?? 0.7;
    let mul = 1, count = 0, stopped = false, endT = lim;
    const power = Math.min(1, dmg0 / 120);
    for (let i = 0; i < n; i++) {
      const h = HITS[i], z = h.z;
      if (!z.alive) continue;
      _p.copy(o).addScaledVector(d, h.t);
      const dmg = dmg0 * mul * (B ? B.mulAt(h.t) * this._falloff(def, h.t + B.extraAt(h.t)) : this._falloff(def, h.t)); // 遮蔽物後方的殭屍傷害較低
      HIT.bone = h.bone; HIT.point.copy(_p); HIT.dir.copy(d); HIT.dmg = dmg * (h.part === 'head' ? 2 : 1); HIT.range = h.t; HIT.weapon = id; HIT.explosive = false; HIT.melee = false;
      this._impulse(z, _p, d, dmg * (pellets > 1 ? 2.5 : 4));
      const killed = z.damage(dmg, h.part, HIT);
      AGG.hits++;
      if (h.part === 'head') AGG.head = true;
      // 打擊效果:血霧、血滴;巨屍護甲冒火花
      _n.copy(d).negate();
      if (h.part === 'armor') { this.wfx.impact(_p, _n, d, 'metal', power * 0.5); this.burst(_p, _n, 'blood', 2, z.pos.y); }
      else {
        this.wfx.impact(_p, _n, d, 'flesh', pellets > 1 ? 0.25 : Math.min(1, dmg / 60));
        if (pellets === 1 || idx % 3 === 0) this.burst(_p, _n, 'blood', h.part === 'head' ? 10 : pellets > 1 ? 3 : 6, z.pos.y);
        if (dmg >= 25 && Math.random() < (pellets > 1 ? 0.25 : 0.8)) this._wound(z, h, _p, d, dmg);
        this._wallBlood(_p, d, dmg);
      }
      if (z.type === 'bloater') this.burst(_p, _n, 'bile', pellets > 1 ? 2 : 6, z.pos.y);
      if (killed) { AGG.kill = true; this.onKill(z, this.player); }
      count++;
      mul *= penMul;
      if (count > pen) { stopped = true; endT = h.t; break; }
    }
    _end.copy(o).addScaledVector(d, endT);
    if (B) B.emit(o, d, endT, power, pellets === 1 || idx === 0, P0); // 被穿過的玻璃/道具的效果(子彈先被殭屍擋下就不畫)
    if (!stopped && lim < maxD) this._worldHit(_end, d, def, power, idx, pellets, endBox);
    // 曳光:霰彈只畫部分彈丸
    if (pellets === 1 || idx % 3 === 0) {
      const cam = this.camera;
      _a.set(0.16, -0.12, -0.7);
      if (this.weapons.scoped) _a.set(0, -0.05, -0.6);
      _a.applyMatrix4(cam.matrixWorld);
      const brake = def.flash === 'brake';
      this.wfx.tracers.add(_a, _end, brake ? 0.012 : pellets > 1 ? 0.004 : 0.006, brake ? 0.12 : 0.07, brake ? 2.2 : 1.6, brake ? 1.8 : 1.25, brake ? 1.4 : 0.8, brake ? 900 : 600);
      if (brake) { // 巴雷特:空氣中留下淡淡的彈道煙
        const L = _a.distanceTo(_end);
        _b.subVectors(_end, _a).normalize();
        for (let s = 1.5; s < Math.min(L, 40); s += 1.8) this.wfx.smoke.spawn(_a.x + _b.x * s, _a.y + _b.y * s, _a.z + _b.z * s, 0, 0.05, 0, 0.06, 0.22, 0.62, 0.62, 0.62, 0.1, 1.6 + Math.random(), 0.05, 1, 0.01);
      }
      if (this.net) this.net.onShot(_end, count > 0); // [net] 彈著點(遠端玩家畫曳光與命中特效)
    }
  },

  // 射線判定的目標:殭屍 + 連線層提供的額外目標(對戰時的遠端玩家命中盒,結構同殭屍:alive/pos/type/root/hitboxes/damage)
  _targets() {
    const x = this.extraTargets;
    if (!x || !x.length) return this.zombies;
    const out = this._tl || (this._tl = []);
    out.length = 0;
    for (let i = 0; i < this.zombies.length; i++) out.push(this.zombies[i]);
    for (let i = 0; i < x.length; i++) out.push(x[i]);
    return out;
  },

  // 擊殺前記下衝量(布娃娃依擊殺方向倒下),並套用到移動速度
  _impulse(z, point, dir, force) {
    const li = z.lastImpulse || (z.lastImpulse = { point: new THREE.Vector3(), dir: new THREE.Vector3(), force: 0 });
    li.point.copy(point); li.dir.copy(dir); li.force = force;
  },

  // 子彈打到世界:估算法線(世界都是軸對齊方塊/水平樓板)→ 判斷材質 → 碎屑/火花/粉塵/彈孔 → 物理物件
  _worldHit(pt, d, def, power, idx, pellets, box = null) {
    const n = this._surfaceNormal(pt, d, _nd);
    const mat = box && box.mat ? box.mat : this._surfaceMat(pt, n);
    if (pellets === 1 || idx < 4) this.wfx.impact(pt, n, d, mat, power);
    else this.wfx.decals.add(pt, n, 0.035 + Math.random() * 0.02, mat === 'wood' ? DECAL.wood : mat === 'metal' ? DECAL.metal : mat === 'tile' ? DECAL.tile : DECAL.concrete, 40);
    if (idx === 0) sfx.wall(pt, mat);
    // 金屬跳彈:淺角度時往反射方向再飛一小段
    if (mat === 'metal' && pellets === 1) {
      const dn = d.dot(n);
      if (dn > -0.45 && Math.random() < 0.7) {
        _r.copy(d).addScaledVector(n, -2 * dn).normalize();
        _r.x += rand(-0.1, 0.1); _r.y += rand(-0.05, 0.15); _r.z += rand(-0.1, 0.1);
        _r.normalize();
        const L = this.world.rayDistance(pt.x + n.x * 0.02, pt.y + n.y * 0.02, pt.z + n.z * 0.02, _r.x, _r.y, _r.z, 12);
        _b.copy(pt).addScaledVector(_r, L);
        this.wfx.tracers.add(pt, _b, 0.004, 0.09, 2, 1.4, 0.6, 260);
      }
    }
    if (this.physics && this.physics.hit) this.physics.hit(pt, d, (def.damage || 20) * (def.pellets ? 0.6 : 1) * 0.08);
  },

  // 命中點的表面法線:從命中點沿射線退回 2cm,往三個軸向探測最近的表面
  _surfaceNormal(pt, d, out) {
    const W = this.world;
    const bx = pt.x - d.x * 0.02, by = pt.y - d.y * 0.02, bz = pt.z - d.z * 0.02;
    let best = 0.08, ax = -1;
    if (Math.abs(d.x) > 1e-3) { const t = W.rayDistance(bx, by, bz, Math.sign(d.x), 0, 0, 0.08); if (t < best) { best = t; ax = 0; } }
    if (Math.abs(d.y) > 1e-3) { const t = W.rayDistance(bx, by, bz, 0, Math.sign(d.y), 0, 0.08); if (t < best) { best = t; ax = 1; } }
    if (Math.abs(d.z) > 1e-3) { const t = W.rayDistance(bx, by, bz, 0, 0, Math.sign(d.z), 0.08); if (t < best) { best = t; ax = 2; } }
    if (ax === 0) return out.set(-Math.sign(d.x), 0, 0);
    if (ax === 1) { // 地板/天花板;往下打到樓梯坡面時用坡面法線(手榴彈才會滾下樓梯)
      if (d.y < 0 && W.normalAt) { W.normalAt(pt.x, pt.z, pt.y, _sn); if (_sn.y < 0.999) return out.set(_sn.x, _sn.y, _sn.z); }
      return out.set(0, -Math.sign(d.y), 0);
    }
    if (ax === 2) return out.set(0, 0, -Math.sign(d.z));
    // 斜面(樓梯/坡道)或探測失敗:靠近地面就當地板,否則面向射手
    const g = W.groundY ? W.groundY(pt.x, pt.z, pt.y + 0.2) : null;
    if (g !== null && g !== undefined && Math.abs(pt.y - g) < 0.15) { // 地面:樓梯/坡道用坡面法線
      if (W.normalAt) { W.normalAt(pt.x, pt.z, g, _sn); return out.set(_sn.x, _sn.y, _sn.z); }
      return out.set(0, 1, 0);
    }
    return out.copy(d).negate();
  },

  // 依命中點與法線判斷材質
  _surfaceMat(pt, n) {
    const W = this.world;
    if (n.y > 0.7) return W.surfaceAt ? W.surfaceAt(pt.x, pt.y + 0.05, pt.z) : 'tile';
    const L = W.layout;
    if (L && L.obstacles) {
      for (const o of L.obstacles) {
        if (Math.abs(pt.x - o.x) < o.sx / 2 + 0.15 && Math.abs(pt.z - o.z) < o.sz / 2 + 0.15 && Math.abs(pt.y - (o.y || 0)) < 4) return OBST_MAT[o.kind] || 'metal';
      }
    }
    if (W.boxes) {
      for (const b of W.boxes) {
        if (b.moveOnly) continue;
        if (pt.x > b.minX - 0.05 && pt.x < b.maxX + 0.05 && pt.z > b.minZ - 0.05 && pt.z < b.maxZ + 0.05 && pt.y < (b.y0 || 0) + b.height + 0.05 && pt.y > (b.y0 || 0) - 0.05) return b.mat || 'wood';
      }
    }
    const zone = W.zoneAt ? W.zoneAt(pt.x + n.x * 0.3, pt.y + n.y * 0.3, pt.z + n.z * 0.3) : null;
    if (n.y < -0.7) return zone && zone.ceil === 'pipes' ? 'metal' : 'concrete';
    const wall = zone && zone.wall;
    if (!wall) return 'concrete';
    if (/tile/.test(wall)) return 'tile';
    if (/wood/.test(wall)) return 'wood';
    if (/brick/.test(wall)) return 'brick';
    if (/padded|fabric/.test(wall)) return 'fabric';
    if (/glass/.test(wall)) return 'glass';
    if (/metal/.test(wall)) return 'metal';
    return 'concrete';
  },

  // 子彈穿過殭屍後,後方近距離的牆/地上留下噴濺血跡
  _wallBlood(pt, d, dmg) {
    if (dmg < 20 || Math.random() > 0.55) return;
    const W = this.world;
    const L = W.rayDistance(pt.x, pt.y, pt.z, d.x, d.y + 0.15, d.z, 2.6);
    if (L >= 2.6) {
      // 沒有牆:血濺到腳下地板
      const g = W.groundY ? W.groundY(pt.x + d.x, pt.z + d.z, pt.y) : null;
      if (g !== null && g !== undefined && pt.y - g < 2.2) { _b.set(pt.x + d.x * rand(0.6, 1.4), g, pt.z + d.z * rand(0.6, 1.4)); this.wfx.decals.add(_b, _up, rand(0.35, 0.7), DECAL.blood, 70); }
      return;
    }
    _r.set(d.x, d.y + 0.15, d.z).normalize();
    _b.copy(pt).addScaledVector(_r, L);
    const n = this._surfaceNormal(_b, _r, _nd);
    this.wfx.decals.add(_b, n, rand(0.4, 0.8) * Math.min(1.4, dmg / 50), DECAL.blood, 70);
  },

  // ---------- 噴血源(爆頭血柱/斷肢/傷口) ----------
  _goreAdd(z, bone, off, dir, dur, rate, power) {
    if (!bone || this.gore.length > 28 || !Number.isFinite(off.x + off.y + off.z)) return; // 已斷開(縮成 0)的骨骼反矩陣會是 NaN
    const e = this.gorePool.pop() || { z: null, bone: null, off: new THREE.Vector3(), dir: new THREE.Vector3(), t: 0, dur: 0, rate: 0, acc: 0, power: 1 };
    e.z = z; e.bone = bone; e.off.copy(off); e.dir.copy(dir).normalize(); e.t = 0; e.dur = dur; e.rate = rate; e.acc = 0; e.power = power;
    this.gore.push(e);
  },

  // 傷口冒血:把命中點換到骨骼區域座標,短時間往外噴
  _wound(z, h, pt, d, dmg) {
    const bone = h.h.parent;
    if (!bone) return;
    _a.copy(pt);
    bone.worldToLocal(_a);
    if (!Number.isFinite(_a.x + _a.y + _a.z)) return; // 打到已斷開的部位
    bone.getWorldQuaternion(_q).invert();
    _b.copy(d).negate().applyQuaternion(_q);
    _b.y += 0.3;
    this._goreAdd(z, bone, _a, _b, 0.35 + Math.min(0.5, dmg / 120), 45, 0.6);
  },

  _updateGore(dt) {
    const fx = this.wfx;
    for (let i = this.gore.length - 1; i >= 0; i--) {
      const e = this.gore[i];
      e.t += dt;
      if (e.t >= e.dur || !e.z.root.parent) { this.gore[i] = this.gore[this.gore.length - 1]; this.gore.pop(); this.gorePool.push(e); continue; }
      const u = e.t / e.dur;
      const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(e.t * 14)); // 心跳式一陣一陣
      const k = (1 - u) * (1 - u) * pulse;
      e.acc += e.rate * dt * k;
      if (e.acc < 1) continue;
      e.bone.updateWorldMatrix(true, false);
      _p.copy(e.off).applyMatrix4(e.bone.matrixWorld);
      _u.copy(e.dir).transformDirection(e.bone.matrixWorld);
      const fl = fx.floor(_p.x, _p.y, _p.z);
      while (e.acc >= 1) {
        e.acc -= 1;
        const sp = (2.2 + Math.random() * 1.8) * e.power * (0.5 + k);
        const ds = rand(0.006, 0.011);
        fx.debris.spawn(_p.x, _p.y, _p.z, _u.x * sp + rand(-0.4, 0.4), _u.y * sp + rand(-0.2, 0.4), _u.z * sp + rand(-0.4, 0.4), ds, ds, ds * 1.6, 0x320404, rand(0.6, 1.4), fl, 0, 0.3, 9.8, 4);
        if (Math.random() < 0.18) fx.smoke.spawn(_p.x, _p.y, _p.z, _u.x * sp * 0.3, _u.y * sp * 0.3, _u.z * sp * 0.3, 0.05, 0.22, 0.13, 0.01, 0.01, 0.45, 0.5, -0.4, 3, 0.04);
      }
    }
  },

  // killer:擊殺者(多人時金幣歸屬用)
  // hit:擊殺的那一下 { point, dir, force } 或 { blast, radius, strength }(布娃娃衝量);省略時用 z.lastImpulse
  onKill(z, killer = this.player, hit = null) {
    if (z._killed) return;
    z._killed = true;
    this.coins.drop(z.pos.x, z.pos.y, z.pos.z, z.T.coins);
    z.killer = killer;
    this.kills = (this.kills || 0) + 1;
    this.killFx(z, hit);
    if (killer === this.player && this.wfx) {
      this._killMark = true;
      this.chud.marker('kill', z.killPart === 'head');
      sfx.killConfirm();
    }
  },

  // 屍體:血池、布娃娃、斷口噴血(不含金幣與擊殺計數;連線層處理隊友的擊殺時也用這個)
  killFx(z, hit = null) {
    if (z.type !== 'bloater') this.addPool(z.pos.x, z.pos.y, z.pos.z);
    z.corpse = z.type === 'brute' ? 9 : 6;
    this.physics?.ragdoll(z, hit || z.lastImpulse || null); // 物理布娃娃(src/physics);不可用時沿用 zombie.js 的死亡動畫
    if (!this.wfx) return;
    const g = z.gore;
    if (g) { // 斷頭/斷肢:從斷口噴出血柱
      const parent = z.b[g.bone], child = z.b[g.child];
      if (parent && child) {
        _a.copy(child.position);
        _b.copy(child.position).normalize();
        if (g.kind === 'head' || g.kind === 'headBlood') _b.set(0, 1, 0.25);
        this._goreAdd(z, parent, _a, _b, g.kind === 'head' ? 1.8 : g.kind === 'headBlood' ? 0.9 : 1.1, g.kind === 'head' ? 75 : 45, g.kind === 'head' ? 1.25 : 0.8);
        parent.updateWorldMatrix(true, false);
        _p.copy(_a).applyMatrix4(parent.matrixWorld);
        for (let i = 0; i < (g.kind === 'head' ? 22 : 12); i++) { const s = rand(0.012, 0.032); this.wfx.debris.spawn(_p.x, _p.y, _p.z, rand(-2, 2), rand(0.5, 3.5), rand(-2, 2), s, s * rand(0.6, 1), s * rand(0.8, 1.3), Math.random() < 0.7 ? 0x2c0505 : 0x4a2620, rand(2, 4), this.wfx.floor(_p.x, _p.y, _p.z), 0.15, 0.6, 9.8, 14); }
        this.wfx.smoke.spawn(_p.x, _p.y, _p.z, 0, 0.4, 0, 0.1, 0.6, 0.14, 0.012, 0.01, 0.55, 0.9, -0.2, 2, 0.03);
      }
    }
  },

  // 膿腫者死亡時爆開:傷害周圍的玩家與殭屍,留下毒氣(不同樓層幾乎不受影響)
  // fxOnly:只有特效與物理(連線時其他人畫面上的代理殭屍;傷害由房主結算)
  explode(z, fxOnly = false) {
    const E = z.T.explode, c = z.pos, p = this.player;
    const at = new THREE.Vector3(c.x, c.y + 1.0, c.z);
    this.hazards.flash(at, 6);
    this.hazards.gas(c.x, c.y, c.z);
    this.burst(at, _up, 'bile', 40, c.y);
    this.burst(at, _up, 'blood', 30, c.y);
    this.addPool(c.x, c.y, c.z);
    this.muzzleLight.position.copy(at);
    this.muzzleLight.intensity = 30;
    sfx.burst(z.vp);
    if (this.wfx) {
      for (let i = 0; i < 14; i++) this.wfx.smoke.spawn(at.x + rand(-0.4, 0.4), at.y + rand(-0.3, 0.4), at.z + rand(-0.4, 0.4), rand(-1.4, 1.4), rand(0, 1.2), rand(-1.4, 1.4), 0.3, rand(1.2, 2.2), 0.32, 0.36, 0.08, 0.55, rand(1.5, 3), 0.1, 1.5, 0.05);
      this.wfx.decals.add(_p.set(c.x, c.y, c.z), _up, 2.2, DECAL.blood, 90);
    }
    // 物理:膿腫者爆開後倒下,周圍的道具、屍體被炸開(src/physics)
    this.physics?.ragdoll(z, { blast: at, radius: E.radius, strength: 9 });
    if (this.physics && this.physics.impulseAt) this.physics.impulseAt(at, E.radius * 1.6, 9);
    if (fxOnly) return;
    const dist = (q) => Math.hypot(q.x - c.x, q.z - c.z) + Math.abs(q.y - c.y) * 1.5;
    for (const pl of this.players) {
      const d = dist(pl.pos);
      const cov = d < E.radius ? this._blastCover(at, pl.pos.x, pl.pos.y, pl.pos.z, 1.7) : 0; // 牆後不受傷(矮掩體擋一部分)
      if (cov > 0) {
        this.damagePlayer(pl, Math.round((E.player * (1 - d / E.radius) + 5) * cov), c);
        if (pl === p) p.addShake(0.7);
      }
    }
    const blast = { blast: at, radius: E.radius, strength: 9 };
    for (const o of this.zombies) {
      if (o === z || !o.alive) continue;
      const od = dist(o.pos);
      if (od >= E.radius) continue;
      const cov = this._blastCover(at, o.pos.x, o.pos.y, o.pos.z, o.type === 'crawler' ? 0.6 : 1.6);
      if (cov <= 0) continue;
      _d.set(o.pos.x - c.x, 0.4, o.pos.z - c.z).normalize();
      this._impulse(o, o.pos, _d, 200 * (1 - od / E.radius) * cov);
      if (o.damage((E.zombie * (1 - od / E.radius) + 10) * cov, 'body')) this.onKill(o, z.killer, blast);
    }
  },

  // ---------- 通用爆炸 ----------
  // opts:{ owner 擊殺者, self 對玩家的傷害倍率(預設 0.6), shake, kind:'grenade'|... , fx:false 不畫特效, harmless:只有特效(連線:別人丟的手榴彈) }
  explodeAt(pos, radius = 6, damage = 160, opts = {}) {
    if (!this.wfx) this.initCombat();
    const owner = opts.owner || this.player;
    const W = this.world, fx = this.wfx;
    const c = _c.copy(pos);
    const g0 = W.groundY ? W.groundY(c.x, c.z, c.y + 0.3) : null;
    const gy = g0 === null || g0 === undefined ? c.y - 0.03 : g0;
    const size = Math.min(1.5, radius / 6);
    if (opts.fx !== false) {
      // 閃光、火球、煙柱、地面揚塵、碎屑、火花、餘燼、焦痕
      this.boomLight.position.set(c.x, c.y + 0.7, c.z);
      this._boom = 0.35;
      this.boomLight.intensity = 85;
      fx.fire.spawn(c.x, c.y + 0.4, c.z, 0, 0.5, 0, 0.5, 3.2 * size, 3.2, 2, 0.9, 0.9, 0.11, 0, 0, 0.01);
      for (let i = 0; i < 9; i++) fx.fire.spawn(c.x + rand(-0.3, 0.3), c.y + 0.3 + rand(0, 0.5), c.z + rand(-0.3, 0.3), rand(-3.2, 3.2) * size, rand(0.5, 3.5) * size, rand(-3.2, 3.2) * size, 0.3, rand(1.2, 2.2) * size, 1.9, 0.75, 0.2, 0.75, rand(0.22, 0.45), 1.2, 3.5, 0.04);
      for (let i = 0; i < 24; i++) fx.smoke.spawn(c.x + rand(-0.6, 0.6), c.y + rand(0.2, 1.3), c.z + rand(-0.6, 0.6), rand(-1.6, 1.6), rand(0.6, 2.8), rand(-1.6, 1.6), 0.6, rand(2.2, 4.2) * size, 0.06, 0.055, 0.05, 0.85, rand(3.5, 6.5), 0.35, 1.1, 0.12);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; fx.smoke.spawn(c.x + Math.cos(a) * 0.4, gy + 0.15, c.z + Math.sin(a) * 0.4, Math.cos(a) * 6 * size, 0.2, Math.sin(a) * 6 * size, 0.3, rand(1.2, 2) * size, 0.3, 0.28, 0.25, 0.5, rand(1.5, 2.6), 0.15, 2.4, 0.05); }
      for (let i = 0; i < 46; i++) { const s = rand(0.01, 0.045); fx.debris.spawn(c.x, c.y + 0.2, c.z, rand(-7, 7) * size, rand(2, 9) * size, rand(-7, 7) * size, s, s * rand(0.5, 1), s * rand(0.6, 1.2), Math.random() < 0.5 ? 0x2a2622 : 0x5a5650, rand(2.5, 5), gy, 0.35, 0.3, 9.8, 22); }
      for (let i = 0; i < 60; i++) fx.glow.spawn(c.x, c.y + 0.3, c.z, rand(-11, 11) * size, rand(1, 11) * size, rand(-11, 11) * size, 6, 3, 1, rand(0.3, 0.9), rand(0.008, 0.016), gy, 9.8, 0.9);
      for (let i = 0; i < 22; i++) fx.glow.spawn(c.x + rand(-0.5, 0.5), c.y + rand(0.2, 1.2), c.z + rand(-0.5, 0.5), rand(-1.5, 1.5), rand(1, 3.5), rand(-1.5, 1.5), 3.2, 1.2, 0.3, rand(1.2, 2.8), rand(0.006, 0.01), gy, -0.6, 1.4);
      _p.set(c.x, gy, c.z);
      if (Math.abs(c.y - gy) < 1.2) fx.decals.add(_p, _up, radius * 0.5, DECAL.scorch, 150);
      this.burst(_a.set(c.x, c.y + 0.3, c.z), _up, 'dust', 16, gy);
      sfx.explosion(c, size);
    }
    if (this.physics && this.physics.impulseAt) this.physics.impulseAt(c, radius * 1.2, damage * 0.1);
    if (this.ballistics) this.ballistics.blast(c, radius); // 震碎附近(看得到爆心)的窗玻璃
    if (opts.harmless) { // 只有震動(傷害由丟的人那一端結算)
      const pl = this.player, d = Math.hypot(pl.pos.x - c.x, pl.pos.y + 1 - c.y, pl.pos.z - c.z);
      pl.addShake(Math.min(1.2, (opts.shake ?? 1) * 1.4 * Math.max(0, 1 - d / (radius * 3.5))));
      return;
    }
    // 傷害係數:距離(含高度差)、樓層差、視線遮蔽
    const factor = (x, y, z, feetY) => {
      const dx = x - c.x, dy = y - c.y, dz = z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz + dy * dy * 1.3);
      if (dist >= radius) return 0;
      let f = Math.pow(1 - dist / radius, 1.25);
      const dh = Math.abs(feetY - gy);
      if (dh > 2.4) f *= 0.15; // 不同樓層:樓板擋住大部分
      return f * this._blastCover(_bc.set(c.x, c.y + 0.25, c.z), x, feetY, z, y - feetY + 0.7); // 牆後沒有傷害、矮掩體後只有一部分
    };
    let hits = 0, head = false;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const cy = z.pos.y + (z.type === 'crawler' ? 0.3 : z.type === 'brute' ? 1.2 : 0.95);
      const f = factor(z.pos.x, cy, z.pos.z, z.pos.y);
      if (f <= 0.02) continue;
      _d.set(z.pos.x - c.x, 0.35, z.pos.z - c.z).normalize();
      const heavy = z.type === 'brute' ? 0.2 : z.type === 'bloater' ? 0.5 : 1;
      z.vel.x += _d.x * 9 * f * heavy; z.vel.z += _d.z * 9 * f * heavy;
      _b.set(z.pos.x, cy, z.pos.z);
      this._impulse(z, _b, _d, damage * 3 * f);
      HIT.bone = ''; HIT.point.copy(_b); HIT.dir.copy(_d); HIT.dmg = damage * f; HIT.range = 0; HIT.weapon = opts.kind || 'explosion'; HIT.explosive = true; HIT.melee = false;
      const killed = z.damage(damage * f, 'body', HIT);
      hits++;
      if (killed) {
        z.vel.x += _d.x * 6 * heavy; z.vel.z += _d.z * 6 * heavy; // 屍體被炸飛
        this.onKill(z, owner);
      }
    }
    for (const pl of this.players) {
      const f = factor(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.pos.y);
      if (pl === this.player) {
        const d = Math.hypot(pl.pos.x - c.x, pl.pos.y + 1 - c.y, pl.pos.z - c.z);
        pl.addShake(Math.min(1.2, (opts.shake ?? 1) * 1.4 * Math.max(0, 1 - d / (radius * 3.5))));
      }
      if (f <= 0.02) continue;
      _d.set(pl.pos.x - c.x, 0, pl.pos.z - c.z);
      if (_d.lengthSq() < 1e-4) _d.set(1, 0, 0);
      _d.normalize();
      if (pl.knock) pl.knock(_d.x * 7 * f, _d.z * 7 * f, 'explosion');
      this.damagePlayer(pl, Math.round(damage * (opts.self ?? 0.6) * f), c, 'explosion');
    }
    if (hits && owner === this.player && !this._killMark) this.chud.marker('hit');
    this._killMark = false;
  },

  // 爆炸遮蔽(0..1):爆心 c → 目標(腳底 feetY、身高 h)的胸口線看得到 = 1;
  // 否則看頭頂/腳邊兩條線:看得到各 0.4、被道具(矮牆、車、櫃子)擋住各 0.12(碎片/衝擊波繞過去一點)、被牆/樓板擋住 0
  _blastCover(c, x, feetY, z, h) {
    const W = this.world;
    if (W.hasLineOfSight(c.x, c.y, c.z, x, feetY + h * 0.6, z)) return 1;
    let f = W.rayBox ? (W.rayBox.pm === 'fabric' ? 0.6 : 0.12) : 0;
    for (let k = 0; k < 2; k++) {
      if (W.hasLineOfSight(c.x, c.y, c.z, x, feetY + (k ? 0.2 : h * 0.95), z)) f += 0.4;
      else if (W.rayBox) f += 0.12;
    }
    return f > 1 ? 1 : f;
  },

  // ---------- 手榴彈 ----------
  throwGrenade() {
    const p = this.player, w = this.weapons;
    if (!this.wfx) this.initCombat();
    if ((p.grenades | 0) <= 0) { sfx.pickupDeny(); return false; }
    return w.startAction('grenade');
  },

  releaseGrenade() {
    const p = this.player, cam = this.camera, W = this.world;
    if ((p.grenades | 0) <= 0) return;
    p.grenades--;
    if (this.ui.setGrenades) this.ui.setGrenades(p.grenades);
    cam.updateMatrixWorld(true);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.getWorldPosition(_o);
    _a.copy(_f).multiplyScalar(0.4).addScaledVector(_r, 0.16).addScaledVector(_u, -0.04);
    const L = _a.length();
    _b.copy(_a).normalize();
    const free = W.rayDistance(_o.x, _o.y, _o.z, _b.x, _b.y, _b.z, L + NADE_R);
    const start = new THREE.Vector3().copy(_o).addScaledVector(_b, Math.max(0, Math.min(L, free - NADE_R - 0.02)));
    const vel = new THREE.Vector3().copy(_f).multiplyScalar(14).addScaledVector(_up, 3.4);
    vel.x += (p.vx || 0) * 0.8; vel.z += (p.vz || 0) * 0.8;
    this.addNade(start, vel, { owner: p });
    if (this.net) this.net.onGrenade(start, vel); // [net] 其他人畫面上的同一顆手榴彈(只有特效)
  },

  // 飛行中的手榴彈:o = { owner, t(已經過的時間), harmless }
  addNade(start, vel, o = {}) {
    if (!this.wfx) this.initCombat();
    const mesh = createGrenadeProjectile();
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.nades.push({ mesh, p: start, v: vel, t: o.t ?? 0.28, fuse: 2.5, rest: false, spin: new THREE.Vector3(rand(-14, 14), rand(-6, 6), rand(-14, 14)), owner: o.owner || this.player, harmless: !!o.harmless });
  },

  _updateNades(dt) {
    const W = this.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i];
      g.t += dt;
      if (g.t >= g.fuse) {
        this.scene.remove(g.mesh);
        this.nades.splice(i, 1);
        this.explodeAt(_p.copy(g.p).addScaledVector(_up, 0.1), 7, 230, { owner: g.owner, kind: 'grenade', harmless: g.harmless });
        continue;
      }
      if (!g.rest) {
        const steps = 3, h = dt / steps;
        for (let s = 0; s < steps; s++) {
          g.v.y -= 9.8 * h;
          const sp = g.v.length();
          if (sp < 1e-4) break;
          _d.copy(g.v).multiplyScalar(1 / sp);
          const move = sp * h;
          if (this.ballistics && this.ballistics.smash(g.p, _d, move + NADE_R)) g.v.multiplyScalar(0.7); // 撞破玻璃:穿過去、減速
          const hit = W.rayDistance(g.p.x, g.p.y, g.p.z, _d.x, _d.y, _d.z, move + NADE_R);
          if (hit < move + NADE_R) {
            g.p.addScaledVector(_d, Math.max(0, hit - NADE_R));
            const n = this._surfaceNormal(_a.copy(g.p).addScaledVector(_d, NADE_R), _d, _nd);
            const vn = g.v.dot(n);
            if (vn < 0) {
              g.v.addScaledVector(n, -1.38 * vn); // 反彈係數 0.38
              _b.copy(g.v).addScaledVector(n, -g.v.dot(n)); // 切線方向摩擦
              g.v.addScaledVector(_b, -0.3);
              if (-vn > 1.3) { sfx.grenadeBounce(g.p); g.spin.multiplyScalar(0.6); }
              if (n.y > 0.97 && g.v.length() < 0.7) { g.rest = true; g.v.set(0, 0, 0); } // 斜面(樓梯)上不會停住,會滾下去
            }
            g.p.addScaledVector(n, 0.002);
          } else g.p.addScaledVector(_d, move);
          // 地面保底
          const gy = W.groundY ? W.groundY(g.p.x, g.p.z, g.p.y + 0.3) : null;
          if (gy !== null && gy !== undefined && g.p.y < gy + NADE_R) {
            g.p.y = gy + NADE_R;
            if (g.v.y < -1.3) sfx.grenadeBounce(g.p);
            if (g.v.y < 0) g.v.y *= -0.35;
            const st = W.stairAt ? W.stairAt(g.p.x, gy, g.p.z) : -1;
            if (st >= 0 && W.normalAt) { // 樓梯:沿坡面往下滾,經過踏階邊緣時跳一下
              W.normalAt(g.p.x, g.p.z, gy, _sn);
              g.v.x = g.v.x * 0.975 + _sn.x * 9.8 * h * 3; g.v.z = g.v.z * 0.975 + _sn.z * 9.8 * h * 3;
              if (Math.random() < h * 5 * Math.min(1, Math.hypot(g.v.x, g.v.z))) { g.v.y += rand(0.6, 1.2); sfx.grenadeBounce(g.p); }
            } else {
              g.v.x *= 0.8; g.v.z *= 0.8;
              if (g.v.length() < 0.7) { g.rest = true; g.v.set(0, 0, 0); }
            }
          }
        }
        g.mesh.rotation.x += g.spin.x * dt;
        g.mesh.rotation.y += g.spin.y * dt;
        g.mesh.rotation.z += g.spin.z * dt;
      }
      g.mesh.position.copy(g.p);
    }
  },

  // ---------- 小刀 ----------
  melee() {
    if (!this.wfx) this.initCombat();
    return this.weapons.startAction('knife');
  },

  meleeHit() {
    const p = this.player, cam = this.camera;
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(_o);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bs = Infinity;
    for (const z of this._targets()) {
      if (!z.alive) continue;
      // 殭屍身上離視線最近的點(腳踝到頭頂的垂直線段)
      const top = z.pos.y + (z.type === 'crawler' ? 0.55 : (z.headH || 1.6) + 0.1), bot = z.pos.y + 0.15;
      _p.set(z.pos.x, Math.max(bot, Math.min(top, _o.y + _f.y * 1.2)), z.pos.z);
      _a.subVectors(_p, _o);
      const hd = Math.hypot(_a.x, _a.z) - z.T.radius * 0.8;
      if (hd > 1.65 || Math.abs(_a.y) > 1.7) continue;
      const dist = _a.length();
      const ang = Math.acos(Math.max(-1, Math.min(1, _a.dot(_f) / (dist || 1))));
      if (ang > 0.8 && hd > 0.35) continue; // 扇形約 ±46°(貼身時放寬)
      const score = ang * 1.3 + Math.max(0, hd);
      if (score < bs) { bs = score; best = z; }
    }
    if (best) {
      const z = best;
      // 部位:沿視線打命中盒,打不到就算身體;順便取得命中點
      ONE[0] = z;
      const n = castZombies(ONE, _o, _f, 2.4);
      let part = 'body', bone = 'chest';
      if (n) { part = HITS[0].part; bone = HITS[0].bone; _p.copy(_o).addScaledVector(_f, HITS[0].t); }
      else _p.set(z.pos.x, Math.max(z.pos.y + 0.3, Math.min(z.pos.y + 1.5, _o.y - 0.2)), z.pos.z);
      // 背刺:玩家在殭屍背後
      const hx = Math.sin(z.heading), hz = Math.cos(z.heading);
      const tx = _o.x - z.pos.x, tz = _o.z - z.pos.z, tl = Math.hypot(tx, tz) || 1;
      const back = (hx * tx + hz * tz) / tl < -0.35;
      const dmg = 70 * (back ? 2.2 : 1); // 背刺 ×2.2;小刀無視巨屍護甲(護甲部位當身體)
      HIT.bone = bone; HIT.point.copy(_p); HIT.dir.copy(_f); HIT.dmg = dmg * (part === 'head' ? 2 : 1); HIT.range = 1; HIT.weapon = 'knife'; HIT.explosive = false; HIT.melee = true;
      this._impulse(z, _p, _f, 120);
      z.vel.x += _f.x * 2.2; z.vel.z += _f.z * 2.2;
      const killed = z.damage(dmg, part === 'armor' ? 'body' : part, HIT);
      _n.copy(_f).negate();
      this.wfx.impact(_p, _n, _f, 'flesh', 0.8);
      this.burst(_p, _n, 'blood', 12, z.pos.y);
      this._wallBlood(_p, _f, 40);
      sfx.knifeHit(_p, true);
      p.addShake(0.12);
      if (killed) this.onKill(z, p);
      else { this.chud.marker(part === 'head' || back ? 'head' : 'hit'); (part === 'head' ? sfx.headshot : sfx.hit)(); }
      return;
    }
    // 沒砍到殭屍:砍到牆會有火花
    const d = this.world.rayDistance(_o.x, _o.y, _o.z, _f.x, _f.y, _f.z, 1.5);
    if (d < 1.5) {
      _p.copy(_o).addScaledVector(_f, d);
      const n = this._surfaceNormal(_p, _f, _nd);
      const mat = this._surfaceMat(_p, n);
      this.wfx.impact(_p, n, _f, mat === 'metal' ? 'metal' : mat, 0.15);
      sfx.knifeHit(_p, false);
      p.addShake(0.08);
      if (this.physics && this.physics.hit) this.physics.hit(_p, _f, 2);
    }
  },
};
