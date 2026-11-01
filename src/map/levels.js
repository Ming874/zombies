// 聖心醫院多樓層地圖(由設計稿產生後手動補上區域/障礙物/氛圍資料)。
// 每格 2m;row 0 = 北(-Z),col 0 = 西(-X)。世界座標 x = (c+0.5)*2、z = (r+0.5)*2、y = 樓層高度。
// 引擎(碰撞/導航)與場景建構都只透過 parseLayout() 讀取,避免兩邊對同一張圖有不同解讀。
export const W = 60, H = 50;
// 由 scratchpad/mapdesign/gen.py 產生:每格 2m,row 0 = 北;四層同尺寸 60x50
const LEVELS = [
  { id: 'B1', name: '地下室', y: -4.2, rows: [
    '############################################################', // 0
    '############################################################', // 1
    '#################################^^#########################', // 2
    '#################################^^#########################', // 3
    '#################################^^#########################', // 4
    '#################################^^#########################', // 5
    '#################################..#########################', // 6
    '#########.........#.........####.........#.........#########', // 7
    '#########.Z.......#...Z.....####.........#.......Z.#########', // 8
    '#########.........#.........####.........#.........#########', // 9
    '#########.........#.........#EE#.........#.........#########', // 10
    '#########.........###+###+###EE###+###+###.........#......##', // 11
    '#########.........+.....................Z#.........#....Z.##', // 12
    '#########.........#......................+.........+......##', // 13
    '#########...#######..####+########+####..#.........+......##', // 14
    '#########...#######..#Z...............#..#.........#......##', // 15
    '#########...#######..#.~~~~~~~~~~~~~~.#..#######...#......##', // 16
    '#########...####^^#..#.~~#~~#~~#~~#~~.#..#######...#......##', // 17
    '#########...####^^#..#.~~~~~~~~~~~~~~.#..#######...#......##', // 18
    '#########...####^^#..#.~~~~~~a.~~~~~~.+..####^^#...#......##', // 19
    '#########...####^^#..+.~~~~~~..~~~~~~.#..####^^#...###vv####', // 20
    '#########...+.....+..#.~~~~~~~~~~~~~~.#..####^^#...###vv####', // 21
    '#########...#######..#.~~#~~#~~#~~#~~.#..####^^#...###vv####', // 22
    '#########...#######..#.~~~~~~~~~~~~~~.#..+.....+...###vv####', // 23
    '#########.........#..#...............Z#..#######...#########', // 24
    '#########.........#..########+#########..#######...#########', // 25
    '#########.........#......................+.........#########', // 26
    '#########.........+Z.....................#.........#########', // 27
    '#########.........######+##########+#####..........#########', // 28
    '#########.........#..........#.........##..........#########', // 29
    '#########.........#..~~~~~~~.#.........+#..........#########', // 30
    '#########.Z.......#.Z~~~~~~~.#.......Z.##........Z.#########', // 31
    '#########.........#..~~~~~~~.#.........##..........#########', // 32
    '############################################################', // 33
    '############################################################', // 34
    '############################################################', // 35
    '############################################################', // 36
    '############################################################', // 37
    '############################################################', // 38
    '############################################################', // 39
    '############################################################', // 40
    '############################################################', // 41
    '############################################################', // 42
    '############################################################', // 43
    '############################################################', // 44
    '############################################################', // 45
    '############################################################', // 46
    '############################################################', // 47
    '############################################################', // 48
    '############################################################', // 49
  ] },
  { id: '1F', name: '一樓', y: 0, rows: [
    '############################################################', // 0
    '#,,,,,,,,,,,z,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,"""""""|', // 1
    '#,XX,,,,,,,,XX,,,,,,,,,,,,,,,,,,=%%=,,,,XX,,,XX,,,,,"""""""|', // 2
    '#,XX,,,,,,,,,,,,,,,,,,,XXX,,,,,,=%%=,,,,,,,,,,,,,,,,"""""""|', // 3
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,=%%=,,,,,,,,,,,,,,,,"""""z"|', // 4
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,=%%=,,,,,,,,,,,,,,,,"""""""|', // 5
    '#,,,,,,,##############W##W#######W##+##W####W###W###"""""""|', // 6
    '#,,,,,,,#....#....#.........####.........#.........#"""""""|', // 7
    '#,,,,,,,#.Z..+..Z.#.......Z.####.......Z.#.........+"""""""|', // 8
    '#,,,,,,,#....#....#.........####.........#.......Z.#"""""""|', // 9
    '#,,,,,,,#....#....#.........#EE#.........#.........#|||,||||', // 10
    '#||"|||,###+###+###+#=====#+#EE###+###+######+######,,,,,,,|', // 11
    '#"""""|,#Z.........................................+,,,,,,,|', // 12
    '#"""""|,+.........................................Z#,,,,,,,|', // 13
    '#""z""|,##+########..#W#W+W#W#W#W#+#W##..####+######,,,,,,,|', // 14
    '#"""""|,#...#######..#""""""",,"""""""#..+.........#,,,,,,,|', // 15
    '#"""""",#...+.....+..W""""""",,"""""""W............#,,,,,,,|', // 16
    '#"""""|,W...#vv#%%#..#""""""",,"""""""#..#######.h.#,,,,,,,|', // 17
    '#"""""|,#...#vv#%%#..W""""""",,"""""""W..+.....+...#,,,,,,,|', // 18
    '#"""""|,#...#vv#%%#..+,,,,,,,XX,,,,,,,#..#vv#%%#...#,====,,|', // 19
    '#"""""|,+...#vv#%%#..W,,,,,,,XX,,,,,,,+..#vv#%%#...+,=%%=,,|', // 20
    '#"""""|,#...#######..#""""""",,"""""""#..#vv#%%#...+,=%%=X,|', // 21
    '#"""""",#...#######..W""""""",,"""""""W..#vv#%%#...#,=%%=X,|', // 22
    '#"""""|,W.....Z...#..#""""""",,"""""""#..#######.Z.#,=%%=X,|', // 23
    '#"""""|,#.........+..W""""""",,"""""""W..#######...#,,,,,,,|', // 24
    '#||"|||,##+########..#W#W+W#W#W#W#+#W##..########+##,,,,,,,|', // 25
    '#,,,,,==#..........................................#,,,,,,,|', // 26
    '#,,,,=^^#...............##........##...............+,,,,,,,|', // 27
    '#,,,,=^^#######+###+##.=^^=......=^^=.#WW++WW###+###,,,,,,,|', // 28
    '#,,,,=^^#............#.=^^=......=^^=.W......#.....#,,,,,,,|', // 29
    '#,,,,=^^#.Z..........#.=^^=...P..=^^=.W......#..a..#,,,,,,,|', // 30
    '#,,,,,,,#............#.=^^=......=^^=.W..$$..#.....#,,,,,,,|', // 31
    '#,,,,,,,+............#................W......#....Z#,,,,,z,|', // 32
    '#,,,,,,,##W#W#W#W#W#W#WWWWWWW++WWWWWWW##########W###,,,,,,,|', // 33
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 34
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,XX,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 35
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,XX,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 36
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 37
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,XXX,,,,,,,,,,,,,,,,,,,,,,,|', // 38
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 39
    '#,,,X,,X,,X,,X,,,,,X,,,,,,,,,,,,,,,,,,,,X,,X,,,,,X,,X,,X,,,|', // 40
    '#,,,X,,X,,X,,X,,,,,X,,,,,,,,,,,,,,,,,,,,X,,X,,,,,X,,X,,X,,,|', // 41
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 42
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,|', // 43
    '#,,,,X,,X,,X,,,,,X,,,,,,,,,,,,,,,,,,,,,,,X,,X,,,,,X,,X,,,,,|', // 44
    '#,,,,X,,X,,X,,,,,X,,,,,,,,,,,,,,,,,,,,,,,X,,X,,,,,X,,X,,,,,|', // 45
    '#,,,,,,,,,,,,,,,,,,,,,,,XX,,,,,,,,XX,,,,,,,,,,,,,,,,,,,,,,,|', // 46
    '#"z"""""""""""""""""""""""XX,,,,XX"""""""""""""""""""""""z"|', // 47
    '#""""""""""""""""""""""""""",,,,"""""""""""""""""""""""""""|', // 48
    '||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||', // 49
  ] },
  { id: '2F', name: '二樓', y: 4.2, rows: [
    '____________________________________________________________', // 0
    '____________________________________________________________', // 1
    '____________________________________________________________', // 2
    '____________________________________________________________', // 3
    '____________________________________________________________', // 4
    '____________________________________________________________', // 5
    '________##W###W###W###W###W######W###W###W###W###W##________', // 6
    '________#...#...#...#...#...####...#...#...#...#...#________', // 7
    '________#.Z.+...#...+.Z.#...####.Z.+...#...+...#.Z.#________', // 8
    '________#...#...#.Z.#...#...####...#...#.Z.#...#...#________', // 9
    '________#...#...#...#...#...#EE#...#...#...#...#...#________', // 10
    '________##+###+###+###+###+##EE##+###+###+###+###+##________', // 11
    '________#.........................................Z#________', // 12
    '________#..........................................#________', // 13
    '________##+########..#W#W#W#W#W#W#W#W##..####+######________', // 14
    '________#...#######..#________________#..+.........W________', // 15
    '________#.Z.#######..W________________W..#.......h.#________', // 16
    '________#...#%%#^^#..#________________#..#######...#________', // 17
    '________#...#%%#^^#..W________________W..#######...#________', // 18
    '________#...#%%#^^#..#________________#..#%%#^^#...W________', // 19
    '________##+##%%#^^#..W________________W..#%%#^^#...#________', // 20
    '________#...+.....+..#________________#..#%%#^^#...#________', // 21
    '________#...#######..W________________W..#%%#^^#...#________', // 22
    '________#.........+..#________________#..+.....+.Z.W________', // 23
    '________#.........#..W________________W..#######...#________', // 24
    '________##+########..#W#W#W#W#W#W#W#W##..########+##________', // 25
    '___,,,,,+..........................................#________', // 26
    '___vv=%%#..........................................#________', // 27
    '___vv=%%##WWWW+#####+###%%=oooooo=%%##WW+######+####________', // 28
    '___vv=%%#.......#......#%%=oooooo=%%#.......#......#________', // 29
    '___vv=%%#.......+......#%%=oooooo=%%#....Z..+......#________', // 30
    '________#.Z.....#....Z.#%%=oooooo=%%#.......#....Z.#________', // 31
    '________#.......#......#oooooooooooo#.......#......#________', // 32
    '________##W##W#####W####################W######W####________', // 33
    '____________________________________________________________', // 34
    '____________________________________________________________', // 35
    '____________________________________________________________', // 36
    '____________________________________________________________', // 37
    '____________________________________________________________', // 38
    '____________________________________________________________', // 39
    '____________________________________________________________', // 40
    '____________________________________________________________', // 41
    '____________________________________________________________', // 42
    '____________________________________________________________', // 43
    '____________________________________________________________', // 44
    '____________________________________________________________', // 45
    '____________________________________________________________', // 46
    '____________________________________________________________', // 47
    '____________________________________________________________', // 48
    '____________________________________________________________', // 49
  ] },
  { id: '3F', name: '三樓與頂樓', y: 8.4, rows: [
    '____________________________________________________________', // 0
    '____________________________________________________________', // 1
    '____________________________________________________________', // 2
    '____________________________________________________________', // 3
    '____________________________________________________________', // 4
    '____________________________________________________________', // 5
    '________############################################________', // 6
    '________#.....#...#..#..#..#####..#..#..#..#.......#________', // 7
    '________#.h...#.Z.#Z.#..#..#####..#..#..#.Z#.....Z.#________', // 8
    '________#.....+...#..#..#..#####..#..#..#..#.....a.#________', // 9
    '________#.....#...#..#..#..##EE#..#..#..#..#.......#________', // 10
    '________########+##+##+##+###EE#+##+##+##+#####+####________', // 11
    '________#..........................................#________', // 12
    '________#.........................................Z#________', // 13
    '________##+########..#W#W#W#W#W#W#W#W##..####+######________', // 14
    '________#...#######..#________________#..+.........#________', // 15
    '________#...+.....+..W________________W..#.........#________', // 16
    '________#...####%%#..#________________#..#######...#________', // 17
    '________#...####%%#..W________________W..+.....+...#________', // 18
    '________#...####%%#..#________________#..####%%#...#________', // 19
    '________#...####%%#..W________________W..####%%#...#________', // 20
    '________#...#######..#________________#..####%%#...#________', // 21
    '________#...#######..W________________W..####%%#.Z.#________', // 22
    '________#.Z.......#..#________________#..#######...#________', // 23
    '________#.........+..W________________W..#######...#________', // 24
    '________##W###W####++#,,,,,,,,,,,,,,,,#++####W###W##________', // 25
    '________=,,,,,,,,,,,,,,,,,,,,,z,,,,,,,,,,,,,,,,,,,,=________', // 26
    '___%%=__=,,,,,,,,,,,,,X,,,,,,,,,,,,,,X,,,,,,,,,,,,,=________', // 27
    '___%%=__=,,,XX,,,,,,,,,,,,oooooooo,,,,,,,,,,,,XX,,,=________', // 28
    '___%%=__=,,,XX,,,,,,,,,,,,oooooooo,,,,,,,,,,,,XX,,,=________', // 29
    '___%%=__=,,,,,,,,,,,,,,,,,oooooooo,,,,,,,,,,,,,,,,,=________', // 30
    '___,,,,,,,,,,,,,,,X,,,,,,,oooooooo,,,,,,,X,,,,,,,,,=________', // 31
    '________=,z,,,,,,,,,,,,,,,oooooooo,,,,,,,,,,,,,,,z,=________', // 32
    '________============================================________', // 33
    '____________________________________________________________', // 34
    '____________________________________________________________', // 35
    '____________________________________________________________', // 36
    '____________________________________________________________', // 37
    '____________________________________________________________', // 38
    '____________________________________________________________', // 39
    '____________________________________________________________', // 40
    '____________________________________________________________', // 41
    '____________________________________________________________', // 42
    '____________________________________________________________', // 43
    '____________________________________________________________', // 44
    '____________________________________________________________', // 45
    '____________________________________________________________', // 46
    '____________________________________________________________', // 47
    '____________________________________________________________', // 48
    '____________________________________________________________', // 49
  ] },
];

