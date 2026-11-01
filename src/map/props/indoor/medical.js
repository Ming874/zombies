import { B, tpl, HALF, L, G, THREE, caster, glide, bigWheel, barHandle, drawer, shell, labelHolder, screws, led, win, cable, knob } from './parts.js';
import { curtainGeo, sheetOverBody } from './cloth.js';
import { bedChart, monitorScreen, glowSwatch, sign, toeTag, form } from './art.js';

// 醫療家具與設備(病床、床頭櫃、點滴架、床頭氧氣面板、隔簾、輪椅、推床、監視器、急救車…)
// 模板原點在底面中心,+Z 朝房內(床:床頭在 -Z 靠牆)。

// ---------------------------------------------------------------- 病床
// v: { kind: 'made'|'stripped'|'body'|'bare'|'messy', head: 抬起角度, frame: 表面, rail: 'up'|'down'|'mixed', seed }
// 床號牌/病歷用 bedTags() 另外放(才不會每張床都是不同模板)
export function hospitalBed(v = {}) {
  const seed = (v.seed ?? 1) % 2;
  const key = `${v.kind ?? 'made'}:${v.head ?? 0}:${v.frame ?? ''}:${v.rail ?? 'up'}:${seed}`;
  return tpl(`bed:${key}`, (b) => {
    const frame = v.frame ?? (seed ? 'enamel_cream' : 'enamel_white'), tube = 'chrome', panel = seed ? 'pl_beige' : 'pl_cream';
    const LZ = 1.0, WX = 0.46, deckY = 0.5;
    // 底座 + 腳輪
    for (const sx of [-1, 1]) b.box(frame, 0.05, 0.05, 1.86, sx * 0.36, 0.2, 0);
    for (const sz of [-1, 1]) b.box(frame, 0.76, 0.04, 0.05, 0, 0.2, sz * 0.82);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.38, sz * 0.9, 0.175, { r: 0.065, brake: sz > 0, yaw: seed + sx * 0.6 + sz });
    // 升降支架(X 形)
    for (const sx of [-1, 1]) {
      b.rod(frame, 0.016, [sx * 0.3, 0.22, -0.55], [sx * 0.3, deckY - 0.04, 0.35], { seg: 6 });
      b.rod(frame, 0.016, [sx * 0.3, 0.22, 0.35], [sx * 0.3, deckY - 0.04, -0.55], { seg: 6 });
    }
    // 床架
    for (const sx of [-1, 1]) b.box(frame, 0.04, 0.07, 2.0, sx * WX, deckY, 0, { r: 0.008 });
    for (const sz of [-1, 1]) b.box(frame, WX * 2, 0.05, 0.04, 0, deckY, sz * LZ);
    const a = v.head ?? 0;
    b.box('enamel_gray', 0.86, 0.012, 1.18, 0, deckY + 0.03, 0.34);
    b.push(0, deckY + 0.03, -0.25, -a, 0, 0);
    b.box('enamel_gray', 0.86, 0.012, 0.72, 0, 0, -0.36);
    b.pop();
    const kind = v.kind ?? 'made';
    const mT = 0.14, mY = deckY + 0.04;
    if (kind !== 'bare') {
      b.box('mattress', 0.88, mT, 1.2, 0, mY + mT / 2, 0.35, { r: 0.035 });
      b.push(0, mY, -0.25, -a, 0, 0);
      b.box('mattress', 0.88, mT, 0.73, 0, mT / 2, -0.365, { r: 0.035 });
      if (kind === 'made' || kind === 'messy') {
        b.box('fab_white', 0.9, 0.012, 0.74, 0, mT + 0.005, -0.37);
        b.box('fab_white', 0.58, 0.11, 0.36, 0, mT + 0.06, -0.52, { r: 0.045, rx: 0.08, ry: seed * 0.12 - 0.06 }); // 枕頭
      }
      b.pop();
      if (kind === 'made' || kind === 'messy') {
        b.box('fab_white', 0.9, 0.012, 1.22, 0, mY + mT + 0.005, 0.35);
        for (const sx of [-1, 1]) b.plane('fab_white', 1.95, 0.2, sx * 0.452, mY + mT - 0.09, 0.0, { ry: sx * HALF });
        const blanket = seed ? 'fab_beige' : 'fab_blue';
        if (kind === 'made') b.box(blanket, 0.92, 0.05, 0.42, 0, mY + mT + 0.035, 0.72, { r: 0.02 });
        else b.box(blanket, 0.94, 0.04, 0.9, 0.06, mY + mT + 0.03, 0.42, { r: 0.018, rz: 0.03, ry: 0.09 });
      }
      if (kind === 'stripped') b.box('pl_clear', 0.6, 0.002, 0.5, 0.1, mY + mT + 0.002, 0.2);
    }
    if (kind === 'body') {
      const g = sheetOverBody({ w: 0.88, len: 1.92, drop: 0.24, seed: 8, offZ: 0.02 });
      g.translate(0, mY + mT, 0);
      b.raw('fab_white', g);
      // 手從白布下垂出床邊
      b.push(0.47, mY + mT - 0.02, -0.02, 0, 0, -1.25);
      b.rod('skin_dead', 0.028, [0, 0, 0], [0.24, 0, 0.02], { seg: 8, r2: 0.024 });
      b.box('skin_dead', 0.085, 0.022, 0.06, 0.29, 0, 0.025, { r: 0.01, rz: 0.15 });
      for (let f = 0; f < 4; f++) b.rod('skin_dead', 0.007, [0.33, 0, 0.005 + f * 0.016], [0.39, -0.02 + f * 0.003, 0.005 + f * 0.018], { seg: 4 });
      b.pop();
    }
    // 床頭板 / 床尾板
    const board = (z, h, foot) => {
      b.tube(tube, [[-WX, mY - 0.02, z], [-WX, h, z], [WX, h, z], [WX, mY - 0.02, z]], 0.016, { seg: 6, bend: 0.06 });
      b.box(panel, WX * 2 - 0.08, h - mY - 0.14, 0.022, 0, (h + mY) / 2 + 0.01, z, { r: 0.008 });
      for (const sx of [-1, 1]) b.cyl('rubber', 0.035, 0.03, sx * (WX + 0.02), h - 0.12, z, { axis: 'x', seg: 8 });
      if (foot) {
        b.box('chrome', 0.11, 0.15, 0.006, 0.18, h - 0.2, z + 0.014); // 病歷夾座
        b.rod('chrome', 0.008, [-0.25, 0.4, z + 0.02], [-0.25, 0.4, z + 0.1], { seg: 5 }); // 搖柄
        b.rod('chrome', 0.008, [-0.25, 0.4, z + 0.1], [-0.25, 0.28, z + 0.13], { seg: 5 });
        b.cyl('pl_black', 0.014, 0.07, -0.25, 0.25, z + 0.14, { seg: 6 });
      } else b.box('pl_white', 0.13, 0.065, 0.004, 0, h - 0.11, z + 0.012);
    };
    board(-LZ - 0.03, 1.0, false);
    board(LZ + 0.03, 0.86, true);
    // 側欄
    const rails = v.rail ?? 'up';
    for (const sx of [-1, 1]) {
      const down = rails === 'down' || (rails === 'mixed' && sx > 0);
      const y0 = down ? mY + 0.02 : mY + mT + 0.06, y1 = y0 + (down ? 0.14 : 0.26);
      const x = sx * (WX + 0.025);
      b.tube(tube, [[x, y0, -0.72], [x, y1, -0.72], [x, y1, 0.45], [x, y0, 0.45]], 0.013, { seg: 6, bend: 0.05 });
      b.rod(tube, 0.009, [x, (y0 + y1) / 2, -0.72], [x, (y0 + y1) / 2, 0.45], { seg: 5 });
    }
    b.surface(-0.4, -0.2, 0.4, 0.9, mY + mT + 0.02);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.5, 0, -1.04), new THREE.Vector3(0.5, 0.95, 1.04));
    b.meta.mattressY = mY + mT;
  });
}
// 床號牌 + 床尾病歷(每床不同的小模板)
export function bedTags(R, p, n) {
  const head = tpl(`bedno:${n}`, (b) => b.plane(L(sign(String(n), { w: 96, h: 48, bg: '#e8e4d8', size: 0.62, seed: n })), 0.12, 0.06, 0, 0, 0));
  const chart = tpl(`bedchart:${n % 6}`, (b) => b.plane(L(bedChart(100 + (n % 6))), 0.1, 0.135, 0, 0, 0));
  R.putRel(head, p, 0, 0.89, -1.03 + 0.0145, 0, 0, 0);
  R.putRel(chart, p, 0.18, 0.66, 1.03 + 0.0175, 0, 0, 0);
}

