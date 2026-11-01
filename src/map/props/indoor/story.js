// [scene r4] 故事場景(STORY_v2):冷開場的大廳、廣播室、B1 裝卸平台……
// 文字都是道具上的字(資料),不動 src/horror、src/interact 的台詞。
import { tpl, L, G } from './parts.js';
import { labRect, decalRect } from './atlas.js';
import { D } from './geo.js';
import { glowSwatch } from './art.js';
import { plasticWall } from './sars.js';

const PI = Math.PI;
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// ================================================================ 大廳(冷開場)
// 萬嵐 2026 的白布條「回神照護中心 歡迎回家」(掛在 2F 迴廊欄杆之間,右端鬆脫垂下)
const bannerRect = () => labRect('story:banner', 448, 49, (c, w, h) => {
  c.save(); c.scale(0.875, 0.875); w = 512; h = 56;
  c.fillStyle = '#f3f4f1'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1d8a86'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5);
  c.fillStyle = '#1d8a86'; c.beginPath(); c.arc(30, h / 2, 14, 0, PI * 2); c.fill();
  c.fillStyle = '#f3f4f1'; c.beginPath(); c.arc(34, h / 2 - 3, 9, 0, PI * 2); c.fill();
  c.fillStyle = '#1d8a86'; c.font = 'bold 13px sans-serif'; c.textAlign = 'left'; c.fillText('大新生技', 52, h / 2 + 5);
  c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#16615e'; c.fillText('大新照護中心  歡迎回家', w / 2 + 40, h / 2 + 11);
  c.fillStyle = 'rgba(90,80,60,0.14)'; for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, (i * 31) % h, 18, 2);
  c.restore();
});
const paintRectH = () => decalRect('story:dontrust_h', 300, 64, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(150,22,16,0.8)'; c.font = 'bold 46px serif'; c.textAlign = 'center';
  [...'不要相信廣播'].forEach((ch, i) => c.fillText(ch, 27 + i * 49, 50 + (i % 2 ? 2 : -2)));
  for (let i = 0; i < 7; i++) { c.fillStyle = 'rgba(150,22,16,0.5)'; c.fillRect(18 + i * 44, 52, 2, 6 + (i % 3) * 4); }
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(0,0,0,${0.3 + (i % 5) * 0.12})`; c.fillRect((i * 29) % w, (i * 17) % h, 3 + (i % 4), 2 + (i % 3)); }
  c.globalCompositeOperation = 'source-over';
});
const banner = () => tpl('story:banner', (b) => {
  // 11.6m 寬,左端與中段綁在欄杆上;右端鬆脫,斜斜垂下
  const rect = bannerRect();
  const g = b.plane(L(rect), 11.6, 0.95, 0, 0, 0, { ws: 12, hs: 1 });
  void g;
  b.rod('pl_white', 0.005, [-5.8, 0.47, 0], [-5.9, 0.62, 0], { seg: 3 });
  b.rod('pl_white', 0.005, [0, 0.47, 0], [0, 0.62, 0], { seg: 3 });
});
const balloon = (col, k) => tpl(`story:balloon:${col}:${k}`, (b) => {
  b.sph(col, 0.15, 0, 0, 0, { sy: 1.22, ws: 12, hs: 9 });
  b.cyl(col, 0.012, 0.03, 0, -0.19, 0, { seg: 6, r2: 0.004 });
  b.rod('pl_white', 0.0015, [0, -0.2, 0], [0.02 + (k % 3) * 0.02, -1.1 - (k % 4) * 0.25, 0.01], { seg: 3 });
});
// 拖鞋(藍/粉紅塑膠)、包包、被踩爛的花束
const slipper = (col) => tpl(`story:slipper:${col}`, (b) => {
  b.box(col, 0.1, 0.022, 0.26, 0, 0.011, 0, { r: 0.01 });
  b.box(col, 0.104, 0.035, 0.07, 0, 0.035, 0.05, { r: 0.012 });
});
const handbag = (col, k) => tpl(`story:bag:${col}:${k}`, (b) => {
  b.box(col, 0.32, 0.22, 0.12, 0, 0.11, 0, { r: 0.03, rz: k ? 1.45 : 0 });
  if (!k) b.tor(col, 0.09, 0.008, 0, 0.24, 0, { ts: 12, rs: 4, arc: PI });
});
const bouquet = (k) => tpl(`story:bouquet:${k}`, (b) => {
  const r = rnd(k + 5);
  b.cyl('pl_clear', 0.11, 0.42, 0, 0.05, 0, { r2: 0.02, rz: PI / 2 - 0.06, seg: 10, open: true });
  b.box('paper', 0.32, 0.01, 0.2, 0.02, 0.012, 0, { ry: 0.3 });
  for (let i = 0; i < 7; i++) b.sph(['fab_white', 'fab_pink', 'fab_yellow', 'fab_red'][(i + k) % 4], 0.034, -0.17 + r() * 0.08, 0.025, (r() - 0.5) * 0.18, { sy: 0.45, ws: 7, hs: 5 });
  for (let i = 0; i < 3; i++) b.box('leaf_dead', 0.08, 0.004, 0.03, -0.1 + r() * 0.3, 0.004, (r() - 0.5) * 0.3, { ry: r() * 3 });
});

export function lobbyColdOpen(R) {
  const y = R.y, LY = R.L, r = rnd(4217);
  // 布條:2F 迴廊兩側欄杆之間(挑空 x 54–66),z 57.8
  R.put(banner(), 60.2, 57.8, 0, { y: 4.2 + 0.55, rz: -0.035 });
  // 右端鬆脫垂下的一角(另一片,斜掛)
  R.put(tpl('story:bannerflap', (b) => { b.box('fab_white', 0.04, 0.9, 0.012, 0, -0.45, 0, { rz: 0.25 }); }), 66.0, 57.8, 0, { y: 4.2 + 1.0 });
  // 氣球:飄到挑空最高處(天窗下)聚成一團,繩子垂下來
  const top = (c, rr) => { const v = LY.ceilY?.(3, c, rr); return Number.isFinite(v) ? v : 8.4 + 4.2; };
  const cols = ['pl_red', 'pl_yellow', 'pl_blue', 'pl_white', 'pl_pink', 'pl_red', 'pl_teal'];
  for (let i = 0; i < 26; i++) {
    const a = r() * PI * 2, d = Math.sqrt(r()) * 3.2, x = 60 + Math.cos(a) * d * 1.3, z = 60.5 + Math.sin(a) * d * 0.8;
    const cy = top(Math.floor(x / 2), Math.floor(z / 2)) - 0.24 - r() * 0.22;
    const k = i % 7;
    R.put(balloon(cols[k], i % 5), x, z, r() * 6.28, { y: cy, rx: (r() - 0.5) * 0.3, rz: (r() - 0.5) * 0.3 });
  }
  // 地上:拖鞋(成雙的被踢散)、包包、花束 —— 從入口往服務台的方向
  const spots = [];
  for (let i = 0; i < 46; i++) spots.push([R.rand(51, 70), R.rand(57.8, 65.2)]);
  let ns = 0, nb = 0, nf = 0;
  for (const [x, z] of spots) {
    if (!R.freeAt(x, z, 0.25)) continue;
    const roll = r();
    if (roll < 0.55 && ns < 18) { R.put(slipper(['pl_blue', 'pl_pink', 'pl_white', 'pl_green'][ns % 4]), x, z, r() * 6.28, { collide: false, rz: r() < 0.25 ? PI : 0, y: y + (r() < 0.25 ? 0.024 : 0) }); ns++; }
    else if (roll < 0.75 && nb < 6) { R.put(handbag(['leather_brown', 'leather_black', 'fab_red', 'vinyl_cream'][nb % 4], nb % 2), x, z, r() * 6.28, { collide: false }); nb++; }
    else if (nf < 6) { R.put(bouquet(nf), x, z, r() * 6.28, { collide: false }); nf++; }
  }
  // 服務台正面(朝南,一進大廳就看得到):橫書的紅漆
  const ht = tpl('story:dontrust_h', (b) => b.plane(D(paintRectH()), 1.75, 0.37, 0, 0.185, 0));
  R.put(ht, 60, 57.4 + 0.47, 0, { y: y + 0.42 });
  return { ns, nb, nf };
}
void G; void glowSwatch;

// ================================================================ 樓梯間:大大的樓層數字(西梯紅褐、東梯藍),玩家一眼知道自己在哪一層、哪一側
const floorNum = (lv, side) => decalRect(`story:floor:${lv}:${side}`, 160, 120, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  // 白漆大字(樓梯間是紅色緊急燈,紅字會看不見)+ 西梯紅帶 / 東梯藍帶
  c.fillStyle = 'rgba(236,230,214,0.92)'; c.font = 'bold 92px sans-serif'; c.textAlign = 'center'; c.fillText(lv, w / 2, 92);
  c.fillStyle = side === 'w' ? 'rgba(170,40,28,0.9)' : 'rgba(30,80,170,0.9)'; c.fillRect(8, 101, w - 16, 9);
  c.fillStyle = 'rgba(236,230,214,0.92)';
  c.font = 'bold 14px sans-serif'; c.fillText(side === 'w' ? '西 梯' : '東 梯', w / 2, 120);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(0,0,0,${0.25 + (i % 4) * 0.15})`; c.fillRect((i * 37) % w, (i * 53) % h, 4 + (i % 5), 2 + (i % 3)); }
  c.globalCompositeOperation = 'source-over';
});
export function stairMark(R, zone) {
  const lv = R.L.levels[R.li].id, side = /_w$/.test(zone.id) ? 'w' : 'e';
  const runs = R.walls.filter((r) => r.len >= 1.6).sort((a, b) => b.len - a.len);
  const t = tpl(`story:floornum:${lv}:${side}`, (b) => b.plane(D(floorNum(lv, side)), 1.3, 0.975, 0, 0.49, 0.003));
  for (const run of runs.slice(0, 2)) {
    const tt = run.len > 3.4 ? run.t1 - 1.0 : (run.t0 + run.t1) / 2 + 0.9; // 避開牆中央的小樓層牌(signs.js)
    if (R.isWindow(run, tt - 0.7, tt + 0.7) || tt > run.t1 - 0.6) continue;
    R.atWall(t, run, tt, { mount: 1.15 });
  }
}

