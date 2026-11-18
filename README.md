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
- `?hint` — ép hiện lại gợi ý "Kéo mặt trời để đổi thời gian" (bình thường chỉ hiện đến lần tương tác đầu tiên, nhớ trong `localStorage` khoá `kz-arc-seen`).
- `?t=4.5` — mở thẳng ở một giá trị thanh trượt giờ (0 = rạng sáng … 8 = đêm khuya; số lẻ là giữa hai mốc).

## Nhạc (`src/audio`, `shared/track.ts`)

Chỉ nhận nhạc **CC0** và **CC-BY**. Giao diện hiển thị: CC0 chỉ tên bài; CC-BY thêm tên tác giả. Nguồn và license vẫn lưu để kiểm tra lại.

- `shared/track.ts` — kiểu `Track`, bảng license, quy tắc hiển thị (`displayLabel`) và bộ phân tích tên file. Không dùng DOM
  để sau này `api/` cũng import được.
- `src/audio/queue.ts` — thứ tự phát và shuffle (logic thuần, có test). `player.ts` — một `<audio>` + hàng đợi, state cho
  `useSyncExternalStore`; hết bài thì quay vòng, bài hỏng thì bỏ qua. `source.ts` — interface `MusicSource` để cắm thêm nguồn
  (R2, API ngoài…). `mediaSession.ts` — phím media và màn hình khoá.
- Thời gian phát đọc thẳng từ `player.currentTime` (bằng `requestAnimationFrame`), không nằm trong state để khỏi render 60 lần/giây.

### Giao diện trình phát (`src/ui`)

Icon trần không box; độ nổi nhờ bóng hai lớp và một lớp tối rất loãng dưới chân màn hình (nhạt mặc định, đậm khi rê chuột
vào player, đậm hơn khi mở playlist). Toàn bộ hiệu ứng nằm trong `player.css` (tiền tố `kz-`).

- `Player.tsx` ghép `ProgressBar` (đường tiến độ), `VolumeControl`, `Playlist`, `Motes` (cánh hoa ban ngày) và các nút prev / play /
  next / shuffle. Không có bài nào thì player ẩn hẳn. Phím Space bật/tắt phát; Escape hoặc bấm ra ngoài thì đóng playlist.
- `ProgressBar.tsx` đọc `player.currentTime` mỗi khung hình và ghi thẳng `transform` (không setState), nên đường chạy trượt đều.
  Kéo hoặc bấm để tua; phím ←/→ tua 5 giây.
- `TimeArc.tsx` (góc phải trên) có gợi ý cho người mới: mặt trời tự trượt nhẹ cho tới lần tương tác đầu tiên.
- Cả cụm khẽ đung đưa như trong gió; `prefers-reduced-motion` tắt hết hiệu ứng.

### Thêm nhạc khi dev

Đặt file vào `public/audio/` (không commit, bản chạy thật nằm ở R2) với tên:

```
Artist__Title__License[__nguon].ext     vd. Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3
```

- Phân cách là **hai dấu gạch dưới**, nên tên bài có gạch nối, `[ ]`, dấu nháy, tiếng Việt/Nhật đều dùng bình thường.
- License: `CC0`, `CC-BY-4.0`, `CC-BY-3.0`, `CC-BY-2.0` (CC-BY bắt buộc có phiên bản). Nguồn là tên miền, có thể bỏ.
- Tên file không được chứa `/ \ : * ? " < > |`: dùng ký tự giống hệt (`／ ： ？`). Khi dev, `#` cũng không dùng được
  (dev server không phục vụ được đường dẫn chứa `#`): thay bằng `＃`. Dấu phẩy, `&`, `;`, `'` thì dùng bình thường.
- Chạy `npm run tracks` để sinh `public/audio/tracks.json`; file sai quy tắc sẽ được báo kèm lý do.

## Nhạc trên Cloudflare R2 (`api/`)

Bản chạy thật không dùng `public/audio/`. Nhạc nằm trong **bucket R2 private**; người nghe chỉ có **URL ký (presigned) ngắn hạn**
do Vercel Functions cấp, nên không ai lấy được link cố định tới file. Đây chỉ là rào cản mềm (ai cũng ghi âm được, và DRM thật
sẽ mâu thuẫn với CC-BY).

```
trình duyệt ──GET /api/tracks──► hàm Vercel ──tracks.json──► R2 (private)
     ▲                              │ ký URL (cục bộ, không gọi mạng)
     └──── nghe trực tiếp (Range) ──┴──────────────► R2
```

- `GET /api/tracks` trả danh sách bài kèm URL ký (hạn 3 giờ), CDN của Vercel giữ **5 phút** (`s-maxage=300`) nên R2 và hàm hầu như
  không bị gọi dù đông người nghe. Player tự xin URL mới khi còn dưới 15 phút (`src/audio/sources/api.ts`), phiên nghe dài vẫn chuyển
  bài được.
