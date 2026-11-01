// 帳號、登入 session、存檔:JSON 檔,放在 DATA_DIR(預設 <repo>/data;Zeabur 要掛 Volume 到這個路徑才能保存)。
//   accounts.json         { accounts: { id → { id, sub?, dev?, name, pic, created, seen } }, bySub: { sub → id } }
//   sessions.json         { sessions: { sha256(sid) → { uid, exp, t } } }(cookie 裡是原始的 sid,檔案只存雜湊)
//   saves/<owner>.json    { owner, slots: { slot → { t, meta, data } } };owner = 帳號 id,或隊伍 'coop.<id>.<id>…'
// 寫檔:先寫暫存檔再 rename(不會留下寫一半的檔案);同一個檔案 1 秒內的多次變更合併成一次寫入(節流)。
// 上限:每份存檔 128 KB;每個帳號(或隊伍)最多 10 份(多出來時擠掉最舊的合作裝備,單人存檔不會被擠掉)。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, '..', 'data'));
export const LIMIT = { save: 128 * 1024, slots: 10, name: 40, session: 30 * 24 * 3600 * 1000, cache: 300 };
const DELAY = 1000; // 寫入節流(毫秒)
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;
const SLOT_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$/;
export const validId = (id) => typeof id === 'string' && ID_RE.test(id);
export const validSlot = (s) => typeof s === 'string' && SLOT_RE.test(s);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
const now = () => Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[store]', ...a);

// ---------- 一個 JSON 檔:讀進記憶體、節流 + 原子寫回 ----------
const files = new Set();
class JsonFile {
  constructor(file, def) {
    this.file = file;
    this.def = def;
    this.data = null;
    this.timer = null;
    this.writing = null;
    this.ver = 0; // 每次變更 +1
    this.saved = 0; // 已經寫到檔案的版本(寫的途中又變更 → 寫完再排一次)
    files.add(this);
  }
  load() {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!this.data || typeof this.data !== 'object') throw new Error('not an object');
    } catch (e) {
      if (e.code !== 'ENOENT') log(`讀取失敗,改用空白資料:${path.basename(this.file)}(${e.message})`);
      this.data = this.def();
    }
    return this.data;
  }
  touch() { this.ver++; this.schedule(); }
  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, Math.min(60000, DELAY * 2 ** (this.fails || 0))); // 寫入失敗時退避
    this.timer.unref?.();
  }
  async flush() {
    if (this.writing) return this.writing; // 寫完會檢查版本,有新的變更再排一次
    if (!this.data || this.ver === this.saved) return;
    const ver = this.ver, body = JSON.stringify(this.data);
    this.writing = (async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fsp.writeFile(tmp, body);
      if (this.saved >= ver) { await fsp.rm(tmp, { force: true }).catch(() => {}); return; } // 關機的同步寫入已經寫了更新的版本
      for (let i = 0; ; i++) { // Windows:目標檔被防毒或索引暫時開著時 rename 會 EPERM,稍等重試
        try { await fsp.rename(tmp, this.file); break; } catch (e) {
          if (i >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw e; }
          await new Promise((r) => setTimeout(r, 40 * (i + 1)));
        }
      }
      this.saved = ver;
      this.fails = 0;
    })().catch((e) => { this.fails = Math.min(6, (this.fails || 0) + 1); log('寫入失敗', path.basename(this.file), e.message); }).finally(() => {
      this.writing = null;
      if (this.ver !== this.saved) this.schedule();
    });
    return this.writing;
  }
  flushSync() { // 關機時:同步寫完(不等節流)
    if (!this.data || this.ver === this.saved) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.sync.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
      this.saved = this.ver;
    } catch (e) { log('關機寫入失敗', path.basename(this.file), e.message); }
  }
}
export function flushAll() { for (const f of files) { clearTimeout(f.timer); f.timer = null; f.flushSync(); } }
export async function flushAllAsync() { await Promise.all([...files].map((f) => { clearTimeout(f.timer); f.timer = null; return f.flush(); })); }

