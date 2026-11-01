// 新類型行為 + 所有類型共用的動畫層:zombie.js 只在標記 [zombies-w3] 的幾行呼叫這裡。
//
// 每個類型模組(screamer.js、stalker.js…)匯出:
//   think(dt, ctx, dist, toX, toZ, w)  AI(this = Zombie;房主才跑)→ 回傳本幀對目標的近戰傷害
//   pose(dt, ctx, dist, toX, toZ)      姿勢動畫(房主與連線代理都跑;只能依 state / st / speedNow / 位置推導)
//   init(z)                            出生時(可選)
//   dmgMul(z, m, part, hit) → m        傷害倍率(可選:護甲、弱點、爆炸加成)
//   hurt(z, dmg, part, hit)            受傷沒死時(可選:打斷動作)
//   death(z, part, hit)                死亡時(可選:死法、遺留物)
// 狀態名稱沿用 net/protocol.js 的 ZSTATES(不新增編碼,連線代理照樣播放)。
import { TYPES } from '../types.js';
import * as screamer from './screamer.js';
import * as stalker from './stalker.js';
import * as surgeon from './surgeon.js';
import * as burned from './burned.js';
import * as hazmat from './hazmat.js';
import * as straitjacket from './straitjacket.js';
import * as pursuer from './pursuer.js';
import { animInit, animHit, animLayer, idleThink } from './anim.js';
import { K } from './kit.js';
import { frenzyTick } from './screamer.js';

export const BEH = { screamer, stalker, surgeon, burned, hazmat, straitjacket, pursuer };

// zombie.js 載入時呼叫一次:把新類型的 think/pose 掛到 Zombie 原型上(沿用原本 '_think_' + type 的分派),並取得共用工具
export function installBehaviors(Zombie, kit) {
  Object.assign(K, kit);
  for (const t in BEH) {
    Zombie.prototype['_think_' + t] = BEH[t].think;
    Zombie.prototype['_pose_' + t] = BEH[t].pose;
  }
}

const seen = new WeakMap(); // stats 物件 → 已介紹過的類型(每一局重新介紹)

export const Z3 = {
  init(z) {
    animInit(z);
    const amp = z.V.P.amp, ab = amp && z.b[amp];
    if (ab && ab.parent && ab.scale.x !== 0) { ab.scale.setScalar(0); z._stump(ab.parent.name, amp, amp.startsWith('hand') ? 0.032 : 0.042); } // 斷肢個體
    BEH[z.type]?.init?.(z);
  },
  dmgMul(z, m, part, hit) {
    const b = BEH[z.type];
    return b && b.dmgMul ? b.dmgMul(z, m, part, hit) : m;
  },
  hurt(z, dmg, part, hit) {
    animHit(z, dmg, part, hit);
    BEH[z.type]?.hurt?.(z, dmg, part, hit);
  },
  death(z, part, hit) { BEH[z.type]?.death?.(z, part, hit); },
  // AI 之前(房主):尖叫者召來的狂暴計時、閒置怪癖(面壁站著)。回傳 true = 本幀不跑 AI
  pre(z, dt, ctx, dist, w) { frenzyTick(z, dt); return idleThink(z, dt, ctx, dist, w); },
  // 姿勢之後(房主與代理):抽搐、歪頭、定格、受擊部位反應、倒退走、閒置搖晃;另外處理首次遭遇的提示
  layer(z, dt, ctx) {
    animLayer(z, dt, ctx);
    if (ctx && BEH[z.type] && z.alive) intro(z, ctx);
  },
};

// 第一次在近處遇到某種新殭屍:橫幅說明對策
function intro(z, ctx) {
  const g = ctx.game, p = ctx.player;
  if (!g || !g.ui || !g.stats || !p) return;
  let s = seen.get(g.stats);
  if (!s) seen.set(g.stats, (s = {}));
  if (s[z.type]) return;
  const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z, dy = p.pos.y - z.pos.y;
  if (dx * dx + dz * dz > 15 * 15 || dy > 2.5 || dy < -2.5) return;
  s[z.type] = 1;
  const T = TYPES[z.type];
  if (T.chaseOnly) return; // 追獵者的提示由 chase.js 自己做
  g.ui.banner?.(T.name, T.counter || '', 3800, 'red');
}
