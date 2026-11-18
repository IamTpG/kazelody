import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { MAX_UPLOAD_BYTES, newTrackKey, validateLibrary, type Library, type StoredTrack } from '../../shared/library.ts'
import { createAdminHandlers, createTracksHandler, type AdminDeps } from './handlers.ts'
import { MemoryStorage } from './memory-storage.ts'
import { ConfigError } from './env.ts'
import { handle } from './http.ts'
import { LIBRARY_KEY } from './storage.ts'

const SITE = 'https://kazelody.test'
const PASSWORD = 'mat-khau-manh-1'
const SECRET = 'x'.repeat(40)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let storage: MemoryStorage
let nowMs: number
let sleeps: number[]
let nextId: number
let deps: AdminDeps
let api: ReturnType<typeof createAdminHandlers>

beforeEach(() => {
  storage = new MemoryStorage()
  nowMs = Date.parse('2026-11-18T10:00:00Z')
  sleeps = []
  nextId = 100
  deps = {
    storage,
    presignTtl: 10_800,
    now: () => new Date(nowMs),
    adminPassword: PASSWORD,
    sessionSecret: SECRET,
    randomId: () => id(nextId++),
    sleep: async (ms) => void sleeps.push(ms),
  }
  api = createAdminHandlers(deps)
})

type Options = { body?: unknown; cookie?: string | null; origin?: string | null; contentType?: string | null; rawBody?: string }

function req(method: string, path: string, options: Options = {}): Request {
  const headers: Record<string, string> = {}
  if (options.origin !== null && method !== 'GET') headers.origin = options.origin ?? SITE
  if (options.cookie) headers.cookie = options.cookie
  const hasBody = options.body !== undefined || options.rawBody !== undefined
  if (hasBody && options.contentType !== null) headers['content-type'] = options.contentType ?? 'application/json'
  return new Request(SITE + path, {
    method,
    headers,
    ...(hasBody ? { body: options.rawBody ?? JSON.stringify(options.body) } : {}),
  })
}

async function login(): Promise<string> {
  const response = await api.login(req('POST', '/api/admin/login', { body: { password: PASSWORD } }))
  assert.equal(response.status, 200)
  return response.headers.get('set-cookie')!.split(';')[0]
}

const read = async (response: Response) => (await response.json()) as Record<string, unknown>

function seedLibrary(...tracks: StoredTrack[]): void {
  const library: Library = { version: 1, updatedAt: '2026-11-18T09:00:00.000Z', tracks }
  void storage.putJson(LIBRARY_KEY, library)
}

function stored(n: number, patch: Partial<StoredTrack> = {}): StoredTrack {
  return {
    id: id(n),
    key: newTrackKey(id(n), 'mp3'),
    title: `Title ${n}`,
    artist: `Artist ${n}`,
    license: 'CC-BY-4.0',
    originalFilename: `a${n}.mp3`,
    contentType: 'audio/mpeg',
    size: 5000,
    addedAt: '2026-11-18T09:00:00.000Z',
    ...patch,
  }
}

async function savedLibrary(): Promise<Library> {
  const library = validateLibrary(await storage.getJson(LIBRARY_KEY))
  assert.ok(library, 'tracks.json phải hợp lệ')
  return library
}

// ---------------------------------------------------------------------------------------------
// GET /api/tracks
// ---------------------------------------------------------------------------------------------

test('tracks: chưa có tracks.json thì trả danh sách rỗng', async () => {
  const response = await createTracksHandler(deps)(req('GET', '/api/tracks'))
  assert.equal(response.status, 200)
  const body = await read(response)
  assert.deepEqual(body.tracks, [])
  assert.equal(typeof body.expiresAt, 'number')
})

test('tracks: có URL ký ứng với từng bài, chỉ lộ metadata công khai, CDN giữ 5 phút', async () => {
  seedLibrary(stored(1, { sourceDomain: 'x.com' }), stored(2, { license: 'CC0' }))
  const response = await createTracksHandler(deps)(req('GET', '/api/tracks'))
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=300, stale-while-revalidate=600')
  const body = (await response.json()) as { tracks: Record<string, unknown>[]; expiresAt: number }
  assert.equal(body.tracks.length, 2)
  assert.equal(body.tracks[0].url, `https://r2.test/${newTrackKey(id(1), 'mp3')}?op=get&expires=10800`)
  assert.equal(body.expiresAt, nowMs + 10_800_000)
  for (const track of body.tracks) {
    assert.ok(!('key' in track) && !('size' in track) && !('addedAt' in track) && !('contentType' in track))
  }
  assert.equal(body.tracks[1].title, 'Title 2')
})

