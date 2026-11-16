import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../scene/config'
import { shared, wind } from '../scene/uniforms'
import { leafLook } from './leafLook'

/*
 * Lá, cánh hoa, hạt bồ công anh bay theo gió — vẽ bằng shader (không cần ảnh), nét phẳng như tranh nền.
 * - Lá: bốn kiểu (hạt hạnh nhân, tròn, liễu thon dài, thuỳ như lá phong), mỗi chiếc một tông xanh khác nhau;
 *   lật quanh trục dọc nên lúc thấy mặt, lúc thấy cạnh, mặt trên đậm / mặt dưới nhạt.
 * - Bay theo hướng gió, rơi chậm, đung đưa zigzag; gần to và hơi nhoè, xa nhỏ và sắc.
 * - Nhấp chuột: một cơn gió cuốn một nắm lá từ phía cây bên trái bay vút qua màn hình. Mỗi lần nhấp có nhóm lá
 *   riêng (xoay vòng 4 nhóm) nên nhấp lúc lá đang bay không làm lá cũ biến mất.
 * Toàn bộ chuyển động tính trong vertex shader từ thời gian → không tốn CPU.
 */

/** Kiểu của từng chiếc lá trôi: 0 hạnh nhân, 3 tròn, 4 liễu thon, 5 thuỳ (lá phong) */
const LEAF_KINDS = [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5]
const LEAVES = LEAF_KINDS.length
const PETALS = 8
const SEEDS = 4
const AMBIENT = LEAVES + PETALS + SEEDS
const GUST_SLOTS = 4
const PER_SLOT = 10
const GUST = GUST_SLOTS * PER_SLOT
const GUST_KINDS = [0, 3, 4, 5, 0, 3, 1, 0, 5, 3]
const COUNT = AMBIENT + GUST


const own = {
  uGustAt: { value: [-100, -100, -100, -100] },
  uPixelRatio: { value: 1 },
  uScreenH: { value: 900 },
  // Bảng màu lấy theo tranh nền (lá cây lớn, hoa dại trong cỏ); ánh sáng theo giờ nhân thêm uTint.
  uFront: { value: new THREE.Color('#4b7a3d') },
  uFront2: { value: new THREE.Color('#86a043') },
  uBack: { value: new THREE.Color('#a3c46f') },
  uBack2: { value: new THREE.Color('#d2d98a') },
  uPetals: { value: [new THREE.Color('#f6f2e4'), new THREE.Color('#f3d46c'), new THREE.Color('#cdb9e6'), new THREE.Color('#f2c3cf')] },
  uSeed: { value: new THREE.Color('#fbfaf3') },
}

let lastGust = 0
let gustCount = 0

