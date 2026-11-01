import * as THREE from 'three';
import { doorAtlas, REG, SPAN, LW } from './doortex.js';

// 門扇、門框、門檻、五金、門上的玻璃、門縫透出的光:全部用 doortex.js 的 PBR 圖集(顏色 + 法線 + ORM,一個材質)。
//  每層一個 BatchedMesh 畫全部門扇 + 門框 + 倒在地上的門扇(不同樣式是不同幾何,同一批 → 1 個 draw call、逐扇視錐剔除、會投影);
//  玻璃每層一個 BatchedMesh(透明);門縫光每層一個 InstancedMesh(加法混合,關著的門且房裡的燈亮著才亮:src/interact/doors.js 控制)。
// 每扇門有一個「代理」Object3D(不在場景裡):事件(甩門)與互動(開關門、碰撞盒、殭屍推門)只改 proxy.rotation.y,
// update() 每幀比對角度,有變才重寫那扇門的矩陣。窗洞用貼圖 alpha 挖空(alphaTest),洞壁、壓條、玻璃是模型。
const _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

// ---------- 幾何收集(非索引;position / normal / uv) ----------
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; }
  // 四邊形 a→b→c→d(從法線那一側看是逆時針)
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    for (const [P, U] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { this.p.push(P[0], P[1], P[2]); this.n.push(n[0], n[1], n[2]); this.u.push(U[0], U[1]); }
  }
  // 軸對齊方塊;uvf(面, 角點) → [u, v]
  box(x0, y0, z0, x1, y1, z1, uvf) {
    const F = [
      ['pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], ['nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      ['px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], ['nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      ['py', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], ['ny', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    ];
    for (const [f, a, b, c, d, n] of F) this.quad(a, b, c, d, n, uvf(f, a), uvf(f, b), uvf(f, c), uvf(f, d));
  }
  // three 幾何(套矩陣),UV 壓進 rect
  geo(g, m, rect) {
    const s = g.index ? g.toNonIndexed() : g;
    const P = s.attributes.position, N = s.attributes.normal, U = s.attributes.uv, nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      this.u.push(rect[0] + (U ? U.getX(i) : 0.5) * (rect[2] - rect[0]), rect[1] + (U ? U.getY(i) : 0.5) * (rect[3] - rect[1]));
    }
    if (s !== g) s.dispose();
    g.dispose();
  }
  // 圓洞的洞壁(法線朝洞的中心;z0..z1)
  ringWall(cx, cy, r, z0, z1, seg, uvf) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2, m = (a + b) / 2;
      const A = [cx + r * Math.cos(a), cy + r * Math.sin(a)], Bp = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
      this.quad([A[0], A[1], z0], [A[0], A[1], z1], [Bp[0], Bp[1], z1], [Bp[0], Bp[1], z0], [-Math.cos(m), -Math.sin(m), 0], uvf(0, A[1]), uvf(1, A[1]), uvf(1, Bp[1]), uvf(0, Bp[1]));
    }
  }
  get empty() { return !this.p.length; }
  // 前後鏡像(z → -z;三角形反向):雙開防火門的右扇也要把推桿朝同一側
  mirrorZ() {
    const P = this.p, N = this.n, U = this.u;
    for (let i = 2; i < P.length; i += 3) { P[i] = -P[i]; N[i] = -N[i]; }
    for (let t = 0; t < P.length / 9; t++) for (let k = 0; k < 3; k++) { const a = t * 9 + 3 + k, b = t * 9 + 6 + k; [P[a], P[b]] = [P[b], P[a]]; [N[a], N[b]] = [N[b], N[a]]; }
    for (let t = 0; t < U.length / 6; t++) for (let k = 0; k < 2; k++) { const a = t * 6 + 2 + k, b = t * 6 + 4 + k; [U[a], U[b]] = [U[b], U[a]]; }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
const lerp = (r, s, t) => [r[0] + s * (r[2] - r[0]), r[1] + t * (r[3] - r[1])];
const sw = (k) => REG.sw[k];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// 實心小方塊,整塊用一個五金色票(正面/背面/頂底的 s 沿 x,側面沿 z;t 沿高度)
const part = (G, k, x0, y0, z0, x1, y1, z1) => G.box(x0, y0, z0, x1, y1, z1, (f, P) => lerp(sw(k), f === 'pz' || f === 'nz' || f === 'py' || f === 'ny' ? (P[0] - x0) / Math.max(1e-3, x1 - x0) : (P[2] - z0) / Math.max(1e-3, z1 - z0), f === 'py' || f === 'ny' ? (P[2] - z0) / Math.max(1e-3, z1 - z0) : (P[1] - y0) / Math.max(1e-3, y1 - y0)));
const MT = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// 各樣式的窗(公尺,從鉸鍊算起;與 doortex.js 的挖空一致)
const WIN = (style, lw) => ({ ward: [lw * 0.3, 1.3, lw * 0.7, 1.9], fire: [lw * 0.42, 1.2, lw * 0.58, 1.75], cell: [lw * 0.38, 1.42, lw * 0.62, 1.62], swing: [lw * 0.5 - 0.17, 1.28, lw * 0.5 + 0.17, 1.62, true] }[style] || null);
// [perf6] 關上時看得穿的門(有窗、玻璃門):室內可見性(vis.js)不把它當牆
export const doorSeeThrough = (style) => style === 'glass' || !!WIN(style, 1);

// 一扇門的幾何(門扇局部:x 0..lw 從鉸鍊、y 0..lh、z 厚度置中)→ { opaque, glass }
function leafGeo(style, lw, lh, t, mirror = false) {
  const G = new GB(), GL = new GB();
  const z0 = -t / 2, z1 = t / 2;
  const glassQuad = (a, b, c, d, k) => GL.quad([a, b, 0], [c, b, 0], [c, d, 0], [a, d, 0], [0, 0, 1], ...[[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, q]) => lerp(sw(k), s, q)));
  if (style === 'glass') { // 鋁框玻璃門:框料 + 兩片玻璃 + 兩面的橫推把 + 鉸鍊
    for (const [a, b, c, d] of [[0, 0, lw, 0.12], [0, lh - 0.08, lw, lh], [0, 0, 0.06, lh], [lw - 0.06, 0, lw, lh], [0.06, 1.0, lw - 0.06, 1.06]]) part(G, 'alu', a, b, z0, c, d, z1);
    part(G, 'chrome', 0.12, 0.99, z1, lw - 0.12, 1.02, z1 + 0.04); part(G, 'chrome', 0.12, 0.99, z0 - 0.04, lw - 0.12, 1.02, z0);
    glassQuad(0.06, 0.12, lw - 0.06, 1.0, 'glass'); glassQuad(0.06, 1.06, lw - 0.06, lh - 0.08, 'glass');
    for (const hy of [0.25, lh - 0.3]) part(G, 'hinge', -0.014, hy, -0.012, 0.0, hy + 0.09, 0.012);
    return { opaque: G.build(), glass: GL.build() };
  }
  const face = REG.face[style] || REG.face.ward, edge = REG.edge[style] || REG.edge.ward;
  const fuv = (x, y) => lerp(face, x / LW, y / SPAN);
  const euv = (s, y) => lerp(edge, s, clamp01(y / SPAN));
  // 門扇本體:前後兩面(背面是前面的鏡像:磨損在同一個實體邊)、四個邊
  G.quad([0, 0, z1], [lw, 0, z1], [lw, lh, z1], [0, lh, z1], [0, 0, 1], fuv(0, 0), fuv(lw, 0), fuv(lw, lh), fuv(0, lh));
  G.quad([lw, 0, z0], [0, 0, z0], [0, lh, z0], [lw, lh, z0], [0, 0, -1], fuv(lw, 0), fuv(0, 0), fuv(0, lh), fuv(lw, lh));
  G.quad([lw, 0, z1], [lw, 0, z0], [lw, lh, z0], [lw, lh, z1], [1, 0, 0], euv(0, 0), euv(1, 0), euv(1, lh), euv(0, lh));
  G.quad([0, 0, z0], [0, 0, z1], [0, lh, z1], [0, lh, z0], [-1, 0, 0], euv(0, 0), euv(1, 0), euv(1, lh), euv(0, lh));
  G.quad([0, lh, z1], [lw, lh, z1], [lw, lh, z0], [0, lh, z0], [0, 1, 0], euv(0, 2.6), euv(1, 2.6), euv(1, 2.64), euv(0, 2.64));
  G.quad([0, 0, z0], [lw, 0, z0], [lw, 0, z1], [0, 0, z1], [0, -1, 0], euv(0, 0.02), euv(1, 0.02), euv(1, 0.05), euv(0, 0.05));
  // 窗:洞壁 + 兩面壓條 + 玻璃(防火門是鐵絲網玻璃)
  const win = WIN(style, lw);
  if (win) {
    const [a, b, c, d, round] = win;
    const bead = style === 'fire' || style === 'cell' ? 'steel' : style === 'swing' ? 'chrome' : 'rubber';
    if (round) {
      const r = (c - a) / 2, cx = (a + c) / 2, cy = (b + d) / 2;
      G.ringWall(cx, cy, r, z0, z1, 24, (s, y) => euv(s, y));
      for (const zz of [z1 + 0.004, z0 - 0.004]) G.geo(new THREE.TorusGeometry(r + 0.012, 0.014, 6, 24), MT(cx, cy, zz), sw(bead));
      GL.geo(new THREE.CircleGeometry(r, 24), MT(cx, cy, 0), sw('glass'));
    } else {
      // 洞壁四面(法線朝洞裡:窗台朝上、窗楣朝下、兩側朝中間)
      G.quad([a, b, z1], [c, b, z1], [c, b, z0], [a, b, z0], [0, 1, 0], euv(0, b), euv(1, b), euv(1, b + 0.04), euv(0, b + 0.04));
      G.quad([a, d, z0], [c, d, z0], [c, d, z1], [a, d, z1], [0, -1, 0], euv(0, d), euv(1, d), euv(1, d + 0.04), euv(0, d + 0.04));
      G.quad([a, b, z0], [a, d, z0], [a, d, z1], [a, b, z1], [1, 0, 0], euv(0, b), euv(0, d), euv(1, d), euv(1, b));
      G.quad([c, b, z1], [c, d, z1], [c, d, z0], [c, b, z0], [-1, 0, 0], euv(0, b), euv(0, d), euv(1, d), euv(1, b));
      const w = 0.018, pr = 0.006;
      for (const [zA, zB] of [[z1, z1 + pr], [z0 - pr, z0]]) {
        part(G, bead, a - w, b - w, zA, c + w, b, zB); part(G, bead, a - w, d, zA, c + w, d + w, zB);
        part(G, bead, a - w, b, zA, a, d, zB); part(G, bead, c, b, zA, c + w, d, zB);
      }
      glassQuad(a, b, c, d, style === 'fire' ? 'wire' : 'glass');
    }
  }
  // 鉸鍊(三組;門縫裡看得到的鉸鍊管)
  for (const hy of [0.25, lh * 0.5, lh - 0.3]) G.geo(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 10), MT(-0.004, hy, 0), sw('hinge'));
  // 踢板(木門沒有)
  if (style !== 'wood' && style !== 'chapel') for (const [zA, zB] of [[z1, z1 + 0.003], [z0 - 0.003, z0]]) part(G, 'kick', 0.04, 0.02, zA, lw - 0.04, 0.26, zB);
  // 門把:圓座 + 頸 + 把手(握的地方磨亮:色票是兩暗中亮的漸層)
  const lever = (s) => {
    const zf = s > 0 ? z1 : z0;
    G.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), MT(lw - 0.065, 1.02, zf + s * 0.006, Math.PI / 2), sw('steel'));
    G.geo(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8), MT(lw - 0.065, 1.02, zf + s * 0.03, Math.PI / 2), sw('steel'));
    const za = zf + s * 0.045, zb = zf + s * 0.065;
    part(G, 'lever', lw - 0.2, 1.008, Math.min(za, zb), lw - 0.055, 1.032, Math.max(za, zb));
  };
  if (style === 'ward' || style === 'wood' || style === 'metal' || style === 'cell') { lever(1); lever(-1); }
  if (style === 'ward' || style === 'wood') for (const [zA, zB] of [[z1, z1 + 0.003], [z0 - 0.003, z0]]) part(G, 'brass', lw - 0.085, 1.1, zA, lw - 0.045, 1.16, zB); // 鑰匙孔蓋
  if (style === 'metal' || style === 'cell') for (const [zA, zB] of [[z1, z1 + 0.004], [z0 - 0.004, z0]]) part(G, 'steel', lw - 0.12, 0.9, zA, lw - 0.03, 1.3, zB); // 鐵門把手背板
  if (style === 'cell') for (const [zA, zB] of [[z1, z1 + 0.014], [z0 - 0.014, z0]]) part(G, 'steel', lw * 0.3, 0.95, zA, lw * 0.7, 1.12, zB); // 送餐口
  if (style === 'fire') { // 推桿(一面)+ 拉手與閉門器(另一面)
    for (const xx of [0.1, lw - 0.1]) part(G, 'black', xx - 0.04, 0.96, z1, xx + 0.04, 1.06, z1 + 0.07);
    G.geo(new THREE.CylinderGeometry(0.017, 0.017, lw - 0.24, 12), MT(lw / 2, 1.01, z1 + 0.055, 0, 0, Math.PI / 2), sw('steel'));
    G.geo(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), MT(lw - 0.09, 1.05, z0 - 0.06), sw('black'));
    for (const yy of [0.91, 1.19]) part(G, 'black', lw - 0.1, yy - 0.012, z0 - 0.06, lw - 0.08, yy + 0.012, z0);
    part(G, 'closer', 0.1, lh - 0.17, z0 - 0.07, 0.42, lh - 0.08, z0); // 閉門器本體
    part(G, 'closer', 0.4, lh - 0.12, z0 - 0.06, 0.62, lh - 0.1, z0 - 0.04); // 連桿
  }
  if (style === 'swing') for (const [zA, zB] of [[z1, z1 + 0.014], [z0 - 0.014, z0]]) { part(G, 'rubber', 0.02, 0.84, zA, lw - 0.02, 0.98, zB); part(G, 'steel', lw - 0.17, 1.1, zA, lw - 0.06, 1.42, zB); } // 推床防撞條、推板
  if (style === 'chapel') { // 鐵帶 + 拉環
    for (const yy of [0.4, 1.9]) for (const [zA, zB] of [[z1, z1 + 0.008], [z0 - 0.008, z0]]) part(G, 'iron', 0.0, yy - 0.035, zA, lw, yy + 0.035, zB);
    for (const s of [1, -1]) { const zf = s > 0 ? z1 : z0; G.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 14), MT(lw - 0.15, 1.08, zf + s * 0.005, Math.PI / 2), sw('iron')); G.geo(new THREE.TorusGeometry(0.06, 0.009, 6, 18), MT(lw - 0.15, 1.02, zf + s * 0.02), sw('iron')); }
  }
  if (mirror) { G.mirrorZ(); GL.mirrorZ(); }
  return { opaque: G.build(), glass: GL.empty ? null : GL.build() };
}

