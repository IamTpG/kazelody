import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { StoredTrack } from '../../shared/library.ts'
import { LICENSES, clean, type LicenseId } from '../../shared/track.ts'
import { adminApi, type UploadTicket } from './api'
import { putFile } from './putFile'
import { UploadError, draftFromFilename, draftProblem, fileProblem, uploadTrack, type Draft, type Stage } from './upload'
import { card, ghostButton, inputClass, primaryButton, formatBytes, selectClass } from './ui'

type Status = 'idle' | Stage | 'done' | 'error'

type Row = {
  id: string
  file: File
  draft: Draft
  /** Lý do tên file không khớp quy tắc (để người dùng điền tay) */
  hint: string | null
  /** Vấn đề của chính file (đuôi, dung lượng): không thể tải lên */
  problem: string | null
  /** Đã có bài cùng tên file trong thư viện (hoặc trong hàng đợi): bỏ qua */
  duplicate: boolean
  status: Status
  progress: number
  error: string | null
  /** Có khi file đã lên R2 mà bước ghi thư viện lỗi: thử lại chỉ ghi lại */
  ticket: UploadTicket | null
}

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Sẵn sàng',
  checking: 'Đang kiểm tra…',
  signing: 'Đang xin URL…',
  uploading: 'Đang tải lên',
  saving: 'Đang lưu vào thư viện…',
  done: 'Đã thêm',
  error: 'Lỗi',
}

const ACTIVE: Status[] = ['checking', 'signing', 'uploading', 'saving']
const ACCEPT = '.mp3,.ogg,.opus,.m4a,.webm,.wav,audio/*'

type Props = {
  existing: readonly StoredTrack[]
  /** Gọi sau khi một lượt tải lên kết thúc để làm mới thư viện */
  onUploaded: () => Promise<void>
  /** Xử lý lỗi chung (vd. 401 → về màn đăng nhập); trả về thông báo để hiển thị */
  onError: (error: unknown) => string
}

const isUploadable = (row: Row) => row.status !== 'done' && !row.problem && !row.duplicate

