# 方磁磚(15cm 級釉面白磚,舊)PBR 貼圖產生器 — 原創,CC0。取代 ambientCG Tiles133C(每片中間一團發亮的白、邊緣一圈髒,
# 打手電筒時整面像燈箱;缺角是黑色三角形,一眼就看出重複)。
# 輸出 12×12 片(一張貼圖 = 1.5m,一片 12.5cm);片的邊界 = 格線中心 → 材質用 tv: 12(每片隨機換一片 + 旋轉)就不會重複。
#  color.webp 1024(sRGB):釉面幾乎均勻(每片 ±2% 明暗、微色差),格線灰褐、靠格線一圈薄髒污,少數片有細龜裂/裂縫/缺角(露出米灰色坯體,不是黑色)
#  normal.webp 512(OpenGL):每片些微傾斜(貼得不平 → 反光一片一片不同)、釉面微波、圓角邊、格線凹下、裂縫
#  orm.webp 512:R = AO(格線凹處)、G = 粗糙度(釉 0.1~0.25 帶斑駁油膜;格線 0.92;坯體 0.85)、B = 255
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
N = 1024
T = 12
P = N / T                      # 一片幾像素(85.3)
PXMM = N / 1500.0              # 像素/mm(0.683)
rng = np.random.default_rng(2003)

def fbm(shape, base, oct, seed, gain=0.5):
    r = np.random.default_rng(seed)
    acc = np.zeros(shape, np.float32); amp = 1.0; tot = 0
    for o in range(oct):
        g = base * (2 ** o)
        lat = r.random((g + 1, g + 1)).astype(np.float32)
        lat[-1, :] = lat[0, :]; lat[:, -1] = lat[:, 0]
        img = Image.fromarray((lat * 255).astype(np.uint8)).resize(shape[::-1], Image.BICUBIC)
        acc += amp * np.asarray(img).astype(np.float32) / 255.0
        tot += amp; amp *= gain
    return acc / tot

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5
gx, gy = xx / P, yy / P
ix, iy = np.floor(gx).astype(int) % T, np.floor(gy).astype(int) % T
fx, fy = gx - np.floor(gx), gy - np.floor(gy)
# 到片邊的距離(像素):片的邊界在格子邊界上,格線寬 GW 以邊界為中心
dx = np.minimum(fx, 1 - fx) * P
dy = np.minimum(fy, 1 - fy) * P
d = np.minimum(dx, dy)
GW = 1.9 * PXMM                # 格線半寬 ≈ 1.9mm(全寬 3.8mm;太寬遠看會變成一張黑色方格紙)
EDGE = 3.2 * PXMM              # 圓角邊寬
grout = d < GW
face_d = np.clip(d - GW, 0, None)
tid = iy * T + ix

# ---------------- 每片的參數 ----------------
NT = T * T
bright = 1 + rng.normal(0, 0.018, NT)
hue = rng.normal(0, 0.008, (NT, 3))
tiltx = rng.normal(0, 0.0035, NT); tilty = rng.normal(0, 0.0035, NT)  # 高度/像素
bow = rng.normal(0, 0.12, NT)        # 片中間略凸/凹
craze_t = rng.random(NT) < 0.16      # 釉面細龜裂
crack_t = set(rng.choice(NT, 5, replace=False).tolist())
chip_t = set(rng.choice([k for k in range(NT) if k not in crack_t], 4, replace=False).tolist())

# ---------------- 高度(mm) ----------------
h = np.zeros((N, N), np.float32)
cx, cy = fx - 0.5, fy - 0.5
h += (tiltx[tid] * (cx * P) + tilty[tid] * (cy * P))
h += bow[tid] * (1 - (cx * cx + cy * cy) * 4) * 0.25
wav = fbm((N, N), 24, 3, 11)
h += (wav - 0.5) * 0.05                                   # 釉面微波
t = np.clip(face_d / EDGE, 0, 1)
h -= (1 - np.sin(t * math.pi / 2)) * 0.9                  # 圓角
gn = fbm((N, N), 160, 2, 12)
h = np.where(grout, -1.5 + (gn - 0.5) * 0.35, h)          # 格線凹下(砂質)