// ---------------------------------------------------------------- 床頭櫃
export function nightstand(seed = 1) {
  return tpl(`nightstand:${seed % 4}`, (b) => {
    b.win = win(seed + 11);
    const s = ['enamel_cream', 'pl_beige', 'enamel_mint', 'enamel_white'][seed % 4];
    const w = 0.46, h = 0.82, d = 0.44;
    const inn = shell(b, w, h, d, s, { base: 0.07, plinth: 'pl_dark' });
    // 頂面後擋
    b.bb(s, -w / 2, h, -d / 2, w / 2, h + 0.05, -d / 2 + 0.015, { r: 0.004 });
    for (const sx of [-1, 1]) b.bb(s, sx * w / 2 - 0.0075, h, -d / 2, sx * w / 2 + 0.0075, h + 0.05, 0.02, { r: 0.004 });
    drawer(b, 0, h - 0.11, d / 2 - 0.02, w - 0.04, 0.15, s, { hs: 'chrome' });
    b.bb('enamel_dark', inn.x0, 0.45, inn.z0, inn.x1, 0.47, inn.z1 - 0.02); // 開放層板
    b.bb('enamel_dark', inn.x0, 0.47, inn.z0, inn.x1, 0.62, inn.z0 + 0.01);
    // 下門(半開)
    b.push(-w / 2 + 0.02, 0.07, d / 2, 0, (seed % 3) * 0.35, 0);
    b.box(s, w - 0.04, 0.36, 0.02, (w - 0.04) / 2, 0.19, 0.01, { r: 0.004 });
    barHandle(b, w - 0.1, 0.3, 0.02, 0.08, 'chrome', { vertical: true });
    b.pop();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) glide(b, sx * 0.18, sz * 0.16, 0.025, 0.07, 'pl_dark');
    b.surface(-0.2, -0.18, 0.2, 0.18, h);
    b.surface(-0.2, -0.18, 0.2, 0.15, 0.47);
  });
}

