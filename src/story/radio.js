// 手提收音機(REDESIGN §2.4):小美唯一的來源。
//   大廳輪椅旁撿到一台(家屬帶來的,一直調在 AM 1207)→ 地下室收訊變差 → 太平間門口燒壞(「數到十」)→ 阿嬤把她護理站那台留給你。
//   Q 點一下:舉起/放下(舉起:兩耳、清楚;放下:左肩、小一點)。舉起時按住 Q:調頻(掃台);放下時按住 Q:開/關。
//   雜訊 = 你看不到的活屍近了(視線外或被牆擋住的才算;14 m 內開始升;裝死的只有一點點);左右聲道偏向最近那一隻(一陣陣的雜訊從那一側的耳邊出來,
//   只給左右,不給位置);6 m 內又看不到牠:尖叫。地下室、失魂(三把火都熄了)時不可靠:雜訊忽大忽小、方向亂跳。
//   開著(雜訊大、小美在說話)活屍也聽得到你(loud)。
//   阿嬤來之前收音機自己安靜(hush);小美聽不到阿嬤。
// API(game.story.radio):kind / dead / on / raised / level / loud / has() / hear() / weak() / offer(variant) / give(kind) / hush(秒) / clear(秒)
//   / screech(k) / voice() → { pos, gain }(小美這一句從哪裡出來)/ garble(text) / warn() / on(ev, fn)
import './radio.css';
import { sfx, ghost, ix as ixs } from '../audio.js';
import { seq, wait } from './voice.js';
import { captions } from '../ui/captions.js';
import * as THREE from 'three';