# 細龜裂(Voronoi 邊界)
craze = np.zeros((N, N), np.float32)
cr_img = Image.new('L', (N, N), 0); cd = ImageDraw.Draw(cr_img)
for k in range(NT):
    if not craze_t[k]: continue
    tx0, ty0 = (k % T) * P, (k // T) * P
    r = np.random.default_rng(300 + k)
    pts = r.random((14, 2)) * P
    # 近似 Voronoi:每個點連到最近的 2 個點的中垂線段 → 用隨機短折線代替(看起來像釉裂網)
    for a in range(len(pts)):
        x, y = tx0 + pts[a][0], ty0 + pts[a][1]
        ang = r.uniform(0, 2 * math.pi)
        for s in range(3):
            L = r.uniform(6, 18)
            x2, y2 = x + math.cos(ang) * L, y + math.sin(ang) * L
            x2 = min(max(x2, tx0 + GW + 2), tx0 + P - GW - 2); y2 = min(max(y2, ty0 + GW + 2), ty0 + P - GW - 2)
            cd.line([(x, y), (x2, y2)], fill=int(r.uniform(90, 170)), width=1)
            x, y = x2, y2; ang += r.uniform(-1.2, 1.2)
craze = np.asarray(cr_img.filter(ImageFilter.GaussianBlur(0.35))).astype(np.float32) / 255.0
craze *= ~grout

# 裂縫(穿過整片的一條,有時分岔)
crack = np.zeros((N, N), np.float32)
ck_img = Image.new('L', (N, N), 0); kd = ImageDraw.Draw(ck_img)
for k in crack_t:
    tx0, ty0 = (k % T) * P, (k // T) * P
    r = np.random.default_rng(700 + k)
    side = r.integers(0, 4)
    x, y = (tx0 + r.uniform(0.15, 0.85) * P, ty0 + GW) if side == 0 else (tx0 + GW, ty0 + r.uniform(0.15, 0.85) * P)
    ang = math.pi / 2 if side == 0 else 0
    ang += r.uniform(-0.6, 0.6)
    pts = [(x, y)]
    for s in range(14):
        ang += r.uniform(-0.45, 0.45)
        x += math.cos(ang) * P / 11; y += math.sin(ang) * P / 11
        if not (tx0 + GW < x < tx0 + P - GW and ty0 + GW < y < ty0 + P - GW): break
        pts.append((x, y))
    kd.line(pts, fill=255, width=1)
    if len(pts) > 6 and r.random() < 0.6:
        bx, by = pts[len(pts) // 2]; ang2 = ang + r.choice([-1, 1]) * r.uniform(0.6, 1.1)
        p2 = [(bx, by)]
        for s in range(5):
            ang2 += r.uniform(-0.4, 0.4); bx += math.cos(ang2) * P / 12; by += math.sin(ang2) * P / 12
            if not (tx0 + GW < bx < tx0 + P - GW and ty0 + GW < by < ty0 + P - GW): break
            p2.append((bx, by))
        kd.line(p2, fill=200, width=1)
crack = np.asarray(ck_img.filter(ImageFilter.GaussianBlur(0.45))).astype(np.float32) / 255.0
crack *= ~grout
h -= crack * 0.5 + craze * 0.08

# 缺角(片角被撞掉一塊:不規則多邊形,露出坯體,低 0.6mm)
chip = np.zeros((N, N), np.float32)
cp_img = Image.new('L', (N, N), 0); pd = ImageDraw.Draw(cp_img)
for k in chip_t:
    tx0, ty0 = (k % T) * P, (k // T) * P
    r = np.random.default_rng(900 + k)
    corner = r.integers(0, 4); sx = 1 if corner in (0, 3) else -1; sy = 1 if corner in (0, 1) else -1
    ox = tx0 + (GW if sx > 0 else P - GW); oy = ty0 + (GW if sy > 0 else P - GW)
    a, b = r.uniform(6, 16), r.uniform(6, 16)
    poly = [(ox, oy), (ox + sx * a, oy)]
    for s in range(4):
        u = (s + 1) / 5
        poly.append((ox + sx * a * (1 - u) + sx * r.uniform(-1.5, 2.5), oy + sy * b * u + sy * r.uniform(-1.5, 2.5)))
    poly.append((ox, oy + sy * b))
    pd.polygon(poly, fill=255)
chip = np.asarray(cp_img.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32) / 255.0
h = h * (1 - chip) + chip * (-0.7 + (gn - 0.5) * 0.3)

# ---------------- 顏色(線性) ----------------
glaze = np.array([0.80, 0.815, 0.80], np.float32)
mott = fbm((N, N), 16, 4, 21)
film = fbm((N, N), 6, 4, 22)                               # 油膜/灰塵膜(大塊)
col = glaze[None, None, :] * bright[tid][..., None] * (1 + hue[tid])
col *= (0.985 + 0.03 * mott[..., None])
# 靠格線一圈薄髒(擦不到的地方),不是一整圈發黑
rim = np.exp(-face_d / (2.6 * PXMM))[..., None]
dirt = np.array([0.62, 0.58, 0.5], np.float32)
col = col * (1 - rim * 0.18 * (0.5 + film[..., None])) + dirt * rim * 0.18 * (0.5 + film[..., None]) * 0.6
col *= 1 - 0.07 * np.clip(film[..., None] - 0.45, 0, 1)
# 每片髒的程度不同(擦得到/擦不到、換過的磚):少數片蒙一層黃灰
dk = (rng.beta(1.2, 6.0, NT) * 0.35)[tid][..., None] * (0.6 + 0.8 * film[..., None])
col = col * (1 - dk) + np.array([0.5, 0.46, 0.38], np.float32) * dk * 0.8
col *= 1 - craze[..., None] * 0.22
col *= 1 - crack[..., None] * 0.55
groutc = np.array([0.32, 0.3, 0.27], np.float32) * (0.8 + 0.45 * gn[..., None]) * (0.85 + 0.3 * film[..., None])
col = np.where(grout[..., None], groutc, col)
bisc = np.array([0.56, 0.53, 0.49], np.float32) * (0.85 + 0.25 * gn[..., None])
col = col * (1 - chip[..., None]) + bisc * chip[..., None]
col = np.clip(col, 0, 1)
srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(col, 1 / 2.4) - 0.055)

# ---------------- 法線(512) ----------------
h512 = np.asarray(Image.fromarray(h).resize((512, 512), Image.BOX)).astype(np.float32)
mm_per_px = 1500.0 / 512
gyh, gxh = np.gradient(h512)
k = 1.6 / mm_per_px                                         # 誇張一點(遠看才看得出來)
# 可平鋪:np.gradient 邊界是單邊差分;用捲動差分
gxh = (np.roll(h512, -1, 1) - np.roll(h512, 1, 1)) * 0.5
gyh = (np.roll(h512, -1, 0) - np.roll(h512, 1, 0)) * 0.5
nrm = np.stack([-gxh * k, gyh * k, np.ones_like(gxh)], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

# ---------------- ORM(512) ----------------
def down(a): return np.asarray(Image.fromarray(a.astype(np.float32)).resize((512, 512), Image.BOX)).astype(np.float32)
g512 = down(grout.astype(np.float32)); ch512 = down(chip); ck512 = down(np.maximum(crack, craze * 0.5)); rim512 = down(rim[..., 0]); film512 = down(film); mott512 = down(mott)
rough = 0.11 + 0.1 * film512 + 0.05 * mott512 + 0.12 * rim512
rough = rough * (1 - ck512) + 0.6 * ck512
rough = rough * (1 - ch512) + 0.85 * ch512
rough = rough * (1 - g512) + 0.92 * g512
ao = 1 - g512 * 0.25 - rim512 * 0.06 - ch512 * 0.12

os.makedirs(out, exist_ok=True)
Image.fromarray(np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(out, 'color.webp'), 'WEBP', quality=88, method=6)
Image.fromarray(np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(out, 'color_s.webp'), 'WEBP', quality=88, method=6)
Image.fromarray(np.clip((nrm * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(out, 'normal.webp'), 'WEBP', quality=92, method=6)
orm = np.stack([np.clip(ao, 0, 1), np.clip(rough, 0, 1), np.ones_like(ao)], -1)
Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, 'orm.webp'), 'WEBP', quality=90, method=6)
avg = srgb.reshape(-1, 3).mean(0)
lin = col.reshape(-1, 3).mean(0)
print('avg #%02x%02x%02x' % tuple(int(v * 255 + 0.5) for v in avg), 'lin', lin.round(3), 'sizes', [os.path.getsize(os.path.join(out, f)) // 1024 for f in ('color.webp', 'color_s.webp', 'normal.webp', 'orm.webp')])
