import { prng, hashStr } from './paint.js';
import { atlasLayout, atlasData, ATLAS } from './atlas.js';
import { setAtlasData } from './surfaces.js';

// 標示與牆面貼花的擺放(幾何進 Buckets,依材質合併):
//  門牌(走廊側門邊)、科別吊牌(走廊天花板吊下來,雙面 + 指向門的箭頭)、避難逃生路線圖與樓層介紹(樓梯間門旁)、
//  紙本告示、手寫/噴漆字跡(故事點 + 隨機)、牆面漏水流痕與裂縫(破舊的牆)、一樓地板的動線指引色帶、濕區地板排水孔。
// 所有面都離牆/地一點點並用 polygonOffset 材質,不會 z-fighting。
const WALLISH = (ch) => ch === '#' || ch === 'E' || ch === 'W';
const SOLID = (ch) => ch === '#' || ch === 'E';
const uvOf = (s, mirror = false) => {
  const u0 = s.x / ATLAS, u1 = (s.x + s.w) / ATLAS, v0 = 1 - (s.y + s.h) / ATLAS, v1 = 1 - s.y / ATLAS;
  return mirror ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
};
// 牆面上的矩形:中心 (cx, cy, cz),法線 (nx, nz),寬 w 高 h
function wallQuad(B, li, key, cx, cy, cz, nx, nz, w, h, uv, col) {
  const rx = nz, rz = -nx; // 面對牆時的右手方向
  const a = [cx - rx * w / 2, cy - h / 2, cz - rz * w / 2], b = [cx + rx * w / 2, cy - h / 2, cz + rz * w / 2];
  const c = [cx + rx * w / 2, cy + h / 2, cz + rz * w / 2], d = [cx - rx * w / 2, cy + h / 2, cz - rz * w / 2];
  B.quad(li, key, a, b, c, d, [nx, 0, nz], uv, col);
}
// 牆上的薄板(背板),深 t
function wallPlate(B, li, key, cx, cy, cz, nx, nz, w, h, t) {
  if (nz) B.box(li, key, cx - w / 2, cy - h / 2, Math.min(cz, cz - nz * t), cx + w / 2, cy + h / 2, Math.max(cz, cz - nz * t), {});
  else B.box(li, key, Math.min(cx, cx - nx * t), cy - h / 2, cz - w / 2, Math.max(cx, cx - nx * t), cy + h / 2, cz + w / 2, {});
}

