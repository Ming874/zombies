// Rocketbox(3ds Max Biped「Bip01」約 80 根骨骼)→ 遊戲殭屍骨架(src/zombies/model.js 的 22 根 BONES)。
// 1. 把來源骨架擺成遊戲的靜止姿勢(手臂自然下垂、腿打直、腳掌保持原本的平貼地面、手指微彎成爪)
// 2. 在這個姿勢下做一次 CPU 蒙皮,烘出頂點位置/法線(之後骨骼旋轉全為單位、方向對齊世界軸)
// 3. 蒙皮權重從 Bip01 重新對應到 22 根骨骼(手指→手、腳趾→腳、Spine/Spine1→spine、Spine2→chest、臉部骨骼→head/jaw)
// 4. 22 根骨骼的頭尾取自擺好姿勢後的來源關節位置(骨架與網格吻合)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// 與 src/zombies/model.js 的 BONES 相同順序(執行期載入時會核對)
export const BONES = [
  'root', 'hips', 'spine', 'belly', 'chest', 'neck', 'head', 'jaw',
  'clavL', 'upperArmL', 'forearmL', 'handL', 'clavR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];
const PARENT = { root: null, hips: 'root', spine: 'hips', belly: 'spine', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', clavL: 'chest', upperArmL: 'clavL', forearmL: 'upperArmL', handL: 'forearmL', clavR: 'chest', upperArmR: 'clavR', forearmR: 'upperArmR', handR: 'forearmR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 遊戲骨架靜止姿勢的肢段方向(model.js makeRig;s = +1 左、-1 右)
const DIR = (s) => ({
  upperArm: V(0.04 * s, -0.285, -0.025), forearm: V(0.022 * s, -0.255, 0.03), hand: V(0.006 * s, -0.18, 0.012),
  thigh: V(0.006 * s, -0.435, 0.014), shin: V(0.006 * s, -0.425, -0.044),
});

// 來源骨骼(去掉 Bip01_ 前綴)→ 目標骨骼;陣列 = 權重拆給多根
const LIMB = { Clavicle: 'clav', UpperArm: 'upperArm', Forearm: 'forearm', Hand: 'hand', Thigh: 'thigh', Calf: 'shin', Foot: 'foot' };
function rule(n) {
  if (n === 'Bip01' || n === 'Pelvis') return 'hips';
  if (n === 'Spine' || n === 'Spine1') return 'spine';
  if (/^Spine\d$/.test(n)) return 'chest';
  if (/^Neck\d*$/.test(n)) return 'neck';
  if (n === 'Head') return 'head';
  if (/^(MJaw|MBottomLip|[LR]MouthBottom|MTongue)$/.test(n)) return 'jaw';
  if (/^[LR]MouthCorner$/.test(n)) return [['head', 0.5], ['jaw', 0.5]];
  const m = /^([LR])_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe\d+)$/.exec(n);
  if (m) return (/^Finger/.test(m[2]) ? 'hand' : /^Toe/.test(m[2]) ? 'foot' : LIMB[m[2]]) + m[1];
  return null;
}
const short = (b) => b.name.replace(/^Bip01_/, '');

export function loadFBX(buf) {
  const mgr = new THREE.LoadingManager();
  // 貼圖另外處理(TGA 在建置腳本解碼):FBXLoader 只拿到空貼圖,也不會碰 DOM
  const stub = { load: () => new THREE.Texture(), setPath() { return this; }, setCrossOrigin() { return this; } };
  mgr.addHandler(/\.(tga|png|jpe?g|bmp|tiff?|dds)$/i, stub);
  const root = new FBXLoader(mgr).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  root.updateMatrixWorld(true);
  let sm = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
  if (!sm) throw new Error('FBX 裡沒有蒙皮網格');
  return { root, sm };
}

const wpos = (b) => b.getWorldPosition(new THREE.Vector3());
const wquat = (b) => b.getWorldQuaternion(new THREE.Quaternion());
// 對骨骼施加一個世界座標的旋轉(子骨骼跟著轉)
function rotateWorld(b, q) {
  const pw = wquat(b.parent);
  b.quaternion.premultiply(pw.clone().invert().multiply(q).multiply(pw));
  b.updateMatrixWorld(true);
}
function aim(b, child, dir) {
  const cur = wpos(child).sub(wpos(b)).normalize();
  rotateWorld(b, new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()));
}
function setWorldQuat(b, wq) {
  b.quaternion.copy(wquat(b.parent).invert().multiply(wq));
  b.updateMatrixWorld(true);
}

