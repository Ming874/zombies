import * as THREE from 'three';

// 把含 three.js 物件的資料結構轉成可 postMessage 的純資料(TypedArray 保留,之後可零複製傳輸),
// 主執行緒再還原。支援 Vector2/3/4、Quaternion、Color、Matrix4、Euler、Box3、Sphere、BufferGeometry;函式會被丟掉。
// 注意:同一物件被引用多次時,還原後會變成各自獨立的副本。

export function pack(v, depth = 0) {
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (depth > 12) return undefined;
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
  if (v.isVector3) return { __t: 'v3', d: [v.x, v.y, v.z] };
  if (v.isVector2) return { __t: 'v2', d: [v.x, v.y] };
  if (v.isVector4) return { __t: 'v4', d: [v.x, v.y, v.z, v.w] };
  if (v.isQuaternion) return { __t: 'q', d: [v.x, v.y, v.z, v.w] };
  if (v.isColor) return { __t: 'c', d: [v.r, v.g, v.b] };
  if (v.isEuler) return { __t: 'e', d: [v.x, v.y, v.z], o: v.order };
  if (v.isMatrix4) return { __t: 'm4', d: v.elements.slice() };
  if (v.isBox3) return { __t: 'b3', d: [...v.min.toArray(), ...v.max.toArray()] };
  if (v.isSphere) return { __t: 'sp', d: [...v.center.toArray(), v.radius] };
  if (v.isBufferGeometry) return packGeometry(v);
  if (Array.isArray(v)) return v.map((x) => pack(x, depth + 1));
  if (v instanceof Map) return { __t: 'map', d: [...v].map(([k, x]) => [k, pack(x, depth + 1)]) };
  if (v instanceof Set) return { __t: 'set', d: [...v].map((x) => pack(x, depth + 1)) };
  const o = {};
  for (const k in v) { const x = pack(v[k], depth + 1); if (x !== undefined) o[k] = x; }
  return o;
}

function packGeometry(g) {
  const attrs = {};
  for (const [name, a] of Object.entries(g.attributes)) {
    if (a.isInterleavedBufferAttribute) { const c = a.clone(); attrs[name] = { a: c.array, s: c.itemSize, n: c.normalized }; continue; }
    attrs[name] = { a: a.array, s: a.itemSize, n: a.normalized };
  }
  const bs = g.boundingSphere, bb = g.boundingBox;
  return {
    __t: 'geo', attrs, index: g.index ? g.index.array : null, groups: g.groups.map((x) => ({ ...x })),
    bs: bs ? [...bs.center.toArray(), bs.radius] : null, bb: bb ? [...bb.min.toArray(), ...bb.max.toArray()] : null,
  };
}

export function unpack(v) {
  if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return v;
  if (Array.isArray(v)) return v.map(unpack);
  if (typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) return v;
  const d = v.d;
  switch (v.__t) {
    case 'v3': return new THREE.Vector3(d[0], d[1], d[2]);
    case 'v2': return new THREE.Vector2(d[0], d[1]);
    case 'v4': return new THREE.Vector4(d[0], d[1], d[2], d[3]);
    case 'q': return new THREE.Quaternion(d[0], d[1], d[2], d[3]);
    case 'c': return new THREE.Color(d[0], d[1], d[2]);
    case 'e': return new THREE.Euler(d[0], d[1], d[2], v.o);
    case 'm4': return new THREE.Matrix4().fromArray(d);
    case 'b3': return new THREE.Box3(new THREE.Vector3(d[0], d[1], d[2]), new THREE.Vector3(d[3], d[4], d[5]));
    case 'sp': return new THREE.Sphere(new THREE.Vector3(d[0], d[1], d[2]), d[3]);
    case 'map': return new Map(d.map(([k, x]) => [k, unpack(x)]));
    case 'set': return new Set(d.map(unpack));
    case 'geo': {
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(v.attrs)) g.setAttribute(name, new THREE.BufferAttribute(a.a, a.s, a.n));
      if (v.index) g.setIndex(new THREE.BufferAttribute(v.index, 1));
      for (const x of v.groups) g.addGroup(x.start, x.count, x.materialIndex);
      if (v.bs) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(v.bs[0], v.bs[1], v.bs[2]), v.bs[3]);
      if (v.bb) g.boundingBox = new THREE.Box3(new THREE.Vector3(v.bb[0], v.bb[1], v.bb[2]), new THREE.Vector3(v.bb[3], v.bb[4], v.bb[5]));
      return g;
    }
    default: {
      const o = {};
      for (const k in v) o[k] = unpack(v[k]);
      return o;
    }
  }
}
