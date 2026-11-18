import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as tracks from '../tracks.ts'
import * as adminLogin from '../admin/login.ts'
import * as adminLogout from '../admin/logout.ts'
import * as adminSession from '../admin/session.ts'
import * as adminUploadUrl from '../admin/upload-url.ts'
import * as adminTracks from '../admin/tracks.ts'
import * as adminTrackItem from '../admin/tracks/[id].ts'

/*
 * Các file trong api/ là thứ Vercel thật sự chạy. Test này đảm bảo: (1) chúng nạp được (mọi import giải quyết được),
 * (2) xuất đúng phương thức HTTP, (3) khi chưa cấu hình R2/admin thì trả 503 chung chung thay vì làm hàm sập.
 */

const ENV_NAMES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'PUBLIC_ORIGIN']

function withoutEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
  for (const name of ENV_NAMES) delete process.env[name]
  const silence = console.error
  console.error = () => {}
  return fn().finally(() => {
    console.error = silence
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })
}

const request = (method: string) =>
  new Request('https://kazelody.test/api/x', { method, headers: { origin: 'https://kazelody.test', 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) })

const endpoints: [string, Record<string, unknown>, string[]][] = [
  ['api/tracks', tracks, ['GET']],
  ['api/admin/login', adminLogin, ['POST']],
  ['api/admin/logout', adminLogout, ['POST']],
  ['api/admin/session', adminSession, ['GET']],
  ['api/admin/upload-url', adminUploadUrl, ['POST']],
  ['api/admin/tracks', adminTracks, ['GET', 'POST']],
  ['api/admin/tracks/[id]', adminTrackItem, ['PATCH', 'DELETE']],
]

test('mỗi endpoint xuất đúng các phương thức HTTP (và không gì khác)', () => {
  for (const [name, module, methods] of endpoints) {
    const exported = Object.keys(module).sort()
    assert.deepEqual(exported, [...methods].sort(), name)
    for (const method of methods) assert.equal(typeof module[method], 'function', `${name} ${method}`)
  }
})

test('chưa cấu hình môi trường → 503 chung chung, không lộ tên biến, không ném lỗi', async () => {
  await withoutEnv(async () => {
    for (const [name, module, methods] of endpoints) {
      for (const method of methods) {
        const response = await (module[method] as (r: Request) => Promise<Response>)(request(method))
        assert.equal(response.status, 503, `${name} ${method}`)
        const text = JSON.stringify(await response.json())
        assert.ok(!/R2_|SESSION_SECRET|ADMIN_PASSWORD/.test(text), `${name} ${method} lộ tên biến: ${text}`)
      }
    }
  })
})