// ================================================================ 病房:同一套擺設,各自多一層故事(迷路時認得出是哪一間)
// 203:一張床被塑膠布圍起來(隔離);209:家屬打地舖(草蓆、被子、保溫瓶、拖鞋 —— 封院時被關在裡面的陪病家屬)
const mat = (k) => tpl(`story:mat:${k}`, (b) => {
  b.box('fab_canvas', 0.9, 0.012, 1.85, 0, 0.006, 0, { r: 0.004 });
  b.box(k % 2 ? 'fab_floral' : 'fab_check', 0.82, 0.07, 1.0, 0.02, 0.045, 0.35, { r: 0.03, ry: 0.05 });
  b.box('fab_white', 0.42, 0.08, 0.28, 0, 0.05, -0.7, { r: 0.035 });
});
export function wardStory(R, n) {
  const W = R.run('W'), E = R.run('E');
  const x0 = R.c0 * 2, z0 = R.r0 * 2;
  if (n === 203 && W) {
    // 床邊兩面垂到地的塑膠布(長邊 + 床尾),上緣用膠帶貼在隔簾軌道上
    const bz = z0 + 5.05, top = R.L.ceilY(R.li, R.c0, R.r0) - R.y - 0.12;
    const a = R.at(W, bz - 0.75, 1.15), b2 = R.at(W, bz, 2.25);
    R.put(plasticWall(2.2, Math.min(2.9, top), 1), a.x, a.z, 0, { collide: false });
    R.put(plasticWall(1.5, Math.min(2.9, top), 2), b2.x, b2.z, Math.PI / 2, { collide: false });
  }
  if (n === 209) {
    const c = R.center();
    const r = rnd(209);
    for (let i = 0; i < 2; i++) {
      const x = c.x - 0.55 + i * 1.05, z = z0 + 3.6 + (r() - 0.5) * 0.3;
      if (R.freeAt(x, z, 0.4)) R.put(mat(i), x, z, (r() - 0.5) * 0.2, { collide: false });
    }
    if (E) R.atWall(tpl('story:thermos2', (b) => { b.cyl('enamel_blue', 0.05, 0.27, 0, 0.135, 0, { seg: 12 }); b.cyl('pl_white', 0.04, 0.05, 0, 0.295, 0, { seg: 10 }); }), E, z0 + 3.4, { gap: 0.05, collide: false });
  }
  void x0;
}
