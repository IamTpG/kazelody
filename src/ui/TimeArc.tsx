import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/*
 * Thanh trượt thời gian không cần chữ: mặt trời chạy trên vòng cung từ chân trời trái (giờ sớm nhất)
 * qua đỉnh tới chân trời phải (giờ muộn nhất). Vị trí theo giờ đồng hồ thật của từng ảnh.
 * Sau hoàng hôn mặt trời đổi thành mặt trăng.
 *
 * Người dùng mới: sau một lúc hiện dòng gợi ý, mặt trời tự trượt nhẹ qua lại (cảnh đổi ánh sáng theo) cho tới
 * lần tương tác đầu tiên; sau đó không bao giờ hiện lại (nhớ bằng localStorage). Thêm ?hint vào URL để ép hiện lại.
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

const SEEN_KEY = 'kz-arc-seen'
const HINT_DELAY_MS = 1200
const NUDGE_FIRST_MS = 1800
const NUDGE_EVERY_MS = 12000
const NUDGE_DURATION_MS = 3000
const NUDGE_HOURS = 1.7
const FORCE_HINT = new URLSearchParams(window.location.search).has('hint')

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

export function TimeArc({ clock, start, end, sunset, onChange, valueText }: Props) {
  const mainRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const id = useId()
  const span = Math.max(1e-6, end - start)

  const [hinting, setHinting] = useState(false)
  // Mặc định coi như đã thấy; effect bên dưới mới bật lên nếu người dùng chưa từng tương tác.
  const seen = useRef(true)
  // Bản mới nhất của props cho các timer (tránh đóng băng giá trị cũ trong effect).
  const latest = useRef({ clock, start, end, onChange })
  useEffect(() => {
    latest.current = { clock, start, end, onChange }
  })

  const markSeen = () => {
    if (seen.current) return
    seen.current = true
    setHinting(false)
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // bị chặn: lần sau gợi ý có thể hiện lại, không sao
    }
  }

  useEffect(() => {
    let alreadySeen = false
    try {
      alreadySeen = localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      // coi như chưa thấy
    }
    if (alreadySeen && !FORCE_HINT) return
    seen.current = false

    const showHint = setTimeout(() => setHinting(true), HINT_DELAY_MS)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0

    // Trượt đi rồi quay lại chỗ cũ. Dừng ngay khi người dùng chạm vào.
    const nudge = () => {
      if (seen.current || dragging.current) return
      const origin = latest.current.clock
      const t0 = performance.now()
      const frame = (now: number) => {
        if (seen.current || dragging.current) return
        const k = Math.min(1, (now - t0) / NUDGE_DURATION_MS)
        const { start: lo, end: hi, onChange: set } = latest.current
        const offset = NUDGE_HOURS * Math.sin(Math.PI * 2 * k) * (1 - 0.25 * k)
        set(k < 1 ? Math.min(hi, Math.max(lo, origin + offset)) : origin)
        if (k < 1) raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    }

    const first = reduceMotion ? 0 : setTimeout(nudge, NUDGE_FIRST_MS)
    const repeat = reduceMotion ? 0 : setInterval(nudge, NUDGE_EVERY_MS)
    return () => {
      clearTimeout(showHint)
      clearTimeout(first)
      clearInterval(repeat)
      cancelAnimationFrame(raf)
    }
  }, [])

  // Góc π = chân trời trái (start), 0 = chân trời phải (end).
  const angle = Math.PI * (1 - (clock - start) / span)
  const sx = CX + RX * Math.cos(angle)
  const sy = CY - RY * Math.sin(angle)
  // Mặt trời khuyết dần thành trăng lưỡi liềm ở cuối cung (quanh giờ `sunset`): một vòng tròn "cắn" trượt vào đĩa.
  const moon = smooth((clock - (sunset - 0.7)) / 1.5)
  // khoảng cách từ tâm đĩa đến tâm hình cắn: 17 = chưa chạm tới, 5 = lưỡi liềm hoàn chỉnh
  const bite = 17 - 12 * moon
  // Lúc sắp lặn mặt trời ngả màu cam ấm.
  const warm = smooth((clock - (sunset - 1.6)) / 1.4) * (1 - moon)

  const clockFromPointer = (e: PointerEvent) => {
    const svg = mainRef.current
    if (!svg) return clock
    const r = svg.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const y = ((e.clientY - r.top) / r.height) * H
    const a = Math.atan2(Math.max(0, (CY - y) / RY), (x - CX) / RX)
    return start + span * (1 - Math.min(Math.PI, Math.max(0, a)) / Math.PI)
  }

  const step = span / 40
  const onKeyDown = (e: KeyboardEvent) => {
    const s = e.shiftKey ? step * 5 : step
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onChange(Math.min(end, clock + s))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onChange(Math.max(start, clock - s))
    else if (e.key === 'Home') onChange(start)
    else if (e.key === 'End') onChange(end)
    else return
    e.preventDefault()
    markSeen()
  }

  const viewBox = `0 0 ${W} ${H}`
  return (
    <div
      className="kz-arc"
      data-hinting={hinting}
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
        markSeen()
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
      onKeyDown={onKeyDown}
    >
      {/* Lớp quầng sáng riêng, để bóng đổ của lớp chính không làm quầng sáng bị đục. */}
      <svg className="kz-arc-layer kz-arc-glow" viewBox={viewBox} aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0" stopColor="white" stopOpacity={0.8 - 0.35 * moon} />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-above`}>
            <rect x="-60" y="-60" width={W + 120} height={CY + 60} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-above)`}>
          <circle className="kz-arc-halo" cx={sx} cy={sy} r="22" fill={`url(#${id}-glow)`} />
          <circle className="kz-arc-ring" cx={sx} cy={sy} r="13" />
        </g>
      </svg>

      <svg ref={mainRef} className="kz-arc-layer kz-arc-main" viewBox={viewBox} aria-hidden="true">
        <defs>
          <clipPath id={`${id}-above2`}>
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
          strokeOpacity="0.85"
          strokeWidth="2"
        />
        <line x1="4" y1={CY} x2={W - 4} y2={CY} stroke="white" strokeOpacity="0.9" strokeWidth="2" strokeLinecap="round" />
        <g clipPath={`url(#${id}-above2)`}>
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

      <span className="kz-arc-hint" aria-hidden="true">
        Kéo mặt trời để đổi thời gian
      </span>
    </div>
  )
}
