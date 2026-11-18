/**
 * Vài cánh hoa bay ngang theo gió quanh player khi đang nghe. Chỉ có ban ngày: độ mờ giảm dần về đêm
 * (cảnh đã có đom đóm của riêng nó). Chuyển động nằm hết trong CSS (transform + opacity).
 */
export function Motes({ night, playing }: { night: number; playing: boolean }) {
  return (
    <div className="kz-motes" aria-hidden="true" style={{ opacity: playing ? Math.max(0, 1 - night) : 0 }}>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}
