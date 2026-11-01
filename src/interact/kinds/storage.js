import * as THREE from 'three';
import { Model, T, canvasTex, texMat, FONT, HAND } from '../kit.js';

// 可以翻找的東西與「看得到的線索」:置物櫃(可加名牌、密碼鎖)、抽屜櫃、鏡面藥櫃、太平間冰櫃牆(依門牌順序拉開)、
// 掉在地上的道具(保險絲、鑰匙、油桶)、紙條/白板/登記簿/告示/照片/蠟筆畫、禮拜堂的蠟燭架、聖母噴水池投幣、「聽話」零食。
// 每個收納物件的內容固定(劇情包指定,或用每局種子抽)→ 同一局重開檢查會是一樣的。
const ZERO = T(0, -50, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001);
const ledPool = (api) => api.kit.pool('led', (m) => { m.box(api.M.led, 0xffffff, 0, 0, 0, 1, 1, 1); }, api.M.led);
const nameTag = (api, text) => texMat('tag:' + text, canvasTex('tag:' + text, 128, 40, (x, w, h) => { x.fillStyle = '#ece6d4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#8a8270'; x.strokeRect(1, 1, w - 2, h - 2); x.fillStyle = '#2a2622'; x.font = `22px ${HAND}`; x.textAlign = 'center'; x.fillText(text, w / 2, 28); }), { basic: true });

// 打開/關上的通用流程:第一次打開時翻找 → 給內容;之後只是開關
function container(api, s, spec, o) {
  const { ix, R } = api;
  const st = { open: false, got: false, k: 0, run: null };
  const loot = spec.loot ?? (R() < 0.75 ? 'random' : null);
  const anim = () => ix.tick((dt) => { const w = st.open ? 1 : 0; st.k += Math.sign(w - st.k) * Math.min(Math.abs(w - st.k), dt / (o.dur || 0.35)); o.pose(st.k); if (st.k === w) { st.run = null; return false; } return true; });
  const code = spec.code ? String(spec.code) : null;
  let unlocked = !code;
  const e = api.reg(s, ...o.focus, {
    id: spec.id || `${o.kind}${Math.round(s.x * 10)}_${Math.round(s.z * 10)}`, kind: o.kind, name: o.name, reach: o.reach || 1.9, radius: o.radius || 0.25, cooldown: 0.4,
    prompt: () => (!unlocked ? `${o.name} · 密碼鎖（輸入密碼）` : st.open ? `關上${o.short || o.name}` : st.got ? `打開${o.short || o.name}` : `翻找${o.name}`),
    onUse: () => {
      if (!unlocked) {
        ix.ui.keypad({ title: `${o.name} · 密碼鎖`, sub: ix.flags.has('know.code' + code) ? `你記得密碼：${code}` : `${code.length} 位數`, len: code.length, check: (c) => { if (c === code) { unlocked = true; api.ixs.lockerOpen(api.wp(s, ...o.focus)); ix.flags.set(spec.flag || `h.lock.${e.id}`, true); ix.flags.set('know.code' + code, true); ix.after(0.9, () => api.ix.use(e)); return { ok: true, text: '喀。' }; } api.sfx.pickupDeny(); return { ok: false, text: '鎖頭轉不開' }; } });
        return false;
      }
      st.open = !st.open;
      (st.open ? o.openSnd : o.closeSnd)(api.wp(s, ...o.focus));
      st.run ||= anim();
      if (st.open && !st.got) { st.got = true; api.ixs.rummage(api.wp(s, ...o.focus)); ix.after(0.7, () => api.loot(loot, api.wp(s, ...o.focus))); ix.emit('search', e, loot); }
    },
    reset: () => { st.open = false; st.got = false; st.k = 0; o.pose(0); unlocked = !code; },
  });
  return e;
}

