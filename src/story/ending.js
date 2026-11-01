// 結局〈天光〉(STORY_v2 §4.9;EXPERIENCE_PLAN §3.4):撐完 60 秒之後,在世界裡發生、不鎖人的結尾。
//
//   game.story.ending.play(variant?, { fast })  開始(預設由 objectives 的 h.s.hold 完成時呼叫;variant 省略 = 依這一局決定)
//   game.story.ending.decide() → 'secret' | 'good' | 'dark' | 'normal'     game.story.ending.active / .state()
//
// 一、最後一次招魂燈熄 → 黑 → 「發財車沒有開出去。它繞到後巷，停在鐵網旁邊。」→ 你站在 2003 年家人看窗的鐵網前(anchors.alleyView)
// 二、金水伯;三、紙條(有 hc.09:〔E〕交給金水伯);四、那一頁(有 hc.30:〔E〕打開);五、小美陪你數到十,天一聲一聲亮起來,阿嬤在「十」加進來;
// 六、金水伯把三個守燈的人連起來;七、窗(好/秘密:燈暗一下又亮回來 → 小美「我自己去關」;苦:窗是黑的);八、207 的清晨(好/秘密);
// 九、照片的背面、標題、片尾(致敬那一行)→〔回到主選單〕〔繼續守夜〕。
// 規則:一直可以轉頭看(槍放下了);每一個〔E〕都有時間退路;Esc 照樣暫停(劇本用遊戲時間,暫停就停);按住空白鍵略過。
// 多人:每個人看自己的結局(本機的推理結果);不移動玩家、不清怪(房主照常推進),只放字幕、那一頁與片尾。
// 合作的代理(都是「偵測到才用」):game.motion(veil / letterbox / dawn / cards / credits)、world.hospital.anchors(alleyView、w207)、
// world.hospital.setDawn(t)、anchors.truck.mesh。沒有它們:自己的黑幕、自己算的鐵網位置、DOM 的晨光。
import './ending.css';
import { line as say, wait, fillNick } from './voice.js';
import { CARD } from './clues.js';
import { sfx, ghost } from '../audio.js';
import { settings } from '../ui/settings.js';

