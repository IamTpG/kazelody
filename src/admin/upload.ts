import { MAX_UPLOAD_BYTES, extensionOf, validateMeta, type StoredTrack, type TrackMeta } from '../../shared/library.ts'
import { isDuration } from '../../shared/time.ts'
import { clean, parseTrackFilename } from '../../shared/track.ts'
import type { AdminApi, UploadTicket } from './api.ts'

/** Metadata đang soạn trong hàng đợi upload. Mọi trường là chuỗi vì người dùng đang nhập dở. */
export type Draft = { title: string; artist: string; license: string; sourceDomain: string }

export type UploadFile = { name: string; size: number }

/** Điền sẵn metadata từ tên file theo quy tắc Artist__Title__License[__nguon]. Không khớp thì điền tạm tên bài và nêu lý do. */
export function draftFromFilename(filename: string): { draft: Draft; hint: string | null } {
  const name = clean(filename)
  const parsed = parseTrackFilename(name)
  if (parsed.ok) {
    const { title, artist, license, sourceDomain } = parsed.value
    return { draft: { title, artist, license, sourceDomain: sourceDomain ?? '' }, hint: null }
  }
  const stem = name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  return { draft: { title: stem, artist: '', license: '', sourceDomain: '' }, hint: parsed.error }
}

/** Lý do metadata chưa hợp lệ, hoặc null. Cùng bộ quy tắc với server. */
export function draftProblem(draft: Draft): string | null {
  const result = validateMeta(draft)
  return result.ok ? null : result.error
}

function draftToMeta(draft: Draft): TrackMeta {
  const result = validateMeta(draft)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/** Vấn đề của chính file (đuôi, dung lượng), kiểm tra trước khi gọi mạng. */
export function fileProblem(file: UploadFile): string | null {
  if (!extensionOf(file.name)) return 'Chỉ nhận file nhạc: mp3, ogg, opus, m4a, webm, wav'
  if (file.size <= 0) return 'File rỗng'
  if (file.size > MAX_UPLOAD_BYTES) return `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB, tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`
  return null
}

export type Stage = 'checking' | 'signing' | 'uploading' | 'saving'

/**
 * Lỗi kèm bước bị hỏng. `ticket` chỉ có khi file ĐÃ nằm trên R2 mà bước ghi thư viện lỗi:
 * truyền lại vào `uploadTrack` để chỉ ghi lại, không upload lại file.
 */
export class UploadError extends Error {
  stage: Stage
  ticket: UploadTicket | null
  status: number | null
  constructor(stage: Stage, cause: unknown, ticket: UploadTicket | null = null) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'UploadError'
    this.stage = stage
    this.ticket = ticket
    this.status = typeof (cause as { status?: unknown } | null)?.status === 'number' ? (cause as { status: number }).status : null
  }
}

export type UploadOptions<F extends UploadFile> = {
  file: F
  draft: Draft
  api: Pick<AdminApi, 'requestUpload' | 'register'>
  /** Upload thật lên URL ký (XHR ở trình duyệt, giả trong test). Báo tiến độ 0…1. */
  put: (ticket: UploadTicket, file: F, onProgress: (fraction: number) => void) => Promise<void>
  onStage?: (stage: Stage) => void
  onProgress?: (fraction: number) => void
  /** Phiếu của lần thử trước (file đã lên R2): bỏ qua xin URL và upload */
  ticket?: UploadTicket | null
  /** Thời lượng (giây) đã đo ở trình duyệt; không đo được thì bỏ trống, bài vẫn được tải lên */
  duration?: number | null
}

/** Ba bước: xin URL ký → PUT thẳng lên R2 → ghi vào thư viện. */
export async function uploadTrack<F extends UploadFile>(options: UploadOptions<F>): Promise<StoredTrack> {
  const { file, draft, api, put, onStage, onProgress } = options

  onStage?.('checking')
  const problem = fileProblem(file) ?? draftProblem(draft)
  if (problem) throw new UploadError('checking', new Error(problem))
  const meta = draftToMeta(draft)

  let ticket = options.ticket ?? null
  if (!ticket) {
    onStage?.('signing')
    let issued: UploadTicket
    try {
      issued = await api.requestUpload({ filename: file.name, size: file.size })
    } catch (error) {
      throw new UploadError('signing', error)
    }

    onStage?.('uploading')
    onProgress?.(0)
    try {
      await put(issued, file, (fraction) => onProgress?.(Math.min(1, Math.max(0, fraction))))
    } catch (error) {
      throw new UploadError('uploading', error)
    }
    onProgress?.(1)
    ticket = issued
  }

  onStage?.('saving')
  try {
    return await api.register({
      id: ticket.id,
      key: ticket.key,
      originalFilename: clean(file.name),
      ...meta,
      ...(isDuration(options.duration) ? { duration: options.duration } : {}),
    })
  } catch (error) {
    throw new UploadError('saving', error, ticket)
  }
}
