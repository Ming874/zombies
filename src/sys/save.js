// 存檔點(單人 + 合作)。每一波打完、進入休息(game.openRest)時自動存一份檢查點;主選單「繼續」從那一次休息接著玩。
//   單人:登入 → PUT /api/save/solo(伺服器);沒登入(或伺服器連不上)→ localStorage 備援。兩邊都有時取比較新的。
//   合作:房間裡每個人都登入 → 房主存隊伍的共用狀態(PUT /api/team/<房間代碼>),每個人存自己的裝備(.../gear);
//         大廳「繼續你們上次的進度」→ 房主照共用狀態恢復回合,每個人照自己的裝備恢復(src/net/lobby.js、coop.js)。
//
// 存檔內容 { v, kind, t, meta, shared, own }:
//   shared(房主說了算):波數、難度、目標鏈(objectives;與多人同步的 'objs' 同一份狀態)、門的開關、207 的油量、高潮段落的進度
//   own(每位玩家自己的):生命/護甲/手榴彈/醫療包/金幣、武器/彈藥/改裝、統計、互動旗標與背包、門鎖、電話接過的劇情、
//                       筆記本(這一局碰到的卡 + 整本筆記)、魂火、收音機/開場/大時刻/〈到目前為止〉、靈異系統的計數
// 每個系統一對 ser/load(SYS 表):盡量用各系統既有的 API;沒有的才寫它們的 run 狀態(都是除錯用的 run getter 露出的物件)。
// 還原的時機:game.begin() 之後(resetRun 已經把每個系統清成新的一夜)→ 一口氣寫回去,停在休息時間(商店開著),下一波是 N+1。
import { account } from './account.js';
import { settings } from '../ui/settings.js';
import { restTime, DIFF } from '../game/waves.js';
import { WEAPONS, ORDER } from '../weapons/weapon.js';
import { CARD } from '../story/clues.js';

export const SAVE_V = 1;
const LKEY = (uid) => `hz.save.v1.${uid || 'guest'}`;
const MAX_BYTES = 120 * 1024; // 伺服器上限 128 KB(留一點給摘要)
const J = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const pick = (o, keys) => { const r = {}; if (o) for (const k of keys) if (o[k] !== undefined && J(o[k])) r[k] = o[k]; return r; };
const put = (o, src, keys) => { if (o && src) for (const k of keys) if (k in src && J(src[k])) o[k] = src[k]; };
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const warn = (...a) => console.warn('[save]', ...a);
const safe = (name, fn) => { try { return fn(); } catch (e) { warn(name, e); return undefined; } };
const PICKUP_SKIP = /^(h\.ix\.oil|h\.taboo\.|h\.ix\.badge\.)/; // 油桶(守燈自己補貨)、紅包(禁忌)、門禁卡(高潮段落動態登記的)
const STATS = ['kills', 'headshots', 'melee', 'shots', 'hits', 'time', 'bestStreak', 'earned', 'pickups', 'score', 'clean', 'spent'];

// ---------- 還原時先把「收進口袋」「＋線索」之類的提示收起來(一口氣寫回去,不要洗版) ----------
function muted(g, fn) {
  const swaps = [];
  const sw = (o, k, v) => { if (!o) return; swaps.push([o, k, o[k], Object.prototype.hasOwnProperty.call(o, k)]); o[k] = v; };
  const noop = () => {};
  sw(g.ui, 'pickup', noop); sw(g.ui, 'feed', noop); sw(g.ui, 'coinGain', noop);
  try { return fn(); } finally { for (let i = swaps.length - 1; i >= 0; i--) { const [o, k, v, own] = swaps[i]; if (own) o[k] = v; else delete o[k]; } }
}

