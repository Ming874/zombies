import * as THREE from 'three';
import { prng, hashStr } from './paint.js';
import { DIRS, ARROW } from './shell.js';
import { revealFor } from './style.js';
import { buildLeaves } from './leaves.js';
import { buildFacade } from './facade.js';

// 劇情包會上鎖的區域(src/interact/doors.js 的鎖只關得住掛在鉸鍊上的門扇):通往這些區域的門洞兩扇都要掛著,不倒、不缺
const LOCKS = []; // main 沒有劇情上鎖的門(test 由 src/interact/packs/hospital.js 提供)
const SEALED = new Set(LOCKS.map((i) => i.door)), SEALED_OUT = new Set(LOCKS.filter((i) => i.outer).map((i) => i.door)); // outer:外門也鎖

// 門(門框、門楣、門扇的各種狀態)、窗(窗框、玻璃狀態、木板封窗、百葉、窗簾、鐵條)、
// 欄杆/櫃台/矮牆/女兒牆、鐵欄杆與圍籬(含灌木)、電梯。全部放在牆格/門格內,不擋通道。
const box1 = new THREE.BoxGeometry(1, 1, 1);
const plane1 = new THREE.PlaneGeometry(1, 1);
const _M = new THREE.Matrix4(), _M2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// 局部座標:門/窗的寬度方向 u、深度方向 w。axis 'z' → u=x, w=z;axis 'x' → u=z, w=x
const frameOf = (axis) => (axis === 'z' ? { X: (u, w) => u, Z: (u, w) => w, U: [1, 0, 0], W: [0, 0, 1] } : { X: (u, w) => w, Z: (u, w) => u, U: [0, 0, 1], W: [1, 0, 0] });
function lbox(B, li, key, F, u0, y0, w0, u1, y1, w1, opts) {
  const xa = F.X(u0, w0), xb = F.X(u1, w1), za = F.Z(u0, w0), zb = F.Z(u1, w1);
  B.box(li, key, Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), opts);
}
// 旋轉方塊(以 yaw 繞 y、roll 繞深度軸、pitch 繞 x)
function obox(B, li, key, cx, cy, cz, sx, sy, sz, yaw = 0, pitch = 0, roll = 0, col) {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _M.compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz));
  B.geo(li, key, box1, _M, col ? { col } : {});
}
// 在某平面上(基底 L 長軸、V 上軸、N 法線)放一片
function basisPlane(B, li, key, geo, cx, cy, cz, L, V, N, sl, sv, sn = 1, col) {
  _bx.set(L[0], L[1], L[2]).multiplyScalar(sl); _by.set(V[0], V[1], V[2]).multiplyScalar(sv); _bz.set(N[0], N[1], N[2]).multiplyScalar(sn);
  _M.makeBasis(_bx, _by, _bz).setPosition(cx, cy, cz);
  B.geo(li, key, geo, _M, col ? { col } : {});
}

// ======================================================================
// 門
// ======================================================================
const THEME_DOOR = {
  psych_cell: 'cell', stairwell: 'fire', surgery: 'swing', delivery: 'swing', icu: 'swing', er: 'swing', autopsy: 'swing',
  chapel: 'chapel', director: 'wood', office: 'wood', dorm: 'wood',
  morgue: 'metal', supply: 'metal', archive: 'metal', boiler: 'metal', pump: 'metal', dock: 'metal', laundry: 'metal', incinerator: 'metal',
  tunnel: 'metal', machine: 'metal', ossuary: 'metal', stair_ext: 'metal', shop: 'glass', lobby: 'glass',
  ward: 'ward', peds_ward: 'ward', nursery: 'ward', xray: 'ward', ct: 'ward', pharmacy: 'ward', rehab: 'ward', cafeteria: 'ward', waiting: 'ward',
  security: 'ward', monitor: 'ward', playroom: 'ward',
};
const FRAME_MAT = { cell: 'steel_dirty', fire: 'trim_gray', swing: 'steel_brushed', chapel: 'trim_wood', wood: 'trim_wood', metal: 'trim_gray', glass: 'trim_alu', ward: 'trim_white', none: 'trim_white' };

function doorStyle(d) {
  const ta = d.za?.theme, tb = d.zb?.theme;
  const pri = ['psych_cell', 'stairwell', 'chapel', 'surgery', 'delivery', 'icu', 'er', 'autopsy', 'morgue', 'director', 'shop'];
  for (const t of pri) if (ta === t || tb === t) return THEME_DOOR[t];
  if (d.outA || d.outB) return ta === 'lobby' || tb === 'lobby' ? 'glass' : 'metal';
  const room = ta && ta !== 'corridor' ? ta : tb && tb !== 'corridor' ? tb : null;
  if (!room) return 'none';
  return THEME_DOOR[room] || 'ward';
}

