// 所有殭屍共用的「不自然動作」動畫層(疊加在各類型的姿勢之後;房主與連線代理都跑,不配置記憶體):
//  - 關節抽搐:不定時某個關節猛地一折再慢慢回來(頭、肩、手肘、手腕、下顎)
//  - 歪頭:突然把頭歪到很不自然的角度,停一兩秒
//  - 定格:部分個體的動作偶爾停格 0.06~0.16 秒(像掉幀的停格動畫)
//  - 依命中部位的受擊反應:頭往後甩、被打中的手臂往後彈、腿被打中膝蓋一軟、軀幹被打得扭轉
//  - 攻擊前的蓄勢(往後縮)再撲出去
//  - 跛腳的變化:膝蓋不時打軟、拖著腳尖
//  - 閒置:站著不動時身體搖晃、頭部抽動;部分行屍遠離玩家時會面壁站著
//  - 倒退走:少數行屍背對玩家倒退著走,頭整個轉 180 度盯著你;靠近時猛然轉身
//  - 老人體型:駝背
import { ZU } from '../materials.js';
import { clamp, lerp, sstep, env, rand } from './kit.js';

// 各類型的個性強度:tw 抽搐間隔、twA 抽搐幅度、tilt 歪頭、stut 有定格毛病的機率、idle 閒置搖晃、back 倒退走機率、wall 面壁機率
const PROF = {
  walker: { tw: [1.2, 4], twA: 0.45, tilt: 0.75, stut: 0.35, idle: 1, back: 0.12, wall: 0.35 },
  runner: { tw: [0.8, 3], twA: 0.3, tilt: 0.3, stut: 0.2, idle: 0.6 },
  crawler: { tw: [1, 3.5], twA: 0.4, tilt: 0.5, stut: 0.45, idle: 0.5 },
  bloater: { tw: [2.5, 6], twA: 0.2, tilt: 0.3, stut: 0.1, idle: 0.6 },
  brute: { tw: [3, 7], twA: 0.12, tilt: 0.15, stut: 0, idle: 0.4 },
  screamer: { tw: [0.5, 2], twA: 0.6, tilt: 1, stut: 0.6, idle: 1 },
  stalker: { tw: [0.8, 2.5], twA: 0.45, tilt: 0.8, stut: 0.5, idle: 0.6 },
  surgeon: { tw: [1, 3], twA: 0.35, tilt: 0.6, stut: 0.3, idle: 0.8 },
  burned: { tw: [1.5, 4], twA: 0.3, tilt: 0.4, stut: 0.25, idle: 0.7 },
  hazmat: { tw: [3, 7], twA: 0.15, tilt: 0.3, stut: 0.1, idle: 0.5 },
  straitjacket: { tw: [0.5, 1.8], twA: 0.5, tilt: 0.9, stut: 0.3, idle: 1 },
};
const HEAVY = { brute: 0.25, hazmat: 0.5, bloater: 0.6 };
// 抽搐的骨骼(BONES 索引):頭、脖子、上臂、前臂、手、下顎、胸、鎖骨
const TW_BONES = [6, 6, 5, 9, 13, 10, 14, 11, 15, 7, 4, 8, 12];
const BW_O = { toe: 0.1, wide: 0.05 }; // 倒退走的步態參數
const NB = 22; // 骨骼數
const ARMS = ['upperArmL', 'upperArmR'], SHIN = ['shinL', 'shinR'], FOOT = ['footL', 'footR'];

export function animInit(z) {
  const P = PROF[z.type] || PROF.walker;
  z.yawOff = 0;
  z._an = {
    P, tw: rand(P.tw[0], P.tw[1]), twT: 9, twB: 6, twX: 0, twY: 0, twZ: 0,
    tiltT: rand(1, 6), tilt: 0, tiltA: 0, tiltH: 0,
    stu: Math.random() < P.stut, stT: rand(1, 5), frz: 0, snap: new Float32Array(NB * 3 + 1), saved: false,
    hx: new Float32Array(6), hv: new Float32Array(6), hs: 1, ts: 1,
    idle: 0, back: Math.random() < (P.back || 0), bw: 0,
    wall: Math.random() < (P.wall || 0), wallT: rand(10, 30), wallYaw: 0, wallDur: 4,
  };
}

