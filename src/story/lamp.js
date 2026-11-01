// 守燈(NARRATIVE_THEORY N1):207 的檯燈吃北側後勤巷那台專用發電機的柴油,玩家整晚要照顧它。
//   game.story.lamp = { level() 0..1, lit() bool, drain(amount, why), refuel(amount), state() }
//
// 規則(普通難度、一次都不加油):每一波用掉 PER_WAVE(在那一波的前 SPREAD 秒慢慢用掉;波提早打完,剩下的一次扣掉)。
//   第 6 波後段油量掉到 FLICK 以下 → 燈開始閃(越少閃得越兇);第 9 波初熄燈。加一桶 = REFUEL,大約撐兩波。
// 怎麼加油:B1 鍋爐房的柴油桶(packs/hospital.js 的 h.ix.oil;找不到就在鍋爐房自己登記一個)→ 扛著走到後巷的 207 發電機
//   → 按住 E 3 秒。扛著油桶的時候雙手沒空:槍放下、不能開槍(和打針治療一樣);按左鍵就放下油桶(鍋爐房還有)。
// 燈只改強度:207 檯燈這個燈具的 dim(燈具既有的強度乘數;gate 留給結局的 blink,ov 留給配電盤與驚嚇),
//   窗的光(lights.js 的 link)跟著燈具的 cur 一起暗;發電機旁的工作燈一起閃。不加燈、不加材質、不加網格。
// 台詞:油快沒了 → 金水伯(對講機,休息時);熄了 → 小美冷、金水伯提醒還點得回來;加了油 → 小美說暖起來了。沒有 HUD 數字。
// 多人:油量由房主決定。房主把粗略的油量(0..10,無條件進位;0 = 熄)寫成劇情旗標 h.lamp.<序號>.<油量>(只留最新一個),
//   隊友照抄最新序號的那一個;隊友加油/扣油送 h.lamp.req.<f|d>.<百分比>.<亂數> 給房主(objectives 的 objf),房主處理完就清掉。
//   閃爍是本機的視覺(各自亂數);扛油桶、發電機互動都是本機的。
import { seq } from './voice.js';
import { sfx } from '../audio.js';

const PER_WAVE = 0.12; // 一波的油
const SPREAD = 50; // 一波的油在前幾秒用掉(秒)
const FLICK = 0.3; // 這以下開始閃
const REFUEL = 0.25; // 一桶(約兩波)
const FULL = 0.95; // 這以上不用加
const HOLD = 3; // 按住 E 幾秒
const GEN_LOOP = 'gen'; // 後巷發電機的循環音(map/props/outdoor/industrial.js startLoop('gen', …))

