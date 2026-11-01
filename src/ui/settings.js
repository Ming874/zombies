import * as audio from '../audio.js';

const sfx = audio.sfx;

// 玩家設定:存在 localStorage(隱私模式時只在本次有效),套用到遊戲。
// - 操作(靈敏度、反轉 Y、FOV)、受傷效果、新手提示:存在這裡(shh.settings.v1)
// - 音量:交給音效模組 sfx.setVolume / getVolume(它自己也會存);沒有時退回直接調整混音匯流排
// - 畫質(預設檔、陰影、光暈、動態解析度):game.quality 是唯一來源(它自己存在 hz.quality.v1);沒有效能模組時直接調整渲染器
const KEY = 'shh.settings.v1';
export const DEFAULTS = {
  sens: 1, // 滑鼠靈敏度倍率
  invertY: false,
  fov: 75,
  master: 0.9, music: 0.7, sfx: 0.9, // 音量 0..1
  hurtFx: true, // 受傷畫面效果(暈影/方向指示)
  tips: true, // 新手提示
  motion: 'auto', // [motion] 畫面動態 auto(跟著 prefers-reduced-motion)| full | reduced(src/ui/motion.js)
  scare: 'normal', // [ghost] 驚嚇強度 off | low | normal | high(src/horror/director.js)
  // 沒有效能模組時的畫質備援
  preset: 'high', shadows: true, bloom: true, dynamicRes: true,
};
const QKEYS = new Set(['preset', 'shadows', 'bloom', 'dynamicRes']);
const VOL = new Set(['master', 'music', 'sfx']);
const FALLBACK = { low: { shadows: false, scale: 0.6 }, medium: { shadows: true, scale: 0.8 }, high: { shadows: true, scale: 1 }, ultra: { shadows: true, scale: 1 } };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
  } catch { return { ...DEFAULTS }; }
}

const S = load();
// 音效模組已有使用者音量就以它為準(兩邊保持一致)
for (const k of VOL) { const v = sfx.getVolume?.(k); if (typeof v === 'number' && Number.isFinite(v)) S[k] = v; }
const subs = new Set();
let game = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 隱私模式等 */ } };
const notify = (k, v) => { for (const f of subs) f(k, v); };

export const settings = {
  get(k) {
    const q = game?.quality;
    if (q && QKEYS.has(k)) return k === 'preset' ? q.preset : !!q.get(k);
    return S[k];
  },
  all: () => ({ ...S }),
  set(k, v) {
    const q = game?.quality;
    if (q && QKEYS.has(k)) { // 畫質交給效能模組
      if (k === 'preset') q.setPreset(v); else q.set(k, !!v);
      notify(k, v);
      return;
    }
    if (S[k] === v) return;
    S[k] = v;
    save();
    if (game) apply(game, k);
    notify(k, v);
  },
  reset() {
    Object.assign(S, DEFAULTS);
    try { localStorage.removeItem(KEY); } catch { /* 略過 */ }
    const q = game?.quality;
    if (q) q.setPreset(q.detected?.preset || 'high'); // 畫質回到自動偵測的預設檔
    if (game) apply(game);
    notify(null);
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  // 自動偵測的畫質(設定頁顯示用)
  detected: () => game?.quality?.detected?.preset || null,
  // 由遊戲在建立後呼叫一次;之後每次 set 都會自動套用
  attach(g) { game = g; apply(g); },
  // 開始遊戲時呼叫:AudioContext 建立後套用音量(畫質不在這裡重設,避免蓋掉自動偵測/玩家選的預設檔)
  apply: () => { if (game) { applyVolume(); applyLook(game); } },
};

// 音量:有 sfx.setVolume 就用;否則直接調整混音匯流排(記住原本的預設增益)
function applyVolume() {
  if (typeof sfx.setVolume === 'function') {
    for (const k of VOL) sfx.setVolume(k, S[k]);
    return;
  }
  const A = audio._internal?.A; // 音效模組若移除 _internal 也不會出錯
  if (!A?.ctx) return; // AudioContext 尚未建立(使用者互動後才有),開始遊戲時會再套用一次
  const set = (node, k) => {
    if (!node?.gain) return;
    node._def ??= node.gain.value;
    node.gain.setTargetAtTime(node._def * k, A.ctx.currentTime, 0.05);
  };
  set(A.master, S.master / 0.9);
  set(A.bus?.music, S.music);
  set(A.bus?.amb, S.music);
  set(A.bus?.sfx, S.sfx);
  set(A.bus?.voice, S.sfx);
  set(A.bus?.ui, S.sfx);
}

// 沒有效能模組(game.quality)時的畫質備援
function applyQualityFallback(g) {
  if (g.quality) return;
  const r = g.renderer;
  if (!r) return;
  const P = FALLBACK[S.preset] || FALLBACK.high;
  const sh = S.shadows && P.shadows;
  if (r.shadowMap.enabled !== sh) {
    r.shadowMap.enabled = sh;
    if (g.player?.flashlight) g.player.flashlight.castShadow = sh;
  }
  const pr = Math.min(window.devicePixelRatio || 1, 1.5) * P.scale;
  if (Math.abs(r.getPixelRatio() - pr) > 1e-3) {
    r.setPixelRatio(pr);
    g.composer?.setPixelRatio?.(pr);
    g.resize?.();
  }
  if (g.bloom) g.bloom.enabled = !!S.bloom;
}

function applyLook(g) {
  const p = g.player;
  if (!p) return;
  if (!p._lookBase) { // 包一層:靈敏度與反轉 Y(不動 player.sensMul,那是開鏡用的)
    p._lookBase = p.look.bind(p);
    p.look = (dx, dy) => p._lookBase(dx * S.sens, dy * S.sens * (S.invertY ? -1 : 1));
  }
  g.baseFov = S.fov; // 開鏡與巴雷特狙擊鏡都以 game.baseFov 為基準換算(combat.js updateCombat)
  if (g.camera && !(g.weapons?.ads > 0.01)) {
    g.camera.fov = S.fov;
    g.camera.updateProjectionMatrix();
  }
}

function apply(g, k = null) {
  if (!k || k === 'sens' || k === 'invertY' || k === 'fov') applyLook(g);
  if (!k || VOL.has(k)) applyVolume();
  if (QKEYS.has(k)) applyQualityFallback(g); // 效能模組(game.quality)在 main.js 建立後就由它負責
  if (!k || k === 'tips') g.ui?.tips?.setEnabled(S.tips);
}
