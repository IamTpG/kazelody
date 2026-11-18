import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_DURATION_SECONDS, formatDuration, isDuration, normalizeDuration } from './time.ts'

test('formatDuration: dạng m:ss', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(7), '0:07')
  assert.equal(formatDuration(59), '0:59')
  assert.equal(formatDuration(60), '1:00')
  assert.equal(formatDuration(61), '1:01')
  assert.equal(formatDuration(225), '3:45')
  assert.equal(formatDuration(3599), '59:59')
})

test('formatDuration: từ 1 giờ trở lên thì h:mm:ss', () => {
  assert.equal(formatDuration(3600), '1:00:00')
  assert.equal(formatDuration(3661), '1:01:01')
  assert.equal(formatDuration(45_296), '12:34:56')
  assert.equal(formatDuration(86_399), '23:59:59')
})

test('formatDuration: làm tròn xuống giây', () => {
  assert.equal(formatDuration(7.99), '0:07')
  assert.equal(formatDuration(3599.99), '59:59')
  assert.equal(formatDuration(0.4), '0:00')
})

test('formatDuration: có total ≥ 1 giờ thì cả vị trí đang phát cũng dùng h:mm:ss (độ rộng không nhảy)', () => {
  assert.equal(formatDuration(7, 3725), '0:00:07')
  assert.equal(formatDuration(754, 3725), '0:12:34')
  assert.equal(formatDuration(3725, 3725), '1:02:05')
  // total ngắn thì giữ m:ss
  assert.equal(formatDuration(7, 225), '0:07')
  // total thiếu hoặc không hợp lệ không ảnh hưởng
  assert.equal(formatDuration(7, undefined), '0:07')
  assert.equal(formatDuration(7, Number.NaN), '0:07')
  assert.equal(formatDuration(7, -1), '0:07')
})

test('formatDuration: vị trí vượt total thì vẫn đúng dạng', () => {
  assert.equal(formatDuration(3700, 3000), '1:01:40')
})

test('formatDuration: giá trị không hợp lệ coi như 0', () => {
  for (const bad of [Number.NaN, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(formatDuration(bad), '0:00', String(bad))
  }
  assert.equal(formatDuration(Number.POSITIVE_INFINITY, 100), '0:00')
})

test('isDuration: số hữu hạn dương, tối đa 24 giờ', () => {
  assert.ok(isDuration(1))
  assert.ok(isDuration(224.6))
  assert.ok(isDuration(MAX_DURATION_SECONDS))
  for (const bad of [0, -1, MAX_DURATION_SECONDS + 1, Number.NaN, Number.POSITIVE_INFINITY, '225', null, undefined, {}, true]) {
    assert.ok(!isDuration(bad), String(bad))
  }
})

test('normalizeDuration: giữ giá trị thực tới mili giây, không làm tròn lên số nguyên', () => {
  assert.equal(normalizeDuration(159.72049), 159.72)
  assert.equal(normalizeDuration(224.6), 224.6)
  assert.equal(normalizeDuration(3725), 3725)
  for (const bad of [0, -1, Number.NaN, 86_401, '5', null, undefined]) assert.equal(normalizeDuration(bad), null, String(bad))
})

test('playlist (giá trị đã lưu) và player (thời lượng thật) hiện cùng một con số', () => {
  const real = 159.72049
  assert.equal(formatDuration(normalizeDuration(real)!), formatDuration(real))
  assert.equal(formatDuration(normalizeDuration(real)!), '2:39')
})
