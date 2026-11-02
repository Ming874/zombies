import * as THREE from 'three';
import { Model, T } from '../kit.js';

// 電話:壁掛電話(老式米色)、桌上電話(九〇年代多鍵話機,放在小邊桌)、護理站(櫃台 + 多線話機 + 呼叫燈板)、大廳公共電話(遮音罩)。
// 狀態:idle → ringing(響鈴,最多約 14 秒)→ 接起 → call(播台詞)→ 掛上;沒在響時拿起來 = 撥號音(或線上只有呼吸聲)。
// 特別的那一支(spec.special = 'callback'):掛掉之後幾秒又響起來,一次比一次近。
// 響鈴時機:靠近(ring:'near')、緊張空檔(ring:'tension',由導演挑一支你附近但看不到的)、旗標(ring:'flag:xxx')、
// 靈異系統正在響的電話(game.horror.ringing)也可以在這裡接起來。
// 同時有好幾支在響 = 同一條醫院線路:接起任何一支,其他全部停;別支上的來電改由接起來的那一支接到(見 answer)。
// 代接(w6):有電話在響的時候,拿起任何一支沒在響的電話,也會接到那一通(總機的代接);只有金水伯的對講機不在這條線上。
// 劇情來電(有指定台詞)響在離你很遠的那一支時,離你最近的那一支也會跟著響;訊息列寫出最近的一支在哪(phoneDirector)。
const BEIGE = 0xd8cdb4, DARK = 0x2a2b2c, GRAY = 0x8d9190, STEEL = 0xa9adae;
const onLine = (l) => !/^對講機/.test(l?.who || ''); // 對講機的話(金水伯)只在對講機上說,不會從別支電話出來
const RING_KIND = { wall: 'bell', desk: 'trill', nurse: 'trill', pay: 'payphone', anchor: 'bell' };
const POOL = { wall: 'PHONE.ring', desk: 'PHONE.ring', nurse: 'PHONE.nurse', pay: 'PHONE.payphone', anchor: 'PHONE.ring' };

export function phonePools(api) {
  const { kit, M } = api;
  const hs = kit.pool('handset', (m) => {
    m.box(M.plastic, 0xffffff, 0, 0, 0, 0.19, 0.03, 0.045);
    for (const sx of [-1, 1]) { m.cyl(M.plastic, 0xffffff, sx * 0.095, -0.02, 0, 0.062, 0.035, 14); m.cyl(M.matte, 0x777777, sx * 0.095, -0.038, 0, 0.044, 0.004, 12); }
    m.box(M.plastic, 0xe0e0e0, 0, 0.016, 0, 0.12, 0.004, 0.03);
  }, M.plastic);
  const led = kit.pool('led', (m) => { m.box(M.led, 0xffffff, 0, 0, 0, 1, 1, 1); }, M.led);
  return { hs, led };
}
const ZERO = T(0, -50, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001);

