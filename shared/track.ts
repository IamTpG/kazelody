/*
 * Mô hình bài hát, bảng license và bộ phân tích tên file.
 * Không dùng DOM hay API riêng của Node: `src/`, `tools/` và (sau này) `api/` đều import file này.
 *
 * Quy tắc tên file:  Artist__Title__License[__nguon].ext
 *   - Phân cách là hai dấu gạch dưới. Gạch nối, ngoặc vuông, dấu nháy, tiếng Việt/Nhật… trong tên bài đều dùng được.
 *   - License lấy từ `LICENSES` (CC-BY bắt buộc có phiên bản). Nguồn là tên miền, có thể bỏ.
 */

import { isDuration } from './time.ts'

export type LicenseId = 'CC0' | 'CC-BY-4.0' | 'CC-BY-3.0' | 'CC-BY-2.0'

export type License = {
  id: LicenseId
  /** Tên hiển thị đầy đủ */
  name: string
  url: string
  /** CC-BY bắt buộc ghi công tác giả; CC0 thì không */
  attributionRequired: boolean
}

/** Thêm license mới chỉ cần thêm một dòng (và một mục trong `LicenseId`). */
export const LICENSES: Record<LicenseId, License> = {
  CC0: {
    id: 'CC0',
    name: 'CC0 1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionRequired: false,
  },
  'CC-BY-4.0': {
    id: 'CC-BY-4.0',
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    attributionRequired: true,
  },
  'CC-BY-3.0': {
    id: 'CC-BY-3.0',
    name: 'CC BY 3.0',
    url: 'https://creativecommons.org/licenses/by/3.0/',
    attributionRequired: true,
  },
  'CC-BY-2.0': {
    id: 'CC-BY-2.0',
    name: 'CC BY 2.0',
    url: 'https://creativecommons.org/licenses/by/2.0/',
    attributionRequired: true,
  },
}

export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'opus', 'm4a', 'webm', 'wav'] as const

/** Một bài hát đã sẵn sàng để phát. */
export type Track = {
  /** Ổn định và an toàn cho URL; không bao giờ suy ra từ tiêu đề */
  id: string
  title: string
  artist: string
  /** URL phát được (có thể được `MusicSource.resolve` đổi lại, vd. presigned URL) */
  url: string
  /** Id của `MusicSource` đã cấp bài này */
  source: string
  /** Tên miền nơi lấy bài (chỉ để lưu trữ, không hiển thị) */
  sourceDomain?: string
  license: LicenseId
  originalFilename: string
  /** Thời lượng (giây). Có thể thiếu: bài chưa được đo, hoặc nguồn không biết */
  duration?: number
}

/** Dòng trong `tracks.json` (chưa có `url`). */
export type TrackManifestEntry = {
  id: string
  filename: string
  title: string
  artist: string
  license: LicenseId
  sourceDomain?: string
  duration?: number
}

export type TrackManifest = {
  version: 1
  tracks: TrackManifestEntry[]
}

export type ParsedFilename = {
  title: string
  artist: string
  license: LicenseId
  sourceDomain?: string
}

export type ParseResult = { ok: true; value: ParsedFilename } | { ok: false; error: string }

const DELIMITER = '__'
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/
const EXTENSION = new RegExp(`\\.(${AUDIO_EXTENSIONS.join('|')})$`, 'i')
const LICENSE_ALIASES: Record<string, LicenseId> = { 'CC0-1.0': 'CC0' }

/** NFC (macOS hay lưu NFD), gộp khoảng trắng, cắt hai đầu. */
export function clean(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim()
}

export function parseLicense(raw: string): { ok: true; value: LicenseId } | { ok: false; error: string } {
  const key = raw.trim().toUpperCase()
  const id = LICENSE_ALIASES[key] ?? (Object.hasOwn(LICENSES, key) ? (key as LicenseId) : undefined)
  if (id) return { ok: true, value: id }
  const valid = Object.keys(LICENSES).join(', ')
  if (/^CC-BY$/.test(key)) return { ok: false, error: `CC-BY cần ghi phiên bản (một trong: ${valid})` }
  return { ok: false, error: `License "${raw}" không được chấp nhận (chỉ nhận: ${valid})` }
}

export function parseSourceDomain(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const domain = raw.trim().toLowerCase().replace(/^www\./, '')
  if (DOMAIN.test(domain)) return { ok: true, value: domain }
  return { ok: false, error: `Nguồn "${raw}" phải là tên miền, vd. freemusicarchive.org` }
}

/** Tách `Artist__Title__License[__nguon].ext`. Không bao giờ throw. */
export function parseTrackFilename(filename: string): ParseResult {
  const stem = clean(filename).replace(EXTENSION, '')
  const parts = stem.split(DELIMITER).map(clean)
  if (parts.length < 3) {
    return { ok: false, error: 'Cần dạng Artist__Title__License[__nguon] (phân cách bằng hai dấu gạch dưới)' }
  }
  if (parts.length > 4) {
    return { ok: false, error: `Có ${parts.length - 1} chỗ "__", nhiều hơn mức cho phép (tên bài hoặc tác giả có chứa "__"?)` }
  }
  const [artist, title, licenseRaw, sourceRaw] = parts
  if (!artist) return { ok: false, error: 'Thiếu tên tác giả' }
  if (!title) return { ok: false, error: 'Thiếu tên bài' }

  const license = parseLicense(licenseRaw)
  if (!license.ok) return license

  let sourceDomain: string | undefined
  if (sourceRaw) {
    const source = parseSourceDomain(sourceRaw)
    if (!source.ok) return source
    sourceDomain = source.value
  }
  return { ok: true, value: { title, artist, license: license.value, sourceDomain } }
}

/** cyrb53 → chuỗi base36. Không phải mật mã, chỉ cần ổn định và đủ ít trùng cho vài trăm bài. */
export function trackId(filename: string): string {
  const text = clean(filename)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

type Displayable = Pick<Track, 'title' | 'artist' | 'license'>

/** Cái người dùng được thấy: CC0 chỉ tên bài; CC-BY thêm tác giả. Mọi thứ khác chỉ lưu trữ. */
export function displayParts(track: Displayable): { title: string; artist: string | null } {
  return { title: track.title, artist: LICENSES[track.license].attributionRequired ? track.artist : null }
}

export function displayLabel(track: Displayable): string {
  const { title, artist } = displayParts(track)
  return artist ? `${title} — ${artist}` : title
}

/** Kiểm tra một dòng đọc từ `tracks.json` (dữ liệu từ ngoài, không tin kiểu). */
export function isManifestEntry(value: unknown): value is TrackManifestEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.filename === 'string' &&
    typeof e.title === 'string' &&
    typeof e.artist === 'string' &&
    typeof e.license === 'string' &&
    Object.hasOwn(LICENSES, e.license) &&
    (e.sourceDomain === undefined || typeof e.sourceDomain === 'string') &&
    (e.duration === undefined || isDuration(e.duration))
  )
}
