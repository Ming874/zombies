import { railType } from '../map/hospital/openings.js';

// 碰撞形狀 = 看到的形狀(場景建好、導航建立之前呼叫一次 applyTruth):
//  1. '=' 欄杆/矮牆:依實際造型設定實心高度(女兒牆/挑空欄牆 1.12、櫃台 1.07、鏤空鐵欄杆 0 = 子彈與視線從欄杆間穿過);
//     大階梯旁的石材欄牆頂部跟著樓梯坡度升高 → 1.1m 以上的部分補切片碰撞盒(以前子彈會從看得到的牆裡穿過去)
//  2. 道具碰撞盒:依來源模板/建構器標記材質(b.pm 穿透類別、b.mat 彈著效果),
//     床/長椅/輪椅/推床等「盒子比實體高」的模板改成真正的實心高度(床墊面),上下舖拆成上下兩塊
// 射線(子彈、視線、爆炸遮蔽、手榴彈)、玩家移動/翻越、殭屍翻越與導航都讀同一組碰撞盒,所以一次修正全部一致。

// 穿透類別:pc = 每公尺的穿透成本(與武器穿透力比較;Infinity = 一定擋住),fx = 彈著效果材質(weapons/fx.js)
export const MATS = {
  fabric: { pc: 0.05, fx: 'fabric' }, // 帳篷布、隔簾、床單
  soft: { pc: 0.45, fx: 'fabric' }, // 沙發、床墊堆、紙箱
  mesh: { pc: 0, fx: 'metal' }, // 鐵網、骨架(輪椅、雙槓、工地圍籬):幾乎都是空的
  glass: { pc: 0.15, fx: 'glass' },
  plastic: { pc: 0.8, fx: 'tile' },
  wood: { pc: 1.6, fx: 'wood' }, // 家具(有空腔的木櫃/桌)
  metal: { pc: 2.0, fx: 'metal' }, // 鐵皮櫃、推車、病床
  car: { pc: 0.9, fx: 'metal' }, // 車門/車身鈑金(中間是空的車廂)
  heavy: { pc: 8, fx: 'metal' }, // 機器、保險箱、消防栓、鉛屏
  log: { pc: 6, fx: 'wood' }, // 樹幹
  concrete: { pc: Infinity, fx: 'concrete' },
  stone: { pc: Infinity, fx: 'concrete' },
  brick: { pc: Infinity, fx: 'brick' },
  sand: { pc: Infinity, fx: 'dirt' },
};

// 室內模板名稱(冒號前)→ 穿透類別
const TAG_MAT = {};
const put = (cls, names) => { for (const n of names.split(' ')) TAG_MAT[n] = cls; };
put('metal', 'bed kidbed ironbed fixedbed bunk gurney mtrolley filecab lockers rack scart filecart o2cart moncart crash anesth mayo backtable xraytable xraycon bucky incubator warmer drugdrawers steam cooler dbrack ladder delivbed optable autopsy autopsybody traytrolley linencart hscale babyscale printerstand magrack triageSign dirstand coatrack tstairs console monwall monwall2 keycab overbed tvwall cellcam pc printer crtmon headwall sinkwall pumps cpr injector bin janitor drum extinguisher firehose nightstand desksteel ctrldesk candelabra votive surglight lightbox lectern chairoffice chairshell stool');
put('heavy', 'safe morguewall leadscreen xraytube ctgantry washer ironer medfridge');
put('mesh', 'wc pbars walker iv');
put('glass', 'glasscab ctrlwin obswin specimen');
put('soft', 'sofa mattress_lean linenpile linenstack sheet blanket cbox boxrow ctcouch playmat gymball teddy doll bodysheet sjacket curtain ercurt icucurt plant rug');
put('wood', 'bench pew tablelong lowtable kidtable bookcase wardrobe altar plinth counter infodesk pharmdesk pallet deskexec washstand globe rockchair changing bassinet stepstool beam kneeler easel rockhorse queuebox boards chairwood kidchair cork leatherchair');
put('stone', 'mary bigplanter');

