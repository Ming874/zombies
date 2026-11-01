// 封院第 N 天(NARRATIVE_THEORY N3、N4):第 N 次休息(招魂燈熄、game.phase 離開 'fighting')= 2003 年封院十四天裡的第 N 天。
//   game.story.days = { day() 1..14, rests(), state() }
// 每次休息開始(這一波的橫幅收掉之後):畫面中央淡淡浮出「封院第 N 天」(game.motion.card,不蓋黑底),
//   同時把阿嬤那一天的值班日記收進筆記本(線索卡 hd.01～hd.14,deduce.addCard;卡片跟著筆記本跨局保留)。
// 第 7 天就是〈第七暝〉。第 14 天那一頁被撕走了(在 207 的枕頭裡:hc.30〈值班日記・最後一頁〉)。
// 日記只用虛構的人與「封院第 N 天」,不寫真實的月日、人名與職稱(HISTORY §8)。天數是本機算的(多人:各自的休息)。
import { CARD } from './clues.js';

// 阿嬤的值班日記(第一人稱、寫給自己看;每則 60 字以內)
export const DIARY = [
  '中午突然宣布封院，誰都不准出去。我沒帶換洗的衣服，口罩也只剩兩個。',
  '早晚各量一次耳溫，寫在白板上。我是 36.8 度。大家都戴著口罩，沒什麼人說話。',
  '晚上金水哥開車到 B1，隔著鐵網把便當遞進來，還多塞了一顆蘋果給我。',
  '金水哥在鐵網外說起 921 那年，他從山上揹下來一個女孩。我一直想到 207。',
  '護理站的電話一直響，都是家屬打來的。我一個一個回：他有吃飯，他很好。',
  '廣播叫我去一樓大廳，大廳一個人也沒有。回到 207，她的手臂多了一個針孔。',
  '廣播又叫我下樓。我沒有去。\n十一點多，二樓的燈全熄了。我打開檯燈，站到床前。',
  '左手背腫起來了，我沒有跟任何人說。從今天起，我睡在 207 的陪病椅上。',
  '燒到 38.9 度。我自己打電話通報，說是疑似 SARS。這樣，就沒有人敢開 207 的門了。',
  '便當放在門口，敲三下。我隔著門說謝謝。門外的聲音，聽起來都好遠。',
  '又一個同事發燒，被送去隔離了。前幾天她還在幫我量耳溫。走廊越來越安靜。',
  '淑芬打電話來，阿孫在旁邊一直喊阿嬤。我說，阿嬤在上班，快下班了。',
  '檯燈的線接在紅色插座上，不能拔。207 的燈，我每個鐘頭都起來看一次。',
  '（這一頁被撕走了。撕得很整齊，像是她自己撕的。）',
];
export const DAYS = DIARY.length; // 14
const cid = (n) => `hd.${String(n).padStart(2, '0')}`;

export function installDays(game) {
  const X = game.interact;
  if (!X) return null;
  const S = (game.story ||= {});
  const D = () => game.deduce;
  // 線索卡登記進 CARD(書頁照 CARD[id] 畫;不解鎖詞、不支持填空)
  for (let i = 0; i < DAYS; i++) {
    const id = cid(i + 1);
    if (!CARD[id]) CARD[id] = { id, title: `值班日記・封院第 ${i + 1} 天`, src: 'note', words: [], sup: [], text: DIARY[i], day: i + 1 };
  }
  const fresh = () => ({ rests: 0, prev: null, pend: -1, pendDay: 0, tries: 0, shown: [], added: [] });
  let run = fresh();
  const day = () => Math.max(1, Math.min(DAYS, run.rests));
  const API = {
    day,
    rests: () => run.rests,
    state: () => ({ day: day(), rests: run.rests, shown: run.shown.slice(), added: run.added.slice(), pend: run.pend }),
    diary: (n) => DIARY[n - 1] || null,
    cardId: cid,
  };
  S.days = API;
  game.story = Object.assign(game.story || {}, { days: API });

  function addDiary(n) {
    try {
      const id = cid(n);
      if (D()?.addCard?.(id, { by: 'day' })) run.added.push(n);
      else if (D()?.has?.(id)) run.added.push(n); // 以前的夜裡就收過了(筆記本跨局保留)
    } catch (e) { console.warn('[days] diary', e); }
  }
  const canShow = () => {
    const p = game.player, M = game.motion;
    return game.state === 'playing' && game.phase !== 'fighting' && !game.story?.ending?.active && !M?.busy && p && p.alive !== false && !p.downed;
  };
  function show(n) {
    run.shown.push(n);
    const title = `封院第 ${n} 天`, sub = n === 7 ? '〈第七暝〉' : '';
    const M = game.motion;
    try {
      if (M?.card) {
        const c = M.card({ title, sub: sub || undefined, bg: false, className: 'st-day', fadeIn: 1.3, hold: n === 7 ? 2.8 : 2.2, fadeOut: 1.4, z: 55 });
        if (c?.el) c.el.style.background = 'radial-gradient(ellipse 34em 13em at 50% 50%, rgba(0,0,0,.5), rgba(0,0,0,.22) 55%, rgba(0,0,0,0) 100%)'; // 只在字後面壓一點暗(亮的場景也讀得到),不蓋全螢幕
      } else game.ui?.banner?.(title, sub, 3400, '');
    } catch (e) { console.warn('[days] card', e); }
  }
  function start(n) { // 第 n 次休息開始
    if (n > DAYS) return;
    run.pend = 4.2; run.pendDay = n; run.tries = 0; // 等「這一波結束了」的橫幅收掉(3.2 秒)
  }

  X.on('reset', () => { run = fresh(); });
  X.tick((dt) => {
    if (game.state !== 'playing') return true;
    const fight = game.phase === 'fighting';
    if (run.prev === null) { // 第一次看到這一局(中途加入的隊友:用波數估計已經過了幾次休息)
      run.prev = fight;
      run.rests = Math.max(0, (game.round || 1) - (fight ? 1 : 0));
      return true;
    }
    if (run.prev && !fight) { run.rests++; start(run.rests); }
    run.prev = fight;
    if (run.pend >= 0 && (run.pend -= dt) < 0) {
      const n = run.pendDay;
      if (canShow()) { show(n); addDiary(n); }
      else if (fight || ++run.tries > 40) addDiary(n); // 這次休息沒機會亮標題卡:日記照樣收
      else run.pend = 0.5; // 等一下再試(倒下、演出中)
    }
    return true;
  });
  return API;
}