export const locker = {
  build(api, s, spec = {}) {
    const { kit, M, ixs } = api;
    const n = 3, w = 0.38, h = 1.8, d = 0.46, c = spec.color ?? [0x5a6e78, 0x6e7a5a, 0x7a7068][(api.R() * 3) | 0];
    const m = new Model(), x0 = -((n - 1) * w) / 2, pick = spec.slot ?? 1;
    m.slab(M.paint, c, 0, 0.08, d / 2 + 0.02, n * w + 0.02, h - 0.08, d);
    m.slab(M.matte, 0x222222, 0, 0, d / 2 + 0.02, n * w, 0.08, d - 0.04);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * w;
      if (i !== pick) {
        m.box(M.paint, c, x, 0.98, d + 0.025, w - 0.02, h - 0.24, 0.012);
        for (let k = 0; k < 4; k++) m.box(M.matte, 0x2a2e30, x, 1.62 - k * 0.03, d + 0.032, w - 0.12, 0.012, 0.004);
        m.box(M.metal, 0x9a9a9a, x + w / 2 - 0.06, 1.0, d + 0.036, 0.02, 0.1, 0.02);
        if (i === 0) m.box(M.metal, 0x6a5a40, x + w / 2 - 0.06, 0.92, d + 0.05, 0.035, 0.04, 0.02); // 掛鎖
      }
      m.box(M.matte, 0x1a1c1c, x, 0.98, d + 0.016, w - 0.04, h - 0.26, 0.004); // 門後的黑
    }
    kit.static(m, api.mtx(s), s.li);
    if (spec.label) { const t = new Model(); t.quad(nameTag(api, spec.label), x0 + pick * w, 1.74, d + 0.04, 0.12, 0.038); kit.static(t, api.mtx(s), s.li); }
    api.box(s, -(n * w) / 2, 0.02, (n * w) / 2, d + 0.03, h, 0, 'metal');
    const door = kit.pool('lockdoor', (q) => {
      q.box(M.paint, 0xffffff, w / 2 - 0.01, 0, 0, w - 0.02, h - 0.24, 0.012);
      for (let k = 0; k < 4; k++) q.box(M.matte, 0x444444, w / 2 - 0.01, 0.64 - k * 0.03, 0.007, w - 0.12, 0.012, 0.004);
      q.box(M.metal, 0xbbbbbb, w - 0.06, 0.02, 0.012, 0.02, 0.1, 0.02);
    }, M.paint);
    const hinge = api.mtx(s, x0 + pick * w - w / 2 + 0.01, 0.98, d + 0.025);
    const di = door.add(s.li, hinge, c);
    return container(api, s, spec, {
      kind: 'locker', name: spec.label ? `置物櫃（${spec.label}）` : '置物櫃', short: '置物櫃', focus: [x0 + pick * w, 1.1, d + 0.05], radius: 0.25,
      pose: (k) => door.set(di, hinge.clone().multiply(T(0, 0, 0, 0, -1.7 * k))), openSnd: ixs.lockerOpen, closeSnd: ixs.lockerClose,
    });
  },
};

export const drawer = { // 床頭櫃 / 抽屜櫃(上面兩個抽屜,打開的是上面那個)
  build(api, s, spec = {}) {
    const { kit, M, ixs, R } = api;
    const metal = spec.metal ?? R() < 0.5, c = metal ? 0xb8bcb4 : 0x7a5a3e, mat = metal ? M.paint : M.wood;
    const w = 0.5, h = 0.72, d = 0.45, z0 = 0.04;
    const m = new Model();
    m.slab(mat, c, 0, 0.04, z0 + d / 2, w, h - 0.04, d);
    m.slab(M.matte, 0x222222, 0, 0, z0 + d / 2, w - 0.04, 0.04, d - 0.04);
    m.box(mat, c, 0, 0.25, z0 + d + 0.008, w - 0.04, 0.4, 0.016);
    m.box(M.metal, 0x999999, 0, 0.38, z0 + d + 0.02, 0.12, 0.02, 0.02);
    m.box(M.matte, 0x111111, 0, 0.6, z0 + d - 0.01, w - 0.06, 0.14, 0.01);
    m.cyl(M.gloss, 0xd8d4c4, -0.12, h + 0.06, z0 + 0.15, 0.06, 0.12, 10); // 杯子 / 藥罐
    m.box(M.matte, 0xe8e2d0, 0.1, h + 0.003, z0 + 0.2, 0.14, 0.004, 0.1, 0, 0.4);
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -w / 2, z0, w / 2, z0 + d, h + 0.02, 0, metal ? 'metal' : 'wood');
    const dr = kit.pool(metal ? 'drawerM' : 'drawerW', (q) => {
      q.box(metal ? M.paint : M.wood, 0xffffff, 0, 0, -0.18, w - 0.08, 0.1, 0.36);
      q.box(metal ? M.paint : M.wood, 0xffffff, 0, 0.0, 0.006, w - 0.04, 0.15, 0.016);
      q.box(M.metal, 0x999999, 0, 0.01, 0.02, 0.12, 0.02, 0.02);
      q.box(M.matte, 0xd8d0b8, 0.05, -0.04, -0.15, 0.2, 0.004, 0.15, 0, 0.2);
    }, metal ? M.paint : M.wood);
    const base = api.mtx(s, 0, 0.6, z0 + d + 0.002);
    const di = dr.add(s.li, base, c);
    return container(api, s, spec, {
      kind: 'drawer', name: metal ? '抽屜櫃' : '床頭櫃', short: '抽屜', focus: [0, 0.62, z0 + d + 0.05], radius: 0.2, dur: 0.3,
      pose: (k) => dr.set(di, base.clone().multiply(T(0, 0, 0.3 * k))), openSnd: ixs.drawerOpen, closeSnd: ixs.drawerClose,
    });
  },
};

