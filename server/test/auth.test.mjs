// Google 登入(server/auth.js)的單元測試:真的啟動 server/index.js,token 端點換成本機的假伺服器(GOOGLE_TOKEN_URL),不連 Google。
// 執行:node --test server/test/auth.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = 'test-client.apps.googleusercontent.com', SECRET = 'test-secret';
const b64u = (b) => Buffer.from(b).toString('base64url');
const jwt = (claims) => `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claims))}.${b64u('not-a-real-signature')}`;
const freePort = () => new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

let fake, fakePort, srv, port, base, data;
let claims = null; // 假 token 端點下一次回的 id_token 內容
let lastForm = null, tokenStatus = 200;
const good = (o = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1234567890', name: '測試 阿孫', picture: 'https://lh3.googleusercontent.com/a/test=s96-c', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...o });

async function startServer(env = {}) {
  port = await freePort();
  base = `http://127.0.0.1:${port}`;
  srv = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DIST_DIR: path.join(data, 'nodist'), DATA_DIR: data, GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: SECRET, GOOGLE_TOKEN_URL: `http://127.0.0.1:${fakePort}/token`, AUTH_DEV: '', PUBLIC_URL: '', ...env },
  });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) return; } catch { /* 還沒起來 */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
}
const stopServer = () => new Promise((r) => { if (!srv || srv.exitCode !== null) return r(); srv.once('exit', r); srv.kill(); });
const setCookies = (res) => res.headers.getSetCookie?.() || [];
const cookieVal = (list, name) => { for (const c of list) { const m = new RegExp(`^${name}=([^;]*)`).exec(c); if (m) return decodeURIComponent(m[1]); } return null; };

