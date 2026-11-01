import * as THREE from 'three';
import { sfx } from '../audio.js';

// 玻璃碎片(實例化、固定上限、環狀池:滿了就覆蓋最舊的):
//  - 退火玻璃(舊窗、玻璃櫃):大塊不規則尖銳碎片,先在框裡停一瞬間再往下掉(上面的晚一點),
//    落地彈跳,夠大夠快的會在地上再碎成 2~3 塊;靜止後平躺在地上(或窗台、桌面)約 2 分鐘才淡出
//  - 強化玻璃(櫃台隔板、車窗):整片崩成上百顆小方粒像簾子一樣落下,在地上散開
//  - 落地有碰撞聲(限流);玩家踩到地上的碎玻璃會有碎裂聲(只在踩下一步時檢查附近)
// 每幀只積分「正在飛」的碎片;靜止的不更新矩陣(沒有動就不上傳 instanceMatrix)。材質在開場預編譯時就在場景裡(不會現場編譯)。

const SH_MAX = 220, CU_MAX = 900;
const FREE = 0, FLY = 1, REST = 2, WAIT = 3, FADE = 4;
const REST_LIFE = 110, FADE_T = 1.6;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _ax = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m2 = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
const rand = (a, b) => a + Math.random() * (b - a);

// 不規則尖四邊形薄片(平放:法線 +Y,厚 5mm),單位大小;每片再加上隨機的縮放與錯切(_shear),形狀各不相同。
// 斷面(側面)頂點色偏綠、亮(玻璃邊緣);正反面暗、低粗糙度 → 主要靠反光與邊緣被看到,不像白紙片
function shardGeo() {
  const Q = [[0, -0.56], [0.34, -0.06], [0.12, 0.5], [-0.3, 0.16]], t = 0.0025;
  const pos = [], col = [], nor = [];
  const face = (a, b, c, n, cl) => { for (const v of [a, b, c]) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); col.push(cl[0], cl[1], cl[2]); } };
  const top = [1, 1, 1], edge = [1.6, 2.2, 1.9];
  const P = (q, y) => [q[0], y, q[1]];
  face(P(Q[0], t), P(Q[2], t), P(Q[1], t), [0, 1, 0], top); face(P(Q[0], t), P(Q[3], t), P(Q[2], t), [0, 1, 0], top);
  face(P(Q[0], -t), P(Q[1], -t), P(Q[2], -t), [0, -1, 0], top); face(P(Q[0], -t), P(Q[2], -t), P(Q[3], -t), [0, -1, 0], top);
  for (const [a, b] of [[Q[0], Q[1]], [Q[1], Q[2]], [Q[2], Q[3]], [Q[3], Q[0]]]) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), n = [dz / l, 0, -dx / l];
    face(P(a, -t), P(b, t), P(b, -t), n, edge);
    face(P(a, -t), P(a, t), P(b, t), n, edge);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

