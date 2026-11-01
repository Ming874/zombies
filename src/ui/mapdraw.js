import { FONT, INK, rng, hashStr, canvas } from './mapink.js';

// 平面圖本體:把 layout 畫成 1962 年設計、2003 年修訂的建築平面圖(影印本)。只用碳粉黑,沒有遊戲配色。
// 每層畫一次(第一次翻到那一層時),得到兩張離屏 canvas:
//   crisp:清楚的影印(結構線 + 房名、家具、車輛路障、樓梯字)。走過的地方用迷霧遮罩露出這一張
//   faint:沒走過的地方(只有結構線;半解析度、模糊、掉粉,像印壞的那一張)
// 牆:遊戲裡牆是整格 2m,圖上內縮成 0.8m 厚,剖面畫 45° 斜線網底 + 墨線輪廓(比較像真的平面圖)。
export const PX = 20; // 每格像素(1 格 = 2m;圖上寫 1/200)
const D = 6; // 牆面內縮(px)

const WALLISH = (ch) => ch === '#' || ch === 'W' || ch === 'E';
const OUTD = (ch) => ch === ',' || ch === '"' || ch === 'z' || ch === '|';
const ARROW = (ch) => ch === '^' || ch === 'v' || ch === '<' || ch === '>';
export const WALK = (ch) => '.,"+~^v<>ZzP$ah'.includes(ch);
const T = INK.toner;

// 1962 / 2003 年圖上的叫法(遊戲裡的區域名是現在的叫法)
const PRINT_NAME = { f1_store: '福利社', f1_corridor: '走廊', f2_corridor: '走廊' };
// 每層原本貼這張圖的位置(「您現在位置」):B1 電梯口、1F 大廳北口、2F 護理站、3F 電梯口
const HERE = { B1: [31.5, 12.5], '1F': [31.5, 27.5], '2F': [39.6, 17.6], '3F': [31.5, 12.6] };

export function isHospital(L) { return !!L.zones?.some((z) => z.id === 'f2_ward_207'); }
export function hereOf(L, li) {
  const lv = L.levels[li];
  if (isHospital(L) && HERE[lv.id]) return HERE[lv.id];
  const s = L.start;
  if (s && (s.level ?? 0) === li) return [s.x / L.CELL, s.z / L.CELL];
  const st = L.stairs?.find((q) => q.lower === li);
  return st ? [st.c0 - 0.5, (st.r0 + st.r1 + 1) / 2] : null;
}

// ---------------------------------------------------------------------
// 牆的分類:0 空;1 牆(剖面網底);2 基地圍牆(淡雙線);3 土方(地下層離房間兩格以上的實心)
function cellTypes(L, li) {
  const { W, H } = L, out = new Uint8Array(W * H);
  const B = L.BUILDING || { c0: 0, r0: 0, c1: W - 1, r1: H - 1 };
  const inB = (c, r) => c >= B.c0 && c <= B.c1 && r >= B.r0 && r <= B.r1;
  const under = L.levels[li].y < -0.5;
  const ch = (c, r) => L.charAt(li, c, r);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const k = ch(c, r), i = r * W + c;
    if (k === 'W') { out[i] = 1; continue; }
    if (k !== '#') continue;
    if (!inB(c, r) && (OUTD(ch(c - 1, r)) || OUTD(ch(c + 1, r)) || OUTD(ch(c, r - 1)) || OUTD(ch(c, r + 1)))) { out[i] = 2; continue; }
    if (under) {
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) { const n = ch(c + dc, r + dr); if (n !== '#' && n !== '_') { near = true; break; } }
      out[i] = near ? 1 : 3;
    } else out[i] = 1;
  }
  return out;
}

// 牆的子格遮罩:每格切成 3×3(D, PX-2D, D);朝向空間的那一側內縮
const SUB = [0, D, PX - D];
const sx = (k) => Math.floor(k / 3) * PX + SUB[k % 3];
function wallMask(Tp, W, H, door) {
  const SW = W * 3, SH = H * 3, M = new Uint8Array(SW * SH);
  // 門洞算「牆」:牆端不往門洞內縮,門洞寬度剛好一格(2m)
  const wall = (c, r) => c < 0 || r < 0 || c >= W || r >= H || Tp[r * W + c] === 1 || Tp[r * W + c] === 3 || door(c, r);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (Tp[r * W + c] !== 1) continue;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const dx = i - 1, dy = j - 1;
      if ((dx && !wall(c + dx, r)) || (dy && !wall(c, r + dy)) || (dx && dy && !wall(c + dx, r + dy))) continue;
      M[(r * 3 + j) * SW + c * 3 + i] = 1;
    }
  }
  return { M, SW, SH };
}
function maskFill({ M, SW, SH }) {
  const p = new Path2D();
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW;) {
    if (!M[j * SW + i]) { i++; continue; }
    let e = i;
    while (e < SW && M[j * SW + e]) e++;
    p.rect(sx(i), sx(j), sx(e) - sx(i), sx(j + 1) - sx(j));
    i = e;
  }
  return p;
}
function maskEdges({ M, SW, SH }) {
  const p = new Path2D(), at = (i, j) => (i < 0 || j < 0 || i >= SW || j >= SH ? 0 : M[j * SW + i]);
  for (let j = 0; j <= SH; j++) for (let i = 0; i < SW;) {
    if (at(i, j - 1) === at(i, j)) { i++; continue; }
    let e = i;
    while (e < SW && at(e, j - 1) !== at(e, j)) e++;
    p.moveTo(sx(i), sx(j)); p.lineTo(sx(e), sx(j));
    i = e;
  }
  for (let i = 0; i <= SW; i++) for (let j = 0; j < SH;) {
    if (at(i - 1, j) === at(i, j)) { j++; continue; }
    let e = j;
    while (e < SH && at(i - 1, e) !== at(i, e)) e++;
    p.moveTo(sx(i), sx(j)); p.lineTo(sx(i), sx(e));
    j = e;
  }
  return p;
}
function hatch(x, w, h, gap, a, lw = 0.7, dir = 1) {
  x.beginPath();
  for (let t = -h; t < w + h; t += gap) { if (dir > 0) { x.moveTo(t, 0); x.lineTo(t + h, h); } else { x.moveTo(t + h, 0); x.lineTo(t, h); } }
  x.strokeStyle = T(a); x.lineWidth = lw; x.stroke();
}

