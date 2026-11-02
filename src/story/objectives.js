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
// - 回饋(w6):每一步完成時,目標列先亮一行「✓ 做到了什麼｜怎麼知道的」(ok),停 3 秒才換下一步;有進度的步驟在目標列底下列出小項
//   (sub:還沒做 = 去哪裡找,做到了 = 發現了什麼;地點要先從紙條讀到才會寫出來)。因為別的事被跳過的步驟也說一聲(skipOk)。
// - 多人:房主說了算。每位玩家在本機判斷「目前這一步」的條件,滿足了就送 'objq' 給房主;房主完成這一步、
//   設好共用旗標,再把整份狀態('objs')廣播給全隊(中途加入的人會先要一份)。目標進度只在這一局有效(每一夜重來)。
import { sfx, ix as ixs } from '../audio.js';
import { settings } from '../ui/settings.js';
import { CARDS, CARD, QUESTION, WORDS, CATS } from './clues.js';
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
// ok:完成時的那一行 [做到了什麼, 怎麼知道的];skipOk:被別的事跳過時的那一行;sub:小項清單 [{ t 還沒做(去哪裡找), d 做到了(發現了什麼), on(c) }]
// (sub 也可以是函式:讀到線索才列出地點);hold(c):條件到了也先等一下(例:小美還在講);hk:提示提早(乘在 HINT_T 上)
const got = (id) => (c) => !!c.D?.got?.(id);
const read = (c, ...ids) => ids.some((id) => c.X?.flags?.has?.('note.' + id));
// 三支保險絲:在哪、拿到了沒、從哪張紙讀到的(停電通知 h.s12、工作單 h.s02、冰櫃白板 h.s03、電梯旁的鉛筆字 h.s01)
const FUSE = [
  { k: 'laundry', id: 'h.ix.fuse.laundry', zone: 'b1_laundry', name: '洗衣房', where: '洗衣房（掉在地上，靠牆）', know: (c) => read(c, 'h.s12', 'h.s02'), got: (c) => !!c.X?.get?.('h.ix.fuse.laundry')?.used,
    xl: '洗衣房那支掉在地上。\n沿著牆邊，低頭找。' },
  { k: 'boiler', id: 'h.ix.fuse.boiler', zone: 'b1_boiler', name: '鍋爐房', where: '鍋爐房的備品櫃', know: (c) => read(c, 'h.s12', 'h.s02'), got: (c) => (c.X?.get?.('h.ix.fuse.boiler')?.n || 0) > 0,
    xl: '鍋爐房有一個置物櫃，\n名牌寫「工務室備品」。' },
  { k: 'morgue', id: 'h.ix.morgue:5', zone: 'b1_morgue', name: '太平間', where: '太平間的冰櫃', know: (c) => read(c, 'h.s12', 'h.s02', 'h.s01', 'h.s03'), got: (c) => !!c.X?.flags?.has?.('h.morgue.solved'),
    order: (c) => read(c, 'h.s02', 'h.s03'), xl: (c) => (read(c, 'h.s02', 'h.s03') ? '冰櫃照紙上的順序拉。\n三號、一號，最後五號。' : '太平間那支在冰櫃裡。\n白板上應該寫了怎麼拿。') },
];
const fuseSub = (c) => {
  if (!FUSE.some((f) => f.know(c) || f.got(c))) return [{ t: '看看配電盤旁邊的公告（鍋爐房）', d: '', on: () => false }];
  return FUSE.filter((f) => f.know(c) || f.got(c)).map((f) => ({ t: f.k === 'morgue' && f.order(c) ? '太平間：冰櫃照 3、1、5 拉' : f.where, d: `${f.name}：拿到了`, on: f.got }));
};
// 劇情一定要讀得到的紙:鍋爐房的停電通知貼在發電機上方的牆上,人被機器擋在 2 m 外,準心對得到、E 卻按不到 → 互動距離放寬(不動模型與擺放)
const READ_FAR = { 'h.ix.notice.power': [2.9, 1.8] }; // [互動距離, 視線放寬(losPad:前面的機器擋到一點也算看得到)]
const fuseNext = (c) => FUSE.find((f) => !f.got(c) && f.know(c)) || FUSE.find((f) => !f.got(c)) || null;
const fuseGlint = (c) => { const f = fuseNext(c); if (!f) return null; if (f.k === 'morgue') return f.order(c) ? c.at('h.ix.morgue:3') : c.at('h.ix.morgueboard') || c.at('h.ix.morgue:3'); return c.at(f.id, true); };
// [w6] 按 Q 問小美(objectives.ask):直接說下一支缺的在哪(不用先看停電通知);太平間那支第二次問就把順序講出來
const fuseAsk = (c, n) => {
  const f = FUSE.find((q) => !q.got(c));
  if (!f) return null;
  if (f.k === 'morgue') {
    const order = n >= 2 || f.order(c);
    return { xl: order ? '太平間的冰櫃，照順序拉：\n三號、一號，最後五號。' : '最後一支在太平間的冰櫃裡。\n白板上寫了怎麼拿。', glint: order ? c.at('h.ix.morgue:3') : c.at('h.ix.morgueboard') || c.at('h.ix.morgue:3') };
  }
  return { xl: typeof f.xl === 'function' ? f.xl(c) : f.xl, glint: c.at(f.id, true) };
};
const door207At = (c) => { const w = c.door207(); return w ? { x: w.cx, y: w.y + 1.4, z: w.cz } : null; };
const STEPS = [
  { id: 'h.s.radio', act: 1, text: '撿起收音機', why: '裡面有人在說話', cond: (c) => !!c.g.story?.radio?.kind, ok: ['撿起收音機了', '小美在裡面說話'],
    hints: { glint: (c) => c.at('h.ix.radio.lobby') } },
  { id: 'h.s.shop', act: 1, text: '找到金水伯的店（一樓）', why: '休息時可以買槍和藥', cond: (c) => c.zone === 'f1_store', skip: (c) => c.g.round >= 3, ok: ['找到金水伯的店了', '休息的時候來這裡補貨'], skipOk: ['金水伯的店，之後再去也行', '在一樓，休息時開門'], // 第 3 波以後不擋路
    hints: { xl: '金水伯的店在一樓。\n對講機在店門口。', ama: '金水的店……在這邊。', glint: (c) => c.g.shop?.pos } },
  { id: 'h.s.cyc1', act: 1, text: '撐過前兩波', why: '招魂燈把活屍叫過來了', cond: (c) => c.g.round > 2 || (c.g.round === 2 && c.g.phase !== 'fighting'), ok: ['撐過前兩波了', '招魂燈熄了'] }, // 阿嬤的第一句在 opening.js(第一次招魂燈熄,一定會有)
  { id: 'h.s.find207', act: 2, text: '找到 207 號房（二樓北邊）', why: '阿嬤叫你來看那盞燈', onStart: (c) => c.later(7, () => { if (c.O.step() === 'h.s.find207' && !c.g.story?.ending?.active) c.talk([[XL, '金水伯問的那盞燈……', 2.4], [XL, '大新的無線電說，在二樓北邊。', 3.2]]); }), cond: (c) => { const w = c.door207(); return !!w && c.near(w.cx, w.y, w.cz, 3.2); },
    ok: ['找到 207 號房了', '門鎖著，裡面亮著燈'],
    onDone: (c) => { c.O.flag('h.where207'); if (c.g.story?.moments?.m3) c.g.story.moments.m3(); else c.later(2, () => c.talk([[XL, '收音機在這扇門前面，叫得好大聲。', 3.0], [XL, '……裡面到底有什麼？', 2.4]])); }, // M3:門後的聲音
    hints: { xl: '207 在二樓。\n北邊那一排病房，你數數看。', ama: '207……阿嬤在那裡等你。', glint: door207At } },
  // 查出 207 的門怎麼開:三件裡碰到兩件(這一局碰到的才算)。小美那一段是你看了門或配電箱之後才開口(都沒看,30 秒後也會說);
  // 收音機開著、真的說出口才算一件(src/story/deduce.js talk 的 cb(heard));她正在講的時候先不完成,講完了完成那一行才說得出「她說的」
  { id: 'h.s.how207', act: 2, text: '查出 207 的門怎麼開', why: '門上了電子鎖', m: 2,
    prog: (c) => [c.D.got('hc.15'), c.D.got('hc.27'), c.run.xlHow].filter(Boolean).length,
    hold: (c) => !!c.run.xlGo && !c.run.xlEnd && !!c.g.story?.radio?.hear?.(), // 小美正在講(還在排隊的時候不擋;她那一段還在排隊就完成了 → onDone 不重複那一句)
    sub: [
      { t: '仔細看 207 的門', d: '門上是電子鎖，亮著紅燈', on: got('hc.15') },
      { t: '看看附近的配電箱', d: '207 的燈接在緊急插座上', on: got('hc.27') },
      { t: '聽小美怎麼說（收音機）', d: '小美：鎖歸三樓監控室管', on: (c) => !!c.run.xlHow },
    ],
    ok: (c) => (c.run.xlHow ? ['207 的鎖歸三樓監控室管', '小美在收音機裡說的'] : ['207 裝的是大新的電子鎖', '門上的紅燈、配電箱的紙條']),
    onStart: (c) => { c.run.howT = c.g.time; },
    onDone: (c) => { c.O.flag('h.area.morgue'); c.later(1.5, () => c.talk([...(c.run.xlHow || (c.run.xlAsk && !c.run.xlEnd) ? [] : [[XL, '大新的無線電說，\n207 的鎖歸三樓監控室管。', 3.4]]), [XL, '要開那扇門，三樓得先有電。', 2.8], [XL, '地下室的配電盤，\n少了三支保險絲。', 3.4]])); },
    hints: { xl: (c) => (!c.D.got('hc.15') ? '那扇門……你靠近一點看。\n門上有一個紅燈。' : !c.D.got('hc.27') ? '門邊那個配電箱，\n你看過了嗎？' : '大新的無線電說過，\n207 的鎖歸三樓管。'),
      ama: '紅色的插頭不要拔。\n阿嬤把燈接在那裡。', glint: (c) => (!c.D.got('hc.15') ? door207At(c) : c.at('h.look.panel2f')) } },
  // 三支保險絲:清單先指向停電通知;讀到紙條才寫出地點(拿到的那一支一定列出來);提示比較早來,照缺的那一支說
  { id: 'h.s.fuses', act: 3, text: '到地下室找保險絲', why: '三樓沒電，207 的鎖打不開', skip: (c) => c.O.has('h.207.elock'), prog: (c) => (c.X.flags.has('h.gen.on') ? 3 : Math.min(3, c.run.fuses)), m: 3, hk: 0.55,
    sub: fuseSub, ask: fuseAsk, ok: ['三支保險絲都找到了', '拿去鍋爐房的配電盤裝上'], skipOk: ['207 的電子鎖已經開了', '保險絲和密碼都不用找了'],
    hints: { xl: (c) => { if (!FUSE.some((f) => f.know(c))) return '鍋爐房的配電盤旁邊，\n貼著一張停電通知。'; const f = fuseNext(c); return f ? (typeof f.xl === 'function' ? f.xl(c) : f.xl) : null; },
      ama: (c) => (fuseNext(c)?.k === 'morgue' ? '冷的那邊……三、一、五。照順序。' : '地上……亮亮的那個。'), glint: fuseGlint } },
  { id: 'h.s.gen', act: 3, text: '把保險絲裝回配電盤（鍋爐房）', why: '讓三樓監控室有電', skip: (c) => c.O.has('h.207.elock'), cond: (c) => c.X.flags.has('h.gen.on'), ok: ['配電盤修好了', '三樓和監控室有電了'], skipOk: ['207 的電子鎖已經開了', '保險絲和密碼都不用找了'],
    onDone: (c) => { c.O.flag('h.gen.on'); c.O.flag('h.pwr.monitor'); c.O.flag('h.area.3f'); c.later(2, () => c.talk([[XL, '燈回來了，三樓也有電了。', 3.2], [XL, '監控室要刷卡。\n大新的人身上有。', 3.0]])); },
    hints: { xl: '保險絲有了。\n配電盤在鍋爐房。', ama: '電……要再接起來。', glint: (c) => c.at('h.ix.fusebox') } },
  { id: 'h.s.code', act: 3, text: '查出 207 的密碼', why: '是那個病人住進來的日子', onStart: (c) => c.later(9, () => { if (c.O.step() === 'h.s.code' && !c.g.story?.busy?.()) c.talk([[XL, '大新的人說，監控室的鍵盤要密碼。', 3.4], [XL, '……那一床的病人，是哪一天來的？', 2.8]]); }), skip: (c) => c.O.has('h.207.elock'), prog: (c) => (c.X.flags.has('h.code.known') || c.X.flags.has('h.his.0924') ? 2 : [c.D.got('hc.10'), c.D.got('hc.07'), c.D.got('hc.25') || c.X.flags.has('h.ks.921')].filter(Boolean).length), m: 2, // h.code.known:以前聖筊過,你記得密碼(src/story/deduce.js);h.his.0924:[w6] 自己在病歷電腦輸入 0924,電腦說是 207 的入院日 = 查到了
    sub: (c) => (c.X.flags.has('h.code.known') ? [{ t: '', d: '你記得密碼：她住進來的那一天', on: () => true }] : [
      { t: '病歷電腦裡的 207', d: '病歷：1999/09/24 住進來', on: got('hc.10') },
      { t: '阿嬤的值班日記', d: '日記第一行：1999/9/24', on: got('hc.07') },
      { t: '記得那一天的人', d: (c) => (c.D.got('hc.25') ? '小美：那天是中秋節' : '金水伯：921 那年揹她下山'), on: (c) => c.D.got('hc.25') || c.X.flags.has('h.ks.921') },
    ]),
    ok: (c) => (c.X.flags.has('h.code.known') ? ['你記得 207 的密碼', '上一次，阿嬤告訴過你'] : ['密碼是她住進來那一天', '1999 年 9 月 24 日']), skipOk: ['207 的電子鎖已經開了', '保險絲和密碼都不用找了'],
    hints: { xl: '密碼是一個日子。\n207 的病人，哪一天住進來的？', ama: '是她住進來的那一天。', glint: (c) => c.at('h.ix.terminal') } },
  { id: 'h.s.badge', act: 3, text: '拿到監控室的門禁卡', why: '在夜班組長身上（第 5 波）', onStart: (c) => c.later(5, () => { if (c.O.step() === 'h.s.badge' && !c.g.story?.busy?.()) c.talk([[XL, '監控室要刷卡。', 1.8], [XL, '卡在大新的夜班組長身上。\n第五波，他會出來。', 3.6]]); }), skip: (c) => c.O.has('h.207.elock'), cond: (c) => c.X.inv.has('card.security') || c.O.has('h.badge'),
    ok: ['拿到門禁卡了', '夜班組長身上掉下來的'], skipOk: ['207 的電子鎖已經開了', '門禁卡也用不到了'],
    onDone: (c) => c.O.flag('h.badge'),
    hints: { xl: '卡在大新的夜班組長身上。\n第五波，他會出來。\n等的時候，先填筆記本。', ama: '在巡房的那個人……身上有卡。' } },
  { id: 'h.s.deduce', act: 4, text: '填好筆記本（J）', why: '弄清楚封院第 7 晚的事', prog: (c) => (c.D.solved() ? QUESTION.m : c.D.filled()), m: QUESTION.m, skip: (c) => c.O.has('h.207.elock') || c.O.has('h.207.unlock'),
    ok: ['筆記本填好了', '去阿嬤的照片前問她'], skipOk: ['207 的電子鎖開了', '筆記本可以慢慢填'],
    hints: { deduce: 'fill' } },
  // 一句一筊(NARRATIVE N5;src/story/deduce.js):一次問一句,招魂燈熄的時候才能問,一次燈熄問一次;三句都聖筊 = 電子鎖開
  { id: 'h.s.throw', act: 4, text: '到阿嬤的照片前擲筊', why: '一次問一句，燈熄的時候才能問', prog: (c) => (c.D.okCount ? c.D.okCount() : c.D.solved() ? 3 : 0), m: 3, skip: (c) => c.O.has('h.207.elock') || c.O.has('h.207.unlock'),
    ok: ['三句都聖筊了', '阿嬤答應了'], skipOk: ['207 的電子鎖開了', '不用再擲筊了'],
    hints: { deduce: 'throw', glint: (c) => c.at('h.ix.memorial') } },
  // 207 兩道鎖:電子鎖(鍵盤 0924 或聖筊)+ 門內的旋鈕(頭七那一夜阿嬤回來轉開);兩道都開了,門自己推開(src/story/climax.js)
  { id: 'h.s.unlock', act: 4, text: '打開 207', why: (c) => (c.O.has('h.207.elock') ? '門從裡面鎖著，等阿嬤回來' : '電子鎖＋門裡的旋鈕'), prog: (c) => (c.O.has('h.207.unlock') ? 2 : (c.O.has('h.207.elock') ? 1 : 0) + (c.O.has('h.207.knob') ? 1 : 0)), m: 2,
    sub: [{ t: '門外的電子鎖', d: '電子鎖開了', on: (c) => c.O.has('h.207.elock') || c.O.has('h.207.unlock') }, { t: '門裡的旋鈕', d: '門裡的旋鈕轉開了', on: (c) => c.O.has('h.207.knob') || c.O.has('h.207.unlock') }],
    ok: ['207 的門開了', '兩道鎖都開了'],
    hints: { xl: (c) => (c.O.has('h.207.elock') ? '門是從裡面鎖的。\n只有裡面的人開得了。我們等。' : '輸入密碼，或去照片前擲筊。\n三句都聖筊，電子鎖也會開。'),
      ama: (c) => (c.O.has('h.207.elock') ? '等阿嬤回來。' : '是她住進來的那一天。'), glint: (c) => (c.O.has('h.207.elock') ? null : c.at('h.ix.keypad')) } },
  { id: 'h.s.boss', act: 4, text: '守住 207', why: '劉家豪要回來關上那扇門', cond: (c) => c.O.has('h.boss10'), ok: ['守住 207 了', '那一波撐過去了'] }, // 「守住 207」那一波(src/story/climax.js)
  { id: 'h.s.enter', act: 4, text: '進 207', why: '阿嬤在枕頭裡留了東西給你', cond: (c) => c.zone === 'f2_ward_207' && (c.D.got('hc.30') || (c.run.in207 = (c.run.in207 || 0) + 0.25) > 1.5), ok: ['你走進 207 了', ''], // 要真的走進 207
    onDone: (c) => c.page(),
    hints: { xl: '頭七那天的腳印……停在床邊。', ama: '枕頭……阿嬤放在枕頭裡。', glint: (c) => c.at('h.ix.pillow') } },
  // 終章由你按下去(NARRATIVE N8):拿起任何一支電話(或店門口的對講機)叫金水伯的車 → 急診車道 → 守一波(佇列清完或約 60 秒)
  // 「為什麼」寫出離你最近的那一支電話在哪(路徑距離;src/interact/kinds/phones.js nearestPhone)
  { id: 'h.s.wait', act: 5, text: '叫金水伯的車', why: (c) => { if (!c.O.has('h.callok')) return '先把這一夜的事聽完'; const n = c.phoneNear(); return n ? `拿起任何一支電話；最近的在${n.where}` : '拿起任何一支電話，或店門口的對講機'; }, cond: (c) => c.O.has('h.truck'),
    ok: ['金水伯的車要來了', '他說到急診車道等'], hk: 0.6,
    hints: { xl: (c) => (c.O.has('h.callok') ? '金水伯在外面等你叫他。\n拿起電話，他聽得到。' : null), glint: (c) => (c.O.has('h.callok') ? c.phoneNear()?.at || null : null) } }, // 王醫師的電話(如果有)先講完,才可以叫車
  { id: 'h.s.bay', act: 5, text: '到一樓急診車道', why: '金水伯的車在那裡', cond: (c) => c.zone === 'f1_ambulance', onDone: (c) => c.g.story?.climax?.startFinalWave?.(), ok: ['到急診車道了', '撐到金水伯倒車進來'],
    hints: { xl: '金水伯的車在急診車道。\n倒車燈亮著，快！' } },
  { id: 'h.s.hold', act: 5, text: '守住急診車道', why: '金水伯在倒車，等你上車', prog: (c) => (c.g.story?.climax?.finalDone?.() ? 60 : Math.min(60, Math.floor(c.run.holdT))), m: 60,
    onDone: (c) => c.evac() },
];
const BY = Object.fromEntries(STEPS.map((s) => [s.id, s]));

