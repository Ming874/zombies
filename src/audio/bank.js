// 錄音樣本庫(src/audio/samples.js 讀取):main 的音效是合成的,沒有一次性樣本;
// 環境音床(LOOPS)由 src/audio/weather.js 登記雨聲錄音(public/audio/rain/)
export const CATS = [];
export const LAZY = new Set();
export const BANK = {};
export const LOOPS = {};
// 錄音配樂(串流,檔案在 public/audio/music/,署名見 public/credits/music.md):依配樂狀態挑選。
// g 音量(已含 LUFS 對齊)、loop 循環、dur 長度(秒)、xf 結尾交叉淡化秒數
export const TRACKS = {
  menu: [{ f: 'music/menu_theme_loop.mp3', g: 0.596, loop: true, dur: 120.5, xf: 5 }],
  explore: [{ f: 'music/explore_loop_1.mp3', g: 0.733, loop: true, dur: 136.5, xf: 5 }, { f: 'music/explore_loop_2.mp3', g: 0.955, loop: true, dur: 103.3, xf: 5 }, { f: 'music/ambient_bed_depths_loop.mp3', g: 0.784, loop: true, dur: 59.6, xf: 5 }, { f: 'music/ambient_bed_passages_loop.mp3', g: 0.455, loop: true, dur: 31.8, xf: 5 }],
  tension: [{ f: 'music/tension_loop.mp3', g: 0.933, loop: true, dur: 116.2, xf: 5 }, { f: 'music/ambient_bed_dark_loop.mp3', g: 0.524, loop: true, dur: 38.9, xf: 5 }],
  fight: [{ f: 'music/combat_loop_1.mp3', g: 0.661, loop: true, dur: 119.0, xf: 5 }, { f: 'music/combat_loop_2.mp3', g: 0.813, loop: true, dur: 62.5, xf: 5 }],
  boss: [{ f: 'music/boss_loop_1.mp3', g: 0.708, loop: true, dur: 52.0, xf: 5 }, { f: 'music/boss_loop_2.mp3', g: 0.624, loop: true, dur: 96.5, xf: 5 }],
  break: [{ f: 'music/break_calm_loop.mp3', g: 0.794, loop: true, dur: 119.6, xf: 5 }],
  shop: [{ f: 'music/break_calm_loop.mp3', g: 0.794, loop: true, dur: 119.6, xf: 5 }],
  dead: [{ f: 'music/game_over_sting.mp3', g: 1.627, loop: false, dur: 19.6, xf: 2 }],
};
// 一次性配樂刺擊(串流):回合開始、回合結束銅鑼
export const STINGS = {
  round: { f: 'music/wave_start_sting.mp3', g: 1.514, dur: 15.2 },
  gong: { f: 'music/round_end_gong.mp3', g: 0.861, dur: 11.8 },
};