// ---------- 帳號 ----------
const A = new JsonFile(path.join(DATA_DIR, 'accounts.json'), () => ({ v: 1, accounts: {}, bySub: {} }));
const cleanName = (s) => Array.from(String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()).slice(0, LIMIT.name).join('');
const cleanPic = (u) => (typeof u === 'string' && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\/[^\s"'<>]{1,1500}$/i.test(u) ? u : null);
function newId(taken) { for (;;) { const id = crypto.randomBytes(9).toString('base64url'); if (!taken[id]) return id; } }

export function account(id) { return validId(id) ? A.load().accounts[id] || null : null; }
// Google:以 sub 為鍵(同一個 Google 帳號永遠是同一個遊戲帳號);名稱與頭像每次登入更新
export function upsertGoogle({ sub, name, picture }) {
  const d = A.load();
  sub = String(sub);
  let id = d.bySub[sub], a = id && d.accounts[id];
  if (!a) {
    id = newId(d.accounts);
    a = d.accounts[id] = { id, sub, name: '', pic: null, created: now(), seen: 0 };
    d.bySub[sub] = id;
  }
  a.name = cleanName(name) || a.name || '倖存者';
  a.pic = cleanPic(picture) || a.pic || null;
  a.seen = now();
  A.touch();
  return a;
}
// 測試用的假登入(AUTH_DEV=1):以名稱為鍵
export function upsertDev(name) {
  const d = A.load();
  const nm = cleanName(name) || 'dev';
  const sub = 'dev:' + nm;
  let id = d.bySub[sub], a = id && d.accounts[id];
  if (!a) { id = newId(d.accounts); a = d.accounts[id] = { id, sub, dev: true, name: nm, pic: null, created: now(), seen: 0 }; d.bySub[sub] = id; }
  a.seen = now();
  A.touch();
  return a;
}
export const publicUser = (a) => (a ? { id: a.id, name: a.name, pic: a.pic ? `/api/avatar/${a.id}` : null, dev: !!a.dev } : null);

// ---------- session ----------
const S = new JsonFile(path.join(DATA_DIR, 'sessions.json'), () => ({ v: 1, sessions: {} }));
export function createSession(uid) {
  const sid = crypto.randomBytes(32).toString('base64url');
  S.load().sessions[sha(sid)] = { uid, exp: now() + LIMIT.session, t: now() };
  S.touch();
  return sid;
}
export function sessionUser(sid) {
  if (typeof sid !== 'string' || sid.length < 20 || sid.length > 100) return null;
  const d = S.load(), k = sha(sid), s = d.sessions[k];
  if (!s) return null;
  if (s.exp < now()) { delete d.sessions[k]; S.touch(); return null; }
  return account(s.uid);
}
export function deleteSession(sid) {
  if (typeof sid !== 'string') return;
  const d = S.load(), k = sha(sid);
  if (d.sessions[k]) { delete d.sessions[k]; S.touch(); }
}
function sweep() {
  const d = S.load(), t = now();
  let n = 0;
  for (const [k, s] of Object.entries(d.sessions)) if (!s || s.exp < t) { delete d.sessions[k]; n++; }
  if (n) S.touch();
}
setInterval(sweep, 3600 * 1000).unref();

// ---------- 存檔 ----------
// owner:帳號 id,或隊伍 key 'coop:<id>:<id>…'(帳號 id 排序後;檔名 'coop.<id>.<id>….json')
const saveFiles = new Map(); // owner → JsonFile(最近用過的留在記憶體)
export function teamKey(ids) {
  const list = [...new Set(ids)].filter(validId).sort();
  return list.length >= 2 && list.length === ids.length ? 'coop:' + list.join(':') : null;
}
const validOwner = (o) => validId(o) || (typeof o === 'string' && /^coop(?::[A-Za-z0-9_-]{6,32}){2,4}$/.test(o));
function saveFile(owner) {
  if (!validOwner(owner)) return null;
  let f = saveFiles.get(owner);
  if (f) { saveFiles.delete(owner); saveFiles.set(owner, f); return f; } // LRU:移到最後
  f = new JsonFile(path.join(DATA_DIR, 'saves', owner.replace(/:/g, '.') + '.json'), () => ({ v: 1, owner, slots: {} }));
  saveFiles.set(owner, f);
  if (saveFiles.size > LIMIT.cache) { // 太多:丟掉最久沒用、已經寫完的
    for (const [k, v] of saveFiles) { if (saveFiles.size <= LIMIT.cache) break; if (!v.timer && !v.writing && v.ver === v.saved) { saveFiles.delete(k); files.delete(v); } }
  }
  return f;
}
export function listSlots(owner) {
  const f = saveFile(owner);
  if (!f) return [];
  return Object.entries(f.load().slots).map(([slot, s]) => ({ slot, t: s.t, size: s.size || 0, meta: s.meta || null })).sort((a, b) => b.t - a.t);
}
export function getSlot(owner, slot) {
  const f = saveFile(owner);
  if (!f || !validSlot(slot)) return null;
  const s = f.load().slots[slot];
  return s ? { slot, t: s.t, meta: s.meta || null, data: s.data } : null;
}
// raw:用戶端送來的 JSON 文字(大小以它計算);回傳 { ok, t } 或 { error, code }
export function putSlot(owner, slot, raw, meta = null) {
  const f = saveFile(owner);
  if (!f || !validSlot(slot)) return { error: '存檔名稱不正確', code: 400 };
  const size = Buffer.byteLength(raw);
  if (size > LIMIT.save) return { error: `存檔太大(${Math.ceil(size / 1024)} KB,上限 ${LIMIT.save / 1024} KB)`, code: 413 };
  let data;
  try { data = JSON.parse(raw); } catch { return { error: '存檔格式錯誤', code: 400 }; }
  const m = meta && typeof meta === 'object' ? JSON.stringify(meta) : null;
  if (m && m.length > 1024) return { error: '存檔摘要太長', code: 400 };
  const d = f.load();
  if (!d.slots[slot] && Object.keys(d.slots).length >= LIMIT.slots) {
    // 滿了:擠掉最舊的合作裝備(coop:*);單人存檔與隊伍存檔不擠
    const old = Object.entries(d.slots).filter(([k]) => k.startsWith('coop:')).sort((a, b) => a[1].t - b[1].t)[0];
    if (!old) return { error: `存檔數量已達上限(${LIMIT.slots} 份)`, code: 409 };
    delete d.slots[old[0]];
  }
  const t = now();
  d.slots[slot] = { t, size, meta: m ? JSON.parse(m) : null, data };
  f.touch();
  return { ok: true, t };
}
export function delSlot(owner, slot) {
  const f = saveFile(owner);
  if (!f || !validSlot(slot)) return false;
  const d = f.load();
  if (!d.slots[slot]) return false;
  delete d.slots[slot];
  f.touch();
  return true;
}
// 隊伍存檔的摘要(大廳提示用;沒有就 null)
export function teamInfo(key) {
  if (!key) return null;
  const s = getSlot(key, 'state');
  return s ? { t: s.t, meta: s.meta } : null;
}
