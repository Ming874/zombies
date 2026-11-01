// 把 Microsoft Rocketbox 角色(MIT,https://github.com/microsoft/Microsoft-Rocketbox)轉成遊戲用 GLB:
//   殭屍 → public/models/zombies/<id>.glb、倖存者(健康外觀)→ public/models/survivors/<id>.glb
// 用法:
//   cd tools/zombies && npm install          (只有建置工具用;three 用專案根目錄的)
//   node tools/zombies/build.mjs <Avatars 目錄> [id ...]
//   <Avatars 目錄> 底下是 Rocketbox 的 Assets/Avatars 結構:<類別>/<名稱>/Export/<名稱>.fbx 與 Textures/*_color*.tga、*_normal*.tga
// 流程:FBX → 擺成遊戲骨架的靜止姿勢、CPU 蒙皮、權重改對應 22 根骨骼(lib/conform.mjs)→ 焊接頂點、依材質分組 →
//   貼圖縮小 + 殭屍化烘焙(lib/bake.mjs;倖存者略過)→ 量化 + meshopt 壓縮的 GLB(lib/glb.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadFBX, conform, BONES } from './lib/conform.mjs';
import { readTGA } from './lib/tga.mjs';
import { raster, dilate, skinRef, handRef, zombify, plan, partOf } from './lib/bake.mjs';
import { writeGLB } from './lib/glb.mjs';
import { CHARACTERS } from './characters.mjs';
import { SURVIVORS } from './survivors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const [srcDir, ...only] = process.argv.slice(2);
if (!srcDir) { console.error('用法:node tools/zombies/build.mjs <Rocketbox Avatars 目錄> [id ...]'); process.exit(1); }

// 貼圖尺寸(顏色 / 法線)
const SIZE = { body: [1024, 512], head: [1024, 512], hair: [512, 256], gear: [512, 512] };

async function resize(img, w, h) {
  const buf = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  return { width: w, height: h, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
}
const webp = (data, w, h, opt) => sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels: 4 } }).webp({ effort: 6, ...opt }).toBuffer();

