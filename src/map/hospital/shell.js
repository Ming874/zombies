import * as THREE from 'three';
import { prng, hashStr } from './paint.js';
import { surfSize, isRoomMapped } from './surfaces.js';
import { wallRecipe, floorKey, ceilKey, zoneTint, zoneWear, FACADE, COURT, BOUNDARY, revealFor } from './style.js';
import { ceilServices, pipeExtras } from './ceilsvc.js';

// 建築外殼:地板、牆(上下段 + 收邊)、窗台/窗楣、天花板(含缺塊與夾層)、樓板邊、牆頂、屋頂與女兒牆、拱頂、管線。
// 會把每面牆的資訊(位置、法線、區域、配方)記錄在 K.faces,給貼花/標示/燈具使用。
export const DIRS = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
const WALLISH = (ch) => ch === '#' || ch === 'E' || ch === 'W';
const FULLWALL = (ch) => ch === '#' || ch === 'E';
export const ARROW = (ch) => ch === '^' || ch === 'v' || ch === '<' || ch === '>';
export const BOUNDARY_H = 3.0;

// 平滑的位置雜訊(頂點色用;相鄰格共用角點值 → 無接縫)
export function vnoise(x, y, z) {
  return 1 + 0.055 * Math.sin(x * 0.37 + z * 0.23 + 1.3) * Math.sin(z * 0.31 - y * 0.6 + 0.7) + 0.035 * Math.sin(x * 1.13 + z * 0.71 + y * 0.4) + 0.02 * Math.sin(x * 2.7 - z * 2.3);
}
const mulc = (t, k) => [t[0] * k, t[1] * k, t[2] * k];

export function createShellContext(L, B) {
  const K = { L, B, faces: [], doors: [], windows: [], rails: [], fences: [], ceilings: [], R: prng(20240611) };
  const nL = L.levels.length;
  K.ch = (li, c, r) => L.charAt(li, c, r);
  // 空間所屬區域:'o'/'%' 往下找到真正的地面層
  K.spaceZone = (li, c, r) => {
    for (let lj = li; lj >= 0; lj--) {
      const ch = L.charAt(lj, c, r);
      if (ch === 'o' || ch === '%') continue;
      if (ch === '_') return null;
      return { zone: L.zoneAt(lj, c, r), li: lj };
    }
    return null;
  };
  K.outdoorAt = (li, c, r) => {
    const ch = L.charAt(li, c, r);
    if (ch === '_') return true;
    if (ch === 'o' || ch === '%') { const s = K.spaceZone(li, c, r); return !s || (L.flagsAt(s.li, c, r) & L.F.OUTDOOR) !== 0 || L.ceilY(s.li, c, r) === Infinity && !L.inBuilding(c, r); }
    return (L.flagsAt(li, c, r) & L.F.OUTDOOR) !== 0 || ch === '|';
  };
  // 牆面上緣(相對於樓層地面):鄰格天花板或整層高
  K.faceTop = (li, c, r) => {
    const y = L.levels[li].y, cy = L.ceilY(li, c, r);
    return Math.min(L.LEVEL_H, cy - y);
  };
  K.levelTop = nL - 1;
  // 某格(牆面朝向的那一側)應該用哪種牆面:外牆 / 中庭外牆 / 區域配方
  K.sideStyle = (li, nc, nr, at = null) => {
    const lvId = L.levels[li].id;
    if (K.outdoorAt(li, nc, nr)) return { recipe: L.inBuilding(nc, nr) ? COURT : FACADE, zone: null, kind: 'facade' };
    const nch = L.charAt(li, nc, nr);
    const sz = K.spaceZone(li, nc, nr);
    const zone = sz ? sz.zone : null;
    const zl = sz ? L.levels[sz.li].id : lvId;
    const recipe = wallRecipe(zone || (nch === '=' || nch === '+' ? L.zoneAt(li, nc, nr - 1) || L.zoneAt(li, nc, nr + 1) || L.zoneAt(li, nc - 1, nr) || L.zoneAt(li, nc + 1, nr) : null), zl, at);
    return { recipe, zone, kind: 'room' };
  };
  // 門的資料:通行軸、高度、是否雙開
  const doorCache = new Map();
  K.door = (li, c, r) => {
    const key = `${li},${c},${r}`;
    if (doorCache.has(key)) return doorCache.get(key);
    const isD = (cc, rr) => L.charAt(li, cc, rr) === '+';
    let axis = null, c0 = c, c1 = c, r0 = r, r1 = r;
    while (isD(c0 - 1, r)) c0--; while (isD(c1 + 1, r)) c1++;
    while (isD(c, r0 - 1)) r0--; while (isD(c, r1 + 1)) r1++;
    if (WALLISH(L.charAt(li, c0 - 1, r)) && WALLISH(L.charAt(li, c1 + 1, r)) && c1 - c0 <= 2) axis = 'z';
    else if (WALLISH(L.charAt(li, c, r0 - 1)) && WALLISH(L.charAt(li, c, r1 + 1)) && r1 - r0 <= 2) axis = 'x';
    const span = axis === 'z' ? c1 - c0 + 1 : r1 - r0 + 1;
    const [ca, ra, cb, rb] = axis === 'z' ? [c, r - 1, c, r + 1] : [c - 1, r, c + 1, r];
    const outA = axis && K.outdoorAt(li, ca, ra), outB = axis && K.outdoorAt(li, cb, rb);
    const za = L.zoneAt(li, ca, ra), zb = L.zoneAt(li, cb, rb);
    const lobby = za?.theme === 'lobby' || zb?.theme === 'lobby';
    const h = !axis ? 0 : lobby && (outA || outB) ? 2.9 : span >= 2 ? 2.6 : outA || outB ? 2.5 : 2.3;
    const d = { li, c, r, axis, span, h, outA, outB, za, zb, run: axis === 'z' ? [c0, c1] : [r0, r1] };
    doorCache.set(key, d);
    return d;
  };
  return K;
}

