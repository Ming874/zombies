// [scene r4] 207:整個故事的情感中心(STORY_v2 §4)。
// 阿嬤(鄭玉蘭)在 2003 封院的十四個晚上守在這裡:靠窗那張床(小鈴)、床邊的陪病椅(椅背披著她的開襟毛衣)、
// 床頭櫃上一直亮著的檯燈(接在從窗戶拉進來的發電機電纜 → 紅色延長線座)、保溫瓶與琺瑯杯、停在 2003 年五月的月曆、
// 牆上用鉛筆畫的「正」字(十四劃)。房內天花板的燈是壞的 → 這盞檯燈是房間唯一的光。
// 門外:護理站一盞暖色壁燈照著遺照(收驚、問事的地方),門邊地上是金水伯放的便當(「放門口,敲三下」)。
// 給體驗導演的錨點(kind 'anchor'):hospital.js 收進 H.anchors.w207(結局:天亮時從門口看陪病椅 → 床 → 窗)。
import { tpl, G } from './parts.js';
import { labRect, decalRect } from './atlas.js';
import { D } from './geo.js';
import { glowSwatch } from './art.js';
import { hospitalBed, bedTags, nightstand, headwall, curtainSet } from './medical.js';
import { framed, wallClock, posterSheet } from './furniture.js';
import { poster } from './art.js';
import { rng as mkRng } from '../ctx.js';

const PI = Math.PI;

// ---------------- 圖(標籤圖集) ----------------
// 牆上的「正」字:十四劃(正、正、再四劃),鉛筆,越後面越歪
const tallyRect = () => decalRect('w207:tally', 168, 96, (c, w, h) => {
  c.clearRect(0, 0, w, h);
  c.strokeStyle = 'rgba(52,50,48,0.82)'; c.lineCap = 'round';
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  const line = (x0, y0, x1, y1, wdt) => { c.lineWidth = wdt; c.beginPath(); c.moveTo(x0 + r() * 2, y0 + r() * 2); c.quadraticCurveTo((x0 + x1) / 2 + r() * 3, (y0 + y1) / 2 + r() * 3, x1 + r() * 2, y1 + r() * 2); c.stroke(); };
  // 正 的筆順:一、丨(中)、一(中)、丨(左下)、一(底)
  const zheng = (ox, n, k) => {
    const sz = 34, y0 = 22 + k * 3, wd = 2.2 - k * 0.25;
    const st = [[0, 0, sz, 0], [sz / 2, 0, sz / 2, sz], [sz / 2, sz / 2, sz * 0.86, sz / 2], [sz * 0.16, sz * 0.45, sz * 0.16, sz], [0, sz, sz, sz]];
    for (let i = 0; i < n; i++) { const [a, b, cc, d] = st[i]; line(ox + a, y0 + b, ox + cc, y0 + d, wd); }
  };
  zheng(8, 5, 0); zheng(60, 5, 1); zheng(112, 4, 2);
  c.fillStyle = 'rgba(52,50,48,0.6)'; c.font = '12px serif'; c.fillText('四月廿九', 6, 90);
});
// 2003 年五月的月曆:1–12 號用紅筆打叉,13 號空著
const cal2003 = () => labRect('w207:cal2003', 128, 172, (c, w, h) => {
  c.save(); c.scale(0.8, 0.8); w = 160; h = 216;
  c.fillStyle = '#efe9dc'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#a8231c'; c.fillRect(0, 0, w, 46);
  c.fillStyle = '#fff4e0'; c.font = 'bold 22px serif'; c.textAlign = 'center'; c.fillText('五月', w / 2, 26);
  c.font = '11px serif'; c.fillText('中華民國九十二年  2003', w / 2, 41);
  c.fillStyle = '#3a3330'; c.font = '10px sans-serif';
  const wk = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 0; i < 7; i++) c.fillText(wk[i], 13 + i * 22, 60);
  // 2003/5/1 是星期四
  for (let d = 1; d <= 31; d++) {
    const k = d + 3, col = k % 7, row = (k / 7) | 0, x = 13 + col * 22, y = 80 + row * 24;
    c.fillStyle = col === 0 ? '#a8231c' : '#3a3330'; c.font = '13px sans-serif'; c.fillText(String(d), x, y);
    if (d <= 12) { c.strokeStyle = 'rgba(176,30,24,0.85)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 8, y - 12); c.lineTo(x + 8, y + 3); c.moveTo(x + 8, y - 12); c.lineTo(x - 8, y + 3); c.stroke(); }
  }
  c.fillStyle = 'rgba(120,96,60,0.18)'; c.fillRect(0, h - 30, w, 30);
  c.restore();
});