const vertex = /* glsl */ `
uniform float uTime;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uGustAt[4];
uniform float uPixelRatio;
uniform float uScreenH;
uniform vec2 uOffset;
attribute vec4 aSeed;
attribute float aKind;   // 0 lá hạnh nhân, 1 cánh hoa, 2 hạt bồ công anh, 3 lá tròn, 4 lá liễu, 5 lá thuỳ
attribute float aGust;   // 1 = chỉ bay khi có cơn gió
attribute float aSlot;   // nhóm lá của cơn gió (mỗi lần nhấp một nhóm)
attribute float aDepth;  // 0.35 (xa) … 1 (gần)
varying float vKind;
varying float vAngle;
varying float vFlip;
varying float vDepth;
varying float vAlpha;
varying vec2 vRand;

void main() {
  float z = aDepth;
  float t = uTime;
  vec2 p;
  float alpha;
  if (aGust < 0.5) {
    // Trôi theo gió (trái → phải), rơi chậm, quay vòng khi ra khỏi màn hình.
    float speed = (0.035 + 0.05 * z) * (0.8 + 0.4 * aSeed.x);
    float x = fract(aSeed.y + uWindTime * speed / 2.6) * 2.6 - 1.3;
    float fall = (0.012 + 0.02 * aSeed.z) * (aKind > 1.5 && aKind < 2.5 ? 0.3 : 1.0);
    float y = fract(aSeed.w - t * fall / 2.4) * 2.4 - 1.2;
    float zig = sin(t * (0.9 + aSeed.x) + aSeed.y * 30.0) * 0.03 * z;
    p = vec2(x + zig * 0.5, y + zig);
    alpha = smoothstep(-1.3, -1.1, x) * (1.0 - smoothstep(1.1, 1.3, x))
          * smoothstep(-1.2, -1.0, y) * (1.0 - smoothstep(1.0, 1.2, y));
  } else {
    // Cơn gió: từ tán cây bên trái vút lên theo đường cong rồi bay sang phải.
    float g = (t - uGustAt[int(aSlot + 0.5)]) * (0.32 + 0.22 * aSeed.x) - aSeed.y * 0.35;
    if (g < 0.0 || g > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec2 a = vec2(-0.85 + aSeed.z * 0.35, 0.15 + aSeed.w * 0.6);
    vec2 c = vec2(aSeed.x * 0.4, 0.75 + aSeed.y * 0.4);
    vec2 b = vec2(1.35, -0.1 + aSeed.z * 0.7);
    p = mix(mix(a, c, g), mix(c, b, g), g);
    p.y += sin(t * 2.0 + aSeed.x * 20.0) * 0.03;
    alpha = smoothstep(0.0, 0.08, g) * (1.0 - smoothstep(0.85, 1.0, g));
  }
  // Lá lơ lửng giữa camera và cảnh: lá gần trượt parallax nhiều hơn cả cỏ.
  p += uOffset * (0.5 + 0.7 * z);

  // (không nhân với sức gió: góc = t * spin, đổi spin giữa chừng sẽ làm lá xoay giật vì t rất lớn)
  float spin = (aSeed.x - 0.5) * 3.0;
  vAngle = aSeed.y * 6.2831 + t * spin;
  vFlip = cos(t * (1.2 + 2.0 * aSeed.z) * (aKind > 0.5 && aKind < 2.5 ? 0.6 : 1.0) + aSeed.w * 6.2831);
  vKind = aKind;
  vDepth = z;
  vAlpha = alpha;
  vRand = aSeed.xz;
  float px = aKind < 0.5 ? (12.0 + 26.0 * z)
           : aKind < 1.5 ? (6.0 + 10.0 * z)
           : aKind < 2.5 ? (9.0 + 9.0 * z)
           : aKind < 3.5 ? (12.0 + 24.0 * z)
           : aKind < 4.5 ? (14.0 + 28.0 * z)
           : (12.0 + 22.0 * z);
  gl_PointSize = px * uPixelRatio * (uScreenH / 900.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform vec3 uTint;
uniform float uNight;
uniform vec3 uFront;
uniform vec3 uFront2;
uniform vec3 uBack;
uniform vec3 uBack2;
uniform vec3 uPetals[4];
uniform vec3 uSeed;
varying float vKind;
varying float vAngle;
varying float vFlip;
varying float vDepth;
varying float vAlpha;
varying vec2 vRand;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float ca = cos(vAngle);
  float sa = sin(vAngle);
  q = mat2(ca, -sa, sa, ca) * q;
  // Lật quanh trục dọc của lá → bề ngang co lại.
  q.x /= max(abs(vFlip), 0.12);
  // Lá gần nhoè hơn (như ngoài vùng lấy nét).
  float edge = 0.04 + 0.14 * smoothstep(0.75, 1.0, vDepth);

  float a;
  vec3 col;
  if (vKind < 0.5) {
    float y = q.y;
    float w = 0.42 * pow(max(0.0, 1.0 - y * y), 0.9) * (1.0 - 0.25 * y);
    float d = max(abs(q.x) - w, abs(y) - 0.92);
    a = 1.0 - smoothstep(-edge, edge, d);
    bool front = vFlip > 0.0;
    col = front ? mix(uFront, uFront2, vRand.y) : mix(uBack, uBack2, vRand.y);
    // gân giữa (chỉ ở mặt trên)
    if (front) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.07, abs(q.x))) * step(abs(y), 0.8);
  } else if (vKind < 1.5) {
    float d = length(q * vec2(1.0, 0.8) + vec2(0.0, 0.15)) - 0.6;
    a = 1.0 - smoothstep(-edge, edge, d);
    col = vRand.x < 0.35 ? uPetals[0] : vRand.x < 0.6 ? uPetals[1] : vRand.x < 0.8 ? uPetals[2] : uPetals[3];
    col *= vFlip > 0.0 ? 1.0 : 0.85;
  } else if (vKind > 2.5) {
    float d;
    float y = q.y;
    bool front = vFlip > 0.0;
    float vein = 0.0;
    if (vKind < 3.5) {
      // lá tròn, đầu hơi nhọn
      float w = 0.6 * pow(max(0.0, 1.0 - y * y), 0.55) * (1.0 - 0.22 * smoothstep(0.1, 0.9, y));
      d = max(abs(q.x) - w, abs(y) - 0.85);
      vein = (1.0 - smoothstep(0.02, 0.06, abs(q.x))) * step(abs(y), 0.7);
    } else if (vKind < 4.5) {
      // lá liễu: dài và thon
      float w = 0.17 * pow(max(0.0, 1.0 - y * y), 0.75);
      d = max(abs(q.x) - w, abs(y) - 0.95);
      vein = (1.0 - smoothstep(0.01, 0.035, abs(q.x))) * step(abs(y), 0.85);
    } else {
      // lá thuỳ: năm thuỳ toả ra từ cuống
      float r = length(q - vec2(0.0, 0.05));
      float ang = atan(q.y - 0.05, q.x);
      float lobes = 0.5 + 0.2 * pow(abs(cos(2.5 * ang + 1.5708 * 1.0)), 1.4);
      d = r - lobes;
      vein = (1.0 - smoothstep(0.02, 0.05, abs(q.x))) * step(y, 0.5) * step(-0.5, y);
    }
    a = 1.0 - smoothstep(-edge, edge, d);
    col = front ? mix(uFront, uFront2, vRand.y) : mix(uBack, uBack2, vRand.y);
    if (front) col *= 1.0 - 0.25 * vein;
  } else {
    float r = length(q);
    float ang = atan(q.y, q.x);
    float rays = pow(abs(cos(ang * 6.0)), 18.0) * (1.0 - smoothstep(0.3, 0.95, r));
    a = max(1.0 - smoothstep(0.1, 0.22, r), rays * 0.7);
    col = uSeed;
  }
  a *= vAlpha * mix(1.0, 0.85, smoothstep(0.85, 1.0, vDepth));
  // Đêm: lá và cánh hoa mờ dần (nhường chỗ cho đom đóm).
  a *= 1.0 - smoothstep(0.25, 0.7, uNight);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * uTint, a);
  #include <colorspace_fragment>
}
`