// =====================================================================
// 各系統的 ser / load
// =====================================================================
const SYS = {
  // ---- 回合本身(共用)----
  run: {
    ser: (g) => ({ round: g.round | 0, diff: g.diffId?.() || 'normal', day: safe('day', () => g.story?.days?.day?.()) || g.round | 0 }),
  },
  player: {
    ser: (g) => { const p = g.player; return { hp: Math.ceil(p.hp), maxHp: p.maxHp, armor: Math.ceil(p.armor || 0), maxArmor: p.maxArmor || 0, grenades: p.grenades | 0, medkits: p.medkits | 0, coins: p.coins | 0 }; },
    load: (g, d) => {
      const p = g.player;
      if (d.maxHp > 0) p.maxHp = d.maxHp;
      p.hp = clamp(num(d.hp, p.maxHp), 1, p.maxHp);
      p.maxArmor = Math.max(0, num(d.maxArmor)); p.armor = clamp(num(d.armor), 0, p.maxArmor || 0);
      p.grenades = Math.max(0, d.grenades | 0); p.medkits = Math.max(0, d.medkits | 0); p.coins = Math.max(0, d.coins | 0);
      g.ui.setHP(p.hp, p.maxHp); g.ui.setArmor?.(p.armor, p.maxArmor); g.ui.setCoins(p.coins, true);
    },
  },
  weapons: {
    ser: (g) => {
      const w = g.weapons, inv = {};
      for (const id in w.inv) if (WEAPONS[id]) inv[id] = [w.inv[id].mag | 0, w.inv[id].reserve | 0];
      return { inv, cur: w.current, up: JSON.parse(JSON.stringify(g.upgrades || {})), mods: JSON.parse(JSON.stringify(w.mods || {})) };
    },
    load: (g, d) => {
      const w = g.weapons;
      g.upgrades = d.up && typeof d.up === 'object' ? d.up : {};
      for (const id of ORDER) { const m = d.mods?.[id]; if (m && typeof m === 'object') w.mods[id] = { damage: num(m.damage, 1), mag: num(m.mag, 1), reload: num(m.reload, 1), spread: num(m.spread, 1) }; }
      const ids = ORDER.filter((id) => Array.isArray(d.inv?.[id]));
      if (!ids.length) return;
      w.inv = {};
      for (const id of ids) { w.give(id); w.inv[id].mag = Math.max(0, d.inv[id][0] | 0); w.inv[id].reserve = Math.max(0, d.inv[id][1] | 0); }
      w.switchTo(w.inv[d.cur] ? d.cur : ids[0], true);
      g.updateAmmoHud?.();
    },
  },
  stats: {
    ser: (g) => ({ ...pick(g.stats, STATS), byType: { ...(g.stats?.byType || {}) }, kills: g.kills | 0 }),
    load: (g, d) => {
      const S = g.stats;
      put(S, d, STATS);
      if (d.byType && typeof d.byType === 'object') S.byType = { ...d.byType };
      g.kills = d.kills | 0;
      g.ui.setScore?.(S.score || 0, true);
    },
  },

  // ---- 互動:旗標、背包、一次性的東西、電話、配電盤(自己的)----
  ix: {
    ser: (g) => {
      const X = g.interact;
      if (!X) return null;
      const flags = [];
      for (const [k, v] of X.flags.m) if (J(v)) flags.push([k, v]);
      const inv = X.inv.list().map((i) => [i.id, i.n]).filter(([id]) => id !== 'oil'); // 扛著的油桶不存(雙手沒空的狀態)
      const used = X.list.filter((e) => (e.once === 'run' || e.once === true) && (e.used || e.n > 0) && typeof e.id === 'string' && !PICKUP_SKIP.test(e.id)).map((e) => [e.id, e.n | 0, e.kind]);
      const phones = {};
      for (const P of X.phones || []) if (P.used?.size && P.e?.id) phones[P.e.id] = [...P.used];
      return { flags, inv, used, phones };
    },
    load: (g, d) => {
      const X = g.interact;
      if (!X || !d) return;
      const want = new Map(Array.isArray(d.flags) ? d.flags.filter((f) => Array.isArray(f) && typeof f[0] === 'string') : []);
      // 1) 電話:接過的劇情來電(先寫回去,後面旗標成立時才不會重響)
      for (const P of X.phones || []) { const u = d.phones?.[P.e?.id]; if (Array.isArray(u)) for (const id of u) P.used?.add?.(id); }
      // 2) 撿走的東西:照原本的撿起流程藏起模型(道具之後整份覆蓋);其他一次性的只標記用過
      for (const [id, n, kind] of Array.isArray(d.used) ? d.used : []) {
        const e = X.get(id);
        if (!e || e.used || PICKUP_SKIP.test(id)) continue;
        if (kind === 'pickup' && typeof e.onUse === 'function') safe('pickup ' + id, () => e.onUse(X.ctx(e)));
        e.used = true; e.n = Math.max(e.n | 0, n | 0, 1);
      }
      // 3) 配電盤:裝回去的保險絲(h.fuse.n)與迴路開關(照原本的面板操作;面板本身不打開)
      safe('fusebox', () => fusebox(g, want));
      // 4) 背包:整份覆蓋
      X.inv.clear();
      for (const [id, n] of Array.isArray(d.inv) ? d.inv : []) if (typeof id === 'string' && n > 0 && id !== 'oil') X.inv.add(id, n | 0);
      // 5) 旗標:直接寫(不發事件:門、電話、劇情不會以為這些事「現在」才發生)
      for (const [k, v] of want) if (!k.startsWith('know.') && !k.startsWith('meta.')) X.flags.m.set(k, v);
    },
  },
  // 門鎖(自己的;解鎖不出聲、不跳提示)
  locks: {
    ser: (g) => {
      const D = g.interact?.doors;
      if (!D) return null;
      const out = [];
      for (const w of D.list) if (w.lock) out.push([w.key, w.lock.open ? 1 : 0, w.lock.rt ? 1 : 0, ...(w.lock.rt ? [w.lock.text || null, w.lock.flag || null, w.lock.item || null] : [])]);
      return out;
    },
    load: (g, d) => {
      const D = g.interact?.doors;
      if (!D || !Array.isArray(d)) return;
      for (const [key, open, rt, text, flag, item] of d) {
        const w = D.ways.get(key);
        if (!w) continue;
        if (!w.lock && rt && !open) D.lock(key, { text: text || undefined, flag: flag || undefined, item: item || undefined });
        else if (w.lock && open && !w.lock.open) D.unlock(key, { feedback: false });
      }
    },
  },
  // 門的開關(共用;每一端各自照存檔擺,不送網路 —— 隊友的連線那時可能還沒接好門的同步)
  doors: {
    ser: (g) => { const D = g.interact?.doors; return D ? D.list.filter((w) => !D.allClosed(w)).map((w) => w.key) : null; },
    load: (g, d) => {
      const D = g.interact?.doors;
      if (!D || !Array.isArray(d)) return;
      const open = new Set(d);
      for (const w of D.list) {
        const o = open.has(w.key), shut = D.allClosed(w);
        if (o && shut && !(w.lock && !w.lock.open)) D.setState(w, 'open', { sound: false, net: false, fast: true, force: true });
        else if (!o && !shut) D.setState(w, 'closed', { sound: false, net: false, fast: true, force: true });
      }
    },
  },

  // ---- 目標鏈(共用):與多人同步的 'objs' 同一份狀態 { c, d, f, h } + 這一步的進度 ----
  obj: {
    ser: (g) => {
      const R = g.objectives?.run;
      if (!R) return null;
      return { c: R.cur, d: [...R.done], f: [...R.flags].filter((f) => !/^h\.lamp\./.test(f)), h: Math.round(R.holdT || 0), fuses: R.fuses | 0, xlHow: !!R.xlHow, card: !!R.card, called: !!R.called };
    },
    load: (g, d) => {
      const O = g.objectives, R = O?.run, X = g.interact;
      if (!R || !d) return;
      for (const f of Array.isArray(d.f) ? d.f : []) if (typeof f === 'string') { R.flags.add(f); if (/^h\./.test(f) && X?.flags && !X.flags.has(f)) X.flags.m.set(f, true); }
      for (const s of Array.isArray(d.d) ? d.d : []) if (typeof s === 'string') R.done.add(s);
      if (typeof d.c === 'string') R.cur = d.c;
      R.holdT = num(d.h); R.fuses = d.fuses | 0; R.xlHow = !!d.xlHow; R.card = !!d.card; R.called = !!d.called;
      R.stuck = 0; R.tier = 0; R.glint = null; R.glintT = 0;
      R.prog = '\u0000'; // 下一次目標系統的 tick 會重畫目標列(不重播這一步的開場台詞)
      if (g.net?.isHost) R.bcastT = 99; // 合作房主:下一個 tick 就把整份狀態廣播給隊友
    },
  },
  // ---- 筆記本(自己的):這一局碰到的卡(目標鏈看這個)+ 整本筆記(換一台電腦也帶得過去)----
  deduce: {
    ser: (g) => {
      const D = g.deduce;
      if (!D) return null;
      const st = D.state();
      return { got: Object.keys(CARD).filter((id) => D.got(id)), cards: [...st.cards], words: [...st.words], fill: { ...st.fill }, solved: !!st.solved };
    },
    load: (g, d) => {
      const D = g.deduce;
      if (!D || !d) return;
      const st = D.state();
      let changed = false;
      for (const id of d.cards || []) if (CARD[id] && !st.cards.includes(id)) { st.cards.push(id); changed = true; }
      for (const w of d.words || []) if (typeof w === 'string' && !st.words.includes(w)) { st.words.push(w); changed = true; }
      for (const [b, w] of Object.entries(d.fill || {})) if (!st.fill[b] && typeof w === 'string') { st.fill[b] = w; changed = true; }
      if (d.solved && !st.solved) { st.solved = true; changed = true; }
      if (changed) D.seenAll?.(); // 寫回 localStorage
      for (const id of d.got || []) if (CARD[id]) D.addCard(id, { by: 'save' }); // 已經在筆記本裡:只記成「這一局碰到了」
    },
  },
  // ---- 207 的燈(共用,房主):油量用守燈系統自己的 drain(多人時會同步給隊友)----
  lamp: {
    ser: (g) => { const r = g.story?.lamp?.run; return r ? { level: +num(r.level, 1).toFixed(4), ...pick(r, ['waves', 'refuels', 'fillN', 'lowN', 'outSaid']) } : null; },
    load: (g, d, ctx) => {
      const L = g.story?.lamp, r = L?.run;
      if (!r || !d || !ctx.host) return;
      r.lastRound = ctx.round; r.budget = 0; r.wasFight = false; // 這一波的油已經扣過了
      const lv = clamp(num(d.level, 1), 0, 1);
      if (lv < r.level - 1e-4) L.drain(r.level - lv, 'save');
      put(r, d, ['waves', 'refuels', 'fillN', 'lowN', 'outSaid']);
      r.dip = 0; r.cur = r.level > 0 ? 1 : 0;
    },
  },
  // ---- 高潮段落(共用;每一端都寫:頭七、207 的警報、看守的保全、王醫師的電話)----
  climax: {
    ser: (g) => {
      const r = g.story?.climax?.run;
      if (!r) return null;
      const o = pick(r, ['tqLines', 'touqi', 'opened', 'alarm', 'alarmPend', 'wave', 'guardDead', 'hoRang', 'hoState', 'xlCut', 'elockSaid', 'lead', 'final', 'offSaid', 'lit', 'litG', 'steps']);
      o.knob = r.knobT ? 1 : 0; o.log = r.logT ? 1 : 0;
      o.n7 = r.n7 ? { ph: r.n7.ph, i: r.n7.i | 0, late: !!r.n7.late } : null;
      return o;
    },
    load: (g, d) => {
      const r = g.story?.climax?.run;
      if (!r || !d) return;
      put(r, d, ['tqLines', 'touqi', 'opened', 'alarm', 'alarmPend', 'wave', 'guardDead', 'hoRang', 'hoState', 'xlCut', 'elockSaid', 'lead', 'final', 'offSaid', 'lit', 'litG', 'steps']);
      if (d.knob) r.knobT = g.time + 5; // 頭七之後等著轉開的旋鈕
      if (d.log) r.logT = g.time;
      if (r.hoState === 'ringing' || r.hoState === 'talk') { r.hoRang = false; r.hoState = null; } // 電話講到一半:下一次靜默再打來
      r.n7 = d.n7 && ['late', 'done', 'beat'].includes(d.n7.ph) ? { ph: d.n7.ph === 'beat' ? 'done' : d.n7.ph, t0: g.time, i: d.n7.i | 0, cur: null, nextT: 0, away: 0, late: !!d.n7.late } : null;
    },
  },
  // ---- 劇情的節拍(自己的):收音機、開場、大時刻、〈到目前為止〉 ----
  story: {
    ser: (g) => {
      const S = g.story || {};
      return {
        radio: pick(S.radio?.run, ['kind', 'dead', 'on', 'gift', 'giftRest', 'giftAsk', 'fallback', 'rests', 'wasSilent', 'freq', 'screechN', 'warnN', 'warnWave', 'lobbyGlint']),
        opening: pick(S.opening?.run, ['started', 'intro', 'introDone', 'first', 'teach', 'quiet', 'firstBreak', 'ama1', 'amaDone', 'ext', 'chase', 'wasSilent', 'held', 'released', 'acked', 'ackOff', 'old3', 'held1Done']),
        moments: pick(S.moments?.run, ['m2', 'm3', 'm4', 'm6', 'quiet', 'wasSilent', 'in207', 'look']),
        notes: (S.notes?.list?.() || []).slice(0, 40).map((n) => [n.k, n.text]).filter((n) => typeof n[0] === 'string' && typeof n[1] === 'string'),
      };
    },
    load: (g, d) => {
      const S = g.story || {};
      if (!d) return;
      const R = S.radio?.run;
      if (R && d.radio) { put(R, d.radio, Object.keys(d.radio)); R.raised = false; R.burning = false; safe('radio hud', () => S.radio.hud?.draw?.()); }
      if (S.opening?.run && d.opening) put(S.opening.run, d.opening, Object.keys(d.opening));
      if (S.moments?.run && d.moments) put(S.moments.run, d.moments, Object.keys(d.moments));
      if (S.notes?.add && Array.isArray(d.notes)) for (const [k, text] of d.notes.slice().reverse()) S.notes.add(k, text);
    },
  },
  // ---- 魂火(自己的):用 soul 自己的 lose / curse ----
  soul: {
    ser: (g) => (g.soul ? { fires: g.soul.fires(), red: !!g.soul.red } : null),
    load: (g, d) => {
      const S = g.soul;
      if (!S || !d) return;
      for (let i = S.fires(); i > clamp(d.fires | 0, 0, 3); i--) if (!S.lose('save', { force: true })) break;
      if (d.red) S.curse(true);
    },
  },
  // ---- 靈異系統的計數(自己的):第幾次靜默(頭七看這個)、用過的故事事件、回憶、來電 ----
  horror: {
    ser: (g) => {
      const H = g.horror;
      if (!H) return null;
      return { quiet: Math.floor(num(H.quiet)), story: [...(H.storyUsed || [])], writ: [...(H.usedWrit || [])], mem: [...(H.memories?.state?.played || [])], calls: [...(H.calls?.state?.used || [])], callN: H.calls?.state?.count | 0 };
    },
    load: (g, d) => {
      const H = g.horror;
      if (!H || !d) return;
      H.quiet = Math.max(0, d.quiet | 0); // 存的時候還沒數到這一次的靜默:還原後進休息,靈異系統自己會再加一
      for (const s of d.story || []) H.storyUsed?.add?.(s);
      for (const s of d.writ || []) H.usedWrit?.add?.(s);
      for (const s of d.mem || []) H.memories?.state?.played?.add?.(s);
      for (const s of d.calls || []) H.calls?.state?.used?.add?.(s);
      if (H.calls?.state) H.calls.state.count = d.callN | 0;
    },
  },
};
const SHARED = ['run', 'obj', 'doors', 'lamp', 'climax'];
const OWN = ['player', 'weapons', 'stats', 'ix', 'locks', 'deduce', 'story', 'soul', 'horror'];
// 還原的順序:門鎖要在旗標之前(旗標的事件不會再幫忙開鎖)、背包在目標鏈之前(撿保險絲的事件會改目標的計數)
const LOAD_ORDER = [['own', 'player'], ['own', 'weapons'], ['own', 'stats'], ['own', 'locks'], ['own', 'ix'], ['shared', 'doors'], ['shared', 'obj'], ['own', 'deduce'], ['shared', 'lamp'], ['shared', 'climax'], ['own', 'story'], ['own', 'soul'], ['own', 'horror']];