// 牆上的電話本體(局部座標)
function wallPhone(m, M, c = BEIGE) {
  m.box(M.plastic, c, 0, 1.44, 0.022, 0.2, 0.32, 0.04);
  m.box(M.plastic, c, 0, 1.43, 0.055, 0.17, 0.27, 0.035);
  m.box(M.matte, 0x6a6458, 0, 1.6, 0.03, 0.14, 0.012, 0.035);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) m.box(M.plastic, r === 3 && k !== 1 ? 0x8a8070 : 0xefe8da, -0.035 + k * 0.035, 1.47 - r * 0.03, 0.075, 0.024, 0.018, 0.008);
  m.box(M.matte, 0x111111, 0, 1.34, 0.074, 0.08, 0.02, 0.004);
  m.box(M.plastic, c, -0.1, 1.5, 0.05, 0.03, 0.06, 0.03); // 掛勾
  m.box(M.plastic, c, -0.1, 1.33, 0.05, 0.03, 0.05, 0.03);
  for (let i = 0; i < 9; i++) m.torus(M.plastic, c, -0.1, 1.26 - i * 0.035, 0.07, 0.03, 0.22, Math.PI / 2, 0, 0, 10); // 捲線
}
function deskPhone(m, M, c = 0xd9d4c8) {
  m.box(M.plastic, c, 0, 0.035, 0, 0.21, 0.07, 0.19, -0.12);
  m.box(M.plastic, c, 0, 0.075, -0.04, 0.2, 0.03, 0.08);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) m.box(M.plastic, 0xf2efe8, -0.03 + k * 0.03, 0.066 + r * 0.004, 0.06 - r * 0.026, 0.022, 0.01, 0.016, -0.12);
  m.box(M.glow, 0x6a8a5a, 0.065, 0.074, 0.055, 0.05, 0.004, 0.02, -0.12);
  for (let i = 0; i < 6; i++) m.torus(M.plastic, c, -0.12 - i * 0.012, 0.03, 0.02 + i * 0.03, 0.028, 0.22, 0, 0.6, Math.PI / 2, 10);
}
function sideTable(m, M, w = 0.5, d = 0.38, h = 0.72, c = 0x6b5a46) {
  m.slab(M.wood, c, 0, h - 0.03, 0, w, 0.03, d);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.slab(M.wood, c, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), 0.035, h - 0.03, 0.035);
  m.slab(M.wood, 0x5a4a3a, 0, 0.18, 0, w - 0.06, 0.02, d - 0.06);
}
// 護理站櫃台 + 呼叫燈板;回傳台面上可以放東西的位置
function nurseCounter(m, M, w = 1.9) {
  const d = 0.62, h = 1.06;
  m.slab(M.paint, 0xcfd6d2, 0, 0, 0, w, h - 0.04, d);
  m.slab(M.plastic, 0x8b8f88, 0, h - 0.04, 0.02, w + 0.04, 0.04, d + 0.06);
  m.slab(M.paint, 0x5d8a86, 0, 0.12, d / 2 + 0.002, w, 0.5, 0.004); // 前面的色帶
  m.slab(M.matte, 0x3a3d3c, 0, 0, d / 2 - 0.02, w, 0.1, 0.04);
  m.box(M.matte, 0x222322, w / 2 - 0.35, h + 0.18, -0.1, 0.38, 0.3, 0.05); // 熄掉的螢幕
  m.box(M.plastic, 0xc8c4b8, w / 2 - 0.35, h + 0.02, -0.08, 0.06, 0.06, 0.06);
  m.box(M.plastic, 0xd8d4c8, w / 2 - 0.35, h + 0.008, 0.08, 0.42, 0.016, 0.14);
  for (let i = 0; i < 5; i++) m.box(M.matte, [0xe8e0c8, 0xd8e4ec, 0xf0d8d0][i % 3], -w / 2 + 0.25 + i * 0.05, h + 0.015 + i * 0.004, 0.0, 0.22, 0.004, 0.3, 0, 0.1 * i - 0.2); // 散落的病歷紙
  return { h, d, slots: [-w / 2 + 0.3, 0.05, 0.4] };
}
function nurseBoard(m, M, rooms) { // 呼叫燈板:每個房號一格,燈用指示燈池
  const w = 0.9, h = 0.46, y = 1.8;
  m.box(M.paint, 0xd9dcd6, 0, y, 0.02, w, h, 0.04);
  m.box(M.matte, 0x1a1c1c, 0, y + 0.16, 0.042, w - 0.06, 0.08, 0.004);
  const cells = [];
  rooms.forEach((rm, i) => {
    const cx = -w / 2 + 0.09 + (i % 5) * 0.18, cy = y + 0.04 - Math.floor(i / 5) * 0.16;
    m.box(M.matte, 0x2b2d2d, cx, cy, 0.042, 0.15, 0.12, 0.006);
    cells.push({ room: rm, x: cx, y: cy + 0.02, z: 0.047 });
  });
  return cells;
}
function payphone(m, M) {
  // 遮音罩
  m.box(M.paint, 0xd8d0b8, 0, 1.95, 0.24, 0.72, 0.04, 0.5);
  for (const sx of [-1, 1]) m.box(M.paint, 0xd8d0b8, sx * 0.36, 1.45, 0.24, 0.03, 1.0, 0.5);
  m.box(M.paint, 0x2e6b58, 0, 2.02, 0.24, 0.74, 0.1, 0.52);
  m.box(M.matte, 0x1a1a1a, 0, 0.95, 0.24, 0.72, 0.03, 0.46); // 置物台
  // 話機
  m.box(M.metal, 0x5f6b72, 0, 1.4, 0.07, 0.24, 0.5, 0.12);
  m.box(M.metal, 0x7a868c, 0, 1.4, 0.135, 0.2, 0.44, 0.012);
  m.box(M.glow, 0x5f7d55, 0, 1.56, 0.143, 0.12, 0.035, 0.004);
  m.box(M.matte, 0x111111, 0.06, 1.62, 0.143, 0.05, 0.008, 0.006); // 投幣口
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) m.box(M.metal, STEEL, -0.04 + k * 0.04, 1.47 - r * 0.04, 0.145, 0.03, 0.03, 0.01);
  m.box(M.matte, 0x111111, 0, 1.22, 0.143, 0.1, 0.05, 0.01); // 退幣口
  m.box(M.metal, 0x5f6b72, -0.14, 1.42, 0.1, 0.04, 0.2, 0.06);
  for (let i = 0; i < 8; i++) m.cyl(M.metal, STEEL, -0.16, 1.12 - i * 0.032, 0.12, 0.022, 0.03, 8); // 金屬軟管
}