export const medcab = { // 牆上的鏡面藥櫃
  build(api, s, spec = {}) {
    const { kit, M, ixs } = api;
    const w = 0.5, h = 0.62, d = 0.14, y = 1.55;
    const m = new Model();
    m.box(M.paint, 0xe8e6e0, 0, y, d / 2, w, h, d);
    m.box(M.matte, 0x2a2c2c, 0, y, d - 0.004, w - 0.04, h - 0.04, 0.004);
    for (let i = 0; i < 2; i++) m.box(M.glass, 0xd8e0e0, 0, y - 0.12 + i * 0.22, d / 2, w - 0.05, 0.006, d - 0.02);
    for (let i = 0; i < 5; i++) m.cyl(M.gloss, [0x8a4a20, 0xe8e8e0, 0x2a6a4a, 0xd8a040, 0x6a2020][i], -0.16 + i * 0.08, y - 0.06 + (i % 2) * 0.22, d / 2, 0.04, 0.09 - (i % 3) * 0.015, 8);
    m.box(M.paint, 0xc82a20, 0, y + h / 2 + 0.05, 0.02, 0.1, 0.1, 0.01); // 紅十字牌
    m.box(M.paint, 0xf2f2f2, 0, y + h / 2 + 0.05, 0.026, 0.06, 0.02, 0.004); m.box(M.paint, 0xf2f2f2, 0, y + h / 2 + 0.05, 0.026, 0.02, 0.06, 0.004);
    kit.static(m, api.mtx(s), s.li);
    const door = kit.pool('mirror', (q) => {
      q.box(M.paint, 0xe8e6e0, w / 2 - 0.01, 0, 0, w - 0.02, h - 0.02, 0.02);
      q.box(M.gloss, 0x9aa8ac, w / 2 - 0.01, 0, 0.012, w - 0.07, h - 0.07, 0.004);
      q.box(M.matte, 0x3a2a20, w * 0.7, -0.15, 0.015, 0.08, 0.12, 0.001, 0, 0, 0.6); // 鏡上的污痕
    }, M.gloss);
    const hinge = api.mtx(s, -w / 2 + 0.01, y, d + 0.01);
    const di = door.add(s.li, hinge);
    return container(api, s, { loot: spec.loot ?? (api.R() < 0.6 ? { heal: 12 } : 'random'), ...spec }, {
      kind: 'medcab', name: '藥櫃', focus: [0, y, d + 0.04], radius: 0.24,
      pose: (k) => door.set(di, hinge.clone().multiply(T(0, 0, 0, 0, -1.8 * k))), openSnd: ixs.cabinetOpen, closeSnd: ixs.cabinetClose,
    });
  },
};

