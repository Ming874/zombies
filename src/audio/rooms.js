// 依區域的實際幾何算殘響:面積(格數 × 4m²)、淨高(layout.ceilY,挑高大廳會比較高)、周長(邊界格邊)、
// 地板/牆/天花材質吸音係數 → Sabine 殘響時間 RT60 = 0.161·V / Σ(S·α);平均自由路徑 4V/S → 預延遲與早期反射分布;
// 狹長且牆面堅硬(走廊)→ 平行牆的顫動回聲;戶外 → 用射線量到建築立面的距離決定拍擊回聲的延遲。結果以區域 id 快取。
import { A, SPACES, clamp } from './core.js';

// 吸音係數(中頻約略值)
const FLOOR_A = { tile_white: 0.02, tile_ward: 0.02, tile_lobby: 0.02, terrazzo: 0.015, linoleum: 0.03, concrete: 0.02, concrete_wet: 0.015, stone: 0.02, wood_floor: 0.08, carpet: 0.3, padded: 0.55, metal_grate: 0.1, asphalt: 0.03, paving: 0.03, grass: 0.4, gravel: 0.3, roof_gravel: 0.3 };
const WALL_A = { tile_wall: 0.02, concrete_wall: 0.03, stone_wall: 0.03, brick: 0.04, plaster: 0.04, paint_green: 0.05, paint_white: 0.05, paint_gray: 0.05, wallpaper_kids: 0.07, wood_panel: 0.12, padded: 0.65 };
const CEIL_A = { pipes: 0.06, vault: 0.03 };
// 陳設(床、簾子、紙張、椅子…)額外的吸音
const FURN = { ward: 0.07, peds_ward: 0.07, dorm: 0.08, office: 0.09, director: 0.1, secretary: 0.09, archive: 0.16, laundry: 0.1, chapel: 0.05, cafeteria: 0.04, waiting: 0.05, playroom: 0.08, nursery: 0.06, shop: 0.08, security: 0.06, monitor: 0.06, supply: 0.07, pharmacy: 0.07, rehab: 0.04, icu: 0.05, er: 0.05, xray: 0.03, ct: 0.03, surgery: 0.02, delivery: 0.02, morgue: 0.01, autopsy: 0.01, lobby: 0.02, corridor: 0.015, psych_cell: 0 };
// 沒有幾何資訊時(灰盒/樓層預設)用主題預設
export const THEME_SPACE = {
  corridor: 'corridor', ward: 'room', psych_cell: 'padded', stairwell: 'stair', stair_ext: 'outdoor', lobby: 'hall', chapel: 'chapel',
  tunnel: 'tunnel', ossuary: 'tunnel', pump: 'tunnel', ramp: 'tunnel', boiler: 'industrial', dock: 'industrial', incinerator: 'industrial', machine: 'industrial',
  morgue: 'tile', autopsy: 'tile', surgery: 'tile', delivery: 'tile', laundry: 'tile', cafeteria: 'room', shop: 'small', office: 'small', director: 'small',
  security: 'small', monitor: 'small', archive: 'small', dorm: 'room', xray: 'room', ct: 'room', waiting: 'room', supply: 'room', rehab: 'room',
  pharmacy: 'room', icu: 'room', er: 'room', nursery: 'room', playroom: 'room', peds_ward: 'room', courtyard: 'outdoor', alley: 'outdoor',
  playground: 'outdoor', cemetery: 'outdoor', yard: 'outdoor', ambulance_bay: 'outdoor', plaza: 'outdoor', parking: 'open', rooftop: 'open', fire_escape: 'open',
};

const cache = new Map();

// 戶外:從區域中心往 8 個方向打水平射線,最近的兩個立面決定左右回聲延遲(來回距離 / 音速)
function outdoorSpace(zone, cx, cy, cz, key) {
  const base = SPACES[zone.theme === 'rooftop' || zone.theme === 'parking' || zone.theme === 'fire_escape' ? 'open' : 'outdoor'];
  const w = A.world;
  if (!w || !w.rayDistance) return { ...base, key };
  const hits = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    let h = 70;
    try { h = w.rayDistance(cx, cy + 1.6, cz, Math.cos(a), 0, Math.sin(a), 70); } catch { /* 略過 */ }
    hits.push(h);
  }
  hits.sort((a, b) => a - b);
  const d1 = clamp(hits[0], 3, 70), d2 = clamp(hits[1], 4, 70);
  const near = hits[0] < 69;
  return {
    ...base, key,
    echo: near ? clamp(0.65 - d1 / 140, 0.25, 0.65) : 0.2, // 立面越近回聲越清楚
    e: [clamp((2 * d1) / 343, 0.03, 0.42), clamp((2 * d2) / 343, 0.05, 0.42), near ? clamp(0.38 - d1 / 200, 0.12, 0.36) : 0.12],
  };
}

