import * as THREE from 'three';
import { sfx, ix as ixs } from '../../audio.js';
import { T, mats } from '../kit.js';
import { noteById } from '../notes.js';
import * as LINES from '../lines.js';
import { MATS } from '../../physics/truth.js';
import { captions } from '../../ui/captions.js';
const DEV_TAG = { phone: '電話', radio: '收音機', pa: '醫院廣播', tv: '電視' }; // 沒有名字的裝置:字幕上寫來源

// 各種互動物件共用的工具(由 place.js 建一個 api 物件傳給每個種類的 build):
//  座標:spot = { li, x, y, z, yaw, nx, nz, zone, mount };物件局部座標 +Z 朝房間內、原點在牆面/地面
//  說話:speak(line, { filter, pos, ear }) → 優先交給 game.horror.whisper(靈異系統,有自己的字幕);沒有就用合成的電話聲 + 自己的字幕
//  獎勵:loot(spec, pos)(錢、彈藥、道具、紙條)、heal、give、note(閱讀器)
const _v = new THREE.Vector3();
const WHO_COLOR = { '醫院廣播': '#b8c2c6', '醫院廣播（2003 年的舊錄音）': '#cbbf9e', '錄音帶': '#d9c48a', '收音機 · 小美': '#9fd0ff', '對講機 · 金水伯': '#ffcf8a', '電話 · 王醫師': '#a9b6be', '阿嬤': '#e6c6c0', '？？？': '#c8b8e8' };
export const dur = (text) => { const s = String(text || ''); const n = s.replace(/[\s()()「」]/g, '').length; return 0.6 + n / 4.5 + (s.match(/[……，。,.?!?!]/g) || []).length * 0.12; };

