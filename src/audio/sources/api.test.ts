import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApiSource } from './api.ts'

const MIN = 60_000
const track = (n: number, url = `https://r2.test/${n}?sig=v1`) => ({
  id: `id${n}`,
  title: `Title ${n}`,
  artist: `Artist ${n}`,
  license: n % 2 ? 'CC0' : 'CC-BY-4.0',
  originalFilename: `f${n}.mp3`,
  url,
})

/** Máy chủ giả: mỗi lần gọi trả một "thế hệ" URL mới, hết hạn sau `ttlMs`. */
function fakeServer(clock: { now: number }, ttlMs = 180 * MIN) {
  const calls = { count: 0 }
  let generation = 0
  const fetchFn = async () => {
    calls.count++
    generation++
    const tracks = [1, 2].map((n) => track(n, `https://r2.test/${n}?sig=v${generation}`))
    return new Response(JSON.stringify({ tracks, expiresAt: clock.now + ttlMs }), { status: 200 })
  }
  return { fetchFn, calls }
}

test('list: đổi sang Track (source r2, giữ url), nhớ hạn dùng', async () => {
  const clock = { now: 1_000_000 }
  const { fetchFn } = fakeServer(clock)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const tracks = await source.list()
  assert.equal(tracks.length, 2)
  assert.equal(tracks[0].source, 'r2')
  assert.equal(tracks[0].url, 'https://r2.test/1?sig=v1')
  assert.equal(tracks[1].title, 'Title 2')
})

test('list: lỗi/HTML/503/JSON lạ/mạng đứt đều ra danh sách rỗng, không ném lỗi', async () => {
  const cases: Record<string, () => Promise<Response>> = {
    'index.html của Vite dev': async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    '503': async () => new Response(JSON.stringify({ error: 'x' }), { status: 503 }),
    '404': async () => new Response('', { status: 404 }),
    'thiếu expiresAt': async () => new Response(JSON.stringify({ tracks: [] }), { status: 200 }),
    'tracks không phải mảng': async () => new Response(JSON.stringify({ tracks: 'x', expiresAt: 1 }), { status: 200 }),
    'null': async () => new Response('null', { status: 200 }),
    'mạng đứt': async () => {
      throw new TypeError('Failed to fetch')
    },
  }
  for (const [name, fetchFn] of Object.entries(cases)) {
    assert.deepEqual(await createApiSource({ fetchFn }).list(), [], name)
  }
})

test('list: bỏ qua bài hỏng, giữ các bài tốt', async () => {
  const silence = console.warn
  console.warn = () => {}
  try {
    const fetchFn = async () =>
      new Response(JSON.stringify({ tracks: [track(1), { id: 'x' }, { ...track(3), license: 'MIT' }, track(2)], expiresAt: 1 }), { status: 200 })
    const tracks = await createApiSource({ fetchFn }).list()
    assert.deepEqual(tracks.map((t) => t.id), ['id1', 'id2'])
  } finally {
    console.warn = silence
  }
})

test('resolve: URL còn hạn thì giữ nguyên, không gọi lại API', async () => {
  const clock = { now: 1_000_000 }
  const { fetchFn, calls } = fakeServer(clock)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const [first] = await source.list()
  clock.now += 100 * MIN // còn 80 phút
  assert.equal(await source.resolve!(first), 'https://r2.test/1?sig=v1')
  assert.equal(calls.count, 1)
})

test('resolve: còn dưới 15 phút thì xin danh sách mới và trả URL mới của đúng bài đó', async () => {
  const clock = { now: 1_000_000 }
  const { fetchFn, calls } = fakeServer(clock)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const [first, second] = await source.list()
  clock.now += 170 * MIN // còn 10 phút
  assert.equal(await source.resolve!(second), 'https://r2.test/2?sig=v2')
  assert.equal(calls.count, 2)
  // URL mới có hiệu lực 3 giờ nữa nên bài khác cũng không phải xin lại
  assert.equal(await source.resolve!(first), 'https://r2.test/1?sig=v2')
  assert.equal(calls.count, 2)
})

test('resolve: gần hết hạn đúng ranh giới 15 phút thì làm mới', async () => {
  const clock = { now: 0 }
  const { fetchFn, calls } = fakeServer(clock, 60 * MIN)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const [first] = await source.list()
  clock.now = 44 * MIN + 59_000
  await source.resolve!(first)
  assert.equal(calls.count, 1)
  clock.now = 45 * MIN
  await source.resolve!(first)
  assert.equal(calls.count, 2)
})

test('resolve: nhiều lần gọi đồng thời chỉ tốn một request', async () => {
  const clock = { now: 1_000_000 }
  const { fetchFn, calls } = fakeServer(clock)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const [first, second] = await source.list()
  clock.now += 175 * MIN
  const urls = await Promise.all([source.resolve!(first), source.resolve!(second), source.resolve!(first)])
  assert.equal(calls.count, 2, '1 lần list + đúng 1 lần làm mới')
  assert.deepEqual(urls, ['https://r2.test/1?sig=v2', 'https://r2.test/2?sig=v2', 'https://r2.test/1?sig=v2'])
})

test('resolve: làm mới thất bại thì vẫn dùng URL cũ để phát', async () => {
  const clock = { now: 1_000_000 }
  let failing = false
  const server = fakeServer(clock)
  const fetchFn = async () => {
    if (failing) throw new TypeError('Failed to fetch')
    return server.fetchFn()
  }
  const source = createApiSource({ fetchFn, now: () => clock.now })
  const [first] = await source.list()
  clock.now += 175 * MIN
  failing = true
  assert.equal(await source.resolve!(first), 'https://r2.test/1?sig=v1')
})

test('resolve: bài không có trong danh sách mới thì dùng url sẵn có của bài', async () => {
  const clock = { now: 1_000_000 }
  const { fetchFn } = fakeServer(clock)
  const source = createApiSource({ fetchFn, now: () => clock.now })
  await source.list()
  const gone = { ...track(9), source: 'r2', license: 'CC0' as const }
  assert.equal(await source.resolve!(gone), gone.url)
})
