import type { UploadTicket } from './api.ts'

/**
 * PUT file thẳng lên R2 bằng URL ký. Dùng XMLHttpRequest (không phải fetch) vì chỉ XHR báo được tiến độ upload.
 * Phải gửi đúng các header trong phiếu (Content-Type đã được ký vào URL). Không gửi cookie: URL ký tự đủ quyền.
 * Tách riêng khỏi upload.ts vì test chạy trên Node, nơi không có XMLHttpRequest.
 */
export function putFile(ticket: UploadTicket, file: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', ticket.uploadUrl)
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`R2 từ chối upload (HTTP ${xhr.status}): kiểm tra CORS của bucket và Content-Type`))
    }
    xhr.onerror = () =>
      reject(new Error('Không upload được lên R2: lỗi mạng, hoặc CORS của bucket chưa cho phép PUT từ trang này'))
    xhr.onabort = () => reject(new Error('Đã huỷ upload'))
    xhr.send(file)
  })
}
