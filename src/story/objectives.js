// 聖心醫院〈207 的燈〉的目標鏈(game.objectives;正典 STORY_v2 §4.7、HOSPITAL_CLUES_v2 §5)。
//
// 公開介面(給 回憶 src/horror/memories.js、劇情、測試):
//   game.objectives.step()            → 目前的步驟 id(全部完成 = 'h.done')
//   game.objectives.steps()           → [{ id, act, text, done, cur }]
//   game.objectives.done(id)          → 這一步完成了沒
//   game.objectives.flag(name, v)     → 設劇情旗標(房主同步給全隊;回憶、事件用)
//   game.objectives.has(name)         → 劇情旗標 / 已完成的步驟 / 筆記本的卡 / 互動旗標,任一個有就是 true
//   game.objectives.clue(id, o)       → 收線索卡(= game.deduce.addCard)
//   game.objectives.on(ev, fn)        → 'step'(換步驟)| 'done'(某步完成)| 'flag' | 'hint'
//   game.objectives.hint(tier)        → 立刻給目前步驟的提示(測試用)
//
// 規則:
// - 一步一步來:目前的步驟沒完成,後面的劇情台詞、來電與區域都不會開(條件寫在 STEPS 的 cond / onDone)。
// - 區域:packs/hospital.js 的 lock(門鎖;導航繞過鎖著的門)用旗標打開:h.area.morgue(太平間)、h.area.3f(三樓)、
//   h.207.unlock(207)、門禁卡(監控室)。每一局重新鎖上(doors.reset)。
// - 提示:卡在同一步太久 → 小美在收音機裡提一下 → 阿嬤在耳邊說得更清楚(靜默期,先哼〈望春風〉)→ 東西閃一下。簡單難度提早。
// - 多人:房主說了算。每位玩家在本機判斷「目前這一步」的條件,滿足了就送 'objq' 給房主;房主完成這一步、
//   設好共用旗標,再把整份狀態('objs')廣播給全隊(中途加入的人會先要一份)。目標進度只在這一局有效(每一夜重來)。
import { sfx, ix as ixs } from '../audio.js';
import { settings } from '../ui/settings.js';
import { CARDS, QUESTION, WORDS, CATS } from './clues.js';
import { installOpening } from './opening.js';
import { installRadio } from './radio.js';
import { installClimax } from './climax.js';
import { installEnding } from './ending.js';
import { installRevive } from './revive.js';
import { installNotes } from './notes.js';
import { installMoments } from './moments.js';
import { installLamp } from './lamp.js';
import { installDays } from './days.js';
import { voiceLock, seq, door207 as door207Of } from './voice.js';
import * as THREE from 'three';

// 提示的時間(秒,卡在同一步多久):小美 / 阿嬤 / 閃一下
const HINT_T = { easy: [40, 80, 120], normal: [90, 170, 250], hard: [150, 300, 420] };
const XL = '收音機 · 小美', KS = '對講機 · 金水伯';
const ZH = (text) => ({ id: null, text, ghost: 'zheng', ear: 'both' });

