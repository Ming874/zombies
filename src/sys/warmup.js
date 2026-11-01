import * as THREE from 'three';
import { idle } from './sched.js';

// ===== Shader 預編譯(KHR_parallel_shader_compile)=====
// three 在「第一次畫到某種材質」時才編譯 shader,而且會卡住主執行緒直到連結完成(首隻殭屍出現、
// 第一次開槍、第一次掉金幣…都會頓一下)。這裡用 renderer.compileAsync 在背景執行緒先編好:
//   await precompile(game, game.scene)            整個場景(主材質 + 陰影深度/距離材質)
//   await precompile(game, someGroup)             還沒加進場景的物件(用場景的光源/霧狀態編譯)
// 注意:必須在與實際渲染相同的狀態下編譯(光源數量、霧、陰影開關、輸出到 HDR render target)。

const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const keep = []; // 代理材質留著:dispose 會讓 three 回收剛編好的 program

// 仿照 WebGLShadowMap.getDepthMaterial 做出陰影 pass 會用到的材質(program 依參數共用)
function shadowVariant(Cls, m, vsm) {
  const d = new Cls();
  d.side = m.shadowSide != null ? m.shadowSide : vsm ? m.side : SHADOW_SIDE[m.side];
  d.alphaMap = m.alphaMap || null;
  d.alphaTest = m.alphaToCoverage ? 0.5 : m.alphaTest || 0;
  d.map = m.map || null;
  d.displacementMap = m.displacementMap || null;
  d.displacementScale = m.displacementScale ?? 1;
  d.displacementBias = m.displacementBias ?? 0;
  d.clipShadows = !!m.clipShadows;
  d.clippingPlanes = m.clippingPlanes || null;
  d.clipIntersection = !!m.clipIntersection;
  return d;
}

function shadowProxies(root, renderer, lightScene) {
  const group = new THREE.Group(), seen = new Set(), vsm = renderer.shadowMap.type === THREE.VSMShadowMap;
  // 只編會用到的那種:點光源用距離材質,平行光/聚光燈用深度材質
  let point = false, dir = false;
  lightScene.traverse((l) => { if (l.isLight && l.castShadow) { if (l.isPointLight) point = true; else dir = true; } });
  if (!point && !dir) return group;
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    const g = o.geometry, kind = o.isSkinnedMesh ? 's' : o.isInstancedMesh ? 'i' : o.isBatchedMesh ? 'b' : 'm';
    const sig = `${kind}|${g.attributes.color ? g.attributes.color.itemSize : 0}|${g.morphAttributes.position ? 1 : 0}|${o.instanceColor || o._colorsTexture ? 1 : 0}`;
    for (const m of [].concat(o.material)) {
      if (!m || !m.visible) continue;
      const key = sig + '|' + m.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      const mats = [];
      if (dir) mats.push(shadowVariant(THREE.MeshDepthMaterial, m, vsm));
      if (point) mats.push(shadowVariant(THREE.MeshDistanceMaterial, m, vsm));
      keep.push(...mats);
      let p;
      if (kind === 'b') { // [interact] BatchedMesh(門扇等):陰影 pass 的深度材質是 batching 變體;每個陰影材質一個只有一個三角形的代理
        const tri = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(g.attributes)) tri.setAttribute(name, new THREE.BufferAttribute(new a.array.constructor(3 * a.itemSize), a.itemSize));
        for (const dm of mats) {
          const b = new THREE.BatchedMesh(1, 3, 0, dm);
          const id = b.addInstance(b.addGeometry(tri));
          if (o._colorsTexture) b.setColorAt(id, new THREE.Color(1, 1, 1));
          b.castShadow = true;
          group.add(b);
        }
        continue;
      }
      if (kind === 's') { p = new THREE.SkinnedMesh(g, mats); p.bind(o.skeleton, o.bindMatrix); }
      else if (kind === 'i') { p = new THREE.InstancedMesh(g, mats, 1); p.instanceColor = o.instanceColor; }
      else p = new THREE.Mesh(g, mats);
      group.add(p);
    }
  });
  return group;
}

