import { useState, type FormEvent } from 'react'
import { adminApi } from './api'
import { card, errorMessage, inputClass, primaryButton } from './ui'

type Props = {
  onSignedIn: () => void
  /** Lý do quay lại màn đăng nhập (vd. phiên hết hạn) */
  notice: string | null
}

export function LoginForm({ onSignedIn, notice }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.login(password)
      onSignedIn()
    } catch (failure) {
      setError(errorMessage(failure))
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-4">
      <h1 className="text-center text-3xl font-bold tracking-wide">
        KazeLody
        <span className="mt-1 block text-sm font-medium opacity-80">Quản trị</span>
      </h1>

      <form onSubmit={submit} className={`${card} grid gap-4`} aria-label="Đăng nhập quản trị">
        {notice && (
          <p role="status" className="rounded-lg bg-amber-200/20 px-3 py-2 text-sm text-amber-100">
            {notice}
          </p>
        )}
        <label className="grid gap-1.5 text-sm">
          <span className="text-white/80">Mật khẩu</span>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-300/20 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}
        <button type="submit" className={primaryButton} disabled={busy || !password}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>

      <p className="text-center text-sm">
        <a href="/" className="text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white">
          Về trang nghe nhạc
        </a>
      </p>
    </main>
  )
}
