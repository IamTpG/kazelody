import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CANOPY, heightAt, mulberry32 } from './config'
import { commonGlsl, outputGlsl } from './glsl'
import { shared } from './uniforms'

/* ---------------------------------------------------------------------------
 * Tán lá: hàng trăm "thẻ lá" (quad) luôn quay về camera, đặt trên bề mặt các cụm cầu.
 * Normal lấy từ khối cầu (không phải từ quad) → cả tán sáng/tối mềm như một khối bông.
 * Tô màu bằng 4 dải phẳng (kỹ thuật của craftzdog/ghibli-style-shader).
 * ------------------------------------------------------------------------- */

const leafVertex = /* glsl */ `
${commonGlsl}
attribute vec3 aCenter;
attribute vec3 aLeafNormal;
attribute float aSize;
attribute float aRand;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vFogColor;
varying float vFog;
varying float vRand;
varying float vHeight;

void main() {
  float treeScale = length(modelMatrix[0].xyz);
  vec3 c = aCenter;
  float sway = (c.y / ${(CANOPY.centerY + CANOPY.radius).toFixed(2)}) * uWindStrength;
  c.x += sin(uTime * 1.3 + c.y * 0.6 + aRand * 3.0) * 0.06 * sway;
  c.z += cos(uTime * 1.1 + c.x * 0.5 + aRand * 2.0) * 0.05 * sway;

  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float a = aRand * 6.2831;
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  mv.xy += rot * position.xy * aSize * treeScale;

  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * aLeafNormal);
  vec3 world = (modelMatrix * vec4(c, 1.0)).xyz;
  vFogColor = kzHorizon(world - cameraPosition);
  vFog = kzFogFactor(world, uFogDensity);
  vRand = aRand;
  vHeight = c.y;
  gl_Position = projectionMatrix * mv;
}
`

const leafFragment = /* glsl */ `
${commonGlsl}
uniform sampler2D uLeafTex;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vFogColor;
varying float vFog;
varying float vRand;
varying float vHeight;

void main() {
  vec4 t = texture2D(uLeafTex, vUv);
  if (t.a < 0.5) discard;

  // + 0.12: ánh sáng phụ từ bầu trời để mặt dưới tán không chìm hẳn.
  float b = dot(normalize(vNormal), uSunDir) + 0.12;
  b += (t.r - 0.72) * 0.45 + (vRand - 0.5) * 0.08;
  b -= (1.0 - smoothstep(${(CANOPY.centerY - CANOPY.radius).toFixed(2)}, ${(CANOPY.centerY + 0.5).toFixed(2)}, vHeight)) * 0.12;

  vec3 col;
  if (b > 0.55) col = uLeafColors[0];
  else if (b > 0.25) col = uLeafColors[1];
  else if (b > -0.12) col = uLeafColors[2];
  else col = uLeafColors[3];
  col *= mix(mix(uShadowTint, vec3(1.0), 0.45), uSunColor, smoothstep(-0.1, 0.3, b));

  gl_FragColor = vec4(mix(col, vFogColor, vFog), 1.0);
  ${outputGlsl}
}
`

/* Thân cây: toon 2 bậc, tối dần lên phía dưới tán. */
const trunkVertex = /* glsl */ `
${commonGlsl}
varying vec3 vNormal;
varying vec3 vFogColor;
varying float vFog;
varying float vY;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFogColor = kzHorizon(w.xyz - cameraPosition);
  vFog = kzFogFactor(w.xyz, uFogDensity);
  vY = position.y;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const trunkFragment = /* glsl */ `