function walls(x, L, li, Tp) {
  const { W, H } = L, pw = W * PX, ph = H * PX;
  const mk = wallMask(Tp, W, H, (c, r) => L.charAt(li, c, r) === '+');
  const fill = maskFill(mk);
  // 土方(地下層):稀疏的斷續斜線
  const earth = new Path2D();
  let anyEarth = false;
  for (let r = 0; r < H; r++) for (let c = 0; c < W;) {
    if (Tp[r * W + c] !== 3) { c++; continue; }
    let e = c;
    while (e < W && Tp[r * W + e] === 3) e++;
    earth.rect(c * PX, r * PX, (e - c) * PX, PX); anyEarth = true; c = e;
  }
  if (anyEarth) {
    x.save(); x.clip(earth);
    x.setLineDash([16, 5, 3, 6]); hatch(x, pw, ph, 11, 0.34, 0.85); x.setLineDash([]);
    x.restore();
  }
  // 剖面:淡碳粉底 + 45° 斜線 + 粗輪廓
  x.save();
  x.fillStyle = T(0.3); x.fill(fill);
  x.clip(fill); hatch(x, pw, ph, 3.4, 0.72, 0.8);
  x.restore();
  x.strokeStyle = T(0.96); x.lineWidth = 1.7; x.lineCap = 'square';
  x.stroke(maskEdges(mk));
  // 基地圍牆:鉛筆感的雙線
  const R = rng(55 + li), site = new Path2D();
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (Tp[r * W + c] !== 2) continue;
    const cx = (c + 0.5) * PX, cy = (r + 0.5) * PX;
    const hz = (c > 0 && Tp[r * W + c - 1] === 2) || (c < W - 1 && Tp[r * W + c + 1] === 2);
    const vt = (r > 0 && Tp[(r - 1) * W + c] === 2) || (r < H - 1 && Tp[(r + 1) * W + c] === 2);
    for (const o of [-1.8, 1.8]) {
      if (hz) { site.moveTo(c * PX, cy + o + R.r(-0.3, 0.3)); site.lineTo((c + 1) * PX, cy + o + R.r(-0.3, 0.3)); }
      if (vt) { site.moveTo(cx + o + R.r(-0.3, 0.3), r * PX); site.lineTo(cx + o + R.r(-0.3, 0.3), (r + 1) * PX); }
    }
  }
  x.strokeStyle = T(0.55); x.lineWidth = 0.9; x.stroke(site);
}

// 窗:剖面挖空,畫兩條牆面線 + 兩條細玻璃線,端點畫窗框
function windows(x, L, li) {
  const ch = (c, r) => L.charAt(li, c, r);
  const p = new Path2D(), jb = new Path2D();
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (ch(c, r) !== 'W') continue;
    const X = c * PX, Y = r * PX;
    const hz = WALLISH(ch(c - 1, r)) && WALLISH(ch(c + 1, r)) ? true : WALLISH(ch(c, r - 1)) && WALLISH(ch(c, r + 1)) ? false : WALLISH(ch(c - 1, r)) || WALLISH(ch(c + 1, r));
    if (hz) {
      x.clearRect(X, Y + D - 1.2, PX, PX - 2 * D + 2.4);
      p.moveTo(X, Y + D); p.lineTo(X + PX, Y + D); p.moveTo(X, Y + PX - D); p.lineTo(X + PX, Y + PX - D);
      jb.moveTo(X, Y + PX / 2 - 1.2); jb.lineTo(X + PX, Y + PX / 2 - 1.2); jb.moveTo(X, Y + PX / 2 + 1.2); jb.lineTo(X + PX, Y + PX / 2 + 1.2);
      if (ch(c - 1, r) !== 'W') { p.moveTo(X, Y + D); p.lineTo(X, Y + PX - D); }
      if (ch(c + 1, r) !== 'W') { p.moveTo(X + PX, Y + D); p.lineTo(X + PX, Y + PX - D); }
    } else {
      x.clearRect(X + D - 1.2, Y, PX - 2 * D + 2.4, PX);
      p.moveTo(X + D, Y); p.lineTo(X + D, Y + PX); p.moveTo(X + PX - D, Y); p.lineTo(X + PX - D, Y + PX);
      jb.moveTo(X + PX / 2 - 1.2, Y); jb.lineTo(X + PX / 2 - 1.2, Y + PX); jb.moveTo(X + PX / 2 + 1.2, Y); jb.lineTo(X + PX / 2 + 1.2, Y + PX);
      if (ch(c, r - 1) !== 'W') { p.moveTo(X + D, Y); p.lineTo(X + PX - D, Y); }
      if (ch(c, r + 1) !== 'W') { p.moveTo(X + D, Y + PX); p.lineTo(X + PX - D, Y + PX); }
    }
  }
  x.strokeStyle = T(0.9); x.lineWidth = 1.1; x.stroke(p);
  x.strokeStyle = T(0.75); x.lineWidth = 0.6; x.stroke(jb);
}

// 門:每格門洞兩扇門(遊戲裡也是雙扇),門扇 + 四分之一圓弧;開向房間(房間對走廊)、室外(出口)或樓梯間(防火門)
export function doorList(L, li) {
  const ch = (c, r) => L.charAt(li, c, r), out = [];
  const score = (c, r) => { const k = ch(c, r); if (OUTD(k)) return 3; const z = L.zoneAt(li, c, r); if (!z) return 0; return z.theme === 'corridor' ? 1 : 2; };
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    if (ch(c, r) !== '+') continue;
    let c0 = c, c1 = c, r0 = r, r1 = r;
    while (ch(c0 - 1, r) === '+') c0--; while (ch(c1 + 1, r) === '+') c1++;
    while (ch(c, r0 - 1) === '+') r0--; while (ch(c, r1 + 1) === '+') r1++;
    let axis = null;
    if (WALLISH(ch(c0 - 1, r)) && WALLISH(ch(c1 + 1, r))) axis = 'z'; // 門在東西向的牆上(南北通行)
    else if (WALLISH(ch(c, r0 - 1)) && WALLISH(ch(c, r1 + 1))) axis = 'x';
    if (!axis) continue;
    const [ca, ra, cb, rb] = axis === 'z' ? [c, r - 1, c, r + 1] : [c - 1, r, c + 1, r];
    const sa = score(ca, ra), sb = score(cb, rb);
    const toB = sb > sa ? true : sa > sb ? false : (hashStr(`${li}${c}${r}`) & 1) === 1;
    out.push({ c, r, axis, toB, out: OUTD(ch(ca, ra)) || OUTD(ch(cb, rb)), za: L.zoneAt(li, ca, ra), zb: L.zoneAt(li, cb, rb) });
  }
  return out;
}
function doors(x, L, li, list) {
  const leaf = new Path2D(), arc = new Path2D(), lw = PX / 2 - 1.2;
  for (const d of list) {
    const X = d.c * PX, Y = d.r * PX, s = d.toB ? 1 : -1;
    if (d.axis === 'z') {
      const yf = d.toB ? Y + PX - D : Y + D;
      for (const [hx, dir] of [[X + 0.8, 1], [X + PX - 0.8, -1]]) {
        leaf.moveTo(hx, yf); leaf.lineTo(hx, yf + s * lw);
        arc.moveTo(hx, yf + s * lw);
        arc.arc(hx, yf, lw, s > 0 ? Math.PI / 2 : -Math.PI / 2, dir > 0 ? 0 : Math.PI, (s > 0) === (dir > 0));
      }
    } else {
      const xf = d.toB ? X + PX - D : X + D;
      for (const [hy, dir] of [[Y + 0.8, 1], [Y + PX - 0.8, -1]]) {
        leaf.moveTo(xf, hy); leaf.lineTo(xf + s * lw, hy);
        arc.moveTo(xf + s * lw, hy);
        arc.arc(xf, hy, lw, s > 0 ? 0 : Math.PI, dir > 0 ? Math.PI / 2 : -Math.PI / 2, (s > 0) !== (dir > 0));
      }
    }
  }
  x.strokeStyle = T(0.95); x.lineWidth = 1.25; x.stroke(leaf);
  x.strokeStyle = T(0.7); x.lineWidth = 0.65; x.stroke(arc);
}