// 一支電話的狀態機(有模型的電話與道具錨點電話共用)。
// 響:定位鈴聲(40m 內聽得到方向)+ 線路燈閃 + 聽筒在座上跳 + 畫面邊緣的淡色提示「電話 · 24m」(看得到電話就淡出,src/interact/ui.js)。
// 一定要接起來才會有內容:沒接 → 響一陣就停,台詞不消耗(劇情來電之後會再響)。
// 接起來的內容順序:這支電話排定的劇情來電(spec.calls / 回撥)→ 靈異系統 game.horror.phoneCall(ctx)(依玩家所在場景寫台詞與驚嚇)
//                  → game.horror.phone({ id, pos }) → lines.js 的 PHONE 台詞 + 合成電話聲 + 字幕。
//
// phoneCall(ctx) 的 ctx(接起來那一刻):
//  { id, pos:{x,y,z}, li, player:{x,y,z,yaw}(前方 = (-sin yaw, -cos yaw)), zone:{id,name,theme}|null(玩家所在區域),
//    near:[{kind,name,x,y,z,dist,side}](9m 內的互動物件與道具錨點,近到遠最多 8 個),
//    doors:[{key,x,y,z,state:'open'|'closed'|'ajar',side,dist,locked,barred}](12m 內的門),
//    behind:{kind,name,x,y,z,dist}|null(玩家背後最值得一提的東西:門 > 窗 > 物件 > 走廊),
//    round, time, ringing:bool(是不是響著被接起來的), ghost:bool(是不是靈異系統讓它響的) }
//  side = 'front' | 'behind' | 'left' | 'right'(相對玩家接電話時面向)
// 回傳 call:{ id, who, tag, played, dur, end:'dead'|'tone'|'breath'|'click', lines:[{at,dur,text,filter,mode,ear}], cues, stop() } 或 null
//  played = true:靈異系統已經在播(聲音、字幕、驚嚇);我們只負責聽筒拿著、線路雜訊到 dur,之後依 end 收尾;提早掛斷 → call.stop()
//  played = false:我們照 lines 的 at 自己播(合成電話聲 + 字幕)
const SIDE_NAME = { doll: '娃娃', body_sheet: '白布蓋著的屍體', morgue_drawer: '冰櫃抽屜', incubator: '保溫箱', cpr_dummy: 'CPR 假人', monitor_flatline: '心電圖監視器', candles: '蠟燭', tv: '電視', cctv: '監視器', mirror: '鏡子', cell_door: '隔離房的門', radio: '收音機', generator: '發電機', coffin: '棺材', stretcher: '擔架', crash_ambulance: '撞毀的救護車', statue_mary: '聖母像', statue_veiled: '蓋著布的雕像' };
function sideOf(px, pz, yaw, x, z) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dx = x - px, dz = z - pz, d = Math.hypot(dx, dz) || 1;
  const dot = (dx * fx + dz * fz) / d;
  if (dot > 0.7) return 'front';
  if (dot < -0.5) return 'behind';
  return dx * Math.cos(yaw) - dz * Math.sin(yaw) > 0 ? 'right' : 'left';
}
// 接電話那一刻的場景描述(給靈異系統寫「你背後那扇門……」)
export function callContext(api, P, extra = {}) {
  const { game, ix } = api, p = game.player, W = game.world, L = W.layout;
  const px = p.pos.x, py = p.pos.y, pz = p.pos.z, yaw = p.yaw;
  const zn = W.zoneAt ? W.zoneAt(px, py + 0.2, pz) : null;
  const near = [];
  const seen = new Set();
  for (const e of ix.list) {
    if (e.kind === 'door' || e === P.e || !e.enabled) continue;
    const q = ix.where(e), d = Math.hypot(q.x - px, q.z - pz);
    if (d > 9 || Math.abs(q.y - py - 1) > 2.2) continue;
    near.push({ kind: e.kind, name: e.name || e.kind, x: +q.x.toFixed(2), y: +q.y.toFixed(2), z: +q.z.toFixed(2), dist: +d.toFixed(1), side: sideOf(px, pz, yaw, q.x, q.z) });
    seen.add(e.kind + Math.round(q.x) + ',' + Math.round(q.z));
  }
  for (const ev of game.hospital?.propEvents || []) {
    const d = Math.hypot(ev.x - px, ev.z - pz);
    if (d > 9 || Math.abs(ev.y - py - 0.8) > 2.5 || seen.has(ev.kind + Math.round(ev.x) + ',' + Math.round(ev.z))) continue;
    near.push({ kind: ev.kind, name: SIDE_NAME[ev.kind] || ev.kind, x: +ev.x.toFixed(2), y: +ev.y.toFixed(2), z: +ev.z.toFixed(2), dist: +d.toFixed(1), side: sideOf(px, pz, yaw, ev.x, ev.z) });
  }
  near.sort((a, b) => a.dist - b.dist);
  near.length = Math.min(near.length, 8);
  const doors = [];
  for (const w of ix.doors?.list || []) {
    const d = Math.hypot(w.px - px, w.pz - pz);
    if (d > 12 || Math.abs(w.y - py) > 1.5) continue;
    const closed = ix.doors.allClosed(w), open = w.leaves.every((l) => Math.abs(Math.atan2(Math.sin(l.group.rotation.y - l.swingA), Math.cos(l.group.rotation.y - l.swingA))) < 0.15 || Math.abs(Math.atan2(Math.sin(l.group.rotation.y - l.swingB), Math.cos(l.group.rotation.y - l.swingB))) < 0.15);
    doors.push({ key: w.key, x: +w.px.toFixed(2), y: +(w.y + 1).toFixed(2), z: +w.pz.toFixed(2), state: closed ? 'closed' : open ? 'open' : 'ajar', side: sideOf(px, pz, yaw, w.px, w.pz), dist: +d.toFixed(1), locked: !!(w.lock && !w.lock.open), barred: !!w.bar, name: [w.za?.name, w.zb?.name].filter(Boolean).join(' ↔ ') });
  }
  doors.sort((a, b) => a.dist - b.dist);
  let behind = null;
  const bd = doors.find((d) => d.side === 'behind' && d.dist < 10);
  if (bd) behind = { kind: 'door', name: bd.state === 'open' ? '開著的門' : bd.state === 'ajar' ? '半開的門' : '關著的門', x: bd.x, y: bd.y, z: bd.z, dist: bd.dist, state: bd.state };
  if (!behind) for (const wi of game.hospital?.K?.windowInfo || []) {
    if (wi.li !== L.levelOfY(py + 0.3)) continue;
    const d = Math.hypot(wi.x - px, wi.z - pz);
    if (d < 8 && sideOf(px, pz, yaw, wi.x, wi.z) === 'behind' && (!behind || d < behind.dist)) behind = { kind: 'window', name: wi.boarded ? '釘了木板的窗' : '窗戶', x: +wi.x.toFixed(2), y: +(py + 1.4).toFixed(2), z: +wi.z.toFixed(2), dist: +d.toFixed(1) };
  }
  if (!behind) { const nb = near.find((n) => n.side === 'behind'); if (nb) behind = { kind: nb.kind, name: nb.name, x: nb.x, y: nb.y, z: nb.z, dist: nb.dist }; }
  if (!behind && W.zoneAt) { // 背後 2.5m 是走廊
    const bx = px + Math.sin(yaw) * 2.5, bz = pz + Math.cos(yaw) * 2.5, bz2 = W.zoneAt(bx, py + 0.2, bz);
    if (bz2 && bz2.theme === 'corridor') behind = { kind: 'corridor', name: bz2.name || '走廊', x: +bx.toFixed(2), y: +(py + 1).toFixed(2), z: +bz.toFixed(2), dist: 2.5 };
  }
  return {
    id: P.key, pos: { x: P.pos.x, y: P.pos.y, z: P.pos.z }, li: P.li,
    player: { x: +px.toFixed(2), y: +py.toFixed(2), z: +pz.toFixed(2), yaw: +yaw.toFixed(3) },
    zone: zn ? { id: zn.id, name: zn.name, theme: zn.theme } : null,
    near, doors, behind, round: game.round || 0, time: +(game.time || 0).toFixed(1), ...extra,
  };
}

