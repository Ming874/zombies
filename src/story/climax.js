// 第四幕的高潮(STORY_v2 §4.6 頭七、§4.7 第 10 波破門、§2.5 王醫師;EXPERIENCE_PLAN §3.2–3.3):
//
//   207 有兩道鎖:
//     電子鎖(大新 2024 年裝的):監控室鍵盤 0924 或在遺照前擲出聖筊 → 旗標 h.207.elock
//     門內的舊旋鈕(阿嬤封院第 7 天 23:55 自己反鎖的):頭七那一夜她回來,替你轉開 → 旗標 h.207.knob
//   兩道都開了 → h.207.unlock(門的鎖照這個旗標打開)→ 門自己推開一條縫。
//   門一開 → 院內警報「207 門禁警戒」→ 第 10 次招魂燈「207 看守 207 的保全」(還沒到第 10 次就直接跳過去;單人時人數照下一波,不會一下子暴增)。
//   看守 207 的保全倒下 → 〈守燈日誌〉(hc.29)→ 下一次招魂燈熄,離你最近的電話響:王醫師(hc.20)。
//     選擇:不接 / 聽完(他的條件:「那一頁,留在 207。」)/ 中途掛斷(小美在你左耳:「掛掉。拜託,掛掉。」)。結局會記得。
//   〈第七暝〉(單人):第 7 次靜默由這裡接手 → 小美說頭七 → 等你到 207 門口(休息停著)→ 那一夜的三段回憶(第七晚 → 那支針 → 不要開門)
//     → 阿嬤回來(靈異系統的頭七幻影)→ 三句(一定播完,不管有沒有看她、在不在二樓)→ 護理鞋的腳印走回 207、停在枕頭前 → 旋鈕「喀」。
//   頭七保證:幻影出不來(玩家不在室內、找不到位置)也照樣發生(哼聲 + 同樣的三句)。多人:不停休息、不放回憶,頭七照舊由靈異系統放,三句照樣一定播。
// 多人:旗標都走 game.objectives.flag(房主說了算、同步給全隊);看守 207 的保全那一波只有房主開;頭七與電話是本機的。
import { seq, line, wait, door207 as door207Of, lamp207 } from './voice.js';
import { waveRoster } from '../game/waves.js';
import { sfx, ix as ixs, ghost } from '../audio.js';
import { LINE_BY_ID } from '../horror/lines.js';

const N7 = ['m.day7', 'm.needle', 'm.lock']; // 〈第七暝〉那一夜(horror/memdata.js)
const LIVE7 = new Set(['lead', 'go', 'mem', 'rel', 'tq', 'beat']);

const HO = {
  id: 'ph.ho.final', who: '電話 · 王醫師', voice: 'man', ear: 'right',
  parts: [
    '你好。我是王志明。\n以前在這間醫院，大家叫我王醫師。',
    '林護理長是你阿嬤吧。\n你們長得很像。',
    // 回收「207 的家屬被等著」(太平間名單、6 號冰櫃、清理隊內線、打字機):是大新的系統「通知」你;可是叫你來的那通電話,他也不知道是誰打的
    '太平間的名單寫著「207 家屬：已通知」。\n通知你的，是我們的系統。',
    '可是那天晚上，總機只記到一通電話。\n是從 207 打出去的。',
    '……我不知道是誰打的。',
    '你剛剛打開的那扇門，\n我二十三年沒有打開過。',
    '那天晚上，我關掉二樓的燈。\n她打開檯燈，擋在床前。',
    '她說：「這間是我的病人。」',
    '針是我拿的。我拉她，針就……',
    '207 那台發電機的油錢，\n二十三年來，都是我付的。',
    '枕頭裡那一頁，請留在 207。\n燈會一直亮著。對大家都好。',
    '鬼門一關，這一切就結束了。\n你可以回家了。',
  ],
};

