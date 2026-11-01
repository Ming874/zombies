import * as THREE from 'three';
import { sfx } from './audio.js';
import { paintTexture } from './sys/texworker.js';

// 錢(STORY_v2 §3.4):回來的人身上還有生前的零錢與鈔票,打倒後掉在地上;燈篙熄的時候一起算。
// 不發光、不旋轉、不飛:地上就是幾張摺起來的鈔票和幾枚銅板,燈篙暗下時就地淡掉、算進你的錢(看不到的那些也一樣算)。
// 介面沿用舊的金幣堆(drop / collectAll / update / clear / total / onGain / pendingDone / collecting),
// 呼叫端(擊殺獎勵、互動物件、連線)不用改。
// 鈔票與銅板:貼圖在 Worker 畫(src/mats/cash.paint.js;風格化設計、舊、褪色、摺痕),鈔票是對摺後一半翹起來的彎折面、
// 銅板是有浮雕面與滾花邊的圓片。兩種材質都只有 map(和互動/道具標籤圖集同一組 shader 參數 → 共用 program,不新增)。
const ATLAS = paintTexture('mats/cash:atlas', { seed: 2003 }, { wrap: false, anisotropy: 8 });
const R = (x0, y0, x1, y1) => [x0 / 1024, 1 - y1 / 512, x1 / 1024, 1 - y0 / 512]; // 圖集像素框 → UV(v 向上)
const BILL_UV = [R(6, 10, 506, 246), R(518, 10, 1018, 246), R(6, 266, 506, 502)]; // 百元(紅)、五百(褐)、千元(藍)
// 對摺的鈔票:長 150mm、寬 70mm;一半平貼地面,另一半以 lift 弧度翹起(摺線處圓滑),正反兩面
function billGeo(uv, lift, curl) {
  const N = 20, L = 0.15, Wd = 0.07, H = N / 2, pos = [], tex = [], idx = [];
  // 從摺線往兩邊走:平的那半貼地(末端微翹 curl),另一半在摺線附近 15mm 內轉到 lift 弧度
  const pts = new Array(N + 1);
  pts[H] = [0, 0.0012];
  for (let i = H + 1, x = 0, y = 0.0012; i <= N; i++) { const a = Math.max(0, (i - N + 3) / 3) * curl; x += (L / N) * Math.cos(a); y += (L / N) * Math.sin(a); pts[i] = [x, y]; }
  for (let i = H - 1, x = 0, y = 0.0012, k = 1; i >= 0; i--, k++) { const a = lift * Math.min(1, k / 2.2); x -= (L / N) * Math.cos(a); y += (L / N) * Math.sin(a); pts[i] = [x, y]; }
  for (let side = 0; side < 2; side++) {
    const b = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N, [x, y] = pts[i];
      for (const v of [0, 1]) { pos.push(x, y - side * 0.0003, (v - 0.5) * Wd); tex.push(uv[0] + u * (uv[2] - uv[0]), uv[1] + v * (uv[3] - uv[1])); }
    }
    for (let i = 0; i < N; i++) {
      const p0 = b + i * 2, p1 = p0 + 2;
      if (side) idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); else idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const BILL_GEOS = BILL_UV.map((uv, i) => [billGeo(uv, 2.75 - i * 0.12, 0.05), billGeo(uv, 0.18 + i * 0.05, -0.03)]); // 對摺(半開)、攤開微彎
// 銅板:十元(白銅,26mm)、五十元(黃銅,28mm);面 = 圖集裡的浮雕圓,側面 = 滾花條
function coinGeo(r, h, cx) {
  const g = new THREE.CylinderGeometry(r, r, h, 20, 1);
  const uv = g.attributes.uv, n = g.attributes.normal, cu = cx / 1024, cv = 1 - 384 / 512, ru = 112 / 1024, rv = 112 / 512;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, cu + (uv.getX(i) - 0.5) * 2 * ru * 0.98, cv + (uv.getY(i) - 0.5) * 2 * rv * 0.98);
    else uv.setXY(i, (997 + uv.getY(i) * 22) / 1024, 1 - (270 + uv.getX(i) * 226) / 512);
  }
  return g;
}
const COIN_GEOS = [coinGeo(0.013, 0.0024, 636), coinGeo(0.014, 0.0026, 876)];
const BILL_MAT = new THREE.MeshStandardMaterial({ map: ATLAS, roughness: 0.86, metalness: 0, name: 'cash:bill' });
const COIN_MAT = new THREE.MeshStandardMaterial({ map: ATLAS, roughness: 0.55, metalness: 0.85, name: 'cash:coin' }); // 舊銅板:一層手垢,不是鏡面

