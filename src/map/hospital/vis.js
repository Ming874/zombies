// [draws] 室內可見性(PVS):在 levels.js 的格子上做 2D 視線,決定哪些「區塊」(樓層 × 區域 × 12m 方塊)可能看得到。
// - 牆('#')與電梯('E')整格不透明(shell.js 的牆面就貼在格子邊界上,2D 判定是精確的);
//   窗、門(可能開著)、欄杆、挑空、樓梯開口、戶外都透明 → 保守(寧可多畫)
// - 玩家所在格:9 個取樣點(格心、四角、四邊中點)× 360 條射線;看到的格子再往外擴一格(開放格只擴 4 鄰、牆擴 8 鄰,
//   不會穿過牆)→ 區塊。結果依格子快取
// - 其他樓層:經由「看得到的挑空/樓梯開口格」與附近樓梯當種子,在那一層再做一次 2D 視線(鏈到上下層)
// 結果給 src/map/hospital/batch.js(BatchedMesh 的區塊實例開關)與動態道具使用。
export const TILE = 6; // 區塊邊長(格)= 12m

export function createVis(L) {
  const W = L.W, H = L.H, N = W * H, nL = L.levels.length, CELL = L.CELL;
  const opaque = L.levels.map((lv, li) => {
    const a = new Uint8Array(N);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const ch = L.charAt(li, c, r); a[r * W + c] = ch === '#' || ch === 'E' ? 1 : 0; }
    return a;
  });
  // 往上/往下看得到另一層的開口:上一層這格沒有樓板('o' 挑空、'%' 樓梯開口;建築外的 '_' 不算 → 戶外另外處理)
  // [perf6] 關著的實心門(src/interact/doors.js 的門洞,兩扇都關好、沒有窗):玩家這一層的精細視線(fine)把門洞格當成牆。
  // 其他樓層的種子(粗略、快取很久)照舊當門開著(保守)。opFine = 牆 | 關著的門;doorVer 每層一個版本號(快取鍵的一部分)
  const doorOp = L.levels.map(() => new Uint8Array(N));
  const opFine = opaque.map((a) => a.slice());
  const doorVer = new Uint32Array(nL);
  const holeUp = L.levels.map((lv, li) => {
    const a = new Uint8Array(N);
    if (li + 1 < nL) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const ch = L.charAt(li + 1, c, r); a[r * W + c] = ch === 'o' || ch === '%' ? 1 : 0; }
    return a;
  });
  const holeHere = L.levels.map((lv, li) => {
    const a = new Uint8Array(N);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const ch = L.charAt(li, c, r); a[r * W + c] = ch === 'o' || ch === '%' ? 1 : 0; }
    return a;
  });
  // ---- 區塊:樓層 × 區域(沒有區域的格子 = 牆/戶外,依方塊)× 12m 方塊 ----
  const zoneIdx = new Map(L.zones.map((z, i) => [z, i]));
  const keyToId = new Map(), regions = []; // regions[id] = { li, zi, tx, tz }
  const cellReg = L.levels.map((lv, li) => {
    const a = new Int32Array(N);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const z = L.zoneAt(li, c, r), zi = z ? zoneIdx.get(z) : -1, tx = Math.floor(c / TILE), tz = Math.floor(r / TILE);
      const k = li + '|' + zi + '|' + tx + '|' + tz;
      let id = keyToId.get(k);
      if (id === undefined) { id = regions.length; keyToId.set(k, id); regions.push({ li, zi, tx, tz }); }
      a[r * W + c] = id;
    }
    return a;
  });
  const nR = regions.length;
  const levelRegs = L.levels.map((lv, li) => Int32Array.from([...new Set(cellReg[li])]));
  const SEED_BUDGET = 3; // ms
  const clampC = (c) => (c < 0 ? 0 : c >= W ? W - 1 : c), clampR = (r) => (r < 0 ? 0 : r >= H ? H - 1 : r);
  const regionAtCell = (li, c, r) => cellReg[Math.max(0, Math.min(nL - 1, li))][clampR(r) * W + clampC(c)];
  const regionAt = (li, x, z) => regionAtCell(li, Math.floor(x / CELL), Math.floor(z / CELL));
  const opaqueAt = (li, c, r) => c < 0 || r < 0 || c >= W || r >= H ? 1 : opaque[Math.max(0, Math.min(nL - 1, li))][r * W + c];

  // ---- 2D 視線:從 (px,pz)(格子單位)射出 nRay 條射線,把經過的格子標到 mask ----
  const RAYS = 256; // 1.4°:80m 外約 2m 一條,再加上外擴一格
  const cosT = new Float32Array(RAYS), sinT = new Float32Array(RAYS);
  for (let i = 0; i < RAYS; i++) { const a = ((i + 0.5) / RAYS) * Math.PI * 2; cosT[i] = Math.cos(a); sinT[i] = Math.sin(a); }
  function cast(op, mask, px, pz, maxD) {
    const c0 = Math.floor(px), r0 = Math.floor(pz);
    if (c0 < 0 || r0 < 0 || c0 >= W || r0 >= H) return;
    mask[r0 * W + c0] = 1;
    for (let i = 0; i < RAYS; i++) {
      const dx = cosT[i], dz = sinT[i];
      let c = c0, r = r0;
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9, tdz = dz !== 0 ? Math.abs(1 / dz) : 1e9;
      let tx = dx !== 0 ? (dx > 0 ? c + 1 - px : px - c) * tdx : 1e9;
      let tz = dz !== 0 ? (dz > 0 ? r + 1 - pz : pz - r) * tdz : 1e9;
      for (;;) {
        let t;
        if (tx < tz) { t = tx; c += sx; tx += tdx; } else { t = tz; r += sz; tz += tdz; }
        if (t > maxD || c < 0 || r < 0 || c >= W || r >= H) break;
        const k = r * W + c;
        mask[k] = 1;
        if (op[k]) break;
      }
    }
  }
  // 9 個取樣點(玩家在格子裡任何位置都涵蓋)或只用格心(種子)
  const SAMPLES9 = [[0.5, 0.5], [0.04, 0.04], [0.96, 0.04], [0.04, 0.96], [0.96, 0.96]]; // 格心 + 四角
  const SAMPLES1 = [[0.5, 0.5]];
  const raw = new Uint8Array(N), dil = new Uint8Array(N);
  const stamp = new Int32Array(nR);
  let stampN = 1;
  const cache = new Map();
  let maxCells = 40;
  // 結果:own = 這層看得到的區塊;col[j] = 同一批「格子位置」在第 j 層的區塊(其他層的結構:外牆、天井對面的窗);
  // up / down = 看得到的開口格(往上 / 往下一層的種子)
  function compute(li, c, r, fine) {
    const key = ((li * H + r) * W + c) * 2 + (fine ? 1 + doorVer[li] * 65536 : 0);
    let res = cache.get(key);
    if (res) return res;
    raw.fill(0);
    const op = fine ? opFine[li] : opaque[li];
    for (const [ox, oz] of fine ? SAMPLES9 : SAMPLES1) cast(op, raw, c + ox, r + oz, maxCells);
    dil.set(raw);
    for (let rr = 0; rr < H; rr++) for (let cc = 0; cc < W; cc++) {
      const k = rr * W + cc;
      if (!raw[k] || op[k]) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const c2 = cc + dc, r2 = rr + dr;
        if ((!dc && !dr) || c2 < 0 || r2 < 0 || c2 >= W || r2 >= H) continue;
        const k2 = r2 * W + c2;
        if (op[k2] || (dc === 0 || dr === 0)) dil[k2] = 1; // 開放格只擴 4 鄰;牆面(不透明格)8 鄰都算
      }
    }
    const lists = [];
    for (let j = 0; j < nL; j++) {
      const out = [];
      stampN++;
      const cr = cellReg[j];
      for (let k = 0; k < N; k++) if (dil[k] && stamp[cr[k]] !== stampN) { stamp[cr[k]] = stampN; out.push(cr[k]); }
      lists.push(Int32Array.from(out));
    }
    const up = [], down = [];
    const hu = holeUp[li], hh = holeHere[li];
    for (let k = 0; k < N; k++) { if (!raw[k]) continue; if (hu[k]) up.push(k); if (hh[k]) down.push(k); }
    res = { own: lists[li], col: lists, up: Int32Array.from(up), down: Int32Array.from(down) };
    if (cache.size > 2500) { let k = 0; for (const key0 of cache.keys()) { cache.delete(key0); if (++k >= 400) break; } } // 丟掉最舊的一批(不整個清空 → 不會一次重算一大堆)
    cache.set(key, res);
    return res;
  }

  // ---- 目前的可見區塊(旗標陣列)----
  const own = new Uint8Array(nR), col = new Uint8Array(nR), other = new Uint8Array(nR);
  const mark = (arr, list) => { for (let i = 0; i < list.length; i++) arr[list[i]] = 1; };
  let last = -1, lastDV = -1, version = 0; // 上次的(樓層, 格子, 附近樓梯)組合鍵(數字:每幀比對不配置字串)+ 那一層的門版本
  const todo = [];
  // 種子去重:每 2×2 格只取一格(固定挑區塊內第一個不透明以外的格子 → 閒置預算與即時查詢用同一格,快取命中)
  const canon = (j, k) => {
    if (j < 0 || j >= nL) return -1;
    const bc = (k % W) & ~1, br = ((k / W) | 0) & ~1;
    for (const [dc, dr] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const c = bc + dc, r = br + dr; if (c < W && r < H && !opaque[j][r * W + c]) return r * W + c; }
    return -1;
  };
  const uniq = (j, a) => { const out = new Set(); for (const k of a) { const q = canon(j, k); if (q >= 0) out.add(q); } return [...out]; };
  const api = {
    regions, nR, regionAt, regionAtCell, opaqueAt, cellReg, TILE,
    own, col, other, // own:玩家這層看得到;col:看得到的格子位置在各層的區塊;other:經由開口/樓梯看到的其他層
    get version() { return version; },
    // 距離變短時沿用舊結果(看得比較遠 = 保守);變長才清快取(畫質切換,不是每幀的動態解析度)
    setMaxDistance(m) { const n = Math.ceil(m / CELL) + 2; if (n > maxCells) { maxCells = n; cache.clear(); last = -1; } },
    // stairs:[{ lo, hi, cells:[[c,r],...] }](玩家附近、連通兩層的樓梯);outdoor:玩家在戶外
    update(li, x, z, stairs) {
      const c = clampC(Math.floor(x / CELL)), r = clampR(Math.floor(z / CELL));
      let sm = 0;
      for (let i = 0; i < stairs.length; i++) sm |= 1 << (stairs[i].id & 31);
      const sk = (((li * H + r) * W + c) * 4294967296) + (sm >>> 0);
      if (sk === last && doorVer[li] === lastDV) return false;
      last = sk; lastDV = doorVer[li];
      own.fill(0); col.fill(0); other.fill(0);
      // 其他樓層的種子還沒算過、這一幀的時間又用完了:那一層先整層當作看得到(多畫幾幀,不會缺),種子排進閒置佇列,下一幀再算
      const t0 = performance.now();
      const pending = new Set();
      const seedVis = (j, k) => {
        const key = ((j * H + ((k / W) | 0)) * W + (k % W)) * 2;
        if (!cache.has(key) && performance.now() - t0 > SEED_BUDGET) { pending.add(j); todo.push([j, k % W, (k / W) | 0, false]); return null; }
        return compute(j, k % W, (k / W) | 0, false);
      };
      const me = compute(li, c, r, true);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dc || dr) api.queue(li, c + dc, r + dr, true);
      mark(own, me.own);
      for (let j = 0; j < nL; j++) mark(col, me.col[j]);
      // 經由開口往上/往下鏈(每層的種子 = 上一步看得到的開口格)
      const seedLevel = (j, seeds) => {
        const ups = [], downs = [];
        for (const k of seeds) {
          const v = seedVis(j, k);
          if (!v) continue;
          mark(other, v.own);
          for (let t = 0; t < v.up.length; t++) ups.push(v.up[t]);
          for (let t = 0; t < v.down.length; t++) downs.push(v.down[t]);
        }
        return { ups, downs };
      };
      // 種子去重:每 2×2 格取一個(相鄰格看到的幾乎一樣;結果還會再外擴一格)
      let seeds = uniq(li + 1, me.up);
      for (let j = li + 1; j < nL && seeds.length; j++) seeds = uniq(j + 1, seedLevel(j, seeds).ups);
      seeds = uniq(li - 1, me.down);
      for (let j = li - 1; j >= 0 && seeds.length; j--) seeds = uniq(j - 1, seedLevel(j, seeds).downs);
      // 附近的樓梯:在連通的那一層,從樓梯格(含外圍一圈;每 2×2 取一格)做視線
      for (const s of stairs) {
        const j = s.lo === li ? s.hi : s.lo;
        for (const k of uniq(j, s.cells.filter(([sc, sr]) => sc >= 0 && sr >= 0 && sc < W && sr < H).map(([sc, sr]) => sr * W + sc))) {
          const v = seedVis(j, k);
          if (v) mark(other, v.own);
        }
      }
      for (const j of pending) mark(other, levelRegs[j]);
      if (pending.size) last = -1; // 下一幀(種子算好後)再精算一次
      version++;
      return true;
    },
    // 閒置時先算好:樓梯與挑空開口格(其他樓層的種子)、玩家目前格子的鄰格(走過去時就不用當場算)。每幀最多 budget ms
    queue(li, c, r, fine) { if (c >= 0 && r >= 0 && c < W && r < H && !opaque[li][r * W + c]) todo.push([li, c, r, fine]); },
    queueSeed(li, c, r) { if (c < 0 || r < 0 || c >= W || r >= H) return; const k = canon(li, r * W + c); if (k >= 0) todo.push([li, k % W, (k / W) | 0, false]); },
    idle(budget = 0.8) {
      if (!todo.length) return 0;
      const t0 = performance.now();
      let n = 0;
      while (todo.length && performance.now() - t0 < budget) { const [li, c, r, fine] = todo.pop(); compute(li, c, r, fine); n++; }
      return n;
    },
    // [perf6] 門洞格 (li,c,r) 是否被關著的實心門擋住;有變才改版本號(回傳 true)。下一次 update 重算玩家這一層的精細視線
    setDoor(li, c, r, closed) {
      if (li < 0 || li >= nL || c < 0 || r < 0 || c >= W || r >= H) return false;
      const k = r * W + c, v = closed ? 1 : 0;
      if (doorOp[li][k] === v) return false;
      doorOp[li][k] = v;
      opFine[li][k] = opaque[li][k] | v;
      doorVer[li]++;
      return true;
    },
    closedDoors() { let n = 0; for (const a of doorOp) for (let k = 0; k < N; k++) n += a[k]; return n; },
    invalidate() { cache.clear(); last = -1; },
    stats: () => ({ regions: nR, cached: cache.size }),
  };
  return api;
}