export function makeApi(game, ix, kit, R) {
  const H = game.hospital, L = game.world.layout;
  const api = {
    game, ix, kit, R, H, L, M: mats(), sfx, ixs, LINES, ui: ix.ui,
    lights: H?.lights || null,
    // 局部 → 世界
    mtx(s, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return T(s.x, s.y, s.z, 0, s.yaw, 0).multiply(T(x, y, z, rx, ry, rz)); },
    wp(s, x = 0, y = 0, z = 0) { _v.set(x, y, z).applyMatrix4(T(s.x, s.y, s.z, 0, s.yaw, 0)); return { x: _v.x, y: _v.y, z: _v.z }; },
    reg(s, x, y, z, o) { return ix.register(api.wp(s, x, y, z), { scope: 'map', face: { x: s.nx || 0, z: s.nz || 0 }, ...o }); }, // face:物件正面朝向(測試/截圖用)
    // 碰撞盒:局部矩形 (x0..x1, z0..z1)、高度 h(轉成世界 AABB;yaw 是 90° 的倍數)
    // pm = 子彈穿透類別(physics/truth.js MATS:wood/metal/heavy/plastic/glass…)
    box(s, x0, z0, x1, z1, h, y0 = 0, pm = 'wood') {
      const a = api.wp(s, x0, 0, z0), b = api.wp(s, x1, 0, z1);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, sx = Math.abs(a.x - b.x), sz = Math.abs(a.z - b.z);
      const bx = game.world.addBox(cx, cz, Math.max(0.05, sx), Math.max(0.05, sz), h, s.y + y0);
      bx.pm = MATS[pm] ? pm : 'wood'; bx.mat = MATS[bx.pm].fx; bx.tag = 'ix';
      return bx;
    },
    lineList(key) { const v = key.split('.').reduce((o, k) => o?.[k], LINES); return Array.isArray(v) ? v : v ? [v] : []; },
    lineById(id) {
      if (!id) return null;
      if (typeof id === 'object') return id;
      for (const v of Object.values(LINES)) {
        if (Array.isArray(v)) { const f = v.find((l) => l?.id === id); if (f) return f; }
        else if (v && typeof v === 'object') for (const w of Object.values(v)) if (Array.isArray(w)) { const f = w.find((l) => l?.id === id); if (f) return f; }
      }
      return null;
    },
    // 字幕(自己的)
    say(who, text, ms, tag, o = {}) { return ix.ui.say({ who, text, ms, tag, color: WHO_COLOR[who], critical: o.critical, speak: o.speak }); },
    // 播一句台詞(可多段):回傳 { dur, stop() };filter 'phone' | 'radio' | 'pa' | 'tv';pos = 從裝置發出(否則在耳邊)
    speak(line, o = {}) {
      if (typeof line === 'string') line = api.lineById(line) || { text: line };
      if (!line) return { dur: 0, stop() {} };
      const parts = (line.parts || [line.text]).filter(Boolean);
      const filter = o.filter || line.filter || 'phone', who = line.who || o.who || '', voice = line.voice || 'woman';
      const hz = game.horror;
      let cancelled = false, total = 0, cur = null, sub = null;
      const stops = [];
      // 一個字幕區、一次一個人(src/ui/captions.js、src/story/voice.js):
      //   這段話(裝置:錄音帶、電話、收音機、電視、廣播)照先來後到排進聲音佇列(劇情的對話優先:先講完那一段),輪到才講,講完才換下一個;
      //   接起來的電話例外:排到最前面(只等正在講的那一句,不插在句子中間;排隊中的對話等電話講完)
//   劇情的句子(critical)一定會講;其他的等太久(20 秒)就整段不講了(不會拿自己的字幕跟別人疊在一起)
//   h.endAt = 這段話講完的遊戲時間(還沒輪到 = Infinity;電話用它決定什麼時候收線)
      const V = game.story?.voice, crit = !!o.critical, key = who || DEV_TAG[filter] || filter, tok = {};
      let joined = false, endAt = Infinity;
      const leave = () => { if (joined) { joined = false; V?.leave?.(tok); } };
      let prevEnd = 0, nextI = 0; // 一段一段依序講(前一段開始講、講完才輪到下一段;被鎖擋住時不會插隊)
      parts.forEach((p, i) => {
        const d = dur(p);
        const at = total;
        total += d + 0.35;
        let waited = 0;
        const run = () => {
          if (cancelled) return;
          if (i !== nextI) { stops.push(ix.after(0.25, run)); return; } // 前一段還沒開始講
          if (i > 0 && (game.time || 0) < prevEnd) { stops.push(ix.after(Math.max(0.05, prevEnd - (game.time || 0)), run)); return; }
          if (V && !o.lockOk && !joined) { joined = true; (filter === 'phone' && V.front ? V.front : V.join)(tok); }
          const retry = () => { if (waited < (crit ? 40 : 20)) { waited += 0.25; stops.push(ix.after(0.25, run)); return true; } return false; };
          if ((V && !o.lockOk && V.busy({ token: tok })) || !captions.can(key, crit)) { if (retry()) return; if (!crit) { h.stop(); return; } }
          let used = false;
          if (hz?.whisper && !o.noHorror) { // 靈異系統的耳語/電話聲(有自己的字幕);回傳 null = 別人還在講 → 等一下再試(不拿自己的字幕疊上去)
            try { const w = hz.whisper(p, { ear: o.ear || line.ear || (filter === 'phone' ? 'right' : 'both'), subtitle: true, filter, priority: 7, pos: o.pos || null, who: key, tag: key, lockOk: true, critical: crit, force: crit || undefined }); if (w) { used = true; cur = w; } } catch { used = false; } // 字幕標籤 = 說話的人(收音機 · 小美、電話 · 王醫師…)
            if (!used && hz?.whispers?.busy && retry()) return;
          }
          if (V && !o.lockOk) V.claim(d, 6, key);
          if (i === 0) endAt = (game.time || 0) + total;
          nextI = i + 1;
          prevEnd = (game.time || 0) + d + 0.35;
          if (!used) {
            cur = ixs.phoneVoice(p, { voice, filter, pos: o.pos || null, gain: o.gain });
            sub = api.say(who, p, (d + 0.4) * 1000, filter, { critical: crit, speak: d });
          }
          if (i === parts.length - 1) stops.push(ix.after(d + 0.35, leave));
        };
        if (at <= 0) run(); else stops.push(ix.after(at, run));
      });
      const h = { dur: total, get endAt() { return endAt; }, stop() { cancelled = true; endAt = Math.min(endAt, game.time || 0); for (const s of stops) s(); try { cur?.stop?.(); cur?.kill?.(); } catch { /* 已結束 */ } sub?.close(); leave(); } };
      if (!hz?.whisper && filter === 'phone' && !o.pos) { sfx.radio(true, 0.18); stops.push(ix.after(total, () => sfx.radio(false))); } // 沒有靈異系統:電話底噪
      return h;
    },
    feed(text, color = '#cfc6b0', icon) { game.ui.feed(text, { color, icon, ms: 5200 }); },
    toast(text, color = '#d9c48a', sub) { game.ui.pickup(text, color, sub ? { sub } : undefined); },
    // 紙條/錄音帶:打開閱讀器,第一次讀到時記錄並發事件(目標系統、檔案櫃用)
    note(id, o = {}) {
      const n = typeof id === 'string' ? noteById(id) : id;
      if (!n) return null;
      const first = !ix.flags.has('note.' + n.id);
      ix.flags.set('note.' + n.id, true);
      if (first) { ix.flags.set('know.note.' + n.id, true); api.feed(`找到〈${n.title}〉`, '#e8d9a8'); ix.emit('note', n); }
      return ix.ui.reader(n, o);
    },
    give(item, n = 1, label) {
      ix.inv.add(item, n);
      api.toast(`${label || ix.inv.name(item)}${n > 1 ? ` ×${n}` : ''}`, '#e8d9a8', '收進口袋');
      sfx.pickupItem();
    },
    heal(n) { const p = game.player, g = Math.min(n, p.maxHp - p.hp); if (g > 0) { p.hp += g; game.ui.setHP(p.hp, p.maxHp); } return g; },
    coins(n, pos) { if (pos && game.coins?.drop) game.coins.drop(pos.x, pos.y, pos.z, n); else { game.player.coins += n; game.ui.setCoins(game.player.coins); game.ui.coinGain?.(n); } },
    ammo() {
      const w = game.weapons, id = w.current, a = w.inv?.[id];
      if (!a) return false;
      const cap = typeof w.stat === 'function' ? Math.round(w.stat(id, 'mag')) : w.def.mag;
      a.reserve += cap;
      game.updateAmmoHud?.();
      api.toast(`彈匣 +${cap}`, '#ffc35a');
      sfx.pickupAmmo();
      return true;
    },
    // 收納類的戰利品:{ item } | { note } | { coins } | { ammo } | { heal } | 'random' | null(空的)
    loot(spec, pos, R2 = R) {
      if (spec === 'random') {
        const r = R2();
        spec = r < 0.34 ? { coins: 4 + ((R2() * 12) | 0) } : r < 0.55 ? { ammo: true } : r < 0.66 ? { heal: 15 } : r < 0.72 ? { scare: true } : null;
      }
      if (!spec) { const l = LINES.MISC?.locker?.empty; api.toast(l ? l[(R2() * l.length) | 0] : '空的。', '#a3a39a'); return false; }
      if (spec.item) api.give(spec.item, spec.n || 1, spec.label);
      if (spec.coins) { api.coins(spec.coins); api.toast(`${spec.coins} 元`, '#f2c84b'); sfx.coin(0); }
      if (spec.ammo) api.ammo();
      if (spec.heal) { const g = api.heal(spec.heal); api.toast(g > 0 ? `+${Math.round(g)} 生命` : '止痛藥（用不到）', '#7dffae'); }
      if (spec.scare) { sfx.scare(R2() < 0.5 ? 'breath_close' : 'whisper', pos); const l = LINES.MISC?.locker?.scare; if (l) api.toast(l[(R2() * l.length) | 0], '#a3a39a'); }
      if (spec.flag) ix.flags.set(spec.flag, true);
      if (spec.note) api.note(spec.note);
      return true;
    },
    // 該區域的燈具
    fixtures(zoneId) { return (api.lights?.fixtures || []).filter((f) => f.zone && f.zone.id === zoneId); },
    calm(r = 10) { for (const z of game.zombies) if (z.alive && (z.dist ?? 99) < r) return false; return true; },
    near(pos, r) { const p = game.player.pos; return Math.abs(p.y - pos.y) < 2.5 && (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < r * r; },
  };
  return api;
}