// ======================================================================
// 地板
// ======================================================================
export function buildFloors(K) {
  const { L, B } = K;
  const zoneXf = new Map(); // 每個區域的貼圖旋轉/位移
  const xf = (zone, key) => {
    const id = (zone?.id || 'none') + key;
    let t = zoneXf.get(id);
    if (!t) { const R = prng(hashStr(id)); const s = surfSize(key); t = { rot: R() < 0.4, uOff: R() * s[0], vOff: R() * s[1] }; zoneXf.set(id, t); }
    return t;
  };
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const ch = lv.rows[r][c];
      if (WALLISH(ch) || ARROW(ch) || ch === '_' || ch === 'o' || ch === '%') continue;
      if (ch === '=' && K.railSolid && K.railSolid(li, c, r)) continue;
      const zone = L.zoneAt(li, c, r);
      let key;
      if (ch === '"') key = 'grass';
      else if (ch === '|') key = fenceGround(L, li, c, r);
      else if (ch === '+') { const s = L.zoneAt(li, c, r + 1) || L.zoneAt(li, c, r - 1) || L.zoneAt(li, c + 1, r) || L.zoneAt(li, c - 1, r); key = floorKey(zone || s, lv.id); if (K.outdoorAt(li, c, r)) key = 'concrete'; }
      else key = floorKey(zone, lv.id);
      if (zone?.theme === 'fire_escape') key = lv.id === '1F' ? (ch === '"' ? 'grass' : 'gravel') : 'metal_grate';
      if (!zone && ch === ',' && lv.id === '3F') key = 'roof_gravel';
      if (zone?.theme === 'ramp') key = 'concrete';
      const t = xf(zone, key);
      const x0 = c * L.CELL, z0 = r * L.CELL, x1 = x0 + L.CELL, z1 = z0 + L.CELL;
      const tint = zone ? zoneTint(zone, { up: key }) : [1, 1, 1];
      // 烘焙的接觸陰影:貼牆 0.4m 內漸暗(牆角兩面相乘更暗),也是灰塵堆積的地方;有牆的格子切成 3×3 小塊才有窄的漸層
      const solid = (dc, dr) => { const ch2 = L.charAt(li, c + dc, r + dr); return WALLISH(ch2) || (ch2 === '=' && K.railSolid && K.railSolid(li, c + dc, r + dr)); };
      const sW = solid(-1, 0), sE = solid(1, 0), sN = solid(0, -1), sS = solid(0, 1);
      const cNW = !sW && !sN && solid(-1, -1), cNE = !sE && !sN && solid(1, -1), cSW = !sW && !sS && solid(-1, 1), cSE = !sE && !sS && solid(1, 1);
      const E = 0.42, ao = (px, pz) => {
        const f = (d) => 0.5 + 0.5 * Math.min(1, Math.max(0, d / E)) ** 0.8;
        let k = 1;
        if (sW) k *= f(px - x0); if (sE) k *= f(x1 - px); if (sN) k *= f(pz - z0); if (sS) k *= f(z1 - pz);
        if (cNW) k *= f(Math.hypot(px - x0, pz - z0)); if (cNE) k *= f(Math.hypot(x1 - px, pz - z0));
        if (cSW) k *= f(Math.hypot(px - x0, z1 - pz)); if (cSE) k *= f(Math.hypot(x1 - px, z1 - pz));
        return k;
      };
      const cornerCol = (px, pz) => mulc(tint, vnoise(px, y, pz) * 0.97 * ao(px, pz));
      B.wear = zone ? zoneWear(zone, lv.id) : lv.id === 'B1' ? 0.85 : 0.5;
      const yy = key === 'metal_grate' ? y - 0.02 : y;
      const outdoorCell = (L.flagsAt(li, c, r) & L.F.OUTDOOR) !== 0;
      if (key === 'metal_grate' || outdoorCell || !(sW || sE || sN || sS || cNW || cNE || cSW || cSE)) {
        const col = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]].map(([px, pz]) => cornerCol(px, pz));
        B.flat(li, key, x0, z0, x1, z1, yy, true, { rot: t.rot, uOff: t.uOff, vOff: t.vOff, col });
      } else {
        const xs = [x0, x0 + E, x1 - E, x1], zs = [z0, z0 + E, z1 - E, z1];
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const a0 = xs[i], a1 = xs[i + 1], b0 = zs[j], b1 = zs[j + 1];
          const col = [[a0, b1], [a1, b1], [a1, b0], [a0, b0]].map(([px, pz]) => cornerCol(px, pz));
          B.flat(li, key, a0, b0, a1, b1, yy, true, { rot: t.rot, uOff: t.uOff, vOff: t.vOff, col });
        }
      }
      if (key === 'metal_grate') B.flat(li, 'trim_dark', x0, z0, x1, z1, yy - 0.001, false, {}); // 由下往上看也看得到格柵
    }
  }
}
function fenceGround(L, li, c, r) {
  for (const [, dc, dr] of DIRS) { const ch = L.charAt(li, c + dc, r + dr); if (ch === '"') return 'grass'; }
  return 'gravel';
}

