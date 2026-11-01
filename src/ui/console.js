import './console.css';
import { ITEMS, CATS, findItem, itemNames, clampCount, countable, maxCount, applyGive } from '../game/give.js';
import { CICON, WIDE } from './conicons.js';

// ===== 控制面板(F8 開關)=====
// 指令:/give <玩家> <物品> [數量]、/list、/help、/clear(斜線可省略,也可以打中文別名)。
// 補全選單:輸入框上方即時列出游標這一格(指令、玩家、物品、數量)能填什麼;支援中文別名、英文、只打開頭、模糊比對(錯一兩個字也找得到)。
//   ↑↓ 選擇、Tab / Enter 套用、Esc 先收起選單,再按一次關閉面板;滑鼠也能點。選單收起時 ↑↓ 翻歷史紀錄。
// 分色:輸入框底下疊一層同步的著色層(.pt);指令、玩家、物品(依種類)、數量、錯誤各一種顏色。選單色條、物品格子、/help 用同一套顏色。
// 玩家:me / @s 自己、@a 所有人、/list 裡的編號、或暱稱(可只打開頭)。多人模式只有房主能 /give(伺服器也只轉發房主的 'gv')。
// 開著時:單人遊戲暫停;多人世界照常進行,但本機玩家不能動。
//
// 鍵盤:遊戲有很多在捕獲階段處理按鍵的模組(flow.js、互動、推理本…)。本模組在載入時就註冊 window 捕獲監聽器(main.js 第一個 import),
// 比其他模組都早 → 面板開著時用 stopImmediatePropagation 吞掉所有按鍵(只擋事件傳遞,不擋輸入框打字)。
// 所以輸入框自己收不到 keydown / keyup;游標移動後的更新在 onKeyDown 裡排程。

const S = { game: null, open: false, el: null, log: null, input: null, pt: null, menu: null, hint: null, hist: [], hi: 0, cands: [], sel: -1, menuOff: false, cx: null };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SELF = ['me', '@s', '@p', 'self', 'local', '我', '自己'];
const ALL = ['@a', 'all', '所有人', '全部玩家'];
const isAll = (a) => ALL.includes(String(a).toLowerCase());
const DIGITS = /^\d+$/;

export function installConsole(game) { S.game = game; }

addEventListener('keydown', onKeyDown, true);
addEventListener('keyup', (e) => { if (S.open) e.stopImmediatePropagation(); }, true);

function onKeyDown(e) {
  if (e.code === 'F8') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) (S.open ? close(true) : open());
    return;
  }
  if (!S.open) return;
  e.stopImmediatePropagation();
  if (document.activeElement !== S.input) S.input.focus();
  if (e.isComposing || e.keyCode === 229) return; // 中文輸入法選字中:Enter / 方向鍵交給輸入法
  const menu = shown();
  switch (e.key) {
    case 'Escape': e.preventDefault(); if (menu) { S.menuOff = true; renderMenu(); } else close(false); break;
    case 'Enter': e.preventDefault(); enter(); break;
    case 'Tab': e.preventDefault(); if (menu) accept(Math.max(0, S.sel)); else if (S.cands.length) { S.menuOff = false; renderMenu(); } break;
    case 'ArrowUp': e.preventDefault(); if (menu) move(-1); else recall(-1); break;
    case 'ArrowDown':
      e.preventDefault();
      if (menu) move(1);
      else if (S.hi < S.hist.length) recall(1);
      else { S.menuOff = false; renderMenu(); }
      break;
    case 'ArrowLeft': case 'ArrowRight': case 'Home': case 'End': setTimeout(refresh, 0); break; // 游標換格 → 換一份候選
    default:
  }
}

// ---------- 介面 ----------
// 常用指令:點了只填進輸入框(玩家可以接著改);物品格子:點一下直接給自己
const QUICK = [
  ['give me ', '給自己…'], ['give @a ', '給所有人…'], ['give me all', '全部給齊'], ['give me ammo', '補滿彈藥'],
  ['give me hp', '補滿生命'], ['give me coins 1000', '1000 金幣'], ['list', '玩家清單'], ['help', '說明'],
];

