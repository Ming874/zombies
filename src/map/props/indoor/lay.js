import * as THREE from 'three';
import { B, tpl, compose } from './geo.js';
import { placeM } from './place.js';
import { scatter } from './clutter.js';

// 擺設輔助:旋轉模板、沿牆排列、燭光/螢幕登記、可推動道具…

// 模板繞 Y 轉 90°(長邊改成沿著牆放)
export function rotY(t, a = Math.PI / 2) {
  return tpl(`${t.name}@r${a.toFixed(3)}`, (b) => {
    b.add(t, 0, 0, 0, 0, a, 0);
    const m = compose(0, 0, 0, 0, a, 0);
    if (t.meta.coll) b.meta.coll = t.meta.coll.clone().applyMatrix4(m);
    if (t.meta.flames) b.meta.flames = t.meta.flames.map(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(m); return [v.x, v.y, v.z]; });
    if (t.meta.noise) b.meta.noise = t.meta.noise;
  });
}

// 區域邊界(公尺)
export function bounds(R) { return { x0: R.c0 * 2, x1: (R.c1 + 1) * 2, z0: R.r0 * 2, z1: (R.r1 + 1) * 2 }; }

// 沿牆段依序排一串模板:items = [tpl | {t, gap, mount, collide, after}],from 起點偏移
export function lineUp(R, run, items, o = {}) {
  let pos = run.t0 + (o.from ?? 0.15);
  const out = [];
  for (const it of items) {
    const t = it.t || it;
    const w = t.bbox.max.x - t.bbox.min.x;
    if (pos + w > run.t1 - (o.end ?? 0.1)) break;
    const p = R.atWall(t, run, pos + w / 2, { gap: it.gap ?? o.gap ?? 0.04, mount: it.mount, collide: it.collide ?? o.collide });
    if (p) out.push(p);
    pos += w + (it.space ?? o.space ?? 0.08);
  }
  return out;
}

// 燭火/燈:模板 meta.flames → 登記燈光(合併成一盞代表燈,避免太多)
export function registerFlames(R, p, o = {}) {
  const fl = p.t.meta.flames;
  if (!fl || !fl.length) return;
  let sx = 0, sy = 0, sz = 0;
  for (const [x, y, z] of fl) { const v = new THREE.Vector3(x, y, z).applyMatrix4(p.M); sx += v.x; sy += v.y; sz += v.z; }
  const n = fl.length;
  R.light({ x: sx / n, y: sy / n + 0.05, z: sz / n, color: o.color ?? 0xffa040, intensity: o.intensity ?? Math.min(6, 1.2 + n * 0.5), distance: o.distance ?? 5, kind: 'candle', flicker: o.flicker ?? 0.6 });
}

// 雜訊螢幕:模板 meta.noise = [[x,y,z,w,h], ...] → 實例化動態雜訊四邊形
const NOISE_T = () => tpl('noisequad', (b) => { b.plane('pi_noise', 1, 1, 0, 0, 0); b.meta.cap = 256; });
export function noiseScreens(R, p) {
  const list = p.t.meta.noise;
  if (!list) return;
  const t = NOISE_T();
  for (const [x, y, z, w, h] of list) {
    const M = p.M.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, 1)));
    R.inst('noise', t, M);
  }
}
// 單一雜訊畫面(世界座標 + 偏航)
export function noiseAt(R, x, y, z, yaw, w, h) { R.inst('noise', NOISE_T(), placeM(x, y, z, yaw, 0, 0, 1).multiply(new THREE.Matrix4().makeScale(w, h, 1))); }

// 在 p 的頂面隨機放可推動的小道具(瓶罐、書…);dyn 參數同 R.dyn
export function dynOnTop(R, p, t, dyn, u = null, v = null, i = 0) {
  const tp = p.t.tops[i];
  if (!tp) return null;
  const pos = R.onTop(p, u ?? R.rand(0.2, 0.8), v ?? R.rand(0.2, 0.8), i);
  return R.dyn(t, pos.x, pos.z, p.yaw + R.rand(-0.5, 0.5), dyn, { y: pos.y });
}

// 地上小物散布(多種)
export function litter(R, spec) { for (const [name, n, o] of spec) scatter(R, name, n, o || {}); }

// 房間內某點是否在區域內、而且可走
export function inside(R, x, z) { const k = R.idx(x, z); return k >= 0 && R.inZone[k] === 1; }

export { B, tpl, placeM };
