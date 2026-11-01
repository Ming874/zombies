import { gurney, wheelchair, ivPole, oxygenCart, supplyCart, crashCart } from './medical.js';
import { bin, posterSheet, wallClock, corkBoard, chairShell } from './furniture.js';
import { janitorCart, wetFloorSign, extinguisher, bench, fireHoseCabinet, linenCart, floorSign, cardboardBox } from './decor.js';
import { poster, whiteboard } from './art.js';
import { scatter, floorDecal, wallDecal } from './clutter.js';
import { rotY, litter } from './lay.js';

// 走廊:靠牆的推床/輪椅/點滴架/清潔車/滅火器/告示/長椅/垃圾,中央保留通道(只靠牆放、深度 ≤ 0.8m)
export function dressCorridor(R, zone) {
  const psych = zone.mood === 'psych';
  const lv = R.L.levels[R.li].id;
  const gap = 0.12; // 讓出牆上扶手的空間
  // 地上靠牆的道具(權重)
  const floorPool = psych
    ? [[3, () => rotY(gurney({ seed: 2, sheet: true, rails: 'up', iv: false }))], [2, () => rotY(wheelchair(2))], [1, () => bench(1.6)], [2, () => bin('pedal', 1)], [1, () => rotY(supplyCart(1))], [1, () => wetFloorSign()]]
    : [[3, () => rotY(gurney({ seed: R.rng.int(0, 3), sheet: R.chance(0.6), rails: R.pick(['up', 'down', 'mixed']), bag: R.chance(0.3) }))], [2, () => rotY(wheelchair(R.rng.int(0, 2)))], [2, () => ivPole(R.rng.int(0, 2))],
      [1, () => rotY(janitorCart())], [2, () => bench(R.pick([1.2, 1.6]))], [3, () => bin(R.pick(['pedal', 'bio', 'office']), R.rng.int(0, 1))], [1, () => rotY(linenCart(R.rng.int(0, 2)))],
      [1, () => wetFloorSign()], [1, () => rotY(oxygenCart(2))], [1, () => rotY(crashCart(1))], [1, () => rotY(supplyCart(R.rng.int(0, 2)))], [1, () => cardboardBox(0.6, 0.45, 0.45, R.rng.int(0, 2), true)]];
  const total = floorPool.reduce((s, [w]) => s + w, 0);
  const pickPool = () => { let r = R.rng() * total; for (const [w, f] of floorPool) { if ((r -= w) <= 0) return f(); } return floorPool[0][1](); };
  let placed = 0;
  for (const run of R.walls) {
    if (run.len < 2.2) continue;
    let pos = run.t0 + R.rand(0.6, 3.5);
    while (pos < run.t1 - 1.0) {
      const t = pickPool();
      const w = t.bbox.max.x - t.bbox.min.x, d = t.bbox.max.z - t.bbox.min.z, h = t.bbox.max.y - t.bbox.min.y;
      if (pos + w > run.t1 - 0.3) break;
      if (d > 0.85 || (h > 0.9 && R.isWindow(run, pos, pos + w))) { pos += 1.0; continue; }
      const small = w < 0.7 && d < 0.6;
      const p = R.atWall(t, run, pos + w / 2, { gap, collide: small ? false : undefined });
      if (p) placed++;
      pos += w + R.rand(psych ? 4 : 2.5, psych ? 10 : 7);
    }
  }
  // 牆面:滅火器(約每 14m)、消防栓箱、告示、時鐘
  for (const run of R.walls) {
    if (run.len < 3) continue;
    for (let t = run.t0 + R.rand(1.5, 5); t < run.t1 - 1; t += R.rand(9, 16)) {
      if (R.isWindow(run, t - 0.4, t + 0.4)) continue;
      const k = R.rng();
      if (k < 0.35) R.atWall(extinguisher(), run, t, { mount: 1.0 });
      else if (k < 0.5 && !psych) { // [scene6] 加高的消防栓箱(上段綜合盤),下緣 0.42m:前面不能有靠牆的推床/長椅
        const a = R.at(run, t - 0.3, 0.2), b2 = R.at(run, t + 0.3, 0.2);
        if (R.freeAt(a.x, a.z) && R.freeAt(b2.x, b2.z)) { const p = R.atWall(fireHoseCabinet(), run, t, { mount: 0.42 }); if (p) R.mark(R.footprint(p.t.bbox, p.x, p.z, p.yaw, 0.02)); }
      }
      else if (k < 0.75) R.atWall(posterSheet(poster(R.pick(psych ? ['quiet', 'missing'] : ['handwash', 'quiet', 'blood', 'missing', 'kids'])), 0.38, 0.53, { curl: R.rand(0, 0.08) }), run, t, { mount: 1.3 });
      else if (k < 0.85) R.atWall(corkBoard(1.1, 0.75, R.rng.int(0, 5)), run, t, { mount: 1.15 });
      else R.atWall(wallClock(R.rng.int(0, 1)), run, t, { mount: 2.4 });
    }
  }
  // 地上雜物、血跡
  const area = R.cells.size;
  litter(R, [['paper', Math.round(area * 0.3)], ['paper2', Math.round(area * 0.12)], ['crumple', Math.round(area * 0.08)], ['debris', Math.round(area * 0.1)], ['shard', Math.round(area * 0.12)], ['cup', Math.round(area * 0.03)], ['butt', Math.round(area * 0.05)]]);
  if (!psych) litter(R, [['syringe', Math.round(area * 0.03)], ['gauze', Math.round(area * 0.04)], ['pillbottle', Math.round(area * 0.03)], ['glove', Math.round(area * 0.03)]]);
  if (lv === '1F') scatter(R, 'leaf', Math.round(area * 0.25));
  const cells = [...R.plain];
  for (let i = 0; i < Math.round(area / 9); i++) {
    const key = R.pick(cells), x = ((key % R.L.W) + R.rng()) * 2, z = (((key / R.L.W) | 0) + R.rng()) * 2;
    const kind = R.pick(psych ? ['water', 'dirt', 'drag', 'water'] : ['water', 'dirt', 'dirt', 'drag', 'smear', 'pool', 'feet', 'stain']);
    floorDecal(R, kind, x, z, kind === 'pool' ? R.rand(0.6, 1.1) : R.rand(0.9, 1.8));
  }
  for (const run of R.walls) if (run.len > 4 && R.chance(0.35)) wallDecal(R, run, R.rand(run.t0 + 0.5, run.t1 - 0.5), R.rand(0.9, 1.5), R.pick(psych ? ['scratch', 'hand', 'mold'] : ['hand', 'smear', 'mold', 'rust', 'drip']), R.rand(0.3, 0.6));
  R.count.wallProps = placed;
}

