// Đẩy nhạc trong public/audio/ lên Cloudflare R2 và thêm vào thư viện (tracks.json trong bucket).
//
//   node --env-file=.env.local tools/push-tracks.mjs [--dry-run] [--dir public/audio]
//   npm run push-tracks -- --dry-run
//
// Cần các biến môi trường R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (xem README). Tên file theo quy tắc
// Artist__Title__License[__nguon].ext như npm run tracks. Chạy lại không tạo bản trùng. `--dry-run` chỉ liệt kê, không upload;
// nếu chưa có biến môi trường thì chỉ kiểm tra tên file.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadR2Config } from '../api/_lib/env.ts';
import { pushTracks } from '../api/_lib/push.ts';
import { createR2Storage } from '../api/_lib/r2.ts';
import { AUDIO_EXTENSIONS } from '../shared/track.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirIndex = args.indexOf('--dir');
const dir = resolve(root, dirIndex >= 0 ? args[dirIndex + 1] : 'public/audio');

let storage = null;
try {
  storage = createR2Storage(loadR2Config(process.env));
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  if (!dryRun) {
    console.error(`${error.message}\nĐặt các biến này trong shell hoặc dùng: node --env-file=.env.local tools/push-tracks.mjs`);
    process.exit(1);
  }
  console.log('(Chưa có thông tin R2: dry-run chỉ kiểm tra tên file, không biết bài nào đã có trên R2.)\n');
}

const names = (await readdir(dir))
  .filter((name) => AUDIO_EXTENSIONS.includes(extname(name).slice(1).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, 'vi'));
const files = await Promise.all(
  names.map(async (name) => ({
    name,
    size: (await stat(join(dir, name))).size,
    read: async () => new Uint8Array(await readFile(join(dir, name))),
  })),
);

if (files.length === 0) {
  console.log(`Không có file nhạc nào trong ${dir}`);
  process.exit(0);
}

const report = await pushTracks({ storage, files, dryRun });

for (const track of report.uploaded) console.log(`↑ ${track.originalFilename}  (${(track.size / 1024 / 1024).toFixed(1)} MB)`);
for (const name of report.wouldUpload) console.log(`→ sẽ upload: ${name}`);
for (const name of report.skipped) console.log(`= đã có: ${name}`);
for (const { name, error } of report.errors) console.error(`✗ ${name}\n    ${error}`);

console.log(
  `\n${dryRun ? '[dry-run] ' : ''}Upload ${report.uploaded.length}, sẽ upload ${report.wouldUpload.length}, đã có ${report.skipped.length}, lỗi ${report.errors.length} / ${files.length} file`,
);
if (report.errors.length > 0) process.exitCode = 1;
