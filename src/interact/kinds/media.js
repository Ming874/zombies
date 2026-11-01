import * as THREE from 'three';
import { Model, T, canvasTex, texMat, FONT, HAND } from '../kit.js';

// 會出聲的東西:收音機(按 = 開關、按住 = 調頻找到隱藏的廣播)、停車場的車用收音機、映像管電視(雪花 → 緊急廣播卡)、
// 老鋼琴(每按一下彈一個音;走開之後它會自己把你彈過的再彈一次;第十個音不是你彈的)、音樂盒(按住上發條)、
// 嬰兒床吊鈴、錄音機(放錄音帶:逐字稿閱讀器 + 字幕)、打字機(按住打字;你走開後它自己打)。
const ZERO = T(0, -50, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001);
const led = (api) => api.kit.pool('led', (m) => { m.box(api.M.led, 0xffffff, 0, 0, 0, 1, 1, 1); }, api.M.led);
function shelf(m, M, w = 0.5, y = 0.95, d = 0.3, c = 0x6b5a46) { // 牆上的小木架 + 兩個三角托架
  m.slab(M.wood, c, 0, y - 0.025, d / 2, w, 0.025, d);
  for (const sx of [-1, 1]) m.box(M.metal, 0x444444, sx * (w / 2 - 0.06), y - 0.12, 0.08, 0.02, 0.2, 0.14);
}
const pickN = (list, R) => list[(R() * list.length) | 0];

// 手提收音機(REDESIGN §2.4):大廳輪椅旁那台(variant 'lobby')、二樓護理站阿嬤那台(variant 'ama',地下室燒壞之後才拿得到)。
// 撿起來交給 game.story.radio(src/story/radio.js);spec.nearId = 放在哪個東西旁邊(輪椅上的手機、護理站的錄音帶),spec.floor = 放地上
export const handradio = {
  build(api, s, spec = {}) {
    const { kit, M, ix, game } = api;
    const pool = kit.pool('handradio', (q) => {
      q.slab(M.plastic, 0x2a2622, 0, 0, 0, 0.26, 0.15, 0.08); // 機身
      q.box(M.matte, 0x5a5048, -0.055, 0.075, 0.041, 0.12, 0.1, 0.004); // 喇叭布面
      for (let i = 0; i < 6; i++) q.box(M.metal, 0x8a8478, -0.055, 0.035 + i * 0.016, 0.044, 0.12, 0.004, 0.003);
      q.box(M.gloss, 0xd8c8a0, 0.07, 0.1, 0.041, 0.09, 0.035, 0.004); // 刻度窗
      q.cyl(M.plastic, 0x1a1816, 0.07, 0.045, 0.045, 0.018, 0.016, 10, Math.PI / 2);
      q.box(M.metal, 0x9a948a, 0, 0.175, 0, 0.18, 0.012, 0.012); // 提把
      for (const sx of [-1, 1]) q.box(M.metal, 0x9a948a, sx * 0.09, 0.16, 0, 0.012, 0.03, 0.012);
      q.cyl(M.metal, 0xb0b0b0, 0.11, 0.3, -0.02, 0.004, 0.26, 6, 0, 0, -0.35); // 天線
    }, M.plastic);
    const near = spec.nearId ? ix.get(spec.nearId) : null;
    let L;
    if (near) {
      const w = ix.where(near), lay = game.world?.layout;
      const fy = spec.floor && lay ? lay.levels[s.li]?.y ?? w.y : w.y - 0.04;
      L = T(w.x + (spec.dx ?? 0.5), fy, w.z + (spec.dz ?? 0), 0, api.R() * 6, 0, 1, 1, 1);
    } else L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z, api.R() * 6) : api.mtx(s, 0, 0, 0.45, api.R() * 6);
    const pi = pool.add(s.li, L, spec.variant === 'ama' ? 0xd0a070 : null);
    const dial = led(api).add(s.li, L.clone().multiply(T(0.07, 0.1, 0.044, 0, 0, 0, 0.085, 0.03, 0.002)), spec.variant === 'ama' ? 0x140c04 : 0xffb050);
    const v = new THREE.Vector3(0, 0.1, 0).applyMatrix4(L);
    const pos = { x: v.x, y: v.y, z: v.z };
    const st = { taken: false };
    const R = () => game.story?.radio;
    return ix.register(pos, {
      id: spec.id, kind: 'handradio', name: spec.name || '手提收音機', reach: 2.3, radius: 0.22, scope: 'map', priority: 7, // 撿走之後提示就消失(不是「已經用過了」)
      prompt: () => (st.taken || !R()?.offer?.(spec.variant) ? null : `撿起${spec.name || '收音機'}`),
      onUse: () => {
        if (st.taken || !R()?.offer?.(spec.variant)) return;
        st.taken = true; pool.set(pi, ZERO); led(api).set(dial, ZERO);
        R()?.give?.(spec.variant || 'lobby', { pos });
      },
      reset: () => { st.taken = false; pool.set(pi, L); led(api).set(dial, L.clone().multiply(T(0.07, 0.1, 0.044, 0, 0, 0, 0.085, 0.03, 0.002))); },
      light: (on) => led(api).color(dial, on ? 0xffb050 : 0x140c04), // 自己打開(阿嬤的收音機)
    });
  },
};

