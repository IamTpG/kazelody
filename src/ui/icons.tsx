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

/* Logo KazeLody (nốt đôi, đường cong như gió). Không nền, tô theo màu chữ hiện tại (currentColor). */
export function KazeMark({ className }: IconProps) {
  return (
    <svg viewBox="856 -7417 6833 6373" className={className} aria-hidden="true">
      <path transform="scale(1,-1)" fill="currentColor" d="M4655 7109 c-99 -4 -250 -15 -335 -24 -85 -9 -193 -20 -240 -25 -185 -19 -450 -64 -615 -103 -344 -83 -579 -163 -810 -277 -490 -240 -799 -586 -903 -1011 -34 -142 -42 -210 -42 -370 1 -218 24 -372 84 -552 126 -380 379 -717 793 -1055 72 -59 129 -110 126 -114 -2 -5 -48 -8 -102 -8 -115 0 -354 -31 -461 -59 -483 -129 -839 -423 -955 -788 -66 -208 -47 -460 50 -654 84 -167 246 -344 415 -451 421 -267 976 -344 1489 -207 228 61 456 176 596 301 28 24 63 55 78 69 62 52 161 187 211 288 86 171 114 360 81 533 -45 234 -152 415 -376 634 -146 142 -248 226 -539 442 -321 240 -516 402 -643 536 -90 94 -191 216 -237 287 l-42 64 5 130 c10 250 79 428 241 624 197 238 557 435 1041 570 328 91 813 162 1289 187 l124 7 12 -59 c53 -264 109 -413 233 -629 115 -200 375 -487 634 -702 67 -55 119 -103 116 -107 -4 -3 -53 -6 -110 -6 -108 0 -336 -29 -438 -55 -291 -75 -528 -206 -715 -394 -139 -139 -229 -293 -270 -460 -24 -95 -29 -300 -10 -373 32 -119 46 -159 78 -223 110 -220 306 -404 573 -535 453 -223 1007 -247 1498 -63 156 58 266 119 397 220 397 306 519 754 318 1165 -118 240 -289 413 -764 773 -118 90 -249 189 -290 220 -426 324 -695 638 -813 950 -68 178 -114 478 -88 567 31 106 110 188 242 256 125 63 225 85 389 86 164 0 248 -17 375 -78 144 -70 230 -159 258 -267 l13 -54 177 -3 c138 -2 177 0 178 10 11 158 -94 375 -244 500 -119 99 -215 151 -368 201 -116 38 -201 51 -454 67 -423 28 -877 35 -1250 19z m475 -366 c0 -5 -20 -36 -44 -71 -24 -34 -54 -88 -66 -120 -43 -115 -30 -106 -165 -114 -800 -47 -1344 -151 -1827 -349 -386 -158 -712 -404 -878 -662 -67 -104 -82 -110 -75 -29 37 371 207 630 570 864 223 144 631 292 985 358 63 12 135 25 160 30 41 9 156 26 335 50 70 9 257 25 480 39 159 11 525 13 525 4z" />
    </svg>
  )
}
