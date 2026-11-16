// Gom kết quả của capture-scene.mjs thành dữ liệu cho app: chép ảnh vào public/scenes/<id> và sinh
// src/scene2d/valleyData.ts (vị trí cối xay, khung cắt cánh quạt của từng mốc giờ).
//   node tools/build-scene-data.mjs --from captures/valley/day-high --view hill [--scale 1] [--depth-hour 15_5]
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const from = resolve(flag('from', 'captures/valley/day-high'));
const view = flag('view', 'hill');
const scale = Number(flag('scale', '1'));
const depthHour = flag('depth-hour', '15_5');
const dest = resolve('public/scenes/valley');
mkdirSync(dest, { recursive: true });

const stops = readdirSync(from)
  .filter((f) => f.startsWith(`${view}-`) && f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(from, f), 'utf8')))
  .sort((a, b) => a.hour - b.hour);
if (!stops.length) throw new Error(`Không có JSON của view ${view} trong ${from}`);

const tagOf = (h) => `${view}-${String(h).replace('.', '_')}`;
const rows = stops.map((s) => {
  const tag = tagOf(s.hour);
  for (const suffix of ['plate.webp', 'trees.webp', 'sails.webp']) {
    try {
      copyFileSync(join(from, `${tag}-${suffix}`), join(dest, `${tag}-${suffix}`));
    } catch {
      if (suffix !== 'sails.webp') throw new Error(`thiếu ${tag}-${suffix}`);
    }
  }
  const k = scale;
  return {
    hour: s.hour,
    tag,
    sailBox: s.sailBox ? s.sailBox.map((v) => Math.round(v * k)) : null,
    mill: s.mill && s.mill.inFront ? { hub: s.mill.hub.map((v) => +(v * k).toFixed(2)), ax: s.mill.ax.map((v) => +(v * k).toFixed(3)), ay: s.mill.ay.map((v) => +(v * k).toFixed(3)), length: s.mill.length } : null,
  };
});
copyFileSync(join(from, `${view}-${depthHour}-depth-small.png`), join(dest, `${view}-depth-small.png`));
const { width, height, near, far } = stops[0];
const src = `// Sinh tự động bởi tools/build-scene-data.mjs — đừng sửa tay.
export const VALLEY_IMAGE = { width: ${width * scale}, height: ${height * scale}, near: ${near}, far: ${far} }
export const VALLEY_STOPS = ${JSON.stringify(rows, null, 2)} as const
`;
writeFileSync(resolve('src/scene2d/valleyData.ts'), src);
console.log(`đã ghi ${rows.length} mốc`);