// ---------------------------------------------------------------- 點滴架
export function ivPole(v = 1) {
  return tpl(`iv:${v}`, (b) => {
    const R = 0.28;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      b.rod('chrome', 0.011, [0, 0.11, 0], [Math.cos(a) * R, 0.08, Math.sin(a) * R], { seg: 6 });
      glide(b, Math.cos(a) * R, Math.sin(a) * R, 0.026, 0.07, 'rubber');
    }
    b.cyl('chrome', 0.026, 0.06, 0, 0.12, 0, { seg: 10 });
    b.cyl('chrome', 0.0125, 1.15, 0, 0.7, 0, { seg: 8 });
    b.cyl('chrome', 0.01, 0.75, 0, 1.6, 0, { seg: 8 });
    b.cyl('pl_dark', 0.02, 0.04, 0, 1.24, 0, { seg: 8 }); // 鎖緊環
    for (let i = 0; i < 4; i++) { // 吊鉤
      const a = (i / 4) * Math.PI * 2;
      b.tube('chrome', [[0, 1.95, 0], [Math.cos(a) * 0.09, 1.97, Math.sin(a) * 0.09], [Math.cos(a) * 0.11, 1.93, Math.sin(a) * 0.11]], 0.004, { seg: 4, bend: 0.02 });
    }
    const bags = v % 3;
    for (let k = 0; k < bags; k++) {
      const a = k * Math.PI * 0.9, x = Math.cos(a) * 0.11, z = Math.sin(a) * 0.11;
      b.push(x, 1.74, z, 0, -a, 0);
      b.box('pi_iv', 0.11, 0.18, 0.025, 0, 0, 0, { r: 0.01 });
      b.box('pi_fluid', 0.095, 0.1 - k * 0.05, 0.018, 0, -0.035 - k * 0.025, 0, { r: 0.006 });
      b.plane(L(sign('0.9% NaCl', { w: 96, h: 64, bg: '#eef2ee', fg: '#204060', size: 0.3, sub: '500 mL', seed: k })), 0.07, 0.045, 0, 0.02, 0.0135);
      b.cyl('pl_white', 0.006, 0.03, 0, -0.105, 0, { seg: 6 });
      b.cyl('pi_iv', 0.009, 0.05, 0, -0.15, 0, { seg: 8 }); // 滴管
      b.pop();
      b.tube('pl_clear', [[x, 1.56, z], [x * 1.4, 1.2, z * 1.4], [x * 2 + 0.05, 0.75, z * 2], [x * 2.4 + 0.1, 0.95, z * 2.2]], 0.0025, { seg: 4, bend: 0.12 });
    }
    if (v >= 3) { // 輸液幫浦
      b.push(0, 1.15, 0.05);
      b.box('pl_beige', 0.16, 0.22, 0.12, 0, 0, 0.04, { r: 0.012 });
      b.plane(G(monitorScreen('pump')), 0.08, 0.04, 0, 0.05, 0.101);
      for (let i = 0; i < 6; i++) b.box('pl_gray', 0.018, 0.012, 0.006, -0.035 + (i % 3) * 0.035, -0.03 - ((i / 3) | 0) * 0.025, 0.101, { r: 0.002 });
      led(b, 0.06, 0.08, 0.101, '#ffa020');
      b.pop();
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 2, 0.2));
  });
}

