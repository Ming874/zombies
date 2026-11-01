import * as THREE from 'three';

// 新類型的外觀描述(model.js 的 buildShape 讀取;純計算、不碰 DOM,可在建模 Worker 執行)。
// 每個類型:
//   body(r) → P 身材(同 model.js BODY)、fem 女性機率、skins 膚色表、hair/longHair 頭髮機率、hand 手掌比例、curl(r) 手指彎曲
//   skinL(L, r, col)      調整皮膚參數(屍斑、血管、新鮮度)
//   wounds(o)             傷口({ r, wound, surf, L, P, B, HC, V, tShape, ty })
//   head(H, r, P)         頭型參數(下顎、眼窩、嘴唇…)
//   outfits(K) → { 名稱: fn }、outfit:可選服裝名稱
//   extras(K)             其他部件(器械、面罩、束帶…)與 L.paint(逐頂點額外上色;alpha > 1 = 餘燼自發光)
//   armor                 胸/腹命中盒算護甲(T.bodyArmor)
// K 是 buildShape 內的整組建模工具(見 model.js「新類型:外觀描述拿到整組建模工具」)。

const tc = new THREE.Color(), tc2 = new THREE.Color();
const C = (h) => new THREE.Color(h);
const STEEL = C('#b9bec4'), STEEL_D = C('#5a5e62'), RUST = C('#5a2a12'), DRYB = C('#2c0805'), WETB = C('#4a0404');
const EMBER = C('#ff5a10'), CHAR0 = C('#0d0a09'), CHAR1 = C('#2a1a12'), RAW = C('#6a1612'), BLISTER = C('#8a7a4a');
const THREAD = C('#14100e'), RUBBER = C('#121212'), LEATHER = C('#3a2618');

// 線段距離平方(縫線、裂口)
function seg2(x, y, z, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - ax - abx * t, dy = y - ay - aby * t, dz = z - az - abz * t;
  return dx * dx + dy * dy + dz * dz;
}
// 刀刃:扁平、往尖端收窄(沿 a→b),單側開刃
function bladeGeo(K, a, b, w, th, front) {
  return K.tube(a, b, (t, q) => {
    const k = 1 - Math.pow(t, 2.2), c = Math.cos(q), s = Math.sin(q);
    const edge = c > 0 ? 1 : 0.55; // 刀背較薄
    return [c * w * k * edge, s * th * (0.35 + 0.65 * k)];
  }, { cols: 8, rows: 7, capA: 0.6, capB: 0.15, front });
}
// 金屬上色:鋼色 + 刮痕 + 血(越靠刀尖越多)
const metalPaint = (K, base, bloodK, ax, ay, az, len) => (x, y, z, nx, ny, nz, i, out) => {
  const c = tc.copy(base).multiplyScalar(0.8 + K.fbm(x * 90, y * 90, z * 90, 2) * 0.35);
  const along = len ? Math.min(1, Math.hypot(x - ax, y - ay, z - az) / len) : 0.5;
  const b = K.sstep(0.35, 0.75, K.fbm(x * 28 + 3, y * 28, z * 28, 3) + along * bloodK * 0.9);
  c.lerp(b > 0.5 ? WETB : DRYB, b * bloodK);
  c.lerp(RUST, K.sstep(0.3, 0.6, K.fbm(x * 40, y * 40 + 9, z * 40, 2)) * 0.25);
  out[0] = c.r; out[1] = c.g; out[2] = c.b; out[3] = 1;
};

