import { PerformanceMonitor, Stats } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { wind } from './scene/uniforms'
import { ParallaxScene } from './scene2d/ParallaxScene'
import { VALLEY } from './scene2d/manifest'
import { Overlay } from './ui/Overlay'

// Thêm ?debug vào URL để hiện bảng FPS.
const DEBUG = new URLSearchParams(window.location.search).has('debug')

// Camera chỉ dùng cho lớp hạt bay; nền 2.5D vẽ thẳng theo toạ độ màn hình.
const initialCamera: [number, number, number] = [0, 1.6, 12]

/*
 * Độ phân giải canvas:
 * - Không vượt devicePixelRatio HIỆN TẠI (zoom out 50% → dpr giảm một nửa; nếu giữ dpr cũ,
 *   canvas phình gấp 4 lần số pixel thật của màn hình).
 * - Ngân sách tối đa ~1080p pixel thật, kể cả màn hình 2K/4K.
 * - PerformanceMonitor hạ tiếp xuống tối thiểu 90% khi FPS thấp.
 */
const DPR_CAP = 1.5
const PIXEL_BUDGET = 1920 * 1080
// Nền 2.5D rất nhẹ: chỉ hạ tối đa 10% khi FPS thấp, hạ nhiều hơn sẽ làm ảnh mờ thấy rõ.
const MIN_QUALITY_SCALE = 0.9

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
  const [hourIndex, setHourIndex] = useState(1)
  const [pointerInside, setPointerInside] = useState(false)
  const [quality, setQuality] = useState(1)
  const dpr = Math.round(useMaxDpr() * (MIN_QUALITY_SCALE + (1 - MIN_QUALITY_SCALE) * quality) * 100) / 100

  return (
    <main className="relative h-full w-full font-sans">
      <Canvas
        flat
        dpr={dpr}
        // Ảnh nền đã mịn sẵn, không cần MSAA.
        gl={{ antialias: false, powerPreference: 'high-performance' }}
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
        {DEBUG && <Stats />}
        <Suspense fallback={null}>
          <ParallaxScene scene={VALLEY} hourIndex={hourIndex} pointerInside={pointerInside} />
        </Suspense>
      </Canvas>
      {/* Vignette bằng CSS: rẻ hơn hẳn một pass hậu kỳ trên GPU. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(30,30,70,0.38)_100%)]" />
      <Overlay options={VALLEY.hours} selected={hourIndex} onSelect={setHourIndex} />
    </main>
  )
}