export const radio = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R, game, sfx } = api;
    const m = new Model();
    const y = spec.y ?? (s.host ? 0 : 0.95);
    if (!s.host) shelf(m, M, 0.55, y, 0.3);
    const b = new Model(); // 收音機本體(木殼、布面喇叭、刻度窗、兩個旋鈕)
    b.slab(M.wood, 0x5a3b22, 0, 0, 0, 0.36, 0.22, 0.16);
    b.box(M.matte, 0x2b2420, -0.06, 0.11, 0.082, 0.2, 0.15, 0.004);
    for (let i = 0; i < 7; i++) b.box(M.wood, 0x6a4a2c, -0.06, 0.045 + i * 0.022, 0.085, 0.2, 0.006, 0.004);
    b.box(M.gloss, 0xd8c8a0, 0.11, 0.15, 0.082, 0.1, 0.05, 0.004);
    b.box(M.matte, 0x8a6a40, 0.11, 0.15, 0.085, 0.002, 0.04, 0.002);
    for (const dx of [0.08, 0.14]) b.cyl(M.plastic, 0x2a2420, dx, 0.06, 0.088, 0.03, 0.02, 12, Math.PI / 2);
    b.cyl(M.metal, 0xaaaaaa, -0.15, 0.32, -0.04, 0.006, 0.22, 6, 0, 0, 0.4);
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z) : api.mtx(s, 0, y, 0.15);
    kit.static(m, api.mtx(s), s.li);
    kit.static(b, L, s.li);
    const dial = led(api).add(s.li, L.clone().multiply(T(0.11, 0.15, 0.086, 0, 0, 0, 0.09, 0.04, 0.002)), 0x140c04);
    const pos = { x: 0, y: 0, z: 0 };
    { const v = new THREE.Vector3(0, 0.12, 0.1).applyMatrix4(L); pos.x = v.x; pos.y = v.y; pos.z = v.z; }
    const key = spec.id || `rad${Math.round(pos.x * 10)}_${Math.round(pos.z * 10)}`;
    const casts = (spec.broadcasts || []).map((id) => api.lineById(id)).filter(Boolean);
    const all = api.lineList('RADIO');
    const st = { on: false, talk: null, idx: 0 };
    const set = (on) => {
      st.on = on;
      led(api).color(dial, on ? 0xffb050 : 0x140c04);
      if (on) { sfx.loopStart('ix' + key, 'radio', pos); ixs.switchClick(pos, true); game.horror?.radio && R() < 0.15 && (() => { try { game.horror.radio({ pos, id: key }); } catch { /* 略 */ } })(); }
      else { sfx.loopStop('ix' + key); st.talk?.stop(); st.talk = null; ixs.switchClick(pos, false); }
    };
    const e = ix.register(pos, {
      id: key, kind: 'radio', name: spec.label ? `收音機（${spec.label}）` : '收音機', reach: 2.1, radius: 0.2, scope: 'map',
      prompt: () => (st.on ? '調整頻率' : '打開收音機'), hold: 1.5, holdText: '轉動調頻鈕', onTap: () => set(!st.on), tapText: () => (st.on ? '關掉收音機' : '打開收音機'),
      onHoldStart: () => { if (!st.on) set(true); ixs.tuneSweep(pos); },
      onUse: () => { // 調到一個隱藏的廣播
        if (!st.on) set(true);
        st.talk?.stop();
        const l = casts[st.idx] || (casts.length ? casts[st.idx % casts.length] : pickN(all, R));
        st.idx++;
        if (!l) return;
        st.talk = api.speak(l, { filter: 'radio', pos, noHorror: false });
        ix.flags.set('h.radio.' + (l.id || key), true);
        ix.emit('broadcast', l, e);
      },
      reset: () => { if (st.on) set(false); st.idx = 0; },
    });
    if (spec.on) ix.after(1, () => set(true));
    return e;
  },
};

