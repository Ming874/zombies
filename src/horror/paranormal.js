import { sfx, ghost } from '../audio.js';
import { WRITINGS } from './lines.js';
import { models } from './ghosts.js';

// 靈異事件(註冊進 src/map/hospital/events.js,由驚嚇導演 director 決定何時觸發):
// 每種 { ok(c), run(c) };c = events 的事件情境(玩家位置/朝向/樓層/區域 + 查詢工具 K、L、sees、inView、figSpot、fixAhead…)。
// 文字一律從 lines.js 取(WRITINGS / LINES 的 cue),這裡不寫死字串。
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

export function paranormalKinds(h) {
  const game = h.game, A = h.app, M = h.marks, W = h.whispers;
  const lv = (c, li = c.li) => c.L.levels[li].y;
  const walk = (c, x, z, li = c.li) => (c.L.flagsAt(li, Math.floor(x / 2), Math.floor(z / 2)) & c.L.F.WALK) !== 0;
  const near = (c, x, z, a, b) => { const d = Math.hypot(x - c.px, z - c.pz); return d > a && d < b; };
  const cue = (k, p = 0.5, ear) => { if (Math.random() >= p) return; const l = W.pick('cue', { cue: k, round: game.round }); if (l) h.after(rand(0.3, 1.2), () => W.say(l, { priority: 4, ear })); };
  const storm = (c, f, dur = 0.6) => c.active.push({ type: 'storm', f, t0: game.time, t1: game.time + dur, burn: false });
  const toward = (c, x, z) => Math.atan2(c.px - x, c.pz - z);
  const lit = (f) => f.state !== 2 && f.shape && !f.prop && f.kind !== 'exit' && f.cur > 0.25;
  // 可推動的道具(輪椅、推車、點滴架、椅子)
  const dyn = (c) => {
    if (!h._dyn) { h._dyn = []; c.root.traverse((o) => { if (o.userData?.dynamic && /wc|wheel|cart|iv|linen|gurney|trolley|chair|stool|bin|box/i.test(o.userData.kind || o.name || '')) h._dyn.push(o); }); }
    return h._dyn;
  };
  const _w = { x: 0, y: 0, z: 0 };
  const wpos = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; _w.x = e[12]; _w.y = e[13]; _w.z = e[14]; return _w; };
  // 殭屍從看不到的地方接近時,牠附近那盞「玩家看得到」的燈
  const signalFix = (c) => {
    for (const z of game.zombies) {
      if (!z.alive || !(z.dist > 7 && z.dist < 22) || Math.abs(z.pos.y - c.py) > 2) continue;
      if (c.inView(z.pos.x, z.pos.z, 0.55) && c.sees(c.li, c.px, c.pz, z.pos.x, z.pos.z)) continue;
      let best = null, bd = 30;
      for (const f of c.fixtures) {
        if (f.li !== c.li || !lit(f)) continue;
        const q = (f.x - z.pos.x) ** 2 + (f.z - z.pos.z) ** 2;
        if (q < bd && c.inView(f.x, f.z, 0.35) && c.sees(c.li, c.px, c.pz, f.x, f.z)) { bd = q; best = f; }
      }
      if (best) return best;
    }
    return null;
  };
  const windows = (c, a, b, dot = 0.55) => (c.K.windowInfo || []).filter((w) => w.li === c.li && !w.boarded && !w.store && near(c, w.x, w.z, a, b) && c.inView(w.x, w.z, dot) && c.seesNear(w.x, w.z));
  const anchorsOf = (c, kinds, a, b, dot = 0.5, seeIt = true) => c.anchors.filter((x) => kinds.includes(x.kind) && x.li === c.li && near(c, x.x, x.z, a, b) && (dot == null || c.inView(x.x, x.z, dot)) && (!seeIt || c.seesNear(x.x, x.z)));
  const free = () => !!A.free();
  const indoor = (c) => !c.outdoor;

  const K = {
    // ---------- 燈 ----------
    flicker: { ok: (c) => indoor(c) && c.fixAhead(4, 16).length > 0, run(c) {
      const f = pick(c.fixAhead(4, 16));
      storm(c, f, rand(0.7, 1.6));
      sfx.scare('lights_flicker', { x: f.x, y: f.y, z: f.z });
      return f;
    } },
    signal: { ok: (c) => indoor(c) && !!signalFix(c), run(c) { // 殭屍靠近:牠那邊的燈抽一下(提示方向)
      const f = signalFix(c);
      storm(c, f, rand(0.45, 0.85));
      sfx.scare('lights_flicker', { x: f.x, y: f.y, z: f.z });
      return f;
    } },
    lightsDie: { ok: (c) => indoor(c) && c.fixtures.filter((f) => f.li === c.li && lit(f) && near(c, f.x, f.z, 4, 28) && c.inView(f.x, f.z, 0.75) && c.sees(c.li, c.px, c.pz, f.x, f.z)).length >= 4, run(c) {
      const far = c.fixtures.filter((f) => f.li === c.li && lit(f) && near(c, f.x, f.z, 4, 28) && c.inView(f.x, f.z, 0.75) && c.sees(c.li, c.px, c.pz, f.x, f.z))
        .sort((a, b) => Math.hypot(b.x - c.px, b.z - c.pz) - Math.hypot(a.x - c.px, a.z - c.pz)).slice(0, 7);
      const close = c.fixtures.filter((f) => f.li === c.li && f.state !== 2 && f.cur > 0.05 && Math.hypot(f.x - c.px, f.z - c.pz) <= 4.5);
      const list = [...far, ...close], n = list.length, t = game.time, step = 0.55, hold = rand(4.5, 6);
      list.forEach((f, i) => c.active.push({ type: 'die', f, t0: t + i * step, t1: t + n * step + hold + (n - i) * 0.18, onStart: () => ghost.tubeOff({ x: f.x, y: f.y, z: f.z }) }));
      // 全暗的瞬間:寂靜 + 雙耳低語;最遠那盞燈下站著一個人(手電筒照到就消失)
      h.after(n * step + 0.2, () => { ghost.silence(hold + 0.5, 0.05); cue('lightsDie', 0.8, 'both'); });
      const f0 = far[0];
      if (f0 && free() && walk(c, f0.x, f0.z)) h.after(n * step + 0.9, () => A.spawn({ tag: 'lightsDie', fig: pick(['patient', 'man']), pose: 'stand', look: 'pale', x: f0.x, y: lv(c), z: f0.z, yaw: toward(c, f0.x, f0.z), dur: hold - 0.6, alpha: 0.75, vanish: { flash: true, look: 0.992, lookT: 0.6, near: 6 } }));
      h.director.hold(n * step + hold + 2);
      return list[0];
    } },
    // ---------- 門 ----------
    doorCreep: { ok: (c) => indoor(c) && c.doors.some((d) => d.li === c.li && !d.anim && !d.primed && near(c, d.cx, d.cz, 4, 16) && !c.inView(d.cx, d.cz, 0.1)), run(c) {
      const d = c.doors.filter((x) => x.li === c.li && !x.anim && !x.primed && near(c, x.cx, x.cz, 4, 16) && !c.inView(x.cx, x.cz, 0.1)).sort(() => Math.random() - 0.5)[0];
      d.primed = true;
      d.group.rotation.y = d.closed; // 沒人看的時候,門自己關上了
      const t0 = game.time;
      let seen = 0, stage = 0;
      h.watch((dt) => {
        if (!d.primed) return false;
        const p = game.player.pos, dist = Math.hypot(d.cx - p.x, d.cz - p.z);
        const cam = game.camera, fx = -Math.sin(game.player.yaw), fz = -Math.cos(game.player.yaw);
        const view = ((d.cx - p.x) * fx + (d.cz - p.z) * fz) / (dist || 1);
        const open = (slow) => { d.anim = { t0: game.time, from: d.group.rotation.y, to: d.open, dur: slow ? rand(3.8, 5) : 0.9 }; ghost.creakLong({ x: d.cx, y: d.y + 1.2, z: d.cz }, slow ? 4 : 1); d.primed = false; };
        if (dist < 2.2) { open(false); return false; } // 走到門前:門自己慢慢開了
        if (stage === 0 && view > 0.75 && dist < 14) { seen += dt; if (seen > 0.7) { stage = 1; h.after(rand(1.2, 2.4), () => { if (!d.primed) return; if (dist < 10 && Math.random() < 0.6) { const ux = d.cx - d.x, uz = d.cz - d.z, ul = Math.hypot(ux, uz) || 1, sg = ((p.x - d.cx) * -uz + (p.z - d.cz) * ux) > 0 ? 1 : -1; M.underDoor(d.cx, d.y, d.cz, ux / ul, uz / ul, -uz / ul * sg, ux / ul * sg, 3.6); h.after(3.4, () => d.primed && open(true)); } else open(true); }); } }
        if (game.time - t0 > 70 && view < 0.1) { d.group.rotation.y = d.open; d.primed = false; return false; } // 一直沒來看:悄悄恢復
        void cam;
        return d.primed;
      });
      return d;
    } },
    // ---------- 物品自己動 ----------
    rollToward: { ok: (c) => !!game.physics?.ready && dyn(c).some((o) => { const p = wpos(o); return Math.abs(p.y - lv(c)) < 1.5 && near(c, p.x, p.z, 4, 12) && c.inView(p.x, p.z, 0.6) && c.sees(c.li, c.px, c.pz, p.x, p.z) && /wc|wheel|cart|gurney|trolley|iv/i.test(o.userData.kind || o.name || ''); }), run(c) {
      const o = dyn(c).find((q) => { const p = wpos(q); return Math.abs(p.y - lv(c)) < 1.5 && near(c, p.x, p.z, 4, 12) && c.inView(p.x, p.z, 0.6) && c.sees(c.li, c.px, c.pz, p.x, p.z) && /wc|wheel|cart|gurney|trolley|iv/i.test(q.userData.kind || q.name || ''); });
      const p = wpos(o), d = Math.hypot(p.x - c.px, p.z - c.pz) || 1;
      game.physics.impulseAt({ x: p.x + (p.x - c.px) / d * 0.7, y: p.y + 0.35, z: p.z + (p.z - c.pz) / d * 0.7 }, 1.1, rand(2.2, 3.2)); // 從背後輕推:朝玩家滾過來
      ghost.cart({ x: p.x, y: p.y + 0.4, z: p.z }, 2.4);
      return { x: p.x, z: p.z };
    } },
    moveBehind: { ok: (c) => !!game.physics?.ready && dyn(c).some((o) => { const p = wpos(o); return Math.abs(p.y - lv(c)) < 1.5 && near(c, p.x, p.z, 2, 8) && !c.inView(p.x, p.z, -0.2); }), run(c) { // 轉頭之前,東西換了位置
      const o = dyn(c).find((q) => { const p = wpos(q); return Math.abs(p.y - lv(c)) < 1.5 && near(c, p.x, p.z, 2, 8) && !c.inView(p.x, p.z, -0.2); });
      const p = wpos(o), a = rand(0, 6.28);
      game.physics.impulseAt({ x: p.x + Math.cos(a) * 0.5, y: p.y + 0.4, z: p.z + Math.sin(a) * 0.5 }, 1.0, rand(2.5, 3.5));
      sfx.thud({ x: p.x, y: p.y + 0.2, z: p.z }, false);
      return { x: p.x, z: p.z };
    } },
    // ---------- 痕跡 ----------
    footprints: { ok: (c) => indoor(c) && fpPath(c).length >= 6, run(c) {
      const path = fpPath(c), towardMe = Math.random() < 0.6, list = towardMe ? path.slice().reverse() : path, y = lv(c);
      list.forEach((q, i) => h.after(i * 0.5, () => { M.foot(q.x, y, q.z, towardMe ? q.yaw + Math.PI : q.yaw, i % 2 === 0); ghost.wetStep({ x: q.x, y: y + 0.05, z: q.z }, 0.8 + i / list.length * 0.4); }));
      h.after(list.length * 0.5 + 0.4, () => { if (towardMe) ghost.breathNeck(0.7); cue('footprints', 0.3); });
      return path[0];
    } },
    handprints: { ok: (c) => windows(c, 1.5, 7).length > 0, run(c) {
      const w = pick(windows(c, 1.5, 7)), y = lv(c);
      const ax = w.axis === 'z', sgn = ax ? Math.sign(c.pz - w.z) || 1 : Math.sign(c.px - w.x) || 1;
      const nx = ax ? 0 : sgn, nz = ax ? sgn : 0, n = 3 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) h.after(0.25 + i * rand(0.3, 0.55), () => {
        const u = w.u0 + 0.25 + Math.random() * (w.u1 - w.u0 - 0.5), yy = y + rand(1.05, 1.95);
        const x = ax ? u : w.x, z = ax ? w.z : u;
        M.hand(x, yy, z, nx, nz);
        ghost.squeak({ x, y: yy, z });
      });
      cue('handprints', 0.4);
      return w;
    } },
    writing: { ok: (c) => indoor(c) && !!wallBehind(c) && WRITINGS.some((x) => x.kind === 'appear' && !h.usedWrit.has(x.id)), run(c) {
      const s = wallBehind(c), opts = WRITINGS.filter((x) => x.kind === 'appear' && !h.usedWrit.has(x.id));
      const w = pick(opts);
      h.usedWrit.add(w.id);
      M.write(w, s.x, s.y, s.z, s.nx, s.nz, { fadeIn: 0.15 });
      ghost.scrawl({ x: s.x, y: s.y, z: s.z }, 2.2); // 背後傳來刮牆的聲音:轉頭就看到
      cue('writing', 0.25);
      return s;
    } },
    // ---------- 寒氣 ----------
    coldBreath: { ok: () => true, run() {
      h.chill(0.9, rand(14, 20));
      ghost.gust();
      h.after(2.6, () => ghost.breathNeck(1));
      cue('coldBreath', 0.45, 'behind');
      return true;
    } },
    // ---------- 道具:電視、電梯、收音機、電話、音樂盒 ----------
    tvFace: { ok: (c) => anchorsOf(c, ['tv', 'cctv', 'monitor', 'monitor_flatline'], 2, 10, 0.55).length > 0, run(c) {
      const a = pick(anchorsOf(c, ['tv', 'cctv', 'monitor', 'monitor_flatline'], 2, 10, 0.55));
      const dx = c.px - a.x, dz = c.pz - a.z, ax = Math.abs(dx) > Math.abs(dz);
      const nx = ax ? Math.sign(dx) : 0, nz = ax ? 0 : Math.sign(dz);
      const big = a.kind === 'tv';
      M.tvFace(a.x, a.y + (big ? 0.08 : 0), a.z, nx, nz, big ? 0.42 : 0.3, big ? 0.3 : 0.22, 2.8);
      sfx.scare('tv_static', { x: a.x, y: a.y, z: a.z });
      return a;
    } },
    elevator: { ok: (c) => (c.K.elevators || []).some((e) => e.li === c.li && e.stuck === false && near(c, e.x, e.z, 2.2, 15) && c.inView(e.x, e.z, 0.3) && c.seesNear(e.x, e.z)), run(c) {
      const e = pick((c.K.elevators || []).filter((x) => x.li === c.li && x.stuck === false && near(c, x.x, x.z, 2.2, 15) && c.inView(x.x, x.z, 0.3) && c.seesNear(x.x, x.z)));
      const nx = e.isH ? 0 : e.sg, nz = e.isH ? e.sg : 0;
      ghost.elevator({ x: e.x, y: lv(c) + 1.2, z: e.z });
      M.liftGlow(e.x, lv(c), e.z, nx, nz, 7.5);
      h.after(3.2, () => cue('elevator', 0.55));
      return e;
    } },
    radioOn: { ok: (c) => anchorsOf(c, ['radio', 'tv', 'cctv'], 3, 22, null, false).length > 0, run(c) {
      const a = pick(anchorsOf(c, ['radio', 'tv', 'cctv'], 3, 22, null, false)), pos = { x: a.x, y: a.y + 0.3, z: a.z };
      sfx.loopStart('gh-radio', 'radio', pos);
      h.after(13, () => sfx.loopStop('gh-radio'));
      h.after(1.5, () => h.radio({ pos, id: a.id, auto: true }));
      h.emit('radio:on', { pos, kind: a.kind, anchor: a });
      return a;
    } },
    phoneRing: { ok: (c) => anchorsOf(c, ['phone'], 3, 18, null, false).length > 0 && !h.ringing, run(c) {
      const a = pick(anchorsOf(c, ['phone'], 3, 18, null, false)), pos = { x: a.x, y: a.y, z: a.z };
      if (!game.interact) sfx.scare('phone_ring', pos); // 有互動系統時:那支真的電話會響(聽 'phone:ring'),接起來就是 phoneCall 的來電
      h.ringing = { pos, anchor: a, until: game.time + 9 };
      h.emit('phone:ring', { pos, anchor: a, until: h.ringing.until });
      return a;
    } },
    lullaby: { ok: (c) => !!lullabySpot(c), run(c) {
      const s = lullabySpot(c);
      ghost.lullaby(s);
      return s;
    } },
    // ---------- 聲音 ----------
    crawl: { ok: (c) => indoor(c) && Number.isFinite(c.L.ceilY(c.li, Math.floor(c.px / 2), Math.floor(c.pz / 2))), run(c) {
      const p = ghost.crawl(rand(4.5, 6));
      if (p) h.after(5.2, () => { const y = c.L.ceilY(c.li, Math.floor(p.x / 2), Math.floor(p.z / 2)); if (Number.isFinite(y)) { _w.x = p.x; _w.y = y - 0.05; _w.z = p.z; game.burst?.(h.v3(_w), h.v3b(0, -1, 0), 'dust', 9, lv(c)); } });
      return true;
    } },
    silence: { ok: () => true, run() {
      const d = rand(4, 5.5);
      ghost.silence(d);
      h.after(d - 0.6, () => { if (Math.random() < 0.6) cue('silence', 1, 'both'); else sfx.scare('knock'); });
      return true;
    } },
    // ---------- 幻影 ----------
    figure: { ok: (c) => indoor(c) && !c.zNear && free() && models.ready('patient') && !!c.figSpot(), run(c) { // 走廊盡頭/最後一盞燈下的人影
      const s = c.figSpot(), f = s.f || null, st0 = f ? f.state : 0;
      if (f) { f.state = 0; f.ov = 1; } // 它頭上的燈「剛好」亮著(背光)
      const a = A.spawn({ tag: 'figure', fig: pick(['patient', 'man', 'patient']), pose: pick(['stand', 'tilt']), look: 'shade', x: s.x, y: lv(c), z: s.z, yaw: toward(c, s.x, s.z), dur: rand(3.5, 5.5), vanish: { flash: true, look: 0.985, lookT: 0.4, near: 9 },
        onEnd: () => { if (f) { f.state = st0; storm(c, f, 0.45); } } });
      if (a) cue('figure', 0.25);
      return a;
    } },
    window: { ok: (c) => free() && models.ready('patient') && windows(c, 3, 12, 0.6).length > 0, run(c) { // 窗外的人影(二樓以上就是飄在半空)
      const w = pick(windows(c, 3, 12, 0.6));
      const ax = w.axis === 'z', side = ax ? Math.sign(c.pz - w.z) || 1 : Math.sign(c.px - w.x) || 1;
      const x = ax ? w.x + rand(-0.4, 0.4) : w.x - side * 0.9, z = ax ? w.z - side * 0.9 : w.z + rand(-0.4, 0.4);
      const a = A.spawn({ tag: 'window', fig: pick(['patient', 'man']), pose: 'stand', look: 'pale', x, y: lv(c), z, yaw: ax ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2), dur: rand(4, 6), alpha: 0.85, anyLevel: false,
        vanish: { flash: true, look: 0.975, lookT: 0.7, near: 2.5 },
        onVanish: (why) => { if (why === 'look' || why === 'flash') for (let i = 0; i < 2; i++) h.after(0.2 + i * 0.35, () => { const u = (ax ? x : z) + rand(-0.3, 0.3), yy = lv(c) + rand(1.3, 1.8); M.hand(ax ? u : w.x, yy, ax ? w.z : u, ax ? 0 : side, ax ? side : 0); ghost.squeak({ x: w.x, y: yy, z: w.z }); }); } });
      if (a) cue('window', 0.3);
      return a;
    } },
    child: { ok: (c) => indoor(c) && free() && models.ready('child') && !!childPath(c), run(c) { // 孩子笑著跑過門口
      const P = childPath(c);
      // 只是一閃而過的小影子(STORY.md §11.5:沒有兒童死亡,孩子只以聲音/影子出現)
      const a = A.spawn({ tag: 'child', fig: 'child', pose: 'runA', anim: ['runA', 'runB'], animDt: 0.14, look: 'shade', x: P.x0, y: lv(c), z: P.z0, yaw: Math.atan2(P.x1 - P.x0, P.z1 - P.z0), path: [{ x: P.x1, z: P.z1 }], speed: 3.6, endOnArrive: true, dur: 3, alpha: 0.5, bob: true, vanish: { flash: false, look: 0, near: 1.5 } });
      if (a) { ghost.giggle({ x: P.dx, y: lv(c) + 1, z: P.dz }); cue('child', 0.35); }
      return a;
    } },
    nurse: { ok: (c) => indoor(c) && free() && models.ready('nurse') && (c.zone?.theme === 'corridor' || c.zone?.theme === 'ward') && !!nursePath(c), run(c) { // 推著推車的護士,慢慢走遠
      const P = nursePath(c), pos = { x: P.x, y: lv(c) + 0.8, z: P.z };
      const a = A.spawn({ tag: 'nurse', fig: 'nurse', pose: 'push', look: 'pale', cart: true, x: P.x, y: lv(c), z: P.z, yaw: P.yaw, path: P.path, speed: 0.75, dur: 10, alpha: 0.8,
        vanish: { flash: true, flashT: 0.35, look: 0.995, lookT: 3.5, near: 7 }, onTick: (q) => { pos.x = q.x; pos.z = q.z; } });
      if (a) { ghost.cart(pos, 9); cue('nurse', 0.35); }
      return a;
    } },
    behind: { ok: (c) => indoor(c) && free() && models.ready('man') && !!behindSpot(c), run(c) { // 轉身時,有人就站在你後面
      const s = behindSpot(c);
      const a = A.spawn({ tag: 'behind', fig: pick(['man', 'patient']), pose: 'reach', look: 'pale', x: s.x, y: lv(c), z: s.z, yaw: toward(c, s.x, s.z), dur: 9, alpha: 0.9, fadeIn: 0.05, face: true,
        vanish: { flash: true, flashT: 0.05, look: 0.6, lookT: 0.12, near: 0 },
        onVanish: (why) => { if (why === 'look' || why === 'flash') { ghost.stinger('hit'); game.player.addShake?.(0.25); h.chill(0.7, 6); } } });
      if (a) { if (Math.random() < 0.55) cue('behind', 1, 'behind'); else h.after(0.4, () => ghost.breathNeck(0.9)); h.director.hold(10); }
      return a;
    } },
    curtain: { ok: (c) => indoor(c) && curtains(c).length > 0, run(c) { // 隔簾後站著一個病人(背光的剪影)
      const a = curtains(c).sort((p, q) => score(c, q) - score(c, p))[0]; // 最正對著玩家的那一床
      const e = M.silhouette('curtain', a.x, lv(c) + 1.08, a.z, a.nx, a.nz, 0.95, 1.9, rand(5, 8));
      h.watch(() => {
        if (e.out >= 0) return false;
        const p = game.player, d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), dot = ((a.x - p.pos.x) * fx + (a.z - p.pos.z) * fz) / (d || 1);
        if (d < 2.2 || (p.flashOn && dot > 0.9 && d < 10)) { e.end(); ghost.vanish({ x: a.x, y: lv(c) + 1.2, z: a.z }, 0.6); return false; }
        return true;
      });
      if (Math.random() < 0.5) h.after(1.5, () => { const l = W.pick('prop', { prop: 'bed_curtain' }); if (l) W.say(l, { priority: 4, pos: { x: a.x, y: lv(c) + 1.4, z: a.z } }); });
      return a;
    } },
    mirror: { ok: (c) => !!mirrorNow(c), run(c) { // 鏡子裡,你的肩膀後面有一張臉
      const m = mirrorNow(c);
      const rx = -m.nz, rz = m.nx, side = Math.random() < 0.5 ? -1 : 1;
      const e = M.silhouette('face', m.x + rx * side * (m.w || 0.47) * 0.18, m.y + 0.02, m.z + rz * side * (m.w || 0.47) * 0.18, m.nx, m.nz, (m.w || 0.47) * 0.42, (m.h || 0.59) * 0.62, rand(1.1, 1.6));
      ghost.stinger('shimmer', 0.8);
      if (Math.random() < 0.5) h.after(0.6, () => { const l = W.pick('prop', { prop: 'mirror' }); if (l) W.say(l, { priority: 5, ear: 'behind' }); });
      return e;
    } },
    counter: { ok: (c) => indoor(c) && free() && models.ready('man') && !!c.figSpot(), run(c) { // 數數的人(劇情組呼叫:game.horror.apparition('counter', { count }))
      const s = c.figSpot(), n = Math.max(1, Math.min(10, c.opts?.count ?? 1));
      const a = A.spawn({ tag: 'counter', fig: 'man', scale: 1.33, pose: 'stand', look: 'shade', x: s.x, y: lv(c), z: s.z, yaw: toward(c, s.x, s.z), dur: 2.6 + n * 0.85, vanish: { flash: true, look: 0, near: 6 } });
      if (a) h.caption('counter', n, c.opts?.tail);
      return a;
    } },
  };

  // ---- 查詢 ----
  // 濕腳印的路徑:視線前方 2~10m 的可走直線(碰到牆就停)
  function fpPath(c) {
    const out = [], yaw = Math.atan2(c.fx, c.fz);
    for (let d = 2.2, i = 0; d < 10; d += 0.6, i++) {
      const x = c.px + c.fx * d, z = c.pz + c.fz * d;
      if (c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2)) || !walk(c, x, z)) break;
      out.push({ x, z, yaw });
    }
    return out;
  }
  // 玩家背後、面向玩家的實牆(寫字用)
  function wallBehind(c) {
    if (c._wb !== undefined) return c._wb;
    const SOLID = (ch) => ch === '#' || ch === 'E';
    let best = null, bs = -1;
    for (const f of c.K.faces || []) {
      if (f.li !== c.li || f.kind !== 'room' || f.win || f.a1 - f.a0 < 1.6) continue;
      const isH = f.dir === 'N' || f.dir === 'S';
      if (Math.abs((isH ? f.fixed - c.pz : f.fixed - c.px)) > 7.5) continue;
      for (const k of [0, 1.5, 2.5, 3.5, 4.5]) { // 沿牆往玩家背後取樣
        const a = Math.max(f.a0 + 0.7, Math.min(f.a1 - 0.7, isH ? c.px - c.fx * k : c.pz - c.fz * k));
        const x = isH ? a : f.fixed, z = isH ? f.fixed : a;
        const dx = c.px - x, dz = c.pz - z, d = Math.hypot(dx, dz);
        if (d < 2.0 || d > 7.5 || (dx * f.nx + dz * f.nz) / d < 0.35) continue; // 牆面朝玩家
        if (c.inView(x, z, -0.3)) continue; // 要在背後
        const cc = isH ? Math.floor(a / 2) : f.c, rr = isH ? f.r : Math.floor(a / 2);
        if (!SOLID(c.L.charAt(c.li, cc, rr))) continue;
        if (!c.sees(c.li, c.px, c.pz, x + f.nx * 1.0, z + f.nz * 1.0)) continue;
        const sc = (dx * f.nx + dz * f.nz) / d - Math.abs(d - 4) * 0.1;
        if (sc > bs) { bs = sc; best = { x, y: f.y + rand(1.3, 1.65), z, nx: f.nx, nz: f.nz }; }
      }
    }
    return (c._wb = best);
  }
  // 孩子跑過的門:視線前方 5~14m 的門,孩子在門的另一側橫越
  function childPath(c) {
    for (const d of (c.K.doorList || []).slice().sort(() => Math.random() - 0.5)) {
      if (d.li !== c.li || !d.axis) continue;
      const ax = d.axis === 'z';
      const cx = ax ? ((d.run[0] + d.run[1] + 1) / 2) * 2 : d.c * 2 + 1, cz = ax ? d.r * 2 + 1 : ((d.run[0] + d.run[1] + 1) / 2) * 2;
      const dist = Math.hypot(cx - c.px, cz - c.pz);
      if (dist < 5 || dist > 14 || !c.inView(cx, cz, 0.85) || !c.seesNear(cx, cz)) continue;
      const sg = ax ? Math.sign(cz - c.pz) : Math.sign(cx - c.px); // 門的另一側
      if (!sg) continue;
      // 通道方向要大致朝著玩家的視線
      if (Math.abs(ax ? c.fz : c.fx) < 0.6) continue;
      const ox = ax ? cx : cx + sg * 1.3, oz = ax ? cz + sg * 1.3 : cz;
      const x0 = ax ? ox - 1.8 : ox, z0 = ax ? oz : oz - 1.8, x1 = ax ? ox + 1.8 : ox, z1 = ax ? oz : oz + 1.8;
      if (!walk(c, ox, oz) || !walk(c, x0, z0) || !walk(c, x1, z1)) continue;
      const flip = Math.random() < 0.5;
      return flip ? { x0: x1, z0: z1, x1: x0, z1: z0, dx: cx, dz: cz } : { x0, z0, x1, z1, dx: cx, dz: cz };
    }
    // 走廊:前方 6~12m,孩子從側邊的門口跑出來,橫越走廊
    const lx = -c.fz, lz = c.fx;
    for (let d = 6; d <= 12; d += 1) {
      const x = c.px + c.fx * d, z = c.pz + c.fz * d;
      if (c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2))) break;
      if (!walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      const side = (sg) => { let ext = 0, door = 0; for (let k = 0.5; k <= 5; k += 0.5) { const qx = x + lx * k * sg, qz = z + lz * k * sg; if (c.L.charAt(c.li, Math.floor(qx / 2), Math.floor(qz / 2)) === '+') { door = k; break; } if (!walk(c, qx, qz)) break; ext = k; } return { ext, door }; };
      const A2 = side(1), B2 = side(-1);
      const dA = A2.door && A2.door <= 3.5, dB = B2.door && B2.door <= 3.5;
      if (!dA && !dB) continue;
      const sg = dA && (!dB || Math.random() < 0.5) ? 1 : -1, S0 = sg > 0 ? A2 : B2, S1 = sg > 0 ? B2 : A2;
      const far = Math.max(0.5, S1.door ? S1.door : S1.ext);
      return { x0: x + lx * S0.door * sg, z0: z + lz * S0.door * sg, x1: x - lx * far * sg, z1: z - lz * far * sg, dx: x, dz: z };
    }
    return null;
  }
  // 護士:視線前方 11~18m 的可走點,往遠處走
  function nursePath(c) {
    for (let d = 11; d < 18; d += 1) {
      const x = c.px + c.fx * d, z = c.pz + c.fz * d;
      if (c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2))) return null;
      if (!walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      const path = [];
      for (let k = 1; k <= 8; k++) { const px = x + c.fx * k, pz = z + c.fz * k; if (!walk(c, px, pz) || c.solid(c.li, Math.floor(px / 2), Math.floor(pz / 2))) break; path.push({ x: px, z: pz }); }
      if (path.length < 3) continue;
      return { x, z, yaw: Math.atan2(c.fx, c.fz), path };
    }
    return null;
  }
  // 背後 1.4~2m 的可走點(看得到玩家)
  function behindSpot(c) {
    for (const d of [1.7, 1.9, 1.5]) for (const s of [0, 0.35, -0.35]) {
      const x = c.px - c.fx * d - c.fz * s, z = c.pz - c.fz * d + c.fx * s;
      if (walk(c, x, z) && !c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2)) && game.world.hasLineOfSight?.(c.px, c.py + 1.5, c.pz, x, c.py + 1.5, z) !== false) return { x, z };
    }
    return null;
  }
  function curtains(c) {
    return c.anchors.filter((a) => a.kind === 'bed_curtain' && a.li === c.li && near(c, a.x, a.z, 1.8, 9) && c.inView(a.x, a.z, 0.6) && ((c.px - a.x) * a.nx + (c.pz - a.z) * a.nz) / Math.hypot(c.px - a.x, c.pz - a.z) > 0.3 && c.sees(c.li, c.px, c.pz, a.x + a.nx * 0.8, a.z + a.nz * 0.8));
  }
  // 視線對準程度(越正對越高)
  function score(c, a) { const dx = a.x - c.px, dz = a.z - c.pz, d = Math.hypot(dx, dz) || 1; return (dx * c.fx + dz * c.fz) / d - d * 0.02; }
  function mirrorNow(c) {
    return c.anchors.find((a) => a.kind === 'mirror' && a.li === c.li && near(c, a.x, a.z, 1.0, 4.5) && c.inView(a.x, a.z, 0.8) && ((c.px - a.x) * a.nx + (c.pz - a.z) * a.nz) / (Math.hypot(c.px - a.x, c.pz - a.z) || 1) > 0.35) || null;
  }
  function lullabySpot(c) {
    const th = c.zone?.theme;
    const an = anchorsOf(c, ['doll', 'incubator'], 3, 16, null, false)[0];
    if (an) return { x: an.x, y: an.y + 0.4, z: an.z };
    if (th === 'nursery' || th === 'peds_ward' || th === 'playroom') { const a = rand(0, 6.28); return { x: c.px + Math.cos(a) * 7, y: c.py + 1, z: c.pz + Math.sin(a) * 7 }; }
    return null;
  }
  return K;
}