// 樓梯間:樓層牌、垃圾、卡在樓梯口旁的輪椅(只放不擋路的東西)
export function dressStairwell(R, zone) {
  const lv = R.L.levels[R.li].id;
  // 樓層牌:掛在平台的長牆上
  const runs = R.walls.filter((r) => r.len >= 2).sort((a, b) => b.len - a.len);
  if (runs[0]) R.atWall(floorSign(lv), runs[0], (runs[0].t0 + runs[0].t1) / 2, { mount: 1.55 });
  if (runs[1]) R.atWall(posterSheet(poster('missing'), 0.3, 0.42, { curl: 0.1 }), runs[1], runs[1].t0 + 0.8, { mount: 1.4 });
  // 樓梯口旁的輪椅(可推動):放在最靠近樓梯的可放格
  const st = R.L.stairs.find((s) => s.zone === zone.id || (s.lower === R.li && s.x0 >= R.c0 * 2 - 0.1 && s.x1 <= (R.c1 + 1) * 2 + 0.1 && s.z0 >= R.r0 * 2 - 2.1 && s.z1 <= (R.r1 + 1) * 2 + 2.1));
  const cells = [...R.plain];
  if (cells.length && (lv === '1F' || lv === '2F' || lv === 'B1')) {
    let best = null, bd = 1e9;
    for (const key of cells) {
      const x = ((key % R.L.W) + 0.5) * 2, z = (((key / R.L.W) | 0) + 0.5) * 2;
      const d = st ? Math.hypot(x - (st.x0 + st.x1) / 2, z - (st.z0 + st.z1) / 2) : 0;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    if (best) R.dyn(wheelchair(lv === 'B1' ? 2 : 1), best[0] + R.rand(-0.3, 0.3), best[1] + R.rand(-0.2, 0.2), R.rand(0, 6.28), { mass: 16, shape: 'box', friction: 0.5 });
  }
  litter(R, [['paper', 5], ['crumple', 3], ['cup', 2], ['butt', 6], ['debris', 4], ['shard', 4], ['can', 1]]);
  for (let i = 0; i < 2; i++) { const key = R.pick(cells); if (key == null) break; floorDecal(R, R.pick(['dirt', 'water', 'feet', 'drag']), ((key % R.L.W) + 0.5) * 2, (((key / R.L.W) | 0) + 0.5) * 2, R.rand(0.8, 1.4)); }
  if (runs[0] && R.chance(0.6)) wallDecal(R, runs[0], runs[0].t0 + R.rand(0.4, runs[0].len - 0.4), R.rand(0.3, 1.6), R.pick(['hand', 'smear', 'drip']), 0.35);
  void chairShell; void whiteboard;
}
