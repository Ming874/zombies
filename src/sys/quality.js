import * as THREE from 'three';
import { stageConfig, warmMaterials } from './warmup.js';
import { GpuProfiler } from '../gfx/gpuprof.js';

// ===== 畫質管理 → game.quality =====
// 預設檔 low / medium / high / ultra(首次自動依 GPU 挑選,之後記在 localStorage)。
//   game.quality.setPreset('high')          切換預設檔(清掉個別覆寫)
//   game.quality.set('bloom', false)        個別覆寫一個值
//   game.quality.get('lights')              讀值(光源池數量建議、粒子上限…)
//   const off = game.quality.on('change', (keys, q) => { if (keys.has('lights')) … })   回傳取消訂閱函式
//   game.quality.presets → [{ id, label }];game.quality.preset → 目前預設檔;game.quality.stats → 幀時間統計
// 由這裡直接套用:陰影開關/類型/解析度倍率、Bloom、MSAA、貼圖異向過濾、動態解析度(pixelRatio 0.6~1.5)、
//   GPU 效果(game.gfx:AO/SSR/體積光/TAA)與自動調整(CPU 瓶頸時加 GPU 效果與超取樣、GPU 瓶頸時減)。
// 其他系統自行讀取的建議值:lights(光源池 PointLight 數)、shadowLights(可投影的光源數)、particles(粒子上限)、
//   fog('low'|'medium'|'high' 霧/體積光品質)、decals(貼花密度 0..1)、drawDistance(公尺)。

export const PRESETS = {
  // 陰影類型一律 pcf(低畫質只是關掉陰影):類型是所有 program 的參數,換預設檔時不要連類型也換
  low: { label: '低', shadows: false, shadowType: 'pcf', shadowScale: 0.5, shadowLights: 0, bloom: false, msaa: 0, pixelMin: 0.6, pixelMax: 0.85, lights: 4, particles: 100, fog: 'low', decals: 0.4, anisotropy: 2, drawDistance: 70, flashFar: 12, ao: 0, ssr: 0, vol: 0, taa: false, pcss: false, boostMax: 1 },
  medium: { label: '中', shadows: true, shadowType: 'pcf', shadowScale: 0.5, shadowLights: 1, bloom: true, msaa: 2, pixelMin: 0.6, pixelMax: 1.0, lights: 6, particles: 160, fog: 'medium', decals: 0.7, anisotropy: 4, drawDistance: 90, flashFar: 14, ao: 1, ssr: 1, vol: 1, taa: false, pcss: false, boostMax: 1.1 },
  high: { label: '高', shadows: true, shadowType: 'pcf', shadowScale: 1, shadowLights: 2, bloom: true, msaa: 4, pixelMin: 0.7, pixelMax: 1.25, lights: 8, particles: 240, fog: 'high', decals: 1, anisotropy: 8, drawDistance: 120, flashFar: 18, ao: 2, ssr: 2, vol: 2, taa: true, pcss: false, boostMax: 1.25 },
  ultra: { label: '極致', shadows: true, shadowType: 'pcf', shadowScale: 2, shadowLights: 4, bloom: true, msaa: 4, pixelMin: 0.85, pixelMax: 1.5, lights: 12, particles: 400, fog: 'high', decals: 1, anisotropy: 16, drawDistance: 150, flashFar: 28, ao: 3, ssr: 3, vol: 3, taa: true, pcss: true, boostMax: 1.5 },
};
// [gpu] ao/ssr/vol:0 關、1~3 等級(src/gfx/pipeline.js LEVELS);taa:時間反鋸齒;pcss:手電筒/月光的柔和半影;
//   boostMax:CPU 是瓶頸、GPU 有餘裕時渲染倍率最多拉到 dpr × boostMax(超取樣)。全部只改 uniform / RT 尺寸,不重編 shader
const COMMON = { dynamicRes: true, targetFps: 60 };
// 會改變 shader program 參數的設定:先在背景依新設定編好全部材質,編完才真正套用(見 syncProgramKeys)
const PROGRAM_KEYS = ['shadows', 'shadowType', 'lights'];
const KEY = 'hz.quality.v1';
const SHADOW_TYPES = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const now = () => performance.now();

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 隱私模式 */ } }

