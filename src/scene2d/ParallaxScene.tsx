import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { use, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { shared, wind } from '../scene/uniforms'
import { loadParallaxMap } from './depth'
import { Leaves } from './Leaves'
import { leafLook } from './leafLook'
import type { SceneManifest } from './manifest'

/*
 * Nền 2.5D: một lưới phủ kín màn hình, mỗi đỉnh dịch theo độ sâu khi rê chuột (kiểu ảnh 3D của
 * Facebook). Mỗi pixel chỉ đọc ảnh màu đúng một lần (hai lần khi đang chuyển giờ), nên rất nhẹ cho GPU yếu.
 * Gió và chuột chỉ làm méo nhẹ phần cỏ ở gần (độ parallax cao).
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

const fragment = /* glsl */ `
uniform sampler2D uColorA;
uniform sampler2D uColorB;
uniform float uMix;
uniform float uTime;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uImgAspect;
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

void main() {
  vec2 uv = vUv;
  // Chỉ phần cỏ gần mới đung đưa: vật xa đứng yên như tranh nền.
  float near = smoothstep(0.5, 0.85, vW);
  if (near > 0.0) {
    // Cả mảng cỏ gần ngả qua lại chậm theo gió (tần số thấp → trông như cỏ đung đưa, không như méo ảnh).
    float sway = noise(vec2(uv.x * 2.5 - uWindTime * 0.3, uv.y * 1.2 + uWindTime * 0.05)) - 0.5;
    uv.x += sway * 0.006 * near * uWindStrength;
  }
  vec3 a = sharp(uColorA, uv);
  vec3 col = uMix > 0.0 ? mix(a, sharp(uColorB, uv), uMix) : a;
  gl_FragColor = vec4(col, 1.0);
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

function prepareColor(loaded: THREE.Texture | THREE.Texture[]) {
  for (const t of Array.isArray(loaded) ? loaded : [loaded]) {
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.anisotropy = 1
    t.needsUpdate = true
  }
}

/** Uniform riêng của nền 2.5D, cấp module (như `shared`) để cập nhật mỗi frame mà không đụng state React. */
const view = {
  uWeight: { value: null as THREE.Texture | null },
  uColorA: { value: null as THREE.Texture | null },
  uColorB: { value: null as THREE.Texture | null },
  uMix: { value: 0 },
  uSpan: { value: new THREE.Vector2(1, 1) },
  uOffset: { value: new THREE.Vector2() },
  uImgAspect: { value: 16 / 9 },
  uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  uSharpen: { value: SHARPEN },
}

const tints = new Map<string, THREE.Color>()
function tintColor(hex: string) {
  let c = tints.get(hex)
  if (!c) tints.set(hex, (c = new THREE.Color(hex)))
  return c
}
const tmp = new THREE.Vector2()

export function ParallaxScene({
  scene,
  hour,
}: {
  scene: SceneManifest
  /** Giờ trong ngày dạng liên tục: 0 = ảnh đầu, 1 = ảnh thứ hai… (từ thanh trượt) */
  hour: number
}) {
  const textures = useTexture(
    scene.hours.map((h) => h.url),
    prepareColor,
  )
  const weight = use(weightMap(scene))
  const size = useThree((s) => s.size)
  const state = useRef({ hour, offset: new THREE.Vector2() })

  const geometry = useMemo(() => new THREE.PlaneGeometry(2 * MARGIN, 2 * MARGIN, GRID_X, GRID_Y), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...view, uTime: shared.uTime, uWindTime: shared.uWindTime, uWindStrength: shared.uWindStrength },
        vertexShader: vertex,
        fragmentShader: fragment,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(({ pointer }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = state.current
    const u = view
    if (u.uWeight.value !== weight) {
      u.uWeight.value = weight
      u.uImgAspect.value = scene.aspect
      const img = textures[0].image as { width: number; height: number }
      u.uTexel.value.set(1 / img.width, 1 / img.height)
    }

    // Khung "cover": phủ kín màn hình, giữ tỉ lệ ảnh, phóng ZOOM để có chỗ cho parallax.
    const screenAspect = size.width / Math.max(1, size.height)
    if (screenAspect > scene.aspect) u.uSpan.value.set(1 / ZOOM, scene.aspect / screenAspect / ZOOM)
    else u.uSpan.value.set(screenAspect / scene.aspect / ZOOM, 1 / ZOOM)

    // Gió (dùng chung với hạt bay)
    wind.gust = Math.max(0, wind.gust - dt * 0.45)
    const strength = 1 + wind.gust * 1.8
    shared.uWindStrength.value = strength
    shared.uTime.value += dt
    shared.uWindTime.value += dt * strength

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

    // Giờ trong ngày: thanh trượt cho giá trị liên tục → trộn hai ảnh kề nhau theo phần lẻ.
    // Làm mượt để bấm phím / nhảy nhãn vẫn chuyển dần chứ không giật.
    s.hour += (hour - s.hour) * (1 - Math.exp(-dt * 4))
    if (Math.abs(hour - s.hour) < 0.001) s.hour = hour
    const last = textures.length - 1
    const h = THREE.MathUtils.clamp(s.hour, 0, last)
    const i = Math.max(0, Math.min(Math.floor(h), last - 1))
    const j = Math.min(i + 1, last)
    const f = last === 0 ? 0 : h - i
    u.uColorA.value = textures[i]
    u.uColorB.value = textures[j]
    u.uMix.value = f

    // Ánh sáng phủ lên lá bay theo giờ (trộn như ảnh) + cùng parallax với nền.
    leafLook.uTint.value.copy(tintColor(scene.hours[i].tint)).lerp(tintColor(scene.hours[j].tint), f)
    leafLook.uOffset.value.copy(u.uOffset.value)
  })

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
      <Leaves />
    </>
  )
}
