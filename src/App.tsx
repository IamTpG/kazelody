import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { Experience } from './scene/Experience'
import { CAMERA, heightAt } from './scene/config'
import { wind } from './scene/uniforms'
import { Overlay } from './ui/Overlay'

const [cx, , cz] = CAMERA.position
const initialCamera: [number, number, number] = [cx, heightAt(cx, cz) + CAMERA.eyeHeight, cz]

/*
 * Độ phân giải canvas:
 * - Không vượt devicePixelRatio HIỆN TẠI (zoom out 50% → dpr giảm một nửa; nếu giữ dpr cũ,
 *   canvas phình gấp 4 lần số pixel thật của màn hình).
 * - Ngân sách tối đa ~1080p pixel thật, kể cả màn hình 2K/4K.
 * - PerformanceMonitor hạ tiếp xuống tối thiểu 60% khi FPS thấp.
 */
const DPR_CAP = 1.5
const PIXEL_BUDGET = 1920 * 1080
const MIN_QUALITY_SCALE = 0.6

function maxDpr() {
  const cssPixels = Math.max(1, window.innerWidth * window.innerHeight)
  return Math.min(window.devicePixelRatio || 1, DPR_CAP, Math.sqrt(PIXEL_BUDGET / cssPixels))
}

function useMaxDpr() {
  const [value, setValue] = useState(maxDpr)
  useEffect(() => {
    // Zoom trình duyệt cũng phát sự kiện resize.
    const update = () => setValue(maxDpr())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return value
}

export default function App() {
  const [skyIndex, setSkyIndex] = useState(0)
  const [pointerInside, setPointerInside] = useState(false)
  const [quality, setQuality] = useState(1)
  const dpr = Math.round(useMaxDpr() * (MIN_QUALITY_SCALE + (1 - MIN_QUALITY_SCALE) * quality) * 100) / 100

  return (
    <main className="relative h-full w-full font-sans">
      <Canvas
        flat
        dpr={dpr}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 50, near: 0.1, far: 1200, position: initialCamera }}
        onPointerEnter={() => setPointerInside(true)}
        onPointerLeave={() => setPointerInside(false)}
        onPointerDown={() => {
          wind.gust = 1
        }}
      >
        <PerformanceMonitor
          onChange={({ factor }) => setQuality(factor)}
          flipflops={3}
          onFallback={() => setQuality(0)}
        />
        <Suspense fallback={null}>
          <Experience skyIndex={skyIndex} pointerInside={pointerInside} />
        </Suspense>
      </Canvas>
      {/* Vignette bằng CSS: rẻ hơn hẳn một pass hậu kỳ trên GPU. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(30,30,70,0.38)_100%)]" />
      <Overlay skyIndex={skyIndex} onSkyChange={setSkyIndex} />
    </main>
  )
}
