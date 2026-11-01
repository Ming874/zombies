import * as THREE from 'three';
import { sfx } from '../audio.js';
import { buildStatic, boxParams } from './static.js';
import { buildRagdoll, applyRagdoll, nearestPart } from './ragdoll.js';
import { rayBody, boundRadius } from './raycast.js';
import { createChipMesh, CHIP_KINDS } from './chips.js';
import { createCore, SLOTS, HEAD, STRIDE, OUT_LEN, SHAPE, SHAPE_LEN, KIND, shapeVolume } from './core.js';

// 真實物理(Rapier WASM):`createPhysics(game)` → game.physics。
//  - 非同步載入;預設在 module Web Worker 步進(crossOriginIsolated 時用 SharedArrayBuffer + Atomics 共享姿態,
//    否則 transferable ArrayBuffer),不支援時退回主執行緒;載入前或失敗時 ready=false,所有 API 都是安全的空操作。
//    網址參數 ?physics=worker|main|off 可強制模式。
//  - 固定 60Hz 步進(掉幀時子步),渲染時在前後兩步之間插值。
//  - 靜態碰撞依 levels.js 佈局(或舊 World 網格)+ world.boxes 建立;world.boxes 之後的增減會自動同步。
//  - 布娃娃:ragdoll(z, hit);可動道具:物件 userData.dynamic = { mass, shape:'box'|'cylinder'|'sphere', friction?, restitution? }
//    → collectDynamic(root)(就緒時與之後每 2 秒會自動掃描場景);子彈 shot()/hit()、爆炸 impulseAt()、碎片 addDebris()/chips()。
const MAX_RAGDOLLS = 8; // 同時模擬的布娃娃上限(超過就凍結最舊的)
const HEAVY = 25; // kg 以上的道具:角色推不動,改登記成 World 碰撞盒(擋玩家/殭屍/子彈),只有巨屍、爆炸、子彈推得動
const MAX_DEBRIS = 40, MAX_CHIPS = 120;
const CHAR_R = 24; // 只有玩家附近的殭屍會建立推擠膠囊
const COOLDOWN = 4; // 釋放的槽位幾幀後才重用(Worker 回傳有延遲,避免舊資料套到新物件)

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _box = new THREE.Box3(), _box2 = new THREE.Box3(), _v = new THREE.Vector3(), _n = new Float64Array(3);
const isIdentity = (m) => m.elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);

function urlMode() {
  try { return new URLSearchParams(location.search).get('physics'); } catch { return null; }
}

// ---------- 後端:主執行緒 ----------
function mainBackend() {
  let core = null;
  const out = new Float32Array(OUT_LEN);
  return {
    name: 'main', sab: false,
    get core() { return core; }, // 除錯用
    async init() {
      const R = (await import('@dimforge/rapier3d-compat')).default;
      await R.init();
      core = createCore(R);
      core.exec([['sbox', -1, 0, -1, 0, 5, 0.5, 5], ['body', 0, 1, [0, 1, 0, 0, 0, 0, 1], null, [0, 0.2, 0.2, 0.2, 0, 0, 0, 0, 0, 0, 1], { mass: 1 }]]);
      for (let i = 0; i < 20; i++) core.step(1 / 60); // 暖機
      core.exec([['reset'], ['sboxdel', -1]]);
      core.output(out);
      core.takeEvents();
    },
    begin() {},
    frame(dt, cmds) {
      core.exec(cmds);
      core.step(dt);
      core.output(out);
      return { out, events: core.takeEvents() };
    },
    release() {},
    dispose() { core = null; },
  };
}

// ---------- 後端:Web Worker ----------
// 啟動 Worker 並送出 init(Worker 腳本與 WASM 開始下載);載入前收到的訊息先暫存,由 workerBackend 接手。
// 不設逾時:慢速網路下載中不算失敗,只有真的出錯(載入失敗、init 例外)才退回主執行緒。
export const physicsLoad = { state: 'idle', t0: 0, tScript: 0, tReady: 0, error: null }; // 給載入進度顯示
function spawnWorker() {
  const sab = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
  const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const box = { w, sab, buf: null, msgs: [], err: null, listener: null, onErr: null };
  const fail = (err) => { if (!box.err) { box.err = err; physicsLoad.error = err.message; box.onErr?.(err); } };
  w.onmessage = (e) => {
    if (e.data?.t === 'boot') { physicsLoad.state = 'wasm'; physicsLoad.tScript = e.data.at - performance.timeOrigin; return; }
    if (box.listener) box.listener(e); else box.msgs.push(e);
  };
  w.onerror = (e) => { e?.preventDefault?.(); fail(new Error(e?.message || 'physics worker 載入失敗')); };
  w.onmessageerror = () => fail(new Error('physics worker messageerror'));
  if (sab) box.buf = new SharedArrayBuffer(16 + OUT_LEN * 4 * 2);
  w.postMessage({ t: 'init', sab: box.buf });
  physicsLoad.state = 'script';
  physicsLoad.t0 = performance.now();
  return box;
}
let early = null;
// main.js 在建世界(數秒的同步工作)之前呼叫:物理檔案先下載,不跟貼圖/模型搶頻寬
export function startPhysicsWorker() {
  const mode = urlMode();
  if (early || mode === 'off' || mode === 'main' || typeof Worker === 'undefined') return;
  try { early = spawnWorker(); } catch (e) { early = null; console.warn('[physics] 無法建立 Worker', e?.message || e); }
}
function workerBackend() {
  const sab = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
  let w = null, busy = false, latest = null, spare = null, carryDt = 0, carry = [], lastSeq = 0, ctl = null, bufs = null;
  const events = [];
  const be = {
    name: 'worker', sab, initMs: 0,
    init() {
      return new Promise((resolve, reject) => {
        const box = early || spawnWorker();
        early = null;
        w = box.w;
        if (box.buf) {
          ctl = new Int32Array(box.buf, 0, 4);
          bufs = [new Float32Array(box.buf, 16, OUT_LEN), new Float32Array(box.buf, 16 + OUT_LEN * 4, OUT_LEN)];
        }
        const onMsg = (e) => {
          const m = e.data;
          if (m.t === 'ready') { be.initMs = m.ms; physicsLoad.tInit = m.tInit - performance.timeOrigin; physicsLoad.tWasm = m.tReady - performance.timeOrigin; resolve(); }
          else if (m.t === 'error') { console.warn('[physics worker]', m.message); reject(new Error(m.message)); }
          else if (m.t === 'out') {
            if (!sab) busy = false; // SAB 模式以序號判斷完成(訊息可能比共享記憶體晚到)
            if (m.events) for (const ev of m.events) events.push(ev);
            if (m.buf) latest = new Float32Array(m.buf);
          }
        };
        box.onErr = reject;
        if (box.err) { reject(box.err); return; }
        box.listener = onMsg;
        for (const e of box.msgs.splice(0)) onMsg(e);
      });
    },
    // 送出命令與 dt;Worker 還在忙就累積到下一幀(不會堆積訊息)
    begin(dt, cmds) {
      if (busy) { carryDt = Math.min(0.1, carryDt + dt); for (const c of cmds) carry.push(c); return; }
      const all = carry.length ? carry.concat(cmds) : cmds;
      carry = [];
      const msg = { t: 'frame', dt: dt + carryDt, cmds: all };
      carryDt = 0;
      const tr = [];
      if (!sab && spare) { msg.buf = spare.buffer; tr.push(spare.buffer); spare = null; }
      w.postMessage(msg, tr);
      busy = true;
    },
    frame() {
      let out = null;
      if (sab) {
        const s = Atomics.load(ctl, 0);
        if (s !== lastSeq) { lastSeq = s; out = bufs[s & 1]; busy = false; }
      } else if (latest) { out = latest; latest = null; }
      const ev = events.length ? events.splice(0) : null;
      return out || ev ? { out, events: ev } : null;
    },
    release(out) { if (!sab && out) spare = out; },
    dispose() { if (w) w.terminate(); w = null; },
  };
  return be;
}

