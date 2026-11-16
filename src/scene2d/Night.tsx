import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../scene/config'
import { shared } from '../scene/uniforms'
import { leafLook, nightLook } from './leafLook'

/*
 * Lớp ban đêm vẽ bằng shader trên nền 2.5D: sao lấp lánh (chỉ hiện trên chỗ trời tối, không đè lên mây
 * hay núi) và đom đóm lơ lửng trên đồng cỏ. Hiện dần theo `uNight` của mốc giờ.
 */

const STARS = 170
const FLIES = 30

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
uniform float uTime;
uniform float uNight;
uniform float uPixelRatio;
uniform float uScreenH;
uniform vec2 uOffset;
attribute vec4 aSeed;
varying float vA;
void main() {
  float z = 0.35 + 0.65 * aSeed.z;
  float t = uTime * (0.12 + 0.1 * aSeed.w);
  vec2 p = vec2(
    aSeed.x * 2.0 - 1.0 + sin(t * 2.1 + aSeed.y * 30.0) * 0.07 + sin(t * 0.9 + aSeed.w * 12.0) * 0.05,
    -0.12 - aSeed.y * 0.78 + cos(t * 1.7 + aSeed.x * 25.0) * 0.045
  );
  p += uOffset * (0.5 + 0.7 * z);
  // nhấp nháy chậm, mỗi con một nhịp
  float blink = pow(0.5 + 0.5 * sin(uTime * (0.5 + aSeed.w) + aSeed.x * 50.0), 2.0);
  vA = blink * smoothstep(0.35, 0.9, uNight);
  gl_PointSize = (8.0 + 12.0 * z) * uPixelRatio * (uScreenH / 900.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`
const flyFragment = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  // lõi nhỏ sáng + quầng mềm
  float a = (smoothstep(0.35, 0.0, d) * 0.9 + smoothstep(1.0, 0.0, d) * 0.28) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.93, 0.98, 0.55), a);
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
  const flies = useMemo(() => makeGeometry(FLIES, 91), [])
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
        uniforms: { ...own, uTime: shared.uTime, uNight: leafLook.uNight, uOffset: leafLook.uOffset },
        vertexShader: flyVertex,
        fragmentShader: flyFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  useEffect(
    () => () => {
      stars.dispose()
      flies.dispose()
      starMat.dispose()
      flyMat.dispose()
    },
    [stars, flies, starMat, flyMat],
  )
  useFrame(() => {
    own.uPixelRatio.value = dpr
    own.uScreenH.value = height
  })
  return (
    <>
      {/* sao nằm sau cây gần / cánh quạt nhưng trước nền */}
      <points geometry={stars} material={starMat} frustumCulled={false} renderOrder={-2.5} />
      <points geometry={flies} material={flyMat} frustumCulled={false} renderOrder={1} />
    </>
  )
}
