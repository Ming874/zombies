// 聖心醫院的劇情互動物件包(給互動引擎的擺放器使用)。
//
// 每一件物件都要回答三個問題:是誰的、為什麼在這裡、它指向什麼(STORY.md §1.11、§11)。
// 文字內容在 ../notes.js(NOTES)與 ../lines.js(PHONE、RADIO、TV、PA、TYPEWRITER、HIS);這裡只放 id。
//
// 物件格式:
//   { id: 'h.ix.…', kind, zone: 區域 id, mount: 'wall' | 'floor' | 'surface' | 'auto',
//     near: 'door' | 'corner' | 區域 id | null, why: 一句話(誰放的、為什麼), ...參數 }
// kind 與參數見互動引擎的清單;本包額外帶的欄位(keypad.power、circuit.initial、lock.outer)寫在 items_doc.extensions。
// 2F 沒有護理站區域:護理站的東西一律放在 f2_corridor,near: 'f2_ward_207'。
//
// 目標鏈(STORY_v2 §4.7、HOSPITAL_CLUES_v2 §5;步驟與區域解鎖在 src/story/objectives.js):
//   二、找到 207、查出 207 的門怎麼開:207 門口(hc.15)、2F 配電箱(hc.27)、讀卡面板。
//   三、恢復配電盤:三支保險絲(洗衣房、鍋爐房、太平間)→ B1 配電盤 → h.gen.on;門禁卡 → 3F 監控室;
//       密碼 0924(小美的入院日 1999/9/24,那年的中秋):HIS 輸入 207、值班日記第一行、金水伯/小美。
//   四、監控室鍵盤 0924 → h.207.unlock(或在 2F 護理站阿嬤的遺照前擲出聖筊,見 src/story/deduce.js)。
//   推理題 h.q 不是主線步驟:線索卡由 src/story/clues.js 對應(紙本的 points 'card:hc.xx')。

const B1_LIT = ['b1_tunnel', 'b1_morgue', 'b1_autopsy', 'b1_laundry', 'b1_boiler', 'b1_supply', 'b1_archive', 'b1_pump'];

