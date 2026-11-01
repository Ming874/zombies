// 介面用的向量圖示(currentColor 上色,任何大小都清晰)
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  cross: svg('<path fill="currentColor" d="M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z"/>'),
  shield: svg('<path fill="currentColor" d="M12 2 4 5v6.2c0 5 3.4 9.4 8 10.8 4.6-1.4 8-5.8 8-10.8V5z"/><path fill="rgba(0,0,0,.35)" d="M12 4.2v15.6c3.4-1.3 6-4.8 6-8.6V6.4z"/>'),
  bolt: svg('<path fill="currentColor" d="M13.5 2 5 13.5h6L9.5 22 19 10h-6.2z"/>'),
  coin: svg('<circle cx="12" cy="12" r="10" fill="#c9951c"/><circle cx="12" cy="12" r="8.2" fill="#f2c84b"/><circle cx="12" cy="12" r="6" fill="none" stroke="#b07f12" stroke-width="1.4"/><path fill="#fff3b8" opacity=".75" d="M7 8.5a6.5 6.5 0 0 1 6-4.3l-.4 1.7A4.8 4.8 0 0 0 8.6 9z"/>'),
  grenade: svg('<path fill="currentColor" d="M10 6.2h4.6l.9 1.6c2.6 1.3 4.3 3.9 4.3 6.9 0 4.2-3.5 7.6-7.8 7.6S4.2 18.9 4.2 14.7c0-3 1.7-5.6 4.3-6.9z"/><path fill="currentColor" d="M14.6 3.5h-4.8v2.2h4.8z"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M15 4.6c2.2-.9 4.4.2 5 2.4M15.6 6.8l3.8 6.4"/><path fill="rgba(0,0,0,.3)" d="M7 12.5h10M6.4 15.8h11.2" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>'),
  medkit: svg('<rect x="2.5" y="6.5" width="19" height="14" rx="2.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M8.5 6.5V4.8c0-.8.6-1.3 1.3-1.3h4.4c.7 0 1.3.5 1.3 1.3v1.7"/><path fill="#1a0b0b" d="M10.6 9.8h2.8v2.6H16v2.8h-2.6v2.6h-2.8v-2.6H8v-2.8h2.6z"/>'),
  ammo: svg('<path fill="currentColor" d="M5 9.5C5 6.5 6.2 4 7.5 3 8.8 4 10 6.5 10 9.5V21H5zM14 9.5c0-3 1.2-5.5 2.5-6.5C17.8 4 19 6.5 19 9.5V21h-5z"/><path fill="rgba(0,0,0,.35)" d="M5 17h5v1.4H5zm9 0h5v1.4h-5z"/>'),
  cart: svg('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" d="M2.5 3.5h3l2.4 11.2h10.4l2.2-8H7"/><circle cx="9.5" cy="19.2" r="1.7" fill="currentColor"/><circle cx="17" cy="19.2" r="1.7" fill="currentColor"/>'),
  skull: svg('<path fill="currentColor" d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.7 1.2 4.6 3 5.7V20c0 .8.6 1.5 1.5 1.5h1.2v-2.3h1.4v2.3h2.8v-2.3h1.4v2.3H16c.8 0 1.5-.7 1.5-1.5v-3.8c1.8-1.1 3-3 3-5.7 0-4.6-3.5-8-8.5-8z"/><circle cx="8.7" cy="11.4" r="2.3" fill="#140808"/><circle cx="15.3" cy="11.4" r="2.3" fill="#140808"/><path fill="#140808" d="m12 13.6 1.4 2.6h-2.8z"/>'),
  head: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path stroke="currentColor" stroke-width="2" d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>'),
  knife: svg('<path fill="currentColor" d="M21.5 2.5 9.8 14.2l-1.9-.4L19.6 2.1c.8-.3 1.6-.2 1.9.4z"/><path fill="currentColor" d="m8.6 14.6 1.6 1.6-1.4 1.4 1.1 1.1-2.5 2.5c-.6.6-1.5.6-2.1 0l-1.4-1.4c-.6-.6-.6-1.5 0-2.1L6.4 15l1.1 1.1z"/>'),
  map: svg('<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m3 6 6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5zM9 3.5V18M15 6v14.5"/>'),
  stairs: svg('<path fill="currentColor" d="M3 19h4.5v-4.2H12v-4.3h4.5V6.2H21V8h-2.8v4.3h-4.5v4.3H9.2V21H3z"/>'),
  heal: svg('<path fill="currentColor" d="M12 21s-8.5-5.2-8.5-11.3C3.5 6.6 5.7 4.5 8.4 4.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.7 0 4.9 2.1 4.9 5.2C20.5 15.8 12 21 12 21z"/>'),
  gear: svg('<path fill="currentColor" d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>'),
  lock: svg('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
  check: svg('<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.5 5 5 10-11"/>'),
  pistol: svg('<path fill="currentColor" d="M3 6.5h16.5l1 1.2v2.1h-1.6v1.4H11l-.6 1.6-1.9.4-1.3 5.8H3.4l1.9-7.2-2.3-.6z"/><path fill="rgba(0,0,0,.35)" d="M9.2 11.2h2.4l-.5 1.4-1.6.3z"/>'),
  revolver: svg('<path fill="currentColor" d="M2.5 7.2h11.8l.9-.9h1.6v1h3.6v2H14.6c.2.5.3 1 .3 1.6 0 1.6-1.2 2.9-2.8 3.2l-1.1.2-.9 5.2H6.6l.9-5.6-2.3-.9 1-3.3H2.5z"/><circle cx="11.2" cy="10.9" r="1.5" fill="rgba(0,0,0,.4)"/>'),
  shotgun: svg('<path fill="currentColor" d="M1 11.6h2.6l1.5-1.3h7.2V9.4h10.5v1.4H13.4v.8h8.2v1.2h-8.4l-.6 1.4h-2.1l.3-1.4H8.6l-2 4.3H4.1l1.6-4.3H4.3l-1.6 2.1H1z"/><path fill="rgba(0,0,0,.35)" d="M14.2 11.6h6v1.2h-6z"/>'),
  rifle: svg('<path fill="currentColor" d="M1 11.2h3.4l1.2-1.4h9.6V8.6h1.2v1.2H23v1.6h-4.6v1.1h-3l-.9 1.9h-2.3l.5-1.9H9.8l-1.6 4.3H5.6l1.5-4.3H5.2l-1.9 2.6H1z"/>', '0 0 24 24'),
  sniper: svg('<path fill="currentColor" d="M1 12h3l1.2-1.2h5.6V9.2H9.6V8h6.2v1.2h-1.4v1.6h3.8v-.6H23v1.7h-4.8v.8h-6l-1.2 3.9H8.6l1.1-3.9H6.1l-2 2.4H1z"/><path fill="rgba(0,0,0,.3)" d="M10.8 8.6h3.6v.6h-3.6z"/>'),
  vest: svg('<path fill="currentColor" d="M8 2.5h2.2c.3 1.4 1 2.2 1.8 2.2s1.5-.8 1.8-2.2H16l3.5 3V21c0 .3-.2.5-.5.5H5c-.3 0-.5-.2-.5-.5V5.5z"/><path fill="rgba(0,0,0,.32)" d="M6.5 11h11v2.2h-11zm0 4h11v2.2h-11z"/>'),
};

export const keycap = (k) => `<kbd class="kc">${k}</kbd>`;
// "按 [E] 開啟" → 把 [X] 換成鍵帽
export const withKeys = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\[([^\]]{1,8})\]/g, (_, k) => keycap(k));
