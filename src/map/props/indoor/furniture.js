import { B, tpl, HALF, L, G, THREE, caster, barHandle, cupPull, knob, drawer, doorPanel, shell, labelHolder, louvers, screws, led, win, cable } from './parts.js';
import { sign, spines, poster, glowSwatch, fileCover, drugBox, keyboardTex, clockFace } from './art.js';

// 一般家具:椅子、桌子、書桌、檔案櫃、書櫃、置物櫃、鐵架、玻璃櫃、櫃台、長椅、沙發、衣櫃、垃圾桶、盆栽、洗手台…

// ---------------------------------------------------------------- 椅子
// 塑膠殼椅(候診/餐廳):一體成形座椅 + 鋼管腳
export function chairShell(color = 'pl_orange', seed = 0) {
  return tpl(`chairshell:${color}:${seed % 3}`, (b) => {
    b.win = win(seed + 101);
    // 側面輪廓(z, y)擠出成座椅寬度
    const prof = [[0.22, 0.455, 0.01], [0.2, 0.47, 0.02], [-0.14, 0.465, 0.06], [-0.2, 0.5, 0.06], [-0.24, 0.86, 0.02], [-0.215, 0.865, 0.01], [-0.18, 0.52, 0.05], [-0.13, 0.49, 0.06], [0.2, 0.45, 0.02], [0.215, 0.44, 0]];
    b.ext(color, prof.map(([z, y, r]) => [z, y, r]), 0.44, 0, 0, 0, { ry: -HALF, bevel: 0.004, cs: 4 });
    const leg = 'chrome';
    for (const s of [-1, 1]) {
      b.tube(leg, [[s * 0.2, 0.0, 0.2], [s * 0.19, 0.44, 0.17], [s * 0.19, 0.44, -0.12], [s * 0.2, 0.0, -0.18]], 0.011, { seg: 6, bend: 0.05 });
      b.cyl('rubber', 0.014, 0.012, s * 0.2, 0.006, 0.2, { seg: 6 });
      b.cyl('rubber', 0.014, 0.012, s * 0.2, 0.006, -0.18, { seg: 6 });
    }
    b.rod(leg, 0.008, [-0.19, 0.44, 0.0], [0.19, 0.44, 0.0], { seg: 6 });
    b.surface(-0.16, -0.12, 0.16, 0.18, 0.47);
  });
}

// 木椅(宿舍/禮拜堂/辦公)
export function chairWood(seed = 0, wood = 'pi_wood_oak') {
  return tpl(`chairwood:${wood}:${seed % 2}`, (b) => {
    for (const [x, z] of [[-0.19, 0.19], [0.19, 0.19]]) b.box(wood, 0.035, 0.45, 0.035, x, 0.225, z, { r: 0.004 });
    for (const x of [-0.19, 0.19]) b.box(wood, 0.035, 0.92, 0.035, x, 0.46, -0.19, { r: 0.004, rx: 0.05 });
    b.box(wood, 0.44, 0.03, 0.42, 0, 0.465, 0, { r: 0.006 });
    for (const y of [0.62, 0.86]) b.box(wood, 0.38, 0.06, 0.02, 0, y, -0.205, { r: 0.004, rx: 0.05 });
    if (seed % 2) for (let i = -1; i <= 1; i++) b.box(wood, 0.03, 0.22, 0.015, i * 0.1, 0.74, -0.205, { rx: 0.05 });
    for (const z of [0.19, -0.19]) b.box(wood, 0.36, 0.025, 0.02, 0, 0.12, z);
    for (const x of [-0.19, 0.19]) b.box(wood, 0.02, 0.025, 0.36, x, 0.18, 0);
    b.surface(-0.18, -0.16, 0.18, 0.18, 0.48);
  });
}

// 辦公旋轉椅
export function chairOffice(color = 'fab_gray', seed = 0) {
  return tpl(`chairoffice:${color}:${seed % 2}`, (b) => {
    b.win = win(seed + 111);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2;
      b.box('pl_black', 0.05, 0.035, 0.3, Math.cos(a) * 0.14, 0.085, Math.sin(a) * 0.14, { r: 0.01, ry: -a + HALF });
      caster(b, Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.07, { r: 0.025, fork: 'pl_black', wheel: 'pl_black' });
    }
    b.cyl('chrome', 0.022, 0.24, 0, 0.22, 0, { seg: 10 });
    b.cyl('pl_black', 0.032, 0.1, 0, 0.13, 0, { seg: 10 });
    b.box('pl_black', 0.22, 0.04, 0.22, 0, 0.36, 0, { r: 0.01 });
    b.box(color, 0.48, 0.08, 0.46, 0, 0.42, 0.02, { r: 0.035 });
    b.box('pl_black', 0.06, 0.3, 0.03, 0, 0.5, -0.22, { r: 0.01, rx: 0.12 });
    b.box(color, 0.44, 0.48, 0.07, 0, 0.84, -0.27, { r: 0.035, rx: 0.12 });
    if (seed % 2 === 0) for (const s of [-1, 1]) {
      b.box('pl_black', 0.03, 0.2, 0.03, s * 0.25, 0.5, 0.0, { r: 0.008 });
      b.box('pl_black', 0.06, 0.025, 0.24, s * 0.25, 0.61, 0.0, { r: 0.01 });
    }
  });
}

// 圓凳(手術室/復健/實驗)
export function stool(color = 'vinyl_black', seed = 0) {
  return tpl(`stool:${color}:${seed % 2}`, (b) => {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.rod('chrome', 0.012, [0, 0.12, 0], [Math.cos(a) * 0.22, 0.06, Math.sin(a) * 0.22], { seg: 6 }); caster(b, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.06, { r: 0.022 }); }
    b.cyl('chrome', 0.02, 0.38, 0, 0.3, 0, { seg: 10 });
    b.tor('chrome', 0.18, 0.006, 0, 0.26, 0, { rx: HALF, rs: 4, ts: 18 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('chrome', 0.005, [0, 0.26, 0], [Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18], { seg: 4 }); }
    b.cyl(color, 0.19, 0.06, 0, 0.52, 0, { seg: 16 });
    b.cyl('pl_black', 0.17, 0.02, 0, 0.48, 0, { seg: 14 });
  });
}

// 兒童椅/桌(遊戲室)
export function kidChair(color = 'pl_red') {
  return tpl(`kidchair:${color}`, (b) => {
    b.box(color, 0.3, 0.025, 0.28, 0, 0.3, 0, { r: 0.01 });
    b.box(color, 0.28, 0.2, 0.025, 0, 0.45, -0.13, { r: 0.01, rx: 0.08 });
    for (const [x, z] of [[-0.12, 0.11], [0.12, 0.11], [-0.12, -0.11], [0.12, -0.11]]) b.cyl('wood_toy', 0.014, 0.3, x, 0.15, z, { seg: 6 });
  });
}
export function kidTable(color = 'wood_yellow') {
  return tpl(`kidtable:${color}`, (b) => {
    b.box(color, 0.9, 0.03, 0.6, 0, 0.52, 0, { r: 0.01 });
    b.box('wood_toy', 0.86, 0.06, 0.56, 0, 0.48, 0, { r: 0.005 });
    for (const [x, z] of [[-0.4, 0.25], [0.4, 0.25], [-0.4, -0.25], [0.4, -0.25]]) b.box('wood_toy', 0.045, 0.5, 0.045, x, 0.25, z, { r: 0.008 });
    b.surface(-0.42, -0.27, 0.42, 0.27, 0.535);
  });
}

