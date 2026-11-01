import {
  prng, hashStr, sheet, rgb, shade, hexToRgb, noise, mottle, grain, wrap, blob, blobs, tideMark, drips, jagged, peel, crack,
  vgrad, speckle, grid, groutLines, mkCanvas,
} from './paint.js';

// 結構表面的程式貼圖定義(純繪圖,不依賴 three;主執行緒與 Worker 共用)。
// 每個鍵:gen(R) → { c 顏色畫布, hc 高度畫布 },size = [u 公尺, v 公尺],room = v 從地面起算。
const H34 = 3.4;
// ======================================================================
// 牆面
// ======================================================================
function paintWall(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, w, h } = s, m = h / H34, Y = (v) => h - v * m;
  mottle(x, w, h, R, 0.16, [40, 40, 34], [250, 250, 236]);
  for (let i = 0; i < 16; i++) { x.fillStyle = rgb(255, 255, 245, R.r(0.012, 0.035)); const px = R() * w; x.fillRect(px, 0, R.r(10, 34), h); } // 滾筒痕
  const nStain = Math.round(R.r(1, 3) * (o.stains ?? 1));
  for (let i = 0; i < nStain; i++) {
    const cx = R() * w, rx = R.r(28, 90), ry = R.r(60, 170), cy = R.r(0, 40) + ry * 0.4, sd = (R() * 1e9) | 0;
    wrap(w, h, cx, cy, rx, (px) => tideMark(x, px, cy, rx, ry, prng(sd)), false);
  }
  drips(x, w, R, Math.round(26 * (o.streak ?? 1)), 0, 40, 280, [42, 36, 26], 0.22);
  if (o.scuff !== false) for (let i = 0; i < 46; i++) { // 推床擦撞帶(0.7~1.1m)
    const px = R() * w, py = Y(R.r(0.72, 1.12)), ww = R.r(12, 80), hh = R.r(1, 4);
    x.fillStyle = rgb(24, 20, 16, R.r(0.05, 0.2));
    wrap(w, h, px, py, ww, (qx) => x.fillRect(qx, py, ww, hh), false);
  }
  peel(s, R, o.peelN ?? 10, 6, 34, o.under, Y(3.3), Y(0.25));
  if (o.under2) peel(s, R, o.peelBig ?? 3, 22, 58, o.under2, Y(3.2), Y(1.3));
  blobs(x, w, h, R, Math.round(10 * (o.mold ?? 0.6)), 6, 26, 'rgba(26,34,22,1)', 0.15, 0.45, false, Y(0.5), h); // 牆腳霉斑
  blobs(x, w, h, R, Math.round(6 * (o.mold ?? 0.6)), 8, 30, 'rgba(30,34,24,1)', 0.1, 0.35, false, 0, Y(2.9));
  for (let i = 0; i < (o.cracks ?? 2); i++) crack(s, R, R() * w, Y(R.r(1.6, 3.3)), R.r(60, 170), R.r(1.2, 1.9));
  vgrad(x, w, Y(0.4), h, 'rgba(18,14,10,0)', `rgba(18,14,10,${0.42 * (o.grime ?? 1)})`);
  vgrad(x, w, 0, Y(3.1), `rgba(16,13,10,${o.soot ?? 0.28})`, 'rgba(16,13,10,0)');
  grain(x, w, h, R, 13);
  return s;
}
// 護牆下段(亮光漆,可平鋪,v = 離地高度 / 1.2)
function dadoPaint(R, o) {
  const s = sheet(512, 256, o.base);
  const { x, w, h } = s, m = h / 1.2, Y = (v) => h - v * m;
  mottle(x, w, h, R, 0.14, [30, 30, 30], [220, 220, 210]);
  for (let i = 0; i < 60; i++) { // 刮痕與擦痕
    const px = R() * w, py = R() * h, ww = R.r(8, 70);
    x.strokeStyle = R() < 0.5 ? rgb(230, 225, 210, R.r(0.08, 0.25)) : rgb(10, 10, 8, R.r(0.1, 0.3));
    x.lineWidth = R.r(0.6, 2);
    wrap(w, h, px, py, ww, (qx) => { x.beginPath(); x.moveTo(qx, py); x.lineTo(qx + ww, py + R.r(-3, 3)); x.stroke(); }, false);
  }
  peel(s, R, o.chips ?? 14, 3, 14, o.under, 0, h);
  drips(x, w, R, 10, 0, 20, 120, [20, 18, 12], 0.25, 3);
  vgrad(x, w, Y(0.3), h, 'rgba(10,8,6,0)', 'rgba(10,8,6,0.5)');
  grain(x, w, h, R, 12);
  return s;
}
// 磁磚牆/地板(可平鋪)。cols×rows 片;offset = 交丁
function tiles(R, o) {
  const N = o.px ?? 512;
  const s = sheet(N, N, o.grout);
  const { x, hx, w, h } = s;
  const cols = o.cols, rows = o.rows, tw = w / cols, th = h / rows, g = o.gw ?? 3;
  const base = hexToRgb(o.color);
  const missing = new Set();
  const seed = (R() * 1e6) | 0;
  grid(s, cols, rows, (i, j, px, py, _tw, _th, T) => {
    const ii = ((i % cols) + cols) % cols;
    const key = j * cols + ii;
    if (T() < (o.missing ?? 0.02)) { missing.add(`${i},${j}`); return; }
    const alt = o.alt && T() < (o.altP ?? 0.5) ? hexToRgb(o.alt) : base;
    const k = T.r(0.93, 1.05) * (T() < 0.06 ? 0.9 : 1);
    void key;
    x.fillStyle = rgb(alt[0] * k, alt[1] * k, alt[2] * k);
    x.fillRect(px + g / 2, py + g / 2, tw - g, th - g);
    const gr = x.createLinearGradient(px, py, px + tw, py + th); // 釉面反光
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)');
    x.fillStyle = gr; x.fillRect(px + g / 2, py + g / 2, tw - g, th - g);
    if (hx) { hx.fillStyle = '#b4b4b4'; hx.fillRect(px + g / 2, py + g / 2, tw - g, th - g); hx.fillStyle = '#c8c8c8'; hx.fillRect(px + g, py + g, tw - g * 2, th - g * 2); }
    if (T() < (o.cracked ?? 0.05)) crack(s, T, px + T() * tw, py + T() * th, Math.max(tw, th) * 0.8, T() * 6.28, 1, 'rgba(30,26,20,0.6)', 0);
  }, o.offset ?? 0, seed);
  for (const key of missing) { // 掉落的磁磚:露出水泥與梳狀黏著劑痕
    const [i, j] = key.split(',').map(Number), px = i * tw + ((j % 2) * (o.offset ?? 0) * tw), py = j * th;
    x.fillStyle = '#6f6c64'; x.fillRect(px, py, tw, th);
    x.strokeStyle = 'rgba(40,38,34,0.5)'; x.lineWidth = 1;
    for (let k = 3; k < th; k += 4) { x.beginPath(); x.moveTo(px, py + k); x.lineTo(px + tw, py + k + R.r(-1, 1)); x.stroke(); }
    if (hx) { hx.fillStyle = '#404040'; hx.fillRect(px, py, tw, th); }
  }
  blobs(x, w, h, R, Math.round(18 * (o.dirt ?? 1)), 20, 90, 'rgba(60,48,30,1)', 0.04, 0.16);
  if (o.rust) drips(x, w, R, Math.round(8 * o.rust), 0, 60, 300, [110, 60, 28], 0.3, 5);
  if (o.blood) blobs(x, w, h, R, Math.round(5 * o.blood), 14, 60, 'rgba(90,14,10,1)', 0.12, 0.35);
  grain(x, w, h, R, o.grain ?? 9);
  return s;
}
function plaster(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, w, h } = s;
  mottle(x, w, h, R, 0.2, [60, 56, 46], [255, 250, 236]);
  for (let i = 0; i < 70; i++) { // 鏝刀痕
    const cx = R() * w, cy = R() * h, r = R.r(20, 70), a0 = R() * 6.28;
    x.strokeStyle = R() < 0.5 ? 'rgba(255,252,240,0.06)' : 'rgba(40,34,26,0.05)';
    x.lineWidth = R.r(4, 12);
    wrap(w, h, cx, cy, r, (px, py) => { x.beginPath(); x.arc(px, py, r, a0, a0 + R.r(0.5, 1.4)); x.stroke(); });
  }
  for (let i = 0; i < (o.damp ?? 3); i++) { const cx = R() * w, cy = R() * h, rx = R.r(40, 110); wrap(w, h, cx, cy, rx * 1.4, (px, py) => tideMark(x, px, py, rx, rx * R.r(0.7, 1.4), R, [80, 66, 44])); }
  speckle(x, w, h, R, 160 * (o.salt ?? 1), 0.6, 2.2, ['rgba(250,250,240,0.6)', 'rgba(235,235,225,0.4)']);
  peel(s, R, o.peelN ?? 6, 6, 26, o.under ?? '#8d8474');
  for (let i = 0; i < (o.cracks ?? 3); i++) crack(s, R, R() * w, R() * h, R.r(80, 220), R() * 6.28, R.r(1, 1.8));
  if (o.mold) blobs(x, w, h, R, Math.round(14 * o.mold), 6, 30, 'rgba(28,32,20,1)', 0.12, 0.4);
  grain(x, w, h, R, 12);
  return s;
}
function marble(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, w, h } = s;
  mottle(x, w, h, R, 0.12, [80, 76, 70], [255, 252, 245]);
  for (let i = 0; i < 34; i++) {
    let px = R() * w, py = R() * h, a = R.r(-0.6, 0.6) + (R() < 0.5 ? 0 : Math.PI / 2);
    x.strokeStyle = rgb(...hexToRgb(o.vein), R.r(0.1, 0.45));
    x.lineWidth = R.r(0.6, 2.6);
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 40; k++) { a += R.r(-0.3, 0.3); px += Math.cos(a) * 8; py += Math.sin(a) * 8; x.lineTo(px, py); }
    x.stroke();
  }
  groutLines(s, o.cols ?? 2, o.rows ?? 2, 3, 'rgba(50,46,40,0.7)', o.offset ?? 0.5);
  blobs(x, w, h, R, 14, 20, 80, 'rgba(60,50,36,1)', 0.04, 0.14);
  grain(x, w, h, R, 6);
  return s;
}
// 清水模(板模紋 + 繫結孔),2.4m 見方
function concreteWall(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, hx, w, h } = s;
  mottle(x, w, h, R, 0.26, [40, 40, 38], [230, 230, 225]);
  const bh = h / 16;
  for (let j = 0; j < 16; j++) { // 板模
    const k = R.r(-0.07, 0.07);
    x.fillStyle = k > 0 ? `rgba(255,255,250,${k})` : `rgba(10,10,8,${-k})`;
    x.fillRect(0, j * bh, w, bh);
    x.fillStyle = 'rgba(20,20,18,0.25)'; x.fillRect(0, j * bh, w, 1.5);
    if (hx) { hx.fillStyle = '#6a6a6a'; hx.fillRect(0, j * bh, w, 1.5); }
    for (let k2 = 0; k2 < 5; k2++) { x.strokeStyle = 'rgba(30,28,24,0.08)'; x.lineWidth = 1; const yy = j * bh + R() * bh; x.beginPath(); x.moveTo(0, yy); for (let xx = 0; xx <= w; xx += 32) x.lineTo(xx, yy + Math.sin(xx * 0.03 + k2) * 1.5); x.stroke(); }
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { // 繫結孔
    const px = (i + 0.5) * w / 4, py = (j + 0.5) * h / 4;
    x.fillStyle = 'rgba(28,28,26,0.75)'; x.beginPath(); x.arc(px, py, 5, 0, 6.28); x.fill();
    x.fillStyle = 'rgba(200,200,190,0.2)'; x.beginPath(); x.arc(px - 1, py - 1, 5, 0, 3); x.fill();
    if (hx) { hx.fillStyle = '#303030'; hx.beginPath(); hx.arc(px, py, 5, 0, 6.28); hx.fill(); }
    if (R() < 0.6) { const g = x.createLinearGradient(0, py, 0, py + 140); g.addColorStop(0, 'rgba(110,64,30,0.35)'); g.addColorStop(1, 'rgba(110,64,30,0)'); x.fillStyle = g; x.fillRect(px - 2, py, R.r(2, 5), 140); }
  }
  for (let i = 0; i < 4; i++) { const cx = R() * w, cy = R() * h * 0.6, rx = R.r(30, 80); wrap(w, h, cx, cy, rx * 2, (px, py) => tideMark(x, px, py, rx, rx * 1.8, R, [60, 54, 42])); }
  drips(x, w, R, 24 * (o.wet ?? 1), 0, 60, 400, [30, 30, 26], 0.22, 6);
  speckle(x, w, h, R, 400, 0.5, 1.6, ['rgba(20,20,18,0.5)', 'rgba(200,200,190,0.4)']);
  for (let i = 0; i < 3; i++) crack(s, R, R() * w, R() * h, R.r(80, 200), R() * 6.28, 1.4);
  if (o.mold) blobs(x, w, h, R, Math.round(20 * o.mold), 8, 40, 'rgba(22,30,18,1)', 0.15, 0.45);
  grain(x, w, h, R, 18);
  return s;
}
// 上漆空心磚(樓梯間),2.4m 見方:6×12 塊
function cmuWall(R, o) {
  const s = sheet(512, 512, o.mortar ?? '#8a877d');
  const { x, hx, w, h } = s;
  const base = hexToRgb(o.base);
  grid(s, 6, 12, (i, j, px, py, tw, th, T) => {
    const k = T.r(0.95, 1.04);
    x.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k);
    x.fillRect(px + 2, py + 2, tw - 4, th - 4);
    if (hx) { hx.fillStyle = '#b0b0b0'; hx.fillRect(px + 2, py + 2, tw - 4, th - 4); }
  }, 0.5, (R() * 1e6) | 0);
  speckle(x, w, h, R, 1500, 0.5, 1.5, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.1)']);
  mottle(x, w, h, R, 0.14, [40, 40, 36], [240, 240, 230]);
  peel(s, R, 8, 6, 28, '#7b7b74');
  drips(x, w, R, 16, 0, 60, 300, [50, 40, 30], 0.2, 4);
  blobs(x, w, h, R, 8, 20, 70, 'rgba(70,58,40,1)', 0.05, 0.18);
  grain(x, w, h, R, 12);
  return s;
}
function brick(R, o) {
  const s = sheet(512, 512, o.mortar ?? '#7d776c');
  const { x, hx, w, h } = s;
  const cols = 9, rows = 26;
  const pal = (o.palette ?? ['#7a3a2a', '#6c3426', '#83432e', '#5e2e22', '#8a5038', '#4e2a22']).map(hexToRgb);
  grid(s, cols, rows, (i, j, px, py, tw, th, T) => {
    const c = pal[(T() * pal.length) | 0], k = T.r(0.85, 1.1);
    x.fillStyle = rgb(c[0] * k, c[1] * k, c[2] * k);
    x.fillRect(px + 1.5, py + 1.5, tw - 3, th - 3);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + 1.5, py + th - 4, tw - 3, 2.5);
    x.fillStyle = 'rgba(255,230,200,0.06)'; x.fillRect(px + 1.5, py + 1.5, tw - 3, 2);
    if (hx) { hx.fillStyle = '#b8b8b8'; hx.fillRect(px + 1.5, py + 1.5, tw - 3, th - 3); }
  }, 0.5, (R() * 1e6) | 0);
  speckle(x, w, h, R, 1200, 0.5, 1.4, ['rgba(0,0,0,0.18)', 'rgba(255,220,190,0.1)']);
  if (o.soot) vgrad(x, w, 0, h, `rgba(10,8,6,${0.75 * o.soot})`, `rgba(10,8,6,${0.1 * o.soot})`);
  if (o.moss) blobs(x, w, h, R, Math.round(30 * o.moss), 8, 40, 'rgba(40,52,24,1)', 0.15, 0.5);
  speckle(x, w, h, R, 120 * (o.salt ?? 0.5), 1, 3, ['rgba(230,230,220,0.35)']);
  grain(x, w, h, R, 14);
  return s;
}
// 不規則砌石(納骨堂)
function stoneWall(R, o) {
  const s = sheet(512, 512, '#2e2a26');
  const { x, hx, w, h } = s;
  const base = hexToRgb(o.base ?? '#6b655b');
  let y = 0;
  while (y < h) {
    const rh = Math.min(h - y, R.r(42, 70));
    let xx = R.r(-60, 0);
    while (xx < w) {
      const bw = R.r(55, 130), k = R.r(0.78, 1.12);
      const c = [base[0] * k, base[1] * k * R.r(0.97, 1.02), base[2] * k * R.r(0.95, 1.03)];
      for (const ox of [0, w]) {
        const px = xx - ox + 3, py = y + 3, pw = bw - 6, ph = rh - 6;
        x.fillStyle = rgb(...c); x.beginPath(); x.roundRect(px, py, pw, ph, 6); x.fill();
        const g = x.createLinearGradient(px, py, px + pw * 0.3, py + ph);
        g.addColorStop(0, 'rgba(255,250,235,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
        x.fillStyle = g; x.fill();
        if (hx) { hx.fillStyle = '#a8a8a8'; hx.beginPath(); hx.roundRect(px, py, pw, ph, 6); hx.fill(); hx.fillStyle = '#c4c4c4'; hx.beginPath(); hx.roundRect(px + 6, py + 6, pw - 12, ph - 12, 6); hx.fill(); }
      }
      xx += bw;
    }
    y += rh;
  }
  speckle(x, w, h, R, 900, 0.5, 2, ['rgba(0,0,0,0.25)', 'rgba(230,220,200,0.12)']);
  blobs(x, w, h, R, 26, 10, 60, 'rgba(30,44,26,1)', 0.15, 0.5);
  drips(x, w, R, 20, 0, 80, 400, [20, 26, 18], 0.3, 6);
  grain(x, w, h, R, 16);
  return s;
}
// 木牆板(院長室):room 模式,2.4m 寬
function woodPanel(R, o) {
  const s = sheet(512, 512, o.base ?? '#4a3020');
  const { x, hx, w, h } = s, m = h / H34, Y = (v) => h - v * m;
  const wood = (px, py, pw, ph, dir = 0) => {
    for (let k = 0; k < (dir ? pw : ph) / 2.2; k++) {
      x.strokeStyle = rgb(20, 10, 4, R.r(0.05, 0.2)); x.lineWidth = R.r(0.5, 1.8);
      x.beginPath();
      if (dir) { const xx = px + R() * pw; x.moveTo(xx, py); for (let yy = py; yy <= py + ph; yy += 16) x.lineTo(xx + Math.sin(yy * 0.04 + k) * 2, yy); }
      else { const yy = py + R() * ph; x.moveTo(px, yy); for (let xx = px; xx <= px + pw; xx += 16) x.lineTo(xx, yy + Math.sin(xx * 0.04 + k) * 2); }
      x.stroke();
    }
  };
  wood(0, 0, w, h, 1);
  const pw = w / 4;
  const rails = [[0, 0.16], [0.86, 1.0], [2.2, 2.34]];
  for (let i = 0; i < 4; i++) for (const [a, b] of [[0.16, 0.86], [1.0, 2.2]]) { // 凸板
    const px = i * pw + 16, py = Y(b) + 10, ww = pw - 32, hh = (b - a) * m - 20;
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px - 4, py - 4, ww + 8, hh + 8);
    x.fillStyle = shade(o.base ?? '#4a3020', R.r(1.0, 1.15)); x.fillRect(px, py, ww, hh);
    wood(px, py, ww, hh, 1);
    x.fillStyle = 'rgba(255,220,170,0.08)'; x.fillRect(px, py, ww, 3); x.fillRect(px, py, 3, hh);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px, py + hh - 3, ww, 3); x.fillRect(px + ww - 3, py, 3, hh);
    if (hx) { hx.fillStyle = '#606060'; hx.fillRect(px - 4, py - 4, ww + 8, hh + 8); hx.fillStyle = '#b0b0b0'; hx.fillRect(px, py, ww, hh); }
  }
  for (const [a, b] of rails) { x.fillStyle = shade(o.base ?? '#4a3020', 0.8); x.fillRect(0, Y(b), w, (b - a) * m); wood(0, Y(b), w, (b - a) * m, 0); x.fillStyle = 'rgba(255,220,170,0.1)'; x.fillRect(0, Y(b), w, 2); }
  x.fillStyle = o.frieze ?? '#b5a487'; x.fillRect(0, 0, w, Y(2.34)); // 上段灰泥
  mottle(x, w, Y(2.34), R, 0.15, [60, 50, 40], [250, 240, 220]);
  blobs(x, w, Y(2.34), R, 4, 30, 80, 'rgba(80,60,30,1)', 0.08, 0.25, false);
  vgrad(x, w, Y(0.5), h, 'rgba(10,6,2,0)', 'rgba(10,6,2,0.45)'); // 下緣水損
  speckle(x, w, h, R, 200, 0.5, 1.5, ['rgba(255,230,190,0.08)', 'rgba(0,0,0,0.2)']);
  grain(x, w, h, R, 10);
  return s;
}
// 兒童壁紙:motif = 'ducks' | 'stars' | 'animals'(room 模式;每 0.53m 一條接縫)
function wallpaper(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, w, h } = s, m = h / H34, Y = (v) => h - v * m;
  const step = 64;
  for (let j = 0; j < h / step + 1; j++) for (let i = 0; i < w / step; i++) {
    const cx = i * step + (j % 2) * step / 2 + 8, cy = j * step + 10;
    x.save(); x.translate(cx, cy); x.rotate(R.r(-0.08, 0.08));
    if (o.motif === 'ducks') {
      x.fillStyle = '#e8c860'; x.beginPath(); x.ellipse(0, 6, 11, 7, 0, 0, 6.28); x.fill();
      x.beginPath(); x.arc(9, -2, 5.5, 0, 6.28); x.fill();
      x.fillStyle = '#d88a40'; x.beginPath(); x.moveTo(14, -2); x.lineTo(19, 0); x.lineTo(14, 1); x.fill();
      x.fillStyle = '#2a2a2a'; x.fillRect(10, -4, 1.6, 1.6);
      if ((i + j) % 3 === 0) { x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.ellipse(28, 30, 12, 6, 0, 0, 6.28); x.ellipse(20, 31, 8, 5, 0, 0, 6.28); x.fill(); }
    } else if (o.motif === 'stars') {
      x.fillStyle = (i + j) % 4 === 0 ? '#e8d27a' : '#cdbf7a';
      if ((i + j) % 5 === 0) { x.beginPath(); x.arc(0, 0, 10, 0.6, 5.6); x.arc(4, -2, 8, 5.6, 0.6, true); x.fill(); } // 月亮
      else { x.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28 - 1.57, r = k % 2 ? 3 : 7.5; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.fill(); }
      x.fillStyle = 'rgba(255,255,230,0.5)'; x.fillRect(22, 26, 2, 2);
    } else {
      const k = (i * 7 + j * 3) % 3;
      x.fillStyle = ['#d98c8c', '#8cb4d9', '#e0c070'][k];
      if (k === 0) { x.beginPath(); x.ellipse(0, 0, 8, 10, 0, 0, 6.28); x.fill(); x.strokeStyle = 'rgba(80,80,80,0.6)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0, 10); x.quadraticCurveTo(4, 20, -2, 30); x.stroke(); } // 氣球
      else { x.beginPath(); x.ellipse(0, 4, 9, 7, 0, 0, 6.28); x.arc(-5, -4, 3.5, 0, 6.28); x.arc(5, -4, 3.5, 0, 6.28); x.fill(); x.fillStyle = '#3a3030'; x.fillRect(-3, 2, 1.5, 1.5); x.fillRect(2, 2, 1.5, 1.5); } // 小熊
    }
    x.restore();
  }
  // 歲月:泛黃、褪色、潮痕、接縫翹起
  x.fillStyle = 'rgba(150,120,60,0.18)'; x.globalCompositeOperation = 'multiply'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
  mottle(x, w, h, R, 0.14, [60, 50, 30], [255, 245, 220]);
  for (let i = 0; i < 4; i++) { // 4 卷(2.12m)
    const px = (i * w) / 4;
    x.fillStyle = 'rgba(40,30,20,0.35)'; x.fillRect(px, 0, 1.5, h);
    if (R() < 0.6) { // 翹起的條
      const y0 = Y(R.r(1.6, 3.3)), len = R.r(40, 160), side = R() < 0.5 ? 1 : -1;
      x.fillStyle = '#d8d2c0'; x.beginPath(); x.moveTo(px, y0); x.lineTo(px + side * R.r(14, 34), y0 + len * 0.5); x.lineTo(px, y0 + len); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px + side * 2, y0, 2, len);
    }
  }
  for (let i = 0; i < 3; i++) { const cx = R() * w, rx = R.r(40, 90); wrap(w, h, cx, 40, rx, (px) => tideMark(x, px, R.r(10, 80), rx, rx * 2, R, [110, 84, 40]), false); }
  drips(x, w, R, 14, 0, 60, 260, [70, 50, 26], 0.25);
  blobs(x, w, h, R, 14, 8, 30, 'rgba(30,36,24,1)', 0.2, 0.5, false, Y(0.6), h);
  vgrad(x, w, Y(0.35), h, 'rgba(20,14,8,0)', 'rgba(20,14,8,0.5)');
  grain(x, w, h, R, 12);
  return s;
}
// 軟包牆(菱格縫釘),1.2m 見方
function padded(R, o) {
  const s = sheet(512, 512, o.base ?? '#cfc6ae');
  const { x, hx, w, h } = s;
  const n = 4, cw = w / n;
  for (let j = 0; j <= n * 2; j++) for (let i = 0; i <= n; i++) { // 菱格枕面
    const cx = i * cw + (j % 2) * cw / 2, cy = (j * cw) / 2;
    const g = x.createRadialGradient(cx - 6, cy - 8, 4, cx, cy, cw * 0.62);
    g.addColorStop(0, 'rgba(255,252,236,0.22)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,30,16,0.22)');
    x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - cw / 2); x.lineTo(cx + cw / 2, cy); x.lineTo(cx, cy + cw / 2); x.lineTo(cx - cw / 2, cy); x.fill();
    if (hx) { const gh = hx.createRadialGradient(cx, cy, 2, cx, cy, cw * 0.55); gh.addColorStop(0, '#d0d0d0'); gh.addColorStop(1, '#505050'); hx.fillStyle = gh; hx.beginPath(); hx.moveTo(cx, cy - cw / 2); hx.lineTo(cx + cw / 2, cy); hx.lineTo(cx, cy + cw / 2); hx.lineTo(cx - cw / 2, cy); hx.fill(); }
  }
  x.strokeStyle = 'rgba(60,48,30,0.45)'; x.lineWidth = 1.5;
  for (let k = -n; k <= n * 2; k++) { x.beginPath(); x.moveTo(k * cw, 0); x.lineTo(k * cw + h, h); x.stroke(); x.beginPath(); x.moveTo(k * cw, 0); x.lineTo(k * cw - h, h); x.stroke(); }
  for (let j = 0; j <= n * 2; j++) for (let i = 0; i <= n; i++) { // 釘扣
    const cx = i * cw + ((j + 1) % 2) * cw / 2, cy = (j * cw) / 2;
    x.fillStyle = 'rgba(70,58,40,0.7)'; x.beginPath(); x.arc(cx, cy, 4, 0, 6.28); x.fill();
    if (hx) { hx.fillStyle = '#202020'; hx.beginPath(); hx.arc(cx, cy, 5, 0, 6.28); hx.fill(); }
  }
  for (let i = 0; i < 2600; i++) { x.fillStyle = R() < 0.5 ? 'rgba(255,255,240,0.05)' : 'rgba(0,0,0,0.05)'; x.fillRect(R() * w, R() * h, 2, 1); } // 帆布紋
  blobs(x, w, h, R, 16, 14, 70, 'rgba(120,96,40,1)', 0.08, 0.3);
  blobs(x, w, h, R, 4, 8, 30, 'rgba(70,20,14,1)', 0.15, 0.4);
  for (let i = 0; i < 2; i++) { const cx = R() * w, cy = R() * h; x.fillStyle = '#e8e0b8'; jagged(x, cx, cy, R.r(8, 18), R, 9, 0.5); x.fill(); x.strokeStyle = 'rgba(40,30,20,0.6)'; x.stroke(); } // 破口露出泡棉
  grain(x, w, h, R, 10);
  return s;
}
// 外牆粉刷:room 模式,一層 4.2m;頂部 0.8m 為樓板外露的水平帶
function facade(R, o) {
  const s = sheet(512, 512, o.base ?? '#8c877b');
  const { x, hx, w, h } = s, m = h / 4.2, Y = (v) => h - v * m;
  mottle(x, w, h, R, 0.22, [40, 38, 32], [240, 236, 222]);
  x.fillStyle = o.band ?? '#6f6b62'; x.fillRect(0, 0, w, Y(3.42)); // 樓板帶
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, Y(3.42) - 1, w, 4);
  if (hx) { hx.fillStyle = '#a0a0a0'; hx.fillRect(0, 0, w, Y(3.42)); hx.fillStyle = '#404040'; hx.fillRect(0, Y(3.42) - 1, w, 4); }
  drips(x, w, R, 60, Y(3.42), 80, 420, [30, 28, 22], 0.35, 7); // 雨水垂痕
  peel(s, R, 5, 10, 40, '#6d4434', Y(3.3), Y(0.2)); // 粉刷剝落露出紅磚
  blobs(x, w, h, R, 14, 30, 100, 'rgba(40,40,28,1)', 0.06, 0.2);
  for (let i = 0; i < 3; i++) crack(s, R, R() * w, Y(R.r(0.5, 3.3)), R.r(80, 220), R.r(1.2, 1.9), 1.5);
  vgrad(x, w, Y(0.6), h, 'rgba(14,12,8,0)', 'rgba(14,12,8,0.4)');
  grain(x, w, h, R, 14);
  return s;
}