test('tracks: tracks.json hỏng thì báo lỗi 500 chung chung và KHÔNG ghi đè file', async () => {
  await storage.putJson(LIBRARY_KEY, { version: 1, updatedAt: 'x', tracks: [{ id: 'bậy' }] })
  const before = JSON.stringify(await storage.getJson(LIBRARY_KEY))
  const silence = console.error
  console.error = () => {}
  try {
    const response = await createTracksHandler(deps)(req('GET', '/api/tracks'))
    assert.equal(response.status, 500)
    assert.ok(!JSON.stringify(await response.json()).includes('tracks.json'), 'không lộ chi tiết nội bộ')
  } finally {
    console.error = silence
  }
  assert.equal(JSON.stringify(await storage.getJson(LIBRARY_KEY)), before)
})

test('handle: thiếu cấu hình → 503 chung chung, không lộ tên biến môi trường', async () => {
  const silence = console.error
  console.error = () => {}
  try {
    const response = await handle(() => {
      throw new ConfigError('Thiếu biến môi trường: R2_SECRET_ACCESS_KEY')
    })(req('GET', '/api/tracks'))
    assert.equal(response.status, 503)
    const text = JSON.stringify(await response.json())
    assert.ok(!text.includes('R2_SECRET_ACCESS_KEY'))
  } finally {
    console.error = silence
  }
})

// ---------------------------------------------------------------------------------------------
// Đăng nhập / phiên
// ---------------------------------------------------------------------------------------------

test('login: đúng mật khẩu → cookie phiên HttpOnly + SameSite=Strict, phiên dùng được', async () => {
  const response = await api.login(req('POST', '/api/admin/login', { body: { password: PASSWORD } }))
  assert.equal(response.status, 200)
  const setCookie = response.headers.get('set-cookie')!
  assert.match(setCookie, /^kz_session=/)
  assert.ok(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict') && setCookie.includes('Secure'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await api.session(req('GET', '/api/admin/session', { cookie: await login() }))).status, 200)
  assert.deepEqual(sleeps, [])
})

test('login: sai mật khẩu → 401, bị làm chậm, không có cookie', async () => {
  for (const password of ['sai', '', undefined, 123]) {
    const response = await api.login(req('POST', '/api/admin/login', { body: { password } }))
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
  }
  assert.deepEqual(sleeps, [1000, 1000, 1000, 1000])
})

test('login: sai Origin → 403, sai Content-Type → 415, JSON hỏng → 400', async () => {
  assert.equal((await api.login(req('POST', '/api/admin/login', { body: { password: PASSWORD }, origin: 'https://evil.test' }))).status, 403)
  assert.equal((await api.login(req('POST', '/api/admin/login', { body: { password: PASSWORD }, origin: null }))).status, 403)
  assert.equal((await api.login(req('POST', '/api/admin/login', { rawBody: 'password=x', contentType: 'text/plain' }))).status, 415)
  assert.equal((await api.login(req('POST', '/api/admin/login', { rawBody: '{không phải json' }))).status, 400)
  assert.equal((await api.login(req('POST', '/api/admin/login', { rawBody: '[1,2]' }))).status, 400)
  assert.deepEqual(sleeps, [], 'lỗi định dạng không phải lần thử mật khẩu')
})

test('session: không cookie, cookie sai chữ ký, cookie hết hạn → 401', async () => {
  const cookie = await login()
  assert.equal((await api.session(req('GET', '/api/admin/session'))).status, 401)
  assert.equal((await api.session(req('GET', '/api/admin/session', { cookie: cookie.slice(0, -3) + 'abc' }))).status, 401)
  nowMs += 8 * 24 * 3600 * 1000
  assert.equal((await api.session(req('GET', '/api/admin/session', { cookie }))).status, 401)
})

test('logout: xoá cookie (Max-Age=0), cần đúng Origin', async () => {
  const response = await api.logout(req('POST', '/api/admin/logout'))
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('set-cookie')!.includes('Max-Age=0'))
  assert.equal((await api.logout(req('POST', '/api/admin/logout', { origin: 'https://evil.test' }))).status, 403)
})

// ---------------------------------------------------------------------------------------------
// Chặn truy cập
// ---------------------------------------------------------------------------------------------

