import { parseLayout } from './levels.js';

// 多樓層世界(引擎核心):碰撞、地面高度、3D 射線、導航。只透過 levels.js 的 parseLayout() 讀地圖。
// 座標:x 東、z 南、y 上(公尺);格子 2m;B1/1F/2F/3F 的地面 y = -4.2/0/4.2/8.4。
// 實體以腳底高度 pos.y 判斷站在哪個面(平地/樓梯坡面/低矮道具頂)。相鄰位置的地面必須連續(|Δ| ≤ STEP)
// 才能通行,所以樓梯開口 %、挑空 o、建築外空中 _ 只能經由樓梯本身上下,不會掉下去。
// 熱路徑(resolve / rayDistance / flowDir / updateFlow)全部用型別陣列與純量運算,不配置新物件。

const STEP = 0.5; // 可直接跨上/跨下的地面高度差
const BOX_STEP = 0.46; // 道具盒頂 ≤ 腳底 + 此值時可直接踏上(不擋):路緣石、花台、矮階、木箱都能直接走上去(玩家與殭屍一樣)
const BODY_H = 1.75; // 預設身高(道具盒阻擋判定)
const FINE = 0.5; // 導航細格(m)
const SUB = 4; // 每格 2m = 4 個導航細格
const NAV_R = 0.4; // 導航障礙膨脹半徑
const NAV_STEP = 0.45; // 導航相鄰節點允許的高度差
const DOOR_H = 2.4; // 門楣下緣(門口格 2.4m 以上是牆)
const FENCE_H = 2.2; // 鐵欄杆/圍籬的高度(只擋移動)
const INF = 0xffff;
const MAX_SEEDS = 16;
// 'X' 大型障礙物若沒有任何道具碰撞盒(道具代理未登記)時補上的碰撞高度
export const OBSTACLE_H = {
  car: 1.5, police_car: 1.5, ambulance: 2.6, ambulance_crash: 2.6, hearse: 1.6, dumpster: 1.4, generator: 1.6,
  incinerator: 3, fountain: 1.2, statue: 3.2, water_tower: 4, ac_unit: 1.4, barricade: 1.1,
};
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const CDX = Float32Array.from({ length: 16 }, (_, a) => Math.cos((a * Math.PI) / 8)), CDZ = Float32Array.from({ length: 16 }, (_, a) => Math.sin((a * Math.PI) / 8));

