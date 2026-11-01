// [scene6] 醫院的「設備層」:走廊牆上與門邊那些真實建築一定有、但不起眼的東西,讓空間讀起來像真的醫院。
//  - 門上的緊急照明燈(台灣常見的白盒雙燈頭,有的燈頭掉了)
//  - 病房/加護/產房門邊的壁掛乾洗手機(2003 年 SARS 時期每扇門都有)+ 下方滴痕
//  - 低位避難方向指示燈(白底綠色奔跑人形 + 箭頭,指向最近的樓梯)
//  - 外轉角的不鏽鋼護角
//  - 磨耗:門框兩側的手垢、門腳踢痕、推床撞牆的擦痕、走廊中央的動線磨耗、門口的鞋跟刮痕、雨夜從外面踩進來的泥腳印
// 全部是共用道具材質 + pi_lab / pi_glow / pi_decal 圖集,經 Room.put 進區域合併(不新增材質、不新增 draw call)。
import { tpl, L, G, led } from './parts.js';
import { D } from './geo.js';
import { labRect, glowRect, decalRect, atlasStats } from './atlas.js';
import { glowSwatch } from './art.js';
import { text } from './tex.js';
import { floorDecal, wallDecal, ctpl } from './clutter.js';

const HALF = Math.PI / 2;
const SIDE_YAW = { N: 0, S: Math.PI, W: HALF, E: -HALF };
const sideOf = (nx, nz) => (nz === 1 ? 'N' : nz === -1 ? 'S' : nx === 1 ? 'W' : 'E');
// 門的另一側是病人房間(門邊放乾洗手機)
const PATIENT = new Set(['ward', 'icu', 'peds_ward', 'nursery', 'delivery', 'surgery', 'er', 'playroom', 'psych_cell']);

// ---------------------------------------------------------------- 模板
// 緊急照明燈:白色塑膠盒 + 左右兩個可轉的圓燈頭 + 充電指示燈;k=1 一個燈頭掉了、只剩電線垂著
const emLight = (k = 0) => tpl(`svc:emlight:${k % 3}`, (b) => {
  b.box('pl_white', 0.34, 0.1, 0.07, 0, 0.05, 0.035);
  b.box('pl_gray', 0.3, 0.012, 0.004, 0, 0.026, 0.0715); // 下緣通風縫
  led(b, 0.12, 0.07, 0.071, k === 2 ? '#ff4020' : '#30ff60', 0.004);
  b.plane(L(emLabel()), 0.12, 0.03, -0.05, 0.068, 0.0712);
  for (const sx of [-1, 1]) {
    if (k === 1 && sx > 0) { b.tube('pl_dark', [[sx * 0.13, 0.1, 0.03], [sx * 0.14, 0.04, 0.05], [sx * 0.15, -0.06, 0.06]], 0.003, { seg: 3, bend: 0.03 }); continue; }
    b.cyl('pl_white', 0.012, 0.03, sx * 0.13, 0.11, 0.035, { seg: 6 }); // 轉軸
    b.push(sx * 0.13, 0.135, 0.04, -0.55, sx * 0.35, 0);
    b.cyl('pl_white', 0.042, 0.06, 0, 0, 0, { axis: 'z', seg: 8 });
    b.cyl('glass_frosted', 0.034, 0.004, 0, 0, 0.031, { axis: 'z', seg: 8 });
    b.pop();
  }
});
const emLabel = () => labRect('svc:emlabel', 96, 24, (c, w, h) => { c.fillStyle = '#eeeeea'; c.fillRect(0, 0, w, h); text(c, '緊急照明燈', w / 2, h / 2, { size: 13, color: '#333' }); });

// 壁掛乾洗手機(白色塑膠、按壓板、半透明窗看得到殘餘的酒精)+ 上方小告示
const sanRect = () => labRect('svc:sanit', 96, 72, (c, w, h) => {
  c.fillStyle = '#f2f0e6'; c.fillRect(0, 0, w, h); c.fillStyle = '#1d6e5a'; c.fillRect(0, 0, w, 16);
  text(c, '乾洗手', w / 2, 9, { size: 12, color: '#fff' });
  text(c, '進出病房', w / 2, 32, { size: 13, color: '#1a1a1a' });
  text(c, '請消毒雙手', w / 2, 50, { size: 13, color: '#b02020' });
  text(c, '感染管制委員會', w / 2, 64, { size: 8, color: '#555', weight: 'normal' });
});
const sanitizer = (k = 0) => tpl(`svc:sanit:${k % 2}`, (b) => {
  b.box('pl_white', 0.12, 0.24, 0.1, 0, 0.12, 0.05);
  b.box(k ? 'pl_gray' : 'pl_white', 0.1, 0.06, 0.03, 0, 0.06, 0.1, { rx: 0.25 }); // 按壓板
  b.box('pi_clear', 0.05, 0.08, 0.004, 0, 0.16, 0.1015); // 窗
  b.box('glass_amber', 0.044, k ? 0.012 : 0.03, 0.003, 0, k ? 0.128 : 0.137, 0.1005); // 殘餘的酒精
  b.cyl('pl_dark', 0.004, 0.012, 0, 0.012, 0.072, { seg: 6 }); // 出口
  b.box('paper', 0.13, 0.098, 0.002, 0, 0.36, 0.001); // 告示紙(貼在機器上方)
  b.plane(L(sanRect()), 0.124, 0.093, 0, 0.36, 0.0025);
});

