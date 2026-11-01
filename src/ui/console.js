import './console.css';
import { ITEMS, findItem, itemNames, clampCount, applyGive } from '../game/give.js';

// ===== 控制面板(F8 開關)=====
// 指令:/give <玩家> <物品> [數量]、/list、/help、/clear(斜線可省略)。↑↓ 歷史紀錄、Tab 自動完成、Esc 關閉。
// 玩家:me / @s 自己、@a 所有人、/list 裡的編號、或暱稱(可只打開頭)。多人模式只有房主能 /give(伺服器也只轉發房主的 'gv')。
// 開著時:單人遊戲暫停;多人世界照常進行,但本機玩家不能動。
//
// 鍵盤:遊戲有很多在捕獲階段處理按鍵的模組(flow.js、互動、推理本…)。本模組在載入時就註冊 window 捕獲監聽器(main.js 第一個 import),
// 比其他模組都早 → 面板開著時用 stopImmediatePropagation 吞掉所有按鍵(只擋事件傳遞,不擋輸入框打字)。

const S = { game: null, open: false, el: null, log: null, input: null, hint: null, hist: [], hi: 0 };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const SELF = new Set(['me', '@s', '@p', 'self', 'local', '我', '自己']);
const ALL = new Set(['@a', 'all', '所有人', '全部玩家']);

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
  if (e.key === 'Escape') { e.preventDefault(); close(false); }
  else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); recall(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); recall(1); }
  else if (e.key === 'Tab') { e.preventDefault(); complete(); }
}

