import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readDuration } from './duration.ts'

type Listener = () => void

/** Audio giả: test tự quyết định lúc nào "nạp xong metadata" hay "lỗi". */
function fakeAudio() {
  const listeners = new Map<string, Listener[]>()
  const audio = {
    src: '',
    preload: '',
    duration: Number.NaN,
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
  }
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener())
  return { audio, fire }
}

function harness(timeoutMs = 50) {
  const urls = { created: [] as string[], revoked: [] as string[] }
  const f = fakeAudio()
  return {
    f,
    urls,
    deps: {
      createAudio: () => f.audio,
      createObjectUrl: () => {
        const url = `blob:test/${urls.created.length}`
        urls.created.push(url)
        return url
      },
      revokeObjectUrl: (url: string) => void urls.revoked.push(url),
      timeoutMs,
    },
  }
}

const blob = new Blob(['x'])

test('đọc được: trả về thời lượng, chỉ nạp metadata, thu hồi URL tạm', async () => {
  const h = harness()
  const promise = readDuration(blob, h.deps)
  assert.equal(h.f.audio.preload, 'metadata')
  assert.equal(h.f.audio.src, 'blob:test/0')
  h.f.audio.duration = 224.6
  h.f.fire('loadedmetadata')
  assert.equal(await promise, 224.6)
  assert.deepEqual(h.urls.revoked, ['blob:test/0'])
})

test('lỗi giải mã → null, URL tạm vẫn được thu hồi', async () => {
  const h = harness()
  const promise = readDuration(blob, h.deps)
  h.f.fire('error')
  assert.equal(await promise, null)
  assert.deepEqual(h.urls.revoked, ['blob:test/0'])
})

test('giá trị lạ → null (vô cực của luồng, 0, NaN, âm, quá 24 giờ)', async () => {
  for (const weird of [Number.POSITIVE_INFINITY, 0, Number.NaN, -3, 100_000]) {
    const h = harness()
    const promise = readDuration(blob, h.deps)
    h.f.audio.duration = weird
    h.f.fire('loadedmetadata')
    assert.equal(await promise, null, String(weird))
  }
})

test('quá thời hạn → null, không treo mãi', async () => {
  const h = harness(20)
  assert.equal(await readDuration(blob, h.deps), null)
  assert.deepEqual(h.urls.revoked, ['blob:test/0'])
})

test('sự kiện đến muộn sau khi đã xong không làm gì thêm (không thu hồi hai lần)', async () => {
  const h = harness()
  const promise = readDuration(blob, h.deps)
  h.f.audio.duration = 10
  h.f.fire('loadedmetadata')
  h.f.fire('error')
  h.f.fire('loadedmetadata')
  assert.equal(await promise, 10)
  assert.equal(h.urls.revoked.length, 1)
})

test('môi trường không tạo được audio/URL → null thay vì ném lỗi', async () => {
  const result = await readDuration(blob, {
    createAudio: () => {
      throw new Error('không có Audio')
    },
  })
  assert.equal(result, null)
})
