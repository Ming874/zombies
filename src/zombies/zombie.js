import * as THREE from 'three';
import { climbStep } from '../physics/zclimb.js'; // [physics] 爬上玩家站著的道具
import { sfx } from '../audio.js';
import { TYPES } from './types.js';
import { getVariant, instantiate } from './model.js';
import { installBehaviors, Z3 } from './behaviors/index.js'; // [zombies-w3] 新類型行為 + 共用動畫層

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const env = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t)); // 進場 a→b、退場 c→d 的包絡
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const TAU = Math.PI * 2;
// 每幀預算(以 10ms 時間窗近似一幀,所有殭屍共用):語音是在主執行緒即時合成的(每次 2~5ms,第一次可到 20ms),
// 人多時(爆炸波及整群、一起撲上來)同一幀全部叫會卡頓 → 語音每幀 1 個、其他音效 2 個、視線/直線更新 10 次;
// 預警用的聲音(咆哮、尖嘯、撞牆、擊中玩家)不受限
const BUD = { t: -1, voice: 0, fx: 0, sense: 0, bar: 0 };
const budget = () => { const now = performance.now(); if (now - BUD.t > 10) { BUD.t = now; BUD.voice = 0; BUD.fx = 0; BUD.sense = 0; BUD.bar = 0; } return BUD; };
const VOICE = new Set(['groan', 'zPain', 'zAttack', 'zDie', 'gurgle']);
const ALWAYS = new Set(['roar', 'shriek', 'wallImpact', 'knock', 'bite', 'spit']);
const VOICE_MAX = 1, FX_MAX = 2, SENSE_MAX = 10, BAR_MAX = 4;
// 頭頂血條:預設不顯示(破壞沉浸感;受傷回饋改由命中標記、噴血、踉蹌與斷肢表現)。除錯時可設 window.__zombieBars = true
const SHOW_BARS = typeof window !== 'undefined' && window.__zombieBars === true;
const say = (name, ...a) => {
  if (!ALWAYS.has(name)) { const B = budget(); if (VOICE.has(name) ? ++B.voice > VOICE_MAX : ++B.fx > FX_MAX) return; }
  sfx[name](...a);
};
const ZR = 0.4; // 殭屍碰撞半徑上限 = 導航膨脹半徑(collision.js NAV_R):導航走得過的縫,碰撞也一定過得去
const VAULT_H = 1.05; // 狂奔者可翻越的道具高度(相對腳底)
const VAULT_T = 0.5; // 翻越動作時間
const FUSE_R = 2.0; // 膿腫者貼近到這個距離開始膨脹自爆
const FUSE_T = 1.3; // 自爆引信時間
const FLANK_A = [1, -1], FLANK_B = [-1, 1];
const RUN_O = { toe: 0.05, wide: 0.05 }, LEAP_O = { th: 0.5, kn: 0.6, toe: 0.05, wide: 0.08 }, NO_O = {}; // 步態參數(共用,不每幀配置)
const _snap = { x: 0, y: 0, z: 0 }, _vault = { x: 0, z: 0, top: 0 }, _imp = new THREE.Vector3();

// 斷口截面(血肉 + 骨頭),所有殭屍共用幾何與材質
let STUMP = null;
const _UP = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
function stumpParts() {
  if (!STUMP) {
    STUMP = {
      geo: new THREE.SphereGeometry(1, 14, 10),
      meat: new THREE.MeshStandardMaterial({ color: 0x4a0907, roughness: 0.38, metalness: 0.05, emissive: 0x120101 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xd9cfb6, roughness: 0.55 }),
    };
  }
  return STUMP;
}

// 血條顏色:滿血綠 → 2/3 橘 → 1/3 紅(中間線性漸變)
const GREEN = [46, 204, 64];
const ORANGE = [255, 159, 26];
const RED = [225, 29, 29];
export function hpColor(ratio) {
  const hp = ratio * 150;
  let a, b, t;
  if (hp >= 150) return GREEN;
  if (hp >= 100) { a = ORANGE; b = GREEN; t = (hp - 100) / 50; }
  else if (hp > 50) { a = RED; b = ORANGE; t = (hp - 50) / 50; }
  else return RED;
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function makeBar(wide) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(wide ? 1.5 : 1.0, wide ? 0.17 : 0.13, 1);
  sprite.renderOrder = 10;
  return { c, tex, sprite };
}

export class Zombie {
  // pos = {x, y, z}:出生點(y 為地面高度)
  constructor(scene, pos, round, type = 'walker') {
    const T = TYPES[type];
    this.type = type;
    this.T = T;
    this.scene = scene;
    this.maxHp = type === 'brute' ? T.hp + 60 * Math.max(0, round - 5) : T.hp;
    this.hp = this.maxHp;
    this.alive = true;
    this.dying = 0;
    this.pos = new THREE.Vector3(pos.x, pos.y || 0, pos.z);
    this.vel = new THREE.Vector3();
    this.speed = lerp(T.speed[0], T.speed[1], Math.random()) * (type === 'brute' ? 1 : 1 + Math.min(0.3, (round - 1) * 0.02));
    this.heading = Math.random() * TAU;
    this.state = 'chase';
    this.st = 0;
    this.st0 = 0;
    this.ph = Math.random() * TAU;
    this.t = Math.random() * 100;
    this.seed = Math.random() * 100;
    this.attackCd = 0.5;
    this.specialCd = 1.5 + Math.random() * 2;
    this.groanT = 1 + Math.random() * 5;
    this.losT = 0;
    this.los = false;
    this.dist = 99;
    this.want = { x: 0, z: 0, speed: 0, face: null, instant: false };
    this.flinch = 0; this.flinchV = 0; this.roll = 0; this.rollV = 0; this.headKick = 0;
    this.rootY = 0; this.rootPitch = 0; this.rootRoll = 0;
    this.tiltF = 0; this.tiltS = 0; this.onStair = -1; // 樓梯坡度造成的身體傾斜(趴地/倒地時)
    this.jawT = 0;
    this.pull = 0;
    this.stepN = 0;
    // 個性:手臂姿勢、跛腳、歪頭、駝背
    const r = Math.random();
    this.armStyle = type !== 'walker' ? 'none' : r < 0.5 ? 'reach' : r < 0.75 ? 'one' : 'hang';
    this.limpSide = Math.random() < 0.5 ? 1 : -1;
    this.limp = type === 'walker' && Math.random() < 0.35 ? 0.5 + Math.random() * 0.5 : 0;
    this.tilt = (Math.random() - 0.5) * 0.5;
    this.lean = 0.08 + Math.random() * 0.16;
    this.twitchT = 1 + Math.random() * 3;
    this.twitch = 0;
    this.twitchDir = 0;
    this.stumbleT = 5 + Math.random() * 10;
    if (type === 'runner') this.specialCd = 0.3;
    // 導航/感知/卡住偵測/LOD 狀態(全部預先配置,update 裡不產生新物件)
    this.line = 0; // 到目標的直線:0 不通 / 1 可直走 / 2 要翻越矮障礙
    this._dir = { x: 0, z: 0 };
    this._cwd = { x: 0, z: 0 }; this._cwT = 0; this._cw = 0;
    this._hitT = 0; this._hitOk = false;
    this.flank = 0; this._fk = 0; this._flankSide = this.seed % 2 < 1 ? 1 : -1;
    this._pt = Math.random() * 0.5; this._sx = this.pos.x; this._sy = this.pos.y; this._sz = this.pos.z;
    this._noProg = 0; this._lv = 0; this._nudgeT = 0; this._nudgeSide = 1; this._repathT = 0;
    this._lodAcc = 0; this.lodSkip = 0; this.stuckN = 0; this.warps = 0;
    this.stepY = 0; this.vault = null; this._vaultNo = 0; this._warpT = 0; this._barDirty = false; this._crowdT = -9;

    // 模型
    const v = getVariant(type);
    this.V = v;
    const inst = instantiate(v);
    this.mesh = inst.mesh;
    this.b = inst.bones;
    this.boneList = inst.list;
    this.rest = inst.rest;
    for (const n of ['spine', 'chest', 'neck', 'head']) this.b[n].rotation.order = 'YXZ';
    this.hitboxes = inst.hits;
    for (const h of this.hitboxes) h.userData.zombie = this;
    this.meshes = this.hitboxes; // 射線判定只打隱形命中盒
    this.k = 0.95 + Math.random() * 0.1;
    this.mesh.scale.setScalar(this.k);
    this.legT = v.legT;
    this.legS = v.legS;
    this.hipY = this.b.hips.position.y;
    this.mouthOff = v.mouth.clone().sub(v.rig.bones[v.rig.index.head].head);
    this.headH = v.rig.HC.y * this.k;
    this.vp = { x: pos.x, y: (pos.y || 0) + (type === 'crawler' ? 0.4 : this.headH), z: pos.z };

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.root.add(this.mesh);
    this.bar = makeBar(type === 'brute');
    this.bar.sprite.position.set(0, type === 'crawler' ? 0.95 : this.headH + 0.32, 0);
    if (SHOW_BARS) {
      this.root.add(this.bar.sprite);
      this.drawBar();
    }
    this.root.position.copy(this.pos);
    scene.add(this.root);
    Z3.init(this); // [zombies-w3]
  }

  drawBar() {
    if (!SHOW_BARS) return; // 血條沒顯示就不必重畫(連線層也會呼叫)
    const { c, tex } = this.bar;
    const ctx = c.getContext('2d');
    const f = Math.max(0, this.hp / this.maxHp);
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, 128, 16);
    const [r, g, b] = hpColor(f);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(2, 2, 124 * f, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(2, 2, 124 * f, 4);
    tex.needsUpdate = true;
  }

