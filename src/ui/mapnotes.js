import { INK, rng, hand, stroke, loop, wob, arrow, stamp } from './mapink.js';
import { PX, isHospital } from './mapdraw.js';
import { sealGlyph } from './mappaper.js';

// 紙上的筆跡。
// 固定的(故事,STORY_v2):這疊圖 2003 年封院時掛在 2F 護理站,護理長鄭玉蘭(阿嬤)用紅原子筆在上面寫過字;
//   2003 年清潔班在消毒過的房間蓋了日期章;2026 年七月初一那一夜,一位家屬用藍原子筆寫了一行。
// 會變的(玩家自己的鉛筆):補給站、看過的彈藥櫃/醫療櫃/樓梯、上鎖的門(封條 + 斜線)、劇情點。
const P = (c, r) => [c * PX, r * PX];

// 正字記號(一劃一劃畫):n 劃,s = 字框大小
function tally(x, gx, gy, n, s, seed) {
  const R = rng(seed);
  const strokes = (ox, k) => [
    [[ox, gy], [ox + s, gy]], [[ox + s / 2, gy], [ox + s / 2, gy + s]], [[ox + s / 2, gy + s / 2], [ox + s * 0.88, gy + s / 2]],
    [[ox + s * 0.14, gy + s * 0.42], [ox + s * 0.14, gy + s]], [[ox - s * 0.04, gy + s], [ox + s * 1.04, gy + s]],
  ].slice(0, k);
  for (let i = 0; i < n; i++) {
    const g = Math.floor(i / 5), k = i % 5, seg = strokes(gx + g * s * 1.45, 5)[k];
    const pts = wob(seg[0][0] + R.r(-1, 1), seg[0][1] + R.r(-1, 1), seg[1][0] + R.r(-1, 1), seg[1][1] + R.r(-1, 1), 0.8, seed + i);
    stroke(x, pts, { pen: true, color: INK.oldRed, w: 1.9, alpha: i === n - 1 ? 0.42 : 0.8, seed: seed + i }); // 最後一劃幾乎沒有力氣
  }
  return (i) => { const g = Math.floor(i / 5); return [gx + g * s * 1.45 + s / 2, gy + s]; };
}

