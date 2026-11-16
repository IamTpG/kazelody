import * as THREE from 'three'
import { CANOPY, SKIES, TREES } from './config'

const preset = SKIES[0]

/**
 * Uniform dùng chung cho mọi shader trong cảnh. Material nào spread object này
 * vào `uniforms` sẽ giữ cùng tham chiếu `{ value }`, nên chỉ cần cập nhật một chỗ mỗi frame.
 */
export const shared = {
  uTime: { value: 0 },
  uWindTime: { value: 0 },
  uWindStrength: { value: 1 },
  uMouse: { value: new THREE.Vector3(0, -100, 0) },
  uMouseStrength: { value: 0 },

  uSkyA: { value: null as THREE.Texture | null },
  uSkyB: { value: null as THREE.Texture | null },
  uSkyMix: { value: 0 },
  uSkyOffsetA: { value: preset.offset },
  uSkyOffsetB: { value: preset.offset },
  uFogDensity: { value: 0.0085 },

  uSunDir: { value: new THREE.Vector3(...preset.sunDir).normalize() },
  uSunColor: { value: new THREE.Color(preset.sunColor) },
  uShadowTint: { value: new THREE.Color(preset.shadowTint) },
  uMeadowDark: { value: new THREE.Color(preset.meadowDark) },
  uMeadowBase: { value: new THREE.Color(preset.meadowBase) },
  uMeadowLight: { value: new THREE.Color(preset.meadowLight) },
  uLeafColors: { value: preset.leaf.map((c) => new THREE.Color(c)) },
  uTrunkColor: { value: new THREE.Color(preset.trunk) },
  uHillNear: { value: new THREE.Color(preset.hillNear) },
  uHillFar: { value: new THREE.Color(preset.hillFar) },

  /** (x, z, bán kính bóng, độ cao tán) cho từng cây — dùng để vẽ bóng đổ giả lên cỏ/đồi. */
  uTreeShadows: {
    value: TREES.map(
      (t) => new THREE.Vector4(t.x, t.z, CANOPY.radius * t.scale * 1.05, CANOPY.centerY * t.scale),
    ),
  },
}

export type SharedUniforms = typeof shared

/** Trạng thái gió điều khiển bởi tương tác (click → cơn gió mạnh). */
export const wind = { gust: 0 }
