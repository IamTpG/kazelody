import { clockAt, valueAt, type SceneManifest } from '../scene2d/manifest'
import { TimeArc } from './TimeArc'

type Props = {
  scene: SceneManifest
  /** Giá trị liên tục 0 … số ảnh - 1 */
  value: number
  onChange: (value: number) => void
}

export function Overlay({ scene, value, onChange }: Props) {
  const hours = scene.hours
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-white sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-wide drop-shadow-[0_2px_8px_rgba(40,40,90,0.45)] sm:text-3xl">
          KazeLody
          <span className="ml-2 align-middle text-sm font-medium opacity-80">風 · melody</span>
        </h1>
      </header>

      <footer className="flex flex-col items-center gap-3">
        <div className="pointer-events-auto rounded-2xl border border-white/30 bg-white/15 px-3 pt-2 pb-1 shadow-lg backdrop-blur-md">
          <TimeArc
            clock={clockAt(scene, value)}
            start={hours[0].clock}
            end={hours[hours.length - 1].clock}
            sunset={scene.sunset}
            onChange={(clock) => onChange(valueAt(scene, clock))}
            valueText={hours[Math.round(value)]?.label ?? ''}
          />
        </div>
        <p className="text-xs font-medium opacity-85 drop-shadow-[0_1px_4px_rgba(40,40,90,0.6)]">
          Nhấp chuột để gọi một cơn gió
        </p>
      </footer>
    </div>
  )
}
