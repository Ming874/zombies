// 錄音配樂:用 <audio> 串流播放(不整首解碼進記憶體)→ MediaElementSource → 配樂匯流排(受配樂音量與閃避控制)。
// 兩台「唱盤」交叉淡入淡出;依配樂狀態(menu/explore/tension/fight/boss/break/shop/dead)挑曲目。
// 不用原生 loop(MP3 循環點會有空隙):每首快結束前 xf 秒就交叉淡化到另一台唱盤(同狀態的另一首,或同一首從頭),完全無縫。
// 長曲目第一次播放時從隨機的段落開始(配合淡入),每局聽到的不一樣。某首載入失敗就跳過;全部失敗時程式配樂(music.js)單獨撐場。
import { A, gain, clamp, pick, rand } from './core.js';
import { TRACKS, STINGS } from './bank.js';

const BASE = `${import.meta.env?.BASE_URL ?? '/'}audio/`;
const X = { mood: null, decks: [], cur: -1, failed: new Set(), playing: null, ctx: null, level: 1, blocked: false, gapAt: 0, restUntil: 0 };
// 留白(dread needs space):這些狀態播 [a, b] 秒後淡出,安靜 [c, d] 秒再換下一首
const GAPS = { explore: [70, 130, 30, 70], break: [80, 140, 35, 75] };
// 換狀態時的淡入淡出秒數
const FADE = { menu: 3, explore: 4.5, tension: 3, fight: 1.8, boss: 1.4, break: 3.5, shop: 3, dead: 1.2 };

function makeDeck() {
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  const src = A.ctx.createMediaElementSource(el);
  const g = gain(0, A.bus.music);
  const d = { el, g, src, on: false, track: null, tok: 0, ending: false };
  el.addEventListener('error', () => { if (d.track) { X.failed.add(d.track.f); if (X.decks[X.cur] === d) { X.playing = null; next(true); } } });
  el.addEventListener('timeupdate', () => {
    if (X.decks[X.cur] !== d || !d.track || d.ending || !el.duration) return;
    if (el.duration - el.currentTime < (d.track.xf ?? 5)) { d.ending = true; if (d.track.loop) next(false); else if (X.mood === 'dead') fadeOut(d, d.track.xf ?? 2); else next(false); }
  });
  el.addEventListener('ended', () => { if (X.decks[X.cur] === d && !d.ending) next(true); });
  return d;
}

function ensureDecks() {
  if (!A.ctx || typeof Audio === 'undefined' || typeof A.ctx.createMediaElementSource !== 'function') return false;
  if (X.ctx !== A.ctx) { X.ctx = A.ctx; X.decks = [makeDeck(), makeDeck()]; X.cur = -1; X.playing = null; }
  return true;
}

function fadeOut(d, sec) {
  const n = A.ctx.currentTime;
  d.g.gain.cancelScheduledValues(n);
  d.g.gain.setValueAtTime(d.g.gain.value, n);
  d.g.gain.linearRampToValueAtTime(0, n + sec);
  const tok = ++d.tok;
  setTimeout(() => { if (d.tok === tok) { d.el.pause(); d.track = null; d.el.removeAttribute('src'); d.el.load(); plug(d, false); } }, sec * 1000 + 150);
}
function plug(d, on) {
  if (d.on === on) return;
  d.on = on;
  try { if (on) d.src.connect(d.g); else d.src.disconnect(); } catch { /* 已斷 */ }
}

function playTrack(tr, sec, fromStart) {
  if (!ensureDecks()) return;
  const old = X.decks[X.cur];
  const nx = X.decks[(X.cur + 1) % 2];
  if (old && old.track) fadeOut(old, sec);
  nx.tok++;
  plug(nx, true);
  nx.track = tr;
  nx.ending = false;
  nx.el.loop = false;
  if (!nx.el.src.endsWith(tr.f)) nx.el.src = BASE + tr.f;
  // 起點:從頭,或長曲目隨機四分之一段落
  const at = fromStart || !tr.loop || tr.dur < 50 ? 0 : pick([0, 0.25, 0.5, 0.75]) * (tr.dur - 10);
  const seek = () => { try { nx.el.currentTime = at; } catch { /* 尚未可跳 */ } };
  if (nx.el.readyState >= 1) seek(); else nx.el.addEventListener('loadedmetadata', seek, { once: true });
  const n = A.ctx.currentTime;
  nx.g.gain.cancelScheduledValues(n);
  nx.g.gain.setValueAtTime(0, n);
  nx.g.gain.linearRampToValueAtTime((tr.g ?? 0.6) * X.level, n + sec);
  const p = nx.el.play();
  if (p && p.catch) p.catch(() => { X.blocked = true; X.playing = null; }); // 自動播放被擋:等下一次互動(resumeTracks)
  X.cur = (X.cur + 1) % 2;
  X.playing = tr;
  X.blocked = false;
}

function listFor(mood) { return (TRACKS[mood] || []).filter((t) => !X.failed.has(t.f)); }

// 接下一首:同狀態裡換一首不同的(只有一首就同一首從頭,交叉淡化)
function next(now) {
  const list = listFor(X.mood);
  if (!list.length) { const d = X.decks[X.cur]; if (d && d.track) fadeOut(d, 3); X.playing = null; return; }
  const cand = list.length > 1 ? list.filter((t) => t !== X.playing) : list;
  const tr = pick(cand);
  playTrack(tr, now ? 2 : tr.xf ?? 5, true);
}

