// 玩家身體的聲音:蹲下/站起(衣物 + 裝備)、手電筒開關、體力見底時的喘息(衝刺中體力低 → 換氣變重;力竭 → 大口喘氣,
// 恢復時慢慢平緩)、低血量時顫抖的呼吸。蹲下與喘息由 50ms 排程讀 attachGame 的玩家狀態(player.crouching/stamina/exhausted/sprinting)。
import { A, onTick, emit, burst, tone, metal, rand, pick, playBuf, baked, prebake, clamp } from './core.js';
import { cloth, click } from './foley.js';
import { vocal } from './voices.js';
import * as S from './samples.js';

// 一口氣(合成):吸氣 = 粉紅噪音帶通上滑;吐氣 = 下滑 + 少量聲帶震動
function inhale(d, t, k) {
  burst(d, t, { buf: 'pink', type: 'bandpass', f: 1000 * k, f1: 1800 * k, q: 1.3, dur: 0.32, a: 0.22, g: 0.16 });
  burst(d, t + 0.05, { buf: 'pink', type: 'highpass', f: 3500, dur: 0.25, a: 0.15, g: 0.03 });
}
function exhale(d, t, k, voiced) {
  burst(d, t, { buf: 'pink', type: 'bandpass', f: 950 * k, f1: 520 * k, q: 1.1, dur: 0.42, a: 0.06, g: 0.2 });
  if (voiced) vocal(d, t + 0.01, { mode: 'groan', contour: 'pain', f0: rand(100, 125), dur: 0.32, fs: 1, q: 5, vows: ['uh', 'uh', 'u'], breath: 1.4, fryRate: 40, fryD: 0.4, sub: 0, drive: 1.4, lp: 2200, gurgle: 0, gain: 0.05, jit: 0.04, wob: 0.03, att: 0.04, rel: 0.2, k: 1 });
}
const breathSet = (kind) => baked(`breath|${kind}`, 4, 0.75, (dst, t0) => { const k = rand(0.9, 1.12); if (kind === 'in') inhale(dst, t0, k); else exhale(dst, t0, k, kind === 'outv'); }, 1, 24000);
export function prebakeBody() { for (const k of ['in', 'out', 'outv']) prebake(`breath|${k}`, 4, 0.75, (dst, t0) => { const kk = rand(0.9, 1.12); if (k === 'in') inhale(dst, t0, kk); else exhale(dst, t0, kk, k === 'outv'); }, 1, 24000); }

function breath(i) {
  const h = emit({ bus: 'sfx', prio: 3, room: 0.05, dur: 1.4, gain: 0.35 + i * 0.75 });
  if (!h) return;
  const fast = 0.36 + (1 - i) * 0.3;
  const a = breathSet('in'), b = breathSet(i > 0.55 ? 'outv' : 'out');
  if (a && b) { playBuf(h.in, h.t, pick(a), { rate: rand(0.95, 1.08) }); playBuf(h.in, h.t + fast, pick(b), { rate: rand(0.95, 1.08) }); return; }
  inhale(h.in, h.t, rand(0.9, 1.12));
  exhale(h.in, h.t + fast, rand(0.9, 1.12), i > 0.55);
}

export const body = {
  // 蹲下(down)/站起:衣褲摩擦 + 裝備晃動 + 膝蓋碰地(硬地面)
  crouch(down = true) {
    const h = emit({ bus: 'sfx', prio: 3, room: 0.06, dur: 0.6, gain: 0.9 });
    if (!h) return;
    const t = h.t;
    cloth(h.in, t, down ? 0.26 : 0.22, 0.09);
    burst(h.in, t + 0.04, { buf: 'pink', type: 'bandpass', f: down ? rand(900, 1300) : rand(1400, 1900), f1: down ? 700 : 2100, q: 0.9, dur: 0.16, a: 0.06, g: 0.05 });
    if (Math.random() < 0.6) metal(h.in, t + rand(0.06, 0.14), rand(2600, 3800), 0.012, 0.06, [1, 2.4]); // 彈匣/扣具
    if (down && (A.surface === 'tile' || A.surface === 'concrete' || A.surface === 'metal' || A.surface === 'wood')) burst(h.in, t + 0.18, { type: 'lowpass', f: 420, f1: 150, dur: 0.05, g: 0.08 }); // 膝蓋碰地
  },
  flashlight(on = true) {
    const h = emit({ bus: 'sfx', prio: 3, room: 0.04, dur: 0.3, gain: 1.2 });
    if (!h) return;
    click(h.in, h.t, on ? 3400 : 2900, 0.14);
    click(h.in, h.t + 0.012, on ? 2100 : 1800, 0.06);
    metal(h.in, h.t + 0.004, on ? 5200 : 4600, 0.008, 0.03, [1, 2.2]); // 彈簧
  },
  // 外部也可直接設定(否則由排程讀玩家狀態):r 體力 0..1、ex 是否力竭
  setStamina(r, ex) { B.ext = A.ctx ? A.ctx.currentTime : 0; B.st = clamp(+r || 0, 0, 1); B.ex = !!ex; },
};

// ---------- 排程:蹲下、喘息 ----------
const B = { i: 0, next: 0, ex: false, exWas: false, st: 1, ext: -99, crouch: null, panT: -99, hp: 1 };
export const setBodyHealth = (r) => { B.hp = clamp(+r || 0, 0, 1); };
onTick((now) => {
  const g = A.game, P = g && g.player;
  if (!P || !A.ctx || g.state !== 'playing') { B.i = 0; B.crouch = null; return; }
  if (B.crouch === null) B.crouch = !!P.crouching;
  else if (!!P.crouching !== B.crouch) { B.crouch = !!P.crouching; body.crouch(B.crouch); }
  const own = now - B.ext > 1; // 沒有外部 setStamina 時讀玩家物件
  const st = own ? (Number.isFinite(P.stamina) ? P.stamina : 1) : B.st;
  const ex = own ? !!P.exhausted : B.ex;
  let need = ex ? 1 : P.sprinting && st < 0.4 ? ((0.4 - st) / 0.4) * 0.75 : 0;
  if (B.hp < 0.2 && P.hp > 0) need = Math.max(need, 0.35 + (0.2 - B.hp) * 1.5); // 瀕死:顫抖的呼吸
  B.i += (need - B.i) * (need > B.i ? 0.25 : 0.03); // 喘起來很快,平復很慢
  if (ex && !B.exWas && now - B.panT > 6) { // 力竭:大口喘氣的錄音
    B.panT = now;
    const h = emit({ bus: 'sfx', prio: 4, room: 0.05, dur: 4.6, gain: 0.9 });
    if (h && S.play('player.breath', { h, g: 0.4 })) B.next = now + 4.3;
  }
  B.exWas = ex;
  if (B.i > 0.08 && now >= B.next) {
    breath(B.i);
    B.next = now + (2.4 - B.i * 1.5) * rand(0.9, 1.1);
  }
});