// 配電盤:照存檔裝回保險絲、把迴路開關扳到存檔的樣子(用配電盤自己的 onUse 與面板的 toggle;面板不顯示)
function fusebox(g, want) {
  const X = g.interact, fb = X?.get?.('h.ix.fusebox') || X?.list?.find((e) => e.kind === 'fusebox');
  if (!fb || typeof fb.onUse !== 'function') return;
  const spec = X.map?.pack?.items?.find((i) => i.kind === 'fusebox') || {};
  const ids = (spec.circuits || []).map((c) => c.id);
  const k = clamp(num(want.get(spec.fillFlag || 'h.fuse.n')) | 0, 0, spec.slots || 3);
  const sw = ids.map((id) => (want.has(id) ? !!want.get(id) : null)); // 存檔時迴路的開關(這一局沒動過 = null)
  if (!k && sw.every((v) => v === null)) return;
  let cap = null;
  const ui = X.ui, own = Object.prototype.hasOwnProperty.call(ui, 'panel'), panel0 = ui.panel;
  ui.panel = (o) => { cap = o; };
  try {
    X.inv.clear();
    if (k) X.inv.add('fuse', k);
    fb.onUse(X.ctx(fb));
    if (cap?.rows && cap.toggle) {
      const rows = () => cap.rows() || [];
      for (let i = 0; i < ids.length; i++) if (sw[i] === false && rows()[i]?.on) cap.toggle(i); // 先關、再開(容量有限)
      for (let i = 0; i < ids.length; i++) if (sw[i] === true && !rows()[i]?.on && rows()[i]?.can) cap.toggle(i);
    }
  } finally { if (own) ui.panel = panel0; else delete ui.panel; }
}

