// 三把火與收驚(正典 STORY_v2 §3.6;game.soul,每位玩家本機,不送網路)。
//   民間說人身上有三把火(頭頂一把、兩肩各一把)。被大場面嚇到(導演 notify 的 big 層級)、犯了鬼月禁忌,各熄一把。
//   三把全熄 = 失魂:聲音像隔一層水(主混音的悶音)、世界褪色加暗角(motion 頻道 'soul')、收音機的字幕殘缺(radio.garble)、
//   收音機的雜訊不可靠;不會死,但很難打。驚嚇強度「關」:不扣火(無障礙承諾)。
//   收驚:招魂燈熄的時候,站在 2F 護理站阿嬤的遺照前不動,等阿嬤數到十 → 三把火全亮、紅衣的身影也走了。每次休息一次。
//   (遺照的位置取互動物件 'h.ix.memorial';這裡只做「靠近 + 靜止」的判定,不在遺照上加互動。)
// API:fires() 0..3 / lose(why) → bool / restore(n = 1, why) / lost() / state() / on(ev, fn)('lose' 'restore' 'lost' 'found' 'ritual')
//      curse(on?) 紅衣的身影跟著你(禁忌:撿了紅包;收驚解除)/ reset()
import { muffle, A as AC } from '../audio/core.js';
import { sfx, ghost } from '../audio.js';
import { captions } from '../ui/captions.js';

const MAX = 3;
const LOST_MUFFLE = 0.5; // 主混音低通約 3.3 kHz(倒地是 0.7)
const LOST_CUT = 20000 * Math.pow(1 - LOST_MUFFLE, 2.6);
const LOOK = { 3: [0, 0, 0], 2: [0.05, 0, 0], 1: [0.13, 0.07, 0.03], 0: [0.5, 0.3, 0.12] }; // fires → [desat, vig, grain]
const COUNT = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const RITUAL = { near: 2.3, still: 0.9, open: 3.3, step: 1.05 }; // 遺照前幾公尺、靜止多久開始、開場那句的長度、每數一個的間隔