// ======================================================================
// 牆:收集每個外露面 → 依線段合併成 run → 上下段 + 收邊
// ======================================================================
export function buildWalls(K) {
  const { L, B } = K;
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    const segs = [];
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const ch = lv.rows[r][c];
      if (!WALLISH(ch)) continue;
      const boundary = lv.id === '1F' && !L.inBuilding(c, r);
      for (const [dir, dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
        const nch = lv.rows[nr][nc];
        if (FULLWALL(nch)) continue;
        if (nch === 'W' && ch === 'W') continue; // 連續窗:中間是窗框
        const top = boundary ? BOUNDARY_H : K.faceTop(li, nc, nr);
        let spans, recipe, zone = null, kind;
        if (nch === 'W') { // 窗洞側邊(窗框內側)
          if (ch === 'E') continue;
          spans = [[L.WINDOW_SILL, L.WINDOW_TOP]]; recipe = revealFor(lv.id); kind = 'jamb';
        } else if (nch === '+') {
          const d = K.door(li, nc, nr);
          spans = [[0, d.axis ? d.h : top]]; recipe = revealFor(lv.id); kind = 'reveal';
          if (ch === 'W') spans = [[0, Math.min(L.WINDOW_SILL, d.h)], [L.WINDOW_TOP, d.axis ? Math.max(L.WINDOW_TOP, d.h) : top]].filter(([a, b]) => b > a + 0.01);
        } else {
          if (boundary) { recipe = BOUNDARY; kind = 'boundary'; }
          else {
            const st = K.sideStyle(li, nc, nr, dir === 'N' || dir === 'S' ? c * 2 + 1 : r * 2 + 1);
            recipe = st.recipe; zone = st.zone; kind = st.kind;
            if (kind === 'room' && ch === 'E') kind = 'elevator';
          }
          spans = ch === 'W' ? [[0, L.WINDOW_SILL], [L.WINDOW_TOP, top]] : [[0, top]];
          if (zone?.ceil === 'vault') spans = [[0, top + 0.6]];
        }
        // 面的位置
        let fixed, a0, a1;
        if (dir === 'N') { fixed = r * 2; a0 = c * 2; a1 = a0 + 2; }
        else if (dir === 'S') { fixed = (r + 1) * 2; a0 = c * 2; a1 = a0 + 2; }
        else if (dir === 'E') { fixed = (c + 1) * 2; a0 = r * 2; a1 = a0 + 2; }
        else { fixed = c * 2; a0 = r * 2; a1 = a0 + 2; }
        segs.push({ li, dir, fixed, a0, a1, spans, recipe, zone, kind, c, r, nc, nr, win: ch === 'W', elev: ch === 'E' });
      }
    }
    // 合併成 run
    segs.sort((p, q) => (p.dir < q.dir ? -1 : p.dir > q.dir ? 1 : p.fixed - q.fixed || p.a0 - q.a0));
    let run = null;
    const flush = () => { if (run) emitRun(K, run, y); run = null; };
    for (const s of segs) {
      const same = run && run.dir === s.dir && run.fixed === s.fixed && Math.abs(run.a1 - s.a0) < 1e-6 && run.recipe === s.recipe && run.zone === s.zone && run.kind === s.kind;
      if (same) { run.a1 = s.a1; run.segs.push(s); }
      else { flush(); run = { ...s, segs: [s] }; }
    }
    flush();
  }
}