// 後處理(EffectComposer 各 pass 的全螢幕材質:Bloom 的 5 種模糊核、合成、輸出…)。
// pass 以「全螢幕三角形 mesh 當場景」渲染(沒有光源、沒有霧);最後一個 pass 直接畫到畫面(影響色彩空間/色調映射參數)
export async function precompilePasses(game) {
  const r = game.renderer, c = game.composer;
  if (!c) return { programs: 0 };
  const before = r.info.programs ? r.info.programs.length : 0;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let geo = null;
  for (const p of c.passes) if (p.fsQuad && p.fsQuad._mesh) { geo = p.fsQuad._mesh.geometry; break; }
  if (!geo) {
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  }
  const todo = [], last = c.passes.findLastIndex((x) => x.enabled);
  c.passes.forEach((p, i) => {
    if (p.isRenderPass || p.scene) return; // 停用中的 pass(低畫質沒有 Bloom)也先編:之後打開不用現場編譯
    if (p.isOutputPass && (p._outputColorSpace !== r.outputColorSpace || p._toneMapping !== r.toneMapping)) {
      // 與 OutputPass.render 相同的 defines 先設好(否則第一幀會因 defines 改變再重編一次)
      p._outputColorSpace = r.outputColorSpace;
      p._toneMapping = r.toneMapping;
      const d = (p.material.defines = {});
      if (THREE.ColorManagement.getTransfer(r.outputColorSpace) === THREE.SRGBTransfer) d.SRGB_TRANSFER = '';
      const tm = { [THREE.LinearToneMapping]: 'LINEAR', [THREE.ReinhardToneMapping]: 'REINHARD', [THREE.CineonToneMapping]: 'CINEON', [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC', [THREE.AgXToneMapping]: 'AGX', [THREE.NeutralToneMapping]: 'NEUTRAL', [THREE.CustomToneMapping]: 'CUSTOM' }[r.toneMapping];
      if (tm) d[tm + '_TONE_MAPPING'] = '';
      p.material.needsUpdate = true;
    }
    const mats = new Set();
    for (const v of Object.values(p)) {
      if (v && v.isMaterial) mats.add(v);
      else if (Array.isArray(v)) for (const x of v) if (x && x.isMaterial) mats.add(x);
    }
    if (p.fsQuad && p.fsQuad.material) mats.add(p.fsQuad.material);
    for (const m of mats) todo.push([new THREE.Mesh(geo, m), c.renderToScreen && i === last ? null : c.readBuffer]);
  });
  const jobs = [];
  let t = performance.now();
  for (const [mesh, target] of todo) {
    if (performance.now() - t > 12) { await yieldNow(); t = performance.now(); }
    const prev = r.getRenderTarget();
    r.setRenderTarget(target);
    try { jobs.push(r.compileAsync(mesh, cam)); } finally { r.setRenderTarget(prev); }
  }
  await Promise.all(jobs);
  return { created: (r.info.programs ? r.info.programs.length : 0) - before };
}

// ---- 讓出主執行緒 ----
// scheduler.yield() 的接續會插在一般工作(Worker 訊息、計時器、輸入)前面:連續分批編譯時,殭屍建模 Worker 的結果
// 要等全部批次做完才處理得到(實測 Worker 1 秒內做完,主執行緒 19 秒才收)。改用 MessageChannel 排一個普通工作
// (先進先出、沒有 setTimeout 巢狀 4ms 下限),其他工作可以插進來
const MC = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, mq = [];
if (MC) MC.port1.onmessage = () => { const f = mq.shift(); if (f) f(); };
export const yieldTask = () => new Promise((r) => { if (MC) { mq.push(r); MC.port2.postMessage(0); } else setTimeout(r, 0); });
export const yieldNow = yieldTask; // 舊名稱

// ---- 分時執行 generator(載入時的世界建構)----
// 每一步跑完若已超過 budget ms 就讓出主執行緒(選單、載入條、Worker 結果照常處理);yield 出 Promise 時等它完成
export async function runSliced(gen, { budget = 12, onStep = null } = {}) {
  let t = performance.now(), r, n = 0;
  while (!(r = gen.next()).done) {
    n++;
    const v = r.value;
    if (v && typeof v.then === 'function') { await v; t = performance.now(); continue; }
    if (performance.now() - t > budget) { onStep?.(n); await yieldTask(); t = performance.now(); }
  }
  return r.value;
}

// ---- GPU 行程節流 ----
// 一次送出大量 shader(每個 program 數十 KB 原始碼)會塞滿命令緩衝區;D3D11 的 shader 翻譯/FXC 很慢,
// 主執行緒會在下一個 GL 呼叫上同步等 GPU 行程消化 → 好幾秒的長任務。每批之後放一個 fence,
// 等 GPU 行程追上再送下一批(fence 狀態查詢不會阻塞:WebGL2 只在工作之間更新)
export function gpuDrain(r, maxMs = 2000) {
  const gl = r.getContext();
  if (typeof gl.fenceSync !== 'function') return yieldTask();
  let s = null;
  try { s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); } catch { s = null; }
  if (!s) return yieldTask();
  const t0 = performance.now();
  return new Promise((res) => {
    const check = () => {
      let done = true;
      try { done = gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED; } catch { /* context lost */ }
      if (done || performance.now() - t0 > maxMs) { try { gl.deleteSync(s); } catch { /* 忽略 */ } res(); } else setTimeout(check, 4);
    };
    setTimeout(check, 0);
  });
}

// 等一組 program 都編譯/連結完成(KHR_parallel_shader_compile 的狀態查詢不阻塞;沒有擴充時 isReady 一律 true)
export function waitReady(programs, onProgress = null, maxMs = 120000) {
  const left = new Set(programs), total = left.size, t0 = performance.now();
  return new Promise((res) => {
    const check = () => {
      for (const p of left) if (!p.isReady || p.isReady()) left.delete(p);
      onProgress?.(total ? 1 - left.size / total : 1);
      if (!left.size || performance.now() - t0 > maxMs) res(total - left.size); else setTimeout(check, 30);
    };
    check();
  });
}

// 每種「物件型態 × 幾何屬性 × 材質」挑一個代表物件(program 只依這些參數而定)
function representatives(root) {
  const reps = [], seen = new Set();
  root.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || !o.material) return;
    const g = o.geometry, a = g ? g.attributes : {};
    // three 的 InstancedMesh / BatchedMesh 沒有自己的 type(都是 'Mesh'):用 is* 旗標分開,否則與同材質的一般網格合併成一個代表 → 實例/batching 變體沒編到
    const kind = o.isSkinnedMesh ? 'S' : o.isInstancedMesh ? 'I' : o.isBatchedMesh ? 'B' : o.type;
    const sig = `${kind}|${a.color ? a.color.itemSize : 0}|${a.normal ? 1 : 0}|${a.tangent ? 1 : 0}|${g && g.morphAttributes.position ? 1 : 0}|${o.instanceColor || o._colorsTexture ? 1 : 0}`;
    let fresh = false;
    for (const m of [].concat(o.material)) if (m && !seen.has(sig + m.uuid)) { seen.add(sig + m.uuid); fresh = true; }
    if (fresh) reps.push(o);
  });
  return reps;
}
// compile() 只需要 traverse / traverseVisible:用假的根節點只編譯指定的幾個物件
const subset = (list) => ({ traverse: (fn) => { for (const o of list) fn(o); }, traverseVisible() {} });
// instanced:一般網格另外也做「InstancedMesh 版」代理(下載的模型零件之後常被做成實例池)
function withInstanced(root) {
  const extra = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry) { const im = new THREE.InstancedMesh(o.geometry, o.material, 1); im.castShadow = o.castShadow; extra.push(im); } });
  return { traverse: (fn) => { root.traverse(fn); for (const o of extra) fn(o); }, updateMatrixWorld() {} };
}

