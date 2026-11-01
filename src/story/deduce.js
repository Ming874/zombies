// 筆記本系統(game.deduce;正典 STORY_v2 §3.8、HOSPITAL_CLUES_v2 §0～§3)。
//
//   game.deduce.addCard(id, { by })   收卡:解鎖卡上的詞,HUD 角落閃「＋線索 [J]」(重複收不會重複算)
//   game.deduce.has(id) / cards() / words()
//   game.deduce.fill(blank, wordId) / clear(blank) / ready() / score() → { n, m }
//   game.deduce.throw() → { result: 'sheng' | 'xiao' | 'yin', n, m } | null(還有空格)
//   game.deduce.solved()
//   game.deduce.open() / close() / toggle()   筆記本畫面(J)
//   game.objectives.clue(id)   = addCard(靈異系統 STORY3 的 card 欄位會呼叫這個)
//
// 多人:卡、詞、填空、擲筊都是「每位玩家各自的」(本機,存在 localStorage,跨局保留;醫院每一夜會重置,筆記本不會)。
// 第一個擲出聖筊的人替全隊打開 207:本機設旗標 h.207.unlock、門自己打開(門的開關本來就同步),
// 再送 'ixf' 給其他人,其他人的鎖也跟著解開(不需要房主仲裁:只會從鎖著變成打開)。
import { MAP, QUESTION, WORDS, CARD, CARDS, NOTE_CARD, WHISPER, LOOK, TALK, THROW } from './clues.js';
import { Book } from './book.js';
import * as THREE from 'three';
import { sfx, ghost } from '../audio.js';
import { secsOf, voiceLock, free, wait, seq, line, radioReady } from './voice.js';

const KEY = 'hz.deduce.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const _v3 = new THREE.Vector3();

