import * as THREE from 'three';
import { variantCount } from '../../zombies/model.js';
import { fmt, rnd, std, dummy, line, tween } from './_util.js';

const VCOL = 0xffcf5a;
function handle(color = VCOL, r = 0.13) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color }));
  m.renderOrder = 5;
  return m;
}

// ===== 第 2 章 三角形的魔法 =====
export default [
  // ---------------------------------------------------------------- 10
  {
    id: 'vertex', title: '一切從「點」開始', say: '3D 模型最小的單位是<b>頂點</b>:空間裡的一個點,三個數字 (x, y, z)。',
    task: '在地上點 <b>3 個</b>頂點',
    fact: '殭屍模型的每個頂點,除了位置還記著「屬於哪根骨頭」,所以牠才能動。',
    studio: { cam: [0, 9, 7.5], target: [0, 0, 0] },
    run(T) {
      const pts = [];
      const poly = T.add(line([new THREE.Vector3(), new THREE.Vector3()], 0xffcf5a, { dashed: true, opacity: 0.5 }));
      poly.visible = false;
      const code = T.code('', {}, null, { title: '頂點清單', hint: '在地上點一下,就多一個頂點' });
      const show = () => {
        const rows = pts.map((p, i) => `  [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}],   // ${i + 1}`).join('\n');
        code.src(`const points = [\n${rows || '  // 還沒有點'}\n]`);
        if (pts.length > 1) { poly.set(pts.map((p) => p.clone().setY(0.03))); poly.visible = true; }
      };
      show();
      T.click(null, (h) => {
        if (!h.point || pts.length >= 10) return;
        const p = h.point.clone();
        p.x = Math.round(p.x * 2) / 2; p.z = Math.round(p.z * 2) / 2; p.y = 0;
        if (Math.abs(p.x) > 7 || Math.abs(p.z) > 7) return;
        pts.push(p);
        const m = T.add(handle());
        m.position.copy(p).setY(0.13);
        tween(T, 0.35, (k) => m.scale.setScalar(T.ease.back(k)));
        T.label(m, `${pts.length}`, { cls: 'dot acc', dy: 0.35 });
        show();
        if (pts.length >= 3) T.done();
      });
      T.button('清除', () => T.sh.go(T.sh.i, 0));
    },
  },
  // ---------------------------------------------------------------- 11
  {
    id: 'tri', title: '三點連成一個面', say: '三個頂點連起來就是一個<b>三角形</b>。顯示卡只會畫一種東西:三角形。',
    task: '加第 4 個點,再把它<b>往上拉</b>,看看會發生什麼',
    fact: '一個正方形 = 2 個三角形。三角形永遠是平的,所以不會「歪掉」,顯示卡最喜歡它。',
    studio: { cam: [0, 5.5, 6.5], target: [0, 0.6, 0] },
    run(T) {
      const P = [new THREE.Vector3(-1.8, 0.1, 1.2), new THREE.Vector3(1.8, 0.1, 1.2), new THREE.Vector3(0, 0.1, -1.6), new THREE.Vector3(-1.8, 0.1, -1.6)];
      let n = 3;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
      const face = T.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })));
      const edges = T.add(line([new THREE.Vector3(), new THREE.Vector3()], 0xffffff));
      const diag = T.add(line([new THREE.Vector3(), new THREE.Vector3()], 0xffffff, { dashed: true }));
      const names = ['A', 'B', 'C', 'D'];
      const hs = P.map((p, i) => {
        const h = T.add(handle());
        h.position.copy(p);
        h.visible = i < 3;
        T.drag(h, { plane: 'view', onMove: () => { moved = true; } });
        h.userData.L = T.label(h, names[i], { cls: 'dot acc', dy: 0.32 });
        h.userData.L.show(i < 3);
        return h;
      });
      let moved = false;
      const cA = new THREE.Color(0x4aa8ff), cB = new THREE.Color(0xff8a5a);
      const tri = T.stat('三角形', () => (n === 3 ? 1 : 2));
      const btn = T.button('加第 4 個點', () => {
        n = 4; hs[3].visible = true; hs[3].userData.L.show(true);
        btn.el.style.display = 'none';
        T.toast('現在是 2 個三角形:ABC 和 ACD。把 D 往上拉看看', 2600);
      }, 'hot');
      return {
        update() {
          const p = hs.map((h) => h.position);
          const pos = geo.attributes.position, col = geo.attributes.color;
          const tris = n === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
          tris.forEach((t, k) => t.forEach((vi, j) => { pos.setXYZ(k * 3 + j, p[vi].x, p[vi].y, p[vi].z); const c = k ? cB : cA; col.setXYZ(k * 3 + j, c.r, c.g, c.b); }));
          geo.setDrawRange(0, tris.length * 3);
          pos.needsUpdate = true; col.needsUpdate = true;
          geo.computeBoundingSphere();
          edges.set(n === 3 ? [p[0], p[1], p[2], p[0]] : [p[0], p[1], p[2], p[3], p[0]]);
          diag.visible = n === 4;
          if (n === 4) {
            diag.set([p[0], p[2]]);
            // D 離開 ABC 那個平面夠遠 → 摺起來了
            const pl = new THREE.Plane().setFromCoplanarPoints(p[0], p[1], p[2]);
            if (Math.abs(pl.distanceToPoint(p[3])) > 0.6) T.done();
          }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 12
  {
    id: 'round', title: '三角形越多,越圓', say: '電腦裡沒有真正的「圓」,只有很多很多小三角形。',
    task: '把球切到最粗(<b>4 以下</b>),再切到很細(<b>32 以上</b>)',
    fact: '殭屍的頭大約用了上千個三角形;遠處看不清楚的東西,遊戲會偷偷用比較少的三角形畫。',
    studio: { cam: [0, 2.2, 4.6], target: [0, 1.2, 0] },
    run(T) {
      const mat = std(0x6cc4ff, { roughness: 0.3, flatShading: true });
      const ball = T.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat));
      ball.position.y = 1.2;
      ball.castShadow = true;
      const wmat = new THREE.MeshBasicMaterial({ color: 0x08202a, wireframe: true, transparent: true, opacity: 0.6 });
      const wire = new THREE.Mesh(ball.geometry, wmat);
      wire.scale.setScalar(1.002);
      ball.add(wire);
      let lo = false, hi = false;
      T.code(`new SphereGeometry(1, {w}, {h})`, { w: { value: 8, min: 3, max: 64, step: 1 }, h: { value: 6, min: 2, max: 48, step: 1 } }, (v) => {
        ball.geometry.dispose();
        ball.geometry = wire.geometry = new THREE.SphereGeometry(1, v.w, v.h);
        if (v.w <= 4) lo = true;
        if (v.w >= 32) hi = true;
        if (lo && hi) T.done();
      }, { title: '一顆球', hint: '第一個 <b>黃色</b>數字 = 繞一圈切幾刀,第二個 = 上下切幾刀' });
      T.stat('三角形', () => fmt(T.tris(ball)), 'big');
      T.toggle({ label: '線框', value: true, on: (v) => { wire.visible = v; } });
      T.toggle({ label: '平滑', value: false, on: (v) => { mat.flatShading = !v; mat.needsUpdate = true; } });
      return { update(dt, t) { ball.rotation.y = t * 0.3; } };
    },
  },
  // ---------------------------------------------------------------- 13
  {
    id: 'build', title: '用形狀拼一隻殭屍', say: '遊戲裡的殭屍,也是程式用一塊一塊的形狀拼出來的。按按鈕,一塊一塊加上去。',
    task: '把 7 個部位都加上去,讓它活過來',
    fact: '真正的殭屍程式(src/zombies/model.js)有 1500 行:決定胖瘦、駝背、斷手、衣服破洞、傷口位置。',
    studio: { cam: [2.6, 2.2, 3.6], target: [0, 1, 0] },
    run(T) {
      const skin = std(0x7d9a6c, { roughness: 0.85 });
      const cloth = std(0x5d6f86, { roughness: 0.9 });
      const eye = new THREE.MeshBasicMaterial({ color: 0xffe14a });
      const root = T.add(new THREE.Group());
      const PARTS = [
        ['身體', 'CapsuleGeometry', () => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 16), cloth); m.position.y = 1.15; return m; }],
        ['頭', 'SphereGeometry', () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 16), skin); m.position.set(0, 1.72, 0.03); return m; }],
        ['左手', 'CapsuleGeometry', () => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), skin); m.rotation.x = Math.PI / 2 - 0.2; m.position.set(0.33, 1.38, 0.3); return m; }],
        ['右手', 'CapsuleGeometry', () => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), skin); m.rotation.x = Math.PI / 2 - 0.1; m.position.set(-0.33, 1.36, 0.3); return m; }],
        ['左腳', 'CylinderGeometry', () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.8, 12), cloth); m.position.set(0.13, 0.42, 0); return m; }],
        ['右腳', 'CylinderGeometry', () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.8, 12), cloth); m.position.set(-0.13, 0.42, 0); m.rotation.x = 0.15; return m; }],
        ['眼睛', 'SphereGeometry', () => { const g = new THREE.Group(); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eye); e.position.set(s * 0.07, 1.75, 0.2); g.add(e); } return g; }],
      ];
      const lines = [];
      const code = T.code('', {}, null, { title: 'makeZombie()', hint: '按下面的按鈕,程式就多一行' });
      const show = () => code.src(`const zombie = new Group()\n// add(形狀, 材質)\n${lines.join('\n')}${lines.length === PARTS.length ? '\n// 完成!' : ''}`);
      show();
      let added = 0, alive = false;
      for (const [name, geo, make] of PARTS) {
        const b = T.button('+ ' + name, () => {
          const m = make();
          m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          root.add(m);
          const y0 = m.position.y;
          tween(T, 0.45, (k) => { m.position.y = y0 + (1 - T.ease.bounce(k)) * 1.2; });
          lines.push(`add(new ${geo}(), ${name === '眼睛' ? 'glow' : name.includes('腳') || name === '身體' ? 'cloth' : 'skin'})  // ${name}`);
          show();
          b.el.style.display = 'none';
          if (++added === PARTS.length) { alive = true; T.done(); T.toast('它活過來了!', 1500); }
        });
      }
      return { update(dt, t) { if (alive) { root.rotation.z = Math.sin(t * 2.2) * 0.06; root.position.z = Math.sin(t * 1.1) * 0.15; root.rotation.y = Math.sin(t * 0.5) * 0.3; } } };
    },
  },
  // ---------------------------------------------------------------- 14
  {
    id: 'seed', title: '同一份程式,不同的殭屍', say: '換一個<b>種子</b>數字,程式就算出一隻長得不一樣的殭屍。',
    task: '看過 <b>5 隻</b>不一樣的殭屍',
    fact: '「程式生成」:很多遊戲的地圖、樹、星球都這樣做。用很少的程式碼,做出很多種變化。',
    studio: { cam: [0.3, 1.4, 4.2], target: [0, 0.95, 0] },
    run(T) {
      let cur = null;
      const seen = new Set();
      const TYPES = ['walker', 'runner', 'bloater', 'brute', 'burned', 'hazmat', 'surgeon', 'straitjacket'];
      const NAMES = { walker: '行屍', runner: '狂奔者', bloater: '膿腫者', brute: '巨屍', burned: '焦屍', hazmat: '清理隊員', surgeon: '手術者', straitjacket: '束縛病患' };
      const tag = T.label(new THREE.Vector3(0, 0, 0.7), '', { cls: 'acc big' });
      const show = (type, k) => {
        if (cur) { T.scene.remove(cur.mesh); }
        const n = variantCount(type);
        const z = T.zombie(type, k % n);
        z.mesh.rotation.y = -0.2;
        T.add(z.mesh);
        cur = z;
        tween(T, 0.3, (q) => z.mesh.scale.setScalar(0.85 + 0.15 * T.ease.back(q)));
        seen.add(type + ':' + (k % n));
        tag.set(`${NAMES[type]} #${k % n}`);
        if (seen.size >= 5) T.done();
      };
      T.code(`const zombie = makeZombie('{type}', {k})`, {
        type: { value: 'walker', options: TYPES },
        k: { value: 0, min: 0, max: 5, step: 1 },
      }, (v) => show(v.type, v.k), { title: '生出一隻殭屍', hint: '點<b>種類</b>換一種,拖<b>數字</b>換一隻' });
      T.stat('看過', () => `${seen.size} 隻`);
      return { update(dt, t) { if (cur) cur.mesh.rotation.y = -0.2 + Math.sin(t * 0.5) * 0.6; } };
    },
  },
  // ---------------------------------------------------------------- 15
  {
    id: 'back', title: '背面不畫', say: '每個三角形分<b>正面</b>和<b>背面</b>。為了省力,遊戲通常只畫正面。',
    task: '用滾輪把相機<b>鑽進盒子裡</b>,看看牆跑去哪了',
    fact: '在遊戲裡鏡頭卡進牆壁時,會「看穿」到外面,就是因為牆的背面沒有畫。',
    studio: { cam: [8, 5.5, 9.5], target: [0, 1.2, 0], orbit: { min: 0.3, max: 18, maxPolar: Math.PI * 0.48 } },
    run(T) {
      const S = { w: 4, h: 2.6, d: 4 };
      const mats = [0xc9b28f, 0xc9b28f, 0x8f9fa0, 0x6d7b6d, 0xb7a58a, 0xb7a58a].map((c) => std(c, { side: THREE.FrontSide }));
      const room = T.add(new THREE.Mesh(new THREE.BoxGeometry(S.w, S.h, S.d).translate(0, S.h / 2 + 0.005, 0), mats));
      room.receiveShadow = true;
      const z = T.zombie('walker', 3);
      z.mesh.position.set(0.6, 0, -0.5);
      z.mesh.rotation.y = 0.6;
      T.add(z.mesh);
      const lamp = new THREE.PointLight(0xfff0d0, 6, 6, 2);
      lamp.position.set(0, 2.2, 0);
      T.add(lamp);
      T.code(`wall.side = {side}`, { side: { value: 'FrontSide', options: ['FrontSide', 'BackSide', 'DoubleSide'] } }, (v) => {
        for (const m of mats) { m.side = THREE[v.side]; m.needsUpdate = true; }
      }, { title: '牆的材質', hint: '<b>FrontSide</b> 只畫正面、<b>BackSide</b> 只畫背面、<b>DoubleSide</b> 兩面都畫' });
      const box = new THREE.Box3(new THREE.Vector3(-S.w / 2, 0, -S.d / 2), new THREE.Vector3(S.w / 2, S.h, S.d / 2));
      const st = T.stat('相機在', () => (box.containsPoint(T.sh.cam.position) ? '盒子裡' : '盒子外'));
      return { update() { if (box.containsPoint(T.sh.cam.position)) T.done(); } };
    },
  },
];
