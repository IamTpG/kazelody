import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newTrackKey, type StoredTrack } from '../../shared/library.ts'
import { ApiError, createAdminApi } from './api.ts'

const ID = '00000000-0000-4000-8000-000000000001'
const track: StoredTrack = {
  id: ID,
  key: newTrackKey(ID, 'mp3'),
  title: 'Quiet Hills',
  artist: 'Aria North',
  license: 'CC-BY-4.0',
  originalFilename: 'a.mp3',
  contentType: 'audio/mpeg',
  size: 5000,
  addedAt: '2026-11-18T09:00:00.000Z',
}
const library = { version: 1, updatedAt: '2026-11-18T09:00:00.000Z', tracks: [track] }

type Call = { path: string; method?: string; headers?: unknown; body?: string; credentials?: string }

function fake(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchFn = async (path: string, init?: RequestInit) => {
    const call: Call = { path, method: init?.method, headers: init?.headers, body: init?.body as string | undefined, credentials: init?.credentials }
    calls.push(call)
    return respond(call)
  }
  return { api: createAdminApi({ fetchFn }), calls }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof ApiError, String(error))
    return error
  }
  assert.fail('đáng lẽ phải ném ApiError')
}

test('session: 200 → true, 401 → false, lỗi khác thì ném', async () => {
  assert.equal(await fake(() => json({ authenticated: true })).api.session(), true)
  assert.equal(await fake(() => json({ error: 'Chưa đăng nhập' }, 401)).api.session(), false)
  assert.equal((await failure(fake(() => json({ error: 'x' }, 503)).api.session())).status, 503)
})

test('login/logout: đúng phương thức, đường dẫn, body JSON, cookie cùng origin', async () => {
  const { api, calls } = fake(() => json({ ok: true }))
  await api.login('mật khẩu')
  await api.logout()
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['POST', '/api/admin/login'], ['POST', '/api/admin/logout']])
  assert.equal(calls[0].body, JSON.stringify({ password: 'mật khẩu' }))
  assert.deepEqual(calls[0].headers, { 'Content-Type': 'application/json' })
  assert.equal(calls[0].credentials, 'same-origin')
})

test('login sai: thông báo của server được giữ nguyên, kèm mã 401', async () => {
  const error = await failure(fake(() => json({ error: 'Mật khẩu không đúng' }, 401)).api.login('x'))
  assert.equal(error.status, 401)
  assert.equal(error.message, 'Mật khẩu không đúng')
})

test('library: kiểm tra dữ liệu server trả về', async () => {
  assert.deepEqual((await fake(() => json(library)).api.library()).tracks.map((t) => t.id), [ID])
  const bad = await failure(fake(() => json({ version: 1, tracks: [{ id: 'bậy' }] })).api.library())
  assert.equal(bad.status, 0)
  assert.match(bad.message, /không hợp lệ/)
})

test('requestUpload: gửi {filename, size}, nhận phiếu đầy đủ', async () => {
  const ticket = { id: ID, key: track.key, contentType: 'audio/mpeg', uploadUrl: 'https://r2.test/x', headers: { 'Content-Type': 'audio/mpeg' }, expiresAt: 1 }
  const { api, calls } = fake(() => json(ticket))
  const got = await api.requestUpload({ filename: 'a.mp3', size: 5000 })
  assert.equal(got.uploadUrl, 'https://r2.test/x')
  assert.equal(calls[0].body, JSON.stringify({ filename: 'a.mp3', size: 5000 }))
  const bad = await failure(fake(() => json({ id: ID })).api.requestUpload({ filename: 'a.mp3', size: 1 }))
  assert.match(bad.message, /không hợp lệ/)
})

test('register/update/remove: đúng đường dẫn và nội dung', async () => {
  const { api, calls } = fake((call) => (call.method === 'DELETE' ? new Response(null, { status: 204 }) : json(track)))
  await api.register({ id: ID, key: track.key, originalFilename: 'a.mp3', title: 'T', artist: 'A', license: 'CC0' })
  await api.update(ID, { moveTo: 0 })
  await api.update(ID, { title: 'Mới' })
  await api.remove(ID)
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [
    ['POST', '/api/admin/tracks'],
    ['PATCH', `/api/admin/tracks/${ID}`],
    ['PATCH', `/api/admin/tracks/${ID}`],
    ['DELETE', `/api/admin/tracks/${ID}`],
  ])
  assert.equal(calls[1].body, JSON.stringify({ moveTo: 0 }))
  assert.equal(calls[3].body, undefined, 'DELETE không có body')
})

test('lỗi thiếu Origin/quyền: giữ mã và thông báo của server', async () => {
  const e403 = await failure(fake(() => json({ error: 'Origin không hợp lệ' }, 403)).api.remove(ID))
  assert.equal(e403.status, 403)
  const e409 = await failure(fake(() => json({ error: 'File chưa được upload lên R2' }, 409)).api.register({ id: ID, key: track.key, originalFilename: 'a.mp3', title: 'T', artist: 'A', license: 'CC0' }))
  assert.equal(e409.message, 'File chưa được upload lên R2')
})

test('không có API (index.html 200) → ApiError status 0 kèm hướng dẫn', async () => {
  const { api } = fake(() => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }))
  const error = await failure(api.session())
  assert.equal(error.status, 0)
  assert.match(error.message, /dev:admin/)
})

test('POST/PATCH/DELETE khi không có API (Vite trả 404 hoặc 405 dạng văn bản) cũng báo "không có API quản trị"', async () => {
  for (const status of [404, 405]) {
    const error = await failure(fake(() => new Response('Not Found', { status, headers: { 'content-type': 'text/plain' } })).api.login('x'))
    assert.equal(error.status, 0)
    assert.match(error.message, /dev:admin/)
  }
})

test('lỗi không phải JSON và mạng đứt', async () => {
  const html500 = await failure(fake(() => new Response('oops', { status: 500, headers: { 'content-type': 'text/plain' } })).api.library())
  assert.equal(html500.status, 500)
  const down = await failure(createAdminApi({ fetchFn: async () => { throw new TypeError('Failed to fetch') } }).session())
  assert.equal(down.status, 0)
  assert.match(down.message, /kết nối/)
})

test('JSON lỗi không có trường error → thông báo chung kèm mã', async () => {
  const error = await failure(fake(() => json({ khác: 1 }, 500)).api.library())
  assert.equal(error.message, 'Lỗi máy chủ (HTTP 500)')
})