export function createPhysics(game, opts = {}) {
  let backend = null, frameNo = 0, begun = false, alpha = 0, markGen = 0, nextRag = 1, nextBox = 1, scanT = 0;
  const cmds = [];
  const recs = new Array(SLOTS).fill(null);
  const free = [], cool = [];
  for (let i = SLOTS - 1; i >= 0; i--) free.push(i);
  const P0 = new Float32Array(SLOTS * 7), P1 = new Float32Array(SLOTS * 7), VIS = new Float32Array(SLOTS * 7);
  const seenMark = new Int32Array(SLOTS);
  let moving = [];
  const rags = []; // 模擬中的布娃娃
  const props = [], debris = [], chips = [];
  const registered = new WeakSet();
  const pendingRoots = new Set();
  const sboxIds = new Map(), ownBoxes = new Set();
  const charIds = new WeakMap();
  let nextChar = 1, chipMesh = null, staticDesc = null, debugObj = null, lastThud = 0, thudN = 0;
  const parentInv = new Map();
  const stats = { mode: 'off', sab: false, ready: false, bodies: 0, active: 0, stepMs: 0, mainMs: 0, ragdolls: 0, props: 0, debris: 0, chips: 0, statics: 0, initMs: 0 };

  const alloc = () => free.pop() ?? -1;
  const release = (s) => { if (s >= 0) { recs[s] = null; cool.push([s, frameNo + COOLDOWN]); } };
  const setPose = (s, x, y, z, qx, qy, qz, qw) => {
    const o = s * 7;
    P0[o] = P1[o] = VIS[o] = x; P0[o + 1] = P1[o + 1] = VIS[o + 1] = y; P0[o + 2] = P1[o + 2] = VIS[o + 2] = z;
    P0[o + 3] = P1[o + 3] = VIS[o + 3] = qx; P0[o + 4] = P1[o + 4] = VIS[o + 4] = qy; P0[o + 5] = P1[o + 5] = VIS[o + 5] = qz; P0[o + 6] = P1[o + 6] = VIS[o + 6] = qw;
  };

  const P = {
    ready: false, failed: false, mode: 'off', stats,
    begin, update, ragdoll, collectDynamic, raycast, hit, shot, impulseAt, addDebris, chips: spawnChips, reset, debug, freezeAll,
    get ragdolls() { return rags; },
    poseOf: (slot) => Array.from(VIS.subarray(slot * 7, slot * 7 + 7)), // 除錯:槽位目前的(插值後)姿態
    get _backend() { return backend; }, // 除錯用
  };

  // ======================= 初始化 =======================
  async function init() {
    const want = urlMode() || opts.mode || 'worker';
    if (want === 'off') { P.mode = stats.mode = 'off'; physicsLoad.state = 'off'; return; }
    if (want === 'main' || typeof Worker === 'undefined') physicsLoad.state = 'main';
    const t0 = performance.now();
    let be = want === 'main' || typeof Worker === 'undefined' ? mainBackend() : workerBackend();
    try { await be.init(); } catch (e) {
      if (be.name !== 'worker') throw e;
      console.warn('[physics] worker 無法啟動,改用主執行緒:', e.message);
      be.dispose();
      be = mainBackend();
      physicsLoad.state = 'main';
      await be.init();
    }
    backend = be;
    physicsLoad.state = 'ready';
    physicsLoad.tReady = performance.now();
    P.mode = stats.mode = be.name + (be.sab ? '+sab' : '');
    stats.sab = be.sab;
    stats.initMs = Math.round(performance.now() - t0);
    rebuildStatic(opts.layout);
    chipMesh = createChipMesh(game.scene, MAX_CHIPS);
    P.ready = stats.ready = true;
    collectDynamic(game.scene);
    for (const r of pendingRoots) collectDynamic(r);
    pendingRoots.clear();
    syncBoxes();
  }

  // 靜態場景(依佈局);測試時可傳入 parseLayout() 的結果在舊地圖上驗證新地圖
  function rebuildStatic(layout) {
    staticDesc = buildStatic(game.world, layout);
    stats.statics = staticDesc.boxes.length / 10 + staticDesc.hulls.length;
    cmds.push(['static', staticDesc.boxes, staticDesc.hulls, 0.8, true]);
    if (debugObj) { debug(false); debug(true); }
  }
  P.rebuildStatic = (layout) => { if (backend) rebuildStatic(layout); };

  // world.boxes(道具碰撞盒)→ 靜態方塊;之後新增/移除的也會同步(商店、路障…)
  function syncBoxes() {
    const list = game.world?.boxes || [];
    const seen = new Set();
    for (const b of list) {
      if (ownBoxes.has(b) || b.moveOnly) continue; // 只擋移動的隱形牆:屍體、碎片不撞
      seen.add(b);
      if (!sboxIds.has(b)) { const id = nextBox++; sboxIds.set(b, id); cmds.push(['sbox', id, ...boxParams(b)]); }
    }
    for (const [b, id] of sboxIds) if (!seen.has(b)) { sboxIds.delete(b); cmds.push(['sboxdel', id]); }
  }

  // ======================= 可動道具 =======================
  // 物件在自身座標系的包圍盒(含子物件)
  function localBounds(o) {
    _m.copy(o.matrixWorld).invert();
    _box.makeEmpty();
    o.traverse((m) => {
      if (!m.geometry || m.isInstancedMesh && m !== o) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      _box2.copy(m.geometry.boundingBox).applyMatrix4(_m2.multiplyMatrices(_m, m.matrixWorld));
      _box.union(_box2);
    });
    return _box;
  }
  // 包圍盒 → 碰撞形狀(剛體原點 = 物件原點)
  function shapesFor(d, bb, sx, sy, sz) {
    if (Array.isArray(d.colliders) && d.colliders.length) { // 自訂複合形狀:[{ shape, size:[x,y,z] 全長, at:[x,y,z] }]
      const out = [];
      for (const c of d.colliders) {
        const [w, h, l] = c.size || [0.2, 0.2, 0.2], [ax, ay, az] = c.at || [0, 0, 0];
        const t = c.shape === 'sphere' ? SHAPE.BALL : c.shape === 'cylinder' ? SHAPE.CYLINDER : SHAPE.BOX;
        out.push(t, ...(t === SHAPE.BOX ? [w * sx / 2, h * sy / 2, l * sz / 2] : t === SHAPE.BALL ? [Math.max(w * sx, h * sy, l * sz) / 2, 0, 0] : [h * sy / 2, Math.max(w * sx, l * sz) / 2, 0]), ax * sx, ay * sy, az * sz, 0, 0, 0, 1);
      }
      return out;
    }
    const cx = (bb.min.x + bb.max.x) / 2 * sx, cy = (bb.min.y + bb.max.y) / 2 * sy, cz = (bb.min.z + bb.max.z) / 2 * sz;
    const hx = Math.max(0.01, (bb.max.x - bb.min.x) / 2 * sx), hy = Math.max(0.01, (bb.max.y - bb.min.y) / 2 * sy), hz = Math.max(0.01, (bb.max.z - bb.min.z) / 2 * sz);
    if (d.shape === 'sphere' || d.shape === 'ball') return [SHAPE.BALL, Math.max(hx, hy, hz), 0, 0, cx, cy, cz, 0, 0, 0, 1];
    if (d.shape === 'cylinder') return [SHAPE.CYLINDER, hy, Math.max(hx, hz), 0, cx, cy, cz, 0, 0, 0, 1];
    if (d.shape === 'capsule') return [SHAPE.CAPSULE, Math.max(0.01, hy - Math.max(hx, hz)), Math.max(hx, hz), 0, cx, cy, cz, 0, 0, 0, 1];
    return [SHAPE.BOX, hx, hy, hz, cx, cy, cz, 0, 0, 0, 1];
  }
  function bodyOpts(d, mass, heavy) {
    return { mass, g: heavy ? 'heavy' : 'light', f: d.friction ?? 0.6, e: d.restitution ?? 0.12, ld: d.linearDamping ?? 0.06, ad: d.angularDamping ?? 0.3, sleep: d.sleep !== false, ccd: !!d.ccd, ev: mass * 9.81 * 3 };
  }

  function addProp(o) {
    const d = o.userData.dynamic;
    o.updateMatrixWorld(true);
    const bb = localBounds(o);
    if (bb.isEmpty()) return 0;
    o.matrixWorld.decompose(_p, _q, _s);
    const shapes = shapesFor(d, bb, _s.x, _s.y, _s.z);
    const mass = Math.max(0.05, d.mass ?? 5), heavy = mass >= HEAVY;
    const s = alloc();
    if (s < 0) return 0;
    const rec = { kind: KIND.PROP, obj: o, shapes, r: boundRadius(shapes), mass, heavy, init: [_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w], ws: _s.clone(), pid: !o.parent || isIdentity(o.parent.matrixWorld), box: null, boxDirty: heavy, slot: s, hitT: -9 };
    recs[s] = rec;
    setPose(s, ...rec.init);
    cmds.push(['body', s, KIND.PROP, rec.init, null, shapes, bodyOpts(d, mass, heavy)]);
    props.push(rec);
    registered.add(o);
    // 道具代理若已用 collide:true 登記了 World 碰撞盒:重物接手管理(跟著移動),輕物移除(改由推擠膠囊處理)
    _box.setFromObject(o);
    const wb = game.world?.boxes;
    if (wb) for (const b of wb) {
      if (ownBoxes.has(b) || Math.abs((b.minX + b.maxX) / 2 - (_box.min.x + _box.max.x) / 2) > 0.12 || Math.abs((b.minZ + b.maxZ) / 2 - (_box.min.z + _box.max.z) / 2) > 0.12) continue;
      if (Math.abs((b.maxX - b.minX) - (_box.max.x - _box.min.x)) > 0.3 || Math.abs((b.maxZ - b.minZ) - (_box.max.z - _box.min.z)) > 0.3) continue;
      if (heavy) { rec.box = b; ownBoxes.add(b); } else game.world.removeBox(b);
      const id = sboxIds.get(b);
      if (id) { sboxIds.delete(b); cmds.push(['sboxdel', id]); }
      break;
    }
    return 1;
  }
  // InstancedMesh 的每個實例各是一個剛體(重複的小物件:藥瓶、罐頭、紙箱…)
  function addInstanced(mesh) {
    const d = mesh.userData.dynamic;
    mesh.updateMatrixWorld(true);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    const minv = mesh.matrixWorld.clone().invert();
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let n = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _m.premultiply(mesh.matrixWorld).decompose(_p, _q, _s);
      if (_s.x < 1e-4) continue;
      const shapes = shapesFor(d, bb, _s.x, _s.y, _s.z);
      const mass = Math.max(0.05, d.mass ?? 1), heavy = mass >= HEAVY;
      const s = alloc();
      if (s < 0) break;
      const rec = { kind: KIND.PROP, inst: { mesh, i, minv }, obj: mesh, shapes, r: boundRadius(shapes), mass, heavy: false, init: [_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w], ws: _s.clone(), slot: s, hitT: -9 };
      recs[s] = rec;
      setPose(s, ...rec.init);
      cmds.push(['body', s, KIND.PROP, rec.init, null, shapes, bodyOpts(d, mass, heavy)]);
      props.push(rec);
      n++;
    }
    registered.add(mesh);
    return n;
  }
  function collectDynamic(root = game.scene) {
    if (!root) return 0;
    if (!P.ready) { pendingRoots.add(root); return 0; }
    let n = 0;
    const visit = (o) => {
      if (o.userData?.dynamic && !registered.has(o)) { n += o.isInstancedMesh ? addInstanced(o) : addProp(o); return; }
      if (registered.has(o)) return;
      for (const c of o.children) visit(c);
    };
    visit(root);
    stats.props = props.length;
    return n;
  }
  // 物件已從場景移除(例如商店拆掉):剛體也拿掉
  function dropDetached() {
    for (let i = props.length - 1; i >= 0; i--) {
      const r = props[i];
      let o = r.obj;
      while (o.parent) o = o.parent;
      if (o === game.scene) continue;
      cmds.push(['del', r.slot]);
      if (r.box) { game.world.removeBox(r.box); ownBoxes.delete(r.box); }
      release(r.slot);
      props.splice(i, 1);
      registered.delete(r.obj);
    }
    stats.props = props.length;
  }

  // 重物的 World 碰撞盒跟著剛體移動(依目前姿態算 AABB)
  function updateBox(rec) {
    rec.boxDirty = false;
    const o = rec.slot * 7, sh = rec.shapes;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    _q.set(VIS[o + 3], VIS[o + 4], VIS[o + 5], VIS[o + 6]);
    for (let i = 0; i + SHAPE_LEN <= sh.length; i += SHAPE_LEN) {
      const t = sh[i];
      const hx = t === SHAPE.BOX ? sh[i + 1] : t === SHAPE.BALL ? sh[i + 1] : sh[i + 2];
      const hy = t === SHAPE.BOX ? sh[i + 2] : t === SHAPE.BALL ? sh[i + 1] : sh[i + 1] + (t === SHAPE.CAPSULE ? sh[i + 2] : 0);
      const hz = t === SHAPE.BOX ? sh[i + 3] : t === SHAPE.BALL ? sh[i + 1] : sh[i + 2];
      for (let k = 0; k < 8; k++) {
        _v.set(sh[i + 4] + (k & 1 ? hx : -hx), sh[i + 5] + (k & 2 ? hy : -hy), sh[i + 6] + (k & 4 ? hz : -hz)).applyQuaternion(_q);
        const x = VIS[o] + _v.x, y = VIS[o + 1] + _v.y, z = VIS[o + 2] + _v.z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    }
    const b = rec.box, sh2 = 0.05;
    if (b && Math.abs(b.minX - (x0 + sh2)) < 0.03 && Math.abs(b.maxX - (x1 - sh2)) < 0.03 && Math.abs(b.minZ - (z0 + sh2)) < 0.03 && Math.abs(b.maxZ - (z1 - sh2)) < 0.03 && Math.abs((b.y0 ?? 0) - y0) < 0.05) return;
    if (b) { game.world.removeBox(b); ownBoxes.delete(b); }
    rec.box = game.world.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.max(0.05, x1 - x0 - sh2 * 2), Math.max(0.05, z1 - z0 - sh2 * 2), y1 - y0, y0);
    ownBoxes.add(rec.box);
  }

  // ======================= 布娃娃 =======================
  // hit:{ point, dir, force }(子彈)| { blast:{x,y,z}, radius, strength }(爆炸)| {x,y,z}(直接給衝量)| null(只有慣性)
  function ragdoll(z, hit = null) {
    if (!P.ready || !z || !z.root) return false;
    if (z.rag) return true;
    // 膽腫者:先跑 zombie.js 的膨脹動畫,爆開時 combat.explode 會再呼叫一次
    if (z.type === 'bloater' && z.deathKind === 'burst' && !z.exploded) return true;
    while (rags.length >= MAX_RAGDOLLS) freeze(rags[0]);
    const spec = buildRagdoll(z, alloc);
    if (!spec) return false;
    if (spec.rec.slots.some((s) => s < 0)) { for (const s of spec.rec.slots) if (s >= 0) release(s); return false; }
    const id = nextRag++;
    const rag = { id, z, rec: spec.rec, slots: spec.rec.slots, t: 0, landed: 0, frozen: false, blast: null, mass: 0 };
    for (const p of spec.rec.parts) {
      let vol = 0;
      for (let i = 0; i + SHAPE_LEN <= p.shapes.length; i += SHAPE_LEN) vol += shapeVolume(p.shapes, i);
      const m = vol * spec.rec.type.den;
      rag.mass += m;
      recs[p.slot] = { kind: KIND.PART, rag, part: p, shapes: p.shapes, r: boundRadius(p.shapes), mass: m, slot: p.slot };
      setPose(p.slot, p.pos.x, p.pos.y, p.pos.z, p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    }
    for (const pt of spec.parts) if (pt.ev) pt.ev = recs[pt.slot].mass * 9.81 * 4;
    cmds.push(['rag', id, spec.parts, spec.joints, spec.opts]);
    // 站著死的:膝蓋往前一軟、骨盆往下沉(像斷了線的木偶),而不是直挺挺地倒
    const map = spec.rec.map;
    if (z.type !== 'crawler' && map.hips) {
      const fx = Math.sin(z.heading || 0), fz = Math.cos(z.heading || 0), hm = recs[map.hips.slot].mass;
      cmds.push(['imp', map.hips.slot, (Math.random() - 0.5) * hm * 0.4, -hm * 0.9, (Math.random() - 0.5) * hm * 0.4]);
      for (const n of ['shinL', 'shinR']) if (map[n]) { const m = recs[map[n].slot].mass, k = 0.9 + Math.random() * 0.8; cmds.push(['imp', map[n].slot, fx * m * k, 0, fz * m * k, map[n].pos.x, map[n].pos.y, map[n].pos.z]); }
    }
    if (hit?.blast) rag.blast = [hit.blast.x, hit.blast.y, hit.blast.z, (hit.radius || 4) * 1.4, hit.strength ?? 8];
    else if (hit?.point && hit.dir) {
      // 子彈衝量:比真實(手槍約 3 N·s)誇張一點但不至於把人打飛;巴雷特約 30 N·s
      const pt = nearestPart(spec.rec, VIS, hit.point.x, hit.point.y, hit.point.z);
      const J = Math.min(30, Math.max(3, (hit.force ?? 30) * 0.35));
      cmds.push(['imp', pt.slot, hit.dir.x * J, hit.dir.y * J, hit.dir.z * J, hit.point.x, hit.point.y, hit.point.z]);
    } else if (hit && Number.isFinite(hit.x)) {
      const pt = spec.rec.map.chest || spec.rec.parts[0];
      cmds.push(['imp', pt.slot, hit.x, hit.y, hit.z]);
    }
    rags.push(rag);
    z.rag = rag;
    stats.ragdolls = rags.length;
    return true;
  }
  // 凍結:套用最後姿態、移除剛體(骨骼停在原地,之後由 zombie.js 處理下沉/移除)
  function freeze(rag) {
    const i = rags.indexOf(rag);
    if (i >= 0) rags.splice(i, 1);
    if (rag.frozen) return;
    for (const s of rag.slots) { const o = s * 7; for (let k = 0; k < 7; k++) VIS[o + k] = P1[o + k]; }
    if (rag.z.root?.parent) applyRagdoll(rag.rec, VIS);
    cmds.push(['ragdel', rag.id]);
    for (const s of rag.slots) release(s);
    rag.frozen = true;
    stats.ragdolls = rags.length;
  }
  function freezeAll() { for (const r of rags.slice()) freeze(r); }

  // ======================= 子彈 / 爆炸 =======================
  // 射線打動態物件(道具、屍體、碎片);回傳最近的命中 { dist, point, normal, kind, rec, obj, zombie }
  const _hitP = new THREE.Vector3(), _hitN = new THREE.Vector3();
  function raycast(origin, dir, maxDist = 90, filter = null) {
    if (!P.ready) return null;
    let best = maxDist, br = null, nx = 0, ny = 1, nz = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    for (let s = 0; s < SLOTS; s++) {
      const r = recs[s];
      if (!r || !r.shapes || r.kind === KIND.CHIP || (filter && !filter(r))) continue;
      const o = s * 7;
      // 包圍球快速排除
      const px = VIS[o] - ox, py = VIS[o + 1] - oy, pz = VIS[o + 2] - oz;
      const tc = px * dx + py * dy + pz * dz;
      if (tc < -r.r || tc - r.r > best) continue;
      const d2 = px * px + py * py + pz * pz - tc * tc;
      if (d2 > r.r * r.r) continue;
      const t = rayBody(ox, oy, oz, dx, dy, dz, best, VIS, o, r.shapes, _n);
      if (t < best) { best = t; br = r; nx = _n[0]; ny = _n[1]; nz = _n[2]; }
    }
    if (!br) return null;
    return {
      dist: best, point: _hitP.set(ox + dx * best, oy + dy * best, oz + dz * best).clone(), normal: _hitN.set(nx, ny, nz).clone(),
      kind: br.kind === KIND.PART ? 'ragdoll' : br.kind === KIND.DEBRIS ? 'debris' : 'prop', rec: br, obj: br.obj || null, zombie: br.rag?.z || null,
    };
  }
  function push(rec, point, dir, J) {
    cmds.push(['imp', rec.slot, dir.x * J, dir.y * J, dir.z * J, point.x, point.y, point.z]);
  }
  // hit(point, dir, force):打在 point 附近的動態物件給衝量(force ≈ N·s);回傳被打到的紀錄或 null
  function hit(point, dir, force = 4) {
    if (!P.ready) return null;
    const o = { x: point.x - dir.x * 0.3, y: point.y - dir.y * 0.3, z: point.z - dir.z * 0.3 };
    const h = raycast(o, dir, 0.7);
    if (!h) return null;
    push(h.rec, h.point, dir, force);
    return h.rec;
  }
  // 子彈:沿彈道找第一個動態物件,給衝量 + 粒子;子彈不會被輕道具擋下(重道具本來就在 World 碰撞盒裡)
  function shot(origin, dir, maxDist, damage = 25) {
    const h = raycast(origin, dir, (maxDist ?? 90) + 0.25);
    if (!h) return null;
    const n = h.normal;
    if (h.kind === 'ragdoll') {
      push(h.rec, h.point, dir, Math.min(70, Math.max(4, damage * 0.9)));
      game.burst?.(h.point, n, 'blood', 6, h.point.y - 1);
    } else {
      push(h.rec, h.point, dir, Math.min(45, Math.max(0.5, damage * 0.22)));
      game.burst?.(h.point, n, 'spark', 3, h.point.y - 1);
      game.burst?.(h.point, n, 'dust', 3, h.point.y - 1);
    }
    return h;
  }
  // 爆炸:範圍內的道具、碎片、布娃娃都被推開(strength ≈ 爆心附近輕物的速度變化 m/s)
  let blastsThisFrame = [];
  function impulseAt(pos, radius = 4, strength = 8) {
    if (!P.ready) return;
    cmds.push(['blast', pos.x, pos.y, pos.z, radius, strength, 0.4]);
    blastsThisFrame.push([pos.x, pos.y, pos.z]);
  }

  // ======================= 碎片 =======================
  // addDebris(mesh, { vel, spin, mass, shape, life, friction, restitution, onExpire, dispose }):
  // 短暫存在的物理碎片(斷肢、炸飛的零件、碎木板…);life 秒後縮小消失
  function addDebris(mesh, o = {}) {
    if (!P.ready || !mesh) return null;
    if (!mesh.parent) game.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const bb = localBounds(mesh);
    if (bb.isEmpty()) return null;
    mesh.matrixWorld.decompose(_p, _q, _s);
    const shapes = shapesFor({ shape: o.shape || 'box' }, bb, _s.x, _s.y, _s.z);
    let vol = 0;
    for (let i = 0; i + SHAPE_LEN <= shapes.length; i += SHAPE_LEN) vol += shapeVolume(shapes, i);
    const mass = o.mass ?? Math.max(0.05, vol * (o.density ?? 700));
    const s = alloc();
    if (s < 0) return null;
    const v = o.vel || o.velocity || { x: 0, y: 0, z: 0 }, w = o.spin || { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 };
    const rec = { kind: KIND.DEBRIS, obj: mesh, shapes, r: boundRadius(shapes), mass, slot: s, life: o.life ?? 6, t: 0, ws: _s.clone(), pid: !mesh.parent || isIdentity(mesh.parent.matrixWorld), onExpire: o.onExpire, dispose: o.dispose, hitT: -9, sound: o.sound !== false };
    recs[s] = rec;
    setPose(s, _p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w);
    cmds.push(['body', s, KIND.DEBRIS, [_p.x, _p.y, _p.z, _q.x, _q.y, _q.z, _q.w], [v.x, v.y, v.z, w.x, w.y, w.z], shapes, { mass, g: 'debris', f: o.friction ?? 0.7, e: o.restitution ?? 0.25, ld: 0.08, ad: 0.5, ccd: !!o.ccd, ev: rec.sound ? mass * 9.81 * 4 : 0 }]);
    debris.push(rec);
    while (debris.length > MAX_DEBRIS) expire(debris[0], true);
    stats.debris = debris.length;
    rec.remove = () => expire(rec, true);
    return rec;
  }
  function expire(rec, now = false) {
    const i = debris.indexOf(rec);
    if (i >= 0) debris.splice(i, 1);
    if (rec.gone) return;
    rec.gone = true;
    cmds.push(['del', rec.slot]);
    release(rec.slot);
    const m = rec.obj;
    const done = () => {
      m.parent?.remove(m);
      if (rec.dispose) m.traverse((c) => { c.geometry?.dispose?.(); if (rec.dispose === 'all') (Array.isArray(c.material) ? c.material : [c.material]).forEach((x) => x?.dispose?.()); });
      rec.onExpire?.(m);
    };
    if (now) done(); else rec.fadeOut = done;
    stats.debris = debris.length;
  }

  // chips(pos, normal, n, kind):子彈濺出的小碎屑(混凝土/灰泥/磁磚/木/玻璃/金屬/肉),有物理會彈跳
  function spawnChips(pos, normal, n = 5, kind = 'concrete') {
    if (!P.ready || !chipMesh) return;
    const pal = CHIP_KINDS[kind] || CHIP_KINDS.concrete;
    const nx = normal?.x ?? 0, ny = normal?.y ?? 1, nz = normal?.z ?? 0;
    for (let k = 0; k < n; k++) {
      while (chips.length >= MAX_CHIPS) killChip(chips[0]);
      const s = alloc();
      if (s < 0) return;
      const used = new Set(chips.map((c) => c.i));
      let i = 0;
      while (used.has(i)) i++;
      const sz = 0.012 + Math.random() * (kind === 'glass' ? 0.03 : 0.022);
      const sx = sz * (0.7 + Math.random() * 0.8), sy = sz * (0.5 + Math.random() * 0.6), sw = sz * (0.7 + Math.random() * 0.8);
      const sp = 1.6 + Math.random() * 2.6;
      const v = [nx * sp + (Math.random() - 0.5) * 2.2, ny * sp + Math.random() * 1.6 + 0.4, nz * sp + (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30];
      const px = pos.x + nx * 0.03, py = pos.y + ny * 0.03, pz = pos.z + nz * 0.03;
      const rec = { kind: KIND.CHIP, slot: s, i, sx, sy, sz: sw, life: 2.2 + Math.random() * 2, t: 0 };
      recs[s] = rec;
      setPose(s, px, py, pz, 0, 0, 0, 1);
      cmds.push(['body', s, KIND.CHIP, [px, py, pz, 0, 0, 0, 1], v, [SHAPE.BOX, sx / 2, sy / 2, sw / 2, 0, 0, 0, 0, 0, 0, 1], { den: kind === 'wood' ? 700 : kind === 'flesh' ? 1050 : 2300, g: 'chip', f: 0.8, e: kind === 'glass' || kind === 'tile' ? 0.35 : 0.2, ld: 0.2, ad: 1.5 }]);
      chipMesh.color(i, pal[Math.random() < 0.5 ? 0 : 1]);
      chipMesh.set(i, VIS, s * 7, sx, sy, sw);
      chips.push(rec);
    }
    stats.chips = chips.length;
  }
  function killChip(c) {
    const i = chips.indexOf(c);
    if (i >= 0) chips.splice(i, 1);
    cmds.push(['del', c.slot]);
    release(c.slot);
    chipMesh.hide(c.i);
  }

  // ======================= 重置 =======================
  function reset() {
    if (!P.ready) return;
    for (const r of rags.slice()) freeze(r);
    for (const d of debris.slice()) expire(d, true);
    for (const c of chips.slice()) killChip(c);
    for (const r of props) {
      cmds.push(['pose', r.slot, ...r.init, 1]);
      setPose(r.slot, ...r.init);
      applyRec(r, r.slot * 7);
      if (r.heavy) r.boxDirty = true;
    }
    moving = [];
  }

  // ======================= 每幀 =======================
  function charData() {
    const a = [];
    const add = (o, x, y, z, vx, vz, r, h, m, brute) => {
      let id = charIds.get(o);
      if (!id) { id = nextChar++; charIds.set(o, id); }
      a.push(id, x, y, z, vx, vz, r, h, m, brute);
    };
    const pl = game.players || [game.player];
    // 推力上限(N):人約 450N(推得動椅子紙箱、推不動櫃子);巨屍 4000N(衝鋒時連病床都撞得飛)
    for (const p of pl) if (p && p.pos && p.alive !== false) add(p, p.pos.x, p.pos.y, p.pos.z, p.vx || 0, p.vz || 0, 0.33, 1.8, 450, 0);
    const lp = game.player?.pos;
    if (lp) for (const z of game.zombies || []) {
      if (!z.alive || Math.abs(z.pos.x - lp.x) + Math.abs(z.pos.z - lp.z) > CHAR_R) continue;
      const brute = z.type === 'brute';
      add(z, z.pos.x, z.pos.y, z.pos.z, z.vel?.x || 0, z.vel?.z || 0, (z.T?.radius ?? 0.34) * 0.9, z.type === 'crawler' ? 0.55 : (z.headH ?? 1.6) + 0.12, brute ? 4000 : 380 * (z.T?.mass ?? 1), brute ? 1 : 0);
    }
    return new Float32Array(a);
  }
  function flush() {
    // 布娃娃自己的爆炸衝量:同一批命令裡已有同位置的全域爆炸就略過(避免推兩次)
    for (const r of rags) {
      if (!r.blast) continue;
      const b = r.blast;
      r.blast = null;
      if (blastsThisFrame.some((q) => Math.abs(q[0] - b[0]) + Math.abs(q[1] - b[1]) + Math.abs(q[2] - b[2]) < 0.6)) continue;
      cmds.push(['blast', b[0], b[1], b[2], b[3], b[4], 0.7]);
    }
    blastsThisFrame = [];
    cmds.push(['chars', charData()]);
    const out = cmds.slice();
    cmds.length = 0;
    if (P._rec) P._rec.push(out); // 除錯:錄下命令串流(在 Node 重播量測)
    return out;
  }

  // 主迴圈開頭呼叫(Worker 模式:先送出命令讓 Worker 與遊戲邏輯平行步進)
  function begin(dt) {
    if (!P.ready || !backend || backend.name === 'main') return;
    const t0 = performance.now();
    backend.begin(dt, flush());
    begun = true;
    stats.beginMs = performance.now() - t0;
  }

  function lerpPose(s, a) {
    const o = s * 7;
    VIS[o] = P0[o] + (P1[o] - P0[o]) * a;
    VIS[o + 1] = P0[o + 1] + (P1[o + 1] - P0[o + 1]) * a;
    VIS[o + 2] = P0[o + 2] + (P1[o + 2] - P0[o + 2]) * a;
    let ax = P0[o + 3], ay = P0[o + 4], az = P0[o + 5], aw = P0[o + 6];
    const bx = P1[o + 3], by = P1[o + 4], bz = P1[o + 5], bw = P1[o + 6];
    if (ax * bx + ay * by + az * bz + aw * bw < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
    const x = ax + (bx - ax) * a, y = ay + (by - ay) * a, z = az + (bz - az) * a, w = aw + (bw - aw) * a;
    const l = 1 / (Math.hypot(x, y, z, w) || 1);
    VIS[o + 3] = x * l; VIS[o + 4] = y * l; VIS[o + 5] = z * l; VIS[o + 6] = w * l;
  }
  const instDirty = new Set();
  function applyRec(r, o) {
    if (r.kind === KIND.CHIP) { chipMesh.set(r.i, VIS, o, r.sx, r.sy, r.sz); return; }
    if (r.kind === KIND.PART) return;
    if (r.inst) {
      _p.set(VIS[o], VIS[o + 1], VIS[o + 2]); _q.set(VIS[o + 3], VIS[o + 4], VIS[o + 5], VIS[o + 6]);
      _m.compose(_p, _q, r.ws).premultiply(r.inst.minv);
      r.inst.mesh.setMatrixAt(r.inst.i, _m);
      instDirty.add(r.inst.mesh);
      return;
    }
    const obj = r.obj;
    if (r.pid) { obj.position.set(VIS[o], VIS[o + 1], VIS[o + 2]); obj.quaternion.set(VIS[o + 3], VIS[o + 4], VIS[o + 5], VIS[o + 6]); }
    else if (obj.parent) {
      let inv = parentInv.get(obj.parent);
      if (!inv) { obj.parent.updateWorldMatrix(true, false); inv = obj.parent.matrixWorld.clone().invert(); parentInv.set(obj.parent, inv); }
      _p.set(VIS[o], VIS[o + 1], VIS[o + 2]); _q.set(VIS[o + 3], VIS[o + 4], VIS[o + 5], VIS[o + 6]);
      _m.compose(_p, _q, r.ws).premultiply(inv).decompose(obj.position, obj.quaternion, obj.scale);
    }
    if (!obj.matrixAutoUpdate) obj.updateMatrix();
    if (r.heavy) r.boxDirty = true;
  }

  function consume(res) {
    const out = res?.out;
    if (out) {
      const n = out[0], steps = out[2];
      alpha = out[1];
      stats.stepMs = out[3]; stats.active = out[4]; stats.bodies = out[5];
      const mark = ++markGen;
      const list = [];
      for (let k = 0; k < n; k++) {
        const b = HEAD + k * STRIDE, s = out[b];
        if (!recs[s]) continue; // 已釋放的槽位(延遲到達的舊資料)
        const o = s * 7;
        for (let i = 0; i < 7; i++) { P0[o + i] = out[b + 1 + i]; P1[o + i] = out[b + 8 + i]; }
        seenMark[s] = mark;
        list.push(s);
      }
      if (steps > 0) { // 完整的一批:上一批有、這批沒有的 → 已靜止,停在最後姿態
        for (const s of moving) {
          if (seenMark[s] === mark || !recs[s]) continue;
          const o = s * 7;
          for (let i = 0; i < 7; i++) VIS[o + i] = P0[o + i] = P1[o + i];
          applyRec(recs[s], o);
        }
        moving = list;
      } else for (const s of list) if (!moving.includes(s)) moving.push(s);
      backend.release(out);
    }
    if (res?.events) for (const e of res.events) onEvent(e);
  }

  function onEvent(e) {
    if (e[0] === 'settled') { const r = rags.find((q) => q.id === e[1]); if (r) freeze(r); return; }
    if (e[0] !== 'hit') return;
    const r = recs[e[1]];
    if (!r) return;
    const t = game.time || 0, o = r.slot * 7;
    const pos = { x: VIS[o], y: VIS[o + 1], z: VIS[o + 2] };
    if (r.kind === KIND.PART) {
      const rag = r.rag, torso = r.part.def.bone !== 'neck';
      if (torso && rag.landed < 2 && t - (rag.thudT ?? -9) > 0.35) {
        rag.landed++; rag.thudT = t;
        const heavy = rag.z.type === 'brute';
        sfx.thud(pos, heavy);
        if (heavy && rag.landed === 1 && rag.z._shakeLocal) rag.z._shakeLocal(game.zctx || { player: game.player }, 0.35, 12);
      }
      return;
    }
    if (t - r.hitT < 0.3) return;
    if (t - lastThud > 1) { lastThud = t; thudN = 0; }
    if (++thudN > 8) return; // 全域上限:每秒 8 個撞擊聲
    r.hitT = t;
    if (e[2] > r.mass * 9.81 * 3) sfx.thud(pos, r.mass >= 15);
  }

  function update(dt) {
    if (!P.ready || !backend) return;
    const t0 = performance.now();
    frameNo++;
    parentInv.clear();
    while (cool.length && cool[0][1] <= frameNo) free.push(cool.shift()[0]);
    // 布娃娃:殭屍已移除 → 拿掉;屍體快下沉了 → 凍結
    for (const r of rags.slice()) {
      r.t += dt;
      if (!r.z.root?.parent || (r.z.corpse !== undefined && r.z.corpse < 1.6)) freeze(r);
    }
    let res;
    const t1 = performance.now();
    if (backend.name === 'main') res = backend.frame(dt, flush());
    else res = backend.frame();
    const t2 = performance.now();
    consume(res);
    const t3 = performance.now();
    // 插值並寫回
    for (const s of moving) { const r = recs[s]; if (!r) continue; lerpPose(s, alpha); applyRec(r, s * 7); }
    const t4 = performance.now();
    for (const r of rags) {
      applyRagdoll(r.rec, VIS);
      const b = r.z.b?.belly;
      if (r.z.type === 'bloater' && b) b.scale.setScalar(Math.max(0.55, b.scale.x - dt * 6)); // 爆開後肚子消下去
    }
    const t5 = performance.now();
    stats.breakdown = [t1 - t0, t2 - t1, t3 - t2, t4 - t3, t5 - t4, stats.beginMs || 0]; // pre, backend, consume, apply, ragdoll, begin
    for (const m of instDirty) m.instanceMatrix.needsUpdate = true;
    instDirty.clear();
    // 碎片壽命
    for (const d of debris.slice()) {
      d.t += dt;
      if (d.t > d.life) {
        const k = Math.max(0, 1 - (d.t - d.life) / 0.5);
        d.obj.scale.copy(d.ws).multiplyScalar(Math.max(0.001, k));
        if (k <= 0) expire(d, true);
      }
    }
    for (const c of chips.slice()) {
      c.t += dt;
      if (c.t > c.life) {
        const k = 1 - (c.t - c.life) / 0.4;
        if (k <= 0) { killChip(c); continue; }
        chipMesh.set(c.i, VIS, c.slot * 7, c.sx * k, c.sy * k, c.sz * k);
      }
    }
    chipMesh?.flush();
    if (frameNo % 6 === 0) for (const r of props) if (r.heavy && r.boxDirty) updateBox(r);
    scanT += dt;
    if (scanT > 2) { scanT = 0; dropDetached(); collectDynamic(game.scene); syncBoxes(); }
    if (backend.name !== 'main' && !begun) backend.begin(dt, flush()); // 沒有 begin 掛鉤時在這裡補送(延遲一幀)
    begun = false;
    stats.ragdolls = rags.length; stats.debris = debris.length; stats.chips = chips.length;
    stats.mainMs = performance.now() - t0 + (stats.beginMs || 0);
    stats.beginMs = 0;
  }

  // ======================= 除錯 =======================
  // 顯示靜態碰撞(線框)
  function debug(on = true) {
    if (!on) { if (debugObj) { game.scene.remove(debugObj); debugObj.geometry.dispose(); debugObj = null; } return null; }
    if (debugObj || !staticDesc) return debugObj;
    const pos = [], b = staticDesc.boxes;
    const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (let i = 0; i < b.length; i += 10) {
      const c = [];
      for (let k = 0; k < 8; k++) c.push([b[i] + (k & 1 ? b[i + 3] : -b[i + 3]), b[i + 1] + (k & 2 ? b[i + 4] : -b[i + 4]), b[i + 2] + (k & 4 ? b[i + 5] : -b[i + 5])]);
      for (const [u, v] of E) pos.push(...c[u], ...c[v]);
    }
    for (const h of staticDesc.hulls) for (let i = 0; i + 5 < h.length; i += 3) pos.push(h[i], h[i + 1], h[i + 2], h[(i + 3) % h.length], h[(i + 4) % h.length], h[(i + 5) % h.length]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    debugObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.5, depthTest: true }));
    debugObj.frustumCulled = false;
    game.scene.add(debugObj);
    return debugObj;
  }

  init().catch((e) => {
    physicsLoad.state = 'failed';
    physicsLoad.error = String(e?.message || e);
    console.warn('[physics] 無法啟動,使用原本的動畫:', e?.message || e);
    P.failed = true;
    P.ready = false;
    P.error = String(e?.message || e);
  });
  return P;
}