${commonGlsl}
varying vec3 vNormal;
varying vec3 vFogColor;
varying float vFog;
varying float vY;
void main() {
  float ndl = dot(normalize(vNormal), uSunDir);
  float b = smoothstep(0.05, 0.15, ndl);
  b *= 1.0 - smoothstep(1.2, ${(CANOPY.centerY - 1.0).toFixed(2)}, vY) * 0.85;
  vec3 col = uTrunkColor * mix(uShadowTint * 0.75, uSunColor, b);
  gl_FragColor = vec4(mix(col, vFogColor, vFog), 1.0);
  ${outputGlsl}
}
`

let leafTexture: THREE.CanvasTexture | null = null

/** Vẽ một chùm lá bằng canvas: alpha = hình dạng, kênh đỏ = độ sáng từng lá nhỏ. */
function getLeafTexture() {
  if (leafTexture) return leafTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rng = mulberry32(7)
  for (let i = 0; i < 46; i++) {
    const ang = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * size * 0.33
    const g = Math.floor(150 + rng() * 105)
    ctx.save()
    ctx.translate(size / 2 + Math.cos(ang) * rad, size / 2 + Math.sin(ang) * rad)
    ctx.rotate(ang + (rng() - 0.5))
    ctx.fillStyle = `rgb(${g},${g},${g})`
    ctx.beginPath()
    ctx.ellipse(0, 0, size * 0.1, size * 0.055, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  leafTexture = new THREE.CanvasTexture(canvas)
  leafTexture.colorSpace = THREE.NoColorSpace
  return leafTexture
}

function buildTree(seed: number) {
  const rng = mulberry32(seed)
  const canopyCenter = new THREE.Vector3(0, CANOPY.centerY, 0)
  const radii = new THREE.Vector3(CANOPY.radius, CANOPY.radius * 0.72, CANOPY.radius)

  // Các cụm lá phân bố quanh tâm tán, thiên về phía trên.
  const clumps: { center: THREE.Vector3; r: number }[] = []
  for (let i = 0; i < 11; i++) {
    const dir = new THREE.Vector3(rng() * 2 - 1, rng() * 1.3 - 0.35, rng() * 2 - 1).normalize()
    const center = dir.clone().multiply(radii).multiplyScalar(0.62).add(canopyCenter)
    clumps.push({ center, r: 1.25 + rng() * 0.7 })
  }
  clumps.push({ center: canopyCenter.clone().add(new THREE.Vector3(0, 1.2, 0)), r: 1.9 })

  const centers: number[] = []
  const normals: number[] = []
  const sizes: number[] = []
  const rands: number[] = []
  const v = new THREE.Vector3()
  const outward = new THREE.Vector3()
  for (const clump of clumps) {
    for (let j = 0; j < 62; j++) {
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) {
        j--
        continue
      }
      v.normalize()
      const p = v.clone().multiplyScalar(clump.r * (0.35 + 0.65 * Math.sqrt(rng()))).add(clump.center)
      outward.copy(p).sub(canopyCenter).divide(radii).normalize()
      const n = v.clone().multiplyScalar(0.72).addScaledVector(outward, 0.28).add(new THREE.Vector3(0, 0.1, 0)).normalize()
      centers.push(p.x, p.y, p.z)
      normals.push(n.x, n.y, n.z)
      sizes.push(1.05 + rng() * 0.6)
      rands.push(rng())
    }
  }

  const leaves = new THREE.InstancedBufferGeometry()
  const quad = new THREE.PlaneGeometry(1, 1)
  leaves.setAttribute('position', quad.attributes.position)
  leaves.setAttribute('uv', quad.attributes.uv)
  leaves.setIndex(quad.index)
  leaves.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3))
  leaves.setAttribute('aLeafNormal', new THREE.InstancedBufferAttribute(new Float32Array(normals), 3))
  leaves.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1))
  leaves.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(rands), 1))
  leaves.instanceCount = sizes.length

  // Thân hơi cong + vài cành vươn tới các cụm lá.
  const trunkH = CANOPY.centerY + 0.4
  const trunk = new THREE.CylinderGeometry(0.2, 0.42, trunkH, 10, 14, true)
  trunk.translate(0, trunkH / 2, 0)
  const tp = trunk.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i)
    tp.setX(i, tp.getX(i) + Math.sin(y * 0.55) * 0.22)
    if (y < 0.6) {
      const flare = 1 + (0.6 - y) * 0.6
      tp.setX(i, tp.getX(i) * flare)
      tp.setZ(i, tp.getZ(i) * flare)
    }
  }
  trunk.computeVertexNormals()

  const parts: THREE.BufferGeometry[] = [trunk]
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 4; i++) {
    const from = new THREE.Vector3(Math.sin(trunkH * 0.6 * 0.55) * 0.22, trunkH * (0.55 + i * 0.08), 0)
    const to = clumps[i].center.clone().lerp(canopyCenter, 0.25)
    const dir = to.clone().sub(from)
    const len = dir.length()
    const branch = new THREE.CylinderGeometry(0.06, 0.15, len, 6, 1, true)
    branch.translate(0, len / 2, 0)
    branch.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()))
    branch.translate(from.x, from.y, from.z)
    parts.push(branch)
  }
  const wood = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  quad.dispose()

  return { leaves, wood }
}

export function FluffyTree({ x, z, scale, seed }: { x: number; z: number; scale: number; seed: number }) {
  const { leaves, wood } = useMemo(() => buildTree(seed), [seed])

  const leafMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uLeafTex: { value: getLeafTexture() } },
        vertexShader: leafVertex,
        fragmentShader: leafFragment,
      }),
    [],
  )
  const woodMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...shared },
        vertexShader: trunkVertex,
        fragmentShader: trunkFragment,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(
    () => () => {
      leaves.dispose()
      wood.dispose()
      leafMaterial.dispose()
      woodMaterial.dispose()
    },
    [leaves, wood, leafMaterial, woodMaterial],
  )

  return (
    <group position={[x, heightAt(x, z) - 0.25, z]} scale={scale} rotation={[0, seed, 0]}>
      <mesh geometry={wood} material={woodMaterial} />
      <mesh geometry={leaves} material={leafMaterial} frustumCulled={false} />
    </group>
  )
}
