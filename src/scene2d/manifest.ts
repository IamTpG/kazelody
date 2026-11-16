/**
 * Cảnh 2.5D: ảnh màu + bản đồ độ sâu render sẵn từ painted-valley (MIT / CC0) bằng tools/capture-scene.mjs.
 * Cùng một góc máy ở nhiều giờ trong ngày → chuyển giờ chỉ là trộn hai ảnh kề nhau, dùng chung một depth.
 */
export type HourShot = {
  id: string
  /** Tên mốc — chỉ dành cho trình đọc màn hình (giao diện không hiện chữ) */
  label: string
  /** Giờ trên đồng hồ (vd. 15.5 = 15:30) — quyết định vị trí trên vòng cung và mặt trời/mặt trăng */
  clock: number
  /** Ảnh màu WebP */
  url: string
  /** Ánh sáng phủ lên lá bay / cánh hoa ở giờ này (sRGB hex) — để lá hợp với ảnh nền */
  tint: string
}

export type SceneManifest = {
  id: string
  /** Độ sâu 16 bit (R cao, G thấp), thang log t = ln(z/near)/ln(far/near) */
  depthUrl: string
  near: number
  far: number
  /** Tỉ lệ khung ảnh gốc (rộng / cao) */
  aspect: number
  /** Sau giờ này coi là đêm: vòng cung hiện mặt trăng */
  sunset: number
  hours: HourShot[]
}

const base = '/scenes/valley'
const view = 'hill'

export const VALLEY: SceneManifest = {
  id: 'valley',
  depthUrl: `${base}/${view}-15_5-depth-small.png`,
  near: 0.12,
  far: 40000,
  aspect: 16 / 9,
  sunset: 20.6,
  hours: [
    { id: 'noon', label: 'Trưa', clock: 12.5, url: `${base}/${view}-12_5.webp`, tint: '#ffffff' },
    { id: 'afternoon', label: 'Chiều', clock: 15.5, url: `${base}/${view}-15_5.webp`, tint: '#fff6e8' },
    { id: 'golden', label: 'Giờ vàng', clock: 19, url: `${base}/${view}-19.webp`, tint: '#ffdfae' },
    { id: 'sunset', label: 'Hoàng hôn', clock: 20.3, url: `${base}/${view}-20_3.webp`, tint: '#f2b2a4' },
  ],
}

/** Giá trị liên tục (0 … số ảnh - 1) → giờ đồng hồ, nội suy tuyến tính giữa hai ảnh kề nhau. */
export function clockAt(scene: SceneManifest, v: number) {
  const h = scene.hours
  const i = Math.max(0, Math.min(Math.floor(v), h.length - 2))
  const f = Math.min(1, Math.max(0, v - i))
  return h.length === 1 ? h[0].clock : h[i].clock + (h[i + 1].clock - h[i].clock) * f
}

/** Ngược lại: giờ đồng hồ → giá trị liên tục. */
export function valueAt(scene: SceneManifest, clock: number) {
  const h = scene.hours
  if (clock <= h[0].clock) return 0
  for (let i = 0; i < h.length - 1; i++) {
    if (clock <= h[i + 1].clock) return i + (clock - h[i].clock) / (h[i + 1].clock - h[i].clock)
  }
  return h.length - 1
}
