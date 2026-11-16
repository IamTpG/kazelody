import { Stats, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { FarHills } from './FarHills'
import { FluffyTree } from './FluffyTree'
import { Grass } from './Grass'
import { Motes } from './Motes'
import { SkyDome } from './SkyDome'
import { Terrain } from './Terrain'
import { CAMERA, SKIES, TREES, heightAt } from './config'
import { shared, wind } from './uniforms'

const TRANSITION_SECONDS = 2.4
const SKY_URLS = SKIES.map((s) => s.url)
// Máy cảm ứng (điện thoại/tablet) thường có GPU yếu hơn → giảm số lá cỏ.
const GRASS_COUNT = window.matchMedia('(pointer: coarse)').matches ? 25000 : 60000
// Thêm ?debug vào URL để hiện bảng FPS.
const DEBUG = new URLSearchParams(window.location.search).has('debug')

function prepareSkyTextures(loaded: THREE.Texture | THREE.Texture[]) {
  for (const t of Array.isArray(loaded) ? loaded : [loaded]) {
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = THREE.RepeatWrapping
    // Không mipmap: atan() trong shader tạo đường nối ở mép ảnh nếu dùng mipmap.
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
  }
}

const targets = SKIES.map((s) => ({
  sunDir: new THREE.Vector3(...s.sunDir).normalize(),
  sunColor: new THREE.Color(s.sunColor),
  shadowTint: new THREE.Color(s.shadowTint),
  meadowDark: new THREE.Color(s.meadowDark),
  meadowBase: new THREE.Color(s.meadowBase),
  meadowLight: new THREE.Color(s.meadowLight),
  leaf: s.leaf.map((c) => new THREE.Color(c)),
  trunk: new THREE.Color(s.trunk),
  hillNear: new THREE.Color(s.hillNear),
  hillFar: new THREE.Color(s.hillFar),
}))

const ray = new THREE.Raycaster()
const hit = new THREE.Vector3()
const camBase = new THREE.Vector3(
  CAMERA.position[0],
  heightAt(CAMERA.position[0], CAMERA.position[2]) + CAMERA.eyeHeight,
  CAMERA.position[2],
)
const camTarget = new THREE.Vector3(...CAMERA.target)

/** Tìm điểm chuột chạm mặt đất bằng cách "bước" dọc tia — rẻ hơn raycast lưới 58k tam giác. */
function marchTerrain(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) {
  let prev = 0
  for (let t = 0.5; t < 90; t += 0.35) {
    const x = origin.x + dir.x * t
    const y = origin.y + dir.y * t
    const z = origin.z + dir.z * t
    if (y <= heightAt(x, z)) {
      const tt = (prev + t) / 2
      out.set(origin.x + dir.x * tt, 0, origin.z + dir.z * tt)
      out.y = heightAt(out.x, out.z)
      return true
    }
    prev = t
  }
  return false
}

export function Experience({ skyIndex, pointerInside }: { skyIndex: number; pointerInside: boolean }) {
  const textures = useTexture(SKY_URLS, prepareSkyTextures)
  const state = useRef({ current: skyIndex, next: skyIndex, progress: 1, mouseTarget: new THREE.Vector3() })

  const trees = useMemo(() => TREES.map((t) => <FluffyTree key={t.seed} {...t} />), [])

  useFrame(({ camera, pointer }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = state.current

    if (!shared.uSkyA.value) {
      shared.uSkyA.value = shared.uSkyB.value = textures[s.current]
      shared.uSkyOffsetA.value = shared.uSkyOffsetB.value = SKIES[s.current].offset
    }

    // --- Gió ---
    wind.gust = Math.max(0, wind.gust - dt * 0.45)
    const strength = 1 + wind.gust * 1.8
    shared.uWindStrength.value = strength
    shared.uTime.value += dt
    shared.uWindTime.value += dt * strength

    // --- Chuyển cảnh bầu trời (crossfade) ---
    if (skyIndex !== s.next) {
      if (s.progress < 1) {
        shared.uSkyA.value = textures[s.next]
        shared.uSkyOffsetA.value = SKIES[s.next].offset
        s.current = s.next
      }
      s.next = skyIndex
      s.progress = 0
      shared.uSkyB.value = textures[skyIndex]
      shared.uSkyOffsetB.value = SKIES[skyIndex].offset
    }
    if (s.progress < 1) {
      s.progress = Math.min(1, s.progress + dt / TRANSITION_SECONDS)
      shared.uSkyMix.value = THREE.MathUtils.smootherstep(s.progress, 0, 1)
      if (s.progress >= 1) {
        shared.uSkyA.value = textures[s.next]
        shared.uSkyOffsetA.value = SKIES[s.next].offset
        shared.uSkyMix.value = 0
        s.current = s.next
      }
    }

    // --- Bảng màu trôi dần về preset mới ---
    const k = 1 - Math.exp(-dt * 1.6)
    const tgt = targets[skyIndex]
    shared.uSunDir.value.lerp(tgt.sunDir, k).normalize()
    shared.uSunColor.value.lerp(tgt.sunColor, k)
    shared.uShadowTint.value.lerp(tgt.shadowTint, k)
    shared.uMeadowDark.value.lerp(tgt.meadowDark, k)
    shared.uMeadowBase.value.lerp(tgt.meadowBase, k)
    shared.uMeadowLight.value.lerp(tgt.meadowLight, k)
    shared.uLeafColors.value.forEach((c, i) => c.lerp(tgt.leaf[i], k))
    shared.uTrunkColor.value.lerp(tgt.trunk, k)
    shared.uHillNear.value.lerp(tgt.hillNear, k)
    shared.uHillFar.value.lerp(tgt.hillFar, k)

    // --- Camera parallax nhẹ theo chuột ---
    const ck = 1 - Math.exp(-dt * 2.2)
    camera.position.x += (camBase.x + pointer.x * 0.7 - camera.position.x) * ck
    camera.position.y += (camBase.y + pointer.y * 0.3 - camera.position.y) * ck
    camera.position.z += (camBase.z - camera.position.z) * ck
    camera.lookAt(camTarget)

    // --- Chuột tạo gió trên cỏ ---
    ray.setFromCamera(pointer, camera)
    const onGround = pointerInside && marchTerrain(ray.ray.origin, ray.ray.direction, hit)
    if (onGround) s.mouseTarget.copy(hit)
    shared.uMouse.value.lerp(s.mouseTarget, 1 - Math.exp(-dt * 10))
    const mk = 1 - Math.exp(-dt * (onGround ? 6 : 2))
    shared.uMouseStrength.value += ((onGround ? 1 : 0) - shared.uMouseStrength.value) * mk
  })

  return (
    <>
      <SkyDome />
      <FarHills />
      <Terrain />
      <Grass count={GRASS_COUNT} />
      {trees}
      <Motes />
      {DEBUG && <Stats />}
    </>
  )
}
