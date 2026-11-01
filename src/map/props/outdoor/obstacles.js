import { V3 } from './kit.js';
import { Parts, put } from './kit.js';
import { placeCar, placePolice, placeAmbulance, placeHearse } from './cars.js';
import { dumpster, generator, incinerator, waterTower, acUnit } from './industrial.js';
import { barricade, bentLamp, tape } from './street.js';
import { fountain, sacredHeart } from './monuments.js';

// 大型障礙物分派(L.obstacles):每種都佔滿格子範圍並登記碰撞
const barricades = new WeakMap(); // ctx → 已放的拒馬位置(拉封鎖線用)
export function buildObstacle(ctx, o) {
  const zone = ctx.L.zoneAt(o.levelIndex, Math.floor(o.x / ctx.CELL), Math.floor(o.z / ctx.CELL));
  switch (o.kind) {
    case 'car': placeCar(ctx, o); return true;
    case 'police_car': placePolice(ctx, o, zone); return true;
    case 'ambulance': placeAmbulance(ctx, o, zone, false); return true;
    case 'ambulance_crash': {
      placeAmbulance(ctx, o, zone, true);
      // 撞彎的路燈:桿底在車頭前,彎折後壓在車頂上
      const x = o.x, y = o.y, z = o.z;
      bentLamp(ctx, [new V3(x + 3.3, y, z), new V3(x + 3.25, y + 0.85, z), new V3(x + 1.35, y + 2.1, z + 0.1), new V3(x + 0.8, y + 2.68, z + 0.12), new V3(x - 1.0, y + 2.7, z + 0.2), new V3(x - 2.2, y + 2.66, z + 0.3)]);
      return true;
    }
    case 'hearse': placeHearse(ctx, o, zone); return true;
    case 'dumpster': dumpster(ctx, o, zone); return true;
    case 'generator': generator(ctx, o, zone); return true;
    case 'incinerator': incinerator(ctx, o, zone); return true;
    case 'water_tower': waterTower(ctx, o, zone); return true;
    case 'ac_unit': acUnit(ctx, o, zone); return true;
    case 'fountain': fountain(ctx, { ...o, yaw: 0 }, zone); return true;
    case 'statue': sacredHeart(ctx, { ...o, yaw: 0 }, zone); return true;
    case 'barricade': {
      barricade(ctx, o.x, o.y, o.z, o.axis === 'NS' ? Math.PI / 2 : 0);
      let list = barricades.get(ctx);
      if (!list) barricades.set(ctx, (list = []));
      const P = new Parts();
      for (const q of list) {
        const d = Math.hypot(q.x - o.x, q.z - o.z);
        if (d < 2.5) tape(P, new V3(q.x + 0.9, o.y + 1.02, q.z), new V3(o.x - 0.9, o.y + 1.0, o.z), { sag: 0.06 });
        else if (d > 7 && d < 11) tape(P, new V3(q.x + 0.9, o.y + 1.0, q.z), new V3(o.x - 0.9, o.y + 1.0, o.z), { broken: true });
      }
      if (P.map.size) put(ctx, P, 0, 0, 0);
      list.push({ x: o.x, z: o.z });
      return true;
    }
    default: return false;
  }
}

// 展示間(檢視腳本用):依名稱建單一障礙物
export const GALLERY = {
  police_car: (ctx, o) => { o.sx = 4; o.sz = 2; placePolice(ctx, o, null); return 2; },
  ambulance: (ctx, o) => { o.sx = 6; o.sz = 2; placeAmbulance(ctx, o, null, false); return 2.8; },
  ambulance_crash: (ctx, o) => { o.sx = 6; o.sz = 2; o.axis = 'EW'; o.levelIndex = 1; o.kind = 'ambulance_crash'; buildObstacle(ctx, o); return 2.8; },
  hearse: (ctx, o) => { o.sx = 6; o.sz = 2; placeHearse(ctx, o, null); return 1.6; },
  car: (ctx, o) => { o.sx = 4; o.sz = 2; placeCar(ctx, o); return 1.5; },
};