// ---------------------------------------------------------------- 床頭氧氣/設備面板(壁掛,背面 z=0 貼牆)
export function headwall(w = 1.3, seed = 1) {
  return tpl(`headwall:${w}:${seed % 3}`, (b) => {
    b.win = win(seed + 3);
    b.box('alu', w, 0.24, 0.05, 0, 0.12, 0.025, { r: 0.01 });
    b.box('pl_white', w - 0.04, 0.17, 0.006, 0, 0.12, 0.052, { r: 0.004 });
    const outlet = (x, ring, lab) => {
      b.cyl(ring, 0.026, 0.02, x, 0.13, 0.06, { axis: 'z', seg: 8 });
      b.cyl('chrome', 0.012, 0.03, x, 0.13, 0.075, { axis: 'z', seg: 6 });
      b.plane(L(sign(lab, { w: 64, h: 32, bg: ring === 'pl_green' ? '#2a8a4a' : ring === 'pl_yellow' ? '#c8a020' : '#e8e8e0', fg: '#fff', size: 0.6 })), 0.045, 0.022, x, 0.04, 0.0555);
    };
    outlet(-w / 2 + 0.16, 'pl_green', 'O₂');
    outlet(-w / 2 + 0.3, 'pl_yellow', 'AIR');
    outlet(-w / 2 + 0.44, 'pl_white', 'VAC');
    // 流量計(氧氣)
    b.push(-w / 2 + 0.16, 0.13, 0.09);
    b.cyl('pl_clear', 0.016, 0.12, 0, -0.1, 0.01, { seg: 6 });
    b.sph('pl_red', 0.006, 0, -0.08, 0.01, { ws: 6, hs: 4 });
    b.cyl('chrome', 0.02, 0.03, 0, -0.025, 0.01, { seg: 6 });
    knob(b, 0, -0.17, 0.02, 0.012, 'pl_green');
    b.pop();
    // 抽吸瓶
    b.push(-w / 2 + 0.44, -0.02, 0.1);
    b.cyl('pi_clear', 0.055, 0.18, 0, -0.09, 0, { seg: 8 });
    b.cyl('pl_dark', 0.058, 0.025, 0, 0.01, 0, { seg: 8 });
    if (seed % 2) b.cyl('meat', 0.05, 0.05, 0, -0.155, 0, { seg: 8 }); // 瓶底的暗紅沉澱
    b.pop();
    // 插座、呼叫鈴、閱讀燈
    for (const x of [w / 2 - 0.3, w / 2 - 0.18]) { b.box('pl_white', 0.07, 0.07, 0.008, x, 0.12, 0.058, { r: 0.004 }); b.box('pl_dark', 0.008, 0.018, 0.002, x - 0.012, 0.12, 0.062); b.box('pl_dark', 0.008, 0.018, 0.002, x + 0.012, 0.12, 0.062); }
    b.box('pl_beige', 0.06, 0.09, 0.02, w / 2 - 0.07, 0.12, 0.065, { r: 0.006 });
    b.cyl('pl_red', 0.014, 0.008, w / 2 - 0.07, 0.13, 0.077, { axis: 'z', seg: 6 });
    cable(b, [[w / 2 - 0.07, 0.08, 0.07], [w / 2 - 0.06, -0.3, 0.1], [w / 2 - 0.2, -0.75, 0.2]], 0.004, 'pl_beige');
    b.box('alu', 0.16, 0.05, 0.06, 0, 0.27, 0.04, { r: 0.01 });
    b.box(G(glowSwatch('off', '#2a2a26')), 0.13, 0.004, 0.035, 0, 0.247, 0.045);
  });
}

// ---------------------------------------------------------------- 隔簾(天花板軌道 + 吊鉤 + 布)
// path: [[x,z]...] 以房間座標給;ceil 天花板高度(相對地面)
export function curtainSet(b, path, ceil, o = {}) {
  const top = ceil - 0.06;
  const pts = path.map(([x, z]) => [x, top + 0.035, z]);
  b.tube('alu', pts, 0.012, { seg: 4, bend: 0.25 });
  for (let i = 0; i < path.length; i++) b.rod('alu', 0.004, [path[i][0], top + 0.035, path[i][1]], [path[i][0], ceil, path[i][1]], { seg: 4 });
  const g = curtainGeo(path, top, o.bottom ?? 0.32, { holes: o.holes ?? 0, rag: o.rag ?? 0.2, seed: o.seed ?? 1, bunch: o.bunch ?? 0 });
  b.raw('pi_curtain', g, null, 'keep');
}

// ---------------------------------------------------------------- 床邊桌(跨床桌)
export function overbedTable(seed = 1) {
  return tpl(`overbed:${seed % 2}`, (b) => {
    b.win = win(seed + 21);
    b.box('pl_beige', 0.8, 0.03, 0.4, 0.15, 0.85, 0, { r: 0.012 });
    b.box('enamel_cream', 0.05, 0.05, 0.05, -0.2, 0.82, 0);
    b.box('enamel_cream', 0.04, 0.72, 0.04, -0.2, 0.44, 0);
    b.box('enamel_cream', 0.06, 0.04, 0.6, -0.2, 0.06, 0.05, { r: 0.008 });
    b.box('enamel_cream', 0.5, 0.04, 0.06, -0.0, 0.06, -0.22, { r: 0.008 });
    for (const [x, z] of [[-0.2, -0.22], [0.22, -0.22], [-0.2, 0.32]]) caster(b, x, z, 0.04, { r: 0.018 });
    b.surface(-0.2, -0.17, 0.5, 0.17, 0.865);
  });
}

