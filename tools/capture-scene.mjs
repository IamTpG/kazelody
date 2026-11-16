// Xuất ảnh tĩnh + bản đồ độ sâu từ painted-valley (https://git.patch.gg/blendi/painted-valley, MIT / CC0)
// để làm nền 2.5D cho KazeLody. Render bằng CPU (SwiftShader): chậm nhưng không đụng GPU.
//
//   node tools/capture-scene.mjs --src ../painted-valley --out public/scenes/valley \
//     --views hill,valley --hours 12.5,15.5,19,20.3 --size 2560x1440
//   Ghi đè thông số view: --views hill:fov=90:pitch=10 (ra file hill_fov90_pitch10-...)
//
// Mỗi view × giờ ra các file:
//   <view>-<hour>.png / .webp      màu, đúng như khung hình của họ (đã có lớp nét cọ Kuwahara)
//   <view>-<hour>-depth.png        khoảng cách tới camera, thang log: t = ln(z/near)/ln(far/near),
//                                  16 bit chia hai kênh R (cao) và G (thấp). Trời = 1.
//   <view>-<hour>-depth-small.png  như trên nhưng 320 px ngang (trung bình từng ô) — bản app tải về
//   <view>-<hour>.json             camera + near/far để giải mã độ sâu
// painted-valley cần bản đã build (npm run build) và frame.depthTexture được expose trong src/lib/frame.js.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';

/** u: mét dọc thung lũng, v: mét sang phải, turn/pitch: độ, y: mắt cao hơn mặt đất (m). */
const VIEWS = {
  hill: { u: -3, v: 0, turn: -4, pitch: 4, fov: 55, y: 1.9 },
  wide: { u: -6, v: 4, turn: 8, pitch: 5, fov: 80 },
  valley: { u: 0, v: 0, turn: -4, pitch: -2, fov: 34 },
  village: { u: 430, v: -120, turn: -15, pitch: 1, fov: 30 },
  peaks: { u: 0, v: 0, turn: -6, pitch: 6, fov: 26 },
};

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const src = resolve(flag('src', '../painted-valley'));
const out = resolve(flag('out', 'public/scenes/valley'));
const views = flag('views', 'hill').split(',');
const hours = flag('hours', '15.5').split(',').map(Number);
const [width, height] = flag('size', '1920x1080').split('x').map(Number);
const quality = flag('quality', 'high');
const settle = Number(flag('settle', '6'));
const chrome = flag('chrome', process.env.CHROME ?? '/usr/bin/google-chrome');
mkdirSync(out, { recursive: true });

