import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../scene/config'
import { shared } from '../scene/uniforms'
import { FLIES, FLIES_GROUND, fireflies, leafLook, nightLook } from './leafLook'
import { VALLEY_IMAGE } from './valleyData'
import { WINDOWS } from './windows'

/*
 * Lớp ban đêm vẽ bằng shader trên nền 2.5D: sao lấp lánh (chỉ hiện trên chỗ trời tối, không đè lên mây
 * hay núi), đèn cửa sổ của làng (sáng dần từng nhà khi trời tối) và đom đóm lơ lửng trên đồng cỏ, mỗi con
 * toả một quầng sáng ấm làm sáng cỏ xung quanh. Hiện dần theo `uNight` của mốc giờ.
 */

const STARS = 170

const own = nightLook

const starVertex = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uPixelRatio;
uniform float uScreenH;
uniform sampler2D uPlate;
uniform sampler2D uWeight;
uniform vec2 uSpan;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec2 ndc = vec2(aSeed.x * 2.0 - 1.0, 0.05 + aSeed.y * 0.95);
  vec2 imgUv = ((ndc * 0.5 + 0.5) - 0.5) * uSpan + 0.5;
  float w = texture2D(uWeight, imgUv).r;
  vec3 c = texture2D(uPlate, imgUv).rgb;
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  // chỉ trời tối: không đè lên mây sáng, núi, cây
  float sky = (1.0 - smoothstep(0.02, 0.07, w)) * (1.0 - smoothstep(0.2, 0.36, lum));
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + 2.2 * aSeed.z) + aSeed.w * 40.0);
  vA = sky * tw * smoothstep(0.15, 0.7, uNight) * (0.45 + 0.55 * aSeed.z);
  gl_PointSize = (1.6 + 2.2 * aSeed.w * aSeed.w) * uPixelRatio * (uScreenH / 900.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`
const starFragment = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  float a = (1.0 - smoothstep(0.0, 1.0, d)) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.88), a);
  #include <colorspace_fragment>
}
`

const flyVertex = /* glsl */ `
uniform float uNight;
uniform float uPixelRatio;
uniform float uScreenH;
uniform vec2 uSpan;
uniform vec2 uOffset;
uniform vec4 uFly[${FLIES}];
attribute float aIdx;
attribute vec4 aSeed;
varying float vA;
varying float vC;
void main() {
  vec4 f = uFly[int(aIdx + 0.5)];
  // cùng cách đặt như cảnh ở độ sâu f.z: đom đóm trượt parallax như cỏ quanh nó
  vec2 ndc = ((f.xy - 0.5) / uSpan) * 2.0 + uOffset * pow(f.z, 0.8);
  vA = f.w;
  vC = step(float(${FLIES_GROUND}) - 0.5, aIdx);
  // Điểm sáng lớn hơn chính con đom đóm nhiều: phần rìa là quầng sáng nhẹ (ánh sáng rọi lên cỏ do nền vẽ).
  float centre = step(float(${FLIES_GROUND}) - 0.5, aIdx);
  float gain = mix(0.08 + 1.7 * pow(aSeed.z, 2.5), 0.5 + 1.5 * aSeed.z * aSeed.z, centre);
  // sáng hơn thì vầng sáng lớn hơn (và phập phồng theo nhịp nhấp nháy)
  float size = (14.0 + 22.0 * f.z) * (0.6 + 0.45 * min(gain, 1.6)) * (0.7 + 0.4 * sqrt(f.w)) * mix(1.0, 3.0, centre);
  gl_PointSize = size * uPixelRatio * (uScreenH / 900.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`
const flyFragment = /* glsl */ `
varying float vA;
varying float vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  // lõi nhỏ sáng + quầng rộng mềm (cộng thêm ánh sáng nên cỏ quanh con đom đóm sáng lên)
  float core = smoothstep(mix(0.1, 0.07, vC), 0.0, d);
  float halo = pow(max(0.0, 1.0 - d), 2.6);
  // cụm bay cao không có cỏ để rọi sáng nên quầng sáng của chính nó đậm hơn
  float a = min(1.0, (core * 0.95 + halo * mix(0.3, 0.6, vC)) * vA);
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.62, 0.86, 0.3), vec3(1.0, 0.98, 0.7), core);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`

// Đèn cửa sổ: mỗi ô một điểm sáng ấm đặt đúng chỗ ô cửa trong ảnh (qua parallax của nền), bật dần theo độ tối.
const winVertex = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uPixelRatio;
uniform float uScreenH;
uniform sampler2D uWeight;
uniform vec2 uSpan;
uniform vec2 uOffset;
uniform vec2 uImg;
attribute vec4 aWin; // x, y (px ảnh gốc), hạt giống, hạt giống
varying float vA;
void main() {
  vec2 imgUv = vec2(aWin.x / uImg.x, 1.0 - aWin.y / uImg.y);
  float w = texture2D(uWeight, imgUv).r;
  vec2 ndc = ((imgUv - 0.5) / uSpan) * 2.0 + uOffset * pow(w, 0.8);
  // mỗi nhà bật đèn vào một lúc khác nhau; vài ô để tối
  float on = smoothstep(0.25 + 0.5 * aWin.z, 0.4 + 0.5 * aWin.z, uNight) * step(0.18, aWin.w);
  float flick = 0.93 + 0.07 * sin(uTime * (1.5 + 3.0 * aWin.z) + aWin.w * 60.0);
  vA = on * flick;
  // ~ 4 px ảnh gốc cho ô cửa, thêm quầng sáng
  gl_PointSize = 14.0 * (uScreenH * uPixelRatio * 1.08 / 1080.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`
const winFragment = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float box = (1.0 - smoothstep(0.2, 0.3, max(abs(q.x), abs(q.y) * 1.1)));
  float halo = pow(max(0.0, 1.0 - length(q)), 2.2);
  float a = clamp(box + halo * 0.35, 0.0, 1.0) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.86, 0.52), box), a);
  #include <colorspace_fragment>
}
`

function makeGeometry(count: number, seed: number) {
  const rng = mulberry32(seed)
  const a = new Float32Array(count * 4)
  for (let i = 0; i < a.length; i++) a[i] = rng()
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(a, 4))
  return g
}

export function Night() {
  const dpr = useThree((s) => s.viewport.dpr)
  const height = useThree((s) => s.size.height)
  const stars = useMemo(() => makeGeometry(STARS, 77), [])
  const flies = useMemo(() => {
    const g = makeGeometry(FLIES, 91)
    g.setAttribute('aIdx', new THREE.BufferAttribute(Float32Array.from({ length: FLIES }, (_, i) => i), 1))
    return g
  }, [])
  const flySeeds = useMemo(() => {
    // cùng hạt giống với thuộc tính aSeed của geometry để JS và shader thống nhất độ sáng từng con
    const rng = mulberry32(91)
    return Array.from({ length: FLIES }, () => [rng(), rng(), rng(), rng()])
  }, [])
  const windows = useMemo(() => {
    const g = makeGeometry(WINDOWS.length, 55)
    const a = g.getAttribute('aSeed')
    WINDOWS.forEach(([x, y], i) => a.setXY(i, x, y))
    g.setAttribute('aWin', a)
    return g
  }, [])
  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...own, uTime: shared.uTime, uNight: leafLook.uNight },
        vertexShader: starVertex,
        fragmentShader: starFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  const flyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...own, ...fireflies, uTime: shared.uTime, uNight: leafLook.uNight, uOffset: leafLook.uOffset },
        vertexShader: flyVertex,
        fragmentShader: flyFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  const winMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...own, uTime: shared.uTime, uNight: leafLook.uNight, uOffset: leafLook.uOffset, uImg: { value: new THREE.Vector2(VALLEY_IMAGE.width, VALLEY_IMAGE.height) } },
        vertexShader: winVertex,
        fragmentShader: winFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  useEffect(
    () => () => {
      windows.dispose()
      winMat.dispose()
      stars.dispose()
      flies.dispose()
      starMat.dispose()
      flyMat.dispose()
    },
    [stars, flies, windows, starMat, flyMat, winMat],
  )
  useFrame(() => {
    own.uPixelRatio.value = dpr
    own.uScreenH.value = height
    // Vị trí đom đóm (toạ độ ảnh): lơ lửng trên đồng cỏ, trôi chậm. Độ parallax của chỗ chúng bay suy ra từ độ cao
    // trong ảnh (mặt đất càng thấp trong ảnh càng gần camera).
    const t = shared.uTime.value
    const night = leafLook.uNight.value
    fireflies.uFlyOn.value = THREE.MathUtils.smoothstep(night, 0.35, 0.9)
    for (let i = 0; i < FLIES; i++) {
      const [a, b, c, d] = flySeeds[i]
      const k = t * (0.12 + 0.1 * d)
      const high = i >= FLIES_GROUND
      const middle = i >= 16 && !high
      const x = (high ? 0.22 + 0.56 * a : middle ? 0.3 + 0.4 * a : 0.05 + 0.9 * a) + Math.sin(k * 2.1 + b * 30) * 0.03 + Math.sin(k * 0.9 + d * 12) * 0.02
      // Con bay sát cỏ: vị trí trên mặt đất (gy) + độ cao lơ lửng riêng của từng con (h); gần camera thì cao hơn trong ảnh.
      const gy = middle ? 0.1 + 0.2 * b : 0.04 + 0.32 * b
      const depth = high ? 0.78 + 0.14 * d : THREE.MathUtils.clamp(0.97 - 1.1 * gy, 0.45, 0.97)
      const hover = high ? 0 : (0.012 + 0.075 * ((a * 13.7 + b * 7.1) % 1)) * (0.6 + 0.7 * depth)
      const y = high ? 0.42 + 0.34 * b + Math.cos(k * 1.7 + a * 25) * 0.025 : gy + hover + Math.cos(k * 1.7 + a * 25) * 0.008
      fireflies.uFlyH.value[i] = hover
      const blink = (0.5 + 0.5 * Math.sin(t * (0.5 + d) + a * 50)) ** 2
      // mỗi con một cường độ riêng, chênh nhau nhiều (có con rất mờ, có con rất sáng)
      // (cụm giữa màn hình ở xa nên được bù: luôn đủ sáng để nổi bật)
      const gain = high ? 0.5 + 1.5 * c * c : 0.08 + 1.7 * c ** 2.5
      fireflies.uFly.value[i].set(x, y, depth, blink * fireflies.uFlyOn.value * gain)
    }
  })
  return (
    <>
      {/* sao nằm sau cây gần / cánh quạt nhưng trước nền */}
      <points geometry={stars} material={starMat} frustumCulled={false} renderOrder={-2.5} />
      <points geometry={windows} material={winMat} frustumCulled={false} renderOrder={-2.4} />
      <points geometry={flies} material={flyMat} frustumCulled={false} renderOrder={1} />
    </>
  )
}
