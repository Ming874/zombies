// 靜態碰撞:依 levels.js 的 parseLayout() 建立(主線程合併新地圖後即對上),舊單層 World 則退回 isSolidCell 網格。
// 同樓層同種類的格子用貪婪合併成大方塊(樓板/牆/窗框上下段/門楣),欄杆與圍籬沿線合成薄板,樓梯是凸包楔形坡道。
// 輸出純資料(Float32Array),可直接傳給 Worker。每個方塊 10 個數:中心(3) + 半長(3) + 四元數(4)

const OBST_H = { car: 1.5, police_car: 1.5, ambulance: 2.6, ambulance_crash: 2.6, hearse: 1.6, dumpster: 1.4, generator: 1.6, incinerator: 3, fountain: 1.2, statue: 3.2, water_tower: 4, ac_unit: 1.4, barricade: 1.1 };
const DOOR_H = 2.2; // 門洞高度(以上是門楣)
const RAIL_T = 0.4, FENCE_T = 0.15, FENCE_H = 2.2;

// 貪婪合併:回傳 [c0, r0, c1, r1](含端點)
export function greedy(W, H, pred) {
  const used = new Uint8Array(W * H), res = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (used[r * W + c] || !pred(c, r)) continue;
    let c1 = c;
    while (c1 + 1 < W && !used[r * W + c1 + 1] && pred(c1 + 1, r)) c1++;
    let r1 = r;
    grow: while (r1 + 1 < H) {
      for (let x = c; x <= c1; x++) if (used[(r1 + 1) * W + x] || !pred(x, r1 + 1)) break grow;
      r1++;
    }
    for (let y = r; y <= r1; y++) for (let x = c; x <= c1; x++) used[y * W + x] = 1;
    res.push([c, r, c1, r1]);
  }
  return res;
}

function collector() {
  const a = [];
  return {
    a,
    // 軸對齊方塊(最小角 → 最大角)
    box(x0, y0, z0, x1, y1, z1) {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
      a.push((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, 0, 0, 0, 1);
    },
  };
}

// 沿行/列的連續格子 → 線段(長度 ≥ 2 的才算;孤立格另外處理)
function runs(W, H, pred) {
  const hor = [], ver = [], lone = [];
  const inH = new Uint8Array(W * H), inV = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!pred(c, r) || inH[r * W + c]) continue;
    let c1 = c;
    while (c1 + 1 < W && pred(c1 + 1, r)) c1++;
    if (c1 > c) { hor.push([r, c, c1]); for (let x = c; x <= c1; x++) inH[r * W + x] = 1; }
  }
  for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) {
    if (!pred(c, r) || inV[r * W + c]) continue;
    let r1 = r;
    while (r1 + 1 < H && pred(c, r1 + 1)) r1++;
    if (r1 > r) { ver.push([c, r, r1]); for (let y = r; y <= r1; y++) inV[y * W + c] = 1; }
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (pred(c, r) && !inH[r * W + c] && !inV[r * W + c]) lone.push([c, r]);
  return { hor, ver, lone };
}

