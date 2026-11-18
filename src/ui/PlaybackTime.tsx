import { useCallback, useEffect, useRef } from 'react'
import { formatDuration } from '../../shared/time.ts'
import { player, usePlayer } from '../audio'

/**
 * "Đã phát / tổng" (1:23 / 3:45; bài từ 1 giờ thì 0:12:34 / 1:02:03). Ghi thẳng vào chữ bằng requestAnimationFrame và chỉ ghi
 * khi đổi giây, nên không render lại React mỗi giây (cùng cách với ProgressBar). Chưa biết tổng thì chỉ hiện số đã phát.
 * Tổng ưu tiên thời lượng đã lưu của bài (khớp với playlist và không "nhảy" lúc đang đổi bài), rồi mới tới thời lượng thật của file.
 * Chữ này chỉ là thị giác: trình đọc màn hình lấy giờ từ aria-valuetext của thanh tiến độ, khỏi đọc lại mỗi giây.
 */
export function PlaybackTime() {
  const { status, current } = usePlayer()
  const span = useRef<HTMLSpanElement>(null)
  const written = useRef('')
  const running = status === 'playing' || status === 'loading'
  const storedTotal = current?.duration

  const draw = useCallback(() => {
    const total = storedTotal ?? player.duration
    const text =
      total > 0
        ? `${formatDuration(player.currentTime, total)} / ${formatDuration(total, total)}`
        : formatDuration(player.currentTime)
    if (text !== written.current && span.current) {
      written.current = text
      span.current.textContent = text
    }
  }, [storedTotal])

  useEffect(() => {
    draw()
    if (!running) return
    let raf = requestAnimationFrame(function tick() {
      draw()
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [draw, running, current?.id])

  return <span ref={span} className="kz-time" aria-hidden="true" />
}
