import { ICON, withKeys } from './icons.js';
import { captions } from './captions.js';

// 新手提示:依情境各顯示一次(記在 localStorage,隱私模式時只記在本次),一次一張、排隊顯示。
// [T] 或點 × 關閉目前這張;設定裡可以整個關掉或重新顯示。觸發點在 flow.js(tutorial / updateTutorial)。
const KEY = 'shh.tips.v1';
export const TIP_TEXT = {
  move: ['基本操作', '[W][A][S][D] 移動 · [Shift] 奔跑 · [Space] 跳躍 · [C] 蹲下'],
  shoot: ['戰鬥', '[左鍵] 射擊 · [右鍵] 開鏡 · [R] 換彈 · [V] 小刀 · [F] 手電筒'],
  head: ['瞄準頭部', '打頭：傷害加倍，錢也多拿 50%。連續快速擊殺，倍率會往上疊。'],
  reload: ['彈藥偏低', '按 [R] 換彈。活屍會掉發光的彈匣，走過去就會自動撿起來。'],
  drop: ['掉落物', '橘光是彈匣、綠光是醫療包、黃綠光是手榴彈。走近就會自動吸過來，大約 40 秒後消失。'],
  shop: ['金水商行開門了', '每一波打完是休息時間。跟著推車標記找到金水伯的店，按 [E] 買東西。想直接開打，按 [N]。'],
  shopui: ['金水商行', '[1]–[4] 切換分頁 · [↑][↓] 選擇 · [Enter] 購買 · [E] 離開。改裝可以提高傷害、彈匣容量、換彈速度和穩定度。'],
  grenade: ['手榴彈', '按 [G] 丟出去，大約 3 秒後爆炸。適合對付一大群活屍。'],
  medkit: ['醫療包', '按 [H] 使用：2 秒內回復 50 生命。用的時候不能開槍。'],
  lowhp: ['生命偏低', '先退到安全的地方，按 [H] 用醫療包，或去撿綠光的醫療包。每一波打完，也會回一點血。'],
  stamina: ['耐力耗盡', '先放開 [Shift]，等耐力條回來，才能再跑。'],
  map: ['地圖', '按 [M] 拿出撕下來的平面圖，[PgUp]/[PgDn] 翻樓層。補給站已經圈好了；走過的地方才會清楚，看過的彈藥櫃、醫療櫃會記上記號。'],
  supply: ['補給櫃', '彈藥櫃和醫療櫃，每一波可以用一次。站在櫃子前面按 [E]。'],
  brute: ['巨屍', '他吼完會直直衝過來。往旁邊閃開，讓他撞牆暈過去，再打他的頭。'],
  bloater: ['膿腫者', '他死的時候會爆炸，留下一團毒氣。趁他還在遠處就解決他，不要讓他靠近。'],
  lantern: ['招魂燈是什麼？', '大新在屋頂裝了一盞招魂燈，就像中元普渡時廟口豎起來的那種燈。燈一亮，就會把活屍叫過來，這就是一波；燈熄了是休息時間，金水伯的店會開門。'],
  deduce: ['筆記本', '[J] 打開筆記本：「到目前為止」寫著你知道的事和下一步。把詞填進空格，到阿嬤的照片前按住 [E] 擲筊'],
  taboo: ['鬼月禁忌', '晚上不要吹口哨、有人叫你名字不要回頭、路邊的紅包不要撿、被拍肩膀不要轉頭'],
  radio: ['收音機', '[Q] 舉起／放下收音機（舉起時聽得比較清楚）· 舉起時按住 [Q] 調頻 · 放下時按住 [Q] 開／關。收音機叫起來，就是活屍靠近了。'],
  ama: ['阿嬤叫你', '你倒下的時候，阿嬤會叫你回來。她叫得動你幾次，看難度。'],
};

function load() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); }
}

export class Tips {
  constructor(hudRoot) {
    this.seen = load();
    this.queue = [];
    this.cur = null;
    this.t = 0;
    this.enabled = true;
    const el = (this.el = document.createElement('div'));
    el.className = 'hd hd-tip hd-hide';
    el.innerHTML = `<div class="tt"><span class="ic">${ICON.bolt}</span><b></b><span class="sp"></span><kbd class="kc">T</kbd><small>關閉</small></div><div class="tx"></div><div class="tl"><i></i></div>`;
    hudRoot.appendChild(el);
    this.titleEl = el.querySelector('b');
    this.textEl = el.querySelector('.tx');
    this.lifeEl = el.querySelector('.tl i');
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat && this.cur && !e.target?.closest?.('input, textarea')) this.dismiss(); });
  }

  _save() { try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* 隱私模式:只記在本次 */ } }
  has(id) { return this.seen.has(id); }

  // 排入一張提示(看過、停用、已在排隊中就略過);delay 秒後才出現
  show(id, delay = 0) {
    if (!this.enabled || this.seen.has(id) || !TIP_TEXT[id] || this.cur?.id === id || this.queue.some((q) => q.id === id)) return false;
    this.queue.push({ id, wait: delay });
    return true;
  }

  dismiss() {
    if (!this.cur) return;
    this.cur = null;
    this.el.classList.add('hd-hide');
  }

  reset() { this.seen.clear(); this._save(); this.queue.length = 0; this.dismiss(); }
  clearQueue() { this.queue.length = 0; this.dismiss(); }
  setEnabled(on) { this.enabled = !!on; if (!on) this.clearQueue(); }

  update(dt) {
    for (const q of this.queue) q.wait -= dt;
    if (this.cur) {
      this.t -= dt;
      this.lifeEl.style.transform = `scaleX(${Math.max(0, this.t / this.cur.life).toFixed(3)})`;
      if (this.t <= 0) this.dismiss();
      return;
    }
    if (captions.live()?.critical) return; // 劇情的人在說話:提示等一下再出來(不和故事搶眼睛)
    const i = this.queue.findIndex((q) => q.wait <= 0);
    if (i < 0) return;
    const { id } = this.queue.splice(i, 1)[0];
    const [title, text] = TIP_TEXT[id];
    this.seen.add(id);
    this._save();
    this.cur = { id, life: Math.min(14, 6 + text.length * 0.12) };
    this.t = this.cur.life;
    this.titleEl.textContent = title;
    this.textEl.innerHTML = withKeys(text);
    this.el.classList.remove('hd-hide');
    this.el.getAnimations().forEach((a) => a.cancel());
    this.el.animate([{ opacity: 0, transform: 'translateX(-1.2em)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
  }
}
