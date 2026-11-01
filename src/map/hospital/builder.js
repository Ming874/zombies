import * as THREE from 'three';
import { surf } from './surfaces.js';
import { TRIM } from './texdefs.js';

// 幾何收集器:依 (樓層, 材質鍵) 分桶,最後每桶合成一個網格(大幅減少 draw call)。
// 牆面 UV 用世界座標公尺(材質貼圖 repeat = 1/尺寸),頂點色做色調與髒污漸層。
class Buf {
  constructor(n = 1024) { this.a = new Float32Array(n); this.n = 0; }
  grow(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  push2(x, y) { this.grow(2); this.a[this.n++] = x; this.a[this.n++] = y; }
  push3(x, y, z) { this.grow(3); this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
  get view() { return this.a.subarray(0, this.n); }
}
class IBuf {
  constructor(n = 1024) { this.a = new Uint32Array(n); this.n = 0; }
  push(...v) { if (this.n + v.length > this.a.length) { const b = new Uint32Array(Math.max(this.a.length * 2, this.n + v.length)); b.set(this.a); this.a = b; } for (const x of v) this.a[this.n++] = x; }
  get view() { return this.a.subarray(0, this.n); }
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
// 純色收邊材質合併成三種(霧面/亮面/金屬),顏色烘進頂點色 → 每層少十幾個 draw call
const TRIM_BUCKET = {};
for (const [k, [hex, rough, metal = 0]] of Object.entries(TRIM)) {
  const c = new THREE.Color(hex);
  TRIM_BUCKET[k] = { b: metal >= 0.5 ? 'TRIM_METAL' : rough < 0.45 ? 'TRIM_GLOSS' : 'TRIM_MATTE', c: [c.r, c.g, c.b] };
}
// 水平面材質(地板/天花板):不投手電筒陰影(只投月光陰影)
export const HORIZONTAL = new Set(['tile_ward', 'tile_ward_b', 'tile_lobby', 'terrazzo', 'linoleum', 'linoleum_b', 'linoleum_c', 'linoleum_d', 'tile_white_floor',
  'concrete', 'concrete_paint', 'concrete_wet', 'wood_floor', 'wood_gym', 'wood_parquet', 'wood_old', 'carpet', 'carpet_kids', 'padded_floor', 'stone', 'asphalt',
  'paving', 'gravel', 'grass', 'soil', 'roof_gravel', 'metal_grate', 'ceil_tile', 'ceil_tile_b', 'ceil_plaster', 'ceil_concrete', 'ceil_wood', 'vault_stone', 'runner',
  'checker', 'lino_sheet', 'lino_sheet_b', 'lino_sheet_c', 'lino_sheet_d', 'lino_pattern', 'vct', 'rubber', 'anti_skid', 'epoxy', 'carpet_blue', 'ceil_tile_c', 'floor_line', 'drain']);
export const NO_FLASH_SHADOW_LAYER = 1;
export class Buckets {
  constructor() { this.map = new Map(); this.tris = 0; this.wear = 0.5; } // wear:之後加入的面的破舊度(aWear 頂點屬性)
  get(li, key) {
    const k = li + '|' + key;
    let b = this.map.get(k);
    if (!b) { b = { li, key, p: new Buf(), n: new Buf(), u: new Buf(), c: new Buf(), w: new Buf(256), i: new IBuf(), v: 0 }; this.map.set(k, b); }
    return b;
  }
  // 任意四邊形:a,b,c,d 逆時針(從正面看),uv 為 [u,v]×4,col 為 [r,g,b] 或每角一組
  quad(li, key, a, b, c, d, nrm, uv, col = WHITE) {
    const tb = TRIM_BUCKET[key], mul = tb ? tb.c : WHITE;
    const B = this.get(li, tb ? tb.b : key), base = B.v;
    const P = [a, b, c, d];
    for (let k = 0; k < 4; k++) {
      B.p.push3(P[k][0], P[k][1], P[k][2]);
      B.n.push3(nrm[0], nrm[1], nrm[2]);
      B.u.push2(uv[k][0], uv[k][1]);
      const cc = col.length === 4 ? col[k] : col;
      B.c.push3(cc[0] * mul[0], cc[1] * mul[1], cc[2] * mul[2]);
      B.w.grow(1); B.w.a[B.w.n++] = this.wear;
    }
    B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    B.v += 4; this.tris += 2;
  }
  // 軸對齊的牆面:dir = 'N'|'S'|'E'|'W' 為法線方向;fixed = 該面所在的座標;a0..a1 = 沿牆範圍;
  // uOff:貼圖位移(公尺);v 由 vBase 起算(room 模式 = 地面高度);cBot/cTop = 下緣/上緣頂點色
  // col4:四角顏色 [ (a0,y0), (a1,y0), (a1,y1), (a0,y1) ](沿牆座標 a 的兩端);沒給就用 cBot/cTop
  wall(li, key, dir, fixed, a0, a1, y0, y1, { uOff = 0, vBase = 0, cBot = WHITE, cTop = WHITE, flipU = false, col4 = null } = {}) {
    if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
    const v0 = y0 - vBase, v1 = y1 - vBase;
    const C = col4 || [cBot, cBot, cTop, cTop];
    let P, N, U0, U1, cols;
    if (dir === 'S') { P = [[a0, y0, fixed], [a1, y0, fixed], [a1, y1, fixed], [a0, y1, fixed]]; N = [0, 0, 1]; U0 = a0; U1 = a1; cols = C; }
    else if (dir === 'N') { P = [[a1, y0, fixed], [a0, y0, fixed], [a0, y1, fixed], [a1, y1, fixed]]; N = [0, 0, -1]; U0 = -a1; U1 = -a0; cols = [C[1], C[0], C[3], C[2]]; }
    else if (dir === 'E') { P = [[fixed, y0, a1], [fixed, y0, a0], [fixed, y1, a0], [fixed, y1, a1]]; N = [1, 0, 0]; U0 = -a1; U1 = -a0; cols = [C[1], C[0], C[3], C[2]]; }
    else { P = [[fixed, y0, a0], [fixed, y0, a1], [fixed, y1, a1], [fixed, y1, a0]]; N = [-1, 0, 0]; U0 = a0; U1 = a1; cols = C; }
    if (flipU) { const t = U0; U0 = -U1; U1 = -t; }
    U0 += uOff; U1 += uOff;
    this.quad(li, key, P[0], P[1], P[2], P[3], N, [[U0, v0], [U1, v0], [U1, v1], [U0, v1]], cols);
  }
  // 水平面(地板 up=true / 天花板 up=false),x0..x1 × z0..z1;rot90:貼圖旋轉 90°
  flat(li, key, x0, z0, x1, z1, y, up, { uOff = 0, vOff = 0, rot = false, col = WHITE } = {}) {
    const uv = (x, z) => (rot ? [z + uOff, -x + vOff] : [x + uOff, -z + vOff]);
    if (up) this.quad(li, key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [uv(x0, z1), uv(x1, z1), uv(x1, z0), uv(x0, z0)], col);
    else this.quad(li, key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)], col);
  }
  // 軸對齊方塊(收邊、門框、欄杆…);skip:略過的面 'NSEWUD'
  box(li, key, x0, y0, z0, x1, y1, z1, { col = WHITE, skip = '', uOff = 0 } = {}) {
    if (!skip.includes('S')) this.wall(li, key, 'S', z1, x0, x1, y0, y1, { cBot: col, cTop: col, uOff });
    if (!skip.includes('N')) this.wall(li, key, 'N', z0, x0, x1, y0, y1, { cBot: col, cTop: col, uOff });
    if (!skip.includes('E')) this.wall(li, key, 'E', x1, z0, z1, y0, y1, { cBot: col, cTop: col, uOff });
    if (!skip.includes('W')) this.wall(li, key, 'W', x0, z0, z1, y0, y1, { cBot: col, cTop: col, uOff });
    if (!skip.includes('U')) this.flat(li, key, x0, z0, x1, z1, y1, true, { col });
    if (!skip.includes('D')) this.flat(li, key, x0, z0, x1, z1, y0, false, { col });
  }
  // 任意 BufferGeometry(經過 matrix 變換);uvScale:把幾何原本的 0..1 UV 放大(公尺)
  geo(li, key, g, matrix, { col = WHITE, uvScale = 1 } = {}) {
    const tb = TRIM_BUCKET[key];
    if (tb) col = [col[0] * tb.c[0], col[1] * tb.c[1], col[2] * tb.c[2]];
    const B = this.get(li, tb ? tb.b : key), base = B.v;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    _m3.getNormalMatrix(matrix);
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(matrix);
      B.p.push3(_v.x, _v.y, _v.z);
      if (nor) _n.fromBufferAttribute(nor, k).applyMatrix3(_m3).normalize(); else _n.set(0, 1, 0);
      B.n.push3(_n.x, _n.y, _n.z);
      B.u.push2(uv ? uv.getX(k) * uvScale : 0, uv ? uv.getY(k) * uvScale : 0);
      B.c.push3(col[0], col[1], col[2]);
      B.w.grow(1); B.w.a[B.w.n++] = this.wear;
    }
    if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) B.i.push(base + ix[k]); this.tris += ix.length / 3; }
    else { for (let k = 0; k < pos.count; k++) B.i.push(base + k); this.tris += pos.count / 3; }
    B.v += pos.count;
  }
  // 建立網格,加到 groups[li];matFor(key) 回傳材質(預設 surf)
  build(groups, matFor = surf, { shadow = true } = {}) {
    const meshes = [];
    for (const B of this.map.values()) {
      if (!B.v) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(B.p.view.slice(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(B.n.view.slice(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(B.u.view.slice(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(B.c.view.slice(), 3));
      g.setAttribute('aWear', new THREE.BufferAttribute(B.w.view.slice(), 1));
      g.setIndex(new THREE.BufferAttribute(B.v > 65535 ? B.i.view.slice() : new Uint16Array(B.i.view), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const material = matFor(B.key);
      const m = new THREE.Mesh(g, material);
      m.name = `L${B.li}:${B.key}`;
      m.castShadow = shadow && !material.transparent && !material.userData.noShadow;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      if (HORIZONTAL.has(B.key)) m.layers.set(NO_FLASH_SHADOW_LAYER);
      m.updateMatrix();
      groups[B.li].add(m);
      meshes.push(m);
    }
    this.map.clear();
    return meshes;
  }
}
export const WHITE = [1, 1, 1];
