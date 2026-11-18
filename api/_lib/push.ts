import {
  ALLOWED_AUDIO_TYPES,
  MAX_UPLOAD_BYTES,
  addTrack,
  extensionOf,
  newTrackKey,
  type StoredTrack,
} from '../../shared/library.ts'
import { clean, parseTrackFilename } from '../../shared/track.ts'
import { readLibrary, writeLibrary, type Storage } from './storage.ts'

export type LocalFile = {
  name: string
  size: number
  read: () => Promise<Uint8Array>
}

export type PushReport = {
  /** Đã upload và thêm vào thư viện */
  uploaded: StoredTrack[]
  /** Đã có trong thư viện (theo tên file gốc) nên bỏ qua */
  skipped: string[]
  /** Chỉ có ở dry-run: những file sẽ được upload */
  wouldUpload: string[]
  errors: { name: string; error: string }[]
}

type Options = {
  /** `null` chỉ hợp lệ khi `dryRun`: chưa có thông tin đăng nhập R2 thì chỉ kiểm tra tên file, không biết bài nào đã có. */
  storage: Storage | null
  files: LocalFile[]
  dryRun?: boolean
  now?: () => Date
  randomId?: () => string
}

/**
 * Đẩy nhạc có sẵn ở máy (public/audio/) lên R2: đọc metadata từ tên file (cùng quy tắc với npm run tracks),
 * upload với khoá UUID, rồi thêm vào tracks.json. Chạy lại không tạo bản trùng. Thư viện được ghi sau MỖI bài thành công
 * nên nếu bị ngắt giữa chừng thì không mất những bài đã xong.
 */
export async function pushTracks(options: Options): Promise<PushReport> {
  const { storage, files, dryRun = false } = options
  const now = options.now ?? (() => new Date())
  const randomId = options.randomId ?? (() => crypto.randomUUID())
  if (!storage && !dryRun) throw new Error('Cần kho lưu trữ R2 để upload')

  const report: PushReport = { uploaded: [], skipped: [], wouldUpload: [], errors: [] }
  let library = storage ? await readLibrary(storage, now()) : null
  const known = new Set(library?.tracks.map((track) => track.originalFilename))

  for (const file of files) {
    const filename = clean(file.name)
    const ext = extensionOf(filename)
    if (!ext) {
      report.errors.push({ name: file.name, error: 'Đuôi file không phải nhạc được hỗ trợ (mp3, ogg, opus, m4a, webm, wav)' })
      continue
    }
    const parsed = parseTrackFilename(filename)
    if (!parsed.ok) {
      report.errors.push({ name: file.name, error: parsed.error })
      continue
    }
    if (file.size <= 0) {
      report.errors.push({ name: file.name, error: 'File rỗng' })
      continue
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      report.errors.push({ name: file.name, error: `File quá lớn (${(file.size / 1024 / 1024).toFixed(1)} MB, tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)` })
      continue
    }
    if (known.has(filename)) {
      report.skipped.push(file.name)
      continue
    }
    if (dryRun || !storage || !library) {
      report.wouldUpload.push(file.name)
      continue
    }

    try {
      const id = randomId()
      const key = newTrackKey(id, ext)
      const contentType = ALLOWED_AUDIO_TYPES[ext]
      const body = await file.read()
      await storage.put(key, body, contentType)
      const info = await storage.head(key)
      if (!info || info.size !== body.byteLength) throw new Error('Upload xong nhưng kích thước trên R2 không khớp')

      const track: StoredTrack = {
        id,
        key,
        title: parsed.value.title,
        artist: parsed.value.artist,
        license: parsed.value.license,
        ...(parsed.value.sourceDomain ? { sourceDomain: parsed.value.sourceDomain } : {}),
        originalFilename: filename,
        contentType,
        size: body.byteLength,
        addedAt: now().toISOString(),
      }
      const next = addTrack(library, track, now())
      if (!next) throw new Error('Id bị trùng trong thư viện')
      await writeLibrary(storage, next)
      library = next
      known.add(filename)
      report.uploaded.push(track)
    } catch (error) {
      report.errors.push({ name: file.name, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return report
}