// ---------------------------------------------------------------- 桌子
// 餐桌(長桌,美耐板 + 鋼腳)
export function tableLong(w = 1.8, d = 0.8, seed = 0) {
  return tpl(`tablelong:${w}:${d}:${seed % 2}`, (b) => {
    b.win = win(seed + 121);
    const top = seed % 2 ? 'pl_cream' : 'pl_white';
    b.box(top, w, 0.03, d, 0, 0.745, 0, { r: 0.006 });
    b.box('alu', w + 0.006, 0.012, d + 0.006, 0, 0.73, 0, { r: 0.004 });
    b.box('enamel_gray', w - 0.12, 0.06, 0.04, 0, 0.69, 0); // 橫樑
    for (const sx of [-1, 1]) {
      b.box('enamel_gray', 0.06, 0.66, 0.06, sx * (w / 2 - 0.12), 0.36, 0, { r: 0.008 });
      b.box('enamel_gray', 0.08, 0.04, d - 0.1, sx * (w / 2 - 0.12), 0.04, 0, { r: 0.01 });
      for (const sz of [-1, 1]) b.cyl('rubber', 0.02, 0.015, sx * (w / 2 - 0.12), 0.008, sz * (d / 2 - 0.08), { seg: 8 });
    }
    b.surface(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, 0.76);
  });
}
// 鋼製辦公桌(單邊抽屜櫃)
export function deskSteel(w = 1.4, d = 0.72, seed = 0) {
  return tpl(`desksteel:${w}:${seed % 3}`, (b) => {
    b.win = win(seed + 131);
    const s = ['enamel_gray', 'enamel_mint', 'enamel_beige'][seed % 3];
    b.box('pl_beige', w, 0.03, d, 0, 0.745, 0, { r: 0.005 });
    b.box('alu', w + 0.004, 0.02, d + 0.004, 0, 0.73, 0, { r: 0.003 });
    // 抽屜櫃
    const px = w / 2 - 0.22;
    b.bb(s, px - 0.21, 0.04, -d / 2 + 0.02, px + 0.21, 0.72, d / 2 - 0.02, { r: 0.004 });
    for (let i = 0; i < 3; i++) drawer(b, px, 0.14 + i * 0.21, d / 2 - 0.02, 0.4, 0.2, s, { handle: 'cup', label: true });
    // 左側桌腳 + 擋板
    b.bb(s, -w / 2 + 0.02, 0.04, -d / 2 + 0.02, -w / 2 + 0.05, 0.72, d / 2 - 0.02);
    b.bb(s, -w / 2 + 0.05, 0.3, -d / 2 + 0.02, px - 0.21, 0.7, -d / 2 + 0.04);
    drawer(b, -0.1, 0.68, d / 2 - 0.02, 0.6, 0.07, s, { handle: 'cup' });
    for (const x of [-w / 2 + 0.035, px - 0.2, px + 0.2]) b.cyl('rubber', 0.015, 0.04, x, 0.02, 0, { seg: 6 });
    b.surface(-w / 2 + 0.04, -d / 2 + 0.04, w / 2 - 0.04, d / 2 - 0.04, 0.76);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 0.76, d / 2));
  });
}
// 院長辦公桌(深色實木、皮面、黃銅把手)
export function deskExec() {
  return tpl('deskexec', (b) => {
    const w = 1.9, d = 0.95, wood = 'pi_wood_dark';
    b.box(wood, w + 0.06, 0.05, d + 0.06, 0, 0.765, 0, { r: 0.012 });
    b.box('leather_ox', w - 0.4, 0.004, d - 0.35, 0, 0.792, 0.05);
    for (const sx of [-1, 1]) {
      const cx = sx * (w / 2 - 0.25);
      b.bb(wood, cx - 0.25, 0.08, -d / 2, cx + 0.25, 0.74, d / 2, { r: 0.006 });
      b.bb(wood, cx - 0.27, 0, -d / 2 - 0.01, cx + 0.27, 0.08, d / 2 + 0.01, { r: 0.008 }); // 底座
      for (let i = 0; i < 3; i++) {
        b.box(wood, 0.44, 0.19, 0.02, cx, 0.19 + i * 0.205, -d / 2 - 0.008, { r: 0.006 });
        b.box('pi_wood_oak', 0.36, 0.13, 0.006, cx, 0.19 + i * 0.205, -d / 2 - 0.02);
        knob(b, cx, 0.19 + i * 0.205, -d / 2 - 0.02, 0.012, 'brass');
      }
    }
    b.bb(wood, -w / 2 + 0.5, 0.3, d / 2 - 0.04, w / 2 - 0.5, 0.74, d / 2 - 0.01); // 正面擋板(朝 +Z 的客人側)
    for (let i = 0; i < 5; i++) b.box('pi_wood_oak', 0.12, 0.3, 0.006, -0.36 + i * 0.18, 0.52, d / 2 - 0.005, { r: 0.002 });
    b.surface(-w / 2 + 0.06, -d / 2 + 0.06, w / 2 - 0.06, d / 2 - 0.06, 0.79);
  });
}

// ---------------------------------------------------------------- 櫃子
// 鋼製檔案櫃(n 層抽屜;open 某層拉出)
export function fileCabinet(n = 4, seed = 0) {
  return tpl(`filecab:${n}:${seed % 4}`, (b) => {
    b.win = win(seed + 141);
    const s = ['enamel_gray', 'enamel_beige', 'enamel_mint', 'enamel_dark'][seed % 4];
    const w = 0.47, d = 0.62, h = 0.33 * n + 0.08;
    b.bb(s, -w / 2, 0.03, -d / 2, w / 2, h, d / 2 - 0.02, { r: 0.005 });
    b.bb('enamel_black', -w / 2 + 0.02, 0, -d / 2 + 0.03, w / 2 - 0.02, 0.03, d / 2 - 0.05);
    const open = seed % 3 === 1 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const y = 0.06 + i * 0.33 + 0.165, pulled = i === open ? 0.38 : seed % 4 === 2 && i === 0 ? 0.04 : 0;
      b.push(0, 0, pulled);
      drawer(b, 0, y, d / 2 - 0.02, w - 0.02, 0.32, s, { handle: 'cup', label: true });
      if (pulled > 0.1) {
        b.bb(s, -w / 2 + 0.03, y - 0.15, d / 2 - 0.02 - 0.5, -w / 2 + 0.04, y + 0.1, d / 2 - 0.02);
        b.bb(s, w / 2 - 0.04, y - 0.15, d / 2 - 0.02 - 0.5, w / 2 - 0.03, y + 0.1, d / 2 - 0.02);
        b.bb(s, -w / 2 + 0.03, y - 0.15, d / 2 - 0.02 - 0.5, w / 2 - 0.03, y - 0.14, d / 2 - 0.02);
        for (let k = 0; k < 9; k++) { // 吊掛檔案夾
          const z = d / 2 - 0.06 - k * 0.05;
          b.box(['pl_yellow', 'cardboard', 'pl_ltblue', 'fab_beige'][k % 4], w - 0.1, 0.24 - (k % 3) * 0.02, 0.008, 0, y - 0.03, z, { rx: (k % 4 - 1.5) * 0.06 });
        }
      }
      b.pop();
    }
    b.surface(-w / 2 + 0.03, -d / 2 + 0.03, w / 2 - 0.03, d / 2 - 0.05, h);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
  });
}