// 停車場的車用收音機:不加模型,找停車場裡的車(碰撞盒的尺寸像一台車)貼在駕駛座車窗旁
export const carradio = {
  build(api, s, spec = {}) {
    const { game, ix, ixs, sfx, R } = api;
    const z = api.L.zones.find((q) => q.id === (spec.zone || s.zone?.id));
    let car = null;
    if (z) for (const b of game.world.boxes) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ, h = b.maxY - b.minY;
      if (h < 1.1 || h > 2.2 || Math.min(w, d) < 1.4 || Math.max(w, d) < 3.4 || Math.max(w, d) > 5.6) continue;
      const c = Math.floor((b.minX + b.maxX) / 4), r = Math.floor((b.minZ + b.maxZ) / 4);
      if (api.L.zoneAt(z.levelIndex, c, r)?.id !== z.id) continue;
      if (!car || R() < 0.3) car = b;
    }
    if (!car) return null;
    const alongX = car.maxX - car.minX > car.maxZ - car.minZ;
    const pos = alongX ? { x: (car.minX + car.maxX) / 2 + 0.3, y: car.minY + 1.15, z: car.maxZ + 0.05 } : { x: car.maxX + 0.05, y: car.minY + 1.15, z: (car.minZ + car.maxZ) / 2 + 0.3 };
    const key = spec.id || 'carradio';
    const casts = (spec.broadcasts || []).map((id) => api.lineById(id)).filter(Boolean);
    let talk = null, idx = 0;
    ix.after(2, () => sfx.loopStart('ix' + key, 'radio', pos)); // 一直開著(走近會越來越清楚)
    return ix.register(pos, {
      id: key, kind: 'carradio', name: `車上的收音機${spec.label ? `（${spec.label}）` : ''}`, reach: 2.2, radius: 0.5, scope: 'map', priority: 1,
      prompt: '把收音機轉大聲',
      onUse: () => { ixs.tuneSweep(pos); talk?.stop(); const l = casts.length ? casts[idx++ % casts.length] : pickN(api.lineList('RADIO'), R); if (l) talk = api.speak(l, { filter: 'radio', pos }); ix.flags.set('h.carradio', true); },
      reset: () => { talk?.stop(); idx = 0; },
    });
  },
};

// 電視:每台有自己的小畫布(雪花每秒 12 張,只在開著且玩家在 16m 內時更新)
export const tv = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R, game } = api;
    const wall = !s.host && spec.mount !== 'floor';
    const y = wall ? 1.95 : 0;
    const m = new Model();
    if (wall) { m.box(M.metal, 0x3a3a3a, 0, y + 0.1, 0.12, 0.08, 0.04, 0.24); m.box(M.metal, 0x3a3a3a, 0, y + 0.24, 0.02, 0.2, 0.3, 0.03); }
    else { m.slab(M.metal, 0x5a5e5c, 0, 0, 0.25, 0.6, 0.05, 0.45); m.slab(M.metal, 0x5a5e5c, 0, 0.6, 0.25, 0.6, 0.03, 0.45); for (const sx of [-1, 1]) for (const sz of [0.06, 0.44]) m.slab(M.metal, 0x444846, sx * 0.27, 0.05, sz, 0.03, 0.55, 0.03); for (const sx of [-1, 1]) for (const sz of [0.06, 0.44]) m.cyl(M.rust, 0x222222, sx * 0.27, 0.025, sz, 0.05, 0.05, 8, Math.PI / 2); }
    const by = wall ? y - 0.1 : 0.63, bz = wall ? 0.26 : 0.25;
    m.slab(M.plastic, 0x3b3833, 0, by, bz - 0.04, 0.56, 0.44, 0.4);
    m.slab(M.plastic, 0x2c2a27, 0, by + 0.04, bz + 0.16, 0.5, 0.36, 0.02);
    m.box(M.plastic, 0x26231f, 0.22, by + 0.1, bz + 0.18, 0.08, 0.2, 0.01);
    for (let i = 0; i < 3; i++) m.cyl(M.plastic, 0x8a857a, 0.22, by + 0.26 + i * 0.045, bz + 0.19, 0.022, 0.012, 10, Math.PI / 2);
    m.cyl(M.metal, 0x999999, -0.08, by + 0.62, bz - 0.04, 0.005, 0.38, 6, 0, 0, 0.5); m.cyl(M.metal, 0x999999, 0.06, by + 0.62, bz - 0.04, 0.005, 0.38, 6, 0, 0, -0.5);
    m.box(M.matte, 0x2a2724, 0, by + 0.45, bz - 0.04, 0.12, 0.03, 0.1);
    kit.static(m, api.mtx(s), s.li);
    if (!wall) api.box(s, -0.32, 0.02, 0.32, 0.48, 1.1, 0, 'metal');
    // 螢幕(自己的畫布 + 材質;MeshBasicMaterial + map 和其他電視同一個 shader)
    const c = document.createElement('canvas'); c.width = 96; c.height = 72;
    const g2 = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, color: 0x111111, name: 'ix:tv' });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), mat);
    api.mtx(s, -0.03, by + 0.23, bz + 0.175).decompose(scr.position, scr.quaternion, scr.scale);
    kit.group(s.li).add(scr);
    api.own.push(scr);
    const img = g2.createImageData(96, 72);
    const st = { on: false, card: null, t: 0, upd: null };
    const draw = () => {
      if (st.card) {
        g2.fillStyle = '#0a1a3a'; g2.fillRect(0, 0, 96, 72);
        g2.fillStyle = '#d8e4ff'; g2.font = `bold 11px ${FONT}`; g2.textAlign = 'center';
        String(st.card).split('\n').slice(0, 4).forEach((ln, i, a) => g2.fillText(ln, 48, 36 - (a.length - 1) * 7 + i * 14));
        if (R() < 0.2) { g2.fillStyle = 'rgba(255,255,255,.15)'; g2.fillRect(0, (R() * 72) | 0, 96, 2); }
      } else {
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) { const v = (Math.random() * 255) | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        g2.putImageData(img, 0, 0);
      }
      tex.needsUpdate = true;
    };
    const pos = api.wp(s, 0, by + 0.25, bz + 0.2);
    const key = spec.id || `tv${Math.round(pos.x * 10)}_${Math.round(pos.z * 10)}`;
    const cards = (spec.cards || []).map((id) => api.lineById(id)).filter(Boolean);
    const all = api.lineList('TV');
    let idx = 0, talk = null;
    const set = (on) => {
      st.on = on; st.card = null;
      mat.color.setHex(on ? 0xffffff : 0x111111);
      if (on) { ixs.tvOn(pos); sfx.loopStart('ix' + key, 'tv_static', pos); draw(); st.upd ||= ix.tick((dt) => { if (!st.on) { st.upd = null; return false; } if ((st.t += dt) > 1 / 12 && api.near(pos, 16)) { st.t = 0; draw(); } return true; }); }
      else { ixs.tvOff(pos); sfx.loopStop('ix' + key); talk?.stop(); g2.fillStyle = '#050505'; g2.fillRect(0, 0, 96, 72); tex.needsUpdate = true; }
    };
    set(false);
    return ix.register(pos, {
      id: key, kind: 'tv', name: '電視', reach: 2.6, radius: 0.28, scope: 'map',
      prompt: () => (st.on ? '轉台' : '打開電視'), hold: 1.2, holdText: '轉台', onTap: () => set(!st.on), tapText: () => (st.on ? '關掉電視' : '打開電視'),
      onUse: () => {
        if (!st.on) set(true);
        const l = cards.length ? cards[idx++ % cards.length] : pickN(all, R);
        if (!l) return;
        st.card = l.card || l.text;
        ixs.tuneSweep(pos);
        draw();
        talk?.stop();
        if (l.text && l.card) talk = api.speak({ ...l, parts: [l.text] }, { filter: 'tv', pos });
        ix.after(Math.max(5, talk?.dur || 0) + 1, () => { st.card = null; });
        ix.flags.set('h.tv.' + (l.id || key), true);
      },
      reset: () => { if (st.on) set(false); idx = 0; },
    });
  },
};

