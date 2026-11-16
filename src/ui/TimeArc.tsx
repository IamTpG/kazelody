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

const W = 200
const H = 92
const CX = 100
const CY = 80
const RX = 86
const RY = 64

export function TimeArc({ clock, start, end, sunset, onChange, valueText }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const id = useId()
  const span = Math.max(1e-6, end - start)

  // Góc π = chân trời trái (start), 0 = chân trời phải (end).
  const angle = Math.PI * (1 - (clock - start) / span)
  const sx = CX + RX * Math.cos(angle)
  const sy = CY - RY * Math.sin(angle)
  const night = clock > sunset

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
      className="w-[min(13rem,64vw)] cursor-pointer touch-none select-none outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-white/70"
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
          <stop offset="0" stopColor="white" stopOpacity={night ? 0.45 : 0.8} />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-above`}>
          <rect x="0" y="0" width={W} height={CY} />
        </clipPath>
        {/* Mặt trăng khuyết: hình tròn trừ đi một hình tròn lệch. */}
        <mask id={`${id}-crescent`}>
          <circle cx={sx} cy={sy} r="8" fill="white" />
          <circle cx={sx + 4} cy={sy - 3} r="7" fill="black" />
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
        {night ? (
          <circle cx={sx} cy={sy} r="8" fill="#f4f1e2" mask={`url(#${id}-crescent)`} />
        ) : (
          <circle cx={sx} cy={sy} r="8.5" fill="#fff6d8" stroke="white" strokeWidth="1.5" />
        )}
      </g>
    </svg>
  )
}
