import * as THREE from 'three'
import type { SceneManifest } from './manifest'

/*
 * Tải ảnh theo từng mốc giờ, theo nhu cầu: chỉ giữ ảnh của mốc đang xem và vài mốc kề bên trong bộ nhớ GPU
 * (mỗi mốc ~ 2 ảnh 1920×1080), mốc xa bị giải phóng. Trang mở lên chỉ cần tải đúng một mốc.
 */

export type StopTextures = {
  /** Nền đã bỏ cây gần và cánh quạt */
  plate: THREE.Texture
  /** Cây gần (có alpha) */
  trees: THREE.Texture
}

const loader = new THREE.TextureLoader()
const loaded = new Map<string, StopTextures>()
/** Promise của từng mốc, giữ nguyên một đối tượng để `use()` của React không bị treo lại mỗi lần render. */
const promises = new Map<string, Promise<StopTextures>>()
const key = (scene: SceneManifest, i: number) => `${scene.id}:${i}`

function load(url: string) {
  return new Promise<THREE.Texture>((resolve, reject) =>
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
        t.minFilter = t.magFilter = THREE.LinearFilter
        t.generateMipmaps = false
        t.anisotropy = 1
        t.needsUpdate = true
        resolve(t)
      },
      undefined,
      reject,
    ),
  )
}

/** Bắt đầu tải một mốc (nếu chưa), trả về promise dùng cho Suspense. */
export function requestStop(scene: SceneManifest, i: number): Promise<StopTextures> {
  const k = key(scene, i)
  let p = promises.get(k)
  if (!p) {
    const h = scene.hours[i]
    p = Promise.all([load(h.plate), load(h.trees)]).then(([plate, trees]) => {
      const stop = { plate, trees }
      loaded.set(k, stop)
      return stop
    })
    promises.set(k, p)
  }
  return p
}

export function getStop(scene: SceneManifest, i: number) {
  return loaded.get(key(scene, i)) ?? null
}

/** Mốc đã tải gần `i` nhất (để tạm dùng khi mốc cần chưa tải xong). */
export function nearestLoaded(scene: SceneManifest, i: number) {
  let best = -1
  for (let k = 0; k < scene.hours.length; k++) {
    if (loaded.has(key(scene, k)) && (best < 0 || Math.abs(k - i) < Math.abs(best - i))) best = k
  }
  return best
}

/** Giải phóng các mốc cách mốc đang xem hơn `keep` bậc. */
export function evictFar(scene: SceneManifest, center: number, keep = 2) {
  for (let k = 0; k < scene.hours.length; k++) {
    if (Math.abs(k - center) <= keep) continue
    const s = loaded.get(key(scene, k))
    if (!s) continue
    s.plate.dispose()
    s.trees.dispose()
    loaded.delete(key(scene, k))
    promises.delete(key(scene, k))
  }
}
