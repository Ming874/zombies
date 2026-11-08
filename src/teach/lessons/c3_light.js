import * as THREE from 'three';
import { getVariant } from '../../zombies/model.js';
import { fmt, rad, rnd, std, dummy, crate, bulb, line, tween, clamp } from './_util.js';

// 骰子/數字貼圖(畫在 canvas 上)
function faceTex(text, bg = '#e9e2d0', fg = '#20303a') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
  g.fillStyle = fg; g.font = 'bold 150px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function checker(n = 8) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), s = 256 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? '#2b3a40' : '#e8e2d2'; g.fillRect(x * s, y * s, s, s); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ===== 第 3 章 光、顏色與材質 =====
export default [
  // ---------------------------------------------------------------- 16
  {
    id: 'pixel', title: '螢幕是一格一格的', say: '三角形最後要變成螢幕上的<b>像素</b>:三角形蓋到哪幾格,那幾格就塗上顏色。',
    task: '把解析度調到<b>最低</b>,再調到<b>最高</b>(拖黃點可以改三角形)',
    fact: '遊戲有「動態解析度」:畫面太卡時,偷偷把格子變大一點,你幾乎看不出來,但快很多。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 560, H = 360;
      const P = T.panel({ w: W, h: H, place: 'center' });
      const v = [[90, 300], [470, 250], [260, 50]];
      let n = 24, lo = false, hi = false, grab = -1, outline = true;
      const inside = (x, y) => {
        const e = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        const w0 = e(v[0], v[1]), w1 = e(v[1], v[2]), w2 = e(v[2], v[0]);
        return (w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0);
      };
      let filled = 0;
      const draw = () => {
        const g = P.g, cs = W / n, rows = Math.ceil(H / cs);
        P.clear('#0a1416');
        filled = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) {
          const x = c * cs, y = r * cs;
          const on = inside(x + cs / 2, y + cs / 2);
          if (on) filled++;
          g.fillStyle = on ? `hsl(${190 + (c / n) * 30}, 70%, ${45 + (r / rows) * 20}%)` : 'rgba(255,255,255,0.03)';
          g.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
        }
        if (outline) {
          g.strokeStyle = '#ffffff'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(...v[0]); g.lineTo(...v[1]); g.lineTo(...v[2]); g.closePath(); g.stroke();
        }
        for (const p of v) { g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(p[0], p[1], 8, 0, 7); g.fill(); }
      };
      P.on((type, x, y) => {
        if (type === 'down') { grab = v.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 18); }
        else if (type === 'drag' && grab >= 0) { v[grab] = [clamp(x, 0, W), clamp(y, 0, H)]; draw(); }
        else if (type === 'up') grab = -1;
        P.cv.style.cursor = grab >= 0 || v.some((p) => Math.hypot(p[0] - x, p[1] - y) < 18) ? 'grab' : '';
      });
      T.slider({ label: '解析度', min: 4, max: 112, step: 1, value: 24, fmt: (x) => `${x} 格寬`, on: (x) => { n = x; if (x <= 4) lo = true; if (x >= 112) hi = true; if (lo && hi) T.done(); draw(); } });
      T.toggle({ label: '三角形邊線', value: true, on: (x) => { outline = x; draw(); } });
      T.stat('塗了', () => `${filled} 格`);
      draw();
    },
  },
  // ---------------------------------------------------------------- 17
  {
    id: 'rgb', title: '紅、綠、藍', say: '螢幕上的每一種顏色,都是<b>紅綠藍</b>三盞小燈混出來的。',
    task: '只開<b>紅</b>和<b>綠</b>,看看會變什麼顏色',
    fact: '拿放大鏡看手機螢幕,會看到一顆顆紅綠藍的小點。程式裡寫顏色 <code>0xff0000</code>,就是「紅開到最大、綠藍關掉」。',
    studio: { cam: [0, 1.7, 5.2], target: [0, 1.6, 0], floor: true, light: 'dark', env: false, bg: 0x050808 },
    run(T) {
      T.hemi.intensity = 0.02;
      const wall = T.add(new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })));
      wall.position.set(0, 2.5, -1.2);
      const C = [[0xff0000, -0.4, 0.25], [0x00ff00, 0.4, 0.25], [0x0000ff, 0, -0.45]];
      const L = C.map(([c, x, y]) => {
        const s = new THREE.SpotLight(c, 0, 14, 0.19, 0.12, 0);
        s.position.set(x * 1.6, 1.6 + y * 1.6, 2.2);
        s.target.position.set(x, 1.6 + y, -1.2);
        T.add(s, s.target);
        const b = T.add(bulb(c, 0.05));
        b.position.copy(s.position);
        return s;
      });
      const val = [0, 0, 0];
      const hexOf = () => '#' + val.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
      const sw = () => T.stat('混出來', () => `<i style="display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:-3px;background:${hexOf()};border:1px solid #fff4"></i> ${hexOf()}`);
      ['紅', '綠', '藍'].forEach((nm, i) => T.slider({ label: nm, min: 0, max: 1, step: 0.05, value: 0, fmt: (x) => Math.round(x * 255), on: (x) => {
        val[i] = x;
        L[i].intensity = x * 3.2;
        if (val[0] > 0.75 && val[1] > 0.75 && val[2] < 0.1) { T.done(); T.toast('紅 + 綠 = <b style="color:#ff0">黃</b>!', 1800); }
      } }));
      T.row();
      sw();
      T.quiz({ q: '紅 + 綠 + 藍 全開 = ?', options: ['黑色', '白色', '咖啡色'], answer: 1, why: '三盞全開就是白色。試試看把三根拉桿都拉滿!' });
    },
  },
  // ---------------------------------------------------------------- 18
  {
    id: 'dark', title: '沒有光,就什麼都看不到', say: '3D 世界裡,東西會亮是因為有<b>燈</b>照到它。移動滑鼠,用手電筒找找看。',
    task: '用手電筒找到<b>躲起來的殭屍</b>',
    fact: '遊戲的手電筒是一盞跟著相機走的「聚光燈 SpotLight」。第 8 波停電時,你就只剩它了。',
    studio: { light: 'dark', env: false, bg: 0x020303, floorColor: 0x1d2422, grid: false, cam: [0, 1.65, 6], target: [0, 1.2, -2], orbit: { rotate: false, zoom: false, fit: false } },
    run(T) {
      T.hemi.intensity = 0;
      for (let i = 0; i < 9; i++) { const b = T.add(crate(rnd(0.7, 1.3), [0x6b5238, 0x55606a, 0x4a3b2c][i % 3])); b.position.set(rnd(-6, 6), 0, rnd(-6, 1)); b.rotation.y = rnd(0, 3); }
      for (let i = 0; i < 2; i++) { const d = T.add(dummy(0x4e5c68, { eyes: false })); d.position.set(i ? 4.5 : -4.2, 0, i ? -4 : -1.5); d.rotation.y = rnd(-1, 1); }
      const z = T.zombie('walker', 4);
      const zx = (Math.random() < 0.5 ? -1 : 1) * rnd(1.5, 5.5), zz = rnd(-6.5, -3);
      z.mesh.position.set(zx, 0, zz);
      z.mesh.lookAt(0, 0, 6);
      T.add(z.mesh);
      const eye = new THREE.PointLight(0xffd040, 0, 2, 2);
      eye.position.set(zx, 1.7, zz + 0.3);
      T.add(eye);
      const spot = new THREE.SpotLight(0xfff1d8, 70, 22, 0.32, 0.5, 1.3);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.position.set(0.35, 1.45, 5.6);
      T.add(spot, spot.target);
      const amb = new THREE.AmbientLight(0x8899aa, 0);
      T.add(amb);
      const lamp = new THREE.PointLight(0xffd8a0, 0, 14, 1.6);
      lamp.position.set(0, 3.2, -2);
      T.add(lamp);
      const aim = new THREE.Vector3(0, 1, -3);
      let found = false;
      const tag = T.label(z.mesh, '找到了!', { cls: 'hot big', dy: 2.1 });
      tag.show(false);
      const onMove = (e) => { const r = T.ray(e).ray; aim.copy(r.origin).addScaledVector(r.direction, 9); };
      T.sh.ui.cv.addEventListener('pointermove', onMove);
      T.onDispose(() => T.sh.ui.cv.removeEventListener('pointermove', onMove));
      T.toggle({ label: '手電筒', value: true, on: (v) => { spot.visible = v; } });
      T.toggle({ label: '環境光', value: false, on: (v) => { amb.intensity = v ? 0.6 : 0; } });
      T.toggle({ label: '天花板燈', value: false, on: (v) => { lamp.intensity = v ? 18 : 0; } });
      const to = new THREE.Vector3(), dir = new THREE.Vector3();
      return {
        update(dt, t) {
          spot.target.position.lerp(aim, Math.min(1, dt * 12));
          spot.intensity = 70 * (0.94 + 0.06 * Math.sin(t * 23) * Math.sin(t * 7));
          if (!found && spot.visible) {
            dir.subVectors(spot.target.position, spot.position).normalize();
            to.set(zx, 1.2, zz).sub(spot.position).normalize();
            if (dir.angleTo(to) < 0.12) { found = true; eye.intensity = 3; tag.show(true); T.done(); }
          }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 19
  {
    id: 'shadow', title: '影子 = 燈看不到的地方', say: '做陰影的方法:先站在<b>燈的位置</b>拍一張照片,燈看不到的地方,就是影子。',
    task: '拖動燈泡,讓<b>金幣</b>躲進箱子的影子裡',
    fact: '遊戲的手電筒、月光都會先拍一張「燈的照片」(陰影貼圖),每一幀重拍一次。',
    studio: { cam: [7.5, 8, 9.5], target: [0, 0.4, 0], light: 'dark', env: 0.15 },
    run(T) {
      T.hemi.intensity = 0.18;
      const box = T.add(crate(1.4, 0x8a6a45));
      box.position.set(0, 0, 0);
      const tall = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5).translate(0, 1.2, 0), std(0x6b8f86)));
      tall.position.set(-2.4, 0, 1.5);
      tall.castShadow = tall.receiveShadow = true;
      const coin = T.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 32), std(0xffc93a, { metalness: 0.9, roughness: 0.25 })));
      coin.position.set(2.0, 0.04, 1.4);
      coin.castShadow = true;
      const sun = T.add(bulb(0xfff2c0, 0.22));
      sun.position.set(-1.5, 3.4, -2.8);
      const L = new THREE.PointLight(0xfff2d0, 120, 30, 1.6);
      L.castShadow = true;
      L.shadow.mapSize.set(1024, 1024);
      L.shadow.bias = -0.002;
      sun.add(L);
      const ray = T.add(line([new THREE.Vector3(), new THREE.Vector3()], 0xffcf5a, { dashed: true, opacity: 0.7 }));
      T.drag(sun, { plane: 'xz', clamp: (p) => { p.y = 3.4; p.x = clamp(p.x, -6, 6); p.z = clamp(p.z, -6, 6); } });
      T.label(sun, '拖我', { cls: 'acc', dy: 0.45 });
      const tag = T.label(coin, '', { dy: 0.35 });
      // 角落小視窗:從燈的位置看出去
      const lc = new THREE.PerspectiveCamera(80, 1.3, 0.1, 30);
      const pipW = 260, pipH = 200;
      T.post((R) => {
        const w = R.domElement.clientWidth, h = R.domElement.clientHeight, x = w - pipW - 16, y = h - pipH - 90;
        lc.position.copy(sun.position);
        lc.lookAt(0.3, 0, -0.3);
        R.setScissorTest(true);
        R.setViewport(x, h - y - pipH, pipW, pipH); R.setScissor(x, h - y - pipH, pipW, pipH);
        sun.material.visible = false; ray.visible = false;
        R.render(T.scene, lc);
        sun.material.visible = true; ray.visible = true;
        R.setScissorTest(false);
        R.setViewport(0, 0, w, h);
      });
      const pipLbl = document.createElement('div');
      pipLbl.className = 'tl acc';
      pipLbl.style.cssText = `position:absolute;left:auto;right:16px;bottom:${90 + pipH + 4}px;top:auto;transform:none;margin:0`;
      pipLbl.textContent = '燈看到的(看不到金幣 = 金幣在影子裡)';
      T.sh.ui.lbl.appendChild(pipLbl);
      const rc = new THREE.Raycaster(), from = new THREE.Vector3(), d = new THREE.Vector3();
      return {
        update() {
          from.copy(coin.position).setY(0.1);
          d.subVectors(sun.position, from);
          const dist = d.length();
          rc.set(from, d.normalize());
          rc.far = dist;
          const hid = rc.intersectObjects([box, tall], false).length > 0;
          ray.set([from, sun.position]);
          ray.material.color.set(hid ? 0xff6b5a : 0xffcf5a);
          tag.set(hid ? '在影子裡 ✓' : '被照到');
          tag.el.className = 'tl ' + (hid ? 'ok' : 'acc');
          if (hid) T.done();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 20
  {
    id: 'mat', title: '金屬?塑膠?橡膠?', say: '同一顆球,只改兩個數字:<b>粗糙度</b>和<b>金屬感</b>,看起來就是不同的東西。',
    task: '做出一顆<b>鏡子球</b>(金屬 1、粗糙 0)',
    fact: '遊戲裡每種材質都有這兩個數字:濕的地板粗糙度低(會反光),舊牆粗糙度高。',
    studio: { cam: [0, 1.9, 5.6], target: [0, 1.0, 0], env: 0.8 },
    run(T) {
      T.hemi.intensity = 0.35;
      const mat = new THREE.MeshStandardMaterial({ color: 0xd04a3a, roughness: 0.5, metalness: 0 });
      const ball = T.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 64, 48), mat));
      ball.position.y = 1.1;
      ball.castShadow = true;
      for (let i = 0; i < 5; i++) { const c = T.add(crate(0.5, [0x2f7fd0, 0x2fb07a, 0xe0a82a, 0x8a52d8, 0xe0603a][i])); const a = (i / 5) * Math.PI * 2 + 1.2; c.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4 - 0.6); }
      const code = T.code(`new MeshStandardMaterial({
  color:     {col},
  roughness: {r},   // 粗糙度 0 ~ 1
  metalness: {m}    // 金屬感 0 ~ 1
})`, { col: { value: 0xd04a3a, type: 'color', options: [0xd04a3a, 0xffc93a, 0xd8d8d8, 0x4aa8ff, 0x2b2b2b] }, r: { value: 0.5, min: 0, max: 1, step: 0.05 }, m: { value: 0, min: 0, max: 1, step: 0.05 } }, (v) => {
        mat.color.setHex(v.col); mat.roughness = v.r; mat.metalness = v.m;
        if (v.m >= 0.95 && v.r <= 0.05) { T.done(); }
      }, { title: '材質' });
      const P = { 塑膠: [0xd04a3a, 0.35, 0], 金子: [0xffc93a, 0.25, 1], 橡膠: [0x2b2b2b, 0.95, 0], 鏡子: [0xd8d8d8, 0, 1] };
      for (const k in P) T.button(k, () => { code.set('col', P[k][0]); code.set('r', P[k][1]); code.set('m', P[k][2]); });
      return { update(dt, t) { ball.rotation.y = t * 0.2; } };
    },
  },
  // ---------------------------------------------------------------- 21
  {
    id: 'tex', title: '貼圖:把圖片包上去', say: '形狀只決定外型;表面的花紋,是把一張<b>圖片</b>包上去。',
    task: '把箱子換成<b>木頭</b>貼圖',
    fact: '醫院的地磚、油漆剝落的牆、血跡,全是貼圖。這款遊戲用了 50 多種材質的圖片。',
    studio: { cam: [3.4, 3.0, 4.8], target: [0, 0.75, 0] },
    run(T) {
      const TEX = {
        none: null,
        checker: checker(8),
        wood: T.tex('textures/wood_old/color.webp'),
        brick: T.tex('textures/brick/color.webp'),
        wall: T.tex('textures/paint_peeling/color.webp'),
        blood: T.tex('textures/decals/blood_splatter.webp'),
      };
      T.onDispose(() => TEX.checker.dispose());
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, transparent: false });
      const box = T.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5).translate(0, 0.75, 0), mat));
      box.castShadow = true;
      const flat = T.panel({ w: 170, h: 170, place: 'right' });
      flat.el.style.transform = 'translateY(10%)';
      const drawFlat = (t, n) => {
        flat.clear('#0a1416');
        const img = t?.image;
        if (img && img.width) { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) flat.g.drawImage(img, (x * 170) / n, (y * 170) / n, 170 / n, 170 / n); }
        else { flat.g.fillStyle = '#556'; flat.g.font = '14px system-ui'; flat.g.fillText(t ? '載入中…' : '沒有圖片', 50, 90); }
      };
      let cur = null, rep = 1;
      const apply = () => {
        const t = TEX[cur];
        if (t) { t.repeat.set(rep, rep); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
        mat.map = t; mat.needsUpdate = true;
        drawFlat(t, rep);
      };
      T.code(`material.map = textures.{tex}
material.map.repeat.set({n}, {n})   // 重複幾次`, { tex: { value: 'none', options: Object.keys(TEX) }, n: { value: 1, min: 1, max: 6, step: 1 } }, (v) => {
        cur = v.tex === 'none' ? null : v.tex; rep = v.n;
        apply();
        if (cur === 'wood') T.done();
      }, { title: '貼圖', hint: '點 <b>textures.…</b> 換一張圖' });
      const iv = setInterval(() => drawFlat(TEX[cur], rep), 500);
      T.onDispose(() => clearInterval(iv));
      return { update(dt, t) { box.rotation.y = Math.sin(t * 0.4) * 0.6; } };
    },
  },
  // ---------------------------------------------------------------- 22
  {
    id: 'uv', title: 'UV:把紙箱攤平', say: '要把圖片包到 3D 模型上,先把模型<b>攤平</b>成一張紙,這張「展開圖」就叫 <b>UV</b>。',
    task: '把攤平的紙,<b>摺回</b>一個骰子',
    fact: '殭屍的皮膚、衣服,也是先攤平畫在一張圖上,再一塊一塊包回模型。',
    studio: { cam: [3.2, 4.2, 4.5], target: [0, 0.3, 0] },
    run(T) {
      const S = 1;
      const mk = (n, col) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: faceTex(String(n), col), side: THREE.DoubleSide, roughness: 0.8 }));
        m.castShadow = true;
        return m;
      };
      const root = T.add(new THREE.Group());
      root.position.y = 0.01;
      const bottom = mk(1, '#f2e9d6'); root.add(bottom);
      const hinge = (pos) => { const h = new THREE.Group(); h.position.copy(pos); root.add(h); return h; };
      const hF = hinge(new THREE.Vector3(0, 0, S / 2)), hB = hinge(new THREE.Vector3(0, 0, -S / 2));
      const hR = hinge(new THREE.Vector3(S / 2, 0, 0)), hL = hinge(new THREE.Vector3(-S / 2, 0, 0));
      const f = mk(2, '#ffd9c2'); f.position.z = S / 2; hF.add(f);
      const b = mk(5, '#d4ecff'); b.position.z = -S / 2; hB.add(b);
      const r = mk(3, '#dff7e6'); r.position.x = S / 2; hR.add(r);
      const l = mk(4, '#fff1b8'); l.position.x = -S / 2; hL.add(l);
      const hT = new THREE.Group(); hT.position.z = -S; hB.add(hT);
      const top = mk(6, '#ead9ff'); top.position.z = -S / 2; hT.add(top);
      for (const m of [bottom, f, b, r, l, top]) T.onDispose(() => m.material.map.dispose());
      // 右邊的 2D 展開圖
      const P = T.panel({ w: 200, h: 260, place: 'right' });
      P.el.style.transform = 'translateY(0%)';
      const net = [[1, 1, '1'], [1, 2, '2'], [1, 0, '5'], [2, 1, '3'], [0, 1, '4'], [1, -1, '6']];
      const drawNet = (k) => {
        P.clear('#0a1416');
        const g = P.g, s = 52, ox = 22, oy = 80;
        g.font = '12px system-ui'; g.fillStyle = '#8fa8a1'; g.fillText('UV 展開圖', 10, 18);
        for (const [cx, cy, t] of net) {
          g.fillStyle = 'rgba(255,207,90,' + (0.15 + 0.6 * (1 - k)) + ')';
          g.fillRect(ox + cx * s, oy + cy * s, s - 3, s - 3);
          g.fillStyle = '#e8f1ec'; g.font = 'bold 22px system-ui'; g.fillText(t, ox + cx * s + 18, oy + cy * s + 33);
        }
      };
      let k = 0, everFlat = true;
      const set = (x) => {
        k = x;
        const a = (Math.PI / 2) * k;
        hF.rotation.x = -a; hB.rotation.x = a; hR.rotation.z = a; hL.rotation.z = -a; hT.rotation.x = a;
        drawNet(k);
        if (k >= 0.999 && everFlat) T.done();
      };
      T.slider({ label: '攤平 ⟷ 摺起來', min: 0, max: 1, step: 0.01, value: 0, fmt: (x) => `${Math.round(x * 100)}%`, on: set });
      let play = null;
      T.button('▶ 自動摺', () => { const s0 = k; play?.stop(); play = tween(T, 1.6, (q) => set(s0 + (1 - s0) * T.ease.inOut(q))); });
      set(0);
    },
  },
  // ---------------------------------------------------------------- 23
  {
    id: 'bump', title: '假的凹凸', say: '這面牆看起來坑坑疤疤,其實是<b>完全平的</b>!是一張「法線貼圖」騙過了光線。',
    task: '繞到牆的<b>側面</b>,揭穿它',
    fact: '遊戲裡的磚牆、磁磚縫、裂痕大多是法線貼圖,這樣不用多畫上百萬個三角形。',
    studio: { cam: [0, 1.5, 5.4], target: [0, 1.4, 0], light: 'dark', env: 0.2, orbit: { min: 1.2, max: 9 } },
    run(T) {
      T.hemi.intensity = 0.15;
      const col = T.tex('textures/brick/color.webp'), nor = T.tex('textures/brick/normal.webp', { srgb: false });
      for (const t of [col, nor]) t.repeat.set(1.5, 1);
      const mat = new THREE.MeshStandardMaterial({ map: col, normalMap: nor, roughness: 0.85, normalScale: new THREE.Vector2(1.6, 1.6) });
      const wall = T.add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), mat));
      wall.position.y = 1.5;
      wall.receiveShadow = true;
      const lamp = T.add(bulb(0xffe2b0, 0.08));
      const L = new THREE.PointLight(0xffe2b0, 10, 8, 1.5);
      lamp.add(L);
      let auto = true;
      T.toggle({ label: '法線貼圖', value: true, on: (v) => { mat.normalMap = v ? nor : null; mat.needsUpdate = true; } });
      T.toggle({ label: '燈自己繞圈', value: true, on: (v) => { auto = v; } });
      T.drag(lamp, { plane: 'xy', clamp: (p) => { p.z = 0.6; } });
      T.label(lamp, '可以拖', { cls: 'acc dot', dy: 0.25 });
      const tag = T.label(new THREE.Vector3(0, 3.05, 0), '', { cls: 'hot big' });
      tag.show(false);
      const n = new THREE.Vector3(0, 0, 1), d = new THREE.Vector3();
      lamp.position.set(0, 1.5, 0.6);
      return {
        update(dt, t) {
          if (auto && !T._grab) lamp.position.set(Math.cos(t * 0.9) * 1.6, 1.5 + Math.sin(t * 1.3) * 0.8, 0.6);
          d.subVectors(T.sh.cam.position, wall.position).normalize();
          const edge = Math.abs(d.dot(n)) < 0.2;
          tag.show(edge);
          tag.set('其實是平的!');
          if (edge) T.done();
        },
      };
    },
  },
  // ---------------------------------------------------------------- 24
  {
    id: 'ghost', title: '透明:變成鬼', say: '材質還有一個數字叫 <b>opacity</b>(不透明度):1 是實心,0 是完全看不見。',
    task: '把殭屍變成<b>半透明的鬼</b>(0.35 以下)',
    fact: '遊戲裡的幻影、霧、玻璃、血跡都是半透明材質。透明的東西要從遠畫到近,不然會穿幫。',
    studio: { cam: [0.6, 1.5, 3.6], target: [0, 1.0, 0], light: 'dark', env: 0.25, bg: 0x070c0e },
    run(T) {
      T.hemi.intensity = 0.9;
      const key = new THREE.SpotLight(0xcfe8ff, 30, 10, 0.5, 0.6, 1.2);
      key.position.set(1.5, 3.5, 2.5);
      T.add(key, key.target);
      key.target.position.set(0, 1, 0);
      const v = getVariant('walker', 5);
      const mats = v.materials.map((m) => { const c = m.clone(); c.transparent = true; c.depthWrite = false; return c; });
      T.onDispose(() => mats.forEach((m) => m.dispose()));
      const geo = v.geometry.clone();
      T.onDispose(() => geo.dispose());
      const z = T.add(new THREE.Mesh(geo, mats));
      z.userData.shared = true;
      const back = T.add(crate(0.9, 0x6b5238));
      back.position.set(0.3, 0, -1.4);
      const glow = new THREE.PointLight(0x7fd8ff, 0, 4, 2);
      glow.position.set(0, 1.4, 0.4);
      T.add(glow);
      let op = 1, flick = false;
      T.code(`zombie.material.transparent = true
zombie.material.opacity = {o}`, { o: { value: 1, min: 0, max: 1, step: 0.05 } }, (val) => {
        op = val.o;
        if (op <= 0.35) { T.done(); }
      }, { title: '幽靈殭屍' });
      T.toggle({ label: '閃爍', value: false, on: (x) => { flick = x; } });
      T.toggle({ label: '鬼火', value: false, on: (x) => { glow.intensity = x ? 3 : 0; for (const m of mats) { if (m.emissive) m.emissive.set(x ? 0x1a4a5a : 0x000000); } } });
      return {
        update(dt, t) {
          const f = flick ? (Math.sin(t * 13) > 0.7 ? 0.2 : 1) * (0.75 + 0.25 * Math.sin(t * 3)) : 1;
          for (const m of mats) m.opacity = op * f;
          z.position.y = op < 0.6 ? Math.sin(t * 1.5) * 0.08 + 0.08 : 0;
          z.rotation.y = Math.sin(t * 0.4) * 0.5;
        },
      };
    },
  },
];
