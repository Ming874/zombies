import { Interact } from './core.js';
import { createKit } from './kit.js';
import { setupDoors } from './doors.js';
import { upgradeWorldSurfaces, updateSurfaces } from '../mats/surface.js';

// 互動系統入口(取自 test 分支 src/interact/index.js;main 只有門,沒有電話/抽屜/紙條等互動物件與劇情包):
// game.js 建構世界時呼叫(在 world.buildNav 之前 → 門扇的碰撞盒會進導航)。
// 每幀 game.interact.update(dt);提示 game.interact.pick();按 E 時 game.interact.press()。
export function buildInteract(game) {
  const ix = new Interact(game, null);
  game.interact = ix;
  ix.on('reset', () => ix.doors?.reset());
  const H = game.hospital || {};
  const kit = createKit({ root: H.group || game.scene, levelGroups: H.propGroups || null });
  let doors = null;
  try { doors = setupDoors(game, ix, { leaves: H.doorLeaves || [], leafApi: H.leaves || null, fixtures: H.lights?.fixtures || null }); } catch (e) { console.warn('[interact] doors', e); }
  const nStatic = kit.finish();
  try { upgradeWorldSurfaces(game); } catch (e) { console.warn('[mats]', e); } // 道具合併後的共用材質加上表面細節(預編譯之前)
  ix.tick((dt) => { updateSurfaces(game, dt); return true; }); // 室內反射亮度跟著附近的燈(src/mats/surface.js)
  ix.doors = doors;
  ix.map = { kit, doors, nStatic };
  ix.warmList = () => [...kit.objects(), ...(H.leaves?.meshes || []), ...(doors?.planks ? [doors.planks] : [])];
  return ix;
}
