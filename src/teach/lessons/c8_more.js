import * as THREE from 'three';
import { override } from '../worldfx.js';
import { fmt, rnd, std, clamp } from './_util.js';

// 白噪音緩衝(槍聲、腳步用)
let noiseBuf = null;
function noise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// ===== 第 8 章 聲音、連線、效能 =====
export default [
  // ---------------------------------------------------------------- 46
  {
    id: 'synth', title: '用程式做聲音', say: '這款遊戲幾乎沒有錄音檔:槍聲、腳步、殭屍的低吼,都是程式<b>當場合成</b>的。',
    task: '播放「槍聲」,再自己調一個聲音來聽',
    fact: '聲音就是空氣來回震動的<b>波</b>:震得越快,聲音越高;波的形狀不同,聽起來就不同。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const ac = T.audio();
      const an = ac.createAnalyser();
      an.fftSize = 2048;
      an.connect(ac.destination);
      T.onDispose(() => an.disconnect());
      const buf = new Float32Array(an.fftSize);
      const P = T.panel({ w: 560, h: 220, place: 'center' });
      P.el.style.left = 'calc(50% + 120px)';
      let shape = 'sine', freq = 220, len = 0.6, playedGun = false, playedOwn = false;
      const out = (g0 = 0.3) => { const g = ac.createGain(); g.gain.value = g0; g.connect(an); return g; };
      const tone = () => {
        const t = ac.currentTime, g = out(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.02);
        g.gain.setValueAtTime(0.25, t + len * 0.7);
        g.gain.linearRampToValueAtTime(0, t + len);
        if (shape === 'noise') { const s = ac.createBufferSource(); s.buffer = noise(ac); s.connect(g); s.start(t); s.stop(t + len); }
        else { const o = ac.createOscillator(); o.type = shape; o.frequency.value = freq; o.connect(g); o.start(t); o.stop(t + len + 0.05); }
        playedOwn = true;
        if (playedGun) T.done();
      };
      const PRESET = {
        gun() { // 噪音一聲爆開 + 很快變小 + 低頻的「砰」
          const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = out(0);
          s.buffer = noise(ac); f.type = 'lowpass'; f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
          g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          s.connect(f).connect(g); s.start(t); s.stop(t + 0.4);
          const o = ac.createOscillator(), og = out(0); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
          og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(og); o.start(t); o.stop(t + 0.22);
          playedGun = true; if (playedOwn) T.done();
        },
        step() {
          const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = out(0);
          s.buffer = noise(ac); f.type = 'lowpass'; f.frequency.value = 500;
          g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          s.connect(f).connect(g); s.start(t); s.stop(t + 0.15);
        },
        groan() { // 低頻鋸齒波 + 慢慢抖動的音高 + 濾掉高音
          const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = out(0);
          o.type = 'sawtooth'; o.frequency.value = 85; lfo.frequency.value = 5.5; lg.gain.value = 9;
          lfo.connect(lg).connect(o.frequency);
          f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 0.5); f.frequency.linearRampToValueAtTime(250, t + 1.4); f.Q.value = 6;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25); g.gain.linearRampToValueAtTime(0, t + 1.5);
          o.connect(f).connect(g); o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
        },
        heart() {
          for (const [d, v] of [[0, 0.8], [0.22, 0.5]]) {
            const t = ac.currentTime + d, o = ac.createOscillator(), g = out(0);
            o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
            g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            o.connect(g); o.start(t); o.stop(t + 0.2);
          }
        },
      };
      T.code(`const osc = audio.createOscillator()
osc.type = '{shape}'          // 波的形狀
osc.frequency.value = {f}    // 每秒震幾次(Hz)
osc.start(); osc.stop(now + {len})`, {
        shape: { value: 'sine', options: ['sine', 'square', 'sawtooth', 'triangle', 'noise'] },
        f: { value: 220, min: 40, max: 1200, step: 10 },
        len: { value: 0.6, min: 0.1, max: 2, step: 0.1 },
      }, (v, k) => { shape = v.shape; freq = v.f; len = v.len; if (k) tone(); }, { title: '自己做一個聲音', hint: '改了就會播一次' });
      T.button('▶ 播放', tone, 'hot');
      T.button('槍聲', PRESET.gun);
      T.button('腳步', PRESET.step);
      T.button('殭屍低吼', PRESET.groan);
      T.button('心跳', PRESET.heart);
      return {
        update() {
          an.getFloatTimeDomainData(buf);
          const g = P.g;
          P.clear('#0a1416');
          g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.moveTo(0, 110); g.lineTo(560, 110); g.stroke();
          g.strokeStyle = '#5fe0a8'; g.lineWidth = 2; g.beginPath();
          for (let i = 0; i < 560; i++) { const v = buf[Math.floor((i / 560) * 1024)] || 0; const y = 110 - v * 180; i ? g.lineTo(i, y) : g.moveTo(i, y); }
          g.stroke(); g.lineWidth = 1;
          g.fillStyle = '#8fa8a1'; g.font = '12px system-ui'; g.fillText('聲波(示波器)', 10, 18);
        },
      };
    },
  },
  // ---------------------------------------------------------------- 47
  {
    id: 'pan', title: '立體聲:聲音從哪來', say: '左耳大聲,就是在左邊;越遠越小聲。打開聲音,拖著殭屍繞著你走(戴耳機效果最好)。',
    task: '把殭屍拖到你的<b>右邊、很近</b>的地方',
    fact: '遊戲裡的聲音還會被牆「擋住」變悶、在大廳裡會有回音 —— 所以戴耳機玩,可以聽出殭屍從哪裡來。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 480, H = 380, cx = W / 2, cy = H / 2 + 10;
      const P = T.panel({ w: W, h: H, place: 'center' });
      const ac = T.audio();
      let src = null;
      const pan = ac.createStereoPanner(), vol = ac.createGain(), f = ac.createBiquadFilter();
      vol.gain.value = 0;
      f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
      f.connect(vol).connect(pan).connect(ac.destination);
      const start = () => {
        if (src) return;
        const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = 90; lfo.frequency.value = 4.5; lg.gain.value = 10;
        lfo.connect(lg).connect(o.frequency);
        o.connect(f); o.start(); lfo.start();
        src = [o, lfo];
      };
      const stop = () => { if (src) { for (const n of src) n.stop(); src = null; } };
      T.onDispose(() => { stop(); pan.disconnect(); });
      let zx = cx - 150, zy = cy - 90, grab = false, on = false;
      T.toggle({ label: '播放聲音', value: false, on: (v) => { on = v; if (v) start(); else { vol.gain.value = 0; } } });
      T.stat('左右', () => { const p = clamp((zx - cx) / 160, -1, 1); return p < -0.15 ? '← 左邊' : p > 0.15 ? '右邊 →' : '中間'; });
      T.stat('音量', () => `${Math.round(clamp(1 - Math.hypot(zx - cx, zy - cy) / 200, 0.05, 1) * 100)}%`);
      P.on((type, x, y) => {
        if (type === 'down') grab = Math.hypot(x - zx, y - zy) < 30;
        else if (type === 'drag' && grab) { zx = clamp(x, 16, W - 16); zy = clamp(y, 16, H - 16); }
        else if (type === 'up') grab = false;
        P.cv.style.cursor = grab || Math.hypot(x - zx, y - zy) < 30 ? 'grab' : '';
      });
      return {
        update(dt, t) {
          const p = clamp((zx - cx) / 160, -1, 1), d = Math.hypot(zx - cx, zy - cy), v = clamp(1 - d / 200, 0.05, 1);
          pan.pan.value = p;
          if (on) vol.gain.value = 0.35 * v * v;
          f.frequency.value = 400 + 900 * v;
          if (p > 0.6 && d < 130) T.done();
          const g = P.g;
          P.clear('#0a1416');
          for (const r of [60, 120, 180]) { g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
          // 你(從上面看):頭 + 兩隻耳朵,耳朵亮度 = 那一邊的音量
          const L = v * clamp(1 - p, 0, 1), R = v * clamp(1 + p, 0, 1);
          g.fillStyle = '#4aa8ff'; g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fill();
          g.fillStyle = '#e8f1ec'; g.beginPath(); g.moveTo(cx - 6, cy - 20); g.lineTo(cx, cy - 32); g.lineTo(cx + 6, cy - 20); g.fill();
          for (const [s, a] of [[-1, L], [1, R]]) { g.fillStyle = `rgba(255,207,90,${0.2 + a * 0.8})`; g.beginPath(); g.ellipse(cx + s * 26, cy, 7, 12, 0, 0, 7); g.fill(); }
          g.fillStyle = '#cfe1da'; g.font = '12px system-ui'; g.textAlign = 'center'; g.fillText('你(往上看)', cx, cy + 44);
          // 聲波圈
          if (on) for (let k = 0; k < 3; k++) { const r = ((t * 60 + k * 40) % 120); g.strokeStyle = `rgba(255,107,90,${0.5 * (1 - r / 120)})`; g.beginPath(); g.arc(zx, zy, r, 0, 7); g.stroke(); }
          g.fillStyle = '#6f8f6a'; g.beginPath(); g.arc(zx, zy, 18, 0, 7); g.fill();
          g.fillStyle = '#ffe28a'; g.fillRect(zx - 7, zy - 4, 4, 4); g.fillRect(zx + 3, zy - 4, 4, 4);
          g.fillStyle = '#e8f1ec'; g.fillText('拖我', zx, zy + 34);
          g.textAlign = 'left';
          if (!on) { g.fillStyle = '#ffcf5a'; g.fillText('↓ 先按「播放聲音」', 12, 22); }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 48
  {
    id: 'lag', title: '連線:你看到的是過去', say: '多人連線時,別人的位置要經過網路才傳到你這裡,總是<b>晚一點</b>,而且一秒只來幾次。',
    task: '把延遲拉到 <b>300 ms</b>,再打開「內插」,比比看',
    fact: '這款遊戲連線時由「房主」的電腦算殭屍,再傳給大家;其他人的畫面用內插把一格一格的位置補成平順的動作。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 660, H = 270, half = W / 2;
      const P = T.panel({ w: W, h: H, place: 'center' });
      let lat = 100, rate = 10, interp = false, sawLag = false, t = 0, sendT = 0;
      const sent = [], got = [];
      const truth = (tt) => [half / 2 + Math.cos(tt * 1.3) * 110, H / 2 + 10 + Math.sin(tt * 2.1) * 80];
      T.slider({ label: '延遲', min: 0, max: 500, step: 10, value: 100, unit: ' ms', on: (v) => { lat = v; if (v >= 300) sawLag = true; if (sawLag && interp) T.done(); } });
      T.slider({ label: '一秒傳幾次', min: 2, max: 30, step: 1, value: 10, on: (v) => { rate = v; } });
      T.toggle({ label: '內插(補成平順)', value: false, on: (v) => { interp = v; if (sawLag && v && lat >= 300) T.done(); } });
      const dot = (g, x, y, c, r = 14, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalAlpha = 1; };
      return {
        update(dt) {
          t += dt;
          if ((sendT -= dt) <= 0) { sendT = 1 / rate; sent.push({ t, p: truth(t), at: t + lat / 1000 }); }
          while (sent.length && sent[0].at <= t) got.push(sent.shift());
          while (got.length > 60) got.shift();
          let show = null;
          if (got.length) {
            if (!interp) show = got[got.length - 1].p;
            else { // 畫「再晚一點點」的時間,兩筆資料中間用比例補
              const rt = t - lat / 1000 - 1 / rate;
              let a = got[0], b = got[0];
              for (let i = 0; i < got.length - 1; i++) if (got[i].t <= rt && got[i + 1].t >= rt) { a = got[i]; b = got[i + 1]; break; }
              if (rt > got[got.length - 1].t) a = b = got[got.length - 1];
              const k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 0;
              show = [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k];
            }
          }
          const g = P.g;
          P.clear('#0a1416');
          g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(half - 1, 0, 2, H);
          g.fillStyle = '#cfe1da'; g.font = 'bold 14px system-ui';
          g.fillText('房主的畫面(真的位置)', 14, 24);
          g.fillText('你的畫面', half + 14, 24);
          const [tx, ty] = truth(t);
          dot(g, tx, ty, '#6f8f6a', 16);
          // 正在網路上跑的封包
          for (const s of sent) { const k = clamp(1 - (s.at - t) / Math.max(0.001, lat / 1000), 0, 1); dot(g, half - 30 + k * 60, H - 26, '#ffcf5a', 4); }
          g.fillStyle = '#8fa8a1'; g.font = '11px system-ui'; g.fillText('網路 →', half - 18, H - 36);
          dot(g, tx + half, ty, '#6f8f6a', 16, 0.15);
          for (const s of got.slice(-6)) dot(g, s.p[0] + half, s.p[1], '#ffcf5a', 3, 0.6);
          if (show) dot(g, show[0] + half, show[1], '#6f8f6a', 16);
          g.fillStyle = '#8fa8a1'; g.fillText('淡淡的 = 真的在哪裡;黃點 = 收到的資料', half + 14, H - 14);
        },
      };
    },
  },
  // ---------------------------------------------------------------- 49
  {
    id: 'batch', title: '一次畫一大堆', say: '每叫顯示卡畫一次(draw call)都要花時間。把一樣的東西<b>合在一起畫</b>,就快很多。',
    task: '切到「合在一起畫」,看 draw call 掉多少',
    fact: '醫院的牆、地板、道具原本有 145 種材質、上萬個物件,遊戲把它們合併成少數幾個大網格,一幀只要幾百次 draw call。',
    studio: { cam: [0, 9, 16], target: [0, 0, 0], orbit: { max: 40 } },
    run(T) {
      const N = 40, sp = 0.62, geo = new THREE.SphereGeometry(0.2, 12, 8), mat = std(0x7d9a6c, { roughness: 0.7 });
      const one = new THREE.Group();
      const inst = new THREE.InstancedMesh(geo, mat, N * N);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = (i - N / 2) * sp, z = (j - N / 2) * sp;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, 0.25, z);
        one.add(m);
        m4.makeTranslation(x, 0.25, z);
        inst.setMatrixAt(k++, m4);
      }
      T.add(one, inst);
      inst.visible = false;
      let fps = 60, acc = 0, fr = 0, merged = false;
      T.choice({ label: '畫法', options: [{ v: false, t: `一個一個畫(${N * N} 個)` }, { v: true, t: '合在一起畫' }], value: false, on: (v) => { merged = v; one.visible = !v; inst.visible = v; if (v) T.done(); } });
      T.stat('draw call', () => fmt(T.info().calls), 'big');
      T.stat('FPS', () => Math.round(fps));
      return {
        update(dt, t) {
          acc += dt; fr++;
          if (acc > 0.5) { fps = fr / acc; acc = 0; fr = 0; }
          one.position.y = inst.position.y = Math.sin(t * 2) * 0.1;
        },
      };
    },
  },
  // ---------------------------------------------------------------- 50
  {
    id: 'finale', mode: 'world', title: '一層一層,疊出遊戲畫面', say: '恭喜你走完全部!最後,把今天學到的東西一層一層疊回去 —— 這就是你玩的每一幀。',
    task: '從「只有三角形」一路疊到<b>完整的遊戲畫面</b>',
    fact: '按 <kbd>F2</kbd> 回到遊戲。下次看到殭屍,你會知道:牠是三角形、骨頭、射線、狀態機,還有一盞在牠後面的燈。',
    run(T) {
      T.spot('lobby', { yaw: Math.PI * 0.9, pitch: 0.12 });
      const g = T.game, fog = g.scene.fog;
      T.keep(g.scene, 'overrideMaterial');
      T.keep(g.bloom, 'enabled');
      T.keep(g.gradePass, 'enabled');
      T.keep(g.post, 'enabled');
      const STEPS = ['三角形', '形狀', '+ 燈光', '+ 材質貼圖', '+ 霧', '+ 後處理(完整)'];
      let lv = 0, top = 0;
      const apply = () => {
        override(g, lv === 0 ? 'wire' : lv === 1 ? 'flat' : lv === 2 ? 'clay' : null);
        const full = lv >= 5;
        g.bloom.enabled = full && T._bloom0;
        g.post.enabled = full;
        g.gradePass.enabled = true;
        if (lv >= 5) T.done();
      };
      T._bloom0 = g.bloom.enabled;
      const sl = T.slider({ label: '疊到', min: 0, max: 5, step: 1, value: 0, fmt: (v) => STEPS[v], on: (v) => { lv = v; top = Math.max(top, v); apply(); } });
      T.button('下一層 ▶', () => sl.set(Math.min(5, lv + 1)), 'hot');
      return {
        update() { if (lv < 4 && fog) fog.density = 0; },
      };
    },
  },
];