const normalOf = (dir) => ({ N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir]);
// 把一段 run 畫出來
function emitRun(K, run, y) {
  const { B, L } = K;
  const li = run.li, rc = run.recipe;
  const R = prng(hashStr(`${li}|${run.dir}|${run.fixed}|${run.a0}`));
  const up = rc.up, low = rc.low, dado = rc.dado || 0;
  const sizeU = surfSize(up)[0];
  const uOff = R() * sizeU * 3, flipU = R() < 0.35;
  const tint = zoneTint(run.zone, rc);
  const dirt = R.r(0.9, 1.07);
  const [nx, nz] = normalOf(run.dir);
  // 破舊度:配方基準 ± 隨機(有的牆幾乎乾淨,有的整面剝落);外牆/窗洞側邊較平均
  const wear = Math.min(1, Math.max(0, (rc.wear ?? 0.6) + (run.kind === 'room' ? R.r(-0.35, 0.4) : R.r(-0.15, 0.15))));
  B.wear = wear;
  run.wear = wear;
  // 每個 2m 段一組四邊形(頂點色依位置變化;貼圖連續)
  const colAt = (a, h) => {
    const px = run.dir === 'N' || run.dir === 'S' ? a : run.fixed, pz = run.dir === 'N' || run.dir === 'S' ? run.fixed : a;
    const v = vnoise(px, y + h, pz) * dirt;
    const g = h < 0.05 ? 0.8 : h < 0.4 ? 0.92 : h > 3.2 ? 0.9 : 1; // 牆腳髒、頂端燻黑
    return mulc(tint, v * g);
  };
  for (const s of run.segs) {
    for (const [s0, s1] of s.spans) {
      const bands = [];
      if (low && dado > s0 + 0.01) bands.push([low, s0, Math.min(dado, s1)]);
      if (s1 > Math.max(s0, low ? dado : s0) + 0.01) bands.push([up, low ? Math.max(s0, dado) : s0, s1]);
      for (const [key, b0, b1] of bands) {
        const room = isRoomMapped(key);
        // 分成數段高度,讓頂點色有牆腳/天花板的漸層
        const cuts = [b0];
        for (const hc of [0.04, 0.4, 3.2]) if (hc > b0 + 0.02 && hc < b1 - 0.02) cuts.push(hc);
        cuts.push(b1);
        for (let k = 0; k < cuts.length - 1; k++) {
          const h0 = cuts[k], h1 = cuts[k + 1];
          B.wall(li, key, run.dir, run.fixed, s.a0, s.a1, y + h0, y + h1, {
            uOff, flipU, vBase: room ? y : 0, col4: [colAt(s.a0, h0), colAt(s.a1, h0), colAt(s.a1, h1), colAt(s.a0, h1)],
          });
        }
      }
    }
  }
  // 收邊(整段 run 連續)
  const spans = run.segs[0].spans;
  const full = spans.length === 1 && spans[0][0] === 0;
  const off = (d) => run.fixed + (run.dir === 'S' || run.dir === 'E' ? d : -d);
  const trim = (key, h0, h1, depth, a0 = run.a0, a1 = run.a1) => {
    if (!key) return;
    const f0 = run.fixed, f1 = off(depth);
    const [lo, hi] = f0 < f1 ? [f0, f1] : [f1, f0];
    if (run.dir === 'N' || run.dir === 'S') B.box(li, key, a0, y + h0, lo, a1, y + h1, hi, { skip: run.dir === 'S' ? 'N' : 'S' });
    else B.box(li, key, lo, y + h0, a0, hi, y + h1, a1, { skip: run.dir === 'E' ? 'W' : 'E' });
  };
  const anyLow = spans.some(([a]) => a === 0);
  if (anyLow && rc.base && run.kind !== 'jamb') trim(rc.base, 0, rc.base === 'trim_wood' || rc.base === 'trim_stone' ? 0.16 : 0.11, 0.018);
  if (full && rc.rail && dado) trim(rc.rail, dado - 0.03, dado + 0.035, 0.03);
  if (full && rc.bumper) trim(rc.bumper, 0.82, 1.0, 0.035);
  if (full && rc.stripe && run.kind !== 'reveal') trim(rc.stripe, 1.02, 1.17, 0.004);
  if (full && rc.hand && run.kind === 'room' && run.a1 - run.a0 >= 3.9) { // 走廊扶手(含支架)
    trim(rc.hand, 0.88, 0.94, 0.1, run.a0 + 0.3, run.a1 - 0.3);
    for (let a = run.a0 + 0.6; a < run.a1 - 0.4; a += 1.6) trim('trim_steel', 0.86, 0.9, 0.07, a - 0.03, a + 0.03);
  }
  if (full && rc.pilaster && run.kind === 'room') for (let a = run.a0 + 2; a < run.a1 - 1.5; a += 4) trim(rc.pilaster, 0, K.faceTop(li, run.nc, run.nr) - 0.02, 0.14, a - 0.25, a + 0.25);
  if (full && rc.guard && run.kind === 'room') { // 牆角護條(外角)
    for (const [end, a] of [[0, run.a0], [1, run.a1]]) {
      const isH = run.dir === 'N' || run.dir === 'S';
      const cc = isH ? Math.floor((a + (end ? 0.5 : -0.5)) / 2) : run.segs[0].c, rr2 = isH ? run.segs[0].r : Math.floor((a + (end ? 0.5 : -0.5)) / 2);
      if (!WALLISH(L.charAt(li, cc, rr2))) trim(rc.guard, 0.12, 1.5, 0.03, end ? a - 0.04 : a, end ? a : a + 0.04);
    }
  }
  if (full && rc.top && run.kind === 'room') { const ft = K.faceTop(li, run.nc, run.nr); if (ft > 3) trim(rc.top, ft - 0.16, ft - 0.08, 0.025); }
  K.faces.push({ li, y, dir: run.dir, nx, nz, fixed: run.fixed, a0: run.a0, a1: run.a1, spans, zone: run.zone, recipe: rc, kind: run.kind, c: run.c, r: run.r, nc: run.nc, nr: run.nr, top: spans[spans.length - 1][1], win: run.win, wear: run.wear, segs: run.segs });
}

