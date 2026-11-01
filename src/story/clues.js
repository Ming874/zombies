// 聖心醫院〈207 的燈〉的線索卡與推理題(資料;正典 HOSPITAL_CLUES_v2.md §1～§3、STORY_v2.md §3.8、§4)。
// 卡片從六種來源自動收進筆記本(看到、撿到、聽到就收,不用按鍵):
//   紙本/錄音帶 → notes.js 的 points 'card:hc.xx'(互動系統的 'note' 事件)
//   操作物件   → USE(互動系統的事件名稱 → 卡)
//   環境細節   → LOOK(準心停 0.8 秒、3 m 內)
//   鬼的耳語   → WHISPER(靈異系統的 'whisper' 事件 id → 卡)
//   靈異事件   → STORY3 的 card 欄位(horror/lines.js;game.objectives.clue(card))
//   電話/對講機 → TALK(劇情台詞播完時)
// 書寫規則:寫下來的是國語,說出口的是台語。

export const MAP = 'hospital';

export const QUESTION = {
  id: 'h.q',
  title: '封院第 7 天，207 號房發生了什麼事？',
  askAt: 'h.ix.memorial',
  sentences: [
    '207 那個沒有名字的病人，其實是 {b0}。封院第 7 晚，{b1} 關掉二樓的燈，走進 207，要 {b2}。',
    '阿嬤 {b3}，擋在床前，被 {b4} 扎到手。',
    '她把 207 {b5}，對外說自己 {b6}，一個人守到第 14 晚。',
  ],
  blanks: {
    b0: { cat: 'who', answer: 'w.xiaoling' },
    b1: { cat: 'who', answer: 'w.drho' },
    b2: { cat: 'want', answer: 'w.blood' },
    b3: { cat: 'did', answer: 'w.lamp' },
    b4: { cat: 'thing', answer: 'w.needle' },
    b5: { cat: 'door', answer: 'w.lockin' },
    b6: { cat: 'claim', answer: 'w.sars' },
  },
  m: 7,
  // 聖筊之後寫進筆記本最後一頁(STORY_v2 §0.2 第 2 句)
  truth: '2003 年 SARS，聖心醫院封院 14 天。大新生技把昏迷的小美藏在 207 號房，抽她的血做藥，還拿其他病人偷偷試藥。護理長林秀英（你的阿嬤）發現了，守了 207 十四個晚上，所以 207 的燈從來沒有熄過。',
};

// 類別的名稱(詞庫分頁)
export const CATS = { who: '人', want: '要做什麼', did: '阿嬤做了什麼', thing: '東西', door: '門', claim: '她說自己' };

export const WORDS = {
  'w.xiaoling': { text: '小美', cat: 'who' },
  'w.drho': { text: '王醫師', cat: 'who' },
  'w.hokin': { text: '王醫師的親人', cat: 'who' },
  'w.sarspt': { text: '一位 SARS 病人', cat: 'who' },
  'w.researcher': { text: '大新的研究員', cat: 'who' },
  'w.health': { text: '衛生局的人', cat: 'who' },
  'w.kimsui': { text: '金水伯', cat: 'who' },
  'w.guard': { text: '大新的保全', cat: 'who' },
  'w.blood': { text: '抽她的血', cat: 'want' },
  'w.temp': { text: '替她量體溫', cat: 'want' },
  'w.transfer': { text: '替她轉院', cat: 'want' },
  'w.lightoff': { text: '關掉 207 的燈', cat: 'want' },
  'w.lamp': { text: '打開檯燈', cat: 'did' },
  'w.downstairs': { text: '跑去一樓', cat: 'did' },
  'w.callhelp': { text: '打電話求救', cat: 'did' },
  'w.needle': { text: '抽血的針', cat: 'thing' },
  'w.scissors': { text: '剪刀', cat: 'thing' },
  'w.glass': { text: '碎玻璃', cat: 'thing' },
  'w.lockin': { text: '從裡面反鎖', cat: 'door' },
  'w.towanlan': { text: '交給大新', cat: 'door' },
  'w.sealed': { text: '封死', cat: 'door' },
  'w.sars': { text: '得了 SARS', cat: 'claim' },
  'w.toTransfer': { text: '要轉院', cat: 'claim' },
  'w.better': { text: '已經好了', cat: 'claim' },
  'w.gohome': { text: '要回家', cat: 'claim' },
};

