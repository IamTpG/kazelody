import { useCallback, useEffect, useState } from 'react'
import type { Library } from '../../shared/library.ts'
import { ApiError, adminApi } from './api'
import { LibraryList } from './LibraryList'
import { UploadPanel } from './UploadPanel'
import { errorMessage, ghostButton } from './ui'

type Props = {
  /** Về màn đăng nhập (kèm lý do nếu có) */
  onSignedOut: (reason?: string) => void
}

export function Dashboard({ onSignedOut }: Props) {
  const [library, setLibrary] = useState<Library | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** Lỗi 401 ở bất kỳ đâu nghĩa là phiên đã hết hạn: về màn đăng nhập. Luôn trả về thông báo để hiển thị. */
  const handleError = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError && error.status === 401) onSignedOut('Phiên đã hết hạn, hãy đăng nhập lại.')
      return errorMessage(error)
    },
    [onSignedOut],
  )

  const reload = useCallback(async () => {
    try {
      setLibrary(await adminApi.library())
      setLoadError(null)
    } catch (error) {
      setLoadError(handleError(error))
    }
  }, [handleError])

  // Tải lần đầu. (`reload` dùng cho các lần làm mới sau khi upload/sửa/xoá.)
  useEffect(() => {
    let alive = true
    adminApi
      .library()
      .then((loaded) => alive && setLibrary(loaded))
      .catch((error: unknown) => alive && setLoadError(handleError(error)))
    return () => {
      alive = false
    }
  }, [handleError])

  const logout = async () => {
    await adminApi.logout().catch(() => undefined)
    onSignedOut()
  }

  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-5xl gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide">
          KazeLody
          <span className="ml-2 text-sm font-medium opacity-80">Quản trị</span>
        </h1>
        <nav className="flex gap-2" aria-label="Điều hướng">
          <a href="/" className={ghostButton}>
            Trang nghe nhạc
          </a>
          <button type="button" className={ghostButton} onClick={() => void logout()}>
            Đăng xuất
          </button>
        </nav>
      </header>

      {loadError && (
        <p role="alert" className="rounded-lg bg-rose-400/20 ring-1 ring-rose-200/40 px-3 py-2 text-sm text-rose-100">
          Không tải được thư viện: {loadError}{' '}
          <button type="button" className="underline" onClick={() => void reload()}>
            Thử lại
          </button>
        </p>
      )}

      <UploadPanel existing={library?.tracks ?? []} onUploaded={reload} onError={handleError} />
      <LibraryList library={library} onChanged={reload} onError={handleError} />
    </div>
  )
}