// 太平間冰櫃牆:2 × 3 格,依門牌順序(spec.order)拉開最後一格才有東西;拉錯一格 → 冷氣、聲音、(單人/房主)一隻爬行者
export const morgue = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R, game } = api;
    const cols = 3, rows = 2, cw = 0.7, rh = 0.62, d = 0.9;
    const m = new Model();
    m.slab(M.metal, 0xb8bcbe, 0, 0, d / 2 + 0.02, cols * cw + 0.12, rows * rh + 0.5, d);
    const nums = spec.doors ? Array.from({ length: Math.min(6, spec.doors) }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 6];
    const plates = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = -((cols - 1) * cw) / 2 + c * cw, y = 0.55 + r * rh;
      m.box(M.matte, 0x1a1c1c, x, y, d + 0.022, cw - 0.04, rh - 0.06, 0.004);
      plates.push({ i, x, y, n: nums[i] });
    }
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -(cols * cw) / 2 - 0.06, 0.02, (cols * cw) / 2 + 0.06, d + 0.03, rows * rh + 0.5, 0, 'heavy');
    const tagM = (n) => texMat('mg' + n, canvasTex('mg' + n, 64, 32, (x, w, h) => { x.fillStyle = '#d8d4c4'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = `bold 22px ${FONT}`; x.textAlign = 'center'; x.fillText(String(n).padStart(2, '0'), w / 2, 24); }), { basic: true });
    for (const p of plates) { const t = new Model(); t.quad(tagM(p.n), p.x, p.y + 0.18, d + 0.052, 0.1, 0.05); kit.static(t, api.mtx(s), s.li); }
    const door = kit.pool('mdoor', (q) => {
      q.box(M.metal, 0xc8ccce, 0, 0, 0.02, cw - 0.04, rh - 0.06, 0.04);
      q.box(M.metal, 0x8a8e90, 0, -0.06, 0.05, 0.2, 0.03, 0.03);
      q.slab(M.metal, 0x9a9ea0, 0, -0.2, -0.85, cw - 0.12, 0.04, 1.7); // 拉出來的托盤
      q.slab(M.matte, 0xd8d6cc, 0, -0.16, -0.95, cw - 0.2, 0.14, 1.3); // 白布
    }, M.metal);
    const order = (spec.order || [3, 1, 5]).map(Number);
    const st = { step: 0, solved: false, out: new Set() };
    const items = [];
    for (const p of plates) {
      const base = api.mtx(s, p.x, p.y, d + 0.02);
      const di = door.add(s.li, base);
      const it = { p, base, di, k: 0, want: 0 };
      items.push(it);
      api.reg(s, p.x, p.y - 0.06, d + 0.08, {
        id: `${spec.id || 'morgue'}:${p.n}`, kind: 'morgue', name: `冰櫃 ${String(p.n).padStart(2, '0')}`, reach: 1.9, radius: 0.18, cooldown: 0.6,
        prompt: () => (it.want ? `推回冰櫃 ${String(p.n).padStart(2, '0')}` : `拉開冰櫃 ${String(p.n).padStart(2, '0')}`),
        onUse: () => {
          it.want = it.want ? 0 : 1;
          const wp = api.wp(s, p.x, p.y, d + 0.3);
          (it.want ? ixs.drawerOpen : ixs.drawerClose)(wp);
          sfx.scare('metal_scrape', wp);
          if (!st.anim) st.anim = ix.tick((dt) => { let busy = false; for (const q of items) { if (q.k !== q.want) { q.k += Math.sign(q.want - q.k) * Math.min(Math.abs(q.want - q.k), dt / 0.6); busy = true; } door.set(q.di, q.base.clone().multiply(T(0, 0, 0.85 * q.k))); } if (!busy) { st.anim = null; return false; } return true; });
          if (!it.want || st.solved) return;
          if (order[st.step] === p.n) {
            st.step++;
            if (st.step >= order.length) { st.solved = true; ix.after(0.8, () => { api.loot(spec.loot || { item: 'fuse' }, wp); ix.flags.set(spec.flag || 'h.morgue.solved', true); }); }
          } else { // 拉錯
            st.step = 0;
            sfx.scare(R() < 0.5 ? 'breath_close' : 'knock', wp);
            ix.flags.inc('h.morgue.wrong');
            if (spec.wrong === 'crawler' && game.phase === 'fighting' && (!game.net || game.net.isHost)) { game.queue?.unshift('crawler'); game.toSpawn = (game.toSpawn || 0) + 1; game.spawnTimer = Math.min(game.spawnTimer ?? 1, 0.6); }
            api.toast('白布底下……動了一下', '#c89a9a');
          }
        },
        reset: () => { it.want = 0; it.k = 0; door.set(it.di, it.base); st.step = 0; st.solved = false; },
      });
    }
    return items;
  },
};

