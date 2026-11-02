// [w6] 一波絕對不會卡住(房主/單人;flow.updateRound 每幀在 roundTail 之後呼叫)。
// 使用者回報「第四波一直沒有喪屍生成」:剩下的幾隻卡在走不到/原地打轉的地方、roundTail 找不到可以搬的點,
// 同時出怪佇列只剩伏擊預留的(toSpawn ≤ held → 一般出怪停住,預留要 90~140 秒才逾時)→ 一波停在那裡好幾分鐘。
// 這裡不管原因,只看「有沒有進度」:
//   進度 = 有殭屍死掉/消失、有殭屍沿導航路徑 4 秒內更接近玩家 1.2m 以上、或有殭屍貼著玩家在打(路徑 3.5m 內)。
//   (出生不算:出在走不到的地方的殭屍不會讓這一波往前走)
//   山谷(_pace.relax)、預熱(spawnHeld)、追逐戰進行中不計時(各有上限);劇情的看守(z._guard,劉家豪)不算、不碰。
// 沒有進度累計(秒)→ 依序加碼(都只動沒人看得到的;HUD 的數字 = 實際還要打的):
//   10s 出怪不再被擋:伏擊預留全部放回佇列、出怪計時器歸零、同場上限 +2(卡住的那幾隻不再佔名額)
//   14s 裝死的全部(安靜地)起身
//   18s 每秒搬一隻沒有進度、沒人看得到的殭屍到玩家附近看不到的地方(嚴格 → 放寬 → 比牠近的出生點)
//   40s 搬不到:任何沒人看得到、走得到的出生點
//   60s 沒人看得到的剩下那幾隻悄悄退回黑暗(移除、不給錢);還沒出生的直接作廢 → 這一波照常結束
//   90s 連看得到的也一樣(燈閃一下就不見了)
// game.waveGuard = { idle, stage, stats } 給測試用
import { seenByAny, hiddenSpot, moveZombie } from './roundtail.js';

const T1 = 10, T2 = 14, T3 = 18, T4 = 40, T5 = 60, T6 = 90;
const WIN = 4, GAIN = 1.2, ENGAGE = 3.5, CAP = 2;

const candidate = (z) => z.alive && !z._proxy && !z._chase && !z._guard && !(z.amb && !z.amb.dormant); // 衝出/掉落中的(幾秒就結束)不動

export function waveGuard(g, dt, alive, lurk, held, relax) {
  const G = g.waveGuard || (g.waveGuard = { idle: 0, stage: 0, acc: 0, left: -1, round: -1, maxIdle: 0, stats: { release: 0, wake: 0, cap: 0, moved: 0, removed: 0, voided: 0, stalls: 0, at: [] } });
  if (g.net && !g.net.isHost) return;
  if (G.round !== g.round) { G.round = g.round; G.idle = 0; G.stage = 0; G.left = -1; }
  const S = G.stats;
  // ---- 進度 ----
  let left = g.toSpawn;
  for (const z of g.zombies) if (z.alive && !z._chase) left++;
  let prog = left < G.left; // 有東西死了(出生不會讓 left 變少)
  G.left = left;
  if ((G.acc += dt) >= 1) { // 每秒:每隻殭屍的路徑距離
    G.acc = 0;
    const W = g.world, now = g.time;
    for (const z of g.zombies) {
      if (!candidate(z) || z.amb) continue;
      const fd = W.flowDistance ? W.flowDistance(z.pos.x, z.pos.y, z.pos.z) : z.dist;
      if (z._wgFd === undefined) { z._wgFd = fd; z._wgT = z._wgT ?? -99; } // 第一次量:只是起點(剛出生不算進度)
      else if (fd < z._wgFd - GAIN) { z._wgFd = fd; z._wgT = now; } // 更接近了
      else if (Number.isFinite(fd) && fd > z._wgFd + 6) z._wgFd = fd; // 玩家跑遠了:重新起算(不算進度)
      if (fd < ENGAGE || z.state === 'attack') z._wgT = now; // 正在打
    }
    G.near = false;
    for (const z of g.zombies) if (candidate(z) && !z.amb && now - (z._wgT ?? -99) < WIN) { G.near = true; break; }
  }
  if (G.near) prog = true;
  const paused = relax || g.spawnHeld || g.chase?.active || g.story?.ending?.active;
  if (prog || left === 0) { if (G.stage >= 3) S.stalls++; G.idle = 0; G.stage = 0; g._wgCap = 0; return; }
  if (paused) return;
  G.idle += dt;
  G.maxIdle = Math.max(G.maxIdle, G.idle);
  const t = G.idle;
  // ---- 加碼 ----
  if (G.stage < 1 && t >= T1) {
    G.stage = 1;
    if (g.toSpawn > 0 && g.toSpawn <= held && g.ambush?.releaseAll) { g.ambush.releaseAll(); S.release++; log(G, 'release'); }
    if (g._pace) g._pace.relax = 0;
    if (g.toSpawn > 0) g.spawnTimer = Math.min(g.spawnTimer, 0.3);
    if (g.toSpawn > 0 && alive >= g.maxAlive) { g._wgCap = CAP; S.cap++; log(G, 'cap'); }
  }
  if (G.stage < 2 && t >= T2) {
    G.stage = 2;
    if (lurk && g.ambush?.wakeAll) { g.ambush.wakeAll(true); S.wake++; log(G, 'wake'); }
  }
  if (t >= T3 && (G.stepT = (G.stepT || 0) - dt) <= 0) {
    G.stepT = 1;
    G.stage = Math.max(G.stage, 3);
    if (t >= T6) { finish(g, G, true); return; }
    if (t >= T5) { finish(g, G, false); return; }
    relocate(g, G, t >= T4 ? 3 : 2);
  }
}