export function installSoul(game, H) {
  const ev = new Map();
  const emit = (k, d) => { for (const f of ev.get(k) || []) { try { f(d); } catch (e) { console.warn('[soul]', e); } } };
  const fresh = () => ({ n: MAX, red: false, look: 3, muf: false, mufT: 0, acc: 0, stillT: 0, rite: null, riteRest: -1, failT: 0, lostN: 0, log: [] });
  let run = fresh();
  const now = () => game.time || 0;
  const silent = () => { const ph = game.phase; return ph === 'shop' || ph === 'break' || ph === 'wait'; };
  const off = () => (H?.director?.level ?? 'normal') === 'off';
  const M = () => game.motion;

  // ---------- 畫面與聲音 ----------
  function apply(force = false) {
    const k = run.n;
    if (k === run.look && !force) return;
    run.look = k;
    const [d, v, gr] = LOOK[k] ?? LOOK[0];
    const ms = k === 0 ? 1800 : 900;
    try {
      const m = M();
      if (m) {
        m.to('soul', 'desat', d, ms, 'inOut'); m.to('soul', 'vig', v, ms, 'inOut');
        const pr = m.to('soul', 'grain', gr, ms, 'inOut');
        if (k === MAX) pr.then(() => { if (run.n === MAX) m.clear('soul'); });
      }
    } catch { /* motion 可有可無 */ }
    game.ui?.hud?.setSoul?.(k, run.red);
  }
  // 失魂的悶音:別的悶音(爆炸、倒地)結束後補回來;比較強的悶音進行中不搶
  function keepMuffle() {
    if (!AC.ctx) return;
    const t = AC.ctx.currentTime, mine = Math.abs((AC.muffleCut ?? 20000) - LOST_CUT) < 1 && t < AC.muffleUntil;
    if (run.n === 0) { if (!mine && !(t < AC.muffleUntil && AC.muffleCut < LOST_CUT)) { muffle(LOST_MUFFLE, Infinity); run.muf = true; } }
    else if (run.muf) { run.muf = false; if (mine) muffle(0, 0, 1.4); }
  }

  // ---------- 熄火 / 點火 ----------
  function lose(why = '?', o = {}) {
    if (game.state !== 'playing' || run.n <= 0 || (off() && !o.force)) return false;
    run.n--;
    run.log.push(`${now().toFixed(1)}:-${why}`); if (run.log.length > 20) run.log.shift();
    try { const q = game.player?.pos; if (q) ghost.exhale({ x: q.x, y: q.y + 1.9, z: q.z }, 0.7); } catch { /* 略 */ } // 頭頂一口氣:火被吹熄
    game.ui?.hud?.soulHit?.(run.n);
    apply();
    emit('lose', { why, n: run.n });
    if (run.n === 0) {
      run.lostN++;
      keepMuffle();
      emit('lost', { why });
      game.ui?.feed?.('三把火都熄了。到 2F 護理站阿嬤的遺照前，站著不要動。', { icon: 'warn', color: '#9fb8d8', ms: 7000 });
    } else if (run.n === MAX - 1 && !run.taught) {
      run.taught = true;
      game.ui?.feed?.('身上的一把火熄了。', { icon: 'warn', color: '#9fb8d8', ms: 4200 });
    }
    return true;
  }
  function restore(n = 1, why = '?') {
    if (run.n >= MAX || !(n > 0)) return false;
    const was = run.n;
    run.n = Math.min(MAX, run.n + n);
    run.log.push(`${now().toFixed(1)}:+${why}`); if (run.log.length > 20) run.log.shift();
    apply();
    keepMuffle();
    emit('restore', { why, n: run.n });
    if (was === 0) emit('found', { why });
    return true;
  }
  function curse(on = true) {
    if (run.red === !!on) return run.red;
    run.red = !!on;
    game.ui?.hud?.setSoul?.(run.n, run.red);
    emit(on ? 'curse' : 'uncurse', {});
    return run.red;
  }

  // ---------- 收驚:遺照前站著不動,阿嬤數到十 ----------
  const memorial = () => { const X = game.interact, m = X?.get?.('h.ix.memorial'); return m ? X.where(m) : null; };
  const sayAma = (text, o = {}) => H?.whisper?.({ id: null, text, ghost: 'zheng', ear: o.ear || 'both' }, { priority: 9, force: true, lockOk: true, critical: true });
  function riteBlocked() {
    const X = game.interact;
    return !silent() || captions.combat() || !!X?.modal || !!X?.hold || !!game.deduce?.isOpen || !!game.story?.ending?.active || !!M()?.busy || game.player?.downed;
  }
  function tickRite(step) {
    const p = game.player, R = run.rite, rest = game.round | 0;
    const need = run.n < MAX || run.red;
    const q = memorial();
    let near = false;
    if (q && p) {
      const dx = q.x - p.pos.x, dz = q.z - p.pos.z, d = Math.hypot(dx, dz);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), face = (dx * fx + dz * fz) / (d || 1);
      near = Math.abs(q.y - p.pos.y - 1.2) < 2 && d < RITUAL.near && (face > 0.3 || d < 0.9);
    }
    const still = (p?.speedNorm ?? 1) < 0.05;
    if (R) { // 進行中:動了、有活屍靠近、招魂燈亮了 → 中斷
      if (!near || (p?.speedNorm ?? 1) > 0.12 || riteBlocked()) { run.rite = null; run.failT = now(); emit('ritual', { state: 'broken', at: R.i }); return; }
      R.t += step;
      if (R.i < 0 && R.t >= RITUAL.open) R.i = 0;
      while (R.i >= 0 && R.i < COUNT.length && R.t >= RITUAL.open + R.i * RITUAL.step) { sayAma(COUNT[R.i] + (R.i < COUNT.length - 1 ? '……' : '。')); R.i++; }
      if (R.i >= COUNT.length && R.t >= RITUAL.open + COUNT.length * RITUAL.step + 0.6) {
        run.rite = null; run.riteRest = rest;
        const k = MAX - run.n;
        restore(k, 'shoujing');
        curse(false);
        sayAma('好了，乖。阿嬤在。');
        try { sfx.folk?.('ama', p.pos); } catch { /* 冷卻中 */ }
        try { M()?.beat?.('light'); } catch { /* 略 */ }
        game.flags?.inc?.('h.soul.shoujing');
        emit('ritual', { state: 'done', fires: k });
      }
      return;
    }
    if (!need || run.riteRest === rest || now() - run.failT < 2.5 || !near || !still || riteBlocked()) { run.stillT = 0; return; }
    run.stillT += step;
    if (run.stillT < RITUAL.still) return;
    run.stillT = 0;
    run.rite = { t: 0, i: -1 };
    game.story?.voice?.claim?.(RITUAL.open + COUNT.length * RITUAL.step + 2.5, 9, 'ama', 1); // 其他人等她數完
    sayAma('阿孫，免驚。阿嬤數給你聽。');
    emit('ritual', { state: 'start' });
  }

  // ---------- 每幀(靈異系統的 update 裡呼叫;暫停時不跑) ----------
  function update(dt) {
    if (game.state !== 'playing') return;
    run.acc += dt;
    if (run.acc < 0.25) return;
    const step = run.acc; run.acc = 0;
    if ((run.mufT += step) >= 0.5) { run.mufT = 0; keepMuffle(); }
    tickRite(step);
  }
  function reset() {
    const m = M();
    if (run.muf && AC.ctx && Math.abs((AC.muffleCut ?? 20000) - LOST_CUT) < 1) muffle(0, 0, 0.5);
    run = fresh();
    try { m?.clear?.('soul'); } catch { /* 略 */ }
    game.ui?.hud?.setSoul?.(MAX, false);
  }

  // 大場面(導演的 big 層級)熄一把火
  H?.on?.('scare', (d) => { if (d?.tier === 'big') lose('scare:' + d.kind); });

  const S = {
    fires: () => run.n,
    lost: () => run.n <= 0,
    lose, restore, curse, reset, update,
    get red() { return run.red; },
    get rite() { return run.rite ? { ...run.rite } : null; },
    on(k, f) { if (!ev.has(k)) ev.set(k, new Set()); ev.get(k).add(f); return () => ev.get(k).delete(f); },
    state: () => ({ fires: run.n, lost: run.n <= 0, red: run.red, rite: run.rite ? { ...run.rite } : null, riteRest: run.riteRest, lostN: run.lostN, muffled: run.muf, log: run.log.slice(-8) }),
  };
  game.soul = S;
  game.ui?.hud?.setSoul?.(MAX, false);
  return S;
}
