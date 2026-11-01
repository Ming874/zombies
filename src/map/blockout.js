import * as THREE from 'three';
import { mat, MAT_KEYS } from './materials.js';
import { OBSTACLE_H } from './collision.js';

// 灰盒場景建構器:直接依 layout 生成地板/天花板/牆(外露面)/窗台窗楣/欄杆/門楣/樓梯(台階)/
// 戶外地面/圍籬/障礙物與少量光源。用途:引擎除錯(網址帶 ?blockout)以及 hospital.js 失敗時的備援。
// 幾何依材質合併成少數幾個網格(draw call 很少);障礙物會登記碰撞盒(要在 world.buildNav() 之前呼叫)。

const N_LIGHTS = 8;
const LIGHT_COLOR = {
  fluoro: 0xdbeadf, fluoro_dying: 0xd0e4d4, fluoro_cold: 0xe4f0ff, surgical: 0xffffff, emergency: 0xff3a22, candle: 0xffa860,
  warm: 0xffd8a0, monitor: 0x88c0d8, bare_bulb: 0xffd090, sodium: 0xff9a40, nightlight: 0xff98b8, lamp: 0xffd0a0, fire: 0xff7a2a,
};
const OBST_COLOR = {
  ambulance: 0xd8d8d0, ambulance_crash: 0xd0d0c8, police_car: 0x1a1e26, hearse: 0x111111, dumpster: 0x34563a, generator: 0xb09a3a,
  incinerator: 0x5a4a40, fountain: 0x8a8880, statue: 0xa8a8a0, water_tower: 0x6a6a68, ac_unit: 0x9a9c9c, barricade: 0xd8a020,
};
const CAR_COLORS = [0x7a2020, 0x2a3a5a, 0xb0b0a8, 0x303032, 0x5a6a3a, 0x8a7a5a];

function gridTexture(fine) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#d0d0cc';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { // 輕微雜訊,避免完全平滑
    const v = 190 + ((Math.random() * 40) | 0);
    g.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  g.strokeStyle = 'rgba(70,70,70,0.35)';
  g.lineWidth = 1;
  if (fine) for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, k * S / 4 + 0.5); g.lineTo(S, k * S / 4 + 0.5); g.moveTo(k * S / 4 + 0.5, 0); g.lineTo(k * S / 4 + 0.5, S); g.stroke(); }
  g.strokeStyle = 'rgba(40,40,40,0.7)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 累積四邊形(位置/法線/UV/頂點色),最後組成一個網格
class Batch {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  // 四個頂點(逆時針面向法線),uv 以公尺 / 2(一格一張貼圖)
  quad(a, b, c, d, nx, ny, nz, col, ua, va, ub, vb) {
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) { this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); }
    this.uv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
  }
  box(x0, y0, z0, x1, y1, z1, col, faces = 63) {
    const s = 0.5;
    if (faces & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, col, z1 * s, y0 * s, z0 * s, y1 * s); // +x
    if (faces & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, col, z0 * s, y0 * s, z1 * s, y1 * s); // -x
    if (faces & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, col, x0 * s, z1 * s, x1 * s, z0 * s); // +y
    if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, col, x0 * s, z0 * s, x1 * s, z1 * s); // -y
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, col, x0 * s, y0 * s, x1 * s, y1 * s); // +z
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, col, x1 * s, y0 * s, x0 * s, y1 * s); // -z
  }
  mesh(material) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    return m;
  }
}

