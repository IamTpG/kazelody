# KazeLody

Web nghe nhạc mang không gian chữa lành, cảm hứng từ nền tranh vẽ tay của phim hoạt hình.

## Chạy

```bash
npm install
npm run dev
```

Thêm `?debug` vào URL (vd. `http://localhost:5173/?debug`) để hiện bảng FPS.

## Nền 2.5D (`src/scene2d`) — đang dùng

Ảnh màu + bản đồ độ sâu được **render sẵn một lần** trên máy dev, người dùng chỉ tải ảnh tĩnh:

| File | Nội dung |
|---|---|
| `manifest.ts` | Danh sách cảnh: ảnh theo từng giờ trong ngày, depth, màu nắng cho hạt bay |
| `depth.ts` | Đọc depth 16 bit (thang log) → bản đồ "độ parallax" 0..1 (half-float texture) |
| `ParallaxScene.tsx` | Lưới 240×135 đỉnh dịch theo độ sâu khi rê chuột; cỏ gần lay theo gió/chuột; crossfade giữa các giờ |

Mỗi pixel chỉ đọc ảnh một lần (hai lần khi đang chuyển giờ), không MSAA, không hậu kỳ → nhẹ cho GPU tích hợp.

### Xuất cảnh mới

Nguồn cảnh: [painted-valley](https://git.patch.gg/blendi/painted-valley) (code MIT, hình CC0), clone ở `../painted-valley`
với một thay đổi nhỏ trong `src/lib/frame.js` (expose `depthTexture`), rồi `npm ci --ignore-scripts && npm run build` ở đó.

```bash
node tools/capture-scene.mjs --src ../painted-valley --out captures/valley/hill-high \
  --views hill --hours 12.5,15.5,19,20.3 --size 1920x1080 --quality high
```

- Render bằng CPU (SwiftShader) để không làm treo GPU yếu: tải trang ~12–20 phút, mỗi ảnh vài phút.
- Góc máy định nghĩa trong `VIEWS` của `tools/capture-scene.mjs` (`hill`, `wide`, `valley`, `village`, `peaks`).
- Ảnh gốc nằm trong `captures/` (không commit). Chép `*.webp` và `*-depth-small.png` vào `public/scenes/<cảnh>/`
  rồi khai báo trong `src/scene2d/manifest.ts`.

## Cảnh 3D cũ (`src/scene`)

Bản dựng toàn bộ bằng shader (đồi, 60k lá cỏ, cây bông xù, sky dome). Không còn được dùng làm nền vì làm GPU tích hợp
bận 80–100%; `Motes.tsx` và `uniforms.ts` vẫn được nền 2.5D dùng lại.

## Tài nguyên & ghi công

- Cảnh thung lũng: [painted-valley](https://git.patch.gg/blendi/painted-valley) của blendi / Patch — code MIT,
  hình CC0 1.0 (chi tiết nguồn trong `LICENCE-NOTES.md` của repo đó).
- Skybox (cảnh 3D cũ): [FreeStylized](https://freestylized.com) (sky_47, sky_127).
- Kỹ thuật tán cây (cảnh 3D cũ) tham khảo [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) (MIT).