// 低位避難方向指示燈(白底綠圖,箭頭 dir = 1 向右 / -1 向左;觀看者面對牆時的左右)
const evacRect = (dir) => glowRect(`svc:evac:${dir}`, 192, 72, (c, w, h) => {
  c.fillStyle = '#a3bca9'; c.fillRect(0, 0, w, h); // 白底(發光材質下偏暗一點,不要像一張亮白貼紙)
  c.strokeStyle = '#1a8a46'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6);
  const g = '#16924a';
  c.save(); if (dir < 0) { c.translate(w, 0); c.scale(-1, 1); }
  // 門框 + 奔跑的人(朝箭頭方向)
  c.fillStyle = g; c.fillRect(14, 12, 34, 50); c.fillStyle = '#a3bca9'; c.fillRect(18, 16, 26, 46);
  c.fillStyle = g; c.strokeStyle = g; c.lineCap = 'round'; c.lineWidth = 6;
  c.beginPath(); c.arc(70, 18, 6, 0, 6.28); c.fill();
  c.beginPath(); c.moveTo(68, 27); c.lineTo(62, 44); c.lineTo(72, 52); c.lineTo(70, 64); c.moveTo(62, 44); c.lineTo(52, 50); c.lineTo(46, 62); c.moveTo(66, 31); c.lineTo(78, 39); c.moveTo(66, 31); c.lineTo(54, 34); c.stroke();
  // 箭頭
  c.beginPath(); c.moveTo(96, 36); c.lineTo(156, 36); c.stroke();
  c.beginPath(); c.moveTo(178, 36); c.lineTo(150, 18); c.lineTo(150, 54); c.closePath(); c.fill();
  c.restore();
});
const evacSign = (dir) => tpl(`svc:evac:${dir}`, (b) => {
  b.box('alu', 0.4, 0.16, 0.035, 0, 0.08, 0.0175);
  b.box('pl_white', 0.37, 0.13, 0.004, 0, 0.08, 0.0365);
  b.plane(G(evacRect(dir)), 0.36, 0.125, 0, 0.08, 0.0386);
});

// 樓梯間防火門旁的告示(台灣每一扇安全門旁都有)
const fireDoorRect = () => labRect('svc:firedoor', 128, 64, (c, w, h) => {
  c.fillStyle = '#1a7a3c'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2f2ea'; c.fillRect(4, 4, w - 8, h - 8);
  text(c, '安全門', w / 2, 20, { size: 18, color: '#1a7a3c' });
  text(c, '請隨手關閉 勿堆放雜物', w / 2, 40, { size: 10, color: '#222' });
  text(c, 'FIRE DOOR  KEEP CLOSED', w / 2, 53, { size: 8, color: '#444', weight: 'normal' });
});
const fireDoorSign = () => tpl('svc:firedoorsign', (b) => { b.box('pl_white', 0.27, 0.14, 0.006, 0, 0.07, 0.003); b.plane(L(fireDoorRect()), 0.26, 0.13, 0, 0.07, 0.0065); });

// [scene7] 放射科門上的「X光 使用中」紅色燈箱(台灣醫院的招牌畫面;燈還微微亮著)
const xrayLampRect = () => glowRect('svc:xraylamp', 128, 48, (c, w, h) => {
  c.fillStyle = '#3a0806'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8281c';
  c.font = 'bold 18px "Microsoft JhengHei", sans-serif'; c.textAlign = 'center'; c.fillText('X光 使用中', w / 2, 22); c.font = 'bold 11px Arial'; c.fillText('X-RAY IN USE', w / 2, 40);
});
const xrayLamp = () => tpl('svc:xraylamp', (b) => { b.box('pl_white', 0.46, 0.18, 0.08, 0, 0.09, 0.04); b.plane(G(xrayLampRect()), 0.42, 0.15, 0, 0.09, 0.0805); });

// 外轉角的不鏽鋼護角(L 形 6cm × 6cm,高 h;m = ±1 決定轉角在模板 +X 或 -X 側)
const cornerGuard = (h, m) => tpl(`svc:corner:${h.toFixed(2)}:${m}`, (b) => {
  b.box('steel', 0.065, h, 0.0025, -m * 0.0325, h / 2, 0.00125); // 貼在原牆面
  b.box('steel', 0.0025, h, 0.065, m * 0.00125, h / 2, -0.0325); // 包到側面
});

