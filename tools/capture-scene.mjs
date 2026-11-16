// Xuất ảnh tĩnh + bản đồ độ sâu từ painted-valley (https://git.patch.gg/blendi/painted-valley, MIT / CC0)
// để làm nền 2.5D cho KazeLody. Render bằng CPU (SwiftShader): chậm nhưng không đụng GPU.
//
//   node tools/capture-scene.mjs --src ../painted-valley --out public/scenes/valley \
//     --views hill,valley --hours 12.5,15.5,19,20.3 --size 2560x1440
//   Ghi đè thông số view: --views hill:fov=90:pitch=10 (ra file hill_fov90_pitch10-...)
//
// Mỗi view × giờ ra các file:
//   <view>-<hour>.png              màu đầy đủ, đúng như khung hình của họ (đã có lớp nét cọ Kuwahara)
//   <view>-<hour>-plate.webp       khung nền: đã ẩn cây gần và cánh quạt cối xay (cùng trạng thái)
//   <view>-<hour>-trees.webp       cây gần, có alpha (mặt nạ từ chênh lệch độ sâu giữa khung đầy đủ và khung nền)
//   <view>-<hour>-sails.webp       cánh quạt đã cắt, có alpha; JSON ghi vị trí trục + trục mặt phẳng quay
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
        const { THREE, renderer, camera, frame } = tg;
        const canvas = renderer.domElement;
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const W = size.x;
        const H = size.y;
        const N = W * H;

        // --- đọc độ sâu của khung vừa vẽ: t log 16 bit (Uint16Array, hàng trên cùng trước)
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
        const readDepth = () => {
          const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
          renderer.setRenderTarget(rt);
          renderer.render(fsScene, new THREE.Camera());
          renderer.setRenderTarget(null);
          const px = new Uint8Array(N * 4);
          renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
          rt.dispose();
          const t = new Uint16Array(N);
          for (let y = 0; y < H; y++) {
            const src = (H - 1 - y) * W * 4;
            for (let i = 0; i < W; i++) t[y * W + i] = px[src + i * 4] * 256 + px[src + i * 4 + 1];
          }
          return t;
        };
        const c2 = document.createElement('canvas');
        c2.width = W;
        c2.height = H;
        const ctx = c2.getContext('2d', { willReadFrequently: true });
        const readColor = () => {
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(canvas, 0, 0);
          return ctx.getImageData(0, 0, W, H);
        };
        const toUrl = (img, type, q) => {
          ctx.putImageData(img, 0, 0);
          return c2.toDataURL(type, q);
        };

        // 1) khung đầy đủ
        const color = canvas.toDataURL('image/png');
        const fullImg = readColor();
        const tFull = readDepth();

        // Cối xay gió: vị trí trục + hai trục mặt phẳng quay chiếu lên màn hình (px trên một đơn vị cục bộ)
        let mill = null;
        let sails = null;
        tg.farWoods.group.traverse((o) => {
          if (o.name === 'mill-sails') sails = o;
        });
        if (sails) {
          sails.updateWorldMatrix(true, false);
          camera.updateMatrixWorld();
          const hub = new THREE.Vector3().setFromMatrixPosition(sails.matrixWorld);
          const proj = (p) => {
            const q = p.clone().project(camera);
            return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H, q.z];
          };
          const h = proj(hub);
          const inFront = hub.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
          const ex = new THREE.Vector3(1, 0, 0).transformDirection(sails.matrixWorld).multiplyScalar(sails.scale.x);
          const ey = new THREE.Vector3(0, 1, 0).transformDirection(sails.matrixWorld).multiplyScalar(sails.scale.x);
          const px = proj(hub.clone().add(ex));
          const py = proj(hub.clone().add(ey));
          const dist = hub.distanceTo(camera.position);
          const tHub = Math.log(dist / camera.near) / Math.log(camera.far / camera.near);
          mill = { inFront, hub: [h[0], h[1]], ax: [px[0] - h[0], px[1] - h[1]], ay: [py[0] - h[0], py[1] - h[1]], length: 9, tHub, dist };
        }

        // 2) khung nền: ẩn cây gần và cánh quạt, đúng cùng trạng thái (tick(0) không đổi gì)
        const wasTrees = tg.trees.group.visible;
        tg.trees.group.visible = false;
        if (sails) sails.visible = false;
        tg.tick(0);
        const plate = canvas.toDataURL('image/webp', 0.9);
        const tPlate = readDepth();
        tg.trees.group.visible = wasTrees;
        if (sails) sails.visible = true;

        // Bản nhỏ cho web: trung bình t theo ô 320 px, 16 bit RG (từ khung đầy đủ).
        const SW = 320;
        const SH = Math.round((SW * H) / W);
        const small = document.createElement('canvas');
        small.width = SW;
        small.height = SH;
        const sctx = small.getContext('2d');
        const simg = sctx.createImageData(SW, SH);
        for (let j = 0; j < SH; j++) {
          for (let i = 0; i < SW; i++) {
            const x0 = Math.floor((i * W) / SW);
            const x1 = Math.floor(((i + 1) * W) / SW);
            const y0 = Math.floor((j * H) / SH);
            const y1 = Math.floor(((j + 1) * H) / SH);
            let sum = 0;
            let n = 0;
            for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) (sum += tFull[yy * W + xx]), n++;
            const val = Math.round(sum / Math.max(1, n));
            const k = (j * SW + i) * 4;
            simg.data[k] = val >> 8;
            simg.data[k + 1] = val & 255;
            simg.data[k + 3] = 255;
          }
        }
        sctx.putImageData(simg, 0, 0);

        // 3) mặt nạ = chỗ độ sâu khác nhau giữa khung đầy đủ và khung nền
        const THRESH = 24;
        const diff = new Uint8Array(N);
        for (let i = 0; i < N; i++) diff[i] = Math.abs(tFull[i] - tPlate[i]) > THRESH ? 1 : 0;
        const treeM = new Uint8Array(N);
        const sailM = new Uint8Array(N);
        const R = mill && mill.inFront ? Math.hypot(...mill.ax) * mill.length * 1.15 : 0;
        const hubT = mill ? (mill.tHub * 65535) | 0 : 0;
        for (let y = 0; y < H; y++) {
          for (let xx = 0; xx < W; xx++) {
            const i = y * W + xx;
            if (!diff[i]) continue;
            const inDisc = R > 0 && Math.hypot(xx - mill.hub[0], y - mill.hub[1]) < R && Math.abs(tFull[i] - hubT) < 900;
            (inDisc ? sailM : treeM)[i] = 1;
          }
        }
        // nở 2 px rồi làm mềm viền → alpha 0..255
        const soften = (m) => {
          let a = Float32Array.from(m);
          for (let pass = 0; pass < 2; pass++) {
            const b = new Float32Array(N);
            for (let y = 0; y < H; y++) {
              for (let xx = 0; xx < W; xx++) {
                let mx = 0;
                for (let dy = -1; dy <= 1; dy++) {
                  const yy = y + dy;
                  if (yy < 0 || yy >= H) continue;
                  for (let dx = -1; dx <= 1; dx++) {
                    const x2 = xx + dx;
                    if (x2 >= 0 && x2 < W && a[yy * W + x2] > mx) mx = a[yy * W + x2];
                  }
                }
                b[y * W + xx] = mx;
              }
            }
            a = b;
          }
          // box blur 3x3
          const b = new Float32Array(N);
          for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[(y + dy) * W + xx + dx];
            b[y * W + xx] = s / 9;
          }
          return b;
        };
        const treeA = soften(treeM);
        const sailA = sails ? soften(sailM) : null;

        const layer = (alpha, box) => {
          const [bx0, by0, bx1, by1] = box;
          const w = bx1 - bx0;
          const h = by1 - by0;
          const out = new ImageData(w, h);
          for (let y = 0; y < h; y++) {
            for (let xx = 0; xx < w; xx++) {
              const s = (y + by0) * W + xx + bx0;
              const o = (y * w + xx) * 4;
              out.data[o] = fullImg.data[s * 4];
              out.data[o + 1] = fullImg.data[s * 4 + 1];
              out.data[o + 2] = fullImg.data[s * 4 + 2];
              out.data[o + 3] = Math.round(Math.min(1, alpha[s]) * 255);
            }
          }
          const cc = document.createElement('canvas');
          cc.width = w;
          cc.height = h;
          cc.getContext('2d').putImageData(out, 0, 0);
          return cc.toDataURL('image/webp', 0.9);
        };
        const trees = layer(treeA, [0, 0, W, H]);
        let sailsOut = null;
        let sailBox = null;
        if (sails) {
          let x0 = W, y0 = H, x1 = 0, y1 = 0;
          for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (sailM[y * W + xx]) {
            if (xx < x0) x0 = xx;
            if (xx > x1) x1 = xx;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
          if (x1 > x0) {
            sailBox = [Math.max(0, x0 - 6), Math.max(0, y0 - 6), Math.min(W, x1 + 7), Math.min(H, y1 + 7)];
            sailsOut = layer(sailA, sailBox);
          }
        }
        material.dispose();
        quad.geometry.dispose();
        return {
          color,
          plate,
          trees,
          sails: sailsOut,
          sailBox,
          mill,
          coverage: { trees: treeM.reduce((a, b) => a + b, 0) / N, sails: sailM.reduce((a, b) => a + b, 0) / N },
          depthSmall: small.toDataURL('image/png'),
          near: camera.near,
          far: camera.far,
          fov: camera.fov,
        };
      },
      { v, hour, settle },
    );
    const tag = `${label}-${String(hour).replace('.', '_')}`;
    const save = (name, url) => url && writeFileSync(join(out, name), Buffer.from(url.split(',')[1], 'base64'));
    save(`${tag}.png`, shot.color);
    save(`${tag}-plate.webp`, shot.plate);
    save(`${tag}-trees.webp`, shot.trees);
    save(`${tag}-sails.webp`, shot.sails);
    save(`${tag}-depth-small.png`, shot.depthSmall);
    writeFileSync(join(out, `${tag}.json`), JSON.stringify({ view: name, hour, ...v, near: shot.near, far: shot.far, fov: shot.fov, width, height, mill: shot.mill, sailBox: shot.sailBox, coverage: shot.coverage }, null, 2));
    console.log(`đã chụp ${tag} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
  }
}
if (problems.length) console.log(problems.join('\n'));
await browser.close();
server.close();
