import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from './config'
import { commonGlsl } from './glsl'
import { shared } from './uniforms'

/* Hạt phấn / bồ công anh trôi theo gió. Toàn bộ chuyển động tính trong shader. */

const BOX = { x: [-32, 32], y: [0.3, 13], z: [-42, 13] } as const

const vertex = /* glsl */ `
${commonGlsl}
uniform float uPixelRatio;
attribute float aRand;
attribute float aSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uWindTime * (0.8 + aRand * 0.6);
  p.x = mod(p.x - ${BOX.x[0].toFixed(1)} + t * 1.4, ${(BOX.x[1] - BOX.x[0]).toFixed(1)}) + ${BOX.x[0].toFixed(1)};
  p.z = mod(p.z - ${BOX.z[0].toFixed(1)} + t * 0.5, ${(BOX.z[1] - BOX.z[0]).toFixed(1)}) + ${BOX.z[0].toFixed(1)};
  p.y += sin(uTime * 0.7 + aRand * 6.2831) * 0.5 + sin(uTime * 1.7 + aRand * 20.0) * 0.12;
  p.x += sin(uTime * 0.9 + aRand * 11.0) * 0.3;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPixelRatio * (36.0 / -mv.z);
  gl_Position = projectionMatrix * mv;

  // Mờ dần ở rìa hộp để hạt không "nhảy" khi quay vòng.
  float fx = smoothstep(${BOX.x[0].toFixed(1)}, ${(BOX.x[0] + 4).toFixed(1)}, p.x) * (1.0 - smoothstep(${(BOX.x[1] - 4).toFixed(1)}, ${BOX.x[1].toFixed(1)}, p.x));
  float fz = smoothstep(${BOX.z[0].toFixed(1)}, ${(BOX.z[0] + 4).toFixed(1)}, p.z) * (1.0 - smoothstep(${(BOX.z[1] - 4).toFixed(1)}, ${BOX.z[1].toFixed(1)}, p.z));
  float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + aRand * 30.0);
  vAlpha = fx * fz * twinkle;
}
`

const fragment = /* glsl */ `
uniform vec3 uSunColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  gl_FragColor = vec4(uSunColor * 1.6, a * vAlpha);
  #include <colorspace_fragment>
}
`

export function Motes({ count = 420, occlude = true }: { count?: number; occlude?: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr)

  const geometry = useMemo(() => {
    const rng = mulberry32(99)
    const pos = new Float32Array(count * 3)
    const rand = new Float32Array(count)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = BOX.x[0] + rng() * (BOX.x[1] - BOX.x[0])
      pos[i * 3 + 1] = BOX.y[0] + rng() * rng() * (BOX.y[1] - BOX.y[0])
      pos[i * 3 + 2] = BOX.z[0] + rng() * (BOX.z[1] - BOX.z[0])
      rand[i] = rng()
      size[i] = 2 + rng() * 4
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    return g
  }, [count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uPixelRatio: { value: dpr } },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        // Trên nền 2.5D không có hình khối thật để che hạt → tắt depth test.
        depthTest: occlude,
        blending: THREE.AdditiveBlending,
      }),
    [dpr, occlude],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
