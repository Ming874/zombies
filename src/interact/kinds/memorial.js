import * as THREE from 'three';
import { Model, canvasTex, texMat, FONT } from '../kit.js';
import { A, emit, burst, tone } from '../../audio/core.js';
import { THROW } from '../../story/clues.js';

// 2F 護理站「問的地方」:阿嬤的遺照、乾掉的白色康乃馨、香爐、一副筊杯(2004 年金水伯放的)。
//   看著遺照 0.8 秒 → 線索卡 hc.13(筆記本系統自己判斷);按 [E] 看遺照;筆記本填好之後按住 [E] 擲筊。
//   擲筊是本機的(多人時隊友看不到你的筊),結果交給 game.deduce.resolve();聖筊替全隊打開 207。
// 筊杯:一面平(陽,「正」)、一面圓(陰,「反」)。聖筊 = 一正一反;笑筊 = 兩正;陰筊 = 兩反。
// 材質沿用互動物件的 ix:plastic(頂點色;開機預編譯時已經在場景裡),不新增 shader;不投影、不碰燈。
const rand = (a, b) => a + Math.random() * (b - a);
const BL = 0.1, BW = 0.046, BH = 0.026; // 一片筊:長、寬、圓背的高

// 一片筊的幾何:半個橢球(圓背朝 +Y)+ 平底,平面上彎成新月形,兩端收窄
function jiaoGeometry() {
  const bend = (g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), u = Math.min(1, Math.abs(x) / 0.5), k = 1 - u * u;
      p.setXYZ(i, x * BL, p.getY(i) * BH * 2 * (0.45 + 0.55 * k), p.getZ(i) * BW * (0.5 + 0.5 * k) + 0.016 * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const dome = bend(new THREE.SphereGeometry(0.5, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const cap = new THREE.CircleGeometry(0.5, 22); cap.rotateX(Math.PI / 2);
  bend(cap);
  const n = cap.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, -1, 0); // 平面朝下
  const m = new Model();
  m.add(null, 0xffffff, dome, new THREE.Matrix4());
  m.add(null, 0xffffff, cap, new THREE.Matrix4());
  return m;
}

// 木頭碰木頭的「喀」(兩層:短促的敲擊 + 一點木頭的共鳴)
function clack(pos, k = 1) {
  if (!A.ctx) return;
  const h = emit({ pos, dur: 0.3, gain: 0.5 + 0.5 * k, room: 0.35, ref: 1.2, prio: 3 });
  if (!h) return;
  const t = h.t, f = rand(700, 980);
  burst(h.in, t, { type: 'bandpass', f: rand(1700, 2600), q: 3.5, dur: 0.028, g: 0.9 * k });
  tone(h.in, t, { type: 'triangle', f, f1: f * 0.86, dur: 0.06 + 0.04 * k, g: 0.42 * k });
  tone(h.in, t + 0.002, { type: 'sine', f: f * 2.3, dur: 0.04, g: 0.16 * k });
}
function whoosh(pos) {
  if (!A.ctx) return;
  const h = emit({ pos, dur: 0.4, gain: 0.35, room: 0.2, prio: 2 });
  if (h) burst(h.in, h.t, { type: 'bandpass', f: 900, f1: 380, q: 0.8, a: 0.06, dur: 0.22, g: 0.5 });
}

// 遺照(黑白報紙照片:二樓一扇亮著的窗,窗裡舉著紙的護理長)
function photoTex() {
  return canvasTex('memorial.photo', 192, 240, (c, w, h) => {
    c.fillStyle = '#d9d4c8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#4a4844'; c.fillRect(10, 10, w - 20, h - 56);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { c.fillStyle = r === 1 && k === 2 ? '#fff4cc' : '#2c2b28'; c.fillRect(22 + k * 40, 26 + r * 56, 26, 38); }
    c.fillStyle = '#5a564c'; c.fillRect(110, 92, 14, 30); c.beginPath(); c.arc(117, 88, 6, 0, Math.PI * 2); c.fill(); // 窗裡的人
    c.fillStyle = '#f4f0e2'; c.fillRect(104, 100, 18, 12);
    c.fillStyle = '#222'; c.font = `bold 5px ${FONT}`; c.fillText('不要怕', 106, 106); c.fillText('阿嬤', 106, 111);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.12})`; c.fillRect(10 + Math.random() * (w - 20), 10 + Math.random() * (h - 56), 1.5, 1.5); } // 網點與雜訊
    c.fillStyle = '#2a2620'; c.font = `bold 13px ${FONT}`; c.textAlign = 'center';
    c.fillText('護理長　林秀英', w / 2, h - 28); c.font = `11px ${FONT}`; c.fillText('1946 – 2003', w / 2, h - 12);
  });
}

export const memorial = {
  build(api, s, spec = {}) {
    const { kit, M, ix, game } = api;
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z, 0.12) : api.mtx(s, 0, 0.95, 0.18);
    if (!s.host) { const sh = new Model(); sh.slab(M.wood, 0x5a4636, 0, 0.92, 0.18, 0.62, 0.03, 0.34); kit.static(sh, api.mtx(s), s.li); }
    const m = new Model();
    m.box(M.wood, 0x2e2018, 0, 0.2, -0.06, 0.27, 0.34, 0.018, -0.1); // 相框(往後靠)
    m.box(M.wood, 0x2e2018, 0, 0.07, -0.1, 0.03, 0.14, 0.012, 0.5); // 相框腳架
    m.cyl(M.metal, 0x8a6a2a, 0.15, 0.025, 0.02, 0.075, 0.05, 14); // 香爐(空的)
    m.cyl(M.matte, 0x6a5a48, 0.15, 0.052, 0.02, 0.066, 0.004, 14); // 爐灰
    m.cyl(M.matte, 0xe9e4d8, -0.16, 0.05, -0.02, 0.05, 0.1, 12); // 白瓷花瓶
    for (let i = 0; i < 3; i++) { m.cyl(M.matte, 0x5a5a3a, -0.16 + (i - 1) * 0.012, 0.14, -0.02, 0.004, 0.09, 4, 0, 0, (i - 1) * 0.25); m.sph(M.matte, 0xc8b89a, -0.16 + (i - 1) * 0.026, 0.19 - Math.abs(i - 1) * 0.012, -0.02, 0.034, 8); } // 乾掉的康乃馨
    m.cyl(M.matte, 0xf2eee2, -0.07, 0.03, 0.06, 0.02, 0.06, 10); // 白蠟燭(沒點)
    kit.static(m, L, s.li);
    const pm = new Model();
    pm.quad(texMat('memorial.photo', photoTex(), { basic: true }), 0, 0.2, -0.0505, 0.235, 0.294, -0.1);
    kit.static(pm, L, s.li);
    // 筊杯(會動的兩個網格;平常躺在相框前)
    const g = jiaoGeometry();
    g.parts.forEach((p) => { p.mat = M.plastic; });
    const geo = g.geometry(M.plastic);
    const col = geo.attributes.color; for (let i = 0; i < col.count; i++) col.setXYZ(i, 0.42, 0.05, 0.035); // 朱紅漆
    const rest = [{ x: 0.03, z: 0.07, yaw: 0.35, roll: 0 }, { x: 0.075, z: 0.1, yaw: -0.2, roll: Math.PI }];
    const blocks = rest.map((r, i) => {
      const mesh = new THREE.Mesh(geo, M.plastic);
      mesh.name = 'ix-jiao' + i; mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.raycast = () => {};
      (game.hospital?.group || game.scene).add(mesh);
      api.own.push(mesh);
      return { mesh, ...r, p: new THREE.Vector3(r.x, 0, r.z), roll: r.roll, yaw: r.yaw, pitch: 0 };
    });
    game.deduce?.warmList?.push(blocks[0].mesh);
    const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4(), _w = new THREE.Vector3();
    const off = (roll) => { const c = Math.cos(roll), sn = Math.abs(Math.sin(roll)); return Math.max(BH * (1 - c) / 2, (BW / 2) * sn * 0.85); }; // 平放時底到原點的高
    const put = (b) => { _e.set(b.roll, b.yaw, b.pitch, 'YZX'); _q.setFromEuler(_e); _m.compose(b.p, _q, _s); b.mesh.matrix.multiplyMatrices(L, _m); b.mesh.matrixWorldNeedsUpdate = true; };
    const reset = () => { for (const [i, b] of blocks.entries()) { b.p.set(rest[i].x, off(rest[i].roll), rest[i].z); b.roll = rest[i].roll; b.yaw = rest[i].yaw; b.pitch = 0; put(b); } };
    reset();
    const world = (v) => { _w.copy(v).applyMatrix4(L); return { x: _w.x, y: _w.y, z: _w.z }; };
    const pos = (() => { const v = new THREE.Vector3(0, 0.2, -0.04).applyMatrix4(L); return { x: v.x, y: v.y, z: v.z }; })();
    let busy = false;

    // 擲筊動畫(約 3 秒):拿起來、合在手心、往前一拋,落在櫃台上彈兩三下,停在結果那一面(圓背朝上的會晃)
    function toss(r) {
      busy = true;
      const faces = r.result === 'sheng' ? (Math.random() < 0.5 ? [0, Math.PI] : [Math.PI, 0]) : r.result === 'xiao' ? [Math.PI, Math.PI] : [0, 0];
      const hand = new THREE.Vector3(0.02, 0.38, 0.3), g9 = 9.8;
      const st = blocks.map((b, i) => {
        const from = b.p.clone(), r0 = b.roll, y0 = b.yaw;
        const vx = rand(-0.22, 0.22) + (i ? 0.08 : -0.08), vz = rand(-0.34, -0.2), vy = rand(0.7, 1.05);
        const tl = (vy + Math.sqrt(vy * vy + 2 * g9 * (hand.y - 0.02))) / g9; // 第一次落地的時間
        return { b, from, r0, y0, tl, face: faces[i], v: new THREE.Vector3(vx, vy, vz), w: 0, wy: rand(-7, 7), tgt: 0, bounces: 0, settle: -1, rock: faces[i] === 0 ? rand(0.18, 0.3) : 0, done: false };
      });
      let t = 0, thrown = false;
      ix.tick((dt) => {
        t += dt;
        if (t < 0.55) { // 拿起來、合起來(兩片平面相對)
          const k = Math.min(1, t / 0.45), e = k * k * (3 - 2 * k);
          st.forEach((q, i) => { q.b.p.lerpVectors(q.from, hand.clone().add(new THREE.Vector3((i ? 1 : -1) * 0.012, 0, 0)), e); q.b.roll = q.r0 + (((i ? Math.PI / 2 : -Math.PI / 2) - q.r0) * e); q.b.yaw = q.y0 * (1 - e) + 1.57 * e; q.b.pitch = 0; put(q.b); });
          return true;
        }
        if (!thrown) { // 放手:轉速讓第一次落地時大約翻到結果那一面(之後彈跳再修正)
          thrown = true; whoosh(world(hand));
          st.forEach((q) => { q.r0 = q.b.roll; const spin = rand(9, 14) * (Math.random() < 0.5 ? -1 : 1), k = Math.round((q.r0 + spin * (q.tl + 0.3) - q.face) / (Math.PI * 2)); q.tgt = q.face + k * Math.PI * 2; q.w = (q.tgt - q.r0) / (q.tl + 0.3); });
        }
        const dtc = Math.min(dt, 1 / 30);
        let all = true;
        for (const q of st) {
          const b = q.b;
          if (q.done) continue;
          all = false;
          if (q.settle < 0) {
            q.v.y -= g9 * dtc;
            b.p.addScaledVector(q.v, dtc);
            b.roll += q.w * dtc; b.yaw += q.wy * dtc;
            const floor = off(b.roll);
            if (b.p.y <= floor && q.v.y < 0) {
              b.p.y = floor;
              const imp = Math.min(1, -q.v.y / 3);
              clack(world(b.p), 0.35 + imp * 0.65);
              q.bounces++;
              q.v.y = -q.v.y * (q.bounces === 1 ? 0.34 : 0.22); q.v.x *= 0.5; q.v.z *= 0.5; q.wy *= 0.45;
              q.w = q.w * 0.5 + rand(-2, 2);
              if (q.bounces >= 3 || q.v.y < 0.18) { q.settle = 0; q.rs = b.roll; q.tgtN = q.tgt + Math.round((b.roll - q.tgt) / (Math.PI * 2)) * Math.PI * 2; }
            }
          } else { // 停下來:翻到結果那一面;圓背朝上的會左右晃幾下
            q.settle += dtc;
            const k = Math.min(1, q.settle / 0.32), e = 1 - (1 - k) ** 3;
            b.p.x += q.v.x * dtc * (1 - k); b.p.z += q.v.z * dtc * (1 - k);
            const wob = q.rock ? q.rock * Math.exp(-q.settle / 0.33) * Math.sin(q.settle * 19) : 0;
            b.roll = q.rs + (q.tgtN - q.rs) * e + wob;
            b.yaw += q.wy * dtc * (1 - k);
            b.p.y = off(b.roll);
            if (q.settle > 0.32 && Math.abs(q.rs - q.tgtN) > 0.6 && !q.tick2) { q.tick2 = true; clack(world(b.p), 0.3); } // 翻面時再碰一下
            if (q.settle > 1.1) { b.roll = q.tgtN; b.p.y = off(b.roll); q.done = true; }
          }
          put(b);
        }
        if (all || t > THROW.anim + 0.6) { busy = false; game.deduce?.resolve?.(r, pos); return false; }
        return true;
      });
    }

    const D = () => game.deduce;
    const e = ix.register(pos, {
      id: spec.id || 'h.ix.memorial', kind: 'memorial', name: '阿嬤的遺照', reach: 2.1, radius: 0.16, scope: 'map', priority: 8, hold: 0,
      prompt: () => {
        const d = D();
        if (busy) { e.hold = 0; e.onTap = null; return { text: '擲筊中……', dim: true }; }
        if (d && d.ready() && !d.solved()) { e.hold = THROW.hold; e.onTap = view; e.tapText = '看遺照'; e.holdText = '擲筊（問阿嬤對不對）'; return '擲筊'; }
        e.hold = 0; e.onTap = null;
        return d && !d.solved() && d.filled() > 0 ? '看阿嬤的照片（筆記本還有空格）' : '看阿嬤的照片';
      },
      onUse: (ctx) => {
        if (busy) return false;
        const d = D();
        if (e.hold > 0 && d?.ready() && !d.solved()) { const r = d.throw(); if (r) toss(r); return; }
        return view(ctx);
      },
      reset: () => { busy = false; reset(); },
    });
    function view() { api.note('h.c13'); return true; }
    return e;
  },
};

// 3F 監控室的錄影機:2003/5/5 23:40～23:55 的 CAM-07(hc.05);要監控室有電
export const cctv = {
  build(api, s, spec = {}) {
    const { kit, M, ix } = api;
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z) : api.mtx(s, 0, 0.78, 0.28);
    if (!s.host) { const d = new Model(); d.slab(M.wood, 0x6a5a48, 0, 0.74, 0.28, 0.8, 0.04, 0.5); for (const sx of [-1, 1]) d.slab(M.metal, 0x555555, sx * 0.36, 0, 0.28, 0.04, 0.74, 0.46); kit.static(d, api.mtx(s), s.li); api.box(s, -0.4, 0.04, 0.4, 0.53, 0.78); }
    const m = new Model();
    m.slab(M.plastic, 0x1e1e20, 0, 0, 0, 0.36, 0.08, 0.26); // 錄影機
    m.box(M.matte, 0x0a0a0a, -0.06, 0.04, 0.131, 0.16, 0.022, 0.004); // 卡匣口
    m.box(M.glow, 0x3aff7a, 0.12, 0.05, 0.131, 0.03, 0.008, 0.002); // 電源燈
    m.slab(M.plastic, 0x2a2a2a, 0, 0.08, -0.02, 0.34, 0.28, 0.26); // 小螢幕
    m.box(M.matte, 0x0e1210, 0, 0.22, 0.111, 0.28, 0.2, 0.004);
    kit.static(m, L, s.li);
    const v = new THREE.Vector3(0, 0.12, 0.13).applyMatrix4(L), pos = { x: v.x, y: v.y, z: v.z };
    return ix.register(pos, {
      id: spec.id || 'h.ix.cctv', kind: 'cctv', name: '錄影帶 2003/5/5', reach: 1.9, radius: 0.18, scope: 'map', hold: 1.0, holdText: '播放', prompt: '播放錄影帶 2003/5/5', cooldown: 2,
      when: () => (spec.power && !ix.flags.has(spec.power) ? '錄影機 · 沒有電' : true),
      onUse: () => {
        api.ixs.switchClick?.(pos, true);
        api.note('h.c05');
        ix.flags.set('h.cctv.seen', true);
        ix.after(6, () => api.game.deduce?.talk?.([['收音機 · 小美', '……快轉。我不想看人打架。', 2.8]]));
      },
    });
  },
};
