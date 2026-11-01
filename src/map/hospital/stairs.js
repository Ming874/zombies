import * as THREE from 'three';
import { prng, hashStr } from './paint.js';
import { railing } from './openings.js';

// 樓梯:實體踏階(踏面 + 踢面 + 側面 + 底面斜板)、止滑條、扶手;
// 大廳大階梯(水磨石 + 紅地毯 + 銅止滑條)、樓梯間(混凝土 + 黃色止滑條 + 牆上扶手)、
// 戶外逃生梯(鐵格柵踏板 + 槽鋼側梁 + 欄杆 + 支柱)、救護車坡道(混凝土斜坡 + 黃黑警示邊)。
// 坡面高度 = levels.js 的 stairHeight(線性);踏階讓坡線穿過每個踢面的中點(腳下誤差 < 9cm)。
const box1 = new THREE.BoxGeometry(1, 1, 1);
const _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function slopedBox(B, li, key, a0, y0, a1, y1, c0, c1, h, axis, col) {
  // 沿著坡道方向的斜方塊:沿軸 a(z 或 x)從 (a0,y0) 到 (a1,y1),橫向 c0..c1,厚度 h(往下)
  const len = Math.hypot(a1 - a0, y1 - y0), ang = Math.atan2(y1 - y0, a1 - a0);
  const ma = (a0 + a1) / 2, my = (y0 + y1) / 2 - h / 2 * Math.cos(ang), mc = (c0 + c1) / 2;
  if (axis === 'z') { _e.set(-ang, 0, 0); _p.set(mc, my, ma); _s.set(c1 - c0, h, len); _e.set(ang * -1, 0, 0); }
  else { _e.set(0, 0, ang); _p.set(ma, my, mc); _s.set(len, h, c1 - c0); }
  _q.setFromEuler(_e);
  _M.compose(_p, _q, _s);
  B.geo(li, key, box1, _M, col ? { col } : {});
}

