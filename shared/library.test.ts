import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addTrack,
  emptyLibrary,
  extensionOf,
  isUuid,
  moveTrack,
  newTrackKey,
  parseTrackKey,
  removeTrack,
  toPublicTrack,
  updateTrack,
  validateLibrary,
  validateMeta,
  validateStoredTrack,
  type Library,
  type StoredTrack,
} from './library.ts'

const NOW = new Date('2026-11-18T10:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function stored(n: number, patch: Partial<StoredTrack> = {}): StoredTrack {
  return {
    id: id(n),
    key: newTrackKey(id(n), 'mp3'),
    title: `Title ${n}`,
    artist: `Artist ${n}`,
    license: 'CC-BY-4.0',
    originalFilename: `a${n}.mp3`,
    contentType: 'audio/mpeg',
    size: 1000 + n,
    addedAt: '2026-11-18T09:00:00.000Z',
    ...patch,
  }
}

function lib(...tracks: StoredTrack[]): Library {
  return { version: 1, updatedAt: '2026-11-18T09:00:00.000Z', tracks }
}

test('extensionOf: chỉ nhận đuôi âm thanh, không phân biệt hoa thường', () => {
  assert.equal(extensionOf('Song.MP3'), 'mp3')
  assert.equal(extensionOf('a.b.c.ogg'), 'ogg')
  assert.equal(extensionOf('virus.exe'), null)
  assert.equal(extensionOf('noextension'), null)
  assert.equal(extensionOf('song.mp3.exe'), null)
})

test('parseTrackKey: chỉ nhận audio/<uuid>.<đuôi>', () => {
  assert.deepEqual(parseTrackKey(`audio/${id(1)}.mp3`), { id: id(1), ext: 'mp3' })
  for (const bad of [
    `audio/../tracks.json`,
    `audio/${id(1)}.exe`,
    `other/${id(1)}.mp3`,
    `audio/${id(1)}.mp3/extra`,
    `audio/not-a-uuid.mp3`,
    `/audio/${id(1)}.mp3`,
    'tracks.json',
  ]) {
    assert.equal(parseTrackKey(bad), null, bad)
  }
  assert.ok(isUuid(id(1)))
  assert.ok(!isUuid('x'))
})

