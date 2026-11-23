import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createR2Storage } from './r2.ts'

/*
 * Ký URL là phép tính cục bộ (không gọi mạng) nên kiểm tra được cấu trúc URL ngay cả khi dùng khoá giả.
 * Không kiểm tra được việc R2 thật có chấp nhận hay không: phần đó cần một lần upload thật (xem docs/backend-r2.md).
 */

const KEY = 'audio/00000000-0000-4000-8000-000000000001.mp3'
const storage = createR2Storage({ accountId: 'acc123', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secretexample', bucket: 'kz-audio' })

test('presignGet: trỏ tới đúng bucket/object trên R2, đúng hạn, chỉ ký host', async () => {
  const url = new URL(await storage.presignGet(KEY, 10_800))
  assert.equal(url.protocol, 'https:')
  assert.equal(url.hostname, 'kz-audio.acc123.r2.cloudflarestorage.com')
  assert.equal(url.pathname, `/${KEY}`)
  assert.equal(url.searchParams.get('X-Amz-Expires'), '10800')
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
  assert.match(url.searchParams.get('X-Amz-Credential')!, /^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/)
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host')
  assert.ok(url.searchParams.get('X-Amz-Signature'))
})

test('presignPut: ký cả Content-Type để URL chỉ dùng được với đúng loại file', async () => {
  const url = new URL(await storage.presignPut(KEY, 'audio/mpeg', 900))
  assert.equal(url.pathname, `/${KEY}`)
  assert.equal(url.searchParams.get('X-Amz-Expires'), '900')
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host')
})

test('URL ký không chứa tham số checksum mà R2 từ chối (SDK mới thêm mặc định)', async () => {
  for (const signed of [await storage.presignGet(KEY, 60), await storage.presignPut(KEY, 'audio/mpeg', 60)]) {
    const names = [...new URL(signed).searchParams.keys()].map((name) => name.toLowerCase())
    assert.ok(!names.some((name) => name.includes('checksum') && name !== 'x-amz-content-sha256'), names.join(','))
    assert.ok(!names.includes('x-amz-sdk-checksum-algorithm'))
  }
})

test('URL ký không lộ khoá bí mật', async () => {
  const signed = await storage.presignPut(KEY, 'audio/mpeg', 900)
  assert.ok(!signed.includes('secretexample'))
})

test('chữ ký thay đổi theo object và theo Content-Type', async () => {
  const signature = (url: string) => new URL(url).searchParams.get('X-Amz-Signature')
  const a = signature(await storage.presignPut(KEY, 'audio/mpeg', 900))
  const b = signature(await storage.presignPut(KEY, 'audio/wav', 900))
  const c = signature(await storage.presignPut(KEY.replace('1.mp3', '2.mp3'), 'audio/mpeg', 900))
  assert.notEqual(a, b)
  assert.notEqual(a, c)
})