// 掉在地上/桌上的道具
const ITEM_MODEL = {
  fuse: (q, M) => { q.cyl(M.matte, 0xe8e0c8, 0, 0.02, 0, 0.035, 0.1, 10, 0, 0, Math.PI / 2); for (const sx of [-1, 1]) q.cyl(M.metal, 0xc8a050, sx * 0.055, 0.02, 0, 0.038, 0.02, 10, 0, 0, Math.PI / 2); },
  oil: (q, M) => { q.slab(M.paint, 0xb82a1c, 0, 0, 0, 0.34, 0.44, 0.18); q.box(M.paint, 0xb82a1c, 0.0, 0.47, 0, 0.2, 0.03, 0.04); q.cyl(M.metal, 0x444444, 0.12, 0.47, 0, 0.04, 0.06, 8); },
  key: (q, M) => { q.torus(M.metal, 0xb8a060, 0, 0.004, 0, 0.04, 0.18, Math.PI / 2, 0, 0, 12); q.box(M.metal, 0xb8a060, 0.05, 0.004, 0, 0.06, 0.006, 0.012); q.box(M.metal, 0xb8a060, 0.075, 0.004, 0.008, 0.008, 0.006, 0.012); q.box(M.paint, 0xd82a20, -0.03, 0.004, 0.04, 0.05, 0.004, 0.03); },
  card: (q, M) => { q.box(M.plastic, 0xe8e8f0, 0, 0.002, 0, 0.086, 0.004, 0.054); q.box(M.plastic, 0x2a5a9a, 0, 0.0045, -0.015, 0.086, 0.001, 0.02); },
};
export const pickup = {
  build(api, s, spec = {}) {
    const { kit, M, ix } = api;
    if (spec.note && !spec.item) return note.build(api, s, { ...spec, style: spec.style || 'paper' });
    const id = spec.item || 'fuse', mk = ITEM_MODEL[id.startsWith('key') ? 'key' : id.startsWith('card') ? 'card' : id] || ITEM_MODEL.fuse;
    const pool = kit.pool('item:' + id, (q) => mk(q, M), M.plastic);
    const y = s.host ? s.host.y : 0;
    const L = s.host ? api.mtx(s, s.host.x, y, s.host.z, api.R() * 6) : api.mtx(s, 0, 0, 0.45, api.R() * 6);
    const pi = pool.add(s.li, L);
    const v = new THREE.Vector3(0, 0.04, 0).applyMatrix4(L);
    const st = { taken: false };
    return ix.register({ x: v.x, y: v.y, z: v.z }, {
      id: spec.id || `item:${id}:${Math.round(v.x * 10)}`, kind: 'pickup', name: ix.inv.name(id), reach: 1.9, radius: 0.12, scope: 'map', once: 'run', priority: 3,
      usedText: '', prompt: () => (st.taken ? null : `撿起${ix.inv.name(id)}`),
      onUse: () => { st.taken = true; pool.set(pi, ZERO); api.give(id, spec.n || 1, spec.label); if (spec.flag) ix.flags.set(spec.flag, true); if (spec.note) ix.after(0.5, () => api.note(spec.note)); },
      reset: () => { st.taken = false; pool.set(pi, L); },
    });
  },
};

