/*
 * Icon của trình phát. Tô đặc + viền cùng màu nối tròn (xem .kz-ico svg trong player.css) nên mọi góc đều bo mềm.
 * Riêng nút pause vẽ bằng hai hình chữ nhật bo góc, tắt viền (viền sẽ làm hai thanh dính nhau).
 */

type IconProps = { className?: string }

const VIEW = '0 0 24 24'

export function PrevIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M6 5h2v14H6zM20 5v14L9.5 12z" />
    </svg>
  )
}

export function NextIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M16 5h2v14h-2zM4 5l10.5 7L4 19z" />
    </svg>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true" style={{ stroke: 'none' }}>
      <rect x="6" y="4.5" width="4.2" height="15" rx="2" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="2" />
    </svg>
  )
}

export function VolumeIcon({ className, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M3 9v6h4l5 5V4L7 9z" />
      {muted ? (
        <path d="M16 9.5l5 5m0-5l-5 5" fill="none" strokeWidth="2" />
      ) : (
        <path d="M16.5 12A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z" />
      )}
    </svg>
  )
}

export function ShuffleIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
    </svg>
  )
}

export function ListIcon({ className }: IconProps) {
  return (
    <svg viewBox={VIEW} className={className} aria-hidden="true">
      <path d="M3 6h14v2H3zM3 11h14v2H3zM3 16h9v2H3zM19 5v10.3A3 3 0 1 0 21 18V8h2V5z" />
    </svg>
  )
}