// 樓梯:踏階線、外框、上坡方向的箭頭、折斷線;上一層的開口畫成虛線(往下)
function stairGeom(L, s) {
  const C = L.CELL, x0 = s.c0 * PX, x1 = (s.c1 + 1) * PX, y0 = s.r0 * PX, y1 = (s.r1 + 1) * PX;
  const lo = (s.lowAt / C) * PX, hi = (s.highAt / C) * PX;
  return { x0, x1, y0, y1, lo, hi, z: s.axis === 'z' };
}
function stairs(x, L, li) {
  for (const s of L.stairs || []) {
    const up = s.lower === li, down = s.upper === li;
    if (!up && !down) continue;
    const g = stairGeom(L, s);
    const along = (t) => g.lo + (g.hi - g.lo) * t; // t:0 低端 → 1 高端
    const across0 = g.z ? g.x0 : g.y0, across1 = g.z ? g.x1 : g.y1, mid = (across0 + across1) / 2;
    const P = (a, b) => (g.z ? [b, a] : [a, b]); // (沿坡, 橫向) → (x, y)
    const L0 = Math.abs(g.hi - g.lo), n = Math.max(3, Math.round(L0 / 4.2)), brk = 0.62;
    x.save();
    x.strokeStyle = T(down ? 0.45 : 0.85); x.lineWidth = 0.7;
    if (down) x.setLineDash([2.5, 2]);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      x.globalAlpha = up && t > brk ? 0.45 : 1;
      if (up && t > brk) x.setLineDash([2.5, 2]); else if (up) x.setLineDash([]);
      x.beginPath(); x.moveTo(...P(along(t), across0)); x.lineTo(...P(along(t), across1)); x.stroke();
    }
    x.globalAlpha = 1; x.setLineDash(down ? [3, 2] : []);
    x.lineWidth = 1; x.strokeRect(g.x0 + 0.5, g.y0 + 0.5, g.x1 - g.x0 - 1, g.y1 - g.y0 - 1);
    x.setLineDash([]);
    if (up) { // 折斷線(Z 字)
      const b = along(brk), w = across1 - across0;
      x.strokeStyle = T(0.85); x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(...P(b + 5, across0)); x.lineTo(...P(b + 1.5, across0 + w * 0.45)); x.lineTo(...P(b - 1.5, across0 + w * 0.55)); x.lineTo(...P(b - 5, across1)); x.stroke();
    }
    // 走向箭頭:往上 = 低端 → 高端;往下 = 高端 → 低端
    const a = up ? 0.06 : 0.94, b = up ? 0.93 : 0.08;
    const [ax, ay] = P(along(a), mid), [bx, by] = P(along(b), mid);
    x.strokeStyle = T(0.95); x.lineWidth = 1.1;
    x.beginPath(); x.arc(ax, ay, 1.8, 0, 7); x.fillStyle = T(0.95); x.fill();
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
    const ang = Math.atan2(by - ay, bx - ax);
    x.beginPath(); x.moveTo(bx, by); x.lineTo(bx - Math.cos(ang - 0.4) * 6, by - Math.sin(ang - 0.4) * 6); x.lineTo(bx - Math.cos(ang + 0.4) * 6, by - Math.sin(ang + 0.4) * 6); x.closePath(); x.fill();
    x.restore();
  }
}
function stairLabels(x, L, li) {
  for (const s of L.stairs || []) {
    const up = s.lower === li, down = s.upper === li;
    if (!up && !down) continue;
    const g = stairGeom(L, s), to = L.levels[up ? s.upper : s.lower];
    const t = up ? 0.2 : 0.8, a = g.lo + (g.hi - g.lo) * t;
    const [cx, cy] = g.z ? [(g.x0 + g.x1) / 2, a] : [a, (g.y0 + g.y1) / 2];
    const txt = `${up ? '上' : '下'}${to ? to.id : ''}`;
    label(x, txt, cx + (g.z ? 0 : 0), cy + (g.z ? 0 : -7), 9.5, { font: FONT.sans, weight: 700, knock: 2.5 });
  }
}

// 電梯:井道內畫車廂 + 對角線,開口那一側畫門
function components(L, li, test) {
  const { W, H } = L, seen = new Uint8Array(W * H), out = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (seen[r * W + c] || !test(L.charAt(li, c, r))) continue;
    let c0 = c, c1 = c, r0 = r, r1 = r;
    const q = [[c, r]]; seen[r * W + c] = 1;
    while (q.length) {
      const [a, b] = q.pop();
      c0 = Math.min(c0, a); c1 = Math.max(c1, a); r0 = Math.min(r0, b); r1 = Math.max(r1, b);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + dx, nb = b + dy;
        if (na < 0 || nb < 0 || na >= W || nb >= H || seen[nb * W + na] || !test(L.charAt(li, na, nb))) continue;
        seen[nb * W + na] = 1; q.push([na, nb]);
      }
    }
    out.push([c0, r0, c1, r1]);
  }
  return out;
}
function lifts(x, L, li) {
  for (const [c0, r0, c1, r1] of components(L, li, (k) => k === 'E')) {
    const X0 = c0 * PX - D + 3, Y0 = r0 * PX - D + 3, X1 = (c1 + 1) * PX + D - 3, Y1 = (r1 + 1) * PX + D - 3;
    x.strokeStyle = T(0.85); x.lineWidth = 1;
    x.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    x.beginPath(); x.moveTo(X0, Y0); x.lineTo(X1, Y1); x.moveTo(X1, Y0); x.lineTo(X0, Y1); x.lineWidth = 0.7; x.stroke();
    // 門:找有可走鄰格的那一邊
    const open = (c, r) => WALK(L.charAt(li, c, r));
    x.lineWidth = 2.4; x.strokeStyle = T(0.9); x.beginPath();
    if (open(c0, r1 + 1)) { x.moveTo(X0 + 4, Y1 + 2); x.lineTo(X1 - 4, Y1 + 2); }
    else if (open(c0, r0 - 1)) { x.moveTo(X0 + 4, Y0 - 2); x.lineTo(X1 - 4, Y0 - 2); }
    else if (open(c1 + 1, r0)) { x.moveTo(X1 + 2, Y0 + 4); x.lineTo(X1 + 2, Y1 - 4); }
    else if (open(c0 - 1, r0)) { x.moveTo(X0 - 2, Y0 + 4); x.lineTo(X0 - 2, Y1 - 4); }
    x.stroke();
  }
}

