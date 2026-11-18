import { useEffect, useRef, type CSSProperties } from 'react'
import { displayParts, type Track } from '../../shared/track.ts'
import { player } from '../audio'

type Props = {
  open: boolean
  tracks: readonly Track[]
  index: number
  playing: boolean
}

/** Danh sách bài nổi giữa cảnh. Đóng thì `inert` để không focus/bấm được. Hiển thị theo cùng quy tắc với tên bài ở player. */
export function Playlist({ open, tracks, index, playing }: Props) {
  const panel = useRef<HTMLDivElement>(null)

  // Mở ra thì cuộn bài đang phát vào giữa.
  useEffect(() => {
    if (!open) return
    const element = panel.current
    const row = element?.querySelector<HTMLElement>('[data-on="true"]')
    if (element && row) element.scrollTop = row.offsetTop - element.clientHeight / 2 + row.clientHeight / 2
  }, [open])

  return (
    <div ref={panel} id="kz-playlist" className="kz-panel" data-open={open} role="region" aria-label="Danh sách bài" inert={!open}>
      <ul>
        {tracks.map((track, i) => {
          const { title, artist } = displayParts(track)
          return (
            <li key={track.id}>
              <button
                type="button"
                className="kz-row"
                data-on={i === index}
                data-paused={!playing}
                aria-current={i === index ? 'true' : undefined}
                style={{ '--i': tracks.length - 1 - i } as CSSProperties}
                onClick={() => player.playIndex(i)}
              >
                <span className="kz-eq" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="kz-row-title">
                  {title}
                  {artist && <i> — {artist}</i>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