// 直立鋼琴(禮拜堂、宿舍):按一下彈下一個音;走開後會自己照你彈的彈一遍(慢一點、最後一個音不對)
const SCALE = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79]; // A 小調五聲
export const piano = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R, game } = api;
    const m = new Model(), W = 1.45, D = 0.58, z0 = 0.06;
    const wood = 0x2c1a12, wood2 = 0x3a2418;
    m.slab(M.gloss, wood, 0, 0, z0 + D / 2 - 0.1, W, 1.25, D - 0.2);
    m.slab(M.gloss, wood2, 0, 0.66, z0 + D - 0.18, W, 0.06, 0.26); // 鍵床
    m.slab(M.gloss, wood, 0, 0.0, z0 + D - 0.05, W - 0.1, 0.12, 0.1); // 踢板
    for (const sx of [-1, 1]) { m.slab(M.gloss, wood, sx * (W / 2 - 0.03), 0, z0 + D - 0.15, 0.06, 0.72, 0.3); m.cyl(M.gloss, wood2, sx * (W / 2 - 0.08), 0.33, z0 + D - 0.02, 0.07, 0.66, 10); }
    m.slab(M.plastic, 0xece6d4, 0, 0.72, z0 + D - 0.2, W - 0.16, 0.022, 0.15); // 白鍵
    for (let i = 0; i < 36; i++) m.box(M.matte, 0x8a8478, -W / 2 + 0.09 + i * 0.035, 0.743, z0 + D - 0.2, 0.002, 0.004, 0.15);
    for (let i = 0; i < 36; i++) if ([0, 1, 3, 4, 5].includes(i % 7) && i < 35) m.slab(M.gloss, 0x141414, -W / 2 + 0.1 + i * 0.035 + 0.018, 0.742, z0 + D - 0.24, 0.018, 0.02, 0.09);
    m.slab(M.gloss, wood, 0, 0.8, z0 + D - 0.33, W - 0.1, 0.32, 0.03, 0); // 譜架板
    m.box(M.matte, 0xe8dfc4, -0.1, 0.98, z0 + D - 0.31, 0.32, 0.24, 0.004, -0.15); // 樂譜
    m.box(M.matte, 0xddd2b4, 0.2, 0.97, z0 + D - 0.31, 0.3, 0.23, 0.004, -0.15, 0.06);
    for (const sx of [-1, 1]) { m.cyl(M.metal, 0xb89a50, sx * 0.55, 0.98, z0 + D - 0.27, 0.02, 0.1, 8, Math.PI / 2); m.cyl(M.matte, 0xe8e2cc, sx * 0.55, 1.08, z0 + D - 0.22, 0.03, 0.14, 8); }
    for (const dx of [-0.08, 0, 0.08]) m.box(M.metal, 0xb89a50, dx, 0.05, z0 + D - 0.03, 0.03, 0.012, 0.06, 0.3);
    m.slab(M.wood, 0x2a1a12, 0, 0, z0 + D + 0.42, 0.7, 0.46, 0.34); // 琴椅
    m.slab(M.matte, 0x1d1210, 0, 0.46, z0 + D + 0.42, 0.68, 0.04, 0.32);
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -W / 2, z0, W / 2, z0 + D + 0.05, 1.25);
    api.box(s, -0.35, z0 + D + 0.25, 0.35, z0 + D + 0.59, 0.5);
    const pos = api.wp(s, 0, 0.78, z0 + D - 0.2);
    const st = { notes: [], i: 0, play: null, ten: false };
    const playBack = () => { // 自己彈:你彈過的,慢一點,最後一個音走掉
      if (st.notes.length < 3 || st.play) return;
      const seq = st.notes.slice(-9);
      st.notes.length = 0;
      let k = 0;
      const step = () => {
        if (k >= seq.length) { st.play = null; if (!st.ten && seq.length >= 4) { st.ten = true; ix.after(1.8, () => { ixs.pianoNote(pos, 45, 0.9); ix.flags.inc('h.piano.ten'); }); } return; }
        ixs.pianoNote(pos, k === seq.length - 1 ? seq[k] - 1 : seq[k], 0.5);
        k++;
        st.play = ix.after(0.55 + R() * 0.25, step);
      };
      const lines = api.LINES.MISC?.piano;
      if (lines?.length && api.near(pos, 22)) api.feed(lines[(R() * lines.length) | 0], '#bfb6d8');
      step();
      ix.emit('piano', 'playback');
    };
    let away = null;
    const e = ix.register(pos, {
      id: spec.id || 'piano', kind: 'piano', name: '鋼琴', reach: 2.0, radius: 0.5, scope: 'map', cooldown: 0.25,
      prompt: '彈一個音',
      onUse: () => {
        const n = SCALE[(st.i++ * 3 + (R() * 3 | 0)) % SCALE.length];
        st.notes.push(n);
        ixs.pianoNote(pos, n, 0.75);
        away?.(); // 走開之後才會自己彈
        away = ix.after(20 + R() * 20, playBack);
        if (!st.watch) st.watch = ix.tick(() => { if (st.notes.length >= 3 && !api.near(pos, 6)) { away?.(); playBack(); st.watch = null; return false; } return st.notes.length > 0; });
      },
      reset: () => { st.notes.length = 0; st.i = 0; st.play?.(); st.play = null; st.ten = false; },
    });
    return e;
  },
};

