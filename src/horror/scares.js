import { sfx, ghost } from '../audio.js';
import { WRITINGS } from './lines.js';
import { models } from './ghosts.js';

// 第二輪驚嚇庫(註冊進 src/map/hospital/events.js,由驚嚇導演排程;每種 { ok(c), run(c) })。
// 分類:有人在(跟著你的腳步、沿牆跟著你的敲擊、頸後呼吸、繞著頭轉的低語、背後跑過去)/ 聲音的空間把戲 /
//       門(慢慢自己打開、背後的門輕輕關上、整條走廊的門依序甩上)/ 東西被丟出來、轉頭前後不一樣 /
//       看得見的(視線邊緣跑過的影子、你一轉頭就靠近的人、手電筒一閃就不見的人、窗玻璃裡站在你背後的人)/
//       醫院廣播故障重播、護理呼叫鈴、太平間〈點名〉、隔離房從裡面敲門、停電之後有東西變了。
// 每種都看玩家的位置、朝向、明暗與最近的驚嚇(導演:冷卻 + 疲勞 + 幕次);文字一律從 lines.js 取。
// 門一律透過互動系統的門(game.interact.doors:setState / colliders),碰撞盒跟著更新;多人時不動門(門狀態是共享的)。
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function scareKinds(h) {
  const game = h.game, A = h.app, M = h.marks, W = h.whispers;
  const lv = (c, li = c.li) => c.L.levels[li].y;
  const walk = (c, x, z, li = c.li) => (c.L.flagsAt(li, Math.floor(x / 2), Math.floor(z / 2)) & c.L.F.WALK) !== 0;
  const solidAt = (c, x, z) => c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2));
  const dist = (c, x, z) => Math.hypot(x - c.px, z - c.pz);
  const viewDot = (c, x, z) => { const dx = x - c.px, dz = z - c.pz, d = Math.hypot(dx, dz) || 1; return (dx * c.fx + dz * c.fz) / d; };
  const cue = (k, p = 0.5, ear, delay) => { if (Math.random() >= p) return; const l = W.pick('cue', { cue: k, round: game.round }); if (l) h.after(delay ?? rand(0.3, 1.2), () => W.say(l, { priority: 4, ear })); };
  const indoor = (c) => !c.outdoor;
  const free = () => !!A.free();
  const act = () => h.director.act;
  const sp = () => !game.net; // 會改變共享世界狀態的(門)只在單人
  const P = () => game.player;
  const fwdOf = () => { const p = P(); return [-Math.sin(p.yaw), -Math.cos(p.yaw)]; };
  const lookDot = (x, z) => { const p = P(), [fx, fz] = fwdOf(), dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) || 1; return (dx * fx + dz * fz) / d; };
  const litNear = (c, r) => c.fixtures.some((f) => f.li === c.li && f.cur > 0.3 && f.state !== 2 && (f.x - c.px) ** 2 + (f.z - c.pz) ** 2 < r * r);
  // 可推動的道具(和 paranormal 共用快取)
  const dyn = (c) => {
    if (!h._dyn) { h._dyn = []; c.root.traverse((o) => { if (o.userData?.dynamic && /wc|wheel|cart|iv|linen|gurney|trolley|chair|stool|bin|box/i.test(o.userData.kind || o.name || '')) h._dyn.push(o); }); }
    return h._dyn;
  };
  const _w = { x: 0, y: 0, z: 0 };
  const wpos = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; _w.x = e[12]; _w.y = e[13]; _w.z = e[14]; return _w; };
  // ---- 門(互動系統) ----
  const D = () => game.interact?.doors || null;
  const wayOK = (w, c) => w.li === c.li && !w.out && !w.lock && !w.bar && !w.leaves.some((l) => l.anim || l._gh);
  const blocked = (w) => { const near = (p) => p && Math.abs(p.y - w.y) < 1.6 && Math.hypot(p.x - w.cx, p.z - w.cz) < 1.15; if (near(game.player.pos)) return true; for (const z of game.zombies) if (z.alive && near(z.pos)) return true; return false; };
  const doorSees = (c, w) => { const ax = w.leaves[0]?.axis, sx = Math.sign(c.px - w.cx) || 1, sz = Math.sign(c.pz - w.cz) || 1; const tx = ax === 'z' ? w.cx : w.cx + sx * 1.0, tz = ax === 'z' ? w.cz + sz * 1.0 : w.cz; return c.sees(c.li, c.px, c.pz, tx, tz); };
  const tip = (l, a) => { const cc = Math.cos(a), ss = -Math.sin(a); return [l.group.position.x + cc * l.lw, l.group.position.z + ss * l.lw]; };
  // 慢慢打開(往玩家那一側;開到一半多),結束時更新碰撞盒
  function creep(w, px, pz, dur, frac = rand(0.5, 0.72)) {
    const Dd = D();
    const legs = w.leaves.map((l) => {
      const ta = tip(l, l.swingA), tb = tip(l, l.swingB);
      const full = (ta[0] - px) ** 2 + (ta[1] - pz) ** 2 < (tb[0] - px) ** 2 + (tb[1] - pz) ** 2 ? l.swingA : l.swingB;
      const from = l.group.rotation.y, d = Math.atan2(Math.sin(full - from), Math.cos(full - from));
      l._gh = true;
      return { l, from, to: from + d * frac };
    });
    let t = 0;
    h.watch((dt) => {
      t += dt;
      const k = Math.min(1, t / dur), u = Math.max(0, (k - 0.12) / 0.88), e = k < 0.12 ? 0.04 * (k / 0.12) : 0.04 + 0.96 * u * u * (3 - 2 * u); // 先卡一下,再慢慢推開
      for (const g of legs) g.l.group.rotation.y = g.from + (g.to - g.from) * Math.min(1, e);
      if (k >= 1) { for (const g of legs) { g.l._gh = false; Dd?.colliders?.(g.l); } return false; }
      return true;
    });
  }

  // ---- 幾何查詢 ----
  // 玩家附近(maxD 內)最近的實牆面上的點(沿牆方向往前 ahead 公尺)
  function wallBeside(c, maxD = 2.2, ahead = 1.0) {
    let best = null, bd = maxD;
    for (const f of c.K.faces || []) {
      if (f.li !== c.li || f.kind !== 'room' || f.win) continue;
      const isH = f.dir === 'N' || f.dir === 'S';
      const perp = isH ? c.pz - f.fixed : c.px - f.fixed;
      if (perp * (isH ? f.nz : f.nx) <= 0) continue; // 要在牆的正面
      const d = Math.abs(perp);
      if (d >= bd) continue;
      const along = isH ? c.px + c.fx * ahead : c.pz + c.fz * ahead;
      if (along < f.a0 + 0.3 || along > f.a1 - 0.3) continue;
      const x = isH ? along : f.fixed, z = isH ? f.fixed : along;
      const cc = isH ? Math.floor(along / 2) : f.c, rr = isH ? f.r : Math.floor(along / 2);
      const ch = c.L.charAt(c.li, cc, rr);
      if (ch !== '#' && ch !== 'E') continue;
      bd = d; best = { x, y: f.y + 1.2, z, nx: f.nx, nz: f.nz };
    }
    return best;
  }
  // 視線前方、面向玩家的實牆(停電時寫字用)
  function wallAhead(c) {
    let best = null, bs = -1;
    for (const f of c.K.faces || []) {
      if (f.li !== c.li || f.kind !== 'room' || f.win || f.a1 - f.a0 < 1.6) continue;
      const isH = f.dir === 'N' || f.dir === 'S';
      for (const k of [2.5, 4, 5.5]) {
        const a = Math.max(f.a0 + 0.7, Math.min(f.a1 - 0.7, isH ? c.px + c.fx * k : c.pz + c.fz * k));
        const x = isH ? a : f.fixed, z = isH ? f.fixed : a;
        const dx = c.px - x, dz = c.pz - z, d = Math.hypot(dx, dz);
        if (d < 2 || d > 7.5 || (dx * f.nx + dz * f.nz) / d < 0.45 || viewDot(c, x, z) < 0.55) continue;
        const ch = c.L.charAt(c.li, isH ? Math.floor(a / 2) : f.c, isH ? f.r : Math.floor(a / 2));
        if (ch !== '#' && ch !== 'E') continue;
        if (!c.sees(c.li, c.px, c.pz, x + f.nx, z + f.nz)) continue;
        const s = viewDot(c, x, z) - Math.abs(d - 4) * 0.1;
        if (s > bs) { bs = s; best = { x, y: f.y + rand(1.35, 1.6), z, nx: f.nx, nz: f.nz }; }
      }
    }
    return best;
  }
  const behindPt = (c, d, side = 0) => ({ x: c.px - c.fx * d - c.fz * side, z: c.pz - c.fz * d + c.fx * side });

  const K = {
    // =================== 有人在 ===================
    // 跟著你的腳步:你走它走、你停它停(停下來之後多一步);回頭就沒了。第二幕起偶爾是林秀英巡房(病歷板的夾子)
    pace: { ok: (c) => indoor(c) && P().speedNorm > 0.3 && !c.zNear && !h._pace, run(c) {
      const trail = [], zheng = act() >= 2 && Math.random() < 0.4;
      let acc = 0, lx = c.px, lz = c.pz, t = 0, still = 0, steps = 0, done = false;
      h._pace = true;
      h.watch((dt) => {
        if (done || game.state !== 'playing') { h._pace = false; return false; }
        t += dt;
        const p = P().pos, mv = Math.hypot(p.x - lx, p.z - lz);
        lx = p.x; lz = p.z;
        if (mv > 0.01) trail.push([p.x, p.z]);
        if (trail.length > 60) trail.shift();
        const follower = trail[Math.max(0, trail.length - 18)] || [p.x, p.z]; // 約 3~4 公尺之前的位置
        if (lookDot(follower[0], follower[1]) > 0.55 && steps > 2) { done = true; h._pace = false; return false; } // 回頭:什麼都沒有
        acc += mv;
        if (mv < 0.004) still += dt; else still = 0;
        if (acc > 0.72) { acc = 0; steps++; h.after(0.14, () => sfx.remoteStep({ x: follower[0], y: p.y, z: follower[1] })); if (zheng && steps % 4 === 0) ghost.clip({ x: follower[0], y: p.y + 1.1, z: follower[1] }); }
        if (still > 0.55 && steps > 3) { // 你停下來:它多走一步,就在你後面
          done = true; h._pace = false;
          const [fx, fz] = fwdOf(), bx = p.x - fx * 1.6, bz = p.z - fz * 1.6;
          h.after(0.5, () => sfx.remoteStep({ x: bx, y: p.y, z: bz }));
          if (act() >= 2 && Math.random() < 0.5) h.after(1.2, () => ghost.breathNeck(0.7));
          else if (zheng) cue('pace', 0.6, 'behind', 1.4);
          return false;
        }
        return t < 16;
      });
      return true;
    } },
    // 沿著牆跟著你的敲擊(三次,一次比一次近);第二幕起林秀英提醒:聽到敲門不要開
    knockFollow: { ok: (c) => indoor(c) && !!wallBeside(c, 2.4, 1.2), run(c) {
      const sets = act() >= 3 ? 4 : 3;
      for (let i = 0; i < sets; i++) h.after(i * rand(3.2, 4.4), () => {
        const p = P().pos, [fx, fz] = fwdOf();
        const w = wallBeside({ ...c, px: p.x, pz: p.z, fx, fz }, 3, i === sets - 1 ? -0.4 : 1.4);
        if (w) ghost.knock({ x: w.x, y: w.y, z: w.z }, i === sets - 1 ? 3 : 2, { g: 0.7 + i * 0.15 });
      });
      if (act() >= 2) cue('knock', 0.5, 'left', sets * 3.8 + 0.8);
      return true;
    } },
    // 頸後的呼吸(站著不動或慢慢走、偏暗的地方)
    breathBehind: { ok: (c) => P().speedNorm < 0.45 && !c.zNear && (c.dark || !litNear(c, 4)), run() {
      ghost.breathNeck(0.85);
      if (Math.random() < 0.35) h.chill(0.35, 6);
      return true;
    } },
    // 繞著頭轉的低語(從背後開始,繞一圈半)
    circle: { ok: (c) => !c.zNear && P().speedNorm < 0.5 && !(W.busy && W.cur?.prio >= 5), run() {
      const l = W.pick('cue', { cue: 'circle', round: game.round }) || W.pick('idle', { round: game.round, phase: game.phase });
      if (!l) return null;
      return W.say(l, { priority: 5, orbit: { r: 0.55, w: rand(2.2, 3) * (Math.random() < 0.5 ? -1 : 1), a: 0 }, ear: 'behind', mode: 'syllabic' });
    } },
    // 背後有人跑過去(由左到右的急促腳步 + 風聲)
    runBehind: { ok: (c) => indoor(c) && !c.zNear && walk(c, behindPt(c, 2.3).x, behindPt(c, 2.3).z), run(c) {
      const s = Math.random() < 0.5 ? 1 : -1, b = behindPt(c, 2.3), y = lv(c);
      const pos = { x: 0, y: y + 1, z: 0 };
      for (let i = 0; i < 7; i++) h.after(i * 0.16, () => { const u = (i / 6 - 0.5) * 2 * s * 3; const q = { x: b.x - c.fz * u, y, z: b.z + c.fx * u }; sfx.remoteStep(q, undefined, true); if (i === 3) { pos.x = q.x; pos.z = q.z; ghost.whoosh(pos, 0.9); } });
      return true;
    } },
    // 推車從前方路口橫過去(聲音由左到右)
    gurneyPass: { ok: (c) => indoor(c) && !!crossAhead(c), run(c) {
      const X = crossAhead(c), pos = { x: X.x0, y: lv(c) + 0.6, z: X.z0 };
      ghost.cart(pos, 3.6);
      let t = 0;
      h.watch((dt) => { t += dt; const k = Math.min(1, t / 3.4); pos.x = X.x0 + (X.x1 - X.x0) * k; pos.z = X.z0 + (X.z1 - X.z0) * k; return k < 1; });
      return X;
    } },
    // 護理呼叫鈴在空病房響(第二幕起林秀英回應)
    nurseCall: { ok: (c) => indoor(c) && !!bellSpot(c), run(c) {
      const s = bellSpot(c);
      ghost.callBell({ x: s.x, y: lv(c) + 1.3, z: s.z });
      if (act() >= 2) cue('call', 0.5, undefined, 3.2);
      return s;
    } },
    // 醫院廣播故障重播(大新的集合廣播系統;STORY.md §1.10:合成、甜美、制式,叫人集合的喇叭都裝了誘集模組)
    paHijack: { ok: () => !!W.pick('pa', { round: game.round, phase: game.phase }) && !(W.busy && W.cur?.prio >= 8), run() {
      const l = W.pick('pa', { round: game.round, phase: game.phase });
      sfx.pa('up');
      h.after(2.1, () => { const r = W.say(l, { filter: 'pa', priority: 8, force: true }); const d = r?.dur ?? 4; h.after(d - 0.4, () => { if (Math.random() < 0.6) ghost.paGlitch(); else sfx.pa('down'); }); });
      h.director.hold(8);
      return l;
    } },
    // =================== 門 ===================
    // 視線裡一扇關著的門,慢慢自己打開(往你這邊)
    doorOpen: { ok: (c) => sp() && !!creepWay(c), run(c) {
      const w = creepWay(c);
      h.after(rand(0.4, 1.2), () => { ghost.creakLong({ x: w.cx, y: w.y + 1.2, z: w.cz }, 3.8); creep(w, P().pos.x, P().pos.z, rand(3.6, 4.6)); });
      return w;
    } },
    // 背後剛經過的門,輕輕關上了(第二幕起:林秀英說「門要關好」)
    doorClose: { ok: (c) => sp() && !!closeWay(c), run(c) {
      const w = closeWay(c);
      D().setState(w, 'closed', { sound: true, net: false });
      if (act() >= 2) cue('door', 0.3, 'behind', 1.6);
      return w;
    } },
    // 整條走廊的門,從遠到近依序甩上(第三幕)
    doorSlamSeq: { ok: (c) => sp() && slamWays(c).length >= 3, run(c) {
      const ws = slamWays(c);
      ws.forEach((w, i) => h.after(0.3 + i * 0.55, () => { if (blocked(w)) return; D().setState(w, 'closed', { fast: true, sound: false, net: false }); sfx.door({ x: w.cx, y: w.y + 1.2, z: w.cz }, 'slam'); }));
      h.after(0.3 + ws.length * 0.55 + 0.4, () => { ghost.silence(3.5, 0.05); ghost.stinger('sub', 0.8); });
      h.director.hold(ws.length * 0.55 + 6);
      return ws.length;
    } },
    // 隔離房從裡面敲門(一次比一次重;三樓)
    cellKnock: { ok: (c) => !!cellDoor(c), run(c) {
      const a = cellDoor(c), pos = { x: a.x, y: a.y, z: a.z };
      for (let i = 0; i < 3; i++) h.after(i * rand(1.6, 2.4), () => (i < 2 ? ghost.knock(pos, 2 + i, { g: 0.8 + i * 0.3 }) : sfx.scare('bang', pos)));
      h.after(6.5, () => { const l = W.pick('prop', { prop: 'cell_door' }); if (l) W.say(l, { priority: 4, pos }); });
      return a;
    } },
    // =================== 東西 ===================
    // 有東西被丟過來(看得見的輕物件:垃圾桶、椅子、紙箱、點滴架)
    throw: { ok: (c) => !!game.physics?.ready && !!throwable(c), run(c) {
      const o = throwable(c), q = wpos(o), px = q.x, py = q.y, pz = q.z;
      // 往玩家視線的側面(有時朝玩家)丟:衝量點在反方向下方
      const s = Math.random() < 0.5 ? 1 : -1, tw = Math.random() < 0.35;
      let dx = tw ? c.px - px : -c.fz * s, dz = tw ? c.pz - pz : c.fx * s;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      ghost.whoosh({ x: px, y: py + 0.6, z: pz }, 0.8);
      game.physics.impulseAt({ x: px - dx * 0.45, y: py - 0.15, z: pz - dz * 0.45 }, 0.9, rand(6.5, 8.5));
      h.after(0.85, () => sfx.thud({ x: px + dx * 2, y: py, z: pz + dz * 2 }, false));
      if (act() >= 3) cue('throw', 0.35, undefined, 1.4);
      return { x: px, z: pz };
    } },
    // =================== 看得見的 ===================
    // 視線邊緣有影子跑過去(轉頭就沒了)
    peripheral: { ok: (c) => indoor(c) && free() && models.ready('man') && !!edgePath(c), run(c) {
      const E = edgePath(c);
      const a = A.spawn({ tag: 'peripheral', fig: 'man', pose: 'runA', anim: ['runA', 'runB'], animDt: 0.13, look: 'shade', alpha: 0.85, x: E.x0, y: lv(c), z: E.z0, yaw: Math.atan2(E.x1 - E.x0, E.z1 - E.z0), path: [{ x: E.x1, z: E.z1 }], speed: 5, endOnArrive: true, dur: 2, vanish: { flash: true, look: 0.96, lookT: 0.05, near: 0 } });
      if (a) ghost.whoosh({ x: E.x0, y: lv(c) + 1.2, z: E.z0 }, 0.6);
      return a;
    } },
    // 你一轉頭,它就靠近一點(盯著它就不動;靠得夠近再看它一眼 → 刺擊、消失)
    creeper: { ok: (c) => indoor(c) && free() && models.ready('patient') && !!creepSpot(c), run(c) {
      const s = creepSpot(c);
      let away = 0, hops = 0;
      const a = A.spawn({ tag: 'creeper', fig: 'patient', pose: 'tilt', look: 'pale', alpha: 0.6, x: s.x, y: lv(c), z: s.z, yaw: Math.atan2(c.px - s.x, c.pz - s.z), dur: 40, face: true,
        vanish: { flash: false, look: 0, near: 0 },
        onTick: (q, dt) => {
          const p = P().pos, d = Math.hypot(q.x - p.x, q.z - p.z), dot = lookDot(q.x, q.z);
          if (d < 3.6 && dot > 0.75 && hops > 0) { ghost.stinger('hit'); P().addShake?.(0.22); h.chill(0.6, 5); A.dismiss(q, 'look', true); return; }
          if (dot < 0.35) away += dt; else away = 0;
          if (away > 0.45 && hops < 5) { // 沒在看:往玩家靠近一步(落點要能走、而且看得到玩家)
            away = 0;
            const k0 = Math.min(2.8, d - 3.2), ux = (p.x - q.x) / d, uz = (p.z - q.z) / d;
            if (k0 > 0.5) for (const [kk, lat] of [[1, 0], [0.7, 0], [1, 0.8], [1, -0.8], [0.5, 0.6], [0.5, -0.6]]) {
              const k = k0 * kk, nx = q.x + ux * k - uz * lat, nz = q.z + uz * k + ux * lat;
              if (!walk(c, nx, nz) || !c.sees(c.li, nx, nz, p.x, p.z)) continue;
              q.x = nx; q.z = nz; hops++; sfx.remoteStep({ x: nx, y: lv(c), z: nz });
              break;
            }
          }
        } });
      if (a) { cue('creeper', 0.4, 'behind', 2); h.director.hold(12); }
      return a;
    } },
    // 走廊盡頭的人影:手電筒接觸不良閃一下,就不見了(第三幕:下一閃它就在你面前)
    flashFlick: { ok: (c) => indoor(c) && free() && P().flashOn && models.ready('man') && !!flickSpot(c), run(c) {
      const s = flickSpot(c), close = act() >= 3 && Math.random() < 0.45;
      const a = A.spawn({ tag: 'flashFlick', fig: pick(['man', 'patient']), pose: 'stand', look: 'pale', alpha: 0.7, x: s.x, y: lv(c), z: s.z, yaw: Math.atan2(c.px - s.x, c.pz - s.z), dur: 9, vanish: { flash: false, look: 0, near: 5 } });
      if (!a) return null;
      h.after(rand(1.4, 2.2), () => flashFlicker(0.85, () => {
        A.dismiss(a, 'flash', true);
        if (close) h.after(0.9, () => { // 第二閃:它就在你面前
          const p = P().pos, [fx, fz] = fwdOf(), x = p.x + fx * 2.2, z = p.z + fz * 2.2;
          if (!walk(c, x, z) || !free()) return;
          const b = A.spawn({ tag: 'flashFlick2', fig: 'patient', pose: 'reach', look: 'pale', alpha: 0.85, x, y: lv(c), z, yaw: Math.atan2(p.x - x, p.z - z), dur: 0.5, fadeIn: 0.02, vanish: { flash: false, look: 0, near: 0 } });
          if (b) { flashFlicker(0.4); ghost.stinger('hit'); P().addShake?.(0.2); }
        });
      }));
      return a;
    } },
    // 窗玻璃的倒影裡,有人站在你背後(轉頭:沒有人)
    reflection: { ok: (c) => free() && models.ready('patient') && !!reflectWin(c), run(c) {
      const R = reflectWin(c);
      const a = A.spawn({ tag: 'reflection', fig: pick(['patient', 'man']), pose: 'stand', look: 'pale', alpha: 0.62, x: R.x, y: lv(c), z: R.z, yaw: R.yaw, dur: 2.8, fadeIn: 0.45,
        vanish: { flash: false, look: 0, near: 0 },
        onTick: (q) => { if (lookDot(R.wx, R.wz) < 0.55) A.dismiss(q, 'look'); }, // 不看玻璃了(轉頭)→ 不見
        onVanish: (why) => { if (why === 'look') { ghost.breathNeck(0.8); cue('reflect', 0.5, 'behind', 0.8); } } });
      return a;
    } },
    // =================== 地點 ===================
    // 太平間〈點名〉:冰櫃抽屜由遠到近一格一格被敲,最後一格就在你旁邊滑開(STORY.md §5.11-3)
    rollcall: { ok: (c) => (c.zone?.theme === 'morgue' || c.zone?.id === 'b1_morgue') && !!drawerLine(c), run(c) {
      const pts = drawerLine(c);
      pts.forEach((q, i) => h.after(i * 0.75, () => ghost.knock({ x: q.x, y: q.y, z: q.z }, i === pts.length - 1 ? 3 : 2, { metal: true, g: 0.7 + i * 0.06 })));
      const last = pts[pts.length - 1];
      h.after(pts.length * 0.75 + 0.9, () => { sfx.scare('drawer', { x: last.x, y: last.y, z: last.z }); h.emit('rollcall', { pos: last }); });
      if (act() >= 2) cue('rollcall', 0.6, undefined, pts.length * 0.75 + 2.6);
      h.director.hold(pts.length * 0.75 + 4);
      return pts.length;
    } },
    // =================== 停電之後,有東西變了(第三幕) ===================
    blackoutChange: { ok: (c) => indoor(c) && c.fixNear(14).filter((f) => f.cur > 0.2 && !f.prop).length >= 3 && !!wallAhead(c), run(c) {
      const list = c.fixNear(14).filter((f) => !f.prop), t = game.time, hold = rand(3.4, 4.6);
      ghost.silence(hold + 1.5, 0.04);
      list.forEach((f, i) => c.active.push({ type: 'die', f, t0: t + i * 0.06, t1: t + hold + i * 0.12, onStart: i === 0 ? () => { sfx.scare('lights_off'); game.motion?.beat('dark', { hold }); } : null }));
      h.after(hold + 0.1, () => game.motion?.beat('light')); // [motion]
      const wa = wallAhead(c), opts = WRITINGS.filter((x) => x.kind === 'appear' && !h.usedWrit.has(x.id));
      h.after(1.3, () => {
        if (wa && opts.length) { const w = pick(opts); h.usedWrit.add(w.id); M.write(w, wa.x, wa.y, wa.z, wa.nx, wa.nz, { fadeIn: 0.1 }); }
        const o = game.physics?.ready && dyn(c).find((q) => { const p = wpos(q); return Math.abs(p.y - lv(c)) < 1.5 && dist(c, p.x, p.z) > 1.5 && dist(c, p.x, p.z) < 6; });
        if (o) { const p = wpos(o); game.physics.impulseAt({ x: p.x + 0.4, y: p.y + 0.3, z: p.z + 0.4 }, 1, 3); }
      });
      h.after(hold + 0.6, () => cue('dark', 0.5, 'both'));
      h.director.hold(hold + 5);
      return list.length;
    } },
  };

  // ---- 查詢 ----
  function crossAhead(c) { // 前方 7~13m 的開闊處(路口/大房間),左右各有 2m 以上可走
    for (let d = 7; d <= 13; d += 1.5) {
      const x = c.px + c.fx * d, z = c.pz + c.fz * d;
      if (solidAt(c, x, z)) return null;
      if (!walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      const lx = -c.fz, lz = c.fx;
      if (walk(c, x + lx * 2.2, z + lz * 2.2) && walk(c, x - lx * 2.2, z - lz * 2.2)) { const s = Math.random() < 0.5 ? 1 : -1; return { x0: x + lx * 4 * s, z0: z + lz * 4 * s, x1: x - lx * 4 * s, z1: z - lz * 4 * s }; }
    }
    return null;
  }
  function bellSpot(c) { // 附近 5~20m 的病床(隔簾錨點)或病房中央,最好看不到
    const beds = c.anchors.filter((a) => a.kind === 'bed_curtain' && a.li === c.li && dist(c, a.x, a.z) > 5 && dist(c, a.x, a.z) < 20);
    if (beds.length) return pick(beds);
    const wards = c.L.zones.filter((z) => z.levelIndex === c.li && (z.theme === 'ward' || z.theme === 'peds_ward' || z.theme === 'icu'));
    for (const z of wards) { const [c0, r0, c1, r1] = z.rects[0], x = c0 + c1 + 1, zz = r0 + r1 + 1, d = dist(c, x, zz); if (d > 5 && d < 22) return { x, z: zz }; }
    return null;
  }
  function creepWay(c) { // 看得到的、關著的門,4~14m
    const Dd = D();
    if (!Dd) return null;
    let best = null, bs = -1;
    for (const w of Dd.list) {
      if (!wayOK(w, c) || !Dd.allClosed(w)) continue;
      const d = dist(c, w.cx, w.cz);
      if (d < 3.5 || d > 14) continue;
      const v = viewDot(c, w.cx, w.cz);
      if (v < 0.6 || !doorSees(c, w)) continue;
      const s = v - d * 0.02;
      if (s > bs) { bs = s; best = w; }
    }
    return best;
  }
  function closeWay(c) { // 背後 2.5~9m、開著的門(門口沒有人)
    const Dd = D();
    if (!Dd) return null;
    for (const w of Dd.list) {
      if (!wayOK(w, c) || Dd.allClosed(w) || blocked(w)) continue;
      const d = dist(c, w.cx, w.cz);
      if (d < 2.5 || d > 9 || viewDot(c, w.cx, w.cz) > -0.2) continue;
      if (!doorSees(c, w)) continue;
      return w;
    }
    return null;
  }
  function slamWays(c) { // 視線前方 5~24m、開著的門,遠的先
    const Dd = D();
    if (!Dd) return [];
    const out = [];
    for (const w of Dd.list) {
      if (!wayOK(w, c) || Dd.allClosed(w) || blocked(w)) continue;
      const d = dist(c, w.cx, w.cz);
      if (d < 5 || d > 24 || viewDot(c, w.cx, w.cz) < 0.7 || !doorSees(c, w)) continue;
      out.push([d, w]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 5).map((x) => x[1]);
  }
  function cellDoor(c) { // 隔離房門錨點,2~10m
    return c.anchors.find((a) => a.kind === 'cell_door' && a.li === c.li && dist(c, a.x, a.z) > 2 && dist(c, a.x, a.z) < 10) || null;
  }
  function throwable(c) { // 看得見、3~9m 的輕物件
    return dyn(c).find((o) => { if (!/bin|box|chair|stool|iv|cart|linen/i.test(o.userData.kind || o.name || '')) return false; const p = wpos(o); const d = dist(c, p.x, p.z); return Math.abs(p.y - lv(c)) < 1.5 && d > 3 && d < 9 && viewDot(c, p.x, p.z) > 0.55 && c.sees(c.li, c.px, c.pz, p.x, p.z); }) || null;
  }
  function edgePath(c) { // 視線邊緣(左/右 40~55 度)5~10m,一條橫過去的路
    for (const s of Math.random() < 0.5 ? [1, -1] : [-1, 1]) for (const ang of [0.72, 0.85, 0.95]) for (const d of [6, 8, 10]) {
      const a = Math.atan2(c.fx, c.fz) + ang * s, x = c.px + Math.sin(a) * d, z = c.pz + Math.cos(a) * d;
      if (!walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      const lx = -Math.cos(a) * s, lz = Math.sin(a) * s; // 往視線外跑
      const x0 = x - lx * 1.2, z0 = z - lz * 1.2, x1 = x + lx * 2.4, z1 = z + lz * 2.4;
      if (walk(c, x0, z0) && walk(c, x1, z1)) return { x0, z0, x1, z1 };
    }
    return null;
  }
  function creepSpot(c) { // 背後或側面 11~17m、看不到的可走點(偏暗更好)
    let best = null, bs = -1;
    for (const ang of [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.6, -Math.PI * 0.6]) for (const d of [12, 14, 16]) {
      const a = Math.atan2(c.fx, c.fz) + ang, x = c.px + Math.sin(a) * d, z = c.pz + Math.cos(a) * d;
      if (!walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      const dark = !c.fixtures.some((f) => f.li === c.li && f.cur > 0.3 && (f.x - x) ** 2 + (f.z - z) ** 2 < 16);
      const s = (dark ? 1 : 0.4) + Math.random() * 0.3;
      if (s > bs) { bs = s; best = { x, z }; }
    }
    return best;
  }
  function flickSpot(c) { // 手電筒光束裡、前方 9~17m
    for (const d of [15, 13, 11, 9]) {
      const x = c.px + c.fx * d, z = c.pz + c.fz * d;
      if (solidAt(c, x, z)) continue;
      if (walk(c, x, z) && c.sees(c.li, c.px, c.pz, x, z)) return { x, z };
    }
    return null;
  }
  function reflectWin(c) { // 正對著(1.3~4.5m)一扇沒釘木板的窗:背後 1.3m 的人,倒映在玻璃裡
    for (const w of c.K.windowInfo || []) {
      if (w.li !== c.li || w.boarded || w.store) continue;
      const d = dist(c, w.x, w.z);
      if (d < 1.3 || d > 4.5 || viewDot(c, w.x, w.z) < 0.85 || !c.seesNear(w.x, w.z)) continue;
      if (!(litNear(c, 6) || P().flashOn)) continue; // 玻璃要能反光:這一側有光
      const ax = w.axis === 'z'; // 玻璃面在 z = w.z(ax)或 x = w.x
      const Q = behindPt(c, 1.3, rand(-0.25, 0.25));
      const x = ax ? Q.x : 2 * w.x - Q.x, z = ax ? 2 * w.z - Q.z : Q.z;
      return { x, z, wx: w.x, wz: w.z, yaw: Math.atan2(c.px - x, c.pz - z) };
    }
    return null;
  }
  function drawerLine(c) { // 太平間最長的一面牆:由遠到近 6~8 個點,最後一個在玩家旁邊
    let best = null;
    for (const f of c.K.faces || []) {
      if (f.li !== c.li || f.kind !== 'room' || f.zone !== c.zone || f.a1 - f.a0 < 4) continue;
      if (!best || f.a1 - f.a0 > best.a1 - best.a0) best = f;
    }
    if (!best) return null;
    const isH = best.dir === 'N' || best.dir === 'S', me = isH ? c.px : c.pz;
    const near = Math.max(best.a0 + 0.5, Math.min(best.a1 - 0.5, me)), far = Math.abs(best.a0 - me) > Math.abs(best.a1 - me) ? best.a0 + 0.5 : best.a1 - 0.5;
    const n = 7, out = [];
    for (let i = 0; i < n; i++) { const a = far + (near - far) * (i / (n - 1)); out.push({ x: isH ? a : best.fixed + best.nx * 0.3, y: best.y + 1.0, z: isH ? best.fixed + best.nz * 0.3 : a }); }
    return out;
  }
  // 手電筒接觸不良(只改強度;dur 秒;中途 onDark() 在最暗的那一刻)
  function flashFlicker(dur, onDark) {
    const p = P(), L = p.flashlight;
    if (!L || !p.flashOn) { onDark?.(); return; }
    const base = p._flashI || L.intensity || 90;
    let t = 0, darkDone = false;
    ghost.flashBuzz(dur);
    h.watch((dt) => {
      t += dt;
      if (!p.flashOn) { p._flashI = base; onDark && !darkDone && onDark(); return false; } // 玩家自己關掉了:修好記住的強度
      const u = t / dur;
      if (u >= 1) { L.intensity = base; if (!darkDone) onDark?.(); return false; }
      const k = u > 0.35 && u < 0.6 ? 0.03 : Math.random() < 0.45 ? 0.08 : 0.55 + Math.random() * 0.45;
      L.intensity = base * k;
      if (!darkDone && u > 0.42) { darkDone = true; onDark?.(); }
      return true;
    });
  }
  h.flashFlicker = flashFlicker; // 電話腳本也會用
  h.creepDoor = creep;
  h.scareUtil = { wallAhead, wallBeside, wayOK, doorSees, blocked, creepWay, closeWay, behindPt }; // 第三輪(haunts.js)共用的幾何查詢
  return K;
}