// 窗洞的窗台面與窗楣底面(窗格本身由 openings 畫)
export function buildWindowCells(K) {
  const { L, B } = K;
  for (const lv of L.levels) for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (lv.rows[r][c] !== 'W') continue;
    const li = lv.index, y = lv.y, x0 = c * 2, z0 = r * 2;
    B.flat(li, 'trim_stone', x0, z0, x0 + 2, z0 + 2, y + L.WINDOW_SILL, true, {});
    B.flat(li, 'paint_white', x0, z0, x0 + 2, z0 + 2, y + L.WINDOW_TOP, false, { col: [0.75, 0.75, 0.72] });
    K.windows.push({ li, c, r });
  }
}

// ======================================================================
// 天花板、樓板邊、牆頂、屋頂
// ======================================================================
export function buildCeilings(K) {
  const { L, B, R } = K;
  const nL = L.levels.length;
  const ceilAt = (li, c, r, yC, zone, lvId) => {
    const key = ceilKey(zone, lvId);
    if (key === 'vault_stone') return; // 拱頂另外做
    const x0 = c * 2, z0 = r * 2;
    const tint = zone ? zoneTint(zone, { up: key }) : [0.95, 0.95, 0.95];
    const col = [[x0, z0], [x0 + 2, z0], [x0 + 2, z0 + 2], [x0, z0 + 2]].map(([px, pz]) => mulc(tint, vnoise(px, yC, pz) * 0.95));
    const pipes = zone?.ceil === 'pipes';
    B.wear = zone ? zoneWear(zone, lvId) : 0.6;
    const tiled = key === 'ceil_tile' || key === 'ceil_tile_b' || key === 'ceil_tile_c';
    const hole = tiled && L.charAt(li, c, r) !== '+' && R() < (zone?.light === 'fluoro_dying' ? 0.14 : zone?.mood === 'psych' || zone?.theme === 'surgery' ? 0.02 : 0.05);
    if (!hole) { B.flat(li, key, x0, z0, x0 + 2, z0 + 2, yC, false, { col }); if (tiled) ceilServices(B, li, c, r, yC, zone); } // [scene6] 灑水頭/偵煙器/廣播喇叭/回風口
    else { // 缺了幾片天花板:露出夾層(黑)與吊線;有的沒掉下來,一邊還掛著(下垂)
      const t = 2 / 3, miss = new Set();
      const n = 1 + ((R() * 2.4) | 0);
      for (let k = 0; k < n; k++) miss.add(((R() * 9) | 0));
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const sx = x0 + i * t, sz = z0 + j * t;
        if (!miss.has(j * 3 + i)) { B.flat(li, key, sx, sz, sx + t, sz + t, yC, false, { col: col[0] }); continue; }
        B.box(li, 'trim_plenum', sx, yC, sz, sx + t, yC + 0.55, sz + t, { skip: 'D' });
        plenumGuts(B, li, R, sx, sz, t, yC);
        if (R() < 0.4) { // 下垂的板:沿一邊鉸著,另一邊垂下 20~55°
          const ang = R.r(0.35, 0.95), side = (R() * 4) | 0, d = t * Math.sin(ang), h = t * Math.cos(ang);
          const P = [[sx, sz], [sx + t, sz], [sx + t, sz + t], [sx, sz + t]].map(([px, pz]) => [px, yC - 0.005, pz]);
          // 鉸邊 = side 那一邊;對邊往下垂並往內收
          const hinge = [[0, 1], [1, 2], [2, 3], [3, 0]][side], far = [[3, 2], [0, 3], [1, 0], [2, 1]][side];
          const inward = [[0, -1], [1, 0], [0, 1], [-1, 0]][side]; // 鉸邊的法向(往外)
          for (const k of far) { P[k][0] += inward[0] * (t - h); P[k][2] += inward[1] * (t - h); P[k][1] -= d; }
          const c1 = col[0].map((v) => v * 0.8);
          const [a, b, cc, dd] = [P[hinge[0]], P[hinge[1]], P[far[1]], P[far[0]]];
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = dd[0] - a[0], vy = dd[1] - a[1], vz = dd[2] - a[2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          if (ny > 0) { nx = -nx; ny = -ny; nz = -nz; B.quad(li, key, a, dd, cc, b, [nx, ny, nz], [[a[0], -a[2]], [dd[0], -dd[2]], [cc[0], -cc[2]], [b[0], -b[2]]], c1); }
          else B.quad(li, key, a, b, cc, dd, [nx, ny, nz], [[a[0], -a[2]], [b[0], -b[2]], [cc[0], -cc[2]], [dd[0], -dd[2]]], c1);
          K.ceilings.push({ li, x: sx + t / 2, y: yC, z: sz + t / 2, kind: 'sag' });
        } else K.ceilings.push({ li, x: sx + t / 2, y: yC, z: sz + t / 2, kind: 'hole' });
      }
    }
    if (pipes) K.ceilings.push({ li, x: x0 + 1, y: yC, z: z0 + 1, c, r, zone, kind: 'pipes' });
  };
  for (let lj = 1; lj < nL; lj++) {
    const lv = L.levels[lj], below = L.levels[lj - 1];
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (!L.hasFloor(lj, c, r)) continue;
      const bch = below.rows[r][c];
      const zoneUp = L.zoneAt(lj, c, r);
      const fire = zoneUp?.theme === 'fire_escape';
      if (!WALLISH(bch) && !fire && bch !== '+') {
        const sz = K.spaceZone(lj - 1, c, r);
        ceilAt(lj - 1, c, r, lv.y - L.SLAB, sz ? sz.zone : null, sz ? L.levels[sz.li].id : below.id);
      }
      // 樓板邊
      if (fire) continue;
      for (const [dir, dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (L.hasFloor(lj, nc, nr) && L.zoneAt(lj, nc, nr)?.theme !== 'fire_escape') continue;
        if (WALLISH(bch) || WALLISH(L.charAt(lj - 1, nc, nr))) continue;
        const [fixed, a0, a1] = dir === 'N' ? [r * 2, c * 2, c * 2 + 2] : dir === 'S' ? [(r + 1) * 2, c * 2, c * 2 + 2] : dir === 'E' ? [(c + 1) * 2, r * 2, r * 2 + 2] : [c * 2, r * 2, r * 2 + 2];
        const outside = K.outdoorAt(lj, nc, nr) && !L.inBuilding(nc, nr);
        B.wall(lj, outside ? 'facade' : 'trim_concrete', dir, fixed, a0, a1, lv.y - L.SLAB, lv.y, { vBase: lv.y - L.LEVEL_H, cBot: [0.7, 0.7, 0.68], cTop: [0.85, 0.85, 0.82] });
      }
    }
  }
  // 頂層屋頂:室內天花 + 屋面 + 屋頂女兒牆
  const top = nL - 1, tl = L.levels[top], yRoof = tl.y + L.LEVEL_H;
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (!L.roofed(c, r)) continue;
    const ch = tl.rows[r][c];
    if (!WALLISH(ch) && ch !== '+') { const sz = K.spaceZone(top, c, r); ceilAt(top, c, r, yRoof - L.SLAB, sz ? sz.zone : null, '3F'); }
    const x0 = c * 2, z0 = r * 2;
    B.flat(top, 'roof_gravel', x0, z0, x0 + 2, z0 + 2, yRoof, true, { col: mulc([0.9, 0.9, 0.9], vnoise(x0, 0, z0)) });
    for (const [dir, dc, dr] of DIRS) {
      if (L.roofed(c + dc, r + dr)) continue;
      const [fixed, a0, a1] = dir === 'N' ? [r * 2, c * 2, c * 2 + 2] : dir === 'S' ? [(r + 1) * 2, c * 2, c * 2 + 2] : dir === 'E' ? [(c + 1) * 2, r * 2, r * 2 + 2] : [c * 2, r * 2, r * 2 + 2];
      // 女兒牆(厚 0.3m,高 0.9m),外側與外牆齊平
      const t = 0.3, h = 0.9, inward = dir === 'N' || dir === 'W' ? 1 : -1;
      const f2 = fixed + inward * t;
      if (dir === 'N' || dir === 'S') {
        const [lo, hi] = fixed < f2 ? [fixed, f2] : [f2, fixed];
        B.box(top, 'facade', a0, yRoof, lo, a1, yRoof + h, hi, { skip: 'D' });
      } else {
        const [lo, hi] = fixed < f2 ? [fixed, f2] : [f2, fixed];
        B.box(top, 'facade', lo, yRoof, a0, hi, yRoof + h, a1, { skip: 'D' });
      }
      B.wall(top, 'facade', dir, fixed, a0, a1, yRoof - 0.01, yRoof, {});
    }
  }
  // 牆頂(上方沒有樓板的牆,例如外圍磚牆)
  for (const lv of L.levels) {
    const li = lv.index;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const ch = lv.rows[r][c];
      if (!WALLISH(ch)) continue;
      if (li === top ? L.roofed(c, r) : L.hasFloor(li + 1, c, r)) continue;
      const boundary = lv.id === '1F' && !L.inBuilding(c, r);
      const h = boundary ? BOUNDARY_H : L.LEVEL_H;
      const x0 = c * 2, z0 = r * 2;
      B.flat(li, boundary ? 'trim_stone' : 'trim_concrete', x0 - (boundary ? 0.06 : 0), z0 - (boundary ? 0.06 : 0), x0 + 2 + (boundary ? 0.06 : 0), z0 + 2 + (boundary ? 0.06 : 0), lv.y + h + (boundary ? 0.08 : 0), true, {});
      if (boundary) B.box(li, 'trim_stone', x0 - 0.06, lv.y + h, z0 - 0.06, x0 + 2.06, lv.y + h + 0.08, z0 + 2.06, { skip: 'UD' });
    }
  }
}

