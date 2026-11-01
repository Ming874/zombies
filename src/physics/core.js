// 物理核心(Rapier WASM):主執行緒模式與 Web Worker 模式共用同一份程式。
// 只吃純資料命令(陣列,可直接 postMessage 結構化複製),不依賴 THREE。
// 固定步長 60Hz(掉幀時子步,上限 MAX_SUB);每幀輸出「這一幀有動過的剛體槽位」的前一步/本步姿態
// (主執行緒依 alpha 做渲染插值)與事件(撞擊聲、布娃娃靜止)。
export const H = 1 / 60;
export const MAX_SUB = 4;
export const SLOTS = 2048; // 動態剛體槽位上限(道具 + 布娃娃部位 + 碎片)
export const HEAD = 6; // 輸出表頭:[筆數, alpha, 本幀步數, 步進耗時 ms, 活動剛體數, 總剛體數]
export const STRIDE = 15; // 每筆:slot + 前一步姿態(7) + 本步姿態(7)
export const OUT_LEN = HEAD + SLOTS * STRIDE;
export const SHAPE = { BOX: 0, BALL: 1, CAPSULE: 2, CYLINDER: 3 }; // 形狀編碼:[type, a, b, c, ox, oy, oz, qx, qy, qz, qw]
export const SHAPE_LEN = 11;
export const KIND = { NONE: 0, PROP: 1, PART: 2, DEBRIS: 3, CHIP: 4 };

// 碰撞群組:高 16 位 = 所屬,低 16 位 = 會跟誰碰。角色推擠膠囊只碰輕道具(巨屍連重道具也推得動);
// 布娃娃不跟角色碰(活殭屍不會把屍體踢飛);小碎屑只碰靜態場景(省效能)
const BIT = { STATIC: 1, LIGHT: 2, HEAVY: 4, RAG: 8, CHAR: 16, BRUTE: 32, DEBRIS: 64, CHIP: 128 };
const ig = (m, f) => (m << 16) | f;
export const GROUPS = {
  static: ig(BIT.STATIC, 0xffff),
  light: ig(BIT.LIGHT, BIT.STATIC | BIT.LIGHT | BIT.HEAVY | BIT.RAG | BIT.CHAR | BIT.BRUTE | BIT.DEBRIS),
  heavy: ig(BIT.HEAVY, BIT.STATIC | BIT.LIGHT | BIT.HEAVY | BIT.RAG | BIT.BRUTE | BIT.DEBRIS),
  rag: ig(BIT.RAG, BIT.STATIC | BIT.LIGHT | BIT.HEAVY | BIT.RAG | BIT.DEBRIS),
  char: ig(BIT.CHAR, BIT.LIGHT),
  brute: ig(BIT.BRUTE, BIT.LIGHT | BIT.HEAVY),
  debris: ig(BIT.DEBRIS, BIT.STATIC | BIT.LIGHT | BIT.HEAVY | BIT.RAG),
  chip: ig(BIT.CHIP, BIT.STATIC),
};

// 形狀體積(用來把指定質量換算成密度)
export function shapeVolume(s, i = 0) {
  const t = s[i], a = s[i + 1], b = s[i + 2], c = s[i + 3];
  if (t === SHAPE.BOX) return 8 * a * b * c;
  if (t === SHAPE.BALL) return (4 / 3) * Math.PI * a * a * a;
  if (t === SHAPE.CAPSULE) return Math.PI * b * b * 2 * a + (4 / 3) * Math.PI * b * b * b;
  return Math.PI * b * b * 2 * a;
}

const FAR2 = 32 * 32; // 離玩家超過這個距離的道具強制休眠
const CHAR_STRIDE = 10; // 角色推擠資料:id, x, y, z, vx, vz, 半徑, 身高, 推力上限(N), 推得動重物(0/1)

