import * as THREE from 'three';
import { getVariant, instantiate } from '../zombies/model.js';
import { createDisplayGun } from '../weapons/models.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ===== 每個場景拿到的工具箱 T(src/teach/shell.js 換場景時 new 一個,離開時全部收乾淨)=====
// 場景定義(src/teach/lessons/*.js):
//   { id, title, say, task, fact, mode: '3d' | 'world', studio: {...}, run(T) { ...; return { update(dt, t), dispose() } } }
//   say/task/fact 可以有簡單的 HTML(<b>、<code>)。run 可以是 async。
//
// 3D 沙盒(mode 預設 '3d'):T.scene / T.camera(滑鼠拖曳旋轉、滾輪縮放)
//   T.studio({ bg, floor, grid, light })   換背景/地板/燈(換場景時先自動跑一次預設值)
//   T.view([x,y,z], [tx,ty,tz], { min, max, auto, fly })   相機位置與注視點(會飛過去)
//   T.add(obj…)  T.every((dt, t) => …)  T.onDispose(fn)  T.keep(obj, 'key')(離開時還原)
//   T.drag(obj, { plane: 'xz'|'xy'|'yz'|'view', onMove(pos), onEnd, clamp(pos) })   可以用滑鼠拖的物件
//   T.click(objs | null, (hit) => …)   點一下(objs = null:點地板,hit.point 是 y=0 平面上的點)
//   T.label(target, html, { cls, dy })  跟著 3D 位置走的標籤(target:Object3D、Vector3 或回傳 Vector3 的函式)
// 真實遊戲場景(mode: 'world'):T.spot('lobby'|'corridor'|'start', { yaw, pitch, dx, dz, h, fov })  T.look(false)(不能拖曳轉頭)
//   T.game 就是遊戲本體(game.scene、game.bloom、game.post.uniforms…);改值前先 T.keep,離開時會還原
//   T.info() → { calls, triangles }(上一幀遊戲畫了幾次、幾個三角形)
// 控制列(畫面下方):T.slider / T.toggle / T.choice / T.button / T.stat / T.quiz;程式碼面板:T.code(src, params, on)
// 2D 畫布:T.panel({ w, h, place: 'center'|'right'|'left'|'bottom' }) → { g (2D context), w, h, el, cv, on(fn) }
// 其他:T.done()(小任務完成)、T.toast(html)、T.audio()(AudioContext)、T.zombie(type, k)、T.gun(id)、T.tex(url)、T.tris(obj)

const texCache = new Map();
let envTex = null; // 沙盒的環境反射(每個渲染器做一次)
const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const decimals = (step) => { const s = String(step); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
// 指標捕捉:有些來源(觸控筆、合成事件)的 pointerId 不能捕捉,丟錯就算了
function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch { /* 沒關係 */ } }

export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};

export class Kit {
  constructor(sh, L) {
    this.sh = sh;
    this.L = L;
    this.THREE = THREE;
    this.game = sh.game;
    this.world = L.mode === 'world';
    this.scene = new THREE.Scene();
    this.camera = this.world ? sh.wcam : sh.cam;
    this.t = 0;
    this._fx = [];
    this._off = [];
    this._keeps = [];
    this._labels = [];
    this._stats = [];
    this._drags = [];
    this._clicks = [];
    this._grab = null;
    this._info = { calls: 0, triangles: 0 };
    this._camTw = null;
    this.ease = ease;
    this.done = this.done.bind(this);
    this._bindPointer();
  }

