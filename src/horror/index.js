// 靈異系統入口:game.horror —— 驚嚇導演、耳邊低語、幻影、靈異事件、寒氣、牆上的字。
// 全部是本機效果:多人時每位玩家各自一套導演與亂數,所以隊友聽到/看到的不一樣(刻意的:「你剛剛有聽到嗎?」)。
// 不送任何網路訊息、不影響殭屍或傷害;對戰模式只留背景(耳語、聲音)。設定「驚嚇強度」關閉時,只有玩家自己觸發的(接電話)會出聲。
//
// 公開介面(給 interact / story / ambush 代理):
//   game.horror.whisper(lineId | text, { ear, subtitle, filter, priority, pos, mode }) → handle | null
//   game.horror.remember(id, { event, tag, ghost, card, text }) / seen(tag?, within = 300) → 最近一筆
//                                                    第三輪:靈異事件的劇情回報都記在這裡(tag:zheng 看到阿嬤 | dark 停電 | taboo 禁忌 | self 你是誰 | clue 線索);
//                                                    有 card 就 game.objectives?.clue?.(card);發 'story' 事件;電話用 need.seen 引用
//   game.horror.memory(id, { force }) / memories.state      第四輪「回憶」:走到 2003 年封院發生過事情的地方,滑進那一段(memdata.js)
//   game.horror.phoneCall(ctx) → script | null          接起電話:依玩家身邊的場景組一通電話(見 calls.js;互動代理呼叫)
//   game.horror.phone({ pos, id, ringing }) → handle     (舊)接起電話:隨機一句電話台詞
//   game.horror.radio({ pos, id }) → handle              收音機開了(收音機濾波,在收音機的位置)
//   game.horror.event(kind, { force }) → bool            立刻觸發一個靈異事件(見 director.KINDS);force 略過導演節奏
//   game.horror.apparition(kind, opts) → bool            figure | window | child | nurse | behind | curtain | mirror | counter
//   game.horror.flicker(pos, dur) / chill(k, dur) / silence(dur)
//   game.horror.on(ev, fn) → off                         'whisper' 'phone:ring' 'phone:answer' 'radio:on' 'scare' 'apparition:vanish'
//   game.horror.director.request(kind, { weight, pos }) / notify(kind)   (見 director.js)
//   game.horror.ringing → { pos, anchor, until } | null  正在響的電話(interact 可以讓玩家接起來)
//   game.horror.stats()
import * as THREE from 'three';
import { Director, KINDS as DK } from './director.js';
import { settings } from '../ui/settings.js';
import { ghost } from '../audio.js';
import { Whispers } from './whisper.js';
import { GhostSubs } from './subs.js';
import { Apparitions, models } from './ghosts.js';
import { Marks } from './marks.js';
import { ColdFx } from './fx.js';
import { paranormalKinds } from './paranormal.js';
import { scareKinds } from './scares.js';
import { createCalls } from './calls.js';
import { hauntKinds, HauntFx } from './haunts.js';
import { createMemories } from './memories.js';
import { LINES, CAPTIONS } from './lines.js';
import { precompile as warmCompile, initPrograms } from '../sys/warmup.js';

