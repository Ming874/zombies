// 筆記本的〈到目前為止〉(CLARITY_PLAN §7.2):故事往前走,就自動寫進一句「你現在知道的事」。
//   game.story.notes.list() → [{ k, text, t }](新的在前)   .add(k, text)   .next() → { goal, why }(和目標列同一句)
// 每一局重來(和目標列一樣,本機);推理的填空與線索卡照舊跨局保留。新的一條:角落「＋筆記」閃一下。
const NOTES = [
  ['start', (c) => c.started, '阿嬤 2003 年死在 207 號房。今晚，她打電話叫你回來。'],
  ['pa', (c) => c.started, '天花板的喇叭是大新的廣播。不要相信它。'],
  ['radio', (c) => c.has('h.radio'), '收音機裡是小美。她聽得到你身邊的聲音，可是看不到。'],
  ['static', (c) => c.has('h.radio.screech'), '收音機叫起來，就是活屍靠近了。可是收音機的聲音，他們也聽得到。'],
  ['rest', (c) => c.has('h.ks.first'), '屋頂的招魂燈一亮，就會把活屍叫過來。燈熄了，就是休息時間。'],
  ['shop', (c) => c.done('h.s.shop'), '金水伯的店在一樓。休息時可以買槍、子彈和醫療包。'],
  ['ks', (c) => c.has('h.ks.call'), '店門口的對講機，是金水伯打來的。只有休息的時候會響。'],
  ['ama', (c) => c.has('h.ama.first'), '收音機突然安靜，就是阿嬤來了。只有你聽得到她。'],
  ['207', (c) => c.has('h.where207'), '207 在二樓北邊。門裡的燈還亮著，門上了電子鎖。'],
  ['m3', (c) => c.has('h.m3'), '207 裡面傳出小美的聲音：是 1999 年的錄音。'],
  ['how', (c) => c.done('h.s.how207'), '207 的鎖歸三樓監控室管，可是三樓沒有電。'],
  ['fuse', (c) => c.has('h.area.morgue'), '地下室要找三支保險絲：洗衣房、鍋爐房、太平間各一支。太平間的冰櫃，照 3→1→5 的順序拉。'],
  ['power', (c) => c.has('h.gen.on'), '三樓有電了。監控室要刷門禁卡，還要輸入密碼。'],
  ['code', (c) => c.done('h.s.code') || c.has('h.code.known'), '密碼是 207 的病人住進來那天：1999 年 9 月 24 日。'],
  ['badge', (c) => c.step() === 'h.s.badge', '門禁卡在大新的夜班組長身上。第 5 波，他會出現。'],
  ['card', (c) => c.inv('card.security'), '拿到門禁卡了。'],
  ['gift', (c) => c.has('h.radio.ama'), '阿嬤把她在護理站聽的收音機留給你了。'],
  ['quiz', (c) => c.bookOpened, '填空題：封院第 7 晚，207 發生了什麼事？填好一句，就到阿嬤的照片前擲筊問她。一次問一句，招魂燈熄的時候才能問。'],
  ['elock', (c) => c.has('h.207.elock'), '電子鎖開了，可是門是從裡面鎖的。只有阿嬤開得了。'],
  ['touqi', (c) => c.has('h.207.knob'), '頭七那一夜，阿嬤回來了，替你轉開門裡的鎖。她說，她沒有得 SARS。'],
  ['guard', (c) => c.has('h.boss10'), '看守 207 的保全倒下了。'],
  ['who', (c) => c.card('hc.31'), '207 那個沒有名字的病人，就是小美。'],
  ['page', (c) => c.card('hc.30'), '拿到阿嬤值班日記的最後一頁。'],
  ['ho', (c) => c.has('h.ho.heard'), '王醫師打電話來：那天晚上拿針的人是他。'],
  ['family', (c) => c.has('h.ho.heard'), '冰櫃名單上的「207 家屬（已通知）」，是大新的系統寫的。可是打給你的那通電話，是從 207 打出去的。'],
  ['truck', (c) => c.has('h.truck'), '金水伯的車在急診車道等你。'],
];

// 問題帳本(NARRATIVE N15):〈到目前為止〉最上面列出「還不知道的事」;知道了就劃掉,後面寫一句答案。
//   [k, 問題, 什麼時候開始問, 什麼時候知道了, 答案];知道了 = null 的是第一章不回答的(系列問題,一直留著)
const ASK = [
  ['why', '阿嬤為什麼叫你回來？', (c) => c.started, (c) => c.got('hc.30'), '枕頭裡那一頁：阿嬤沒有不要回家。'],
  ['who', '207 裡面那個沒有名字的病人是誰？', (c) => c.has('h.where207'), (c) => c.got('hc.31') || c.has('h.m6'), '是小美。'],
  ['night', '封院第 7 晚，207 發生了什麼事？', (c) => c.bookOpened || c.has('h.m3'), (c) => !!c.solved(), '三句都聖筊了。'],
  ['lamp', '整間醫院都停電了，207 的燈為什麼還亮著？', (c) => c.has('h.where207'), (c) => c.lampKnown(), '後巷有一台 207 專用的發電機。'],
  ['fuel', '是誰一直在付那台發電機的油錢？', (c) => c.lampKnown(), (c) => c.paid() || c.has('h.ho.heard'), '王醫師，二十三年都是他自己付的。'],
  ['call', '打電話叫你來的，到底是誰？', (c) => c.has('h.ho.heard'), null, null],
  ['xiaomei', '小美現在在哪裡？', (c) => c.got('hc.31') || c.has('h.m6'), null, null],
];