// 掉了天花板的洞裡:鍍鋅風管/保溫管/線槽,幾條電線垂下來(都在夾層內,合併進既有材質,不增加 draw call)
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3();
const _box1 = new THREE.BoxGeometry(1, 1, 1);
function plenumGuts(B, li, R, sx, sz, t, yC) {
  const along = R() < 0.5, k = R();
  if (k < 0.55) { // 方形風管橫越洞口(兩端藏在天花板後)
    const w = R.r(0.34, 0.5), h = R.r(0.2, 0.28), off = R.r(-0.12, 0.12), yb = yC + R.r(0.12, 0.2);
    if (along) B.box(li, 'steel_dirty', sx - 0.5, yb, sz + t / 2 + off - w / 2, sx + t + 0.5, yb + h, sz + t / 2 + off + w / 2, {});
    else B.box(li, 'steel_dirty', sx + t / 2 + off - w / 2, yb, sz - 0.5, sx + t / 2 + off + w / 2, yb + h, sz + t + 0.5, {});
  } else if (k < 0.8) { // 包保溫棉的水管 + 吊架
    const r = R.r(0.06, 0.1), off = R.r(-0.18, 0.18), yy = yC + R.r(0.18, 0.3);
    pipe(B, li, R() < 0.5 ? 'trim_cream' : 'trim_white', along ? 'x' : 'z', along ? sx + t / 2 : sx + t / 2 + off, yy, along ? sz + t / 2 + off : sz + t / 2, t + 1.0, r, [0.85, 0.82, 0.74]);
  } else { // 線槽
    const off = R.r(-0.2, 0.2), yy = yC + 0.35;
    if (along) B.box(li, 'trim_gray', sx - 0.5, yy, sz + t / 2 + off - 0.15, sx + t + 0.5, yy + 0.06, sz + t / 2 + off + 0.15, {});
    else B.box(li, 'trim_gray', sx + t / 2 + off - 0.15, yy, sz - 0.5, sx + t / 2 + off + 0.15, yy + 0.06, sz + t + 0.5, {});
  }
  // 垂下來的電線(1~3 條,有的末端還接著斷掉的燈座)
  const n = 1 + ((R() * 2.6) | 0);
  for (let i = 0; i < n; i++) {
    const len = R.r(0.25, 1.05), x = sx + R.r(0.12, t - 0.12), z = sz + R.r(0.12, t - 0.12);
    _ge.set(R.r(-0.18, 0.18), 0, R.r(-0.18, 0.18));
    _gq.setFromEuler(_ge);
    _gm.compose(_gp.set(x, yC + 0.4 - len / 2, z), _gq, _gs.set(0.012, len + 0.4, 0.012));
    B.geo(li, R() < 0.6 ? 'trim_black' : 'trim_red', _box1, _gm);
    if (R() < 0.25) { _gm.compose(_gp.set(x + Math.sin(_ge.z) * len * 0.5, yC - len + 0.2, z - Math.sin(_ge.x) * len * 0.5), _gq, _gs.set(0.07, 0.05, 0.07)); B.geo(li, 'trim_white', _box1, _gm); }
  }
}

