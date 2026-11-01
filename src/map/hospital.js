import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parseLayout } from './levels.js';
import { createDressCtx } from './props/ctx.js';
import { dressWorldSteps } from './props/index.js';
import { prepareOutdoorSteps } from './props/outdoor.js';
import { Buckets } from './hospital/builder.js';
import { createShellContext, buildFloors, buildWalls, buildWindowCells, buildCeilings, buildVaults, buildPipes } from './hospital/shell.js';
import { buildDoors, buildWindows, buildRails, buildFences, buildElevators, buildEdgeRails } from './hospital/openings.js';
import { buildStairs } from './hospital/stairs.js';
import { buildSigns } from './hospital/signs.js';
import { createEvents } from './hospital/events.js';
import { upgradePropMaterials } from './hospital/proppbr.js';
import { NO_FLASH_SHADOW_LAYER } from './hospital/builder.js';
import { buildLights, setGlowFog } from './hospital/lights.js';
import { buildAtmosphere, makeEnvironment, onGlowFog } from './hospital/atmosphere.js';
import { surf } from './hospital/surfaces.js';
import { setAnisotropy, pbrState } from './hospital/pbr.js';
import { procStats } from './hospital/proctex.js';
import { createVis } from './hospital/vis.js';
import { createBatcher, createBatchView, createDynBatch, createCompactor, batchable, plainObj, regionSet, instancedDepth } from './hospital/batch.js';
import { applySurface, hasSurface } from '../mats/surface.js';
import { doorSeeThrough } from './hospital/leaves.js';