// 看得到的文字:紙條(桌上/地上)、夾板、白板、告示、登記簿、照片、蠟筆畫。按 E 打開閱讀器。
const PAPER = () => canvasTex('paperGeneric', 128, 160, (x, w, h) => { x.fillStyle = '#e6dcc4'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(60,50,40,.55)'; for (let i = 0; i < 11; i++) { x.beginPath(); x.moveTo(12, 22 + i * 12); for (let k = 12; k < w - 12 - (i % 3) * 14; k += 6) x.lineTo(k, 22 + i * 12 + Math.sin(k * 0.9 + i) * 1.4); x.stroke(); } x.fillStyle = 'rgba(120,80,40,.18)'; x.beginPath(); x.arc(96, 120, 22, 0, 6.28); x.fill(); });
const BOARD = () => canvasTex('boardGeneric', 256, 160, (x, w, h) => { x.fillStyle = '#e8ecea'; x.fillRect(0, 0, w, h); x.font = `16px ${HAND}`; x.fillStyle = '#1a2a6a'; const L = ['封院第 7 天', '207：護理長', '3F：大新', '體溫 08:00・20:00']; L.forEach((t, i) => x.fillText(t, 14, 26 + i * 22)); x.fillStyle = '#b02020'; x.fillText('晚上廣播叫人　不要下樓', 14, 136); x.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 20; i++) { x.beginPath(); x.moveTo(Math.random() * w, Math.random() * h); x.lineTo(Math.random() * w, Math.random() * h); x.stroke(); } });
const DRAW = () => canvasTex('crayonGeneric', 128, 96, (x, w, h) => { x.fillStyle = '#f4f0e6'; x.fillRect(0, 0, w, h); x.lineWidth = 3; x.strokeStyle = '#3a2a8a'; x.beginPath(); x.arc(40, 40, 12, 0, 6.28); x.stroke(); x.strokeStyle = '#2a2a2a'; x.beginPath(); x.moveTo(28, 38); x.arc(40, 38, 13, Math.PI, 0); x.stroke(); x.strokeStyle = '#c03030'; x.beginPath(); x.moveTo(100, 12); x.lineTo(108, 40); x.lineTo(92, 40); x.closePath(); x.stroke(); x.fillStyle = '#e02020'; x.beginPath(); x.arc(100, 10, 3, 0, 6.28); x.fill(); x.strokeStyle = '#2a8a3a'; x.beginPath(); x.moveTo(0, 80); x.quadraticCurveTo(60, 50, 128, 82); x.stroke(); for (let i = 0; i < 4; i++) { x.strokeStyle = '#d08030'; x.beginPath(); x.arc(20 + i * 22, 74, 5, 0, 6.28); x.stroke(); } });
const BOOK = () => canvasTex('bookGeneric', 256, 128, (x, w, h) => { x.fillStyle = '#efe8d4'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8ccb0'; x.fillRect(w / 2 - 2, 0, 4, h); x.strokeStyle = 'rgba(60,70,120,.4)'; for (let i = 0; i < 9; i++) for (const ox of [10, w / 2 + 10]) { x.beginPath(); x.moveTo(ox, 14 + i * 12); x.lineTo(ox + w / 2 - 24, 14 + i * 12); x.stroke(); } x.fillStyle = '#2a2a3a'; x.font = `10px ${HAND}`; ['5/5 08:10 入：林', '5/5 14:00 入：林', '5/5 23:47 入：王（神經科）', '5/5 23:55 入：林'].forEach((t, i) => x.fillText(t, 12, 12 + i * 12)); });
const POL = () => canvasTex('polGeneric', 96, 112, (x, w, h) => { x.fillStyle = '#f4f2ec'; x.fillRect(0, 0, w, h); const g = x.createLinearGradient(0, 6, 0, 86); g.addColorStop(0, '#5a6a7a'); g.addColorStop(1, '#2a2a30'); x.fillStyle = g; x.fillRect(6, 6, w - 12, 80); x.fillStyle = 'rgba(240,230,200,.5)'; x.fillRect(28, 40, 14, 40); x.fillRect(52, 46, 12, 34); x.fillStyle = '#3a3a3a'; x.font = `9px ${HAND}`; x.fillText('封院第三天　頂樓', 12, 102); });
export const note = {
  build(api, s, spec = {}) {
    const { kit, M, ix, R } = api;
    const style = spec.style || 'paper';
    const m = new Model();
    let focus, mat, w, h;
    if (style === 'whiteboard') {
      m.box(M.metal, 0xb8bcbe, 0, 1.45, 0.012, 1.24, 0.84, 0.024); m.box(M.metal, 0x888c8e, 0, 1.0, 0.04, 1.2, 0.03, 0.06);
      for (let i = 0; i < 3; i++) m.cyl(M.plastic, [0x1a2a6a, 0xb02020, 0x1a6a2a][i], -0.3 + i * 0.08, 1.03, 0.05, 0.016, 0.12, 8, 0, 0, Math.PI / 2);
      mat = texMat('board', BOARD()); w = 1.18; h = 0.78;
      m.quad(mat, 0, 1.45, 0.026, w, h); focus = [0, 1.45, 0.05];
    } else if (style === 'poster') {
      mat = texMat('paper', PAPER()); m.quad(mat, 0, 1.55, 0.006, 0.42, 0.56); m.box(M.metal, 0x888888, 0, 1.82, 0.008, 0.012, 0.012, 0.006); focus = [0, 1.55, 0.03];
    } else if (style === 'drawing') {
      mat = texMat('crayon', DRAW()); m.quad(mat, 0, 1.0, 0.006, 0.4, 0.3, 0, 0, (R() - 0.5) * 0.12); focus = [0, 1.0, 0.03];
    } else if (style === 'clipboard') {
      m.box(M.wood, 0x8a6a40, 0, 1.4, 0.008, 0.24, 0.32, 0.01); m.box(M.metal, 0x999999, 0, 1.55, 0.016, 0.1, 0.03, 0.01);
      mat = texMat('paper', PAPER()); m.quad(mat, 0, 1.39, 0.014, 0.21, 0.27); focus = [0, 1.4, 0.03];
    } else { // 紙條/登記簿/照片:放在台面上(host)或自己帶一張小凳子
      const y = s.host ? s.host.y : 0.46;
      if (!s.host) { m.slab(M.paint, 0x5a6a70, 0, 0, 0.35, 0.36, 0.44, 0.36); m.slab(M.paint, 0x4a5a60, 0, 0.44, 0.35, 0.4, 0.02, 0.4); }
      const hx = s.host ? s.host.x : 0, hz = s.host ? s.host.z : 0.35;
      if (style === 'logbook') { mat = texMat('book', BOOK()); m.box(M.matte, 0x5a2a20, hx, y + 0.008, hz, 0.42, 0.016, 0.3); m.quad(mat, hx, y + 0.018, hz, 0.4, 0.28, -Math.PI / 2); m.cyl(M.plastic, 0x1a3a8a, hx + 0.12, y + 0.022, hz + 0.08, 0.008, 0.13, 6, 0, 0.6, Math.PI / 2); }
      else if (style === 'photo' || style === 'polaroid') { mat = texMat('pol', POL()); m.quad(mat, hx, y + 0.004, hz, 0.09, 0.105, -Math.PI / 2, R() * 6); }
      else { mat = texMat('paper', PAPER()); m.quad(mat, hx, y + 0.003, hz, 0.2, 0.26, -Math.PI / 2, R() * 0.8 - 0.4); }
      focus = [hx, y + 0.02, hz];
      if (!s.host) api.box(s, -0.2, 0.17, 0.2, 0.53, 0.47, 0, 'metal');
    }
    kit.static(m, api.mtx(s), s.li);
    const nid = spec.note;
    const nm = { whiteboard: '白板', logbook: '進出登記', poster: '告示', drawing: '蠟筆畫', photo: '照片', polaroid: '拍立得', clipboard: '夾板上的紙' }[style] || '紙條';
    const base = {
      id: spec.id || `note:${nid || 'x'}:${Math.round(s.x)}`, kind: 'note', name: nm, reach: style === 'whiteboard' ? 2.6 : 1.9, radius: style === 'whiteboard' ? 0.5 : 0.16, scope: 'map', priority: 4,
      prompt: () => (ix.flags.has('note.' + nid) ? `再看一次${nm}` : `看${nm}`),
      onUse: () => { if (!api.note(nid)) api.toast('（字跡糊掉了，看不清楚）', '#a3a39a'); },
    };
    return api.reg(s, ...focus, base);
  },
};

// 禮拜堂的蠟燭架:按一下點一根(怪談錄記一筆;結局會記得你點了幾根)
export const candle = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R } = api;
    const m = new Model(), n = 12;
    m.slab(M.metal, 0x3a3226, 0, 0, 0.3, 0.9, 0.04, 0.36);
    m.slab(M.metal, 0x5a4a30, 0, 0.04, 0.3, 0.06, 0.8, 0.06);
    for (let r = 0; r < 2; r++) m.slab(M.metal, 0x6a5a38, 0, 0.84 + r * 0.14, 0.3 - r * 0.08, 0.86, 0.02, 0.16);
    const pos0 = [];
    for (let i = 0; i < n; i++) { const r = i % 2, x = -0.36 + Math.floor(i / 2) * 0.144, y = 0.86 + r * 0.14, z = 0.3 - r * 0.08 + (R() - 0.5) * 0.03, hgt = 0.06 + R() * 0.07; m.cyl(M.matte, 0xe8e0c8, x, y + hgt / 2, z, 0.025, hgt, 8); pos0.push([x, y + hgt + 0.012, z]); }
    m.box(M.metal, 0x5a4a30, 0, 0.6, 0.48, 0.16, 0.12, 0.06); // 捐獻箱
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -0.46, 0.1, 0.46, 0.5, 1.05, 0, 'metal');
    const flame = kit.pool('flame', (q) => { q.cone(api.M.glow, 0xffc060, 0, 0, 0, 0.012, 0.03, 0.05, 6); }, api.M.glow);
    const lit = pos0.map((p) => ({ i: flame.add(s.li, ZERO), m: api.mtx(s, ...p) }));
    let k = 0;
    const pos = api.wp(s, 0, 0.95, 0.3);
    return ix.register(pos, {
      id: spec.id || 'candles', kind: 'candle', name: '蠟燭架', reach: 1.9, radius: 0.45, scope: 'map', cooldown: 1.2,
      prompt: () => (k >= n ? { text: '蠟燭架 · 全部點亮了', dim: true } : '點一根蠟燭'),
      onUse: () => {
        if (k >= n) return false;
        flame.set(lit[k].i, lit[k].m); k++;
        ixs.switchClick(pos, true);
        ix.flags.inc('h.candles'); ix.flags.inc('meta.candles');
        if (k === 1) api.feed('火光在聖像的臉上晃了一下。', '#ffd27a');
        ix.emit('candle', k);
      },
      reset: () => { for (const c of lit) flame.set(c.i, ZERO); k = 0; },
    });
  },
};

