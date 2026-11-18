import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { R2Config } from './env.ts'
import type { ObjectInfo, Storage } from './storage.ts'

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
}

/** Storage thật trên Cloudflare R2 (tương thích S3). Bucket private; người nghe chỉ có URL ký ngắn hạn. */
export function createR2Storage(config: R2Config): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // SDK mới thêm checksum mặc định mà R2 không nhận: chỉ tính khi giao thức bắt buộc.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const Bucket = config.bucket

  return {
    async getJson(Key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key }))
        const text = await out.Body?.transformToString()
        return text === undefined ? null : JSON.parse(text)
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    async putJson(Key, value) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: JSON.stringify(value),
          ContentType: 'application/json',
          CacheControl: 'no-store',
        }),
      )
    },

    async put(Key, body, ContentType) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType }))
    },

    async head(Key): Promise<ObjectInfo | null> {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key }))
        return { size: out.ContentLength ?? 0, contentType: out.ContentType ?? '' }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    async delete(Key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key }))
    },

    presignGet(Key, expiresIn) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn })
    },

    presignPut(Key, ContentType, expiresIn) {
      // Ký cả Content-Type: URL chỉ dùng được với đúng loại file đã khai báo.
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType }), {
        expiresIn,
        signableHeaders: new Set(['content-type']),
      })
    },
  }
}
