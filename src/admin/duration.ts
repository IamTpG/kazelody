import { isDuration } from '../../shared/time.ts'

/** Phần của HTMLAudioElement mà `readDuration` dùng (để test được trên Node bằng bản giả). */
type AudioLike = {
  src: string
  preload: string
  duration: number
  addEventListener(type: string, listener: () => void): void
}

export type DurationDeps = {
  createAudio?: () => AudioLike
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  /** Thời gian chờ tối đa (ms) trước khi bỏ cuộc */
  timeoutMs?: number
}

/**
 * Đọc thời lượng (giây) của một file nhạc ngay trên trình duyệt, chỉ cần metadata (không phát, không tải cả file).
 * Trả về null khi không đọc được, quá thời hạn, hoặc giá trị lạ (vô cực với luồng, 0…): bài vẫn tải lên được, chỉ là chưa có thời lượng.
 */
export function readDuration(file: Blob, deps: DurationDeps = {}): Promise<number | null> {
  // Truy cập qua globalThis để file này cũng được kiểm kiểu trong dự án Node của test (không có kiểu DOM).
  const createAudio = deps.createAudio ?? (() => new (globalThis as unknown as { Audio: new () => AudioLike }).Audio())
  const createObjectUrl = deps.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
  const timeoutMs = deps.timeoutMs ?? 8000

  return new Promise((resolve) => {
    let finished = false
    let url = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: number | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (url) revokeObjectUrl(url)
      resolve(value)
    }

    try {
      const audio = createAudio()
      url = createObjectUrl(file)
      timer = setTimeout(() => finish(null), timeoutMs)
      audio.preload = 'metadata'
      audio.addEventListener('loadedmetadata', () => finish(isDuration(audio.duration) ? audio.duration : null))
      audio.addEventListener('error', () => finish(null))
      audio.src = url
    } catch {
      finish(null)
    }
  })
}