export function installNotes(game, S) {
  const X = game.interact, O = () => game.objectives, D = () => game.deduce;
  const fresh = () => ({ items: [], seen: new Set(), started: false, bookOpened: false, lastSeen: 0, cardOK: new Set(), ask: new Map() });
  let run = fresh();
  const c = {
    get started() { return run.started; },
    get bookOpened() { return run.bookOpened; },
    has: (k) => !!O()?.has?.(k) || !!X.flags.has(k),
    done: (id) => !!O()?.done?.(id),
    step: () => O()?.step?.(),
    inv: (id) => !!X.inv?.has?.(id),
    card: (id) => !!run.cardOK?.has(id), // 這一局碰到的(收卡或讀到那份文件)
    got: (id) => !!D()?.got?.(id) || !!run.cardOK?.has(id), // 這一局碰到的(含跨局保留的卡這一局又看到)
    solved: () => !!D()?.solved?.(),
    // 知道 207 的燈是後巷那台發電機在供電(油快沒了、熄了、加過油,或請款單、王醫師的電話)
    lampKnown: () => ['lamp.low', 'lamp.out', 'lamp.fill', 'fuel.paid'].some((k) => run.seen.has(k)) || (game.story?.lamp?.state?.().refuels || 0) > 0 || c.has('h.ho.heard'),
    paid: () => run.seen.has('fuel.paid'), // 打字機打完那張請款單(src/interact/lines.js tw.fuel)
  };
  function add(k, text) {
    if (run.seen.has(k)) return false;
    run.seen.add(k);
    run.items.unshift({ k, text, t: game.time });
    try { D()?.noteFlash?.(); } catch { /* 略 */ }
    try { D()?.redraw?.(); } catch { /* 略 */ }
    return true;
  }
  const N = S.notes = {
    list: () => run.items.slice(),
    add,
    next: () => O()?.line?.() || null,
    get fresh() { return run.items.filter((i) => i.t > run.lastSeen).length; },
    seen() { run.lastSeen = game.time; },
    bookOpened() { run.bookOpened = true; },
    // 問題帳本:開始問了的問題(照 ASK 的順序);done = 知道了(劃掉),ans = 一句答案
    questions: () => ASK.filter(([k]) => run.ask.has(k)).map(([k, text, , , ans]) => { const a = run.ask.get(k); return { k, text, done: !!a.done, ans: a.done ? ans : null, t: a.t }; }),
  };
  // 線索卡跨局保留:這一局「新拿到」的才算(上一局拿過的卡,這一局要再碰到一次才寫進來)
  const NOTE_ID = { H10: 'hc.30', H03: 'hc.31' };
  D()?.on?.('card', (e) => { (run.cardOK ||= new Set()).add(e.id); });
  X.on('note', (n) => { const id = NOTE_ID[n?.id]; if (id) (run.cardOK ||= new Set()).add(id); });
  O()?.on?.('flag', (f) => { if (f.name === 'h.m6' && f.v) (run.cardOK ||= new Set()).add('hc.31'); });
  X.on('reset', () => { run = fresh(); });
  let acc = 0;
  X.tick((dt) => {
    if (game.state !== 'playing') return true;
    if ((acc += dt) < 0.5) return true;
    acc = 0;
    if (!run.started && game.round >= 1) run.started = true;
    for (const [k, cond, text] of NOTES) { if (!run.seen.has(k)) { let ok = false; try { ok = cond(c); } catch { ok = false; } if (ok) add(k, text); } }
    // 問題帳本:新的問題閃一下「＋筆記」;知道了就劃掉(筆記本開著就重畫)
    let ch = false;
    for (const [k, , open, known] of ASK) {
      let a = run.ask.get(k);
      try {
        if (!a && open(c)) { a = { t: game.time, done: false }; run.ask.set(k, a); ch = true; try { D()?.noteFlash?.(); } catch { /* 略 */ } }
        if (a && !a.done && known && known(c)) { a.done = true; a.doneT = game.time; ch = true; }
      } catch { /* 略 */ }
    }
    if (ch) { try { D()?.redraw?.(); } catch { /* 略 */ } }
    return true;
  });
  return N;
}