export function buildStairs(K) {
  const { L, B } = K;
  const out = [];
  for (const s of L.stairs) {
    const zone = L.zones.find((z) => z.id === s.zone) || null;
    const theme = zone?.theme || 'stairwell';
    const li = s.lower;
    const R = prng(hashStr('stair' + s.id));
    const ax = s.axis; // 'z' 或 'x'
    const [c0, c1] = ax === 'z' ? [s.x0, s.x1] : [s.z0, s.z1]; // 橫向範圍
    const a0 = s.lowAt, a1 = s.highAt, dirA = Math.sign(a1 - a0);
    const yL = s.yLow, yH = s.yHigh, rise = yH - yL;
    const len = Math.abs(a1 - a0);
    // 每格座標的轉換(a 沿坡,c 橫向)
    const X = (a, c) => (ax === 'z' ? c : a), Z = (a, c) => (ax === 'z' ? a : c);
    const flat = (key, aa, ab, ca, cb, y, up, col) => {
      const xa = X(aa, ca), xb = X(ab, cb), za = Z(aa, ca), zb = Z(ab, cb);
      B.flat(li, key, Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb), y, up, col ? { col } : {});
    };
    // 踢面:朝向低處(-dirA)
    const riserDir = ax === 'z' ? (dirA > 0 ? 'N' : 'S') : (dirA > 0 ? 'W' : 'E');
    const sideOpen = (cc) => { // 這一側是否看得到(不是牆、不是實心欄牆)
      const probe = cc < (c0 + c1) / 2 ? c0 - 0.5 : c1 + 0.5;
      const mid = (a0 + a1) / 2;
      const ch = L.charAt(li, Math.floor(X(mid, probe) / 2), Math.floor(Z(mid, probe) / 2));
      return !(ch === '#' || ch === 'E' || ch === 'W' || (ch === '=' && theme !== 'fire_escape'));
    };
    if (theme === 'ramp') {
      // 斜坡:一整片混凝土 + 兩側黃黑警示帶 + 橫向防滑溝(貼圖)
      const p = (a, c, y) => [X(a, c), y, Z(a, c)];
      const nA = rise / Math.hypot(len, rise), nY = len / Math.hypot(len, rise);
      const n = ax === 'z' ? [0, nY, -dirA * nA] : [-dirA * nA, nY, 0];
      const quad = (key, ca, cb, lift) => {
        const P = [p(a0, ca, yL + lift), p(a0, cb, yL + lift), p(a1, cb, yH + lift), p(a1, ca, yH + lift)];
        const flip = (ax === 'z') === (dirA < 0);
        const uv = [[ca, 0], [cb, 0], [cb, len], [ca, len]];
        if (flip) B.quad(li, key, P[0], P[1], P[2], P[3], n, uv); else B.quad(li, key, P[1], P[0], P[3], P[2], n, [uv[1], uv[0], uv[3], uv[2]]);
      };
      quad('concrete', c0 + 0.35, c1 - 0.35, 0);
      quad('trim_yellow', c0, c0 + 0.35, 0.002);
      quad('trim_yellow', c1 - 0.35, c1, 0.002);
      for (let k = 0; k < 18; k++) { const t = k / 18, aa = a0 + (a1 - a0) * t, yy = yL + rise * t; flat('trim_dark', aa, aa + dirA * 0.06, c0 + 0.4, c1 - 0.4, yy + 0.004, true); }
      out.push({ s, theme });
      continue;
    }
    const N = Math.max(4, Math.round(rise / 0.175)), run = len / N, rh = rise / N;
    const metal = theme === 'fire_escape';
    const tread = metal ? 'metal_grate' : theme === 'lobby' ? 'terrazzo' : theme === 'stair_ext' ? 'concrete_wet' : 'concrete';
    const riserK = metal ? null : theme === 'lobby' ? 'marble_wall' : tread;
    const nose = theme === 'lobby' ? 'trim_brass' : metal ? null : 'trim_yellow';
    const soffit = metal ? null : theme === 'lobby' ? 'ceil_plaster' : 'ceil_concrete';
    const openA = sideOpen(c0), openB = sideOpen(c1);
    for (let i = 0; i < N; i++) {
      const sa = a0 + dirA * run * i, sb = sa + dirA * run;
      const yt = yL + rh * (i + 0.5);
      const ys = i === 0 ? yL : yL + rh * (i - 0.5); // 前一階的高度
      if (metal) {
        // 格柵踏板(薄)+ 前緣角鋼
        const xa = X(Math.min(sa, sb), c0 + 0.08), xb = X(Math.max(sa, sb), c1 - 0.08), za = Z(Math.min(sa, sb), c0 + 0.08), zb = Z(Math.max(sa, sb), c1 - 0.08);
        B.box(li, 'metal_grate', Math.min(xa, xb), yt - 0.035, Math.min(za, zb), Math.max(xa, xb), yt, Math.max(za, zb), {});
        const ea = sa, eb = sa + dirA * 0.04;
        const xa2 = X(Math.min(ea, eb), c0 + 0.08), xb2 = X(Math.max(ea, eb), c1 - 0.08), za2 = Z(Math.min(ea, eb), c0 + 0.08), zb2 = Z(Math.max(ea, eb), c1 - 0.08);
        B.box(li, 'iron', Math.min(xa2, xb2), yt - 0.06, Math.min(za2, zb2), Math.max(xa2, xb2), yt, Math.max(za2, zb2), {});
        continue;
      }
      // 踏面
      flat(tread, sa, sb, c0, c1, yt, true, [0.95, 0.95, 0.95]);
      if (theme === 'lobby') { const cm = (c0 + c1) / 2; flat('runner', sa, sb, cm - 0.75, cm + 0.75, yt + 0.004, true); }
      // 踢面
      const fixed = sa;
      B.wall(li, riserK, riserDir, fixed, c0, c1, ys, yt, { cBot: [0.7, 0.7, 0.68], cTop: [0.85, 0.85, 0.83] });
      // 止滑條
      if (nose) flat(nose, sa, sa + dirA * 0.05, c0 + (theme === 'lobby' ? 0.05 : 0.15), c1 - (theme === 'lobby' ? 0.05 : 0.15), yt + 0.003, true);
      // 側面(開放側):從底板斜線到踏面
      for (const [open, cc, sgn] of [[openA, c0, -1], [openB, c1, 1]]) {
        if (!open) continue;
        const yb0 = Math.max(yL, yL + rh * (i - 0.5) - 0.35 + rh * 0), yb1 = Math.max(yL, yL + rh * (i + 0.5) - 0.35);
        const pA = [X(sa, cc), yb0, Z(sa, cc)], pB = [X(sb, cc), yb1, Z(sb, cc)], pC = [X(sb, cc), yt, Z(sb, cc)], pD = [X(sa, cc), yt, Z(sa, cc)];
        const n = ax === 'z' ? [sgn, 0, 0] : [0, 0, sgn];
        const ccw = (ax === 'z') === ((sgn > 0) === (dirA < 0));
        if (ccw) B.quad(li, riserK, pA, pB, pC, pD, n, [[sa, yb0], [sb, yb1], [sb, yt], [sa, yt]]);
        else B.quad(li, riserK, pB, pA, pD, pC, n, [[sb, yb1], [sa, yb0], [sa, yt], [sb, yt]]);
      }
    }
    // 底面斜板(從下面看得到樓梯底)
    if (soffit) {
      const p = (a, c, y) => [X(a, c), y, Z(a, c)];
      const th = 0.35;
      const A0 = p(a0, c0, yL - 0.02), A1 = p(a0, c1, yL - 0.02), B0 = p(a1, c0, yH - th), B1 = p(a1, c1, yH - th);
      const nA = rise / Math.hypot(len, rise), nY = -len / Math.hypot(len, rise);
      const n = ax === 'z' ? [0, nY, dirA * nA] : [dirA * nA, nY, 0];
      const flip = (ax === 'z') === (dirA > 0);
      if (flip) B.quad(li, soffit, A0, A1, B1, B0, n, [[c0, 0], [c1, 0], [c1, len], [c0, len]]);
      else B.quad(li, soffit, A1, A0, B0, B1, n, [[c1, 0], [c0, 0], [c0, len], [c1, len]]);
    }
    // 扶手
    if (metal) {
      // 槽鋼側梁 + 開放側欄杆 + 支柱
      for (const cc of [c0 + 0.04, c1 - 0.04]) slopedBox(B, li, 'iron', a0, yL, a1, yH, cc - 0.04, cc + 0.04, 0.24, ax);
      for (const [open, cc] of [[openA, c0 + 0.06], [openB, c1 - 0.06]]) {
        if (!open) continue;
        slopedBox(B, li, 'iron', a0, yL + 1.0, a1, yH + 1.0, cc - 0.025, cc + 0.025, 0.05, ax);
        slopedBox(B, li, 'iron', a0, yL + 0.5, a1, yH + 0.5, cc - 0.02, cc + 0.02, 0.04, ax);
        for (let k = 0; k <= 4; k++) { const t = k / 4, aa = a0 + (a1 - a0) * t, yy = yL + rise * t; B.box(li, 'iron', X(aa, cc) - 0.025, yy - 0.1, Z(aa, cc) - 0.025, X(aa, cc) + 0.025, yy + 1.02, Z(aa, cc) + 0.025, {}); }
      }
      // 支柱(地面到中段與頂端)
      const ground = L.levels.find((l) => l.id === '1F').y;
      for (const t of [0.5, 1]) for (const cc of [c0 + 0.1, c1 - 0.1]) {
        const aa = a0 + (a1 - a0) * t - dirA * 0.1, yy = yL + rise * t;
        if (yy - ground < 1) continue;
        B.box(li, 'iron', X(aa, cc) - 0.05, ground, Z(aa, cc) - 0.05, X(aa, cc) + 0.05, yy - 0.2, Z(aa, cc) + 0.05, {});
      }
    } else if (theme !== 'lobby') {
      // 牆上扶手(兩側是牆時):沿坡度,離牆 7cm
      for (const [open, cc] of [[openA, c0 + 0.08], [openB, c1 - 0.08]]) {
        const key = theme === 'stairwell' ? 'trim_red' : 'trim_steel';
        slopedBox(B, li, key, a0 - dirA * 0.3, yL + 0.92, a1 + dirA * 0.1, yH + 0.92, cc - 0.025, cc + 0.025, 0.05, ax);
        if (open) for (let k = 0; k <= 4; k++) { const t = k / 4, aa = a0 + (a1 - a0) * t, yy = yL + rise * t; B.box(li, 'trim_steel', X(aa, cc) - 0.02, yy, Z(aa, cc) - 0.02, X(aa, cc) + 0.02, yy + 0.92, Z(aa, cc) + 0.02, {}); }
      }
    }
    out.push({ s, theme, N, run });
  }
  // 逃生梯平台的外緣欄杆(2F/3F 的格柵平台旁邊是空中)
  for (const zone of L.zones) {
    if (zone.theme !== 'fire_escape' || zone.level === '1F') continue;
    const li = zone.levelIndex, lv = L.levels[li];
    for (const [c0, r0, c1, r1] of zone.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (lv.rows[r][c] !== ',') continue;
      for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (lv.rows[r + dr]?.[c + dc] !== '_') continue;
        const x0 = c * 2, z0 = r * 2;
        const edge = dr === -1 ? [x0, z0 + 0.05, x0 + 2, z0 + 0.05] : dr === 1 ? [x0, z0 + 1.95, x0 + 2, z0 + 1.95] : dc === 1 ? [x0 + 1.95, z0, x0 + 1.95, z0 + 2] : [x0 + 0.05, z0, x0 + 0.05, z0 + 2];
        railing(B, li, edge, lv.y, 1.05, 'iron');
      }
      // 平台支柱
      const ground = L.levels.find((l) => l.id === '1F').y;
      if ((c + r) % 2 === 0) B.box(li, 'iron', c * 2 + 0.95, ground, r * 2 + 0.95, c * 2 + 1.05, lv.y - 0.05, r * 2 + 1.05, {});
      B.box(li, 'iron', c * 2, lv.y - 0.14, r * 2, c * 2 + 2, lv.y - 0.04, r * 2 + 0.06, {});
    }
  }
  K.stairList = out;
  return out;
}
