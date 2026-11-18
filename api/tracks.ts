import { getPublicDeps } from './_lib/deps.ts'
import { createTracksHandler } from './_lib/handlers.ts'
import { handle } from './_lib/http.ts'

/** GET /api/tracks: danh sách bài kèm URL nghe đã ký (CDN giữ 5 phút). */
export const GET = handle((request) => createTracksHandler(getPublicDeps())(request))