// 音樂盒(新生兒室):按住上發條 → 掀蓋、小舞者轉、走音的曲子越轉越慢
export const musicbox = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R } = api;
    const m = new Model();
    const y = s.host ? 0 : 0.95;
    if (!s.host) shelf(m, M, 0.45, y, 0.28, 0xe8e0d0);
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z) : api.mtx(s, 0, y, 0.15);
    const b = new Model();
    b.slab(M.gloss, 0x6a3a2a, 0, 0, 0, 0.2, 0.08, 0.13);
    b.slab(M.metal, 0xc8a860, 0, 0.0, 0.066, 0.2, 0.008, 0.002);
    b.box(M.metal, 0xc8a860, 0.1, 0.04, 0, 0.02, 0.012, 0.012, 0, 0, Math.PI / 2);
    b.box(M.metal, 0xc8a860, 0.12, 0.04, 0, 0.004, 0.04, 0.012);
    b.slab(M.matte, 0x8a2a3a, 0, 0.078, 0, 0.18, 0.004, 0.11);
    kit.static(m, api.mtx(s), s.li);
    kit.static(b, L, s.li);
    const lid = kit.pool('mblid', (q) => { q.box(M.gloss, 0x6a3a2a, 0, 0.012, 0.065, 0.2, 0.024, 0.13); q.box(M.gloss, 0xd8c8a8, 0, 0.0, 0.065, 0.17, 0.002, 0.1); }, M.gloss);
    const dancer = kit.pool('dancer', (q) => { q.cyl(M.gloss, 0xf2e8e8, 0, 0.03, 0, 0.014, 0.05, 8); q.cone(M.gloss, 0xf0c8d4, 0, 0.015, 0, 0.05, 0.03, 0.1, 10); q.sph(M.gloss, 0xf2e0d8, 0, 0.065, 0, 0.018, 8); }, M.gloss);
    const hinge = L.clone().multiply(T(0, 0.08, -0.065));
    const li = lid.add(s.li, hinge);
    const dm = L.clone().multiply(T(0, 0.075, 0));
    const di = dancer.add(s.li, ZERO);
    const pos = api.wp(s, ...(s.host ? [s.host.x, s.host.y + 0.06, s.host.z] : [0, y + 0.06, 0.15]));
    const st = { open: 0, spin: 0, t: 0, run: null };
    const anim = () => ix.tick((dt) => {
      st.t += dt;
      const want = st.spin > 0 ? 1 : 0;
      st.open += (want - st.open) * Math.min(1, dt * 4);
      lid.set(li, hinge.clone().multiply(T(0, 0, 0, -1.9 * st.open)));
      if (st.spin > 0) { st.spin -= dt; dancer.set(di, dm.clone().multiply(T(0, 0, 0, 0, st.t * 2.2 * Math.max(0.15, st.spin / 10)))); }
      else dancer.set(di, st.open > 0.5 ? dm : ZERO);
      if (st.spin <= 0 && st.open < 0.02) { st.run = null; return false; }
      return true;
    });
    return ix.register(pos, {
      id: spec.id || 'musicbox', kind: 'musicbox', name: '音樂盒', reach: 1.8, radius: 0.12, scope: 'map', hold: 1.2, holdText: '上發條', prompt: '上發條', cooldown: 4,
      onHoldStart: () => ixs.musicBoxWind(pos),
      onUse: () => {
        const len = ixs.musicBox(pos, 12, true) || 10;
        st.spin = len;
        st.run ||= anim();
        const n = spec.note || null;
        if (!ix.flags.has('h.ev.musicbox')) {
          ix.flags.set('h.ev.musicbox', true);
          ix.after(len + 0.5, () => { const t = api.LINES.MISC?.musicBox; if (n) api.toast('盒底刻著字', '#d9c48a', '按 [E] 再看一次'); else if (t) api.feed(t, '#d9c48a'); });
        } else if (n) api.note(n);
        ix.emit('musicbox', pos);
      },
      reset: () => { st.spin = 0; },
    });
  },
};