test('validateMeta: chuẩn hoá và kiểm tra', () => {
  const ok = validateMeta({ title: '  Quiet   Hills ', artist: 'Aria North', license: 'cc-by-4.0', sourceDomain: 'WWW.Example.com' })
  assert.ok(ok.ok)
  assert.deepEqual(ok.value, { title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0', sourceDomain: 'example.com' })
  // nguồn bỏ trống là hợp lệ và không để lại khoá
  const noSource = validateMeta({ title: 'A', artist: 'B', license: 'CC0', sourceDomain: '' })
  assert.ok(noSource.ok)
  assert.ok(!('sourceDomain' in noSource.value))
})

test('validateMeta: từ chối dữ liệu xấu', () => {
  const bad = (input: unknown, pattern: RegExp) => {
    const result = validateMeta(input)
    assert.ok(!result.ok)
    assert.match(result.error, pattern)
  }
  bad(null, /không hợp lệ/)
  bad({ title: '', artist: 'B', license: 'CC0' }, /tên bài/)
  bad({ title: 'A', artist: ' ', license: 'CC0' }, /tác giả/)
  bad({ title: 'A', artist: 'B' }, /license/)
  bad({ title: 'A', artist: 'B', license: 'MIT' }, /không được chấp nhận/)
  bad({ title: 'A', artist: 'B', license: 'CC-BY' }, /phiên bản/)
  bad({ title: 'A', artist: 'B', license: 'CC0', sourceDomain: 'https://x.com/y' }, /tên miền/)
  bad({ title: 'A', artist: 'B', license: 'CC0', sourceDomain: 5 }, /chuỗi/)
  bad({ title: 'x'.repeat(201), artist: 'B', license: 'CC0' }, /tối đa/)
})

test('validateStoredTrack: key phải khớp id và đúng mẫu', () => {
  assert.ok(validateStoredTrack(stored(1)))
  assert.equal(validateStoredTrack({ ...stored(1), key: `audio/${id(2)}.mp3` }), null)
  assert.equal(validateStoredTrack({ ...stored(1), key: 'audio/../x.mp3' }), null)
  assert.equal(validateStoredTrack({ ...stored(1), size: -1 }), null)
  assert.equal(validateStoredTrack({ ...stored(1), size: 'big' }), null)
  assert.equal(validateStoredTrack({ ...stored(1), addedAt: 'hôm qua' }), null)
  assert.equal(validateStoredTrack({ ...stored(1), license: 'MIT' }), null)
  assert.equal(validateStoredTrack(null), null)
})

test('validateLibrary: nghiêm ngặt, một dòng sai thì từ chối cả thư viện', () => {
  assert.ok(validateLibrary(lib(stored(1), stored(2))))
  assert.ok(validateLibrary(emptyLibrary(NOW)))
  assert.equal(validateLibrary({ ...lib(stored(1)), version: 2 }), null)
  assert.equal(validateLibrary({ version: 1, tracks: [] }), null)
  assert.equal(validateLibrary(lib(stored(1), { ...stored(2), license: 'x' as never })), null)
  assert.equal(validateLibrary(lib(stored(1), stored(1))), null) // trùng id
  assert.equal(validateLibrary('chuỗi'), null)
})

test('addTrack: thêm vào cuối, cập nhật updatedAt, trùng id thì null, không sửa bản cũ', () => {
  const base = lib(stored(1))
  const next = addTrack(base, stored(2), NOW)
  assert.ok(next)
  assert.deepEqual(next.tracks.map((t) => t.id), [id(1), id(2)])
  assert.equal(next.updatedAt, NOW.toISOString())
  assert.equal(base.tracks.length, 1)
  assert.equal(addTrack(base, stored(1), NOW), null)
})

test('updateTrack: đổi metadata, có thể xoá nguồn, giữ nguyên key/size/thứ tự', () => {
  const base = lib(stored(1, { sourceDomain: 'old.com' }), stored(2))
  const next = updateTrack(base, id(1), { title: 'Mới', artist: 'Ai đó', license: 'CC0' }, NOW)
  assert.ok(next)
  const t = next.tracks[0]
  assert.equal(t.title, 'Mới')
  assert.equal(t.license, 'CC0')
  assert.ok(!('sourceDomain' in t), 'nguồn cũ phải bị xoá khi meta mới không có')
  assert.equal(t.key, base.tracks[0].key)
  assert.equal(t.size, base.tracks[0].size)
  assert.deepEqual(next.tracks.map((x) => x.id), [id(1), id(2)])
  assert.equal(updateTrack(base, id(9), { title: 'A', artist: 'B', license: 'CC0' }, NOW), null)
})

test('removeTrack: trả về cả bài bị xoá (để xoá object R2)', () => {
  const base = lib(stored(1), stored(2), stored(3))
  const result = removeTrack(base, id(2), NOW)
  assert.ok(result)
  assert.equal(result.removed.key, newTrackKey(id(2), 'mp3'))
  assert.deepEqual(result.library.tracks.map((t) => t.id), [id(1), id(3)])
  assert.equal(removeTrack(base, id(9), NOW), null)
})

test('moveTrack: đổi vị trí, kẹp trong khoảng hợp lệ, id lạ thì null', () => {
  const base = lib(stored(1), stored(2), stored(3), stored(4))
  const order = (l: Library | null) => l?.tracks.map((t) => Number(t.id.slice(-1)))
  assert.deepEqual(order(moveTrack(base, id(4), 0, NOW)), [4, 1, 2, 3])
  assert.deepEqual(order(moveTrack(base, id(1), 2, NOW)), [2, 3, 1, 4])
  assert.deepEqual(order(moveTrack(base, id(1), 99, NOW)), [2, 3, 4, 1])
  assert.deepEqual(order(moveTrack(base, id(3), -5, NOW)), [3, 1, 2, 4])
  assert.equal(moveTrack(base, id(9), 0, NOW), null)
  assert.equal(moveTrack(base, id(1), 1.5, NOW), null)
})

test('toPublicTrack: không lộ khoá R2, dung lượng hay thời điểm thêm', () => {
  const pub = toPublicTrack(stored(1, { sourceDomain: 'x.com' }), 'https://signed.example/u')
  assert.deepEqual(Object.keys(pub).sort(), ['artist', 'id', 'license', 'originalFilename', 'sourceDomain', 'title', 'url'])
  assert.equal(pub.url, 'https://signed.example/u')
  assert.ok(!('key' in pub))
})
