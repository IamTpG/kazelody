import {
  ALLOWED_AUDIO_TYPES,
  MAX_UPLOAD_BYTES,
  addTrack,
  extensionOf,
  isUuid,
  moveTrack,
  newTrackKey,
  parseTrackKey,
  removeTrack,
  toPublicTrack,
  updateTrack,
  validateMeta,
  type StoredTrack,
} from '../../shared/library.ts'
import { clean } from '../../shared/track.ts'
import {
  SESSION_COOKIE,
  checkPassword,
  clearSessionCookie,
  isSecure,
  readCookie,
  sameOrigin,
  sessionCookie,
  signSession,
  verifySession,
} from './auth.ts'
import { HttpError, handle, json, readJsonBody } from './http.ts'
import { readLibrary, writeLibrary, type Storage } from './storage.ts'

/** Công khai: chỉ cần kho lưu trữ. */
export type PublicDeps = {
  storage: Storage
  /** Thời hạn URL nghe nhạc (giây) */
  presignTtl: number
  now: () => Date
}

export type AdminDeps = PublicDeps & {
  adminPassword: string
  sessionSecret: string
  publicOrigin?: string
  randomId: () => string
  sleep: (ms: number) => Promise<void>
}

/** Kết quả này giống nhau cho mọi người nghe nên cho CDN giữ 5 phút: R2 và hàm hầu như không bị gọi dù đông người. */
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'
const UPLOAD_URL_TTL_SECONDS = 15 * 60
const FAILED_LOGIN_DELAY_MS = 1000
const MAX_FILENAME_LENGTH = 255

// ---------------------------------------------------------------------------------------------
// Công khai
// ---------------------------------------------------------------------------------------------

/** GET /api/tracks → danh sách bài kèm URL nghe đã ký. */
export function createTracksHandler(deps: PublicDeps) {
  return handle(async () => {
    const library = await readLibrary(deps.storage, deps.now())
    const tracks = await Promise.all(
      library.tracks.map(async (track) => toPublicTrack(track, await deps.storage.presignGet(track.key, deps.presignTtl))),
    )
    return json(
      { tracks, expiresAt: deps.now().getTime() + deps.presignTtl * 1000 },
      { headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } },
    )
  })
}

// ---------------------------------------------------------------------------------------------
// Quản trị
// ---------------------------------------------------------------------------------------------

function requireOrigin(request: Request, deps: AdminDeps): void {
  if (!sameOrigin(request, deps.publicOrigin)) throw new HttpError(403, 'Origin không hợp lệ')
}

/** Lệnh ghi phải đúng Origin; mọi lệnh đều phải có phiên hợp lệ. */
function requireAdmin(request: Request, deps: AdminDeps, options: { write: boolean }): void {
  if (options.write) requireOrigin(request, deps)
  if (!verifySession(deps.sessionSecret, readCookie(request, SESSION_COOKIE), deps.now().getTime())) {
    throw new HttpError(401, 'Chưa đăng nhập')
  }
}

function trackIdFromUrl(request: Request): string {
  const id = new URL(request.url).pathname.split('/').filter(Boolean).pop()
  if (!isUuid(id)) throw new HttpError(400, 'Id bài không hợp lệ')
  return id
}

