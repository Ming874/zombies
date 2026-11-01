# 廢棄醫院 · 殭屍生存 (FPS)

Three.js + Vite 的第一人稱寫實風殭屍遊戲。場景是破爛的醫院,撐過一回合又一回合。

## 執行
```
npm install
npm run dev      # http://localhost:5173
npm run build
```

## 操作
| 按鍵 | 功能 |
|---|---|
| WASD / Shift | 移動 / 奔跑(奔跑時不能開槍) |
| 滑鼠左鍵 / R | 射擊 / 換彈 |
| 1-4 或滾輪 | 切換武器(手槍/左輪/AK-47/M4A1) |
| F | 手電筒 |
| E | 開關門／在商店櫃台開啟商店 |
| M | 地圖(PgUp/PgDn 翻樓層) |
| N | 商店階段/休息時立即開始下一回合 |

## 規則
- 殭屍血量 150,頭頂血條 150 綠 → 100 橘 → 50 紅(中間漸變);爆頭 2 倍傷害。
- 每隻殭屍死亡掉 5 枚金幣,疊在同一個地方;**回合結束時所有金幣自動飛進你的庫存**。
- 每 **5 回合**結束,醫院大門(南側玄關)出現商店:左輪 100、AK-47 250、M4A1 400、彈藥補給 100(已擁有的槍補彈半價)。
- 起始武器為手槍;每回合結束回 25 血,每回合開始補給彈藥。

## 地圖
聖心醫院四層樓(B1、1F、2F、3F/頂樓)與戶外(停車場、墓園、遊戲場…),取自 test 分支(`src/map/`、貼圖 `public/textures/`、道具模型 `public/models/props/`)。
- 各房間的主題道具與劇情佈景只當裝飾,沒有劇情或驚嚇事件;天氣有雨、積水反光、閃電與雨聲(`src/map/weather.js`)。
- 門可以按 E 開關,關著的門殭屍會推開(`src/interact/`)。按 M 打開紙本地圖(PgUp/PgDn 翻樓層,走過的地方才會變清楚)。
- 出怪:從離玩家 14m 以外、走路距離 60m 以內的出生點隨機挑選(`src/game.js` 的 `spawnZombie`)。
- 商店是一樓便利商店(金水商行)的店面,每 5 回合結束時拉起捲門。

## 武器模型
程式生成的槍模與第一人稱戴手套的雙手、槍口火光取自 test 分支(`src/weapons/models.js`、`flash.js`);數值仍在 `src/weapons/weapon.js` 的 `WEAPONS`。

## 殭屍外觀
殭屍只有一種玩法(血量、速度、攻擊都相同),外觀隨機:
- 程式生成(`src/zombies/model.js`、`looks.js`):行屍、狂奔者、膿腫者、巨屍、尖叫者、潛行者、手術者、焦屍、清理隊員、束縛病患,
  屍斑/傷口/血跡畫在頂點色上,皮膚 shader 有濕潤反光、次表面散射、手電筒照到的眼睛反光、焦屍裂縫餘燼(`materials.js`)。
  建模在背景 Worker 執行(`src/sys/workers.js`),貼圖在貼圖 Worker 用 OffscreenCanvas 畫(`materials.paint.js`)。
- 寫實角色(`public/models/zombies/*.glb`,Microsoft Rocketbox,MIT,署名見 `public/credits/zombie-models.md`):
  護士、醫生、警衛、工人、男人、老人、女人、運動員、慢跑者、救護員;網址加 `?noreal` 只用程式生成。
- 各外觀的姿勢動畫在 `src/zombies/poses.js`;射擊判定打掛在骨骼上的隱形命中盒(頭 = 爆頭)。

## 配樂
- 錄音配樂(`public/audio/music/`,署名見 `public/credits/music.md`)由 `src/audio/tracks.js` 串流、雙唱盤無縫交叉淡化:
  選單、回合中依殭屍距離與戰鬥強度自動在探索/緊張/激戰間切換、每 5 回合的高潮回合、休息、商店、死亡;回合開始刺擊與結束銅鑼。
- 程式合成配樂(`src/audio/music.js`):低頻 drone、不和諧弦樂、低血量心跳、戰鬥脈動與隨機點綴,有錄音配樂時自動退到背景。
- 瀏覽器要求互動後才能播放聲音:第一次點擊或按鍵就開始播放。

## 數值調整
武器數值集中在 `src/weapons/weapon.js` 的 `WEAPONS`;回合殭屍數量在 `src/game.js` 的 `startRound`。
