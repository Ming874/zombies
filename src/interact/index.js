import { Interact } from './core.js';
import { IxUI } from './ui.js';
import { createKit } from './kit.js';
import { setupDoors } from './doors.js';
import { placeAll } from './place.js';
import { TIP_TEXT } from '../ui/tips.js';
import { upgradeWorldSurfaces, updateSurfaces } from '../mats/surface.js';

// 互動系統入口:flow.js buildGameplayWorld() 呼叫(在 world.buildNav 之前 → 互動物件的碰撞盒會進導航)。
// 換地圖時 disposeGameplayWorld() → game.interact.disposeMap(),再重新 buildInteract。
// 劇情包:src/interact/packs/<mapId>.js(沒有就只用主題補充);用 import.meta.glob,包不存在也能 build。
const PACKS = import.meta.glob('./packs/*.js', { eager: true });

export function buildInteract(game) {
  let ix = game.interact;
  if (!ix) {
    const ui = new IxUI(game);
    ix = new Interact(game, ui);
    ui.ix = ix;
    game.interact = ix;
    ix.disposeMap = () => {
      const m = ix.map;
      if (!m) return;
      ix.clear('map');
      m.doors?.dispose();
      for (const o of m.api?.own || []) { o.parent?.remove(o); o.geometry?.dispose(); }
      m.kit.dispose();
      ix.map = null;
    };
    ix.on('reset', () => ix.map?.doors?.reset());
    hints(game, ix);
  }
  ix.disposeMap();
  const t0 = performance.now();
  const H = game.hospital || {};
  const mapId = game.mapId || 'hospital';
  const pack = PACKS[`./packs/${mapId}.js`]?.default || null;
  const kit = createKit({ root: H.group || game.scene, levelGroups: H.propGroups || null });
  let doors = null, placed = null;
  try { doors = setupDoors(game, ix, { leaves: H.doorLeaves || [], leafApi: H.leaves || null, fixtures: H.lights?.fixtures || null, lockSpecs: (pack?.items || []).filter((i) => i.kind === 'lock') }); } catch (e) { console.warn('[interact] doors', e); }
  try { placed = placeAll(game, ix, kit, pack); } catch (e) { console.warn('[interact] place', e); }
  const nStatic = kit.finish();
  try { upgradeWorldSurfaces(game); } catch (e) { console.warn('[mats]', e); } // 道具合併後的共用材質加上表面細節(預編譯之前)
  ix.tick((dt) => { updateSurfaces(game, dt); return true; }); // 室內反射亮度跟著附近的燈(src/mats/surface.js)
  ix.map = { kit, doors, api: placed?.api, stats: placed?.stats, pack, nStatic };
  ix.tick(() => { if (game.state === 'playing' && game.phase === 'shop' && !ix.flags.has('h.shop.open')) ix.flags.set('h.shop.open', true); return true; }); // 本局第一次開店(補給站的電話會響)
  ix.doors = doors;
  // hz:warm 一起預編譯:互動物件的合併網格與 BatchedMesh 池、門扇/門框/玻璃/門縫光(含 BatchedMesh 的陰影深度變體)、木板
  ix.warmList = () => [...kit.objects(), ...(H.leaves?.meshes || []), ...(doors?.planks ? [doors.planks] : [])];
  console.log('[interact] build', JSON.stringify({ ms: Math.round(performance.now() - t0), items: ix.list.length, placed: placed?.stats?.placed, byKind: placed?.stats?.byKind, failed: placed?.stats?.failed?.length, doors: doors?.stats?.(), statics: nStatic, kit: kit.stats() }));
  return ix;
}

// 第一次有電話響:提示怎麼接(走新手提示系統;提示被關掉時改用訊息列,一局一次)
function hints(game, ix) {
  TIP_TEXT.phone ||= ['電話在響', '附近的電話在響……循著鈴聲找到它，看著電話按 [E] 接聽'];
  TIP_TEXT.interact ||= ['調查', '看著東西時畫面下方出現提示，就按 [E]：電話、門、開關、抽屜、收音機……有些要按住 [E]。看到、撿到、聽到的線索會自己記進筆記本（[J]）。'];
  let told = false;
  ix.on('ring', () => {
    if (told) return;
    told = true;
    const T = game.ui?.tips;
    if (!(T && T.show('phone', 0.2)) && !T?.has?.('phone')) game.ui?.feed?.('附近的電話在響……循著鈴聲找到它，按 [E] 接聽', { color: '#ffd27a', ms: 6500 });
  });
  ix.on('reset', () => { told = false; });
  ix.on('focus', () => { game.ui?.tips?.show?.('interact', 0.4); });
}
