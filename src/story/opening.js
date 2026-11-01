// 開場與休息的節拍(REDESIGN §3):每一個聲音都有來源。
// - 冷開場之後:天花板喇叭的會面廣播 → 輪椅旁的收音機很小聲地叫人(目標:撿起收音機;src/story/radio.js)
//   → 撿起:小美自我介紹(她先不知道你是誰)→ 第 1 波第一隻活屍才出來(最多等 50 秒)
//   → 第一隻靠近:「我聽到我自己的聲音」→ 第一次尖叫:「收音機在叫，就是他們靠近了。」
// - 第一次休息(單人 +15 秒):小美(休息時間、對講機在響)→ 店門口的對講機(金水伯,接了才說;interact/lines.js ph.shop01)
//   → 收音機自己安靜 →〈望春風〉→ 阿嬤「阿孫……你來了。」→ 一顆球(M2)
// - 第二次休息:小美說她「聽到」的(收音機突然沒聲音、她聽不到那個人;開著他們也聽得到)+「關掉再打開」= 收到;對講機第二通(207 的窗)
// - 第三次休息:阿嬤「阿孫，樓梯慢慢走。」(把你當小孩)
// - 金水伯只從店門口的對講機說話:game.story.kimsui(id, parts, cb) 讓對講機響,接了才講;沒接就下一次休息再響
// - 追逐時小美一局最多 3 句(game.story.chaseLine;用完回傳 '',只剩收音機的尖叫)
import { seq } from './voice.js';
import { sfx } from '../audio.js';

const C = { combatOk: true };
const PA = [['pa', '各位家屬請注意：', undefined, { pos: null }], ['pa', '您的家人已經回來了。'], ['pa', '請到一樓大廳會面。', undefined, { gap: 0.8 }]];
const INTRO = [
  ['xl', '……喂？喂喂？這個頻道有人嗎？', 3.0, { ...C, gap: 0.9 }],
  ['xl', '我叫陳美玲，大家都叫我小美。', undefined, C],
  ['xl', 'AM 1207，〈霧港夜話〉。', undefined, C],
  ['xl', '還醒著的人，不要去大廳。', undefined, C],
  ['xl', '醫院的廣播是假的。', undefined, { ...C, gap: 0.8 }],
];
const O1 = { combatOk: true, optional: true }; // 當下的反應:收音機聽不到就算了(不要事後才補)
const FIRST = [['xl', '……等一下。', 1.6, { ...O1, gap: 0.8 }], ['xl', '我聽到我自己的聲音。', undefined, O1], ['xl', '有人拿著收音機，對不對？', undefined, O1]];
const TEACH = [['xl', '收音機在叫，就是他們靠近了。', undefined, O1], ['xl', '打頭！', 1.2, O1]];
const CHASE = ['跑！', '不要回頭，跑。', '綠燈那邊，跑！'];
const KS = '對講機 · 金水伯';

