// 殭屍語音的每幀閘門:同一幀裡的叫聲請求先收集(不立刻發聲),幀尾(微任務)或下一幀開始(sfx.listener)時
// 依「距離 ÷ 情境重要度」排序,最近的最多 PER_FRAME 個真的發聲,其餘丟掉 → 一群殭屍同時叫時,近的那幾隻一定聽得到。
// 開闊地都超出可聽距離的請求連排都不排(不建立任何節點);沒有位置的殭屍語音直接丟棄(不能變成非定位的 2D 聲音)。
import { A, distTo, ZV } from './core.js';

const Q = [];
let sched = false;
const PER_FRAME = 3;

export function zq(mode, pos, fn) {
  if (!A.ctx) return;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) { A.stats.znopos++; return; }
  const Z = ZV[mode] || ZV.groan, d = distTo(pos);
  if (d > Z[1]) { A.stats.zcull++; return; }
  Q.push({ e: d / Z[4], fn });
  if (Q.length >= 24) zflush(); // 同步迴圈(測試 bot)裡微任務不會跑:滿了就先結算
  else if (!sched) { sched = true; queueMicrotask(zflush); }
}

export function zflush() {
  sched = false;
  if (!Q.length) return;
  if (Q.length > 1) Q.sort((a, b) => a.e - b.e);
  const n = Math.min(Q.length, PER_FRAME);
  for (let i = 0; i < n; i++) { try { Q[i].fn(); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio zq]', e); } }
  A.stats.zframe += Q.length - n;
  Q.length = 0;
}
