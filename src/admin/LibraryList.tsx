import { useState } from 'react'
import { validateMeta, type Library, type StoredTrack } from '../../shared/library.ts'
import { formatDuration } from '../../shared/time.ts'
import { LICENSES, type LicenseId } from '../../shared/track.ts'
import { adminApi } from './api'
import { card, dangerButton, formatBytes, ghostButton, inputClass, primaryButton, selectClass } from './ui'

type Props = {
  library: Library | null
  /** Làm mới thư viện từ máy chủ sau mỗi thay đổi */
  onChanged: () => Promise<void>
  /** Xử lý lỗi chung (vd. 401 → về màn đăng nhập); trả về thông báo để hiển thị */
  onError: (error: unknown) => string
}

type Editing = { id: string; title: string; artist: string; license: string; sourceDomain: string }

export function LibraryList({ library, onChanged, onError }: Props) {
  /** Id bài đang có thao tác chạy dở (khoá mọi nút để khỏi bấm chồng) */
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tracks = library?.tracks ?? []

  /** Chạy một thao tác, báo lỗi và làm mới thư viện. Trả về true nếu thành công. */
  async function run(id: string, action: () => Promise<void>): Promise<boolean> {
    setBusy(id)
    setError(null)
    try {
      await action()
      await onChanged()
      return true
    } catch (failure) {
      setError(onError(failure))
      return false
    } finally {
      setBusy(null)
    }
  }

  const startEdit = (track: StoredTrack) => {
    setConfirming(null)
    setEditing({ id: track.id, title: track.title, artist: track.artist, license: track.license, sourceDomain: track.sourceDomain ?? '' })
  }

  const saveEdit = async () => {
    if (!editing) return
    const meta = validateMeta(editing)
    if (!meta.ok) {
      setError(meta.error)
      return
    }
    if (await run(editing.id, () => adminApi.update(editing.id, { ...meta.value, sourceDomain: meta.value.sourceDomain ?? '' }).then(() => undefined))) {
      setEditing(null)
    }
  }

  return (
    <section className={`${card} grid grid-cols-[minmax(0,1fr)] gap-4`} aria-labelledby="library-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="library-title" className="text-lg font-bold">
          Thư viện {library && <span className="text-sm font-medium text-white/75">({tracks.length} bài, theo thứ tự phát)</span>}
        </h2>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-400/20 ring-1 ring-rose-200/40 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      )}

      {library === null && <p className="text-sm text-white/80">Đang tải thư viện…</p>}
      {library && tracks.length === 0 && <p className="text-sm text-white/80">Chưa có bài nào. Kéo file nhạc vào khung phía trên để bắt đầu.</p>}

      <ol className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {tracks.map((track, index) => {
          const locked = busy !== null
          const attribution = LICENSES[track.license].attributionRequired
          const isEditing = editing?.id === track.id

          return (
            <li key={track.id} className="rounded-xl bg-black/20 p-3 ring-1 ring-white/15">
              {isEditing ? (
                <EditForm editing={editing} onChange={setEditing} onSave={() => void saveEdit()} onCancel={() => { setEditing(null); setError(null) }} saving={busy === track.id} />
              ) : (
                <div className="flex items-start gap-3">
                  <span className="w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-white/70">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{track.title}</p>
                    <p className="break-words text-sm text-white/80">
                      {track.artist}
                      {!attribution && <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs">CC0: người nghe chỉ thấy tên bài</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-white/70">
                      {LICENSES[track.license].name} · {track.sourceDomain ?? 'không ghi nguồn'} · {formatBytes(track.size)} ·{' '}
                      {track.duration ? formatDuration(track.duration) : 'chưa có thời lượng'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {confirming === track.id ? (
                      <>
                        <button type="button" className={dangerButton} disabled={locked} onClick={() => void run(track.id, () => adminApi.remove(track.id)).then(() => setConfirming(null))}>
                          Xoá hẳn
                        </button>
                        <button type="button" className={ghostButton} disabled={locked} onClick={() => setConfirming(null)}>
                          Huỷ
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={ghostButton} disabled={locked || index === 0} onClick={() => void run(track.id, () => adminApi.update(track.id, { moveTo: index - 1 }).then(() => undefined))} aria-label={`Đưa "${track.title}" lên trên`}>
                          ↑
                        </button>
                        <button type="button" className={ghostButton} disabled={locked || index === tracks.length - 1} onClick={() => void run(track.id, () => adminApi.update(track.id, { moveTo: index + 1 }).then(() => undefined))} aria-label={`Đưa "${track.title}" xuống dưới`}>
                          ↓
                        </button>
                        <button type="button" className={ghostButton} disabled={locked} onClick={() => startEdit(track)}>
                          Sửa
                        </button>
                        <button type="button" className={ghostButton} disabled={locked} onClick={() => { setEditing(null); setConfirming(track.id) }}>
                          Xoá
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {confirming === track.id && (
                <p className="mt-2 text-sm text-rose-100">Xoá "{track.title}" khỏi thư viện và xoá luôn file trên R2? Không hoàn tác được.</p>
              )}
            </li>
          )
        })}
      </ol>

      <p className="text-xs text-white/70">Thay đổi hiển thị với người nghe sau tối đa 5 phút (CDN giữ danh sách bài).</p>
    </section>
  )
}

type EditFormProps = {
  editing: Editing
  onChange: (editing: Editing) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}

function EditForm({ editing, onChange, onSave, onCancel, saving }: EditFormProps) {
  const set = (patch: Partial<Editing>) => onChange({ ...editing, ...patch })
  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)] gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <fieldset disabled={saving} className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs text-white/80">
          Tên bài
          <input className={inputClass} value={editing.title} onChange={(event) => set({ title: event.target.value })} autoFocus />
        </label>
        <label className="grid gap-1 text-xs text-white/80">
          Tác giả
          <input className={inputClass} value={editing.artist} onChange={(event) => set({ artist: event.target.value })} />
        </label>
        <label className="grid gap-1 text-xs text-white/80">
          License
          <select className={selectClass} value={editing.license} onChange={(event) => set({ license: event.target.value })}>
            {(Object.keys(LICENSES) as LicenseId[]).map((id) => (
              <option key={id} value={id}>
                {LICENSES[id].name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-white/80">
          Nguồn (tên miền, tuỳ chọn)
          <input className={inputClass} value={editing.sourceDomain} onChange={(event) => set({ sourceDomain: event.target.value })} />
        </label>
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={primaryButton} disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        <button type="button" className={ghostButton} onClick={onCancel} disabled={saving}>
          Huỷ
        </button>
      </div>
    </form>
  )
}