// 可走格與挑空/建築外空中/樓梯開口相鄰的邊,由引擎與場景自動加上 1.1m 欄杆(樓梯頂端的出入口除外)
// ======================================================================
// 圖例:每個字元的旗標。阻擋規則:
//  移動:只有 WALK 可站;其餘都擋(OPEN 只有從下層樓梯爬上來時才可通過)
//  子彈/視線:WALL、OBSTACLE、ELEVATOR 全高阻擋;WINDOW 只在 0.9~2.4m 可穿(破窗);
//            RAIL 在 1.1m 以下阻擋;FENCE、VOID、OPEN 不擋
// ======================================================================
export const F = {
  WALK: 1, OUTDOOR: 2, GRASS: 4, WATER: 8, DOOR: 16, STAIR: 32, OPEN: 64, VOID: 128,
  WALL: 256, WINDOW: 512, RAIL: 1024, FENCE: 2048, OBSTACLE: 4096, ELEVATOR: 8192,
  SPAWN: 16384, START: 32768, SHOP: 65536, AMMO: 131072, HEALTH: 262144,
};
export const LEGEND = {
  '#': F.WALL, '.': F.WALK, ',': F.WALK | F.OUTDOOR, '"': F.WALK | F.OUTDOOR | F.GRASS, '+': F.WALK | F.DOOR,
  '~': F.WALK | F.WATER, '^': F.WALK | F.STAIR, v: F.WALK | F.STAIR, '<': F.WALK | F.STAIR, '>': F.WALK | F.STAIR,
  '%': F.OPEN, _: F.VOID, o: F.VOID, W: F.WINDOW, '=': F.RAIL, '|': F.FENCE, X: F.OBSTACLE, E: F.ELEVATOR,
  Z: F.WALK | F.SPAWN, z: F.WALK | F.OUTDOOR | F.SPAWN, P: F.WALK | F.START, $: F.WALK | F.SHOP,
  a: F.WALK | F.AMMO, h: F.WALK | F.HEALTH,
};
export const CELL = 2; // 每格 2m
export const LEVEL_H = 4.2; // 樓層高
export const SLAB = 0.8; // 樓板 + 天花板夾層厚度(室內淨高 3.4m)
export const CEIL_H = LEVEL_H - SLAB;
export const WINDOW_SILL = 0.9, WINDOW_TOP = 2.4, RAIL_H = 1.1;
export const BUILDING = { c0: 8, r0: 6, c1: 51, r1: 33 }; // 主建築外牆範圍(格)

