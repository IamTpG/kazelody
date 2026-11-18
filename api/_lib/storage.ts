import { emptyLibrary, validateLibrary, type Library } from '../../shared/library.ts'

/** Khoá của thư viện nhạc trong bucket. */
export const LIBRARY_KEY = 'tracks.json'

export type ObjectInfo = { size: number; contentType: string }

/**
 * Chỗ cất file và thư viện nhạc. Bản thật là R2 (r2.ts); test dùng bản trong bộ nhớ (memory-storage.ts).
 * Các URL ký trả về dùng được thẳng từ trình duyệt, không cần thông tin đăng nhập.
 */
export interface Storage {
  /** Nội dung JSON, hoặc null nếu object chưa có. */
  getJson(key: string): Promise<unknown>
  putJson(key: string, value: unknown): Promise<void>
  /** Upload từ phía máy chủ/máy dev (công cụ push-tracks). Trình duyệt thì dùng presignPut. */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** Thông tin object, hoặc null nếu chưa có. */
  head(key: string): Promise<ObjectInfo | null>
  delete(key: string): Promise<void>
  presignGet(key: string, expiresInSeconds: number): Promise<string>
  /** URL PUT đã ký kèm Content-Type: trình duyệt phải gửi đúng header này. */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>
}

export class LibraryCorruptError extends Error {
  constructor() {
    super('tracks.json hỏng hoặc sai định dạng: dừng lại thay vì ghi đè để không làm mất bài')
    this.name = 'LibraryCorruptError'
  }
}

/** Chưa có tracks.json thì coi là thư viện rỗng; có mà sai định dạng thì báo lỗi, tuyệt đối không âm thầm ghi đè. */
export async function readLibrary(storage: Storage, now: Date = new Date()): Promise<Library> {
  const raw = await storage.getJson(LIBRARY_KEY)
  if (raw === null || raw === undefined) return emptyLibrary(now)
  const library = validateLibrary(raw)
  if (!library) throw new LibraryCorruptError()
  return library
}

export function writeLibrary(storage: Storage, library: Library): Promise<void> {
  return storage.putJson(LIBRARY_KEY, library)
}