// 書櫃(木頭,書背圖集)
export function bookcase(w = 1.0, h = 2.0, wood = 'pi_wood_dark', seed = 0) {
  return tpl(`bookcase:${w}:${h}:${wood}:${seed % 3}`, (b) => {
    const d = 0.36, t = 0.025, n = Math.round((h - 0.15) / 0.36);
    b.bb(wood, -w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, { r: 0.004 });
    b.bb(wood, w / 2 - t, 0, -d / 2, w / 2, h, d / 2, { r: 0.004 });
    b.bb(wood, -w / 2, h - t, -d / 2, w / 2, h, d / 2 + 0.015, { r: 0.006 });
    b.bb(wood, -w / 2 - 0.015, h - 0.07, -d / 2, w / 2 + 0.015, h - t, d / 2 + 0.02, { r: 0.006 }); // 冠頂
    b.bb(wood, -w / 2 + t, 0, -d / 2, w / 2 - t, 0.1, d / 2 - 0.01);
    b.bb('wood_dark', -w / 2 + t, 0.1, -d / 2, w / 2 - t, h - t, -d / 2 + 0.01);
    for (let i = 0; i < n; i++) {
      const y = 0.1 + i * ((h - 0.1 - t) / n);
      b.bb(wood, -w / 2 + t, y, -d / 2, w / 2 - t, y + 0.02, d / 2);
      const sh = (h - 0.1 - t) / n - 0.04;
      if ((i + seed) % 5 === 3) { // 倒下的書 + 空位
        b.box('fab_red', 0.24, 0.04, 0.17, -w / 4, y + 0.04, 0.02, { r: 0.003, ry: 0.2 });
        b.box('fab_navy', 0.22, 0.035, 0.16, -w / 4 + 0.02, y + 0.078, 0.02, { r: 0.003, ry: -0.1 });
        const r = spines(seed * 10 + i);
        b.plane(L(r), (w - 2 * t) * 0.45, sh * 0.85, w / 4 - 0.02, y + 0.02 + sh * 0.425, 0.1);
        b.box('wood_dark', (w - 2 * t) * 0.45, sh * 0.85, 0.2, w / 4 - 0.02, y + 0.02 + sh * 0.425, -0.005);
      } else {
        const r = spines(seed * 10 + i);
        b.plane(L(r), w - 2 * t - 0.02, sh * 0.88, 0, y + 0.02 + sh * 0.44, 0.1);
        b.box('wood_dark', w - 2 * t - 0.02, sh * 0.88, 0.2, 0, y + 0.02 + sh * 0.44, -0.005);
      }
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
  });
}

// 鐵製置物櫃(一排 n 格;某格門開著)
export function lockers(n = 3, seed = 0, tall = true) {
  return tpl(`lockers:${n}:${seed % 3}:${tall}`, (b) => {
    b.win = win(seed + 151);
    const s = ['enamel_gray', 'enamel_blue', 'enamel_green'][seed % 3];
    const cw = 0.38, w = cw * n, d = 0.5, h = tall ? 1.85 : 0.9;
    b.bb(s, -w / 2, 0.1, -d / 2, w / 2, h, d / 2 - 0.02, { r: 0.004 });
    b.bb('enamel_black', -w / 2 + 0.02, 0, -d / 2 + 0.03, w / 2 - 0.02, 0.1, d / 2 - 0.06);
    b.bb(s, -w / 2 - 0.005, h, -d / 2, w / 2 + 0.005, h + 0.02, d / 2, { r: 0.004 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + cw * (i + 0.5);
      const open = (i + seed) % 4 === 2 ? 1.6 : (i + seed) % 5 === 4 ? 0.25 : 0;
      if (open > 0) { // 打開:看得到內部
        b.bb('enamel_dark', x - cw / 2 + 0.02, 0.12, d / 2 - 0.05, x + cw / 2 - 0.02, h - 0.02, d / 2 - 0.03);
        b.bb(s, x - cw / 2 + 0.02, h * 0.78, -d / 2 + 0.02, x + cw / 2 - 0.02, h * 0.78 + 0.015, d / 2 - 0.05);
        b.rod('chrome', 0.006, [x - cw / 2 + 0.03, h * 0.72, 0], [x + cw / 2 - 0.03, h * 0.72, 0], { seg: 4 });
        if ((i + seed) % 2 === 0) b.box('fab_scrub', 0.3, 0.6, 0.06, x, h * 0.72 - 0.32, 0, { r: 0.02 }); // 吊著的制服
      }
      b.push(x - cw / 2 + 0.01, h / 2 + 0.05, d / 2 - 0.02, 0, -open, 0);
      b.box(s, cw - 0.02, h - 0.14, 0.018, cw / 2 - 0.01, 0, 0.009, { r: 0.003 });
      louvers(b, cw / 2 - 0.01, h / 2 - 0.25, 0.01, cw * 0.6, 5, s);
      louvers(b, cw / 2 - 0.01, -h / 2 + 0.12, 0.01, cw * 0.6, 4, s);
      b.box('chrome', 0.025, 0.12, 0.02, cw - 0.06, 0.02, 0.025, { r: 0.006 });
      labelHolder(b, cw / 2 - 0.01, h / 2 - 0.36, 0.019, 0.06, 0.03, sign(String(101 + i + seed * 3), { w: 64, h: 32, bg: '#d8d4c4', size: 0.6, seed: i }));
      b.pop();
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
  });
}

// 工業鐵架(角鐵 + 層板);content 由呼叫者另外放
export function shelfRack(w = 1.2, h = 2.0, d = 0.5, n = 5, seed = 0) {
  return tpl(`rack:${w}:${h}:${d}:${n}:${seed % 3}`, (b) => {
    b.win = win(seed + 161);
    const s = ['enamel_gray', 'galv', 'enamel_green'][seed % 3];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.02), z = sz * (d / 2 - 0.02);
      b.box(s, 0.035, h, 0.035, x, h / 2, z);
      b.box('steel', 0.06, 0.008, 0.06, x, 0.004, z);
    }
    for (let i = 0; i < n; i++) {
      const y = 0.12 + i * ((h - 0.16) / (n - 1));
      b.box(s, w, 0.012, d, 0, y, 0);
      for (const sz of [-1, 1]) b.box(s, w, 0.035, 0.01, 0, y + 0.012, sz * (d / 2 - 0.005));
      for (const sx of [-1, 1]) b.box(s, 0.01, 0.035, d, sx * (w / 2 - 0.005), y + 0.012, 0);
      b.surface(-w / 2 + 0.03, -d / 2 + 0.03, w / 2 - 0.03, d / 2 - 0.03, y + 0.006);
    }
    // 斜撐(背面 X)
    b.rod(s, 0.006, [-w / 2, 0.1, -d / 2 + 0.01], [w / 2, h - 0.1, -d / 2 + 0.01], { seg: 4 });
    b.rod(s, 0.006, [w / 2, 0.1, -d / 2 + 0.01], [-w / 2, h - 0.1, -d / 2 + 0.01], { seg: 4 });
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
  });
}

// 玻璃門藥品櫃
export function glassCabinet(w = 0.9, h = 1.9, seed = 0) {
  return tpl(`glasscab:${w}:${h}:${seed % 2}`, (b) => {
    b.win = win(seed + 171);
    const s = seed % 2 ? 'enamel_white' : 'enamel_cream', d = 0.42;
    const inn = shell(b, w, h, d, s, { base: 0.08 });
    const sh = 4;
    for (let i = 1; i < sh; i++) {
      const y = inn.y0 + (i * (inn.y1 - inn.y0)) / sh;
      b.bb('glass', inn.x0, y, inn.z0, inn.x1, y + 0.008, inn.z1 - 0.03);
      b.bb('chrome', inn.x0, y - 0.004, inn.z1 - 0.035, inn.x1, y + 0.01, inn.z1 - 0.03);
      b.surface(inn.x0 + 0.02, inn.z0 + 0.02, inn.x1 - 0.02, inn.z1 - 0.06, y + 0.008);
    }
    b.surface(inn.x0 + 0.02, inn.z0 + 0.02, inn.x1 - 0.02, inn.z1 - 0.06, inn.y0);
    // 兩扇玻璃門(一扇半開、玻璃破)
    for (const hs of [-1, 1]) {
      const open = hs > 0 ? 0.55 + (seed % 2) * 0.6 : 0;
      b.push(hs * (w / 2 - 0.01), (inn.y0 + inn.y1) / 2, d / 2, 0, hs * open, 0);
      const pw = w / 2 - 0.02, ph = inn.y1 - inn.y0;
      b.box(s, 0.04, ph, 0.025, -hs * 0.02, 0, 0.012);
      b.box(s, 0.04, ph, 0.025, -hs * (pw - 0.02), 0, 0.012);
      b.box(s, pw, 0.04, 0.025, -hs * pw / 2, ph / 2 - 0.02, 0.012);
      b.box(s, pw, 0.04, 0.025, -hs * pw / 2, -ph / 2 + 0.02, 0.012);
      if (!(hs > 0 && seed % 2)) b.box('glass', pw - 0.06, ph - 0.06, 0.004, -hs * pw / 2, 0, 0.012);
      else b.box('glass', pw - 0.06, ph * 0.3, 0.004, -hs * pw / 2, -ph * 0.33, 0.012);
      b.box('chrome', 0.012, 0.1, 0.02, -hs * (pw - 0.04), 0, 0.035, { r: 0.004 });
      b.pop();
    }
    b.plane(L(sign('藥品 MEDICINE', { w: 192, h: 40, bg: '#e8e4d8', fg: '#7a1a1a', size: 0.5 })), 0.3, 0.06, 0, h - 0.07, d / 2 + 0.001);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2));
  });
}

