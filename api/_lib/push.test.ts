import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_UPLOAD_BYTES, newTrackKey, validateLibrary } from '../../shared/library.ts'
import { MemoryStorage } from './memory-storage.ts'
import { pushTracks, type LocalFile } from './push.ts'
import { LIBRARY_KEY } from './storage.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const file = (name: string, size = 1000): LocalFile => ({ name, size, read: async () => new Uint8Array(size) })
const idGenerator = () => {
  let n = 0
  return () => id(++n)
}
const NOW = () => new Date('2026-11-18T10:00:00Z')

const A = 'Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3'
const B = 'Chase9602__Wind awakening memories of the forest__CC0__.mp3'

async function library(storage: MemoryStorage) {
  const value = validateLibrary(await storage.getJson(LIBRARY_KEY))
  assert.ok(value)
  return value
}

test('upload: đọc metadata từ tên file, dùng khoá UUID, ghi thư viện theo thứ tự', async () => {
  const storage = new MemoryStorage()
  const report = await pushTracks({ storage, files: [file(A, 5000), file(B, 6000)], now: NOW, randomId: idGenerator() })
  assert.equal(report.errors.length, 0)
  assert.equal(report.uploaded.length, 2)

  const lib = await library(storage)
  assert.deepEqual(lib.tracks.map((t) => t.id), [id(1), id(2)])
  assert.equal(lib.tracks[0].title, 'Quiet Hills at Dusk')
  assert.equal(lib.tracks[0].artist, 'Aria North')
  assert.equal(lib.tracks[0].license, 'CC-BY-4.0')
  assert.equal(lib.tracks[0].sourceDomain, 'freemusicarchive.org')
  assert.equal(lib.tracks[0].key, newTrackKey(id(1), 'mp3'))
  assert.equal(lib.tracks[0].originalFilename, A)
  assert.equal(lib.tracks[0].contentType, 'audio/mpeg')
  assert.equal(lib.tracks[0].size, 5000)
  assert.ok(!('sourceDomain' in lib.tracks[1]), 'nguồn bỏ trống không để lại khoá')
  assert.deepEqual(await storage.head(newTrackKey(id(2), 'mp3')), { size: 6000, contentType: 'audio/mpeg' })
  // tên gốc (có thể chứa ký tự lạ) không bao giờ là khoá trong R2
  assert.ok(![...storage.objects.keys()].some((key) => key.includes('Aria')))
})

test('chạy lại không tạo bản trùng: bài đã có thì bỏ qua, bài mới thì thêm', async () => {
  const storage = new MemoryStorage()
  const randomId = idGenerator()
  await pushTracks({ storage, files: [file(A)], now: NOW, randomId })
  const report = await pushTracks({ storage, files: [file(A), file(B)], now: NOW, randomId })
  assert.deepEqual(report.skipped, [A])
  assert.deepEqual(report.uploaded.map((t) => t.originalFilename), [B])
  assert.deepEqual((await library(storage)).tracks.map((t) => t.originalFilename), [A, B])
  assert.equal([...storage.objects.keys()].filter((k) => k.startsWith('audio/')).length, 2)
})

test('tên sai quy tắc, đuôi lạ, file rỗng, quá lớn: báo lỗi từng file và vẫn upload các file tốt', async () => {
  const storage = new MemoryStorage()
  const report = await pushTracks({
    storage,
    files: [file('ten sai quy tac.mp3'), file('A__B__MIT.mp3'), file('A__B__CC0.exe'), file('A__B__CC0.mp3', 0), file('C__D__CC0.mp3', MAX_UPLOAD_BYTES + 1), file(A)],
    now: NOW,
    randomId: idGenerator(),
  })
  assert.deepEqual(report.uploaded.map((t) => t.originalFilename), [A])
  assert.equal(report.errors.length, 5)
  const byName = Object.fromEntries(report.errors.map((e) => [e.name, e.error]))
  assert.match(byName['ten sai quy tac.mp3'], /Artist__Title__License/)
  assert.match(byName['A__B__MIT.mp3'], /không được chấp nhận/)
  assert.match(byName['A__B__CC0.exe'], /Đuôi file/)
  assert.match(byName['C__D__CC0.mp3'], /quá lớn/)
  assert.equal((await library(storage)).tracks.length, 1)
})