export function Leaves() {
  const dpr = useThree((s) => s.viewport.dpr)
  const height = useThree((s) => s.size.height)

  const geometry = useMemo(() => {
    const rng = mulberry32(314)
    const pos = new Float32Array(COUNT * 3)
    const seed = new Float32Array(COUNT * 4)
    const kind = new Float32Array(COUNT)
    const gust = new Float32Array(COUNT)
    const depth = new Float32Array(COUNT)
    const slot = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng()
      const gi = i - AMBIENT
      kind[i] = i < LEAVES ? LEAF_KINDS[i] : i < LEAVES + PETALS ? 1 : i < AMBIENT ? 2 : GUST_KINDS[gi % GUST_KINDS.length]
      gust[i] = i >= AMBIENT ? 1 : 0
      slot[i] = i >= AMBIENT ? gi % GUST_SLOTS : 0
      depth[i] = 0.35 + 0.65 * rng() ** 1.5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.setAttribute('aGust', new THREE.BufferAttribute(gust, 1))
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
    g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1))
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...own,
          ...leafLook,
          uTime: shared.uTime,
          uWindTime: shared.uWindTime,
          uWindStrength: shared.uWindStrength,
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthTest: false,
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

  useFrame(() => {
    own.uPixelRatio.value = dpr
    own.uScreenH.value = height
    // Bắt đầu cơn gió khi wind.gust vừa được đặt lại (nhấp chuột).
    if (wind.gust > lastGust + 0.3) own.uGustAt.value[gustCount++ % GUST_SLOTS] = shared.uTime.value
    lastGust = wind.gust
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