// ---------------------------------------------------------------- 輪椅(程式版;也作為 GLTF 載入失敗的退回)
export function wheelchair(v = 1) {
  return tpl(`wc:${v}`, (b) => {
    b.win = win(v + 41);
    const seat = ['vinyl_black', 'vinyl_blue', 'vinyl_teal'][v % 3];
    const fr = 'chrome', W = 0.25;
    for (const s of [-1, 1]) {
      // 側框
      b.tube(fr, [[s * W, 0.88, -0.26], [s * W, 0.5, -0.22], [s * W, 0.5, 0.18], [s * W, 0.42, 0.34], [s * W, 0.13, 0.36]], 0.012, { seg: 6, bend: 0.05 });
      b.tube(fr, [[s * W, 0.22, -0.22], [s * W, 0.22, 0.24], [s * W, 0.42, 0.34]], 0.011, { seg: 6, bend: 0.04 });
      b.rod(fr, 0.011, [s * W, 0.22, -0.2], [s * W, 0.5, -0.2], { seg: 6 });
      // 推把手
      b.rod(fr, 0.012, [s * W, 0.88, -0.26], [s * W, 0.95, -0.36], { seg: 6 });
      b.cyl('rubber', 0.016, 0.1, s * W, 0.96, -0.39, { axis: 'z', seg: 8, rx: 0.35 });
      // 扶手
      b.tube(fr, [[s * W, 0.5, -0.12], [s * W, 0.68, -0.12], [s * W, 0.68, 0.18], [s * W, 0.5, 0.2]], 0.01, { seg: 6, bend: 0.04 });
      b.box('vinyl_black', 0.05, 0.03, 0.26, s * W, 0.7, 0.03, { r: 0.012 });
      // 大輪 + 前輪
      bigWheel(b, s * (W + 0.05), 0.3, -0.12, 0.3, { side: s });
      caster(b, s * (W - 0.02), 0.34, 0.2, { r: 0.07, fork: 'chrome' });
      // 腳踏板
      b.rod(fr, 0.01, [s * W * 0.9, 0.13, 0.36], [s * W * 0.7, 0.1, 0.42], { seg: 6 });
      b.box('pl_dark', 0.16, 0.012, 0.12, s * 0.12, 0.1, 0.44, { r: 0.004, rx: -0.15 });
    }
    // 交叉折疊架
    b.rod(fr, 0.01, [-W, 0.48, 0], [W, 0.22, 0], { seg: 6 });
    b.rod(fr, 0.01, [W, 0.48, 0], [-W, 0.22, 0], { seg: 6 });
    // 座墊 / 靠背(帆布下垂)
    const sg = new THREE.PlaneGeometry(W * 2, 0.42, 6, 4);
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.03 * (1 - (x / W) ** 2)); void y; }
    sg.computeVertexNormals();
    b.raw(seat, sg, new THREE.Matrix4().makeRotationX(-HALF).setPosition(0, 0.5, -0.02));
    b.raw(seat, sg.clone(), new THREE.Matrix4().makeRotationX(-HALF + Math.PI).setPosition(0, 0.497, -0.02));
    const bg = new THREE.PlaneGeometry(W * 2, 0.36, 6, 3);
    const q = bg.attributes.position;
    for (let i = 0; i < q.count; i++) q.setZ(i, -0.03 * (1 - (q.getX(i) / W) ** 2));
    bg.computeVertexNormals();
    b.raw(seat, bg, new THREE.Matrix4().makeRotationX(0.12).setPosition(0, 0.72, -0.22));
    b.raw(seat, bg.clone(), new THREE.Matrix4().makeRotationX(0.12 + Math.PI).setPosition(0, 0.72, -0.223));
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.32, 0, -0.42), new THREE.Vector3(0.32, 0.95, 0.5));
  });
}