export function storyNotes(x, L, li) {
  if (!isHospital(L)) return;
  const id = L.levels[li].id;
  const red = { pen: true, color: INK.oldRed, w: 1.6, alpha: 0.8 };
  if (id === '2F') {
    // 207:圈兩圈,上面寫「燈不能熄」
    stroke(x, loop(...P(37.5, 9), 44, 54, 207, 1.75), { ...red, seed: 207 });
    hand(x, '燈不能熄', ...P(37.2, 2.5), 26, INK.oldRed, { seed: 21, rot: -0.05, alpha: 0.85 });
    arrow(x, wob(...P(37.4, 3.5), ...P(37.8, 6.1), 2.5, 3), { ...red, head: 9, seed: 31 });
    // 封院的夜數(正字記號 14 劃),第七劃那裡寫「第七暝」
    hand(x, '封院', ...P(3.4, 2.6), 21, INK.oldRed, { seed: 4, alpha: 0.8 });
    const at = tally(x, ...P(5.4, 1.65), 14, 23, 92);
    const [tx, ty] = at(6);
    arrow(x, wob(tx + 2, ty + 34, tx, ty + 7, 1.5, 9), { ...red, w: 1.4, head: 7, seed: 12 });
    hand(x, '第七晚', tx + 6, ty + 48, 21, INK.oldRed, { seed: 77, rot: 0.04, alpha: 0.85 });
  } else if (id === '1F') {
    // 禮拜堂西端的廣播室:打叉,「不要相信廣播」(和她封院第 6 天寫在大廳柱子上的同一句)
    stroke(x, wob(9.2 * PX, 29.25 * PX, 11.8 * PX, 32.7 * PX, 1.5, 5), { ...red, w: 2, seed: 5 });
    stroke(x, wob(11.75 * PX, 29.2 * PX, 9.25 * PX, 32.75 * PX, 1.5, 6), { ...red, w: 2, seed: 6 });
    hand(x, '不要相信廣播', ...P(10.9, 35.1), 19, INK.oldRed, { seed: 33, rot: -0.03, alpha: 0.85 });
    arrow(x, wob(...P(10.6, 34.4), ...P(10.6, 33.1), 1, 2), { ...red, w: 1.3, head: 6, seed: 14 });
    // 2026 年七月初一:一位家屬的藍原子筆(廣播叫家屬到大廳集合的那一夜)
    hand(x, '大廳不能待', ...P(24.2, 35.4), 17, INK.blue, { seed: 41, rot: -0.06, alpha: 0.85 });
    arrow(x, [...wob(...P(33, 35.6), ...P(52.5, 35.2), 3, 42), ...wob(...P(52.5, 35.2), ...P(55.2, 31.2), 2, 43).slice(1)], { pen: true, color: INK.blue, w: 1.4, alpha: 0.8, head: 9, seed: 44 });
    hand(x, '急診車道還有路', ...P(44.5, 36.7), 16, INK.blue, { seed: 45, rot: 0.03, alpha: 0.85 });
    stamp(x, ...P(46.2, 15.75), ['已消毒', '92.4.30', '清潔班'], { size: 9.5, w: 54, seed: 3, rot: -0.12 });
  } else if (id === 'B1') {
    // 封院時金水伯每晚到 B1 裝卸平台的鐵網外送便當
    hand(x, '便當 22:00', ...P(54.6, 26.6), 17, INK.oldRed, { seed: 51, rot: -0.05, alpha: 0.85 });
    hand(x, '鐵網', ...P(54.8, 28.2), 14, INK.oldRed, { seed: 52, rot: 0.02, alpha: 0.75 });
    arrow(x, wob(...P(54.6, 25.8), ...P(54.8, 19.6), 2, 53), { ...red, w: 1.3, head: 7, seed: 54 });
    stamp(x, ...P(23.4, 9.1), ['已消毒', '92.5.2', '清潔班'], { size: 9.5, w: 54, seed: 7, rot: 0.16 });
    stamp(x, ...P(14.2, 28.6), ['已消毒', '92.5.2', '清潔班'], { size: 9.5, w: 54, seed: 8, rot: -0.22, alpha: 0.55 });
  }
}