export function createCore(R) {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = H;
  world.numSolverIterations = 2; // 道具/碎片用 2 次就夠穩;布娃娃部位另外加 2 次(關節鏈需要)
  const queue = new R.EventQueue(true);
  const bodies = new Array(SLOTS).fill(null);
  const kind = new Uint8Array(SLOTS);
  const mass = new Float32Array(SLOTS);
  const live = new Set(); // 有剛體的槽位
  const colSlot = new Map(); // collider handle → slot
  const statics = new Map(); // 靜態盒 id → collider
  const rags = new Map(); // 布娃娃 id → { slots, mass, calm, t, maxT, done }
  const prev = new Float32Array(SLOTS * 7), cur = new Float32Array(SLOTS * 7);
  const touched = new Int32Array(SLOTS).fill(-9), listed = new Int32Array(SLOTS).fill(-1), lastHit = new Int32Array(SLOTS).fill(-99);
  const list = [];
  const events = [];
  const focus = { x: 0, y: 0, z: 0, ok: false };
  let steps = 0, frame = 0, acc = 0, alpha = 0, frameSteps = 0, stepMs = 0, active = 0;
  const tv = { x: 0, y: 0, z: 0 }, tq = { x: 0, y: 0, z: 0, w: 1 }, tw = { x: 0, y: 0, z: 0 };
  const ZERO = { x: 0, y: 0, z: 0 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------- 形狀 ----------
  function colliderDesc(s, i) {
    const t = s[i], a = s[i + 1], b = s[i + 2], c = s[i + 3];
    const d = t === SHAPE.BOX ? R.ColliderDesc.cuboid(a, b, c) : t === SHAPE.BALL ? R.ColliderDesc.ball(a)
      : t === SHAPE.CAPSULE ? R.ColliderDesc.capsule(a, b) : R.ColliderDesc.cylinder(a, b);
    d.setTranslation(s[i + 4], s[i + 5], s[i + 6]);
    tq.x = s[i + 7]; tq.y = s[i + 8]; tq.z = s[i + 9]; tq.w = s[i + 10];
    d.setRotation(tq);
    return d;
  }

  // ---------- 靜態場景 ----------
  // boxes:Float32Array,每 10 個數 = 中心(3) + 半長(3) + 旋轉四元數(4);hulls:凸包頂點陣列(樓梯坡道)
  const staticCols = [];
  function addStatic(boxes, hulls, friction = 0.8, replace = false) {
    if (replace) { for (const c of staticCols) world.removeCollider(c, false); staticCols.length = 0; }
    for (let i = 0; i + 9 < boxes.length; i += 10) {
      const d = R.ColliderDesc.cuboid(boxes[i + 3], boxes[i + 4], boxes[i + 5]).setTranslation(boxes[i], boxes[i + 1], boxes[i + 2]);
      if (boxes[i + 9] !== 1) { tq.x = boxes[i + 6]; tq.y = boxes[i + 7]; tq.z = boxes[i + 8]; tq.w = boxes[i + 9]; d.setRotation(tq); }
      staticCols.push(world.createCollider(d.setFriction(friction).setRestitution(0.05).setCollisionGroups(GROUPS.static)));
    }
    for (const h of hulls || []) {
      const d = R.ColliderDesc.convexHull(h instanceof Float32Array ? h : new Float32Array(h));
      if (d) staticCols.push(world.createCollider(d.setFriction(1.0).setRestitution(0.02).setCollisionGroups(GROUPS.static)));
    }
  }
  function addStaticBox(id, cx, cy, cz, hx, hy, hz) {
    removeStaticBox(id);
    statics.set(id, world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setFriction(0.7).setRestitution(0.05).setCollisionGroups(GROUPS.static)));
  }
  function removeStaticBox(id) {
    const c = statics.get(id);
    if (c) { world.removeCollider(c, true); statics.delete(id); }
  }

  // ---------- 動態剛體 ----------
  // o:{ g 群組, den 密度, mass 總質量, f 摩擦, e 彈性, ld/ad 阻尼, sleep 先休眠, ccd, gs 重力倍率, ev 撞擊事件門檻(N) }
  function addBody(slot, k, p, v, shapes, o = {}) {
    removeBody(slot);
    tq.x = p[3]; tq.y = p[4]; tq.z = p[5]; tq.w = p[6];
    const d = R.RigidBodyDesc.dynamic().setTranslation(p[0], p[1], p[2]).setRotation(tq)
      .setLinearDamping(o.ld ?? 0.05).setAngularDamping(o.ad ?? 0.3).setCcdEnabled(!!o.ccd).setUserData(slot);
    if (v) { d.setLinvel(v[0], v[1], v[2]); tw.x = v[3] || 0; tw.y = v[4] || 0; tw.z = v[5] || 0; d.setAngvel(tw); }
    if (o.sleep) d.setSleeping(true);
    if (o.gs !== undefined) d.setGravityScale(o.gs);
    if (o.iters) d.setAdditionalSolverIterations(o.iters);
    const b = world.createRigidBody(d);
    let vol = 0;
    for (let i = 0; i + SHAPE_LEN <= shapes.length; i += SHAPE_LEN) vol += shapeVolume(shapes, i);
    const den = o.mass ? o.mass / Math.max(vol, 1e-6) : (o.den ?? 1000);
    const grp = GROUPS[o.g] ?? GROUPS.light;
    for (let i = 0; i + SHAPE_LEN <= shapes.length; i += SHAPE_LEN) {
      const cd = colliderDesc(shapes, i).setDensity(den).setFriction(o.f ?? 0.6).setRestitution(o.e ?? 0.1).setCollisionGroups(grp);
      if (o.ev) cd.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(o.ev);
      const c = world.createCollider(cd, b);
      colSlot.set(c.handle, slot);
    }
    bodies[slot] = b;
    kind[slot] = k;
    mass[slot] = b.mass();
    live.add(slot);
    capture(slot, b, true);
    return b;
  }
  function removeBody(slot) {
    const b = bodies[slot];
    if (!b) return;
    for (let i = 0, n = b.numColliders(); i < n; i++) colSlot.delete(b.collider(i).handle);
    world.removeRigidBody(b);
    bodies[slot] = null;
    kind[slot] = KIND.NONE;
    live.delete(slot);
  }

  // ---------- 布娃娃 ----------
  // parts:[{ slot, p:[7], v:[6], shapes, den }];joints:[{ a, b, a1:[3], a2:[3], hinge:[min,max] | lim:[[min,max]×3] }]
  // o:{ fric 關節阻尼(肌肉張力), maxT 最長模擬秒數, f 摩擦, ld, ad, ev }
  function addRag(id, parts, joints, o = {}) {
    removeRag(id);
    const r = { slots: [], mass: 0, calm: 0, t: 0, maxT: o.maxT ?? 7, done: false };
    for (const pt of parts) {
      const b = addBody(pt.slot, KIND.PART, pt.p, pt.v, pt.shapes, { g: 'rag', den: pt.den ?? 1000, f: o.f ?? 0.85, e: 0.04, ld: o.ld ?? 0.1, ad: o.ad ?? 1.2, ev: pt.ev, iters: 2 });
      r.slots.push(pt.slot);
      r.mass += b.mass();
    }
    const fric = o.fric ?? 2;
    const linked = new Set();
    for (const j of joints) {
      const b1 = bodies[j.a], b2 = bodies[j.b];
      if (!b1 || !b2) continue;
      linked.add(j.a + ':' + j.b); linked.add(j.b + ':' + j.a);
      const a1 = { x: j.a1[0], y: j.a1[1], z: j.a1[2] }, a2 = { x: j.a2[0], y: j.a2[1], z: j.a2[2] };
      const jd = j.hinge ? R.JointData.revolute(a1, a2, { x: 1, y: 0, z: 0 }) : R.JointData.spherical(a1, a2);
      const jt = world.createImpulseJoint(jd, b1, b2, true);
      jt.setContactsEnabled(false);
      const raw = jt.rawSet, h = jt.handle;
      if (j.hinge) {
        jt.setLimits(j.hinge[0], j.hinge[1]);
        if (fric) jt.configureMotorVelocity(0, fric);
      } else {
        for (let ax = 0; ax < 3; ax++) {
          if (j.lim && j.lim[ax]) raw.jointSetLimits(h, R.JointAxis.AngX + ax, j.lim[ax][0], j.lim[ax][1]);
          if (fric) raw.jointConfigureMotorVelocity(h, R.JointAxis.AngX + ax, 0, fric);
        }
      }
    }
    // 不相鄰、但一開始就互相穿插的部位(例如巨屍粗大腿互貼):用不會拉緊的繩索關節關掉兩者的接觸,避免一開始就被彈開
    for (let i = 0; i < r.slots.length; i++) for (let k = i + 1; k < r.slots.length; k++) {
      const si = r.slots[i], sk = r.slots[k];
      if (linked.has(si + ':' + sk)) continue;
      const bi = bodies[si], bk = bodies[sk];
      let hit = false;
      for (let a = 0; a < bi.numColliders() && !hit; a++) for (let c = 0; c < bk.numColliders() && !hit; c++) {
        const sc = bi.collider(a).contactCollider(bk.collider(c), 0.01);
        if (sc && sc.distance < 0.006) hit = true;
      }
      if (hit) world.createImpulseJoint(R.JointData.rope(50, ZERO, ZERO), bi, bk, true).setContactsEnabled(false);
    }
    rags.set(id, r);
  }
  function removeRag(id) {
    const r = rags.get(id);
    if (!r) return;
    for (const s of r.slots) removeBody(s); // 關節會跟著剛體一起移除
    rags.delete(id);
  }

  // ---------- 衝量 ----------
  function impulse(slot, ix, iy, iz, px, py, pz) {
    const b = bodies[slot];
    if (!b) return;
    tv.x = ix; tv.y = iy; tv.z = iz;
    if (px === undefined) b.applyImpulse(tv, true);
    else { tw.x = px; tw.y = py; tw.z = pz; b.applyImpulseAtPoint(tv, tw, true); }
  }
  // 爆炸:範圍內所有動態物件依距離衰減取得速度變化(越重越難推:Δv ∝ √(8/(8+m)));布娃娃整具一起拋
  function blast(x, y, z, rad, dv, up = 0.6) {
    const r2 = rad * rad, inRag = new Set();
    for (const r of rags.values()) {
      const pel = bodies[r.slots[0]];
      if (!pel) continue;
      for (const s of r.slots) inRag.add(s);
      const t = pel.translation();
      const dx = t.x - x, dy = t.y - y, dz = t.z - z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2), f = 1 - d / rad;
      const k = dv * f * Math.sqrt(8 / (8 + r.mass)) * (d < 0.6 ? 0.35 : 1); // 爆心就在身上(膽腫者自爆):只往後倒,不被拋飛
      const hx = d > 0.05 ? dx / d : 0, hz = d > 0.05 ? dz / d : 0;
      for (const s of r.slots) {
        const b = bodies[s];
        if (!b) continue;
        const pt = b.translation();
        let ex = pt.x - x, ey = pt.y - y, ez = pt.z - z;
        const el = Math.hypot(ex, ey, ez) || 1;
        ex = hx * 0.7 + (ex / el) * 0.3; ey = up + (ey / el) * 0.3; ez = hz * 0.7 + (ez / el) * 0.3;
        const l = Math.hypot(ex, ey, ez) || 1, m = b.mass() * k / l;
        tv.x = ex * m; tv.y = ey * m; tv.z = ez * m;
        b.applyImpulse(tv, true);
        tv.x = (Math.random() - 0.5) * m * 0.06; tv.y = (Math.random() - 0.5) * m * 0.06; tv.z = (Math.random() - 0.5) * m * 0.06;
        b.applyTorqueImpulse(tv, true);
      }
    }
    for (const s of live) {
      if (inRag.has(s)) continue;
      const b = bodies[s];
      const t = b.translation();
      const dx = t.x - x, dy = t.y - y, dz = t.z - z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1e-3, f = 1 - d / rad;
      const m = b.mass(), k = dv * f * Math.sqrt(8 / (8 + m));
      let ex = dx / d, ey = dy / d + up, ez = dz / d;
      const l = Math.hypot(ex, ey, ez) || 1;
      tv.x = (ex / l) * k * m; tv.y = (ey / l) * k * m; tv.z = (ez / l) * k * m;
      b.applyImpulse(tv, true);
      const sp = k * m * 0.08 * Math.cbrt(Math.max(m, 0.05));
      tv.x = (Math.random() - 0.5) * sp; tv.y = (Math.random() - 0.5) * sp; tv.z = (Math.random() - 0.5) * sp;
      b.applyTorqueImpulse(tv, true);
    }
  }

  // ---------- 角色推擠 ----------
  // 角色(玩家/殭屍)不是剛體:每步以角色膠囊做形狀相交查詢,對重疊的輕道具施加「有上限」的推力
  // (人推得動椅子、紙箱,但推不動櫃子,也不會隔著椅子把櫃子硬推走);巨屍的上限很高,連重物也推得動
  const pushers = [], capCache = new Map(), ROT0 = { x: 0, y: 0, z: 0, w: 1 }, cpos = { x: 0, y: 0, z: 0 }, ipt = { x: 0, y: 0, z: 0 };
  const Q_CHAR = ig(BIT.CHAR, BIT.LIGHT), Q_BRUTE = ig(BIT.BRUTE, BIT.LIGHT | BIT.HEAVY);
  function setChars(arr) {
    pushers.length = 0;
    for (let i = 0; i + CHAR_STRIDE <= arr.length; i += CHAR_STRIDE) {
      const r = arr[i + 6], h = arr[i + 7], hh = Math.max(0.05, h / 2 - r);
      const key = Math.round(hh * 100) * 1000 + Math.round(r * 100);
      let shape = capCache.get(key);
      if (!shape) { shape = new R.Capsule(hh, r); capCache.set(key, shape); }
      pushers.push({ x: arr[i + 1], y: arr[i + 2] + h / 2, z: arr[i + 3], vx: arr[i + 4], vz: arr[i + 5], cap: arr[i + 8], heavy: arr[i + 9] > 0, shape });
      if (i === 0) { focus.x = arr[i + 1]; focus.y = arr[i + 2]; focus.z = arr[i + 3]; focus.ok = true; }
    }
  }
  let curPusher = null;
  function pushOne(col) {
    const c = curPusher, b = col.parent();
    if (!b || !b.isDynamic()) return true;
    const s = b.userData;
    if (s === undefined || s < 0) return true;
    cpos.x = c.x; cpos.y = c.y; cpos.z = c.z;
    const ct = col.contactShape(c.shape, cpos, ROT0, 0);
    const depth = ct ? Math.max(0, -ct.distance) : 0;
    const t = b.translation(tv);
    let nx = t.x - c.x, nz = t.z - c.z;
    const l = Math.hypot(nx, nz);
    if (l < 1e-3) { const sp = Math.hypot(c.vx, c.vz) || 1; nx = c.vx / sp; nz = c.vz / sp; } else { nx /= l; nz /= l; }
    const want = Math.max(0, c.vx * nx + c.vz * nz) * 1.05 + depth * 10;
    if (want < 0.02) return true;
    const lv = b.linvel(tw), dv = want - (lv.x * nx + lv.z * nz);
    if (dv <= 0) return true;
    const J = Math.min(b.mass() * dv, c.cap * H);
    if (ct) { ipt.x = ct.point1.x; ipt.y = ct.point1.y; ipt.z = ct.point1.z; } else { ipt.x = t.x; ipt.y = t.y; ipt.z = t.z; }
    tv.x = nx * J; tv.y = 0; tv.z = nz * J;
    b.applyImpulseAtPoint(tv, ipt, true);
    return true;
  }
  function pushChars() {
    for (const c of pushers) {
      curPusher = c;
      cpos.x = c.x; cpos.y = c.y; cpos.z = c.z;
      world.intersectionsWithShape(cpos, ROT0, c.shape, pushOne, undefined, c.heavy ? Q_BRUTE : Q_CHAR);
    }
  }

  // ---------- 步進 ----------
  function capture(s, b, force = false) {
    const o = s * 7;
    for (let i = 0; i < 7; i++) prev[o + i] = cur[o + i];
    const t = b.translation(tv), q = b.rotation(tq);
    cur[o] = t.x; cur[o + 1] = t.y; cur[o + 2] = t.z; cur[o + 3] = q.x; cur[o + 4] = q.y; cur[o + 5] = q.z; cur[o + 6] = q.w;
    if (force) for (let i = 0; i < 7; i++) prev[o + i] = cur[o + i]; // 新建/瞬移:沒有前一步
    touched[s] = steps;
    if (listed[s] !== frame) { listed[s] = frame; list.push(s); }
  }
  // 自訂快速休眠:道具/碎片慢到幾乎不動 0.4 秒就直接睡(Rapier 預設要整個島靜止 2 秒)
  const calm = new Float32Array(SLOTS), toSleep = [];
  function onActive(b) {
    const s = b.userData;
    if (s === undefined || s < 0 || bodies[s] !== b) return;
    active++;
    capture(s, b);
    const k = kind[s];
    if (k === KIND.PART) return;
    const v = b.linvel(tw);
    if (v.x * v.x + v.y * v.y + v.z * v.z < 0.003) {
      const w = b.angvel(tw);
      if (w.x * w.x + w.y * w.y + w.z * w.z < 0.02) { if ((calm[s] += H) > (k === KIND.CHIP ? 0.25 : 0.4)) toSleep.push(b); return; }
    }
    calm[s] = 0;
  }
  function onForce(e) {
    const f = e.totalForceMagnitude();
    const s1 = colSlot.get(e.collider1()), s2 = colSlot.get(e.collider2());
    if (s1 !== undefined && steps - lastHit[s1] > 10) { lastHit[s1] = steps; events.push(['hit', s1, f]); }
    if (s2 !== undefined && steps - lastHit[s2] > 10) { lastHit[s2] = steps; events.push(['hit', s2, f]); }
  }
  // 布娃娃靜止判定:前 1.5 秒很嚴格(避免靠牆半蹲就被凍結),之後逐步放寬;2 秒後加大阻尼收掉殘餘抖動
  function ragCheck() {
    for (const [id, r] of rags) {
      if (r.done) continue;
      r.t += H;
      if (!r.damped && r.t > 2) {
        r.damped = true;
        for (const s of r.slots) { const b = bodies[s]; if (b) { b.setLinearDamping(0.8); b.setAngularDamping(3.5); } }
      }
      const k = r.t < 1.5 ? 1 : r.t < 3 ? 3 : 8;
      let calm = true;
      for (const s of r.slots) {
        const b = bodies[s];
        if (!b || b.isSleeping()) continue;
        const v = b.linvel(tv);
        if (v.x * v.x + v.y * v.y + v.z * v.z > 0.005 * k) { calm = false; break; }
        const w = b.angvel(tw);
        if (w.x * w.x + w.y * w.y + w.z * w.z > 0.12 * k) { calm = false; break; }
      }
      r.calm = calm ? r.calm + H : 0;
      if (r.calm > 0.5 || r.t > r.maxT) { r.done = true; events.push(['settled', id, r.t]); }
    }
  }
  const far = [];
  function sleepFar() {
    if (!focus.ok) return;
    far.length = 0;
    world.forEachActiveRigidBody((b) => {
      const s = b.userData;
      if (s === undefined || s < 0 || kind[s] !== KIND.PROP) return;
      const t = b.translation(tv);
      const dx = t.x - focus.x, dy = (t.y - focus.y) * 2, dz = t.z - focus.z;
      if (dx * dx + dy * dy + dz * dz > FAR2) far.push(b);
    });
    for (const b of far) b.sleep();
  }
  function substep() {
    pushChars();
    world.step(queue);
    steps++;
    active = 0;
    world.forEachActiveRigidBody(onActive);
    for (const b of toSleep) { b.sleep(); calm[b.userData] = 0; }
    toSleep.length = 0;
    queue.drainContactForceEvents(onForce);
    ragCheck();
    if (steps % 30 === 0) sleepFar();
  }
  function step(dt) {
    const t0 = now();
    acc += Math.min(Math.max(dt, 0), 0.1);
    frameSteps = 0;
    while (acc >= H && frameSteps < MAX_SUB) { substep(); acc -= H; frameSteps++; }
    if (acc >= H) acc = H * 0.5; // 掉太多幀:捨棄多出來的時間,避免越追越慢
    alpha = acc / H;
    stepMs = now() - t0;
    return frameSteps;
  }

  // ---------- 輸出 ----------
  function output(out) {
    let o = HEAD, n = 0;
    for (const s of list) {
      if (o + STRIDE > out.length) break;
      const p = s * 7, still = touched[s] !== steps || !bodies[s];
      out[o] = s;
      for (let i = 0; i < 7; i++) { out[o + 1 + i] = still ? cur[p + i] : prev[p + i]; out[o + 8 + i] = cur[p + i]; }
      o += STRIDE; n++;
    }
    list.length = 0;
    frame++;
    out[0] = n; out[1] = alpha; out[2] = frameSteps; out[3] = stepMs; out[4] = active; out[5] = live.size;
    return o;
  }
  function takeEvents() {
    if (!events.length) return null;
    const e = events.slice();
    events.length = 0;
    return e;
  }

  // ---------- 命令 ----------
  function exec(cmds) {
    if (!cmds) return;
    for (const c of cmds) {
      switch (c[0]) {
        case 'static': addStatic(c[1], c[2], c[3], c[4]); break;
        case 'sbox': addStaticBox(c[1], c[2], c[3], c[4], c[5], c[6], c[7]); break;
        case 'sboxdel': removeStaticBox(c[1]); break;
        case 'body': addBody(c[1], c[2], c[3], c[4], c[5], c[6]); break;
        case 'del': removeBody(c[1]); break;
        case 'rag': addRag(c[1], c[2], c[3], c[4]); break;
        case 'ragdel': removeRag(c[1]); break;
        case 'imp': impulse(c[1], c[2], c[3], c[4], c[5], c[6], c[7]); break;
        case 'blast': blast(c[1], c[2], c[3], c[4], c[5], c[6]); break;
        case 'vel': { const b = bodies[c[1]]; if (b) { tv.x = c[2]; tv.y = c[3]; tv.z = c[4]; b.setLinvel(tv, true); tw.x = c[5] || 0; tw.y = c[6] || 0; tw.z = c[7] || 0; b.setAngvel(tw, true); } break; }
        case 'pose': { // 瞬移(重置道具):歸零速度,可選擇直接休眠
          const b = bodies[c[1]];
          if (!b) break;
          tv.x = c[2]; tv.y = c[3]; tv.z = c[4]; b.setTranslation(tv, true);
          tq.x = c[5]; tq.y = c[6]; tq.z = c[7]; tq.w = c[8]; b.setRotation(tq, true);
          b.setLinvel(ZERO, true); b.setAngvel(ZERO, true);
          capture(c[1], b, true);
          if (c[9]) b.sleep();
          break;
        }
        case 'wake': { const b = bodies[c[1]]; if (b) b.wakeUp(); break; }
        case 'chars': setChars(c[1]); break;
        case 'reset': for (const id of [...rags.keys()]) removeRag(id); for (const s of [...live]) removeBody(s); break;
      }
    }
  }

  return {
    world, exec, step, output, takeEvents, setChars,
    stats: () => ({ bodies: live.size, active, rags: rags.size, pushers: pushers.length, steps, stepMs }),
  };
}
