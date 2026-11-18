import { randomUUID } from 'node:crypto'
import { createAdminHandlers, type AdminDeps, type PublicDeps } from './handlers.ts'
import { loadAdminConfig, loadPresignTtl, loadR2Config } from './env.ts'
import { createR2Storage } from './r2.ts'

/*
 * Ghép phụ thuộc thật từ biến môi trường, lúc có request (không phải lúc nạp module): thiếu cấu hình thì
 * trả 503 chứ không làm cả hàm sập khi khởi động. Kết quả được nhớ lại cho các lần gọi sau trong cùng một instance.
 */

let publicDeps: PublicDeps | undefined
let adminDeps: AdminDeps | undefined
let adminHandlers: ReturnType<typeof createAdminHandlers> | undefined

export function getPublicDeps(): PublicDeps {
  publicDeps ??= {
    storage: createR2Storage(loadR2Config(process.env)),
    presignTtl: loadPresignTtl(process.env),
    now: () => new Date(),
  }
  return publicDeps
}

export function getAdminHandlers() {
  if (!adminHandlers) {
    adminDeps ??= {
      ...getPublicDeps(),
      ...loadAdminConfig(process.env),
      randomId: () => randomUUID(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }
    adminHandlers = createAdminHandlers(adminDeps)
  }
  return adminHandlers
}