// ---------------------------------------------------------------- 櫃台(服務台、掛號、領藥)
// w 長度;前面(+Z)是客人側,內側有桌面與抽屜
export function counter(w = 2.4, o = {}) {
  return tpl(`counter:${w}:${o.wood ?? 'x'}:${o.panel ?? 'x'}`, (b) => {
    const d = 0.75, front = o.panel ?? 'pl_cream', top = o.top ?? 'pi_wood_oak';
    b.bb(front, -w / 2, 0.08, d / 2 - 0.04, w / 2, 1.08, d / 2, { r: 0.006 }); // 前板
    for (let x = -w / 2 + 0.3; x < w / 2 - 0.1; x += 0.6) b.box('alu', 0.02, 0.98, 0.006, x, 0.58, d / 2 + 0.003); // 分隔條
    b.bb('enamel_black', -w / 2 + 0.02, 0, d / 2 - 0.1, w / 2 - 0.02, 0.08, d / 2 - 0.02); // 踢腳
    b.box(top, w + 0.04, 0.035, 0.3, 0, 1.1, d / 2 - 0.1, { r: 0.008 }); // 高台
    b.box(top, w, 0.03, d - 0.15, 0, 0.74, -0.06, { r: 0.006 }); // 內側桌面
    for (const sx of [-1, 1]) b.bb(front, sx * w / 2 - 0.02, 0, -d / 2, sx * w / 2 + 0.02, 1.08, d / 2, { r: 0.004 }); // 側板
    for (let x = -w / 2 + 0.35; x < w / 2 - 0.3; x += 1.1) { // 抽屜櫃
      b.bb(o.cab ?? 'enamel_gray', x - 0.2, 0.02, -d / 2 + 0.05, x + 0.2, 0.72, -d / 2 + 0.6);
      for (let i = 0; i < 3; i++) drawer(b, x, 0.13 + i * 0.22, -d / 2 + 0.05, 0.38, 0.2, o.cab ?? 'enamel_gray', { handle: 'cup' });
    }
    b.surface(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.32, 0.755);
    b.surface(-w / 2 + 0.05, d / 2 - 0.22, w / 2 - 0.05, d / 2 + 0.02, 1.118);
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.02, 0, -d / 2), new THREE.Vector3(w / 2 + 0.02, 1.12, d / 2 + 0.06));
  });
}

