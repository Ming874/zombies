// 顯示卡提示:偵測到內建顯示晶片或軟體算圖(CPU 算圖)時,在主選單提醒玩家改用獨立顯卡 / 開啟硬體加速。
// 雙顯卡筆電上 Windows 預設讓瀏覽器用省電的內顯(和 CPU 共用功耗與散熱),遊戲會明顯卡頓。可關閉,「不再提示」會記住。
const KEY = 'hz.gpuHint.v1';
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const INTEGRATED = /radeon\(tm\)( \d{3}m)? graphics|radeon \d{3}m|vega \d|intel|uhd|iris|mali|adreno/i;

// 瀏覽器把顯示卡名稱藏起來了(Brave 嚴格防指紋回傳 "brave"、有些回傳 "WebKit WebGL" 或空字串)
const KNOWN = /angle|nvidia|geforce|quadro|radeon|amd|intel|apple|mali|adreno|powervr|qualcomm|swiftshader|llvmpipe|softpipe|mesa|software|basic render/i;
export const gpuMasked = (gpu = '') => !KNOWN.test(gpu);

export function gpuKind(gpu = '') {
  if (/^webgpu /.test(gpu)) return null; // 只知道廠商與架構(AMD 內顯 / 獨顯分不出來),不提示
  if (SOFTWARE.test(gpu)) return 'software';
  if (INTEGRATED.test(gpu)) return 'integrated';
  return null;
}

// F3 面板用的簡短顯示卡名稱:ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x..) Direct3D11 ...) → NVIDIA GeForce RTX 4060 Laptop GPU
export function gpuLabel(gpu = '') {
  const w = /^webgpu (\S+)\s*(.*)$/.exec(gpu);
  if (w) return `${w[1].toUpperCase()}${w[2] ? '(' + w[2] + ')' : ''} · 名稱被瀏覽器隱藏,由 WebGPU 判斷`;
  if (gpuMasked(gpu)) return `被瀏覽器隱藏(${gpu.trim().slice(0, 16) || '空白'});brave://gpu 或 chrome://gpu 可查`;
  const m = /angle \([^,]+,\s*(.+?)(?:\s*\(0x[0-9a-f]+\)|\s+direct3d|\s+opengl|\s+metal|,\s*[^,]*$)/i.exec(gpu);
  return (m ? m[1] : gpu).trim().slice(0, 60) || '未知';
}

// 名稱被隱藏時改問 WebGPU 的 adapter(vendor / architecture,例如 nvidia / lovelace);拿到就更新偵測結果(F3 面板會跟著顯示)
export async function probeMaskedGpu(game) {
  const d = game.quality?.detected;
  if (!d || !gpuMasked(d.gpu) || !navigator.gpu) return;
  try {
    const i = (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }))?.info;
    if (i?.vendor) { d.gpuMasked = d.gpu; d.gpu = `webgpu ${i.vendor}${i.architecture ? ' ' + i.architecture : ''}`; }
  } catch { /* 不支援 WebGPU 或被封鎖 */ }
}

export function initGpuHint(game) {
  probeMaskedGpu(game);
  const gpu = game.quality?.detected?.gpu || '';
  const kind = gpuKind(gpu);
  if (!kind) return;
  try { if (localStorage.getItem(KEY) === '1') return; } catch { /* 隱私模式 */ }
  const host = document.getElementById('menu') || document.body;
  const el = document.createElement('div');
  el.className = 'gpu-hint';
  el.style.cssText = 'position:absolute;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(560px,92vw);padding:12px 16px;'
    + 'background:rgba(12,14,13,.92);border:1px solid rgba(214,160,90,.45);border-radius:6px;color:#d9d2c3;font-size:13px;line-height:1.6;'
    + 'box-shadow:0 8px 30px rgba(0,0,0,.6);z-index:50;text-align:left';
  const name = gpuLabel(gpu);
  el.innerHTML = kind === 'software'
    ? `<b style="color:#e8b46a">效能提示</b>:瀏覽器目前用 <b>CPU 軟體算圖</b>(${name}),遊戲會非常卡。<br>請到瀏覽器設定開啟「可用時使用圖形加速 / 硬體加速」,重新啟動瀏覽器後再進來。`
    : `<b style="color:#e8b46a">效能提示</b>:遊戲目前使用<b>內建顯示晶片</b>(${name})。<br>若電腦有獨立顯卡(NVIDIA / AMD RX),請到 Windows「設定 → 系統 → 顯示器 → 圖形」,把這個瀏覽器設為「高效能」,並確認瀏覽器已開啟硬體加速,重新啟動瀏覽器後會順暢很多。`;
  const row = document.createElement('div');
  row.style.cssText = 'margin-top:8px;display:flex;gap:8px;justify-content:flex-end';
  const btn = (text, fn) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'background:transparent;border:1px solid rgba(217,210,195,.35);color:#d9d2c3;padding:3px 12px;border-radius:4px;cursor:pointer;font:inherit';
    b.onclick = (e) => { e.stopPropagation(); fn(); el.remove(); };
    return b;
  };
  row.append(btn('不再提示', () => { try { localStorage.setItem(KEY, '1'); } catch { /* 隱私模式 */ } }), btn('知道了', () => {}));
  el.append(row);
  host.append(el);
}
