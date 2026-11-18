import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import {
  checkPassword,
  clearSessionCookie,
  isSecure,
  readCookie,
  sameOrigin,
  sessionCookie,
  signSession,
  verifySession,
} from './auth.ts'

const SECRET = 'a'.repeat(40)
const NOW = Date.parse('2026-11-18T10:00:00Z')

test('phiên: ký rồi kiểm tra được', () => {
  assert.ok(verifySession(SECRET, signSession(SECRET, NOW), NOW + 1000))
})

test('phiên: hết hạn thì không hợp lệ', () => {
  const token = signSession(SECRET, NOW, 60)
  assert.ok(verifySession(SECRET, token, NOW + 59_000))
  assert.ok(!verifySession(SECRET, token, NOW + 61_000))
})

test('phiên: sai secret, sửa payload hoặc chữ ký, định dạng hỏng đều bị từ chối', () => {
  const token = signSession(SECRET, NOW)
  assert.ok(!verifySession('b'.repeat(40), token, NOW))
  const [payload, signature] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ exp: 9_999_999_999 })).toString('base64url')
  assert.ok(!verifySession(SECRET, `${forged}.${signature}`, NOW), 'sửa payload')
  assert.ok(!verifySession(SECRET, `${payload}.${signature.slice(0, -2)}AA`, NOW), 'sửa chữ ký')
  for (const bad of ['', 'abc', 'a.b.c', '.', `${payload}.`, `.${signature}`, null, undefined]) {
    assert.ok(!verifySession(SECRET, bad as string, NOW), String(bad))
  }
})

test('phiên: payload không phải JSON dù chữ ký đúng vẫn bị từ chối', () => {
  const payload = Buffer.from('không phải json').toString('base64url')
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')
  assert.ok(!verifySession(SECRET, `${payload}.${signature}`, NOW))
})

test('checkPassword', () => {
  assert.ok(checkPassword('đúng-mật-khẩu', 'đúng-mật-khẩu'))
  assert.ok(!checkPassword('sai', 'đúng-mật-khẩu'))
  assert.ok(!checkPassword('', 'đúng-mật-khẩu'))
  assert.ok(!checkPassword('đúng-mật-khẩu ', 'đúng-mật-khẩu'))
})

test('readCookie', () => {
  const request = (cookie?: string) => new Request('https://x.test/', { headers: cookie ? { cookie } : {} })
  assert.equal(readCookie(request('a=1; kz_session=tok.en; b=2'), 'kz_session'), 'tok.en')
  assert.equal(readCookie(request('kz_session=abc'), 'kz_session'), 'abc')
  assert.equal(readCookie(request('xkz_session=abc'), 'kz_session'), null)
  assert.equal(readCookie(request('a=1'), 'kz_session'), null)
  assert.equal(readCookie(request(), 'kz_session'), null)
})

test('cookie phiên: HttpOnly, SameSite=Strict, đường dẫn hẹp; Secure theo giao thức', () => {
  const cookie = sessionCookie('tok', true)
  assert.match(cookie, /^kz_session=tok;/)
  for (const attribute of ['HttpOnly', 'SameSite=Strict', 'Path=/api/admin', 'Secure', 'Max-Age=604800']) {
    assert.ok(cookie.includes(attribute), attribute)
  }
  assert.ok(!sessionCookie('tok', false).includes('Secure'))
  assert.ok(clearSessionCookie(true).includes('Max-Age=0'))
  assert.ok(isSecure(new Request('https://x.test/')))
  assert.ok(!isSecure(new Request('http://localhost:3000/')))
})

test('sameOrigin: bắt buộc có Origin và phải khớp', () => {
  const request = (origin?: string) => new Request('https://kazelody.test/api/admin/x', { method: 'POST', headers: origin ? { origin } : {} })
  assert.ok(sameOrigin(request('https://kazelody.test')))
  assert.ok(!sameOrigin(request('https://evil.test')))
  assert.ok(!sameOrigin(request('https://kazelody.test.evil.test')))
  assert.ok(!sameOrigin(request()))
  assert.ok(sameOrigin(request('https://custom.test'), 'https://custom.test'))
  assert.ok(!sameOrigin(request('https://kazelody.test'), 'https://custom.test'))
})
