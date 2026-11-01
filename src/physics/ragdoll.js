import * as THREE from 'three';
import { SHAPE } from './core.js';

// 殭屍布娃娃:死亡當下依骨骼姿勢建立剛體(骨盆、腰椎、胸、頭頸、上臂、前臂、大腿、小腿),
// 形狀取自 model.js 的命中盒(已依體型/類型縮放:巨屍粗壯沉重、膽腫者肚子大、無腿爬行者沒有腿)。
// 關節:球窩(三軸角度限制)與鉸鏈(膝/肘);限制以骨骼本地軸表示,正負號對應 zombie.js 的動畫慣例:
//   X 屈伸(大腿 <0 往前抬、小腿 >0 屈膝、上臂 <0 往前舉、前臂 <0 屈肘、脊椎/頭 >0 往前彎)
//   Y 扭轉;Z 外展(左側 >0 往外,右側鏡像)。死亡當下的姿勢若超出限制,限制會自動放寬到涵蓋當下(避免彈跳)。
const PARTS = [
  { bone: 'hips' },
  { bone: 'spine', parent: 'hips', lim: [[-0.45, 0.8], [-0.35, 0.35], [-0.35, 0.35]] },
  { bone: 'chest', parent: 'spine', lim: [[-0.35, 0.6], [-0.4, 0.4], [-0.3, 0.3]] },
  { bone: 'neck', parent: 'chest', lim: [[-0.7, 0.95], [-1.0, 1.0], [-0.55, 0.55]] },
  { bone: 'upperArmL', parent: 'chest', via: ['clavL'], lim: [[-2.5, 1.0], [-1.0, 1.0], [-0.5, 2.3]] },
  { bone: 'forearmL', parent: 'upperArmL', hinge: [-2.5, 0.02] },
  { bone: 'upperArmR', parent: 'chest', via: ['clavR'], lim: [[-2.5, 1.0], [-1.0, 1.0], [-2.3, 0.5]] },
  { bone: 'forearmR', parent: 'upperArmR', hinge: [-2.5, 0.02] },
  { bone: 'thighL', parent: 'hips', leg: true, lim: [[-1.9, 0.5], [-0.55, 0.55], [-0.25, 0.95]] },
  { bone: 'shinL', parent: 'thighL', leg: true, hinge: [0, 2.5] },
  { bone: 'thighR', parent: 'hips', leg: true, lim: [[-1.9, 0.5], [-0.55, 0.55], [-0.95, 0.25]] },
  { bone: 'shinR', parent: 'thighR', leg: true, hinge: [0, 2.5] },
];
// 每種殭屍的物理參數:密度(kg/m³)、關節阻尼(肌肉張力殘留)、形狀縮放
const TYPE = {
  walker: { den: 1000, fric: 1.2 },
  runner: { den: 980, fric: 0.9 },
  crawler: { den: 950, fric: 1.2 },
  bloater: { den: 900, fric: 1.8 },
  brute: { den: 1150, fric: 2.0 },
};

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), I = new THREE.Quaternion();
const tiny = (bone, k) => { bone.matrixWorld.decompose(_p, _q, _s); return _s.x < k * 0.05; };

