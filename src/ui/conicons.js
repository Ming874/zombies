import { ICON } from './icons.js';

// ===== 控制面板(F8)的圖示 =====
// 能沿用的就沿用 icons.js(商店、HUD 用的那一套),只把長槍的 viewBox 裁緊一點,在 32×20 的格子裡才不會太小。
// 沒有的(AK、M4、RPG、火箭彈、彈匣、補給箱、指令、玩家)在這裡畫:內嵌 SVG 剪影,currentColor 上色,跟著種類的顏色走。
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const crop = (s, vb) => s.replace('viewBox="0 0 24 24"', `viewBox="${vb}"`);
const D = 'rgba(0,0,0,.34)'; // 剪影上的暗部

const AK = svg(`<path fill="currentColor" d="M1 5.4 8.6 4.6v3L1.7 9.8zM8.4 4h11.2v3.4H8.4zM19.4 4.5h5.8v2.4h-5.8zM19.4 3.3H26v1.1h-6.6zM25 4.9h6.4v1H25zM29.6 2.9h1v2h-1zM10.2 7.2h2.4L11.4 12H9.2zM14 7.2h3.2c.2 2.2 1 3.8 2.2 5.2l-2.2 1c-1.6-1.8-2.8-3.8-3.2-6.2z"/><path fill="${D}" d="M19.4 5.5h5.8v.6h-5.8zM2.2 6.9 8.6 5.7v.7L2.4 7.7z"/>`, '0 0 32 14');
const M4 = svg(`<path fill="currentColor" d="M1 4.6h5.4v4.2H2.6L1 7.6zM6.4 5.4H9v1.2H6.4zM8.8 4.2h9.8v3.4H8.8zM10.4 2.3h7v1.6h-7zM11.6 3.9h4.6v.4h-4.6zM18.4 4.4h7v2.8h-7zM25.2 5.2h6.2v.9h-6.2zM24.6 2.6h.8v1.8h-.8zM10.6 7.4h2.2l-1 4.4H9.6zM14 7.4h2.8l.5 5.2h-2.8z"/><path fill="${D}" d="M19 5.1h5.8v.5H19zm0 1h5.8v.5H19zM2.4 6.2h3.4v.6H2.4z"/>`, '0 0 32 14');
const RPG = svg(`<path fill="currentColor" d="M1 4.8 5 6v2.4L1 9.6zM4.8 6H24v2.4H4.8zM23.6 5.6l3-2h1.8l3.2 3.6-3.2 3.6h-1.8l-3-2zM11.4 8.2h2L12.8 12h-2zM16.6 8.2h2L18 12h-2zM13.6 4h3.2v2h-3.2z"/><path fill="${D}" d="M26.4 3.7h.6v7h-.6zM6 6.9h17.4v.5H6z"/>`, '0 0 32 14');
const ROCKET = svg(`<path fill="currentColor" d="M1.4 2.6 6.4 5.6v2.8l-5 3L3 7zM6 5.6h11.6v2.8H6zM17.2 3.4h3.6l10 3.6-10 3.6h-3.6z"/><path fill="${D}" d="M17.2 3.4h1v7.2h-1zM6.6 6.6h10.4v.6H6.6z"/>`, '0 0 32 14');
const MAG = svg(`<path fill="currentColor" d="M7.6 3.2h5.6c1.9 0 3.3.7 4 1.8-.7 1.1-2.1 1.8-4 1.8H7.6zM7.4 7.6h7.8l1.5 11.2h1v2.9H8.2v-2.9h.9z"/><path fill="${D}" d="M8.6 10.2h7v1H8.6zm.3 3.4h7.1v1H8.9zm.2 3.4h7.3v1H9.1zM10.8 3.2h.8v3.6h-.8z"/>`);
const CRATE = svg(`<path fill="currentColor" d="M1.5 4h21v3.2h-21zM2.5 7.6h19V20h-19z"/><path fill="${D}" d="M2.5 7.2h19v1.2h-19zM2.5 12.6h19v1.1h-19zM2.5 16.6h19v1.1h-19zM5.2 8.4h1.7V20H5.2zm11.9 0h1.7V20h-1.7z"/>`);

