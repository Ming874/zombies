import * as THREE from 'three';
import { Model, T, canvasTex, texMat, FONT } from '../kit.js';

// 機關與設備:電燈開關(用光源池的燈具狀態,不新增燈)、販賣機(投 5 元喝一罐)、電梯呼叫鈕(現有電梯)、
// 遺體專用貨梯(門會打開,裡面有東西)、火警拉桿(引來屍群;那一波活屍倒下會多掉錢)、廣播麥克風、洗手台、
// 護理呼叫鈕、密碼鍵盤、病歷終端(大新 HIS v4)、保險絲盒 / 發電機配電(目標系統可以用的旗標與道具)。
const ZERO = T(0, -50, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001);
const ledPool = (api) => api.kit.pool('led', (m) => { m.box(api.M.led, 0xffffff, 0, 0, 0, 1, 1, 1); }, api.M.led);

// ---------- 電燈開關 ----------
// 關:那一區的燈具 ov = 0(每幀維持,驚嚇事件結束時把 ov 設回 1 也會被壓回去);開:燈管啟動的閃爍。
// 有時候你關掉之後,幾秒後燈自己又亮了(開關「喀」一聲)。
export const lightswitch = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R, game } = api;
    const target = spec.target || s.zone?.id;
    const fx = api.fixtures(target);
    const m = new Model();
    m.box(M.plastic, 0xe8e4d8, 0, 1.25, 0.006, 0.075, 0.12, 0.012);
    m.box(M.plastic, 0xd8d4c8, 0, 1.25, 0.013, 0.05, 0.08, 0.004);
    kit.static(m, api.mtx(s), s.li);
    const tog = kit.pool('toggle', (q) => { q.box(M.plastic, 0xf2efe6, 0, 0.012, 0, 0.012, 0.026, 0.012); }, M.plastic);
    const base = api.mtx(s, 0, 1.25, 0.016);
    const on0 = !fx.length || fx.some((f) => f.state !== 2);
    const st = { on: on0, enforce: null, flick: 0 };
    const ti = tog.add(s.li, base.clone().multiply(T(0, 0, 0, st.on ? 0.5 : -0.5 + Math.PI)));
    const pos = api.wp(s, 0, 1.25, 0.03);
    const powered = () => !spec.circuit || ix.flags.has(spec.circuit);
    const apply = (on, sound = true) => {
      st.on = on;
      tog.set(ti, base.clone().multiply(T(0, 0, 0, on ? 0.5 : -0.5 + Math.PI)));
      if (sound) ixs.switchClick(pos, on);
      if (!on) {
        for (const f of fx) f.ov = 0;
        st.enforce ||= ix.tick(() => { if (st.on) { st.enforce = null; return false; } for (const f of fx) f.ov = 0; return true; });
      } else {
        if (!powered()) { api.toast('沒有電', '#a3a39a'); return; }
        st.flick = 0.9;
        const dead = fx.length && fx.every((f) => f.state === 2);
        const tick = ix.tick((dt) => { // 燈管啟動:喀喀閃幾下才亮;壞掉的只閃一下
          st.flick -= dt;
          for (const f of fx) f.ov = st.flick > 0 ? (Math.random() < 0.5 ? 0.05 : 0.9) : 1;
          if (st.flick <= 0) { if (dead) api.toast('燈管壞了', '#a3a39a'); return false; }
          return true;
        });
        void tick;
        if (fx.length) api.sfx.scare('lights_flicker', { x: fx[0].x, y: fx[0].y, z: fx[0].z });
      }
      ix.flags.set('h.light.' + target, on);
      ix.emit('lights', target, on);
    };
    return ix.register(pos, {
      id: spec.id || `sw:${target}:${Math.round(pos.x)}_${Math.round(pos.z)}`, kind: 'switch', name: '電燈開關', reach: 1.8, radius: 0.08, scope: 'map', cooldown: 0.35,
      prompt: () => (st.on ? '關燈' : '開燈'),
      onUse: () => {
        apply(!st.on);
        if (!st.on && R() < 0.14) ix.after(3 + R() * 5, () => { if (!st.on) { apply(true); const t = api.LINES.MISC?.lightsBack; if (t && api.near(pos, 14)) api.feed(t, '#bfb6d8'); } });
      },
      reset: () => { st.on = on0; st.flick = 0; tog.set(ti, base.clone().multiply(T(0, 0, 0, on0 ? 0.5 : -0.5 + Math.PI))); for (const f of fx) f.ov = 1; }, // 安靜地回到開局狀態(不閃、不提示)
    });
  },
};

