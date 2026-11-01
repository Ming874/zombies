// 天氣:雨聲音床、定位雨聲、雷聲(給 outdoor 代理的天氣系統呼叫)。
//
// sfx.setRain(level, outdoorFactor)
//   level 0..1 雨勢(0 = 停雨,0.3 毛毛雨,0.6 中雨,1 暴雨);outdoorFactor 0..1 聆聽者「在室外的程度」
//   (1 = 露天、0.5 = 門口/破窗旁、0 = 建築深處)。省略 outdoorFactor 時依目前區域是否戶外自動判斷。
//   可每幀呼叫(內部平滑、只在數值變化夠大時才排自動化);level 為 0 時 8 秒後拆掉節點。
// sfx.thunder(dist, delay)
//   dist 公尺(閃電距離,約 200~6000);請在閃電亮起的當下呼叫:聲音依聲速延遲 dist/343 秒到達(最多 8 秒),
//   也可用 delay(秒)指定延遲。近的雷 = 尖銳的霹靂聲 + 全頻的滾雷;遠的 = 延遲後低沉、拉長的悶雷;室內再變悶。
//
// 全部是真實錄音(CC0,public/audio/rain/,署名見 public/credits/audio.md),每層兩個不同的錄音片段左右各一(真的去相關的
// 立體寬度,也聽不出循環),依位置交叉淡化:
//   遠處雨幕 wash — 室外全頻(雨越大再加一層中央的雨幕 = 厚而寬);室內過低通 = 隔著牆/屋頂的悶雨聲;室外層有陣風起伏
//   近處雨滴 near — 地面、水窪的細節,只有真的在室外才清楚;高通後當草叢/樹葉的沙沙
//   屋頂/排水溝 roof — 雨棚、屋簷下 = 近而響的鼓點;室內 = 頂樓才聽得到的悶悶屋頂鼓聲(依上方還有幾層樓衰減)
//   窗戶 window — 室內靠近窗戶時的玻璃雨滴聲(另有定位在最近那扇窗的聲源)
// 定位雨聲(共用聲道條、最多 4 個、最近的優先):最近的窗戶、遮蔽物邊緣的滴水與排水管湧流、救護車/警車/靈車車頂、水塔/發電機的鐵皮。
// 錄音在選單時就以閒置優先權預先載入;還沒載好時不出合成噪音,而是靜音、載好後淡入。
import { A, onTick, emit, gain, filter, burst, tone, rand, clamp, playBuf } from './core.js';
import * as S from './samples.js';

const LP = { sr: 24000, n: [1] };
Object.assign(S.LOOPS, {
  rain_wash_a: { ...LP, f: ['rain/rain_wash_a.ogg'] }, rain_wash_b: { ...LP, f: ['rain/rain_wash_b.ogg'] },
  rain_near_a: { ...LP, sr: 32000, f: ['rain/rain_near_a.ogg'] }, rain_near_b: { ...LP, sr: 32000, f: ['rain/rain_near_b.ogg'] },
  rain_roof_a: { ...LP, f: ['rain/rain_roof_a.ogg'] }, rain_roof_b: { ...LP, f: ['rain/rain_roof_b.ogg'] },
  rain_window_a: { ...LP, sr: 32000, f: ['rain/rain_window_a.ogg'] }, rain_window_b: { ...LP, sr: 32000, f: ['rain/rain_window_b.ogg'] },
  rain_gush: { ...LP, f: ['rain/rain_gush.ogg'] },
  thunder: { sr: 22050, n: [1], f: ['rain/thunder_roll.ogg'] },
});
const STEMS = ['rain_wash_a', 'rain_wash_b', 'rain_near_a', 'rain_near_b', 'rain_roof_a', 'rain_roof_b', 'rain_window_a', 'rain_window_b', 'rain_gush', 'thunder'];
// 選單時閒置預先載入(不擋選單;載入佇列本來就在背景執行緒解碼)
const stems = () => (QL() === 'low' ? STEMS.filter((k) => !/_b$|window/.test(k)) : STEMS); // 低畫質:每層只用一個片段(省約一半解碼記憶體)
export function preloadRain() { R.pre = true; for (const k of stems()) S.loop(k); }