// ======================================================================
// 地板
// ======================================================================
function vct(R, o) { // 乙烯塑膠地磚 30cm,12×12 = 3.6m
  const s = sheet(512, 512, '#2a2620');
  const { x, hx, w, h } = s;
  const cols = 12, tw = w / cols;
  const pal = o.colors.map(hexToRgb);
  for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) {
    const px = i * tw, py = j * tw;
    if (R() < (o.missing ?? 0.025)) { x.fillStyle = '#1c1a16'; x.fillRect(px, py, tw, tw); for (let k = 0; k < 8; k++) { x.strokeStyle = 'rgba(70,60,40,0.4)'; x.beginPath(); x.moveTo(px + R() * tw, py); x.quadraticCurveTo(px + R() * tw, py + tw / 2, px + R() * tw, py + tw); x.stroke(); } if (hx) { hx.fillStyle = '#5a5a5a'; hx.fillRect(px, py, tw, tw); } continue; }
    const c = o.checker ? pal[(i + j) % pal.length] : pal[(R() * pal.length) | 0], k = R.r(0.94, 1.05);
    x.fillStyle = rgb(c[0] * k, c[1] * k, c[2] * k);
    x.fillRect(px + 0.8, py + 0.8, tw - 1.6, tw - 1.6);
    for (let q = 0; q < 10; q++) { // 一個方向的大理石紋
      x.strokeStyle = rgb(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, R.r(0.1, 0.3)); x.lineWidth = R.r(0.5, 2);
      const yy = py + R() * tw, dir = (i + j) % 2;
      x.beginPath();
      if (dir) { x.moveTo(px + R() * tw, py); x.lineTo(px + R() * tw, py + tw); } else { x.moveTo(px, yy); x.lineTo(px + tw, yy + R.r(-6, 6)); }
      x.stroke();
    }
    if (hx) { hx.fillStyle = '#909090'; hx.fillRect(px + 0.8, py + 0.8, tw - 1.6, tw - 1.6); }
    if (R() < 0.04) crack(s, R, px + R() * tw, py + R() * tw, tw * 0.8, R() * 6.28, 0.8, 'rgba(20,18,14,0.6)', 0);
  }
  for (let i = 0; i < 90; i++) { const px = R() * w, py = R() * h, l = R.r(4, 18); x.strokeStyle = rgb(10, 10, 10, R.r(0.15, 0.45)); x.lineWidth = R.r(1, 2.5); x.beginPath(); x.moveTo(px, py); x.lineTo(px + l * R.r(-1, 1), py + l * R.r(-0.3, 0.3)); x.stroke(); } // 鞋跟痕
  blobs(x, w, h, R, 30, 20, 100, 'rgba(50,40,24,1)', 0.05, 0.2);
  grain(x, w, h, R, 10);
  return s;
}
function linoleum(R, o) { // 大理石紋塑膠布,4m 見方
  const s = sheet(512, 512, o.base);
  const { x, hx, w, h } = s;
  const c = hexToRgb(o.base);
  noise(x, w, h, R, 48, 0.22, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75], [Math.min(255, c[0] * 1.2), Math.min(255, c[1] * 1.2), Math.min(255, c[2] * 1.2)], 6);
  noise(x, w, h, R, 90, 0.16, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], [Math.min(255, c[0] * 1.15), Math.min(255, c[1] * 1.15), Math.min(255, c[2] * 1.15)], 12);
  speckle(x, w, h, R, 1800, 0.5, 1.4, o.speck ?? ['rgba(255,255,255,0.25)', 'rgba(0,0,0,0.25)']);
  x.fillStyle = 'rgba(20,18,14,0.5)'; x.fillRect(0, h / 2 - 0.8, w, 1.6); x.fillRect(0, 0, w, 1.2); // 接縫
  if (hx) { hx.fillStyle = '#5a5a5a'; hx.fillRect(0, h / 2 - 1, w, 2); }
  for (let i = 0; i < 120; i++) { const px = R() * w, py = R() * h, l = R.r(4, 22); x.strokeStyle = rgb(10, 10, 10, R.r(0.12, 0.4)); x.lineWidth = R.r(1, 3); x.beginPath(); x.moveTo(px, py); x.lineTo(px + l * R.r(-1, 1), py + l * R.r(-0.4, 0.4)); x.stroke(); }
  blobs(x, w, h, R, 22, 30, 120, 'rgba(40,34,22,1)', 0.05, 0.22);
  for (let i = 0; i < 3; i++) { const px = R() * w, py = R() * h; wrap(w, h, px, py, 60, (qx, qy) => { x.fillStyle = 'rgba(120,110,90,0.25)'; jagged(x, qx, qy, R.r(14, 40), R, 10); x.fill(); }); } // 磨損露出底材
  grain(x, w, h, R, 8);
  return s;
}
function terrazzo(R, o) { // 水磨石 + 銅條分隔(1.2m),2.4m 見方
  const s = sheet(512, 512, o.base ?? '#a49c8c');
  const { x, hx, w, h } = s;
  mottle(x, w, h, R, 0.12, [80, 76, 66], [240, 236, 226]);
  speckle(x, w, h, R, 5200, 0.8, 3.4, ['#e8e2d4', '#3c3a36', '#7a6f62', '#b8a68e', '#5e6a64', '#8a4a3a', '#d0c8b4']);
  speckle(x, w, h, R, 300, 3, 6, ['#ece6d8', '#2e2c2a', '#9a8f7e']);
  for (const p of [0, w / 2]) { // 銅條
    for (const [a, b, c, d] of [[p - 1.5, 0, 3, h], [0, p - 1.5, w, 3]]) { x.fillStyle = '#9a7a3c'; x.fillRect(a, b, c, d); x.fillStyle = 'rgba(255,230,150,0.35)'; x.fillRect(a, b, Math.min(c, 1.2), Math.min(d, 1.2)); if (hx) { hx.fillStyle = '#c0c0c0'; hx.fillRect(a, b, c, d); } }
  }
  blobs(x, w, h, R, 20, 30, 120, 'rgba(50,40,26,1)', 0.04, 0.16);
  for (let i = 0; i < 2; i++) crack(s, R, R() * w, R() * h, R.r(120, 260), R() * 6.28, 1.2);
  grain(x, w, h, R, 8);
  return s;
}
function concreteFloor(R, o) { // 鏝光混凝土 + 伸縮縫,4m 見方
  const s = sheet(512, 512, o.base ?? '#77746c');
  const { x, hx, w, h } = s;
  mottle(x, w, h, R, 0.24, [40, 40, 36], [220, 218, 210]);
  for (let i = 0; i < 80; i++) { const cx = R() * w, cy = R() * h, r = R.r(30, 90), a0 = R() * 6.28; x.strokeStyle = R() < 0.5 ? 'rgba(255,255,250,0.04)' : 'rgba(0,0,0,0.05)'; x.lineWidth = R.r(6, 16); wrap(w, h, cx, cy, r, (px, py) => { x.beginPath(); x.arc(px, py, r, a0, a0 + R.r(0.6, 1.6)); x.stroke(); }); }
  speckle(x, w, h, R, 1400, 0.5, 1.6, ['rgba(0,0,0,0.22)', 'rgba(220,220,210,0.18)']);
  x.fillStyle = 'rgba(20,20,18,0.55)'; x.fillRect(w / 2 - 1, 0, 2, h); x.fillRect(0, h / 2 - 1, w, 2);
  if (hx) { hx.fillStyle = '#404040'; hx.fillRect(w / 2 - 1.5, 0, 3, h); hx.fillRect(0, h / 2 - 1.5, w, 3); }
  blobs(x, w, h, R, Math.round(10 * (o.oil ?? 1)), 20, 80, 'rgba(12,12,14,1)', 0.15, 0.45);
  blobs(x, w, h, R, 16, 30, 120, 'rgba(70,56,36,1)', 0.05, 0.2);
  for (let i = 0; i < 4; i++) crack(s, R, R() * w, R() * h, R.r(100, 260), R() * 6.28, 1.6);
  if (o.paint) { x.fillStyle = 'rgba(200,160,40,0.55)'; x.fillRect(w * 0.12, 0, 10, h); peel(s, R, 12, 3, 10, '#77746c'); }
  grain(x, w, h, R, 16);
  return s;
}
function parquet(R, o) { // 編籃式拼花木地板(禮拜堂),2m 見方
  const s = sheet(512, 512, '#2a1a10');
  const { x, hx, w, h } = s;
  const n = 6, cs = w / n, strips = 4, sw = cs / strips;
  const base = hexToRgb(o.base ?? '#6a4428');
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const vert = (i + j) % 2;
    for (let k = 0; k < strips; k++) {
      const kk = R.r(0.8, 1.12);
      x.fillStyle = rgb(base[0] * kk, base[1] * kk, base[2] * kk);
      const px = vert ? i * cs + k * sw : i * cs, py = vert ? j * cs : j * cs + k * sw, pw = vert ? sw : cs, ph = vert ? cs : sw;
      x.fillRect(px + 0.8, py + 0.8, pw - 1.6, ph - 1.6);
      for (let q = 0; q < 4; q++) { x.strokeStyle = rgb(20, 10, 4, R.r(0.08, 0.2)); x.lineWidth = 0.8; x.beginPath(); if (vert) { const xx = px + R() * pw; x.moveTo(xx, py); x.lineTo(xx + R.r(-2, 2), py + ph); } else { const yy = py + R() * ph; x.moveTo(px, yy); x.lineTo(px + pw, yy + R.r(-2, 2)); } x.stroke(); }
      if (hx) { hx.fillStyle = '#a0a0a0'; hx.fillRect(px + 0.8, py + 0.8, pw - 1.6, ph - 1.6); }
    }
  }
  blobs(x, w, h, R, 18, 30, 110, 'rgba(200,170,120,1)', 0.04, 0.12); // 磨白的走道
  blobs(x, w, h, R, 14, 20, 80, 'rgba(10,6,2,1)', 0.08, 0.25);
  grain(x, w, h, R, 10);
  return s;
}
function planks(R, o) { // 長條木地板,4m 見方
  const s = sheet(512, 512, '#1e140c');
  const { x, hx, w, h } = s;
  const n = 28, pw = h / n;
  const base = hexToRgb(o.base ?? '#7a5636');
  for (let j = 0; j < n; j++) {
    let xx = -R() * 200;
    while (xx < w) {
      const len = R.r(140, 340), kk = R.r(0.82, 1.12);
      x.fillStyle = rgb(base[0] * kk, base[1] * kk, base[2] * kk);
      for (const ox of [0, -w]) {
        const px = xx + ox;
        x.fillRect(px + 1, j * pw + 0.8, len - 2, pw - 1.6);
        for (let q = 0; q < 5; q++) { x.strokeStyle = rgb(30, 16, 6, R.r(0.06, 0.2)); x.lineWidth = R.r(0.5, 1.4); const yy = j * pw + R() * pw; x.beginPath(); x.moveTo(px, yy); for (let t = 0; t <= len; t += 30) x.lineTo(px + t, yy + Math.sin(t * 0.05 + q) * 1.2); x.stroke(); }
        x.fillStyle = 'rgba(30,24,18,0.8)'; x.fillRect(px + 6, j * pw + pw / 2 - 1, 2, 2); x.fillRect(px + len - 8, j * pw + pw / 2 - 1, 2, 2);
        if (hx) { hx.fillStyle = '#a8a8a8'; hx.fillRect(px + 1, j * pw + 0.8, len - 2, pw - 1.6); }
      }
      xx += len;
    }
  }
  if (o.lines) { x.strokeStyle = 'rgba(200,170,60,0.5)'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2, h / 2, 120, 0, 6.28); x.stroke(); x.fillStyle = 'rgba(200,60,40,0.4)'; x.fillRect(0, h * 0.8, w, 5); }
  blobs(x, w, h, R, 16, 30, 120, 'rgba(10,6,2,1)', 0.08, 0.3);
  blobs(x, w, h, R, 10, 30, 90, 'rgba(210,190,150,1)', 0.04, 0.1);
  grain(x, w, h, R, 10);
  return s;
}
function carpet(R, o) {
  const s = sheet(512, 512, o.base);
  const { x, w, h } = s;
  if (o.kids) { // 兒童遊戲地墊(褪色的彩色圖樣 + 字母)
    const cols = ['#b05050', '#4f7fae', '#d2aa48', '#5b9a64', '#8a62a0'];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      x.fillStyle = cols[(i + j * 2) % cols.length]; x.globalAlpha = 0.55;
      x.fillRect(i * 128 + 6, j * 128 + 6, 116, 116); x.globalAlpha = 1;
      x.fillStyle = 'rgba(240,235,220,0.5)'; x.font = 'bold 72px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('ABCDEFGHIJKLMNOP'[j * 4 + i], i * 128 + 64, j * 128 + 68);
    }
  } else { // 辦公室方塊地毯 50cm,絨毛方向交錯
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; x.fillRect(i * 128, j * 128, 128, 128); }
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i <= 4; i++) { x.fillRect(i * 128 - 1, 0, 2, h); x.fillRect(0, i * 128 - 1, w, 2); }
  }
  for (let i = 0; i < 9000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'; x.fillRect(R() * w, R() * h, 1.5, 1.5); }
  blobs(x, w, h, R, 22, 16, 80, 'rgba(40,30,18,1)', 0.1, 0.35);
  blobs(x, w, h, R, 4, 12, 40, 'rgba(70,14,10,1)', 0.2, 0.45);
  grain(x, w, h, R, 22);
  return s;
}
function flagstone(R, o) { // 不規則石板地(潮濕),3m 見方
  const s = stoneWall(R, { base: o.base ?? '#5c584f' });
  blobs(s.x, s.w, s.h, R, 20, 20, 90, 'rgba(10,12,12,1)', 0.15, 0.4);
  return s;
}
function asphalt(R, o) { // 柏油(骨材、龜裂、補丁、油漬),6m 見方
  const s = sheet(512, 512, o.base ?? '#3a3a3a');
  const { x, hx, w, h } = s;
  mottle(x, w, h, R, 0.2, [20, 20, 20], [110, 110, 106]);
  speckle(x, w, h, R, 9000, 0.4, 1.2, ['rgba(150,148,140,0.45)', 'rgba(10,10,10,0.5)', 'rgba(90,86,80,0.4)']);
  for (let i = 0; i < 3; i++) { const px = R() * w, py = R() * h, pw = R.r(60, 160), ph = R.r(40, 120); wrap(w, h, px, py, Math.max(pw, ph), (qx, qy) => { x.fillStyle = 'rgba(18,18,18,0.75)'; x.fillRect(qx, qy, pw, ph); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2; x.strokeRect(qx, qy, pw, ph); }); } // 補丁
  for (let k = 0; k < 3; k++) { // 龜裂區
    const cx = R() * w, cy = R() * h;
    for (let i = 0; i < 14; i++) crack(s, R, cx + R.r(-50, 50), cy + R.r(-50, 50), R.r(20, 50), R() * 6.28, 1.2, 'rgba(8,8,8,0.8)', 0);
  }
  for (let i = 0; i < 4; i++) crack(s, R, R() * w, R() * h, R.r(150, 300), R() * 6.28, 2, 'rgba(8,8,8,0.85)');
  blobs(x, w, h, R, 14, 20, 70, 'rgba(6,6,8,1)', 0.2, 0.5);
  if (hx) speckle(hx, w, h, R, 4000, 0.5, 1.2, ['#a0a0a0', '#606060']);
  grain(x, w, h, R, 18);
  return s;
}
function paving(R, o) { // 人行道磚(交丁)+ 縫隙雜草,3m 見方
  const s = sheet(512, 512, '#3c3a34');
  const { x, hx, w, h } = s;
  const base = hexToRgb(o.base ?? '#8a8478');
  grid(s, 8, 16, (i, j, px, py, tw, th, T) => {
    const k = T.r(0.8, 1.08) * (T() < 0.08 ? 0.75 : 1);
    x.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k * 0.98);
    x.fillRect(px + 2, py + 2, tw - 4, th - 4);
    x.fillStyle = 'rgba(255,255,250,0.07)'; x.fillRect(px + 2, py + 2, tw - 4, 2);
    if (hx) { hx.fillStyle = '#b0b0b0'; hx.fillRect(px + 2, py + 2, tw - 4, th - 4); }
  }, 0.5, (R() * 1e6) | 0);
  speckle(x, w, h, R, 2500, 0.5, 1.3, ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.12)']);
  for (let i = 0; i < 160; i++) { const px = R() * w, py = Math.round(R() * 16) * h / 16; x.strokeStyle = rgb(60 + R() * 30, 80 + R() * 30, 30, 0.7); x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + R.r(-3, 3), py - R.r(2, 6)); x.stroke(); } // 縫中雜草
  blobs(x, w, h, R, 20, 20, 90, 'rgba(30,26,18,1)', 0.08, 0.3);
  grain(x, w, h, R, 14);
  return s;
}
function gravel(R, o) { // 碎石,2m 見方
  const s = sheet(512, 512, o.base ?? '#4e4a42');
  const { x, hx, w, h } = s;
  for (let i = 0; i < 5200; i++) {
    const cx = R() * w, cy = R() * h, r = R.r(2, 6.5), v = R.r(70, 170), a = R() * 3;
    const col = rgb(v * R.r(0.95, 1.05), v * R.r(0.93, 1.0), v * R.r(0.85, 0.98));
    wrap(w, h, cx, cy, r, (px, py) => {
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(px + 1, py + 1.5, r, r * 0.75, a, 0, 6.28); x.fill();
      x.fillStyle = col; x.beginPath(); x.ellipse(px, py, r, r * 0.75, a, 0, 6.28); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.ellipse(px - r * 0.3, py - r * 0.3, r * 0.4, r * 0.25, a, 0, 6.28); x.fill();
      if (hx) { hx.fillStyle = '#c0c0c0'; hx.beginPath(); hx.ellipse(px, py, r, r * 0.75, a, 0, 6.28); hx.fill(); }
    });
  }
  blobs(x, w, h, R, 10, 30, 90, 'rgba(30,24,16,1)', 0.1, 0.3);
  grain(x, w, h, R, 12);
  return s;
}
function grass(R, o) { // 枯草地 + 泥土,4m 見方
  const s = sheet(512, 512, o.base ?? '#3d4128');
  const { x, w, h } = s;
  mottle(x, w, h, R, 0.3, [30, 28, 14], [120, 120, 70]);
  blobs(x, w, h, R, 14, 30, 90, 'rgba(58,44,28,1)', 0.3, 0.7); // 泥土斑
  for (let i = 0; i < 14000; i++) {
    const px = R() * w, py = R() * h, l = R.r(3, 9), a = -1.57 + R.r(-0.6, 0.6);
    const t = R();
    x.strokeStyle = t < 0.4 ? rgb(70 + R() * 30, 76 + R() * 30, 34, 0.7) : t < 0.8 ? rgb(110 + R() * 30, 100 + R() * 20, 50, 0.6) : rgb(40, 50, 24, 0.8);
    x.lineWidth = R.r(0.6, 1.4);
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  speckle(x, w, h, R, 120, 2, 4, ['rgba(110,70,30,0.7)', 'rgba(140,100,40,0.6)', 'rgba(70,40,20,0.7)']); // 落葉
  grain(x, w, h, R, 14);
  return s;
}
function soil(R, o) {
  const s = sheet(512, 512, o.base ?? '#3a2e22');
  const { x, w, h } = s;
  mottle(x, w, h, R, 0.35, [20, 14, 8], [110, 90, 66]);
  speckle(x, w, h, R, 3000, 0.6, 2.2, ['rgba(0,0,0,0.3)', 'rgba(140,120,90,0.25)']);
  blobs(x, w, h, R, 10, 30, 100, 'rgba(10,10,10,1)', 0.15, 0.4);
  grain(x, w, h, R, 16);
  return s;
}
function roofGravel(R, o) {
  const s = gravel(R, { base: '#2a2826' });
  blobs(s.x, s.w, s.h, R, 16, 30, 120, 'rgba(10,10,10,1)', 0.2, 0.5);
  return s;
}
function grating(R) { // 鐵格柵(透空,alpha)
  const c = mkCanvas(256, 256), x = c.getContext('2d');
  x.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) { x.fillStyle = '#5a5c5c'; x.fillRect(i * 32, 0, 7, 256); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(i * 32, 0, 2, 256); }
  for (let j = 0; j < 4; j++) { x.fillStyle = '#4a4c4c'; x.fillRect(0, j * 64 + 28, 256, 6); }
  blobs(x, 256, 256, R, 20, 6, 30, 'rgba(110,56,24,1)', 0.3, 0.7);
  return { c, x, hc: null, hx: null, w: 256, h: 256 };
}