// 嬰兒床 + 吊鈴:整組吊鈴是一個實例,按一下轉起來、叮叮響,慢慢停
export const mobile = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs } = api;
    const m = new Model(), W = 1.0, D = 0.56, z0 = 0.08;
    const c = 0xe8e4dc;
    m.slab(M.paint, c, 0, 0.42, z0 + D / 2, W, 0.04, D);
    m.slab(M.matte, 0xdcd8e8, 0, 0.46, z0 + D / 2, W - 0.06, 0.08, D - 0.06);
    for (const sx of [-1, 1]) for (const sz of [0, 1]) m.slab(M.paint, c, sx * (W / 2 - 0.02), 0, z0 + sz * D, 0.04, 0.95, 0.04);
    for (const sz of [0, 1]) { m.box(M.paint, c, 0, 0.93, z0 + sz * D, W, 0.03, 0.03); for (let i = 1; i < 14; i++) m.slab(M.paint, c, -W / 2 + i * (W / 14), 0.46, z0 + sz * D, 0.014, 0.47, 0.014); }
    for (const sx of [-1, 1]) for (let i = 1; i < 7; i++) m.slab(M.paint, c, sx * (W / 2 - 0.02), 0.46, z0 + i * (D / 7), 0.014, 0.47, 0.014);
    for (const sx of [-1, 1]) for (const sz of [0, 1]) m.cyl(M.rust, 0x333333, sx * (W / 2 - 0.02), 0.02, z0 + sz * D, 0.05, 0.04, 8, Math.PI / 2);
    m.box(M.matte, 0xf0e0e4, 0.15, 0.53, z0 + D / 2, 0.3, 0.06, 0.3); // 小毯子
    m.box(M.paint, 0xe8e4dc, -W / 2 + 0.02, 1.25, z0 + D / 2, 0.025, 0.65, 0.025); // 吊臂
    m.box(M.paint, 0xe8e4dc, -W / 2 + 0.2, 1.56, z0 + D / 2, 0.38, 0.025, 0.025);
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -W / 2, z0 - 0.02, W / 2, z0 + D + 0.02, 0.95);
    const pool = kit.pool('mobile', (q) => {
      q.cyl(M.plastic, 0xf0e8d8, 0, 0, 0, 0.03, 0.04, 10);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, x = Math.cos(a) * 0.16, z = Math.sin(a) * 0.16;
        q.box(M.plastic, 0xe0dcd0, x / 2, -0.005, z / 2, Math.abs(x) + 0.006, 0.004, Math.abs(z) + 0.006);
        q.cyl(M.matte, 0xcccccc, x, -0.08, z, 0.002, 0.16, 4);
        q.sph(M.plastic, [0xf2c8d0, 0xc8dcf2, 0xf2e8b0, 0xc8f0d0, 0xe0c8f2][i], x, -0.18, z, 0.055, 8, 0.07, 0.04);
      }
    }, M.plastic);
    const hub = api.mtx(s, -W / 2 + 0.38, 1.53, z0 + D / 2);
    const pi = pool.add(s.li, hub);
    const pos = api.wp(s, -W / 2 + 0.38, 1.4, z0 + D / 2);
    const st = { w: 0, a: 0, run: null };
    const run = () => ix.tick((dt) => { st.a += st.w * dt; st.w *= Math.pow(0.86, dt); pool.set(pi, hub.clone().multiply(T(0, 0, 0, 0, st.a))); if (st.w < 0.03) { st.run = null; return false; } return true; });
    return ix.register(pos, {
      id: spec.id || 'mobile', kind: 'mobile', name: '嬰兒床吊鈴', reach: 2.0, radius: 0.22, scope: 'map', cooldown: 1.5, prompt: '撥一下吊鈴',
      onUse: () => { st.w = Math.min(3, st.w + 1.8); ixs.mobileChime(pos); st.run ||= run(); ix.emit('mobile', pos); },
      reset: () => { st.w = 0; },
    });
  },
};