// 導演挑事件用的清單:由 director.KINDS 的 tier / w 產生(外部種類、劇情通稱、來電、訊號閃燈不在裡面)
const CATALOG = { small: [], medium: [], big: [] };
for (const [k, v] of Object.entries(DK)) if (v.w && !v.ext && CATALOG[v.tier]) CATALOG[v.tier].push([k, v.w]);
const APPARITION = new Set(['figure', 'window', 'child', 'nurse', 'behind', 'curtain', 'mirror', 'counter', 'peripheral', 'creeper', 'flashFlick', 'reflection']);
const BIAS = {
  corridor: { figure: 2, nurse: 2, lightsDie: 1.8, footprints: 1.4, child: 1.3, pace: 1.8, knockFollow: 1.3, runBehind: 1.4, peripheral: 1.5, flashFlick: 1.8, creeper: 1.5, doorSlamSeq: 2, gurneyPass: 1.5, doorOpen: 1.2,
    corridorOut: 2.2, darkFollow: 1.8, shadowPass: 1.5, beamFigure: 1.4, nameCall: 1.3, doorBurst: 1.3, ballRoll: 1.2 },
  ward: { curtain: 2.5, nurse: 1.3, mirror: 1.5, handprints: 1.3, nurseCall: 2, reflection: 1.6, doorClose: 1.3, throw: 1.3, breathBehind: 1.2,
    curtainDraw: 2.4, flatline: 1.6, windowFog: 1.4, windowFace: 1.3, swingBulb: 1.2, shoulderTap: 1.2 },
  nursery: { lullaby: 4, child: 2.5, handprints: 1.5, ballRoll: 2 }, peds_ward: { lullaby: 3, child: 2, ballRoll: 2.5 }, playroom: { lullaby: 3, child: 2.5, ballRoll: 3 },
  morgue: { coldBreath: 2.5, crawl: 1.5, silence: 1.5, anchor: 1.5, rollcall: 3, breathBehind: 1.5 }, autopsy: { coldBreath: 2, crawl: 1.4 }, psych_cell: { doorCreep: 2.5, behind: 1.5, cellKnock: 3, doorBurst: 2.5 }, stairwell: { doorCreep: 2.5, crawl: 1.3, pace: 1.4, doorClose: 1.5, runBehind: 1.2, whistle: 1.6, nameCall: 1.5 },
  tunnel: { crawl: 2, silence: 1.5, footprints: 1.5, pace: 1.6, creeper: 1.4 }, chapel: { anchor: 2, silence: 1.5, breathBehind: 1.4, redEnvelope: 2 }, rehab: { mirror: 3, reflection: 1.5, mirrorRush: 2.5 }, waiting: { tvFace: 2, phoneRing: 1.5, paHijack: 1.6, windowFace: 1.5, windowFog: 1.6, radio1999: 1.5 }, lobby: { elevator: 1.5, figure: 1.3, paHijack: 2.5, windowFog: 1.5, redEnvelope: 1.4 }, psych: { cellKnock: 2, knockFollow: 1.5, doorBurst: 1.8 },
  monitor: { tvFace: 3 }, security: { tvFace: 3 }, icu: { tvFace: 1.5, coldBreath: 1.4, flatline: 3 }, outdoor: { corridorOut: 0, darkFollow: 0, swingBulb: 0, curtainDraw: 0, shadowPass: 0, windowFog: 0, windowFace: 0, doorBurst: 0, ballRoll: 0, beamFigure: 0.6, frostEdge: 1.2, whistle: 1.4, nameCall: 1.2, window: 0, crawl: 0, figure: 0.6, writing: 0, footprints: 0, doorCreep: 0, pace: 0, knockFollow: 0, doorOpen: 0, doorClose: 0, doorSlamSeq: 0, gurneyPass: 0, nurseCall: 0, rollcall: 0, reflection: 0, cellKnock: 0, runBehind: 0.5, creeper: 0.5, blackoutChange: 0 },
};
// 地圖上的驚嚇點:在這些區域、這一局還沒發生過時,這些種類權重 ×3、恐懼門檻 ×0.7;發生一次就用掉
const HOTSPOTS = [
  { zone: 'b1_morgue', kinds: ['rollcall', 'coldBreath'] }, { zone: 'f2_nursery', kinds: ['lullaby', 'ballRoll'] }, { zone: 'f2_playroom', kinds: ['lullaby', 'anchor', 'ballRoll'] },
  { zone: 'f2_ward_207', kinds: ['swingBulb', 'beamFigure', 'frostEdge'] }, { theme: 'icu', kinds: ['flatline', 'curtainDraw'] }, { zone: 'b1_tunnel', kinds: ['corridorOut', 'darkFollow'] },
  { theme: 'psych_cell', kinds: ['cellKnock'] }, { zone: 'f3_corridor', kinds: ['cellKnock', 'creeper', 'knockFollow'] }, { zone: 'f1_lobby', kinds: ['paHijack', 'elevator'] },
  { zone: 'f1_rehab', kinds: ['mirror', 'reflection', 'mirrorRush'] }, { zone: 'f3_monitor', kinds: ['tvFace'] }, { zone: 'f1_security', kinds: ['tvFace'] },
  { zone: 'f2_corridor', kinds: ['nurse', 'pace', 'nurseCall', 'doorSlamSeq', 'corridorOut', 'shadowPass'] }, { zone: 'f1_corridor', kinds: ['doorSlamSeq', 'flashFlick', 'figure', 'darkFollow', 'nameCall'] },
  { zone: 'b1_tunnel', kinds: ['pace', 'crawl', 'creeper'] }, { theme: 'stairwell', kinds: ['doorClose', 'runBehind'] }, { zone: 'f1_chapel', kinds: ['breathBehind', 'anchor', 'redEnvelope', 'whistle'] },
  { theme: 'ward', kinds: ['curtain', 'reflection', 'nurseCall', 'throw'] }, { zone: 'f2_icu', kinds: ['tvFace', 'coldBreath', 'flatline'] }, { zone: 'f1_waiting', kinds: ['paHijack', 'tvFace', 'windowFace', 'radio1999'] },
  { zone: 'f1_parking', kinds: ['radioOn'] }, { zone: 'f1_cemetery', kinds: ['whisper', 'figure'] }, { zone: 'f3_dorm', kinds: ['knockFollow', 'circle'] }, { zone: 'b1_archive', kinds: ['writing', 'breathBehind'] },
];
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export function installHorror(game) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nohorror')) return null; // 除錯:?nohorror 關掉整個靈異系統(比較效能用)
  const subs = {};
  const later = []; // [時間, fn](遊戲時間)
  const watchers = [];
  const H = {
    game, settings,
    director: null, whispers: null, subs: new GhostSubs(), app: null, marks: null, fx: null,
    ringing: null, usedWrit: new Set(), coldK: 0, coldT: 0, coldUntil: 0, known: new Set(),
    // 玩家認出某個鬼之後(讀到能認出他的文件),字幕改顯示名字(劇情代理呼叫;GHOSTS 的 id)
    reveal(id) { H.known.add(id); },
    on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); },
    emit(ev, d) { const s = subs[ev]; if (s) for (const fn of s) { try { fn(d); } catch (e) { console.warn('[horror]', ev, e); } } },
    after(sec, fn) { later.push([game.time + sec, fn]); },
    watch(fn) { watchers.push(fn); }, // 每幀呼叫,回傳 false 就移除
    v3: (o) => _a.set(o.x, o.y, o.z), v3b: (x, y, z) => _b.set(x, y, z),
    get intensity() { return H.director.level; },
    get events() { return game.hospital?.events || null; },
    // ---- 耳語 ----
    whisper(line, o = {}) { return H.whispers.say(line, { priority: 6, ...o }); },
    phone(o = {}) {
      const ringing = H.ringing && game.time < H.ringing.until;
      const first = ringing && !H.whispers.used.has('ph.1') ? 'ph.1' : null;
      const l = first || H.whispers.pick('phone', { round: game.round, phase: game.phase }) || 'ph.5';
      H.ringing = null;
      const h = H.whispers.say(l, { filter: 'phone', ear: 'right', priority: 9, force: true });
      H.emit('phone:answer', { id: o.id ?? null, line: h?.id ?? null });
      return h;
    },
    phoneCall(ctx = {}) { return H.calls ? H.calls.phoneCall(ctx) : null; },
    radio(o = {}) {
      const l = H.whispers.pick('radio', { round: game.round, phase: game.phase }) || 'rd.1';
      return H.whispers.say(l, { filter: 'radio', pos: o.pos, ear: o.pos ? 'world' : 'near', priority: o.auto ? 5 : 8, force: !o.auto });
    },
    // 事件字幕(數數的人)
    caption(kind, n = 1, tail) {
      const C = CAPTIONS[kind];
      if (!C) return;
      const text = C.count.slice(0, n).join('……') + (tail === 'end' ? C.tailEnd : tail === 'near' ? C.tailNear : C.tail);
      H.subs.show({ text, cap: true, tag: C.who, hold: 2, lead: 0.6 });
    },
    // ---- 事件 ----
    event(kind, o = {}) {
      if (kind === 'whisper') return !!ambientWhisper(true);
      const E = H.events;
      if (!E) return false;
      if (!o.force && !H.director.request(kind, o)) return false;
      const r = E.fire(kind, o);
      if (r) { H.director.notify(kind, { ...o, dur: DK[kind]?.tier === 'big' ? 12 : undefined }); H.emit('event', { kind }); }
      return !!r;
    },
    apparition(kind, o = {}) { return APPARITION.has(kind) ? H.event(kind, { force: true, ...o }) : false; },
    flicker(pos, dur = 0.8) {
      const F = H.events?.fixtures;
      if (!F || !pos) return false;
      let best = null, bd = 36;
      for (const f of F) { if (f.state === 2 || f.prop || !f.shape) continue; const q = (f.x - pos.x) ** 2 + (f.z - pos.z) ** 2 + ((f.y - (pos.y ?? f.y)) * 2) ** 2; if (q < bd) { bd = q; best = f; } }
      if (!best) return false;
      H.events.S.active.push({ type: 'storm', f: best, t0: game.time, t1: game.time + dur, burn: false });
      return true;
    },
    chill(k = 0.8, dur = 15) { H.coldT = Math.max(H.coldT, k); H.coldUntil = Math.max(H.coldUntil, game.time + dur); },
    silence(dur = 4) { ghost.silence(dur); },
    // ---- 每幀 ----
    update(dt) {
      ghost.track();
      H.subs.update();
      if (game.state !== 'playing') { if (H._st === 'playing') H.resetRun(); H._st = game.state; return; }
      if (H._st !== 'playing') { H._st = 'playing'; H.resetRun(); }
      const paused = (game.paused || game.shopUIOpen) && !game.net;
      // 寒氣(結霜 + 呼氣)
      const tgt = game.time < H.coldUntil ? H.coldT : 0;
      H.coldK += (tgt - H.coldK) * Math.min(1, dt * (tgt > H.coldK ? 0.9 : 0.35));
      if (tgt === 0 && H.coldK < 0.01) { H.coldK = 0; H.coldT = 0; }
      H.subs.frost(H.coldK * (settings.get('hurtFx') === false ? 0.5 : 1));
      if (paused) return;
      H.fx?.update(dt, game, H.coldK);
      H.marks?.update(dt);
      H.app?.update(dt, game);
      H.memories?.update(dt);
      for (let i = later.length - 1; i >= 0; i--) if (game.time >= later[i][0]) { const fn = later[i][1]; later.splice(i, 1); try { fn(); } catch (e) { console.warn('[horror]', e); } }
      for (let i = watchers.length - 1; i >= 0; i--) { let keep = false; try { keep = watchers[i](dt); } catch (e) { console.warn('[horror]', e); } if (!keep) watchers.splice(i, 1); }
      if (H.ringing && game.time > H.ringing.until) H.ringing = null;
      H.director.update(dt, game);
      tick(dt);
    },
    resetRun() {
      H.director.reset(); H.whispers.reset(); H.app?.clear(); H.marks?.clear(); H.fx?.clear();
      later.length = 0; watchers.length = 0; H.usedWrit.clear(); H.ringing = null; H.coldK = H.coldT = 0; H.coldUntil = 0;
      H.calls?.reset(); T.spots.clear(); H._pace = false;
      H.memories?.reset(); H.hfx?.reset(); H.seenLog.length = 0; H.storyUsed.clear(); H.quiet = 0; T.touqi = false; T.quietPh = null;
      T.zones.clear(); T.props.clear(); T.still = 0; T.streak = 0; T.lastKill = 0; T.zonePend = null; T.next = 0;
      for (const d of H.events?.doors || []) d.primed = false;
      if (performance.now() > 40000) models.warm();
    },
    // main.js warmRuntime 呼叫:每種靈異材質一個代表物件(加進暖機群組 → 預編譯 + 離屏畫一次)
    warmObjects() { H.warmIn = true; return warmSet(H); },
    // ---- 第三輪:劇情記憶(靈異事件揭露了什麼;之後的電話/台詞引用) ----
    seenLog: [], storyUsed: new Set(), quiet: 0,
    remember(id, o = {}) {
      const e = { id, t: game.time, zone: zoneOf()?.id || null, event: o.event || null, tag: o.tag || null, ghost: o.ghost || null, card: o.card || null, text: o.text || null };
      H.seenLog.push(e); if (H.seenLog.length > 60) H.seenLog.shift();
      game.flags?.set?.('h.seen.' + id, true);
      if (e.card) { game.deduce?.addCard?.(e.card); game.objectives?.clue?.(e.card, { by: o.event === 'memory' ? 'memory' : 'ghost' }); }
      H.emit('story', e);
      return e;
    },
    lastSeen(tag, within = 300) {
      for (let i = H.seenLog.length - 1; i >= 0; i--) { const e = H.seenLog[i]; if (game.time - e.t > within) return null; if (!tag || e.tag === tag || e.ghost === tag || e.id === tag || e.event === tag) return e; }
      return null;
    },
    seen(tag, within) { return H.lastSeen(tag, within); },
    memory(id, o = {}) { return H.memories?.play(id, o) ?? null; },
    stats() { return { ...H.director.stats(), whispers: H.whispers.count, wlog: H.whispers.log.slice(-8), apparitions: H.app?.count ?? 0, alog: H.app?.log.slice(-8) ?? [], active: H.app?.active ?? 0, models: models.state, events: H.events?.S.log.slice(-10) ?? [], cold: +H.coldK.toFixed(2) }; },
  };
  H.director = new Director(H);
  H.whispers = new Whispers(H);
  H.calls = createCalls(H);
  game.horror = H;

  // ---- 場景相關(灰盒地圖沒有 hospital.events 時只剩耳語) ----
  const E = game.hospital?.events;
  if (E && E.register) {
    H.app = new Apparitions(H, game.scene);
    H.marks = new Marks(H, game.scene);
    H.fx = new ColdFx(game.scene);
    H.hfx = new HauntFx(H, game.scene);
    E.register(paranormalKinds(H));
    E.register(scareKinds(H)); // 第二輪驚嚇庫(src/horror/scares.js)
    H.memories = createMemories(H); // 第四輪:回憶
    E.register(hauntKinds(H)); // 第三輪:更多靈異事件、走廊熄燈、大跳嚇,每個都有劇情回報(src/horror/haunts.js)
    E.auto = false; // 驚嚇導演接手排程
    try { H.marks.placeStatic(game.hospital.K, game.hospital.layout); } catch (e) { console.warn('[horror] 牆上字跡', e); }
  }
  // 選單期間就開始在背景準備幻影模型;等 main.js 的開機預編譯做完(畫質、光源數都定了)再預編譯靈異材質(不卡第一次出現)
  // 靈異材質由 main.js 的暖機(warmRuntime → H.warmObjects())一起預編譯,hz:warm 之後 shader 數量不再增加;
  // 幻影模型(背景 Worker 建模 + 閒置烘焙,不新增 shader)等 hz:warm 之後才開始,不跟暖機搶 CPU。
  // 主程式沒有叫 warmObjects(舊版/測試頁)時,30 秒後自己預編譯當退路
  { const t0 = performance.now(); const wait = () => { const warm = performance.getEntriesByName('hz:warm').length; if (warm || performance.now() - t0 > 30000) { models.warm(); if (!H.warmIn) precompile(game, H); } else setTimeout(wait, 400); }; setTimeout(wait, 1000); }

  // ---- 觸發器與排程 ----
  const T = { spots: new Set(), zones: new Set(), props: new Set(), still: 0, streak: 0, lastKill: 0, zonePend: null, next: 0, acc: 0, low: -1e9, dark: -1e9, strk: -1e9, prop: -1e9, warn: -1e9, guide: -1e9, sig: -1e9 };
  const zoneOf = () => game.hospital?.zone || null;
  const say = (l, o) => { if (!l) return null; const r = H.whispers.say(l, { priority: 5, ...o }); if (r) H.director.notify('whisper'); return r; };
  function ambientWhisper(force) {
    const l = H.whispers.pick('idle', { round: game.round, phase: game.phase, zone: zoneOf() });
    if (!l) return null;
    if (!force && !H.director.request('whisper')) return null;
    return say(l, { priority: 3 });
  }
  function tick(dt) {
    const D = H.director;
    if (D.level === 'off') return;
    T.acc += dt;
    if (T.acc < 0.25) return; // 4 Hz
    const step = T.acc; T.acc = 0;
    const p = game.player, zone = zoneOf(), round = game.round, phase = game.phase;
    const c = { zone, round, phase };
    // 第一次進入某區:那一區的低語(戰鬥中延後,最多等 25 秒)
    if (zone && !T.zones.has(zone.id)) { T.zones.add(zone.id); const l = H.whispers.pick('zone', c); if (l) T.zonePend = { l, at: game.time + 1.2 + Math.random() * 1.8, until: game.time + 90, zone: zone.id }; }
    if (T.zonePend && zone && zone.id !== T.zonePend.zone && game.time > T.zonePend.at + 20) T.zonePend = null; // 走遠了就算了
    if (T.zonePend && game.time >= T.zonePend.at) {
      if (game.time > T.zonePend.until) T.zonePend = null;
      else if (D.silent && D.tension < 0.45 && !H.whispers.busy && D.request('whisper', { force: true })) { say(T.zonePend.l, { priority: 5 }); T.zonePend = null; }
    }
    H.memories?.tick(); // 回憶:走到地點就滑進去
    // 靜默期計數;頭七:第 7 次靜默期,她回來(STORY v2;一局一次)
    if (D.silent && T.quietPh !== true) { T.quietPh = true; H.quiet++; } else if (!D.silent) T.quietPh = false;
    if (H.quiet === 7 && !T.touqi && D.silent && D.roundT > 8 && game.time - (T.touqiTry || 0) > 4) { T.touqiTry = game.time; if (H.event('touqi', { force: true })) T.touqi = true; }
    // 低血量
    // 用急救包(正典 §5.8#7;只在靜默期)
    if (game.healT > 0 && !T.heal) { T.heal = true; if (D.silent && !H.whispers.busy && D.request('whisper', { force: true })) { const l = H.whispers.pick('medkit', c); if (l) say(l, { priority: 6 }); } } else if (!(game.healT > 0)) T.heal = false;
    if (D.silent && p.hp / (p.maxHp || 100) < 0.3 && p.alive !== false && game.time - T.low > 80 && !H.whispers.busy && D.request('whisper', { force: true })) { const l = H.whispers.pick('lowhp', c); if (l) { say(l, { priority: 6 }); T.low = game.time; } }
    // 暗處站著不動
    T.still = p.speedNorm < 0.05 ? T.still + step : 0;
    if (D.silent && T.still > 6 && game.time - T.dark > 70 && D.tension < 0.2 && isDark(p) && !H.whispers.busy && D.request('whisper', { force: true })) {
      const l = H.whispers.pick('dark', c);
      if (l) { say(l, { priority: 5 }); T.dark = game.time; T.still = 0; if (!p.flashOn && Math.random() < 0.4) H.after(3, () => H.event('coldBreath')); }
    }
    // 連殺結束之後
    const S = game.stats;
    if (S) {
      if (S.streak >= 5 && S.lastKill > T.lastKill) T.streak = Math.max(T.streak, S.streak);
      T.lastKill = S.lastKill;
      if (T.streak >= 5 && D.silent && game.time - S.lastKill > 5 && D.tension < 0.35 && game.time - T.strk > 100 && !H.whispers.busy && D.request('whisper', { force: true })) { const l = H.whispers.pick('streak', c); if (l) say(l, { priority: 4 }); T.strk = game.time; T.streak = 0; }
    }
    const E = H.events;
    // 靠近道具(每個錨點每局一次)
    if (E && D.silent && D.tension < 0.35 && game.time - T.prop > 35 && !H.whispers.busy) {
      const li = game.hospital.level;
      for (const a of E.anchors) {
        if (a.li !== li || T.props.has(a)) continue;
        const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
        if (d > 3.2 || !game.world.hasLineOfSight?.(p.pos.x, p.pos.y + 1.5, p.pos.z, a.x, a.y + 0.3, a.z)) continue;
        T.props.add(a);
        const l = H.whispers.pick('prop', { ...c, prop: a.kind });
        if (l && D.request('whisper', { force: true })) { say(l, { priority: 5 }); T.prop = game.time; }
        break;
      }
    }
    // 殭屍從看不到的方向接近:那一側的耳朵(提示)
    if (D.silent && D.tension < 0.6 && game.time - T.warn > 45 && !H.whispers.busy) { // 靜默期裡的伏擊者
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      for (const z of game.zombies) {
        if (!z.alive || z._ghw || !(z.dist > 6 && z.dist < 14) || Math.abs(z.pos.y - p.pos.y) > 2) continue;
        const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, dl = Math.hypot(dx, dz) || 1, dot = (dx * fx + dz * fz) / dl;
        if (dot > 0.25) continue;
        z._ghw = true;
        if (Math.random() > 0.5) break;
        const ear = dot < -0.55 ? 'behind' : (fx * dz - fz * dx) > 0 ? 'right' : 'left';
        const l = H.whispers.pick('warn', { ...c, ear }) || H.whispers.pick('warn', c);
        if (l && D.request('whisper', { force: true })) { say(l, { priority: 6, ear: l.ear || ear }); T.warn = game.time; }
        break;
      }
    }
    // 引導:休息時離補給站很遠 → 從補給站那一側的耳朵
    if ((phase === 'shop') && D.roundT > 12 && !game.shopUIOpen && game.time - T.guide > 200 && game.shop?.pos && !H.whispers.busy) {
      const sp = game.shop.pos, d = Math.hypot(sp.x - p.pos.x, sp.z - p.pos.z);
      if (d > 24) {
        const l = H.whispers.pick('guide', { ...c, cue: 'shop' });
        if (l && D.request('whisper', { force: true })) { say(l, { priority: 5, ear: earToward(p, sp.x, sp.z) }); T.guide = game.time; }
      }
    }
    if (!E) return;
    // 殭屍靠近時的「訊號」閃燈
    if (game.time - T.sig > 8 && D.tension > 0.05 && D.tension < 0.5 && Math.random() < 0.25 && D.request('signal')) { if (E.fire('signal')) D.notify('signal'); T.sig = game.time; }
    // 依恐懼值挑事件
    if (game.time < T.next) return;
    T.next = game.time + 1.5;
    const spot = zone ? HOTSPOTS.find((q) => (q.zone === zone.id || q.theme === zone.theme) && !T.spots.has(q)) : null;
    const th0 = spot ? 0.7 : 1; // 驚嚇點:門檻低一點
    let tier = null;
    if (D.dread >= 75 * th0 && D.allowTier('big', game) && Math.random() < 0.6) tier = 'big';
    else if (D.dread >= 40 * th0 && D.allowTier('medium', game)) tier = 'medium';
    else if (D.dread >= 16 && D.allowTier('small', game) && Math.random() < 0.3) tier = 'small'; // 小事件不要一直放:留給恐懼累積到看得見的事件
    if (!tier) return;
    const th = zone?.theme, mood = zone?.mood, out = /^outdoor|^roof/.test(mood || '');
    const esc = Math.min(1, Math.max(0, (D.t - 60) / 600)) * 0.7 + Math.min(1, (round || 1) / 8) * 0.3;
    const cand = [];
    for (const [k, w0] of CATALOG[tier]) {
      let w = w0 * (BIAS[th]?.[k] ?? BIAS[mood]?.[k] ?? 1);
      if (out && BIAS.outdoor[k] != null) w *= BIAS.outdoor[k];
      if (APPARITION.has(k)) w *= 0.35 + esc; // 一局越後面越常看到人影
      if (k === 'whisper' && !H.whispers.pick('idle', c)) w = 0;
      if (spot && spot.kinds.includes(k)) w *= 3;
      w *= D.weight(k); // 疲勞:同一種/同一類最近用過就降權
      if (w <= 0 || !D.request(k, { weight: 1 })) continue;
      cand.push([k, w * (0.6 + Math.random() * 0.8)]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    for (const [k] of cand) {
      if (k === 'whisper') { if (ambientWhisper(true)) return; continue; }
      if (E.fire(k)) { D.notify(k, { dur: tier === 'big' ? 12 : undefined }); H.emit('event', { kind: k }); if (spot && spot.kinds.includes(k)) T.spots.add(spot); return; }
    }
  }
  function isDark(p) {
    const F = H.events?.fixtures;
    if (!F) return false;
    const li = game.hospital.level;
    for (const f of F) if (f.li === li && f.cur > 0.3 && (f.x - p.pos.x) ** 2 + (f.z - p.pos.z) ** 2 < 36) return false;
    return true;
  }
  function earToward(p, x, z) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), dx = x - p.pos.x, dz = z - p.pos.z, dl = Math.hypot(dx, dz) || 1;
    const dot = (dx * fx + dz * fz) / dl;
    if (dot < -0.5) return 'behind';
    if (dot > 0.7) return 'both';
    return (fx * dz - fz * dx) > 0 ? 'right' : 'left';
  }
  void LINES;
  return H;
}

