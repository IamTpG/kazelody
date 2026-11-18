import { useRef, type CSSProperties } from 'react'
import { player, usePlayer } from '../audio'
import { VolumeIcon } from './icons'

const FALLBACK_VOLUME = 0.7

/** Nút loa (bấm để tắt/bật tiếng) + thanh âm lượng bung ra khi rê chuột hoặc focus. */
export function VolumeControl() {
  const { volume } = usePlayer()
  const beforeMute = useRef(FALLBACK_VOLUME)
  const muted = volume === 0

  const toggleMute = () => {
    if (muted) {
      player.setVolume(beforeMute.current)
    } else {
      beforeMute.current = volume
      player.setVolume(0)
    }
  }

  return (
    <div className="kz-vol">
      <button type="button" className="kz-ico" aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'} onClick={toggleMute}>
        <VolumeIcon muted={muted} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(volume * 100)}
        aria-label="Âm lượng"
        style={{ '--v': `${Math.round(volume * 100)}%` } as CSSProperties}
        onChange={(event) => player.setVolume(Number(event.target.value) / 100)}
      />
    </div>
  )
}
