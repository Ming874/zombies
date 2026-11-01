# 靈異系統(src/horror、src/audio/ghost.js)素材

- 耳邊低語、頸後呼吸、刺擊、寂靜、天花板爬行、玻璃吱聲、濕腳步、刮字、推車輪子、電梯、燈管斷電、搖籃曲哼唱、寒風與冷霧:全部是 WebAudio 程式合成(本專案原創),沒有新增錄音檔。
- 低語底層氣聲沿用既有的錄音 `audio/world/whispers_1.mp3`、`whispers_2.mp3`、`whispers_3.mp3`(CC-BY,作者與連結見 `audio.md`:Litruv、dimbark1、geoneo0)。
- 音樂盒、電話鈴、電視雜訊、孩童笑聲沿用既有的驚嚇音(見 `audio.md`)。
- 幻影模型沿用 `src/zombies/model.js` 的程式建模(倖存者外觀 + 指定服裝),烘焙成靜態姿勢;霜花、手印、腳印、牆上字跡、隔簾剪影、鏡中臉、電視雜訊都是執行時 canvas 繪製(原創)。
- 牆上字跡的手寫字型使用玩家系統內建字型(標楷體/微軟正黑體等),不隨遊戲散布字型檔。
