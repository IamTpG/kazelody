import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_UPLOAD_BYTES, newTrackKey, type StoredTrack } from '../../shared/library.ts'
import { ApiError, type UploadTicket } from './api.ts'
import { UploadError, draftFromFilename, draftProblem, fileProblem, uploadTrack, type Draft, type Stage } from './upload.ts'

const ID = '00000000-0000-4000-8000-000000000007'
const TICKET: UploadTicket = {
  id: ID,
  key: newTrackKey(ID, 'mp3'),
  contentType: 'audio/mpeg',
  uploadUrl: 'https://r2.test/put',
  headers: { 'Content-Type': 'audio/mpeg' },
}
const GOOD: Draft = { title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'example.com' }
const FILE = { name: 'Aria North__Quiet Hills__CC-BY-4.0.mp3', size: 5000 }

function stored(patch: Partial<StoredTrack> = {}): StoredTrack {
  return { id: ID, key: TICKET.key, title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', originalFilename: FILE.name, contentType: 'audio/mpeg', size: 5000, addedAt: '2026-11-18T09:00:00.000Z', ...patch }
}

/** api + put giả, ghi lại thứ tự gọi. */
function harness(options: { signFails?: Error; putFails?: Error; registerFails?: Error } = {}) {
  const log: string[] = []
  const registered: unknown[] = []
  const api = {
    async requestUpload(input: { filename: string; size: number }) {
      log.push(`sign:${input.filename}:${input.size}`)
      if (options.signFails) throw options.signFails
      return TICKET
    },
    async register(input: unknown) {
      log.push('register')
      registered.push(input)
      if (options.registerFails) throw options.registerFails
      return stored()
    },
  }
  const put = async (ticket: UploadTicket, _file: unknown, onProgress: (f: number) => void) => {
    log.push(`put:${ticket.uploadUrl}:${JSON.stringify(ticket.headers)}`)
    onProgress(0.4)
    if (options.putFails) throw options.putFails
    onProgress(1.7) // giá trị vượt khoảng phải được kẹp lại
  }
  return { api, put, log, registered }
}

test('draftFromFilename: tên đúng quy tắc điền sẵn đủ, không gợi ý', () => {
  const { draft, hint } = draftFromFilename('Aria North__Quiet Hills at Dusk__CC-BY-4.0__www.FreeMusicArchive.org.mp3')
  assert.deepEqual(draft, { title: 'Quiet Hills at Dusk', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'freemusicarchive.org' })
  assert.equal(hint, null)
  assert.equal(draftFromFilename('A__B__CC0.mp3').draft.sourceDomain, '')
})

test('draftFromFilename: tên sai quy tắc → tên bài tạm = tên file bỏ đuôi, kèm lý do', () => {
  const { draft, hint } = draftFromFilename('Một bài hát  rất hay.mp3')
  assert.deepEqual(draft, { title: 'Một bài hát rất hay', artist: '', license: '', sourceDomain: '' })
  assert.match(hint!, /Artist__Title__License/)
  assert.match(draftFromFilename('A__B__MIT.mp3').hint!, /không được chấp nhận/)
  assert.equal(draftFromFilename('A__B__MIT.mp3').draft.title, 'A__B__MIT')
})

test('draftProblem: dùng chung quy tắc với server', () => {
  assert.equal(draftProblem(GOOD), null)
  assert.match(draftProblem({ ...GOOD, title: ' ' })!, /tên bài/)
  assert.match(draftProblem({ ...GOOD, artist: '' })!, /tác giả/)
  assert.match(draftProblem({ ...GOOD, license: '' })!, /license/i)
  assert.match(draftProblem({ ...GOOD, license: 'MIT' })!, /không được chấp nhận/)
  assert.match(draftProblem({ ...GOOD, sourceDomain: 'không phải domain' })!, /tên miền/)
  assert.equal(draftProblem({ ...GOOD, sourceDomain: '' }), null)
})

test('fileProblem: đuôi, rỗng, quá lớn', () => {
  assert.equal(fileProblem({ name: 'a.mp3', size: 1 }), null)
  assert.equal(fileProblem({ name: 'a.MP3', size: MAX_UPLOAD_BYTES }), null)
  assert.match(fileProblem({ name: 'a.exe', size: 1 })!, /file nhạc/)
  assert.match(fileProblem({ name: 'a', size: 1 })!, /file nhạc/)
  assert.match(fileProblem({ name: 'a.mp3', size: 0 })!, /rỗng/)
  assert.match(fileProblem({ name: 'a.mp3', size: MAX_UPLOAD_BYTES + 1 })!, /quá lớn/)
})

test('uploadTrack: đúng thứ tự xin URL → PUT với đúng header → ghi thư viện', async () => {
  const h = harness()
  const stages: Stage[] = []
  const progress: number[] = []
  const track = await uploadTrack({ file: FILE, draft: GOOD, api: h.api, put: h.put, onStage: (s) => stages.push(s), onProgress: (f) => progress.push(f) })
  assert.deepEqual(h.log, [`sign:${FILE.name}:5000`, `put:https://r2.test/put:{"Content-Type":"audio/mpeg"}`, 'register'])
  assert.deepEqual(stages, ['checking', 'signing', 'uploading', 'saving'])
  assert.deepEqual(progress, [0, 0.4, 1, 1], 'tiến độ được kẹp trong 0…1 và kết thúc ở 1')
  assert.equal(track.id, ID)
  assert.deepEqual(h.registered[0], { id: ID, key: TICKET.key, originalFilename: FILE.name, title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'example.com' })
})

test('uploadTrack: chuẩn hoá metadata trước khi gửi (NFC, khoảng trắng, license, nguồn)', async () => {
  const h = harness()
  await uploadTrack({ file: FILE, draft: { title: '  Quiet   Hills ', artist: 'Aria North', license: 'cc-by-4.0', sourceDomain: 'WWW.Example.com' }, api: h.api, put: h.put })
  assert.deepEqual(h.registered[0], { id: ID, key: TICKET.key, originalFilename: FILE.name, title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'example.com' })
})

test('uploadTrack: file/metadata sai thì dừng ngay, KHÔNG gọi mạng', async () => {
  for (const [file, draft, pattern] of [
    [{ name: 'a.exe', size: 5 }, GOOD, /file nhạc/],
    [{ name: 'a.mp3', size: MAX_UPLOAD_BYTES + 1 }, GOOD, /quá lớn/],
    [FILE, { ...GOOD, license: '' }, /license/i],
  ] as const) {
    const h = harness()
    await assert.rejects(uploadTrack({ file, draft, api: h.api, put: h.put }), (error: unknown) => {
      assert.ok(error instanceof UploadError)
      assert.equal(error.stage, 'checking')
      assert.match(error.message, pattern)
      return true
    })
    assert.deepEqual(h.log, [])
  }
})

test('uploadTrack: lỗi xin URL → stage signing, mã lỗi được giữ, chưa upload gì', async () => {
  const h = harness({ signFails: new ApiError(403, 'Origin không hợp lệ') })
  await assert.rejects(uploadTrack({ file: FILE, draft: GOOD, api: h.api, put: h.put }), (error: unknown) => {
    assert.ok(error instanceof UploadError)
    assert.equal(error.stage, 'signing')
    assert.equal(error.status, 403)
    assert.equal(error.ticket, null)
    return true
  })
  assert.deepEqual(h.log, [`sign:${FILE.name}:5000`])
})

test('uploadTrack: lỗi PUT → stage uploading, không ghi thư viện, không để lại phiếu (lần thử sau xin URL mới)', async () => {
  const h = harness({ putFails: new Error('R2 từ chối') })
  await assert.rejects(uploadTrack({ file: FILE, draft: GOOD, api: h.api, put: h.put }), (error: unknown) => {
    assert.ok(error instanceof UploadError)
    assert.equal(error.stage, 'uploading')
    assert.equal(error.ticket, null)
    assert.equal(error.message, 'R2 từ chối')
    return true
  })
  assert.ok(!h.log.includes('register'))
})

test('uploadTrack: lỗi ghi thư viện sau khi đã upload → trả phiếu; thử lại chỉ ghi lại, KHÔNG upload lại', async () => {
  const first = harness({ registerFails: new ApiError(500, 'Lỗi máy chủ') })
  let ticket: UploadTicket | null = null
  await assert.rejects(uploadTrack({ file: FILE, draft: GOOD, api: first.api, put: first.put }), (error: unknown) => {
    assert.ok(error instanceof UploadError)
    assert.equal(error.stage, 'saving')
    ticket = error.ticket
    return true
  })
  assert.deepEqual(ticket, TICKET)

  const retry = harness()
  const track = await uploadTrack({ file: FILE, draft: GOOD, api: retry.api, put: retry.put, ticket })
  assert.deepEqual(retry.log, ['register'], 'không xin URL, không PUT')
  assert.equal(track.id, ID)
  assert.deepEqual(retry.registered[0], { id: ID, key: TICKET.key, originalFilename: FILE.name, title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'example.com' })
})

test('uploadTrack: có thể sửa metadata giữa hai lần thử (vd. lỗi do license) mà vẫn dùng phiếu cũ', async () => {
  const retry = harness()
  await uploadTrack({ file: FILE, draft: { ...GOOD, title: 'Tên đã sửa' }, api: retry.api, put: retry.put, ticket: TICKET })
  assert.deepEqual(retry.log, ['register'])
  assert.equal((retry.registered[0] as { title: string }).title, 'Tên đã sửa')
})

test('uploadTrack: thời lượng đo được thì gửi kèm khi ghi thư viện; không đo được hoặc giá trị lạ thì bỏ qua', async () => {
  for (const [duration, expected] of [[224.6, 224.6], [null, undefined], [undefined, undefined], [0, undefined], [-5, undefined], [Number.NaN, undefined]] as const) {
    const h = harness()
    await uploadTrack({ file: FILE, draft: GOOD, api: h.api, put: h.put, duration })
    const sent = h.registered[0] as { duration?: number }
    assert.equal(sent.duration, expected, String(duration))
    assert.equal('duration' in sent, expected !== undefined, String(duration))
  }
})

test('uploadTrack: thử lại sau khi ghi lỗi vẫn gửi thời lượng', async () => {
  const retry = harness()
  await uploadTrack({ file: FILE, draft: GOOD, api: retry.api, put: retry.put, ticket: TICKET, duration: 90 })
  assert.deepEqual(retry.log, ['register'])
  assert.equal((retry.registered[0] as { duration?: number }).duration, 90)
})