// 射線與 AABB(slab 法);回傳進入距離或 Infinity
function boxRay(b, ox, oy, oz, dx, dy, dz, tmax) {
  let t0 = 0, t1 = tmax, a, c, s;
  if (dx > -1e-12 && dx < 1e-12) { if (ox < b.minX || ox > b.maxX) return Infinity; }
  else { a = (b.minX - ox) / dx; c = (b.maxX - ox) / dx; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  if (dz > -1e-12 && dz < 1e-12) { if (oz < b.minZ || oz > b.maxZ) return Infinity; }
  else { a = (b.minZ - oz) / dz; c = (b.maxZ - oz) / dz; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  if (dy > -1e-12 && dy < 1e-12) { if (oy < b.minY || oy > b.maxY) return Infinity; }
  else { a = (b.minY - oy) / dy; c = (b.maxY - oy) / dy; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return Infinity; }
  return t0;
}

// Dial 最短路(稠密網格:同層 8 方向位元 + 少數跨層邊;邊權 直 2 / 斜 3,四個循環桶)。
// 可分段執行:st = [目前距離 d, 待處理數 pending],每次最多處理 budget 個節點,做完回傳 true。
// 獨立函式讓 JIT 只看到型別陣列(單型),內層迴圈完全展開
function dialStart(dist, Q, qh, qt, seeds, ns, st) {
  dist.fill(INF);
  qh.fill(0);
  qt.fill(0);
  for (let q = 0; q < ns; q++) { dist[seeds[q]] = 0; Q[qt[0]++] = seeds[q]; }
  st[0] = 0;
  st[1] = ns;
}
function dialStep(G, dist, Q, qh, qt, info, DOFF, xe, st, budget) {
  let d = st[0], pending = st[1];
  const o0 = DOFF[0], o1 = DOFF[1], o2 = DOFF[2], o3 = DOFF[3], o4 = DOFF[4], o5 = DOFF[5], o6 = DOFF[6], o7 = DOFF[7];
  for (; pending > 0; d++) {
    const b = d & 3, base = b * G;
    const d2 = d + 2, d3 = d + 3, k2 = d2 & 3, k3 = d3 & 3, b2 = k2 * G, b3 = k3 * G;
    while (qh[b] < qt[b]) {
      if (--budget < 0) { st[0] = d; st[1] = pending; return false; }
      const n = Q[base + qh[b]++];
      pending--;
      if (dist[n] !== d) continue;
      const inf = info[n];
      let m;
      if (inf & 1 && d2 < dist[(m = n + o0)]) { dist[m] = d2; Q[b2 + qt[k2]++] = m; pending++; }
      if (inf & 2 && d2 < dist[(m = n + o1)]) { dist[m] = d2; Q[b2 + qt[k2]++] = m; pending++; }
      if (inf & 4 && d2 < dist[(m = n + o2)]) { dist[m] = d2; Q[b2 + qt[k2]++] = m; pending++; }
      if (inf & 8 && d2 < dist[(m = n + o3)]) { dist[m] = d2; Q[b2 + qt[k2]++] = m; pending++; }
      if (inf & 16 && d3 < dist[(m = n + o4)]) { dist[m] = d3; Q[b3 + qt[k3]++] = m; pending++; }
      if (inf & 32 && d3 < dist[(m = n + o5)]) { dist[m] = d3; Q[b3 + qt[k3]++] = m; pending++; }
      if (inf & 64 && d3 < dist[(m = n + o6)]) { dist[m] = d3; Q[b3 + qt[k3]++] = m; pending++; }
      if (inf & 128 && d3 < dist[(m = n + o7)]) { dist[m] = d3; Q[b3 + qt[k3]++] = m; pending++; }
      if (inf & 256) {
        const xs = xe.get(n);
        for (let k = 0; k < xs.length; k++) {
          const v = xs[k], mm = v >> 2, nd = d + (v & 3);
          if (nd < dist[mm]) { dist[mm] = nd; const bb = nd & 3; Q[bb * G + qt[bb]++] = mm; pending++; }
        }
      }
    }
    qh[b] = qt[b] = 0;
  }
  st[0] = d;
  st[1] = 0;
  return true;
}

export class World {
  // L:parseLayout() 格式的地圖資料(省略 = 目前的地圖)。所有碰撞/導航/出生點都只由 L 推導,換地圖時重建一個新的 World 即可
  constructor(L = parseLayout()) {
    this.layout = L;
    this.spawns = L.spawns;
    this.start = L.start;
    this.shop = L.shop;
    this.supplies = L.supplies;
    this.stairs = L.stairs;
    const W = (this.W = L.W), H = (this.H = L.H), NL = (this.NL = L.levels.length);
    const WH = (this.WH = W * H);
    this.CELL = L.CELL;
    this.sizeX = W * L.CELL;
    this.sizeZ = H * L.CELL;
    this.STEP = STEP;
    this.BOX_STEP = BOX_STEP;
    this.DOOR_H = DOOR_H;
    this.FENCE_H = FENCE_H;
    this.lvY = Float32Array.from(L.levels, (l) => l.y);

    // 樓梯參數(型別陣列)
    const S = L.stairs, ns = S.length;
    this.sAx = new Uint8Array(ns); // 1 = 沿 z
    this.sLo = new Float32Array(ns); // 低端座標
    this.sInv = new Float32Array(ns); // 1 / (高端 - 低端)
    this.sY0 = new Float32Array(ns);
    this.sDY = new Float32Array(ns);
    this.sLower = new Int8Array(ns);
    this.sN = new Int16Array(ns); // 實體踏階數(stepOffset 用)
    this.sRamp = new Uint8Array(ns); // 1 = 平順坡道(救護車坡道),沒有踏階
    S.forEach((s, k) => {
      this.sAx[k] = s.axis === 'z' ? 1 : 0;
      this.sLo[k] = s.lowAt;
      this.sInv[k] = 1 / (s.highAt - s.lowAt);
      this.sY0[k] = s.yLow;
      this.sDY[k] = s.yHigh - s.yLow;
      this.sLower[k] = s.lower;
      this.sN[k] = Math.max(4, Math.round((s.yHigh - s.yLow) / 0.175));
      this.sRamp[k] = L.zones.find((z) => z.id === s.zone)?.theme === 'ramp' ? 1 : 0;
    });

    // 可站面:walk[li*WH + idx] = -1 不可站 / 0 平地 / k+1 第 k 座樓梯坡面(在樓梯的下層)
    const walk = (this.walk = new Int8Array(NL * WH).fill(-1));
    const colStair = (this.colStair = new Int8Array(WH * 2).fill(-1)); // 每格最多兩座樓梯上下疊
    for (let li = 0; li < NL; li++) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const f = L.flagsAt(li, c, r);
      if (f & L.F.WALK && !(f & L.F.STAIR)) walk[li * WH + r * W + c] = 0;
    }
    S.forEach((s, k) => {
      for (let r = s.r0; r <= s.r1; r++) for (let c = s.c0; c <= s.c1; c++) {
        if (L.charAt(s.lower, c, r) !== s.dir) continue;
        const idx = r * W + c;
        walk[s.lower * WH + idx] = k + 1;
        if (colStair[idx * 2] < 0) colStair[idx * 2] = k;
        else colStair[idx * 2 + 1] = k;
      }
    });
    this._buildColumns();

    // 道具碰撞盒與格索引
    this.boxes = [];
    this.boxGrid = Array.from({ length: WH }, () => []);
    this._stamp = 0;
    this._pl = 0; // _pick 選到的樓層
    this.navM = 0; // 導航節點數(buildNav 後 > 0)
    this._seeds = new Int32Array(MAX_SEEDS);
    this.flowMs = 0; // 最近一輪距離場的總計算耗時(可能分成數幀)
    this.flowSliceMs = 0; // 最近一次 updateFlow 呼叫的耗時
    this.flowRuns = 0; // 已完成的輪數
    this.flowBudget = 16384; // 每次呼叫最多處理的節點數(整數;要一次算完可設 0x3fffffff)
    this.flowMaxMs = 0.8; // 每次呼叫的時間上限(ms)
  }

  // ======================================================================
  // 靜態結構:每一柱(格)由下而上的實心區間 [y0, y1](樓板、牆、窗台/窗楣、欄杆、門楣、屋頂)
  // 樓梯坡面下方的實心楔形另外解析計算(colStair)
  // ======================================================================
  _buildColumns() {
    const L = this.layout, { W, H, NL } = this;
    const top = L.levels[NL - 1].y;
    const off = (this.cOff = new Int32Array(W * H + 1));
    const ys = [];
    const iv = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      iv.length = 0;
      for (let li = 0; li < NL; li++) {
        const y = L.levels[li].y, ch = L.charAt(li, c, r);
        if (L.hasFloor(li, c, r)) iv.push([li === 0 ? -1e4 : y - L.SLAB, y]);
        if (ch === '#' || ch === 'E') iv.push([y, y + L.CEIL_H]);
        else if (ch === 'W') { iv.push([y, y + L.WINDOW_SILL]); iv.push([y + L.WINDOW_TOP, y + L.CEIL_H]); }
        else if (ch === '=') { const rh = this.railH ? this.railH[li * W * H + r * W + c] : L.RAIL_H; if (rh > 0) iv.push([y, y + rh]); } // 欄杆/矮牆:各格真實高度(setRailHeights;鐵欄杆 0 = 子彈/視線穿過欄杆間隙)
        else if (ch === '+') iv.push([y + DOOR_H, y + L.CEIL_H]);
      }
      if (L.roofed(c, r)) iv.push([top + L.CEIL_H, top + L.LEVEL_H]);
      iv.sort((a, b) => a[0] - b[0]);
      off[r * W + c] = ys.length;
      let cur = null;
      for (const s of iv) {
        if (cur && s[0] <= cur[1] + 1e-4) cur[1] = Math.max(cur[1], s[1]);
        else { if (cur) ys.push(cur[0], cur[1]); cur = [s[0], s[1]]; }
      }
      if (cur) ys.push(cur[0], cur[1]);
    }
    off[W * H] = ys.length;
    this.cY = Float32Array.from(ys);
  }

  // '=' 格的實心高度(相對樓層地面):heightOf(li, c, r) → 公尺;0 = 不擋子彈/視線(鏤空鐵欄杆)。場景建好後由 physics/truth.js 呼叫
  setRailHeights(heightOf) {
    const L = this.layout, { W, H, NL } = this;
    const a = (this.railH = new Float32Array(NL * W * H));
    for (let li = 0; li < NL; li++) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (L.charAt(li, c, r) === '=') a[li * W * H + r * W + c] = heightOf(li, c, r);
    this._buildColumns();
    this._static = null;
  }

  // 第 li 層、格 idx 在 (x,z) 的可站面高度;不可站回傳 NaN
  _surf(li, idx, x, z) {
    const w = this.walk[li * this.WH + idx];
    if (w < 0) return NaN;
    if (w === 0) return this.lvY[li];
    const k = w - 1;
    let t = ((this.sAx[k] ? z : x) - this.sLo[k]) * this.sInv[k];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return this.sY0[k] + this.sDY[k] * t;
  }

  // 該柱中最接近 ref、|h-ref| ≤ tol 且 h ≤ top 的可站面;沒有回傳 NaN(選到的樓層存在 this._pl)
  _pick(idx, x, z, ref, top, tol) {
    let best = NaN, be = Infinity;
    for (let li = 0; li < this.NL; li++) {
      const h = this._surf(li, idx, x, z);
      if (h !== h || h > top) continue;
      const e = h > ref ? h - ref : ref - h;
      if (e <= tol && e < be) { be = e; best = h; this._pl = li; }
    }
    return best;
  }

  // 實體腳底在 y 附近時所在的樓層(找不到可站面時依高度推算)
  _levelFor(idx, x, y, z) {
    const h = this._pick(idx, x, z, y, y + 0.6, 3);
    return h === h ? this._pl : this.layout.levelOfY(y);
  }

  _idx(x, z) {
    const c = Math.floor(x / 2), r = Math.floor(z / 2);
    return c < 0 || r < 0 || c >= this.W || r >= this.H ? -1 : r * this.W + c;
  }

  // ======================================================================
  // 道具碰撞盒(y0 為底部的世界高度)
  // ======================================================================
  addBox(cx, cz, sx, sz, height = 1, y0 = 0) {
    const b = { minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, minY: y0, maxY: y0 + height, height, y0, _s: 0 };
    this.boxes.push(b);
    const { W, H } = this;
    const c0 = Math.max(0, Math.floor(b.minX / 2)), c1 = Math.min(W - 1, Math.floor(b.maxX / 2));
    const r0 = Math.max(0, Math.floor(b.minZ / 2)), r1 = Math.min(H - 1, Math.floor(b.maxZ / 2));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.boxGrid[r * W + c].push(b);
    if (this.navM) this._navPatch(b); // 導航建好之後才加的(商店櫃台、捲門…):局部更新導航
    return b;
  }

  removeBox(b) {
    const i = this.boxes.indexOf(b);
    if (i < 0) return;
    this.boxes.splice(i, 1);
    const { W, H } = this;
    const c0 = Math.max(0, Math.floor(b.minX / 2)), c1 = Math.min(W - 1, Math.floor(b.maxX / 2));
    const r0 = Math.max(0, Math.floor(b.minZ / 2)), r1 = Math.min(H - 1, Math.floor(b.maxZ / 2));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const list = this.boxGrid[r * W + c], k = list.indexOf(b); if (k >= 0) list.splice(k, 1); }
    if (this.navM) this._navPatch(b);
  }

  // 移除從第 n 個之後加入的碰撞盒(場景建構失敗時回復用)
  truncateBoxes(n) {
    while (this.boxes.length > n) this.removeBox(this.boxes[this.boxes.length - 1]);
  }

  // ======================================================================
  // 移動碰撞
  // ======================================================================
  // 格 (c,r) 對「地面在 gref、腳底在 y」的實體是否可通行(以格內最接近實體的點評估樓梯坡面)
  _pass(c, r, px, pz, gref, top) {
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return false;
    const x0 = c * 2, z0 = r * 2;
    const qx = px < x0 ? x0 : px > x0 + 2 ? x0 + 2 : px;
    const qz = pz < z0 ? z0 : pz > z0 + 2 ? z0 + 2 : pz;
    const h = this._pick(r * this.W + c, qx, qz, gref, top, STEP);
    return h === h;
  }

  // 水平推出牆/欄杆/窗/障礙物/樓梯開口/挑空與道具盒,並把 pos.y 貼到地面。
  // body(可省略,玩家用):{ vy, onGround, ground, height, landV } —— 支援跳躍/落下/頂到天花板。
  // 玩家另外有:掉出世界(NaN / y < -20)送回起點;一幀位移超過半徑的 0.6 倍(被撞飛、卡頓)時分段推出,不會穿過薄道具
  resolve(pos, r, body = null) {
    if (body !== null) {
      if (!(pos.x === pos.x && pos.y === pos.y && pos.z === pos.z) || pos.y < -20 || pos.x < -20 || pos.z < -20 || pos.x > this.sizeX + 20 || pos.z > this.sizeZ + 20) this._safety(pos, body);
      const lx = body._rx, lz = body._rz;
      if (lx !== undefined && lx === lx) {
        const ddx = pos.x - lx, ddz = pos.z - lz, dd = ddx * ddx + ddz * ddz;
        if (dd > r * r * 0.36 && dd < 2.25) {
          const gref = body.ground === body.ground && body.ground != null ? body.ground : pos.y;
          const n = Math.ceil(Math.sqrt(dd) / (r * 0.5)), sx = ddx / n, sz = ddz / n;
          pos.x = lx; pos.z = lz;
          for (let k = 1; k < n; k++) { pos.x += sx; pos.z += sz; this._push(pos, r, gref, pos.y + STEP, body.height || BODY_H, pos.y); }
          pos.x += sx; pos.z += sz;
        }
      }
    }
    const W = this.W, y = pos.y;
    let gref = body !== null && body.ground === body.ground && body.ground != null ? body.ground : y;
    if (body === null) { // 殭屍站在道具頂上(床、桌子…比 STEP 高):格子通行判定要用底下的地面,否則會被推出格子
      const i0 = this._idx(pos.x, pos.z);
      if (i0 >= 0 && this._pick(i0, pos.x, pos.z, y, y + STEP, STEP) !== this._pick(i0, pos.x, pos.z, y, y + STEP, STEP)) { const f = this._pick(i0, pos.x, pos.z, y, y + 0.05, 1.6); if (f === f) gref = f; }
    }
    const top = y + STEP;
    const bodyH = body !== null && body.height ? body.height : BODY_H;
    this._push(pos, r, gref, top, bodyH, y);
    const c0 = Math.max(0, Math.floor((pos.x - r) / 2)), c1 = Math.min(W - 1, Math.floor((pos.x + r) / 2));
    const r0 = Math.max(0, Math.floor((pos.z - r) / 2)), r1 = Math.min(this.H - 1, Math.floor((pos.z + r) / 2));
    let st;
    // 3) 地面:中心所在格中與參考地面連續的面
    const idx = this._idx(pos.x, pos.z);
    let g = NaN;
    if (idx >= 0) {
      g = this._pick(idx, pos.x, pos.z, gref, top + 0.05, STEP + 0.05);
      if (g !== g) g = this._pick(idx, pos.x, pos.z, y, Infinity, Infinity); // 被擠進不可站的格(瞬移等)
    }
    if (g !== g) g = gref;
    // 低矮道具頂(可站上去)
    let sup = g;
    st = ++this._stamp;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const list = this.boxGrid[rr * W + cc];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === st) continue;
        b._s = st;
        if (b.maxY <= sup || b.maxY > y + BOX_STEP || b.minY > y + 0.05) continue;
        const nx = pos.x < b.minX ? b.minX : pos.x > b.maxX ? b.maxX : pos.x;
        const nz = pos.z < b.minZ ? b.minZ : pos.z > b.maxZ ? b.maxZ : pos.z;
        if ((pos.x - nx) * (pos.x - nx) + (pos.z - nz) * (pos.z - nz) < r * r * 0.36) sup = b.maxY;
      }
    }
    if (body === null) { pos.y = sup; return pos; }

    // ---- 角色:跳躍、落下、天花板 ----
    body.ground = g;
    body.landV = 0;
    if (body.onGround) {
      if (body.vy > 0) body.onGround = false; // 剛起跳
      else if (y - sup <= STEP + 0.05) { pos.y = sup; body.vy = 0; } // 貼地(含下樓梯、下矮台)
      else body.onGround = false; // 走出高台邊緣 → 落下
    }
    if (!body.onGround && pos.y <= sup) {
      body.landV = -body.vy;
      pos.y = sup;
      body.vy = 0;
      body.onGround = true;
    }
    const ce = idx >= 0 ? this._ceil(idx, pos, r, pos.y) : Infinity;
    if (pos.y + bodyH > ce) {
      pos.y = Math.max(sup, ce - bodyH);
      if (body.vy > 0) body.vy = 0;
    }
    body._rx = pos.x;
    body._rz = pos.z;
    return pos;
  }

  // 1) 不可通行的格子 2) 道具盒(只有高度範圍與身體重疊的才擋;低於 BOX_STEP 的可以踏上去)
  _push(pos, r, gref, top, bodyH, y) {
    const W = this.W;
    let c0 = Math.floor((pos.x - r) / 2), c1 = Math.floor((pos.x + r) / 2);
    let r0 = Math.floor((pos.z - r) / 2), r1 = Math.floor((pos.z + r) / 2);
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      if (!this._pass(cc, rr, pos.x, pos.z, gref, top)) this._pushOut(pos, r, cc * 2, cc * 2 + 2, rr * 2, rr * 2 + 2);
    }
    // 中心仍在不可通行的格(瞬移/出生在牆裡等極端情況):移到附近最近的可通行格
    const ci = Math.floor(pos.x / 2), ri = Math.floor(pos.z / 2);
    if (!this._pass(ci, ri, pos.x, pos.z, gref, top)) this._rescue(pos, r, ci, ri, gref, top);
    c0 = Math.max(0, Math.floor((pos.x - r) / 2)); c1 = Math.min(W - 1, Math.floor((pos.x + r) / 2));
    r0 = Math.max(0, Math.floor((pos.z - r) / 2)); r1 = Math.min(this.H - 1, Math.floor((pos.z + r) / 2));
    const st = ++this._stamp;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const list = this.boxGrid[rr * W + cc];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === st) continue;
        b._s = st;
        if (b.maxY <= y + BOX_STEP || b.minY >= y + bodyH) continue;
        if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
        this._pushOut(pos, r, b.minX, b.maxX, b.minZ, b.maxZ);
      }
    }
  }

  // 安全網:玩家座標變成 NaN 或掉出世界 → 送回起點(清掉速度與跳躍狀態)
  _safety(pos, body) {
    const s = this.start || { x: this.sizeX / 2, y: 0, z: this.sizeZ / 2 };
    pos.x = s.x; pos.y = s.y || 0; pos.z = s.z;
    body.vy = 0;
    if (body.vx !== undefined) body.vx = 0;
    if (body.vz !== undefined) body.vz = 0;
    body.onGround = true;
    body.ground = pos.y;
    if (body.viewY !== undefined) body.viewY = pos.y;
    body._rx = undefined;
    this.rescues = (this.rescues || 0) + 1;
    console.warn('[world] 玩家掉出世界或座標無效,送回起點');
  }

  _rescue(pos, r, ci, ri, gref, top) {
    let bd = Infinity, bx = pos.x, bz = pos.z;
    for (let rad = 1; rad <= 3 && bd === Infinity; rad++) {
      for (let rr = ri - rad; rr <= ri + rad; rr++) for (let cc = ci - rad; cc <= ci + rad; cc++) {
        if (!this._pass(cc, rr, pos.x, pos.z, gref, top)) continue;
        const m = Math.min(r, 0.9);
        const qx = Math.max(cc * 2 + m, Math.min(cc * 2 + 2 - m, pos.x)), qz = Math.max(rr * 2 + m, Math.min(rr * 2 + 2 - m, pos.z));
        const d = (qx - pos.x) ** 2 + (qz - pos.z) ** 2;
        if (d < bd) { bd = d; bx = qx; bz = qz; }
      }
    }
    pos.x = bx;
    pos.z = bz;
  }

  // 腳底 y 上方第一個實心物的底部(樓板/門楣/道具盒底)
  _ceil(idx, pos, r, y) {
    const ys = this.cY;
    let ce = Infinity;
    for (let k = this.cOff[idx], e = this.cOff[idx + 1]; k < e; k += 2) if (ys[k] > y + 0.3) { ce = ys[k]; break; }
    const list = this.boxGrid[idx];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.minY <= y + 0.3 || b.minY >= ce) continue;
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      ce = b.minY;
    }
    return ce;
  }

  _pushOut(pos, r, minX, maxX, minZ, maxZ) {
    const nx = pos.x < minX ? minX : pos.x > maxX ? maxX : pos.x;
    const nz = pos.z < minZ ? minZ : pos.z > maxZ ? maxZ : pos.z;
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = r - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // 圓心在方塊內:往最近的邊推出
      const l = pos.x - minX, rt = maxX - pos.x, t = pos.z - minZ, bt = maxZ - pos.z;
      const m = Math.min(l, rt, t, bt);
      if (m === l) pos.x = minX - r;
      else if (m === rt) pos.x = maxX + r;
      else if (m === t) pos.z = minZ - r;
      else pos.z = maxZ + r;
    }
  }

  // ======================================================================
  // 地面/樓層/區域查詢
  // ======================================================================
  // (x,z) 處、高度約 y 的點正下方的實心面高度(樓板/坡面/欄杆或窗台頂/道具頂);
  // 點本身深埋在實心物內或下方什麼都沒有時回傳 null
  groundY(x, z, y) {
    const idx = this._idx(x, z);
    if (idx < 0) return null;
    const lim = y + STEP;
    let best = -Infinity;
    const ys = this.cY;
    for (let k = this.cOff[idx], e = this.cOff[idx + 1]; k < e; k += 2) {
      if (ys[k + 1] <= lim) { if (ys[k + 1] > best) best = ys[k + 1]; }
      else if (ys[k] <= y) return null;
      else break;
    }
    for (let n = 0; n < 2; n++) {
      const k = this.colStair[idx * 2 + n];
      if (k < 0) break;
      const h = this._surf(this.sLower[k], idx, x, z);
      if (h <= lim) { if (h > best) best = h; }
      else if (y >= this.sY0[k]) return null;
    }
    const list = this.boxGrid[idx];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.maxY <= best || b.maxY > lim || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      best = b.maxY;
    }
    return best === -Infinity ? null : best;
  }

  // 腳底高度 y 的實體所在可站面的法線(樓梯坡面傾斜,其餘朝上)
  normalAt(x, z, y, out = { x: 0, y: 1, z: 0 }) {
    out.x = 0; out.y = 1; out.z = 0;
    const k = this.stairAt(x, y, z);
    if (k >= 0) {
      const m = this.sDY[k] * this.sInv[k], l = Math.sqrt(1 + m * m);
      if (this.sAx[k]) { out.z = -m / l; out.y = 1 / l; } else { out.x = -m / l; out.y = 1 / l; }
    }
    return out;
  }

  // 實體腳下的樓梯編號(layout.stairs 的索引),不在樓梯上回傳 -1
  stairAt(x, y, z) {
    const idx = this._idx(x, z);
    if (idx < 0) return -1;
    const h = this._pick(idx, x, z, y, y + 0.6, 1.2);
    if (h !== h) return -1;
    const w = this.walk[this._pl * this.WH + idx];
    return w > 0 ? w - 1 : -1;
  }

  levelAt(y) { return this.layout.levelOfY(y); }

  surfaceAt(x, y, z) {
    const idx = this._idx(x, z);
    if (idx < 0) return 'concrete';
    const li = this._levelFor(idx, x, y, z);
    return this.layout.surfaceAt(li, idx % this.W, (idx / this.W) | 0);
  }

  zoneAt(x, y, z) {
    const idx = this._idx(x, z);
    if (idx < 0) return null;
    const L = this.layout, c = idx % this.W, r = (idx / this.W) | 0;
    const li = this._levelFor(idx, x, y, z);
    const w = this.walk[li * this.WH + idx];
    if (w > 0) { // 樓梯上半段算上層的區域
      const s = L.stairs[w - 1];
      if (s.upper >= 0 && this._surf(li, idx, x, z) > (s.yLow + s.yHigh) / 2) { const zu = L.zoneAt(s.upper, c, r); if (zu) return zu; }
    }
    return L.zoneAt(li, c, r) || null;
  }

  // 半徑 r 的身體在 (x,z)、腳底 y 時頭頂上方第一個實心物的高度:格子結構 + 與身體重疊的道具盒底部(蹲下後能否站起來、翻越淨空)
  headroom(x, z, y, r = 0.35) {
    let ce = this.ceilAt(x, z, y);
    const W = this.W, c0 = Math.max(0, Math.floor((x - r) / 2)), c1 = Math.min(W - 1, Math.floor((x + r) / 2));
    const r0 = Math.max(0, Math.floor((z - r) / 2)), r1 = Math.min(this.H - 1, Math.floor((z + r) / 2));
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const list = this.boxGrid[rr * W + cc];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b.minY <= y + 0.3 || b.minY >= ce || x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue;
        ce = b.minY;
      }
    }
    return ce;
  }

  // 腳底 y 處頭頂上方第一個實心物的高度(Infinity = 露天)
  ceilAt(x, z, y) {
    const idx = this._idx(x, z);
    if (idx < 0) return Infinity;
    const ys = this.cY;
    for (let k = this.cOff[idx], e = this.cOff[idx + 1]; k < e; k += 2) if (ys[k] > y + 0.3) return ys[k];
    return Infinity;
  }

  // ======================================================================
  // 3D 射線:xz 平面以 2m 格做 DDA,每格解析計算實心區間、樓梯楔形與道具盒,命中即結束
  // ======================================================================
  rayDistance(ox, oy, oz, dx, dy, dz, maxDist) {
    const W = this.W, H = this.H;
    let c = Math.floor(ox / 2), r = Math.floor(oz / 2);
    const sc = dx > 0 ? 1 : -1, sr = dz > 0 ? 1 : -1;
    const adx = dx < 0 ? -dx : dx, adz = dz < 0 ? -dz : dz;
    const tdc = adx > 1e-9 ? 2 / adx : Infinity, tdr = adz > 1e-9 ? 2 / adz : Infinity;
    let tmc = adx > 1e-9 ? ((dx > 0 ? (c + 1) * 2 : c * 2) - ox) / dx : Infinity;
    let tmr = adz > 1e-9 ? ((dz > 0 ? (r + 1) * 2 : r * 2) - oz) / dz : Infinity;
    let t = 0, best = maxDist, hb = null;
    const st = ++this._stamp;
    while (t < best) {
      if (c < 0 || r < 0 || c >= W || r >= H) break;
      const tn = tmc < tmr ? (tmc < best ? tmc : best) : tmr < best ? tmr : best;
      const idx = r * W + c;
      const h = this._colRay(idx, ox, oy, oz, dx, dy, dz, t, tn);
      if (h < best) { best = h; hb = null; }
      const list = this.boxGrid[idx];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === st) continue;
        b._s = st;
        if (b.moveOnly) continue; // 只擋人與殭屍移動的盒子(商店櫃台後緣的隱形牆):子彈、視線、聲音穿過
        const bt = boxRay(b, ox, oy, oz, dx, dy, dz, best);
        if (bt < best) { best = bt; hb = b; }
      }
      if (best <= tn) break;
      t = tn;
      if (tmc < tmr) { c += sc; tmc += tdc; } else { r += sr; tmr += tdr; }
    }
    this.rayBox = hb; // 命中的道具碰撞盒(null = 牆/樓板/樓梯或沒打到;子彈穿透用)
    return best;
  }

  // 射線在格 idx 內 [t0,t1] 段第一次碰到實心物的距離
  _colRay(idx, ox, oy, oz, dx, dy, dz, t0, t1) {
    let hit = Infinity;
    const ys = this.cY;
    const ya = oy + dy * t0, yb = oy + dy * t1;
    const lo = ya < yb ? ya : yb, hi = ya < yb ? yb : ya;
    for (let k = this.cOff[idx], e = this.cOff[idx + 1]; k < e; k += 2) {
      const a = ys[k], b = ys[k + 1];
      if (b < lo || a > hi) continue;
      const te = ya >= a && ya <= b ? t0 : ya < a ? (a - oy) / dy : (b - oy) / dy;
      if (te < hit) hit = te;
    }
    for (let n = 0; n < 2; n++) {
      const k = this.colStair[idx * 2 + n];
      if (k < 0) break;
      // 楔形實心:sY0 ≤ y(t) ≤ 坡面(t);兩者都是 t 的線性函數
      const m = this.sDY[k] * this.sInv[k], ax = this.sAx[k];
      const A = oy - this.sY0[k] - m * ((ax ? oz : ox) - this.sLo[k]), B = dy - m * (ax ? dz : dx);
      let a = t0, b = t1;
      if (B > -1e-12 && B < 1e-12) { if (A > 0) continue; }
      else if (B > 0) { const tz = -A / B; if (tz < b) b = tz; }
      else { const tz = -A / B; if (tz > a) a = tz; }
      if (dy > -1e-12 && dy < 1e-12) { if (oy < this.sY0[k]) continue; }
      else if (dy > 0) { const tf = (this.sY0[k] - oy) / dy; if (tf > a) a = tf; }
      else { const tf = (this.sY0[k] - oy) / dy; if (tf < b) b = tf; }
      if (a <= b && a < hit) hit = a;
    }
    return hit;
  }

  // 新簽名 (ax, ay, az, bx, by, bz);舊的 4 參數 (ax, az, bx, bz) 仍相容(視為 1.2m 高)
  hasLineOfSight(ax, ay, az, bx, by, bz) {
    if (bz === undefined) { bz = bx; bx = az; az = ay; ay = by = 1.2; }
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    return this.rayDistance(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.05;
  }

  // ======================================================================
  // 合併後的靜態幾何(灰盒/物理引擎可用):AABB { kind, level, x0, y0, z0, x1, y1, z1 }
  // kind:slab 樓板(頂面 = 地面)、wall、elevator、sill 窗台、header 窗楣、rail、lintel 門楣、fence、roof
  // 樓梯坡面見 staticRamps()
  // ======================================================================
  staticBoxes() {
    if (this._static) return this._static;
    const L = this.layout, { W, H, NL } = this, out = [];
    const C = L.CELL;
    const greedy = (test, emit) => {
      const used = new Uint8Array(W * H);
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (used[r * W + c] || !test(c, r)) continue;
        let c1 = c;
        while (c1 + 1 < W && !used[r * W + c1 + 1] && test(c1 + 1, r)) c1++;
        let r1 = r;
        grow: while (r1 + 1 < H) {
          for (let k = c; k <= c1; k++) if (used[(r1 + 1) * W + k] || !test(k, r1 + 1)) break grow;
          r1++;
        }
        for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr * W + k] = 1;
        emit(c, r, c1, r1);
      }
    };
    const top = L.levels[NL - 1].y;
    for (let li = 0; li < NL; li++) {
      const y = L.levels[li].y;
      const add = (kind, y0, y1) => (c0, r0, c1, r1) => out.push({ kind, level: li, x0: c0 * C, x1: (c1 + 1) * C, z0: r0 * C, z1: (r1 + 1) * C, y0, y1 });
      greedy((c, r) => L.hasFloor(li, c, r), add('slab', y - L.SLAB, y));
      greedy((c, r) => L.charAt(li, c, r) === '#', add('wall', y, y + L.CEIL_H));
      greedy((c, r) => L.charAt(li, c, r) === 'E', add('elevator', y, y + L.CEIL_H));
      greedy((c, r) => L.charAt(li, c, r) === 'W', (c0, r0, c1, r1) => {
        add('sill', y, y + L.WINDOW_SILL)(c0, r0, c1, r1);
        add('header', y + L.WINDOW_TOP, y + L.CEIL_H)(c0, r0, c1, r1);
      });
      greedy((c, r) => L.charAt(li, c, r) === '=', add('rail', y, y + L.RAIL_H));
      greedy((c, r) => L.charAt(li, c, r) === '+', add('lintel', y + DOOR_H, y + L.CEIL_H));
      greedy((c, r) => L.charAt(li, c, r) === '|', add('fence', y, y + FENCE_H));
    }
    greedy((c, r) => L.roofed(c, r), (c0, r0, c1, r1) => out.push({ kind: 'roof', level: NL - 1, x0: c0 * C, x1: (c1 + 1) * C, z0: r0 * C, z1: (r1 + 1) * C, y0: top + L.CEIL_H, y1: top + L.LEVEL_H }));
    this._static = out;
    return out;
  }

  // 樓梯坡面(實心楔形:底 yLow、頂面沿 axis 從 lowAt 的 yLow 線性升到 highAt 的 yHigh)
  staticRamps() {
    return this.layout.stairs.map((s) => ({ id: s.id, lower: s.lower, upper: s.upper, axis: s.axis, dir: s.dir, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, yLow: s.yLow, yHigh: s.yHigh, lowAt: s.lowAt, highAt: s.highAt }));
  }

  // ======================================================================
  // 導航:四層 0.5m 細格節點(可站面 + 膨脹後無障礙),8 鄰接、跨層邊在樓梯兩端;
  // updateFlow 以 Dial 演算法(直 2 / 斜 3)算到最近目標的距離場
  // ======================================================================
  // 'X' 障礙物若完全沒有道具碰撞盒,補一個預設高度的盒子(子彈/視線/低矮判定才正確)
  _ensureObstacleBoxes() {
    for (const o of this.layout.obstacles) {
      let covered = false;
      const idx = this._idx(o.x, o.z);
      if (idx >= 0) for (const b of this.boxGrid[idx]) {
        if (b.maxY > o.y + 0.5 && b.minY < o.y + 1 && b.maxX > o.x - o.sx / 4 && b.minX < o.x + o.sx / 4 && b.maxZ > o.z - o.sz / 4 && b.minZ < o.z + o.sz / 4) { covered = true; break; }
      }
      if (!covered) this.addBox(o.x, o.z, o.sx * 0.9, o.sz * 0.9, OBSTACLE_H[o.kind] ?? 1.5, o.y);
    }
  }

  // 導航節點中心 (x,z)、地面 h:半徑 R 內沒有不可通行格與擋路道具。
  // lowH > 0 時頂部 ≤ h + lowH 的道具不算(可翻越);clear = 道具底部至少要高於這個淨空才不擋(爬行者可鑽過的高度)
  _navFree(x, z, h, R = NAV_R, lowH = 0, clear = BODY_H) {
    const top = h + STEP, W = this.W;
    const c0 = Math.floor((x - R) / 2), c1 = Math.floor((x + R) / 2), r0 = Math.floor((z - R) / 2), r1 = Math.floor((z + R) / 2);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const nx = x < c * 2 ? c * 2 : x > c * 2 + 2 ? c * 2 + 2 : x;
      const nz = z < r * 2 ? r * 2 : z > r * 2 + 2 ? r * 2 + 2 : z;
      if ((x - nx) * (x - nx) + (z - nz) * (z - nz) >= R * R) continue;
      if (!this._pass(c, r, x, z, h, top)) return false;
      if (c < 0 || r < 0 || c >= W || r >= this.H) continue;
      const list = this.boxGrid[r * W + c];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b.nav === false) continue; // 關著的門扇:擋人擋子彈,但導航照樣穿過(殭屍走到門前會把門推開或撞破,src/interact/doors.js)
        if (b.maxY <= h + BOX_STEP || b.minY >= h + clear || (lowH > 0 && b.maxY <= h + lowH)) continue;
        const bx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
        const bz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
        if ((x - bx) * (x - bx) + (z - bz) * (z - bz) < R * R) return false;
      }
    }
    return true;
  }

  // ======================================================================
  // 直線可走判定(殭屍直衝/攻擊/飛撲/衝鋒前用):沿 (ax,ay,az)→(bx,bz) 每 0.25m 取樣,
  // 每點都要有與前一點高度連續的導航節點(=地面連續、沒有牆/欄杆/窗/擋路道具/挑空/樓梯開口)。
  // 起終點 skip 公尺內允許沒有節點(貼牆站的玩家、被擠到節點外的殭屍)。
  // vaultH > 0:沒有節點、但只被頂部 ≤ 地面 + vaultH 的道具擋住的點算「可翻越」。
  // 回傳 0 不通 / 1 可直走 / 2 中間要翻越矮障礙
  // ======================================================================
  walkLine(ax, ay, az, bx, bz, skip = 0.45, vaultH = 0) {
    if (!this.navM) return 0;
    const dx = bx - ax, dz = bz - az, len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) return 1;
    const n = Math.ceil(len / 0.25), gh = this.gh;
    let h = ay, res = 1;
    for (let k = 1; k < n; k++) {
      const d = (k / n) * len;
      if (d < skip || len - d < skip) continue;
      const x = ax + (dx * d) / len, z = az + (dz * d) / len;
      const g = this._navFind(Math.floor(x / FINE), Math.floor(z / FINE), h);
      if (g >= 0) { h = gh[g]; continue; }
      if (vaultH > 0 && this._navFree(x, z, h, 0.3, vaultH)) { res = 2; continue; }
      return 0;
    }
    return res;
  }

  // 翻越:從 (x,y,z) 往 (dx,dz) 方向前方 r+0.4 內的矮道具(頂部 ≤ y + maxH)另一側的落地點。
  // 落地點要有同高度的導航節點、中間不經過牆/欄杆;找到回傳 out { x, z, top },否則 null
  vaultAhead(x, y, z, dx, dz, r, maxH, out) {
    const W = this.W, reach = r + 0.4;
    const c0 = Math.max(0, Math.floor((Math.min(x, x + dx * reach) - r) / 2)), c1 = Math.min(W - 1, Math.floor((Math.max(x, x + dx * reach) + r) / 2));
    const r0 = Math.max(0, Math.floor((Math.min(z, z + dz * reach) - r) / 2)), r1 = Math.min(this.H - 1, Math.floor((Math.max(z, z + dz * reach) + r) / 2));
    let exit = -1, top = 0;
    const st = ++this._stamp;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const list = this.boxGrid[rr * W + cc];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === st) continue;
        b._s = st;
        if (b.maxY <= y + BOX_STEP || b.minY >= y + BODY_H) continue;
        // 膨脹 r 後的方塊與前進射線的進出距離(2D slab)
        let t0 = 0, t1 = reach + 3, a, c, s;
        if (dx > -1e-9 && dx < 1e-9) { if (x < b.minX - r || x > b.maxX + r) continue; }
        else { a = (b.minX - r - x) / dx; c = (b.maxX + r - x) / dx; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; }
        if (dz > -1e-9 && dz < 1e-9) { if (z < b.minZ - r || z > b.maxZ + r) continue; }
        else { a = (b.minZ - r - z) / dz; c = (b.maxZ + r - z) / dz; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; }
        if (t0 > t1 || t0 > reach) continue;
        if (b.maxY > y + maxH) return null; // 前面有高的東西:不能翻
        if (t1 > exit) exit = t1;
        if (b.maxY > top) top = b.maxY;
      }
    }
    if (exit < 0 || exit > 2.6) return null;
    // 落地點:越過方塊後第一個有導航節點的位置(節點離道具至少 NAV_R,所以往前多找幾步)
    let L = -1;
    for (let e = 0.12; e <= 0.9; e += 0.13) {
      const lx = x + dx * (exit + e), lz = z + dz * (exit + e);
      if (this._navFind(Math.floor(lx / FINE), Math.floor(lz / FINE), y) >= 0) { L = exit + e; break; }
    }
    if (L < 0) return null;
    // 路徑上的格子不能是牆/欄杆/窗(只能翻道具)
    for (let k = 1; k <= 6; k++) {
      const t = L * (k / 6), px = x + dx * t, pz = z + dz * t;
      if (!this._pass(Math.floor(px / 2), Math.floor(pz / 2), px, pz, y, y + STEP)) return null;
    }
    out.x = x + dx * L; out.z = z + dz * L; out.top = top;
    return out;
  }

  // 爬上道具頂(殭屍追站在床、桌子、花台、木箱上的玩家):前方 r+0.55 內、頂部在 (y+BOX_STEP, y+maxH] 的道具,
  // 頂上站得下(身體半徑 r、頭上 1.5m、沒有別的道具擋著)→ out { x, z, top }(落點在道具邊緣往內約 0.6r),否則 null
  climbOnto(x, y, z, dx, dz, r, maxH, out) {
    const W = this.W, reach = r + 0.55;
    const c0 = Math.max(0, Math.floor((Math.min(x, x + dx * reach) - r) / 2)), c1 = Math.min(W - 1, Math.floor((Math.max(x, x + dx * reach) + r) / 2));
    const r0 = Math.max(0, Math.floor((Math.min(z, z + dz * reach) - r) / 2)), r1 = Math.min(this.H - 1, Math.floor((Math.max(z, z + dz * reach) + r) / 2));
    let best = null, bt = Infinity;
    const st = ++this._stamp;
    for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
      const list = this.boxGrid[rr * W + cc];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b._s === st) continue;
        b._s = st;
        if (b.maxY <= y + BOX_STEP || b.maxY > y + maxH || b.minY > y + 0.3 || !b.pm) continue; // 只爬有材質標記的道具(不爬商店櫃台、門)
        let t0 = 0, t1 = reach, a, c, s;
        if (dx > -1e-9 && dx < 1e-9) { if (x < b.minX - r || x > b.maxX + r) continue; }
        else { a = (b.minX - r - x) / dx; c = (b.maxX + r - x) / dx; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; }
        if (dz > -1e-9 && dz < 1e-9) { if (z < b.minZ - r || z > b.maxZ + r) continue; }
        else { a = (b.minZ - r - z) / dz; c = (b.maxZ + r - z) / dz; if (a > c) { s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; }
        if (t0 > t1 || t0 > reach) continue;
        if (t0 < bt) { bt = t0; best = b; }
      }
    }
    if (!best) return null;
    const top = best.maxY, m = Math.min(0.12, (best.maxX - best.minX) / 2 - 0.01), mz = Math.min(0.12, (best.maxZ - best.minZ) / 2 - 0.01);
    let lx = x + dx * (bt + r * 1.6), lz = z + dz * (bt + r * 1.6);
    lx = lx < best.minX + m ? best.minX + m : lx > best.maxX - m ? best.maxX - m : lx;
    lz = lz < best.minZ + mz ? best.minZ + mz : lz > best.maxZ - mz ? best.maxZ - mz : lz;
    if (this.headroom(lx, lz, top, r * 0.8) < top + 1.5) return null;
    const idx = this._idx(lx, lz);
    if (idx < 0) return null;
    const list = this.boxGrid[idx];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b === best || b.maxY <= top + BOX_STEP || b.minY >= top + 1.5) continue;
      if (lx + r * 0.8 <= b.minX || lx - r * 0.8 >= b.maxX || lz + r * 0.8 <= b.minZ || lz - r * 0.8 >= b.maxZ) continue;
      return null;
    }
    out.x = lx; out.z = lz; out.top = top;
    return out;
  }

  // 導航圖:每層一張 240×200 的 0.5m 細格(稠密索引 g = 層 * FN + j * fw + i)。
  // ninfo[g] 低 8 位 = 同層 8 方向是否相連,bit 8 = 有跨層邊(樓梯兩端,存在 xEdges);
  // 稠密網格讓 BFS 波前在記憶體中連續,快取友善(比壓縮鄰接表快數倍)。
  buildNav() {
    const t0 = performance.now();
    this._ensureObstacleBoxes();
    const { W, H, NL, WH } = this;
    const fw = (this.fw = W * SUB), fh = (this.fh = H * SUB), FN = (this.FN = fw * fh), G = (this.G = NL * FN);
    const gh = (this.gh = new Float32Array(G).fill(NaN)); // 節點地面高度(NaN = 非節點)
    let M = 0;
    for (let li = 0; li < NL; li++) {
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const idx = (j >> 2) * W + (i >> 2);
        if (this.walk[li * WH + idx] < 0) continue;
        const x = (i + 0.5) * FINE, z = (j + 0.5) * FINE;
        const h = this._surf(li, idx, x, z);
        if (!this._navFree(x, z, h)) continue;
        gh[li * FN + j * fw + i] = h;
        M++;
      }
    }
    this.navM = M;
    this.ninfo = new Uint16Array(G);
    const DOFF = (this.DOFF = new Int32Array(8));
    for (let d = 0; d < 8; d++) DOFF[d] = DJ[d] * fw + DI[d];
    this.xEdges = new Map();
    let E = 0;
    for (let g = 0; g < G; g++) E += this._navLinks(g);
    this.navE = E;
    this.dist = new Uint16Array(G).fill(INF); // 查詢用(最近一次算完的距離場)
    this._back = new Uint16Array(G).fill(INF); // 計算中
    this._bfs = new Int32Array(2);
    this._bfsOn = false;
    this._runSeeds = new Int32Array(MAX_SEEDS);
    this._nRun = -1;
    this._q = new Int32Array(G * 4);
    this._qh = new Int32Array(4);
    this._qt = new Int32Array(4);
    this.navDirty = false;
    this._navDirty = false;
    this.navBuildMs = performance.now() - t0;
    // 先從起點完整算一次(預熱 JIT,第一幀就有可用的距離場)
    const st = this.start;
    if (st) { const b = this.flowBudget; this.flowBudget = 0x3fffffff; this.updateFlow([{ x: st.x, y: st.y, z: st.z }]); this.flowBudget = b; } // 整數預算(避免 JIT 型別回饋變成浮點)
    this._fixSpawns(); // 用起點的距離場確認出生點可達
    this._nRun = -1;
    return this;
  }

  // 出生點檢查(導航建好後):出生點半徑 0.6m 內不能有牆/道具(殭屍出生時有 ±0.6m 的隨機偏移),
  // 否則移到同層附近(4m 內)最近的空位;找不到就標記 bad(不使用)。
  // 同時標記心理學屬性:zone 區域、dark 暗處、door 門後(房間內緊鄰門口)、vent 通風口(爬行者專用)、node 導航節點
  _fixSpawns() {
    const L = this.layout, { FN } = this;
    const DARK = new Set(['none', 'candle', 'bare_bulb', 'nightlight']); // 幾乎沒有光的燈型;其餘看氛圍的環境光
    let moved = 0, bad = 0;
    for (const s of this.spawns) {
      const li = s.level, h = L.levels[li].y;
      const free = (x, z, R) => { const g = this._navFind(Math.floor(x / FINE), Math.floor(z / FINE), h); return g >= 0 && ((g / FN) | 0) === li && this._navFree(x, z, h, R) ? g : -1; };
      let g = free(s.x, s.z, 0.6);
      if (g < 0) {
        let best = -1, bd = Infinity, bx = s.x, bz = s.z;
        for (const R of [0.6, 0.45]) {
          const i0 = Math.floor(s.x / FINE), j0 = Math.floor(s.z / FINE);
          for (let dj = -8; dj <= 8; dj++) for (let di = -8; di <= 8; di++) {
            const x = (i0 + di + 0.5) * FINE, z = (j0 + dj + 0.5) * FINE, d = (x - s.x) ** 2 + (z - s.z) ** 2;
            if (d >= bd) continue;
            const gg = free(x, z, R);
            if (gg >= 0 && Number.isFinite(this.flowDistance(x, h, z))) { bd = d; best = gg; bx = x; bz = z; }
          }
          if (best >= 0) break;
        }
        if (best >= 0) { s.x = bx; s.z = bz; g = best; moved++; s.moved = Math.sqrt(bd); }
        else { s.bad = true; bad++; }
      }
      s.node = g;
      const c = Math.floor(s.x / 2), r = Math.floor(s.z / 2);
      const zn = L.zoneAt(li, c, r);
      s.zone = zn ? zn.id : null;
      const mood = zn && L.moods[zn.mood];
      s.dark = !!s.vent || (!s.outdoor && (!zn || DARK.has(zn.light) || (mood && mood.ambient <= 0.24)));
      // 門後:室內房間(非走廊)、3 格內有門口 → 殭屍會從門口冒出來
      let door = false;
      if (zn && zn.theme !== 'corridor' && !s.outdoor) for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) if (L.charAt(li, c + dc, r + dr) === '+') door = true;
      s.door = door;
    }
    this.spawnFix = { moved, bad };
    if (moved || bad) console.info(`[world] 出生點檢查:移動 ${moved} 個、無效 ${bad} 個`);
  }

  // 細格 (i,j) 上與高度 h 連續的節點;沒有回傳 -1
  _navFind(i, j, h) {
    const { fw, fh, FN, NL } = this, gh = this.gh;
    if (i < 0 || j < 0 || i >= fw || j >= fh) return -1;
    for (let li = 0; li < NL; li++) {
      const g = li * FN + j * fw + i, v = gh[g];
      if (v === v && Math.abs(v - h) <= NAV_STEP) return g;
    }
    return -1;
  }

  // 重算節點 g 的連線(同層 8 方向位元 + 跨層邊);回傳邊數
  _navLinks(g) {
    const info = this.ninfo, h = this.gh[g];
    info[g] = 0;
    this.xEdges.delete(g);
    if (h !== h) return 0;
    const { FN, fw, DOFF } = this, r = g % FN, i = r % fw, j = (r / fw) | 0;
    let xs = null, E = 0;
    for (let d = 0; d < 8; d++) {
      const m = this._navFind(i + DI[d], j + DJ[d], h);
      if (m < 0) continue;
      if (d >= 4 && (this._navFind(i + DI[d], j, h) < 0 || this._navFind(i, j + DJ[d], h) < 0)) continue; // 不切角
      E++;
      if (m === g + DOFF[d]) info[g] |= 1 << d;
      else (xs ||= []).push(m * 4 + (d >= 4 ? 3 : 2)); // 跨層(樓梯頂端 ↔ 上層平台)
    }
    if (xs) { info[g] |= 256; this.xEdges.set(g, Int32Array.from(xs)); }
    return E;
  }

  // 碰撞盒 b 加入/移除:附近的導航節點要局部重建。先排隊(物理重物被推動時每 6 幀就會改一次、爆炸時一次很多個),
  // 由 updateFlow 每幀在時間預算內處理,不會一幀全部擠在一起卡頓
  _navPatch(b) {
    const q = this._patchQ || (this._patchQ = []);
    q.push(b.minX, b.maxX, b.minZ, b.maxZ);
  }

  // 處理排隊的導航局部重建,最多 budgetMs 毫秒(至少一個);回傳剩餘數量
  _navPatchRun(budgetMs) {
    const q = this._patchQ;
    if (!q || !q.length) return 0;
    const t0 = performance.now();
    let i = 0;
    while (i < q.length) {
      this._navPatchRect(q[i], q[i + 1], q[i + 2], q[i + 3]);
      i += 4;
      if (performance.now() - t0 > budgetMs) break;
    }
    q.splice(0, i);
    this.patchMs = performance.now() - t0;
    return q.length >> 2;
  }

  // 矩形 (minX..maxX, minZ..maxZ) 附近的導航節點與連線局部重建,並讓下一輪距離場重算
  _navPatchRect(minX, maxX, minZ, maxZ) {
    const { W, WH, NL, fw, fh, FN } = this, gh = this.gh, m = NAV_R + FINE;
    const i0 = Math.max(0, Math.floor((minX - m) / FINE)), i1 = Math.min(fw - 1, Math.floor((maxX + m) / FINE));
    const j0 = Math.max(0, Math.floor((minZ - m) / FINE)), j1 = Math.min(fh - 1, Math.floor((maxZ + m) / FINE));
    for (let li = 0; li < NL; li++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const g = li * FN + j * fw + i, idx = (j >> 2) * W + (i >> 2), was = gh[g] === gh[g];
      let h = NaN;
      if (this.walk[li * WH + idx] >= 0) {
        const x = (i + 0.5) * FINE, z = (j + 0.5) * FINE, s = this._surf(li, idx, x, z);
        if (this._navFree(x, z, s)) h = s;
      }
      gh[g] = h;
      this.navM += (h === h ? 1 : 0) - (was ? 1 : 0);
    }
    for (let li = 0; li < NL; li++) for (let j = Math.max(0, j0 - 1); j <= Math.min(fh - 1, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(fw - 1, i1 + 1); i++) this._navLinks(li * FN + j * fw + i);
    // 跨層邊只連相鄰細格,另一端一定在上面重算的範圍(多一圈)內。
    // 進行中的這一輪不作廢(重物被推動時每 6 幀就會改一次,作廢會讓距離場一直算不完而停在舊的):
    // 這輪照算完(局部誤差很小),算完後立刻再補算一輪
    this._navDirty = true;
  }

  // 離 (x,y,z) 最近的導航節點(稠密索引):同一細格高度最接近者;沒有則在附近 rad 圈內找
  _nodeNear(x, y, z, rad) {
    if (!this.navM) return -1;
    const { fw, fh, FN, NL } = this, gh = this.gh;
    const i0 = Math.floor(x / FINE), j0 = Math.floor(z / FINE);
    let best = -1, bs = Infinity;
    for (let ring = 0; ring <= rad; ring++) {
      for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
        if (ring && di !== -ring && di !== ring && dj !== -ring && dj !== ring) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= fw || j >= fh) continue;
        for (let li = 0; li < NL; li++) {
          const g = li * FN + j * fw + i, h = gh[g];
          if (h !== h) continue;
          const e = h > y ? h - y : y - h;
          if (e > 1.6) continue;
          const s = e + (di * di + dj * dj) * 0.3;
          if (s < bs) { bs = s; best = g; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // 多源最短路(目標節點不變就略過);targets: [{x,y,z}...];舊的 (px, pz) 仍相容
  updateFlow(targets, pz) {
    if (!this.navM) return;
    if (!Array.isArray(targets)) { this._legacy ||= [{ x: 0, y: 0, z: 0 }]; this._legacy[0].x = targets; this._legacy[0].z = pz; targets = this._legacy; }
    const seeds = this._seeds;
    let ns = 0;
    for (let k = 0; k < targets.length && ns < MAX_SEEDS; k++) {
      const t = targets[k];
      const n = this._nodeNear(t.x, t.y || 0, t.z, 4);
      if (n < 0) continue;
      let dup = false;
      for (let q = 0; q < ns; q++) if (seeds[q] === n) dup = true;
      if (!dup) seeds[ns++] = n;
    }
    if (this._patchQ && this._patchQ.length) this._navPatchRun(0.6);
    if (!this._bfsOn) { // 沒有進行中的計算:目標節點有變(或導航圖被局部修改)才開始新的一輪
      if (ns === this._nRun && !this._navDirty) { let eq = true; for (let q = 0; q < ns; q++) if (this._runSeeds[q] !== seeds[q]) eq = false; if (eq) return; }
      if (!ns) return;
      this._navDirty = false;
      this._nRun = ns;
      for (let q = 0; q < ns; q++) this._runSeeds[q] = seeds[q];
      dialStart(this._back, this._q, this._qh, this._qt, this._runSeeds, ns, this._bfs);
      this._bfsOn = true;
      this._bfsMs = 0;
    }
    // 每次呼叫最多處理 flowBudget 個節點、最多約 flowMaxMs 毫秒(分 4096 個一段檢查時間;CPU 忙時也不會一幀卡太久),
    // 整輪算完才換成查詢用的距離場
    const t0 = performance.now(), tcap = this.flowBudget >= 0x3fffffff ? Infinity : this.flowMaxMs; // 要求一次算完時不限時
    let done = false, left = this.flowBudget;
    while (left > 0) {
      const n = left < 4096 ? left : 4096;
      done = dialStep(this.G, this._back, this._q, this._qh, this._qt, this.ninfo, this.DOFF, this.xEdges, this._bfs, n);
      left -= n;
      if (done || performance.now() - t0 > tcap) break;
    }
    const ms = performance.now() - t0;
    this._bfsMs += ms;
    this.flowSliceMs = ms;
    if (done) {
      const t = this.dist;
      this.dist = this._back;
      this._back = t;
      this._bfsOn = false;
      this.flowMs = this._bfsMs;
      this.flowRuns++;
    }
  }

  // 節點 n 的鄰居中距離最小者(比 n 小才算);沒有回傳 -1
  _next(n) {
    const dist = this.dist, inf = this.ninfo[n], DOFF = this.DOFF;
    let bd = dist[n], best = -1;
    for (let d = 0; d < 8; d++) {
      if (!(inf & (1 << d))) continue;
      const m = n + DOFF[d];
      if (dist[m] < bd) { bd = dist[m]; best = m; }
    }
    if (inf & 256) {
      const xs = this.xEdges.get(n);
      for (let k = 0; k < xs.length; k++) { const m = xs[k] >> 2; if (dist[m] < bd) { bd = dist[m]; best = m; } }
    }
    return best;
  }

  // 爬行者的窄縫/低矮捷徑:附近 3.5m 內找一條「一般殭屍過不去(沒有導航節點)、爬行者過得去」
  // (半徑 0.3、頭上只需 0.62m 淨空 → 家具間 0.6~0.8m 的窄縫、桌下)而且出口的路徑距離省很多的直線;
  // 找到時把方向寫進 out 並回傳 true
  crawlDir(x, y, z, out) {
    const n = this._nodeNear(x, y, z, 2);
    if (n < 0) return false;
    const d0 = this.dist[n];
    if (d0 === INF) return false;
    const gh = this.gh, W = this.W;
    let best = 1.5, bx = 0, bz = 0;
    for (let a = 0; a < 16; a++) {
      const dx = CDX[a], dz = CDZ[a];
      let h = y, gap = false;
      for (let s = 1; s <= 14; s++) {
        const l = s * 0.25, px = x + dx * l, pz = z + dz * l;
        const g = this._navFind(Math.floor(px / FINE), Math.floor(pz / FINE), h);
        if (g >= 0) {
          h = gh[g];
          if (gap) { // 穿過窄縫回到一般節點:省下的路徑距離
            const gain = (d0 - this.dist[g]) * (FINE / 2) - l;
            if (this.dist[g] !== INF && gain > best) { best = gain; bx = dx; bz = dz; }
            break;
          }
          continue;
        }
        const c = Math.floor(px / 2), r = Math.floor(pz / 2);
        if (c < 0 || r < 0 || c >= W || r >= this.H) break;
        const hh = this._pick(r * W + c, px, pz, h, h + STEP, STEP);
        if (hh !== hh || !this._navFree(px, pz, hh, 0.3, 0, 0.62)) break;
        h = hh;
        gap = true;
      }
    }
    if (best <= 1.5) return false;
    out.x = bx; out.z = bz;
    return true;
  }

  // (x,z) 所在細格是否有與高度 y 連續的導航節點(卡住時找空的一側用)
  isNode(x, y, z) {
    if (!this.navM) return false;
    return this._navFind(Math.floor(x / FINE), Math.floor(z / FINE), y) >= 0;
  }

  // 最近導航節點的中心(被擠到節點外時拉回導航圖);沒有回傳 null
  navSnap(x, y, z, out) {
    const n = this._nodeNear(x, y, z, 4);
    if (n < 0) return null;
    const r = n % this.FN;
    out.x = ((r % this.fw) + 0.5) * FINE;
    out.z = (((r / this.fw) | 0) + 0.5) * FINE;
    out.y = this.gh[n];
    return out;
  }

  // 往 (dx,dz) 前進時擋住的是什麼:'cell'(牆/欄杆/窗/障礙物/挑空)、'box'(道具,存在 this.hitBox)或 null
  blockedBy(x, y, z, dx, dz, r) {
    const ax = x + dx * (r + 0.15), az = z + dz * (r + 0.15);
    if (!this._pass(Math.floor(ax / 2), Math.floor(az / 2), ax, az, y, y + STEP)) return 'cell';
    const idx = this._idx(ax, az);
    if (idx < 0) return 'cell';
    const list = this.boxGrid[idx];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.maxY <= y + BOX_STEP || b.minY >= y + BODY_H) continue;
      const nx = ax < b.minX ? b.minX : ax > b.maxX ? b.maxX : ax, nz = az < b.minZ ? b.minZ : az > b.maxZ ? b.maxZ : az;
      if ((ax - nx) * (ax - nx) + (az - nz) * (az - nz) < r * r) { this.hitBox = b; return 'box'; }
    }
    return null;
  }

  // 樓梯踏面高度與坡面的差(角色腳底對齊實體踏階,±半階高;踏階算法同 hospital/stairs.js);坡道回傳 0
  stepOffset(k, x, z) {
    if (k < 0 || this.sRamp[k]) return 0;
    const s = this.layout.stairs[k], len = Math.abs(s.highAt - s.lowAt), rise = s.yHigh - s.yLow;
    const u = ((s.axis === 'z' ? z : x) - s.lowAt) * (s.highAt > s.lowAt ? 1 : -1);
    if (u <= 0 || u >= len) return 0;
    const N = this.sN[k], i = Math.min(N - 1, Math.floor((u * N) / len));
    return (rise / N) * (i + 0.5) - (rise * u) / len;
  }

  // 沿導航路徑到最近目標的距離(公尺),不可達回傳 Infinity
  flowDistance(x, y, z) {
    if (z === undefined) { z = y; y = 0; }
    const n = this._nodeNear(x, y, z, 3);
    if (n < 0 || this.dist[n] === INF) return Infinity;
    return this.dist[n] * (FINE / 2);
  }

  // 前往最近目標的水平方向(單位向量,會引導上下樓梯);找不到路回傳 null。舊的 (x, z, out) 仍相容。
  // look = 2:往前看兩個節點(路徑較平順);1:對準下一個節點中心(卡住時重新找路用,不切角)
  flowDir(x, y, z, out, look = 2) {
    if (typeof z === 'object') { out = z; z = y; y = 0; }
    const n = this._nodeNear(x, y, z, 3);
    if (n < 0) return null;
    const d0 = this.dist[n];
    if (d0 === INF || d0 === 0) return null;
    const m1 = this._next(n);
    if (m1 < 0) return null;
    const m2 = look > 1 ? this._next(m1) : -1; // 再往前看一步,讓路徑較平順
    const { FN, fw } = this;
    let r = (m2 >= 0 ? m2 : m1) % FN;
    let tx = ((r % fw) + 0.5) * FINE - x, tz = (((r / fw) | 0) + 0.5) * FINE - z;
    let l = Math.sqrt(tx * tx + tz * tz);
    if (l < 0.05) { r = m1 % FN; tx = ((r % fw) + 0.5) * FINE - x; tz = (((r / fw) | 0) + 0.5) * FINE - z; l = Math.sqrt(tx * tx + tz * tz); }
    if (l < 1e-6) return null;
    out.x = tx / l;
    out.z = tz / l;
    return out;
  }
}
