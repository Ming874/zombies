// 靈異文字表(全部遊戲內文字集中在這裡,方便劇情組一次校稿;邏輯檔不寫死字串)。
// 正典:《回神》劇情聖經 STORY.md(§1.9 鬼與屍、§1.10 聲音來源、§2.10 有名字的亡者、§5.8 鬼的耳語與電話、§5.9 牆上的字、§11 文字一致性守則)。
// 原則:超自然一律「留白」,不證實也不嘲笑;怪物的來源是病原與人。鬼的聲音可能是真的,也可能不是(遊戲從不回答)。
// 鬼的硬規則(§1.9、§11.5):只在靜默期(回合之間)出現;不說謊;只知道自己死前的事;一句話以內;
// 字幕標籤：阿嬤（zheng）從第一句起就顯示「阿嬤」；其他鬼一律「？？？」。
// 沒有兒童死亡:孩子只以聲音、字跡出現,而且都活著離開了。不提真實災難;宗教場所與神職人員只寫成庇護與人情;不使用「疫苗／接種」；「封院」保留，第一次出現時解釋一次（CLARITY_PLAN §4）。
//
// LINES 欄位(耳邊低語、電話、收音機):
//   id      唯一 id(每局不重複使用)
//   canon   STORY.md 的編號(例:'5.8#1' = §5.8 耳語表第 1 句)
//   text    字幕原文(全形標點;「……」= 停頓/吸氣;{暱稱} 換成玩家暱稱)
//   ghost   有名字的亡者 id(見 GHOSTS;字幕認出後顯示名字,沒有 = 永遠「？？？」)
//   who     說話的是誰(劇中設定;玩家不一定知道)
//   why     為什麼這樣說(對應的劇情事實)
//   when    時間軸(這句話「屬於」哪個時間點;鬼只知道自己死前的事)
//   trig    觸發:zone(第一次進某區)| lowhp | dark(在暗處站著不動)| streak(連殺之後)| prop(靠近道具,配 prop)|
//           phone(接起電話)| radio(收音機自己開)| warn(宿主從看不到的方向接近,ear = 他的方向)| guide(引導)| idle(探索時)|
//           cue(配合某個事件,配 cue)| medkit(用急救包時)| script(只由劇情/互動代理用 id 呼叫)
//   zone    區域 id 或主題(陣列;省略 = 任何地方)
//   prop    道具錨點種類(trig 'prop')
//   cue     事件種類(trig 'cue' / 'guide')
//   prog    [最早回合, 最晚回合](省略 = 不限)
//   phase   'rest' = 只在回合間休息時
//   ear     'left' | 'right' | 'behind' | 'both' | 'auto'(省略 = auto:依情境挑)
//   filter  'phone' | 'radio'(省略 = 無)
//   mode    'syllabic'(一字一音)| 'murmur'(聽不清的喃喃)
//   hint    這句話同時是提示:引導玩家去哪裡/怕什麼(shop、egg:*、quest:*、rule:*、warn)

// 有名字的亡者(STORY.md §2.10;本圖只有林秀英有名字)
export const GHOSTS = {
  zheng: { name: '阿嬤', who: '林秀英(阿嬤):2003/5/13 清晨死在 207 的陪病椅上,死亡證明寫 SARS' },
  lobby: { name: null, who: '大廳的人:七月初一喚醒之夜來接家人的家屬' },
  caller: { name: null, who: '叫名字的人(永遠的未解)' },
};