// 場景以外預編譯過的根(殭屍、特效、掉落物、下載的模型…):畫質切換(光源數/陰影)時要一起依新設定重編
const registry = new Map(); // root → { instanced }
export const warmRoots = () => [...registry.keys()];

// 核心:把 srcs 的代表物件在 target 場景的光源/霧狀態下編譯(分批、每批等 GPU 行程追上),回傳建立/用到的 program
// state:{ shadows, type } 只在每次 compile 的同步區段內暫時套到 renderer.shadowMap(畫質切換的預先編譯用)
async function compileSet(game, srcs, { shadows = true, target = game.scene, camera = game.camera, budget = 10, state = null, onProgress = null, per = 2 } = {}) {
  const r = game.renderer, rt = game.composer ? game.composer.readBuffer : null, sm = r.shadowMap;
  const progs = new Set();
  const shadowOn = state ? !!state.shadows : sm.enabled;
  const run = (list, noFog) => {
    const prev = r.getRenderTarget(), fog = target.fog, vis = target.visible, en = sm.enabled, ty = sm.type;
    r.setRenderTarget(rt); // 與 RenderPass 一樣畫進 HDR target(決定 outputColorSpace / toneMapping 參數)
    if (noFog) target.fog = null; // 陰影 pass 以「沒有霧的空場景」渲染(fog 也是 program 參數)
    target.visible = true; // 光源用 traverseVisible 收集:選單時隱藏的手持武器場景要當作可見,光源數才會對
    if (state) { sm.enabled = !!state.shadows; if (state.type != null) sm.type = state.type; }
    try {
      const mats = r.compile(subset(list), camera, target);
      for (const m of mats) {
        const mp = r.properties.get(m), p = mp.currentProgram;
        if (p) progs.add(p);
        // 雙面透明材質 three 會編正反兩個 program(BackSide/FrontSide),currentProgram 只是其中一個:全部都要等、都要初始化
        if (mp.programs) for (const q of mp.programs.values()) progs.add(q);
        // 暫存場景(新畫質設定)編的:compile 會把材質目前的 program 換成新設定的版本。不需要光源的材質(Basic/Sprite/Line…)
        // 在實際繪製時不會發現要換回來,會拿還沒編完的新 program 去畫 → 同步等編譯。標記版本讓下一次繪製重新挑(找到現成的舊 program)
        if (state) mp.__version = -1;
      }
    } finally { r.setRenderTarget(prev); target.fog = fog; target.visible = vis; sm.enabled = en; sm.type = ty; }
  };
  const reps = [], prox = [];
  for (const s of srcs) {
    s.root.updateMatrixWorld?.(true);
    const src = s.instanced ? withInstanced(s.root) : s.root;
    for (const o of representatives(src)) reps.push(o);
    if (shadows && shadowOn) for (const o of shadowProxies(src, r, target).children) prox.push(o);
  }
  const all = reps.length + prox.length;
  let done = 0;
  const chunked = async (list, noFog) => {
    let i = 0;
    while (i < list.length) {
      const t = performance.now();
      while (i < list.length && performance.now() - t < budget) {
        // three 的 compile() 同一次呼叫裡每個材質只編「第一個用到它的物件」的變體:同一批不能有共用材質的物件
        // (例如同一材質的 Mesh 與 BatchedMesh,第二個的 batching 變體會被跳過,之後第一次畫到才現場編)
        const part = [], seenM = new Set();
        while (i < list.length && part.length < per) {
          const ms = [].concat(list[i].material || []);
          if (part.length && ms.some((m) => seenM.has(m))) break;
          for (const m of ms) seenM.add(m);
          part.push(list[i++]);
        }
        run(part, noFog);
        done += part.length;
      }
      onProgress?.(0.6 * Math.min(1, done / Math.max(1, all)));
      await gpuDrain(r); // 等 GPU 行程消化這批 shader 再送下一批(主執行緒不會卡在塞滿的命令緩衝區上)
    }
  };
  await chunked(reps, false);
  await chunked(prox, true);
  await waitReady(progs, (f) => onProgress?.(0.6 + 0.4 * f));
  return progs;
}

