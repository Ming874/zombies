import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// 跨來源隔離(SharedArrayBuffer 需要);正式環境由 server/index.js 送出同樣的標頭
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
// 開發時把連線請求轉到本機的多人伺服器(node server/index.js,預設 8787)
const NET = process.env.NET_SERVER || 'localhost:8787';
const proxy = {
  '/ws': { target: `ws://${NET}`, ws: true, changeOrigin: true },
  '/api': { target: `http://${NET}`, changeOrigin: true },
};

// ---- Rapier:rapier3d-compat 把 3MB 的 WASM 以 base64 內嵌在 JS(變成 4.3MB、壓縮率差、要在 JS 解碼)。
// 正式版改成獨立的雜湊 .wasm 檔(br 約 0.9MB),以 instantiateStreaming 邊下載邊編譯(瀏覽器還會快取編譯結果);
// 物理 Worker 與主執行緒備援共用同一個 .wasm(HTTP 快取),不會下載兩次。找不到內嵌字串時保持原樣(仍可運作)。
function rapierWasm() {
  return {
    name: 'hz-rapier-wasm',
    apply: 'build',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id.split('?')[0])) return null;
      const m = /(\w+)\.toByteArray\("(AGFzbQ[A-Za-z0-9+/=]+)"\)(\.buffer)?/.exec(code);
      if (!m) { this.warn('rapier:找不到內嵌的 WASM,維持 base64 版本'); return null; }
      const ref = this.emitFile({ type: 'asset', name: 'rapier.wasm', source: Buffer.from(m[2], 'base64') });
      // module_or_path 可以是 Promise<Response>(glue 會 await 再 instantiateStreaming)
      const expr = `fetch(import.meta.ROLLUP_FILE_URL_${ref})`;
      return { code: code.slice(0, m.index) + expr + code.slice(m.index + m[0].length), map: null };
    },
  };
}

// ---- Service Worker 版本清單:每次 build 把「這一版的檔案 → 內容雜湊」寫進 dist/sw.js 開頭。
// sw.js 內容因此每版都不同(瀏覽器一定會偵測到更新);SW 依清單判斷快取是否仍有效(同網址內容變了也會換新)。
function swManifest() {
  let outDir = 'dist';
  const hash = (buf) => crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 16);
  return {
    name: 'hz-sw-manifest',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    writeBundle: {
      order: 'post',
      handler() {
        const swPath = path.join(outDir, 'sw.js');
        if (!fs.existsSync(swPath)) return;
        const files = {};
        const walk = (dir) => {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const f = path.join(dir, e.name);
            if (e.isDirectory()) { walk(f); continue; }
            const rel = path.relative(outDir, f).split(path.sep).join('/');
            if (rel === 'sw.js' || rel.endsWith('.map') || rel.endsWith('.md') || rel === 'index.html') continue;
            files[rel] = rel.startsWith('assets/') ? 1 : hash(fs.readFileSync(f)); // assets/ 檔名本身就有雜湊
          }
        };
        walk(outDir);
        const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
        const entry = (/<script[^>]+type="module"[^>]+src="\/?([^"]+)"/.exec(html) || [])[1] || '';
        const crit = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)].map((x) => x[1]);
        // 關鍵檔(安裝時先放進快取):入口與其 CSS、Worker、WASM
        for (const k of Object.keys(files)) if (/^assets\/.*(?:worker|rapier|texworker).*\.(?:js|wasm)$/.test(k)) crit.push(k);
        const build = hash(Buffer.from(JSON.stringify(files) + html));
        const head = `self.__HZ = ${JSON.stringify({ build, entry, html: hash(Buffer.from(html)), crit: [...new Set(crit)], files })};\n`;
        fs.writeFileSync(swPath, head + fs.readFileSync(swPath, 'utf8'));
      },
    },
  };
}

export default {
  server: { port: 5173, headers: isolation, proxy },
  preview: { headers: isolation, proxy },
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [rapierWasm(), swManifest()],
  // 模組 Worker(new Worker(url, { type: 'module' })),Worker 內可動態 import / code splitting;Worker 打包另外套用 rapierWasm
  worker: { format: 'es', plugins: () => [rapierWasm()] },
};
