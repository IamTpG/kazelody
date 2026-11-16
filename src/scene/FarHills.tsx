import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CAMERA, mulberry32 } from './config'
import { commonGlsl, outputGlsl } from './glsl'
import { shared } from './uniforms'

/* Dãy núi xa: một vòng "bức tường" có đỉnh nhấp nhô, càng xa càng chìm vào màu chân trời. */

const vertex = /* glsl */ `
${commonGlsl}
attribute float aTop;
varying vec3 vHorizon;
varying float vTop;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vHorizon = kzHorizon(w.xyz - cameraPosition);
  vTop = aTop;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragment = /* glsl */ `
uniform vec3 uHillNear;
uniform vec3 uHillFar;
uniform float uLayer;
uniform float uHaze;
varying vec3 vHorizon;
varying float vTop;
void main() {
  vec3 base = mix(uHillNear, uHillFar, uLayer);
  // Đỉnh núi đậm hơn một chút, như nét tô của hoạ sĩ nền.
  base *= mix(1.04, 0.9, smoothstep(0.55, 1.0, vTop));
  // Chân núi chìm trong sương nhiều hơn đỉnh.
  float haze = clamp(uHaze + (1.0 - vTop) * 0.3, 0.0, 1.0);
  gl_FragColor = vec4(mix(base, vHorizon, haze), 1.0);
  ${outputGlsl}
}
`

function ringGeometry(radius: number, minH: number, maxH: number, seed: number) {
  const rng = mulberry32(seed)
  const segs = 360
  const phases = Array.from({ length: 5 }, () => rng() * Math.PI * 2)
  const positions: number[] = []
  const tops: number[] = []
  const indices: number[] = []
  const [cx, , cz] = CAMERA.position
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    // Sườn núi tròn kiểu Ghibli: lấy |sin| cho đỉnh mềm, cộng các tần số cao nhỏ dần.
    let h = 0
    h += Math.pow(0.5 + 0.5 * Math.sin(a * 4 + phases[0]), 1.6)
    h += 0.55 * Math.pow(0.5 + 0.5 * Math.sin(a * 9 + phases[1]), 2)
    h += 0.22 * (0.5 + 0.5 * Math.sin(a * 17 + phases[2]))
    h += 0.07 * (0.5 + 0.5 * Math.sin(a * 41 + phases[3]))
    h = minH + (h / 1.84) * (maxH - minH)
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    positions.push(x, -8, z, x, h, z)
    tops.push(0, 1)
    if (i < segs) {
      const k = i * 2
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1))
  g.setIndex(indices)
  return g
}

function HillRing({ radius, minH, maxH, seed, layer, haze }: {
  radius: number
  minH: number
  maxH: number
  seed: number
  layer: number
  haze: number
}) {
  const geometry = useMemo(() => ringGeometry(radius, minH, maxH, seed), [radius, minH, maxH, seed])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uLayer: { value: layer }, uHaze: { value: haze } },
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.DoubleSide,
      }),
    [layer, haze],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

export function FarHills() {
  return (
    <>
      <HillRing radius={175} minH={14} maxH={42} seed={3} layer={1} haze={0.32} />
      <HillRing radius={125} minH={7} maxH={22} seed={9} layer={0} haze={0.1} />
    </>
  )
}