// target / camera:用哪個場景的光源與霧、哪台相機(手持武器層請傳 game.weaponScene / game.weaponCamera)
// instanced:一般網格另外也編「InstancedMesh 版」
export async function precompile(game, root, { shadows = true, target = game.scene, camera = game.camera, budget = 10, instanced = false } = {}) {
  const r = game.renderer, t0 = performance.now();
  const before = r.info.programs ? r.info.programs.length : 0;
  if (root && root.isObject3D && root !== game.scene && root !== game.weaponScene && target === game.scene) registry.set(root, { instanced });
  const programs = await compileSet(game, [{ root, instanced }], { shadows, target, camera, budget });
  return { ms: Math.round(performance.now() - t0), programs, created: (r.info.programs ? r.info.programs.length : 0) - before, parallel: !!r.extensions.get('KHR_parallel_shader_compile') };
}

// ---- 畫質切換的預先編譯 ----
// 光源池燈數、陰影開關/類型都是 shader 參數:直接套用會讓所有 program 在下一幀同步重編(D3D11 上數十秒)。
// 先做一個「新設定的光源組」暫存場景(同樣的光源種類/數量/投影,池燈數換成新的),把場景與 registry 裡全部材質
// 依新設定在背景平行編好,全部可用後才真正套用(呼叫端負責)
export async function stageConfig(game, { lights, shadows, type, weapon = false }, onProgress = null) {
  const scene = game.scene, cam = game.camera;
  const st = new THREE.Scene();
  st.fog = scene.fog; st.environment = scene.environment;
  if (scene.environmentRotation && st.environmentRotation) st.environmentRotation.copy(scene.environmentRotation);
  const pool = new Set((game.hospital?.lights?.pool || []).map((p) => p.light));
  let drop = Number.isFinite(lights) ? Math.max(0, pool.size - lights) : 0, add = Number.isFinite(lights) ? Math.max(0, lights - pool.size) : 0;
  scene.updateMatrixWorld(true);
  scene.traverseVisible((o) => {
    if (!o.isLight || !o.layers.test(cam.layers)) return;
    if (pool.has(o) && drop > 0) { drop--; return; }
    const c = o.clone(false);
    c.layers.mask = o.layers.mask;
    st.add(c);
  });
  while (add-- > 0) st.add(new THREE.PointLight(0xffffff, 0, 8, 2));
  const srcs = [{ root: scene, instanced: false }, ...[...registry].map(([root, o]) => ({ root, instanced: o.instanced }))];
  // 編譯期間 GPU 行程很忙,任何同步的 GL 查詢都會排在它後面等(實測 1 秒)。目前設定下還沒「第一次使用」過的 program
  // (例如雙面透明材質的背面版本)先初始化好,編譯途中實際繪製時就不會撞上
  const live = new Set();
  for (const s0 of srcs) s0.root.traverse((o) => { for (const m of [].concat(o.material || [])) { const mp = m && game.renderer.properties.get(m); if (mp?.programs) for (const q of mp.programs.values()) live.add(q); } });
  await initPrograms(live);
  const state = { shadows, type };
  // 遊戲進行中編:每次只編一個物件、每批 4ms,批與批之間等 GPU 行程追上(慢一點,但不搶畫面)
  const progs = await compileSet(game, srcs, { target: st, state, budget: 4, per: 1, onProgress: (f) => onProgress?.(weapon ? f * 0.85 : f) });
  if (weapon && game.weaponScene) { // 陰影類型也是手持武器層 program 的參數
    for (const p of await compileSet(game, [{ root: game.weaponScene }], { target: game.weaponScene, camera: game.weaponCamera, shadows: false, state, onProgress: (f) => onProgress?.(0.85 + 0.15 * f) })) progs.add(p);
  }
  await initPrograms(progs);
  return progs.size;
}
// 畫質切換套用後,不在場景裡的材質(殭屍、特效…)也要標記重算 program(陰影開關不會自動觸發)
export function warmMaterials() {
  const out = new Set();
  for (const root of registry.keys()) root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m) out.add(m); });
  return out;
}

