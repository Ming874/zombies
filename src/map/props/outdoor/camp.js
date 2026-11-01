import * as THREE from 'three';
import { registerMat, mat } from '../../materials.js';
import { pbrTex } from '../../hospital/pbr.js';
import { makeWet } from '../../weather.js';
import { Parts, M, box, rbox, cyl, sph, tor, lathe, rod, beam, tube, extrude, gridSurface, smoothNormals, keepUV, pool, put, solid, dyn, animPool, animate, V3, HALF, TAU, lerp, clamp, hash } from './kit.js';
import { canvas, tex, lazy, text, wear, softBlob, splat, BLOOD, rr, R, FONT_TC } from './mats.js';
import { flatDecal } from './industrial.js';
import { glowMat } from './env.js';
import { rng as mkRng } from '../ctx.js';
const posRng = (x, z) => mkRng((Math.round(x * 100) * 73856093) ^ (Math.round(z * 100) * 19349663));

// 災難現場道具(故事場景):檢疫/醫療帳篷、軍用遮陽棚、沙包牆、紐澤西護欄、臨時圍籬、折疊桌椅、屍袋、輪椅、點滴架、
// 氧氣瓶、醫療廢棄物桶、三腳架投光燈、A 字告示牌、行李箱、嬰兒車、防護衣、燃燒的道路信號彈。

