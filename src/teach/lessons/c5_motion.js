import * as THREE from 'three';
import { rad, rnd, std, dummy, ring, line, tween, clamp } from './_util.js';

// ===== 第 5 章 讓角色動起來 =====
export default [
  // ---------------------------------------------------------------- 30
  {
    id: 'bones', title: '骨架', say: '會動的角色身體裡有一副<b>骨架</b>。骨頭一轉,包在外面的皮膚就跟著動。',
    task: '把<b>皮膚</b>關掉,看看裡面的骨頭',
    fact: '這款遊戲每隻殭屍有 22 根骨頭;被打斷手的時候,遊戲把那根骨頭縮成 0,手就「不見了」。',
    studio: { cam: [1.6, 1.5, 3.2], target: [0, 1.0, 0] },
    run(T) {
      const z = T.zombie('walker', 1);
      T.add(z.mesh);
      const sk = new THREE.SkeletonHelper(z.mesh);
      sk.material.linewidth = 2;
      sk.material.depthTest = false;
      sk.renderOrder = 10;
      T.add(sk);
      const B = z.bones;
      const marks = new THREE.Group();
      const jm = new THREE.MeshBasicMaterial({ color: 0xffcf5a, depthTest: false });
      const jg = new THREE.SphereGeometry(0.018, 10, 8);
      for (const b of z.list) { const s = new THREE.Mesh(jg, jm); s.renderOrder = 11; b.add(s); }
      T.add(marks);
      for (const [n, t] of [['head', '頭'], ['chest', '胸'], ['handL', '左手'], ['handR', '右手'], ['footL', '左腳'], ['footR', '右腳']]) T.label(B[n], t, { cls: 'dot acc', dy: 0.06 });
      T.toggle({ label: '皮膚', value: true, on: (v) => { z.mesh.material = v ? z.mesh.userData.mats || z.mesh.material : hidden; if (!v) T.done(); } });
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      z.mesh.userData.mats = z.mesh.material;
      T.onDispose(() => { z.mesh.material = z.mesh.userData.mats; hidden.dispose(); jm.dispose(); jg.dispose(); });
      T.toggle({ label: '骨頭', value: true, on: (v) => { sk.visible = v; } });
      T.stat('骨頭', () => `${z.list.length} 根`);
      return {
        update(dt, t) { // 輕輕動一動:骨頭轉,皮膚跟著動
          B.head.rotation.set(Math.sin(t * 0.9) * 0.25, Math.sin(t * 0.6) * 0.5, 0);
          B.upperArmL.rotation.x = -1.2 + Math.sin(t * 1.3) * 0.25;
          B.upperArmR.rotation.x = -1.1 + Math.sin(t * 1.1 + 1) * 0.25;
          B.forearmL.rotation.x = -0.3 + Math.sin(t * 1.7) * 0.2;
          B.spine.rotation.z = Math.sin(t * 0.7) * 0.08;
        },
      };
    },
  },
  // ---------------------------------------------------------------- 31
  {
    id: 'pose', title: '擺姿勢', say: '轉動骨頭的角度,就能讓角色擺出任何姿勢。',
    task: '擺出殭屍的<b>經典姿勢</b>:兩隻手都往前舉',
    fact: '動畫師做動作,就是一格一格地轉這些骨頭。這款遊戲的殭屍動作,大部分是程式即時算出來的。',
    studio: { cam: [2.4, 1.6, 2.8], target: [0, 1.0, 0] },
    run(T) {
      const z = T.zombie('runner', 2);
      T.add(z.mesh);
      const B = z.bones;
      const st = { L: 0, R: 0 };
      const chk = () => { if (st.L >= 75 && st.R >= 75) { T.done(); T.toast('嗚啊——', 1200); } };
      T.slider({ label: '左手', min: 0, max: 170, step: 1, value: 0, unit: '°', on: (v) => { st.L = v; B.upperArmL.rotation.x = -rad(v); chk(); } });
      T.slider({ label: '右手', min: 0, max: 170, step: 1, value: 0, unit: '°', on: (v) => { st.R = v; B.upperArmR.rotation.x = -rad(v); chk(); } });
      T.row();
      T.slider({ label: '歪頭', min: -45, max: 45, step: 1, value: 0, unit: '°', on: (v) => { B.head.rotation.z = rad(v); } });
      T.slider({ label: '彎腰', min: -10, max: 70, step: 1, value: 0, unit: '°', on: (v) => { B.spine.rotation.x = rad(v) * 0.6; B.chest.rotation.x = rad(v) * 0.4; } });
      T.slider({ label: '膝蓋', min: 0, max: 90, step: 1, value: 0, unit: '°', on: (v) => { B.thighL.rotation.x = -rad(v) * 0.5; B.shinL.rotation.x = rad(v); } });
    },
  },
  // ---------------------------------------------------------------- 32
  {
    id: 'key', title: '關鍵影格', say: '動畫師只擺出幾個<b>重要的姿勢</b>(關鍵影格),中間的動作讓電腦自己補。',
    task: '把中間那格(黃色)<b>拖高</b>,再按 ▶ 播放',
    fact: '電影一秒 24 格,遊戲一秒 60 格;動畫師可能只擺了其中幾格,其他全部是「補間」算出來的。',
    studio: { cam: [0, 2.6, 8.5], target: [0, 1.4, 0] },
    run(T) {
      const K = [
        { t: 0, p: new THREE.Vector3(-3.2, 0, 0), r: 0 },
        { t: 1, p: new THREE.Vector3(0, 1.6, 0), r: Math.PI },
        { t: 2, p: new THREE.Vector3(3.2, 0, 0), r: Math.PI * 2 },
      ];
      const hero = T.add(dummy(0x6f8f6a, { arms: true }));
      const pivot = new THREE.Group(); // 翻跟斗繞身體中心
      const ghosts = K.map((k, i) => {
        const g = dummy(i === 1 ? 0xffcf5a : 0x8fa8a1, { eyes: false });
        g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = i === 1 ? 0.55 : 0.3; o.castShadow = false; } });
        T.add(g);
        T.label(g, `第 ${i + 1} 格`, { cls: 'dot ' + (i === 1 ? 'acc' : ''), dy: 2.0 });
        return g;
      });
      const place = (o, p, r) => { o.position.copy(p); o.rotation.set(0, 0, 0); o.position.y += 0.9; o.rotateZ(-r); o.translateY(-0.9); };
      K.forEach((k, i) => place(ghosts[i], k.p, k.r));
      let moved = false;
      const start = K[1].p.clone();
      T.drag(ghosts[1], { plane: 'xy', clamp: (p) => { p.z = 0; p.y = clamp(p.y, 0, 3.5); p.x = clamp(p.x, -2.5, 2.5); }, onMove: (p) => { K[1].p.set(p.x, p.y, 0); if (K[1].p.distanceTo(start) > 0.4) moved = true; } , onEnd: () => place(ghosts[1], K[1].p, K[1].r) });
      const path = T.add(line(Array.from({ length: 41 }, () => new THREE.Vector3()), 0xffcf5a, { dashed: true, opacity: 0.6 }));
      let time = 0, playing = false, tweenOn = true;
      const sample = (t, out) => {
        let i = t < 1 ? 0 : 1;
        let k = clamp(t - i, 0, 1);
        if (!tweenOn) k = k < 1 ? 0 : 1;
        out.p.lerpVectors(K[i].p, K[i + 1].p, k);
        out.r = K[i].r + (K[i + 1].r - K[i].r) * k;
        return out;
      };
      const o = { p: new THREE.Vector3(), r: 0 };
      const P = T.panel({ w: Math.min(520, window.innerWidth - 40), h: 54, place: 'bottom', cls: 'clear' });
      P.el.style.bottom = '128px';
      const drawTL = () => {
        const g = P.g;
        P.clear();
        const TW = P.w - 40, sx = TW / 2;
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(20, 26, TW, 4);
        for (let f = 0; f <= 48; f++) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(20 + (f * TW) / 48, 22, 1, 12); }
        K.forEach((k, i) => { const x = 20 + k.t * sx; g.save(); g.translate(x, 28); g.rotate(Math.PI / 4); g.fillStyle = i === 1 ? '#ffcf5a' : '#cfe1da'; g.fillRect(-7, -7, 14, 14); g.restore(); });
        const x = 20 + time * sx;
        g.fillStyle = '#ff6b5a'; g.fillRect(x - 1, 8, 2, 40);
        g.fillStyle = '#8fa8a1'; g.font = '11px system-ui'; g.fillText('時間軸 · 菱形 = 關鍵影格', 20, 12);
      };
      const tl = T.slider({ label: '時間', min: 0, max: 2, step: 0.01, value: 0, fmt: (x) => `第 ${Math.round(x * 24)} 格`, on: (x) => { time = x; } });
      T.button('▶ 播放', () => { time = 0; playing = true; if (moved) T.done(); }, 'hot');
      T.toggle({ label: '補間', value: true, on: (v) => { tweenOn = v; } });
      return {
        update(dt) {
          if (playing) { time += dt * 0.8; if (time >= 2) { time = 2; playing = false; } tl.set(time); }
          sample(time, o);
          place(hero, o.p, o.r);
          const pts = [];
          for (let i = 0; i <= 40; i++) { sample((i / 40) * 2, o); pts.push(o.p.clone().setY(o.p.y + 0.9)); }
          path.set(pts);
          drawTL();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 33
  {
    id: 'ease', title: '緩動:動得自然', say: '從 A 到 B 不一定要等速。<b>加速、減速、彈一下</b>,感覺就完全不一樣。',
    task: '猜猜看哪一顆最像<b>籃球掉到地上</b>',
    fact: '開門、選單滑出來、相機轉場、撿到金幣飛向你 —— 遊戲裡幾乎每個動作都有加緩動。',
    studio: { cam: [0, 2.2, 7.5], target: [0, 1.5, 0] },
    run(T) {
      const E = [['等速', T.ease.linear, 0x8fa8a1], ['加速', T.ease.in, 0x4aa8ff], ['減速', T.ease.out, 0x5fe0a8], ['彈跳', T.ease.bounce, 0xff8a5a]];
      const balls = E.map(([name, f, c], i) => {
        const b = T.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), std(c, { roughness: 0.4 })));
        b.castShadow = true;
        b.position.set(-2.7 + i * 1.8, 3.3, 0);
        T.label(new THREE.Vector3(-2.7 + i * 1.8, 0, 0.6), name, { cls: 'plain' });
        const sh = T.add(new THREE.Mesh(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })));
        sh.position.set(b.position.x, 0.012, 0);
        return { b, f, sh };
      });
      let t = 0, loop = true;
      T.button('▶ 再丟一次', () => { t = 0; });
      T.toggle({ label: '一直重播', value: true, on: (v) => { loop = v; } });
      T.row();
      T.quiz({ q: '哪一顆最像籃球掉到地上?', options: E.map((e) => e[0]), answer: 3, why: '對!真實的球碰到地面會彈起來,越彈越低。' });
      return {
        update(dt) {
          t += dt;
          const k = clamp(t / 1.3, 0, 1);
          for (const q of balls) {
            q.b.position.y = 0.3 + (1 - q.f(k)) * 3;
            q.sh.scale.setScalar(0.5 + 0.5 * (1 - (q.b.position.y - 0.3) / 3));
          }
          if (loop && t > 2.4) t = 0;
        },
      };
    },
  },
  // ---------------------------------------------------------------- 34
  {
    id: 'walk', title: '用波浪讓殭屍走路', say: '走路就是兩條腿<b>輪流前後擺</b>。用 <code>Math.sin</code> 做一條來回擺動的波浪,接到腿上。',
    task: '改程式,讓殭屍<b>跑起來</b>(速度 9 以上、擺幅 0.7 以上)',
    fact: '遊戲殭屍的走路、拖腳、抽搐,很多都是這樣用數學即時算的,所以每隻的步伐都不太一樣。',
    studio: { cam: [3.4, 1.6, 2.6], target: [0, 0.95, 0], grid: false },
    run(T) {
      const z = T.zombie('walker', 0);
      T.add(z.mesh);
      const B = z.bones;
      const grid = T.add(new THREE.GridHelper(30, 30, 0x2f5a58, 0x1f3a3c));
      grid.position.y = 0.003;
      let spd = 4, amp = 0.35, limp = false, ph = 0;
      const hist = [];
      T.code(`leg.rotation.x = Math.sin(time * {s}) * {a}`, { s: { value: 4, min: 0, max: 14, step: 0.5 }, a: { value: 0.35, min: 0, max: 1.2, step: 0.05 } }, (v) => {
        spd = v.s; amp = v.a;
        if (spd >= 9 && amp >= 0.7) T.done();
      }, { title: '每一幀都跑這行', hint: '<b>第一個</b>數字 = 擺多快,<b>第二個</b> = 擺多大' });
      T.toggle({ label: '跛腳', value: false, on: (v) => { limp = v; } });
      const P = T.panel({ w: 300, h: 150, place: 'right' });
      P.el.style.transform = 'translateY(20%)';
      return {
        update(dt) {
          ph += dt * spd;
          const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
          const aR = limp ? amp * 0.3 : amp;
          B.thighL.rotation.x = -sL * amp;
          B.thighR.rotation.x = -sR * aR;
          B.shinL.rotation.x = Math.max(0, Math.sin(ph - Math.PI / 2)) * amp * 1.4;
          B.shinR.rotation.x = Math.max(0, Math.sin(ph + Math.PI / 2)) * aR * 1.4;
          B.upperArmL.rotation.x = -1.25 + sR * 0.12;
          B.upperArmR.rotation.x = -1.15 + sL * 0.12;
          B.spine.rotation.z = Math.sin(ph) * 0.05 * (limp ? 2.5 : 1);
          B.hips.position.y = 0.97 - Math.abs(Math.cos(ph)) * 0.03 * amp * (limp ? 2 : 1);
          grid.position.z = (grid.position.z - dt * spd * amp * 0.28) % 1;
          // 右邊的波形:左腳(黃)、右腳(藍)
          hist.push([-sL * amp, -sR * aR]);
          if (hist.length > 150) hist.shift();
          const g = P.g;
          P.clear('#0a1416');
          g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 75, 300, 1);
          for (const [i, col] of [[0, '#ffcf5a'], [1, '#6cc4ff']]) {
            g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
            hist.forEach((h, x) => { const y = 75 - h[i] * 50; x ? g.lineTo(x * 2, y) : g.moveTo(0, y); });
            g.stroke();
          }
          g.fillStyle = '#ffcf5a'; g.font = '12px system-ui'; g.fillText('左腳', 8, 16);
          g.fillStyle = '#6cc4ff'; g.fillText('右腳', 44, 16);
        },
        dispose() { for (const n of ['thighL', 'thighR', 'shinL', 'shinR', 'upperArmL', 'upperArmR', 'spine']) B[n].rotation.set(0, 0, 0); },
      };
    },
  },
  // ---------------------------------------------------------------- 35
  {
    id: 'ragdoll', title: '布娃娃', say: '殭屍倒下時,遊戲把它交給<b>物理</b>:每根骨頭只用「棍子」連著,讓重力決定它怎麼倒。',
    task: '點它一下,把它<b>打倒</b>',
    fact: '遊戲裡的布娃娃用的是 Rapier 物理引擎,跑在另一條執行緒(Web Worker)上,不會讓畫面卡住。',
    studio: { cam: [3.2, 2.0, 4.4], target: [0, 0.9, 0] },
    run(T) {
      // 點(關節)與棍子(骨頭):Verlet 積分 —— 位置 - 上一幀位置 = 速度
      const REST = [[0, 1.72, 0], [0, 1.42, 0], [0, 0.96, 0], [0.24, 1.36, 0.32], [0.24, 1.38, 0.66], [-0.24, 1.36, 0.32], [-0.24, 1.38, 0.66], [0.12, 0.52, 0.02], [0.12, 0.06, 0.02], [-0.12, 0.52, 0.02], [-0.12, 0.06, 0.02]];
      const STICK = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10], [0, 2], [3, 5], [7, 9], [2, 8], [2, 10], [1, 4], [1, 6], [8, 10]]; // 後面幾根是看不見的「撐桿」,讓身體不會整個軟掉
      const P = REST.map((p) => ({ p: new THREE.Vector3(...p), o: new THREE.Vector3(...p) }));
      const L = STICK.map(([a, b]) => P[a].p.distanceTo(P[b].p));
      const skin = std(0x7d9a6c, { roughness: 0.8 }), cloth = std(0x5d6f86, { roughness: 0.9 });
      const head = T.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), skin));
      head.castShadow = true;
      const joints = P.slice(1).map(() => { const m = T.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), cloth)); m.castShadow = true; return m; });
      const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
      const bones = STICK.slice(0, 10).map(([a], i) => { const m = T.add(new THREE.Mesh(cyl, i < 2 ? cloth : i < 6 ? skin : cloth)); m.castShadow = true; m.userData.r = i === 1 ? 0.17 : i < 2 ? 0.08 : 0.055; return m; });
      const pickables = [head, ...joints, ...bones];
      let alive = true, falls = 0, still = 0;
      const tag = T.label(head, '點我', { cls: 'acc', dy: 0.35 });
      T.click(pickables, (h) => {
        if (!alive) return;
        alive = false; still = 0;
        const dir = h.event ? T.ray(h.event).ray.direction.clone() : new THREE.Vector3(1, 0, 0);
        dir.y = Math.max(dir.y, 0.05);
        for (const q of P) { const d = q.p.distanceTo(h.point); q.o.copy(q.p).addScaledVector(dir, -0.16 / (1 + d * 2)); }
        tag.show(false);
        falls++;
        T.done();
      });
      const reset = () => { alive = true; P.forEach((q, i) => { q.p.set(...REST[i]); q.o.copy(q.p); }); tag.show(true); };
      T.button('站起來', reset);
      T.stat('倒下', () => `${falls} 次`);
      let g = 9.8;
      T.choice({ label: '重力', options: [{ v: 1.6, t: '月球' }, { v: 9.8, t: '地球' }, { v: 25, t: '木星' }], value: 9.8, on: (v) => { g = v; } });
      const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), vel = new THREE.Vector3();
      return {
        update(dt, t) {
          if (alive) { // 站著:跟著呼吸晃一晃
            P.forEach((q, i) => { q.p.set(REST[i][0] + Math.sin(t * 1.3) * 0.02 * (REST[i][1] / 1.7), REST[i][1], REST[i][2]); q.o.copy(q.p); });
          } else {
            const h = Math.min(dt, 1 / 30);
            for (const q of P) {
              vel.subVectors(q.p, q.o).multiplyScalar(0.995);
              q.o.copy(q.p);
              q.p.add(vel).y -= g * h * h;
              if (q.p.y < 0.07) { q.p.y = 0.07; const f = 0.6; q.o.x = q.p.x - (q.p.x - q.o.x) * f; q.o.z = q.p.z - (q.p.z - q.o.z) * f; }
            }
            for (let it = 0; it < 12; it++) STICK.forEach(([a, b], i) => {
              const A = P[a].p, Bp = P[b].p;
              tmp.subVectors(Bp, A);
              const d = tmp.length() || 1e-6, k = (d - L[i]) / d * 0.5;
              A.addScaledVector(tmp, k); Bp.addScaledVector(tmp, -k);
            });
            if ((still += dt) > 4.5) reset();
          }
          head.position.copy(P[0].p);
          joints.forEach((m, i) => m.position.copy(P[i + 1].p));
          bones.forEach((m, i) => {
            const [a, b] = STICK[i];
            tmp.subVectors(P[b].p, P[a].p);
            const len = tmp.length();
            m.position.copy(P[a].p).addScaledVector(tmp, 0.5);
            m.quaternion.setFromUnitVectors(up, tmp.normalize());
            m.scale.set(m.userData.r, len, m.userData.r);
          });
        },
      };
    },
  },
];