  // ================= 場景 =================
  studio(o = {}) {
    const s = this.scene;
    for (const c of [...s.children]) if (c.userData.studio) s.remove(c);
    s.background = o.bg === null ? null : new THREE.Color(o.bg ?? 0x0d1a1f);
    s.fog = o.fog ? new THREE.Fog(o.bg ?? 0x0d1a1f, o.fog[0], o.fog[1]) : null;
    if (o.env !== false && o.light !== 'dark') {
      if (!envTex) { const pm = new THREE.PMREMGenerator(this.sh.R); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
      s.environment = envTex;
      s.environmentIntensity = o.env ?? 0.35;
    } else s.environment = null;
    const tag = (x) => { x.userData.studio = true; s.add(x); return x; };
    if (o.light !== 'none') {
      const dark = o.light === 'dark';
      this.hemi = tag(new THREE.HemisphereLight(0xcfe8ff, 0x1b2a2c, dark ? 0.08 : 0.8));
      const k = (this.sun = tag(new THREE.DirectionalLight(0xfff2e0, dark ? 0 : 2.2)));
      k.position.set(4, 7, 5);
      k.castShadow = true;
      k.shadow.mapSize.set(1024, 1024);
      const sc = k.shadow.camera;
      sc.left = sc.bottom = -8; sc.right = sc.top = 8; sc.near = 0.5; sc.far = 30;
      k.shadow.bias = -0.0005;
      k.shadow.normalBias = 0.02;
    }
    if (o.floor !== false) {
      const fl = (this.floor = tag(new THREE.Mesh(new THREE.CircleGeometry(o.floorSize ?? 14, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: o.floorColor ?? 0x16272b, roughness: 0.95 }))));
      fl.receiveShadow = true;
      fl.userData.ground = true;
      if (o.grid !== false) {
        const g = tag(new THREE.GridHelper((o.floorSize ?? 14) * 2, (o.floorSize ?? 14) * 2, 0x2f5a58, 0x1f3a3c));
        g.position.y = 0.002;
        g.material.transparent = true;
        g.material.opacity = 0.55;
      }
    }
    this.view(o.cam || [4.5, 3.2, 6], o.target || [0, 1, 0], { fly: false, ...o.orbit });
    return this;
  }

