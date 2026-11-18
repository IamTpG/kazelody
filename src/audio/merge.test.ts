import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Track } from '../../shared/track.ts'
import { mergeTracks } from './merge.ts'

const track = (id: string, originalFilename: string, source = 'r2'): Track => ({
  id,
  title: id,
  artist: 'A',
  url: `https://x/${id}`,
  source,
  license: 'CC0',
  originalFilename,
})

test('giữ thứ tự: nguồn trước, rồi thứ tự trong nguồn', () => {
  const merged = mergeTracks([[track('a', 'a.mp3'), track('b', 'b.mp3')], [track('c', 'c.mp3')]])
  assert.deepEqual(merged.map((t) => t.id), ['a', 'b', 'c'])
})

test('cùng tên file gốc ở hai nguồn: nguồn đứng trước thắng', () => {
  const merged = mergeTracks([[track('r2-1', 'same.mp3', 'r2')], [track('local-1', 'same.mp3', 'manifest'), track('local-2', 'only-local.mp3', 'manifest')]])
  assert.deepEqual(merged.map((t) => t.id), ['r2-1', 'local-2'])
  assert.equal(merged[0].source, 'r2')
})

test('cùng id thì chỉ giữ một', () => {
  assert.deepEqual(mergeTracks([[track('x', 'a.mp3')], [track('x', 'b.mp3')]]).map((t) => t.originalFilename), ['a.mp3'])
})

test('trùng ngay trong một nguồn cũng bị bỏ; tên file rỗng thì không dùng để so', () => {
  assert.equal(mergeTracks([[track('a', 'dup.mp3'), track('b', 'dup.mp3')]]).length, 1)
  assert.equal(mergeTracks([[track('a', ''), track('b', '')]]).length, 2)
})

test('danh sách rỗng', () => {
  assert.deepEqual(mergeTracks([]), [])
  assert.deepEqual(mergeTracks([[], []]), [])
})

test('không sửa dữ liệu đầu vào', () => {
  const list = [track('a', 'a.mp3')]
  mergeTracks([list, list])
  assert.equal(list.length, 1)
})