before(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'hz-auth-'));
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastForm = Object.fromEntries(new URLSearchParams(body));
      if (tokenStatus !== 200) { res.writeHead(tokenStatus, { 'Content-Type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'at', expires_in: 3599, token_type: 'Bearer', scope: 'openid email profile', id_token: jwt(claims || good()) }));
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  fakePort = fake.address().port;
  await startServer();
});
after(async () => { await stopServer(); fake.close(); fs.rmSync(data, { recursive: true, force: true }); });

// 走一次完整流程:/auth/google → (假裝在 Google 同意)→ /auth/google/callback;回傳 callback 的回應與 state/驗證碼
async function flow({ r = null, headers = {}, mutateState = false } = {}) {
  const a = await fetch(base + '/auth/google' + (r ? '?r=' + encodeURIComponent(r) : ''), { redirect: 'manual', headers });
  assert.equal(a.status, 302);
  const loc = new URL(a.headers.get('location'));
  const oa = cookieVal(setCookies(a), 'hz_oa');
  assert.ok(oa, '有 hz_oa cookie');
  const state = loc.searchParams.get('state');
  const cb = await fetch(`${base}/auth/google/callback?code=fake-code&state=${encodeURIComponent(mutateState ? state + 'x' : state)}`, { redirect: 'manual', headers: { ...headers, cookie: 'hz_oa=' + encodeURIComponent(oa) } });
  return { a, loc, oa, cb, sid: cookieVal(setCookies(cb), 'hz_sid'), cbCookies: setCookies(cb) };
}

test('/api/me:設定了 Google → enabled,沒登入', async () => {
  const m = await (await fetch(base + '/api/me')).json();
  assert.equal(m.enabled, true);
  assert.equal(m.user, null);
});

test('/auth/google 302 到 Google,帶 state、PKCE(S256)、scope 與依 Host 組出的 redirect_uri', async () => {
  const a = await fetch(base + '/auth/google', { redirect: 'manual' });
  assert.equal(a.status, 302);
  const loc = new URL(a.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(loc.searchParams.get('client_id'), CLIENT);
  assert.equal(loc.searchParams.get('response_type'), 'code');
  assert.equal(loc.searchParams.get('scope'), 'openid email profile');
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(loc.searchParams.get('redirect_uri'), `${base}/auth/google/callback`);
  assert.ok(loc.searchParams.get('state').length >= 20);
  const c = setCookies(a).find((x) => x.startsWith('hz_oa='));
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Max-Age=600/); assert.doesNotMatch(c, /Secure/);
});

test('完整流程:換 token(帶 client secret 與驗證碼)、建帳號、設 hz_sid、302 回原本的網址', async () => {
  claims = good();
  const { loc, cb, sid, cbCookies } = await flow({ r: '/?room=ABC234' });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/?room=ABC234');
  assert.ok(sid, '有 hz_sid');
  const c = cbCookies.find((x) => x.startsWith('hz_sid='));
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Max-Age=2592000/); assert.match(c, /Path=\//); assert.doesNotMatch(c, /Secure/);
  // 假 token 端點收到的表單
  assert.equal(lastForm.grant_type, 'authorization_code');
  assert.equal(lastForm.code, 'fake-code');
  assert.equal(lastForm.client_id, CLIENT);
  assert.equal(lastForm.client_secret, SECRET);
  assert.equal(lastForm.redirect_uri, `${base}/auth/google/callback`);
  assert.equal(b64u(crypto.createHash('sha256').update(lastForm.code_verifier).digest()), loc.searchParams.get('code_challenge'), 'PKCE 驗證碼對得上 challenge');
  // 登入後
  const me = await (await fetch(base + '/api/me', { headers: { cookie: 'hz_sid=' + sid } })).json();
  assert.equal(me.user.name, '測試 阿孫');
  assert.match(me.user.id, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(me.user.pic, `/api/avatar/${me.user.id}`);
  // 同一個 sub 再登入一次 = 同一個帳號(名字更新)
  claims = good({ name: '改名了' });
  const again = await flow();
  const me2 = await (await fetch(base + '/api/me', { headers: { cookie: 'hz_sid=' + again.sid } })).json();
  assert.equal(me2.user.id, me.user.id);
  assert.equal(me2.user.name, '改名了');
  // 登出:session 失效、cookie 清掉
  const lo = await fetch(base + '/auth/logout', { method: 'POST', headers: { cookie: 'hz_sid=' + sid, origin: base } });
  assert.equal(lo.status, 200);
  assert.match(setCookies(lo).join(';'), /hz_sid=;.*Max-Age=0/);
  const me3 = await (await fetch(base + '/api/me', { headers: { cookie: 'hz_sid=' + sid } })).json();
  assert.equal(me3.user, null);
  // 另一個 session 還在
  const me4 = await (await fetch(base + '/api/me', { headers: { cookie: 'hz_sid=' + again.sid } })).json();
  assert.equal(me4.user.id, me.user.id);
});

test('state 不符 → 不登入', async () => {
  claims = good();
  const { cb, sid } = await flow({ mutateState: true });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/?login=fail');
  assert.equal(sid, null);
});

test('沒有 hz_oa cookie(過期)→ 不登入', async () => {
  const cb = await fetch(`${base}/auth/google/callback?code=x&state=abc`, { redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/?login=fail');
  assert.equal(cookieVal(setCookies(cb), 'hz_sid'), null);
});

test('id_token 的 aud、iss、exp、sub 不對 → 不登入', async () => {
  for (const [why, c] of [['aud', good({ aud: 'someone-else' })], ['iss', good({ iss: 'https://evil.example' })], ['exp', good({ exp: Math.floor(Date.now() / 1000) - 3600 })], ['sub', good({ sub: undefined })]]) {
    claims = c;
    const { cb, sid } = await flow();
    assert.equal(cb.headers.get('location'), '/?login=fail', why);
    assert.equal(sid, null, why);
  }
  claims = good();
});

test('token 端點回錯誤 → 不登入', async () => {
  tokenStatus = 400;
  try { const { cb, sid } = await flow(); assert.equal(cb.headers.get('location'), '/?login=fail'); assert.equal(sid, null); } finally { tokenStatus = 200; }
});

test('使用者在 Google 按取消', async () => {
  const cb = await fetch(`${base}/auth/google/callback?error=access_denied&state=x`, { redirect: 'manual' });
  assert.equal(cb.headers.get('location'), '/?login=cancel');
});

test('只接受站內的回去路徑(防開放式重新導向)', async () => {
  claims = good();
  for (const r of ['https://evil.example/', '//evil.example', '/\\evil', '/x/../../evil']) {
    const { cb } = await flow({ r });
    assert.equal(cb.headers.get('location'), '/', r);
  }
});

// fetch 不讓改 Host:用 node:http 直接送(模擬 Zeabur 的 HTTPS 代理:Host = 網域、x-forwarded-proto = https)
const raw = (p, headers) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, headers }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
  r.on('error', reject); r.end();
});
test('x-forwarded-proto: https → redirect_uri 用 https、cookie 加 Secure', async () => {
  claims = good();
  const h = { 'x-forwarded-proto': 'https', host: 'zombies.example.com' };
  const a = await raw('/auth/google', h);
  assert.equal(a.statusCode, 302);
  const loc = new URL(a.headers.location);
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://zombies.example.com/auth/google/callback');
  const oa = cookieVal(a.headers['set-cookie'], 'hz_oa');
  assert.match(a.headers['set-cookie'].join(';'), /Secure/);
  const cb = await raw(`/auth/google/callback?code=c&state=${encodeURIComponent(loc.searchParams.get('state'))}`, { ...h, cookie: 'hz_oa=' + encodeURIComponent(oa) });
  assert.equal(cb.statusCode, 302);
  assert.equal(lastForm.redirect_uri, 'https://zombies.example.com/auth/google/callback');
  assert.match(cb.headers['set-cookie'].find((x) => x.startsWith('hz_sid=')), /Secure/);
});

test('假登入預設關閉', async () => {
  const r = await fetch(base + '/auth/dev?name=x', { redirect: 'manual' });
  assert.equal(r.status, 404);
});

test('登出要同源(Origin 不對 → 403)', async () => {
  const r = await fetch(base + '/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('PUBLIC_URL 覆蓋 redirect_uri;沒有設定 Google → enabled:false、/auth/google 404;AUTH_DEV=1 才有假登入', async () => {
  await stopServer();
  await startServer({ PUBLIC_URL: 'https://play.example.org/' });
  const a = await fetch(base + '/auth/google', { redirect: 'manual' });
  assert.equal(new URL(a.headers.get('location')).searchParams.get('redirect_uri'), 'https://play.example.org/auth/google/callback');
  assert.match(setCookies(a).join(';'), /Secure/);
  await stopServer();
  await startServer({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', AUTH_DEV: '1' });
  const m = await (await fetch(base + '/api/me')).json();
  assert.equal(m.enabled, false);
  assert.equal((await fetch(base + '/auth/google', { redirect: 'manual' })).status, 404);
  const d = await fetch(base + '/auth/dev?name=' + encodeURIComponent('小美') + '&r=' + encodeURIComponent('/?room=ABC234'), { redirect: 'manual' });
  assert.equal(d.status, 302);
  assert.equal(d.headers.get('location'), '/?room=ABC234');
  const sid = cookieVal(setCookies(d), 'hz_sid');
  const me = await (await fetch(base + '/api/me', { headers: { cookie: 'hz_sid=' + sid } })).json();
  assert.equal(me.user.name, '小美');
  assert.equal(me.user.dev, true);
  // 帳號與 session 寫到 DATA_DIR(節流 1 秒)
  await new Promise((r) => setTimeout(r, 1500));
  const acc = JSON.parse(fs.readFileSync(path.join(data, 'accounts.json'), 'utf8'));
  assert.ok(Object.values(acc.accounts).some((x) => x.name === '小美'));
  const ses = JSON.parse(fs.readFileSync(path.join(data, 'sessions.json'), 'utf8'));
  assert.ok(!JSON.stringify(ses).includes(sid), 'session 檔案只存雜湊');
});