export const LOOKS = {
  // ====================== 尖叫者 ======================
  screamer: {
    body: (r) => ({ s: r.range(1.0, 1.07), sw: r.range(0.88, 0.95), hip: 0.94, g: r.range(0.72, 0.78), fat: r.range(0.82, 0.87), musc: 0, belly: 0, thin: 1, arm: 1.08, neck: 0.8, head: r.range(0.98, 1.02) }),
    fem: 0.6, skins: ['pale', 'blue', 'pale'], hair: 0.9, longHair: 0.85, decayed: true,
    curl: (r) => [r.range(0.05, 0.2), r.range(0.2, 0.4), r.range(0.15, 0.3)], // 手指張開成爪
    skinL: (L) => { L.veins = 0.9; L.mottle = 0.95; L.livor = 0.9; L.fresh = 0.35; L.dirt = 0.25; L.marble = 0.9; L.lidUp = 0.8; },
    wounds: ({ r, wound }) => {
      for (let i = 0; i < 3; i++) wound('gash', r.pick(['neck', 'arm', 'arm']), 0.012); // 自己抓出來的抓痕
      wound('bite', 'arm', 0.026);
      if (r.chance(0.5)) wound('gash', 'torso', 0.02);
    },
    head: (H) => { H.thin = 1; H.sock = 1.55; H.cheek = 1.3; H.jaw = 0.58; H.mouthW = 1.3; H.lips = -0.6; H.nose = 0.7; H.decay = 1; H.brow = 0.7; },
    outfits: (K) => ({
      nightgown: () => { // 及小腿的薄睡袍,胸前一大片血
        const color = K.r.pick(['#d8d0c4', '#c8b8b8', '#b8c0c4']);
        const o = { color, dirt: K.r.range(0.45, 0.7), wear: K.r.range(0.18, 0.28), hem: 0.045, off: 0.012, loose: 0.007 };
        K.top({ ...o, y0: 1.0, y1: 1.49, sleeve: 0.12, cut: (x, y, z) => (z > 0 ? K.sstep(0.004, 0.012, Math.hypot(x, (y - 1.5) * 1.2) - 0.09) : 1) });
        K.skirt({ ...o, hem: K.r.range(0.32, 0.42) });
        K.L.clothBlood.push({ c: K.V(0, 1.32, 0.12), r: 0.11, drip: 0.5, sq: 0.5, k: 3 });
      },
    }),
    outfit: ['nightgown', 'nightgown', 'gown'],
    extras: (K) => {
      const { HC, hg, V, sstep, G } = K;
      // 長舌頭從脫臼的嘴裡垂出來
      const m0 = V(HC.x, HC.y + hg.my - 0.012, HC.z + hg.mouthZ - 0.045);
      const pts = [m0, m0.clone().add(V(0, -0.004, 0.04)), m0.clone().add(V(0.004, -0.03, 0.065)), m0.clone().add(V(0.008, -0.07, 0.07))];
      const tg = K.prim(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.011, 8, false));
      tg.scale(1, 1, 1);
      const tp = tg.attributes.position.array, tn = tg.attributes.normal.array;
      for (let i = 0; i < tp.length; i += 3) { const k = 0.55 + 0.45 * sstep(m0.y - 0.08, m0.y, tp[i + 1]); tp[i] = m0.x + (tp[i] - m0.x) * (1 + (1 - k) * 0.3); tp[i + 2] += tn[i + 2] * -0.004 * (1 - k); }
      K.add(tg, 'skin', 'jaw', (x, y, z, nx, ny, nz, i, out) => { const c = tc.set('#5a1a28').lerp(tc2.set('#2a0610'), sstep(m0.y, m0.y - 0.07, y) * 0.7); out[0] = c.r; out[1] = c.g; out[2] = c.b; out[3] = 1; });
      // 病患手環
      const fa = K.B('forearmL'), wp = fa.head.clone().lerp(fa.tail, 0.93);
      K.add(K.prim(new THREE.TorusGeometry(K.prof(K.foreR, 0.93) + 0.004, 0.0045, 5, 16), K.mat4(wp, [Math.PI / 2, 0, 0], [1, 1, 1.3])), 'gear', 'forearmL', K.solid('#e8e4d8', 0.1));
      // 嘴角撕裂到臉頰(格拉斯哥微笑)
      const my = HC.y + hg.my, mz = HC.z + 0.075;
      const prev = K.L.paint;
      K.L.paint = (x, y, z, nx, ny, nz, part, c, wet) => {
        if (prev) wet = prev(x, y, z, nx, ny, nz, part, c, wet);
        if (part !== 'head' || z < mz - 0.03) return wet;
        let k = 0;
        for (const s of [1, -1]) k = Math.max(k, G(seg2(x, y, z, HC.x + s * 0.02, my, mz + 0.012, HC.x + s * 0.052, my + 0.022, mz - 0.012), 0.0035));
        c.lerp(K.FLESH_DARK, k * 0.95);
        return Math.max(wet, k);
      };
    },
  },

  // ====================== 潛行者 ======================
  stalker: {
    body: (r) => ({ s: r.range(1.04, 1.1), sw: 0.9, hip: 0.9, g: r.range(0.64, 0.7), fat: 0.8, musc: 0.15, belly: 0, thin: 1, arm: 1.32, neck: 0.78, head: 0.93 }),
    fem: 0, skins: ['blue', 'pale'], hair: 0.06, longHair: 0, hand: 1.45, decayed: true,
    curl: (r) => [r.range(0.5, 0.7), r.range(0.8, 1.0), r.range(0.6, 0.8)],
    skinL: (L) => { L.veins = 1; L.mottle = 1; L.livor = 0.5; L.fresh = 0.2; L.dirt = 0.5; L.livid.set('#2a2a40'); L.marble = 1; L.lidUp = 0.6; L.lidLo = 2.5; },
    wounds: ({ wound, r }) => { wound('gash', 'torso', 0.02); wound('bite', r.pick(['arm', 'leg']), 0.025); },
    head: (H) => { H.thin = 1; H.sock = 1.7; H.cheek = 1.45; H.jaw = 0.56; H.mouthW = 1.4; H.lips = -0.6; H.nose = 0; H.decay = 1; H.brow = 1.5; H.h *= 1.06; },
    outfits: (K) => ({
      tatters: () => K.bottom({ color: '#4a4238', len: 0.16, dirt: 0.95, wear: 0.12, hem: 0.05, off: 0.01, waist: 0.97 }),
    }),
    outfit: ['tatters'],
    extras: (K) => {
      const { V, B, tShape, ty, sstep } = K;
      // 背上突出的脊椎骨節
      for (let k = 0; k < 11; k++) {
        const y = 1.02 + k * 0.042, zb = tShape(ty(y), -Math.PI / 2)[1];
        const g = K.prim(new THREE.SphereGeometry(1, 8, 6), K.mat4(V(0, y, zb - 0.004), [0, 0, 0], [0.011, 0.014, 0.012]));
        K.add(g, 'skin', y > 1.29 ? 'chest' : 'spine', K.skinPainter('torso'));
      }
      // 指甲:長而黑的爪(手指末端上色已處理;這裡加深整個手掌末端)
      const prev = K.L.paint;
      K.L.paint = (x, y, z, nx, ny, nz, part, c, wet) => {
        if (prev) wet = prev(x, y, z, nx, ny, nz, part, c, wet);
        if (part === 'hand') { const h = B(x > 0 ? 'handL' : 'handR'); const d = h.head.y - y; c.lerp(tc.set('#0c0a0a'), sstep(0.11, 0.17, d * (1 / 1.0)) * 0.9); }
        // 皮膚緊繃在骨頭上:凹處更暗
        c.multiplyScalar(0.85 + 0.15 * sstep(-0.4, 0.4, ny));
        return wet;
      };
    },
  },

  // ====================== 手術者 ======================
  surgeon: {
    body: (r) => ({ s: r.range(0.98, 1.05), sw: r.range(1.0, 1.06), hip: 1, g: r.range(0.9, 0.98), fat: r.range(0.9, 0.98), musc: 0.3, belly: 0, thin: 0.55, arm: 1.04, neck: 1, head: 1 }),
    fem: 0.25, skins: ['pale', 'rot', 'jaundice'], hair: 0.2, longHair: 0,
    curl: () => [1.45, 1.6, 1.35], // 握拳(刀刃從手背長出來)
    skinL: (L) => { L.veins = 0.5; L.fresh = 0.9; L.dirt = 0.2; L.livor = 0.6; },
    wounds: ({ wound, L, V, tShape, ty, r }) => {
      // 胸口被撐開的開胸傷口(肋骨外露)
      const zf = tShape(ty(1.3), Math.PI / 2)[1];
      L.wounds.push({ kind: 'ribs', c: V(0, 1.3, zf), n: V(0, 0, 1), r: 0.075, k: 7 });
      L.blood.push({ c: V(0, 1.3, zf), r: 0.12, drip: 0.45, k: 3 });
      L.clothBlood.push({ c: V(0, 1.25, zf + 0.02), r: 0.16, drip: 0.5, sq: 0.6, k: 4 });
      wound('gash', 'arm', 0.02); wound('gash', 'neck', 0.015);
      if (r.chance(0.6)) wound('skull', 'head', 0.03);
    },
    head: (H) => { H.decay = 0.6; H.lips = 0.75; },
    outfits: (K) => ({
      opgown: () => { // 前面敞開的手術袍(露出撐開的胸腔)+ 手術褲 + 手術帽
        const color = K.r.pick(['#6e8f9a', '#7a9a8a', '#8a9aa8']);
        K.top({ color, y0: 0.98, y1: 1.5, sleeve: 0.35, dirt: 0.5, wear: 0.24, hem: 0.035, off: 0.016, loose: 0.007, cut: (x, y, z) => (z > 0 ? K.sstep(0.01, 0.03, Math.abs(x) - 0.1 - (y - 1.0) * 0.05) : 1) });
        K.skirt({ color, dirt: 0.55, wear: 0.24, hem: K.r.range(0.6, 0.68), cut: (x, y, z) => (z > 0 ? K.sstep(0.01, 0.03, Math.abs(x) - 0.08) : 1) });
        K.bottom({ color: '#4f7f8f', len: 1, dirt: 0.45, wear: 0.3, loose: 0.007, off: 0.016 });
        K.dome(0.008, (x, y, z) => y > (z > 0 ? 0.062 : 0.0), 'cloth', K.clothPaint({ userData: {} }, { color: '#8fb6c8', dirt: 0.35, wear: 0.5 }));
        K.setShoes('clog');
        for (let i = 0; i < 4; i++) { const s = K.surf('torso'); K.L.clothBlood.push({ c: s.p.addScaledVector(s.n, 0.02), r: K.r.range(0.05, 0.1), drip: K.r.range(0.1, 0.4), sq: 0.6, k: i * 7 }); }
      },
    }),
    outfit: ['opgown'],
    extras: (K) => {
      const { V, B, r, tShape, ty, sstep, G } = K;
      // ---- 手術刀刃:從手背長出,沿前臂方向延伸 ----
      const blades = [];
      for (const s of [1, -1]) {
        const Ls = s > 0 ? 'L' : 'R', fa = B('forearm' + Ls), hd = B('hand' + Ls);
        const dir = hd.tail.clone().sub(fa.head).normalize();
        const n = s > 0 || r.chance(0.4) ? 1 : 2; // 右手有時是兩片短刃
        for (let k = 0; k < n; k++) {
          const len = n === 1 ? r.range(0.34, 0.42) : 0.24;
          const side = V(s, 0, 0).addScaledVector(dir, -dir.x * s).normalize();
          const a = fa.head.clone().lerp(fa.tail, 0.75).addScaledVector(side, n === 1 ? 0.012 : (k - 0.5) * 0.03).add(V(0, 0, 0.018));
          const b = a.clone().addScaledVector(dir, len + 0.18);
          blades.push([a, b]);
          const g = bladeGeo(K, a, b, 0.017, 0.0032, V(0, 0, 1));
          K.add(g, 'metal', 'hand' + Ls, metalPaint(K, STEEL, 0.9, a.x, a.y, a.z, len + 0.18));
        }
        // 固定刀刃的金屬夾箍 + 螺絲
        const cp = fa.head.clone().lerp(fa.tail, 0.8);
        K.add(K.prim(new THREE.TorusGeometry(K.prof(K.foreR, 0.8) + 0.007, 0.006, 6, 18), K.mat4(cp, [Math.PI / 2, 0, 0], [1, 1, 1.2])), 'metal', 'forearm' + Ls, metalPaint(K, STEEL_D, 0.5, 0, 0, 0, 0));
        for (let k = 0; k < 3; k++) K.add(K.prim(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 6), K.mat4(cp.clone().add(V(Math.cos(k * 2.1) * 0.04, 0, Math.sin(k * 2.1) * 0.04)), [0, 0, Math.PI / 2])), 'metal', 'forearm' + Ls, metalPaint(K, STEEL_D, 0.3, 0, 0, 0, 0));
      }
      // ---- 開胸器:兩支勾住肋骨的鉤片 + 橫桿 ----
      const zf = tShape(ty(1.3), Math.PI / 2)[1];
      for (const s of [1, -1]) {
        K.add(K.prim(new THREE.BoxGeometry(0.012, 0.09, 0.03), K.mat4(V(s * 0.05, 1.3, zf + 0.008), [0, s * 0.3, 0])), 'metal', 'chest', metalPaint(K, STEEL, 0.7, 0, 1.3, zf, 0.1));
      }
      K.add(K.prim(new THREE.BoxGeometry(0.16, 0.012, 0.01), K.mat4(V(0, 1.355, zf + 0.03))), 'metal', 'chest', metalPaint(K, STEEL, 0.3, 0, 1.355, zf, 0.2));
      K.add(K.prim(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), K.mat4(V(0.085, 1.355, zf + 0.03), [0, 0, Math.PI / 2])), 'metal', 'chest', metalPaint(K, STEEL_D, 0.2, 0, 0, 0, 0));
      // ---- 夾在皮膚上的止血鉗 ----
      for (let k = 0; k < 3; k++) {
        const s = K.surf(k ? 'arm' : 'neck');
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), s.n);
        const m = new THREE.Matrix4().compose(s.p.clone().addScaledVector(s.n, 0.02), q, V(1, 1, 1));
        const g = K.prim(new THREE.BoxGeometry(0.006, 0.05, 0.004), m);
        const ring = K.prim(new THREE.TorusGeometry(0.008, 0.002, 4, 10), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.03, 0)));
        const bone = k ? (s.p.x > 0 ? (s.p.y > 1.2 ? 'upperArmL' : 'forearmL') : s.p.y > 1.2 ? 'upperArmR' : 'forearmR') : 'neck';
        K.add(K.mergeGeometries([g, ring]), 'metal', bone, metalPaint(K, STEEL, 0.4, 0, 0, 0, 0));
      }
      // ---- 縫線:沿幾條切口畫黑線 + 交叉針腳 ----
      const sutures = [];
      for (let k = 0; k < 4; k++) {
        const s = K.surf(r.pick(['torso', 'arm', 'neck']));
        const d = V(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        d.addScaledVector(s.n, -d.dot(s.n)).normalize();
        const len = r.range(0.05, 0.12);
        sutures.push([s.p.clone().addScaledVector(d, -len / 2), s.p.clone().addScaledVector(d, len / 2), len]);
      }
      // 手腕刀刃根部的縫合處
      for (const [a] of blades) sutures.push([a.clone().add(V(0, 0.02, -0.01)), a.clone().add(V(0, -0.03, -0.01)), 0.05]);
      const prev = K.L.paint;
      K.L.paint = (x, y, z, nx, ny, nz, part, c, wet) => {
        if (prev) wet = prev(x, y, z, nx, ny, nz, part, c, wet);
        for (const [a, b, len] of sutures) {
          const d2 = seg2(x, y, z, a.x, a.y, a.z, b.x, b.y, b.z);
          if (d2 > 0.0004) continue;
          const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y) + (z - a.z) * (b.z - a.z)) / (len * len);
          const cut = G(d2, 0.0022), stitch = G(d2, 0.006) * sstep(0.7, 0.95, Math.abs(Math.sin(t * len * 520)));
          c.lerp(K.FLESH_DARK, cut * 0.9);
          c.lerp(THREAD, stitch * 0.9);
          wet = Math.max(wet, cut * 0.8);
        }
        return wet;
      };
    },
  },

  // ====================== 焦屍 ======================
  burned: {
    body: (r) => ({ s: r.range(0.95, 1.02), sw: 0.98, hip: 0.95, g: r.range(0.8, 0.88), fat: 0.86, musc: 0.15, belly: 0, thin: 0.85, arm: 1, neck: 0.88, head: 0.96 }),
    fem: 0.2, skins: ['dark'], hair: 0.08, longHair: 0, decayed: true,
    curl: () => [1.35, 1.55, 1.25], // 拳擊姿勢(熱收縮)的握拳
    skinL: (L, r) => { L.veins = 0; L.livor = 0; L.mottle = 0.5; L.fresh = 0.6; L.dirt = 0.1; L.burnK = r() * 50; L.burnLo = r.range(0.25, 0.45); L.putre = 0; L.marble = 0; L.slip = 0; },
    wounds: ({ wound }) => { wound('burn', 'torso', 0.08); wound('burn', 'arm', 0.07); wound('skull', 'head', 0.035); },
    head: (H) => { H.lips = -0.6; H.nose = 0; H.decay = 1; H.sock = 1.2; H.cheek = 0.8; H.thin = 0.9; },
    outfits: (K) => ({
      charred: () => { // 燒到只剩殘片的衣物
        K.top({ color: '#1a1410', y0: 0.95, sleeve: K.r.range(0.2, 0.6), dirt: 0.9, wear: K.r.range(0.02, 0.1), hem: 0.06, off: 0.012 });
        K.bottom({ color: '#16120e', len: K.r.range(0.4, 0.9), dirt: 0.9, wear: K.r.range(0.0, 0.08), hem: 0.06 });
      },
    }),
    outfit: ['charred'],
    extras: (K) => {
      const { L, sstep, noise3, fbm, HC } = K;
      const k = L.burnK, lo = L.burnLo;
      const prev = L.paint;
      // 焦黑外殼 + 裂縫(脊狀雜訊)透出餘燼光 + 幾處生肉與水泡;小腿以下燒得較輕
      L.paint = (x, y, z, nx, ny, nz, part, c, wet) => {
        if (prev) wet = prev(x, y, z, nx, ny, nz, part, c, wet);
        const sev = sstep(0.15, lo + 0.25, y) * 0.75 + 0.25;
        const n1 = fbm(x * 7 + k, y * 7, z * 7, 3);
        const charK = sstep(-0.35, 0.15, n1 + sev - 0.6);
        c.lerp(tc.copy(CHAR1).lerp(CHAR0, sstep(-0.2, 0.3, fbm(x * 22, y * 22 + k, z * 22, 2))), Math.min(1, charK * 1.1));
        const raw = sstep(0.34, 0.46, fbm(x * 11 + 40, y * 11, z * 11 + k, 3)) * sev;
        if (raw > 0) { c.lerp(RAW, raw * 0.6); wet = Math.max(wet, raw * 0.9); }
        const bl = sstep(0.55, 0.6, noise3(x * 70 + k, y * 70, z * 70)) * (1 - charK) * sev;
        if (bl > 0) c.lerp(BLISTER, bl * 0.7);
        // 裂縫:1 - |噪聲| 的稜線
        const ridge = 1 - Math.abs(noise3(x * 16 + k, y * 13, z * 16));
        const crack = sstep(0.94, 0.985, ridge) * charK * sev * sstep(-0.1, 0.2, fbm(x * 3 + k, y * 3, z * 3, 2));
        if (part === 'head' && y > HC.y + 0.06) c.lerp(K.BONE, sstep(0.0, 0.3, fbm(x * 30, y * 30, z * 30, 2) + 0.15) * 0.6); // 頭頂燒穿露出頭骨
        if (crack > 0.05) {
          c.lerp(EMBER, crack);
          const glow = crack * (0.35 + 0.45 * sstep(-0.2, 0.4, fbm(x * 5, y * 5 + k, z * 5, 2)));
          return 1 + Math.min(0.8, glow);
        }
        return Math.min(wet, 1);
      };
    },
  },

  // ====================== 防護衣士兵 ======================
  hazmat: {
    body: (r) => ({ s: r.range(1.0, 1.06), sw: 1.12, hip: 1.08, g: 1.12, fat: 1.12, musc: 0.4, belly: 0.12, thin: 0, arm: 1.02, neck: 1.25, head: 1.0 }),
    fem: 0, skins: ['rot', 'blue'], hair: 0, longHair: 0, armor: true, noLids: true,
    curl: () => [0.9, 1.2, 1.0],
    skinL: (L) => { L.fresh = 0.4; L.veins = 0.6; },
    wounds: ({ wound }) => { wound('bite', 'arm', 0.03); wound('gash', 'torso', 0.03); wound('bite', 'leg', 0.03); },
    head: (H) => { H.decay = 0.5; },
    outfits: (K) => ({
      hazmat: () => {
        const color = K.r.pick(['#c9b23c', '#c9b23c', '#d4d4c8', '#55603f']);
        const o = { color, dirt: K.r.range(0.45, 0.65), wear: K.r.range(0.32, 0.4), hem: 0.03, loose: 0.012, tight: 0.55 };
        K.top({ ...o, y0: 0.86, sleeve: 0.98, off: 0.03 });
        K.bottom({ ...o, len: 1, off: 0.034, waist: 1.04 });
        // 頭罩:整顆頭包住,只留臉的位置給面罩
        K.dome(0.022, (x, y, z) => !(z > 0.02 && y < 0.07 && y > -0.12 && Math.abs(x) < 0.07) && y > -0.13, 'cloth', K.clothPaint({ userData: {} }, { ...o, wear: 0.6 }));
        K.gloves.v = RUBBER.clone();
        K.setShoes('boot');
      },
    }),
    outfit: ['hazmat'],
    extras: (K) => {
      const { V, HC, H, r, B } = K;
      // 防彈板背心
      K.vest({ color: '#2a2e26', off: 0.056, plates: 1, molle: 1, pouches: [-0.08, 0, 0.08], radio: r.chance(0.5) ? 1 : 0 });
      // 防毒面具:黑色橡膠面殼(頭部網格外推裁出臉部)
      K.dome(0.014, (x, y, z) => z > 0.025 && y < 0.072 && y > -0.118 && Math.abs(x) < 0.078, 'gear', (x, y, z, nx, ny, nz, i, out) => {
        const v = 0.7 + K.fbm(x * 60, y * 60, z * 60, 2) * 0.5; out[0] = 0.05 * v; out[1] = 0.05 * v; out[2] = 0.055 * v; out[3] = 1;
      });
      // 兩片圓形鏡片(其中一片有裂痕)
      const ey = HC.y + 0.014, ez = HC.z + 0.1 * H.d + 0.006;
      const cracked = r.chance(0.6) ? (r.chance(0.5) ? 1 : -1) : 0;
      for (const s of [1, -1]) {
        const p = V(HC.x + s * 0.032 * H.w, ey, ez);
        const g = K.prim(new THREE.CylinderGeometry(0.021, 0.021, 0.006, 20), K.mat4(p, [Math.PI / 2 - 0.1, 0, 0]));
        const crack = cracked === s;
        K.add(g, 'lens', 'head', (x, y, z, nx, ny, nz, i, out) => {
          const c = tc.set('#1a2420');
          if (crack) { const a = Math.atan2(y - p.y, x - p.x); c.lerp(tc2.set('#b8c0b8'), K.sstep(0.93, 0.99, Math.abs(Math.sin(a * 5 + Math.hypot(x - p.x, y - p.y) * 120)))); }
          out[0] = c.r; out[1] = c.g; out[2] = c.b; out[3] = 1;
        });
        K.add(K.prim(new THREE.TorusGeometry(0.022, 0.0035, 6, 20), K.mat4(p.clone().add(V(0, 0, 0.002)), [-0.1, 0, 0])), 'gear', 'head', K.solid('#1c1c1c', 0.2));
      }
      // 濾毒罐(左下)與呼氣閥
      const fp = V(HC.x + 0.035, HC.y - 0.07, HC.z + 0.105 * H.d);
      K.add(K.prim(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 18, 3), K.mat4(fp, [Math.PI / 2 - 0.5, 0.45, 0])), 'gear', 'head', (x, y, z, nx, ny, nz, i, out) => {
        const c = tc.set('#3c4430').multiplyScalar(0.75 + 0.3 * Math.abs(Math.sin((y + z) * 260))); out[0] = c.r; out[1] = c.g; out[2] = c.b; out[3] = 1;
      });
      K.add(K.prim(new THREE.CylinderGeometry(0.018, 0.022, 0.02, 14), K.mat4(V(HC.x - 0.01, HC.y - 0.075, HC.z + 0.1 * H.d), [Math.PI / 2, 0, 0])), 'gear', 'head', K.solid('#1a1a1a', 0.2));
      // 手腕、腳踝的防水膠帶
      for (const s of [1, -1]) {
        const Ls = s > 0 ? 'L' : 'R', fa = B('forearm' + Ls), sh = B('shin' + Ls);
        K.add(K.prim(new THREE.CylinderGeometry(K.prof(K.foreR, 0.9) + 0.03, K.prof(K.foreR, 0.9) + 0.03, 0.05, 16, 1, true), K.mat4(fa.head.clone().lerp(fa.tail, 0.9))), 'gear', 'forearm' + Ls, K.solid('#8a8a80', 0.25));
        K.add(K.prim(new THREE.CylinderGeometry(K.prof(K.shinR, 0.85) + 0.04, K.prof(K.shinR, 0.85) + 0.04, 0.06, 16, 1, true), K.mat4(sh.head.clone().lerp(sh.tail, 0.8))), 'gear', 'shin' + Ls, K.solid('#8a8a80', 0.25));
      }
    },
  },

  // ====================== 束縛病患 ======================
  straitjacket: {
    body: (r) => ({ s: r.range(0.97, 1.04), sw: r.range(0.98, 1.04), hip: 0.98, g: r.range(0.88, 0.96), fat: 0.95, musc: 0.25, belly: 0, thin: 0.55, arm: 1, neck: 0.95, head: r.range(0.97, 1.02) }),
    fem: 0.3, skins: ['pale', 'jaundice', 'fresh'], hair: 0.3, longHair: 0,
    curl: () => [1.2, 1.4, 1.1],
    skinL: (L, r) => { L.fresh = 0.7; L.veins = 0.4; L.muzzle = r.chance(0.5) ? 1 : 0; },
    wounds: ({ wound, L, V, HC }) => {
      // 前額葉手術的疤:頭頂一道縫合的切口
      L.wounds.push({ kind: 'gash', c: V(HC.x, HC.y + 0.1, HC.z + 0.02), n: V(0, 1, 0), r: 0.008, k: 2, a: V(HC.x - 0.055, HC.y + 0.085, HC.z + 0.04), b: V(HC.x + 0.055, HC.y + 0.085, HC.z + 0.04) });
      wound('bite', 'neck', 0.025);
    },
    head: (H) => { H.decay = 0.4; H.sock = 1.1; },
    outfits: (K) => ({
      straitjacket: () => {
        const color = K.r.pick(['#d6d0ba', '#cfc8b0', '#c2c0b0']);
        const o = { color, dirt: K.r.range(0.5, 0.75), wear: 0.5, hem: 0.03, loose: 0.004, tight: 0.85 };
        K.top({ ...o, y0: 0.88, sleeve: 0.98, off: 0.02 });
        // 封口的長袖:把手整個包住
        for (const s of [1, -1]) {
          const Ls = s > 0 ? 'L' : 'R', fa = K.B('forearm' + Ls), hd = K.B('hand' + Ls);
          const g = K.tube(fa.tail.clone().lerp(fa.head, 0.12), hd.tail.clone().add(V0(0, -0.02, 0)), (t, q) => { const rr = K.lerp(K.prof(K.foreR, 0.95) + 0.024, 0.045, t); return [Math.cos(q) * rr, Math.sin(q) * rr * 1.1]; }, { cols: 14, rows: 6, capA: 0, capB: 0.9 });
          K.add(g, 'cloth', ['forearm' + Ls, 'hand' + Ls], K.clothPaint(g, o));
        }
        K.bottom({ color: '#9aa6ae', len: 1, dirt: 0.5, wear: 0.3, loose: 0.007, off: 0.015, pattern: (x) => (Math.sin(x * 160) > 0.7 ? 1 : 0) });
        K.setShoes('bare');
      },
    }),
    outfit: ['straitjacket'],
    extras: (K) => {
      const { V, P, HC, H, L, tShape, ty, sstep, G } = K;
      // 皮帶:胸口、腰、跨下;金屬扣
      for (const y of [1.33, 1.12]) {
        const w = tShape(ty(y), 0)[0], df = tShape(ty(y), Math.PI / 2)[1], db = -tShape(ty(y), -Math.PI / 2)[1];
        K.add(K.prim(new THREE.TorusGeometry(1, 0.1, 6, 36), K.mat4(V(0, y, (df - db) / 2), [Math.PI / 2, 0, 0], [w + 0.03, (df + db) / 2 + 0.03, 0.25])), 'gear', y > 1.25 ? 'chest' : 'spine', K.solid('#3a2618', 0.3));
        K.add(K.prim(new THREE.BoxGeometry(0.035, 0.032, 0.008), K.mat4(V(0, y, df + 0.035))), 'metal', y > 1.25 ? 'chest' : 'spine', metalPaint(K, STEEL_D, 0.1, 0, 0, 0, 0));
      }
      // 頭頂縫合疤上的釘書針
      const prev = L.paint;
      L.paint = (x, y, z, nx, ny, nz, part, c, wet) => {
        if (prev) wet = prev(x, y, z, nx, ny, nz, part, c, wet);
        if (part !== 'head' || y < HC.y + 0.05) return wet;
        const d2 = seg2(x, y, z, HC.x - 0.055, HC.y + 0.085, HC.z + 0.04, HC.x + 0.055, HC.y + 0.085, HC.z + 0.04);
        const st = G(d2, 0.006) * sstep(0.85, 0.97, Math.abs(Math.sin(x * 260)));
        c.lerp(STEEL_D, st * 0.9);
        return wet;
      };
      // 皮革口枷(一半的個體)
      if (L.muzzle) {
        P.muzzle = 1;
        K.dome(0.01, (x, y, z) => z > 0.03 && y < -0.005 && y > -0.125, 'gear', (x, y, z, nx, ny, nz, i, out) => {
          const c = tc.copy(LEATHER).multiplyScalar(0.7 + K.fbm(x * 50, y * 50, z * 50, 2) * 0.5);
          if (Math.abs(Math.sin((x - HC.x) * 150)) > 0.93 && z > HC.z + 0.06) c.multiplyScalar(0.4); // 透氣孔
          out[0] = c.r; out[1] = c.g; out[2] = c.b; out[3] = 1;
        });
        K.add(K.prim(new THREE.TorusGeometry(1, 0.08, 5, 30), K.mat4(V(HC.x, HC.y - 0.035, HC.z - 0.005), [Math.PI / 2 + 0.2, 0, 0], [0.075 * H.w + 0.012, 0.1 * H.d + 0.012, 0.12])), 'gear', 'head', K.solid('#2a1c12', 0.3));
      }
    },
  },
};
const V0 = (x, y, z) => new THREE.Vector3(x, y, z);

