// 畫面上「說話的字」只有一個地方(使用者回饋:不要收音機、電話一大堆同時說話顯示字幕)。
//   #gh-subs(畫面下方中間)是唯一的字幕區:靈異系統的字幕(src/horror/subs.js)與互動系統的字幕(src/interact/ui.js say)都放在這裡。
//   - 一次只有一個人:新的人開口,上一個人的字立刻收掉;同一個人的上一句變淡留著(最多 1 句)。
//   - 劇情的句子(critical)不會被擋;其他人在別人還在講的時候不出(呼叫的地方連聲音一起不播,或排隊)。
//   - 沒有人說話的聲音字幕(「（電話停了。）」、雜訊):小小的、短短的;有人在說話就不出;任兩句至少隔 6 秒,同一句 30 秒內不重複。
//   - 戰鬥中(15 m 內有活屍、或正在被追):不是劇情的話先不講(combat())。
// API:captions.bind(game) / root() / can(who, critical) / sound(text) / add(q) / drop(q) / live() / combat() / state()
import './captions.css';
const L = []; // { el, who, kind: 'speech' | 'sound', critical, until(說完的時間,performance 秒), cut() }
let G = null, R = null, lastSound = -1e9;
// 說到哪裡用遊戲時間(和聲音的鎖同一個鐘;暫停時不走);還沒綁遊戲就用真實時間
const now = () => (G && Number.isFinite(G.time) ? G.time : performance.now() / 1000);
const seen = new Map();

export const captions = {
  bind(game) { if (G === game) return; G = game; game.interact?.on?.('reset', () => { captions.clear(); lastSound = -1e9; seen.clear(); }); },
  now: () => now(),
  root() {
    if (R && R.isConnected) return R;
    R = document.getElementById('gh-subs');
    if (!R) { R = document.createElement('div'); R.id = 'gh-subs'; document.body.appendChild(R); }
    return R;
  },
  // 還在講(不是講完後留著讓人讀)的那一句
  live() { const t = now(); return L.find((q) => q.kind === 'speech' && t < q.until) || null; },
  // who 可以開口嗎?同一個人接著講可以;劇情的一句可以蓋過別人;其他人等前一個人講完
  can(who, critical = false) {
    const c = captions.live();
    return !c || c.who === (who || '') || !!critical;
  },
  // 聲音字幕可以出來嗎?(可以就記下來)
  sound(text) {
    const t = now(), k = String(text || '');
    if (L.some((q) => q.kind === 'speech') || G?.story?.voice?.busy?.()) return false;
    if (t - lastSound < 6 || t - (seen.get(k) ?? -1e9) < 30) return false;
    lastSound = t; seen.set(k, t);
    return true;
  },
  // 放上一行:別人的字(和聲音字幕)收掉;同一個人的上一句變淡,只留 1 句
  add(q) {
    q.who = q.who || '';
    for (const o of [...L]) if (o.kind === 'sound' || q.kind === 'sound' || o.who !== q.who) captions.cut(o);
    const same = L.filter((o) => o.who === q.who);
    for (const o of same) o.el?.classList.add('prev');
    while (same.length > 1) captions.cut(same.shift());
    L.push(q);
    return q;
  },
  drop(q) { const i = L.indexOf(q); if (i >= 0) L.splice(i, 1); },
  cut(q) { captions.drop(q); try { q.cut?.(); } catch { /* 已經不在了 */ } },
  clear() { for (const q of [...L]) captions.cut(q); },
  // 戰鬥中:正在被追,或 15 m 內有醒著的活屍
  combat() {
    const g = G;
    if (!g || g.state !== 'playing') return false;
    if (g.chase?.active) return true;
    for (const z of g.zombies || []) if (z.alive && !z.amb?.dormant && (z.dist ?? 99) < 15) return true;
    return false;
  },
  state() { return L.map((q) => ({ who: q.who, kind: q.kind, critical: !!q.critical, live: now() < q.until })); },
};
if (typeof window !== 'undefined') window.__captions = captions;
// 收掉的那一行:很快淡掉(不要和新的人疊在一起)
export function cutEl(el, ms = 220) {
  if (!el) return;
  el.style.transition = `opacity ${ms}ms linear, filter ${ms}ms linear`;
  el.classList.add('out', 'cut');
  setTimeout(() => el.remove(), ms + 40);
}