  view(pos, target = [0, 0, 0], o = {}) {
    const sh = this.sh, oc = sh.orbit, cam = sh.cam;
    oc.minDistance = o.min ?? 1;
    oc.maxDistance = o.max ?? 40;
    oc.autoRotate = !!o.auto;
    oc.autoRotateSpeed = o.autoSpeed ?? 0.8;
    oc.enablePan = o.pan ?? false;
    oc.enableRotate = o.rotate ?? true;
    oc.enableZoom = o.zoom ?? true;
    oc.minPolarAngle = o.minPolar ?? 0;
    oc.maxPolarAngle = o.maxPolar ?? Math.PI * 0.49;
    const P = new THREE.Vector3(...pos), T = new THREE.Vector3(...target);
    // 窄畫面(直的、方的):鏡頭往後退,左右才裝得下
    const asp = cam.aspect || 1.6;
    if (asp < 1.45 && o.fit !== false) P.sub(T).multiplyScalar(Math.min(1.8, (1.45 / asp) ** 0.85)).add(T);
    if (o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
    if (o.fly === false || this.world) { cam.position.copy(P); oc.target.copy(T); cam.lookAt(T); oc.update(); this._camTw = null; return; }
    this._camTw = { p0: cam.position.clone(), t0: oc.target.clone(), p1: P, t1: T, t: 0, dur: o.dur ?? 0.9 };
  }

  add(...objs) { for (const o of objs) this.scene.add(o); return objs[0]; }
  every(fn) { this._fx.push(fn); return fn; }
  post(fn) { (this._post || (this._post = [])).push(fn); return fn; } // 主畫面畫完之後:fn(renderer, camera)(例如角落的小視窗)
  envMap() { return envTex; }
  onDispose(fn) { this._off.push(fn); }
  keep(obj, key) { if (obj) this._keeps.push([obj, key, obj[key]]); return obj?.[key]; }

  // ================= 真實遊戲場景 =================
  spot(name, o = {}) { this.sh.spotTo(name, o); }
  look(on = true) { this.sh.world.look = on; }
  info() { return this._info; }

  // ================= 素材 =================
  // 遊戲裡真正的殭屍(程式生成的模型 + 骨架);共用幾何,離開場景時不釋放
  zombie(type = 'walker', k = 0) {
    const z = instantiate(getVariant(type, k));
    z.mesh.userData.shared = true;
    z.mesh.frustumCulled = false;
    return z;
  }
  gun(id = 'ak47') {
    const g = createDisplayGun(id);
    g.userData.shared = true;
    return g;
  }
  tex(url, o = {}) {
    const key = url + (o.srgb === false ? '#lin' : '');
    let t = texCache.get(key);
    if (!t) {
      t = new THREE.TextureLoader().load((import.meta.env.BASE_URL || '/') + url.replace(/^\//, ''));
      if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      texCache.set(key, t);
    }
    return t;
  }
  tris(obj) {
    let n = 0;
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry, c = g.index ? g.index.count : g.attributes.position?.count || 0;
      n += (c / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return Math.round(n);
  }
  audio() { return this.sh.audio(); }

  // ================= 互動:拖曳、點擊 =================
  drag(obj, o = {}) { this._drags.push({ obj, ...o }); return obj; }
  click(objs, fn) { this._clicks.push({ objs: objs ? [].concat(objs) : null, fn }); }
  ray(e) {
    const r = this.sh.ui.cv.getBoundingClientRect();
    _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    return _ray;
  }
  ground(e, y = 0) {
    const ray = this.ray(e).ray;
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (y - ray.origin.y) / ray.direction.y;
    return t > 0 ? ray.origin.clone().addScaledVector(ray.direction, t) : null;
  }
  _hit(e, list) {
    const objs = list.map((d) => d.obj).filter((o) => o.visible !== false);
    if (!objs.length) return null;
    const h = this.ray(e).intersectObjects(objs, true)[0];
    if (!h) return null;
    let o = h.object;
    while (o && !objs.includes(o)) o = o.parent;
    return { ...h, entry: list.find((d) => d.obj === o) };
  }
  _bindPointer() {
    const cv = this.sh.ui.cv, sh = this.sh;
    let down = null;
    const plane = new THREE.Plane(), off = new THREE.Vector3(), p = new THREE.Vector3();
    const onDown = (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      const h = this._drags.length ? this._hit(e, this._drags) : null;
      if (!h) return;
      const d = h.entry, obj = d.obj;
      obj.getWorldPosition(p);
      const n = d.plane === 'xy' ? _v.set(0, 0, 1) : d.plane === 'yz' ? _v.set(1, 0, 0) : d.plane === 'view' ? this.camera.getWorldDirection(_v).negate() : _v.set(0, 1, 0);
      plane.setFromNormalAndCoplanarPoint(n.clone(), h.point);
      off.copy(p).sub(h.point);
      this._grab = { d, obj };
      sh.orbit.enabled = false;
      capture(cv, e);
      cv.style.cursor = 'grabbing';
      d.onStart?.(obj);
      e.stopImmediatePropagation();
    };
    const onMove = (e) => {
      const g = this._grab;
      if (g) {
        if (this.ray(e).ray.intersectPlane(plane, p)) {
          p.add(off);
          if (g.obj.parent && g.obj.parent !== this.scene) g.obj.parent.worldToLocal(p);
          if (g.d.clamp) g.d.clamp(p);
          g.obj.position.copy(p);
          g.d.onMove?.(g.obj.position, g.obj);
        }
        return;
      }
      if (e.buttons) return;
      // 游標提示:可以拖 / 可以點
      const canDrag = this._drags.length && this._hit(e, this._drags);
      const canClick = !canDrag && this._clicks.some((c) => c.objs && c.cursor !== false) && this._hit(e, this._clicks.flatMap((c) => (c.objs || []).map((obj) => ({ obj }))));
      cv.style.cursor = canDrag ? 'grab' : canClick || this._clicks.some((c) => !c.objs) ? 'pointer' : sh.mode === 'world' ? 'grab' : '';
    };
    const onUp = (e) => {
      const g = this._grab;
      if (g) {
        this._grab = null;
        sh.orbit.enabled = sh.mode !== 'world';
        cv.style.cursor = 'grab';
        g.d.onEnd?.(g.obj.position, g.obj);
        down = null;
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      for (const c of this._clicks) {
        if (!c.objs) { const pt = this.ground(e); c.fn({ point: pt, ray: this.ray(e).ray.clone(), event: e }); continue; }
        const h = this.ray(e).intersectObjects(c.objs.filter((o) => o.visible !== false), true)[0];
        if (h) { let o = h.object; while (o && !c.objs.includes(o)) o = o.parent; c.fn({ ...h, target: o, event: e }); }
      }
    };
    cv.addEventListener('pointerdown', onDown, true);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    this._off.push(() => {
      cv.removeEventListener('pointerdown', onDown, true);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.style.cursor = '';
      sh.orbit.enabled = sh.mode !== 'world';
    });
  }

  // ================= 標籤 =================
  label(target, html, o = {}) {
    const el = document.createElement('div');
    el.className = 'tl ' + (o.cls || '');
    el.innerHTML = html;
    this.sh.ui.lbl.appendChild(el);
    const L = { el, target, dy: o.dy || 0, dx: o.dx || 0, hide: false, set: (h) => { if (h !== L._h) { L._h = h; el.innerHTML = h; } return L; }, show: (v) => { L.hide = !v; return L; } };
    L._h = html;
    this._labels.push(L);
    return L;
  }

  // ================= 控制列 =================
  _ctl(cls, html) {
    const el = document.createElement('div');
    el.className = 'ctl ' + cls;
    el.innerHTML = html;
    this.sh.ui.dock.appendChild(el);
    return el;
  }
  slider({ label, min = 0, max = 1, step = 0.01, value = min, fmt, on, unit = '' }) {
    const f = fmt || ((v) => (+v).toFixed(decimals(step)) + unit);
    const el = this._ctl('sl', `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><b>${f(value)}</b>`);
    const inp = el.querySelector('input'), out = el.querySelector('b');
    const paint = () => { const k = (inp.value - min) / (max - min || 1); inp.style.setProperty('--k', (k * 100).toFixed(1) + '%'); };
    inp.addEventListener('input', () => { const v = +inp.value; out.textContent = f(v); paint(); on?.(v); });
    paint();
    on?.(+value);
    return { el, get value() { return +inp.value; }, set: (v) => { inp.value = v; out.textContent = f(+inp.value); paint(); on?.(+inp.value); } };
  }
  toggle({ label, value = false, on }) {
    const el = this._ctl('tg', `<button type="button"><i></i>${label}</button>`);
    const b = el.querySelector('button');
    let v = !!value;
    const paint = () => b.classList.toggle('on', v);
    b.onclick = () => { v = !v; paint(); on?.(v); };
    paint();
    on?.(v);
    return { el, get value() { return v; }, set: (x) => { v = !!x; paint(); on?.(v); } };
  }
  choice({ label, options, value, on }) {
    const opts = options.map((o) => (typeof o === 'object' ? o : { v: o, t: String(o) }));
    const el = this._ctl('ch', `${label ? `<span>${label}</span>` : ''}${opts.map((o, i) => `<button type="button" data-i="${i}">${o.t}</button>`).join('')}`);
    let cur = value ?? opts[0].v;
    const paint = () => { for (const b of el.querySelectorAll('button')) b.classList.toggle('on', opts[+b.dataset.i].v === cur); };
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cur = opts[+b.dataset.i].v; paint(); on?.(cur); });
    paint();
    on?.(cur);
    return { el, get value() { return cur; }, set: (v) => { cur = v; paint(); on?.(cur); } };
  }
  button(label, fn, cls = '') {
    const el = this._ctl('bt ' + cls, `<button type="button">${label}</button>`);
    const b = el.querySelector('button');
    b.onclick = () => fn?.(b);
    return { el, btn: b, set: (h) => { b.innerHTML = h; } };
  }
  stat(label, fn, cls = '') {
    const el = this._ctl('st ' + cls, `<span>${label}</span><b></b>`);
    const b = el.querySelector('b');
    const s = { el, fn, b, last: null };
    this._stats.push(s);
    return s;
  }
  quiz({ q, options, answer, on, why }) {
    const el = this._ctl('qz', `<span>${q}</span>${options.map((o, i) => `<button type="button" data-i="${i}">${o}</button>`).join('')}`);
    let solved = false;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || solved) return;
      const i = +b.dataset.i, ok = typeof answer === 'function' ? answer(i) : i === answer;
      if (ok) { solved = true; b.classList.add('yes'); el.classList.add('solved'); if (why) this.toast(why, 2600); on?.(true, i); this.done(); } else { b.classList.remove('no'); void b.offsetWidth; b.classList.add('no'); on?.(false, i); }
    });
    return el;
  }
  row() { return this._ctl('br', ''); } // 控制列換行

