// 「回憶」引擎:走到 2003 年發生過事情的地方,世界滑進過去(褐/青綠調色 + 顆粒 + 2003 的聲音),
// 褐色的回音人影照著當年演一次(10~25 秒),字幕是他們說的話;然後回到 2026:同一個地方,已經破敗。
// 規則:只在靜默期(不在誘集、追逐、大場面裡);導演控節奏(兩段之間至少 100 秒、與驚嚇之間 12 秒);每段一局一次;
//       玩家一直可以動(走開 = 跳過;沒看到 60% 不算看過,之後還會再來);燈只改強度;調色是 post 的 uniform(game.post.uniforms.past)。
// 資料在 memdata.js;每段給一張筆記本的卡(game.deduce?.addCard / game.objectives?.clue),並記進 h.remember('mem.<id>')。
import { sfx, ghost } from '../audio.js';
import { MEMORIES } from './memdata.js';
import { Apparitions, models } from './ghosts.js';

const rand = (a, b) => a + Math.random() * (b - a);
const KEEP = new Set(['emergency', 'exit', 'beacon', 'monitor', 'candle', 'fire', 'street', 'nightlight']);
const GAP = 100; // 兩段回憶之間(遊戲秒)
const ECHO = 0xcdb68c, ECHO_SHADE = 0x55665f; // 回音:舊照片的褐色;窗外的人:背光的青灰