function makePhone(api, o) {
  const { ix, ixs, R, game } = api;
  const { key, pos, style, hs, hsI, hsM, led, leds = [], calls = [], pool = [], spec = {} } = o;
  const jig = new THREE.Matrix4();
  const P = {
    key, pos, style, li: o.li, zone: o.zone, state: 'idle', ringT: 0, line: null, special: spec.special || null, cb: 0,
    ring: spec.ring || o.ring || 'tension', offT: 0, talk: null, call: null, t: 0, used: new Set(), ghost: false, _tick: null, lastRing: -1e9,
    intercom: !!spec.intercom, mirrorOf: null, // intercom:金水伯的對講機(不在醫院的線上);mirrorOf:跟著那一支一起響(劇情來電,離你比較近)
    // 這一支正在響的這一通,別支電話接得到嗎(醫院的線上;對講機、金水伯的話不行)
    lineOK() { if (this.intercom) return false; const l = this.line || this.pending(); return !l || onLine(l); },
    pending() { return calls.find((l) => !this.used.has(l.id)) || null; }, // 這支電話排定、還沒接到的劇情來電
    poolLine(list = pool) {
      const free = list.filter((l) => !api.usedLines.has(l.id));
      const l = free.length ? free[(R() * free.length) | 0] : null;
      if (l) api.usedLines.add(l.id);
      return l;
    },
    run() { this._tick ||= ix.tick((dt) => P.update(dt)); },
    // 響:line = 指定的台詞(回撥);dur = 響多久;ghost = 靈異系統讓它響的(phone:ring)。只決定「響」,內容等接起來才挑
    startRing(line = null, dur = 16, ghost = false) {
      if (this.state !== 'idle') return false;
      this.state = 'ringing'; this.ringT = dur; this.t = 0; this.ghost = ghost; this.line = line; this.lastRing = game.time;
      ixs.ringStart(key, pos, RING_KIND[style] || 'bell');
      ix.ringing.add(P);
      if (P.e) { P.e.radius = Math.max(0.36, P.e.r0); P.e.reach = 2.8; P.e.priority = 9; } // 響的時候比較好瞄準(不會被旁邊的東西搶走焦點)
      ix.emit('ring', P);
      this.run();
      return true;
    },
    stopRing() { ixs.ringStop(key); ix.ringing.delete(P); this.mirrorOf = null; if (P.e) { P.e.radius = P.e.r0; P.e.reach = 2.5; P.e.priority = 2; } if (hs) hs.set(hsI, hsM); for (const i of leds) led.color(i, 0x221a10); },
    lift() { if (hs) hs.set(hsI, ZERO); ixs.pickup(null); },
    down() { if (hs) hs.set(hsI, hsM); ixs.hangup(pos); },
    tones() { ixs.dialTone(false); ixs.busyTone(false); ixs.offHook(false); ixs.lineNoise(false); },
    // 別支電話被接起來了:這一支不響了。taken = 被那一支接走的來電(記成用過);沒被接走的劇情來電照「沒接到」處理(過一陣子再響)
    hush(taken) {
      this.stopRing(); this.state = 'idle'; this.ghost = false; this.line = null;
      if (taken?.id) this.used.add(taken.id);
      else ix.emit('missed', P);
    },
    // pick = 這一支沒在響,是拿起來代接別支正在響的那一通(只接醫院線上的;對講機不代接)
    answer(pick = false) {
      const wasRinging = this.state === 'ringing' || pick;
      // 其他同時在響的電話全部停;打來的只有一個人:這一支沒有正在打來的電話時,接到別支上的(王醫師、回撥優先,再來是排定的劇情來電)
      const others = wasRinging ? [...ix.ringing].filter((Q) => Q !== P && Q.state === 'ringing' && (!pick || Q.lineOK())) : [];
      let from = null;
      const take = (fn) => { for (const Q of others) { const l = fn(Q); if (l && onLine(l)) { from = Q; return l; } } return null; };
      let ln = this.line || take((Q) => Q.line) || (wasRinging && !pick ? this.pending() : null) || take((Q) => Q.pending());
      const ghost = this.ghost || others.some((Q) => Q.ghost);
      for (const Q of others) Q.hush(Q === from ? ln : null);
      this.stopRing();
      this.lift();
      this.state = 'call'; this.offT = 0; this.ghost = false; this.line = null; this.end = 'dead'; this._ended = false;
      const hz = game.horror;
      let call = null, talk = null;
      if (ln) { // 劇情來電(王志明、回撥…):我們自己的台詞
        if (ln.id) this.used.add(ln.id);
        talk = api.speak(ln, { filter: 'phone' });
        ix.flags.set('h.call.' + (ln.id || key), true);
      } else {
        if (hz?.phoneCall) { try { call = hz.phoneCall(callContext(api, P, { ringing: wasRinging, ghost })); } catch (err) { console.warn('[interact] phoneCall', err); call = null; } }
        if (call && !call.played && call.lines?.length) { // 腳本給我們播
          const stops = [];
          for (const l of call.lines) stops.push(ix.after(l.at || 0, () => api.speak({ who: l.who || call.who || '電話', voice: l.voice || 'woman', parts: [l.text] }, { filter: l.filter || 'phone' })));
          const s0 = call.stop;
          call.stop = () => { for (const s of stops) s(); s0?.call(call); };
        }
        if (!call && hz?.phone) { try { talk = hz.phone({ id: key, pos, ringing: ghost || wasRinging }); } catch { talk = null; } }
        if (!call && !talk) { ln = this.poolLine(); if (ln) talk = api.speak(ln, { filter: 'phone' }); }
      }
      this.call = call; this.talk = talk;
      if (call?.end) this.end = call.end;
      ixs.lineNoise(true);
      const dur = call ? call.dur ?? 6 : talk?.dur ?? 2.5;
      this.callEnd = game.time + dur + 0.4;
      if (!call && !talk) api.say('', '（只有沙沙的雜訊）', 2200, 'phone');
      ix.emit('call', P, ln || call || null);
    },
    pickUp() { // 沒在響:別支正在響 → 代接那一通;不然撥號音(偶爾線上已經有人)
      const ring = [...ix.ringing].filter((Q) => Q !== P && Q.state === 'ringing');
      if (!this.intercom && !game.story?.callOut?.() && ring.some((Q) => Q.lineOK())) { this.answer(true); return; } // 叫金水伯的車那一步:拿起來是撥號音(你要打出去)
      if (ring.some((Q) => Q.intercom) && !this.intercom) api.toast('是店門口的對講機在響', '#d9c48a', '金水伯只從對講機說話（1F 金水商行門口）');
      this.lift();
      this.state = 'off'; this.offT = 0;
      const idle = api.lineList('PHONE.idle');
      if (idle.length && R() < 0.25) { const l = this.poolLine(idle); if (l) { ixs.lineNoise(true); this.talk = api.speak(l, { filter: 'phone' }); return; } }
      ixs.dialTone(true);
    },
    hangUp(auto = false) {
      try { this.call?.stop?.(); } catch { /* 已結束 */ }
      this.talk?.stop?.(); this.talk?.kill?.();
      this.call = this.talk = null;
      this.tones();
      this.down();
      const was = this.state;
      this.state = 'idle';
      if (auto) api.toast('電話線拉不到那麼遠', '#a3a39a');
      if (this.special === 'callback' && was === 'call' && this.cb < 3) { // 回撥:掛掉後幾秒又響,一次比一次近
        const cbl = api.lineList('PHONE.callback');
        const l = cbl[Math.min(this.cb, cbl.length - 1)] || null;
        this.cb++;
        ix.after(3.5 + R() * 3, () => { if (this.state === 'idle') this.startRing(l, 18); });
      }
    },
    update(dt) {
      if (this.state === 'ringing') {
        this.ringT -= dt; this.t += dt;
        const ringOn = this.t % 3 < 1.1; // 響 1 秒、停 2 秒
        const on = ringOn && (this.t % 0.3) < 0.15;
        for (const i of leds) led.color(i, ringOn ? (on ? 0xffb050 : 0x8a2a0c) : 0x3a0e04);
        if (hs) { // 聽筒在座上跳
          if (ringOn) { jig.copy(hsM).multiply(T(0, 0.004 * Math.abs(Math.sin(this.t * 52)), 0, 0, 0, Math.sin(this.t * 47) * 0.05)); hs.set(hsI, jig); }
          else hs.set(hsI, hsM);
        }
        if (this.ringT <= 0) { // 沒人接:不消耗任何內容
          this.stopRing(); this.state = 'idle'; this.ghost = false; this.line = null;
          if (api.near(pos, 14)) { const ms = api.lineList('PHONE.missed'); const m = ms[(R() * ms.length) | 0]; if (m) api.say('', m.text || '（電話停了。）', 2600); }
          ix.emit('missed', P);
        }
        return true;
      }
      if (this.state === 'off' || this.state === 'call') {
        this.offT += dt;
        const pp = game.player.pos;
        if (Math.hypot(pp.x - pos.x, pp.z - pos.z) > 2.8 || Math.abs(pp.y + 1.2 - pos.y) > 2.5 || game.state !== 'playing') { this.hangUp(game.state === 'playing'); return true; }
        const endAt = this.talk?.endAt, end = endAt === undefined ? this.callEnd : endAt + 0.4; // 台詞排隊中(別人還在講)= Infinity:線路先開著等
        if (this.state === 'call' && game.time > end && !this._ended) { // 對方說完:依 end 收尾
          this._ended = true;
          if (this.end === 'tone') { ixs.lineNoise(false); ixs.dialTone(true); }
          else if (this.end === 'breath') { /* 線路雜訊留著(對方還在,只是不說話) */ }
          else if (this.end === 'click') { ixs.lineNoise(false); ixs.switchClick(null, false); ix.after(0.6, () => { if (this.state === 'call') ixs.busyTone(true); }); }
          else { ixs.lineNoise(false); } // dead:斷線後一片死寂
        }
        if (this.state === 'off' && this.offT > 12 && !this._howl) { this._howl = true; ixs.dialTone(false); ixs.offHook(true); }
        return true;
      }
      this._howl = false;
      this._tick = null;
      return false;
    },
    reset() { if (this.state === 'off' || this.state === 'call') { try { this.call?.stop?.(); } catch { /* 略 */ } this.talk?.stop?.(); this.tones(); } this.stopRing(); this.state = 'idle'; this.cb = 0; this.used.clear(); this.nearDone = false; this.ghost = false; this.line = null; this.call = this.talk = null; },
  };
  P.e = ix.register(pos, {
    id: key, kind: 'phone', name: o.name || '電話', reach: 2.5, radius: o.radius || 0.16, priority: 2, scope: 'map', face: o.face,
    prompt: () => (P.state === 'ringing' ? '接聽電話' : P.state === 'idle' ? (style === 'pay' ? '拿起話筒' : '拿起電話') : '掛上電話'),
    onUse: () => {
      if (P.state === 'ringing') P.answer();
      else if (P.state === 'idle') P.pickUp();
      else { P.hangUp(); return; }
      P.run();
    },
    reset: () => P.reset(),
  });
  P.e.r0 = P.e.radius;
  api.phones.push(P);
  return P;
}

