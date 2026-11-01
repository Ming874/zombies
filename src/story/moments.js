// 七個大時刻(CLARITY_PLAN §6):每一個都是「事件」,玩家站在那裡、聽到、看到,不用讀字也懂。
//   M1 207 打來的電話(開場前情卡)   M2 滾過來的球(第一次休息)   M3 門後的聲音(到 207 門口)
//   M4 廣播叫你的名字(第 6 次休息的停電)   M5 頭七(climax.js + deduce.js 的頭七,這裡只放小美的開頭)
//   M6 那張工作證(進 207)   M7 數到十(ending.js)
// 每一個都只播一次(每一局);說話全部經過聲音的鎖(src/story/voice.js),前後不會疊。
import { seq, wait } from './voice.js';
import { sfx, ix as ixs } from '../audio.js';
import * as THREE from 'three';
const _f = new THREE.Vector3();

const M1 = [
  '你的阿嬤林秀英是護理長。\n2003 年 SARS 封院時，她死在 207 號房。',
  '23 年後，七月初一，鬼門開。\n家裡的電話響了：「聖心醫院 207」。',
  '電話裡是阿嬤：\n「阿孫，你來看阿嬤好不好？」',
];

export function installMoments(game, S) {
  const X = game.interact, H = () => game.horror, D = () => game.deduce, O = () => game.objectives;
  const isHost = () => !game.net || !!game.net.isHost;
  const fresh = () => ({ m2: false, m3: false, m4: false, m6: false, m6T: 0, in207: 0, look: 0, quiet: 0, wasSilent: false });
  let run = fresh();
  const flag = (k) => { try { S.flag?.(k); } catch { X.flags.set(k, true); } };
  const Rd = () => game.story?.radio, C = { combatOk: true };
  const hold = (sec) => { try { H()?.director?.hold?.(sec); } catch { /* 略 */ } }; // 大時刻裡靈異導演不放別的驚嚇、不開追逐
  S.moments = { get run() { return run; }, m3: () => m3(), m4: () => m4(), m6: () => m6() };

  // ---------- M1:開場前的三張卡(motion 的冷開場在標題卡之前 await game.motion.coldPre)----------
  let bound = null;
  const bindMotion = () => {
    const M = game.motion;
    if (!M || M === bound) return;
    bound = M;
    M.coldCard = { ...(M.coldCard || {}), line: '農曆七月初一　00:00' };
    M.coldPre = async () => {
      if (game.net?.pvp || game.net?.mode?.pvp) return;
      let skipped = false, cur = null;
      const skip = (e) => { if (e.type === 'keydown' && (e.repeat || !/^(Space|Enter|NumpadEnter|Escape)$/.test(e.code))) return; skipped = true; cur?.skip?.(); };
      addEventListener('keydown', skip, true); addEventListener('mousedown', skip, true);
      try {
        try { ixs.ringStart?.('m1.ring', null, 'bell'); } catch { /* 略 */ }
        await new Promise((r) => setTimeout(r, 2400));
        try { ixs.ringStop?.('m1.ring'); } catch { /* 略 */ }
        for (let i = 0; i < M1.length && !skipped; i++) {
          if (i === 2) setTimeout(() => { if (!skipped) try { ixs.phoneVoice?.('阿孫，你來看阿嬤好不好？', { voice: 'woman', filter: 'phone' }); } catch { /* 略 */ } }, 1100);
          cur = M.card({ lines: M1[i].split('\n'), hold: i === 2 ? 2.6 : 2.4, fadeIn: 700, fadeOut: 450, align: 'center' });
          await cur;
        }
      } finally { try { ixs.ringStop?.('m1.ring'); } catch { /* 略 */ } removeEventListener('keydown', skip, true); removeEventListener('mousedown', skip, true); }
    };
  };

  { const iv = setInterval(() => { if (game.motion) { bindMotion(); clearInterval(iv); } }, 250); setTimeout(() => clearInterval(iv), 60000); } // motion 比劇情晚裝:選單時就要綁好(冷開場在按下開始時)

  // ---------- M2:第一次休息,一顆你小時候的球(opening.js 在阿嬤那一句之後呼叫)----------
  S.moments.m2 = () => {
    if (run.m2) return; run.m2 = true;
    const h = H();
    X.after(3, () => {
      if (game.phase === 'fighting') return;
      let ok = false;
      try { ok = !!h?.event?.('ballRoll', { force: true }); } catch { ok = false; }
      if (!ok) seq(game, [['ama', '金水伯拿來的球……你小時候最愛玩。', undefined, { ear: 'left' }]]); // 球滾不出來(找不到路):她還是說
      flag('h.m2');
    });
  };

  // ---------- M3:207 門後傳出小美 1999 年的聲音,收音機裡的小美愣住 ----------
  function m3() {
    if (run.m3) return; run.m3 = true;
    const w = X.doors?.list?.find((q) => q.lock?.door === 'f2_ward_207');
    const pos = w ? { x: w.cx, y: w.y + 1.2, z: w.cz } : null;
    const tape = '……還醒著的夜貓子，收到請回答。';
    hold(18);
    seq(game, [
      () => { Rd()?.screech?.(1); }, // 收音機在這扇門前面叫到最大聲 → 突然一片死寂 → 門裡的錄音帶(REDESIGN §2.4.9)
      1.4,
      () => { Rd()?.hush?.(2.4); },
      1.2,
      () => { try { ixs.phoneVoice?.(tape, { voice: 'woman', filter: 'radio', pos, gain: 0.8 }); } catch { /* 略 */ } game.interact?.map?.api?.say?.('錄音帶 · 小美（1999）', tape, 3600, 'radio', { critical: true, speak: 3.2 }); S.voice?.claim?.(3.2, 9, 'tape'); },
      1.6,
      ['xl', tape, 3.2, { ...C, gap: 0.2, noWait: true }],
      3.2,
      ['xl', '……那是我的聲音。', 2.2, C],
      ['xl', '為什麼我的聲音，會在那個房間裡？', 3.4, { ...C, gap: 4 }],
      ['xl', '收音機在這扇門前面，叫得好大聲。', 3.0, C],
      ['xl', '……裡面到底有什麼？', 2.4, C],
      () => flag('h.m3'),
    ]);
  }

  // ---------- M4:停電,2003 年的廣播叫阿嬤下樓,接著叫的是你 ----------
  function m4() {
    if (run.m4) return; run.m4 = true;
    const h = H();
    let dark = false;
    try { dark = !!h?.event?.('lightsDie', { force: true }) || !!h?.event?.('blackoutChange', { force: true }); } catch { dark = false; }
    hold(16); // 停電之後
    const api = game.interact?.map?.api;
    seq(game, [
      dark ? 2.2 : 0.8,
      () => { try { sfx.pa?.('up'); } catch { /* 略 */ } },
      0.8,
      () => { try { api?.speak?.({ who: '醫院廣播（2003 年的舊錄音）', parts: ['林秀英護理長，請到一樓大廳。'], voice: 'woman' }, { filter: 'pa', lockOk: true }); } catch { /* 略 */ } S.voice?.claim?.(3.4, 9, 'pa'); },
      3.6,
      ['pa', '{暱稱}，請到一樓大廳。', 2.6, { gap: 0.4 }],
      ['pa', '你的阿嬤在等你。', 2.2, { gap: 1.6 }],
      ['xl', '不要去。', 1.6, { ...C, gap: 0.6 }],
      ['xl', '它以前叫一個護理長下樓，', 2.6, C],
      ['xl', '現在叫你。……不要去。', 2.6, C],
      () => flag('h.m4'),
    ]);
  }

  // ---------- M6:207 床頭那張工作證:那個沒有名字的病人,就是小美 ----------
  function m6() {
    if (run.m6) return; run.m6 = true;
    const api = game.interact?.map?.api;
    try { api?.note?.('H03'); } catch { /* 略 */ }
    D()?.addCard?.('hc.31', { by: 'look' });
    flag('h.m6');
    hold(18);
    seq(game, [
      () => { Rd()?.clear?.(45); }, // 一走進去,收音機的雜訊完全消失(REDESIGN §2.4.9)
      1.6,
      ['xl', '……收音機，突然好清楚。', 2.4, C],
      ['xl', '……我好像看得到了。這個房間。', 3.0, C],
      ['xl', '床、檯燈、一張椅子。', 2.6, C],
      ['xl', '床頭那張卡……', 2.0, { ...C, gap: 1.2 }],
      ['xl', '……那是我的工作證。', 2.4, { ...C, gap: 1.2 }],
      ['xl', '那個沒有名字的病人……', 2.6, { ...C, gap: 1.4 }],
      ['xl', '……是我？', 1.6, { ...C, gap: 4 }],
      ['xl', '她守了十四個晚上的人，是我。', 3.2, C],
      () => X.after(24, () => seq(game, [['xl', '收音機一靠近他們就會叫。', 2.8], ['xl', '207 這裡，叫得最大聲。', 2.6, { gap: 1.2 }], ['xl', '他們身上的針……跟我的血有關，對不對？', 3.6]])),
    ]);
  }

  // ---------- 每幀 ----------
  X.on('reset', () => { run = fresh(); });
  let acc = 0;
  X.tick((dt) => {
    bindMotion();
    if (game.state !== 'playing' || game.net?.pvp) return true;
    if ((acc += dt) < 0.25) return true;
    const step = acc; acc = 0;
    const silent = game.phase !== 'fighting';
    if (silent && !run.wasSilent) {
      run.quiet++;
      if (run.quiet === 6) X.after(9, () => { if (game.phase !== 'fighting' && game.state === 'playing') m4(); }); // M4:第 6 次休息(金水伯先講店的事)
    }
    run.wasSilent = silent;
    // M6:在 207 裡面,看著床頭 0.8 秒,或進門 6 秒
    const dw = !run.m6 && X.doors?.list?.find((q) => q.lock?.door === 'f2_ward_207'), pp = game.player.pos;
    if (!run.m6 && game.hospital?.zone?.id === 'f2_ward_207' && (!dw || Math.hypot(pp.x - dw.cx, pp.z - dw.cz) > 1.6)) { // 真的走進房間(不是站在門口)
      run.in207 += step;
      const A = game.hospital?.anchors?.w207, q = A?.lamp || A?.bed;
      if (q && game.camera) {
        const c = game.camera.position, dx = q.x - c.x, dy = q.y - c.y, dz = q.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
        const f = game.camera.getWorldDirection(_f);
        run.look = d < 4 && (dx * f.x + dy * f.y + dz * f.z) / d > 0.9 ? run.look + step : 0;
      }
      if (run.look >= 0.8 || run.in207 >= 6) m6();
    }
    void isHost; void wait;
    return true;
  });
  return S.moments;
}