// ---------------------------------------------------------------- 擺放
export function dressServices(R, zone) {
  if (typeof window !== 'undefined' && !window.__piAtlas) window.__piAtlas = atlasStats; // 開發:圖集用量
  const th = zone.theme;
  windowGlow(R, zone); // [scene7]
  if (th !== 'store' && th !== 'shop') liftLobby(R); // [scene7] 電梯廳:樓層顯示、呼叫鈕、故障告示 + 封鎖膠帶
  if (th === 'stairwell') stairNotes(R); // [scene7]
  if (th === 'corridor' || th === 'lobby' || th === 'waiting') corridor(R, zone);
  if (th === 'lobby' || th === 'corridor' || th === 'er' || th === 'store' || th === 'waiting') wetEntrance(R);
}

// 同一面牆上相鄰的門格合成一扇門:{ side, plane, t0, t1, other(另一側區域), out(另一側是戶外) }
function doorGroups(R) {
  const Lr = R.L, CELL = Lr.CELL, li = R.li;
  const list = R.doors.map((d) => {
    const side = sideOf(d.nx, d.nz), horiz = d.nx === 0;
    const plane = horiz ? d.z + d.nz * CELL / 2 : d.x + d.nx * CELL / 2;
    const t = horiz ? d.x : d.z;
    const oc = d.c - d.nx, or = d.r - d.nz; // 門的另一側
    return { side, horiz, plane, t, d, other: Lr.zoneAt(li, oc, or), out: (Lr.flagsAt(li, oc, or) & Lr.F.OUTDOOR) !== 0 };
  }).sort((a, b) => (a.side + a.plane).localeCompare(b.side + b.plane) || a.t - b.t);
  const out = [];
  for (const e of list) {
    const g = out[out.length - 1];
    if (g && g.side === e.side && g.plane === e.plane && Math.abs(e.t - CELL / 2 - g.t1) < 0.01) { g.t1 = e.t + CELL / 2; g.n++; continue; }
    out.push({ side: e.side, horiz: e.horiz, plane: e.plane, nx: e.d.nx, nz: e.d.nz, t0: e.t - CELL / 2, t1: e.t + CELL / 2, n: 1, other: e.other, out: e.out });
  }
  for (const g of out) g.h = g.out ? 2.5 : g.n >= 2 ? 2.6 : 2.3;
  return out;
}
// 牆段:找同一面牆、涵蓋 [a, b] 的實牆(不是窗)
const runAt = (R, g, a, b) => R.walls.find((r) => r.side === g.side && Math.abs(r.plane - g.plane) < 0.01 && r.t0 <= a && r.t1 >= b && !R.isWindow(r, a, b));
// 門洞上方沒有牆段 → 用門的平面做一個假的牆段給 atWall
const pseudoRun = (g) => ({ side: g.side, horiz: g.horiz, plane: g.plane, nx: g.nx, nz: g.nz, yaw: SIDE_YAW[g.side], t0: g.t0, t1: g.t1, len: g.t1 - g.t0, wins: [] });