// 配樂狀態改變:同一組曲目(或共用曲目)就不切
export function setTrackMood(mood) {
  if (X.mood === mood && (X.playing || X.restUntil)) return;
  if (X.mood !== mood) { X.gapAt = 0; X.restUntil = 0; }
  X.mood = mood;
  if (!A.ctx) return;
  const list = listFor(mood);
  if (X.playing && list.includes(X.playing)) return;
  if (!list.length) { const d = X.decks[X.cur]; if (d && d.track) fadeOut(d, FADE[mood] ?? 3); X.playing = null; return; }
  playTrack(pick(list), FADE[mood] ?? 3, mood === 'menu' || mood === 'dead');
}

// 每 0.4 秒(music.js 呼叫):留白的排程
export function trackTick(t) {
  const gp = GAPS[X.mood];
  if (!gp || !A.ctx) { X.restUntil = 0; return; }
  if (X.restUntil) {
    if (t < X.restUntil) return;
    X.restUntil = 0; X.gapAt = t + rand(gp[0], gp[1]);
    const list = listFor(X.mood);
    if (list.length) playTrack(pick(list.length > 1 ? list.filter((x) => x !== X.last) : list), 7, false);
    return;
  }
  if (!X.gapAt) X.gapAt = t + rand(gp[0], gp[1]);
  if (X.playing && t > X.gapAt) { const d = X.decks[X.cur]; if (d && d.track) fadeOut(d, 9); X.last = X.playing; X.playing = null; X.restUntil = t + 9 + rand(gp[2], gp[3]); }
}
export const resting = () => X.restUntil > 0;
export const _trackX = X; // 測試用
// 自動播放被擋住後,下一次使用者互動時重試
export function resumeTracks() { if (X.blocked && X.mood) { const m = X.mood; X.mood = null; setTrackMood(m); } }

// 整體音量(配樂狀態內的強弱,例如探索時壓低);sec 淡化秒數
export function trackGain(v, sec = 2) {
  X.level = clamp(v, 0, 1.5);
  const d = X.decks[X.cur];
  if (!d || !d.track || !A.ctx || d.ending) return;
  const n = A.ctx.currentTime;
  d.g.gain.cancelScheduledValues(n);
  d.g.gain.setValueAtTime(d.g.gain.value, n);
  d.g.gain.linearRampToValueAtTime((d.track.g ?? 0.6) * X.level, n + sec);
}

// 目前錄音配樂的存在感(0..1),程式配樂據此退到背景
export function trackLevel() {
  const d = X.decks[X.cur];
  return d && d.track && !d.el.paused && d.el.readyState >= 2 ? 1 : 0;
}

export const trackState = () => ({ mood: X.mood, playing: X.playing ? X.playing.f : null, restIn: X.restUntil ? +(X.restUntil - (A.ctx ? A.ctx.currentTime : 0)).toFixed(1) : 0, gapIn: X.gapAt ? +(X.gapAt - (A.ctx ? A.ctx.currentTime : 0)).toFixed(1) : 0, failed: [...X.failed], blocked: X.blocked, decks: X.decks.map((d) => (d.track ? `${d.track.f}@${d.el.currentTime.toFixed(1)}${d.el.paused ? '(p)' : ''} g=${d.g.gain.value.toFixed(2)}` : '-')) });

// ---------- 一次性配樂刺擊(串流)----------
// 每個刺擊一個預先載好的 <audio>(只存壓縮資料),播放時接到配樂匯流排;g 額外增益、fo 幾秒後淡出(可截短長的刺擊)
const ST = new Map();
function stingEl(key) {
  const S = STINGS[key];
  if (!S || !A.ctx || typeof Audio === 'undefined' || typeof A.ctx.createMediaElementSource !== 'function') return null;
  let e = ST.get(key);
  if (!e || e.ctx !== A.ctx) {
    const el = new Audio();
    el.preload = 'auto';
    el.src = BASE + S.f;
    const g = gain(0, A.bus.music);
    const src = A.ctx.createMediaElementSource(el);
    e = { el, g, src, on: false, ctx: A.ctx, ok: true, tok: 0 };
    el.addEventListener('error', () => { e.ok = false; });
    el.addEventListener('ended', () => { if (e.on) { e.on = false; try { src.disconnect(); } catch { /* 已斷 */ } } });
    ST.set(key, e);
  }
  return e.ok ? e : null;
}
export function preloadStings() { for (const k in STINGS) stingEl(k); }
export function sting(key, g = 1, fo = 0) {
  const e = stingEl(key);
  if (!e) return false;
  const S = STINGS[key], n = A.ctx.currentTime, el = e.el;
  if (!e.on) { e.on = true; e.src.connect(e.g); }
  const tok = ++e.tok;
  if (fo > 0) setTimeout(() => { if (e.tok === tok && e.on) { el.pause(); e.on = false; try { e.src.disconnect(); } catch { /* 已斷 */ } } }, (fo + 1.7) * 1000);
  try { el.currentTime = 0; } catch { /* 尚未可跳 */ }
  e.g.gain.cancelScheduledValues(n);
  e.g.gain.setValueAtTime((S.g ?? 1) * g, n);
  if (fo > 0) { e.g.gain.setValueAtTime((S.g ?? 1) * g, n + fo); e.g.gain.linearRampToValueAtTime(0, n + fo + 1.5); }
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
  return el.readyState >= 2;
}
