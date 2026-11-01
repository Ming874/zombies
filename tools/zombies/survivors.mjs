// 倖存者(多人連線的玩家角色)的來源角色:健康外觀(不做殭屍化,只算皮膚遮罩;右手握槍、左手托護木的手指姿勢)。
// 順序 = src/zombies/model.js 的 SURVIVOR_LOOKS(座位 0..7):tactical、medic、worker、hoodie、police、hunter、firefighter、biker
export const SURVIVORS = [
  { id: 'soldier', src: 'Professions/Military_Male_02' },
  { id: 'medic', src: 'Professions/Medical_Female_03', fem: 1 },
  { id: 'builder', src: 'Professions/Construction_Male_08' },
  { id: 'hoodie', src: 'Adults/Female_Adult_12', fem: 1 },
  { id: 'police', src: 'Professions/Police_Male_06' },
  { id: 'hunter', src: 'Adults/Male_Adult_05' },
  { id: 'firefighter', src: 'Professions/Fire_Male_06' },
  { id: 'biker', src: 'Adults/Female_Adult_04', fem: 1 },
];