// 欄杆(雙細線)與圍籬(線 + 叉):往同類鄰格連線
function rails(x, L, li) {
  const ch = (c, r) => L.charAt(li, c, r), R = rng(700 + li);
  const rp = new Path2D(), fp = new Path2D(), ticks = new Path2D();
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    const k = ch(c, r);
    if (k !== '=' && k !== '|') continue;
    const cx = (c + 0.5) * PX, cy = (r + 0.5) * PX;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => ch(c + dx, r + dy) === k);
    if (!nb.length) nb.push(WALK(ch(c - 1, r)) || WALK(ch(c + 1, r)) ? [0, 1] : [1, 0], WALK(ch(c - 1, r)) || WALK(ch(c + 1, r)) ? [0, -1] : [-1, 0]);
    for (const [dx, dy] of nb) {
      const ex = cx + dx * PX / 2, ey = cy + dy * PX / 2;
      if (k === '=') for (const o of [-1, 1]) { rp.moveTo(cx + dy * o, cy + dx * o); rp.lineTo(ex + dy * o, ey + dx * o); }
      else {
        fp.moveTo(cx + R.r(-0.3, 0.3), cy + R.r(-0.3, 0.3)); fp.lineTo(ex, ey);
        const mx = (cx + ex) / 2, my = (cy + ey) / 2;
        ticks.moveTo(mx - 2, my - 2); ticks.lineTo(mx + 2, my + 2); ticks.moveTo(mx + 2, my - 2); ticks.lineTo(mx - 2, my + 2);
      }
    }
  }
  x.strokeStyle = T(0.8); x.lineWidth = 0.7; x.stroke(rp);
  x.strokeStyle = T(0.5); x.lineWidth = 0.8; x.stroke(fp);
  x.lineWidth = 0.6; x.stroke(ticks);
}

// 挑空(o):虛線框 + 虛線大叉
function voids(x, L, li) {
  for (const [c0, r0, c1, r1] of components(L, li, (k) => k === 'o')) {
    const X0 = c0 * PX + 2, Y0 = r0 * PX + 2, X1 = (c1 + 1) * PX - 2, Y1 = (r1 + 1) * PX - 2;
    x.save(); x.setLineDash([6, 3]); x.strokeStyle = T(0.6); x.lineWidth = 0.9;
    x.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    x.beginPath(); x.moveTo(X0, Y0); x.lineTo(X1, Y1); x.moveTo(X1, Y0); x.lineTo(X0, Y1); x.stroke();
    x.restore();
  }
}

// 基地(戶外):淡鉛筆風的草叢、水紋、停車格、墓碑、遊具、道路標線、鋪面
function ground(x, L, li) {
  const R = rng(1000 + li), ch = (c, r) => L.charAt(li, c, r);
  const grass = new Path2D(), water = new Path2D(), pave = new Path2D();
  for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
    const k = ch(c, r), X = c * PX, Y = r * PX;
    if (k === '"') {
      for (let i = 0; i < 2; i++) {
        const gx = X + R.r(3, PX - 3), gy = Y + R.r(5, PX - 2);
        grass.moveTo(gx - 2.4, gy - 2.6); grass.lineTo(gx - 0.6, gy); grass.lineTo(gx, gy - 3.6); grass.lineTo(gx + 0.6, gy); grass.lineTo(gx + 2.4, gy - 2.6);
      }
    } else if (k === '~') {
      for (const oy of [6, 14]) { water.moveTo(X + 2, Y + oy); water.quadraticCurveTo(X + 6, Y + oy - 2.5, X + 10, Y + oy); water.quadraticCurveTo(X + 14, Y + oy + 2.5, X + 18, Y + oy); }
    } else if (k === ',' && L.zoneAt(li, c, r)?.theme === 'plaza') { pave.rect(X, Y, PX, PX); }
  }
  x.strokeStyle = INK.pencil(0.38); x.lineWidth = 0.7; x.stroke(grass);
  x.strokeStyle = T(0.3); x.lineWidth = 0.7; x.stroke(water);
  x.strokeStyle = T(0.09); x.lineWidth = 0.6; x.stroke(pave);
  const zs = (L.zones || []).filter((z) => z.levelIndex === li);
  const sketch = new Path2D();
  for (const z of zs) {
    const [c0, r0, c1, r1] = z.rects[0], X0 = c0 * PX, Y0 = r0 * PX, X1 = (c1 + 1) * PX, Y1 = (r1 + 1) * PX;
    if (z.theme === 'cemetery') { // 墓碑:一排排小方塊,頂上有十字
      for (let gy = Y0 + 10; gy < Y1 - 14; gy += 28) for (let gx = X0 + 8; gx < X1 - 8; gx += 30) {
        if (ch(Math.floor(gx / PX), Math.floor(gy / PX)) !== '"') continue;
        const jx = gx + R.r(-2, 2), jy = gy + R.r(-2, 2);
        sketch.rect(jx - 4, jy, 8, 12); sketch.moveTo(jx, jy - 5); sketch.lineTo(jx, jy - 0.5); sketch.moveTo(jx - 2.5, jy - 3); sketch.lineTo(jx + 2.5, jy - 3);
      }
    } else if (z.theme === 'playground') { // 溜滑梯、旋轉盤、鞦韆
      const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
      sketch.moveTo(cx + 22, cy - 8); sketch.arc(cx + 14, cy - 8, 8, 0, 7);
      sketch.rect(cx - 30, cy + 14, 12, 34); sketch.moveTo(cx - 24, cy + 14); sketch.lineTo(cx - 24, cy + 48);
      sketch.moveTo(cx - 34, cy - 40); sketch.lineTo(cx + 2, cy - 40);
      for (const sx2 of [cx - 26, cx - 10]) { sketch.moveTo(sx2, cy - 40); sketch.lineTo(sx2, cy - 30); sketch.rect(sx2 - 3, cy - 30, 6, 2); }
    } else if (z.theme === 'courtyard') { // 四棵樹(扇貝邊的圓)
      for (const [tx, ty] of [[X0 + 22, Y0 + 22], [X1 - 22, Y0 + 22], [X0 + 22, Y1 - 22], [X1 - 22, Y1 - 22]]) {
        const n = 11, rr = 13;
        sketch.moveTo(tx + rr, ty);
        for (let i = 1; i <= n; i++) { const a0 = ((i - 0.5) / n) * Math.PI * 2, a1 = (i / n) * Math.PI * 2; sketch.quadraticCurveTo(tx + Math.cos(a0) * rr * 1.25, ty + Math.sin(a0) * rr * 1.25, tx + Math.cos(a1) * rr, ty + Math.sin(a1) * rr); }
        sketch.moveTo(tx + 1.5, ty); sketch.arc(tx, ty, 1.5, 0, 7);
      }
    } else if (z.theme === 'ambulance_bay' || z.theme === 'alley') { // 道路中心虛線
      const vertical = Y1 - Y0 > X1 - X0;
      x.save(); x.setLineDash([10, 8]); x.strokeStyle = T(0.3); x.lineWidth = 0.9; x.beginPath();
      if (vertical) { x.moveTo((X0 + X1) / 2 + 10, Y0 + 6); x.lineTo((X0 + X1) / 2 + 10, Y1 - 6); } else { x.moveTo(X0 + 8, (Y0 + Y1) / 2); x.lineTo(X1 - 8, (Y0 + Y1) / 2); }
      x.stroke(); x.restore();
    }
  }
  // 停車格:依車位的排列推出格線(每 1.5 格一條),中間車道留空
  const cars = (L.obstacles || []).filter((o) => o.levelIndex === li && o.kind === 'car' && o.axis === 'NS');
  const rows = [...new Set(cars.map((o) => o.rect[1]))];
  for (const r of rows) {
    const cs = cars.filter((o) => o.rect[1] === r).map((o) => o.rect[0]);
    const off = (((Math.min(...cs) - 0.25) % 1.5) + 1.5) % 1.5, ya = (r - 0.3) * PX, yb = (r + 2.3) * PX;
    for (let cc = off; cc < L.W - 1; cc += 1.5) {
      if (cc > 22 && cc < 37) continue;
      if (L.zoneAt(li, Math.floor(cc), r)?.theme !== 'parking' && L.zoneAt(li, Math.ceil(cc), r)?.theme !== 'parking') continue;
      sketch.moveTo(cc * PX, ya); sketch.lineTo(cc * PX, yb);
    }
  }
  x.strokeStyle = INK.pencil(0.42); x.lineWidth = 0.8; x.stroke(sketch);
}

