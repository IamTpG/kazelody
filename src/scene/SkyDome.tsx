import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { commonGlsl, outputGlsl } from './glsl'
import { shared } from './uniforms'

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragment = /* glsl */ `
${commonGlsl}
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  gl_FragColor = vec4(kzSampleSky(dir), 1.0);
  ${outputGlsl}
}
`

export function SkyDome() {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.SphereGeometry(500, 64, 32), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared },
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.BackSide,
        depthWrite: false,
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

  // Bầu trời luôn đi theo camera để không bao giờ chạm tới mép.
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))

  return (
    <mesh ref={ref} geometry={geometry} material={material} renderOrder={-1} frustumCulled={false} />
  )
}
