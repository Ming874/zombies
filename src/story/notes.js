// 筆記本的〈到目前為止〉(CLARITY_PLAN §7.2):故事往前走,就自動寫進一句「你現在知道的事」。
//   game.story.notes.list() → [{ k, text, t }](新的在前)   .add(k, text)   .next() → { goal, why }(和目標列同一句)
// 每一局重來(和目標列一樣,本機);推理的填空與線索卡照舊跨局保留。新的一條:角落「＋筆記」閃一下。
const NOTES = [
  ['start', (c) => c.started, '阿嬤 2003 年死在 207 號房。今晚，她打電話叫你回來。'],
  ['pa', (c) => c.started, '天花板的喇叭是大新的廣播。不要相信它。'],
  ['radio', (c) => c.has('h.radio'), '收音機裡是小美。她聽得到你身邊的聲音，可是看不到。'],
  ['static', (c) => c.has('h.radio.screech'), '收音機在叫，就是活屍靠近了。開著，他們也聽得到。'],
  ['rest', (c) => c.has('h.ks.first'), '屋頂的招魂燈一亮，活屍就會被叫過來；燈熄了是休息時間。'],
  ['shop', (c) => c.done('h.s.shop'), '金水伯的店在一樓。休息時可以買槍、子彈和醫療包。'],
  ['ks', (c) => c.has('h.ks.call'), '店門口的對講機是金水伯。休息的時候才會響。'],
  ['ama', (c) => c.has('h.ama.first'), '收音機突然安靜，就是阿嬤來了。只有你聽得到她。'],
  ['207', (c) => c.has('h.where207'), '207 在二樓北邊。門裡的燈還亮著，門上了電子鎖。'],
  ['m3', (c) => c.has('h.m3'), '207 裡面傳出小美的聲音：是 1999 年的錄音。'],
  ['how', (c) => c.done('h.s.how207'), '207 的鎖由三樓監控室控制，可是三樓沒有電。'],
  ['fuse', (c) => c.has('h.area.morgue'), '地下室要找 3 支保險絲：洗衣房、鍋爐房、太平間（冰櫃照 3→1→5 拉）。'],
  ['power', (c) => c.has('h.gen.on'), '三樓有電了。監控室要刷門禁卡，還要輸入密碼。'],
  ['code', (c) => c.done('h.s.code') || c.has('know.code0924'), '密碼是 207 的病人住進來那天：1999 年 9 月 24 日。'],
  ['badge', (c) => c.step() === 'h.s.badge', '門禁卡在大新的夜班組長身上，第 5 波他會出現。'],
  ['card', (c) => c.inv('card.security'), '拿到門禁卡了。'],
  ['gift', (c) => c.has('h.radio.ama'), '阿嬤把她在護理站聽的收音機留給你了。'],
  ['quiz', (c) => c.bookOpened, '填空題：封院第 7 晚，207 發生了什麼事？填好了，去阿嬤的照片前擲筊。'],
  ['elock', (c) => c.has('h.207.elock'), '電子鎖開了，可是門是從裡面鎖的。只有阿嬤開得了。'],
  ['touqi', (c) => c.has('h.207.knob'), '頭七：阿嬤回來了，替你把門打開。她說她沒有得 SARS。'],
  ['guard', (c) => c.has('h.boss10'), '看守 207 的保全倒下了。'],
  ['who', (c) => c.card('hc.31'), '207 那個沒有名字的病人，就是小美。'],
  ['page', (c) => c.card('hc.30'), '拿到阿嬤值班日記的最後一頁。'],
  ['ho', (c) => c.has('h.ho.heard'), '王醫師打電話來：那天晚上拿針的人是他。'],
  ['truck', (c) => c.has('h.truck'), '金水伯的車在急診車道等你。'],
];

export function installNotes(game, S) {
  const X = game.interact, O = () => game.objectives, D = () => game.deduce;
  let run = { items: [], seen: new Set(), started: false, bookOpened: false, lastSeen: 0 };
  const c = {
    get started() { return run.started; },
    get bookOpened() { return run.bookOpened; },
    has: (k) => !!O()?.has?.(k) || !!X.flags.has(k),
    done: (id) => !!O()?.done?.(id),
    step: () => O()?.step?.(),
    inv: (id) => !!X.inv?.has?.(id),
    card: (id) => !!run.cardOK?.has(id), // 這一局碰到的(收卡或讀到那份文件)
  };
  function add(k, text) {
    if (run.seen.has(k)) return false;
    run.seen.add(k);
    run.items.unshift({ k, text, t: game.time });
    try { D()?.noteFlash?.(); } catch { /* 略 */ }
    if (D()?.isOpen) D().open?.();
    return true;
  }
  const N = S.notes = {
    list: () => run.items.slice(),
    add,
    next: () => O()?.line?.() || null,
    get fresh() { return run.items.filter((i) => i.t > run.lastSeen).length; },
    seen() { run.lastSeen = game.time; },
    bookOpened() { run.bookOpened = true; },
  };
  // 線索卡跨局保留:這一局「新拿到」的才算(上一局拿過的卡,這一局要再碰到一次才寫進來)
  const NOTE_ID = { H10: 'hc.30', H03: 'hc.31' };
  D()?.on?.('card', (e) => { (run.cardOK ||= new Set()).add(e.id); });
  X.on('note', (n) => { const id = NOTE_ID[n?.id]; if (id) (run.cardOK ||= new Set()).add(id); });
  O()?.on?.('flag', (f) => { if (f.name === 'h.m6' && f.v) (run.cardOK ||= new Set()).add('hc.31'); });
  X.on('reset', () => { run = { items: [], seen: new Set(), started: false, bookOpened: false, lastSeen: 0, cardOK: new Set() }; });
  let acc = 0;
  X.tick((dt) => {
    if (game.state !== 'playing') return true;
    if ((acc += dt) < 0.5) return true;
    acc = 0;
    if (!run.started && game.round >= 1) run.started = true;
    for (const [k, cond, text] of NOTES) { if (!run.seen.has(k)) { let ok = false; try { ok = cond(c); } catch { ok = false; } if (ok) add(k, text); } }
    return true;
  });
  return N;
}
