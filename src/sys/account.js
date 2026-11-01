// 帳號(Google 登入;伺服器端 OAuth 重新導向流程,見 server/auth.js)。
//   account.ready / enabled(伺服器有設定 Google 登入)/ user({ id, name, pic, dev } | null)
//   account.refresh() → Promise(重新問 /api/me)
//   account.login()   整頁導向 /auth/google(登入後回到目前的網址;不用彈出視窗:頁面開了 COOP/COEP)
//   account.logout()  → Promise
//   account.on(fn)    狀態改變時呼叫 fn(account);回傳取消函式
//   account.flash     網址上的 ?login=fail|cancel(登入失敗/取消;讀一次之後從網址拿掉)
const st = { ready: false, enabled: false, dev: false, user: null, offline: false };
const subs = new Set();
const emit = () => { for (const f of subs) { try { f(account); } catch (e) { console.warn('[account]', e); } } };
let pending = null;

// 登入結果放在網址參數:讀一次,從網址拿掉(重新整理不會再出現)
let flash = null;
try {
  const u = new URL(location.href), v = u.searchParams.get('login');
  if (v) { flash = v === 'cancel' ? 'cancel' : 'fail'; u.searchParams.delete('login'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
} catch { /* 略 */ }

export const account = {
  get ready() { return st.ready; },
  get enabled() { return st.enabled; },
  get dev() { return st.dev; },
  get user() { return st.user; },
  get offline() { return st.offline; },
  get flash() { const f = flash; flash = null; return f; },
  refresh() {
    if (pending) return pending;
    pending = fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((m) => { st.enabled = !!m.enabled; st.dev = !!m.dev; st.user = m.user || null; st.offline = false; })
      .catch(() => { st.offline = true; }) // 沒有伺服器(vite dev 沒開 npm run server、或離線):當作沒有登入功能
      .finally(() => { st.ready = true; pending = null; emit(); });
    return pending;
  },
  login() {
    const back = location.pathname === '/' ? '/' + (location.search || '') : '/';
    location.href = '/auth/google?r=' + encodeURIComponent(back);
  },
  async logout() {
    try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* 離線 */ }
    st.user = null;
    emit();
    return account.refresh();
  },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
};
if (typeof window !== 'undefined') window.__account = account; // 除錯用
