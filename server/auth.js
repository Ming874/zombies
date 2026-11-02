// Google 登入:伺服器端 OAuth 2.0 授權碼流程(重新導向,不用 GSI 按鈕/彈出視窗/iframe ——
// 頁面開了 COOP same-origin + COEP require-corp,那些方式會被瀏覽器擋掉)。
//   GET  /auth/google            產生 state(短期 cookie)與 PKCE 驗證碼 → 302 到 Google 的同意畫面(scope:openid email profile)
//   GET  /auth/google/callback   檢查 state → 用 code + client secret + 驗證碼向 Google 換 token(Node 內建 fetch)
//                                → 解 id_token(伺服器之間透過 TLS 直接拿到的:檢查 iss、aud、exp,不驗簽章)
//                                → 建帳號(以 Google 的 sub 為鍵)與 session → cookie hz_sid(HttpOnly、SameSite=Lax、HTTPS 加 Secure、30 天)→ 302 回 /
//   POST /auth/logout            登出(刪 session、清 cookie)
//   GET  /api/me                 { enabled, required, dev, user }(沒有設定 GOOGLE_CLIENT_ID / SECRET 時 enabled:false,前端隱藏登入按鈕)
//                                required:要登入才能玩(有設定 Google 登入時預設開;REQUIRE_LOGIN=0 關掉,訪客也能玩)
//   GET  /api/avatar/<id>        頭像(代為抓取 Google 的頭像網址,同源回應:COEP 下跨來源圖片會被擋)
//   GET  /auth/dev?name=xxx      測試用的假登入:只有 AUTH_DEV=1 時才開(預設關閉,正式環境不要設)
// 重新導向 URI = <協定>://<Host>/auth/google/callback(協定看 x-forwarded-proto);PUBLIC_URL 可以覆蓋前半段。
// GOOGLE_TOKEN_URL 只給測試用(假的 token 端點)。
import crypto from 'node:crypto';
import { json, plain, redirect, cookies, cookie, originOf, isHttps, sameOrigin, ISOLATION } from './http.js';
import { upsertGoogle, upsertDev, createSession, sessionUser, deleteSession, account, publicUser, LIMIT } from './store.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const ISS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SID = 'hz_sid', OA = 'hz_oa';
const cfg = () => ({
  id: process.env.GOOGLE_CLIENT_ID || '',
  secret: process.env.GOOGLE_CLIENT_SECRET || '',
  token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  dev: process.env.AUTH_DEV === '1',
});
export const googleEnabled = () => { const c = cfg(); return !!(c.id && c.secret); };
export const loginRequired = () => googleEnabled() && process.env.REQUIRE_LOGIN !== '0';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[auth]', ...a);
// 登入後回到哪裡:只接受站內路徑(「/」或「/?room=ABC123」之類),防開放式重新導向
const safeReturn = (r) => (typeof r === 'string' && r.length < 200 && /^\/(?:\?[A-Za-z0-9=&_.%-]*)?$/.test(r) ? r : '/');
const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 這個請求是哪個帳號(沒有登入 → null)
export function accountOf(req) { return sessionUser(cookies(req)[SID]); }
function sessionCookie(req, sid) { return cookie(SID, sid, { maxAge: LIMIT.session / 1000, secure: isHttps(req) }); }
const clearSid = (req) => cookie(SID, '', { maxAge: 0, secure: isHttps(req) });

// 解 JWT 的 payload(不驗簽章:token 是伺服器直接向 Google 的 token 端點透過 TLS 拿到的)
export function decodeJwt(t) {
  if (typeof t !== 'string' || t.length > 8192) return null;
  const p = t.split('.');
  if (p.length !== 3) return null;
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')); } catch { return null; }
}
export function checkIdToken(c, clientId, nowS = Date.now() / 1000) {
  if (!c || typeof c !== 'object') return '無法解讀 id_token';
  if (!ISS.has(c.iss)) return 'iss 不正確';
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(clientId)) return 'aud 不正確';
  if (Array.isArray(c.aud) && c.aud.length > 1 && c.azp !== clientId) return 'azp 不正確';
  if (!Number.isFinite(c.exp) || c.exp < nowS - 30) return 'id_token 已過期';
  if (Number.isFinite(c.iat) && c.iat > nowS + 300) return 'iat 在未來';
  if (typeof c.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(c.sub)) return '沒有 sub';
  return null;
}

