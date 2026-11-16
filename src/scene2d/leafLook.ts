import * as THREE from 'three'

/** Uniform của lá bay, cập nhật từ ParallaxScene mỗi frame: ánh sáng theo giờ + parallax của nền. */
export const leafLook = {
  uTint: { value: new THREE.Color('#ffffff') },
  uOffset: { value: new THREE.Vector2() },
}