export function installDeduce(game) {
  const all = load();
  const blank = () => ({ cards: [], words: [], fill: {}, solved: false, last: null, throws: 0, fresh: [] });
  const S = () => (all[MAP] ||= blank());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 無痕模式 */ } };
  const subs = new Map();
  const emit = (ev, d) => { for (const fn of subs.get(ev) || []) { try { fn(d); } catch (e) { console.warn('[deduce]', ev, e); } } };
  const ix = () => game.interact;
  const H = () => game.horror;
  const run = { shops: 0, k1: false, k2: false, w02: false, tq: null, tqLate: false, tqAt: 0, look: new Map(), memT: 0, opened207: false, xl: false };

  const D = {
    q: QUESTION, map: MAP,
    on(ev, fn) { if (!subs.has(ev)) subs.set(ev, new Set()); subs.get(ev).add(fn); return () => subs.get(ev).delete(fn); },
    has(id) { return S().cards.includes(id); },
    cards() { return S().cards.map((id) => CARD[id]).filter(Boolean); },
    words() { return S().words.filter((w) => WORDS[w]); },
    isFresh(id) { return S().fresh.includes(id); },
    seenAll() { S().fresh.length = 0; save(); badge.set(0); },
    state() { return S(); },
    addCard(id, o = {}) {
      const c = CARD[id];
      if (!c) return false;
      const s = S();
      if (s.cards.includes(id)) return false;
      s.cards.push(id);
      s.fresh.push(id);
      let nw = 0;
      for (const w of c.words || []) if (!s.words.includes(w)) { s.words.push(w); nw++; }
      save();
      badge.set(s.fresh.length, true);
      game.ui?.feed?.(`＋線索〈${c.title}〉${nw ? ` · 新的詞 ${nw} 個` : ''}`, { color: '#e3c98a', ms: 4200 });
      emit('card', { id, by: o.by || null, words: nw });
      if (book.isOpen) book.draw();
      if (s.cards.length === 1 && !s.taught) { s.taught = true; save(); game.ui?.tips?.show?.('deduce', 2); ix()?.after?.(2.4, () => talk(TALK.bookTeach)); } // 第一張卡:小美教你按 J
      return true;
    },
    addWords(list) { const s = S(); let n = 0; for (const w of list) if (WORDS[w] && !s.words.includes(w)) { s.words.push(w); n++; } if (n) { save(); if (book.isOpen) book.draw(); } return n; },
    fill(b, w) {
      const B = QUESTION.blanks[b], s = S();
      if (!B || s.solved) return false;
      if (w == null) { delete s.fill[b]; save(); emit('fill', { b, w: null }); return true; }
      if (!WORDS[w] || WORDS[w].cat !== B.cat || !s.words.includes(w)) return false;
      for (const [k, v] of Object.entries(s.fill)) if (v === w && k !== b) delete s.fill[k]; // 同一個詞只能放一格
      s.fill[b] = w;
      if (D.hintBlank === b) D.hintBlank = null;
      save();
      emit('fill', { b, w });
      return true;
    },
    clear(b) { return D.fill(b, null); },
    filled() { return Object.keys(QUESTION.blanks).filter((b) => S().fill[b]).length; },
    ready() { return D.filled() === QUESTION.m; },
    score() { const s = S(); let n = 0; for (const [b, B] of Object.entries(QUESTION.blanks)) if (s.fill[b] === B.answer) n++; return { n, m: QUESTION.m }; },
    solved() { return !!S().solved; },
    // 擲筊:回傳結果(動畫與台詞由遺照那邊播);沒有懲罰
    throw() {
      if (!D.ready()) return null;
      const { n, m } = D.score(), s = S();
      const result = s.solved ? 'sheng' : THROW.judge(n, m);
      s.throws++;
      s.last = { result, n, m, t: Date.now() };
      save();
      emit('throw', s.last);
      return { result, n, m };
    },
    // 擲筊動畫播完:公布結果、聖筊的獎勵
    resolve(r, pos) {
      if (!r) return;
      const nm = THROW.name[r.result], txt = THROW.text[r.result].replace('{n}', r.n).replace('{m}', r.m);
      const silent = !!H()?.director?.silent;
      if (r.result === 'sheng') {
        const s = S(), first = !s.solved;
        s.solved = true; save();
        game.ui?.banner?.(nm, '對了。……阿孫，你好聰明。', 4200, 'gold');
        if (silent) seq(game, [['ama', '對了。……阿孫，你好聰明。', undefined, { ear: 'both', many: true }]]); // 排隊
        try { sfx.folk('bell', pos); } catch { /* 還沒烘焙好 */ }
        ix()?.flags?.set?.('h.q.solved', true);
        ix()?.flags?.set?.('meta.deduce.hospital.solved', true);
        if (first) emit('solved', r);
        ix()?.after?.(2.2, () => unlock207(true));
      } else {
        game.ui?.banner?.(nm, txt.replace(/^.筊。/, ''), 3800, '');
        game.ui?.feed?.(txt, { color: '#cfc6b0', ms: 6000 });
        if (silent && pos) { // 阿嬤不說話:推車輪子聲慢慢走遠
          const q = { x: pos.x, y: pos.y, z: pos.z }, pp = game.player.pos, dx = q.x - pp.x, dz = q.z - pp.z, dl = Math.hypot(dx, dz) || 1;
          try { ghost.cart(q, 5); } catch { /* 略 */ }
          let t = 0;
          ix()?.tick?.((dt) => { t += dt; q.x += (dx / dl) * dt * 0.9; q.z += (dz / dl) * dt * 0.9; return t < 5.5; });
        }
      }
      if (book.isOpen) book.draw();
    },
    open() { return book.open(); },
    close(relock = true) { return book.close(relock); },
    toggle() { return book.isOpen ? book.close() : book.open(); },
    get isOpen() { return book.isOpen; },
    reset() { all[MAP] = blank(); save(); badge.set(0); if (book.isOpen) book.draw(); }, // 測試用
    // 給遺照 / 擲筊動畫用的暖機物件(main.js warmRuntime 一起預編譯)
    warmList: [],
    warmObjects() { return D.warmList.map((m) => { const c = m.clone(); c.visible = true; c.frustumCulled = false; return c; }); },
    debug() { return { s: S(), run: { ...run, look: Object.fromEntries(run.look) } }; },
  };
  game.deduce = D;
  game.objectives = Object.assign(game.objectives || {}, { clue: (id, o) => D.addCard(id, o) });
  const book = new Book(game, D);
  const badge = makeBadge(game, D);
  D.noteFlash = () => badge.set(Math.max(1, S().fresh.length), true, '＋筆記'); // 〈到目前為止〉多了一條
  badge.set(S().fresh.length);

  // ---------- 說出口的台詞(對講機、廣播):依序播,播完 cb ----------
  function talk(lines, cb, o = {}) {
    const api = ix()?.map?.api;
    if (!api || !lines?.length || game.story?.ending?.active) { cb?.(); return; } // 結局裡只有結局自己的聲音
    const ex = []; // 一句一行字幕:多行的台詞拆開依序播
    for (const [who, text, secs] of lines) { const ps = String(text).split('\n'); for (const p of ps) ex.push([who, p, ps.length > 1 ? secsOf(p) : secs]); }
    // 經過聲音的鎖,一句一句講(src/story/voice.js);講完才 cb
    // 戰鬥中(15 m 內有活屍、被追)先不講:提示(o.hint)最多等 30 秒,還在打就不講了;金水伯/小美的劇情句最多等 20 秒(排隊前等,不擋住別人的對話)
    const V = voiceLock(game), token = {}, crit = !o.hint;
    const calm = async (max) => { for (let w = 0; V.combat() && w < max; w += 0.5) await wait(game, 0.5); return !V.combat(); };
    let joined = false;
    if (!V.combat()) { V.join(token); joined = true; }
    (async () => {
      try {
        if (!joined) { const ok = await calm(crit ? 20 : 30); if (!ok && !crit) return; V.join(token); joined = true; }
        for (const [who, text, secs] of ex) {
          await free(game, { token, maxWait: 40 });
          if (game.story?.ending?.active) break;
          if (!crit && V.busy({ token })) break; // 提示等了 40 秒還輪不到:不講了
          // 小美只從收音機出來(src/story/radio.js):提示在聽不到時丟掉;劇情句等收音機(最多 120 秒,先讓出佇列)
          if (/小美/.test(who) && game.story?.radio) {
            if (!game.story.radio.hear()) { if (!crit) break; if (!(await radioReady(game, V, token))) continue; }
            const d1 = secs || secsOf(text);
            V.claim(d1, 8, 'xl');
            const said = line(game, 'xl', text, { secs: d1, optional: !crit });
            if (said) await wait(game, said + 0.3);
            continue;
          }
          const d = secs || secsOf(text);
          V.claim(d, 8, who);
          api.speak({ who, parts: [text], voice: /小美|小美|阿嬤|女|淑芬/.test(who) ? 'woman' : /王醫師|男/.test(who) ? 'man' : 'old' }, { filter: o.filter || (/對講機|收音機|AM/.test(who) ? 'radio' : 'phone'), noHorror: true, lockOk: true, critical: crit });
          await wait(game, d + 0.3);
        }
      } finally { V.leave(token); }
      cb?.();
    })();
  }
  D.talk = talk;
  // 金水伯只從店門口的對講機說話(REDESIGN §2.5):讓對講機響,接了才講;沒有對講機系統就照舊
  function kimsui(id, lines, cb) {
    const parts = lines.flatMap(([, text]) => String(text).split('\n'));
    if (game.story?.kimsui) game.story.kimsui(id, parts, cb); else talk(lines, cb);
  }

  // ---------- 207 的門自己打開(聖筊;替全隊) ----------
  const door207 = () => ix()?.doors?.list?.find((w) => w.lock?.door === 'f2_ward_207') || null;
  // 聖筊 = 大新的電子鎖解開(h.207.elock);門內的舊旋鈕要等頭七阿嬤回來轉開,兩道都開了門才會推開(src/story/climax.js)
  function unlock207(send) {
    const X = ix();
    if (!X) return;
    X.flags.set('h.207.elock', true);
    const w = door207();
    if (w && !run.opened207) {
      run.opened207 = true;
      try { ixs207(w); } catch { /* 略 */ }
      game.ui?.feed?.('二樓傳來「嗶」的一聲：207 的電子鎖，紅燈熄了。', { color: '#e3c98a', ms: 6500 });
    }
    if (send && game.net?.send) { try { game.net.send('ixf', ['h.207.elock']); } catch { /* 斷線 */ } }
  }
  const ixs207 = (w) => { try { sfx.pickupItem?.({ x: w.cx, y: w.y + 1.2, z: w.cz }); } catch { /* 略 */ } };
  D.unlock207 = unlock207;
  let netBound = null;
  const bindNet = () => {
    const s = game.net;
    if (!s || s === netBound || !s.on) return;
    netBound = s;
    s.on('ixf', (d) => { if (Array.isArray(d) && (d[0] === 'h.207.elock' || d[0] === 'h.207.unlock')) unlock207(false); });
  };

  // ---------- 卡片來源:互動系統 ----------
  const X0 = ix();
  if (X0) {
    X0.on('note', (n) => { const p = (n.points || []).find((q) => String(q).startsWith('card:')); const id = p ? p.slice(5) : NOTE_CARD[n.id]; if (id) D.addCard(id, { by: 'note' }); });
    X0.on('his', (c) => {
      if (String(c) !== '207') return;
      D.addCard('hc.10', { by: 'his' });
      if (!run.xl) { run.xl = true; X0.after(3, () => talk(TALK.xiaoling, () => D.addCard('hc.25', { by: 'call' }))); }
    });
    X0.on('voicemail', () => X0.after(9, () => D.addCard('hc.18', { by: 'tape' })));
    X0.on('reset', () => { run.shops = 0; run.k1 = run.k2 = run.w02 = false; run.tq = null; run.tqLate = false; run.look.clear(); run.memT = 0; run.opened207 = false; run.xl = false; run.k3 = false; });
    X0.tick((dt) => { bindNet(); if (game.state === 'playing') update(dt); return true; });
  }
  // ---------- 卡片來源:靈異系統(耳語、頭七) ----------
  const H0 = H();
  if (H0) {
    H0.on('whisper', (d) => { const id = WHISPER[d?.id]; if (id) X0?.after?.(1.5, () => D.addCard(id, { by: 'ghost' })); });
    H0.on('story', (e) => { if (e?.id === 's3.touqi') touqi(); });
  }

  // 頭七(HOSPITAL_CLUES_v2 §3):她轉身(玩家看著她) → 「阿孫……你哪會遮大漢矣？」 →「阿嬤無著 SARS……」(hc.19);
  // 錯過(不在 2F、或靠太近她就消失):之後任何一次靜默,站在遺照前 5 秒補播第二句並收卡
  function touqi() {
    const h = H(), why = h?.touqiWhy || 'time';
    const on2F = /^f2_/.test(game.hospital?.zone?.id || '');
    try { sfx.folk('ama', game.player.pos); } catch { /* 還沒烘焙好 */ }
    if (why === 'look' && on2F) {
      X0?.after?.(6.5, () => h?.whisper?.('h.w.tc1', { ear: 'both', priority: 9, force: true, lockOk: true })); // 一次一句,中間留 6 秒
      X0?.after?.(13, () => h?.whisper?.('h.w.tc2', { ear: 'both', priority: 9, force: true, lockOk: true })); // 她唯一的謊(每一局都說;M5)
      X0?.after?.(16.4, () => h?.whisper?.('h.w.tc3', { ear: 'both', priority: 9, force: true, lockOk: true }));
      X0?.after?.(19.6, () => h?.whisper?.('h.w.tc4', { ear: 'both', priority: 9, force: true, lockOk: true }));
    } else if (!D.has('hc.19')) { run.tqLate = true; ix()?.flags?.set?.('h.touqi.late', true); }
  }

  // ---------- 每幀(互動系統的 tick;只在遊戲中) ----------
  let acc = 0;
  function update(dt) {
    acc += dt;
    if (acc < 0.1) return;
    const step = acc; acc = 0;
    const X = ix(), p = game.player, h = H();
    if (!X || !p) return;
    const silent = !!h?.director?.silent;
    // 金水伯的對講機(第 2 次以後開店;第二段要先拿到 hc.07/08/09 任一張)
    if (game.phase === 'shop' && run.lastPh !== 'shop') {
      run.shops++;
      if (game.story?.busy?.()) { run.lastPh = game.phase; return; } // 王醫師的電話、結局:金水伯這一次先不講
      if (run.shops >= 2 && !D.has('hc.21') && !run.k1 && game.objectives?.done?.('h.s.cyc1') !== false) { run.k1 = true; X.after(6, () => kimsui('k.1', TALK.kimsui1, () => D.addCard('hc.21', { by: 'call' }))); }
      else if (run.shops >= 2 && D.has('hc.21') && !run.k2 && ['hc.07', 'hc.08', 'hc.09'].some(D.has) && !S().k2) { run.k2 = true; X.after(6, () => kimsui('k.2', TALK.kimsui2, () => { S().k2 = true; save(); D.addWords(['w.xiaoling']); game.ui?.feed?.('＋線索〈金水伯：那一扇窗〉 · 新的詞 1 個', { color: '#e3c98a', ms: 4200 }); })); }
      if (D.solved() && !run.opened207 && run.shops === 1) X.after(4, () => unlock207(true)); // 以前聖筊過:第一次靜默 207 的電子鎖自己解開
      // 金水伯認出你(他說的永遠是真的;他只是不講自己的心情)
      if (run.shops >= 3 && D.has('hc.21') && !S().k3 && !run.k3 && game.round >= 5) { run.k3 = true; X.after(9, () => kimsui('k.3', TALK.kimsui3, () => { S().k3 = true; save(); })); }
    }
    run.lastPh = game.phase;
    // 207 門口(3 m 內、靜默期):「燈莫關。伊驚烏。」(hc.22)
    const w = door207();
    if (w && silent && !run.w02 && Math.abs(p.pos.y - w.y) < 2 && Math.hypot(p.pos.x - w.cx, p.pos.z - w.cz) < 3 && !h?.whispers?.busy) {
      if (h?.whisper?.('h.w02', { ear: 'right', priority: 7 })) run.w02 = true;
    }
    // 環境線索:準心停在上面 0.8 秒、3 m 內
    const cam = game.camera;
    if (cam && !game.paused) {
      cam.getWorldDirection(_v3);
      for (const L of LOOK) {
        if (D.has(L.card)) continue;
        const q = L.at === 'door207' ? (w ? { x: w.cx, y: w.y + 1.4, z: w.cz } : null) : X.get(L.id) ? X.where(X.get(L.id)) : null;
        if (!q) continue;
        const dx = q.x - cam.position.x, dy = q.y - cam.position.y, dz = q.z - cam.position.z, d = Math.hypot(dx, dy, dz) || 1;
        const ok = d <= 3 && (dx * _v3.x + dy * _v3.y + dz * _v3.z) / d > Math.cos(Math.atan((L.at === 'door207' ? 0.55 : 0.3) / d) + 0.07)
          && (game.world?.hasLineOfSight?.(cam.position.x, cam.position.y, cam.position.z, q.x - dx / d * 0.35, q.y - dy / d * 0.35, q.z - dz / d * 0.35) ?? true);
        const t = ok ? (run.look.get(L.card) || 0) + step : 0;
        run.look.set(L.card, t);
        if (t >= 0.8) D.addCard(L.card, { by: 'look' });
      }
    }
    // 頭七的補播:靜默期站在遺照前 5 秒
    const m = X.get('h.ix.memorial');
    if (run.tqLate && m && silent) {
      const q = X.where(m);
      run.memT = Math.abs(p.pos.y - q.y) < 2 && Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < 2.4 ? run.memT + step : 0;
      if (run.memT >= 5 && !h?.whispers?.busy && h?.whisper?.('h.w.tc2', { ear: 'both', priority: 9, force: true, lockOk: true })) { run.tqLate = false; run.memT = 0; X.after(3.4, () => h?.whisper?.('h.w.tc3', { ear: 'both', priority: 9, force: true, lockOk: true })); X.after(6.6, () => h?.whisper?.('h.w.tc4', { ear: 'both', priority: 9, force: true, lockOk: true })); }
    }
    // 多人:受傷就收起筆記本(世界沒停)
    if (book.isOpen && game.net && p.lastHurt !== book.hurt) book.close(false);
  }
  void CARDS;
  return D;
}

// HUD 角落:「＋線索 [J]」(新的卡還沒看過時留一個小記號)
function makeBadge(game, D) {
  const hud = game.ui?.hudEl || document.body;
  const el = document.createElement('div');
  el.className = 'hd dd-badge';
  el.innerHTML = '<b>＋線索</b><span><kbd>J</kbd> 筆記本</span><i></i>';
  const lab = el.querySelector('b');
  hud.appendChild(el);
  let t = 0;
  return {
    set(n, flash, label = '＋線索') {
      lab.textContent = label;
      el.classList.toggle('has', n > 0);
      el.querySelector('i').textContent = n > 0 ? String(n) : '';
      if (flash) { el.classList.add('flash'); clearTimeout(t); t = setTimeout(() => el.classList.remove('flash'), 3200); try { sfx.pickupItem?.(); } catch { /* 略 */ } } // 還在閃就延長(不強迫排版:在更新裡讀 offsetWidth 會卡一幀)
      void D;
    },
  };
}
