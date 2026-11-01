// 地上的錢:鈔票與銅板的貼圖(貼圖 Worker 畫)。風格化的設計(不是真鈔的複製品):底色、細紋、圓框肖像剪影、面額、
// 流水號、浮水印區;舊、褪色、摺痕、髒污。圖集 1024×512:
//   (0,0) 百元(紅)   (512,0) 五百(褐)
//   (0,256) 千元(藍)  (512,256) 左:十元銅板面(白銅) 中:五十元(黃銅) 右上:幣緣滾花
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';
const SERIF = '"DFKai-SB", "BiauKai", "KaiTi", "PMingLiU", serif';

function bill(x, X, Y, W, H, o, rnd) {
  x.save();
  x.beginPath(); x.rect(X, Y, W, H); x.clip();
  x.translate(X, Y);
  // 底色(紙):中間亮、四周暗一點
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, o.c0); g.addColorStop(0.5, o.c1); g.addColorStop(1, o.c0);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 細紋(扭索紋):多條相位不同的正弦線
  x.lineWidth = 0.7;
  for (let k = 0; k < 46; k++) {
    x.strokeStyle = `rgba(${o.ink},${0.12 + (k % 3) * 0.05})`;
    x.beginPath();
    for (let i = 0; i <= W; i += 4) {
      const y = H * 0.5 + Math.sin(i * 0.035 + k * 0.42) * H * 0.32 * Math.sin(k * 0.2 + 0.5) + Math.sin(i * 0.11 + k) * 3;
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
  }
  // 邊框與花邊
  x.strokeStyle = `rgba(${o.ink},0.75)`; x.lineWidth = 3; x.strokeRect(8, 8, W - 16, H - 16);
  x.lineWidth = 1; x.strokeRect(14, 14, W - 28, H - 28);
  for (let i = 18; i < W - 18; i += 7) { x.fillStyle = `rgba(${o.ink},0.35)`; x.fillRect(i, 10, 3, 2); x.fillRect(i, H - 12, 3, 2); }
  // 肖像(圓框 + 剪影,線條陰影)
  const px = W * 0.3, py = H * 0.5, pr = H * 0.32;
  x.fillStyle = `rgba(${o.ink},0.18)`; x.beginPath(); x.ellipse(px, py, pr * 0.82, pr, 0, 0, 6.283); x.fill();
  x.strokeStyle = `rgba(${o.ink},0.7)`; x.lineWidth = 2; x.beginPath(); x.ellipse(px, py, pr * 0.82, pr, 0, 0, 6.283); x.stroke();
  x.save(); x.beginPath(); x.ellipse(px, py, pr * 0.8, pr * 0.98, 0, 0, 6.283); x.clip();
  x.fillStyle = `rgba(${o.ink},0.55)`;
  x.beginPath(); x.ellipse(px, py - pr * 0.18, pr * 0.32, pr * 0.4, 0, 0, 6.283); x.fill(); // 頭
  x.beginPath(); x.ellipse(px, py + pr * 0.85, pr * 0.75, pr * 0.55, 0, 0, 6.283); x.fill(); // 肩
  for (let i = -pr; i < pr; i += 3) { x.strokeStyle = `rgba(${o.ink},0.25)`; x.lineWidth = 0.8; x.beginPath(); x.moveTo(px - pr, py + i); x.lineTo(px + pr, py + i + pr * 0.3); x.stroke(); }
  x.restore();
  // 浮水印區(右側:淡、沒有花紋)
  const wx = W * 0.8;
  const wg = x.createRadialGradient(wx, H * 0.5, 0, wx, H * 0.5, H * 0.33);
  wg.addColorStop(0, 'rgba(250,246,232,0.55)'); wg.addColorStop(1, 'rgba(250,246,232,0)');
  x.fillStyle = wg; x.fillRect(wx - H * 0.4, 0, H * 0.8, H);
  // 面額與文字
  x.fillStyle = `rgba(${o.ink},0.9)`; x.textBaseline = 'middle'; x.textAlign = 'center';
  x.font = `700 ${Math.round(H * 0.2)}px ${SERIF}`; x.fillText(o.han, W * 0.6, H * 0.36);
  x.font = `700 ${Math.round(H * 0.11)}px ${FONT}`; x.fillText('中 華 民 國', W * 0.6, H * 0.15);
  x.font = `800 ${Math.round(H * 0.17)}px Georgia, "Times New Roman", serif`;
  x.textAlign = 'left'; x.fillText(o.n, 24, H * 0.2); x.textAlign = 'right'; x.fillText(o.n, W - 22, H * 0.82);
  x.font = `700 ${Math.round(H * 0.09)}px "Courier New", monospace`; x.fillStyle = 'rgba(150,30,20,0.85)';
  x.textAlign = 'left'; x.fillText(o.serial, W * 0.48, H * 0.62);
  x.fillStyle = `rgba(${o.ink},0.5)`; x.font = `${Math.round(H * 0.06)}px ${FONT}`; x.fillText('中央印製  ' + o.year, W * 0.48, H * 0.76);
  // 舊化:泛黃、髒污、摺痕(中間對摺一道、另外幾道淺的)、邊緣磨損
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * W, cy = rnd() * H, r = 10 + rnd() * 50;
    const sg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    sg.addColorStop(0, `rgba(${rnd() < 0.6 ? '110,90,50' : '60,50,40'},${0.06 + rnd() * 0.12})`); sg.addColorStop(1, 'rgba(110,90,50,0)');
    x.fillStyle = sg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const fold = (x0, y0, x1, y1, a) => {
    x.strokeStyle = `rgba(40,30,20,${a})`; x.lineWidth = 2.2; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    x.strokeStyle = `rgba(255,250,235,${a * 0.8})`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(x0 + 2, y0); x.lineTo(x1 + 2, y1); x.stroke();
  };
  fold(W / 2, 0, W / 2 + rnd() * 4 - 2, H, 0.45);
  fold(W * 0.25 + rnd() * 10, 0, W * 0.25 + rnd() * 20, H, 0.12);
  fold(0, H * (0.4 + rnd() * 0.2), W, H * (0.4 + rnd() * 0.2), 0.1);
  x.globalCompositeOperation = 'source-atop';
  const eg = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.6);
  eg.addColorStop(0, 'rgba(90,70,40,0)'); eg.addColorStop(1, 'rgba(90,70,40,0.35)');
  x.fillStyle = eg; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  // 紙纖維顆粒
  x.restore();
  const img = x.getImageData(X, Y, W, H), d = img.data; // getImageData/putImageData 不吃座標轉換:用絕對座標
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, X, Y);
}