// ======================================================================
// 拱頂(納骨堂):以柱列分出開間,每個開間是十字拱 y = 起拱 + 矢高 × max(1-u², 1-v²)
// ======================================================================
export function buildVaults(K) {
  const { L, B } = K;
  for (const zone of L.zones) {
    if (zone.ceil !== 'vault') continue;
    const li = zone.levelIndex, lv = L.levels[li];
    for (const [c0, r0, c1, r1] of zone.rects) {
      // 找出內部柱子('#')所在的欄與列
      const pc = new Set(), pr = new Set();
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (lv.rows[r][c] === '#') { pc.add(c); pr.add(r); }
      const xs = [c0 * 2, ...[...pc].sort((a, b) => a - b).map((c) => c * 2 + 1), (c1 + 1) * 2];
      const zs = [r0 * 2, ...[...pr].sort((a, b) => a - b).map((r) => r * 2 + 1), (r1 + 1) * 2];
      const spring = lv.y + 2.35, crown = lv.y + 3.95;
      for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
        const ax = xs[i], bx = xs[i + 1], az = zs[j], bz = zs[j + 1];
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, hx = (bx - ax) / 2, hz = (bz - az) / 2;
        const n = 14;
        const H = (px, pz) => { const u = (px - cx) / hx, v = (pz - cz) / hz; return spring + (crown - spring) * Math.max(1 - u * u, 1 - v * v, 0); };
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          const x0 = ax + (bx - ax) * a / n, x1 = ax + (bx - ax) * (a + 1) / n, z0 = az + (bz - az) * b / n, z1 = az + (bz - az) * (b + 1) / n;
          const p = [[x0, H(x0, z0), z0], [x1, H(x1, z0), z0], [x1, H(x1, z1), z1], [x0, H(x0, z1), z1]];
          // 法線(朝下)
          const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], vz = p[3][2] - p[0][2], vy = p[3][1] - p[0][1];
          let nx = -uy * vz, ny = ux * vz, nz = -ux * vy;
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          if (ny > 0) { nx = -nx; ny = -ny; nz = -nz; }
          const k = 0.7 + 0.3 * ((p[0][1] - spring) / (crown - spring));
          B.quad(li, 'vault_stone', p[0], p[1], p[2], p[3], [nx, ny, nz], [[x0, p[0][1] * 0.7 + z0], [x1, p[1][1] * 0.7 + z0], [x1, p[2][1] * 0.7 + z1], [x0, p[3][1] * 0.7 + z1]], [k, k, k]);
        }
        // 肋拱(邊緣的拱帶)
        for (let a = 0; a < n; a++) {
          const t0 = a / n, t1 = (a + 1) / n;
          for (const [px0, pz0, px1, pz1] of [[ax + (bx - ax) * t0, az, ax + (bx - ax) * t1, az], [ax, az + (bz - az) * t0, ax, az + (bz - az) * t1]]) {
            const y0 = H(px0, pz0) - 0.12, y1 = H(px1, pz1) - 0.12;
            const isX = pz0 === pz1;
            const w = 0.18;
            if (isX) B.quad(li, 'trim_stone', [px0, y0, pz0 - w], [px1, y1, pz1 - w], [px1, y1, pz1 + w], [px0, y0, pz0 + w], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.8, 0.78, 0.74]);
            else B.quad(li, 'trim_stone', [px0 + w, y0, pz0], [px1 + w, y1, pz1], [px1 - w, y1, pz1], [px0 - w, y0, pz0], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.8, 0.78, 0.74]);
          }
        }
      }
    }
  }
}