// opt:{ curl: [根, 中, 末](手指彎曲弧度)、thumb: [..];curlR/curlL、thumbR/thumbL 分左右(倖存者右手握槍) }
export function conform({ root, sm }, opt = {}) {
  const sk = sm.skeleton, by = {};
  for (const b of sk.bones) by[short(b)] = b;
  const need = ['Pelvis', 'Spine', 'Spine2', 'Neck', 'Head', 'MJaw', 'LEye', 'REye', 'MUpperLip', 'MBottomLip'];
  for (const s of ['L', 'R']) for (const k of ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Finger1', 'Finger2', 'Finger4', 'Thigh', 'Calf', 'Foot', 'Toe0']) need.push(s + '_' + k);
  const miss = need.filter((n) => !by[n]);
  if (miss.length) throw new Error('缺少 Bip01 骨骼:' + miss.join(', '));

  // ---- 1. 擺姿勢 ----
  const footQ = { L: wquat(by.L_Foot), R: wquat(by.R_Foot) };
  for (const S of ['L', 'R']) {
    const s = S === 'L' ? 1 : -1, D = DIR(s), b = (k) => by[S + '_' + k];
    aim(b('Thigh'), b('Calf'), D.thigh);
    aim(b('Calf'), b('Foot'), D.shin);
    setWorldQuat(b('Foot'), footQ[S]); // 腳掌維持原本平貼地面的方向
    aim(b('UpperArm'), b('Forearm'), D.upperArm);
    aim(b('Forearm'), b('Hand'), D.forearm);
    aim(b('Hand'), b('Finger2'), D.hand);
    // 手指往掌心彎(殭屍的爪):沿「手指方向 × 掌心法線」的軸轉
    const handDir = wpos(b('Finger2')).sub(wpos(b('Hand'))).normalize();
    const lateral = wpos(b('Finger1')).sub(wpos(b('Finger4'))).normalize();
    const palm = new THREE.Vector3().crossVectors(handDir, lateral).normalize().multiplyScalar(s);
    const chains = [['Finger1', 'Finger11', 'Finger12'], ['Finger2', 'Finger21', 'Finger22'], ['Finger3', 'Finger31', 'Finger32'], ['Finger4', 'Finger41', 'Finger42']];
    const curl = (S === 'R' ? opt.curlR : opt.curlL) || opt.curl || [0.3, 0.5, 0.4];
    chains.forEach((ch, f) => {
      for (let j = 0; j < ch.length; j++) {
        const bone = b(ch[j]);
        if (!bone) break;
        const next = ch[j + 1] ? b(ch[j + 1]) : null;
        const dir = next ? wpos(next).sub(wpos(bone)) : wpos(bone).sub(wpos(bone.parent));
        const axis = new THREE.Vector3().crossVectors(dir.normalize(), palm).normalize();
        if (axis.lengthSq() < 0.5) continue;
        rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, curl[j] * (1 + f * 0.12)));
      }
    });
    const th = (S === 'R' ? opt.thumbR : opt.thumbL) || opt.thumb || [0.1, 0.2, 0.2];
    ['Finger0', 'Finger01', 'Finger02'].forEach((n, j) => {
      const bone = b(n), next = j < 2 ? b(['Finger0', 'Finger01', 'Finger02'][j + 1]) : null;
      if (!bone) return;
      const dir = next ? wpos(next).sub(wpos(bone)) : wpos(bone).sub(wpos(bone.parent));
      const axis = new THREE.Vector3().crossVectors(dir.normalize(), palm).normalize();
      if (axis.lengthSq() > 0.5) rotateWorld(bone, new THREE.Quaternion().setFromAxisAngle(axis, th[j]));
    });
  }
  root.updateMatrixWorld(true);

  // ---- 2. CPU 蒙皮(公分、Y 向上)----
  const g = sm.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const bindInv = sm.bindMatrixInverse, M = [], NM = [];
  for (let i = 0; i < sk.bones.length; i++) {
    const m = new THREE.Matrix4().multiplyMatrices(sm.matrixWorld, bindInv).multiply(sk.bones[i].matrixWorld).multiply(sk.boneInverses[i]).multiply(sm.bindMatrix);
    M.push(m);
    NM.push(new THREE.Matrix3().getNormalMatrix(m));
  }
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), acc = new THREE.Vector3(), nacc = new THREE.Vector3();
  let minY = Infinity;
  for (let i = 0; i < n; i++) {
    acc.set(0, 0, 0); nacc.set(0, 0, 0);
    let tw = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (w <= 0) continue;
      const j = SI.getComponent(i, k);
      acc.addScaledVector(v.fromBufferAttribute(P, i).applyMatrix4(M[j]), w);
      nacc.addScaledVector(nv.fromBufferAttribute(N, i).applyMatrix3(NM[j]), w);
      tw += w;
    }
    if (tw <= 0) throw new Error('頂點沒有蒙皮權重 #' + i);
    acc.divideScalar(tw);
    nacc.normalize();
    pos[i * 3] = acc.x; pos[i * 3 + 1] = acc.y; pos[i * 3 + 2] = acc.z;
    nor[i * 3] = nacc.x; nor[i * 3 + 1] = nacc.y; nor[i * 3 + 2] = nacc.z;
    if (acc.y < minY) minY = acc.y;
  }
  // 公分 → 公尺,腳底貼地
  const U = 0.01;
  for (let i = 0; i < n; i++) { pos[i * 3] *= U; pos[i * 3 + 1] = (pos[i * 3 + 1] - minY) * U; pos[i * 3 + 2] *= U; }
  const J = (name) => { const p = wpos(by[name]); return V(p.x * U, (p.y - minY) * U, p.z * U); };

  // ---- 3. 權重重新對應 ----
  const map = sk.bones.map((b) => {
    for (let o = b; o && o.isBone; o = o.parent) {
      const r = rule(short(o));
      if (r) return typeof r === 'string' ? [[BI[r], 1]] : r.map(([t, w]) => [BI[t], w]);
      if (short(o) === 'Head') return [[BI.head, 1]];
      if (o.parent && o.parent.isBone && short(o.parent) === 'Head') return [[BI.head, 1]]; // 其他臉部骨骼
    }
    return [[BI.hips, 1]];
  });
  const isEye = sk.bones.map((b) => /^[LR]Eye$/.test(short(b)));
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), eye = new Float32Array(n), dom = new Uint8Array(n);
  const tmp = new Float64Array(BONES.length);
  for (let i = 0; i < n; i++) {
    tmp.fill(0);
    let e = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (w <= 0) continue;
      const j = SI.getComponent(i, k);
      for (const [t, f] of map[j]) tmp[t] += w * f;
      if (isEye[j]) e += w;
    }
    const top = [...tmp.keys()].filter((t) => tmp[t] > 1e-4).sort((a, b) => tmp[b] - tmp[a]).slice(0, 4);
    let tot = 0;
    for (const t of top) tot += tmp[t];
    top.forEach((t, k) => { joints[i * 4 + k] = t; weights[i * 4 + k] = tmp[t] / tot; });
    eye[i] = Math.min(1, e);
    dom[i] = top[0];
  }

  // ---- 4. 骨架(公尺,模型空間,靜止姿勢)----
  const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  const eyeMid = mid(J('LEye'), J('REye'));
  const head = {};
  head.root = [V(0, 0, 0), V(0, 0.5, 0)];
  const pelvis = J('Pelvis'), spine = J('Spine'), chest = J('Spine2'), neck = J('Neck'), hd = J('Head');
  // 頭頂:頭部權重為主的頂點最高點
  let topY = 0;
  for (let i = 0; i < n; i++) if (dom[i] === BI.head && pos[i * 3 + 1] > topY) topY = pos[i * 3 + 1];
  head.hips = [V(0, pelvis.y, pelvis.z), V(0, spine.y, spine.z)];
  head.spine = [V(0, spine.y, spine.z), V(0, chest.y, chest.z)];
  head.belly = [V(0, spine.y - 0.02, spine.z), V(0, spine.y - 0.02, spine.z + 0.1)];
  head.chest = [V(0, chest.y, chest.z), V(0, neck.y, neck.z)];
  head.neck = [V(0, neck.y, neck.z), V(0, hd.y, hd.z)];
  head.head = [V(0, hd.y, hd.z), V(0, topY, hd.z + 0.01)];
  const jaw = J('MJaw'), lip = J('MBottomLip');
  head.jaw = [V(0, jaw.y, jaw.z), V(0, lip.y - 0.035, lip.z - 0.005)];
  for (const S of ['L', 'R']) {
    const j = (k) => J(S + '_' + k);
    // 手掌末端:手部權重為主的頂點沿手掌方向最遠處
    const wr = j('Hand'), hdir = j('Finger2').sub(wr).normalize();
    let reach = 0.08;
    for (let i = 0; i < n; i++) if (dom[i] === BI['hand' + S]) { const d = (pos[i * 3] - wr.x) * hdir.x + (pos[i * 3 + 1] - wr.y) * hdir.y + (pos[i * 3 + 2] - wr.z) * hdir.z; if (d > reach) reach = d; }
    // 腳尖:腳部權重為主的頂點最前方(貼地高度)
    const an = j('Foot');
    let toeZ = an.z + 0.12, toeX = an.x;
    for (let i = 0; i < n; i++) if (dom[i] === BI['foot' + S] && pos[i * 3 + 2] > toeZ) { toeZ = pos[i * 3 + 2]; toeX = pos[i * 3]; }
    head['clav' + S] = [j('Clavicle'), j('UpperArm')];
    head['upperArm' + S] = [j('UpperArm'), j('Forearm')];
    head['forearm' + S] = [j('Forearm'), j('Hand')];
    head['hand' + S] = [wr, wr.clone().addScaledVector(hdir, reach)];
    head['thigh' + S] = [j('Thigh'), j('Calf')];
    head['shin' + S] = [j('Calf'), an];
    head['foot' + S] = [an, V(toeX, 0.02, toeZ)];
  }
  const bones = BONES.map((name) => ({ name, parent: PARENT[name], head: head[name][0], tail: head[name][1] }));
  const HC = V(0, eyeMid.y - 0.012, eyeMid.z - 0.08);
  const mouth = mid(J('MUpperLip'), J('MBottomLip'));

  // ---- 體型參數(給 autoHitboxes 與動畫用)----
  const s = (pelvis.y + neck.y) / (0.97 + 1.47);
  const sw = Math.abs(head.upperArmL[0].x) / (0.18 * s), hip = Math.abs(head.thighL[0].x) / (0.092 * s);
  // 胸腔厚度、上臂粗細:主要權重在該骨骼的頂點
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < n; i++) if (dom[i] === BI.chest && Math.abs(pos[i * 3]) < 0.08) { const z = pos[i * 3 + 2]; if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
  const fat = THREE.MathUtils.clamp((zMax - zMin - 0.03) / (0.22 * s), 0.85, 1.35);
  const ua = head.upperArmL, ax = ua[1].clone().sub(ua[0]).normalize(), rr = [];
  for (let i = 0; i < n; i++) {
    if (dom[i] !== BI.upperArmL) continue;
    const d = V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(ua[0]), t = d.dot(ax) / ua[1].distanceTo(ua[0]);
    if (t > 0.3 && t < 0.75) rr.push(d.addScaledVector(ax, -d.dot(ax)).length()); // 上臂中段(避開肩膀)
  }
  rr.sort((a, b) => a - b);
  const g2 = THREE.MathUtils.clamp((rr[Math.floor(rr.length * 0.5)] || 0.05) / (0.05 * s), 0.75, 1.3);
  const Pm = { s: +s.toFixed(4), sw: +sw.toFixed(3), hip: +hip.toFixed(3), fat: +fat.toFixed(3), g: +g2.toFixed(3), head: 1, neck: 1, belly: 0, arm: 1 };

  return {
    count: n, pos, nor, uv: UV.array, joints, weights, eye, dom,
    groups: g.groups.map((x) => ({ start: x.start, count: x.count, mat: x.materialIndex })),
    materials: [].concat(sm.material).map((m) => m.name),
    bones, HC, mouth, eyes: [J('LEye'), J('REye')], P: Pm,
    joints3: { lip: J('MUpperLip'), lipLo: lip, nose: J('MNose'), cheekL: J('LCheek'), cheekR: J('RCheek'), jaw, neck, chest, spine, pelvis, head: hd },
  };
}