// ---------- 販賣機 ----------
function vendTex() {
  return canvasTex('vend', 256, 384, (x, w, h) => {
    x.fillStyle = '#10161a'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(200,230,255,.22)'); g.addColorStop(1, 'rgba(120,160,190,.05)');
    const cans = ['#c8202a', '#e8e0c8', '#2a6ac8', '#e8a020', '#2a8a4a', '#6a3a8a', '#d8d020', '#8a5a2a'];
    for (let r = 0; r < 5; r++) {
      x.fillStyle = '#1c2428'; x.fillRect(10, 18 + r * 66, w - 20, 56);
      for (let k = 0; k < 6; k++) {
        const c = cans[(r * 3 + k * 5) % cans.length], cx = 24 + k * 37, cy = 22 + r * 66;
        if ((r * 7 + k * 3) % 11 === 0) continue; // 賣完了
        x.fillStyle = c; x.fillRect(cx, cy, 24, 44);
        x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(cx + 3, cy + 4, 4, 36);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(cx, cy + 30, 24, 6);
      }
      x.fillStyle = '#d8e8f0'; x.font = `bold 11px ${FONT}`;
      for (let k = 0; k < 6; k++) x.fillText('5', 32 + k * 37, 74 + r * 66);
    }
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 9; x.beginPath(); x.moveTo(40, h); x.lineTo(w, 60); x.stroke();
  });
}
export const vending = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R, game } = api;
    const W = 0.92, H = 1.84, D = 0.78, z0 = 0.06;
    const body = spec.color ?? [0xb82a26, 0xe8e4dc, 0x2a5a9a][(R() * 3) | 0];
    const m = new Model();
    m.slab(M.paint, body, 0, 0.06, z0 + D / 2, W, H - 0.06, D);
    m.slab(M.matte, 0x1a1a1a, 0, 0, z0 + D / 2, W - 0.04, 0.06, D - 0.04);
    m.box(M.paint, 0x222222, -0.1, 1.05, z0 + D + 0.002, 0.64, 1.3, 0.006); // 展示窗框
    m.box(M.paint, body, 0.35, 1.0, z0 + D + 0.004, 0.18, 1.5, 0.01);
    m.box(M.metal, 0x9aa0a2, 0.35, 1.32, z0 + D + 0.012, 0.08, 0.12, 0.012);
    m.box(M.matte, 0x111111, 0.35, 1.36, z0 + D + 0.02, 0.012, 0.04, 0.004); // 投幣口
    m.box(M.glow, 0x7a3a10, 0.35, 1.5, z0 + D + 0.012, 0.12, 0.05, 0.006); // 價格液晶
    m.box(M.metal, 0x777777, 0.35, 1.18, z0 + D + 0.012, 0.06, 0.06, 0.012); // 退幣鈕
    m.box(M.matte, 0x0c0c0c, -0.05, 0.22, z0 + D + 0.006, 0.52, 0.2, 0.012); // 取物口
    m.box(M.paint, body, 0, H - 0.08, z0 + D + 0.006, W, 0.14, 0.012);
    for (let i = 0; i < 6; i++) m.box(M.plastic, 0xdddddd, 0.35, 0.92 - i * 0.075, z0 + D + 0.012, 0.07, 0.04, 0.012);
    m.box(M.matte, 0x222222, 0, 0.4, z0 + 0.02, W - 0.1, 0.5, 0.02); // 背後的散熱
    kit.static(m, api.mtx(s), s.li);
    const vm = new Model(); vm.quad(texMat('vend', vendTex(), { basic: true }), -0.1, 1.05, z0 + D + 0.008, 0.6, 1.26);
    kit.static(vm, api.mtx(s), s.li);
    const sign = new Model(); sign.quad(texMat('vsign', canvasTex('vsign', 256, 40, (x, w, h) => { x.fillStyle = '#f2ede0'; x.fillRect(0, 0, w, h); x.fillStyle = '#b82a26'; x.font = `bold 26px ${FONT}`; x.textAlign = 'center'; x.fillText('冷飲 · 5 元', w / 2, 29); }), { basic: true }), 0, H - 0.08, z0 + D + 0.014, 0.8, 0.12);
    kit.static(sign, api.mtx(s), s.li);
    api.box(s, -W / 2, z0, W / 2, z0 + D, H, 0, 'heavy');
    const flap = kit.pool('flap', (q) => { q.box(M.plastic, 0x2a2a2a, 0, -0.08, 0.004, 0.5, 0.16, 0.008); }, M.plastic);
    const fm = api.mtx(s, -0.05, 0.31, z0 + D + 0.014);
    const fi = flap.add(s.li, fm);
    const pos = api.wp(s, 0.2, 1.2, z0 + D + 0.05);
    const tray = api.wp(s, -0.05, 0.25, z0 + D + 0.15);
    const price = spec.price ?? 5, heal = spec.heal ?? 5, per = spec.perRound ?? 3;
    sfx.loopStart('ixv' + Math.round(pos.x * 10) + '_' + Math.round(pos.z * 10), 'fridge', api.wp(s, 0, 1.0, z0 + D / 2));
    const st = { n: 0, round: -1 };
    const can = (special) => { // 罐子滾出取物口(物理碎片;沒有物理就只有聲音)
      const ph = game.physics;
      flap.set(fi, fm.clone().multiply(T(0, 0, 0, -0.9)));
      ix.after(0.8, () => flap.set(fi, fm));
      if (!ph?.ready) return;
      const cm = new Model(); cm.cyl(M.metal, special ? 0x7a9a4a : [0xc8202a, 0x2a6ac8, 0xe8a020][(R() * 3) | 0], 0, 0, 0, 0.066, 0.12, 10);
      const mesh = new THREE.Mesh(cm.geometry(), M.metal);
      mesh.position.set(tray.x, tray.y, tray.z);
      game.scene.add(mesh);
      const n = api.wp(s, 0, 0, 1); const o = api.wp(s, 0, 0, 0);
      ph.addDebris(mesh, { vel: { x: (n.x - o.x) * 1.2, y: 0.6, z: (n.z - o.z) * 1.2 }, mass: 0.35, life: 9, shape: 'cylinder' });
    };
    return ix.register(pos, {
      id: spec.id || `vend${Math.round(pos.x)}_${Math.round(pos.z)}`, kind: 'vending', name: '自動販賣機', reach: 2.0, radius: 0.35, scope: 'map', cooldown: 2.2,
      prompt: () => `投 ${price} 元買一罐飲料`,
      when: () => {
        if (st.round === game.round && st.n >= per) return '自動販賣機 · 賣完了（下一波補貨）';
        if ((game.player.coins || 0) < price) return `自動販賣機 · 需要 ${price} 元`;
        return true;
      },
      onUse: () => {
        const p = game.player;
        p.coins -= price; game.ui.setCoins(p.coins); game.ui.spend?.(price);
        if (st.round !== game.round) { st.round = game.round; st.n = 0; }
        st.n++;
        if (game.stats) game.stats.spent = (game.stats.spent || 0) + price;
        ixs.coin(pos);
        const sp = spec.special, special = sp && R() < (sp.chance ?? 1 / 30) && !ix.flags.has('h.vend.special');
        ix.after(0.55, () => ixs.vendButton(pos));
        ix.after(1.0, () => { ixs.vendDrop(tray); can(special); });
        ix.after(2.2, () => {
          ixs.canOpen(); ix.after(0.4, () => ixs.drink());
          const g = api.heal(heal);
          if (special) { ix.flags.set('h.vend.special', true); api.toast(`${sp.name || '冬瓜茶'}${sp.label ? `「${sp.label}」` : ''}`, '#c8e0a0', '罐身貼著一張發黃的貼紙'); if (sp.note) ix.after(1.2, () => api.note(sp.note)); }
          else api.toast(g > 0 ? `+${Math.round(g)} 生命` : '冰的', '#7dffae', g > 0 ? '還冰的' : undefined);
        });
        ix.emit('vend', special);
      },
      reset: () => { st.n = 0; st.round = -1; },
    });
  },
};