const R = { pre: false, keepT: 0, lvl: 0, out: -1, rec: null, offAt: 0, ctxT: -9, cx: { dr: 0, win: 0, veg: 0, roofK: 1 }, last: {}, em: [], emT: -9, gustT: 0 };
function QL() { try { return A.game?.quality?.preset || 'high'; } catch { return 'high'; } }

// ---------- 音床 ----------
function src(b, dest, pan, rate = 1) {
  const s = A.ctx.createBufferSource();
  s.buffer = b; s.loop = true;
  s.playbackRate.value = rate * rand(0.99, 1.01);
  const p = A.ctx.createStereoPanner();
  p.pan.value = pan;
  s.connect(p); p.connect(dest);
  s.start(A.ctx.currentTime, rand(0, b.duration));
  return s;
}
function recBed() {
  const q = QL(), G = {}, srcs = [];
  const o = gain(0); // 總量(第一層載好才淡入)
  const shelf = filter('highshelf', 6500, 0.7); shelf.gain.value = -4; // 去掉刺耳的嘶嘶
  o.connect(shelf); shelf.connect(filter('lowpass', 14000, 0.5, A.bus.amb));
  const gustOut = gain(1, o); // 陣風只影響室外層
  const mk = (k, dest) => (G[k] = gain(0, dest || o));
  mk('wash', gustOut); mk('dense', gustOut); mk('washIn');
  mk('near', gustOut);
  if (q === 'high' || q === 'ultra') mk('veg', gustOut);
  mk('awn'); mk('roofIn');
  if (q !== 'low') mk('glass');
  // 各層的輸入(兩個片段 → 這裡)與分支
  const w = gain(1); w.connect(G.wash); w.connect(filter('lowpass', 650, 0.6, G.washIn));
  const nr = gain(1); nr.connect(G.near); if (G.veg) nr.connect(filter('highpass', 2600, 0.6, G.veg));
  const rf = gain(1); const pk = filter('peaking', 2500, 1.2, G.awn); pk.gain.value = 3; rf.connect(pk); rf.connect(filter('lowpass', 420, 0.7, G.roofIn));
  const wn = G.glass ? gain(1) : null; if (wn) wn.connect(filter('highpass', 600, 0.6, G.glass));
  // [輸入節點, 片段 a, 片段 b, 寬度]
  const lay = [[w, 'rain_wash_a', 'rain_wash_b', 0.85], [nr, 'rain_near_a', 'rain_near_b', 0.7], [rf, 'rain_roof_a', 'rain_roof_b', 0.55]];
  if (wn) lay.push([wn, 'rain_window_a', 'rain_window_b', 0.45]);
  return { o, gustOut, G, srcs, lay, started: new Set() };
}
function stopBed(N) {
  if (!N) return;
  for (const s of N.srcs) { try { s.stop(); } catch { /* 已停 */ } }
  setTimeout(() => { try { N.o.disconnect(); } catch { /* 已斷 */ } }, 150);
}

// ---------- 位置情境(每 0.25 秒) ----------
function context(now) {
  if (now - R.ctxT < 0.25) return;
  R.ctxT = now;
  const C = R.cx, L = A.L, lay = A.world && A.world.layout;
  if (R.cxOverride) { Object.assign(C, R.cxOverride); return; }
  try { C.dr = clamp(+(A.game && A.game.weather && A.game.weather.drum) || 0, 0, 1); } catch { C.dr = 0; }
  C.win = 0; C.veg = 0; C.roofK = 1; C.winPos = null;
  if (!lay || !lay.flagsAt) return;
  const feet = L.y - 1.65, li = lay.levelOfY ? lay.levelOfY(feet) : 0, c0 = Math.floor(L.x / 2), r0 = Math.floor(L.z / 2);
  let best = 9, bc = 0, br = 0;
  for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
    if (lay.flagsAt(li, c0 + dc, r0 + dr) & 512) { const d = Math.hypot(dc, dr) * 2; if (d < best) { best = d; bc = c0 + dc; br = r0 + dr; } }
  }
  C.win = best < 9 ? clamp(1 - (best - 1) / 5, 0, 1) : 0;
  if (best < 9) C.winPos = { x: (bc + 0.5) * 2, y: (lay.levels[li]?.y ?? 0) + 1.5, z: (br + 0.5) * 2 };
  let surf = A.surface;
  try { surf = A.world.surfaceAt(L.x, feet, L.z) || surf; } catch { /* 用舊值 */ }
  const z = lay.zoneAt ? lay.zoneAt(li, c0, r0) : null;
  C.veg = surf === 'grass' || (z && /courtyard|cemetery|playground/.test(z.theme || '')) ? 1 : 0;
  let above = 0;
  if (lay.hasFloor) for (let lj = li + 1; lj < lay.levels.length; lj++) if (lay.hasFloor(lj, c0, r0)) above++;
  C.roofK = 1 / (1 + 1.6 * above);
}