// ---------------------------------------------------------------- 連排候診椅(橫樑 + n 個座位)
export function beamSeats(n = 4, color = 'pl_orange', seed = 0) {
  return tpl(`beam:${n}:${color}:${seed % 3}`, (b) => {
    b.win = win(seed + 181);
    const pitch = 0.56, w = n * pitch;
    b.box('enamel_dark', w + 0.06, 0.06, 0.08, 0, 0.36, -0.02, { r: 0.008 });
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 0.15);
      b.box('enamel_dark', 0.05, 0.36, 0.05, x, 0.18, -0.02, { r: 0.006 });
      b.box('enamel_dark', 0.06, 0.03, 0.5, x, 0.015, -0.02, { r: 0.01 });
    }
    const missing = seed % 4 === 3 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + pitch * (i + 0.5);
      b.box('enamel_dark', 0.04, 0.06, 0.4, x, 0.41, 0.0);
      if (i === missing) { b.box('enamel_dark', 0.36, 0.02, 0.02, x, 0.44, 0.15); continue; } // 座位被拆掉
      const tilt = i === (seed + 1) % n && seed % 3 === 1 ? 0.25 : 0; // 一個座位翻起
      b.push(x, 0.45, 0, -tilt, 0, 0);
      b.box(color, 0.48, 0.04, 0.44, 0, 0.02, 0.02, { r: 0.016 });
      b.box(color, 0.48, 0.42, 0.04, 0, 0.27, -0.21, { r: 0.016, rx: 0.12 });
      b.pop();
      if (i < n - 1) { b.box('enamel_dark', 0.04, 0.2, 0.04, x + pitch / 2, 0.55, 0.12, { r: 0.006 }); b.box('pl_black', 0.06, 0.03, 0.3, x + pitch / 2, 0.66, 0.05, { r: 0.01 }); }
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.03, 0, -0.27), new THREE.Vector3(w / 2 + 0.03, 0.9, 0.26));
  });
}

// ---------------------------------------------------------------- 沙發(候診/大廳)
export function sofa(n = 3, color = 'vinyl_green', seed = 0) {
  return tpl(`sofa:${n}:${color}:${seed % 2}`, (b) => {
    b.win = win(seed + 191);
    const w = n * 0.62 + 0.3, d = 0.85;
    b.box(color, w, 0.32, d - 0.1, 0, 0.26, 0.03, { r: 0.04 });
    b.box(color, w, 0.55, 0.22, 0, 0.58, -d / 2 + 0.11, { r: 0.06, rx: 0.08 });
    for (const sx of [-1, 1]) b.box(color, 0.16, 0.25, d - 0.05, sx * (w / 2 - 0.08), 0.52, 0.0, { r: 0.06 });
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.15 + 0.62 * (i + 0.5), sag = (i + seed) % 3 === 1 ? -0.04 : 0;
      b.box(color, 0.6, 0.13, d - 0.32, x, 0.48 + sag, 0.08, { r: 0.05, rz: sag * 0.6 });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('wood_dark', 0.025, 0.1, sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.1), { seg: 8, r2: 0.02 });
    if (seed % 2) { b.box('foam', 0.3, 0.05, 0.25, -0.2, 0.56, 0.12, { r: 0.02, ry: 0.4 }); } // 破掉露出泡棉
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, 0.85, d / 2));
  });
}

// ---------------------------------------------------------------- 衣櫃(木)/ 床頭木櫃
export function wardrobe(w = 1.0, seed = 0, wood = 'pi_wood_oak') {
  return tpl(`wardrobe:${w}:${seed % 2}:${wood}`, (b) => {
    const h = 1.95, d = 0.58;
    shell(b, w, h, d, wood, { base: 0.08, plinth: 'wood_dark', over: 0.02, topT: 0.03, top: wood });
    for (const hs of [-1, 1]) {
      const open = hs > 0 && seed % 2 ? 0.5 : 0;
      b.push(hs * (w / 2 - 0.005), 0.98, d / 2, 0, hs * open, 0);
      b.box(wood, w / 2 - 0.01, 1.76, 0.025, -hs * (w / 4 - 0.005), 0, 0.012, { r: 0.004 });
      b.box(wood, w / 2 - 0.12, 0.6, 0.008, -hs * (w / 4 - 0.005), 0.4, 0.026, { r: 0.004 });
      b.box(wood, w / 2 - 0.12, 0.6, 0.008, -hs * (w / 4 - 0.005), -0.35, 0.026, { r: 0.004 });
      knob(b, -hs * (w / 2 - 0.06), 0.05, 0.025, 0.013, 'brass');
      b.pop();
    }
    if (seed % 2) { // 打開那側:掛著的修女服
      b.rod('chrome', 0.008, [0, 1.7, 0], [w / 2 - 0.03, 1.7, 0], { seg: 4 });
      b.box('cloth_black', 0.42, 1.1, 0.08, w / 4, 1.12, 0.02, { r: 0.03 });
      b.box('fab_white', 0.2, 0.08, 0.1, w / 4, 1.62, 0.02, { r: 0.03 });
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.02, 0, -d / 2), new THREE.Vector3(w / 2 + 0.02, h + 0.03, d / 2 + 0.03));
  });
}

// ---------------------------------------------------------------- 垃圾桶
export function bin(kind = 'pedal', seed = 0) {
  return tpl(`bin:${kind}:${seed % 2}`, (b) => {
    if (kind === 'pedal') {
      b.lathe(seed % 2 ? 'steel' : 'enamel_white', [[0, 0.02], [0.13, 0.02], [0.14, 0.03], [0.15, 0.42], [0, 0.42]], 0, 0, 0, { seg: 16 });
      b.cyl('pl_dark', 0.14, 0.03, 0, 0.015, 0, { seg: 16 });
      b.lathe(seed % 2 ? 'steel' : 'enamel_white', [[0, 0.04], [0.155, 0.0], [0.155, -0.012], [0, -0.005]], 0, 0.42, 0, { seg: 16, rx: seed % 2 ? 0 : -0.5 });
      b.box('pl_dark', 0.08, 0.015, 0.08, 0, 0.02, 0.16, { r: 0.004 });
    } else if (kind === 'bio') { // 醫療廢棄物(紅)
      b.box('pl_red', 0.4, 0.55, 0.32, 0, 0.275, 0, { r: 0.02 });
      b.box('pl_red', 0.42, 0.04, 0.34, 0, 0.57, -0.02, { r: 0.01, rx: seed % 2 ? -0.6 : 0 });
      b.plane(L(sign('感染性廢棄物', { w: 160, h: 64, bg: '#c82020', fg: '#fff', size: 0.34, sub: 'BIOHAZARD', icon: null })), 0.26, 0.1, 0, 0.36, 0.161);
    } else if (kind === 'sharps') {
      b.box('pl_yellow', 0.2, 0.26, 0.14, 0, 0.13, 0, { r: 0.012 });
      b.box('pl_red', 0.21, 0.04, 0.15, 0, 0.27, 0, { r: 0.008 });
      b.plane(L(sign('針頭收集', { w: 128, h: 48, bg: '#e8c020', fg: '#111', size: 0.45 })), 0.15, 0.05, 0, 0.14, 0.071);
    } else if (kind === 'office') {
      b.lathe('pl_gray', [[0, 0], [0.12, 0], [0.15, 0.3], [0.14, 0.3], [0.115, 0.01], [0, 0.01]], 0, 0, 0, { seg: 14 });
    } else if (kind === 'kick') { // 手術室踢桶
      b.lathe('pi_steel', [[0, 0.06], [0.16, 0.06], [0.2, 0.32], [0.19, 0.32], [0.155, 0.07], [0, 0.07]], 0, 0, 0, { seg: 18 });
      b.tor('chrome', 0.2, 0.006, 0, 0.32, 0, { rx: HALF, rs: 4, ts: 18 });
      b.tor('chrome', 0.2, 0.008, 0, 0.05, 0, { rx: HALF, rs: 4, ts: 18 });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; caster(b, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.05, { r: 0.02 }); }
      b.cyl('meat', 0.15, 0.03, 0, 0.1, 0, { seg: 12 });
    } else if (kind === 'bucket') {
      b.lathe('pl_yellow', [[0, 0], [0.14, 0], [0.17, 0.3], [0.165, 0.3], [0.135, 0.01], [0, 0.01]], 0, 0, 0, { seg: 14 });
      b.tor('steel', 0.165, 0.004, 0, 0.3, 0, { rx: 0, rs: 3, ts: 12, arc: Math.PI });
      b.cyl('pi_fluid', 0.15, 0.01, 0, 0.18, 0, { seg: 12 });
    }
  });
}

