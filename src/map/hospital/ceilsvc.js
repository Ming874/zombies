import * as THREE from 'three';

// [scene6] 天花板設備:灑水頭、偵煙器、廣播喇叭、回風口。真實醫院的天花板幾乎每 2~4m 就有一個;沒有它們,輕鋼架天花板讀起來像空白貼圖。
// 只放在完整(沒掉板)的輕鋼架格子上,位置對齊 2/3m 的天花板格中心(和格線同一套節奏)。
// 幾何進結構的收邊桶(trim_white / trim_steel / trim_dark → TRIM_MATTE/METAL 桶,每層本來就有)→ 不新增材質與 draw call。
// 亂數用格座標雜湊,不動 shell 的 K.R 序列(其他隨機擺設不會因此改變)。
const T = 2 / 3;
const hash = (c, r, k) => { const s = Math.sin(c * 127.1 + r * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
let G = null;
// 只從下面看得到:圓盤(朝下)+ 開口圓柱側面,不做看不到的頂蓋(三角形數壓到最低;結構桶也會畫進陰影貼圖)
const disc = (r, n) => new THREE.CircleGeometry(r, n).rotateX(Math.PI / 2);
const side = (r0, r1, h, n) => new THREE.CylinderGeometry(r0, r1, h, n, 1, true);
const ring = (a, b, n) => new THREE.RingGeometry(a, b, n).rotateX(Math.PI / 2);
function geos() {
  if (G) return G;
  G = {
    ring: disc(0.038, 8), body: side(0.009, 0.011, 0.035, 5), defl: disc(0.02, 6), // 灑水頭:飾蓋、本體、迴水板
    detBase: disc(0.07, 12), det: side(0.06, 0.064, 0.03, 10), detFace: disc(0.06, 12), detLed: disc(0.005, 4), // 偵煙器
    spk: disc(0.11, 14), spkRing: ring(0.07, 0.078, 14), spkRing2: ring(0.04, 0.048, 12), // 廣播喇叭
  };
  return G;
}
const put = (B, li, key, g, x, y, z) => { _p.set(x, y, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); B.geo(li, key, g, _m); };
// 朝下的矩形(天花板上的薄片)
const down = (B, li, key, x, y, z, sx, sz) => B.flat(li, key, x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y, false, {});

// 一格(2m)輕鋼架天花板的設備。zone:該格所屬區域;yC:天花板高度
export function ceilServices(B, li, c, r, yC, zone) {
  if (!zone) return;
  const th = zone.theme, corr = th === 'corridor', g = geos();
  const x0 = c * 2, z0 = r * 2;
  const tc = (i) => i * T + T / 2; // 第 i 片板的中心
  // 灑水頭:每 2 格一個(約 4m 間距),放在中央那片板
  if ((c + r) % 2 === 0 && hash(c, r, 1) < 0.92) {
    const x = x0 + 1, z = z0 + 1;
    put(B, li, 'trim_white', g.ring, x, yC - 0.004, z);
    put(B, li, 'trim_brass', g.body, x, yC - 0.025, z);
    put(B, li, 'trim_brass', g.defl, x, yC - 0.043, z);
  }
  // 偵煙器:走廊約每 3 格、房間每 4~5 格
  if (hash(c, r, 2) < (corr ? 0.34 : 0.22)) {
    const x = x0 + tc(0), z = z0 + tc(2);
    put(B, li, 'trim_white', g.detBase, x, yC - 0.003, z);
    put(B, li, 'trim_white', g.det, x, yC - 0.019, z);
    put(B, li, 'trim_white', g.detFace, x, yC - 0.034, z);
    put(B, li, 'trim_red', g.detLed, x + 0.03, yC - 0.0345, z); // 早就不亮的指示燈
  }
  // 廣播喇叭(「不要相信廣播」):走廊約每 4 格一個,圓形白面板 + 兩圈格柵
  if (corr && hash(c, r, 3) < 0.26) {
    const x = x0 + tc(2), z = z0 + tc(0);
    put(B, li, 'trim_white', g.spk, x, yC - 0.005, z);
    put(B, li, 'trim_dark', g.spkRing, x, yC - 0.0055, z);
    put(B, li, 'trim_dark', g.spkRing2, x, yC - 0.0055, z);
  }
  // 回風口:一片板換成白框 + 百葉(後面黑)
  if (hash(c, r, 4) < (corr ? 0.12 : 0.16)) {
    const x = x0 + tc(2), z = z0 + tc(2), w = T - 0.04;
    down(B, li, 'trim_plenum', x, yC - 0.002, z, w - 0.05, w - 0.05);
    for (const [dx, dz, sx, sz] of [[0, -w / 2 + 0.015, w, 0.03], [0, w / 2 - 0.015, w, 0.03], [-w / 2 + 0.015, 0, 0.03, w - 0.06], [w / 2 - 0.015, 0, 0.03, w - 0.06]]) down(B, li, 'trim_white', x + dx, yC - 0.006, z + dz, sx, sz);
    const along = hash(c, r, 5) < 0.5;
    for (let k = 0; k < 7; k++) { const o = -w / 2 + 0.06 + k * ((w - 0.12) / 6); down(B, li, 'trim_white', x + (along ? 0 : o), yC - 0.008, z + (along ? o : 0), along ? w - 0.05 : 0.014, along ? 0.014 : w - 0.05); }
  }
}

// [scene7] 裸露管線的細節:每 5~7m 一段識別色環(黃 = 瓦斯/蒸汽、綠 = 冷卻水、紅 = 消防、白 = 給水),
// 粗管每 9m 左右一組法蘭 + 閘閥(閥體、閥桿、紅色手輪)。axis X 時 (x0, z) = 起點、z 固定;Z 時 (x, z0)。
let PG = null;
export function pipeExtras(B, li, alongX, x0, y, z0, len, rad, seed) {
  if (!PG) PG = { band: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), flange: new THREE.CylinderGeometry(1, 1, 1, 12), wheel: new THREE.TorusGeometry(0.11, 0.012, 4, 12), box: new THREE.BoxGeometry(1, 1, 1) };
  const H = (k) => { const s = Math.sin(seed * 0.0137 + k * 12.9898) * 43758.5453; return s - Math.floor(s); };
  const col = ['trim_yellow', 'trim_green', 'trim_red', 'trim_white'][(H(1) * 4) | 0];
  const at = (a) => (alongX ? [x0 + a, y, z0] : [x0, y, z0 + a]);
  const qAxis = new THREE.Quaternion().setFromEuler(alongX ? new THREE.Euler(0, 0, Math.PI / 2) : new THREE.Euler(Math.PI / 2, 0, 0)); // 圓柱 Y 軸 → 管線方向
  const rot = (g, sx, sy, sz, a, extra) => { const [x, yy, z] = at(a); _p.set(x, yy, z); _s.set(sx, sy, sz); _m.compose(_p, qAxis, _s); B.geo(li, extra?.key ?? col, g, _m); };
  for (let a = 1.5 + H(2) * 3; a < len - 0.5; a += 5 + H(a) * 2) { rot(PG.band, rad + 0.006, 0.12, rad + 0.006, a); rot(PG.band, rad + 0.006, 0.03, rad + 0.006, a + 0.14); }
  if (rad < 0.08) return;
  for (let a = 3 + H(3) * 4; a < len - 1; a += 8 + H(a + 1) * 3) {
    for (const o of [-0.18, 0.18]) rot(PG.flange, rad + 0.035, 0.03, rad + 0.035, a + o, { key: 'trim_steel' });
    rot(PG.flange, rad + 0.02, 0.3, rad + 0.02, a, { key: 'trim_dark' }); // 閥體
    const [x, yy, z] = at(a);
    _q.identity(); _p.set(x, yy - rad - 0.12, z); _s.set(0.025, 0.24, 0.025); _m.compose(_p, _q, _s); B.geo(li, 'trim_steel', PG.box, _m); // 閥桿(往下)
    _q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); _p.set(x, yy - rad - 0.25, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); B.geo(li, 'trim_red', PG.wheel, _m); // 手輪
  }
}
