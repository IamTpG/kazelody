import { getAdminHandlers } from '../_lib/deps.ts'
import { handle } from '../_lib/http.ts'

export const GET = handle((request) => getAdminHandlers().session(request))
