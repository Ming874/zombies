// 等天光 Service Worker(只在正式版註冊,見 src/main.js installPWA)
// 每次 build 由 vite.config.js(swManifest)在檔頭寫入 self.__HZ = { build, entry, html, crit, files }:
//   files:發佈的每個檔案 → 內容雜湊(assets/ 下的檔名本身就有雜湊,值為 1)。sw.js 因此每版都不同 → 一定會更新。
// 快取策略(重新部署時,舊分頁與新分頁都不會拿到不相符的程式碼):
//   - 導覽(index.html):網路優先(navigation preload),離線/逾時才用快取;只快取「本版」的 html
//   - assets/*(雜湊檔名,不可變):快取優先;安裝時預先放入本版全部程式碼(JS/CSS/Worker/WASM,已在舊快取的直接沿用);
//     啟用時保留「本版 + 上一版」,舊分頁晚一點才載入的程式片段仍拿得到
//   - 其他公開檔(貼圖、模型…網址不含雜湊):依清單雜湊驗證,內容變了就重新下載
//   - /ws、/api、/healthz、Range 請求、跨來源、清單外的檔案:一律不經過快取
const M = self.__HZ || { build: 'dev', entry: '', html: '', crit: [], files: {} };
const SCOPE = new URL(self.registration.scope).pathname; // 例如 '/'
const A = 'hz-a', P = 'hz-p', H = 'hz-h', META = 'hz-meta';
const OURS = new Set([A, P, H, META]);
const BYPASS = /^(?:ws|api|healthz)(?:\/|$)/;
const rel = (url) => decodeURIComponent(url.pathname.slice(SCOPE.length));

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const a = await caches.open(A);
    // 本版程式碼:舊版快取已有(同檔名 = 同內容)就略過,其餘從網路(多半命中 HTTP 快取)抓,一次 4 個
    const todo = Object.keys(M.files).filter((k) => k.startsWith('assets/') && /\.(?:m?js|css|wasm)$/.test(k));
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const k = todo[i++], url = SCOPE + k;
        try {
          if (await a.match(url)) continue;
          const res = await fetch(url, { credentials: 'same-origin' });
          if (res.ok) await a.put(url, res);
        } catch { /* 個別失敗不影響安裝,執行時再抓 */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // 本版 index.html(確認引用的是本版入口,避免安裝途中伺服器又換版)
    try {
      const res = await fetch(SCOPE, { cache: 'no-cache', credentials: 'same-origin' });
      if (res.ok && (!M.entry || (await res.clone().text()).includes(M.entry))) await (await caches.open(H)).put(SCOPE, res);
    } catch { /* 離線安裝:之後導覽時再存 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const a = await caches.open(A), meta = await caches.open(META);
    // 舊版 SW 的快取(hz-<版本>):程式碼搬進 hz-a(可能還有分頁在用),其餘丟掉
    for (const k of await caches.keys()) {
      if (OURS.has(k) || !k.startsWith('hz-')) continue;
      const old = await caches.open(k);
      for (const req of await old.keys()) {
        if (!new URL(req.url).pathname.startsWith(SCOPE + 'assets/') || (await a.match(req))) continue;
        const res = await old.match(req);
        if (res) await a.put(req, res).catch(() => {});
      }
      await caches.delete(k);
    }
    // 程式碼:保留本版與上一版用到的,其餘刪除
    const cur = Object.keys(M.files).filter((k) => k.startsWith('assets/'));
    let prev = [];
    try { const r = await meta.match(SCOPE + '__hz/assets.json'); if (r) prev = (await r.json()).filter((x) => typeof x === 'string'); } catch { /* 第一次 */ }
    const keep = new Set([...cur, ...prev]);
    if (cur.length) {
      for (const req of await a.keys()) if (!keep.has(rel(new URL(req.url)))) await a.delete(req);
      await meta.put(SCOPE + '__hz/assets.json', new Response(JSON.stringify(cur), { headers: { 'Content-Type': 'application/json' } }));
    }
    // 公開檔:清單已移除的刪掉(內容變了的在下次請求時換新)
    const p = await caches.open(P);
    for (const req of await p.keys()) if (!(rel(new URL(req.url)) in M.files)) await p.delete(req);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ t: 'hz-sw', build: M.build, entry: M.entry });
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'clear') e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hz')).map((k) => caches.delete(k)))));
  else if (e.data === 'build' && e.source) e.source.postMessage({ t: 'hz-sw', build: M.build, entry: M.entry });
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = rel(url);
  if (BYPASS.test(path) || req.headers.has('range')) return;
  if (req.mode === 'navigate') { e.respondWith(navigate(e)); return; }
  if (path === 'sw.js' || url.search) return; // 帶查詢字串的(SW 本身、除錯用)不快取
  if (path.startsWith('assets/')) { e.respondWith(immutable(req)); return; }
  const hash = M.files[path];
  if (hash !== undefined) e.respondWith(versioned(req, String(hash)));
});

// 導覽:網路優先(最多等 10 秒),成功就更新快取的 html;失敗用快取(離線也能進遊戲)
async function navigate(e) {
  const h = await caches.open(H);
  try {
    const net = (async () => (await e.preloadResponse) || fetch(e.request))();
    const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    if (res && res.ok && (res.headers.get('content-type') || '').includes('text/html') && rel(new URL(e.request.url)) === '') h.put(SCOPE, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await h.match(SCOPE)) || (await fetch(e.request).catch(() => Response.error()));
  }
}

// 雜湊檔名:任何一版快取到的都可以直接用(同名 = 同內容)
async function immutable(req) {
  const a = await caches.open(A);
  const hit = await a.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200 && res.type === 'basic') a.put(req, res.clone()).catch(() => {});
  return res;
}

// 公開檔:快取裡的雜湊與清單相同才用;否則重新下載(網路失敗時仍用舊的)
async function versioned(req, hash) {
  const p = await caches.open(P);
  const hit = await p.match(req);
  if (hit && hit.headers.get('x-hz') === hash) return hit;
  try {
    // 要存進 SW 快取前一律向伺服器確認(ETag 沒變只回 304,很便宜):HTTP 快取裡可能還是上一版的同名檔
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      (async () => {
        const hd = new Headers(copy.headers);
        hd.set('x-hz', hash);
        hd.delete('content-encoding'); hd.delete('content-length'); // 存的是解壓後的內容
        await p.put(req, new Response(await copy.blob(), { status: 200, statusText: copy.statusText, headers: hd }));
      })().catch(() => {});
    }
    return res;
  } catch (err) {
    if (hit) return hit;
    throw err;
  }
}