// 「套用畫質中…」小提示(注入 DOM;不擋滑鼠)
function toast() {
  if (typeof document === 'undefined') return { set() {}, done() {} };
  let el = document.getElementById('hzq');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hzq';
    el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2000;pointer-events:none;padding:6px 14px;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.2);color:#e6e2d0;font:13px/1.4 "Microsoft JhengHei","PingFang TC",system-ui,sans-serif;letter-spacing:1px;transition:opacity .4s';
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  el.textContent = '套用畫質中…';
  return {
    set(f) { el.textContent = `套用畫質中… ${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`; },
    done() { el.style.opacity = '0'; setTimeout(() => { if (el.style.opacity === '0') el.remove(); }, 500); },
  };
}

// 依 GPU 字串粗估(只挑 low/medium/high;ultra 讓玩家自己開)
export function detectPreset(gl) {
  let s = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    s = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '').toLowerCase();
  } catch { /* 拿不到就用其他線索 */ }
  const nav = navigator, mobile = /android|iphone|ipad|mobile/i.test(nav.userAgent || '');
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(s)) return { preset: 'low', gpu: s };
  if (mobile) return { preset: 'low', gpu: s };
  if (/rtx|gtx 1[06-9]|gtx 16|radeon rx|rx [5-9]\d{2,3}|arc a[57]|apple m[1-9] (pro|max|ultra)|apple m[2-9]/.test(s)) return { preset: 'high', gpu: s };
  if (/intel|uhd|iris|mali|adreno|apple gpu|vega [3-8]\b|radeon\(tm\) graphics|mx\d{3}/.test(s)) return { preset: 'medium', gpu: s };
  if (/nvidia|geforce|radeon|amd/.test(s)) return { preset: 'high', gpu: s };
  return { preset: (nav.hardwareConcurrency || 4) >= 8 && (nav.deviceMemory || 8) >= 8 ? 'high' : 'medium', gpu: s };
}

// GPU 計時:src/gfx/gpuprof.js(EXT_disjoint_timer_query_webgl2;沒有時 gpuMs = null;F3 面板開著時逐 pass 分段)

// 固定長度的幀時間統計
class Ring {
  constructor(n = 240) { this.a = new Float32Array(n); this.n = 0; this.i = 0; }
  push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.a.length; if (this.n < this.a.length) this.n++; }
  last(k = 1) { return this.a[(this.i - k + this.a.length * 2) % this.a.length]; }
  avg(k = this.n) { k = Math.min(k, this.n); let s = 0; for (let j = 1; j <= k; j++) s += this.last(j); return k ? s / k : 0; }
  max(k = this.n) { k = Math.min(k, this.n); let m = 0; for (let j = 1; j <= k; j++) m = Math.max(m, this.last(j)); return m; }
  pct(p, k = this.n) {
    k = Math.min(k, this.n);
    if (!k) return 0;
    const t = []; for (let j = 1; j <= k; j++) t.push(this.last(j));
    t.sort((x, y) => x - y);
    return t[Math.min(k - 1, Math.floor(p * k))];
  }
}

export class Quality {
  constructor(game) {
    this.game = game;
    const gl = game.renderer.getContext();
    this.gpu = new GpuProfiler(gl);
    this.detected = detectPreset(gl);
    const saved = load();
    this.preset = saved && PRESETS[saved.preset] ? saved.preset : this.detected.preset;
    this.over = (saved && saved.over) || {};
    this.live = {}; // PROGRAM_KEYS 目前真正套用中的值(切換時在背景編譯完才換)
    for (const k of PROGRAM_KEYS) this.live[k] = this.want(k);
    this.staging = null;
    this.listeners = new Set();
    this.frame = new Ring(240); // rAF 間隔
    this.cpu = new Ring(240); // update + render 的 JS 時間
    this.cpuR = new Ring(240); // 其中 render(送出 draw call)的 JS 時間
    this.gpuMs = new Ring(240);
    this.gpuA = new Ring(240); // 場景繪製段的 GPU 計時(CPU 送 draw call 慢時會含 GPU 等待的空檔)
    this.gpuB = new Ring(240); // 場景之後的全螢幕 pass(準確的 GPU 工作量)
    this.sub = new Ring(240); // 場景繪製的 JS 時間(送出 draw call)
    this.level = 0; // 自動調整的階:<0 降解析度(最低再降效果),0 預設,1 效果 +1,2.. 超取樣
    this.probe = null;
    this.bound = '';
    this.dpr = window.devicePixelRatio || 1;
    this.scale = this.startScale();
    this.lastChange = now();
    this.upBlock = 4000; // 往上試探的冷卻(超載後加倍,最多 30 秒)
    this.overT = 0;
    this.applied = {};
    this.apply(true);
    window.addEventListener('resize', () => { this.dpr = window.devicePixelRatio || 1; this.setScale(Math.min(this.scale, this.maxScale()), true); });
  }