function corridor(R, zone) {
  const Lr = R.L, li = R.li, rng = R.rng;
  const groups = doorGroups(R);
  const stairs = Lr.stairs.filter((s) => s.lower === li || s.upper === li).map((s) => ({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 }));
  const exits = groups.filter((g) => g.out || g.other?.theme === 'stairwell').map((g) => (g.horiz ? { x: (g.t0 + g.t1) / 2, z: g.plane } : { x: g.plane, z: (g.t0 + g.t1) / 2 }));
  const targets = exits.length ? exits : stairs;
  const nearDoor = (side, plane, t, pad) => groups.some((g) => g.side === side && Math.abs(g.plane - plane) < 0.01 && t > g.t0 - pad && t < g.t1 + pad);

  for (const g of groups) {
    const mid = (g.t0 + g.t1) / 2, pr = pseudoRun(g);
    const exitSign = g.out || g.other?.theme === 'stairwell';
    if (g.other?.theme === 'stairwell') { // 安全門告示:門邊 1.45m
      for (const t of [g.t1 + 0.42, g.t0 - 0.42]) { const run = runAt(R, g, t - 0.16, t + 0.16); if (run) { R.atWall(fireDoorSign(), run, t, { mount: 1.45, gap: 0.0 }); break; } }
    }
    // 門上的緊急照明燈(出口/樓梯門上方已經有綠色出口燈);放射科/電腦斷層門上改成「X光 使用中」燈箱
    if (g.other && (g.other.theme === 'xray' || g.other.theme === 'ct')) R.atWall(xrayLamp(), pr, mid, { mount: g.h + 0.15, gap: 0.0 });
    else if (!exitSign && rng() < 0.55) R.atWall(emLight(rng.int(0, 5) === 0 ? 1 : rng() < 0.15 ? 2 : 0), pr, mid + (g.n >= 2 ? 0 : rng.range(-0.3, 0.3)), { mount: g.h + 0.17, gap: 0.0 });
    // 門框兩側:手垢(手推門的高度)、門腳踢痕;病人房間的門邊再一台乾洗手機(把手那側,離門框 25cm)
    for (const [t, s] of [[g.t0 - 0.2, -1], [g.t1 + 0.2, 1]]) {
      const run = runAt(R, g, Math.min(t, t + s * 0.4), Math.max(t, t + s * 0.4));
      if (!run) continue;
      if (rng() < 0.85) wallDecal(R, run, t + s * 0.05, rng.range(0.95, 1.2), 'grime', rng.range(0.22, 0.32));
      if (rng() < 0.7) wallDecal(R, run, t + s * 0.18, 0.1, 'kick', rng.range(0.5, 0.8));
    }
    if (g.other && PATIENT.has(g.other.theme)) {
      const s = rng() < 0.5 ? 1 : -1, t = s > 0 ? g.t1 + 0.38 : g.t0 - 0.38;
      const run = runAt(R, g, t - 0.12, t + 0.12) || runAt(R, g, (s > 0 ? g.t0 - 0.38 : g.t1 + 0.38) - 0.12, (s > 0 ? g.t0 - 0.38 : g.t1 + 0.38) + 0.12);
      if (run) {
        const tt = run.t0 <= t - 0.12 && run.t1 >= t + 0.12 ? t : s > 0 ? g.t0 - 0.38 : g.t1 + 0.38;
        R.atWall(sanitizer(rng() < 0.4 ? 1 : 0), run, tt, { mount: 1.0, gap: 0.0 });
        if (rng() < 0.6) wallDecal(R, run, tt, 0.86, 'stain', 0.16); // 機器下方滴下來的酒精乾掉的黃漬
      }
    }
    // 門口地上:鞋跟/腳輪刮痕
    const inside = { x: g.horiz ? mid : g.plane + g.nx * 0.9, z: g.horiz ? g.plane + g.nz * 0.9 : mid };
    if (R.isReach(inside.x, inside.z) && rng() < 0.8) floorDecal(R, 'scuff', inside.x, inside.z, rng.range(1.2, 1.8));
  }
  // 走廊牆:低位避難方向指示燈(每 11~15m、避開門、窗、靠牆家具),推床擦痕
  for (const run of R.walls) {
    if (run.len < 3) continue;
    for (let t = run.t0 + rng.range(2, 6); t < run.t1 - 1; t += rng.range(11, 15)) {
      if (R.isWindow(run, t - 0.3, t + 0.3) || nearDoor(run.side, run.plane, t, 0.7)) continue;
      const f = R.at(run, t, 0.25);
      if (!R.freeAt(f.x, f.z)) continue;
      const p = R.at(run, t, 0);
      let best = null, bd = 1e9;
      for (const q of targets) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < bd) { bd = d; best = q; } }
      if (!best) continue;
      const ax = Math.cos(run.yaw), az = -Math.sin(run.yaw); // 模板 +X(觀看者右手邊)
      const dir = (best.x - p.x) * ax + (best.z - p.z) * az >= 0 ? 1 : -1;
      R.atWall(evacSign(dir), run, t, { mount: 0.42, gap: 0.0 });
    }
    if (run.len > 4) for (let t = run.t0 + rng.range(1, 4); t < run.t1 - 1; t += rng.range(5, 9)) {
      if (R.isWindow(run, t - 0.6, t + 0.6) || nearDoor(run.side, run.plane, t, 0.5)) continue;
      wallDecal(R, run, t, rng.range(0.72, 0.9), 'rub', rng.range(0.7, 1.3));
    }
  }
  // 外轉角護角:牆段結束、沿牆下一格可走、且下一格的牆側也空著(牆往外轉)
  const solid = (c, r) => (Lr.flagsAt(li, c, r) & (Lr.F.WALL | Lr.F.WINDOW | Lr.F.ELEVATOR)) !== 0;
  const seen = new Set(); // 同一個外轉角會是兩段牆的端點:只放一次
  for (const run of R.walls) {
    const [dc, dr] = run.side === 'N' ? [0, -1] : run.side === 'S' ? [0, 1] : run.side === 'W' ? [-1, 0] : [1, 0];
    for (const end of [0, 1]) {
      const [c, r] = end ? run.cells[run.cells.length - 1] : run.cells[0];
      const step = end ? 1 : -1, nc = run.horiz ? c + step : c, nr = run.horiz ? r : r + step;
      if (!(Lr.flagsAt(li, nc, nr) & Lr.F.WALK) || solid(nc + dc, nr + dr) || Lr.charAt(li, nc + dc, nr + dr) === '+') continue;
      const t = end ? run.t1 : run.t0;
      const ax = Math.cos(run.yaw), az = -Math.sin(run.yaw), tx = run.horiz ? 1 : 0, tz = run.horiz ? 0 : 1;
      const m = (ax * tx + az * tz) * (end ? 1 : -1) > 0 ? 1 : -1; // 轉角在模板 +X 還是 -X
      const p = R.at(run, t, 0), key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      R.put(cornerGuard(1.35, m), p.x, p.z, run.yaw, {});
      floorDecal(R, 'scuff', p.x + run.nx * 0.5 + (run.horiz ? step * 0.4 : 0), p.z + run.nz * 0.5 + (run.horiz ? 0 : step * 0.4), 1.1);
    }
  }
  // 牆腳的積塵堆:紙張、紙團、碎屑被腳步與推床推到牆邊(中間的動線反而乾淨),轉角與門邊最多
  const drift = (x, z, n, r, kinds) => {
    for (let k = 0, placed = 0; k < n * 3 && placed < n; k++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!R.freeAt(px, pz, 0.04)) continue;
      const name = kinds[(rng() * kinds.length) | 0];
      R.I(name, ctpl(name), px, R.y, pz, rng() * Math.PI * 2);
      placed++;
    }
  };
  const lv1 = Lr.levels[li].id === '1F';
  const dk = lv1 ? ['paper', 'paper2', 'leaf', 'leaf', 'leaf', 'butt'] : ['paper', 'paper2', 'paper3', 'paper', 'gauze', 'glove'];
  for (const run of R.walls) {
    if (run.len < 2) continue;
    for (let t = run.t0 + 0.3; t < run.t1 - 0.3; t += rng.range(1.2, 2.6)) {
      if (rng() < 0.45) continue;
      const p = R.at(run, t, rng.range(0.12, 0.3));
      drift(p.x, p.z, rng.int(1, 3), 0.18, dk);
    }
  }
  // 往出口/樓梯的逃生動線:越靠近門,地上掉的病歷紙、表單、手套越多(當年把病人往外推時掉的)
  for (const g of groups) {
    if (!(g.out || g.other?.theme === 'stairwell')) continue;
    const mid = (g.t0 + g.t1) / 2;
    for (let k = 0; k < 9; k++) {
      const dd = 0.8 + Math.pow(rng(), 1.6) * 5.5, o = rng.range(-1.4, 1.4);
      const x = g.horiz ? mid + o : g.plane + g.nx * dd, z = g.horiz ? g.plane + g.nz * dd : mid + o;
      drift(x, z, rng.int(1, 3), 0.35, ['paper', 'paper2', 'paper3', 'file', 'glove', 'paper']);
    }
  }
  // 走廊中央的動線磨耗:沿每個長矩形的中線,一段一段的 lane 貼花
  if (zone.theme === 'corridor') for (const [c0, r0, c1, r1] of zone.rects) {
    const w = (c1 - c0 + 1) * 2, h = (r1 - r0 + 1) * 2;
    if (Math.min(w, h) > 6 || Math.max(w, h) < 8) continue;
    const alongX = w > h, len = Math.max(w, h), cx = c0 * 2 + w / 2, cz = r0 * 2 + h / 2;
    for (let s = 1.4; s < len - 1.4; s += 2.5) {
      const x = alongX ? c0 * 2 + s : cx + rng.range(-0.15, 0.15), z = alongX ? cz + rng.range(-0.15, 0.15) : r0 * 2 + s;
      if (!R.isReach(x, z)) continue;
      floorDecal(R, 'lane', x, z, rng.range(1.5, 1.8), { yaw: (alongX ? HALF : 0) + rng.range(-0.04, 0.04) + (rng() < 0.5 ? Math.PI : 0) });
    }
  }
}