// ======================================================================
// 氛圍:每個區域引用一個 mood。fog 為顏色、density 為 FogExp2 密度、ambient 為環境光強度、
// tint 為環境光色;light 欄位見 ZONES 說明
// ======================================================================
export const MOODS = {
  corridor: { fog: 0x0b0f0c, density: 0.03, ambient: 0.32, tint: 0x9fb8a8 }, // 慘綠日光燈
  ward: { fog: 0x0c0f0d, density: 0.032, ambient: 0.28, tint: 0xa8b8a0 },
  clinical: { fog: 0x0d1012, density: 0.028, ambient: 0.36, tint: 0xc8d4dc }, // 冷白
  lobby: { fog: 0x0a0d14, density: 0.02, ambient: 0.3, tint: 0x8090b8 }, // 月光柱
  chapel: { fog: 0x120c08, density: 0.03, ambient: 0.22, tint: 0xd09060 }, // 燭光
  safe: { fog: 0x14100a, density: 0.012, ambient: 0.6, tint: 0xffd8a0 }, // 暖光安全屋(前景-庇護)
  lamp207: { fog: 0x0d0906, density: 0.03, ambient: 0.1, tint: 0xd8a070 }, // [scene r4] 207:只有檯燈
  emergency: { fog: 0x140606, density: 0.032, ambient: 0.24, tint: 0xc04040 }, // 緊急紅燈
  basement: { fog: 0x040505, density: 0.05, ambient: 0.1, tint: 0x6a7068 }, // 幾乎全黑
  flooded: { fog: 0x050a0c, density: 0.05, ambient: 0.12, tint: 0x507a80 },
  morgue: { fog: 0x080b0d, density: 0.04, ambient: 0.18, tint: 0xa0c0d0 },
  industrial: { fog: 0x0e0904, density: 0.04, ambient: 0.18, tint: 0xd09050 }, // 鈉燈橘
  nursery: { fog: 0x100808, density: 0.035, ambient: 0.16, tint: 0xd090a0 }, // 夜燈粉紅
  delivery: { fog: 0x0d0808, density: 0.036, ambient: 0.12, tint: 0xb08a8a }, // [scene6] 產房:暗、偏粉灰,保溫台紅光
  psych: { fog: 0x0c0d10, density: 0.03, ambient: 0.3, tint: 0xd8e0f0 },
  office: { fog: 0x0e0c0a, density: 0.03, ambient: 0.22, tint: 0xc0a080 },
  stair: { fog: 0x0a0606, density: 0.04, ambient: 0.16, tint: 0xa05050 },
  outdoor: { fog: 0x1a2230, density: 0.03, ambient: 0.45, tint: 0x8090b0 }, // 月光 + 霧
  outdoor_fog: { fog: 0x1c232c, density: 0.05, ambient: 0.4, tint: 0x7a8aa0 }, // 濃霧(墓園、停車場邊緣)
  roof: { fog: 0x1a2232, density: 0.022, ambient: 0.5, tint: 0x8a9ac0 },
};