// ---------- 電梯呼叫鈕(現有電梯;門是牆的一部分,不會打開)----------
// 叮一聲、樓層燈閃到你這層、門後有人敲門;連按 10 下:叮,井道裡傳出音樂盒的聲音
export const elevator = {
  build(api, el, spec = {}) {
    const { kit, M, ix, ixs, sfx, R } = api;
    const led = ledPool(api);
    const sg = el.sg, isH = el.isH;
    const n = isH ? { x: 0, z: sg } : { x: sg, z: 0 };
    const pos = { x: el.x + n.x * 0.02, y: el.y + 0.05, z: el.z + n.z * 0.02 };
    const lm = T(pos.x + n.x * 0.005, el.y + 0.06, pos.z + n.z * 0.005, 0, Math.atan2(n.x, n.z), 0, 0.03, 0.03, 0.006);
    const li = led.add(el.li, lm, 0x140a04);
    const st = { busy: false, presses: 0, last: -9 };
    const e = ix.register(pos, {
      id: `lift:${el.li}:${Math.round(el.x)}_${Math.round(el.z)}`, kind: 'elevator', name: '電梯', reach: 1.8, radius: 0.12, scope: 'map', cooldown: 0.4,
      prompt: () => (st.busy ? '電梯 · 正在下來…' : '按電梯'),
      onUse: () => {
        const g = api.game;
        st.presses = g.time - st.last < 2 ? st.presses + 1 : 1;
        st.last = g.time;
        ixs.switchClick(pos, true);
        led.color(li, 0xffb040);
        if (st.presses >= 10) { st.presses = 0; ix.after(1.2, () => { ixs.elevatorDing(pos); ixs.musicBox({ x: el.x, y: el.y + 1.2, z: el.z }, 8, true); api.feed('（井道裡，有人在轉音樂盒的發條）', '#bfb6d8'); ix.flags.set('h.lift.ten', true); }); return; }
        if (st.busy) return;
        st.busy = true;
        ixs.elevatorMotor({ x: el.x, y: el.y + 1.5, z: el.z });
        ix.after(3.4, () => {
          ixs.elevatorDing({ x: el.x, y: el.y + 2.2, z: el.z });
          const L = api.lineList('ELEVATOR');
          const l = L.length ? L[(R() * L.length) | 0] : null;
          const kind = l?.event || (R() < 0.5 ? 'knock' : 'empty');
          if (kind === 'knock' || R() < 0.3) ix.after(1.2, () => sfx.scare('knock', { x: el.x, y: el.y + 1.2, z: el.z }));
          if (l?.text && api.near(pos, 10)) api.feed(l.text, '#bfb6d8');
          ix.after(2, () => { led.color(li, 0x140a04); st.busy = false; });
          ix.flags.set('h.ev.lift', true);
          ix.emit('elevator', el, kind);
        });
      },
      reset: () => { st.busy = false; led.color(li, 0x140a04); },
    });
    return e;
  },
};

