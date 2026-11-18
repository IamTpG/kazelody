// Quét public/audio/, đọc metadata từ tên file (Artist__Title__License[__nguon].ext) rồi ghi public/audio/tracks.json.
//
//   npm run tracks
//
// Quy tắc nằm ở shared/track.ts (dùng chung với app và trang admin sau này), script này chỉ gọi lại.
// File sai quy tắc bị báo rõ lý do; các file đúng vẫn được ghi, nhưng script thoát với mã lỗi.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_EXTENSIONS, parseTrackFilename, trackId } from '../shared/track.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'audio');
await mkdir(dir, { recursive: true });

const files = (await readdir(dir))
  .filter((name) => AUDIO_EXTENSIONS.includes(extname(name).slice(1).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, 'vi'));

const tracks = [];
const errors = [];
const seen = new Map();
for (const filename of files) {
  // `#` và `?` không biểu diễn được trong đường dẫn URL của file tĩnh (bản chạy thật dùng khoá UUID nên không vướng).
  if (/[#?]/.test(filename)) {
    errors.push(`✗ ${filename}\n    tên chứa "#" hoặc "?": dev server không phục vụ được, hãy thay bằng "＃" hoặc "？" (ký tự toàn chiều rộng)`);
    continue;
  }
  const parsed = parseTrackFilename(filename);
  if (!parsed.ok) {
    errors.push(`✗ ${filename}\n    ${parsed.error}`);
    continue;
  }
  const id = trackId(filename);
  if (seen.has(id)) {
    errors.push(`✗ ${filename}\n    trùng id với ${seen.get(id)}`);
    continue;
  }
  seen.set(id, filename);
  const { title, artist, license, sourceDomain } = parsed.value;
  tracks.push({ id, filename, title, artist, license, ...(sourceDomain ? { sourceDomain } : {}) });
}

await writeFile(join(dir, 'tracks.json'), JSON.stringify({ version: 1, tracks }, null, 2) + '\n');

for (const track of tracks) console.log(`✓ ${track.artist} — ${track.title}  [${track.license}${track.sourceDomain ? ', ' + track.sourceDomain : ''}]`);
if (files.length === 0) console.log(`Chưa có file nhạc nào trong ${dir}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} file không hợp lệ (tên cần dạng Artist__Title__License[__nguon].ext):\n${errors.join('\n')}`);
  process.exitCode = 1;
}
console.log(`\nGhi ${tracks.length}/${files.length} bài vào public/audio/tracks.json`);
