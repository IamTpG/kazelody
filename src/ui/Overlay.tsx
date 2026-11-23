import { useState } from 'react'
import { usePlayer } from '../audio'
import { clockAt, nightAt, valueAt, type SceneManifest } from '../scene2d/manifest'
import { KazeMark } from './icons'
import { Player } from './Player'
import { TimeArc } from './TimeArc'
import './player.css'

type Props = {
  scene: SceneManifest
  /** Giá trị liên tục 0 … số ảnh - 1 */
  value: number
  onChange: (value: number) => void
}

export function Overlay({ scene, value, onChange }: Props) {
  const hours = scene.hours
  const [listOpen, setListOpen] = useState(false)
  const { status } = usePlayer()
  const listening = status === 'playing' || status === 'loading'

  return (
    <div
      className="kz-ui pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-white sm:p-6"
      data-list={listOpen}
    >
      {/* Lớp tối rất loãng dưới chân màn hình để chữ và icon đọc được trên nền sáng (xem player.css). */}
      <div className="kz-scrim" aria-hidden="true" />

      <header className="flex items-start justify-between">
        <h1 className="text-2xl font-bold tracking-wide drop-shadow-[0_2px_8px_rgba(40,40,90,0.45)] sm:text-3xl">
          <KazeMark className="mr-2 inline-block h-[1.05em] w-auto align-[-0.15em]" />
          KazeLody
          {/* Màn hình hẹp: phụ đề xuống dòng riêng để không chạm vào TimeArc bên phải. */}
          <span className="block text-sm font-medium opacity-80 sm:ml-2 sm:inline sm:align-middle">風 · melody</span>
        </h1>
        <div className="pointer-events-auto">
          <TimeArc
            clock={clockAt(scene, value)}
            start={hours[0].clock}
            end={hours[hours.length - 1].clock}
            sunset={scene.sunset}
            onChange={(clock) => onChange(valueAt(scene, clock))}
            valueText={hours[Math.round(value)]?.label ?? ''}
          />
        </div>
      </header>

      <footer className="flex flex-col items-center gap-3">
        <p
          className={`kz-hint text-xs font-medium drop-shadow-[0_1px_4px_rgba(40,40,90,0.6)] transition-opacity duration-500 ${
            listening || listOpen ? 'opacity-0' : 'opacity-85'
          }`}
        >
          Nhấp chuột để gọi một cơn gió
        </p>
        <Player open={listOpen} onOpenChange={setListOpen} night={nightAt(scene, value)} />
      </footer>
    </div>
  )
}