export function createMemories(h) {
  const game = h.game;
  const echoes = new Apparitions(h, game.scene, 6); // 回音人影(和幻影同一個 shader → 不會多編譯)
  for (const s of echoes.slots) { s.pale.uniforms.uColor.value.setHex(ECHO); s.shade.uniforms.uColor.value.setHex(ECHO_SHADE); }
  const S = { played: new Set(), cur: null, lastEnd: -1e9, past: 0, pastTgt: 0, log: [], lights: new Map() };
  const L = () => game.hospital?.layout;
  const walkable = (li, x, z) => { const l = L(); return !!l && (l.flagsAt(li, Math.floor(x / 2), Math.floor(z / 2)) & l.F.WALK) !== 0; };
  const cellW = ([c, r]) => ({ x: c * 2 + 1, z: r * 2 + 1 });
  const zoneOf = (id) => L()?.zones.find((z) => z.id === id) || null;
  const P = () => game.player;

  // ---- 地點與座標系 ----
  function placeOf(m) {
    const l = L(), z = zoneOf(m.zone);
    if (!l || !z) return null;
    const li = z.levelIndex, y = l.levels[li].y;
    let o = null;
    if (m.cell) o = cellW(m.cell);
    else if (m.anchor) { const [c0, r0, c1, r1] = z.rects[0], cx = c0 + c1 + 1, cz = r0 + r1 + 1; const a = (h.events?.anchors || []).filter((q) => q.kind === m.anchor && q.li === li).sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz))[0]; o = a ? { x: a.x, z: a.z } : { x: cx, z: cz }; }
    else if (m.win) { // 最近那一扇沒釘木板的窗,往裡面 1.6m
      const t = cellW(m.win), w = (game.hospital.K.windowInfo || []).filter((q) => q.li === li && !q.boarded && !q.store).sort((p, q) => Math.hypot(p.x - t.x, p.z - t.z) - Math.hypot(q.x - t.x, q.z - t.z))[0];
      if (!w) return null;
      const ax = w.axis === 'z', cands = ax ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const inn = cands.find(([dx, dz]) => walkable(li, w.x + dx * 1.6, w.z + dz * 1.6)) || cands[0];
      return { li, y, x: w.x + inn[0] * 1.6, z: w.z + inn[1] * 1.6, ex: -inn[0], ez: -inn[1], fixed: true }; // +u 朝窗外
    } else { const [c0, r0, c1, r1] = z.rects[0]; o = { x: c0 + c1 + 1, z: r0 + r1 + 1 }; }
    // 長軸:往兩邊能走多遠
    const run = (dx, dz) => { let n = 0; for (let i = 1; i <= 8 && walkable(li, o.x + dx * i * 2, o.z + dz * i * 2); i++) n++; return n; };
    const lx = run(1, 0) + run(-1, 0), lz = run(0, 1) + run(0, -1);
    return { li, y, x: o.x, z: o.z, ex: lx >= lz ? 1 : 0, ez: lx >= lz ? 0 : 1 };
  }
  function frame(m, pl) {
    const p = P().pos;
    let ex = pl.ex, ez = pl.ez;
    if (!pl.fixed && (pl.x - p.x) * ex + (pl.z - p.z) * ez < 0) { ex = -ex; ez = -ez; } // +u:玩家走進來的方向
    let nx = -ez, nz = ex;
    if (m.side) { const s = cellW(m.side); if ((s.x - pl.x) * nx + (s.z - pl.z) * nz < 0) { nx = -nx; nz = -nz; } }
    return { ...pl, ex, ez, nx, nz };
  }
  const wpt = (F, u, v) => ({ x: F.x + F.ex * u + F.nx * v, z: F.z + F.ez * u + F.nz * v });
  function snap(F, u, v, out) { // 走不到的點往中線/原點縮(窗外的人不檢查)
    if (out) return wpt(F, u, v);
    for (const [a, b] of [[u, v], [u, v * 0.5], [u, 0], [u * 0.6, v * 0.5], [u * 0.3, 0]]) { const q = wpt(F, a, b); if (walkable(F.li, q.x, q.z)) return q; }
    return wpt(F, 0, 0);
  }
  const faceYaw = (F, from, f) => {
    if (f === 'player') return Math.atan2(P().pos.x - from.x, P().pos.z - from.z);
    const dir = f === 'e+' ? [F.ex, F.ez] : f === 'e-' ? [-F.ex, -F.ez] : f === 'v+' ? [F.nx, F.nz] : f === 'v-' ? [-F.nx, -F.nz] : null;
    if (dir) return Math.atan2(dir[0], dir[1]);
    if (Array.isArray(f)) { const q = wpt(F, f[0], f[1]); return Math.atan2(q.x - from.x, q.z - from.z); }
    return Math.atan2(P().pos.x - from.x, P().pos.z - from.z);
  };

  // ---- 能不能放 ----
  function gateOK(m) {
    const g = m.gate || {}, act = h.director.act;
    if (g.after && !S.played.has(g.after)) return false;
    if ((g.act || 1) > act) return false;
    if (g.any?.length) {
      const O = game.objectives, Dd = game.deduce;
      const api = !!(O?.has || Dd?.has);
      if (api && !g.any.some((k) => O?.has?.(k) || Dd?.has?.(k) || game.flags?.has?.(k))) return act >= Math.min(3, (g.act || 1) + 1) && act >= 3 && h.director.t > 1200; // 劇情 API 有了就照進度;很久都沒有就放寬
    }
    return true;
  }
  function canStart() {
    const D = h.director;
    if (S.cur || !D.silent || D.chasing || D.bigActive || D.tension > 0.2 || D.roundT < 8) return false;
    if (D.t < D.calmUntil || D.t - D.lastAny < 12 || game.time - S.lastEnd < GAP) return false;
    if (game.net?.pvp || h.whispers.busy) return false;
    for (const z of game.zombies) if (z.alive && (z.dist ?? 99) < 16) return false;
    return true;
  }

  // ---- 播放 ----
  function start(m, o = {}) {
    const pl = placeOf(m);
    if (!pl) return null;
    const F = frame(m, pl), run = { m, F, t: 0, dur: m.dur || 18, echoes: {}, gave: false, bed: null, token: {} };
    S.cur = run;
    h.director.notify('memory', { dur: run.dur });
    h.director.hold(run.dur + 4);
    S.log.push(m.id); if (S.log.length > 20) S.log.shift();
    // 進場:耳鳴、阿嬤哼〈望春風〉、世界變舊
    ghost.silence(run.dur + 1.2, 0.18);
    sfx.folk?.('ama', { x: F.x, y: F.y + 1.4, z: F.z });
    S.pastTgt = 1;
    game.motion?.beat('gate'); // [motion] 滑進過去:放映機門的兩下很淡的閃
    run.bed = ghost.pastBed?.(run.dur, m.bed || 'ward');
    if ((m.lights || 'on') === 'on') lightsPast(F, 16);
    const T = run.token, at = (sec, fn) => h.after(sec, () => { if (S.cur?.token === T) fn(); });
    for (const c of m.cast || []) at(1.0 + (c.t || 0), () => spawnEcho(run, c));
    for (const c of m.cast || []) if (c.end != null) at(1.0 + c.end, () => { const a = run.echoes[c.id]; if (a) { a.alpha = 0.001; echoes.dismiss(a, 'time', true); } });
    for (const b of m.beats || []) at(1.0 + b.t, () => beat(run, b));
    h.emit('memory', { id: m.id, phase: 'start' });
    return run;
  }
  function spawnEcho(run, c) {
    const F = run.F, p0 = snap(F, c.at[0], c.at[1], c.out), y = F.y; // 窗外的人也在窗的高度(回憶裡的投影,看得到)
    const path = (c.path || []).map(([u, v]) => snap(F, u, v, c.out));
    if (!models.ready(c.fig)) models.want?.(c.fig);
    const a = echoes.spawn({ tag: 'echo:' + run.m.id + ':' + c.id, fig: c.fig, pose: c.pose || 'stand', look: c.look || 'pale', alpha: c.alpha ?? 0.42, wob: 0.35,
      x: p0.x, y, z: p0.z, yaw: faceYaw(F, p0, c.face), path, speed: c.speed ?? 1, bob: !!path.length, dur: run.dur + 2, fadeIn: 0.9, anyLevel: true,
      vanish: { flash: false, look: 0, near: 0 } });
    if (a) { run.echoes[c.id] = a; a.alpha0 = a.alpha; if (c.face && path.length) a.faceEnd = c.face; }
  }
  function posOf(run, from) {
    const F = run.F, a = run.echoes[from];
    if (a) return { x: a.x, y: a.y + 1.5, z: a.z };
    return { x: F.x + F.nx * 1.1, y: F.y + 1.5, z: F.z + F.nz * 1.1 }; // 'near':門後
  }
  function beat(run, b) {
    const F = run.F;
    if (b.card) { giveCard(run); return; }
    if (b.fx) {
      const q = b.from ? posOf(run, b.from) : { x: F.x, y: F.y + 1.4, z: F.z };
      switch (b.fx) {
        case 'pa': sfx.pa?.('up'); break;
        case 'phone': sfx.scare('phone_ring', q); break;
        case 'clip': ghost.clip(q); break;
        case 'scrawl': ghost.scrawl(q, 2.2); break;
        case 'knock': ghost.knock(q, 1, { g: 0.6 }); ghost.clip(q); break; // 喇叭鎖「喀」
        case 'squeak': ghost.squeak(q); break;
        case 'water': ghost.exhale?.(q, 0.5); ghost.wetStep(q, 0.6); break;
        case 'shutter': ghost.clip(q); h.after(0.12, () => ghost.clip(q)); break;
        case 'struggle': ghost.knock(posOf(run, 'near'), 2, { metal: true, g: 0.7 }); h.after(0.5, () => sfx.scare('metal_scrape', posOf(run, 'near'))); break;
        case 'lightsOut': lightsOut(F, 20); break;
      }
      return;
    }
    if (b.say) {
      const pa = b.from === 'pa', ph = b.from === 'phone';
      h.whispers.say(b.say, { priority: 9, force: true, filter: pa ? 'pa' : ph ? 'phone' : null, pos: pa || ph ? undefined : posOf(run, b.from), tag: pa ? '醫院廣播 · 2003' : b.who || '', style: 'past', mode: 'syllabic' });
    }
  }
  function giveCard(run) {
    if (run.gave) return;
    run.gave = true;
    const card = run.m.card;
    h.remember?.('mem.' + run.m.id, { event: 'memory', tag: 'memory', ghost: 'zheng', card: card || null, text: run.m.title });
    h.emit('memory', { id: run.m.id, phase: 'card', card });
  }
  function end(run, why) {
    if (S.cur !== run) return;
    S.cur = null; S.lastEnd = game.time;
    const watched = run.t / run.dur;
    if (watched >= 0.6 || why === 'done') { S.played.add(run.m.id); giveCard(run); }
    for (const a of Object.values(run.echoes)) if (a && a.out < 0) { a.alpha = Math.min(a.alpha, 0.5); echoes.dismiss(a, 'time', why !== 'done'); }
    run.bed?.kill?.();
    S.pastTgt = 0;
    restoreLights();
    ghost.stinger('shimmer', why === 'done' ? 0.25 : 0.15); // 回神
    h.director.hold(3);
    h.emit('memory', { id: run.m.id, phase: 'end', why, watched: +watched.toFixed(2) });
  }

  // ---- 2003 的燈:附近壞掉的燈管暫時是好的;第七暝那一段,二樓北側的燈一排一排熄掉(出口燈留著)----
  function touch(f) { if (!S.lights.has(f)) S.lights.set(f, { state: f.state, ov: f.ov }); }
  function lightsPast(F, r) {
    for (const f of h.events?.fixtures || []) {
      if (f.li !== F.li || f.prop || KEEP.has(f.kind) || Math.hypot(f.x - F.x, f.z - F.z) > r) continue;
      touch(f); if (f.state === 2) f.state = 0; f.ov = Math.max(f.ov, 1);
    }
  }
  function lightsOut(F, r) {
    const list = (h.events?.fixtures || []).filter((f) => f.li === F.li && !f.prop && !KEEP.has(f.kind) && Math.hypot(f.x - F.x, f.z - F.z) < r).sort((a, b) => Math.hypot(b.x - F.x, b.z - F.z) - Math.hypot(a.x - F.x, a.z - F.z));
    const p = P().pos;
    ghost.breaker({ x: p.x, y: p.y + 2.6, z: p.z });
    list.forEach((f, i) => h.after(i * 0.12, () => { if (!S.cur) return; touch(f); f.ov = 0; if (i % 3 === 0) ghost.tubeOff({ x: f.x, y: f.y, z: f.z }); }));
  }
  function restoreLights() { for (const [f, s] of S.lights) { f.state = s.state; f.ov = s.ov ?? 1; } S.lights.clear(); }

  // ---- 每幀:調色、進度、走開就跳過 ----
  function update(dt) {
    echoes.update(dt, game);
    const k = S.pastTgt > S.past ? 1.1 : 1.6; // 進場 ~0.9 秒、回神 ~0.6 秒
    S.past += Math.sign(S.pastTgt - S.past) * Math.min(Math.abs(S.pastTgt - S.past), dt * k);
    const U = game.post?.uniforms?.past;
    if (U) U.value = S.past * S.past * (3 - 2 * S.past);
    const run = S.cur;
    if (!run) return;
    run.t += dt;
    const p = P().pos, D = h.director;
    for (const a of Object.values(run.echoes)) {
      if (!a || a.out >= 0) continue;
      if (a.arrived && a.faceEnd) { a.yaw = faceYaw(run.F, a, a.faceEnd); a.faceEnd = null; } // 走到之後轉向
      const d = Math.hypot(a.x - p.x, a.z - p.z); a.alpha = (a.alpha0 ?? 0.42) * Math.max(0.12, Math.min(1, (d - 0.5) / 1.1)); // 走進人影裡:它變淡,不擋臉
    }
    const far = Math.hypot(p.x - run.F.x, p.z - run.F.z) > (run.m.r || 5.5) + 7 || Math.abs(p.y - run.F.y) > 2.5;
    if (far) return end(run, 'away');
    if (!D.silent || D.chasing) return end(run, 'wave');
    if (run.t >= run.dur + 1.0) end(run, 'done');
  }
  // ---- 4 Hz:走到地點就開始 ----
  function tick() {
    if (!canStart()) return;
    const p = P().pos;
    for (const m of MEMORIES) {
      if (S.played.has(m.id) || !gateOK(m)) continue;
      const z = zoneOf(m.zone); if (!z) continue;
      if (Math.abs(p.y - L().levels[z.levelIndex].y) > 2) continue;
      const pl = m._pl || (m._pl = placeOf(m));
      if (!pl || Math.hypot(p.x - pl.x, p.z - pl.z) > (m.r || 5.5)) continue;
      if (!models.ready('nurse')) { models.want?.('nurse'); return; }
      start(m);
      return;
    }
  }
  function reset() { if (S.cur) end(S.cur, 'reset'); S.played.clear(); S.lastEnd = -1e9; S.pastTgt = 0; S.past = 0; const U = game.post?.uniforms?.past; if (U) U.value = 0; echoes.clear(); restoreLights(); for (const m of MEMORIES) m._pl = null; }
  // 測試/劇情:指定播放(不看地點與閘門;force 也不看靜默期)
  function play(id, o = {}) {
    const m = MEMORIES.find((q) => q.id === id);
    if (!m || (S.cur && !o.force)) return null;
    if (S.cur) end(S.cur, 'replaced');
    if (!o.force && !canStart()) return null;
    return start(m, o) ? m.id : null;
  }
  const where = (id) => { const m = MEMORIES.find((q) => q.id === id); return m ? placeOf(m) : null; };
  return { tick, update, reset, play, where, end: () => S.cur && end(S.cur, 'force'), state: S, echoes, list: MEMORIES, warmList: () => [echoes.slots[0].pale, echoes.slots[0].shade] };
}
