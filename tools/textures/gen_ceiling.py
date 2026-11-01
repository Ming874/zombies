# 礦纖天花板(不規則裂紋孔 fissured)PBR 貼圖產生器 — 原創,CC0
# 輸出 3×3 片(每片 0.667m,一張貼圖 = 2m),每片圖樣/色調不同;片與片之間是 T-bar(24mm,兩邊各半)。
# color.webp(sRGB)、normal.webp(OpenGL)、orm.webp(R=AO G=粗糙度 B=255)
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]
N = 1024          # 最終解析度
SS = 2            # 超取樣
M = N * SS
T = 3             # 每張 3×3 片
rng = np.random.default_rng(20031)

def tile_mask():
    # 每個像素:所在片的索引、離片邊的距離(像素,最終解析度)
    xs = (np.arange(N) + 0.5) / N * T
    fx = xs - np.floor(xs)
    ix = np.floor(xs).astype(int)
    d = np.minimum(fx, 1 - fx) * (N / T)  # 離最近片邊的像素距離
    return ix, d

# ---------------- 高度圖(超取樣畫,再縮小) ----------------
H = Image.new('L', (M, M), 200)
dr = ImageDraw.Draw(H)
tw = M / T
for tj in range(T):
    for ti in range(T):
        r = np.random.default_rng(1000 + tj * T + ti)
        x0, y0 = ti * tw, tj * tw
        # 裂紋(蠕蟲狀短折線):越多越像礦纖板
        n = int(r.integers(650, 900))
        for k in range(n):
            x = x0 + r.uniform(20, tw - 20); y = y0 + r.uniform(20, tw - 20)
            a = r.uniform(0, 2 * math.pi)
            L = r.uniform(4, 22) * SS
            seg = int(r.integers(2, 6))
            pts = [(x, y)]
            for s in range(seg):
                a += r.uniform(-1.1, 1.1)
                x += math.cos(a) * L / seg; y += math.sin(a) * L / seg
                pts.append((x, y))
            w = int(r.choice([2, 2, 2, 3, 3, 4]))
            dr.line(pts, fill=int(r.integers(60, 120)), width=w, joint='curve')
        # 針孔
        for k in range(int(r.integers(1600, 2400))):
            x = x0 + r.uniform(16, tw - 16); y = y0 + r.uniform(16, tw - 16)
            rad = r.uniform(0.9, 2.0)
            dr.ellipse([x - rad, y - rad, x + rad, y + rad], fill=int(r.integers(70, 130)))
H = H.filter(ImageFilter.GaussianBlur(0.8)).resize((N, N), Image.LANCZOS)
h = np.asarray(H).astype(np.float32) / 255.0

# 低頻起伏(每片不同)
def fbm(shape, base, oct, seed):
    r = np.random.default_rng(seed)
    acc = np.zeros(shape, np.float32); amp = 1.0; tot = 0
    for o in range(oct):
        g = base * (2 ** o)
        lat = r.random((g + 1, g + 1)).astype(np.float32)
        lat[-1, :] = lat[0, :]; lat[:, -1] = lat[:, 0]
        img = Image.fromarray((lat * 255).astype(np.uint8)).resize(shape[::-1], Image.BICUBIC)
        acc += amp * np.asarray(img).astype(np.float32) / 255.0
        tot += amp; amp *= 0.5
    return acc / tot
undul = fbm((N, N), 6, 4, 7)
h = h * 0.85 + (undul - 0.5) * 0.08

ixs, dx = tile_mask()
iy = ixs[:, None] * np.ones((1, N), int)
ix = np.ones((N, 1), int) * ixs[None, :]
dist = np.minimum(dx[None, :] * np.ones((N, 1)), dx[:, None] * np.ones((1, N)))  # 離片邊的距離(px)
px_per_m = N / 2.0
bar = 0.012 * px_per_m          # T-bar 半寬(12mm)
bevel = 0.018 * px_per_m        # 片緣斜角
grid = dist < bar
edge = (dist >= bar) & (dist < bar + bevel)
# 片面略低於 T-bar(tegular),斜角往邊緣下降
t = np.clip((dist - bar) / bevel, 0, 1)
hface = h * 0.55 + 0.25
hh = np.where(grid, 0.9, np.where(edge, 0.25 + t * (hface - 0.25), hface))

# ---------------- 顏色 ----------------
col = np.zeros((N, N, 3), np.float32)
base = np.array([0.885, 0.872, 0.835], np.float32)
var_tint = []
for k in range(T * T):
    r = np.random.default_rng(500 + k)
    kk = r.uniform(0.94, 1.03)
    yel = r.uniform(0.0, 0.05)
    var_tint.append(np.array([kk, kk * (1 - yel * 0.4), kk * (1 - yel)], np.float32))
tid = iy * T + ix
tint = np.stack([np.array(var_tint)[tid][..., c] for c in range(3)], -1)
face = base[None, None, :] * tint
cav = np.clip((h - 0.35) / 0.5, 0, 1)                # 裂紋/針孔 → 暗
face = face * (0.76 + 0.24 * cav[..., None])
face *= (0.97 + 0.06 * (undul[..., None] - 0.5))
# 灰塵:靠片邊與 T-bar 旁積灰
dust = np.clip(1 - (dist - bar) / (0.06 * px_per_m), 0, 1)[..., None] * 0.1
face *= 1 - dust
barc = np.array([0.80, 0.80, 0.78], np.float32)
col = np.where(grid[..., None], barc[None, None, :] * (0.95 + 0.05 * undul[..., None]), face)
col = np.where(edge[..., None], col * (0.82 + 0.18 * t[..., None]), col)
# 水漬全部由世界座標的歲月層畫(src/map/hospital/wear.js):成片出現在漏水處、形狀不規則、跨片延續;
# 貼圖裡烤死的圓形水漬每 2m 重複一次,一眼就看得出是同一個圖章 → 不畫

# ---------------- 法線 ----------------
gy, gx = np.gradient(hh * 6.0)
nz = np.ones_like(gx)
nrm = np.stack([-gx, gy, nz], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
# ---------------- ORM ----------------
ao = np.clip(0.55 + 0.45 * cav, 0, 1)
ao = np.where(grid, 1.0, np.where(edge, 0.7 + 0.3 * t, ao))
rough = np.where(grid, 0.42, 0.93 - 0.04 * cav)

os.makedirs(out, exist_ok=True)
Image.fromarray(np.clip(col ** (1 / 1.0) * 255, 0, 255).astype(np.uint8)).save(os.path.join(out, 'color.webp'), 'WEBP', quality=88, method=6)
Image.fromarray(((nrm * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(out, 'normal.webp'), 'WEBP', quality=90, method=6)
orm = np.stack([ao, rough, np.ones_like(ao)], -1)
Image.fromarray((orm * 255).astype(np.uint8)).save(os.path.join(out, 'orm.webp'), 'WEBP', quality=88, method=6)
avg = col[~grid].mean(0)
print('avg #%02x%02x%02x' % tuple(int(v * 255) for v in avg), 'sizes', [os.path.getsize(os.path.join(out, f)) // 1024 for f in ('color.webp', 'normal.webp', 'orm.webp')])
