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

/** Số đom đóm; vị trí tính bằng JS mỗi frame rồi dùng chung cho điểm sáng (Night) và ánh sáng rọi lên cỏ (nền). */
export const FLIES = 24
/** Số con bay sát cỏ (16 con khắp đồng cỏ + 3 con ở khoảng giữa); các con còn lại bay cao giữa không trung */
export const FLIES_GROUND = 19
export const fireflies = {
  /** (x, y trong toạ độ ảnh 0–1, độ parallax của chỗ nó bay, độ sáng hiện tại) */
  uFly: { value: Array.from({ length: FLIES }, () => new THREE.Vector4()) },
  /** Độ cao con đom đóm so với mặt cỏ bên dưới (đơn vị toạ độ ảnh) — càng cao ánh sáng rọi xuống càng yếu */
  uFlyH: { value: Array.from({ length: FLIES }, () => 0) },
  /** 0 … 1: ban đêm mới bật ánh sáng rọi */
  uFlyOn: { value: 0 },
}