- Thư viện là một file `tracks.json` trong bucket (thứ tự mảng = thứ tự phát). Không có cơ sở dữ liệu.
- `api/admin/*`: đăng nhập bằng mật khẩu (cookie phiên ký HMAC, HttpOnly + SameSite=Strict, thêm kiểm tra `Origin`), xin URL upload
  (trình duyệt upload thẳng lên R2 vì file ~5 MB vượt giới hạn body của hàm), thêm / sửa / xoá / xếp lại bài. Trang `/admin` dùng các
  endpoint này.

| Endpoint | Việc |
|---|---|
| `GET /api/tracks` | Công khai: danh sách bài + URL nghe |
| `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session` | Phiên quản trị |
| `POST /api/admin/upload-url` | `{filename, size}` → URL PUT ký sẵn (15 phút, ký cả Content-Type) |
| `GET / POST /api/admin/tracks` | Xem thư viện / ghi nhận file đã upload (kiểm tra file thật có trên R2, đúng loại, ≤ 30 MB) |
| `PATCH / DELETE /api/admin/tracks/:id` | Sửa metadata hoặc `{moveTo}` / gỡ bài và xoá file |

### Thiết lập một lần

1. **Cloudflare → R2**: tạo bucket (vd. `kazelody-audio`), **không** bật truy cập công khai. Tạo **API token** quyền *Object Read & Write*,
   chỉ cho bucket này; lấy *Account ID*, *Access Key ID*, *Secret Access Key*.
2. **CORS của bucket** (Settings → CORS policy), để trang admin upload được bằng URL ký:

   ```json
   [
     {
       "AllowedOrigins": ["https://kazelody.iamtpg.dev", "http://localhost:5173", "http://localhost:3000"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   (Phát nhạc bằng `<audio>` không cần CORS; chỉ upload từ trình duyệt mới cần. Origin của bản Preview `*.vercel.app` thêm vào khi cần
   thử upload ở đó.)
3. **Biến môi trường** trên Vercel (Production **và** Preview):

   | Biến | Ghi chú |
   |---|---|
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Từ bước 1 |
   | `ADMIN_PASSWORD` | Mật khẩu trang quản trị, ≥ 8 ký tự (nên dài hơn nhiều) |
   | `SESSION_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự, vd. `openssl rand -hex 32`. Đổi giá trị này là mọi phiên đăng nhập hết hiệu lực |
   | `PUBLIC_ORIGIN` | *Tuỳ chọn.* Bỏ trống thì so `Origin` với chính host của request (đúng cho cả Preview). Chỉ đặt khi có proxy viết lại Origin |
   | `R2_PRESIGN_TTL_SECONDS` | *Tuỳ chọn.* Hạn URL nghe (60 – 604800), mặc định 10800. Đặt ngắn (vd. 120) để thử cơ chế làm mới URL |

   Thiếu biến thì API trả `503 Dịch vụ nhạc chưa được cấu hình` (tên biến chỉ ghi vào log máy chủ).
4. **DNS**: `kazelody` CNAME → `cname.vercel-dns.com`, **DNS only** (đám mây xám), rồi thêm domain vào project Vercel.

### Đẩy nhạc đã có ở máy lên R2

Cần các biến `R2_*` trong shell (hoặc file env riêng của bạn):

```bash
npm run push-tracks -- --dry-run                        # chỉ liệt kê, không cần R2 (kiểm tra tên file)
node --env-file=.env.local tools/push-tracks.mjs         # upload thật; chạy lại không tạo bản trùng
```

Metadata đọc từ tên file như `npm run tracks`; file lên R2 với khoá `audio/<uuid>.<đuôi>` (tên gốc chỉ lưu làm metadata).

### Chạy và kiểm tra

- `npm run dev` không chạy `api/`: player rơi về `public/audio/` như cũ.
- Thử API ở máy: `vercel dev` (cần Vercel CLI và env). Thử trên mạng: push nhánh để có **Preview deployment** rồi mở
  `/api/tracks` (chưa có nhạc → `{"tracks":[],…}`; thiếu env → 503).
- Test: `npm test` (API chạy với kho lưu trữ trong bộ nhớ). Việc R2 thật có nhận URL ký hay không chỉ kiểm tra được bằng một lần
  upload thật.

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
Tổng ảnh cả ngày khoảng 4 MB, trang chỉ tải mốc đang xem trước. Nhạc để ở Cloudflare R2 (miễn phí băng thông ra), hàm trong
`api/` được Vercel tự triển khai cùng project; cần các biến môi trường ở phần "Nhạc trên Cloudflare R2".

## Tài nguyên & ghi công

- Cảnh thung lũng: [painted-valley](https://git.patch.gg/blendi/painted-valley) của blendi / Patch — code MIT,
  hình CC0 1.0 (chi tiết nguồn trong `LICENCE-NOTES.md` của repo đó).
- Skybox (cảnh 3D cũ): [FreeStylized](https://freestylized.com) (sky_47, sky_127).
- Kỹ thuật tán cây (cảnh 3D cũ) tham khảo [craftzdog/ghibli-style-shader](https://github.com/craftzdog/ghibli-style-shader) (MIT).