// 受傷(沒死):依部位把衝量加到對應的彈簧
export function animHit(z, dmg, part, hit) {
  const a = z._an;
  if (!a) return;
  const k = clamp(dmg / 40, 0.25, 1.6) * (HEAVY[z.type] ?? 1);
  // 從哪一側被打中(子彈方向轉到殭屍本地:+X 是殭屍的左側)
  let side = Math.random() < 0.5 ? 1 : -1;
  if (hit && hit.dir) {
    const h = z.heading + (z.yawOff || 0), lx = hit.dir.x * Math.cos(h) - hit.dir.z * Math.sin(h);
    if (Math.abs(lx) > 0.15) side = lx > 0 ? 1 : -1;
  }
  const bone = hit && hit.bone ? hit.bone : '';
  let ch = 5;
  if (part === 'head') ch = 0;
  else if (part === 'arm') ch = bone.endsWith('R') ? 2 : bone.endsWith('L') ? 1 : side > 0 ? 1 : 2;
  else if (part === 'leg') ch = bone.endsWith('R') ? 4 : bone.endsWith('L') ? 3 : side > 0 ? 3 : 4;
  if (ch >= 3 && ch <= 4 && z.V.P.legless) ch = 5;
  a.hv[ch] += 9 * k;
  if (ch === 0) a.hs = side;
  if (ch === 5) a.ts = side;
  if (a.wallT < 0) a.wallT = 8; // 被打:面壁中斷
  a.frz = 0;
}

// AI 之前(房主):部分行屍在玩家附近(12~28m)、還沒發現玩家而且看不到玩家時,偶爾停下來面壁站著 3~6 秒——
// 讓玩家轉過轉角時撞見一個背對著、低著頭抽搐的身影。很少發生、時間短,回合快結束時不做(不拖慢節奏)。回傳 true = 這幀不跑 AI
export function idleThink(z, dt, ctx, dist, w) {
  const a = z._an;
  if (!a || !a.wall) return false;
  if (z.state === 'idle') {
    a.wallT -= dt;
    const wake = a.wallT <= -a.wallDur || a.wallT > 0 || z.alerted || (z.los && z.d3 < 20) || z.d3 < 10 || z.hp < z.maxHp;
    if (wake) { z.go('chase'); a.wallT = rand(25, 45); return false; }
    w.speed = 0; w.face = a.wallYaw;
    return true;
  }
  if (z.state !== 'chase' || z.alerted || z.los || z.d3 < 12 || z.d3 > 28) return false;
  a.wallT -= dt;
  if (a.wallT > 0) return false;
  a.wallT = rand(25, 45);
  const g = ctx.game;
  if (Math.random() < 0.7 || !ctx.world.isNode || (g && g.toSpawn === 0)) return false;
  a.wallDur = rand(3, 6);
  // 找最近的牆:8 個方向 1.2m 處不是導航節點
  const p = z.pos;
  for (let i = 0; i < 8; i++) {
    const ang = z.heading + (i * Math.PI) / 4, sx = Math.sin(ang), sz = Math.cos(ang);
    if (!ctx.world.isNode(p.x + sx * 1.2, p.y, p.z + sz * 1.2)) {
      a.wallYaw = ang;
      a.wallT = -0.01; // 負值 = 面壁中,計時到 -wallDur 秒醒來
      z.go('idle');
      w.speed = 0; w.face = ang;
      return true;
    }
  }
  return false;
}

