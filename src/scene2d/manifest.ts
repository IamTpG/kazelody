import { VALLEY_IMAGE, VALLEY_STOPS } from './valleyData'

/**
 * Cảnh 2.5D: ảnh render sẵn từ painted-valley (MIT / CC0) bằng tools/capture-scene.mjs.
 * Cùng một góc máy ở nhiều giờ trong ngày → chuyển giờ chỉ là trộn hai ảnh kề nhau, dùng chung một depth.
 * Mỗi mốc gồm ba lớp: nền (đã bỏ cây gần + cánh quạt), cây gần (có alpha, đung đưa theo gió) và cánh quạt (quay).
 */
export type Mill = {
  /** Trục cối xay, px trong ảnh gốc */
  hub: readonly [number, number]
  /** Hai trục của mặt phẳng quay chiếu lên màn hình (px trên một đơn vị cục bộ) */
  ax: readonly [number, number]
  ay: readonly [number, number]
  /** Chiều dài cánh quạt (đơn vị cục bộ) */
  length: number
}

export type HourShot = {
  id: string
  /** Tên mốc — chỉ dành cho trình đọc màn hình (giao diện không hiện chữ) */
  label: string
  /** Giờ trên đồng hồ (vd. 15.5 = 15:30) — quyết định vị trí trên vòng cung và mặt trời/mặt trăng */
  clock: number
  plate: string
  trees: string
  sails: string | null
  /** Khung cắt cánh quạt trong ảnh gốc (x0, y0, x1, y1 px) */
  sailBox: readonly [number, number, number, number] | null
  mill: Mill | null
  /** Ánh sáng phủ lên lá bay / cánh hoa ở giờ này (sRGB hex) — để lá hợp với ảnh nền */
  tint: string
  /** 0 = ban ngày … 1 = đêm sâu: sao, đom đóm hiện dần; lá bay mờ dần */
  night: number
}

export type SceneManifest = {
  id: string
  /** Độ sâu 16 bit (R cao, G thấp), thang log t = ln(z/near)/ln(far/near) */
  depthUrl: string
  near: number
  far: number
  /** Kích thước ảnh gốc (px) */
  width: number
  height: number
  /** Tỉ lệ khung ảnh gốc (rộng / cao) */
  aspect: number
  /** Sau giờ này (và trước 6h) coi là không có mặt trời: vòng cung hiện mặt trăng */
  sunset: number
  hours: HourShot[]
}

const base = '/scenes/valley'

const LOOK: Record<string, { label: string; tint: string; night: number }> = {
  '5.5': { label: 'Rạng sáng', tint: '#d9c3dc', night: 0.55 },
  '7.5': { label: 'Sáng sớm', tint: '#fff0dc', night: 0 },
  '10': { label: 'Sáng', tint: '#ffffff', night: 0 },
  '12.5': { label: 'Trưa', tint: '#ffffff', night: 0 },
  '15.5': { label: 'Chiều', tint: '#fff6e8', night: 0 },
  '19': { label: 'Giờ vàng', tint: '#ffdfae', night: 0 },
  '20.3': { label: 'Hoàng hôn', tint: '#f2b2a4', night: 0.12 },
  '21.25': { label: 'Chạng vạng', tint: '#9a88b0', night: 0.6 },
  '23.5': { label: 'Đêm khuya', tint: '#55628c', night: 1 },
}

export const VALLEY: SceneManifest = {
  id: 'valley',
  depthUrl: `${base}/hill-depth-small.png`,
  near: VALLEY_IMAGE.near,
  far: VALLEY_IMAGE.far,
  width: VALLEY_IMAGE.width,
  height: VALLEY_IMAGE.height,
  aspect: VALLEY_IMAGE.width / VALLEY_IMAGE.height,
  sunset: 20.6,
  hours: VALLEY_STOPS.map((s) => {
    const look = LOOK[String(s.hour)]
    return {
      id: s.tag,
      label: look.label,
      clock: s.hour,
      plate: `${base}/${s.tag}-plate.webp`,
      trees: `${base}/${s.tag}-trees.webp`,
      sails: s.sailBox ? `${base}/${s.tag}-sails.webp` : null,
      sailBox: s.sailBox,
      mill: s.mill,
      tint: look.tint,
      night: look.night,
    }
  }),
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
