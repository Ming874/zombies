// 第四幕的高潮(STORY_v2 §4.6 頭七、§4.7 第 10 波破門、§2.5 王醫師;EXPERIENCE_PLAN §3.2–3.3):
//
//   207 有兩道鎖:
//     電子鎖(大新 2024 年裝的):監控室鍵盤 0924 或在遺照前擲出聖筊 → 旗標 h.207.elock
//     門內的舊旋鈕(阿嬤 2003/5/5 23:55 自己反鎖的):頭七那一夜她回來,替你轉開 → 旗標 h.207.knob
//   兩道都開了 → h.207.unlock(門的鎖照這個旗標打開)→ 門自己推開一條縫。
//   門一開 → 院內警報「207 門禁警戒」→ 第 10 次招魂燈「207 看守 207 的保全」(還沒到第 10 次就直接跳過去;單人時人數照下一波,不會一下子暴增)。
//   看守 207 的保全倒下 → 〈守燈日誌〉(hc.29)→ 下一次招魂燈熄,離你最近的電話響:王醫師(hc.20)。
//     選擇:不接 / 聽完(他的條件:「那一頁,留在 207。」)/ 中途掛斷(小美在你左耳:「掛掉。拜託,掛掉。」)。結局會記得。
//   頭七保證:第 7 次靜默,幻影出不來(玩家不在室內、找不到位置)也照樣發生(哼聲 + 兩句 + 遺照前補播)。
// 多人:旗標都走 game.objectives.flag(房主說了算、同步給全隊);看守 207 的保全那一波只有房主開;頭七與電話是本機的。
import { seq, line, wait } from './voice.js';
import { waveRoster } from '../game/waves.js';
import { sfx, ix as ixs, ghost } from '../audio.js';

const HO = {
  id: 'ph.ho.final', who: '電話 · 王醫師', voice: 'man', ear: 'right',
  parts: [
    '你好。我是王志明。\n以前在這間醫院，大家叫我王醫師。',
    '林護理長是你阿嬤吧。\n你們長得很像。',
    '你剛剛打開的那扇門，\n我二十三年沒有打開過。',
    '那天晚上，我關掉二樓的燈。\n她打開檯燈，擋在床前。\n她說：『這間是我的病人。』',
    '針是我拿的。我拉她，針就……',
    '這二十三年，207 的電費，\n都是我付的。',
    '枕頭裡那一頁，請留在 207。\n燈會一直亮著。對大家都好。',
    '鬼門一關，這一切就結束了。\n你可以回家了。',
  ],
};

