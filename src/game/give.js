import { WEAPONS, ORDER } from '../weapons/weapon.js';
import { sfx } from '../audio.js';

// ===== 控制面板 /give 的物品表與套用 =====
// 單人:直接套用到本機玩家;多人:房主把 [物品, 數量] 送給對方(src/net/session.js 'gv'),對方用同一個 applyGive 套用。
// count:數量(金幣 = 金額;武器/彈藥/護甲/生命不用數量)

const MAX_STACK = 99;

// key → { name 名稱, short 短名(物品格子), cat 種類(控制面板分色), desc 一行說明, kind 套用方式, def 預設數量, aliases 中英文別名 }
// 有 def 的物品才吃數量;max 是上限
export const ITEMS = {
  pistol: { name: WEAPONS.pistol.name, short: '手槍', cat: 'weapon', kind: 'weapon', desc: WEAPONS.pistol.desc, aliases: ['glock', '手槍'] },
  revolver: { name: WEAPONS.revolver.name, short: '左輪', cat: 'weapon', kind: 'weapon', desc: WEAPONS.revolver.desc, aliases: ['python', '左輪', '左輪手槍'] },
  shotgun: { name: WEAPONS.shotgun.name, short: '霰彈槍', cat: 'weapon', kind: 'weapon', desc: WEAPONS.shotgun.desc, aliases: ['870', '霰彈槍', '散彈槍'] },
  ak47: { name: WEAPONS.ak47.name, short: 'AK-47', cat: 'weapon', kind: 'weapon', desc: WEAPONS.ak47.desc, aliases: ['ak', 'ak-47'] },
  m4a1: { name: WEAPONS.m4a1.name, short: 'M4A1', cat: 'weapon', kind: 'weapon', desc: WEAPONS.m4a1.desc, aliases: ['m4'] },
  barrett: { name: WEAPONS.barrett.name, short: '巴雷特', cat: 'weapon', kind: 'weapon', desc: WEAPONS.barrett.desc, aliases: ['m82', 'sniper', '巴雷特', '狙擊槍'] },
  rpg: { name: WEAPONS.rpg.name, short: 'RPG-7', cat: 'weapon', kind: 'weapon', desc: '火箭筒，火箭彈一起補滿', aliases: ['rpg7', 'rpg-7', 'bazooka', '火箭筒'] },
  rocket: { name: '火箭彈', short: '火箭彈', cat: 'ammo', kind: 'rocket', def: 3, max: MAX_STACK, desc: 'RPG-7 的彈藥，還沒有 RPG-7 會一起給', aliases: ['rockets', '火箭', '火箭彈'] },
  ammo: { name: '補滿彈藥', short: '彈藥', cat: 'ammo', kind: 'ammo', desc: '身上每把槍的子彈都補滿', aliases: ['彈藥', '子彈', '彈匣'] },
  grenade: { name: '手榴彈', short: '手榴彈', cat: 'throw', kind: 'grenade', def: 1, max: MAX_STACK, desc: '按 G 投擲，約 3 秒後爆炸', aliases: ['grenades', 'nade', '手榴彈'] },
  medkit: { name: '醫療包', short: '醫療包', cat: 'med', kind: 'medkit', def: 1, max: MAX_STACK, desc: '按 H 使用，回復 50 生命', aliases: ['medkits', 'med', '醫療包'] },
  armor: { name: '重型防彈背心', short: '護甲', cat: 'armor', kind: 'armor', desc: '護甲補到 100', aliases: ['vest', '護甲', '背心', '防彈背心'] },
  coins: { name: '金幣', short: '金幣', cat: 'coins', kind: 'coins', def: 1000, max: 1e6, desc: '在金水商行買東西用', aliases: ['coin', 'money', 'cash', '金幣', '錢'] },
  hp: { name: '補滿生命', short: '生命', cat: 'hp', kind: 'hp', desc: '生命直接補到全滿', aliases: ['heal', 'health', '生命', '補血', '回血'] },
  all: { name: '全部武器與補給', short: '全部', cat: 'all', kind: 'all', desc: '所有武器、彈藥、手榴彈、醫療包、護甲一次給齊', aliases: ['everything', '全部'] },
};

