# KazeLody

Web nghe nhạc mang không gian chữa lành, cảm hứng từ nền tranh vẽ tay của phim hoạt hình.
Miễn phí, phi lợi nhuận, không quảng cáo.

Stack: Vite + React + TypeScript + Tailwind, React Three Fiber (three.js), `<audio>` thuần cho phát nhạc, Cloudflare R2 (nhạc), Vercel.

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
npm test           # node --test: bộ phân tích tên file, hàng đợi phát
npm run tracks     # đọc public/audio/ → public/audio/tracks.json
```

Tham số URL (chỉ để thử):

- `?debug` — hiện bảng FPS và gắn `window.__kz.player` để điều khiển thử bằng tay (`play()`, `next()`, `setShuffle(true)`…).
- `?t=4.5` — mở thẳng ở một giá trị thanh trượt giờ (0 = rạng sáng … 8 = đêm khuya; số lẻ là giữa hai mốc).

## Nhạc (`src/audio`, `shared/track.ts`)

Chỉ nhận nhạc **CC0** và **CC-BY**. Giao diện hiển thị: CC0 chỉ tên bài; CC-BY thêm tên tác giả. Nguồn và license vẫn lưu để kiểm tra lại.

- `shared/track.ts` — kiểu `Track`, bảng license, quy tắc hiển thị (`displayLabel`) và bộ phân tích tên file. Không dùng DOM
  để sau này `api/` cũng import được.
- `src/audio/queue.ts` — thứ tự phát và shuffle (logic thuần, có test). `player.ts` — một `<audio>` + hàng đợi, state cho
  `useSyncExternalStore`; hết bài thì quay vòng, bài hỏng thì bỏ qua. `source.ts` — interface `MusicSource` để cắm thêm nguồn
  (R2, API ngoài…). `mediaSession.ts` — phím media và màn hình khoá.
- Thời gian phát đọc thẳng từ `player.currentTime` (bằng `requestAnimationFrame`), không nằm trong state để khỏi render 60 lần/giây.

### Thêm nhạc khi dev

Đặt file vào `public/audio/` (không commit, bản chạy thật nằm ở R2) với tên:

```
Artist__Title__License[__nguon].ext     vd. Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3
```

- Phân cách là **hai dấu gạch dưới**, nên tên bài có gạch nối, `[ ]`, dấu nháy, tiếng Việt/Nhật đều dùng bình thường.
- License: `CC0`, `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-2.0` (CC-BY bắt buộc có phiên bản). Nguồn là tên miền, có thể bỏ.
- Tên file không được chứa `/ \ : * ? " < > |`: dùng ký tự giống hệt (`／ ： ？`).
- Chạy `npm run tracks` để sinh `public/audio/tracks.json`; file sai quy tắc sẽ được báo kèm lý do.

## Nền 2.5D (`src/scene2d`)

Cảnh được **render sẵn một lần** trên máy dev; người dùng chỉ tải ảnh tĩnh rồi GPU ghép lại thành cảnh có chiều sâu.
Không có hình học 3D lúc chạy, không MSAA, không hậu kỳ → nhẹ cho GPU tích hợp (đo trên Intel UHD GT1: GPU bận
khoảng 16% ở cảnh đêm nặng nhất, khi đang thao tác).

### Chu kỳ ngày đêm

Chín mốc giờ, thanh trượt (`src/ui/TimeArc.tsx`, vòng cung không chữ, mặt trời khuyết dần thành trăng) trộn liên tục
giữa hai mốc kề nhau. Ảnh tải theo nhu cầu: chỉ giữ mốc đang xem và vài mốc kề bên trong bộ nhớ GPU (`stops.ts`).

| Mốc | Giờ | Mốc | Giờ | Mốc | Giờ |
|---|---|---|---|---|---|
| Rạng sáng | 5:30 | Trưa | 12:30 | Hoàng hôn | 20:20 |
| Sáng sớm | 7:30 | Chiều | 15:30 | Chạng vạng | 21:15 |
| Sáng | 10:00 | Giờ vàng | 19:00 | Đêm khuya | 23:30 |

### Các lớp

Mỗi mốc gồm hai ảnh (`public/scenes/valley/hill-<giờ>-plate.webp`, `-trees.webp`) dùng chung một bản đồ độ sâu
(`hill-depth-small.png`). Tất cả đi qua cùng một lưới 240×135 đỉnh dịch theo độ sâu khi rê chuột.

