// HTTP 小工具(server/index.js、auth.js、saves.js 共用):跨來源隔離標頭、JSON/純文字回應、cookie、請求本文。
// 所有回應都帶跨來源隔離標頭(頁面用 SharedArrayBuffer:COOP same-origin + COEP require-corp)。
export const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function plain(res, code, text, extra = {}) {
  res.writeHead(code, { ...ISOLATION, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(text);
}
export function json(res, code, obj, extra = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...ISOLATION, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
// 302 重新導向(Set-Cookie 可以是陣列)
export function redirect(res, to, cookies = []) {
  const h = { ...ISOLATION, Location: to, 'Cache-Control': 'no-store' };
  if (cookies.length) h['Set-Cookie'] = cookies;
  res.writeHead(302, h);
  res.end();
}

// ---------- cookie ----------
export function cookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (typeof h !== 'string' || h.length > 8192) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    let v = part.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
// opts:{ maxAge(秒;0 = 刪除), path, secure, httpOnly(預設 true), sameSite(預設 Lax) }
export function cookie(name, value, { maxAge, path = '/', secure = false, httpOnly = true, sameSite = 'Lax' } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) s += `; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  if (maxAge === 0) s += '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  if (httpOnly) s += '; HttpOnly';
  if (secure) s += '; Secure';
  return s;
}

// ---------- 這個請求的公開網址 ----------
// 協定看 x-forwarded-proto(前面接 HTTPS 代理,例如 Zeabur),主機看 Host;PUBLIC_URL 可以整個覆蓋(例:https://zombies.example.com)
const HOST_RE = /^[A-Za-z0-9.-]{1,253}(?::\d{1,5})?$/;
export function protoOf(req) {
  const xf = req.headers['x-forwarded-proto'];
  const p = typeof xf === 'string' && xf ? xf.split(',')[0].trim().toLowerCase() : req.socket?.encrypted ? 'https' : 'http';
  return p === 'https' ? 'https' : 'http';
}
export function originOf(req) {
  const pub = process.env.PUBLIC_URL;
  if (pub && /^https?:\/\/[^/\s]+/i.test(pub)) return pub.replace(/\/+$/, '');
  const host = typeof req.headers.host === 'string' && HOST_RE.test(req.headers.host) ? req.headers.host : 'localhost';
  return `${protoOf(req)}://${host}`;
}
export function isHttps(req) { return originOf(req).startsWith('https://'); }

// 同源檢查(會改資料的請求):有 Origin 標頭就要等於這個網站;沒有 Origin(舊瀏覽器、curl)就看 Sec-Fetch-Site
export function sameOrigin(req) {
  const o = req.headers.origin;
  if (typeof o === 'string' && o) {
    if (o === originOf(req)) return true;
    const host = req.headers.host;
    return typeof host === 'string' && (o === `http://${host}` || o === `https://${host}`);
  }
  const sfs = req.headers['sec-fetch-site'];
  return !sfs || sfs === 'same-origin' || sfs === 'none';
}

// 讀請求本文(上限 max 位元組;超過 → reject 413)
export function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > max) { reject(Object.assign(new Error('too large'), { code: 413 })); req.resume(); return; }
    const chunks = [];
    let n = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      n += c.length;
      if (n > max) { done = true; reject(Object.assign(new Error('too large'), { code: 413 })); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
