/**
 * Uniform dùng chung cho mọi shader trong cảnh. Material nào spread object này
 * vào `uniforms` sẽ giữ cùng tham chiếu `{ value }`, nên chỉ cần cập nhật một chỗ mỗi frame.
 */
export const shared = {
  uTime: { value: 0 },
  uWindTime: { value: 0 },
  uWindStrength: { value: 1 },
}

export type SharedUniforms = typeof shared

/** Trạng thái gió điều khiển bởi tương tác (click → cơn gió mạnh). */
export const wind = { gust: 0 }