class Pool {
  constructor(scene, geo, mat, cap, name) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.name = name;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 3; // 畫在窗玻璃之後(都是半透明)
    scene.add(this.mesh);
    const F = (n) => new Float32Array(cap * n);
    this.P = F(3); this.V = F(3); this.Q = F(4); this.W = F(3); this.S = F(3);
    this.fl = F(1); this.t = F(1); this.hr = F(1); this.sh = F(1); // sh:錯切(碎片形狀變化)
    this.st = new Uint8Array(cap); this.gen = new Uint8Array(cap); this.nb = new Uint8Array(cap);
    this.ptr = 0;
    this.awake = 0; // FLY + WAIT + FADE 的數量
    this.rest = 0;
    this.dirty = false;
  }
  alloc() {
    const i = this.ptr;
    this.ptr = (i + 1) % this.cap;
    const s = this.st[i];
    if (s === REST) this.rest--;
    else if (s !== FREE) this.awake--;
    return i;
  }
  write(i) {
    const o3 = i * 3, o4 = i * 4;
    _p.set(this.P[o3], this.P[o3 + 1], this.P[o3 + 2]);
    _q.set(this.Q[o4], this.Q[o4 + 1], this.Q[o4 + 2], this.Q[o4 + 3]);
    const k = this.sh[i];
    if (k) { // T·R·錯切·S
      _m.compose(_p, _q, _one);
      _m2.set(this.S[o3], 0, k * this.S[o3 + 2], 0, 0, this.S[o3 + 1], 0, 0, 0, 0, this.S[o3 + 2], 0, 0, 0, 0, 1);
      _m.multiply(_m2);
    } else _m.compose(_p, _q, _s.set(this.S[o3], this.S[o3 + 1], this.S[o3 + 2]));
    this.mesh.setMatrixAt(i, _m);
    this.dirty = true;
  }
  kill(i) {
    const s = this.st[i];
    if (s === FREE) return;
    if (s === REST) this.rest--; else this.awake--;
    this.st[i] = FREE;
    this.mesh.setMatrixAt(i, ZERO);
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class GlassFX {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x46564f, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 2 });
    shardMat.name = 'glass_shard';
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0xa8bdb7, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.7, depthWrite: false });
    cubeMat.name = 'glass_cube';
    this.sh = new Pool(game.scene, shardGeo(), shardMat, SH_MAX, 'glassShards');
    this.cu = new Pool(game.scene, new THREE.BoxGeometry(1, 1, 1), cubeMat, CU_MAX, 'glassCubes');
    this._tink = 0; // 落地聲限流
    this._step = -1;
    this._fl = 0;
    this.stats = { shards: 0, cubes: 0, breaks: 0 };
  }

  // ---------- 生成 ----------
  // 一片碎片:(x,y,z) 位置、v 速度、q 姿態、(sx, sz) 形狀大小、delay 秒後才開始掉
  _spawn(pool, x, y, z, vx, vy, vz, q, sx, sy, sz, w, delay, gen, hr) {
    const i = pool.alloc(), o3 = i * 3, o4 = i * 4;
    pool.P[o3] = x; pool.P[o3 + 1] = y; pool.P[o3 + 2] = z;
    pool.V[o3] = vx; pool.V[o3 + 1] = vy; pool.V[o3 + 2] = vz;
    pool.Q[o4] = q.x; pool.Q[o4 + 1] = q.y; pool.Q[o4 + 2] = q.z; pool.Q[o4 + 3] = q.w;
    pool.S[o3] = sx; pool.S[o3 + 1] = sy; pool.S[o3 + 2] = sz;
    pool.W[o3] = rand(-1, 1) * w; pool.W[o3 + 1] = rand(-1, 1) * w; pool.W[o3 + 2] = rand(-1, 1) * w;
    pool.fl[i] = this._floor(x, y, z);
    pool.t[i] = delay;
    pool.hr[i] = hr;
    pool.gen[i] = gen; pool.nb[i] = 0;
    pool.sh[i] = pool === this.sh ? rand(-0.9, 0.9) : 0;
    pool.st[i] = delay > 0 ? WAIT : FLY;
    pool.awake++;
    pool.write(i);
    return i;
  }

  _floor(x, y, z) {
    const g = this.world.groundY ? this.world.groundY(x, z, y) : null;
    return g === null || g === undefined || !(g <= y + 0.05) ? y - 30 : g;
  }

  // 片內座標 (u,v) → 世界座標;ax 0 = 玻璃面朝 z(沿 x)、1 = 面朝 x(沿 z);plane = 玻璃面所在座標
  _pt(b, ax, u, v, out) {
    return ax === 0 ? out.set(b[0] + u, b[2] + v, (b[4] + b[5]) / 2) : out.set((b[0] + b[1]) / 2, b[2] + v, b[4] + u);
  }

  // 退火玻璃整片碎落:b = [minX maxX minY maxY minZ maxZ],hit = 命中點(世界),d = 子彈方向,power 0..1
  annealed(b, ax, hit, d, power = 0.6) {
    const W = ax === 0 ? b[1] - b[0] : b[5] - b[4], H = b[3] - b[2];
    const hu = ax === 0 ? hit.x - b[0] : hit.z - b[4], hv = hit.y - b[2];
    const n = Math.max(7, Math.min(26, Math.round(W * H * 26)));
    const cols = Math.max(1, Math.round(Math.sqrt((n * W) / H))), rows = Math.max(1, Math.ceil(n / cols));
    const cw = W / cols, ch = H / rows, sz = Math.min(cw, ch);
    const ns = ax === 0 ? Math.sign(d.z) || 1 : Math.sign(d.x) || 1; // 子彈穿過去的那一側
    const P = _p;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const u = (c + 0.5 + rand(-0.3, 0.3)) * cw, v = (r + 0.5 + rand(-0.3, 0.3)) * ch;
      if (u < 0.04 || u > W - 0.04 || v < 0.04 || v > H - 0.04) continue;
      const dist = Math.hypot(u - hu, v - hv), near = Math.exp(-dist / 0.3);
      const s = sz * rand(0.75, 1.25) * (0.45 + 0.55 * Math.min(1, dist / 0.4));
      this._pt(b, ax, u, v, P);
      this._planeQ(ax, Math.random() * 6.283, _q);
      const sp = (1.2 + 3.2 * power) * near;
      this._spawn(this.sh, P.x, P.y, P.z, d.x * sp + rand(-0.15, 0.15), rand(-0.1, 0.35) + d.y * sp, d.z * sp + rand(-0.15, 0.15), _q, s * rand(0.7, 1.3), 1, s * rand(0.7, 1.3), rand(1, 4) + 10 * near, near > 0.5 ? 0 : 0.02 + v * 0.06 + rand(0, 0.08), 0, 0.003);
    }
    // 彈著點附近的小碎片(往子彈方向飛)
    for (let k = 0; k < 10; k++) {
      const u = Math.min(W - 0.02, Math.max(0.02, hu + rand(-0.12, 0.12))), v = Math.min(H - 0.02, Math.max(0.02, hv + rand(-0.12, 0.12)));
      this._pt(b, ax, u, v, P);
      this._planeQ(ax, Math.random() * 6.283, _q);
      const sp = rand(1.5, 4) * (0.5 + power), s = rand(0.015, 0.045);
      this._spawn(this.sh, P.x, P.y, P.z, d.x * sp + rand(-0.6, 0.6), d.y * sp + rand(-0.3, 0.8), d.z * sp + rand(-0.6, 0.6), _q, s, 1, s * rand(0.6, 1.4), rand(8, 20), 0, 2, 0.003);
    }
    this.stats.shards += n + 10;
    this._glints(hit, d, 12);
    this._dust(hit, d, 5);
    void ns;
  }

  // 強化玻璃整片崩成小方粒
  tempered(b, ax, hit, d, power = 0.6) {
    const W = ax === 0 ? b[1] - b[0] : b[5] - b[4], H = b[3] - b[2];
    const hu = ax === 0 ? hit.x - b[0] : hit.z - b[4], hv = hit.y - b[2];
    const n = Math.max(80, Math.min(340, Math.round(W * H * 200)));
    const P = _p;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * W, v = Math.random() * H, dist = Math.hypot(u - hu, v - hv), near = Math.exp(-dist / 0.2);
      this._pt(b, ax, u, v, P);
      _q.setFromEuler(_e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
      const s = rand(0.006, 0.012), sp = (1 + 3 * power) * near;
      this._spawn(this.cu, P.x, P.y, P.z, d.x * sp + rand(-0.25, 0.25), rand(-0.2, 0.3), d.z * sp + rand(-0.25, 0.25), _q, s * rand(0.8, 1.2), s * rand(0.6, 1), s * rand(0.8, 1.2), rand(4, 14), near > 0.4 ? 0 : rand(0, 0.12) + v * 0.03, 0, s * 0.5);
    }
    this.stats.cubes += n;
    this._glints(hit, d, 16);
    this._dust(hit, d, 7);
  }

  // 子彈穿過道具上的玻璃(玻璃櫃、公車亭、車窗):在命中點炸出一小把碎片(不會改變道具外觀)
  burst(p, d, tempered, n = 12) {
    for (let k = 0; k < n; k++) {
      const sp = rand(0.8, 3.2);
      if (tempered) {
        _q.setFromEuler(_e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
        const s = rand(0.006, 0.011);
        this._spawn(this.cu, p.x + rand(-0.05, 0.05), p.y + rand(-0.05, 0.05), p.z + rand(-0.05, 0.05), d.x * sp + rand(-0.5, 0.5), rand(-0.4, 0.9), d.z * sp + rand(-0.5, 0.5), _q, s, s * 0.8, s, rand(5, 15), rand(0, 0.05), 0, s * 0.5);
      } else {
        _q.setFromEuler(_e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
        const s = rand(0.02, 0.06);
        this._spawn(this.sh, p.x, p.y, p.z, d.x * sp + rand(-0.5, 0.5), rand(-0.3, 0.8), d.z * sp + rand(-0.5, 0.5), _q, s, 1, s * rand(0.6, 1.4), rand(6, 16), 0, 2, 0.003);
      }
    }
    this._glints(p, d, 4);
  }

  // 平躺的碎片轉到玻璃面上:先繞自己的法線(+Y)轉 a,再把 +Y 轉到玻璃法線
  _planeQ(ax, a, out) {
    _q2.setFromAxisAngle(_ax.set(0, 1, 0), a);
    out.setFromAxisAngle(ax === 0 ? _ax.set(1, 0, 0) : _ax.set(0, 0, 1), ax === 0 ? Math.PI / 2 : -Math.PI / 2);
    return out.multiply(_q2);
  }

  _glints(p, d, n) {
    const fx = this.game.wfx;
    if (!fx) return;
    const fl = fx.floor(p.x, p.y, p.z);
    for (let i = 0; i < n; i++) fx.glow.spawn(p.x + rand(-0.15, 0.15), p.y + rand(-0.15, 0.15), p.z + rand(-0.15, 0.15), d.x * rand(0.5, 2.5) + rand(-0.6, 0.6), rand(-0.5, 1.2), d.z * rand(0.5, 2.5) + rand(-0.6, 0.6), 2.6, 3.0, 3.4, rand(0.15, 0.45), rand(0.004, 0.008), fl, 9.8, 0.9);
  }
  _dust(p, d, n) {
    const fx = this.game.wfx;
    if (!fx) return;
    for (let i = 0; i < n; i++) fx.smoke.spawn(p.x + rand(-0.1, 0.1), p.y + rand(-0.1, 0.1), p.z + rand(-0.1, 0.1), d.x * rand(0.3, 1) + rand(-0.3, 0.3), rand(-0.2, 0.2), d.z * rand(0.3, 1) + rand(-0.3, 0.3), 0.04, rand(0.25, 0.5), 0.8, 0.84, 0.86, 0.1, rand(0.8, 1.6), -0.15, 2.2, 0.03);
  }

  // ---------- 每幀 ----------
  update(dt) {
    if (dt <= 0) return;
    this._fl = (this._fl + 1) & 3;
    if (this.sh.awake || this.sh.rest) this._run(this.sh, dt, true);
    if (this.cu.awake || this.cu.rest) this._run(this.cu, dt, false);
    this.sh.flush(); this.cu.flush();
    this._crunch();
  }

  _run(pool, dt, shard) {
    const P = pool.P, V = pool.V, Q = pool.Q, Wv = pool.W, S = pool.S, st = pool.st, cap = pool.cap;
    const restSlow = this._fl === 0; // 靜止的碎片每 4 幀才算一次壽命
    for (let i = 0; i < cap; i++) {
      const s = st[i];
      if (s === FREE) continue;
      if (s === REST) {
        if (restSlow && (pool.t[i] += dt * 4) > REST_LIFE) { st[i] = FADE; pool.t[i] = 0; pool.rest--; pool.awake++; }
        continue;
      }
      if (s === WAIT) { if ((pool.t[i] -= dt) <= 0) st[i] = FLY; continue; }
      const o3 = i * 3, o4 = i * 4;
      if (s === FADE) {
        pool.t[i] += dt;
        const k = 1 - pool.t[i] / FADE_T;
        if (k <= 0) { pool.kill(i); continue; }
        S[o3] *= 0.97; S[o3 + 1] *= 0.97; S[o3 + 2] *= 0.97;
        pool.write(i);
        continue;
      }
      // 飛行:重力、空氣阻力(薄片阻力大,會飄)、旋轉
      const drag = shard ? 1 - 0.9 * dt : 1 - 0.2 * dt;
      V[o3] *= drag; V[o3 + 2] *= drag; V[o3 + 1] = V[o3 + 1] * (shard ? 1 - 0.4 * dt : 1) - 9.8 * dt;
      P[o3] += V[o3] * dt; P[o3 + 1] += V[o3 + 1] * dt; P[o3 + 2] += V[o3 + 2] * dt;
      const wx = Wv[o3], wy = Wv[o3 + 1], wz = Wv[o3 + 2], wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (wl > 1e-4) {
        _q2.setFromAxisAngle(_ax.set(wx / wl, wy / wl, wz / wl), wl * dt);
        _q.set(Q[o4], Q[o4 + 1], Q[o4 + 2], Q[o4 + 3]).premultiply(_q2);
        Q[o4] = _q.x; Q[o4 + 1] = _q.y; Q[o4 + 2] = _q.z; Q[o4 + 3] = _q.w;
      }
      // 每 4 幀重查地面(飛出窗外會掉到樓下;落在桌面、窗台上);撞進牆裡就彈回
      if (((i + this._fl) & 3) === 0) {
        const g = this.world.groundY ? this.world.groundY(P[o3], P[o3 + 2], P[o3 + 1]) : null;
        if (g === null) { V[o3] *= -0.3; V[o3 + 2] *= -0.3; P[o3] += V[o3] * dt * 2; P[o3 + 2] += V[o3 + 2] * dt * 2; }
        else if (g <= P[o3 + 1] + 0.05) pool.fl[i] = g;
      }
      const hr = pool.hr[i], fl = pool.fl[i];
      if (P[o3 + 1] <= fl + hr) {
        P[o3 + 1] = fl + hr;
        const imp = -V[o3 + 1];
        const size = Math.max(S[o3], S[o3 + 2]);
        if (shard && imp > 2.2 && size > 0.07 && pool.gen[i] < 2) { this._break(pool, i, imp); continue; }
        if (imp > 1.2) this._tinkle(P[o3], P[o3 + 1], P[o3 + 2], shard ? size : 0.01);
        V[o3 + 1] = imp * (shard ? 0.15 : 0.3);
        V[o3] *= 0.5; V[o3 + 2] *= 0.5;
        Wv[o3] *= 0.4; Wv[o3 + 1] *= 0.4; Wv[o3 + 2] *= 0.4;
        if (imp < 0.9 || ++pool.nb[i] > 3) this._settle(pool, i, shard);
      }
      if (P[o3 + 1] < fl - 5) { pool.kill(i); continue; } // 掉出世界
      pool.write(i);
    }
  }

  // 落地靜止:碎片平躺(微傾),方粒隨意轉一個朝向
  _settle(pool, i, shard) {
    const o3 = i * 3, o4 = i * 4;
    if (shard) _q.setFromEuler(_e.set(rand(-0.22, 0.22), rand(0, 6.28), rand(-0.22, 0.22))); // 碎片互相疊著、不是完全平:有的會反光
    else _q.setFromEuler(_e.set(0, rand(0, 6.28), 0));
    pool.Q[o4] = _q.x; pool.Q[o4 + 1] = _q.y; pool.Q[o4 + 2] = _q.z; pool.Q[o4 + 3] = _q.w;
    pool.P[o3 + 1] = pool.fl[i] + pool.hr[i] + Math.random() * 0.002;
    pool.st[i] = REST; pool.t[i] = Math.random() * 20;
    pool.awake--; pool.rest++;
    pool.write(i);
  }

  // 大碎片落地再碎成 2~3 塊
  _break(pool, i, imp) {
    const o3 = i * 3, x = pool.P[o3], y = pool.P[o3 + 1], z = pool.P[o3 + 2], sx = pool.S[o3], sz = pool.S[o3 + 2], gen = pool.gen[i] + 1;
    pool.kill(i);
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      _q.setFromEuler(_e.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)));
      const f = rand(0.45, 0.65), a = rand(0, 6.28), h = rand(0.4, 1.3);
      this._spawn(pool, x + Math.cos(a) * sx * 0.3, y + 0.01, z + Math.sin(a) * sz * 0.3, Math.cos(a) * h, imp * rand(0.12, 0.3), Math.sin(a) * h, _q, sx * f, 1, sz * f, rand(6, 14), 0, gen, 0.003);
    }
    this.stats.breaks++;
    this._tinkle(x, y, z, Math.max(sx, sz), true);
  }

  _tinkle(x, y, z, size, big = false) {
    const now = performance.now();
    if (!big && now - this._tink < 45) return;
    this._tink = now;
    const pos = this._tp || (this._tp = { x: 0, y: 0, z: 0 });
    pos.x = x; pos.y = y; pos.z = z;
    sfx.glass && sfx.glass(big ? 'break' : 'tinkle', { x, y, z }, size);
  }

  // 踩到地上的碎玻璃:每跨一步檢查腳邊 0.45m 內有沒有靜止的碎片
  _crunch() {
    const p = this.game.player;
    if (!p || !p.onGround || p.stepT === this._step) return;
    this._step = p.stepT;
    if (!this.sh.rest && !this.cu.rest) return;
    let n = 0;
    for (const pool of [this.sh, this.cu]) {
      const P = pool.P, st = pool.st;
      for (let i = 0; i < pool.cap; i++) {
        if (st[i] !== REST) continue;
        const dx = P[i * 3] - p.pos.x, dz = P[i * 3 + 2] - p.pos.z, dy = P[i * 3 + 1] - p.pos.y;
        if (dx * dx + dz * dz < 0.2 && dy < 0.25 && dy > -0.25) n++;
      }
    }
    if (n) sfx.glass && sfx.glass('crunch', p.pos, Math.min(1, n / 6), p.sprinting);
  }

  clear() {
    for (const pool of [this.sh, this.cu]) { for (let i = 0; i < pool.cap; i++) pool.kill(i); pool.flush(); }
  }
}
