// [scene r4] 北側後勤巷:2003 年封院時家屬站在這道鐵網外,抬頭看 2F 那扇窗(207)。
// - 鐵網(臨時圍籬,沿北圍牆內側):綁著黃絲帶、塑膠套裡的家書與照片、乾掉的花束、燒完的蠟燭
// - 207 專用發電機 → 粗電纜沿地面、爬上外牆、從窗框鑽進 207(檯燈的電從這裡來)
// - 發電機上的手寫牌、旁邊一盞低低的工作燈
// - 結局錨點 alleyView:站在鐵網後面,隔著網抬頭看 207 的窗(中間不放高的東西)
import * as THREE from 'three';
import { Parts, M, box, cyl, sph, tor, tube, rod, V3, HALF, solid } from './kit.js';
import { surf } from '../../hospital/surfaces.js';
import { tpl, L } from '../indoor/parts.js';
import { labRect } from '../indoor/atlas.js';

const NOTES = [
  ['媽', '我們在外面', '等你回家', '— 阿惠'],
  ['阿母 加油', '囡仔攏真乖', '你免煩惱'],
  ['護理長', '謝謝您', '照顧我爸爸', '2F 205'],
  ['爸爸', '要撐住', '五月十三號', '我們來接你'],
  ['等你們', '平安出來', '加油！'],
];
const noteRect = (k) => labRect(`alley:note:${k}`, 72, 90, (c, w, h) => {
  c.save(); c.scale(0.75, 0.75); w = 96; h = 120;
  c.fillStyle = k % 2 ? '#f4efe2' : '#efe6c8'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(120,100,60,0.18)'; for (let i = 0; i < 6; i++) c.fillRect(0, 18 + i * 17, w, 1);
  const lines = NOTES[k % NOTES.length];
  c.fillStyle = k % 3 === 0 ? '#1f2f6e' : k % 3 === 1 ? '#2a2a2a' : '#7a1a1a';
  c.textAlign = 'center';
  lines.forEach((t, i) => { c.font = `${i === 0 ? 'bold ' : ''}${i === 0 ? 17 : 13}px serif`; c.fillText(t, w / 2 + ((i * 7) % 5) - 2, 26 + i * 22); });
  const g = c.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, 'rgba(110,80,40,0)'); g.addColorStop(1, 'rgba(110,80,40,0.35)');
  c.fillStyle = g; c.fillRect(0, 0, w, h); // 雨水暈開
  c.restore();
});
// 阿孫(三歲)用蠟筆畫的:房子、二樓一扇黃色的窗、「阿嬤」
const drawingRect = () => labRect('alley:drawing', 120, 96, (c, w, h) => {
  c.fillStyle = '#f7f3ea'; c.fillRect(0, 0, w, h);
  c.lineWidth = 3; c.strokeStyle = '#3a6ad0'; c.strokeRect(18, 34, 84, 52);
  c.strokeStyle = '#d03a3a'; c.beginPath(); c.moveTo(12, 36); c.lineTo(60, 10); c.lineTo(108, 36); c.stroke();
  c.fillStyle = '#f0c020'; c.fillRect(66, 44, 18, 14);
  c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.5; for (const [x, y] of [[30, 46], [48, 46], [30, 66], [48, 66], [66, 66]]) c.strokeRect(x, y, 12, 10);
  c.fillStyle = '#e08020'; c.font = 'bold 15px sans-serif'; c.fillText('阿嬤', 70, 30);
  c.strokeStyle = '#30a050'; c.beginPath(); c.moveTo(4, 92); c.lineTo(116, 92); c.stroke();
});
const signRect = () => labRect('alley:gensign', 128, 72, (c, w, h) => {
  c.fillStyle = '#c9b48a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1a1a1a'; c.textAlign = 'center';
  c.font = 'bold 20px sans-serif'; c.fillText('207 專用', w / 2, 26);
  c.font = 'bold 15px sans-serif'; c.fillStyle = '#9a1a12'; c.fillText('請勿關閉！', w / 2, 47);
  c.font = '11px sans-serif'; c.fillStyle = '#333'; c.fillText('油不夠請通知 維修課', w / 2, 64);
});

// 把室內道具模板(圖集材質)併進戶外 Parts
const addT = (P, t, m) => { for (const { mat, geo } of t.parts) P.add(mat, geo.clone(), m); };

