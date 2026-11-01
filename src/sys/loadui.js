// ===== 載入進度(index.html 由 gameplay 負責,這裡由 JS 插入一個不擋滑鼠的細條)=====
// 選單時在畫面底部顯示「物理引擎 / 殭屍模型 / 貼圖與模型」進度;開始遊戲後縮成左上角的小字;全部完成後淡出。
//   const ui = loadUI(() => ({ steps: [[標籤, 0..1, 文字], ...], playing }));  ui.stop()
const CSS = `
#hzload{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:30;pointer-events:none;width:min(560px,86vw);
  font:12px/1.5 "Microsoft JhengHei","PingFang TC","Noto Sans TC",system-ui,sans-serif;color:#c8ccc0;text-shadow:0 1px 2px #000;
  transition:opacity .8s;opacity:1}
#hzload.done{opacity:0}
#hzload .t{display:flex;justify-content:space-between;gap:12px;letter-spacing:1px;white-space:nowrap;overflow:hidden}
#hzload .t b{color:#e6e2d0;font-weight:700}
#hzload .bar{height:3px;margin-top:4px;background:rgba(255,255,255,.12);overflow:hidden}
#hzload .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7a1a15,#c9483a);transition:width .3s}
#hzload.mini{left:12px;bottom:auto;top:10px;transform:none;width:auto;opacity:.65}
#hzload.mini .bar,#hzload.mini .t span:not(:first-child){display:none}`;

export function loadUI(read) {
  if (typeof document === 'undefined') return { stop() {} };
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'hzload';
  el.innerHTML = '<div class="t"></div><div class="bar"><i></i></div>';
  const txt = el.firstChild, bar = el.lastChild.firstChild;
  const mount = () => document.body ? document.body.appendChild(el) : requestAnimationFrame(mount);
  mount();
  let last = '', doneT = 0, timer = 0;
  const tick = () => {
    let s;
    try { s = read(); } catch { return; }
    const steps = s.steps || [];
    let sum = 0, w = 0;
    for (const [, f, , wt = 1] of steps) { sum += Math.max(0, Math.min(1, f)) * wt; w += wt; }
    const frac = w ? sum / w : 1;
    const html = (frac >= 1 ? '<span><b>載入完成</b></span>' : `<span><b>載入中</b> ${Math.round(frac * 100)}%</span>`)
      + steps.map(([label, f, text]) => `<span>${label} ${f >= 1 ? '✓' : text || Math.round(f * 100) + '%'}</span>`).join('');
    if (html !== last) { txt.innerHTML = html; last = html; }
    bar.style.width = (frac * 100).toFixed(1) + '%';
    el.classList.toggle('mini', !!s.playing);
    if (frac >= 1) {
      if (!doneT) doneT = performance.now();
      if (performance.now() - doneT > 1500) { el.classList.add('done'); clearInterval(timer); setTimeout(() => el.remove(), 900); }
    } else doneT = 0;
  };
  timer = setInterval(tick, 200);
  tick();
  return { stop() { clearInterval(timer); el.remove(); }, tick };
}
