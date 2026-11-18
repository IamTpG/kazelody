/* Lớp Tailwind và vài hàm nhỏ dùng chung cho các thành phần của trang admin. */

export const card = 'rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/25 backdrop-blur sm:p-6'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

export const inputClass =
  'w-full min-w-0 rounded-lg bg-black/30 px-3 py-2 text-sm text-white placeholder-white/60 outline-none ring-1 ring-white/40 transition focus:bg-black/40 focus:ring-2 focus:ring-white disabled:opacity-60'

/** Ô chọn: danh sách xổ xuống nền sáng nên chữ của option phải tối. */
export const selectClass = `${inputClass} [&>option]:text-slate-900`

export const primaryButton = `rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#141a3e] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60 ${focus}`

export const ghostButton = `rounded-full px-3 py-1.5 text-sm text-white ring-1 ring-white/50 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`

export const dangerButton = `rounded-full bg-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-950 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 ${focus}`

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