export function installOpening(game, S) {
  const X = game.interact, H = () => game.horror, Rd = () => game.story?.radio;
  const isHost = () => !game.net || !!game.net.isHost;
  const fresh = () => ({ started: false, t0: 0, pa: null, intro: false, introDone: false, first: false, teach: false, quiet: 0, firstBreak: false, ama1: false, ext: false, chase: 0, wasSilent: false, held: false, released: false, ack: 0, acked: false, kT: -99 });
  let run = fresh();
  S.opening = { get run() { return run; } };
  game.story = Object.assign(game.story || {}, {
    chaseLine() { const i = run.chase++; return i < CHASE.length ? CHASE[i] : ''; },
  });

  // ---------- 冷開場之後:廣播 → 收音機 ----------
  function start() {
    if (run.started || game.state !== 'playing' || game.net?.mode?.pvp || game.net?.pvp) return;
    run.started = true; run.t0 = game.time;
    try { H()?.reveal?.('zheng'); } catch { /* 略 */ } // 阿嬤從第一句起字幕就是「阿嬤」
    const Dr = H()?.director;
    if (Dr?.last) Dr.last.chase = Dr.t; // 第一次追逐至少等一分鐘
    run.pa = seq(game, [1.2, () => { try { sfx.pa?.('up'); } catch { /* 略 */ } }, 1.8, ...PA], { alive: () => game.state === 'playing' && game.round <= 1 });
    if (Rd()?.has?.()) intro(); // 多人:一開始就有收音機
  }
  function intro() {
    if (run.intro) return;
    run.intro = true;
    seq(game, [0.6, ...INTRO, () => { run.introDone = true; release(); try { game.ui?.tips?.show?.('radio', 1.5); } catch { /* 略 */ } }], { alive: () => game.state === 'playing' });
  }
  let mBound = null, rBound = null;
  const bind = () => {
    const m = game.motion;
    if (m?.on && m !== mBound) { mBound = m; m.on('coldopen:end', () => { if (!run.started) X.after(0.2, start); }); }
    const r = Rd();
    if (r && r !== rBound) {
      rBound = r;
      r.on('give', (k) => { if (k === 'lobby' && run.started) intro(); });
      r.on('screech', () => { if (game.round <= 2 && !run.teach && run.introDone) { run.teach = true; seq(game, [...(run.first ? [] : (run.first = true, FIRST)), ...TEACH]); } });
      r.on('toggle', (on) => { if (run.ack && !run.acked && game.time - run.ack < 25) { if (!on) run.ackOff = true; else if (run.ackOff) { run.acked = true; seq(game, [0.8, ['xl', '……收到。好。', 1.8]]); } } });
    }
  };

  // ---------- 金水伯:店門口的對講機 ----------
  const kq = [];
  const store = () => (X.phones || []).find((q) => q.e?.id === 'h.ix.phone.store') || null;
  S.kimsui = (id, parts, cb) => {
    if (!store()) { game.deduce?.talk?.(parts.map((t) => [KS, t]), cb); return; }
    if (!kq.some((k) => k.line.id === id)) kq.push({ line: { id, who: KS, voice: 'old', ear: 'right', parts }, cb });
    ringK();
  };
  function ringK() {
    const k = kq[0], P = store();
    if (!k || !P || game.phase === 'fighting' || P.state !== 'idle' || game.time - run.kT < 20) return;
    if (P.startRing(k.line, 24)) run.kT = game.time;
  }
  X.on('call', (P, ln) => { if (ln?.id === 'ph.shop01') { S.flag?.('h.ks.call'); X.after((P.talk?.endAt === Infinity ? 0 : 0) + (P.talk?.dur || 20) + 2.5, () => run.amaAfterCall?.()); } const k = kq[0]; if (k && ln && ln.id === k.line.id) { kq.shift(); X.after((P.talk?.dur || 6) + 0.6, () => { try { k.cb?.(); } catch (e) { console.warn('[story] kimsui', e); } }); } });

  X.on('reset', () => { run.pa?.stop?.(); run = fresh(); kq.length = 0; });
  let acc = 0;
  X.tick((dt) => {
    bind();
    if (game.state !== 'playing') return true;
    acc += dt;
    if (acc < 0.2) return true;
    acc = 0;
    if (!run.started && game.round === 1) {
      if (!run.waitT) run.waitT = game.time;
      if (!game.motion?.on || (!game.motion.busy && game.time - run.waitT > 1.5) || game.time - run.waitT > 6) start();
    }
    // 第 1 波:第一隻等撿起收音機、小美講完(房主/單人;最多 50 秒)
    if (game.round === 1 && game.phase === 'fighting' && !run.held && isHost()) { run.held = true; game.spawnTimer = Math.max(game.spawnTimer || 0, 90); }
    if (run.held && !run.released && (game.round > 1 || game.time - (run.t0 || run.waitT || game.time) > 50)) release();
    // 第一隻活屍靠近:「我聽到我自己的聲音」
    if (!run.first && run.introDone && game.round <= 2 && game.zombies?.some((z) => z.alive && !z.amb?.dormant && (z.dist ?? 99) < 12)) { run.first = true; seq(game, FIRST); }
    // 休息
    const silent = game.phase !== 'fighting';
    if (silent && !run.wasSilent) onSilence();
    run.wasSilent = silent;
    if (run.quiet === 1 && !run.ext && game.phase === 'shop' && !game.net && Number.isFinite(game.restT)) { run.ext = true; game.restT += 15; } // 單人:第一次休息長一點(對講機和阿嬤之間要有空白)
    // 單人第一次休息:對講機還在講、或阿嬤那一句還沒說,休息時間停在 8 秒(最多多 30 秒)
    if (run.quiet === 1 && run.ext && game.phase === 'shop' && !game.net && !run.held1Done && game.restT < 8 && (store()?.state === 'call' || !run.ama1 || (game.story?.voice?.q?.length && !run.amaDone))) {
      run.hold1 = (run.hold1 || 0) + 0.2; game.restT = 8; if (run.hold1 > 30) run.held1Done = true;
    }
    if (silent && kq.length) ringK();
    return true;
  });

  function release() { // 第一波開始出怪
    if (run.released) return;
    run.released = true;
    if (isHost() && game.round === 1 && game.phase === 'fighting') game.spawnTimer = Math.min(game.spawnTimer || 0, 2.2);
  }
  function onSilence() {
    run.quiet++;
    if (run.quiet === 2) { // 第二次休息:規則 4 由小美說出來(她說的是她「聽到」的)+ 收音機開著會被聽到 + 關掉再打開 = 收到
      X.after(3, () => {
        if (game.phase === 'fighting') return;
        seq(game, [
          ['xl', '上次燈熄的時候，', 1.8], ['xl', '收音機突然整個沒聲音。', 2.6], ['xl', '然後有人在叫你，對不對？', 2.6, { gap: 1.2 }],
          ['xl', '我聽不到她。……我只聽得到他們。', 3.4, { gap: 1.4 }],
          ['xl', '我跟你講，收音機開小聲一點。', 3.0], ['xl', '他們也聽得到。', 2.0, { gap: 2.4 }],
          ['xl', '你還在嗎？', 1.6], ['xl', '在的話，把收音機關掉再打開。', 3.0],
          () => { run.ack = game.time; },
        ]);
      });
      X.after(16, () => S.kimsui?.('ph.shop02', ['207 在二樓北邊。', '從後巷看，第七個窗。', '……2003 年，阿伯每天晚上看那扇窗。'], () => S.flag?.('h.ks.207')));
    }
    if (run.quiet === 3) X.after(14, () => { if (game.phase !== 'fighting' && game.state === 'playing') seq(game, [['ama', '阿孫，樓梯慢慢走。', undefined, { ear: 'left' }]]); }); // 把你當小孩(頭七回收)
    if (run.quiet !== 1 || run.firstBreak) return;
    run.firstBreak = true;
    run.pa?.stop?.();
    try { H()?.director?.hold?.(48); } catch { /* 略 */ } // 第一次休息是寫好的:不放隨機的鬼
    S.flag?.('h.ks.first');
    seq(game, [
      2.4,
      ['xl', '招魂燈熄了。現在是休息時間。', 3.0, { gap: 2.2 }],
      ['xl', '店門口的對講機在響。', 2.4, { gap: 0.6 }],
      ['xl', '大新的無線電說，有一台發財車，每晚來送貨。', 4.2],
    ], { alive: () => game.state === 'playing' });
    // 休息後段:收音機自己安靜 →〈望春風〉→ 阿嬤只說一句(訊號由 voice.js 的 seq 放)→ 一顆球
    // 對講機講完 2 秒(沒接的話休息第 30 秒)
    const ama = () => {
      if (game.state !== 'playing' || run.ama1 || game.phase === 'fighting') return;
      run.ama1 = true;
      seq(game, [['ama', '阿孫……你來了。', undefined, { id: 'h.w.come', ear: 'left' }], () => { run.amaDone = true; S.moments?.m2?.(); }], { alive: () => game.phase !== 'fighting' });
      S.flag?.('h.ama.first');
    };
    run.amaAfterCall = ama;
    X.after(30, () => { const P = store(); if (!P || P.state !== 'call') ama(); });
  }
  return run;
}