// 種類 → 顯示名稱(控制面板的分色與 /help 表格)
export const CATS = { weapon: '武器', ammo: '彈藥', throw: '投擲物', med: '醫療', armor: '護甲', coins: '金幣', hp: '生命', all: '全部' };

const ALIAS = new Map();
for (const [k, it] of Object.entries(ITEMS)) { ALIAS.set(k, k); for (const a of it.aliases) ALIAS.set(a.toLowerCase(), k); }

// 名稱/別名 → 物品 key(找不到回傳 null)
export function findItem(name) { return ALIAS.get(String(name || '').trim().toLowerCase()) ?? null; }
export const itemNames = () => Object.keys(ITEMS);

// 數量:沒給就用預設;限制在合理範圍(金幣最多一百萬)
export function clampCount(key, n) {
  const it = ITEMS[key];
  const v = Number.isFinite(n) ? Math.floor(n) : it?.def ?? 1;
  return Math.max(1, Math.min(maxCount(key), v));
}
// 這個物品吃不吃數量、上限多少
export const countable = (key) => ITEMS[key]?.def !== undefined;
export const maxCount = (key) => ITEMS[key]?.max ?? MAX_STACK;

function giveWeapon(game, id) {
  const w = game.weapons, def = WEAPONS[id];
  const had = w.inv[id]?.reserve ?? 0; // 已經有的話保留比上限多的備彈(例如 /give rocket 加過的火箭)
  w.give(id);
  const a = w.inv[id];
  a.mag = w.stat(id, 'mag');
  a.reserve = Math.max(had, def.reserveCap);
  if (!w.busy) w.switchTo(id);
}

// 套用到本機玩家;回傳顯示用的文字(物品不存在時回傳 null)
export function applyGive(game, key, count) {
  const it = ITEMS[key];
  if (!it) return null;
  const p = game.player, w = game.weapons, n = clampCount(key, count);
  let msg = it.name;
  switch (it.kind) {
    case 'weapon':
      giveWeapon(game, key);
      break;
    case 'rocket': {
      if (!w.has('rpg')) giveWeapon(game, 'rpg');
      const a = w.inv.rpg;
      a.reserve = Math.min(MAX_STACK, a.reserve + n);
      msg = `${it.name} ×${n}`;
      break;
    }
    case 'ammo':
      w.refillAll();
      break;
    case 'grenade':
      p.grenades = Math.min(MAX_STACK, (p.grenades || 0) + n);
      msg = `${it.name} ×${n}`;
      break;
    case 'medkit':
      p.medkits = Math.min(MAX_STACK, (p.medkits || 0) + n);
      msg = `${it.name} ×${n}`;
      break;
    case 'armor':
      p.maxArmor = Math.max(p.maxArmor || 0, 100);
      p.armor = p.maxArmor;
      break;
    case 'coins':
      p.coins += n;
      game.ui.coinGain?.(n);
      msg = `${n} ${it.name}`;
      break;
    case 'hp':
      p.hp = p.maxHp;
      break;
    case 'all':
      for (const id of ORDER) giveWeapon(game, id);
      w.refillAll();
      p.grenades = Math.max(p.grenades || 0, 6);
      p.medkits = Math.max(p.medkits || 0, 3);
      p.maxArmor = Math.max(p.maxArmor || 0, 100);
      p.armor = p.maxArmor;
      p.hp = p.maxHp;
      break;
    default:
      return null;
  }
  // HUD 立刻更新(單人開著控制面板時遊戲暫停,每幀的同步不會跑)
  game.updateAmmoHud?.();
  game.ui.setHP(p.hp, p.maxHp);
  game.ui.setArmor(p.armor, p.maxArmor);
  game.ui.hud?.setInv?.(p.grenades || 0, p.medkits || 0);
  game.ui.setCoins(p.coins);
  sfx.pickupItem?.();
  return msg;
}