// 噴水池的聖母像(現有道具錨點):丟一枚銅板,滿 7 次底座出現字條
export const fountain = {
  build(api, ev, spec = {}) {
    const { ix, ixs, game } = api;
    const pos = { x: ev.x, y: ev.y + 0.6, z: ev.z };
    const need = spec.coins || 7;
    let n = 0;
    return ix.register(pos, {
      id: spec.id || 'fountain', kind: 'fountain', name: '乾涸的噴水池', reach: 3.2, radius: 1.0, scope: 'map', cooldown: 1,
      prompt: () => (n >= need ? '看底座的字條' : `往池子裡丟一枚銅板（${n}/${need}）`),
      when: () => (n < need && (game.player.coins || 0) < 1 ? '乾涸的噴水池 · 身上沒有錢' : true),
      onUse: () => {
        if (n >= need) { api.note(spec.note); return; }
        game.player.coins -= 1; game.ui.setCoins(game.player.coins);
        n++; ixs.coin({ x: ev.x, y: ev.y + 0.2, z: ev.z });
        ix.flags.set('h.fountain', n);
        if (n >= need) { ix.after(1, () => { api.toast('底座的縫裡露出一張摺起來的紙', '#e8d9a8'); }); ix.emit('fountain', n); }
      },
      reset: () => { n = 0; },
    });
  },
};