// ---------------------------------------------------------------- 枯死的盆栽
export function deadPlant(size = 1, seed = 0) {
  return tpl(`plant:${size}:${seed % 3}`, (b) => {
    const r = 0.18 * size, h = 0.36 * size;
    b.lathe(seed % 2 ? 'ceramic' : 'stone', [[0, 0], [r * 0.75, 0], [r, h], [r * 1.08, h], [r * 1.08, h + 0.03], [r * 0.95, h + 0.03], [0, h - 0.02]], 0, 0, 0, { seg: 14 });
    b.cyl('soil', r * 0.92, 0.01, 0, h - 0.02, 0, { seg: 12 });
    const R = (k) => { const x = Math.sin(seed * 91 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const n = 4 + Math.round(size * 3);
    for (let i = 0; i < n; i++) {
      const a = R(i) * Math.PI * 2, tilt = 0.15 + R(i + 9) * 0.5, L2 = (0.5 + R(i + 3) * 0.9) * size;
      const x1 = Math.cos(a) * Math.sin(tilt) * L2, y1 = h + Math.cos(tilt) * L2, z1 = Math.sin(a) * Math.sin(tilt) * L2;
      const droop = R(i + 5) * 0.3 * size;
      b.tube('bark', [[Math.cos(a) * 0.02, h - 0.02, Math.sin(a) * 0.02], [x1 * 0.5, (h + y1) / 2 + 0.05, z1 * 0.5], [x1 * 1.1, y1 - droop, z1 * 1.1]], 0.008 * size + 0.003, { seg: 4, bend: 0.1, rEnd: 0.002 });
      for (let k = 0; k < 3; k++) { // 枯葉(下垂)
        const t = 0.4 + k * 0.25, px = x1 * t, py = h + (y1 - h) * t - droop * t, pz = z1 * t;
        b.box('leaf_dead', 0.03 * size, 0.004, 0.1 * size, px, py - 0.03, pz, { rx: 1.1 + R(i * 3 + k) * 0.4, ry: a + R(k) * 2 });
      }
    }
  });
}

// ---------------------------------------------------------------- 壁掛洗手台
export function sinkWall(seed = 0) {
  return tpl(`sinkwall:${seed % 2}`, (b) => {
    b.win = win(seed + 201);
    // 洗手盆(陶瓷)
    b.box('ceramic', 0.55, 0.18, 0.42, 0, 0.78, 0.21, { r: 0.04 });
    b.box('pl_dark', 0.45, 0.02, 0.3, 0, 0.865, 0.23);
    b.box('ceramic', 0.44, 0.012, 0.29, 0, 0.86, 0.23, { r: 0.01 });
    b.cyl('chrome', 0.022, 0.005, 0, 0.871, 0.24, { seg: 10 });
    b.cyl('chrome', 0.02, 0.4, 0, 0.5, 0.06, { seg: 8 }); // 排水管
    b.tube('chrome', [[0, 0.72, 0.12], [0, 0.6, 0.12], [0, 0.55, 0.06], [0, 0.55, 0.0]], 0.02, { seg: 8, bend: 0.04 });
    // 肘動式水龍頭
    b.cyl('chrome', 0.018, 0.12, 0, 0.93, 0.05, { seg: 8 });
    b.tube('chrome', [[0, 0.98, 0.05], [0, 1.06, 0.08], [0, 1.02, 0.2]], 0.012, { seg: 6, bend: 0.05 });
    for (const sx of [-1, 1]) b.box('chrome', 0.16, 0.012, 0.02, sx * 0.12, 0.96, 0.08, { r: 0.005, ry: sx * 0.3 });
    // 鏡子 + 皂液器 + 擦手紙
    b.box('chrome', 0.5, 0.62, 0.012, 0, 1.55, 0.006, { r: 0.006 });
    b.box('glass_dark', 0.47, 0.59, 0.004, 0, 1.55, 0.014);
    if (seed % 2) b.box('glass', 0.2, 0.3, 0.003, 0.08, 1.6, 0.018, { rz: 0.4 }); // 鏡子裂片
    b.box('pl_white', 0.1, 0.18, 0.08, 0.36, 1.2, 0.04, { r: 0.012 });
    b.box('pl_white', 0.28, 0.32, 0.1, -0.48, 1.3, 0.05, { r: 0.015 });
    b.box('paper', 0.18, 0.06, 0.02, -0.48, 1.12, 0.09, { rx: 0.3 });
    if (seed % 2 === 0) b.cyl('rust', 0.2, 0.003, 0, 0.872, 0.24, { seg: 12, r2: 0.12 }); // 鏽水漬
  });
}

// ---------------------------------------------------------------- 牆上:畫框海報 / 公佈欄 / 白板 / 時鐘 / 十字架 / 鏡子 …
export function framed(rect, w, h, frame = 'pl_black', o = {}) {
  return tpl(`framed:${rect.u0.toFixed(4)}:${rect.v0.toFixed(4)}:${w}:${h}:${frame}`, (b) => {
    const t = o.t ?? 0.025;
    b.box(frame, w + t * 2, h + t * 2, 0.02, 0, h / 2 + t, 0.01, { r: 0.004 });
    b.plane(L(rect), w, h, 0, h / 2 + t, 0.0205);
    if (o.glass !== false) b.box('glass', w, h, 0.002, 0, h / 2 + t, 0.023);
  });
}
export function posterSheet(rect, w, h, o = {}) {
  return tpl(`sheet:${rect.u0.toFixed(4)}:${rect.v0.toFixed(4)}:${w}:${h}:${o.curl ?? 0}`, (b) => {
    const g = new THREE.PlaneGeometry(w, h, 1, 3);
    const p = g.attributes.position;
    if (o.curl) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -h * 0.2) p.setZ(i, (-(y + h * 0.2) / h) * o.curl); }
    g.computeVertexNormals();
    b.raw(L(rect), g, new THREE.Matrix4().makeTranslation(0, h / 2, 0.003), 'rect');
    b.box('chrome', 0.012, 0.012, 0.006, -w / 2 + 0.015, h - 0.015, 0.004); // 圖釘 / 膠帶
    b.box('chrome', 0.012, 0.012, 0.006, w / 2 - 0.015, h - 0.015, 0.004);
  });
}
export function corkBoard(w = 1.2, h = 0.8, seed = 0) {
  return tpl(`cork:${w}:${h}:${seed % 3}`, (b) => {
    b.box('wood_old', w, h, 0.025, 0, h / 2, 0.0125, { r: 0.006 });
    b.box('cork', w - 0.06, h - 0.06, 0.004, 0, h / 2, 0.026);
    const R = (k) => { const x = Math.sin(seed * 77 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 7; i++) {
      const pw = 0.14 + R(i) * 0.08, ph = pw * 1.35, x = -w / 2 + 0.1 + R(i + 9) * (w - 0.2), y = 0.12 + R(i + 19) * (h - 0.3);
      b.plane(L(i % 3 === 0 ? fileCover(i) : i % 3 === 1 ? poster(['missing', 'quiet', 'blood'][i % 3]) : drugBox(i)), pw, ph * (i % 3 === 2 ? 0.5 : 1), x, y + ph / 2, 0.03 + i * 0.0005, { rz: (R(i + 29) - 0.5) * 0.3 });
      b.cyl(['pl_red', 'pl_blue', 'pl_yellow'][i % 3], 0.006, 0.01, x, y + ph * 0.92, 0.035, { axis: 'z', seg: 6 });
    }
  });
}
export function wallClock(seed = 0) {
  return tpl(`clock:${seed % 2}`, (b) => {
    b.cyl('pl_white', 0.16, 0.045, 0, 0, 0.0225, { axis: 'z', seg: 20 });
    b.cyl('steel', 0.165, 0.035, 0, 0, 0.02, { axis: 'z', seg: 20, open: true });
    b.plane(L(clockFace(seed)), 0.29, 0.29, 0, 0, 0.0455); // 停住的時間(3:13 / 0:53)
    b.cyl('glass', 0.15, 0.003, 0, 0, 0.05, { axis: 'z', seg: 16 });
    b.meta.mount = true;
  });
}
export function crucifix(size = 1, seed = 0, wood = 'pi_wood_dark') {
  return tpl(`crucifix:${size}:${seed % 2}:${wood}`, (b) => {
    const s = size;
    b.box(wood, 0.08 * s, 1.0 * s, 0.04 * s, 0, 0.5 * s, 0.02 * s, { r: 0.005 * s });
    b.box(wood, 0.6 * s, 0.08 * s, 0.04 * s, 0, 0.72 * s, 0.02 * s, { r: 0.005 * s });
    b.box('paper', 0.12 * s, 0.05 * s, 0.005 * s, 0, 0.84 * s, 0.043 * s); // INRI
    // 耶穌像(簡化:頭、軀幹、雙臂、腿)
    const m = seed % 2 ? 'bronze' : 'plaster';
    b.push(0, 0, 0.05 * s);
    b.sph(m, 0.035 * s, 0, 0.75 * s, 0.01 * s, { ws: 8, hs: 6 });
    b.box(m, 0.07 * s, 0.2 * s, 0.04 * s, 0, 0.6 * s, 0.0, { r: 0.015 * s });
    for (const sx of [-1, 1]) { b.rod(m, 0.013 * s, [sx * 0.03 * s, 0.68 * s, 0], [sx * 0.26 * s, 0.73 * s, 0], { seg: 5 }); b.rod(m, 0.016 * s, [sx * 0.015 * s, 0.5 * s, 0], [sx * 0.005 * s, 0.24 * s, 0.01 * s], { seg: 5 }); }
    b.box('fab_white', 0.08 * s, 0.05 * s, 0.045 * s, 0, 0.48 * s, 0, { r: 0.01 * s });
    b.pop();
  });
}
export function mirror(w = 0.5, h = 0.7, cracked = true) {
  return tpl(`mirror:${w}:${h}:${cracked}`, (b) => {
    b.box('pi_wood_dark', w + 0.06, h + 0.06, 0.025, 0, h / 2 + 0.03, 0.0125, { r: 0.006 });
    b.box('glass_dark', w, h, 0.004, 0, h / 2 + 0.03, 0.027);
    if (cracked) for (let i = 0; i < 4; i++) b.box('chrome', 0.004, h * 0.4, 0.002, 0.05 + i * 0.03 - 0.06, h * 0.6, 0.03, { rz: (i - 1.5) * 0.5 });
  });
}

// 掛牆電視(CRT + 吊架),背面貼牆 z=0
export function tvWall(seed = 0) {
  return tpl(`tvwall:${seed % 2}`, (b) => {
    b.box('enamel_black', 0.3, 0.3, 0.02, 0, 0, 0.01, { r: 0.004 });
    b.box('enamel_black', 0.06, 0.06, 0.45, 0, -0.1, 0.24, { r: 0.006 });
    b.box('enamel_black', 0.5, 0.03, 0.42, 0, -0.14, 0.45, { r: 0.006 });
    crtBox(b, 0, -0.125, 0.45, 0.62, 0.48, 0.48, seed % 2 ? 'pl_dark' : 'pl_beige');
  });
}
// CRT 外殼:中心 x,底 y,z;w h d;螢幕留給呼叫者(回傳螢幕位置)
export function crtBox(b, x, y, z, w, h, d, s = 'pl_beige') {
  b.box(s, w, h, d * 0.45, x, y + h / 2, z + d * 0.275, { r: 0.025 });
  b.box(s, w * 0.75, h * 0.8, d * 0.6, x, y + h * 0.46, z - d * 0.2, { r: 0.05 });
  b.box('screen_dark', w * 0.8, h * 0.74, 0.02, x, y + h * 0.54, z + d * 0.5, { r: 0.03 });
  for (let i = 0; i < 4; i++) b.box('pl_gray', 0.015, 0.015, 0.006, x + w * 0.3 + (i % 2) * 0.03, y + h * 0.12 + ((i / 2) | 0) * 0.03, z + d * 0.5 + 0.002, { r: 0.003 });
  return { x, y: y + h * 0.54, z: z + d * 0.5 + 0.012, w: w * 0.74, h: h * 0.66 };
}

// ---------------------------------------------------------------- 飲水機(桶裝)
export function waterCooler(seed = 0) {
  return tpl(`cooler:${seed % 2}`, (b) => {
    b.win = win(seed + 211);
    b.box('pl_white', 0.32, 0.95, 0.32, 0, 0.475, 0, { r: 0.02 });
    b.box('pl_gray', 0.2, 0.18, 0.02, 0, 0.75, 0.165, { r: 0.01 });
    for (const [x, c] of [[-0.05, 'pl_red'], [0.05, 'pl_blue']]) b.box(c, 0.03, 0.04, 0.04, x, 0.8, 0.18, { r: 0.006 });
    b.box('pl_gray', 0.18, 0.02, 0.1, 0, 0.67, 0.13, { r: 0.004 });
    if (seed % 2 === 0) { // 桶子(半滿,水混濁)
      b.lathe('pi_clear', [[0, 0.95], [0.13, 0.97], [0.135, 1.05], [0.135, 1.3], [0.06, 1.38], [0.025, 1.4], [0, 1.4]], 0, 0, 0, { seg: 14 });
      b.cyl('pi_fluid', 0.125, 0.12, 0, 1.03, 0, { seg: 12 });
    }
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.17, 0, -0.17), new THREE.Vector3(0.17, 1.4, 0.17));
  });
}