test('mọi endpoint quản trị đều từ chối khi chưa đăng nhập (401)', async () => {
  const track = `/api/admin/tracks/${id(1)}`
  const calls: [string, Response][] = [
    ['list', await api.list(req('GET', '/api/admin/tracks'))],
    ['uploadUrl', await api.uploadUrl(req('POST', '/api/admin/upload-url', { body: { filename: 'a.mp3', size: 10 } }))],
    ['add', await api.add(req('POST', '/api/admin/tracks', { body: {} }))],
    ['patch', await api.patch(req('PATCH', track, { body: { title: 'x' } }))],
    ['remove', await api.remove(req('DELETE', track))],
  ]
  for (const [name, response] of calls) assert.equal(response.status, 401, name)
  assert.equal(storage.objects.size, 0, 'không ghi gì')
})

test('lệnh ghi bị từ chối khi sai Origin hoặc thiếu Origin (403), dù đã đăng nhập', async () => {
  const cookie = await login()
  const track = `/api/admin/tracks/${id(1)}`
  seedLibrary(stored(1))
  for (const origin of ['https://evil.test', null]) {
    assert.equal((await api.uploadUrl(req('POST', '/api/admin/upload-url', { cookie, origin, body: { filename: 'a.mp3', size: 10 } }))).status, 403)
    assert.equal((await api.add(req('POST', '/api/admin/tracks', { cookie, origin, body: {} }))).status, 403)
    assert.equal((await api.patch(req('PATCH', track, { cookie, origin, body: { title: 'x' } }))).status, 403)
    assert.equal((await api.remove(req('DELETE', track, { cookie, origin }))).status, 403)
  }
  assert.equal((await savedLibrary()).tracks.length, 1)
})

// ---------------------------------------------------------------------------------------------
// upload-url
// ---------------------------------------------------------------------------------------------

test('upload-url: tạo id, key chuẩn và URL PUT ký kèm Content-Type', async () => {
  const cookie = await login()
  const response = await api.uploadUrl(req('POST', '/api/admin/upload-url', { cookie, body: { filename: 'Song Name.MP3', size: 5_000_000 } }))
  assert.equal(response.status, 200)
  const body = await read(response)
  assert.equal(body.id, id(100))
  assert.equal(body.key, `audio/${id(100)}.mp3`)
  assert.equal(body.contentType, 'audio/mpeg')
  assert.deepEqual(body.headers, { 'Content-Type': 'audio/mpeg' })
  assert.equal(body.uploadUrl, `https://r2.test/audio/${id(100)}.mp3?op=put&type=audio%2Fmpeg&expires=900`)
})

test('upload-url: từ chối đuôi lạ, dung lượng sai hoặc quá lớn', async () => {
  const cookie = await login()
  const call = (body: unknown) => api.uploadUrl(req('POST', '/api/admin/upload-url', { cookie, body }))
  assert.equal((await call({ filename: 'virus.exe', size: 10 })).status, 400)
  assert.equal((await call({ filename: 'a.mp3.exe', size: 10 })).status, 400)
  assert.equal((await call({ filename: 5, size: 10 })).status, 400)
  assert.equal((await call({ filename: 'a.mp3', size: 0 })).status, 400)
  assert.equal((await call({ filename: 'a.mp3', size: -5 })).status, 400)
  assert.equal((await call({ filename: 'a.mp3', size: 1.5 })).status, 400)
  assert.equal((await call({ filename: 'a.mp3', size: '10' })).status, 400)
  assert.equal((await call({ filename: 'a.mp3', size: MAX_UPLOAD_BYTES + 1 })).status, 413)
  assert.equal((await call({ filename: 'a.mp3', size: MAX_UPLOAD_BYTES })).status, 200)
})

// ---------------------------------------------------------------------------------------------
// Thêm bài
// ---------------------------------------------------------------------------------------------

const META = { title: '  Quiet   Hills ', artist: 'Aria North', license: 'cc-by-4.0', sourceDomain: 'www.Example.com' }

function addBody(n: number, extra: Record<string, unknown> = {}) {
  return { id: id(n), key: newTrackKey(id(n), 'mp3'), originalFilename: 'Aria North__Quiet Hills__CC-BY-4.0.mp3', ...META, ...extra }
}