const NAME = { secret: '查房', good: '第七晚', dark: '熄燈', normal: '燈還亮著' };
const ONE = {
  secret: '護理長查完最後一間房。',
  good: '「我醒了，秀英姐。」',
  dark: '燈熄了。不是她關的。',
  normal: '每天晚上都亮著。二十三年了。',
};
const PAGE = ['5/12　封院第 14 天。燒退一點。左手腫。', '207 今天眼睛有動。我跟她說：燈我會顧，等你自己醒來，自己關。', '如果我走了，告訴淑芬：我不是 SARS。是針。'];
const LAST = '告訴阿孫：阿嬤沒有不要回家。';
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function installEnding(game, S) {
  const X = game.interact, H = () => game.horror, D = () => game.deduce, O = () => game.objectives;
  const M = () => game.motion || null, W = () => game.hospital || game.world?.hospital || null;
  const has = (k) => !!X.flags.has(k) || !!O()?.has?.(k);
  let el = null, run = null;
  const E = {
    get active() { return !!run && !run.done; },
    state: () => (run ? { variant: run.variant, beat: run.beat, choices: { ...run.ch }, done: run.done } : null),
    decide,
    play,
    skip: () => { if (run) run.skip = true; skipMotion(); },
  };
  S.ending = E;
  game.story = Object.assign(game.story || {}, { ending: E });

  function skipMotion() { const mp = run?.mp; try { mp?.skipAll ? mp.skipAll() : mp?.skip?.(); } catch { /* 略 */ } }
  function decide() {
    const d = D(), solved = !!d?.solved?.(), page = !!d?.has?.('hc.30');
    const lit = X.flags.get('h.pwr.207') !== false; // 配電盤上的 207 迴路(開局有電;玩家可以自己關掉)
    const diff = (() => { try { return new URLSearchParams(location.search).get('diff') || settings.get?.('difficulty') || 'normal'; } catch { return 'normal'; } })();
    if (!lit) return 'dark';
    if (solved && (diff === 'hard' || diff === 'nightmare') && d?.has?.('hc.32')) return 'secret';
    if (solved && page) return 'good';
    return 'normal';
  }

  // ---------- DOM ----------
  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'st-end';
    el.innerHTML = '<div class="st-dawn"></div><div class="st-bars"></div><div class="st-black"></div><div class="st-mid"></div><div class="st-count"></div><div class="st-page"></div><div class="st-sub"></div><div class="st-ask"></div><div class="st-card"></div><div class="st-btns"><button data-a="menu">回到主選單</button><button data-a="stay">繼續守夜</button></div><div class="st-skip">按住空白鍵略過<i></i></div>';
    document.body.appendChild(el);
    el.querySelector('.st-btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) finish(b.dataset.a); });
    return el;
  }
  const q = (s) => el.querySelector(s);
  function sub(who, text, secs) { // 自己的字幕(上一句淡出)
    const box = q('.st-sub');
    for (const c of [...box.children]) { c.classList.remove('on'); setTimeout(() => c.remove(), 800); }
    const d = document.createElement('div');
    d.className = 'st-line'; d.dataset.w = who;
    const tag = { xl: '收音機 · 小美', ks: '金水伯', ama: '阿嬤', xa: '收音機 · 阿嬤', ho: '電話 · 王醫師', pa: '醫院廣播' }[who];
    d.innerHTML = `${tag ? `<small>${tag}</small>` : ''}${esc(text)}`;
    box.appendChild(d);
    requestAnimationFrame(() => d.classList.add('on'));
    const hold = Math.max(2.6, secs + 1.4);
    X.after(run?.fast ? hold / 6 : hold, () => { d.classList.remove('on'); setTimeout(() => d.remove(), 900); });
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  async function black(on, ms = 1200) {
    const m = M();
    if (m?.veil) { try { await m.veil(on ? 1 : 0, ms, { hud: true }); return; } catch { /* 用自己的 */ } }
    const b = q('.st-black'); b.style.setProperty('--ms', ms + 'ms'); b.classList.toggle('on', on);
    await w(ms / 1000);
  }
  async function mid(lines, hold = 3) { // 黑畫面上的字
    const box = q('.st-mid'); box.innerHTML = '';
    for (const t of lines) { const p = document.createElement('p'); p.textContent = t; box.appendChild(p); await w(0.15); p.classList.add('on'); await w(1.6); }
    await w(hold);
    for (const p of box.children) p.classList.remove('on');
    await w(1.2);
    box.innerHTML = '';
  }
  function bars(on) { const m = M(); if (m?.letterbox) { try { m.letterbox(on, 900); return; } catch { /* 略 */ } } q('.st-bars').classList.toggle('on', on); }
  // ---------- 時間 / 略過 ----------
  const w = (s) => (run?.skip ? Promise.resolve() : wait(game, run?.fast ? s / 6 : s));
  const talk = async (who, text, o = {}) => { if (run.skip) return; const d = say(game, who, text, { ...o, sub }); await w(d + (o.gap ?? 0.6)); };
  function ask(text, secs, nudge) { // 〔E〕:按了回傳 true;時間到回傳 false(不鎖人)
    return new Promise((res) => {
      if (run.skip) { res(false); return; }
      const a = q('.st-ask'); a.innerHTML = `<kbd>E</kbd>${esc(text)}`; a.classList.add('on');
      let done = false, t = 0;
      const end = (v) => { if (done) return; done = true; a.classList.remove('on'); run.onE = null; res(v); };
      run.onE = () => end(true);
      X.tick((dt) => { if (done) return false; if (run.skip || game.state !== 'playing') { end(false); return false; } t += dt * (run.fast ? 6 : 1); if (nudge && t > nudge[0] && !nudge.done) { nudge.done = true; nudge[1](); } if (t > secs) { end(false); return false; } return true; });
    });
  }
  function onKey(e) {
    if (!run || run.done) return;
    if (e.code === 'KeyE' && run.onE) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) run.onE(); return; }
    if (e.code === 'Space' && run.solo && !e.repeat && !run.skip) { e.preventDefault(); run.spaceT = performance.now(); } // 多人時空白鍵還是跳
  }
  function onKeyUp(e) { if (e.code === 'Space') run && (run.spaceT = 0); }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);

  // ---------- 世界:207 的窗、鐵網、晨光 ----------
  function pose207() {
    const A = W()?.anchors;
    if (A?.alleyView) return A.alleyView;
    const L = game.world?.layout; if (!L) return null;
    const z207 = L.zones.find((z) => z.id === 'f2_ward_207'), za = L.zones.find((z) => z.id === 'f1_alley');
    if (!z207 || !za) return null;
    const [c0, r0, c1] = z207.rects[0], wx = c0 + c1 + 1, wz = r0 * 2, wy = L.levels[z207.levelIndex].y + 1.7;
    const li = za.levelIndex, y = L.levels[li].y;
    let best = null, bd = 1e9;
    for (const [a0, b0, a1, b1] of za.rects) for (let r = b0; r <= b1; r++) for (let c = a0; c <= a1; c++) {
      if (!(L.flagsAt(li, c, r) & L.F.WALK)) continue;
      const x = c * 2 + 1, z = r * 2 + 1, d = Math.abs(x - wx) * 1.4 + Math.abs((wz - z) - 9);
      if (z < wz && d < bd) { bd = d; best = { x, z }; }
    }
    if (!best) return null;
    const dx = wx - best.x, dz = wz - best.z, dy = wy - (y + 1.6), dd = Math.hypot(dx, dy, dz) || 1;
    return { x: best.x, y, z: best.z, yaw: Math.atan2(-dx, -dz), pitch: Math.asin(dy / dd), win: { x: wx, y: wy, z: wz } };
  }
  function place(P) { if (!P) return false; const p = game.player; try { p.place(P.x, P.y, P.z, P.yaw); p.pitch = P.pitch ?? 0.2; return true; } catch { return false; } }
  const lampFixtures = () => { const A = W()?.anchors?.w207; if (A?.lamp?.fixture) return [A.lamp.fixture]; return (W()?.lights?.fixtures || game.hospital?.lights?.fixtures || []).filter((f) => f.zone?.id === 'f2_ward_207' || f.zone === 'f2_ward_207'); };
  function dawn(t) {
    run.dawn = t;
    try { W()?.setDawn?.(t); } catch { /* 略 */ }
    const m = M();
    if (m?.dawn) { try { m.dawn(t); } catch { /* 略 */ } } else q('.st-dawn').style.opacity = (t * 0.55).toFixed(3);
  }
  function tweenDawn(a, b, secs) {
    const t0 = game.time;
    X.tick(() => { if (!run || run.done) return false; const k = Math.min(1, (game.time - t0) / Math.max(0.01, run.fast ? secs / 6 : secs)); dawn(a + (b - a) * (k * k * (3 - 2 * k))); return k < 1; });
  }
  function blink() { // 207 的燈暗一下(像有人把手放在開關上,又停住),再亮回來:只改強度
    const F = lampFixtures(); if (!F.length) return false;
    const t0 = game.time;
    X.tick(() => { const t = game.time - t0, k = t < 0.5 ? 1 - t / 0.5 : t < 1.7 ? 0 : t < 2.4 ? (t - 1.7) / 0.7 : 1, v = 0.04 + 0.96 * k; for (const f of F) { if ('gate' in f) f.gate = v; else f.ov = v; } return t < 2.5; }); // gate:場景代理給的乘數(配電盤不會蓋掉)
    return true;
  }
  // 結束這一夜:停波、清掉活屍(黑畫面裡做,不給錢)、收槍
  function endNight() {
    const g = game;
    if (g.net) return; // 多人:房主照常推進
    g.queue.length = 0; g.toSpawn = 0;
    for (const z of g.zombies) { try { z.dispose(); } catch { /* 略 */ } }
    g.zombies.length = 0;
    try { g.chase?.reset?.(); g.ambush?.reset?.(); } catch { /* 略 */ }
    g.phase = 'break'; g.restT = 1e9;
    try { g.shop?.setOpen?.(false); if (g.shopUIOpen) g.closeShop(false); } catch { /* 略 */ }
  }

  // ---------- 劇本 ----------
  async function play(variant, o = {}) {
    if (run && !run.done) return false;
    build();
    run = { variant: variant || decide(), beat: 'start', ch: {}, skip: false, fast: !!o.fast, done: false, onE: null, spaceT: 0, dawn: 0, solo: !game.net };
    const v = run.variant, solo = run.solo, d = D();
    H()?.reveal?.('zheng');
    q('.st-skip').style.display = solo ? '' : 'none';
    if (!solo) return coop(v, d); // 多人:不黑畫面、不收槍、不移動人(房主照常推進),只在靜默期放字幕、那一頁、數到十與標題
    const Dr = H()?.director;
    if (Dr) { Dr.bigUntil = Dr.t + 1e6; Dr.calmUntil = Dr.t + 1e6; } // 結局裡不再有驚嚇
    // 按住空白鍵略過
    X.tick(() => { if (!run || run.done) return false; const sk = q('.st-skip i'); const held = run.spaceT ? (performance.now() - run.spaceT) / 1200 : 0; sk.style.width = Math.min(1, held) * 60 + 'px'; if (held >= 1 && !run.skip) { run.skip = true; skipMotion(); } if (game.input) game.input.fireHeld = false; return true; });
    try {
      // 一、最後一次招魂燈熄
      run.beat = 'night';
      document.body.classList.add('st-ending');
      if (game.weaponScene) game.weaponScene.visible = false;
      if (game.player.flashOn && game.player.toggleFlashlight) { run.flash = true; try { game.player.toggleFlashlight(); } catch { /* 略 */ } } // 天快亮了,只剩那扇窗
      await black(true, 1400);
      endNight();
      if (solo) { place(pose207()); try { W()?.anchors?.truck?.mesh && (W().anchors.truck.mesh.visible = true); } catch { /* 略 */ } }
      try { game.setMood?.('shop'); } catch { /* 略 */ }
      dawn(0);
      await mid(solo ? ['最後一次，招魂燈熄了。', '發財車沒有開出去。它繞到後巷，停在鐵網旁邊。'] : ['最後一次招魂燈熄了。'], 1.6);
      bars(true);
      await black(false, 2600);
      // 二、金水伯
      run.beat = 'alley';
      await w(1.2);
      await talk('ks', '……阿伯想再看一次。', { gap: 1.4 });
      await talk('ks', '2003 年，我們每天晚上都站在這裡。');
      await talk('ks', '你阿母抱著你，你一直指那扇窗。', { gap: 2 });
      // 三、紙條
      if (d?.has?.('hc.09')) {
        run.beat = 'note';
        const gave = await ask('把紙條交給金水伯', 14);
        run.ch.note = gave;
        if (gave) {
          S.flag?.('h.x.note'); try { X.flags.set('meta.note.kimsui', true); } catch { /* 略 */ }
          sub('n', '他看了很久。', 2); await w(3.2);
          await talk('ks', '……她沒有死？', { gap: 1.2 });
          await talk('ks', '我揹下山的那個女孩，她沒有死？', { gap: 2.2 });
          if (has('h.ho.heard')) { await talk('ks', '那個王醫師，921 那年跟我說，'); await talk('ks', '送到醫院就救不回來了。'); await talk('ks', '……他騙我。騙了二十七年。', { gap: 2 }); }
          await talk('ks', '……小美。', { gap: 2.4 });
          sub('n', '對講機那頭，沒有人回答。', 2.4); await w(3.4);
        }
      }
      // 四、那一頁
      if (d?.has?.('hc.30')) {
        run.beat = 'page';
        const n = [10, () => say(game, 'ks', '那張紙，你不看一下？', { sub })];
        run.ch.page = await ask('打開那一頁', 20, n);
        await readPage();
        await w(2.4);
        await talk('xl', '……', { secs: 1.4, gap: 1.8, quiet: true });
        await talk('xl', '……她一直在跟我說話。', { gap: 2.2 });
        await talk('xl', '我醒了啊。', { gap: 1.2 });
        await talk('xl', '我醒了，秀英姐。', { gap: 2.6 });
      }
      // 五、數到十
      run.beat = 'count';
      const nc = S.calls || 0; // 今晚阿嬤叫了你幾次(src/story/revive.js)
      if (nc > 0) await talk('xl', `今天晚上，那個阿嬤叫了你${nc === 1 ? '一' : nc === 2 ? '兩' : nc === 3 ? '三' : '好幾'}次。……我都聽到了。`, { gap: 1.4 });
      await talk('xl', '{暱稱}，你在發抖。', { gap: 1 });
      await talk('xl', '我跟你講。怕的時候，數到十。……我們一起數。', { gap: 1.2 });
      const hum207 = (v === 'good' || v === 'secret') && !!W()?.anchors?.w207?.view;
      tweenDawn(0, 1, 26);
      const cnt = q('.st-count');
      for (let i = 0; i < 10 && !run.skip; i++) {
        if (i === 6 && !hum207) { try { sfx.folk('ama', pose207()?.win || game.player.pos); } catch { /* 冷卻中 */ } } // 〈望春風〉:有 207 的清晨那一拍就留到那裡(哼聲有冷卻)
        cnt.textContent = NUM[i]; cnt.classList.add('on');
        if (i < 9) { say(game, 'xl', NUM[i] + '。', { sub: () => {} }); await w(2.5); cnt.classList.remove('on'); await w(0.15); }
      }
      // 「十」:收音機的雜訊慢慢消失,這一聲是阿嬤的聲音,從收音機出來(全章唯一一次;REDESIGN §6.3)
      const Rd = game.story?.radio;
      if (Rd?.has?.()) {
        Rd.hush(14); await w(1.6);
        await talk('xa', '……十。天亮了。', { gap: 2.4, filter: 'radio' });
        await talk('xl', '……剛剛那是誰？', { gap: 1 });
        await talk('xl', '我第一次……聽到她。', { gap: 2 });
      } else {
        say(game, 'xl', '十。', { sub: () => {} });
        await w(0.6);
        await talk('ama', '……十。天亮了。', { gap: 2.4 });
      }
      cnt.classList.remove('on');
      dawn(1);
      // 六、三個守燈的人
      run.beat = 'keepers';
      await talk('ks', '……那句話，是你阿嬤教你的。', { gap: 1 });
      await talk('ks', '她在護理站，聽小美的節目學的。\n那捲錄音帶，是阿伯錄的。', { gap: 1.4 });
      if (game.story?.radio?.kind === 'ama') { await talk('ks', '那台收音機，是秀英的。', { gap: 1 }); await talk('ks', '她每天晚上都開著。', { gap: 2.4 }); }
      // 七、窗
      run.beat = 'window';
      if (v === 'dark') {
        sub('n', '那扇窗是黑的。金水伯沒有回頭。', 3); await w(4.2);
        await talk('xl', '……那盞燈是誰的？', { gap: 1 });
        await talk('xl', '為什麼它熄了，我會想哭？', { gap: 2.4 });
      } else {
        await talk('ks', '……每天晚上都亮著。二十三年了。', { gap: 2.4 });
        if (v === 'good' || v === 'secret') {
          blink();
          sub('n', '207 的燈暗了一下——像有人把手放在開關上，又停住。', 3.4); await w(4.6);
          await talk('xl', '……秀英姐。', { gap: 1.6 });
          await talk('xl', '再等我一下。', { gap: 1 });
          await talk('xl', '我自己去關。', { gap: 2.6 });
        } else await talk('xl', '……今天，數完了。', { gap: 2.2 });
      }
      if (!d?.has?.('hc.30') && has('h.ho.heard')) { await talk('ho', '……謝謝你。', { gap: 1.4 }); sub('n', '電話掛了。', 2); await w(3); }
      // 八、207 的清晨(好/秘密)
      const A = W()?.anchors?.w207;
      if ((v === 'good' || v === 'secret') && solo && A?.view && !run.skip) {
        run.beat = '207';
        await black(true, 1600);
        place(A.view);
        try { A.setDawn?.(1); } catch { /* 略 */ }
        await black(false, 2400);
        const c = A.chair || A.door || A.view;
        try { ghost.cart?.({ x: c.x, y: (c.y ?? A.view.y) + 0.4, z: c.z }, 7); } catch { /* 略 */ }
        await w(2.2);
        sub('n', '推車的輪子聲，從 207 走到護理站，停了下來。', 3.2);
        await w(4.4);
        try { sfx.folk('ama', A.lamp || c); } catch { /* 冷卻中 */ }
        await w(4);
      }
      // 九、照片、標題、片尾
      run.beat = 'cards';
      await black(true, 1800);
      bars(false);
      if (v === 'secret') { run.beat = 'cctv'; await mid(['監視器最後一格畫面：', '2F 走廊空無一人，推車自己停在新生兒室門口。', '保溫箱旁的小供桌上，多了一碗冒著熱氣的油飯。'], 3.4); run.beat = 'cards'; }
      run.skip = false; // 略過只略到片尾;片尾自己可以再略
      await cards(v);
    } catch (e) { console.warn('[ending]', e); }
    run.beat = 'end';
    showButtons();
    return true;
  }

  // 多人的結局(短版,約 40 秒,剛好一次休息):等招魂燈熄 → 金水伯 → 那一頁 → 小美 → 數到十(快) → 標題橫幅。HUD 與槍都在。
  async function coop(v, d) {
    run.beat = 'wait';
    while (!run.skip && game.state === 'playing' && game.phase === 'fighting') await w(1);
    if (game.state !== 'playing') { run.done = true; return false; }
    run.beat = 'alley';
    await talk('ks', '……每天晚上都亮著。二十三年了。', { gap: 1.2 });
    if (d?.has?.('hc.30')) {
      run.beat = 'page';
      await readPage(0.6);
      await talk('xl', '……她一直在跟我說話。', { gap: 1.2 });
      await talk('xl', '我醒了，秀英姐。', { gap: 1.6 });
    }
    run.beat = 'count';
    await talk('xl', '怕的時候，數到十。', { gap: 0.6 });
    const cnt = q('.st-count');
    for (let i = 0; i < 10 && !run.skip && game.phase !== 'fighting'; i++) { cnt.textContent = NUM[i]; cnt.classList.add('on'); try { M()?.dawn?.((i + 1) / 10); } catch { /* 略 */ } await w(1.1); cnt.classList.remove('on'); }
    if (game.phase !== 'fighting') await talk('ama', '……十。天亮了。', { gap: 1.2 });
    try { M()?.dawn?.(0, 4000); } catch { /* 略 */ }
    game.ui?.banner?.('〈第七暝〉', `「${NAME[v]}」 · 謹以此紀念 1999 年與 2003 年，所有守在第一線的人。`, 9000, 'gold');
    run.beat = 'end'; run.done = true;
    return true;
  }

  async function readPage(k = 1) {
    const pg = q('.st-page');
    pg.innerHTML = `<div class="hd">值班日記　2F 北　護理長 林秀英</div>${PAGE.map((t) => `<div class="pl">${esc(t)}</div>`).join('')}<div class="pl last">${esc(LAST)}</div>`;
    pg.classList.add('on');
    sfx.pickupItem?.();
    const pl = [...pg.querySelectorAll('.pl')];
    for (let i = 0; i < pl.length; i++) { await w((i === pl.length - 1 ? 3.2 : 1.4) * k); pl[i].classList.add('on'); await w((i === pl.length - 1 ? 0.4 : 2.8) * k); }
    await w(6 * k);
    pg.classList.remove('on');
    await w(1.4);
    void CARD;
  }

  function photo(v) {
    const d = D(), mine = !!d?.has?.('hc.32');
    const box = document.createElement('div');
    box.className = 'st-photo';
    box.innerHTML = mine
      ? '<div class="stamp">2000 · 聖心醫院 新生兒室</div><div class="hand">床母娘娘，<br>保佑我的孫子。</div><div class="sig">秀英</div>'
      : '<div class="stamp">霧港日報 · 92 年 5 月 8 日</div><div class="hand">不要怕<br>阿嬤在這裡</div><div class="sig">（剪下來的報紙，背面寫著：阿孫）</div>';
    void v;
    return box;
  }
  async function cards(v) {
    const m = M();
    const credits = [
      { h: '〈207 的燈〉', lines: ['聖心醫院 · 霧港市舊港區', `結局「${NAME[v]}」`, ONE[v]] },
      { h: '守著那盞燈的人', lines: ['林秀英（阿嬤）', '陳美玲（小美）', '黃金水（金水伯）', fillNick('還有你，{暱稱}')] },
      { h: '', lines: ['本作所有人物、醫院、地點與機構皆為虛構。'] },
      { h: '', lines: ['謹以此紀念 1999 年與 2003 年，所有守在第一線的人。'] },
      { h: '', lines: ['怕的時候，數到十。'] },
    ];
    if (m?.cards && m?.credits) {
      try {
        run.mp = m.cards([
          { lines: [photo(v)], hold: 6.5 },
          { kicker: '等天光 · 第一章', title: '〈第七暝〉', sub: `「${NAME[v]}」`, lines: [ONE[v]], hold: 5.5 },
        ]);
        await run.mp; run.mp = m.credits({ blocks: credits.slice(1), speed: 1 });
        await run.mp; run.mp = null;
        return;
      } catch { /* 用自己的 */ }
    }
    const c = q('.st-card');
    const show = async (html, secs) => { c.innerHTML = ''; if (typeof html === 'string') c.innerHTML = html; else c.appendChild(html); c.classList.add('on'); await w(secs); c.classList.remove('on'); await w(1.5); };
    await show(photo(v), 6.5);
    await show(`<div class="k">等天光 · 第一章</div><h1>〈第七暝〉</h1><h2>「${NAME[v]}」</h2><p style="margin-top:1.6em">${esc(ONE[v])}</p>`, 6);
    await show(`<div class="k">守著那盞燈的人</div><p>林秀英（阿嬤）</p><p>陳美玲（小美）</p><p>黃金水（金水伯）</p><p>還有你，${esc(fillNick('{暱稱}'))}</p>`, 5.5);
    await show('<p>本作所有人物、醫院、地點與機構皆為虛構。</p><p class="ded">謹以此紀念 1999 年與 2003 年，所有守在第一線的人。</p>', 7);
    c.innerHTML = '<p>怕的時候，數到十。</p>'; c.classList.add('on');
  }
  function showButtons() {
    q('.st-btns').classList.add('on');
    q('.st-skip').style.display = 'none';
    game.bookOpen = true; // input.js:放開滑鼠不要叫出暫停選單
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function finish(a) {
    if (!run) return;
    run.done = true;
    q('.st-btns').classList.remove('on');
    for (const s of ['.st-card', '.st-mid', '.st-count', '.st-page', '.st-ask']) { const n = q(s); n.classList.remove('on'); }
    q('.st-sub').innerHTML = '';
    q('.st-skip').style.display = '';
    dawn(0); bars(false);
    for (const f of lampFixtures()) { if ('gate' in f) f.gate = 1; else f.ov = 1; }
    try { const t = W()?.anchors?.truck?.mesh; if (t) t.visible = false; } catch { /* 略 */ }
    const Dr = H()?.director; if (Dr) { Dr.bigUntil = Dr.t; Dr.calmUntil = Dr.t + 20; }
    document.body.classList.remove('st-ending');
    game.bookOpen = false;
    const restore = () => { q('.st-black').classList.remove('on'); try { M()?.veil?.(0, 600); } catch { /* 略 */ } };
    if (a === 'menu') { restore(); game.quitToMenu?.(); return; }
    // 繼續守夜:天亮了,金水伯的店又開了;下一次招魂燈照常
    restore();
    if (game.weaponScene) game.weaponScene.visible = true;
    if (run.flash && !game.player.flashOn) { try { game.player.toggleFlashlight(); } catch { /* 略 */ } }
    if (!game.net) { game.phase = 'shop'; game.restT = 30; try { game.shop?.setOpen?.(true); } catch { /* 略 */ } }
    try { game.setMood?.('shop'); } catch { /* 略 */ }
    try { const r = game.canvas.requestPointerLock(); r?.catch?.(() => {}); } catch { /* 要使用者手勢 */ }
  }
  X.on('reset', () => { if (run && !run.done) { run.skip = true; run.done = true; } if (el) { document.body.classList.remove('st-ending'); el.querySelector('.st-btns').classList.remove('on'); for (const s of ['.st-card', '.st-mid', '.st-count', '.st-page', '.st-ask', '.st-black', '.st-bars']) el.querySelector(s).classList.remove('on'); el.querySelector('.st-sub').innerHTML = ''; el.querySelector('.st-dawn').style.opacity = 0; } run = null; });
  return E;
}
