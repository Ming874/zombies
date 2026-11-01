// [draws] 不透明物件的繪製順序:先依 shader program、再依材質、再由近到遠。
// three 預設只依材質 id 排序 → 同一個 program 的材質被其他 program 隔開,每換一次 program 就要重新 useProgram、
// 重新比對/上傳相機與全部光源 uniform(光源池 8 盞 + 聚光燈 + 月光 + 陰影矩陣)。實測大廳一幀 270 次 program 切換;
// 依 program 分組後只剩實際用到的 program 數。不透明物件的順序不影響畫面(深度測試),透明物件排序不動。
// 材質目前的 program 每幀查一次(WeakMap 查詢放在比較函式裡太貴),由 tick() 推進幀號。
export function installProgramSort(renderer) {
  const props = renderer.properties;
  let frame = 1;
  const pid = (m) => {
    if (m.__dsF !== frame) {
      m.__dsF = frame;
      const p = props.get(m).currentProgram;
      m.__dsP = p ? p.id : 0;
    }
    return m.__dsP;
  };
  renderer.setOpaqueSort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    const pa = pid(a.material), pb = pid(b.material);
    if (pa !== pb) return pa - pb;
    if (a.material.id !== b.material.id) return a.material.id - b.material.id;
    if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  });
  return { tick() { frame++; } };
}