// 門框飾條與門檻(openings.js 登記的方塊,世界座標)→ 每層合併成一份幾何
function frameGeo(list, fy) {
  const G = new GB();
  for (const f of list) {
    const [x0, y0, z0, x1, y1, z1] = f.b;
    if (f.sw) { // 門檻:整條用金屬色票
      const alongX = x1 - x0 > z1 - z0;
      G.box(x0, y0, z0, x1, y1, z1, (face, P) => lerp(sw(f.sw), alongX ? (P[0] - x0) / (x1 - x0) : (P[2] - z0) / (z1 - z0), 0.5));
      continue;
    }
    const r = REG.frame[f.key] || REG.frame.trim_white, tall = y1 - y0 > 0.5;
    G.box(x0, y0, z0, x1, y1, z1, (face, P) => {
      const s = face === 'pz' || face === 'nz' ? (P[0] - x0) / Math.max(1e-3, x1 - x0) : face === 'px' || face === 'nx' ? (P[2] - z0) / Math.max(1e-3, z1 - z0) : 0.5;
      return lerp(r, tall ? s : 0.5, clamp01((P[1] - fy) / SPAN));
    });
  }
  return G.empty ? null : G.build();
}

export function buildLeaves(K, list) {
  const A = doorAtlas();
  const groupOf = (li) => K.propGroups?.[li] || K.levelGroups[li] || K.levelGroups[0];
  const fallen = K.fallenLeaves || [];
  // 1) 每種(樣式 × 尺寸)一份幾何
  const geos = new Map();
  const mirrorOf = (d) => d.style === 'fire' && d.sgn < 0; // 防火門:兩扇的推桿在同一側
  const keyOf = (d) => `${d.style}|${d.lw.toFixed(3)}|${d.lh.toFixed(3)}${mirrorOf(d) ? '|m' : ''}`;
  for (const d of [...list, ...fallen]) {
    d.t = d.style === 'cell' || d.style === 'fire' ? 0.07 : 0.05;
    const k = keyOf(d);
    if (!geos.has(k)) geos.set(k, leafGeo(d.style, d.lw, d.lh, d.t, mirrorOf(d)));
  }
  // 2) 每層:門扇 + 門框 BatchedMesh、玻璃 BatchedMesh、門縫光 InstancedMesh
  const per = new Map(); // li → { leaves, fallen, frames }
  const of = (li) => { if (!per.has(li)) per.set(li, { leaves: [], fallen: [], frames: [] }); return per.get(li); };
  for (const d of list) of(d.li).leaves.push(d);
  for (const d of fallen) of(d.li).fallen.push(d);
  for (const f of K.doorFrames || []) of(f.li).frames.push(f);
  const meshes = [], leakGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  { const u = leakGeo.attributes.uv, r = sw('leak'); for (let i = 0; i < u.count; i++) u.setXY(i, r[0] + u.getX(i) * (r[2] - r[0]), r[1] + u.getY(i) * (r[3] - r[1])); } // 亮邊(v=1)在本地 -Z(門那一側)
  const leaks = new Map(); // 門洞 key → { im, k, on }
  for (const [li, P] of per) {
    const fy = K.L.levels[li].y;
    const fg = frameGeo(P.frames, fy);
    const used = new Map();
    let verts = fg ? fg.attributes.position.count : 0, gverts = 0, glassN = 0;
    for (const d of P.leaves) if (geos.get(keyOf(d)).glass) glassN++;
    for (const d of [...P.leaves, ...P.fallen]) {
      const k = keyOf(d), g = geos.get(k);
      if (!used.has(k)) { used.set(k, g); verts += g.opaque.attributes.position.count; if (g.glass) gverts += g.glass.attributes.position.count; }
    }
    const bm = new THREE.BatchedMesh(P.leaves.length + P.fallen.length + 1, Math.max(3, verts), 0, A.mats.door);
    bm.name = `L${li}:doors`; bm.castShadow = true; bm.receiveShadow = true;
    const gb = glassN ? new THREE.BatchedMesh(glassN, gverts, 0, A.mats.glass) : null;
    if (gb) { gb.name = `L${li}:doorglass`; gb.castShadow = false; gb.receiveShadow = false; gb.renderOrder = 3; }
    const gid = new Map(), ggid = new Map();
    for (const [k, g] of used) { gid.set(k, bm.addGeometry(g.opaque)); if (g.glass && gb) ggid.set(k, gb.addGeometry(g.glass)); }
    if (fg) { const iid = bm.addInstance(bm.addGeometry(fg)); bm.setMatrixAt(iid, _b.identity()); bm.setColorAt(iid, _c.setRGB(1, 1, 1)); fg.dispose(); }
    const tintOf = (x, z) => 0.86 + ((Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 43758.5) % 1) * 0.2; // 每扇門的新舊、色調稍有不同
    for (const d of P.leaves) {
      const k = keyOf(d), tint = tintOf(d.x, d.z);
      d.bm = bm; d.bid = bm.addInstance(gid.get(k));
      bm.setColorAt(d.bid, _c.setRGB(tint, tint, tint * 0.98));
      if (gb && ggid.has(k)) { d.gb = gb; d.gid = gb.addInstance(ggid.get(k)); }
    }
    for (const d of P.fallen) { // 倒下的門:更髒更暗,矩陣固定
      const id = bm.addInstance(gid.get(keyOf(d))), tint = tintOf(d.m.elements[12], d.m.elements[14]) * 0.72;
      bm.setMatrixAt(id, d.m); bm.setColorAt(id, _c.setRGB(tint, tint * 0.97, tint * 0.92));
    }
    groupOf(li).add(bm); meshes.push(bm);
    if (gb) { groupOf(li).add(gb); meshes.push(gb); }
    // 門縫光:每個室內門洞一片(地上,從門扇那條線往走廊那側;亮邊在門縫)
    const ways = new Map();
    for (const d of P.leaves) if (!ways.has(d.door) && d.wf != null && !d.out && d.style !== 'glass') ways.set(d.door, d);
    if (ways.size) {
      const im = new THREE.InstancedMesh(leakGeo, A.mats.leak, ways.size);
      im.name = `L${li}:doorleak`; im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.renderOrder = 2;
      im.raycast = () => {};
      im.userData.on = 0;
      let k = 0;
      for (const [key, d] of ways) {
        const out = -d.dirRoom, deep = 0.7, y = fy + 0.012;
        const x = d.axis === 'z' ? d.cx : d.wf + out * deep / 2, z = d.axis === 'z' ? d.wf + out * deep / 2 : d.cz;
        const yaw = d.axis === 'z' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2); // 本地 +Z = 往走廊
        _q.setFromAxisAngle(_y, yaw);
        im.setMatrixAt(k, _b.compose(_p.set(x, y, z), _q, new THREE.Vector3(1.86, 1, deep)));
        im.setColorAt(k, _c.setRGB(0, 0, 0));
        leaks.set(key, { im, k, on: false });
        k++;
      }
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      im.visible = false;
      groupOf(li).add(im); meshes.push(im);
    }
  }
  for (const g of geos.values()) { g.opaque.dispose(); g.glass?.dispose(); } // BatchedMesh 已經複製進自己的緩衝區
  const write = (d) => {
    const ry = d.group.rotation.y;
    _q.setFromAxisAngle(_y, ry);
    _b.compose(_p.set(d.group.position.x, d.group.position.y, d.group.position.z), _q, _s);
    d.bm.setMatrixAt(d.bid, _b);
    if (d.gb) d.gb.setMatrixAt(d.gid, _b);
    d._ry = ry;
  };
  for (const d of list) write(d);
  return {
    list, meshes, atlas: A,
    // 每幀:角度有變的門才更新
    update() { for (let i = 0; i < list.length; i++) { const d = list[i]; if (d.group.rotation.y !== d._ry) write(d); } },
    write,
    // 門縫光(線性 RGB;全 0 = 關)。整層都沒有亮的就把那片 InstancedMesh 藏起來(少一個 draw call)
    leak(key, r, g, b) {
      const L = leaks.get(key);
      if (!L) return;
      L.im.setColorAt(L.k, _c.setRGB(r, g, b));
      L.im.instanceColor.needsUpdate = true;
      const on = r + g + b > 0.004;
      if (on !== L.on) { L.on = on; L.im.userData.on += on ? 1 : -1; L.im.visible = L.im.userData.on > 0; }
    },
    hasLeak: (key) => leaks.has(key),
    stats() { return { levels: per.size, geometries: geos.size, leaves: list.length, fallen: fallen.length, frames: (K.doorFrames || []).length, leaks: leaks.size, meshes: meshes.length }; },
    dispose() { for (const m of meshes) { m.parent?.remove(m); m.dispose?.(); } meshes.length = 0; leakGeo.dispose(); },
  };
}