test('dry-run: không upload, không ghi thư viện; vẫn nhận ra bài đã có', async () => {
  const storage = new MemoryStorage()
  await pushTracks({ storage, files: [file(A)], now: NOW, randomId: idGenerator() })
  const before = storage.objects.size
  const report = await pushTracks({ storage, files: [file(A), file(B)], dryRun: true, now: NOW, randomId: idGenerator() })
  assert.deepEqual(report.skipped, [A])
  assert.deepEqual(report.wouldUpload, [B])
  assert.equal(report.uploaded.length, 0)
  assert.equal(storage.objects.size, before)
})

test('dry-run không cần R2 (storage null): chỉ kiểm tra tên file', async () => {
  const report = await pushTracks({ storage: null, files: [file(A), file('sai.mp3')], dryRun: true })
  assert.deepEqual(report.wouldUpload, [A])
  assert.equal(report.errors.length, 1)
})

test('không dry-run mà thiếu storage thì ném lỗi', async () => {
  await assert.rejects(pushTracks({ storage: null, files: [file(A)] }), /R2/)
})

test('upload lỗi giữa chừng: các bài đã xong vẫn nằm trong thư viện, bài lỗi được báo', async () => {
  const storage = new MemoryStorage()
  const realPut = storage.put.bind(storage)
  let calls = 0
  storage.put = async (key, body, type) => {
    if (++calls === 2) throw new Error('mạng đứt')
    return realPut(key, body, type)
  }
  const C = 'Lumen__Third Song__CC0.mp3'
  const report = await pushTracks({ storage, files: [file(A), file(B), file(C)], now: NOW, randomId: idGenerator() })
  assert.deepEqual(report.uploaded.map((t) => t.originalFilename), [A, C])
  assert.deepEqual(report.errors, [{ name: B, error: 'mạng đứt' }])
  assert.deepEqual((await library(storage)).tracks.map((t) => t.originalFilename), [A, C])
})

test('kích thước trên R2 không khớp thì coi là lỗi và không thêm vào thư viện', async () => {
  const storage = new MemoryStorage()
  storage.put = async (key) => storage.seed(key, { size: 1, contentType: 'audio/mpeg' })
  const report = await pushTracks({ storage, files: [file(A, 5000)], now: NOW, randomId: idGenerator() })
  assert.equal(report.uploaded.length, 0)
  assert.match(report.errors[0].error, /không khớp/)
  assert.equal(await storage.getJson(LIBRARY_KEY), null)
})

test('tracks.json hỏng thì dừng, không ghi đè', async () => {
  const storage = new MemoryStorage()
  await storage.putJson(LIBRARY_KEY, { version: 1, updatedAt: 'x', tracks: [{ id: 'bậy' }] })
  await assert.rejects(pushTracks({ storage, files: [file(A)], now: NOW }), /tracks\.json/)
  assert.equal(storage.objects.size, 1)
})

test('thời lượng do công cụ đo được lưu vào thư viện (giữ giá trị thực); giá trị lạ bị bỏ qua', async () => {
  const storage = new MemoryStorage()
  const withDuration = (name: string, duration: number | null | undefined): LocalFile => ({ ...file(name), duration })
  const C = 'Lumen__Third Song__CC0.mp3'
  const D = 'Dua__Fourth Song__CC0.mp3'
  await pushTracks({
    storage,
    files: [withDuration(A, 159.72049), withDuration(B, null), withDuration(C, -4), withDuration(D, undefined)],
    now: NOW,
    randomId: idGenerator(),
  })
  assert.deepEqual((await library(storage)).tracks.map((t) => t.duration), [159.72, undefined, undefined, undefined])
})