// ---------- 步驟(動作 + 對象;不寫答案、不寫地點) ----------
const STEPS = [
  { id: 'h.s.radio', act: 1, text: '撿起收音機', why: '裡面有人在說話', cond: (c) => !!c.g.story?.radio?.kind,
    hints: { glint: (c) => c.at('h.ix.radio.lobby') } },
  { id: 'h.s.shop', act: 1, text: '找到金水伯的店（一樓）', why: '休息時可以買槍和藥', cond: (c) => c.zone === 'f1_store', skip: (c) => c.g.round >= 3, // 第 3 波以後不擋路
    hints: { xl: '金水伯的店在一樓。\n對講機在店門口。', ama: '金水的店……在這邊。', glint: (c) => c.g.shop?.pos } },
  { id: 'h.s.cyc1', act: 1, text: '撐過前兩波', why: '招魂燈把活屍叫過來了', cond: (c) => c.g.round > 2 || (c.g.round === 2 && c.g.phase !== 'fighting') }, // 阿嬤的第一句在 opening.js(第一次招魂燈熄,一定會有)
  { id: 'h.s.find207', act: 2, text: '找到 207 號房（二樓北邊）', why: '阿嬤叫你來看那盞燈', onStart: (c) => c.later(7, () => { if (c.O.step() === 'h.s.find207' && !c.g.story?.ending?.active) c.talk([[XL, '金水伯問的那盞燈……', 2.4], [XL, '大新的無線電說，在二樓北邊。', 3.2]]); }), cond: (c) => { const w = c.door207(); return !!w && c.near(w.cx, w.y, w.cz, 3.2); },
    onDone: (c) => { c.O.flag('h.where207'); if (c.g.story?.moments?.m3) c.g.story.moments.m3(); else c.later(2, () => c.talk([[XL, '收音機在這扇門前面，叫得好大聲。', 3.0], [XL, '……裡面到底有什麼？', 2.4]])); }, // M3:門後的聲音
    hints: { xl: '207 在二樓。\n北邊那一排病房，你數數看。', ama: '207……阿嬤在那裡等你。', glint: (c) => { const w = c.door207(); return w ? { x: w.cx, y: w.y + 1.4, z: w.cz } : null; } } },
  { id: 'h.s.how207', act: 2, text: '查出 207 的門怎麼開', why: '門上了電子鎖', prog: (c) => [c.D.got('hc.15'), c.D.got('hc.27'), c.run.xlHow].filter(Boolean).length, m: 2, // 這一局碰到的才算(重玩不會一進門就完成)
    onStart: (c) => c.later(30, () => { if (c.O.step() !== 'h.s.how207') return; c.talk([[XL, '大新的無線電，我偷聽了三個禮拜。', 3.2], [XL, '他們說，207 的鎖\n歸三樓監控室管。', 3.4]], () => { c.run.xlHow = true; }); }),
    onDone: (c) => { c.O.flag('h.area.morgue'); c.later(1.5, () => c.talk([[XL, '要開那扇門，三樓得先有電。', 2.8], [XL, '地下室的配電盤，\n少了三支保險絲。', 3.4]])); },
    hints: { xl: '大新的無線電說過，\n207 的鎖歸三樓管。', ama: '紅色的插頭不要拔。\n阿嬤把燈接在那裡。', glint: (c) => c.at('h.look.panel2f') } },
  { id: 'h.s.fuses', act: 3, text: '到地下室找保險絲', why: '三樓沒電，207 的鎖打不開', skip: (c) => c.O.has('h.207.elock'), prog: (c) => (c.X.flags.has('h.gen.on') ? 3 : Math.min(3, c.run.fuses)), m: 3,
    hints: { xl: '保險絲在洗衣房、鍋爐房、\n還有太平間。\n太平間的冰櫃照 3、1、5 拉。', ama: '冷的那邊……三、一、五。照順序。', glint: (c) => c.at('h.ix.fuse.laundry', true) || c.at('h.ix.fuse.boiler', true) || c.at('h.ix.morgue', true) } },
  { id: 'h.s.gen', act: 3, text: '把保險絲裝回配電盤（鍋爐房）', why: '讓三樓監控室有電', skip: (c) => c.O.has('h.207.elock'), cond: (c) => c.X.flags.has('h.gen.on'),
    onDone: (c) => { c.O.flag('h.gen.on'); c.O.flag('h.pwr.monitor'); c.O.flag('h.area.3f'); c.later(2, () => c.talk([[XL, '燈回來了，三樓也有電了。', 3.2], [XL, '監控室要刷卡。\n大新的人身上有。', 3.0]])); },
    hints: { xl: '保險絲有了。\n配電盤在鍋爐房。', ama: '電……要再接起來。', glint: (c) => c.at('h.ix.fusebox') } },
  { id: 'h.s.code', act: 3, text: '查出 207 的密碼', why: '是那個病人住進來的日子', onStart: (c) => c.later(9, () => { if (c.O.step() === 'h.s.code' && !c.g.story?.busy?.()) c.talk([[XL, '大新的人說，監控室的鍵盤要密碼。', 3.4], [XL, '……那一床的病人，是哪一天來的？', 2.8]]); }), skip: (c) => c.O.has('h.207.elock'), prog: (c) => (c.X.flags.has('h.code.known') ? 2 : [c.D.got('hc.10'), c.D.got('hc.07'), c.D.got('hc.25') || c.X.flags.has('h.ks.921')].filter(Boolean).length), m: 2, // h.code.known:以前聖筊過,你記得密碼(src/story/deduce.js)
    hints: { xl: '密碼是一個日子。\n207 的病人，哪一天住進來的？', ama: '是她住進來的那一天。', glint: (c) => c.at('h.ix.terminal') } },
  { id: 'h.s.badge', act: 3, text: '拿到監控室的門禁卡', why: '在夜班組長身上（第 5 波）', onStart: (c) => c.later(5, () => { if (c.O.step() === 'h.s.badge' && !c.g.story?.busy?.()) c.talk([[XL, '監控室要刷卡。', 1.8], [XL, '卡在大新的夜班組長身上。\n第五波，他會出來。', 3.6]]); }), skip: (c) => c.O.has('h.207.elock'), cond: (c) => c.X.inv.has('card.security') || c.O.has('h.badge'),
    onDone: (c) => c.O.flag('h.badge'),
    hints: { xl: '卡在大新的夜班組長身上。\n第五波，他會出來。\n等的時候，先填筆記本。', ama: '在巡房的那個人……身上有卡。' } },
  { id: 'h.s.deduce', act: 4, text: '填好筆記本（J）', why: '弄清楚封院第 7 晚的事', prog: (c) => (c.D.solved() ? QUESTION.m : c.D.filled()), m: QUESTION.m, skip: (c) => c.O.has('h.207.elock') || c.O.has('h.207.unlock'),
    hints: { deduce: 'fill' } },
  { id: 'h.s.throw', act: 4, text: '到阿嬤的照片前擲筊', why: '問她對不對；對了她會開鎖', cond: (c) => c.D.solved(), skip: (c) => c.O.has('h.207.elock') || c.O.has('h.207.unlock'),
    hints: { deduce: 'throw', glint: (c) => c.at('h.ix.memorial') } },
  // 207 兩道鎖:電子鎖(鍵盤 0924 或聖筊)+ 門內的旋鈕(頭七那一夜阿嬤回來轉開);兩道都開了,門自己推開(src/story/climax.js)
  { id: 'h.s.unlock', act: 4, text: '打開 207', why: (c) => (c.O.has('h.207.elock') ? '門從裡面鎖著，等阿嬤回來' : '電子鎖＋門裡的旋鈕'), prog: (c) => (c.O.has('h.207.unlock') ? 2 : (c.O.has('h.207.elock') ? 1 : 0) + (c.O.has('h.207.knob') ? 1 : 0)), m: 2,
    hints: { xl: (c) => (c.O.has('h.207.elock') ? '門是從裡面鎖的。\n只有裡面的人開得了。我們等。' : '輸入密碼，或去照片前擲筊。\n兩條路都能開電子鎖。'),
      ama: (c) => (c.O.has('h.207.elock') ? '等阿嬤回來。' : '是她住進來的那一天。'), glint: (c) => (c.O.has('h.207.elock') ? null : c.at('h.ix.keypad')) } },
  { id: 'h.s.boss', act: 4, text: '守住 207', why: '劉家豪要回來關上那扇門', cond: (c) => c.O.has('h.boss10') }, // 「守住 207」那一波(src/story/climax.js)
  { id: 'h.s.enter', act: 4, text: '進 207', why: '阿嬤在枕頭裡留了東西給你', cond: (c) => c.zone === 'f2_ward_207' && (c.D.got('hc.30') || (c.run.in207 = (c.run.in207 || 0) + 0.25) > 1.5), // 要真的走進 207
    onDone: (c) => c.page(),
    hints: { xl: '頭七那天的腳印……停在床邊。', ama: '枕頭……阿嬤放在枕頭裡。', glint: (c) => c.at('h.ix.pillow') } },
  // 終章由你按下去(NARRATIVE N8):拿起任何一支電話(或店門口的對講機)叫金水伯的車 → 急診車道 → 守一波(佇列清完或約 60 秒)
  { id: 'h.s.wait', act: 5, text: '叫金水伯的車', why: (c) => (c.O.has('h.callok') ? '拿起任何一支電話，或店門口的對講機' : '先把這一夜的事聽完'), cond: (c) => c.O.has('h.truck'),
    hints: { xl: (c) => (c.O.has('h.callok') ? '金水伯在外面等你叫他。\n拿起電話，他聽得到。' : null) } }, // 王醫師的電話(如果有)先講完,才可以叫車
  { id: 'h.s.bay', act: 5, text: '到一樓急診車道', why: '金水伯的車在那裡', cond: (c) => c.zone === 'f1_ambulance', onDone: (c) => c.g.story?.climax?.startFinalWave?.(),
    hints: { xl: '金水伯的車在急診車道。\n倒車燈亮著，快！' } },
  { id: 'h.s.hold', act: 5, text: '守住急診車道', why: '金水伯在倒車，等你上車', prog: (c) => (c.g.story?.climax?.finalDone?.() ? 60 : Math.min(60, Math.floor(c.run.holdT))), m: 60,
    onDone: (c) => c.evac() },
];
const BY = Object.fromEntries(STEPS.map((s) => [s.id, s]));

