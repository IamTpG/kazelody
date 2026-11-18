/*
 * Thứ tự phát: logic thuần, bất biến, không dính DOM nên test được bằng Node.
 * `order` là hoán vị các chỉ số bài; `position` là vị trí đang phát trong `order`.
 * Hết danh sách thì quay vòng.
 */

export type Queue = {
  readonly order: readonly number[]
  readonly position: number
  readonly shuffle: boolean
}

export type Random = () => number

const identity = (length: number) => Array.from({ length }, (_, i) => i)

/** Fisher–Yates trên bản sao. */
function shuffled(items: readonly number[], random: Random): number[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Xáo trộn nhưng giữ `first` ở đầu (bài đang phát không bị đổi). */
function shuffledFrom(length: number, first: number, random: Random): number[] {
  const rest = identity(length).filter((i) => i !== first)
  return [first, ...shuffled(rest, random)]
}

export function createQueue(length: number, index = 0, shuffle = false, random: Random = Math.random): Queue {
  if (length <= 0) return { order: [], position: 0, shuffle }
  const start = Math.min(Math.max(0, index), length - 1)
  return shuffle
    ? { order: shuffledFrom(length, start, random), position: 0, shuffle }
    : { order: identity(length), position: start, shuffle }
}

/** Chỉ số bài đang phát, -1 nếu danh sách rỗng. */
export function currentIndex(queue: Queue): number {
  return queue.order[queue.position] ?? -1
}

export function next(queue: Queue): Queue {
  if (queue.order.length === 0) return queue
  return { ...queue, position: (queue.position + 1) % queue.order.length }
}

export function prev(queue: Queue): Queue {
  if (queue.order.length === 0) return queue
  return { ...queue, position: (queue.position - 1 + queue.order.length) % queue.order.length }
}

/** Nhảy tới bài có chỉ số `index`. Chỉ số không hợp lệ thì giữ nguyên. */
export function jump(queue: Queue, index: number): Queue {
  const position = queue.order.indexOf(index)
  return position < 0 ? queue : { ...queue, position }
}

/** Bật/tắt xáo trộn mà không đổi bài đang phát. */
export function setShuffle(queue: Queue, shuffle: boolean, random: Random = Math.random): Queue {
  if (queue.shuffle === shuffle) return queue
  const current = currentIndex(queue)
  if (current < 0) return { ...queue, shuffle }
  return shuffle
    ? { order: shuffledFrom(queue.order.length, current, random), position: 0, shuffle }
    : { order: identity(queue.order.length), position: current, shuffle }
}
