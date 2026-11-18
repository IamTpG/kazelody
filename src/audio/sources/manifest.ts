import { isManifestEntry, type Track } from '../../../shared/track.ts'
import type { MusicSource } from '../source.ts'

const MANIFEST_URL = '/audio/tracks.json'

/**
 * Nhạc tự host trong `public/audio/`, danh sách do `npm run tracks` sinh ra từ tên file.
 * Là nguồn tạm cho tới khi chuyển sang R2.
 */
export const manifestSource: MusicSource = {
  id: 'manifest',

  async list(): Promise<Track[]> {
    let data: unknown
    try {
      const response = await fetch(MANIFEST_URL)
      if (!response.ok) return []
      // Vite dev trả index.html (200) cho đường dẫn không có thật: parse JSON hỏng thì coi như chưa có nhạc.
      data = await response.json()
    } catch {
      return []
    }

    const entries = (data as { tracks?: unknown } | null)?.tracks
    if (!Array.isArray(entries)) return []

    const tracks: Track[] = []
    for (const entry of entries) {
      if (!isManifestEntry(entry)) {
        console.warn('[audio] bỏ qua dòng không hợp lệ trong tracks.json', entry)
        continue
      }
      tracks.push({
        id: entry.id,
        title: entry.title,
        artist: entry.artist,
        url: `/audio/${encodeURIComponent(entry.filename)}`,
        source: 'manifest',
        sourceDomain: entry.sourceDomain,
        license: entry.license,
        originalFilename: entry.filename,
      })
    }
    return tracks
  },
}
