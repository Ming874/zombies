import { WEAPONS, ORDER } from '../weapons/weapon.js';
import { sfx } from '../audio.js';

// ===== 控制面板 /give 的物品表與套用 =====
// 單人:直接套用到本機玩家;多人:房主把 [物品, 數量] 送給對方(src/net/session.js 'gv'),對方用同一個 applyGive 套用。
// count:數量(金幣 = 金額;武器/彈藥/護甲/生命不用數量)

const MAX_STACK = 99;

// key → { name, kind, def(預設數量), aliases(中英文別名) }
export const ITEMS = {
  pistol: { name: WEAPONS.pistol.name, kind: 'weapon', aliases: ['glock', '手槍'] },
  revolver: { name: WEAPONS.revolver.name, kind: 'weapon', aliases: ['python', '左輪', '左輪手槍'] },
  shotgun: { name: WEAPONS.shotgun.name, kind: 'weapon', aliases: ['870', '霰彈槍', '散彈槍'] },
  ak47: { name: WEAPONS.ak47.name, kind: 'weapon', aliases: ['ak', 'ak-47'] },
  m4a1: { name: WEAPONS.m4a1.name, kind: 'weapon', aliases: ['m4'] },
  barrett: { name: WEAPONS.barrett.name, kind: 'weapon', aliases: ['m82', 'sniper', '巴雷特', '狙擊槍'] },
  rpg: { name: WEAPONS.rpg.name, kind: 'weapon', aliases: ['rpg7', 'rpg-7', 'bazooka', '火箭筒'] },
  rocket: { name: '火箭彈', kind: 'rocket', def: 3, aliases: ['rockets', '火箭', '火箭彈'] },
  ammo: { name: '全部彈藥補滿', kind: 'ammo', aliases: ['彈藥', '子彈'] },
  grenade: { name: '手榴彈', kind: 'grenade', def: 1, aliases: ['grenades', 'nade', '手榴彈'] },
  medkit: { name: '醫療包', kind: 'medkit', def: 1, aliases: ['medkits', 'med', '醫療包'] },
  armor: { name: '重型防彈背心', kind: 'armor', aliases: ['vest', '護甲', '背心', '防彈背心'] },
  coins: { name: '金幣', kind: 'coins', def: 1000, aliases: ['coin', 'money', 'cash', '金幣', '錢'] },
  hp: { name: '生命回滿', kind: 'hp', aliases: ['heal', 'health', '生命', '補血', '回血'] },
  all: { name: '全部武器與補給', kind: 'all', aliases: ['everything', '全部'] },
};

const ALIAS = new Map();
for (const [k, it] of Object.entries(ITEMS)) { ALIAS.set(k, k); for (const a of it.aliases) ALIAS.set(a.toLowerCase(), k); }

// 名稱/別名 → 物品 key(找不到回傳 null)
export function findItem(name) { return ALIAS.get(String(name || '').trim().toLowerCase()) ?? null; }
export const itemNames = () => Object.keys(ITEMS);

// 數量:沒給就用預設;限制在合理範圍(金幣最多一百萬)
export function clampCount(key, n) {
  const it = ITEMS[key];
  const v = Number.isFinite(n) ? Math.floor(n) : it?.def ?? 1;
  return Math.max(1, Math.min(it?.kind === 'coins' ? 1e6 : MAX_STACK, v));
}

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