// 線索卡:id、title、src(note 紙本 / photo 照片 / tape 錄音 / call 電話或對講機 / ghost 鬼 / env 環境 / video 錄影)、
// words 解鎖的詞、sup 支持哪幾格、text 筆記本上的摘錄
export const CARDS = [
  { id: 'hc.01', title: '封院公告', src: 'env', words: ['w.health', 'w.sarspt'], sup: [],
    text: '霧港市衛生局公告：聖心醫院從 92 年（2003 年）4 月 29 日中午起，封院 14 天，裡面的人都不能出去。\n（公告下緣，有人用原子筆一天畫一槓，畫到第十四槓。）' },
  { id: 'hc.02', title: '柱子上的字', src: 'env', words: ['w.downstairs'], sup: ['b1', 'b3'],
    text: '「不要相信廣播」。紅漆褪成了磚色。大新裝潢時漆過兩次白漆，字還是透了出來。筆畫很工整，像在寫病歷。' },
  { id: 'hc.03', title: '醫院廣播紀錄簿・2003', src: 'note', words: ['w.drho'], sup: ['b1'],
    text: '92/5/4　22:10　呼叫：林秀英護理長到一樓大廳　申請人：神經科 王\n92/5/5　23:40　呼叫：林秀英護理長到一樓大廳　申請人：神經科 王\n（5/5 那一行旁邊，有人用紅筆畫了一個問號。）' },
  { id: 'hc.04', title: '207 進出登記・2003', src: 'note', words: ['w.drho'], sup: ['b1', 'b5'],
    text: '5/5　23:47　入：王（神經科）　23:52 出\n5/5　23:55　入：林（護理）\n（這一行之後沒有「出」。下面全是空白。）' },
  { id: 'hc.05', title: '監視器錄影帶 2003/5/5', src: 'video', words: ['w.lamp', 'w.drho'], sup: ['b1', 'b3', 'b5'],
    text: '23:47　走廊的燈一排一排熄掉。一個穿白袍的人走進畫面，名牌反光：「神經科　王」，推開 207 的門。\n23:48　207 的門玻璃亮了，是檯燈的黃光。23:52，白袍的人走出來，抓著自己的手腕。23:55，玻璃裡有人用手指寫字，寫的是反的。' },
  { id: 'hc.06', title: '大新聖心專案・2003', src: 'note', words: ['w.blood', 'w.transfer', 'w.researcher'], sup: ['b2'],
    text: '原料：207（無名氏，1999/9/24 入）　每週一夜間採血 20 ml\n5/5　抽血中斷：護理人員阻撓。採血針遺失一支。\n207 轉院申請：駁回。　——王' },
  { id: 'hc.07', title: '阿嬤的值班日記・2003 封院', src: 'note', words: ['w.temp', 'w.scissors'], sup: ['b0', 'b2'],
    text: '4/30　207 無名氏（1999/9/24 住進來，921 地震時從山上送來），昏迷。\n5/2　金水哥說，921 那年他在山上挖出一個女孩，交給王醫師。\n5/4　207 右手臂有新的針孔，病歷上沒寫要抽血。廣播叫我下樓，大廳沒有人。\n5/5　剪刀借三樓，未還。今晚我守 207。' },
  { id: 'hc.08', title: '護理站的錄音帶', src: 'tape', words: ['w.xiaoling'], sup: ['b0'],
    text: '側標：霧港夜話（重播）　207 聽著心跳會加快　——林\n小美（1999 年的錄音）：……還醒著的夜貓子，收到請回答。\n小美（現在）：……那是我的聲音。為什麼你們醫院會有我的節目？' },
  { id: 'hc.09', title: '沒有送出去的紙條', src: 'note', words: ['w.blood'], sup: ['b0', 'b1', 'b2'],
    text: '金水哥：\n207 那個沒有名字的病人，就是你 921 那年揹下山的那個女孩。她沒有走，她還活著。\n王醫師每個禮拜一晚上來抽她的血，病歷上沒有寫。\n我會顧她。你在外面，幫我看那扇窗。　秀英　5/5' },
  { id: 'hc.10', title: '病歷電腦：207', src: 'env', words: ['w.drho'], sup: ['b0'],
    text: '床號 207　姓名：無名氏　性別：女\n入院：1999/09/24　來源：山上（921 地震）\n主治醫師：王志明\n狀態：鎖住（董事長下令，不准打開）' },
  { id: 'hc.11', title: '護理站的閒話本', src: 'note', words: ['w.hokin'], sup: [],
    text: '「聽說 207 是王醫師的親人，所以他每個禮拜自己來，不讓我們插手。」\n「亂講，王醫師單身。」\n「護理長說，晚上誰廣播叫都不要下樓。」' },
  { id: 'hc.12', title: '被針扎傷的報告（沒有交出去）', src: 'note', words: ['w.needle'], sup: ['b4', 'b2'],
    text: '92/5/5　23:50　地點：207　報告人：林秀英\n扎到哪裡：左手背　扎到的東西：抽血的針（別人拿著的）\n（下面一行小字：先不要交。交了，他們就會來開門。）' },
  { id: 'hc.13', title: '阿嬤的遺照', src: 'photo', words: [], sup: ['b3', 'b4'],
    text: '2003 年 5 月 8 日，記者在後巷鐵網外拍的：二樓一扇亮著的窗，窗裡一位戴口罩的護理長舉著一張紙：「不要怕　阿嬤在這裡」。她的左手纏著紗布。\n「護理長　林秀英（1946–2003）」' },
  { id: 'hc.14', title: '金水商行的便當單・2003', src: 'note', words: ['w.kimsui'], sup: ['b5', 'b6'],
    text: '5/5　（檢查站擋住，沒進去）\n5/6～5/12　207：1 個。放門口，敲三下，不要進去（護理長交代）\n5/12　（沒拿）' },
  { id: 'hc.15', title: '207 門上的字', src: 'env', words: ['w.lockin', 'w.sealed'], sup: ['b5', 'b3'],
    text: '門玻璃上有一行口紅字，從外面看是反的：「門開要不」（從裡面看是「不要開門」）。字是寫在玻璃裡面的。舊喇叭鎖的旋鈕在門內，鎖著。大新加裝的電子鎖亮著紅燈：「鎖住」。玻璃後面，檯燈還亮著。' },
  { id: 'hc.16', title: '鑰匙板', src: 'env', words: ['w.towanlan'], sup: ['b5'],
    text: '201 到 210 的鑰匙都掛著，只有 207 的鉤子是空的，吊牌寫著「5/5 護理長收」。\n旁邊一排三樓的鉤子全空，吊牌：「隔離房 2～7：交給大新」。' },
  { id: 'hc.17', title: '疑似病例通報單', src: 'note', words: ['w.sars', 'w.toTransfer'], sup: ['b6', 'b5'],
    text: '92/5/7　林秀英　護理長　體溫 38.9℃\n通報方式：自行通報\n隔離地點：2F 207（本人要求，不轉院）\n備註：本人要求任何人不得進入 207。' },
  { id: 'hc.18', title: '答錄機・2003/5/7', src: 'tape', words: ['w.better', 'w.gohome', 'w.callhelp'], sup: ['b6', 'b3'],
    text: '淑芬：阿母，是我。衛生局打電話來，說你發燒……你昨天不是說你很好？\n淑芬：我們會在後巷看你的燈。燈亮著，我們就知道你還在。\n小孩的聲音（三歲的你）：阿嬤，燈燈。' },
  { id: 'hc.19', title: '頭七', src: 'ghost', words: ['w.sars'], sup: ['b6', 'b5'],
    text: '第 7 次招魂燈熄的時候（阿嬤的頭七），207 門口的灰上有一雙護理鞋的腳印。\n「阿孫……你怎麼長這麼大了？」\n「阿嬤沒有得 SARS。是阿嬤自己說的，這樣就沒人敢開門。」' },
  { id: 'hc.20', title: '王醫師的電話', src: 'call', words: ['w.drho', 'w.lamp', 'w.needle'], sup: ['b1', 'b3', 'b4'],
    text: '「那天晚上，我把二樓的燈關掉。她把檯燈打開，擋在床前，說：『這間是我的病人。』」\n「針是我拿的。我拉她，針就……」\n「枕頭裡那一頁，留在 207。燈會一直亮著。對大家都好。」' },
  { id: 'hc.21', title: '金水伯：那一扇窗', src: 'call', words: ['w.xiaoling'], sup: ['b3', 'b0'],
    text: '「第 7 天晚上，整棟醫院黑漆漆，只有二樓亮著一盞燈。」\n「921 那年，我在山上揹一個女孩下山。是小美啦，電台的小美。」' },
  { id: 'hc.22', title: '耳語：燈不要關', src: 'ghost', words: [], sup: ['b3', 'b0'], text: '207 門口，右耳：「燈不要關……她怕黑。」' },
  { id: 'hc.23', title: '耳語：那支針', src: 'ghost', words: [], sup: ['b4'], text: '你用醫療包的時候，右耳：「那支針……阿嬤知道是什麼。」' },
  { id: 'hc.25', title: '小美：中秋', src: 'call', words: ['w.xiaoling'], sup: ['b0'],
    text: '「1999 年 9 月 24 號？……那天是中秋節耶。我那年中秋，應該在山上。我記得我上山……然後就不記得了。」' },
  { id: 'hc.26', title: '2003 年的廣播', src: 'tape', words: ['w.downstairs'], sup: ['b1'],
    text: '醫院廣播自己響了。是很舊的錄音，有雜訊：「林秀英護理長，請到一樓大廳。」' },
  { id: 'hc.27', title: '2F 北側配電箱', src: 'env', words: ['w.lamp', 'w.glass', 'w.lightoff'], sup: ['b3'],
    text: '維修工人 2003 年的紙條：「5/5 23:47　北側的燈被人切斷了（不是我們）。207 的檯燈，護理長自己接在紅色緊急插座上，不要拔。北側燈管破兩支，待換。」' },
  { id: 'hc.29', title: '保全的值班紀錄', src: 'note', words: ['w.guard'], sup: [],
    text: '大新保全　207 看燈值班紀錄　劉家豪\n2024/3/1　燈亮。\n2024/3/2　燈亮。\n（每天一行，一直寫到——）\n2026/8/12　燈亮。\n注意：燈如果熄了，立刻通知董事長本人。不准開門。不准對燈說話。' },
  { id: 'hc.30', title: '值班日記・最後一頁', src: 'note', words: [], sup: ['b4', 'b6'], key: true,
    text: '5/12　封院第 14 天。燒退一點。左手腫。\n207 今天眼睛有動。我跟她說：燈我會顧，等你自己醒來，自己關。\n如果我走了，告訴淑芬：我不是 SARS。是針。\n告訴阿孫：阿嬤沒有不要回家。' },
  { id: 'hc.31', title: '小美的工作證', src: 'env', words: ['w.xiaoling'], sup: ['b0'], text: '霧港之聲　中秋前夕特別節目　工作證\n小美（陳美玲）　1999/9/20　山上的研究站' },
  { id: 'hc.32', title: '阿嬤抱著你', src: 'photo', words: [], sup: [], text: '2000 年，新生兒室。阿嬤抱著滿月的你，保溫箱上放著一碗油飯和一疊床母衣。\n背面：「床母娘娘，保佑我的孫子。　秀英」（床母：保佑小嬰兒睡覺的神）' },
  { id: 'hc.33', title: '喚醒針傳單', src: 'note', words: [], sup: [], text: '讓每一位家人，都回得來。\n（背面，原子筆）我媽昨天叫了我的名字。她已經十年沒開口了。' },
  // 靈異事件的劇情回報(horror/lines.js STORY3;不解鎖詞,只加支持)
  { id: 'hc.34', title: '耳語：十四個晚上', src: 'ghost', words: [], sup: ['b5'], text: '燈泡晃動時，阿嬤說：「那盞燈……阿嬤守了十四個晚上。」' },
  { id: 'hc.35', title: '耳語：第 7 晚的廣播', src: 'ghost', words: [], sup: ['b1'], text: '「第 7 晚，廣播又叫阿嬤下樓。……阿嬤沒有去。」' },
  { id: 'hc.36', title: '耳語：那個藥', src: 'ghost', words: [], sup: [], text: '「又一床……他們給他打了那個藥。」' },
  { id: 'hc.37', title: '收音機・1999/9/21 01:47', src: 'tape', words: [], sup: ['b0'], text: '「……現在時間，凌晨一點四十七分。這裡是山上的現場，我們——」' },
  { id: 'hc.38', title: '耳語：那晚的燈', src: 'ghost', words: [], sup: ['b3'], text: '「封院第 7 晚……那天的燈，也是這樣熄掉的。」' },
  { id: 'hc.39', title: '207 裡面有人', src: 'ghost', words: [], sup: ['b0', 'b3'], text: '「207 的燈不能熄。……裡面有人。」牆上、霜上都寫著 207。' },
  { id: 'hc.40', title: '牆上的正字', src: 'env', words: [], sup: [], text: '封院十四天的計數：「正正止」。第七天那一筆特別用力。' },
  { id: 'hc.41', title: '01:47', src: 'env', words: [], sup: ['b0'], text: '牆上、霜上出現「01:47」。207 床頭那支女用電子錶停在 01:47：小美從山上被挖出來時戴著的錶。' },
  { id: 'hc.42', title: '寫給淑芬的信・封院第 5 天', src: 'note', words: [], sup: ['b3', 'b0'], text: '207 那個病人沒有名字，可是我越來越覺得我知道她是誰。\n妳晚上帶阿孫來後巷，看二樓那排窗，數過來第七個。燈亮著，就是我在。' },
  { id: 'hc.43', title: '大新試藥紀錄・3F・2003', src: 'note', words: [], sup: ['b2', 'b1'], text: '5/4　林護理長上樓問三樓的事，不予回答。\n5/5　原料不足，今晚 207 補採。\n5/7　3 號、5 號死亡。死因依專案登記。' },
];
export const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// 紙本 id → 卡(notes.js 的 points 'card:hc.xx' 優先;這裡是備援)
export const NOTE_CARD = { H01: 'hc.33', H02: 'hc.42', H03: 'hc.31', H05: 'hc.06', H06: 'hc.10', H07: 'hc.43', H10: 'hc.30', 'h.s04': 'hc.04', 'h.s07': 'hc.11', 'h.s08': 'hc.12', 'h.s09': 'hc.08', 'h.s21': 'hc.03', 'h.s23': 'hc.07', 'h.s25': 'hc.17',
  'h.c01': 'hc.01', 'h.c09': 'hc.09', 'h.c14': 'hc.14', 'h.c16': 'hc.16', 'h.c27': 'hc.27', 'h.c05': 'hc.05', 'h.c13': 'hc.13' };
