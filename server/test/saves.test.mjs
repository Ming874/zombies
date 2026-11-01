// 存檔 API(server/saves.js、store.js)與合作隊伍存檔的測試:啟動 server/index.js(AUTH_DEV=1 假登入),用 ws 模擬兩位玩家。
// 執行:node --test server/test/saves.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
let srv, port, base, data;
const sids = {};

before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'hz-saves-'));
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DIST_DIR: path.join(data, 'nodist'), DATA_DIR: data, AUTH_DEV: '1', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' } });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch { /* 還沒起來 */ } await new Promise((r) => setTimeout(r, 100)); }
  for (const n of ['amei', 'ahan', 'other']) {
    const r = await fetch(`${base}/auth/dev?name=${n}`, { redirect: 'manual' });
    sids[n] = /hz_sid=([^;]+)/.exec(r.headers.getSetCookie().join(';'))[1];
  }
});
after(async () => { await new Promise((r) => { srv.once('exit', r); srv.kill(); }); fs.rmSync(data, { recursive: true, force: true }); });

const api = (who, p, { method = 'GET', body, headers = {} } = {}) => fetch(base + p, {
  method, headers: { ...(who ? { cookie: 'hz_sid=' + sids[who] } : {}), ...(body !== undefined ? { 'content-type': 'application/json', origin: base } : {}), ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});

test('沒登入 → 401', async () => {
  assert.equal((await api(null, '/api/save')).status, 401);
  assert.equal((await api(null, '/api/save/solo', { method: 'PUT', body: { data: {} } })).status, 401);
});

test('單人存檔:PUT / GET / 列表 / DELETE', async () => {
  const save = { v: 1, round: 3, weapons: { pistol: [12, 36] }, text: '封院第 3 天' };
  const r = await api('amei', '/api/save/solo', { method: 'PUT', body: { data: save, meta: { round: 3, day: 3 } } });
  assert.equal(r.status, 200);
  const { t } = await r.json();
  const g = await (await api('amei', '/api/save/solo')).json();
  assert.deepEqual(g.data, save);
  assert.equal(g.t, t);
  assert.deepEqual(g.meta, { round: 3, day: 3 });
  const list = await (await api('amei', '/api/save')).json();
  assert.equal(list.slots.length, 1);
  assert.equal(list.slots[0].slot, 'solo');
  // 別人看不到
  assert.equal((await api('ahan', '/api/save/solo')).status, 404);
  assert.equal((await api('amei', '/api/save/solo', { method: 'DELETE', headers: { origin: base } })).status, 200);
  assert.equal((await api('amei', '/api/save/solo')).status, 404);
});

test('大小上限 128 KB', async () => {
  const ok = 'x'.repeat(127 * 1024);
  assert.equal((await api('amei', '/api/save/solo', { method: 'PUT', body: { data: ok } })).status, 200);
  const big = 'x'.repeat(129 * 1024);
  assert.equal((await api('amei', '/api/save/solo', { method: 'PUT', body: { data: big } })).status, 413);
  assert.equal((await (await api('amei', '/api/save/solo')).json()).data.length, ok.length, '太大的不會蓋掉舊的');
});

test('每個帳號最多 10 份;滿了擠掉最舊的合作裝備,其他的不擠', async () => {
  for (let i = 1; i <= 9; i++) assert.equal((await api('amei', `/api/save/x${i}`, { method: 'PUT', body: { data: i } })).status, 200);
  assert.equal((await api('amei', '/api/save/x10', { method: 'PUT', body: { data: 10 } })).status, 409);
  assert.equal((await api('amei', '/api/save/x9', { method: 'PUT', body: { data: 99 } })).status, 200, '覆蓋既有的不算新的一份');
  await api('amei', '/api/save/x9', { method: 'DELETE', headers: { origin: base } });
  await api('amei', '/api/save/coop:aaaaaaaa:bbbbbbbb', { method: 'PUT', body: { data: 'old' } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await api('amei', '/api/save/coop:aaaaaaaa:cccccccc', { method: 'PUT', body: { data: 'new' } })).status, 200, '擠掉最舊的合作裝備');
  const slots = (await (await api('amei', '/api/save')).json()).slots.map((s) => s.slot);
  assert.equal(slots.length, 10);
  assert.ok(!slots.includes('coop:aaaaaaaa:bbbbbbbb') && slots.includes('coop:aaaaaaaa:cccccccc') && slots.includes('solo'));
});

test('要 JSON、要同源', async () => {
  assert.equal((await api('ahan', '/api/save/solo', { method: 'PUT', body: '{"data":1}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await api('ahan', '/api/save/solo', { method: 'PUT', body: { data: 1 }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await api('ahan', '/api/save/solo', { method: 'PUT', body: 'not json' })).status, 400);
  assert.equal((await api('ahan', '/api/save/..%2Fx', { method: 'PUT', body: { data: 1 } })).status, 400);
});

test('寫檔:節流後原子寫入(沒有留下暫存檔)', async () => {
  await new Promise((r) => setTimeout(r, 1600));
  const dir = path.join(data, 'saves');
  const names = fs.readdirSync(dir);
  assert.ok(names.length >= 1);
  assert.ok(names.every((n) => n.endsWith('.json')), names.join(','));
  for (const n of names) JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
});

// ---------- 合作:WebSocket 帶 cookie → 伺服器知道每條連線的帳號 ----------
function wsClient(who, name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: 'hz_sid=' + sids[who] } });
  const q = [], waiters = [];
  ws.on('message', (d, bin) => { if (bin) return; const m = JSON.parse(d.toString()); const i = waiters.findIndex((w) => w.t === m.t); if (i >= 0) waiters.splice(i, 1)[0].res(m); else q.push(m); });
  const next = (t, ms = 3000) => { const i = q.findIndex((m) => m.t === t); if (i >= 0) return Promise.resolve(q.splice(i, 1)[0]); return new Promise((res, rej) => { const w = { t, res }; waiters.push(w); setTimeout(() => rej(new Error('timeout ' + t)), ms); }); };
  const send = (o) => ws.send(JSON.stringify(o));
  return new Promise((r) => ws.on('open', () => { send({ t: 'hello', v: 2, name }); r({ ws, next, send, drain: () => { q.length = 0; } }); }));
}

test('合作:兩人都登入 → 隊伍存檔(房主寫、成員讀)、各自的裝備、開始時帶 resume', async () => {
  const A = await wsClient('amei', '阿美'), B = await wsClient('ahan', '阿漢');
  await A.next('welcome'); await B.next('welcome');
  A.send({ t: 'create', mode: 'coop', pub: false });
  const ja = await A.next('joined');
  const code = ja.room.code;
  assert.equal(ja.room.players[0].auth, true);
  assert.equal(ja.room.team.ok, false, '一個人還不算隊伍');
  B.send({ t: 'join', code });
  const jb = await B.next('joined');
  assert.equal(jb.room.team.ok, true);
  assert.equal(jb.room.team.save, null);
  assert.equal((await api('amei', `/api/team/${code}`)).status, 404);
  // 只有房主能寫;不在房間的人不能讀
  assert.equal((await api('ahan', `/api/team/${code}`, { method: 'PUT', body: { data: { round: 2 } } })).status, 403);
  assert.equal((await api('other', `/api/team/${code}`)).status, 403);
  A.drain();
  const w = await api('amei', `/api/team/${code}`, { method: 'PUT', body: { data: { round: 4, shared: 'x' }, meta: { round: 4, day: 4 } } });
  assert.equal(w.status, 200);
  const tm = await A.next('team');
  assert.deepEqual(tm.team.save.meta, { round: 4, day: 4 });
  assert.deepEqual((await (await api('ahan', `/api/team/${code}`)).json()).data, { round: 4, shared: 'x' });
  // 裝備:各自的帳號
  assert.equal((await api('amei', `/api/team/${code}/gear`, { method: 'PUT', body: { data: { coins: 100 } } })).status, 200);
  assert.equal((await api('ahan', `/api/team/${code}/gear`, { method: 'PUT', body: { data: { coins: 7 } } })).status, 200);
  assert.equal((await (await api('amei', `/api/team/${code}/gear`)).json()).data.coins, 100);
  assert.equal((await (await api('ahan', `/api/team/${code}/gear`)).json()).data.coins, 7);
  const slots = (await (await api('ahan', '/api/save')).json()).slots.map((s) => s.slot);
  assert.ok(slots.some((s) => /^coop:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(s)), '裝備的 slot = 隊伍 key');
  // 開始:resume 換成伺服器上存檔的時間
  A.send({ t: 'start', data: { resume: 1 } });
  const st = await B.next('start');
  assert.equal(typeof st.data.resume, 'number');
  assert.equal(st.data.resume, tm.team.save.t);
  // 同樣兩個人再組隊(新房間)→ 大廳看得到上次的存檔
  A.send({ t: 'leave' }); B.send({ t: 'leave' });
  A.drain(); B.drain();
  B.send({ t: 'create', mode: 'coop', pub: false });
  const jb2 = await B.next('joined');
  A.send({ t: 'join', code: jb2.room.code });
  const ja2 = await A.next('joined');
  assert.equal(ja2.room.team.ok, true);
  assert.deepEqual(ja2.room.team.save.meta, { round: 4, day: 4 });
  // 沒存檔時 resume 會被拿掉
  B.send({ t: 'leave' }); A.send({ t: 'leave' });
  A.ws.close(); B.ws.close();
});

test('未登入的人在房間裡 → 不是隊伍(不能存)', async () => {
  const A = await wsClient('amei', '阿美');
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'hello', v: 2, name: '路人' }));
  await A.next('welcome');
  A.send({ t: 'create', mode: 'coop', pub: false });
  const ja = await A.next('joined');
  ws.send(JSON.stringify({ t: 'join', code: ja.room.code }));
  const tm = await A.next('team');
  assert.equal(tm.team.ok, false);
  assert.equal((await api('amei', `/api/team/${ja.room.code}`, { method: 'PUT', body: { data: 1 } })).status, 409);
  A.send({ t: 'start', data: { resume: 1 } });
  const st = await A.next('start');
  assert.equal(st.data.resume, undefined);
  A.ws.close(); ws.close();
});
