// 音效與配樂:WebAudio 即時合成 + 錄音樣本(public/audio/,CC0 / CC-BY,署名見 public/credits/audio.md)。樣本缺少或載入失敗時一律退回合成版本。
// 架構:audio/core(混音匯流排、分區殘響、可重用的 3D 聲道條、遮蔽、全域發聲上限與搶占、閒置時間烘焙)、audio/rooms(依區域尺寸算殘響)、
//       audio/samples + bank(樣本庫)、audio/foley(槍枝與動作擬音)、audio/steps(9 種地面的腳步、跳躍/落地)、audio/body(蹲下、喘息、手電筒)、
//       audio/voices(殭屍語音)、audio/ambience(區域環境音、定位循環音)、audio/weather(雨、雷)、audio/scares(驚嚇音)、
//       audio/ui(介面/商店/拾取/多人)、audio/music(程式配樂與配樂狀態)、audio/tracks(錄音配樂串流、刺擊)
//
// 給其他模組的介面(全部安全:AudioContext 未建立時不做事,任何合成錯誤也不往外丟):
//  武器  shot(id) dry(id?) reload(id, dur?, empty?) pump() switch(id?) adsIn(id?) adsOut(id?) casing(pos, surface, kind, bounce)
//        grenadePin() grenadeThrow() grenadeBounce(pos) explosion(pos, size) knifeSwing() knifeHit(pos, flesh) lowAmmo()
//  玩家  step(sprint, surface) jump(surface) land(speed, surface) crouch(down) flashlight(on) hurt(amount?) knock() armorHit()
//        hit() headshot() wall(pos, surface) setStamina(r, exhausted)(可省略:attachGame 後自動讀 player.stamina)
//  拾取  coin(i) pickupAmmo() pickupMed() pickupItem() pickupDeny() pickupLand(pos, kind) heal() armorEquip()
//  介面  buy() deny() shopOpen() shopClose() shopTab() shopHover() upgrade() cashRegister() shutter(pos, open) door(pos, kind)
//        uiClick() uiHover() countdown(n) roundStart() roundEnd()
//  殭屍  groan(type, pos) zAlert(type, pos) zAttack(type, pos) zPain(type, pos) zDie(type, pos) shriek(pos) roar(pos) gurgle(pos)
//        crawl(pos) bite(pos) zStep(type, pos, surface) stomp(pos) wallImpact(pos) thud(pos, heavy) spit(pos) splash(pos) sizzle(pos) burst(pos)
//  氣氛  scare(kind, pos)(kind 見 audio/scares.js 開頭)setZone(zoneId, mood) loopStart(key, kind, pos) loopStop(key)
//        thunder(dist, delay?) setRain(level, outdoorFactor?)(說明見 audio/weather.js 開頭)
//  劇情  radio(on, level?) pa(kind)('up'|'down'|'alert')tape(kind)('insert'|'play'|'stop'|'eject')(說明見 audio/story.js)
//  地圖  resetMap(world)(換地圖時呼叫;attachWorld/attachGame 傳入不同的 World 也會自動重設)defineMood(name, bed)(新地圖註冊自己的環境音床)
//  多人  playerJoin() playerLeave() chat() revive(pos?) downed(pos?) killConfirm() remoteShot(id, pos) remoteStep(pos, surface, sprint)
//  其他  listener(x, y, z, yaw) setMood(m) setTension(x) setHealth(r) ambient() attachGame(game) attachWorld(world)
//        setVolume(bus, v) getVolume(bus)(bus:'master' | 'music' | 'sfx' | 'voice',v 0..1,記在 localStorage)stats()
import { A, ensure, setListener, attach, setVolume, getVolume, muffle, hurtFilter, tick, poolInfo, liveCount, bakeStats, voiceCap, emit, stopPositional, setSpace, ZV, zvState, zvOcc, zvFade, acoustics, tone } from './audio/core.js';
import { zq, zflush } from './audio/zgate.js';
import { foley, prebakeFoley } from './audio/foley.js';
import { voices, prebakeVoices } from './audio/voices.js';
import { zvoices2 } from './audio/zvoices2.js';
import { startMusic, setMood, autoMood, setTension, setHealth, addPain, musicState } from './audio/music.js';
import { step, remoteStep, zStep, jump, land, prebakeSteps } from './audio/steps.js';
import { body, setBodyHealth, prebakeBody } from './audio/body.js';
import { ui } from './audio/ui.js';
import { scare, SCARE_KINDS } from './audio/scares.js';
import { setZone, loopStart, loopStop, startAmbience, ambState, LOOP_KINDS, resetAmbience, defineMood } from './audio/ambience.js';
import { radio, pa, tape, storyState, screech } from './audio/story.js';
import * as AMB from './audio/ambience.js';
import { thunder, setRain, rainState, rainGains, rainContext, rainReset, preloadRain } from './audio/weather.js';
import { folkCue, folkReset, folkState, folkPrebake, _folk, FS as folkFS } from './audio/folk.js';
import { trackState, resumeTracks, preloadStings, _trackX } from './audio/tracks.js';
import { roomInfo, resetRooms } from './audio/rooms.js';
import * as SM from './audio/samples.js';
import { glass } from './audio/glass.js';

