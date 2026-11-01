// 寫實殭屍的來源角色(Microsoft Rocketbox,MIT)與殭屍化參數。執行期的類型/變體表在 src/zombies/realistic.js(兩邊 id 要一致)。
// src:Rocketbox 的 Assets/Avatars 底下的路徑;fem 女性;old 老人(動畫層駝背);amp 生成時就缺的肢段(Z3.init 縮成 0 + 斷口)
// look:
//   seed 亂數種子、tint 死人膚色(grey/green/yellow/blue/ash)、pale 膚色替換程度、keepTone 保留原膚色深淺(0..1)
//   decay 腐敗(大理石紋、瘀青、表皮剝落)、blood 血量、mouthBlood 嘴邊流血、dirt 汙垢、sockets 眼窩發黑、eyes milky/red、smears 血手抹痕數
//   wounds:[{ kind: bite|gash, at: 部位(見 lib/bake.mjs plan 的 AT), r 半徑(公尺), len 撕裂長度倍數, drips 往下流的血道數, flow 血道長度倍數 }]
//   curl:手指彎曲 [根, 中, 末](弧度)
export const CHARACTERS = [
  {
    id: 'nurse', src: 'Professions/Medical_Female_01', fem: 1,
    look: { seed: 11, smears: 3, tint: 'grey', decay: 0.45, blood: 0.85, mouthBlood: 0.9, dirt: 0.45, wounds: [{ kind: 'bite', at: 'neckL', r: 0.024, drips: 4, flow: 1.4 }, { kind: 'gash', at: 'forearmR', r: 0.012, len: 4 }] },
  },
  {
    id: 'doctor', src: 'Professions/Medical_Male_01',
    look: { seed: 23, smears: 3, tint: 'green', decay: 0.55, blood: 0.90, mouthBlood: 0.7, dirt: 0.4, wounds: [{ kind: 'bite', at: 'shoulderR', r: 0.03, drips: 5, flow: 1.6 }, { kind: 'gash', at: 'belly', r: 0.016, len: 5 }] },
  },
  {
    id: 'paramedic', src: 'Professions/Medical_Male_02',
    look: { seed: 37, smears: 2, tint: 'yellow', decay: 0.4, blood: 0.70, mouthBlood: 1, dirt: 0.55, wounds: [{ kind: 'bite', at: 'forearmL', r: 0.026 }, { kind: 'gash', at: 'cheek', r: 0.008, len: 4, drips: 2, flow: 0.5 }] },
  },
  {
    id: 'guard', src: 'Professions/Security_Male_01', amp: 'handL',
    look: { seed: 41, smears: 2, tint: 'ash', keepTone: 0.75, decay: 0.6, blood: 0.80, mouthBlood: 0.6, dirt: 0.6, wounds: [{ kind: 'bite', at: 'neckR', r: 0.028, drips: 4 }, { kind: 'gash', at: 'thighL', r: 0.02, len: 4 }] },
  },
  {
    id: 'worker', src: 'Professions/Construction_Male_07',
    look: { seed: 53, smears: 2, tint: 'grey', decay: 0.5, blood: 0.65, mouthBlood: 0.8, dirt: 0.9, wounds: [{ kind: 'gash', at: 'side', r: 0.02, len: 5, drips: 4 }, { kind: 'bite', at: 'forearmR', r: 0.024 }] },
  },
  {
    id: 'man', src: 'Adults/Male_Adult_08',
    look: { seed: 67, smears: 3, tint: 'blue', decay: 0.65, blood: 0.85, mouthBlood: 0.85, dirt: 0.5, wounds: [{ kind: 'bite', at: 'neckL', r: 0.03, drips: 5, flow: 1.5 }, { kind: 'bite', at: 'upperArmR', r: 0.024 }] },
  },
  {
    id: 'oldman', src: 'Adults/Male_Adult_03', old: 1,
    look: { seed: 71, smears: 2, tint: 'yellow', decay: 0.8, blood: 0.60, mouthBlood: 0.5, dirt: 0.6, sockets: 1, wounds: [{ kind: 'bite', at: 'forearmL', r: 0.026 }, { kind: 'gash', at: 'scalp', r: 0.01, len: 4, drips: 3 }] },
  },
  {
    id: 'woman', src: 'Adults/Female_Adult_08', fem: 1,
    look: { seed: 83, smears: 3, tint: 'green', decay: 0.55, blood: 0.90, mouthBlood: 1, dirt: 0.5, wounds: [{ kind: 'bite', at: 'shoulderL', r: 0.026, drips: 4, flow: 1.3 }, { kind: 'gash', at: 'thighR', r: 0.016, len: 4 }] },
  },
  {
    id: 'athlete', src: 'Professions/Sports_Male_04',
    look: { seed: 97, smears: 2, tint: 'grey', decay: 0.35, blood: 0.95, mouthBlood: 1, dirt: 0.45, eyes: 'red', wounds: [{ kind: 'bite', at: 'neckR', r: 0.03, drips: 5, flow: 1.7 }, { kind: 'gash', at: 'shinL', r: 0.016, len: 4 }] },
  },
  {
    id: 'jogger', src: 'Professions/Sports_Female_02', fem: 1,
    look: { seed: 101, smears: 3, tint: 'blue', decay: 0.4, blood: 0.90, mouthBlood: 0.9, dirt: 0.45, eyes: 'red', wounds: [{ kind: 'bite', at: 'forearmR', r: 0.026, drips: 3 }, { kind: 'gash', at: 'torso', r: 0.014, len: 5 }] },
  },
];