function build() {
  if (S.el) return;
  const el = document.createElement('div');
  el.id = 'hzcon';
  const quick = QUICK.map(([q, t]) => `<button type="button" data-q="${esc(q)}" title="填入 /${esc(q.trim())}"><b>${esc(t)}</b><code>${paintStatic('/' + q.trim())}</code></button>`).join('');
  const tiles = itemNames().map((k) => `<button type="button" class="tile c-${ITEMS[k].cat}" data-k="${k}" title="給自己：${esc(ITEMS[k].name)}（/give me ${k}）">${icon(k)}<small>${esc(ITEMS[k].short)}</small></button>`).join('');
  el.innerHTML = `<div class="hd"><b>控制面板</b><span><kbd>F8</kbd> 關閉</span></div>
    <div class="sec"><span class="lb">常用指令<small>點了填進輸入框</small></span><div class="qk">${quick}</div></div>
    <div class="sec"><span class="lb">物品<small>點一下就給自己</small></span><div class="grid">${tiles}</div></div>
    <div class="log"></div>
    <div class="row"><div class="menu"></div><b>›</b><div class="ed"><div class="pt"><span></span></div><input spellcheck="false" autocomplete="off" placeholder="打指令，或從清單選，例如 /give me rpg" /></div></div>
    <div class="hint"></div>`;
  document.body.appendChild(el);
  S.el = el;
  S.log = el.querySelector('.log');
  S.input = el.querySelector('input');
  S.pt = el.querySelector('.pt > span');
  S.menu = el.querySelector('.menu');
  S.hint = el.querySelector('.hint');
  S.input.addEventListener('input', () => { S.menuOff = false; S.hi = S.hist.length; refresh(); });
  S.input.addEventListener('click', refresh);
  S.input.addEventListener('scroll', syncScroll);
  // 按鈕、選單不搶輸入框的焦點;滾輪不切換武器(input.js 在 document 上聽 wheel)
  for (const q of el.querySelectorAll('.qk, .grid, .menu')) q.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => e.stopPropagation());
  el.querySelector('.qk').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) setValue(b.dataset.q, b.dataset.q.length); });
  el.querySelector('.grid').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) exec(`give me ${b.dataset.k}`); });
  S.menu.addEventListener('click', (e) => { const r = e.target.closest('.mi'); if (r) accept(+r.dataset.i); });
  S.menu.addEventListener('mousemove', (e) => { const r = e.target.closest('.mi'); if (r && +r.dataset.i !== S.sel) { S.sel = +r.dataset.i; markSel(false); } });
  info('打指令，或用上面的按鈕和物品格子。打 /help 看全部說明。');
}

function open() {
  build();
  S.open = true;
  S.el.classList.add('on');
  const g = S.game;
  if (g) {
    g.consoleOpen = true;
    g.player.keys = {};
    if (g.input) { g.input.fireHeld = false; g.input.aimHeld = false; g.input.shift = false; }
    if (document.pointerLockElement) document.exitPointerLock(); // input.js 看到 consoleOpen 就不會跳出暫停選單
  }
  S.el.classList.toggle('nogive', !canGive());
  S.menuOff = false; // 一打開就列出全部指令
  S.input.focus();
  refresh();
}

// relock:F8 關閉(按鍵算使用者手勢)→ 直接回到遊戲;Esc 關閉(瀏覽器不讓 Esc 重新鎖定滑鼠)→ 顯示暫停選單
function close(relock) {
  if (!S.open) return;
  S.open = false;
  S.el.classList.remove('on');
  S.input.blur();
  const g = S.game;
  if (!g) return;
  g.consoleOpen = false;
  if (g.state !== 'playing' || g.shopUIOpen || g.bookOpen || document.pointerLockElement === g.canvas) return;
  const pause = () => { if (g.state === 'playing' && document.pointerLockElement !== g.canvas) { g.paused = true; g.ui.overlay('pause', true); } };
  if (!relock) { pause(); return; }
  try { g.canvas.requestPointerLock()?.catch?.(pause); } catch { pause(); }
}

const canGive = () => { const g = S.game; return !!g && g.state === 'playing' && (!g.net || g.net.isHost); };

// ---------- 紀錄 ----------
function line(cls, html, ic) {
  const d = document.createElement('div');
  d.className = 'ln ' + cls;
  d.innerHTML = (ic ? `<i>${ic}</i>` : '') + `<span>${html}</span>`;
  S.log.appendChild(d);
  while (S.log.childElementCount > 200) S.log.firstElementChild.remove();
  S.log.scrollTop = S.log.scrollHeight;
  return d;
}
const ok = (h) => line('ok', h, CICON.ok);
const fail = (t) => line('err', esc(t), CICON.err);
const tip = (t) => line('tip', esc(t), CICON.tip);
const info = (t) => line('info', esc(t));
const table = (head, rows) => line('tbl', `<table class="tb"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`);