// 通往戶外的門:門內 3m 的積水、泥腳印、樹葉(雨夜)
function wetEntrance(R) {
  const rng = R.rng;
  for (const g of doorGroups(R)) {
    if (!g.out) continue;
    const mid = (g.t0 + g.t1) / 2;
    const at = (d, o = 0) => ({ x: g.horiz ? mid + o : g.plane + g.nx * d, z: g.horiz ? g.plane + g.nz * d : mid + o });
    const yawIn = Math.atan2(g.nx, g.nz) + Math.PI; // 腳印朝裡走(貼花 +V 朝 -Z)
    for (let k = 0; k < 3; k++) { const p = at(0.7 + k * 0.9, rng.range(-0.5, 0.5)); if (R.isReach(p.x, p.z)) floorDecal(R, 'water', p.x, p.z, rng.range(1.0, 1.6)); }
    for (let k = 0; k < 2; k++) { const p = at(1.4 + k * 1.6, (k ? -0.35 : 0.3) * (g.n >= 2 ? 1.6 : 1)); if (R.isReach(p.x, p.z)) floorDecal(R, 'mud', p.x, p.z, 0.6, { yaw: yawIn + rng.range(-0.25, 0.25) }); }
    const p = at(0.5); if (R.isReach(p.x, p.z)) floorDecal(R, 'dirt', p.x, p.z, 1.4);
  }
}

