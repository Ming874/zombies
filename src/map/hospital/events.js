import * as THREE from 'three';
import { sfx } from '../../audio.js';
import { surf } from './surfaces.js';

// 心理驚嚇事件導演:依玩家位置、視線方向、所在區域與冷卻,挑一個「看得到」的事件觸發。
// 只動視覺/燈光/音效(sfx.scare / sfx.door / sfx.thud),不造成傷害、不擋路。全部是本機效果(多人時各自發生)。
// 節奏:安靜時才累積(附近有殭屍時延後)、全域最短間隔、每種事件各自冷卻、每個錨點有使用次數上限。
// 擴充:registerEvents({ kind: { w, cd, ok(c), run(c) } }) 加新事件;registerEventBias({ mood/theme: { kind: 倍率 } }) 調區域權重。
// [ghost] 有 src/horror(驚嚇導演)時:api.auto = false 關掉這裡的自動排程,改由導演呼叫 api.fire(kind);
//         api.register(defs) 在建好之後加入/覆寫事件種類;c(事件情境)另外提供 K、L、sees、solid、inView… 給 src/horror/paranormal.js。
//
// 內建事件:
//  flicker   前方的燈一陣狂閃,有時「啪」一聲燒掉(火花 + 碎玻璃聲)
//  blackout  附近整區斷電幾秒,再一盞一盞亮回來
//  door      樓梯間防火門/隔離房門被甩上,過幾秒又慢慢自己打開
//  figure    長走廊盡頭(常在最後一盞亮燈下)站著一個黑影,靠近、盯著看或燈一閃就不見
//  fall      天花板破洞掉下一片天花板(物理)
//  cart      輪椅/推車/點滴架自己動了一下(物理衝量)
//  anchor    道具錨點:電話響、電視雪花、監視器、燭火熄滅、娃娃頭轉向你、隔離房敲門、停屍櫃抽屜、白布下的呼吸…
//  ambient   樓上的腳步、遠處尖叫、哭聲、音樂盒、耳邊低語(依區域)
const REG = {}; // 外部註冊的事件種類(新地圖用)
const BIAS = {
  basement: { blackout: 1.8, fall: 1.4, figure: 1.2, ambient: 1.2 }, flooded: { ambient: 1.5, figure: 1.3 },
  ward: { door: 1.2, anchor: 1.3 }, psych: { figure: 1.6, door: 1.5, flicker: 1.3 }, corridor: { figure: 1.5, flicker: 1.2, cart: 1.3 },
  nursery: { ambient: 2, anchor: 1.6 }, morgue: { anchor: 1.6, flicker: 1.3 }, stair: { door: 2, ambient: 1.3 }, chapel: { anchor: 1.5, ambient: 1.3 },
  safe: { flicker: 0, blackout: 0, figure: 0, door: 0, fall: 0, cart: 0, ambient: 0.2, anchor: 0.3 }, outdoor: { flicker: 0, blackout: 0, fall: 0, door: 0, figure: 0.4 },
};
export function registerEvents(defs) { Object.assign(REG, defs); }
export function registerEventBias(b) { for (const [k, v] of Object.entries(b)) BIAS[k] = { ...(BIAS[k] || {}), ...v }; }

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export function createEvents({ K, L, lights, propEvents = [], root }) {
  const fixtures = lights.fixtures;
  const doors = (K.dynDoors || []).map((d) => ({ ...d, anim: null, cur: d.group.rotation.y }));
  const holes = (K.ceilings || []).filter((c) => c.kind === 'hole');
  const anchors = propEvents.map((e) => ({ ...e, used: 0, last: -1e9, li: Number.isFinite(e.level) ? e.level : L.levelOfY(e.y - 0.5) }));
  const S = { next: -1, last: {}, fired: 0, log: [], active: [], dyn: null, dynT: -1 }; // next < 0:開局後 25 秒才開始
  const tmp = new THREE.Color();

  // ---- 黑影(簡單的人形,不受光的純黑 → 背光時是剪影,在霧裡淡出) ----
  const figMat = new THREE.MeshBasicMaterial({ color: 0x020202, fog: true });
  const figure = new THREE.Group();
  {
    const add = (g, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(g, figMat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); figure.add(m); };
    add(new THREE.SphereGeometry(0.115, 10, 8), 0, 1.74, 0);
    add(new THREE.CylinderGeometry(0.17, 0.13, 0.62, 10), 0, 1.33, 0);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 6), 0, 1.66, 0);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.72, 6), s * 0.215, 1.22, 0.02, 0, s * 0.07);
      add(new THREE.CylinderGeometry(0.075, 0.055, 0.98, 6), s * 0.09, 0.5, 0);
    }
    figure.visible = false;
    figure.name = 'scare-figure';
    figure.traverse((o) => { o.castShadow = false; o.raycast = () => {}; }); // 子彈穿過
    root.add(figure);
  }
  const fallen = [];
  const tileGeo = new THREE.BoxGeometry(0.64, 0.018, 0.64);

  // ---- 共用:視線與位置 ----
  const solid = (li, c, r) => { const ch = L.charAt(li, c, r); return ch === '#' || ch === 'E' || ch === 'W' || ch === '_'; };
  const sees = (li, x0, z0, x1, z1) => { // 沿線取樣格子:中間有牆就看不到(目標前 0.9m 不檢查,門框/牆角擦邊不算)
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) { const t = i / n; if (d * (1 - t) < 0.9) break; if (solid(li, Math.floor((x0 + (x1 - x0) * t) / 2), Math.floor((z0 + (z1 - z0) * t) / 2))) return false; }
    return true;
  };
  // 目標在牆裡(門洞、燈具)時,改看「往玩家方向 1.2m」的點
  const seesNear = (c, x, z) => { const dx = c.px - x, dz = c.pz - z, l = Math.hypot(dx, dz) || 1; return sees(c.li, c.px, c.pz, x + dx / l * 1.2, z + dz / l * 1.2); };
  const inView = (c, x, z, minDot = 0.55) => { const dx = x - c.px, dz = z - c.pz, l = Math.hypot(dx, dz) || 1; return (dx * c.fx + dz * c.fz) / l > minDot; };

  // ---- 事件 ----
  const E = {
    flicker: { w: 3, cd: 35, ok: (c) => c.fixAhead(4, 15).length > 0, run(c) {
      const list = c.fixAhead(4, 15).sort(() => Math.random() - 0.5).slice(0, 1); // [ghost] 一次只閃一盞(多盞同時閃只留給刻意的演出)
      const burn = Math.random() < 0.25;
      for (const f of list) S.active.push({ type: 'storm', f, t0: c.t, t1: c.t + rand(1.2, 2.6), burn: burn && f === list[0] });
      if (!burn) sfx.scare('metal_scrape', { x: list[0].x, y: list[0].y, z: list[0].z });
      return list[0];
    } },
    blackout: { w: 1, cd: 200, ok: (c) => !c.zNear && c.fixNear(18).length >= 3, run(c) {
      const list = c.fixNear(18);
      const dur = rand(5, 8.5);
      list.forEach((f, i) => S.active.push({ type: 'black', f, t0: c.t, t1: c.t + dur + i * rand(0.25, 0.6) }));
      sfx.scare('lights_off');
      return list[0];
    } },
    door: { w: 2.2, cd: 45, ok: (c) => c.doorNear().length > 0, run(c) {
      const d = c.doorNear()[0];
      d.anim = { t0: c.t, from: d.group.rotation.y, to: d.closed, dur: 0.16, then: { at: c.t + rand(2.5, 5), to: d.open, dur: 1.8 } };
      sfx.door({ x: d.cx, y: d.y + 1.2, z: d.cz }, 'slam');
      const dd = Math.hypot(d.cx - c.px, d.cz - c.pz);
      c.player.addShake?.(Math.max(0, 0.25 - dd * 0.015));
      return d;
    } },
    figure: { w: 1.6, cd: 110, ok: (c) => !c.zNear && !figure.visible && !!c.figSpot(), run(c) {
      const s = c.figSpot();
      figure.position.set(s.x, L.levels[c.li].y, s.z);
      figure.rotation.y = Math.atan2(c.px - s.x, c.pz - s.z);
      figure.visible = true;
      const dur = rand(2.6, 4.2);
      S.active.push({ type: 'figure', t0: c.t, t1: c.t + dur, x: s.x, z: s.z, li: c.li, look: 0 });
      // 它頭上的燈:壞掉的也「剛好」亮起來(背光剪影),它一消失燈就跟著熄
      let best = s.f || null, bd = 30;
      if (!best) for (const f of fixtures) { if (f.li !== c.li || !f.shape || f.prop || f.kind === 'exit') continue; const q = (f.x - s.x) ** 2 + (f.z - s.z) ** 2; if (q < bd) { bd = q; best = f; } }
      if (best) S.active.push({ type: 'reveal', f: best, t0: c.t, t1: c.t + dur + 0.3, state0: best.state });
      return s;
    } },
    fall: { w: 1.4, cd: 60, ok: (c) => !!c.holeAhead(), run(c) {
      const h = c.holeAhead();
      h.usedAt = c.t;
      dropTile(c, h);
      return h;
    } },
    cart: { w: 1.6, cd: 70, ok: (c) => !!c.game?.physics?.ready && !!c.dynAhead(), run(c) {
      const o = c.dynAhead();
      o.getWorldPosition(_v);
      // 從玩家視線的側面推:物體橫越視線
      const sx = -c.fz, sz = c.fx, s = Math.random() < 0.5 ? -1 : 1;
      c.game.physics.impulseAt({ x: _v.x - sx * s * 0.6, y: _v.y + 0.3, z: _v.z - sz * s * 0.6 }, 1.2, rand(2.5, 4.5));
      sfx.scare('metal_scrape', { x: _v.x, y: _v.y + 0.5, z: _v.z });
      return { x: _v.x, z: _v.z };
    } },
    anchor: { w: 2.5, cd: 25, ok: (c) => !!c.anchorNear(), run(c) {
      const a = c.anchorNear();
      a.used++; a.last = c.t;
      runAnchor(c, a);
      return a;
    } },
    ambient: { w: 1.2, cd: 40, ok: () => true, run(c) {
      const z = c.zone, th = z?.theme, opts = [];
      if (c.li < L.levels.length - 1 && L.levels[c.li].id !== '3F') opts.push('footsteps_above', 'footsteps_above');
      opts.push('scream_far');
      if (th === 'nursery' || th === 'peds_ward' || th === 'playroom') opts.push('crying', 'music_box', 'child_laugh');
      if (th === 'chapel' || th === 'dorm') opts.push('crying', 'whisper');
      if (c.dark) opts.push('whisper', 'breath_close');
      if (th === 'corridor' || th === 'ward') opts.push('knock', 'door_slam');
      const k = opts[(Math.random() * opts.length) | 0];
      sfx.scare(k);
      return { kind: k };
    } },
  };
  const KINDS = { ...E, ...REG };

  function runAnchor(c, a) {
    const p = { x: a.x, y: a.y, z: a.z };
    switch (a.kind) {
      case 'phone': if (c.game?.interact?.ringAt) c.game.interact.ringAt(p, 12); else sfx.scare('phone_ring', p); break; // [interact] 讓那支真的電話響(能接);電話忙線就不響,不會只有鈴聲沒有電話
      case 'tv': case 'cctv': sfx.scare('tv_static', p); break;
      case 'monitor_flatline': sfx.scare('flatline', p); sfx.scare('tv_static', p); break;
      case 'incubator': sfx.scare('crying', p); break;
      case 'doll': sfx.scare('child_laugh', p); if (a.obj) S.active.push({ type: 'turn', obj: a.obj, t0: c.t, t1: c.t + 1.4, from: a.obj.rotation.y, to: Math.atan2(c.px - a.x, c.pz - a.z) - (a.obj.parent ? a.obj.parent.rotation.y : 0) }); break;
      case 'cell_door': sfx.scare(Math.random() < 0.5 ? 'bang' : 'knock', p); break;
      case 'morgue_drawer': sfx.scare('metal_scrape', p); break;
      case 'body_sheet': sfx.scare('breath_close', p); break;
      case 'candles': {
        const list = fixtures.filter((f) => f.li === a.li && f.kind === 'candle' && (f.x - a.x) ** 2 + (f.z - a.z) ** 2 < 25);
        for (const f of list) S.active.push({ type: 'black', f, t0: c.t, t1: c.t + rand(8, 14) });
        sfx.scare('whisper', p);
        break;
      }
      default: sfx.scare('whisper', p);
    }
  }
  function dropTile(c, h) {
    let m = fallen.length >= 10 ? fallen.shift() : null;
    if (m) { m.parent?.remove(m); delete m.userData.dynamic; }
    m = new THREE.Mesh(tileGeo, surf('ceil_tile'));
    m.position.set(h.x, h.y - 0.05, h.z);
    m.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
    m.castShadow = true;
    root.add(m);
    fallen.push(m);
    const ph = c.game?.physics;
    if (ph?.ready) { m.userData.dynamic = { mass: 1.6, shape: 'box', friction: 0.8, restitution: 0.15 }; ph.collectDynamic(m); }
    else S.active.push({ type: 'drop', m, t0: c.t, t1: c.t + 3, vy: 0, floor: L.levels[h.li].y + 0.012 });
    const fy = L.levels[h.li].y;
    c.game?.burst?.(_v.set(h.x, h.y - 0.1, h.z), _f.set(0, -1, 0), 'dust', 10, fy);
    S.thud = { at: c.t + Math.sqrt(2 * Math.max(0.1, h.y - fy) / 9.8), x: h.x, y: fy, z: h.z };
  }

  // ---- 每幀:進行中的效果 ----
  function tickActive(c) {
    for (let i = S.active.length - 1; i >= 0; i--) {
      const a = S.active[i], u = (c.t - a.t0) / Math.max(0.001, a.t1 - a.t0);
      if (a.type === 'storm') {
        a.f.ov = u >= 1 ? 1 : Math.random() < 0.45 ? 0.05 : 0.4 + Math.random() * 1.1;
        if (u >= 1) {
          if (a.burn) { // 燒掉:火花 + 玻璃碎裂 + 永久熄滅
            a.f.state = 2; a.f.ov = 1;
            c.game?.burst?.(_v.set(a.f.x, a.f.y - 0.05, a.f.z), _f.set(0, -1, 0), 'spark', 14, L.levels[a.f.li].y);
            sfx.scare('glass', { x: a.f.x, y: a.f.y, z: a.f.z });
          }
          S.active.splice(i, 1);
        }
      } else if (a.type === 'die') { // [ghost] 一盞一盞熄滅(t0 之前不動;熄滅前抽搐一下;t1 之後閃兩下回來)
        if (c.t < a.t0) continue;
        if (!a.started) { a.started = true; a.onStart?.(a); }
        if (c.t < a.t1) a.f.ov = c.t - a.t0 < 0.18 ? (Math.random() < 0.5 ? 0.15 : 1) : 0;
        else if (c.t < a.t1 + 0.5) a.f.ov = Math.random() < 0.45 ? 0.1 : 1;
        else { a.f.ov = 1; S.active.splice(i, 1); }
      } else if (a.type === 'black') {
        const back = c.t > a.t1;
        a.f.ov = back ? (Math.random() < 0.5 ? 0.3 : 1) : Math.max(0, 1 - (c.t - a.t0) * 6);
        if (c.t > a.t1 + 0.6) { a.f.ov = 1; S.active.splice(i, 1); }
      } else if (a.type === 'figure') {
        const d = Math.hypot(a.x - c.px, a.z - c.pz);
        // 盯著它看(準心附近)超過 0.35 秒也會消失
        const dx = a.x - c.px, dz = a.z - c.pz, dl = d || 1;
        if ((dx * c.fx + dz * c.fz) / dl > 0.985) a.look += c.dt;
        if (d < 9.5 || u >= 1 || a.look > 0.35 || c.li !== a.li) {
          figure.visible = false;
          // 消失的瞬間,最近的燈閃一下(讓人懷疑自己看錯)
          let best = null, bd = 1e9;
          for (const f of fixtures) { if (f.li !== a.li || f.state === 2) continue; const q = (f.x - a.x) ** 2 + (f.z - a.z) ** 2; if (q < bd) { bd = q; best = f; } }
          if (best && bd < 64) S.active.push({ type: 'storm', f: best, t0: c.t, t1: c.t + 0.35, burn: false });
          if (Math.random() < 0.35) sfx.scare('whisper');
          S.active.splice(i, 1);
        }
      } else if (a.type === 'reveal') {
        a.f.state = 0; a.f.ov = 1;
        if (u >= 1 || !figure.visible) { a.f.state = a.state0; S.active.splice(i, 1); S.active.push({ type: 'storm', f: a.f, t0: c.t, t1: c.t + 0.4, burn: false }); }
      } else if (a.type === 'turn') {
        const k = Math.min(1, u), e = k * k * (3 - 2 * k);
        a.obj.rotation.y = a.from + (a.to - a.from) * e;
        if (u >= 1) S.active.splice(i, 1);
      } else if (a.type === 'drop') {
        a.vy -= 9.8 * c.dt; a.m.position.y += a.vy * c.dt; a.m.rotation.x *= 0.98;
        if (a.m.position.y <= a.floor) { a.m.position.y = a.floor; a.m.rotation.x = 0; a.m.rotation.z = 0; S.active.splice(i, 1); }
      }
    }
    if (S.thud && c.t >= S.thud.at) { sfx.thud({ x: S.thud.x, y: S.thud.y, z: S.thud.z }, false); S.thud = null; }
    for (const d of doors) {
      const a = d.anim;
      if (!a) continue;
      const k = Math.min(1, (c.t - a.t0) / a.dur), e = a.dur < 0.3 ? k * k : k * k * (3 - 2 * k);
      d.group.rotation.y = a.from + (a.to - a.from) * e;
      if (k >= 1) {
        if (a.then && c.t >= a.then.at) { d.anim = { t0: c.t, from: d.group.rotation.y, to: a.then.to, dur: a.then.dur }; sfx.door({ x: d.cx, y: d.y + 1.2, z: d.cz }, 'creak'); }
        else if (!a.then) d.anim = null;
      }
    }
  }

  // ---- 事件情境:查詢工具(延遲計算,只在要挑事件時才建) ----
  function buildCtx(c) {
      let zNear = false;
      for (const z of c.game?.zombies || []) { if (z.alive && (z.dist ?? 99) < 14) zNear = true; }
      c.zNear = zNear;
      api.lastCtx = c;
      c.K = K; c.L = L; c.root = root; c.doors = doors; c.anchors = anchors; c.fixtures = fixtures; c.active = S.active; c.solid = solid; c.sees = sees;
      c.inView = (x, z, minDot) => inView(c, x, z, minDot); c.seesNear = (x, z) => seesNear(c, x, z);
      c.dark = !fixtures.some((f) => f.li === c.li && f.cur > 0.3 && (f.x - c.px) ** 2 + (f.z - c.pz) ** 2 < 36);
      // 查詢工具(延遲計算,只在需要時跑)
      c.fixAhead = (a, b) => fixtures.filter((f) => f.li === c.li && f.state !== 2 && f.shape && f.cur > 0.2 && !f.prop && f.kind !== 'exit'
        && ((f.x - c.px) ** 2 + (f.z - c.pz) ** 2) > a * a && ((f.x - c.px) ** 2 + (f.z - c.pz) ** 2) < b * b && inView(c, f.x, f.z, 0.5) && sees(c.li, c.px, c.pz, f.x, f.z));
      c.fixNear = (r) => fixtures.filter((f) => f.li === c.li && f.state !== 2 && f.cur > 0.1 && ((f.x - c.px) ** 2 + (f.z - c.pz) ** 2) < r * r);
      c.doorNear = () => doors.filter((d) => d.li === c.li && !d.anim && Math.abs(Math.atan2(Math.sin(d.group.rotation.y - d.closed), Math.cos(d.group.rotation.y - d.closed))) > 0.4 && (() => { const q = Math.hypot(d.cx - c.px, d.cz - c.pz); return q > 3 && q < 14; })() && seesNear(c, d.cx, d.cz))
        .sort((a, b) => (inView(c, b.cx, b.cz, 0.3) ? 1 : 0) - (inView(c, a.cx, a.cz, 0.3) ? 1 : 0));
      c.holeAhead = () => holes.find((h) => h.li === c.li && !(h.usedAt > 0) && (() => { const q = Math.hypot(h.x - c.px, h.z - c.pz); return q > 2.5 && q < 8; })() && inView(c, h.x, h.z, 0.6) && sees(c.li, c.px, c.pz, h.x, h.z));
      c.dynAhead = () => {
        // 可動道具在建構時就固定了,只掃一次
        if (!S.dyn) { S.dyn = []; S.dynT = c.t; root.traverse((o) => { if (o.userData?.dynamic && /wc|wheel|cart|iv|linen|gurney|trolley|chair|stool/i.test(o.userData.kind || o.name)) S.dyn.push(o); }); }
        for (const o of S.dyn) { o.getWorldPosition(_v); const q = Math.hypot(_v.x - c.px, _v.z - c.pz); if (Math.abs(_v.y - L.levels[c.li].y) < 1.5 && q > 4 && q < 12 && inView(c, _v.x, _v.z, 0.6) && sees(c.li, c.px, c.pz, _v.x, _v.z)) return o; }
        return null;
      };
      c.anchorNear = () => anchors.find((a) => a.li === c.li && a.used < 2 && c.t - a.last > 120 && (() => { const q = Math.hypot(a.x - c.px, a.z - c.pz); return q > 2 && q < 8; })() && sees(c.li, c.px, c.pz, a.x, a.z));
      c.figSpot = () => { // 視線方向 12~26m:優先站在某盞天花燈正下方稍後(燈一定會亮 → 背光剪影);沒有燈才找最遠的可走點
        if (c._fig !== undefined) return c._fig;
        const under = fixtures.filter((f) => f.li === c.li && (f.shape === 'tube' || f.shape === 'bulb') && !f.prop && (() => {
          const dx = f.x - c.px, dz = f.z - c.pz, d = Math.hypot(dx, dz);
          return d > 12 && d < 26 && (dx * c.fx + dz * c.fz) / d > 0.93 && L.flagsAt(c.li, Math.floor(f.x / 2), Math.floor(f.z / 2)) & L.F.WALK;
        })() && sees(c.li, c.px, c.pz, f.x, f.z));
        if (under.length) {
          const f = under[(Math.random() * under.length) | 0], d = Math.hypot(f.x - c.px, f.z - c.pz);
          const x = f.x + (f.x - c.px) / d * 0.5, z = f.z + (f.z - c.pz) / d * 0.5;
          if (L.flagsAt(c.li, Math.floor(x / 2), Math.floor(z / 2)) & L.F.WALK) return (c._fig = { x, z, d, f });
        }
        const lit = fixtures.filter((f) => f.li === c.li && f.cur > 0.5 && f.state !== 2 && f.shape);
        let best = null, bs = -1;
        for (const ang of [0, -0.1, 0.1, -0.2, 0.2]) {
          const cs = Math.cos(ang), sn = Math.sin(ang), dx = c.fx * cs - c.fz * sn, dz = c.fx * sn + c.fz * cs;
          for (let d = 2; d < 28; d += 0.5) {
            const x = c.px + dx * d, z = c.pz + dz * d;
            if (solid(c.li, Math.floor(x / 2), Math.floor(z / 2))) break;
            if (d < 12 || !(L.flagsAt(c.li, Math.floor(x / 2), Math.floor(z / 2)) & L.F.WALK)) continue;
            let s = d * 0.02;
            for (const f of lit) { const q = (f.x - x) ** 2 + (f.z - z) ** 2; if (q < 9) s += 1 - q / 9; }
            if (s > bs) { bs = s; best = { x, z, d }; }
          }
        }
        return (c._fig = best);
      };
      return c;
  }
  const F = { t: 0, dt: 0, player: null, game: null, ctx: null }; // 最近一幀(導演呼叫 fire 時用)
  const mk = (t, dt, player, game, ctx) => ({ t, dt, player, game, px: player.pos.x, py: player.pos.y, pz: player.pos.z, li: ctx.li, zone: ctx.zone, mood: ctx.mood, outdoor: ctx.outdoor, fx: ctx.fx, fz: ctx.fz });

  // ---- 主迴圈 ----
  const api = {
    S, figure, KINDS, auto: true, F, doors, anchors, fixtures,
    register(defs) { Object.assign(KINDS, defs); },
    // [ghost] 導演用:立刻嘗試觸發某種事件(檢查 ok;opts.noCheck 略過檢查)。回傳 run() 的結果或 null
    fire(kind, opts = {}) {
      const E2 = KINDS[kind];
      if (!E2 || !F.player || !F.ctx) return null;
      const c = buildCtx(mk(F.t, F.dt, F.player, F.game, F.ctx));
      c.opts = opts;
      let ok = false;
      try { ok = opts.noCheck || E2.ok(c); } catch (e) { console.warn('[events]', kind, e); ok = false; }
      if (!ok) return null;
      let r = null;
      try { r = E2.run(c) ?? true; } catch (e) { console.warn('[events]', kind, e); return null; }
      S.last[kind] = F.t; S.fired++;
      S.log.push(F.t.toFixed(1) + ':' + kind);
      if (S.log.length > 30) S.log.shift();
      return r;
    },
    // 導演用:某種事件現在可不可以觸發(只跑 ok)
    can(kind) {
      const E2 = KINDS[kind];
      if (!E2 || !F.player || !F.ctx) return false;
      try { return !!E2.ok(buildCtx(mk(F.t, F.dt, F.player, F.game, F.ctx))); } catch { return false; }
    },
    update(t, dt, player, game, ctx, force = null) {
      if (!player) return;
      F.t = t; F.dt = dt; F.player = player; F.game = game; F.ctx = ctx;
      const c = mk(t, dt, player, game, ctx);
      tickActive(c);
      if (!api.auto && !force) return; // [ghost] 驚嚇導演接手排程
      if (!game || game.state !== 'playing' || game.shopUIOpen || game.paused) return;
      if (S.next < 0) S.next = t + 25;
      // 附近有殭屍 → 延後(戰鬥中不嚇人;安靜時才累積張力)
      let zClose = false;
      for (const z of game.zombies || []) { if (!z.alive) continue; const d = z.dist ?? 99; if (d < 6) zClose = true; }
      if (zClose && !force) { S.next = Math.max(S.next, t + 6); return; }
      if (t < S.next && !force) return;
      buildCtx(c);
      const zNear = c.zNear;
      const bias = { ...(BIAS[ctx.mood] || {}), ...(BIAS[ctx.zone?.theme] || {}), ...(ctx.outdoor ? BIAS.outdoor : {}) };
      const cand = [];
      let total = 0;
      for (const [k, e] of Object.entries(KINDS)) {
        if (force ? k !== force : t - (S.last[k] ?? -1e9) < e.cd) continue;
        const w = e.w * (bias[k] ?? 1);
        if (w <= 0) continue;
        let ok = false;
        try { ok = e.ok(c); } catch { ok = false; }
        if (!ok) continue;
        cand.push([k, w]); total += w;
      }
      S.next = t + rand(20, 38) + (zNear ? 15 : 0);
      if (!cand.length) { S.next = t + 4; return; }
      let r = Math.random() * total, pick = cand[0][0];
      for (const [k, w] of cand) { if ((r -= w) <= 0) { pick = k; break; } }
      try { KINDS[pick].run(c); } catch (e) { console.warn('[events]', pick, e); }
      S.last[pick] = t; S.fired++;
      S.log.push(t.toFixed(1) + ':' + pick);
      if (S.log.length > 30) S.log.shift();
    },
    // 除錯 / 測試:強制觸發
    trigger(kind, t, player, game, ctx) { const n = S.fired; api.update(t, 1 / 60, player, game, ctx, kind); return S.fired > n ? S.log[S.log.length - 1] : null; },
    reset() {
      for (const a of S.active) { if (a.f) { a.f.ov = 1; if (a.type === 'reveal') a.f.state = a.state0; } if (a.type === 'turn') a.obj.rotation.y = a.from; }
      S.active.length = 0; S.next = -1; S.last = {}; S.fired = 0; S.thud = null;
      figure.visible = false;
      for (const d of doors) { d.anim = null; d.group.rotation.y = d.open; }
      for (const m of fallen) m.parent?.remove(m);
      fallen.length = 0;
      for (const a of anchors) { a.used = 0; a.last = -1e9; }
      for (const h of holes) h.usedAt = 0;
    },
    dispose() {
      api.reset();
      root.remove(figure);
      figure.traverse((o) => o.geometry?.dispose());
      figMat.dispose(); tileGeo.dispose();
    },
  };
  return api;
}
