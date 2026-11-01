import { sfx } from '../audio.js';

// 翻越/攀上(按空白鍵時、正往腰高的障礙物前進):
//  - 0.46m 以下直接走上去(World.BOX_STEP);0.6~1.25m 翻過去、0.6~1.42m(胸口高)攀上去;更矮的直接跳,上方要有淨空
//  - 「翻過去」:另一側同一樓層(可以比較低,最多 1.3m)有站得下的位置(牆/欄杆/挑空/樓梯開口/地圖外都不算)→ 落在另一側
//  - 「攀上去」:翻不過去時(桌子、大箱子很深)或太高翻不過,頂部 ≤ 1.42m 而且站得上去的道具 → 站到頂上(頭上空間不夠就蹲著)
//  - 0.4~0.6 秒的固定軌跡(手撐上去 → 越過 → 落地),鏡頭壓低、微微低頭與側傾;期間不做碰撞,結束時正常碰撞(World.resolve)
// 只在按下空白鍵時檢查一次(沿前進方向取樣三條線),沒有每幀成本。

const R = 0.35; // 玩家半徑(player.js RADIUS)
const STEP = 0.5, BOX_STEP = 0.46; // 與 World.BOX_STEP 一致(更矮的直接走上去)
const MIN_H = 0.6, MAX_OVER = 1.25, MAX_ONTO = 1.42, REACH = 0.8, DROP = 1.3; // 攀上去:到胸口高(殭屍也爬得上去,見 physics/zclimb.js)
const STAND_H = 1.8, CROUCH_H = 1.25;
const NO = Infinity; // 不能翻的東西(牆、窗、圍籬、高的道具)
const lerp = (a, b, t) => a + (b - a) * t;

export class Mantle {
  constructor(player) {
    this.p = player;
    this.active = false;
    this.t = 0; this.T = 0.5;
    this.x0 = 0; this.y0 = 0; this.z0 = 0; this.ex = 0; this.ez = 0; this.x1 = 0; this.y1 = 0; this.z1 = 0;
    this.top = 0; this.g = 0; this.onto = false; this.crouch = false; this.dx = 0; this.dz = 0; this.side = 1;
    this.eye = 0; this.pitch = 0; this.roll = 0; // 鏡頭偏移(player.update 套用)
    this.surf = 'concrete';
    this.last = ''; // 除錯:最近一次判定結果
  }