// 聖心醫院本體:依 levels.js 的四層佈局建出結構(牆/地板/天花板/門窗/樓梯/欄杆/戶外)、材質、燈光、氛圍與腳本驚嚇。
// 細節在 src/map/hospital/*;這裡負責組裝、樓層可見性與每幀更新。
// opts:{ poolSize }(光源池燈數,預設 8;品質設定可用 hospital.setQuality 改)
export function buildHospital(world, layout, scene, opts = {}) {
  const it = buildHospitalSteps(world, layout, scene, opts);
  let r;
  while (!(r = it.next()).done) { /* 同步跑完 */ }
  return r.value;
}
// [perf] 分段版(generator):每個建構階段、每個區域的擺設、每塊合併之後 yield;載入時由 main.js 分時執行
export function* buildHospitalSteps(world, layout, scene, opts = {}) {
  const t0 = performance.now();
  const L = layout || world?.layout || parseLayout();
  const pvs = createVis(L); // [draws] 室內可見性(格子 2D 視線 → 區塊)
  const root = new THREE.Group();
  root.name = 'hospital';
  // 每層一個群組(結構 + 道具),依玩家位置切換可見性
  const levelGroups = L.levels.map((lv) => {
    const g = new THREE.Group();
    g.name = 'level-' + lv.id;
    root.add(g);
    return g;
  });
  const propGroups = levelGroups.map((g) => { const p = new THREE.Group(); p.name = 'props'; g.add(p); return p; });

  // ---- 結構 ----
  const B = new Buckets();
  const K = createShellContext(L, B);
  K.levelGroups = levelGroups;
  K.propGroups = propGroups; // 門扇實例跟著道具群組顯示(src/map/hospital/leaves.js)
  buildRails(K); yield;
  buildFloors(K); yield;
  buildWalls(K); yield;
  buildWindowCells(K); yield;
  buildCeilings(K); yield;
  buildVaults(K); yield;
  buildPipes(K); yield;
  buildDoors(K); yield;
  buildWindows(K); yield;
  buildFences(K); yield;
  buildElevators(K); yield;
  buildStairs(K); yield;
  buildEdgeRails(K); yield;
  try { buildSigns(K); } catch (e) { console.error('[hospital] 標示建構失敗', e); }
  yield;
  const tShell = performance.now();

  // ---- 道具(依樓層合併靜態網格) ----
  const ctx = createDressCtx({ layout: L, world, group: root });
  const statics = L.levels.map(() => []);
  const origAdd = ctx.add;
  const _bb = new THREE.Box3();
  ctx.add = (obj, o = {}) => {
    const isStatic = o.static !== false;
    const res = origAdd(obj, { ...o, static: false });
    _bb.setFromObject(obj);
    const li = Number.isFinite(_bb.min.y) ? Math.max(0, L.levelOfY(_bb.min.y + 0.25)) : 1;
    propGroups[li].add(obj);
    ctx.lateAdd?.(obj); // [draws] 批次建好之後才加進來的(下載模型換掉的實例池):也依區塊開關
    if (isStatic) obj.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh) statics[li].push(m); });
    return res;
  };
  let propErr = null;
  try { yield* prepareOutdoorSteps(); } catch (e) { console.error('[hospital] 戶外材質準備失敗', e); }
  try { yield* dressWorldSteps(ctx); } catch (e) { propErr = e; console.error('[hospital] dressWorld 失敗', e); }
  const { lights: propLights, events: propEvents } = ctx.finalize();
  yield;
  const chunks = []; // 合併後的道具區塊(距離剔除用)
  const propMeshes = yield* mergeStatics(statics, propGroups, chunks, pvs);
  const propPbr = upgradePropMaterials();
  yield;
  // 可推動的小道具是各自獨立的物件(不能合併):離玩家 34m 以外就不畫(夜裡有霧,看不出來),省 draw call
  const dynProps = [];
  for (const g of propGroups) for (const o of g.children) if (o.userData?.dynamic && !o.isInstancedMesh) dynProps.push(o);
  // [draws] 可推動道具平常是靜止的:不必每幀重算矩陣;物理移動它時會自己 updateMatrix(src/physics/index.js)
  // 子網格相對群組不動 → 群組沒被移動時整棵子樹都不用走(每幀 updateMatrixWorld 少走上千個物件)
  const lazyWorld = function (force) { if (force || this.matrixWorldNeedsUpdate) THREE.Object3D.prototype.updateMatrixWorld.call(this, force); };
  for (const o of dynProps) if (/^pi_dyn_/.test(o.name) || /^dyn_/.test(o.name)) { o.traverse((c) => { c.updateMatrix(); c.matrixAutoUpdate = false; }); o.updateMatrixWorld = lazyWorld; } // dyn_*:戶外實例池的物理代理(外觀由實例池跟著畫)
  let dynTick = 0;
  const tProps = performance.now();

  // ---- 燈光與氛圍 ----
  const lights = buildLights(K, { root, propLights, poolSize: opts.poolSize ?? 8 });
  yield;
  const atmo = buildAtmosphere(K, { root, scene, groundMat: surf('soil') });
  yield;
  atmo.moon.shadow.camera.layers.enable(NO_FLASH_SHADOW_LAYER);
  K.atmo = atmo;
  onGlowFog(setGlowFog);
  const meshes = B.build(levelGroups);
  // [draws] 不會移動的容器:不必每幀重算矩陣(父節點自動更新會強迫底下全部子孫每幀重算世界矩陣)
  for (const g of [root, ...levelGroups, ...propGroups]) { g.matrixAutoUpdate = false; g.updateMatrix(); }
  const tris = B.tris;
  yield;
  const events = createEvents({ K, L, lights, propEvents, root });
  yield;

  // ---- 樓層可見性:地下室只在地下或靠近往下的樓梯時才畫 ----
  const b1 = L.levels.findIndex((l) => l.id === 'B1');
  const connectors = []; // B1 ↔ 1F 的通道(樓梯、坡道)
  for (const s of L.stairs) if (s.lower === b1) connectors.push({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 });
  const vis = L.levels.map(() => true);
  // 其他樓層的「道具」(draw call 大宗):只有在戶外、靠近連通兩層的樓梯、或在挑空(大廳中庭)附近時才畫;
  // 結構(外牆、窗、樓板)照舊,從窗外看建築不會缺一塊
  const stairsP = L.stairs.map((s) => ({ lo: s.lower, hi: s.upper, x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, r: 9 + Math.max(s.x1 - s.x0, s.z1 - s.z0) / 2 }));
  const voids = [];
  L.levels.forEach((lv, lj) => {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) if (lv.rows[r][c] === 'o') { x0 = Math.min(x0, c * 2); x1 = Math.max(x1, c * 2 + 2); z0 = Math.min(z0, r * 2); z1 = Math.max(z1, r * 2 + 2); }
    if (x1 > x0) voids.push({ lj, x0: x0 - 8, z0: z0 - 8, x1: x1 + 8, z1: z1 + 8 });
  });
  const propVis = L.levels.map(() => true);
  const updateVisibility = (li, x, z, outdoor) => {
    let nearB1 = false;
    for (const c of connectors) if ((c.x - x) ** 2 + (c.z - z) ** 2 < 15 * 15) nearB1 = true;
    let atrium = false;
    for (const v of voids) if (x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1) atrium = true;
    for (let i = 0; i < vis.length; i++) {
      if (li === b1) vis[i] = i === b1 || (nearB1 && i === b1 + 1); // 地下室只有靠近樓梯/坡道時看得到 1F;2F 以上看不到
      else vis[i] = i === b1 ? nearB1 || li === b1 : true;
      levelGroups[i].visible = vis[i];
      let pv = i === li || outdoor || atrium;
      if (!pv) for (const s of stairsP) if (((s.lo === li && s.hi === i) || (s.hi === li && s.lo === i)) && (s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r) { pv = true; break; }
      propVis[i] = pv;
      propGroups[i].visible = pv;
    }
  };

  // ---- [draws] PVS:玩家附近的樓梯(連通的那層從樓梯格做視線)、靜態批次、依區塊開關的其他物件 ----
  L.stairs.forEach((s, i) => { const sp = stairsP[i]; sp.id = i; sp.cells = []; for (let r = s.r0 - 1; r <= s.r1 + 1; r++) for (let c = s.c0 - 1; c <= s.c1 + 1; c++) sp.cells.push([c, r]); });
  // 其他樓層的種子格(樓梯外圍、挑空/樓梯開口)閒置時先算好(每 2×2 一格,與 vis.js 的種子去重一致)
  for (const sp of stairsP) for (const [c, r] of sp.cells) { pvs.queueSeed(sp.lo, c, r); pvs.queueSeed(sp.hi, c, r); }
  L.levels.forEach((lv, lj) => { for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) { const ch = L.charAt(lj, c, r); if (ch === 'o' || ch === '%') { pvs.queueSeed(lj, c, r); if (lj > 0) pvs.queueSeed(lj - 1, c, r); } } });
  const nearSt = [];
  const nearStairs = (li, x, z) => { nearSt.length = 0; for (const s of stairsP) if ((s.lo === li || s.hi === li) && (s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r) nearSt.push(s); return nearSt; };
  let view = null, comp = null, pvsSig = -1, pvsTick = 0, pvsLi = 1, pvsOut = false;
  const one = new Int32Array(1); // 單一區塊的查詢(不每次配置陣列)
  const tracked = []; // { o, li, regs }:沒有烘進批次的靜態實例池(下載模型會換掉零件的那些),依區塊開關 visible
  // 某樓層某些區塊目前是否可能看得到(regs = null:不分區塊)
  const pvsTest = (oli, regs) => {
    if (!vis[oli]) return false;
    if (oli !== pvsLi && !propVis[oli]) return false;
    if (!regs || (oli !== pvsLi && pvsOut)) return true;
    const own = pvs.own, other = pvs.other;
    for (let k = 0; k < regs.length; k++) { const r = regs[k]; if (own[r] || (oli !== pvsLi && other[r])) return true; }
    return false;
  };
  const track = (o) => {
    o.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), set = new Set();
    let oli = -1, all = false;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      m.premultiply(o.matrixWorld);
      const e = m.elements;
      if (oli < 0) oli = Math.max(0, L.levelOfY(e[13] + 0.25));
      const rs = regionSet(pvs, oli, e[12] - 0.5, e[14] - 0.5, e[12] + 0.5, e[14] + 0.5, true);
      if (!rs) { all = true; break; }
      for (const r of rs.r) set.add(r);
    }
    const pool = o.userData.pool;
    tracked.push({ o, li: Math.max(0, oli), regs: all ? null : Int32Array.from(set), dyn: pool?.dyn ? pool : null });
    if (!pool?.dyn) { o.matrixAutoUpdate = false; o.updateMatrix(); }
  };
  // 會被推動的戶外實例池(frustumCulled = false,原本到哪都畫):依目前代理物件的位置判斷
  const dynPoolVisible = (pool) => {
    for (const px of pool.proxies) {
      if (!px.parent || !px.visible) continue;
      const e = px.matrixWorld.elements, oli = Math.max(0, L.levelOfY(e[13] - 0.2));
      one[0] = pvs.regionAt(oli, e[12], e[14]);
      if (pvsTest(oli, one)) return true;
    }
    return false;
  };
  const applyTracked = () => {
    for (let i = tracked.length - 1; i >= 0; i--) { const t = tracked[i]; if (!t.o.parent) { tracked.splice(i, 1); continue; } t.o.visible = t.dyn ? dynPoolVisible(t.dyn) : pvsTest(t.li, t.regs); }
  };
  const dynVisible = (o) => {
    const oli = Math.max(0, L.levelOfY(o.position.y + 0.3));
    one[0] = pvs.regionAt(oli, o.position.x, o.position.z);
    return pvsTest(oli, one);
  };
  // 可推動的小道具:34m(或畫質的道具距離,取小)以外不畫;[draws] 看不到的區塊也不畫
  const dynVisAll = (px, pz) => { const fd = Math.min(34, H.propDistance); for (const o of dynProps) { const dx = o.position.x - px, dz = o.position.z - pz; o.visible = dx * dx + dz * dz < fd * fd && (!view || dynVisible(o)); } };
  // [draws] PVS:換格子(或樓層/戶外/樓梯附近的規則/門)才重算;tick = 這一幀也重算道具距離
  let lastP = null;
  const pvsStep = (li, x, y, z, outdoor, tick) => {
    pvs.setMaxDistance(H.propDistance + 10);
    pvsLi = li; pvsOut = outdoor;
    const changed = pvs.update(li, x, z, nearStairs(li, x, z));
    let sig = li * 2 + (outdoor ? 1 : 0);
    for (let i = 0; i < vis.length; i++) sig = sig * 4 + (vis[i] ? 2 : 0) + (propVis[i] ? 1 : 0);
    const big = changed || sig !== pvsSig;
    if (big || tick) view.refresh(li, vis, propVis, outdoor, x, y + 1.6, z, H.propDistance, big);
    if (big) { applyTracked(); comp?.refresh(); }
    pvsSig = sig;
    return big;
  };
  // [perf6] 活屍(動態角色)也依 PVS:主相機這次渲染時,所在區塊(腳與頭兩個高度 × 四周 0.5m)都看不到的就先藏起來(主畫面與
  // 手電筒陰影都不畫),渲染完立刻還原 —— 遊戲邏輯、射線、伏擊姿勢看到的 visible 永遠是原本的值。
  // 其他樓層 / 牆後 / 關著的門後的活屍不再每幀畫 4~5 + 陰影 3~5 個 draw call
  const hiddenActors = [];
  const actorVisible = (x, y, z) => {
    for (const dy of [0.3, 1.5]) {
      const oli = Math.max(0, L.levelOfY(y + dy));
      for (const [dx, dz] of [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) { one[0] = pvs.regionAt(oli, x + dx, z + dz); if (pvsTest(oli, one)) return true; }
    }
    return false;
  };
  const hideActors = (list) => {
    if (!list || !view || !lastP) return;
    const far2 = H.propDistance * H.propDistance; // 視線只算到道具距離 + 10m:更遠的(戶外遠處路燈下)照舊只靠視錐剔除
    for (let i = 0; i < list.length; i++) {
      const z = list[i], root = z?.root, p = z?.pos;
      if (!root || !root.visible || !p) continue;
      if ((p.x - lastP.x) ** 2 + (p.z - lastP.z) ** 2 > far2) continue;
      if (!actorVisible(p.x, p.y, p.z)) { root.visible = false; hiddenActors.push(root); }
    }
  };
  const unhideActors = () => { for (let i = 0; i < hiddenActors.length; i++) hiddenActors[i].visible = true; hiddenActors.length = 0; };
  // [perf6] 門的狀態(src/interact/doors.js):兩扇都完全關好(不在轉動)的實心門洞,在玩家這一層的精細視線裡當牆。
  // 主相機每次渲染前檢查(很便宜):門一開始轉動(或新一局門被重設成開著)就在這一幀重算 PVS → 門後的房間和門縫同一幀出現,不會晚一幀
  let doorWays = null;
  const shut = (l) => !l.anim && Math.abs(Math.atan2(Math.sin(l.group.rotation.y - l.closed), Math.cos(l.group.rotation.y - l.closed))) < 0.03;
  const doorPoll = () => {
    const D = H.game?.interact?.doors;
    if (!D?.list) return false;
    if (!doorWays) {
      doorWays = [];
      for (const w of D.list) {
        if (w.leaves.length < 2 || doorSeeThrough(w.style)) continue;
        const [li, c, r] = String(w.key).split(',').map(Number);
        if ([li, c, r].every(Number.isFinite)) doorWays.push({ w, li, c, r });
      }
    }
    let any = false;
    for (const d of doorWays) if (pvs.setDoor(d.li, d.c, d.r, d.w.leaves.every(shut))) any = true;
    return any;
  };
  ctx.lateAdd = (obj) => {
    if (!view || !obj.isInstancedMesh) return;
    instancedDepth(obj);
    const pool = obj.userData.pool;
    if (comp && pool?.owner && !pool.dyn && plainObj(obj)) { comp.drop(pool); comp.add(obj); comp.build(); comp.refresh(); } // 下載模型換掉的區塊實例池:換掉壓實清單裡的舊零件
    else if (pool?.owner || pool?.dyn) { track(obj); applyTracked(); }
  };

  const stats = {
    buildMs: Math.round(performance.now() - t0), shellMs: Math.round(tShell - t0), propsMs: Math.round(tProps - tShell),
    meshes: meshes.length, propMeshes, propPbr, tris, fixtures: lights.fixtures.length, propLights: propLights.length, propEvents: propEvents.length,
    proc: procStats, pbr: pbrState, propErr: propErr ? String(propErr) : null,
  };
  console.log('[hospital] build', JSON.stringify(stats));

  // ---- 每幀 ----
  const camFwd = new THREE.Vector3();
  let shadowFrames = 0, lastLoaded = -1;
  let cullTick = 0;
  const H = {
    group: root, stats, layout: L, lights, atmo, K, levelGroups, propGroups, propEvents, propLights, vis, propVis, events, game: null, chunks,
    // [scene r4] 給體驗導演(結局)的錨點與天亮控制:anchors.w207 { lamp, chair, bed, window, door, view, hub, setDawn }、anchors.alleyView
    anchors: buildAnchors(propEvents, lights, root),
    setDawn: (t) => lights.setDawn(t),
    leaves: K.leaves, doorLeaves: K.doorLeaves || [], // 門扇實例與代理(src/map/hospital/leaves.js;互動與碰撞在 src/interact/doors.js)
    propDistance: 54, // 道具區塊的顯示距離(公尺):霧裡看不到的就不畫,setQuality 依 drawDistance 調整
    pvs, batches: null, structMeshes: meshes,
    // [draws] 世界座標的範圍(y = 底部高度)目前是否可能看得到(其他系統的物件用,例如店面);批次建好之前一律 true
    pvsVisibleBox(y, x0, z0, x1, z1) {
      if (!view) return true;
      const oli = Math.max(0, L.levelOfY(y));
      const rs = regionSet(pvs, oli, x0, z0, x1, z1, false);
      return pvsTest(oli, rs ? rs.r : null);
    },
    // 同上,區塊組合先算好(每幀查詢不配置):pvsBoxRegions → { li, regs },pvsTestRegions(那個物件)
    pvsBoxRegions(y, x0, z0, x1, z1) { const oli = Math.max(0, L.levelOfY(y)); const rs = regionSet(pvs, oli, x0, z0, x1, z1, false); return { li: oli, regs: rs ? rs.r : null }; },
    pvsTestRegions(q) { return !view || pvsTest(q.li, q.regs); },
    // [draws] 靜態批次(src/map/hospital/batch.js):結構 / 道具區塊 / 靜態實例池 → 每個材質一個 BatchedMesh,實例 = 區塊。
    // 由 game.js 在互動物件與材質表面升級(upgradeWorldSurfaces)之後、預編譯之前呼叫一次(分段 generator;batch() = 同步跑完)
    batch(game) { const it = H.batchSteps(game); let r; while (!(r = it.next()).done) { /* 同步跑完 */ } return r.value; },
    *batchSteps(game) {
      if (view) return view;
      let busy = 0, ts = performance.now(), nY = 0;
      const pause = function* () { busy += performance.now() - ts; nY++; yield; ts = performance.now(); };
      const t1 = performance.now();
      const Bt = createBatcher({ L, vis: pvs });
      const vcCache = new Map();
      const vcMat = (m) => { let c = vcCache.get(m); if (!c) { c = m.clone(); c.vertexColors = true; c.name = (m.name || m.type) + '+vc'; if (hasSurface(m)) applySurface(c); vcCache.set(m, c); } return c; };
      const used = [], keep = [];
      for (const m of meshes) {
        const mm = /^L(\d+):/.exec(m.name);
        if (!mm || !m.parent || !batchable(m.material) || !plainObj(m) || /:glass$/.test(m.name)) continue;
        Bt.addStruct(m, +mm[1]);
        used.push(m);
        if (!(used.length % 8)) yield* pause();
      }
      const t2 = busy + performance.now() - ts;
      for (const m of chunks) {
        if (!m.parent || !m.userData.batch || !batchable(m.material) || !plainObj(m)) continue;
        Bt.addProp(m, m.userData.batch.li, 1, m.userData.batch.regs);
        used.push(m);
        if (!(used.length % 64)) yield* pause();
      }
      // [perf6] 互動物件的靜態零件(src/interact/kit.js:每層 × 每種材質合併的 ix-static 網格,整層一個包圍球 → 從不剔除):
      // 依三角形切到區塊、併進同材質的批次(和 ix-batch 同樣是 batching program,不會每幀來回切換)
      propGroups.forEach((g, li) => {
        for (const o of g.children) if (o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh && /^ix-static:/.test(o.name) && batchable(o.material) && plainObj(o)) { Bt.addStruct(o, li, 'prop', 0.6); used.push(o); }
      });
      yield* pause();
      for (const g of propGroups) for (const o of g.children) {
        if (!o.isInstancedMesh || !o.count) continue;
        const pool = o.userData.pool, pi = /^pi_inst_/.test(o.name);
        const region = !!(pool && pool.owner && !pool.dyn);
        if (plainObj(o) && batchable(o.material) && !o.material.userData?.wind && (pi || (region && !pool.owner._bound))) {
          Bt.addInstanced(o, pi ? 0.6 : o.castShadow ? 1 : 0.6, vcMat, pi);
          used.push(o);
          if (pool) pool.baked = true;
          if (!(used.length % 16)) yield* pause();
        } else if (region || pool?.dyn || (/^po_anim_/.test(o.name) && !o.frustumCulled)) keep.push(o); // 其餘實例池:依區塊開關
      }
      const st = { ...Bt.stats };
      const t3 = busy + performance.now() - ts;
      yield* pause();
      const built = yield* Bt.buildSteps(root);
      const t4 = busy + performance.now() - ts;
      for (const o of used) { o.parent?.remove(o); if (!o.isInstancedMesh) o.geometry.dispose(); }
      const left = chunks.filter((m) => m.parent);
      chunks.length = 0;
      chunks.push(...left);
      yield* pause();
      const dynB = createDynBatch({ groups: dynProps.filter((o) => /^pi_dyn_/.test(o.name)), parent: root, moon: atmo.moon });
      yield* pause();
      comp = createCompactor({ parent: root, test: pvsTest, vis: pvs, L });
      for (const o of keep) { const pool = o.userData.pool; if (pool?.owner && !pool.dyn && plainObj(o)) comp.add(o); else track(o); }
      comp.build();
      view = createBatchView({ meshes: built.meshes, insts: built.insts, proxies: built.proxies, vis: pvs, moon: atmo.moon, dyn: dynB, comp, flash: () => H.game?.player?.flashlight || null });
      H.batches = view;
      // 主相機每次渲染前(矩陣已更新):視錐剔除 + 套用;其他相機(遮雨深度圖、離屏預熱)全部打開
      const scene0 = game?.scene || scene, cam0 = game?.camera || null;
      const prev = scene0.onBeforeRender;
      scene0.onBeforeRender = function (r, sc, cam, rt) {
        prev.call(this, r, sc, cam, rt);
        unhideActors();
        if (cam === cam0 && (cam.layers.mask & 1)) {
          if (doorPoll() && lastP) { pvsStep(lastP.li, lastP.x, lastP.y, lastP.z, lastP.outdoor, false); dynVisAll(lastP.x, lastP.z); } // [perf6] 門開/關:這一幀就重算
          view.cull(cam);
          hideActors(game?.zombies);
        } else view.showAll();
      };
      const prevA = scene0.onAfterRender;
      scene0.onAfterRender = function (r, sc, cam) { view.restoreShadows(); unhideActors(); prevA.call(this, r, sc, cam); };
      // [perf6] 會投影的 InstancedMesh 用自己的深度材質(不和一般網格共用 three 預設那一個 → 陰影 pass 不會每幀來回切 program)
      scene0.traverse(instancedDepth);
      // 場景根節點不會動:關掉自動更新(否則每幀強迫全部物件重算世界矩陣);自己 updateMatrix 的物件照常更新
      scene0.matrixAutoUpdate = false;
      scene0.updateMatrix();
      scene0.updateMatrixWorld(true);
      busy += performance.now() - ts;
      stats.batch = { ms: Math.round(busy), wall: Math.round(performance.now() - t1), steps: nY, struct: Math.round(t2), props: Math.round(t3 - t2), build: Math.round(t4 - t3), batched: built.meshes.length, instances: built.insts.length, shadowProxies: built.proxies.length, proxied: built.meshes.filter((m) => m.userData.proxied).length, dynBatches: dynB.meshes.length, dynItems: dynB.items.length, compact: comp.count(), fromMeshes: st.meshes, fromInstanced: st.instanced, bakedInst: st.inst, tracked: tracked.length, regions: pvs.nR };
      console.log('[hospital] batch', JSON.stringify(stats.batch));
      return view;
    },
    // post.js 會呼叫:提供 renderer(環境貼圖、各向異性)與品質設定
    attachRenderer(r, game) {
      H.game = game || null;
      try { setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy())); } catch { /* 忽略 */ }
      try { scene.environment = makeEnvironment(r); } catch (e) { console.warn('[hospital] 環境貼圖失敗', e); }
      H.setQuality(game?.quality);
      // shader 預編譯統一由 main.js boot()(src/sys/warmup.js)在畫質設定套用後分批做;這裡先編會用錯參數、還會同步等編譯
      if (game?.camera) game.camera.layers.enable(NO_FLASH_SHADOW_LAYER);
    },
    setQuality(q) {
      const pool = q?.get?.('lights') ?? q?.get?.('lightPool');
      if (Number.isFinite(pool)) lights.setPoolSize(pool);
      const dd = q?.get?.('drawDistance');
      if (Number.isFinite(dd)) H.propDistance = dd * 0.6;
    },
    update(time, dt, player) {
      if (!player) return;
      const p = player.pos;
      const li = Math.max(0, L.levelOfY(p.y + 0.3));
      const c = Math.floor(p.x / L.CELL), r = Math.floor(p.z / L.CELL);
      const zone = L.zoneAt(li, c, r);
      const style = zone || L.levelDefault[L.levels[li].id];
      const mood = L.moods[style.mood] || L.moods.corridor;
      const outdoor = (L.flagsAt(li, c, r) & L.F.OUTDOOR) !== 0 || L.ceilY(li, c, r) === Infinity;
      updateVisibility(li, p.x, p.z, outdoor);
      // [draws] PVS:換格子(或樓層/戶外/樓梯附近的規則改變)才重算;道具距離每 4 幀重算
      if (view) {
        lastP = { li, x: p.x, y: p.y, z: p.z, outdoor };
        const big = pvsStep(li, p.x, p.y, p.z, outdoor, ((pvsTick = (pvsTick + 1) & 3) === 0));
        if (big) dynTick = 11; else pvs.idle(0.6);
      }
      if ((dynTick = (dynTick + 1) % 12) === 0) dynVisAll(p.x, p.z);
      // 道具區塊距離剔除(每 4 幀一次;區塊包圍球表面到眼睛的距離)。
      // 小東西在霧裡更早就看不清楚:半徑越小顯示距離越短(半徑 0.2m ≈ 1/3,4m 以上 = 完整距離)
      if ((cullTick = (cullTick + 1) & 3) === 0) {
        const ey = p.y + 1.6, far = H.propDistance;
        for (let i = 0; i < chunks.length; i++) {
          const m = chunks[i], s = m.geometry.boundingSphere, c = s.center;
          m.visible = Math.hypot(c.x - p.x, c.y - ey, c.z - p.z) - s.radius < far * Math.min(1, 0.3 + s.radius / 6);
        }
      }
      const cam = player.camera;
      cam.layers.enable(NO_FLASH_SHADOW_LAYER);
      cam.getWorldDirection(camFwd);
      const fl = Math.hypot(camFwd.x, camFwd.z) || 1;
      lights.update(time, dt, p.x, p.y + 1.6, p.z, camFwd.x / fl, camFwd.z / fl, li, vis);
      atmo.update(time, dt, cam, mood, outdoor);
      // 新的一局(狀態從非遊戲中變成遊戲中):驚嚇事件、被甩上的門、掉下的天花板都歸零
      const st = H.game?.state;
      if (st === 'playing' && H._state !== 'playing') { events.reset(); lights.calmUntil?.(time + 60); } // [ghost] 開局 60 秒內燈不閃
      H._state = st;
      try { events.update(time, dt, player, H.game, { li, zone, mood: style.mood, outdoor, fx: camFwd.x / fl, fz: camFwd.z / fl }); } catch (e) { console.warn('[events]', e); }
      K.leaves?.update(); // 角度有變的門扇才重寫實例矩陣
      // 月光陰影:靜態,只在一開始與貼圖載完時重算(玩家在地面以上時)
      const loaded = pbrState.alpha + procStats.done; // 只有鏤空貼圖會改變陰影形狀(其他貼圖載完不必重畫 2048 陰影圖)
      if (li !== b1 && (shadowFrames < 2 || loaded !== lastLoaded)) { atmo.moon.shadow.needsUpdate = true; shadowFrames++; lastLoaded = loaded; }
      H.zone = zone; H.level = li; H.mood = style.mood;
    },
    // 新回合/重新開始:驚嚇事件與燈光狀態歸零(地圖不重建)
    reset() { events.reset(); },
    // 換地圖時:移除場景、釋放幾何(材質/貼圖是全域快取,可給下一張地圖共用)
    dispose() {
      events.dispose();
      K.leaves?.dispose();
      lights.dispose?.();
      scene.remove(root);
      root.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
      if (scene.environment && scene.environment.isTexture) { scene.environment.dispose(); scene.environment = null; }
    },
  };
  return H;
}

