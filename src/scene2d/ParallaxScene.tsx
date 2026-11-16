import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { use, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Motes } from '../scene/Motes'
import { shared, wind } from '../scene/uniforms'
import { loadParallaxMap } from './depth'
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
const TRANSITION_SECONDS = 3
/** Số điểm của vệt chuột trên cỏ, và thời gian một điểm mờ hẳn. */
const TRAIL = 12
const TRAIL_LIFE = 1.8

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
uniform vec4 uTrail[${TRAIL}];
uniform vec3 uSunColor;
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
  // Chỉ phần cỏ gần mới phản ứng: vật xa đứng yên như tranh nền.
  float near = smoothstep(0.5, 0.85, vW);
  float sheen = 0.0;
  if (near > 0.0) {
    // Gió vẽ kiểu tranh nền: các dải cỏ ngả, bắt nắng, trôi theo hướng gió (không kéo méo ảnh).
    vec2 q = vec2(uv.x * 2.2 - uWindTime * 0.18, uv.y * 7.0);
    float band = noise(q) * 0.65 + noise(q * 2.3 + 3.1) * 0.35;
    float wind = smoothstep(0.55, 0.85, band) * (0.45 + 0.25 * uWindStrength);

    // Vệt chuột: cỏ chỗ chuột vừa lướt qua sáng lên rồi mờ dần.
    float trail = 0.0;
    for (int i = 0; i < ${TRAIL}; i++) {
      vec4 t = uTrail[i];
      vec2 d = (vUv - t.xy) * vec2(uImgAspect, 2.0);
      float f = max(0.0, 1.0 - dot(d, d) / 0.006);
      trail += f * f * t.w * max(0.0, 1.0 - t.z);
    }
    sheen = clamp(wind * 0.6 + trail, 0.0, 1.0) * near;

    // Rung lăn tăn rất nhỏ, tần số cao (lá cỏ rung) + lắc chung thật nhẹ.
    uv.x += sin(uTime * 9.0 + vUv.x * 260.0 + vUv.y * 40.0) * 0.0006 * sheen;
    uv.x += (band - 0.5) * 0.0012 * near * uWindStrength;
  }
  vec3 a = sharp(uColorA, uv);
  vec3 col = uMix > 0.0 ? mix(a, sharp(uColorB, uv), uMix) : a;
  // Cỏ ngả lộ mặt lá sáng hơn, nhuốm màu nắng của giờ hiện tại.
  col = mix(col, col * 1.16 + uSunColor * 0.1, sheen);
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
  /** xy = vị trí (uv ảnh), z = tuổi 0..1, w = cường độ */
  uTrail: { value: Array.from({ length: TRAIL }, () => new THREE.Vector4(-10, -10, 1, 0)) },
  uImgAspect: { value: 16 / 9 },
  uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
  uSharpen: { value: SHARPEN },
}
let trailHead = 0
const lastTrail = new THREE.Vector2(-10, -10)

const sunTargets = new Map<string, THREE.Color>()
const tmp = new THREE.Vector2()

export function ParallaxScene({
  scene,
  hourIndex,
  pointerInside,
}: {
  scene: SceneManifest
  hourIndex: number
  pointerInside: boolean
}) {
  const textures = useTexture(
    scene.hours.map((h) => h.url),
    prepareColor,
  )
  const weight = use(weightMap(scene))
  const size = useThree((s) => s.size)
  const state = useRef({ current: hourIndex, next: hourIndex, progress: 1, offset: new THREE.Vector2() })

  const geometry = useMemo(() => new THREE.PlaneGeometry(2 * MARGIN, 2 * MARGIN, GRID_X, GRID_Y), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...view, uTime: shared.uTime, uWindTime: shared.uWindTime, uWindStrength: shared.uWindStrength, uSunColor: shared.uSunColor },
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
      u.uColorA.value = u.uColorB.value = textures[s.current]
      u.uMix.value = 0
      const img = textures[s.current].image as { width: number; height: number }
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

    // Parallax theo chuột + "thở" nhẹ khi đứng yên cho cảnh có sức sống.
    const t = shared.uTime.value
    tmp.set(-pointer.x + Math.sin(t * 0.13) * 0.25, -pointer.y + Math.sin(t * 0.09 + 1.3) * 0.2).multiply(PARALLAX)
    s.offset.lerp(tmp, 1 - Math.exp(-dt * 2.5))
    u.uOffset.value.copy(s.offset)

    // Vệt chuột trên cỏ: thêm một điểm mỗi khi chuột đi đủ xa; các điểm già dần và trôi theo gió.
    for (const p of u.uTrail.value) {
      p.z = Math.min(1, p.z + dt / TRAIL_LIFE)
      p.x += dt * 0.012 * strength
    }
    if (pointerInside) {
      const span = u.uSpan.value
      // Cỏ gần bị parallax dịch đi uOffset → trừ ra để vệt nằm đúng dưới con trỏ.
      const mx = (pointer.x - u.uOffset.value.x) * 0.5 * span.x + 0.5
      const my = (pointer.y - u.uOffset.value.y) * 0.5 * span.y + 0.5
      const moved = Math.hypot((mx - lastTrail.x) * scene.aspect, my - lastTrail.y)
      if (moved > 0.02) {
        u.uTrail.value[trailHead].set(mx, my, 0, Math.min(1, 0.45 + moved * 4))
        trailHead = (trailHead + 1) % TRAIL
        lastTrail.set(mx, my)
      }
    }

    // Chuyển giờ: crossfade hai ảnh cùng góc máy.
    if (hourIndex !== s.next) {
      if (s.progress < 1) {
        u.uColorA.value = textures[s.next]
        s.current = s.next
      }
      s.next = hourIndex
      s.progress = 0
      u.uColorB.value = textures[hourIndex]
    }
    if (s.progress < 1) {
      s.progress = Math.min(1, s.progress + dt / TRANSITION_SECONDS)
      u.uMix.value = THREE.MathUtils.smootherstep(s.progress, 0, 1)
      if (s.progress >= 1) {
        u.uColorA.value = textures[s.next]
        u.uMix.value = 0
        s.current = s.next
      }
    }

    // Màu hạt bay theo giờ
    const hex = scene.hours[hourIndex].sunColor
    let c = sunTargets.get(hex)
    if (!c) sunTargets.set(hex, (c = new THREE.Color(hex)))
    shared.uSunColor.value.lerp(c, 1 - Math.exp(-dt * 1.5))
  })

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
      <Motes count={160} occlude={false} />
    </>
  )
}
