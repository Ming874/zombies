// [w4] 噪音的最小模型:game.noise = { emit(pos, radius, kind), hot(maxAge = 10), near(pos, r, maxAge = 10), list(), reset() }
// 世界規則「他們聽得到」落到出怪上,但不改屍潮的追擊(殭屍照舊沿著全隊的導航場走,全知):
//  - 噪音源:開槍(依武器音量)、重落地、甩門/撞門、爆炸(手榴彈、膿腫者);特殊波的廣播喇叭與警鈴(flow.js _fxTick)
//  - 用途:flow.pickSpawn 的權重偏向最近 10 秒內最大的噪音(spawnWeight);別的模組可以用 near() 問「這裡附近剛剛吵不吵」
//    (例如伏擊/裝死屍體的喚醒半徑,src/zombies/ambush.js 歸 fear,還沒接)
// 固定 32 格的環形緩衝(不配置物件;同一種聲音 0.4 秒內在 2m 內重複就合併)。
// 多人:出怪只在房主本機算,所以噪音也只在房主本機有意義。房主聽得到的隊友槍聲(sfx.remoteShot,連線層播放)也算進來;
//       隊友的落地、近戰等小聲音不同步(可以接受:只影響出生點的權重)。客戶端也會記錄,但沒有人讀。
import { sfx } from '../audio.js';

const N = 32;
// 每種武器開槍的噪音半徑(m);滅音器沒有,所以手槍最小、巴雷特最大
export const GUN_R = { pistol: 26, revolver: 38, shotgun: 44, ak47: 46, m4a1: 40, barrett: 70 };

export function createNoise(game) {
  const buf = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, r: 0, t: -1e9, kind: '' }));
  let head = 0;
  const now = () => game.time || 0;
  const api = {
    emit(pos, radius = 20, kind = '') {
      if (!pos || !(radius > 0)) return;
      const t = now(), last = buf[(head + N - 1) % N];
      if (last.kind === kind && t - last.t < 0.4 && Math.abs(last.x - pos.x) + Math.abs(last.z - pos.z) < 2 && Math.abs(last.y - pos.y) < 1.5) {
        last.t = t; if (radius > last.r) last.r = radius; return;
      }
      const e = buf[head];
      e.x = pos.x; e.y = pos.y; e.z = pos.z; e.r = radius; e.t = t; e.kind = kind;
      head = (head + 1) % N;
    },
    // 最近 maxAge 秒內「最響」的一個(半徑 × 剩下的新鮮度);沒有回傳 null
    hot(maxAge = 10) {
      const t = now();
      let best = null, bs = 0;
      for (const e of buf) {
        const age = t - e.t;
        if (age < 0 || age > maxAge) continue;
        const s = e.r * (1 - age / maxAge);
        if (s > bs) { bs = s; best = e; }
      }
      return best;
    },
    // pos 附近 r 公尺內聽得到(距離 ≤ r + 噪音半徑)的噪音裡最響的一個;沒有回傳 null
    near(pos, r = 0, maxAge = 10) {
      const t = now();
      let best = null, bs = 0;
      for (const e of buf) {
        const age = t - e.t;
        if (age < 0 || age > maxAge || Math.abs(e.y - pos.y) > 6) continue;
        const d = Math.hypot(e.x - pos.x, e.z - pos.z);
        if (d > r + e.r) continue;
        const s = (1 - d / (r + e.r)) * (1 - age / maxAge);
        if (s > bs) { bs = s; best = e; }
      }
      return best;
    },
    list(maxAge = 10) { const t = now(); return buf.filter((e) => t - e.t >= 0 && t - e.t <= maxAge).map((e) => ({ ...e, age: +(t - e.t).toFixed(2) })); },
    reset() { for (const e of buf) { e.t = -1e9; e.r = 0; e.kind = ''; } head = 0; bindDoors(); },
    // 出生點權重:最近 10 秒內最大的噪音(半徑 ≥ 25)附近的出生點 ×(1 + 2.5 × 靠近程度);不同樓層打折
    spawnWeight(s) {
      const h = api._hot;
      if (!h) return 1;
      const dy = Math.abs((s.y || 0) - h.y), d = Math.hypot(s.x - h.x, s.z - h.z) + dy * 3;
      const R = Math.max(14, h.r * 0.6);
      return 1 + 2.5 * h.k * Math.exp(-((d / R) ** 2));
    },
    // pickSpawn 開始時呼叫一次(一次挑點只找一次 hot)
    prime() {
      const h = api.hot(10);
      if (!h || h.r < 25) { api._hot = null; return; }
      const age = now() - h.t;
      api._hot = { x: h.x, y: h.y, z: h.z, r: h.r, k: Math.max(0, 1 - age / 10) };
    },
    _hot: null,
  };

  // ---- 噪音源(都是包裝,不改原本行為) ----
  const P = () => game.player?.pos;
  // 開槍:flow.initGameplay 包好的 onFire 之外再包一層
  const fire = game.weapons?.onFire;
  if (typeof fire === 'function') {
    game.weapons.onFire = (...a) => {
      const p = P();
      if (p && game.state === 'playing') api.emit({ x: p.x, y: p.y, z: p.z }, GUN_R[game.weapons.current] || 30, 'gun');
      return fire(...a);
    };
  }
  // 隊友的槍聲(連線層播放 sfx.remoteShot(id, pos)):房主也記下來
  if (sfx.remoteShot && !sfx._noiseWrapped) {
    sfx._noiseWrapped = true;
    const rs = sfx.remoteShot, land = sfx.land;
    sfx.remoteShot = (id, pos) => { if (pos && game.state === 'playing') game.noise?.emit({ x: pos.x, y: pos.y - 1.4, z: pos.z }, GUN_R[id] || 30, 'gun'); return rs(id, pos); };
    // 重落地(從高處跳下來;一般跳躍落地 3~4 m/s 不算)
    sfx.land = (speed = 3, surface) => { const p = P(); if (p && speed > 5.5 && game.state === 'playing') game.noise?.emit({ x: p.x, y: p.y, z: p.z }, Math.min(18, 6 + speed * 1.2), 'land'); return land(speed, surface); };
  }
  // 爆炸(手榴彈 explodeAt、膿腫者 explode)
  for (const k of ['explodeAt', 'explode']) {
    const f = game[k];
    if (typeof f !== 'function') continue;
    game[k] = function (a, ...rest) {
      const pos = k === 'explodeAt' ? a : a?.pos;
      if (pos) api.emit({ x: pos.x, y: pos.y, z: pos.z }, k === 'explodeAt' ? 55 : 35, 'boom');
      return f.call(this, a, ...rest);
    };
  }
  // 門:甩上 / 被殭屍撞開(doors.js 的 'door' 事件;開門很小聲,不算)
  const bindDoors = () => {
    const ix = game.interact;
    if (!ix?.on || ix._noiseDoor) return !!ix?._noiseDoor;
    ix._noiseDoor = true;
    ix.on('door', (w, st) => { if (st === 'closed' && w && game.state === 'playing') api.emit({ x: w.cx, y: w.y, z: w.cz }, 16, 'door'); });
    return true;
  };
  if (!bindDoors()) game.interact?.tick?.(() => !bindDoors());
  return api;
}