export function buildSigns(K) {
  const { L, B } = K;
  const data = atlasData(L, K.mapId || 'hospital');
  setAtlasData(data);
  const { S } = atlasLayout(data);
  const R = prng(hashStr('signs-v2'));
  const used = []; // 已佔用的牆面位置(避免告示/字跡疊在一起)
  const free = (li, x, y, z, r) => !used.some((u) => u.li === li && Math.abs(u.y - y) < r + u.r && (u.x - x) ** 2 + (u.z - z) ** 2 < (r + u.r) ** 2);
  const mark = (li, x, y, z, r) => used.push({ li, x, y, z, r });
  // 牆面上 (c,r) 格朝 (dc,dr) 那一面的中心(牆在 (c+dc, r+dr))
  const faceAt = (c, r, dc, dr, off = 0.012) => ({ x: (c + 0.5) * 2 + dc * (1 - off), z: (r + 0.5) * 2 + dr * (1 - off), nx: -dc, nz: -dr });

  // ---------------- 門牌 / 避難圖 / 樓層介紹 / 隔離告示 ----------------
  const stairSide = (x) => (x < 60 ? 'w' : 'e');
  for (const d of K.doorList || []) {
    if (!d.axis) continue;
    const runStart = d.run[0] === (d.axis === 'z' ? d.c : d.r);
    if (!runStart) continue;
    const ca = d.za?.theme === 'corridor', cb = d.zb?.theme === 'corridor';
    if (ca === cb) continue; // 只處理「走廊 ↔ 房間」的門
    const room = ca ? d.zb : d.za;
    if (!room || !S.plates[room.id] || room.theme === 'lobby') continue;
    const li = d.li, y = L.levels[li].y;
    // 走廊側:A 側在 -軸方向
    const sideSign = ca ? -1 : 1; // 走廊在 A(-)還是 B(+)
    const n = d.axis === 'z' ? [0, sideSign] : [sideSign, 0]; // 牆面法線(朝走廊)
    const wallFixed = d.axis === 'z' ? (sideSign < 0 ? d.r * 2 : (d.r + 1) * 2) : (sideSign < 0 ? d.c * 2 : (d.c + 1) * 2);
    const u0 = (d.run[0]) * 2, u1 = (d.run[1] + 1) * 2; // 門洞沿牆範圍
    // 門兩側是否有牆可貼
    const wallBeside = (u) => { const cc = d.axis === 'z' ? Math.floor(u / 2) : d.c, rr = d.axis === 'z' ? d.r : Math.floor(u / 2); return SOLID(L.charAt(li, cc, rr)); };
    const sides = [];
    if (wallBeside(u0 - 1)) sides.push(-1);
    if (wallBeside(u1 + 1)) sides.push(1);
    if (!sides.length) continue;
    const at = (side, dist) => side < 0 ? u0 - dist : u1 + dist;
    const pos = (u, h) => (d.axis === 'z' ? { x: u, y: y + h, z: wallFixed + n[1] * 0.014 } : { x: wallFixed + n[0] * 0.014, y: y + h, z: u });
    // 門牌(門把側,離門框 0.35m)
    const ps = S.plates[room.id], side0 = sides[0];
    const p = pos(at(side0, 0.33), 1.55);
    wallPlate(B, li, 'trim_alu', p.x, p.y, p.z, n[0], n[1], 0.36, 0.15, 0.012);
    wallQuad(B, li, 'atlas_signs', p.x + n[0] * 0.002, p.y, p.z + n[1] * 0.002, n[0], n[1], 0.32, 0.12, uvOf(ps));
    mark(li, p.x, p.y, p.z, 0.3);
    // 樓梯間:避難逃生路線圖(另一側)+ 樓層介紹
    if (room.theme === 'stairwell') {
      const lvId = L.levels[li].id, sd = stairSide(p.x);
      const s2 = sides.length > 1 ? sides[1] : side0;
      const ev = S.boards['evac_' + lvId + '_' + sd];
      const pe = pos(at(s2, s2 === side0 ? 1.05 : 0.62), 1.45);
      wallPlate(B, li, 'trim_alu', pe.x, pe.y, pe.z, n[0], n[1], 0.66, 0.51, 0.015);
      wallQuad(B, li, 'atlas_boards', pe.x + n[0] * 0.003, pe.y, pe.z + n[1] * 0.003, n[0], n[1], 0.6, 0.45, uvOf(ev));
      mark(li, pe.x, pe.y, pe.z, 0.45);
      const dir = S.boards['dir_' + lvId];
      const pd = pos(at(s2, s2 === side0 ? 1.95 : 1.5), 1.5);
      if (wallBeside(d.axis === 'z' ? pd.x : pd.z)) {
        wallPlate(B, li, 'trim_wood', pd.x, pd.y, pd.z, n[0], n[1], 0.66, 0.86, 0.02);
        wallQuad(B, li, 'atlas_boards', pd.x + n[0] * 0.003, pd.y, pd.z + n[1] * 0.003, n[0], n[1], 0.6, 0.8, uvOf(dir));
        mark(li, pd.x, pd.y, pd.z, 0.5);
      }
    }
    // 隔離告示:加護病房、精神科、太平間、解剖室的門旁
    if (['icu', 'psych_cell', 'morgue', 'autopsy', 'surgery'].includes(room.theme) && (room.theme !== 'psych_cell' || R() < 0.45)) {
      const s2 = sides.length > 1 ? sides[1] : side0;
      const pq = pos(at(s2, s2 === side0 ? 1.0 : 0.45), 1.45);
      if (free(li, pq.x, pq.y, pq.z, 0.25)) {
        const tilt = (R() - 0.5) * 0.06;
        wallQuad(B, li, 'atlas_boards', pq.x + n[0] * 0.002, pq.y, pq.z + n[1] * 0.002, n[0], n[1], 0.25 + tilt, 0.344, uvOf(S.notices.quarantine));
        mark(li, pq.x, pq.y, pq.z, 0.25);
      }
    }
  }

  // ---------------- 科別吊牌(走廊天花板吊下,雙面,箭頭指向門) ----------------
  const deptFor = (zone) => (zone.theme === 'ward' ? 'wards' : zone.theme === 'psych_cell' ? 'cells' : zone.theme === 'stairwell' ? 'stairs' : zone.id);
  const hung = [];
  for (const d of K.doorList || []) {
    if (!d.axis) continue;
    const ca = d.za?.theme === 'corridor', cb = d.zb?.theme === 'corridor';
    if (ca === cb) continue;
    const room = ca ? d.zb : d.za, corr = ca ? d.za : d.zb;
    const id = deptFor(room), s = S.depts[id];
    if (!s) continue;
    const li = d.li, y = L.levels[li].y;
    // 門外的走廊格,走廊沿著與門通道垂直的方向
    const sideSign = ca ? -1 : 1;
    const cc = d.axis === 'z' ? d.c : d.c + sideSign, cr = d.axis === 'z' ? d.r + sideSign : d.r;
    const along = d.axis === 'z' ? 'x' : 'z'; // 走廊方向
    // 走廊橫斷面中心:沿法線方向找到對面牆
    let k = 0;
    while (k < 5 && !WALLISH(L.charAt(li, d.axis === 'z' ? cc : cc + sideSign * (k + 1), d.axis === 'z' ? cr + sideSign * (k + 1) : cr))) k++;
    const w0 = d.axis === 'z' ? (sideSign > 0 ? (d.r + 1) * 2 : d.r * 2) : (sideSign > 0 ? (d.c + 1) * 2 : d.c * 2); // 門所在牆面
    const width = (k + 1) * 2;
    const mid = w0 + sideSign * width / 2;
    const doorU = ((d.run[0] + d.run[1] + 1) / 2) * 2;
    // 同一個科別同一層只掛一面;太靠近已有吊牌就跳過
    const key = li + ':' + id;
    if (hung.some((h) => h.key === key || (h.li === li && Math.hypot(h.x - (along === 'x' ? doorU : mid), h.z - (along === 'x' ? mid : doorU)) < 5))) continue;
    if (id === 'wards' && !/20[16]$/.test(room.name)) continue; // 病房只在 201、206 前各掛一面
    if (id === 'stairs' && R() < 0.3) continue;
    const yC = L.ceilY(li, cc, cr);
    if (!Number.isFinite(yC) || yC - y < 3) continue;
    const cy = y + 2.55, sw = 1.3, sh = 0.32;
    const ux = along === 'x' ? doorU : mid, uz = along === 'x' ? mid : doorU;
    hung.push({ key, li, x: ux, z: uz });
    // 框(鋁)+ 兩根吊桿
    const fw = sw + 0.42, ft = 0.05;
    if (along === 'x') {
      B.box(li, 'trim_dark', ux - ft / 2, cy - sh / 2 - 0.03, uz - fw / 2, ux + ft / 2, cy + sh / 2 + 0.03, uz + fw / 2, {});
      for (const o of [-fw / 2 + 0.1, fw / 2 - 0.1]) B.box(li, 'trim_dark', ux - 0.008, cy + sh / 2 + 0.03, uz + o - 0.008, ux + 0.008, yC, uz + o + 0.008, {});
    } else {
      B.box(li, 'trim_dark', ux - fw / 2, cy - sh / 2 - 0.03, uz - ft / 2, ux + fw / 2, cy + sh / 2 + 0.03, uz + ft / 2, {});
      for (const o of [-fw / 2 + 0.1, fw / 2 - 0.1]) B.box(li, 'trim_dark', ux + o - 0.008, cy + sh / 2 + 0.03, uz - 0.008, ux + o + 0.008, yC, uz + 0.008, {});
    }
    // 兩面:法線 ±along。箭頭朝門的方向(門在 sideSign 那側)
    for (const f of [1, -1]) {
      const nx = along === 'x' ? f : 0, nz = along === 'x' ? 0 : f;
      const fx = ux + nx * (ft / 2 + 0.002), fz = uz + nz * (ft / 2 + 0.002);
      // 面對這一面時右手方向 = (nz, -nx);門在橫斷方向 sideSign
      const rx = nz, rz = -nx;
      const doorDir = along === 'x' ? [0, -sideSign] : [-sideSign, 0]; // 從走廊中心往門的方向
      const rightIsDoor = rx * doorDir[0] + rz * doorDir[1] > 0;
      const tShift = rightIsDoor ? -0.2 : 0.2, aShift = rightIsDoor ? sw / 2 + 0.02 : -sw / 2 - 0.02;
      wallQuad(B, li, 'atlas_signs', fx + rx * tShift, cy, fz + rz * tShift, nx, nz, sw - 0.12, sh, uvOf(s));
      wallQuad(B, li, 'atlas_signs', fx + rx * aShift, cy, fz + rz * aShift, nx, nz, 0.28, 0.28, uvOf(S.picto.arrow, !rightIsDoor), [0.95, 0.95, 0.95]);
    }
    void corr;
  }

  // ---------------- 牆面:告示、字跡(故事點 + 隨機)、漏水流痕、裂縫 ----------------
  const zoneFaces = (pred) => K.faces.filter((f) => f.kind === 'room' && f.zone && pred(f.zone, f) && f.a1 - f.a0 >= 2 && !f.win);
  const onFace = (f, key, uvS, w, h, hy, o = {}) => {
    const len = f.a1 - f.a0;
    for (let k = 0; k < 6; k++) {
      const a = o.at ?? (f.a0 + w / 2 + 0.2 + R() * Math.max(0.01, len - w - 0.4));
      const isH = f.dir === 'N' || f.dir === 'S';
      const x = isH ? a : f.fixed + f.nx * 0.01, z = isH ? f.fixed + f.nz * 0.01 : a, yy = f.y + hy;
      // 窗與門:只放在實牆段上
      const cc = isH ? Math.floor(a / 2) : f.c, rr = isH ? f.r : Math.floor(a / 2);
      const wc = isH ? cc : f.c, wr = isH ? f.r : rr;
      if (!SOLID(L.charAt(f.li, wc, wr))) continue;
      const cw = isH ? Math.floor((a - w / 2) / 2) : f.c, cw2 = isH ? Math.floor((a + w / 2) / 2) : f.c, rw = isH ? f.r : Math.floor((a - w / 2) / 2), rw2 = isH ? f.r : Math.floor((a + w / 2) / 2);
      if (!SOLID(L.charAt(f.li, cw, rw)) || !SOLID(L.charAt(f.li, cw2, rw2))) continue;
      if (!free(f.li, x, yy, z, Math.max(w, h) * 0.5)) continue;
      mark(f.li, x, yy, z, Math.max(w, h) * 0.5);
      wallQuad(B, f.li, key, x + f.nx * (o.lift ?? 0), yy, z + f.nz * (o.lift ?? 0), f.nx, f.nz, w, h, uvS, o.col);
      return true;
    }
    return false;
  };
  const NOTE = S.notices;
  // 紙本告示:走廊與病房
  for (const f of zoneFaces((z) => z.theme === 'corridor')) {
    if (R() > 0.22) continue;
    const id = R.pick(f.zone.mood === 'psych' ? ['patient', 'note', 'infection'] : ['evacuate', 'power', 'nolift', 'infection', 'note', 'visiting', 'patient', 'evacuate']);
    onFace(f, 'atlas_boards', uvOf(NOTE[id]), 0.25, 0.344, R.r(1.35, 1.6));
  }
  for (const f of zoneFaces((z) => z.theme === 'ward' || z.theme === 'peds_ward')) if (R() < 0.18) onFace(f, 'atlas_boards', uvOf(NOTE.patient), 0.25, 0.344, 1.5);
  // 故事點字跡
  const SC = S.scrawls;
  const story = [
    [(z) => z.id === 'f2_ward_207', 9, 1.3, 1.5], [(z) => z.id === 'f2_stair_e', 3, 1.4, 1.6], [(z) => z.theme === 'psych_cell' && /3$/.test(z.name), 5, 1.2, 1.2],
    [(z) => z.id === 'b1_tunnel', 0, 1.5, 1.8], [(z) => z.id === 'f1_stair_w', 7, 1.3, 1.5], [(z) => z.id === 'f1_corridor', 2, 1.5, 2.0], [(z) => z.id === 'f1_er', 1, 1.6, 1.7],
    [(z) => z.id === 'b1_morgue', 4, 1.5, 1.6], [(z) => z.id === 'f2_ward_203', 8, 1.6, 1.4], [(z) => z.id === 'f3_dorm', 11, 1.4, 1.5], [(z) => z.id === 'f2_playroom', 10, 0.75, 1.1],
    [(z) => z.id === 'f3_corridor', 12, 1.5, 1.6], [(z) => z.id === 'f1_cafeteria', 13, 1.8, 1.7], [(z) => z.id === 'f2_icu', 14, 1.5, 1.8], [(z) => z.id === 'f2_nursery', 15, 0.9, 1.2],
    [(z) => z.id === 'f1_waiting', 6, 1.7, 1.8], [(z) => z.id === 'b1_archive', 7, 1.5, 1.6], [(z) => z.id === 'b1_laundry', 1, 1.4, 1.6], [(z) => z.id === 'f1_lobby', 6, 1.9, 2.4],
  ];
  for (const [pred, si, hy, w] of story) {
    const faces = zoneFaces(pred);
    if (!faces.length) continue;
    faces.sort(() => R() - 0.5);
    for (const f of faces) if (onFace(f, 'atlas_boards', uvOf(SC[si]), w, w * 104 / 512, hy, { lift: 0.002 })) break;
  }
  // 隨機字跡(地下室、樓梯間)
  for (const f of zoneFaces((z) => z.level === 'B1' || z.theme === 'stairwell')) {
    if (R() > 0.12) continue;
    const si = R.pick([0, 1, 3, 6, 7, 8, 11, 12, 13]), w = R.r(1.1, 1.7);
    onFace(f, 'atlas_boards', uvOf(SC[si]), w, w * 104 / 512, R.r(1.2, 1.9), { lift: 0.002 });
  }
  // 漏水流痕:破舊的牆、從天花板往下;裂縫:門洞上角與破舊牆面
  for (const f of K.faces) {
    if (f.kind !== 'room' || f.win || !f.zone || f.a1 - f.a0 < 2) continue;
    const wear = f.wear ?? 0.5, top = f.top ?? 3.4;
    if (top < 2.6) continue;
    const n = wear > 0.85 ? 2 : wear > 0.6 ? 1 : 0;
    for (let k = 0; k < n; k++) if (R() < 0.6) { const w = R.r(1.0, 2.0); onFace(f, 'decal_leak', [[0, 0], [1, 0], [1, 1], [0, 1]], w, w * 0.5, top - w * 0.25 - 0.02, { lift: 0.001 }); }
    if (wear > 0.55 && R() < 0.35) { const s = R.r(0.6, 1.3); onFace(f, 'decal_crack', R() < 0.5 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]], s, s, R.r(0.9, top - s / 2 - 0.1), { lift: 0.001 }); }
  }
  for (const d of K.doorList || []) { // 門洞上角的裂縫
    if (!d.axis || R() > 0.3) continue;
    const li = d.li, y = L.levels[li].y, s = R.r(0.5, 0.8), side = R() < 0.5 ? -1 : 1;
    const u = side < 0 ? d.run[0] * 2 - s * 0.3 : (d.run[1] + 1) * 2 + s * 0.3;
    for (const sg of [-1, 1]) {
      if (R() < 0.5) continue;
      const wall = d.axis === 'z' ? (sg < 0 ? d.r * 2 : (d.r + 1) * 2) : (sg < 0 ? d.c * 2 : (d.c + 1) * 2);
      const nx = d.axis === 'z' ? 0 : sg, nz = d.axis === 'z' ? sg : 0;
      const yy = y + d.h + s * 0.3;
      if (yy + s / 2 > y + 3.35) continue;
      const cc = d.axis === 'z' ? Math.floor(u / 2) : d.c, rr = d.axis === 'z' ? d.r : Math.floor(u / 2);
      if (!SOLID(L.charAt(li, cc, rr))) continue;
      const x = d.axis === 'z' ? u : wall + nx * 0.011, z = d.axis === 'z' ? wall + nz * 0.011 : u;
      wallQuad(B, li, 'decal_crack', x, yy, z, nx, nz, s, s, side > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[1, 0], [0, 0], [0, 1], [1, 1]]);
    }
  }

  // ---------------- 一樓地板動線色帶(從大廳北側出發,沿走廊到急診/放射科/藥局/餐廳) ----------------
  floorLines(K);
  // ---------------- 濕區地板排水孔 ----------------
  for (const zone of L.zones) {
    if (!['morgue', 'autopsy', 'laundry', 'surgery', 'delivery', 'cafeteria', 'pump'].includes(zone.theme)) continue;
    const li = zone.levelIndex, y = L.levels[li].y;
    for (const [c0, r0, c1, r1] of zone.rects) {
      const n = Math.max(1, Math.round(((c1 - c0 + 1) * (r1 - r0 + 1)) / 14));
      for (let k = 0; k < n; k++) {
        const c = c0 + ((R() * (c1 - c0 + 1)) | 0), r = r0 + ((R() * (r1 - r0 + 1)) | 0);
        if (L.charAt(li, c, r) !== '.') continue;
        const x = c * 2 + 1 + R.r(-0.5, 0.5), z = r * 2 + 1 + R.r(-0.5, 0.5), h = 0.15;
        B.flat(li, 'trim_dark', x - h, z - h, x + h, z + h, y + 0.004, true, {});
        B.flat(li, 'drain', x - h + 0.02, z - h + 0.02, x + h - 0.02, z + h - 0.02, y + 0.007, true, {});
      }
    }
  }
}