// ---- 環境貼圖(PMREM)----
// 用等距柱狀環境貼圖的材質,three 會在第一次編譯時就地做 PMREM:建立模糊 shader 立刻畫 → 同步等 shader 編譯(D3D11 1~2 秒)。
// 先用同尺寸把 PMREM 的 shader 在背景編好(program 依 defines 共用),之後那次轉換只剩 GPU 畫幾下
export async function warmPMREM(game, roots, { sizes: extra = [] } = {}) {
  const r = game.renderer, sizes = new Set(extra);
  for (const root of roots) root?.traverse?.((o) => {
    for (const m of [].concat(o.material || [])) {
      const t = m?.envMap;
      if (t && (t.mapping === THREE.EquirectangularReflectionMapping || t.mapping === THREE.EquirectangularRefractionMapping) && t.image?.width) sizes.add(t.image.width / 4);
    }
  });
  if (!sizes.size) return 0;
  if (typeof THREE.PMREMGenerator.prototype._setSize !== 'function' || typeof THREE.PMREMGenerator.prototype._allocateTargets !== 'function') return 0; // 不同版本的 three:放棄(照舊同步)
  let pm = null;
  const cam = new THREE.OrthographicCamera(), progs = new Set();
  // PMREM 是畫進 HalfFloat 的 render target(線性、不做色調映射):編譯時也要設成 render target,參數才會一樣(畫到螢幕的版本是另一個 program)
  // 幾何要用 PMREM 自己的 LOD 平面:有沒有 position 屬性是 program key 的一位(空幾何編出來的是另一個 program,
  // 真的轉換時 GGX/模糊著色器還是會在 getUniforms 同步等編譯 300~500ms)
  let target = null;
  const comp = (mat) => { if (!mat) return; const mesh = new THREE.Mesh(pm._lodMeshes?.[0]?.geometry || new THREE.BufferGeometry(), mat), prev = r.getRenderTarget(); r.setRenderTarget(target); try { for (const m of r.compile(mesh, cam)) { const p = r.properties.get(m).currentProgram; if (p) progs.add(p); } } finally { r.setRenderTarget(prev); } };
  // 每個尺寸一個生成器:同一個生成器換尺寸會 dispose 上一組材質(program 跟著被回收)
  for (const s of sizes) {
    pm = new THREE.PMREMGenerator(r);
    pm._setSize(s);
    target = pm._allocateTargets();
    const cm = pm._compileMaterial; pm._compileMaterial = () => {}; // 只要材質;它自己用空幾何編的版本用不到
    try { pm.compileEquirectangularShader(); pm.compileCubemapShader?.(); } finally { pm._compileMaterial = cm; }
    comp(pm._equirectMaterial); comp(pm._cubemapMaterial); comp(pm._blurMaterial); comp(pm._ggxMaterial);
    target.dispose(); pm._pingPongRenderTarget?.dispose(); // 顯存放掉(物件留著;這個生成器不會再拿來轉換)
    keep.push(pm); // 生成器保留(它的材質持有剛編好的 program;dispose 會讓 three 回收)
    await gpuDrain(r);
  }
  await waitReady(progs);
  await initPrograms(progs);
  return progs.size;
}

