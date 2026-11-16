import * as THREE from 'three'

/** Uniform của lá bay và lớp đêm, cập nhật từ ParallaxScene mỗi frame: ánh sáng theo giờ + parallax của nền. */
export const leafLook = {
  uTint: { value: new THREE.Color('#ffffff') },
  uOffset: { value: new THREE.Vector2() },
  /** 0 ngày … 1 đêm sâu */
  uNight: { value: 0 },
}

/** Uniform của lớp đêm (sao, đom đóm), cập nhật từ ParallaxScene. */
export const nightLook = {
  uPixelRatio: { value: 1 },
  uScreenH: { value: 900 },
  /** Ảnh nền gần nhất (để biết chỗ nào là trời tối) + bản đồ parallax + khung cover */
  uPlate: { value: null as THREE.Texture | null },
  uWeight: { value: null as THREE.Texture | null },
  uSpan: { value: new THREE.Vector2(1, 1) },
}