export function buildDoors(K) {
  const { L, B } = K;
  const dyn = []; // 會被事件推動的門(樓梯間防火門、隔離房門)
  const all = []; // 全部門扇(互動、碰撞盒)
  const frames = (K.doorFrames = []), fallen = (K.fallenLeaves = []);
  K.doorList = [];
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (lv.rows[r][c] !== '+') continue;
      const d = K.door(li, c, r);
      if (!d.axis) continue;
      K.doorList.push(d);
      const R = prng(hashStr(`door${li},${c},${r}`));
      const F = frameOf(d.axis);
      const [u0, u1, w0, w1] = d.axis === 'z' ? [c * 2, c * 2 + 2, r * 2, r * 2 + 2] : [r * 2, r * 2 + 2, c * 2, c * 2 + 2];
      const [ca, ra] = d.axis === 'z' ? [c, r - 1] : [c - 1, r];
      const [cb, rb] = d.axis === 'z' ? [c, r + 1] : [c + 1, r];
      const sa = K.sideStyle(li, ca, ra), sb = K.sideStyle(li, cb, rb);
      const topA = Math.min(L.LEVEL_H, K.faceTop(li, ca, ra)), topB = Math.min(L.LEVEL_H, K.faceTop(li, cb, rb));
      const h = d.h;
      // 門楣(兩面各用該側的牆材質;底面是門洞頂)
      const dirA = d.axis === 'z' ? 'N' : 'W', dirB = d.axis === 'z' ? 'S' : 'E';
      if (topA > h) B.wall(li, sa.recipe.up, dirA, w0, u0, u1, y + h, y + topA, { col4: null, cBot: [0.85, 0.85, 0.83], cTop: [0.9, 0.9, 0.88] });
      if (topB > h) B.wall(li, sb.recipe.up, dirB, w1, u0, u1, y + h, y + topB, { cBot: [0.85, 0.85, 0.83], cTop: [0.9, 0.9, 0.88] });
      const soff = F.X(u0, w0), soff2 = F.X(u1, w1), sz0 = F.Z(u0, w0), sz1 = F.Z(u1, w1);
      B.flat(li, revealFor(lv.id).up, Math.min(soff, soff2), Math.min(sz0, sz1), Math.max(soff, soff2), Math.max(sz0, sz1), y + h, false, { col: [0.7, 0.7, 0.68] });
      // 門框飾條(兩面;多格門洞只在兩端)與門檻 → K.doorFrames:src/map/hospital/leaves.js 用門的 PBR 圖集畫(和門扇同一批、同一個 draw call)
      const style = doorStyle(d);
      const fm = FRAME_MAT[style] || 'trim_white';
      const runStart = d.run[0] === (d.axis === 'z' ? c : r), runEnd = d.run[1] === (d.axis === 'z' ? c : r);
      const fbox = (key, ua, ya, wa, ub, yb, wb, sw) => { const xa = F.X(ua, wa), xb = F.X(ub, wb), za = F.Z(ua, wa), zb = F.Z(ub, wb); frames.push({ li, key, sw, b: [Math.min(xa, xb), ya, Math.min(za, zb), Math.max(xa, xb), yb, Math.max(za, zb)] }); };
      for (const [wf, sgn] of [[w0, -1], [w1, 1]]) {
        const wa = wf, wb = wf + sgn * 0.028;
        const [lo, hi] = wa < wb ? [wa, wb] : [wb, wa];
        if (runStart) fbox(fm, u0 - 0.09, y, lo, u0, y + h + 0.09, hi);
        if (runEnd) fbox(fm, u1, y, lo, u1 + 0.09, y + h + 0.09, hi);
        fbox(fm, runStart ? u0 - 0.09 : u0, y + h, lo, runEnd ? u1 + 0.09 : u1, y + h + 0.09, hi);
      }
      // 門扇
      if (style === 'none') continue;
      const sealed = d.outA || d.outB ? SEALED_OUT.has(sa.zone?.id) || SEALED_OUT.has(sb.zone?.id) : SEALED.has(sa.zone?.id) || SEALED.has(sb.zone?.id);
      // 兩側都不是房間:門扇隨機掛在其中一面牆線。會上鎖的多格門洞每一格都照第一格(那一格的第一個亂數),
      // 不然相鄰兩格的門扇一前一後,關著也能斜著鑽過去(三樓走廊 ↔ 屋頂);這一格的亂數照樣用掉一個,後面的門扇狀態不變
      const side = () => { const own = R() < 0.5; return sealed && !runStart ? prng(hashStr(d.axis === 'z' ? `door${li},${d.run[0]},${r}` : `door${li},${c},${d.run[0]}`))() < 0.5 : own; };
      const roomB = sb.kind === 'room' && sb.zone?.theme !== 'corridor' && !d.outB ? true : sa.kind === 'room' && sa.zone?.theme !== 'corridor' && !d.outA ? false : side();
      const dirRoom = roomB ? 1 : -1, wf = roomB ? w1 : w0;
      fbox(null, u0 + 0.03, y, wf - 0.07, u1 - 0.03, y + 0.008, wf + 0.07, style === 'fire' || style === 'metal' || style === 'cell' ? 'kick' : 'alu'); // 門檻(金屬壓條)
      // 全部做成雙扇門(關上時封住 2m 門洞,中間留 6mm 門縫)。門扇是可轉動的實例(src/map/hospital/leaves.js),
      // 每扇有自己的代理 group:事件(甩門)與互動(開關門、碰撞盒、殭屍推門)只改 group.rotation.y
      const lh = h - 0.03;
      const hinges = [[u0, 1], [u1, -1]];
      const lw = (u1 - u0) / 2 - 0.038; // 鉸鍊離門框 3.5cm → 兩扇剛好在中線留 6mm(以前兩扇重疊 4cm,貼圖後會 z-fighting)
      const dynamic = (style === 'fire' || style === 'cell') && !d.outA && !d.outB;
      const ang = (du, dw) => Math.atan2(-(d.axis === 'z' ? dw : du), d.axis === 'z' ? du : dw);
      for (const [uh, sgn] of hinges) {
        let state = R.pick(['flat', 'flat', 'flat', 'room', 'room', 'ajar', 'fallen', 'none']);
        if (style === 'glass') state = R.pick(['flat', 'room', 'none', 'ajar']);
        if (dynamic) state = style === 'cell' ? R.pick(['room', 'ajar', 'ajar']) : R.pick(['flat', 'room']);
        if (sealed && (state === 'fallen' || state === 'none')) state = 'flat'; // 會上鎖的門洞:少一扇,鎖就只關得住半個門洞(207 曾經可以直接走進去)
        if (state === 'none') continue;
        // 方向向量(局部 u,w)
        let du, dw, hu = uh + sgn * 0.035, hw = wf;
        if (state === 'flat') { du = 0; dw = -dirRoom; }
        else if (state === 'room') { du = 0; dw = dirRoom; }
        else { const th = R.r(0.45, 1.05); du = sgn * Math.cos(th); dw = dirRoom * Math.sin(th); }
        const psi = ang(du, dw);
        const hinge = [F.X(hu, hw), y + 0.01, F.Z(hu, hw)];
        if (state === 'fallen') { // 倒在地上的門扇:平躺,一端墊在碎屑上(亂數順序與以前相同,門的配置不變)
          const cu = (u0 + u1) / 2 + R.r(-0.5, 0.5), cw = wf + dirRoom * R.r(0.9, 1.3);
          const yaw = R.r(0, 6.28), tilt = Math.abs(R.r(-0.04, 0.06)), t = style === 'cell' || style === 'fire' ? 0.07 : 0.05;
          _e.set(0, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
          const m = new THREE.Matrix4().compose(_p.set(F.X(cu, cw) - 0.5, y + t / 2 + 0.004, F.Z(cu, cw) + 0.9), _q, _s.set(1, 1, 1)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + tilt));
          fallen.push({ li, style, lw, lh, m });
          continue;
        }
        const g = new THREE.Object3D();
        g.position.set(hinge[0], hinge[1], hinge[2]);
        g.rotation.y = psi;
        const leaf = {
          li, style, group: g, open: psi, closed: ang(sgn, 0), swingA: ang(0, -dirRoom), swingB: ang(0, dirRoom), x: hinge[0], y, z: hinge[2],
          cx: (F.X(u0, w0) + F.X(u1, w1)) / 2, cz: (F.Z(u0, w0) + F.Z(u1, w1)) / 2, zone: (roomB ? sb.zone : sa.zone) || sa.zone || sb.zone,
          lw, lh, sgn, state, axis: d.axis, door: `${li},${c},${r}`, za: sa.zone, zb: sb.zone, out: !!(d.outA || d.outB), events: dynamic,
          wf, dirRoom, // 門扇關上時所在的牆面線(局部 w)與房間在哪一側(門縫光畫在另一側)
        };
        all.push(leaf);
        if (dynamic) dyn.push(leaf); // 驚嚇事件(甩門)只用樓梯間防火門與隔離房門(和以前一樣)
      }
    }
  }
  K.dynDoors = dyn;
  K.doorLeaves = all;
  K.leaves = buildLeaves(K, all);
  return dyn;
}

