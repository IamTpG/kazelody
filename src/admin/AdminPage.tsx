import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './api'
import { Dashboard } from './Dashboard'
import { LoginForm } from './LoginForm'
import { errorMessage } from './ui'

type Auth = 'checking' | 'out' | 'in'

/** Trang /admin. Được tải theo yêu cầu (React.lazy trong main.tsx) nên không làm nặng trang nghe nhạc. */
export default function AdminPage() {
  const [auth, setAuth] = useState<Auth>('checking')
  const [notice, setNotice] = useState<string | null>(null)

  // Trang quản trị không nên xuất hiện trên công cụ tìm kiếm (vercel.json cũng gửi X-Robots-Tag).
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Quản trị · KazeLody'
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex,nofollow'
    document.head.append(robots)
    return () => {
      document.title = previousTitle
      robots.remove()
    }
  }, [])

  useEffect(() => {
    let alive = true
    adminApi
      .session()
      .then((signedIn) => alive && setAuth(signedIn ? 'in' : 'out'))
      .catch((error: unknown) => {
        if (!alive) return
        setNotice(errorMessage(error))
        setAuth('out')
      })
    return () => {
      alive = false
    }
  }, [])

  const signedOut = useCallback((reason?: string) => {
    setNotice(reason ?? null)
    setAuth('out')
  }, [])

  return (
    // Trang nghe nhạc khoá cuộn toàn trang; riêng trang admin cần cuộn nên tự cuộn trong khung này.
    <div className="h-full overflow-y-auto bg-gradient-to-b from-[#3d4776] via-[#56649f] to-[#6f7fb8] font-sans text-white">
      {auth === 'checking' && <p className="p-6 text-center text-white/70">Đang kiểm tra phiên…</p>}
      {auth === 'out' && <LoginForm notice={notice} onSignedIn={() => { setNotice(null); setAuth('in') }} />}
      {auth === 'in' && <Dashboard onSignedOut={signedOut} />}
    </div>
  )
}