function build() {
  if (S.el) return;
  const el = document.createElement('div');
  el.id = 'hzcon';
  el.innerHTML = '<div class="hd"><span>控制面板</span><span>F8 / Esc 關閉 · Tab 自動完成 · ↑↓ 歷史</span></div><div class="log"></div><div class="row"><b>›</b><input spellcheck="false" autocomplete="off" placeholder="/give me rpg" /></div><div class="hint"></div>';
  document.body.appendChild(el);
  S.el = el;
  S.log = el.querySelector('.log');
  S.input = el.querySelector('input');
  S.hint = el.querySelector('.hint');
  S.input.addEventListener('input', updateHint);
  print('輸入 /help 查看指令，例如：/give me rpg', 'dim');
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
  S.input.focus();
  updateHint();
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

function print(text, cls = 'info') {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  S.log.appendChild(d);
  while (S.log.childElementCount > 200) S.log.firstElementChild.remove();
  S.log.scrollTop = S.log.scrollHeight;
}

function submit() {
  const line = S.input.value.trim();
  S.input.value = '';
  updateHint();
  if (!line) return;
  if (S.hist[S.hist.length - 1] !== line) S.hist.push(line);
  if (S.hist.length > 50) S.hist.shift();
  S.hi = S.hist.length;
  print(`› ${line}`, 'cmd');
  if (!S.game) { print('遊戲還在載入中，請稍候', 'err'); return; }
  const [name, ...args] = line.replace(/^\//, '').split(/\s+/);
  const c = CMDS[name.toLowerCase()];
  if (!c) { print(`未知的指令：${name}（輸入 /help 查看指令）`, 'err'); return; }
  try { c.run(args); } catch (e) { print(`執行失敗：${e.message}`, 'err'); console.error('[console]', e); }
}

function recall(d) {
  if (!S.hist.length) return;
  S.hi = Math.max(0, Math.min(S.hist.length, S.hi + d));
  S.input.value = S.hist[S.hi] ?? '';
  S.input.setSelectionRange(S.input.value.length, S.input.value.length);
  updateHint();
}

// ---------- 玩家 ----------
// 清單:{ n 編號, slot 座位(單人 null), name, p 玩家物件, self };多人時編號 = 座位 + 1(有人離開也不會變)
function players() {
  const g = S.game;
  if (!g.net) return [{ n: 1, slot: null, name: g.player.name || '你', p: g.player, self: true }];
  const s = g.net, list = [{ slot: s.me, name: s.myName(), p: g.player, self: true }];
  for (const rp of s.remotes.values()) if (rp.connected !== false) list.push({ slot: rp.id, name: rp.name, p: rp, self: false });
  return list.sort((a, b) => a.slot - b.slot).map((x) => ({ ...x, n: x.slot + 1 }));
}

// 參數 → 玩家陣列;找不到回傳錯誤字串
function targets(arg) {
  const list = players(), a = String(arg).toLowerCase();
  if (SELF.has(a)) return list.filter((x) => x.self);
  if (ALL.has(a)) return list;
  if (/^\d+$/.test(a)) { const x = list.find((q) => q.n === Number(a)); return x ? [x] : `找不到編號 ${a} 的玩家（/list 查看）`; }
  const exact = list.filter((q) => q.name.toLowerCase() === a);
  if (exact.length) return exact;
  const pre = list.filter((q) => q.name.toLowerCase().startsWith(a));
  if (pre.length === 1) return pre;
  return pre.length ? `「${arg}」符合多位玩家：${pre.map((q) => q.name).join('、')}` : `找不到玩家「${arg}」（/list 查看）`;
}

// ---------- 指令 ----------
const CMDS = {
  help: {
    usage: '/help',
    run() {
      print('指令：', 'info');
      print('  /give <玩家> <物品> [數量]   給予物品（玩家可省略 = 自己）', 'info');
      print('  /list                        玩家清單與編號', 'info');
      print('  /clear                       清除畫面', 'info');
      print('玩家：me（自己）、@a（所有人）、編號、或暱稱', 'info');
      print(`物品：${itemNames().join('  ')}`, 'info');
      print('數量：rocket / grenade / medkit 的個數、coins 的金額（預設 1000）', 'dim');
      print('例：/give me rpg　/give 2 coins 500　/give @a grenade 3', 'dim');
    },
  },
  list: {
    usage: '/list',
    run() {
      const g = S.game, host = g.net?.hostSlot;
      for (const x of players()) print(`  ${String(x.n).padStart(2)}  ${x.name}${x.self && g.net ? '（你）' : ''}${g.net && x.slot === host ? '（房主）' : ''}`, 'info');
      if (!g.net) print('單人模式只有你自己：用 me 或 1', 'dim');
    },
  },
  clear: { usage: '/clear', run() { S.log.textContent = ''; } },
  give: {
    usage: '/give <玩家> <物品> [數量]',
    run(args) {
      const g = S.game;
      if (g.state !== 'playing') { print('要在遊戲中才能使用 /give', 'err'); return; }
      if (g.net && !g.net.isHost) { print('多人模式只有房主可以使用 /give', 'err'); return; }
      if (!args.length) { print('用法：/give <玩家> <物品> [數量]', 'err'); return; }
      // 只給物品(/give rpg [數量])= 給自己
      let who = args[0], what = args[1], num = args[2];
      if (findItem(who) && (what === undefined || /^\d+$/.test(what))) { num = what; what = who; who = 'me'; }
      const key = findItem(what);
      if (!key) { print(what ? `沒有這個物品：${what}（/help 查看物品）` : '請指定物品，例如：/give me rpg', 'err'); return; }
      if (num !== undefined && !/^\d+$/.test(num)) { print(`數量要是正整數：${num}`, 'err'); return; }
      const ts = targets(who);
      if (typeof ts === 'string') { print(ts, 'err'); return; }
      const count = num === undefined ? undefined : clampCount(key, Number(num));
      for (const t of ts) {
        if (t.self) {
          const msg = applyGive(g, key, count);
          print(`已給予 ${t.name}：${msg}`, 'ok');
        } else if (t.p.connected === false) print(`${t.name} 已斷線`, 'err');
        else {
          g.net.give(t.slot, key, count);
          print(`已送給 ${t.name}：${ITEMS[key].name}${count && ITEMS[key].def ? ` ×${count}` : ''}`, 'ok');
        }
      }
    },
  },
};

// ---------- 提示與自動完成 ----------
function tokens() { return S.input.value.replace(/^\//, '').split(/\s+/); }

// 目前要補的是第幾個參數、候選有哪些
function candidates() {
  const t = tokens(), i = t.length - 1, cmd = t[0].toLowerCase();
  if (i === 0) return Object.keys(CMDS);
  if (cmd !== 'give' || !S.game) return [];
  const playerArg = ['me', '@a', ...players().map((x) => x.name)];
  if (i === 1) return [...playerArg, ...itemNames()];
  if (i === 2 && !findItem(t[1])) return itemNames();
  return [];
}

function complete() {
  const t = tokens(), last = t[t.length - 1].toLowerCase();
  const hits = candidates().filter((c) => c.toLowerCase().startsWith(last));
  if (!hits.length) return;
  let pre = hits[0];
  for (const h of hits) while (!h.toLowerCase().startsWith(pre.toLowerCase())) pre = pre.slice(0, -1);
  t[t.length - 1] = hits.length === 1 ? hits[0] + ' ' : pre;
  S.input.value = '/' + t.join(' ').replace(/^\//, '');
  updateHint();
  if (hits.length > 1) S.hint.textContent = hits.join('  ');
}

function updateHint() {
  if (!S.hint) return;
  const t = tokens(), c = CMDS[t[0].toLowerCase()];
  if (t.length === 1) { const h = Object.keys(CMDS).filter((k) => k.startsWith(t[0].toLowerCase())); S.hint.innerHTML = esc(h.map((k) => CMDS[k].usage).join('    ')); return; }
  S.hint.innerHTML = c ? esc(c.usage) : '';
}