// 盒子比實體高的模板:真正的實心頂(相對盒底,公尺)。床頭板/床尾板/側欄、輪椅推把、長椅椅背都是細管或薄板(子彈可穿、站上床墊後可跨過)
const TRUE_H = { bed: 0.72, kidbed: 0.58, ironbed: 0.58, bunk: 0.52, bench: 0.47, wc: 0.7, mtrolley: 0.9, filecart: 0.8, tstairs: 0.62, steam: 0.9 };

// '=' 各造型的實心高度(與 hospital/openings.js buildRails 的造型一致:牆 + 7cm 壓頂)
const RAIL_TOP = { parapet: 1.12, gallery: 1.12, counter: 1.07, stair_bal: 1.05, rail_metal: 0 };

export function matOf(b) {
  return MATS[b.pm] || null;
}

// world:World;hospital:buildHospital() 的回傳(灰盒場景沒有 K,只做道具材質)
export function applyTruth(world, hospital) {
  const t0 = performance.now();
  const L = world.layout, K = hospital && hospital.K;
  const out = { rails: 0, bal: 0, boxes: 0, fixed: 0 };
  // ---- 1. 欄杆/矮牆 ----
  if (K && K.L) {
    const types = (world.railType = new Map()); // `${li},${c},${r}` → 造型(翻越判定用)
    world.setRailHeights((li, c, r) => {
      const t = railType(K, li, c, r);
      types.set(`${li},${c},${r}`, t);
      out.rails++;
      return RAIL_TOP[t] ?? L.RAIL_H;
    });
    // 大階梯欄牆:頂部 = 樓梯坡面 + 1m(上限天花板);1.05m 以上的部分沿 z 切 4 片補碰撞盒
    for (const [k, t] of types) {
      if (t !== 'stair_bal') continue;
      const [li, c, r] = k.split(',').map(Number), y = L.levels[li].y;
      let st = null;
      for (const s of L.stairs) if (s.lower === li && c >= s.c0 - 1 && c <= s.c1 + 1 && r >= s.r0 && r <= s.r1) st = s;
      if (!st) continue;
      const ceilH = Math.min(L.LEVEL_H, L.ceilY(li, c, r) - y);
      const topAt = (z) => Math.max(1.05, Math.min(ceilH, L.stairHeight(st, (st.x0 + st.x1) / 2, z) - y + 1.0));
      for (let i = 0; i < 4; i++) {
        const za = r * 2 + i * 0.5, zb = za + 0.5, h = Math.max(topAt(za), topAt(zb));
        if (h <= 1.06) continue;
        const b = world.addBox(c * 2 + 1, (za + zb) / 2, 2, 0.5, h - 1.05, y + 1.05);
        b.pm = 'stone'; b.mat = 'concrete'; b.tag = 'stair_bal';
        out.bal++;
      }
    }
  }
  // ---- 2. 道具碰撞盒:材質 + 真實高度 ----
  const extra = [];
  for (const b of world.boxes) {
    out.boxes++;
    if (b.pm) continue;
    let cls = null;
    if (b.mat && MATS[b.mat]) cls = b.mat; // 室外建構器直接給類別
    const tag = b.tag ? b.tag.split(/[:#@]/)[0] : null;
    if (!cls && tag) cls = TAG_MAT[tag] || 'wood';
    if (!cls) continue; // 沒有標記:維持原樣(擋子彈)
    b.pm = cls;
    b.mat = MATS[cls].fx;
    const th = tag ? TRUE_H[tag] : 0;
    if (th && b.height > th + 0.04) {
      if (tag === 'bunk') extra.push([b, 1.28, 1.55]); // 上舖(床架 + 床墊)
      setTop(b, b.y0 + th);
      out.fixed++;
    }
  }
  for (const [b, y0, y1] of extra) {
    const u = world.addBox((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxZ - b.minZ, y1 - y0, b.y0 + y0);
    u.pm = b.pm; u.mat = b.mat; u.tag = b.tag;
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

function setTop(b, top) {
  b.maxY = top;
  b.height = top - b.y0;
}
