import { ConfigError } from './env.ts'
import { LibraryCorruptError } from './storage.ts'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export type Handler = (request: Request) => Promise<Response> | Response

/** JSON mặc định `no-store`; chỉ endpoint công khai (/api/tracks) tự đặt Cache-Control riêng. */
export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers })
}

export const fail = (status: number, message: string): Response => json({ error: message }, { status })

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Đọc body JSON: sai Content-Type → 415, JSON hỏng hoặc không phải object → 400. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('application/json')) throw new HttpError(415, 'Cần Content-Type: application/json')
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'JSON không hợp lệ')
  }
  if (!isRecord(body)) throw new HttpError(400, 'Body phải là một object JSON')
  return body
}

/**
 * Bọc một handler: lỗi đã biết đổi thành mã HTTP tương ứng; lỗi lạ chỉ ghi log máy chủ,
 * người dùng chỉ thấy thông báo chung (không lộ chi tiết, tên biến môi trường hay khoá bí mật).
 */
export function handle(fn: Handler): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await fn(request)
    } catch (error) {
      if (error instanceof HttpError) return fail(error.status, error.message)
      if (error instanceof ConfigError) {
        console.error('[api] cấu hình thiếu:', error.message)
        return fail(503, 'Dịch vụ nhạc chưa được cấu hình')
      }
      if (error instanceof LibraryCorruptError) {
        console.error('[api]', error.message)
        return fail(500, 'Thư viện nhạc bị lỗi, cần kiểm tra thủ công')
      }
      console.error('[api] lỗi không xác định:', error instanceof Error ? error.message : error)
      return fail(500, 'Lỗi máy chủ')
    }
  }
}
