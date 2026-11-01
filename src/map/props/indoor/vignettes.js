import { tpl, L as Lab, labRect } from './geo.js';
import { floorDecal, wallDecal, scatter } from './clutter.js';
import { bodyUnderSheet, ivPole, wheelchair, gurney } from './medical.js';
import { chairShell, tableLong, bin, posterSheet } from './furniture.js';
import { cardboardBox } from './decor.js';
import { straitjacket } from './equip.js';
import { sign } from './art.js';
import { rotY, litter } from './lay.js';
import { curtainGeo } from './cloth.js';

// 環境敘事小場景(依區域 id;在主題擺設之後執行,同一個 Room 規劃器 → 一樣的不擋路檢查):
//  急診:檢傷分類失控(一排屍袋、散落的檢傷卡、往外拖的血痕)
//  加護病房:隔離區(門口的塑膠條簾、斜貼的警示膠帶、隔離告示)
//  病房 205:被撞開的路障(翻倒的床頭櫃與椅子、帶釘木板)
//  三樓精神科走廊:逃走的病人(從 303 號房一路到東樓梯的血腳印、扯開的束縛衣、牆上的血手印)
//  大廳:封鎖過的出口(推到門邊的長椅、木板、「出口被封了」)
//  員工餐廳:翻倒當掩體的桌子,後面有人躲過的痕跡(罐頭、水瓶、毯子)
//  太平間:從門口拖向冷凍櫃的血痕
const TAPE = () => labRect('tape:quarantine', 512, 48, (c, w, h) => {
  for (let i = -2; i < w / 24 + 2; i++) { c.fillStyle = i % 2 ? '#141414' : '#e8c018'; c.beginPath(); c.moveTo(i * 24, 0); c.lineTo(i * 24 + 24, 0); c.lineTo(i * 24 + 6, h); c.lineTo(i * 24 - 18, h); c.fill(); }
  c.fillStyle = '#e8c018'; c.fillRect(0, h * 0.22, w, h * 0.56);
  c.fillStyle = '#141414'; c.font = `bold ${h * 0.42}px "Microsoft JhengHei", "Noto Sans TC", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) c.fillText('隔離區 禁止進入 QUARANTINE', w * (i + 0.5) / 3 + 40, h * 0.52);
});
// 沿折線放地面貼花(方向對齊路徑)
function trail(R, pts, kind, size, step, o = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(-(z1 - z0), x1 - x0) + (o.yaw ?? 0);
    for (let d = 0; d < len; d += step * (0.8 + R.rng() * 0.4)) {
      const t = d / len, side = o.alt ? ((Math.round(d / step) % 2) * 2 - 1) * 0.12 : 0;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (o.skip && R.rng() < o.skip) continue;
      floorDecal(R, kind, x0 + (x1 - x0) * t + nx * side, z0 + (z1 - z0) * t + nz * side, size * (0.85 + R.rng() * 0.3), { yaw });
    }
  }
}
// 門口的塑膠條簾(可以穿過;只是視覺)
const strips = (w, h) => tpl(`strips:${w}:${h}`, (b) => {
  b.box('steel', w, 0.05, 0.06, 0, h + 0.025, 0);
  const n = Math.round(w / 0.19);
  for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * (w / n); b.box('pl_clear', w / n - 0.012, h - 0.04 - (i % 3 === 1 ? 0.25 : 0), 0.003, x, h / 2 - (i % 3 === 1 ? 0.125 : 0) - 0.02, (i % 2) * 0.004); }
});
const tapeX = (w) => tpl(`tapeX:${w}`, (b) => {
  const len = Math.hypot(w, 1.1);
  for (const s of [-1, 1]) b.plane(Lab(TAPE()), len, len * 48 / 512, 0, 0, 0.003 + (s > 0 ? 0.002 : 0), { rz: s * Math.atan2(1.1, w) });
});
const boards = (n, seed) => tpl(`boards:${n}:${seed}`, (b) => {
  for (let i = 0; i < n; i++) {
    const a = (seed * 1.7 + i * 2.3) % 3.14, len = 0.9 + ((seed + i * 7) % 5) * 0.12;
    b.box('wood_old', len, 0.022, 0.14, Math.sin(i * 2.1 + seed) * 0.35, 0.011 + i * 0.022, Math.cos(i * 1.7) * 0.3, { ry: a });
    for (let k = 0; k < 2; k++) b.cyl('steel', 0.003, 0.05, Math.sin(i * 2.1 + seed) * 0.35 + Math.cos(a) * (k ? 0.35 : -0.35), 0.03 + i * 0.022, Math.cos(i * 1.7) * 0.3 - Math.sin(a) * (k ? 0.35 : -0.35), { seg: 4 });
  }
});
const blanket = (seed) => tpl(`blanket:${seed}`, (b) => {
  for (let i = 0; i < 4; i++) b.box(i % 2 ? 'fab_gray' : 'fab_navy', 0.9 - i * 0.12, 0.03, 0.6 - i * 0.08, (i - 1.5) * 0.06, 0.015 + i * 0.03, (i % 2) * 0.05, { ry: i * 0.4 + seed, r: 0.012 });
});

function erTriage(R) {
  const { x, z } = R.center();
  // 一排屍袋(靠最長的牆,不擋路:Room 規劃器檢查)
  const run = R.walls.filter((r) => r.len > 5).sort((a, b) => b.len - a.len)[0];
  if (run) for (let k = 0; k < 3; k++) {
    const t = run.t0 + 1.2 + k * 0.85;
    if (t > run.t1 - 0.6) break;
    const p = R.atWall(rotY(bodyUnderSheet(40 + k, { w: 0.55, drop: 0.05 })), run, t, { gap: 0.15, collide: false });
    if (p && k === 1) R.event({ kind: 'body_sheet', x: R.local(p, 0, 0, 0.6).x, y: R.y + 0.3, z: R.local(p, 0, 0, 0.6).z });
  }
  // 檢傷分類站立牌 + 散落的檢傷卡(紅/黃/綠/黑)
  const st = R.floor(tpl('triageSign', (b) => {
    b.box('steel', 0.04, 1.5, 0.04, 0, 0.75, 0); b.box('steel', 0.5, 0.02, 0.36, 0, 0.01, 0, { r: 0.01 });
    b.box('enamel_white', 0.62, 0.42, 0.02, 0, 1.55, 0.03);
    b.plane(Lab(sign('檢傷分類', { w: 320, h: 200, bg: '#f2efe4', fg: '#a3201a', sub: 'TRIAGE · 第一級 紅 → 第五級 黑', border: '#a3201a', size: 0.42, k: 1.4, seed: 3 })), 0.58, 0.36, 0, 1.55, 0.042);
  }), { collide: true, near: false });
  void st;
  const tagCols = ['#c4231c', '#d8b818', '#2a8a3a', '#141414'];
  for (let i = 0; i < 22; i++) {
    const a = R.rng() * 6.28, d = 0.5 + R.rng() * 4;
    const t = tpl(`ttag:${i % 4}`, (b) => b.plane(Lab(sign(['一級', '二級', '三級', '死亡'][i % 4], { w: 64, h: 96, bg: tagCols[i % 4], fg: i % 4 === 3 ? '#ddd' : '#fff', size: 0.3, seed: i % 4 })), 0.07, 0.11, 0, 0.002, 0, { rx: -Math.PI / 2 }));
    if (R.freeAt(x + Math.cos(a) * d, z + Math.sin(a) * d)) R.put(t, x + Math.cos(a) * d, z + Math.sin(a) * d, R.rng() * 6.28);
  }
  // 拖向門外的血痕
  const door = R.doors[0];
  if (door) trail(R, [[x + 1.2, z + 0.4], [door.x - door.nx * 0.2, door.z - door.nz * 0.2], [door.x - door.nx * 2.4, door.z - door.nz * 2.4]], 'drag', 1.4, 1.1);
}
function quarantine(R) {
  for (const d of R.doors) {
    const yaw = Math.atan2(d.nx, d.nz);
    R.put(strips(1.9, 2.3), d.x, d.z, yaw);
    // 門外側牆面:斜貼的膠帶 + 隔離告示(已由結構標示放在走廊側;這裡加交叉膠帶)
    const ox = -d.nx * 1.02, oz = -d.nz * 1.02;
    const wall = R.L.charAt(R.li, Math.floor((d.x + ox + d.nz * 1.5) / 2), Math.floor((d.z + oz - d.nx * 1.5) / 2));
    if (wall === '#') R.put(tapeX(1.4), d.x + ox + d.nz * 1.6, d.z + oz - d.nx * 1.6, yaw + Math.PI, { y: R.y + 1.2 });
  }
}
function barricadeBroken(R) {
  const d = R.doors[0];
  if (!d) return;
  // 門內 1.6m 處:翻倒的桌子、疊起的椅子、地上的木板(都在「門口前一格」以外,規劃器會檢查可達)
  const bx = d.x + d.nx * 2.6, bz = d.z + d.nz * 2.6, yaw = Math.atan2(d.nx, d.nz);
  R.tryPut(tableLong(1.4, 0.7, 1), bx + d.nz * 1.0, bz - d.nx * 1.0, yaw + 0.4, { rx: Math.PI / 2 - 0.05, y: R.y + 0.36, h: 1.2 }) || R.floor(rotY(tableLong(1.4, 0.7, 1)), { jitter: 0.6 });
  for (let k = 0; k < 3; k++) R.dyn(chairShell(R.pick(['pl_teal', 'pl_orange', 'pl_blue']), k), bx - d.nz * (0.8 + k * 0.5), bz + d.nx * (0.8 + k * 0.5), R.rand(0, 6.28), { mass: 4, shape: 'box' }, { rz: k === 1 ? Math.PI / 2 : 0, y: k === 1 ? R.y + 0.22 : undefined });
  R.put(boards(5, 3), d.x + d.nx * 1.3, d.z + d.nz * 1.3, R.rand(0, 6.28));
  floorDecal(R, 'scratch', d.x + d.nx * 1.4, d.z + d.nz * 1.4, 1.4, { yaw });
}
function escapedPatient(R) {
  // 303 號房門 → 走廊 → 東樓梯間門口
  const L = R.L, li = R.li;
  const cellDoor = (() => { for (let c = 0; c < L.W; c++) { const z = L.zoneAt(li, c, 10); if (z?.id === 'f3_cell_3' && L.charAt(li, c, 11) === '+') return [c * 2 + 1, 23]; } return null; })();
  if (!cellDoor) return;
  const pts = [[cellDoor[0], 24.2], [cellDoor[0] + 3, 25.4], [70, 25.6], [79, 25.2], [80.5, 28], [80.6, 36.6], [82.8, 37]];
  trail(R, pts, 'feet', 0.9, 0.75, { alt: true, skip: 0.2 });
  R.put(straitjacket(), cellDoor[0] + 1.4, 25.2, 0.7);
  for (const run of R.walls) if (run.len > 6 && run.t0 < 78 && run.t1 > 64 && R.chance(0.6)) wallDecal(R, run, Math.min(run.t1 - 0.5, Math.max(run.t0 + 0.5, 70 + R.rand(-4, 6))), R.rand(1.0, 1.5), 'hand', 0.32);
}
function lobbyBlocked(R) {
  // 南側玻璃門內:推過去的長椅與木板(不在門格/門前格;起點與商店站位由規劃器排除)
  const exits = R.doors.filter((d) => R.L.charAt(R.li, d.c, d.r + 1) === ',' || R.L.charAt(R.li, d.c, d.r - 1) === ',');
  for (const d of exits.slice(0, 2)) {
    const bx = d.x + d.nx * 3.2, bz = d.z + d.nz * 3.2;
    R.put(boards(4, d.c), bx + 1.5, bz, R.rand(0, 3));
    R.dyn(cardboardBox(0.5, 0.4, 0.4, d.c, true), bx - 1.6, bz + 0.3, R.rand(0, 6), { mass: 3, shape: 'box' });
  }
}
function cafeteriaHide(R) {
  // 角落:翻倒的桌子當掩體,後面有毯子、罐頭、水瓶、手電筒
  const cs = [...R.allowed];
  if (!cs.length) return;
  const corner = cs.map((k) => [k % R.L.W, (k / R.L.W) | 0]).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]))[0];
  const x = corner[0] * 2 + 1, z = corner[1] * 2 + 1;
  R.tryPut(tableLong(1.8, 0.8, 0), x + 0.6, z + 0.9, 0, { rx: Math.PI / 2 - 0.08, y: R.y + 0.4, h: 1.2 });
  R.put(blanket(1), x - 0.2, z - 0.2, 0.3);
  litter(R, [['can', 8, { near: { x, z, r: 1.2 } }], ['cup', 4, { near: { x, z, r: 1.2 } }], ['paper', 5, { near: { x, z, r: 1.5 } }]]);
  scatter(R, 'pillbottle', 3, { near: { x, z, r: 1 } });
}
function morgueDrag(R) {
  const d = R.doors[0];
  if (!d) return;
  const { x, z } = R.center();
  trail(R, [[d.x + d.nx * 0.6, d.z + d.nz * 0.6], [x, z], [x + 3.2, z - 1.2]], 'drag', 1.3, 1.0);
  floorDecal(R, 'pool', x + 3.4, z - 1.3, 1.0);
}
function wardRestraint(R) {
  // 210:床邊一張翻倒的輪椅與點滴架,地上一圈乾掉的血與拖痕往床底
  const { x, z } = R.center();
  R.dyn(wheelchair(1), x + 0.8, z + 1.5, 1.2, { mass: 16, shape: 'box' }, { rz: Math.PI / 2, y: R.y + 0.3 });
  R.dyn(ivPole(1), x - 0.6, z + 1.8, 0, { mass: 5, shape: 'cylinder' }, { rx: Math.PI / 2 - 0.1, y: R.y + 0.05 });
  floorDecal(R, 'pool', x, z + 0.8, 1.1);
  trail(R, [[x, z + 0.8], [x - 1.4, z - 0.6]], 'drag', 1.2, 0.9);
}
// ---- [ghost] 更驚悚的佈置(輕量;不擋路) ----
// 走廊:翻倒的推床 + 一道從走廊拖進病房的痕跡(拖痕終點在某扇病房門內)
function corridorDrag(R) {
  const ds = R.doors.slice().sort(() => R.rng() - 0.5);
  const d = ds[0];
  if (!d) return;
  const sx = -d.nz, sz = d.nx; // 沿走廊方向
  const ax = d.x + d.nx * 1.1 + sx * 4.5, az = d.z + d.nz * 1.1 + sz * 4.5;
  trail(R, [[ax, az], [d.x + d.nx * 0.9, d.z + d.nz * 0.9], [d.x - d.nx * 1.6, d.z - d.nz * 1.6]], 'drag', 1.3, 0.9, { skip: 0.15 });
  floorDecal(R, 'pool', ax, az, 0.8);
  // 翻倒的推床(側躺,沿牆)
  const gx = d.x + d.nx * 1.4 - sx * 3.2, gz = d.z + d.nz * 1.4 - sz * 3.2;
  R.tryPut(gurney({ seed: 3 }), gx, gz, Math.atan2(sx, sz) + R.rand(-0.2, 0.2), { rz: Math.PI / 2 - 0.06, y: R.y + 0.34, h: 1.0 });
  scatter(R, 'paper', 4, { near: { x: gx, z: gz, r: 1.4 } });
}
// 大廳:散落的拖鞋(集合廣播那晚,大家被叫下來,只穿著拖鞋)
function lobbySlippers(R) {
  lobbyBlocked(R);
  const { x, z } = R.center();
  scatter(R, 'shoe', 9, { near: { x, z, r: 7 } });
}
// 洗衣房:晾著的白布(「床單不夠了,先用白布」),沿牆一排,下襬破爛
function laundrySheets(R) {
  const run = R.walls.filter((r) => r.len > 4).sort((a, b) => b.len - a.len)[0];
  if (!run) return;
  const ceil = R.L.ceilY(R.li, R.c0, R.r0) - R.y;
  for (let k = 0; k < 3; k++) {
    const t = run.t0 + 1.0 + k * 1.35;
    if (t > run.t1 - 0.8) break;
    const p = R.wallPos(run, t, 0.75);
    const w = 1.15;
    const t2 = tpl(`gh-sheet:${k}`, (b) => { b.raw('fab_white', curtainGeo([[-w / 2, 0], [w / 2, 0]], Math.min(ceil - 0.25, 2.3), 0.45 + k * 0.08, { pleat: 0.02, rag: 0.6, holes: 0.15, seed: 90 + k }), null, 'keep'); b.box('steel', w + 0.2, 0.012, 0.012, 0, Math.min(ceil - 0.25, 2.3) + 0.01, 0); });
    R.put(t2, p.x, p.z, run.yaw);
  }
}
// 地下維修隧道:翻倒的輪椅 + 往鍋爐房拖的痕跡
function tunnelDrag(R) {
  const { x, z } = R.center();
  R.dyn(wheelchair(2), x + 0.6, z + 0.4, R.rand(0, 6.28), { mass: 16, shape: 'box' }, { rz: Math.PI / 2, y: R.y + 0.3 });
  trail(R, [[x + 1.0, z + 0.6], [x + 4.5, z + 0.9], [x + 8.5, z + 0.4]], 'drag', 1.2, 1.0, { skip: 0.25 });
}
export const VIGNETTES = {
  f1_er: erTriage, f2_icu: quarantine, b1_morgue: (R) => { quarantine(R); morgueDrag(R); }, f2_ward_205: barricadeBroken, f3_corridor: escapedPatient,
  f1_lobby: lobbySlippers, f1_cafeteria: cafeteriaHide, f2_ward_210: wardRestraint, f2_nursery: barricadeBroken,
  f2_corridor: corridorDrag, f1_corridor: corridorDrag, b1_laundry: laundrySheets, b1_tunnel: tunnelDrag, // [ghost]
};
export function dressVignette(R, zone) {
  const fn = VIGNETTES[zone.id];
  if (fn) fn(R, zone);
  void bin; void posterSheet;
}