function autoOut() {
  if (A.outdoor) return 1;
  const w = A.world, L = A.L;
  if (w && w.ceilAt) { try { return Number.isFinite(w.ceilAt(L.x, L.z, L.y - 1.65)) ? 0 : 1; } catch { return 0; } }
  return 0;
}

export function setRain(level, outdoorFactor) {
  R.lvl = clamp(+level || 0, 0, 1);
  R.out = Number.isFinite(outdoorFactor) ? clamp(outdoorFactor, 0, 1) : -1;
  if (!A.ctx) return;
  if (R.lvl > 0.001 && !R.rec) R.rec = recBed();
  apply(false);
}

// 各層的目標增益(雨量 l、室外程度 o、雨棚 dr、靠窗 win、植被 veg、上方樓層 roofK)
export function rainGains(l, o, C) {
  const base = Math.pow(l, 0.7);
  return {
    wash: base * (0.5 + 0.25 * l) * o,
    dense: Math.max(0, l - 0.45) * 1.1 * o, // 大雨:中央再一層 = 厚而寬
    washIn: base * 0.42 * (1 - o) * (0.45 + 0.55 * C.roofK),
    near: Math.pow(l, 1.1) * Math.pow(o, 1.5) * 0.8 * (1 - 0.5 * C.dr),
    veg: l * o * C.veg * 0.5,
    awn: l * (C.dr * 1.25 + o * 0.1),
    roofIn: l * (1 - o) * C.roofK * 0.75,
    glass: l * C.win * (1 - 0.6 * o) * 0.55, // 另有定位在窗上的聲源
  };
}

function apply(force) {
  if (!A.ctx) return;
  const n = A.ctx.currentTime, o = R.out >= 0 ? R.out : autoOut(), l = R.lvl;
  context(n);
  const rec = R.rec, last = R.last;
  if (rec) {
    const g = rainGains(l, o, R.cx);
    let any = false;
    for (const k in rec.G) {
      const v = g[k] ?? 0;
      if (force || Math.abs(v - (last[k] ?? -1)) > 0.015) { rec.G[k].gain.setTargetAtTime(v, n, k === 'awn' || k === 'glass' ? 0.35 : 0.6); last[k] = v; any = true; }
    }
    const tot = rec.started.size ? 1.25 : 0; // 錄音沒到前完全靜音,到了慢慢淡入(不出合成噪音)
    if (force || any || last.o !== tot) { rec.o.gain.setTargetAtTime(tot, n, 2.5); last.o = tot; }
  }
  R.offAt = l <= 0.001 ? (R.offAt || n + 8) : 0;
}