  // 多人時追最近、活著且未倒地的玩家;對目前目標有黏著性,避免來回切換。單人只有自己
  pickTarget(ctx) {
    const list = ctx.players;
    if (!list || list.length < 2) return ctx.player;
    const dist = (p) => Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) + Math.abs(p.pos.y - this.pos.y) * 3;
    const ok = (p) => p && p.alive !== false && !p.downed;
    let best = ok(this.target) ? this.target : null, bd = best ? dist(best) * 0.75 : Infinity;
    for (const p of list) if (ok(p) && dist(p) < bd) { bd = dist(p); best = p; }
    return best || ctx.player;
  }
  // 鏡頭震動只作用在本機玩家,依與本機玩家的距離衰減
  _shakeLocal(ctx, a, range) {
    const lp = ctx.player;
    const d = Math.hypot(lp.pos.x - this.pos.x, lp.pos.z - this.pos.z) + Math.abs(lp.pos.y - this.pos.y) * 2;
    lp.addShake(a * Math.max(0, 1 - d / range));
  }

  go(s) {
    this.state = s;
    this.st = 0;
    this.st0 = -1;
  }
  cross(t) { return this.st0 < t && this.st >= t; }

  // part:'head' | 'body' | 'armor' | 'arm' | 'leg';回傳是否擊殺
  // hit(可省略,只在呼叫期間有效):{ bone 命中盒所在骨骼, point, dir, dmg 實際傷害, range 射擊距離, weapon, explosive, melee }
  damage(amount, part = 'body', hit = null) {
    if (!this.alive) return false;
    let m = part === 'head' ? 2 : 1;
    if (part === 'armor') m = this.T.bodyArmor ?? 1;
    m = Z3.dmgMul(this, m, part, hit); // [zombies-w3] 類型的弱點/護甲/爆炸加成
    if (this.state === 'stun') m *= 1.6;
    const dmg = amount * m;
    this.hp = Math.max(0, this.hp - dmg);
    const heavy = this.type === 'brute' ? 0.18 : this.type === 'bloater' ? 0.5 : 1;
    const k = Math.min(2, dmg / 30) * heavy;
    this.flinchV += (part === 'head' ? 7 : 4.5) * k;
    this.rollV += (Math.random() - 0.5) * 9 * k;
    if (part === 'head') this.headKick = Math.min(1.2, this.headKick + 0.7 * heavy);
    // 血條:畫布重畫 + 貼圖上傳;每幀最多重畫幾條(爆炸一次打到一整群時不會同一幀全部上傳),其餘在 update 補畫
    if (SHOW_BARS) { if (++budget().bar <= BAR_MAX) { this.drawBar(); this._barDirty = false; } else this._barDirty = true; }
    if (this.hp <= 0) { this.die(part, hit); return true; }
    Z3.hurt(this, dmg, part, hit); // [zombies-w3] 受擊部位反應、打斷動作
    if (this.t - (this.painT ?? -9) > 0.7) { this.painT = this.t; say('zPain', this.type, this.vp); }
    if (part === 'leg') {
      if (this.type === 'runner' && dmg >= 20 && (this.state === 'chase' || this.state === 'attack')) this.go('trip');
      else if (this.type === 'walker' && this.state === 'chase' && Math.random() < 0.4) this.go('stagger');
    } else if (this.type === 'walker' && dmg >= 55 && this.state === 'chase') this.go('stagger');
    return false;
  }

  die(part, hit = null) {
    this.alive = false;
    this.dying = 1e-4;
    this.bar.sprite.visible = false;
    say('zDie', this.type, this.vp);
    const r = Math.random();
    this.deathKind = this.type === 'bloater' ? 'burst' : this.type === 'crawler' ? 'flat' : this.type === 'brute' ? 'kneel'
      : this.state === 'leap' || this.state === 'trip' ? 'front'
        : part === 'head' ? (r < 0.65 ? 'back' : 'kneel') : r < 0.4 ? 'front' : r < 0.72 ? 'back' : 'kneel';
    this.deathSide = Math.random() < 0.5 ? 1 : -1;
    Z3.death(this, part, hit); // [zombies-w3]
    this.landed = false;
    this.exploded = false;
    this.rootY = Math.max(0, this.rootY);
    this.killPart = part;
    this._gib(part, hit);
    if (this.amb) this._ambEnd(true); // [ambush] 死在埋伏姿勢:解凍、倒法跟著姿勢
  }

  // ---- 斷頭/斷肢(擊殺時):把該骨骼縮到 0(連帶子骨骼與命中盒),斷口加一塊血肉截面;噴血由戰鬥系統依 this.gore 處理 ----
  _gib(part, hit) {
    this.gore = null;
    const b = this.b;
    const boom = !!(hit && hit.explosive);
    if ((part === 'head' && !boom) || (boom && Math.random() < 0.15)) {
      if (this.type === 'brute') { this.gore = { kind: 'headBlood', bone: 'neck', child: 'head' }; return; } // 巨屍頭太硬:只噴血
      b.head.scale.setScalar(0);
      this._stump('neck', 'head', 0.052);
      this.gore = { kind: 'head', bone: 'neck', child: 'head' };
      if (this.deathKind === 'kneel' && Math.random() < 0.5) this.deathKind = 'back';
      return;
    }
    const dmg = hit ? hit.dmg || 0 : 0;
    const strong = dmg >= 55 || (hit && hit.weapon === 'shotgun' && hit.range < 5) || boom;
    if (!strong || (part !== 'arm' && part !== 'leg' && !boom) || Math.random() > (boom ? 0.55 : 0.7)) return;
    const s = Math.random() < 0.5 ? 'L' : 'R';
    let bone = hit && hit.bone && b[hit.bone] ? hit.bone : null;
    if (boom || !bone) bone = Math.random() < 0.5 && !this.V.P.legless ? 'shin' + s : 'forearm' + s;
    if (/^hand/.test(bone)) bone = bone.replace('hand', 'forearm');
    if (/^foot/.test(bone)) bone = bone.replace('foot', 'shin');
    if (/^upperArm|^thigh/.test(bone) && Math.random() < 0.5) bone = bone.replace('upperArm', 'forearm').replace('thigh', 'shin'); // 一半機率只斷前段
    const bb = b[bone];
    if (!bb || !bb.parent || bb.scale.x === 0) return;
    bb.scale.setScalar(0);
    this._stump(bb.parent.name, bone, /^thigh/.test(bone) ? 0.07 : /^shin|^upperArm/.test(bone) ? 0.05 : 0.04);
    this.gore = { kind: 'limb', bone: bb.parent.name, child: bone };
    if (/^thigh|^shin/.test(bone) && this.deathKind === 'kneel') this.deathKind = 'front';
  }

  _stump(parent, child, r) {
    const S = stumpParts();
    const pb = this.b[parent], cb = this.b[child];
    const g = new THREE.Group();
    g.position.copy(cb.position);
    g.quaternion.setFromUnitVectors(_UP, _dir.copy(cb.position).normalize());
    const meat = new THREE.Mesh(S.geo, S.meat);
    meat.scale.set(r, r * 0.45, r);
    const bone = new THREE.Mesh(S.geo, S.bone);
    bone.scale.set(r * 0.32, r * 0.5, r * 0.32);
    bone.position.y = r * 0.12;
    g.add(meat, bone);
    pb.add(g);
  }

  // ctx = { player, world, zombies, hazards, game };回傳本幀對玩家的近戰傷害
  update(dt, ctx) {
    this.t += dt;
    if (!this.alive) { this._dead(dt, ctx); return 0; }
    if (this.amb) { const r = this._ambUpdate(dt, ctx); if (r !== undefined) return r; } // [ambush] 埋伏/天花板上:休眠中幾乎零成本(src/zombies/ambush.pose.js)
    const { world, zombies } = ctx;
    const pos = this.pos;
    if (!(pos.x === pos.x && pos.y === pos.y && pos.z === pos.z)) this._warp(ctx, true); // 座標壞掉:直接送回出生點
    const player = (this.target = this.pickTarget(ctx));
    const toX = player.pos.x - pos.x, toZ = player.pos.z - pos.z;
    const hd = Math.hypot(toX, toZ) || 1e-3; // 水平距離
    const dy = player.pos.y - pos.y;
    this.dist = hd;
    this.dy = dy;
    this.d3 = Math.sqrt(hd * hd + dy * dy);
    // ---- LOD:遠處/看不到的殭屍降低更新頻率(累積 dt 一次算,動畫也跟著少算) ----
    this._lodAcc += dt;
    if (this._lodAcc < this._lodInterval(ctx)) { this.lodSkip++; return 0; }
    dt = this._lodAcc < 0.25 ? this._lodAcc : 0.25;
    this._lodAcc = 0;
    if (this._barDirty && ++budget().bar <= BAR_MAX) { this.drawBar(); this._barDirty = false; }
    // 同一樓層(高度差 < 1.2m)才算得上近戰距離;隔樓層時行為判斷用的距離視為很遠
    const same = dy < 1.2 && dy > -1.2;
    const dist = same ? hd : hd + 40;
    // ---- 感知:視線(眼睛高度)+ 直線可走(地面連續、不穿牆/欄杆/窗/道具/挑空),每 0.15~0.25 秒 ----
    this.losT -= dt;
    if (this.losT <= 0 && ++budget().sense > SENSE_MAX) this.losT = 0.01; // 本幀額度用完:沿用上次的結果,下一幀再算
    else if (this.losT <= 0) {
      this.losT = 0.15 + Math.random() * 0.1;
      const ey = this.type === 'crawler' ? 0.5 : 1.4;
      this.los = this.d3 < 24 && world.hasLineOfSight(pos.x, pos.y + ey, pos.z, player.pos.x, player.pos.y + 1.4, player.pos.z);
      this.line = same && this.los && hd < 16 && world.walkLine ? world.walkLine(pos.x, pos.y, pos.z, player.pos.x, player.pos.z, 0.45, this.type === 'runner' ? VAULT_H : 0) : 0;
      if (this.type === 'runner') this._flankCheck(world, player, toX, toZ, hd);
      if (this.los && !this.alerted && this.type !== 'runner' && this.d3 < 14) { this.alerted = true; say('zAlert', this.type, this.vp); } // [audio] 發現玩家的叫聲(奔跑者另有尖嘯)
    }
    const w = this.want;
    // 直線可走時直接衝向玩家(狂奔者連要翻越的矮障礙也直衝),否則沿導航場走(會上下樓梯);卡住重新找路時只跟導航場
    if ((this.line === 1 || (this.line === 2 && this.type === 'runner' && this.t > this._vaultNo)) && this._repathT <= 0) { w.x = toX / hd; w.z = toZ / hd; }
    else {
      const f = world.flowDir(pos.x, pos.y, pos.z, this._dir, this._repathT > 0 ? 1 : 2);
      if (f) { w.x = f.x; w.z = f.z; }
      else if (this._repathT > 0 && world.navSnap && world.navSnap(pos.x, pos.y, pos.z, _snap) && Math.hypot(_snap.x - pos.x, _snap.z - pos.z) > 0.15) {
        const l = Math.hypot(_snap.x - pos.x, _snap.z - pos.z); w.x = (_snap.x - pos.x) / l; w.z = (_snap.z - pos.z) / l; // 回到導航圖上
      } else { w.x = toX / hd; w.z = toZ / hd; }
    }
    if (this._nudgeT > 0) { // 卡住第一步:往空的一側擠
      this._nudgeT -= dt;
      const s = this._nudgeSide * 1.2, nx = w.x - w.z * s, nz = w.z + w.x * s, l = Math.hypot(nx, nz) || 1;
      w.x = nx / l; w.z = nz / l;
    }
    if (this._repathT > 0) this._repathT -= dt;
    w.speed = this.speed;
    w.face = null;
    w.instant = false;
    this.st0 = this.st;
    this.st += dt;
    this.attackCd -= dt;
    this.specialCd -= dt;

    const think = this.amb ? this._ambThink : this._thinkFn || (this._thinkFn = this['_think_' + this.type]); // 快取方法,避免每幀組字串;[ambush] 衝出/掉落中
    const dealt = !this.amb && Z3.pre(this, dt, ctx, dist, w) ? 0 : think.call(this, dt, ctx, dist, toX, toZ, w); // [zombies-w3] pre:面壁等閒置怪癖(埋伏中不跑)
    if (!this.alive) return dealt; // 膿腫者自爆
    climbStep(this, world, player, hd, dy, w, ZR); // [physics] 玩家站在道具上:爬上去 / 同檯面直接走過去
    // 樓梯上放慢(衝鋒/飛撲除外)
    this.onStair = world.stairAt ? world.stairAt(pos.x, pos.y, pos.z) : -1;
    if (this.onStair >= 0 && !w.instant && this.state !== 'charge') w.speed *= 0.86;

    // ---- 移動 ----
    const rad = Math.min(this.T.radius, ZR);
    if (this.state === 'climb') this._climbMove(world, rad);
    else {
      if (w.instant) { this.vel.x = w.x * w.speed; this.vel.z = w.z * w.speed; }
      else {
        const k = Math.min(1, dt * (this.state === 'charge' ? 3 : 6));
        this.vel.x += (w.x * w.speed - this.vel.x) * k;
        this.vel.z += (w.z * w.speed - this.vel.z) * k;
      }
      // 殭屍之間互相推開:位置修正(不會疊在一起;質量大的推得動質量小的)+ 少量速度,讓後面的繞過前面的
      let sx = 0, sz = 0;
      const R0 = this.T.radius, m0 = this.T.mass;
      for (let i = 0; i < zombies.length; i++) {
        const o = zombies[i];
        if (o === this || !o.alive) continue;
        const ax = pos.x - o.pos.x, az = pos.z - o.pos.z, rr = R0 + o.T.radius;
        if (ax >= rr || ax <= -rr || az >= rr || az <= -rr) continue;
        const d2 = ax * ax + az * az, oy = o.pos.y - pos.y;
        if (d2 >= rr * rr || oy > 1.5 || oy < -1.5) continue;
        const share = o.T.mass / (o.T.mass + m0);
        if (d2 < 1e-6) { sx += Math.sin(this.seed) * rr * share; sz += Math.cos(this.seed) * rr * share; continue; }
        const d = Math.sqrt(d2), push = (rr - d) * share;
        this._crowdT = this.t; // 被其他殭屍擠到(卡住偵測用)
        sx += (ax / d) * push; sz += (az / d) * push;
      }
      const sl = Math.hypot(sx, sz);
      if (sl > 0.15) { sx *= 0.15 / sl; sz *= 0.15 / sl; }
      this.vel.x += sx * 6; this.vel.z += sz * 6;
      // 積分 + 碰撞(位移大時分段,飛撲/衝鋒/低 LOD 大 dt 都不會穿過薄道具)
      const mx = this.vel.x * dt + sx, mz = this.vel.z * dt + sz, ml = Math.hypot(mx, mz);
      const n = ml > 0.25 ? Math.ceil(ml / 0.25) : 1;
      const ox = pos.x, oz = pos.z;
      for (let k = 0; k < n; k++) { pos.x += mx / n; pos.z += mz / n; world.resolve(pos, rad); } // 水平碰撞 + pos.y 貼地(上下樓梯)
      this.blocked = ml > 1e-4 && Math.hypot(pos.x - (ox + mx), pos.z - (oz + mz)) > ml * 0.5;
      // 衝鋒/飛撲中被牆擋:速度歸零(不會一直往牆裡擠)
      if (this.blocked && w.instant) { this.vel.x *= 0.3; this.vel.z *= 0.3; }
    }
    const minD = this.T.radius + 0.38;
    const pd = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
    if (pd < minD && same && this.state !== 'climb') {
      const nx = (pos.x - player.pos.x) / (pd || 1), nz = (pos.z - player.pos.z) / (pd || 1);
      pos.x = player.pos.x + nx * minD;
      pos.z = player.pos.z + nz * minD;
      world.resolve(pos, rad);
    }
    this._stuck(dt, ctx, hd, same);

    // ---- 朝向:看得到又走得到時盯著玩家,其餘看移動方向 ----
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speedNow = this.state === 'climb' ? this.speed : sp;
    const faceP = hd < 5 && (this.line || (same && hd < 1.6 && this.los));
    const target = w.face ?? (faceP ? Math.atan2(toX, toZ) : sp > 0.1 ? Math.atan2(this.vel.x, this.vel.z) : this.heading);
    this.heading += wrapA(target - this.heading) * Math.min(1, dt * this.T.turn);

    // ---- 動畫(LOD 低時也是同一套,只是更新得比較少) ----
    this.mesh.castShadow = this.d3 < 11; // 遠處的不進陰影貼圖,省一半繪製量
    this._slope(world, this.type === 'crawler' ? 1 : 0, dt);
    // 腳踩在實體踏階上(坡面與踏面差 ±半階)
    const so = world.stepOffset && this.onStair >= 0 ? world.stepOffset(this.onStair, pos.x, pos.z) : 0;
    this.stepY += (so - this.stepY) * Math.min(1, dt * 18);
    this._resetPose();
    (this.amb ? this._ambPose : this._poseFn || (this._poseFn = this['_pose_' + this.type])).call(this, dt, ctx, dist, toX, toZ);
    this._reactions(dt, ctx);
    this._applyRoot();
    // 腳步(巨屍用重踏,爬行者用拖行,另外處理)
    if (this.type !== 'brute' && this.type !== 'crawler') {
      const ns = Math.floor((this.ph + Math.PI / 2) / Math.PI);
      if (ns !== this.stepN) { // 腳步聲只在本機玩家 22m 內(更遠聽不到,省掉合成)
        this.stepN = ns;
        const lp = ctx.player.pos;
        if (sp > 0.3 && this.rootY < 0.05 && Math.abs(lp.x - pos.x) + Math.abs(lp.z - pos.z) + Math.abs(lp.y - pos.y) * 2 < 26) say('zStep', this.type, pos);
      }
    }

    // ---- 叫聲 ----
    this.vp.x = pos.x;
    this.vp.y = pos.y + (this.type === 'crawler' ? 0.4 : this.headH);
    this.vp.z = pos.z;
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = ({ walker: 4, runner: 2.5, crawler: 4, bloater: 3.5, brute: 5 }[this.type] ?? this.T.groan ?? 4) + Math.random() * 5; // [zombies-w3] 新類型讀 T.groan
      if (this.type === 'bloater' && Math.random() < 0.5) say('gurgle', this.vp);
      else say('groan', this.type, this.vp);
      this.jawT = 1.3;
    }
    this.jawT = Math.max(0, this.jawT - dt);
    return dealt;
  }

  // LOD:回傳更新間隔(秒;0 = 每幀)。近處、看得到、正在攻擊/特殊動作的每幀更新;
  // 看不到(沒有視線、也不在本機玩家的視野錐內)的 ~8-15Hz,很遠但看得到的 20Hz
  _lodInterval(ctx) {
    if (this.state !== 'chase' || this.d3 < 16 || this._nudgeT > 0) return 0;
    let seen = this.los;
    if (!seen) {
      const lp = ctx.player, dx = this.pos.x - lp.pos.x, dz = this.pos.z - lp.pos.z, d = Math.hypot(dx, dz);
      if (d < 40 && Math.abs(this.pos.y - lp.pos.y) < 6) seen = -dx * Math.sin(lp.yaw) - dz * Math.cos(lp.yaw) > d * 0.34; // 水平約 ±70°
    }
    if (seen) return this.d3 > 32 ? 0.05 : 0;
    return this.d3 > 34 ? 0.125 : 0.066;
  }

  // 近戰命中條件:同一層、胸口(爬行者:地面)高度互相看得到、之間的地面直線可走(不隔著牆/欄杆/窗/樓板/擋路道具)
  _canHit(world) {
    if (this.t < this._hitT) return this._hitOk;
    this._hitT = this.t + 0.12;
    const p = this.target, lo = this.type === 'crawler';
    this._hitOk = this.dy < 1.2 && this.dy > -1.2
      && world.hasLineOfSight(this.pos.x, this.pos.y + (lo ? 0.35 : 1.15), this.pos.z, p.pos.x, p.pos.y + (lo ? 0.45 : 1.15), p.pos.z)
      && (this.dist < 1.0 || !world.walkLine || world.walkLine(this.pos.x, this.pos.y, this.pos.z, p.pos.x, p.pos.z, 0.4) > 0);
    return this._hitOk;
  }

  // 卡住偵測(每 0.5 秒):在同一個距離場下,比較上次取樣點與現在的路徑距離(與玩家有沒有移動無關)。
  // 2 秒沒進展 → 往空的一側擠;4.5 秒 → 重新找路(只跟導航節點中心走、不直衝);10 秒 → 沒人看得到時瞬移到隱蔽的出生點
  _stuck(dt, ctx, hd, same) {
    this._pt -= dt;
    if (this._pt > 0) return;
    this._pt = 0.5;
    const world = ctx.world, p = this.pos;
    const now = world.flowDistance(p.x, p.y, p.z), was = world.flowDistance(this._sx, this._sy, this._sz);
    this._sx = p.x; this._sy = p.y; this._sz = p.z;
    if (same && (now < 1.6 || (hd < this.T.reach + 0.6 && this._canHit(world)))) { this._noProg = 0; this._lv = 0; return; } // 到了(路徑距離很近,或已經打得到)
    if (this.state !== 'chase' || this.want.speed < 0.25) return; // 攻擊/硬直/特殊動作中:暫停計時
    if (was - now > 0.2) { this._noProg = 0; return; }
    // 玩家附近 6m 內又正被其他殭屍擠著(圍成一圈):累計慢很多,不會在人群裡亂擠
    this._noProg += now === Infinity ? 1 : same && hd < 6 && this.t - this._crowdT < 1 ? 0.125 : 0.5;
    const n = this._noProg;
    if (n >= 2 && this._lv < 1) { this._lv = 1; this._nudgeT = 1; this._nudgeSide = this._freeSide(world); this.stuckN++; }
    else if (n >= 4.5 && this._lv < 2) { this._lv = 2; this._repathT = 4; this._nudgeT = 0.6; this._nudgeSide = -this._nudgeSide; }
    else if (n >= 10 && this.t >= this._warpT) { // 每 2 秒試一次(有人看得到就不瞬移,繼續重新找路)
      this._warpT = this.t + 2;
      if (this._warp(ctx, false, now === Infinity ? Infinity : Math.max(35, now + 10))) return;
      this._repathT = 2;
    }
    if (n < 2) this._lv = 0;
  }

  // 卡住時往哪一側擠:前進方向左右 0.8m 哪邊有導航節點;都沒有就隨機
  _freeSide(world) {
    const w = this.want, p = this.pos;
    const l = world.isNode ? world.isNode(p.x - w.z * 0.8, p.y, p.z + w.x * 0.8) : true;
    const r = world.isNode ? world.isNode(p.x + w.z * 0.8, p.y, p.z - w.x * 0.8) : true;
    return l && !r ? 1 : r && !l ? -1 : Math.random() < 0.5 ? 1 : -1;
  }

  // 瞬移到隱蔽的出生點(最後手段;force = 座標壞掉時不管有沒有人看到;maxFd = 出生點路徑距離上限,不會越移越遠)。回傳是否成功
  _warp(ctx, force, maxFd = Infinity) {
    const g = ctx.game, world = ctx.world;
    if (!force) {
      for (const p of ctx.players || [ctx.player]) {
        if (!p || p.alive === false) continue;
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) + Math.abs(p.pos.y - this.pos.y);
        if (d < 45 && world.hasLineOfSight(p.pos.x, p.pos.y + 1.6, p.pos.z, this.pos.x, this.pos.y + 1.2, this.pos.z)) return false; // 有人看得到:不能憑空消失
      }
    }
    const s = g && g.pickSpawn ? g.pickSpawn(this.type, maxFd) : world.spawns && world.spawns[0];
    if (!s) return false;
    this.pos.set(s.x, s.y || 0, s.z);
    world.resolve(this.pos, Math.min(this.T.radius, ZR));
    this.vel.set(0, 0, 0);
    this._noProg = 0; this._lv = 0; this._nudgeT = 0; this._repathT = 0;
    this._sx = this.pos.x; this._sy = this.pos.y; this._sz = this.pos.z;
    this.warps++;
    if (this.state !== 'chase') this.go('chase');
    this.root.position.copy(this.pos);
    return true;
  }

  // ======================= 行為 =======================
  _think_walker(dt, ctx, dist, toX, toZ, w) {
    const T = this.T;
    let dealt = 0;
    if (this.limp) w.speed *= 0.8;
    switch (this.state) {
      case 'chase':
        // 蹣跚:速度忽快忽慢、身體左右晃著走(靠近玩家時收斂)
        if (dist > 2.5) {
          const sw = Math.sin(this.t * 0.83 + this.seed) * 0.22 + Math.sin(this.t * 2.1 + this.seed * 3) * 0.08, nx = w.x - w.z * sw, nz = w.z + w.x * sw, l = Math.hypot(nx, nz) || 1;
          w.x = nx / l; w.z = nz / l;
          w.speed *= 0.85 + 0.25 * Math.max(0, Math.sin(this.t * 1.3 + this.seed));
        }
        this.stumbleT -= dt;
        if (this.stumbleT <= 0 && this.speedNow > 0.4) { this.go('stumble'); this.stumbleT = 7 + Math.random() * 10; }
        else if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(ctx.world)) { this.go('attack'); say('zAttack', this.type, this.vp); }
        if (dist < T.reach - 0.1 && this._canHit(ctx.world)) w.speed = 0; // 打得到才停下(隔著東西時繼續繞)
        break;
      case 'stumble':
        w.speed *= this.st < 0.45 ? 1.4 : 0.15;
        if (this.st > 1.1) this.go('chase');
        break;
      case 'attack':
        w.speed = dist > T.reach * 0.8 ? this.speed * 0.4 : 0;
        if (this.cross(0.58) && dist < T.reach + 0.4 && this._canHit(ctx.world)) { dealt = T.dmg; say('bite', this.target.pos); }
        if (this.st > 1.1) { this.go('chase'); this.attackCd = T.cd - 1.1; }
        break;
      case 'stagger':
        w.speed = 0;
        if (this.st > 0.6) this.go('chase');
        break;
      default: this.go('chase');
    }
    return dealt;
  }

  // 狂奔者側翼:直線可走、4~13m 時改成繞向玩家側邊(左右依個體決定,那側走不通就換邊或直衝)
  _flankCheck(world, p, toX, toZ, hd) {
    this.flank = 0;
    if (!this.line || hd < 4 || hd > 13) return;
    const k = Math.min(3.2, (hd - 3) * 0.45), px = -toZ / hd, pz = toX / hd;
    for (const s of this._flankSide > 0 ? FLANK_A : FLANK_B) {
      const fx = p.pos.x + px * s * k, fz = p.pos.z + pz * s * k;
      if (world.walkLine(this.pos.x, this.pos.y, this.pos.z, fx, fz, 0.45, VAULT_H) && world.walkLine(fx, p.pos.y, fz, p.pos.x, p.pos.z, 0.45)) { this.flank = s; this._fk = k; return; }
    }
  }

  _think_runner(dt, ctx, dist, toX, toZ, w) {
    const T = this.T, L = T.lunge, p = this.target, world = ctx.world;
    let dealt = 0;
    if (!this.spotted && this.los && dist < 15) { this.spotted = true; say('shriek', this.vp); this.jawT = 1; }
    switch (this.state) {
      case 'chase':
        if (this.flank && dist > 3.5 && this._repathT <= 0) { // 繞側翼
          const hd = this.dist, k = Math.min(this._fk, (dist - 3) * 0.45), fx = p.pos.x - toZ / hd * this.flank * k - this.pos.x, fz = p.pos.z + toX / hd * this.flank * k - this.pos.z, l = Math.hypot(fx, fz) || 1;
          w.x = fx / l; w.z = fz / l;
        } else if (this.los && dist > 3 && dist < 12) { // 之字形逼近,較難瞄準
          const s = Math.sin(this.t * 2.6 + this.seed) * 0.6;
          const px = -w.z, pz = w.x;
          w.x += px * s; w.z += pz * s;
          const l = Math.hypot(w.x, w.z); w.x /= l; w.z /= l;
        }
        if (this.los && this.line === 1 && dist > L.min && dist < L.max && this.specialCd <= 0) { this.go('crouch'); say('shriek', this.vp); }
        else if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('attack'); say('zAttack', this.type, this.vp); }
        else if (this.blocked && this.speedNow > 1.2 && world.vaultAhead) {
          if (world.vaultAhead(this.pos.x, this.pos.y, this.pos.z, w.x, w.z, Math.min(T.radius, ZR), VAULT_H, _vault)) {
            const v = this.vault || (this.vault = { x0: 0, z0: 0, x1: 0, z1: 0, h: 0 });
            v.x0 = this.pos.x; v.z0 = this.pos.z; v.x1 = _vault.x; v.z1 = _vault.z; v.h = _vault.top - this.pos.y;
            this.go('climb');
          } else if (this.line === 2) this._vaultNo = this.t + 2.5; // 翻不過去:先改走導航路徑
        }
        if (dist < T.reach - 0.15 && this._canHit(ctx.world)) w.speed = 0; // 打得到才停下(隔著東西時繼續繞)
        break;
      case 'climb': // 翻越矮障礙(病床、長椅、桌子):手撐上去、腿收起來翻過
        w.speed = 0;
        w.face = Math.atan2(this.vault.x1 - this.vault.x0, this.vault.z1 - this.vault.z0);
        if (this.st > VAULT_T) { this.rootY = 0; this.go('chase'); this.vel.x = Math.sin(this.heading) * this.speed * 0.8; this.vel.z = Math.cos(this.heading) * this.speed * 0.8; }
        break;
      case 'crouch':
        w.speed = 0;
        w.face = Math.atan2(toX, toZ);
        if (this.st > 0.32) {
          const tx = p.pos.x + (p.vx || 0) * 0.25 - this.pos.x, tz = p.pos.z + (p.vz || 0) * 0.25 - this.pos.z, l = Math.hypot(tx, tz) || 1;
          this.leap = { x: tx / l, z: tz / l, hit: false };
          this.go('leap');
        }
        break;
      case 'leap': {
        w.x = this.leap.x; w.z = this.leap.z; w.speed = L.speed; w.instant = true;
        w.face = Math.atan2(this.leap.x, this.leap.z);
        const u = this.st / 0.46;
        this.rootY = Math.max(0, 4 * 0.42 * u * (1 - u));
        if (!this.leap.hit && dist < 0.95 && this._canHit(world)) {
          this.leap.hit = true;
          dealt = L.dmg;
          p.knock(this.leap.x * 5, this.leap.z * 5);
          say('bite', p.pos);
        }
        if (this.st > 0.46 || (this.blocked && this.st > 0.1)) { this.rootY = 0; this.go('recover'); }
        break;
      }
      case 'recover':
        w.speed = this.speed * 0.1;
        if (this.st > 0.5) { this.go('chase'); this.specialCd = lerp(L.cd[0], L.cd[1], Math.random()); }
        break;
      case 'attack':
        w.speed = dist > 0.85 ? this.speed * 0.3 : 0;
        if (this.cross(0.5) && dist < T.reach + 0.35 && this._canHit(world)) { dealt = T.dmg; say('bite', p.pos); }
        if (this.st > 0.7) { this.go('chase'); this.attackCd = T.cd - 0.7; }
        break;
      case 'trip': // 腿中彈摔倒,滑行後爬起
        w.speed = Math.max(0, this.speed * (1 - this.st * 2.5));
        w.x = Math.sin(this.heading); w.z = Math.cos(this.heading);
        w.face = this.heading;
        if (this.cross(0.38)) say('thud', this.vp, false);
        if (this.st > 1.3) this.go('getup');
        break;
      case 'getup':
        w.speed = 0;
        if (this.st > 0.8) this.go('chase');
        break;
      default: this.go('chase');
    }
    return dealt;
  }

  // 翻越中的位移:沿起點 → 落地點直線前進(路徑已由 vaultAhead 檢查過),結束時正常碰撞
  _climbMove(world, rad) {
    const v = this.vault, u = clamp(this.st / VAULT_T, 0, 1), e = u * u * (3 - 2 * u);
    this.pos.x = lerp(v.x0, v.x1, e);
    this.pos.z = lerp(v.z0, v.z1, e);
    this.vel.x = this.vel.z = 0;
    if (u >= 1) {
      if (v.onto != null) { this.pos.y = v.onto; v.onto = null; } // [physics] 爬上道具頂(zclimb.js)
      world.resolve(this.pos, rad);
      if (this.state === 'climb' && this.type !== 'runner') { this.rootY = 0; this.go('chase'); } // 狂奔者在自己的 think 裡結束
    }
    this.blocked = false;
  }

  _think_crawler(dt, ctx, dist, toX, toZ, w) {
    const T = this.T;
    let dealt = 0;
    switch (this.state) {
      case 'chase':
        w.speed = this.speed * (0.2 + 1.0 * this.pull);
        // 低矮的捷徑:鑽過其他殭屍過不去的窄縫(家具之間、桌下)
        if (this.line !== 1 && this._repathT <= 0 && ctx.world.crawlDir) {
          if ((this._cwT -= dt) <= 0) { this._cwT = 0.4 + Math.random() * 0.2; this._cw = ctx.world.crawlDir(this.pos.x, this.pos.y, this.pos.z, this._cwd) ? 1 : 0; }
          if (this._cw) { w.x = this._cwd.x; w.z = this._cwd.z; }
        }
        if (dist < T.reach && this.attackCd <= 0 && this._canHit(ctx.world)) { this.go('attack'); say('zAttack', this.type, this.vp); }
        if (dist < T.reach - 0.2 && this._canHit(ctx.world)) w.speed = 0; // 打得到才停下(隔著東西時繼續繞)
        break;
      case 'attack':
        w.speed = 0;
        w.face = Math.atan2(toX, toZ);
        if (this.cross(0.48) && dist < T.reach + 0.3 && this._canHit(ctx.world)) { dealt = T.dmg; say('bite', this.target.pos); }
        if (this.st > 0.95) { this.go('chase'); this.attackCd = T.cd - 0.95; }
        break;
      default: this.go('chase');
    }
    return dealt;
  }

  _think_bloater(dt, ctx, dist, toX, toZ, w) {
    const T = this.T, S = T.spit, p = this.target;
    let dealt = 0;
    switch (this.state) {
      case 'chase':
        if (dist < FUSE_R && this.st > 0.4 && this._canHit(ctx.world)) { this.go('burn'); say('gurgle', this.vp); this.jawT = 1.3; } // 貼近:膨脹自爆
        else if (this.los && this.d3 > S.min && this.d3 < S.max && this.specialCd <= 0) this.go('spit'); // 可以對不同樓層吐(3D 距離)
        break;
      case 'burn': // 引信:肚子越脹越大、搖搖晃晃往玩家擠,時間到就爆開(被打死也會爆)
        w.speed = this.speed * 0.55;
        w.face = Math.atan2(toX, toZ);
        if (this.cross(0.55)) say('gurgle', this.vp);
        if (this.st > FUSE_T) {
          this.die('body', null);
          this.dying = 0.46; // 跳過死亡動畫的膨脹段,馬上爆
          this.selfBurst = true;
          this.corpse = 6; // 沒被玩家擊殺(不給金幣),屍體照常留一下
        }
        break;
      case 'spit':
        w.speed = 0;
        w.face = Math.atan2(toX, toZ);
        if (this.cross(0.74)) {
          this.b.head.updateWorldMatrix(true, false);
          const from = this.b.head.localToWorld(this.mouthOff.clone());
          const lead = Math.min(1.2, dist / 11);
          ctx.hazards.spit(from, new THREE.Vector3(p.pos.x + (p.vx || 0) * lead * 0.6, p.pos.y + 0.9, p.pos.z + (p.vz || 0) * lead * 0.6));
          say('spit', this.vp);
        }
        if (this.st > 1.3) { this.go('chase'); this.specialCd = lerp(S.cd[0], S.cd[1], Math.random()); }
        break;
      case 'attack': // 舊版的近戰(連線時其他端可能還會收到這個狀態)
        w.speed = 0;
        w.face = Math.atan2(toX, toZ);
        if (this.cross(0.5) && dist < T.reach + 0.3 && this._canHit(ctx.world)) { dealt = T.dmg; say('bite', p.pos); }
        if (this.st > 1.0) { this.go('chase'); this.attackCd = T.cd - 1.0; }
        break;
      default: this.go('chase');
    }
    return dealt;
  }

  _think_brute(dt, ctx, dist, toX, toZ, w) {
    const T = this.T, C = T.charge, p = this.target, world = ctx.world;
    let dealt = 0;
    const shake = (a, range) => this._shakeLocal(ctx, a, range);
    switch (this.state) {
      case 'chase':
        // 衝鋒:看得到、而且到玩家之間的地面直線可走(不會一開始就撞上欄杆/窗/桌子)
        if (this.los && this.line === 1 && dist > C.min && dist < C.max && this.specialCd <= 0) { this.go('roar'); say('roar', this.vp); this.jawT = 0; }
        else if (dist < T.reach + 0.1 && this.attackCd <= 0 && this._canHit(world)) { this.go('slam'); say('zAttack', this.type, this.vp); }
        if (dist < T.reach - 0.35 && this._canHit(ctx.world)) w.speed = 0; // 打得到才停下(隔著東西時繼續繞)
        break;
      case 'roar':
        w.speed = 0;
        w.face = Math.atan2(toX, toZ);
        if (this.st > 0.3 && this.st < 1.0) shake(0.12, 22);
        if (this.st > 1.15) { this.charge = { x: toX / this.dist, z: toZ / this.dist, hit: false, smash: 0, pushT: 0 }; this.go('charge'); }
        break;
      case 'charge': {
        const ch = this.charge;
        w.x = ch.x; w.z = ch.z;
        w.speed = C.speed * Math.min(1, 0.35 + this.st * 2.2) * (ch.smash ? 0.7 : 1);
        w.face = Math.atan2(ch.x, ch.z);
        // 撞開前方的輕道具(推車、椅子、點滴架…;重的也推得動)
        const ph = ctx.game && ctx.game.physics;
        if (ph && ph.impulseAt && (ch.pushT -= dt) <= 0 && this.speedNow > 2.5) {
          ch.pushT = 0.1;
          _imp.set(this.pos.x + ch.x * 0.95, this.pos.y + 0.7, this.pos.z + ch.z * 0.95);
          ph.impulseAt(_imp, 1.25, 5.5);
        }
        if (!ch.hit && dist < T.radius + 0.65 && this._canHit(world)) {
          ch.hit = true;
          dealt = C.dmg;
          p.knock(ch.x * 11, ch.z * 11);
          p.addShake(0.6);
          say('knock');
          this.go('recover');
        } else if (this.blocked && this.st > 0.3) {
          const what = world.blockedBy ? world.blockedBy(this.pos.x, this.pos.y, this.pos.z, ch.x, ch.z, Math.min(T.radius, ZR)) : 'cell';
          if (what === 'box' && ch.smash < 2 && ph && ph.impulseAt) { // 撞到道具:用力撞開,繼續衝(撞不動的第三次就停)
            ch.smash++;
            const b = world.hitBox;
            _imp.set((b.minX + b.maxX) / 2 - ch.x * 0.3, this.pos.y + 0.6, (b.minZ + b.maxZ) / 2 - ch.z * 0.3);
            ph.impulseAt(_imp, 2, 9);
            say('wallImpact', this.vp);
            shake(0.3, 12);
            this.st = Math.min(this.st, 1.4);
          } else {
            say('wallImpact', this.vp);
            shake(0.5, 16);
            this.go('stun');
          }
        } else if (this.st > 2.3) this.go('recover');
        break;
      }
      case 'stun':
        w.speed = 0;
        if (this.st > 2.4) { this.go('chase'); this.specialCd = lerp(C.cd[0], C.cd[1], Math.random()); }
        break;
      case 'recover':
        w.speed = this.speed * 0.2;
        if (this.st > 0.9) { this.go('chase'); this.specialCd = lerp(C.cd[0], C.cd[1], Math.random()); }
        break;
      case 'slam':
        w.speed = 0;
        if (this.st < 0.6) w.face = Math.atan2(toX, toZ);
        if (this.cross(0.74)) {
          say('stomp', this.vp);
          shake(0.45, 10);
          if (dist < T.reach + 0.55 && this._canHit(world)) dealt = T.dmg;
        }
        if (this.st > 1.4) { this.go('chase'); this.attackCd = T.cd - 1.4; }
        break;
      default: this.go('chase');
    }
    return dealt;
  }

  // ======================= 動畫 =======================
  _resetPose() {
    const L = this.boneList;
    for (let i = 0; i < L.length; i++) { L[i].rotation.set(0, 0, 0); L[i].position.copy(this.rest[i]); }
    this.b.belly.scale.setScalar(1);
  }

  // 雙腿步態;回傳著地腿的垂直長度(用來讓骨盆跟著上下)
  _legs(ph, amp, knee, crouch, o = {}) {
    const b = this.b;
    let ext = 0;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const p = ph + k * Math.PI;
      const bad = this.limp && this.limpSide === s ? this.limp : 0;
      const c = Math.cos(p);
      const th = -amp * (1 - bad * 0.5) * Math.sin(p) - crouch + (o.th ?? 0);
      const kn = knee * (1 - bad * 0.8) * Math.pow(Math.max(0, c), 1.3) + crouch * 1.6 + 0.03 + (o.kn ?? 0);
      b['thigh' + L].rotation.set(th, s * ((o.toe ?? 0.06) + bad * 0.3), s * (o.wide ?? 0.03));
      b['shin' + L].rotation.x = kn;
      b['foot' + L].rotation.x = -(th + kn) * 0.85 + bad * 0.55 * Math.max(0, c) + (o.foot ?? 0);
      ext = Math.max(ext, this.legT * Math.cos(th) + this.legS * Math.cos(th + kn));
    }
    return ext;
  }
  _hipsTo(ext, extra = 0) { this.b.hips.position.y = this.hipY - (this.legT + this.legS - ext) - extra; }
  _advance(dt, amp, sp) { this.ph += (dt * Math.PI * sp) / (2 * (this.legT + this.legS) * Math.sin(Math.max(amp, 0.12))); }
  _arm(L, s, x, z, elbow, wrist = 0, y = 0) {
    const b = this.b;
    b['upperArm' + L].rotation.set(x, s * y, s * z);
    b['forearm' + L].rotation.x = -elbow;
    b['hand' + L].rotation.x = wrist;
  }
  _look(toX, toZ, amt = 1) {
    const rel = clamp(wrapA(Math.atan2(toX, toZ) - this.heading), -1.1, 1.1) * amt;
    this.b.neck.rotation.y += rel * 0.4;
    this.b.head.rotation.y += rel * 0.55;
  }
  _jaw(base) {
    const g = this.jawT > 0 ? Math.sin((1 - this.jawT / 1.3) * Math.PI) * 0.4 : 0;
    this.b.jaw.rotation.x = Math.max(this.b.jaw.rotation.x, base + g);
  }

  _pose_walker(dt, ctx, dist, toX, toZ) {
    const b = this.b, sp = this.speedNow, f = Math.min(1, sp / 0.8), st = this.st;
    const amp = 0.3 * f + 0.03;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    let crouch = 0.07, extra = 0;
    const stumble = this.state === 'stumble' ? env(st, 0, 0.25, 0.6, 1.1) : 0;
    const stagger = this.state === 'stagger' ? env(st, 0, 0.1, 0.3, 0.6) : 0;
    crouch += stumble * 0.25 + stagger * 0.15;
    const ext = this._legs(ph, amp, 0.55 * f + 0.06, crouch, { toe: 0.1, wide: 0.04 });
    this._hipsTo(ext, extra);
    b.hips.rotation.z = Math.sin(ph) * 0.07 * f + (this.limp ? -this.limpSide * 0.06 * Math.max(0, Math.sin(ph + (this.limpSide > 0 ? 0 : Math.PI))) : 0);
    b.hips.rotation.y = Math.sin(ph) * 0.12 * f;
    b.spine.rotation.set(this.lean * 0.6 + stumble * 0.45 - stagger * 0.35, -b.hips.rotation.y * 0.7, -b.hips.rotation.z * 0.8 + this.tilt * 0.15);
    b.chest.rotation.set(this.lean * 0.4 + 0.04 * Math.sin(ph * 2) * f + stumble * 0.2, -b.hips.rotation.y * 0.4, 0);
    b.neck.rotation.x = 0.1 + stumble * 0.2;
    b.head.rotation.set(-0.08 + Math.sin(ph * 2) * 0.05 * f - stumble * 0.3, 0, this.tilt + Math.sin(this.t * 0.7) * 0.09);
    this._look(toX, toZ, 0.8);
    // 手臂
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
      x += stumble * Math.sin(this.t * 13 + k * 2) * 0.6 - stumble * 0.6;
      this._arm(L, s, x, z, el, wr);
    }
    b.spine.rotation.x += clamp2 * 0.35;
    b.head.rotation.x += clamp2 * 0.35;
    b.jaw.rotation.x = 0.06 + clamp2 * 0.55 + raise * 0.2;
    this._jaw(0.06);
  }

  _pose_runner(dt, ctx, dist, toX, toZ) {
    const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
    const f = clamp(sp / 4, 0, 1);
    const amp = lerp(0.3, 0.82, f) * Math.min(1, sp / 0.6 + 0.05);
    this._advance(dt, amp, sp);
    const ph = this.ph;
    let crouch = 0.1 + f * 0.08, lean = 0.2 + 0.35 * f;
    let o = RUN_O;
    if (S === 'crouch') { crouch = lerp(crouch, 0.5, sstep(0, 0.2, st)); lean = 0.6; }
    if (S === 'recover') { crouch = lerp(0.45, 0.15, st / 0.5); lean = 0.5; }
    if (S === 'leap') o = LEAP_O;
    const climb = S === 'climb' ? Math.sin(Math.PI * clamp(st / VAULT_T, 0, 1)) : 0; // 翻越:收腿、手撐
    if (climb) { o = this._vo || (this._vo = { th: 0, kn: 0, toe: 0.05, wide: 0.12 }); o.th = -1.2 * climb; o.kn = 1.8 * climb; lean = 0.35 + 0.3 * climb; }
    const ext = this._legs(ph, S === 'leap' || climb ? 0 : amp, lerp(0.6, 1.8, f), crouch, o);
    this._hipsTo(S === 'leap' ? this.legT + this.legS : ext);
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
      let z = 0.3 + 0.15 * Math.sin(ph * 2 + k), el = 0.9 + 0.5 * f, wr = 0.25;
      if (S === 'crouch') { x = 0.7; z = 0.5; el = 0.6; }
      if (S === 'leap') { x = -2.3 + k * 0.2; z = 0.3; el = 0.3; wr = -0.3; }
      if (S === 'recover') { x = lerp(-1.2, -0.4, st / 0.5); z = 0.45; el = 0.6; }
      if (S === 'attack') { // 左右輪流爪擊
        const u = k ? env(st, 0.28, 0.45, 0.52, 0.7) : env(st, 0.0, 0.17, 0.24, 0.42);
        x = lerp(0.5, -1.9, u); z = lerp(0.6, 0.0, u) + 0.2; el = lerp(1.0, 0.2, u);
      }
      if (S === 'trip' || S === 'getup') { x = -1.4; z = 0.4; el = 0.2; }
      if (climb) { x = lerp(x, -1.15 + k * 0.1, climb); z = lerp(z, 0.25, climb); el = lerp(el, 0.25, climb); wr = -0.6 * climb; }
      this._arm(L, s, x, z, el, wr);
    }
    if (S === 'leap') { b.spine.rotation.x = 0.55; b.head.rotation.x = -0.7; this.rootPitch = 0.35; }
    else this.rootPitch = climb * 0.3;
    if (S === 'attack') { b.spine.rotation.x += 0.2; b.chest.rotation.y += Math.sin(st * 9) * 0.25; }
    if (S === 'trip') { const e = Math.min(1, (st / 0.38) ** 2); this.rootPitch = e * 1.42; this.rootY = e * 0.12; }
    else if (S === 'getup') { const e = 1 - sstep(0, 0.8, st); this.rootPitch = e * 1.42; this.rootY = e * 0.12; this._legs(0, 0, 0, e * 0.6, NO_O); }
    else if (climb || S === 'climb') this.rootY = climb * ((this.vault ? this.vault.h : 0.9) + 0.12);
    else if (S !== 'leap') this.rootY = 0;
    b.jaw.rotation.x = S === 'crouch' || S === 'leap' ? 0.75 : 0.22 + Math.sin(this.t * 9) * 0.1;
    this._jaw(0.2);
  }

  _pose_crawler(dt, ctx, dist, toX, toZ) {
    const b = this.b, s0 = this.V.P.s, st = this.st;
    // 趴地:骨盆轉 90°,身體朝前平躺
    this.ph += dt * TAU * Math.max(0.25, this.speed * 1.1) / 0.62 * (this.state === 'attack' ? 0.2 : 1);
    const ph = this.ph;
    b.hips.position.set(0, 0.165 * s0, -0.36 * s0);
    b.hips.rotation.set(Math.PI / 2 - 0.06, 0, Math.sin(ph) * 0.06);
    let pull = 0;
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const u = (((ph + k * Math.PI) % TAU) + TAU) % TAU / TAU;
      let x, z, el;
      if (u < 0.42) { const q = sstep(0, 1, u / 0.42); x = lerp(-1.4, -2.75, q); el = lerp(1.1, 0.3, q); z = 0.42 + 0.25 * Math.sin(Math.PI * q); }
      else { const q = (u - 0.42) / 0.58; x = lerp(-2.75, -1.4, sstep(0, 1, q)); el = 0.3 + Math.sin(Math.PI * q) * 0.7; z = 0.4; pull = Math.max(pull, Math.sin(Math.PI * q)); }
      if (this.state === 'attack' && k === 0) { const e = env(st, 0.1, 0.4, 0.55, 0.9); x = lerp(x, -3.0, e) + env(st, 0.4, 0.5, 0.6, 0.9) * 1.3; el = lerp(el, 0.2, e); }
      this._arm(L, s, x, z, el, -0.2);
      if (!this.V.P.legless) {
        b['thigh' + L].rotation.set(-0.13 + Math.sin(ph * 0.5 + k) * 0.05, s * 0.15, s * (0.12 + k * 0.08));
        b['shin' + L].rotation.x = 0.25 + k * 0.4 + Math.sin(ph + k) * 0.08;
        b['foot' + L].rotation.x = 1.1;
      }
      const pu = (this.armU ||= [0, 0])[k];
      this.armU[k] = u;
      if (pu < 0.42 && u >= 0.42 && Math.random() < 0.6) say('crawl', this.vp); // 手掌拍地拖行
    }
    this.pull = pull;
    const rear = this.state === 'attack' ? env(st, 0.1, 0.4, 0.6, 0.95) : 0;
    b.spine.rotation.set(-0.1 - pull * 0.06 - rear * 0.35, Math.sin(ph) * 0.1, 0);
    b.chest.rotation.set(-0.16 - rear * 0.3, 0, Math.sin(ph) * 0.14);
    b.neck.rotation.x = -0.62 + rear * 0.2;
    b.head.rotation.set(-0.6 + Math.sin(ph * 2) * 0.07 + rear * 0.15, 0, Math.sin(this.t * 0.9) * 0.1);
    this._look(toX, toZ, 0.9);
    b.jaw.rotation.x = 0.3 + Math.sin(this.t * 4) * 0.12 + rear * 0.45;
    this._jaw(0.25);
  }

  _pose_bloater(dt, ctx, dist, toX, toZ) {
    const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
    const f = Math.min(1, sp / 0.7);
    const amp = 0.2 * f + 0.02;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const ext = this._legs(ph, amp, 0.35 * f + 0.05, 0.08, { toe: 0.25, wide: 0.1 });
    this._hipsTo(ext);
    const rear = S === 'spit' ? env(st, 0, 0.6, 0.66, 0.75) : 0;
    const lurch = S === 'spit' ? env(st, 0.66, 0.76, 0.9, 1.3) : 0;
    const bump = S === 'attack' ? env(st, 0.25, 0.5, 0.6, 0.95) : 0;
    const fuse = S === 'burn' ? clamp(st / FUSE_T, 0, 1) : 0; // 自爆引信:越脹越大、全身發抖、手臂張開
    const shiver = fuse * fuse * (Math.sin(this.t * 41) * 0.6 + Math.sin(this.t * 67) * 0.4);
    b.hips.rotation.z = Math.sin(ph) * 0.15 * f + shiver * 0.05;
    b.hips.rotation.y = Math.sin(ph) * 0.08 * f;
    b.spine.rotation.set(-0.1 - rear * 0.35 + lurch * 0.45 + bump * 0.3 - fuse * 0.32, -b.hips.rotation.y, -b.hips.rotation.z * 0.6 + shiver * 0.04);
    b.chest.rotation.set(0.05 - rear * 0.2 + lurch * 0.25 - fuse * 0.15, 0, 0);
    b.neck.rotation.x = 0.15 - rear * 0.2 - fuse * 0.2;
    b.head.rotation.set(-0.05 - rear * 0.45 + lurch * 0.4 - fuse * 0.5 + shiver * 0.06, 0, Math.sin(this.t * 0.6) * 0.15);
    this._look(toX, toZ, 0.6 * (1 - fuse));
    b.belly.scale.setScalar(1 + 0.04 * Math.sin(this.t * 2.2) + 0.03 * Math.sin(ph * 2) * f + rear * 0.18 - lurch * 0.08 + fuse ** 1.5 * 0.55 + shiver * 0.025);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      this._arm(L, s, -0.2 + Math.sin(ph + k * Math.PI) * 0.12 * f - rear * 0.3 - bump * 0.9 - fuse * 0.5, 0.5 + rear * 0.3 + 0.04 * Math.sin(this.t + k) + fuse * 0.75, 0.6 + bump * 0.3 - fuse * 0.3, 0.2 + fuse * 0.4);
    }
    b.jaw.rotation.x = 0.1 + rear * 0.3 + lurch * 0.8 + fuse * 0.85;
    this._jaw(0.1);
  }

  _pose_brute(dt, ctx, dist, toX, toZ) {
    const b = this.b, sp = this.speedNow, st = this.st, S = this.state;
    const charging = S === 'charge';
    const f = Math.min(1, sp / (charging ? 6 : 1.1));
    const amp = charging ? 0.7 * f + 0.05 : 0.28 * f + 0.02;
    this._advance(dt, amp, sp);
    const ph = this.ph;
    const roar = S === 'roar' ? env(st, 0.05, 0.35, 0.95, 1.15) : 0;
    const raise = S === 'slam' ? env(st, 0.05, 0.6, 0.66, 0.76) : 0;
    const smash = S === 'slam' ? env(st, 0.66, 0.76, 1.0, 1.4) : 0;
    const stun = S === 'stun' ? env(st, 0, 0.3, 2.0, 2.4) : 0;
    const crouch = 0.16 + smash * 0.25 + stun * 0.2 + roar * 0.05;
    const ext = this._legs(ph, amp, charging ? 1.3 : 0.55 * f + 0.05, crouch, { toe: 0.15, wide: 0.1 });
    this._hipsTo(ext);
    // 重踏:每步震動鏡頭
    const n = Math.floor((ph + Math.PI / 2) / Math.PI);
    if (n !== this.stepN) {
      this.stepN = n;
      if (f > 0.3) { say('stomp', this.vp); this._shakeLocal(ctx, charging ? 0.25 : 0.14, 12); }
    }
    b.hips.rotation.z = Math.sin(ph) * 0.08 * f;
    b.hips.rotation.y = Math.sin(ph) * 0.12 * f;
    const lean = charging ? 0.55 : 0.28;
    b.spine.rotation.set(lean - roar * 0.4 - raise * 0.25 + smash * 0.6, -b.hips.rotation.y, -b.hips.rotation.z + Math.sin(this.t * 2.6) * 0.15 * stun);
    b.chest.rotation.set((charging ? 0.3 : 0.18) + 0.03 * Math.sin(ph * 2) * f - roar * 0.35 - raise * 0.15 + smash * 0.35, -b.hips.rotation.y * 1.2, 0);
    b.neck.rotation.x = 0.18 - roar * 0.2 + stun * 0.5;
    b.head.rotation.set(-0.35 - roar * 0.55 + stun * 0.4 + (charging ? -0.2 : 0), 0, Math.sin(this.t * 1.7) * 0.2 * stun);
    if (!stun) this._look(toX, toZ, 0.6);
    b.belly.scale.setScalar(1 + 0.05 * Math.sin(this.t * 1.6) + roar * 0.08);
    for (let k = 0; k < 2; k++) {
      const s = k ? -1 : 1, L = k ? 'R' : 'L';
      const sw = Math.sin(ph + k * Math.PI);
      let x = 0.05 - sw * (charging ? 0.6 : 0.32) * f + (charging ? 0.35 : 0);
      let z = 0.32 + (charging ? 0.15 : 0), el = 0.35 + (charging ? 0.4 : 0);
      x = lerp(x, -0.5, roar); z = lerp(z, 1.15, roar); el = lerp(el, 0.9, roar);
      x = lerp(x, -2.9, raise); z = lerp(z, 0.25, raise); el = lerp(el, 0.6, raise);
      x = lerp(x, -0.55, smash); z = lerp(z, 0.2, smash); el = lerp(el, 0.15, smash);
      x = lerp(x, 0.15, stun); z = lerp(z, 0.2, stun);
      this._arm(L, s, x, z, el, 0.1);
    }
    b.jaw.rotation.x = 0.1 + roar * 0.85 + smash * 0.4 + (charging ? 0.4 : 0);
    this._jaw(0.1);
  }

  // 受擊彈簧:往後仰、側傾、爆頭甩頭
  _reactions(dt, ctx) {
    const b = this.b;
    this.flinchV += (-this.flinch * 70 - this.flinchV * 10) * dt;
    this.flinch += this.flinchV * dt;
    this.rollV += (-this.roll * 60 - this.rollV * 9) * dt;
    this.roll += this.rollV * dt;
    this.headKick *= Math.pow(0.015, dt);
    b.spine.rotation.x -= this.flinch * 0.4;
    b.chest.rotation.x -= this.flinch * 0.4;
    b.chest.rotation.z += this.roll * 0.3;
    b.head.rotation.x -= this.flinch * 0.5 + this.headKick * 0.9;
    b.head.rotation.z += this.roll * 0.5;
    Z3.layer(this, dt, ctx); // [zombies-w3] 抽搐、歪頭、定格、受擊部位反應、倒退走、閒置搖晃
  }

  // 地面坡度(樓梯):amt = 套用比例(趴地/倒地 = 1);沿面向的坡度 → tiltF(上坡抬頭),左右坡度 → tiltS
  _slope(world, amt, dt) {
    let f = 0, s = 0;
    if (amt > 0 && world.normalAt) {
      const n = world.normalAt(this.pos.x, this.pos.z, this.pos.y, this._n || (this._n = { x: 0, y: 1, z: 0 }));
      if (n.y < 0.999) {
        const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
        f = -Math.atan(-(n.x * sh + n.z * ch) / n.y) * amt;
        s = Math.atan(-(n.x * ch - n.z * sh) / n.y) * amt;
      }
    }
    const k = Math.min(1, dt * 10);
    this.tiltF += (f - this.tiltF) * k;
    this.tiltS += (s - this.tiltS) * k;
  }

  _applyRoot() {
    this.root.position.set(this.pos.x, this.pos.y + this.rootY + (this.alive ? this.stepY : 0), this.pos.z);
    this.root.rotation.set(this.rootPitch + this.tiltF, this.heading + this.yawOff, this.rootRoll + this.tiltS); // [zombies-w3] yawOff:倒退走時身體轉向
  }

  // ======================= 死亡 =======================
  _dead(dt, ctx) {
    this.dying += dt;
    if (this.rag) { if (this.corpse < 1.5) { this.rootY -= (1.5 - this.corpse) * 0.3; this._applyRoot(); } return; } // 物理布娃娃(src/physics)接手骨骼姿勢,這裡只做屍體下沉
    const t = this.dying, b = this.b, kind = this.deathKind, side = this.deathSide;
    this.vel.multiplyScalar(Math.pow(0.03, dt));
    this.pos.addScaledVector(this.vel, dt);
    ctx.world.resolve(this.pos, 0.3);
    const sm = Math.min(1, dt * 9);
    const R = (bone, x, y, z, k = sm) => { const r = b[bone].rotation; r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k; };
    const fall = (t0, t1) => {
      const u = clamp((t - t0) / (t1 - t0), 0, 1);
      if (u >= 1 && !this.landed) { this.landed = true; say('thud', this.vp, this.type === 'brute'); if (this.type === 'brute') this._shakeLocal(ctx, 0.35, 12); }
      return u < 1 ? u * u : 1 - Math.exp(-(t - t1) * 9) * Math.sin((t - t1) * 22) * 0.05;
    };
    const limpLegs = (kn) => { for (const L of ['L', 'R']) { R('thigh' + L, -0.15, 0, 0); R('shin' + L, kn, 0, 0); R('foot' + L, 0.4, 0, 0); } };
    let e;
    switch (kind) {
      case 'back':
        e = fall(0.12, 0.85);
        this.rootPitch = -e * 1.5;
        this.rootY = e * 0.13;
        limpLegs(t < 0.4 ? 0.7 : 0.2);
        R('spine', -0.15, 0, 0); R('chest', -0.1, 0, 0); R('neck', -0.2, 0, 0); R('head', -0.35, e * side * 0.7, 0);
        R('upperArmL', -2.3 * e, 0, 0.5); R('upperArmR', -2.1 * e, 0, -0.6); R('forearmL', -0.3, 0, 0); R('forearmR', -0.5, 0, 0);
        break;
      case 'front':
        e = fall(0.08, 0.7);
        this.rootPitch = e * 1.48;
        this.rootY = e * 0.12;
        limpLegs(t < 0.35 ? 0.8 : 0.15);
        R('spine', 0.2, 0, 0); R('chest', 0.1, 0, 0); R('neck', 0, 0, 0); R('head', -0.2, side * 1.1 * e, 0);
        R('upperArmL', -0.5 + e * 0.4, 0, 0.35); R('upperArmR', -0.9 + e * 0.6, 0, -0.5); R('forearmL', -0.4, 0, 0); R('forearmR', -0.8, 0, 0);
        break;
      case 'kneel': { // 先跪下,再側倒
        const k1 = sstep(0, 0.45, t);
        const h = this.legT * 0.98 + 0.07;
        b.hips.position.y += ((this.hipY - (this.hipY - h) * k1) - b.hips.position.y) * sm;
        for (const L of ['L', 'R']) { R('thigh' + L, -0.1 * k1, 0, 0); R('shin' + L, 1.5 * k1, 0, 0); R('foot' + L, 0.5 * k1, 0, 0); }
        R('spine', 0.35, 0, 0); R('chest', 0.2, 0, 0); R('head', 0.3, 0, side * 0.3);
        R('upperArmL', 0.1, 0, 0.1); R('upperArmR', 0.1, 0, -0.1); R('forearmL', -0.2, 0, 0); R('forearmR', -0.2, 0, 0);
        e = fall(0.6, 1.3);
        this.rootRoll = side * e * 1.42;
        this.rootY = e * 0.16 * this.V.P.s;
        break;
      }
      case 'flat':
        b.hips.position.y += (0.11 * this.V.P.s - b.hips.position.y) * sm;
        R('spine', 0.05, 0, 0); R('chest', 0.08, 0, 0); R('neck', -0.1, 0, 0); R('head', 0.1, side * 1.0, 0);
        R('upperArmL', -2.4, 0, 0.6); R('upperArmR', -1.8, 0, -0.5); R('forearmL', -0.3, 0, 0); R('forearmR', -0.6, 0, 0);
        if (t > 0.4 && !this.landed) { this.landed = true; say('thud', this.vp, false); }
        break;
      case 'burst': { // 膨脹 → 爆開 → 往後倒
        if (t < 0.5) {
          const k = t / 0.5;
          b.belly.scale.setScalar(1 + k * 0.7 + Math.sin(t * 60) * 0.04 * k);
          R('upperArmL', -0.4, 0, 0.9); R('upperArmR', -0.4, 0, -0.9); R('head', -0.5, 0, 0);
          b.jaw.rotation.x = 0.9 * k;
          this.rootY = 0;
        } else {
          if (!this.exploded) { this.exploded = true; ctx.game.explode(this); }
          b.belly.scale.setScalar(Math.max(0.55, b.belly.scale.x - dt * 6));
          e = fall(0.55, 1.15);
          this.rootPitch = -e * 1.5;
          this.rootY = e * 0.2;
          limpLegs(0.3);
          R('upperArmL', -2.0 * e, 0, 0.7); R('upperArmR', -2.2 * e, 0, -0.7);
        }
        break;
      }
    }
    this._slope(ctx.world, kind === 'flat' ? 1 : clamp(e ?? 0, 0, 1), dt); // 倒在樓梯上時順著坡面
    if (this.corpse !== undefined && this.corpse < 1.5) this.rootY -= (1.5 - this.corpse) * 0.3;
    this._applyRoot();
  }

  dispose() {
    this.scene.remove(this.root);
    // 每個實例的骨架各有一張 GPU 骨骼貼圖(boneTexture),不 dispose 就每隻殭屍漏一張
    this.root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton?.boneTexture) o.skeleton.dispose(); });
    this.bar.tex.dispose();
    this.bar.sprite.material.dispose();
  }
}

// [zombies-w3] 新類型的 think/pose 掛到原型上;行為模組用同一個有額度的 say
installBehaviors(Zombie, { say, budget });
