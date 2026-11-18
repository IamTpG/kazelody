/*
 * Thư viện nhạc lưu ở R2 (tracks.json) và các phép biến đổi thuần trên nó.
 * Không dùng DOM hay API riêng của Node: app, api/ và tools/ đều import file này.
 * Mọi hàm biến đổi trả về bản mới (không sửa bản cũ); không tìm thấy hoặc dữ liệu sai thì trả null.
 */
import {
  AUDIO_EXTENSIONS,
  LICENSES,
  clean,
  parseLicense,
  parseSourceDomain,
  type LicenseId,
  type Track,
} from './track.ts'

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
export const MAX_TEXT_LENGTH = 200

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number]

/** Đuôi file → content-type dùng khi upload. */
export const ALLOWED_AUDIO_TYPES: Record<AudioExtension, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  wav: 'audio/wav',
}

/** Một bài trong tracks.json. Thứ tự trong mảng là thứ tự phát. */
export type StoredTrack = {
  /** UUID, cũng nằm trong `key` */
  id: string
  /** Khoá object trong R2: audio/<id>.<đuôi> */
  key: string
  title: string
  artist: string
  license: LicenseId
  sourceDomain?: string
  originalFilename: string
  contentType: string
  size: number
  /** ISO 8601 */
  addedAt: string
}

export type Library = {
  version: 1
  updatedAt: string
  tracks: StoredTrack[]
}

/** Phần được trả cho người nghe: metadata công khai + URL đã ký. */
export type PublicTrack = Omit<Track, 'source'>

export type TrackMeta = {
  title: string
  artist: string
  license: LicenseId
  sourceDomain?: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const KEY = new RegExp(`^audio/([0-9a-f-]{36})\\.(${AUDIO_EXTENSIONS.join('|')})$`)

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

/** Đuôi âm thanh hợp lệ (chữ thường) của một tên file, hoặc null. */
export function extensionOf(filename: string): AudioExtension | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(filename)
  const ext = match?.[1].toLowerCase()
  return AUDIO_EXTENSIONS.find((candidate) => candidate === ext) ?? null
}

export const newTrackKey = (id: string, ext: AudioExtension) => `audio/${id}.${ext}`

/** Tách khoá R2 hợp lệ `audio/<uuid>.<đuôi>`; khoá lạ (vd. cố trỏ ra ngoài thư mục) thì null. */
export function parseTrackKey(key: string): { id: string; ext: AudioExtension } | null {
  const match = KEY.exec(key)
  if (!match || !isUuid(match[1])) return null
  return { id: match[1], ext: match[2] as AudioExtension }
}

