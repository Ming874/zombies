import { rng } from '../map/props/ctx.js';
import { makeApi } from './kinds/common.js';
import { phones, anchorPhone, phoneDirector } from './kinds/phones.js';
import { radio, handradio, carradio, tv, piano, musicbox, mobile, cassette, typewriter } from './kinds/media.js';
import { lightswitch, vending, elevator, lift, alarm, alarmBonus, pa, sink, nursecall, keypad, terminal, fusebox } from './kinds/machines.js';
import { locker, drawer, medcab, morgue, pickup, note, candle, fountain, snack } from './kinds/storage.js';
import { noteById } from './notes.js';
import { memorial, cctv } from './kinds/memorial.js'; // [story] 2F 護理站阿嬤的遺照與筊杯、3F 監控室的錄影機(推理本 / 擲筊)
import { Model, T, canvasTex, texMat, FONT } from './kit.js';

// 擺放:全部依 world.layout 的區域(theme/zone id)用每張地圖固定的種子挑位置,新地圖只要有區域就能用。
//  1) 劇情包(src/interact/packs/<map>.js)指定的物件:{ kind, zone, mount, near, ...參數 }
//  2) 依區域主題補一般的互動物件(THEME 表:開關、電話、販賣機、抽屜…)
//  3) 現有的錨點:電梯呼叫鈕(K.elevators)、道具事件的電話(propEvents 'phone')、聖母像(propEvents 'statue_mary')、停車場的車
// 位置檢查:可走的一般格、靠「實牆」、不貼著門(開關例外)、不和道具碰撞盒重疊、不擋路(落地物件前面要留一格可走)、
// 柱子(牆面配方 pilaster)的位置避開;同一格同一面牆只放一個。
const SIDES = { N: [0, -1, 0], S: [0, 1, Math.PI], W: [-1, 0, Math.PI / 2], E: [1, 0, -Math.PI / 2] };
// 各種類的佔位:mount、寬(沿牆)、深(離牆)、高度範圍
const FP = {
  phone: { mount: 'wall', w: 0.32, d: 0.14, y0: 1.1, y1: 1.7 }, 'phone:desk': { mount: 'floor', w: 0.56, d: 0.44, y0: 0, y1: 0.9 },
  'phone:nurse': { mount: 'floor', w: 2.0, d: 0.72, y0: 0, y1: 2.1, front: 1 }, 'phone:pay': { mount: 'wall', w: 0.8, d: 0.55, y0: 0.9, y1: 2.1 },
  switch: { mount: 'door', w: 0.1, d: 0.04, y0: 1.15, y1: 1.35 }, radio: { mount: 'surface', w: 0.6, d: 0.34, y0: 0.75, y1: 1.4 },
  tv: { mount: 'wall', w: 0.62, d: 0.5, y0: 1.6, y1: 2.5 }, vending: { mount: 'floor', w: 0.96, d: 0.9, y0: 0, y1: 1.9, front: 1 },
  piano: { mount: 'floor', w: 1.5, d: 1.12, y0: 0, y1: 1.3, front: 1 }, musicbox: { mount: 'surface', w: 0.5, d: 0.3, y0: 0.8, y1: 1.1 },
  mobile: { mount: 'floor', w: 1.06, d: 0.68, y0: 0, y1: 1.6 }, lift: { mount: 'floor', w: 2.4, d: 1.82, y0: 0, y1: 2.7, front: 1, wide: true },
  alarm: { mount: 'wall', w: 0.2, d: 0.12, y0: 1.2, y1: 2.45 }, pa: { mount: 'surface', w: 0.55, d: 0.34, y0: 0.8, y1: 1.3 },
  sink: { mount: 'floor', w: 0.6, d: 0.5, y0: 0, y1: 1.85 }, nursecall: { mount: 'wall', w: 0.15, d: 0.04, y0: 1.05, y1: 1.25 },
  keypad: { mount: 'door', w: 0.16, d: 0.05, y0: 1.2, y1: 1.42 }, terminal: { mount: 'floor', w: 0.96, d: 0.66, y0: 0, y1: 1.2 },
  fusebox: { mount: 'wall', w: 0.62, d: 0.18, y0: 0.8, y1: 1.95 }, locker: { mount: 'floor', w: 1.2, d: 0.5, y0: 0, y1: 1.8 },
  drawer: { mount: 'floor', w: 0.52, d: 0.5, y0: 0, y1: 0.85 }, medcab: { mount: 'wall', w: 0.52, d: 0.16, y0: 1.2, y1: 1.95 },
  morgue: { mount: 'floor', w: 2.25, d: 0.95, y0: 0, y1: 1.75, front: 1, wide: true }, cassette: { mount: 'surface', w: 0.5, d: 0.3, y0: 0.8, y1: 1.2 },
  typewriter: { mount: 'floor', w: 1.14, d: 0.7, y0: 0, y1: 1.1 }, candle: { mount: 'floor', w: 0.95, d: 0.55, y0: 0, y1: 1.1 },
  snack: { mount: 'surface', w: 0.3, d: 0.3, y0: 0.7, y1: 1 }, answering: { mount: 'surface', w: 0.3, d: 0.25, y0: 0.7, y1: 1.1 },
  pickup: { mount: 'floor', w: 0.3, d: 0.7, y0: 0, y1: 0.3, loose: true },
  'note:whiteboard': { mount: 'wall', w: 1.3, d: 0.08, y0: 0.95, y1: 1.9 }, 'note:poster': { mount: 'wall', w: 0.46, d: 0.02, y0: 1.25, y1: 1.85 },
  'note:drawing': { mount: 'wall', w: 0.42, d: 0.02, y0: 0.82, y1: 1.18 }, 'note:clipboard': { mount: 'wall', w: 0.26, d: 0.03, y0: 1.22, y1: 1.58 },
  note: { mount: 'surface', w: 0.42, d: 0.42, y0: 0, y1: 0.5 },
  memorial: { mount: 'surface', w: 0.6, d: 0.4, y0: 0.7, y1: 1.3 }, cctv: { mount: 'surface', w: 0.5, d: 0.4, y0: 0.7, y1: 1.2 },
};
const KINDS = { phone: phones, radio, handradio, carradio, tv, piano, musicbox, mobile, cassette, typewriter, switch: lightswitch, vending, lift, alarm, pa, sink, nursecall, keypad, terminal, fusebox, locker, drawer, medcab, morgue, pickup, note, logbook: note, candle, snack, memorial, cctv };
// 一般補充:每個主題 [種類, 機率, 參數]
const THEME = {
  ward: [['switch', 0.85], ['nursecall', 0.75], ['drawer', 0.55], ['sink', 0.25], ['medcab', 0.2], ['tv', 0.12]],
  peds_ward: [['switch', 0.9], ['nursecall', 0.8], ['drawer', 0.5], ['tv', 0.5]],
  nursery: [['mobile', 1], ['musicbox', 1], ['switch', 0.8], ['drawer', 0.4]],
  playroom: [['tv', 0.9], ['switch', 0.8], ['musicbox', 0.5], ['note', 0.6, { style: 'drawing' }]],
  corridor: [['phone', 0.5, { style: 'wall' }], ['alarm', 0.6], ['vending', 0.35], ['phone', 0.25, { style: 'wall' }]],
  waiting: [['tv', 1], ['vending', 1], ['phone', 0.7, { style: 'wall' }]],
  lobby: [['phone', 1, { style: 'pay' }], ['phone', 0.8, { style: 'pay' }], ['vending', 0.6]],
  er: [['phone', 1, { style: 'wall' }], ['medcab', 1], ['drawer', 0.6], ['alarm', 0.6], ['sink', 0.5]],
  office: [['phone', 1, { style: 'desk' }], ['typewriter', 0.8], ['drawer', 1], ['switch', 0.8], ['radio', 0.4]],
  director: [['phone', 1, { style: 'desk' }], ['typewriter', 0.6], ['drawer', 1], ['radio', 0.6], ['switch', 0.7]],
  security: [['phone', 1, { style: 'desk' }], ['radio', 1], ['pa', 0.7], ['tv', 0.6], ['locker', 0.6]],
  monitor: [['phone', 0.8, { style: 'desk' }], ['radio', 0.6], ['switch', 0.6]],
  chapel: [['piano', 1], ['candle', 1], ['radio', 0.5]],
  dorm: [['piano', 0.5], ['radio', 0.8], ['drawer', 1], ['sink', 0.5], ['switch', 0.6]],
  cafeteria: [['vending', 1], ['sink', 0.6], ['radio', 0.5], ['tv', 0.6], ['vending', 0.4]],
  morgue: [['phone', 0.6, { style: 'wall' }], ['sink', 0.6], ['drawer', 0.4], ['switch', 0.8]],
  autopsy: [['sink', 1], ['medcab', 0.7], ['cassette', 0.5], ['switch', 0.7]],
  laundry: [['locker', 1], ['sink', 0.6], ['radio', 0.4]],
  supply: [['locker', 0.8], ['drawer', 1], ['phone', 0.4, { style: 'wall' }]],
  archive: [['drawer', 1], ['typewriter', 0.7], ['locker', 0.5], ['switch', 0.7]],
  boiler: [['radio', 0.5], ['alarm', 0.6], ['phone', 0.5, { style: 'wall' }]],
  machine: [['alarm', 0.6], ['radio', 0.4], ['phone', 0.4, { style: 'wall' }]],
  pump: [['radio', 0.4], ['phone', 0.3, { style: 'wall' }]],
  psych_cell: [['nursecall', 0.35]],
  surgery: [['sink', 0.9], ['medcab', 0.6], ['phone', 0.5, { style: 'wall' }], ['switch', 0.6]],
  icu: [['sink', 0.7], ['medcab', 0.6], ['phone', 0.5, { style: 'wall' }], ['nursecall', 0.5]],
  delivery: [['sink', 0.8], ['medcab', 0.5], ['switch', 0.7]],
  pharmacy: [['medcab', 1], ['drawer', 1], ['phone', 0.6, { style: 'desk' }], ['medcab', 0.6]],
  rehab: [['radio', 0.6], ['tv', 0.6], ['sink', 0.4], ['switch', 0.7]],
  xray: [['switch', 0.9], ['phone', 0.5, { style: 'wall' }]], ct: [['switch', 0.9], ['phone', 0.4, { style: 'wall' }]],
  stairwell: [['alarm', 0.45], ['phone', 0.15, { style: 'wall' }]],
  dock: [['lift', 0.8], ['alarm', 0.5], ['phone', 0.5, { style: 'wall' }]], tunnel: [['alarm', 0.3], ['phone', 0.25, { style: 'wall' }]],
};

