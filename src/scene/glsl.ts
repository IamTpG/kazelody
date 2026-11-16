import { TREES } from './config'

/** Khai báo uniform dùng chung + hàm tiện ích (noise, bầu trời, sương, ánh sáng toon). */
export const commonGlsl = /* glsl */ `
#define KZ_PI 3.14159265359
#define KZ_TREE_COUNT ${TREES.length}

uniform float uTime;
uniform float uWindTime;
uniform float uWindStrength;
uniform vec3 uMouse;
uniform float uMouseStrength;

uniform sampler2D uSkyA;
uniform sampler2D uSkyB;
uniform float uSkyMix;
uniform float uSkyOffsetA;
uniform float uSkyOffsetB;
uniform float uFogDensity;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform vec3 uMeadowDark;
uniform vec3 uMeadowBase;
uniform vec3 uMeadowLight;
uniform vec3 uLeafColors[4];
uniform vec3 uTrunkColor;
uniform vec3 uHillNear;
uniform vec3 uHillFar;
uniform vec4 uTreeShadows[KZ_TREE_COUNT];

float kzHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float kzNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(kzHash(i), kzHash(i + vec2(1.0, 0.0)), u.x),
    mix(kzHash(i + vec2(0.0, 1.0)), kzHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec2 kzEquirectUv(vec3 d, float offset) {
  d = normalize(d);
  float u = atan(d.z, d.x) / (2.0 * KZ_PI) + 0.5 + offset;
  float v = asin(clamp(d.y, -1.0, 1.0)) / KZ_PI + 0.5;
  return vec2(fract(u), v);
}

vec3 kzSampleSky(vec3 d) {
  vec3 a = texture2D(uSkyA, kzEquirectUv(d, uSkyOffsetA)).rgb;
  vec3 b = texture2D(uSkyB, kzEquirectUv(d, uSkyOffsetB)).rgb;
  return mix(a, b, uSkyMix);
}

/**
 * Màu chân trời theo hướng nhìn — sương lấy màu từ chính bầu trời nên hoà liền mạch.
 * Lấy mẫu hơi dưới đường chân trời: ngay tại đó ảnh có dải mây nhỏ gây sọc.
 */
vec3 kzHorizon(vec3 viewDir) {
  vec2 h = normalize(viewDir.xz + vec2(1e-5));
  return kzSampleSky(vec3(h.x * 0.995, -0.07, h.y * 0.995));
}

/**
 * Hệ số sương (0..1) theo khoảng cách. Các shader tính sương ở vertex
 * (vFogColor = kzHorizon(...), vFog = kzFogFactor(...)) để fragment chỉ còn một phép mix.
 */
float kzFogFactor(vec3 worldPos, float density) {
  float dist = length(worldPos - cameraPosition);
  return clamp(1.0 - exp(-pow(dist * density, 1.6)), 0.0, 1.0);
}

/** Màu đồng cỏ từ trọng số tính sẵn trên CPU (xem meadowWeights trong config.ts). */
vec3 kzMeadow(vec2 w) {
  return mix(mix(uMeadowDark, uMeadowBase, w.x), uMeadowLight, w.y);
}

/** Màu ánh sáng toon (nhân với albedo). Tách riêng để tính được ở vertex shader. */
vec3 kzToonLight(vec3 n, float shadow) {
  float ndl = dot(normalize(n), uSunDir);
  float b = smoothstep(-0.04, 0.04, ndl) * 0.55 + smoothstep(0.32, 0.4, ndl) * 0.45;
  b *= 1.0 - shadow * 0.85;
  return mix(uShadowTint, uSunColor, b);
}

/** Bóng đổ giả của tán cây chiếu xuống mặt đất (0 = không bóng, 1 = trong bóng). */
float kzTreeShadow(vec2 xz) {
  float s = 0.0;
  vec2 sunXZ = uSunDir.xz / max(uSunDir.y, 0.25);
  for (int i = 0; i < KZ_TREE_COUNT; i++) {
    vec4 t = uTreeShadows[i];
    vec2 c = t.xy - sunXZ * t.w;
    vec2 d = (xz - c) / vec2(1.0, 0.8);
    float edge = (kzNoise(xz * 1.3) - 0.5) * 0.9;
    s = max(s, 1.0 - smoothstep(t.z * 0.62, t.z, length(d) + edge));
  }
  return s;
}

`

export const outputGlsl = /* glsl */ `
#include <colorspace_fragment>
`
