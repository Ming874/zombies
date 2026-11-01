import * as THREE from 'three';

// 固定種子的亂數,讓每次載入的貼圖一致
let seed = 1337;
export function setSeed(s) { seed = s >>> 0; }
export function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
export const rr = (a, b) => a + rnd() * (b - a);

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function grain(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function blotches(ctx, w, h, n, rMin, rMax, rgb, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rr(rMin, rMax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = rr(aMin, aMax);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function toTexture(c, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 牆面:上段髒綠色油漆(剝落、水漬),下段深色護牆
export function makeWallTexture() {
  const W = 512, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#8c9788';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#566b5e'; // 護牆
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  ctx.fillStyle = '#2f3b33';
  ctx.fillRect(0, H * 0.62, W, 5);
  blotches(ctx, W, H, 40, 30, 110, '60,66,52', 0.05, 0.18); // 水漬
  blotches(ctx, W, H, 18, 20, 60, '30,24,18', 0.08, 0.22); // 霉斑
  // 水痕垂流
  for (let i = 0; i < 55; i++) {
    const x = rnd() * W, y = rnd() * H * 0.6, l = rr(40, 260);
    const g = ctx.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, 'rgba(25,22,16,0.22)');
    g.addColorStop(1, 'rgba(25,22,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, rr(1, 5), l);
  }
  // 油漆剝落:露出灰泥與磚
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, y = rnd() * H, r = rr(14, 55);
    ctx.fillStyle = rnd() < 0.6 ? '#a9a695' : '#6a625a';
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rad = r * rr(0.55, 1.15);
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.8;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // 裂縫
  ctx.strokeStyle = 'rgba(20,18,14,0.55)';
  for (let i = 0; i < 6; i++) {
    let x = rnd() * W, y = rnd() * H * 0.5;
    ctx.lineWidth = rr(0.8, 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += rr(-10, 10);
      y += rr(6, 20);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 底部髒汙
  const gb = ctx.createLinearGradient(0, H * 0.85, 0, H);
  gb.addColorStop(0, 'rgba(10,8,6,0)');
  gb.addColorStop(1, 'rgba(10,8,6,0.45)');
  ctx.fillStyle = gb;
  ctx.fillRect(0, H * 0.85, W, H * 0.15);
  grain(ctx, W, H, 26);
  return toTexture(c);
}

// 地板:老舊乙烯磁磚
export function makeFloorTexture() {
  const W = 512, H = 512, n = 8, s = W / n;
  const [c, ctx] = canvas(W, H);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const base = (i + j) % 2 ? 150 : 138;
      const v = base + rr(-10, 10);
      ctx.fillStyle = `rgb(${v + 3},${v + 6},${v - 2})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
  }
  ctx.strokeStyle = 'rgba(25,24,20,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke();
  }
  blotches(ctx, W, H, 70, 20, 90, '35,28,20', 0.08, 0.3);
  blotches(ctx, W, H, 6, 20, 50, '70,10,8', 0.15, 0.35);
  for (let i = 0; i < 5; i++) { // 磁磚裂痕
    let x = rnd() * W, y = rnd() * H;
    ctx.strokeStyle = 'rgba(15,14,12,0.7)';
    ctx.lineWidth = rr(0.8, 1.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += rr(-14, 14); y += rr(-14, 14); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  grain(ctx, W, H, 30);
  return toTexture(c);
}

export function makeCeilingTexture() {
  const W = 512, H = 512, n = 4, s = W / n;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#9a9a90';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(40,40,36,0.8)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke();
  }
  for (let i = 0; i < 400; i++) { // 吸音板孔
    ctx.fillStyle = 'rgba(40,40,36,0.25)';
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  blotches(ctx, W, H, 14, 30, 90, '70,52,24', 0.15, 0.4); // 漏水黃漬
  grain(ctx, W, H, 22);
  return toTexture(c);
}

export function makeMetalTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#6d6a64';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 40, 8, 40, '110,60,25', 0.1, 0.4); // 鏽
  blotches(ctx, W, H, 20, 10, 40, '30,30,30', 0.1, 0.3);
  grain(ctx, W, H, 30);
  return toTexture(c);
}

// 髒床墊 / 布
export function makeFabricTexture() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#b8b4a2';
  ctx.fillRect(0, 0, W, H);
  blotches(ctx, W, H, 12, 20, 70, '110,70,30', 0.1, 0.35);
  blotches(ctx, W, H, 4, 16, 40, '90,12,10', 0.3, 0.6);
  grain(ctx, W, H, 20);
  return toTexture(c);
}

export function makeBloodSplat() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
  g.addColorStop(0, 'rgba(70,4,4,0.95)');
  g.addColorStop(0.55, 'rgba(60,4,4,0.8)');
  g.addColorStop(1, 'rgba(50,4,4,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 40; i++) { // 飛濺
    const a = rnd() * Math.PI * 2, d = rr(S * 0.3, S * 0.48), r = rr(1.5, 6);
    ctx.fillStyle = `rgba(${rr(50, 80) | 0},4,4,${rr(0.6, 0.95)})`;
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, 1, 1);
}

export function makeBloodWall() {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.3;
  for (let i = 0; i < 120; i++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.6) * 90, r = rr(1, 7) * (1 - d / 120);
    ctx.fillStyle = `rgba(${rr(55, 90) | 0},4,4,${rr(0.55, 0.95)})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(r, 1), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 9; i++) { // 流下的血痕
    const x = cx + rr(-60, 60), l = rr(40, 190), w = rr(2, 6);
    const g = ctx.createLinearGradient(0, cy, 0, cy + l);
    g.addColorStop(0, 'rgba(70,4,4,0.9)');
    g.addColorStop(1, 'rgba(60,4,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, cy, w, l);
  }
  return toTexture(c, 1, 1);
}

export function makeCrackDecal() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(15,14,12,0.85)';
  for (let b = 0; b < 5; b++) {
    let x = S / 2, y = S / 2, a = rnd() * Math.PI * 2;
    ctx.lineWidth = rr(1, 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 10; k++) {
      a += rr(-0.6, 0.6);
      x += Math.cos(a) * rr(8, 18);
      y += Math.sin(a) * rr(8, 18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(c, 1, 1);
}

export function makePaper() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#c9c5b4';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(40,40,40,0.5)';
  for (let i = 0; i < 12; i++) ctx.fillRect(10, 12 + i * 9, rr(40, 105), 2);
  blotches(ctx, S, S, 3, 10, 40, '90,60,30', 0.1, 0.3);
  grain(ctx, S, S, 20);
  return toTexture(c, 1, 1);
}

// 通用:光暈(槍口火光 / 光源)
export function makeGlow(inner = 'rgba(255,230,160,1)', outer = 'rgba(255,120,30,0)') {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.3, 'rgba(255,170,60,0.7)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeFlashStar() {
  const S = 128;
  const [c, ctx] = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  g.addColorStop(1, 'rgba(255,110,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = i % 2 ? S * 0.18 : S * 0.5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