// ======================================================================
// 天花板
// ======================================================================
function ceilTiles(R, o) { // 礦纖天花板 3×3 片 / 2m(輕鋼架)
  const s = sheet(512, 512, o.base ?? '#a8a69c');
  const { x, hx, w, h } = s;
  const n = 3, tw = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = R.r(0.9, 1.04) * (R() < 0.15 ? 0.82 : 1);
    x.fillStyle = `rgba(${k > 1 ? 255 : 0},${k > 1 ? 255 : 0},${k > 1 ? 250 : 0},${Math.abs(1 - k) * 0.9})`;
    x.fillRect(i * tw, j * tw, tw, tw);
    if (R() < 0.3) { const g = x.createRadialGradient(i * tw + tw / 2, j * tw + tw / 2, 4, i * tw + tw / 2, j * tw + tw / 2, tw * 0.7); g.addColorStop(0, 'rgba(30,26,20,0.28)'); g.addColorStop(1, 'rgba(30,26,20,0)'); x.fillStyle = g; x.fillRect(i * tw, j * tw, tw, tw); } // 下垂
  }
  for (let i = 0; i < 2600; i++) { const px = R() * w, py = R() * h; x.strokeStyle = 'rgba(60,58,50,0.22)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + R.r(-4, 4), py + R.r(-4, 4), px + R.r(-6, 6), py + R.r(-6, 6)); x.stroke(); } // 裂紋孔
  for (let i = 0; i < Math.round(3 * (o.leak ?? 1)); i++) { const cx = R() * w, cy = R() * h, rx = R.r(30, 90); wrap(w, h, cx, cy, rx, (px, py) => tideMark(x, px, py, rx, rx * R.r(0.7, 1.2), R, [120, 86, 40])); }
  blobs(x, w, h, R, Math.round(6 * (o.leak ?? 1)), 10, 50, 'rgba(40,36,20,1)', 0.1, 0.35);
  for (let i = 0; i <= n; i++) { // T-bar
    x.fillStyle = '#c9c7bf'; x.fillRect(i * tw - 4, 0, 8, h); x.fillRect(0, i * tw - 4, w, 8);
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * tw + 4, 0, 1.5, h); x.fillRect(0, i * tw + 4, w, 1.5);
    if (hx) { hx.fillStyle = '#d0d0d0'; hx.fillRect(i * tw - 4, 0, 8, h); hx.fillRect(0, i * tw - 4, w, 8); }
  }
  blobs(x, w, h, R, 6, 4, 14, 'rgba(110,60,24,1)', 0.3, 0.6); // 鏽點
  grain(x, w, h, R, 10);
  return s;
}
function ceilConcrete(R, o) { // 模板混凝土天花(1.2×2.4 板)
  const s = sheet(512, 512, o.base ?? '#6a6862');
  const { x, hx, w, h } = s;
  mottle(x, w, h, R, 0.25, [40, 40, 36], [210, 208, 200]);
  for (let i = 0; i <= 2; i++) { x.fillStyle = 'rgba(20,20,18,0.4)'; x.fillRect(i * w / 2 - 1, 0, 2, h); if (hx) { hx.fillStyle = '#505050'; hx.fillRect(i * w / 2 - 1, 0, 2, h); } }
  x.fillStyle = 'rgba(20,20,18,0.4)'; x.fillRect(0, h / 2 - 1, w, 2);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(30,30,28,0.6)'; x.beginPath(); x.arc((i + 0.5) * w / 4, (j + 0.5) * h / 4, 4, 0, 6.28); x.fill(); }
  for (let i = 0; i < 4; i++) { const cx = R() * w, cy = R() * h, rx = R.r(30, 100); wrap(w, h, cx, cy, rx, (px, py) => tideMark(x, px, py, rx, rx, R, [100, 90, 70])); }
  speckle(x, w, h, R, 160, 1, 3, ['rgba(230,230,220,0.35)']); // 白華
  blobs(x, w, h, R, 10, 10, 50, 'rgba(20,24,16,1)', 0.15, 0.4);
  for (let i = 0; i < 3; i++) crack(s, R, R() * w, R() * h, R.r(80, 200), R() * 6.28, 1.3);
  grain(x, w, h, R, 16);
  return s;
}
function ceilWood(R, o) { // 格子木天花(院長室/禮拜堂)
  const s = sheet(512, 512, o.base ?? '#3a2618');
  const { x, hx, w, h } = s;
  const n = 2, cw = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const px = i * cw + 22, py = j * cw + 22, pw = cw - 44;
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(px, py, pw, pw);
    x.fillStyle = shade(o.base ?? '#3a2618', 1.15); x.fillRect(px + 10, py + 10, pw - 20, pw - 20);
    if (hx) { hx.fillStyle = '#505050'; hx.fillRect(px, py, pw, pw); hx.fillStyle = '#707070'; hx.fillRect(px + 10, py + 10, pw - 20, pw - 20); }
  }
  for (let i = 0; i < 300; i++) { x.strokeStyle = rgb(10, 6, 2, R.r(0.05, 0.2)); x.lineWidth = 1; const yy = R() * h; x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy + R.r(-4, 4)); x.stroke(); }
  blobs(x, w, h, R, 8, 20, 70, 'rgba(10,6,2,1)', 0.1, 0.3);
  grain(x, w, h, R, 10);
  return s;
}

