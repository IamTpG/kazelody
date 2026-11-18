import { getAdminHandlers } from '../_lib/deps.ts'
import { handle } from '../_lib/http.ts'

export const POST = handle((request) => getAdminHandlers().logout(request))
