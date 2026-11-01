import * as THREE from 'three';

// ===== 大物件的硬體遮擋查詢(金水商行、補給櫃)=====
// 這些物件是一大串獨立 mesh(商行 113 個、746k 頂點;每座補給櫃約 40 個),不在批次裡,房間 PVS(2D 格子)也看不到
// 立面、樓梯、樓板這種遮擋 → 大廳、停車場、樓上遊戲室都會把整間商行畫出來(約 90 個 draw)。
// 做法:場景畫完後,在同一個深度緩衝上畫每個物件放大一點的包圍盒(不寫顏色、不寫深度)並包一個
// ANY_SAMPLES_PASSED 查詢(不用 _CONSERVATIVE:ANGLE/D3D11 上會誤報「看得到」,實測遊戲室與停車場永遠不藏);結果 1~3 幀後讀回。連續兩次「完全被擋住」→ 之後的場景繪製先把它藏起來
// (render 期間暫時 visible = false,畫完還原;遊戲邏輯設的 visible 不受影響),查詢照樣每幀做(盒子不藏)→ 一露出來就恢復。
// - 包圍盒在視錐外:不藏(three 自己的視錐剔除就不會畫),狀態回到「看得到」→ 轉頭時不會晚一兩幀才出現。
// - 眼睛在包圍盒裡:一律看得到。月光陰影要重畫的那一幀不藏(靜態陰影圖要完整)。
// - 只多每個物件一個 12 面的小 draw;材質在 GfxPass.materials 裡,開機預編譯(不會在 hz:warm 之後出現新 program)。
const PAD = 0.6; // 包圍盒外擴(公尺):從轉角走出來時,盒子比物件早一點露出來
const VS = 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }';
const FS = 'void main(){ gl_FragColor = vec4( 0.0 ); }';

export class Occluder {
  constructor(renderer) {
    this.gl = renderer.getContext();
    this.ok = !!this.gl.createQuery && typeof WebGL2RenderingContext !== 'undefined' && this.gl instanceof WebGL2RenderingContext;
    this.material = new THREE.ShaderMaterial({ name: 'gfx.occ', vertexShader: VS, fragmentShader: FS, colorWrite: false, depthWrite: false, depthTest: true, side: THREE.FrontSide, fog: false, toneMapped: false });
    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.geo.deleteAttribute('normal'); // 有法線的幾何是另一個 program 變體;開機預編譯用的全螢幕三角形只有 position/uv → 拿掉才會共用同一個
    this.items = [];
    this.enabled = true;
    this.frame = 0;
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._hidden = [];
    this.stats = { tested: 0, hidden: 0 };
  }

  // obj:要測的物件(Object3D);回傳登記項。物件是靜態的(包圍盒只算一次;refit() 重算)
  add(obj, name = obj.name || '') {
    if (!obj || this.items.some((it) => it.obj === obj)) return null;
    const mesh = new THREE.Mesh(this.geo, this.material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    const it = { obj, name, mesh, box: new THREE.Box3(), q: [], vis: true, occ: 0, fit: false };
    mesh.onBeforeRender = () => { if (it.cur) this.gl.beginQuery(this.gl.ANY_SAMPLES_PASSED, it.cur); };
    mesh.onAfterRender = () => { if (it.cur) { this.gl.endQuery(this.gl.ANY_SAMPLES_PASSED); it.q.push(it.cur); it.cur = null; } };
    this.items.push(it);
    this.scene.add(mesh);
    return it;
  }
  remove(obj) {
    const i = this.items.findIndex((it) => it.obj === obj);
    if (i < 0) return;
    const it = this.items[i];
    for (const q of it.q) this.gl.deleteQuery(q);
    this.scene.remove(it.mesh);
    this.items.splice(i, 1);
  }
  refit(it) {
    it.obj.updateMatrixWorld(true);
    it.box.setFromObject(it.obj);
    if (it.box.isEmpty()) return false;
    const s = it.box.getSize(new THREE.Vector3()).addScalar(PAD * 2), c = it.box.getCenter(new THREE.Vector3());
    it.box.expandByScalar(PAD);
    it.mesh.matrix.compose(c, new THREE.Quaternion(), s);
    it.mesh.matrixWorld.copy(it.mesh.matrix);
    it.fit = true;
    return true;
  }

  // 讀回已完成的查詢(不等):最舊的先
  poll(it) {
    const gl = this.gl;
    while (it.q.length) {
      const q = it.q[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const any = gl.getQueryParameter(q, gl.QUERY_RESULT);
      it.q.shift();
      (this.free || (this.free = [])).push(q);
      if (any) { it.occ = 0; it.vis = true; } else if (++it.occ >= 2) it.vis = false;
    }
  }

  // 場景繪製前:把確定被擋住的物件暫時藏起來。camera = 這一幀的相機(含 TAA 抖動無妨)
  hide(camera, keepAll = false) {
    this._hidden.length = 0;
    if (!this.ok || !this.enabled) return;
    this.frame++;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m, camera.coordinateSystem, camera.reversedDepth);
    const eye = camera.getWorldPosition(this._eye || (this._eye = new THREE.Vector3()));
    let n = 0;
    for (const it of this.items) {
      this.poll(it);
      it.test = false;
      if (!it.obj.parent || !it.obj.visible) { it.vis = true; it.occ = 0; continue; } // 遊戲邏輯已經關掉(或不在場景)
      if (!it.fit && !this.refit(it)) continue;
      if (it.box.containsPoint(eye) || !this._frustum.intersectsBox(it.box)) { it.vis = true; it.occ = 0; continue; }
      it.test = true;
      if (!it.vis && !keepAll) { it.obj.visible = false; this._hidden.push(it.obj); n++; }
    }
    this.stats.hidden = n;
  }
  restore() { for (const o of this._hidden) o.visible = true; this._hidden.length = 0; }

  // 場景繪製後(同一個渲染目標、深度還在):畫查詢盒
  query(renderer, camera) {
    if (!this.ok || !this.enabled || !this.items.length) return;
    let n = 0;
    for (const it of this.items) {
      it.mesh.visible = !!it.test && it.q.length < 3;
      if (it.mesh.visible) { it.cur = (this.free && this.free.pop()) || this.gl.createQuery(); n++; }
    }
    this.stats.tested = n;
    if (!n) return;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = ac;
    for (const it of this.items) if (it.cur) { (this.free || (this.free = [])).push(it.cur); it.cur = null; } // 沒畫到(不應發生)
  }
}