export const CICON = {
  // 物品
  pistol: crop(ICON.pistol, '0 4.5 24 15'),
  revolver: crop(ICON.revolver, '0 4.8 24 15'),
  shotgun: crop(ICON.shotgun, '0 6 24 14'),
  ak47: AK,
  m4a1: M4,
  barrett: crop(ICON.sniper, '0 5.5 24 13'),
  rpg: RPG,
  rocket: ROCKET,
  ammo: MAG,
  grenade: ICON.grenade,
  medkit: ICON.medkit,
  armor: ICON.vest,
  coins: ICON.coin,
  hp: ICON.heal,
  all: CRATE,
  // 指令
  give: svg(`<path fill="currentColor" d="M3.5 9h17v3.4h-17zM5 13.4h14V21H5z"/><path fill="${D}" d="M10.8 9h2.4v12h-2.4z"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 8.6C10 4 6.6 4.4 7 7c.3 1.6 3 1.8 5 1.6 2 .2 4.7 0 5-1.6.4-2.6-3-3-5 1.6z"/>`),
  rev: ICON.heal,
  godmod: ICON.shield,
  stop: svg('<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/><path fill="rgba(0,0,0,.34)" d="M8 11h8v2H8z"/>'),
  start: svg('<path fill="currentColor" d="M6 3.5v17l14-8.5z"/>'),
  list: svg('<path fill="currentColor" d="M3 4h4v4H3zm0 6h4v4H3zm0 6h4v4H3zM9 5h12v2H9zm0 6h12v2H9zm0 6h12v2H9z"/>'),
  help: svg('<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M9.2 9.4c0-1.8 1.3-2.8 2.8-2.8 1.6 0 2.8 1 2.8 2.5 0 2.3-2.8 2.5-2.8 4.7"/><circle cx="12" cy="17.4" r="1.4" fill="currentColor"/>'),
  clear: svg(`<path fill="currentColor" d="M14.2 3.6 21 10.4 12.4 19H7.6L3 14.4z"/><path fill="${D}" d="m8.6 9.2 6.8 6.8-3 3H7.6L3 14.4z"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 20.6h9"/>`),
  // 玩家與其他
  me: svg('<circle cx="12" cy="7.5" r="4" fill="currentColor"/><path fill="currentColor" d="M3.8 21.5c0-5.1 3.6-8.2 8.2-8.2s8.2 3.1 8.2 8.2z"/>'),
  everyone: svg('<g fill="currentColor"><circle cx="8.5" cy="8" r="3.3"/><path d="M1.8 20.5c0-4.5 2.8-7.1 6.7-7.1s6.7 2.6 6.7 7.1z"/><g opacity=".65"><circle cx="16.6" cy="6.8" r="2.8"/><path d="M13.4 12.6c.9-.4 2-.6 3.2-.6 3.3 0 5.8 2.2 5.8 6.4h-5.6c-.2-2.6-1.4-4.6-3.4-5.8z"/></g></g>'),
  history: svg('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5.2 8.4a8 8 0 1 1-.9 6.2"/><path fill="currentColor" d="m2.4 4.6 6 2.6-4.9 3.6z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 7.6v4.8l3.2 2"/>'),
  ok: ICON.check,
  err: svg('<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="m6 6 12 12M18 6 6 18"/>'),
  tip: svg('<path fill="currentColor" d="M12 2.5a6.8 6.8 0 0 0-4 12.3c.7.5 1.1 1.3 1.1 2.1v.6h5.8v-.6c0-.8.4-1.6 1.1-2.1A6.8 6.8 0 0 0 12 2.5zM9.2 18.8h5.6v1.4c0 .7-.6 1.3-1.3 1.3h-3c-.7 0-1.3-.6-1.3-1.3z"/>'),
};

// 長槍用比較寬的格子
export const WIDE = new Set(['pistol', 'revolver', 'shotgun', 'ak47', 'm4a1', 'barrett', 'rpg', 'rocket']);
