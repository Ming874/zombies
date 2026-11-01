import { tpl } from './parts.js';
import { hospitalBed, bedTags, nightstand, ivPole, headwall, curtainSet, overbedTable, wheelchair } from './medical.js';
import { chairShell, sinkWall, lockers, bin, posterSheet, wallClock, framed } from './furniture.js';
import { poster, calendar } from './art.js';
import { scatter, onSurface, floorDecal, wallDecal } from './clutter.js';
import { rng as mkRng } from '../ctx.js';
import { dress207 } from './w207.js';
import { wardStory } from './story.js';
import { wardStory2 } from './story5.js';
import { bedside } from './services.js';

// 病房 201-210:刻意幾乎一模一樣(迷失感)。床頭靠東西兩側牆、每床有隔簾/床頭櫃/氧氣面板/點滴架。
// 207:一張床上有蓋白布的人形(而且只有這間的燈是正常的)。204:所有床被推到牆角堆疊。
export function dressWard(R, zone) {
  const n = +zone.id.split('_').pop();
  R.rng = mkRng(0x2071); // 所有病房同一個亂數種子 → 擺設幾乎相同
  const ceil = R.L.ceilY(R.li, R.c0, R.r0) - R.y;
  if (n === 204) return pushedToCorner(R, ceil, n);
  if (n === 207) return dress207(R, zone, ceil); // [scene r4] 阿嬤守了十四暝的房間(w207.js)
  const W = R.run('W'), E = R.run('E');
  const z0 = R.r0 * 2, x0 = R.c0 * 2;
  const bays = [];
  for (const [run, side] of [[W, -1], [E, 1]]) {
    if (!run) continue;
    for (const [k, bz] of [[0, z0 + 1.25], [1, z0 + 5.05]]) {
      const id = side * 10 + k;
      const kind = n === 207 && id === 11 ? 'body' : id === -10 ? 'stripped' : id === 1 ? 'messy' : 'made';
      const bed = hospitalBed({ kind, head: kind === 'messy' ? 0.5 : 0, rail: id === 11 ? 'up' : 'mixed', seed: k + (side > 0 ? 1 : 0) });
      const p = R.atWall(bed, run, bz, { gap: 0.03 });
      if (!p) continue;
      const bedNo = n * 10 + bays.length + 1;
      bedTags(R, p, bedNo);
      bedside(R, p, k + (side > 0 ? 1 : 0), kind); // [scene6] 叫人鈴、床下臉盆、藍白拖、床尾毛巾
      bays.push({ p, run, bz, side, kind, id });
      // 床頭櫃 + 上面的東西
      const ns = R.atWall(nightstand(k + 1), run, bz - 0.78, { gap: 0.04 });
      bays[bays.length - 1].ns = ns;
      if (ns) {
        const top = R.topOf(ns, 0);
        onSurface(R, top, 'cup', 1);
        onSurface(R, top, k ? 'pillbottle' : 'pillbottle2', 1 + (k % 2));
        if (n !== 207) onSurface(R, top, ['mug', 'book', 'bottle', 'tray'][(n + k + (side > 0 ? 2 : 0)) % 4], 1); // [scene6] 病人自己的東西
      }
      R.atWall(headwall(1.3, k), run, bz, { mount: 1.32 });
      // 隔簾(U 形軌道,有的拉上、有的收在牆邊)
      const wx = run.plane, dx = -side;
      const path = [[wx, bz - 0.62], [wx + dx * 2.3, bz - 0.62], [wx + dx * 2.3, bz + 0.62], [wx, bz + 0.62]].map(([x, z]) => [x - x0, z - z0]);
      const bunch = n === 207 && id === 11 ? 0.05 : [0.75, 0.25, 0.85, 0.5][(k + (side > 0 ? 2 : 0)) % 4];
      R.put(tpl(`curtain:${id}:${bunch}:${n === 207}`, (b) => curtainSet(b, path, ceil, { seed: 40 + id + (n === 207 ? 3 : 0), bunch, holes: id === -10 ? 1 : 0.3, rag: 0.4 })), x0, z0, 0);
      if (bunch < 0.52) R.event({ kind: 'bed_curtain', x: wx + dx * 2.3, y: R.y + 0.05, z: bz, nx: dx, nz: 0 }); // [ghost] 拉上的隔簾:隔簾後的人影(src/horror)
      // 點滴架(靜態;床頭旁)
      if (k === 0 || id === 11) { const pos = R.at(run, bz - 0.95, 0.95); R.putChecked(ivPole(id === 11 ? 2 : 1 + k), pos.x, pos.z, 0); }
    }
  }
  // 可推動:訪客椅;每三間有一台輪椅
  const mid = R.center();
  R.dyn(chairShell('pl_teal', 1), mid.x - 0.3, z0 + 3.2, 0.9, { mass: 4, shape: 'box' });
  if (n % 3 === 0) R.dyn(wheelchair(n), mid.x + 0.4, z0 + 6.6, 2.6, { mass: 16, shape: 'box', friction: 0.5 });
  let overbed = null;
  if (bays[1]) { const p = R.at(bays[1].run, bays[1].bz + 0.95, 1.9); overbed = R.putChecked(overbedTable(1), p.x, p.z, bays[1].run.yaw + Math.PI / 2); }
  // 南牆:洗手台、置物櫃、垃圾桶
  const S = R.run('S');
  if (S) {
    R.atWall(sinkWall(n % 2), S, S.t0 + 0.55, { mount: 0, collide: false });
    R.atWall(lockers(2, n, true), S, S.t1 - 0.45, { gap: 0.03 });
    R.atWall(bin('pedal', n), S, S.t0 + 1.25, { collide: false });
  }
  // 北牆(窗)兩側:時鐘、海報
  const N = R.run('N');
  if (N) {
    R.atWall(wallClock(n === 207 ? 0 : 1), N, N.t0 + 0.6, { mount: 2.35 });
    R.atWall(posterSheet(poster(n === 207 ? 'quiet' : 'handwash'), 0.38, 0.53, { curl: 0.06 }), N, N.t1 - 0.6, { mount: 1.3 });
  }
  if (E) R.atWall(framed(calendar(), 0.26, 0.36, 'pl_white', { glass: false }), E, E.t1 - 0.5, { mount: 1.45 });
  wardStory(R, n); // [scene r4] 203 隔離帳、209 家屬地舖
  wardStory2(R, n, { bays, overbed }); // [scene r5] 201 收音機、202 舊報紙、205 象棋、206 行李箱、208 神桌、210 萬嵐封存
  // 地面雜物
  scatter(R, 'paper', 4);
  scatter(R, 'paper2', 2);
  scatter(R, 'pillbottle', 2);
  if (n !== 207) {
    scatter(R, 'gauze', 2);
    scatter(R, 'debris', 2);
    floorDecal(R, 'dirt', mid.x, z0 + 4, 1.6);
    floorDecal(R, 'water', mid.x - 0.8, z0 + 6.4, 1.4);
    if (n % 2) floorDecal(R, 'drag', mid.x + 0.3, z0 + 5.5, 1.0);
    const b0 = bays[0];
    if (b0) wallDecal(R, b0.run, b0.bz + 0.75, 1.05, n % 3 ? 'hand' : 'smear', 0.32);
  } else {
    // 207:乾淨得不自然,只有那張床邊一攤乾掉的血
    const b = bays.find((q) => q.kind === 'body');
    if (b) {
      const p = R.at(b.run, b.bz + 0.62, 1.1);
      floorDecal(R, 'pool', p.x, p.z, 0.9);
      const c = R.at(b.run, b.bz, 1.05);
      R.event({ kind: 'body_sheet', x: c.x, y: R.y + 0.8, z: c.z });
    }
  }
}