export function buildBlockout(world, layout = world.layout, scene = null) {
  const L = layout, C = L.CELL, NL = L.levels.length;
  const group = new THREE.Group();
  group.name = 'blockout';
  const struct = new Batch(), floors = new Batch(), water = new Batch(), metal = new Batch();
  const col = (hex) => new THREE.Color(hex);
  const KEYS = new Set(MAT_KEYS);
  const matColor = (key, fb) => (key && KEYS.has(key) ? mat(key).color.clone() : col(fb)); // 區域材質鍵的顏色(結構代理換 PBR 後仍可用)
  const tint = (c, k) => c.clone().multiplyScalar(k);
  const ch = (li, c, r) => L.charAt(li, c, r);
  const isWall = (x) => x === '#' || x === 'E';
  const outdoorCh = (x) => x === ',' || x === '"' || x === 'z';
  const facade = col(0x8e8a80), slabEdge = col(0x6a6862), wallTop = col(0x77746c);
  const ARROW = '^v<>';

  // ---- 地板(可走格、門口、圍籬與障礙物底下;樓梯另外畫台階) ----
  for (let li = 0; li < NL; li++) {
    const y = L.levels[li].y + 0.001;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const x = ch(li, c, r);
      if (!L.hasFloor(li, c, r) || isWall(x) || x === 'W' || x === '=' || ARROW.includes(x)) continue;
      const st = L.styleAt(li, c, r);
      const key = x === '"' ? 'grass' : st.floor;
      let cc = matColor(key, 0x808080);
      if (x === '~') cc = tint(cc, 0.6);
      cc.offsetHSL(0, 0, ((c * 7 + r * 13 + li * 5) % 5) * 0.006 - 0.012); // 每格微小明暗差
      const x0 = c * C, z0 = r * C, x1 = x0 + C, z1 = z0 + C;
      floors.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0, 1, 0, cc, x0 / 2, z1 / 2, x1 / 2, z0 / 2);
      if (x === '~') water.quad([x0, y + 0.07, z1], [x1, y + 0.07, z1], [x1, y + 0.07, z0], [x0, y + 0.07, z0], 0, 1, 0, col(0x2a4a50), x0 / 2, z1 / 2, x1 / 2, z0 / 2);
    }
  }

  // ---- 天花板(由有樓板的格往上找第一個實心物;挑空/樓梯開口不重複畫) ----
  for (let li = 0; li < NL; li++) {
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const x = ch(li, c, r);
      if (!L.hasFloor(li, c, r) || isWall(x)) continue;
      const cy = L.ceilY(li, c, r);
      if (!Number.isFinite(cy)) continue;
      const st = L.styleAt(li, c, r);
      const cc = st.ceil === 'pipes' ? col(0x4a4a46) : st.ceil === 'vault' ? col(0x6a645a) : outdoorCh(x) ? col(0x5a5852) : col(0x9a9890);
      const x0 = c * C, z0 = r * C, x1 = x0 + C, z1 = z0 + C, yy = cy - 0.001;
      struct.quad([x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1], 0, -1, 0, cc, x0 / 2, z0 / 2, x1 / 2, z1 / 2);
    }
  }

  // ---- 牆:只畫外露面,顏色取相鄰空間的區域牆面材質(室外側用外牆色) ----
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let li = 0; li < NL; li++) {
    const y0 = L.levels[li].y, y1 = y0 + L.CEIL_H;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const x = ch(li, c, r);
      if (!isWall(x)) continue;
      for (const [dc, dr] of D4) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= L.W || nr >= L.H) continue;
        const nx = ch(li, nc, nr);
        if (isWall(nx)) continue;
        let cc;
        if (x === 'E') cc = col(0x5a5e62);
        else if (outdoorCh(nx) || nx === '_' || nx === 'o' || nx === '|') cc = facade.clone();
        else cc = matColor(L.styleAt(li, nc, nr).wall, 0x9a9a92);
        cc.offsetHSL(0, 0, ((c * 3 + r * 5) % 4) * 0.008 - 0.012);
        const X0 = c * C, Z0 = r * C, X1 = X0 + C, Z1 = Z0 + C;
        if (dc === 1) struct.box(X1, y0, Z0, X1, y1, Z1, cc, 1);
        else if (dc === -1) struct.box(X0, y0, Z0, X0, y1, Z1, cc, 2);
        else if (dr === 1) struct.box(X0, y0, Z1, X1, y1, Z1, cc, 16);
        else struct.box(X0, y0, Z0, X1, y1, Z0, cc, 32);
      }
      // 上方沒有樓板(戶外圍牆等):畫牆頂
      if (li + 1 >= NL || !L.hasFloor(li + 1, c, r)) struct.box(c * C, y1, r * C, c * C + C, y1, r * C + C, wallTop, 4);
    }
  }

  // ---- 樓板邊緣(挑空、樓梯開口、建築外緣) ----
  for (let li = 1; li < NL; li++) {
    const y = L.levels[li].y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (!L.hasFloor(li, c, r)) continue;
      for (const [dc, dr] of D4) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nr >= 0 && nc < L.W && nr < L.H && L.hasFloor(li, nc, nr)) continue;
        const X0 = c * C, Z0 = r * C, X1 = X0 + C, Z1 = Z0 + C;
        const f = dc === 1 ? 1 : dc === -1 ? 2 : dr === 1 ? 16 : 32;
        struct.box(dc === 1 ? X1 : X0, y - L.SLAB, dr === 1 ? Z1 : Z0, dc === -1 ? X0 : X1, y, dr === -1 ? Z0 : Z1, slabEdge, f);
      }
    }
  }

  // ---- 窗台/窗楣、欄杆、門楣、屋頂(合併後的 AABB) ----
  const KCOL = { sill: 0x7c858a, header: 0x7c858a, rail: 0x9c8c62, lintel: 0x8a8478, roof: 0x5c5a56 };
  for (const b of world.staticBoxes()) {
    const k = KCOL[b.kind];
    if (k === undefined) continue;
    const cc = col(k);
    struct.box(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, cc);
    if (b.kind === 'rail') struct.box(b.x0, b.y1, b.z0, b.x1, b.y1 + 0.04, b.z1, tint(cc, 1.25), 4 | 1 | 2 | 16 | 32); // 扶手壓條
  }

  // ---- 鐵欄杆/圍籬:立柱 + 橫桿(沿圍籬走向) ----
  const fenceCol = col(0x3e4246);
  for (let li = 0; li < NL; li++) {
    const y = L.levels[li].y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      if (ch(li, c, r) !== '|') continue;
      const alongX = ch(li, c - 1, r) === '|' || ch(li, c + 1, r) === '|' || (ch(li, c, r - 1) !== '|' && ch(li, c, r + 1) !== '|');
      const cx = (c + 0.5) * C, cz = (r + 0.5) * C, h = world.FENCE_H || 2.2;
      metal.box(cx - 0.05, y, cz - 0.05, cx + 0.05, y + h, cz + 0.05, fenceCol);
      for (const hy of [0.15, h * 0.5, h - 0.08]) {
        if (alongX) metal.box(c * C, y + hy - 0.03, cz - 0.02, c * C + C, y + hy + 0.03, cz + 0.02, fenceCol);
        else metal.box(cx - 0.02, y + hy - 0.03, r * C, cx + 0.02, y + hy + 0.03, r * C + C, fenceCol);
      }
      for (let k = 1; k < 8; k++) { // 細欄杆
        const t = k / 8;
        if (alongX) metal.box(c * C + t * C - 0.012, y, cz - 0.012, c * C + t * C + 0.012, y + h, cz + 0.012, fenceCol);
        else metal.box(cx - 0.012, y, r * C + t * C - 0.012, cx + 0.012, y + h, r * C + t * C + 0.012, fenceCol);
      }
    }
  }

  // ---- 樓梯:24 階實心台階(坡面 L.stairHeight 通過每階踏面中點),兩側加踢腳 ----
  for (const s of L.stairs) {
    const N = 24, sign = Math.sign(s.highAt - s.lowAt), run = Math.abs(s.highAt - s.lowAt) / N, rise = (s.yHigh - s.yLow) / N;
    const zone = L.zones.find((z) => z.id === s.zone);
    const metalStair = zone && zone.theme === 'fire_escape';
    const base = metalStair ? col(0x4a4c4e) : matColor(zone?.floor || 'concrete', 0x8a8780);
    for (let i = 0; i < N; i++) {
      const a = s.lowAt + sign * i * run, b = s.lowAt + sign * (i + 1) * run;
      const v0 = Math.min(a, b), v1 = Math.max(a, b), top = s.yLow + (i + 0.5) * rise;
      const cc = tint(base, i % 2 ? 1 : 0.93);
      if (s.axis === 'z') struct.box(s.x0, s.yLow, v0, s.x1, top, v1, cc);
      else struct.box(v0, s.yLow, s.z0, v1, top, s.z1, cc);
    }
  }

  // ---- 大型障礙物('X'):簡單量體 + 碰撞盒(登記到 world) ----
  let carK = 0;
  for (const o of L.obstacles) {
    const h = OBSTACLE_H[o.kind] ?? 1.5;
    const sx = o.sx * 0.9, sz = o.sz * 0.9, x0 = o.x - sx / 2, z0 = o.z - sz / 2;
    const isCar = o.kind === 'car' || o.kind === 'police_car' || o.kind === 'hearse' || o.kind.startsWith('ambulance');
    const cc = col(o.kind === 'car' ? CAR_COLORS[carK++ % CAR_COLORS.length] : OBST_COLOR[o.kind] ?? 0x777777);
    if (isCar) {
      const body = h * (o.kind.startsWith('ambulance') ? 0.75 : 0.55);
      struct.box(x0, o.y + 0.25, z0, x0 + sx, o.y + body, z0 + sz, cc);
      const ix = sx * (o.axis === 'EW' ? 0.18 : 0.08), iz = sz * (o.axis === 'EW' ? 0.08 : 0.18);
      struct.box(x0 + ix, o.y + body, z0 + iz, x0 + sx - ix, o.y + h, z0 + sz - iz, tint(cc, 0.75));
      struct.box(x0 + 0.1, o.y, z0 + 0.1, x0 + sx - 0.1, o.y + 0.25, z0 + sz - 0.1, col(0x141414)); // 輪胎/底盤
    } else if (o.kind === 'water_tower') {
      for (const [lx, lz] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) struct.box(x0 + sx * lx - 0.1, o.y, z0 + sz * lz - 0.1, x0 + sx * lx + 0.1, o.y + h * 0.5, z0 + sz * lz + 0.1, tint(cc, 0.7));
      struct.box(x0, o.y + h * 0.5, z0, x0 + sx, o.y + h, z0 + sz, cc);
    } else if (o.kind === 'statue' || o.kind === 'fountain') {
      struct.box(x0, o.y, z0, x0 + sx, o.y + 0.6, z0 + sz, tint(cc, 0.8));
      struct.box(o.x - 0.4, o.y + 0.6, o.z - 0.4, o.x + 0.4, o.y + h, o.z + 0.4, cc);
    } else struct.box(x0, o.y, z0, x0 + sx, o.y + h, z0 + sz, cc);
    world.addBox(o.x, o.z, sx, sz, h, o.y);
  }

  // ---- 地圖外的地面(避免遠景是虛空) ----
  const far = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x1c1e1c, roughness: 1 }));
  far.rotation.x = -Math.PI / 2;
  far.position.set(world.sizeX / 2, -0.03, world.sizeZ / 2);
  far.receiveShadow = true;
  group.add(far);

  // ---- 網格 ----
  const texCoarse = gridTexture(false), texFine = gridTexture(true);
  const mStruct = new THREE.MeshStandardMaterial({ map: texCoarse, vertexColors: true, roughness: 0.92, metalness: 0 });
  const mFloor = new THREE.MeshStandardMaterial({ map: texFine, vertexColors: true, roughness: 0.75, metalness: 0 });
  const mMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.7 });
  const mWater = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  for (const [b, m, shadow] of [[struct, mStruct, true], [floors, mFloor, false], [metal, mMetal, true], [water, mWater, false]]) {
    const mesh = b.mesh(m);
    if (!mesh) continue;
    mesh.castShadow = shadow;
    group.add(mesh);
  }

  // ---- 燈光:環境光 + 月光 + 固定數量的點光源池(依玩家位置挑最近的燈具) ----
  const hemi = new THREE.HemisphereLight(0xa8b4cc, 0x3a342c, 1.6);
  group.add(hemi);
  const moon = new THREE.DirectionalLight(0xa8b8e0, 1.3);
  moon.position.set(40, 80, 20);
  moon.target.position.set(60, 0, 50);
  group.add(moon, moon.target);
  const fixtures = [];
  for (const z of L.zones) {
    const kind = z.light;
    const color = LIGHT_COLOR[kind];
    if (color === undefined) continue;
    const li = z.levelIndex;
    for (const [c0, r0, c1, r1] of z.rects) {
      const w = c1 - c0 + 1, h = r1 - r0 + 1;
      const nx = Math.max(1, Math.round(w / 5)), nz = Math.max(1, Math.round(h / 5));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const c = Math.floor(c0 + ((i + 0.5) * w) / nx), r = Math.floor(r0 + ((j + 0.5) * h) / nz);
        const cy = L.ceilY(li, c, r);
        const y = Number.isFinite(cy) ? cy - 0.35 : L.levels[li].y + 4.5;
        fixtures.push({ x: (c + 0.5) * C, y, z: (r + 0.5) * C, li, color, flicker: kind === 'fluoro_dying' || kind === 'candle' || kind === 'fire' ? 1 : 0, ph: Math.random() * 10, d: 0 });
      }
    }
  }
  const pool = [];
  for (let i = 0; i < N_LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 16, 1.6);
    group.add(l);
    pool.push(l);
  }
  const assigned = new Array(N_LIGHTS).fill(null);
  let pickT = 0;
  const fogTarget = new THREE.Color(), tmpC = new THREE.Color();

  return {
    group,
    fixtures,
    update(time, dt, player) {
      if (!player) return;
      const p = player.pos;
      pickT -= dt || 0;
      if (pickT <= 0) { // 每 0.3 秒重新挑選最近的燈具(同層優先)
        pickT = 0.3;
        const li = L.levelOfY(p.y + 0.5);
        for (const f of fixtures) f.d = Math.hypot(f.x - p.x, f.z - p.z) + Math.abs(f.y - p.y - 2) * 2.5 + (f.li === li ? 0 : 12);
        fixtures.sort((a, b) => a.d - b.d);
        for (let i = 0; i < N_LIGHTS; i++) {
          const f = fixtures[i];
          assigned[i] = f || null;
          if (f) { pool[i].position.set(f.x, f.y, f.z); pool[i].color.setHex(f.color); }
        }
      }
      for (let i = 0; i < N_LIGHTS; i++) {
        const f = assigned[i];
        if (!f) { pool[i].intensity = 0; continue; }
        let k = 1;
        if (f.flicker) { const n = Math.sin(time * 17 + f.ph) * Math.sin(time * 5.3 + f.ph * 2); k = n > 0.6 ? 0.15 : n > 0.3 ? 0.65 : 1; }
        pool[i].intensity = 18 * k;
      }
      // 依所在區域的氛圍調整霧與背景(灰盒用較淡的霧以便看清楚)
      if (scene && scene.fog) {
        const zone = world.zoneAt(p.x, p.y, p.z);
        const mood = L.moods[zone ? zone.mood : L.levelDefault[L.levels[L.levelOfY(p.y)].id].mood] || L.moods.corridor;
        fogTarget.setHex(mood.fog);
        const a = Math.min(1, (dt || 0) * 2);
        scene.fog.color.lerp(fogTarget, a);
        if (scene.fog.density !== undefined) scene.fog.density += (mood.density * 0.4 - scene.fog.density) * a;
        if (scene.background && scene.background.isColor) scene.background.lerp(tmpC.copy(fogTarget).multiplyScalar(1.4), a);
        hemi.intensity += (1.1 + mood.ambient * 2.2 - hemi.intensity) * a;
      }
    },
  };
}
