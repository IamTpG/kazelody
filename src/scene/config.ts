/** Bảng màu + cấu hình cho từng bầu trời. Màu viết ở sRGB (hex), three tự đổi sang linear. */
export type SkyPreset = {
  id: string
  label: string
  url: string
  /** Xoay ảnh equirect (0..1) để khung hình đẹp nhất nằm trước camera. */
  offset: number
  sunDir: [number, number, number]
  sunColor: string
  shadowTint: string
  meadowDark: string
  meadowBase: string
  meadowLight: string
  /** 4 dải màu lá: sáng nhất → tối nhất (kỹ thuật toon 4 bậc). */
  leaf: [string, string, string, string]
  trunk: string
  hillNear: string
  hillFar: string
}

export const SKIES: SkyPreset[] = [
  {
    id: 'sky_47',
    label: 'Chiều hồng',
    url: '/skies/sky_47.png',
    offset: 0,
    sunDir: [-0.6, 0.6, 0.35],
    sunColor: '#fff3e6',
    shadowTint: '#8d92c9',
    meadowDark: '#4c8f5a',
    meadowBase: '#74b85e',
    meadowLight: '#bcd977',
    leaf: ['#b4da7a', '#78b862', '#4b9068', '#356b66'],
    trunk: '#6b4b44',
    hillNear: '#5f8a8e',
    hillFar: '#8fa3c4',
  },
  {
    id: 'sky_127',
    label: 'Hoàng hôn',
    url: '/skies/sky_127.png',
    offset: 0.33,
    sunDir: [0.45, 0.6, 0.55],
    sunColor: '#ffe6bd',
    shadowTint: '#8a83b8',
    meadowDark: '#5a8550',
    meadowBase: '#86b25a',
    meadowLight: '#d2d178',
    leaf: ['#d6d97e', '#97b85c', '#5e8e5c', '#40655c'],
    trunk: '#6e4c3c',
    hillNear: '#6f8190',
    hillFar: '#a3a3bf',
  },
]

export type TreeSpec = { x: number; z: number; scale: number; seed: number }

export const TREES: TreeSpec[] = [
  { x: -2, z: -14, scale: 1.25, seed: 11 },
  { x: 17, z: -27, scale: 0.85, seed: 29 },
  { x: -21, z: -5, scale: 0.75, seed: 47 },
]

/** Kích thước tán cây trong toạ độ local (trước khi scale) — dùng chung cho cây và bóng đổ. */
export const CANOPY = { centerY: 5.2, radius: 3.2 }

export const CAMERA = {
  position: [0, 0, 12] as [number, number, number],
  eyeHeight: 1.7,
  target: [-2, 6, -14] as [number, number, number],
}

const hill = (x: number, z: number, cx: number, cz: number, r: number, h: number) =>
  h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r))

/** Độ cao địa hình — dùng chung cho mesh đồi, vị trí cỏ, cây và camera. */
export function heightAt(x: number, z: number): number {
  let y = 0
  y += hill(x, z, -2, -14, 11, 5.5)
  y += hill(x, z, 22, -32, 16, 6)
  y += hill(x, z, -30, -36, 18, 7.5)
  y += hill(x, z, 40, -6, 20, 4)
  y += 0.45 * Math.sin(x * 0.15) * Math.cos(z * 0.12)
  y += 0.25 * Math.sin(x * 0.31 + z * 0.27)
  return y
}

export function normalAt(x: number, z: number): [number, number, number] {
  const e = 0.2
  const dx = heightAt(x + e, z) - heightAt(x - e, z)
  const dz = heightAt(x, z + e) - heightAt(x, z - e)
  const nx = -dx
  const ny = 2 * e
  const nz = -dz
  const l = Math.hypot(nx, ny, nz)
  return [nx / l, ny / l, nz / l]
}

/** RNG có seed để cảnh luôn giống nhau mỗi lần tải. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* --- Noise phía CPU: bản JS của kzHash/kzNoise/kzFbm trong glsl.ts ---------------------
 * Màu đồng cỏ không đổi theo thời gian nên tính sẵn một lần cho đất và cỏ,
 * thay vì chạy fbm trên từng pixel mỗi frame. */
const fract = (x: number) => x - Math.floor(x)

function hash2(x: number, y: number) {
  let px = fract(x * 123.34)
  let py = fract(y * 456.21)
  const d = px * (px + 45.32) + py * (py + 45.32)
  px += d
  py += d
  return fract(px * py)
}

function noise2(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
}

function fbm2(x: number, y: number) {
  let v = 0
  let a = 0.5
  for (let i = 0; i < 4; i++) {
    v += a * noise2(x, y)
    x *= 2.03
    y *= 2.03
    a *= 0.5
  }
  return v
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Trọng số pha màu đồng cỏ: [tối → vừa, → sáng]. Shader dùng: mix(mix(dark, base, w0), light, w1). */
export function meadowWeights(x: number, z: number): [number, number] {
  const n1 = fbm2(x * 0.045, z * 0.045)
  const n2 = noise2(x * 0.22, z * 0.22)
  return [smoothstep(0.28, 0.62, n1), smoothstep(0.58, 0.82, n1 * 0.75 + n2 * 0.25)]
}