export const LINES = [
  // ---------- 正典 §5.8:鬼的耳語 ----------
  { id: 'h.w01', canon: '5.8#1', text: '幾床？', ghost: 'zheng', who: '林秀英', why: '她還在巡房:問你是哪一床的家屬', when: '七月十一之後', trig: 'zone', zone: ['f2_corridor'], ear: 'left' },
  { id: 'h.w02', canon: '5.8#2', text: '燈不要關……她怕黑。', ghost: 'zheng', who: '林秀英', why: '207 的燈接在發電機上,是2003 年的修女託付她的', when: '七月初三之後', trig: 'script', ear: 'right', hint: 'quest:207light' },
  { id: 'h.w03', canon: '5.8#3', text: '23:47……阿嬤一直記得。', ghost: 'zheng', who: '林秀英', why: '二十五年來每個星期日金水伯都來看 207;封鎖之後他來不了(翻探病登記簿時,由互動代理呼叫)', when: '七月十一之前', trig: 'script', ear: 'right' },
  { id: 'h.w04', canon: '5.8#4', text: '她在這裡睡了四年。\n……沒有人知道她叫什麼名字。', ghost: 'zheng', who: '林秀英', why: '207 號病歷正本一直在 207 的床墊底下(調查幕,由劇情代理呼叫)', when: '2025/02/27 之後', trig: 'script', ear: 'left', hint: 'quest:chart' },
  { id: 'h.w05', canon: '5.8#5', text: '是她住進來的那一天。', ghost: 'zheng', who: '林秀英', why: '院長室保險箱的密碼是 0924:小美入院那一天', when: '1999/9/24', trig: 'zone', zone: ['f3_monitor'], ear: 'right', hint: 'egg:safe' },
  { id: 'h.w06', canon: '5.8#6', text: '金水……每天晚上都在這裡送便當。', ghost: 'zheng', who: '林秀英', why: '實習護理師林大新工務躲在地下室;她死前知道大新工務還在那裡', when: '七月初六~十一', trig: 'zone', zone: ['b1_dock'], ear: 'left' },
  { id: 'h.w07', canon: '5.8#7', text: '那支針……阿嬤知道是什麼。', ghost: 'zheng', who: '林秀英', why: '她懷疑「回神居家急救包」就是回神', when: '七月', trig: 'medkit', ear: 'right' },
  { id: 'h.w08', canon: '5.8#8', text: '他醒了嗎？', ghost: 'lobby', who: '大廳的人', why: '緊急疏散公告說「由大新生技專車統一後送」,專車從來沒有來', when: '七月初三', trig: 'zone', zone: ['f1_lobby'], ear: 'left' },
  { id: 'h.w09', canon: '5.8#9', text: '廣播說，他們回來了……', ghost: 'lobby', who: '大廳的人', why: '集合廣播的內容;正門在誘集之後被焊死', when: '七月初三', trig: 'zone', zone: ['f1_lobby'], prog: [3], ear: 'right', hint: 'rule:pa' },
  { id: 'h.w10', canon: '5.8#10', text: '我媽還在三樓。', ghost: 'lobby', who: '大廳的人', why: '三樓是大新的臨床試驗病房,家屬被擋在大廳(噴水池)', when: '七月初三', trig: 'prop', prop: ['statue_mary'], ear: 'left' },
  { id: 'h.w11', canon: '5.8#11', text: '{暱稱}……', ghost: 'caller', who: '叫名字的人', why: '永遠的未解:霧裡叫名字的是誰(頂樓水塔)', when: '不明', trig: 'zone', zone: ['f3_roof'], ear: 'right' },
  { id: 'h.w12', canon: '5.8#12', text: '免驚，免驚。阿孫，回神喔。', ghost: 'zheng', who: '林秀英(送走時)', why: '遺照前收驚(按住 E 5 秒)時;收驚的叫法', when: '現在', trig: 'script', ear: 'both' },

  // ---------- 第一次進入某區(補充;說話的都是正典裡的人或沒有名字的亡者) ----------
  { id: 'z.lobby.1', text: '……大家都在這裡等。你也是來接家人的嗎？', ghost: 'lobby', who: '大廳的人', why: '七月初三醫院廣播叫所有人到大廳集合;地上只剩包包與拖鞋', when: '七月初三', trig: 'zone', zone: ['f1_lobby'], prog: [5] },
  { id: 'z.corr1', text: '那個廣播……不要過去。', ghost: 'lobby', who: '大廳的人', why: '1F 主走廊就是那晚大家走去大廳的路;林秀英隔天清晨在這裡寫了「不要相信廣播」', when: '七月初三', trig: 'zone', zone: ['f1_corridor'], hint: 'rule:pa' },
  { id: 'z.waiting', text: '叫號了嗎……我等好久了。', ghost: 'lobby', who: '候診區的人(亡者)', why: '叫號機停在七月初三的號碼', when: '七月初三', trig: 'zone', zone: ['f1_waiting'] },
  { id: 'z.er', text: '先看我……我排第幾號？', who: '急診的人(亡者)', why: '急診的檢傷卡散落一地;正門焊死後家屬逃進急診', when: '七月初三', trig: 'zone', zone: ['f1_er'] },
  { id: 'z.chapel', text: '……幫我點一根蠟燭，好不好？', who: '禮拜堂的人(亡者)', why: '2003 年的修女的習慣:有人在等,就點一根蠟燭;結局會記得你點了幾根', when: '現在', trig: 'zone', zone: ['f1_chapel'], hint: 'egg:candle' },
  { id: 'z.207.2', text: '這張椅子……阿嬤坐了十四個晚上。', ghost: 'zheng', who: '林秀英', why: '監控畫面裡,207 的床空著的時候燈下還坐著一個人:她死在 207 的陪病椅上', when: '七月十一', trig: 'zone', zone: ['f2_ward_207'], prog: [4] },
  { id: 'z.nursery', text: '一、二、三……數到十，就不怕了。', who: '小兒科護理師的聲音(留白:她哄孩子躲著不要出聲;孩子們都活著離開了)', why: '新生兒室牆上「數到十就好了」;句子來自小美的節目', when: '七月初三夜', trig: 'zone', zone: ['f2_nursery'] },
  { id: 'z.nursery.box', text: '音樂盒……要上發條才會唱。', who: '小兒科護理師的聲音(留白)', why: '新生兒室的音樂盒,盒底刻著「2001 金水 贈」', when: '七月初三之前', trig: 'zone', zone: ['f2_nursery'], prog: [3], hint: 'egg:musicbox' },
  { id: 'z.playroom', text: '孩子都睡了……阿嬤明天再來講故事。', ghost: 'zheng', who: '孩子的聲音(留白:遊戲室的孩子都被2003 年的修女帶到廟口,活著)', why: '001 醒來後偷偷下樓講故事;遊戲室有那張蠟筆畫', when: '2025 年春天', trig: 'zone', zone: ['f2_playroom', 'f2_peds'] },
  { id: 'z.icu', text: '機器一直叫……都沒有人過來。', who: '加護病房的病人(亡者)', why: '加護病房被改成回神的第二病房;機器的聲音會把宿主叫來', when: '七月初二', trig: 'zone', zone: ['f2_icu'], hint: 'rule:sound' },
  { id: 'z.morgue.1', text: '抽屜好冷。……你的是幾號？', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '回收清冊上有你的編號「預約中」', when: '七月下旬', trig: 'zone', zone: ['b1_morgue'] },
  { id: 'z.morgue.2', text: '我在裡面敲了好久……都沒有人開。', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '抽屜會從裡面被敲;一位母親在這裡寫了「他還在裡面」', when: '七月十八之前', trig: 'zone', zone: ['b1_morgue'], prog: [3] },
  { id: 'z.archive', text: '207 的病歷……王醫師借走，一直沒還。', ghost: 'zheng', who: '林秀英', why: '2025/02/27 床位異動:207 的病歷被抽走,對外維持「207 在院」', when: '2025/02/27', trig: 'zone', zone: ['b1_archive'], prog: [2] },
  { id: 'z.tunnel', text: '這條路通到哪裡？……我想回家。', who: '一位沒有被叫到名字的長輩(亡者)', why: '想回家(台語:這條路通到哪裡?我要回去)', when: '七月', trig: 'zone', zone: ['b1_tunnel'] },
  { id: 'z.boiler', text: '紅色的插頭……不要拔。', ghost: 'zheng', who: '林秀英', why: '工務室停電通知:207 的燈和監控室搶同一台發電機,油桶在鍋爐房', when: '七月初二起', trig: 'zone', zone: ['f2_corridor'], hint: 'quest:207light' },
  { id: 'z.3f', text: '三樓……你還是上來了。', who: '三樓的病人(亡者)', why: '2F 東樓梯牆上寫著「三樓不要上去」(保全組長大新照護員)', when: '七月初二之後', trig: 'zone', zone: ['f3_corridor'] },
  { id: 'z.cell', text: '三樓的事……他們不讓護理長問。', who: '試驗病房的病人(亡者)', why: '隔離房 1 的牆上刻著日子:001 用刻痕數日子', when: '2025/02~03', trig: 'zone', zone: ['psych_cell'] },
  { id: 'z.cell.song', text: '收音機開著，伊的心就較定。', who: '試驗病房的病人(亡者)', why: '熟悉的人聲會讓宿主暫時安靜', when: '2025 年春天', trig: 'off', zone: ['psych_cell'], prog: [4], hint: 'rule:voice' },
  { id: 'z.dorm', text: '阿嬤在這裡睡了六個晚上。\n第七晚，就沒有再上來了。', ghost: 'zheng', who: '林秀英', why: '2003 年的修女在答錄機裡說:「207 的燈,拜託妳。不要讓它熄。」', when: '七月初三', trig: 'zone', zone: ['f3_dorm'] },
  { id: 'z.cemetery', text: '七月了……門開了，我們回來看看。', who: '舊墓園的人(亡者)', why: '農曆七月鬼門開(民俗)', when: '七月', trig: 'zone', zone: ['f1_cemetery'] },
  { id: 'z.laundry', text: '床單洗好了……要拿去哪一床？', who: '洗衣房的人(亡者)', why: '洗衣房的排班表停在七月初三', when: '七月初三', trig: 'zone', zone: ['b1_laundry'] },

  // ---------- 低血量(只在靜默期) ----------
  { id: 'hp.1', text: '阿孫……不要睡，快回來。', ghost: 'zheng', who: '不明(亡者)', why: '每一次回收都是一次回神劑量;你也在改變', when: '現在', trig: 'lowhp' },
  { id: 'hp.2', text: '怕的時候，數到十。', who: '不明(亡者;這句話護理站每個人都會背)', why: '「霧港夜話」的結尾語;207 放了二十五年的錄音帶', when: '現在', trig: 'lowhp', hint: 'rule:voice' },
  { id: 'hp.3', text: '躺下來……這裡很安靜。', ghost: 'lobby', who: '大廳的人', why: '倒下的人都躺在大廳', when: '七月初三', trig: 'lowhp' },
  { id: 'hp.4', text: '倒下了，阿嬤也會叫你回來。', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '生命徵象中斷時,大新清理隊會把你撿回去', when: '現在', trig: 'lowhp', prog: [2] },
  { id: 'hp.shop', text: '金水伯的店開著……快去。', who: '不明(亡者)', why: '休息時金水商行補給站開放', when: '現在', trig: 'lowhp', phase: 'rest', hint: 'shop' },

  // ---------- 暗處站著不動 ----------
  { id: 'dk.1', text: '你看不到我……我看得到你。', who: '不明(亡者)', why: '留白', when: '現在', trig: 'dark' },
  { id: 'dk.2', text: '別開燈……他們會醒。', who: '203 病人的女兒(亡者?留白)', why: '世界規則:強光讓剛轉化的人躁動;203 號房牆上的「別開燈」是她寫的', when: '七月初三', trig: 'off', hint: 'rule:light' },
  { id: 'dk.3', text: '好黑……你小時候最怕黑。', ghost: 'zheng', who: '林秀英', why: '小美怕黑,所以 207 的燈從不關', when: '現在', trig: 'dark' },
  { id: 'dk.4', text: '我就站在你後面。', who: '不明(亡者)', why: '留白', when: '現在', trig: 'dark', ear: 'behind' },
  { id: 'dk.5', text: '噓……他們聽得到。', who: '不明(亡者)', why: '世界規則「他們聽得到」', when: '現在', trig: 'dark', hint: 'rule:sound' },

  // ---------- 連殺之後(戰鬥結束後的靜默) ----------
  { id: 'st.1', text: '他們以前……也是病人。', ghost: 'zheng', who: '林秀英', why: '感染者穿著生前的病人服、拖鞋', when: '現在', trig: 'streak' },
  { id: 'st.2', text: '那是我爸……他只是想回家。', ghost: 'lobby', who: '林秀英', why: '宿主會走回生前熟悉的地方', when: '七月十一之前', trig: 'streak' },
  { id: 'st.3', text: '謝謝你……讓他們休息。', who: '不明(亡者)', why: '主題「放手」', when: '現在', trig: 'streak', prog: [3] },
  { id: 'st.5', text: '輕一點……他們會痛。', ghost: 'zheng', who: '林秀英', why: '留白', when: '現在', trig: 'streak' },

  // ---------- 靠近道具 ----------
  { id: 'pr.sheet', text: '白布底下……不要掀。', ghost: 'zheng', who: '林秀英', why: '2025/02/27 無名氏移入 207;她用白布蓋住他,因為他的皮膚在暗處會發光', when: '2025/02/27', trig: 'prop', prop: 'body_sheet' },
  { id: 'pr.doll', text: '娃娃要留著……那個孩子會回來拿。', ghost: 'zheng', who: '林秀英', why: '小兒科的孩子被2003 年的修女帶走了(活著);娃娃留在這裡', when: '七月初三', trig: 'prop', prop: 'doll' },
  { id: 'pr.incub', text: '……噓，寶寶在睡。', who: '值夜護理師的聲音(留白)', why: '新生兒室的保溫箱還開著', when: '七月初三之前', trig: 'prop', prop: 'incubator' },
  { id: 'pr.cell', text: '門是從外面鎖的……護理長也打不開。', who: '試驗病房的病人(亡者)', why: '試驗病房的門是從外面鎖的', when: '2025 年', trig: 'prop', prop: 'cell_door' },
  { id: 'pr.drawer', text: '點名了……下一個是你嗎？', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '〈點名〉:抽屜一個一個晃動', when: '七月下旬', trig: 'prop', prop: 'morgue_drawer' },
  { id: 'pr.mirror', text: '你後面……那是誰？', who: '不明(亡者)', why: '留白', when: '現在', trig: 'prop', prop: 'mirror', ear: 'behind' },
  { id: 'pr.candles', text: '有人經過……燭火才會熄。', who: '禮拜堂的人(亡者)', why: '燭火熄滅的事件', when: '現在', trig: 'prop', prop: 'candles' },
  { id: 'pr.gen', text: '燈……不要讓它熄掉。', ghost: 'zheng', who: '林秀英', why: '207 的燈接在這台發電機上;R6 之後油會用完', when: '七月初二起', trig: 'prop', prop: 'generator', hint: 'quest:207light' },
  { id: 'pr.curtain', text: '這是我的床。', who: '隔簾後的病人(亡者)', why: '每一床的隔簾都拉著,像還有人住', when: '七月初三之前', trig: 'prop', prop: 'bed_curtain' },
  { id: 'pr.veil', text: '修女說……要等到天亮。', ghost: 'lobby', who: '大廳的人', why: '2003 年的修女把聖像蓋起來:「這座城市現在就是苦難週」', when: '七月', trig: 'prop', prop: ['statue_veiled'] },
  { id: 'pr.coffin', text: '我不在裡面。', who: '不明(亡者)', why: '靈車後車廂的棺木是空的,貼著夜班回收單「回收第 1 次」', when: '現在', trig: 'prop', prop: 'coffin' },
  { id: 'pr.tv', text: '……請留在室內……鎖好門窗……不要前往醫院……', who: '霧港市災害應變中心的緊急廣播(真,但沒用)', why: '商店電視的跑馬燈也在播同一則', when: '七月初一起', trig: 'prop', prop: ['tv', 'cctv'], filter: 'radio', mode: 'murmur' },

  // ---------- 接起電話(互動代理呼叫 game.horror.phone;同一區內的內線還通,§11.5) ----------
  { id: 'ph.1', text: '……林秀英護理長，請到一樓大廳。\n林秀英護理長……', who: '院內呼叫的舊錄音', why: 'R2 護理站的舊電話會自己響,放的是 207 家屬的呼叫錄音', when: '2025 年之前', trig: 'phone', filter: 'phone' },
  { id: 'ph.2', text: '喂？……是你嗎？你怎麼還不回家？', who: '不明(內線;亡者)', why: '你是來找家人的;這通內線像是反過來在找你', when: '現在', trig: 'phone', filter: 'phone' },
  { id: 'ph.3', text: '……我在你後面那間房間，打給你。', who: '不明(內線;亡者)', why: '同一區內的內線還通', when: '現在', trig: 'phone', filter: 'phone' },
  { id: 'ph.4', text: '這裡是總機……您撥的分機，已經沒有人了。', who: '總機的自動語音', why: '總機的自動語音還在運作', when: '2026 年', trig: 'phone', filter: 'phone' },
  { id: 'ph.5', text: '……（呼吸聲）……數到十，再掛電話。', who: '不明(內線;亡者)', why: '「霧港夜話」的結尾語', when: '現在', trig: 'phone', filter: 'phone', hint: 'rule:voice' },
  { id: 'ph.6', text: '這裡是護理站……207 的便當，放門口敲三下。', ghost: 'zheng', who: '林秀英(內線)', why: '她的心願:封鎖之後金水伯來不了,她怕那一床沒有人看(送走她:在探病登記簿上簽名)', when: '七月十一之後', trig: 'phone', filter: 'phone', hint: 'quest:zheng' },

  // ---------- 收音機自己打開 ----------
  { id: 'rd.1', text: '……AM 1207……還醒著的夜貓子……收到請回答……', who: '霧港夜話的舊錄音(1999)', why: 'AM 1207 的呼號;舊錄音是真的,但過時', when: '1999 年', trig: 'radio', filter: 'radio' },
  { id: 'rd.2', text: '……霧港市災害應變中心……請留在室內……鎖好門窗……', who: '市府緊急廣播(真,但沒用)', why: '市府知道醫院危險,卻把夜間清除外包給夜班', when: '七月初一起', trig: 'radio', filter: 'radio' },
  { id: 'rd.3', text: '……（女聲哼著聖詩的旋律，沒有歌詞）……', who: '2003 年的修女錄的聖詩(舊錄音)', why: '她把聖詩錄成醫院廣播的備用帶', when: '2026 年七月之前', trig: 'radio', filter: 'radio', mode: 'murmur' },
  { id: 'rd.4', text: '……今天晚上，小美在山上，陪大家等月亮……', who: '霧港夜話 1999/10/20 的舊錄音', why: '王志明 10/19 的叩應讓小美上山做現場直播', when: '1999/10/20', trig: 'radio', filter: 'radio', prog: [4] },

  // ---------- 警告(靜默期裡的伏擊者:耳朵 = 他的方向) ----------
  { id: 'wn.back', text: '……後面。', who: '不明(亡者)', why: '提示:靜默期裡宿主不是零,有東西從背後來', when: '現在', trig: 'off', was: 'warn', ear: 'behind', hint: 'warn' },
  { id: 'wn.left', text: '左邊……有人。', who: '不明(亡者)', why: '提示:有東西從左邊來', when: '現在', trig: 'off', was: 'warn', ear: 'left', hint: 'warn' },
  { id: 'wn.right', text: '右邊……他在等。', who: '不明(亡者)', why: '提示:有東西從右邊來', when: '現在', trig: 'off', was: 'warn', ear: 'right', hint: 'warn' },
  { id: 'wn.heard', text: '他們聽到你了。', who: '不明(亡者)', why: '世界規則「他們聽得到」', when: '現在', trig: 'off', was: 'warn', hint: 'warn' },

  // ---------- 引導(提示;鬼不說謊,所以是最可靠的引導) ----------
  { id: 'gd.shop', text: '……捲門拉起來了。往這邊。', who: '不明(亡者)', why: '休息時補給站開放;耳朵的方向 = 補給站的方向', when: '現在', trig: 'off', was: 'guide', cue: 'shop', phase: 'rest', hint: 'shop' },
  { id: 'gd.shop2', text: '金水的店……在這邊。', ghost: 'zheng', who: '林秀英', why: '金水伯二十五年來每個星期日都來看 207;她認得他', when: '現在', trig: 'off', was: 'guide', cue: 'shop', phase: 'rest', hint: 'shop', prog: [3] },
  { id: 'gd.fountain', text: '池子裡丟七次……修女留了話。', ghost: 'lobby', who: '大廳的人', why: '噴水池聖母像:丟滿七枚銅板,底座出現2003 年的修女的禱告字條', when: '七月初三', trig: 'zone', zone: ['f1_lobby'], prog: [6], hint: 'egg:fountain' },
  { id: 'gd.his', text: '病歷電腦……打她住進來的那一天。', ghost: 'zheng', who: '林秀英', why: 'HIS 終端可以輸入號碼;0924 是 207 的入院日期', when: '現在', trig: 'idle', prog: [6], hint: 'egg:his' },
  { id: 'gd.radio', text: '停車場……有一台車的收音機還開著。', who: '不明(亡者)', why: '停車場一台車的收音機調在 AM 1207(車主是一位家屬)', when: '現在', trig: 'idle', prog: [4], hint: 'egg:carradio' },
  { id: 'gd.fuse', text: '保險絲……太平間也有一支。', who: '不明(亡者)', why: '電梯按鈕旁的鉛筆箭頭「↓ 冷」指向太平間的保險絲(大新工務留的)', when: '七月初六', trig: 'idle', prog: [3], hint: 'egg:fuse' },

  // ---------- 探索時 / 配合事件 ----------
  { id: 'id.1', text: '……你聽到了嗎？有人在叫你的名字。', who: '不明(亡者)', why: '鬼月禁忌:有人叫你的名字,莫回頭(遊戲從不證實是誰)', when: '現在', trig: 'idle' },
  { id: 'id.2', text: '他們說，家人馬上就醒。', ghost: 'lobby', who: '大廳的人', why: '集合廣播的內容', when: '七月初三', trig: 'idle' },
  { id: 'id.3', text: '這裡……已經不收活人了。', who: '不明(亡者)', why: '主選單題詞;緊急疏散公告「本院即日起全面停止收治」', when: '七月初三起', trig: 'idle', prog: [5] },
  { id: 'id.4', text: '頭七那天……我有回來。', who: '不明(亡者)', why: '頭七回魂(民俗)', when: '現在', trig: 'off', prog: [3] },
  { id: 'cu.figure', text: '走廊盡頭……有人在等你。', who: '不明(亡者)', why: '配合走廊盡頭的人影', when: '現在', trig: 'cue', cue: 'figure' },
  { id: 'cu.behind', text: '不要回頭。', who: '不明(亡者)', why: '配合身後的人影', when: '現在', trig: 'cue', cue: 'behind', ear: 'behind' },
  { id: 'cu.steps', text: '你踩到我了。', who: '不明(亡者)', why: '配合濕腳印', when: '現在', trig: 'cue', cue: 'footprints' },
  { id: 'cu.nurse', text: '推車要推回護理站……', ghost: 'zheng', who: '林秀英', why: '她出現時有推車輪子聲、病歷板的夾子聲(§2.10)', when: '七月十一之後', trig: 'cue', cue: 'nurse' },
  { id: 'cu.lift', text: '電梯……又停在這一層了。', who: '不明(亡者)', why: '工務室告示:消防返回樓層設在 2 樓,電壓一不穩電梯就自己回來', when: '現在', trig: 'cue', cue: 'elevator' },
  { id: 'cu.write', text: '寫給你的。', who: '不明(亡者)', why: '配合牆上新出現的字', when: '現在', trig: 'cue', cue: 'writing' },
  { id: 'cu.cold', text: '好冷……你也覺得冷嗎？', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '配合寒氣(太平間的冷氣早就停了)', when: '現在', trig: 'cue', cue: 'coldBreath', ear: 'behind' },
  { id: 'cu.lights', text: '燈……一盞一盞，都熄了。', ghost: 'zheng', who: '林秀英', why: '配合燈一盞盞熄滅;她最怕 207 的燈熄', when: '現在', trig: 'cue', cue: 'lightsDie', ear: 'both' },
  { id: 'cu.silence', text: '……噓。', who: '不明(亡者)', why: '配合突然的寂靜', when: '現在', trig: 'cue', cue: 'silence', ear: 'both' },
  { id: 'cu.window', text: '外面……有人在看。', who: '不明(亡者)', why: '配合窗外的人影', when: '現在', trig: 'cue', cue: 'window' },
  { id: 'cu.hands', text: '讓我進去……', ghost: 'lobby', who: '大廳的人', why: '配合玻璃上的手印:正門焊死之後,外面的人進不來', when: '七月初三', trig: 'cue', cue: 'handprints' },
  // ---------- 第二輪:醫院廣播故障重播(trig 'pa';大新的集合廣播主機,STORY.md §1.10:合成、甜美、制式;不是鬼) ----------
  { id: 'pa.1', text: '各位家屬請注意：您的家人已經回來了。\n請到一樓大廳會面。', who: '醫院廣播(大新的合成聲,主機故障重播)', why: '開場的集合廣播(story_A A.4);主機裝了誘集模組', when: '七月初三起每晚', trig: 'pa', filter: 'pa', hint: 'rule:pa' },
  { id: 'pa.2', text: '請勿驚慌。……請勿使用電梯。', who: '醫院廣播(大新的合成聲,主機故障重播)', why: '集合廣播的後半段', when: '七月初三起每晚', trig: 'pa', filter: 'pa' },
  { id: 'pa.3', text: '……感謝各位的配合。', who: '醫院廣播(大新的合成聲,主機故障重播)', why: '第一波屍潮衝進大廳時廣播說的那一句', when: '七月初三', trig: 'pa', filter: 'pa', prog: [3] },
  { id: 'pa.4', text: '林秀英護理長，請到一樓大廳。\n……林秀英護理長……', who: '院內呼叫的舊錄音(混進廣播主機)', why: 'R2 護理站的舊呼叫錄音', when: '2025 年之前', trig: 'pa', filter: 'pa' },
  { id: 'pa.5', text: '喚醒之夜即將開始……請家屬到一樓大廳就座……', who: '醫院廣播(大新接管的院長室)', why: '緊急疏散公告的內容(§5.9)', when: '七月初三', trig: 'pa', filter: 'pa', prog: [4] },
  // ---------- 第二輪:配合新事件的耳語 ----------
  { id: 'cu.pace', text: '巡房了……不要在走廊上逗留。', ghost: 'zheng', who: '林秀英', why: '她還在夜間巡房(病歷板的夾子聲);以前也這樣叫家屬晚上不要在走廊逗留', when: '七月十一之後', trig: 'cue', cue: 'pace', ear: 'behind' },
  { id: 'cu.knock', text: '聽到敲門……不要開。', ghost: 'zheng', who: '林秀英', why: '住院病患須知第五條「夜間聽到敲門聲,請勿開門」是她寫的(2025 年 3 月)', when: '2025/03 起', trig: 'cue', cue: 'knock', hint: 'rule:door' },
  { id: 'cu.call', text: '鈴響了……我馬上過去。', ghost: 'zheng', who: '林秀英', why: '空病房的護理呼叫鈴在響;她還在值班', when: '七月十一之後', trig: 'cue', cue: 'call' },
  { id: 'cu.door', text: '門要關好……他們聽得到。', ghost: 'zheng', who: '林秀英', why: '有人替你把背後的門關上了;世界規則「他們聽得到」', when: '七月十一之後', trig: 'cue', cue: 'door', hint: 'rule:sound' },
  { id: 'cu.throw', text: '不要碰我的東西。', who: '病房的人(亡者)', why: '東西被丟過來', when: '現在', trig: 'cue', cue: 'throw' },
  { id: 'cu.circle', text: '我在這裡……這裡……這裡。', who: '不明(亡者)', why: '配合繞著頭轉的低語', when: '現在', trig: 'cue', cue: 'circle' },
  { id: 'cu.reflect', text: '玻璃裡的那個人……不是你。', who: '不明(亡者)', why: '配合窗玻璃倒影裡站在你背後的人', when: '現在', trig: 'cue', cue: 'reflect', ear: 'behind' },
  { id: 'cu.creeper', text: '你一轉頭……我就過來。', who: '不明(亡者)', why: '配合你不看它時就靠近的人', when: '現在', trig: 'cue', cue: 'creeper', ear: 'behind' },
  { id: 'cu.rollcall', text: '下一個……叫到你了。', who: '喚醒之夜被大新清理隊放進冰櫃的人(2026)', why: '〈點名〉:冰櫃抽屜由遠到近一格一格晃動(§5.11-3)', when: '七月下旬', trig: 'cue', cue: 'rollcall' },
  { id: 'cu.dark', text: '燈回來了。……你有看到嗎？', who: '不明(亡者)', why: '配合停電之後牆上多出來的字', when: '現在', trig: 'cue', cue: 'dark', ear: 'both' },
  // ---- 第三輪(src/horror/haunts.js):劇情 v2 核心(STORY_v2 出來前的對齊版)----
  // 2003 年 SARS 封院十四天;護理長林秀英守了 207 十四暝,燈沒有熄過;玩家是她的孫子,她認得你。921(1999/9/21 01:47)那一晚小美在山上現場直播。
  // 用詞：國語為主，每句最多一個白名單台語詞（阿孫、免驚、乖…）；不用暝／莫／細漢／目睭（CLARITY_PLAN §5）。由 STORY3 表指定播放(trig 'story3'),不進隨機池。
  { id: 's3.swing', text: '那盞燈……阿嬤顧了十四個晚上。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '2003 封院十四天,她守著 207,燈一次都沒熄(「207 的燈」傳說的由來)', when: '2003 封院期間', trig: 'story3', ear: 'right' },
  { id: 's3.follow', text: '燈，阿嬤幫你開著……往前走，不要回頭。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她認得你;你一回頭,她就把背後的燈都開回來', when: '現在', trig: 'story3', ear: 'behind' },
  { id: 's3.bed', text: '第七晚，廣播又叫阿嬤下樓……阿嬤沒有去。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '指向推理題「封院第 7 天,207 號房發生了什麼事」:護理長答應大家第七天', when: '2003 封院第一週', trig: 'story3', ear: 'left' },
  { id: 's3.flat', text: '又一床……他們給他打了那個藥。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '封院的混亂裡,大新生技在其他病人身上試藥;她是發現的人', when: '2003 封院期間', trig: 'story3' },
  { id: 's3.ball', text: '金水伯拿來的球……你小時候最愛玩。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '你是她的孫子:小時候常來醫院等她下班,金水伯會從店裡拿球給你(關於你是誰)', when: '你小時候', trig: 'story3', ear: 'left' },
  { id: 's3.beam', text: '……這邊。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她站的方向就是 207;鬼＝提示,她一直在帶你過去', when: '現在', trig: 'story3' },
  { id: 's3.tap', text: '阿嬤說過：七月被拍肩膀，不要轉頭。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '鬼月禁忌;她從小這樣叮嚀你(關於你是誰)', when: '你小時候', trig: 'story3' },
  { id: 's3.name.call', text: '{暱稱}……', who: '不明(鬼月:叫你名字的,不要回頭)', why: '禁忌「被叫名字不要回頭」;叫你的不是阿嬤', when: '現在', trig: 'story3', ear: 'behind' },
  { id: 's3.name.ok', text: '乖，沒有回頭就好。\n叫你的那個，不是阿嬤。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她認得你,也知道那個聲音不是她(鬼不說謊)', when: '現在', trig: 'story3', ear: 'left' },
  { id: 's3.name.bad', text: '有人叫你的名字……不要回頭。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '你回頭了;她把燈開回來', when: '現在', trig: 'story3', ear: 'right' },
  { id: 's3.radio', text: '……現在時間，凌晨 1 點 47 分。\n這裡是山上的現場，我們——', who: '小美(1999/9/21 的現場直播錄音)', why: '921 那一晚 01:47,小美在大新山研究站的塔上直播;研究站倒塌,直播在這一秒中斷(hc.37)', when: '1999/9/21 01:47', trig: 'story3', filter: 'radio' },
  { id: 's3.dark.know', text: '阿孫……你怎麼也進來了？', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她認得你;官方說她死於 SARS,你從來不信', when: '現在', trig: 'story3', ear: 'left' },
  { id: 's3.dark.day7', text: '封院第七晚……燈也是這樣熄的。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '指向推理題:封院第 7 天的晚上,207 那一層停過電', when: '2003 封院第 7 天', trig: 'story3', ear: 'right' },
  { id: 's3.dark.207', text: '207 的燈不能熄……裡面有人。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '大新把昏迷的小美藏在 207;她守的是裡面那個人', when: '2003 封院期間', trig: 'story3', ear: 'left' },
  { id: 's3.face', text: '不要看窗外……那時候不能開窗。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '封院十四天,窗戶封死;外面的家屬只能隔著玻璃', when: '2003 封院期間', trig: 'story3', ear: 'right' },
  { id: 's3.burst', text: '這間……那時候是隔離病房。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '門自己開了:她讓你進去看(封院時的隔離病房)', when: '2003 封院期間', trig: 'story3' },
  { id: 's3.mirror', text: '你的眼睛，跟阿嬤一樣。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '鏡子裡那張臉一衝出來,接著是她溫柔的一句:她認得你(關於你是誰)', when: '現在', trig: 'story3', ear: 'both' },
  { id: 's3.touqi', text: '今天是頭七……阿嬤回來看你。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '頭七:第七次靜默期她回來', when: '頭七', trig: 'story3', ear: 'both' },
  { id: 's3.whistle', text: '晚上不要吹口哨……會把他們叫來。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '鬼月禁忌:晚上吹口哨會把好兄弟叫來', when: '現在', trig: 'story3', ear: 'right' },
  { id: 's3.envelope', text: '路邊的紅包不要撿……那不是給你的。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '鬼月禁忌:路上的紅包不要撿(冥婚)', when: '現在', trig: 'story3', ear: 'left' },
  { id: 's3.shadow', text: '十四個晚上……阿嬤都這樣巡房。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她拿著病歷板巡了十四個晚上;影子還在走同一條路', when: '2003 封院期間', trig: 'story3', ear: 'behind' },

  // ---- 劇情 v2(src/story/deduce.js 呼叫;HOSPITAL_CLUES_v2 §1.3、§3)----
  { id: 'h.w.tc1', text: '阿孫……你怎麼長這麼大了？', ghost: 'zheng', who: '林秀英(阿嬤)', why: '頭七:她第一次「看見」長大的你(她只知道三歲的你)', when: '頭七', trig: 'script', ear: 'both' },
  { id: 'h.w.tc3', text: '是阿嬤自己說的。', ghost: 'zheng', who: '阿嬤', trig: 'script', ear: 'both' },
  { id: 'h.w.tc4', text: '這樣就沒有人敢開門。', ghost: 'zheng', who: '阿嬤', trig: 'script', ear: 'both' },
  { id: 'h.w.tc2', text: '阿嬤沒有得 SARS。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '頭七:⑥ 的關鍵來源(hc.19);她說了這輩子唯一一個謊', when: '2003/5/9', trig: 'script', ear: 'both' },
  { id: 'h.w.sheng', text: '對了。……阿孫，你好聰明。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '在她的遺照前擲出聖筊', when: '現在', trig: 'script', ear: 'both' },
  { id: 'h.w.bm', text: '床母娘娘，保佑我的孫子。', ghost: 'zheng', who: '林秀英(阿嬤)', why: '新生兒室的床母(支線)', when: '2000', trig: 'script', ear: 'both' },

];

// 牆上字跡(STORY.md §5.9:每一句都有作者;新增的這些要登記進 §5.9 的字跡表)
// kind:static(場景佈置,一開始就在)| appear(事件:趁玩家背對時出現,作者是鬼)
// 欄位:id、text、zone(static 擺放區域)、style(marker 麥克筆 | paint 噴漆 | chalk 粉筆 | crayon 蠟筆 | scratch 刻痕 | smear 暗紅手指塗抹)、
//       ghost、who(誰寫的)、why(為什麼)、when(什麼時候)、hint、size(字高 m)、h(離地高度 m)
export const WRITINGS = [
  { id: 'w.waiting', kind: 'static', text: '叫號機壞了\n不要再排了', zone: 'f1_waiting', style: 'marker', who: '實習護理師林大新工務', why: '集合事件後,每天還有人(和宿主)走回候診區排隊;她躲進地下室之前寫的', when: '七月初五', size: 0.2, h: 1.55 },
  { id: 'w.morgue', kind: 'static', text: '抽屜有聲音\n不要開　8/14', zone: 'b1_morgue', style: 'marker', who: '大新清理隊作業員', why: '「地下室有人」就是他們的作業標記;被回收的人在抽屜裡「醒來」', when: '七月初四', size: 0.18, h: 1.5 },
  { id: 'w.phone', kind: 'static', text: '護理站電話不要接\n接了只有呼吸聲', zone: 'f2_corridor', style: 'marker', who: '林秀英護理長', why: '內線一直響;她不想讓留守的人一直跑去接(留白)', when: '七月初八', size: 0.17, h: 1.45, hint: 'egg:phone' },
  { id: 'w.chapel', kind: 'static', text: '蠟燭不要熄\n修女說的', zone: 'f1_chapel', style: 'crayon', who: '躲在禮拜堂的孩子(後來被2003 年的修女帶到廟口,活著)', why: '2003 年的修女教的:點一根蠟燭,代表有人在等', when: '七月初三夜', size: 0.16, h: 0.9, hint: 'egg:candle' },
  { id: 'w.tunnel', kind: 'static', text: '鍋爐房 →\n油桶在裡面', zone: 'b1_tunnel', style: 'paint', who: '工務室', why: '停電通知:市電被切,207 的燈和監控室搶同一台發電機;加油要從鍋爐房扛油桶', when: '七月初二', size: 0.24, h: 1.6, hint: 'quest:207light' },
  { id: 'w.psych', kind: 'static', text: '每天晚上\n都有人來打針', zone: 'f3_corridor', style: 'scratch', who: '受試者 004', why: '熟悉的人聲讓宿主暫時安靜;001 會哼歌', when: '2025 年春天', size: 0.15, h: 1.3, hint: 'rule:voice' },
  { id: 'w.archive', kind: 'static', text: '207 病歷\n借閱：神經科　王　未還', zone: 'b1_archive', style: 'marker', who: '舊病歷庫管理員', why: '2025/02/27 的床位異動;正本其實一直在 207 的床墊底下', when: '2025/02/27', size: 0.16, h: 1.5 },
  { id: 'w.dorm', kind: 'static', text: '207 的燈不要關\n等她醒來，讓她自己關　——林', zone: 'f3_dorm', style: 'chalk', who: '2003 年的修女', why: '七月初三帶小美離開前寫在宿舍白板上(2003 年的信裡也寫了同一句)', when: '七月初三 00:30', size: 0.16, h: 1.45 },
  { id: 'w.icu', kind: 'static', text: '機器的聲音會叫他們來\n關掉！', zone: 'f2_icu', style: 'marker', who: '急診護理師大新照護員', why: '她發現聲音會把宿主引過來(「他們聽得到」也是她寫的);之後下落不明', when: '七月初四', size: 0.16, h: 1.5, hint: 'rule:sound' },
  { id: 'w.playroom', kind: 'static', text: '護理長阿嬤\n明天還來講故事嗎', zone: 'f2_playroom', style: 'crayon', who: '小兒科的孩子(活著)', why: '001 醒來後偷偷下樓講故事', when: '2025 年春天', size: 0.14, h: 0.8 },
  { id: 'w.laundry', kind: 'static', text: '床單不夠了\n先用白布', zone: 'b1_laundry', style: 'marker', who: '洗衣房的阿姨', why: '病房的白布都拿去蓋人了', when: '七月初四', size: 0.16, h: 1.5 },
  // 事件:趁玩家背對時出現(作者是鬼;留白:監視器拍不到是誰寫的)
  { id: 'a.gather', kind: 'appear', text: '你也是來會面的嗎', style: 'smear', ghost: 'lobby', who: '大廳的人', why: '集合廣播那晚的人', when: '本局', size: 0.34 },
  { id: 'a.back', kind: 'appear', text: '別回頭', style: 'smear', ghost: 'zheng', who: '林秀英', why: '提示:背後有東西(鬼不說謊)', when: '本局', size: 0.42, hint: 'warn' },
  { id: 'a.queue', kind: 'appear', text: '我們還在等', style: 'smear', ghost: 'lobby', who: '大廳的人', why: '他們還在等專車', when: '本局', size: 0.34 },
  { id: 'a.home', kind: 'appear', text: '回家', style: 'smear', who: '一位沒有被叫到名字的長輩(亡者)', why: '想回家', when: '本局', size: 0.5 },
  { id: 'a.light', kind: 'appear', text: '燈還亮著嗎', style: 'smear', ghost: 'zheng', who: '林秀英', why: '她最怕 207 的燈熄', when: '本局', size: 0.34, hint: 'quest:207light' },
  { id: 'a.quiet', kind: 'appear', text: '小聲一點\n他們聽得到', style: 'smear', ghost: 'zheng', who: '林秀英', why: '世界規則「他們聽得到」', when: '本局', size: 0.3, hint: 'rule:sound' },
  // 第三輪:走廊停電之後多出來的字(kind 'story3':只由 STORY3 表指定)
  { id: 'w3.day7', kind: 'story3', text: '封院第 7 天\n正丅', style: 'marker', ghost: 'zheng', who: '林秀英(阿嬤)', why: '封院期間她每天在牆上畫一筆;第七天那一晚 207 出了事(推理題)', when: '2003 封院第 7 天', size: 0.2, h: 1.5 },
  { id: 'w3.tally', kind: 'story3', text: '正正止', style: 'scratch', who: '2003 隔離病房的病人', why: '十四天的計數;他們以為數到十四就能回家', when: '2003 封院期間', size: 0.2, h: 1.3 },
  { id: 'w3.0147', kind: 'story3', text: '01:47', style: 'smear', who: '不明', why: '207 床頭那支女用電子錶停在 01:47(hc.41):小美從山上被挖出來時戴著的錶;聖心沒有「全院的鐘都停在 01:47」,停住的鐘在崙尾高中', when: '1999/9/21', size: 0.24, h: 1.6 },
  { id: 'w3.207', kind: 'story3', text: '207 的燈\n不能熄', style: 'marker', ghost: 'zheng', who: '林秀英(阿嬤)', why: '她守了 207 十四暝;燈一熄,大新的人就會進去', when: '2003 封院期間', size: 0.2, h: 1.5 },
];

// ---------- 第三輪:每個事件的劇情回報(src/horror/haunts.js 的 story(事件) 從這裡挑) ----------
// 每個事件一串變體,依序挑第一個「還沒用過、幕次到了」的;repeat:true 的可以重複。欄位:
//   id(記進 h.remember 的鍵;電話/台詞之後可以引用)、line(說哪一句,LINES 的 id)、write(寫哪一筆,WRITINGS 的 id)、text(霧/霜上的字)、
//   act 最早第幾幕、mem 記憶分類(zheng 看到阿嬤 / dark 停電 / taboo 禁忌 / self 關於你是誰 / clue 線索)、
//   card:線索卡 id(HOSPITAL_CLUES_v2 出來後由劇情組填;有填就呼叫 game.objectives?.clue?.(card))、flag:另外設的 game.flags 旗標
export const STORY3 = {
  swing: [{ id: 's3.swing', line: 's3.swing', mem: 'zheng', card: 'hc.34' }],
  follow: [{ id: 's3.follow', line: 's3.follow', mem: 'zheng' }],
  bed: [{ id: 's3.bed', line: 's3.bed', mem: 'clue', card: 'hc.35' }],
  flat: [{ id: 's3.flat', line: 's3.flat', mem: 'clue', card: 'hc.36' }],
  ball: [{ id: 's3.ball', line: 's3.ball', mem: 'self' }],
  beam: [{ id: 's3.beam', line: 's3.beam', mem: 'zheng', repeat: true }],
  tap: [{ id: 's3.tap', line: 's3.tap', mem: 'taboo' }],
  nameOk: [{ id: 's3.name.ok', line: 's3.name.ok', mem: 'taboo' }],
  nameBad: [{ id: 's3.name.bad', line: 's3.name.bad', mem: 'taboo', repeat: true }],
  radio: [{ id: 's3.radio', line: 's3.radio', mem: 'clue', card: 'hc.37' }],
  dark: [{ id: 's3.dark.know', line: 's3.dark.know', mem: 'self' }, { id: 's3.dark.day7', line: 's3.dark.day7', act: 2, mem: 'clue', card: 'hc.38' }, { id: 's3.dark.207', line: 's3.dark.207', act: 2, mem: 'clue', card: 'hc.39' }],
  darkWrite: [{ id: 'w3.day7', write: 'w3.day7', act: 2, mem: 'clue', card: 'hc.40' }, { id: 'w3.0147', write: 'w3.0147', mem: 'clue', card: 'hc.41' }, { id: 'w3.207', write: 'w3.207', mem: 'clue', card: 'hc.39' }, { id: 'w3.tally', write: 'w3.tally', mem: 'clue', card: 'hc.40' }],
  darkDoor: [{ id: 's3.dark.door', mem: 'dark', repeat: true }], // 燈回來時,一扇門已經開了(路打開)
  face: [{ id: 's3.face', line: 's3.face', mem: 'zheng' }],
  burst: [{ id: 's3.burst', line: 's3.burst', act: 2, mem: 'zheng' }],
  mirror: [{ id: 's3.mirror', line: 's3.mirror', mem: 'self' }],
  touqi: [{ id: 's3.touqi', line: 's3.touqi', mem: 'zheng', flag: 'h.touqi' }],
  whistle: [{ id: 's3.whistle', line: 's3.whistle', mem: 'taboo' }],
  envelope: [{ id: 's3.envelope', line: 's3.envelope', mem: 'taboo' }],
  shadow: [{ id: 's3.shadow', line: 's3.shadow', mem: 'zheng' }],
  fog: [{ id: 'fg.tally', text: '正正止', mem: 'clue', card: 'hc.40' }, { id: 'fg.home', text: '回家', mem: 'dark' }], // 從外面寫的(封院時外面的家屬)
  frost: [{ id: 'fr.0147', text: '01:47', mem: 'clue', card: 'hc.41' }, { id: 'fr.207', text: '207', act: 2, mem: 'clue', card: 'hc.39' }, { id: 'fr.day7', text: '第七天', act: 2, mem: 'clue', card: 'hc.40' }, { id: 'fr.ama', text: '阿嬤在', mem: 'self', repeat: true }],
};

// 事件字幕(不是低語:例如數數的人;灰色、標記「？？？」)
export const CAPTIONS = {
  counter: { who: '收音機 · 小美', count: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'], tail: '……好了。天就要亮了。', tailNear: '……好了。天亮之前，不要怕。', tailEnd: '……好了。天亮之前，不要怕。' }, // v2:小美數到十的收驚(站在收音機旁)
};

// ---------- 第二輪:接起電話之後的來電腳本(互動代理呼叫 game.horror.phoneCall(ctx);src/horror/calls.js 組合) ----------
// 每通:id、act 最早第幾幕、sys(系統錄音:不是鬼,誘集期間也可以)、ghost/who/why/when、need(情境條件)、
//       lines [{ text, gap(這句之前多停幾秒), ear('left' = 不經過聽筒,直接在你左耳) }]、cues [{ line, kind, at(該句開始後幾秒) }]、
//       end(對方說完之後:'dead' 斷線雜訊 | 'tone' 撥號音 | 'breath' 只剩呼吸 | 'click' 掛斷)、w 權重、once 一局一次
// need:closedDoorBehind 背後 7m 內有關著的門 | openDoorBehind 背後有開著的門 | window 8m 內有窗 | propBehind 背後有可動的東西 |
//       behindFree 背後 1.6m 可以站人 | lit 附近有亮著的燈 | flash 手電筒開著 | zone/theme 指定區域
// 文字裡:{房名} 你所在的區域名、{門} 背後那扇門的種類、{物} 背後那個東西、{暱稱} 玩家暱稱
// 鬼不說謊(§1.9):說「剛剛是關著的」的那扇門真的是關著的,而且接著就會打開;說「它停在你後面」時,後面真的有腳步停下來。
export const CALLS = [
  { id: 'call.sys.switch', act: 1, sys: true, who: '總機的自動語音', why: '總機的自動語音還在運作;同一區內的內線還通(§11.5)', when: '2026 年',
    lines: [{ text: '這裡是總機。您撥的分機，已經沒有人了。' }, { text: '……如需轉接，請稍候。', gap: 1.6 }, { text: '……您撥的分機，已經沒有人了。', gap: 2.4 }], end: 'tone', w: 0.8 },
  { id: 'call.sys.207', act: 1, sys: true, who: '院內呼叫的舊錄音', why: 'R2 護理站的舊電話放的是 207 家屬的呼叫錄音', when: '2025 年之前',
    lines: [{ text: '……林秀英護理長，請到一樓大廳。' }, { text: '林秀英護理長……', gap: 1.2 }, { text: '……一樓大廳……', gap: 1.6 }], end: 'dead', w: 0.7, once: true },
  { id: 'call.zheng.rounds', act: 1, ghost: 'zheng', who: '林秀英(內線)', why: '她還在值夜班;世界規則「他們聽得到」', when: '七月十一之後',
    lines: [{ text: '這裡是護理站。' }, { text: '……你在{房名}，對不對？', gap: 0.6 }, { text: '晚上不要在走廊走來走去……他們聽得到。', gap: 0.8 }], cues: [{ line: 0, kind: 'clip', at: 0.2 }], end: 'click', w: 1, hint: 'rule:sound' },
  { id: 'call.door.closed', act: 2, who: '不明(內線;亡者)', why: '鬼不說謊:那扇門真的是關著的,接著就自己打開', when: '現在', need: { closedDoorBehind: true },
    lines: [{ text: '……你背後那扇{門}。' }, { text: '剛剛是關著的。', gap: 0.8 }, { text: '……現在呢？', gap: 2.6 }], cues: [{ line: 1, kind: 'door', at: 1.2 }], end: 'breath', w: 1.6 },
  { id: 'call.door.open', act: 2, ghost: 'zheng', who: '林秀英(內線)', why: '她替你把背後開著的門關上;門要關好', when: '七月十一之後', need: { openDoorBehind: true },
    lines: [{ text: '你後面的門，開著。' }, { text: '……阿嬤幫你關起來。', gap: 0.8 }, { text: '門要關好。他們聽得到。', gap: 1.4 }], cues: [{ line: 1, kind: 'doorShut', at: 1.1 }], end: 'click', w: 1.2, hint: 'rule:sound' },
  { id: 'call.window', act: 2, ghost: 'lobby', who: '大廳的人(內線)', why: '他們還在等大新的專車;專車從來沒有來', when: '七月初三', need: { window: true },
    lines: [{ text: '別看窗外。' }, { text: '……他們還在外面等。', gap: 1.0 }, { text: '我說了，別看。', gap: 2.4 }], cues: [{ line: 1, kind: 'window', at: 0.8 }], end: 'dead', w: 1.3 },
  { id: 'call.prop', act: 2, who: '不明(內線;亡者)', why: '鬼不說謊:那個東西真的被推過了', when: '現在', need: { propBehind: true },
    lines: [{ text: '你背後那張{物}……' }, { text: '剛剛不在那裡。', gap: 1.4 }, { text: '不要回頭。', gap: 1.2 }], cues: [{ line: 0, kind: 'prop', at: 1.4 }], end: 'breath', w: 1.2 },
  { id: 'call.steps', act: 2, who: '不明(內線;亡者)', why: '腳步聲真的停在你後面', when: '現在', need: { behindFree: true },
    lines: [{ text: '你有沒有聽到……腳步聲？' }, { text: '……它停在你後面了。', gap: 3.4 }], cues: [{ line: 0, kind: 'steps', at: 1.6 }, { line: 1, kind: 'breath', at: 1.6 }], end: 'breath', w: 1.1 },
  { id: 'call.ear', act: 2, who: '不明(亡者)', why: '電話那頭的聲音,其實在你旁邊', when: '現在',
    lines: [{ text: '喂？……聽得到嗎？' }, { text: '你左邊。', gap: 1.4 }, { text: '我不在電話裡。', gap: 1.0, ear: 'left' }], cues: [{ line: 2, kind: 'cold', at: 0.2 }], end: 'dead', w: 1.0, ringback: 0.3 },
  { id: 'call.lights', act: 3, who: '不明(內線;亡者)', why: '燈真的熄了;「數到十」是小美節目的結尾語,護理站每個人都會背', when: '現在', need: { lit: true },
    lines: [{ text: '你那邊的燈……還亮著嗎？' }, { text: '……現在呢？', gap: 1.6 }, { text: '數到十，燈就回來了。', gap: 2.2 }], cues: [{ line: 1, kind: 'lights', at: 0.3 }], end: 'click', w: 1.2 },
  { id: 'call.figure', act: 3, who: '不明(內線;亡者)', why: '鬼不說謊:它真的就在你後面', when: '現在', need: { behindFree: true },
    lines: [{ text: '不要轉頭。' }, { text: '……我在你後面。', gap: 1.6 }, { text: '我說，不要轉頭。', gap: 2.6 }], cues: [{ line: 1, kind: 'figure', at: 0.5 }], end: 'dead', w: 1.4, ringback: 0.35 },
  { id: 'call.name', act: 3, ghost: 'caller', who: '叫名字的人', why: '永遠的未解:是誰在叫你的名字', when: '不明',
    lines: [{ text: '……{暱稱}？' }, { text: '{暱稱}……', gap: 3.2 }], cues: [{ line: 1, kind: 'cold', at: 0 }], end: 'dead', w: 0.4, once: true },
  { id: 'call.seen.ama', act: 1, ghost: 'zheng', who: '林秀英(阿嬤,內線)', why: '引用你剛剛看到的她(h.remember);她認得你', when: '現在', need: { seen: 'zheng' },
    lines: [{ text: '你剛剛看到阿嬤了吧。' }, { text: '……免驚。阿嬤在這裡。', gap: 1.4 }], cues: [{ line: 1, kind: 'steps', at: 1.0 }], end: 'click', w: 1.4, once: true },
  { id: 'call.seen.dark', act: 1, ghost: 'zheng', who: '林秀英(阿嬤,內線)', why: '引用剛剛走廊全暗的那一段;鬼不說謊:那口氣不是她', when: '現在', need: { seen: 'dark' },
    lines: [{ text: '「剛剛燈熄的時候……你有聽到嗎？」' }, { text: '「那不是阿嬤……阿嬤不會在你耳邊喘氣。」', gap: 1.6 }], cues: [{ line: 1, kind: 'breath', at: 1.0 }], end: 'breath', w: 1.4, once: true },
  { id: 'call.seen.taboo', act: 1, ghost: 'zheng', who: '林秀英(阿嬤,內線)', why: '引用你剛剛碰到的鬼月禁忌', when: '現在', need: { seen: 'taboo' },
    lines: [{ text: '現在是七月。' }, { text: '有人叫你名字，不要回頭。', gap: 1.2 }, { text: '有人拍你肩膀，不要轉頭。', gap: 0.8 }], end: 'click', w: 1.2, once: true },
  { id: 'call.ringback', act: 3, who: '不明(內線;亡者)', why: '掛掉之後又打來', when: '現在', ringbackOnly: true,
    lines: [{ text: '你掛我電話。' }, { text: '……沒關係。', gap: 1.2 }, { text: '我在你後面那間房間。', gap: 1.0 }], cues: [{ line: 2, kind: 'knock', at: 0.6 }], end: 'dead', w: 1 },
];
// 依地點的來電(你站的地方發生過什麼;只說那個人死前知道的事)
export const PLACE_CALLS = {
  f1_lobby: { ghost: 'lobby', who: '大廳的人(內線)', why: '七月初三集合事件;專車沒有來', when: '七月初三',
    lines: [{ text: '你站的地方……七月初一那天晚上，坐滿了人。' }, { text: '大家都在等家人醒來。', gap: 0.8 }, { text: '……醒來的，不是他們。', gap: 1.6 }], end: 'dead' },
  f2_ward_207: { ghost: 'zheng', who: '林秀英(內線)', why: '1999/9/24 到 2025/02/27,207 都是小美;金水伯每個星期日來', when: '七月十一之前',
    lines: [{ text: '那張床……四年來，都是同一個人。' }, { text: '沒有人知道她叫什麼名字。', gap: 0.8 }, { text: '……燈不要關。', gap: 1.4 }], end: 'click', hint: 'quest:207light' },
  b1_morgue: { who: '喚醒之夜被大新清理隊放進冰櫃的人(內線)', why: '回收清冊上有你的編號「預約中」(A8)', when: '七月下旬',
    lines: [{ text: '你腳邊那一排抽屜……' }, { text: '有一格，留給 207 的家屬。', gap: 1.0 }, { text: '……就是你。', gap: 1.8 }], cues: [{ line: 1, kind: 'knock', at: 0.8 }], end: 'dead' },
  f3_corridor: { who: '試驗病房的病人(內線;亡者)', why: '三樓試驗病房的門從外面鎖;001 用刻痕數日子', when: '2025 年',
    lines: [{ text: '「三樓的門……都是從外面鎖的。」' }, { text: '「護理長敲門，沒有人應。」', gap: 0.8 }], end: 'dead' },
  psych_cell: { who: '試驗病房的病人(內線;亡者)', why: '三樓試驗病房的門從外面鎖;001 用刻痕數日子', when: '2025 年',
    lines: [{ text: '「你在隔離房裡面……門是從外面鎖的。」' }, { text: '「2003 年，這裡關過六個人。」', gap: 0.8 }], cues: [{ line: 1, kind: 'knock', at: 0.6 }], end: 'dead' },
  f2_nursery: { ghost: 'zheng', who: '值夜護理師的聲音(留白;孩子們都活著離開了)', why: '七月初三夜,2003 年的修女把孩子帶到廟口', when: '七月初三',
    lines: [{ text: '孩子們都平安出去了。' }, { text: '……阿孫，你也是在這裡出生的。', gap: 1.0 }], end: 'click' },
  f1_chapel: { who: '禮拜堂的人(內線;亡者)', why: '2003 年的修女的習慣:有人在等,就點一根蠟燭', when: '現在',
    lines: [{ text: '蠟燭……還有人在點嗎？' }, { text: '修女說，有人在等，就點一根。', gap: 0.8 }], end: 'click', hint: 'egg:candle' },
  f1_er: { who: '急診的家屬(內線;亡者)', why: '正門焊死之後,家屬逃進急診,把門堵起來;外面一直有人在敲', when: '七月初三',
    lines: [{ text: '急診的門……那天晚上是我們自己堵起來的。' }, { text: '外面一直有人在敲。', gap: 0.8 }, { text: '……不要開。', gap: 1.8 }], cues: [{ line: 1, kind: 'knock', at: 0.9 }], end: 'dead' },
  b1_boiler: { ghost: 'zheng', who: '林秀英(內線)', why: '207 的燈和監控室搶同一台發電機', when: '七月初二起',
    lines: [{ text: '「這裡的油桶……」' }, { text: '「是給 207 的燈加油用的。」', gap: 0.8 }], end: 'click', hint: 'quest:207light' },
  f1_waiting: { ghost: 'lobby', who: '候診區的人(內線;亡者)', why: '叫號機停在七月初三的號碼', when: '七月初三',
    lines: [{ text: '叫號機一直停在同一個號碼。' }, { text: '……那是我的號碼。', gap: 1.4 }], end: 'dead' },
  f3_dorm: { ghost: 'zheng', who: '林秀英(內線)', why: '2003 年的修女七月初三 00:41 的答錄機留言:「我明天回來。」她沒有回來(她在廟口)', when: '七月初三~十一',
    lines: [{ text: '封院那幾天晚上，阿嬤睡在這裡。' }, { text: '第七晚……就沒有再上來了。', gap: 0.8 }], end: 'click' },
  _default: { who: '不明(內線;亡者)', why: '它看得到你', when: '現在',
    lines: [{ text: '你在{房名}，對不對？' }, { text: '……我看得到你。', gap: 1.2 }], end: 'breath' },
};
// 道具與門的名字(電話裡說「你背後那張{物}」)
export const PROP_NAMES = { wc: '輪椅', wheelchair: '輪椅', wheel: '輪椅', cart: '推車', linen: '布巾車', gurney: '推床', trolley: '推車', iv: '點滴架', chair: '椅子', stool: '凳子', bin: '垃圾桶', box: '紙箱',
  body_sheet: '白布', doll: '娃娃', incubator: '保溫箱', cell_door: '隔離房門', morgue_drawer: '冰櫃抽屜', mirror: '鏡子', candles: '蠟燭', generator: '發電機', bed_curtain: '隔簾', statue_mary: '聖母像', tv: '電視', cctv: '螢幕', phone: '電話', radio: '收音機' };
export const DOOR_NAMES = { fire: '防火門', cell: '隔離房門', glass: '玻璃門', wood: '木門', chapel: '木門', metal: '鐵門', swing: '雙開門', ward: '病房門' };

// 依 id 查
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