function setValue(v, caret) {
  S.input.value = v;
  S.input.focus();
  S.input.setSelectionRange(caret, caret);
  if (caret >= v.length) S.input.scrollLeft = S.input.scrollWidth;
  S.menuOff = false;
  refresh();
}

function submit() {
  const v = S.input.value.trim();
  S.input.value = '';
  S.menuOff = true; // 執行完先收起選單,才看得到結果;打字或按 ↓ 再叫出來
  refresh();
  if (v) exec(v);
}

function exec(v) {
  if (S.hist[S.hist.length - 1] !== v) S.hist.push(v);
  if (S.hist.length > 50) S.hist.shift();
  S.hi = S.hist.length;
  line('cmd', `<b>›</b> ${paintStatic(v)}`);
  if (!S.game) { fail('遊戲還在載入，請稍等一下。'); return; }
  const w = lex(v).map((t) => t.t), k = findCmd(w[0]);
  if (!k) { fail(w[0] ? unknownCmd(w[0]) : '請打指令，例如 /give me rpg。'); return; }
  try { CMDS[k].run(w.slice(1)); } catch (e) { fail(`執行失敗：${e.message}`); console.error('[console]', e); }
  S.el.classList.toggle('nogive', !canGive());
}

function recall(d) {
  if (!S.hist.length) return;
  S.hi = Math.max(0, Math.min(S.hist.length, S.hi + d));
  S.input.value = S.hist[S.hi] ?? '';
  S.input.setSelectionRange(S.input.value.length, S.input.value.length);
  S.input.scrollLeft = S.input.scrollWidth;
  refresh(); // 選單維持收起,繼續按 ↑↓ 還是翻歷史
}

// ---------- 玩家 ----------
// 清單:{ n 編號, slot 座位(單人 null), name, p 玩家物件, self };多人時編號 = 座位 + 1(有人離開也不會變)
function players() {
  const g = S.game;
  if (!g) return [];
  if (!g.net) return [{ n: 1, slot: null, name: g.player.name || '你', p: g.player, self: true }];
  const s = g.net, list = [{ slot: s.me, name: s.myName(), p: g.player, self: true }];
  for (const rp of s.remotes.values()) if (rp.connected !== false) list.push({ slot: rp.id, name: rp.name, p: rp, self: false });
  return list.sort((a, b) => a.slot - b.slot).map((x) => ({ ...x, n: x.slot + 1 }));
}

// 參數 → 玩家陣列;找不到回傳錯誤字串(直接講怎麼改)
function targets(arg) {
  if (!S.game) return '遊戲還在載入，請稍等一下。';
  const list = players(), a = String(arg).toLowerCase();
  if (SELF.includes(a)) return list.filter((x) => x.self);
  if (ALL.includes(a)) return list;
  if (DIGITS.test(a)) { const x = list.find((q) => q.n === Number(a)); return x ? [x] : `找不到編號 ${a} 的玩家。打 /list 可以看編號。`; }
  const exact = list.filter((q) => q.name.toLowerCase() === a);
  if (exact.length) return exact;
  const pre = list.filter((q) => q.name.toLowerCase().startsWith(a));
  if (pre.length === 1) return pre;
  return pre.length ? `「${arg}」符合好幾位玩家：${pre.map((q) => q.name).join('、')}。請打完整的暱稱或編號。`
    : `找不到「${arg}」這位玩家。可以打 me（自己）、@a（所有人），或 /list 裡的編號。`;
}

// ---------- 指令 ----------
const CMDS = {
  give: { name: '給予物品', args: '<玩家> <物品> [數量]', use: '給予物品；省略玩家就是給自己', ex: 'give me rpg', alias: ['給', '給予'], run: runGive },
  list: { name: '玩家清單', args: '', use: '列出玩家和編號', ex: 'list', alias: ['ls', 'players', '玩家', '清單'], run: runList },
  help: { name: '說明', args: '', use: '顯示這份說明', ex: 'help', alias: ['?', 'h', '說明', '幫助'], run: runHelp },
  clear: { name: '清除紀錄', args: '', use: '把上面的紀錄清掉', ex: 'clear', alias: ['cls', '清除'], run() { S.log.textContent = ''; } },
};
function findCmd(n) {
  n = String(n ?? '').toLowerCase();
  if (CMDS[n]) return n;
  for (const [k, c] of Object.entries(CMDS)) if (c.alias.includes(n)) return k;
  return null;
}

