// TGA 解碼(Rocketbox 的貼圖:24/32 位元,未壓縮或 RLE)→ { width, height, data: RGBA Uint8Array,第一列在上 }
export function readTGA(buf) {
  const idLen = buf[0], cmapType = buf[1], type = buf[2];
  const cmapLen = buf[5] | (buf[6] << 8), cmapDepth = buf[7];
  const width = buf[12] | (buf[13] << 8), height = buf[14] | (buf[15] << 8);
  const bpp = buf[16], desc = buf[17];
  if (type !== 2 && type !== 10) throw new Error(`TGA:不支援的類型 ${type}`);
  if (bpp !== 24 && bpp !== 32) throw new Error(`TGA:不支援的位元深度 ${bpp}`);
  const Bp = bpp >> 3, topDown = (desc & 0x20) !== 0;
  let p = 18 + idLen + (cmapType ? cmapLen * Math.ceil(cmapDepth / 8) : 0);
  const n = width * height, src = new Uint8Array(n * Bp);
  if (type === 2) src.set(buf.subarray(p, p + n * Bp));
  else {
    let o = 0;
    while (o < src.length) {
      const h = buf[p++], cnt = (h & 0x7f) + 1;
      if (h & 0x80) { for (let k = 0; k < cnt; k++) for (let c = 0; c < Bp; c++) src[o++] = buf[p + c]; p += Bp; }
      else { const len = cnt * Bp; src.set(buf.subarray(p, p + len), o); o += len; p += len; }
    }
  }
  const data = new Uint8Array(n * 4);
  for (let y = 0; y < height; y++) {
    const sy = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const s = (sy * width + x) * Bp, d = (y * width + x) * 4;
      data[d] = src[s + 2]; data[d + 1] = src[s + 1]; data[d + 2] = src[s]; data[d + 3] = Bp === 4 ? src[s + 3] : 255;
    }
  }
  return { width, height, data };
}
