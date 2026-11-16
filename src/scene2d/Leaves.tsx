import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../scene/config'
import { shared, wind } from '../scene/uniforms'
import { leafLook } from './leafLook'

/*
 * Lá, cánh hoa, hạt bồ công anh bay theo gió — vẽ bằng shader (không cần ảnh), nét phẳng như tranh nền.
 * - Lá: hình hạt hạnh nhân có gân giữa; lật quanh trục dọc nên lúc thấy mặt, lúc thấy cạnh,
 *   mặt trên đậm / mặt dưới nhạt.
 * - Bay theo hướng gió, rơi chậm, đung đưa zigzag; gần to và hơi nhoè, xa nhỏ và sắc.
 * - Nhấp chuột: một cơn gió cuốn một nắm lá từ phía cây bên trái bay vút qua màn hình.
 * Toàn bộ chuyển động tính trong vertex shader từ thời gian → không tốn CPU.
 */

const LEAVES = 10
const PETALS = 8
const SEEDS = 4
const GUST = 24
const AMBIENT = LEAVES + PETALS + SEEDS
const COUNT = AMBIENT + GUST


const own = {
  uGustAt: { value: -100 },
  uPixelRatio: { value: 1 },
  uScreenH: { value: 900 },
  // Bảng màu lấy theo tranh nền (lá cây lớn, hoa dại trong cỏ); ánh sáng theo giờ nhân thêm uTint.
  uFront: { value: new THREE.Color('#4b7a3d') },
  uBack: { value: new THREE.Color('#a3c46f') },
  uPetals: { value: [new THREE.Color('#f6f2e4'), new THREE.Color('#f3d46c'), new THREE.Color('#cdb9e6')] },
  uSeed: { value: new THREE.Color('#fbfaf3') },
}

let lastGust = 0

const vertex = /* glsl */ `
uniform float uTime;
uniform float uWindTime;
uniform float uWindStrength;
uniform float uGustAt;
uniform float uPixelRatio;
uniform float uScreenH;
uniform vec2 uOffset;
attribute vec4 aSeed;
attribute float aKind;   // 0 lá, 1 cánh hoa, 2 hạt bồ công anh
attribute float aGust;   // 1 = chỉ bay khi có cơn gió
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
    float fall = (0.012 + 0.02 * aSeed.z) * (aKind > 1.5 ? 0.3 : 1.0);
    float y = fract(aSeed.w - t * fall / 2.4) * 2.4 - 1.2;
    float zig = sin(t * (0.9 + aSeed.x) + aSeed.y * 30.0) * 0.03 * z;
    p = vec2(x + zig * 0.5, y + zig);
    alpha = smoothstep(-1.3, -1.1, x) * (1.0 - smoothstep(1.1, 1.3, x))
          * smoothstep(-1.2, -1.0, y) * (1.0 - smoothstep(1.0, 1.2, y));
  } else {
    // Cơn gió: từ tán cây bên trái vút lên theo đường cong rồi bay sang phải.
    float g = (t - uGustAt) * (0.32 + 0.22 * aSeed.x) - aSeed.y * 0.35;
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

  float spin = (aSeed.x - 0.5) * 3.0 * (0.6 + 0.4 * uWindStrength);
  vAngle = aSeed.y * 6.2831 + t * spin;
  vFlip = cos(t * (1.2 + 2.0 * aSeed.z) * (aKind > 0.5 ? 0.6 : 1.0) + aSeed.w * 6.2831);
  vKind = aKind;
  vDepth = z;
  vAlpha = alpha;
  vRand = aSeed.xz;
  float px = aKind < 0.5 ? (12.0 + 26.0 * z) : aKind < 1.5 ? (6.0 + 10.0 * z) : (9.0 + 9.0 * z);
  gl_PointSize = px * uPixelRatio * (uScreenH / 900.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uFront;
uniform vec3 uBack;
uniform vec3 uPetals[3];
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
    col = front ? uFront : uBack;
    // gân giữa (chỉ ở mặt trên)
    if (front) col *= 1.0 - 0.3 * (1.0 - smoothstep(0.02, 0.07, abs(q.x))) * step(abs(y), 0.8);
  } else if (vKind < 1.5) {
    float d = length(q * vec2(1.0, 0.8) + vec2(0.0, 0.15)) - 0.6;
    a = 1.0 - smoothstep(-edge, edge, d);
    col = vRand.x < 0.45 ? uPetals[0] : vRand.x < 0.8 ? uPetals[1] : uPetals[2];
    col *= vFlip > 0.0 ? 1.0 : 0.85;
  } else {
    float r = length(q);
    float ang = atan(q.y, q.x);
    float rays = pow(abs(cos(ang * 6.0)), 18.0) * (1.0 - smoothstep(0.3, 0.95, r));
    a = max(1.0 - smoothstep(0.1, 0.22, r), rays * 0.7);
    col = uSeed;
  }
  a *= vAlpha * mix(1.0, 0.85, smoothstep(0.85, 1.0, vDepth));
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
    for (let i = 0; i < COUNT; i++) {
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng()
      kind[i] = i < LEAVES ? 0 : i < LEAVES + PETALS ? 1 : i < AMBIENT ? 2 : 0
      gust[i] = i >= AMBIENT ? 1 : 0
      depth[i] = 0.35 + 0.65 * rng() ** 1.5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.setAttribute('aGust', new THREE.BufferAttribute(gust, 1))
    g.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
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
    if (wind.gust > lastGust + 0.3) own.uGustAt.value = shared.uTime.value
    lastGust = wind.gust
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
