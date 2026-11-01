// 存檔 API(都要登入;cookie hz_sid):
//   GET    /api/save                 → { slots: [{ slot, t, size, meta }] }
//   GET    /api/save/<slot>          → { slot, t, meta, data }(沒有 → 404)
//   PUT    /api/save/<slot>          本文 { data, meta } → { ok, t }(每份 128 KB、每個帳號 10 份)
//   DELETE /api/save/<slot>
// 合作(隊伍 = 房間裡全部的人都登入,2~4 人;key = 'coop:' + 帳號 id 排序,由伺服器依 WebSocket 連線的帳號算出,用戶端不必知道別人的 id):
//   GET    /api/team/<房間代碼>        隊伍存檔(共用的回合狀態;房間成員才能讀)
//   PUT    /api/team/<房間代碼>        只有房主能寫
//   GET    /api/team/<房間代碼>/gear   自己的裝備(存在自己的帳號下,slot = 隊伍 key)
//   PUT    /api/team/<房間代碼>/gear
import { json, readBody, sameOrigin } from './http.js';
import { accountOf } from './auth.js';
import { listSlots, getSlot, putSlot, delSlot, validSlot, LIMIT } from './store.js';

const BODY_MAX = LIMIT.save + 4096; // 存檔本體 + 摘要

// roomOf(code) → { team: { key, ok }, members: [帳號 id], hostAcct } | null(server/index.js 提供)
export function handleSaves(req, res, p, roomOf, onTeamSaved) {
  const m = /^\/api\/(save|team)(?:\/([^/]+))?(?:\/(gear))?$/.exec(p);
  if (!m) return false;
  const run = async () => {
    const me = accountOf(req);
    if (!me) return json(res, 401, { error: '請先登入' });
    const write = req.method === 'PUT' || req.method === 'DELETE';
    if (write && !sameOrigin(req)) return json(res, 403, { error: 'origin' });
    if (write && req.method === 'PUT' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: '要用 application/json' });
    const body = async () => {
      let raw;
      try { raw = await readBody(req, BODY_MAX); } catch (e) { return json(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? `存檔太大(上限 ${LIMIT.save / 1024} KB)` : '讀取失敗' }), null; }
      let o;
      try { o = JSON.parse(raw.toString('utf8')); } catch { return json(res, 400, { error: '格式錯誤' }), null; }
      if (!o || typeof o !== 'object' || o.data === undefined) return json(res, 400, { error: '缺少 data' }), null;
      return o;
    };
    const put = async (owner, slot) => {
      const o = await body();
      if (!o) return null;
      const r = putSlot(owner, slot, JSON.stringify(o.data), o.meta);
      if (r.error) { json(res, r.code || 400, { error: r.error }); return null; }
      json(res, 200, { ok: true, t: r.t });
      return r;
    };

    if (m[1] === 'save') {
      const slot = m[2] ? decodeURIComponent(m[2]) : null;
      if (m[3]) return json(res, 404, { error: 'Not Found' });
      if (!slot) return req.method === 'GET' ? json(res, 200, { slots: listSlots(me.id) }) : json(res, 405, { error: 'Method Not Allowed' });
      if (!validSlot(slot)) return json(res, 400, { error: '存檔名稱不正確' });
      if (req.method === 'GET') { const s = getSlot(me.id, slot); return s ? json(res, 200, s) : json(res, 404, { error: '沒有存檔' }); }
      if (req.method === 'PUT') return put(me.id, slot);
      if (req.method === 'DELETE') return json(res, 200, { ok: delSlot(me.id, slot) });
      return json(res, 405, { error: 'Method Not Allowed' });
    }
    // ---- 合作 ----
    const code = String(m[2] || '').toUpperCase();
    const room = /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? roomOf(code) : null;
    if (!room) return json(res, 404, { error: '找不到房間' });
    if (!room.members.includes(me.id)) return json(res, 403, { error: '你不在這個房間' });
    const key = room.team.ok ? room.team.key : null;
    if (!key) return json(res, 409, { error: '隊伍的每個人都要登入(2~4 人的合作房間)' });
    if (m[3]) { // 自己的裝備
      if (req.method === 'GET') { const s = getSlot(me.id, key); return s ? json(res, 200, s) : json(res, 404, { error: '沒有存檔' }); }
      if (req.method === 'PUT') return put(me.id, key);
      return json(res, 405, { error: 'Method Not Allowed' });
    }
    if (req.method === 'GET') { const s = getSlot(key, 'state'); return s ? json(res, 200, s) : json(res, 404, { error: '沒有存檔' }); }
    if (req.method === 'PUT') {
      if (room.hostAcct !== me.id) return json(res, 403, { error: '只有房主能存隊伍的進度' });
      const r = await put(key, 'state');
      if (r) onTeamSaved?.(code);
      return;
    }
    return json(res, 405, { error: 'Method Not Allowed' });
  };
  run().catch((e) => { console.error('[saves]', e); if (!res.headersSent) json(res, 500, { error: '伺服器錯誤' }); });
  return true;
}
