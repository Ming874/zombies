# 等天光 Before Daybreak · 製作與授權(CREDITS)

本專案只使用 **CC0(公眾領域)**、**CC-BY**、**MIT** 授權的外部素材(另有一個 **CC BY-SA 4.0** 的錄音,見「音效與配樂」),全部下載放在 `public/` 內(不使用外部連結)。
CC0 素材在法律上不需署名,以下仍逐一列出作者與來源致謝。各區的原始署名檔(`public/credits/<區域>.md`)與本檔內容相同,新增素材時兩邊都要更新。

## 程式與函式庫

- three.js — MIT License — https://threejs.org
- Vite — MIT License — https://vite.dev
- Rapier 物理引擎(@dimforge/rapier3d-compat)— Apache License 2.0 — https://rapier.rs
- ws(WebSocket 伺服器)— MIT License — https://github.com/websockets/ws
- meshoptimizer 解碼器(three.js 附帶的 meshopt_decoder)— MIT License — https://github.com/zeux/meshoptimizer
- 遊戲程式、關卡、介面、程式生成的模型/貼圖/音效:本專案原創

## 場景結構與材質(structure)

`public/textures/` 內的 PBR 貼圖皆為 CC0,已轉成 WebP,並把 AO/粗糙度打包成 orm.webp(R = AO、G = roughness)。