test('add: file đã upload → vào thư viện, chuẩn hoá metadata, ghi tracks.json', async () => {
  const cookie = await login()
  storage.seed(newTrackKey(id(1), 'mp3'), { size: 5_285_376, contentType: 'audio/mpeg' })
  const response = await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1) }))
  assert.equal(response.status, 201)
  const track = (await read(response)) as unknown as StoredTrack
  assert.equal(track.title, 'Quiet Hills')
  assert.equal(track.license, 'CC-BY-4.0')
  assert.equal(track.sourceDomain, 'example.com')
  assert.equal(track.size, 5_285_376)
  assert.equal(track.addedAt, '2026-11-18T10:00:00.000Z')
  const library = await savedLibrary()
  assert.deepEqual(library.tracks.map((t) => t.id), [id(1)])
  assert.deepEqual(storage.deleted, [])
})

test('add: nhiều bài được thêm theo thứ tự', async () => {
  const cookie = await login()
  for (const n of [1, 2, 3]) {
    storage.seed(newTrackKey(id(n), 'mp3'), { size: 100, contentType: 'audio/mpeg' })
    assert.equal((await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(n) }))).status, 201)
  }
  assert.deepEqual((await savedLibrary()).tracks.map((t) => t.id), [id(1), id(2), id(3)])
})

test('add: file chưa upload → 409, không ghi gì', async () => {
  const cookie = await login()
  const response = await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1) }))
  assert.equal(response.status, 409)
  assert.equal(await storage.getJson(LIBRARY_KEY), null)
})

test('add: key lạ (thoát thư mục, sai đuôi, lệch id) bị từ chối ngay, không đụng tới R2', async () => {
  const cookie = await login()
  const call = (extra: Record<string, unknown>) => api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1, extra) }))
  assert.equal((await call({ key: 'audio/../tracks.json' })).status, 400)
  assert.equal((await call({ key: 'tracks.json' })).status, 400)
  assert.equal((await call({ key: `audio/${id(1)}.exe` })).status, 400)
  assert.equal((await call({ key: newTrackKey(id(2), 'mp3') })).status, 400, 'key của bài khác')
  assert.equal((await call({ id: 'không-phải-uuid' })).status, 400)
  assert.deepEqual(storage.deleted, [])
})

test('add: metadata sai → 400', async () => {
  const cookie = await login()
  storage.seed(newTrackKey(id(1), 'mp3'), { size: 100, contentType: 'audio/mpeg' })
  const call = (extra: Record<string, unknown>) => api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1, extra) }))
  assert.equal((await call({ title: '' })).status, 400)
  assert.equal((await call({ license: 'MIT' })).status, 400)
  assert.equal((await call({ sourceDomain: 'không phải domain' })).status, 400)
  assert.equal((await call({ originalFilename: '' })).status, 400)
  assert.equal((await call({ originalFilename: 'x'.repeat(300) })).status, 400)
})

test('add: file quá lớn, rỗng hoặc sai loại bị từ chối VÀ xoá khỏi R2', async () => {
  const cookie = await login()
  const cases: [number, { size: number; contentType: string }, number][] = [
    [1, { size: MAX_UPLOAD_BYTES + 1, contentType: 'audio/mpeg' }, 413],
    [2, { size: 0, contentType: 'audio/mpeg' }, 400],
    [3, { size: 100, contentType: 'text/html' }, 422],
    [4, { size: 100, contentType: 'binary/octet-stream' }, 422],
  ]
  for (const [n, info, status] of cases) {
    storage.seed(newTrackKey(id(n), 'mp3'), info)
    const response = await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(n) }))
    assert.equal(response.status, status, `bài ${n}`)
    assert.equal(await storage.head(newTrackKey(id(n), 'mp3')), null, `bài ${n} phải bị xoá`)
  }
  assert.equal(await storage.getJson(LIBRARY_KEY), null)
})

test('add: content-type có tham số (audio/mpeg; charset) vẫn được chấp nhận', async () => {
  const cookie = await login()
  storage.seed(newTrackKey(id(1), 'mp3'), { size: 100, contentType: 'Audio/MPEG; foo=bar' })
  assert.equal((await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1) }))).status, 201)
})

test('add: thêm trùng id → 409 và không lặp trong thư viện', async () => {
  const cookie = await login()
  storage.seed(newTrackKey(id(1), 'mp3'), { size: 100, contentType: 'audio/mpeg' })
  assert.equal((await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1) }))).status, 201)
  assert.equal((await api.add(req('POST', '/api/admin/tracks', { cookie, body: addBody(1) }))).status, 409)
  assert.equal((await savedLibrary()).tracks.length, 1)
})