export function placeAll(game, ix, kit, pack, seed = 2077) {
  const R = rng(seed);
  const W = game.world, L = W.layout, H = game.hospital, faces = H?.K?.faces || [];
  const api = makeApi(game, ix, kit, R);
  Object.assign(api, { hosts: [], phones: [], usedLines: new Set(), own: [], noteObj: noteById, nurseBoard: null });
  api.signTex = (s, text, x, y, z, w, h) => { const m = new Model(); m.quad(texMat('sign:' + text, canvasTex('sign:' + text, 256, 48, (c, cw, ch) => { c.fillStyle = '#2e6b58'; c.fillRect(0, 0, cw, ch); c.fillStyle = '#f2efe4'; c.font = `bold 28px ${FONT}`; c.textAlign = 'center'; c.fillText(text, cw / 2, 34); }), { basic: true }), x, y, z, w, h); kit.static(m, api.mtx(s), s.li); };
  const used = new Set();
  const zones = new Map(L.zones.map((z) => [z.id, z]));
  const ch = (li, c, r) => L.charAt(li, c, r);
  const plain = (li, c, r) => '.,"~'.includes(ch(li, c, r));
  const isDoor = (li, c, r) => ch(li, c, r) === '+';
  const nearDoor = (li, c, r) => isDoor(li, c + 1, r) || isDoor(li, c - 1, r) || isDoor(li, c, r + 1) || isDoor(li, c, r - 1);
  const zoneOf = (li, c, r) => L.zoneAt(li, c, r);
  const cells = (z) => { const out = []; for (const [c0, r0, c1, r1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (plain(z.levelIndex, c, r) && zoneOf(z.levelIndex, c, r) === z) out.push([c, r]); return out; };
  // 道具碰撞盒重疊(含高度)
  const hitBox = (x0, z0, x1, z1, y0, y1) => {
    const c0 = Math.max(0, Math.floor(x0 / 2)), c1 = Math.min(W.W - 1, Math.floor(x1 / 2)), r0 = Math.max(0, Math.floor(z0 / 2)), r1 = Math.min(W.H - 1, Math.floor(z1 / 2));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const b of W.boxGrid[r * W.W + c]) {
      if (b.moveOnly) continue;
      if (b.maxX <= x0 || b.minX >= x1 || b.maxZ <= z0 || b.minZ >= z1 || b.maxY <= y0 || b.minY >= y1) continue;
      return true;
    }
    return false;
  };
  const pilaster = (li, dir, fixed, a) => faces.some((f) => f.li === li && f.dir === dir && Math.abs(f.fixed - fixed) < 1e-3 && a >= f.a0 - 0.5 && a <= f.a1 + 0.5 && f.recipe?.pilaster && (() => { const k = (((a - f.a0 - 2) % 4) + 4) % 4; return k < 0.5 || k > 3.5; })());
  // 牆面位置(along = 沿牆偏移)
  function wallSpot(z, c, r, side, along = 0) {
    const li = z.levelIndex, [dc, dr, yaw] = SIDES[side], y = L.levels[li].y;
    const x = (c + 0.5) * 2 + dc + (dr !== 0 ? along : 0), zz = (r + 0.5) * 2 + dr + (dc !== 0 ? along : 0);
    return { li, c, r, side, x, y, z: zz, yaw, nx: -dc, nz: -dr, zone: z, along };
  }
  function fits(s, fp, key) {
    const li = s.li, [dc, dr] = SIDES[s.side];
    if (ch(li, s.c + dc, s.r + dr) !== '#') return false; // 只靠實牆(不靠窗、電梯、欄杆)
    if (used.has(key)) return false;
    const fixed = dc ? (s.c + (dc > 0 ? 1 : 0)) * 2 : (s.r + (dr > 0 ? 1 : 0)) * 2;
    const a = dc ? s.z : s.x;
    if (pilaster(li, SIDES[s.side][0] ? (dc > 0 ? 'W' : 'E') : dr > 0 ? 'N' : 'S', fixed, a) && fp.d < 0.3) return false;
    // 世界 AABB:沿牆 ±w/2,離牆 0..d
    const off = fp.mount === 'floor' ? 0.02 : 0;
    const ax = s.nx === 0, w2 = fp.w / 2, d = fp.d + off;
    const x0 = ax ? s.x - w2 : Math.min(s.x, s.x + s.nx * d), x1 = ax ? s.x + w2 : Math.max(s.x, s.x + s.nx * d);
    const z0 = ax ? Math.min(s.z, s.z + s.nz * d) : s.z - w2, z1 = ax ? Math.max(s.z, s.z + s.nz * d) : s.z + w2;
    const y = L.levels[li].y;
    if (hitBox(x0 + 0.01, z0 + 0.01, x1 - 0.01, z1 - 0.01, y + fp.y0 + 0.02, y + fp.y1)) return false;
    // 沿牆超過這一格(寬的東西):旁邊那一格也要是同區的一般格、同一面也是實牆
    if (fp.w > 1.7 - Math.abs(s.along) * 2 || fp.wide) {
      const sc = ax ? Math.floor((s.x + Math.sign(s.along || 1) * (w2 + 0.01)) / 2) : s.c, sr = ax ? s.r : Math.floor((s.z + Math.sign(s.along || 1) * (w2 + 0.01)) / 2);
      if (!plain(li, sc, sr) || ch(li, sc + dc, sr + dr) !== '#') return false;
      if (fp.wide) { const oc = ax ? Math.floor((s.x - Math.sign(s.along || 1) * (w2 + 0.01)) / 2) : s.c, or = ax ? s.r : Math.floor((s.z - Math.sign(s.along || 1) * (w2 + 0.01)) / 2); if (!plain(li, oc, or) || ch(li, oc + dc, or + dr) !== '#') return false; }
    }
    if (fp.front) { const fc = s.c - dc, fr = s.r - dr; if (!plain(li, fc, fr) && !isDoor(li, fc, fr)) return false; if (hitBox(Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1, y + 0.05, y + 1.5) && fp.d > 0.5) return false; }
    return true;
  }
  const mark = (s, fp) => {
    used.add(`${s.li},${s.c},${s.r},${s.side}`);
    if (fp.mount === 'floor' || fp.w > 0.9) { used.add(`${s.li},${s.c},${s.r},*`); for (const k of Object.keys(SIDES)) used.add(`${s.li},${s.c},${s.r},${k}`); }
  };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // 候選位置:mount 'wall'/'floor' = 任一實牆;'door' = 門邊(開關、門禁鍵盤)
  function candidates(z, fp, o = {}) {
    const out = [], li = z.levelIndex;
    if (fp.mount === 'door') {
      for (const [c, r] of cells(z)) for (const side of Object.keys(SIDES)) {
        const [dc, dr] = SIDES[side];
        if (ch(li, c + dc, r + dr) !== '#') continue;
        for (const s2 of [-1, 1]) { // 牆線上旁邊那格是門 → 開關裝在靠門那一側
          const dcx = dr !== 0 ? s2 : 0, drz = dc !== 0 ? s2 : 0;
          if (isDoor(li, c + dc + dcx, r + dr + drz)) out.push(wallSpot(z, c, r, side, s2 * 0.62));
        }
      }
      if (!out.length && !o.strict) for (const [c, r] of cells(z)) for (const side of Object.keys(SIDES)) out.push(wallSpot(z, c, r, side, 0));
    } else {
      for (const [c, r] of cells(z)) {
        if (fp.mount !== 'wall' && nearDoor(li, c, r)) continue;
        for (const side of Object.keys(SIDES)) out.push(wallSpot(z, c, r, side, fp.w > 1.7 ? 0.0 : (R() - 0.5) * (1.8 - fp.w) * 0.5));
      }
    }
    if (o.near) { // 靠近某個區域(或那個區域的門)
      const nz = zones.get(o.near);
      if (nz) {
        const [c0, r0, c1, r1] = nz.rects[0], tx = (c0 + c1 + 1), tz = (r0 + r1 + 1);
        out.forEach((s) => { s.k = Math.hypot(s.x - tx, s.z - tz) + R() * 1.5; });
        return out.sort((a, b) => a.k - b.k);
      }
    }
    return shuffle(out);
  }
  function findSpot(z, fp, o) {
    for (const s of candidates(z, fp, o)) {
      const key = `${s.li},${s.c},${s.r},${s.side}`;
      if (fp.mount === 'floor' && used.has(`${s.li},${s.c},${s.r},*`)) continue;
      if (fits(s, fp, key)) { mark(s, fp); return s; }
    }
    return null;
  }
  // 沒有合適的牆:落地的東西改放在空地中央(四周都是一般格、碰撞盒周圍留 0.6m)
  function freeSpot(z, fp) {
    const li = z.levelIndex, y = L.levels[li].y;
    for (const [c, r] of shuffle(cells(z))) {
      if (used.has(`${li},${c},${r},*`)) continue;
      let open = true;
      for (let dr = -1; dr <= 1 && open; dr++) for (let dc = -1; dc <= 1; dc++) if (!plain(li, c + dc, r + dr) || zoneOf(li, c + dc, r + dr) !== z) { open = false; break; }
      if (!open) continue;
      const side = Object.keys(SIDES)[(R() * 4) | 0], [dc, dr, yaw] = SIDES[side];
      const cx = (c + 0.5) * 2, cz = (r + 0.5) * 2, half = Math.max(fp.w, fp.d) / 2 + 0.6;
      if (hitBox(cx - half, cz - half, cx + half, cz + half, y + 0.05, y + Math.max(1.2, fp.y1))) continue;
      const s = { li, c, r, side, x: cx + dc * fp.d / 2, y, z: cz + dr * fp.d / 2, yaw, nx: -dc, nz: -dr, zone: z, along: 0, free: true };
      used.add(`${li},${c},${r},*`); for (const k of Object.keys(SIDES)) used.add(`${li},${c},${r},${k}`);
      return s;
    }
    return null;
  }
  // 台面:先找同區(或指定 near)的護理站櫃台空位
  function hostSpot(z, o) {
    for (const h of api.hosts) {
      if (h.zone !== z && !(o.near && h.near === o.near)) continue;
      const slot = h.slots.find((q) => !q.used);
      if (!slot) continue;
      slot.used = true;
      return { ...h.s, host: { x: slot.x, y: slot.y, z: slot.z } };
    }
    return null;
  }
  const stats = { placed: 0, byKind: {}, failed: [] };
  function place(spec) {
    const z = zones.get(spec.zone);
    if (!z) { stats.failed.push(`${spec.id || spec.kind}:zone`); return null; }
    const kind = spec.kind === 'logbook' ? 'note' : spec.kind;
    const fk = kind === 'phone' && spec.style && spec.style !== 'wall' ? `phone:${spec.style}` : kind === 'note' && spec.style && FP['note:' + spec.style] ? 'note:' + spec.style : kind;
    let fp = { ...(FP[fk] || FP[kind] || FP.drawer) };
    if (spec.mount === 'wall' && fp.mount !== 'wall') fp = { ...fp, mount: 'wall' };
    let s = null;
    if (fp.mount === 'surface' || (kind === 'note' && !FP['note:' + spec.style]) || spec.kind === 'logbook' || kind === 'answering') s = hostSpot(z, spec);
    if (!s) s = findSpot(z, fp.mount === 'surface' ? { ...fp, mount: 'wall', y0: 0.7 } : fp, spec);
    if (!s && fp.mount === 'door') s = findSpot(z, { ...fp, mount: 'wall' }, spec);
    if (!s && fp.mount === 'floor' && !fp.wide) s = freeSpot(z, fp);
    if (!s) { stats.failed.push(`${spec.id || spec.kind}@${spec.zone}`); return null; }
    const K = kind === 'answering' ? ANSWERING : KINDS[kind];
    if (!K) { stats.failed.push(`${spec.kind}:kind`); return null; }
    try {
      const r = K.build(api, s, { ...spec, style: spec.kind === 'logbook' ? 'logbook' : spec.style });
      stats.placed++; stats.byKind[spec.kind] = (stats.byKind[spec.kind] || 0) + 1;
      return r;
    } catch (e) { console.warn('[interact] build', spec.kind, spec.id, e); stats.failed.push(`${spec.id || spec.kind}:err`); return null; }
  }
  const ANSWERING = answering();

  // ---- 1) 劇情包 ----
  const items = (pack?.items || []).filter((it) => it.kind !== 'lock' && !['elevator', 'fountain', 'carradio'].includes(it.kind));
  const order = (it) => (it.kind === 'phone' && it.style === 'nurse' ? 0 : FP[it.kind]?.mount === 'surface' || it.kind === 'logbook' || it.kind === 'answering' || (it.kind === 'note' && !['whiteboard', 'poster', 'drawing', 'clipboard'].includes(it.style)) ? 2 : 1);
  for (const it of items.slice().sort((a, b) => order(a) - order(b))) place(it);
  // ---- 2) 依主題補 ----
  for (const z of L.zones) for (const [kind, p, extra] of THEME[z.theme] || []) if (R() < p) place({ kind, zone: z.id, ...(extra || {}) });
  // ---- 3) 錨點 ----
  for (const el of H?.K?.elevators || []) if (el.button) { try { elevator.build(api, el); stats.placed++; stats.byKind.elevator = (stats.byKind.elevator || 0) + 1; } catch (e) { console.warn('[interact] elevator', e); } }
  for (const ev of H?.propEvents || []) {
    if (ev.kind === 'phone') { anchorPhone(api, ev); stats.byKind.anchorPhone = (stats.byKind.anchorPhone || 0) + 1; }
    if (ev.kind === 'statue_mary') { const f = (pack?.items || []).find((q) => q.kind === 'fountain') || {}; fountain.build(api, ev, f); stats.byKind.fountain = 1; }
  }
  for (const it of (pack?.items || []).filter((q) => q.kind === 'carradio')) { const z = zones.get(it.zone); if (z && carradio.build(api, { zone: z, li: z.levelIndex }, it)) stats.byKind.carradio = 1; }
  api.director = phoneDirector(api);
  alarmBonus(api);
  ix.phones = api.phones;
  ix.ring = (id) => api.director.ring(id); // 讓某支電話響(id 省略 = 任一支閒著的)
  ix.ringAt = (pos, dur) => api.director.ringAt(pos, dur); // 讓 pos 旁邊那支真的電話響(驚嚇事件用);沒有電話回傳 false
  ix.ringFar = (a, b, gap) => api.director.ringFar(a, b, gap); // 讓同層 a~b 公尺外的一支電話響(環境音「遠處電話」用)
  return { api, stats };
}

// 答錄機:放在護理站櫃台,紅燈閃 = 有留言
function answering() {
  return {
    build(api, s, spec = {}) {
      const { kit, M, ix, ixs } = api;
      const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z, -0.3) : api.mtx(s, 0, 0.95, 0.15);
      const m = new Model();
      if (!s.host) { const sh = new Model(); sh.slab(M.wood, 0x6b5a46, 0, 0.925, 0.16, 0.45, 0.025, 0.3); kit.static(sh, api.mtx(s), s.li); }
      m.slab(M.plastic, 0x2a2a2c, 0, 0, 0, 0.22, 0.05, 0.16);
      m.box(M.matte, 0x111111, -0.04, 0.052, 0, 0.1, 0.004, 0.08);
      for (let i = 0; i < 4; i++) m.box(M.plastic, 0x777777, 0.06, 0.052, -0.04 + i * 0.025, 0.04, 0.008, 0.016);
      kit.static(m, L, s.li);
      const led = kit.pool('led', (q) => { q.box(M.led, 0xffffff, 0, 0, 0, 1, 1, 1); }, M.led);
      const li = led.add(s.li, L.clone().multiply(T(0.09, 0.054, 0.06, 0, 0, 0, 0.012, 0.006, 0.012)), 0xff2010);
      const q = L.elements, v = { x: q[12], y: q[13] + 0.05, z: q[14] };
      const st = { blink: null, played: false, talk: null };
      st.blink = ix.tick(() => { if (st.played) return false; led.color(li, (api.game.time * 1.6) % 1 < 0.5 ? 0xff2010 : 0x220404); return true; });
      return ix.register(v, {
        id: spec.id || 'voicemail', kind: 'answering', name: '答錄機', reach: 1.9, radius: 0.14, scope: 'map', cooldown: 1,
        prompt: () => (st.talk ? '停止播放' : st.played ? '再聽一次留言' : '播放留言（紅燈在閃）'),
        onUse: () => {
          if (st.talk) { st.talk.stop(); st.talk = null; ixs.tapeLine(false); return; }
          st.played = true; led.color(li, 0x220404);
          ixs.switchClick(v, true);
          const l = api.lineById(spec.message) || api.lineList('PHONE.voicemail')[0];
          ixs.tapeLine(true);
          api.say('', '（嗶——）', 1200);
          ix.after(1.2, () => { st.talk = l ? api.speak(l, { filter: 'phone', pos: v }) : null; ix.after((st.talk?.dur || 1) + 0.5, () => { ixs.tapeLine(false); st.talk = null; }); });
          ix.flags.set('h.ev.voicemail', true);
          ix.emit('voicemail', l);
        },
        reset: () => { st.played = false; st.talk?.stop(); st.talk = null; st.blink ||= ix.tick(() => { if (st.played) { st.blink = null; return false; } led.color(li, (api.game.time * 1.6) % 1 < 0.5 ? 0xff2010 : 0x220404); return true; }); },
      });
    },
  };
}