// 一直都在的固定物(1962 年就有):噴水池、聖像、水塔、冷氣主機、焚化爐
function fixedObstacles(x, L, li) {
  const p = new Path2D();
  for (const o of L.obstacles || []) {
    if (o.levelIndex !== li) continue;
    const [c0, r0, c1, r1] = o.rect, X0 = c0 * PX, Y0 = r0 * PX, X1 = (c1 + 1) * PX, Y1 = (r1 + 1) * PX, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, rr = Math.min(X1 - X0, Y1 - Y0) / 2 - 2;
    if (o.kind === 'fountain') { p.moveTo(cx + rr, cy); p.arc(cx, cy, rr, 0, 7); p.moveTo(cx + rr - 5, cy); p.arc(cx, cy, rr - 5, 0, 7); p.moveTo(cx + 4, cy); p.arc(cx, cy, 4, 0, 7); }
    else if (o.kind === 'statue') { p.moveTo(cx + rr - 2, cy); p.arc(cx, cy, rr - 2, 0, 7); p.moveTo(cx, cy - 7); p.lineTo(cx, cy + 7); p.moveTo(cx - 5, cy - 2); p.lineTo(cx + 5, cy - 2); }
    else if (o.kind === 'water_tower') { p.moveTo(cx + rr, cy); p.arc(cx, cy, rr, 0, 7); p.moveTo(cx + rr * 0.55, cy); p.arc(cx, cy, rr * 0.55, 0, 7); }
    else if (o.kind === 'ac_unit') { p.rect(X0 + 3, Y0 + 3, X1 - X0 - 6, Y1 - Y0 - 6); p.moveTo(cx + 5, cy); p.arc(cx, cy, 5, 0, 7); }
    else if (o.kind === 'incinerator') { p.rect(X0 + 3, Y0 + 3, X1 - X0 - 6, Y1 - Y0 - 6); p.moveTo(cx + 6, cy); p.arc(cx, cy, 6, 0, 7); p.moveTo(cx + 3, cy); p.arc(cx, cy, 3, 0, 7); }
  }
  x.strokeStyle = T(0.75); x.lineWidth = 0.9; x.stroke(p);
}

// 臨時的東西(車、路障、垃圾箱、發電機…):走過才知道,鉛筆速寫
function looseObstacles(x, L, li) {
  const p = new Path2D(), R = rng(31 + li);
  const rrect = (x0, y0, w, h, r) => { p.moveTo(x0 + r, y0); p.arcTo(x0 + w, y0, x0 + w, y0 + h, r); p.arcTo(x0 + w, y0 + h, x0, y0 + h, r); p.arcTo(x0, y0 + h, x0, y0, r); p.arcTo(x0, y0, x0 + w, y0, r); p.closePath(); };
  for (const o of L.obstacles || []) {
    if (o.levelIndex !== li) continue;
    const [c0, r0, c1, r1] = o.rect, X0 = c0 * PX, Y0 = r0 * PX, X1 = (c1 + 1) * PX, Y1 = (r1 + 1) * PX, w = X1 - X0, h = Y1 - Y0;
    const j = () => R.r(-0.8, 0.8);
    if (/car|hearse|ambulance/.test(o.kind)) {
      rrect(X0 + 2.5 + j(), Y0 + 2 + j(), w - 5, h - 4, 4);
      if (h > w) { p.moveTo(X0 + 4, Y0 + h * 0.28); p.lineTo(X1 - 4, Y0 + h * 0.28); p.moveTo(X0 + 4, Y0 + h * 0.74); p.lineTo(X1 - 4, Y0 + h * 0.74); }
      else { p.moveTo(X0 + w * 0.28, Y0 + 4); p.lineTo(X0 + w * 0.28, Y1 - 4); p.moveTo(X0 + w * 0.74, Y0 + 4); p.lineTo(X0 + w * 0.74, Y1 - 4); }
      if (o.kind === 'ambulance_crash') { p.moveTo(X1 - 6, Y0); p.lineTo(X1 + 2, Y0 - 6); }
    } else if (o.kind === 'dumpster') { p.rect(X0 + 3, Y0 + 3, w - 6, h - 6); p.moveTo(X0 + 3, Y0 + 3); p.lineTo(X1 - 3, Y1 - 3); }
    else if (o.kind === 'generator') { p.rect(X0 + 3, Y0 + 4, w - 6, h - 8); p.moveTo(X0 + w * 0.3 + 4, Y0 + h / 2); p.arc(X0 + w * 0.3, Y0 + h / 2, 4, 0, 7); }
    else if (o.kind === 'barricade') { p.moveTo(X0 + 2, Y0 + h / 2 - 3); for (let k = 0; k < 4; k++) p.lineTo(X0 + 2 + (k + 0.5) * (w - 4) / 4, Y0 + h / 2 + (k % 2 ? -3 : 3)); }
  }
  x.save(); x.strokeStyle = INK.pencil(0.62); x.lineWidth = 0.9; x.stroke(p); x.restore();
}

