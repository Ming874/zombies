import c1 from './c1_render.js';
import c2 from './c2_triangles.js';
import c3 from './c3_light.js';
import c4 from './c4_mood.js';
import c5 from './c5_motion.js';
import c6 from './c6_physics.js';
import c7 from './c7_ai.js';
import c8 from './c8_more.js';

// 章節(順序 = 上課順序);每章的場景在 c*.js,欄位說明見 src/teach/kit.js 開頭
export const CHAPTERS = [
  { title: '畫面是程式畫出來的', sub: '場景 · 相機 · 每秒 60 張' },
  { title: '三角形的魔法', sub: '每個模型都是三角形拼的' },
  { title: '光、顏色與材質', sub: '為什麼看起來像真的' },
  { title: '氣氛魔法', sub: '回到醫院,調整真正的遊戲畫面' },
  { title: '讓角色動起來', sub: '骨架 · 關鍵影格 · 布娃娃' },
  { title: '碰撞、射擊、重力', sub: '遊戲怎麼知道你打中了' },
  { title: '殭屍的大腦', sub: '狀態機 · 尋路 · 聽聲音' },
  { title: '聲音、連線、效能', sub: '把所有積木疊起來' },
];

export const LESSONS = [c1, c2, c3, c4, c5, c6, c7, c8].flatMap((list, ch) => list.map((l) => ({ ...l, ch })));