export function installClimax(game, S) {
  const X = game.interact, H = () => game.horror, D = () => game.deduce, O = () => game.objectives;
  const isHost = () => !game.net || !!game.net.isHost;
  const has = (k) => !!X.flags.has(k) || !!O()?.has?.(k);
  const flag = (k) => { const R = O()?.run; if (R) { if (!R.flags.has(k)) O().flag(k); } else if (!X.flags.has(k)) X.flags.set(k, true); }; // 走 objectives(房主同步給全隊)
  const fresh = () => ({ touqi: false, touqiT: 0, knobT: 0, opened: false, alarm: false, alarmPend: false, wave: 0, guard: null, guardDead: false, hoRang: false, hoState: null, hoP: null, hoT: 0, xlCut: false, elockSaid: false, logT: 0, restT0: 0 });
  let run = fresh();
  S.climax = { get run() { return run; }, startGuardWave: () => startGuardWave(true), ringHo: () => ringHo(true) };
  S.busy = () => !!S.ending?.active || run.hoState === 'ringing' || run.hoState === 'talk'; // 重要的戲正在演:別的對講機/提示先等
  const door207 = () => X.doors?.list?.find((w) => w.lock?.door === 'f2_ward_207') || null;
  const p = () => game.player.pos;

  // ---------- 頭七 ----------
  H()?.on?.('story', (e) => { if (e?.id === 's3.touqi' && !run.touqi) { run.touqi = true; run.knobT = game.time + 26; } }); // 她說完(你哪會…、沒有得 SARS…)才轉開旋鈕
  function touqiFallback() { // 幻影出不來:照樣發生(她不一定要被看見)
    run.touqi = true; run.knobT = game.time + 16;
    try { sfx.folk('lament', p()); } catch { /* 略 */ }
    X.flags.set('h.touqi', true);
    X.after(3.5, () => { try { H()?.remember?.('s3.touqi', { event: 'touqi', tag: 'zheng', ghost: 'zheng' }); } catch { /* 略 */ } seq(game, [['ama', '今天是頭七……阿嬤回來看你。', undefined, { id: 's3.touqi', many: true }]]); });
  }
  function knob() { // 阿嬤把門內的旋鈕轉開
    if (has('h.207.knob')) return;
    flag('h.207.knob');
    const w = door207();
    const q = w ? { x: w.cx, y: w.y + 1.1, z: w.cz } : p();
    try { ixs.lockerOpen?.(q); } catch { /* 略 */ }
    const far = !w || Math.abs(p().y - w.y) > 2 || Math.hypot(p().x - w.cx, p().z - w.cz) > 10;
    game.ui?.feed?.(far ? '二樓傳來很輕的一聲「喀」，像是有人從裡面轉開了門把。' : '207 的門內「喀」一聲：旋鈕自己轉開了。', { color: '#e3c98a', ms: 7000 });
    if (!has('h.207.elock')) X.after(3, () => seq(game, [['xl', '……那一聲，是 207？\n鎖是從裡面開的。\n外面的電子鎖還鎖著。', undefined, {}]]));
  }

  // ---------- 207 打開 → 警報 → 看守 207 的保全 ----------
  function tryUnlock() {
    if (has('h.207.unlock') || !has('h.207.elock') || !has('h.207.knob')) return;
    if (!isHost()) return; // 房主開(旗標會同步)
    flag('h.207.unlock');
    const w = door207();
    if (w) X.after(0.6, () => { try { X.doors.setState(w, 'open', { by: Math.abs(p().y - w.y) < 2 ? { x: p().x, z: p().z } : null }); ghost.creakLong?.({ x: w.cx, y: w.y + 1.2, z: w.cz }, 3.2); } catch { /* 略 */ } });
  }
  function onElock() {
    if (run.elockSaid) return;
    run.elockSaid = true;
    if (!has('h.207.knob')) {
      try { X.doors.lock('f2_ward_207', { text: '207 · 電子鎖開了，可是門從裡面鎖住了' }); } catch { /* 略 */ }
      X.after(2.5, () => seq(game, [['xl', '電子鎖的紅燈熄了。……可是門把轉不動。', 3.4], ['xl', '旋鈕在裡面。有人從裡面鎖著。', 3.2]]));
      X.after(12, () => seq(game, [['ama', '等阿嬤回來。', undefined, { ear: 'left' }]]));
    }
  }
  function alarm() {
    run.alarm = true;
    flag('h.207.open');
    const w = door207(), q = w ? { x: w.cx, y: w.y + 2.6, z: w.cz } : null;
    try { ixs.alarmStart?.('h207', q || p()); X.after(9, () => ixs.alarmStop?.('h207')); } catch { /* 略 */ }
    seq(game, [0.8, ['pa', '207 警報。207 警報。', 5], ['pa', '保全人員，請到二樓。', 3], ['xl', '……你開了那扇門。整棟樓都在響。', 3.2, { combatOk: true }], ['xl', '大新的無線電在叫一個名字。', 3, { combatOk: true }], ['xl', '劉家豪。他在那扇門口，坐了三年。', 3.4, { combatOk: true }]]); // 廣播說廣播的,小美說她從無線電聽到的(REDESIGN §7)
    if (!isHost()) return;
    if (game.phase === 'fighting') run.alarmPend = true; // 這一波打完再來
    else X.after(9, () => startGuardWave());
  }
  function startGuardWave(force) {
    if (run.wave && !force) return;
    if (!isHost() || game.state !== 'playing') return;
    const r0 = game.round || 1, N = Math.max(10, r0 + 1);
    run.wave = N; run.alarmPend = false;
    try { if (game.shopUIOpen) game.closeShop?.(); } catch { /* 略 */ }
    game.startRound(N);
    if (!game.net && N > r0 + 2) { // 單人:直接跳到第 10 次,但人數照「下兩波」(不會一下子暴增);看守 207 的保全一定在
      const q = waveRoster(Math.min(N, r0 + 2)).filter((t) => t !== 'brute');
      q.splice(Math.floor(q.length * 0.4), 0, 'brute');
      game.queue = q; game.toSpawn = q.length;
    } else if (!game.queue.includes('brute')) { game.queue.splice(Math.floor(game.queue.length * 0.4), 0, 'brute'); game.toSpawn = game.queue.length; }
    X.after(3.8, () => game.ui?.banner?.('看守 207 的保全　劉家豪', '大新的保全 · 在 207 門口坐了三年 · 燈熄了就要通知董事長', 4200, 'red'));
  }
  function guardDown() {
    run.guardDead = true;
    flag('h.boss10');
  }
  function onBoss10() {
    if (run.logT) return;
    run.logT = game.time;
    X.after(1.2, () => { D()?.addCard?.('hc.29', { by: 'boss' }); game.ui?.pickup?.('保全的值班紀錄', '#e8d9a8', { sub: '保全倒下的地方，掉著一本紀錄' }); });
  }

  // ---------- 王醫師的電話 ----------
  function ringHo(force) {
    if (run.hoRang && !force) return false;
    const list = (X.phones || []).filter((P) => P.state === 'idle');
    if (!list.length) { if (!force) { run.hoRang = true; run.hoState = 'none'; } return false; } // 沒有電話可以響:不讓金水伯一直等
    const q = p();
    let best = null, bd = Infinity;
    for (const P of list) { let d = Math.hypot(P.pos.x - q.x, P.pos.z - q.z) + Math.abs(P.pos.y - q.y) * 6; try { const f = game.world.flowDistance(P.pos.x, P.pos.y, P.pos.z); if (Number.isFinite(f)) d = Math.min(d, f + Math.abs(P.pos.y - q.y) * 2); } catch { /* 略 */ } if (d < bd) { bd = d; best = P; } }
    const parts = HO.parts.map((t) => (/^枕頭裡那一頁/.test(t) && D()?.has?.('hc.30') ? '你拿了那一頁。……她的字，一直都很工整。' : t)); // 已經拿了:他知道(監視器)
    if (!best || !best.startRing({ ...HO, parts }, 45)) return false;
    run.hoRang = true; run.hoP = best; run.hoState = 'ringing'; run.hoT = game.time;
    if (!game.net && game.phase === 'shop') game.restT = Math.max(game.restT, 48); // 單人:這通電話不要被下一波打斷
    X.after(3, () => seq(game, [['xl', bd > 18 ? '……電話在響。很近。你要接嗎？' : '……旁邊那支電話。你要接嗎？', undefined, {}]]));
    return true;
  }
  X.on('call', (P, ln) => {
    if (ln?.id !== HO.id) return;
    run.hoState = 'talk'; run.hoT = game.time; run.hoP = P;
    flag('h.ho.answer');
    const T = (ln.parts || HO.parts).reduce((a, t) => a + 0.9 + [...t].length * 0.26 + 0.35, 0);
    run.hoEnd = game.time + T * 0.92;
    if (!game.net && game.phase === 'shop') game.restT = Math.max(game.restT, T + 10);
    X.after(T * 0.48, () => { if (P.state === 'call' && run.hoState === 'talk') { run.xlCut = true; seq(game, [['xl', '……他在跟你講話對不對？掛掉。拜託，掛掉。', undefined, { ear: 'left' }]]); } });
  });

  // ---------- 每幀 ----------
  X.on('reset', () => { try { ixs.alarmStop?.('h207'); } catch { /* 略 */ } run = fresh(); });
  O()?.on?.('flag', (f) => { if (f.name === 'h.boss10' && f.v) onBoss10(); });
  let acc = 0;
  X.tick((dt) => {
    if (game.state !== 'playing') return true;
    acc += dt;
    if (acc < 0.25) return true;
    const step = acc; acc = 0;
    const h = H(), Dr = h?.director, silent = game.phase !== 'fighting';
    // 頭七之前:小美先感覺到(在二樓:叫你站著;不在二樓:叫你上去)
    if (!run.lead && h && h.quiet >= 7 && Dr?.silent && !run.touqi && (Dr.roundT || 0) > 2.5) { run.lead = true; const on2 = /^f2_/.test(game.hospital?.zone?.id || ''); seq(game, on2 ? [['xl', '第七次燈熄了。', 2.2], ['xl', '我們這邊說，人走後第七天，', 3], ['xl', '會回家看一眼，叫頭七。', 2.8], ['xl', '……收音機好安靜。', 2.2], ['xl', '不要過去，站著就好。', 2.6]] : [['xl', '第七次燈熄了。', 2.2], ['xl', '我們這邊說，人走後第七天，', 3], ['xl', '會回家看一眼，叫頭七。', 2.8], ['xl', '……收音機好安靜。', 2.2], ['xl', '好像有人在二樓等你。', 2.6]]); } // 她不認識阿嬤:這是她的推論(REDESIGN §7)
    // 頭七:第 7 次靜默還沒發生 → 退路
    if (!run.touqi && h && h.quiet >= 7 && Dr?.silent && (Dr.roundT || 0) > 14 && !h.memories?.state?.cur) touqiFallback();
    // 頭七那一次靜默久一點(單人):她回來、腳印、旋鈕,不要被下一波打斷
    if (!run.ext && h && h.quiet >= 7 && !run.touqi && game.phase === 'shop' && !game.net) { run.ext = true; game.restT += 28; }
    if (run.touqi && run.knobT && game.time >= run.knobT) { run.knobT = 0; knob(); }
    // 有人在配電盤上把 207 的迴路關掉(苦結局「熄燈」是玩家自己的選擇):小美會冷,阿嬤只說一句
    const lit = X.flags.get('h.pwr.207') !== false;
    if (run.lit !== undefined && run.lit && !lit && !run.offSaid) { run.offSaid = true; X.after(2, () => seq(game, [['xl', '……二樓有一盞燈熄了。', 2.4], ['xl', '我突然好冷。……你那邊也是嗎？', 3.2]])); X.after(9, () => seq(game, [['ama', '燈……不要關。她怕黑。', undefined, { ear: 'right' }]])); }
    run.lit = lit;
    // 電子鎖(鍵盤或聖筊)→ 同步給全隊
    if (X.flags.has('h.207.elock')) flag('h.207.elock');
    if (has('h.207.elock')) onElock();
    tryUnlock();
    // 門真的開了 → 警報
    const w = door207();
    if (!run.alarm && has('h.207.unlock') && w && !X.doors.allClosed(w)) alarm();
    if (run.alarmPend && silent && isHost()) { run.alarmPend = false; X.after(6, () => startGuardWave()); }
    // 第 5 次招魂燈的巨屍 = 大新照護員 夜班組長(正典 §4 首領;身上有門禁卡):給他一個名字,等門禁卡的那幾分鐘才有對象
    if (!run.lead5 && game.round === 5 && game.phase === 'fighting' && !has('h.badge')) {
      const z = game.zombies.find((q) => q.alive && q.type === 'brute' && (q.dist ?? 99) < 30);
      if (z) { run.lead5 = true; X.after(3, () => game.ui?.banner?.('大新夜班組長　陳建宏', '他以前是這裡的看護 · 門禁卡在他身上', 3800, 'red')); X.after(4.5, () => seq(game, [['xl', '大新的無線電說過，', 2.0, { combatOk: true, gap: 0.4 }], ['xl', '門禁卡在夜班組長身上。', 2.6, { combatOk: true, gap: 3 }], ['xl', '他以前是這裡的看護。', 2.4, { combatOk: true }], ['xl', '第一個打針的，就是他們。', 2.8, { combatOk: true }]])); } // 先讓「巨屍出現」的打法提示講完
    }
    // 看守 207 的保全:那一波第一隻巨屍
    if (run.wave && isHost()) {
      if (!run.guard && game.round === run.wave) { const z = game.zombies.find((q) => q.alive && q.type === 'brute'); if (z) { run.guard = z; z._guard = true; } }
      if (run.guard && !run.guard.alive && !run.guardDead) guardDown();
      if (!run.guardDead && game.round === run.wave && silent) guardDown(); // 沒抓到(或被別的方式解決):那一波結束就算
    }
    // 王醫師:看守 207 的保全倒下之後的下一次靜默
    if (has('h.boss10') && !run.hoRang && !has('h.evac') && !has('h.truck') && !game.story?.ending?.active && silent && game.phase === 'shop' && (Dr?.roundT ?? 9) > 5 && !h?.memories?.state?.cur && !game.net?.pvp) ringHo();
    if (run.hoState === 'ringing' && run.hoP && run.hoP.state === 'idle' && game.time - run.hoT > 2) { run.hoState = 'ignored'; flag('h.ho.ignored'); X.after(2, () => seq(game, [['xl', '……不接也好。', undefined, {}]])); }
    if (run.hoState === 'talk' && run.hoP && run.hoP._ended && run.hoP.state === 'call') { // 他說完了(聽筒還在耳邊)
      run.hoState = 'heard'; flag('h.ho.heard'); D()?.addCard?.('hc.20', { by: 'call' });
      X.after(2.2, () => seq(game, [['xl', '……我都聽到了。', 2.2], ['xl', D()?.has?.('hc.30') ? '他知道你拿了。……沒關係。' : '他叫你把那一頁留下來。……你自己判斷。', 3.6]]));
    }
    if (run.hoState === 'talk' && run.hoP) {
      if (run.hoP.state !== 'call') { // 掛了
        const heard = !!run.hoP._ended || game.time >= run.hoEnd + 6;
        run.hoState = heard ? 'heard' : 'hung';
        flag(heard ? 'h.ho.heard' : 'h.ho.hung');
        if (heard) D()?.addCard?.('hc.20', { by: 'call' });
        X.after(1.6, () => (heard ? seq(game, [['xl', '……我都聽到了。', 2.2], ['xl', '他叫你把那一頁留下來。……你自己判斷。', 3.6]]) : seq(game, [['xl', '……掛得好。', 1.8], ['xl', '我在這邊拍手。你沒聽到而已。', 3]])));
      }
    }
    void step;
    return true;
  });
  void wait;
  return S.climax;
}
