import * as THREE from 'three';
import { parseLayout } from '../../levels.js';
import { createDressCtx } from '../ctx.js';
import { dressIndoor, INDOOR_THEMES } from '../indoor.js';
import { mat } from '../../materials.js';
import { stateOf } from './place.js';
import { tplTime } from './geo.js';
import { atlasStats } from './atlas.js';

// 開發用檢視器(遊戲不會載入):在頁面上建簡單灰盒 + 擺上室內道具,供截圖腳本使用。
// 用法(在頁面內):const v = await (await import('/src/map/props/indoor/devview.js')).setup();
//                   v.shoot({ zone: 'f1_xray', from: [x, y, z], to: [x, y, z] })
export async function setup({ zones = null, mood = 'bright' } = {}) {
  window.requestAnimationFrame = () => 0; // 停掉遊戲主迴圈
  for (const el of document.body.children) el.style.display = 'none';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:99';
  document.body.appendChild(canvas);
  document.body.style.display = 'block';
  canvas.style.display = 'block';
  const W = window.innerWidth, H = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050606);
  const camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 160);
  // 和場景建構器相同的昏暗環境貼圖(金屬才不會全黑)
  {
    const envScene = new THREE.Scene();
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vD; void main(){ vec3 d = normalize(vD); float u = d.y; vec3 c = u > 0.0 ? mix(vec3(0.16,0.19,0.25), vec3(0.05,0.07,0.12), pow(u, 0.6)) : mix(vec3(0.1,0.1,0.1), vec3(0.03,0.028,0.025), pow(-u, 0.5)); float panels = step(0.92, fract(d.x * 3.0 + 0.5)) * step(0.0, u) * step(u, 0.5) * 0.15; gl_FragColor = vec4(c + panels, 1.0); }',
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }
  scene.add(camera);

  const L = parseLayout();
  const group = new THREE.Group();
  scene.add(group);
  const boxes = [];
  const world = { addBox(cx, cz, sx, sz, h, y0 = 0) { const b = { cx, cz, sx, sz, h, y0 }; boxes.push(b); return b; }, removeBox() {} };
  const ctx = createDressCtx({ layout: L, world, group });
  const t0 = performance.now();
  const timing = {};
  for (const z of L.zones) {
    if (!INDOOR_THEMES.has(z.theme) || (zones && !zones.includes(z.id) && !zones.includes(z.theme))) continue;
    const a = performance.now();
    dressIndoor(ctx, z);
    timing[z.id] = +(performance.now() - a).toFixed(1);
  }
  const t1 = performance.now();
  const fin = ctx.finalize();
  const t2 = performance.now();

  // ---- 灰盒 ----
  const grey = new THREE.Group();
  scene.add(grey);
  const byMat = new Map();
  const addBox = (m, x, y, z, sx, sy, sz) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
  };
  const wallM = new THREE.MeshStandardMaterial({ color: 0x7d8a80, roughness: 0.9 });
  const ceilM = new THREE.MeshStandardMaterial({ color: 0x6a6a64, roughness: 1 });
  const railM = new THREE.MeshStandardMaterial({ color: 0x5a5a56, roughness: 0.7 });
  for (const lv of L.levels) {
    const li = lv.index, y = lv.y;
    for (let r = 0; r < L.H; r++) for (let c = 0; c < L.W; c++) {
      const ch = L.charAt(li, c, r), x = (c + 0.5) * 2, z = (r + 0.5) * 2, f = L.flagsAt(li, c, r);
      const st = L.styleAt(li, c, r);
      if (L.hasFloor(li, c, r) && ch !== '#') addBox(mat(st.floor || 'concrete'), x, y - 0.05, z, 2, 0.1, 2);
      if (ch === '#' || ch === 'E') {
        const zz = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => L.zoneAt(li, c + dc, r + dr)).find((q) => q && q.wall);
        addBox(zz ? mat(zz.wall) : wallM, x, y + L.LEVEL_H / 2, z, 2, L.LEVEL_H, 2);
      } else if (ch === 'W') {
        addBox(wallM, x, y + 0.45, z, 2, 0.9, 2);
        addBox(wallM, x, y + 2.4 + (L.LEVEL_H - 2.4) / 2, z, 2, L.LEVEL_H - 2.4, 2);
      } else if (ch === '=') addBox(railM, x, y + 0.55, z, 2, 1.1, 0.3);
      else if (ch === '+') addBox(wallM, x, y + 2.4 + (L.LEVEL_H - 2.4) / 2, z, 2, L.LEVEL_H - 2.4, 2);
      if ((f & L.F.WALK) && !(f & L.F.OUTDOOR)) {
        const cy = L.ceilY(li, c, r);
        if (cy < 1e5) addBox(ceilM, x, cy + 0.05, z, 2, 0.1, 2);
      }
    }
  }
  const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
  for (const [m, gs] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(gs), m);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    grey.add(mesh);
  }

  // ---- 燈 ----
  const amb = new THREE.HemisphereLight(0xb8c4c0, 0x2a2622, mood === 'bright' ? 1.6 : 0.35);
  scene.add(amb);
  const pool = [];
  for (let i = 0; i < 8; i++) { const p = new THREE.PointLight(0xffffff, 0, 10, 2); scene.add(p); pool.push(p); }
  const fill = [];
  for (let i = 0; i < 4; i++) { const p = new THREE.PointLight(0xe8f0e8, 0, 14, 1.6); scene.add(p); fill.push(p); }
  const flash = new THREE.SpotLight(0xfff1d6, mood === 'bright' ? 30 : 75, 30, 0.62, 0.95, 1.8);
  flash.castShadow = true;
  flash.shadow.mapSize.set(1024, 1024);
  flash.shadow.bias = -0.0004;
  camera.add(flash);
  flash.position.set(0.25, -0.2, 0);
  flash.target.position.set(0, 0, -5);
  camera.add(flash.target);

  // 統計
  let tris = 0, meshes = 0, instMeshes = 0, inst = 0, dyn = 0;
  group.traverse((o) => {
    if (o.isInstancedMesh) { instMeshes++; inst += o.count; tris += (o.geometry.attributes.position.count / 3) * o.count; }
    else if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; }
    if (o.userData.dynamic) dyn++;
  });
  const st = stateOf(ctx);
  const info = {
    dressMs: +(t1 - t0).toFixed(0), finalizeMs: +(t2 - t1).toFixed(0), groupChildren: group.children.length,
    meshes, instMeshes, instances: inst, dynamic: dyn, tris: Math.round(tris), lights: fin.lights.length, events: fin.events.length,
    colliders: boxes.length, zones: st.zones, timing,
    atlas: atlasStats(),
    use: Object.entries(st.use || {}).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}:${Math.round(v / 1000)}k`).join(' '),
    tpl: [...tplTime].sort((a, b) => b[1].ms - a[1].ms).slice(0, 25).map(([k, e]) => `${k}:${e.ms.toFixed(0)}ms/${e.n}/${e.tris}t`).join(' '),
  };

  const zoneById = Object.fromEntries(L.zones.map((z) => [z.id, z]));
  function shoot({ zone, from, to, fov = 75, bright = mood === 'bright', exposure = 1.15, flashOn = true } = {}) {
    const z = zoneById[zone];
    const y = z ? L.levels[z.levelIndex].y : 0;
    camera.fov = fov;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    camera.position.set(from[0], y + from[1], from[2]);
    camera.lookAt(to[0], y + to[1], to[2]);
    camera.updateMatrixWorld(true);
    renderer.toneMappingExposure = exposure;
    flash.intensity = flashOn ? (bright ? 30 : 75) : 0;
    amb.intensity = bright ? 1.6 : 0.35;
    // 區域燈具:取最近的 8 盞登記燈
    const near = fin.lights.filter((l) => Math.abs(l.y - (y + 2)) < 4).map((l) => [l, (l.x - from[0]) ** 2 + (l.z - from[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    pool.forEach((p, i) => {
      const e = near[i];
      if (!e) { p.intensity = 0; return; }
      const l = e[0];
      p.position.set(l.x, l.y, l.z);
      p.color.set(l.color ?? 0xffffff);
      p.intensity = l.intensity ?? 3;
      p.distance = l.distance ?? 8;
    });
    // 補光:房間上方
    const lv = z ? z.levelIndex : 0;
    const cells = [];
    if (z) for (const [c0, r0, c1, r1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push([c, r]);
    fill.forEach((p, i) => {
      if (!bright || !cells.length) { p.intensity = 0; return; }
      const [c, r] = cells[Math.floor(((i + 0.5) / fill.length) * cells.length)];
      p.position.set((c + 0.5) * 2, L.levels[lv].y + 3.0, (r + 0.5) * 2);
      p.intensity = 9;
    });
    renderer.render(scene, camera);
    return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }
  // 自動取景:站在區域某個角落(往內 0.7m、眼高 1.65),看向區域中心
  function shootZone(id, corner = 0, o = {}) {
    const z = zoneById[id];
    const cells = [];
    for (const [c0, r0, c1, r1] of z.rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (L.flagsAt(z.levelIndex, c, r) & L.F.WALK) cells.push([c, r]);
    let cx = 0, cz = 0;
    for (const [c, r] of cells) { cx += (c + 0.5) * 2; cz += (r + 0.5) * 2; }
    cx /= cells.length; cz /= cells.length;
    const ext = cells.map(([c, r]) => [(c + 0.5) * 2, (r + 0.5) * 2]);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const [sx, sz] = corners[corner % 4];
    let best = ext[0], bd = -1e9;
    for (const [x, zz] of ext) { const d = x * sx + zz * sz; if (d > bd) { bd = d; best = [x, zz]; } }
    const from = [best[0] + sx * 0.3, o.h ?? 1.65, best[1] + sz * 0.3];
    const to = o.to ?? [cx, o.th ?? 0.7, cz];
    return shoot({ zone: id, from, to, ...o });
  }
  const v = { L, ctx, scene, camera, renderer, info, shoot, shootZone, group, boxes, fin };
  window.__pv = v;
  return info;
}
