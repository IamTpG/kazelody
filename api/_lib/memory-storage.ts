import type { ObjectInfo, Storage } from './storage.ts'

type Stored = { contentType: string; size: number; json?: string }

/** Bản Storage trong bộ nhớ, chỉ dùng cho test. URL ký là URL giả nhưng mang đủ thông tin để kiểm tra. */
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, Stored>()
  readonly deleted: string[] = []
  /** Đặt để mô phỏng R2 báo lỗi khi xoá. */
  failDelete = false

  /** Giả lập một file đã được trình duyệt upload lên R2. */
  seed(key: string, info: ObjectInfo): void {
    this.objects.set(key, { ...info })
  }

  async getJson(key: string): Promise<unknown> {
    const object = this.objects.get(key)
    return object?.json === undefined ? null : JSON.parse(object.json)
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const json = JSON.stringify(value)
    this.objects.set(key, { contentType: 'application/json', size: json.length, json })
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { contentType, size: body.byteLength })
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const object = this.objects.get(key)
    return object ? { size: object.size, contentType: object.contentType } : null
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new Error('R2 lỗi khi xoá')
    this.objects.delete(key)
    this.deleted.push(key)
  }

  async presignGet(key: string, expiresInSeconds: number): Promise<string> {
    return `https://r2.test/${key}?op=get&expires=${expiresInSeconds}`
  }

  async presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return `https://r2.test/${key}?op=put&type=${encodeURIComponent(contentType)}&expires=${expiresInSeconds}`
  }
}