// ---------------------------------------------------------------- 急診推床(擔架床)
export function gurney(v = {}) {
  return tpl(`gurney:${JSON.stringify(v)}`, (b) => {
    const seed = v.seed ?? 1;
    b.win = win(seed + 61);
    const fr = 'chrome', base = v.base ?? 'enamel_white';
    // 底座(油壓柱)
    b.box(base, 0.5, 0.12, 1.5, 0, 0.22, 0, { r: 0.04 });
    b.box('pl_dark', 0.46, 0.04, 1.4, 0, 0.14, 0, { r: 0.015 });
    for (const sz of [-1, 1]) {
      b.cyl('chrome', 0.05, 0.3, 0, 0.42, sz * 0.4, { seg: 12 });
      b.box(base, 0.3, 0.12, 0.25, 0, 0.6, sz * 0.4, { r: 0.03 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.2, sz * 0.66, 0.16, { r: 0.075, brake: true });
    // 床面框
    const y = 0.68;
    b.tube(fr, [[-0.32, y, -0.95], [0.32, y, -0.95], [0.32, y, 0.95], [-0.32, y, 0.95]], 0.016, { seg: 6, closed: true, bend: 0.06 });
    b.box('enamel_gray', 0.6, 0.02, 1.85, 0, y + 0.01, 0);
    const a = v.head ?? 0.35;
    b.box('pi_mattress', 0.62, 0.08, 1.2, 0, y + 0.06, 0.32, { r: 0.03 });
    b.push(0, y + 0.02, -0.28, -a, 0, 0);
    b.box('pi_mattress', 0.62, 0.08, 0.66, 0, 0.04, -0.33, { r: 0.03 });
    if (v.sheet !== false) b.box('pi_linen', 0.64, 0.01, 0.66, 0.01, 0.085, -0.33, { r: 0.004 });
    if (v.pillow) b.box('pi_linen', 0.5, 0.09, 0.3, 0, 0.13, -0.5, { r: 0.04, ry: 0.15 });
    b.pop();
    if (v.sheet !== false) {
      // 床單皺成一團
      b.box('pi_linen', 0.66, 0.012, 1.2, 0.0, y + 0.105, 0.32, { r: 0.004 });
      b.plane('pi_linen', 1.2, 0.25, 0.335, y - 0.02, 0.32, { ry: HALF, rz: 0.08 });
    }
    // 側欄(可放倒)
    for (const s of [-1, 1]) {
      const up = v.rails === 'up' || (v.rails !== 'down' && s < 0);
      const yr = up ? y + 0.32 : y + 0.04;
      b.tube(fr, [[s * 0.35, y, -0.5], [s * 0.35, yr, -0.5], [s * 0.35, yr, 0.5], [s * 0.35, y, 0.5]], 0.012, { seg: 6, bend: 0.04 });
      b.rod(fr, 0.008, [s * 0.35, (y + yr) / 2, -0.5], [s * 0.35, (y + yr) / 2, 0.5], { seg: 5 });
    }
    // 點滴桿
    if (v.iv !== false) {
      b.rod('chrome', 0.011, [0.33, y, -0.93], [0.33, 1.85, -0.93], { seg: 6 });
      b.tube('chrome', [[0.33, 1.85, -0.93], [0.33, 1.88, -0.85], [0.33, 1.84, -0.82]], 0.004, { seg: 4, bend: 0.02 });
      if (v.bag) { b.box('pi_iv', 0.1, 0.16, 0.025, 0.33, 1.72, -0.83, { r: 0.01 }); b.box('pi_fluid', 0.085, 0.05, 0.018, 0.33, 1.66, -0.83, { r: 0.005 }); }
    }
    // 推把
    b.tube(fr, [[-0.28, y, 1.0], [-0.28, y + 0.12, 1.06], [0.28, y + 0.12, 1.06], [0.28, y, 1.0]], 0.014, { seg: 6, bend: 0.05 });
    b.surface(-0.28, -0.1, 0.28, 0.8, y + 0.11);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.38, 0, -1.0), new THREE.Vector3(0.38, 0.85, 1.08));
  });
}

// ---------------------------------------------------------------- 生理監視器(推車式 / 壁掛)
export function monitorCart(v = 0) {
  return tpl(`moncart:${v}`, (b) => {
    b.win = win(v + 71);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.rod('pl_dark', 0.014, [0, 0.1, 0], [Math.cos(a) * 0.27, 0.07, Math.sin(a) * 0.27], { seg: 6 }); caster(b, Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0.07, { r: 0.025 }); }
    b.cyl('steel', 0.022, 1.0, 0, 0.6, 0, { seg: 10 });
    b.box('pl_gray', 0.28, 0.03, 0.22, 0, 0.95, 0.02, { r: 0.008 }); // 置物盤
    b.box('pl_dark', 0.08, 0.06, 0.12, 0.08, 0.99, 0.0, { r: 0.01 });
    monitorHead(b, 0, 1.12, 0.03, v === 1 ? 'flat' : 'ecg');
    cable(b, [[0.1, 1.05, 0.0], [0.2, 0.8, 0.1], [0.3, 0.3, 0.3], [0.5, 0.01, 0.4]], 0.004, 'pl_gray');
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.22, 0, -0.22), new THREE.Vector3(0.22, 1.4, 0.22));
  });
}
export function monitorHead(b, x, y, z, screen = 'ecg') {
  b.push(x, y, z, -0.12, 0, 0);
  b.box('pl_beige', 0.36, 0.28, 0.16, 0, 0.14, -0.04, { r: 0.02 });
  b.box('pl_beige', 0.3, 0.22, 0.06, 0, 0.14, -0.15, { r: 0.02 });
  b.box('pl_dark', 0.27, 0.2, 0.01, 0, 0.15, 0.037);
  b.plane(G(monitorScreen(screen)), 0.25, 0.18, 0, 0.15, 0.0425);
  for (let i = 0; i < 5; i++) b.box('pl_gray', 0.03, 0.014, 0.008, -0.12 + i * 0.06, 0.025, 0.04, { r: 0.002 });
  led(b, 0.15, 0.02, 0.04, screen === 'flat' ? '#ff2a1a' : '#30ff60');
  b.box('pl_dark', 0.06, 0.03, 0.03, 0, 0.3, -0.05, { r: 0.01 }); // 提把
  b.pop();
}
// 壁掛監視器(含支臂),背面貼牆 z=0
export function monitorWall(v = 0) {
  return tpl(`monwall:${v}`, (b) => {
    b.box('alu', 0.12, 0.2, 0.02, 0, 0, 0.01, { r: 0.005 });
    b.rod('alu', 0.018, [0, 0, 0.02], [0, 0, 0.3], { seg: 8 });
    b.rod('alu', 0.016, [0, 0, 0.3], [0.12, -0.04, 0.42], { seg: 8 });
    monitorHead(b, 0.12, -0.22, 0.55, v === 1 ? 'flat' : 'ecg');
  });
}