export const phones = {
  build(api, s, spec = {}) {
    const { kit, M, ix } = api;
    const style = spec.style || 'wall';
    const { hs, led } = phonePools(api);
    const m = new Model();
    let hsRest, focus;
    const ledLocal = [], extra = {};
    if (style === 'wall') { wallPhone(m, M); hsRest = T(-0.1, 1.42, 0.075, 0, 0, Math.PI / 2); focus = [0, 1.45, 0.08]; ledLocal.push([0.06, 1.582, 0.074]); }
    else if (style === 'pay') {
      payphone(m, M);
      hsRest = T(-0.14, 1.44, 0.16, 0, 0, Math.PI / 2, 1.1, 1.1, 1.1); focus = [0, 1.45, 0.16];
      ledLocal.push([0.07, 1.68, 0.143]);
      api.signTex?.(s, '公用電話', 0, 2.02, 0.5, 0.5, 0.08);
    } else if (style === 'nurse') {
      const c = nurseCounter(m, M);
      const ph = T(c.slots[0], c.h, 0.12, 0, 0.3);
      const pm = new Model(); deskPhone(pm, M); kit.static(pm, api.mtx(s).multiply(ph), s.li);
      hsRest = T(c.slots[0], c.h + 0.1, 0.08, 0, 0.3);
      focus = [c.slots[0], c.h + 0.08, 0.12];
      for (let i = 0; i < 4; i++) ledLocal.push([c.slots[0] - 0.08 + i * 0.03, c.h + 0.082, 0.17]);
      const rooms = spec.rooms || ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210'];
      extra.cells = nurseBoard(m, M, rooms);
      api.hosts.push({ s, zone: s.zone, slots: c.slots.slice(1).map((x) => ({ x, y: c.h, z: 0.1, used: false })), near: spec.near || null });
      api.box(s, -0.97, 0, 0.97, 0.66, 1.08);
    } else { // desk
      sideTable(m, M);
      const pm = new Model(); deskPhone(pm, M); kit.static(pm, api.mtx(s, 0, 0.72, 0.02, 0.2), s.li);
      hsRest = T(0, 0.72 + 0.1, -0.02, 0, 0.2);
      focus = [0, 0.8, 0.02];
      ledLocal.push([0.06, 0.8, 0.07]);
      api.box(s, -0.26, 0, 0.26, 0.4, 0.75);
    }
    kit.static(m, api.mtx(s), s.li);
    const world = api.mtx(s);
    const hsM = world.clone().multiply(hsRest);
    const hsI = hs.add(s.li, hsM);
    const leds = ledLocal.map((p) => led.add(s.li, world.clone().multiply(T(p[0], p[1], p[2], 0, 0, 0, 0.014, 0.01, 0.006)), 0x221a10));
    if (extra.cells) { // 呼叫燈板(護理站)
      const board = { cells: extra.cells.map((c) => ({ ...c, i: led.add(s.li, world.clone().multiply(T(c.x, c.y, c.z, 0, 0, 0, 0.12, 0.05, 0.004)), 0x1a0806), on: false })) };
      board.light = (room, on = true) => { for (const c of board.cells) if (c.room === String(room)) { c.on = on; led.color(c.i, on ? 0xff3a26 : 0x1a0806); } };
      board.all = (on) => { for (const c of board.cells) board.light(c.room, on); };
      api.nurseBoard = ix.nurseBoard = board;
    }
    const pos = api.wp(s, ...focus);
    const key = spec.id || `ph${s.li}_${Math.round(pos.x * 10)}_${Math.round(pos.z * 10)}`;
    const name = (spec.ext && style !== 'nurse' ? `電話（${/^[A-Z]?\d/.test(spec.ext) ? '分機 ' : ''}${spec.ext}）` : null) || { wall: '電話', desk: '電話', nurse: '護理站電話', pay: '公共電話' }[style];
    return makePhone(api, {
      key, pos, style, li: s.li, zone: s.zone, hs, hsI, hsM, led, leds, spec, name, face: { x: s.nx || 0, z: s.nz || 0 },
      calls: (spec.calls || []).map((id) => api.lineById(id)).filter(Boolean), pool: api.lineList(POOL[style] || 'PHONE.ring'),
    });
  },
};

