import type { Track } from '../../shared/track.ts'

/**
 * Gộp danh sách bài từ nhiều nguồn, giữ thứ tự nguồn rồi thứ tự trong nguồn, và bỏ bài trùng:
 * cùng id, hoặc cùng tên file gốc (một bài có thể vừa nằm trong public/audio vừa đã được đẩy lên R2). Nguồn đứng trước thắng.
 */
export function mergeTracks(lists: readonly (readonly Track[])[]): Track[] {
  const ids = new Set<string>()
  const filenames = new Set<string>()
  const merged: Track[] = []
  for (const list of lists) {
    for (const track of list) {
      if (ids.has(track.id)) continue
      if (track.originalFilename && filenames.has(track.originalFilename)) continue
      ids.add(track.id)
      if (track.originalFilename) filenames.add(track.originalFilename)
      merged.push(track)
    }
  }
  return merged
}
