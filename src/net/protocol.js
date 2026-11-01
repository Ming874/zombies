// 連線協定:版本、訊息種類、二進位格式與量化。
// 低頻事件用 JSON 文字訊息({t:'g', k, d, to?});高頻資料(玩家狀態 20Hz、殭屍快照 15Hz)用二進位:
//   第 0 位元組 = 種類、第 1 位元組 = 發送者座位(伺服器填入)、之後小端序。位置量化成公分(int16,±327m)、角度 uint16。
import { TYPES } from '../zombies/types.js';
import { WEAPONS, ORDER } from '../weapons/weapon.js';

export const PROTO = 2; // 與 server/index.js 一致(格式或訊息語意改變就加一,舊頁面會被要求重新整理)
export const BIN = { STATE: 1, ZSNAP: 2 };
export const TAU = Math.PI * 2;
export const NONE = 255;
export const W_KNIFE = 253, W_BOOM = 254; // 對戰傷害的「武器」代碼:小刀、爆炸

// 對照表由遊戲資料產生(各端是同一個版本,順序一致);找不到的值送 255
export const ZTYPES = Object.keys(TYPES);
export const WEAPON_IDS = [...ORDER, ...Object.keys(WEAPONS).filter((k) => !ORDER.includes(k))];
export const ZSTATES = ['chase', 'attack', 'stumble', 'stagger', 'crouch', 'leap', 'recover', 'trip', 'getup', 'spit', 'roar', 'charge', 'stun', 'slam', 'idle', 'wander', 'spawn', 'climb', 'hit', 'knock', 'scream', 'grab', 'feed', 'fall', 'burn'];
export const PARTS = ['body', 'head', 'arm', 'leg', 'armor', 'torso', 'neck', 'hand', 'foot'];
export const PHASES = ['fighting', 'collecting', 'break', 'shop', 'pvp', 'wait', 'over', 'warmup'];
export const code = (list, v) => { const i = list.indexOf(v); return i < 0 ? NONE : i; };
export const name = (list, i, def) => (i < list.length ? list[i] : def);

// 玩家狀態旗標
export const F = {
  ALIVE: 1, DOWNED: 2, SPRINT: 4, RELOAD: 8, ADS: 16, LIGHT: 32, DEAD: 64, SHIELD: 128,
  REVIVE: 256, MENU: 512, CHAT: 1024, SPECTATE: 2048, SHOP: 4096,
};