export function alley207(ctx, zone) {
  const P = new Parts(), y = 0;
  const X0 = 68.2, X1 = 82.2, FZ = 3.3, FH = 1.85;
  // ---- 鐵網 ----
  const cl = surf('chainlink');
  const q = new THREE_Plane(X1 - X0, FH - 0.08);
  P.add(cl, q, M((X0 + X1) / 2, y + 0.04 + (FH - 0.08) / 2, FZ, 0, Math.PI, 0));
  for (let x = X0; x <= X1 + 0.01; x += 2) {
    P.add('aluminum', cyl(0.03, 0.03, FH + 0.1, 8), M(x, y + (FH + 0.1) / 2, FZ));
    P.add('concrete', box(0.22, 0.12, 0.22), M(x, y + 0.06, FZ));
  }
  P.add('aluminum', rod(new V3(X0, y + FH, FZ), new V3(X1, y + FH, FZ), 0.006, 4)); // 頂端只有一條拉線(不擋抬頭看窗的視線)
  P.add('aluminum', rod(new V3(X0, y + 0.1, FZ), new V3(X1, y + 0.1, FZ), 0.012, 5));
  solid(ctx, (X0 + X1) / 2, y, FZ, X1 - X0, FH, 0.1);
  // ---- 綁在網上的東西(南面朝巷子;也從網後看得到背面) ----
  let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const face = FZ + 0.03;
  // 黃絲帶
  for (let x = X0 + 0.5; x < X1 - 0.3; x += 0.55 + r() * 0.8) {
    if (x > 74.2 && x < 76.8) continue; // 結局視角正前方留空
    const yy = y + 0.95 + r() * 0.65;
    P.add('plastic_yellow', box(0.06, 0.03, 0.02), M(x, yy, face));
    P.add('plastic_yellow', box(0.025, 0.28 + r() * 0.2, 0.004), M(x - 0.02, yy - 0.17, face, 0, 0, 0.12 + r() * 0.1));
    P.add('plastic_yellow', box(0.025, 0.24 + r() * 0.2, 0.004), M(x + 0.02, yy - 0.15, face, 0, 0, -0.12 - r() * 0.1));
  }
  // 家書(塑膠套)、蠟筆畫
  const notes = [[69.6, 1.45, 0], [71.3, 1.25, 1], [73.1, 1.55, 2], [77.8, 1.35, 3], [79.9, 1.5, 4], [81.0, 1.2, 0]];
  for (const [x, yy, k] of notes) {
    const t = tpl(`alley:note:${k}`, (b) => { b.plane(L(noteRect(k)), 0.19, 0.24, 0, 0, 0.004); b.box('pl_clear', 0.21, 0.27, 0.006, 0, -0.005, 0.002); });
    addT(P, t, M(x, y + yy, face, 0, Math.PI, (r() - 0.5) * 0.12));
  }
  addT(P, tpl('alley:drawing', (b) => { b.plane(L(drawingRect()), 0.27, 0.216, 0, 0, 0.004); b.box('pl_clear', 0.29, 0.235, 0.006, 0, 0, 0.002); }), M(75.9, y + 0.98, face, 0, Math.PI, 0.05));
  // 乾掉的花束(紙包)綁在網上,地上幾支燒完的蠟燭
  for (const [x, yy] of [[70.4, 1.15], [73.6, 0.95], [78.9, 1.05]]) {
    P.add('paper', cyl(0.07, 0.015, 0.36, 8, true), M(x, y + yy, face + 0.06, 0.1, 0, Math.PI));
    for (let k = 0; k < 5; k++) P.add('leaves_dead', sph(0.035, 5, 4), M(x + (r() - 0.5) * 0.1, y + yy - 0.2 - r() * 0.06, face + 0.07 + (r() - 0.5) * 0.06));
  }
  for (let k = 0; k < 9; k++) {
    const x = X0 + 0.8 + r() * (X1 - X0 - 1.6), h = 0.02 + r() * 0.05;
    P.add('candle_wax', cyl(0.022, 0.025, h, 8), M(x, y + h / 2, FZ + 0.25 + r() * 0.2));
  }
  // ---- 207 專用發電機的電纜:地面 → 外牆 → 2F 窗框右下角 ----
  const WALL = 11.97, wy = 4.2 + 0.93;
  const pts = [new V3(80.3, y + 0.55, 5.6), new V3(80.0, y + 0.03, 6.3), new V3(79.4, y + 0.03, 8.4), new V3(78.9, y + 0.03, 10.9), new V3(78.75, y + 0.15, WALL - 0.04), new V3(78.7, y + 2.2, WALL - 0.05), new V3(78.6, wy - 0.25, WALL - 0.05), new V3(78.3, wy - 0.02, WALL - 0.05), new V3(76.6, wy + 0.03, WALL - 0.05), new V3(76.0, wy + 0.06, WALL + 0.1)];
  P.add('rubber', tube(pts, 0.022, { radial: 6, seg: 48, tension: 0.2 }));
  for (const [x, yy, zz] of [[78.71, 1.1, WALL - 0.03], [78.68, 2.4, WALL - 0.03], [78.65, 3.7, WALL - 0.03], [77.4, wy + 0.01, WALL - 0.03]]) P.add('cast_iron', box(0.07, 0.05, 0.04), M(x, yy, zz));
  // 發電機上的手寫牌(綁在把手上)
  addT(P, tpl('alley:gensign', (b) => { b.plane(L(signRect()), 0.36, 0.2, 0, 0, 0.003); b.box('pi_cardboard', 0.37, 0.21, 0.004, 0, 0, 0); }), M(82.0, y + 0.95, 5.95, 0, Math.PI + 0.06, -0.04));
  // 發電機的運轉指示燈(只有發光,不打光;不跟 207 的窗搶)
  P.add('glow_amber', sph(0.018, 8, 6), M(81.25, y + 0.92, 4.02));
  jinshuiTruck(ctx, zone); // [scene r5] 金水伯的發財車(平常藏起來,結局時顯示)
  // ---- 結局錨點:鐵網後面(北圍牆與網之間),抬頭看 207 的窗 ----
  ctx.event({ kind: 'anchor', name: 'alleyView', x: 75.4, y, z: 2.45, yaw: Math.PI - 0.042, pitch: 0.4, zone: zone?.id });
  return P;
}

