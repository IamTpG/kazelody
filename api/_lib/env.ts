/*
 * Đọc cấu hình từ biến môi trường (Vercel, hoặc `node --env-file=...` ở máy dev). Thiếu thì ném ConfigError
 * (người dùng chỉ thấy thông báo chung, tên biến chỉ ghi vào log máy chủ).
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

type Source = Record<string, string | undefined>

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export type AdminConfig = {
  adminPassword: string
  sessionSecret: string
  /** Chỉ đặt khi site nằm sau một proxy viết lại Origin; bỏ trống thì so với chính host của request */
  publicOrigin?: string
}

export const DEFAULT_PRESIGN_TTL_SECONDS = 3 * 60 * 60
const MIN_PRESIGN_TTL = 60
const MAX_PRESIGN_TTL = 7 * 24 * 60 * 60
const MIN_PASSWORD_LENGTH = 8
const MIN_SECRET_LENGTH = 32

function required(source: Source, names: string[]): Record<string, string> {
  const missing = names.filter((name) => !source[name]?.trim())
  if (missing.length > 0) throw new ConfigError(`Thiếu biến môi trường: ${missing.join(', ')}`)
  return Object.fromEntries(names.map((name) => [name, source[name]!.trim()]))
}

export function loadR2Config(source: Source): R2Config {
  const v = required(source, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
  return { accountId: v.R2_ACCOUNT_ID, accessKeyId: v.R2_ACCESS_KEY_ID, secretAccessKey: v.R2_SECRET_ACCESS_KEY, bucket: v.R2_BUCKET }
}

export function loadAdminConfig(source: Source): AdminConfig {
  const v = required(source, ['ADMIN_PASSWORD', 'SESSION_SECRET'])
  if (v.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) throw new ConfigError(`ADMIN_PASSWORD phải dài ít nhất ${MIN_PASSWORD_LENGTH} ký tự`)
  if (v.SESSION_SECRET.length < MIN_SECRET_LENGTH) throw new ConfigError(`SESSION_SECRET phải dài ít nhất ${MIN_SECRET_LENGTH} ký tự`)
  const origin = source.PUBLIC_ORIGIN?.trim().replace(/\/+$/, '')
  return { adminPassword: v.ADMIN_PASSWORD, sessionSecret: v.SESSION_SECRET, ...(origin ? { publicOrigin: origin } : {}) }
}

/** Thời hạn URL nghe nhạc (giây). Mặc định 3 giờ; đặt ngắn (vd. 120) để thử cơ chế làm mới URL. Giá trị sai thì dùng mặc định. */
export function loadPresignTtl(source: Source): number {
  const raw = Number(source.R2_PRESIGN_TTL_SECONDS)
  if (!Number.isInteger(raw) || raw < MIN_PRESIGN_TTL || raw > MAX_PRESIGN_TTL) return DEFAULT_PRESIGN_TTL_SECONDS
  return raw
}