// /give 的參數怎麼解讀(執行、上色、預覽共用,三者一定一致)
// 第一個參數是物品、後面沒東西或是數字 → 省略了玩家(給自己);否則第一個是玩家
function resolveGive(a) {
  const it0 = findItem(a[0]);
  const first = it0 && (a[1] === undefined || DIGITS.test(a[1]) || (!findItem(a[1]) && typeof targets(a[0]) === 'string'));
  const r = first ? { whoI: -1, whatI: 0, numI: 1, who: 'me' } : { whoI: 0, whatI: 1, numI: 2, who: a[0] };
  r.what = a[r.whatI];
  r.key = findItem(r.what);
  r.numRaw = a[r.numI];
  r.ts = targets(r.who);
  r.extra = [];
  for (let i = r.numI + 1; i < a.length; i++) r.extra.push(i);
  return r;
}

const num = (n) => Number(n).toLocaleString('en-US');
const amount = (key, n) => (!n ? ITEMS[key].name : key === 'coins' ? `${num(n)} 金幣` : `${ITEMS[key].name} ×${num(n)}`);
const sp = (a) => (/[!-~]$/.test(a) ? `${a} ` : a); // 英數字後面接中文:中間空一格
const icon = (key) => `<span class="ic${WIDE.has(key) ? ' w' : ''}">${CICON[key] || ''}</span>`;
const itemTag = (key, text) => `<span class="it c-${ITEMS[key].cat}">${icon(key)}${esc(text)}</span>`;

function runGive(a) {
  const g = S.game;
  if (g.state !== 'playing') { fail('要開始遊戲之後才能給予物品。'); return; }
  if (g.net && !g.net.isHost) { fail('多人模式只有房主能給予物品。'); return; }
  if (!a.length) { fail('要指定物品，例如 /give me rpg。'); return; }
  const A = blank(a.length + 1);
  giveCheck(a, A, -1);
  const r = resolveGive(a);
  if (A.err) { fail(A.err.text); return; }
  if (!r.key) { fail(`還沒選物品，例如 /give ${r.who} rpg。`); return; }
  for (const t of A.tips) tip(t);
  const count = countable(r.key) && r.numRaw !== undefined ? clampCount(r.key, Number(r.numRaw)) : undefined;
  for (const t of r.ts) {
    if (t.self) {
      const msg = applyGive(g, r.key, count);
      ok(`已給你：${itemTag(r.key, msg)}`);
    } else if (t.p.connected === false) fail(`${t.name} 已經斷線了。`);
    else {
      g.net.give(t.slot, r.key, count);
      ok(`已送給${/^[!-~]/.test(t.name) ? ' ' : ''}${esc(t.name)}：${itemTag(r.key, amount(r.key, countable(r.key) ? clampCount(r.key, count) : 0))}`);
    }
  }
}

function runList() {
  const g = S.game, host = g.net?.hostSlot;
  table(['編號', '暱稱', '身分'], players().map((x) => {
    const role = [x.self && '你', g.net && x.slot === host && '房主'].filter(Boolean).join('・');
    return `<tr><td class="n">${x.n}</td><td><span class="it c-pl">${CICON.me}${esc(x.name)}</span></td><td>${role}</td></tr>`;
  }));
  if (!g.net) tip('單人模式只有你自己，打 me 或 1 都可以。');
}

function runHelp() {
  const d = table(['指令', '用途', '例子'], Object.entries(CMDS).map(([k, c]) =>
    `<tr><td><span class="it c-cmd">${CICON[k]}/${k}</span>${c.args ? ` <span class="ar">${esc(c.args)}</span>` : ''}</td><td>${esc(c.use)}</td><td><code>${paintStatic('/' + c.ex)}</code></td></tr>`));
  table(['玩家', '意思'], [['me', '自己'], ['@a', '所有人'], ['2', '/list 裡的編號'], ['小明', '暱稱，只打開頭也可以']].map(([k, t]) =>
    `<tr><td><code class="c-pl">${k}</code></td><td>${t}</td></tr>`));
  table(['種類', '物品（中文名稱也能打）'], Object.entries(CATS).map(([cat, label]) => {
    const ks = itemNames().filter((k) => ITEMS[k].cat === cat);
    return `<tr class="c-${cat}"><td class="ct">${label}</td><td>${ks.map((k) => `<span class="chip">${icon(k)}${esc(ITEMS[k].name)} <code>${k}</code>${countable(k) ? `<small>預設 ${ITEMS[k].def}</small>` : ''}</span>`).join('')}</td></tr>`;
  }));
  line('dim', '只有火箭彈、手榴彈、醫療包、金幣可以填數量，不填就用預設。例：/give @a grenade 3、/give 2 coins 500');
  S.log.scrollTop = d.offsetTop - S.log.offsetTop - 4; // 從表格開頭看起
}