export function createAdminHandlers(deps: AdminDeps) {
  return {
    /** POST /api/admin/login */
    login: handle(async (request) => {
      requireOrigin(request, deps)
      const body = await readJsonBody(request)
      const password = typeof body.password === 'string' ? body.password : ''
      if (!checkPassword(password, deps.adminPassword)) {
        await deps.sleep(FAILED_LOGIN_DELAY_MS)
        throw new HttpError(401, 'Mật khẩu không đúng')
      }
      const token = signSession(deps.sessionSecret, deps.now().getTime())
      return json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie(token, isSecure(request)) } })
    }),

    /** POST /api/admin/logout */
    logout: handle(async (request) => {
      requireOrigin(request, deps)
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(isSecure(request)) } })
    }),

    /** GET /api/admin/session */
    session: handle(async (request) => {
      requireAdmin(request, deps, { write: false })
      return json({ authenticated: true })
    }),

    /** POST /api/admin/upload-url {filename, size} → URL PUT ký sẵn để trình duyệt upload thẳng lên R2. */
    uploadUrl: handle(async (request) => {
      requireAdmin(request, deps, { write: true })
      const body = await readJsonBody(request)
      const filename = typeof body.filename === 'string' ? body.filename : ''
      const ext = extensionOf(filename)
      if (!ext) throw new HttpError(400, 'Chỉ nhận file nhạc: mp3, ogg, opus, m4a, webm, wav')
      const size = body.size
      if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) throw new HttpError(400, 'Dung lượng không hợp lệ')
      if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, `File quá lớn (tối đa ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`)

      const id = deps.randomId()
      const key = newTrackKey(id, ext)
      const contentType = ALLOWED_AUDIO_TYPES[ext]
      const uploadUrl = await deps.storage.presignPut(key, contentType, UPLOAD_URL_TTL_SECONDS)
      return json({
        id,
        key,
        contentType,
        uploadUrl,
        headers: { 'Content-Type': contentType },
        expiresAt: deps.now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000,
      })
    }),

    /** GET /api/admin/tracks → toàn bộ thư viện (không kèm URL ký). */
    list: handle(async (request) => {
      requireAdmin(request, deps, { write: false })
      return json(await readLibrary(deps.storage, deps.now()))
    }),

    /** POST /api/admin/tracks → ghi nhận một file đã upload vào thư viện (sau khi kiểm tra file thật sự có trên R2). */
    add: handle(async (request) => {
      requireAdmin(request, deps, { write: true })
      const body = await readJsonBody(request)

      const id = body.id
      const key = body.key
      if (!isUuid(id) || typeof key !== 'string') throw new HttpError(400, 'Thiếu id hoặc key')
      const parsedKey = parseTrackKey(key)
      if (!parsedKey || parsedKey.id !== id) throw new HttpError(400, 'Key không hợp lệ')

      const originalFilename = typeof body.originalFilename === 'string' ? clean(body.originalFilename) : ''
      if (!originalFilename || originalFilename.length > MAX_FILENAME_LENGTH) throw new HttpError(400, 'Tên file gốc không hợp lệ')
      const meta = validateMeta(body)
      if (!meta.ok) throw new HttpError(400, meta.error)

      const info = await deps.storage.head(key)
      if (!info) throw new HttpError(409, 'File chưa được upload lên R2')
      const expectedType = ALLOWED_AUDIO_TYPES[parsedKey.ext]
      // File sai quy định thì xoá luôn, để không để rác trong bucket.
      const reject = async (status: number, message: string): Promise<never> => {
        await deps.storage.delete(key).catch((error: unknown) => console.warn('[api] không xoá được file bị từ chối:', error))
        throw new HttpError(status, message)
      }
      if (info.size <= 0) await reject(400, 'File rỗng')
      if (info.size > MAX_UPLOAD_BYTES) await reject(413, 'File quá lớn')
      if (info.contentType.split(';')[0].trim().toLowerCase() !== expectedType) await reject(422, 'Loại file không khớp với đuôi file')

      const stored: StoredTrack = {
        id,
        key,
        ...meta.value,
        originalFilename,
        contentType: expectedType,
        size: info.size,
        addedAt: deps.now().toISOString(),
      }
      const library = await readLibrary(deps.storage, deps.now())
      const next = addTrack(library, stored, deps.now())
      if (!next) throw new HttpError(409, 'Bài này đã có trong thư viện')
      await writeLibrary(deps.storage, next)
      return json(stored, { status: 201 })
    }),

    /** PATCH /api/admin/tracks/:id {title?, artist?, license?, sourceDomain?, moveTo?} */
    patch: handle(async (request) => {
      requireAdmin(request, deps, { write: true })
      const id = trackIdFromUrl(request)
      const body = await readJsonBody(request)
      const metaKeys = ['title', 'artist', 'license', 'sourceDomain'] as const
      const editsMeta = metaKeys.some((name) => name in body)
      const editsOrder = 'moveTo' in body
      if (!editsMeta && !editsOrder) throw new HttpError(400, 'Không có gì để sửa')

      let library = await readLibrary(deps.storage, deps.now())
      const current = library.tracks.find((track) => track.id === id)
      if (!current) throw new HttpError(404, 'Không tìm thấy bài')

      if (editsMeta) {
        const merged = {
          title: 'title' in body ? body.title : current.title,
          artist: 'artist' in body ? body.artist : current.artist,
          license: 'license' in body ? body.license : current.license,
          sourceDomain: 'sourceDomain' in body ? body.sourceDomain : current.sourceDomain,
        }
        const meta = validateMeta(merged)
        if (!meta.ok) throw new HttpError(400, meta.error)
        library = updateTrack(library, id, meta.value, deps.now())!
      }
      if (editsOrder) {
        const moved = moveTrack(library, id, body.moveTo as number, deps.now())
        if (!moved) throw new HttpError(400, 'moveTo phải là số nguyên')
        library = moved
      }
      await writeLibrary(deps.storage, library)
      return json(library.tracks.find((track) => track.id === id))
    }),

    /** DELETE /api/admin/tracks/:id → bỏ khỏi thư viện trước, rồi mới xoá file. */
    remove: handle(async (request) => {
      requireAdmin(request, deps, { write: true })
      const id = trackIdFromUrl(request)
      const result = removeTrack(await readLibrary(deps.storage, deps.now()), id, deps.now())
      if (!result) throw new HttpError(404, 'Không tìm thấy bài')
      await writeLibrary(deps.storage, result.library)
      // Xoá file hỏng thì chỉ để lại một object mồ côi, không ảnh hưởng người nghe: ghi log rồi vẫn báo thành công.
      await deps.storage.delete(result.removed.key).catch((error: unknown) => console.warn('[api] không xoá được file của bài đã gỡ:', error))
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    }),
  }
}