- **Poly Haven**(https://polyhaven.com,CC0):
  - `tile_ward` — [floor_tiles_06](https://polyhaven.com/a/floor_tiles_06),Rob Tuytel
  - `tile_lobby` — [worn_tile_floor](https://polyhaven.com/a/worn_tile_floor),Dimitrios Savva
  - `linoleum` — [painted_concrete](https://polyhaven.com/a/painted_concrete),Dario Barresi、Dimitrios Savva
  - `concrete` — [dirty_concrete](https://polyhaven.com/a/dirty_concrete),Rob Tuytel
  - `wood_floor` — [dark_wooden_planks](https://polyhaven.com/a/dark_wooden_planks),Amal Kumar
  - `stone` — [monastery_stone_floor](https://polyhaven.com/a/monastery_stone_floor),Amal Kumar
  - `asphalt` — [asphalt_02](https://polyhaven.com/a/asphalt_02),Rob Tuytel
  - `paving` — [large_grey_tiles](https://polyhaven.com/a/large_grey_tiles),Rob Tuytel
  - `gravel` — [gravel_stones](https://polyhaven.com/a/gravel_stones),Amal Kumar
  - `grass` — [grass_ground](https://polyhaven.com/a/grass_ground),Charlotte Baglioni
  - `roof_gravel` — [tarred_gravel](https://polyhaven.com/a/tarred_gravel),Dimitrios Savva
  - `paint_peeling` — [white_rough_plaster](https://polyhaven.com/a/white_rough_plaster),Rob Tuytel
  - `tile_wall` — [long_white_tiles](https://polyhaven.com/a/long_white_tiles),Jenelle van Heerden、Sergej Majboroda
  - `plaster` — [concrete_wall_003](https://polyhaven.com/a/concrete_wall_003),Dimitrios Savva、Rico Cilliers
  - `concrete_wall` — [concrete_layers](https://polyhaven.com/a/concrete_layers),Amal Kumar
  - `brick` — [castle_brick_02_red](https://polyhaven.com/a/castle_brick_02_red),Rob Tuytel
  - `stone_wall` — [stone_brick_wall_001](https://polyhaven.com/a/stone_brick_wall_001),Dimitrios Savva、Rico Cilliers
  - `wood_panel` — [wooden_panels](https://polyhaven.com/a/wooden_panels),Dimitrios Savva
  - `rust` — [rust_coarse_01](https://polyhaven.com/a/rust_coarse_01),Dimitrios Savva、Rico Cilliers
  - `wood_old` — [old_planks_02](https://polyhaven.com/a/old_planks_02),Rob Tuytel
  - `bark` — [bark_willow_02](https://polyhaven.com/a/bark_willow_02),Charlotte Baglioni
  - `dirt` — [brown_mud_02](https://polyhaven.com/a/brown_mud_02),Rob Tuytel
  - `cracks` — [cracked_concrete](https://polyhaven.com/a/cracked_concrete),Dimitrios Savva(由其衍生的裂縫貼花)
- **ambientCG**(https://ambientcg.com,CC0,作者 Lennart Demes):
  - `terrazzo` — [Terrazzo001](https://ambientcg.com/view?id=Terrazzo001)
  - `tile_white` — [Tiles141](https://ambientcg.com/view?id=Tiles141)
  - `concrete_wet` — [Concrete032](https://ambientcg.com/view?id=Concrete032)
  - `carpet` — [Fabric028](https://ambientcg.com/view?id=Fabric028)
  - `metal_grate` — [MetalWalkway001](https://ambientcg.com/view?id=MetalWalkway001)
  - `ceiling_tile` — [OfficeCeiling001](https://ambientcg.com/view?id=OfficeCeiling001)(顏色圖修改:泛黃 + 程式生成的水漬)
  - `metal_painted` — [PaintedMetal010](https://ambientcg.com/view?id=PaintedMetal010)
  - `steel` — [Metal009](https://ambientcg.com/view?id=Metal009)
  - `fabric` — [Fabric001](https://ambientcg.com/view?id=Fabric001)
  - `leather` — [Leather014](https://ambientcg.com/view?id=Leather014)
  - `cardboard` — [Cardboard003](https://ambientcg.com/view?id=Cardboard003)
  - `chainlink` — [Fence003](https://ambientcg.com/view?id=Fence003)
  - `grime_leak` — [Leaking003](https://ambientcg.com/view?id=Leaking003)
- 原創:`blood_splatter` 血跡貼花(本專案生成,CC0)
- 其餘牆面(壁紙、軟包牆、空心磚、兒童地墊、玻璃、百葉、窗簾、灌木)為程式生成。

## 室內道具(props-in)

病床、輪椅、點滴架、醫療設備、家具、雜物、海報與貼花等室內道具全部為程式生成(`src/map/props/indoor/**`),沒有使用外部素材。

## 戶外與工業道具(props-out)

所有 3D 模型皆為 CC0,放在 `public/models/props/<名稱>/`(glTF 2.0)。小型道具的貼圖由 1024 縮為 512(或 256),幾何未修改。

- `barrel_01`(油桶)— https://polyhaven.com/a/Barrel_01 — Jorge Camacho — CC0
- `trashbag`(垃圾袋)— https://polyhaven.com/a/trashbag — Benny Weimer — CC0
- `old_tyre`(舊輪胎)— https://polyhaven.com/a/old_tyre — MP — CC0
- `metal_trash_can`(鍍鋅垃圾桶)— https://polyhaven.com/a/metal_trash_can — GurJas Studios — CC0
- `covered_car`(蓋車罩的車)— https://polyhaven.com/a/covered_car — MP — CC0
- `gravestone_broken_slab`(斷裂墓碑)— https://opengameart.org/content/broken-stone-slab — Pavel Kutejnikov — CC0
- `gothic_statue`(哥德式雕像)— https://polyhaven.com/a/gothic_statue — Benny Weimer — CC0
- `rollershutter_door`(鐵捲門)— https://polyhaven.com/a/rollershutter_door — MP — CC0
- `industrial_wall_lamp`(工業壁燈)— https://polyhaven.com/a/industrial_wall_lamp — Kuutti Siitonen — CC0
- `portable_generator`(攜帶式發電機)— https://polyhaven.com/a/portable_generator — James Ray Cock — CC0
- 其餘車輛(轎車、掀背車、廂型車、警車、救護車、靈車)、雕像、發電機組、焚化爐、水塔、遊樂設施、墓碑、管線機械為程式生成;招牌、車牌、塗裝字樣、墓誌銘、血跡與污漬貼花在執行時以 Canvas 繪製。

## 商店、掉落物與介面(gameplay)

以下皆為 Poly Haven 的 CC0 模型(原始 1k glTF;部分貼圖以相同解析度重新壓縮為 JPEG q85,幾何未修改):

- 補給站收銀機 — `public/models/props/cashregister_01/` — https://polyhaven.com/a/CashRegister_01 — Joe Seabuhr
- 櫃台捲門(只使用貼圖,套在程式生成的可捲動幾何上)— `public/models/props/rollershutter_door/textures/` — https://polyhaven.com/a/rollershutter_door — MP
- 角落電視(緊急廣播)— `public/models/props/television_01/` — https://polyhaven.com/a/Television_01 — Gabriel Radić
- 補給終端機螢幕 — `public/models/props/television_02/` — https://polyhaven.com/a/television_02 — Benny Weimer
- 店內木製層架 — `public/models/props/shelf_01/` — https://polyhaven.com/a/Shelf_01 — Gabriel Radić
- 櫃台後方鐵架 — `public/models/props/worn_metal_rack/` — https://polyhaven.com/a/worn_metal_rack — Luca B
- 牆上時鐘(玻璃改用半透明)— `public/models/props/wall_clock/` — https://polyhaven.com/a/wall_clock — PierreB3D
- 其餘(商店貨架與商品、冰箱、霓虹招牌、武器展示牆、掉落的彈匣/彈藥箱/醫療包/手榴彈、補給櫃、介面圖示)為程式生成。

## 武器(weapons)

沒有使用外部素材,全部在執行時以程式生成:

- 槍枝模型(Glock 17、Colt Python、Remington 870、AKM、M4A1、Barrett M82A1)、戰術刀、M67 手榴彈、第一人稱雙手:`src/weapons/models.js`
- 木紋/金屬/點刻紋/布料/環境反射貼圖:`src/weapons/models.js`(Canvas 程序貼圖)
- 槍口火光:`src/weapons/flash.js`;煙霧、彈孔/焦痕/血跡貼花:`src/weapons/fx.js`;狙擊鏡米位線:`src/weapons/scope.js`

## 殭屍與角色

殭屍與倖存者的骨架、動畫與程式生成外觀(行屍、狂奔者、爬行者、膿腫者、巨屍與第三波新類型)在 `src/zombies/**`、`src/net/avatar.js`,為本專案原創。

**寫實殭屍模型(zombie-models)**:部分行屍/狂奔者變體使用 **Microsoft Rocketbox Avatar Library**(MIT License,Copyright (c) 2020 Microsoft,
https://github.com/microsoft/Microsoft-Rocketbox)的人物,經 `tools/zombies/build.mjs` 轉換骨架並把貼圖殭屍化後放在 `public/models/zombies/`:
Medical_Female_01(nurse)、Medical_Male_01(doctor)、Medical_Male_02(paramedic)、Security_Male_01(guard)、Construction_Male_07(worker)、
Male_Adult_08(man)、Male_Adult_03(oldman)、Female_Adult_08(woman)、Sports_Male_04(athlete)、Sports_Female_02(jogger)。
多人模式的倖存者角色(隊友看到的玩家)也是 Rocketbox 人物(健康外觀,`public/models/survivors/`):
Military_Male_02(soldier)、Medical_Female_03(medic)、Construction_Male_08(builder)、Female_Adult_12(hoodie)、Police_Male_06(police)、
Male_Adult_05(hunter)、Fire_Male_06(firefighter)、Female_Adult_04(biker)。
MIT 授權全文與每個角色的來源網址見 `public/credits/zombie-models.md`。

## 音效與配樂(audio)

音效與配樂以 WebAudio 即時程式合成(`src/audio/**`)為骨幹,並疊加 CC0 / CC BY / CC BY-SA 的錄音素材(`public/audio/`);錄音載入失敗時一律退回合成版本。
每個錄音檔的作者、來源網址、授權與剪輯紀錄見 `public/credits/audio.md`。

**台灣民謠與儀式聲的真人錄音**(`public/audio/folk/`;旋律只用公有領域的作品,《望春風》《雨夜花》只哼、只用樂器演奏,不唱詞):
- 阿嬤的哼唱:"Humming C D A for alexggqs" by drotzruhn(https://freesound.org/people/drotzruhn/sounds/439504/),CC0;吸氣聲取自 "Woman humming a nondescript tune" by PSsoundproject(https://commons.wikimedia.org/wiki/File:Woman_humming_a_nondescript_tune.wav),CC0。剪成單音取樣表、照簡譜重新演奏。
- 孩子的哼唱:"Child Chops, Glitchy Sampler, Dry" by f-r-a-g-i-l-e(https://freesound.org/people/f-r-a-g-i-l-e/sounds/500743/),CC0。剪成單音取樣表、照簡譜重新演奏。
- 助念(太平間、納骨堂、禮拜堂):Wu, Tsan-Cheng 吳燦政,"Mengjia Longshan Temple, Taipei - Chanting"(2013)與 "Mengjia Longshan Temple - Chant Buddhist scriptures"(2012,https://archive.org/details/aporee_15924_18493),radio aporee ::: maps(https://aporee.org/maps/),CC BY 3.0(https://creativecommons.org/licenses/by/3.0/);"buddhist-2.wav" by xserra(https://freesound.org/s/320270/),CC BY 4.0(https://creativecommons.org/licenses/by/4.0/)。各取約 20 秒做成無縫循環。
- 戶外遠處的北管:〈什牌・倒旗〉,《內行與子弟:林阿春與賴木松的北管亂彈藝術世界》,彰化縣文化局(1999),創作者 范揚坤,嗩吶 邱火榮、鄭榮興,北鼓 賴木松;國家文化記憶庫(https://tcmb.culture.tw/zh-tw/detail?indexCode=Culture_Media&id=697685),CC BY 3.0 TW(https://creativecommons.org/licenses/by/3.0/tw/)。取三個樂句。
- 收音機裡的老唱片:林茂賢老師示範演唱〈豐原調〉,臺中市政府文化局,國家文化記憶庫(https://tcmb.culture.tw/zh-tw/detail?indexCode=Culture_Media&id=666001),CC0。只留唱的段落。
- 育嬰區錄音帶裡的〈天黑黑〉:"Thinn-oo-oo.mp3" by Tè Khái-sū(Kaihsu Tai),Wikimedia Commons(https://commons.wikimedia.org/wiki/File:Thinn-oo-oo.mp3),**CC BY-SA 4.0**(https://creativecommons.org/licenses/by-sa/4.0/)。剪輯過的檔案 `audio/folk/tape_thinn_oo_oo.mp3` 依相同方式分享條款,**同樣以 CC BY-SA 4.0 釋出**(只及於這個音檔)。

## 物理、效能與連線

物理(Rapier)、效能管理、Service Worker、連線伺服器與大廳皆為程式碼,沒有額外素材。