// ---------------------------------------------------------------- 急救車(紅色抽屜 + 去顫器)
export function crashCart(seed = 1) {
  return tpl(`crash:${seed % 2}`, (b) => {
    b.win = win(seed + 81);
    const w = 0.75, d = 0.5, h = 1.0;
    b.box('pl_gray', w + 0.04, 0.04, d + 0.04, 0, h + 0.02, 0, { r: 0.01 }); // 頂盤
    b.bb('enamel_red', -w / 2, 0.14, -d / 2, w / 2, h, d / 2, { r: 0.008 });
    const n = 5;
    for (let i = 0; i < n; i++) {
      const y0 = 0.18 + i * ((h - 0.22) / n), hh = (h - 0.22) / n;
      const pulled = seed % 2 && i === 1 ? 0.22 : 0;
      b.push(0, 0, pulled);
      b.box('enamel_red', w - 0.04, hh - 0.012, 0.02, 0, y0 + hh / 2, d / 2 + 0.01, { r: 0.004 });
      barHandle(b, 0, y0 + hh / 2 + 0.01, d / 2 + 0.02, 0.4, 'pl_gray', { d: 0.025, r: 0.008 });
      if (pulled) { b.bb('pl_white', -w / 2 + 0.04, y0, -d / 2 + 0.02, w / 2 - 0.04, y0 + 0.01, d / 2); b.bb('pl_white', -w / 2 + 0.04, y0, d / 2 - 0.4, -w / 2 + 0.05, y0 + hh - 0.02, d / 2); b.bb('pl_white', w / 2 - 0.05, y0, d / 2 - 0.4, w / 2 - 0.04, y0 + hh - 0.02, d / 2); }
      b.pop();
    }
    for (const sx of [-1, 1]) b.rod('pl_gray', 0.014, [sx * (w / 2 + 0.03), 0.9, -d / 2 + 0.05], [sx * (w / 2 + 0.03), 0.9, d / 2 - 0.05], { seg: 6 }); // 側把手
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) caster(b, sx * 0.3, sz * 0.18, 0.14, { r: 0.05, brake: sz > 0 });
    // 去顫器
    b.push(-0.12, h + 0.04, 0);
    b.box('pl_ltblue', 0.36, 0.2, 0.3, 0, 0.1, 0, { r: 0.02, ry: 0.15 });
    b.plane(G(monitorScreen(seed % 2 ? 'flat' : 'ecg')), 0.14, 0.1, -0.02, 0.13, 0.153, { ry: 0.15 });
    for (const sx of [-1, 1]) { b.box('pl_dark', 0.09, 0.05, 0.14, 0.12 + sx * 0.05, 0.22, -0.05, { r: 0.015, ry: 0.15 }); b.cyl('pl_dark', 0.025, 0.07, 0.12 + sx * 0.05, 0.27, -0.05, { seg: 8 }); }
    cable(b, [[0.15, 0.23, -0.08], [0.32, 0.1, -0.2], [0.42, -0.4, -0.1], [0.43, -0.75, 0.05]], 0.006, 'pl_dark');
    b.pop();
    // 氧氣瓶(側掛)
    b.cyl('enamel_green', 0.05, 0.6, w / 2 + 0.07, 0.55, 0.0, { seg: 12 });
    b.sph('enamel_green', 0.05, w / 2 + 0.07, 0.85, 0.0, { ws: 10, hs: 5, tl: HALF });
    b.cyl('chrome', 0.018, 0.08, w / 2 + 0.07, 0.92, 0, { seg: 8 });
    b.box('pl_red', 0.4, 0.004, 0.25, 0.1, h + 0.042, 0.1, { ry: 0.3 }); // 紙
    b.plane(L(sign('急救車', { w: 160, h: 48, bg: '#f0ece0', fg: '#a01010', size: 0.6 })), 0.24, 0.07, 0, h - 0.06, d / 2 + 0.026);
    b.surface(0.08, -0.2, 0.36, 0.2, h + 0.04);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.47, 0, -0.29), new THREE.Vector3(0.47, 1.3, 0.29));
  });
}

