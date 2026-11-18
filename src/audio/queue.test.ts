import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createQueue, currentIndex, jump, next, prev, setShuffle, type Random } from './queue.ts'

/** Bộ sinh ngẫu nhiên có hạt giống, để test lặp lại được. */
function seeded(seed: number): Random {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sorted = (order: readonly number[]) => [...order].sort((a, b) => a - b)

test('danh sách rỗng', () => {
  const q = createQueue(0)
  assert.equal(currentIndex(q), -1)
  assert.equal(next(q), q)
  assert.equal(prev(q), q)
  assert.equal(setShuffle(q, true).shuffle, true)
})

test('tuần tự: next/prev quay vòng', () => {
  let q = createQueue(3)
  assert.equal(currentIndex(q), 0)
  q = next(q)
  assert.equal(currentIndex(q), 1)
  q = next(next(q))
  assert.equal(currentIndex(q), 0)
  q = prev(q)
  assert.equal(currentIndex(q), 2)
})

test('một bài: next/prev vẫn ở bài đó', () => {
  const q = createQueue(1)
  assert.equal(currentIndex(next(q)), 0)
  assert.equal(currentIndex(prev(q)), 0)
})

test('createQueue bắt đầu từ một chỉ số, kẹp trong khoảng hợp lệ', () => {
  assert.equal(currentIndex(createQueue(5, 3)), 3)
  assert.equal(currentIndex(createQueue(5, 99)), 4)
  assert.equal(currentIndex(createQueue(5, -2)), 0)
})

test('jump tới một bài; chỉ số lạ thì giữ nguyên', () => {
  const q = createQueue(5)
  assert.equal(currentIndex(jump(q, 3)), 3)
  assert.equal(jump(q, 9), q)
})

test('shuffle: hoán vị đủ mọi bài, bài đang phát đứng đầu', () => {
  const q = createQueue(8, 5, true, seeded(1))
  assert.equal(currentIndex(q), 5)
  assert.equal(q.position, 0)
  assert.deepEqual(sorted(q.order), [0, 1, 2, 3, 4, 5, 6, 7])
})

test('shuffle: đi hết một vòng gặp đủ mọi bài đúng một lần rồi quay lại bài đầu', () => {
  let q = createQueue(6, 2, true, seeded(7))
  const seen: number[] = []
  for (let i = 0; i < 6; i++) {
    seen.push(currentIndex(q))
    q = next(q)
  }
  assert.deepEqual(sorted(seen), [0, 1, 2, 3, 4, 5])
  assert.equal(currentIndex(q), seen[0])
})

test('bật shuffle giữ nguyên bài đang phát', () => {
  let q = createQueue(10)
  q = jump(q, 6)
  const shuffled = setShuffle(q, true, seeded(3))
  assert.equal(currentIndex(shuffled), 6)
  assert.deepEqual(sorted(shuffled.order), sorted(q.order))
})

test('tắt shuffle trả về thứ tự gốc, vẫn giữ bài đang phát', () => {
  let q = createQueue(6, 0, true, seeded(5))
  q = next(next(q))
  const playing = currentIndex(q)
  const plain = setShuffle(q, false)
  assert.equal(currentIndex(plain), playing)
  assert.deepEqual(plain.order, [0, 1, 2, 3, 4, 5])
  assert.equal(currentIndex(next(plain)), (playing + 1) % 6)
})

test('đặt lại cùng chế độ thì không đổi gì', () => {
  const q = createQueue(4, 1, true, seeded(2))
  assert.equal(setShuffle(q, true), q)
})

test('không sửa đối tượng cũ (bất biến)', () => {
  const q = createQueue(4)
  const before = JSON.stringify(q)
  next(q)
  prev(q)
  jump(q, 2)
  setShuffle(q, true, seeded(9))
  assert.equal(JSON.stringify(q), before)
})
