// 寫出遊戲用的 GLB:每種材質一個 primitive(body / head / extra),頂點屬性量化 + EXT_meshopt_compression,貼圖 WebP。
// 骨架與體型參數放在 scene.extras.hz(GLTFLoader → gltf.scene.userData.hz)。頂點的 JOINTS_0 直接是遊戲 22 根骨骼的索引,
// 不附 glTF skin(執行期只取幾何,骨骼由 model.js instantiate 依 hz.bones 建立)。
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

export async function writeGLB(file, { name, prims, extras }) {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buf = doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const mesh = doc.createMesh(name);
  for (const p of prims) {
    const tex = (key, img) => doc.createTexture(`${p.name}_${key}`).setImage(img).setMimeType('image/webp').setURI(`${p.name}_${key}.webp`);
    const mat = doc.createMaterial(p.name).setMetallicFactor(0).setRoughnessFactor(p.roughness ?? 0.8)
      .setBaseColorTexture(tex('color', p.color)).setNormalTexture(tex('normal', p.normal));
    if (p.alpha) mat.setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true);
    mesh.addPrimitive(doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', p.pos))
      .setAttribute('NORMAL', acc('VEC3', p.nor))
      .setAttribute('TEXCOORD_0', acc('VEC2', p.uv))
      .setAttribute('COLOR_0', acc('VEC4', p.col))
      .setAttribute('JOINTS_0', acc('VEC4', p.joints))
      .setAttribute('WEIGHTS_0', acc('VEC4', p.weights))
      .setIndices(acc('SCALAR', p.index))
      .setMaterial(mat));
  }
  const scene = doc.createScene(name).setExtras({ hz: extras });
  scene.addChild(doc.createNode(name).setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);
  await MeshoptEncoder.ready;
  await doc.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  return bytes;
}