// 沒有進度、沒人看得到的殭屍裡挑最需要搬的一隻(走不到 > 最遠)搬到玩家附近看不到的地方
function relocate(g, G, level) {
  const W = g.world, now = g.time;
  let pick = null, score = -Infinity;
  for (const z of g.zombies) {
    if (!candidate(z) || z.amb || now - (z._born ?? 0) < 6 || now - (z._wgT ?? -99) < WIN) continue;
    const fd = W.flowDistance ? W.flowDistance(z.pos.x, z.pos.y, z.pos.z) : z.dist;
    const sc = Number.isFinite(fd) ? fd : 999;
    if (sc > score && !seenByAny(g, z.pos.x, z.pos.y, z.pos.z)) { score = sc; pick = z; }
  }
  if (!pick) return;
  let pt = hiddenSpot(g, pick, 2);
  if (!pt && level >= 3 && g.pickSpawn) { // 任何沒人看得到、走得到的出生點
    const s = g.pickSpawn(pick.type, Infinity), sy = s ? s.y || 0 : 0;
    if (s && !seenByAny(g, s.x, sy, s.z) && Number.isFinite(W.flowDistance ? W.flowDistance(s.x, sy, s.z) : 0)) pt = { x: s.x, y: sy, z: s.z };
  }
  if (!pt) return;
  log(G, `move ${pick.type}@${pick.pos.x.toFixed(0)},${pick.pos.y.toFixed(0)},${pick.pos.z.toFixed(0)}`);
  moveZombie(g, pick, pt);
  pick._wgFd = undefined; pick._wgT = -99; pick.alerted = true; // 搬過去之後真的走近了才算進度(不然一直搬、一直重新計時,永遠到不了最後一步)
  G.stats.moved++;
}

// 最後手段:剩下的退回黑暗(seen = 連看得到的也算;燈閃一下蓋過去)。還沒出生的作廢,這一波照常結束
function finish(g, G, seen) {
  let n = 0;
  for (const z of g.zombies) {
    if (!candidate(z)) continue;
    const vis = seenByAny(g, z.pos.x, z.pos.y, z.pos.z);
    if (vis && !seen) continue;
    if (vis) g.horror?.flicker?.(z.pos, 0.5);
    if (z.amb) z._ambEnd?.(false);
    z._dsent = true; z.alive = false; z.corpse = 0.01; z.root.visible = false; // 不送死亡、不留屍體、不給錢(代理端停止收到快照後自己移除)
    n++;
  }
  if (n) { G.stats.removed += n; log(G, `remove ${n}${seen ? ' (seen)' : ''}`); }
  if (g.toSpawn > 0) { // 這麼久都沒有進度:還沒出生的作廢
    G.stats.voided += g.toSpawn;
    log(G, `void ${g.toSpawn}`);
    for (const s of g.ambush?.slots || []) if (s.spot?.busy === s) s.spot.busy = null;
    if (g.ambush?.slots) g.ambush.slots.length = 0;
    g.queue.length = 0;
    g.toSpawn = 0;
  }
}

function log(G, s) { if (G.stats.at.length < 24) G.stats.at.push(`r${G.round} ${G.idle.toFixed(0)}s ${s}`); }
