import * as THREE from 'three';
import { WEAPONS } from '../../weapons/weapon.js';
import { fmt, rad, rnd, std, dummy, ring, crate, line, tween, clamp } from './_util.js';

// ===== 第 6 章 碰撞、射擊、重力 =====
export default [
  // ---------------------------------------------------------------- 35
  {
    id: 'aabb', title: '碰撞盒', say: '遊戲不會一個三角形一個三角形比對有沒有撞到 —— 太慢了。它用<b>看不見的盒子</b>包住東西,只比盒子。',
    task: '拖著藍色的人,<b>撞上</b>一面牆',
    fact: '',
    studio: { cam: [0, 11, 8], target: [0, 0, 0] },
    run(T) {
      T.sh.ui.factTx.innerHTML = `你在醫院裡撞到的牆、病床、櫃子,背後是 <b>${fmt(T.game.world?.boxes?.length || 0)}</b> 個這種盒子。`;
      T.sh.ui.fact.classList.add('on');
      const walls = [[-3, -2, 0.4, 4], [2.5, 1.5, 4, 0.4], [3.5, -3, 0.4, 3], [-1, 3.5, 3, 0.4]].map(([x, z, sx, sz]) => {
        const m = T.add(new THREE.Mesh(new THREE.BoxGeometry(sx, 1.6, sz).translate(0, 0.8, 0), std(0x6b8f86)));
        m.position.set(x, 0, z);
        m.castShadow = m.receiveShadow = true;
        return m;
      });
      for (const [x, z, s] of [[0.5, -2.2, 0.9], [-2.6, 2.2, 0.7]]) { const c = T.add(crate(s)); c.position.set(x, 0, z); walls.push(c); }
      const boxes = walls.map((w) => new THREE.Box3().setFromObject(w));
      const helpers = boxes.map((b) => T.add(new THREE.Box3Helper(b, 0x5fe0a8)));
      const me = T.add(dummy(0x4aa8ff));
      me.position.set(0, 0, 0.5);
      const half = new THREE.Vector3(0.32, 0.9, 0.32);
      const mine = new THREE.Box3();
      const myHelper = T.add(new THREE.Box3Helper(mine, 0x6cc4ff));
      let block = false, hits = 0, hitNow = false;
      const resolve = (p) => {
        for (let k = 0; k < 3; k++) for (const b of boxes) {
          const ox = Math.min(p.x + half.x - b.min.x, b.max.x - (p.x - half.x)), oz = Math.min(p.z + half.z - b.min.z, b.max.z - (p.z - half.z));
          if (ox <= 0 || oz <= 0) continue;
          if (ox < oz) p.x += p.x < (b.min.x + b.max.x) / 2 ? -ox : ox; else p.z += p.z < (b.min.z + b.max.z) / 2 ? -oz : oz;
        }
      };
      T.drag(me, { plane: 'xz', clamp: (p) => { p.y = 0; p.x = clamp(p.x, -6, 6); p.z = clamp(p.z, -6, 6); if (block) resolve(p); } });
      T.label(me, '拖我', { cls: 'acc', dy: 2.05 });
      T.toggle({ label: '牆會擋住我', value: false, on: (v) => { block = v; } });
      T.toggle({ label: '顯示盒子', value: true, on: (v) => { for (const h of helpers) h.visible = v; myHelper.visible = v; } });
      T.stat('撞到', () => (hitNow ? '<span style="color:#ff6b5a">撞到了!</span>' : '沒有'));
      return {
        update() {
          mine.min.set(me.position.x - half.x, 0, me.position.z - half.z);
          mine.max.set(me.position.x + half.x, 1.8, me.position.z + half.z);
          hitNow = false;
          boxes.forEach((b, i) => {
            const touch = b.intersectsBox(mine) && (!block || Math.min(mine.max.x - b.min.x, b.max.x - mine.min.x, mine.max.z - b.min.z, b.max.z - mine.min.z) > 0.005);
            const near = block && b.clone().expandByScalar(0.02).intersectsBox(mine);
            helpers[i].material.color.set(touch || near ? 0xff6b5a : 0x5fe0a8);
            if (touch || near) hitNow = true;
          });
          me.userData.mat.color.set(hitNow ? 0xff6b5a : 0x4aa8ff);
          if (hitNow) { if (!hits++) T.done(); }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 36
  {
    id: 'hitbox', title: '爆頭判定', say: '子彈其實打的是藏在殭屍身上的<b>判定方塊</b>。打到頭的方塊,傷害 <b>×2</b>。',
    task: '開槍(點殭屍),打出一發<b>爆頭</b>',
    fact: '方塊掛在骨頭上,殭屍動,方塊跟著動。巨屍的胸口是「護甲」方塊,一般子彈打不太痛。',
    studio: { cam: [0.5, 1.5, 3.4], target: [0, 1.15, 0] },
    run(T) {
      const z = T.zombie('walker', 2);
      T.add(z.mesh);
      const COL = { head: 0xff5a4a, body: 0x4aa8ff, armor: 0x9aa6a2, arm: 0xffcf5a, leg: 0x5fe0a8 };
      const NAME = { head: '頭', body: '身體', armor: '護甲', arm: '手', leg: '腳' };
      const mats = {};
      for (const k in COL) mats[k] = new THREE.MeshBasicMaterial({ color: COL[k], transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });
      T.onDispose(() => { for (const k in mats) mats[k].dispose(); });
      for (const h of z.hits) { h.material = mats[h.userData.part] || mats.body; h.visible = true; h.renderOrder = 3; }
      let show = true, wpn = 'pistol';
      T.toggle({ label: '顯示判定方塊', value: true, on: (v) => { show = v; for (const k in mats) mats[k].opacity = v ? 0.45 : 0; } });
      T.choice({ label: '槍', options: [{ v: 'pistol', t: '手槍' }, { v: 'ak47', t: 'AK-47' }, { v: 'barrett', t: '巴雷特' }], value: 'pistol', on: (v) => { wpn = v; } });
      let shots = 0, heads = 0;
      T.stat('爆頭', () => `${heads} / ${shots}`);
      const pops = [];
      T.click(z.hits, (h) => {
        const part = h.target.userData.part;
        const base = WEAPONS[wpn].damage, dmg = base * (part === 'head' ? 2 : 1);
        shots++;
        if (part === 'head') { heads++; T.done(); }
        const L = T.label(h.point.clone(), `${NAME[part] || part} −${dmg}${part === 'head' ? ' 爆頭!' : ''}`, { cls: part === 'head' ? 'hot big' : 'acc' });
        pops.push({ L, t: 0, p: h.point.clone() });
        const fl = h.target.material;
        fl.opacity = 0.95;
        setTimeout(() => { fl.opacity = show ? 0.45 : 0; }, 120);
      });
      const B = z.bones;
      return {
        update(dt, t) {
          B.spine.rotation.z = Math.sin(t * 1.1) * 0.12;
          B.head.rotation.set(Math.sin(t * 1.7) * 0.15, Math.sin(t * 0.9) * 0.4, Math.sin(t * 1.3) * 0.2);
          B.upperArmL.rotation.x = -1.2 + Math.sin(t * 1.4) * 0.15;
          B.upperArmR.rotation.x = -1.0 + Math.sin(t * 1.2) * 0.15;
          z.mesh.position.x = Math.sin(t * 0.6) * 0.35;
          for (let i = pops.length - 1; i >= 0; i--) {
            const q = pops[i];
            q.t += dt;
            q.L.target = q.p.clone().setY(q.p.y + q.t * 0.4);
            q.L.el.style.opacity = String(Math.max(0, 1 - q.t / 1.2));
            if (q.t > 1.2) { q.L.el.remove(); q.L.show(false); pops.splice(i, 1); }
          }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 37
  {
    id: 'ray', title: '子彈 = 一條看不見的線', say: '開槍時遊戲畫一條<b>射線</b>,看它先碰到誰。點畫面任何地方開槍。',
    task: '打倒 <b>3 個</b>瓶子(試試「穿透」)',
    fact: '這款遊戲的步槍子彈可以穿過一層薄東西(穿透),巴雷特可以穿 3 層;只有 RPG 的火箭是真的飛過去。',
    studio: { cam: [-6.5, 3.2, 6], target: [0.8, 1.0, 0] },
    run(T) {
      const gun = T.gun('ak47');
      const bb = new THREE.Box3().setFromObject(gun);
      const piv = new THREE.Group();
      gun.position.sub(bb.getCenter(new THREE.Vector3()));
      gun.scale.setScalar(1.6);
      gun.position.multiplyScalar(1.6);
      piv.add(gun);
      piv.position.set(-3.2, 1.2, 0);
      piv.rotation.y = -Math.PI / 2;
      T.add(piv);
      const muzzle = new THREE.Vector3(-2.4, 1.24, 0);
      const shelf = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 5).translate(0, 0.5, 0), std(0x4a3b2c)));
      shelf.position.set(4.2, 0, 0);
      const back = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 6).translate(0, 1.5, 0), std(0x3a4a48)));
      back.position.set(5.2, 0, 0);
      const board = T.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 1.6).translate(0, 0.45, 0), std(0xa07a4a)));
      board.position.set(2.8, 0, -1.2);
      board.castShadow = true;
      const bottles = [-2, -1.1, 0, 1.1, 2].map((zz, i) => {
        const b = T.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 16).translate(0, 0.25, 0), std([0x5fe0a8, 0x4aa8ff, 0xffcf5a, 0xff8a5a, 0xb57bff][i], { roughness: 0.2 })));
        b.position.set(4.2, 1, zz);
        b.castShadow = true;
        b.userData.alive = true;
        return b;
      });
      let pen = false, hits = 0;
      T.toggle({ label: '穿透(穿過 1 層)', value: false, on: (v) => { pen = v; } });
      T.stat('打倒', () => `${hits} / 5`);
      T.button('重來', () => T.sh.go(T.sh.i, 0));
      const tracers = [];
      const solids = [board, shelf, back, T.floor, ...bottles];
      T.click(null, (h) => {
        const e = h.event, r = T.ray(e);
        const first = r.intersectObjects(solids.filter((o) => o && o.visible), false)[0];
        const aimPt = first ? first.point : r.ray.origin.clone().addScaledVector(r.ray.direction, 20);
        const dir = aimPt.clone().sub(muzzle).normalize();
        const rc = new THREE.Raycaster(muzzle, dir, 0, 30);
        const hitsOnLine = rc.intersectObjects(solids.filter((o) => o && o.visible && (o.userData.alive !== false)), false);
        let end = muzzle.clone().addScaledVector(dir, 30), passed = 0;
        for (const hh of hitsOnLine) {
          end = hh.point;
          const o = hh.object;
          if (o.userData.alive) { o.userData.alive = false; hits++; const z0 = o.position.clone(); tween(T, 0.6, (k) => { o.rotation.z = -k * 1.4; o.position.set(z0.x + k * 0.6, z0.y + Math.sin(k * Math.PI) * 0.4 - k * 0.9, z0.z); }, () => { o.visible = false; }); if (hits >= 3) T.done(); }
          if (pen && o === board && passed === 0) { passed++; continue; }
          break;
        }
        const tr = T.add(line([muzzle.clone(), end.clone()], 0xfff0a0));
        const sp = T.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 })));
        sp.position.copy(end);
        tracers.push({ tr, sp, t: 0 });
        piv.rotation.z = 0.05;
      });
      return {
        update(dt) {
          piv.rotation.z *= 0.85;
          for (let i = tracers.length - 1; i >= 0; i--) {
            const q = tracers[i];
            q.t += dt;
            q.tr.material.opacity = Math.max(0, 1 - q.t * 3);
            q.sp.scale.setScalar(1 + q.t * 4);
            q.sp.material.transparent = true; q.sp.material.opacity = Math.max(0, 1 - q.t * 3);
            if (q.t > 0.4) { T.scene.remove(q.tr, q.sp); q.tr.geometry.dispose(); q.tr.material.dispose(); q.sp.geometry.dispose(); q.sp.material.dispose(); tracers.splice(i, 1); }
          }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 38
  {
    id: 'jump', title: '重力與跳躍', say: '每一幀,重力把往上的速度扣掉一點,所以跳起來會<b>慢慢停下、再掉下來</b>。',
    task: '調整數字,<b>跳過</b>那面牆(按「跳!」或空白鍵)',
    fact: '這款遊戲的玩家也是每一幀算一次 <code>速度 -= 重力 × 時間</code>,再用速度去更新位置。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 600, H = 280, S = 42, GY = 240; // 每公尺 42 px
      const P = T.panel({ w: W, h: H, place: 'center' });
      P.el.style.left = 'calc(50% + 110px)';
      const wall = { x: 8.2, w: 0.5, h: 1.7 };
      let g = 9.8, v0 = 5, x = 0.5, y = 0, vy = 0, onGround = true, bonk = 0, wins = 0;
      const code = T.code(`vy = vy - {g} * dt     // 重力
if (按下跳) vy = {v}      // 起跳速度
y = y + vy * dt`, { g: { value: 9.8, min: 1, max: 30, step: 0.1 }, v: { value: 5, min: 2, max: 14, step: 0.5 } }, (vals) => { g = vals.g; v0 = vals.v; }, { title: '每一幀', hint: '跳不過去?試試把重力改小,或把起跳速度改大' });
      T.choice({ label: '在', options: [{ v: 1.6, t: '月球' }, { v: 9.8, t: '地球' }, { v: 24.8, t: '木星' }], value: 9.8, on: (v) => code.set('g', v) });
      const jump = () => { if (onGround && !bonk) { vy = v0; onGround = false; } };
      T.button('跳!', jump, 'hot big');
      T.key((e) => { if (e.code === 'Space') { jump(); return true; } return false; });
      T.stat('跳過', () => `${wins} 次`);
      const X = (m) => 20 + m * S, Y = (m) => GY - m * S;
      return {
        update(dt) {
          dt = Math.min(dt, 1 / 30);
          if (bonk > 0) { bonk -= dt; if (bonk <= 0) { x = 0.5; y = 0; vy = 0; onGround = true; } }
          else {
            x += 3.6 * dt;
            if (!onGround) { vy -= g * dt; y += vy * dt; if (y <= 0) { y = 0; vy = 0; onGround = true; } }
            const hitWall = x + 0.3 > wall.x && x - 0.3 < wall.x + wall.w && y < wall.h;
            if (hitWall) { bonk = 1; vy = 0; }
            if (x > 13.6) { if (y === 0 || onGround) { x = 0.5; } }
            if (x > wall.x + wall.w + 0.35 && !P._passed) { P._passed = true; wins++; T.done(); T.toast('跳過了!', 900); }
            if (x < wall.x) P._passed = false;
          }
          // 畫面
          const c = P.g;
          P.clear('#0a1416');
          c.fillStyle = '#1d2f30'; c.fillRect(0, GY, W, H - GY);
          c.fillStyle = '#6b8f86'; c.fillRect(X(wall.x), Y(wall.h), wall.w * S, wall.h * S);
          // 預測的拋物線(從現在的位置起跳)
          if (onGround && !bonk) {
            c.strokeStyle = 'rgba(255,207,90,.6)'; c.setLineDash([5, 6]); c.beginPath();
            for (let t = 0, px = x, py = 0, pv = v0; t < 3; t += 1 / 30) { px += 3.6 / 30; pv -= g / 30; py += pv / 30; if (py < 0) break; t ? c.lineTo(X(px), Y(py)) : c.moveTo(X(px), Y(py)); }
            c.stroke(); c.setLineDash([]);
          }
          c.fillStyle = bonk > 0 ? '#ff6b5a' : '#4aa8ff';
          c.fillRect(X(x - 0.3), Y(y + 1.6), 0.6 * S, 1.6 * S);
          c.fillStyle = '#e8f1ec'; c.beginPath(); c.arc(X(x), Y(y + 1.75), 0.22 * S, 0, 7); c.fill();
          c.fillStyle = '#8fa8a1'; c.font = '13px system-ui';
          c.fillText(`高度 ${y.toFixed(2)} m   往上的速度 ${vy.toFixed(1)} m/s`, 12, 20);
          if (bonk > 0) { c.fillStyle = '#ff6b5a'; c.font = 'bold 20px system-ui'; c.fillText('碰!', X(wall.x) - 50, Y(wall.h) - 10); }
        },
      };
    },
  },
  // ---------------------------------------------------------------- 39
  {
    id: 'throw', title: '丟手榴彈', say: '丟出去的東西,前進的速度不變,往上的速度被重力慢慢扣掉 → 畫出一條<b>拋物線</b>。',
    task: '一次炸到 <b>2 隻以上</b>的殭屍',
    fact: '遊戲裡的手榴彈也會撞牆反彈、在地上滾,爆炸時牆後面的殭屍不會受傷(遊戲會檢查有沒有被擋住)。',
    studio: { cam: [0.5, 7.5, 12.5], target: [0, 0.6, 0] },
    run(T) {
      const from = new THREE.Vector3(-5.5, 1.5, 0);
      const me = T.add(dummy(0x4aa8ff));
      me.position.set(-5.8, 0, 0);
      me.rotation.y = Math.PI / 2;
      const zs = [[3.2, -0.8], [4.1, 0.6], [2.6, 1.3], [5.2, -1.6]].map(([x, z]) => {
        const d = T.add(dummy(0x6f8f6a, { arms: true }));
        d.position.set(x, 0, z);
        d.rotation.y = -Math.PI / 2;
        d.userData.home = d.position.clone();
        return d;
      });
      const zone = T.add(ring(1.4, 0xff6b5a));
      zone.position.set(3.6, 0.01, 0);
      let ang = 40, pow = 9, nade = null, boom = null, best = 0;
      const arc = T.add(line(Array.from({ length: 50 }, () => new THREE.Vector3()), 0xffcf5a, { dashed: true, opacity: 0.7 }));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), std(0x3d4a2a));
      ball.castShadow = true;
      const R = 2.6;
      T.slider({ label: '角度', min: 10, max: 80, step: 1, value: 40, unit: '°', on: (v) => { ang = v; } });
      T.slider({ label: '力道', min: 4, max: 16, step: 0.5, value: 9, fmt: (v) => `${v} m/s`, on: (v) => { pow = v; } });
      const throwIt = () => {
        if (nade) return;
        const a = rad(ang);
        nade = { p: from.clone(), v: new THREE.Vector3(Math.cos(a) * pow, Math.sin(a) * pow, 0), t: 0 };
        ball.position.copy(from);
        T.add(ball);
        for (const d of zs) { d.position.copy(d.userData.home); d.rotation.set(0, -Math.PI / 2, 0); d.userData.down = false; }
      };
      T.button('丟!', throwIt, 'hot big');
      T.key((e) => { if (e.code === 'Space') { throwIt(); return true; } return false; });
      T.stat('最多炸到', () => `${best} 隻`);
      return {
        update(dt) {
          // 預測線(不含反彈)
          const a = rad(ang), pts = [];
          for (let i = 0; i < 50; i++) { const t = i * 0.04; pts.push(new THREE.Vector3(from.x + Math.cos(a) * pow * t, Math.max(0.02, from.y + Math.sin(a) * pow * t - 4.9 * t * t), 0)); }
          arc.set(pts);
          arc.visible = !nade;
          if (nade) {
            const h = Math.min(dt, 1 / 30);
            nade.t += h;
            nade.v.y -= 9.8 * h;
            nade.p.addScaledVector(nade.v, h);
            if (nade.p.y < 0.1) { nade.p.y = 0.1; nade.v.y = Math.abs(nade.v.y) * 0.35; nade.v.x *= 0.6; }
            ball.position.copy(nade.p);
            if (nade.t > 2.2) {
              const at = nade.p.clone().setY(0);
              T.scene.remove(ball);
              nade = null;
              let n = 0;
              for (const d of zs) { if (d.position.distanceTo(at) < R) { d.userData.down = true; n++; } }
              best = Math.max(best, n);
              if (n >= 2) { T.done(); T.toast(`炸到 ${n} 隻!`, 1200); } else T.toast(n ? '只炸到 1 隻' : '沒炸到', 900);
              const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.7, depthWrite: false }));
              m.position.copy(at);
              T.add(m);
              boom = { m, t: 0 };
            }
          }
          if (boom) {
            boom.t += dt;
            boom.m.scale.setScalar(0.3 + boom.t * 8 > R ? R : 0.3 + boom.t * 8);
            boom.m.material.opacity = Math.max(0, 0.7 - boom.t);
            if (boom.t > 0.8) { T.scene.remove(boom.m); boom.m.geometry.dispose(); boom.m.material.dispose(); boom = null; }
          }
          for (const d of zs) if (d.userData.down && d.rotation.z < 1.45) d.rotation.z = Math.min(1.5, d.rotation.z + dt * 5);
        },
      };
    },
  },
  // ---------------------------------------------------------------- 40
  {
    id: 'recoil', title: '後座力', say: '連發的槍每開一槍,準心就被往上踢一點,還會照固定的<b>圖案</b>左右飄。按住滑鼠開槍,往下拉來「壓槍」。',
    task: '一口氣開 <b>15 槍以上</b>,其中 <b>10 槍</b>打進中間的圈',
    fact: '每把槍的後座圖案寫在 src/weapons/weapon.js:AK-47 會先往右、再往左甩;M4A1 比較穩。',
    studio: { floor: false, light: 'none' },
    run(T) {
      const W = 460, H = 400, cx = W / 2, cy = 240, IN = 46;
      const P = T.panel({ w: W, h: H, place: 'center' });
      let wpn = 'ak47', firing = false, cool = 0, shots = 0, inside = 0, aimX = 0, aimY = 0, kickX = 0, kickY = 0, i = 0;
      let holes = [];
      T.choice({ label: '槍', options: [{ v: 'ak47', t: 'AK-47' }, { v: 'm4a1', t: 'M4A1' }, { v: 'pistol', t: '手槍' }], value: 'ak47', on: (v) => { wpn = v; } });
      T.stat('這一串', () => `${inside} / ${shots} 進圈`);
      const fire = () => {
        const d = WEAPONS[wpn], K = 950;
        const pat = d.recoil.yaw;
        kickY -= d.pitch * K;
        kickX += (pat[i % pat.length] || 0) * d.pitch * K * 1.3 + (Math.random() - 0.5) * d.recoil.rand * 6;
        i++;
        const sp = d.spread * 260;
        const hx = cx + aimX + kickX + (Math.random() - 0.5) * sp, hy = cy + aimY + kickY + (Math.random() - 0.5) * sp;
        holes.push([hx, hy]);
        shots++;
        P._lastShot = performance.now();
        if (Math.hypot(hx - cx, hy - cy) < IN) inside++;
        if (shots >= 15 && inside >= 10) T.done();
      };
      P.on((type, x, y, e) => {
        if (type === 'down') {
          const fresh = WEAPONS[wpn].auto || performance.now() - (P._lastShot || 0) > 1500; // 手槍:連續點擊算同一串
          if (fresh) { holes = []; shots = 0; inside = 0; i = 0; kickX = kickY = 0; aimX = aimY = 0; }
          firing = true; P._semi = -1; P._last = [x, y]; cool = 0; P.cv.style.cursor = 'none';
        }
        else if (type === 'drag' && firing) { aimX += x - P._last[0]; aimY += y - P._last[1]; P._last = [x, y]; }
        else if (type === 'up') { firing = false; P.cv.style.cursor = ''; }
      });
      return {
        update(dt) {
          const d = WEAPONS[wpn];
          if (firing) {
            cool -= dt;
            if (cool <= 0 && (d.auto || P._semi < 0)) { fire(); cool = 60 / d.rpm; if (!d.auto) P._semi = shots; }
          } else { kickX *= 0.85; kickY *= 0.85; aimX *= 0.85; aimY *= 0.85; }
          const g = P.g;
          P.clear('#0d1517');
          for (const [r, c] of [[150, '#1b2a2c'], [100, '#223436'], [IN, '#3a2a1c']]) { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); }
          g.strokeStyle = 'rgba(255,207,90,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, IN, 0, 7); g.stroke();
          holes.forEach(([x, y], k) => { g.fillStyle = Math.hypot(x - cx, y - cy) < IN ? '#ffcf5a' : '#ff6b5a'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); if (k) { g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...holes[k - 1]); g.lineTo(x, y); g.stroke(); } });
          const ax = cx + aimX + kickX, ay = cy + aimY + kickY;
          g.strokeStyle = '#e8f1ec'; g.lineWidth = 2;
          for (const [dx, dy] of [[-14, 0], [6, 0], [0, -14], [0, 6]]) { g.beginPath(); g.moveTo(ax + dx, ay + dy); g.lineTo(ax + dx + (dx ? 8 : 0), ay + dy + (dy ? 8 : 0)); g.stroke(); }
          g.fillStyle = '#8fa8a1'; g.font = '13px system-ui';
          g.fillText(firing ? '開火中…往下拉來壓槍' : '在靶上按住滑鼠開槍', 12, 22);
        },
      };
    },
  },
];
