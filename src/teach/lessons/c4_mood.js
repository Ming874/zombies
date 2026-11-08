// ===== 第 4 章 氣氛魔法(真正的遊戲畫面)=====
// 這一章的場景都是 mode: 'world':相機飛到醫院裡,改的是遊戲本身的霧、光暈、曝光、畫面濾鏡;離開場景時全部還原(T.keep / sh.post)。

export default [
  // ---------------------------------------------------------------- 26
  {
    id: 'fog', mode: 'world', title: '霧:看不遠,才可怕', say: '霧讓遠的東西慢慢變成背景色。拉動拉桿,看看走廊有多深。',
    task: '把霧開到<b>最濃</b>,再<b>關掉</b>比比看',
    fact: '霧還有一個好處:看不到的地方就不用畫。遊戲相機最遠只看 120 公尺。',
    run(T) {
      T.spot('corridor');
      const fog = T.game.scene.fog;
      T.keep(fog, 'density');
      const c0 = fog.color.clone();
      T.onDispose(() => fog.color.copy(c0));
      let dens = null, col = null, thick = false, none = false;
      T.slider({ label: '霧的濃度', min: 0, max: 0.2, step: 0.005, value: fog.density, fmt: (x) => x.toFixed(3), on: (x) => { dens = x; if (x >= 0.19) thick = true; if (x <= 0.001) none = true; if (thick && none) T.done(); } });
      T.choice({ label: '顏色', options: [{ v: null, t: '原本' }, { v: 0x000000, t: '黑' }, { v: 0x9fb4b0, t: '白' }, { v: 0x3a0a08, t: '血紅' }], on: (v) => { col = v; } });
      return {
        update() { // 醫院的氣氛系統每幀會寫霧(依區域),教室在它之後蓋過去
          if (dens != null) fog.density = dens;
          if (col != null) fog.color.setHex(col); else fog.color.copy(c0);
        },
      };
    },
  },
  // ---------------------------------------------------------------- 27
  {
    id: 'bloom', mode: 'world', title: '光暈 Bloom', say: '很亮的東西會「暈開」一圈光,像眼睛被刺到。這是畫完之後再加上去的效果。',
    task: '把光暈開到很強(<b>2.5</b> 以上),再關掉比比看',
    fact: '「後處理」:先把整個畫面畫好,再像修圖一樣一層一層加效果。這款遊戲疊了 10 幾層。',
    run(T) {
      T.spot('lobby', { yaw: Math.PI - 0.3, pitch: 0.1, dz: -2 });
      const b = T.game.bloom;
      T.keep(b, 'enabled'); T.keep(b, 'strength'); T.keep(b, 'radius'); T.keep(b, 'threshold');
      b.enabled = true;
      let hi = false, off = false;
      T.slider({ label: '強度', min: 0, max: 3, step: 0.05, value: b.strength, on: (x) => { b.strength = x; if (x >= 2.5) hi = true; if (x <= 0.01) off = true; if (hi && off) T.done(); } });
      T.slider({ label: '範圍', min: 0, max: 1.5, step: 0.05, value: b.radius, on: (x) => { b.radius = x; } });
      T.slider({ label: '多亮才暈', min: 0, max: 2, step: 0.05, value: b.threshold, on: (x) => { b.threshold = x; } });
    },
  },
  // ---------------------------------------------------------------- 28
  {
    id: 'expo', mode: 'world', title: '曝光:相機的眼睛', say: '同一個畫面,<b>曝光</b>調高就像眼睛適應了黑暗,調低就像從大太陽底下走進來。',
    task: '把畫面調到<b>超暗</b>(0.3 以下)再調到<b>超亮</b>(3 以上)',
    fact: '恐怖遊戲常常故意調暗,只讓手電筒照到的地方看得清楚 —— 看不到的,最可怕。',
    run(T) {
      T.spot('start', { pitch: 0.02 });
      const r = T.game.renderer;
      T.keep(r, 'toneMappingExposure');
      let dark = false, bright = false;
      T.slider({ label: '曝光', min: 0.1, max: 4, step: 0.05, value: r.toneMappingExposure, on: (x) => { r.toneMappingExposure = x; if (x <= 0.3) dark = true; if (x >= 3) bright = true; if (dark && bright) T.done(); } });
      T.button('還原', () => { r.toneMappingExposure = 1.15; T.sh.go(T.sh.i, 0); });
    },
  },
  // ---------------------------------------------------------------- 29
  {
    id: 'filters', mode: 'world', title: '濾鏡疊疊樂', say: '遊戲在不同時刻,會替畫面換上不同的<b>濾鏡</b>。這些都是遊戲裡真的在用的。',
    task: '同時打開 <b>3 個</b>濾鏡',
    fact: '你受傷時畫面邊緣變紅、回憶片段變舊照片、尖叫者讓你頭暈 —— 都是同一個畫面濾鏡在改數字。',
    run(T) {
      T.spot('corridor', { dx: 14, yaw: Math.PI / 2 });
      const F = [
        ['監視器', { crt: 1 }], ['暗角', { vig: 0.9 }], ['顆粒', { grain: 2.2 }], ['黑白', { desat: 1 }],
        ['受傷', { hurt: 0.85 }], ['舊照片', { past: 1 }], ['頭暈', { daze: 1 }],
      ];
      const on = new Set();
      for (const [name, vals] of F) {
        T.toggle({
          label: name, value: false, on: (v) => {
            if (v) on.add(name); else on.delete(name);
            for (const k in vals) T.sh.post[k] = v ? vals[k] : 0;
            if (on.size >= 3) T.done();
          },
        });
      }
      return { update(dt, t) { if (on.has('監視器')) T.sh.post.roll = (t * 0.02) % 1 < 0.01 ? 0.004 : 0; } };
    },
  },
];