// ---------------------------------------------------------------------
// 玩家的鉛筆記號。st = { shop, supplies[], stairs[], locks[], pois[], here }
export function playerMarks(x, L, li, st) {
  const C = L.CELL;
  const pen = { w: 1.3, alpha: 0.85 };
  // 補給站(一開始就知道:金水伯在對講機裡講了)
  if (st.shop && (st.shop.level ?? 1) === li) {
    const z = (L.zones || []).find((q) => q.levelIndex === li && q.theme === 'shop');
    const [c0, r0, c1, r1] = z ? z.rects[0] : [st.shop.x / C - 2, st.shop.z / C - 2, st.shop.x / C + 1, st.shop.z / C + 1];
    const X0 = c0 * PX - 9, Y0 = r0 * PX - 9, X1 = (c1 + 1) * PX + 9, Y1 = (r1 + 1) * PX + 9;
    stroke(x, [[X0, Y0 + 2], [X1 + 3, Y0 - 1], [X1, Y1 + 2], [X0 - 2, Y1], [X0 + 1, Y0 - 3]], { ...pen, w: 1.6, seed: 61 });
    hand(x, '補給站', (X0 + X1) / 2, Y0 - 14, 16, INK.pencil, { seed: 62, pencil: true, rot: -0.04 });
    hand(x, '金水伯', X1 + 26, Y0 + 12, 12, INK.pencil, { seed: 63, pencil: true, rot: 0.1, alpha: 0.7 });
  }
  // 看過的補給櫃
  for (const s of st.supplies) {
    if ((s.level ?? 0) !== li || !s.seen) continue;
    const cx = (s.x / C) * PX, cy = (s.z / C) * PX, sd = Math.round(s.x * 7 + s.z * 13);
    if (s.kind === 'health') {
      stroke(x, loop(cx, cy, 13, 11, sd), { pen: true, color: INK.red, w: 1.5, alpha: 0.85, seed: sd });
      stroke(x, [[cx - 6, cy + 0.5], [cx + 6, cy - 0.5]], { pen: true, color: INK.red, w: 2.2, seed: sd + 1 });
      stroke(x, [[cx + 0.5, cy - 6], [cx - 0.5, cy + 6]], { pen: true, color: INK.red, w: 2.2, seed: sd + 2 });
    } else {
      stroke(x, loop(cx, cy, 13, 11, sd), { ...pen, w: 1.5, seed: sd });
      hand(x, '彈', cx, cy + 0.5, 14, INK.pencil, { seed: sd, pencil: true });
    }
  }
  // 看過的樓梯:鬆鬆地圈起來,寫上要去哪一層
  for (const s of st.stairs) {
    if (!s.seen) continue;
    const up = s.lower === li, to = L.levels[up ? s.upper : s.lower];
    const x0 = s.c0 * PX, x1 = (s.c1 + 1) * PX, y0 = s.r0 * PX, y1 = (s.r1 + 1) * PX, sd = s.c0 * 31 + s.r0 * 7 + li;
    stroke(x, loop((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + 8, (y1 - y0) / 2 + 8, sd, 1.05), { w: 1.1, alpha: 0.6, seed: sd });
    if (to) hand(x, `${up ? '↑' : '↓'}${to.id}`, x1 + 14, y0 + 6, 13, INK.pencil, { seed: sd, pencil: true, alpha: 0.8 });
  }
  // 上鎖的門:封條 + 房間斜線 +「禁止進入」;打開以後封條撕成兩截、寫「開了」
  for (const k of st.locks) {
    if (k.li !== li || !k.seen) continue;
    const cx = (k.x / C) * PX, cy = (k.z / C) * PX, sd = Math.round(k.x * 11 + k.z * 3);
    if (!k.open && k.rects) {
      x.save();
      const clip = new Path2D();
      for (const [c0, r0, c1, r1] of k.rects) clip.rect(c0 * PX - 4, r0 * PX - 4, (c1 - c0 + 1) * PX + 8, (r1 - r0 + 1) * PX + 8);
      x.clip(clip);
      const [c0, r0, c1, r1] = k.rects[0];
      for (let t = -((r1 - r0 + 1) * PX); t < (c1 - c0 + 1) * PX + 8; t += 9) stroke(x, [[c0 * PX + t, r0 * PX - 4], [c0 * PX + t + (r1 - r0 + 2) * PX, (r1 + 1) * PX + 4 + PX]], { w: 0.9, alpha: 0.42, seed: sd + t });
      x.restore();
      const [a0, b0, a1, b1] = k.rects[0], mx = ((a0 + a1 + 1) / 2) * PX;
      if (k.name) hand(x, k.name, mx, ((b0 + b1 + 1) / 2) * PX - 4, 17, INK.pencil, { seed: sd + 3, pencil: true, alpha: 0.95 }); // 門牌上看到的房號/房名
      hand(x, '禁止進入', mx, (b1 + 1) * PX - 9, 11, INK.pencil, { seed: sd, pencil: true, alpha: 0.9 });
    }
    sealGlyph(x, cx, cy, k.axis === 'x' ? Math.PI / 2 + 0.25 : 0.25, k.open);
    if (k.open) hand(x, '開了', cx + 22, cy - 12, 12, INK.pencil, { seed: sd + 5, pencil: true, alpha: 0.85 });
  }
  // 劇情點(劇情系統用 map.poi() 登記;看過才記)
  for (const p of st.pois) {
    if ((p.level ?? 0) !== li || !p.seen) continue;
    const cx = (p.x / C) * PX, cy = (p.z / C) * PX, sd = Math.round(p.x * 5 + p.z * 17);
    stroke(x, loop(cx, cy, 8, 7, sd), { w: 1.2, alpha: 0.75, seed: sd });
    if (p.label) hand(x, p.label, cx + 12, cy - 10, 12, INK.pencil, { seed: sd, pencil: true, align: 'left', alpha: 0.85 });
  }
}