// 鬼的耳語 / 廣播的 id → 卡
export const WHISPER = { 'h.w02': 'hc.22', 'h.w07': 'hc.23', 'pa.4': 'hc.26', 'ph.1': 'hc.26', 'h.w.tc2': 'hc.19' };
// 看(準心停 0.8 秒、3 m 內):互動物件 id 或特殊位置
export const LOOK = [
  { card: 'hc.15', at: 'door207' },
  { card: 'hc.13', id: 'h.ix.memorial' },
  { card: 'hc.16', id: 'h.look.keys' },
  { card: 'hc.27', id: 'h.look.panel2f' },
  { card: 'hc.01', id: 'h.look.lockdown' },
];

// 說出口的台詞(對講機、廣播、鬼):[字幕標籤, 台詞, 秒數]
export const TALK = {
  kimsui1: [
    ['對講機 · 金水伯', '2003 年，阿伯每天晚上來地下室送便當。', 4.2],
    ['對講機 · 金水伯', '第 7 天晚上，整棟醫院黑漆漆。\n只有二樓，亮著一盞燈。', 4.4],
    ['對講機 · 金水伯', '我在後巷，一直看到天亮。', 2.4],
    ['對講機 · 金水伯', '她說：燈熄了，就是我不在了。\n……那盞燈，一直亮到第 15 天。', 5.2],
  ],
  kimsui2: [
    ['對講機 · 金水伯', '921 那年，我在山上揹一個女孩下山。', 4.2],
    ['對講機 · 金水伯', '是小美啦。電台的小美。', 2.6],
    ['對講機 · 金水伯', '我揹她下山，隔天就是中秋。\n……後來，聽說她走了。', 5.0],
  ],
  xiaoling: [
    ['收音機 · 小美', '1999 年 9 月 24 號？……那天是中秋節耶。', 3.8],
    ['收音機 · 小美', '我那年中秋，應該在山上。', 2.8],
    ['收音機 · 小美', '我記得我上山……然後就不記得了。', 3.4],
  ],
  kimsui3: [
    ['對講機 · 金水伯', '……少年仔，你是秀英的孫，對不對？', 3.6],
    ['對講機 · 金水伯', '阿伯早就看出來了。\n你小時候常在護理站等她下班，', 4.2],
    ['對講機 · 金水伯', '阿伯都拿一顆球給你。……好啦，快去。', 3.6],
  ],
  bookTeach: [['收音機 · 小美', '你撿到的東西，我記在筆記本了。\n按 J 打開。', 3.6]],
  cctvAfter: [['收音機 · 小美', '……快轉。我不想看人打架。', 2.8]],
};

// 擲筊(HOSPITAL_CLUES_v2 §1.3):m = 7:7 聖筊;4～6 笑筊;0～3 陰筊
export const THROW = {
  hold: 1.5, anim: 3.0,
  judge: (n, m) => (n === m ? 'sheng' : n * 2 >= m ? 'xiao' : 'yin'),
  name: { sheng: '聖筊', xiao: '笑筊', yin: '陰筊' },
  text: { sheng: '聖筊——全對了！', xiao: '笑筊——對了 {n} 個（共 {m} 個），還差一點。', yin: '陰筊——對了 {n} 個（共 {m} 個），不太對。' },
  notReady: '筆記本還有空格。',
};
