import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng as mkRng } from '../ctx.js';
import { compose } from './geo.js';
import { registerMat } from '../../materials.js';
import { applySurface } from '../../../mats/surface.js';
import { seedSurface } from '../../../mats/encode.js';

// 房間擺設規劃器:每個區域一個 Room。
//  - 細網格(0.25m)記錄牆、家具足跡;每次放有碰撞的家具前做可達性檢查(從門口 BFS,殭屍半徑膨脹),
//    不能讓任何空地變成走不到的口袋 → 「不能擋路」
//  - 有碰撞的家具不可放在門口格/門前一格/樓梯/出生點/補給點(用 ctx.cells 的可放格)
//  - 靜態幾何先在區域內依材質合併,最後 ctx.add(static) 交給 finalize 再全域合併(全部道具只有十幾個 draw call)
//  - 大量小物件用每個 ctx 共用、可成長的 InstancedMesh;可推動的小道具(dynamic)獨立成物件
const FINE = 0.25, INFL_N = 2; // 膨脹半徑(格):約 0.45m(殭屍半徑 0.42)
const ctxState = new WeakMap();
const UNIT = new THREE.BoxGeometry(1, 1, 1);
// 可推動道具的網格:純色材質依「金屬/亮面/霧面」合成三種頂點色材質(一個可動道具只要 1~3 個 draw call,不是十幾個);
// 有貼圖/透明/自發光的部位保留原材質
const DYN_MATS = {
  metal: new THREE.MeshStandardMaterial({ name: 'pi_dyn_metal', vertexColors: true, roughness: 0.42, metalness: 0.85 }),
  gloss: new THREE.MeshStandardMaterial({ name: 'pi_dyn_gloss', vertexColors: true, roughness: 0.38, metalness: 0.05 }),
  matte: new THREE.MeshStandardMaterial({ name: 'pi_dyn_matte', vertexColors: true, roughness: 0.82, metalness: 0 }),
};
for (const m of Object.values(DYN_MATS)) registerMat(m.name, applySurface(m)); // 表面細節(src/mats;模板 UV 帶表面編碼)
const dynCache = new Map();
function dynParts(t) {
  let out = dynCache.get(t.name);
  if (out) return out;
  const groups = new Map();
  for (const { mat, geo } of t.parts) {
    const plain = !mat.map && !mat.transparent && !(mat.emissiveIntensity > 0 && mat.emissive && mat.emissive.getHex()) && !mat.userData?.tick;
    const key = !plain ? mat : mat.metalness > 0.5 ? 'metal' : mat.roughness < 0.5 ? 'gloss' : 'matte';
    if (!plain) { (groups.get(key) || groups.set(key, []).get(key)).push(geo); continue; }
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = mat.color;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (groups.get(key) || groups.set(key, []).get(key)).push(g);
  }
  out = [];
  for (const [key, list] of groups) {
    const mat = typeof key === 'string' ? DYN_MATS[key] : key;
    const geo = list.length === 1 ? list[0] : mergeGeometries(list);
    if (geo) out.push({ mat, geo });
  }
  dynCache.set(t.name, out);
  return out;
}
// 自動改成可推動的小道具(依模板名稱):[名稱前綴, 質量 kg, 形狀]
const MOVABLE = [[/^bin:(pedal|office|bio|kick|bucket)/, 5, 'cylinder'], [/^iv:/, 6, 'cylinder'], [/^wetsign/, 1.5, 'box'], [/^chairshell/, 4, 'box'], [/^chairwood/, 5, 'box'],
  [/^stool/, 5, 'cylinder'], [/^kidchair/, 2, 'box'], [/^chairoffice/, 12, 'box'], [/^cbox:/, 3, 'box'], [/^wc:/, 16, 'box'], [/^walker/, 3, 'box'], [/^teddy/, 0.5, 'box']];