// 等距柱狀貼圖 → 立方體貼圖(非 PBR 材質或背景用到 equirect 時,three 在 compile/第一次畫時就地轉換):
// 轉換用的 ShaderMaterial 每次新建、第一次會同步等編譯(~0.5 秒)。用假的 renderer 跑一次轉換拿到它的 shader 原始碼,
// 自己建一份同樣的材質非同步編好並留著(program 依原始碼共用,真的轉換時直接用編好的)
export function warmCubeFromEquirect(game) {
  const r = game.renderer;
  let cap = null;
  const fake = {
    isWebGLRenderer: true, coordinateSystem: r.coordinateSystem, reversedDepthBuffer: r.reversedDepthBuffer, autoClear: false, xr: { enabled: false, isPresenting: false },
    state: { buffers: { depth: { getReversed: () => false } } },
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setRenderTarget() {}, clearDepth() {}, clear() {},
    render(s) { cap ??= s; },
  };
  const tex = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const crt = new THREE.WebGLCubeRenderTarget(16);
  try { crt.fromEquirectangularTexture(fake, tex); } catch { cap = null; }
  const src = cap?.material;
  if (!src?.vertexShader || !r.compileAsync) { crt.dispose(); tex.dispose(); return Promise.resolve(0); }
  const mat = new THREE.ShaderMaterial({ name: 'CubemapFromEquirect', uniforms: { tEquirect: { value: tex } }, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader, side: THREE.BackSide, blending: THREE.NoBlending });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), mat);
  keep.push(mat);
  const prev = r.getRenderTarget();
  let p;
  try { r.setRenderTarget(crt); p = r.compileAsync(mesh, new THREE.PerspectiveCamera()); } finally { r.setRenderTarget(prev); }
  return p.then(() => { crt.dispose(); return 1; }, () => 0);
}

