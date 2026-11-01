import * as THREE from 'three';

// 槍口火光(畫在手持武器場景):正面星芒 + 沿槍管方向的十字火舌 + 依槍種的側向噴焰
// style:'pistol' | 'revolver'(彈巢間隙側噴)| 'shotgun'(大團火球)| 'rifle'(AK 斜切制退器往右上)| 'carbine'(M4 鳥籠三叉星)| 'brake'(巴雷特雙室制退器左右大噴焰)

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let rs = 77;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

// 星芒:n 道尖角 + 放射狀細紋
function starTex(n, inner) {
  const S = 128, [c, x] = canvas(S, S);
  x.translate(S / 2, S / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  g.addColorStop(0, 'rgba(255,252,235,1)');
  g.addColorStop(0.18, 'rgba(255,215,130,0.95)');
  g.addColorStop(0.5, 'rgba(255,140,40,0.55)');
  g.addColorStop(1, 'rgba(255,90,10,0)');
  x.fillStyle = g;
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + (rnd() - 0.5) * 0.15, r = i % 2 ? S * inner * (0.8 + rnd() * 0.4) : S * (0.36 + rnd() * 0.14);
    x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fill();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) { // 細放射紋
    const a = rnd() * Math.PI * 2, l = S * (0.12 + rnd() * 0.3);
    x.strokeStyle = `rgba(255,${180 + rnd() * 60},${80 + rnd() * 60},${0.15 + rnd() * 0.25})`;
    x.lineWidth = 0.6 + rnd();
    x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * l, Math.sin(a) * l); x.stroke();
  }
  const core = x.createRadialGradient(0, 0, 0, 0, 0, S * 0.14);
  core.addColorStop(0, 'rgba(255,255,250,1)');
  core.addColorStop(1, 'rgba(255,240,200,0)');
  x.fillStyle = core;
  x.fillRect(-S / 2, -S / 2, S, S);
  return toTex(c);
}

// 火舌:底部寬亮、往前收尖,帶縱向亂流紋(貼圖 v=0 在槍口)
function flameTex() {
  const W = 64, H = 256, [c, x] = canvas(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const noise = new Float32Array(W * 16);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd();
  for (let y = 0; y < H; y++) {
    const v = 1 - y / H; // 0 = 槍口(畫布底部 = 貼圖 v=0)
    const width = (1 - v) ** 0.8 * 0.48 * (1 - Math.exp(-v * 14)) + 0.06 * (1 - v);
    for (let px = 0; px < W; px++) {
      const u = Math.abs(px / W - 0.5);
      const nz = noise[((px >> 2) + ((y >> 4) % 16) * W) % noise.length];
      const edge = 1 - Math.min(1, u / Math.max(0.01, width * (0.8 + nz * 0.4)));
      let a = Math.max(0, edge) ** 1.4 * (1 - v) ** 1.6;
      a *= 0.75 + nz * 0.5;
      const hot = Math.max(0, 1 - v * 2.2) * Math.max(0, edge);
      const i = (y * W + px) * 4;
      d[i] = 255;
      d[i + 1] = Math.min(255, 120 + 120 * hot + 40 * edge);
      d[i + 2] = Math.min(255, 30 + 200 * hot * hot);
      d[i + 3] = Math.min(255, a * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return toTex(c);
}

let TEX = null;
function textures() {
  if (!TEX) TEX = { star4: starTex(4, 0.1), star6: starTex(6, 0.13), star3: starTex(3, 0.08), star8: starTex(8, 0.16), flame: flameTex() };
  return TEX;
}

const STYLE = {
  // star:正面星芒大小;len:火舌長度;w:火舌寬;side:側噴 [x, y, z(相對槍口,往後為正), 長, 寬, 方向 x, 方向 y]
  pistol: { star: 0.085, tex: 'star4', len: 0.09, w: 0.05, hdr: 2.4 },
  revolver: { star: 0.11, tex: 'star6', len: 0.14, w: 0.07, hdr: 2.8, side: [[0, 0, 0.157, 0.06, 0.035, 1, 0.25], [0, 0, 0.157, 0.06, 0.035, -1, 0.25]] },
  shotgun: { star: 0.2, tex: 'star8', len: 0.3, w: 0.16, hdr: 3.2 },
  rifle: { star: 0.13, tex: 'star4', len: 0.24, w: 0.09, hdr: 3, side: [[0.004, 0.008, 0.01, 0.09, 0.045, 0.55, 1]] },
  carbine: { star: 0.1, tex: 'star3', len: 0.16, w: 0.06, hdr: 2.8 },
  brake: { star: 0.2, tex: 'star6', len: 0.34, w: 0.14, hdr: 3.6, side: [[0, 0, 0.06, 0.34, 0.15, 1, 0.05], [0, 0, 0.06, 0.34, 0.15, -1, 0.05], [0, 0, 0.03, 0.22, 0.11, 1, -0.05], [0, 0, 0.03, 0.22, 0.11, -1, -0.05]] },
};

export class MuzzleFlash {
  constructor(style, info) {
    const T = textures();
    this.S = STYLE[style] || STYLE.pistol;
    this.group = new THREE.Group();
    this.t = 0;
    this.life = style === 'brake' ? 0.075 : style === 'shotgun' ? 0.065 : 0.05;
    const add = (map) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(this.S.hdr, this.S.hdr * 0.92, this.S.hdr * 0.8), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true });
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: T[this.S.tex], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(this.S.hdr, this.S.hdr * 0.95, this.S.hdr * 0.85) }));
    this.group.add(this.star);
    // 十字火舌(兩片互相垂直、沿 -Z 延伸)
    const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    plane.rotateX(-Math.PI / 2); // 平放在 XZ、往 -Z 延伸
    this.flameMat = add(T.flame);
    this.flames = [0, 1].map((i) => {
      const f = new THREE.Mesh(plane, this.flameMat);
      f.rotation.z = i * Math.PI / 2;
      this.group.add(f);
      return f;
    });
    // 側噴:平放、沿自身 -Z 延伸,再轉到指定方向
    this.sides = (this.S.side || []).map(([x, y, z, len, w, dx, dy]) => {
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      holder.rotation.set(0, dx > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      holder.rotateX(dy * 0.9);
      const a = new THREE.Mesh(plane, this.flameMat), b = new THREE.Mesh(plane, this.flameMat);
      b.rotation.z = Math.PI / 2;
      holder.add(a, b);
      holder.userData = { len, w };
      this.group.add(holder);
      return holder;
    });
    this.group.visible = false;
  }

  fire() {
    this.t = this.life;
    const S = this.S, j = 0.75 + Math.random() * 0.5;
    this.star.material.rotation = Math.random() * Math.PI * 2;
    this.star.scale.setScalar(S.star * j);
    for (const f of this.flames) f.scale.set(S.w * (0.8 + Math.random() * 0.4), 1, S.len * (0.7 + Math.random() * 0.6));
    this.flames[0].rotation.z = Math.random() * 0.6;
    this.flames[1].rotation.z = Math.PI / 2 + Math.random() * 0.6;
    for (const s of this.sides) {
      const { len, w } = s.userData;
      for (const c of s.children) c.scale.set(w * (0.8 + Math.random() * 0.4), 1, len * (0.7 + Math.random() * 0.6));
    }
  }

  update(dt, hidden) {
    if (this.t > 0) this.t -= dt;
    const on = this.t > 0 && !hidden;
    this.group.visible = on;
    if (on) {
      const k = Math.max(0, this.t / this.life);
      const o = 0.35 + 0.65 * k;
      this.star.material.opacity = o;
      this.flameMat.opacity = o;
    }
  }
}