// ---------------------------------------------------------------------
// 印刷的避難標誌(圖面與圖例共用)。kind:here 您現在位置 / ext 滅火器 / hyd 消防栓 / light 緊急照明燈 / exit 出口標示 / evac 避難方向
export function sym(x, kind, cx, cy, s = 12, ang = 0) {
  x.save();
  x.translate(cx, cy); x.rotate(ang);
  x.strokeStyle = T(0.92); x.fillStyle = T(0.92); x.lineWidth = 1;
  if (kind === 'here') {
    x.beginPath(); x.arc(0, 0, s * 0.62, 0, 7); x.stroke();
    x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.22 : s * 0.52; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.closePath(); x.fill();
  } else if (kind === 'ext') {
    x.beginPath(); x.arc(0, 0, s * 0.42, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(0, -s * 0.28); x.lineTo(s * 0.26, s * 0.2); x.lineTo(-s * 0.26, s * 0.2); x.closePath(); x.fill();
  } else if (kind === 'hyd') {
    x.strokeRect(-s * 0.48, -s * 0.32, s * 0.96, s * 0.64);
    x.beginPath(); x.moveTo(-s * 0.48, s * 0.32); x.lineTo(s * 0.48, -s * 0.32); x.lineTo(s * 0.48, s * 0.32); x.closePath(); x.fill();
  } else if (kind === 'light') {
    x.beginPath(); x.arc(0, 0, s * 0.36, 0, 7); x.stroke();
    const k = s * 0.25;
    x.beginPath(); x.moveTo(-k, -k); x.lineTo(k, k); x.moveTo(k, -k); x.lineTo(-k, k); x.stroke();
  } else if (kind === 'exit') { // 實心方塊,挖空一個跑步的人
    x.fillRect(-s * 0.62, -s * 0.38, s * 1.24, s * 0.76);
    x.globalCompositeOperation = 'destination-out';
    x.lineWidth = Math.max(1, s * 0.09); x.lineCap = 'round'; x.strokeStyle = '#000'; x.fillStyle = '#000';
    const u = s * 0.11;
    x.beginPath(); x.arc(u * 1.6, -u * 2.2, u * 0.75, 0, 7); x.fill();
    x.beginPath(); x.moveTo(u * 1.1, -u * 1.2); x.lineTo(-u * 0.2, u * 0.9); x.lineTo(u * 1.4, u * 2.4);
    x.moveTo(-u * 0.2, u * 0.9); x.lineTo(-u * 1.8, u * 1.9); x.moveTo(u * 0.9, -u * 0.6); x.lineTo(u * 2.3, u * 0.2); x.moveTo(u * 0.9, -u * 0.6); x.lineTo(-u * 0.8, -u * 0.1); x.stroke();
    x.beginPath(); x.moveTo(-u * 3.6, -u * 0.4); x.lineTo(-u * 2.3, -u * 0.4); x.stroke();
  } else if (kind === 'evac') { // 空心箭頭(朝 +x)
    const L2 = s * 0.75, w = s * 0.18, hw = s * 0.36;
    x.beginPath(); x.moveTo(-L2, -w); x.lineTo(L2 * 0.25, -w); x.lineTo(L2 * 0.25, -hw); x.lineTo(L2, 0); x.lineTo(L2 * 0.25, hw); x.lineTo(L2 * 0.25, w); x.lineTo(-L2, w); x.closePath();
    x.lineWidth = 0.9; x.stroke();
  }
  x.restore();
}

// 避難設施:方向箭頭(距離場往出口)、出口標示、滅火器、消防栓、緊急照明、您現在位置
function evac(x, L, li, doorsL) {
  const { W, H } = L, ch = (c, r) => L.charAt(li, c, r);
  const ground1 = Math.abs(L.levels[li].y) < 0.5;
  const indoor = (c, r) => WALK(ch(c, r)) && !OUTD(ch(c, r));
  const dist = new Int16Array(W * H).fill(-1), q = [];
  const push = (c, r) => { if (c < 0 || r < 0 || c >= W || r >= H || dist[r * W + c] >= 0) return; dist[r * W + c] = 0; q.push(r * W + c); };
  if (ground1) { for (const d of doorsL) if (d.out) push(d.c, d.r); }
  else for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const k = ch(c, r), z = L.zoneAt(li, c, r);
    if (ARROW(k) || z?.theme === 'fire_escape' || (indoor(c, r) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ch(c + dx, r + dy) === '%'))) push(c, r);
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % W, r = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H || dist[nr * W + nc] >= 0 || !indoor(nc, nr)) continue;
      dist[nr * W + nc] = dist[i] + 1; q.push(nr * W + nc);
    }
  }
  // 方向箭頭:走廊上每隔 6 格以上一個
  const picks = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const d = dist[r * W + c];
    if (d < 3 || L.zoneAt(li, c, r)?.theme !== 'corridor') continue;
    if (picks.some(([a, b]) => Math.max(Math.abs(a - c), Math.abs(b - r)) < 7)) continue;
    let best = null, bd = d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nd = dist[(r + dy) * W + c + dx]; if (nd >= 0 && nd < bd) { bd = nd; best = [dx, dy]; } }
    if (best) picks.push([c, r, Math.atan2(best[1], best[0])]);
  }
  picks.forEach(([c, r, a], i) => {
    sym(x, 'evac', (c + 0.5) * PX, (r + 0.5) * PX, 15, a);
    if (i % 3 === 1) sym(x, 'light', (c + 0.5) * PX + Math.sin(a) * 7, (r + 0.5) * PX - Math.cos(a) * 7, 8);
  });
  // 出口:一樓對外的門、每層樓梯間的門
  const stairDoor = (d) => d.za?.theme === 'stairwell' || d.zb?.theme === 'stairwell';
  let k = 0;
  for (const d of doorsL) {
    if (!(ground1 && d.out) && !stairDoor(d)) continue;
    const inner = d.out ? (OUTD(ch(d.axis === 'z' ? d.c : d.c - 1, d.axis === 'z' ? d.r - 1 : d.r)) ? 1 : -1) : d.za?.theme === 'stairwell' ? 1 : -1;
    const [nx, ny] = d.axis === 'z' ? [0, inner] : [inner, 0];
    const cx = (d.c + 0.5) * PX + nx * PX * 0.95, cy = (d.r + 0.5) * PX + ny * PX * 0.95;
    sym(x, 'exit', cx, cy, 11);
    if (stairDoor(d)) { // 樓梯口:滅火器與消防栓(左右各一)
      const [tx, ty] = d.axis === 'z' ? [1, 0] : [0, 1];
      sym(x, k % 2 ? 'hyd' : 'ext', cx + tx * 15, cy + ty * 15, 10);
      if (k % 2 === 0) sym(x, 'hyd', cx - tx * 15, cy - ty * 15, 10);
      k++;
    }
  }
  const h = hereOf(L, li);
  if (h) sym(x, 'here', h[0] * PX, h[1] * PX, 15);
}

// 修訂雲線(△1 1987 急診車道增建、△2 2003 SARS 隔離病房區)— 只有聖心醫院的圖有
function revisions(x, L, li) {
  if (!isHospital(L)) return;
  const id = L.levels[li].id;
  const cloud = (X0, Y0, X1, Y1, n, tx, ty) => {
    x.save(); x.strokeStyle = T(0.7); x.lineWidth = 0.9; x.beginPath();
    const side = (ax, ay, bx, by) => { const len = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.round(len / 18)); for (let i = 0; i < k; i++) { const sx0 = ax + ((bx - ax) * i) / k, sy0 = ay + ((by - ay) * i) / k, ex = ax + ((bx - ax) * (i + 1)) / k, ey = ay + ((by - ay) * (i + 1)) / k, mx = (sx0 + ex) / 2, my = (sy0 + ey) / 2, nx = (ey - sy0) / (len / k), ny = -(ex - sx0) / (len / k); x.quadraticCurveTo(mx - nx * 7, my - ny * 7, ex, ey); } };
    x.moveTo(X0, Y0); side(X0, Y0, X1, Y0); side(X1, Y0, X1, Y1); side(X1, Y1, X0, Y1); side(X0, Y1, X0, Y0);
    x.stroke();
    x.beginPath(); x.moveTo(tx, ty - 9); x.lineTo(tx + 9, ty + 7); x.lineTo(tx - 9, ty + 7); x.closePath(); x.fillStyle = 'rgba(0,0,0,0)'; x.stroke();
    x.font = `700 9px ${FONT.cad}`; x.fillStyle = T(0.85); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), tx, ty + 2);
    x.restore();
  };
  if (id === '2F') cloud(31.4 * PX, 6.3 * PX, 51.6 * PX, 11.5 * PX, 2, 52.6 * PX, 5.6 * PX);
  if (id === '1F') cloud(51.8 * PX, 9.6 * PX, 58.8 * PX, 33.6 * PX, 1, 57.8 * PX, 8.6 * PX);
}

