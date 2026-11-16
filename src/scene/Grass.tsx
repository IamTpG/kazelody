import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CAMERA, TREES, heightAt, meadowWeights, mulberry32, normalAt } from './config'

const GRASS_RADIUS = 52
const GRASS_FADE_START = 40
import { commonGlsl, outputGlsl } from './glsl'
import { shared } from './uniforms'

/*
 * Tối ưu: cỏ phủ nửa màn hình và chồng nhiều lớp (overdraw), nên fragment shader phải
 * thật rẻ. Màu đồng cỏ tính sẵn trên CPU (aMeadow); ánh sáng, bóng cây, sương tính ở vertex.
 */
const vertex = /* glsl */ `
${commonGlsl}
attribute vec3 aOffset;
attribute vec3 aGroundNormal;
attribute vec2 aScale;
attribute vec2 aMeadow;
attribute float aAngle;
attribute float aRand;

varying float vH;
varying float vSunlit;
varying vec3 vBase;
varying vec3 vLight;
varying vec3 vFogColor;
varying float vFog;

void main() {
  float h = position.y;
  // Lá ở xa thu nhỏ dần về 0 → không sinh pixel, phần xa đã có màu đất thay thế.
  float far = 1.0 - smoothstep(${GRASS_FADE_START.toFixed(1)}, ${GRASS_RADIUS.toFixed(1)}, distance(aOffset.xz, cameraPosition.xz));
  vec2 sc = aScale * far;
  vec3 p = vec3(position.x * sc.x, h * sc.y, h * h * 0.35 * sc.y);
  float c = cos(aAngle);
  float s = sin(aAngle);
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);

  vec3 world = aOffset + p;
  float bend = h * h;

  // Gió: sóng noise trôi theo hướng gió + rung nhẹ từng lá.
  vec2 windDir = normalize(vec2(1.0, 0.35));
  float n = kzNoise(aOffset.xz * 0.07 - windDir * uWindTime * 0.6);
  float flutter = sin(uTime * 2.3 + aRand * 6.2831 + aOffset.x * 0.4) * 0.12;
  float sway = (n * 1.1 - 0.2 + flutter) * uWindStrength;
  world.xz += windDir * sway * bend * sc.y * 0.9;
  world.y -= abs(sway) * bend * sc.y * 0.18;

  // Chuột: cỏ rạp ra xung quanh con trỏ.
  vec2 d = aOffset.xz - uMouse.xz;
  float dist = length(d);
  float push = (1.0 - smoothstep(0.0, 2.6, dist)) * uMouseStrength;
  world.xz += (d / max(dist, 1e-3)) * push * bend * sc.y * 0.9;
  world.y -= push * bend * sc.y * 0.45;

  float shadow = kzTreeShadow(aOffset.xz);
  vH = h;
  vSunlit = 1.0 - shadow;
  vBase = kzMeadow(aMeadow) * (0.9 + aRand * 0.2);
  vLight = kzToonLight(aGroundNormal, shadow);
  vFogColor = kzHorizon(world - cameraPosition);
  vFog = kzFogFactor(world, uFogDensity);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
uniform vec3 uSunColor;
varying float vH;
varying float vSunlit;
varying vec3 vBase;
varying vec3 vLight;
varying vec3 vFogColor;
varying float vFog;

void main() {
  vec3 albedo = mix(vBase * 0.72, vBase * 1.12 + vec3(0.025, 0.03, 0.0), vH);
  vec3 col = albedo * vLight + uSunColor * smoothstep(0.65, 1.0, vH) * 0.07 * vSunlit;
  gl_FragColor = vec4(mix(col, vFogColor, vFog), 1.0);
  ${outputGlsl}
}
`

function bladeGeometry() {
  // Lá cỏ thon dần: 4 đốt + 1 đỉnh. y chuẩn hoá 0..1, shader sẽ scale.
  const rows = [
    [0, 1],
    [0.25, 0.92],
    [0.5, 0.78],
    [0.75, 0.52],
  ]
  const positions: number[] = []
  for (const [y, w] of rows) positions.push(-0.5 * w, y, 0, 0.5 * w, y, 0)
  positions.push(0, 1, 0)
  const indices: number[] = []
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const last = (rows.length - 1) * 2
  indices.push(last, last + 1, last + 2)
  return { positions, indices }
}

export function Grass({ count = 60000 }: { count?: number }) {
  const geometry = useMemo(() => {
    const blade = bladeGeometry()
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(blade.positions, 3))
    g.setIndex(blade.indices)

    const offset = new Float32Array(count * 3)
    const normal = new Float32Array(count * 3)
    const meadow = new Float32Array(count * 2)
    const scale = new Float32Array(count * 2)
    const angle = new Float32Array(count)
    const rand = new Float32Array(count)
    const rng = mulberry32(2024)
    const [cx, , cz] = CAMERA.position
    const maxAngle = (80 * Math.PI) / 180

    let n = 0
    while (n < count) {
      // Rải theo hình quạt trước camera: gần dày, xa thưa nhưng lá to hơn.
      // r = R·u^0.8 → mật độ ∝ r^-0.75 (bớt dồn sát camera so với 1/r).
      const r = 1.2 + Math.pow(rng(), 0.8) * GRASS_RADIUS
      const phi = (rng() * 2 - 1) * maxAngle
      const x = cx + Math.sin(phi) * r
      const z = cz - Math.cos(phi) * r
      if (TREES.some((t) => Math.hypot(x - t.x, z - t.z) < 0.7 * t.scale)) continue

      const y = heightAt(x, z)
      const [nx, ny, nz] = normalAt(x, z)
      const patch = 0.8 + 0.45 * (0.5 + 0.5 * Math.sin(x * 0.27) * Math.cos(z * 0.21))

      offset.set([x, y, z], n * 3)
      normal.set([nx, ny, nz], n * 3)
      meadow.set(meadowWeights(x, z), n * 2)
      scale.set(
        [(0.07 + rng() * 0.05) * (1 + r * 0.045), (0.3 + rng() * 0.4) * patch * (0.75 + Math.min(r, 12) * 0.03 + r * 0.012)],
        n * 2,
      )
      angle[n] = rng() * Math.PI * 2
      rand[n] = rng()
      n++
    }

    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offset, 3))
    g.setAttribute('aGroundNormal', new THREE.InstancedBufferAttribute(normal, 3))
    g.setAttribute('aScale', new THREE.InstancedBufferAttribute(scale, 2))
    g.setAttribute('aMeadow', new THREE.InstancedBufferAttribute(meadow, 2))
    g.setAttribute('aAngle', new THREE.InstancedBufferAttribute(angle, 1))
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
    g.instanceCount = count
    return g
  }, [count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared },
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.DoubleSide,
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

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