// ---------------------------------------------------------------- 氧氣瓶推車
export function oxygenCart(n = 1) {
  return tpl(`o2cart:${n}`, (b) => {
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.2;
      b.cyl('enamel_green', 0.085, 1.05, x, 0.63, 0, { seg: 14 });
      b.sph('enamel_green', 0.085, x, 1.155, 0, { ws: 14, hs: 6, tl: HALF });
      b.cyl('chrome', 0.022, 0.08, x, 1.27, 0, { seg: 8 });
      b.cyl('brass', 0.03, 0.05, x, 1.32, 0.0, { axis: 'z', seg: 8 });
      knob(b, x, 1.35, 0.02, 0.018, 'pl_dark');
      b.plane(L(sign('醫用氧氣', { w: 128, h: 48, bg: '#2a7a3a', fg: '#fff', size: 0.5, sub: 'O₂ 易燃 禁煙', seed: k })), 0.09, 0.05, x, 0.9, 0.086);
    }
    const w = 0.2 * n + 0.08;
    b.bb('steel', -w / 2, 0.06, -0.12, w / 2, 0.1, 0.12);
    b.tube('steel', [[-w / 2, 0.08, -0.12], [-w / 2, 1.0, -0.14], [w / 2, 1.0, -0.14], [w / 2, 0.08, -0.12]], 0.012, { seg: 6, bend: 0.05 });
    b.rod('steel', 0.006, [-w / 2, 0.85, -0.13], [w / 2, 0.85, -0.13], { seg: 4 });
    for (const sx of [-1, 1]) b.cyl('rubber', 0.07, 0.04, sx * (w / 2 + 0.02), 0.07, -0.08, { axis: 'x', seg: 12 });
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.04, 0, -0.18), new THREE.Vector3(w / 2 + 0.04, 1.4, 0.12));
  });
}

// ---------------------------------------------------------------- 一般醫療推車(換藥車 / 器械車)
export function supplyCart(v = 0) {
  return tpl(`scart:${v}`, (b) => {
    b.win = win(v + 91);
    const w = 0.7, d = 0.45;
    const s = ['steel', 'enamel_white', 'pl_ltblue'][v % 3];
    for (const y of [0.25, 0.55, 0.85]) {
      b.box(s === 'steel' ? 'pi_steel' : s, w, 0.02, d, 0, y, 0, { r: 0.006 });
      for (const sx of [-1, 1]) b.box(s === 'steel' ? 'pi_steel' : s, 0.01, 0.04, d, sx * w / 2, y + 0.02, 0);
      for (const sz of [-1, 1]) b.box(s === 'steel' ? 'pi_steel' : s, w, 0.04, 0.01, 0, y + 0.02, sz * d / 2);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl('chrome', 0.012, 0.8, sx * (w / 2 - 0.02), 0.5, sz * (d / 2 - 0.02), { seg: 6 }); caster(b, sx * (w / 2 - 0.02), sz * (d / 2 - 0.02), 0.1, { r: 0.04 }); }
    b.tube('chrome', [[-w / 2, 0.86, -d / 2 + 0.05], [-w / 2 - 0.08, 0.95, -d / 2 + 0.05], [-w / 2 - 0.08, 0.95, d / 2 - 0.05], [-w / 2, 0.86, d / 2 - 0.05]], 0.012, { seg: 6, bend: 0.04 });
    b.surface(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.86);
    b.surface(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.56);
    b.surface(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.26);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.1, 0, -d / 2 - 0.02), new THREE.Vector3(w / 2 + 0.02, 1.0, d / 2 + 0.02));
  });
}

// ---------------------------------------------------------------- 腳趾牌 + 白布蓋的屍體(放在推床/抽屜上)
export function bodyUnderSheet(seed = 1, o = {}) {
  return tpl(`bodysheet:${seed}:${o.w ?? 0.6}`, (b) => {
    const w = o.w ?? 0.6;
    const g = sheetOverBody({ w, len: 1.9, drop: o.drop ?? 0.18, cw: w + 0.36, cl: 2.2, seed: seed * 3 + 2, bodyScale: 0.95 });
    b.raw('pi_linen', g);
    // 腳趾牌露出布外
    b.push(0.1, 0.06, 1.0);
    b.sph('skin_dead', 0.04, 0, 0, 0, { sx: 0.8, sy: 1.6, sz: 1.2, ws: 8, hs: 6 });
    b.plane(L(toeTag(seed)), 0.045, 0.08, 0.03, -0.06, 0.04, { rx: -0.2 });
    b.rod('cardboard', 0.0008, [0.0, 0.02, 0.02], [0.03, -0.02, 0.04], { seg: 3 });
    b.pop();
  });
}

export { form };