// ---------------------------------------------------------------------
// 文字:先用「掏墨」描邊讓底下的網底/家具讓開,再寫字(像真的圖面文字遮住剖面線)
function label(x, s, cx, cy, size, o = {}) {
  x.save();
  x.font = `${o.weight || 700} ${size}px ${o.font || FONT.sans}`;
  x.textAlign = o.align || 'center'; x.textBaseline = 'middle';
  if (o.knock) { x.globalCompositeOperation = 'destination-out'; x.lineWidth = o.knock; x.lineJoin = 'round'; x.strokeStyle = '#000'; x.strokeText(s, cx, cy); x.globalCompositeOperation = 'source-over'; }
  x.fillStyle = T(o.alpha ?? 0.95); x.fillText(s, cx, cy);
  x.restore();
}
function vlabel(x, s, cx, cy, size, o = {}) { // 直書
  const chars = [...s], step = size * 1.08, y0 = cy - ((chars.length - 1) * step) / 2;
  chars.forEach((c, i) => label(x, c, cx, y0 + i * step, size, o));
}
function labels(x, L, li) {
  const hosp = isHospital(L);
  for (const z of L.zones || []) {
    if (z.levelIndex !== li) continue;
    const big = z.rects.reduce((a, b) => ((b[2] - b[0] + 1) * (b[3] - b[1] + 1) > (a[2] - a[0] + 1) * (a[3] - a[1] + 1) ? b : a));
    let [c0, r0, c1, r1] = big;
    let name = PRINT_NAME[z.id] || z.name;
    if (hosp && z.id === 'f1_chapel') c0 = 12; // 西端隔出廣播室
    const rw = (c1 - c0 + 1) * PX, rh = (r1 - r0 + 1) * PX;
    let cx = ((c0 + c1 + 1) / 2) * PX, cy = ((r0 + r1 + 1) / 2) * PX;
    const outdoor = /outdoor|roof/.test(z.mood || '') || ['plaza', 'parking', 'alley', 'yard', 'cemetery', 'playground', 'ambulance_bay', 'courtyard', 'rooftop', 'fire_escape'].includes(z.theme);
    const m = /^(病房|隔離房) (\S+)$/.exec(name);
    if (m) { // 病房:大號碼 + 小字
      label(x, m[2], cx, cy + 4, m[2].length > 2 ? 15 : 13, { font: FONT.cad, knock: 3 });
      label(x, m[1], cx, cy - 9, 8.5, { knock: 2.5, alpha: 0.8 });
      continue;
    }
    if (z.theme === 'stairwell') { cy = r0 * PX + 7; label(x, name, cx, cy, 8.5, { knock: 2.5, alpha: 0.85 }); continue; }
    if (outdoor) name = [...name].join(' ');
    let size = outdoor ? 12 : z.theme === 'corridor' ? 10 : 13;
    x.font = `700 ${size}px ${FONT.sans}`;
    const tw = x.measureText(name).width;
    const vertical = rh > rw * 1.8 && tw > rw - 6;
    if (vertical) { size = Math.min(size, (rh - 8) / ([...name].length * 1.08), rw - 4); if (size >= 7) vlabel(x, name, cx, cy, size, { knock: 3, alpha: outdoor ? 0.6 : 0.9 }); continue; }
    if (tw > rw - 6) size = Math.floor((size * (rw - 6)) / tw);
    if (size < 7 || rh < 12) continue;
    label(x, name, cx, cy, size, { knock: 3, alpha: outdoor ? 0.62 : 0.9, weight: outdoor ? 400 : 700 });
  }
  if (hosp && L.levels[li].id === '1F') { // 禮拜堂西端的廣播室(1962 年為了把彌撒播到各病房)
    x.save(); x.setLineDash([4, 3]); x.strokeStyle = T(0.75); x.lineWidth = 1; x.beginPath(); x.moveTo(12 * PX, 29 * PX - D); x.lineTo(12 * PX, 31 * PX); x.stroke(); x.restore();
    label(x, '廣播室', 10.5 * PX, 30.6 * PX, 10, { knock: 2.5 });
  }
  for (const [c0, r0, c1, r1] of components(L, li, (k) => k === 'o')) {
    const top = L.levels[li].index === L.levels.length - 1 && L.levels.length > 1;
    label(x, top ? '天窗' : '挑 空', ((c0 + c1 + 1) / 2) * PX, ((r0 + r1 + 1) / 2) * PX, 11, { knock: 3, alpha: 0.75 });
  }
  for (const [c0, r0, c1] of components(L, li, (k) => k === 'E')) label(x, 'EV', ((c0 + c1 + 1) / 2) * PX, r0 * PX - D - 6, 8, { font: FONT.cad, knock: 2 });
  const h = hereOf(L, li);
  if (h) label(x, '您現在位置', h[0] * PX, h[1] * PX + 15, 8, { knock: 2.5 });
}