// ======================================================================
// 窗
// ======================================================================
const OLD_WIN = new Set(['chapel', 'dorm', 'director', 'ossuary']);
export function buildWindows(K) {
  const { L, B } = K;
  const isW = (li, c, r) => L.charAt(li, c, r) === 'W';
  const WALLISH = (ch) => ch === '#' || ch === 'E' || ch === 'W';
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (lv.rows[r][c] !== 'W') continue;
      const nOpen = !WALLISH(L.charAt(li, c, r - 1)) || !WALLISH(L.charAt(li, c, r + 1));
      const axis = nOpen ? 'z' : 'x';
      const F = frameOf(axis);
      const [u0, u1, w0, w1] = axis === 'z' ? [c * 2, c * 2 + 2, r * 2, r * 2 + 2] : [r * 2, r * 2 + 2, c * 2, c * 2 + 2];
      const [ca, ra, cb, rb] = axis === 'z' ? [c, r - 1, c, r + 1] : [c - 1, r, c + 1, r];
      const outA = K.outdoorAt(li, ca, ra), outB = K.outdoorAt(li, cb, rb);
      const sa = K.sideStyle(li, ca, ra), sb = K.sideStyle(li, cb, rb);
      const zoneIn = (outA ? sb.zone : outB ? sa.zone : sb.zone || sa.zone);
      const theme = zoneIn?.theme || '';
      const R = prng(hashStr(`win${li},${c},${r}`));
      const store = theme === 'shop' || (sa.zone?.theme === 'shop') || (sb.zone?.theme === 'shop');
      const wf = outA ? w0 + 0.14 : outB ? w1 - 0.14 : (w0 + w1) / 2;
      const inDir = outA ? 1 : outB ? -1 : 1; // 由窗框往室內的方向(局部 w)
      const s0 = y + L.WINDOW_SILL, s1 = y + L.WINDOW_TOP;
      const fk = store ? 'trim_alu' : OLD_WIN.has(theme) ? 'trim_wood' : lv.id === 'B1' || theme === 'machine' || theme === 'boiler' ? 'trim_steel' : R() < 0.5 ? 'trim_alu' : 'trim_white';
      const prevW = axis === 'z' ? isW(li, c - 1, r) : isW(li, c, r - 1), nextW = axis === 'z' ? isW(li, c + 1, r) : isW(li, c, r + 1);
      const fd = 0.05; // 框深一半
      // 外框:兩側立柱(相鄰窗只畫一根中柱)、上下框、中柱、橫檔
      if (!prevW) lbox(B, li, fk, F, u0, s0, wf - fd, u0 + 0.07, s1, wf + fd, {});
      lbox(B, li, fk, F, nextW ? u1 - 0.035 : u1 - 0.07, s0, wf - fd, nextW ? u1 + 0.035 : u1, s1, wf + fd, {});
      lbox(B, li, fk, F, u0, s1 - 0.07, wf - fd, u1, s1, wf + fd, {});
      lbox(B, li, fk, F, u0, s0, wf - fd, u1, s0 + 0.06, wf + fd, {});
      const mid = (u0 + u1) / 2, tr = store ? null : s0 + 1.12;
      if (!store) lbox(B, li, fk, F, mid - 0.03, s0, wf - 0.04, mid + 0.03, s1, wf + 0.04, {});
      if (tr) lbox(B, li, fk, F, u0, tr - 0.03, wf - 0.04, u1, tr + 0.03, wf + 0.04, {});
      // 玻璃
      const panes = store ? [[u0 + 0.07, u1 - 0.035, s0 + 0.06, s1 - 0.07]] : [[u0 + 0.07, mid - 0.03, s0 + 0.06, tr - 0.03], [mid + 0.03, u1 - 0.035, s0 + 0.06, tr - 0.03], [u0 + 0.07, mid - 0.03, tr + 0.03, s1 - 0.07], [mid + 0.03, u1 - 0.035, tr + 0.03, s1 - 0.07]];
      const glassP = []; // 各窗格 [a0, a1, b0, b1, 貼圖格 k](子彈打破玻璃用:physics/penetration.js)
      for (const [a0, a1, b0, b1] of panes) {
        const k = store ? (R() < 0.6 ? 0 : 1) : R.pick([0, 1, 1, 2, 2, 3, 3, -1, -1]);
        glassP.push([a0, a1, b0, b1, k]);
        if (k < 0) { K.glassFloor = K.glassFloor || []; K.glassFloor.push({ li, x: F.X((a0 + a1) / 2, wf + inDir * 0.6), y, z: F.Z((a0 + a1) / 2, wf + inDir * 0.6) }); continue; }
        const uA = (k % 2) * 0.5, vA = 1 - (((k / 2) | 0) + 1) * 0.5;
        const ua = uA + R.r(0, 0.1), ub = uA + 0.5 - R.r(0, 0.1), va = vA + R.r(0, 0.1), vb = vA + 0.5 - R.r(0, 0.1);
        const p = (u, yy) => [F.X(u, wf), yy, F.Z(u, wf)];
        const n = axis === 'z' ? [0, 0, 1] : [1, 0, 0];
        B.quad(li, 'glass', p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), n, [[ua, va], [ub, va], [ub, vb], [ua, vb]], [1, 1, 1]);
        if (k >= 2) { K.glassFloor = K.glassFloor || []; K.glassFloor.push({ li, x: F.X((a0 + a1) / 2, wf + inDir * 0.6), y, z: F.Z((a0 + a1) / 2, wf + inDir * 0.6) }); }
      }
      const Uv = F.U, Nv = F.W;
      // 木板封窗(室內側)
      const w207 = zoneIn?.id === 'f2_ward_207'; // [scene r4] 207 的窗:不封木板,兩側窗簾半拉(從後巷看是唯一亮著的窗)
      const boarded = !store && !w207 && R() < (lv.id === '1F' && (outA || outB) ? 0.32 : lv.id === 'B1' ? 0.5 : 0.14);
      const boards = [];
      if (boarded) {
        const n = R.i(2, 4), wb = wf + inDir * 0.075;
        for (let k = 0; k < n; k++) {
          const a = R.r(-0.35, 0.35), cy = s0 + 0.2 + R() * 1.1, cu = mid + R.r(-0.15, 0.15);
          boards.push([cu, cy, a]);
          const L2 = [Uv[0] * Math.cos(a), Math.sin(a), Uv[2] * Math.cos(a)], V2 = [-Uv[0] * Math.sin(a), Math.cos(a), -Uv[2] * Math.sin(a)];
          basisPlane(B, li, 'board', box1, F.X(cu, wb), cy, F.Z(cu, wb), L2, V2, Nv, R.r(2.0, 2.3), R.r(0.14, 0.22), 0.025);
        }
      }
      // 百葉窗或窗簾(室內側)
      if (!store && !boarded) {
        const roll = w207 ? 0.3 : R();
        if (roll < 0.22) {
          const drop = R.r(0.5, 1.45), a = R.r(-0.12, 0.12), cu = mid, wbl = wf + inDir * 0.09;
          const L2 = [Uv[0] * Math.cos(a), Math.sin(a), Uv[2] * Math.cos(a)], V2 = [-Uv[0] * Math.sin(a), Math.cos(a), -Uv[2] * Math.sin(a)];
          basisPlane(B, li, 'blinds', plane1, F.X(cu, wbl), s1 - 0.06 - drop / 2, F.Z(cu, wbl), L2, V2, Nv, 1.86, drop, 1);
        } else if (roll < 0.42 && !['machine', 'boiler', 'supply', 'dock', 'tunnel'].includes(theme)) {
          for (const side of w207 || R() >= 0.5 ? [-1, 1] : [-1]) {
            const wcur = w207 ? (side < 0 ? 0.46 : 0.36) : R.r(0.5, 0.9), hcur = w207 ? 1.62 : R.r(1.2, 1.9), cu = side < 0 ? u0 + 0.1 + wcur / 2 : u1 - 0.1 - wcur / 2, wc = wf + inDir * (0.16 + R() * 0.05);
            basisPlane(B, li, 'curtain', plane1, F.X(cu, wc), s1 + 0.05 - hcur / 2, F.Z(cu, wc), Uv, [0, 1, 0], Nv, wcur, hcur, 1);
          }
        }
      }
      // 鐵條(精神科、地下室、北面後巷的一樓窗)
      if (!store && (theme === 'psych_cell' || zoneIn?.mood === 'psych' || lv.id === 'B1' || (lv.id === '1F' && r <= 6 && (outA || outB)))) {
        const wbar = wf - inDir * 0.09;
        for (let u = u0 + 0.12; u < u1 - 0.05; u += 0.14) lbox(B, li, 'iron', F, u - 0.012, s0, wbar - 0.012, u + 0.012, s1, wbar + 0.012, {});
        lbox(B, li, 'iron', F, u0, s0 + 0.5, wbar - 0.02, u1, s0 + 0.54, wbar + 0.02, {});
        lbox(B, li, 'iron', F, u0, s1 - 0.25, wbar - 0.02, u1, s1 - 0.21, wbar + 0.02, {});
      }
      // 外側窗台石(外牆)
      if (outA || outB) { const wo = outA ? w0 : w1, sg = outA ? -1 : 1; lbox(B, li, 'trim_stone', F, u0 - 0.06, s0 - 0.07, Math.min(wo, wo + sg * 0.09), u1 + 0.06, s0 + 0.02, Math.max(wo, wo + sg * 0.09), {}); }
      K.windowInfo = K.windowInfo || [];
      K.windowInfo.push({ li, c, r, axis, wf, inDir, outA, outB, zone: zoneIn, x: F.X(mid, wf), z: F.Z(mid, wf), u0, u1, boarded, store, panes: glassP, boards });
    }
  }
  try { buildFacade(K); } catch (e) { console.error('[hospital] 外牆設備失敗', e); } // [scene6] 窗型冷氣、鐵窗、落水管
}