export function emptyLibrary(now: Date = new Date()): Library {
  return { version: 1, updatedAt: now.toISOString(), tracks: [] }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Kiểm tra dữ liệu người dùng (admin) nhập. Dùng chung bộ quy tắc với tên file: NFC, license trong danh sách, nguồn là tên miền. */
export function validateMeta(input: unknown): Result<TrackMeta> {
  if (!isRecord(input)) return { ok: false, error: 'Dữ liệu không hợp lệ' }
  const title = typeof input.title === 'string' ? clean(input.title) : ''
  const artist = typeof input.artist === 'string' ? clean(input.artist) : ''
  if (!title) return { ok: false, error: 'Thiếu tên bài' }
  if (!artist) return { ok: false, error: 'Thiếu tên tác giả' }
  if (title.length > MAX_TEXT_LENGTH || artist.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Tên bài và tác giả tối đa ${MAX_TEXT_LENGTH} ký tự` }
  }
  if (typeof input.license !== 'string') return { ok: false, error: 'Thiếu license' }
  const license = parseLicense(input.license)
  if (!license.ok) return license

  let sourceDomain: string | undefined
  if (typeof input.sourceDomain === 'string' && input.sourceDomain.trim() !== '') {
    const source = parseSourceDomain(input.sourceDomain)
    if (!source.ok) return source
    sourceDomain = source.value
  } else if (input.sourceDomain !== undefined && input.sourceDomain !== null && input.sourceDomain !== '') {
    return { ok: false, error: 'Nguồn phải là chuỗi (tên miền)' }
  }
  return { ok: true, value: { title, artist, license: license.value, ...(sourceDomain ? { sourceDomain } : {}) } }
}

/** Đọc một dòng của tracks.json. Dữ liệu từ ngoài nên không tin kiểu; sai thì null. */
export function validateStoredTrack(value: unknown): StoredTrack | null {
  if (!isRecord(value)) return null
  if (!isUuid(value.id) || typeof value.key !== 'string') return null
  const parsedKey = parseTrackKey(value.key)
  if (!parsedKey || parsedKey.id !== value.id) return null
  const meta = validateMeta(value)
  if (!meta.ok) return null
  if (typeof value.originalFilename !== 'string' || typeof value.contentType !== 'string') return null
  if (typeof value.size !== 'number' || !Number.isFinite(value.size) || value.size < 0) return null
  if (typeof value.addedAt !== 'string' || Number.isNaN(Date.parse(value.addedAt))) return null
  if (!Object.hasOwn(LICENSES, meta.value.license)) return null
  return {
    id: value.id,
    key: value.key,
    ...meta.value,
    originalFilename: value.originalFilename,
    contentType: value.contentType,
    size: value.size,
    addedAt: value.addedAt,
  }
}

/** Nghiêm ngặt: chỉ cần MỘT dòng sai là cả thư viện bị từ chối, để không bao giờ ghi đè và làm mất bài khi dữ liệu hỏng. */
export function validateLibrary(value: unknown): Library | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tracks)) return null
  if (typeof value.updatedAt !== 'string') return null
  const tracks: StoredTrack[] = []
  const seen = new Set<string>()
  for (const entry of value.tracks) {
    const track = validateStoredTrack(entry)
    if (!track || seen.has(track.id)) return null
    seen.add(track.id)
    tracks.push(track)
  }
  return { version: 1, updatedAt: value.updatedAt, tracks }
}

const touch = (tracks: StoredTrack[], now: Date): Library => ({
  version: 1,
  updatedAt: now.toISOString(),
  tracks,
})

/** Thêm vào cuối. Trùng id thì null. */
export function addTrack(library: Library, track: StoredTrack, now: Date = new Date()): Library | null {
  if (library.tracks.some((t) => t.id === track.id)) return null
  return touch([...library.tracks, track], now)
}

export function updateTrack(library: Library, id: string, meta: TrackMeta, now: Date = new Date()): Library | null {
  const index = library.tracks.findIndex((t) => t.id === id)
  if (index < 0) return null
  const { sourceDomain: _drop, ...rest } = library.tracks[index]
  const next: StoredTrack = { ...rest, ...meta }
  return touch(library.tracks.map((t, i) => (i === index ? next : t)), now)
}

export function removeTrack(library: Library, id: string, now: Date = new Date()): { library: Library; removed: StoredTrack } | null {
  const removed = library.tracks.find((t) => t.id === id)
  if (!removed) return null
  return { library: touch(library.tracks.filter((t) => t.id !== id), now), removed }
}

/** Chuyển bài tới vị trí `toIndex` (kẹp trong khoảng hợp lệ). */
export function moveTrack(library: Library, id: string, toIndex: number, now: Date = new Date()): Library | null {
  const from = library.tracks.findIndex((t) => t.id === id)
  if (from < 0 || !Number.isInteger(toIndex)) return null
  const tracks = [...library.tracks]
  const [item] = tracks.splice(from, 1)
  tracks.splice(Math.min(Math.max(0, toIndex), tracks.length), 0, item)
  return touch(tracks, now)
}

export function toPublicTrack(track: StoredTrack, url: string): PublicTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    license: track.license,
    ...(track.sourceDomain ? { sourceDomain: track.sourceDomain } : {}),
    originalFilename: track.originalFilename,
    url,
  }
}