// ---------- 遺體專用貨梯(自己的一組:外框、兩扇橫拉門、裡面的車廂和東西)----------
export const lift = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R } = api;
    const W = 1.9, D = 1.6, Hh = 2.45;
    const m = new Model();
    const steel = 0x8e9396, dark = 0x2c2f30;
    m.slab(M.metal, steel, 0, 0, 0.06, W + 0.3, Hh + 0.25, 0.12); // 外框牆板
    m.slab(M.matte, 0x1a1c1c, 0, 0.002, 0.13 + D / 2, W, 0.01, D); // 車廂地板
    m.slab(M.metal, 0x6a6e70, -W / 2 + 0.02, 0, 0.13 + D / 2, 0.04, Hh, D); // 車廂側壁
    m.slab(M.metal, 0x6a6e70, W / 2 - 0.02, 0, 0.13 + D / 2, 0.04, Hh, D);
    m.slab(M.metal, 0x5a5e60, 0, 0, 0.14, W, Hh, 0.03);
    m.slab(M.metal, 0x5a5e60, 0, Hh - 0.02, 0.13 + D / 2, W, 0.04, D);
    m.box(M.glow, 0x7a7a5a, 0, Hh - 0.05, 0.13 + D / 2, 0.5, 0.02, 0.12); // 頂燈(暗黃)
    for (let i = 0; i < 4; i++) m.box(M.metal, 0x54585a, 0, 0.9 + i * 0.12, 0.17, W - 0.1, 0.03, 0.02); // 防撞條
    m.slab(M.metal, steel, -W / 2 - 0.15, 0, 0.13 + D / 2, 0.12, Hh + 0.25, D + 0.02); // 外殼
    m.slab(M.metal, steel, W / 2 + 0.15, 0, 0.13 + D / 2, 0.12, Hh + 0.25, D + 0.02);
    m.slab(M.metal, steel, 0, Hh, 0.13 + D / 2, W + 0.42, 0.25, D + 0.02);
    m.box(M.paint, 0xb8a040, 0, Hh + 0.12, 0.13 + D + 0.02, 0.9, 0.12, 0.008);
    m.box(M.metal, 0x777b7d, W / 2 + 0.3, 1.2, 0.13 + D + 0.02, 0.1, 0.2, 0.02); // 呼叫盒
    const contents = spec.contents || ['gurney', 'sheet', 'wheelchair', 'empty'][(R() * 4) | 0];
    const cz = 0.13 + D / 2 - 0.2;
    if (contents === 'gurney' || contents === 'sheet') {
      m.slab(M.metal, 0xb0b4b6, 0, 0.62, cz, 0.62, 0.05, 1.3);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.slab(M.metal, 0x9a9ea0, sx * 0.26, 0.1, cz + sz * 0.55, 0.03, 0.52, 0.03);
      m.slab(M.matte, contents === 'sheet' ? 0xd8d6cc : 0x1a1d22, 0, 0.67, cz, 0.52, 0.18, 1.1);
      m.sph(M.matte, contents === 'sheet' ? 0xd8d6cc : 0x1a1d22, 0, 0.82, cz - 0.42, 0.24, 10, 0.16, 0.26);
    } else if (contents === 'wheelchair') {
      m.slab(M.matte, 0x222222, 0, 0.45, cz, 0.45, 0.05, 0.42); m.slab(M.matte, 0x222222, 0, 0.5, cz - 0.2, 0.45, 0.5, 0.04);
      for (const sx of [-1, 1]) m.torus(M.metal, 0x888888, sx * 0.26, 0.3, cz, 0.58, 0.05, 0, Math.PI / 2, 0, 18);
    }
    for (let i = 0; i < 3; i++) m.box(M.matte, 0x4a1210, -0.5 + i * 0.22, 1.1 + i * 0.13, 0.17, 0.12, 0.42, 0.004, 0, 0, 0.2 * i); // 手印
    kit.static(m, api.mtx(s), s.li);
    const lbl = spec.label || '遺體專用';
    const sg = new Model(); sg.quad(texMat('lift:' + lbl, canvasTex('lift:' + lbl, 256, 40, (x, w, h) => { x.fillStyle = '#b8a040'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1a1a'; x.font = `bold 26px ${FONT}`; x.textAlign = 'center'; x.fillText(lbl + ' · 貨梯', w / 2, 29); }), { basic: true }), 0, Hh + 0.12, 0.13 + D + 0.026, 0.88, 0.11);
    kit.static(sg, api.mtx(s), s.li);
    api.box(s, -W / 2 - 0.22, 0.0, W / 2 + 0.22, 0.13 + D + 0.02, Hh + 0.25, 0, 'heavy');
    const door = kit.pool('liftdoor', (q) => { q.box(M.metal, 0x9a9fa2, 0, Hh / 2, 0, W / 2 + 0.02, Hh - 0.02, 0.04); q.box(M.metal, 0x7a7e80, 0, 1.0, 0.022, W / 2 - 0.1, 0.02, 0.006); q.box(M.metal, 0x7a7e80, 0, 1.6, 0.022, W / 2 - 0.1, 0.02, 0.006); }, M.metal, { shadow: true });
    const dz = 0.13 + D + 0.05;
    const L0 = api.mtx(s, -W / 4, 0, dz), R0 = api.mtx(s, W / 4, 0, dz);
    const di = [door.add(s.li, L0), door.add(s.li, R0)];
    const led = ledPool(api); const bl = led.add(s.li, api.mtx(s, W / 2 + 0.3, 1.2, 0.13 + D + 0.032).multiply(T(0, 0, 0, 0, 0, 0, 0.03, 0.03, 0.006)), 0x140a04);
    const pos = api.wp(s, W / 2 + 0.3, 1.2, 0.13 + D + 0.05);
    const mid = api.wp(s, 0, 1.2, dz);
    const st = { k: 0, want: 0, busy: false, run: null };
    const anim = () => ix.tick((dt) => {
      st.k += Math.sign(st.want - st.k) * Math.min(Math.abs(st.want - st.k), dt / 1.6);
      const o = (W / 2 - 0.05) * st.k;
      door.set(di[0], L0.clone().multiply(T(-o, 0, 0)));
      door.set(di[1], R0.clone().multiply(T(o, 0, 0)));
      if (st.k === st.want) { st.run = null; return false; }
      return true;
    });
    return ix.register(pos, {
      id: spec.id || 'freightlift', kind: 'lift', name: `${lbl}貨梯`, reach: 1.9, radius: 0.12, scope: 'map', cooldown: 1,
      prompt: () => (st.busy ? `${lbl}貨梯 · 運轉中` : '按呼叫鈕'),
      onUse: () => {
        if (st.busy) return false;
        st.busy = true;
        led.color(bl, 0xffb040);
        ixs.switchClick(pos, true);
        ixs.elevatorMotor(mid);
        ix.after(3.2, () => {
          ixs.elevatorDing(mid);
          ix.after(0.4, () => { ixs.elevatorDoor(mid, true); st.want = 1; st.run ||= anim(); });
          ix.after(1.6, () => { if (contents === 'sheet') sfx.scare('breath_close', mid); else if (contents === 'empty') sfx.scare('whisper', mid); ix.emit('lift', contents); ix.flags.set('h.lift.open', true); });
          ix.after(8, () => { ixs.elevatorDoor(mid, false); st.want = 0; st.run ||= anim(); });
          ix.after(10, () => { led.color(bl, 0x140a04); st.busy = false; });
        });
      },
      reset: () => { st.want = 0; st.k = 0; door.set(di[0], L0); door.set(di[1], R0); st.busy = false; },
    });
  },
};

// ---------- 火警拉桿:按住拉下去 → 火警鈴 22 秒、紅燈閃;戰鬥中會多引來一波(那一波活屍倒下會多掉錢) ----------
export const alarm = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R, game } = api;
    const m = new Model();
    m.box(M.paint, 0xc8221c, 0, 1.3, 0.035, 0.13, 0.18, 0.07);
    m.box(M.matte, 0xf0ece0, 0, 1.38, 0.071, 0.1, 0.03, 0.002);
    m.box(M.matte, 0x1a1a1a, 0, 1.27, 0.071, 0.06, 0.06, 0.004);
    m.cyl(M.paint, 0xc8221c, 0, 2.15, 0.06, 0.18, 0.06, 18, Math.PI / 2);
    m.cyl(M.metal, 0xb0b0b0, 0, 2.15, 0.1, 0.03, 0.03, 8, Math.PI / 2);
    m.box(M.paint, 0xc8221c, 0, 2.35, 0.02, 0.12, 0.06, 0.04);
    kit.static(m, api.mtx(s), s.li);
    const lev = kit.pool('lever', (q) => { q.box(M.paint, 0xe8e0d0, 0, -0.03, 0.02, 0.05, 0.07, 0.025); }, M.paint);
    const lm = api.mtx(s, 0, 1.3, 0.071);
    const li = lev.add(s.li, lm);
    const led = ledPool(api); const ll = led.add(s.li, api.mtx(s, 0, 2.36, 0.042).multiply(T(0, 0, 0, 0, 0, 0, 0.08, 0.04, 0.004)), 0x200404);
    const pos = api.wp(s, 0, 1.3, 0.08);
    const key = spec.id || `alarm${Math.round(pos.x)}_${Math.round(pos.z)}`;
    const st = { on: false, t: 0, run: null, bonus: 0, t0: 0 };
    return ix.register(pos, {
      id: key, kind: 'alarm', name: '火警警報', reach: 1.8, radius: 0.1, scope: 'map', once: 'round', hold: 0.8, holdText: '拉下警報', prompt: '拉下火警警報',
      usedText: '火警警報 · 拉桿卡住了（下一波）',
      onUse: () => {
        lev.set(li, lm.clone().multiply(T(0, -0.05, 0)));
        ixs.alarmPull(pos);
        ixs.alarmStart(key, api.wp(s, 0, 2.15, 0.1));
        st.on = true; st.t = 22;
        const fight = game.phase === 'fighting' && (!game.net || game.net.isHost);
        if (fight) { // 屍群:加進這一回合的佇列
          const n = 3 + Math.min(4, (game.round / 2) | 0);
          for (let i = 0; i < n; i++) game.queue?.push(R() < 0.3 ? 'runner' : 'walker');
          game.toSpawn = (game.toSpawn || 0) + n;
          st.bonus = n; st.t0 = game.time;
          api.feed('警報聲傳遍整層樓。他們聽到了。', '#ff8a6a', 'skull');
        } else api.feed('警報響了很久。沒有人來。', '#cfc6b0');
        ix.flags.inc('h.alarm');
        st.run ||= ix.tick((dt) => {
          st.t -= dt;
          led.color(ll, (game.time * 3) % 1 < 0.5 ? 0xff2010 : 0x200404);
          if (st.bonus > 0) for (const z of game.zombies) if (!z._ixAlarm && z._born >= st.t0 && st.bonus > 0) { z._ixAlarm = true; st.bonus--; }
          if (st.t <= 0) { st.on = false; ixs.alarmStop(key); led.color(ll, 0x200404); lev.set(li, lm); }
          return st.on || game.zombies.some((z) => z._ixAlarm && !z._ixPaid);
        });
        ix.emit('alarm', pos, fight);
      },
      reset: () => { st.on = false; ixs.alarmStop(key); lev.set(li, lm); },
    });
  },
};
// 火警引來的殭屍:死掉時多掉錢(每幀檢查已標記的那幾隻)
export function alarmBonus(api) {
  const { ix, game } = api;
  ix.tick(() => { for (const z of game.zombies) if (z._ixAlarm && !z._ixPaid && !z.alive) { z._ixPaid = true; game.coins?.drop?.(z.pos.x, z.pos.y, z.pos.z, 6); } return true; });
}