// ======================================================================
// 欄杆 / 櫃台 / 矮牆('=')
// ======================================================================
export function railType(K, li, c, r) {
  const { L } = K;
  const lvId = L.levels[li].id;
  if (lvId === '3F' && (r === 33 || r === 25 || c === 8 || c === 51)) return 'parapet';
  const zone = L.zoneAt(li, c, r);
  if (zone?.theme === 'fire_escape') return 'rail_metal';
  for (const [, dc, dr] of DIRS) {
    const n = L.charAt(li, c + dc, r + dr);
    if (ARROW(n)) { const z2 = L.zoneAt(li, c + dc, r + dr); if (z2?.theme === 'lobby') return 'stair_bal'; }
  }
  for (const [, dc, dr] of DIRS) if (K.outdoorAt(li, c + dc, r + dr) && L.charAt(li, c + dc, r + dr) !== '_') return 'parapet';
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const n = L.charAt(li, c + dc, r + dr); if (n === 'o' || n === '%') return 'gallery'; }
  return 'counter';
}
export function buildRails(K) {
  const { L, B } = K;
  const cache = new Map();
  K.railSolid = (li, c, r) => {
    const k = `${li},${c},${r}`;
    if (!cache.has(k)) cache.set(k, railType(K, li, c, r));
    const t = cache.get(k);
    return t !== 'rail_metal';
  };
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (lv.rows[r][c] !== '=') continue;
      const t = railType(K, li, c, r);
      cache.set(`${li},${c},${r}`, t);
      const x0 = c * 2, z0 = r * 2, x1 = x0 + 2, z1 = z0 + 2;
      const nb = (dc, dr) => L.charAt(li, c + dc, r + dr);
      const hidden = (ch) => ch === '#' || ch === 'E' || ch === 'W' || ch === '=';
      if (t === 'parapet' || t === 'gallery' || t === 'counter') {
        const hgt = t === 'counter' ? 1.0 : 1.05;
        const side = t === 'parapet' ? (lv.id === '3F' && L.inBuilding(c, r) && (r === 25) ? 'facade_dark' : 'facade') : t === 'gallery' ? 'marble_wall' : 'dado_brown';
        for (const [dir, dc, dr] of DIRS) {
          const n = nb(dc, dr);
          if (hidden(n)) continue;
          const yb = y;
          const [fx, a0, a1] = dir === 'N' ? [z0, x0, x1] : dir === 'S' ? [z1, x0, x1] : dir === 'E' ? [x1, z0, z1] : [x0, z0, z1];
          B.wall(li, side, dir, fx, a0, a1, yb, y + hgt, { cBot: [0.75, 0.75, 0.73], cTop: [0.95, 0.95, 0.92] });
        }
        const cap = t === 'counter' ? 'trim_cream' : t === 'gallery' ? 'trim_marble' : 'trim_stone';
        B.box(li, cap, x0 - (hidden(nb(-1, 0)) ? 0 : 0.04), y + hgt, z0 - (hidden(nb(0, -1)) ? 0 : 0.04), x1 + (hidden(nb(1, 0)) ? 0 : 0.04), y + hgt + 0.07, z1 + (hidden(nb(0, 1)) ? 0 : 0.04), { skip: 'D' });
        if (t === 'gallery') { // 銅扶手
          for (const [dir, dc, dr] of DIRS) {
            const n = nb(dc, dr);
            if (n !== 'o' && n !== '%') continue;
            if (dir === 'N' || dir === 'S') { const zz = dir === 'N' ? z0 + 0.12 : z1 - 0.12; B.box(li, 'trim_brass', x0, y + hgt + 0.07, zz - 0.03, x1, y + hgt + 0.13, zz + 0.03, {}); }
            else { const xx = dir === 'W' ? x0 + 0.12 : x1 - 0.12; B.box(li, 'trim_brass', xx - 0.03, y + hgt + 0.07, z0, xx + 0.03, y + hgt + 0.13, z1, {}); }
          }
        }
        if (t === 'counter') { // 玻璃隔板 + 鋁框(櫃台中線)
          const alongX = nb(-1, 0) === '=' || nb(1, 0) === '=' || nb(-1, 0) === '#' && nb(1, 0) === '#';
          const R = prng(hashStr(`ctr${li}${c}${r}`));
          if (alongX) {
            const zc = (z0 + z1) / 2;
            B.box(li, 'trim_alu', x0, y + hgt + 0.07, zc - 0.03, x0 + 0.05, y + 2.45, zc + 0.03, {});
            B.box(li, 'trim_alu', x0, y + 2.4, zc - 0.03, x1, y + 2.46, zc + 0.03, {});
            const k = R.pick([0, 1, 2, 3, -1]);
            (K.counterGlass ||= []).push({ li, c, r, k, x0: x0 + 0.05, x1, zc, y0: y + 1.3, y1: y + 2.4 }); // 櫃台玻璃隔板(子彈打破、能否翻越)
            if (k >= 0) { const uA = (k % 2) * 0.5, vA = 1 - (((k / 2) | 0) + 1) * 0.5; B.quad(li, 'glass', [x0 + 0.05, y + 1.3, zc], [x1, y + 1.3, zc], [x1, y + 2.4, zc], [x0 + 0.05, y + 2.4, zc], [0, 0, 1], [[uA, vA], [uA + 0.5, vA], [uA + 0.5, vA + 0.5], [uA, vA + 0.5]]); }
          } else {
            const xc = (x0 + x1) / 2;
            B.box(li, 'trim_alu', xc - 0.03, y + hgt + 0.07, z0, xc + 0.03, y + 2.45, z0 + 0.05, {});
            B.box(li, 'trim_alu', xc - 0.03, y + 2.4, z0, xc + 0.03, y + 2.46, z1, {});
          }
        }
      } else if (t === 'stair_bal') {
        // 大階梯旁的石材欄牆:頂部跟著樓梯坡度
        let st = null;
        for (const s of L.stairs) if (s.lower === li && c >= s.c0 - 1 && c <= s.c1 + 1 && r >= s.r0 && r <= s.r1) st = s;
        const ceilH = Math.min(L.LEVEL_H, L.ceilY(li, c, r) - y);
        const topAt = (z) => Math.max(1.05, Math.min(ceilH, (st ? L.stairHeight(st, (st.x0 + st.x1) / 2, z) - y : 0) + 1.0));
        const tA = topAt(z0 + 0.001), tB = topAt(z1 - 0.001);
        for (const [dir, dc, dr] of DIRS) {
          const n = nb(dc, dr);
          if (hidden(n)) continue;
          if (dir === 'N' || dir === 'S') { const tt = dir === 'N' ? tA : tB; B.wall(li, 'marble_wall', dir, dir === 'N' ? z0 : z1, x0, x1, y, y + tt, { cBot: [0.75, 0.75, 0.73], cTop: [0.95, 0.95, 0.92] }); continue; }
          const fx = dir === 'E' ? x1 : x0;
          // 斜頂側面:四角(沿 z)
          const p = dir === 'E' ? [[fx, y, z1], [fx, y, z0], [fx, y + tA, z0], [fx, y + tB, z1]] : [[fx, y, z0], [fx, y, z1], [fx, y + tB, z1], [fx, y + tA, z0]];
          const uv = dir === 'E' ? [[-z1, 0], [-z0, 0], [-z0, tA], [-z1, tB]] : [[z0, 0], [z1, 0], [z1, tB], [z0, tA]];
          B.quad(li, 'marble_wall', p[0], p[1], p[2], p[3], dir === 'E' ? [1, 0, 0] : [-1, 0, 0], uv, [[0.75, 0.75, 0.73], [0.75, 0.75, 0.73], [0.95, 0.95, 0.92], [0.95, 0.95, 0.92]]);
        }
        // 斜頂
        const len = Math.hypot(z1 - z0, tB - tA), ny = (z1 - z0) / len, nz = -(tB - tA) / len;
        B.quad(li, 'trim_marble', [x0 - 0.03, y + tB, z1], [x1 + 0.03, y + tB, z1], [x1 + 0.03, y + tA, z0], [x0 - 0.03, y + tA, z0], [0, ny, nz], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]);
        // 銅扶手(樓梯側)
        if (st) {
          const xs = c < st.c0 ? x1 - 0.1 : x0 + 0.1;
          const ya = y + tA + 0.06, yb = y + tB + 0.06;
          const mid = [(xs), (ya + yb) / 2 + 0.03, (z0 + z1) / 2], lenr = Math.hypot(z1 - z0, yb - ya);
          obox(B, li, 'trim_brass', mid[0], mid[1], mid[2], 0.06, 0.06, lenr, 0, -Math.atan2(yb - ya, z1 - z0), 0);
        }
      } else if (t === 'rail_metal') {
        // 鐵欄杆:沿著與可走格/樓梯/開口相鄰的邊
        for (const [dir, dc, dr] of DIRS) {
          const n = nb(dc, dr);
          if (hidden(n) || n === '_') continue;
          const edge = dir === 'N' ? [x0, z0 + 0.05, x1, z0 + 0.05] : dir === 'S' ? [x0, z1 - 0.05, x1, z1 - 0.05] : dir === 'E' ? [x1 - 0.05, z0, x1 - 0.05, z1] : [x0 + 0.05, z0, x0 + 0.05, z1];
          railing(B, li, edge, y, 1.05, 'iron');
        }
      }
    }
  }
}
// 一段鐵欄杆:edge = [xa, za, xb, zb]
export function railing(B, li, [xa, za, xb, zb], y, h, key = 'iron', post = 1.0) {
  const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / post));
  const alongX = Math.abs(xb - xa) > Math.abs(zb - za);
  for (let i = 0; i <= n; i++) { const t = i / n, px = xa + (xb - xa) * t, pz = za + (zb - za) * t; B.box(li, key, px - 0.025, y, pz - 0.025, px + 0.025, y + h, pz + 0.025, {}); }
  for (const hh of [h - 0.04, h * 0.5]) {
    if (alongX) B.box(li, key, Math.min(xa, xb), y + hh, za - 0.02, Math.max(xa, xb), y + hh + 0.04, za + 0.02, {});
    else B.box(li, key, xa - 0.02, y + hh, Math.min(za, zb), xa + 0.02, y + hh + 0.04, Math.max(za, zb), {});
  }
}

