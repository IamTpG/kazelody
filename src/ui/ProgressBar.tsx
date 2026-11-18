import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { formatDuration } from '../../shared/time.ts'
import { player, usePlayer } from '../audio'

const SEEK_STEP = 5

/*
 * Đường tiến độ + núm. Vị trí đọc thẳng từ player.currentTime mỗi khung hình rồi ghi vào `transform` qua ref:
 * không setState (không render lại 60 lần/giây) và `transform` trên lớp riêng di chuyển theo từng phần pixel,
 * nên đường chạy trượt đều thay vì nhích từng pixel (bài 4 phút trên 488px chỉ đi ~2px mỗi giây).
 */
export function ProgressBar() {
  const { status, duration, current } = usePlayer()
  const bar = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const width = useRef(0)
  const lastSecond = useRef(-1)
  const dragging = useRef(false)
  const running = status === 'playing' || status === 'loading'

  const draw = useCallback(() => {
    const total = player.duration
    const time = player.currentTime
    const p = total > 0 ? Math.min(1, time / total) : 0
    if (fill.current) fill.current.style.transform = `scaleX(${p})`
    if (dot.current) dot.current.style.transform = `translate3d(${p * width.current}px, 0, 0)`
    const second = Math.floor(time)
    if (bar.current && second !== lastSecond.current) {
      lastSecond.current = second
      bar.current.setAttribute('aria-valuenow', String(second))
      bar.current.setAttribute('aria-valuetext', `${formatDuration(time, total)} / ${formatDuration(total, total)}`)
    }
  }, [])

  useEffect(() => {
    const element = bar.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      width.current = element.getBoundingClientRect().width
      draw()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [draw])

  // Đang phát: vẽ mỗi khung hình. Đang dừng: chỉ vẽ một lần (và khi đổi bài / biết thời lượng).
  useEffect(() => {
    draw()
    if (!running) return
    let raf = requestAnimationFrame(function tick() {
      draw()
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [draw, running, current?.id, duration])

  const seekTo = (event: ReactPointerEvent<HTMLDivElement>) => {
    const total = player.duration
    const element = bar.current
    if (!(total > 0) || !element) return
    const rect = element.getBoundingClientRect()
    player.seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * total)
    draw()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(player.duration > 0)) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') player.seek(player.currentTime + SEEK_STEP)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') player.seek(player.currentTime - SEEK_STEP)
    else if (event.key === 'Home') player.seek(0)
    else return
    event.preventDefault()
    draw()
  }

  return (
    <div
      ref={bar}
      className="kz-bar"
      role="slider"
      tabIndex={0}
      aria-label="Tiến độ bài hát"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={0}
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        seekTo(event)
      }}
      onPointerMove={(event) => {
        if (dragging.current) seekTo(event)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={fill} className="kz-fill" />
      <div ref={dot} className="kz-dot" />
    </div>
  )
}
