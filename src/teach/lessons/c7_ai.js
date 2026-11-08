import * as THREE from 'three';
import { waveCount, waveKind, hpMul, DIFF, SPECIAL } from '../../game/waves.js';
import { GUN_R } from '../../game/noise.js';
import { rnd, std, dummy, ring, line, clamp } from './_util.js';

// ===== 第 7 章 殭屍的大腦 =====
export default [
  // ---------------------------------------------------------------- 41
  {
    id: 'fsm', title: '狀態機', say: '殭屍的大腦很簡單:現在在哪個<b>狀態</b>,遇到什麼事就換到下一個狀態。拖著藍色的你,去逗牠。',
    task: '讓殭屍<b>攻擊</b>你,再<b>逃走</b>,讓牠回到「閒晃」',
    fact: '這款遊戲的殭屍還有更多狀態:被打到會踉蹌、被電擊會暈、潛行者怕手電筒。但骨架就是這張圖。',
    studio: { cam: [0, 13, 9.5], target: [0, 0, 0.5] },
    run(T) {
      const me = T.add(dummy(0x4aa8ff));
      me.position.set(-4, 0, 3);
      const z = T.add(dummy(0x6f8f6a, { arms: true }));
      z.position.set(3, 0, -2);
      const view = T.add(ring(6, 0x5fe0a8));
      view.material.opacity = 0.35;
      T.drag(me, { plane: 'xz', clamp: (p) => { p.y = 0; p.x = clamp(p.x, -9, 9); p.z = clamp(p.z, -7, 7); } });
      T.label(me, '你(拖我)', { cls: 'blu', dy: 2.05 });
      const tag = T.label(z, '', { cls: 'big', dy: 2.1 });
      const S = { wander: '閒晃', chase: '追你', attack: '攻擊' };
      let st = 'wander', goal = new THREE.Vector3(), wT = 0, attacked = false, lunge = 0;
      const P = T.panel({ w: 300, h: 250, place: 'right' });
      P.el.style.transform = 'translateY(-6%)';
      const N = { wander: [70, 70], chase: [230, 70], attack: [150, 200] };
      const arrow = (g, a, b, txt, bend = 0) => {
        const [x1, y1] = a, [x2, y2] = b, mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 + bend * 0.6;
        g.strokeStyle = 'rgba(232,241,236,.5)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
        const ang = Math.atan2(y2 - my, x2 - mx), ex = x2 - Math.cos(ang) * 34, ey = y2 - Math.sin(ang) * 34;
        g.fillStyle = 'rgba(232,241,236,.75)'; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(ang - 0.4) * 9, ey - Math.sin(ang - 0.4) * 9); g.lineTo(ex - Math.cos(ang + 0.4) * 9, ey - Math.sin(ang + 0.4) * 9); g.fill();
        g.fillStyle = '#8fa8a1'; g.font = '11px system-ui'; g.textAlign = 'center'; g.fillText(txt, mx, my - 4); g.textAlign = 'left';
      };
      const draw = () => {
        const g = P.g;
        P.clear('#0a1416');
        arrow(g, N.wander, N.chase, '看到你(6 公尺內)', -14);
        arrow(g, N.chase, N.wander, '你跑遠了(9 公尺外)', 14);
        arrow(g, N.chase, N.attack, '抓得到(1.3 公尺)', 18);
        arrow(g, N.attack, N.chase, '你閃開了', -18);
        for (const k in N) {
          const [x, y] = N[k], on = k === st;
          g.fillStyle = on ? (k === 'attack' ? '#ff6b5a' : k === 'chase' ? '#ffcf5a' : '#5fe0a8') : '#1d2f30';
          g.beginPath(); g.arc(x, y, 32, 0, 7); g.fill();
          g.strokeStyle = 'rgba(232,241,236,.4)'; g.stroke();
          g.fillStyle = on ? '#08231a' : '#e8f1ec'; g.font = 'bold 15px system-ui'; g.textAlign = 'center'; g.fillText(S[k], x, y + 5); g.textAlign = 'left';
        }
      };
      const go = (s) => { st = s; if (s === 'attack') attacked = true; if (s === 'wander' && attacked) T.done(); };
      return {
        update(dt, t) {
          const d = z.position.distanceTo(me.position);
          if (st === 'wander') {
            if ((wT -= dt) <= 0 || z.position.distanceTo(goal) < 0.3) { goal.set(rnd(-7, 7), 0, rnd(-6, 6)); wT = rnd(2, 4); }
            if (d < 6) go('chase');
          } else if (st === 'chase') {
            goal.copy(me.position);
            if (d < 1.3) go('attack');
            else if (d > 9) go('wander');
          } else if (st === 'attack') {
            goal.copy(z.position);
            lunge += dt;
            if (d > 1.6) { go('chase'); lunge = 0; }
          }
          const sp = st === 'chase' ? 2.3 : st === 'wander' ? 0.8 : 0;
          const to = goal.clone().sub(z.position).setY(0);
          if (to.length() > 0.05 && sp) { to.normalize(); z.position.addScaledVector(to, sp * dt); z.rotation.y = Math.atan2(to.x, to.z); }
          if (st === 'attack') { z.rotation.y = Math.atan2(me.position.x - z.position.x, me.position.z - z.position.z); z.rotation.x = Math.max(0, Math.sin(t * 9)) * 0.25; } else z.rotation.x = 0;
          me.userData.mat.color.set(st === 'attack' && Math.sin(t * 18) > 0 ? 0xff6b5a : 0x4aa8ff);
          view.position.set(z.position.x, 0.01, z.position.z);
          tag.set(S[st]);
          tag.el.className = 'tl big ' + (st === 'attack' ? 'hot' : st === 'chase' ? 'acc' : 'ok');
          draw();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 42
  {
    id: 'path', title: '尋路:殭屍怎麼繞過牆', say: '從你的位置往外一格一格<b>數步數</b>,每一格的箭頭指向「離你更近」的那一格。殭屍跟著箭頭走就好。',
    task: '點地板蓋牆,做出一條迷宮,讓殭屍要走 <b>40 步</b>以上',
    fact: '這叫「流場」。遊戲每隔一段時間算一張整層樓的流場,場上幾十隻殭屍同時查表,比每隻自己找路快很多。',
    studio: { cam: [0, 15, 8], target: [0, 0, 0], grid: false },
    run(T) {
      const W = 16, H = 12, ox = -W / 2 + 0.5, oz = -H / 2 + 0.5;
      const wall = new Uint8Array(W * H), dist = new Int32Array(W * H);
      const id = (c, r) => r * W + c;
      for (const [c, r] of [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7], [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10]]) wall[id(c, r)] = 1;
      const tileG = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
      const tiles = T.add(new THREE.InstancedMesh(tileG, new THREE.MeshBasicMaterial({ color: 0xffffff }), W * H));
      const walls = T.add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 1, 0.98).translate(0, 0.5, 0), std(0x6b8f86), W * H));
      walls.castShadow = true;
      const arrowG = new THREE.ConeGeometry(0.16, 0.42, 3).rotateX(Math.PI / 2);
      const arrows = T.add(new THREE.InstancedMesh(arrowG, new THREE.MeshBasicMaterial({ color: 0x0a1416 }), W * H));
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0), pv = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
      const me = T.add(dummy(0x4aa8ff));
      let pc = 13, pr = 6;
      const spawn = [1, 6];
      const cellPos = (c, r, y = 0) => pv.set(ox + c, y, oz + r);
      me.position.copy(cellPos(pc, pr));
      T.label(me, '你', { cls: 'blu', dy: 2.05 });
      T.label(cellPos(spawn[0], spawn[1]).clone(), '殭屍從這裡出發', { cls: 'hot', dy: 0.1 });
      let steps = 0;
      const solve = () => {
        dist.fill(-1);
        const qq = [id(pc, pr)];
        dist[qq[0]] = 0;
        for (let h = 0; h < qq.length; h++) {
          const i = qq[h], c = i % W, r = (i / W) | 0;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
            const j = id(nc, nr);
            if (wall[j] || dist[j] >= 0) continue;
            dist[j] = dist[i] + 1;
            qq.push(j);
          }
        }
        let mx = 1;
        for (let i = 0; i < W * H; i++) if (dist[i] > mx) mx = dist[i];
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
          const i = id(c, r), d = dist[i];
          m4.compose(cellPos(c, r, 0.006), q.identity(), s1);
          tiles.setMatrixAt(i, m4);
          tiles.setColorAt(i, wall[i] ? col.set(0x0a1416) : d < 0 ? col.set(0x3a1a18) : col.setHSL(0.13 - (d / mx) * 0.13, 0.75, 0.62 - (d / mx) * 0.32));
          m4.compose(cellPos(c, r), q.identity(), wall[i] ? s1 : s0);
          walls.setMatrixAt(i, m4);
          // 箭頭:指向步數比較少的鄰居
          let best = null, bd = d;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; const j = id(nc, nr); if (dist[j] >= 0 && dist[j] < bd) { bd = dist[j]; best = [dc, dr]; } }
          if (best && !wall[i] && d > 0) { q.setFromAxisAngle(up, Math.atan2(best[0], best[1])); m4.compose(cellPos(c, r, 0.03), q, s1); } else m4.compose(cellPos(c, r), q.identity(), s0);
          arrows.setMatrixAt(i, m4);
        }
        tiles.instanceMatrix.needsUpdate = walls.instanceMatrix.needsUpdate = arrows.instanceMatrix.needsUpdate = true;
        if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
        steps = dist[id(spawn[0], spawn[1])];
        if (steps >= 40) T.done();
      };
      solve();
      const zs = [0, 1, 2].map((k) => { const d = T.add(dummy(0x6f8f6a, { arms: true })); d.scale.setScalar(0.7); d.position.copy(cellPos(spawn[0], spawn[1])); d.userData.delay = k * 1.4; return d; });
      T.drag(me, { plane: 'xz', clamp: (p) => { p.y = 0; }, onEnd: (p) => {
        const c = clamp(Math.round(p.x - ox), 0, W - 1), r = clamp(Math.round(p.z - oz), 0, H - 1);
        if (!wall[id(c, r)]) { pc = c; pr = r; }
        me.position.copy(cellPos(pc, pr));
        solve();
      } });
      T.click(null, (h) => {
        if (!h.point) return;
        const c = Math.round(h.point.x - ox), r = Math.round(h.point.z - oz);
        if (c < 0 || r < 0 || c >= W || r >= H || (c === pc && r === pr) || (c === spawn[0] && r === spawn[1])) return;
        wall[id(c, r)] ^= 1;
        solve();
      });
      T.stat('殭屍要走', () => (steps < 0 ? '<span style="color:#ff6b5a">走不到!</span>' : `${steps} 步`), 'big');
      T.toggle({ label: '箭頭', value: true, on: (v) => { arrows.visible = v; } });
      T.toggle({ label: '步數顏色', value: true, on: (v) => { tiles.visible = v; } });
      T.button('清空', () => { wall.fill(0); solve(); });
      return {
        update(dt) {
          for (const d of zs) {
            if ((d.userData.delay -= dt) > 0) continue;
            const c = clamp(Math.round(d.position.x - ox), 0, W - 1), r = clamp(Math.round(d.position.z - oz), 0, H - 1);
            const i = id(c, r);
            if (dist[i] === 0) { d.position.copy(cellPos(spawn[0], spawn[1])); d.userData.delay = 0.8; continue; }
            let best = null, bd = dist[i] < 0 ? 1e9 : dist[i];
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; const j = id(nc, nr); if (dist[j] >= 0 && dist[j] < bd && !wall[j]) { bd = dist[j]; best = [nc, nr]; } }
            if (!best) continue;
            const tgt = cellPos(best[0], best[1]).clone();
            const to = tgt.sub(d.position);
            const L = to.length();
            if (L > 0.001) { d.position.addScaledVector(to, Math.min(1, (2.4 * dt) / L)); d.rotation.y = Math.atan2(to.x, to.z); }
          }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 43
  {
    id: 'noise', title: '聲音會引來殭屍', say: '每個聲音有一個<b>範圍</b>。範圍裡的殭屍「聽到了」,就會往聲音的方向走。',
    task: '用聲音把 <b>6 隻</b>殭屍全部引到同一個地方',
    fact: `遊戲裡開槍的聲音範圍:手槍 ${GUN_R.pistol} 公尺、AK-47 ${GUN_R.ak47} 公尺、巴雷特 ${GUN_R.barrett} 公尺。殭屍比較常從吵的地方附近冒出來。`,
    studio: { cam: [0, 17, 11], target: [0, 0, 0], floorSize: 13 },
    run(T) {
      const zs = Array.from({ length: 6 }, (_, i) => {
        const d = T.add(dummy(0x6f8f6a, { arms: true }));
        const a = (i / 6) * Math.PI * 2;
        d.position.set(Math.cos(a) * 8, 0, Math.sin(a) * 6);
        d.userData.goal = d.position.clone();
        d.userData.L = T.label(d, '?', { cls: 'acc dot', dy: 2.0 });
        d.userData.L.show(false);
        return d;
      });
      const R = { step: 2.5, pistol: 6, barrett: 13 };
      let kind = 'pistol';
      T.choice({ label: '聲音', options: [{ v: 'step', t: '腳步' }, { v: 'pistol', t: '手槍' }, { v: 'barrett', t: '巴雷特' }], value: 'pistol', on: (v) => { kind = v; } });
      T.stat('聚在一起', () => `${best} / 6`);
      let best = 0;
      const waves = [];
      T.click(null, (h) => {
        if (!h.point) return;
        const p = h.point.clone().setY(0), r = R[kind];
        const m = T.add(new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })));
        m.position.copy(p).setY(0.02);
        waves.push({ m, r, t: 0 });
        for (const d of zs) if (d.position.distanceTo(p) <= r) { d.userData.goal.copy(p).add(new THREE.Vector3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6))); d.userData.heard = 3; d.userData.L.show(true); }
      });
      return {
        update(dt, t) {
          for (let i = waves.length - 1; i >= 0; i--) {
            const w = waves[i];
            w.t += dt;
            w.m.scale.setScalar(Math.max(0.01, Math.min(1, w.t / 0.6)) * w.r);
            w.m.material.opacity = Math.max(0, 0.9 - w.t * 0.7);
            if (w.t > 1.3) { T.scene.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); waves.splice(i, 1); }
          }
          for (const d of zs) {
            const u = d.userData;
            if (u.heard > 0) { u.heard -= dt; if (u.heard <= 0) u.L.show(false); }
            const to = u.goal.clone().sub(d.position).setY(0), L = to.length();
            if (L > 0.1) { d.position.addScaledVector(to, Math.min(1, ((u.heard > 0 ? 2.2 : 0.6) * dt) / L)); d.rotation.y = Math.atan2(to.x, to.z); }
            else if (Math.random() < dt * 0.3 && !(u.heard > 0)) u.goal.copy(d.position).add(new THREE.Vector3(rnd(-1.5, 1.5), 0, rnd(-1.5, 1.5))).clampLength(0, 11);
            d.position.y = Math.abs(Math.sin(t * 6 + d.id)) * 0.04;
          }
          // 最多幾隻在 3 公尺內
          best = 0;
          for (const a of zs) { let n = 0; for (const b of zs) if (a.position.distanceTo(b.position) < 3) n++; best = Math.max(best, n); }
          if (best >= 6) T.done();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 44
  {
    id: 'waves', title: '難度曲線', say: '好玩的遊戲會<b>慢慢變難</b>:每一波殭屍多一點、耐打一點,還會穿插特別的夜晚。這是遊戲真正用的數字。',
    task: '從圖上找出:<b>第一隻首領</b>在第幾波出現?',
    fact: '設計者用電腦玩家實際跑過,調到「第 2 波買得起左輪、第 4 波買得起 M4」。數字都在 src/game/waves.js。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 660, H = 320, N = 20, x0 = 46, y0 = 270, bw = (W - x0 - 46) / N;
      const P = T.panel({ w: W, h: H, place: 'center' });
      let diff = 'normal', hover = -1;
      const KN = { boss: '首領', pa: '廣播', dark: '停電', rush: '狂奔', swarm: '膿毒', alarm: '警鈴' };
      const draw = () => {
        const g = P.g, D = DIFF[diff];
        P.clear('#0a1416');
        const counts = Array.from({ length: N }, (_, i) => waveCount(i + 1) * D.count), hp = Array.from({ length: N }, (_, i) => hpMul(i + 1, 'walker') * D.hp);
        const cm = Math.max(...counts) * 1.1, hm = 3;
        g.strokeStyle = 'rgba(255,255,255,.08)';
        for (let k = 0; k <= 4; k++) { const y = y0 - (k / 4) * 230; g.beginPath(); g.moveTo(x0, y); g.lineTo(W - 46, y); g.stroke(); g.fillStyle = '#8fa8a1'; g.font = '11px system-ui'; g.fillText(Math.round((k / 4) * cm), 8, y + 4); g.fillText('×' + ((k / 4) * hm).toFixed(1), W - 40, y + 4); }
        counts.forEach((c, i) => {
          const k = waveKind(i + 1), h = (c / cm) * 230, x = x0 + i * bw + 3;
          g.fillStyle = k === 'boss' ? '#ff6b5a' : k ? '#ffcf5a' : i === hover ? '#8fd8ff' : '#4aa8ff';
          g.fillRect(x, y0 - h, bw - 6, h);
          g.fillStyle = '#cfe1da'; g.font = '11px system-ui'; g.textAlign = 'center';
          g.fillText(i + 1, x + (bw - 6) / 2, y0 + 15);
          if (k) { g.fillStyle = k === 'boss' ? '#ff6b5a' : '#ffcf5a'; g.fillText(KN[k] || k, x + (bw - 6) / 2, y0 - h - 6); }
          g.textAlign = 'left';
        });
        g.strokeStyle = '#5fe0a8'; g.lineWidth = 2.5; g.beginPath();
        hp.forEach((v, i) => { const x = x0 + i * bw + bw / 2, y = y0 - (v / hm) * 230; i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.lineWidth = 1;
        g.fillStyle = '#4aa8ff'; g.fillRect(x0, 12, 12, 12); g.fillStyle = '#cfe1da'; g.font = '12px system-ui'; g.fillText('殭屍數量', x0 + 18, 22);
        g.strokeStyle = '#5fe0a8'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0 + 100, 18); g.lineTo(x0 + 118, 18); g.stroke(); g.lineWidth = 1; g.fillText('血量倍率', x0 + 124, 22);
        g.fillText('第幾波 →', W - 100, y0 + 32);
        if (hover >= 0) {
          const n = hover + 1, k = waveKind(n), txt = `第 ${n} 波:${Math.round(counts[hover])} 隻 · 血量 ×${hp[hover].toFixed(2)}${k ? ' · ' + (SPECIAL[k]?.name || KN[k]) : ''}`;
          g.fillStyle = 'rgba(8,24,22,.95)'; const tw = g.measureText(txt).width + 16; const tx = Math.min(W - tw - 6, Math.max(6, x0 + hover * bw - tw / 2)); g.fillRect(tx, 34, tw, 24);
          g.fillStyle = '#e8f1ec'; g.fillText(txt, tx + 8, 51);
        }
      };
      P.on((type, x) => { const i = Math.floor((x - x0) / bw); const nh = i >= 0 && i < N ? i : -1; if (nh !== hover) { hover = nh; draw(); } });
      T.choice({ label: '難度', options: [{ v: 'easy', t: '簡單' }, { v: 'normal', t: '普通' }, { v: 'hard', t: '困難' }, { v: 'nightmare', t: '惡夢' }], value: 'normal', on: (v) => { diff = v; draw(); } });
      T.row();
      let first = 1;
      while (waveKind(first) !== 'boss' && first < 50) first++;
      const opts = [3, first, 10, 12].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).sort((a, b) => a - b);
      T.quiz({ q: '第一隻首領在第幾波?', options: opts.map((n) => `第 ${n} 波`), answer: opts.indexOf(first), why: `第 ${first} 波!之後每 5 波一次,越來越多隻。` });
      draw();
    },
  },
];
