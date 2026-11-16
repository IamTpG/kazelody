import { useId, useRef } from 'react'

/*
 * Thanh trượt thời gian không cần chữ: mặt trời chạy trên vòng cung từ chân trời trái (giờ sớm nhất)
 * qua đỉnh tới chân trời phải (giờ muộn nhất). Vị trí theo giờ đồng hồ thật của từng ảnh.
 * Sau hoàng hôn mặt trời đổi thành mặt trăng.
 */

type Props = {
  /** Giờ đồng hồ hiện tại */
  clock: number
  /** Giờ ở hai đầu cung */
  start: number
  end: number
  /** Sau giờ này hiện mặt trăng */
  sunset: number
  onChange: (clock: number) => void
  /** Chữ cho trình đọc màn hình */
  valueText: string
}

const W = 140
const H = 82
const CX = 70
const CY = 70
const RX = 60
const RY = 60

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

export function TimeArc({ clock, start, end, sunset, onChange, valueText }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const id = useId()
  const span = Math.max(1e-6, end - start)

  // Góc π = chân trời trái (start), 0 = chân trời phải (end).
  const angle = Math.PI * (1 - (clock - start) / span)
  const sx = CX + RX * Math.cos(angle)
  const sy = CY - RY * Math.sin(angle)
  // Mặt trời khuyết dần thành trăng lưỡi liềm ở cuối cung (quanh giờ `sunset`): một vòng tròn "cắn" trượt vào đĩa.
  const moon = smooth((clock - (sunset - 0.7)) / 1.5)
  // Lúc sắp lặn mặt trời ngả màu cam ấm.
  // khoảng cách từ tâm đĩa đến tâm hình cắn: 17 = chưa chạm tới, 5 = lưỡi liềm hoàn chỉnh
  const bite = 17 - 12 * moon
  const warm = smooth((clock - (sunset - 1.6)) / 1.4) * (1 - moon)

  const clockFromPointer = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return clock
    const r = svg.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    const a = Math.atan2(Math.max(0, (CY - y) / RY), (x - CX) / RX)
    return start + span * (1 - Math.min(Math.PI, Math.max(0, a)) / Math.PI)
  }

  const step = span / 40
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-[min(10rem,56vw)] cursor-pointer overflow-visible drop-shadow-[0_1px_5px_rgba(30,40,90,0.45)] touch-none select-none outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-white/70"
      role="slider"
      tabIndex={0}
      aria-label="Thời điểm trong ngày"
      aria-valuemin={start}
      aria-valuemax={end}
      aria-valuenow={Number(clock.toFixed(2))}
      aria-valuetext={valueText}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange(clockFromPointer(e))
      }}
      onPointerMove={(e) => {
        if (dragging.current) onChange(clockFromPointer(e))
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onKeyDown={(e) => {
        const s = e.shiftKey ? step * 5 : step
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onChange(Math.min(end, clock + s))
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onChange(Math.max(start, clock - s))
        else if (e.key === 'Home') onChange(start)
        else if (e.key === 'End') onChange(end)
        else return
        e.preventDefault()
      }}
    >
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="white" stopOpacity={0.8 - 0.35 * moon} />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-above`}>
          <rect x="-60" y="-60" width={W + 120} height={CY + 60} />
        </clipPath>
        {/* Đĩa trừ đi một hình tròn lệch; hình tròn này trượt từ ngoài vào nên đĩa khuyết dần. */}
        <mask id={`${id}-crescent`}>
          <circle cx={sx} cy={sy} r="9" fill="white" />
          <circle cx={sx + 0.8 * bite} cy={sy - 0.6 * bite} r="7" fill="black" />
        </mask>
      </defs>

      <path
        d={`M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`}
        fill="none"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <line x1="4" y1={CY} x2={W - 4} y2={CY} stroke="white" strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />

      <g clipPath={`url(#${id}-above)`}>
        <circle cx={sx} cy={sy} r="20" fill={`url(#${id}-glow)`} />
        <circle
          cx={sx}
          cy={sy}
          r={8.5 - 0.5 * moon}
          fill={`rgb(${lerp(255, 244, moon)}, ${lerp(lerp(246, 205, warm), 241, moon)}, ${lerp(lerp(216, 150, warm), 226, moon)})`}
          stroke="white"
          strokeWidth="1.5"
          strokeOpacity={1 - moon}
          mask={`url(#${id}-crescent)`}
        />
      </g>
    </svg>
  )
}