// ======================================================================
// 區域:rects 為 [c0, r0, c1, r1](含端點)。theme 給道具擺設用;
// floor / wall 為材質鍵(見 src/map/materials.js);light 為燈具類型:
//  fluoro 日光燈管 / fluoro_dying 故障閃爍 / fluoro_cold 冷白 / surgical 手術燈 / emergency 紅色緊急燈
//  candle 燭光 / moon 無燈(月光) / warm 暖色(安全屋) / monitor 螢幕光 / bare_bulb 裸燈泡
//  sodium 鈉燈(橘) / nightlight 夜燈 / lamp 檯燈 / fire 爐火 / none
// ======================================================================
const ward = (n, c0, c1) => ({ id: `f2_ward_${n}`, level: '2F', name: `病房 ${n}`, rects: [[c0, 7, c1, 10]], theme: 'ward', floor: 'linoleum', wall: 'paint_green', light: n === 207 ? 'fluoro' : 'fluoro_dying', mood: n === 207 ? 'lamp207' : 'ward' });
const cell = (n, c0) => ({ id: `f3_cell_${n}`, level: '3F', name: `隔離房 ${n}`, rects: [[c0, 7, c0 + 1, 10]], theme: 'psych_cell', floor: 'padded', wall: 'padded', light: 'fluoro_cold', mood: 'psych' });
const ring = (r1) => [[9, 12, 50, 13], [19, 12, 20, r1], [39, 12, 40, r1]];
export const ZONES = [
  // ---------------- B1 地下室 ----------------
  { id: 'b1_tunnel', level: 'B1', name: '維修隧道', rects: [[19, 12, 40, 13], [19, 26, 40, 27], [19, 12, 20, 27], [39, 12, 40, 27]], theme: 'tunnel', floor: 'concrete_wet', wall: 'concrete_wall', ceil: 'pipes', light: 'bare_bulb', mood: 'basement' },
  { id: 'b1_ossuary', level: 'B1', name: '地下納骨堂', rects: [[22, 15, 37, 24]], theme: 'ossuary', floor: 'stone', wall: 'stone_wall', ceil: 'vault', light: 'candle', mood: 'flooded' },
  { id: 'b1_boiler', level: 'B1', name: '鍋爐與發電機房', rects: [[9, 7, 17, 13]], theme: 'boiler', floor: 'concrete', wall: 'concrete_wall', ceil: 'pipes', light: 'sodium', mood: 'industrial' },
  { id: 'b1_morgue', level: 'B1', name: '太平間', rects: [[19, 7, 27, 10]], theme: 'morgue', floor: 'tile_white', wall: 'tile_wall', light: 'fluoro_cold', mood: 'morgue' },
  { id: 'b1_autopsy', level: 'B1', name: '解剖室', rects: [[32, 7, 40, 10], [33, 6, 34, 6]], theme: 'autopsy', floor: 'tile_white', wall: 'tile_wall', light: 'surgical', mood: 'morgue' },
  { id: 'b1_morgue_stair', level: 'B1', name: '遺體接收外梯', rects: [[33, 2, 34, 5]], theme: 'stair_ext', floor: 'concrete', wall: 'concrete_wall', light: 'bare_bulb', mood: 'basement' },
  { id: 'b1_supply', level: 'B1', name: '中央供應室', rects: [[42, 7, 50, 15]], theme: 'supply', floor: 'concrete', wall: 'paint_gray', light: 'fluoro_dying', mood: 'basement' },
  { id: 'b1_dock', level: 'B1', name: '地下裝卸平台', rects: [[52, 11, 57, 19]], theme: 'dock', floor: 'concrete', wall: 'concrete_wall', light: 'sodium', mood: 'industrial' },
  { id: 'b1_ramp', level: 'B1', name: '救護車坡道', rects: [[54, 20, 55, 23]], theme: 'ramp', floor: 'asphalt', wall: 'concrete_wall', light: 'sodium', mood: 'industrial' },
  { id: 'b1_laundry', level: 'B1', name: '洗衣房與維修通道', rects: [[9, 14, 11, 23], [9, 24, 17, 32]], theme: 'laundry', floor: 'tile_ward', wall: 'tile_wall', light: 'fluoro_dying', mood: 'basement' },
  { id: 'b1_incinerator', level: 'B1', name: '焚化爐與醫療廢棄物', rects: [[48, 16, 50, 25], [41, 26, 50, 32]], theme: 'incinerator', floor: 'concrete', wall: 'brick', light: 'fire', mood: 'industrial' },
  { id: 'b1_pump', level: 'B1', name: '水泵房', rects: [[19, 29, 28, 32]], theme: 'pump', floor: 'concrete_wet', wall: 'concrete_wall', ceil: 'pipes', light: 'bare_bulb', mood: 'flooded' },
  { id: 'b1_archive', level: 'B1', name: '舊病歷庫', rects: [[30, 29, 38, 32]], theme: 'archive', floor: 'linoleum', wall: 'paint_gray', light: 'fluoro_dying', mood: 'basement' },
  { id: 'b1_stair_w', level: 'B1', name: '西樓梯間', rects: [[13, 16, 17, 21]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'b1_stair_e', level: 'B1', name: '東樓梯間', rects: [[42, 18, 46, 23]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },

  // ---------------- 1F 一樓 ----------------
  { id: 'f1_xray', level: '1F', name: 'X 光室', rects: [[9, 7, 12, 10]], theme: 'xray', floor: 'linoleum', wall: 'paint_white', light: 'fluoro_dying', mood: 'clinical' },
  { id: 'f1_ct', level: '1F', name: '電腦斷層室', rects: [[14, 7, 17, 10]], theme: 'ct', floor: 'linoleum', wall: 'paint_white', light: 'fluoro_cold', mood: 'clinical' },
  { id: 'f1_pharmacy', level: '1F', name: '藥局', rects: [[19, 7, 27, 10]], theme: 'pharmacy', floor: 'linoleum', wall: 'paint_green', light: 'fluoro_dying', mood: 'corridor' },
  { id: 'f1_cafeteria', level: '1F', name: '員工餐廳', rects: [[32, 7, 40, 10]], theme: 'cafeteria', floor: 'tile_ward', wall: 'tile_wall', light: 'fluoro_dying', mood: 'corridor' }, // [scene8] 原本 fluoro 九成燈管全亮,像還在營業 → 老化燈管(三分之一壞掉)
  { id: 'f1_rehab', level: '1F', name: '復健室', rects: [[42, 7, 50, 10]], theme: 'rehab', floor: 'wood_floor', wall: 'paint_white', light: 'fluoro_dying', mood: 'clinical' },
  { id: 'f1_waiting', level: '1F', name: '門診候診區', rects: [[9, 15, 11, 24], [12, 23, 17, 24]], theme: 'waiting', floor: 'tile_lobby', wall: 'paint_green', light: 'fluoro', mood: 'corridor' },
  { id: 'f1_er', level: '1F', name: '急診室', rects: [[42, 15, 50, 16], [48, 17, 50, 24], [41, 16, 41, 16]], theme: 'er', floor: 'linoleum', wall: 'tile_wall', light: 'emergency', mood: 'emergency' },
  { id: 'f1_chapel', level: '1F', name: '禮拜堂', rects: [[9, 29, 20, 32]], theme: 'chapel', floor: 'wood_floor', wall: 'plaster', light: 'candle', mood: 'chapel' },
  { id: 'f1_lobby', level: '1F', name: '挑高大廳', rects: [[22, 28, 37, 32]], theme: 'lobby', floor: 'terrazzo', wall: 'plaster', light: 'moon', mood: 'lobby' },
  { id: 'f1_store', level: '1F', name: '便利商店（金水商行補給點）', rects: [[39, 29, 44, 32]], theme: 'shop', floor: 'tile_lobby', wall: 'paint_white', light: 'warm', mood: 'safe' },
  { id: 'f1_security', level: '1F', name: '保全室', rects: [[46, 29, 50, 32]], theme: 'security', floor: 'linoleum', wall: 'paint_gray', light: 'monitor', mood: 'office' },
  { id: 'f1_corridor', level: '1F', name: '走廊', rects: [...ring(27), [9, 26, 50, 27]], theme: 'corridor', floor: 'tile_ward', wall: 'paint_green', light: 'fluoro_dying', mood: 'corridor' },
  { id: 'f1_stair_w', level: '1F', name: '西樓梯間', rects: [[13, 16, 17, 21]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f1_stair_e', level: '1F', name: '東樓梯間', rects: [[42, 18, 46, 23]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f1_courtyard', level: '1F', name: '中庭花園', rects: [[22, 15, 37, 24]], theme: 'courtyard', floor: 'grass', light: 'moon', mood: 'outdoor' },
  { id: 'f1_alley', level: '1F', name: '北側後勤巷', rects: [[1, 1, 51, 5]], theme: 'alley', floor: 'asphalt', light: 'sodium', mood: 'outdoor' },
  { id: 'f1_playground', level: '1F', name: '兒童遊戲場', rects: [[52, 1, 58, 9]], theme: 'playground', floor: 'grass', light: 'moon', mood: 'outdoor_fog' },
  { id: 'f1_cemetery', level: '1F', name: '舊墓園', rects: [[1, 12, 5, 24]], theme: 'cemetery', floor: 'grass', light: 'moon', mood: 'outdoor_fog' },
  { id: 'f1_westyard', level: '1F', name: '西側空地', rects: [[1, 6, 7, 11], [7, 12, 7, 25], [1, 25, 7, 33]], theme: 'yard', floor: 'gravel', light: 'moon', mood: 'outdoor' },
  { id: 'f1_ambulance', level: '1F', name: '急診車道', rects: [[52, 10, 58, 33]], theme: 'ambulance_bay', floor: 'asphalt', light: 'emergency', mood: 'outdoor' },
  { id: 'f1_plaza', level: '1F', name: '前廣場', rects: [[1, 34, 58, 37]], theme: 'plaza', floor: 'paving', light: 'sodium', mood: 'outdoor' },
  { id: 'f1_parking', level: '1F', name: '停車場', rects: [[1, 38, 58, 48]], theme: 'parking', floor: 'asphalt', light: 'sodium', mood: 'outdoor_fog' },

  // ---------------- 2F 二樓 ----------------
  ward(201, 9, 11), ward(202, 13, 15), ward(203, 17, 19), ward(204, 21, 23), ward(205, 25, 27),
  ward(206, 32, 34), ward(207, 36, 38), ward(208, 40, 42), ward(209, 44, 46), ward(210, 48, 50),
  { id: 'f2_surgery', level: '2F', name: '手術部', rects: [[9, 15, 11, 24], [12, 23, 17, 24]], theme: 'surgery', floor: 'tile_white', wall: 'tile_wall', light: 'surgical', mood: 'clinical' },
  { id: 'f2_icu', level: '2F', name: '加護病房', rects: [[42, 15, 50, 16], [48, 17, 50, 24]], theme: 'icu', floor: 'linoleum', wall: 'paint_white', light: 'monitor', mood: 'clinical' },
  { id: 'f2_nursery', level: '2F', name: '新生兒室', rects: [[9, 29, 15, 32]], theme: 'nursery', floor: 'linoleum', wall: 'wallpaper_kids', light: 'nightlight', mood: 'nursery' },
  { id: 'f2_delivery', level: '2F', name: '產房', rects: [[17, 29, 22, 32]], theme: 'delivery', floor: 'tile_white', wall: 'tile_wall', light: 'monitor', mood: 'delivery' }, // [scene r5/6] 原本 surgical 全亮、像展示間 → 只剩稀疏的壞燈管 + 保溫台紅光(monitor 型 = 稀疏天花燈)
  { id: 'f2_playroom', level: '2F', name: '小兒科遊戲室', rects: [[37, 29, 43, 32]], theme: 'playroom', floor: 'carpet', wall: 'wallpaper_kids', light: 'nightlight', mood: 'nursery' },
  { id: 'f2_peds', level: '2F', name: '小兒病房', rects: [[45, 29, 50, 32]], theme: 'peds_ward', floor: 'linoleum', wall: 'wallpaper_kids', light: 'fluoro_dying', mood: 'nursery' },
  { id: 'f2_corridor', level: '2F', name: '走廊', rects: [...ring(27), [9, 26, 50, 27]], theme: 'corridor', floor: 'linoleum', wall: 'paint_green', light: 'fluoro_dying', mood: 'corridor' },
  { id: 'f2_stair_w', level: '2F', name: '西樓梯間', rects: [[13, 16, 17, 21]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f2_stair_e', level: '2F', name: '東樓梯間', rects: [[42, 18, 46, 23]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f2_fire_escape', level: '2F', name: '西側逃生梯', rects: [[3, 26, 7, 31]], theme: 'fire_escape', floor: 'metal_grate', light: 'moon', mood: 'outdoor' },

  // ---------------- 3F 三樓 + 頂樓 ----------------
  { id: 'f3_director', level: '3F', name: '院長室', rects: [[9, 7, 13, 10]], theme: 'director', floor: 'wood_floor', wall: 'wood_panel', light: 'lamp', mood: 'office' },
  { id: 'f3_secretary', level: '3F', name: '秘書室', rects: [[15, 7, 17, 10]], theme: 'office', floor: 'carpet', wall: 'paint_white', light: 'fluoro_dying', mood: 'office' },
  cell(1, 19), cell(2, 22), cell(3, 25), cell(4, 32), cell(5, 35), cell(6, 38), cell(7, 41),
  { id: 'f3_monitor', level: '3F', name: '監控室', rects: [[44, 7, 50, 10]], theme: 'monitor', floor: 'linoleum', wall: 'paint_gray', light: 'monitor', mood: 'office' },
  { id: 'f3_dorm', level: '3F', name: '修女宿舍', rects: [[9, 15, 11, 24], [12, 23, 17, 24]], theme: 'dorm', floor: 'wood_floor', wall: 'plaster', light: 'candle', mood: 'chapel' },
  { id: 'f3_machine', level: '3F', name: '機房與水箱泵浦', rects: [[42, 15, 50, 16], [48, 17, 50, 24]], theme: 'machine', floor: 'concrete', wall: 'concrete_wall', ceil: 'pipes', light: 'sodium', mood: 'industrial' },
  { id: 'f3_corridor', level: '3F', name: '精神科走廊', rects: ring(24), theme: 'corridor', floor: 'linoleum', wall: 'paint_white', light: 'fluoro_cold', mood: 'psych' },
  { id: 'f3_stair_w', level: '3F', name: '西樓梯間', rects: [[13, 16, 17, 21]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f3_stair_e', level: '3F', name: '東樓梯間', rects: [[42, 18, 46, 23]], theme: 'stairwell', floor: 'concrete', wall: 'concrete_wall', light: 'emergency', mood: 'stair' },
  { id: 'f3_roof', level: '3F', name: '頂樓平台', rects: [[9, 26, 50, 32], [22, 25, 37, 25]], theme: 'rooftop', floor: 'roof_gravel', light: 'moon', mood: 'roof' },
  { id: 'f3_fire_escape', level: '3F', name: '西側逃生梯頂', rects: [[3, 26, 8, 31]], theme: 'fire_escape', floor: 'metal_grate', light: 'moon', mood: 'roof' },
  { id: 'f1_fire_escape', level: '1F', name: '西側逃生梯', rects: [[3, 26, 7, 31]], theme: 'fire_escape', floor: 'metal_grate', light: 'moon', mood: 'outdoor' },
];
// 未落在任何區域時的預設(各樓層)
export const LEVEL_DEFAULT = {
  B1: { theme: 'tunnel', floor: 'concrete', wall: 'concrete_wall', light: 'bare_bulb', mood: 'basement' },
  '1F': { theme: 'corridor', floor: 'tile_ward', wall: 'paint_green', light: 'fluoro_dying', mood: 'corridor' },
  '2F': { theme: 'corridor', floor: 'linoleum', wall: 'paint_green', light: 'fluoro_dying', mood: 'corridor' },
  '3F': { theme: 'corridor', floor: 'linoleum', wall: 'paint_white', light: 'fluoro_cold', mood: 'psych' },
};

// ======================================================================
// 大型障礙物('X' 格):kind 決定模型;rect 為佔用的格子;axis 為長軸方向
// ======================================================================
const car = (c, r) => ({ level: '1F', kind: 'car', rect: [c, r, c, r + 1], axis: 'NS' });
export const OBSTACLES = [
  { level: '1F', kind: 'incinerator', rect: [2, 2, 3, 3], note: '焚化爐 + 煙囪' },
  { level: '1F', kind: 'dumpster', rect: [12, 2, 13, 2], axis: 'EW' },
  { level: '1F', kind: 'dumpster', rect: [45, 2, 46, 2], axis: 'EW' },
  { level: '1F', kind: 'generator', rect: [40, 2, 41, 2], axis: 'EW', note: '唯一還在運轉的發電機' },
  { level: '1F', kind: 'hearse', rect: [23, 3, 25, 3], axis: 'EW', note: '靈車,後門開著' },
  { level: '1F', kind: 'fountain', rect: [29, 19, 30, 20], note: '乾涸噴水池 + 聖母像' },
  { level: '1F', kind: 'ambulance', rect: [57, 21, 57, 23], axis: 'NS', note: '車門開著,警示燈還在閃' },
  { level: '1F', kind: 'statue', rect: [29, 35, 30, 36], note: '聖心耶穌像,臉被布蓋住' },
  ...[4, 7, 10, 13, 19, 40, 43, 49, 52, 55].map((c) => car(c, 40)),
  ...[5, 8, 11, 17, 41, 44, 50, 53].map((c) => car(c, 44)),
  { level: '1F', kind: 'ambulance_crash', rect: [33, 38, 35, 38], axis: 'EW', note: '撞上路燈的救護車' },
  { level: '1F', kind: 'police_car', rect: [24, 46, 25, 46], axis: 'EW' },
  { level: '1F', kind: 'police_car', rect: [34, 46, 35, 46], axis: 'EW' },
  ...[26, 27, 32, 33].map((c) => ({ level: '1F', kind: 'barricade', rect: [c, 47, c, 47], axis: 'EW' })),
  { level: '3F', kind: 'water_tower', rect: [12, 28, 13, 29] },
  { level: '3F', kind: 'water_tower', rect: [46, 28, 47, 29] },
  ...[[22, 27], [37, 27], [18, 31], [41, 31]].map(([c, r]) => ({ level: '3F', kind: 'ac_unit', rect: [c, r, c, r] })),
];

// ======================================================================
// 通風口:爬行者專用的出生點(從牆腳的通風管爬出來)。c,r 為靠牆的地面格,wall 為通風口所在的牆面方向(N/S/E/W);
// 場景可在該牆面離地約 0.15~0.55m 處放通風口格柵(L.vents)
// ======================================================================
export const VENTS = [
  { level: 'B1', c: 23, r: 12, wall: 'N' }, { level: 'B1', c: 37, r: 26, wall: 'N' }, { level: 'B1', c: 11, r: 20, wall: 'E' },
  { level: '1F', c: 12, r: 12, wall: 'N' }, { level: '1F', c: 44, r: 26, wall: 'N' },
  { level: '2F', c: 24, r: 12, wall: 'N' }, { level: '2F', c: 44, r: 27, wall: 'S' },
  { level: '3F', c: 16, r: 13, wall: 'S' }, { level: '3F', c: 44, r: 12, wall: 'N' },
];

// ======================================================================
// 解析
// ======================================================================
const ARROWS = '^v<>';
export function parseLayout() {
  const levels = LEVELS.map((L, i) => ({ id: L.id, name: L.name || L.id, index: i, y: L.y, rows: L.rows, w: W, h: H }));
  const nL = levels.length;
  const idx = Object.fromEntries(levels.map((l) => [l.id, l.index]));
  const charAt = (li, c, r) => (li < 0 || li >= nL || c < 0 || r < 0 || c >= W || r >= H ? '#' : levels[li].rows[r][c]);
  const flagsAt = (li, c, r) => LEGEND[charAt(li, c, r)] ?? F.WALL;
  const hasFloor = (li, c, r) => { const ch = charAt(li, c, r); return ch !== '_' && ch !== 'o' && ch !== '%'; };
  const inBuilding = (c, r) => c >= BUILDING.c0 && c <= BUILDING.c1 && r >= BUILDING.r0 && r <= BUILDING.r1;
  // 頂層之上的屋頂:室內字元(或建築內的樓梯開口)才有屋頂
  const roofed = (c, r) => {
    const ch = charAt(nL - 1, c, r);
    if ('#.W+EZah$P~'.includes(ch)) return true;
    return ch === '%' && inBuilding(c, r);
  };
  // 該層某格上方第一個實心物(樓板底/屋頂底)的高度;露天回傳 Infinity
  const ceilY = (li, c, r) => {
    for (let lj = li + 1; lj < nL; lj++) if (hasFloor(lj, c, r)) return levels[lj].y - SLAB;
    return roofed(c, r) ? levels[nL - 1].y + LEVEL_H - SLAB : Infinity;
  };

  // 區域查表
  const zoneGrid = levels.map(() => new Int16Array(W * H).fill(-1));
  ZONES.forEach((z, zi) => {
    z.levelIndex = idx[z.level];
    for (const [c0, r0, c1, r1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) zoneGrid[z.levelIndex][r * W + c] = zi;
  });
  const zoneAt = (li, c, r) => {
    if (li < 0 || li >= nL || c < 0 || r < 0 || c >= W || r >= H) return null;
    const zi = zoneGrid[li][r * W + c];
    return zi >= 0 ? ZONES[zi] : null;
  };
  const styleAt = (li, c, r) => zoneAt(li, c, r) || LEVEL_DEFAULT[levels[li].id];
  // 地面材質(腳步聲、地板貼圖):草地/淺水優先,其餘看區域
  const surfaceAt = (li, c, r) => {
    const ch = charAt(li, c, r);
    if (ch === '"') return 'grass';
    if (ch === '~') return 'water';
    if (ARROWS.includes(ch)) return styleAt(li, c, r).theme === 'fire_escape' ? 'metal' : 'concrete';
    const f = styleAt(li, c, r).floor || 'concrete';
    if (/tile|terrazzo|linoleum|paving/.test(f)) return 'tile';
    if (/wood/.test(f)) return 'wood';
    if (/carpet|padded/.test(f)) return 'carpet';
    if (/metal/.test(f)) return 'metal';
    if (/grass/.test(f)) return 'grass';
    if (/gravel/.test(f)) return 'gravel';
    if (/asphalt/.test(f)) return 'asphalt';
    return 'concrete';
  };

  // 樓梯:每層箭頭字元的連通塊;dir 為上坡方向(^ 北 / v 南 / < 西 / > 東)
  const stairs = [];
  for (const L of levels) {
    const seen = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = L.rows[r][c];
      if (!ARROWS.includes(ch) || seen[r * W + c]) continue;
      let c0 = c, c1 = c, r0 = r, r1 = r;
      const q = [[c, r]];
      seen[r * W + c] = 1;
      while (q.length) {
        const [x, y] = q.pop();
        c0 = Math.min(c0, x); c1 = Math.max(c1, x); r0 = Math.min(r0, y); r1 = Math.max(r1, y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || L.rows[ny][nx] !== ch) continue;
          seen[ny * W + nx] = 1;
          q.push([nx, ny]);
        }
      }
      const up = levels[L.index + 1];
      const x0 = c0 * CELL, x1 = (c1 + 1) * CELL, z0 = r0 * CELL, z1 = (r1 + 1) * CELL;
      // 低端與高端所在的座標(沿上坡軸)
      const axis = ch === '^' || ch === 'v' ? 'z' : 'x';
      const lowAt = { '^': z1, v: z0, '<': x1, '>': x0 }[ch];
      const highAt = { '^': z0, v: z1, '<': x0, '>': x1 }[ch];
      stairs.push({
        id: `${L.id}_${c0}_${r0}`, lower: L.index, upper: up ? up.index : -1, c0, c1, r0, r1, dir: ch, axis,
        x0, x1, z0, z1, yLow: L.y, yHigh: up ? up.y : L.y + LEVEL_H, lowAt, highAt,
        zone: zoneAt(L.index, c0, r0)?.id || null,
      });
    }
  }
  // 樓梯坡面高度(在樓梯矩形內才有意義)
  const stairHeight = (s, x, z) => {
    const v = s.axis === 'z' ? z : x;
    const t = Math.max(0, Math.min(1, (v - s.lowAt) / (s.highAt - s.lowAt)));
    return s.yLow + (s.yHigh - s.yLow) * t;
  };

  // 特殊點
  const spawns = [], supplies = [];
  let start = null;
  const shopCells = [];
  for (const L of levels) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = L.rows[r][c];
    const p = { x: (c + 0.5) * CELL, y: L.y, z: (r + 0.5) * CELL, level: L.index, c, r };
    if (ch === 'Z' || ch === 'z') spawns.push({ ...p, outdoor: ch === 'z' });
    else if (ch === 'P') start = { ...p, yaw: 0 };
    else if (ch === '$') shopCells.push(p);
    else if (ch === 'a') supplies.push({ ...p, kind: 'ammo' });
    else if (ch === 'h') supplies.push({ ...p, kind: 'health' });
  }
  // 通風口(爬行者出生點,yaw = 爬出來時面向房內;殭屍朝向 atan2(x, z))
  const vents = [];
  for (const v of VENTS) {
    const li = idx[v.level];
    if (li === undefined || !(flagsAt(li, v.c, v.r) & F.WALK)) continue;
    const p = { x: (v.c + 0.5) * CELL, y: levels[li].y, z: (v.r + 0.5) * CELL, level: li, c: v.c, r: v.r, outdoor: false, vent: true, wall: v.wall, yaw: { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[v.wall] ?? 0 };
    vents.push(p);
    spawns.push(p);
  }
  // 商店櫃台:玩家站在櫃台北側(r-1),面向南
  const sx = shopCells.reduce((s, p) => s + p.x, 0) / shopCells.length;
  const sz = shopCells.reduce((s, p) => s + p.z, 0) / shopCells.length;
  const shop = { x: sx, y: shopCells[0].y, z: sz, level: shopCells[0].level, yaw: Math.PI, cells: shopCells, stand: { x: sx, z: sz - CELL } };

  const obstacles = OBSTACLES.map((o) => {
    const [c0, r0, c1, r1] = o.rect;
    const li = idx[o.level];
    return { ...o, levelIndex: li, x: ((c0 + c1 + 1) / 2) * CELL, z: ((r0 + r1 + 1) / 2) * CELL, y: levels[li].y, sx: (c1 - c0 + 1) * CELL, sz: (r1 - r0 + 1) * CELL };
  });

  const levelOfY = (y) => {
    let best = 0;
    for (const L of levels) if (y >= L.y - 0.5) best = L.index;
    return best;
  };

  return {
    CELL, LEVEL_H, SLAB, CEIL_H, W, H, F, LEGEND, BUILDING, WINDOW_SILL, WINDOW_TOP, RAIL_H,
    levels, stairs, zones: ZONES, moods: MOODS, levelDefault: LEVEL_DEFAULT, obstacles, spawns, vents, supplies, start, shop,
    charAt, flagsAt, hasFloor, ceilY, roofed, zoneAt, styleAt, surfaceAt, stairHeight, levelOfY, inBuilding,
    cellOf: (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)],
  };
}
