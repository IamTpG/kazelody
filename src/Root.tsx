import { Suspense, lazy } from 'react'
import App from './App.tsx'

// Trang quản trị chỉ tải khi vào /admin: trang nghe nhạc không phải tải thêm mã của nó.
const AdminPage = lazy(() => import('./admin/AdminPage'))
const isAdmin = /^\/admin(\/|$)/.test(window.location.pathname)

export default function Root() {
  return isAdmin ? (
    <Suspense fallback={null}>
      <AdminPage />
    </Suspense>
  ) : (
    <App />
  )
}