function findTex(dir, mat, kind) {
  const files = fs.readdirSync(dir);
  const re = new RegExp('^' + mat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_' + kind + '.*\\.tga$', 'i');
  const f = files.find((x) => re.test(x));
  return f ? path.join(dir, f) : null;
}

async function build(ch, healthy) {
  const t0 = Date.now();
  const name = path.basename(ch.src);
  const dir = path.join(srcDir, ch.src);
  const fbx = fs.readFileSync(path.join(dir, 'Export', name + '.fbx'));
  // 倖存者:右手握槍把、左手托護木;殭屍:微彎的爪
  const C = conform(loadFBX(fbx), healthy ? { curlR: [0.95, 1.2, 0.8], thumbR: [0.3, 0.45, 0.35], curlL: [0.35, 0.55, 0.45], thumbL: [0.15, 0.25, 0.2] } : { curl: ch.look?.curl });

  // ---- 材質分類:body / head / extra(頭髮睫毛等半透明 → hair;安全帽/裝備 → gear)----
  const kinds = C.materials.map((m) => (/_body$/i.test(m) ? 'body' : /_head$/i.test(m) ? 'head' : 'extra'));
  if (kinds.filter((k) => k === 'extra').length > 1) throw new Error(`${ch.id}:材質太多(最多 body/head/1 個 extra):${C.materials.join(', ')}`);
  const matOf = new Uint8Array(C.count);
  for (const g of C.groups) matOf.fill(g.mat, g.start, g.start + g.count);

  // ---- 口內(牙齒/舌頭/口腔)判定:嘴附近、在臉部表面之後的頂點 ----
  const mo = C.mouth, face = new Map(), cell = 0.004;
  const ck = (x, y) => Math.round(x / cell) + ',' + Math.round(y / cell);
  for (let i = 0; i < C.count; i++) {
    const x = C.pos[i * 3], y = C.pos[i * 3 + 1], z = C.pos[i * 3 + 2];
    if (Math.abs(x - mo.x) > 0.05 || Math.abs(y - mo.y) > 0.05 || C.nor[i * 3 + 2] < 0.3) continue;
    const k = ck(x, y);
    if (!(face.get(k) >= z)) face.set(k, z);
  }
  const inner = new Float32Array(C.count);
  for (let i = 0; i < C.count; i++) {
    const x = C.pos[i * 3], y = C.pos[i * 3 + 1], z = C.pos[i * 3 + 2];
    if (Math.abs(x - mo.x) > 0.03 || Math.abs(y - mo.y) > 0.025 || z > mo.z || z < mo.z - 0.06) continue;
    let fz = -Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const v = face.get(Math.round(x / cell + dx) + ',' + Math.round(y / cell + dy)); if (v > fz) fz = v; }
    if (z < fz - 0.004) inner[i] = 1;
  }

  // ---- 焊接 + 依材質拆成 primitive(UV 轉成 glTF 慣例:原點在左上)----
  const part = new Uint8Array(C.count);
  for (let i = 0; i < C.count; i++) part[i] = partOf(BONES[C.dom[i]]);
  const prims = [];
  const order = ['body', 'head', 'extra'];
  for (const kind of order) {
    const mi = kinds.indexOf(kind);
    if (mi < 0) continue;
    const keyMap = new Map(), src = [], index = [];
    for (let i = 0; i < C.count; i++) {
      if (matOf[i] !== mi) continue;
      const r = (v, q) => Math.round(v * q);
      const key = [r(C.pos[i * 3], 1e5), r(C.pos[i * 3 + 1], 1e5), r(C.pos[i * 3 + 2], 1e5), r(C.nor[i * 3], 1e3), r(C.nor[i * 3 + 1], 1e3), r(C.nor[i * 3 + 2], 1e3), r(C.uv[i * 2], 1e5), r(C.uv[i * 2 + 1], 1e5), C.joints[i * 4], C.joints[i * 4 + 1], r(C.weights[i * 4], 1e3), r(C.weights[i * 4 + 1], 1e3)].join(',');
      let k = keyMap.get(key);
      if (k === undefined) { k = src.length; keyMap.set(key, k); src.push(i); }
      index.push(k);
    }
    const nv = src.length;
    const P = { name: kind, pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3), uv: new Float32Array(nv * 2), col: new Float32Array(nv * 4), joints: new Uint8Array(nv * 4), weights: new Float32Array(nv * 4), part: new Uint8Array(nv), eye: new Float32Array(nv), inner: new Float32Array(nv) };
    let uMin = 1, uMax = 0, vMin = 1, vMax = 0;
    src.forEach((i, k) => {
      for (let c = 0; c < 3; c++) { P.pos[k * 3 + c] = C.pos[i * 3 + c]; P.nor[k * 3 + c] = C.nor[i * 3 + c]; }
      const u = C.uv[i * 2], v = 1 - C.uv[i * 2 + 1];
      P.uv[k * 2] = u; P.uv[k * 2 + 1] = v;
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
      for (let c = 0; c < 4; c++) { P.joints[k * 4 + c] = C.joints[i * 4 + c]; P.weights[k * 4 + c] = C.weights[i * 4 + c]; }
      P.col[k * 4] = P.col[k * 4 + 1] = P.col[k * 4 + 2] = 1;
      P.col[k * 4 + 3] = healthy ? 0 : C.eye[i]; // A = 眼球(執行期手電筒照到的眼底反光)
      P.part[k] = part[i]; P.eye[k] = C.eye[i]; P.inner[k] = inner[i];
    });
    if (uMin < -0.001 || vMin < -0.001 || uMax > 1.001 || vMax > 1.001) {
      console.warn(`  ${ch.id}/${kind}:UV 超出 0..1(${uMin.toFixed(3)}..${uMax.toFixed(3)}, ${vMin.toFixed(3)}..${vMax.toFixed(3)}),夾到範圍內`);
      for (let k = 0; k < P.uv.length; k++) P.uv[k] = Math.min(1, Math.max(0, P.uv[k]));
    }
    P.index = nv < 65536 ? new Uint16Array(index) : new Uint32Array(index);
    P.mat = C.materials[mi];
    prims.push(P);
  }

  // ---- 貼圖 ----
  const texDir = path.join(dir, 'Textures');
  const rig = { bones: C.bones, HC: C.HC, mouth: C.mouth };
  const verts = { count: C.count, pos: C.pos, nor: C.nor, part };
  const pl = healthy ? null : plan(ch.look, rig, verts);
  let ref = null;
  const ordered = [...prims].sort((a, b) => (a.name === 'head' ? -1 : b.name === 'head' ? 1 : 0)); // 先做頭(皮膚參考色)
  const stats = {};
  for (const P of ordered) {
    const cf = findTex(texDir, P.mat, 'color'), nf = findTex(texDir, P.mat, 'normal');
    if (!cf) throw new Error(`${ch.id}:找不到 ${P.mat} 的顏色貼圖`);
    const raw = readTGA(fs.readFileSync(cf));
    let hasAlpha = false;
    for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] < 250) { hasAlpha = true; break; }
    const kind = P.name === 'extra' ? (hasAlpha ? 'hair' : 'gear') : P.name;
    P.alpha = kind === 'hair';
    const [cs, ns] = SIZE[kind];
    const aspect = raw.height / raw.width;
    const cw = Math.min(cs, raw.width), chh = Math.round(cw * aspect);
    const col = await resize(raw, cw, chh);
    let color = col.data, skin = null;
    {
      const M = raster(P.index, P, cw, chh);
      dilate(M);
      if (P.name === 'head') ref = skinRef(M, col.data, [C.joints3.cheekL, C.joints3.cheekR]);
      const ref2 = P.name === 'body' ? handRef(M, col.data, ref) : null;
      const bn = (n) => C.bones.find((b) => b.name === n);
      const z = zombify(col.data, M, ch.look || { seed: 1 }, { ref: ref || [0.42, 0.26, 0.2], ref2, eyes: C.eyes, mouth: C.mouth, HC: C.HC, kind, collarY: bn('neck').head.y - 0.04, tips: [bn('handL').tail, bn('handR').tail], cheeks: [C.joints3.cheekL, C.joints3.cheekR], nose: C.joints3.nose, healthy, wounds: [], drips: [], chin: null, ...pl });
      color = z.color; skin = z.skin;
    }
    // A 通道反著存(255 = 0,128 = 1):不讓 A 接近 0 —— WebP 會改寫全透明像素的 RGB,有些瀏覽器解碼時預乘 alpha 也會吃掉低 alpha 的顏色精度
    if (!P.alpha) for (let i = 3; i < color.length; i += 4) color[i] = skin ? 255 - Math.round((color[i] / 255) * 127) : 255;
    // 法線圖:A = 皮膚遮罩(殭屍化時算出,縮到法線圖尺寸)
    const nw = Math.min(ns, cw), nh = Math.round(nw * aspect);
    let nrm;
    if (nf) nrm = await resize(readTGA(fs.readFileSync(nf)), nw, nh);
    else { nrm = { width: nw, height: nh, data: new Uint8Array(nw * nh * 4) }; for (let i = 0; i < nrm.data.length; i += 4) { nrm.data[i] = 128; nrm.data[i + 1] = 128; nrm.data[i + 2] = 255; } }
    if (skin) {
      const sk = await sharp(Buffer.from(skin.buffer), { raw: { width: cw, height: chh, channels: 1 } }).resize(nw, nh).raw().toBuffer();
      for (let i = 0; i < nw * nh; i++) nrm.data[i * 4 + 3] = 255 - Math.round((sk[i] / 255) * 127);
    } else for (let i = 0; i < nw * nh; i++) nrm.data[i * 4 + 3] = 255;
    P.color = await webp(color, cw, chh, { quality: 80, alphaQuality: 90, exact: true });
    P.normal = await webp(nrm.data, nw, nh, { quality: 76, alphaQuality: 70, exact: true });
    P.roughness = kind === 'gear' ? 0.6 : 0.8;
    stats[P.name] = `${kind} ${cw}x${chh}/${nw}x${nh} tris ${P.index.length / 3} verts ${P.pos.length / 3}`;
    if (process.env.HZ_DEBUG) {
      const dd = process.env.HZ_DEBUG; // 除錯:輸出烘焙後的顏色圖 PNG 到這個目錄
      fs.mkdirSync(dd, { recursive: true });
      await sharp(Buffer.from(color.buffer, color.byteOffset, color.byteLength), { raw: { width: cw, height: chh, channels: 4 } }).removeAlpha().png().toFile(path.join(dd, `${ch.id}_${P.name}.png`));
    }
  }

  const extras = {
    v: 1, id: ch.id, bones: C.bones.map((b) => [b.name, b.parent, ...b.head.toArray().map((x) => +x.toFixed(4)), ...b.tail.toArray().map((x) => +x.toFixed(4))]),
    HC: C.HC.toArray().map((x) => +x.toFixed(4)), mouth: C.mouth.toArray().map((x) => +x.toFixed(4)),
    P: { ...C.P, fem: ch.fem ? 1 : 0, ...(ch.old ? { old: 1 } : {}), ...(ch.amp ? { amp: ch.amp } : {}) },
  };
  const outDir = path.join(ROOT, 'public/models', healthy ? 'survivors' : 'zombies');
  fs.mkdirSync(outDir, { recursive: true });
  const bytes = await writeGLB(path.join(outDir, ch.id + '.glb'), { name: ch.id, prims, extras });
  fs.writeFileSync(path.join(outDir, ch.id + '.glb'), bytes);
  const tris = prims.reduce((s, p) => s + p.index.length / 3, 0);
  console.log(`${ch.id.padEnd(10)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB  tris ${tris}  ${Object.values(stats).join(' | ')}  P ${JSON.stringify(extras.P)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const list = [...CHARACTERS.map((c) => [c, false]), ...SURVIVORS.map((c) => [c, true])].filter(([c]) => !only.length || only.includes(c.id));
for (const [c, healthy] of list) {
  try { await build(c, healthy); } catch (e) { console.error(`${c.id}:失敗`, e.stack || e); process.exitCode = 1; }
}
