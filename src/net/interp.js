// 插值緩衝:固定大小的環形陣列(時間 Float64、欄位 Float32),推入與取樣都不配置記憶體。
// 遠端玩家與代理殭屍都以「伺服器時間 − 延遲」取樣,讓移動平滑;angles 欄位走最短角度,steps 欄位取較早那筆(不內插)。
const TAU = Math.PI * 2;

export class Interp {
  constructor(k, n = 32, angles = [], steps = []) {
    this.k = k;
    this.n = n;
    this.t = new Float64Array(n);
    this.v = new Float32Array(n * k);
    this.ang = new Uint8Array(k);
    this.step = new Uint8Array(k);
    for (const i of angles) this.ang[i] = 1;
    for (const i of steps) this.step[i] = 1;
    this.count = 0;
    this.head = 0; // 下一個寫入位置
    this.over = 0; // 取樣時間超出最新一筆多久(秒)
    this.a = -1; // 取樣用到的較早那筆索引
  }
  clear() { this.count = 0; this.head = 0; }
  get newest() { return this.count ? (this.head - 1 + this.n) % this.n : -1; }
  get latestTime() { return this.count ? this.t[this.newest] : -Infinity; }
  // 推入一筆;回傳欄位起點(呼叫者寫入 this.v[base + i]),時間倒退的資料忽略(回傳 -1)
  push(t) {
    if (this.count && t <= this.t[this.newest]) return -1;
    const i = this.head;
    this.t[i] = t;
    this.head = (i + 1) % this.n;
    if (this.count < this.n) this.count++;
    return i * this.k;
  }
  // 中斷很久之後的新資料:先補一筆「停在原地」的樣本,避免從很久以前慢慢滑過來
  pushAfterGap(t, gap) {
    if (this.count && t - this.t[this.newest] > gap) {
      const src = this.newest * this.k, base = this.push(t - gap * 0.5);
      if (base >= 0) for (let j = 0; j < this.k; j++) this.v[base + j] = this.v[src + j];
    }
    return this.push(t);
  }
  value(i, j) { return this.v[i * this.k + j]; }
  // 取樣到 out(長度 k);回傳 0 = 內插、1 = 超出最新(停在最新)、2 = 早於最舊、-1 = 沒資料
  sample(t, out) {
    const c = this.count;
    if (!c) return -1;
    const N = this.n, k = this.k, T = this.t, V = this.v;
    const newest = (this.head - 1 + N) % N, oldest = (this.head - c + N) % N;
    if (t >= T[newest]) {
      this.over = (t - T[newest]) / 1000;
      this.a = newest;
      for (let j = 0; j < k; j++) out[j] = V[newest * k + j];
      return 1;
    }
    this.over = 0;
    if (t <= T[oldest]) {
      this.a = oldest;
      for (let j = 0; j < k; j++) out[j] = V[oldest * k + j];
      return 2;
    }
    // 從新往舊找第一筆 <= t
    let b = newest, a = (newest - 1 + N) % N;
    for (let s = 1; s < c; s++) {
      if (T[a] <= t) break;
      b = a;
      a = (a - 1 + N) % N;
    }
    this.a = a;
    const f = (t - T[a]) / Math.max(1e-6, T[b] - T[a]);
    for (let j = 0; j < k; j++) {
      const va = V[a * k + j], vb = V[b * k + j];
      if (this.step[j]) out[j] = va;
      else if (this.ang[j]) { let d = (vb - va) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; out[j] = va + d * f; }
      else out[j] = va + (vb - va) * f;
    }
    return 0;
  }
}