const root = resolve(src, 'dist');
if (!existsSync(join(root, 'index.html'))) throw new Error(`Chưa build painted-valley: ${root}`);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  let file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/?step&dpr=1&nosound&nopad&drift=0&quality=${quality}`;

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  // CPU rendering: an toàn cho máy có GPU yếu (trang này từng làm crash trình duyệt khi chạy trên GPU).
  args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`error: ${m.text().slice(0, 500)}`);
});

const t0 = Date.now();
await page.goto(`${base}&hour=${hours[0]}`);
// Chờ trang dựng xong, in tiến độ (chữ trên màn hình chờ của họ) mỗi 30 giây.
for (let waited = 0; ; waited += 30) {
  const status = await page.evaluate(() => ({ ready: !!window.__tg?.ready, text: document.getElementById('loading')?.textContent?.trim() ?? '' }));
  if (status.ready) break;
  if (waited >= 60 * 60) {
    console.log('Không sẵn sàng sau 60 phút\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log(`[${waited}s] ${status.text || '...'}`);
  await page.waitForTimeout(30_000);
}
console.log(`sẵn sàng sau ${((Date.now() - t0) / 1000).toFixed(0)}s`);

for (const spec of views) {
  // "hill" hoặc "hill:fov=90:pitch=10" — ghi đè thông số của một view có sẵn.
  const [name, ...mods] = spec.split(':');
  if (!VIEWS[name]) {
    console.log(`không có view ${name}`);
    continue;
  }
  const v = { ...VIEWS[name] };
  for (const m of mods) {
    const [k, val] = m.split('=');
    v[k] = Number(val);
  }
  const label = [name, ...mods.map((m) => m.replace('=', ''))].join('_');
  for (const hour of hours) {
    const t1 = Date.now();
    const shot = await page.evaluate(
      ({ v, hour, settle }) => {
        const tg = window.__tg;
        // Ẩn người đi bộ và đưa anh ta ra sau lưng camera để cả bóng cũng không lọt vào khung.
        tg.setThird(false);
        const [wx, wz] = tg.fromValley(v.u - 60, v.v);
        tg.standAt(wx, wz, 0);
        const [x, z] = tg.fromValley(v.u, v.v);
        const baseYaw = Math.atan2(-0.6, -0.8);
        tg.view = { x, z, y: v.y ?? 1.68, yaw: baseYaw - (v.turn * Math.PI) / 180, pitch: (v.pitch * Math.PI) / 180, fov: v.fov ?? 68 };
        tg.setHour(hour);
        for (let i = 0; i < settle; i++) tg.tick(1 / 30);
        const canvas = tg.renderer.domElement;
        const color = canvas.toDataURL('image/png');
        // Bản dùng trên web: WebP nhẹ hơn PNG nhiều lần.
        const colorWebp = canvas.toDataURL('image/webp', 0.9);

        // Độ sâu: đọc depth texture của khung vừa vẽ, đổi ra khoảng cách, mã hoá log 16 bit vào RG.
        const { THREE, renderer, camera, frame } = tg;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const rt = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: false });
        const material = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          uniforms: { tDepth: { value: frame.depthTexture }, uNear: { value: camera.near }, uFar: { value: camera.far } },
          vertexShader: 'out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: `
            precision highp float;
            in vec2 vUv;
            uniform highp sampler2D tDepth;
            uniform float uNear, uFar;
            out vec4 outColor;
            void main() {
              float d = texture(tDepth, vUv).r;
              float z = uNear * uFar / (uFar - d * (uFar - uNear));
              float t = clamp(log(z / uNear) / log(uFar / uNear), 0.0, 1.0);
              float v = floor(t * 65535.0 + 0.5);
              outColor = vec4(floor(v / 256.0) / 255.0, mod(v, 256.0) / 255.0, 0.0, 1.0);
            }`,
          depthTest: false,
          depthWrite: false,
        });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        quad.frustumCulled = false;
        const fsScene = new THREE.Scene();
        fsScene.add(quad);
        renderer.setRenderTarget(rt);
        renderer.render(fsScene, new THREE.Camera());
        renderer.setRenderTarget(null);
        const px = new Uint8Array(size.x * size.y * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, size.x, size.y, px);
        rt.dispose();
        material.dispose();
        quad.geometry.dispose();

        // Lật dọc (WebGL đọc từ dưới lên) rồi đóng gói PNG qua canvas 2D.
        const c2 = document.createElement('canvas');
        c2.width = size.x;
        c2.height = size.y;
        const ctx = c2.getContext('2d');
        const img = ctx.createImageData(size.x, size.y);
        const row = size.x * 4;
        for (let y = 0; y < size.y; y++) img.data.set(px.subarray((size.y - 1 - y) * row, (size.y - y) * row), y * row);
        ctx.putImageData(img, 0, 0);

        // Bản nhỏ cho web (SW×SH): trung bình t theo từng ô, vẫn 16 bit RG. App chỉ cần chừng này
        // vì độ sâu dùng để dịch các đỉnh của một lưới thưa, không phải từng pixel.
        const SW = 320;
        const SH = Math.round((SW * size.y) / size.x);
        const small = document.createElement('canvas');
        small.width = SW;
        small.height = SH;
        const sctx = small.getContext('2d');
        const simg = sctx.createImageData(SW, SH);
        for (let j = 0; j < SH; j++) {
          for (let i = 0; i < SW; i++) {
            const x0 = Math.floor((i * size.x) / SW);
            const x1 = Math.floor(((i + 1) * size.x) / SW);
            const y0 = Math.floor((j * size.y) / SH);
            const y1 = Math.floor(((j + 1) * size.y) / SH);
            let sum = 0;
            let n = 0;
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                const k = (y * size.x + x) * 4;
                sum += img.data[k] * 256 + img.data[k + 1];
                n++;
              }
            }
            const val = Math.round(sum / Math.max(1, n));
            const k = (j * SW + i) * 4;
            simg.data[k] = val >> 8;
            simg.data[k + 1] = val & 255;
            simg.data[k + 3] = 255;
          }
        }
        sctx.putImageData(simg, 0, 0);
        return {
          color,
          colorWebp,
          depth: c2.toDataURL('image/png'),
          depthSmall: small.toDataURL('image/png'),
          near: camera.near,
          far: camera.far,
          fov: camera.fov,
        };
      },
      { v, hour, settle },
    );
    const tag = `${label}-${String(hour).replace('.', '_')}`;
    writeFileSync(join(out, `${tag}.png`), Buffer.from(shot.color.split(',')[1], 'base64'));
    writeFileSync(join(out, `${tag}.webp`), Buffer.from(shot.colorWebp.split(',')[1], 'base64'));
    writeFileSync(join(out, `${tag}-depth.png`), Buffer.from(shot.depth.split(',')[1], 'base64'));
    writeFileSync(join(out, `${tag}-depth-small.png`), Buffer.from(shot.depthSmall.split(',')[1], 'base64'));
    writeFileSync(join(out, `${tag}.json`), JSON.stringify({ view: name, hour, ...v, near: shot.near, far: shot.far, fov: shot.fov, width, height }, null, 2));
    console.log(`đã chụp ${tag} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
  }
}
if (problems.length) console.log(problems.join('\n'));
await browser.close();
server.close();