// ======================================================================
// 鐵欄杆 / 圍籬('|')+ 灌木
// ======================================================================
export function buildFences(K) {
  const { L, B } = K;
  const li = L.levels.findIndex((l) => l.id === '1F');
  const lv = L.levels[li], y = lv.y;
  const isF = (c, r) => L.charAt(li, c, r) === '|';
  const bush = (cx, cz, along, len, R) => { // 交叉的枯灌木片
    for (let k = 0; k < 2; k++) {
      const h = R.r(0.6, 1.1), a = along === 'x' ? 0 : Math.PI / 2;
      const yaw = a + (k ? R.r(0.5, 1.0) : R.r(-0.25, 0.25));
      basisPlane(B, li, 'bush', plane1, cx, y + h / 2 - 0.05, cz, [Math.cos(yaw), 0, -Math.sin(yaw)], [0, 1, 0], [Math.sin(yaw), 0, Math.cos(yaw)], len * R.r(0.8, 1.1), h, 1);
    }
  };
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (!isF(c, r)) continue;
    const R = prng(hashStr(`fence${c},${r}`));
    const alongX = isF(c - 1, r) || isF(c + 1, r) || !(isF(c, r - 1) || isF(c, r + 1));
    const boundary = r === L.H - 1 || c === L.W - 1;
    const cem = c <= 6 && r >= 11 && r <= 25;
    const x0 = c * 2, z0 = r * 2;
    let line; // 圍籬所在的線
    if (boundary) line = r === L.H - 1 ? (alongX ? z0 + 0.1 : x0 + 0.1) : x0 + 0.1;
    else line = alongX ? z0 + 1 : x0 + 1;
    const ax = boundary ? (r === L.H - 1 && c !== L.W - 1 ? true : c === L.W - 1 ? false : alongX) : alongX;
    const kind = boundary ? 'tall' : cem ? 'iron' : 'chain';
    const hgt = kind === 'tall' ? 2.4 : kind === 'iron' ? 1.6 : 2.0;
    const a0 = ax ? x0 : z0, a1 = a0 + 2;
    const bx = (u0, y0, v0, u1, y1, v1, key) => (ax ? B.box(li, key, u0, y0, v0, u1, y1, v1, {}) : B.box(li, key, v0, y0, u0, v1, y1, u1, {}));
    // 柱
    bx(a0 - 0.05, y, line - 0.05, a0 + 0.05, y + hgt + 0.1, line + 0.05, kind === 'chain' ? 'steel_dirty' : 'iron');
    if (kind === 'chain') {
      bx(a0, y + hgt - 0.04, line - 0.025, a1, y + hgt, line + 0.025, 'steel_dirty');
      const p = (u, yy) => (ax ? [u, yy, line] : [line, yy, u]);
      const n = ax ? [0, 0, 1] : [1, 0, 0];
      B.quad(li, 'chainlink', p(a0, y + 0.03), p(a1, y + 0.03), p(a1, y + hgt - 0.04), p(a0, y + hgt - 0.04), n, [[a0, 0], [a1, 0], [a1, hgt], [a0, hgt]]);
      for (let k = 0; k < 3; k++) bx(a0, y + hgt + 0.08 + k * 0.1, line - 0.006, a1, y + hgt + 0.09 + k * 0.1, line + 0.006, 'iron'); // 鐵絲
    } else {
      for (const hh of [0.15, hgt - 0.18]) bx(a0, y + hh, line - 0.02, a1, y + hh + 0.04, line + 0.02, 'iron');
      for (let u = a0 + 0.1; u < a1; u += 0.15) {
        const bend = R() < 0.06 ? R.r(-0.2, 0.2) : 0;
        if (Math.abs(bend) > 0.01) obox(B, li, 'iron', ax ? u : line, y + hgt / 2, ax ? line : u, 0.022, hgt, 0.022, 0, ax ? bend : 0, ax ? 0 : bend);
        else bx(u - 0.011, y + 0.02, line - 0.011, u + 0.011, y + hgt, line + 0.011, 'iron');
        bx(u - 0.02, y + hgt, line - 0.02, u + 0.02, y + hgt + 0.08, line + 0.02, 'iron'); // 矛尖
      }
    }
    // 灌木:圍籬兩側(邊界外側也種,看起來是樹籬)
    const off = boundary ? [0.8, 1.6] : [0.55, -0.55];
    for (const o of off) {
      const cu = (a0 + a1) / 2, cv = line + o;
      if (ax) bush(cu, cv, 'x', 2.1, R); else bush(cv, cu, 'z', 2.1, R);
    }
    // 門洞(下一格可走、再下一格又是圍籬):石柱 + 打開的鐵門
    const dc = ax ? 1 : 0, dr = ax ? 0 : 1;
    if (!isF(c + dc, r + dr) && L.charAt(li, c + dc, r + dr) !== '#' && isF(c + 2 * dc, r + 2 * dr)) {
      for (const pu of [a1 - 0.25, a1 + 2 + 0.05]) bx(pu - 0.2, y, line - 0.2, pu + 0.2, y + hgt + 0.35, line + 0.2, 'trim_stone');
      const gx = ax ? a1 + 0.1 : line, gz = ax ? line : a1 + 0.1;
      const yaw = ax ? -R.r(1.0, 1.5) : -Math.PI / 2 - R.r(1.0, 1.5);
      _e.set(0, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
      for (let k = 0; k < 7; k++) { _M2.compose(_p.set(0.12 + k * 0.14, hgt / 2, 0), _q.identity(), _s.set(0.02, hgt - 0.1, 0.02)); _M.compose(_s.set(gx, y, gz), _q.setFromEuler(_e), _p.set(1, 1, 1)); _M.multiply(_M2); B.geo(li, 'iron', box1, _M); }
      for (const hh of [0.2, hgt - 0.2]) { _M2.compose(_p.set(0.5, hh, 0), _q.identity(), _s.set(1.0, 0.04, 0.03)); _M.compose(_s.set(gx, y, gz), _q.setFromEuler(_e), _p.set(1, 1, 1)); _M.multiply(_M2); B.geo(li, 'iron', box1, _M); }
    }
  }
}

