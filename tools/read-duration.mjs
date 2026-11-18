// Đọc thời lượng (giây) của một file nhạc ở Node, dùng cho các công cụ dòng lệnh (không nằm trong bundle của app).
// Trả về null khi không đọc được: bài vẫn được xử lý bình thường, chỉ là chưa có thời lượng.
import { parseFile } from 'music-metadata';

export async function readFileDuration(path) {
  try {
    const { format } = await parseFile(path, { duration: true });
    const seconds = format.duration;
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}
