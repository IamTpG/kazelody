import type { Track } from '../../shared/track.ts'

/**
 * Một nguồn nhạc. Thêm nguồn mới (R2, Jamendo/Audius, file người dùng nạp…) = viết thêm một adapter,
 * không phải sửa player.
 */
export interface MusicSource {
  id: string
  list(): Promise<Track[]>
  /** Đổi URL của bài ngay trước khi phát (vd. xin presigned URL mới khi cái cũ sắp hết hạn). Không có thì dùng `track.url`. */
  resolve?(track: Track): Promise<string>
}