// ---------- 告示圖集 po_sign(2048×1024)----------
const SIGN = {};
const sc = (n, x, y, w, h) => { SIGN[n] = [x, y, w, h]; };
sc('evac', 0, 0, 512, 256); sc('quar', 512, 0, 512, 256); sc('triage', 1024, 0, 512, 256); sc('morgue', 1536, 0, 512, 256);
sc('curfew', 0, 256, 256, 384); sc('missing1', 256, 256, 256, 384); sc('missing2', 512, 256, 256, 384); sc('names', 768, 256, 256, 384);
sc('shoot', 1024, 256, 512, 256); sc('lies', 1536, 256, 512, 256);
sc('play', 1024, 512, 512, 256); sc('cem', 1536, 512, 512, 256);
sc('park', 0, 640, 256, 256); sc('speed', 256, 640, 128, 128); sc('noentry', 384, 640, 128, 128); sc('arrowR', 256, 768, 256, 128);
sc('back', 512, 640, 512, 256); sc('er_dir', 1024, 768, 512, 256); sc('roof', 1536, 768, 512, 256);
const SIGN_TEX = lazy(() => {
  const [c, ctx] = canvas(2048, 1024);
  ctx.fillStyle = '#666'; ctx.fillRect(0, 0, 2048, 1024);
  const inR = (n, fn) => { const [x, y, w, h] = SIGN[n]; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); };
  const grime = (w, h, a = 0.3) => { for (let k = 0; k < 16; k++) softBlob(ctx, rr(0, w), rr(0, h), rr(w * 0.05, w * 0.3), '70,60,45', a * R()); };
  const rain = (w, h) => { for (let k = 0; k < 30; k++) { const x = rr(0, w); const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(60,50,35,0.25)'); g.addColorStop(1, 'rgba(60,50,35,0)'); ctx.fillStyle = g; ctx.fillRect(x, rr(0, h * 0.3), rr(1, 4), rr(h * 0.3, h)); } };
  inR('evac', (w, h) => { ctx.fillStyle = '#ece8dc'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#b81c16'; ctx.fillRect(0, 0, w, 70); text(ctx, '封 鎖 區 檢 查 站', w / 2, 38, 46, { color: '#fff', weight: '900' }); text(ctx, 'LOCKDOWN CHECKPOINT', w / 2, 110, 30, { color: '#222', font: 'Arial Black,Arial', stretch: 0.85 }); text(ctx, '請備妥身分證件 · 接受體溫檢測', w / 2, 160, 24, { color: '#333' }); text(ctx, '被咬傷者 一律隔離', w / 2, 200, 26, { color: '#b81c16', weight: '900' }); grime(w, h); rain(w, h); });
  inR('quar', (w, h) => { ctx.fillStyle = '#e0b81c'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111'; for (let x = -h; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 30 + h, h); ctx.lineTo(x + h, h); ctx.fill(); } ctx.fillStyle = '#e8e4d8'; ctx.fillRect(30, 40, w - 60, h - 80); text(ctx, '☣ 隔 離 區', w / 2, 98, 56, { color: '#a01010', weight: '900' }); text(ctx, 'QUARANTINE · NO ENTRY', w / 2, 160, 30, { color: '#111', font: 'Arial Black,Arial', stretch: 0.85 }); grime(w, h); rain(w, h); });
  inR('triage', (w, h) => { ctx.fillStyle = '#f0ece4'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c01818'; ctx.fillRect(40, 70, 120, 120); ctx.fillStyle = '#f0ece4'; ctx.fillRect(84, 84, 32, 92); ctx.fillRect(54, 114, 92, 32); text(ctx, '檢傷分類', 340, 100, 54, { color: '#c01818', weight: '900' }); text(ctx, 'TRIAGE', 340, 165, 40, { color: '#222', font: 'Arial Black,Arial' }); grime(w, h); rain(w, h); });
  inR('morgue', (w, h) => { ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, w, h); text(ctx, '遺 體 暫 置 區', w / 2, 100, 52, { color: '#e8e4d8', weight: '900' }); text(ctx, '黑色檢傷 · 請勿翻動', w / 2, 168, 28, { color: '#bbb' }); grime(w, h, 0.2); });
  inR('curfew', (w, h) => { ctx.fillStyle = '#e8e4d4'; ctx.fillRect(0, 0, w, h); text(ctx, '封 鎖 令', w / 2, 40, 40, { color: '#a01010', weight: '900' }); ctx.fillStyle = 'rgba(30,30,30,0.6)'; for (let y = 80; y < 330; y += 14) ctx.fillRect(22, y, rr(150, 212), 4); text(ctx, '宵禁 22:00 — 06:00', w / 2, 350, 22, { color: '#111', weight: '900' }); ctx.fillStyle = '#a01010'; ctx.beginPath(); ctx.arc(200, 300, 26, 0, TAU); ctx.fill(); grime(w, h, 0.35); ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - 70, 0); ctx.lineTo(w, 90); ctx.fill(); });
  const missing = (n, name, seed) => inR(n, (w, h) => { ctx.fillStyle = '#ecead8'; ctx.fillRect(0, 0, w, h); text(ctx, '尋 人', w / 2, 40, 48, { color: '#111', weight: '900' }); ctx.fillStyle = `rgb(${90 + seed * 10},${84 + seed * 8},${76})`; ctx.fillRect(48, 76, 160, 170); ctx.fillStyle = '#3a342c'; ctx.beginPath(); ctx.arc(128, 140, 40, 0, TAU); ctx.fill(); ctx.fillRect(84, 180, 88, 66); text(ctx, name, w / 2, 280, 32, { color: '#111', weight: '900' }); ctx.fillStyle = 'rgba(30,30,30,0.6)'; for (let y = 306; y < 370; y += 12) ctx.fillRect(30, y, rr(120, 196), 4); grime(w, h, 0.4); rain(w, h); });
  missing('missing1', '黃 阿 進 81 歲', 1); missing('missing2', '陳 志 明 42 歲', 3);
  inR('names', (w, h) => { ctx.fillStyle = '#dcd8c8'; ctx.fillRect(0, 0, w, h); text(ctx, '已撤離名單', w / 2, 30, 30, { color: '#111', weight: '900' }); ctx.fillStyle = 'rgba(25,25,25,0.75)'; for (let y = 64; y < 370; y += 16) { ctx.fillRect(20, y, rr(80, 120), 5); ctx.fillRect(150, y, rr(40, 80), 5); if (R() < 0.3) { ctx.fillStyle = 'rgba(160,20,15,0.8)'; ctx.fillRect(14, y + 1, 226, 3); ctx.fillStyle = 'rgba(25,25,25,0.75)'; } } grime(w, h, 0.35); });
  inR('shoot', (w, h) => { ctx.fillStyle = '#8a7a5e'; ctx.fillRect(0, 0, w, h); for (let k = 0; k < 9; k++) { ctx.fillStyle = `rgba(60,48,30,${rr(0.1, 0.3)})`; ctx.fillRect(0, rr(0, h), w, rr(2, 8)); } text(ctx, '擅 闖 者', w / 2, 88, 72, { color: 'rgba(150,15,10,0.92)', weight: '900' }); text(ctx, '後 果 自 負', w / 2, 180, 72, { color: 'rgba(150,15,10,0.92)', weight: '900' }); wear(ctx, 0, 0, w, h, 0.12, 14); });
  inR('lies', (w, h) => { ctx.fillStyle = '#7a6a50'; ctx.fillRect(0, 0, w, h); for (let k = 0; k < 9; k++) { ctx.fillStyle = `rgba(50,40,25,${rr(0.1, 0.3)})`; ctx.fillRect(0, rr(0, h), w, rr(2, 8)); } ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.06); text(ctx, '別相信大新', 0, -30, 70, { color: 'rgba(230,226,215,0.92)', weight: '900' }); text(ctx, '回來的不是他們', 0, 60, 52, { color: 'rgba(230,226,215,0.85)', weight: '900' }); ctx.restore(); for (let k = 0; k < 12; k++) { ctx.fillStyle = 'rgba(230,226,215,0.8)'; ctx.fillRect(rr(40, w - 40), rr(140, 200), rr(3, 6), rr(12, 50)); } });
  inR('play', (w, h) => { ctx.fillStyle = '#2a6a3a'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#e8e8e0'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20); text(ctx, '兒 童 遊 戲 場', w / 2, 90, 54, { color: '#fff', weight: '900' }); text(ctx, '請家長陪同 · 開放時間 06:00-21:00', w / 2, 170, 26, { color: '#e8e8e0' }); grime(w, h, 0.35); ctx.fillStyle = 'rgba(120,10,8,0.85)'; ctx.font = '900 40px ' + FONT_TC; ctx.fillText('別 讓 他 們 出 來', 90, 230); });
  inR('cem', (w, h) => { ctx.fillStyle = '#3a342c'; ctx.fillRect(0, 0, w, h); text(ctx, '聖 心 安 息 園', w / 2, 96, 60, { color: '#c8b88a', font: '"DFKai-SB","KaiTi",serif' }); text(ctx, '願逝者安息 · 1962', w / 2, 176, 30, { color: '#a89a72', font: '"DFKai-SB","KaiTi",serif' }); grime(w, h, 0.5); });
  inR('park', (w, h) => { ctx.fillStyle = '#1a3a8a'; ctx.fillRect(0, 0, w, h); text(ctx, 'P', w / 2, 100, 150, { color: '#fff', font: 'Arial Black' }); text(ctx, '訪客停車場', w / 2, 200, 30, { color: '#fff', weight: '900' }); grime(w, h, 0.3); });
  inR('speed', (w, h) => { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(64, 64, 62, 0, TAU); ctx.fill(); ctx.strokeStyle = '#c01818'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(64, 64, 54, 0, TAU); ctx.stroke(); text(ctx, '10', 64, 68, 54, { color: '#111', font: 'Arial Black' }); });
  inR('noentry', (w, h) => { ctx.fillStyle = '#c01818'; ctx.beginPath(); ctx.arc(64, 64, 62, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(18, 54, 92, 20); });
  inR('arrowR', (w, h) => { ctx.fillStyle = '#1a7a3a'; ctx.fillRect(0, 0, w, h); text(ctx, '急診 →', w / 2, 64, 56, { color: '#fff', weight: '900' }); });
  inR('back', (w, h) => { ctx.fillStyle = '#e8e4d8'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#c01818'; ctx.lineWidth = 14; ctx.strokeRect(14, 14, w - 28, h - 28); text(ctx, '封 鎖 線 · 禁 止 通 行', w / 2, 96, 46, { color: '#c01818', weight: '900' }); text(ctx, 'ROAD CLOSED — LOCKDOWN ZONE', w / 2, 168, 30, { color: '#222', font: 'Arial Black,Arial', stretch: 0.85 }); grime(w, h); rain(w, h); });
  inR('er_dir', (w, h) => { ctx.fillStyle = '#c01818'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(30, 70, 110, 110); ctx.fillStyle = '#c01818'; ctx.fillRect(70, 80, 30, 90); ctx.fillRect(40, 110, 90, 30); text(ctx, '急診入口', 330, 100, 56, { color: '#fff', weight: '900' }); text(ctx, 'EMERGENCY →', 330, 168, 38, { color: '#fff', font: 'Arial Black' }); grime(w, h, 0.35); });
  inR('roof', (w, h) => { ctx.fillStyle = '#e8e8e0'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c01818'; ctx.fillRect(0, 0, w, 60); text(ctx, '危 險 · 頂 樓 邊 緣', w / 2, 32, 34, { color: '#fff', weight: '900' }); text(ctx, '非工作人員禁止進入', w / 2, 140, 40, { color: '#111', weight: '900' }); grime(w, h, 0.4); rain(w, h); });
  return tex(c, { repeat: false });
});
export function signQuad(name, w, h) {
  const [x, y, ww, hh] = SIGN[name];
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, (x + a.getX(i) * ww) / 2048, 1 - (y + hh - a.getY(i) * hh) / 1024);
  return keepUV(g);
}
// 焊接鋼絲網(臨時圍籬,alphaTest)
const MESH_TEX = lazy(() => {
  const [c, ctx] = canvas(128, 128);
  ctx.strokeStyle = 'rgba(170,172,170,1)'; ctx.lineWidth = 3;
  for (let k = 0; k <= 128; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, 128); ctx.stroke(); }
  for (let k = 0; k <= 128; k += 16) { ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(128, k); ctx.stroke(); }
  return tex(c);
});

let inited = false;
export function initCamp() {
  if (inited) return;
  inited = true;
  const fab = (k, tint, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, map: pbrTex('fabric', 'color', { tile: 0.9 }), normalMap: pbrTex('fabric', 'normal', { tile: 0.9 }), side: o.side ?? THREE.DoubleSide });
    m.roughnessMap = pbrTex('fabric', 'orm', { tile: 0.9 });
    registerMat(k, makeWet(m, { darken: o.darken ?? 0.35, gloss: 0.35 }));
  };
  fab('po_tent_white', 0x9c9a90); fab('po_tent_green', 0x50583e); fab('po_tent_blue', 0x3e5a78); fab('po_sandbag', 0x9a8a68, { side: THREE.FrontSide }); fab('po_canvas_olive', 0x6a6a4a);
  registerMat('po_sign', makeWet(new THREE.MeshStandardMaterial({ map: SIGN_TEX(), roughness: 0.6, metalness: 0.05 }), { darken: 0.1, gloss: 0.6 }));
  registerMat('po_sheet', new THREE.MeshStandardMaterial({ color: 0xd8dcd8, roughness: 0.3, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
  registerMat('po_wiremesh', new THREE.MeshStandardMaterial({ map: MESH_TEX(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.7, color: 0x9a9c98 }));
  registerMat('po_hazmat', [0xc8b43a, 0.55]);
  registerMat('po_tarp', makeWet(new THREE.MeshStandardMaterial({ color: 0x2a4a82, roughness: 0.55, side: THREE.DoubleSide }), { darken: 0.2, gloss: 0.6 }));
  registerMat('po_ivbag', [0xd8e4e0, 0.15, 0, 0.55]);
  registerMat('po_olive', [0x4a4e36, 0.7, 0.2]);
  registerMat('po_flare', glowMat(new THREE.MeshStandardMaterial({ color: 0x400404, emissive: 0xff2010, emissiveIntensity: 4, roughness: 0.6 }), 4, (t) => 0.75 + 0.25 * Math.sin(t * 31) * Math.sin(t * 17.3), true));
}

// ======================================================================
// 帳篷
// ======================================================================
// 下垂的布面:四角 a,b,c,d(世界/本地),細分 n×m,中間往下 sag
function cloth(P, key, a, b, c, d, sag, n = 6, m = 6, ripple = 0.02) {
  const rows = [], nn = new V3().subVectors(b, a).cross(new V3().subVectors(d, a)).normalize(), roof = Math.abs(nn.y) > 0.5;
  for (let i = 0; i <= n; i++) {
    const u = i / n, r = [];
    for (let j = 0; j <= m; j++) {
      const v = j / m;
      const p = new V3().lerpVectors(new V3().lerpVectors(a, b, u), new V3().lerpVectors(d, c, u), v);
      const w = ripple * (Math.sin(u * 17 + v * 5) * 0.7 + Math.sin(u * 7.3 - v * 11) * 0.3) * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
      if (roof) p.y -= sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) + w;
      else p.addScaledVector(nn, w + sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
      r.push(p);
    }
    rows.push(r);
  }
  P.add(key, smoothNormals(gridSurface(rows, { uvFn: (p, i, j) => [i / n * a.distanceTo(b), j / m * a.distanceTo(d)] }), 0.5));
}
// 醫療/隔離帳篷(4×3m 框架帳):正面(+Z)門簾捲起;cross:側面紅十字
export function tent(ctx, x, y, z, yaw = 0, { key = 'po_tent_white', L = 4, W = 3, H = 2.0, ridge = 2.7, open = true, cross = true, sign = null, inside = null, rng = null } = {}) {
  rng = rng || posRng(x, z);
  const P = new Parts(), hx = L / 2, hz = W / 2;
  // 框架
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('aluminum', cyl(0.025, 0.025, H, 6), M(sx * hx, H / 2, sz * hz));
  for (const sx of [-1, 1]) { P.add('aluminum', rod(new V3(sx * hx, H, -hz), new V3(sx * hx, ridge, 0), 0.022, 6)); P.add('aluminum', rod(new V3(sx * hx, H, hz), new V3(sx * hx, ridge, 0), 0.022, 6)); }
  P.add('aluminum', rod(new V3(-hx, ridge, 0), new V3(hx, ridge, 0), 0.022, 6));
  // 屋頂兩片 + 山牆
  cloth(P, key, new V3(-hx - 0.1, H - 0.05, -hz - 0.15), new V3(hx + 0.1, H - 0.05, -hz - 0.15), new V3(hx + 0.1, ridge + 0.02, 0), new V3(-hx - 0.1, ridge + 0.02, 0), 0.06, 8, 4);
  cloth(P, key, new V3(-hx - 0.1, ridge + 0.02, 0), new V3(hx + 0.1, ridge + 0.02, 0), new V3(hx + 0.1, H - 0.05, hz + 0.15), new V3(-hx - 0.1, H - 0.05, hz + 0.15), 0.06, 8, 4);
  for (const sx of [-1, 1]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([sx * hx, H, -hz, sx * hx, H, hz, sx * hx, ridge, 0], 3)); g.computeVertexNormals(); P.add(key, g); }
  // 牆面:後牆、兩側(下擺略為外翻)、正面捲起的門簾
  cloth(P, key, new V3(-hx, H, -hz), new V3(hx, H, -hz), new V3(hx, 0.02, -hz - 0.06), new V3(-hx, 0.02, -hz - 0.06), 0.0, 8, 5, 0.045);
  for (const sx of [-1, 1]) cloth(P, key, new V3(sx * hx, H, -hz), new V3(sx * hx, H, hz), new V3(sx * (hx + 0.06), 0.02, hz), new V3(sx * (hx + 0.06), 0.02, -hz), 0.0, 8, 5, 0.045);
  if (open) {
    for (const sx of [-1, 1]) cloth(P, key, new V3(sx * hx, H, hz), new V3(sx * hx * 0.45, H, hz), new V3(sx * hx * 0.45, 0.02, hz + 0.04), new V3(sx * hx, 0.02, hz + 0.04), 0, 3, 4, 0.02);
    P.add(key, cyl(0.12, 0.12, hx * 1.1, 10).rotateZ(HALF), M(0, H - 0.08, hz + 0.08)); // 捲起的門簾
    P.add(key, box(hx * 1.1, 0.02, 0.01), M(0, H + 0.1, hz + 0.02));
  } else cloth(P, key, new V3(-hx, H, hz), new V3(hx, H, hz), new V3(hx, 0.02, hz + 0.05), new V3(-hx, 0.02, hz + 0.05), 0, 6, 4, 0.025);
  if (cross) for (const sx of [-1, 1]) flatDecal(P, 'cross_paint', sx * (hx + 0.07), 1.3, 0, 0.9, 0.9, sx > 0 ? 'x+' : 'x-');
  for (const sx of [-1, 1]) { flatDecal(P, 'mud', sx * (hx + 0.075), 0.35, rng() - 0.5, W * 0.9, 0.7, sx > 0 ? 'x+' : 'x-'); flatDecal(P, rng() < 0.5 ? 'stain2' : 'water', sx * (hx + 0.074), 1.4, rng() - 0.5, 1.2, 1.0, sx > 0 ? 'x+' : 'x-'); }
  flatDecal(P, 'mud', 0, 0.35, -hz - 0.075, L * 0.9, 0.7, 'z-');
  if (rng() < 0.6) flatDecal(P, rng() < 0.5 ? 'blood3' : 'hand', hx * 0.7, 1.0, hz + 0.05, 0.6, 0.6, 'z+');
  // 營繩 + 營釘
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const a = new V3(sx * hx, H, sz * hz), b = new V3(sx * (hx + 0.9), 0.02, sz * (hz + 0.7)); P.add('po_cable', rod(a, b, 0.004, 3)); P.add('steel', cyl(0.008, 0.008, 0.2, 4), M(b.x, 0.08, b.z, 0, 0, 0.4)); }
  // 地墊、污漬
  flatDecal(P, rng() < 0.5 ? 'mud' : 'stain2', 0, 0.012, hz + 0.6, 2.4, 1.2, 'y+');
  if (sign) P.add('po_sign', signQuad(sign, 1.1, 0.55), M(-hx * 0.62, 1.55, hz + 0.05));
  if (inside) inside(P, L, W, H);
  put(ctx, P, x, y, z, yaw);
  // 碰撞:三面牆(門口可進入)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wall = (lx, lz, sx2, sz2) => { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; const ex = Math.abs(sx2 * c) + Math.abs(sz2 * s), ez = Math.abs(sx2 * s) + Math.abs(sz2 * c); solid(ctx, wx, y, wz, ex, H, ez, 'fabric'); };
  wall(0, -hz, L, 0.15);
  wall(-hx, 0, 0.15, W); wall(hx, 0, 0.15, W);
  if (!open) wall(0, hz, L, 0.15);
}
// 軍用遮陽棚(四柱 + 斜頂,四面開放)
export function canopy(ctx, x, y, z, yaw = 0, { key = 'po_canvas_olive', L = 3.6, W = 3, H = 2.15 } = {}) {
  const P = new Parts(), hx = L / 2, hz = W / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P.add('steel', cyl(0.025, 0.025, H + (sz < 0 ? 0.25 : 0), 6), M(sx * hx, (H + (sz < 0 ? 0.25 : 0)) / 2, sz * hz)); P.add('steel', box(0.15, 0.01, 0.15), M(sx * hx, 0.005, sz * hz)); }
  cloth(P, key, new V3(-hx - 0.15, H + 0.3, -hz - 0.15), new V3(hx + 0.15, H + 0.3, -hz - 0.15), new V3(hx + 0.15, H, hz + 0.15), new V3(-hx - 0.15, H, hz + 0.15), 0.12, 8, 6);
  for (let k = 0; k < 9; k++) P.add(key, box(L / 9 - 0.02, 0.18, 0.005), M(-hx + (k + 0.5) * (L / 9), H - 0.09, hz + 0.16, 0.05 * Math.sin(k), 0, 0)); // 垂邊
  put(ctx, P, x, y, z, yaw);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = Math.cos(yaw), s = Math.sin(yaw); solid(ctx, x + sx * hx * c + sz * hz * s, y, z - sx * hx * s + sz * hz * c, 0.12, H, 0.12, 'metal'); }
}

// ======================================================================
// 沙包牆 / 紐澤西護欄 / 臨時圍籬
// ======================================================================
function sandbagParts() {
  const P = new Parts();
  const g = new THREE.BoxGeometry(0.62, 0.16, 0.36, 6, 2, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.31, yv = p.getY(i) / 0.08, zz = p.getZ(i) / 0.18;
    const bul = (1 - x * x * 0.55) * (1 - zz * zz * 0.4);
    p.setY(i, p.getY(i) * (0.55 + 0.45 * bul) + 0.08);
    p.setX(i, p.getX(i) * (1 - 0.12 * yv * yv));
    p.setZ(i, p.getZ(i) * (1 - 0.15 * yv * yv) * (1 - 0.1 * Math.abs(x)));
  }
  g.computeVertexNormals();
  P.add('po_sandbag', g);
  P.add('po_sandbag', cyl(0.03, 0.05, 0.08, 6).rotateZ(HALF), M(0.33, 0.08, 0)); // 綁口
  return P;
}
// 沿線段疊沙包牆:rows 層,從 (x0,z0) 到 (x1,z1)
export function sandbagWall(ctx, x0, y, z0, x1, z1, rows = 3, rng = null) {
  rng = rng || posRng(x0, z1);
  const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(L / 0.6));
  const p = pool(ctx, 'sandbag', sandbagParts, 160);
  for (let r = 0; r < rows; r++) for (let k = 0; k < n - (r & 1); k++) {
    const t = (k + 0.5 + (r & 1) * 0.5) / n;
    const jitter = (rng() - 0.5) * 0.05;
    p.add(M(lerp(x0, x1, t) + jitter, y + r * 0.145, lerp(z0, z1, t) + jitter, (rng() - 0.5) * 0.06, yaw + (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.06));
  }
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, (x0 + x1) / 2, y, (z0 + z1) / 2, ax ? L : 0.45, rows * 0.145 + 0.03, ax ? 0.45 : L, 'sand');
}
function jerseyParts() {
  const P = new Parts();
  const prof = [[-0.3, 0], [0.3, 0], [0.3, 0.07], [0.2, 0.32], [0.08, 0.8], [-0.08, 0.8], [-0.2, 0.32], [-0.3, 0.07]];
  P.add('po_jersey', extrude(prof, 2.0, { bevel: 0.01, seg: 1 }).rotateY(HALF));
  P.add('steel', box(0.04, 0.06, 0.12), M(0.98, 0.62, 0));
  return P;
}
export function jersey(ctx, x, y, z, yaw = 0) {
  pool(ctx, 'jersey', jerseyParts, 48).add(M(x, y, z, 0, yaw, 0));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? 2.0 : 0.6, 0.8, ax ? 0.6 : 2.0, 'concrete');
}
// 臨時圍籬板(3.4m 寬,2m 高,混凝土腳座)
function heraParts() {
  const P = new Parts(), W = 3.4, H = 2.0;
  for (const s of [-1, 1]) P.add('steel', cyl(0.02, 0.02, H, 6), M(s * W / 2, H / 2 + 0.1, 0));
  for (const yy of [0.12, H + 0.08]) P.add('steel', cyl(0.02, 0.02, W, 6).rotateZ(HALF), M(0, yy, 0));
  const g = new THREE.PlaneGeometry(W, H - 0.05);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * W * 2, a.getY(i) * H * 2);
  P.add('po_wiremesh', keepUV(g), M(0, H / 2 + 0.1, 0));
  for (const s of [-1, 1]) P.add('po_curb_dark', box(0.62, 0.14, 0.22), M(s * W / 2, 0.07, 0));
  return P;
}
export function heras(ctx, x, y, z, yaw = 0, tilt = 0) {
  pool(ctx, 'heras', heraParts, 32).add(M(x, y, z, 0, yaw, tilt));
  const ax = Math.abs(Math.cos(yaw)) > 0.7;
  solid(ctx, x, y, z, ax ? 3.4 : 0.3, 2.1, ax ? 0.3 : 3.4, 'mesh');
}

// ======================================================================
// 桌椅、器材
// ======================================================================
export function foldTable(P, x, y, z, yaw = 0, rng = null, items = true) {
  rng = rng || posRng(x, z);
  const T = new Parts(), L = 1.8, W = 0.75, H = 0.74;
  T.add('plastic_white', rbox(L, 0.045, W, 0.015), M(0, H, 0));
  for (const s of [-1, 1]) { T.add('steel', rod(new V3(s * 0.75, 0, -0.32), new V3(s * 0.7, H - 0.03, -0.3), 0.014, 6)); T.add('steel', rod(new V3(s * 0.75, 0, 0.32), new V3(s * 0.7, H - 0.03, 0.3), 0.014, 6)); T.add('steel', rod(new V3(s * 0.75, 0.15, -0.32), new V3(s * 0.75, 0.15, 0.32), 0.01, 6)); }
  if (items) {
    T.add('paper', box(0.21, 0.004, 0.297), M(-0.5, H + 0.025, 0.1, 0, 0.2, 0));
    T.add('paper', box(0.21, 0.004, 0.297), M(-0.4, H + 0.029, 0.05, 0, -0.3, 0));
    T.add('wood_dark', box(0.23, 0.01, 0.32), M(0.1, H + 0.027, -0.1, 0, 0.1, 0)); // 板夾
    T.add('paper', box(0.21, 0.004, 0.28), M(0.1, H + 0.034, -0.11, 0, 0.1, 0));
    T.add('po_olive', rbox(0.28, 0.12, 0.2, 0.02), M(0.55, H + 0.08, 0.15)); // 無線電
    T.add('rubber', cyl(0.005, 0.005, 0.3, 4), M(0.62, H + 0.28, 0.13, 0, 0, 0.1));
    for (let k = 0; k < 3; k++) T.add('plastic_white', lathe([[0, 0], [0.032, 0], [0.04, 0.1], [0.038, 0.1], [0.03, 0.004]], 10), M(-0.1 + k * 0.12, H + 0.022, 0.25 - k * 0.04));
    T.add('cardboard', box(0.3, 0.18, 0.22), M(-0.75, H + 0.11, -0.15, 0, 0.3, 0)); // 口罩箱
    if (rng() < 0.6) { // 筆電(螢幕還亮著)
      T.add('plastic_black', box(0.34, 0.015, 0.24), M(0.35, H + 0.03, -0.18, 0, -0.4, 0));
      T.add('plastic_black', box(0.34, 0.23, 0.012), M(0.35, H + 0.03, -0.18, 0, -0.4, 0).multiply(M(0, 0.11, -0.12, -0.25, 0, 0)));
      T.add('glow_screen', box(0.3, 0.19, 0.002), M(0.35, H + 0.03, -0.18, 0, -0.4, 0).multiply(M(0, 0.115, -0.112, -0.25, 0, 0)));
    }
  }
  P.merge(T, M(x, y, z, 0, yaw, 0));
}
function chairParts() {
  const P = new Parts();
  P.add('steel', box(0.42, 0.025, 0.4), M(0, -0.0, 0));
  P.add('steel', box(0.42, 0.3, 0.025), M(0, 0.3, -0.21, -0.12, 0, 0));
  for (const s of [-1, 1]) { P.add('steel', rod(new V3(s * 0.2, -0.45, -0.2), new V3(s * 0.2, 0.45, -0.24), 0.011, 5)); P.add('steel', rod(new V3(s * 0.2, -0.45, 0.22), new V3(s * 0.2, 0.0, -0.05), 0.011, 5)); }
  return P;
}
// 折疊椅(動態:會被打飛);fallen = 倒在地上
export const foldChair = (ctx, x, y, z, yaw = 0, fallen = false) => dyn(ctx, 'foldchair', chairParts, { mass: 4, shape: 'box', size: [0.44, 0.95, 0.48], friction: 0.6, restitution: 0.15 }, x, y + (fallen ? 0.22 : 0.45), z, fallen ? [HALF * 0.98, yaw, 0] : [0, yaw, 0]);

function bodyBagParts() {
  const P = new Parts(), L = 1.95;
  const rows = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18, r = [];
    const shape = (v) => { // 人形起伏
      const head = Math.exp(-(((u - 0.9) / 0.06) ** 2) - (v / 0.35) ** 2) * 0.13;
      const torso = Math.exp(-(((u - 0.62) / 0.18) ** 2) - (v / 0.6) ** 2) * 0.17;
      const legs = Math.exp(-(((u - 0.27) / 0.2) ** 2)) * (Math.exp(-(((v - 0.28) / 0.22) ** 2)) + Math.exp(-(((v + 0.28) / 0.22) ** 2))) * 0.09;
      const feet = Math.exp(-(((u - 0.05) / 0.04) ** 2)) * (Math.exp(-(((v - 0.25) / 0.16) ** 2)) + Math.exp(-(((v + 0.25) / 0.16) ** 2))) * 0.13;
      return Math.max(head, torso, legs, feet) + 0.05;
    };
    for (let j = 0; j <= 12; j++) {
      const v = (j / 12) * 2 - 1, hw = 0.33 * (0.75 + 0.25 * Math.sin(Math.PI * clamp(u, 0.03, 0.97)));
      const h = Math.abs(v) > 0.9 ? 0.012 : shape(v) * (1 - Math.abs(v) ** 6) + 0.02 * Math.sin(u * 30 + j) * 0.2;
      r.push(new V3((u - 0.5) * L, h, v * hw));
    }
    rows.push(r);
  }
  P.add('po_bodybag', smoothNormals(gridSurface(rows, { flip: true }), 0.4));
  const zip = []; for (let i = 1; i < 18; i++) zip.push(rows[i][6].clone().add(new V3(0, 0.006, 0)));
  P.add('steel', tube(zip, 0.006, { radial: 3 }));
  P.add('po_label', new THREE.PlaneGeometry(0.1, 0.06).rotateX(-HALF), M(L * 0.42, 0.19, 0.05, 0, 0.2, 0));
  for (const s of [-1, 1]) P.add('rubber', tor(0.04, 0.008, 4, 8), M(L * 0.48, 0.03, s * 0.2, HALF, 0, 0));
  return P;
}
export function bodyBag(ctx, x, y, z, yaw = 0) { pool(ctx, 'bodybag', bodyBagParts, 24).add(M(x, y, z, 0, yaw, 0)); }

// 輪椅
function wheelchairParts() {
  const P = new Parts();
  for (const s of [-1, 1]) {
    P.add('rubber', tor(0.3, 0.018, 5, 24), M(-0.05, 0.3, s * 0.3));
    P.add('steel', tor(0.27, 0.007, 3, 24), M(-0.05, 0.3, s * 0.32));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; P.add('steel', rod(new V3(-0.05, 0.3, s * 0.3), new V3(-0.05 + Math.cos(a) * 0.28, 0.3 + Math.sin(a) * 0.28, s * 0.3), 0.003, 3)); }
    P.add('rubber', tor(0.06, 0.012, 4, 10), M(0.38, 0.07, s * 0.24));
    P.add('steel', rod(new V3(0.38, 0.13, s * 0.24), new V3(0.36, 0.45, s * 0.24), 0.012, 5));
    P.add('steel', rod(new V3(0.36, 0.45, s * 0.24), new V3(-0.12, 0.45, s * 0.24), 0.012, 5));
    P.add('steel', rod(new V3(-0.12, 0.45, s * 0.24), new V3(-0.18, 0.95, s * 0.24), 0.012, 5));
    P.add('rubber', cyl(0.018, 0.018, 0.12, 6).rotateZ(HALF), M(-0.24, 0.95, s * 0.24));
    P.add('steel', rod(new V3(0.32, 0.45, s * 0.2), new V3(0.46, 0.12, s * 0.12), 0.01, 5));
    P.add('plastic_black', box(0.12, 0.01, 0.12), M(0.47, 0.11, s * 0.12));
  }
  P.add('vinyl_seat', box(0.44, 0.02, 0.46), M(0.12, 0.47, 0));
  P.add('vinyl_seat', box(0.02, 0.42, 0.46), M(-0.15, 0.7, 0, 0, 0, -0.12));
  return P;
}
export function wheelchair(ctx, x, y, z, yaw = 0, tipped = false) {
  if (tipped) pool(ctx, 'wheelchair', wheelchairParts, 12).add(M(x, y + 0.3, z, HALF * 0.97, yaw, 0));
  else pool(ctx, 'wheelchair', wheelchairParts, 12).add(M(x, y, z, 0, yaw, 0));
}
// 點滴架(動態)
function ivParts() {
  const P = new Parts();
  P.add('steel', cyl(0.012, 0.012, 1.8, 6), M(0, 0.9 - 0.95, 0));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; P.add('steel', rod(new V3(0, 0.08 - 0.95, 0), new V3(Math.cos(a) * 0.28, 0.05 - 0.95, Math.sin(a) * 0.28), 0.01, 4)); P.add('rubber', sph(0.025, 6, 4), M(Math.cos(a) * 0.28, 0.025 - 0.95, Math.sin(a) * 0.28)); }
  P.add('steel', tor(0.06, 0.005, 3, 8), M(0, 1.8 - 0.95, 0, HALF, 0, 0));
  P.add('po_ivbag', rbox(0.12, 0.2, 0.04, 0.02), M(0.07, 1.62 - 0.95, 0));
  P.add('plastic_white', cyl(0.002, 0.002, 0.6, 3), M(0.07, 1.25 - 0.95, 0.01, 0, 0, 0.05));
  return P;
}
export const ivStand = (ctx, x, y, z, fallen = false) => dyn(ctx, 'ivstand', ivParts, { mass: 5, shape: 'box', size: [0.56, 1.9, 0.56], friction: 0.5, restitution: 0.1 }, x, y + (fallen ? 0.3 : 0.95), z, fallen ? [HALF * 0.9, hash(x + z) * TAU, 0] : [0, 0, 0]);
// 氧氣瓶(動態圓柱)
export const o2Tank = (ctx, x, y, z, fallen = false) => dyn(ctx, 'o2tank', () => { const P = new Parts(); P.add('po_green_paint', cyl(0.09, 0.09, 0.9, 14)); P.add('chrome', cyl(0.03, 0.05, 0.1, 10), M(0, 0.5, 0)); P.add('steel', cyl(0.025, 0.025, 0.06, 8).rotateZ(HALF), M(0.03, 0.55, 0)); P.add('po_label', new THREE.PlaneGeometry(0.1, 0.1), M(0, 0.2, 0.091)); return P; }, { mass: 14, shape: 'cylinder', size: [0.18, 1.0, 0.18], friction: 0.5, restitution: 0.2 }, x, y + (fallen ? 0.09 : 0.45), z, fallen ? [HALF, hash(x * 3 + z) * TAU, 0] : [0, 0, 0]);
// 醫療廢棄物桶(動態)
export const bioBin = (ctx, x, y, z, yaw = 0) => dyn(ctx, 'biobin', () => {
  const P = new Parts();
  P.add('po_bag_yellow', rbox(0.5, 0.62, 0.42, 0.04), M(0, 0, 0));
  P.add('po_bag_red', rbox(0.52, 0.06, 0.44, 0.02), M(0, 0.33, 0));
  const g = new THREE.PlaneGeometry(0.4, 0.2);
  P.add('po_label', g, M(0, 0.05, 0.212));
  return P;
}, { mass: 8, shape: 'box', size: [0.52, 0.68, 0.44], friction: 0.6, restitution: 0.1 }, x, y + 0.31, z, [0, yaw, 0]);
// 行李箱(動態)
export const suitcase = (ctx, x, y, z, yaw = 0, flat = false, alt = false) => dyn(ctx, alt ? 'suitcase2' : 'suitcase', () => {
  const P = new Parts(), k = alt ? 'po_suitcase2' : 'po_suitcase';
  P.add(k, rbox(0.42, 0.62, 0.24, 0.04));
  for (let i = 0; i < 4; i++) P.add(k, box(0.43, 0.006, 0.245), M(0, -0.24 + i * 0.16, 0));
  P.add('plastic_black', box(0.16, 0.03, 0.04), M(0, 0.33, 0));
  for (const s of [-1, 1]) P.add('rubber', cyl(0.025, 0.025, 0.03, 8).rotateX(HALF), M(s * 0.16, -0.31, 0.1));
  return P;
}, { mass: 12, shape: 'box', size: [0.42, 0.62, 0.24], friction: 0.6, restitution: 0.1 }, x, y + (flat ? 0.12 : 0.31), z, flat ? [HALF, yaw, 0] : [0, yaw, 0]);
// 嬰兒車(翻倒或停著)
export function stroller(P, x, y, z, yaw = 0, tipped = false) {
  const S = new Parts();
  for (const s of [-1, 1]) for (const e of [-0.3, 0.3]) S.add('rubber', tor(0.09, 0.018, 5, 12), M(e, 0.09, s * 0.25));
  for (const s of [-1, 1]) { S.add('steel', rod(new V3(-0.3, 0.09, s * 0.25), new V3(0.1, 0.55, s * 0.25), 0.012, 5)); S.add('steel', rod(new V3(0.3, 0.09, s * 0.25), new V3(-0.25, 1.0, s * 0.25), 0.012, 5)); }
  S.add('steel', cyl(0.015, 0.015, 0.55, 6).rotateX(HALF), M(-0.27, 1.02, 0));
  S.add('po_fabric_pink', rbox(0.6, 0.3, 0.46, 0.08), M(0.05, 0.6, 0));
  S.add('po_fabric_pink', new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI, 0, Math.PI * 0.5).rotateZ(HALF).scale(1, 1, 0.8), M(0.25, 0.75, 0, 0, 0, -0.4));
  P.merge(S, M(x, y, z, tipped ? HALF * 0.95 : 0, yaw, 0).multiply(M(0, tipped ? 0.24 : 0, 0)));
}
// 被丟在地上的防護衣 + 防毒面具
export function hazmatSuit(P, x, y, z, yaw = 0) {
  const S = new Parts();
  S.add('po_hazmat', sph(0.2, 12, 8).scale(1.4, 0.3, 1), M(0.3, 0.06, 0));
  for (const s of [-1, 1]) { S.add('po_hazmat', cyl(0.07, 0.08, 0.8, 8).rotateZ(HALF).scale(1, 0.45, 1), M(-0.35, 0.04, s * 0.13, 0, s * 0.15, 0)); S.add('po_hazmat', cyl(0.05, 0.06, 0.6, 8).rotateZ(HALF).scale(1, 0.45, 1), M(0.4, 0.035, s * 0.38, 0, s * 0.9, 0)); S.add('rubber', sph(0.06, 8, 6).scale(1.3, 0.5, 1), M(-0.8, 0.04, s * 0.15)); }
  S.add('po_hazmat', sph(0.14, 10, 8).scale(1, 0.5, 1), M(0.72, 0.05, 0));
  S.add('rubber', sph(0.1, 10, 8).scale(1, 0.8, 0.9), M(1.05, 0.08, 0.25)); // 防毒面具
  S.add('glass', cyl(0.035, 0.035, 0.01, 10).rotateZ(HALF), M(1.14, 0.1, 0.22));
  S.add('glass', cyl(0.035, 0.035, 0.01, 10).rotateZ(HALF), M(1.14, 0.1, 0.3));
  S.add('cast_iron', cyl(0.045, 0.05, 0.08, 10).rotateZ(HALF), M(1.15, 0.05, 0.26));
  P.merge(S, M(x, y, z, 0, yaw, 0));
}
// A 字告示牌(兩面同一張)
export function aSign(P, x, y, z, yaw, name, w = 0.62, h = 0.9) {
  const S = new Parts();
  for (const s of [-1, 1]) {
    const m = M(0, 0, 0, s * 0.2, 0, 0).multiply(M(0, h / 2 + 0.05, s * 0.0));
    S.add('wood_old', box(w + 0.06, h + 0.06, 0.02), m.clone().multiply(M(0, 0, s * 0.11)));
    S.add('po_sign', signQuad(name, w, h * 0.6).rotateY(s > 0 ? 0 : Math.PI), m.clone().multiply(M(0, 0.05, s * 0.122)));
  }
  P.merge(S, M(x, y, z, 0, yaw, 0));
}
// 立柱式告示牌(柱 + 牌面);name 為 po_sign 或 po_label 格
export function postSign(ctx, P, x, y, z, yaw, name, w, h, top = 2.2, label = false) {
  P.add('steel', cyl(0.035, 0.035, top, 8), M(x, y + top / 2, z));
  const g = label ? null : signQuad(name, w, h);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  P.add('metal_gray', box(w + 0.04, h + 0.04, 0.02), M(x + s * 0.05, y + top - h / 2, z + c * 0.05, 0, yaw, 0));
  if (g) P.add('po_sign', g, M(x + s * 0.062, y + top - h / 2, z + c * 0.062, 0, yaw, 0));
  if (ctx) solid(ctx, x, y, z, 0.12, top, 0.12, 'metal');
}
// 道路信號彈(燃燒中:紅光 + 煙)
export function flare(ctx, x, y, z, yaw = 0, zone = null) {
  const P = new Parts();
  P.add('fabric_red', cyl(0.018, 0.018, 0.28, 8).rotateZ(HALF), M(0, 0.02, 0));
  P.add('po_flare', sph(0.022, 8, 6).scale(1.4, 1, 1), M(0.15, 0.025, 0));
  P.add('po_ash', box(0.25, 0.004, 0.06), M(0.3, 0.003, 0.0));
  const g = new THREE.Group();
  g.add(P.group({ shadow: false }));
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  ctx.add(g, { static: false });
  const tip = new V3(0.15, 0.03, 0).applyAxisAngle(new V3(0, 1, 0), yaw).add(new V3(x, y, z));
  ctx.light({ x: tip.x, y: tip.y + 0.25, z: tip.z, color: 0xff2a14, intensity: 3.2, distance: 9, kind: 'fire', flicker: 0.3, zone: zone?.id, glow: 0.7 });
  // 煙(幾片上升淡出的煙霧精靈)
  const sm = new THREE.SpriteMaterial({ map: SMOKE(), color: 0x6a3a38, transparent: true, depthWrite: false, opacity: 0.3 });
  const puffs = [];
  for (let k = 0; k < 4; k++) { const s = new THREE.Sprite(sm.clone()); s.userData.ph = k / 4; s.position.copy(tip); g.parent.add(s); puffs.push(s); }
  animate(g.children[0].children[0], (t) => {
    for (const s of puffs) {
      const ph = (t * 0.28 + s.userData.ph) % 1;
      s.position.set(tip.x + ph * 0.5 + Math.sin(t + s.userData.ph * 7) * 0.08, tip.y + 0.1 + ph * 1.8, tip.z + ph * 0.2);
      const k = 0.2 + ph * 1.1;
      s.scale.set(k, k, k);
      s.material.opacity = 0.32 * (1 - ph) * Math.min(1, ph * 5);
    }
  });
}
const SMOKE = lazy(() => {
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(200,190,190,0.6)'); g.addColorStop(0.5, 'rgba(160,150,150,0.25)'); g.addColorStop(1, 'rgba(120,120,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
});
// 三腳架 LED 投光燈(on:亮 + 登記光源)
export function floodlight(ctx, P, x, y, z, yaw, on = true, zone = null, color = 0xe8f0ff) {
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + yaw; P.add('cast_iron', rod(new V3(x + Math.cos(a) * 0.55, y, z + Math.sin(a) * 0.55), new V3(x, y + 1.4, z), 0.016, 5)); }
  P.add('steel', rod(new V3(x, y + 1.3, z), new V3(x, y + 2.6, z), 0.022, 6));
  P.add('cast_iron', box(0.7, 0.04, 0.04), M(x, y + 2.6, z, 0, yaw, 0));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const d of [-0.25, 0.25]) {
    const hx = x + d * c, hz = z - d * s;
    P.add('cast_iron', rbox(0.3, 0.22, 0.09, 0.02), M(hx, y + 2.7, hz, -0.45, yaw, 0));
    P.add(on ? 'glow_white' : 'po_lamp_off', box(0.25, 0.17, 0.01), M(hx, y + 2.7, hz, -0.45, yaw, 0).multiply(M(0, 0, 0.05)));
  }
  if (on) ctx.light({ x: x + s * 0.6, y: y + 2.5, z: z + c * 0.6, color, intensity: 16, distance: 18, kind: 'street', flicker: 0, zone: zone?.id, glow: 1.4 });
  solid(ctx, x, y, z, 0.5, 2.6, 0.5, 'metal');
}