// 新多樓層地圖
export function staticFromLayout(L) {
  const C = L.CELL, F = L.F, out = collector(), hulls = [];
  const SOLIDISH = F.WALL | F.WINDOW | F.ELEVATOR;
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    const fl = (c, r) => L.flagsAt(li, c, r);
    const rect = (pred, y0, y1) => { for (const [c0, r0, c1, r1] of greedy(L.W, L.H, pred)) out.box(c0 * C, y0, r0 * C, (c1 + 1) * C, y1, (r1 + 1) * C); };
    rect((c, r) => L.hasFloor(li, c, r), y - L.SLAB, y); // 樓板(含牆底下)
    rect((c, r) => (fl(c, r) & (F.WALL | F.ELEVATOR)) !== 0, y, y + L.CEIL_H); // 實牆、電梯井
    rect((c, r) => (fl(c, r) & F.WINDOW) !== 0, y, y + L.WINDOW_SILL); // 破窗:窗台以下
    rect((c, r) => (fl(c, r) & F.WINDOW) !== 0, y + L.WINDOW_TOP, y + L.CEIL_H); // 破窗:窗楣以上
    // 門楣:門口格兩側(同一軸)都是牆/窗時才有
    rect((c, r) => (fl(c, r) & F.DOOR) !== 0 && Number.isFinite(L.ceilY(li, c, r))
      && (((fl(c - 1, r) & SOLIDISH) && (fl(c + 1, r) & SOLIDISH)) || ((fl(c, r - 1) & SOLIDISH) && (fl(c, r + 1) & SOLIDISH))), y + DOOR_H, y + L.CEIL_H);
    // 欄杆/櫃台/矮牆與鐵欄杆:沿線方向的薄板(在格子中線)
    for (const [flag, t, h] of [[F.RAIL, RAIL_T, L.RAIL_H], [F.FENCE, FENCE_T, FENCE_H]]) {
      const { hor, ver, lone } = runs(L.W, L.H, (c, r) => (fl(c, r) & flag) !== 0);
      for (const [r, c0, c1] of hor) out.box(c0 * C, y, (r + 0.5) * C - t / 2, (c1 + 1) * C, y + h, (r + 0.5) * C + t / 2);
      for (const [c, r0, r1] of ver) out.box((c + 0.5) * C - t / 2, y, r0 * C, (c + 0.5) * C + t / 2, y + h, (r1 + 1) * C);
      for (const [c, r] of lone) {
        // 孤立格:沿著兩側是牆的方向延伸,否則整格
        const ew = (fl(c - 1, r) & SOLIDISH) && (fl(c + 1, r) & SOLIDISH), ns = (fl(c, r - 1) & SOLIDISH) && (fl(c, r + 1) & SOLIDISH);
        if (ew) out.box(c * C, y, (r + 0.5) * C - t / 2, (c + 1) * C, y + h, (r + 0.5) * C + t / 2);
        else if (ns) out.box((c + 0.5) * C - t / 2, y, r * C, (c + 0.5) * C + t / 2, y + h, (r + 1) * C);
        else out.box(c * C + 0.3, y, r * C + 0.3, (c + 1) * C - 0.3, y + h, (r + 1) * C - 0.3);
      }
    }
  }
  // 屋頂(頂層之上)
  const top = L.levels[L.levels.length - 1];
  for (const [c0, r0, c1, r1] of greedy(L.W, L.H, (c, r) => L.roofed(c, r))) out.box(c0 * C, top.y + L.CEIL_H, r0 * C, (c1 + 1) * C, top.y + L.LEVEL_H, (r1 + 1) * C);
  // 大型障礙物(實際模型的碰撞盒另外由 world.boxes 補上)
  for (const o of L.obstacles || []) {
    const h = OBST_H[o.kind] ?? 1.5;
    out.box(o.x - o.sx * 0.45, o.y, o.z - o.sz * 0.45, o.x + o.sx * 0.45, o.y + h, o.z + o.sz * 0.45);
  }
  // 樓梯:三角柱坡道(低端在 lowAt、高端在 highAt)
  for (const s of L.stairs || []) {
    const pts = [];
    const lo = s.lowAt, hi = s.highAt, y0 = s.yLow - 0.05;
    if (s.axis === 'z') {
      for (const x of [s.x0, s.x1]) pts.push(x, y0, lo, x, y0, hi, x, s.yHigh, hi, x, s.yLow, lo);
    } else {
      for (const z of [s.z0, s.z1]) pts.push(lo, y0, z, hi, y0, z, hi, s.yHigh, z, lo, s.yLow, z);
    }
    hulls.push(new Float32Array(pts));
  }
  return { boxes: new Float32Array(out.a), hulls };
}

// 舊單層 World(isSolidCell 網格,牆高 3.2m,地面 y=0)
export function staticFromGrid(world, wallH = 3.2) {
  const C = 2, out = collector();
  for (const [c0, r0, c1, r1] of greedy(world.w, world.h, (c, r) => world.isSolidCell(c, r))) out.box(c0 * C, -0.5, r0 * C, (c1 + 1) * C, wallH, (r1 + 1) * C);
  const sx = world.w * C, sz = world.h * C;
  out.box(-4, -1, -4, sx + 4, 0, sz + 4); // 地板
  out.box(-4, wallH, -4, sx + 4, wallH + 0.6, sz + 4); // 天花板
  return { boxes: new Float32Array(out.a), hulls: [] };
}

// world.boxes(道具碰撞盒){minX,maxX,minZ,maxZ,height,y0} → 方塊參數
export function boxParams(b) {
  const y0 = b.y0 ?? 0, h = b.height ?? 1;
  return [(b.minX + b.maxX) / 2, y0 + h / 2, (b.minZ + b.maxZ) / 2, Math.max(0.01, (b.maxX - b.minX) / 2), Math.max(0.01, h / 2), Math.max(0.01, (b.maxZ - b.minZ) / 2)];
}

export function buildStatic(world, layout) {
  const L = layout || world.layout;
  if (L && L.levels) return { ...staticFromLayout(L), source: 'layout' };
  if (typeof world.isSolidCell === 'function') return { ...staticFromGrid(world), source: 'grid' };
  return { boxes: new Float32Array(0), hulls: [], source: 'none' };
}