// 銅板面:浮雕(左上打光)+ 外圈珠紋 + 面額,金屬顏色(反照率 = F0)
function coin(x, cx, cy, R, o, rnd) {
  x.save();
  x.beginPath(); x.arc(cx, cy, R, 0, 6.283); x.clip();
  const g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  g.addColorStop(0, o.hi); g.addColorStop(1, o.base);
  x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
  const emboss = (draw) => { // 浮雕:往右下暗影 + 往左上亮邊 + 本體
    x.save(); x.translate(1.6, 1.6); x.globalAlpha = 0.55; draw(o.shade); x.restore();
    x.save(); x.translate(-1.2, -1.2); x.globalAlpha = 0.5; draw(o.light); x.restore();
    draw(o.base2);
  };
  emboss((c) => { x.strokeStyle = c; x.lineWidth = R * 0.07; x.beginPath(); x.arc(cx, cy, R * 0.9, 0, 6.283); x.stroke(); });
  emboss((c) => { x.fillStyle = c; for (let i = 0; i < 48; i++) { const a = (i / 48) * 6.283; x.beginPath(); x.arc(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, R * 0.025, 0, 6.283); x.fill(); } });
  emboss((c) => { x.fillStyle = c; x.font = `700 ${Math.round(R * 0.62)}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.n, cx, cy + R * 0.12); });
  emboss((c) => { x.fillStyle = c; x.font = `700 ${Math.round(R * 0.16)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.top, cx, cy - R * 0.46); x.fillText('中華民國' + o.year + '年', cx, cy + R * 0.58); });
  // 舊化:氧化斑、刮痕、手摸亮的地方
  for (let i = 0; i < 18; i++) {
    const px = cx + (rnd() - 0.5) * R * 1.8, py = cy + (rnd() - 0.5) * R * 1.8, r = R * (0.08 + rnd() * 0.3);
    const sg = x.createRadialGradient(px, py, 0, px, py, r);
    sg.addColorStop(0, `rgba(${o.ox},${0.1 + rnd() * 0.25})`); sg.addColorStop(1, `rgba(${o.ox},0)`);
    x.fillStyle = sg; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  x.lineWidth = 0.7;
  for (let i = 0; i < 40; i++) { const a = rnd() * 6.283, l = R * (0.05 + rnd() * 0.4), px = cx + (rnd() - 0.5) * R * 1.6, py = cy + (rnd() - 0.5) * R * 1.6; x.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255,0.25' : '0,0,0,0.25'})`; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.restore();
}

export function atlas(make, args = {}) {
  const [c, x] = make(1024, 512, { read: true });
  const rnd = rng(args.seed || 2003);
  x.fillStyle = '#7a7060'; x.fillRect(0, 0, 1024, 512);
  bill(x, 4, 8, 504, 240, { c0: '#b0625e', c1: '#d08e84', ink: '120,26,34', han: '壹佰圓', n: '100', serial: 'AF 384916 TW', year: '八十八年' }, rnd);
  bill(x, 516, 8, 504, 240, { c0: '#a98a66', c1: '#cbb08a', ink: '104,58,28', han: '伍佰圓', n: '500', serial: 'KC 027713 ZQ', year: '八十九年' }, rnd);
  bill(x, 4, 264, 504, 240, { c0: '#8d9cb2', c1: '#b3bfcd', ink: '34,58,104', han: '壹仟圓', n: '1000', serial: 'MB 590204 HW', year: '八十八年' }, rnd);
  // 銅板(反照率 = 金屬 F0:白銅偏灰、黃銅偏金;都已經舊了)
  coin(x, 516 + 120, 264 + 120, 112, { base: '#8f8d86', base2: '#a3a199', hi: '#b8b6ae', shade: '#45443f', light: '#d8d6ce', ox: '70,64,50', n: '10', top: '拾圓', year: '八十八' }, rnd);
  coin(x, 516 + 360, 264 + 120, 112, { base: '#9a7c3e', base2: '#ad8f4c', hi: '#c9aa62', shade: '#4a3818', light: '#e6cc88', ox: '60,50,20', n: '50', top: '伍拾圓', year: '九十一' }, rnd);
  // 幣緣滾花(右上角小條)
  for (let i = 0; i < 64; i++) { x.fillStyle = i & 1 ? '#7d7b74' : '#a8a69e'; x.fillRect(996 + 0, 268 + i * 3.6, 24, 3.6); }
  return c;
}