const movable = (t) => { for (const [re, mass, shape] of MOVABLE) if (re.test(t.name)) return { mass, shape }; return null; };
const _v = new THREE.Vector3(), _c = new THREE.Color();

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function stateOf(ctx) {
  let s = ctxState.get(ctx);
  if (!s) ctxState.set(ctx, (s = { inst: new Map(), dyn: 0, colliders: 0, statics: 0, zones: {} }));
  return s;
}

// 世界矩陣:位置 + 偏航(yaw)+ 物件自身的俯仰/翻滾(先自轉再偏航)
export const placeM = (x, y, z, yaw = 0, rx = 0, rz = 0, s = 1) => compose(x, y, z, rx, yaw, rz, s, s, s, 'YXZ');

// 包圍盒經過俯仰/翻滾(物件座標)後的新包圍盒(偏航之前),dy 為抬高量
const _bx = new THREE.Box3(), _e3 = new THREE.Euler(), _m4 = new THREE.Matrix4();
export function tiltBox(bb, rx, rz, dy = 0) {
  _m4.makeRotationFromEuler(_e3.set(rx, 0, rz, 'YXZ'));
  _bx.makeEmpty();
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(_m4);
    _bx.expandByPoint(_v);
  }
  _bx.min.y += dy; _bx.max.y += dy;
  return _bx.clone();
}