// ---------------------------------------------------------------- 雜誌架
export function magazineRack(seed = 0) {
  return tpl(`magrack:${seed % 2}`, (b) => {
    b.box('pi_wood_oak', 0.7, 0.9, 0.03, 0, 0.45, -0.12, { r: 0.004 });
    for (let i = 0; i < 3; i++) {
      const y = 0.2 + i * 0.25;
      b.box('pi_wood_oak', 0.7, 0.02, 0.18, 0, y, -0.03, { r: 0.003, rx: -0.25 });
      b.box('pi_wood_oak', 0.7, 0.08, 0.015, 0, y + 0.04, 0.06, { r: 0.003 });
      for (let k = 0; k < 3; k++) if ((i + k + seed) % 4) b.plane(L(poster(['kids', 'blood', 'handwash', 'quiet'][(i + k) % 4])), 0.18, 0.24, -0.22 + k * 0.22, y + 0.13, -0.02 - i * 0.002, { rx: -0.25 });
    }
    for (const sx of [-1, 1]) b.box('pi_wood_oak', 0.03, 0.9, 0.3, sx * 0.35, 0.45, -0.0, { r: 0.004 });
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.37, 0, -0.15), new THREE.Vector3(0.37, 0.9, 0.15));
  });
}

// ---------------------------------------------------------------- 桌上物品
export function phone(seed = 0) {
  return tpl(`phone:${seed % 2}`, (b) => {
    const s = seed % 2 ? 'pl_beige' : 'pl_black';
    b.box(s, 0.2, 0.06, 0.22, 0, 0.03, 0, { r: 0.015, rx: -0.1 });
    for (let i = 0; i < 12; i++) b.box('pl_gray', 0.022, 0.008, 0.018, -0.03 + (i % 3) * 0.03, 0.065 - Math.floor(i / 3) * 0.002, 0.02 + Math.floor(i / 3) * 0.025, { r: 0.002 });
    b.box(s, 0.22, 0.045, 0.06, 0, 0.08, -0.07, { r: 0.02 }); // 話筒
    b.tube('pl_black', [[0.1, 0.05, -0.08], [0.16, 0.02, -0.06], [0.14, 0.003, 0.05], [0.2, 0.003, 0.1]], 0.004, { seg: 4, bend: 0.03 });
  });
}
export function deskLamp(seed = 0) {
  return tpl(`desklamp:${seed % 2}`, (b) => {
    // 銀行家檯燈:黃銅底 + 綠色玻璃燈罩
    b.lathe('brass', [[0, 0], [0.09, 0], [0.09, 0.015], [0.05, 0.03], [0, 0.03]], 0, 0, 0, { seg: 14 });
    b.cyl('brass', 0.008, 0.32, 0, 0.18, 0, { seg: 6 });
    b.rod('brass', 0.006, [0, 0.33, 0], [0, 0.36, 0.04], { seg: 5 });
    b.cyl('glass_green', 0.06, 0.32, 0, 0.36, 0.06, { axis: 'x', seg: 14, t0: 0, tl: Math.PI });
    b.cyl(G(glowSwatch('warm', '#ffd89a')), 0.02, 0.18, 0, 0.35, 0.06, { axis: 'x', seg: 8 });
    b.rod('brass', 0.002, [0.05, 0.33, 0.06], [0.05, 0.25, 0.06], { seg: 3 });
  });
}
export function crtMonitor(seed = 0, screenRect = null) {
  return tpl(`crtmon:${seed % 3}:${screenRect ? screenRect.u0.toFixed(4) : 'off'}`, (b) => {
    b.win = win(seed + 221);
    const s = ['pl_beige', 'pl_cream', 'pl_gray'][seed % 3];
    b.box(s, 0.24, 0.02, 0.2, 0, 0.01, 0, { r: 0.008 });
    b.cyl(s, 0.05, 0.04, 0, 0.04, 0, { seg: 10 });
    const sc = crtBox(b, 0, 0.06, 0, 0.38, 0.34, 0.38, s);
    if (screenRect) b.plane(G(screenRect), sc.w, sc.h, sc.x, sc.y, sc.z);
  });
}
export function keyboard(seed = 0) {
  return tpl(`kbd:${seed % 2}`, (b) => {
    b.box('pl_beige', 0.46, 0.03, 0.17, 0, 0.015, 0, { r: 0.006, rx: 0.05 });
    b.plane(L(keyboardTex()), 0.44, 0.15, 0, 0.0315, 0.0, { rx: -Math.PI / 2 + 0.05 });
    b.tube('pl_beige', [[0, 0.02, -0.09], [0.02, 0.01, -0.2], [0.1, 0.005, -0.25]], 0.003, { seg: 4, bend: 0.03 });
  });
}
export function pcTower(seed = 0) {
  return tpl(`pc:${seed % 2}`, (b) => {
    b.win = win(seed + 231);
    b.box('pl_beige', 0.19, 0.42, 0.44, 0, 0.21, 0, { r: 0.008 });
    b.box('pl_gray', 0.15, 0.04, 0.005, 0, 0.36, 0.222);
    b.box('pl_gray', 0.15, 0.04, 0.005, 0, 0.3, 0.222);
    b.box('pl_dark', 0.1, 0.012, 0.005, 0, 0.22, 0.222);
    led(b, 0.06, 0.12, 0.222, seed % 2 ? '#30ff60' : '#40100a');
    b.cyl('pl_gray', 0.012, 0.01, 0.03, 0.12, 0.222, { axis: 'z', seg: 8 });
    b.meta.coll = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.22), new THREE.Vector3(0.1, 0.42, 0.22));
  });
}
export function printer(seed = 0) {
  return tpl(`printer:${seed % 2}`, (b) => {
    b.win = win(seed + 241);
    b.box('pl_beige', 0.46, 0.2, 0.38, 0, 0.1, 0, { r: 0.015 });
    b.box('pl_gray', 0.3, 0.02, 0.2, 0, 0.21, -0.12, { r: 0.006, rx: 0.5 });
    b.box('paper', 0.21, 0.003, 0.25, 0, 0.23, -0.1, { rx: 0.5 });
    b.box('pl_gray', 0.3, 0.015, 0.16, 0, 0.06, 0.24, { r: 0.004 });
    b.box('paper', 0.21, 0.004, 0.15, 0.0, 0.07, 0.25, { ry: 0.1 });
    led(b, 0.18, 0.15, 0.191, '#ff9020');
  });
}

export { caster, B, tpl };