export function installObjectives(game) {
  const subs = new Map();
  const emit = (ev, d) => { for (const fn of subs.get(ev) || []) { try { fn(d); } catch (e) { console.warn('[objectives]', ev, e); } } };
  const fresh = () => ({ done: new Set(), flags: new Set(), cur: STEPS[0].id, t: 0, stuck: 0, prog: '', tier: 0, fuses: 0, holdT: 0, xlHow: false, card: false, lastPh: null, evac: false, glint: null, glintT: 0, sentQ: new Map(), bcastT: 0 });
  let run = fresh();
  const X = () => game.interact, D = () => game.deduce, H = () => game.horror;
  const isHost = () => !game.net || !!game.net.isHost;
  const later = (s, fn) => X()?.after?.(s, fn);
  const diff = () => { try { const q = new URLSearchParams(location.search).get('diff'); return q || settings.get?.('difficulty') || 'normal'; } catch { return 'normal'; } };

  const O = {
    step: () => run.cur,
    steps: () => STEPS.map((s) => ({ id: s.id, act: s.act, text: s.text, done: run.done.has(s.id), cur: run.cur === s.id })),
    done: (id) => run.done.has(id),
    has: (k) => run.flags.has(k) || run.done.has(k) || !!D()?.has?.(k) || !!X()?.flags?.has?.(k),
    flag(name, v = true) {
      if (!name) return false;
      if (v) run.flags.add(name); else run.flags.delete(name);
      if (/^(h\.|meta\.|know\.)/.test(name)) X()?.flags?.set?.(name, v); // 門鎖/鍵盤看的是互動旗標
      emit('flag', { name, v });
      if (isHost()) broadcast(); else if (game.net?.send) { try { game.net.send('objf', [name, v ? 1 : 0]); } catch { /* 斷線 */ } }
      return true;
    },
    clue: (id, o) => D()?.addCard?.(id, o) ?? false,
    on(ev, fn) { if (!subs.has(ev)) subs.set(ev, new Set()); subs.get(ev).add(fn); return () => subs.get(ev).delete(fn); },
    hint(tier = run.tier + 1) { giveHint(BY[run.cur], tier); },
    glintAt(p, secs = 12) { if (p) { run.glint = p; run.glintT = secs; } }, // 指一下某個東西(收音機在叫你)
    state: () => ({ cur: run.cur, done: [...run.done], flags: [...run.flags], stuck: Math.round(run.stuck), tier: run.tier, fuses: run.fuses, holdT: Math.round(run.holdT) }),
  };
  game.objectives = Object.assign(game.objectives || {}, O);
  Object.defineProperty(game.objectives, 'run', { get: () => run, configurable: true }); // 除錯用(每一局換新的物件)

  // ---------- 情境(給 STEPS 的條件與動作) ----------
  const door207 = () => door207Of(game);
  const c = {
    g: game, O, get X() { return X(); }, get D() { return D(); }, get run() { return run; }, get zone() { return game.hospital?.zone?.id || null; },
    door207, later,
    near(x, y, z, r) { const p = game.player.pos; return Math.abs(p.y - y) < 2.2 && Math.hypot(p.x - x, p.z - z) < r; },
    at(id, unused) { const e = X()?.get?.(id); if (!e || (unused && (e.used || e.n > 0))) return null; const q = X().where(e); return { x: q.x, y: q.y, z: q.z }; },
    talk: (lines, cb, o) => D()?.talk?.(lines, cb, o),
    ama(text, force) {
      const h = H();
      if (!h) return false;
      if (!force && !h.director?.silent) return false; // 鬼只在招魂燈熄的時候說話
      try { sfx.folk('ama', game.player.pos); } catch { /* 還沒烘焙好 */ }
      later(1.6, () => seq(game, [['ama', text, undefined, { ear: 'both' }]])); // 排隊(一次一個人說話)
      return true;
    },
    evac() { // 撐完 60 秒:結局〈天光〉(src/story/ending.js;每位玩家看自己的結局)
      if (run.evac) return; run.evac = true; O.flag('h.evac');
      if (game.story?.ending?.play) game.story.ending.play();
      else game.ui?.banner?.('撤離', '燈還亮著', 6000, 'gold');
    },
    // 進了 207:枕頭微微發亮(閃一下);拿起那一頁、或離開 207、或 30 秒之後 → 金水伯的車來了
    page() {
      const t0 = game.time;
      later(1.2, () => { const q = c.at('h.ix.pillow'); if (q && !D()?.got?.('hc.30')) { run.glint = q; run.glintT = 10; } });
      later(7, () => { if (!D()?.got?.('hc.30') && c.zone === 'f2_ward_207') c.ama('枕頭……阿嬤放在枕頭裡。'); }); // 她要你拿到那一頁(靜默期才說)
      const go = () => { O.flag('h.callok'); later(1.2, () => { if (run.cur === 'h.s.wait' && !game.story?.busy?.()) c.talk([[XL, '金水伯在外面。\n……你自己叫他。', 3.2], [XL, '拿起電話，他聽得到。', 2.4]]); }); };
      let out = 0;
      X()?.tick?.((dt) => {
        if (run.evac || game.state !== 'playing') return false;
        out = c.zone === 'f2_ward_207' ? 0 : out + dt;
        const ho = game.story?.climax?.run, hoBusy = !!ho && !!O.has('h.boss10') && (!ho.hoRang || ho.hoState === 'ringing' || ho.hoState === 'talk') && game.time - t0 < 300; // 王醫師的電話先講完(他在看守 207 的保全倒下之後的第一次靜默打來;找不到電話就不等)
        if (!hoBusy && (D()?.got?.('hc.30') || out > 4 || game.time - t0 > 30)) { later(ho?.hoRang ? 9.5 : D()?.got?.('hc.30') ? 5 : 1.5, go); return false; } // 電話之後讓小美先說完
        return true;
      });
    },
  };

  // ---------- 目前步驟的推進(房主 / 單人) ----------
  const progOf = (s) => (s.prog ? Math.min(s.m, s.prog(c)) : null);
  const met = (s) => { try { if (s.prog) return progOf(s) >= s.m; return !!s.cond?.(c); } catch (e) { console.warn('[objectives]', s.id, e); return false; } };
  function complete(id, by) {
    const s = BY[id];
    if (!s || run.done.has(id)) return;
    run.done.add(id);
    emit('done', { id, by });
    try { s.onDone?.(c); } catch (e) { console.warn('[objectives] onDone', id, e); }
    advance();
  }
  function advance() {
    let i = STEPS.findIndex((s) => !run.done.has(s.id));
    while (i >= 0 && STEPS[i].skip?.(c)) { run.done.add(STEPS[i].id); i = STEPS.findIndex((s) => !run.done.has(s.id)); } // 例:用密碼開了 207,推理與擲筊就不再擋路
    const next = i < 0 ? 'h.done' : STEPS[i].id;
    if (next !== run.cur) setCur(next);
    if (isHost()) broadcast();
  }
  function setCur(id) {
    const prev = run.cur;
    run.cur = id; run.stuck = 0; run.tier = 0; run.prog = ''; run.glint = null;
    hud.set(id, true);
    emit('step', { id, prev });
    try { BY[id]?.onStart?.(c); } catch (e) { console.warn('[objectives] onStart', id, e); }
  }

  // ---------- 多人同步(房主說了算) ----------
  let netBound = null;
  function broadcast() {
    const s = game.net;
    if (!s?.send || !s.isHost) return;
    try { s.send('objs', { c: run.cur, d: [...run.done], f: [...run.flags], h: Math.round(run.holdT) }); } catch { /* 斷線 */ }
    run.bcastT = 0;
  }
  function bindNet() {
    const s = game.net;
    if (!s || s === netBound || !s.on) return;
    netBound = s;
    s.on('objs', (m) => { // 房主的狀態:照抄(旗標只會增加 → 門鎖只會打開)
      if (s.isHost || !m) return;
      for (const f of m.f || []) if (!run.flags.has(f)) { run.flags.add(f); if (/^(h\.|meta\.|know\.)/.test(f)) X()?.flags?.set?.(f, true); emit('flag', { name: f, v: true }); }
      for (const d of m.d || []) if (!run.done.has(d)) { run.done.add(d); emit('done', { id: d, by: 'host' }); try { BY[d]?.onDone?.(c); } catch { /* 略 */ } }
      run.holdT = Math.max(run.holdT, m.h || 0);
      if (m.c && m.c !== run.cur) setCur(m.c);
    });
    s.on('objq', (d) => { if (!s.isHost) return; if (d === '?') { broadcast(); return; } if (typeof d === 'string' && d === run.cur) complete(d, 'peer'); });
    s.on('objf', (d) => { if (s.isHost && Array.isArray(d)) O.flag(d[0], !!d[1]); });
    if (!s.isHost) try { s.send('objq', '?'); } catch { /* 略 */ }
  }

  // ---------- 提示 ----------
  function giveHint(s, tier) {
    if (!s) return false;
    const h = s.hints || {};
    run.tier = Math.max(run.tier, tier);
    emit('hint', { id: s.id, tier });
    if (h.deduce) return deduceHint(h.deduce, tier, s);
    const v = (x) => (typeof x === 'function' ? x(c) : x);
    const xl = v(h.xl), ama = v(h.ama);
    if (tier === 1 && xl) { c.talk([[XL, xl, Math.max(3, xl.length / 4.5 + 0.6)]], null, { hint: true }); return true; }
    if (tier === 2 && ama) return c.ama(ama);
    if (tier >= 3 && h.glint) {
      const p = h.glint(c);
      if (p) {
        run.glint = p; run.glintT = 14;
        // 看不到閃光的時候,用阿嬤的哼聲指路(從那個東西的方向;靜默期才有)
        if (H()?.director?.silent && Math.abs(p.y - game.player.pos.y) < 6) { try { sfx.folk('ama', p); } catch { /* 冷卻中 */ } }
        return true;
      }
    }
    return false;
  }
  // 筆記本的提示:還有空格 → 哪一類的詞還缺、哪張卡會有;填錯了 → 哪一格不對、該重看哪一張卡;最後在筆記本上把那一格圈起來
  function deduceHint(kind, tier, s) {
    const Dd = D(); if (!Dd) return false;
    const st = Dd.state(), B = QUESTION.blanks, keys = Object.keys(B);
    if (kind === 'fill' || !st.last || st.last.result === 'sheng') {
      const b = keys.find((k) => !st.fill[k]);
      if (!b) { if (tier === 1) c.talk([[XL, '填好了，就去問阿嬤。\n二樓護理站，她的照片前面。', 3.6]], null, { hint: true }); else if (tier >= 3) { const p = s.hints.glint?.(c); if (p) { run.glint = p; run.glintT = 14; } } return true; }
      const cat = B[b].cat, have = new Set(Dd.words());
      const card = CARDS.find((q) => !Dd.has(q.id) && (q.words || []).some((w) => WORDS[w]?.cat === cat && !have.has(w)));
      const i = keys.indexOf(b) + 1;
      if (tier === 1) c.talk([[XL, `筆記本第 ${i} 格還空著。\n按 J，看缺的是「${CATS[cat]}」。`, 3.8]], null, { hint: true });
      else if (tier === 2) c.ama(card ? `「${CATS[cat]}」……〈${card.title}〉裡面有。` : `第 ${i} 格……想想阿嬤說過的話。`);
      else { Dd.hintBlank = b; if (Dd.isOpen) Dd.open(); }
      return true;
    }
    const wrong = keys.find((k) => st.fill[k] !== B[k].answer);
    if (!wrong) return false;
    const i = keys.indexOf(wrong) + 1, card = Dd.cards().find((q) => (q.sup || []).includes(wrong)) || null;
    if (tier === 1) c.talk([[XL, card ? `第 ${i} 格……怪怪的。你再看一次〈${card.title}〉。` : `第 ${i} 格……怪怪的。再想想。`, 3.6]]);
    else if (tier === 2) c.ama(`第 ${i} 格……不是這樣。`);
    else Dd.hintBlank = wrong;
    return true;
  }

  // ---------- HUD:目前的目標(細、淡、一行) ----------
  // 目標列:「目標｜為什麼」(CLARITY_PLAN §7.1);為什麼可以是函式(例:207 的電子鎖開了沒)
  const whyOf = (s) => { try { return typeof s.why === 'function' ? s.why(c) : s.why || ''; } catch { return ''; } };
  const hud = makeHud(game, () => { const s = BY[run.cur]; if (!s) return ''; const n = progOf(s); return [s.prog ? `${s.text}（${n}／${s.m}）` : s.text, whyOf(s)]; });
  O.line = () => { const s = BY[run.cur]; if (!s) return null; const n = progOf(s); return { goal: s.prog ? `${s.text}（${n}／${s.m}）` : s.text, why: whyOf(s) }; }; // 給筆記本〈到目前為止〉的「下一步」
  game.objectives.line = O.line;

  // ---------- 每幀(互動系統的 tick;只在遊戲中、沒暫停) ----------
  const X0 = X();
  if (X0) {
    X0.on('reset', () => { run = fresh(); setCur(STEPS[0].id); });
    X0.on('item', (id, n, d) => { if (id === 'fuse' && d > 0) run.fuses++; });
    X0.on('unlock', (w) => { const nm = w.lock?.door === 'f3_corridor' ? '三樓的門禁「嗶」了一聲，鎖開了。' : w.lock?.door === 'b1_morgue' ? '地下室傳來「喀」的一聲：太平間的門鎖開了。' : null; if (nm && !run['u' + w.lock.door]) { run['u' + w.lock.door] = true; game.ui?.feed?.(nm, { color: '#e3c98a', ms: 6000 }); } });
    let acc = 0;
    X0.tick((dt) => {
      bindNet();
      if (game.state !== 'playing') return true;
      run.t += dt; acc += dt;
      hud.glint(run.glint, run.glintT > 0, game);
      if (run.glintT > 0) run.glintT -= dt;
      if (acc < 0.25) return true;
      const step = acc; acc = 0;
      // 門禁卡:招魂燈亮到最大的那一次(第 5 次)撐過去,夜班組長倒下的地方有一張卡(每位玩家各自撿;第 5 次以後的靜默才會是非戰鬥相位)
      // (夜班組長倒下時,卡掉在他身上:src/story/climax.js dropBadge;這裡是退路 —— 沒認出他、或他沒倒在這一波)
      if (game.round >= 5 && game.phase !== 'fighting' && !X0.inv.has('card.security') && !run.card && !game.story?.climax?.run?.badgeDrop) {
        run.card = true; X0.inv.add('card.security'); game.ui?.pickup?.('門禁卡', '#e8d9a8', { sub: '夜班組長倒下的地方，掉著一張卡' }); sfx.pickupItem?.();
      }
      run.lastPh = game.phase;
      if (game.hospital?.zone?.id === 'f1_ambulance' && run.cur === 'h.s.hold') run.holdT += step;
      if (run.cur === 'h.s.wait' && O.has('h.callok') && !run.called) callKimsui();
      const s = BY[run.cur];
      if (!s) return true;
      // 進度變了 → 重算卡住的時間
      const pr = s.prog ? String(progOf(s)) : '';
      if (pr !== run.prog) { run.prog = pr; run.stuck = 0; run.tier = 0; hud.set(run.cur, false); }
      if (isHost() && s.skip?.(c)) { advance(); return true; } // 例:聖筊先開了電子鎖 → 配電、門禁卡、密碼都不用了
      if (met(s)) {
        if (isHost()) complete(s.id, 'self');
        else if (game.net?.send && (game.time - (run.sentQ.get(s.id) || -9)) > 3) { run.sentQ.set(s.id, game.time); try { game.net.send('objq', s.id); } catch { /* 略 */ } }
      } else if (s.hints && !game.story?.busy?.()) {
        run.stuck += step;
        const T = HINT_T[diff()] || HINT_T.normal;
        const want = run.stuck >= T[2] ? 3 : run.stuck >= T[1] ? 2 : run.stuck >= T[0] ? 1 : 0;
        // 卡住的時間一直算,可是只在聽得進去的時候說(招魂燈熄、或附近 22 m 沒有活的殭屍)
        const calm = game.phase !== 'fighting' || !game.zombies.some((z) => z.alive && (z.dist ?? 99) < 22);
        if (want > run.tier && calm) { if (giveHint(s, want) === false && want === 2) run.tier = 2; }
        if (run.tier >= 3 && run.glintT <= 0 && run.stuck - T[2] > 45) { run.stuck = T[2]; giveHint(s, 3); } // 還是卡著:每 45 秒再閃一次
      }
      if (isHost() && game.net && (run.bcastT += step) > 10) broadcast();
      return true;
    });
  }
  setCur(STEPS[0].id);
  // 叫車:你拿起一支沒在響的電話(撥號音)→ 線路接到店門口的對講機,金水伯接起來
  function callKimsui() {
    const P = (X0.phones || []).find((q) => q.state === 'off' && Math.hypot(q.pos.x - game.player.pos.x, q.pos.z - game.player.pos.z) < 3.5 && Math.abs(q.pos.y - game.player.pos.y) < 2.5);
    const api = X0.map?.api;
    if (!P || !api) return;
    run.called = true;
    try { P.tones?.(); ixs.lineNoise?.(true); } catch { /* 略 */ }
    const t = api.speak({ who: KS, voice: 'old', parts: ['……喂？少年仔？是你喔？', '好，阿伯知道了。馬上到。', '急診車道。撐一下，阿伯倒車進去。'] }, { filter: 'phone', critical: true });
    P.talk = t; P.state = 'call'; P.callEnd = game.time + (t?.dur || 8) + 0.4; // 照一般的來電收尾(掛上或講完)
    later((t?.dur || 8) + 1.5, () => { O.flag('h.truck'); later(4, truckCall); });
  }
  // 撤離:金水伯從發財車的大聲公喊(急診車道的方向;REDESIGN §2.5)
  function truckCall() {
    const api = X()?.map?.api, A = game.hospital?.anchors?.truck, m = A?.mesh;
    let pos = null;
    if (m) { const v = new THREE.Vector3(); m.getWorldPosition(v); pos = { x: v.x, y: v.y + 1.8, z: v.z }; } else if (A && Number.isFinite(A.x)) pos = { x: A.x, y: (A.y ?? 0) + 1.8, z: A.z };
    if (!api) return;
    try { ixs.ringStart?.('truck.horn', pos, 'bell'); X()?.after?.(0.8, () => ixs.ringStop?.('truck.horn')); } catch { /* 略 */ }
    api.speak({ who: '發財車大聲公 · 金水伯', voice: 'old', parts: ['少年仔！車來囉！', '阿伯在急診車道，緊來！'] }, { filter: 'pa', pos, gain: 1.6, critical: true });
  }
  // 開場、高潮、結局(EXPERIENCE_PLAN §3)
  const S = (game.story ||= {});
  S.flag = (k, v = true) => O.flag(k, v);
  voiceLock(game); // 聲音的鎖:一次只有一個人說話(CLARITY_PLAN §7.4)
  try { installRadio(game, S); } catch (e) { console.warn('[story] radio', e); }
  try { installOpening(game, S); } catch (e) { console.warn('[story] opening', e); }
  try { installClimax(game, S); } catch (e) { console.warn('[story] climax', e); }
  try { installEnding(game, S); } catch (e) { console.warn('[story] ending', e); }
  try { installRevive(game, S); } catch (e) { console.warn('[story] revive', e); }
  try { installNotes(game, S); } catch (e) { console.warn('[story] notes', e); }
  try { installMoments(game, S); } catch (e) { console.warn('[story] moments', e); }
  try { installLamp(game); } catch (e) { console.warn('[story] lamp', e); }
  try { installDays(game); } catch (e) { console.warn('[story] days', e); }
  return O;
}