// 監控室的「聽話」零食(機房傳統):拿走 → 螢幕全部雪花 10 秒(發事件給監視器/靈異系統);放回去就好了
export const snack = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx } = api;
    const y = s.host ? s.host.y : 0.75;
    const L = s.host ? api.mtx(s, s.host.x, y, s.host.z, 0.4) : api.mtx(s, 0, 0, 0.3);
    const m = new Model();
    if (!s.host) { m.slab(M.paint, 0x6a6e70, 0, 0, 0.3, 0.5, 0.72, 0.4); kit.static(m, api.mtx(s), s.li); }
    const bag = kit.pool('snack', (q) => { q.box(M.gloss, 0x2aa04a, 0, 0.09, 0, 0.14, 0.18, 0.05); q.box(M.gloss, 0xf2e040, 0, 0.12, 0.026, 0.1, 0.05, 0.002); q.box(M.gloss, 0x1a7a3a, 0, 0.185, 0, 0.14, 0.012, 0.03); }, M.gloss);
    const sm = s.host ? L : L.clone().multiply(T(0, 0.72, 0));
    const bi = bag.add(s.li, sm);
    const v = new THREE.Vector3(0, 0.1, 0).applyMatrix4(sm);
    const st = { taken: false };
    return ix.register({ x: v.x, y: v.y, z: v.z }, {
      id: spec.id || 'snack', kind: 'snack', name: '一包「聽話」', reach: 1.8, radius: 0.12, scope: 'map', cooldown: 1,
      prompt: () => (st.taken ? '把零食放回去' : '拿走那包「聽話」'),
      onUse: () => {
        st.taken = !st.taken;
        bag.set(bi, st.taken ? ZERO : sm);
        ixs.paper();
        if (st.taken) { sfx.scare('tv_static', v); api.toast('所有的監視器同時變成雪花', '#a3a39a'); ix.flags.set('h.snack', true); }
        else api.toast('……畫面回來了', '#a3a39a');
        ix.emit('snack', st.taken);
      },
      reset: () => { st.taken = false; bag.set(bi, sm); },
    });
  },
};
