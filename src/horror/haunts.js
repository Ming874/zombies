// 第三輪靈異事件(註冊進 src/map/hospital/events.js,由驚嚇導演排程;每種 { ok(c), run(c) })。
// 規則同前兩輪:只在靜默期、冷卻 + 疲勞 + 幕次 + 任兩個驚嚇之間 7/12 秒;大跳嚇一幕一個(director.bj)。
// 燈只改 intensity(fixture.ov / ox / oz;發光件跟著 f.cur 一起暗),不碰 light.visible / castShadow,不加減燈。
// 每一個事件都要服務《回神》:結尾交給 story(事件),從 lines.js 的 STORY3 表挑一句話/一筆字/一張線索卡,
// 並記進 h.remember(),之後的電話(need.seen)與台詞可以引用「你剛剛看到她了吧」。
//   一盞燈在晃(其他燈暗下來)/ 背後的燈一盞盞熄,回頭就亮 / 隔簾拉開,床邊站著人,再看就不見 / 空病房的監視器停了 /
//   金水商行的球滾到你腳邊 / 收音機自己轉到 1999/9/21 01:47 的直播 / 螢幕邊緣結霜,霜上有字 / 只在手電筒光束裡看得到的阿嬤 /
//   燈下有人影走過去(病歷板)/ 窗外一口霧氣,手指寫的字 / 有人拍你肩膀 / 叫你名字(回頭就出事)/ 遠處的口哨 / 地上的紅包 / 頭七
//   大場面:走廊一路熄燈(燈回來時有東西不一樣了)/ 轉身時窗外的臉 / 門從裡面被撞開 / 鏡子裡的臉衝出來
import * as THREE from 'three';
import { sfx, ghost } from '../audio.js';
import { WRITINGS, STORY3, LINE_BY_ID } from './lines.js';
import { models } from './ghosts.js';
import { shadowTexture, drawFog, ballTexture, envelopeTexture } from './marks.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const KEEP = new Set(['emergency', 'exit', 'beacon', 'monitor', 'candle', 'fire', 'street', 'nightlight']); // 停電也不熄的(緊急照明、出口燈、螢幕、燭火)
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const nick = () => { try { const n = localStorage.getItem('hz.nick'); return n && n.trim() ? n.trim().slice(0, 12) : '阿孫'; } catch { return '阿孫'; } };
const _q = new THREE.Quaternion();

// 第三輪的網格與畫面效果(材質都在 warmList 裡,主程式暖機時一起預編譯)
export class HauntFx {
  constructor(h, scene) {
    this.h = h; this.touched = new Set(); this.edgeEl = null; this.ballOn = false; this.envOn = false;
    const R = this.root = new THREE.Group(); R.name = 'ghost-haunts'; scene.add(R);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ name: 'ghost-ball', map: tex(ballTexture()), roughness: 0.55, transparent: true }));
    const eg = new THREE.PlaneGeometry(0.17, 0.09); eg.rotateX(-Math.PI / 2);
    this.env = new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ name: 'ghost-envelope', map: tex(envelopeTexture()), roughness: 0.55, transparent: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ name: 'ghost-shadow', color: 0x000000, map: tex(shadowTexture()), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.fogC = document.createElement('canvas'); this.fogC.width = 256; this.fogC.height = 192; drawFog(this.fogC, '', true);
    this.fogT = tex(this.fogC);
    this.fog = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ name: 'ghost-fog', color: 0xdfe8ee, map: this.fogT, transparent: true, opacity: 0, depthWrite: false }));
    for (const m of this.meshes) { m.visible = false; m.raycast = () => {}; R.add(m); }
  }
  get meshes() { return [this.ball, this.env, this.shadow, this.fog]; }
  warmList() { return this.meshes; }
  setFog(text, mirror = true) { drawFog(this.fogC, text, mirror); this.fogT.needsUpdate = true; }
  touch(f) { this.touched.add(f); }
  restore() { for (const f of this.touched) { f.ov = 1; if (f._hx) { f.ox = 0; f.oz = 0; f._hx = false; } } this.touched.clear(); }
  // 螢幕邊緣結霜(DOM,不用 WebGL):side 'left' | 'right';text 是霜上手指寫的字
  edge(side, text) {
    if (typeof document === 'undefined') return;
    if (!this.edgeEl) {
      const el = document.createElement('div'); el.id = 'gh-edge'; el.appendChild(document.createElement('span'));
      const hud = document.getElementById('hud');
      if (hud) hud.parentNode.insertBefore(el, hud); else document.body.appendChild(el);
      this.edgeEl = el;
    }
    const el = this.edgeEl;
    el.dataset.side = side; el.firstChild.textContent = text || '';
    // 重播 CSS 動畫:下一幀再加回 'on'(不用 offsetWidth 強制排版;第一次結霜曾因此卡 0.95 秒)
    el.classList.remove('fast'); el.classList.remove('on'); requestAnimationFrame(() => el.classList.add('on'));
  }
  edgeOut(fast) { const el = this.edgeEl; if (!el) return; el.classList.toggle('fast', !!fast); el.classList.remove('on'); }
  reset() { this.restore(); for (const m of this.meshes) m.visible = false; this.ballOn = false; this.envOn = false; this.edgeOut(true); }
}

