# KazeLody

Web nghe nhạc mang không gian chữa lành, cảm hứng từ nền tranh Studio Ghibli.

## Chạy

```bash
npm install
npm run dev
```

## Cảnh 3D (`src/scene`)

Toàn bộ cảnh dựng bằng shader, không cần model hay Blender:

| File | Nội dung |
|---|---|
| `config.ts` | Preset bầu trời + bảng màu, vị trí cây, camera, hàm độ cao địa hình |
| `uniforms.ts` | Uniform dùng chung cho mọi shader (gió, chuột, màu, bầu trời) |
| `glsl.ts` | Noise, lấy mẫu bầu trời equirect, sương theo màu chân trời, ánh sáng toon |
| `SkyDome.tsx` | Bầu trời + crossfade giữa 2 ảnh |
| `Terrain.tsx` / `Grass.tsx` | Đồi + 60k lá cỏ instanced (25k trên thiết bị cảm ứng), gió, chuột đẩy cỏ |
| `FluffyTree.tsx` | Cây bông xù: thẻ lá billboard + toon 4 dải màu |
| `FarHills.tsx` | Núi xa chìm trong sương |
| `Motes.tsx` | Hạt phấn trôi theo gió |
| `Experience.tsx` | Ghép cảnh, chuyển trời, parallax camera |

## Hiệu năng

- Thêm `?debug` vào URL (vd. `http://localhost:5173/?debug`) để hiện bảng FPS.
- Màu đồng cỏ tính sẵn trên CPU (`meadowWeights`); ánh sáng, bóng cây, sương tính ở vertex shader → fragment shader của cỏ/đất chỉ còn vài phép nhân (cỏ chồng nhiều lớp nên đây là chỗ tốn nhất).
- Không dùng post-processing; vignette làm bằng CSS. Độ phân giải tự giảm khi FPS thấp (`PerformanceMonitor` trong `App.tsx`).

Thêm bầu trời mới: đặt ảnh equirect vào `public/skies/` và thêm một preset vào `SKIES` trong `config.ts`.

## Tài nguyên

- Skybox: [FreeStylized](https://freestylized.com) (sky_47, sky_127) — miễn phí, không bắt buộc ghi công.
- Kỹ thuật tán cây tham khảo [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) (MIT) và bài "Creating fluffy trees with Three.js" (douges.dev).