export function spaceForZone(zone, mood, fallbackSpace) {
  if (!zone) return fallbackSpace || 'corridor';
  const key = `z:${zone.id}`;
  const c = cache.get(key);
  if (c) return c;
  const lay = (A.world && A.world.layout) || null;
  const theme = THEME_SPACE[zone.theme] || fallbackSpace || 'corridor';
  if (!lay || !zone.rects || !lay.ceilY || zone.levelIndex == null) return theme;
  const W = lay.W, li = zone.levelIndex, C = lay.CELL || 2, lvY = lay.levels[li]?.y ?? 0;
  const cells = new Set();
  for (const [c0, r0, c1, r1] of zone.rects) for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) cells.add(r * W + cc);
  let edges = 0, hSum = 0, hN = 0, open = 0, sx = 0, sz = 0;
  for (const k of cells) {
    const cc = k % W, r = (k / W) | 0;
    sx += cc; sz += r;
    if (!cells.has(k - 1)) edges++;
    if (!cells.has(k + 1)) edges++;
    if (!cells.has(k - W)) edges++;
    if (!cells.has(k + W)) edges++;
    const cy = lay.ceilY(li, cc, r);
    if (Number.isFinite(cy)) { hSum += cy - lvY; hN++; } else open++;
  }
  const n = cells.size, cx = ((sx / n) + 0.5) * C, cz = ((sz / n) + 0.5) * C;
  let out;
  if (open > n * 0.5) out = outdoorSpace(zone, cx, lvY, cz, key);
  else {
    const Ar = n * C * C, H = clamp(hN ? hSum / hN : 3.4, 2.4, 14), P = edges * C;
    const V = Ar * H, Sw = P * H, S = 2 * Ar + Sw;
    const aF = FLOOR_A[zone.floor] ?? 0.03, aW = WALL_A[zone.wall] ?? 0.05, aC = CEIL_A[zone.ceil] ?? (zone.floor === 'padded' ? 0.6 : 0.12);
    const furn = FURN[zone.theme] ?? 0.04;
    const absorb = Ar * aF + Ar * aC + Sw * aW + S * furn;
    const rt = clamp((0.161 * V) / absorb, 0.22, 4.6);
    const avgA = absorb / S, mfp = (4 * V) / S, width = (2 * Ar) / P;
    const ir = {
      dur: rt,
      pre: clamp((mfp / 343) * 0.6, 0.002, 0.035),
      damp: clamp(0.3 + avgA * 2.2, 0.3, 0.9),
      bright: clamp(0.98 - avgA * 1.5, 0.45, 0.97),
      er: Math.round(clamp(8 + V / 60, 8, 20)),
      erSpan: clamp((mfp / 343) * 3, 0.012, 0.09),
    };
    if (width < 5.5 && aW < 0.07 && P > 3 * Math.sqrt(Ar)) { ir.flutter = (2 * width) / 343; ir.flutterG = clamp(0.42 - aW * 4, 0.15, 0.42); } // 狹長堅硬:顫動回聲
    const big = Math.sqrt(Ar);
    out = {
      key, ir,
      wet: clamp(0.38 + rt * 0.3, 0.3, 1.3),
      echo: big > 18 && avgA < 0.06 ? clamp(0.04 + (big - 18) / 120, 0.04, 0.3) : 0,
      e: [clamp(big / 343, 0.04, 0.3), clamp((big * 1.4) / 343, 0.06, 0.4), 0.3],
      rt: +rt.toFixed(2), vol: Math.round(V), h: +H.toFixed(1),
    };
  }
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

// 換地圖:區域 id 可能重複,清掉快取
export function resetRooms() { cache.clear(); }
export const roomInfo = () => [...cache.entries()].map(([k, v]) => `${k}:${v.rt ?? (v.ir && v.ir.dur)}s/${v.vol ?? '-'}m3${v.ir && v.ir.flutter ? '/flutter' : ''}${v.out ? '/out' : ''}`);