// ======================================================================
// 門窗用的透明貼圖
// ======================================================================
function glassSheet(R) { // 2×2 種玻璃:髒污完整、蛛網裂、破洞、只剩碎片
  const N = 512, h = N / 2;
  const c = mkCanvas(N, N), x = c.getContext('2d');
  x.clearRect(0, 0, N, N);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * h, oy = ((k / 2) | 0) * h;
    x.save(); x.beginPath(); x.rect(ox, oy, h, h); x.clip();
    x.fillStyle = 'rgba(150,165,160,0.32)'; x.fillRect(ox, oy, h, h);
    for (let i = 0; i < 18; i++) blob(x, ox + R() * h, oy + R() * h, R.r(10, 60), 'rgba(90,86,70,1)', R.r(0.08, 0.3));
    const g = x.createLinearGradient(ox, oy, ox, oy + h); g.addColorStop(0, 'rgba(60,56,46,0)'); g.addColorStop(1, 'rgba(60,56,46,0.35)'); x.fillStyle = g; x.fillRect(ox, oy, h, h);
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = R.r(4, 14); const px = ox + R() * h; x.beginPath(); x.moveTo(px, oy); x.lineTo(px + 40, oy + h); x.stroke(); }
    const cx = ox + h * R.r(0.35, 0.65), cy = oy + h * R.r(0.35, 0.65);
    if (k === 1 || k === 2) { // 蛛網裂紋
      x.strokeStyle = 'rgba(235,240,235,0.75)'; x.lineWidth = 1.2;
      const rays = R.i(9, 14);
      for (let i = 0; i < rays; i++) { let a = (i / rays) * 6.28 + R.r(-0.2, 0.2), px = cx, py = cy; x.beginPath(); x.moveTo(px, py); for (let s2 = 0; s2 < 8; s2++) { a += R.r(-0.2, 0.2); px += Math.cos(a) * R.r(10, 22); py += Math.sin(a) * R.r(10, 22); x.lineTo(px, py); } x.stroke(); }
      for (let ring = 1; ring < 5; ring++) { x.beginPath(); for (let i = 0; i <= rays; i++) { const a = (i / rays) * 6.28, r2 = ring * R.r(12, 20); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); } x.stroke(); }
    }
    if (k === 2 || k === 3) { // 破洞:清成透明,邊緣尖角
      x.globalCompositeOperation = 'destination-out';
      x.beginPath();
      const n = 16, rad = k === 3 ? h * 0.62 : h * R.r(0.18, 0.3);
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.28, r2 = rad * (i % 2 ? R.r(0.35, 0.7) : R.r(0.9, 1.3)); x.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); }
      x.closePath(); x.fill();
      x.globalCompositeOperation = 'source-over';
    }
    x.restore();
  }
  return { c, hc: null, w: N, h: N };
}
function blindsSheet(R) { // 百葉窗(有的葉片掉了、歪了)
  const W = 256, H = 512;
  const c = mkCanvas(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  const n = 36, sh = H / n;
  for (let i = 0; i < n; i++) {
    if (R() < 0.12) continue;
    const y = i * sh, tilt = R() < 0.15 ? R.r(-10, 10) : 0, cut = R() < 0.1 ? R.r(0.3, 0.8) * W : W;
    x.save(); x.translate(0, y + sh * 0.5); x.rotate(tilt * 0.01);
    const g = x.createLinearGradient(0, -sh * 0.35, 0, sh * 0.35); g.addColorStop(0, '#d8d4c4'); g.addColorStop(1, '#8c887a');
    x.fillStyle = g; x.fillRect(0, -sh * 0.32, cut, sh * 0.64);
    x.fillStyle = 'rgba(60,50,30,0.25)'; for (let k = 0; k < 3; k++) x.fillRect(R() * W, -sh * 0.3, R.r(10, 50), sh * 0.6);
    x.restore();
  }
  x.fillStyle = '#6a6458'; x.fillRect(W * 0.2, 0, 2, H); x.fillRect(W * 0.8, 0, 2, H);
  return { c, hc: null, w: W, h: H };
}
function curtainSheet(R) { // 破爛的布簾(下緣撕裂)
  const W = 256, H = 512;
  const c = mkCanvas(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#9fb2a8'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) { const px = (i / 14) * W; const g = x.createLinearGradient(px, 0, px + W / 14, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); x.fillStyle = g; x.fillRect(px, 0, W / 14, H); }
  for (let i = 0; i < 20; i++) blob(x, R() * W, R() * H, R.r(10, 50), 'rgba(80,60,30,1)', R.r(0.1, 0.35));
  for (let i = 0; i < 4; i++) blob(x, R() * W, R.r(0.4, 1) * H, R.r(8, 24), 'rgba(80,10,8,1)', R.r(0.3, 0.6));
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.moveTo(0, H);
  for (let px = 0; px <= W; px += 8) x.lineTo(px, H * R.r(0.55, 0.98));
  x.lineTo(W, H); x.closePath(); x.fill();
  for (let i = 0; i < 6; i++) { x.beginPath(); jagged(x, R() * W, R.r(0.2, 0.8) * H, R.r(6, 22), R, 9, 1.3); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  return { c, hc: null, w: W, h: H };
}
function bushSheet(R) { // 枯灌木叢剪影(alpha):枝條 + 零星枯葉
  const W = 512, H = 256;
  const c = mkCanvas(W, H), x = c.getContext('2d');
  x.clearRect(0, 0, W, H);
  const branch = (px, py, a, len, w, d) => {
    const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
    x.strokeStyle = `rgb(${40 + R() * 20},${34 + R() * 14},${26 + R() * 10})`; x.lineWidth = w; x.lineCap = 'round';
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo((px + ex) / 2 + R.r(-8, 8), (py + ey) / 2 + R.r(-8, 8), ex, ey); x.stroke();
    if (d > 0) for (let k = 0; k < 3; k++) branch(ex, ey, a + R.r(-0.7, 0.7), len * R.r(0.55, 0.8), w * 0.68, d - 1);
    else for (let k = 0; k < 4; k++) { x.fillStyle = R() < 0.5 ? `rgba(${70 + R() * 40},${60 + R() * 30},${30 + R() * 10},0.95)` : `rgba(${44 + R() * 20},${56 + R() * 20},28,0.95)`; x.beginPath(); x.ellipse(ex + R.r(-6, 6), ey + R.r(-6, 6), R.r(2.5, 5), R.r(1.5, 3), R() * 3, 0, 6.28); x.fill(); }
  };
  for (let i = 0; i < 26; i++) branch(R() * W, H, -Math.PI / 2 + R.r(-0.7, 0.7), R.r(40, 90), R.r(2, 5), 3);
  return { c, hc: null, w: W, h: H };
}

// ======================================================================
// 鍵 → 產生器與材質參數。size = [u 公尺, v 公尺];room = true 表示 v 從地面起算(不重複)
// ======================================================================
const P = (gen, size, opt = {}) => ({ gen, size, ...opt });
export const SURF = {
  // ---- 牆(上段/整面) ----
  paint_green: P((R) => paintWall(R, { base: '#7c9682', under: '#c4c3ae', under2: '#5d6e5c' }), [4, H34], { room: 1, rough: 0.82, bump: 1.2 }),
  paint_mint: P((R) => paintWall(R, { base: '#a2bba9', under: '#d4d2c0', under2: '#7a9484', stains: 1.4, peelN: 14 }), [4, H34], { room: 1, rough: 0.8, bump: 1.2 }),
  paint_olive: P((R) => paintWall(R, { base: '#8d9470', under: '#c6c2a6', under2: '#6b6a50', stains: 2 }), [4, H34], { room: 1, rough: 0.82, bump: 1.2 }),
  paint_white: P((R) => paintWall(R, { base: '#c7c5b9', under: '#9b9787', under2: '#b9b29a', grime: 0.8 }), [4, H34], { room: 1, rough: 0.78, bump: 1.1 }),
  paint_sterile: P((R) => paintWall(R, { base: '#d3d6d2', under: '#a6a8a2', peelN: 4, stains: 0.6, streak: 0.5, mold: 0.2, grime: 0.6, soot: 0.12 }), [4, H34], { room: 1, rough: 0.6, bump: 0.8 }),
  paint_gray: P((R) => paintWall(R, { base: '#8a9094', under: '#bebdb3', under2: '#5e6468', scuff: false, stains: 1.5 }), [4, H34], { room: 1, rough: 0.8, bump: 1.2 }),
  paint_cream: P((R) => paintWall(R, { base: '#c2b394', under: '#e0d8c2', under2: '#9a8a6a' }), [4, H34], { room: 1, rough: 0.85, bump: 1.1 }),
  paint_blue: P((R) => paintWall(R, { base: '#8fa4b0', under: '#cfd0c8', under2: '#6d8290', stains: 1.2 }), [4, H34], { room: 1, rough: 0.8, bump: 1.1 }),
  paint_pink: P((R) => paintWall(R, { base: '#c2a0a0', under: '#e2d6c8', under2: '#9a7676', stains: 1.6, peelN: 16 }), [4, H34], { room: 1, rough: 0.82, bump: 1.1 }),
  dado_green: P((R) => dadoPaint(R, { base: '#3b5444', under: '#9aa58e' }), [2, 1.2], { room: 1, rough: 0.42, bump: 0.8 }),
  dado_teal: P((R) => dadoPaint(R, { base: '#2f5552', under: '#8fa59c' }), [2, 1.2], { room: 1, rough: 0.42, bump: 0.8 }),
  dado_gray: P((R) => dadoPaint(R, { base: '#5d6266', under: '#a6a8a2', chips: 6 }), [2, 1.2], { room: 1, rough: 0.5, bump: 0.6 }),
  dado_brown: P((R) => dadoPaint(R, { base: '#5a4433', under: '#a89470' }), [2, 1.2], { room: 1, rough: 0.45, bump: 0.8 }),
  dado_rose: P((R) => dadoPaint(R, { base: '#8a5a5c', under: '#d2c2b2' }), [2, 1.2], { room: 1, rough: 0.5, bump: 0.8 }),
  tile_white: P((R) => tiles(R, { cols: 8, rows: 8, color: '#d6d8d1', alt: '#c9cbc2', altP: 0.12, grout: '#57564f', missing: 0.03, rust: 0.6 }), [1.2, 1.2], { rough: 0.22, bump: 1.6 }),
  tile_green: P((R) => tiles(R, { cols: 8, rows: 8, color: '#8fb3a1', alt: '#86a998', altP: 0.2, grout: '#4b5550', missing: 0.03, blood: 0.6 }), [1.2, 1.2], { rough: 0.24, bump: 1.6 }),
  tile_subway: P((R) => tiles(R, { cols: 6, rows: 12, color: '#d9cfb2', alt: '#cfc3a2', altP: 0.25, grout: '#6a6250', offset: 0.5, missing: 0.025 }), [1.2, 1.2], { rough: 0.25, bump: 1.6 }),
  tile_blue: P((R) => tiles(R, { cols: 12, rows: 12, color: '#9fb4bd', alt: '#b7c6cb', altP: 0.3, grout: '#4c5458', missing: 0.03, rust: 1 }), [1.2, 1.2], { rough: 0.25, bump: 1.4 }),
  tile_pink: P((R) => tiles(R, { cols: 8, rows: 8, color: '#d8b8b4', alt: '#cfaaa6', altP: 0.2, grout: '#6a5654', missing: 0.02 }), [1.2, 1.2], { rough: 0.24, bump: 1.6 }),
  plaster: P((R) => plaster(R, { base: '#aea592' }), [3, 3], { rough: 0.92, bump: 1.3 }),
  plaster_chapel: P((R) => plaster(R, { base: '#b4a68c', damp: 5, cracks: 5, mold: 0.6, under: '#7d6d58' }), [3, 3], { rough: 0.95, bump: 1.5 }),
  plaster_dorm: P((R) => plaster(R, { base: '#bdb6a2', damp: 4, peelN: 10, mold: 0.4 }), [3, 3], { rough: 0.95, bump: 1.4 }),
  marble_wall: P((R) => marble(R, { base: '#b8ae9c', vein: '#6e6252', cols: 2, rows: 2 }), [2.4, 2.2], { rough: 0.25, bump: 0.6 }),
  concrete_wall: P((R) => concreteWall(R, { base: '#6e6d68' }), [2.4, 2.4], { rough: 0.95, bump: 1.6 }),
  concrete_wet_wall: P((R) => concreteWall(R, { base: '#55554f', wet: 2.5, mold: 1 }), [2.4, 2.4], { rough: 0.55, bump: 1.6 }),
  cmu_paint: P((R) => cmuWall(R, { base: '#9a968a' }), [2.4, 2.4], { rough: 0.85, bump: 1.8 }),
  cmu_red: P((R) => cmuWall(R, { base: '#8e5a50', mortar: '#6a5650' }), [2.4, 2.4], { rough: 0.85, bump: 1.8 }),
  brick: P((R) => brick(R, { soot: 0.8 }), [2, 2], { rough: 0.9, bump: 2.2 }),
  brick_old: P((R) => brick(R, { moss: 1, salt: 1.2, palette: ['#6a3a2c', '#5c3226', '#734033', '#4a2a22', '#7a4a38'] }), [2, 2], { rough: 0.92, bump: 2.2 }),
  stone_wall: P((R) => stoneWall(R, {}), [3, 3], { rough: 0.9, bump: 2.6 }),
  wood_panel: P((R) => woodPanel(R, { base: '#4a3020' }), [2.4, H34], { room: 1, rough: 0.5, bump: 1.4 }),
  wallpaper_ducks: P((R) => wallpaper(R, { base: '#d8d2b8', motif: 'ducks' }), [2.12, H34], { room: 1, rough: 0.85, bump: 0.6 }),
  wallpaper_stars: P((R) => wallpaper(R, { base: '#3a4560', motif: 'stars' }), [2.12, H34], { room: 1, rough: 0.85, bump: 0.6 }),
  wallpaper_animals: P((R) => wallpaper(R, { base: '#b7cdb8', motif: 'animals' }), [2.12, H34], { room: 1, rough: 0.85, bump: 0.6 }),
  padded: P((R) => padded(R, {}), [1.2, 1.2], { rough: 0.8, bump: 3.5 }),
  facade: P((R) => facade(R, {}), [6, 4.2], { room: 1, rough: 0.9, bump: 1.5 }),
  facade_dark: P((R) => facade(R, { base: '#77736a', band: '#5e5a52' }), [6, 4.2], { room: 1, rough: 0.9, bump: 1.5 }),
  // ---- 地板 ----
  tile_ward: P((R) => vct(R, { colors: ['#9da08f', '#7d8676'], checker: true }), [3.6, 3.6], { rough: 0.5, bump: 0.6 }),
  tile_ward_b: P((R) => vct(R, { colors: ['#a9a28c', '#a39b84', '#8e8a7a'], missing: 0.04 }), [3.6, 3.6], { rough: 0.55, bump: 0.6 }),
  tile_lobby: P((R) => tiles(R, { cols: 4, rows: 4, color: '#b3a88f', alt: '#a89d84', altP: 0.3, grout: '#5a5448', gw: 4, missing: 0.02, cracked: 0.15, dirt: 1.6 }), [2.4, 2.4], { rough: 0.3, bump: 1 }),
  terrazzo: P((R) => terrazzo(R, {}), [2.4, 2.4], { rough: 0.28, bump: 0.5 }),
  linoleum: P((R) => linoleum(R, { base: '#7c8a7d' }), [4, 4], { rough: 0.45, bump: 0.5 }),
  linoleum_b: P((R) => linoleum(R, { base: '#9a907a' }), [4, 4], { rough: 0.45, bump: 0.5 }),
  linoleum_c: P((R) => linoleum(R, { base: '#6f8090' }), [4, 4], { rough: 0.45, bump: 0.5 }),
  linoleum_d: P((R) => linoleum(R, { base: '#8a7470' }), [4, 4], { rough: 0.45, bump: 0.5 }),
  tile_white_floor: P((R) => tiles(R, { cols: 12, rows: 12, color: '#c4c6c0', alt: '#b4b6ae', altP: 0.25, grout: '#5f5c52', missing: 0.02, dirt: 1.6, blood: 1.4 }), [1.2, 1.2], { rough: 0.3, bump: 1.2 }),
  concrete: P((R) => concreteFloor(R, {}), [4, 4], { rough: 0.85, bump: 1 }),
  concrete_paint: P((R) => concreteFloor(R, { paint: 1, oil: 2 }), [4, 4], { rough: 0.8, bump: 1 }),
  concrete_wet: P((R) => concreteFloor(R, { base: '#4e4c47', oil: 0.5 }), [4, 4], { rough: 0.22, bump: 1 }),
  wood_floor: P((R) => planks(R, {}), [4, 4], { rough: 0.6, bump: 1 }),
  wood_gym: P((R) => planks(R, { base: '#8a6440', lines: 1 }), [4, 4], { rough: 0.5, bump: 1 }),
  wood_parquet: P((R) => parquet(R, {}), [2, 2], { rough: 0.55, bump: 1 }),
  wood_old: P((R) => planks(R, { base: '#5e4630' }), [4, 4], { rough: 0.75, bump: 1.2 }),
  carpet: P((R) => carpet(R, { base: '#4a5262' }), [2, 2], { rough: 1, bump: 0.8 }),
  carpet_kids: P((R) => carpet(R, { base: '#6a6458', kids: 1 }), [2, 2], { rough: 1, bump: 0.8 }),
  padded_floor: P((R) => padded(R, { base: '#bfb69c' }), [1.2, 1.2], { rough: 0.85, bump: 2.5 }),
  stone: P((R) => flagstone(R, {}), [3, 3], { rough: 0.55, bump: 2.4 }),
  asphalt: P((R) => asphalt(R, {}), [6, 6], { rough: 0.9, bump: 1 }),
  paving: P((R) => paving(R, {}), [3, 3], { rough: 0.85, bump: 1.6 }),
  gravel: P((R) => gravel(R, {}), [2, 2], { rough: 0.95, bump: 2.4 }),
  grass: P((R) => grass(R, {}), [4, 4], { rough: 0.95, bump: 0.8 }),
  soil: P((R) => soil(R, {}), [4, 4], { rough: 0.8, bump: 1 }),
  roof_gravel: P((R) => roofGravel(R), [3, 3], { rough: 0.95, bump: 2 }),
  metal_grate: P((R) => grating(R), [0.5, 0.5], { rough: 0.6, metal: 0.7, alphaTest: 0.5, side: 2 }),
  // ---- 天花板 ----
  ceil_tile: P((R) => ceilTiles(R, {}), [2, 2], { rough: 0.95, bump: 0.6 }),
  ceil_tile_b: P((R) => ceilTiles(R, { base: '#9e9888', leak: 3 }), [2, 2], { rough: 0.95, bump: 0.6 }),
  ceil_plaster: P((R) => plaster(R, { base: '#a39e90', damp: 4, cracks: 4, mold: 0.5 }), [3, 3], { rough: 0.95, bump: 1 }),
  ceil_concrete: P((R) => ceilConcrete(R, {}), [2.4, 2.4], { rough: 0.95, bump: 1 }),
  ceil_wood: P((R) => ceilWood(R, {}), [1.2, 1.2], { rough: 0.6, bump: 1.5 }),
  vault_stone: P((R) => stoneWall(R, { base: '#5a554c' }), [3, 3], { rough: 0.9, bump: 2.4 }),
  // ---- 透明/鏤空 ----
  glass: P((R) => glassSheet(R), [1, 1], { rough: 0.12, transparent: 1, side: 2, env: 2, ph: '#8a9690' }),
  blinds: P((R) => blindsSheet(R), [1, 1], { rough: 0.7, alphaTest: 0.5, side: 2, ph: '#b0aca0' }),
  curtain: P((R) => curtainSheet(R), [1, 1], { rough: 0.95, alphaTest: 0.5, side: 2, ph: '#9fb2a8' }),
  bush: P((R) => bushSheet(R), [1, 1], { rough: 1, alphaTest: 0.4, side: 2, ph: '#3a3426' }),
};
// 純色收邊材質(踢腳板、腰線、扶手、門框…)
export const TRIM = {
  trim_rubber: [0x262624, 0.7], trim_black: [0x161616, 0.5], trim_wood: [0x4a3322, 0.55], trim_wood_light: [0x7a5a3c, 0.6],
  trim_steel: [0x8c9094, 0.4, 0.8], trim_alu: [0xa4a8ac, 0.35, 0.85], trim_white: [0xc4c2b8, 0.6], trim_cream: [0xb8ae94, 0.65],
  trim_green: [0x40584a, 0.5, 0.2], trim_gray: [0x5a5e60, 0.55, 0.3], trim_stone: [0x8a8478, 0.75], trim_brass: [0x8a6a30, 0.35, 0.9],
  trim_red: [0x7a2620, 0.55], trim_yellow: [0xb8902a, 0.6], trim_concrete: [0x77756e, 0.95], trim_rust: [0x5a3420, 0.85, 0.4],
  trim_dark: [0x1c1d1e, 0.7, 0.3], trim_plenum: [0x0c0c0c, 1], trim_marble: [0xbab2a2, 0.25],
  glass_dark: [0x1a2224, 0.12, 0.3], trim_soot: [0x0e0d0c, 1],
};

// 依鍵產生畫布(主執行緒同步備援與 Worker 都呼叫這裡)
export function paintSurface(key) {
  const def = SURF[key];
  return def.gen(prng(hashStr(key) ^ 0x9e3779b9));
}
