import { sfx, ghost } from '../audio.js';
import { syllabify } from '../audio/ghost.js';
import { CALLS, PLACE_CALLS, PROP_NAMES, DOOR_NAMES, GHOSTS } from './lines.js';
import { models } from './ghosts.js';

// 來電腳本:玩家接起電話時(互動代理呼叫 game.horror.phoneCall(ctx)),依玩家所在的場景組一通電話:
// 對方說的話和你身邊的東西有關(你背後那扇門、別看窗外、你站的地方發生過什麼),而且說到就會發生(鬼不說謊):
// 門真的自己打開/關上、背後真的站著一個人、腳步真的停在你後面、聲音真的從聽筒跑到你左耳。
// 一局越後面(導演的幕次、這一局接過幾通)越正面;誘集期間(回合進行中)鬼不出現 → 只有總機錄音/舊錄音。
// 台詞全部在 lines.js(CALLS / PLACE_CALLS / PROP_NAMES / DOOR_NAMES)。
//
// ctx(互動代理給的,缺的這裡自己補):{ id, pos, li, player:{x,y,z,yaw}, zone:{id,name,theme}, near:[{kind,name,x,y,z,dist,side}],
//       doors:[{key,x,y,z,state,side,dist}], behind, round, time, ringing, ghost, play }
// 回傳:{ id, who, tag:'電話', played, dur, end, lines:[{at,dur,text,filter,mode,ear}], cues:[{at,kind}], stop() } 或 null
const rand = (a, b) => a + Math.random() * (b - a);
const LINE_RATE = 3.3; // 電話裡的低語速度(和 whisper.js 一樣)
const lineDur = (text) => 0.55 + syllabify(text, LINE_RATE).dur + 0.9;