// ---------- 量化 ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const qPos = (m) => clamp(Math.round(m * 100), -32768, 32767);
export const qAng = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65536) & 0xffff;
export const dAng = (v) => (v / 65536) * TAU;
export const qPitch = (p) => clamp(Math.round(p * 10000), -32768, 32767);
export const qVel = (v) => clamp(Math.round(v * 100), -32768, 32767);
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- 二進位讀寫(重複使用同一塊緩衝,不在每則訊息配置新物件) ----------
export class Writer {
  constructor(size = 8192) {
    this.buf = new ArrayBuffer(size);
    this.dv = new DataView(this.buf);
    this.bytes = new Uint8Array(this.buf);
    this.o = 0;
    this.views = []; // 依長度快取的 subarray
  }
  reset() { this.o = 0; return this; }
  u8(v) { this.dv.setUint8(this.o, v); this.o += 1; }
  i16(v) { this.dv.setInt16(this.o, v, true); this.o += 2; }
  u16(v) { this.dv.setUint16(this.o, v & 0xffff, true); this.o += 2; }
  u32(v) { this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  at16(pos, v) { this.dv.setUint16(pos, v & 0xffff, true); }
  at8(pos, v) { this.dv.setUint8(pos, v); }
  view() { const n = this.o; return this.views[n] || (this.views[n] = this.bytes.subarray(0, n)); }
}
export class Reader {
  set(ab) { this.dv = new DataView(ab); this.o = 0; this.n = ab.byteLength; return this; }
  get left() { return this.n - this.o; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
}

// ---------- 玩家狀態(種類 1) ----------
//  0 u8 種類 | 1 u8 座位 | 2 u16 序號 | 4 u32 時間(伺服器時鐘 ms)
//  8 i16 x | 10 i16 y | 12 i16 z(公分)| 14 u16 yaw | 16 i16 pitch(×1e4)| 18 i16 vx | 20 i16 vz(公分/秒)
// 22 u16 旗標 | 24 u8 武器 | 25 u8 生命 | 26 u8 護甲 | 27 u8 救援對象座位 | 28 u8 救援進度(0..255)
// 29 u8 開火數 | 30 u8 殭屍命中數 | 31 u8 玩家命中數
// 開火 ×7:i16 ex, i16 ey, i16 ez(彈著點), u8 旗標(1 = 命中肉體)
// 殭屍命中 ×6:u16 殭屍編號, u8 部位, u16 傷害×10, u8 旗標(1 爆炸、2 近戰)
// 玩家命中 ×5:u8 對象座位, u8 部位, u16 傷害×10, u8 武器(WEAPON_IDS 索引;W_KNIFE / W_BOOM)
// 伺服器只轉送,但會檢查長度 = 32 + 開火×7 + 殭屍命中×6 + 玩家命中×5(見 server/index.js)
export const STATE_HEAD = 32;
export const MAX_SHOTS = 24, MAX_HITS = 32;
export function makeState() {
  return {
    seq: 0, time: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, flags: 0, weapon: 0, hp: 100, armor: 0, rt: NONE, rp: 0,
    nShots: 0, shots: new Float32Array(MAX_SHOTS * 4), nZ: 0, zh: new Float32Array(MAX_HITS * 4), nP: 0, ph: new Float32Array(MAX_HITS * 4),
  };
}
export function writeState(w, s) {
  w.reset();
  w.u8(BIN.STATE); w.u8(0); w.u16(s.seq); w.u32(s.time);
  w.i16(qPos(s.x)); w.i16(qPos(s.y)); w.i16(qPos(s.z)); w.u16(qAng(s.yaw)); w.i16(qPitch(s.pitch)); w.i16(qVel(s.vx)); w.i16(qVel(s.vz));
  w.u16(s.flags); w.u8(s.weapon); w.u8(clamp(Math.ceil(s.hp), 0, 255)); w.u8(clamp(Math.ceil(s.armor), 0, 255)); w.u8(s.rt); w.u8(clamp(Math.round(s.rp * 255), 0, 255));
  const ns = Math.min(s.nShots, MAX_SHOTS), nz = Math.min(s.nZ, MAX_HITS), np = Math.min(s.nP, MAX_HITS);
  w.u8(ns); w.u8(nz); w.u8(np);
  for (let i = 0; i < ns; i++) { const k = i * 4; w.i16(qPos(s.shots[k])); w.i16(qPos(s.shots[k + 1])); w.i16(qPos(s.shots[k + 2])); w.u8(s.shots[k + 3]); }
  for (let i = 0; i < nz; i++) { const k = i * 4; w.u16(s.zh[k]); w.u8(s.zh[k + 1]); w.u16(clamp(Math.round(s.zh[k + 2] * 10), 0, 65535)); w.u8(s.zh[k + 3] & 0xff); }
  for (let i = 0; i < np; i++) { const k = i * 4; w.u8(s.ph[k]); w.u8(s.ph[k + 1]); w.u16(clamp(Math.round(s.ph[k + 2] * 10), 0, 65535)); w.u8(s.ph[k + 3]); }
  return w.view();
}
export function readState(r, s) {
  r.u8(); s.slot = r.u8(); s.seq = r.u16(); s.time = r.u32();
  s.x = r.i16() / 100; s.y = r.i16() / 100; s.z = r.i16() / 100; s.yaw = dAng(r.u16()); s.pitch = r.i16() / 10000; s.vx = r.i16() / 100; s.vz = r.i16() / 100;
  s.flags = r.u16(); s.weapon = r.u8(); s.hp = r.u8(); s.armor = r.u8(); s.rt = r.u8(); s.rp = r.u8() / 255;
  const ns = r.u8(), nz = r.u8(), np = r.u8();
  if (ns > MAX_SHOTS || nz > MAX_HITS || np > MAX_HITS || r.left < ns * 7 + nz * 6 + np * 5) return false;
  s.nShots = ns; s.nZ = nz; s.nP = np;
  for (let i = 0; i < ns; i++) { const k = i * 4; s.shots[k] = r.i16() / 100; s.shots[k + 1] = r.i16() / 100; s.shots[k + 2] = r.i16() / 100; s.shots[k + 3] = r.u8(); }
  for (let i = 0; i < nz; i++) { const k = i * 4; s.zh[k] = r.u16(); s.zh[k + 1] = r.u8(); s.zh[k + 2] = r.u16() / 10; s.zh[k + 3] = r.u8(); }
  for (let i = 0; i < np; i++) { const k = i * 4; s.ph[k] = r.u8(); s.ph[k + 1] = r.u8(); s.ph[k + 2] = r.u16() / 10; s.ph[k + 3] = r.u8(); }
  return true;
}

// ---------- 殭屍快照(種類 2,只有房主送) ----------
//  0 u8 種類 | 1 u8 座位 | 2 u16 序號 | 4 u32 時間 | 8 u8 回合 | 9 u8 階段 | 10 u16 待生成數 | 12 u16 倒數(×10 秒,65535 = 無)
// 14 u8 存活數 | 15 u8 筆數
// 每筆 ×20:u16 編號, u8 類型, u8 變體, u8 狀態, u8 旗標(1 存活), i16 x, i16 y, i16 z, u16 朝向, u16 狀態時間(ms), u16 血量, u8 速度×20, u8 目標座位
export const ZENTRY = 20, ZHEAD = 16;