const items = [
  // ================================================================== 劇情進度才開的區域(src/story/objectives.js 設旗標;鎖著的門導航繞過)
  // 三樓的門禁:配電盤恢復(h.gen.on)之後才有電;太平間:查出 207 的門怎麼開之後,清理隊的鎖才打得開。
  // (監控室自己的門禁卡鎖寫在後面,會蓋掉這一條,所以要排在它前面)
  // outer:連通往屋頂的外門也鎖(不然從逃生梯上屋頂就能走進三樓走廊)
  { id: 'h.lock.3f', kind: 'lock', zone: 'f3_corridor', door: 'f3_corridor', outer: true, item: null, flag: 'h.area.3f', text: '三樓 · 門鎖沒有電（先修好 B1 的配電盤）', unlockText: '',
    why: '大新的三樓門禁接在配電盤上；七月初一招魂燈第一次點亮時跳電，門全鎖著。' },
  { id: 'h.lock.morgue', kind: 'lock', zone: 'b1_morgue', door: 'b1_morgue', item: null, flag: 'h.area.morgue', text: '太平間 · 被大新清理隊鎖住了（先去二樓查 207 的門）', unlockText: '',
    why: '大新清理隊鎖了太平間（裡面有甦醒失敗的人）；工務的保險絲備品在 5 號冰櫃。' },
  // ================================================================== 目標鏈:H 檔案
  { id: 'h.ix.h01', kind: 'note', zone: 'f1_lobby', mount: 'floor', near: null, note: 'H01', style: 'paper',
    why: '大新在大廳發的回神傳單；喚醒之夜，家屬手上都拿著一張（hc.33）。' },
  { id: 'h.ix.h09', kind: 'pickup', zone: 'f1_lobby', mount: 'floor', near: null, note: 'H09',
    why: '一位家屬在大廳等了一整晚，七月初一 23:58 錄下語音備忘，手機掉在輪椅上。' },
  { id: 'h.ix.radio.lobby', kind: 'handradio', zone: 'f1_lobby', mount: 'floor', near: null, nearId: 'h.ix.h09', floor: true, dx: 0.62, variant: 'lobby', name: '手提收音機',
    why: '喚醒之夜一位家屬帶來的收音機，把手綁著紙條「爸，醒來的時候，聽你最愛的節目。」一直調在 AM 1207（REDESIGN §2.4.1）。' },
  { id: 'h.ix.h06', kind: 'note', zone: 'f1_waiting', mount: 'surface', near: null, note: 'H06', style: 'paper',
    why: '1F 門診護理站的印表機；七月初三跳電重開機後，把卡在佇列裡的 207 異動單印了出來。' },
  { id: 'h.ix.h04', kind: 'cassette', zone: 'f1_chapel', mount: 'surface', near: null, tape: 'H04',
    why: '禮拜堂錄音機裡的〈霧港夜話・1999/9/19〉；2003 年封院時護理人員在禮拜堂守夜，放的就是這捲（金水伯錄）。' },
  { id: 'h.ix.h08', kind: 'note', zone: 'b1_morgue', mount: 'wall', near: null, note: 'H08', style: 'clipboard',
    why: '大新清理隊七月初二的待處理名單，掛在冰櫃旁。' },
  { id: 'h.ix.h03', kind: 'drawer', zone: 'f2_ward_207', mount: 'surface', near: null, loot: { note: 'H03' },
    why: '207 的床頭櫃抽屜：小美 1999 年的工作證（hc.31）；旁邊一支停在 01:47 的女用電子錶（hc.41）。' },
  { id: 'h.ix.h07', kind: 'note', zone: 'f3_cell_1', mount: 'wall', near: 'door', note: 'H07', style: 'clipboard',
    why: '2003 年大新把隔離房 1 當成自己的護理站，觀察紀錄夾板掛在門口（hc.43）。' },
  { id: 'h.ix.h02', kind: 'drawer', zone: 'f3_dorm', mount: 'surface', near: null, loot: { note: 'H02' },
    why: '三樓宿舍的抽屜：阿嬤封院第 5 天寫給女兒的信（hc.42）。' },
  { id: 'h.ix.h05', kind: 'drawer', zone: 'f3_director', mount: 'wall', near: 'corner', loot: { note: 'H05' }, label: '院長室保險箱', code: '0924',
    why: '院長室保險箱，密碼是 207 的入院日 0924；王志明把 2003 年的聖心專案紀錄鎖在這裡（hc.06）。' },

  // ================================================================== 目標鏈:密碼 0924(調查幕)
  { id: 'h.ix.terminal', kind: 'terminal', zone: 'f1_waiting', mount: 'surface', near: null,
    why: '門診掛號櫃台的大新 HIS v4 終端；輸入 207 會看到入院日 1999/09/24（hc.10）。' },
  { id: 'h.ix.sticky0277', kind: 'note', zone: 'f1_waiting', mount: 'surface', near: null, note: 'h.s05', style: 'paper',
    why: '大新照護員貼在螢幕邊的便利貼。' },
  { id: 'h.ix.logbook', kind: 'logbook', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', note: 'h.s04',
    why: '2F 護理站的 207 進出登記（2003 封院期間）；23:55 之後沒有「出」（hc.04）。' },

  // ================================================================== 目標鏈:保險絲與發電機(解鎖幕)
  { id: 'h.ix.arrow', kind: 'note', zone: 'b1_tunnel', mount: 'wall', near: null, note: 'h.s01', style: 'paper',
    why: 'B1 電梯呼叫鈕旁的鉛筆字「↓ 冷　備品」：大新工務提醒自己保險絲備品放在太平間。' },
  { id: 'h.ix.slip', kind: 'pickup', zone: 'f2_corridor', mount: 'floor', near: null, note: 'h.s02',
    why: '電梯每次都回到 2 樓；大新工務的交接單被車廂帶到二樓電梯口（背面寫著保險絲的位置與冰櫃順序）。' },
  { id: 'h.ix.morgueboard', kind: 'note', zone: 'b1_morgue', mount: 'wall', near: null, note: 'h.s03', style: 'whiteboard',
    why: '大新清理隊的冰櫃使用登記：1、3、5 號是備品，2、4 號有人，6 號「預留：207 家屬」。' },
  { id: 'h.ix.morgue', kind: 'morgue', zone: 'b1_morgue', mount: 'wall', near: null, doors: 6, order: [3, 1, 5], loot: { item: 'fuse' }, wrong: 'crawler',
    why: '第三支保險絲在 5 號空冰櫃，交接單寫「三號、一號、五號，照這個順序拿」；拉到 2、4、6 號會放出裡面的人。' },
  { id: 'h.ix.fuse.laundry', kind: 'pickup', zone: 'b1_laundry', mount: 'floor', near: 'corner', item: 'fuse',
    why: '大新工務放在洗衣房烘衣機後面的保險絲備品。' },
  { id: 'h.ix.fuse.boiler', kind: 'locker', zone: 'b1_boiler', mount: 'wall', near: 'corner', loot: { item: 'fuse' }, label: '工務室備品',
    why: '鍋爐房工務室的備品櫃，夾在一堆燒壞的保險絲中間。' },
  { id: 'h.ix.notice.power', kind: 'note', zone: 'b1_boiler', mount: 'wall', near: null, note: 'h.s12', style: 'poster',
    why: '大新工務組七月初二貼的停電通知：七月初一招魂燈啟動時配電盤跳脫，列出三條供電迴路與備品位置。' },
  { id: 'h.ix.fusebox', kind: 'fusebox', zone: 'b1_boiler', mount: 'wall', near: null, slots: 3, item: 'fuse',
    circuits: [
      { id: 'h.pwr.207', label: '207 的燈（專用發電機）', zones: ['f2_ward_207'], initial: true },
      { id: 'h.pwr.monitor', label: '3F 監控室', zones: ['f3_monitor'] },
      { id: 'h.pwr.b1', label: 'B1 照明・電梯', zones: B1_LIT },
    ],
    capacity: 'fuses', onFull: { flag: 'h.gen.on' },
    why: 'B1 的配電盤。七月初一子時招魂燈第一次點亮的電湧燒斷了三支主保險絲；裝回去會很吵（觸發式誘集）。容量只夠兩條迴路時，要開監控室就得先關掉 207 的迴路，或先完成運油支線。' },
  { id: 'h.ix.oil', kind: 'pickup', zone: 'b1_boiler', mount: 'floor', near: 'corner', item: 'oil',
    why: '鍋爐房的柴油桶；北側後勤巷那台 207 專用發電機（2003 年解封後王醫師叫工務裝的）燒的就是這個（支線「207 的燈」）。' },
  { id: 'h.ix.lock.monitor', kind: 'lock', zone: 'f3_monitor', mount: 'wall', near: 'door', door: 'f3_monitor', item: 'card.security', flag: null, text: '監控室 · 要刷門禁卡（第 5 波的夜班組長身上有）',
    why: '大新保全管的監控室，要門禁卡；門禁卡在第 5 波首領「大新照護員　夜班組長」身上。' },
  { id: 'h.ix.keypad', kind: 'keypad', zone: 'f3_monitor', mount: 'wall', near: null, code: '0924', title: '3F 監控室 · 207 的電子鎖', sub: '提示：207 那位病人住院那天（月日，4 位數）', onSolve: { flag: 'h.207.elock' }, wrong: '密碼不對。', power: 'h.pwr.monitor',
    why: '207 的電子鎖由監控室控制；授權碼是「她來的那一天」：1999/9/24。鍵盤只解開電子鎖(h.207.elock);門內的旋鈕要等頭七(src/story/climax.js)。' },
  { id: 'h.ix.cctv', kind: 'cctv', zone: 'f3_monitor', mount: 'surface', near: null, power: 'h.pwr.monitor',
    why: '監控室主控台的錄影機，卡著封院第 7 天 CAM-07 的帶子（hc.05）。' },
  { id: 'h.ix.lock.207', kind: 'lock', zone: 'f2_ward_207', mount: 'wall', near: 'door', door: 'f2_ward_207', item: null, flag: 'h.207.unlock', text: '207 · 鎖住了（董事長下令，不准打開）', unlockText: '門外的電子鎖、門內的旋鈕，都開了。',
    why: '大新 2024 年在 207 門邊加裝的電子鎖（封存）；門玻璃內側是阿嬤封院第 7 天用口紅反寫的「莫開門」（hc.15）。' },

  // ================================================================== 2F 護理站(林秀英)
  { id: 'h.ix.memorial', kind: 'memorial', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207',
    why: '「問的地方」：阿嬤的遺照、乾掉的白色康乃馨、一副筊杯（2004 年金水伯放的）；王醫師下令不准動。看＝hc.13，筆記本填好之後按住 E 擲筊。' },
  { id: 'h.look.keys', kind: 'note', zone: 'f2_corridor', mount: 'wall', near: 'f2_ward_207', note: 'h.c16', style: 'poster',
    why: '護理站內牆的鑰匙板：207 的鉤子空著，「第 7 天護理長收」（hc.16）。' },
  { id: 'h.look.panel2f', kind: 'note', zone: 'f2_corridor', mount: 'wall', near: 'f2_ward_207', note: 'h.c27', style: 'clipboard',
    why: '2F 北側配電箱門上的工務紙條（hc.27）。' },
  { id: 'h.ix.pillow', kind: 'note', zone: 'f2_ward_207', mount: 'surface', near: null, note: 'H10', style: 'paper',
    why: '207 床上的枕頭裡，值班日記的最後一頁（hc.30；頭七的腳印指向它）。' },
  { id: 'h.ix.nursecall', kind: 'nursecall', zone: 'f2_corridor', mount: 'wall', near: 'f2_ward_207', room: '207',
    why: '護理站的呼叫面板；207 的叫人鈴一直被按住（留白：封院第 15 天清晨她按著叫人鈴走的）。' },
  { id: 'h.ix.phone.nurse', kind: 'phone', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', style: 'nurse', ext: '2F 護理站', calls: ['ph.n01', 'ph.n02', 'ph.n03', 'ph.n04'], ring: 'tension', special: null,
    why: '2F 護理站的電話；阿嬤（內線）與 2003 年的醫院廣播錄音。' },
  { id: 'h.ix.answering', kind: 'answering', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', message: 'ph.vm01',
    why: '護理站的答錄機，紅燈還在閃：封院第 9 天 21:14 女兒的留言（hc.18）。' },
  { id: 'h.ix.whiteboard', kind: 'note', zone: 'f2_corridor', mount: 'wall', near: 'f2_ward_207', note: 'h.s06', style: 'whiteboard',
    why: '2F 護理站白板，停在 2003 年封院第 7 天：「晚上廣播叫人，不要下樓」。' },
  { id: 'h.ix.handover4', kind: 'note', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', note: 'h.s23', style: 'clipboard',
    why: '阿嬤 2003 封院期間的值班日記（hc.07；第一行就是 207 的入院日）。' },
  { id: 'h.ix.internbook', kind: 'note', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_208', note: 'h.s07', style: 'paper',
    why: '2003 年護理站傳來傳去的閒話本（hc.11；置物櫃密碼的提示）。' },
  { id: 'h.ix.zhenglocker', kind: 'locker', zone: 'f2_corridor', mount: 'wall', near: 'f2_ward_208', loot: { note: 'h.s08' }, label: '護理長 林秀英', code: '2330',
    why: '護理長的置物櫃，密碼是大夜交班時間 23:30；裡面是沒有交出去的針扎通報單（hc.12）。' },
  { id: 'h.ix.tape1998', kind: 'cassette', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', tape: 'h.s09',
    why: '護理站收音機旁的錄音帶，阿嬤寫的側標「207 聽著心跳會加快」（hc.08）。' },
  { id: 'h.ix.radio.nurse', kind: 'handradio', zone: 'f2_corridor', mount: 'surface', near: 'f2_ward_207', nearId: 'h.ix.tape1998', dx: 0.34, variant: 'ama', name: '阿嬤的收音機',
    why: '阿嬤在護理站聽〈霧港夜話〉的那台；側面膠帶「霧港夜話（重播）　207 聽著心跳會加快　——林」。地下室燒壞手提收音機之後才拿得到（REDESIGN §2.4.8）。' },
  { id: 'h.ix.notice.ward', kind: 'note', zone: 'f2_ward_206', mount: 'wall', near: 'door', note: 'h.s24', style: 'poster',
    why: '病房門內的住院須知；第五條「夜間聽到敲門聲，請勿開門」是阿嬤封院第 8 天加的。' },
  { id: 'h.ix.switch203', kind: 'switch', zone: 'f2_ward_203', mount: 'wall', near: 'door', target: 'f2_ward_203',
    why: '203 的燈開關；牆上的「別開燈」是 203 病人的女兒寫的，開燈會讓她父親躁動。' },

  // ================================================================== B1 裝卸平台(2003 年金水伯送便當的地方)
  { id: 'h.ix.dock.note', kind: 'note', zone: 'b1_dock', mount: 'surface', near: null, note: 'h.c09', style: 'paper',
    why: '鐵網邊一個 2003 年便當箱後面，阿嬤沒有送出去的紙條（hc.09）。' },
  { id: 'h.ix.dock.list', kind: 'note', zone: 'b1_dock', mount: 'wall', near: null, note: 'h.c14', style: 'clipboard',
    why: '平台柱子上的夾板：金水商行 2003 年的便當單（hc.14）。' },
  { id: 'h.ix.phone.b12', kind: 'phone', zone: 'f1_er', mount: 'wall', near: null, style: 'wall', ext: 'B12', calls: ['ph.r01', 'ph.r04', 'ph.i01'], ring: 'tension', special: null,
    why: '急診的牆上電話（分機 B12）；大新的總機與內線雜音。' },
  { id: 'h.ix.b1poster', kind: 'note', zone: 'b1_stair_w', mount: 'wall', near: null, note: 'h.s10', style: 'poster',
    why: '一位夜班照護員七月初三貼在 B1 樓梯口告示板的紙條，把人指向裝卸平台。' },
  { id: 'h.ix.wanglocker', kind: 'locker', zone: 'b1_laundry', mount: 'wall', near: null, loot: 'random', label: '洗衣房',
    why: '洗衣房的一般置物櫃。' },
  { id: 'h.ix.flyer', kind: 'note', zone: 'f1_security', mount: 'wall', near: null, note: 'h.s13', style: 'poster',
    why: '保全室軟木板上的 207 守燈勤務表（大新保全，2024）。' },
  { id: 'h.ix.lulocker', kind: 'locker', zone: 'f1_security', mount: 'wall', near: 'corner', loot: 'random', label: '保全',
    why: '保全室的一般置物櫃。' },
  { id: 'h.ix.piano', kind: 'piano', zone: 'f1_lobby', mount: 'floor', near: null,
    why: '大廳的公益鋼琴（有自動演奏）；曲目卡在〈少女的祈禱〉：金水伯發財車的音樂。' },
  { id: 'h.look.lockdown', kind: 'note', zone: 'f1_lobby', mount: 'wall', near: null, note: 'h.c01', style: 'poster',
    why: '大廳布告欄上 2003 年的封院公告（hc.01）。' },

  // ================================================================== 支線:頂樓的物資箱(應變中心)
  { id: 'h.ix.radio.security', kind: 'radio', zone: 'f1_security', mount: 'surface', near: null, broadcasts: ['ra.drop', 'ra.emerg', 'ra.1206', 'ra.recovery', 'ra.hum'], label: '保全室',
    why: '保全室值班用的多頻收音機，收得到應變中心、正規電台與大新清理隊的頻道。' },
  { id: 'h.ix.tv.store', kind: 'tv', zone: 'f1_store', mount: 'wall', near: null, cards: ['tv.emerg', 'tv.nohosp', 'tv.drop', 'tv.night', 'tv.ad', 'tv.live'],
    why: '金水商行臨時補給點的電視，輪播市府跑馬燈與大新的廣告；偶爾被切成「大新 · 監視中」。' },
  { id: 'h.ix.crate', kind: 'locker', zone: 'f3_roof', mount: 'floor', near: null, loot: { ammo: true }, label: '應變中心物資箱', code: '0817',
    why: '應變中心投在頂樓北側水塔下的物資箱；密碼只在廣播念過。' },

  // ================================================================== 急診
  { id: 'h.ix.ernote', kind: 'note', zone: 'f1_er', mount: 'surface', near: null, note: 'h.s25', style: 'clipboard',
    why: '封院第 9 天阿嬤自行通報的疑似病例通報單（hc.17）。' },
  { id: 'h.ix.ercart', kind: 'medcab', zone: 'f1_er', mount: 'auto', near: null, loot: 'random', label: '急救車',
    why: '急診的急救車。' },

  // ================================================================== 禮拜堂與廣播機房
  { id: 'h.ix.tapebox', kind: 'note', zone: 'f1_chapel', mount: 'surface', near: null, note: 'h.s21', style: 'paper',
    why: '禮拜堂西端廣播機房桌上的 2003 年醫院廣播紀錄簿（hc.03）。' },
  { id: 'h.ix.radio.chapel', kind: 'radio', zone: 'f1_chapel', mount: 'surface', near: null, broadcasts: ['ra.1207a', 'ra.1207b', 'ra.1999'], label: '小美的節目',
    why: '禮拜堂的收音機，一直調在 AM 1207。' },
  { id: 'h.ix.candle', kind: 'candle', zone: 'f1_chapel', mount: 'surface', near: null,
    why: '禮拜堂的蠟燭；點一根記入怪談錄，沒有數值好處。' },
  { id: 'h.ix.pa', kind: 'pa', zone: 'f1_corridor', mount: 'wall', near: 'f1_chapel', lines: ['pa.echo', 'pa.override', 'pa.thanks', 'pa.2003'],
    why: '禮拜堂旁廣播機房的麥克風；大新的主機會用「家屬會面」廣播蓋過任何人的聲音。' },
  { id: 'h.ix.hymn', kind: 'cassette', zone: 'f1_corridor', mount: 'surface', near: 'f1_chapel', tape: 'h.s22',
    why: '廣播機房的錄音座，放著 2003 年聖心的修女們錄的聖詩備用帶（h.hymn.full）。' },
  { id: 'h.ix.fountain', kind: 'fountain', zone: 'f1_courtyard', mount: 'floor', near: null, coins: 7, note: 'h.s19',
    why: '乾涸噴水池的聖母像；丟滿七枚銅板，底座縫裡 2003 年一位修女的禱告字條才會露出來（只記入怪談錄）。' },

  // ================================================================== 停車場
  { id: 'h.ix.carradio', kind: 'carradio', zone: 'f1_parking', mount: 'auto', near: null, broadcasts: ['ra.1207a', 'ra.1207b'], label: '小美的節目',
    why: '喚醒之夜一位家屬停在停車場的車，收音機一直開著，調在 AM 1207。' },

  // ================================================================== 電話、廣播、電視、打字機
  { id: 'h.ix.payphone', kind: 'phone', zone: 'f1_lobby', mount: 'wall', near: null, style: 'pay', ext: null, calls: ['ph.p01', 'ph.p02', 'ph.p03', 'ph.p04'], ring: 'tension', special: null,
    why: '大廳的公共電話；市話早就斷了，只有大廳的人的聲音進得來。' },
  // 金水伯的對講機:掛在店門口外面的大廳牆上(捲門拉下時也接得到)
  { id: 'h.ix.phone.store', kind: 'phone', zone: 'f1_lobby', mount: 'wall', near: 'f1_store', style: 'wall', ext: '金水商行', calls: ['ph.shop01'], ring: 'flag:h.shop.open', special: null,
    why: '金水商行臨時補給點的對講機；金水伯每局第一次開店會打來（第 2 次以後由 src/story/deduce.js 播 hc.21）。' },
  { id: 'h.ix.phone.pharmacy', kind: 'phone', zone: 'f1_pharmacy', mount: 'surface', near: null, style: 'desk', ext: '藥局', calls: ['ph.r01', 'ph.r02', 'ph.r05'], ring: 'tension', special: null,
    why: '藥局的內線電話；大新的總機會自動撥進來放「家屬會面」廣播。' },
  { id: 'h.ix.phone.icu', kind: 'phone', zone: 'f2_icu', mount: 'surface', near: null, style: 'desk', ext: '加護病房', calls: ['ph.r06', 'ph.r07', 'ph.r04'], ring: 'tension', special: 'callback',
    why: '加護病房的內線；掛掉之後，阿嬤會從護理站打回來（PHONE.callback）。' },
  { id: 'h.ix.phone.secretary', kind: 'phone', zone: 'f3_secretary', mount: 'surface', near: null, style: 'desk', ext: '院長室', calls: [], ring: 'tension', special: null, // 王醫師整章只打一次(src/story/climax.js)
    why: '院長室秘書的電話；王志明用大新的網路打來（hc.20）。' },
  { id: 'h.ix.typewriter', kind: 'typewriter', zone: 'f3_secretary', mount: 'surface', near: null, lines: ['tw.v3', 'tw.loop', 'tw.burn', 'tw.001', 'tw.207', 'tw.recover'],
    why: '秘書室的電動打字機接在院內網路上當印表機；大新的主機一直把排程送過來。' },

  // ================================================================== 電梯
  { id: 'h.ix.elev.b1', kind: 'elevator', zone: 'b1_tunnel', mount: 'wall', near: null, why: '病床電梯的 B1 呼叫鈕；旁邊就是工務的鉛筆字。' },
  { id: 'h.ix.elev.f1', kind: 'elevator', zone: 'f1_corridor', mount: 'wall', near: null, why: '1F 電梯口；停用告示說「它會自己停在這一層」。' },
  { id: 'h.ix.elev.f2', kind: 'elevator', zone: 'f2_corridor', mount: 'wall', near: null, why: '2F 是消防返回樓層，電梯一跳電就回到這裡。' },
  { id: 'h.ix.lift.morgue', kind: 'lift', zone: 'b1_morgue', mount: 'wall', near: 'door', contents: 'sheet', label: '遺體專用',
    why: '太平間的遺體專用貨梯；清理隊用它把人送下來，車廂裡還有一張白布。' },

  // ================================================================== 彩蛋與小互動
  { id: 'h.ix.vending', kind: 'vending', zone: 'f1_waiting', mount: 'floor', near: 'corner', price: 5, heal: 5, perRound: 3,
    special: { chance: 0.033, note: 'h.s15', name: '冬瓜茶', label: '送二樓' },
    why: '候診區的販賣機，金水伯 2003 年以前替福利社補貨，留了一罐貼著「送二樓　護理長」的冬瓜茶。' },
  { id: 'h.ix.musicbox', kind: 'musicbox', zone: 'f2_nursery', mount: 'surface', near: null, note: 'h.s16',
    why: '金水伯 2001 年送給新生兒室的音樂盒，播走音的霧港夜話片頭曲（H-EV3）。' },
  { id: 'h.ix.mobile', kind: 'mobile', zone: 'f2_nursery', mount: 'surface', near: null,
    why: '嬰兒床的吊飾；新生兒室的通風還接在發電機上，吊飾被風吹動。這裡的孩子都平安離開了。' },
  { id: 'h.ix.drawing', kind: 'note', zone: 'f2_playroom', mount: 'wall', near: null, note: 'h.s17', style: 'drawing',
    why: '2003 封院時小兒病房的孩子畫的「護理長阿嬤講故事」。' },
  { id: 'h.ix.polaroid', kind: 'note', zone: 'f3_roof', mount: 'wall', near: null, note: 'h.s18', style: 'polaroid',
    why: '夾在頂樓水塔爬梯上的拍立得：封院第三天，四個戴口罩的護理師在頂樓透氣，左二是護理長。' },
  { id: 'h.ix.snack', kind: 'snack', zone: 'f3_monitor', mount: 'surface', near: null,
    why: '監控室電腦旁的綠色「聽話」零食，機房的老習慣；拿走它，監視器雜訊 10 秒。' },
  { id: 'h.ix.hearse', kind: 'note', zone: 'f1_alley', mount: 'auto', near: null, note: 'h.s20', style: 'paper',
    why: '北側後勤巷的靈車，後車廂的空棺木上貼著大新清理隊的運送單。' },

];

