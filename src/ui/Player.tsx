import { useEffect, useRef, useState } from 'react'
import { displayParts } from '../../shared/track.ts'
import { player, usePlayer } from '../audio'
import { ListIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, ShuffleIcon } from './icons'
import { Motes } from './Motes'
import { Playlist } from './Playlist'
import { ProgressBar } from './ProgressBar'
import { VolumeControl } from './VolumeControl'

type Props = {
  /** Playlist đang mở (state nằm ở Overlay để lớp tối dưới chân màn hình đổi theo) */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 0 = ban ngày … 1 = đêm sâu */
  night: number
}

/** Chặn Space khi đang ở trên một điều khiển có phím riêng. */
const OWN_KEYS = 'button, input, textarea, select, a, [role="slider"], [contenteditable="true"]'

export function Player({ open, onOpenChange, night }: Props) {
  const state = usePlayer()
  const root = useRef<HTMLElement>(null)
  const [started, setStarted] = useState(false)
  // "Đang nghe" theo ý định người dùng: kể cả lúc đang nạp bài.
  const intent = state.status === 'playing' || state.status === 'loading'
  if (intent && !started) setStarted(true)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return
      if ((event.target as HTMLElement | null)?.closest(OWN_KEYS)) return
      event.preventDefault()
      void player.toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Playlist mở: Escape hoặc bấm ra ngoài thì đóng.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onOpenChange])

  // Chưa có bài nào (vd. bản chạy thật trước khi nhạc lên R2): không hiện player.
  if (state.tracks.length === 0) return null

  const failed = state.status === 'error'
  const parts = state.current ? displayParts(state.current) : { title: '', artist: null }

  return (
    <section ref={root} className="kz-player" aria-label="Trình phát nhạc" data-started={started}>
      <Playlist open={open} tracks={state.tracks} index={state.index} playing={intent} />
      <Motes night={night} playing={intent} />

      <div className="kz-pill">
        <button type="button" className="kz-ico" aria-label="Bài trước" onClick={() => player.prev()}>
          <PrevIcon />
        </button>
        <button type="button" className="kz-play" aria-label={intent ? 'Tạm dừng' : 'Phát'} onClick={() => void player.toggle()}>
          {intent ? <PauseIcon className="kz-pause" /> : <PlayIcon className="kz-tri" />}
        </button>
        <button type="button" className="kz-ico" aria-label="Bài tiếp" onClick={() => player.next()}>
          <NextIcon />
        </button>

        <div className="kz-meta">
          {/* Đổi `key` theo bài để tên bài trôi nhẹ lên mỗi lần đổi. */}
          <div className="kz-title" key={state.current?.id ?? 'none'} aria-live="polite">
            {failed ? (
              'Không phát được nhạc'
            ) : (
              <>
                {parts.title}
                {parts.artist && <i> — {parts.artist}</i>}
              </>
            )}
          </div>
          <ProgressBar />
        </div>

        <VolumeControl />
        <button
          type="button"
          className="kz-ico kz-shuffle"
          aria-label="Phát ngẫu nhiên"
          aria-pressed={state.shuffle}
          onClick={() => player.setShuffle(!state.shuffle)}
        >
          <ShuffleIcon />
        </button>
        <button
          type="button"
          className="kz-ico"
          aria-label="Danh sách phát"
          aria-expanded={open}
          aria-controls="kz-playlist"
          onClick={() => onOpenChange(!open)}
        >
          <ListIcon />
        </button>
      </div>
    </section>
  )
}