let lastT = -1;
export function animLayer(z, dt, ctx) {
  const a = z._an;
  if (!a) return;
  // 全域 uniform(每幀一次):時間(餘燼閃爍)、手電筒開關(眼底反光)
  const now = performance.now();
  if (now !== lastT) { lastT = now; ZU.uTime.value = now * 0.001; if (ctx && ctx.player) ZU.uFlash.value = ctx.player.flashOn === false ? 0 : 1; }
  if (!z.alive || z.amb) return; // 埋伏/天花板掉落中:姿勢由 ambush 控制
  const b = z.b, P = a.P, t = z.t, st = z.st, S = z.state;

  // ---- 老人:駝背 ----
  if (z.V.P.old && S !== 'leap') { b.spine.rotation.x += 0.22; b.chest.rotation.x += 0.16; b.neck.rotation.x -= 0.12; b.head.rotation.x -= 0.1; }

  // ---- 倒退走(只有部分行屍):遠處追玩家時背對著走,頭轉 180 度;靠近時猛然轉身 ----
  if (a.back) {
    const want = S === 'chase' && z.speedNow > 0.3 && z.dist > 3.4 ? 1 : 0;
    a.bw += clamp(want - a.bw, -dt * 4.5, dt * 2.5);
    const e = sstep(0, 1, a.bw);
    z.yawOff = Math.PI * e;
    if (e > 0.02) {
      const f = Math.min(1, z.speedNow / 0.8), amp = 0.26 * f + 0.03;
      if (e > 0.5) { const ext = z._legs(-z.ph, amp, 0.5 * f + 0.06, 0.08, BW_O); z._hipsTo(ext); }
      b.neck.rotation.y += Math.PI * 0.4 * e;
      b.head.rotation.y += Math.PI * 0.6 * e;
      b.head.rotation.z += 0.25 * e;
      b.spine.rotation.x -= 0.3 * e;
      for (let i = 0; i < 2; i++) { const r = b[ARMS[i]].rotation; r.x = lerp(r.x, 0.15, e); r.z *= 1 - 0.6 * e; }
    }
  }

  // ---- 跛腳變化:膝蓋不時打軟 ----
  if (z.limp && (S === 'chase' || S === 'idle') && z.speedNow > 0.3) {
    const s = z.limpSide, j = s > 0 ? 0 : 1;
    const ph = z.ph + (s > 0 ? 0 : Math.PI);
    const buckle = Math.pow(Math.max(0, Math.sin(ph * 0.5 + z.seed)), 12) * z.limp; // 每兩步一次
    b[SHIN[j]].rotation.x += buckle * 0.7;
    b.hips.position.y -= buckle * 0.06;
    b.hips.rotation.z -= s * buckle * 0.1;
    b[FOOT[j]].rotation.x += 0.35 * z.limp; // 拖著腳尖
  }

  // ---- 攻擊:蓄勢往後縮,再撲出去 ----
  if (S === 'attack') {
    const ant = env(st, 0, 0.14, 0.2, 0.36), lunge = env(st, 0.36, 0.48, 0.62, 0.95);
    b.spine.rotation.x += -0.28 * ant + 0.3 * lunge;
    b.head.rotation.x += -0.2 * ant + 0.15 * lunge;
    b.hips.position.z += 0.07 * lunge * (z.type === 'crawler' ? 0 : 1);
    b.jaw.rotation.x += 0.35 * lunge;
  }

  // ---- 閒置:搖晃、聳肩 ----
  const idleW = (S === 'chase' || S === 'idle') && z.speedNow < 0.25 && !a.bw ? 1 : 0;
  a.idle += (idleW - a.idle) * Math.min(1, dt * 3);
  if (a.idle > 0.01) {
    const k = a.idle * P.idle, sd = z.seed;
    b.spine.rotation.z += Math.sin(t * 0.9 + sd) * 0.07 * k;
    b.spine.rotation.x += (0.08 + Math.sin(t * 0.55 + sd * 2) * 0.05) * k;
    b.chest.rotation.y += Math.sin(t * 0.4 + sd) * 0.12 * k;
    b.head.rotation.y += Math.sin(t * 0.33 + sd * 3) * 0.35 * k;
    b.head.rotation.x += Math.sin(t * 0.7 + sd) * 0.08 * k;
    b.upperArmL.rotation.x += Math.sin(t * 1.1 + sd) * 0.07 * k;
    b.upperArmR.rotation.x += Math.sin(t * 1.05 + sd + 2) * 0.07 * k;
    b.clavL.rotation.z += 0.08 * k; b.clavR.rotation.z -= 0.08 * k;
    if (S === 'idle') { b.head.rotation.x += 0.35 * k; b.neck.rotation.x += 0.2 * k; } // 面壁:低著頭
  }

  // ---- 關節抽搐 ----
  a.tw -= dt;
  if (a.tw <= 0) {
    a.tw = rand(P.tw[0], P.tw[1]);
    a.twT = 0;
    a.twB = TW_BONES[(Math.random() * TW_BONES.length) | 0];
    const A = P.twA * rand(0.5, 1.2);
    a.twX = rand(-1, 1) * A; a.twY = rand(-1, 1) * A * 0.7; a.twZ = rand(-1, 1) * A;
  }
  if (a.twT < 1.2) {
    a.twT += dt;
    const e = a.twT < 0.035 ? a.twT / 0.035 : Math.exp(-(a.twT - 0.035) * 7);
    const r = z.boneList[a.twB].rotation;
    r.x += a.twX * e; r.y += a.twY * e; r.z += a.twZ * e;
  }

  // ---- 歪頭 ----
  a.tiltT -= dt;
  if (a.tiltT <= 0 && a.tiltH <= 0) { a.tiltA = (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.8) * P.tilt; a.tiltH = rand(0.8, 2.4); a.tiltT = rand(3, 9); }
  if (a.tiltH > 0) { a.tiltH -= dt; a.tilt += (a.tiltA - a.tilt) * Math.min(1, dt * 16); } // 猛然歪過去
  else a.tilt += (0 - a.tilt) * Math.min(1, dt * 2.2); // 慢慢回正
  b.head.rotation.z += a.tilt;
  b.neck.rotation.z += a.tilt * 0.35;

  // ---- 受擊部位反應(彈簧) ----
  const H = a.hx, Vv = a.hv;
  for (let i = 0; i < 6; i++) {
    if (H[i] === 0 && Vv[i] === 0) continue;
    Vv[i] += (-H[i] * 95 - Vv[i] * 10) * dt;
    H[i] += Vv[i] * dt;
    if (Math.abs(H[i]) < 1e-4 && Math.abs(Vv[i]) < 1e-3) { H[i] = 0; Vv[i] = 0; }
  }
  if (H[0]) { b.neck.rotation.x -= H[0] * 0.35; b.head.rotation.x -= H[0] * 0.7; b.head.rotation.z += H[0] * a.hs * 0.45; b.head.rotation.y += H[0] * a.hs * 0.3; }
  if (H[1]) { b.upperArmL.rotation.x += H[1] * 0.9; b.upperArmL.rotation.z += H[1] * 0.45; b.forearmL.rotation.x += H[1] * 0.5; b.clavL.rotation.y -= H[1] * 0.3; b.chest.rotation.y += H[1] * 0.15; }
  if (H[2]) { b.upperArmR.rotation.x += H[2] * 0.9; b.upperArmR.rotation.z -= H[2] * 0.45; b.forearmR.rotation.x += H[2] * 0.5; b.clavR.rotation.y += H[2] * 0.3; b.chest.rotation.y -= H[2] * 0.15; }
  if (H[3]) { b.shinL.rotation.x += H[3] * 1.1; b.thighL.rotation.x -= H[3] * 0.4; b.hips.position.y -= H[3] * 0.08; b.hips.rotation.z += H[3] * 0.14; b.spine.rotation.z -= H[3] * 0.12; }
  if (H[4]) { b.shinR.rotation.x += H[4] * 1.1; b.thighR.rotation.x -= H[4] * 0.4; b.hips.position.y -= H[4] * 0.08; b.hips.rotation.z -= H[4] * 0.14; b.spine.rotation.z += H[4] * 0.12; }
  if (H[5]) { b.spine.rotation.y += H[5] * a.ts * 0.45; b.spine.rotation.z += H[5] * a.ts * 0.12; b.chest.rotation.x -= H[5] * 0.25; }

  // ---- 定格(只有部分個體):偶爾停在上一個姿勢 0.06~0.16 秒 ----
  if (a.stu && (S === 'chase' || S === 'attack' || S === 'idle')) {
    if (a.frz > 0) {
      a.frz -= dt;
      if (a.saved) {
        const L = z.boneList, s = a.snap;
        for (let i = 0; i < NB; i++) L[i].rotation.set(s[i * 3], s[i * 3 + 1], s[i * 3 + 2]);
        b.hips.position.y = s[NB * 3];
        return;
      }
    }
    a.stT -= dt;
    if (a.stT <= 0) { a.stT = rand(1.5, 5); a.frz = rand(0.06, 0.16); }
    const L = z.boneList, s = a.snap;
    for (let i = 0; i < NB; i++) { const r = L[i].rotation; s[i * 3] = r.x; s[i * 3 + 1] = r.y; s[i * 3 + 2] = r.z; }
    s[NB * 3] = b.hips.position.y;
    a.saved = true;
  }
}