export function installLamp(game) {
  const X = game.interact;
  if (!X) return null;
  const S = (game.story ||= {});
  const O = () => game.objectives;
  const isHost = () => !game.net || !!game.net.isHost;
  const W = () => game.hospital || null;
  const fresh = () => ({
    level: 1, budget: 0, lastRound: -1, wasFight: false, waves: 0, refuels: 0,
    seq: 0, sentN: -1, flagName: null, // 房主:目前的旗標
    hostK: -1, hostN: 10, optimT: 0, // 隊友:房主最新的值
    cur: 1, dip: 0, dipV: 1, dipN: 0, nextDip: 2, state: 'ok', stT: 0, // 視覺
    lowSaid: 0, lowN: 0, lowPend: false, outSaid: false, outPend: false, fillT: -99, fillN: 0,
    carry: false, fireWas: false, done: new Set(),
  });
  let run = fresh();

  // ---------- 燈具 ----------
  let fx = null, work = [], base = null, gen = null, genOff = false;
  const findLamp = () => {
    if (fx) return fx;
    const H = W();
    const f = H?.anchors?.w207?.lamp?.fixture || H?.lights?.story?.lamp || (H?.lights?.fixtures || []).find((q) => q.w207 === 'lamp') || null;
    if (!f) return null;
    fx = f;
    base = { lamp: Number.isFinite(f.dim) ? f.dim : 1, work: [] };
    const g = genPos();
    if (g) { // 發電機旁的工作燈(同一台機器的電)
      work = (H.lights?.fixtures || []).filter((q) => q !== f && q.prop && Math.abs(q.y - g.y - 2) < 1.4 && Math.hypot(q.x - g.x, q.z - g.z) < 4.5);
      base.work = work.map((q) => (Number.isFinite(q.dim) ? q.dim : 1));
    }
    return fx;
  };
  function genPos() {
    if (gen) return gen;
    const H = W();
    const ev = (H?.propEvents || []).find((e) => e.kind === 'generator' && (e.zone === 'f1_alley' || !e.zone)) || (H?.propEvents || []).find((e) => e.kind === 'generator');
    gen = ev ? { x: ev.x, y: ev.y || 0, z: ev.z } : { x: 82, y: 0, z: 5 }; // levels.js OBSTACLES:generator rect [40,2,41,2]
    return gen;
  }

  // ---------- 油量 ----------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const coarse = (v) => (v <= 0 ? 0 : Math.min(10, Math.ceil(v * 10 - 1e-6))); // 0 = 熄;其他無條件進位
  const level = () => run.level;
  const powered = () => X.flags.get('h.pwr.207') !== false; // 配電盤上的 207 迴路(玩家可以自己關)
  const lit = () => run.level > 0 && powered();

  function setLevel(v, why) {
    const was = run.level;
    run.level = clamp01(v);
    if (was > 0 && run.level <= 0) onOut(why);
    else if (was <= 0 && run.level > 0) onRelight();
    if (was > FLICK && run.level <= FLICK && run.level > 0) onLow();
    if (isHost()) sync();
  }
  // 房主:粗略的油量寫成旗標(只留最新一個;隊友照抄序號最大的)
  function sync(force) {
    const n = coarse(run.level);
    if (!force && n === run.sentN) return;
    run.sentN = n;
    const o = O();
    if (!o?.flag || !game.net) { run.flagName = null; return; } // 單人不必寫旗標
    const name = `h.lamp.${++run.seq}.${n}`;
    try {
      if (run.flagName) o.flag(run.flagName, false);
      run.flagName = name;
      o.flag(name, true);
    } catch (e) { console.warn('[lamp] sync', e); }
  }
  // 隊友 → 房主的要求
  function request(op, amount) {
    const o = O();
    if (!o?.flag) return false;
    const pct = Math.max(1, Math.min(100, Math.round(amount * 100)));
    try { o.flag(`h.lamp.req.${op}.${pct}.${(Math.random() * 1e6) | 0}`, true); return true; } catch (e) { console.warn('[lamp] request', e); return false; }
  }
  function onFlag(f) {
    if (!f || typeof f.name !== 'string' || !f.name.startsWith('h.lamp.') || !f.v) return;
    const nm = f.name;
    const rq = /^h\.lamp\.req\.([fd])\.(\d+)\.\d+$/.exec(nm);
    if (rq) {
      if (!isHost() || run.done.has(nm)) return;
      run.done.add(nm);
      const amt = (+rq[2] || 0) / 100;
      if (rq[1] === 'f') refuel(amt, true); else drain(amt, 'peer');
      X.after(0.5, () => { try { O()?.flag?.(nm, false); } catch { /* 略 */ } }); // 用掉就清(不要讓狀態越積越多)
      return;
    }
    const m = /^h\.lamp\.(\d+)\.(\d+)$/.exec(nm);
    if (!m || isHost()) return;
    const k = +m[1], n = +m[2];
    if (k <= run.hostK) return;
    run.hostK = k; run.hostN = n;
  }
  // 隊友:跟著房主的粗略值走(加油後先樂觀地亮回來,等房主的新值)
  function follow(dt) {
    if (run.hostK < 0) return; // 還沒收到房主的值:先照本機的
    if (run.optimT > 0) { run.optimT -= dt; return; }
    const n = run.hostN, want = n <= 0 ? 0 : n / 10 - 0.05;
    const v = Math.abs(want - run.level) < 0.002 ? want : run.level + (want - run.level) * Math.min(1, dt * 1.5);
    setLevel(n <= 0 ? 0 : Math.max(0.001, v), 'host');
  }

  // ---------- 對外的介面 ----------
  function drain(amount, why) {
    const a = +amount || 0;
    if (a <= 0) return run.level;
    if (!isHost()) { request('d', a); kick(0.5); return run.level; }
    if (run.level > 0) kick(Math.min(1, 0.3 + a * 4)); // 晃一下(禁忌、驚嚇:看得到的後果)
    setLevel(run.level - a, why || 'drain');
    return run.level;
  }
  function refuel(amount = REFUEL, fromPeer) {
    const a = +amount || 0;
    if (a <= 0) return run.level;
    if (!isHost() && !fromPeer) { request('f', a); run.optimT = 4; setLevel(Math.min(1, Math.max(run.level, 0.001) + a), 'fill'); }
    else setLevel(Math.min(1, Math.max(run.level, 0) + a), 'fill');
    run.refuels++;
    onFill();
    return run.level;
  }
  const L = {
    level, lit, drain, refuel,
    state: () => ({ level: +run.level.toFixed(3), lit: lit(), powered: powered(), coarse: coarse(run.level), waves: run.waves, refuels: run.refuels, carry: run.carry, look: run.state, k: +run.cur.toFixed(3), host: isHost(), hostN: run.hostN, work: work.length }),
    get run() { return run; },
    PER_WAVE, FLICK, REFUEL,
  };
  S.lamp = L;
  game.story = Object.assign(game.story || {}, { lamp: L });

  // ---------- 台詞(一次一個人說話:都走 voice.js 的 seq) ----------
  const say = (lines, o) => { try { return seq(game, lines, o); } catch (e) { console.warn('[lamp] say', e); return null; } };
  const note = (k, text) => { try { game.story?.notes?.add?.(k, text); } catch { /* 略 */ } }; // 筆記本〈到目前為止〉(沒聽到台詞也查得到)
  const atRest = (fn, maxWait = 240) => { // 金水伯的對講機只在休息時響;等太久(或這一局結束)就放棄:fn(false)
    const t0 = game.time;
    X.tick(() => {
      if (game.state !== 'playing' || game.time - t0 > maxWait) { fn(false); return false; }
      if (game.phase === 'fighting' || game.story?.ending?.active) return true;
      X.after(5, () => fn(true));
      return false;
    });
  };
  function onLow() {
    note('lamp.low', '207 的燈在閃，後巷那台發電機快沒油了。去 B1 鍋爐房扛一桶柴油過去加。');
    if (game.time - run.lowSaid < 120 || run.lowPend) return;
    run.lowPend = true;
    atRest((ok) => {
      run.lowPend = false;
      if (!ok || run.level <= 0 || run.level > FLICK + 0.05) return;
      run.lowSaid = game.time;
      say([['ks', run.fillN || run.lowN ? '207 的燈又在閃了。' : '少年仔，207 的燈在閃。\n鍋爐房有柴油，扛去後巷加。']]);
      run.lowN = (run.lowN || 0) + 1;
    });
  }
  function onOut() {
    run.state = 'dying'; run.stT = 0;
    genOff = true;
    note('lamp.out', '207 的燈熄了。替發電機加了油，燈還點得回來。');
    try { sfx.loopStop?.(GEN_LOOP); } catch { /* 略 */ }
    if (!run.outSaid) {
      run.outSaid = true;
      X.after(2.4, () => { if (run.level <= 0) say([['xl', '……二樓那盞燈熄了。\n我突然好冷。', undefined, { optional: true }]]); });
    }
    if (!run.outPend) {
      run.outPend = true;
      atRest((ok) => { run.outPend = false; if (ok && run.level <= 0) say([['ks', '207 的燈熄了？\n去後巷加油，還點得回來。']]); });
    }
  }
  function onRelight() {
    run.state = 'start'; run.stT = 0;
    const g = genPos();
    try { sfx.scare?.('generator', { x: g.x, y: g.y + 1, z: g.z }); } catch { /* 略 */ }
    X.after(2.6, () => { if (run.level > 0) genOn(); });
  }
  function genOn() {
    if (!genOff) return;
    genOff = false;
    const g = genPos();
    try { sfx.loopStart?.(GEN_LOOP, 'generator', { x: g.x, y: g.y + 1, z: g.z }); } catch { /* 略 */ }
  }
  function onFill() {
    const first = !run.fillN;
    run.fillN++;
    note('lamp.fill', '你替 207 的燈加了油。一桶大約撐兩波。');
    if (!first && game.time - run.fillT < 90) return;
    const wasOut = run.state === 'start';
    run.fillT = game.time;
    X.after(2.6, () => say([['xl', first ? '……突然暖起來了。\n你剛剛做了什麼？' : wasOut ? '……我不冷了。' : '……又暖起來了。', undefined, { optional: !first }]]));
  }

  // ---------- 看得到的燈:閃、熄、重新發動(本機) ----------
  function kick(depth) { run.dip = 0.18 + Math.random() * 0.25; run.dipV = 1 - depth; run.dipN = 1 + ((Math.random() * 2) | 0); }
  function look(dt) {
    let k;
    run.stT += dt;
    if (run.state === 'dying') { // 最後喘幾下才熄
      const t = run.stT;
      k = t > 1.9 ? 0 : (Math.sin(t * 23) > 0.3 ? 0.55 - t * 0.25 : 0.05);
      if (t > 1.9) run.state = 'out';
    } else if (run.level <= 0) { k = 0; run.state = 'out'; }
    else if (run.state === 'start') { // 發電機重新發動:先喀喀閃,再穩下來
      const t = run.stT;
      k = t < 0.5 ? 0 : t < 1.7 ? (Math.sin(t * 19) > 0 ? 0.35 + 0.4 * (t - 0.5) : 0.08) : Math.min(1, 0.85 + (t - 1.7) * 0.3);
      if (t > 2.2) run.state = 'ok';
    } else {
      const s = run.level <= FLICK ? 1 - run.level / FLICK : 0; // 0..1:越少越兇
      if (s > 0 && run.dip <= 0 && (run.nextDip -= dt) <= 0) {
        kick(0.5 + 0.45 * s * Math.random() + 0.05);
        run.nextDip = (7 - 5.2 * s) * (0.6 + Math.random() * 0.8);
      }
      k = 1 - 0.28 * s;
      if (run.dip > 0) { // 一次「喘」:兩三下
        run.dip -= dt;
        const on = Math.sin(run.dip * (14 + 6 * run.dipN)) > -0.2;
        k *= on ? run.dipV : Math.min(1, run.dipV + 0.35);
      }
      run.state = s > 0 ? 'flicker' : 'ok';
    }
    run.cur += (k - run.cur) * Math.min(1, dt * 28);
    const f = findLamp();
    if (!f) return;
    const v = base.lamp * run.cur;
    if (f.dim !== v) f.dim = v;
    for (let i = 0; i < work.length; i++) { const w = base.work[i] * run.cur; if (work[i].dim !== w) work[i].dim = w; }
  }

  // ---------- 扛油桶 ----------
  const CARRY_SUB = '雙手沒空，不能開槍 · 按左鍵放下';
  let drum = null, drumTries = 0;
  function hookDrum() {
    if (drum || drumTries > 3) return drum;
    drumTries++;
    let e = X.get('h.ix.oil') || X.find((q) => q.kind === 'pickup' && /油桶/.test(q.name || ''))[0] || null;
    if (!e) e = fallbackDrum();
    if (!e) return null;
    drum = e;
    const prompt0 = e.prompt;
    e.name = '柴油桶';
    e.prompt = (ctx) => { const t = typeof prompt0 === 'function' ? prompt0(ctx) : prompt0; return t ? '扛起柴油桶' : null; };
    e.when = () => (X.inv.has('oil') ? '你已經扛著一桶了' : true);
    const use0 = e.onUse;
    e.onUse = (ctx) => { // 原本的撿起(藏起模型、放進道具欄),只是不要「收進口袋」那一句
      const ui = game.ui, own = Object.prototype.hasOwnProperty.call(ui, 'pickup'), up = ui.pickup;
      ui.pickup = () => {};
      let r;
      try { r = use0?.(ctx); } finally { if (own) ui.pickup = up; else delete ui.pickup; }
      if (!X.inv.has('oil')) X.inv.add('oil', 1);
      game.ui?.pickup?.('扛起柴油桶', '#e8d9a8', { sub: CARRY_SUB });
      return r;
    };
    return e;
  }
  function fallbackDrum() { // 包裡的油桶沒擺上去:在鍋爐房中間登記一個(沒有模型)
    const Lay = W()?.layout, z = Lay?.zones?.find((q) => q.id === 'b1_boiler');
    if (!z) return null;
    const [c0, r0, c1, r1] = z.rects[0], y = Lay.levels?.[z.levelIndex]?.y ?? -4.2;
    return X.register({ x: (c0 + c1 + 1), y: y + 0.4, z: (r0 + r1 + 1) }, {
      id: 'h.ix.oil.lamp', kind: 'pickup', name: '柴油桶', reach: 2.2, radius: 0.3, look: false, scope: 'map', once: 'run', priority: 3, usedText: '',
      prompt: () => '扛起柴油桶', onUse: () => { X.inv.add('oil', 1); }, reset: () => {},
    });
  }
  function restock() { // 鍋爐房又有一桶(放下或倒完之後)
    const e = drum;
    if (!e) return;
    e.used = false; e.n = 0;
    try { e.reset?.(X.ctx(e)); } catch { /* 略 */ }
    e.setEnabled?.(true);
  }
  function carryStart() {
    if (run.carry) return;
    run.carry = true; run.fireWas = !!game.input?.fireHeld;
    drum?.setEnabled?.(false);
  }
  function carryEnd(why) {
    if (!run.carry) return;
    run.carry = false;
    if (X.inv.has('oil')) X.inv.take('oil', X.inv.count('oil'));
    const w = game.weapons;
    if (w) w.fireQueue = 0; // 半自動槍:放下時那一下不要自己打出去
    if (game.input) game.input.fireHeld = false;
    if (why === 'drop') game.ui?.pickup?.('放下油桶', '#a3a39a', { sub: '鍋爐房還有' });
    restock();
  }
  function carryTick() {
    const p = game.player, inp = game.input;
    if (!p || p.alive === false || p.downed || p.hp <= 0) { carryEnd('down'); return; }
    const fire = !!inp?.fireHeld;
    if (fire && !run.fireWas) { run.fireWas = true; carryEnd('drop'); return; }
    run.fireWas = fire;
    const w = game.weapons; // 和打針治療一樣:槍放下、不能開槍(flow.js _updateHeal)
    if (w && typeof w.raise === 'number') w.raise = Math.max(w.raise, 0.9);
    if (inp) inp.firePressed = false;
  }
  X.on('item', (id, n) => {
    if (id === 'oil') { if (n > 0) carryStart(); else if (run.carry) carryEnd('used'); }
    else if (id === null && run.carry) { run.carry = false; restock(); }
  });

  // ---------- 207 的發電機(後巷) ----------
  let genE = null;
  function hookGen() {
    if (genE) return genE;
    const g = genPos();
    genE = X.register({ x: g.x, y: g.y + 1.0, z: g.z + 0.55 }, {
      id: 'h.ix.gen207', kind: 'gen207', name: '207 的發電機', reach: 2.6, radius: 0.6, losPad: 0.45, priority: 6, scope: 'map',
      hold: HOLD, holdText: '把柴油倒進去', prompt: '加柴油',
      when: () => {
        if (!run.carry) return run.level <= 0 ? '207 的發電機 · 沒油了（鍋爐房有柴油）' : run.level <= FLICK ? '207 的發電機 · 快沒油了（鍋爐房有柴油）' : '207 的發電機 · 還在轉';
        if (run.level >= FULL) return '207 的發電機 · 油還是滿的';
        return true;
      },
      onUse: () => {
        if (!run.carry) return false;
        run.carry = false;
        X.inv.take('oil', X.inv.count('oil'));
        restock();
        refuel(REFUEL);
        try { sfx.pickupItem?.(); } catch { /* 略 */ }
        game.ui?.pickup?.('柴油倒進去了', '#e8d9a8', { sub: '207 的燈可以再撐一陣子' });
        return true;
      },
    });
    return genE;
  }

  // ---------- 每幀 ----------
  O()?.on?.('flag', onFlag);
  X.on('reset', () => {
    const f = findLamp();
    run = fresh();
    if (f) { f.dim = base.lamp; work.forEach((q, i) => { q.dim = base.work[i]; }); }
    restock();
    genOn();
    if (isHost()) X.after(0.2, () => sync(true));
  });
  X.tick((dt) => {
    if (!drum) hookDrum();
    if (!genE) hookGen();
    if (game.state !== 'playing') return true;
    if (run.carry) carryTick();
    const fight = game.phase === 'fighting';
    if (isHost()) {
      if (fight && game.round !== run.lastRound) { run.lastRound = game.round; run.budget += PER_WAVE; run.waves++; }
      if (fight && !game.spawnHeld && run.budget > 0) { const d = Math.min(run.budget, (PER_WAVE * dt) / SPREAD); run.budget -= d; setLevel(run.level - d, 'wave'); }
      if (run.wasFight && !fight && run.budget > 0) { const d = run.budget; run.budget = 0; setLevel(run.level - d, 'wave'); } // 這一波提早打完:剩下的一次扣
    } else follow(dt);
    run.wasFight = fight;
    look(dt);
    return true;
  });
  return L;
}