// ---------------- 模型 ----------------
// 陪病椅:墨綠塑膠皮扶手椅、鍍鉻腳;椅背披著米色開襟毛衣、座位上一條摺好的格子毯。正面朝 +z
export const companionChair = () => tpl('w207:chair', (b) => {
  const v = 'vinyl_green';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod('chrome', 0.012, [sx * 0.26, 0, sz * 0.22], [sx * 0.25, 0.39, sz * 0.2], { seg: 6 });
  b.rod('chrome', 0.01, [-0.26, 0.06, 0.22], [0.26, 0.06, 0.22], { seg: 5 });
  b.box(v, 0.6, 0.12, 0.54, 0, 0.45, 0.01, { r: 0.04 });
  b.box(v, 0.6, 0.74, 0.12, 0, 0.86, -0.27, { r: 0.045, rx: -0.13 });
  for (const s of [-1, 1]) {
    b.box(v, 0.09, 0.075, 0.5, s * 0.335, 0.665, 0.0, { r: 0.03 });
    b.rod('chrome', 0.011, [s * 0.335, 0.4, 0.18], [s * 0.335, 0.63, 0.18], { seg: 5 });
  }
  // 開襟毛衣:搭在椅背上(前後兩片 + 頂 + 垂下的袖子 + 釦子)
  const k = 'fab_beige';
  b.box(k, 0.52, 0.06, 0.17, 0, 1.235, -0.315, { r: 0.025, rx: -0.13 });
  b.box(k, 0.48, 0.42, 0.028, 0, 1.0, -0.2, { r: 0.012, rx: -0.13 });
  b.box(k, 0.5, 0.34, 0.028, 0, 1.04, -0.39, { r: 0.012, rx: -0.13 });
  for (const s of [-1, 1]) b.box(k, 0.085, 0.46, 0.06, s * 0.27, 0.98, -0.23, { r: 0.025, rx: -0.1, rz: s * 0.06 });
  for (let i = 0; i < 4; i++) b.cyl('pl_cream', 0.008, 0.005, 0.035, 1.14 - i * 0.075, -0.18 + i * 0.0095, { axis: 'z', seg: 8, rx: -0.13 });
  // 摺好的毯子
  b.box('fab_check', 0.42, 0.075, 0.3, 0.03, 0.548, 0.08, { r: 0.03, ry: 0.06 });
});
// 鵝頸檯燈:奶油色琺瑯燈罩,燈泡用發光色票(實際亮度由登記的燈具決定)
const gooseLamp = () => tpl('w207:lamp', (b) => {
  b.lathe('enamel_cream', [[0, 0], [0.085, 0], [0.085, 0.014], [0.05, 0.03], [0.012, 0.034], [0, 0.034]], 0, 0, 0, { seg: 16 });
  b.rod('pl_white', 0.004, [0.05, 0.01, -0.06], [0.03, 0.0, -0.12], { seg: 4 }); // 電線
  b.tube('chrome', [[0, 0.03, 0], [0, 0.24, 0], [0.02, 0.36, 0.03], [0.07, 0.41, 0.09]], 0.008, { seg: 6, bend: 0.05 });
  b.lathe('enamel_cream', [[0.012, 0], [0.03, -0.01], [0.075, -0.09], [0.078, -0.095]], 0.09, 0.44, 0.11, { seg: 18, rx: 0.5 });
  b.sph(G(glowSwatch('warm', '#ffd89a')), 0.026, 0.1, 0.4, 0.13, { ws: 10, hs: 8 });
});
const thermos = () => tpl('w207:thermos', (b) => {
  b.cyl('enamel_red', 0.052, 0.27, 0, 0.135, 0, { seg: 14 });
  b.cyl('pl_white', 0.042, 0.06, 0, 0.3, 0, { seg: 12 });
  b.cyl('chrome', 0.053, 0.012, 0, 0.03, 0, { seg: 14 });
});
const enamelCup = () => tpl('w207:cup', (b) => {
  b.cyl('enamel_white', 0.04, 0.085, 0, 0.0425, 0, { seg: 12, open: false });
  b.tor('enamel_white', 0.024, 0.005, 0.045, 0.045, 0, { ts: 10, rs: 4, arc: PI });
});
// 紅色延長線座(自接):一排插座 + 開關
const powerStrip = () => tpl('w207:strip', (b) => {
  b.box('pl_red', 0.34, 0.035, 0.065, 0, 0.018, 0, { r: 0.01 });
  for (let i = 0; i < 4; i++) b.box('pl_dark', 0.03, 0.004, 0.022, -0.1 + i * 0.065, 0.037, 0);
  b.box('pl_orange', 0.025, 0.012, 0.02, 0.145, 0.04, 0);
});
// 免洗便當(紙盒 + 橡皮筋),一疊
const bentoStack = (n, seed) => tpl(`w207:bento:${n}:${seed}`, (b) => {
  let s = seed + 1; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < n; i++) {
    const y = 0.026 + i * 0.052, ry = r() * 0.3, x = r() * 0.03, z = r() * 0.03;
    b.box('paper', 0.21, 0.05, 0.16, x, y, z, { r: 0.006, ry });
    b.box('rubber_red', 0.006, 0.052, 0.165, x + 0.03, y, z, { ry });
  }
});
// 護理站的暖色壁燈(琺瑯燈罩 + 短臂),牆面朝 +z
const wallLampWarm = () => tpl('w207:walllamp', (b) => {
  b.box('enamel_cream', 0.1, 0.14, 0.02, 0, 0, 0.01, { r: 0.008 });
  b.rod('chrome', 0.008, [0, 0, 0.02], [0, 0.04, 0.2], { seg: 5 });
  b.lathe('enamel_cream', [[0.01, 0], [0.03, -0.01], [0.085, -0.085], [0.088, -0.09]], 0, 0.06, 0.24, { seg: 18 });
  b.sph(G(glowSwatch('warm', '#ffd89a')), 0.03, 0, 0.03, 0.24, { ws: 10, hs: 8 });
});