export function installClimax(game, S) {
  const X = game.interact, H = () => game.horror, D = () => game.deduce, O = () => game.objectives;
  const isHost = () => !game.net || !!game.net.isHost;
  const has = (k) => !!X.flags.has(k) || !!O()?.has?.(k);
  const flag = (k) => { const R = O()?.run; if (R) { if (!R.flags.has(k)) O().flag(k); } else if (!X.flags.has(k)) X.flags.set(k, true); }; // 走 objectives(房主同步給全隊)
  const fresh = () => ({ n7: null, tqLines: false, touqi: false, touqiT: 0, knobT: 0, opened: false, alarm: false, alarmPend: false, wave: 0, guard: null, guardDead: false, hoRang: false, hoState: null, hoP: null, hoT: 0, xlCut: false, elockSaid: false, logT: 0, restT0: 0 });
  let run = fresh();
  S.climax = { get run() { return run; }, startGuardWave: () => startGuardWave(true), ringHo: () => ringHo(true), startFinalWave: () => startFinalWave(), finalDone: () => !!run.final && (game.round > run.final || (game.round === run.final && game.phase !== 'fighting')) };
  S.busy = () => !!S.ending?.active || run.hoState === 'ringing' || run.hoState === 'talk' || LIVE7.has(run.n7?.ph); // 重要的戲正在演:別的對講機/提示先等
  const door207 = () => door207Of(game);
  // 燈的強度慢慢變(熄的時候閃兩下);只改 gate
  function fadeGate(f, to, secs) {
    const from = Number.isFinite(f.gate) ? f.gate : 1, t0 = game.time;
    X.tick(() => { const k = Math.min(1, (game.time - t0) / secs), fl = to < from && k < 0.5 && Math.sin(k * 40) > 0.3 ? 0.35 : 1; f.gate = (from + (to - from) * k) * fl; return k < 1; });
  }
  const p = () => game.player.pos;

  // ---------- 頭七 ----------
  H()?.on?.('story', (e) => { if (e?.id === 's3.touqi') touqiBeat(); }); // 她回來了(幻影轉身/走掉,或退路)
  H()?.on?.('memory', (e) => { const n = run.n7; if (n && e?.phase === 'end' && e.id === n.cur) { n.cur = null; n.nextT = game.time + 2.4; if (H()?.memories?.state?.played?.has(e.id)) n.i++; } });
  function touqiFallback() { // 幻影出不來:照樣發生(她不一定要被看見)
    if (run.touqi) return;
    run.touqi = true; run.knobT = game.time + 80; // 保險:三句講完就會提早
    try { sfx.folk('lament', p()); } catch { /* 略 */ }
    X.flags.set('h.touqi', true);
    const h = H(); if (h && h.quiet >= 6.5 && h.quiet < 8) h.quiet = 7.5; // 靈異系統不要再放幻影(它等 === 7;下一波開始時扶回整數)
    try { h?.storyUsed?.add?.('s3.touqi'); } catch { /* 略 */ }
    X.after(3.5, () => { seq(game, [['ama', '今天是頭七……阿嬤回來看你。', undefined, { id: 's3.touqi', many: true }]]); try { H()?.remember?.('s3.touqi', { event: 'touqi', tag: 'zheng', ghost: 'zheng' }); } catch { touqiBeat(); } });
  }
  // 頭七的三句(HOSPITAL_CLUES_v2 §3、CLARITY M5):一定播完,一次一句、中間留白;講完腳印走回 207,旋鈕才轉開
  function touqiBeat() {
    run.touqi = true;
    if (run.tqLines) return;
    run.tqLines = true;
    X.flags.set('h.touqi', true);
    if (!run.knobT) run.knobT = game.time + 80; // 保險(三句被卡住也會開)
    const T = (id) => LINE_BY_ID[id]?.text || '';
    const o = (id, gap) => ({ id, many: true, noSignal: true, ear: 'both', gap });
    seq(game, [3.4, ['ama', T('h.w.tc1'), undefined, o('h.w.tc1', 5.2)], ['ama', T('h.w.tc2'), undefined, o('h.w.tc2', 1.8)], ['ama', T('h.w.tc3'), undefined, o('h.w.tc3', 0.7)], ['ama', T('h.w.tc4'), undefined, o('h.w.tc4', 2.6)],
      () => { steps207(); run.knobT = game.time + 5.6; if (run.n7) run.n7.ph = 'beat'; }], { maxWait: 60 });
  }
  // 護理鞋的腳印:從走廊走到 207 門口,門裡一路走到枕頭前(劇情的格子,不會被隨機的腳印蓋掉;門裡那一排留到你進去)
  function steps207() {
    const w = door207(), M = H()?.marks, Lq = game.hospital?.layout;
    if (!w || !M?.foot) return false;
    const ax = w.axis || w.leaves?.[0]?.axis || 'z', dr = w.dirRoom || -1, rn = ax === 'z' ? [0, dr] : [dr, 0], tn = [-rn[1], rn[0]], y = w.y;
    const walkable = (x, z) => !Lq || (Lq.flagsAt(w.li, Math.floor(x / 2), Math.floor(z / 2)) & Lq.F.WALK) !== 0;
    const pp = p(), side = ((pp.x - w.cx) * tn[0] + (pp.z - w.cz) * tn[1]) > 0 ? -1 : 1; // 從你看不到的那一頭走過來
    let s0 = 4.6; while (s0 > 1.2 && !walkable(w.cx - rn[0] * 1.3 + tn[0] * side * s0, w.cz - rn[1] * 1.3 + tn[1] * side * s0)) s0 -= 0.6;
    const pts = [[w.cx - rn[0] * 1.3 + tn[0] * side * s0, w.cz - rn[1] * 1.3 + tn[1] * side * s0], [w.cx - rn[0] * 0.9, w.cz - rn[1] * 0.9], [w.cx + rn[0] * 0.5, w.cz + rn[1] * 0.5]];
    const pe = X.get?.('h.ix.pillow'), pq = pe ? X.where(pe) : null;
    if (pq && Math.hypot(pq.x - w.cx, pq.z - w.cz) < 9) pts.push([pq.x - rn[0] * 0.15, pq.z - rn[1] * 0.15]);
    const list = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax0, az0] = pts[k], [ax1, az1] = pts[k + 1], d = Math.hypot(ax1 - ax0, az1 - az0), yaw = Math.atan2(ax1 - ax0, az1 - az0);
      for (let u = k ? 0.62 : 0; u < d - 0.2; u += 0.62) list.push({ x: ax0 + (ax1 - ax0) * u / d, z: az0 + (az1 - az0) * u / d, yaw, inside: k >= 2 });
    }
    list.forEach((q, i) => X.after(i * 0.42, () => { try { M.foot(q.x, y, q.z, q.yaw, i % 2 === 0, { keep: true, life: q.inside ? 1500 : 240, alpha: 0.62 }); if (!q.inside) ghost.wetStep?.({ x: q.x, y: y + 0.05, z: q.z }, 0.55); } catch { /* 略 */ } }));
    run.steps = list.length;
    return true;
  }
  // 人在 207 門口(同一層、r 公尺內)
  function near207(r) { const w = door207(), q = p(); return !!w && Math.abs(q.y - w.y) < 2.2 && Math.hypot(q.x - w.cx, q.z - w.cz) < r; }
  // 那一夜沒演到(頭七那次你一直沒到門口):之後任何一次休息,走到 207 門口就接著演(一段一段,不用等 100 秒)
  function lateNight() {
    const n = run.n7, h = H(), Mm = h?.memories, Dr = h?.director;
    if (!Mm || !Dr?.silent || Dr.chasing || Mm.state.cur || n.cur || game.time < (n.nextT || 0)) return;
    while (n.i < N7.length && Mm.state.played.has(N7[n.i])) n.i++;
    if (n.i >= N7.length) { n.ph = 'done'; return; }
    if (!near207(n.i ? 9 : 6) || game.zombies.some((z) => z.alive && (z.dist ?? 99) < 16)) return;
    if (Mm.play(N7[n.i], { force: true })) n.cur = N7[n.i]; else n.i++;
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
      X.after(2.5, () => seq(game, [['xl', '電子鎖的紅燈熄了。\n……可是門把轉不動。', 3.4], ['xl', '旋鈕在門裡面。\n有人從裡面鎖著。', 3.2]]));
      X.after(12, () => seq(game, [['ama', '等阿嬤回來。', undefined, { ear: 'left' }]]));
    }
  }
  function alarm() {
    run.alarm = true;
    flag('h.207.open');
    const w = door207(), q = w ? { x: w.cx, y: w.y + 2.6, z: w.cz } : null;
    try { ixs.alarmStart?.('h207', q || p()); X.after(9, () => ixs.alarmStop?.('h207')); } catch { /* 略 */ }
    seq(game, [0.8, ['pa', '207 警報。207 警報。', 5], ['pa', '保全人員，請到二樓。', 3], ['xl', '……你開了那扇門。\n整棟樓都在響。', 3.2, { combatOk: true }], ['xl', '大新的無線電在叫一個名字。', 3, { combatOk: true }], ['xl', '劉家豪。\n他在那扇門口，坐了三年。', 3.4, { combatOk: true }]]); // 廣播說廣播的,小美說她從無線電聽到的(REDESIGN §7)
    if (!isHost()) return;
    if (game.phase === 'fighting') run.alarmPend = true; // 這一波打完再來
    else X.after(9, () => startGuardWave());
  }
  function startGuardWave(force) {
    if (run.wave && !force) return;
    if (!isHost() || game.state !== 'playing') return;
    const r0 = game.round || 1, N = Math.max(10, r0 + 1);
    run.wave = N; run.alarmPend = false; run.waveT = game.time;
    try { if (game.shopUIOpen) game.closeShop?.(); } catch { /* 略 */ }
    game.startRound(N);
    // 「守住 207」(NARRATIVE N2):劉家豪不從一般的出生點出來 —— 他從二樓北走廊的另一頭走回 207 門口,要把門關回去;走廊的燈一陣一陣熄
    // 單人:直接跳到第 10 次,但人數照「下兩波」(不會一下子暴增)
    const q = (!game.net && N > r0 + 2 ? waveRoster(Math.min(N, r0 + 2)) : game.queue.slice()).filter((t) => t !== 'brute');
    game.queue = q; game.toSpawn = q.length + 1; // +1 = 劉家豪(自己放,不在佇列裡)
    X.after(4.5, () => spawnGuard());
    run.dim = { t: 6, on: false, list: null };
    X.after(3.8, () => game.ui?.banner?.('看守 207 的保全　劉家豪', '他要回去關上那扇門 · 守住 207', 4200, 'red'));
  }
  // 劉家豪出現在二樓北走廊離你遠的那一頭(看不到的地方),朝 207 走過來;找不到位置就照一般出生點
  function spawnGuard() {
    if (run.guard || !isHost() || game.state !== 'playing' || game.round !== run.wave) return;
    const w = door207(), Lq = game.hospital?.layout, pp = p();
    let at = null;
    if (w && Lq) {
      const walkable = (x, z) => (Lq.flagsAt(w.li, Math.floor(x / 2), Math.floor(z / 2)) & Lq.F.WALK) !== 0;
      const ax = w.axis || 'z', dr = w.dirRoom || -1, rn = ax === 'z' ? [0, dr] : [dr, 0], tn = [-rn[1], rn[0]];
      const cand = [];
      for (const sd of [1, -1]) for (const d of [16, 13, 10, 8]) { const x = w.cx - rn[0] * 1.4 + tn[0] * sd * d, z = w.cz - rn[1] * 1.4 + tn[1] * sd * d; if (walkable(x, z)) { cand.push({ x, z, d: Math.hypot(x - pp.x, z - pp.z) + (Math.abs(pp.y - w.y) > 2 ? 0 : 0) }); break; } }
      cand.sort((a, b) => b.d - a.d);
      if (cand[0] && (Math.abs(pp.y - w.y) > 2 || cand[0].d > 7)) at = { x: cand[0].x, y: w.y, z: cand[0].z };
    }
    let z = null;
    try { if (at) game._ambAt = at; z = game.spawnZombie?.('brute'); } catch (e) { console.warn('[climax] guard', e); } finally { game._ambAt = null; }
    if (!z) { game.queue.splice(0, 0, 'brute'); return; } // 退路:照一般出生點
    run.guard = z; z._guard = true; run.guardAt = at;
  }
  // 劉家豪那一波:207 附近二樓的燈一陣一陣熄掉(只改 gate;207 的檯燈不動)
  function dimTick(step) {
    const d = run.dim; if (!d) return;
    const w = door207();
    if (!d.list) { const F = game.hospital?.lights?.fixtures || [], lamp = lamp207(game); d.list = w ? F.filter((f) => f !== lamp && !f.prop && f.li === w.li && f.gate > 0 && !/exit|emergency/.test(f.kind) && Math.hypot(f.x - w.cx, f.z - w.cz) < 22) : []; d.g0 = d.list.map((f) => f.gate); }
    const end = !(game.round === run.wave && game.phase === 'fighting');
    if (end) { d.list.forEach((f, i) => { f.gate = d.g0[i]; }); run.dim = null; return; }
    d.t -= step;
    if (d.t > 0) return;
    d.on = !d.on; d.t = d.on ? 2.6 : 7 + Math.random() * 5;
    if (d.on) { try { ghost.breaker?.({ x: w.cx, y: w.y + 2.6, z: w.cz }); } catch { /* 略 */ } }
    d.list.forEach((f, i) => X.after(d.on ? i * 0.05 : 0.1 + i * 0.03, () => { if (run.dim === d) f.gate = d.on ? 0.04 * d.g0[i] : d.g0[i]; }));
  }
  // 夜班組長倒下:門禁卡掉在他身上,走過去撿(每位玩家各自撿;互動系統的一個點,不新增模型)
  function dropBadge(z) {
    if (run.badgeDrop || X.inv.has('card.security')) return;
    const q = { x: z.pos.x, y: z.pos.y + 0.35, z: z.pos.z };
    run.badgeDrop = X.register(q, { id: 'h.ix.badge.drop', kind: 'item', name: '門禁卡', reach: 2.2, radius: 0.4, priority: 6, scope: 'run', once: true, prompt: '撿起門禁卡（夜班組長的）',
      onUse: () => { X.inv.add('card.security'); game.ui?.pickup?.('門禁卡', '#e8d9a8', { sub: '大新照護中心 · 夜班組長 陳建宏' }); try { sfx.pickupItem?.(q); } catch { /* 略 */ } run.badgeDrop?.remove?.(); return true; } });
    O()?.glintAt?.(q, 16);
    X.after(1.2, () => game.ui?.feed?.('夜班組長倒下了。他胸前的口袋裡，有一張門禁卡。', { color: '#e3c98a', ms: 6500 }));
  }
  // 終章:你叫了金水伯的車,在急診車道守一波(照 startGuardWave 的做法開;佇列清完或約 60 秒就算撐過去)
  function startFinalWave() {
    if (run.final || !isHost() || game.state !== 'playing') return;
    const r0 = game.round || 1;
    if (game.phase === 'fighting') { run.final = r0; return; } // 正在打:這一波就是最後一波
    try { if (game.shopUIOpen) game.closeShop?.(); } catch { /* 略 */ }
    run.final = r0 + 1;
    game.startRound(r0 + 1);
    X.after(2.6, () => game.ui?.banner?.('最後一波', '金水伯在倒車 · 守住急診車道', 4200, 'red'));
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
    const parts = HO.parts.flatMap((t) => (/^枕頭裡那一頁/.test(t) && D()?.got?.('hc.30') ? ['你拿了那一頁。\n……她的字，一直都很工整。', '請不要打開它。\n燈會一直亮著。對大家都好。'] : [t])); // 已經拿了:他知道(監視器);[w7] 他要你不要看(結局裡打不打開那一頁,是你選的)
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
    X.after(T * 0.48, () => { if (P.state === 'call' && run.hoState === 'talk') { run.xlCut = true; seq(game, [['xl', '……他在跟你講話，對不對？\n掛掉。拜託，掛掉。', undefined, { ear: 'left' }]]); } });
  });

  // ---------- 每幀 ----------
  X.on('reset', () => { try { ixs.alarmStop?.('h207'); } catch { /* 略 */ } if (run.dim?.list) run.dim.list.forEach((f, i) => { f.gate = run.dim.g0[i]; }); try { run.badgeDrop?.remove?.(); } catch { /* 略 */ } run = fresh(); });
  O()?.on?.('flag', (f) => { if (f.name === 'h.boss10' && f.v) onBoss10(); });
  let acc = 0;
  X.tick((dt) => {
    if (game.state !== 'playing') return true;
    acc += dt;
    if (acc < 0.25) return true;
    const step = acc; acc = 0;
    const h = H(), Dr = h?.director, silent = game.phase !== 'fighting';
    // 〈第七暝〉(單人):第 7 次靜默一開始,靈異系統把 h.quiet 加到 7;先擋在 6.5(它等 === 7 才放頭七幻影),演完那一夜再放
    if (h && !game.net && h.quiet === 7 && !run.n7 && !run.touqi && Dr?.silent && (Dr.roundT || 0) < 7.5) { run.n7 = { ph: 'lead', t0: game.time, i: 0, cur: null, nextT: 0, away: 0 }; h.quiet = 6.5; }
    if (h && !silent && h.quiet % 1) { h.quiet = Math.floor(h.quiet); if (run.n7 && run.n7.ph !== 'beat' && run.n7.ph !== 'done' && !run.touqi) run.n7 = null; } // 被下一波打斷(按了開始):下一次休息再來
    const n7 = run.n7, live7 = LIVE7.has(n7?.ph);
    // 頭七之前:小美先感覺到(在 207 門口:叫你站著;不在:叫你過去)
    if (!run.lead && h && (n7 || h.quiet >= 7) && Dr?.silent && !run.touqi && (Dr.roundT || 0) > 2.5) {
      run.lead = true;
      const at = near207(7);
      seq(game, [['xl', '第七次燈熄了。', 2.2], ['xl', '老人家說，人走了以後第七天，', 3], ['xl', '會回家看一眼。這叫頭七。', 2.8], ['xl', '……收音機好安靜。', 2.2], at ? ['xl', '不要走開，站著就好。', 2.6] : ['xl', '二樓北邊，207 門口。\n好像有人在那裡等你。', 4.2]]); // 她不認識阿嬤:這是她的推論(REDESIGN §7)
      if (n7) n7.ph = 'go';
    }
    if (n7 && live7) {
      const dt7 = game.time - n7.t0, Mm = h?.memories;
      if (game.phase === 'shop' && Number.isFinite(game.restT) && dt7 < 300) game.restT = Math.max(game.restT, 12); // 休息停著(最多 5 分鐘)
      if (!Mm?.state?.cur) { try { Dr?.hold?.(3); } catch { /* 略 */ } } // 這一夜不放別的驚嚇
      if (n7.ph === 'go') {
        const w = door207();
        if (w && dt7 > 24 && !n7.glint) { n7.glint = true; O()?.glintAt?.({ x: w.cx, y: w.y + 1.4, z: w.cz }, 14); }
        if (near207(6.5) && !h.whispers?.busy) { n7.ph = 'mem'; n7.nextT = game.time + 1.2; }
        else if (dt7 > 150 || !Mm) { n7.late = true; n7.ph = 'rel'; n7.relT = game.time; } // 一直沒來:先讓她回來,那一夜之後在門口補演
      } else if (n7.ph === 'mem') {
        while (n7.i < N7.length && Mm.state.played.has(N7[n7.i]) && n7.cur !== N7[n7.i]) n7.i++;
        if (n7.i >= N7.length) { n7.ph = 'rel'; n7.relT = game.time + 2.2; }
        else if (!n7.cur && !Mm.state.cur && game.time >= n7.nextT) {
          const id = N7[n7.i], q = Mm.where(id), m = Mm.list.find((x) => x.id === id), pp = p();
          const ok = q && Math.abs(pp.y - q.y) < 2.2 && Math.hypot(pp.x - q.x, pp.z - q.z) < (m?.r || 5.5) + 5;
          if (ok) { n7.away = 0; if (Mm.play(id, { force: true })) n7.cur = id; else n7.i++; }
          else if ((n7.away += step) > 80) { n7.late = true; n7.ph = 'rel'; n7.relT = game.time; }
        }
      } else if (n7.ph === 'rel' && game.time >= n7.relT) { n7.ph = 'tq'; n7.tqT = game.time; if (h.quiet % 1) h.quiet = 7; } // 放靈異系統的頭七幻影
      else if (n7.ph === 'tq' && !run.touqi && game.time - n7.tqT > 7) touqiFallback(); // 幻影出不來
    }
    if (n7 && n7.ph === 'beat' && has('h.207.knob')) n7.ph = n7.late ? 'late' : 'done';
    if (n7?.ph === 'late') lateNight(); // 那一夜還沒演:之後在 207 門口補
    // 頭七(多人,或單人沒有接手時):第 7 次靜默,幻影出不來 → 退路
    if (!n7 && !run.touqi && h && h.quiet >= 7 && Dr?.silent && (Dr.roundT || 0) > 14 && !h.memories?.state?.cur) touqiFallback();
    if (run.touqi && run.knobT && game.time >= run.knobT) { run.knobT = 0; knob(); }
    // 有人在配電盤上把 207 的迴路關掉(苦結局「熄燈」是玩家自己的選擇):小美會冷,阿嬤只說一句
    const lit = X.flags.get('h.pwr.207') !== false;
    if (run.lit !== undefined && run.lit && !lit && !run.offSaid) { run.offSaid = true; X.after(2, () => seq(game, [['xl', '……二樓有一盞燈熄了。', 2.4], ['xl', '我突然好冷。\n……你那邊也是嗎？', 3.2]])); X.after(9, () => seq(game, [['ama', '燈……不要關。她怕黑。', undefined, { ear: 'right' }]])); }
    run.lit = lit;
    // 迴路關了,207 的檯燈(也就是後巷看到的那扇窗)真的熄掉:只改強度(gate);有守燈系統(game.story.lamp)時由它管
    if (!game.story?.lamp && lit !== run.litG && !S.ending?.active) { const f = lamp207(game); if (f) { run.litG = lit; fadeGate(f, lit ? 1 : 0, lit ? 0.6 : 1.4); } }
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
      if (z) { run.lead5 = true; run.boss5 = z; X.after(3, () => game.ui?.banner?.('大新夜班組長　陳建宏', '他以前是這裡的看護 · 門禁卡在他身上', 3800, 'red')); X.after(4.5, () => seq(game, [['xl', '大新的無線電說過，', 2.0, { combatOk: true, gap: 0.4 }], ['xl', '門禁卡在夜班組長身上。', 2.6, { combatOk: true, gap: 3 }], ['xl', '他以前是這裡的看護。', 2.4, { combatOk: true }], ['xl', '最早被打針的，就是他們。', 2.8, { combatOk: true }]])); } // 先讓「巨屍出現」的打法提示講完
    }
    if (run.boss5 && !run.boss5.alive && !run.badgeDrop) dropBadge(run.boss5);
    // 看守 207 的保全:自己放的那一隻(退路:那一波第一隻巨屍)
    if (run.dim) dimTick(step);
    if (run.wave && isHost()) {
      if (!run.guard && game.round === run.wave && game.time > (run.waveT || 0) + 8) { const z = game.zombies.find((q) => q.alive && q.type === 'brute'); if (z) { run.guard = z; z._guard = true; } }
      if (run.guard && !run.guard.alive && !run.guardDead) guardDown();
      if (!run.guardDead && game.round === run.wave && silent) guardDown(); // 沒抓到(或被別的方式解決):那一波結束就算
    }
    // 王醫師:看守 207 的保全倒下之後的下一次靜默
    if (has('h.boss10') && !run.hoRang && !has('h.evac') && !has('h.truck') && !game.story?.ending?.active && silent && game.phase === 'shop' && (Dr?.roundT ?? 9) > 5 && !h?.memories?.state?.cur && !game.net?.pvp) ringHo();
    if (run.hoState === 'ringing' && run.hoP && run.hoP.state === 'idle' && game.time - run.hoT > 2) { run.hoState = 'ignored'; flag('h.ho.ignored'); X.after(2, () => seq(game, [['xl', '……不接也好。', undefined, {}]])); }
    if (run.hoState === 'talk' && run.hoP && run.hoP._ended && run.hoP.state === 'call') { // 他說完了(聽筒還在耳邊)
      run.hoState = 'heard'; flag('h.ho.heard'); D()?.addCard?.('hc.20', { by: 'call' });
      X.after(2.2, () => seq(game, [['xl', '……我都聽到了。', 2.2], ['xl', D()?.got?.('hc.30') ? '他知道你拿了。\n……要不要看，你自己決定。' : '他要你把那一頁留下來。\n……你自己決定。', 3.6]]));
    }
    if (run.hoState === 'talk' && run.hoP) {
      if (run.hoP.state !== 'call') { // 掛了
        const heard = !!run.hoP._ended || game.time >= run.hoEnd + 6;
        run.hoState = heard ? 'heard' : 'hung';
        flag(heard ? 'h.ho.heard' : 'h.ho.hung');
        if (heard) D()?.addCard?.('hc.20', { by: 'call' });
        X.after(1.6, () => (heard ? seq(game, [['xl', '……我都聽到了。', 2.2], ['xl', '他要你把那一頁留下來。\n……你自己決定。', 3.6]]) : seq(game, [['xl', '……掛得好。', 1.8], ['xl', '我在這邊幫你拍手。\n你沒聽到而已。', 3]])));
      }
    }
    void step;
    return true;
  });
  void wait;
  return S.climax;
}