// ---------------------------------------------------------------- 病床邊(病房最常被近看的地方)
// 床的本地座標(medical.hospitalBed):床頭在 -Z(貼牆)、床尾 +Z、寬 ±0.46、床墊面 y≈0.69
// 藍白拖(台灣人住院必備)、床下的臉盆、從床頭面板垂到枕邊的叫人鈴、床尾欄上掛的毛巾
const slippers = (k) => tpl(`svc:slipper:${k % 2}`, (b) => {
  for (const [sx, sz, ry] of [[-0.07, 0, 0.12 + k * 0.3], [0.08, 0.05 + k * 0.08, -0.2 - k * 0.5]]) {
    b.push(sx, 0, sz, 0, ry, 0);
    b.box('pl_white', 0.1, 0.018, 0.26, 0, 0.009, 0);
    b.tube('pl_blue', [[-0.048, 0.016, -0.06], [-0.035, 0.05, -0.04], [0.035, 0.05, -0.04], [0.048, 0.016, -0.06]], 0.012, { seg: 4, bend: 0.02 });
    b.box('pl_blue', 0.094, 0.006, 0.024, 0, 0.051, -0.04);
    b.pop();
  }
});
const basin = (k) => tpl(`svc:basin:${k % 2}`, (b) => {
  b.lathe(k ? 'pl_pink' : 'pl_ltblue', [[0, 0.004], [0.1, 0], [0.13, 0.03], [0.15, 0.085], [0.165, 0.09], [0.16, 0.095], [0.14, 0.06], [0.1, 0.012], [0, 0.016]], 0, 0, 0, { seg: 10 });
  b.box('fab_white', 0.18, 0.02, 0.12, 0.02, 0.03, 0.01, { ry: 0.4 }); // 一條毛巾
});
const callCord = (k) => tpl(`svc:callcord:${k % 2}`, (b) => {
  const s = k ? -1 : 1;
  b.tube('pl_gray', [[s * 0.28, 1.34, -0.9], [s * 0.36, 1.05, -0.86], [s * 0.42, 0.8, -0.78], [s * 0.37, 0.715, -0.66]], 0.004, { seg: 4, bend: 0.06 });
  b.push(s * 0.34, 0.73, -0.64, 0.1, 0.3 * s, HALF);
  b.box('pl_beige', 0.03, 0.1, 0.035, 0, 0, 0);
  b.cyl('pl_red', 0.008, 0.006, 0, 0.02, 0.019, { axis: 'z', seg: 8 });
  b.pop();
});
const railTowel = () => tpl('svc:railtowel', (b) => {
  b.box('fab_white', 0.38, 0.012, 0.06, 0.05, 0.875, 1.06, { r: 0.004 }); // 搭在床尾欄上
  b.box('fab_white', 0.38, 0.22, 0.008, 0.05, 0.76, 1.09, { r: 0.004, rx: 0.06 });
  b.box('fab_white', 0.38, 0.18, 0.008, 0.05, 0.79, 1.035, { r: 0.004, rx: -0.05 });
});
export function bedside(R, p, k, kind) {
  const r = R.rng;
  if (kind === 'body') return;
  if (r() < 0.75) R.putRel(callCord(k), p, 0, 0, 0);
  if (r() < 0.55) R.putRel(basin(k + 1), p, (r() - 0.5) * 0.3, 0, -0.45 + r() * 0.3, 0, r() * 6);
  if (kind !== 'stripped' && r() < 0.6) { const q = R.local(p, (r() < 0.5 ? -1 : 1) * 0.68, 0, 0.15 + r() * 0.5); if (R.freeAt(q.x, q.z, 0.1)) R.put(slippers(k), q.x, q.z, p.yaw + (r() - 0.5) * 1.2, { collide: false }); }
  if (kind === 'made' && r() < 0.35) R.putRel(railTowel(), p, 0, 0, 0);
}