export default {
  id: 'hospital',
  items,

  // 本包讀寫的旗標(單局,game.story.flag;依 STORY.md 附錄 A,新增的標註「新」)
  flags: {
    'h.gen.on': 'B1 配電盤三顆保險絲都裝上（fusebox onFull）。啟動很吵，可提早叫來一波（§4.2）。',
    'h.pwr.207': '迴路：207 病房的燈。開局就亮（延長線從北側後勤巷發電機直接供電）；加急單容量只有 2 時，要開監控室就得先關掉它，或先完成運油支線。',
    'h.pwr.monitor': '迴路：3F 監控室。鍵盤 0924 與錄影機需要它（keypad.power / cctv.power）。',
    'h.pwr.b1': '迴路：B1 照明與電梯。',
    'h.207.unlock': '監控室鍵盤輸入 0924，或在阿嬤的遺照前擲出聖筊（src/story/deduce.js）：207 的電子鎖解除、門自己打開。',
    'h.light': '附錄 A：207 的燈的狀態（運油支線；R6 開始閃，R8 前沒加油就熄）。',
    'h.hymn.full': '附錄 A：R8 守住廣播機房 40 秒，聖詩播完。',
    'h.ev.pipes': '附錄 A（H-EV1）：B1 管線敲擊；分機 B12 的電話因此響起，開啟救援支線。',
    'h.ev.lift': '附錄 A（H-EV2）：電梯自己下來，車廂裡是 h.s02。',
    'h.ev.musicbox': '附錄 A（H-EV3）：音樂盒自己上了發條。',
    'h.ev.voicemail': '附錄 A（H-EV5）：答錄機紅燈在閃。',
    'h.ev.cctv': '附錄 A（H-EV7）：監控畫面裡 207 的燈下坐著一個人。',
    'h.shop.open': '新。補給站本局第一次開店；金水伯的電話響。',
    'ev.ho': '新。G-EV05 王醫師來電的觸發旗標；接聽結果寫入 ev.ho.answered 或 ev.ho.hungup（§4.6）。',
    'know.code0924': '跨局知識旗標（meta.know）：學過 0924 之後，保險箱與鍵盤每局都記得密碼。',
  },

  items_doc: {
    items: {
      fuse: '保險絲 ×3：B1 洗衣房（烘衣機後）、鍋爐房備品櫃、太平間 5 號冰櫃。裝進 B1 配電盤。',
      oil: '柴油桶：鍋爐房。扛到北側後勤巷的發電機（按住 E 4 秒，由劇情處理），維持 207 的燈（h.light）。',
      'card.security': '門禁卡：第 5 波首領「大新夜班組長　陳建宏」掉落，刷開 3F 監控室。',
    },
    codes: {
      '0924': '207 的入院日 1999/09/24（那年的中秋）：院長室保險箱、監控室 207 門禁。來源：HIS 輸入 207（hc.10）、值班日記第一行（hc.07）、金水伯／小美（hc.21、hc.25）。',
      '2330': '林秀英的置物櫃：大夜交班時間。來源：2F 白板最後一行、護理站的閒話本、HIS 輸入 2330。',
      '0817': '頂樓物資箱：應變中心的投放密碼。來源：保全室多頻收音機（ra.drop）；電視跑馬燈只給地點。',
    },
    chains: {
      objective_code: 'HIS「207」+ 值班日記第一行 + 金水伯／小美 → 監控室鍵盤 0924 → h.207.unlock → 207（或筆記本 → 擲筊 → 聖筊）',
      objective_power: '「↓ 冷」（B1 電梯鈕）+ 回收單背面（電梯）+ 冰櫃登記白板 → 太平間 3、1、5 → 保險絲；洗衣房、鍋爐房各一顆 → 配電盤 → h.gen.on',
      zheng: '2F 白板「大夜 23:30 交班」+ 閒話本 + HIS「2330」→ 護理長的置物櫃 2330 → 沒有交出去的針扎通報單（hc.12）',
      drop: '保全室多頻收音機念出 0817 + 電視跑馬燈「頂樓北側水塔下」→ 頂樓物資箱 → 彈藥',
    },
    extensions: {
      'keypad.power': '本包新增：鍵盤需要這條迴路的旗標才有電（監控室在 h.pwr.monitor 之前是黑的）。引擎不支援時可以忽略。',
      'circuit.initial': '本包新增：開局就通電的迴路（207 的燈）。',
      'lock.outer': '本包新增：連通往戶外（屋頂）的外門也一起鎖（src/interact/doors.js；場景 openings.js 讓這些門洞兩扇都在）。',
      'fusebox.capacity': 'capacity 寫 \'fuses\'；加急單以上請引擎改成 2（§5.2「加急條款」）。',
      'h.ix.slip': 'H-EV2 若由電梯事件放出回收單，請沿用 h.s02，不要另生一張。',
      H10: '207 號病歷正本由劇情在 R10 擊倒無名氏後放在 207 床墊底下（按住 E 2 秒），不在本包。',
    },
  },
};