// ---------- 廣播麥克風 ----------
export const pa = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, R } = api;
    const m = new Model();
    const L = s.host ? api.mtx(s, s.host.x, s.host.y, s.host.z) : api.mtx(s, 0, 0.95, 0.18);
    if (!s.host) { const sh = new Model(); sh.slab(M.wood, 0x6b5a46, 0, 0.925, 0.16, 0.5, 0.025, 0.32); for (const sx of [-1, 1]) sh.box(M.metal, 0x444444, sx * 0.19, 0.83, 0.08, 0.02, 0.2, 0.14); kit.static(sh, api.mtx(s), s.li); }
    m.slab(M.metal, 0x3a3c3c, 0, 0, 0, 0.18, 0.05, 0.14);
    m.box(M.plastic, 0xc8221c, 0.05, 0.055, 0.03, 0.03, 0.012, 0.03);
    for (let i = 0; i < 6; i++) m.cyl(M.metal, 0x777777, 0, 0.07 + i * 0.035, -0.02 + i * 0.012, 0.02, 0.036, 8, 0.35);
    m.cyl(M.metal, 0x222222, 0, 0.3, 0.06, 0.05, 0.08, 12, 1.2);
    m.box(M.paint, 0xd8d0b8, -0.02, 0.026, 0.072, 0.1, 0.03, 0.002);
    kit.static(m, L, s.li);
    const pos = { x: 0, y: 0, z: 0 };
    { const v = new THREE.Vector3(0, 0.25, 0.06).applyMatrix4(L); pos.x = v.x; pos.y = v.y; pos.z = v.z; }
    const pool = (spec.lines || []).map((id) => api.lineById(id)).filter(Boolean);
    let idx = 0;
    return ix.register(pos, {
      id: spec.id || 'pa' + Math.round(pos.x), kind: 'pa', name: '廣播麥克風', reach: 1.9, radius: 0.14, scope: 'map', hold: 1.0, holdText: '按住通話鍵', prompt: '對全院廣播', cooldown: 30,
      onHoldStart: () => ixs.paKey(pos),
      onUse: () => {
        sfx.pa('up');
        if (R() < 0.35) ix.after(1.4, () => ixs.micFeedback(null));
        const all = api.lineList('PA');
        const l = pool.length ? pool[idx++ % pool.length] : all[(R() * all.length) | 0];
        ix.after(2.2, () => {
          api.say('', '（你的聲音從天花板的喇叭傳出去，在走廊盡頭繞了一圈）', 2800);
          if (l) ix.after(3.4, () => { const h = api.speak(l, { filter: 'pa' }); ix.after(h.dur + 0.4, () => sfx.pa('down')); });
        });
        ix.flags.inc('h.pa');
        ix.emit('pa', l);
      },
    });
  },
};