// ======================================================================
// 電梯(每層同一井道;門扇關閉,其中一部卡在半開)
// ======================================================================
export function buildElevators(K) {
  const { L, B } = K;
  K.elevators = [];
  for (const f of K.faces) {
    if (f.kind !== 'elevator') continue;
    const li = f.li, y = f.y, lvId = L.levels[li].id;
    const isH = f.dir === 'N' || f.dir === 'S', sg = f.dir === 'S' || f.dir === 'E' ? 1 : -1;
    for (let a = f.a0; a < f.a1 - 0.5; a += 2) {
      const mid = a + 1;
      const wf = f.fixed;
      const F = { X: (u, w) => (isH ? u : w), Z: (u, w) => (isH ? w : u) };
      const stuck = lvId === '2F' && Math.round(mid) === 61;
      // 不鏽鋼門框
      lbox(B, li, 'steel_brushed', F, mid - 0.68, y, Math.min(wf, wf + sg * 0.06), mid - 0.56, y + 2.32, Math.max(wf, wf + sg * 0.06), {});
      lbox(B, li, 'steel_brushed', F, mid + 0.56, y, Math.min(wf, wf + sg * 0.06), mid + 0.68, y + 2.32, Math.max(wf, wf + sg * 0.06), {});
      lbox(B, li, 'steel_brushed', F, mid - 0.68, y + 2.2, Math.min(wf, wf + sg * 0.06), mid + 0.68, y + 2.32, Math.max(wf, wf + sg * 0.06), {});
      // 門扇(貼在牆面前)
      const gap = stuck ? 0.42 : 0.004;
      const wd = wf + sg * 0.012;
      lbox(B, li, 'steel_dirty', F, mid - 0.56, y, Math.min(wd, wd + sg * 0.03), mid - gap / 2, y + 2.2, Math.max(wd, wd + sg * 0.03), {});
      lbox(B, li, 'steel_dirty', F, mid + gap / 2, y, Math.min(wd, wd + sg * 0.03), mid + 0.56, y + 2.2, Math.max(wd, wd + sg * 0.03), {});
      if (stuck) { // 門縫後漆黑的井道 + 鋼纜
        const wb = wf + sg * 0.006;
        lbox(B, li, 'trim_plenum', F, mid - gap / 2, y, Math.min(wb, wb + sg * 0.002), mid + gap / 2, y + 2.2, Math.max(wb, wb + sg * 0.002), {});
        for (const off of [-0.09, 0.07]) lbox(B, li, 'iron', F, mid + off - 0.008, y, Math.min(wb, wb + sg * 0.01), mid + off + 0.008, y + 2.2, Math.max(wb, wb + sg * 0.01), {});
      }
      // 樓層指示燈座 + 呼叫按鈕盒
      lbox(B, li, 'trim_dark', F, mid - 0.22, y + 2.4, Math.min(wf, wf + sg * 0.04), mid + 0.22, y + 2.58, Math.max(wf, wf + sg * 0.04), {});
      K.elevators.push({ li, x: F.X(mid, wf + sg * 0.045), y: y + 2.49, z: F.Z(mid, wf + sg * 0.045), dir: f.dir, stuck, isH, sg, wf, mid });
    }
    // 呼叫按鈕(兩部電梯中間)
    const mid2 = (f.a0 + f.a1) / 2, wf = f.fixed;
    const F = { X: (u, w) => (isH ? u : w), Z: (u, w) => (isH ? w : u) };
    lbox(B, li, 'steel_brushed', F, mid2 - 0.08, y + 1.0, Math.min(wf, wf + sg * 0.025), mid2 + 0.08, y + 1.35, Math.max(wf, wf + sg * 0.025), {});
    K.elevators.push({ li, x: F.X(mid2, wf + sg * 0.03), y: y + 1.12, z: F.Z(mid2, wf + sg * 0.03), dir: f.dir, button: true, isH, sg, wf, mid: mid2 });
  }
}