const FREQ = [['AM 1206', 'ra.1206'], ['AM 1062', 'ra.emerg'], ['AM 891', 'ra.drop'], ['FM 105.3', 'ra.recovery'], ['AM 1207', 'ra.1999']]; // 調頻:掃得到的台(文字在 interact/lines.js RADIO)
const _f = new THREE.Vector3();
const NONE = { near: null, sense: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function installRadio(game, S) {
  const X = game.interact, O = () => game.objectives, H = () => game.horror;
  const fresh = () => ({ kind: null, dead: false, on: true, raised: false, level: 0, bed: false, hushUntil: 0, clearUntil: 0, quietT: 0,
    screechT: -99, screechN: 0, loopT: 0, lobbyT: 0, warnT: -99, warnWave: 0, warnN: 0, b1Walk: 0, lastP: null, burning: false,
    gift: false, giftT: 0, giftRest: 0, giftAsk: false, fallback: false, rests: 0, wasSilent: false, freq: 4, cast: null, ackT: 0, ack: null, autoLower: 0,
    panT: 0, pan: 0, junk: 0, junkT: 0, drop: false, near: null });
  let run = fresh();
  const ev = new Map();
  const emit = (k, a) => { for (const f of ev.get(k) || []) { try { f(a); } catch (e) { console.warn('[radio]', e); } } };
  const now = () => game.time || 0;
  const isB1 = () => /^b1_/.test(game.hospital?.zone?.id || '');

  const R = S.radio = {
    get kind() { return run.kind; }, get dead() { return run.dead; }, get on() { return run.on; }, get raised() { return run.raised; },
    get level() { return run.level; }, get run() { return run; },
    // 活屍察覺半徑加多少(m):開著、雜訊大 +3;小美正在說話 +4(REDESIGN §2.4.6)
    get loud() { if (!R.hear()) return 0; const V = S.voice; if (V && V.who === 'xl' && now() < V.until) return 4; return run.level > 0.4 ? 3 : 0; },
    has: () => !!run.kind && !run.dead,
    hear: () => R.has() && run.on,
    weak: () => R.has() && isB1(),
    offer: (v) => (v === 'ama' ? (run.gift || run.fallback) && run.kind !== 'ama' : !run.kind),
    on(k, f) { if (!ev.has(k)) ev.set(k, new Set()); ev.get(k).add(f); return () => ev.get(k).delete(f); },
    give,
    hush(sec = 2.5) { run.hushUntil = Math.max(run.hushUntil, now() + sec); },
    clear(sec = 8) { run.clearUntil = Math.max(run.clearUntil, now() + sec); }, // 207 裡:雜訊完全消失
    screech(k = 0.7, long = false) { if (!R.hear() && !long) return; run.screechT = now(); if (!run.screechN++) S.flag?.('h.radio.screech'); try { sfx.screech(k, long); } catch { /* 略 */ } hud.flash(); emit('screech', k); },
    raise(v = !run.raised) { if (!R.has()) return; run.raised = !!v; hud.draw(); emit('raise', run.raised); },
    // [w6] 問小美(objectives.ask 決定說什麼):壞了的收音機拍一拍,先吱一聲雜訊
    ask() {
      if (!run.kind || run.burning) return false;
      if (run.dead) { try { sfx.screech(0.2, false); } catch { /* 略 */ } hud.flash(); }
      return O()?.ask?.() ?? false;
    },
    toggle(v = !run.on) { if (!R.has()) return; run.on = !!v; try { ixs.switchClick?.(null, run.on); } catch { /* 略 */ } if (!run.on) stopCast(); hud.draw(); emit('toggle', run.on); },
    // 小美這一句從哪裡出來:放下 = 左肩(3D,小聲);舉起 = 兩耳
    voice() {
      if (run.raised || !game.player) return { pos: null, gain: 1 };
      const p = game.player, yaw = p.yaw || 0;
      return { pos: { x: p.pos.x - Math.cos(yaw) * 0.35, y: p.pos.y + 1.25, z: p.pos.z + Math.sin(yaw) * 0.35 }, gain: 0.7 };
    },
    // 地下室:三成的字變成「……」;失魂(三把火都熄了,game.soul):一半的字聽不清,有些字被雜訊蓋成「▒」
    garble(text) {
      const lost = !!game.soul?.lost?.();
      if (!R.weak() && !lost) return text;
      const k = lost ? 0.5 : 0.3;
      let out = '', skip = false;
      for (const ch of String(text)) { if (/[，。、！？\s]/.test(ch)) { out += ch; skip = false; continue; } if (Math.random() < k) { if (lost && Math.random() < 0.4) { out += '▒'; skip = false; } else { if (!skip) out += '……'; skip = true; } } else { out += ch; skip = false; } }
      return out;
    },
    // 小美要說劇情:指針自己滑回 1207
    tuneHome() { if (run.freq !== 4) { run.freq = 4; stopCast(); try { ixs.tuneSweep?.(game.player?.pos); } catch { /* 略 */ } hud.draw(); } },
  };

  // ---------- HUD(DOM,左下)----------
  const hud = (() => {
    const root = game.ui?.hudEl || document.body;
    const el = document.createElement('div');
    el.className = 'hd rd-hud hd-hide';
    el.innerHTML = '<div class="rd-body"><div class="rd-win"><span class="rd-f">AM 1207</span><i class="rd-needle"></i></div><div class="rd-sig"><b></b><b></b><b></b></div><i class="rd-led"></i><i class="rd-tape">207 聽著心跳會加快　——林</i></div><div class="rd-key"><kbd>Q</kbd><span>舉起</span></div>';
    root.appendChild(el);
    const f = el.querySelector('.rd-f'), key = el.querySelector('.rd-key span'), bars = [...el.querySelectorAll('.rd-sig b')];
    let ft = 0;
    const H2 = {
      el,
      draw() {
        el.classList.toggle('hd-hide', !run.kind);
        el.classList.toggle('ama', run.kind === 'ama');
        el.classList.toggle('raised', run.raised && !run.dead);
        el.classList.toggle('off', !run.on || run.dead);
        el.classList.toggle('dead', run.dead);
        f.textContent = run.dead ? '' : FREQ[run.freq][0];
        el.style.setProperty('--k', String(run.dead ? 0 : (run.freq + 0.5) / FREQ.length));
        key.textContent = run.dead ? '拍一下：問小美' : run.raised ? '放下 · 按住調頻' : run.on ? '舉起：問小美 · 按住關掉' : '舉起：問小美 · 按住打開';
      },
      tick() {
        const sig = run.dead ? 0 : isB1() ? 1 : 3;
        bars.forEach((b, i) => b.classList.toggle('on', i < sig));
        const V = S.voice, talk = V && V.who === 'xl' && now() < V.until && R.hear();
        el.classList.toggle('talk', !!talk);
        el.classList.toggle('wait', !talk && R.has() && !run.on && !!S.voice?.q?.length);
        el.style.setProperty('--n', run.level.toFixed(2));
        if (ft && now() > ft) { el.classList.remove('flash'); ft = 0; }
      },
      flash() { el.classList.add('flash'); ft = now() + 0.6; },
    };
    return H2;
  })();
  R.hud = hud;

  // ---------- 撿起來 ----------
  function give(kind = 'lobby', o = {}) {
    const first = !run.kind;
    run.kind = kind; run.dead = false; run.on = true; run.freq = 4;
    try { sfx.pickupItem?.(); ixs.switchClick?.(o.pos || null, true); } catch { /* 略 */ }
    if (kind === 'ama') {
      run.gift = false; run.fallback = false;
      try { X.get('h.ix.radio.nurse')?.light?.(false); } catch { /* 略 */ }
      game.ui?.pickup?.('阿嬤的收音機', '#e8c890', { sub: '側面膠帶：霧港夜話（重播）　207 聽著心跳會加快　——林' });
      S.flag?.('h.radio.ama');
    } else {
      game.ui?.pickup?.('手提收音機', '#e8d9a8', { sub: '把手綁著紙條：「爸，醒來的時候，聽你最愛的節目。」' });
      S.flag?.('h.radio');
    }
    if (first || kind === 'ama') { run.raised = true; run.autoLower = 0; } // 第一次自動舉起;講完自己放下
    if (kind === 'ama') { // 阿嬤的收音機:小美的聲音第一次這麼清楚;在照片前,阿嬤說一句(REDESIGN §2.4.8)
      const C = { combatOk: true };
      X.after(0.8, () => seq(game, [
        ['xl', '……喂？是你！你還在！', 2.4, C], ['xl', '這台的聲音，好清楚。', 2.4, C], ['xl', '……誰給你的？', 2.0, { ...C, gap: 2 }],
        ['xl', '好啦好啦，你不會講話。', 2.6, C], ['xl', '我們繼續。', 1.6, C],
        () => {
          const m = X.list?.find((e) => e.kind === 'memorial'), w = m && X.where(m), p = game.player.pos;
          if (w && Math.abs(w.y - p.y) < 3 && Math.hypot(w.x - p.x, w.z - p.z) < 6 && game.phase !== 'fighting') X.after(3, () => seq(game, [['ama', '阿孫小時候，最愛在護理站等阿嬤下班。', undefined, { ear: 'left', many: true }]]));
        },
      ]));
    }
    hud.draw();
    emit('give', kind);
  }

  // ---------- 調頻(舉起時按住 Q)----------
  function stopCast() { try { run.cast?.stop?.(); } catch { /* 略 */ } run.cast = null; }
  function tune() {
    run.freq = (run.freq + 1) % FREQ.length;
    stopCast();
    try { ixs.tuneSweep?.(game.player?.pos); } catch { /* 略 */ }
    const api = X.map?.api, id = FREQ[run.freq][1];
    const l = id && api?.lineById?.(id);
    if (l && run.freq !== 4) run.cast = api.speak(l, { filter: 'radio', ...R.voice() });
    hud.draw();
  }

  // ---------- 按鍵:Q ----------
  let qDown = 0, qFired = false;
  const blocked = () => game.state !== 'playing' || game.paused || X.modal || game.deduce?.isOpen || game.shopUIOpen || !!game.story?.ending?.active; // 結局裡 Q 是選擇鍵
  // [w6] 點一下 Q 舉起來 = 問小美(目前的目標怎麼做;再問一次會在地圖上畫記號)。壞掉的收音機:點一下 = 拍一拍,雜訊裡還聽得到她
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyQ' || e.repeat || !run.kind || blocked() || e.target?.closest?.('input, textarea')) return;
    qDown = performance.now(); qFired = false;
  });
  addEventListener('keyup', (e) => {
    if (e.code !== 'KeyQ' || !qDown) return;
    const held = performance.now() - qDown; qDown = 0;
    if (qFired || held >= 450 || blocked()) return;
    if (R.has()) { const up = !run.raised; R.raise(); if (up) R.ask(); } else if (run.dead) R.ask();
  });
  const holdCheck = () => {
    if (!qDown || qFired || !R.has() || performance.now() - qDown < 450) return;
    qFired = true;
    if (run.raised && run.on) tune(); else R.toggle();
  };

  // ---------- 大廳那台:輪椅旁,很小聲地叫人(還沒撿起來的時候)----------
  const lobbyEnt = () => X.get('h.ix.radio.lobby');
  function lobbyLoop() {
    const e = lobbyEnt();
    if (!e || run.kind || game.net) return;
    const w = X.where(e), p = game.player.pos, d = Math.hypot(w.x - p.x, w.z - p.z);
    if (Math.abs(w.y - p.y) > 3 || d > 26) return;
    const since = now() - (run.lobbyT0 ||= now());
    const gain = since > 25 ? 0.95 : 0.55;
    try { ixs.phoneVoice?.('……這個頻道，有人嗎？', { voice: 'woman', filter: 'radio', pos: { x: w.x, y: w.y, z: w.z }, gain }); } catch { /* 略 */ }
    if (d < 12) X.map?.api?.say?.('收音機', '……這個頻道，有人嗎？', 2600, 'radio');
    if (since > 15 && !run.lobbyGlint) { run.lobbyGlint = true; O()?.glintAt?.({ x: w.x, y: w.y, z: w.z }, 12); }
  }

  // ---------- 阿嬤的收音機(地下室燒壞之後的下一次休息,自己打開)----------
  const nurseEnt = () => X.get('h.ix.radio.nurse');
  function nurseLoop() {
    const e = nurseEnt();
    if (!e || !run.gift) return;
    const w = X.where(e);
    try { ixs.phoneVoice?.('……喂？……有人嗎？', { voice: 'woman', filter: 'radio', pos: { x: w.x, y: w.y, z: w.z }, gain: 0.85 }); } catch { /* 略 */ }
    const p = game.player.pos;
    if (Math.abs(w.y - p.y) < 3 && Math.hypot(w.x - p.x, w.z - p.z) < 12) X.map?.api?.say?.('收音機', '……喂？……有人嗎？', 2600, 'radio');
  }
  function onRest() {
    run.rests++;
    if (!run.dead || run.kind === 'ama') return;
    run.giftRest++;
    if (run.giftRest === 1) {
      run.gift = true; run.giftT = 0;
      try { nurseEnt()?.light?.(true); } catch { /* 略 */ }
      emit('gift');
      // 不在二樓:阿嬤的訊號 →「收音機……阿嬤放在護理站了。」
      const e = nurseEnt(), w = e && X.where(e);
      if (w && Math.abs(w.y - game.player.pos.y) > 3) X.after(9, () => { if (game.phase !== 'fighting' && run.kind !== 'ama') seq(game, [['ama', '收音機……阿嬤放在護理站了。', undefined, { ear: 'left' }]]); });
    } else if (run.giftRest === 3 && !run.fallback) { // 兩次休息都沒去拿:金水伯說櫃台上多了一台
      run.fallback = true;
      S.kimsui?.('ph.shop.radio', ['櫃台上多了一台收音機。', '……不是阿伯放的。']);
    }
  }

  // ---------- 地下室:收訊變差 → 太平間門口燒壞(REDESIGN §2.4.7)----------
  function burn() {
    if (run.burning || run.dead || !R.has()) return;
    run.burning = true;
    try { H()?.director?.hold?.(30); } catch { /* 略 */ }
    R.tuneHome();
    seq(game, [
      () => { run.burnK = 0.85; R.screech(0.7); },
      ['xl', '……太多了……我聽到好多人……', 3.2, { raw: true, combatOk: true, gap: 0.6 }],
      ['xl', '我跟你講……怕的時候……', 2.8, { raw: true, combatOk: true, gap: 0.5 }],
      ['xl', '數到十。數到十，天就……', 2.6, { raw: true, combatOk: true, gap: 0.2 }],
      () => { R.screech(1, true); },
      3.3,
      () => {
        run.dead = true; run.burning = false; run.burnK = 0; run.raised = false; stopCast();
        if (run.bed) { try { sfx.radio(false); } catch { /* 略 */ } run.bed = false; }
        game.ui?.feed?.('收音機發出一聲很長的尖叫，冒出一股焦味，沒有聲音了。', { color: '#d9b28a', ms: 7000 });
        S.notes?.add?.('dead', '收音機在地下室燒壞了。小美最後說：怕的時候，數到十。');
        S.flag?.('h.radio.dead');
        try { H()?.director?.hold?.(25); } catch { /* 略 */ }
        hud.draw(); emit('dead');
      },
    ], { maxWait: 20 });
  }

  // ---------- 戰鬥中的警告(≤ 8 字;每 20 秒最多一句;每一波最多 3 句)----------
  function warnTick(near) {
    if (!R.hear() || !captions.combat() || now() - run.warnT < 20) return;
    if (run.warnWave !== game.round) { run.warnWave = game.round; run.warnN = 0; }
    if (run.warnN >= 3) return;
    const V = S.voice; if (V && now() < V.until) return;
    const p = game.player, w = game.weapons;
    let t = null;
    const alive = game.zombies.filter((z) => z.alive && !z.amb?.dormant);
    if (near && near.d < 8) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), dx = near.z.pos.x - p.pos.x, dz = near.z.pos.z - p.pos.z, dl = Math.hypot(dx, dz) || 1, dot = (dx * fx + dz * fz) / dl;
      if (Math.abs(near.z.pos.y - p.pos.y) > 1.6) t = '樓梯上有一個。';
      else if (dot < -0.55) t = '後面！';
      else if (dot < 0.2) t = (fx * dz - fz * dx) > 0 ? '右邊。' : '左邊。';
    }
    if (!t && alive.length === 1 && !(game.toSpawn > 0) && !(game.queue?.length)) t = '還有一個。';
    if (!t && w?.ammo && w.ammo.mag <= 3 && (w.ammo.reserve ?? 1) > 0 && !w.reloading) t = '先換彈匣。';
    if (!t) return;
    run.warnT = now(); run.warnN++;
    S.say?.('xl', t, { warn: true });
  }

  // ---------- 感官:你看不到的活屍 ----------
  // 看得到 = 在前方視野裡(水平夾角約 57° 以內)而且沒有被擋住;只對 16 m 內、視野裡的打射線(每 0.25 秒幾條)
  function unseen() {
    const pl = game.player, p = pl.pos, cam = game.camera?.position || { x: p.x, y: p.y + 1.6, z: p.z };
    const fx = -Math.sin(pl.yaw || 0), fz = -Math.cos(pl.yaw || 0), W = game.world;
    let near = null, sense = null;
    for (const z of game.zombies || []) {
      if (!z.alive || Math.abs(z.pos.y - p.y) > 4) continue;
      const dx = z.pos.x - p.x, dz = z.pos.z - p.z, d = Math.hypot(dx, dz);
      const dorm = !!z.amb?.dormant, e = dorm ? d * 1.6 : d;
      if (e > 16 || (sense && e >= sense.e && (dorm || (near && d >= near.d)))) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      let seen = false;
      if (dot > 0.55) { try { seen = W.hasLineOfSight(cam.x, cam.y, cam.z, z.pos.x, z.pos.y + (dorm ? 0.5 : 1.3), z.pos.z); } catch { seen = true; } }
      if (seen) continue;
      const q = { z, d, e, side: (fx * dz - fz * dx) > 0 ? 1 : -1, back: dot < -0.55 };
      if (!sense || e < sense.e) sense = q;
      if (!dorm && (!near || d < near.d)) near = q;
    }
    return { near, sense };
  }
  // 左右聲道:雜訊大的時候,每 1.4~2.6 秒在那一側的耳邊爆一小段雜訊(越近越靠耳朵、越大聲);地下室、失魂時方向亂跳
  function panTick(step, sense, shaky, lost) {
    if ((run.panT -= step) > 0) return;
    if (run.level < 0.28 || (!sense && !(shaky && run.junk > 0)) || now() < run.hushUntil || now() < run.clearUntil) { run.panT = 0.5; return; }
    run.panT = 1.4 + Math.random() * 1.2;
    let side = sense ? sense.side : Math.random() < 0.5 ? -1 : 1;
    if (shaky && Math.random() < (lost ? 0.6 : 0.4)) side = Math.random() < 0.5 ? -1 : 1;
    const pl = game.player, yaw = pl.yaw || 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    const d = 2.2 - 1.3 * clamp(run.level, 0, 1), bk = sense?.back ? 0.35 : 0;
    run.pan = side;
    try { ghost.tune({ x: pl.pos.x + rx * side * d - fx * bk * d, y: pl.pos.y + 1.5, z: pl.pos.z + rz * side * d - fz * bk * d }, 0.45); } catch { /* 略 */ }
  }

  // ---------- 每 0.25 秒 ----------
  X.on('reset', () => { stopCast(); if (run.bed) { try { sfx.radio(false); } catch { /* 略 */ } } run = fresh(); hud.draw(); });
  let acc = 0, loopAcc = 0;
  X.tick((dt) => {
    holdCheck();
    if (game.state !== 'playing') return true;
    if ((acc += dt) < 0.25) { hud.tick(); return true; }
    const step = acc; acc = 0;
    if (game.net && !run.kind && game.round >= 1) give('lobby'); // 多人:每個人一開始就有自己的收音機
    // 休息(招魂燈熄)
    const silent = game.phase !== 'fighting';
    if (silent && !run.wasSilent) onRest();
    run.wasSilent = silent;
    // 大廳那台、阿嬤那台的叫聲
    if ((loopAcc += step) >= (run.kind ? 8 : 6)) { loopAcc = 0; if (!run.kind) lobbyLoop(); else if (run.gift) nurseLoop(); }
    if (run.fallback && run.kind !== 'ama' && game.hospital?.zone?.id === 'f1_store') give('ama');
    // 第一次自動舉起:小美講完自己放下
    if (run.raised && run.autoLower >= 0 && R.has()) { const V = S.voice; if (V && V.who === 'xl' && now() < V.until + 0.5) run.autoLower = 0; else if ((run.autoLower += step) > 6) { run.autoLower = -1; R.raise(false); emit('lowered'); } }
    // 雜訊 = 最近一隻「你看不到」的活屍(near:醒著的;sense:含裝死的,距離 ×1.6 算 → 只有一點點雜訊)
    const p = game.player.pos;
    const { near, sense } = R.hear() ? unseen() : NONE; // 收音機沒開就不必算
    run.near = sense ? { d: +sense.d.toFixed(1), side: sense.side, back: sense.back, dormant: !!sense.z.amb?.dormant } : null;
    const b1 = isB1(), lost = !!game.soul?.lost?.(), shaky = b1 || lost;
    let lvl = 0;
    if (R.hear()) {
      lvl = 0.08 + 0.6 * clamp((14 - (sense ? sense.e : 99)) / 10, 0, 1);
      // 207 門口:叫得比任何活屍都大聲(她的源頭)
      const dw = X.doors?.list?.find((q) => q.lock?.door === 'f2_ward_207');
      if (dw && Math.abs(dw.y - p.y) < 2.5) { const d7 = Math.hypot(dw.cx - p.x, dw.cz - p.z); if (d7 < 6) lvl = Math.max(lvl, 0.5 + 0.4 * (1 - d7 / 6)); }
      if (b1) lvl = Math.min(1, lvl + 0.12);
      if (shaky) { // 不可靠:一陣一陣亂跳的雜訊、有時整個掉下去(你分不出是不是真的有東西)
        if ((run.junkT -= step) <= 0) { run.junkT = 0.6 + Math.random() * 1.6; run.junk = Math.random() < (lost ? 0.55 : 0.35) ? 0.15 + Math.random() * (lost ? 0.55 : 0.3) : 0; run.drop = Math.random() < 0.25; }
        lvl = run.drop ? lvl * 0.2 : Math.max(lvl * (lost ? 0.6 : 0.85), run.junk);
      }
      if (run.burnK) lvl = Math.max(lvl, run.burnK);
      if (now() < run.hushUntil || now() < run.clearUntil) lvl = 0;
      lvl *= run.raised ? 1 : 0.75;
      // 尖叫:6 m 內又看不到牠
      if (near && near.d < 6 && now() - run.screechT > 8 && !(now() < run.hushUntil)) {
        let see = true;
        try { const c = game.camera.position, zp = near.z.pos; see = game.world.hasLineOfSight(c.x, c.y, c.z, zp.x, zp.y + 1.4, zp.z); } catch { see = true; }
        if (!see) R.screech(clamp((6 - near.d) / 6 + 0.4, 0.4, 1));
      }
      warnTick(near);
      panTick(step, sense, shaky, lost);
    }
    run.level += (lvl - run.level) * Math.min(1, step * (now() < run.hushUntil ? 2.2 : 5));
    const bedLvl = run.level * 0.55;
    if (bedLvl > 0.01) { try { sfx.radio(true, bedLvl); } catch { /* 略 */ } run.bed = true; }
    else if (run.bed) { try { sfx.radio(false); } catch { /* 略 */ } run.bed = false; }
    // 地下室:走了 25 m 或到太平間門口(目前在找保險絲)→ 燒壞
    if (R.has() && isB1()) {
      if (run.lastP) run.b1Walk += Math.hypot(p.x - run.lastP.x, p.z - run.lastP.z);
      if ((game.hospital?.zone?.id === 'b1_morgue' || run.b1Walk > 25) && O()?.step?.() === 'h.s.fuses') burn();
    }
    run.lastP = { x: p.x, z: p.z };
    hud.tick();
    return true;
  });
  hud.draw();
  void wait; void _f;
  return R;
}
