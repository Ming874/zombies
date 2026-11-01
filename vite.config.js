export default {
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1500 },
  // 模組 Worker(殭屍建模、貼圖繪製:new Worker(url, { type: 'module' }))
  worker: { format: 'es' },
};