// ---------- 路由:處理了回傳 true ----------
export function handleAuth(req, res, p, q) {
  if (p === '/api/me') {
    if (req.method !== 'GET') return plain(res, 405, 'Method Not Allowed'), true;
    const a = accountOf(req), on = googleEnabled();
    const out = on ? { enabled: true, required: loginRequired(), dev: cfg().dev, user: publicUser(a) } : { enabled: false, ...(cfg().dev ? { dev: true } : {}), ...(a ? { user: publicUser(a) } : {}) };
    json(res, 200, out);
    return true;
  }
  if (p === '/auth/google') { start(req, res, q); return true; }
  if (p === '/auth/google/callback') { callback(req, res, q).catch((e) => { log('callback 錯誤', e.message); if (!res.headersSent) redirect(res, '/?login=fail'); }); return true; }
  if (p === '/auth/logout') {
    if (req.method !== 'POST') return plain(res, 405, 'Method Not Allowed', { Allow: 'POST' }), true;
    if (!sameOrigin(req)) return json(res, 403, { error: 'origin' }), true;
    deleteSession(cookies(req)[SID]);
    res.writeHead(200, { ...ISOLATION, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': [clearSid(req)] });
    res.end('{"ok":true}');
    return true;
  }
  if (p === '/auth/dev') {
    if (!cfg().dev) return plain(res, 404, 'Not Found'), true; // 預設關閉
    const a = upsertDev(q.get('name') || 'dev');
    const sid = createSession(a.id);
    log(`假登入 ${a.name}(${a.id})`);
    redirect(res, safeReturn(q.get('r')), [sessionCookie(req, sid)]);
    return true;
  }
  if (p.startsWith('/api/avatar/')) { avatar(req, res, p.slice(12)).catch(() => { if (!res.headersSent) plain(res, 502, 'Bad Gateway'); }); return true; }
  return false;
}

function start(req, res, q) {
  const c = cfg();
  if (!googleEnabled()) return plain(res, 404, '沒有設定 Google 登入(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  const state = b64u(crypto.randomBytes(18));
  const verifier = b64u(crypto.randomBytes(32)); // PKCE:43 字元
  const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
  const back = safeReturn(q.get('r'));
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_id: c.id, redirect_uri: `${originOf(req)}/auth/google/callback`, response_type: 'code', scope: 'openid email profile',
    state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'online', prompt: 'select_account',
  }).toString();
  // state + 驗證碼 + 回去的路徑放在短期 cookie(10 分鐘;只送到 /auth)
  redirect(res, u.toString(), [cookie(OA, `${state}.${verifier}.${b64u(back)}`, { maxAge: 600, path: '/auth', secure: isHttps(req) })]);
}

async function callback(req, res, q) {
  const c = cfg();
  const clear = cookie(OA, '', { maxAge: 0, path: '/auth', secure: isHttps(req) });
  const fail = (why) => { log('登入失敗:', why); redirect(res, '/?login=fail', [clear]); };
  if (!googleEnabled()) return plain(res, 404, 'Not Found');
  if (q.get('error')) { redirect(res, q.get('error') === 'access_denied' ? '/?login=cancel' : '/?login=fail', [clear]); return; }
  const [state, verifier, back64] = String(cookies(req)[OA] || '').split('.');
  const code = q.get('code');
  if (!state || !verifier || !eq(state, q.get('state') || '')) return fail('state 不符(cookie 過期或被竄改)');
  if (!code || code.length > 2048) return fail('沒有 code');
  let back = '/';
  try { back = safeReturn(Buffer.from(back64 || '', 'base64url').toString('utf8')); } catch { /* 預設回首頁 */ }
  let tok;
  try {
    const r = await fetch(c.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: `${originOf(req)}/auth/google/callback`, grant_type: 'authorization_code', code_verifier: verifier }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    tok = await r.json().catch(() => null);
    if (!r.ok || !tok) return fail(`token 端點回應 ${r.status} ${tok?.error || ''}`);
  } catch (e) { return fail('連不到 token 端點:' + e.message); }
  const claims = decodeJwt(tok.id_token);
  const bad = checkIdToken(claims, c.id);
  if (bad) return fail(bad);
  const a = upsertGoogle({ sub: claims.sub, name: claims.name || claims.given_name || (claims.email || '').split('@')[0], picture: claims.picture });
  const sid = createSession(a.id);
  log(`登入 ${a.name}(${a.id})`);
  redirect(res, back, [clear, sessionCookie(req, sid)]);
}

// ---------- 頭像:代抓 Google 的圖片(只接受 *.googleusercontent.com),記憶體快取一天 ----------
const pics = new Map(); // id → { t, type, buf, url }
async function avatar(req, res, id) {
  const a = account(id);
  if (!a?.pic) return plain(res, 404, 'Not Found');
  let e = pics.get(id);
  if (!e || e.url !== a.pic || Date.now() - e.t > 86400e3) {
    const r = await fetch(a.pic, { signal: AbortSignal.timeout(6000), redirect: 'error' });
    const type = String(r.headers.get('content-type') || '');
    if (!r.ok || !/^image\/(png|jpeg|webp|gif)/.test(type)) return plain(res, 502, 'Bad Gateway');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 256 * 1024) return plain(res, 502, 'Bad Gateway');
    e = { t: Date.now(), type, buf, url: a.pic };
    pics.set(id, e);
    if (pics.size > 500) pics.delete(pics.keys().next().value);
  }
  res.writeHead(200, { ...ISOLATION, 'Content-Type': e.type, 'Content-Length': e.buf.length, 'Cache-Control': 'private, max-age=86400' });
  res.end(req.method === 'HEAD' ? undefined : e.buf);
}
