import { useFrame, useThree } from '@react-three/fiber'
import { use, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { shared, wind } from '../scene/uniforms'
import { loadParallaxMap } from './depth'
import { Leaves } from './Leaves'
import { leafLook } from './leafLook'
import type { SceneManifest } from './manifest'
import { nightLook } from './leafLook'
import { Night } from './Night'
import { evictFar, getStop, nearestLoaded, requestStop } from './stops'

/*
 * Nền 2.5D gồm ba lớp, đều dựa trên cùng một lưới parallax phủ kín màn hình (mỗi đỉnh dịch theo độ sâu khi rê chuột):
 *   1. nền (đã bỏ cây gần + cánh quạt), cỏ gần đung đưa nhẹ
 *   2. cánh quạt cối xay: ảnh cắt sẵn, quay quanh trục theo gió
 *   3. cây gần (có alpha): đung đưa theo gió, lộ phần nền phía sau khi lay
 * Mỗi pixel chỉ đọc vài lần ảnh nên rất nhẹ cho GPU yếu.
 */

const GRID_X = 240
const GRID_Y = 135
/** Lưới rộng hơn màn hình để khi dịch không lộ mép (phải lớn hơn biên độ parallax tối đa). */
const MARGIN = 1.07
/** Phóng ảnh lên một chút để còn chỗ cho lưới dịch: MARGIN / ZOOM phải < 1. Càng nhỏ ảnh càng nét. */
const ZOOM = 1.08
/** Biên độ parallax (đơn vị NDC) ở độ parallax = 1. Tối đa (kể cả "thở" ×1.25) phải < MARGIN - 1. */
const PARALLAX = new THREE.Vector2(0.05, 0.026)
/** Độ làm nét (unsharp mask) bù phần mềm do phóng ảnh và nội suy khi lưới dịch lẻ pixel. */
const SHARPEN = 0.45
/** Tốc độ quay cánh quạt (vòng/phút) lúc gió thường; có thể chỉnh. Cơn gió làm nhanh thêm tối đa MILL_GUST_BOOST. */
export const MILL_RPM = 4
const MILL_GUST_BOOST = 0.5

const vertex = /* glsl */ `
uniform sampler2D uWeight;
uniform vec2 uSpan;
uniform vec2 uOffset;
varying vec2 vUv;
varying float vW;
void main() {
  vec2 screenUv = position.xy * 0.5 + 0.5;
  vec2 imgUv = (screenUv - 0.5) * uSpan + 0.5;
  float w = texture2D(uWeight, imgUv).r;
  vUv = imgUv;
  vW = w;
  // pow < 1: các lớp giữa (làng, rừng) cũng trượt rõ hơn, không chỉ cỏ sát chân.
  float shift = pow(w, 0.8);
  // z theo độ parallax: vật gần che vật xa khi lưới bị kéo chồng lên nhau.
  gl_Position = vec4(position.xy + uOffset * shift, 0.99 - w * 0.98, 1.0);
}
`

const noiseGlsl = /* glsl */ `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`

const plateFragment = /* glsl */ `
uniform sampler2D uPlateA;
uniform sampler2D uPlateB;
uniform float uMix;
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uTexel;
uniform float uSharpen;
varying vec2 vUv;
varying float vW;

// Unsharp mask 5 điểm: tăng tương phản cục bộ, bù độ mềm của nội suy.
vec3 sharp(sampler2D tex, vec2 uv) {
  vec3 c = texture2D(tex, uv).rgb;
  vec3 n = texture2D(tex, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tex, uv - vec2(uTexel.x, 0.0)).rgb
         + texture2D(tex, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tex, uv - vec2(0.0, uTexel.y)).rgb;
  return max(c + (c - n * 0.25) * uSharpen, 0.0);
}
${noiseGlsl}
void main() {
  vec2 uv = vUv;
  // Chỉ phần cỏ gần mới đung đưa: vật xa đứng yên như tranh nền.
  float near = smoothstep(0.5, 0.85, vW);
  if (near > 0.0) {
    // Cả mảng cỏ gần ngả qua lại chậm theo gió (tần số thấp → trông như cỏ đung đưa, không như méo ảnh).
    float sway = noise(vec2(uv.x * 2.5 - uWindTime * 0.3, uv.y * 1.2 + uWindTime * 0.05)) - 0.5;
    uv.x += sway * 0.006 * near * uWindStrength;
  }
  vec3 a = sharp(uPlateA, uv);
  vec3 col = uMix > 0.0 ? mix(a, sharp(uPlateB, uv), uMix) : a;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

const treesFragment = /* glsl */ `
uniform sampler2D uTreesA;
uniform sampler2D uTreesB;
uniform float uMix;
uniform float uWindTime;
uniform float uWindStrength;
varying vec2 vUv;
${noiseGlsl}
void main() {
  vec2 uv = vUv;
  // Tán lá lay nhiều hơn ở phần cao (uv.y lớn = phía trên ảnh), gốc cây đứng yên.
  float top = smoothstep(0.2, 0.9, uv.y);
  float t = uWindTime;
  float slow = noise(vec2(uv.x * 3.0 - t * 0.35, uv.y * 2.0 + t * 0.1)) - 0.5;
  float flutter = noise(vec2(uv.x * 10.0 - t * 1.1, uv.y * 8.0 + t * 0.5)) - 0.5;
  uv += vec2(slow * 0.012 + flutter * 0.004, flutter * 0.003 - slow * 0.002) * top * uWindStrength;
  vec4 a = texture2D(uTreesA, uv);
  vec4 b = uMix > 0.0 ? texture2D(uTreesB, uv) : a;
  // trộn theo alpha (không để màu của pixel trong suốt lem ra viền)
  float alpha = mix(a.a, b.a, uMix);
  if (alpha < 0.004) discard;
  vec3 rgb = (a.rgb * a.a * (1.0 - uMix) + b.rgb * b.a * uMix) / alpha;
  gl_FragColor = vec4(rgb, alpha);
  #include <colorspace_fragment>
}
`

// Cánh quạt: một ô vuông quanh trục cối xay, lấy mẫu ảnh cánh quạt đã cắt sau khi xoay trong mặt phẳng của chúng.
const sailsVertex = /* glsl */ `
uniform sampler2D uWeight;
uniform vec2 uSpan;
uniform vec2 uOffset;
uniform vec2 uImg;
uniform vec2 uHub;
uniform float uRadius;
varying vec2 vPx;
void main() {
  vec2 px = uHub + vec2(position.x, -position.y) * uRadius;
  vec2 imgUv = vec2(px.x / uImg.x, 1.0 - px.y / uImg.y);
  float w = texture2D(uWeight, vec2(uHub.x / uImg.x, 1.0 - uHub.y / uImg.y)).r;
  vec2 ndc = ((imgUv - 0.5) / uSpan) * 2.0 + uOffset * pow(w, 0.8);
  vPx = px;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`
const sailsFragment = /* glsl */ `
uniform sampler2D uSails;
uniform vec4 uBox;
uniform vec2 uHub;
uniform mat2 uM;
uniform mat2 uInv;
uniform float uAngle;
uniform float uOpacity;
varying vec2 vPx;
void main() {
  vec2 L = uInv * (vPx - uHub);
  float c = cos(uAngle);
  float s = sin(uAngle);
  // nội dung quay một góc uAngle → lấy mẫu ở toạ độ quay ngược lại
  vec2 Ls = vec2(c * L.x + s * L.y, -s * L.x + c * L.y);
  vec2 ps = uHub + uM * Ls;
  vec2 uv = (ps - uBox.xy) / (uBox.zw - uBox.xy);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  uv.y = 1.0 - uv.y;
  vec4 t = texture2D(uSails, uv);
  float a = t.a * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(t.rgb, a);
  #include <colorspace_fragment>
}
`

const weightCache = new Map<string, Promise<THREE.DataTexture>>()
function weightMap(scene: SceneManifest) {
  let p = weightCache.get(scene.depthUrl)
  if (!p) {
    p = loadParallaxMap(scene.depthUrl, scene.near, scene.far)
    weightCache.set(scene.depthUrl, p)
  }
  return p
}

/** Uniform dùng chung của các lớp, cấp module (như `shared`) để cập nhật mỗi frame mà không đụng state React. */
const view = {
  uWeight: { value: null as THREE.Texture | null },
  uPlateA: { value: null as THREE.Texture | null },
  uPlateB: { value: null as THREE.Texture | null },
  uTreesA: { value: null as THREE.Texture | null },
  uTreesB: { value: null as THREE.Texture | null },
  uMix: { value: 0 },
  uSpan: { value: new THREE.Vector2(1, 1) },
  uOffset: { value: new THREE.Vector2() },
  uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  uSharpen: { value: SHARPEN },
}

/** Uniform riêng của hai ô cánh quạt (mốc A và mốc B, trộn bằng độ mờ). */
const sailLook = [0, 1].map(() => ({
  uSails: { value: null as THREE.Texture | null },
  uBox: { value: new THREE.Vector4() },
  uHub: { value: new THREE.Vector2() },
  uRadius: { value: 1 },
  // mat2 (cột trước): three nhận mảng phẳng
  uM: { value: new Float32Array(4) },
  uInv: { value: new Float32Array(4) },
  uAngle: { value: 0 },
  uOpacity: { value: 0 },
}))

const tints = new Map<string, THREE.Color>()
function tintColor(hex: string) {
  let c = tints.get(hex)
  if (!c) tints.set(hex, (c = new THREE.Color(hex)))
  return c
}
const tmp = new THREE.Vector2()
const tintTmp = new THREE.Color()
let millAngle = 0

function setSails(k: 0 | 1, scene: SceneManifest, idx: number, tex: THREE.Texture | null, opacity: number) {
  const u = sailLook[k]
  const h = scene.hours[idx]
  if (!tex || !h.mill || !h.sailBox || opacity <= 0) {
    u.uOpacity.value = 0
    return
  }
  const { hub, ax, ay, length } = h.mill
  u.uSails.value = tex
  u.uBox.value.set(...h.sailBox)
  u.uHub.value.set(hub[0], hub[1])
  u.uRadius.value = Math.max(Math.hypot(ax[0], ax[1]), Math.hypot(ay[0], ay[1])) * length * 1.1
  const det = ax[0] * ay[1] - ax[1] * ay[0]
  u.uM.value.set([ax[0], ax[1], ay[0], ay[1]])
  u.uInv.value.set([ay[1] / det, -ax[1] / det, -ay[0] / det, ax[0] / det])
  u.uAngle.value = millAngle
  u.uOpacity.value = opacity
}

export function ParallaxScene({
  scene,
  hour,
}: {
  scene: SceneManifest
  /** Giờ trong ngày dạng liên tục: 0 = ảnh đầu, 1 = ảnh thứ hai… (từ thanh trượt) */
  hour: number
}) {
  // Chỉ chờ tải đúng mốc đang mở; các mốc khác tải dần khi cần.
  // (giữ nguyên một promise từ lúc mở trang: mốc đầu bị giải phóng về sau cũng không làm cảnh treo lại)
  const [first] = useState(() => requestStop(scene, Math.max(0, Math.min(scene.hours.length - 1, Math.round(hour)))))
  use(first)
  const weight = use(weightMap(scene))
  const size = useThree((s) => s.size)
  const state = useRef({ hour, offset: new THREE.Vector2() })

  const geometry = useMemo(() => new THREE.PlaneGeometry(2 * MARGIN, 2 * MARGIN, GRID_X, GRID_Y), [])
  const sailGeometry = useMemo(() => new THREE.PlaneGeometry(2, 2), [])
  const plateMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...view, uWindTime: shared.uWindTime, uWindStrength: shared.uWindStrength },
        vertexShader: vertex,
        fragmentShader: plateFragment,
      }),
    [],
  )
  const treeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...view, uWindTime: shared.uWindTime, uWindStrength: shared.uWindStrength },
        vertexShader: vertex,
        fragmentShader: treesFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  const sailMaterials = useMemo(
    () =>
      sailLook.map(
        (look) =>
          new THREE.ShaderMaterial({
            uniforms: { ...look, uWeight: view.uWeight, uSpan: view.uSpan, uOffset: view.uOffset, uImg: { value: new THREE.Vector2(scene.width, scene.height) } },
            vertexShader: sailsVertex,
            fragmentShader: sailsFragment,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          }),
      ),
    [scene.width, scene.height],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      sailGeometry.dispose()
      plateMaterial.dispose()
      treeMaterial.dispose()
      for (const m of sailMaterials) m.dispose()
    },
    [geometry, sailGeometry, plateMaterial, treeMaterial, sailMaterials],
  )

  useFrame(({ pointer }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = state.current
    const u = view
    if (u.uWeight.value !== weight) {
      u.uWeight.value = weight
      nightLook.uWeight.value = weight
      u.uTexel.value.set(1 / scene.width, 1 / scene.height)
    }

    // Khung "cover": phủ kín màn hình, giữ tỉ lệ ảnh, phóng ZOOM để có chỗ cho parallax.
    const screenAspect = size.width / Math.max(1, size.height)
    if (screenAspect > scene.aspect) u.uSpan.value.set(1 / ZOOM, scene.aspect / screenAspect / ZOOM)
    else u.uSpan.value.set(screenAspect / scene.aspect / ZOOM, 1 / ZOOM)
    nightLook.uSpan.value.copy(u.uSpan.value)

    // Gió (dùng chung với hạt bay)
    wind.gust = Math.max(0, wind.gust - dt * 0.45)
    const strength = 1 + wind.gust * 1.8
    shared.uWindStrength.value = strength
    shared.uTime.value += dt
    shared.uWindTime.value += dt * strength

    // Cánh quạt quay theo gió: tốc độ nền MILL_RPM, cơn gió làm nhanh thêm một chút (không quá nhanh).
    const gustBoost = 1 + MILL_GUST_BOOST * Math.min(1, wind.gust)
    millAngle -= dt * ((MILL_RPM * Math.PI * 2) / 60) * gustBoost

    // Parallax theo chuột + "thở" nhẹ + khung hình chao theo gió (mạnh hơn khi có cơn gió).
    const t = shared.uTime.value
    const wt = shared.uWindTime.value
    const sw = 0.12 + 0.12 * (strength - 1)
    const swayX = (Math.sin(wt * 0.7) * 0.6 + Math.sin(wt * 1.13 + 1.7) * 0.4) * sw
    const swayY = Math.sin(wt * 0.53 + 0.4) * sw * 0.5
    // Kẹp trong ±1.25 để lưới không bao giờ dịch quá phần viền dư (MARGIN).
    tmp
      .set(
        THREE.MathUtils.clamp(-pointer.x + Math.sin(t * 0.13) * 0.18 + swayX, -1.25, 1.25),
        THREE.MathUtils.clamp(-pointer.y + Math.sin(t * 0.09 + 1.3) * 0.15 + swayY, -1.2, 1.2),
      )
      .multiply(PARALLAX)
    s.offset.lerp(tmp, 1 - Math.exp(-dt * 2.5))
    u.uOffset.value.copy(s.offset)

    // Giờ trong ngày: thanh trượt cho giá trị liên tục → trộn hai mốc kề nhau theo phần lẻ.
    // Làm mượt để bấm phím / nhảy mốc vẫn chuyển dần chứ không giật.
    s.hour += (hour - s.hour) * (1 - Math.exp(-dt * 4))
    if (Math.abs(hour - s.hour) < 0.001) s.hour = hour
    const last = scene.hours.length - 1
    const h = THREE.MathUtils.clamp(s.hour, 0, last)
    const i = Math.max(0, Math.min(Math.floor(h), last - 1))
    const j = Math.min(i + 1, last)
    const f = last === 0 ? 0 : h - i

    // Tải mốc cần dùng + hai mốc kề; mốc chưa tải xong thì tạm dùng mốc gần nhất đã có.
    for (const k of [i, j, i - 1, j + 1]) if (k >= 0 && k <= last && !getStop(scene, k)) void requestStop(scene, k)
    evictFar(scene, Math.round(h))
    const ia = getStop(scene, i) ? i : nearestLoaded(scene, i)
    const ib = getStop(scene, j) ? j : nearestLoaded(scene, j)
    const A = getStop(scene, ia)
    const B = getStop(scene, ib)
    if (!A || !B) return
    u.uPlateA.value = A.plate
    u.uPlateB.value = B.plate
    u.uTreesA.value = A.trees
    u.uTreesB.value = B.trees
    u.uMix.value = ia === ib ? 0 : f
    nightLook.uPlate.value = f < 0.5 ? A.plate : B.plate
    setSails(0, scene, ia, A.sails, ia === ib ? 1 : 1 - f)
    setSails(1, scene, ib, ia === ib ? null : B.sails, f)

    // Ánh sáng phủ lên lá bay theo giờ (trộn như ảnh) + cùng parallax với nền.
    const ha = scene.hours[ia]
    const hb = scene.hours[ib]
    leafLook.uTint.value.copy(tintColor(ha.tint)).lerp(tintTmp.copy(tintColor(hb.tint)), ia === ib ? 0 : f)
    leafLook.uNight.value = ha.night + (hb.night - ha.night) * (ia === ib ? 0 : f)
    leafLook.uOffset.value.copy(u.uOffset.value)
  })

  return (
    <>
      <mesh geometry={geometry} material={plateMaterial} frustumCulled={false} renderOrder={-3} />
      {sailMaterials.map((m, k) => (
        <mesh key={k} geometry={sailGeometry} material={m} frustumCulled={false} renderOrder={-2} />
      ))}
      <Night />
      <mesh geometry={geometry} material={treeMaterial} frustumCulled={false} renderOrder={-1} />
      <Leaves />
    </>
  )
}