// 鐵網平面:UV 用公尺(貼圖每 1m 重複)
function THREE_Plane(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

// [scene r5] 金水伯的發財車:白色小貨車(車頭在前、後面平斗 + 淺藍欄板),斗上幾箱貨與一塊帆布;車門手寫「金水商行」。
// 平常 visible = false(結局才顯示;只改 visible,不動燈)。材質都是其他車輛已用過的共用材質 → 不會多編 shader。
const doorRect = () => labRect('alley:jinshui', 112, 48, (c, w, h) => {
  c.fillStyle = '#eef0ec'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#b01e18'; c.font = 'bold 22px serif'; c.textAlign = 'center'; c.fillText('金水商行', w / 2, 26);
  c.fillStyle = '#333'; c.font = '10px sans-serif'; c.fillText('柑仔店 · 送貨 0932-xxx-207', w / 2, 42);
});
function jinshuiTruck(ctx, zone) {
  const T = new Parts();
  T.add('car_white', box(1.35, 1.5, 1.6), M(1.45, 1.2, 0));
  T.add('car_white', box(0.5, 0.55, 1.6), M(2.02, 0.72, 0));
  T.add('glass', box(0.04, 0.62, 1.42), M(2.13, 1.6, 0, 0, 0, 0.12));
  for (const s of [-1, 1]) T.add('glass', box(0.7, 0.5, 0.03), M(1.5, 1.62, s * 0.81));
  T.add('plastic_black', box(0.1, 0.18, 1.66), M(2.28, 0.55, 0));
  for (const s of [-1, 1]) { T.add('glow_white', box(0.03, 0.12, 0.2), M(2.29, 0.8, s * 0.62)); T.add('glow_red', box(0.03, 0.12, 0.14), M(-1.6, 0.75, s * 0.68)); T.add('plastic_black', box(0.12, 0.1, 0.05), M(2.05, 1.62, s * 0.86)); }
  T.add('metal_gray', box(2.85, 0.08, 1.62), M(-0.2, 0.78, 0));
  for (const s of [-1, 1]) T.add('plastic_blue', box(2.85, 0.36, 0.04), M(-0.2, 1.0, s * 0.79));
  T.add('plastic_blue', box(0.04, 0.36, 1.62), M(-1.62, 1.0, 0));
  T.add('plastic_blue', box(0.04, 0.5, 1.62), M(0.75, 1.07, 0));
  for (const [x, s] of [[1.45, -1], [1.45, 1], [-0.9, -1], [-0.9, 1]]) { T.add('tire', cyl(0.3, 0.3, 0.2, 14).rotateX(HALF), M(x, 0.3, s * 0.72)); T.add('chrome', cyl(0.14, 0.14, 0.21, 10).rotateX(HALF), M(x, 0.3, s * 0.72)); }
  for (const [x, z, w, h] of [[-0.4, -0.35, 0.6, 0.45], [-0.4, 0.35, 0.55, 0.4], [-1.05, 0.0, 0.5, 0.5], [0.25, 0.2, 0.45, 0.35]]) T.add('cardboard', box(w, h, 0.5), M(x, 0.82 + h / 2, z));
  T.add('fabric_blue', box(0.9, 0.04, 1.1), M(-1.0, 1.1, 0.0, 0, 0, 0.1));
  for (const s of [-1, 1]) addT(T, tpl('alley:jinshui', (b) => b.plane(L(doorRect()), 0.62, 0.27, 0, 0, 0.002)), M(1.42, 1.0, s * 0.802, 0, s > 0 ? 0 : Math.PI, 0));
  const g = T.group();
  g.name = 'jinshui-truck';
  g.position.set(88.6, 0, 7.0); g.rotation.y = Math.PI; // 停在鐵網東邊(不擋視線),車頭朝西對著那扇窗
  g.visible = false;
  ctx.add(g, { static: false, collide: false });
  ctx.event({ kind: 'anchor', name: 'truck', x: 88.6, y: 0, z: 7.0, yaw: Math.PI, zone: zone?.id });
}