// ---------- 解析與上色 ----------
// 字:{ s, e 在輸入框裡的位置, raw 原文, t 去掉開頭斜線 }
function lex(v) {
  const toks = [], re = /\S+/g;
  let m;
  while ((m = re.exec(v))) toks.push({ s: m.index, e: m.index + m[0].length, raw: m[0], t: toks.length ? m[0] : m[0].replace(/^\//, '') });
  return toks;
}

// 游標在第幾格;落在空白上就是一個新的空格(v: true)
function slotAt(toks, caret) {
  for (let i = 0; i < toks.length; i++) if (toks[i].s <= caret && caret <= toks[i].e) return { i, tok: toks[i] };
  return { i: toks.filter((t) => t.e < caret).length, tok: { s: caret, e: caret, raw: '', t: '', v: true } };
}

const blank = (n) => ({ cls: Array(n).fill(''), err: null, tips: [], ready: false, need: false, preview: '' });

// 整行分析:每個字的顏色、錯誤與提醒、能不能執行、執行後會怎樣
// cur:游標所在的字;打到一半、還找得到候選的字不算錯(x-pend)
function analyze(toks, cur) {
  const w = toks.map((t) => t.t), A = blank(w.length);
  if (!w.length || (w.length === 1 && !w[0])) return A;
  const ck = findCmd(w[0]);
  if (!ck) {
    if (cur === 0 && rank(cmdCands(false), w[0]).length) { A.cls[0] = 'x-pend'; A.need = true; return A; }
    A.cls[0] = 'x-err';
    A.err = { i: 0, text: unknownCmd(w[0]) };
    return A;
  }
  A.cls[0] = 'x-cmd';
  if (ck === 'give') { giveCheck(w.slice(1), A, cur - 1); return A; }
  for (let i = 1; i < w.length; i++) A.cls[i] = 'x-extra';
  if (w.length > 1) A.tips.push(`/${ck} 不用加參數，多打的「${w.slice(1).join(' ')}」會略過。`);
  A.ready = true;
  A.preview = esc(CMDS[ck].name);
  return A;
}

function giveCheck(a, A, cur) {
  const set = (i, c) => { A.cls[i + 1] = c; };
  const bad = (i, text) => { set(i, 'x-err'); A.err ??= { i: i + 1, text }; };
  if (!a.length) { A.need = true; return; }
  const r = resolveGive(a);
  if (r.whoI >= 0) {
    if (Array.isArray(r.ts)) set(r.whoI, 'x-pl');
    else if (cur === r.whoI && rank(r.whoI === 0 ? whoCands() : playerCands(), r.who).length) { set(r.whoI, 'x-pend'); A.need = true; }
    else bad(r.whoI, r.ts);
  }
  if (r.key) set(r.whatI, `x-it c-${ITEMS[r.key].cat}`);
  else if (r.what === undefined) A.need = true;
  else if (cur === r.whatI && rank(itemCands(), r.what).length) { set(r.whatI, 'x-pend'); A.need = true; }
  else bad(r.whatI, unknownItem(r.what));
  if (r.numRaw !== undefined) {
    const n = r.numRaw;
    if (r.key && !countable(r.key)) { set(r.numI, 'x-extra'); A.tips.push(`${sp(ITEMS[r.key].name)}不用填數量，「${n}」會略過。`); }
    else if (!DIGITS.test(n)) bad(r.numI, `數量要打整數，例如 /give me ${r.key || 'grenade'} 5。`);
    else {
      set(r.numI, 'x-num');
      const m = r.key ? maxCount(r.key) : Infinity;
      if (+n > m) A.tips.push(`最多只能給 ${num(m)}，會給 ${num(m)}。`);
      else if (+n < 1) A.tips.push('數量至少是 1，會給 1。');
    }
  }
  for (const i of r.extra) set(i, 'x-extra');
  if (r.extra.length) A.tips.push(`多打的「${r.extra.map((i) => a[i]).join(' ')}」會略過。`);
  if (!A.err && !A.need && r.key && Array.isArray(r.ts)) {
    const n = countable(r.key) ? clampCount(r.key, r.numRaw === undefined ? undefined : Number(r.numRaw)) : 0;
    const who = isAll(r.who) && S.game?.net ? `所有人（${r.ts.length} 位）` : r.ts.map((x) => (x.self ? '你' : x.name)).join('、');
    A.ready = true;
    A.preview = `給${/^[!-~]/.test(who) ? ' ' : ''}${esc(who)}：${itemTag(r.key, amount(r.key, n))}`;
  }
}

function unknownCmd(w) {
  const b = rank(cmdCands(false), w)[0];
  return b ? `沒有「${w}」這個指令，你是不是要打 /${b.v}？` : `沒有「${w}」這個指令。可以用 /give、/list、/help、/clear。`;
}
function unknownItem(w) {
  const b = rank(itemCands(), w)[0];
  return b ? `沒有「${w}」這個物品，你是不是要打 ${b.v}（${b.name}）？` : `沒有「${w}」這個物品。打 /help 可以看全部物品。`;
}

// 一行文字 → 上色的 HTML(輸入框底下的著色層、紀錄裡的指令回顯、按鈕上的指令都用這個)
function paint(v, toks, cls) {
  let h = '', p = 0;
  toks.forEach((t, i) => { h += `${esc(v.slice(p, t.s))}<span class="${cls[i] || ''}">${esc(t.raw)}</span>`; p = t.e; });
  return h + esc(v.slice(p));
}
function paintStatic(v) { const toks = lex(v); return paint(v, toks, analyze(toks, -1).cls); }

// ---------- 候選與比對 ----------
// 候選:{ v 要填進去的字, keys 比對用(代號、中文名、別名), code 代號, name 名稱, desc 說明, tag 標籤, cat 種類(顏色), icon, wide, whole 整行取代 }
function cmdCands(withHist) {
  const out = Object.entries(CMDS).map(([k, c]) => ({ v: k, keys: [k, c.name, ...c.alias], code: k, name: c.name, desc: c.args ? `${k} ${c.args}` : c.use, cat: 'cmd', icon: CICON[k] }));
  if (!withHist) return out;
  const seen = new Set(), h = [];
  for (let i = S.hist.length - 1; i >= 0 && h.length < 4; i--) if (!seen.has(S.hist[i])) { seen.add(S.hist[i]); h.unshift(S.hist[i]); }
  return out.concat(h.map((l) => ({ v: l, keys: [l], code: l, whole: true, desc: '最近用過', cat: 'hist', icon: CICON.history })));
}

function playerCands() {
  const g = S.game, list = players(), me = list.find((x) => x.self), host = g?.net?.hostSlot;
  const out = [
    { v: 'me', keys: [...SELF, ...(me && g?.net ? [me.name, String(me.n)] : ['1'])], code: 'me', name: '自己', desc: g?.net && me ? `${me.name}，編號 ${me.n}` : '給你自己', cat: 'pl', icon: CICON.me },
    { v: '@a', keys: [...ALL], code: '@a', name: '所有人', desc: g?.net ? `目前 ${list.length} 位玩家` : '單人模式就是你自己', cat: 'pl', icon: CICON.everyone },
  ];
  for (const x of list) if (!x.self) out.push({ v: /\s/.test(x.name) ? String(x.n) : x.name, keys: [x.name, String(x.n)], code: x.name, name: '', desc: `編號 ${x.n}${x.slot === host ? '・房主' : ''}`, cat: 'pl', icon: CICON.me });
  return out;
}

function itemCands() {
  return itemNames().map((k) => { const it = ITEMS[k]; return { v: k, keys: [k, it.name, it.short, ...it.aliases], code: k, name: it.name, desc: it.desc, cat: it.cat, icon: CICON[k], wide: WIDE.has(k) }; });
}
const whoCands = () => [...playerCands(), ...itemCands()];

function countCands(key, q) {
  const it = ITEMS[key], max = maxCount(key), picks = key === 'coins' ? [100, 500, 1000, 10000, max] : [1, 5, 10, max];
  const row = (v, tag) => ({ v: String(v), keys: [String(v)], code: String(v), name: amount(key, clampCount(key, Number(v))), tag, cat: 'num', icon: CICON[key], wide: WIDE.has(key) });
  const out = picks.map((n) => row(n, n === it.def ? '預設' : n === max ? '最大值' : ''));
  if (DIGITS.test(q) && !picks.includes(Number(q))) out.unshift(row(q, Number(q) > max ? `最多 ${max}` : ''));
  return out;
}

// 比對分數:完全相同 1000 > 開頭 > 包含 > 依序出現(模糊) > 打錯一兩個字
function score(q, k) {
  if (k === q) return 1000;
  if (k.startsWith(q)) return 900 - Math.min(80, k.length - q.length);
  const at = k.indexOf(q);
  if (at >= 0) return 700 - Math.min(80, at);
  if (q.length >= 2) { const g = gaps(q, k); if (g >= 0) return 500 - Math.min(80, g * 8); }
  if (q.length >= 3 && Math.min(osa(q, k), osa(q, k.slice(0, q.length))) <= (q.length >= 6 ? 2 : 1)) return 300;
  return 0;
}
// q 的每個字依序出現在 k 裡:回傳中間跳過的字數;沒有就回傳 -1
function gaps(q, k) {
  let j = 0, g = 0, last = -1;
  for (const ch of q) { const at = k.indexOf(ch, j); if (at < 0) return -1; if (last >= 0) g += at - last - 1; last = at; j = at + 1; }
  return g;
}
// 編輯距離(含相鄰兩字對調)
function osa(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 9;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function rank(list, q) {
  q = String(q ?? '').toLowerCase();
  if (!q) return list.map((c) => ({ ...c, exact: false }));
  const out = [];
  list.forEach((c, i) => {
    let best = 0;
    for (const k of c.keys) best = Math.max(best, score(q, String(k).toLowerCase()));
    if (best) out.push({ ...c, exact: best >= 1000, sc: best, i });
  });
  return out.sort((a, b) => b.sc - a.sc || a.i - b.i);
}

// 游標這一格要填什麼:cmd 指令 / who 玩家或物品 / item 物品 / count 數量(要知道是哪個物品)/ null 沒有東西可填
function roleAt(toks, at) {
  const w = toks.map((t) => t.t);
  if (at.tok.v) w.splice(at.i, 0, '');
  if (at.i === 0) return { r: 'cmd' };
  if (findCmd(w[0]) !== 'give') return null;
  const a = w.slice(1), k = at.i - 1;
  if (k === 0) return { r: 'who' };
  const x0 = findItem(a[0]), p0 = typeof targets(a[0]) !== 'string';
  if (k === 1) {
    if (x0 && countable(x0) && !p0) return { r: 'count', key: x0 };
    return p0 || !x0 ? { r: 'item' } : null;
  }
  if (k === 2 && !(x0 && !p0)) { const x1 = findItem(a[1]); return x1 && countable(x1) ? { r: 'count', key: x1 } : null; }
  return null;
}

// ---------- 即時更新:著色層、選單、提示列 ----------
function refresh() {
  if (!S.el) return;
  const v = S.input.value, caret = S.input.selectionStart ?? v.length;
  const toks = lex(v), at = slotAt(toks, caret), A = analyze(toks, at.tok.v ? -1 : at.i), role = roleAt(toks, at);
  S.cx = { v, toks, at, A, role };
  const q = at.tok.t, r = role?.r;
  const list = r === 'cmd' ? cmdCands(!v.trim()) : r === 'who' ? whoCands() : r === 'item' ? itemCands() : r === 'count' ? countCands(role.key, q) : [];
  let c = rank(list, q);
  if (c.length === 1 && c[0].exact) c = []; // 已經打完整了,沒有別的可選
  S.cands = c.slice(0, 40);
  S.sel = !S.cands.length || (r === 'count' && !q) ? -1 : 0; // 數量可以不填:不預選,Enter 直接執行
  S.pt.innerHTML = paint(v, toks, A.cls) + ' ';
  syncScroll();
  requestAnimationFrame(syncScroll); // 輸入框的捲動有時下一幀才更新
  renderMenu();
  renderHint();
}

function syncScroll() { if (S.pt) S.pt.style.transform = `translateX(${-S.input.scrollLeft}px)`; }

const shown = () => !S.menuOff && S.cands.length > 0;

function caption(role) {
  switch (role?.r) {
    case 'cmd': return S.cands.some((c) => c.whole) ? '選一個指令，或重打最近用過的' : '選一個指令';
    case 'who': return '給誰？也可以直接選物品，就是給自己';
    case 'item': return '給什麼？';
    case 'count': return role.key === 'coins' ? '給多少？直接打數字也可以，不填就是 1000' : `要幾個？直接打數字也可以，不填就是 ${ITEMS[role.key].def} 個`;
    default: return '';
  }
}

function renderMenu() {
  const on = shown();
  S.menu.classList.toggle('on', on);
  if (!on) { S.menu.innerHTML = ''; return; }
  const rows = S.cands.map((c, i) => `<div class="mi c-${c.cat}" data-i="${i}"><span class="ic${c.wide ? ' w' : ''}">${c.icon || ''}</span><code>${c.whole ? paintStatic(c.code) : esc(c.code)}</code>${c.name ? `<b>${esc(c.name)}</b>` : ''}<span class="ds">${esc(c.desc || '')}</span>${c.tag ? `<em>${esc(c.tag)}</em>` : ''}</div>`).join('');
  S.menu.innerHTML = `<div class="mh"><span>${esc(caption(S.cx.role))}</span><span><kbd>↑</kbd><kbd>↓</kbd> 選擇　<kbd>Tab</kbd> 套用　<kbd>Esc</kbd> 收起</span></div><div class="ml">${rows}</div>`;
  markSel();
}

function markSel(scroll = true) {
  const box = S.menu.querySelector('.ml');
  if (!box) return;
  for (const r of box.children) r.classList.toggle('sel', +r.dataset.i === S.sel);
  const r = box.children[S.sel];
  if (!scroll || !r) return;
  if (r.offsetTop < box.scrollTop) box.scrollTop = r.offsetTop;
  else if (r.offsetTop + r.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = r.offsetTop + r.offsetHeight - box.clientHeight;
}

function move(d) {
  const n = S.cands.length;
  S.sel = S.sel < 0 ? (d > 0 ? 0 : n - 1) : (S.sel + d + n) % n;
  markSel();
}

// 套用候選:取代游標所在的字,後面補一個空白,接著列出下一格
function accept(i) {
  const c = S.cands[i];
  if (!c) return;
  if (c.whole) { setValue(c.v, c.v.length); return; }
  const { v, at } = S.cx;
  const s = at.i === 0 && at.tok.raw.startsWith('/') ? at.tok.s + 1 : at.tok.s;
  const after = v.slice(at.tok.e);
  const ins = c.v + (after.startsWith(' ') ? '' : ' ');
  setValue(v.slice(0, s) + ins + after, s + c.v.length + 1);
}

// Enter:有選中、而且跟打的字不一樣 → 套用;指令還缺東西、這格已經打完整 → 往下一格;其他 → 執行
function enter() {
  const c = shown() && S.sel >= 0 ? S.cands[S.sel] : null;
  if (c && !c.exact) { accept(S.sel); return; }
  const { A, v, at } = S.cx;
  if (A.need && !A.err && !at.tok.v && at.tok.t && at.tok.e === v.length) { setValue(v + ' ', v.length + 1); return; }
  submit();
}

function renderHint() {
  const { A, role, toks } = S.cx;
  let h;
  if (A.err) h = `<span class="e">${CICON.err}${esc(A.err.text)}</span>`;
  else if (A.ready) h = `<span class="r"><kbd>Enter</kbd> ${A.preview}</span>`;
  else if (findCmd(toks[0]?.t) === 'give') {
    const on = { who: 1, item: 2, count: 3 }[role?.r];
    h = `<span class="u">${['/give', '&lt;玩家&gt;', '&lt;物品&gt;', '[數量]'].map((p, i) => (i === on ? `<b>${p}</b>` : p)).join(' ')}</span><span>玩家可以省略，就是給自己</span>`;
  } else h = '<span><kbd>Tab</kbd> 或 <kbd>Enter</kbd> 套用　<kbd>↑</kbd><kbd>↓</kbd> 選擇　<kbd>Esc</kbd> 收起清單　<kbd>F8</kbd> 關閉面板</span>';
  if (A.tips.length) h += `<span class="t">${CICON.tip}${esc(A.tips[0])}</span>`;
  S.hint.innerHTML = h;
}
