/**
 * Cảnh 2.5D: ảnh màu + bản đồ độ sâu render sẵn từ painted-valley (MIT / CC0) bằng tools/capture-scene.mjs.
 * Cùng một góc máy ở nhiều giờ trong ngày → chuyển giờ chỉ là crossfade hai ảnh, dùng chung một depth.
 */
export type HourShot = {
  id: string
  label: string
  /** Ảnh màu WebP */
  url: string
  /** Màu nắng cho hạt bay (sRGB hex) */
  sunColor: string
}

export type SceneManifest = {
  id: string
  /** Độ sâu 16 bit (R cao, G thấp), thang log t = ln(z/near)/ln(far/near) */
  depthUrl: string
  near: number
  far: number
  /** Tỉ lệ khung ảnh gốc (rộng / cao) */
  aspect: number
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
  hours: [
    { id: 'noon', label: 'Trưa', url: `${base}/${view}-12_5.webp`, sunColor: '#fff6e0' },
    { id: 'afternoon', label: 'Chiều', url: `${base}/${view}-15_5.webp`, sunColor: '#fff0d0' },
    { id: 'golden', label: 'Giờ vàng', url: `${base}/${view}-19.webp`, sunColor: '#ffd9a0' },
    { id: 'sunset', label: 'Hoàng hôn', url: `${base}/${view}-20_3.webp`, sunColor: '#ffbf8a' },
  ],
}