// 真的畫一次(畫進 4x4 的離屏 target,玩家看不到):有些成本要到「第一次繪製」才發生——
// ANGLE(Windows/D3D11)依頂點格式產生的 shader 變體、骨骼貼圖、VAO、陰影貼圖裡的第一次繪製。
// objects 會暫時加進場景(不受視錐剔除、會投影)畫一幀後移除。
let warmRT = null;
export function warmDraw(game, objects) {
  const r = game.renderer, scene = game.scene;
  warmRT = warmRT || new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const added = [];
  for (const o of objects) {
    o.traverse((x) => { if (x.isMesh || x.isLine || x.isPoints || x.isSprite) { x.frustumCulled = false; if (x.isMesh) x.castShadow = true; } });
    scene.add(o);
    added.push(o);
  }
  const prev = r.getRenderTarget();
  try { r.setRenderTarget(warmRT); r.render(scene, game.camera); } finally { r.setRenderTarget(prev); for (const o of added) scene.remove(o); }
}

// 整個場景:每種「材質 × 頂點格式」挑一個代表物件,離屏各畫一次(之後轉身、走到別層時不會第一次畫才頓)。
// 分批:每批只畫 batch 個(其餘物件用圖層暫時排除),批與批之間讓出主執行緒並等 GPU 行程追上 → 不會變成一個數秒的長任務。
// 陰影 pass 不畫(陰影深度 program 已預編譯;每批都重畫手電筒陰影太浪費)
const WARM_LAYER = 30;
// 陰影圖先各畫一次(相機只看 WARM_LAYER:主 pass 什麼都不畫,只有陰影 pass)。要在 warmDrawScene 之前:
// 陰影圖還沒建立時,陰影取樣器綁到格式不合的貼圖(ANGLE 報 Mismatch between texture format and sampler type),那次離屏繪製可能沒真的暖到。
// 實測:開始畫面第一幀的慢繪製(玻璃/貼花)變少,但沒完全消失(原因未完全確認)
export async function warmShadows(game) {
  const r = game.renderer, scene = game.scene, cam = game.camera, sm = r.shadowMap, lights = [];
  if (!sm.enabled) return;
  scene.traverse((o) => { if (o.isLight) lights.push(o); });
  warmRT = warmRT || new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  const mask = cam.layers.mask, prev = r.getRenderTarget();
  for (const l of lights) l.layers.enable(WARM_LAYER);
  cam.layers.set(WARM_LAYER);
  sm.needsUpdate = true;
  try { r.setRenderTarget(warmRT); r.render(scene, cam); } finally {
    r.setRenderTarget(prev);
    cam.layers.mask = mask;
    for (const l of lights) l.layers.disable(WARM_LAYER);
  }
  await gpuDrain(r, 3000);
}
export async function warmDrawScene(game, { batch = 12, all = false } = {}) {
  const r = game.renderer, scene = game.scene, cam = game.camera, sm = r.shadowMap;
  // all:每個物件都畫一次(上傳全部幾何緩衝 / VAO;開始畫面前做,第一幀與走進新區域時就不會一次上傳一大堆)
  const reps = all ? [] : representatives(scene), lights = [];
  if (all) scene.traverse((o) => { if ((o.isMesh || o.isLine || o.isPoints || o.isSprite) && o.material && o.geometry) reps.push(o); });
  scene.traverse((o) => { if (o.isLight) lights.push(o); });
  // 跟主畫面的合成 target 一樣用 MSAA(離屏繪製的狀態盡量和真的第一幀相同)
  const ns = game.composer?.renderTarget1?.samples || 0;
  if (warmRT && warmRT.samples !== ns) { warmRT.dispose(); warmRT = null; }
  warmRT = warmRT || new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: ns });
  for (let i = 0; i < reps.length; i += batch) {
    await gpuDrain(r, 1000);
    const list = reps.slice(i, i + batch), saved = [];
    for (const o of list) {
      saved.push([o, 'frustumCulled', o.frustumCulled]);
      o.frustumCulled = false;
      o.layers.enable(WARM_LAYER);
      for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) { saved.push([p, 'visible', false]); p.visible = true; }
    }
    for (const l of lights) l.layers.enable(WARM_LAYER); // 光源也要在相機圖層內,program 的光源數才會一致
    const mask = cam.layers.mask, auto = sm.autoUpdate, prev = r.getRenderTarget();
    cam.layers.set(WARM_LAYER);
    sm.autoUpdate = false;
    try { r.setRenderTarget(warmRT); r.render(scene, cam); } finally {
      r.setRenderTarget(prev);
      sm.autoUpdate = auto;
      cam.layers.mask = mask;
      for (const l of lights) l.layers.disable(WARM_LAYER);
      for (const o of list) o.layers.disable(WARM_LAYER);
      for (let k = saved.length - 1; k >= 0; k--) saved[k][0][saved[k][1]] = saved[k][2];
    }
  }
  return reps.length;
}