  // ================= 程式碼面板:{名字} 是可以改的值 =================
  // params[名字] = { value, min, max, step }(數字:左右拖、滾輪)| { value, type: 'color', options:[…] }(點一下換色)
  //              | { value, options: […] }(點一下換下一個)| { value, type: 'bool' }
  // on(vals, key):一開始呼叫一次(key = null),之後每次改值呼叫
  code(src, params = {}, on, o = {}) {
    if (this._codeBox) this.sh.ui.code.innerHTML = '';
    this._codeBox = true;
    const box = this.sh.ui.code;
    box.classList.add('on');
    box.classList.toggle('wide', !!o.wide);
    if (!this.world && o.shift !== false) this.sh.setShift(true); // 程式碼面板在左邊 → 3D 畫面的中心往右挪
    const vals = {};
    for (const k in params) vals[k] = params[k].value;
    const PH = /\{(\w+)\}/g;
    const tok = /(\/\/[^\n]*)|('[^'\n\u0001]*'|"[^"\n\u0001]*")|\u0001(\w+)\u0002|\b(const|let|new|function|return|for|if|else|true|false|of|while|import|from|class)\b|(\b\d+\.?\d*\b)|\b([A-Z][A-Za-z0-9]*)\b|(\w+)(?=\()/g;
    const fmtV = (k) => {
      const p = params[k], v = vals[k];
      if (p.type === 'color') { const hex = typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16); return `<i class="sw" style="background:#${hex.toString(16).padStart(6, '0')}"></i>0x${hex.toString(16).padStart(6, '0')}`; }
      if (p.type === 'bool') return String(!!v);
      if (p.options) return esc(p.fmt ? p.fmt(v) : v);
      return (+v).toFixed(p.dec ?? decimals(p.step ?? 1));
    };
    const pre = document.createElement('pre');
    if (o.title) { const h = document.createElement('div'); h.className = 'cf'; h.innerHTML = o.title; box.appendChild(h); }
    box.appendChild(pre);
    const hint = document.createElement('div');
    hint.className = 'ch-hint';
    hint.innerHTML = o.hint ?? '<b>黃色</b>的值可以改:數字左右拖、其他點一下';
    box.appendChild(hint);
    const render = () => {
      const marked = src.replace(PH, (m, k) => (k in params ? `\u0001${k}\u0002` : m));
      let out = '', last = 0;
      marked.replace(tok, (m, com, str, ph, kw, num, typ, fn, idx) => {
        out += esc(marked.slice(last, idx));
        last = idx + m.length;
        if (com) out += `<i class="c">${esc(com).replace(/\u0001(\w+)\u0002/g, (q, k) => `<span class="v" data-k="${k}">${fmtV(k)}</span>`)}</i>`;
        else if (str) out += `<i class="s">${esc(str)}</i>`;
        else if (ph) { const p = params[ph]; out += `<span class="v ${p.type === 'color' ? 'col' : p.options || p.type === 'bool' ? 'opt' : 'num'}" data-k="${ph}">${fmtV(ph)}</span>`; }
        else if (kw) out += `<i class="k">${kw}</i>`;
        else if (num) out += `<i class="n">${num}</i>`;
        else if (typ) out += `<i class="t">${typ}</i>`;
        else if (fn) out += `<i class="f">${fn}</i>`;
        return m;
      });
      out += esc(marked.slice(last));
      pre.innerHTML = out;
    };
    const set = (k, v, fire = true) => {
      const p = params[k];
      if (!p) return;
      if (p.min != null) v = clamp(v, p.min, p.max ?? Infinity);
      if (p.step && !p.options && p.type !== 'color' && p.type !== 'bool') v = Math.round(v / p.step) * p.step;
      if (vals[k] === v) return;
      vals[k] = v;
      const el = pre.querySelector(`.v[data-k="${k}"]`);
      if (el) { el.innerHTML = fmtV(k); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      for (const e2 of pre.querySelectorAll(`.v[data-k="${k}"]`)) if (e2 !== el) e2.innerHTML = fmtV(k);
      if (fire) on?.(vals, k);
    };
    let drag = null;
    pre.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.v');
      if (!el) return;
      e.preventDefault();
      const k = el.dataset.k, p = params[k];
      if (p.type === 'color' || p.options || p.type === 'bool') {
        if (p.type === 'bool') set(k, !vals[k]);
        else { const list = p.options || [0xff5a4a, 0xffc94a, 0x5fe0a8, 0x4aa8ff, 0xb57bff, 0xf2f2f2]; const i = list.indexOf(vals[k]); set(k, list[(i + 1) % list.length]); }
        return;
      }
      const range = (p.max ?? (+vals[k] + 10)) - (p.min ?? (+vals[k] - 10));
      drag = { k, x: e.clientX, v0: +vals[k], per: (p.step ?? 1) / Math.max(0.5, Math.min(8, 220 / (range / (p.step ?? 1)))) };
      capture(pre, e);
      el.classList.add('drag');
      document.body.style.cursor = 'ew-resize';
    });
    pre.addEventListener('pointermove', (e) => {
      if (!drag) return;
      set(drag.k, drag.v0 + (e.clientX - drag.x) * drag.per);
    });
    const end = () => { if (!drag) return; pre.querySelector(`.v[data-k="${drag.k}"]`)?.classList.remove('drag'); drag = null; document.body.style.cursor = ''; };
    pre.addEventListener('pointerup', end);
    pre.addEventListener('pointercancel', end);
    pre.addEventListener('wheel', (e) => {
      const el = e.target.closest('.v.num');
      if (!el) return;
      e.preventDefault();
      const p = params[el.dataset.k];
      set(el.dataset.k, +vals[el.dataset.k] + (e.deltaY < 0 ? 1 : -1) * (p.step ?? 1));
    }, { passive: false });
    render();
    on?.(vals, null);
    // src(新的程式碼):整段換掉(例如一行一行長出來);hl(行號 | null):把某一行標亮
    return {
      vals, get: (k) => vals[k], set: (k, v) => set(k, v), el: box,
      src: (s2) => { src = s2; render(); pre.scrollTop = pre.scrollHeight; },
    };
  }

  // ================= 2D 畫布 =================
  panel({ w = 420, h = 260, place = 'center', cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = `pn pn-${place} ${cls}`;
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    el.appendChild(cv);
    this.sh.ui.pnl.appendChild(el);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = {
      el, cv, g, w, h,
      clear(bg) { g.clearRect(0, 0, w, h); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); } },
      // on((type, x, y, e) => …):type = 'down' | 'move' | 'up';x/y 是畫布座標(px)
      on(fn) {
        let held = false;
        const xy = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h]; };
        cv.addEventListener('pointerdown', (e) => { held = true; capture(cv, e); fn('down', ...xy(e), e); });
        cv.addEventListener('pointermove', (e) => fn(held ? 'drag' : 'move', ...xy(e), e));
        cv.addEventListener('pointerup', (e) => { held = false; fn('up', ...xy(e), e); });
        return P;
      },
    };
    return P;
  }

  // 鍵盤(教室開著時只有 ←/→/Esc/F2/Home 有固定用途,其他鍵交給場景):fn(e) 回傳 true 表示吃掉
  key(fn) { this._keyFns = (this._keyFns || []).concat(fn); }
  _key(e) { for (const f of this._keyFns || []) if (f(e)) { e.preventDefault(); return; } }

  // ================= 回饋 =================
  done() { return this.sh.complete(this.L.id); }
  isDone() { return this.sh.isDone(this.L.id); }
  toast(html, ms) { this.sh.toast(html, ms); }

  // ================= 內部:每幀、標籤、收拾 =================
  _tick(dt) {
    this.t += dt;
    const tw = this._camTw;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease.inOut(tw.t), sh = this.sh;
      sh.cam.position.lerpVectors(tw.p0, tw.p1, e);
      sh.orbit.target.lerpVectors(tw.t0, tw.t1, e);
      if (tw.t >= 1) this._camTw = null;
    }
    for (const f of this._fx) f(dt, this.t);
    if ((this._st = (this._st || 0) - dt) <= 0 && this._stats.length) {
      this._st = 0.12;
      for (const s of this._stats) {
        let v;
        try { v = s.fn(); } catch { v = '—'; }
        if (v !== s.last) { s.last = v; s.b.innerHTML = v; }
      }
    }
  }
  _afterRender(cam) {
    if (this._post) for (const f of this._post) f(this.sh.R, cam);
    if (!this._labels.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    cam.updateMatrixWorld();
    for (const L of this._labels) {
      let p = L.target;
      if (typeof p === 'function') p = p();
      if (p && p.isObject3D) p = p.getWorldPosition(_v);
      if (!p || L.hide) { L.el.style.display = 'none'; continue; }
      _v.copy(p);
      _v.y += L.dy;
      _v.project(cam);
      if (_v.z > 1 || _v.z < -1) { L.el.style.display = 'none'; continue; }
      L.el.style.display = '';
      L.el.style.transform = `translate(${((_v.x + 1) / 2) * w + L.dx}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  }
  _dispose() {
    for (const f of this._off.splice(0).reverse()) { try { f(); } catch (e) { console.warn('[teach] off', e); } }
    for (const [o, k, v] of this._keeps.splice(0).reverse()) o[k] = v;
    const seen = new Set();
    const walk = (o) => {
      if (o.userData?.shared) return;
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose?.(); }
      for (const m of [].concat(o.material || [])) if (m && !seen.has(m)) { seen.add(m); m.dispose?.(); }
      if (o.isSkinnedMesh === false && o.skeleton) o.skeleton.dispose?.();
      for (const c of o.children) walk(c);
    };
    for (const c of this.scene.children) walk(c);
    this.scene.clear();
    this.sh.orbit.autoRotate = false;
  }
}