// 204:床全部被推到東北角疊成一堆(像有人想用床堵住什麼)
function pushedToCorner(R, ceil, n) {
  const z0 = R.r0 * 2, x1 = (R.c1 + 1) * 2, x0 = R.c0 * 2;
  const A = hospitalBed({ kind: 'stripped', rail: 'down', seed: 0 });
  const Bd = hospitalBed({ kind: 'bare', rail: 'up', seed: 1 });
  const C = hospitalBed({ kind: 'messy', rail: 'mixed', seed: 1 });
  // A:沿北牆橫放;B:疊在 A 上、歪一邊;C:側翻立在東牆邊
  R.tryPut(A, x1 - 1.1, z0 + 0.55, Math.PI / 2, { force: true });
  R.tryPut(Bd, x1 - 1.15, z0 + 0.62, Math.PI / 2 + 0.1, { force: true, y: R.y + 0.56, rz: 0.16 });
  R.tryPut(C, x1 - 0.03, z0 + 2.6, 0, { force: true, rz: Math.PI / 2, y: R.y + 0.5 });
  // 床墊靠北牆
  const mat = tpl('mattress_lean', (b) => b.box('mattress', 0.88, 1.95, 0.14, 0, 0.975, 0.07, { r: 0.03 }));
  const N = R.run('N'), W = R.run('W');
  if (N) R.atWall(mat, N, N.t0 + 0.75, { gap: 0.02, rx: -0.12, collide: false });
  if (W) {
    R.atWall(nightstand(2), W, W.t0 + 3.0, { gap: 0.04 });
    for (const bz of [z0 + 1.25, z0 + 5.05]) R.atWall(headwall(1.3, 1), W, bz, { mount: 1.32 });
  }
  const E = R.run('E');
  if (E) R.atWall(headwall(1.3, 0), E, z0 + 5.05, { mount: 1.32 });
  // 倒在地上的點滴架、椅子
  R.put(ivPole(0), x0 + 2.2, z0 + 4.2, 0.6, { rz: Math.PI / 2 - 0.08, y: R.y + 0.03 });
  R.dyn(chairShell('pl_teal', 1), x0 + 3.0, z0 + 5.8, 2.2, { mass: 4, shape: 'box' });
  scatter(R, 'paper', 7);
  scatter(R, 'debris', 4);
  scatter(R, 'pillbottle', 3);
  floorDecal(R, 'drag', x0 + 3.6, z0 + 3.4, 1.2, { yaw: 0.3 });
  floorDecal(R, 'dirt', x0 + 2.4, z0 + 5.2, 1.8);
  floorDecal(R, 'feet', x0 + 2.8, z0 + 6.2, 0.9, { yaw: Math.PI });
  void ceil; void n;
}
