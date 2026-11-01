// 尖叫者的尖叫:本機玩家暈眩——畫面模糊、褪色、視角不由自主地飄、耳鳴悶音。
// 自己用 requestAnimationFrame 跑(不依賴有沒有殭屍活著;暫停或死亡時也會正常結束)。
import { sfx } from '../../audio.js';

let D = null;
export function daze(game, k) {
  if (!game || !game.player || !(k > 0.05)) return;
  k = Math.min(1, k);
  const c = game.renderer && game.renderer.domElement;
  if (D) { D.k = Math.max(D.k * (1 - D.t / D.dur), k); D.t = 0; D.dur = 1.4 + 1.6 * D.k; return; }
  D = { game, c, k, t: 0, dur: 1.4 + 1.6 * k, last: performance.now(), ph: Math.random() * 6 };
  sfx.zDaze?.(k);
  requestAnimationFrame(step);
}
export const dazed = () => (D ? 1 - D.t / D.dur : 0);

function step(now) {
  const d = D;
  if (!d) return;
  const dt = Math.min(0.05, (now - d.last) / 1000);
  d.last = now;
  d.t += dt;
  const u = d.t / d.dur;
  if (u >= 1 || d.game.state !== 'playing') { if (d.c) d.c.style.filter = ''; D = null; return; }
  const e = (u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92) * d.k; // 一下子衝上來再慢慢退
  if (d.c) d.c.style.filter = `blur(${(e * 3.2).toFixed(2)}px) saturate(${(1 - 0.55 * e).toFixed(2)}) contrast(${(1 + 0.25 * e).toFixed(2)})`;
  const p = d.game.player;
  if (!d.game.paused) {
    // 視角漂移(瞄準被干擾):低頻、兩個不同週期疊加
    p.yaw += (Math.sin(d.t * 2.1 + d.ph) * 0.55 + Math.sin(d.t * 5.3) * 0.25) * e * dt * 0.9;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + Math.sin(d.t * 1.7 + d.ph * 2) * e * dt * 0.45));
    p.addShake?.(0.12 * e);
  }
  requestAnimationFrame(step);
}