// 錄音機:放錄音帶 → 閱讀器(逐字稿)+ 字幕逐行播放;收起閱讀器後錄音帶繼續播
export const cassette = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R } = api;
    const m = new Model();
    const y = s.host ? 0 : 0.95;
    if (!s.host) shelf(m, M, 0.5, y, 0.28);
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z) : api.mtx(s, 0, y, 0.15);
    const b = new Model();
    b.slab(M.plastic, 0x2a2a2c, 0, 0, 0, 0.3, 0.13, 0.08);
    b.box(M.metal, 0x8a8a8a, -0.08, 0.065, 0.041, 0.12, 0.11, 0.004);
    for (let i = 0; i < 6; i++) b.box(M.matte, 0x111111, -0.08, 0.025 + i * 0.016, 0.044, 0.11, 0.004, 0.002);
    b.box(M.glass, 0x8899aa, 0.07, 0.08, 0.041, 0.12, 0.06, 0.004);
    b.box(M.matte, 0x3a2a1a, 0.07, 0.08, 0.038, 0.1, 0.045, 0.004);
    for (let i = 0; i < 5; i++) b.slab(M.plastic, i === 1 ? 0xb03020 : 0x777777, 0.02 + i * 0.024, 0.13, 0, 0.018, 0.012, 0.03);
    b.box(M.metal, 0x999999, 0, 0.17, -0.01, 0.2, 0.012, 0.012);
    kit.static(m, api.mtx(s), s.li);
    kit.static(b, L, s.li);
    const pos = { x: 0, y: 0, z: 0 };
    { const v = new THREE.Vector3(0, 0.08, 0.05).applyMatrix4(L); pos.x = v.x; pos.y = v.y; pos.z = v.z; }
    const tape = spec.tape;
    const st = { play: null, rd: null };
    const stop = () => { st.play?.stop(); st.play = null; ixs.tapeLine(false); sfx.tape('stop'); };
    return ix.register(pos, {
      id: spec.id || 'cassette' + Math.round(pos.x), kind: 'cassette', name: '錄音機', reach: 1.9, radius: 0.16, scope: 'map',
      prompt: () => (st.play ? '停止播放' : tape ? '播放錄音帶' : '按下播放鍵'),
      onUse: () => {
        if (st.play) { stop(); return; }
        const n = tape && api.note ? api.noteObj(tape) : null;
        sfx.tape('insert');
        if (!n) { ix.after(0.5, () => { sfx.tape('play'); ixs.tapeLine(true); ix.after(4, () => { ixs.tapeLine(false); sfx.tape('stop'); }); }); api.say('', '（只有磁帶的嘶聲）', 3000); return; }
        const rd = api.note(n);
        ix.after(0.6, () => {
          sfx.tape('play'); ixs.tapeLine(true);
          const lines = n.lines || [[n.author || '錄音帶', n.body]];
          let t = 0;
          const stops = [];
          lines.forEach(([who, text, secs], i) => {
            stops.push(ix.after(t, () => { rd?.mark?.(i); api.speak({ who: / · /.test(who) ? who : `錄音帶 · ${who}`, voice: /小美|小美|護|修女|女|阿嬤|淑芬/.test(who) ? 'woman' : /伯|老/.test(who) ? 'old' : 'man', parts: [text] }, { filter: 'radio', pos, noHorror: true }); }));
            t += (secs || 2.5) + 0.25;
          });
          stops.push(ix.after(t + 0.5, () => { st.play = null; ixs.tapeLine(false); sfx.tape('stop'); ix.flags.set('h.tape.' + n.id, true); }));
          st.play = { stop: () => stops.forEach((f) => f()) };
        });
      },
      reset: () => { if (st.play) stop(); },
    });
  },
};

