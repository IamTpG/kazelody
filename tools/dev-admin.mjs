// Môi trường thử trang quản trị và nhạc trên R2 KHÔNG cần Cloudflare.
//
//   npm run dev:admin               # rồi mở http://localhost:5173/admin
//   npm run dev:admin -- --seed     # nạp sẵn nhạc trong public/audio/ vào thư viện
//
// Chạy hai thứ trong một lệnh:
//   1. Một máy chủ HTTP nhỏ (cổng 8787) chạy ĐÚNG các handler đang dùng thật (api/_lib/handlers.ts) với kho lưu trữ trong bộ nhớ,
//      kèm một "R2 giả" ở /__r2/<khoá>: PUT lưu file, GET/HEAD hỗ trợ Range nên nghe được bài vừa tải lên.
//      PUT sai Content-Type so với URL ký thì bị từ chối (403), mô phỏng việc R2 từ chối chữ ký.
//   2. Vite dev server có proxy /api và /__r2 về máy chủ trên, nên cùng origin, không cần CORS.
//
// Dữ liệu nằm trong bộ nhớ, tắt là mất. Đây là công cụ phát triển: KHÔNG thay thế việc thử R2 thật (CORS, chữ ký thật).
//
// Biến môi trường tuỳ chọn: DEV_ADMIN_PASSWORD (mặc định kazelody-dev), PORT (Vite, mặc định 5173),
// DEV_API_PORT (mặc định 8787), R2_PRESIGN_TTL_SECONDS (đặt ngắn để thử cơ chế làm mới URL).
import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createAdminHandlers, createTracksHandler } from '../api/_lib/handlers.ts';
import { MemoryStorage } from '../api/_lib/memory-storage.ts';
import { pushTracks } from '../api/_lib/push.ts';
import { parseTrackKey } from '../shared/library.ts';
import { AUDIO_EXTENSIONS } from '../shared/track.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.PORT ?? 5173);
const API_PORT = Number(process.env.DEV_API_PORT ?? 8787);
const PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? 'kazelody-dev';
const ORIGIN = `http://localhost:${VITE_PORT}`;

const storage = new MemoryStorage({ baseUrl: `${ORIGIN}/__r2` });
const deps = {
  storage,
  presignTtl: Number(process.env.R2_PRESIGN_TTL_SECONDS) || 3 * 60 * 60,
  now: () => new Date(),
  adminPassword: PASSWORD,
  sessionSecret: randomUUID() + randomUUID(),
  randomId: () => randomUUID(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
const admin = createAdminHandlers(deps);
const publicTracks = createTracksHandler(deps);

const routes = {
  'GET /api/tracks': publicTracks,
  'POST /api/admin/login': admin.login,
  'POST /api/admin/logout': admin.logout,
  'GET /api/admin/session': admin.session,
  'POST /api/admin/upload-url': admin.uploadUrl,
  'GET /api/admin/tracks': admin.list,
  'POST /api/admin/tracks': admin.add,
};

function route(method, path) {
  const exact = routes[`${method} ${path}`];
  if (exact) return exact;
  if (/^\/api\/admin\/tracks\/[^/]+$/.test(path)) {
    if (method === 'PATCH') return admin.patch;
    if (method === 'DELETE') return admin.remove;
  }
  return null;
}

function toRequest(req, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, { method: req.method, headers, ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
}

async function send(res, response) {
  const headers = {};
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value;
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers['set-cookie'] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function plain(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/** "R2 giả": nhận PUT từ trình duyệt và phục vụ GET/HEAD (có Range) cho thẻ <audio>. */
async function fakeR2(req, res, url) {
  const key = decodeURIComponent(url.pathname.slice('/__r2/'.length));
  const op = url.searchParams.get('op');

  if (req.method === 'PUT') {
    if (op !== 'put' || !parseTrackKey(key)) return plain(res, 403, 'AccessDenied: URL không hợp lệ');
    const expected = url.searchParams.get('type');
    const type = req.headers['content-type'];
    if (expected && type !== expected) {
      return plain(res, 403, `SignatureDoesNotMatch: Content-Type "${type}" khác "${expected}" đã ký trong URL`);
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await storage.put(key, new Uint8Array(Buffer.concat(chunks)), type ?? 'application/octet-stream');
    res.writeHead(200, { etag: '"dev"' });
    return res.end();
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && op === 'get') {
    const object = storage.getObject(key);
    if (!object?.body) return plain(res, 404, 'NoSuchKey');
    const size = object.body.byteLength;
    let start = 0;
    let end = size - 1;
    let status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      if (range[1] === '') start = Math.max(0, size - Number(range[2]));
      else {
        start = Number(range[1]);
        if (range[2] !== '') end = Math.min(end, Number(range[2]));
      }
      if (start > end || start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        return res.end();
      }
      status = 206;
    }
    const headers = { 'content-type': object.contentType, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store' };
    if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(status, headers);
    return res.end(req.method === 'HEAD' ? undefined : Buffer.from(object.body.subarray(start, end + 1)));
  }
  plain(res, 405, 'MethodNotAllowed');
}

const api = createHttpServer(async (req, res) => {
  try {
    // Dựng URL từ origin của Vite (không tin header Host sau khi đi qua proxy), để kiểm tra Origin của handler thật khớp trình duyệt.
    const url = new URL(req.url, ORIGIN);
    if (url.pathname.startsWith('/__r2/')) return await fakeR2(req, res, url);
    const handler = route(req.method, url.pathname);
    if (!handler) return plain(res, 404, 'Không có endpoint này trong dev-admin');
    await send(res, await handler(toRequest(req, url)));
  } catch (error) {
    console.error('[dev-admin]', error);
    if (!res.headersSent) plain(res, 500, 'Lỗi trong dev-admin');
    else res.end();
  }
});
await new Promise((resolve) => api.listen(API_PORT, '127.0.0.1', resolve));

if (process.argv.includes('--seed')) {
  const dir = join(root, 'public', 'audio');
  const names = (await readdir(dir).catch(() => []))
    .filter((name) => AUDIO_EXTENSIONS.includes(extname(name).slice(1).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const files = await Promise.all(
    names.map(async (name) => ({
      name,
      size: (await stat(join(dir, name))).size,
      read: async () => new Uint8Array(await readFile(join(dir, name))),
    })),
  );
  const report = await pushTracks({ storage, files });
  console.log(`Nạp sẵn ${report.uploaded.length} bài từ public/audio/` + (report.errors.length ? `, ${report.errors.length} file lỗi tên: ${report.errors.map((e) => e.name).join(', ')}` : ''));
}

const { createServer } = await import('vite');
const target = `http://127.0.0.1:${API_PORT}`;
const vite = await createServer({
  root,
  server: { port: VITE_PORT, strictPort: true, proxy: { '/api': target, '/__r2': target } },
});
await vite.listen();
vite.printUrls();
console.log(`\n  Trang quản trị: ${ORIGIN}/admin`);
console.log(`  Mật khẩu:       ${PASSWORD}`);
console.log('  (R2 giả trong bộ nhớ: tắt là mất dữ liệu)\n');

const stop = async () => {
  await vite.close();
  api.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
