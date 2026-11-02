// 回合收尾控制(房主/單人;flow.updateRound 每幀呼叫):回合最後幾隻殭屍不會拖好幾分鐘才出現。
//  1. 進度追蹤:每秒記每隻殭屍沿導航路徑到玩家的距離;一段時間沒有變近(卡在門口、導航孤島、被上鎖的門擋住、走不到)
//     而且沒有任何玩家看得到牠 → 移到玩家附近(路徑 12~24m)一個也沒人看得到的點。絕不在玩家眼前瞬移。
//     [w6] 嚴格的點找不到(玩家在長走廊、停車場、房間角落,周圍 12~24m 不是看得到就是牆後)→ 放寬(8~34m、相鄰樓層、
//     可以在側前方,但一樣看不到)→ 再不行就挑一個比牠現在更近、沒人看得到的出生點。以前三種都只試嚴格的那一種,
//     找不到就永遠不搬(第 4 波「一直沒有殭屍」的原因之一)。
//  2. 收尾(剩 ≤ 2 隻):剩下的進入「獵殺」:加速、已發現玩家;離得遠又沒人看到的提早搬近;
//     伏擊預留的(還在 toSpawn 裡)與裝死的在 5 秒後由 ambush.hunt() 放回佇列/起身走向玩家。
//  3. 追逐戰的追獵者不算(由 chase.js 管)。
// game.roundTail = { stats } 給測試用:搬了幾隻、為什麼
// seenByAny / nearSpot / hiddenSpot / moveZombie 也給 watchdog.js(一波絕對不會卡住的保險)用
const STUCK_T = 15, TAIL_STUCK_T = 6, TAIL_FAR_T = 8, TAIL_N = 2;
const _snap = { x: 0, y: 0, z: 0 };
const STRICT = { lo: 12, hi: 24, fdLo: 10, fdHi: 26, front: 0.5, n: 24, levels: false };
const LOOSE = { lo: 8, hi: 34, fdLo: 8, fdHi: 40, front: 0.85, n: 36, levels: true };

export function roundTail(g, dt, alive, lurk, held) {
  const T = g.roundTail || (g.roundTail = { acc: 0, tailT: 0, stats: { moved: 0, stuck: 0, unreach: 0, far: 0, hunts: 0, loose: 0, spawn: 0, miss: 0, at: [] } });
  if (g.net && !g.net.isHost) return;
  const rest = alive + Math.max(0, g.toSpawn - held); // 不算伏擊預留/裝死的
  const tail = rest <= TAIL_N;
  T.tailT = tail ? T.tailT + dt : 0;
  // 伏擊預留 / 裝死的:收尾 5 秒後放回佇列、起身(ambush.hunt 要每幀呼叫,0.4 秒內沒再叫會取消)
  if (tail && (held || lurk) && T.tailT > 5 && g.ambush) { if (!T.hunting) T.stats.hunts++; T.hunting = true; g.ambush.hunt(); } else T.hunting = false;
  if ((T.acc += dt) < 1) return;
  T.acc -= 1;
  const W = g.world;
  for (const z of g.zombies) {
    if (!z.alive || z._proxy || z.amb || z._chase) continue;
    if (tail && !z._huntOn) { z._huntOn = true; z.alerted = true; if (z.type !== 'brute') z.speed *= 1.3; if (z.state === 'idle') z.go('chase'); } // 獵殺
    const fd = W.flowDistance ? W.flowDistance(z.pos.x, z.pos.y, z.pos.z) : z.dist;
    const reach = Number.isFinite(fd);
    if (z._tbest === undefined || (reach && fd < z._tbest - 1.5)) { z._tbest = reach ? fd : Infinity; z._tstill = 0; } else z._tstill += reach ? 1 : 2;
    z._tfar = tail && reach && fd > 30 ? (z._tfar || 0) + 1 : 0;
    if (g.time - (z._born ?? 0) < 6 || (reach && fd < 14)) continue;
    const why = z._tstill >= (tail ? TAIL_STUCK_T : STUCK_T) ? (reach ? 'stuck' : 'unreach') : z._tfar >= TAIL_FAR_T ? 'far' : null;
    if (!why || seenByAny(g, z.pos.x, z.pos.y, z.pos.z)) continue;
    const pt = hiddenSpot(g, z, z._tstill >= (tail ? TAIL_STUCK_T : STUCK_T) + 4 ? 2 : 1, T.stats);
    if (!pt) { T.stats.miss++; continue; }
    T.stats.at.length < 12 && T.stats.at.push(`${why}@${z.pos.x.toFixed(0)},${z.pos.y.toFixed(0)},${z.pos.z.toFixed(0)}`);
    moveZombie(g, z, pt);
    T.stats.moved++; T.stats[why]++;
  }
}