// ---------- 定位雨聲(共用、最多 4 個、最近的優先) ----------
const EMK = { // kind → [錄音片段, 濾波, 增益, 半徑]
  window: ['rain_window_a', 'hp', 1.1, 7],
  edge: ['rain_gush', 'lp', 0.7, 9],
  car: ['rain_roof_b', 'metal', 0.9, 14],
  metal: ['rain_roof_a', 'metal', 0.8, 16],
};
const CAR = { radio: 'car', crash_ambulance: 'car', stretcher: 'car', coffin: 'car', generator: 'metal', water_tower: 'metal' };
function candidates() {
  const L = A.L, C = R.cx, out = [], o = R.out >= 0 ? R.out : 0;
  if (C.winPos && o < 0.6 && QL() !== 'low') out.push({ k: 'window', pos: C.winPos, id: `w${C.winPos.x},${C.winPos.z}` });
  // 遮蔽物邊緣(雨棚、屋簷):頭頂有遮蔽、附近有淋得到雨的點 → 那裡有滴水/排水湧流
  const W = A.game && A.game.weather, occ = W && W.occ;
  if (occ && occ.exposed && R.lvl > 0.2) {
    let best = null, bd = 99;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const rr of [1.5, 3, 4.5]) {
        const x = L.x + Math.cos(a) * rr, z = L.z + Math.sin(a) * rr;
        let ex = false;
        try { ex = occ.exposed(x, L.y - 1.3, z) && !occ.exposed(x - Math.cos(a) * 1.2, L.y - 1.3, z - Math.sin(a) * 1.2); } catch { ex = false; }
        if (ex && rr < bd) { bd = rr; best = { x, y: L.y - 0.4, z }; }
      }
    }
    if (best) out.push({ k: 'edge', pos: best, id: `e${Math.round(best.x)},${Math.round(best.z)}` });
  }
  const ev = A.game && A.game.hospital && A.game.hospital.propEvents;
  if (ev && o > 0.3) for (const e of ev) { const k = CAR[e.kind]; if (k && Math.hypot(e.x - L.x, e.z - L.z) < EMK[k][3] + 4) out.push({ k, pos: { x: e.x, y: (e.y || 0) + 1.6, z: e.z }, id: `p${e.kind}${Math.round(e.x)}` }); }
  for (const c of out) c.d = Math.hypot(c.pos.x - L.x, c.pos.z - L.z);
  return out.sort((a, b) => a.d - b.d).slice(0, QL() === 'low' ? 2 : 4);
}
function emitters(now) {
  if (now - R.emT < 0.6) return;
  R.emT = now;
  const want = R.lvl > 0.05 && R.rec ? candidates() : [];
  const ids = new Set(want.map((c) => c.id));
  for (let i = R.em.length - 1; i >= 0; i--) { // 不要的淡出
    const e = R.em[i];
    if (!ids.has(e.id)) { e.h.kill(); const s = e.s; setTimeout(() => { try { s.stop(); } catch { /* 已停 */ } }, 600); R.em.splice(i, 1); }
  }
  for (const c of want) {
    const e = R.em.find((x) => x.id === c.id);
    const K = EMK[c.k], lvl = R.lvl * K[2];
    if (e) { e.g.gain.setTargetAtTime(lvl, A.ctx.currentTime, 0.5); if (c.k === 'edge' && Math.random() < 0.35 * R.lvl) S.play('amb.drip', { h: e.h, g: 0.6 }); continue; }
    const b = S.loop(K[0]);
    if (!b) continue;
    const h = emit({ pos: c.pos, cat: 'loop', bus: 'amb', prio: 1, dur: 1e6, room: 0.25, ref: 1.6, roll: 1.2, maxDist: K[3] + 6, gain: 1, track: false, nocap: true });
    if (!h) continue;
    const g = gain(0, h.in);
    const f = K[1] === 'hp' ? filter('highpass', 700, 0.6, g) : K[1] === 'lp' ? filter('lowpass', 2200, 0.6, g) : filter('peaking', 3200, 1.4, g);
    if (K[1] === 'metal') f.gain.value = 6;
    const s = A.ctx.createBufferSource();
    s.buffer = b.b; s.loop = true; s.playbackRate.value = rand(0.95, 1.05);
    s.connect(f);
    s.start(h.t, rand(0, b.b.duration));
    g.gain.setTargetAtTime(lvl, h.t, 0.6);
    R.em.push({ id: c.id, k: c.k, h, g, s });
  }
}
function stopEmitters() { for (const e of R.em) { e.h.kill(); try { e.s.stop(A.ctx.currentTime + 0.2); } catch { /* 已停 */ } } R.em.length = 0; }

onTick((now) => {
  if (R.pre && now > R.keepT) { R.keepT = now + 20; for (const k of stems()) S.loop(k); } // 標記使用中:不被 loopGC 釋放(共約 1 MB Opus)
  if (!R.rec) return;
  const rec = R.rec;
  if (R.lvl > 0.001) {
    for (const [io, ka, kb, wide] of rec.lay) { // 兩個片段都載好才接上這一層
      const id = ka;
      if (rec.started.has(id)) continue;
      const a = S.loop(ka), b = QL() === 'low' ? a : S.loop(kb); // 低畫質:同一片段、不同起點
      if (a && b) {
        rec.started.add(id);
        rec.srcs.push(src(a.b, io, -wide), src(b.b, io, wide));
        if (ka === 'rain_wash_a') rec.srcs.push(src(b.b, rec.G.dense, 0, 0.97)); // 大雨用的中央雨幕
        apply(true);
      }
    }
    if (now > R.gustT) { // 陣風:室外層的強弱起伏
      R.gustT = now + rand(1.5, 5);
      const k = R.lvl * (R.out >= 0 ? R.out : 0);
      rec.gustOut.gain.setTargetAtTime(1 + rand(-0.25, 0.35) * k, now, rand(0.6, 1.8));
    }
  }
  if (R.out < 0 || now - R.ctxT > 0.5) apply(false);
  emitters(now);
  if (R.offAt && now > R.offAt) { stopEmitters(); stopBed(R.rec); R.rec = null; R.last = {}; R.offAt = 0; return; }
  const l = R.lvl, o = R.out >= 0 ? R.out : 0;
  if (o > 0.2 && o < 0.9 && l > 0.2 && Math.random() < 0.02 * l) S.play('amb.drip', { bus: 'amb', prio: 0, gain: 0.5, g: 0.6 });
});

