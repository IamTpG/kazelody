import { getAdminHandlers } from '../../_lib/deps.ts'
import { handle } from '../../_lib/http.ts'

export const PATCH = handle((request) => getAdminHandlers().patch(request))
export const DELETE = handle((request) => getAdminHandlers().remove(request))