  get presets() { return Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })); }
  // get:目前生效的值(會改 shader 的設定在背景編譯完成前仍回傳舊值);want:玩家選的值
  get(key) { return key in this.live ? this.live[key] : this.want(key); }
  want(key) { return key in this.over ? this.over[key] : key in PRESETS[this.preset] ? PRESETS[this.preset][key] : COMMON[key]; }
  get pending() { return !!this.staging; }
  get pixelRatio() { return this.scale; }
  on(ev, fn) { if (ev === 'change') { this.listeners.add(fn); return () => this.listeners.delete(fn); } return () => {}; }
  off(ev, fn) { this.listeners.delete(fn); }

  setPreset(name) {
    if (!PRESETS[name]) return false;
    const before = this.snapshot();
    this.preset = name;
    this.over = {};
    this.level = 0;
    this.probe = null;
    this.scale = this.startScale();
    this.commit(before);
    this.applyGfx(); // 同一個預設檔再選一次也要清掉自動調整加上去的效果等級
    return true;
  }
  set(key, value) {
    const before = this.snapshot();
    if (value === undefined || value === null) delete this.over[key];
    else this.over[key] = value;
    this.commit(before);
  }
  snapshot() { const o = {}; for (const k of Object.keys({ ...PRESETS.high, ...COMMON })) o[k] = this.get(k); return o; }
  commit(before) {
    save({ preset: this.preset, over: this.over });
    const after = this.snapshot(), keys = new Set();
    for (const k in after) if (after[k] !== before[k]) keys.add(k);
    this.apply(false, keys);
    this.notify(keys);
    this.syncProgramKeys();
  }
  notify(keys) { if (keys.size) for (const fn of this.listeners) { try { fn(keys, this); } catch (e) { console.error(e); } } }

  // 光源池燈數、陰影開關/類型:直接套用 → 所有 program 下一幀同步重編(D3D11 上數十秒的凍結)。
  // 改成先用新設定的光源組在背景平行編好場景與 registry 的全部材質(warmup.stageConfig),編完才一次切換;
  // 編譯期間遊戲照常用舊設定跑,畫面上方顯示「套用畫質中…」。編譯中又改設定:這次完成後再補一輪
  syncProgramKeys() {
    const want = {};
    let diff = false;
    for (const k of PROGRAM_KEYS) { want[k] = this.want(k); if (want[k] !== this.live[k]) diff = true; }
    if (!diff) return;
    if (this.staging) { this.restage = true; return; }
    const g = this.game, swap = () => {
      const before = this.snapshot();
      Object.assign(this.live, want);
      const after = this.snapshot(), keys = new Set();
      for (const k in after) if (after[k] !== before[k]) keys.add(k);
      this.apply(false, keys);
      this.notify(keys);
    };
    // 還沒開始預編譯(載入早期)或沒有渲染器狀態:直接套用,開機預編譯會用新設定
    if (!g.warmed || !g.composer) { swap(); return; }
    const t0 = now(), ui = toast();
    const type = SHADOW_TYPES[want.shadowType] ?? THREE.PCFShadowMap;
    this.staging = stageConfig(g, { lights: Math.max(0, Math.min(16, want.lights | 0)), shadows: !!want.shadows, type, weapon: type !== g.renderer.shadowMap.type }, (f) => ui.set(f))
      .catch((e) => console.warn('[quality] 預先編譯失敗,直接套用', e))
      .then(() => { swap(); this.lastStageMs = Math.round(now() - t0); performance.measure?.('hz:quality-stage', { start: t0 }); })
      .finally(() => { ui.done(); this.staging = null; if (this.restage) { this.restage = false; this.syncProgramKeys(); } });
  }

  minScale() { return this.get('pixelMin'); }
  maxScale() { return Math.max(this.baseMax(), this.boostCap()); }
  baseMax() { return Math.max(this.minScale(), Math.min(this.get('pixelMax'), Math.max(1, this.dpr) * (this.preset === 'ultra' ? 1.5 : 1))); }
  boostCap() { return Math.min(2, Math.max(this.baseMax(), Math.max(1, this.dpr) * (this.get('boostMax') || 1))); }
  startScale() { return clamp(Math.min(this.dpr, this.get('pixelMax')), this.get('pixelMin'), this.baseMax()); }

  setScale(s, force = false) {
    s = clamp(Math.round(s * 20) / 20, this.minScale(), this.maxScale());
    if (!force && Math.abs(s - this.scale) < 0.01) return;
    this.scale = s;
    const g = this.game;
    g.renderer.setPixelRatio(s);
    if (g.composer) g.composer.setPixelRatio(s);
    this.lastChange = now();
  }

  // 套用到渲染器/後處理/場景;first = 第一次(在第一幀前,不用重編 shader)
  /** 所有投影光源下一幀重畫陰影圖(含 autoUpdate=false 的靜態陰影) */
  refreshShadows() {
    this.game.scene?.traverse((o) => { if (o.isLight && o.shadow && o.castShadow) o.shadow.needsUpdate = true; });
  }

  apply(first = false, keys = null) {
    const g = this.game, r = g.renderer, has = (k) => first || !keys || keys.has(k);
    if (has('shadows') || has('shadowType')) {
      const en = !!this.get('shadows'), type = SHADOW_TYPES[this.get('shadowType')] ?? THREE.PCFShadowMap;
      if (r.shadowMap.enabled !== en || r.shadowMap.type !== type) {
        r.shadowMap.enabled = en;
        r.shadowMap.type = type;
        r.shadowMap.needsUpdate = true;
        if (!first) this.recompile();
        this.refreshShadows(); // 靜態陰影(月光 autoUpdate=false)也要用新類型重畫,否則陰影圖格式和 shader 的 sampler 對不上
      }
    }
    if (has('shadowScale')) {
      const k = this.get('shadowScale');
      g.scene.traverse((o) => {
        if (!o.isLight || !o.shadow || !o.castShadow) return;
        const base = o.userData.baseShadowSize ?? (o.userData.baseShadowSize = o.shadow.mapSize.x);
        const s = clamp(Math.round(base * k), 128, 4096);
        if (o.shadow.mapSize.x !== s) {
          o.shadow.mapSize.set(s, s);
          if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
          // 陰影圖丟掉後要標記重畫:autoUpdate=false 的靜態陰影(月光)不會自己重建,shader 會綁到格式不符的空貼圖,
          // 所有受光物體繪製失敗(GL_INVALID_OPERATION,畫面只剩自發光的燈具)
          o.shadow.needsUpdate = true;
        }
      });
    }
    // 手電筒陰影範圍(three 每幀把 spot 陰影相機 far 設成 light.distance=30m → 30m 內所有投影物件每幀重畫)。
    // 只在更新陰影矩陣時暫時換成較短的距離,光照範圍不變
    if (has('flashFar')) {
      const sh = g.player?.flashlight?.shadow;
      if (sh) {
        sh.userData = sh.userData || {};
        sh.userData.far = this.get('flashFar');
        if (!sh.userData.wrapped) {
          sh.userData.wrapped = true;
          const orig = sh.updateMatrices.bind(sh);
          sh.updateMatrices = (light) => { const d = light.distance; light.distance = Math.min(d || Infinity, sh.userData.far || d); try { orig(light); } finally { light.distance = d; } };
        }
      }
    }
    if (has('bloom') && g.bloom) g.bloom.enabled = !!this.get('bloom');
    if (has('msaa') && g.composer && !g.gfx) {
      const n = this.get('msaa');
      for (const rt of [g.composer.renderTarget1, g.composer.renderTarget2]) if (rt && rt.samples !== n) { rt.samples = n; rt.dispose(); }
    }
    if (g.gfx && (first || ['ao', 'ssr', 'vol', 'taa', 'msaa', 'pcss'].some(has))) this.applyGfx();
    if (has('anisotropy')) {
      const a = Math.min(this.get('anisotropy'), r.capabilities.getMaxAnisotropy());
      const seen = new Set(), todo = [];
      g.scene.traverse((o) => {
        for (const m of [].concat(o.material || [])) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
            const t = m[k];
            if (!t || seen.has(t) || t.anisotropy === a || t.isRenderTargetTexture) continue;
            seen.add(t);
            todo.push(t);
          }
        }
      });
      // 異向過濾是取樣參數:已上傳的貼圖直接改 GL 參數(重新上傳上百張 1K 貼圖會頓好幾百 ms);還沒上傳的上傳時就會用新值
      const ext = r.extensions.get('EXT_texture_filter_anisotropic'), gl = r.getContext();
      for (const t of todo) {
        t.anisotropy = a;
        const tp = r.properties.get(t), wt = tp.__webglTexture;
        if (!wt || !ext) continue;
        const target = t.isCubeTexture ? gl.TEXTURE_CUBE_MAP : t.isData3DTexture ? gl.TEXTURE_3D : t.isDataArrayTexture || t.isCompressedArrayTexture ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
        r.state.bindTexture(target, wt);
        gl.texParameterf(target, ext.TEXTURE_MAX_ANISOTROPY_EXT, a);
        tp.__currentAnisotropy = a;
      }
    }
    if (!first && has('dynamicRes') && !this.get('dynamicRes') && this.level !== 0) { this.level = 0; this.probe = null; this.applyGfx(); } // 關掉自動調整:回到預設檔的效果等級
    if (first || has('pixelMin') || has('pixelMax') || has('dynamicRes')) this.setScale(this.get('dynamicRes') ? this.scale : this.startScale(), true);
  }

  // 陰影開關變了:所有材質要重編(設定頁切換時會頓一下,屬正常)
  recompile() {
    const all = warmMaterials();
    this.game.scene.traverse((o) => { for (const m of [].concat(o.material || [])) all.add(m); });
    for (const m of all) m.needsUpdate = true; // 已在背景依新設定編好:這裡只是讓 three 換用(找到現成 program,不會再編)
  }

  // ---- 每幀:由主迴圈呼叫 ----
  beginGpu() { this.gpu.begin(); }
  endGpu() { this.gpu.end(); }
  // frameMs = rAF 間隔,cpuMs = 本幀 update + render 的 JS 時間,renderMs = 其中 render 的部分
  sample(frameMs, cpuMs, renderMs = 0) {
    this.frame.push(frameMs);
    this.cpu.push(cpuMs);
    this.cpuR.push(renderMs);
    this.sub.push(this.game.gfx?.submitMs ?? renderMs);
    if (this.gpu.ms != null) { this.gpuMs.push(this.gpu.ms); this.gpuA.push(this.gpu.msA); this.gpuB.push(this.gpu.ms - this.gpu.msA); }
    if (this.get('dynamicRes')) this.control();
  }

  // GPU 效果:預設檔的等級 + 自動調整的 boost(src/gfx/pipeline.js)
  applyGfx() {
    const g = this.game;
    if (!g.gfx) return;
    const boost = this.level >= 1 ? 1 : this.level <= -3 ? -1 : 0;
    g.gfx.configure({ ao: this.get('ao') | 0, ssr: this.get('ssr') | 0, vol: this.get('vol') | 0, taa: !!this.get('taa'), msaa: this.get('msaa') | 0, boost });
    // composer 緩衝:GfxPass 有效果時手持武器在它的多重取樣輸出裡畫 → 之後的全螢幕 pass 不需要 MSAA
    const n = g.gfx.any ? 0 : this.get('msaa') | 0;
    if (g.composer) for (const rt of [g.composer.renderTarget1, g.composer.renderTarget2]) if (rt && rt.samples !== n) { rt.samples = n; rt.dispose(); }
    g.pcss?.(!!this.get('pcss'));
  }

  // 自動調整(取代舊的只看 GPU 計時的動態解析度)。先分辨瓶頸:
  //   GPU 計時在 CPU 送 draw call 很慢時會把「GPU 等 CPU」的空檔也算進去(實測 scene 段 ≈ CPU render 時間,GPU 引擎只忙 10~30%)
  //   → 只有「場景段明顯比 JS 送出時間長」(GPU 真的追不上)且 GPU 總時間 ≈ 幀時間,才算 GPU 瓶頸;
  //   幀時間 > 目標但不是 GPU 瓶頸 = CPU 瓶頸:GPU 有空 → 往上加(效果等級 → 超取樣),加完觀察 2.5 秒,幀時間變差就退回並延長冷卻;
  //   GPU 瓶頸 → 往下減(先收回超取樣與效果,再降解析度)。背景編譯中(staging)不動。
  control() {
    const t = now(), budget = 1000 / this.get('targetFps');
    if (this.staging || this.frame.n < 40 || t - this.lastChange < 900) return;
    const frame = this.frame.avg(40), cpu = this.cpu.avg(40);
    const hasGpu = this.gpu.ms != null && this.gpuA.n >= 30;
    const A = hasGpu ? this.gpuA.avg(40) : null, B = hasGpu ? this.gpuB.avg(40) : null, sub = this.sub.avg(40);
    const gpuBound = hasGpu ? A + B > frame * 0.86 && A > sub * 1.3 + 1.2 : frame > budget * 1.18 && cpu < frame * 0.62;
    const cpuBound = !gpuBound && frame > budget * 1.05;
    this.bound = gpuBound ? 'gpu' : cpuBound ? 'cpu' : 'ok';
    const P = this.probe;
    if (P) {
      const worse = t - P.t > 2500 && frame > P.frame * 1.06 + 0.6 && cpu < P.cpu * 1.05 + 0.4;
      if (gpuBound || worse) { // 加了反而變慢:退回、延長冷卻
        this.probe = null;
        this.upBlock = Math.min(60000, this.upBlock * 2);
        this.step(-1);
      } else if (t - P.t > 2500) { this.probe = null; this.upBlock = Math.max(5000, this.upBlock * 0.8); }
      return;
    }
    if (gpuBound) {
      if (!this.overT) this.overT = t;
      if (t - this.overT > 400) { this.overT = 0; this.upBlock = Math.min(60000, this.upBlock * 2); this.step(-1); }
      return;
    }
    this.overT = 0;
    if (t - this.lastChange < this.upBlock) return;
    // 往上:CPU 瓶頸(GPU 在等)或有明確的 GPU 餘裕
    const room = cpuBound || (hasGpu ? A + B < budget * 0.6 : frame < budget * 1.04 && this.frame.max(60) < budget * 1.3);
    if (room && this.step(+1)) this.probe = { t, frame, cpu };
  }

  // 自動調整的階 → { 渲染倍率, 效果 boost };level < 0 降解析度(≤ -3 時效果也降一級),1 效果 +1,之後每階 +0.125 倍率到 boostCap
  levelState(lv) {
    const min = this.minScale(), base = this.startScale(), cap = this.boostCap();
    const fx = this.get('ao') > 0 || this.get('ssr') > 0 || this.get('vol') > 0;
    if (lv < 0) return { scale: Math.max(min, base * Math.pow(0.88, -lv)) };
    if (lv === 0 || (lv === 1 && fx)) return { scale: base };
    return { scale: Math.min(cap, base + 0.125 * (lv - (fx ? 1 : 0))) };
  }
  // 自動調整走一階;回傳是否真的有變(到頂/到底就不動)
  step(d) {
    const lv = this.level + d;
    if (lv < -5 || lv > 8) return false;
    const fx = this.get('ao') > 0 || this.get('ssr') > 0 || this.get('vol') > 0;
    const s = this.levelState(lv).scale;
    const fxChange = fx && ((this.level < 1) !== (lv < 1) || (this.level <= -3) !== (lv <= -3));
    if (!fxChange && Math.abs(s - this.scale) < 0.01) return false;
    this.level = lv;
    this.setScale(s, true);
    this.applyGfx();
    this.lastChange = now();
    return true;
  }

  get stats() {
    const f = this.frame;
    const avg = f.avg(120) || 16.7;
    return {
      fps: 1000 / avg, frameMs: avg, frameP99: f.pct(0.99, 240), frameMax: f.max(240),
      cpuMs: this.cpu.avg(60), cpuRenderMs: this.cpuR.avg(60), gpuMs: this.gpu.ext ? (this.gpuMs.n ? this.gpuMs.avg(60) : null) : null, gpuTimer: !!this.gpu.ext,
      pixelRatio: this.scale, width: this.game.renderer.domElement.width, height: this.game.renderer.domElement.height,
      preset: this.preset, dynamicRes: !!this.get('dynamicRes'),
      gpuSceneMs: this.gpuA.n ? this.gpuA.avg(60) : null, gpuPostMs: this.gpuB.n ? this.gpuB.avg(60) : null, submitMs: this.sub.avg(60),
      bound: this.bound, level: this.level, gfx: this.game.gfx?.stats || null,
    };
  }
}
