import { displayParts } from '../../shared/track.ts'
import type { Player } from './player.ts'

/** Phím media, màn hình khoá và thông báo của hệ điều hành. Tên bài hiển thị theo cùng quy tắc với giao diện (CC0 không có tác giả). */
export function attachMediaSession(player: Player): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const session = navigator.mediaSession

  const on = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // trình duyệt không hỗ trợ action này
    }
  }
  on('play', () => void player.play())
  on('pause', () => player.pause())
  on('nexttrack', () => player.next())
  on('previoustrack', () => player.prev())
  on('seekto', (details) => {
    if (details.seekTime != null) player.seek(details.seekTime)
  })

  let shownId: string | null = null
  player.subscribe(() => {
    const { current, status } = player.getSnapshot()
    session.playbackState = status === 'playing' || status === 'loading' ? 'playing' : 'paused'

    const id = current?.id ?? null
    if (id === shownId) return
    shownId = id
    if (!current) {
      session.metadata = null
      return
    }
    const { title, artist } = displayParts(current)
    session.metadata = new MediaMetadata({ title, artist: artist ?? '', album: 'KazeLody' })
  })
}
