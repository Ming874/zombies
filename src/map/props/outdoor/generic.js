import { rng as mkRng } from '../ctx.js';
import { Parts, put, solid, edgeInfo, HALF, TAU } from './kit.js';
import { groundDecal } from './cars.js';
import { flatDecal, trashBag } from './industrial.js';
import { cone } from './street.js';
import { tomb, brokenSlab, epitaph } from './monuments.js';
import { BAND, line, stalls, manhole, litter, leafLine, leafPatch, tarCrack, puddle, wallStrip, mark } from './ground.js';
import { tree, tuftLine, tuftPatch, shrub, ivy } from './nature.js';
import { swingSet, slide, merryGoRound, seesaw, springRider, sandbox } from './play.js';
import { tent, bodyBag, ivStand, o2Tank, bioBin } from './camp.js';
import { bench, bollard, trashCan, barrel, crate, tyre, lamp, wallLamp, cart, pallet, planter } from './furniture.js';

// 通用戶外擺設:只看區域形狀(rects)與格子旗標,任何地圖都能用(夜市、老街…)。
// 醫院地圖的手工場景(themes.js 的 SETPIECES)只在區域 id 與範圍都吻合時才用,其餘一律走這裡。
const C2 = 2;
export const zrng = (zone, salt = '') => { let h = 2166136261; for (const ch of zone.id + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return mkRng(h >>> 0); };
export function freeRect(ctx, li, x0, z0, x1, z1, nearDoorOk = false) {
  for (let c = Math.floor(x0 / C2); c <= Math.floor((x1 - 1e-3) / C2); c++) for (let r = Math.floor(z0 / C2); r <= Math.floor((z1 - 1e-3) / C2); r++) {
    if (!ctx.isPlain(li, c, r) || ctx.occupied(li, c, r)) return false;
    if (!nearDoorOk && ctx.nearDoor(li, c, r)) return false;
  }
  return true;
}
export const freeAt = (ctx, li, x, z, rx = 0.6, rz = rx) => freeRect(ctx, li, x - rx, z - rz, x + rx, z + rz);
export const finish = (ctx, P) => { if (P.map.size) put(ctx, P, 0, 0, 0); };
const yOf = (ctx, zone) => ctx.L.levels[zone.levelIndex].y;

// ---------- 邊緣處理:靠牆/圍籬的每格加牆腳污垢、落葉、雜草、垃圾、枯藤 ----------
export function edgeDress(ctx, zone, R, P, o = {}) {
  const L = ctx.L, li = zone.levelIndex, y = L.levels[li].y;
  const leaves = o.leaves ?? 7, ivyP = o.ivy ?? 0.12, grime = o.grime ?? true, tufts = o.tufts ?? 2, litterP = o.litter ?? 0.25;
  for (const [c0, r0, c1, r1] of zone.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!(L.flagsAt(li, c, r) & L.F.WALK) || L.charAt(li, c, r) === '+') continue;
    const x = c * C2, z = r * C2;
    for (const e of edgeInfo(ctx, li, c, r)) {
      if (e.door) continue;
      const nch = L.charAt(li, c + e.dc, r + e.dr);
      if ('^v<>%o_'.includes(nch)) continue;
      let ax, az, bx, bz;
      if (e.dr === -1) { ax = x; az = z; bx = x + C2; bz = z; } else if (e.dr === 1) { ax = x; az = z + C2; bx = x + C2; bz = z + C2; } else if (e.dc === -1) { ax = x; az = z; bx = x; bz = z + C2; } else { ax = x + C2; az = z; bx = x + C2; bz = z + C2; }
      const nx = -e.dc, nz = -e.dr, off = e.fence ? 0.25 : 0.12;
      const lx0 = ax + nx * off, lz0 = az + nz * off, lx1 = bx + nx * off, lz1 = bz + nz * off;
      if (e.wall && grime) wallStrip(P, BAND.grime, ax, az, bx, bz, y, R.range(0.5, 1.1), nx, nz);
      if (e.wall && R() < ivyP) ivy(P, (ax + bx) / 2 + R.range(-0.4, 0.4) * (bx - ax !== 0 ? 1 : 0), y, (az + bz) / 2 + R.range(-0.4, 0.4) * (bz - az !== 0 ? 1 : 0), Math.atan2(nx, nz), R.range(1.1, 2.0), R.range(1.6, 3.2), R() < 0.5);
      if (leaves) leafLine(P, R, lx0, lz0, lx1, lz1, 0.5, R.int(leaves >> 1, leaves), y + 0.012);
      if (tufts && R() < 0.75) tuftLine(ctx, R, lx0, lz0, lx1, lz1, y, R.int(1, tufts), { jitter: 0.25, dryP: 0.65 });
      if (R() < litterP) litter(P, R, (lx0 + lx1) / 2 + nx * 0.2, (lz0 + lz1) / 2 + nz * 0.2, 0.7, R.int(1, 3), undefined, y + 0.009);
      if (e.wall && R() < (o.stain ?? 0.08)) flatDecal(P, R.pick(['rustrun', 'drip', 'mud', 'moss']), (ax + bx) / 2 + nx * 0.013, y + R.range(0.6, 1.6), (az + bz) / 2 + nz * 0.013, R.range(0.6, 1.1), R.range(0.8, 1.6), nx > 0.5 ? 'x+' : nx < -0.5 ? 'x-' : nz > 0.5 ? 'z+' : 'z-');
    }
  }
}
// ---------- 地面散布:落葉、垃圾、裂縫、水窪、雜草、污漬 ----------
export function scatter(ctx, zone, R, P, { leaves = 0.25, litter: lp = 0.15, cracks = 0, puddles = 0, tufts = 0, stains = 0.06, kinds } = {}) {
  const y = yOf(ctx, zone);
  for (const cell of ctx.cells(zone, { allowNearDoor: true })) {
    if (R() < leaves) leafPatch(P, R, cell.x + R.range(-0.6, 0.6), cell.z + R.range(-0.6, 0.6), R.range(0.3, 0.9), R.int(2, 7), y + 0.011);
    if (R() < lp) litter(P, R, cell.x, cell.z, 0.9, R.int(1, 3), kinds, y + 0.009);
    if (R() < cracks) tarCrack(P, R, cell.x + R.range(-0.8, 0.8), cell.z + R.range(-0.8, 0.8), R.range(2, 7));
    if (R() < puddles) puddle(P, R, cell.x + R.range(-0.5, 0.5), cell.z + R.range(-0.5, 0.5), R.range(0.35, 0.8), R.range(0.8, 1.6), R.range(0.6, 1.1), y + 0.004);
    if (R() < tufts) tuftPatch(ctx, R, cell.x, cell.z, y, 0.8, R.int(1, 3));
    if (R() < stains) groundDecal(P, R.pick(['oil', 'water', 'stain2', 'mud', 'water2']), cell.x + R.range(-0.5, 0.5), cell.z + R.range(-0.5, 0.5), R.range(0.8, 1.8), R.range(0.8, 1.8), R() * TAU, y + 0.005);
  }
}
// 牆邊的格子(含朝向):用來放長椅、垃圾桶、壁燈
function wallCells(ctx, zone, R) {
  const out = [];
  for (const s of ctx.wallSpots(zone)) out.push(s);
  for (let i = out.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
// 找一塊 w×d 格的空地(回傳左上格)
function freeBlock(ctx, zone, R, w, d, tries = 60) {
  const li = zone.levelIndex;
  for (let k = 0; k < tries; k++) {
    const [c0, r0, c1, r1] = zone.rects[(R() * zone.rects.length) | 0];
    if (c1 - c0 + 1 < w || r1 - r0 + 1 < d) continue;
    const c = c0 + ((R() * (c1 - c0 + 2 - w)) | 0), r = r0 + ((R() * (r1 - r0 + 2 - d)) | 0);
    if (freeRect(ctx, li, c * C2, r * C2, (c + w) * C2, (r + d) * C2)) return { c, r, x: (c + w / 2) * C2, z: (r + d / 2) * C2 };
  }
  return null;
}

// ======================================================================
// 各主題的通用版
// ======================================================================
export const GENERIC = {
  parking(ctx, zone) {
    const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = yOf(ctx, zone);
    for (const [c0, r0, c1, r1] of zone.rects) {
      const w = (c1 - c0 + 1) * C2, d = (r1 - r0 + 1) * C2, x0 = c0 * C2, z0 = r0 * C2;
      if (Math.min(w, d) < 6) continue;
      if (w >= d) { // 沿 x 的兩排停車格(上下兩邊,車頭朝外)
        stalls(P, x0 + 1, x0 + w - 1, z0 + 0.4, Math.min(5.2, d / 2 - 1.5), 1, 2.7, { R });
        if (d >= 14) stalls(P, x0 + 1, x0 + w - 1, z0 + d - 0.4, 5.2, -1, 2.7, { num0: 50, R });
        for (let x = x0 + 8; x < x0 + w - 4; x += 18) if (freeAt(ctx, li, x, z0 + d / 2, 0.3)) lamp(ctx, x, y, z0 + d / 2, R() < 0.5 ? HALF : -HALF, R.pick(['on', 'on', 'flicker', 'dead']), { zone });
      } else {
        for (let z = z0 + 8; z < z0 + d - 4; z += 18) if (freeAt(ctx, li, x0 + w / 2, z, 0.3)) lamp(ctx, x0 + w / 2, y, z, 0, R.pick(['on', 'flicker', 'dead']), { zone });
      }
      for (let k = 0; k < (w * d) / 60; k++) tarCrack(P, R, x0 + R() * w, z0 + R() * d, R.range(2, 6), R() * TAU, [x0, z0, x0 + w, z0 + d]);
      for (let k = 0; k < (w * d) / 250; k++) { const x = x0 + R.range(2, w - 2), z = z0 + R.range(2, d - 2); if (freeAt(ctx, li, x, z, 0.4)) manhole(ctx, x, y, z, R() * TAU); }
    }
    for (let k = 0; k < 3; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) cart(ctx, b.x + R.range(-0.4, 0.4), y, b.z, R() * TAU, R() < 0.4); }
    for (let k = 0; k < 4; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) cone(ctx, b.x, y, b.z, R() * TAU, R() < 0.4); }
    edgeDress(ctx, zone, R, P, { leaves: 7, tufts: 3, litter: 0.3 });
    scatter(ctx, zone, R, P, { leaves: 0.15, litter: 0.08, puddles: 0.06, stains: 0.08 });
    finish(ctx, P);
  },
  plaza(ctx, zone) {
    const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = yOf(ctx, zone);
    let nb = 0, nt = 0, nl = 0;
    for (const s of wallCells(ctx, zone, R)) {
      if (ctx.occupied(li, s.c, s.r)) continue;
      const k = R();
      if (k < 0.12 && nb < 6) { bench(ctx, s.x + s.nx * 0.4, y, s.z + s.nz * 0.4, s.yaw); nb++; }
      else if (k < 0.2 && nt < 5) { trashCan(ctx, s.x + s.nx * 0.45, y, s.z + s.nz * 0.45, { rust: R() < 0.5 }); nt++; }
      else if (k < 0.27 && nl < 6) { wallLamp(ctx, s.x + s.nx * 0.01, y + 3.0, s.z + s.nz * 0.01, s.yaw, R.pick(['on', 'flicker', 'dead']), zone); nl++; }
    }
    for (let k = 0; k < 2; k++) { const b = freeBlock(ctx, zone, R, 2, 1); if (b) { const top = planter(ctx, P, b.x, y, b.z, 2.4, 1.1); shrub(ctx, b.x, top, b.z, 0.9); } }
    for (let k = 0; k < 4; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) lamp(ctx, b.x, y, b.z, 0, R.pick(['on', 'dead', 'flicker']), { kind: 'short', zone }); }
    edgeDress(ctx, zone, R, P, { leaves: 9, ivy: 0.18, litter: 0.3 });
    scatter(ctx, zone, R, P, { leaves: 0.22, litter: 0.14, puddles: 0.03 });
    finish(ctx, P);
  },
  alley(ctx, zone) {
    const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = yOf(ctx, zone);
    let nl = 0;
    for (const s of wallCells(ctx, zone, R)) {
      if (ctx.occupied(li, s.c, s.r)) continue;
      const k = R(), x = s.x + s.nx * 0.5, z = s.z + s.nz * 0.5;
      if (k < 0.1) for (let j = 0; j < R.int(2, 5); j++) trashBag(ctx, x + R.range(-0.7, 0.7) * Math.abs(s.nz), y, z + R.range(-0.7, 0.7) * Math.abs(s.nx), R() * TAU, R.range(0.85, 1.15));
      else if (k < 0.14) barrel(ctx, x, y, z, { fallen: R() < 0.3, yaw: R() * TAU });
      else if (k < 0.17) crate(ctx, x, y, z, s.yaw);
      else if (k < 0.2) pallet(P, x, y, z, s.yaw, R.int(1, 4), R);
      else if (k < 0.22) tyre(ctx, x, y, z, true);
      else if (k < 0.27 && nl < 6) { wallLamp(ctx, s.x + s.nx * 0.01, y + 3.0, s.z + s.nz * 0.01, s.yaw, R.pick(['on', 'flicker', 'dead', 'on']), zone); nl++; }
      if (R() < 0.08) flatDecal(P, R.pick(['g_help', 'g_dont', 'g_eye', 'g_tally', 'g_still']), s.x + s.nx * 0.013, y + R.range(1.3, 1.9), s.z + s.nz * 0.013, 2.4, 1.2, s.nx > 0.5 ? 'x+' : s.nx < -0.5 ? 'x-' : s.nz > 0.5 ? 'z+' : 'z-');
    }
    edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.2, litter: 0.45, stain: 0.18 });
    scatter(ctx, zone, R, P, { leaves: 0.15, litter: 0.2, puddles: 0.08, cracks: 0.1, stains: 0.08 });
    finish(ctx, P);
  },
  playground(ctx, zone) {
    const R = zrng(zone), P = new Parts(), y = yOf(ctx, zone);
    const items = [[3, 2, (b) => swingSet(ctx, b.x, y, b.z, 0)], [3, 3, (b) => slide(ctx, b.x, y, b.z - 1.2, 0)], [2, 2, (b) => merryGoRound(ctx, b.x, y, b.z)], [2, 1, (b) => seesaw(ctx, b.x, y, b.z, 0)], [2, 2, (b) => sandbox(ctx, b.x, y, b.z, R)], [1, 1, (b) => springRider(ctx, b.x, y, b.z, R() * TAU, 'horse')], [1, 1, (b) => springRider(ctx, b.x, y, b.z, R() * TAU, 'duck')]];
    for (const [w, d, fn] of items) { const b = freeBlock(ctx, zone, R, w, d); if (b) fn(b); }
    edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.3, tufts: 4, litter: 0.15 });
    scatter(ctx, zone, R, P, { leaves: 0.3, tufts: 0.4, litter: 0.05 });
    finish(ctx, P);
  },
  cemetery(ctx, zone) {
    const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = yOf(ctx, zone);
    const kinds = ['slab', 'slab', 'cross', 'chinese', 'obelisk', 'ledger', 'broken'];
    let epi = 0;
    for (const cell of ctx.cells(zone)) {
      if (R() < 0.35 || !freeAt(ctx, li, cell.x, cell.z, 0.45)) continue;
      const k = R.pick(kinds), yaw = R.pick([0, HALF, Math.PI, -HALF]) + R.range(-0.1, 0.1);
      if (k === 'broken') brokenSlab(ctx, cell.x, y, cell.z, yaw); else tomb(ctx, k, cell.x, y, cell.z, yaw, k === 'ledger' ? [0, 0] : [R.range(-0.12, 0.12), R.range(-0.1, 0.1)]);
      if (k === 'slab') epitaph(P, epi++, cell.x, y, cell.z, yaw, 0.42, 0.42, 0.52, 0.065);
      solid(ctx, cell.x, y, cell.z, 0.7, k === 'obelisk' ? 2.0 : 1.0, 0.7, 'stone');
    }
    for (let k = 0; k < 3; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) tree(ctx, R.pick(['gnarl', 'snag', 'oak']), b.x, y, b.z, R.range(0.9, 1.2), R() * TAU); }
    edgeDress(ctx, zone, R, P, { leaves: 9, ivy: 0.35, tufts: 4, litter: 0.05 });
    scatter(ctx, zone, R, P, { leaves: 0.4, tufts: 0.5, litter: 0.02 });
    finish(ctx, P);
  },
  yard(ctx, zone) {
    const R = zrng(zone), P = new Parts(), y = yOf(ctx, zone);
    for (let k = 0; k < 8; k++) {
      const b = freeBlock(ctx, zone, R, 1, 1);
      if (!b) continue;
      const t = R();
      if (t < 0.25) barrel(ctx, b.x, y, b.z, { yaw: R() * TAU }); else if (t < 0.45) tyre(ctx, b.x, y, b.z, true); else if (t < 0.65) pallet(P, b.x, y, b.z, R() * TAU, R.int(1, 3), R); else if (t < 0.85) shrub(ctx, b.x, y, b.z, R.range(0.8, 1.3)); else tree(ctx, R.pick(['snag', 'oak']), b.x, y, b.z, R.range(0.8, 1.1), R() * TAU);
    }
    edgeDress(ctx, zone, R, P, { leaves: 7, ivy: 0.3, tufts: 4, litter: 0.3 });
    scatter(ctx, zone, R, P, { leaves: 0.25, litter: 0.08, tufts: 0.35, puddles: 0.06 });
    finish(ctx, P);
  },
  ambulance_bay(ctx, zone) {
    const R = zrng(zone), P = new Parts(), li = zone.levelIndex, y = yOf(ctx, zone);
    for (const [c0, r0, c1, r1] of zone.rects) {
      const x0 = c0 * C2, z0 = r0 * C2, x1 = (c1 + 1) * C2, z1 = (r1 + 1) * C2;
      if (x1 - x0 < z1 - z0) { line(P, BAND.yellow, x0 + 1.2, z0 + 0.5, x0 + 1.2, z1 - 0.5); line(P, BAND.yellow, x1 - 1.2, z0 + 0.5, x1 - 1.2, z1 - 0.5); }
      else { line(P, BAND.yellow, x0 + 0.5, z0 + 1.2, x1 - 0.5, z0 + 1.2); line(P, BAND.yellow, x0 + 0.5, z1 - 1.2, x1 - 0.5, z1 - 1.2); }
      mark(P, 'p_amb', (x0 + x1) / 2, (z0 + z1) / 2, 2.2, 2.2, 0, y + 0.011);
    }
    const t = freeBlock(ctx, zone, R, 3, 2);
    if (t) tent(ctx, t.x, y, t.z, 0, { sign: 'triage', rng: R });
    for (let k = 0; k < 5; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) bodyBag(ctx, b.x, y, b.z, R() * TAU); }
    for (let k = 0; k < 3; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (!b) continue; const q = R(); if (q < 0.33) ivStand(ctx, b.x, y, b.z, R() < 0.5); else if (q < 0.66) o2Tank(ctx, b.x, y, b.z, R() < 0.5); else bioBin(ctx, b.x, y, b.z, R() * TAU); }
    for (const s of wallCells(ctx, zone, R).slice(0, 6)) if (!ctx.occupied(li, s.c, s.r) && R() < 0.4) bollard(ctx, s.x + s.nx * 0.7, y, s.z + s.nz * 0.7);
    edgeDress(ctx, zone, R, P, { leaves: 6, tufts: 3, litter: 0.3 });
    scatter(ctx, zone, R, P, { leaves: 0.12, litter: 0.12, puddles: 0.06, stains: 0.08, cracks: 0.05 });
    finish(ctx, P);
  },
  courtyard(ctx, zone) {
    const R = zrng(zone), P = new Parts(), y = yOf(ctx, zone);
    for (let k = 0; k < 5; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) tree(ctx, R.pick(['oak', 'gnarl', 'oak']), b.x, y, b.z, R.range(0.9, 1.2), R() * TAU); }
    for (let k = 0; k < 4; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) bench(ctx, b.x, y, b.z, R.pick([0, HALF, Math.PI, -HALF])); }
    for (let k = 0; k < 4; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) lamp(ctx, b.x, y, b.z, 0, R.pick(['dead', 'flicker', 'on']), { kind: 'short', zone }); }
    for (let k = 0; k < 14; k++) { const b = freeBlock(ctx, zone, R, 1, 1, 10); if (b) shrub(ctx, b.x + R.range(-0.5, 0.5), y, b.z + R.range(-0.5, 0.5), R.range(0.6, 1.0)); }
    edgeDress(ctx, zone, R, P, { leaves: 6, ivy: 0.45, tufts: 3, litter: 0.1 });
    scatter(ctx, zone, R, P, { leaves: 0.45, tufts: 0.5, litter: 0.04 });
    finish(ctx, P);
  },
  rooftop(ctx, zone) {
    const R = zrng(zone), P = new Parts(), y = yOf(ctx, zone);
    for (let k = 0; k < 6; k++) { const b = freeBlock(ctx, zone, R, 1, 1); if (b) barrel(ctx, b.x, y, b.z, { yaw: R() * TAU }); }
    edgeDress(ctx, zone, R, P, { leaves: 3, ivy: 0, tufts: 2, litter: 0.2 });
    scatter(ctx, zone, R, P, { leaves: 0.06, litter: 0.06, tufts: 0.05, stains: 0.12, puddles: 0.08 });
    finish(ctx, P);
  },
};
