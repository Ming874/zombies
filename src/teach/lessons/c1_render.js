import * as THREE from 'three';
import { override } from '../worldfx.js';
import { fmt, rad, deg, rnd, std, dummy, ring, axes, crate, bulb, line, tween } from './_util.js';

// ===== 第 1 章 畫面是程式畫出來的 =====
export default [
  // ---------------------------------------------------------------- 01
  {
    id: 'look', mode: 'world', title: '你看到的,都是畫出來的',
    say: '遊戲每秒把這個畫面重畫 <b>60</b> 次。現在時間停住了,我們把它拆開來看。',
    task: '切到「線框」,看看醫院是什麼做的',
    fact: '這間醫院沒有一張照片 —— 牆、地板、病床全是三角形拼出來,再塗上顏色。',
    run(T) {
      T.spot('lobby');
      T.keep(T.game.scene, 'overrideMaterial');
      let mode = null, tris = 0;
      T.choice({
        label: '看',
        options: [{ v: null, t: '原本的樣子' }, { v: 'flat', t: '只有形狀' }, { v: 'wire', t: '線框' }],
        on: (v) => { mode = v; override(T.game, v); if (v === 'wire') T.done(); },
      });
      // 線框模式畫的是「線」,三角形計數會掉 → 顯示一般模式最後量到的數字
      T.stat('這一張畫了', () => { if (mode !== 'wire') tris = T.info().triangles || tris; return `${fmt(tris)} <small>個三角形</small>`; }, 'big');
      T.toast('拖曳畫面可以轉頭看看', 2200);
    },
  },
  // ---------------------------------------------------------------- 02
  {
    id: 'trio', title: '三個主角', say: '要畫出 3D 畫面,程式裡一定要有這三樣東西。點一下黃色的字,把它們 <b>new</b> 出來。',
    task: '讓殭屍出現在畫面上',
    fact: '這款遊戲用的是 <b>three.js</b>,一套網頁 3D 函式庫;你在玩的每一個畫面都從這三行開始。',
    studio: { cam: [3.2, 2.2, 4.2], target: [0, 1, 0] },
    run(T) {
      const z = T.zombie('walker', 0);
      z.mesh.rotation.y = -0.5;
      const box = crate(0.8);
      box.position.set(1.4, 0, -0.6);
      box.rotation.y = 0.4;
      const lamp = bulb(0xffd890, 0.09);
      lamp.position.set(-1.2, 2.3, 0.6);
      const pl = new THREE.PointLight(0xffc880, 6, 8, 2);
      lamp.add(pl);
      const stuff = [z.mesh, box, lamp];
      T.add(...stuff);
      const bg = T.scene.background.clone();
      const msg = T.label(new THREE.Vector3(0, 1.1, 0), '', { cls: 'big plain' });
      let ok = false;
      T.code(
        `// 場景:放東西的地方
const scene = {s}
// 相機:從哪裡看
const camera = {c}
// 渲染器:把它畫到螢幕上
const renderer = {r}

scene.add(zombie)
renderer.render(scene, camera)`,
        {
          s: { value: 'null', options: ['null', 'new Scene()'] },
          c: { value: 'null', options: ['null', 'new PerspectiveCamera()'] },
          r: { value: 'null', options: ['null', 'new WebGLRenderer()'] },
        },
        (v) => {
          const miss = v.s === 'null' ? '沒有<b>場景</b>:沒有東西可以畫' : v.c === 'null' ? '沒有<b>相機</b>:不知道從哪裡看' : v.r === 'null' ? '沒有<b>渲染器</b>:沒人把它畫出來' : '';
          ok = !miss;
          for (const o of T.scene.children) o.visible = ok;
          T.scene.background = ok ? bg : new THREE.Color(0x000000);
          msg.set(miss);
          if (ok) { T.done(); T.toast('畫出來了!', 1400); }
        },
        { title: 'main.js', hint: '<b>黃色</b>的字點一下就會換' },
      );
      return { update: () => { if (!ok) for (const o of T.scene.children) o.visible = false; } };
    },
  },
  // ---------------------------------------------------------------- 03
  {
    id: 'mesh', title: '形狀 + 材質 = 物體', say: '每個東西都是一個 <code>Mesh</code>:一個<b>形狀</b>,加上一種<b>材質</b>。',
    task: '做出一顆<b>紅色的球</b>',
    fact: '遊戲裡的槍,是好幾十個方塊、圓柱拼起來的 Mesh;殭屍的牙齒也是。',
    studio: { cam: [2.8, 2.4, 3.6], target: [0, 1.1, 0] },
    run(T) {
      const GEO = {
        BoxGeometry: () => new THREE.BoxGeometry(1.3, 1.3, 1.3),
        SphereGeometry: () => new THREE.SphereGeometry(0.85, 48, 32),
        ConeGeometry: () => new THREE.ConeGeometry(0.85, 1.6, 48),
        TorusGeometry: () => new THREE.TorusGeometry(0.66, 0.26, 24, 64),
        TorusKnotGeometry: () => new THREE.TorusKnotGeometry(0.55, 0.19, 160, 24),
        CapsuleGeometry: () => new THREE.CapsuleGeometry(0.5, 0.75, 8, 24),
      };
      const mat = std(0x4aa8ff, { roughness: 0.35 });
      const mesh = T.add(new THREE.Mesh(GEO.BoxGeometry(), mat));
      mesh.position.y = 1.2;
      mesh.castShadow = true;
      let pop = 1;
      T.code(
        `const shape = new {geo}()
const paint = new MeshStandardMaterial({
  color: {col}
})
const thing = new Mesh(shape, paint)
scene.add(thing)`,
        { geo: { value: 'BoxGeometry', options: Object.keys(GEO) }, col: { value: 0x4aa8ff, type: 'color' } },
        (v, k) => {
          if (k === 'geo') { mesh.geometry.dispose(); mesh.geometry = GEO[v.geo](); pop = 0; }
          mat.color.setHex(v.col);
          if (v.geo === 'SphereGeometry' && v.col === 0xff5a4a) T.done();
        },
      );
      return {
        update(dt, t) {
          mesh.rotation.y = t * 0.6;
          mesh.rotation.x = Math.sin(t * 0.4) * 0.25;
          pop = Math.min(1, pop + dt * 4);
          mesh.scale.setScalar(T.ease.back(pop));
        },
      };
    },
  },
  // ---------------------------------------------------------------- 04
  {
    id: 'xyz', title: '座標:x、y、z', say: '3D 世界裡每個位置都是三個數字:<b style="color:#ff5a4a">左右 x</b>、<b style="color:#5fe0a8">上下 y</b>、<b style="color:#4aa8ff">前後 z</b>。',
    task: '改數字,把箱子移到<b>黃色框</b>裡(左右拖曳數字)',
    fact: '玩家、每隻殭屍、每顆子彈,遊戲每一幀都在更新它們的 x、y、z。',
    studio: { cam: [9.5, 8.5, 12], target: [0, 0.8, 0], orbit: { max: 30 } },
    run(T) {
      T.add(axes(4.5));
      T.label(new THREE.Vector3(4.9, 0.1, 0), 'x', { cls: 'hot big plain' });
      T.label(new THREE.Vector3(0, 4.8, 0), 'y', { cls: 'ok big plain' });
      T.label(new THREE.Vector3(0, 0.1, 4.9), 'z', { cls: 'blu big plain' });
      const box = T.add(crate(1, 0xffcf5a));
      box.material.color.set(0xd9a640);
      const ghost = T.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04).translate(0, 0.52, 0)), new THREE.LineBasicMaterial({ color: 0xffcf5a })));
      const pad = T.add(ring(0.75));
      const drop = T.add(line([new THREE.Vector3(), new THREE.Vector3()], 0xffcf5a, { dashed: true, opacity: 0.6 }));
      const tag = T.label(box, '', { cls: 'mono', dy: 1.25 });
      let hits = 0;
      const tgt = new THREE.Vector3();
      const newTarget = () => {
        do tgt.set(Math.round(rnd(-4, 4) * 2) / 2, Math.round(rnd(0, 2.5) * 2) / 2, Math.round(rnd(-4, 4) * 2) / 2); while (tgt.distanceTo(box.position) < 2);
        ghost.position.copy(tgt);
        pad.position.set(tgt.x, 0.01, tgt.z);
        drop.set([new THREE.Vector3(tgt.x, 0.02, tgt.z), new THREE.Vector3(tgt.x, tgt.y, tgt.z)]);
      };
      newTarget();
      const st = T.stat('命中', () => hits);
      let wait = 0;
      T.code(`box.position.set({x}, {y}, {z})`,
        { x: { value: 0, min: -4, max: 4, step: 0.5 }, y: { value: 0, min: 0, max: 3, step: 0.5 }, z: { value: 0, min: -4, max: 4, step: 0.5 } },
        (v) => {
          box.position.set(v.x, v.y, v.z);
          tag.set(`(${v.x}, ${v.y}, ${v.z})`);
          if (box.position.distanceTo(tgt) < 0.01 && wait <= 0) {
            hits++; T.done(); T.toast('命中!再一個', 1000);
            wait = 0.6;
          }
        }, { title: '移動箱子' });
      return { update(dt, t) { pad.scale.setScalar(1 + Math.sin(t * 4) * 0.06); if (wait > 0 && (wait -= dt) <= 0) newTarget(); } };
    },
  },
  // ---------------------------------------------------------------- 05
  {
    id: 'rot', title: '旋轉與縮放', say: '除了位置,每個物體還有<b>轉幾度</b>和<b>放大幾倍</b>。',
    task: '把槍轉過去,瞄準殭屍(雷射碰到牠)',
    fact: '你在遊戲裡轉動滑鼠,其實就是在改相機的 <code>rotation.y</code>(左右)和 <code>rotation.x</code>(上下)。',
    studio: { cam: [3.5, 4.8, 7.5], target: [0, 0.8, -1.2] },
    run(T) {
      const pivot = new THREE.Group();
      pivot.position.y = 1;
      const gun = T.gun('ak47');
      const bb = new THREE.Box3().setFromObject(gun), c = bb.getCenter(new THREE.Vector3());
      gun.position.sub(c);
      pivot.add(gun);
      T.add(pivot);
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.85 });
      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2).translate(0, 0, -0.5), laserMat);
      pivot.add(laser);
      const z = T.zombie('walker', 1);
      const ang = rad(rnd(35, 150) * (Math.random() < 0.5 ? -1 : 1));
      z.mesh.position.set(Math.sin(ang) * -4.2, 0, Math.cos(ang) * -4.2);
      z.mesh.lookAt(0, 0, 0);
      T.add(z.mesh);
      const zl = T.label(z.mesh, '目標', { cls: 'hot', dy: 2 });
      const fwd = new THREE.Vector3(), to = new THREE.Vector3();
      let hit = false;
      T.code(`// 轉幾度
gun.rotation.y = degToRad({d})
// 放大幾倍
gun.scale.setScalar({s})`,
        { d: { value: 0, min: -180, max: 180, step: 5 }, s: { value: 3, min: 0.5, max: 6, step: 0.1 } },
        (v) => { pivot.rotation.y = rad(v.d); gun.scale.setScalar(v.s); },
        { title: '轉動槍', hint: '數字左右拖;<b>正數</b>往左轉,<b>負數</b>往右轉' });
      return {
        update() {
          pivot.updateMatrixWorld();
          pivot.getWorldDirection(fwd).negate();
          to.set(z.mesh.position.x, 1, z.mesh.position.z).sub(pivot.position).normalize();
          const a = deg(fwd.angleTo(to));
          const len = a < 7 ? z.mesh.position.distanceTo(pivot.position) - 0.2 : 12;
          laser.scale.set(1, 1, len);
          if (a < 7 && !hit) { hit = true; zl.set('瞄準了!'); zl.el.className = 'tl ok big'; T.done(); }
          else if (a >= 7 && hit) { hit = false; zl.set('目標'); zl.el.className = 'tl hot'; }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 06
  {
    id: 'parent', title: '父子關係', say: '把手電筒「放進」玩家裡面,玩家走到哪,它就跟到哪。',
    task: '先把手電筒交給玩家,再<b>拖著玩家</b>走一圈',
    fact: '遊戲裡的槍是相機的「小孩」:你轉頭,槍就跟著轉;殭屍的手是手臂的小孩,手臂是身體的小孩。',
    studio: { cam: [5.5, 6, 7], target: [0, 0.5, 0], light: 'dark', env: false },
    run(T) {
      T.hemi.intensity = 0.7;
      const p = T.add(dummy(0x6fa6d8, { eye: 0xffffff }));
      const torch = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.32, 14).rotateX(Math.PI / 2), std(0x2a2d30, { metalness: 0.6, roughness: 0.4 }));
      torch.add(body);
      const sp = new THREE.SpotLight(0xfff1d0, 40, 14, 0.42, 0.45, 1.5);
      sp.position.set(0, 0, 0.17);
      sp.castShadow = true;
      sp.target.position.set(0, -0.35, 2);
      torch.add(sp, sp.target);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 1.36), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
      cone.rotation.x = 0.15;
      torch.add(cone);
      torch.position.set(2.2, 0.06, 1.4);
      T.add(torch);
      for (let i = 0; i < 6; i++) { const b = T.add(crate(rnd(0.5, 0.9))); const a = (i / 6) * Math.PI * 2; b.position.set(Math.cos(a) * 4, 0, Math.sin(a) * 4); b.rotation.y = a; }
      const local = new THREE.Vector3(0.32, 1.15, 0.28);
      let attached = false, walked = 0;
      const last = new THREE.Vector3();
      T.drag(p, { plane: 'xz', clamp: (q) => { q.y = 0; q.x = Math.max(-5, Math.min(5, q.x)); q.z = Math.max(-5, Math.min(5, q.z)); } ,
        onMove(pos) {
          const d = pos.distanceTo(last);
          if (d > 0.001) { p.rotation.y = Math.atan2(pos.x - last.x, pos.z - last.z); }
          if (attached) { walked += d; if (walked > 4) T.done(); }
          last.copy(pos);
        } });
      const tag = T.label(p, '拖我', { cls: 'acc', dy: 2.05 });
      T.code(`{who}.add(flashlight)`, { who: { value: 'scene', options: ['scene', 'player'] } }, (v) => {
        attached = v.who === 'player';
        if (attached) { p.attach(torch); torch.position.copy(local); torch.rotation.set(0, 0, 0); walked = 0; tag.set('拖我走'); }
        else { T.scene.attach(torch); }
      }, { title: '手電筒是誰的小孩?' });
      return { update() { last.copy(p.position); } };
    },
  },
  // ---------------------------------------------------------------- 07
  {
    id: 'fov', title: '相機的視野', say: '<code>fov</code> 是相機張開的角度:角度大看得廣,角度小像望遠鏡。',
    task: '試試<b>望遠鏡</b>(15 以下)和<b>魚眼</b>(110 以上)',
    fact: '巴雷特的狙擊鏡放大 6 倍,做法就是把 fov 縮小成大約 1/6。遊戲設定裡的「FOV」也是這個數字。',
    studio: { floor: false, light: 'none', bg: 0x0b1214, fog: [10, 48] },
    run(T) {
      const sh = T.sh;
      T.view([0, 1.6, 4], [0, 1.6, -10], { fly: false, rotate: false, zoom: false, fit: false });
      T.add(new THREE.HemisphereLight(0xbfe0ff, 0x1a2224, 0.5));
      const floor = T.add(new THREE.Mesh(new THREE.PlaneGeometry(6, 44).rotateX(-Math.PI / 2), std(0x2b3a36, { roughness: 0.8 })));
      floor.position.z = -14;
      floor.receiveShadow = true;
      for (let i = 0; i < 11; i++) {
        for (const s of [-1, 1]) {
          const col = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4).translate(0, 1.6, 0), std(i % 2 ? 0x6b8f86 : 0x55756d)));
          col.position.set(s * 2.4, 0, 2 - i * 3.6);
        }
        const l = new THREE.PointLight(i % 3 === 1 ? 0xff8866 : 0xd8f0ff, 5, 7, 2);
        l.position.set(0, 3, 2 - i * 3.6);
        const b = bulb(i % 3 === 1 ? 0xff8866 : 0xd8f0ff, 0.06);
        b.position.copy(l.position);
        T.add(l, b);
      }
      const z = T.zombie('runner', 0);
      z.mesh.position.set(0.3, 0, -19);
      z.mesh.rotation.y = 0.1;
      T.add(z.mesh);
      T.label(z.mesh, '殭屍在這', { cls: 'hot', dy: 2 });
      let tele = false, fish = false;
      T.keep(sh.cam, 'fov');
      T.onDispose(() => sh.cam.updateProjectionMatrix());
      T.code(`camera.fov = {fov}   // 度`, { fov: { value: 70, min: 5, max: 140, step: 1 } }, (v) => {
        sh.cam.fov = v.fov;
        sh.cam.updateProjectionMatrix();
        tele ||= v.fov <= 15;
        fish ||= v.fov >= 110;
        if (tele && fish) T.done();
      }, { title: '相機' });
      T.stat('望遠鏡', () => (tele ? '✓' : '—'));
      T.stat('魚眼', () => (fish ? '✓' : '—'));
    },
  },
  // ---------------------------------------------------------------- 08
  {
    id: 'frustum', title: '相機看得到的範圍', say: '相機只看得到一個<b>金字塔</b>形的範圍。在範圍外的東西,遊戲乾脆<b>不畫</b>,省力氣。',
    task: '轉動相機,讓 <b>4 隻殭屍</b>同時都被看到',
    fact: '這叫「視錐剔除」。醫院有 75 個區域,但你每一幀只畫看得到的那一小塊。',
    studio: { cam: [0, 15, 11], target: [0, 0, -2.5], orbit: { max: 30 } },
    run(T) {
      const eye = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 11);
      eye.position.set(0, 1.4, 3);
      T.add(eye);
      const helper = T.add(new THREE.CameraHelper(eye));
      const camBody = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), std(0xffcf5a)));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 16).rotateX(Math.PI / 2), std(0x222222));
      lens.position.z = -0.38;
      camBody.add(lens);
      const spots = [[-5, -4], [4.5, -5.5], [-1.5, -8], [5.5, 0.5]];
      const zs = spots.map(([x, zz], i) => {
        const d = T.add(dummy(0x6f8f6a));
        d.position.set(x, 0, zz);
        d.rotation.y = Math.atan2(eye.position.x - x, eye.position.z - zz);
        const L = T.label(d, '', { cls: 'dot', dy: 2 });
        return { d, L, sphere: new THREE.Sphere(new THREE.Vector3(x, 0.9, zz), 0.55) };
      });
      const fr = new THREE.Frustum(), m4 = new THREE.Matrix4();
      const pipW = 300, pipH = 168;
      T.post((R) => { // 角落小視窗:這台相機看到的畫面
        const w = R.domElement.clientWidth, h = R.domElement.clientHeight;
        const x = w - pipW - 16, y = 84;
        R.setScissorTest(true);
        R.setViewport(x, h - y - pipH, pipW, pipH);
        R.setScissor(x, h - y - pipH, pipW, pipH);
        helper.visible = false; camBody.visible = false;
        R.render(T.scene, eye);
        helper.visible = true; camBody.visible = true;
        R.setScissorTest(false);
        R.setViewport(0, 0, w, h);
      });
      T.sh.ui.side.style.top = '296px';
      T.onDispose(() => { T.sh.ui.side.style.top = ''; });
      const pipLbl = document.createElement('div');
      pipLbl.className = 'tl acc';
      pipLbl.style.cssText = `left:auto;right:${16}px;top:${84 + pipH + 4}px;transform:none;position:absolute;margin:0`;
      pipLbl.textContent = '黃色相機看到的';
      T.sh.ui.lbl.appendChild(pipLbl);
      let yaw = 0, fov = 50;
      const apply = () => {
        eye.rotation.set(0, rad(yaw), 0);
        eye.fov = fov;
        eye.updateProjectionMatrix();
        eye.updateMatrixWorld();
        helper.update();
        camBody.position.copy(eye.position);
        camBody.rotation.copy(eye.rotation);
      };
      T.slider({ label: '轉向', min: -90, max: 90, step: 1, value: 0, unit: '°', on: (v) => { yaw = -v; apply(); } });
      T.slider({ label: 'fov', min: 20, max: 140, step: 1, value: 50, unit: '°', on: (v) => { fov = v; apply(); } });
      T.stat('有畫', () => zs.filter((q) => q.in).length + ' / 4');
      return {
        update() {
          m4.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse);
          fr.setFromProjectionMatrix(m4);
          let n = 0;
          for (const q of zs) {
            q.in = fr.intersectsSphere(q.sphere);
            q.d.userData.mat.color.set(q.in ? 0x7fd08a : 0x3a4440);
            q.L.set(q.in ? '畫' : '不畫');
            q.L.el.className = 'tl dot ' + (q.in ? 'ok' : '');
            if (q.in) n++;
          }
          if (n === 4) T.done();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 09
  {
    id: 'fps', title: '每秒 60 張圖', say: '動畫是一張一張的圖快速翻過去。每秒翻幾張,叫做 <b>FPS</b>。',
    task: '比比看 <b>5 FPS</b> 和 <b>60 FPS</b>',
    fact: '要做到 60 FPS,遊戲每一張圖只有 <b>16.7 毫秒</b>可以算完:移動殭屍、算子彈、再畫出整間醫院。',
    studio: { cam: [0, 4.2, 7.5], target: [0, 1, 0] },
    run(T) {
      const z = T.zombie('runner', 1);
      T.add(z.mesh);
      const trail = [];
      const tm = new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.5 });
      const tg = new THREE.SphereGeometry(0.06, 8, 6);
      for (let i = 0; i < 14; i++) { const m = T.add(new THREE.Mesh(tg, tm.clone())); m.visible = false; trail.push(m); }
      const P = T.panel({ w: 520, h: 64, place: 'bottom', cls: 'clear' });
      let fps = 60, acc = 0, t = 0, shown = 0, frames = [];
      let s5 = false, s60 = false;
      T.slider({ label: 'FPS', min: 1, max: 60, step: 1, value: 60, on: (v) => { fps = v; if (v <= 5) s5 = true; if (v >= 60) s60 = true; if (s5 && s60) T.done(); } });
      T.stat('每張間隔', () => `${(1000 / fps).toFixed(1)} ms`);
      const B = z.bones;
      const place = (tt) => {
        const a = tt * 1.1;
        z.mesh.position.set(Math.cos(a) * 3, 0, Math.sin(a) * 2);
        z.mesh.rotation.y = -a;
        const w = Math.sin(tt * 7);
        B.thighL.rotation.x = -w * 0.45; B.thighR.rotation.x = w * 0.45;
        B.shinL.rotation.x = Math.max(0, -w) * 0.6; B.shinR.rotation.x = Math.max(0, w) * 0.6;
        B.upperArmL.rotation.x = -1.2 + w * 0.1; B.upperArmR.rotation.x = -1.1 - w * 0.1;
      };
      let ti = 0;
      return {
        update(dt) {
          t += dt;
          acc += dt;
          if (acc >= 1 / fps) { // 到了該翻下一張的時間:更新位置(畫面才會變)
            acc %= 1 / fps;
            shown = t;
            place(shown);
            const m = trail[ti++ % trail.length];
            m.visible = fps <= 24;
            m.userData.age = 0;
            m.position.copy(z.mesh.position).setY(0.05);
            frames.push(t);
          }
          for (const m of trail) { m.userData.age = (m.userData.age ?? 9) + dt; m.material.opacity = Math.max(0, 0.65 * (1 - m.userData.age / 1.3)); }
          frames = frames.filter((f) => t - f < 1);
          // 底下的格子:過去一秒翻了哪幾張
          const g = P.g;
          P.clear();
          g.fillStyle = 'rgba(255,255,255,.55)';
          g.font = '12px system-ui';
          g.fillText('過去 1 秒畫的每一張', 4, 13);
          for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(4 + i * 8.5, 22, 7, 34); }
          for (const f of frames) { const i = Math.floor((1 - (t - f)) * 60); g.fillStyle = '#ffcf5a'; g.fillRect(4 + Math.min(59, i) * 8.5, 22, 7, 34); }
        },
      };
    },
  },
];
