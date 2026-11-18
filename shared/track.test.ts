import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  displayLabel,
  displayParts,
  isManifestEntry,
  parseTrackFilename,
  trackId,
  type ParsedFilename,
} from './track.ts'

function ok(filename: string): ParsedFilename {
  const result = parseTrackFilename(filename)
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result.value
}

function fails(filename: string, pattern: RegExp) {
  const result = parseTrackFilename(filename)
  assert.ok(!result.ok, `đáng lẽ phải lỗi: ${filename}`)
  assert.match(result.error, pattern)
}

test('tên chuẩn đầy đủ', () => {
  assert.deepEqual(ok('Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3'), {
    artist: 'Aria North',
    title: 'Quiet Hills at Dusk',
    license: 'CC-BY-4.0',
    sourceDomain: 'freemusicarchive.org',
  })
})

test('nguồn là tuỳ chọn, CC0 không cần phiên bản', () => {
  assert.deepEqual(ok('Mono Field__Paper Lantern__CC0.ogg'), {
    artist: 'Mono Field',
    title: 'Paper Lantern',
    license: 'CC0',
    sourceDomain: undefined,
  })
  assert.equal(ok('A__B__CC0__.mp3').sourceDomain, undefined)
})

test('tên bài có gạch nối, ngoặc vuông, dấu nháy, & và dấu chấm', () => {
  assert.equal(ok('Taylor Swift__Anti-Hero__CC0.mp3').title, 'Anti-Hero')
  assert.equal(ok('Band__Song - Remastered 2020__CC0.mp3').title, 'Song - Remastered 2020')
  assert.equal(ok('Band__Song [Remix] (feat. X & Y)__CC0.mp3').title, 'Song [Remix] (feat. X & Y)')
  assert.equal(ok("Guns N' Roses__Don't Cry__CC0.mp3").artist, "Guns N' Roses")
  assert.equal(ok('Mr. Brightside Band__Vol.2__CC0.mp3').title, 'Vol.2')
})

test('Unicode: tiếng Việt, tiếng Nhật, và NFD của macOS được đưa về NFC', () => {
  const artistNfd = 'Hòng Nhung'
  const titleNfd = 'Mụa chính Bác'
  assert.notEqual(artistNfd, artistNfd.normalize('NFC')) // đảm bảo dữ liệu thử đúng là NFD
  const parsed = ok(`${artistNfd}__${titleNfd}__CC0.mp3`)
  assert.equal(parsed.artist, artistNfd.normalize('NFC'))
  assert.equal(parsed.title, titleNfd.normalize('NFC'))
  assert.equal(ok('久石譲__風の通り道__CC-BY-3.0.mp3').title, '風の通り道')
})

test('gộp khoảng trắng thừa', () => {
  const parsed = ok('  Aria   North __  Quiet   Hills  __ CC0 .mp3')
  assert.equal(parsed.artist, 'Aria North')
  assert.equal(parsed.title, 'Quiet Hills')
})

test('license: không phân biệt hoa thường, nhận CC0-1.0', () => {
  assert.equal(ok('A__B__cc-by-4.0.mp3').license, 'CC-BY-4.0')
  assert.equal(ok('A__B__CC0-1.0.mp3').license, 'CC0')
})

test('nguồn: bỏ www., chữ thường', () => {
  assert.equal(ok('A__B__CC0__WWW.Pixabay.com.mp3').sourceDomain, 'pixabay.com')
})

test('lỗi: thiếu phần', () => {
  fails('Chỉ một tên.mp3', /Artist__Title__License/)
  fails('A__B.mp3', /Artist__Title__License/)
  fails('__B__CC0.mp3', /tác giả/)
  fails('A____CC0.mp3', /tên bài/)
})

test('lỗi: thừa "__"', () => {
  fails('A__B__C__CC0__x.com__y.mp3', /__/)
})

test('lỗi: license sai', () => {
  fails('A__B__CC-BY.mp3', /phiên bản/)
  fails('A__B__CC-BY-SA-4.0.mp3', /không được chấp nhận/)
  fails('A__B__CC-BY-NC-4.0.mp3', /không được chấp nhận/)
  fails('A__B__MIT.mp3', /không được chấp nhận/)
})

test('lỗi: nguồn không phải tên miền', () => {
  fails('A__B__CC0__https://x.com/y.mp3', /tên miền/)
  fails('A__B__CC0__khong-phai-domain.mp3', /tên miền/)
})

test('chỉ bỏ đuôi âm thanh, không cắt nhầm dấu chấm trong tên', () => {
  assert.equal(ok('A__Vol.2__CC0').title, 'Vol.2')
  assert.equal(ok('A__Mr. B__CC0.mp3').title, 'Mr. B')
})

test('trackId ổn định, không phụ thuộc NFC/NFD, khác nhau giữa các file', () => {
  const a = trackId('Aria North__Quiet Hills__CC0.mp3')
  assert.equal(a, trackId('Aria North__Quiet Hills__CC0.mp3'))
  assert.equal(trackId('Mụa.mp3'), trackId('Mụa.mp3'))
  assert.notEqual(a, trackId('Aria North__Quiet Hills__CC0.ogg'))
  assert.match(a, /^[0-9a-z]+$/)
})

test('displayParts / displayLabel: CC0 chỉ tên bài, CC-BY thêm tác giả', () => {
  const cc0 = { title: 'Paper Lantern', artist: 'Mono Field', license: 'CC0' } as const
  const by = { title: 'Quiet Hills', artist: 'Aria North', license: 'CC-BY-4.0' } as const
  assert.deepEqual(displayParts(cc0), { title: 'Paper Lantern', artist: null })
  assert.equal(displayLabel(cc0), 'Paper Lantern')
  assert.deepEqual(displayParts(by), { title: 'Quiet Hills', artist: 'Aria North' })
  assert.equal(displayLabel(by), 'Quiet Hills — Aria North')
})

test('isManifestEntry', () => {
  const entry = { id: 'x', filename: 'a.mp3', title: 'B', artist: 'A', license: 'CC0' }
  assert.ok(isManifestEntry(entry))
  assert.ok(isManifestEntry({ ...entry, sourceDomain: 'x.com' }))
  assert.ok(!isManifestEntry({ ...entry, license: 'MIT' }))
  assert.ok(!isManifestEntry({ ...entry, license: 'toString' }))
  assert.ok(!isManifestEntry({ ...entry, title: 1 }))
  assert.ok(!isManifestEntry(null))
})

test('isManifestEntry: duration tuỳ chọn nhưng phải hợp lệ', () => {
  const entry = { id: 'x', filename: 'a.mp3', title: 'B', artist: 'A', license: 'CC0' }
  assert.ok(isManifestEntry({ ...entry, duration: 225 }))
  for (const bad of [0, -1, 100_000, 'dài', null, Number.NaN]) {
    assert.ok(!isManifestEntry({ ...entry, duration: bad }), String(bad))
  }
})
