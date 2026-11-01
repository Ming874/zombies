import * as THREE from 'three';
import { OCC } from './wet.js';

// 雨的遮蔽高度圖(俯視深度烘焙):
//  從地圖正上方用正交相機把「不透明」的場景畫成深度(RGBA8 打包),著色器直接取樣這張 render target 解出「雨停高度」
//  (OCC.uOcc,每格 12.5cm):屋頂、雨棚、遮陽篷、車頂、長椅都擋得住雨,車底與屋簷下是乾的,濺水落在道具頂面。
//  - 不經過 CPU 解碼/上傳:烘焙完當幀就能用;CPU 副本用非同步讀回(PBO),查詢時才解那一格(heightAt / exposed)
//  - 頂層挑空('o',建築內)= 玻璃天窗:烘焙時多畫一片只給烘焙用的板子,雨停在屋頂面
//  - 烘焙前(或失敗時)用地圖格子的雨停高度(2m 一格,weather.js buildMasks)當備援
//  - 下載的模型晚一點才進場景 → 資源佇列有進度時節流重烘(選單/暫停/回合休息時才做;一次俯視繪製 + 非同步讀回)
//  - 屋簷滴水點(edges):分幀掃描,每幀最多 ~1.5ms

const N = 1024; // 貼圖邊長(texel)
const K = 1 / 16777216;
export class RainOcclusion {
  constructor(game, L, masks) {
    this.game = game;
    this.L = L;
    this.masks = masks;
    const w = L.W * L.CELL, h = L.H * L.CELL;
    this.S = Math.max(w, h) + 8; // 覆蓋範圍(公尺,正方形)
    this.cx = w / 2; this.cz = h / 2;
    this.x0 = this.cx - this.S / 2; this.z1 = this.cz + this.S / 2;
    const nL = L.levels.length, top = L.levels[nL - 1];
    this.Y0 = top.y + L.LEVEL_H + 16; // 相機高度
    this.near = 0.1;
    this.far = this.Y0 - (L.levels[0].y - 4);
    this.N = N;
    this.cpu = null; // 讀回的 RGBA8(列 0 = z1,與 GL 讀回順序一致)
    this.bakes = 0; // 已讀回的次數
    this.renders = 0; // 已烘焙(GPU)的次數
    this.busy = false;
    this.lastBake = -1e9;
    this.lastDone = -1;
    this.onBake = null; // 讀回完成的回呼(屋簷滴水重新取點)
    // 備援:格子遮罩
    OCC.uOcc.value = masks.rainTex;
    OCC.uOccXf.value.copy(masks.xf);
    OCC.uOccPk.value = 0;
    OCC.uOccOn.value = 1;
    this.mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    this.cam = new THREE.OrthographicCamera(-this.S / 2, this.S / 2, this.S / 2, -this.S / 2, this.near, this.far);
    this.cam.up.set(0, 0, -1); // 影像上方 = 北(-z),右方 = +x
    this.cam.position.set(this.cx, this.Y0, this.cz);
    this.cam.lookAt(this.cx, 0, this.cz);
    this.cam.updateMatrixWorld(true);
    this.cam.layers.enableAll();
    // 烘焙畫的是包住主場景的外層場景:three 的燈光狀態(WebGLRenderState)是「每個場景一份」,而陰影圖用的是
    // 上一次 setupLights 的燈數 → 直接畫主場景會讓下一幀的陰影 pass 用到烘焙時的燈數,死亡/結局時重編一批陰影深度 program
    this.wrap = new THREE.Scene();
    this.wrap.name = 'rain-occlusion-bake';
    this.wrap.overrideMaterial = this.mat;
    // 只在烘焙時加進場景的東西:玻璃天窗板 + 三個看不見的代理(一般/實例/實例+顏色:覆寫材質的 program 變體在載入時就編好,
    // 之後下載的模型進場景重烘時不會在遊戲中途同步編譯)
    this.extra = [];
    const sky = [];
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (L.charAt(nL - 1, c, r) !== 'o' || !L.inBuilding(c, r)) continue;
      const x0 = c * L.CELL, z0 = r * L.CELL, x1 = x0 + L.CELL, z1 = z0 + L.CELL, y = top.y + 0.05;
      sky.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
    }
    if (sky.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(sky, 3));
      g.computeBoundingSphere();
      this.extra.push(new THREE.Mesh(g, this.mat));
    }
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    // 有/沒有法線(vertexNormals 是 program key 的一位)× 一般/實例/實例+顏色/批次/批次+顏色
    const triN = tri.clone();
    triN.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    this.warm = [];
    for (const geo of [tri, triN]) {
      const im = new THREE.InstancedMesh(geo, this.mat, 1), imc = new THREE.InstancedMesh(geo, this.mat, 1);
      imc.setColorAt(0, new THREE.Color());
      this.warm.push(new THREE.Mesh(geo, this.mat), im, imc);
    }
    for (const col of [false, true]) {
      const bm = new THREE.BatchedMesh(1, 3, 0, this.mat);
      bm.addInstance(bm.addGeometry(triN));
      if (col) bm.setColorAt(0, new THREE.Color());
      bm.perObjectFrustumCulled = false;
      this.warm.push(bm);
    }
    for (const o of this.warm) { o.frustumCulled = false; o.position.set(this.cx, 0, this.cz); }
    this.rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
    this.rt.texture.name = 'rain-occlusion';
    this.buf = new Uint8Array(N * N * 4); // 讀回中
    this.edgeJob = null;
  }

  // 不參與遮雨:半透明/鏤空(玻璃、樹葉、貼花、光暈)、自訂著色器(天空、霧片、光柱)、蒙皮(殭屍)、點線精靈
  static skip(o) {
    if (o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh) return true;
    if (!o.isMesh) return false;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (!m || m.transparent || m.alphaTest > 0 || m.isShaderMaterial || m.isRawShaderMaterial || m.visible === false || m.colorWrite === false) return true;
    return false;
  }

  // [perf] 覆寫材質的各種變體(代理物件)先非同步編好:載入時與場景預編譯一起做,之後第一次烘焙不必同步等編譯。
  // 編譯時跟烘焙一樣:外層場景(沒有燈)+ 畫進 this.rt
  precompile() {
    const r = this.game.renderer;
    if (!r?.compileAsync) return Promise.resolve();
    const W = this.wrap, prev = r.getRenderTarget();
    for (const o of this.warm) W.add(o);
    let p;
    try { r.setRenderTarget(this.rt); p = r.compileAsync(W, this.cam); } finally { r.setRenderTarget(prev); for (const o of this.warm) W.remove(o); }
    return p.catch(() => {});
  }

  bake(hide = []) {
    const g = this.game, r = g.renderer, scene = g.scene, H = g.hospital;
    if (!r || !scene || this.busy) return false;
    const t0 = performance.now();
    const forced = [], hid = [];
    // 依玩家位置隱藏的樓層/道具/距離剔除區塊全部打開
    for (const list of [H?.levelGroups, H?.propGroups, H?.chunks]) if (list) for (const o of list) if (!o.visible) { o.visible = true; forced.push(o); }
    // [draws] 靜態批次 / 可推動道具批次 / 壓實的實例池平常只開玩家看得到的區塊(src/map/hospital/batch.js):烘焙時全部打開
    // (這裡畫的是包住主場景的外層場景,主場景的 onBeforeRender 不會被呼叫;下一次主相機渲染會自己重新剔除)
    H?.batches?.showAll?.();
    for (const o of hide) if (o && o.visible) { o.visible = false; hid.push(o); }
    if (g.camera && g.camera.visible) { g.camera.visible = false; hid.push(g.camera); }
    // 燈不參與深度,但燈的數量是 program key 的一部分:烘焙時燈一律不算(圖層清空,子物件照畫),
    // 不然開場、結局、死亡時看得到的燈數不同,同一個覆寫材質會在遊戲中途重編 5~11 個 program
    const lit = this._lit || (this._lit = []);
    scene.traverseVisible((o) => {
      if (o.isLight) { lit.push(o, o.layers.mask); o.layers.mask = 0; return; }
      if (RainOcclusion.skip(o)) { o.visible = false; hid.push(o); }
    });
    const added = this.renders === 0 ? this.extra.concat(this.warm) : this.extra;
    const W = this.wrap, prevParent = scene.parent;
    for (const o of added) W.add(o);
    const prevRT = r.getRenderTarget();
    const sm = r.shadowMap, prevAU = sm.autoUpdate, prevNU = sm.needsUpdate;
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), prevAC = r.autoClear;
    const prevSort = r.sortObjects;
    try {
      sm.autoUpdate = false; sm.needsUpdate = false; // 不要順便重畫陰影圖
      W.add(scene);
      r.sortObjects = false;
      r.setRenderTarget(this.rt);
      r.setClearColor(0xffffff, 1);
      r.autoClear = true;
      r.clear(true, true, false);
      r.render(W, this.cam);
    } finally {
      r.setRenderTarget(prevRT);
      W.remove(scene);
      if (prevParent) prevParent.add(scene);
      sm.autoUpdate = prevAU; sm.needsUpdate = prevNU;
      r.setClearColor(cc, ca); r.autoClear = prevAC; r.sortObjects = prevSort;
      for (let i = 0; i < lit.length; i += 2) lit[i].layers.mask = lit[i + 1];
      lit.length = 0;
      for (const o of hid) o.visible = true;
      for (const o of forced) o.visible = false;
      for (const o of added) W.remove(o);
    }
    this.renders++;
    // 著色器改取樣打包深度:uv = ( (x - x0) / S, (z1 - z) / S ),高度 = (Y0 - near) - 深度 × (far - near)
    OCC.uOcc.value = this.rt.texture;
    OCC.uOccXf.value.set(1 / this.S, -1 / this.S, -this.x0 / this.S, this.z1 / this.S);
    OCC.uOccY.value.set(this.Y0 - this.near, this.far - this.near);
    OCC.uOccPk.value = 1;
    OCC.uOccOn.value = 1;
    this.renderMs = performance.now() - t0;
    // CPU 副本:非同步讀回(不卡主執行緒),完成後才換掉舊的
    this.busy = true;
    const done = (ok) => {
      this.busy = false;
      if (!ok) return;
      const b = this.cpu; this.cpu = this.buf; this.buf = b || new Uint8Array(N * N * 4);
      this.bakes++;
      this.onBake?.(this);
    };
    try {
      if (r.readRenderTargetPixelsAsync) r.readRenderTargetPixelsAsync(this.rt, 0, 0, N, N, this.buf).then(() => done(true), (e) => { console.warn('[weather] 遮雨圖讀回失敗', e); done(false); });
      else { r.readRenderTargetPixels(this.rt, 0, 0, N, N, this.buf); done(true); }
    } catch (e) { console.warn('[weather] 遮雨圖讀回失敗', e); done(false); }
    return true;
  }

  // texel (i, j) 的雨停高度(CPU,讀回的 RGBA8 → three packDepthToRGBA 的反解)
  hIJ(i, j) {
    const b = this.cpu, q = (j * N + i) * 4;
    const d = (b[q] * 65536 + b[q + 1] * 256 + b[q + 2] + b[q + 3] / 255) * K;
    return this.Y0 - (this.near + d * (this.far - this.near));
  }
  // 世界座標 (x,z) 的雨停高度(讀回前用格子遮罩)
  heightAt(x, z) {
    if (this.cpu) {
      const i = Math.floor(((x - this.x0) / this.S) * N), j = Math.floor(((this.z1 - z) / this.S) * N);
      if (i >= 0 && j >= 0 && i < N && j < N) return this.hIJ(i, j);
    }
    const m = this.masks, c = Math.floor(x / this.L.CELL) + 1, r = Math.floor(z / this.L.CELL) + 1;
    return m.rain[Math.min(m.H - 1, Math.max(0, r)) * m.W + Math.min(m.W - 1, Math.max(0, c))];
  }
  exposed(x, y, z) { return y + 0.05 >= this.heightAt(x, z); }

  // 屋簷/雨棚/車頂邊緣的滴水點:相鄰 texel 高度落差 0.5~5m(大樓屋頂邊緣落差更大,少量保留當排水口)
  // 分幀進行:edgesStart() 後每幀 edgesStep(預算 ms),完成時回傳點陣列(否則 null)
  edgesStart(max = 600, seed = 1) {
    if (!this.cpu) return;
    this.edgeJob = { j: 2, cand: [], max, seed };
  }
  edgesStep(budget = 1.5) {
    const job = this.edgeJob;
    if (!job || !this.cpu) return null;
    const st = 2, t0 = performance.now(), cand = job.cand, lo = this.Y0 - this.far + 1;
    while (job.j < N - st * 2 && performance.now() - t0 < budget) {
      const j = job.j;
      for (let i = st * 2; i < N - st * 2; i += st) {
        const y = this.hIJ(i, j);
        if (y < lo) continue;
        for (let k = 0; k < 4; k++) {
          const di = k === 0 ? st : k === 1 ? -st : 0, dj = k === 2 ? st : k === 3 ? -st : 0;
          const yn = this.hIJ(i + di, j + dj), dh = y - yn;
          if (dh < 0.5 || yn < lo) continue;
          if (y - this.hIJ(i + di * 2, j + dj * 2) < 0.4) continue; // 邊緣再往外一格也要是低處(排除細欄杆)
          cand.push(i, j, di, dj, y, yn, dh < 5 ? 1 : 0.06);
          break;
        }
      }
      job.j += st;
    }
    if (job.j < N - st * 2) return null;
    this.edgeJob = null;
    // 依權重抽樣,0.35m 內不重複
    const cell = this.S / N, out = [], taken = new Set(), nC = cand.length / 7;
    let s = job.seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let tries = 0; tries < nC * 3 && out.length < job.max; tries++) {
      const k = Math.floor(rnd() * nC) * 7;
      if (rnd() > cand[k + 6]) continue;
      const i = cand[k], j = cand[k + 1], di = cand[k + 2], dj = cand[k + 3];
      const x = this.x0 + (i + 0.5 + di * 0.3) * cell, z = this.z1 - (j + 0.5 + dj * 0.3) * cell;
      const key = Math.floor(x / 0.35) + ',' + Math.floor(z / 0.35);
      if (taken.has(key)) continue;
      taken.add(key);
      out.push({ x, z, y: cand[k + 4], land: cand[k + 5] });
    }
    return out;
  }

  // 資源佇列(下載的模型)有新進度時節流重烘;都載完後再烘最後一次。
  // 重烘會畫整張地圖(第一次碰到的幾何要上傳 GPU,可達數十 ms):只在選單/暫停/回合間的休息與商店時做,戰鬥中不做
  maybeRebake(t, assets, hide) {
    if (this.busy || this.renders > 6) return;
    const g = this.game;
    if (g.state === 'playing' && !g.paused && !g.shopUIOpen && g.phase !== 'shop' && g.phase !== 'break') return;
    const p = assets ? assets.progress : null;
    const done = p ? p.done + p.failed : 0;
    const idle = assets ? assets.idle : true;
    if (done !== this.lastDone && t - this.lastBake > (idle ? 1.5 : 10) && (idle || this.renders < 5)) {
      this.lastDone = done;
      this.lastBake = t;
      this.bake(hide);
    }
  }

  dispose() {
    for (const o of this.extra.concat(this.warm)) { if (o.isBatchedMesh) o.dispose(); else o.geometry.dispose(); }
    this.rt.dispose();
    this.mat.dispose();
    this.cpu = null; this.edgeJob = null;
  }
}
