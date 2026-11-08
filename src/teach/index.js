// ===== 教學模式(F2 開關)=====
// 給遊戲製作課用:一個知識點一個場景(←/→ 切換、目錄跳轉),讓學生自己動手改、看畫面怎麼變。
// 這支檔案只有按鍵攔截與遊戲掛鉤(很小,開機就載入);教室介面與各個場景在第一次按 F2 時才動態載入(src/teach/shell.js)。
//
// 鍵盤:跟 F8 控制面板一樣,在模組載入時就註冊 window 捕獲監聽器(main.js 第二個 import)→ 比其他模組早;
// 開著時吞掉所有按鍵(stopImmediatePropagation,不擋輸入框打字),只留教室自己的 ←/→/Esc/F2。
// 開著時:遊戲完全停住(主迴圈的 game.update / game.render 變成空的),教室用自己的 requestAnimationFrame 畫;
// 「真實遊戲場景」的課才借用原本的 render(醫院、燈光、後處理照舊)。多人連線時不開(世界不能停)。

export const TEACH_KEY = 'F2';
const S = { game: null, open: false, shell: null, loading: false, raw: null };

addEventListener('keydown', onKeyDown, true);
addEventListener('keyup', (e) => { if (S.open) e.stopImmediatePropagation(); }, true);

export function installTeach(game) {
  S.game = game;
  game.teach = { toggle: () => toggle(), get open() { return S.open; } };
  const upd = game.update, rnd = game.render;
  S.raw = { update: (dt) => upd.call(game, dt), render: () => rnd.call(game) };
  game.update = function (dt) { if (S.open) return; return upd.call(this, dt); };
  game.render = function () { if (S.open) return; return rnd.call(this); };
}

function onKeyDown(e) {
  if (e.code === TEACH_KEY) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) toggle();
    return;
  }
  if (!S.open) return;
  e.stopImmediatePropagation();
  if (e.code !== 'Escape' && e.target?.closest?.('input, textarea, select')) return; // 拉桿用方向鍵微調
  S.shell?.key(e);
}

async function toggle() {
  const g = S.game;
  if (!g || S.loading) return;
  if (S.open) { close(true); return; }
  if (g.net) { toast('多人連線中不能開教學模式'); return; }
  if (g.consoleOpen || g.shopUIOpen || g.bookOpen || g.motion?.busy) { toast('先關掉目前的畫面，再按 F2'); return; }
  S.loading = true;
  try {
    if (!S.shell) {
      toast('教學模式載入中…', 1200);
      const { createShell } = await import('./shell.js');
      S.shell = createShell(g, { close, raw: S.raw });
    }
    S.open = true;
    S.shell.open();
  } catch (err) {
    console.error('[teach]', err);
    toast('教學模式載入失敗');
    S.open = false;
  } finally { S.loading = false; }
}

// relock:F2 / ✕ 按鈕關閉(使用者手勢)→ 直接回到遊戲;Esc 關閉(瀏覽器不讓 Esc 重新鎖定滑鼠)→ 顯示暫停選單
function close(relock = true) {
  if (!S.open) return;
  S.open = false;
  S.shell?.close(relock);
}

let toastEl = null, toastT = 0;
function toast(text, ms = 1800) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9500;padding:8px 16px;border-radius:999px;background:rgba(8,18,20,.92);color:#e6f0ea;font-size:14px;letter-spacing:1px;border:1px solid rgba(140,220,200,.25);pointer-events:none;transition:opacity .2s;opacity:0';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.style.opacity = '1';
  clearTimeout(toastT);
  toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, ms);
}