export function createCalls(h) {
  const game = h.game;
  const S = { used: new Set(), count: 0, ringback: new Map(), live: null };
  // 可推動的道具(和事件共用快取 h._dyn)
  const dynList = () => {
    if (!h._dyn && game.hospital?.group) { h._dyn = []; game.hospital.group.traverse((o) => { if (o.userData?.dynamic && /wc|wheel|cart|iv|linen|gurney|trolley|chair|stool|bin|box/i.test(o.userData.kind || o.name || '')) h._dyn.push(o); }); }
    return h._dyn || [];
  };
  const side = (p, yaw, x, z) => {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1, dot = (dx * fx + dz * fz) / d;
    if (dot < -0.5) return 'behind';
    if (dot > 0.5) return 'front';
    return (fx * dz - fz * dx) > 0 ? 'right' : 'left';
  };
  // ---- 情境(互動代理沒給的自己算) ----
  function scene(ctx) {
    const p = ctx.player || { x: game.player.pos.x, y: game.player.pos.y, z: game.player.pos.z, yaw: game.player.yaw };
    const L = game.world?.layout, li = ctx.li ?? (L ? Math.max(0, L.levelOfY(p.y + 0.3)) : 1);
    const zone = ctx.zone || (game.hospital?.zone ? { id: game.hospital.zone.id, name: game.hospital.zone.name, theme: game.hospital.zone.theme } : null);
    const Dd = game.interact?.doors;
    // 門:互動代理給的 doors(key 對應到互動系統的門 → 才能真的讓它開/關);沒給就自己掃
    let doors = null;
    if (Array.isArray(ctx.doors)) doors = ctx.doors.map((d) => { const w = d.way || Dd?.ways?.get?.(d.key) || null; return { ...d, way: w, style: d.style || w?.style, state: w ? (Dd.allClosed(w) ? 'closed' : 'open') : d.state, side: d.side || side(p, p.yaw, d.x, d.z) }; });
    else if (Dd) {
      doors = [];
      for (const w of Dd.list) {
        if (w.li !== li || w.out) continue;
        const d = Math.hypot(w.cx - p.x, w.cz - p.z);
        if (d > 9) continue;
        doors.push({ key: w.key, x: w.cx, y: w.y, z: w.cz, dist: d, side: side(p, p.yaw, w.cx, w.cz), state: Dd.allClosed(w) ? 'closed' : 'open', style: w.style, way: w, locked: !!w.lock, barred: !!w.bar });
      }
    }
    // 背後的可動道具(物理推得動的;名字用 PROP_NAMES)— 互動代理的 near 只用來補名字,推東西要自己的清單
    const near = [];
    for (const o of dynList()) {
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements, x = e[12], z = e[14], d = Math.hypot(x - p.x, z - p.z);
      if (d > 6 || Math.abs(e[13] - p.y) > 1.6) continue;
      const k = (o.userData.kind || o.name || '').toLowerCase(), key = Object.keys(PROP_NAMES).find((n) => k.includes(n));
      if (key) near.push({ kind: key, name: PROP_NAMES[key], x, y: e[13], z, dist: d, side: side(p, p.yaw, x, z), obj: o });
    }
    const win = (game.hospital?.K?.windowInfo || []).filter((w) => w.li === li && !w.boarded && !w.store).map((w) => ({ w, d: Math.hypot(w.x - p.x, w.z - p.z) })).filter((q) => q.d < 8).sort((a, b) => a.d - b.d)[0]?.w || null;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), bx = p.x - fx * 1.6, bz = p.z - fz * 1.6;
    const behindFree = !!L && (L.flagsAt(li, Math.floor(bx / 2), Math.floor(bz / 2)) & L.F.WALK) !== 0 && game.world.hasLineOfSight?.(p.x, p.y + 1.5, p.z, bx, p.y + 1.5, bz) !== false;
    const lit = (game.hospital?.lights?.fixtures || []).some((f) => f.li === li && f.cur > 0.3 && !f.prop && (f.x - p.x) ** 2 + (f.z - p.z) ** 2 < 49);
    const behindDoors = (doors || []).filter((d) => d.side === 'behind' && d.dist < 7 && !d.locked && !d.barred).sort((a, b) => a.dist - b.dist);
    return {
      p, li, zone, win, behindFree, lit,
      closedBehind: behindDoors.find((d) => d.state === 'closed') || null,
      openBehind: behindDoors.find((d) => d.state !== 'closed') || null,
      propBehind: (near || []).filter((n) => n.side === 'behind' && n.obj && n.dist > 1 && n.dist < 6).sort((a, b) => a.dist - b.dist)[0] || null,
    };
  }
  const okNeed = (n, sc) => !n || ((!n.closedDoorBehind || (sc.closedBehind && !game.net)) && (!n.openDoorBehind || (sc.openBehind && !game.net)) && (!n.window || sc.win) && (!n.propBehind || (sc.propBehind && game.physics?.ready)) && (!n.behindFree || sc.behindFree) && (!n.lit || sc.lit) && (!n.flash || game.player.flashOn) && (!n.seen || !!h.lastSeen?.(n.seen, n.within ?? 300)));
  // ---- 挑一通 ----
  function choose(ctx, sc) {
    const D = h.director, ghostOK = D.silent && D.level !== 'off';
    if (ctx.want) { const c = CALLS.find((q) => q.id === ctx.want) || (PLACE_CALLS[ctx.want] && { ...PLACE_CALLS[ctx.want], id: 'place:' + ctx.want, act: 1 }); if (c && (c.sys || ghostOK) && okNeed(c.need, sc)) return c; } // 測試/劇情指定
    const rb = S.ringback.get(ctx.id);
    if (rb && ghostOK) { S.ringback.delete(ctx.id); const c = CALLS.find((q) => q.id === 'call.ringback'); if (c) return c; }
    const act = Math.min(3, D.act + (S.count >= 3 ? 1 : 0)); // 接過幾通之後,電話比幕次更早變得正面
    const cand = [];
    for (const c of CALLS) {
      if (c.ringbackOnly || (c.once && S.used.has(c.id))) continue;
      if (!c.sys && !ghostOK) continue; // 誘集期間鬼不出現(§1.9):只剩錄音
      if (c.act > act || !okNeed(c.need, sc)) continue;
      let w = (c.w ?? 1) / (1 + 1.2 * (S.used.has(c.id) ? 1 : 0));
      if (c.need) w *= 1.6; // 和場景有關的優先
      if (c.act === act) w *= 1.5; // 這一幕的
      if (c.sys && ghostOK) w *= 0.35;
      cand.push([c, w]);
    }
    // 依地點的來電(這一區第一次)
    const zid = sc.zone?.id, zth = sc.zone?.theme;
    const place = ghostOK && (PLACE_CALLS[zid] || PLACE_CALLS[zth]);
    const pkey = 'place:' + (PLACE_CALLS[zid] ? zid : zth);
    if (place && !S.used.has(pkey)) cand.push([{ ...place, id: pkey, act: 1 }, 2.2]);
    else if (ghostOK && !S.used.has('place:_default') && sc.zone?.name) cand.push([{ ...PLACE_CALLS._default, id: 'place:_default', act: 1 }, 0.6]);
    if (!cand.length) return null;
    let r = Math.random() * cand.reduce((a, q) => a + q[1], 0);
    for (const [c, w] of cand) if ((r -= w) <= 0) return c;
    return cand[0][0];
  }
  // ---- 組腳本 ----
  function build(c, sc) {
    const fill = (t) => t.replace(/\{房名\}/g, sc.zone?.name || '這裡').replace(/\{門\}/g, DOOR_NAMES[sc.closedBehind?.style || sc.openBehind?.style] || '門').replace(/\{物\}/g, sc.propBehind?.name || '東西');
    const lines = [];
    let at = 0.6; // 拿起聽筒之後先停一下(線路雜訊)
    for (const l of c.lines) {
      at += l.gap ?? 0;
      const text = fill(l.text), dur = lineDur(text.replace(/\{暱稱\}/g, '阿孫'));
      const left = l.ear === 'left';
      lines.push({ at: +at.toFixed(2), dur: +dur.toFixed(2), text, filter: left ? null : 'phone', mode: 'syllabic', ear: left ? 'left' : 'right' });
      at += dur - 0.45;
    }
    const cues = (c.cues || []).map((q) => ({ at: +((lines[q.line]?.at ?? 0) + (q.at ?? 0.4)).toFixed(2), kind: q.kind }));
    return { id: c.id, who: c.who, ghost: c.ghost || null, tag: '電話', lines, cues, dur: +(at + 1.2).toFixed(2), end: c.end || 'dead', sys: !!c.sys, ringback: c.ringback || 0, hint: c.hint || null };
  }
  // ---- 演出 ----
  function play(script, sc, ctx, d0 = 0) {
    let stopped = false, cur = null;
    // 一次一個人(src/story/voice.js):這通電話排到聲音佇列最前面,正在講的那一句講完(d0 秒)才開始;排隊中的對話等電話講完
    const V = game.story?.voice, tok = {};
    V?.front?.(tok);
    const done = () => V?.leave?.(tok);
    h.after(d0 + script.dur + 0.3, done);
    const D = h.director;
    const name = script.sys ? null : script.ghost && h.known.has(script.ghost) ? GHOSTS[script.ghost]?.name : null;
    const tag = (f) => (f ? (script.sys ? '電話' : `電話 · ${name || '？？？'}`) : name || '？？？'); // STORY.md §11.1:鬼先是「？？？」
    for (const l of script.lines) h.after(d0 + l.at, () => { if (stopped) return; cur = h.whispers.say(l.text, { filter: l.filter, ear: l.ear, priority: 9, force: true, tag: tag(l.filter) }); });
    for (const q of script.cues) h.after(d0 + q.at, () => { if (!stopped) runCue(q.kind, sc, ctx, script); });
    // 掛斷之後偶爾又打來(第三幕;互動系統的電話)
    if (script.ringback && Math.random() < script.ringback && D.act >= 3 && game.interact?.ringAt) {
      h.after(d0 + script.dur + rand(5, 8), () => { if (stopped) return; S.ringback.set(ctx.id, true); game.interact.ringAt(ctx.pos || sc.p, 14); });
    }
    return () => { stopped = true; cur?.stop?.(); done(); };
  }
  // 腳本裡的驚嚇(都在玩家「背後」或身邊;鬼的部分只在靜默期)
  function runCue(kind, sc, ctx) {
    const D = h.director, A = h.app, p = game.player, ghostOK = D.silent && D.level !== 'off';
    const strong = D.level === 'normal' || D.level === 'high';
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), y = sc.p.y;
    const notify = (k) => D.notify(k, { weight: 0.6 });
    switch (kind) {
      case 'clip': ghost.clip({ x: p.pos.x - fx * 2.2, y: y + 1.1, z: p.pos.z - fz * 2.2 }); break;
      case 'door': { // 背後那扇關著的門,慢慢打開
        const d = sc.closedBehind;
        if (!ghostOK || !d?.way || game.net || !game.interact?.doors) { ghost.knock({ x: d?.x ?? p.pos.x - fx * 3, y: y + 1.2, z: d?.z ?? p.pos.z - fz * 3 }, 2); break; }
        ghost.creakLong({ x: d.x, y: y + 1.2, z: d.z }, 3.6);
        h.creepDoor?.(d.way, p.pos.x, p.pos.z, 3.8);
        notify('doorOpen');
        break;
      }
      case 'doorShut': {
        const d = sc.openBehind, Dd = game.interact?.doors;
        if (!ghostOK || !d?.way || game.net || !Dd) break;
        const w = d.way, busy = Math.hypot(p.pos.x - w.cx, p.pos.z - w.cz) < 1.2 || game.zombies.some((z) => z.alive && Math.hypot(z.pos.x - w.cx, z.pos.z - w.cz) < 1.2);
        if (busy) break;
        Dd.setState(w, 'closed', { fast: true, sound: false, net: false });
        sfx.door({ x: w.cx, y: y + 1.2, z: w.cz }, 'slam');
        notify('doorClose');
        break;
      }
      case 'window': { // 窗外的人(你看過去才看得到)
        const w = sc.win;
        if (!ghostOK || !w || !A || !A.free() || !models.ready('patient')) break;
        const ax = w.axis === 'z', s = ax ? Math.sign(p.pos.z - w.z) || 1 : Math.sign(p.pos.x - w.x) || 1;
        const x = ax ? w.x : w.x - s * 1.0, z = ax ? w.z - s * 1.0 : w.z;
        A.spawn({ tag: 'call.window', fig: 'patient', pose: 'stand', look: 'pale', alpha: 0.8, x, y: (game.world.layout.levels[sc.li]?.y ?? y), z, yaw: Math.atan2(p.pos.x - x, p.pos.z - z), dur: 5, vanish: { flash: true, look: 0.97, lookT: 0.6, near: 2.5 } });
        notify('window');
        break;
      }
      case 'prop': { // 背後的東西被推了一下
        const o = sc.propBehind?.obj;
        if (!ghostOK || !o || !game.physics?.ready) break;
        o.updateWorldMatrix(true, false);
        const e = o.matrixWorld.elements;
        game.physics.impulseAt({ x: e[12] + rand(-0.4, 0.4), y: e[13] + 0.3, z: e[14] + rand(-0.4, 0.4) }, 1, 3);
        sfx.thud({ x: e[12], y: e[13], z: e[14] }, false);
        notify('moveBehind');
        break;
      }
      case 'steps': { // 腳步從遠到近,停在你後面
        if (!ghostOK) break;
        for (let i = 0; i < 5; i++) h.after(i * 0.62, () => { const k = 5.5 - i * 0.95; sfx.remoteStep({ x: p.pos.x - fx * k, y, z: p.pos.z - fz * k }); });
        break;
      }
      case 'breath': if (ghostOK) ghost.breathNeck(0.9); break;
      case 'cold': if (ghostOK) { h.chill(0.6, 7); ghost.gust(0.7); } break;
      case 'knock': ghost.knock({ x: p.pos.x - fx * 2.5, y: y + 1.2, z: p.pos.z - fz * 2.5 }, 3, { metal: sc.zone?.theme === 'morgue' }); break;
      case 'lights': { // 附近的燈熄掉幾秒(數到十就回來)
        const E = h.events;
        if (!ghostOK || !E || D.act < 2) break;
        const t = game.time, F = E.fixtures.filter((f) => f.li === sc.li && f.state !== 2 && !f.prop && f.cur > 0.05 && (f.x - p.pos.x) ** 2 + (f.z - p.pos.z) ** 2 < 100);
        F.forEach((f, i) => E.S.active.push({ type: 'die', f, t0: t + i * 0.12, t1: t + 6 + i * 0.1, onStart: i === 0 ? () => ghost.tubeOff({ x: f.x, y: f.y, z: f.z }) : null }));
        notify('lightsDie');
        break;
      }
      case 'figure': { // 背後站著一個人(看一眼就消失)
        if (!ghostOK || !strong || !A || !A.free() || !models.ready('man') || !sc.behindFree) break;
        const x = p.pos.x - fx * 1.6, z = p.pos.z - fz * 1.6;
        A.spawn({ tag: 'call.figure', fig: Math.random() < 0.5 ? 'man' : 'patient', pose: 'reach', look: 'pale', alpha: 0.9, x, y: (game.world.layout.levels[sc.li]?.y ?? y), z, yaw: Math.atan2(p.pos.x - x, p.pos.z - z), dur: 8, fadeIn: 0.05, face: true,
          vanish: { flash: true, flashT: 0.05, look: 0.6, lookT: 0.12, near: 0 },
          onVanish: (why) => { if (why === 'look' || why === 'flash') { ghost.stinger('hit'); game.player.addShake?.(0.25); h.chill(0.7, 6); } } });
        notify('behind');
        break;
      }
      default: break;
    }
  }
  // ---- 公開 ----
  function phoneCall(ctx = {}) {
    if (h.director.level === 'off' && !ctx.force) return null;
    if (game.net?.pvp) return null;
    const sc = scene(ctx);
    const c = choose(ctx, sc);
    if (!c) return null;
    S.used.add(c.id);
    S.count++;
    const script = build(c, sc);
    let stop = () => {}, d0 = 0;
    if (ctx.play !== false) {
      S.live?.();
      const V = game.story?.voice; d0 = V ? Math.min(6, Math.max(0, (V.until || 0) - (game.time || 0))) : 0; // 別人那一句還沒講完:等它
      stop = play(script, sc, ctx, d0);
      S.live = stop;
      h.ringing = null;
      h.director.notify('call');
      h.emit('phone:answer', { id: ctx.id ?? null, call: script.id });
    }
    return { ...script, dur: script.dur + d0, played: ctx.play !== false, stop: () => { stop(); if (S.live === stop) S.live = null; } };
  }
  return { phoneCall, reset() { S.used.clear(); S.count = 0; S.ringback.clear(); S.live?.(); S.live = null; }, state: S };
}