// ====================== 追獵者(追逐戰專用) ======================
// 高大、肩膀寬、弓著背的「手術者」:整顆頭纏著滲血的繃帶(只留一道眼縫)、血染的屠夫皮圍裙、右手多一把長骨鋸
LOOKS.pursuer = {
  ...LOOKS.surgeon,
  body: () => ({ s: 1.17, sw: 1.12, hip: 1.02, g: 1.04, fat: 0.98, musc: 0.75, belly: 0, thin: 0.45, arm: 1.12, neck: 1.12, head: 0.98 }),
  fem: 0, hair: 0, skins: ['rot', 'dark'],
  skinL: (L) => { L.veins = 0.8; L.fresh = 1; L.dirt = 0.5; L.livor = 0.7; L.slip = 0.6; },
  outfit: ['opgown'],
  extras: (K) => {
    LOOKS.surgeon.extras(K);
    const { V, HC, B } = K;
    // 繃帶頭套:頭部網格外推,挖掉眼睛那一道縫;繃帶紋 + 滲出的血
    K.L.clothBlood.push({ c: V(HC.x + 0.02, HC.y + 0.03, HC.z + 0.09), r: 0.05, drip: 0.12, sq: 0.6, k: 9 }, { c: V(HC.x - 0.03, HC.y - 0.06, HC.z + 0.08), r: 0.04, drip: 0.2, sq: 0.6, k: 4 });
    K.dome(0.007, (x, y, z) => y > -0.125 && !(z > 0.045 && Math.abs(y - 0.013) < 0.011 && Math.abs(x) < 0.06), 'cloth',
      K.clothPaint({ userData: {} }, { color: '#b9ae96', dirt: 0.55, wear: 0.7, pattern: (x, y) => (Math.sin(y * 430 + x * 55) > 0.35 ? 1 : 0) }));
    // 屠夫皮圍裙:胸前一片 + 垂到膝下
    const apron = { color: '#2a1c14', dirt: 0.7, wear: 0.55, hem: 0.03, off: 0.034, loose: 0.004, cut: (x, y, z) => (z > 0.035 ? K.sstep(0.0, 0.02, 0.15 - Math.abs(x)) : 0) };
    K.top({ ...apron, y0: 1.02, y1: 1.46 });
    K.skirt({ ...apron, hem: 0.44, off: 0.04 });
    for (let i = 0; i < 3; i++) K.L.clothBlood.push({ c: V(K.r.range(-0.1, 0.1), K.r.range(0.7, 1.3), 0.2), r: K.r.range(0.06, 0.1), drip: 0.4, sq: 0.6, k: i * 3 });
    // 右手的長骨鋸(鋸齒刀背)
    const hd = B('handR'), fa = B('forearmR'), dir = hd.tail.clone().sub(fa.head).normalize();
    const a = fa.head.clone().lerp(fa.tail, 0.7).add(V(-0.02, 0, 0.02)), b = a.clone().addScaledVector(dir, 0.72);
    K.add(bladeGeo(K, a, b, 0.032, 0.004, V(0, 0, 1)), 'metal', 'handR', metalPaint(K, STEEL, 1, a.x, a.y, a.z, 0.72));
  },
};
