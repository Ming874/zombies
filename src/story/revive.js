// 「阿嬤叫你回來」(STORY_v2 §3.5):倒下時阿嬤用收驚的叫法叫你「阿孫，轉來喔！」,你就「回神」了。
// 她叫得動你幾次 = 難度:簡單 無限(越後面越小聲)、普通 3、困難 1、惡夢 0(「無人叫你」)。
//
// 單人:HP 歸零 → 不是馬上死:世界褪色、心跳慢下來、〈望春風〉、她叫你 → game.motion.revive()(黑、她的一句、眨眼張開)
//       → 帶一點血起來;身邊的活屍被推開、晃一下(在黑畫面裡做),一口氣、一下亮光,3 秒內不會再被打。
//       叫幾次不寫數字:她的聲音一次比一次小(字卡變淡、句子變短),小美也聽得出來;最後一次她自己說「氣力賰無偌濟矣」。
//       叫不動了 → 真的倒下(原本的死亡流程),最後一句:她「阿孫……阿嬤叫袂動矣。」/ 惡夢:小美「……喂？……收到請回答。」
// 合作:隊友救援的倒地照舊;流血至死的人,下一次招魂燈(回合開始)由阿嬤叫回來(佔一次次數;沒有了就不回來,留在觀戰,
//       全員倒地照樣由房主判定結束)。倒地時阿嬤只在耳邊說一句。對戰:完全不碰。
// 每一次都記進 horror.remember('ama.call')(tag zheng)與 game.story.calls;結局〈天光〉會說她今晚叫了你幾次。
import { line, seq } from './voice.js';
import { sfx } from '../audio.js';
import { settings } from '../ui/settings.js';

const CALLS = { easy: Infinity, normal: 3, hard: 1, nightmare: 0 };
const HP = { easy: 50, normal: 35, hard: 30, nightmare: 25 };
// 她叫你(字卡上的一句):依剩下幾次變小
const CALL = { strong: '阿孫，回神喔！', mid: '阿孫——回神喔！', weak: '阿孫……回來……', faint: '……阿孫……' };
// 醒來之後,她在耳邊說的一句(只到 2003 年:你三歲以前的事)
const SMALL = [
  '你小時候跌倒，阿嬤也是這樣叫你。\n叫一聲，你就自己爬起來。',
  '天黑了，阿嬤在護理站門口叫你，\n你就跑過來，鞋子都穿反了。',
  '阿嬤叫你，你都會回來。……對不對？',
];

