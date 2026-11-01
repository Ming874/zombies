// 「回憶」:走著走著,滑進那個地方以前發生的事(2003 年封院;STORY_v2 §1、HOSPITAL_CLUES_v2 §2)。
// 資料表(劇情組可直接改):每一段回憶
//   id、title(筆記本/記錄用)、when(劇中時間)、where(地點)、who/why(誰、為什麼放這一段)
//   zone(區域 id)、cell [c, r](該層格子;世界座標 = 格子 × 2 + 1)或 anchor(區域內最近的道具錨點種類)或 win(最近的窗)、
//   side [c, r](這個格子的方向當作「旁邊」+v,例如 207 的門)、r 觸發半徑(m,預設 5.5)、bed 2003 的背景聲('ward'|'lobby'|'night'|'dock')、
//   lights 'on'(2003 年燈是好的;預設)| 'keep'(不動燈)、dur 長度(秒)、
//   card 筆記本的線索卡(HOSPITAL_CLUES_v2;播到 60% 以上或 card 那一拍就收)、
//   gate { act 最早第幾幕、any 這些卡/旗標任一個有了才放(有 objectives/deduce 時才看;沒有就只看幕)、after 要先放過哪一段 }
//   cast 回音人影:{ id, fig('nurse'|'patient'|'man'|'child'), pose, at [u, v], path [[u, v]…], speed, t 出現, end 消失,
//                 face 'e+'|'e-'|'v+'|'v-'|'player'|[u, v], look('pale' 褐色回音 | 'shade' 背光剪影), alpha, out(在窗外,用一樓的高度) }
//     座標 [u, v]:原點是回憶的地點;u 沿著走廊/房間的長軸,往玩家走進來的方向是 +u;v 是旁邊(有 side 時 +v 朝 side)
//   beats 時間軸:{ t, say 台詞, who 字幕標籤, from 誰說的(cast id | 'pa' | 'phone' | 'near'), pace 慢一點 } |
//                 { t, fx 'pa'|'phone'|'clip'|'scrawl'|'knock'|'steps'|'squeak'|'shutter'|'water'|'lightsOut'|'struggle' , from } | { t, card: true }
// 語言：2003 年的人都說國語，每句最多一個調味台語詞；廣播與大新的人說制式國語（CLARITY_PLAN §5）。尊重原則(STORY_v2 §10):醫護是守在裡面的人;不描繪真實人物;沒有兒童死亡。
export const MEMORIES = [
  { id: 'm.lockdown', title: '封院', when: '2003/4/29 12:00(封院第 1 天)', where: '1F 大廳', who: '院內的人、阿嬤', why: '一切的開始:衛生局公告封院十四日',
    zone: 'f1_lobby', r: 7, bed: 'lobby', dur: 17, card: 'hc.01', gate: { act: 1 },
    cast: [
      { id: 'a', fig: 'man', pose: 'stand', at: [3, -1.6], face: 'e+' }, { id: 'b', fig: 'patient', pose: 'stand', at: [3.6, 0.4], face: 'e+' },
      { id: 'c', fig: 'man', pose: 'stand', at: [2.6, 1.8], face: 'e+' }, { id: 'n', fig: 'nurse', pose: 'stand', at: [1.4, 0.2], face: 'e+', t: 9 },
      { id: 'w', fig: 'man', pose: 'stand', at: [3.2, -0.2], path: [[6.5, -0.2]], speed: 0.9, t: 7.5, face: 'e+' },
    ],
    beats: [
      { t: 1.2, fx: 'pa' }, { t: 2.6, say: '霧港市衛生局公告。\n聖心醫院從今天中午起，封院十四天。', from: 'pa' },
      { t: 7.4, say: '院內所有人員，一律不得離開。', from: 'pa' },
      { t: 10.2, say: '我太太還在外面等我……', who: '家屬', from: 'w' },
      { t: 13.0, say: '先生，先坐。我們會陪著你。', who: '護理長', from: 'n' },
    ] },
  { id: 'm.temp', title: '量體溫', when: '2003/5/3(封院第 5 天)', where: '2F 護理站', who: '阿嬤、排隊的病人與家屬', why: '封院期間一天量兩次體溫;值班日記 5/3 那一行就是這樣寫的',
    zone: 'f2_corridor', cell: [39, 15], r: 6, bed: 'ward', dur: 18, card: 'hc.07', gate: { act: 1 },
    cast: [
      { id: 'n', fig: 'nurse', pose: 'stand', at: [1.6, 0], face: 'e-' },
      { id: 'q1', fig: 'patient', pose: 'stand', at: [0.4, 0], path: [[0.7, 0]], speed: 0.3, face: 'e+', end: 7 },
      { id: 'q2', fig: 'man', pose: 'stand', at: [-0.8, 0.1], path: [[0.4, 0]], speed: 0.35, t: 0.2, face: 'e+' },
      { id: 'q3', fig: 'patient', pose: 'tilt', at: [-2, -0.1], path: [[-0.8, 0]], speed: 0.35, t: 0.2, face: 'e+' },
      { id: 'q4', fig: 'man', pose: 'stand', at: [-3.2, 0.1], path: [[-2, 0]], speed: 0.35, t: 0.2, face: 'e+' },
    ],
    beats: [
      { t: 1.4, say: '下一位。……耳朵借我一下。', who: '護理長', from: 'n' },
      { t: 5.0, say: '三十六度五，好。', who: '林護理長', from: 'n' },
      { t: 8.0, say: '一天量兩次，早晚都要量，不要忘記。', who: '護理長', from: 'n' },
      { t: 12.0, fx: 'clip', from: 'n' }, { t: 12.6, say: '5 月 3 號，全部的人量兩次體溫。207，正常。', who: '護理長', from: 'n', pace: true },
    ] },
  { id: 'm.gossip', title: '護理站的閒話', when: '2003/5/3 深夜', where: '2F 護理站', who: '兩位護理師、阿嬤', why: '閒話本上的話(錯的推論「王醫師的親人」也從這裡來);阿嬤交代晚上不要下樓',
    zone: 'f2_corridor', cell: [39, 17], r: 5, bed: 'night', dur: 16, card: 'hc.11', gate: { act: 1 },
    cast: [
      { id: 'a', fig: 'nurse', pose: 'stand', at: [0.8, -0.6], face: 'v+' }, { id: 'b', fig: 'nurse', pose: 'stand', at: [0.8, 0.6], face: 'v-' },
      { id: 'n', fig: 'nurse', pose: 'stand', at: [-5, 0], path: [[-0.6, 0]], speed: 1.1, t: 5.5, face: 'e+' },
    ],
    beats: [
      { t: 1.2, say: '聽說 207 是王醫師的親人，\n所以他每個禮拜都親自來。', who: '護理師', from: 'a' },
      { t: 5.2, say: '亂講，王醫師還沒結婚。', who: '護理師', from: 'b' },
      { t: 9.4, say: '好了，不要講了。', who: '護理長', from: 'n' },
      { t: 11.6, say: '晚上不管廣播叫誰，都不要下樓。', who: '護理長', from: 'n' },
    ] },
  { id: 'm.dock', title: '鐵網邊', when: '2003/5/2 夜(封院第 4 天)', where: 'B1 裝卸平台', who: '金水伯、阿嬤', why: '金水伯每晚隔著鐵網送便當;他說起九二一揹下山的女孩(阿嬤想起 207 的無名氏也是九二一送來的)',
    zone: 'b1_dock', r: 7, bed: 'dock', dur: 21, card: 'hc.14', gate: { act: 1 },
    cast: [
      { id: 'k', fig: 'man', pose: 'stand', at: [2.6, 0], face: 'e-' },
      { id: 'n', fig: 'nurse', pose: 'stand', at: [0.7, 0.2], face: 'e+' },
    ],
    beats: [
      { t: 1.2, say: '十四個便當啦。護理長，簽收一下。', who: '金水伯', from: 'k' },
      { t: 4.4, say: '金水哥，謝謝。', who: '護理長', from: 'n' },
      { t: 7.0, say: '921 那年，我從山上揹了一個女孩子下來……', who: '金水伯', from: 'k' },
      { t: 11.4, say: '交給王醫師。他說，送到醫院就已經沒救了。', who: '金水伯', from: 'k' },
      { t: 16.0, say: '……207 那個沒有名字的病人，也是 921 送來的。', who: '護理長', from: 'n', pace: true },
    ] },
  { id: 'm.pa', title: '廣播', when: '2003/5/4 22:10(封院第 6 天)', where: '1F 大廳北口的柱子', who: '阿嬤', why: '廣播把她叫下樓,大廳沒有人;她在柱子上寫下「不要相信廣播」',
    zone: 'f1_lobby', cell: [25, 27], r: 6, bed: 'night', dur: 19, card: 'hc.02', gate: { act: 2, any: ['hc.03', 'hc.04', 'h.where207'] },
    cast: [
      { id: 'n', fig: 'nurse', pose: 'stand', at: [-6, 0.6], path: [[-1.6, 0.6], [-0.9, 0.2]], speed: 1.5, t: 3.2, face: 'e+' },
      { id: 'w', fig: 'nurse', pose: 'reach', at: [-0.5, 0.05], t: 13.2, face: 'e+' },
    ],
    beats: [
      { t: 0.9, fx: 'pa' }, { t: 2.2, say: '林秀英護理長，請到一樓大廳。\n林秀英護理長，請到一樓大廳。', from: 'pa' },
      { t: 8.6, say: '……有人找我嗎？', who: '護理長', from: 'n' },
      { t: 11.2, say: '……沒有人。', who: '護理長', from: 'n', pace: true },
      { t: 13.3, fx: 'scrawl', from: 'w' }, { t: 14.0, say: '……不要相信廣播。', who: '護理長', from: 'w' },
    ] },
  { id: 'm.3f', title: '三樓的門', when: '2003/5/4(封院第 6 天)', where: '3F 東樓梯口', who: '阿嬤、大新的研究員', why: '阿嬤上樓問三樓六個病人的事,大新不予回答(大新專案 3F 觀察紀錄 5/4)',
    zone: 'f3_stair_e', r: 6, bed: 'night', dur: 17, card: 'hc.43', gate: { act: 2 },
    cast: [
      { id: 'm', fig: 'man', pose: 'stand', at: [1.4, 0], face: 'e-' },
      { id: 'n', fig: 'nurse', pose: 'stand', at: [-0.3, 0], face: 'e+', end: 15 },
    ],
    beats: [
      { t: 1.0, say: '三樓那六個病人，為什麼家屬都不能看？', who: '護理長', from: 'n' },
      { t: 4.8, say: '依照封院規定。', who: '大新的人', from: 'm' },
      { t: 7.2, say: '封院規定，沒有說要每天打針。', who: '護理長', from: 'n' },
      { t: 10.4, say: '護理長，這是大新的專案。請回二樓。', who: '大新', from: 'm' },
      { t: 14.0, say: '……醫生不是這樣做的。', who: '護理長', from: 'n', pace: true },
    ] },
  { id: 'm.day7', title: '第七晚', when: '2003/5/5 23:40–23:52(封院第 7 天)', where: '2F 北走廊,207 門口', who: '阿嬤、王醫師', why: '推理題的那一夜:廣播又叫她下樓,她沒去;燈被切斷,王醫師拿著採血針走進 207;她開了檯燈,擋在床前',
    zone: 'f2_corridor', cell: [37, 12], side: [37, 11], r: 6, bed: 'night', dur: 22, card: 'hc.38', gate: { act: 3, any: ['hc.03', 'hc.04', 'hc.05', 'hc.27', 'h.ev.ho'] },
    cast: [
      { id: 'n', fig: 'nurse', pose: 'stand', at: [-1.8, 0.4], face: 'v+', end: 9.6 },
      { id: 'h', fig: 'man', pose: 'stand', at: [-8, 0], path: [[-1.2, 0.2], [0, 1.1]], speed: 1.5, t: 6.4, end: 11.4, face: 'e+' },
      { id: 'n2', fig: 'nurse', pose: 'stand', at: [-1.6, 0.5], path: [[0.1, 1.1]], speed: 2.2, t: 9.6, end: 12.2, face: 'v+' },
      { id: 'h2', fig: 'man', pose: 'stand', at: [0, 1.0], path: [[-1, 0], [-9, -0.2]], speed: 1.8, t: 17.2, face: 'e-' },
    ],
    beats: [
      { t: 0.8, fx: 'pa' }, { t: 2.0, say: '林秀英護理長，請到一樓大廳。', from: 'pa' },
      { t: 4.4, say: '……我不去。', who: '護理長', from: 'n' },
      { t: 5.8, fx: 'lightsOut' },
      { t: 12.6, say: '這間是我的病人。', who: '林護理長', from: 'near' },
      { t: 14.6, say: '護理長，讓開。這是研究需要。', who: '王醫師', from: 'near' },
      { t: 16.4, fx: 'struggle' },
      { t: 18.6, say: '……你會後悔的。', who: '王醫師', from: 'h2' },
    ] },
  { id: 'm.needle', title: '那支針', when: '2003/5/5 23:52', where: '2F 護理站', who: '阿嬤', why: '針扎在左手背;她寫了針扎通報單,沒有交出去',
    zone: 'f2_corridor', cell: [39, 16], r: 5, bed: 'night', lights: 'keep', dur: 15, card: 'hc.12', gate: { act: 3, after: 'm.day7' },
    cast: [{ id: 'n', fig: 'nurse', pose: 'tilt', at: [0.6, 0], face: 'e-' }],
    beats: [
      { t: 0.8, fx: 'water', from: 'n' },
      { t: 2.4, say: '……那支針。', who: '護理長', from: 'n', pace: true },
      { t: 6.0, fx: 'clip', from: 'n' }, { t: 6.6, say: '這張單子……先不要交。', who: '護理長', from: 'n' },
      { t: 9.4, say: '交出去，他們就會來開門。', who: '護理長', from: 'n' },
    ] },
  { id: 'm.lock', title: '不要開門', when: '2003/5/5 23:55', where: '207 門口', who: '阿嬤', why: '她走進 207,從裡面反鎖,用口紅在門玻璃上反著寫「莫開門」;從這一夜起,207 的燈沒有再關',
    zone: 'f2_corridor', cell: [37, 12], side: [37, 11], r: 5.5, bed: 'night', lights: 'keep', dur: 16, card: 'hc.15', gate: { act: 3, after: 'm.needle' },
    cast: [
      { id: 'n', fig: 'nurse', pose: 'stand', at: [-4, 0], path: [[-0.3, 0.4], [0, 0.9]], speed: 1.0, end: 6.4, face: 'e+' },
      { id: 'w', fig: 'nurse', pose: 'reach', at: [0, 1.15], t: 6.4, end: 13, face: 'v+' },
    ],
    beats: [
      { t: 2.0, say: '燈如果熄了，就是我不在了。', who: '護理長', from: 'n' },
      { t: 7.0, fx: 'squeak', from: 'w' }, { t: 7.6, say: '不要……開……門。', who: '護理長', from: 'w', pace: true },
      { t: 12.6, fx: 'knock', from: 'w' },
    ] },
  { id: 'm.window', title: '後巷的燈', when: '2003/5/8 夜(封院第 10 天)', where: '2F 北側的窗', who: '阿嬤、女兒、三歲的你、金水伯', why: '家人每晚在後巷看二樓的燈;記者在鐵網外拍下她舉著紙的照片(遺照)',
    zone: 'f2_corridor', win: [37, 9], r: 5, bed: 'night', lights: 'keep', dur: 18, card: 'hc.13', gate: { act: 2 },
    cast: [
      { id: 'n', fig: 'nurse', pose: 'reach', at: [-0.6, 0], face: 'e+' },
      { id: 'd', fig: 'patient', pose: 'stand', look: 'shade', at: [2.9, -0.5], face: 'e-', out: true, alpha: 0.75 },
      { id: 'c', fig: 'child', pose: 'stand', look: 'shade', at: [2.7, 0.25], face: 'e-', out: true, alpha: 0.75 },
      { id: 'k', fig: 'man', pose: 'stand', look: 'shade', at: [4.4, 0.9], face: 'e-', out: true, alpha: 0.6 },
    ],
    beats: [
      { t: 1.6, say: '阿母——', who: '淑芬', from: 'd' },
      { t: 4.2, say: '阿嬤，燈燈。', who: '小時候的你', from: 'c' },
      { t: 7.6, say: '免驚。阿嬤在這裡。', who: '護理長', from: 'n', pace: true },
      { t: 11.6, fx: 'shutter', from: 'k' },
      { t: 13.4, say: '燈亮著，我們就知道妳還在。', who: '女兒', from: 'd' },
    ] },
  { id: 'm.bedmother', title: '床母', when: '2000 年', where: '2F 新生兒室', who: '阿嬤、滿月的你', why: '關於你是誰:阿嬤抱著滿月的你拜床母(遺照旁那張「阿嬤抱著你」)',
    zone: 'f2_nursery', anchor: 'incubator', r: 5.5, bed: 'ward', dur: 15, card: 'hc.32', gate: { act: 1 },
    cast: [{ id: 'n', fig: 'nurse', pose: 'reach', at: [0.8, 0], face: 'e-' }],
    beats: [
      { t: 2.0, say: '床母娘娘，保佑我的孫子。', who: '護理長', from: 'n', pace: true },
      { t: 6.4, say: '乖孫，一晚長大一寸。', who: '護理長', from: 'n' },
      { t: 10.0, say: '阿嬤還要顧病人。……你先睡。', who: '護理長', from: 'n' },
    ] },
  { id: 'm.letter', title: '寫給淑芬的信', when: '2003/5/3(封院第 5 天)', where: '3F 宿舍', who: '阿嬤', why: '封院頭幾天護理人員輪流睡在三樓宿舍;她寫信給女兒(你的媽媽)',
    zone: 'f3_dorm', r: 6, bed: 'night', dur: 19, card: 'hc.42', gate: { act: 1 },
    cast: [{ id: 'n', fig: 'nurse', pose: 'tilt', at: [1.2, 0.6], face: 'e-' }],
    beats: [
      { t: 0.8, fx: 'scrawl', from: 'n' },
      { t: 1.6, say: '淑芬：醫院裡一切都好，妳不用擔心。', who: '護理長', from: 'n' },
      { t: 5.6, say: '晚上帶阿孫來後巷，\n看二樓那排窗，數過來第七個。', who: '護理長', from: 'n' },
      { t: 10.8, say: '燈亮著，就是我還在。', who: '護理長', from: 'n' },
      { t: 13.8, say: '阿孫如果哭，就跟他說：數到十，天就亮了。', who: '護理長', from: 'n', pace: true },
    ] },
];
