import {
  validateLibrary,
  validateStoredTrack,
  type Library,
  type StoredTrack,
} from '../../shared/library.ts'

/** Dữ liệu metadata người dùng nhập (chưa kiểm tra): server và `validateMeta` sẽ kiểm tra. */
export type MetaInput = { title: string; artist: string; license: string; sourceDomain?: string }

export type RegisterInput = MetaInput & { id: string; key: string; originalFilename: string; duration?: number }

/** Phiếu upload: URL PUT ký sẵn và header bắt buộc phải gửi kèm. */
export type UploadTicket = {
  id: string
  key: string
  contentType: string
  uploadUrl: string
  headers: Record<string, string>
}

/** `status` 0 nghĩa là không nói chuyện được với API (mạng đứt, hoặc đường dẫn trả HTML vì không có `api/`). */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type Options = {
  fetchFn?: (input: string, init?: RequestInit) => Promise<Response>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function messageOf(data: unknown, status: number): string {
  if (isRecord(data) && typeof data.error === 'string') return data.error
  return `Lỗi máy chủ (HTTP ${status})`
}

function isTicket(value: unknown): value is UploadTicket {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    typeof value.contentType === 'string' &&
    typeof value.uploadUrl === 'string' &&
    isRecord(value.headers) &&
    Object.values(value.headers).every((header) => typeof header === 'string')
  )
}

/** Gọi các endpoint /api/admin/*. Cookie phiên đi kèm tự động (cùng origin); lỗi luôn là ApiError. */
export function createAdminApi(options: Options = {}) {
  const fetchFn = options.fetchFn ?? ((input: string, init?: RequestInit) => fetch(input, init))

  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    let response: Response
    try {
      response = await fetchFn(path, {
        method,
        credentials: 'same-origin',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
    } catch {
      throw new ApiError(0, 'Không kết nối được máy chủ')
    }
    if (response.status === 204) return null

    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('application/json')) {
      // Không có api/ (vd. `npm run dev`): GET bị Vite trả index.html với mã 200, còn POST/PATCH/DELETE thì 404 hoặc 405.
      const apiMissing = response.ok || response.status === 404 || response.status === 405
      throw apiMissing
        ? new ApiError(0, 'Máy chủ không có API quản trị (chạy `npm run dev:admin` hoặc `vercel dev`)')
        : new ApiError(response.status, `Lỗi máy chủ (HTTP ${response.status})`)
    }
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(response.status, messageOf(data, response.status))
    return data
  }

  return {
    /** true nếu đã đăng nhập, false nếu chưa; lỗi khác (503, mạng…) thì ném ra. */
    async session(): Promise<boolean> {
      try {
        await call('GET', '/api/admin/session')
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return false
        throw error
      }
    },

    async login(password: string): Promise<void> {
      await call('POST', '/api/admin/login', { password })
    },

    async logout(): Promise<void> {
      await call('POST', '/api/admin/logout', {})
    },

    async library(): Promise<Library> {
      const library = validateLibrary(await call('GET', '/api/admin/tracks'))
      if (!library) throw new ApiError(0, 'Dữ liệu thư viện từ máy chủ không hợp lệ')
      return library
    },

    async requestUpload(input: { filename: string; size: number }): Promise<UploadTicket> {
      const data = await call('POST', '/api/admin/upload-url', input)
      if (!isTicket(data)) throw new ApiError(0, 'Phản hồi xin URL upload không hợp lệ')
      return data
    },

    async register(input: RegisterInput): Promise<StoredTrack> {
      const track = validateStoredTrack(await call('POST', '/api/admin/tracks', input))
      if (!track) throw new ApiError(0, 'Phản hồi khi thêm bài không hợp lệ')
      return track
    },

    async update(id: string, patch: Partial<MetaInput> | { moveTo: number }): Promise<StoredTrack> {
      const track = validateStoredTrack(await call('PATCH', `/api/admin/tracks/${id}`, patch))
      if (!track) throw new ApiError(0, 'Phản hồi khi sửa bài không hợp lệ')
      return track
    },

    async remove(id: string): Promise<void> {
      await call('DELETE', `/api/admin/tracks/${id}`)
    },
  }
}

export type AdminApi = ReturnType<typeof createAdminApi>

export const adminApi: AdminApi = createAdminApi()