| Lớp / file | Việc |
|---|---|
| nền (`plate`) | Cảnh đã bỏ cây gần và cánh quạt. Cỏ gần đung đưa theo gió, lay theo chuột; ban đêm đom đóm rọi sáng cỏ theo độ sâu |
| cánh quạt | Vẽ bằng hình học trong shader (4 cánh + gân), quay quanh trục cối xay; tốc độ `MILL_RPM` trong `ParallaxScene.tsx` |
| cây gần (`trees`) | Ảnh có alpha, lay theo gió; lộ phần nền phía sau khi lay |
| `Leaves.tsx` | Lá (4 kiểu), cánh hoa, hạt bồ công anh bay theo gió; nhấp chuột gọi một cơn gió cuốn lá từ cây bên trái |
| `Night.tsx` | Sao, đèn cửa sổ của làng (`windows.ts`), đom đóm |
| `manifest.ts` | Các mốc: giờ, ánh sáng phủ lên lá, độ tối, màu vải cánh quạt |
| `valleyData.ts` | **Sinh tự động** (`tools/build-scene-data.mjs`): vị trí và mặt phẳng quay của cối xay |
| `depth.ts` | Đọc depth 16 bit (thang log) → bản đồ "độ parallax" 0..1, làm mờ để mép cây không bị kéo giãn |

Chuyển động hạt (lá, sao, đom đóm) tính trong vertex shader từ thời gian nên không tốn CPU.
Sức gió là một giá trị đã làm mượt (`gustLevel`) để nhấp chuột không làm hình giật.

## Xuất cảnh mới

Nguồn cảnh: [painted-valley](https://git.patch.gg/blendi/painted-valley) (code MIT, hình CC0), clone ở `../painted-valley`,
cần `git lfs pull`. Bản dùng ở đây có sửa nhỏ, lưu trong `tools/painted-valley.patch`:

- `src/lib/frame.js`: expose `depthTexture` để đọc độ sâu.
- `src/valley/sky.js`: thêm bình minh, chạng vạng và ánh trăng (độ cao mặt trời âm), quỹ đạo buổi sáng và sau hoàng hôn.
- `src/valley/main.js`: nới giới hạn giờ (4:30–24:00).
- `src/valley/farwoods.js`: đặt tên `mill-sails` cho cánh quạt để tách riêng.

```bash
cd ../painted-valley && git apply ../kazelody/tools/painted-valley.patch
npm ci --ignore-scripts && npm run build

cd ../kazelody
node tools/capture-scene.mjs --src ../painted-valley --out captures/valley/day-high --views hill \
  --hours 5.5,7.5,10,12.5,15.5,19,20.3,21.25,23.5 --size 1920x1080 --quality high
node tools/build-scene-data.mjs --from captures/valley/day-high --view hill
python3 tools/find-windows.py captures/valley/day-high/hill-12_5-plate.webp   # → src/scene2d/windows.ts
```

- Render bằng CPU (SwiftShader), **không bao giờ mở painted-valley trên GPU/trình duyệt thật**: trang đó từng làm
  treo trình duyệt. Tải trang khoảng 15–30 phút, mỗi mốc vài phút (xem tiến độ in ra màn hình).
- Mỗi mốc render hai khung trong cùng một trạng thái: đầy đủ và đã ẩn cây gần + cánh quạt. Chênh lệch độ sâu giữa hai khung
  cho ra mặt nạ cây.
- Góc máy định nghĩa trong `VIEWS` của `tools/capture-scene.mjs` (`hill`, `wide`, `valley`, `village`, `peaks`); ghi đè
  bằng `--views hill:fov=90:pitch=10`. Ảnh gốc nằm trong `captures/` (không commit).
- `build-scene-data.mjs` chép ảnh vào `public/scenes/valley/` và sinh `valleyData.ts`. Sau đó cập nhật giờ, màu và độ tối
  của từng mốc trong `manifest.ts` (và `windows.ts` nếu đổi góc máy).

## Cảnh 3D cũ (`src/scene`)

Bản dựng toàn bộ bằng shader (đồi, 60k lá cỏ, cây bông xù, sky dome), từng làm GPU tích hợp bận 80–100% nên đã bỏ
(có ở commit `1237bea`). Chỉ `config.ts` (`mulberry32`) và `uniforms.ts` (`shared`, `wind`) còn được nền 2.5D dùng lại.

## Triển khai

Vercel, nối với nhánh `main`: preset Vite (`npm run build`, output `dist`), không cần cấu hình thêm.
Tổng ảnh cả ngày khoảng 4 MB, trang chỉ tải mốc đang xem trước. Nhạc để ở Cloudflare R2 (miễn phí băng thông ra).

## Tài nguyên & ghi công

- Cảnh thung lũng: [painted-valley](https://git.patch.gg/blendi/painted-valley) của blendi / Patch — code MIT,
  hình CC0 1.0 (chi tiết nguồn trong `LICENCE-NOTES.md` của repo đó).
- Skybox (cảnh 3D cũ): [FreeStylized](https://freestylized.com) (sky_47, sky_127).
- Kỹ thuật tán cây (cảnh 3D cũ) tham khảo [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) (MIT).
