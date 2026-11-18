import type { PublicTrack } from '../../../shared/library.ts'
import { LICENSES, type Track } from '../../../shared/track.ts'
import type { MusicSource } from '../source.ts'

const ENDPOINT = '/api/tracks'
/** URL còn ít hơn chừng này thì xin URL mới trước khi phát bài. */
const REFRESH_MARGIN_MS = 15 * 60 * 1000

type Options = {
  fetchFn?: (input: string) => Promise<Response>
  now?: () => number
  endpoint?: string
}

function isPublicTrack(value: unknown): value is PublicTrack {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.artist === 'string' &&
    typeof t.url === 'string' &&
    typeof t.originalFilename === 'string' &&
    typeof t.license === 'string' &&
    Object.hasOwn(LICENSES, t.license)
  )
}

/**
 * Nhạc trên R2 qua /api/tracks. Mỗi URL là presigned nên có hạn: `resolve` (gọi ngay trước khi nạp một bài,
 * qua tuỳ chọn `resolveUrl` của Player) xin lại danh sách khi URL sắp hết hạn, nên phiên nghe nhiều giờ vẫn chuyển bài được.
 * Lỗi mạng hoặc API chưa có (vd. `npm run dev` không chạy api/) thì coi như không có nhạc từ nguồn này.
 */
export function createApiSource(options: Options = {}): MusicSource {
  const fetchFn = options.fetchFn ?? ((input: string) => fetch(input))
  const now = options.now ?? (() => Date.now())
  const endpoint = options.endpoint ?? ENDPOINT

  const urls = new Map<string, string>()
  let expiresAt = 0
  let inflight: Promise<Track[]> | null = null

  async function load(): Promise<Track[]> {
    try {
      const response = await fetchFn(endpoint)
      if (!response.ok) return []
      // Khi không có api/ (Vite dev), đường dẫn này trả index.html: JSON hỏng thì coi như chưa có nhạc.
      const data = (await response.json()) as { tracks?: unknown; expiresAt?: unknown } | null
      if (!Array.isArray(data?.tracks) || typeof data.expiresAt !== 'number') return []

      const tracks: Track[] = []
      urls.clear()
      for (const entry of data.tracks) {
        if (!isPublicTrack(entry)) {
          console.warn('[audio] bỏ qua bài không hợp lệ từ /api/tracks', entry)
          continue
        }
        urls.set(entry.id, entry.url)
        tracks.push({ ...entry, source: 'r2' })
      }
      expiresAt = data.expiresAt
      return tracks
    } catch {
      return []
    }
  }

  /** Gộp các lần gọi đồng thời thành một request. */
  function refresh(): Promise<Track[]> {
    inflight ??= load().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    id: 'r2',

    list: refresh,

    async resolve(track) {
      if (now() >= expiresAt - REFRESH_MARGIN_MS) await refresh()
      // Làm mới thất bại thì dùng URL cũ (có thể vẫn còn hạn), không chặn việc phát.
      return urls.get(track.id) ?? track.url
    },
  }
}

export const apiSource = createApiSource()