// ---------------------------------------------------------------- [scene7] 從外面看得到的窗內微光
// 夜裡從停車場看,一整片黑牆讀不出是建築:依房間裡「還在亮的東西」在窗玻璃後面放一片很暗的發光面
// (緊急紅燈、監視器藍綠、夜燈粉紅、燭光、商店暖光、少數還亮著的日光燈)。窗簾/木板/鐵條在它前面 → 剪影。
// 只放南/東/西向的外窗(北面後巷「只有 207 亮著」是故事的畫面);發光面單面朝外,從房間裡看不到。
// pi_glow 圖集 + 區域合併,不新增材質。
const WIN_GLOW = { emergency: '#b02a1e', monitor: '#307888', nightlight: '#94465a', candle: '#b06420', sconce: '#b06420', warm: '#c8964c', lamp: '#a07030', surgical: '#56685f', fluoro_cold: '#4a6274', fluoro: '#4e6650', fluoro_dying: '#44564a', sodium: '#a0621e', bare_bulb: '#8a6030', moon: '#3e4c64' }; // [scene7 r2] ×1.5:30m 外雨霧裡要讀得到
const winGlowRect = (col, k) => glowRect(`svc:wglow:${col}:${k}`, 64, 48, (c, w, h) => {
  const g = c.createRadialGradient(w * (0.4 + k * 0.2), h * 0.35, 2, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, col); g.addColorStop(1, '#030303'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.85)'; // 窗下的家具剪影(床尾、櫃子、椅背)
  if (k === 0) { c.fillRect(4, h - 12, 26, 12); c.fillRect(40, h - 8, 18, 8); } else { c.fillRect(30, h - 14, 30, 14); c.fillRect(6, h - 20, 3, 20); }
});
const winGlow = (col, k) => tpl(`svc:wglow:${col}:${k}`, (b) => b.plane(G(winGlowRect(col, k)), 1.78, 1.42, 0, 0.71, 0));
export function windowGlow(R, zone) {
  const th = zone.theme;
  if (zone.id === 'f2_ward_207') return; // 207 有自己的燈
  let col = th === 'shop' ? WIN_GLOW.warm : WIN_GLOW[zone.light];
  if (!col || (zone.light === 'moon' && th !== 'lobby')) return; // 月光區只有大廳(裡面還有幾盞燈)
  const sparse = /^fluoro|surgical/.test(zone.light) || th === 'corridor'; // 日光燈的房間/走廊:大多已經壞了,只有少數窗還有一點冷光
  const L = R.L, li = R.li;
  for (const run of R.walls) {
    if (run.side === 'N' || !run.wins.length) continue;
    const [dc, dr] = run.side === 'S' ? [0, 1] : run.side === 'W' ? [-1, 0] : [1, 0];
    for (const p of run.wins) {
      const [c, r] = run.horiz ? [p, (run.cells[0][1])] : [run.cells[0][0], p];
      const oc = c + dc * 2, or = r + dr * 2; // 窗格再往外一格
      if (!(L.flagsAt(li, oc, or) & L.F.OUTDOOR) && L.ceilY(li, oc, or) !== Infinity) continue;
      const h = hashN(li * 977 + c * 31 + r * 7);
      if (sparse && h > 0.28) continue;
      const pos = R.at(run, (p + 0.5) * L.CELL, -1.56);
      R.put(winGlow(col, h < 0.5 ? 0 : 1), pos.x, pos.z, run.yaw + Math.PI, { y: R.y + 0.95 });
    }
  }
}
const hashN = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- [scene7] 電梯廳與樓梯間
const liftIndRect = () => labRect('svc:liftind', 128, 28, (c, w, h) => {
  c.fillStyle = '#121414'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a2a1a'; c.font = 'bold 15px sans-serif';
  ['B1', '1', '2', '3'].forEach((t, i) => c.fillText(t, 26 + i * 24, 20)); c.fillText('▲', 4, 15); c.fillText('▼', 108, 22);
});
const liftOutRect = () => labRect('svc:liftout', 72, 100, (c, w, h) => {
  c.fillStyle = '#e8d43a'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 5, w, 5);
  text(c, '電梯故障', w / 2, 26, { size: 15, color: '#9a1010' }); text(c, '暫停使用', w / 2, 48, { size: 15, color: '#111' });
  text(c, '請改走樓梯', w / 2, 70, { size: 11, color: '#111', weight: 'normal' }); text(c, '總務室 92.5', w / 2, 88, { size: 8, color: '#444', weight: 'normal' });
});
const liftPanel = () => tpl('svc:liftpanel', (b) => {
  b.box('steel', 0.12, 0.27, 0.012, 0, 0.135, 0.006);
  for (const [yy, lit] of [[0.19, true], [0.09, false]]) { b.cyl('pl_white', 0.02, 0.008, 0, yy, 0.016, { axis: 'z', seg: 10 }); if (lit) b.cyl(G(glowSwatch('liftbtn', '#ff8a18')), 0.01, 0.003, 0, yy, 0.0215, { axis: 'z', seg: 8 }); }
});
const liftInd = () => tpl('svc:liftind', (b) => { b.box('steel', 0.52, 0.15, 0.025, 0, 0.075, 0.0125); b.plane(L(liftIndRect()), 0.48, 0.105, 0, 0.075, 0.0255); });
const liftOut = () => tpl('svc:liftout', (b) => {
  b.plane(L(liftOutRect()), 0.3, 0.42, 0, 1.5, 0.012);
  for (const s of [-1, 1]) b.box('pl_yellow', 2.3, 0.06, 0.003, 0, 1.1, 0.008 + (s > 0 ? 0.004 : 0), { rz: s * 0.78 }); // 封鎖膠帶 X
});
function liftLobby(R) {
  const L2 = R.L, li = R.li, rng = R.rng;
  for (const run of R.walls) {
    const [dc, dr] = run.side === 'N' ? [0, -1] : run.side === 'S' ? [0, 1] : run.side === 'W' ? [-1, 0] : [1, 0];
    for (const [c, r] of run.cells) {
      if (L2.charAt(li, c + dc, r + dr) !== 'E') continue;
      const t0 = (run.horiz ? c : r) * L2.CELL, mid = t0 + L2.CELL / 2;
      R.atWall(liftInd(), run, mid, { mount: 2.3, gap: 0.0 });
      if (((c * 7 + r * 3 + li) % 3) !== 1) R.atWall(liftOut(), run, mid, { mount: 0, gap: 0.085, collide: false }); // 大多數電梯門貼著故障告示 + 封鎖膠帶(門框凸出牆面,膠帶要在門框外 8.5cm)
      const side = run.t1 >= t0 + L2.CELL + 0.4 && L2.charAt(li, c + dc + (run.horiz ? 1 : 0), r + dr + (run.horiz ? 0 : 1)) !== 'E' ? 1 : -1;
      const tp = side > 0 ? t0 + L2.CELL + 0.25 : t0 - 0.25;
      if (tp > run.t0 + 0.1 && tp < run.t1 - 0.1) R.atWall(liftPanel(), run, tp, { mount: 1.0, gap: 0.0 });
    }
  }
}
// 樓梯間:保持暢通的告示、紅漆噴字(往下的箭頭)、平台角落多一點垃圾
const stairNote = () => labRect('svc:stairnote', 96, 64, (c, w, h) => {
  c.fillStyle = '#efe9d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#1a6a3a'; c.fillRect(0, 0, w, 14);
  text(c, '安全梯', w / 2, 8, { size: 10, color: '#fff' }); text(c, '禁止堆放雜物', w / 2, 30, { size: 12, color: '#b01818' }); text(c, '保持通道暢通', w / 2, 48, { size: 11, color: '#222', weight: 'normal' });
});
const sprayRect = (k) => decalRect(`svc:spray:${k}`, 160, 96, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.globalAlpha = 0.85; c.strokeStyle = k ? 'rgba(20,18,16,0.9)' : 'rgba(150,20,14,0.9)'; c.fillStyle = c.strokeStyle; c.lineWidth = 7; c.lineCap = 'round';
  if (k === 0) { c.font = 'bold 40px "Microsoft JhengHei", sans-serif'; c.fillText('出口', 12, 52); c.beginPath(); c.moveTo(120, 14); c.lineTo(120, 80); c.moveTo(102, 60); c.lineTo(120, 82); c.lineTo(138, 60); c.stroke(); }
  else { c.font = 'bold 22px sans-serif'; c.fillText('正 正 正 丅', 8, 40); c.lineWidth = 3; c.beginPath(); c.moveTo(8, 60); c.lineTo(150, 58); c.stroke(); }
  c.globalAlpha = 0.5; for (let i = 0; i < 6; i++) { c.fillRect(20 + i * 22, 56 + (i % 2) * 6, 2, 18 + i * 3); } // 噴漆滴下
});
function stairNotes(R) {
  const runs = R.walls.filter((r) => r.len >= 2).sort((a, b) => b.len - a.len);
  if (runs[1]) R.atWall(tpl('svc:stairnotesheet', (b) => { b.box('paper', 0.3, 0.2, 0.002, 0, 0.1, 0.001); b.plane(L(stairNote()), 0.29, 0.19, 0, 0.1, 0.0025); }), runs[1], runs[1].t1 - 0.5, { mount: 1.45, gap: 0.0 });
  const k = R.L.levels[R.li].id === '1F' || R.L.levels[R.li].id === 'B1' ? 0 : 1;
  const run = runs[2] || runs[0];
  if (run) { const rect = sprayRect(k); const t = tpl(`svc:spray:${k}`, (b) => b.plane(D(rect), 0.8, 0.48, 0, 0, 0)); const p = R.wallPos(run, (run.t0 + run.t1) / 2, 0.007); R.put(t, p.x, p.z, run.yaw, { y: R.y + 1.25 }); }
  const cells = [...R.plain]; let placed = 0;
  for (let i = 0; i < 40 && placed < 10; i++) { const key = cells[(R.rng() * cells.length) | 0]; if (key == null) break; const x = ((key % R.L.W) + R.rng()) * 2, z = (((key / R.L.W) | 0) + R.rng()) * 2; if (!R.freeAt(x, z, 0.1)) continue; const n = ['debris', 'paper', 'paper2', 'can', 'butt'][(R.rng() * 5) | 0]; R.I(n, ctpl(n), x, R.y, z, R.rng() * 6.28); placed++; }
}