// AudioContext 只能在使用者互動後建立/恢復;第一次互動(點擊、按鍵)就自動啟動,選單也聽得到配樂與環境音
let booted = false;
function boot() {
  if (booted || !A.ctx) return;
  booted = true;
  SM.startLoading();
  startAmbience();
  startMusic();
  preloadStings();
  // 閒置時間預先烘焙常用的合成層(不在遊戲當下建圖)
  setTimeout(() => { prebakeFoley(); prebakeSteps(); prebakeVoices(); prebakeBody(); }, 600);
  // 雨聲錄音在選單時就閒置載入(開始下雨時不會先聽到合成噪音或空白太久)
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 1500);
  idle(() => preloadRain(), { timeout: 4000 });
  // 民謠/配樂床:選單時閒置烘焙最常用的幾個(其他第一次用到時才烘焙)
  setTimeout(() => folkPrebake(['bed_chase', 'box_wcf', 'radio_ssk', 'hum_wcf', 'rec_fy1', 'bed_dread', 'bed_safe']), 9000);
}
export function resume() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().then(boot, () => {});
  else boot();
  resumeTracks();
}
if (typeof document !== 'undefined') {
  const unlock = () => { resume(); if (A.ctx && A.ctx.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(e, unlock, true); };
  for (const e of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(e, unlock, true);
}

// 包一層:沒有 context 時直接略過,任何合成錯誤也不往外丟
const safe = (fn) => (...args) => {
  if (!A.ctx) return;
  try { fn(...args); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio]', e); }
};
const always = (fn) => (...args) => { try { return fn(...args); } catch (e) { if (import.meta.env?.DEV) console.warn('[audio]', e); } };

let lastMood = null;
// 換地圖:區域殘響快取、環境音區域狀態、定位循環音、舊地圖上的定位聲音全部重設
function resetMap(world) {
  if (world) A.world = world;
  resetRooms();
  stopPositional();
  resetAmbience();
  if (A.ctx) setSpace('corridor');
}
export const sfx = {
  // ---- 武器 ----
  shot: safe((id) => foley.shot(id)),
  dry: safe((id) => foley.dry(id)),
  reload: safe((id, dur, empty) => foley.reload(id, dur, empty)), // dur:實際換彈秒數(對齊改裝後的速度);empty:空膛(要放槍機);霰彈槍每裝一發呼叫一次
  pump: safe(() => foley.pump()),
  switch: safe((id) => foley.switch(id)),
  adsIn: safe((id) => foley.adsIn(id)),
  adsOut: safe((id) => foley.adsOut(id)),
  casing: safe((pos, surface, kind, n) => foley.casing(pos, surface, kind, n)), // 實體彈殼每次彈跳:kind 'pistol'|'rifle'|'shell'
  grenadePin: safe(() => foley.grenadePin()),
  grenadeThrow: safe(() => foley.grenadeThrow()),
  grenadeBounce: safe((pos) => foley.grenadeBounce(pos)),
  explosion: safe((pos, size = 1) => foley.explosion(pos, size)),
  knifeSwing: safe(() => foley.knifeSwing()),
  knifeHit: safe((pos, flesh = true) => foley.knifeHit(pos, flesh)),
  lowAmmo: safe(() => ui.lowAmmo()),

  // ---- 玩家 ----
  step: safe((sprint = false, surface) => step(sprint, surface)),
  jump: safe((surface) => jump(surface)),
  land: safe((speed = 3, surface) => land(speed, surface)), // speed:落下速度 m/s
  crouch: safe((down = true) => body.crouch(down)),
  flashlight: safe((on = true) => body.flashlight(on)),
  setStamina: always((r, exhausted) => body.setStamina(r, exhausted)),
  hurt: safe((amount) => { foley.hurt(amount); addPain(0.5); }),
  knock: safe(() => { foley.knock(); addPain(0.7); }),
  armorHit: safe(() => foley.armorHit()),
  armorEquip: safe(() => ui.armorEquip()),
  heal: safe(() => ui.heal()),
  hit: safe(() => foley.hit()),
  headshot: safe(() => foley.headshot()),
  wall: safe((pos, surface) => foley.wall(pos, surface)), // pos/surface 可選:定位 + 依材質的彈著聲
  glass: safe((kind, pos, size, sprint) => glass(kind, pos, size, sprint)), // [physics] 玻璃:'crack'|'shatter'|'crumble'|'tinkle'|'break'|'crunch'(audio/glass.js)

  // ---- 拾取 / 商店 / 介面 ----
  coin: safe((i = 0) => ui.coin(i)),
  buy: safe(() => ui.buy()),
  deny: safe(() => ui.deny()),
  pickupAmmo: safe(() => ui.pickupAmmo()),
  pickupMed: safe(() => ui.pickupMed()),
  pickupDeny: safe(() => ui.pickupDeny()),
  pickupItem: safe(() => ui.pickupItem()),
  pickupLand: safe((pos, kind) => ui.pickupLand(pos, kind)),
  shopOpen: safe(() => ui.shopOpen()),
  shopClose: safe(() => ui.shopClose()),
  shopTab: safe(() => ui.shopTab()),
  shopHover: safe(() => ui.shopHover()),
  upgrade: safe(() => ui.upgrade()),
  cashRegister: safe(() => ui.cashRegister()),
  shutter: safe((pos, open = true) => ui.shutter(pos, open)),
  door: safe((pos, kind = 'creak') => ui.door(pos, kind)), // kind:'creak' | 'slam' | 'metal' | 'cell'
  uiClick: safe(() => ui.uiClick()),
  uiHover: safe(() => ui.uiHover()),
  countdown: safe((n) => ui.countdown(n)),
  roundStart: safe(() => { ui.roundStart(); autoMood('fight'); muffle(0, 0, 0.5); }),
  roundEnd: safe(() => { ui.roundEnd(); autoMood('break'); }),

  // ---- 殭屍語音(3D;位置物件會被即時跟隨;同一隻殭屍同時只發一個聲音) ----
  // 只有真的靠近才聽得到(可聽距離見 audio/core.js 的 ZV 表;隔牆/樓板更短),每幀最近的先發聲,同時發聲數有上限
  groan: safe((type, pos) => zq('groan', pos, () => voices.groan(type, pos))),
  zAlert: safe((type, pos) => zq('alert', pos, () => voices.alert(type, pos))), // 發現玩家
  zAttack: safe((type, pos) => zq('attack', pos, () => voices.attack(type, pos))),
  zPain: safe((type, pos) => zq('pain', pos, () => voices.pain(type, pos))),
  zDie: safe((type, pos) => zq('die', pos, () => voices.die(type, pos))),
  shriek: safe((pos) => zq('shriek', pos, () => voices.shriek(pos))),
  roar: safe((pos) => zq('roar', pos, () => voices.roar(pos))),
  gurgle: safe((pos) => zq('gurgle', pos, () => voices.gurgle(pos))),

  // ---- 殭屍動作(3D) ----
  crawl: safe((pos) => foley.crawl(pos)),
  bite: safe((pos) => foley.bite(pos)),
  zStep: safe((type, pos, surface) => zStep(type, pos, surface)),
  stomp: safe((pos) => foley.stomp(pos)),
  wallImpact: safe((pos) => foley.wallImpact(pos)),
  thud: safe((pos, heavy = false) => foley.thud(pos, heavy)),
  spit: safe((pos) => foley.spit(pos)),
  splash: safe((pos) => foley.splash(pos)),
  sizzle: safe((pos) => foley.sizzle(pos)),
  burst: safe((pos) => foley.burst(pos)),

  // ---- 驚嚇 / 環境 / 天氣(未建立 context 時也可呼叫,狀態會先記下) ----
  scare: safe((kind, pos) => scare(kind, pos)),
  setZone: always((zoneId, mood) => setZone(zoneId, mood)),
  loopStart: always((key, kind, pos) => loopStart(key, kind, pos)),
  loopStop: always((key) => loopStop(key)),
  thunder: safe((dist, delay) => thunder(dist, delay)),
  setRain: always((level, outdoorFactor) => setRain(level, outdoorFactor)),

  // ---- 劇情 ----
  radio: safe((on = true, level) => radio(on, level)),
  screech: safe((k = 0.6, long = false) => screech(k, long)), // 收音機的尖叫(src/story/radio.js)
  pa: safe((kind = 'up') => pa(kind)),
  tape: safe((kind = 'play') => tape(kind)),

  // ---- 多人 ----
  playerJoin: safe(() => ui.playerJoin()),
  playerLeave: safe(() => ui.playerLeave()),
  chat: safe(() => ui.chat()),
  revive: safe((pos) => ui.revive(pos)), // pos 可選:隊友(定位);不給 = 自己
  downed: safe((pos) => ui.downed(pos)),
  killConfirm: safe(() => ui.killConfirm()),
  remoteShot: safe((id, pos) => foley.shot(id, pos, true)),
  remoteStep: safe((pos, surface, sprint) => remoteStep(pos, surface, sprint)),

  // ---- 聆聽者 / 配樂 / 設定 ----
  listener: always((x, y, z, yaw) => { zflush(); setListener(x, y, z, yaw); }), // 新的一幀:先結算上一幀的殭屍語音請求
  setMood: always((m) => {
    if (m === 'dead' && lastMood && lastMood !== 'dead' && lastMood !== 'menu' && A.ctx) { // 死亡:最後一口氣 + 世界變悶
      const h = emit({ bus: 'sfx', prio: 9, room: 0.2, dur: 3 });
      if (h) SM.play('player.death', { h, g: 0.6 });
      muffle(0.6, 2.5, 3);
    } else if (lastMood === 'dead' && m !== 'dead') { muffle(0, 0, 0.5); hurtFilter(1); }
    lastMood = m;
    setMood(m);
  }),
  setTension: always((x) => setTension(x)),
  setHealth: always((r) => { setHealth(r); hurtFilter(r); setBodyHealth(r); }), // 玩家血量比例 0..1(低血量:心跳、世界變悶、顫抖的呼吸)
  ambient: safe(() => boot()),
  setVolume: always((bus, v) => setVolume(bus, v)), // bus:'master' | 'music' | 'sfx' | 'voice',v 0..1(記在 localStorage)
  getVolume: (bus) => getVolume(bus),
  // 建好 World 後呼叫一次:啟用視線遮蔽、樓層悶音、地面材質(彈殼/彈著/殭屍腳步)、自動區域判斷與依房間尺寸的殘響
  attachWorld: always((world) => { if (A.world && world && world !== A.world) resetMap(world); A.world = world || null; }),
  // 建好 Game 後呼叫一次(含 attachWorld):另外讀畫質預設(發聲上限/HRTF)、玩家狀態(蹲下、體力喘息)
  attachGame: always((game) => { A.game = game || null; const w = game && game.world; if (A.world && w && w !== A.world) resetMap(w); A.world = w || A.world; }),
  resetMap: always((world) => { rainReset(); folkReset(); resetMap(world); }),
  folk: safe((kind, pos) => folkCue(kind, pos)),
  defineMood: always((name, bed) => defineMood(name, bed)),
  ...gateZ(zvoices2(safe)), // [zombies-w3] 第三波新殭屍的語音與音效(src/audio/zvoices2.js;含潛行者的 zStep);叫聲類經過殭屍語音閘門
  // 除錯/效能面板用
  stats: () => (A.ctx ? { state: A.ctx.state, voices: liveCount(), cap: voiceCap(), zv: zvState(), pools: poolInfo(), bake: bakeStats(), samples: SM.stats(), stats: A.stats, music: musicState(), amb: ambState(), rain: rainState(), story: storyState() } : { state: 'none' }),
};

// 第三波新殭屍的叫聲(尖叫者、潛行者、束縛病患…)也走殭屍語音閘門:每幀最近的先發聲、超出可聽距離不排
function gateZ(o) {
  const M = { zScream: 'scream', zInhale: 'pain', zHiss: 'pain', zCharge: 'attack', zBreath: 'breath', zRespirator: 'breath' };
  for (const k in M) { const f = o[k]; if (typeof f === 'function') o[k] = (pos, ...a) => zq(M[k], pos, () => f(pos, ...a)); }
  return o;
}

// 除錯/測試用(OfflineAudioContext 量測)
export const _internal = { ZV, zvState, zflush, core: { emit, tone, acoustics, zvOcc, zvFade, setListener }, rain: { setRain, rainState, rainGains, rainContext, rainReset, thunder }, folk: { ..._folk, folkCue, folkReset, folkState, FS: folkFS }, trackX: _trackX, A, attach, foley, voices, ui, body, step, zStep, remoteStep, jump, land, scare, startMusic, startAmbience, tick, poolInfo, SM, ambState, trackState, AMB, musicState, roomInfo, SCARE_KINDS, LOOP_KINDS, thunder, setRain };
export { ix } from './audio/interact.js'; // 互動物件的機械音效(電話、開關、販賣機、鋼琴、門…;src/audio/interact.js)
export { ghost } from './audio/ghost.js'; // [ghost] 耳邊低語(雙耳)、頸後呼吸、刺擊、寂靜、天花板爬行等靈異音效(src/audio/ghost.js)

// 除錯/測試用(正式版也可在 console 操作;和 window.__game 一樣):window.__sfx.sfx.stats()、window.__sfx._internal
if (typeof window !== 'undefined') window.__sfx = { sfx, _internal };