export class Coins {
  constructor(scene) {
    this.scene = scene;
    this.piles = [];
    this.collecting = false;
    this.onGain = null; // (amount, pile) => void
    this.player = null;
    this.world = null;
    this.pendingDone = null;
  }

  get total() { return this.piles.reduce((s, p) => s + p.count, 0); }

  // 在 (x,z) 掉 n 元;附近已有一堆就疊上去
  drop(x, y, z, n = 5) {
    for (const p of this.piles) {
      if (!p.flying && Math.hypot(p.group.position.x - x, p.group.position.z - z) < 0.6 && Math.abs(p.group.position.y - y) < 1) { this._add(p, n); return p; }
    }
    const group = new THREE.Group();
    group.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    group.rotation.y = Math.random() * 6.28;
    const pile = { group, count: 0, flying: false, t: 0, delay: 0, items: 0 };
    this.scene.add(group);
    this.piles.push(pile);
    this._add(pile, n);
    return pile;
  }

  // 多少錢 → 看起來有幾張鈔票、幾枚銅板(最多 4 張、5 枚;多的只算錢)
  _add(pile, n) {
    pile.count += n;
    const bills = Math.min(4, Math.floor(pile.count / 12)), coins = Math.min(5, 1 + Math.floor((pile.count % 12) / 3));
    const put = (bill) => {
      const m = bill ? new THREE.Mesh(BILL_GEOS[(Math.random() * 3) | 0][Math.random() < 0.6 ? 0 : 1], BILL_MAT) : new THREE.Mesh(COIN_GEOS[Math.random() < 0.7 ? 0 : 1], COIN_MAT);
      const r = Math.random() * 0.16, a = Math.random() * 6.28, k = pile.items++;
      m.position.set(Math.cos(a) * r, (bill ? 0.0005 : 0.0013) + k * 0.0012, Math.sin(a) * r);
      m.rotation.set(bill ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * 0.06, Math.random() * 6.28, bill ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * 0.06);
      m.castShadow = false; m.receiveShadow = true;
      pile.group.add(m);
    };
    while ((pile.nb || 0) < bills) { pile.nb = (pile.nb || 0) + 1; put(true); }
    while ((pile.nc || 0) < coins) { pile.nc = (pile.nc || 0) + 1; put(false); }
  }

  // 燈篙熄:地上的錢一起算(就地淡掉,不飛)
  collectAll() {
    this.collecting = true;
    this.piles.forEach((p, i) => { p.flying = true; p.t = 0; p.delay = Math.min(0.6, i * 0.04); });
    if (!this.piles.length) this.collecting = false;
  }

  update(dt) {
    for (let i = this.piles.length - 1; i >= 0; i--) {
      const p = this.piles[i];
      if (!p.flying) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt / 0.6;
      p.group.scale.setScalar(Math.max(0.01, 1 - p.t * p.t)); // 慢慢縮掉(像被撿走)
      if (p.t >= 1) {
        if (i % 3 === 0) sfx.coin(i);
        if (this.onGain) this.onGain(p.count, p);
        this.scene.remove(p.group);
        this.piles.splice(i, 1);
      }
    }
    if (this.collecting && this.piles.length === 0) {
      this.collecting = false;
      if (this.pendingDone) { const f = this.pendingDone; this.pendingDone = null; f(); }
    }
  }

  clear() {
    for (const p of this.piles) this.scene.remove(p.group);
    this.piles.length = 0;
    this.collecting = false;
  }
}