// 現有道具上的電話錨點(game.hospital.propEvents kind 'phone'):模型是合併過的道具,另外加一顆會閃的線路燈
export function anchorPhone(api, ev) {
  const { game } = api;
  const { led } = phonePools(api);
  const li = Math.max(0, game.world.layout.levelOfY(ev.y - 0.5));
  const pos = { x: ev.x, y: ev.y + 0.05, z: ev.z };
  const leds = [led.add(li, T(ev.x, ev.y + 0.07, ev.z, 0, 0, 0, 0.016, 0.012, 0.016), 0x221a10)];
  return makePhone(api, { key: `pa${Math.round(ev.x * 10)}_${Math.round(ev.z * 10)}`, pos, style: 'anchor', li, zone: ev.zone, led, leds, ring: 'tension', radius: 0.2, pool: api.lineList('PHONE.ring') });
}

// 電話導演:地圖很大,所以挑「玩家附近、走得到」的電話響:路徑距離 15~40m、同一層優先、看不到的優先、還有劇情來電沒接的優先;
// 一局裡會輪流用很多支(剛響過的 90 秒內不重複)。有靈異系統時先問 director.request('phoneRing'),真的響了再 notify(避免和其他驚嚇疊在一起)。
// 靈異系統讓某支電話響(game.horror 'phone:ring')→ 那一支真的電話開始響、能接;收音機自己打開('radio:on')→ 可以關掉。
// 劇情電話(ring:'flag:xxx')在旗標成立時響;沒接的話過一陣子再響,直到接起來為止。
export function phoneDirector(api) {
  const { ix, game, R, ixs, sfx } = api;
  let next = 40 + R() * 30, t = 0, bound = null;
  const near = (pos, r = 1.6) => { let best = null, bd = r; for (const P of api.phones) { const d = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) + Math.abs(P.pos.y - (pos.y ?? P.pos.y)) * 0.5; if (d < bd) { bd = d; best = P; } } return best; };
  const H = () => game.horror;
  const ask = () => { const d = H()?.director; return !d?.request || d.request('phoneRing') !== false; };
  const told = () => H()?.director?.notify?.('phoneRing');
  const bind = (h) => {
    bound = h;
    h.on?.('phone:ring', (d) => { const P = d?.pos && near(d.pos); if (P && P.state === 'idle') P.startRing(null, Math.max(6, (d.until ?? game.time + 9) - game.time + 6), true); });
    h.on?.('radio:on', (d) => { // 靈異系統把收音機/電視打開了:那裡出現「關掉」的互動(13 秒後它自己會停)
      if (!d?.pos) return;
      const tv = d.kind === 'tv' || d.kind === 'cctv';
      const e = ix.register(d.pos, {
        id: `ghost-radio:${Math.round(d.pos.x)}_${Math.round(d.pos.z)}:${(game.time * 10) | 0}`, kind: 'radio', name: tv ? '電視' : '收音機', reach: 2.4, radius: 0.3, scope: 'run',
        prompt: tv ? '關掉電視' : '關掉收音機',
        onUse: () => { sfx.loopStop('gh-radio'); if (tv) ixs.tvOff(d.pos); else ixs.switchClick(d.pos, false); e.remove(); ix.emit('radio:off', d); },
      });
      ix.after(13, () => e.remove());
    });
  };
  // 走不到的電話不挑:捲門拉下時金水商行裡那支、劇情還鎖著的區域裡的(玩家看得到方向卻怎麼走都進不去)
  const zid = (P) => (P.zone && typeof P.zone === 'object' ? P.zone.id : P.zone) || '';
  // (區域被鎖住 = 那個區域的每一個門洞都還鎖著;只鎖了其中一扇,例如走廊上 207 的門,走廊還是走得到)
  const unreachable = (P) => {
    const z = String(zid(P)), D = game.interact?.doors;
    if (/store|shop/.test(z) && game.shop && !game.shop.open) return true;
    try { const ws = z && D?.waysOf ? D.waysOf(z) : []; if (ws.length && ws.every((w) => D.isLocked(w))) return true; } catch { /* 沒有這個區域的門 */ }
    return false;
  };
  // 依路徑距離挑一支(a~b 公尺;同層 ×3、相鄰樓層 ×1、看不到 ×1.6、有劇情來電 ×2.5、90 秒內響過的不挑)
  const pick = (a = 15, b = 40) => {
    const W = game.world, L = W.layout, p = game.player.pos, li = L.levelOfY(p.y + 0.3);
    const out = [];
    for (const P of api.phones) {
      if (P.state !== 'idle' || P.ring === 'never' || game.time - P.lastRing < 90) continue;
      if (unreachable(P)) continue;
      const dl = Math.abs(P.li - li);
      if (dl > 1) continue;
      const fy = L.levels[P.li]?.y ?? P.pos.y;
      let d = W.flowDistance ? W.flowDistance(P.pos.x, fy, P.pos.z) : Infinity;
      if (!Number.isFinite(d)) d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z) * 1.4 + dl * 8; // 導航沒算到:用直線估計
      if (d < a || d > b) continue;
      let w = dl === 0 ? 3 : 1;
      if (!W.hasLineOfSight(p.x, p.y + 1.6, p.z, P.pos.x, P.pos.y, P.pos.z)) w *= 1.6;
      if (P.pending()) w *= 2.5;
      out.push([P, w, d]);
    }
    if (!out.length) return null;
    let s = 0;
    for (const o of out) s += o[1];
    let r = R() * s;
    for (const o of out) if ((r -= o[1]) <= 0) return o[0];
    return out[0][0];
  };
  // ---- 離你最近的電話(w6):路徑距離(導航的距離場);距離場量到的是隊友、或沒算到 → 用直線估 ----
  const pathDist = (P) => {
    const W = game.world, L = W.layout, p = game.player.pos, li = L.levelOfY(p.y + 0.3), dl = Math.abs(P.li - li);
    const straight = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
    let d = W.flowDistance ? W.flowDistance(P.pos.x, L.levels[P.li]?.y ?? P.pos.y, P.pos.z) : Infinity;
    if (!Number.isFinite(d) || d < straight - 1.5) d = straight * 1.4 + dl * 10;
    return d;
  };
  const whereOf = (P) => { const z = game.world.layout.zones?.find?.((q) => q.id === zid(P)); return z ? `${z.level} ${z.name}` : ''; };
  let nCache = null, nT = -1;
  // o.ic = 店門口的對講機也算(叫金水伯的車);o.ring = 正在響的也算;o.exclude = 不算這一支
  const nearestPhone = (o = {}) => {
    if (!o.exclude && nCache && game.time - nT < 1 && nCache.ic === !!o.ic && nCache.ring === !!o.ring) return nCache.r;
    let best = null, bd = Infinity;
    for (const P of api.phones) {
      if (P === o.exclude || (P.intercom && !o.ic) || unreachable(P)) continue;
      if (P.state !== 'idle' && !(o.ring && P.state === 'ringing')) continue;
      const d = pathDist(P);
      if (d < bd) { bd = d; best = P; }
    }
    const r = best ? { P: best, d: bd, where: whereOf(best), name: best.e?.name || '電話', at: { x: best.pos.x, y: best.pos.y + 0.1, z: best.pos.z } } : null;
    if (!o.exclude) { nCache = { r, ic: !!o.ic, ring: !!o.ring }; nT = game.time; }
    return r;
  };
  ix.nearestPhone = nearestPhone;
  // 劇情來電(有指定台詞,醫院線上的)響在離你很遠的那一支:最近的那一支也跟著響(同一通,接哪一支都可以;見 answer)
  const storyLine = (P) => { const l = P.line || (P.ring.startsWith('flag:') ? P.pending() : null); return l?.id ? l : null; };
  const mirror = (P) => {
    if (P.mirrorOf || P.intercom) return null;
    const l = storyLine(P);
    if (!l || !onLine(l)) return null;
    const n = nearestPhone({ exclude: P });
    if (!n) return null;
    const dP = pathDist(P);
    if (!(dP > 12 && n.d < dP - 8)) return null; // 原本那一支就夠近了
    if (!n.P.startRing(null, Math.max(8, P.ringT))) return null;
    n.P.mirrorOf = P;
    return n.P;
  };
  // 提示(只給自己):劇情來電響了 2.5 秒、你離每一支在響的都還很遠 → 訊息列寫出最近的一支在哪,那一支閃一下
  const hinted = new Map();
  const hint = (P) => {
    const l = storyLine(P);
    if (!l || P.mirrorOf) return;
    ix.after(2.5, () => {
      if (game.state !== 'playing' || P.state !== 'ringing' || game.story?.ending?.active) return;
      if (game.time - (hinted.get(l.id) ?? -1e9) < 40) return;
      const mates = [...ix.ringing].filter((Q) => Q.state === 'ringing' && (Q === P || Q.mirrorOf === P));
      if (mates.some((Q) => pathDist(Q) < 9)) return; // 已經在旁邊了
      hinted.set(l.id, game.time);
      if (P.intercom || !onLine(l)) { game.ui?.feed?.(`店門口的對講機在響${whereOf(P) ? `（${whereOf(P)}）` : ''}。`, { color: '#e3c98a', ms: 6000 }); return; }
      const n = nearestPhone({ ring: true });
      if (!n) return;
      const tag = /（/.test(n.name) || n.name === '電話' ? '' : `（${n.name}）`;
      game.ui?.feed?.(`電話在響——最近的一支在${n.where}${tag}。`, { color: '#e3c98a', ms: 6500 });
      game.objectives?.glintAt?.(n.at, 12);
      try { game.ui?.tips?.show?.('phone', 1); } catch { /* 略 */ }
    });
  };
  ix.on('ring', (P) => { if (P.mirrorOf) return; mirror(P); hint(P); });
  const ringNear = (a, b, { gate = true, dur = 16 } = {}) => {
    const P = pick(a, b);
    if (!P) return false;
    if (gate && !ask()) return false;
    if (!P.startRing(null, dur)) return false;
    if (gate) told();
    return P;
  };
  ix.on('flag', (k) => { for (const P of api.phones) if (P.ring === 'flag:' + k && P.state === 'idle') P.startRing(); });
  ix.on('missed', (P) => { if (P.ring.startsWith('flag:') && P.pending() && ix.flags.has(P.ring.slice(5))) ix.after(45 + R() * 35, () => { if (P.state === 'idle' && P.pending()) P.startRing(); }); }); // 劇情來電沒接:過一陣子再響
  ix.on('reset', () => { next = 40 + R() * 30; api.lastRing = -1e9; });
  ix.on('ring', () => { api.lastRing = game.time; });
  const dir = {
    pick,
    ring: (id) => { const P = id ? api.phones.find((q) => q.key === id || q.e?.id === id) : pick(15, 40) || api.phones.find((q) => q.state === 'idle'); return P ? P.startRing() : false; },
    // 讓 pos 附近(2m 內)的那支電話響(驚嚇事件、回撥用;不另外問導演);沒有就回傳 false(呼叫端不要只放鈴聲)
    ringAt: (pos, dur = 12) => { const P = near(pos, 2.2); return P && P.state === 'idle' ? P.startRing(null, dur) : false; },
    // 讓 a~b 公尺(路徑)外的一支電話響(環境音「遠處電話」用;gap 秒內響過就不響;會問導演)
    ringFar: (a = 15, b = 40, gap = 0) => (game.time - (api.lastRing ?? -1e9) < gap ? false : !!ringNear(a, b)),
  };
  ix.tick((dt) => {
    if (H() && H() !== bound) bind(H());
    if ((t += dt) < 1) return true;
    t = 0;
    if (game.state !== 'playing') return true;
    const p = game.player.pos, now = game.time;
    const calm = api.calm(10) || game.phase === 'shop';
    if (ix.ringing.size || !calm) return true;
    // 劇情來電還沒接、玩家走到附近(6~16m):再響一次
    for (const P of api.phones) {
      if (P.state !== 'idle' || !P.pending() || !P.ring.startsWith('flag:') || !ix.flags.has(P.ring.slice(5)) || now - P.lastRing < 50) continue;
      const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
      if (d > 6 && d < 16 && Math.abs(P.pos.y - p.y - 1.4) < 2 && ask()) { P.startRing(); told(); return true; }
    }
    if (now < next) return true;
    next = now + (ringNear(15, 40) || ringNear(10, 60) ? 75 + R() * 60 : 12); // 附近沒有就放寬一點(B1 電話比較少)
    return true;
  });
  return dir;
}