// ---------- 洗手台 + 水龍頭 ----------
export const sink = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R } = api;
    const m = new Model();
    m.slab(M.gloss, 0xe8e6e0, 0, 0.78, 0.25, 0.56, 0.12, 0.44);
    m.slab(M.gloss, 0xc8c6c0, 0, 0.82, 0.27, 0.46, 0.08, 0.34);
    m.slab(M.matte, 0x6a5a40, 0, 0.83, 0.28, 0.06, 0.004, 0.06); // 水漬
    m.slab(M.paint, 0xd0ccc4, 0, 0, 0.12, 0.14, 0.78, 0.16); // 立柱
    m.cyl(M.metal, 0xc8c8c8, 0, 0.98, 0.07, 0.03, 0.14, 10);
    m.cyl(M.metal, 0xc8c8c8, 0, 1.05, 0.13, 0.025, 0.14, 10, Math.PI / 2);
    for (const sx of [-1, 1]) { m.cyl(M.metal, 0xc8c8c8, sx * 0.11, 0.94, 0.08, 0.03, 0.05, 8); m.box(M.metal, sx < 0 ? 0xc04040 : 0x4060c0, sx * 0.11, 0.975, 0.08, 0.06, 0.012, 0.012); }
    m.box(M.gloss, 0xb8c4c8, 0, 1.5, 0.008, 0.46, 0.6, 0.012); // 鏡子(模糊的)
    m.box(M.matte, 0x2a2622, 0, 1.5, 0.003, 0.5, 0.64, 0.004);
    kit.static(m, api.mtx(s), s.li);
    api.box(s, -0.28, 0.02, 0.28, 0.48, 0.9, 0, 'plastic');
    const stream = kit.pool('stream', (q) => { q.cyl(M.glass, 0xb8d0e0, 0, -0.5, 0, 1, 1, 8); }, M.glass);
    const sm = api.mtx(s, 0, 1.03, 0.19).multiply(T(0, 0, 0, 0, 0, 0, 0.012, 0.2, 0.012));
    const si = stream.add(s.li, ZERO);
    const pos = api.wp(s, 0, 1.0, 0.2);
    const key = spec.id || `sink${Math.round(pos.x * 10)}_${Math.round(pos.z * 10)}`;
    const st = { on: false, auto: null, red: false };
    const set = (on, red = false) => {
      st.on = on; st.red = red;
      stream.set(si, on ? sm : ZERO);
      stream.color(si, red ? 0x5a0a08 : 0xb8d0e0);
      ixs.tapSqueak(pos);
      if (on) { ixs.tapStart(key, pos, red || R() < 0.4); st.auto?.(); st.auto = ix.after(25, () => set(false)); }
      else { ixs.tapStop(key); st.auto?.(); st.auto = null; }
    };
    return ix.register(pos, {
      id: key, kind: 'sink', name: '水龍頭', reach: 1.8, radius: 0.15, scope: 'map', cooldown: 0.6,
      prompt: () => (st.on ? '關上水龍頭' : '打開水龍頭'),
      onUse: () => {
        if (st.on) { set(false); if (R() < 0.12) ix.after(6 + R() * 8, () => { if (!st.on) { set(true); ixs.pipeKnock(pos); } }); return; }
        const red = R() < 0.15;
        set(true, red);
        if (red) { const t = api.LINES.MISC?.tapRed; if (t) ix.after(1.2, () => api.feed(t, '#c89a9a')); ix.flags.set('h.tap.red', true); }
        else if (R() < 0.3) ixs.pipeKnock(pos);
      },
      reset: () => { if (st.on) set(false); },
    });
  },
};

// ---------- 護理呼叫鈕(病床旁) ----------
export const nursecall = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, R } = api;
    const m = new Model();
    m.box(M.plastic, 0xe8e4d8, 0, 1.15, 0.012, 0.12, 0.16, 0.024);
    m.cyl(M.plastic, 0x8a1a14, 0, 1.17, 0.026, 0.05, 0.012, 14, Math.PI / 2);
    m.box(M.matte, 0x333333, 0, 1.09, 0.025, 0.08, 0.016, 0.002);
    kit.static(m, api.mtx(s), s.li);
    const led = ledPool(api); const li = led.add(s.li, api.mtx(s, 0, 1.17, 0.034).multiply(T(0, 0, 0, 0, 0, 0, 0.035, 0.035, 0.004)), 0x2a0606);
    const room = spec.room || (s.zone?.name?.match(/\d{3}/) || [])[0] || '';
    const pos = api.wp(s, 0, 1.15, 0.04);
    const st = { on: false };
    return ix.register(pos, {
      id: spec.id || `call:${room}:${Math.round(pos.x)}`, kind: 'nursecall', name: '護理呼叫鈕', reach: 1.7, radius: 0.08, scope: 'map', cooldown: 1,
      prompt: () => (st.on ? '取消呼叫' : '按護理呼叫鈕'),
      onUse: () => {
        st.on = !st.on;
        led.color(li, st.on ? 0xff2a1a : 0x2a0606);
        if (st.on) {
          ixs.nurseCall(pos);
          api.nurseBoard?.light(room, true);
          ix.flags.set('h.call.' + room, true);
          const ph = api.phones.find((p) => p.style === 'nurse');
          if (ph && R() < 0.6) ix.after(6 + R() * 6, () => ph.state === 'idle' && ph.startRing(null, 10)); // 護理站的電話響了
        } else { ixs.switchClick(pos, false); api.nurseBoard?.light(room, false); }
        ix.emit('nursecall', room, st.on);
      },
      reset: () => { st.on = false; led.color(li, 0x2a0606); api.nurseBoard?.light(room, false); },
    });
  },
};

