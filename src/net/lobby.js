import './lobby.css';
import { NetClient } from './client.js';
import { NetSession } from './session.js';
import { survivorVariant, survivorReady } from '../zombies/model.js';
import { loadSurvivors } from '../zombies/realistic.js';
import { resume as resumeAudio, sfx } from '../audio.js';

// 主選單的多人入口:暱稱、建立房間(合作生存 / 對戰死鬥與選項)、輸入代碼加入、公開房間列表、
// 房間等待畫面(玩家列表、準備、房主開始/踢人/改設定、聊天、邀請連結),並在開始時建立 NetSession。
const NICK = 'hz.nick';
const SLOT_COLORS = ['#e0b24a', '#5ab0ff', '#4cd964', '#ff7a5a', '#c07aff', '#ffd84a', '#5ae0d0', '#ff5aa8'];
const MODE_NAME = { coop: '合作生存', pvp: '對戰死鬥' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 對外介面(主選單用):window.__net = lobby
//   lobby.open(mode)      開啟大廳;mode = 'coop' | 'pvp' 時預先選好建立房間的模式(已在房間裡就回到房間畫面)
//   lobby.openJoin(code)  開啟大廳並加入指定房間(網址 ?room=XXXXXX 也會自動呼叫)
//   lobby.close()         關閉大廳(不離開房間)
//   lobby.inMatch         是否在連線對局中
// 主選單沒有自己的「合作 / 對戰」入口時,才會在 #menuModes 放一個「多人連線」按鈕(#mp-entry)
export function initNet(game) {
  const lobby = new Lobby(game);
  lobby.mountEntry();
  window.__net = lobby;
  return lobby;
}

class Lobby {
  constructor(game) {
    this.g = game;
    this.client = new NetClient();
    this.view = 'home';
    this.room = null;
    this.you = -1;
    this.session = null;
    this.mode = 'coop';
    this.rooms = [];
    this.chatLog = [];
    this.bound = false;
    this.gesture = 0;
  }

  nick() {
    let n = '';
    try { n = localStorage.getItem(NICK) || ''; } catch { /* 忽略 */ }
    return n || `阿孫${String(Math.floor(Math.random() * 900) + 100)}`;
  }
  saveNick(n) { try { localStorage.setItem(NICK, n); } catch { /* 忽略 */ } }

  mountEntry() {
    if (!document.querySelector('#menu [data-mode]')) {
      const btn = document.createElement('button');
      const modes = document.getElementById('menuModes');
      btn.className = modes ? 'mn-btn' : 'btn';
      btn.id = 'mp-entry';
      btn.innerHTML = '多人連線<small>合作生存 · 對戰死鬥 · 和朋友一起玩</small>';
      btn.onclick = () => { sfx.uiClick?.(); this.open(); };
      if (modes) modes.appendChild(btn);
      else document.getElementById('startBtn')?.insertAdjacentElement('afterend', btn);
    }
    const el = (this.el = document.createElement('div'));
    el.id = 'mp-lobby';
    el.innerHTML = '<div class="box"></div>';
    document.body.appendChild(el);
    this.box = el.querySelector('.box');
    el.addEventListener('keydown', (e) => e.stopPropagation()); // 打字時不觸發遊戲按鍵
    el.addEventListener('keyup', (e) => e.stopPropagation());
    const code = new URLSearchParams(location.search).get('room');
    if (code) setTimeout(() => this.openJoin(code), 300);
  }

  get inMatch() { return !!this.session; }

  // 開啟大廳;mode = 'coop' | 'pvp':預先選好建立房間的模式
  open(mode) {
    if (mode === 'coop' || mode === 'pvp') { if (!this.room) this.mode = mode; }
    else if (typeof mode === 'string' && /^[A-Za-z0-9]{6}$/.test(mode)) { this.openJoin(mode); return; } // 舊的呼叫方式:open(房間代碼)
    this.show(null);
  }
  openJoin(code) { this.show(String(code || '')); }
  show(code) {
    resumeAudio();
    this.el.classList.add('on');
    if (!this.room) this.view = 'home';
    this.render();
    this.connect().then(() => {
      if (code && !this.room) this.join(code);
      else if (this.view === 'home') this.client.send('list');
    }).catch(() => {});
  }
  close() {
    this.el.classList.remove('on');
    clearInterval(this.listTimer);
    this.listTimer = null;
  }

  connect() {
    if (this.client.open) return Promise.resolve();
    if (this._connecting) return this._connecting;
    this.setStatus('連線中…');
    this._connecting = this.client.connect(this.nick()).then(() => {
      this._connecting = null;
      this.bindClient();
      this.setStatus('已連線');
      if (!this.listTimer) this.listTimer = setInterval(() => this.tick(), 1000);
    }).catch((e) => {
      this._connecting = null;
      if (/更新/.test(e.message)) this.versionMsg();
      else this.msg(`無法連線到多人伺服器（${e.message}）。請稍後再試。`);
      this.setStatus('離線');
      throw e;
    });
    return this._connecting;
  }

  tick() {
    const c = this.client;
    if (this.el.classList.contains('on')) {
      this.setStatus(c.open ? `已連線 · 延遲 ${Math.round(c.rtt)}ms` : c.status === 'reconnecting' ? '重新連線中…' : '離線');
      if (this.view === 'home' && c.open && (this._lt = (this._lt || 0) + 1) % 3 === 0) c.send('list');
    }
  }

  bindClient() {
    if (this.bound) return;
    this.bound = true;
    const c = this.client;
    c.on('rooms', (m) => { this.rooms = m.list; if (this.view === 'home') this.renderList(); });
    c.on('joined', (m) => {
      if (m.resumed && this.session) return; // 斷線重連:比賽繼續,由 session 處理
      this.room = m.room;
      this.you = m.you;
      this.view = 'room';
      this.chatLog = [];
      this.sys(`你加入了房間 ${m.room.code}`);
      if (m.room.state === 'playing' && !this.session) { this.startMatch({ room: m.room, match: m.room.match, seed: m.room.matchSeed || 0, mapId: m.room.mapId, late: true }); return; }
      this.render();
      this.prebuild();
      history.replaceState(null, '', `${location.pathname}?room=${m.room.code}`);
    });
    c.on('peer', (m) => {
      if (!this.room) return;
      const list = this.room.players, i = list.findIndex((p) => p.id === m.p.id);
      if (i >= 0) list[i] = m.p; else { list.push(m.p); this.sys(`${m.p.name} 加入了房間`); sfx.playerJoin?.(); }
      this.refreshRoom();
      this.prebuild();
    });
    c.on('left', (m) => {
      if (!this.room) return;
      const p = this.room.players.find((q) => q.id === m.id);
      this.room.players = this.room.players.filter((q) => q.id !== m.id);
      if (p) this.sys(`${p.name} 離開了房間`);
      this.refreshRoom();
    });
    c.on('host', (m) => { if (this.room) { this.room.host = m.id; this.refreshRoom(); } });
    c.on('room', (m) => { if (this.room) { this.room = m.room; this.refreshRoom(); } });
    c.on('pings', (m) => { if (!this.room) return; for (const [id, rtt] of m.r) { const p = this.room.players.find((q) => q.id === id); if (p) p.rtt = rtt; } this.refreshRoom(); });
    c.on('chat', (m) => { this.chatLog.push({ name: m.name, text: m.text }); if (this.chatLog.length > 60) this.chatLog.shift(); this.renderChat(); });
    c.on('start', (m) => this.startMatch(m));
    c.on('lobby', (m) => {
      if (this.room) this.room = m.room;
      this.endSession();
      this.view = 'room';
      this.el.classList.add('on');
      this.render();
    });
    c.on('kicked', (m) => { this.endSession(); this.room = null; this.view = 'home'; this.el.classList.add('on'); this.render(); this.msg(m.msg || '你被移出房間'); });
    c.on('error', (m) => {
      if (this.session) this.session.hud.feed(m.msg, 'warn');
      else this.msg(m.msg);
    });
    c.on('lost', (m) => {
      if (m?.reason === 'version') { this.endSession(); this.room = null; this.view = 'home'; this.el.classList.add('on'); this.render(); this.versionMsg(); return; }
      if (this.session) return; // session 會呼叫 matchLost
      this.room = null;
      this.view = 'home';
      this.render();
      this.msg('與伺服器的連線中斷');
    });
  }

  // ---------- 動作 ----------
  create() {
    const n = this.readNick();
    const q = (id) => this.box.querySelector('#' + id);
    const settings = this.mode === 'pvp'
      ? { zombies: q('mp-zomb')?.checked, kills: Number(q('mp-kills')?.value || 20), minutes: Number(q('mp-mins')?.value || 8) }
      : { late: q('mp-late')?.checked !== false };
    this.client.send('name', { name: n });
    this.client.send('create', { mode: this.mode, pub: q('mp-pub')?.checked !== false, settings });
  }
  join(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) { this.msg('房間代碼是 6 碼英數字'); return; }
    this.client.send('name', { name: this.readNick() });
    this.client.send('join', { code: c });
  }
  readNick() {
    const inp = this.box.querySelector('.nick');
    const n = (inp ? inp.value : this.nick()).trim().slice(0, 16) || this.nick();
    this.saveNick(n);
    this.client.name = n;
    return n;
  }
  ready() {
    const me = this.room?.players.find((p) => p.id === this.you);
    this.client.send('ready', { on: !me?.ready });
    sfx.uiClick?.();
  }
  start() {
    this.gesture = performance.now();
    this.client.send('start', { data: {} });
  }
  again() {
    this.gesture = performance.now();
    this.client.send('start', { data: {} });
  }
  backToRoom() {
    const host = this.room && this.room.host === this.you;
    if (host && this.room.state === 'playing') this.client.send('lobby');
    this.endSession();
    this.view = this.room ? 'room' : 'home';
    this.el.classList.add('on');
    this.render();
  }
  leaveRoom() {
    this.endSession();
    this.client.send('leave');
    this.room = null;
    this.view = 'home';
    history.replaceState(null, '', location.pathname);
    this.el.classList.add('on');
    this.render();
    this.client.send('list');
  }
  matchLost(reason) {
    this.endSession();
    this.room = null;
    this.view = 'home';
    this.el.classList.add('on');
    this.render();
    this.msg(reason);
    if (!this.client.open) { this.bound = this.bound && this.client.status !== 'closed'; }
  }

  startMatch(m) {
    if (this.session) { this.session.stop(); this.session = null; }
    this.room = m.room;
    this.room.state = 'playing';
    this.close();
    document.getElementById('menu')?.classList.remove('on');
    const g = this.g;
    // 多地圖(之後):m.mapId / m.seed 在這裡就已經到了,可以先 loadMap(mapId, seed) 再建 NetSession
    const s = new NetSession(g, this.client, this, { room: m.room, you: this.you, match: m.match, seed: m.seed, mapId: m.mapId ?? m.room.mapId ?? null, late: !!m.late });
    this.session = s;
    s.start();
    s.hud.chatLine('', `房間 ${m.room.code} · ${MODE_NAME[m.room.mode]} · Tab 計分板 · Enter 聊天`, false, true);
    // 有使用者手勢(房主按開始)就直接鎖定滑鼠;其他人顯示「點擊進入」
    let locked = false;
    if (performance.now() - this.gesture < 4000) {
      try { const r = g.canvas.requestPointerLock(); locked = true; if (r?.catch) r.catch(() => { g.paused = true; g.ui.overlay('pause', true); }); } catch { locked = false; }
    }
    if (!locked) { g.paused = true; g.ui.overlay('pause', true); }
  }
  endSession() {
    if (this.session) { this.session.stop(); this.session = null; }
    if (document.pointerLockElement) document.exitPointerLock();
    this.g.ui.overlay('pause', false);
    this.g.ui.overlay('dead', false);
    document.getElementById('menu')?.classList.add('on');
  }

  // 預先建好房間裡每個座位的角色模型(每幀一個,避免開局卡頓)
  prebuild() {
    loadSurvivors(); // 寫實的倖存者模型(進房間才下載)
    if (this._pb) return;
    const step = () => {
      this._pb = null;
      if (!this.room) return;
      const slots = this.room.players.map((p) => p.id).concat([0, 1, 2, 3]);
      const next = slots.find((i) => !survivorReady(i));
      if (next === undefined) return;
      survivorVariant(next);
      this._pb = requestAnimationFrame(step);
    };
    this._pb = requestAnimationFrame(step);
  }

  // ---------- 畫面 ----------
  setStatus(t) { const s = this.box.querySelector('.status'); if (s) s.textContent = t; }
  // 伺服器已更新(協定版本不同):請重新整理
  versionMsg() {
    const m = this.box.querySelector('.msg');
    if (!m) return;
    m.innerHTML = '遊戲已更新到新版本，請重新整理頁面。 <button class="big" id="mp-reload">重新整理</button>';
    m.querySelector('#mp-reload').onclick = () => location.reload();
  }
  msg(t, ok = false) { const m = this.box.querySelector('.msg'); if (m) { m.textContent = t || ''; m.classList.toggle('ok', ok); } }
  sys(t) { this.chatLog.push({ sys: true, text: t }); if (this.chatLog.length > 60) this.chatLog.shift(); this.renderChat(); }

  render() {
    if (this.view === 'room' && this.room) this.renderRoom();
    else this.renderHome();
  }

  renderHome() {
    const pvp = this.mode === 'pvp';
    this.box.innerHTML = `
      <h2>多人連線 <small class="status"></small></h2>
      <div class="row"><label>暱稱</label><input type="text" class="nick" maxlength="16" value="${esc(this.nick())}" /></div>
      <h3>建立房間</h3>
      <div class="modes">
        <button class="mode ${pvp ? '' : 'sel'}" data-m="coop"><b>合作生存</b><span>2~4 人 · 一起撐過殭屍潮<br />倒地 30 秒內隊友可按住 E 救援，全員倒地才結束</span></button>
        <button class="mode ${pvp ? 'sel' : ''}" data-m="pvp"><b>對戰死鬥</b><span>2~8 人 · 各自為戰，出生時選主武器<br />先到擊殺上限或時間到結束，可加入殭屍騷擾（非正史）</span></button>
      </div>
      <div class="opts">
        <label><input type="checkbox" id="mp-pub" checked /> 公開房間</label>
        ${pvp ? `<label><input type="checkbox" id="mp-zomb" /> 殭屍騷擾</label>
          <label>擊殺上限 <select id="mp-kills"><option>10</option><option selected>20</option><option>30</option></select></label>
          <label>時間 <select id="mp-mins"><option value="5">5 分鐘</option><option value="8" selected>8 分鐘</option><option value="12">12 分鐘</option></select></label>`
    : '<label><input type="checkbox" id="mp-late" checked /> 允許中途加入</label>'}
      </div>
      <div class="row" style="margin-top:14px"><button class="big" id="mp-create">建立房間</button></div>
      <h3>加入房間</h3>
      <div class="row"><input type="text" class="code" maxlength="6" placeholder="代碼" /><button id="mp-join">加入</button></div>
      <h3>公開房間</h3>
      <div class="list"></div>
      <div class="msg"></div>
      <div class="foot"><span class="help">Tab 計分板 · Enter 聊天 · 合作模式按 N 準備下一波</span><button class="grey" id="mp-back">返回主選單</button></div>`;
    const q = (s) => this.box.querySelector(s);
    for (const b of this.box.querySelectorAll('.mode')) b.onclick = () => { this.readNick(); this.mode = b.dataset.m; this.renderHome(); this.renderList(); };
    q('#mp-create').onclick = () => this.connect().then(() => this.create()).catch(() => {});
    q('#mp-join').onclick = () => this.connect().then(() => this.join(q('.code').value)).catch(() => {});
    q('.code').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('#mp-join').click(); });
    q('.nick').addEventListener('change', () => { const n = this.readNick(); if (this.client.open) this.client.send('name', { name: n }); });
    q('#mp-back').onclick = () => this.close();
    this.renderList();
    this.tick();
  }

  renderList() {
    const list = this.box.querySelector('.list');
    if (!list) return;
    if (!this.rooms.length) { list.innerHTML = '<div class="empty">目前沒有公開房間 · 建立一個吧</div>'; return; }
    list.innerHTML = this.rooms.map((r) => `<div class="r" data-c="${esc(r.code)}"><span class="c">${esc(r.code)}</span><span>${esc(r.name)}</span><span>${MODE_NAME[r.mode] || r.mode}</span><span>${r.n}/${r.max}</span><span class="st">${r.state === 'playing' ? '遊戲中' : '等待中'}${r.n >= r.max ? ' · 已滿' : ''}</span></div>`).join('');
    for (const row of list.querySelectorAll('.r')) row.onclick = () => this.join(row.dataset.c);
  }

  renderRoom() {
    const r = this.room, host = r.host === this.you;
    const S = r.settings || {};
    const settings = r.mode === 'pvp'
      ? (host ? `<label><input type="checkbox" id="mp-s-zomb" ${S.zombies ? 'checked' : ''} /> 殭屍騷擾</label>
          <label>擊殺上限 <select id="mp-s-kills">${[10, 15, 20, 30].map((v) => `<option ${v === S.kills ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>時間 <select id="mp-s-mins">${[5, 8, 12, 15].map((v) => `<option value="${v}" ${v === S.minutes ? 'selected' : ''}>${v} 分鐘</option>`).join('')}</select></label>`
        : `<span>擊殺上限 ${S.kills} · ${S.minutes} 分鐘 · ${S.zombies ? '有殭屍騷擾' : '無殭屍'}</span>`)
      : (host ? `<label><input type="checkbox" id="mp-s-late" ${S.late !== false ? 'checked' : ''} /> 允許中途加入</label>` : `<span>${S.late !== false ? '允許中途加入' : '不允許中途加入'}</span>`);
    this.box.innerHTML = `
      <div class="rhead"><h2><span>房間<span class="roomcode">${esc(r.code)}</span></span></h2>
        <div class="meta"><small class="info"></small><span class="row"><span class="status"></span><button class="grey" id="mp-copy">複製邀請連結</button></span></div></div>
      <div class="cols">
        <div>
          ${host ? `<h3>模式</h3><div class="modes"><button class="mode ${r.mode === 'coop' ? 'sel' : ''}" data-m="coop"><b>合作生存</b><span>2~4 人 · 一起撐過屍潮</span></button><button class="mode ${r.mode === 'pvp' ? 'sel' : ''}" data-m="pvp"><b>對戰死鬥</b><span>2~8 人 · 各自為戰</span></button></div>` : ''}
          <h3>設定</h3><div class="opts">${settings}<label><input type="checkbox" id="mp-s-pub" ${r.pub ? 'checked' : ''} ${host ? '' : 'disabled'} /> 公開房間</label></div>
          <h3>玩家</h3><div class="players"></div>
        </div>
        <div><h3>聊天</h3><div class="chatbox"><div class="log"></div><input type="text" maxlength="160" placeholder="聊天（Enter 送出）" /></div></div>
      </div>
      <div class="msg"></div>
      <div class="foot"><button class="red" id="mp-leave">離開房間</button><span class="help">${r.mode === 'pvp' ? '出生時選主武器 · Tab 計分板 · Enter 聊天' : '休息時到金水商行買東西 · N 準備下一波 · Tab 計分板'}</span><span class="row">${host ? '' : '<button id="mp-ready">準備</button>'}${host ? '<button class="big" id="mp-start">開始遊戲</button>' : ''}<button class="big" id="mp-rejoin" style="display:none">加入進行中的遊戲</button></span></div>`;
    const q = (s) => this.box.querySelector(s);
    q('#mp-copy').onclick = () => {
      const url = `${location.origin}${location.pathname}?room=${r.code}`;
      (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => this.msg('已複製邀請連結', true), () => this.msg(url, true));
    };
    q('#mp-leave').onclick = () => this.leaveRoom();
    if (q('#mp-ready')) q('#mp-ready').onclick = () => this.ready();
    if (host) q('#mp-start').onclick = () => this.start();
    q('#mp-rejoin').onclick = () => this.startMatch({ room: this.room, match: this.room.match, seed: this.room.matchSeed || 0, mapId: this.room.mapId, late: true });
    const send = (patch) => this.client.send('settings', patch);
    for (const b of this.box.querySelectorAll('.mode')) b.onclick = () => send({ mode: b.dataset.m });
    const cs = (id, fn) => { const e = q('#' + id); if (e) e.onchange = fn; };
    cs('mp-s-zomb', (e) => send({ settings: { zombies: e.target.checked } }));
    cs('mp-s-kills', (e) => send({ settings: { kills: Number(e.target.value) } }));
    cs('mp-s-mins', (e) => send({ settings: { minutes: Number(e.target.value) } }));
    cs('mp-s-late', (e) => send({ settings: { late: e.target.checked } }));
    cs('mp-s-pub', (e) => send({ pub: e.target.checked }));
    const ci = q('.chatbox input');
    ci.addEventListener('keydown', (e) => { if (e.key === 'Enter' && ci.value.trim()) { this.client.send('chat', { text: ci.value.trim() }); ci.value = ''; } });
    this.refreshRoom();
    this.renderChat();
    this.tick();
  }

  refreshRoom() {
    if (this.view !== 'room' || !this.room || !this.el.classList.contains('on')) return;
    const r = this.room, host = r.host === this.you;
    const box = this.box.querySelector('.players');
    if (!box) return;
    let html = '';
    for (let i = 0; i < r.max; i++) {
      const p = r.players.find((q) => q.id === i);
      if (!p) { html += `<div class="pl empty"><span class="dot" style="background:${SLOT_COLORS[i]}"></span><span class="nm">空位</span></div>`; continue; }
      html += `<div class="pl"><span class="dot" style="background:${SLOT_COLORS[i]}"></span><span class="nm">${esc(p.name)}${p.id === this.you ? '（你）' : ''}</span>
        ${p.id === r.host ? '<span class="tag host">房主</span>' : ''}${p.conn === false ? '<span class="tag off">斷線</span>' : p.ready ? '<span class="tag ready">已準備</span>' : ''}
        <span class="ping">${p.rtt ? `${p.rtt}ms` : ''}</span>${host && p.id !== this.you ? `<button class="grey kick" data-id="${p.id}">踢出</button>` : ''}</div>`;
    }
    box.innerHTML = html;
    box.classList.toggle('two', r.max > 4);
    for (const b of box.querySelectorAll('.kick')) b.onclick = () => this.client.send('kick', { id: Number(b.dataset.id) });
    const info = this.box.querySelector('.info');
    if (info) info.textContent = `${MODE_NAME[r.mode]} · ${r.players.length}/${r.max} 人${r.state === 'playing' ? ' · 遊戲進行中' : ''}`;
    const me = r.players.find((p) => p.id === this.you);
    const rb = this.box.querySelector('#mp-ready');
    if (rb) { rb.textContent = me?.ready ? '取消準備' : '準備'; rb.classList.toggle('on', !!me?.ready); rb.style.display = r.state === 'playing' ? 'none' : ''; }
    const sb = this.box.querySelector('#mp-start');
    if (sb) {
      const others = r.players.filter((p) => p.id !== this.you && p.conn !== false);
      const allReady = others.every((p) => p.ready);
      sb.disabled = (r.mode === 'pvp' && others.length < 1) || r.state === 'playing';
      sb.textContent = allReady ? '開始遊戲' : '開始遊戲（有人未準備）';
    }
    const rj = this.box.querySelector('#mp-rejoin');
    if (rj) rj.style.display = r.state === 'playing' && !this.session ? '' : 'none';
  }

  renderChat() {
    const log = this.box.querySelector('.chatbox .log');
    if (!log) return;
    log.innerHTML = this.chatLog.map((c) => (c.sys ? `<div class="sys">${esc(c.text)}</div>` : `<div><b>${esc(c.name)}</b>${esc(c.text)}</div>`)).join('');
    log.scrollTop = log.scrollHeight;
  }
}