export function UploadPanel({ existing, onUploaded, onError }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const counter = useRef(0)

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    const names = new Set<string>([...existing.map((track) => track.originalFilename), ...rows.map((row) => clean(row.file.name))])
    const added = files.map((file): Row => {
      const { draft, hint } = draftFromFilename(file.name)
      const name = clean(file.name)
      const duplicate = names.has(name)
      names.add(name)
      return { id: `row-${counter.current++}`, file, draft, hint, problem: fileProblem(file), duplicate, status: 'idle', progress: 0, error: null, ticket: null }
    })
    setRows((previous) => [...previous, ...added])
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles([...event.dataTransfer.files])
  }

  const onZoneKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      input.current?.click()
    }
  }

  const pending = rows.filter(isUploadable)
  const incomplete = pending.filter((row) => draftProblem(row.draft))
  const canStart = !busy && pending.length > 0 && incomplete.length === 0
  const hasDone = rows.some((row) => row.status === 'done')

  const start = async () => {
    setBusy(true)
    for (const row of rows.filter(isUploadable)) {
      patchRow(row.id, { status: 'checking', progress: 0, error: null })
      try {
        await uploadTrack({
          file: row.file,
          draft: row.draft,
          api: adminApi,
          put: putFile,
          ticket: row.ticket,
          onStage: (status) => patchRow(row.id, { status }),
          onProgress: (progress) => patchRow(row.id, { progress }),
        })
        patchRow(row.id, { status: 'done', progress: 1, ticket: null })
      } catch (failure) {
        const error = failure instanceof UploadError ? failure : new UploadError('checking', failure)
        if (error.status === 401) {
          onError(error) // phiên hết hạn: về màn đăng nhập, dừng cả lượt
          return
        }
        patchRow(row.id, { status: 'error', error: error.message, ticket: error.ticket })
      }
    }
    setBusy(false)
    await onUploaded()
  }

  return (
    <section className={`${card} grid gap-4`} aria-labelledby="upload-title">
      <div>
        <h2 id="upload-title" className="text-lg font-bold">
          Thêm nhạc
        </h2>
        <p className="mt-1 text-sm text-white/70">
          Tên file theo dạng <code className="rounded bg-white/10 px-1">Artist__Title__License__nguon.mp3</code> sẽ được điền sẵn; sai quy
          tắc thì bạn điền tay. Chỉ nhận nhạc CC0 và CC-BY.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Kéo file nhạc vào đây hoặc bấm để chọn file"
        onClick={() => input.current?.click()}
        onKeyDown={onZoneKey}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          dragging ? 'border-white bg-white/20' : 'border-white/40 hover:bg-white/10'
        }`}
      >
        <span className="text-base font-semibold">Kéo file nhạc vào đây</span>
        <span className="text-sm text-white/70">hoặc bấm để chọn (mp3, ogg, opus, m4a, webm, wav · tối đa 30 MB mỗi file)</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])])
            event.target.value = '' // cho phép chọn lại cùng một file
          }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <ul className="grid gap-3" aria-label="Hàng đợi tải lên">
            {rows.map((row) => (
              <RowItem
                key={row.id}
                row={row}
                locked={busy}
                onChange={(draft) => patchRow(row.id, { draft })}
                onRemove={() => setRows((previous) => previous.filter((item) => item.id !== row.id))}
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            {pending.length > 0 || busy ? (
              <button type="button" className={primaryButton} onClick={() => void start()} disabled={!canStart}>
                {busy ? 'Đang tải lên…' : `Tải lên ${pending.length} bài`}
              </button>
            ) : (
              <p className="text-sm text-white/70">Không có dòng nào tải lên được. Bỏ các dòng bị chặn khỏi hàng đợi hoặc thêm file khác.</p>
            )}
            {hasDone && !busy && (
              <button type="button" className={ghostButton} onClick={() => setRows((previous) => previous.filter((row) => row.status !== 'done'))}>
                Xoá các dòng đã xong
              </button>
            )}
            {incomplete.length > 0 && !busy && (
              <p role="status" className="text-sm text-amber-100">
                Còn {incomplete.length} dòng chưa đủ thông tin hợp lệ: điền cho đủ hoặc bỏ dòng đó.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

type RowItemProps = {
  row: Row
  locked: boolean
  onChange: (draft: Draft) => void
  onRemove: () => void
}

function RowItem({ row, locked, onChange, onRemove }: RowItemProps) {
  const active = ACTIVE.includes(row.status)
  const editable = !locked && !active && row.status !== 'done' && !row.problem && !row.duplicate
  const problem = row.status === 'done' || row.problem || row.duplicate ? null : draftProblem(row.draft)
  const set = (patch: Partial<Draft>) => onChange({ ...row.draft, ...patch })

  if (row.status === 'done') {
    return (
      <li className="flex items-center gap-2 rounded-xl bg-emerald-300/15 px-3 py-2 text-sm ring-1 ring-emerald-200/30">
        <span aria-hidden="true">✓</span>
        <span className="min-w-0 truncate font-semibold">{row.draft.title}</span>
        <span className="text-emerald-100">{STATUS_LABEL.done}</span>
      </li>
    )
  }

  return (
    <li className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={row.file.name}>
            {row.file.name}
          </p>
          <p className="text-xs text-white/60">{formatBytes(row.file.size)}</p>
        </div>
        <button type="button" className={ghostButton} onClick={onRemove} disabled={locked || active} aria-label={`Bỏ ${row.file.name} khỏi hàng đợi`}>
          ✕
        </button>
      </div>

      {row.problem && <p className="mt-2 text-sm text-rose-200">{row.problem}: sẽ không được tải lên.</p>}
      {row.duplicate && <p className="mt-2 text-sm text-amber-100">Đã có bài cùng tên file: sẽ bỏ qua (muốn thay thì xoá bài cũ trước).</p>}
      {!row.problem && !row.duplicate && row.hint && (
        <p className="mt-2 text-sm text-amber-100">Tên file chưa đúng quy tắc: {row.hint}. Hãy điền tay các ô bên dưới.</p>
      )}

      {!row.problem && !row.duplicate && (
        <fieldset disabled={!editable} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-white/70">
            Tên bài
            <input className={inputClass} value={row.draft.title} onChange={(event) => set({ title: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-white/70">
            Tác giả
            <input className={inputClass} value={row.draft.artist} onChange={(event) => set({ artist: event.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-white/70">
            License
            <select className={selectClass} value={row.draft.license} onChange={(event) => set({ license: event.target.value })}>
              <option value="">Chọn license…</option>
              {(Object.keys(LICENSES) as LicenseId[]).map((id) => (
                <option key={id} value={id}>
                  {LICENSES[id].name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-white/70">
            Nguồn (tên miền, tuỳ chọn)
            <input
              className={inputClass}
              value={row.draft.sourceDomain}
              placeholder="freemusicarchive.org"
              onChange={(event) => set({ sourceDomain: event.target.value })}
            />
          </label>
        </fieldset>
      )}

      {problem && !active && <p className="mt-2 text-xs text-amber-100">{problem}</p>}

      {(active || row.status === 'error') && (
        <div className="mt-3" role="status">
          {row.status === 'uploading' && (
            <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.round(row.progress * 100)}%` }} />
            </div>
          )}
          {active && (
            <p className="text-sm text-white/80">
              {STATUS_LABEL[row.status]}
              {row.status === 'uploading' && ` ${Math.round(row.progress * 100)}%`}
            </p>
          )}
          {row.status === 'error' && (
            <p className="text-sm text-rose-200">
              {row.error} {row.ticket ? 'File đã lên R2, bấm "Tải lên" để thử ghi lại (không upload lại).' : 'Bấm "Tải lên" để thử lại.'}
            </p>
          )}
        </div>
      )}
    </li>
  )
}