// 依目前骨骼姿勢產生布娃娃描述。alloc() 取得剛體槽位;回傳 { parts, joints, rec } 或 null
export function buildRagdoll(z, alloc) {
  const b = z.b, V = z.V, T = TYPE[z.type] || TYPE.walker;
  if (!b || !b.hips || !V) return null;
  z.root.updateMatrixWorld(true);
  b.root.matrixWorld.decompose(_p, _q, _s);
  const k = _s.x;
  const rec = { z, k, Pr: _p.clone(), QrInv: _q.clone().invert(), parts: [], map: {}, slots: [] };
  const hb = {};
  for (const h of V.hitboxes) hb[h.bone] = h;
  const legless = !!V.P.legless;

  for (const def of PARTS) {
    if (def.leg && legless) continue;
    const bone = b[def.bone];
    const parent = def.parent ? rec.map[def.parent] : null;
    if (!bone || (def.parent && !parent) || tiny(bone, k)) continue; // 斷肢(骨骼縮到 0)或父段不存在:不建
    bone.matrixWorld.decompose(_p, _q, _s);
    const part = { def, bone, parent, pos: _p.clone(), quat: _q.clone(), qInv: _q.clone().invert(), via: (def.via || []).map((n) => b[n]), shapes: [], wq: new THREE.Quaternion(), slot: alloc() };
    const add = (type, dims, src, lpos, lquat = I) => {
      // 形狀在來源骨骼本地座標(lpos/lquat,模型單位)→ 世界 → 本剛體座標(公尺)
      _v.copy(lpos).applyMatrix4(src.matrixWorld).sub(part.pos).applyQuaternion(part.qInv);
      src.matrixWorld.decompose(_w, _q2, _s);
      _q3.copy(part.qInv).multiply(_q2.multiply(lquat));
      part.shapes.push(type, dims[0], dims[1] ?? 0, dims[2] ?? 0, _v.x, _v.y, _v.z, _q3.x, _q3.y, _q3.z, _q3.w);
    };
    const fromHit = (boneName, shrink = 0.92) => {
      const h = hb[boneName], src = b[boneName];
      if (!h || !src || tiny(src, k)) return false;
      if (h.kind === 'box') add(SHAPE.BOX, [h.scl.x * k * 0.5 * shrink, h.scl.y * k * 0.5 * shrink, h.scl.z * k * 0.5 * shrink], src, h.pos);
      else if (h.kind === 'sphere') add(SHAPE.BALL, [((h.scl.x + h.scl.y + h.scl.z) / 3) * k * 0.95], src, h.pos);
      else {
        const r = h.scl.x * k * 0.9, len = h.scl.y * k;
        add(SHAPE.CAPSULE, [Math.max(0.01, len / 2 - r), r], src, h.pos, h.quat || I);
      }
      return true;
    };
    const n = def.bone;
    if (n === 'neck') { fromHit('neck', 0.8); fromHit('head'); }
    else if (n.startsWith('forearm')) { fromHit(n); fromHit('hand' + n.slice(-1), 0.85); }
    else if (n.startsWith('shin')) {
      fromHit(n);
      const foot = b['foot' + n.slice(-1)], rb = V.rig.bones[V.rig.index['foot' + n.slice(-1)]];
      if (foot && rb && !tiny(foot, k)) { // 腳掌:沿腳骨方向的扁盒
        const d = rb.tail.clone().sub(rb.head), len = d.length();
        const s = V.P.s;
        add(SHAPE.BOX, [0.045 * s * k, 0.035 * s * k, (len / 2 + 0.03 * s) * k], foot, d.clone().multiplyScalar(0.5).add(_w.set(0, -0.025 * s, 0)), new THREE.Quaternion().setFromUnitVectors(Z, d.normalize()));
      }
    } else fromHit(n);
    if (!part.shapes.length) { // 沒有命中盒的骨骼:用骨頭長度做一段膠囊
      const rb = V.rig.bones[V.rig.index[n]];
      const d = rb.tail.clone().sub(rb.head);
      add(SHAPE.CAPSULE, [Math.max(0.01, (d.length() * k) / 2 - 0.05), 0.05], bone, d.clone().multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
    }
    rec.parts.push(part);
    rec.map[n] = part;
    rec.slots.push(part.slot);
  }
  if (!rec.parts.length) return null;

  // 關節:錨點 = 子骨骼起點(世界)換到父剛體座標
  const joints = [];
  for (const part of rec.parts) {
    if (!part.parent) continue;
    const pa = part.parent;
    _v.copy(part.pos).sub(pa.pos).applyQuaternion(pa.qInv);
    const j = { a: pa.slot, b: part.slot, a1: [_v.x, _v.y, _v.z], a2: [0, 0, 0] };
    _q.copy(pa.qInv).multiply(part.quat); // 子相對父(含中間沒剛體的骨骼)
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const ang = (c) => 2 * Math.asin(Math.max(-1, Math.min(1, c)));
    if (part.def.hinge) {
      const a = 2 * Math.atan2(_q.x, _q.w);
      j.hinge = [Math.min(part.def.hinge[0], a - 0.05), Math.max(part.def.hinge[1], a + 0.05)];
    } else {
      // 角度限制是以相對旋轉四元數的虛部逐軸量測,接近 ±180° 時不可靠(會翻轉而爆衝):
      // 限制最多到 ±2.5;當下姿勢已超過 2.4 的軸就不設限制(該軸自由轉動)
      const cur = [ang(_q.x), ang(_q.y), ang(_q.z)];
      j.lim = part.def.lim.map(([lo, hi], i) => (Math.abs(cur[i]) > 2.4 ? null : [Math.max(-2.5, Math.min(lo, cur[i] - 0.05)), Math.min(2.5, Math.max(hi, cur[i] + 0.05))]));
    }
    joints.push(j);
  }

  // 初速:殭屍當下的移動速度(衝刺中被打死會往前撲)
  const vx = z.vel?.x || 0, vz = z.vel?.z || 0;
  const parts = rec.parts.map((p) => ({
    slot: p.slot, p: [p.pos.x, p.pos.y, p.pos.z, p.quat.x, p.quat.y, p.quat.z, p.quat.w], v: [vx, 0, vz, 0, 0, 0], shapes: p.shapes, den: T.den,
    ev: p.def.bone === 'chest' || p.def.bone === 'hips' || p.def.bone === 'neck' ? 1 : 0, // 撞擊聲(門檻在建立時依質量換算)
  }));
  rec.type = T;
  // 鬆弛的下巴與手腕(死後肌肉放鬆)
  if (b.jaw) b.jaw.rotation.x = Math.max(b.jaw.rotation.x, 0.25 + Math.random() * 0.25);
  return { parts, joints, rec, opts: { fric: T.fric, maxT: z.type === 'brute' ? 8 : 6.5 } };
}

// 把各部位剛體的(插值後)世界姿態寫回骨骼:骨盆寫位置+旋轉,其餘只寫旋轉(骨長固定,不會被拉長)
// vis:Float32Array,每個槽位 7 個數 [x,y,z,qx,qy,qz,qw]
export function applyRagdoll(rec, vis) {
  for (const part of rec.parts) {
    const o = part.slot * 7;
    _q.set(vis[o + 3], vis[o + 4], vis[o + 5], vis[o + 6]);
    part.wq.copy(_q);
    if (!part.parent) {
      part.bone.position.set(vis[o], vis[o + 1], vis[o + 2]).sub(rec.Pr).applyQuaternion(rec.QrInv).divideScalar(rec.k);
      part.bone.quaternion.copy(rec.QrInv).multiply(_q);
    } else {
      _q2.copy(part.parent.wq);
      for (const vb of part.via) _q2.multiply(vb.quaternion);
      part.bone.quaternion.copy(_q2.invert()).multiply(_q);
    }
  }
}

// 子彈命中點最近的部位(給衝量用)
export function nearestPart(rec, vis, x, y, z) {
  let best = rec.parts[0], bd = Infinity;
  for (const p of rec.parts) {
    const o = p.slot * 7, d = (vis[o] - x) ** 2 + (vis[o + 1] - y) ** 2 + (vis[o + 2] - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export { _m as _scratchMatrix };