export function installRevive(game, S) {
  const X = game.interact, H = () => game.horror;
  const diff = () => { try { return new URLSearchParams(location.search).get('diff') || settings.get?.('difficulty') || 'normal'; } catch { return 'normal'; } };
  const fresh = () => ({ calls: 0, busy: false, shieldT: 0, coopWrapped: null, coopDown: false, lastWord: false });
  let run = fresh();
  const max = () => CALLS[diff()] ?? 3;
  const left = () => max() - run.calls;
  S.revive = { get calls() { return run.calls; }, left, max, get busy() { return run.busy; }, test: () => goDown() };
  Object.defineProperty(S, 'calls', { get: () => run.calls, configurable: true });

  // ---------- 單人:把死亡接住 ----------
  const die0 = game.die;
  game.die = function (...a) {
    if (this.net || this.state !== 'playing' || run.busy) return die0.apply(this, a); // 多人由連線層接(合作倒地 / 對戰重生)
    if (left() > 0) { goDown(); return; }
    lastWord();
    return die0.apply(this, a);
  };
  // 回神後 3 秒內不會再被打(只有單人;多人有自己的保護)
  const dp0 = game.damagePlayer;
  game.damagePlayer = function (p, amount, ...a) {
    if (!this.net && p === this.player && (run.busy || this.time < run.shieldT)) return 0;
    return dp0.call(this, p, amount, ...a);
  };

  function lastWord() { // 叫不動了:最後一句(跟原本的死亡淡出一起)
    if (run.lastWord) return;
    run.lastWord = true;
    if (run.calls > 0) { try { H()?.reveal?.('zheng'); } catch { /* 略 */ } line(game, 'ama', '阿孫……阿嬤叫不動你了。', { ear: 'both' }); }
    else line(game, 'xl', '……喂？……收到請回答。');
  }

  function tier(r, n) { // r = 這一次之後還剩幾次;n = 第幾次
    if (max() === Infinity) return n <= 3 ? 'strong' : 'faint';
    return r >= 2 ? 'strong' : r === 1 ? 'mid' : 'weak';
  }

  async function goDown() {
    const g = game, p = g.player, M = g.motion;
    run.busy = true;
    run.calls++;
    const n = run.calls, r = left(), t = tier(r, n), say = CALL[t];
    p.downed = true; p.hp = 0; g.healT = 0;
    if (g.input) { g.input.fireHeld = false; g.input.aimHeld = false; }
    g.ui?.setHP?.(0, p.maxHp);
    if (g.shopUIOpen) g.closeShop?.(false);
    try { H()?.reveal?.('zheng'); H()?.remember?.('ama.call', { event: 'revive', tag: 'zheng', ghost: 'zheng', text: say }); } catch { /* 略 */ }
    S.flag?.('h.ama.call');
    // 倒下:世界褪色、邊緣暗下來、心跳慢慢小下去
    try { M?.to?.('down', 'desat', 0.85, 900, 'out'); M?.to?.('down', 'vig', 0.35, 900, 'out'); } catch { /* 略 */ }
    try { sfx.setHealth?.(0.3); setTimeout(() => sfx.setHealth?.(0.45), 700); } catch { /* 略 */ }
    // 〈望春風〉+ 她的聲音(越後面越小)
    try { sfx.folk('ama', p.pos); } catch { /* 冷卻中 */ }
    setTimeout(() => line(game, 'ama', say, { ear: t === 'strong' ? 'both' : t === 'mid' ? 'left' : 'behind' }), 650);
    await new Promise((res) => setTimeout(res, 950));
    // 黑、她的一句、眨眼張開(motion 代理的 revive)。字卡淡出、眼睛要張開的那一刻才把人扶起來、把活屍推開
    // (倒地的時候活屍不會追你;太早起來牠們會在字卡期間走回來)
    const hold = t === 'strong' ? 1700 : t === 'mid' ? 1500 : 1300;
    setTimeout(() => standUp(), M?.reduced ? 300 : 500 + 900 + hold + 250);
    if (M?.revive) {
      const pr = M.revive({ line: say, hold });
      setTimeout(() => { const c = [...document.querySelectorAll('.mo-card.ama')].pop(); if (c && t !== 'strong') c.classList.add('st-' + t); }, 30); // 字卡跟著變淡
      try { await pr; } catch { /* 略 */ }
    } else await fallbackCard(say, t);
    if (p.downed) standUp(); // 保險
    try { M?.to?.('down', 'desat', 0, 1400, 'inOut'); M?.to?.('down', 'vig', 0, 1400, 'inOut').then(() => M?.clear?.('down')); } catch { /* 略 */ } // 顏色慢慢回來
    run.busy = false;
    run.shieldT = g.time + 3;
    afterLines(n, r, t);
  }

  function standUp() {
    const g = game, p = g.player;
    if (!p.downed) return;
    p.downed = false; p.alive = true;
    p.hp = Math.min(p.maxHp, HP[diff()] ?? 35);
    g.ui?.setHP?.(p.hp, p.maxHp);
    // 身邊的活屍:推到 5.5 m 外(沿著原來的方向,碰到牆就停),晃一下
    const L = g.world?.layout, li = L ? Math.max(0, L.levelOfY(p.pos.y + 0.3)) : 0;
    const walk = (x, z) => !L || (L.flagsAt(li, Math.floor(x / 2), Math.floor(z / 2)) & L.F.WALK) !== 0;
    for (const z of g.zombies) {
      if (!z.alive || Math.abs(z.pos.y - p.pos.y) > 2) continue;
      const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 5.5) continue;
      const ux = d > 0.01 ? dx / d : Math.random() - 0.5, uz = d > 0.01 ? dz / d : Math.random() - 0.5, ul = Math.hypot(ux, uz) || 1;
      let k = d;
      while (k < 5.5 && walk(p.pos.x + (ux / ul) * (k + 0.5), p.pos.z + (uz / ul) * (k + 0.5))) k += 0.5;
      if (k > d) { z.pos.x = p.pos.x + (ux / ul) * k; z.pos.z = p.pos.z + (uz / ul) * k; }
      z.flinchV = (z.flinchV || 0) + 6; z.rollV = (z.rollV || 0) + (Math.random() - 0.5) * 8;
      if (z.type === 'walker' && (z.state === 'chase' || z.state === 'attack') && z.go) z.go('stagger');
      if ('attackCd' in z) z.attackCd = Math.max(z.attackCd || 0, 1.6);
    }
    try { H()?.flicker?.(p.pos, 0.35); } catch { /* 略 */ } // 一下亮光
  }

  function afterLines(n, r, t) {
    const L = [];
    if (t === 'faint') L.push(['ama', '……回來就好。', 2.2, { ear: 'left', gap: 1.2, many: true }]);
    else L.push(['ama', SMALL[(n - 1) % SMALL.length], undefined, { ear: 'left', gap: 1.2, many: true }]);
    if (t === 'weak') L.push(['ama', '阿嬤的力氣……剩不多了。', 3.2, { ear: 'left', gap: 1.6, many: true }]);
    if (n === 1) L.push(['xl', '又倒下去了？', 1.8, { combatOk: true }], ['xl', '收音機剛剛整個沒聲音。', 2.6, { combatOk: true }], ['xl', '……是她又叫你了，對不對？', 2.8, { combatOk: true }]); // 小美聽不到阿嬤,只聽到收音機安靜(REDESIGN §7)
    else if (t === 'mid') L.push(['xl', '……她的聲音，比剛剛小了。', 3]);
    else if (t === 'weak') L.push(['xl', '……她剛剛那一聲，好遠。', 2.8]);
    seq(game, [1.4, ...L], { alive: () => game.state === 'playing' });
  }

  async function fallbackCard(say, t) { // 沒有 motion 的時候:自己的黑幕與字
    const el = document.createElement('div');
    el.className = 'st-revive ' + t;
    el.innerHTML = `<div>${say}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    await new Promise((res) => setTimeout(res, 2600));
    el.classList.remove('on');
    await new Promise((res) => setTimeout(res, 700));
    el.remove();
  }

  // ---------- 合作:倒地照舊;流血至死 → 下一次招魂燈由阿嬤叫回來(佔一次) ----------
  function wrapCoop() {
    const m = game.net?.mode;
    if (!m || m === run.coopWrapped || typeof m.respawn !== 'function' || typeof m.bleedOut !== 'function') return;
    run.coopWrapped = m;
    const r0 = m.respawn.bind(m);
    m.respawn = function () {
      if (left() <= 0) { if (!run.lastWord) lastWord(); return; } // 叫不動了:留在觀戰(全員倒地由房主判定)
      run.calls++;
      const n = run.calls, r = left(), t = tier(r, n), say = CALL[t];
      try { H()?.reveal?.('zheng'); H()?.remember?.('ama.call', { event: 'revive', tag: 'zheng', ghost: 'zheng', text: say }); } catch { /* 略 */ }
      try { sfx.folk('ama', game.player.pos); } catch { /* 冷卻中 */ }
      r0();
      try { game.motion?.revive?.({ line: say, hold: 1300 }); } catch { /* 略 */ }
      setTimeout(() => afterLines(n, r, t), 2600);
    };
  }

  // ---------- 每幀 ----------
  X.on('reset', () => { run = { ...fresh(), coopWrapped: run.coopWrapped }; });
  X.tick(() => {
    if (game.net && !game.net.mode?.pvp && !game.net.pvp) {
      wrapCoop();
      const p = game.player; // 合作倒地(等隊友):阿嬤在耳邊說一句
      if (p.downed && !run.coopDown && game.state === 'playing') { run.coopDown = true; setTimeout(() => line(game, 'ama', '阿孫，不要睡。……阿嬤在這裡。', { ear: 'left' }), 1200); }
      else if (!p.downed) run.coopDown = false;
    }
    return true;
  });
  return S.revive;
}