export function dress207(R, zone, ceil) {
  R.rng = mkRng(0x2071);
  const W = R.run('W'), E = R.run('E'), N = R.run('N'), S = R.run('S');
  const x0 = R.c0 * 2, z0 = R.r0 * 2, x1 = (R.c1 + 1) * 2, z1 = (R.r1 + 1) * 2;
  const y = R.y;
  const anchor = (name, o) => R.event({ kind: 'anchor', name, ...o });
  // ---- 小鈴的床(靠東牆、靠窗) ----
  let bedP = null;
  if (E) {
    const bz = z0 + 1.3;
    bedP = R.atWall(hospitalBed({ kind: 'made', head: 0.25, rail: 'mixed', seed: 0 }), E, bz, { gap: 0.03 });
    if (bedP) bedTags(R, bedP, 2071);
    R.atWall(headwall(1.3, 0), E, bz, { mount: 1.32 });
    // 隔簾收在牆邊(打開)
    const wx = E.plane, path = [[wx, bz - 0.62], [wx - 2.3, bz - 0.62], [wx - 2.3, bz + 0.62], [wx, bz + 0.62]].map(([x, z]) => [x - x0, z - z0]);
    R.put(tpl('curtain:207:open', (b) => curtainSet(b, path, ceil, { seed: 47, bunch: 0.9, holes: 0.1, rag: 0.2 })), x0, z0, 0);
    // 床頭櫃 + 檯燈 + 保溫瓶 + 琺瑯杯
    const ns = R.atWall(nightstand(1), E, bz - 0.84, { gap: 0.04 });
    if (ns) {
      const top = R.topOf(ns, 0);
      const lp = R.onTop(ns, 0.35, 0.4);
      R.put(gooseLamp(), lp.x, lp.z, E.yaw + 0.5, { y: top.y });
      const lampY = top.y + 0.42;
      const lf = R.light({ x: lp.x - 0.15, y: lampY - 0.06, z: lp.z + 0.3, color: 0xffa65e, intensity: 3.9, distance: 6.6, kind: 'lamp', flicker: 0, glow: 0.42, w207: 'lamp' });
      anchor('w207.lamp', { x: lp.x, y: lampY, z: lp.z });
      const tp = R.onTop(ns, 0.78, 0.65); R.put(thermos(), tp.x, tp.z, 0.4, { y: top.y });
      const cp = R.onTop(ns, 0.72, 0.25); R.put(enamelCup(), cp.x, cp.z, 2.2, { y: top.y });
      void lf;
    }
    // 陪病椅:床的門側,面向床
    const cx = E.plane - 1.25, cz = bz + 1.2;
    const ch = R.tryPut(companionChair(), cx, cz, PI, { force: true });
    if (ch) anchor('w207.chair', { x: cx, y, z: cz, yaw: PI });
    // 牆上的正字(椅子旁邊,坐著伸手就畫得到的高度)
    R.atWall(tpl('w207:tallywall', (b) => b.plane(D(tallyRect()), 0.3, 0.17, 0, 0.085, 0.004)), E, bz + 1.15, { mount: 0.98 });
    anchor('w207.bed', { x: E.plane - 1.1, y: y + 0.6, z: bz });
    // 發電機電纜:從窗框右下角進來 → 沿牆角到地上 → 紅色延長線座(床頭櫃旁);檯燈的電線也接在這裡
    const sx = E.plane - 0.75, sz = z0 + 0.42;
    R.put(powerStrip(), sx, sz, 0.12);
    const wy = y + 0.92;
    const pts = [[x0 + 3.92, wy, z0 + 0.07], [x0 + 3.94, wy - 0.3, z0 + 0.05], [x0 + 3.96, y + 0.03, z0 + 0.06], [x0 + 4.4, y + 0.02, z0 + 0.1], [sx - 0.3, y + 0.02, sz], [sx - 0.17, y + 0.02, sz]];
    R.put(tpl('w207:gencable', (b) => b.tube('rubber', pts.map(([px, py, pz]) => [px, py - y, pz]), 0.011, { seg: 6, bend: 0.08 })), 0, 0, 0);
    if (ns) {
      const lp = R.onTop(ns, 0.35, 0.4);
      const cpts = [[lp.x, y + 0.62, lp.z - 0.1], [lp.x - 0.05, y + 0.3, lp.z - 0.16], [lp.x - 0.08, y + 0.02, lp.z - 0.12], [sx + 0.05, y + 0.03, sz + 0.02]];
      R.put(tpl('w207:lampcord', (b) => b.tube('pl_white', cpts.map(([px, py, pz]) => [px, py - y, pz]), 0.0035, { seg: 4, bend: 0.04 })), 0, 0, 0);
    }
  }
  // ---- 白布蓋著的那張床(靠西牆、靠門),隔簾拉上 ----
  if (W) {
    const bz = z0 + 5.05;
    const p = R.atWall(hospitalBed({ kind: 'body', head: 0, rail: 'up', seed: 1 }), W, bz, { gap: 0.03 });
    if (p) bedTags(R, p, 2072);
    R.atWall(headwall(1.3, 1), W, bz, { mount: 1.32 });
    const wx = W.plane, path = [[wx, bz - 0.62], [wx + 2.3, bz - 0.62], [wx + 2.3, bz + 0.62], [wx, bz + 0.62]].map(([x, z]) => [x - x0, z - z0]);
    R.put(tpl('curtain:207:drawn', (b) => curtainSet(b, path, ceil, { seed: 52, bunch: 0.3, holes: 0.2, rag: 0.3 })), x0, z0, 0);
    R.event({ kind: 'bed_curtain', x: wx + 2.3, y: y + 0.05, z: bz, nx: 1, nz: 0 });
    const c = R.at(W, bz, 1.05);
    R.event({ kind: 'body_sheet', x: c.x, y: y + 0.8, z: c.z });
  }
  // ---- 牆面:停住的鐘、2003 年五月的月曆、「請保持安靜」 ----
  if (N) {
    R.atWall(wallClock(0), N, x0 + 1.0, { mount: 2.35 });
    R.atWall(framed(cal2003(), 0.24, 0.32, 'pl_white', { glass: false }), N, x0 + 1.1, { mount: 1.38 });
  }
  if (S) R.atWall(posterSheet(poster('quiet'), 0.38, 0.53, { curl: 0.06 }), S, S.t1 - 0.5, { mount: 1.3 });
  // 結局的門口視角(門內 0.9m,看向陪病椅 → 床 → 窗;這附近不放東西)
  const dx = x0 + 3.6, dz = z1 - 1.0;
  anchor('w207.view', { x: dx, y, z: dz, yaw: Math.atan2(-((E ? E.plane - 1.25 : dx) - dx), -((z0 + 2.5) - dz)), pitch: -0.1 });
  anchor('w207.door', { x: x0 + 3, y, z: z1 + 0.2 });

  // ---- 門外:護理站的暖色壁燈(照著遺照與交班簿)、門邊的便當 ----
  // 走廊北牆面在 z1 + 2(207 南牆厚一格);壁燈掛在遺照上方偏右
  const wallZ = z1 + 2;
  const lampT = tpl('w207:hubwrap', (b) => b.add(wallLampWarm(), 0, 0, 0, 0, 0, 0));
  R.put(lampT, x0 + 5.75, wallZ + 0.01, 0, { y: y + 2.05 });
  R.light({ x: x0 + 5.75, y: y + 1.85, z: wallZ + 0.55, color: 0xffb070, intensity: 4.0, distance: 3.9, kind: 'lamp', flicker: 0, glow: 0.38, zone: 'f2_corridor' });
  anchor('w207.hub', { x: x0 + 5.5, y, z: wallZ + 0.6 });
  // 便當:門西側靠牆,兩疊 + 一個塑膠袋裡的(最後幾天沒人拿)
  R.put(bentoStack(4, 1), x0 + 1.45, wallZ + 0.22, 0.1);
  R.put(bentoStack(3, 2), x0 + 1.12, wallZ + 0.3, -0.25);
  R.put(bentoStack(2, 3), x0 + 1.75, wallZ + 0.42, 0.5);
}
