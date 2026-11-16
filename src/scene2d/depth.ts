import * as THREE from 'three'

/**
 * Đọc ảnh độ sâu 16 bit (R cao, G thấp, thang log) và đổi thành "độ parallax" w ∈ [0, 1]:
 * 1 = cỏ sát chân, 0 = bầu trời. Dùng thang log giống kỹ thuật multiplane: núi xa và làng
 * vẫn trượt nhẹ so với trời, thay vì đứng yên như ngoài đời.
 */
export async function loadParallaxMap(
  url: string,
  near: number,
  far: number,
  { nearest = 1.5, farthest = 6000, blur = 5 } = {},
): Promise<THREE.DataTexture> {
  const img = new Image()
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb' })!
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)

  const logRange = Math.log(far / near)
  const tNear = Math.log(nearest / near) / logRange
  const tFar = Math.log(farthest / near) / logRange
  const W = img.width
  const H = img.height
  let w = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4
      const t = (data[k] * 256 + data[k + 1]) / 65535
      w[y * W + x] = t >= 0.999 ? 0 : Math.min(1, Math.max(0, (tFar - t) / (tFar - tNear)))
    }
  }
  // Làm mềm: chỗ chênh độ sâu lớn (tán cây giáp trời) trải ra vài ô lưới, nên khi parallax
  // ảnh chỉ cong nhẹ thay vì bị kéo thành vệt. Box blur 2 lượt ≈ gaussian.
  for (let pass = 0; pass < 2; pass++) w = boxBlur(boxBlur(w, W, H, blur, true), W, H, blur, false)

  const out = new Uint16Array(W * H)
  for (let y = 0; y < H; y++) {
    // Ảnh đọc từ trên xuống; texture WebGL tính từ dưới lên → lật dọc.
    for (let x = 0; x < W; x++) out[(H - 1 - y) * W + x] = THREE.DataUtils.toHalfFloat(w[y * W + x])
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RedFormat, THREE.HalfFloatType)
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

function boxBlur(src: Float32Array, W: number, H: number, r: number, horizontal: boolean) {
  const dst = new Float32Array(src.length)
  const n = horizontal ? W : H
  const lines = horizontal ? H : W
  for (let l = 0; l < lines; l++) {
    const at = (i: number) => (horizontal ? l * W + i : i * W + l)
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[at(Math.min(n - 1, Math.max(0, i)))]
    for (let i = 0; i < n; i++) {
      dst[at(i)] = sum / (2 * r + 1)
      sum += src[at(Math.min(n - 1, i + r + 1))] - src[at(Math.max(0, i - r))]
    }
  }
  return dst
}