// 打字機:按住打字(紙上出現一行);你走開之後它會自己再打一行
export const typewriter = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R } = api;
    const m = new Model();
    const desk = !s.host;
    if (desk) { // 書桌
      m.slab(M.wood, 0x5a4636, 0, 0.72, 0.36, 1.1, 0.04, 0.62);
      for (const sx of [-1, 1]) m.slab(M.wood, 0x4a3a2c, sx * 0.5, 0, 0.36, 0.06, 0.72, 0.58);
      m.slab(M.wood, 0x4a3a2c, 0.32, 0.4, 0.36, 0.4, 0.3, 0.56);
      m.box(M.metal, 0xb0a070, 0.32, 0.55, 0.65, 0.1, 0.012, 0.012);
    }
    const L = desk ? api.mtx(s, -0.1, 0.76, 0.38) : api.mtx(s, s.host.x, s.host.y, s.host.z);
    const b = new Model();
    b.slab(M.gloss, 0x1e2a24, 0, 0, 0, 0.42, 0.1, 0.34);
    b.slab(M.gloss, 0x1e2a24, 0, 0.1, -0.06, 0.42, 0.06, 0.18);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) b.cyl(M.plastic, 0xeeeedd, -0.16 + k * 0.036 + r * 0.008, 0.06 + r * 0.012, 0.13 - r * 0.03, 0.022, 0.012, 10);
    b.cyl(M.matte, 0x111111, 0, 0.18, -0.08, 0.05, 0.48, 14, 0, 0, Math.PI / 2);
    b.box(M.metal, 0xb8b8b0, -0.27, 0.19, -0.06, 0.06, 0.012, 0.02);
    kit.static(m, api.mtx(s), s.li);
    kit.static(b, L, s.li);
    if (desk) api.box(s, -0.56, 0.05, 0.56, 0.68, 0.78);
    // 紙(自己的畫布:打出來的字)
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const g2 = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = texMat('tw' + api.own.length, tex, { rough: 0.9 });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), mat);
    paper.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12).fill(1), 3));
    L.clone().multiply(T(0, 0.31, -0.11, -0.25)).decompose(paper.position, paper.quaternion, paper.scale);
    kit.group(s.li).add(paper);
    api.own.push(paper);
    const lines = [];
    const draw = () => {
      g2.fillStyle = '#e9e2cf'; g2.fillRect(0, 0, 128, 160);
      g2.fillStyle = '#2a2622'; g2.font = `9px ${FONT}`;
      lines.slice(-12).forEach((ln, i) => g2.fillText(ln, 8, 18 + i * 11));
      tex.needsUpdate = true;
    };
    draw();
    const pos = api.wp(s, ...(desk ? [-0.1, 0.92, 0.42] : [s.host.x, s.host.y + 0.15, s.host.z]));
    const pool = (spec.lines || []).map((id) => api.lineById(id)).filter(Boolean);
    const all = api.lineList('TYPEWRITER');
    let idx = 0, self = false;
    const type = (text, then) => {
      const s2 = String(text || '').replace(/\n/g, ' ');
      let k = 0;
      lines.push('');
      const step = () => {
        if (k >= s2.length) { ixs.typeReturn(pos); then?.(); return; }
        lines[lines.length - 1] += s2[k++];
        if (lines[lines.length - 1].length > 12) lines.push('');
        draw();
        ixs.typeKey(pos);
        ix.after(0.08 + R() * 0.07, step);
      };
      step();
    };
    return ix.register(pos, {
      id: spec.id || 'typewriter' + Math.round(pos.x), kind: 'typewriter', name: '打字機', reach: 1.9, radius: 0.22, scope: 'map', hold: 1.4, holdText: '打字', prompt: '打幾個字', cooldown: 3,
      onHoldStart: () => ixs.typeKey(pos),
      onUse: () => {
        const l = pool.length ? pool[idx++ % pool.length] : all[(R() * all.length) | 0];
        type(l?.text || '……', () => {
          if (self || !all.length) return;
          self = true;
          const w = ix.tick(() => { if (!api.near(pos, 7)) { ix.after(2 + R() * 4, () => type(all[(R() * all.length) | 0]?.text || '207 207 207')); return false; } return true; }); void w;
        });
        ix.flags.set('h.typewriter', true);
      },
      reset: () => { lines.length = 0; draw(); self = false; idx = 0; },
    });
  },
};

// 牆上的告示/字牌貼圖(公用電話、販賣機標示等;同名共用)
export function signTex(text, w = 256, h = 64, bg = '#2e6b58', fg = '#f2efe4') {
  return canvasTex('sign:' + text + bg, w, h, (x) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = `bold ${Math.round(h * 0.55)}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2); });
}
export const handFont = HAND;