export function hauntKinds(h) {
  const game = h.game, A = h.app, M = h.marks, W = h.whispers, X = h.hfx;
  const U = () => h.scareUtil || {};
  const P = () => game.player;
  const lv = (c, li = c.li) => c.L.levels[li].y;
  const walk = (c, x, z, li = c.li) => (c.L.flagsAt(li, Math.floor(x / 2), Math.floor(z / 2)) & c.L.F.WALK) !== 0;
  const solidAt = (c, x, z) => c.solid(c.li, Math.floor(x / 2), Math.floor(z / 2));
  const dist = (c, x, z) => Math.hypot(x - c.px, z - c.pz);
  const viewDot = (c, x, z) => { const dx = x - c.px, dz = z - c.pz, d = Math.hypot(dx, dz) || 1; return (dx * c.fx + dz * c.fz) / d; };
  const fwdOf = () => { const p = P(); return [-Math.sin(p.yaw), -Math.cos(p.yaw)]; };
  const lookDot = (x, z) => { const p = P(), [fx, fz] = fwdOf(), dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz) || 1; return (dx * fx + dz * fz) / d; };
  const earOf = (x, z) => { const p = P(), [fx, fz] = fwdOf(); return (-(x - p.pos.x) * fz + (z - p.pos.z) * fx) > 0 ? 'right' : 'left'; };
  const indoor = (c) => !c.outdoor;
  const free = () => !!A.free();
  const act = () => h.director.act;
  const sp = () => !game.net; // 會改共享世界狀態的(門)只在單人
  const D = () => game.interact?.doors || null;
  const lit = (f) => f.cur > 0.3 && f.state !== 2 && !f.prop && !KEEP.has(f.kind);
  const fpos = (f) => ({ x: f.x, y: f.y, z: f.z });
  // 情境換成玩家「現在」的位置(延遲的步驟用;c.inView/seesNear 綁著舊位置,不要在這上面用)
  const now = (c) => { const p = P(), [fx, fz] = fwdOf(); return { ...c, px: p.pos.x, py: p.pos.y, pz: p.pos.z, fx, fz }; };

  // ---- 劇情回報:從 STORY3[key] 挑第一個「還沒用過、幕次到了」的變體 → 說那句話、交線索卡、記住 ----
  function story(key, o = {}) {
    const list = STORY3[key];
    if (!list) return null;
    const used = h.storyUsed || (h.storyUsed = new Set());
    let v = list.find((s) => (s.act || 1) <= act() && !used.has(s.id));
    if (!v) v = [...list].reverse().find((s) => s.repeat && (s.act || 1) <= act());
    if (!v) return null;
    used.add(v.id);
    let hd = null;
    if (v.line && !o.silent) hd = W.say(v.line, { priority: o.priority ?? 6, force: !!o.force, ear: o.ear, pos: o.pos, tag: o.tag });
    if (v.flag) game.flags?.set?.(v.flag, true);
    h.remember?.(v.id, { event: key, tag: v.mem || null, ghost: v.line ? (LINE_BY_ID[v.line]?.ghost ?? null) : null, card: v.card || null, text: v.text || null, pos: o.pos || null });
    v._hd = hd;
    return v;
  }

  // =================== 幾何查詢 ===================
  function swingPick(c) { // 視線裡 2~8.5m 一盞亮著的燈(吊燈泡優先)
    let best = null, bs = -1;
    for (const f of c.fixtures) {
      if (f.li !== c.li || !lit(f) || f.cur < 0.5 || f.sway || !f.shape) continue;
      const d = dist(c, f.x, f.z);
      if (d < 2 || d > 8.5 || !c.inView(f.x, f.z, 0.35) || !c.sees(c.li, c.px, c.pz, f.x, f.z)) continue;
      const s = (f.shape === 'bulb' ? 2 : 1) - Math.abs(d - 4.5) * 0.1;
      if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  const behindLit = (c, px, pz, fx, fz, ex) => c.fixtures.filter((f) => {
    if (f.li !== c.li || !lit(f) || ex.includes(f)) return false;
    const dx = f.x - px, dz = f.z - pz, d = Math.hypot(dx, dz);
    return d > 2.5 && d < 15 && (dx * fx + dz * fz) / d < -0.25;
  }).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
  const curtPick = (c) => c.anchors.find((a) => a.kind === 'bed_curtain' && a.li === c.li && dist(c, a.x, a.z) > 3 && dist(c, a.x, a.z) < 9 && c.inView(a.x, a.z, 0.55) && c.sees(c.li, c.px, c.pz, a.x, a.z)) || null;
  const monPick = (c) => c.anchors.filter((a) => (a.kind === 'monitor' || a.kind === 'monitor_flatline') && a.li === c.li && dist(c, a.x, a.z) > 4 && dist(c, a.x, a.z) < 22)
    .sort((a, b) => (c.inView(a.x, a.z, 0.5) ? 1 : 0) - (c.inView(b.x, b.z, 0.5) ? 1 : 0))[0] || null; // 最好是看不到的那一間
  const radioPick = (c) => c.anchors.find((a) => a.kind === 'radio' && a.li === c.li && dist(c, a.x, a.z) > 3 && dist(c, a.x, a.z) < 18) || null;
  function ballPath(c) { // 前方 6.5~11m 滾到你腳前 1.2m,整條都要能走、看得到
    for (const ang of [0, 0.22, -0.22, 0.42, -0.42]) {
      const a = Math.atan2(c.fx, c.fz) + ang, dx = Math.sin(a), dz = Math.cos(a);
      for (const d of [11, 9.5, 8, 6.5]) {
        const sx = c.px + dx * d, sz = c.pz + dz * d;
        if (!walk(c, sx, sz) || !c.sees(c.li, c.px, c.pz, sx, sz)) continue;
        let ok = true;
        for (let k = 1.2; k < d; k += 0.6) if (!walk(c, c.px + dx * k, c.pz + dz * k)) { ok = false; break; }
        if (ok) return { sx, sz, dx: -dx, dz: -dz, d: d - 1.2 };
      }
    }
    return null;
  }
  function target207(c) { // 207 在同一層的話,它的中心
    const z = c.L.zones?.find((q) => q.id === 'f2_ward_207');
    if (!z || z.levelIndex !== c.li) return null;
    const [c0, r0, c1, r1] = z.rects[0];
    return { x: c0 + c1 + 1, z: r0 + r1 + 1 };
  }
  function beamSpot(c) { // 手電筒光束邊緣(偏 0.18~0.3 rad)7~10m;偏向 207 那一側
    const T = target207(c), base = Math.atan2(c.fx, c.fz);
    let sides = Math.random() < 0.5 ? [1, -1] : [-1, 1];
    if (T) { const ta = Math.atan2(T.x - c.px, T.z - c.pz), rel = Math.atan2(Math.sin(ta - base), Math.cos(ta - base)); sides = rel >= 0 ? [1, -1] : [-1, 1]; }
    for (const s of sides) for (const off of [0.24, 0.3, 0.18]) for (const d of [10, 8.5, 7]) {
      const a = base + s * off, x = c.px + Math.sin(a) * d, z = c.pz + Math.cos(a) * d;
      if (solidAt(c, x, z) || !walk(c, x, z) || !c.sees(c.li, c.px, c.pz, x, z)) continue;
      return { x, z, T };
    }
    return null;
  }
  function shadowSpot(c) { // 前方 3.5~9m 一盞亮著的燈;影子從燈和你之間橫過去
    for (const f of c.fixtures) {
      if (f.li !== c.li || !lit(f) || f.cur < 0.5 || !f.shape) continue;
      const d = dist(c, f.x, f.z);
      if (d < 3.5 || d > 9 || !c.inView(f.x, f.z, 0.6) || !c.sees(c.li, c.px, c.pz, f.x, f.z)) continue;
      const ux = (f.x - c.px) / d, uz = (f.z - c.pz) / d, qx = c.px + ux * (d - 0.6), qz = c.pz + uz * (d - 0.6), rx = -uz, rz = ux;
      if (!walk(c, qx, qz) || !walk(c, qx + rx * 1.6, qz + rz * 1.6) || !walk(c, qx - rx * 1.6, qz - rz * 1.6)) continue;
      const s = Math.random() < 0.5 ? 1 : -1;
      return { lx: f.x, lz: f.z, qx, qz, ax: qx + rx * 1.6 * s, az: qz + rz * 1.6 * s, bx: qx - rx * 1.6 * s, bz: qz - rz * 1.6 * s };
    }
    return null;
  }
  // 窗:玻璃面在 z = w.z(axis 'z')或 x = w.x;out = 往外的方向(玩家在裡面)
  function winGeom(c, w, px = c.px, pz = c.pz) {
    const ax = w.axis === 'z', s = ax ? Math.sign(w.z - pz) || 1 : Math.sign(w.x - px) || 1;
    const ox = ax ? 0 : s, oz = ax ? s : 0; // 往外
    return { ox, oz, nx: -ox, nz: -oz, ry: ax ? (s > 0 ? Math.PI : 0) : -s * Math.PI / 2 };
  }
  const fogWin = (c) => (c.K.windowInfo || []).find((w) => w.li === c.li && !w.boarded && !w.store && dist(c, w.x, w.z) > 1.6 && dist(c, w.x, w.z) < 6 && viewDot(c, w.x, w.z) > 0.6 && c.seesNear(w.x, w.z)) || null;
  const faceWin = (c) => (c.K.windowInfo || []).find((w) => w.li === c.li && !w.boarded && !w.store && dist(c, w.x, w.z) > 1.0 && dist(c, w.x, w.z) < 3.4 && viewDot(c, w.x, w.z) < 0.1 && c.seesNear(w.x, w.z)) || null;
  function doorPick(c) { // 視線裡 2.5~7.5m 一扇關著、沒人擋著的門(隔離房/病房優先)
    const Dd = D(), u = U();
    if (!Dd || !u.wayOK) return null;
    let best = null, bs = -1;
    for (const w of Dd.list) {
      if (!u.wayOK(w, c) || !Dd.allClosed(w) || u.blocked(w)) continue;
      const d = dist(c, w.cx, w.cz);
      if (d < 2.5 || d > 7.5 || viewDot(c, w.cx, w.cz) < 0.55 || !u.doorSees(c, w)) continue;
      const s = viewDot(c, w.cx, w.cz) + (/cell|ward/.test(w.kind || '') ? 0.5 : 0);
      if (s > bs) { bs = s; best = w; }
    }
    return best;
  }
  const mirrorPick = (c) => c.anchors.find((a) => {
    if (a.kind !== 'mirror' || a.li !== c.li) return false;
    const d = dist(c, a.x, a.z);
    return d > 0.9 && d < 3.2 && c.inView(a.x, a.z, 0.8) && ((c.px - a.x) * a.nx + (c.pz - a.z) * a.nz) / (d || 1) > 0.35;
  }) || null;
  function envSpot(c) { // 前方 3~6m 的地上
    for (const d of [4.5, 3.5, 5.5]) for (const ang of [0, 0.25, -0.25]) {
      const a = Math.atan2(c.fx, c.fz) + ang, x = c.px + Math.sin(a) * d, z = c.pz + Math.cos(a) * d;
      if (walk(c, x, z) && !solidAt(c, x, z) && c.sees(c.li, c.px, c.pz, x, z)) return { x, z };
    }
    return null;
  }
  const corrLike = (c) => c.zone?.theme === 'corridor' || /corridor|tunnel|hall/.test(c.zone?.id || '');
  const outList = (c) => c.fixtures.filter((f) => f.li === c.li && lit(f) && dist(c, f.x, f.z) < 22);
  // 暗掉一段時間(events.js 的 'die':t0 前不動、熄滅前抽一下、t1 之後閃兩下回來)
  const die = (c, f, t0, t1, onStart) => c.active.push({ type: 'die', f, t0, t1, onStart: onStart || null });

  const K = {
    // =================== 燈 ===================
    // 其他燈暗下來,只剩頭上一盞在晃(影子跟著擺);阿嬤：「那盞燈……阿嬤顧了十四個晚上。」
    swingBulb: { ok: (c) => indoor(c) && !!swingPick(c), run(c) {
      const f = swingPick(c), others = c.fixtures.filter((q) => q !== f && q.li === c.li && lit(q) && dist(c, q.x, q.z) < 14);
      const dur = rand(7.5, 9.5), A0 = rand(0.45, 0.6), w = Math.PI * 2 * rand(0.5, 0.62), ph = rand(0, 6.28), ax = Math.random() < 0.5, fp = fpos(f);
      for (const q of others) X.touch(q);
      X.touch(f); f._hx = true;
      ghost.tubeOff(fp);
      h.director.hold(dur + 2);
      let t = 0, lastC = 1;
      h.watch((dt) => {
        t += dt;
        const back = t > dur, k = Math.min(1, t / 0.3);
        for (const q of others) q.ov = back ? (Math.random() < 0.4 ? 0.2 : 1) : 1 - 0.93 * k;
        const amp = A0 * Math.exp(-t * 0.07), ang = t * w + ph, s = Math.sin(ang), cs = Math.cos(ang);
        f.ox = (ax ? s : s * 0.22) * amp; f.oz = (ax ? s * 0.22 : s) * amp;
        if (Math.sign(cs) !== Math.sign(lastC) && !back) ghost.chain(fp, amp / A0);
        lastC = cs;
        if (t > dur + 0.55) { for (const q of others) q.ov = 1; f.ox = f.oz = 0; f._hx = false; return false; }
        return true;
      });
      h.after(2.8, () => story('swing'));
      return f;
    } },
    // 你往前走,背後的燈一盞盞熄;一回頭,全部亮回來。阿嬤:「燈,阿嬤幫你開著。」
    darkFollow: { ok: (c) => indoor(c) && P().speedNorm > 0.3 && behindLit(c, c.px, c.pz, c.fx, c.fz, []).length >= 2, run(c) {
      const offs = [];
      let t = 0, nxt = 0.5;
      h.director.hold(18);
      h.watch((dt) => {
        t += dt;
        const p = P();
        if (game.hospital?.level != null && game.hospital.level !== c.li) { for (const q of offs) q.ov = 1; return false; }
        if (offs.length && offs.some((f) => lookDot(f.x, f.z) > 0.15)) { // 回頭了
          for (const q of offs) q.ov = 1;
          ghost.tubeOff(fpos(offs[0]));
          if (offs.length >= 2) h.after(0.7, () => story('follow'));
          return false;
        }
        if (t >= nxt) {
          nxt = t + rand(0.8, 1.15);
          if (p.speedNorm > 0.15) { const [fx, fz] = fwdOf(); const f = behindLit(c, p.pos.x, p.pos.z, fx, fz, offs)[0]; if (f) { X.touch(f); f.ov = 0; offs.push(f); ghost.tubeOff(fpos(f)); } }
        }
        if (t > 16) { for (const q of offs) q.ov = 1; return false; }
        return true;
      });
      return true;
    } },
    // =================== 看得見的 ===================
    // 隔簾被拉開(吊環聲),床邊站著一個病人;你看過他、轉開,再看:床邊空了。阿嬤：「第七晚，廣播又叫阿嬤下樓……阿嬤沒有去。」
    curtainDraw: { ok: (c) => indoor(c) && free() && models.ready('patient') && !!curtPick(c), run(c) {
      const a0 = curtPick(c), y = lv(c), nx = a0.nx || 0, nz = a0.nz || 0, x = a0.x - nx * 0.35, z = a0.z - nz * 0.35;
      ghost.rings({ x: a0.x, y: y + 2.0, z: a0.z });
      let seen = 0, gone = false;
      const a = A.spawn({ tag: 'curtainDraw', fig: 'patient', pose: pick(['tilt', 'stand']), look: 'pale', alpha: 0.72, x, y, z, yaw: Math.atan2(-nx, -nz), dur: 18, fadeIn: 0.5, vanish: { flash: false, look: 0, near: 2.2 },
        onTick: (q, dt) => { const d = lookDot(x, z); if (d > 0.9) seen += dt; if (seen > 0.35 && d < 0.3 && !gone) { gone = true; q.alpha = 0; A.dismiss(q, 'time', true); } } });
      if (!a) return null;
      let t = 0;
      h.watch((dt) => { // 轉回來看:空了 → 那一句
        t += dt;
        if (gone && lookDot(x, z) > 0.85) { h.after(0.6, () => story('bed', { pos: { x, y: y + 1.2, z } })); return false; }
        return t < 30;
      });
      return a;
    } },
    // 只在手電筒光束裡看得到的阿嬤(站的方向就是 207);光一照久就散,光一移開也不見
    beamFigure: { ok: (c) => indoor(c) && free() && P().flashOn && models.ready('nurse') && (c.dark || !c.fixtures.some((f) => f.li === c.li && f.cur > 0.3 && dist(c, f.x, f.z) < 5)) && !!beamSpot(c), run(c) {
      const S = beamSpot(c), y = lv(c), ear = earOf(S.x, S.z);
      const yaw = S.T ? Math.atan2(S.T.x - S.x, S.T.z - S.z) : Math.atan2(c.px - S.x, c.pz - S.z);
      const c0 = Math.cos(0.32), c1 = Math.cos(0.13);
      let seenT = 0, done = false;
      const a = A.spawn({ tag: 'beamFigure', fig: 'nurse', pose: 'stand', look: 'pale', alpha: 0.85, x: S.x, y, z: S.z, yaw, dur: 12, fadeIn: 0.3, vanish: { flash: false, look: 0, near: 3.2 },
        onTick: (q, dt) => {
          const k = P().flashOn ? Math.max(0, Math.min(1, (q.dot - c0) / (c1 - c0))) : 0;
          q.mat.uniforms.uAlpha.value *= k; // 光束外看不到
          if (k > 0.45) seenT += dt;
          if (done) return;
          if (seenT > 1.0) { done = true; ghost.clip({ x: S.x, y: y + 1.2, z: S.z }); A.dismiss(q, 'time'); }
          else if (seenT > 0.2 && k < 0.04) { done = true; q.alpha = 0; A.dismiss(q, 'time', true); }
        },
        onEnd: () => { if (seenT > 0.2) story('beam', { ear }); } });
      return a;
    } },
    // 燈下有一個人的影子橫過地板(拿著病歷板),沒有人。阿嬤：「十四個晚上……阿嬤都這樣巡房。」
    shadowPass: { ok: (c) => indoor(c) && !X.shadow.visible && !!shadowSpot(c), run(c) {
      const S = shadowSpot(c), m = X.shadow, y = lv(c) + 0.02, T = 1.8;
      m.scale.set(0.85, 1, 2.6); m.visible = true; m.material.opacity = 0;
      ghost.clip({ x: S.qx, y: y + 1.1, z: S.qz });
      let t = 0;
      h.watch((dt) => {
        t += dt;
        const u = Math.min(1, t / T), px = S.ax + (S.bx - S.ax) * u, pz = S.az + (S.bz - S.az) * u;
        let dx = px - S.lx, dz = pz - S.lz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl; // 影子往遠離燈的方向(朝你)拉長
        m.position.set(px + dx * 1.3, y, pz + dz * 1.3); m.rotation.y = Math.atan2(dx, dz);
        m.material.opacity = 0.8 * Math.max(0, Math.min(1, t / 0.25, (T - t) / 0.3));
        if (t >= T) { m.visible = false; return false; }
        return true;
      });
      if (Math.random() < 0.6 || act() >= 2) h.after(2.2, () => story('shadow'));
      return S;
    } },
    // 窗外一口霧氣,手指從外面寫了字(反的):封院時外面的家屬
    windowFog: { ok: (c) => indoor(c) && !X.fog.visible && !!fogWin(c), run(c) {
      const w = fogWin(c), G = winGeom(c, w), y = lv(c) + 1.5, lat = rand(-0.3, 0.3);
      const x = w.x + (w.axis === 'z' ? lat : 0) + G.ox * 0.03, z = w.z + (w.axis === 'z' ? 0 : lat) + G.oz * 0.03, pos = { x, y, z };
      const v = story('fog', { silent: true }), m = X.fog;
      X.setFog('', true);
      m.position.set(x, y, z); m.rotation.set(0, G.ry, 0); m.scale.set(0.95, 0.72, 1); m.visible = true; m.material.opacity = 0;
      ghost.exhale(pos, 0.8);
      let t = 0, wrote = false;
      h.watch((dt) => {
        t += dt;
        if (!wrote && t > 2.2) { wrote = true; if (v?.text) { X.setFog(v.text, true); ghost.squeak(pos); } }
        m.material.opacity = 0.55 * Math.max(0, Math.min(1, t / 1.4, (10 - t) / 3));
        if (t >= 10) { m.visible = false; return false; }
        return true;
      });
      return w;
    } },
    // =================== 有人在 ===================
    // 有人拍你肩膀(鬼月禁忌);阿嬤：「阿嬤說過：七月被拍肩膀，不要轉頭。」
    shoulderTap: { ok: (c) => indoor(c) && !c.zNear && P().speedNorm < 0.5, run(c) {
      const p = P(), side = Math.random() < 0.5 ? 'left' : 'right', sg = side === 'left' ? -1 : 1, [fx, fz] = fwdOf(), rx = -fz, rz = fx;
      const pos = { x: p.pos.x + rx * sg * 0.35 - fx * 0.25, y: p.pos.y + 1.45, z: p.pos.z + rz * sg * 0.35 - fz * 0.25 };
      ghost.bounce(pos, 0.35); ghost.whoosh(pos, 0.45);
      p.addShake?.(0.18); p.yaw -= sg * 0.035; // 被拍的那一側,頭微微轉過去
      ghost.breathNeck(0.7, side);
      h.chill?.(0.3, 5);
      h.after(1.8, () => story('tap', { ear: side }));
      return side;
    } },
    // 背後有人叫你的名字(鬼月禁忌:不要回頭)。不回頭 → 阿嬤稱讚你;回頭 → 燈熄、刺擊、背後的人影
    nameCall: { ok: (c) => indoor(c) && !c.zNear && P().speedNorm < 0.7 && !(W.busy && W.cur?.prio >= 6), run(c) {
      const p = P(), y0 = p.yaw, b = { x: p.pos.x + Math.sin(p.yaw) * 3.5, y: p.pos.y + 1.5, z: p.pos.z + Math.cos(p.yaw) * 3.5 };
      W.say('s3.name.call', { pos: b, priority: 7, force: true });
      let t = 0;
      h.watch((dt) => {
        t += dt;
        if (t > 0.4 && angDiff(P().yaw, y0) > 1.6) { // 回頭了
          const q = P().pos, [fx, fz] = fwdOf(), tt = game.time;
          for (const f of c.fixNear(10)) if (lit(f)) die(c, f, tt, tt + 2.2);
          ghost.stinger('hit', 0.7); P().addShake?.(0.25);
          const x = q.x + fx * 1.6, z = q.z + fz * 1.6;
          if (free() && models.ready('man') && walk(c, x, z)) A.spawn({ tag: 'nameCall', fig: 'man', pose: 'stand', look: 'shade', alpha: 0.9, x, y: lv(c), z, yaw: Math.atan2(q.x - x, q.z - z), dur: 0.6, fadeIn: 0.03, vanish: { flash: false, look: 0, near: 0 } });
          h.after(2.8, () => story('nameBad'));
          return false;
        }
        if (t > 4.5) { story('nameOk'); return false; }
        return true;
      });
      h.director.hold(7);
      return true;
    } },
    // 遠處有人吹口哨;阿嬤：「晚上不要吹口哨……會把他們叫來。」
    whistle: { ok: (c) => indoor(c) && !c.zNear && !(W.busy && W.cur?.prio >= 5), run(c) {
      const a = rand(0, 6.28), pos = { x: c.px + Math.cos(a) * 12, y: lv(c) + 1.6, z: c.pz + Math.sin(a) * 12 };
      ghost.whistle(pos, 3.2);
      h.after(4.2, () => story('whistle'));
      return pos;
    } },
    // =================== 東西 / 裝置 ===================
    // 空病房的生理監視器越跳越慢,然後一直響;阿嬤(病歷板):「又一床……他們給他打了那個藥。」
    flatline: { ok: (c) => !!monPick(c), run(c) {
      const m = monPick(c), pos = { x: m.x, y: (m.y ?? lv(c)) + 0.4, z: m.z };
      const T = ghost.beeps(pos, 7, 0.7, 1.7) || 8;
      h.after(T, () => sfx.scare('flatline', pos));
      h.after(T + 4.2, () => { ghost.clip(pos); story('flat', { pos }); });
      h.director.hold(T + 7);
      return m;
    } },
    // 金水商行的皮球從暗處彈出來,滾到你腳邊;阿嬤：「金水伯拿來的球……你小時候最愛玩。」
    ballRoll: { ok: (c) => indoor(c) && !X.ballOn && !!ballPath(c), run(c) {
      const B = ballPath(c), y = lv(c) + 0.11, m = X.ball, pos = { x: B.sx, y, z: B.sz }, axis = new THREE.Vector3(B.dz, 0, -B.dx).normalize();
      const L = B.d, T = 1.1 + L * 0.42; // 一開始快、越滾越慢
      X.ballOn = true; m.visible = true; m.material.opacity = 1; m.position.set(B.sx, y + 0.55, B.sz);
      let t = 0, ph = 0, vy = 0, yy = 0.55, nb = 0, s0 = 0, unseen = 0;
      ghost.bounce(pos, 0.8);
      h.watch((dt) => {
        t += dt;
        if (ph === 0) { // 先彈兩下
          vy -= 9.8 * dt; yy += vy * dt;
          if (yy <= 0) { yy = 0; if (nb++ < 2) { vy = Math.abs(vy) * 0.45; ghost.bounce(pos, 0.6 - nb * 0.15); } else { ph = 1; t = 0; ghost.roll(pos, T); } }
          m.position.y = y + yy; return true;
        }
        if (ph === 1) { // 滾過來,越滾越慢
          const u = Math.min(1, t / T), s = L * (1 - (1 - u) * (1 - u)), ds = s - s0; s0 = s;
          pos.x = B.sx + B.dx * s; pos.z = B.sz + B.dz * s;
          m.position.set(pos.x, y, pos.z); m.quaternion.premultiply(_q.setFromAxisAngle(axis, ds / 0.11));
          if (u >= 1) { ph = 2; t = 0; h.after(1.2, () => story('ball')); }
          return true;
        }
        const p = P(), d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z); // 停在那裡;你一轉開或碰到,它就不在了
        unseen = lookDot(pos.x, pos.z) < 0.3 ? unseen + dt : 0;
        if (d < 0.55 || (t > 6 && unseen > 1.5) || t > 45 || d > 25) { m.visible = false; X.ballOn = false; return false; }
        return true;
      });
      return B;
    } },
    // 收音機自己轉台,轉到 1999/9/21 01:47 小美在山上的現場直播;直播在地震那一秒中斷
    radio1999: { ok: (c) => !!radioPick(c) && !(W.busy && W.cur?.prio >= 7), run(c) {
      const r = radioPick(c), pos = { x: r.x, y: (r.y ?? lv(c)) + 0.5, z: r.z };
      ghost.tune(pos, 2.4);
      h.after(2.5, () => {
        const v = story('radio', { pos, priority: 8, force: true, tag: '收音機 · 小美（1999）' }), d = v?._hd?.dur ?? 5.5;
        h.after(Math.max(1, d - 0.8), () => { ghost.stinger('sub', 0.6); P().addShake?.(0.12); ghost.tune(pos, 0.6); }); // 地鳴,斷訊
      });
      h.director.hold(12);
      return r;
    } },
    // 地上一個紅包(鬼月禁忌:不要撿);走近看它 → 阿嬤:「紅包莫撿。」;轉開就不見了
    redEnvelope: { ok: (c) => indoor(c) && !X.envOn && !!envSpot(c), run(c) {
      const s = envSpot(c), m = X.env;
      m.position.set(s.x, lv(c) + 0.012, s.z); m.rotation.set(0, rand(0, 6.28), 0); m.visible = true; m.material.opacity = 1; X.envOn = true;
      let t = 0, warned = false, unseen = 0;
      h.watch((dt) => {
        t += dt;
        const p = P(), d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (!warned && d < 3.4 && lookDot(s.x, s.z) > 0.7) { warned = true; story('envelope'); }
        unseen = lookDot(s.x, s.z) < 0.2 ? unseen + dt : 0;
        if ((warned && unseen > 1.2) || unseen > 4 || t > 60 || d > 30) { m.visible = false; X.envOn = false; return false; }
        return true;
      });
      return s;
    } },
    // 螢幕一側結霜,霜上有字(01:47、207、第七天、阿嬤在);轉頭過去,霜就退
    frostEdge: { ok: (c) => !c.zNear && P().speedNorm < 0.6, run() {
      const side = Math.random() < 0.5 ? 'left' : 'right', v = story('frost', { silent: true }), y0 = P().yaw;
      X.edge(side, v?.text || '');
      ghost.breathNeck(0.6, side);
      let t = 0;
      h.watch((dt) => { t += dt; const turned = angDiff(P().yaw, y0) > 0.6; if (turned || t > 6.5) { X.edgeOut(turned); return false; } return true; });
      return side;
    } },
    // 頭七(第 7 次靜默期,index.js 指定):走廊盡頭站著阿嬤;看著她,她才走。「今天是頭七……阿嬤回來看你。」
    touqi: { ok: (c) => indoor(c) && free() && models.ready('nurse') && !!c.figSpot?.(), run(c) {
      const s = c.figSpot(), y = lv(c);
      const a = A.spawn({ tag: 'touqi', fig: 'nurse', pose: 'stand', look: 'pale', alpha: 0.8, x: s.x, y, z: s.z, yaw: Math.atan2(c.px - s.x, c.pz - s.z), dur: 14, fadeIn: 1.2, vanish: { flash: false, look: 0.985, lookT: 1.4, near: 6 },
        onEnd: (why) => { h.touqiWhy = why; game.motion?.beat('touqi-end'); story('touqi', { ear: 'both', force: true }); } }); // why:'look' = 你看著她、她轉身(劇情 src/story/deduce.js 接著播頭七的兩句)
      h.chill?.(0.35, 10);
      if (a) game.motion?.beat('touqi'); // [motion] 她站在那裡的時候:世界慢慢褪色、變冷
      return a;
    } },

    // =================== 大場面:走廊一路熄燈(罕見) ===================
    // 走廊的燈從遠處朝你一盞盞熄(或總開關一聲全暗),只剩手電筒和緊急照明;黑暗裡:光束盡頭的人影 / 跑過去的腳步 / 耳邊的呼吸,
    // 加上阿嬤的一句(劇情);燈閃著回來時,有東西不一樣了:牆上多了字(封院第 7 天、01:47……)或一扇門開了。
    corridorOut: { ok: (c) => indoor(c) && corrLike(c) && P().speedNorm > 0.12 && outList(c).length >= 4, run(c) {
      const list = outList(c), t = game.time, dark = rand(5.5, 7.5), step = 0.3;
      const ahead = list.filter((f) => (f.x - c.px) * c.fx + (f.z - c.pz) * c.fz > 1).sort((a, b) => dist(c, b.x, b.z) - dist(c, a.x, a.z));
      const cascade = ahead.length >= 3 && Math.random() < 0.65;
      const tb = cascade ? t + 0.25 + ahead.length * step : t + 0.15, tr = tb + dark;
      for (const f of list) {
        const i = cascade ? ahead.indexOf(f) : -1;
        die(c, f, i >= 0 ? t + 0.25 + i * step : tb, tr + rand(0, 0.4), i >= 0 ? () => ghost.tubeOff(fpos(f)) : null);
      }
      h.after(tb - t, () => { const p = P().pos; ghost.breaker({ x: p.x, y: p.y + 2.6, z: p.z }); ghost.silence(dark + 1, 0.04); game.motion?.beat('dark', { hold: dark }); }); // [motion] 眼睛適應黑暗
      h.after(tr - t, () => game.motion?.beat('light')); // [motion] 燈回來:刺眼一下
      h.director.hold(tr - t + 5);
      h.after(tb - t + rand(1.2, 1.8), () => darkBeat(c));
      h.after(tb - t + dark * 0.55, () => story('dark'));
      const wrong = Math.random() < 0.6 ? 'write' : 'door';
      h.after(tr - t - 0.6, () => { if (wrong === 'door' && !wrongDoor(c)) wrongWrite(c); });
      h.after(tr - t + 0.7, () => { if (wrong === 'write' && !wrongWrite(c) && !wrongDoor(c)) story('darkDoor', { silent: true }); });
      h.remember?.('corridorOut', { event: 'corridorOut', tag: 'dark' });
      return list.length;
    } },
    // =================== 大跳嚇(一幕一個) ===================
    // 你一轉身,窗外貼著一張臉(玻璃上留下手印);阿嬤：「不要看窗外……那時候不能開窗。」
    windowFace: { ok: (c) => indoor(c) && free() && models.ready('patient') && !!faceWin(c), run(c) {
      const w = faceWin(c);
      let t = 0;
      h.watch((dt) => {
        t += dt;
        if (t > 12 || !free()) return false;
        if (lookDot(w.x, w.z) < 0.75) return true;
        const p = P(), G = winGeom(c, w, p.pos.x, p.pos.z), x = w.x + G.ox * 0.22, z = w.z + G.oz * 0.22, y = lv(c);
        A.spawn({ tag: 'windowFace', fig: 'patient', pose: 'reach', look: 'pale', alpha: 0.95, x, y, z, yaw: Math.atan2(p.pos.x - x, p.pos.z - z), dur: 0.75, fadeIn: 0.03, anyLevel: true, vanish: { flash: false, look: 0, near: 0 } });
        M.hand(w.x + G.ox * 0.03 + (w.axis === 'z' ? rand(-0.2, 0.2) : 0), y + rand(1.35, 1.55), w.z + G.oz * 0.03 + (w.axis === 'z' ? 0 : rand(-0.2, 0.2)), G.nx, G.nz);
        ghost.stinger('hit', 0.8); ghost.squeak({ x: w.x, y: y + 1.5, z: w.z });
        p.addShake?.(0.35); p.kick?.(0.02, 0.02);
        h.after(1.6, () => story('face'));
        return false;
      });
      return w;
    } },
    // 門從裡面被撞開(先敲兩下,停一拍,砰):路開了;阿嬤:「這間……那時候是隔離病房。」
    doorBurst: { ok: (c) => indoor(c) && sp() && !!doorPick(c), run(c) {
      const w = doorPick(c), pos = { x: w.cx, y: w.y + 1.2, z: w.cz }, d = dist(c, w.cx, w.cz) || 1;
      ghost.knock(pos, 2, { g: 0.6 });
      h.after(1.6, () => {
        const Dd = D();
        if (!Dd || U().blocked?.(w)) return;
        const by = { x: w.cx + (w.cx - c.px) / d * 1.5, z: w.cz + (w.cz - c.pz) / d * 1.5 }; // 從門的另一側推開(往你這邊)
        Dd.setState(w, 'open', { by, sound: true, fast: true });
        sfx.scare('bang', pos); ghost.stinger('hit', 0.8); ghost.whoosh(pos, 1);
        P().addShake?.(0.4); P().kick?.(0.025, 0.03); h.chill?.(0.4, 5);
        h.after(2.0, () => story('burst'));
      });
      return w;
    } },
    // 鏡子:先是一口氣、一陣嗡聲,然後一張臉塞滿整面鏡子;接著是阿嬤溫柔的一句「你的眼睛，跟阿嬤一樣。」
    mirrorRush: { ok: (c) => !!mirrorPick(c), run(c) {
      const m = mirrorPick(c), w = m.w || 0.47, hh = m.h || 0.59;
      ghost.breathNeck(0.5); ghost.stinger('swell', 0.55);
      h.after(1.25, () => {
        M.silhouette('face', m.x, m.y + 0.02, m.z, m.nx, m.nz, w * 0.95, hh * 0.98, 0.55);
        ghost.stinger('hit', 0.85); P().addShake?.(0.35); P().kick?.(0.02, 0.02);
        h.after(2.2, () => story('mirror'));
      });
      return m;
    } },
  };

  // ---- 停電裡發生的事 ----
  function darkBeat(c) {
    const p = P(), [fx, fz] = fwdOf(), y = lv(c), opts = [['run'], ['breath']];
    if (p.flashOn && free() && models.ready('patient')) for (const d of [12, 10, 8]) {
      const x = p.pos.x + fx * d, z = p.pos.z + fz * d;
      if (walk(c, x, z) && c.sees(c.li, p.pos.x, p.pos.z, x, z)) { opts.unshift(['fig', x, z]); break; }
    }
    const o = opts[0][0] === 'fig' && (act() >= 3 || Math.random() < 0.5) ? opts[0] : pick(opts);
    if (o[0] === 'fig') { // 光束盡頭的人影
      A.spawn({ tag: 'darkFig', fig: pick(['patient', 'nurse']), pose: 'stand', look: 'shade', alpha: 0.9, x: o[1], y, z: o[2], yaw: Math.atan2(p.pos.x - o[1], p.pos.z - o[2]), dur: 3.2, fadeIn: 0.25, vanish: { flash: false, look: 0.985, lookT: 0.45, near: 4 } });
    } else if (o[0] === 'run') { // 黑暗裡有人從你前面跑過去
      const s = Math.random() < 0.5 ? 1 : -1, bx = p.pos.x + fx * 2.6, bz = p.pos.z + fz * 2.6, wp = { x: bx, y: y + 1, z: bz };
      for (let i = 0; i < 7; i++) h.after(i * 0.16, () => { const u = (i / 6 - 0.5) * 2 * s * 3, q = { x: bx - fz * u, y, z: bz + fx * u }; sfx.remoteStep?.(q, undefined, true); if (i === 3) ghost.whoosh(wp, 0.9); });
    } else ghost.breathNeck(1, pick(['left', 'right']));
  }
  // 燈回來時:牆上多了一筆(STORY3.darkWrite)
  function wrongWrite(c) {
    const n = now(c), wa = U().wallAhead?.(n) || U().wallBeside?.(n, 3.5, 1.6); // 前方的牆;走廊裡面對的是長牆時就寫在旁邊
    if (!wa) return false;
    const v = story('darkWrite', { silent: true });
    const w0 = v && WRITINGS.find((q) => q.id === v.write);
    if (!w0) return false;
    const w = w0.text.includes('{暱稱}') ? { ...w0, text: w0.text.replace(/\{暱稱\}/g, nick()) } : w0;
    h.usedWrit.add(w.id);
    M.write(w, wa.x, wa.y, wa.z, wa.nx, wa.nz, { fadeIn: 0.1 });
    if (Math.random() < 0.5) h.after(1.4, () => { const l = W.pick('cue', { cue: 'dark', round: game.round }); if (l) W.say(l, { priority: 4 }); });
    return true;
  }
  // 燈回來時:附近一扇關著的門已經開了(還在黑的時候悄悄打開;路打開了)
  function wrongDoor(c) {
    const Dd = D(), u = U();
    if (!sp() || !Dd || !u.wayOK) return false;
    const n = now(c);
    let best = null, bd = 1e9;
    for (const w of Dd.list) {
      if (!u.wayOK(w, n) || !Dd.allClosed(w) || u.blocked(w)) continue;
      const d = Math.hypot(w.cx - n.px, w.cz - n.pz);
      if (d > 3 && d < 11 && d < bd) { bd = d; best = w; }
    }
    if (!best) return false;
    Dd.setState(best, 'open', { by: { x: n.px, z: n.pz }, sound: false });
    story('darkDoor', { silent: true });
    return true;
  }

  h.hauntStory = story; // 測試/其他模組用
  return K;
}