// 道具的靜態網格依「樓層 × 材質」合併;三角形多的材質再依 24m 區塊切開。
// 整層合成一個大網格雖然 draw call 少,但包圍球涵蓋整層 → 視錐剔除、距離剔除、手電筒陰影的剔除全部失效,
// 每幀(含每個陰影 pass)都得畫整層上百萬個三角形。只切「重」的材質:三角形大幅減少,draw call 不會因為
// 上百種輕量材質被切成很多塊而暴增。
const CHUNK = 24, HEAVY_VERTS = 60000; // 單一材質在一層超過 ~2 萬個三角形才切區塊
// 沒有任何貼圖的純色材質(道具材質八成以上是這種)改成頂點色,依「粗糙度/金屬度/面向」合併成少數共用材質:
// 145 種材質 → 約 20 種,draw call 與材質切換大減。透明、自發光、有自訂 shader 的材質維持原樣。
const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];
const plainMats = new Map();
function plainBucket(mat) {
  if (!mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.transparent || mat.alphaTest > 0 || mat.vertexColors || mat.wireframe || mat.fog === false) return null;
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return null;
  if (mat.defines && Object.keys(mat.defines).some((k) => k !== 'STANDARD')) return null; // STANDARD 是 MeshStandardMaterial 內建的
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0) return null;
  if (MAP_KEYS.some((k) => mat[k])) return null;
  const r = Math.round(mat.roughness * 5), mt = Math.round(mat.metalness * 5);
  const key = r + '|' + mt + '|' + mat.side + '|' + (mat.flatShading ? 1 : 0) + '|' + Math.round((mat.envMapIntensity ?? 1) * 4);
  let b = plainMats.get(key);
  if (!b) plainMats.set(key, (b = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r / 5, metalness: mt / 5, side: mat.side, flatShading: mat.flatShading, envMapIntensity: mat.envMapIntensity ?? 1, name: 'plain:' + key })));
  return b;
}
function* mergeStatics(statics, groups, chunks, pvs) {
  let count = 0;
  const _b = new THREE.Box3();
  for (let li = 0; li < statics.length; li++) {
    const list = statics[li];
    const eff = new Map(); // 原材質 → 實際合併用的材質(純色材質 → 共用頂點色材質)
    const verts = new Map(); // 合併用材質 → 這一層的頂點數
    for (const m of list) {
      if (!m.parent || Array.isArray(m.material)) continue;
      if (!eff.has(m.material)) eff.set(m.material, plainBucket(m.material) || m.material);
      const mat = eff.get(m.material), pa = m.geometry.attributes.position;
      verts.set(mat, (verts.get(mat) || 0) + (m.geometry.index ? m.geometry.index.count : pa ? pa.count : 0));
    }
    const byKey = new Map(); // 區塊 → (材質 → 幾何)
    const regOf = new Map(); // 區塊鍵 → 區塊組合(src/map/hospital/batch.js 之後依區塊做成 BatchedMesh 實例)
    for (const m of list) {
      if (!m.parent || Array.isArray(m.material)) continue;
      m.updateMatrixWorld(true);
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrixWorld);
      const mat = eff.get(m.material);
      if (mat !== m.material) { // 純色 → 頂點色(Color 內部已是線性值,和頂點色的解讀一致)
        const n = g.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color;
        for (let i = 0; i < n * 3; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      g.computeBoundingBox();
      const bb = g.boundingBox;
      let key;
      if (batchable(mat)) { // [draws] 會進批次的材質:依物件所在的區塊分(之後每個區塊是一個可單獨開關的實例,不會增加 draw call)
        _b.copy(bb).expandByScalar(-0.1);
        const rs = regionSet(pvs, li, _b.min.x, _b.min.z, Math.max(_b.min.x, _b.max.x), Math.max(_b.min.z, _b.max.z), true);
        key = 'r:' + (rs ? rs.k : '*');
        if (!regOf.has(key)) regOf.set(key, rs);
      } else key = verts.get(mat) < HEAVY_VERTS ? 'all' : Math.floor((bb.min.x + bb.max.x) * 0.5 / CHUNK) + ',' + Math.floor((bb.min.z + bb.max.z) * 0.5 / CHUNK);
      let byMat = byKey.get(key);
      if (!byMat) byKey.set(key, (byMat = new Map()));
      const arr = byMat.get(mat) || [];
      arr.push(g);
      byMat.set(mat, arr);
      m.parent.remove(m);
    }
    yield;
    for (const [key, byMat] of byKey) {
      for (const [material, geos] of byMat) {
        for (let i = 0; i < geos.length; i += 400) {
          const merged = mergeGeometries(geos.slice(i, i + 400));
          for (const g of geos.slice(i, i + 400)) g.dispose();
          if (!merged) continue;
          merged.computeBoundingSphere();
          const mesh = new THREE.Mesh(merged, material);
          mesh.castShadow = !material.transparent;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          if (regOf.has(key)) mesh.userData.batch = { li, regs: regOf.get(key) };
          groups[li].add(mesh);
          chunks.push(mesh);
          count++;
          yield;
        }
      }
    }
  }
  return count;
}

// [scene r4] 道具登記的錨點(kind 'anchor', name 'w207.chair' …)→ 結構化
function buildAnchors(propEvents, lights, root) {
  const A = { w207: {} };
  for (const e of propEvents) {
    if (e.kind !== 'anchor' || !e.name) continue;
    const [grp, key] = e.name.split('.');
    const o = { x: e.x, y: e.y, z: e.z };
    if (e.yaw != null) o.yaw = e.yaw;
    if (e.pitch != null) o.pitch = e.pitch;
    if (key) (A[grp] ||= {})[key] = o; else A[grp] = o;
  }
  const st = lights.story || {};
  if (A.w207.lamp && st.lamp) A.w207.lamp.fixture = st.lamp;
  const w = st.window;
  if (w) A.w207.window = { x: w.x, y: 4.2 + 1.66, z: w.z, nx: w.axis === 'z' ? 0 : -w.inDir, nz: w.axis === 'z' ? -w.inDir : 0 };
  A.w207.setDawn = (t) => lights.setDawn(t);
  const truck = root?.getObjectByName?.('jinshui-truck');
  if (truck) (A.truck ||= {}).mesh = truck; // 結局:anchors.truck.mesh.visible = true
  return A;
}