export function seenByAny(g, x, y, z) {
  const W = g.world;
  for (const p of g.players || [g.player]) {
    if (!p || p.alive === false) continue;
    const ey = p.pos.y + (p.eyeH || 1.6), d = Math.hypot(p.pos.x - x, p.pos.z - z) + Math.abs(p.pos.y - y);
    if (d > 45) continue;
    if (W.hasLineOfSight(p.pos.x, ey, p.pos.z, x, y + 1.5, z) || W.hasLineOfSight(p.pos.x, ey, p.pos.z, x, y + 0.4, z)) return true;
  }
  return false;
}
// 殭屍要追的那位玩家(活著、沒倒地);沒有就第一位
function targetOf(g, z) {
  const list = (g.players || [g.player]).filter((p) => p && p.alive !== false && !p.downed);
  return z?.target && list.includes(z.target) ? z.target : list[0] || null;
}
// 玩家附近、沿路徑 fdLo~fdHi、同一層優先、沒人看得到、不在本機玩家正前方的導航點
// o = STRICT(預設:路徑 10~26m、直線 12~24m)| LOOSE(放寬:8~40m、可以在側前方、也試上下一層)
export function nearSpot(g, z, o = STRICT) {
  const W = g.world, tgt = targetOf(g, z);
  if (!tgt || !W.navSnap) return null;
  const p = tgt.pos, fx = -Math.sin(tgt.yaw || 0), fz = -Math.cos(tgt.yaw || 0);
  const H = W.layout?.LEVEL_H || 4.2;
  let best = null, bs = -Infinity;
  for (let i = 0; i < o.n; i++) {
    const a = Math.random() * Math.PI * 2, r = o.lo + Math.random() * (o.hi - o.lo);
    const ly = o.levels && i % 3 ? p.y + (i % 3 === 1 ? H : -H) : p.y; // 放寬時三分之二的點試上下一層(走樓梯過來)
    if (!W.navSnap(p.x + Math.sin(a) * r, ly, p.z + Math.cos(a) * r, _snap)) continue;
    const x = _snap.x, y = _snap.y, zz = _snap.z;
    const fd = W.flowDistance ? W.flowDistance(x, y, zz) : r;
    if (!(fd >= o.fdLo && fd <= o.fdHi)) continue;
    const dx = x - p.x, dz = zz - p.z, d = Math.hypot(dx, dz) || 1, front = (dx * fx + dz * fz) / d;
    if ((Math.abs(y - p.y) < 1.5 && front > o.front) || seenByAny(g, x, y, zz)) continue;
    const sc = (Math.abs(y - p.y) < 1.5 ? 2 : 0) - front - Math.abs(fd - 17) / 10 + Math.random() * 0.3;
    if (sc > bs) { bs = sc; best = { x, y, z: zz }; }
  }
  return best;
}
// 依序:嚴格 → 放寬(level ≥ 1)→ 比牠現在更近、沒人看得到的出生點(level ≥ 2;走不到的殭屍:任何走得到的出生點)
export function hiddenSpot(g, z, level = 1, stats = null) {
  let pt = nearSpot(g, z, STRICT);
  if (pt || level < 1) return pt;
  pt = nearSpot(g, z, LOOSE);
  if (pt) { if (stats) stats.loose = (stats.loose || 0) + 1; return pt; }
  if (level < 2 || !g.pickSpawn) return null;
  const W = g.world, fd = W.flowDistance ? W.flowDistance(z.pos.x, z.pos.y, z.pos.z) : Infinity;
  const s = g.pickSpawn(z.type, Number.isFinite(fd) ? Math.max(14, fd - 4) : 80);
  if (!s) return null;
  const sy = s.y || 0;
  if (seenByAny(g, s.x, sy, s.z) || !Number.isFinite(W.flowDistance ? W.flowDistance(s.x, sy, s.z) : 0)) return null;
  if (stats) stats.spawn = (stats.spawn || 0) + 1;
  return { x: s.x, y: sy, z: s.z };
}
export function moveZombie(g, z, pt) {
  z.pos.set(pt.x, pt.y, pt.z);
  g.world.resolve(z.pos, Math.min(z.T.radius, 0.4));
  z.vel.set(0, 0, 0);
  z._noProg = 0; z._lv = 0; z._nudgeT = 0; z._repathT = 0; z._farT = 0;
  z._sx = z.pos.x; z._sy = z.pos.y; z._sz = z.pos.z;
  z._tbest = undefined; z._tstill = 0; z._tfar = 0;
  z.warps = (z.warps || 0) + 1;
  z._born = g.time; // 剛搬過:6 秒內不再搬(_relocateStragglers / roundTail 都看 _born)
  if (z.state !== 'chase') z.go('chase');
  z.root.position.copy(z.pos);
}