// ======================================================================
// 裸露管線(ceil: 'pipes'):沿區域長軸的管線束 + 吊架
// ======================================================================
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const AX = { x: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), z: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), y: new THREE.Quaternion() };
export function pipe(B, li, key, ax, x0, y0, z0, len, rad, col) {
  _q.copy(AX[ax]);
  _s.set(rad, len, rad);
  _p.set(x0, y0, z0);
  _m.compose(_p, _q, _s);
  B.geo(li, key, cyl, _m, { col });
}
export function buildPipes(K) {
  const { L, B } = K;
  for (const zone of L.zones) {
    if (zone.ceil !== 'pipes') continue;
    const li = zone.levelIndex;
    const R = prng(hashStr(zone.id));
    for (const [c0, r0, c1, r1] of zone.rects) {
      const w = c1 - c0 + 1, h = r1 - r0 + 1, alongX = w >= h;
      const len = (alongX ? w : h) * 2;
      const yC = L.ceilY(li, c0, r0);
      if (!Number.isFinite(yC)) continue;
      const nP = alongX ? Math.min(5, h + 2) : Math.min(5, w + 2);
      for (let k = 0; k < nP; k++) {
        const rad = R.pick([0.05, 0.08, 0.12, 0.16, 0.06]);
        const across = (alongX ? r0 * 2 : c0 * 2) + 0.4 + R() * ((alongX ? h : w) * 2 - 0.8);
        const yy = yC - 0.14 - rad - R() * 0.35;
        const key = R.pick(['trim_rust', 'trim_steel', 'trim_green', 'trim_gray', 'trim_rust']);
        const mid = (alongX ? (c0 + c1 + 1) : (r0 + r1 + 1));
        if (alongX) pipe(B, li, key, 'x', mid, yy, across, len, rad, [1, 1, 1]);
        else pipe(B, li, key, 'z', across, yy, mid, len, rad, [1, 1, 1]);
        for (let a = 0.8; a < len; a += 2.4) { // 吊架
          const ax = alongX ? c0 * 2 + a : across, az = alongX ? across : r0 * 2 + a;
          B.box(li, 'trim_dark', ax - 0.02, yy, az - 0.02, ax + 0.02, yC, az + 0.02, {});
        }
        pipeExtras(B, li, alongX, alongX ? c0 * 2 : across, yy, alongX ? across : r0 * 2, len, rad, hashStr(zone.id + k)); // [scene7] 識別色環、閥門
      }
    }
  }
}