// ---------- 密碼鍵盤(門禁、保險箱、密碼鎖)----------
export const keypad = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, game } = api;
    const m = new Model();
    m.box(M.metal, 0x6a6e70, 0, 1.3, 0.022, 0.12, 0.18, 0.044);
    m.box(M.glow, 0x3a6a3a, 0, 1.36, 0.045, 0.08, 0.025, 0.002);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) m.box(M.metal, 0xb8bcbe, -0.028 + k * 0.028, 1.32 - r * 0.026, 0.046, 0.02, 0.018, 0.006);
    kit.static(m, api.mtx(s), s.li);
    const led = ledPool(api); const li = led.add(s.li, api.mtx(s, 0.045, 1.37, 0.046).multiply(T(0, 0, 0, 0, 0, 0, 0.01, 0.01, 0.004)), 0x4a0a06);
    const pos = api.wp(s, 0, 1.3, 0.05);
    const code = String(spec.code || '0000');
    const flag = spec.onSolve?.flag;
    const solved = () => flag && ix.flags.has(flag);
    return ix.register(pos, {
      id: spec.id || 'keypad' + Math.round(pos.x), kind: 'keypad', name: spec.title || '密碼鎖', reach: 1.8, radius: 0.1, scope: 'map',
      prompt: () => (solved() ? { text: `${spec.title || '密碼鎖'} · 已解鎖`, dim: true } : '輸入密碼'),
      when: () => (spec.power && !ix.flags.has(spec.power) ? `${spec.title || '密碼鎖'} · 沒有電（先到配電盤供電）` : true), // 需要某條迴路供電
      onUse: () => {
        if (solved()) return false;
        const knew = ix.flags.has('know.code' + code); // 跨局知識:以前解開過,就記得密碼
        ix.ui.keypad({
          title: spec.title || '密碼鎖', sub: knew ? `你記得密碼：${code}` : spec.sub || `${code.length} 位數`, len: code.length,
          check: (c) => {
            if (c === code) {
              led.color(li, 0x3aff5a); sfx.uiClick?.();
              ixs.lockerOpen(pos);
              if (flag) ix.flags.set(flag, true);
              ix.flags.set('know.code' + code, true);
              for (const [k, v] of Object.entries(spec.onSolve?.flags || {})) ix.flags.set(k, v);
              if (spec.onSolve?.know) ix.flags.set(spec.onSolve.know, true);
              if (spec.onSolve?.item) ix.after(0.6, () => api.give(spec.onSolve.item));
              if (spec.onSolve?.note) ix.after(1, () => api.note(spec.onSolve.note));
              if (spec.onSolve?.coins) ix.after(0.6, () => { api.coins(spec.onSolve.coins); api.toast(`${spec.onSolve.coins} 元`, '#f2c84b'); });
              ix.emit('solve', spec.id, code);
              return { ok: true, text: spec.okText || '解鎖' };
            }
            sfx.pickupDeny();
            ix.flags.inc('h.keypad.wrong');
            const w = api.lineById(spec.wrong);
            return { ok: false, text: w?.text || spec.wrong || '密碼錯誤' };
          },
        });
      },
    });
  },
};

// ---------- 病歷系統終端(大新 HIS v4):輸入號碼查資料 ----------
export const terminal = {
  build(api, s, spec = {}) {
    const { kit, M, ix, game } = api;
    const m = new Model();
    const desk = !s.host;
    if (desk) { m.slab(M.wood, 0x8a7a64, 0, 0.72, 0.34, 0.9, 0.04, 0.58); for (const sx of [-1, 1]) m.slab(M.metal, 0x555555, sx * 0.42, 0, 0.34, 0.04, 0.72, 0.54); }
    const L = desk ? api.mtx(s, 0, 0.76, 0.3) : api.mtx(s, s.host.x, s.host.y, s.host.z);
    const b = new Model();
    b.slab(M.plastic, 0xc8c2b0, 0, 0.02, -0.04, 0.38, 0.34, 0.34);
    b.slab(M.plastic, 0xc8c2b0, 0, 0, -0.04, 0.24, 0.02, 0.2);
    b.slab(M.plastic, 0xc8c2b0, 0, 0, 0.2, 0.4, 0.03, 0.14);
    for (let r = 0; r < 4; r++) b.box(M.plastic, 0xe0dccf, 0, 0.032, 0.16 + r * 0.025, 0.36, 0.006, 0.018);
    b.box(M.plastic, 0xf2e070, 0.17, 0.33, 0.13, 0.05, 0.05, 0.002, 0, 0.3); // 便利貼
    kit.static(m, api.mtx(s), s.li);
    kit.static(b, L, s.li);
    if (desk) api.box(s, -0.46, 0.05, 0.46, 0.63, 0.8);
    const H = api.LINES.HIS || { title: '大新　病歷電腦', entries: {}, unknown: '查無資料' };
    const tex = canvasTex('his', 128, 96, (x, w, h) => { x.fillStyle = '#041008'; x.fillRect(0, 0, w, h); x.fillStyle = '#5aff7a'; x.font = `bold 10px ${FONT}`; x.fillText('病歷電腦', 8, 16); x.font = `9px ${FONT}`; x.fillText('床號 / 病歷號查詢', 8, 32); x.fillText('> _', 8, 50); for (let i = 0; i < 24; i++) { x.fillStyle = 'rgba(90,255,122,.06)'; x.fillRect(0, i * 4, w, 1); } });
    const sm = new Model(); sm.quad(texMat('his', tex, { basic: true }), 0, 0.19, 0.131, 0.28, 0.21);
    kit.static(sm, L, s.li);
    const pos = { x: 0, y: 0, z: 0 };
    { const v = new THREE.Vector3(0, 0.19, 0.15).applyMatrix4(L); pos.x = v.x; pos.y = v.y; pos.z = v.z; }
    return ix.register(pos, {
      id: spec.id || 'his' + Math.round(pos.x), kind: 'terminal', name: H.title, reach: 1.9, radius: 0.18, scope: 'map', prompt: '用病歷電腦查資料',
      onUse: () => {
        ix.ui.keypad({
          title: H.title, sub: '輸入床號或病歷號 · [Enter] 查詢', len: 4, terminal: true,
          check: (c) => {
            const t = H.entries?.[c] ?? H.entries?.[String(+c)] ?? null;
            ix.flags.set('h.his.' + c, true);
            if (t) { ix.emit('his', c); if (c === '207' || c === '0924') ix.flags.set('know.code0924.his', true); }
            return { ok: !!t, text: `> ${c}\n${t ? (typeof t === 'object' ? t.text : t) : H.unknown || '查無資料'}` };
          },
        });
      },
    });
  },
};

