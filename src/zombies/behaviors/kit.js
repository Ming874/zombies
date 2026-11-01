// 行為模組共用的小工具。K 由 zombie.js 在載入時填入(say:有每幀額度的發聲、budget)。
export const K = { say: () => {}, budget: null };
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const env = (t, a, b, c, d) => sstep(a, b, t) * (1 - sstep(c, d, t)); // 進場 a→b、退場 c→d 的包絡
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const rand = (a, b) => a + Math.random() * (b - a);

// 本機玩家相對這隻殭屍:水平距離、高度差(連線代理也能用;不依賴 AI 的 this.dist)
export function localRel(z, ctx, out) {
  const p = ctx.player.pos;
  out.dx = p.x - z.pos.x; out.dz = p.z - z.pos.z; out.dy = p.y - z.pos.y;
  out.d = Math.hypot(out.dx, out.dz);
  return out;
}
// 狀態切換偵測(姿勢函式用:房主與代理都會跑,適合放「進入某狀態」的音效/特效,避免兩端各播一次)
export function entered(z, state) {
  if (z._ps === z.state) return false;
  if (z.state !== state) return false;
  z._ps = z.state;
  return true;
}
export function trackState(z) { z._ps = z.state; }
// 手電筒是否照著這個位置(本機玩家:開燈、在光錐內、距離內、看得到)
export function litBy(player, world, x, y, z, cone, range) {
  if (!player) return false;
  const on = player.flashOn !== undefined ? player.flashOn : !!((player.flags || 0) & 32); // 遠端玩家:狀態旗標 F.LIGHT
  if (!on) return false;
  const p = player.pos, ey = p.y + (player.eyeH || 1.6);
  const dx = x - p.x, dy = y - ey, dz = z - p.z, d = Math.hypot(dx, dy, dz);
  if (d > range || d < 1e-3) return false;
  const cp = Math.cos(player.pitch || 0);
  const fx = -Math.sin(player.yaw) * cp, fy = Math.sin(player.pitch || 0), fz = -Math.cos(player.yaw) * cp;
  if ((dx * fx + dy * fy + dz * fz) / d < Math.cos(cone)) return false;
  return !world.hasLineOfSight || world.hasLineOfSight(p.x, ey, p.z, x, y, z);
}
// 靈異導演(src/horror/director.js)協調驚嚇節奏:kind 用導演在戰鬥中允許的 'ambush' / 'ceilingDrop'(與伏擊共用冷卻,不會疊在一起)。
// 被拒絕時延後重試;最多等 maxWait 秒就照樣進行(這兩種殭屍是戰鬥機制,不能被完全關掉)。沒有導演時直接允許
export function paced(z, ctx, kind, dt, maxWait = 6) {
  const d = ctx.game && ctx.game.horror && ctx.game.horror.director;
  if (!d || !d.request) return true;
  if ((z._dirQ = (z._dirQ || 0) - dt) > 0) return (z._dirWait || 0) > maxWait;
  z._dirQ = 0.5;
  if (d.request(kind, { weight: 0.5, pos: z.pos })) { z._dirWait = 0; return true; }
  z._dirWait = (z._dirWait || 0) + 0.5;
  return z._dirWait > maxWait;
}
export function pacedDone(z, ctx, kind) {
  z._dirWait = 0; z._dirQ = 0;
  const d = ctx.game && ctx.game.horror && ctx.game.horror.director;
  if (d && d.notify) d.notify(kind, { weight: 0.5, pos: z.pos });
}
// 對本機玩家套用持續傷害(流血、燒傷):交給 hazards(每 5 點結算一次,不會每幀觸發受傷音效)
export function dot(ctx, kind, dps, t) {
  const h = ctx.hazards;
  if (h && h.dot) h.dot(kind, dps, t);
}