export class Room {
  constructor(ctx, zone) {
    const L = ctx.L, CELL = L.CELL;
    this.ctx = ctx; this.zone = zone; this.L = L; this.li = zone.levelIndex; this.y = L.levels[this.li].y;
    this.rng = mkRng(hashStr(zone.id) ^ 0x51ed);
    this.kit = new Map();
    this.st = stateOf(ctx);
    this.count = { colliders: 0, statics: 0, inst: 0, dyn: 0, tris: 0 };
    // 區域格
    this.cells = new Set();
    let c0 = 1e9, r0 = 1e9, c1 = -1, r1 = -1;
    for (const [ra, rb, rc, rd] of zone.rects) for (let r = rb; r <= rd; r++) for (let c = ra; c <= rc; c++) {
      this.cells.add(r * L.W + c);
      c0 = Math.min(c0, c); r0 = Math.min(r0, r); c1 = Math.max(c1, c); r1 = Math.max(r1, r);
    }
    Object.assign(this, { c0, r0, c1, r1 });
    this.allowed = new Set(ctx.cells(zone).map((p) => p.r * L.W + p.c)); // 可放有碰撞家具
    this.plain = new Set(ctx.cells(zone, { allowNearDoor: true }).map((p) => p.r * L.W + p.c)); // 可放雜物
    // 細網格(含外圍一格)
    this.gx0 = (c0 - 1) * CELL; this.gz0 = (r0 - 1) * CELL;
    this.nx = ((c1 - c0 + 3) * CELL) / FINE; this.nz = ((r1 - r0 + 3) * CELL) / FINE;
    const n = this.nx * this.nz;
    this.walk = new Uint8Array(n); this.inZone = new Uint8Array(n); this.entr = new Uint8Array(n); this.foot = new Uint8Array(n);
    this.infl = new Uint8Array(n); // 被膨脹阻擋的次數(牆或家具)
    const isWalk = (c, r) => (L.flagsAt(this.li, c, r) & L.F.WALK) !== 0;
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = this.gx0 + (i + 0.5) * FINE, z = this.gz0 + (j + 0.5) * FINE;
      const c = Math.floor(x / CELL), r = Math.floor(z / CELL), k = j * this.nx + i;
      if (!isWalk(c, r)) continue;
      this.walk[k] = 1;
      if (this.cells.has(r * L.W + c)) this.inZone[k] = 1;
      else this.entr[k] = 1; // 區域外但相鄰的可走格(門、走廊)= 入口
    }
    for (let k = 0; k < n; k++) if (!this.walk[k]) this._inflate(k, 1);
    this.reach = this._bfs();
    // 牆面:每個區域格四周的實牆(含窗)
    this.walls = this._wallRuns();
    this.doors = [];
    for (const key of this.cells) {
      const c = key % L.W, r = (key / L.W) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (L.charAt(this.li, c + dc, r + dr) === '+') this.doors.push({ c: c + dc, r: r + dr, x: (c + dc + 0.5) * CELL, z: (r + dr + 0.5) * CELL, nx: -dc, nz: -dr });
    }
  }

  // ---------- 網格 ----------
  idx(x, z) {
    const i = Math.floor((x - this.gx0) / FINE), j = Math.floor((z - this.gz0) / FINE);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
  _inflate(k, d) {
    const i0 = k % this.nx, j0 = (k / this.nx) | 0;
    for (let dj = -INFL_N; dj <= INFL_N; dj++) for (let di = -INFL_N; di <= INFL_N; di++) {
      if (di * di + dj * dj > INFL_N * INFL_N + 0.5) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      this.infl[j * this.nx + i] += d;
    }
  }
  _bfs() {
    const n = this.nx * this.nz, seen = new Uint8Array(n), q = new Int32Array(n);
    let h = 0, t = 0;
    for (let k = 0; k < n; k++) if (this.entr[k] && !this.infl[k]) { seen[k] = 1; q[t++] = k; }
    while (h < t) {
      const k = q[h++], i = k % this.nx;
      for (const nk of [k - 1, k + 1, k - this.nx, k + this.nx]) {
        if (nk < 0 || nk >= n || seen[nk] || this.infl[nk] || !this.walk[nk]) continue;
        if ((nk === k - 1 && i === 0) || (nk === k + 1 && i === this.nx - 1)) continue;
        if (!this.inZone[nk] && !this.entr[nk]) continue;
        seen[nk] = 1;
        q[t++] = nk;
      }
    }
    return seen;
  }
  // 足跡(OBB)覆蓋的網格
  footprint(bb, x, z, yaw, margin = 0) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const hx = (bb.max.x - bb.min.x) / 2 + margin, hz = (bb.max.z - bb.min.z) / 2 + margin;
    const lx = (bb.max.x + bb.min.x) / 2, lz = (bb.max.z + bb.min.z) / 2;
    const cx = x + lx * cs + lz * sn, cz = z - lx * sn + lz * cs;
    const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
    const out = [];
    const i0 = Math.floor((cx - ex - this.gx0) / FINE), i1 = Math.floor((cx + ex - this.gx0) / FINE);
    const j0 = Math.floor((cz - ez - this.gz0) / FINE), j1 = Math.floor((cz + ez - this.gz0) / FINE);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = this.gx0 + (i + 0.5) * FINE - cx, pz = this.gz0 + (j + 0.5) * FINE - cz;
      const u = px * cs - pz * sn, v = px * sn + pz * cs; // 轉回物件座標
      if (Math.abs(u) > hx || Math.abs(v) > hz) continue;
      out.push(i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i);
    }
    return { nodes: out, cx, cz, ex, ez };
  }
  // 足跡所在的格子是否都可放(碰撞家具:不在門口/門前/特殊格)
  cellsOK(fp, set) {
    const CELL = this.L.CELL;
    for (const k of fp.nodes) {
      if (k < 0) return false;
      const x = this.gx0 + ((k % this.nx) + 0.5) * FINE, z = this.gz0 + (((k / this.nx) | 0) + 0.5) * FINE;
      if (!set.has(Math.floor(z / CELL) * this.L.W + Math.floor(x / CELL))) return false;
      if (this.foot[k]) return false;
    }
    return true;
  }
  // 放上去後是否會讓任何空地變成走不到(容許 0.5m² 以下的小角落)
  reachOK(fp) {
    for (const k of fp.nodes) { this.foot[k] = 1; this._inflate(k, 1); }
    const seen = this._bfs();
    let lost = 0;
    const n = this.nx * this.nz;
    for (let k = 0; k < n; k++) if (this.reach[k] && !seen[k] && this.inZone[k] && !this.infl[k]) lost++;
    if (lost > 8) {
      for (const k of fp.nodes) { this.foot[k] = 0; this._inflate(k, -1); }
      return false;
    }
    this.reach = seen;
    return true;
  }
  // 只標記足跡(不檢查;小家具、靠牆裝置)
  mark(fp) { for (const k of fp.nodes) if (k >= 0 && !this.foot[k]) { this.foot[k] = 1; this._inflate(k, 1); } this.reach = this._bfs(); }
  // 地上雜物可放:區域內、可走、非家具足跡
  freeAt(x, z, pad = 0) {
    for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
      const k = this.idx(x + dx, z + dz);
      if (k < 0 || !this.inZone[k] || this.foot[k]) return false;
      const CELL = this.L.CELL, key = Math.floor((z + dz) / CELL) * this.L.W + Math.floor((x + dx) / CELL);
      if (!this.plain.has(key)) return false;
    }
    return true;
  }
  isReach(x, z) { const k = this.idx(x, z); return k >= 0 && this.reach[k] === 1; }

  // ---------- 牆面 ----------
  _wallRuns() {
    const L = this.L, CELL = L.CELL, li = this.li, runs = [];
    const solid = (c, r) => (L.flagsAt(li, c, r) & (L.F.WALL | L.F.WINDOW | L.F.ELEVATOR)) !== 0;
    const win = (c, r) => L.charAt(li, c, r) === 'W';
    const SIDES = [['N', 0, -1, 0], ['S', 0, 1, Math.PI], ['W', -1, 0, Math.PI / 2], ['E', 1, 0, -Math.PI / 2]];
    for (const [side, dc, dr, yaw] of SIDES) {
      const horiz = dr !== 0;
      const lines = new Map();
      for (const key of this.cells) {
        const c = key % L.W, r = (key / L.W) | 0;
        if (!solid(c + dc, r + dr) || !(L.flagsAt(li, c, r) & L.F.WALK)) continue;
        const line = horiz ? r : c, pos = horiz ? c : r;
        if (!lines.has(line)) lines.set(line, []);
        lines.get(line).push(pos);
      }
      for (const [line, list] of lines) {
        list.sort((a, b) => a - b);
        let s = 0;
        for (let i = 1; i <= list.length; i++) {
          if (i < list.length && list[i] === list[i - 1] + 1) continue;
          const a = list[s], b = list[i - 1];
          const cellsOf = [];
          for (let p = a; p <= b; p++) cellsOf.push(horiz ? [p, line] : [line, p]);
          const wins = cellsOf.filter(([c, r]) => win(c + dc, r + dr)).map(([c, r]) => (horiz ? c : r));
          const plane = horiz ? (dr < 0 ? line * CELL : (line + 1) * CELL) : (dc < 0 ? line * CELL : (line + 1) * CELL);
          runs.push({ side, yaw, nx: -dc, nz: -dr, horiz, plane, t0: a * CELL, t1: (b + 1) * CELL, len: (b - a + 1) * CELL, cells: cellsOf, wins });
          s = i;
        }
      }
    }
    return runs;
  }
  // 牆面某位置(t 沿牆;d 離牆距離)的世界座標
  wallPos(run, t, d) {
    return run.horiz ? { x: t, z: run.plane + run.nz * d } : { x: run.plane + run.nx * d, z: t };
  }
  // 該段牆在 t 附近是不是窗(窗前只能放矮的東西)
  isWindow(run, t0, t1) {
    const CELL = this.L.CELL;
    return run.wins.some((p) => p * CELL < t1 && (p + 1) * CELL > t0);
  }

  // ---------- 放置 ----------
  // 靜態模板 → 區域合併包
  put(t, x, z, yaw = 0, o = {}) {
    const M = o.m || placeM(x, o.y ?? this.y, z, yaw, o.rx || 0, o.rz || 0, o.s ?? 1);
    const seed = (Math.imul(Math.round(M.elements[12] * 97) ^ Math.round(M.elements[14] * 131) ^ Math.round(M.elements[13] * 53), 0x9e3779b1) >>> 28) & 15; // 每次擺放的細節亂數
    for (const { mat, geo } of t.parts) {
      const g = seedSurface(geo.clone().applyMatrix4(M), seed);
      let l = this.kit.get(mat);
      if (!l) this.kit.set(mat, (l = []));
      l.push(g);
      this.count.tris += g.attributes.position.count / 3;
    }
    this.count.statics++;
    const k = t.name.split(/[:#@]/)[0], u = this.st.use || (this.st.use = {});
    u[k] = (u[k] || 0) + t.tris;
    this._index(t, M);
    return { t, x, z, yaw, y: o.y ?? this.y, M };
  }
  // 擺放索引(world.propIndex:截圖/材質檢查工具用來找道具;每筆只有名稱 + 包圍盒中心/尺寸)
  _index(t, M) {
    const w = this.ctx.world;
    if (!w) return;
    const c = t.bbox.getCenter(_v).applyMatrix4(M), s = t.bbox.max.clone().sub(t.bbox.min);
    (w.propIndex || (w.propIndex = [])).push({ n: t.name, z: this.zone.id, x: +c.x.toFixed(2), y: +c.y.toFixed(2), zz: +c.z.toFixed(2), w: +s.x.toFixed(2), h: +s.y.toFixed(2), d: +s.z.toFixed(2), yaw: +Math.atan2(M.elements[8], M.elements[10]).toFixed(3) });
  }
  // 有碰撞家具:檢查 → 放置 → 登記碰撞。成功回傳放置資訊,失敗回傳 null
  tryPut(t, x, z, yaw = 0, o = {}) {
    let bb = t.meta.coll || t.bbox;
    if (o.rx || o.rz || (o.y != null && o.y !== this.y)) bb = tiltBox(bb, o.rx || 0, o.rz || 0, (o.y ?? this.y) - this.y);
    const fp = this.footprint(bb, x, z, yaw, o.margin ?? 0.02);
    if (!o.force) {
      if (!this.cellsOK(fp, o.near ? this.plain : this.allowed)) return null;
      if (!this.reachOK(fp)) return null;
    } else this.mark(fp);
    const p = this.put(t, x, z, yaw, o);
    if (o.collide !== false) { this._tag = t.name; this.collide(bb, x, o.y ?? this.y, z, yaw, o); this._tag = null; }
    return p;
  }
  // 以代理盒呼叫 ctx.add(collide) 登記碰撞(斜放時拆成數段近似 OBB),然後移除代理
  collide(bb, x, y, z, yaw, o = {}) {
    const sx = bb.max.x - bb.min.x, sy = (o.h ?? bb.max.y) - bb.min.y, sz = bb.max.z - bb.min.z;
    const lx = (bb.max.x + bb.min.x) / 2, lz = (bb.max.z + bb.min.z) / 2;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const aligned = Math.abs(Math.sin(2 * yaw)) < 0.12;
    const longX = sx >= sz, n = aligned ? 1 : Math.min(4, Math.max(1, Math.round((longX ? sx / sz : sz / sx) * 1.2)));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      const px = lx + (longX ? f * sx : 0), pz = lz + (longX ? 0 : f * sz);
      const proxy = new THREE.Mesh(UNIT);
      proxy.visible = false; // 只用來算包圍盒(setFromObject 不看 visible)
      proxy.scale.set(longX ? sx / n : sx, sy, longX ? sz : sz / n);
      proxy.position.set(x + px * cs + pz * sn, y + bb.min.y + sy / 2, z - px * sn + pz * cs);
      proxy.rotation.y = aligned ? Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2) : yaw;
      this.ctx.add(proxy, { collide: true, static: false, shrink: o.shrink ?? (aligned ? 0.03 : 0.08), tag: this._tag, mat: o.mat });
      proxy.parent?.remove(proxy); // 場景建構器可能把物件改放到別的群組,直接從實際的父節點移除
      this.count.colliders++;
    }
  }
  // 靠牆擺放:在符合條件的牆段找位置。o: {gap, side, prefer:'mid'|'end'|'rand', low(窗前可放), runs(指定), tries, margin}
  wall(t, o = {}) {
    const w = t.bbox.max.x - t.bbox.min.x, d = t.bbox.max.z - t.bbox.min.z, h = t.bbox.max.y - t.bbox.min.y;
    const gap = o.gap ?? 0.04;
    let runs = (o.runs || this.walls).filter((r) => r.len >= w + 0.1 && (!o.side || o.side.includes(r.side)));
    if (o.filter) runs = runs.filter(o.filter);
    const tries = o.tries ?? 24;
    for (let k = 0; k < tries && runs.length; k++) {
      const run = o.order ? runs[k % runs.length] : this.rng.pick(runs);
      let t0;
      if (o.at != null) t0 = run.t0 + o.at;
      else if (o.prefer === 'mid') t0 = (run.t0 + run.t1) / 2 + (k ? this.rng.range(-1, 1) * (run.len / 2 - w / 2) : 0);
      else if (o.prefer === 'end') t0 = (k & 1) ? run.t1 - w / 2 - 0.08 : run.t0 + w / 2 + 0.08;
      else t0 = this.rng.range(run.t0 + w / 2 + 0.05, run.t1 - w / 2 - 0.05);
      if (o.snap) t0 = Math.round(t0 / o.snap) * o.snap;
      if (h > 0.95 && !o.low && this.isWindow(run, t0 - w / 2, t0 + w / 2)) continue;
      const lz = (t.bbox.min.z + t.bbox.max.z) / 2, lx = (t.bbox.min.x + t.bbox.max.x) / 2;
      // 模板背面(min.z)貼牆
      const dist = gap - t.bbox.min.z;
      const p = this.wallPos(run, t0, dist);
      const cs = Math.cos(run.yaw), sn = Math.sin(run.yaw);
      const x = p.x - lx * cs, z = p.z + lx * sn;
      void lz;
      const r = o.collide === false ? this.putChecked(t, x, z, run.yaw, o) : this.tryPut(t, x, z, run.yaw, o);
      if (r) { r.run = run; r.tw = t0; return r; }
    }
    return null;
  }
  // 指定牆段位置:模板背面貼牆(gap),橫向中心在 t;o.collide=false 時不登記碰撞(只檢查不重疊)
  atWall(t, run, tPos, o = {}) {
    const gap = o.gap ?? 0.04;
    const lx = (t.bbox.min.x + t.bbox.max.x) / 2;
    const p = this.wallPos(run, tPos, gap - t.bbox.min.z);
    const cs = Math.cos(run.yaw), sn = Math.sin(run.yaw);
    const x = p.x - lx * cs, z = p.z + lx * sn;
    if (o.mount) return this._mirror(t, run, this.put(t, x, z, run.yaw, { ...o, y: this.y + o.mount }));
    const r = o.collide === false ? this.putChecked(t, x, z, run.yaw, o) : this.tryPut(t, x, z, run.yaw, o);
    if (r) { r.run = run; r.tw = tPos; }
    return this._mirror(t, run, r);
  }
  // [ghost] 鏡子(獨立鏡子、洗手台上的鏡子)登記成事件錨點:鏡面中心 + 朝房間的法線 + 尺寸(src/horror 的「鏡子裡的臉」)
  _mirror(t, run, r) {
    if (!r || !r.M || !/^(mirror|sinkwall):/.test(t.name)) return r;
    const mw = t.name.startsWith('mirror'), dims = mw ? t.name.split(':').slice(1, 3).map(Number) : [0.47, 0.59];
    const c = this.local(r, 0, mw ? dims[1] / 2 + 0.03 : 1.55, mw ? 0.032 : 0.02);
    this.event({ kind: 'mirror', x: c.x, y: c.y, z: c.z, nx: run.nx ?? 0, nz: run.nz ?? 0, w: dims[0], h: dims[1] });
    return r;
  }
  // 某一側最長的牆段
  run(side, filter) {
    let best = null;
    for (const r of this.walls) if (r.side === side && (!filter || filter(r)) && (!best || r.len > best.len)) best = r;
    return best;
  }
  // 牆段上的 t → 世界座標中「離牆 d」的點
  at(run, tPos, d) { return this.wallPos(run, tPos, d); }
  // 無碰撞但避免與家具重疊(檢查足跡在可放雜物格)
  putChecked(t, x, z, yaw, o = {}) {
    const fp = this.footprint(t.bbox, x, z, yaw, 0);
    if (!this.cellsOK(fp, this.plain)) return null;
    // 地上的小道具(垃圾桶、點滴架、椅子、紙箱…)改成可推動的物理道具(每區最多 10 個)
    const mv = !o.mount && (o.y == null || o.y === this.y) && !o.rx && !o.rz && o.static !== true && movable(t);
    if (mv && (this.autoDyn = (this.autoDyn || 0) + 1) <= 10) { if (o.mark !== false) this.mark(fp); return this.dyn(t, x, z, yaw, mv, { force: true, y: this.y }) && { t, x, z, yaw, y: this.y, M: placeM(x, this.y, z, yaw) }; }
    if (o.mark !== false) this.mark(fp);
    return this.put(t, x, z, yaw, o);
  }
  // 地板上隨機位置(有碰撞)
  floor(t, o = {}) {
    const cells = [...(o.near ? this.plain : this.allowed)];
    for (let k = 0; k < (o.tries ?? 30) && cells.length; k++) {
      const key = this.rng.pick(cells), c = key % this.L.W, r = (key / this.L.W) | 0;
      const x = (c + 0.5) * this.L.CELL + this.rng.range(-0.5, 0.5), z = (r + 0.5) * this.L.CELL + this.rng.range(-0.5, 0.5);
      const yaw = o.yaw ?? (this.rng.int(0, 3) * Math.PI) / 2 + this.rng.range(-1, 1) * (o.jitter ?? 0.15);
      const p = o.collide === false ? this.putChecked(t, x, z, yaw, o) : this.tryPut(t, x, z, yaw, o);
      if (p) return p;
    }
    return null;
  }
  // 相對於某個放置物(p)的本地座標放模板(床號牌、桌上物品…)
  putRel(t, p, x, y, z, rx = 0, ry = 0, rz = 0) { return this.put(t, 0, 0, 0, { m: p.M.clone().multiply(placeM(x, y, z, ry, rx, rz)) }); }
  // 模板頂面(世界座標)上的位置
  topOf(p, i = 0) {
    const tp = p.t.tops[i];
    if (!tp) return null;
    const a = new THREE.Vector3(tp.x0, tp.y, tp.z0).applyMatrix4(p.M), b = new THREE.Vector3(tp.x1, tp.y, tp.z1).applyMatrix4(p.M);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z), y: a.y, yaw: p.yaw, M: p.M, tp };
  }
  // 頂面上的本地座標 (u,v ∈ 0..1) → 世界
  onTop(p, u, v, i = 0) {
    const tp = p.t.tops[i];
    return new THREE.Vector3(tp.x0 + (tp.x1 - tp.x0) * u, tp.y, tp.z0 + (tp.z1 - tp.z0) * v).applyMatrix4(p.M);
  }
  // 相對於某放置物的本地座標 → 世界
  local(p, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(p.M); }

  // ---------- 實例化小物件 ----------
  inst(type, t, M, color) {
    const st = this.st;
    let b = st.inst.get(type);
    if (!b || b.count >= b.cap) {
      const cap = t.meta.cap ?? 1024;
      b = { count: 0, cap, meshes: t.parts.map(({ mat, geo }) => {
        const im = new THREE.InstancedMesh(geo, mat, cap);
        im.count = 0;
        im.castShadow = !!t.meta.cast;
        im.receiveShadow = true;
        im.name = `pi_inst_${type}`;
        if (mat.userData.tick) im.onBeforeRender = mat.userData.tick;
        this.ctx.add(im, { static: false });
        return im;
      }) };
      st.inst.set(type, b);
    }
    for (const im of b.meshes) {
      im.setMatrixAt(b.count, M);
      if (color != null) im.setColorAt(b.count, _c.set(color));
      else if (im.instanceColor) im.setColorAt(b.count, _c.set(0xffffff));
      im.count = b.count + 1;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.boundingSphere = null;
      im.boundingBox = null;
    }
    b.count++;
    this.count.inst++;
  }
  // 便利:在 (x, y, z) 放一個實例(yaw, rx, rz, s)
  I(type, t, x, y, z, yaw = 0, rx = 0, rz = 0, s = 1, color) { this.inst(type, t, placeM(x, y, z, yaw, rx, rz, s), color); }

  // ---------- 可推動道具 ----------
  // dyn: { mass, shape: 'box'|'cylinder'|'sphere', friction, restitution };原點在底面中心
  dyn(t, x, z, yaw, dyn, o = {}) {
    const fp = this.footprint(t.bbox, x, z, yaw, 0.03);
    if (!o.force && !o.y && !this.cellsOK(fp, this.plain)) return null;
    if (!o.y) this.mark(fp);
    const g = new THREE.Group();
    for (const { mat, geo } of dynParts(t)) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !mat.transparent;
      m.receiveShadow = true;
      g.add(m);
    }
    g.position.set(x, o.y ?? this.y, z);
    g.rotation.set(o.rx || 0, yaw, o.rz || 0, 'YXZ');
    const bb = t.bbox;
    g.userData.dynamic = {
      mass: dyn.mass, shape: dyn.shape || 'box', friction: dyn.friction ?? 0.6, restitution: dyn.restitution ?? 0.15,
      size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z],
      offset: [(bb.max.x + bb.min.x) / 2, (bb.max.y + bb.min.y) / 2, (bb.max.z + bb.min.z) / 2],
    };
    g.userData.kind = t.name;
    g.name = `pi_dyn_${t.name}`;
    g.updateMatrix();
    this._index(t, g.matrix);
    this.ctx.add(g, { static: false, collide: false });
    this.count.dyn++;
    this.st.dyn++;
    return g;
  }

  // ---------- 燈光、事件 ----------
  light(spec) { return this.ctx.light({ zone: this.zone.id, level: this.li, ...spec }); }
  event(spec) { return this.ctx.event({ zone: this.zone.id, level: this.li, ...spec }); }

  // ---------- 完成:區域內依材質合併 ----------
  done() {
    for (const [mat, list] of this.kit) {
      for (let i = 0; i < list.length; i += 600) {
        const g = mergeGeometries(list.slice(i, i + 600));
        if (!g) continue;
        const mesh = new THREE.Mesh(g, mat);
        mesh.name = `pi_${this.zone.id}_${mat.name}`;
        mesh.userData.zone = this.zone.id;
        mesh.userData.level = this.li;
        this.ctx.add(mesh, { static: true });
      }
    }
    this.kit.clear();
    this.st.zones[this.zone.id] = this.count;
    return this.count;
  }

  // ---------- 便利 ----------
  center() {
    const CELL = this.L.CELL;
    let sx = 0, sz = 0, n = 0;
    for (const key of this.cells) { sx += ((key % this.L.W) + 0.5) * CELL; sz += (((key / this.L.W) | 0) + 0.5) * CELL; n++; }
    return { x: sx / n, z: sz / n };
  }
  // 主要門(第一扇門,或指定方向)
  mainDoor() { return this.doors[0] || null; }
  rand(a, b) { return this.rng.range(a, b); }
  pick(a) { return this.rng.pick(a); }
  chance(p) { return this.rng.chance(p); }
}
export { FINE };
export const v3 = (x, y, z) => _v.set(x, y, z);