// 場景材質用到的貼圖先上傳(開始畫面前,每個工作最多 budget ms;第一幀不會一次上傳全部程式貼圖)
export async function uploadSceneTextures(game, budget = 8) {
  const r = game.renderer, todo = [], seen = new Set();
  const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap', 'specularMap', 'gradientMap'];
  game.scene.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      if (!m) continue;
      for (const k of KEYS) { const t = m[k]; if (t && !seen.has(t) && t.image && !t.isRenderTargetTexture && t.version > 0 && r.properties.get(t).__version !== t.version) { seen.add(t); todo.push(t); } }
      for (const v of Object.values(m.uniforms || {})) { const t = v?.value; if (t?.isTexture && !seen.has(t) && t.image && !t.isRenderTargetTexture && t.version > 0 && r.properties.get(t).__version !== t.version) { seen.add(t); todo.push(t); } }
    }
  });
  let i = 0;
  while (i < todo.length) {
    await gpuDrain(r, 500);
    const t0 = performance.now();
    while (i < todo.length && performance.now() - t0 < budget) { try { r.initTexture(todo[i]); } catch { /* 略過 */ } i++; }
  }
  return todo.length;
}

// program 第一次被使用時,three 還要查詢 uniform/attribute 位置(每個數 ms~十數 ms 的同步呼叫)。
// 在閒置時段先做掉(一直沒有閒置時段時,最多等 200ms 就當一般任務跑),實際畫到時就不會卡。
// 驅動還沒編完的(KHR_parallel_shader_compile)先跳過、下一輪再來,不會在主執行緒上同步等編譯;
// 每個閒置時段做一小批(主執行緒忙、閒置逾時時也照樣做 ~4ms)
export async function initPrograms(programs) {
  let list = [...programs];
  while (list.length) {
    await idle((dl) => {
      const t = performance.now(), budget = dl.didTimeout ? 4 : Math.max(2, dl.timeRemaining() - 2), rest = [];
      for (const p of list) {
        if (performance.now() - t > budget || (p.isReady && !p.isReady())) { rest.push(p); continue; }
        p.getUniforms();
        p.getAttributes();
      }
      list = rest;
    }, 200);
  }
}
