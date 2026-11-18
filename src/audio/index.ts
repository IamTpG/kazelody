import { useSyncExternalStore } from 'react'
import { attachMediaSession } from './mediaSession.ts'
import { mergeTracks } from './merge.ts'
import { Player, type PlayerState } from './player.ts'
import type { MusicSource } from './source.ts'
import { apiSource } from './sources/api.ts'
import { manifestSource } from './sources/manifest.ts'

export { Player, type PlayerState, type PlayerStatus } from './player.ts'
export type { MusicSource } from './source.ts'

const sources = new Map<string, MusicSource>()

/** Một player dùng chung cho cả trang. */
export const player = new Player({
  // Đổi URL ngay trước khi phát nếu nguồn có `resolve` (vd. presigned URL ở bước sau).
  resolveUrl: (track) => sources.get(track.source)?.resolve?.(track) ?? Promise.resolve(track.url),
})

/** State của player cho React. Thời gian phát không nằm ở đây: đọc `player.currentTime` bằng requestAnimationFrame. */
export function usePlayer(): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getSnapshot)
}

let started: Promise<void> | null = null

/**
 * Nạp danh sách bài từ các nguồn (không tự phát: trình duyệt cần thao tác của người dùng).
 * Mặc định: nhạc trên R2 qua /api/tracks (bản chạy thật) + thư mục public/audio (npm run dev, nơi không có api/).
 * Bài trùng giữa các nguồn (cùng tên file gốc) chỉ giữ một. Gọi nhiều lần vẫn chỉ chạy một lần.
 */
export function initAudio(list: MusicSource[] = [apiSource, manifestSource]): Promise<void> {
  started ??= (async () => {
    attachMediaSession(player)
    for (const source of list) sources.set(source.id, source)
    const lists = await Promise.all(
      list.map((source) =>
        source.list().catch((error: unknown) => {
          console.warn(`[audio] không đọc được nguồn "${source.id}"`, error)
          return []
        }),
      ),
    )
    player.setTracks(mergeTracks(lists))
  })()
  return started
}