// ======================================================================
// 可走格與挑空/建築外空中/樓梯開口相鄰的邊 → 欄杆(樓梯頂端出入口除外;逃生梯平台由 stairs.js 處理)
// ======================================================================
export function buildEdgeRails(K) {
  const { L, B } = K;
  const exitCells = new Set(); // 樓梯頂端出口:上層格 + 開口方向
  for (const s of L.stairs) {
    if (s.upper < 0) continue;
    for (let c = s.c0; c <= s.c1; c++) for (let r = s.r0; r <= s.r1; r++) {
      if (s.axis === 'z') { const re = s.dir === '^' ? s.r0 - 1 : s.r1 + 1; exitCells.add(`${s.upper},${c},${re}`); }
      else { const ce = s.dir === '<' ? s.c0 - 1 : s.c1 + 1; exitCells.add(`${s.upper},${ce},${r}`); }
    }
  }
  for (const lv of L.levels) {
    const li = lv.index;
    if (li === 0) continue;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (!(L.flagsAt(li, c, r) & L.F.WALK)) continue;
      if (L.zoneAt(li, c, r)?.theme === 'fire_escape') continue;
      const ch0 = lv.rows[r][c];
      if ('^v<>'.includes(ch0)) continue;
      for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const n = L.charAt(li, c + dc, r + dr);
        if (n !== 'o' && n !== '_' && n !== '%') continue;
        if (n === '%' && exitCells.has(`${li},${c},${r}`)) continue;
        if (n === '_' && lv.id === '1F') continue;
        const x0 = c * 2, z0 = r * 2;
        const edge = dr === -1 ? [x0, z0 + 0.06, x0 + 2, z0 + 0.06] : dr === 1 ? [x0, z0 + 1.94, x0 + 2, z0 + 1.94] : dc === 1 ? [x0 + 1.94, z0, x0 + 1.94, z0 + 2] : [x0 + 0.06, z0, x0 + 0.06, z0 + 2];
        railing(B, li, edge, lv.y, 1.08, ch0 === ',' || ch0 === 'z' ? 'iron' : 'trim_brass', 1.0);
      }
    }
  }
}