// 目標列 + 「閃一下」的小光點(都是 DOM,不新增 shader)
function makeHud(game, textOf) {
  const hud = game.ui?.hudEl || document.body;
  const el = document.createElement('div');
  el.className = 'hd ob-line';
  el.innerHTML = '<i></i><span></span><small></small>';
  hud.appendChild(el);
  const sp = el.querySelector('span'), sw = el.querySelector('small');
  const gl = document.createElement('div');
  gl.className = 'hd ob-glint';
  hud.appendChild(gl);
  const _v = new THREE.Vector3();
  let last = '', glOn = false, glT = 0;
  return {
    set(id, fresh) {
      const v = textOf(), t = Array.isArray(v) ? v[0] : v, w = Array.isArray(v) ? v[1] || '' : '';
      el.classList.toggle('hide', !t);
      const k = t + '｜' + w;
      if (k === last && !fresh) return;
      last = k;
      if (fresh && t) { el.classList.remove('new'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('new'))); try { ixs.paper?.(); } catch { /* 略 */ } } // 重播動畫:隔兩幀再加回(不在更新裡強迫排版)
      sp.textContent = t;
      sw.textContent = w ? '｜' + w : '';
    },
    glint(p, on, g) {
      if (!on || !p || g.state !== 'playing') { if (glOn) { glOn = false; gl.classList.remove('on'); } glT = 0; return; }
      const cam = g.camera, pl = g.player.pos;
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      _v.set(p.x, p.y, p.z).project(cam);
      const vis = _v.z < 1 && Math.abs(_v.x) < 0.95 && Math.abs(_v.y) < 0.95 && d < 16 && Math.abs(p.y - pl.y - 1) < 2.6
        && (g.world?.hasLineOfSight?.(cam.position.x, cam.position.y, cam.position.z, p.x, p.y, p.z) ?? true);
      // [perf] 可見性要連續 0.15 秒一致才切換:邊界附近每幀來回切 class 會一直重播淡入與閃爍動畫
      if (vis !== glOn) { const t = performance.now(); if (!glT) glT = t; else if (t - glT > 150) { glOn = vis; glT = 0; gl.classList.toggle('on', vis); } } else glT = 0;
      if (vis) gl.style.transform = `translate(${((_v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px)`;
    },
  };
}