// ---------------------------------------------------------------------------------------------
// Danh sách / sửa / xoá
// ---------------------------------------------------------------------------------------------

test('list: trả toàn bộ thư viện (kể cả khoá R2 cho admin)', async () => {
  const cookie = await login()
  seedLibrary(stored(1), stored(2))
  const body = (await read(await api.list(req('GET', '/api/admin/tracks', { cookie })))) as unknown as Library
  assert.deepEqual(body.tracks.map((t) => t.id), [id(1), id(2)])
  assert.equal(body.tracks[0].key, newTrackKey(id(1), 'mp3'))
})

test('patch: sửa metadata, giữ nguyên phần còn lại; nguồn bỏ trống thì bị xoá', async () => {
  const cookie = await login()
  seedLibrary(stored(1, { sourceDomain: 'old.com' }), stored(2))
  const url = `/api/admin/tracks/${id(1)}`
  const response = await api.patch(req('PATCH', url, { cookie, body: { title: 'Tên mới', license: 'cc0', sourceDomain: '' } }))
  assert.equal(response.status, 200)
  const track = (await read(response)) as unknown as StoredTrack
  assert.equal(track.title, 'Tên mới')
  assert.equal(track.artist, 'Artist 1')
  assert.equal(track.license, 'CC0')
  assert.ok(!('sourceDomain' in track))
  assert.equal(track.key, newTrackKey(id(1), 'mp3'))
  assert.equal((await savedLibrary()).tracks[1].title, 'Title 2', 'bài khác không đổi')
})

test('patch: chuyển vị trí', async () => {
  const cookie = await login()
  seedLibrary(stored(1), stored(2), stored(3))
  const response = await api.patch(req('PATCH', `/api/admin/tracks/${id(3)}`, { cookie, body: { moveTo: 0 } }))
  assert.equal(response.status, 200)
  assert.deepEqual((await savedLibrary()).tracks.map((t) => t.id), [id(3), id(1), id(2)])
})

test('patch: dữ liệu sai → 400, bài lạ → 404, id sai → 400, không ghi gì', async () => {
  const cookie = await login()
  seedLibrary(stored(1))
  const before = JSON.stringify(await storage.getJson(LIBRARY_KEY))
  const call = (path: string, body: unknown) => api.patch(req('PATCH', path, { cookie, body }))
  const url = `/api/admin/tracks/${id(1)}`
  assert.equal((await call(url, {})).status, 400)
  assert.equal((await call(url, { title: '' })).status, 400)
  assert.equal((await call(url, { license: 'MIT' })).status, 400)
  assert.equal((await call(url, { sourceDomain: 'x' })).status, 400)
  assert.equal((await call(url, { moveTo: 'đầu' })).status, 400)
  assert.equal((await call(url, { moveTo: 1.5 })).status, 400)
  assert.equal((await call(`/api/admin/tracks/${id(9)}`, { title: 'A' })).status, 404)
  assert.equal((await call('/api/admin/tracks/không-phải-uuid', { title: 'A' })).status, 400)
  assert.equal(JSON.stringify(await storage.getJson(LIBRARY_KEY)), before)
})

test('remove: gỡ khỏi thư viện rồi xoá file trên R2', async () => {
  const cookie = await login()
  seedLibrary(stored(1), stored(2))
  storage.seed(newTrackKey(id(1), 'mp3'), { size: 100, contentType: 'audio/mpeg' })
  const response = await api.remove(req('DELETE', `/api/admin/tracks/${id(1)}`, { cookie }))
  assert.equal(response.status, 204)
  assert.deepEqual((await savedLibrary()).tracks.map((t) => t.id), [id(2)])
  assert.deepEqual(storage.deleted, [newTrackKey(id(1), 'mp3')])
})

test('remove: bài lạ → 404; xoá file lỗi vẫn báo thành công vì thư viện đã cập nhật', async () => {
  const cookie = await login()
  seedLibrary(stored(1))
  assert.equal((await api.remove(req('DELETE', `/api/admin/tracks/${id(9)}`, { cookie }))).status, 404)
  storage.failDelete = true
  const silence = console.warn
  console.warn = () => {}
  try {
    assert.equal((await api.remove(req('DELETE', `/api/admin/tracks/${id(1)}`, { cookie }))).status, 204)
  } finally {
    console.warn = silence
  }
  assert.deepEqual((await savedLibrary()).tracks, [])
})