// 每種靈異材質一個代表物件(幻影 pale/shade/深度、腳印/手印、門縫光、剪影 ×2、電視、電梯光、字跡、寒氣粒子)
function warmSet(H) {
  if (!H.app) return [];
  const out = [], geo = new THREE.SphereGeometry(0.2, 8, 6);
  const s = H.app.slots[0];
  for (const m of [s.pale, s.shade, s.depth]) { const x = new THREE.Mesh(geo, m); x.frustumCulled = false; out.push(x); }
  for (const m of H.marks.warmList()) { const c = m.clone(); c.visible = true; c.frustumCulled = false; if (c.isInstancedMesh) c.count = 1; out.push(c); }
  out.push(H.marks.warmWriting());
  for (const m of H.memories?.warmList() || []) { const x = new THREE.Mesh(geo, m); x.frustumCulled = false; out.push(x); } // 回憶的回音人影(同一個 shader)
  for (const m of H.hfx?.warmList() || []) { const c = m.clone(); c.visible = true; c.frustumCulled = false; out.push(c); } // 第三輪:球、紅包、影子、窗上霧氣
  const pts = H.fx.pts.clone(); pts.visible = true; out.push(pts);
  return out;
}
// 退路:自己預編譯(主程式沒有呼叫 warmObjects 時)
async function precompile(game, H) {
  if (!H.app || H.warm) return;
  H.warm = 'compiling';
  try {
    const g = new THREE.Group();
    for (const o of warmSet(H)) g.add(o);
    const res = await warmCompile(game, g, { shadows: false });
    if (res?.programs) await initPrograms(res.programs);
    H.warm = 'done';
  } catch (e) { H.warm = 'failed'; console.warn('[horror] 預編譯', e); }
}