// =====================================================================
// 存 / 讀
// =====================================================================
export function snapshot(g, kind = 'solo') {
  const shared = {}, own = {};
  for (const k of SHARED) { const v = safe('ser ' + k, () => SYS[k].ser(g)); if (v != null) shared[k] = v; }
  for (const k of OWN) { const v = safe('ser ' + k, () => SYS[k].ser(g)); if (v != null) own[k] = v; }
  const run = shared.run || {};
  return { v: SAVE_V, kind, t: Date.now(), meta: { round: run.round, day: run.day, diff: run.diff }, shared, own };
}

// 從存檔恢復(game.begin() 之後;或合作開局時)。part:'all' | 'own'(合作的隊友:只寫自己的,回合由房主的 'sync' 帶)
export function restore(g, data, { part = 'all', enter = true } = {}) {
  if (!data || data.v !== SAVE_V) return false;
  const shared = data.shared || {}, own = data.own || {};
  const N = Math.max(1, shared.run?.round | 0);
  const host = !g.net || !!g.net.isHost;
  const ctx = { round: N, host };
  // 靈異系統在「第一次看到 playing」的那一幀才 resetRun(src/horror/index.js):先替它做,不然下一幀會把還原的魂火、計數清掉
  const H = g.horror;
  if (H && g.state === 'playing' && H._st !== 'playing') { H._st = 'playing'; safe('horror reset', () => H.resetRun()); }
  muted(g, () => {
    if (enter && part === 'all') enterRest(g, N);
    else g.round = N; // 隊友:先把波數寫好(封院第 N 天照波數估),休息由房主的 'sync' 帶進來
    for (const [where, k] of LOAD_ORDER) {
      if (part === 'own' && where === 'shared' && k === 'lamp') continue; // 油量由房主決定
      const d = (where === 'shared' ? shared : own)[k];
      if (d !== undefined && SYS[k].load) safe('load ' + k, () => SYS[k].load(g, d, ctx));
    }
  });
  g.updateAmmoHud?.();
  return true;
}

