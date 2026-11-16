import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { heightAt, meadowWeights } from './config'
import { commonGlsl, outputGlsl } from './glsl'
import { shared } from './uniforms'

/* Toàn bộ ánh sáng, bóng và sương tính ở vertex (58k đỉnh) thay vì từng pixel. */
const vertex = /* glsl */ `
${commonGlsl}
attribute vec2 aMeadow;
varying vec3 vColor;
varying vec3 vFogColor;
varying float vFog;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  // Mặt đất tối hơn ngọn cỏ một chút để khoảng hở giữa các lá cỏ có chiều sâu.
  vColor = kzMeadow(aMeadow) * 0.82 * kzToonLight(n, kzTreeShadow(w.xz));
  vFogColor = kzHorizon(w.xyz - cameraPosition);
  vFog = kzFogFactor(w.xyz, uFogDensity);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const fragment = /* glsl */ `
varying vec3 vColor;
varying vec3 vFogColor;
varying float vFog;
void main() {
  gl_FragColor = vec4(mix(vColor, vFogColor, vFog), 1.0);
  ${outputGlsl}
}
`

export function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(340, 340, 240, 240)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const meadow = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      pos.setY(i, heightAt(x, z))
      meadow.set(meadowWeights(x, z), i * 2)
    }
    g.setAttribute('aMeadow', new THREE.BufferAttribute(meadow, 2))
    g.computeVertexNormals()
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared },
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

  return <mesh geometry={geometry} material={material} />
}
