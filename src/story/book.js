import './book.css';
import { QUESTION, WORDS, CATS, THROW } from './clues.js';
import { sfx, ix as ixs } from '../audio.js';

// 筆記本畫面(J):左頁是題目與填空句,右頁是詞庫/線索卡。
// 打開時放開滑鼠鎖定(要用滑鼠點/拖曳);單人世界暫停;多人世界不停(本機玩家不能動,受傷自動收起)。
// [J] / [E] 收起(重新鎖定滑鼠);[Esc] 收起並叫出暫停選單;[1]~[7] 選空格;右鍵清除空格。
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SRC = { note: '紙本', photo: '照片', tape: '錄音', call: '電話', ghost: '耳語', env: '現場', video: '錄影' };
const BL = Object.keys(QUESTION.blanks);

export class Book {
  constructor(game, D) {
    this.game = game; this.D = D; this.isOpen = false; this.sel = null; this.tab = 'notes'; this.card = null; this.el = null; this.hurt = 0;
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }
  canOpen() {
    const g = this.game, p = g.player;
    if (g.state !== 'playing' || g.shopUIOpen || g.interact?.modal || !p || p.alive === false || p.downed) return false;
    if (g.paused) return false; // 暫停選單開著
    if (g.net?.mode?.pvp) return false; // 對戰不是正史
    return true;
  }
  onKey(e) {
    const g = this.game;
    if (!this.isOpen) {
      if (e.code === 'KeyJ' && !e.repeat && !e.target?.closest?.('input, textarea') && this.canOpen()) {
        if (g.ui?.map?.isOpen) g.ui.map.close();
        e.preventDefault(); e.stopImmediatePropagation();
        this.open();
      }
      return;
    }
    if (e.target?.closest?.('input, textarea')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.code === 'KeyJ' || e.code === 'KeyE' || e.code === 'Tab') { this.close(true); return; }
    if (e.code === 'Escape') { this.close(false); g.paused = true; g.ui?.overlay?.('pause', true); return; }
    const d = /^(?:Digit|Numpad)([1-7])$/.exec(e.code);
    if (d) { this.select(BL[+d[1] - 1]); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') { if (this.sel) { this.D.clear(this.sel); ixs.paper?.(); this.draw(); } return; }
    const TABS = ['notes', 'words', 'cards'], ti = TABS.indexOf(this.tab);
    if (e.code === 'KeyQ' || e.code === 'BracketLeft') { this.tab = TABS[Math.max(0, ti - 1)]; this.draw(); return; }
    if (e.code === 'KeyW' || e.code === 'BracketRight') { this.tab = TABS[Math.min(2, ti + 1)]; if (this.tab === 'cards') this.D.seenAll(); this.draw(); }
  }
  open() {
    if (this.isOpen || !this.canOpen()) return false;
    const g = this.game;
    if (!this.el) this.build();
    if (!this.isOpen && !this.D.hintBlank) this.tab = 'notes'; // 打開時先看〈到目前為止〉
    try { g.story?.notes?.bookOpened?.(); } catch { /* 略 */ }
    this.isOpen = true;
    g.bookOpen = true; // input.js:放開滑鼠鎖定時不要叫出暫停選單
    this.paused = !g.paused;
    g.paused = true;
    this.hurt = g.player.lastHurt;
    if (g.input) { g.input.fireHeld = false; g.input.firePressed = false; g.input.aimHeld = false; }
    g.ui?.prompt?.(null);
    if (document.pointerLockElement) document.exitPointerLock();
    if (!this.sel) this.sel = BL.find((b) => !this.D.state().fill[b]) || null;
    this.draw();
    this.el.classList.add('on');
    try { ixs.paper?.(); } catch { /* 略 */ }
    return true;
  }
  close(relock = true) {
    if (!this.isOpen) return false;
    const g = this.game;
    this.isOpen = false;
    this.el.classList.remove('on');
    try { ixs.paperClose?.(); } catch { /* 略 */ }
    if (this.paused && !document.getElementById('pause')?.classList.contains('on')) g.paused = false;
    this.paused = false;
    const done = () => { g.bookOpen = false; };
    if (relock && g.state === 'playing') {
      try {
        const r = g.canvas.requestPointerLock();
        if (r?.then) r.then(done, () => { done(); g.paused = true; g.ui?.overlay?.('pause', true); }); else setTimeout(done, 300);
      } catch { done(); g.paused = true; g.ui?.overlay?.('pause', true); }
    } else done();
    return true;
  }
  select(b) { this.sel = b && this.sel === b ? null : b; if (b) this.tab = 'words'; this.draw(); }
  put(b, w) {
    if (!b || !w) return;
    if (this.D.fill(b, w)) {
      ixs.paper?.();
      this.sel = BL.find((k) => !this.D.state().fill[k]) || null;
      this.draw();
    } else sfx.pickupDeny?.();
  }
  build() {
    const el = this.el = document.createElement('div');
    el.className = 'dd-book';
    el.innerHTML = '<div class="dd-spread"><section class="dd-page dd-l"></section><section class="dd-page dd-r"></section></div><div class="dd-ft"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-b]'), w = e.target.closest('[data-w]'), t = e.target.closest('[data-tab]'), c = e.target.closest('[data-card]');
      if (s) { this.select(s.dataset.b); return; }
      if (w) { const cat = WORDS[w.dataset.w].cat; const b = this.sel && QUESTION.blanks[this.sel].cat === cat ? this.sel : BL.find((k) => QUESTION.blanks[k].cat === cat && !this.D.state().fill[k]) || BL.find((k) => QUESTION.blanks[k].cat === cat); this.put(b, w.dataset.w); return; }
      if (t) { this.tab = t.dataset.tab; if (this.tab === 'cards') this.D.seenAll(); this.draw(); return; }
      if (c) { this.card = this.card === c.dataset.card ? null : c.dataset.card; this.draw(); return; }
      if (e.target.closest('.dd-x')) this.close(true);
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); const s = e.target.closest('[data-b]'); if (s) { this.D.clear(s.dataset.b); this.sel = s.dataset.b; ixs.paper?.(); this.draw(); } });
    el.addEventListener('dragstart', (e) => { const w = e.target.closest('[data-w]'); if (w) { e.dataTransfer.setData('text/plain', w.dataset.w); e.dataTransfer.effectAllowed = 'move'; this.drag = w.dataset.w; this.draw(true); } });
    el.addEventListener('dragend', () => { this.drag = null; this.draw(true); });
    el.addEventListener('dragover', (e) => { const s = e.target.closest('[data-b]'); if (s && this.drag && WORDS[this.drag].cat === QUESTION.blanks[s.dataset.b].cat) e.preventDefault(); });
    el.addEventListener('drop', (e) => { const s = e.target.closest('[data-b]'); const w = e.dataTransfer.getData('text/plain'); if (s && WORDS[w]) { e.preventDefault(); this.put(s.dataset.b, w); } this.drag = null; });
  }
  draw(dragOnly = false) {
    if (!this.el) return;
    const D = this.D, st = D.state(), solved = D.solved(), fill = st.fill;
    const dragCat = this.drag ? WORDS[this.drag]?.cat : null;
    // ---- 左頁:題目 ----
    const slot = (b) => {
      const B = QUESTION.blanks[b], w = fill[b], i = BL.indexOf(b) + 1;
      const cls = ['dd-slot', w ? 'full' : 'empty', this.sel === b && !solved ? 'sel' : '', D.hintBlank === b && !solved ? 'hint' : '', dragCat && dragCat === B.cat ? 'drop' : ''].filter(Boolean).join(' ');
      return `<button class="${cls}" data-b="${b}" title="${esc(CATS[B.cat])}"><sup>${i}</sup>${w ? esc(WORDS[w].text) : `<em>${esc(CATS[B.cat])}</em>`}</button>`;
    };
    const sent = QUESTION.sentences.map((s) => `<p>${esc(s).replace(/\{(b\d)\}/g, (_, b) => slot(b))}</p>`).join('');
    const n = D.filled(), last = st.last;
    const lastTxt = last ? `上一次：${THROW.name[last.result]}${last.result === 'sheng' ? '' : `，對了 ${last.n} 個，共 ${last.m} 個`}` : '';
    const hint = solved ? '' : n === QUESTION.m ? '<div class="dd-hint ready">已填好。到 2F 護理站阿嬤的照片前，按住 <kbd>E</kbd> 擲筊（丟兩片筊杯問阿嬤：一正一反＝聖筊＝全對）。</div>'
      : `<div class="dd-hint">點一個空格，再從右頁挑一個詞（也可以直接拖過去）。線索越多，詞越多。</div>`;
    const truth = solved ? `<div class="dd-truth"><div class="dd-seal">聖筊</div><h3>最後一頁</h3><p>${esc(QUESTION.truth)}</p></div>` : '';
    this.el.querySelector('.dd-l').innerHTML = `<div class="dd-hd"><span>筆記本</span><span>〈第七暝〉聖心醫院</span></div>
      <h2>${esc(QUESTION.title)}</h2><div class="dd-sent${solved ? ' solved' : ''}">${sent}</div>
      <div class="dd-stat"><span>已填 ${n}／${QUESTION.m}</span>${lastTxt ? `<span>${esc(lastTxt)}</span>` : ''}</div>${hint}${truth}`;
    if (dragOnly) return;
    // ---- 右頁:詞庫 / 線索 ----
    const cards = D.cards(), fresh = st.fresh.length;
    const notes = this.game.story?.notes, nfresh = notes?.fresh || 0;
    const tabs = `<nav class="dd-tabs"><button data-tab="notes" class="${this.tab === 'notes' ? 'on' : ''}">到目前為止${nfresh && this.tab !== 'notes' ? '<i>新</i>' : ''}</button><button data-tab="words" class="${this.tab === 'words' ? 'on' : ''}">可以用的詞 <small>${D.words().length}</small></button><button data-tab="cards" class="${this.tab === 'cards' ? 'on' : ''}">線索 <small>${cards.length}</small>${fresh && this.tab !== 'cards' ? '<i>新</i>' : ''}</button><button class="dd-x" title="收起">×</button></nav>`;
    let body = '';
    if (this.tab === 'notes') { // 〈到目前為止〉:下一步 + 你現在知道的事(新的在上面)
      const nx = notes?.next?.(), items = notes?.list?.() || [], seen = this.notesSeen ?? -1;
      body = `<div class="dd-next"><b>下一步：</b>${nx ? `${esc(nx.goal)}${nx.why ? `<small>｜${esc(nx.why)}</small>` : ''}` : '活下去，等天亮。'}</div>`
        + (items.length ? `<ol class="dd-notes">${items.map((it) => `<li class="${it.t > seen ? 'new' : ''}">${esc(it.text)}</li>`).join('')}</ol>` : '<div class="dd-empty">還沒有寫什麼。</div>');
      notes?.seen?.(); this.notesSeen = this.game.time;
    } else if (this.tab === 'words') {
      const words = D.words(), selCat = this.sel ? QUESTION.blanks[this.sel].cat : null, used = new Set(Object.values(fill));
      if (!words.length) body = '<div class="dd-empty">還沒有詞。看到、撿到、聽到的線索會自己記進來。</div>';
      else body = Object.entries(CATS).map(([cat, nm]) => {
        const ws = words.filter((w) => WORDS[w].cat === cat);
        if (!ws.length) return '';
        return `<div class="dd-cat${selCat === cat ? ' hot' : selCat ? ' dim' : ''}"><h4>${esc(nm)}</h4><div>${ws.map((w) => `<span class="dd-w${used.has(w) ? ' used' : ''}" data-w="${w}" draggable="${solved ? 'false' : 'true'}">${esc(WORDS[w].text)}</span>`).join('')}</div></div>`;
      }).join('');
    } else {
      if (!cards.length) body = '<div class="dd-empty">還沒有線索。</div>';
      else body = `<ol class="dd-cards">${cards.map((c) => `<li data-card="${c.id}" class="${this.card === c.id ? 'open' : ''}"><b>${esc(c.title)}</b><small>${esc(SRC[c.src] || '')}</small>${this.card === c.id ? `<p>${esc(c.text).replace(/\n/g, '<br>')}</p>` : ''}</li>`).join('')}</ol>`;
    }
    this.el.querySelector('.dd-r').innerHTML = tabs + `<div class="dd-body">${body}</div>`;
    this.el.querySelector('.dd-ft').innerHTML = '點空格，再點詞（或拖曳） · 右鍵清除 · <kbd>1</kbd>~<kbd>7</kbd> 選空格 · <kbd>J</kbd> 收起 · <kbd>Esc</kbd> 暫停選單' + (this.game.net ? ' · 世界沒有暫停，受傷會自動收起' : '');
  }
}
