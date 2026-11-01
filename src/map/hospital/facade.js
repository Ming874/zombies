import { prng, hashStr } from './paint.js';

// [scene6] 外牆的「住過的痕跡」:從停車場看過去,台灣老醫院的外牆不是一片平的 —
//  窗型冷氣(白鐵架、下面一條條鏽水痕)、一二樓的鐵窗(凸出的鐵條籠 + 波浪鐵皮頂)、從屋頂一路接到地面的落水管(每 1.6m 一個管束)。
// 只用結構收邊/既有材質鍵(trim_cream / trim_gray / trim_rust / trim_white / trim_steel / iron)→ 進結構的合併桶,不新增材質。
// 呼叫點:openings.buildWindows 最後(要用 K.windowInfo 與 K.faces)。
const frameOf = (axis) => (axis === 'z' ? { X: (u, w) => u, Z: (u, w) => w } : { X: (u, w) => w, Z: (u, w) => u });
function lbox(B, li, key, F, u0, y0, w0, u1, y1, w1) {
  const xa = F.X(u0, w0), xb = F.X(u1, w1), za = F.Z(u0, w0), zb = F.Z(u1, w1);
  B.box(li, key, Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), {});
}

const hashS = (n) => { const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };
export function buildFacade(K) {
  const { L, B } = K;
  const stats = { ac: 0, cage: 0, pipe: 0 };
  for (const w of K.windowInfo || []) {
    if (!(w.outA || w.outB) || w.store || w.boarded) continue;
    const lv = L.levels[w.li], id = lv.id;
    if (id === 'B1' || w.zone?.id === 'f2_ward_207') continue; // 207 的窗要乾淨(結局的視角)
    const R = prng(hashStr(`fac${w.li},${w.c},${w.r}`));
    const F = frameOf(w.axis), y = lv.y, s0 = y + L.WINDOW_SILL, s1 = y + L.WINDOW_TOP;
    // 外牆面位置與往外的方向(局部 w)
    const [wA, wB] = w.axis === 'z' ? [w.r * 2, w.r * 2 + 2] : [w.c * 2, w.c * 2 + 2];
    const wo = w.outA ? wA : wB, out = w.outA ? -1 : 1;
    const W = (d) => wo + out * d; // 離外牆面 d 公尺
    const mid = (w.u0 + w.u1) / 2;
    const roll = R();
    // [scene7] 窗台下的雨水黑痕(大多數窗都有;老建築外牆最明顯的紋理變化)
    if (hashS(w.li * 131 + w.c * 17 + w.r * 7) < 0.7) {
      const n = 2 + ((hashS(w.c * 3.1 + w.r) * 3) | 0);
      for (let k = 0; k < n; k++) { const u = w.u0 + 0.2 + hashS(k * 7.7 + w.c + w.r * 3) * (w.u1 - w.u0 - 0.4), l = 0.5 + hashS(k * 3.3 + w.c * 1.7) * 1.6, wd = 0.02 + hashS(k + w.r) * 0.05; lbox(B, w.li, 'trim_soot', F, u - wd / 2, Math.max(y + 0.1, s0 - 0.08 - l), W(0.0), u + wd / 2, s0 - 0.08, W(0.004)); }
    }
    // ---- 窗型冷氣(2F/3F 三成、1F 一成五):窗台下方穿牆,外凸 0.42m
    if (roll < (id === '1F' ? 0 : 0.3)) { // 1F 不放(膝蓋高度凸出 40cm、沒有碰撞會穿過去)
      const cu = mid + (R() < 0.5 ? -0.42 : 0.42), hw = 0.31, yb = s0 - 0.55, yt = s0 - 0.12;
      lbox(B, w.li, 'trim_cream', F, cu - hw, yb, W(0.0), cu + hw, yt, W(0.42)); // 機身
      for (let k = 0; k < 6; k++) { const yy = yb + 0.05 + k * 0.055; lbox(B, w.li, 'trim_gray', F, cu - hw + 0.03, yy, W(0.42), cu + hw - 0.03, yy + 0.022, W(0.428)); } // 正面出風格柵
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const yy = yb + 0.08 + k * 0.07; lbox(B, w.li, 'trim_gray', F, cu + s * hw - (s > 0 ? 0 : 0.006), yy, W(0.12), cu + s * hw + (s > 0 ? 0.006 : 0), yy + 0.025, W(0.36)); } // 側面百葉
      for (const s of [-1, 1]) { // 白鐵 L 架
        lbox(B, w.li, 'trim_rust', F, cu + s * 0.24 - 0.02, yb - 0.04, W(0.0), cu + s * 0.24 + 0.02, yb, W(0.46));
        lbox(B, w.li, 'trim_rust', F, cu + s * 0.24 - 0.015, yb - 0.38, W(0.0), cu + s * 0.24 + 0.015, yb - 0.04, W(0.035));
        lbox(B, w.li, 'trim_rust', F, cu + s * 0.24 - 0.012, yb - 0.3, W(0.03), cu + s * 0.24 + 0.012, yb - 0.27, W(0.38)); // 斜撐(簡化成水平短撐)
      }
      // 鏽水痕:機架下方幾條細長的鏽色線(貼在牆上)
      const n = 3 + ((R() * 3) | 0);
      for (let k = 0; k < n; k++) { const u = cu + (R() - 0.5) * 0.5, l = 0.4 + R() * 1.4, wd = 0.008 + R() * 0.018; lbox(B, w.li, R() < 0.6 ? 'trim_rust' : 'trim_soot', F, u - wd / 2, Math.max(y + 0.05, yb - 0.4 - l), W(0.0), u + wd / 2, yb - 0.38, W(0.003)); }
      // 排水軟管:從機身底部垂下一段
      lbox(B, w.li, 'trim_white', F, cu + hw - 0.06, yb - 0.5, W(0.33), cu + hw - 0.04, yb, W(0.35));
      stats.ac++;
      continue;
    }
    // ---- 鐵窗(凸出的鐵條籠):1F(北面後巷已經有室內鐵條,除外)六成、2F 三成
    const cageP = id === '1F' ? (w.r <= 6 ? 0 : 0.6) : id === '2F' ? 0.3 : 0.06;
    if (roll < (id === '1F' ? 0 : 0.3) + cageP) {
      const ua = w.u0 - 0.05, ub = w.u1 + 0.05, ya = s0 - 0.12, yb2 = s1 + 0.12, d = id === '1F' ? 0.16 : 0.24;
      for (let u = ua + 0.03; u < ub - 0.02; u += 0.115) lbox(B, w.li, 'iron', F, u - 0.007, ya, W(d - 0.014), u + 0.007, yb2, W(d)); // 直條
      for (const yy of [ya, ya + 0.45, (ya + yb2) / 2 + 0.25, yb2 - 0.02]) lbox(B, w.li, 'iron', F, ua, yy, W(d - 0.02), ub, yy + 0.02, W(d + 0.004)); // 橫條
      for (const u of [ua, ub - 0.02]) for (const yy of [ya, yb2 - 0.02]) lbox(B, w.li, 'iron', F, u, yy, W(0), u + 0.02, yy + 0.02, W(d)); // 往牆的固定條
      // 頂上的波浪鐵皮(往外下斜成一片,用三段近似)
      for (let k = 0; k < 3; k++) lbox(B, w.li, k === 1 ? 'trim_rust' : 'iron', F, ua - 0.04, yb2 + 0.02 - k * 0.03, W(k * 0.1), ub + 0.04, yb2 + 0.04 - k * 0.03, W(k * 0.1 + 0.11));
      if (R() < 0.4) lbox(B, w.li, 'trim_soot', F, ua + 0.1, yb2 - 0.9, W(0.0), ua + 0.13, yb2 - 0.05, W(0.003)); // 鐵鏽流痕
      stats.cage++;
    }
  }
  // ---- 落水管:選幾條「每一層都沒有窗」的外牆格欄,從地面接到屋頂
  const cols = new Map(); // key = dir|fixed|a0 → { faces: [...], win }
  for (const f of K.faces) {
    if (f.kind !== 'facade') continue;
    for (const s of f.segs || []) {
      const key = `${f.dir}|${f.fixed}|${s.a0}`;
      let e = cols.get(key);
      if (!e) cols.set(key, (e = { dir: f.dir, fixed: f.fixed, a0: s.a0, nx: f.nx, nz: f.nz, lv: [], win: false }));
      if (s.win) e.win = true;
      e.lv.push({ li: f.li, y: f.y, top: f.top });
    }
  }
  for (const [key, e] of cols) {
    if (e.win || e.lv.length < 2) continue;
    const lis = e.lv.map((q) => q.li).sort((a, b) => a - b);
    if (lis.some((v, i) => i && v !== lis[i - 1] + 1)) continue; // 中間有一層縮進去:不接
    const h = (hashStr(`pipe${key}`) % 1000) / 1000;
    if (h > 0.16) continue;
    const yTop = Math.max(...e.lv.map((q) => q.y + q.top)), li = Math.min(...e.lv.map((q) => q.li));
    const horiz = e.dir === 'N' || e.dir === 'S', t = e.a0 + 0.35;
    const nx = e.nx ?? (e.dir === 'E' ? 1 : e.dir === 'W' ? -1 : 0), nz = e.nz ?? (e.dir === 'S' ? 1 : e.dir === 'N' ? -1 : 0);
    const px = horiz ? t : e.fixed + nx * 0.09, pz = horiz ? e.fixed + nz * 0.09 : t, r = 0.05;
    const yBot = L.levels[li].y;
    B.box(li, 'trim_gray', px - r, yBot + 0.25, pz - r, px + r, yTop - 0.15, pz + r, {});
    for (let yy = yBot + 1.2; yy < yTop - 0.4; yy += 1.6) B.box(li, 'trim_steel', px - r - 0.012, yy, pz - r - 0.012, px + r + 0.012, yy + 0.04, pz + r + 0.012, {}); // 管束
    // 底部彎頭往外吐水 + 地上一攤青苔色
    const ox = nx * 0.18, oz = nz * 0.18;
    B.box(li, 'trim_gray', Math.min(px, px + ox) - r, yBot + 0.08, Math.min(pz, pz + oz) - r, Math.max(px, px + ox) + r, yBot + 0.25, Math.max(pz, pz + oz) + r, {});
    B.box(li, 'trim_gray', px - r - 0.02, yTop - 0.18, pz - r - 0.02, px + r + 0.02, yTop - 0.05, pz + r + 0.02, {}); // 頂部集水斗
    stats.pipe++;
  }
  // ---- 樓板線與女兒牆壓頂:每層樓板處一條外凸 6cm 的水泥帶、最上層加壓頂;每 8m 一根淺壁柱(只在沒有窗的格)
  // 夜裡遠看,一片平的外牆靠這些水平線讀得出「這是三層樓的建築」
  for (const f of K.faces) {
    if (f.kind !== 'facade') continue;
    const id = L.levels[f.li].id;
    if (id === 'B1') continue;
    const horiz = f.dir === 'N' || f.dir === 'S', nx = f.nx, nz = f.nz;
    const slab = (a0, a1, y0, y1, d) => {
      if (horiz) B.box(f.li, 'trim_concrete', a0, y0, Math.min(f.fixed, f.fixed + nz * d), a1, y1, Math.max(f.fixed, f.fixed + nz * d), {});
      else B.box(f.li, 'trim_concrete', Math.min(f.fixed, f.fixed + nx * d), y0, a0, Math.max(f.fixed, f.fixed + nx * d), y1, a1, {});
    };
    if (id !== '1F') slab(f.a0 - 0.06, f.a1 + 0.06, f.y - 0.12, f.y + 0.1, 0.06);
    if (id === '1F') { // [scene7] 1F 牆腳 0.85m 的綠色磁磚裙(老醫院常見),和上面的外牆材質分開
      if (horiz) B.box(f.li, 'tile_green', f.a0, f.y, Math.min(f.fixed, f.fixed + nz * 0.018), f.a1, f.y + 0.85, Math.max(f.fixed, f.fixed + nz * 0.018), {});
      else B.box(f.li, 'tile_green', Math.min(f.fixed, f.fixed + nx * 0.018), f.y, f.a0, Math.max(f.fixed, f.fixed + nx * 0.018), f.y + 0.85, f.a1, {});
      slab(f.a0, f.a1, f.y + 0.85, f.y + 0.88, 0.03); // 磁磚收邊
    }
    const roofLevel = f.top >= L.LEVEL_H - 0.05 && !L.levels[f.li + 1];
    if (roofLevel || id === '3F') slab(f.a0 - 0.08, f.a1 + 0.08, f.y + f.top - 0.02, f.y + f.top + 0.1, 0.09);
    for (const s of f.segs || []) {
      if (s.win || Math.round(s.a0) % 8 !== 0) continue;
      slab(s.a0 - 0.2, s.a0 + 0.2, f.y + (id === '1F' ? 0 : 0.1), f.y + f.top, 0.05);
    }
  }
  K.facadeStats = stats;
}
