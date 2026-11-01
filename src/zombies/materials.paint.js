// 殭屍材質的程式貼圖產生器(在貼圖 Worker 用 OffscreenCanvas 畫;不支援時主執行緒用 <canvas> 畫同一份程式)。
// 規則見 src/sys/texworker.js:不可碰 DOM;make(w, h, { read }) 取得 [canvas, ctx];回傳 canvas 或 { 名稱: canvas }。
// 這裡的貼圖只負責可平鋪的微細節:毛孔、皺紋、血管、布料織紋、髮絲;顏色細節畫在頂點色上(model.js)。

// 與 anatomy.js 的 rng 相同演算法(同種子 → 同一張貼圖),複製一份免得把 three.js 拉進貼圖 Worker
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 在 3x3 位移上重畫,讓圖案可無縫平鋪
function wrap(ctx, W, H, fn) {
  for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); }
}

// 皮膚:毛孔、皺紋、分岔血管(色彩圖 + 凹凸圖共用同一組路徑)
export function skin(make) {
  const S = 512, r = rng(42);
  const [c, x] = make(S, S, { read: true });
  const [cb, xb] = make(S, S, { read: true });
  x.fillStyle = '#e6dfd8';
  x.fillRect(0, 0, S, S);
  xb.fillStyle = '#808080';
  xb.fillRect(0, 0, S, S);
  // 大片斑駁
  for (let i = 0; i < 220; i++) {
    const px = r() * S, py = r() * S, rad = 10 + r() * 60, a = 0.03 + r() * 0.07;
    wrap(x, S, S, () => {
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(120,105,100,${a})`);
      g.addColorStop(1, 'rgba(120,105,100,0)');
      x.fillStyle = g;
      x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  // 血管:隨機分岔
  const veins = [];
  const branch = (px, py, ang, len, w, depth) => {
    const pts = [[px, py]];
    for (let k = 0; k < len; k++) {
      ang += (r() - 0.5) * 0.7;
      px += Math.cos(ang) * 5;
      py += Math.sin(ang) * 5;
      pts.push([px, py]);
      if (depth < 3 && r() < 0.07) branch(px, py, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.5, w * 0.6, depth + 1);
    }
    veins.push({ pts, w });
  };
  for (let i = 0; i < 9; i++) branch(r() * S, r() * S, r() * Math.PI * 2, 30 + r() * 40, 1.6 + r() * 1.6, 0);
  for (const v of veins) {
    wrap(x, S, S, () => {
      x.strokeStyle = `rgba(70,45,85,${0.18 + v.w * 0.08})`;
      x.lineWidth = v.w;
      x.lineCap = 'round';
      x.beginPath();
      v.pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b)));
      x.stroke();
    });
    wrap(xb, S, S, () => {
      xb.strokeStyle = 'rgba(200,200,200,0.55)';
      xb.lineWidth = v.w * 1.4;
      xb.lineCap = 'round';
      xb.beginPath();
      v.pts.forEach(([a, b], k) => (k ? xb.lineTo(a, b) : xb.moveTo(a, b)));
      xb.stroke();
    });
  }
  // 皺紋
  for (let i = 0; i < 260; i++) {
    const px = r() * S, py = r() * S, l = 6 + r() * 18, ang = r() * Math.PI;
    const ex = px + Math.cos(ang) * l, ey = py + Math.sin(ang) * l;
    const mx = (px + ex) / 2 + (r() - 0.5) * 6, my = (py + ey) / 2 + (r() - 0.5) * 6;
    wrap(x, S, S, () => { x.strokeStyle = 'rgba(70,55,50,0.12)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(mx, my, ex, ey); x.stroke(); });
    wrap(xb, S, S, () => { xb.strokeStyle = 'rgba(40,40,40,0.5)'; xb.lineWidth = 1; xb.beginPath(); xb.moveTo(px, py); xb.quadraticCurveTo(mx, my, ex, ey); xb.stroke(); });
  }
  // 毛孔與顆粒
  const img = x.getImageData(0, 0, S, S), d = img.data;
  const imb = xb.getImageData(0, 0, S, S), db = imb.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    db[i] += n * 1.5; db[i + 1] = db[i]; db[i + 2] = db[i];
    if (r() < 0.012) { d[i] -= 40; d[i + 1] -= 45; d[i + 2] -= 40; db[i] = db[i + 1] = db[i + 2] = 40; }
  }
  x.putImageData(img, 0, 0);
  xb.putImageData(imb, 0, 0);
  return { map: c, bump: cb };
}

// 布料:織紋 + 纖維雜訊(alphaMap 用來讓破口邊緣毛躁)
export function cloth(make) {
  const S = 256, r = rng(77);
  const [c, x] = make(S, S);
  x.fillStyle = '#e8e8e8';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`;
    x.fillRect(0, i, S, 1);
    x.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.04})`;
    x.fillRect(i, 0, 1, S);
  }
  for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; x.fillRect(r() * S, r() * S, 1 + r() * 3, 1); }
  const [ca, xa] = make(S, S);
  const img = xa.createImageData(S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 150 + r() * 105; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  xa.putImageData(img, 0, 0);
  xa.globalAlpha = 0.5;
  for (let i = 0; i < 900; i++) { // 纖維
    const px = r() * S, py = r() * S, a = r() * Math.PI;
    wrap(xa, S, S, () => { xa.strokeStyle = r() < 0.5 ? '#ffffff' : '#7a7a7a'; xa.lineWidth = 1; xa.beginPath(); xa.moveTo(px, py); xa.lineTo(px + Math.cos(a) * 9, py + Math.sin(a) * 9); xa.stroke(); });
  }
  return { map: c, alpha: ca };
}

export function hair(make) {
  const S = 256, r = rng(5);
  const [c, x] = make(S, S);
  x.clearRect(0, 0, S, S);
  for (let i = 0; i < 2200; i++) {
    const px = r() * S, py = r() * S, l = 30 + r() * 140, sway = (r() - 0.5) * 14;
    const a = 0.25 + r() * 0.7, sh = 150 + r() * 105;
    wrap(x, S, S, () => {
      x.strokeStyle = `rgba(${sh},${sh},${sh},${a})`;
      x.lineWidth = 0.6 + r() * 1.2;
      x.beginPath();
      x.moveTo(px, py);
      x.quadraticCurveTo(px + sway, py + l / 2, px + sway * 0.3, py + l);
      x.stroke();
    });
  }
  return c;
}

// 眼球:混濁泛黃的鞏膜 + 血絲 + 虹膜(u=0.25 朝前);自發光貼圖只亮虹膜。
// args = { iris, glow, cloud }:cloud = 白內障程度 0..1(0 = 漆黑放大的瞳孔,夜行動物般)
export function eye(make, { iris, glow, cloud = 0.5 }) {
  const W = 128, H = 64, r = rng(11);
  const [c, x] = make(W, H);
  x.fillStyle = '#a89e80';
  x.fillRect(0, 0, W, H);
  // 鞏膜:泛黃、邊緣充血
  const sg = x.createRadialGradient(32, 32, 6, 32, 32, 34);
  sg.addColorStop(0, 'rgba(225,218,196,0.9)');
  sg.addColorStop(0.6, 'rgba(200,180,150,0.4)');
  sg.addColorStop(1, 'rgba(150,60,50,0.55)');
  x.fillStyle = sg;
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 70; i++) {
    let px = r() < 0.5 ? r() * 14 + 50 : r() * 14, py = r() * H;
    x.strokeStyle = `rgba(150,20,20,${0.3 + r() * 0.5})`;
    x.lineWidth = 0.5 + r() * 0.8;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (32 - px) * 0.12 + (r() - 0.5) * 4; py += (32 - py) * 0.1 + (r() - 0.5) * 4; x.lineTo(px, py); }
    x.stroke();
  }
  const IR = cloud <= 0.01 ? 15 : 11;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, IR);
  g.addColorStop(0, glow ? '#fff4c0' : '#0a0a0a');
  g.addColorStop(cloud <= 0.01 ? 0.7 : 0.22, glow ? iris : '#141210');
  g.addColorStop(cloud <= 0.01 ? 0.8 : 0.3, iris);
  g.addColorStop(0.85, iris);
  g.addColorStop(1, 'rgba(90,80,60,0.25)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, IR, 0, Math.PI * 2);
  x.fill();
  // 虹膜紋理(放射狀細紋)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + r() * 0.1;
    x.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`;
    x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(32 + Math.cos(a) * 3.5, 32 + Math.sin(a) * 3.5); x.lineTo(32 + Math.cos(a) * IR * 0.95, 32 + Math.sin(a) * IR * 0.95); x.stroke();
  }
  if (cloud > 0) { // 白內障:不規則的乳白霧,中心最濃
    const cg = x.createRadialGradient(31, 31, 0, 32, 32, 12);
    cg.addColorStop(0, `rgba(196,194,182,${Math.min(0.9, 0.15 + cloud * 0.75)})`);
    cg.addColorStop(0.7, `rgba(180,176,160,${cloud * 0.4})`);
    cg.addColorStop(1, 'rgba(225,222,205,0)');
    x.fillStyle = cg;
    x.beginPath(); x.arc(32, 32, 12, 0, Math.PI * 2); x.fill();
  }
  const [ce, xe] = make(W, H);
  xe.fillStyle = '#000';
  xe.fillRect(0, 0, W, H);
  const ge = xe.createRadialGradient(32, 32, 0, 32, 32, 9);
  ge.addColorStop(0, glow ? '#ffffff' : '#555555');
  ge.addColorStop(0.6, glow ? '#c0c0c0' : '#303030');
  ge.addColorStop(1, '#000000');
  xe.fillStyle = ge;
  xe.fillRect(0, 0, W, H);
  return { map: c, glow: ce };
}