// 停在第 N 波之後的休息:商店開著、下一波是 N+1(與合作中途加入的 'sync' 一樣的做法)
function enterRest(g, N) {
  g._fxEnd?.();
  g.hospital?.beacon?.set?.(0);
  for (const z of g.zombies) z.dispose?.();
  g.zombies.length = 0;
  g.round = N;
  g.queue = [];
  g.toSpawn = 0;
  g.phase = 'shop';
  g.restT = restTime(N + 1);
  g.lastRound = null;
  g.ui.setRound?.(N);
  g.shop?.setOpen(true);
  if (!g.ui.shop.game) g.ui.shop.game = g;
  g.ui.shop.warm?.();
  g.setMood?.('shop');
  g.ui.prompt?.(null);
}

const label = (meta) => {
  if (!meta) return '';
  const dn = DIFF[meta.diff]?.name;
  return `第 ${meta.round} 波之後・封院第 ${Math.max(1, Math.min(14, meta.day || meta.round))} 天${dn ? ` · ${dn}` : ''}`;
};
export const saveLabel = label;

// =====================================================================
// 單人:自動存檔、主選單「繼續」、死亡畫面「從存檔點繼續」、「新的一夜」先問
// =====================================================================
let G = null, cur = null, pending = null, putting = null, again = null;
const lget = (uid) => { try { const s = localStorage.getItem(LKEY(uid)); const d = s && JSON.parse(s); return d && d.v === SAVE_V ? d : null; } catch { return null; } };
const lset = (uid, d) => { try { localStorage.setItem(LKEY(uid), JSON.stringify(d)); return true; } catch { return false; } };