// ---------- 雷 ----------
export function thunder(dist = 1500, delay) {
  if (!A.ctx) return;
  const dd = clamp(+dist || 1500, 50, 12000);
  const dl = Number.isFinite(delay) ? clamp(delay, 0, 10) : Math.min(8, dd / 343);
  const near = clamp(1 - (dd - 250) / 1600, 0, 1);
  const ind = R.out >= 0 ? 1 - R.out : 1 - autoOut();
  const rec = S.loop('thunder');
  const len = rec ? rec.b.duration / (0.82 + near * 0.18) + 0.5 : 3.5 + (1 - near) * 3 + rand(0, 1.5);
  const h = emit({ bus: 'amb', prio: 5, room: 0.3, hall: 0.9, echo: 0.6, dur: len + 1, delay: dl, gain: (0.5 + near * 0.7) * (1 - ind * 0.45) });
  if (!h) return;
  const t = h.t;
  const lp = filter('lowpass', (ind > 0.5 ? 0.5 : 1) * (near > 0.6 ? 12000 : 380 + near * 3500), 0.6, h.in);
  if (near > 0.3) {
    burst(lp, t, { type: 'highpass', f: 1200, dur: 0.12, a: 0.004, g: 0.5 * near });
    burst(lp, t + 0.01, { buf: 'pink', type: 'bandpass', f: 2500, f1: 500, q: 0.6, dur: 0.6, a: 0.01, g: 0.45 * near });
    tone(lp, t, { f: 55, f1: 28, dur: 0.7, a: 0.005, g: 0.6 * near });
  }
  if (rec) {
    const rate = 0.82 + near * 0.18 + rand(-0.03, 0.03);
    playBuf(lp, t + (near > 0.3 ? 0.08 : 0), rec.b, { rate, g: rec.g * (0.9 + near * 0.6), fi: near > 0.3 ? 0 : 0.6 });
    tone(lp, t, { f: rand(32, 40), f1: 22, dur: len * 0.6, a: 0.4 + (1 - near) * 0.6, g: 0.18 });
    return;
  }
  tone(lp, t, { f: rand(32, 42), f1: 22, dur: len * 0.8, a: 0.3 + (1 - near) * 0.5, g: 0.35 });
  for (let i = 0; i < 6; i++) {
    const p = A.ctx.createStereoPanner();
    p.pan.value = rand(-0.9, 0.9);
    p.connect(lp);
    burst(p, t + rand(0.05, len * 0.6), { buf: 'brown', type: 'lowpass', f: rand(180, 420), f1: 60, dur: rand(0.8, 2), a: rand(0.1, 0.4), g: rand(0.15, 0.35) });
  }
  burst(lp, t + 0.1, { buf: 'brown', type: 'lowpass', f: 300, f1: 60, dur: len, a: 0.5, g: 0.3 });
}

export const rainState = () => ({ on: !!R.rec, level: R.lvl, out: R.out, ctx: { dr: R.cx.dr, win: R.cx.win, veg: R.cx.veg, roofK: R.cx.roofK }, layers: R.rec ? [...R.rec.started] : [], emitters: R.em.map((e) => e.k), gains: { ...R.last }, synth: false });
export function rainContext(cx) { R.cxOverride = cx || null; R.ctxT = -9; }
export function rainReset() {
  try { stopEmitters(); stopBed(R.rec); } catch { /* 不同 context 的節點 */ }
  R.rec = null; R.last = {}; R.offAt = 0; R.ctxT = -9; R.em = [];
}