// 家具(便宜就畫):依區域主題擺一些 1962 年平面圖上會有的東西
function furniture(x, L, li) {
  const p = new Path2D();
  const box = (a, b, w, h) => p.rect(a, b, w, h);
  const circ = (a, b, r) => { p.moveTo(a + r, b); p.arc(a, b, r, 0, 7); };
  const line = (a, b, c, d) => { p.moveTo(a, b); p.lineTo(c, d); };
  const bed = (a, b, w = 9, h = 19, head = 'n') => { box(a, b, w, h); if (head === 'n') line(a + 1.5, b + 4, a + w - 1.5, b + 4); else line(a + 4, b + 1.5, a + 4, b + h - 1.5); };
  for (const z of L.zones || []) {
    if (z.levelIndex !== li) continue;
    const [c0, r0, c1, r1] = z.rects[0];
    const X0 = c0 * PX, Y0 = r0 * PX, X1 = (c1 + 1) * PX, Y1 = (r1 + 1) * PX, w = X1 - X0, h = Y1 - Y0, cx = (X0 + X1) / 2;
    switch (z.theme) {
      case 'ward': bed(X0 + 4, Y0 - 2); bed(X1 - 13, Y0 - 2); box(X0 + 15, Y0 - 2, 5, 5); box(X1 - 20, Y0 - 2, 5, 5); break;
      case 'peds_ward': for (let i = 0; i < 4; i++) bed(X0 + 4 + i * (w - 12) / 3.4, Y0 - 1, 7, 14); break;
      case 'icu': for (let i = 0; i < 6; i++) { bed(X0 + 8 + i * (w - 20) / 5.2, Y0 - 2, 9, 17); p.moveTo(X0 + 3 + i * (w - 20) / 5.2, Y0 + 22); p.arc(X0 + 12.5 + i * (w - 20) / 5.2, Y0 + 22, 9.5, Math.PI, 0, true); } break;
      case 'psych_cell': bed(X0 + 2, Y1 - 22, 9, 19); break;
      case 'chapel': {
        const a0 = X0 + 3.4 * PX, ym = (Y0 + Y1) / 2;
        for (let px2 = a0; px2 < X1 - 40; px2 += 13) { box(px2, Y0 + 6, 4, ym - Y0 - 14); box(px2, ym + 8, 4, Y1 - ym - 14); }
        box(X1 - 22, ym - 16, 9, 32); line(X1 - 8, ym - 6, X1 - 8, ym + 6); line(X1 - 11, ym - 2, X1 - 5, ym - 2);
        break;
      }
      case 'cafeteria': for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const tx = X0 + 22 + i * (w - 44) / 2, ty = Y0 + 18 + j * (h - 36); box(tx - 9, ty - 5, 18, 10); for (const s2 of [-6, 0, 6]) { circ(tx + s2, ty - 9, 1.8); circ(tx + s2, ty + 9, 1.8); } } break;
      case 'pharmacy': box(X0 + 6, Y1 - 12, w - 12, 5); for (let i = 0; i < 4; i++) box(X0 + 14 + i * (w - 30) / 3.2, Y0 + 2, 6, h - 30); break;
      case 'lobby': for (let i = 0; i < 3; i++) box(cx - 26 + i * 18, Y1 - 22, 12, 5); p.moveTo(cx + 22, Y0 + 26); p.arc(cx, Y0 + 26, 22, 0, Math.PI); break;
      case 'waiting': for (let r = Y0 + 12; r < Y1 - 30; r += 16) for (let k = 0; k < 2; k++) box(X0 + 6 + k * 24, r, 18, 5); break;
      case 'xray': case 'ct': box(cx - 6, Y0 + 14, 12, 34); if (z.theme === 'ct') { circ(cx, Y0 + 20, 14); circ(cx, Y0 + 20, 8); } else circ(cx, Y0 + 30, 5); box(X1 - 16, Y1 - 18, 12, 10); break;
      case 'morgue': for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) box(X0 + 6 + i * 14, Y0 + 2 + j * 11, 12, 9); box(X1 - 50, Y1 - 26, 30, 10); break;
      case 'autopsy': box(X0 + 30, Y0 + 26, 32, 12); box(X0 + 100, Y0 + 26, 32, 12); circ(X0 + 46, Y0 + 32, 1.5); circ(X0 + 116, Y0 + 32, 1.5); break;
      case 'shop': for (let i = 0; i < 2; i++) box(X0 + 10 + i * 34, Y0 + 8, 6, h - 34); box(X0 + 12, Y1 - 16, w - 24, 6); break;
      case 'security': box(X0 + 6, Y0 + 4, w - 12, 8); for (let i = 0; i < 4; i++) box(X0 + 10 + i * 18, Y0 + 5, 12, 5); circ(cx, Y0 + 24, 4); break;
      case 'director': case 'office': box(cx - 14, Y0 + 20, 28, 14); circ(cx, Y0 + 42, 4); box(X0 + 4, Y0 + 2, w - 8, 5); break;
      case 'monitor': box(X0 + 6, Y0 + 2, w - 12, 9); for (let i = 0; i < 6; i++) box(X0 + 10 + i * (w - 24) / 6, Y0 + 3, 12, 4); circ(cx - 20, Y0 + 22, 4); circ(cx + 20, Y0 + 22, 4); break;
      case 'nursery': for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) box(X0 + 10 + i * 22, Y0 + 10 + j * 30, 10, 14); break;
      case 'delivery': case 'surgery': box(cx - 6, Y0 + 26, 12, 30); circ(cx, Y0 + 41, 16); break;
      case 'playroom': circ(cx, (Y0 + Y1) / 2, 22); box(X0 + 6, Y0 + 4, 20, 10); break;
      case 'boiler': circ(X0 + 34, Y0 + 40, 18); circ(X0 + 84, Y0 + 40, 18); box(X0 + 120, Y0 + 20, 36, 22); break;
      case 'laundry': for (let i = 0; i < 6; i++) { box(X0 + 34 + i * 18, Y1 - 22, 14, 14); circ(X0 + 41 + i * 18, Y1 - 15, 4.5); } break;
      case 'archive': case 'supply': for (let r = Y0 + 10; r < Y1 - 10; r += 16) box(X0 + 14, r, w - 28, 5); break;
      case 'pump': circ(X0 + 40, Y0 + 40, 12); circ(X0 + 80, Y0 + 40, 12); line(X0 + 52, Y0 + 40, X0 + 68, Y0 + 40); break;
      case 'dorm': for (let i = 0; i < 2; i++) bed(X0 + 4 + i * 22, Y0 + 10); break;
      case 'rehab': line(X0 + 30, Y0 + 20, X0 + 110, Y0 + 20); line(X0 + 30, Y0 + 30, X0 + 110, Y0 + 30); box(X0 + 130, Y0 + 14, 30, 22); break;
      case 'machine': circ(X0 + 30, Y0 + 20, 12); circ(X0 + 62, Y0 + 20, 12); box(X0 + 100, Y0 + 8, 50, 22); break;
      case 'incinerator': box(X0 + 24, Y1 - 50, 50, 34); circ(X0 + 49, Y1 - 33, 9); break;
      case 'dock': for (let r = Y0 + 4; r < Y1; r += 6) line(X1 - 10, r, X1 - 4, r + 4); break;
      default:
    }
  }
  x.strokeStyle = T(0.6); x.lineWidth = 0.75; x.stroke(p);
}

// 碳粉顆粒:在墨上掏掉一點點(影印的粗糙感)
let NOISE = null;
function noiseTile() {
  if (NOISE) return NOISE;
  NOISE = canvas(128, 128);
  const g = NOISE.getContext('2d'), d = g.createImageData(128, 128), R = rng(4242);
  for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = R() < 0.18 ? 90 + R() * 165 : 0;
  g.putImageData(d, 0, 0);
  return NOISE;
}
function tonerGrain(x, w, h, a) {
  x.save(); x.globalCompositeOperation = 'destination-out'; x.globalAlpha = a; x.fillStyle = x.createPattern(noiseTile(), 'repeat'); x.fillRect(0, 0, w, h); x.restore();
}

// 一層的圖(crisp + faint)
export function buildFloor(L, li) {
  const pw = L.W * PX, ph = L.H * PX;
  const c = canvas(pw, ph), x = c.getContext('2d');
  const Tp = cellTypes(L, li), dl = doorList(L, li);
  ground(x, L, li);
  walls(x, L, li, Tp);
  windows(x, L, li);
  doors(x, L, li, dl);
  stairs(x, L, li);
  lifts(x, L, li);
  rails(x, L, li);
  voids(x, L, li);
  fixedObstacles(x, L, li);
  evac(x, L, li, dl);
  revisions(x, L, li);
  // 沒走過的地方:同一份結構線,印得很差(半解析度、模糊、整片掉粉)
  const f = canvas(pw / 2, ph / 2), fx = f.getContext('2d');
  fx.filter = 'blur(0.5px)'; fx.globalAlpha = 0.62;
  fx.drawImage(c, 0, 0, pw / 2, ph / 2);
  fx.filter = 'none'; fx.globalAlpha = 1;
  const R = rng(77 + li * 13);
  fx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 45; i++) {
    const gx = R() * pw / 2, gy = R() * ph / 2, rr = R.r(10, 60);
    const grd = fx.createRadialGradient(gx, gy, 0, gx, gy, rr);
    grd.addColorStop(0, `rgba(0,0,0,${R.r(0.25, 0.7)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = grd; fx.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
  }
  fx.globalAlpha = 0.45; fx.fillStyle = fx.createPattern(noiseTile(), 'repeat'); fx.fillRect(0, 0, pw / 2, ph / 2);
  fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
  // 走過才看得清楚的細節
  furniture(x, L, li);
  looseObstacles(x, L, li);
  labels(x, L, li);
  stairLabels(x, L, li);
  tonerGrain(x, pw, ph, 0.28);
  return { crisp: c, faint: f, doors: dl };
}