// ---------- 保險絲盒 / 發電機配電盤 ----------
// 把身上的保險絲裝進去(每個 1 格);裝了幾個就能同時供電幾條迴路(或 capacity 指定的上限);迴路 = 旗標 + 該區的燈
export const fusebox = {
  build(api, s, spec = {}) {
    const { kit, M, ix, ixs, sfx, game } = api;
    const slots = spec.slots || 3, item = spec.item || 'fuse';
    const circuits = spec.circuits || [];
    const m = new Model();
    m.box(M.paint, 0x7a8078, 0, 1.45, 0.07, 0.56, 0.78, 0.14);
    m.box(M.matte, 0x2a2c2a, 0, 1.45, 0.142, 0.5, 0.72, 0.004);
    for (let i = 0; i < slots; i++) { m.box(M.matte, 0x111111, -0.15 + i * 0.15, 1.6, 0.145, 0.09, 0.16, 0.01); m.box(M.metal, 0xb08a40, -0.15 + i * 0.15, 1.6, 0.152, 0.03, 0.12, 0.004); }
    for (let i = 0; i < Math.max(1, circuits.length); i++) m.box(M.plastic, 0x222222, -0.16 + i * 0.11, 1.28, 0.15, 0.05, 0.08, 0.02);
    m.box(M.paint, 0xe8c020, 0, 1.88, 0.142, 0.3, 0.06, 0.004);
    m.cyl(M.metal, 0x777777, 0.24, 0.85, 0.06, 0.05, 1.0, 8);
    kit.static(m, api.mtx(s), s.li);
    const sign = new Model(); sign.quad(texMat('fusesign', canvasTex('fusesign', 256, 48, (x, w, h) => { x.fillStyle = '#e8c020'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.font = `bold 28px ${FONT}`; x.textAlign = 'center'; x.fillText('⚡ 配電盤 · 高壓危險', w / 2, 34); }), { basic: true }), 0, 1.88, 0.146, 0.3, 0.06);
    kit.static(sign, api.mtx(s), s.li);
    const fz = kit.pool('fuse', (q) => { q.cyl(M.matte, 0xe8e0c8, 0, 0, 0, 0.035, 0.1, 10); for (const sy of [-1, 1]) q.cyl(M.metal, 0xc8a050, 0, sy * 0.055, 0, 0.038, 0.02, 10); }, M.matte);
    const fi = []; for (let i = 0; i < slots; i++) fi.push(fz.add(s.li, ZERO));
    const fm = (i) => api.mtx(s, -0.15 + i * 0.15, 1.6, 0.16);
    const led = ledPool(api);
    const cl = circuits.map((c, i) => led.add(s.li, api.mtx(s, -0.16 + i * 0.11, 1.36, 0.152).multiply(T(0, 0, 0, 0, 0, 0, 0.02, 0.02, 0.004)), 0x1a1206));
    const pos = api.wp(s, 0, 1.45, 0.16);
    const st = { n: spec.filled || 0, on: new Set() };
    const initial = circuits.filter((c) => c.initial); // 開局就有電的迴路(例:207 的延長線直接接發電機)
    const cap = () => Math.max(initial.length, spec.capacity === 'fuses' || !spec.capacity ? st.n : Math.min(st.n, spec.capacity));
    const power = (c, on) => {
      if (on) st.on.add(c.id); else st.on.delete(c.id);
      ix.flags.set(c.id, on);
      if (c.lights) for (const z of c.zones || []) for (const f of api.fixtures(z)) { if (f.st0 === undefined) f.st0 = f.state; f.ov = on ? 1 : 0; if (on && f.state === 2) f.state = 0; } // lights:true 的迴路才管燈(斷電 → 那一區全暗)
      led.color(cl[circuits.indexOf(c)], on ? 0xffb030 : 0x1a1206);
      ix.emit('power', c.id, on);
    };
    for (let i = 0; i < st.n; i++) fz.set(fi[i], fm(i));
    for (const c of initial) power(c, true);
    const panel = () => ix.ui.panel({
      title: spec.title || '配電盤', sub: () => `保險絲 ${st.n}/${slots} · 可以同時供電 ${cap()} 個地方`,
      rows: () => circuits.map((c) => ({ label: c.label, on: st.on.has(c.id), can: st.on.has(c.id) || st.on.size < cap() })),
      toggle: (i) => {
        const c = circuits[i];
        if (st.on.has(c.id)) { power(c, false); ixs.switchClick(pos, false); }
        else if (st.on.size < cap()) { power(c, true); ixs.switchClick(pos, true); sfx.scare('lights_flicker', pos); }
        else { sfx.pickupDeny(); }
      },
    });
    return ix.register(pos, {
      id: spec.id || 'fusebox', kind: 'fusebox', name: spec.title || '配電盤', reach: 1.9, radius: 0.3, scope: 'map',
      prompt: () => (st.n < slots && ix.inv.has(item) ? `裝上${ix.inv.name(item)}（${st.n}/${slots}）` : st.n < slots && !circuits.length ? { text: `${spec.title || '配電盤'} · 缺 ${slots - st.n} 個${ix.inv.name(item)}`, dim: true } : '打開配電盤'),
      onUse: () => {
        let added = 0;
        while (st.n < slots && ix.inv.take(item)) { fz.set(fi[st.n], fm(st.n)); st.n++; added++; }
        if (added) {
          ixs.lockerClose(pos);
          api.toast(`裝上 ${added} 個${ix.inv.name(item)}`, '#d9c48a', `${st.n}/${slots}`);
          ix.flags.set(spec.fillFlag || 'h.fuse.n', st.n);
          if (st.n >= slots && spec.onFull?.flag) { ix.flags.set(spec.onFull.flag, true); sfx.scare('generator', pos); api.feed('發電機轉起來了。', '#ffd27a'); }
          ix.emit('fuse', st.n, slots);
          if (!circuits.length) return;
        }
        if (circuits.length) panel();
        else if (!added) return false;
      },
      reset: () => {
        st.n = spec.filled || 0;
        for (let i = 0; i < slots; i++) fz.set(fi[i], i < st.n ? fm(i) : ZERO);
        for (const c of circuits) { led.color(cl[circuits.indexOf(c)], 0x1a1206); if (c.lights) for (const z of c.zones || []) for (const f of api.fixtures(z)) { f.ov = 1; if (f.st0 !== undefined) f.state = f.st0; } }
        st.on.clear();
        for (const c of initial) power(c, true);
      },
    });
  },
};