  // 前方 (x,z) 處擋住腳底 y(所在樓層地面 gref)的東西的頂部高度(世界 y);NaN = 沒有擋;NO = 不能翻
  _block(x, z, y, gref = y) {
    const W = this.p.world, L = W.layout;
    const c = Math.floor(x / 2), r = Math.floor(z / 2);
    if (c < 0 || r < 0 || c >= W.W || r >= W.H) return NO;
    let top = NaN;
    if (!W._pass(c, r, x, z, gref, gref + STEP)) {
      const li = L.levelOfY(y + 0.3), ch = L.charAt(li, c, r);
      if (ch !== '=') return NO;
      const t = W.railType ? W.railType.get(`${li},${c},${r}`) : 'parapet';
      if (t === 'stair_bal') return NO;
      if (t === 'counter' && W.ballistics && W.ballistics.counterBlocked(li, c, r)) return NO; // 櫃台上的玻璃隔板還在
      const rh = t === 'rail_metal' ? 1.05 : W.railH ? W.railH[li * W.W * W.H + r * W.W + c] : L.RAIL_H;
      top = W.lvY[li] + rh;
    }
    const list = W.boxGrid[r * W.W + c];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.maxY <= y + BOX_STEP || b.minY >= y + 1.15 || x < b.minX - 0.02 || x > b.maxX + 0.02 || z < b.minZ - 0.02 || z > b.maxZ + 0.02) continue;
      if (!b.pm) return NO; // 沒有材質標記的是遊戲機制用的盒子(商店櫃台、補給站、門):不能翻
      if (!(b.maxY <= top)) top = b.maxY;
    }
    return top;
  }

  // 半徑 R 的身體腳底在 y(地面參考 gref)、(x,z) 是否站得下:格子可通行、沒有道具擋到身體、頭上有 h 的空間
  _fits(x, z, y, gref, h) {
    const W = this.p.world;
    if (x < R || z < R || x > W.sizeX - R || z > W.sizeZ - R) return false;
    const c0 = Math.floor((x - R) / 2), c1 = Math.floor((x + R) / 2), r0 = Math.floor((z - R) / 2), r1 = Math.floor((z + R) / 2);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const nx = x < c * 2 ? c * 2 : x > c * 2 + 2 ? c * 2 + 2 : x, nz = z < r * 2 ? r * 2 : z > r * 2 + 2 ? r * 2 + 2 : z;
      if ((x - nx) * (x - nx) + (z - nz) * (z - nz) >= R * R) continue;
      if (!W._pass(c, r, x, z, gref, gref + STEP)) return false;
      const list = W.boxGrid[r * W.W + c];
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        if (b.maxY <= y + BOX_STEP || b.minY >= y + h) continue;
        if (x + R <= b.minX || x - R >= b.maxX || z + R <= b.minZ || z - R >= b.maxZ) continue;
        return false;
      }
    }
    return W.headroom(x, z, y, R) >= y + h;
  }

  // 按下空白鍵:(dx,dz) = 想前進的水平單位向量。可以翻就開始翻越並回傳 true(不跳)
  start(dx, dz) {
    const p = this.p, W = p.world, P = p.pos, y = P.y;
    if (this.active || !W || !W.boxGrid || p.downed) return false;
    const gf = p.ground === p.ground && p.ground != null && p.ground <= y + 0.05 ? p.ground : y; // 樓層地面(站在道具頂上時比腳底低)
    // 1) 沿前進方向三條線(中間 + 左右肩)找障礙物:進入距離 a0、離開距離 a1、頂部 top
    let a0 = -1, a1 = -1, top = -Infinity;
    for (let a = R * 0.6; a <= R + REACH + 2.3; a += 0.08) {
      let h = NaN;
      for (let s = -1; s <= 1; s++) {
        const x = P.x + dx * a - dz * s * 0.24, z = P.z + dz * a + dx * s * 0.24;
        const t = this._block(x, z, y, gf);
        if (t === t && !(h >= t)) h = t;
      }
      if (h === h) {
        if (h === NO) { if (a0 < 0) { this.last = 'blocked'; return false; } break; } // 矮障礙物後面緊貼著牆:只能攀上去
        if (a0 < 0) { if (a > R + REACH) break; a0 = a; }
        if (h > top) top = h;
      } else if (a0 >= 0) { a1 = a; break; }
    }
    if (a0 < 0) { this.last = 'none'; return false; }
    const rel = top - y;
    if (rel < MIN_H) { this.last = 'low'; return false; } // 矮的直接跳
    if (rel > MAX_ONTO) { this.last = 'high'; return false; }
    // 障礙物上方的淨空(身體越過時至少 0.9m)
    for (let a = a0; a <= (a1 > 0 ? a1 : a0 + 0.6); a += 0.2) if (W.headroom(P.x + dx * a, P.z + dz * a, top, 0.2) < top + 0.9) { this.last = 'noclear'; return false; }
    // 2) 翻過去:另一側的落地點
    let lx = NaN, lz = NaN, ly = NaN;
    if (a1 > 0 && rel <= MAX_OVER) {
      for (let a = a1 + R + 0.04, b = a1; a <= a1 + R + 1.0; a += 0.1) {
        const x = P.x + dx * a, z = P.z + dz * a;
        let bad = false;
        for (; b <= a; b += 0.1) { const h = this._block(P.x + dx * b, P.z + dz * b, y, gf); if (h === h) { bad = true; break; } } // 落地前又有別的障礙物
        if (bad) break;
        const idx = W._idx(x, z);
        if (idx < 0) break;
        const g = W._pick(idx, x, z, gf, y + STEP, DROP);
        if (g !== g) continue;
        const gb = Math.max(g, W.groundY(x, z, g + 0.3) ?? g); // 地上的矮道具(路緣石)
        if (gb > top - 0.3) continue;
        if (this._fits(x, z, gb, g, STAND_H)) { lx = x; lz = z; ly = gb; this.g = g; break; }
      }
    }
    let onto = false, crouch = false;
    if (lx !== lx) {
      // 3) 攀上去:站在障礙物頂上(只有道具;欄杆/櫃台格不能站)
      if (rel > MAX_ONTO) { this.last = 'nolanding'; return false; }
      const a = a0 + R * 0.75, x = P.x + dx * a, z = P.z + dz * a;
      const gt = W.groundY(x, z, top + 0.05);
      if (gt === null || Math.abs(gt - top) > 0.06 || !this._supported(x, z, top)) { this.last = 'nolanding'; return false; }
      if (this._fits(x, z, top, gf, STAND_H)) crouch = false;
      else if (this._fits(x, z, top, gf, CROUCH_H)) crouch = true;
      else { this.last = 'nolanding'; return false; }
      lx = x; lz = z; ly = top; onto = true; this.g = gf;
    }
    // 4) 開始
    this.active = true; this.onto = onto; this.crouch = crouch;
    this.t = 0;
    const dist = Math.hypot(lx - P.x, lz - P.z);
    this.T = Math.max(0.4, Math.min(0.6, 0.3 + rel * 0.13 + dist * 0.05));
    this.x0 = P.x; this.y0 = y; this.z0 = P.z;
    const e = Math.max(0, a0 - R * 0.35);
    this.ex = P.x + dx * e; this.ez = P.z + dz * e;
    this.x1 = lx; this.y1 = ly; this.z1 = lz; this.top = top; this.dx = dx; this.dz = dz;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.surf = p.surface || 'concrete';
    p.vx = p.vz = p.vy = 0;
    p.onGround = false;
    sfx.jump(this.surf);
    this.last = onto ? 'onto' : 'over';
    return true;
  }

  // 頂面撐得住(身體中心 0.6R 內有頂部 = top 的道具)
  _supported(x, z, top) {
    const W = this.p.world, idx = W._idx(x, z);
    if (idx < 0) return false;
    const list = W.boxGrid[idx];
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (Math.abs(b.maxY - top) > 0.06) continue;
      const nx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x, nz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      if ((x - nx) * (x - nx) + (z - nz) * (z - nz) < R * R * 0.36) return true;
    }
    return false;
  }

  // 每幀(進行中時取代 player 的移動與碰撞)
  update(dt) {
    const p = this.p, P = p.pos;
    if (p.downed || !(P.x === P.x)) { this.cancel(); return; }
    this.t += dt;
    const u = Math.min(1, this.t / this.T), U1 = 0.42;
    const hi = this.top + 0.06;
    if (u < U1) { // 手撐上去:往障礙物邊緣靠,身體升到頂部高度
      const v = u / U1, e = 1 - (1 - v) * (1 - v);
      P.x = lerp(this.x0, this.ex, v); P.z = lerp(this.z0, this.ez, v);
      P.y = lerp(this.y0, hi, e);
    } else { // 越過 → 落地(或站上頂部)
      const v = (u - U1) / (1 - U1), s = v * v * (3 - 2 * v);
      P.x = lerp(this.ex, this.x1, s); P.z = lerp(this.ez, this.z1, s);
      P.y = this.onto ? lerp(hi, this.y1, v) : lerp(hi, this.y1, v * v) + Math.sin(Math.PI * v) * 0.08;
    }
    const k = Math.sin(Math.PI * u);
    this.eye = -0.32 * k; // 壓低身體
    this.pitch = -0.12 * Math.sin(Math.PI * Math.min(1, u / 0.6)); // 看手撐的地方
    this.roll = 0.05 * k * this.side;
    if (u >= 1) this._finish();
  }

  _finish() {
    const p = this.p, P = p.pos;
    this.active = false;
    this.eye = this.pitch = this.roll = 0;
    P.set(this.x1, this.y1, this.z1);
    const sp = this.onto ? 0 : 1.6;
    p.vx = this.dx * sp; p.vz = this.dz * sp; p.vy = 0;
    p.onGround = true;
    p.ground = this.g;
    p._rx = undefined; // 不要從起點分段推回去(會撞到剛翻過的障礙物)
    if (this.crouch) { p._crouchToggle = true; p.crouching = true; }
    p.world.resolve(P, R, p);
    p.viewY = P.y;
    sfx.land(this.onto ? 1.6 : 2.4 + (this.y0 - this.y1), this.surf);
  }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.eye = this.pitch = this.roll = 0;
    const p = this.p;
    p.pos.set(this.x0, this.y0, this.z0);
    p._rx = undefined;
    p.onGround = true;
  }
}
