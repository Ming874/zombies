import './menu.css';
import { settings } from './settings.js';
import { loadBest, DIFF, DIFF_ORDER } from '../game/waves.js';
import { sfx } from '../audio.js';
import { account } from '../sys/account.js';

// 主選單(標題畫面)、暫停選單、死亡結算、設定/操作說明/製作與授權面板。
// 沿用 index.html 的 #menu / #pause / #dead 容器與 #startBtn / #resumeBtn / #restartBtn(input.js 會綁定),內容改由這裡建立。
// 多人:連線模組把自己的入口按鈕放進 #menuModes(這裡隱藏它),主選單的「合作生存 / 對戰死鬥」直接開啟大廳並選好模式。
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const HEART = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M16 27.5S4.5 20 4.5 12.3C4.5 8.6 7.3 6 10.6 6c2.3 0 4.3 1.3 5.4 3.2C17.1 7.3 19.1 6 21.4 6c3.3 0 6.1 2.6 6.1 6.3C27.5 20 16 27.5 16 27.5z"/><path fill="currentColor" d="M15 1.5h2v4h3v2h-3v5h-2v-5h-3v-2h3z"/><path fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7" d="M11 13.5c1.5 2.5 3 3.5 5 3.5s3.5-1 5-3.5"/></svg>';
const pct = (v) => `${Math.round(v * 100)}%`;
// Google 的「G」標誌(登入按鈕;四色)
const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';
// 結算的擊殺分類:全部 11 種(追獵者不會被打死,不列)
const TYPE_ORDER = ['walker', 'runner', 'crawler', 'bloater', 'screamer', 'stalker', 'surgeon', 'burned', 'straitjacket', 'hazmat', 'brute'];
const TYPE_NAMES = { walker: '活屍', runner: '快跑的', crawler: '爬的', bloater: '會爆的', brute: '巨屍', screamer: '尖叫的', stalker: '潛行的', surgeon: '手術者', burned: '焦屍', hazmat: '清理隊員', straitjacket: '束縛病患' };
const PRESET_NAME = { low: '低', medium: '中', high: '高', ultra: '極致' };
// [類型, 鍵, 標籤, …]:range(min, max, step, 格式, 說明)/ toggle(說明)/ seg(選項, 說明)/ btn(按鈕文字, 說明)
const SETTINGS = [
  ['sec', '操作'],
  ['range', 'sens', '滑鼠靈敏度', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`],
  ['toggle', 'invertY', '反轉 Y 軸'],
  ['range', 'fov', '視野 FOV', 60, 100, 1, (v) => `${v}°`, '開鏡與狙擊鏡依此縮放'],
  ['sec', '音量'],
  ['range', 'master', '主音量', 0, 1, 0.01, pct],
  ['range', 'music', '音樂與環境', 0, 1, 0.01, pct],
  ['range', 'sfx', '音效', 0, 1, 0.01, pct],
  ['sec', '畫面'],
  ['seg', 'preset', '畫質預設', [['low', '低'], ['medium', '中'], ['high', '高'], ['ultra', '極致']], '切換會重設下面的個別選項'],
  ['toggle', 'shadows', '陰影', '手電筒與燈光陰影'],
  ['toggle', 'bloom', '光暈', '燈光與火光的泛光效果'],
  ['toggle', 'dynamicRes', '動態解析度', '掉幀時自動降低解析度'],
  ['toggle', 'hurtFx', '受傷畫面效果', '受傷暈影與方向指示'],
  ['seg', 'motion', '畫面動態', [['auto', '自動'], ['full', '完整'], ['reduced', '減少']], '減少：沒有晃動、眨眼與捲動，轉場改成短淡入（自動：跟著系統設定）'],
  ['seg', 'scare', '驚嚇強度', [['off', '關'], ['low', '低'], ['normal', '標準'], ['high', '高']], '靈異事件、耳邊低語與人影的頻率（低：沒有大場面）'],
  ['sec', '新手提示'],
  ['toggle', 'tips', '顯示新手提示', '依情境顯示一次，按 T 關閉'],
  ['btn', 'tipsReset', '重新顯示所有提示', '重新顯示', '下一場遊戲重新出現'],
];
export const KEYS = [
  ['W A S D', '移動'], ['Shift', '奔跑'], ['Space', '跳躍'], ['C', '蹲下（切換）'],
  ['滑鼠左鍵', '射擊'], ['滑鼠右鍵', '開鏡（按住）'], ['R', '換彈'], ['1–7 / 滾輪', '切換武器'],
  ['G', '投擲手榴彈'], ['V', '小刀'], ['F', '手電筒'], ['E', '互動：金水商行／補給櫃／調查'],
  ['H', '使用醫療包'], ['M', '地圖'], ['N', '休息時不等了，直接開始下一波'], ['T', '關閉提示'],
  ['J', '筆記本'], ['B', '吹口哨（鬼月不要亂吹）'],
  ['Esc', '暫停'], ['F3', '效能資訊'], ['F8', '控制面板（/give 指令）'],
];
const KEYS_MP = [['Tab', '計分板（多人）'], ['Enter', '聊天（多人）']];
const TIPS = [
  '每一波打完有 <b>30 秒</b>休息（第 5、10… 波之前 40 秒）：金水伯把貨放在店裡，拉起鐵門（畫面上的推車標記會指路）：槍、彈藥、改裝、防彈背心、手榴彈與醫療包。<b>買東西時遊戲暫停</b>。',
  '<b>第 5、10、15… 波最強</b>，打最多針的巨屍會醒。有些夜裡會出事：第 6 波廣播在叫人去大廳、<b>第 8 波停電</b>（那層樓只剩緊急照明，潛行者變多）、之後還有警鈴、狂奔、膿毒的晚上。從第 5 次起他們越來越耐打，記得升級武器。',
  '<b>爆頭</b>造成雙倍傷害並多拿 50% 錢；<b>近戰擊殺</b>錢加倍。4 秒內連續擊殺會累積<b>連殺</b>，分數倍率最高 ×2，5、8、12… 連殺另有錢獎勵。',
  '一整波<b>毫髮無傷</b>可以拿到額外獎勵；活屍身上還有生前的零錢和鈔票，這一波結束時，地上的錢會一起算進你的口袋，用得到的掉落物也會一起收。',
  '活屍會掉<b>彈匣</b>（橘光）、<b>醫療包</b>（綠光），偶爾掉<b>手榴彈</b>；彈藥或生命不足時掉落率會提高。靠近就會自動吸過來，約 40 秒後消失。',
  '各樓層的<b>彈藥櫃與醫療櫃</b>每一波可用一次（按 E），每個櫃子一晚只能用 3 次；彈藥櫃只補<b>手上那把槍</b>。按 <b>M</b> 打開地圖找它們。',
  '<b>膿腫者</b>死亡會爆炸並留下毒氣；<b>巨屍</b>咆哮後會衝鋒，引他撞牆再打頭。',
  '聲音是你最好的朋友：戴上耳機，注意腳步、低吼與遠方的動靜。',
  '<b>筆記本（J）</b>：線索會自己記下來，「到目前為止」那一頁寫著你知道的事。把詞填進句子，到阿嬤的照片前<b>擲筊</b>（丟兩片筊杯問阿嬤）：聖筊＝全對；笑筊、陰筊會告訴你對了幾個。',
  '<b>鬼月禁忌</b>：阿嬤說過，七月有人叫你的名字，不要回頭。',
];
const keyGrid = (list, cls = '') => `<div class="mn-keys ${cls}">${list.map(([k, t]) => `<div><kbd>${esc(k)}</kbd><span>${esc(t)}</span></div>`).join('')}</div>`;

export class Menu {
  constructor(ui) {
    this.ui = ui;
    this.panelOpen = null;
    // 開始單人遊戲前依序等待的演出(例如之後的「隨機抽地圖」):async () => void。
    // 注意:滑鼠鎖定需要使用者手勢,演出超過數秒時請在演出結束時讓玩家再點一下(input.js 的 startBtn)
    this.beforeStart = [];
    document.title = '等天光 · 第七暝';
    this._main();
    this._pause();
    this._dead();
    this._panel();
    // 面板開啟時 Esc 只關面板
    window.addEventListener('keydown', (e) => {
      if (this.panelOpen && e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); this.closePanel(); }
    }, true);
    // 按鈕音效(委派)
    document.addEventListener('mouseover', (e) => { if (e.target.closest?.('.mn-btn, .mn-mini, .mp-seg button, .mp-ft button, .mp-hd .x, .mp-act')) sfx.uiHover(); });
  }

  attach(game) { this.game = game; }

  // ---------- 主選單 ----------
  _main() {
    const m = $('menu');
    m.classList.add('mn', 'mo-boot'); // [motion] 世界建好之前只顯示開機字樣(src/ui/motion.js 拿掉 mo-boot 並依序淡入)
    setTimeout(() => m.classList.remove('mo-boot'), 30000); // 保險:轉場模組不在時
    m.innerHTML = `
      <div class="mn-bootmark">等天光<small>暖機中</small></div>
      <div class="mn-nosig" aria-hidden="true">CH 03<small>無訊號</small></div>
      <div class="mn-osd" aria-hidden="true"><span class="rec"><i></i>REC</span><span class="clk">2003/05/12 (一) 23:59:13</span><span class="cam">CAM 03 · 1F 大廳</span></div>
      <div class="mn-acct" id="menuAcct"></div>
      <div class="mn-wrap">
        <div class="mn-over">${HEART}BEFORE DAYBREAK · SACRED HEART HOSPITAL</div>
        <h1 class="mn-title"><span>等</span><span>天</span><span>光</span></h1>
        <div class="mn-sub mn-chap">第一章〈第七暝〉聖心醫院</div>
        <div class="mn-sub">阿嬤死在 207 號房。今晚，<b>她打電話叫你回來</b>。</div>
        <div class="mn-rule"></div>
        <div class="mn-btns">
          <button class="mn-btn primary" id="startBtn">單人<small>撐過一波波活屍 · 查出阿嬤在 207 守著什麼</small></button>
          <button class="mn-btn" data-mode="coop">合作生存<small>2–4 人連線 · 倒地可互相救援</small></button>
          <button class="mn-btn" data-mode="pvp">對戰死鬥<small>2–8 人 · 各自為戰，可加入殭屍騷擾（非正史）</small></button>
          <div class="mn-row mn-diff" id="menuDiff" role="radiogroup" aria-label="難度"></div>
          <div class="mn-diffsub" id="menuDiffSub"></div>
          <div id="menuModes"></div>
          <div class="mn-row">
            <button class="mn-mini" data-p="settings">設定</button>
            <button class="mn-mini" data-p="help">操作說明</button>
            <button class="mn-mini" data-p="credits">製作與授權</button>
          </div>
          <div class="mn-best" id="menuBest"></div>
        </div>
      </div>
      <div class="mn-stage" id="menuStage"></div>
      <div class="mn-side"><div class="mn-sideh">操作</div>${keyGrid(KEYS, 'compact')}</div>
      <div class="mn-foot">建議戴上耳機並全螢幕遊玩 · 設定與最佳紀錄存在這台電腦的瀏覽器；登入後，存檔點存在你的帳號<br />等天光 Before Daybreak · 一款網頁 3D 恐怖射擊遊戲</div>`;
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (b) { sfx.uiClick(); this.openPanel(b.dataset.p); return; }
      const md = e.target.closest('[data-mode]');
      if (md) { sfx.uiClick(); this.openLobby(md.dataset.mode); }
    });
    $('startBtn').addEventListener('click', () => sfx.uiClick());
    this.mainBtns = m.querySelector('.mn-btns');
    this.miniRow = m.querySelector('.mn-row');
    this.stage = $('menuStage'); // 空的演出區(主選單右側中央),之後的抽地圖動畫可以放這裡
    this.showBest();
    this._diffRow(); // [w4] 難度(存在 settings.difficulty)
    this._account(); // [w5] Google 登入(src/sys/account.js)
    // 回到主選單時更新最佳紀錄
    new MutationObserver(() => { if (m.classList.contains('on')) this.showBest(); }).observe(m, { attributes: true, attributeFilter: ['class'] });
  }

  // 擴充入口(之後的圖鑑、成就…):main = 大按鈕(放在模式按鈕下方),否則放進小按鈕列;回傳按鈕元素
  addEntry({ id, label, sub = '', main = false, onClick } = {}) {
    const b = document.createElement('button');
    b.className = main ? 'mn-btn' : 'mn-mini';
    if (id) b.id = id;
    b.innerHTML = `${esc(label || '')}${main && sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.addEventListener('click', () => { sfx.uiClick(); onClick?.(); });
    if (main) this.mainBtns.insertBefore(b, this.miniRow);
    else this.miniRow.appendChild(b);
    return b;
  }

  // 多人大廳(src/net/lobby.js):選好模式後開啟;連線模組不在時退回它自己的入口按鈕
  openLobby(mode) {
    const L = window.__net;
    if (L && typeof L.open === 'function') {
      if (!L.room) L.mode = mode;
      L.open();
      return;
    }
    const entry = $('mp-entry');
    if (entry) entry.click();
    else this.ui.hud?.banner?.('多人連線無法使用', '請確認多人伺服器已啟動', 2400, 'red');
  }

  // [w4] 難度:四個小按鈕(正典名稱),選了就存進設定;下一局開始時生效(單人;合作時數量/血量/節奏用房主的)
  _diffRow() {
    const row = $('menuDiff'), sub = $('menuDiffSub');
    if (!row) return;
    const paint = () => {
      const cur = settings.get('difficulty') || 'normal';
      for (const b of row.children) { const on = b.dataset.d === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
      if (sub) sub.textContent = DIFF[cur]?.sub || '';
    };
    row.innerHTML = DIFF_ORDER.map((d) => `<button class="mn-mini" role="radio" data-d="${d}">${esc(DIFF[d].name)}</button>`).join('');
    row.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; e.stopPropagation(); sfx.uiClick(); settings.set('difficulty', b.dataset.d); paint(); });
    settings.on((k) => { if (!k || k === 'difficulty') paint(); });
    paint();
  }

  // [w5] 帳號列:登入後顯示頭像和名字;伺服器沒有設定 Google 登入時整列隱藏
  _account() {
    const el = $('menuAcct');
    if (!el) return;
    const paint = () => {
      const u = account.user;
      el.classList.toggle('on', !!u || account.enabled);
      if (u) {
        const ini = esc(Array.from(u.name || '?')[0] || '?');
        el.innerHTML = `<span class="mn-av"><b>${ini}</b>${u.pic ? `<img src="${esc(u.pic)}" alt="" referrerpolicy="no-referrer" />` : ''}</span><span class="mn-who"><b>${esc(u.name)}</b><small>${u.dev ? '測試帳號 · ' : ''}存檔點存在你的帳號</small></span><button class="mn-link" data-a="out">登出</button>`;
        el.querySelector('img')?.addEventListener('error', (e) => e.target.remove());
      } else if (account.enabled) {
        el.innerHTML = `<button class="mn-mini mn-google" data-a="in">${GOOGLE_G}用 Google 登入</button><small>記錄進度，下次從存檔點繼續（也支援雙人）</small>`;
      } else el.innerHTML = '';
      if (this._flash) { const f = document.createElement('div'); f.className = 'mn-flash'; f.textContent = this._flash; el.appendChild(f); }
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      sfx.uiClick();
      if (b.dataset.a === 'in') { b.disabled = true; b.lastChild.textContent = '前往 Google…'; account.login(); }
      else if (b.dataset.a === 'out') { b.disabled = true; account.logout(); }
    });
    const f = account.flash;
    if (f) { this._flash = f === 'cancel' ? '已取消登入' : '登入失敗，請再試一次'; setTimeout(() => { this._flash = null; paint(); }, 8000); }
    account.on(paint);
    paint();
    account.refresh();
  }

  showBest() {
    const b = loadBest(), el = $('menuBest');
    if (!el) return;
    el.innerHTML = b && b.round ? `<span>最佳紀錄</span>第 <b>${b.round}</b> 波 · 分數 <b>${(b.score || 0).toLocaleString('en-US')}</b> · 擊殺 <b>${b.kills || 0}</b>` : '';
  }

  // ---------- 暫停 ----------
  _pause() {
    const p = $('pause');
    p.classList.add('mn-box');
    p.innerHTML = `
      <div class="mn-card mn-pause">
        <div class="mn-pl">
          <h1>暫停</h1><div class="mn-hint">點擊空白處或「繼續遊戲」返回</div>
          <div class="mn-run" id="pauseRun"></div>
          <div class="mn-btns">
            <button class="mn-btn primary" id="resumeBtn">繼續遊戲</button>
            <button class="mn-btn" data-p="settings">設定</button>
            <button class="mn-btn" data-p="help">操作說明</button>
            <button class="mn-btn" data-act="quit">回到主選單</button>
          </div>
        </div>
        <div class="mn-pr"><div class="mn-sideh">操作</div>${keyGrid(KEYS, 'compact')}</div>
      </div>`;
    // 卡片內的點擊不要冒泡到 #pause(那會直接繼續遊戲),「繼續遊戲」除外
    p.querySelector('.mn-card').addEventListener('click', (e) => {
      if (e.target.closest('#resumeBtn')) return;
      e.stopPropagation();
      const b = e.target.closest('[data-p]');
      if (b) { sfx.uiClick(); this.openPanel(b.dataset.p); }
      if (e.target.closest('[data-act="quit"]')) { sfx.uiClick(); this.game?.quitToMenu(); }
    });
  }

  _dead() {
    const d = $('dead');
    d.classList.add('mn-box');
    d.innerHTML = `
      <div class="mn-card mn-dead">
        <h1>你倒下了</h1>
        <div id="deadinfo"></div>
        <div class="mn-btns">
          <button class="mn-btn primary" id="restartBtn">再試一次</button>
          <button class="mn-btn" data-act="quit">回到主選單</button>
        </div>
      </div>`;
    d.querySelector('[data-act="quit"]').addEventListener('click', () => { sfx.uiClick(); this.game?.quitToMenu(); });
  }

  showDeath(s) {
    const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const hp = s.kills ? Math.round((s.headshots / s.kills) * 100) : 0;
    const by = s.byType || {}, top = Math.max(1, ...Object.values(by));
    const types = TYPE_ORDER.filter((k) => by[k]).map((k) => `<div><span>${TYPE_NAMES[k]}</span><i style="--w:${(by[k] / top).toFixed(3)}"></i><b>${by[k]}</b></div>`).join('');
    const nw = s.isNew || {}, best = s.best, NEW = '<i class="mn-new">新紀錄</i>';
    const rec = best ? `<div class="mn-best"><span>本機最佳</span>分數<b>${(best.score || 0).toLocaleString('en-US')}</b>波數<b>${best.round || 0}</b>擊殺<b>${best.kills || 0}</b>連殺<b>${best.streak || 0}</b>${best.runs ? `<em>共 ${best.runs} 場</em>` : ''}</div>` : '';
    $('deadinfo').innerHTML = `
      <div class="mn-round">你撐到第<b>${s.round}</b>波${nw.round ? NEW : ''}</div>
      <div class="mn-score">分數<b>${(s.score || 0).toLocaleString('en-US')}</b>${nw.score ? NEW : ''}</div>
      <div class="mn-stats">
        <div><b>${s.kills}</b><small>擊殺${nw.kills ? NEW : ''}</small></div>
        <div><b>${s.headshots}<em>${hp}%</em></b><small>爆頭</small></div>
        <div><b>${Math.round((s.accuracy || 0) * 100)}%</b><small>命中率<em>${s.hits || 0}/${s.shots || 0}</em></small></div>
        <div><b>${mmss(s.time || 0)}</b><small>存活時間</small></div>
        <div><b>${s.bestStreak}</b><small>最高連殺${nw.streak ? NEW : ''}</small></div>
        <div><b>${s.earned}</b><small>賺到的錢</small></div>
      </div>
      ${types ? `<div class="mn-types">${types}</div>` : ''}
      ${rec}`;
    this.ui.overlay('dead', true);
  }

  // 暫停時:顯示這一場的進度
  onPause(on) {
    if (!on && this.panelOpen) this.closePanel();
    const g = this.game, el = $('pauseRun');
    if (!on || !g || !el) return;
    const S = g.stats || {};
    const L = g.lastRound; // [N6] 上一波的數字只在這裡看(一波結束的橫幅不講分數)
    const last = L ? `<br><small>第 ${L.n} 波：擊殺 <b>${L.kills}</b> · 爆頭 <b>${L.heads}</b> · 命中率 <b>${L.acc}%</b> · 用時 <b>${L.time}</b>${L.bonus ? ` · 清場 <b>+${L.bonus}</b>` : ''}${L.cleanBonus ? ` · 毫髮無傷 <b>+${L.cleanBonus}</b>` : ''}</small>` : '';
    const dn = g.diff?.().name; // [w4] 目前的難度
    el.innerHTML = g.state === 'playing' ? `${dn ? `${esc(dn)} · ` : ''}第 <b>${g.round || 1}</b> 波 · 擊殺 <b>${S.kills || 0}</b> · 分數 <b>${(S.score || 0).toLocaleString('en-US')}</b> · 錢 <b>${g.player?.coins || 0}</b>${last}` : '';
  }

  // ---------- 面板 ----------
  _panel() {
    const el = (this.panelEl = document.createElement('div'));
    el.id = 'mnpanel';
    el.innerHTML = '<div class="mp-card"><div class="mp-hd"><h2></h2><button class="x">返回 Esc</button></div><div class="mp-bd"></div><div class="mp-ft"></div></div>';
    document.body.appendChild(el);
    this.pTitle = el.querySelector('h2');
    this.pBody = el.querySelector('.mp-bd');
    this.pFoot = el.querySelector('.mp-ft');
    el.querySelector('.x').addEventListener('click', () => this.closePanel());
    el.addEventListener('mousedown', (e) => { if (e.target === el) this.closePanel(); });
    el.addEventListener('click', (e) => e.stopPropagation());
    settings.on(() => { if (this.panelOpen === 'settings') this._syncSettings(); });
  }

  openPanel(kind) {
    this.panelOpen = kind;
    this.panelEl.classList.add('on');
    this.panelEl.dataset.kind = kind;
    this.pBody.scrollTop = 0;
    if (kind === 'settings') this._renderSettings();
    else if (kind === 'help') this._renderHelp();
    else this._renderCredits();
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = null;
    this.panelEl.classList.remove('on');
    sfx.uiClick();
  }

  _renderSettings() {
    this.pTitle.textContent = '設定';
    this.pBody.innerHTML = SETTINGS.map((r) => {
      if (r[0] === 'sec') return `<div class="mp-sec">${r[1]}</div>`;
      const [type, key, label] = r;
      const note = type === 'range' ? r[7] : type === 'toggle' ? r[3] : type === 'seg' ? r[4] : type === 'btn' ? r[4] : '';
      const lab = `<label>${label}${note ? `<small>${note}</small>` : ''}</label>`;
      if (type === 'range') return `<div class="mp-row" data-k="${key}">${lab}<input type="range" min="${r[3]}" max="${r[4]}" step="${r[5]}" aria-label="${label}" /><output></output></div>`;
      if (type === 'toggle') return `<div class="mp-row" data-k="${key}">${lab}<button class="mp-tog" aria-label="${label}"></button><output></output></div>`;
      if (type === 'btn') return `<div class="mp-row" data-k="${key}">${lab}<button class="mp-act">${r[3]}</button><output></output></div>`;
      return `<div class="mp-row" data-k="${key}">${lab}<div class="mp-seg">${r[3].map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div><output></output></div>`;
    }).join('') + '<div class="mp-note">操作、音量與提示設定存在這台電腦的瀏覽器；畫質由效能模組管理（第一次啟動時依顯示卡自動挑選）。按 F3 可以看即時幀率。</div>';
    this.pFoot.innerHTML = '<button data-act="reset">恢復預設</button><button data-act="done">完成</button>';
    this.pFoot.querySelector('[data-act="reset"]').onclick = () => { settings.reset(); sfx.uiClick(); };
    this.pFoot.querySelector('[data-act="done"]').onclick = () => this.closePanel();
    for (const row of this.pBody.querySelectorAll('.mp-row')) {
      const k = row.dataset.k, def = SETTINGS.find((r) => r[1] === k);
      const input = row.querySelector('input'), tog = row.querySelector('.mp-tog'), seg = row.querySelector('.mp-seg'), act = row.querySelector('.mp-act');
      if (input) input.addEventListener('input', () => settings.set(k, def[5] >= 1 ? Math.round(+input.value) : +input.value));
      if (tog) tog.addEventListener('click', () => { settings.set(k, !settings.get(k)); sfx.uiClick(); });
      if (seg) seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { settings.set(k, b.dataset.v); sfx.uiClick(); } });
      if (act && k === 'tipsReset') act.addEventListener('click', () => { this.ui.tips?.reset(); sfx.uiClick(); act.textContent = '已重設'; act.disabled = true; });
    }
    this._syncSettings();
  }

  _syncSettings() {
    const det = settings.detected();
    for (const row of this.pBody.querySelectorAll('.mp-row')) {
      const k = row.dataset.k, v = settings.get(k), def = SETTINGS.find((r) => r[1] === k);
      const input = row.querySelector('input'), tog = row.querySelector('.mp-tog'), seg = row.querySelector('.mp-seg'), out = row.querySelector('output');
      if (input) { if (+input.value !== v) input.value = v; out.textContent = def[6](v); }
      if (tog) { tog.classList.toggle('on', !!v); out.textContent = v ? '開' : '關'; }
      if (seg) { for (const b of seg.children) b.classList.toggle('on', b.dataset.v === v); out.textContent = k === 'preset' && det ? `自動：${PRESET_NAME[det] || det}` : ''; }
    }
  }

  _renderHelp() {
    this.pTitle.textContent = '操作說明';
    this.pBody.innerHTML = `<div class="mp-sec">按鍵</div>${keyGrid([...KEYS, ...KEYS_MP], 'mp-keys')}
      <div class="mp-note">蹲下用 C（不用 Ctrl，避免誤按 Ctrl+W 關掉分頁）。巴雷特開鏡時按住 Shift 屏息。</div>
      <div class="mp-sec">求生守則</div><ul class="mp-tips">${TIPS.map((t) => `<li>${t}</li>`).join('')}</ul>`;
    this.pFoot.innerHTML = '<span></span><button data-act="done">知道了</button>';
    this.pFoot.querySelector('[data-act="done"]').onclick = () => this.closePanel();
  }

  // 製作與授權:讀取 public/credits/CREDITS.md(合併後的完整署名清單),以簡易 Markdown 顯示
  _renderCredits() {
    this.pTitle.textContent = '製作與授權';
    const base = import.meta.env?.BASE_URL || '/';
    this.pBody.innerHTML = `<div class="mp-cred">
      <h4>遊戲</h4><p>《等天光》（Before Daybreak）— 網頁 3D 恐怖射擊。程式、關卡、介面、程式生成的貼圖、模型與音效合成。</p><p>謹以此紀念 1999 年與 2003 年，所有守在第一線的人。</p>
      <h4>引擎與函式庫</h4><p>three.js（MIT）· Vite（MIT）· Rapier 物理引擎 @dimforge/rapier3d-compat（Apache-2.0）· ws（MIT）</p>
      <h4>外部素材</h4><p>只使用 CC0、CC-BY（另有一個 CC BY-SA 的錄音）與 MIT 授權的素材，完整署名如下（<a href="${base}credits/CREDITS.md" target="_blank" rel="noopener">開啟 CREDITS.md</a>）。</p>
      <div class="mp-md">正在讀取授權清單…</div></div>`;
    this.pFoot.innerHTML = '<span></span><button data-act="done">關閉</button>';
    this.pFoot.querySelector('[data-act="done"]').onclick = () => this.closePanel();
    const box = this.pBody.querySelector('.mp-md');
    const tryFetch = async (names) => {
      for (const n of names) {
        try {
          const r = await fetch(`${base}credits/${n}`);
          const t = r.ok ? await r.text() : '';
          if (t && !/^\s*</.test(t)) return t; // 拿到 HTML(找不到檔案時的首頁)就略過
        } catch { /* 略過 */ }
      }
      return '';
    };
    tryFetch(['CREDITS.md']).then((t) => { if (box.isConnected) { if (t) box.innerHTML = md(t); else box.textContent = '無法讀取授權清單（credits/CREDITS.md）。'; } });
  }
}

// 簡易 Markdown → HTML(標題、清單、粗體、連結、行內程式碼;先跳脫 HTML)
function md(src) {
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s((])(https?:\/\/[^\s)<,。、)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = [];
  let list = false;
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line), li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!li && list) { out.push('</ul>'); list = false; }
    if (h) out.push(`<h${Math.min(5, h[1].length + 2)}>${inline(h[2])}</h${Math.min(5, h[1].length + 2)}>`);
    else if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); }
    else if (/^\s*\|/.test(line)) { // 表格列:欄位以「·」串起來(略過 |---| 分隔列)
      const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()).filter((c) => c && !/^:?-+:?$/.test(c));
      if (cells.length) out.push(`<p class="tb">${inline(cells.join(' · '))}</p>`);
    } else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}