async function fetchJson(url, opt = {}) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...opt });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const putJson = (url, body) => fetchJson(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// 目前的單人存檔(伺服器與本機取比較新的)
async function loadSolo() {
  const u = account.user;
  let best = lget(u?.id);
  if (u) {
    try {
      const s = await fetchJson('/api/save/solo');
      if (s?.data?.v === SAVE_V && (!best || (s.data.t || 0) >= (best.t || 0))) best = s.data;
      else if (best) putSolo(best); // 本機的比較新(上次伺服器連不上):補傳
    } catch (e) { warn('讀取伺服器存檔失敗,用本機的', e.message); }
  }
  return best;
}
function putSolo(d) {
  if (!account.user) return Promise.resolve(false);
  if (putting) { again = d; return putting; } // 同時只送一份;送的途中又存了,送完再送最新的
  putting = putJson('/api/save/solo', { data: d, meta: d.meta }).then(() => true).catch((e) => { warn('上傳存檔失敗(本機有備份)', e.message); return false; })
    .finally(() => { putting = null; if (again) { const n = again; again = null; putSolo(n); } });
  return putting;
}

function refreshMenu() {
  const m = G?.ui?.menu;
  if (!m?.setSave) return;
  m.setSave(cur ? { sub: label(cur.meta) } : null);
}
async function reload() {
  cur = await loadSolo().catch(() => null);
  refreshMenu();
}

// 每一次休息:存一份
function onRest(g) {
  if (g.state !== 'playing' || g.story?.ending?.active || g.objectives?.has?.('h.evac')) return;
  if (g.net) { if (!g.net.pvp) coopSave(g); return; }
  const d = snapshot(g, 'solo');
  const n = JSON.stringify(d).length;
  if (n > MAX_BYTES) { warn(`存檔太大(${Math.round(n / 1024)} KB),拿掉筆記`); delete d.own.story?.notes; }
  d.uid = account.user?.id || null;
  lset(d.uid, d);
  cur = d;
  putSolo(d);
  refreshMenu();
  G.__lastSave = { t: d.t, bytes: n }; // 測試用
}

// 開始:有存檔要繼續(pending)就在 begin() 之後還原
function startFrom(d, via, cold) {
  if (!d) return;
  pending = d;
  if (d.shared?.run?.diff && DIFF[d.shared.run.diff]) settings.set('difficulty', d.shared.run.diff);
  const M = G.motion;
  if (cold && M && typeof M.coldOpen === 'function' && !M.busy) { // 開場的標題卡改成「從存檔點繼續」,前情卡跳過
    const pre = M.coldPre, card = M.coldCard, mt = d.meta || {};
    M.coldPre = null;
    M.coldCard = { ...(card || {}), title: '〈第七暝〉', sub: `聖心醫院　·　封院第 ${Math.max(1, Math.min(14, mt.day || mt.round || 1))} 天`, line: `第 ${mt.round} 波之後　·　從存檔點繼續` };
    let off = null;
    const back = () => { if (M.coldPre === null) M.coldPre = pre; M.coldCard = card; off?.(); };
    off = M.on?.('coldopen:end', back);
    setTimeout(back, 30000);
  }
  via();
}

export function installSave(game) {
  if (G) return;
  G = game;
  const menu = game.ui.menu;
  const startBtn = document.getElementById('startBtn'), restartBtn = document.getElementById('restartBtn');
  const start0 = startBtn.onclick, restart0 = restartBtn.onclick;
  // 開局後:還原
  const begin0 = game.begin;
  game.begin = function (...a) {
    const r = begin0.apply(this, a);
    const d = pending;
    pending = null;
    if (d && !this.net) {
      restore(this, d);
      const mt = d.meta || {};
      this.ui.banner('鐵門拉起來了', `從存檔點繼續 · ${label(mt)} · 休息完是第 ${(mt.round | 0) + 1} 波`, 4800, '');
      this.__restored = { t: d.t, round: this.round }; // 測試用
    }
    return r;
  };
  // 每一次休息存一份
  const rest0 = game.openRest;
  game.openRest = function (...a) {
    const r = rest0.apply(this, a);
    safe('autosave', () => onRest(this));
    return r;
  };
  // 「新的一夜」/ 死亡畫面的「再試一次」:有存檔點先問
  const ask = (orig, ev) => {
    if (!cur) return orig?.call(startBtn, ev);
    menu.confirm?.({ title: '開始新的一夜？', text: `存檔點（${label(cur.meta)}）會在這一夜的第一次休息時被覆蓋。`, ok: '開始新的一夜', cancel: '取消' }, () => orig?.call(startBtn, ev));
  };
  startBtn.onclick = (ev) => ask(start0, ev);
  restartBtn.onclick = (ev) => ask(restart0, ev);
  menu.onContinue = (where) => {
    if (!cur) return;
    if (where === 'dead') startFrom(cur, () => restart0?.call(restartBtn), false);
    else startFrom(cur, () => start0?.call(startBtn), true);
  };
  account.on(() => { if (account.ready) reload(); });
  if (account.ready) reload();
  window.__save = { snapshot: () => snapshot(game), restore: (d) => restore(game, d), reload, get cur() { return cur; }, label }; // 除錯/測試用
}

// =====================================================================
// 合作:房主存隊伍狀態、每個人存自己的裝備;開局時照存檔恢復(src/net/coop.js、lobby.js 呼叫)
// =====================================================================
function coopSave(g) {
  const s = g.net, room = s?.lobby?.room;
  if (!account.user || !room?.team?.ok || !room.code) return;
  const d = snapshot(g, 'coop');
  const code = encodeURIComponent(room.code);
  const own = { v: SAVE_V, kind: 'gear', t: d.t, meta: d.meta, own: d.own };
  const jobs = [putJson(`/api/team/${code}/gear`, { data: own, meta: d.meta })];
  if (s.isHost) jobs.push(putJson(`/api/team/${code}`, { data: { v: SAVE_V, kind: 'team', t: d.t, meta: d.meta, shared: d.shared }, meta: d.meta }));
  Promise.all(jobs).then(() => { g.__lastCoopSave = { t: d.t, host: !!s.isHost }; }).catch((e) => warn('合作存檔失敗', e.message));
}
// 大廳:讀隊伍存檔與自己的裝備(兩個都拿到才回傳)
export async function loadTeam(code) {
  const c = encodeURIComponent(code);
  const [team, gear] = await Promise.all([fetchJson(`/api/team/${c}`), fetchJson(`/api/team/${c}/gear`).catch(() => null)]);
  if (!team?.data || team.data.v !== SAVE_V) return null;
  return { t: team.t, shared: team.data.shared || {}, own: gear?.data?.own || null, meta: team.data.meta || team.meta || null };
}
// 合作開局:房主 → 整份(共用 + 自己的)並進休息;隊友 → 只寫自己的(+ 目標鏈、高潮段落、門,房主的同步之後會再對一次)
export function restoreCoop(g, res, host) {
  if (!res) return false;
  const data = { v: SAVE_V, shared: res.shared || {}, own: res.own || {} };
  return restore(g, data, host ? { part: 'all' } : { part: 'own', enter: false });
}
export const coopLabel = label;