// 一樓地板的彩色動線:BFS 找出從大廳北門到各科門口的走廊路徑,畫成平行的色帶(每種顏色往旁邊錯開)
function floorLines(K) {
  const { L, B } = K;
  const li = L.levels.findIndex((l) => l.id === '1F');
  if (li < 0) return;
  const lv = L.levels[li], y = lv.y;
  const corr = (c, r) => L.zoneAt(li, c, r)?.theme === 'corridor' && L.charAt(li, c, r) !== '#';
  // 起點:大廳北緣的走廊格
  const start = [30, 27];
  const targets = [
    { id: 'f1_er', col: [0.72, 0.12, 0.1], off: -0.42 }, { id: 'f1_xray', col: [0.85, 0.66, 0.1], off: -0.14 },
    { id: 'f1_pharmacy', col: [0.12, 0.42, 0.7], off: 0.14 }, { id: 'f1_cafeteria', col: [0.14, 0.52, 0.28], off: 0.42 },
  ];
  const W = L.W, H = L.H;
  const prev = new Int32Array(W * H).fill(-1);
  const q = [start[1] * W + start[0]];
  prev[q[0]] = q[0];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], c = k % W, r = (k / W) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, nk = nr * W + nc;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H || prev[nk] >= 0 || !corr(nc, nr)) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  targets.forEach((t, ti) => {
    const zone = L.zones.find((z) => z.id === t.id);
    if (!zone) return;
    // 目標:這個區域的門外的走廊格
    let goal = -1;
    for (const d of K.doorList || []) {
      if (d.li !== li || !d.axis || (d.za !== zone && d.zb !== zone)) continue;
      const sg = d.za === zone ? 1 : -1;
      const c = d.axis === 'z' ? d.c : d.c + sg, r = d.axis === 'z' ? d.r + sg : d.r;
      if (prev[r * W + c] >= 0) { goal = r * W + c; break; }
    }
    if (goal < 0) return;
    const path = [];
    for (let k = goal; ; k = prev[k]) { path.push([k % W, (k / W) | 0]); if (prev[k] === k) break; }
    path.reverse();
    // 路徑格中心連線 → 依方向往旁邊錯開 off,畫 0.1m 寬的帶子
    const pts = path.map(([c, r]) => [c * 2 + 1, r * 2 + 1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
      const ox = -dz * t.off, oz = dx * t.off, hw = 0.05, ext = Math.abs(t.off) + hw; // 兩端延長,轉角才接得起來
      const ax = Math.min(x0, x1) + ox - (dz ? hw : ext), bx = Math.max(x0, x1) + ox + (dz ? hw : ext);
      const az = Math.min(z0, z1) + oz - (dx ? hw : ext), bz = Math.max(z0, z1) + oz + (dx ? hw : ext);
      B.wear = 0.6;
      B.flat(li, 'floor_line', ax, az, bx, bz, y + 0.003 + ti * 0.0012, true, { col: t.col });
    }
  });
}
