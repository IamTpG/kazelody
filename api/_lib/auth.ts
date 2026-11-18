import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/*
 * Phiên đăng nhập của admin: cookie `kz_session` = base64url({exp}) + "." + HMAC-SHA256(SESSION_SECRET).
 * Không lưu gì ở máy chủ; đổi SESSION_SECRET là mọi phiên hết hiệu lực.
 */

export const SESSION_COOKIE = 'kz_session'
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const COOKIE_PATH = '/api/admin'

const mac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest()

export function signSession(secret: string, nowMs: number, ttlSeconds: number = SESSION_TTL_SECONDS): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString('base64url')
  return `${payload}.${mac(secret, payload).toString('base64url')}`
}

export function verifySession(secret: string, token: string | null | undefined, nowMs: number): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false
  const [payload, signature] = parts
  const expected = mac(secret, payload)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof exp === 'number' && exp > nowMs / 1000
  } catch {
    return false
  }
}

/** So sánh mật khẩu trong thời gian không phụ thuộc vào độ giống nhau (băm cả hai về cùng độ dài rồi mới so). */
export function checkPassword(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

export const isSecure = (request: Request) => new URL(request.url).protocol === 'https:'

export function sessionCookie(token: string, secure: boolean, maxAgeSeconds: number = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie('', secure, 0)
}

/**
 * Phòng CSRF (ngoài SameSite=Strict): lệnh ghi phải mang header Origin đúng bằng origin của site.
 * Không có Origin thì từ chối (trình duyệt luôn gửi Origin cho POST/PATCH/DELETE).
 */
export function sameOrigin(request: Request, publicOrigin?: string): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  return origin === (publicOrigin ?? new URL(request.url).origin)
}
