/*
 * Định dạng và kiểm tra thời lượng (giây). Thuần, không dùng DOM hay API riêng của Node.
 * Dùng chung cho giao diện, trang admin và API.
 */

/** Thời lượng một bài tối đa chấp nhận (24 giờ): chặn giá trị vô lý do client gửi lên. */
export const MAX_DURATION_SECONDS = 24 * 60 * 60

/** Thời lượng hợp lệ để lưu/hiển thị: số hữu hạn, dương, không quá 24 giờ. */
export function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_DURATION_SECONDS
}

/**
 * Chuẩn hoá thời lượng để lưu: giữ giá trị thực (tới mili giây) chứ KHÔNG làm tròn lên số nguyên.
 * Nhờ vậy playlist (thời lượng đã lưu) và player (thời lượng thật của file) cùng cắt xuống giây và luôn hiện giống nhau.
 * Không hợp lệ thì null.
 */
export function normalizeDuration(value: unknown): number | null {
  return isDuration(value) ? Math.round(value * 1000) / 1000 : null
}

const whole = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0)
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `m:ss` (0:07, 3:45), hoặc `h:mm:ss` (1:02:03) khi bài dài từ 1 giờ.
 * Truyền `total` để vị trí đang phát và tổng thời lượng luôn cùng một dạng (`0:00:07 / 1:02:03`), độ rộng không nhảy.
 * Làm tròn xuống giây; giá trị không hợp lệ (NaN, âm, vô cực) coi như 0.
 */
export function formatDuration(seconds: number, total?: number): string {
  const s = whole(seconds)
  const withHours = Math.max(s, whole(total ?? 0)) >= 3600
  if (withHours) return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