export function installObjectives(game) {
  const subs = new Map();
  const emit = (ev, d) => { for (const fn of subs.get(ev) || []) { try { fn(d); } catch (e) { console.warn('[objectives]', ev, e); } } };
  const fresh = () => ({ done: new Set(), flags: new Set(), cur: STEPS[0].id, t: 0, stuck: 0, prog: '', tier: 0, fuses: 0, holdT: 0, xlHow: false, xlAsk: false, xlEnd: false, xlGo: false, howT: null, fx: {}, card: false, lastPh: null, evac: false, glint: null, glintT: 0, sentQ: new Map(), bcastT: 0 });
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
    // 離你最近、走得到的電話(路徑距離;src/interact/kinds/phones.js);{ where:'2F 走廊（護理站電話）', at:{x,y,z} } 或 null
    phoneNear() { const n = X()?.nearestPhone?.({ ic: true }); return n ? { where: n.where, at: n.at } : null; },
    near(x, y, z, r) { const p = game.player.pos; return Math.abs(p.y - y) < 2.2 && Math.hypot(p.x - x, p.z - z) < r; },
    at(id, unused) { const e = X()?.get?.(id); if (!e || (unused && (e.used || e.n > 0))) return null; const q = X().where(e); return { x: q.x, y: q.y, z: q.z }; },
    talk: (lines, cb, o) => D()?.talk?.(lines, cb, asking ? { ...o, ask: true } : o), // asking:玩家按 Q 問的(ask)
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
      const go = () => { O.flag('h.callok'); const n = c.phoneNear(); if (n) O.glintAt(n.at, 12); later(1.2, () => { if (run.cur === 'h.s.wait' && !game.story?.busy?.()) c.talk([[XL, '金水伯在外面。\n……你自己叫他。', 3.2], [XL, '拿起電話，他聽得到。', 2.4]]); }); };
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
  const met = (s) => { try { if (s.hold?.(c)) return false; if (s.prog) return progOf(s) >= s.m; return !!s.cond?.(c); } catch (e) { console.warn('[objectives]', s.id, e); return false; } };
  // 完成 / 跳過的那一行(目標列先亮「✓ 做到了什麼｜怎麼知道的」)
  const okOf = (s, skipped) => { try { const v = skipped ? s.skipOk : s.ok; const r = typeof v === 'function' ? v(c) : v; return Array.isArray(r) && r[0] ? r : null; } catch { return null; } };
  const tellOk = (s, skipped) => { const r = s && okOf(s, skipped); if (r) hud.ok(r[0], r[1], skipped ? '·' : '✓'); };
  function complete(id, by) {
    const s = BY[id];
    if (!s || run.done.has(id)) return;
    run.done.add(id);
    emit('done', { id, by });
    tellOk(s, false);
    try { s.onDone?.(c); } catch (e) { console.warn('[objectives] onDone', id, e); }
    advance();
  }
  function advance() {
    let i = STEPS.findIndex((s) => !run.done.has(s.id)), sk = null, skMet = null;
    while (i >= 0 && STEPS[i].skip?.(c)) { const q = STEPS[i]; if (met(q)) skMet = q; else sk ||= q; run.done.add(q.id); i = STEPS.findIndex((s) => !run.done.has(s.id)); } // 例:用密碼開了 207,推理與擲筊就不再擋路
    if (skMet) tellOk(skMet, false); else if (sk) tellOk(sk, true); // 跳過也說一聲(其中有一步其實做到了,例:三句聖筊 → 說「三句都聖筊了」)
    const next = i < 0 ? 'h.done' : STEPS[i].id;
    if (next !== run.cur) setCur(next);
    if (isHost()) broadcast();
  }
  function setCur(id) {
    const prev = run.cur;
    run.cur = id; run.stuck = 0; run.tier = 0; run.prog = ''; run.glint = null;
    try { game.ui?.map?.poi?.('xl.ask', null); } catch { /* 地圖還沒建好 */ } // 小美畫的記號:換步驟就擦掉
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
      for (const d of m.d || []) if (!run.done.has(d)) { if (d === run.cur) tellOk(BY[d], !met(BY[d]) && !!BY[d]?.skip?.(c)); run.done.add(d); emit('done', { id: d, by: 'host' }); try { BY[d]?.onDone?.(c); } catch { /* 略 */ } }
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
    if (tier === 1 && xl) {
      const Rd = game.story?.radio;
      // [w6] 收音機關著、壞了:小美的提示聽不到 → 提醒可以按 Q 問(壞了也能拍一拍)
      if (Rd?.kind && !Rd.hear?.()) game.ui?.feed?.(Rd.dead ? '卡住了？按 [Q] 拍一拍收音機，問小美' : '卡住了？按 [Q] 舉起收音機，問小美', { color: '#d9b28a', ms: 7000 });
      c.talk([[XL, xl, Math.max(3, xl.length / 4.5 + 0.6)]], null, { hint: true });
      return true;
    }
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
  // 筆記本的提示:
  //   上一次擲筊那一句不對(笑筊/陰筊)→ 說是第幾句、該重看哪一張卡;第三級打開筆記本指向那張卡(簡單難度才圈出格子)
  //   還有空格 → 哪一類的詞還缺、哪張卡會有;第三級把那一格圈起來
  //   一句填好了 → 去照片前問(燈熄的時候)
  function deduceHint(kind, tier, s) {
    const Dd = D(); if (!Dd) return false;
    const st = Dd.state(), B = QUESTION.blanks, keys = Object.keys(B), SENT = Dd.SENT || [keys], NUM = Dd.NUM || [];
    const sts = Dd.sentences?.() || [], last = st.last;
    const wi = last && last.result !== 'sheng' && Number.isInteger(last.i) && !sts[last.i]?.ok ? last.i : -1;
    if (wi >= 0) { // 上一次問的那一句不對(不說是哪一格)
      const wrongs = SENT[wi].filter((k) => st.fill[k] !== B[k].answer);
      if (wrongs.length) {
        const card = Dd.cards().find((q) => (q.sup || []).some((x) => wrongs.includes(x))) || null, k = NUM[wi] || '';
        if (tier === 1) c.talk([[XL, card ? `第${k}句……怪怪的。\n你再看一次〈${card.title}〉。` : `第${k}句……怪怪的。再想想。`, 3.6]]);
        else if (tier === 2) c.ama(`第${k}句……不是這樣。`);
        else if (diff() === 'easy' || !card) { Dd.hintBlank = wrongs[0]; if (Dd.isOpen) Dd.open(); }
        else { Dd.hintCard = card.id; if (Dd.isOpen) { Dd.close(false); Dd.open(); } }
        return true;
      }
    }
    const b = keys.find((k) => !st.fill[k]);
    if (b && (kind === 'fill' || !Dd.ready?.())) {
      const cat = B[b].cat, have = new Set(Dd.words());
      const card = CARDS.find((q) => !Dd.has(q.id) && (q.words || []).some((w) => WORDS[w]?.cat === cat && !have.has(w)));
      // [w7] 缺的詞在哪一張還沒找到的卡上:說出地點(第三級標在地圖上);詞都有了 = 只是還沒填
      const need = (id) => (CARD[id]?.words || []).some((w) => WORDS[w]?.cat === cat && !have.has(w));
      const ms = Dd.missing?.() || [], m = ms.find((x) => need(x.id) && x.pos && !x.locked) || ms.find((x) => need(x.id) && !x.locked) || ms.find((x) => need(x.id)) || null;
      const i = keys.indexOf(b) + 1;
      if (tier === 1) c.talk([[XL, `筆記本第 ${i} 格還空著，\n缺的是「${CATS[cat]}」。`, 3.6], ...(m ? clueSay(m) : [[XL, '那個詞你已經有了。\n按 J，填進去看看。', 3.2]])], null, { hint: true });
      else if (tier === 2) c.ama(card ? `「${CATS[cat]}」……〈${card.title}〉裡面有。` : `第 ${i} 格……想想阿嬤說過的話。`);
      else { Dd.hintBlank = b; if (m?.pos) Dd.mark?.(m.id); if (Dd.isOpen) Dd.open(); }
      return true;
    }
    // 有一句可以問了:去照片前(燈熄的時候)
    if (tier === 1) c.talk([[XL, '填好一句，就去問阿嬤。\n二樓護理站，她的照片前面。', 3.6]], null, { hint: true });
    else if (tier >= 3) { const p = s.hints.glint?.(c); if (p) { run.glint = p; run.glintT = 14; } }
    return true;
  }

  // ---------- [w6] 問小美:按 Q 舉起收音機(壞了就拍一拍;src/story/radio.js R.ask)----------
  // 第一次問:說這一步的提示(沒有提示的步驟就把目標再說一次);再問:同一句再加「地圖上畫了記號」,
  // 那個東西閃一下、地圖(M)上圈起來(換步驟就擦掉)。剛問過 6 秒內不再回答。回傳 false = 這次沒有回答
  let asking = false;
  // [w7] 線索在哪裡,小美的說法(一行最多 18 字):「2F 走廊，\n護理站的板夾……」
  const clueSay = (m) => [[XL, m.label ? `${m.label}，` : '我聽大新的人說過，', 1.8], [XL, `${m.how}。\n……去看看。`, Math.max(2.8, m.how.length / 4.5 + 1)]];
  // 等的步驟(等下一波、等頭七、等首領):問小美就順便指一個還沒找到的線索(第二次問標在地圖上)
  const WAIT = new Set(['h.s.cyc1', 'h.s.badge', 'h.s.boss', 'h.s.unlock', 'h.s.shop']);
  function clueNext() { const ms = D()?.missing?.() || []; return ms.find((x) => x.pos && !x.ev && !x.locked) || null; }
  function ask() {
    const s = BY[run.cur], t = game.time || 0;
    if (!s || game.state !== 'playing' || game.story?.ending?.active || t - (run.askT ?? -99) < 6) return false;
    run.askT = t;
    if (run.askId !== s.id) { run.askId = s.id; run.askN = 0; }
    const n = ++run.askN, h = s.hints || {}, v = (x) => { try { return typeof x === 'function' ? x(c) : x; } catch { return null; } };
    emit('hint', { id: s.id, tier: n >= 2 ? 3 : 1, ask: true });
    run.tier = Math.max(run.tier, 1); // 自動提示的第一級不用再講一次
    asking = true;
    try {
      if (h.deduce) { deduceHint(h.deduce, 1, s); if (n >= 2) deduceHint(h.deduce, 3, s); return true; }
      const A = s.ask ? (() => { try { return s.ask(c, n); } catch (e) { console.warn('[objectives] ask', s.id, e); return null; } })() : null; // 這一步自己的問答(例:保險絲直接說下一支在哪)
      const lines = [], xl = A ? A.xl : v(h.xl), p = n >= 2 ? (A ? A.glint : h.glint ? v(h.glint) : null) : null;
      if (xl) lines.push([XL, xl, Math.max(3, xl.length / 4.5 + 0.6)]);
      else { lines.push([XL, `${s.text}。`, 2.6]); const why = whyOf(s); if (why) lines.push([XL, `${why}。`, 2.8]); }
      if (p) {
        run.glint = p; run.glintT = 16;
        const map = game.ui?.map, li = map?._levelOf?.(game, p.y) ?? 0;
        map?.poi?.('xl.ask', { x: p.x, z: p.z, level: li, label: '小美說在這裡', always: true, red: true });
        lines.push([XL, '我在地圖上畫了記號，\n按 M 看。', 3.2]);
      } else if (n >= 2 && !xl) lines.push([XL, '……我也只知道這些。', 2.4]);
      // [w7] 等的時候,去找線索:說一個最近的;第二次問就標在地圖上
      const cm = WAIT.has(s.id) || !xl ? clueNext() : null;
      if (cm && !p) {
        lines.push([XL, /等的時候/.test(xl || '') ? '還有，線索也還沒找齊。' : '等的時候，先去找線索。', 2.6], ...clueSay(cm));
        if (n >= 2 && D()?.mark?.(cm.id, { quiet: true })) lines.push([XL, '我在地圖上畫了記號，\n按 M 看。', 3.2]);
      }
      c.talk(lines, null, { hint: true });
      return true;
    } finally { asking = false; }
  }
  O.ask = game.objectives.ask = ask;

  // ---------- HUD:目前的目標(細、淡、一行) ----------
  // 目標列:「目標｜為什麼」(CLARITY_PLAN §7.1);為什麼可以是函式(例:207 的電子鎖開了沒)
  const whyOf = (s) => { try { return typeof s.why === 'function' ? s.why(c) : s.why || ''; } catch { return ''; } };
  // 小項:[{ text, ok }](還沒做 = t;做到了 = d)
  const subOf = (s) => {
    try {
      const list = typeof s.sub === 'function' ? s.sub(c) : s.sub;
      if (!list?.length) return null;
      return list.map((q) => { const ok = !!q.on(c), d = typeof q.d === 'function' ? q.d(c) : q.d; return { text: ok ? d || q.t : q.t, ok }; }).filter((q) => q.text);
    } catch { return null; }
  };
  const hud = makeHud(game, () => { const s = BY[run.cur]; if (!s) return ''; const n = progOf(s); return [s.prog ? `${s.text}（${n}／${s.m}）` : s.text, whyOf(s), subOf(s)]; });
  O.line = () => { const s = BY[run.cur]; if (!s) return null; const n = progOf(s); return { goal: s.prog ? `${s.text}（${n}／${s.m}）` : s.text, why: whyOf(s) }; }; // 給筆記本〈到目前為止〉的「下一步」
  game.objectives.line = O.line;

  // ---------- 每幀(互動系統的 tick;只在遊戲中、沒暫停) ----------
  const X0 = X();
  if (X0) {
    X0.on('reset', () => { fxStop(); run = fresh(); hud.clearOk(); setCur(STEPS[0].id); });
    // 太平間的冰櫃拉錯了:小美提醒一次(還沒讀到順序 → 去看白板;讀過了 → 直接說順序)
    X0.on('flag', (k) => {
      if (k !== 'h.morgue.wrong' || run.cur !== 'h.s.fuses' || run.mWrong) return;
      run.mWrong = true;
      const known = read(c, 'h.s02', 'h.s03');
      later(2.2, () => c.talk([[XL, known ? '……順序不對。\n三號、一號，最後才是五號。' : '……拉錯了。\n白板上應該寫了順序。', 3.4]], null, { hint: true }));
    });
    X0.on('item', (id, n, d) => { if (id === 'fuse' && d > 0) run.fuses++; });
    X0.on('unlock', (w) => { const nm = w.lock?.door === 'f3_corridor' ? '三樓的門禁「嗶」了一聲，鎖開了。' : w.lock?.door === 'b1_morgue' ? '地下室傳來「喀」的一聲：太平間的門鎖開了。' : null; if (nm && !run['u' + w.lock.door]) { run['u' + w.lock.door] = true; game.ui?.feed?.(nm, { color: '#e3c98a', ms: 6000 }); } });
    let acc = 0;
    X0.tick((dt) => {
      bindNet();
      if (game.state !== 'playing') return true;
      for (const id in READ_FAR) { const e = X0.get(id), v = READ_FAR[id]; if (e && e.reach < v[0]) { e.reach = v[0]; e.losPad = v[1]; } } // 看得到、手搆不到的劇情紙(只放寬互動距離)
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
      if (pr !== run.prog) { run.prog = pr; run.stuck = 0; run.tier = 0; }
      hud.set(run.cur, false); // 目標列 + 小項(沒變就不動 DOM)
      if (run.cur === 'h.s.how207') howTick();
      if (run.cur === 'h.s.fuses') fuseTick(step); else if (run.fxOn) fxStop();
      if (met(s)) {
        if (isHost()) complete(s.id, 'self');
        else if (game.net?.send && (game.time - (run.sentQ.get(s.id) || -9)) > 3) { run.sentQ.set(s.id, game.time); try { game.net.send('objq', s.id); } catch { /* 略 */ } }
      } else if (isHost() && s.skip?.(c)) { advance(); return true; } // 例:聖筊先開了電子鎖 → 配電、門禁卡、密碼都不用了(先看這一步是不是自己做到了,才算跳過)
      else if (s.hints && !game.story?.busy?.()) {
        run.stuck += step;
        const T0 = HINT_T[diff()] || HINT_T.normal, k = s.hk || 1, T = k === 1 ? T0 : (run.hT ||= {})[s.id] ||= T0.map((t) => t * k); // hk:這一步的提示提早
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

  // ---------- 查出 207 的門怎麼開:小美開口的時機 ----------
  // 你看了 207 的門(hc.15)或配電箱(hc.27)→ 2.5 秒後小美說她偷聽到的;都沒看,30 秒後也會說。真的說出口(收音機開著)才算一件;
  // 沒聽到:25 秒後再說一次。完成那一行會寫「小美在收音機裡說的」,所以這一步不會在你不知道的時候自己跳走
  function howTick() {
    const Dd = D();
    if (!Dd || run.xlAsk || run.xlHow || run.done.has('h.s.how207')) return;
    run.howT ??= game.time;
    const door = Dd.got('hc.15'), box = Dd.got('hc.27');
    if (!door && !box && game.time - run.howT < 30) return;
    if (game.story?.busy?.()) return;
    run.xlAsk = true; run.xlEnd = false; run.xlGo = false;
    const first = door ? '門上那個紅燈，是大新的電子鎖。' : box ? '207 的門上，裝的是大新的電子鎖。' : '207 的門上，大新裝了電子鎖。';
    const lines = [[XL, first, 3.0], [XL, '他們的無線電，我偷聽了三個禮拜。', 3.2], [XL, '207 的鎖，\n歸三樓監控室管。', 3.2]];
    const parts = lines.reduce((n, l) => n + String(l[1]).split('\n').length, 0);
    later(door || box ? 2.5 : 0, () => {
      if (run.cur !== 'h.s.how207') { run.xlEnd = true; return; }
      c.talk(lines, (heard) => {
        run.xlEnd = true;
        if ((heard || 0) >= parts) { run.xlHow = true; return; }
        later(25, () => { if (run.cur === 'h.s.how207' && !run.xlHow) run.xlAsk = false; }); // 沒聽到(收音機關著):過一陣子再說
      }, { onStart: () => { run.xlGo = true; } });
    });
  }

  // ---------- 找保險絲:房間裡的小線索(只在這一步、只給自己) ----------
  // 進到還有保險絲的房間:靠近那支保險絲的燈管閃一下、「喀」一聲(既有燈具的 ov,不新增燈);洗衣房那支很小,燈管附近有嗡嗡的電流聲;
  // 走到 4.5 m 內、看得到(而且你讀過紙條,或已經卡了一陣子)→ 它反光閃一下;鍋爐房還沒看停電通知 → 小美提一句;太平間還沒讀到順序 → 小美叫你先看白板
  const fxStop = () => { try { sfx.loopStop?.('fuse.hum'); } catch { /* 略 */ } run.fxOn = false; run.fxHum = null; };
  function flicker(f) {
    if (!f || f.ov !== 1 || f.state === 2) return;
    const t0 = game.time;
    try { ixs.switchClick?.({ x: f.x, y: f.y, z: f.z }, false); } catch { /* 略 */ }
    X()?.tick?.(() => { const u = game.time - t0; if (u > 1.1 || game.state !== 'playing') { f.ov = 1; return false; } f.ov = u < 0.25 ? 0.15 : u < 0.4 ? 1 : u < 0.55 ? 0.3 : u < 0.8 ? (Math.random() < 0.5 ? 0.2 : 1) : 1; return true; });
  }
  function fuseTick() {
    const z = c.zone, fx = run.fx, p = game.player.pos;
    const api = X()?.map?.api;
    let hum = null;
    for (const f of FUSE) {
      if (f.zone !== z || f.got(c)) continue;
      const q = c.at(f.k === 'morgue' ? 'h.ix.morgue:5' : f.id);
      if (!q) continue;
      const key = f.k;
      // 進房間:燈管閃一下(之後在房間裡每 40 秒一次)
      if (!fx[key] || game.time - fx[key] > 40) {
        fx[key] = game.time;
        let best = null, bd = 9;
        for (const L of api?.fixtures?.(z) || []) { const d = Math.hypot(L.x - q.x, L.z - q.z); if (d < bd) { bd = d; best = L; } }
        later(fx[key + 'In'] ? 0.2 : 1.2, () => flicker(best));
        fx[key + 'In'] = true;
        if (f.k === 'laundry' && best) { hum = best; fx.humF = best; }
        if (f.k === 'boiler' && !read(c, 'h.s12', 'h.s02') && !fx.boilerSaid) { fx.boilerSaid = true; later(2.5, () => c.talk([[XL, '配電盤旁邊，\n好像貼著一張停電通知。', 3.2]], null, { hint: true })); }
        if (f.k === 'morgue' && !f.order(c) && !fx.morgueSaid) { fx.morgueSaid = true; later(2.5, () => c.talk([[XL, '先別亂拉冰櫃。\n上面那塊白板，你看一下。', 3.4]], null, { hint: true })); }
      } else if (f.k === 'laundry') hum = fx.humF || null;
      // 很近、看得到:反光閃一下(讀過紙條,或卡了一陣子)
      const T0 = (HINT_T[diff()] || HINT_T.normal)[0] * 0.55;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > 8) fx[key + 'G'] = false;
      else if (d < 4.5 && !fx[key + 'G'] && (f.know(c) || run.stuck > T0) && Math.abs(q.y - p.y - 0.8) < 2.4 && (game.world?.hasLineOfSight?.(p.x, p.y + 1.6, p.z, q.x, q.y + 0.05, q.z) ?? true)) {
        fx[key + 'G'] = true;
        const g = f.k === 'morgue' ? (f.order(c) ? c.at('h.ix.morgue:3') : c.at('h.ix.morgueboard')) : q;
        if (g && run.glintT <= 0) { run.glint = { x: g.x, y: g.y + (f.k === 'laundry' ? 0.12 : 0), z: g.z }; run.glintT = 6; } // 地上的那支:光點抬高一點(視線不要擦到地板)
      }
    }
    if (hum !== run.fxHum) { // 洗衣房:那支保險絲旁邊的燈管嗡嗡作響(定位的循環音,走近才建立)
      try { if (hum) sfx.loopStart?.('fuse.hum', 'neon', { x: hum.x, y: hum.y, z: hum.z }); else sfx.loopStop?.('fuse.hum'); } catch { /* 略 */ }
      run.fxHum = hum;
    }
    run.fxOn = true;
  }
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
  S.callOut = () => run.cur === 'h.s.wait' && O.has('h.callok') && !run.called; // 叫車那一步:拿起電話是撥號音(打出去),不代接別支在響的(src/interact/kinds/phones.js)
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

// 目標列 + 小項清單 + 完成的那一行 + 「閃一下」的小光點(都是 DOM,不新增 shader)
//  set(id, fresh):照目前的步驟重畫(沒變就不動 DOM);完成的那一行還亮著的時候先記著,等它播完再換
//  ok(main, sub, mark):目標列先亮「✓ main｜sub」約 3 秒(排隊,一次一行)
function makeHud(game, textOf) {
  const hud = game.ui?.hudEl || document.body;
  const el = document.createElement('div');
  el.className = 'hd ob-line';
  el.innerHTML = '<i></i><span></span><small></small>';
  hud.appendChild(el);
  const sp = el.querySelector('span'), sw = el.querySelector('small');
  const ul = document.createElement('ul');
  ul.className = 'hd ob-sub';
  hud.appendChild(ul);
  const gl = document.createElement('div');
  gl.className = 'hd ob-glint';
  hud.appendChild(gl);
  const _v = new THREE.Vector3();
  let last = '', lastSub = '', glOn = false, glT = 0, okQ = [], okOn = false, okT = 0, pend = false, prevOk = new Set(), dimmed = false;
  const replay = (node, cls) => { node.classList.remove(cls); requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add(cls))); }; // 隔兩幀再加回(不在更新裡強迫排版)
  const H = {
    set(id, fresh) {
      if (okOn) { pend = pend || !!fresh; return; } // 完成的那一行還在:等它播完
      const v = textOf(), t = Array.isArray(v) ? v[0] : v, w = Array.isArray(v) ? v[1] || '' : '', items = (Array.isArray(v) && v[2]) || [];
      el.classList.toggle('hide', !t);
      const k = t + '｜' + w;
      if (k !== last || fresh) {
        last = k;
        if (fresh && t) { replay(el, 'new'); try { ixs.paper?.(); } catch { /* 略 */ } }
        sp.textContent = t;
        sw.textContent = w ? '｜' + w : '';
      }
      // 小項:剛打勾的那一項亮一下
      let sk = '';
      for (const q of items) sk += (q.ok ? '1' : '0') + q.text + '\n';
      if (fresh) prevOk = new Set();
      if (sk !== lastSub) {
        lastSub = sk;
        ul.textContent = '';
        const nowOk = new Set();
        for (const q of items) {
          const li = document.createElement('li');
          li.textContent = q.text;
          if (q.ok) { li.className = 'ok'; nowOk.add(q.text); if (!fresh && !prevOk.has(q.text)) li.classList.add('flip'); }
          ul.appendChild(li);
        }
        if (fresh) replay(ul, 'new');
        prevOk = nowOk;
      }
      // 區域大標題(第一次進到一個房間)正在顯示:小項先讓開
      const zb = game.ui?.hud?.zoneBig || game.ui?.zoneBig, busy = !!zb && zb.getAnimations?.().length > 0;
      if (busy !== dimmed) { dimmed = busy; ul.classList.toggle('dim', busy); }
    },
    ok(main, sub = '', mark = '✓') {
      okQ.push([main, sub, mark]);
      if (!okOn) H._next();
    },
    _next() {
      const q = okQ.shift();
      if (!q) { okOn = false; el.classList.remove('ok'); last = ''; H.set(null, pend || true); pend = false; return; }
      okOn = true;
      el.classList.remove('hide');
      el.classList.add('ok');
      sp.textContent = `${q[2]} ${q[0]}`;
      sw.textContent = q[1] ? '｜' + q[1] : '';
      replay(el, 'new');
      try { ixs.pageTurn?.(); } catch { /* 略 */ }
      clearTimeout(okT);
      okT = setTimeout(() => H._next(), okQ.length ? 2600 : 3200);
    },
    clearOk() { okQ = []; clearTimeout(okT); okOn = false; pend = false; el.classList.remove('ok'); last = ''; lastSub = ''; },
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
  return H;
}
