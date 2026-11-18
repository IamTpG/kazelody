import type { Track } from '../../shared/track.ts'
import * as Q from './queue.ts'

/*
 * Lõi phát nhạc: một HTMLAudioElement + hàng đợi (queue.ts).
 * - Không dùng Web Audio: file được tải dần qua HTTP (Range) nên nhẹ RAM, hợp phiên nghe dài.
 * - State là snapshot bất biến cho useSyncExternalStore (subscribe / getSnapshot).
 * - Thời gian phát (currentTime) KHÔNG nằm trong snapshot: UI đọc bằng requestAnimationFrame để không render 60 lần/giây.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export type PlayerState = {
  readonly status: PlayerStatus
  readonly tracks: readonly Track[]
  /** Chỉ số bài đang chọn trong `tracks`, -1 nếu danh sách rỗng */
  readonly index: number
  readonly current: Track | null
  /** Thời lượng bài hiện tại (giây), 0 cho tới khi biết */
  readonly duration: number
  readonly volume: number
  readonly shuffle: boolean
}

export type PlayerOptions = {
  /** Đổi URL ngay trước khi nạp bài (vd. presigned URL). Mặc định dùng `track.url`. */
  resolveUrl?: (track: Track) => Promise<string>
  /** Nơi lưu âm lượng và shuffle. `null` = không lưu. Mặc định localStorage (nếu dùng được). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
}

const STORAGE_KEY = 'kz-audio'
const DEFAULT_VOLUME = 0.7
const HAVE_FUTURE_DATA = 3

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readPrefs(storage: PlayerOptions['storage']): { volume: number; shuffle: boolean } {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { volume?: unknown; shuffle?: unknown }
      return {
        volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? clamp01(saved.volume) : DEFAULT_VOLUME,
        shuffle: saved.shuffle === true,
      }
    }
  } catch {
    // dữ liệu hỏng hoặc bị chặn: dùng mặc định
  }
  return { volume: DEFAULT_VOLUME, shuffle: false }
}

function shallowEqual(a: PlayerState, b: PlayerState): boolean {
  const keys = Object.keys(a) as (keyof PlayerState)[]
  return keys.every((key) => Object.is(a[key], b[key]))
}

export class Player {
  private readonly audio: HTMLAudioElement
  private readonly resolveUrl?: (track: Track) => Promise<string>
  private readonly storage: PlayerOptions['storage']
  private readonly listeners = new Set<() => void>()

  private tracks: readonly Track[] = []
  private q: Q.Queue = Q.createQueue(0)
  private volume: number
  private shuffle: boolean
  private durationSec = 0
  private status: PlayerStatus = 'idle'
  private state: PlayerState

  /** Người dùng đang muốn nghe (đã bấm phát và chưa bấm dừng). */
  private wantPlay = false
  /** Mọi bài đều lỗi liên tiếp: dừng hẳn cho tới khi người dùng bấm phát lại. */
  private fatal = false
  private failures = 0
  /** Huỷ lượt nạp dở khi đã chuyển bài khác. */
  private loadToken = 0
  private loadedId: string | null = null

  constructor(options: PlayerOptions = {}) {
    this.resolveUrl = options.resolveUrl
    this.storage = options.storage === undefined ? defaultStorage() : options.storage
    const prefs = readPrefs(this.storage)
    this.volume = prefs.volume
    this.shuffle = prefs.shuffle

    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.volume = this.volume
    this.bindAudioEvents()
    this.state = this.buildState()
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): PlayerState => this.state

  /** Vị trí đang phát (giây), đọc trực tiếp từ audio. */
  get currentTime(): number {
    return this.audio.currentTime
  }

  /** Thời lượng (giây), 0 nếu chưa biết. */
  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  setTracks(tracks: readonly Track[]): void {
    this.loadToken++
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.tracks = tracks
    this.q = Q.createQueue(tracks.length, 0, this.shuffle)
    this.wantPlay = false
    this.fatal = false
    this.failures = 0
    this.durationSec = 0
    this.loadedId = null
    this.sync()
  }

  async play(): Promise<void> {
    const track = this.tracks[Q.currentIndex(this.q)]
    if (!track) return
    this.wantPlay = true
    if (this.fatal) {
      this.failures = 0
      await this.goto(true)
      return
    }
    if (this.loadedId !== track.id) {
      this.sync()
      if (!(await this.loadCurrent())) return
    }
    this.sync()
    await this.startPlayback()
  }

  pause(): void {
    this.wantPlay = false
    this.audio.pause()
    this.sync()
  }

  toggle(): Promise<void> | void {
    return this.wantPlay ? this.pause() : this.play()
  }

  next(): void {
    if (this.tracks.length === 0) return
    this.q = Q.next(this.q)
    void this.goto(true)
  }

  prev(): void {
    if (this.tracks.length === 0) return
    this.q = Q.prev(this.q)
    void this.goto(true)
  }

  /** Chọn một bài trong danh sách. Bấm lại bài đang chọn thì chỉ tiếp tục phát. */
  playIndex(index: number): void {
    if (index === Q.currentIndex(this.q)) {
      void this.play()
      return
    }
    const jumped = Q.jump(this.q, index)
    if (jumped === this.q) return
    this.q = jumped
    void this.goto(true)
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return
    const max = this.duration || seconds
    this.audio.currentTime = Math.min(Math.max(0, seconds), max)
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return
    this.volume = clamp01(volume)
    this.audio.volume = this.volume
    this.savePrefs()
    this.commit()
  }

  setShuffle(shuffle: boolean): void {
    this.q = Q.setShuffle(this.q, shuffle)
    this.shuffle = shuffle
    this.savePrefs()
    this.commit()
  }

  private buildState(): PlayerState {
    const index = Q.currentIndex(this.q)
    return {
      status: this.status,
      tracks: this.tracks,
      index,
      current: this.tracks[index] ?? null,
      duration: this.durationSec,
      volume: this.volume,
      shuffle: this.shuffle,
    }
  }

  private commit(): void {
    const next = this.buildState()
    if (shallowEqual(this.state, next)) return
    this.state = next
    this.listeners.forEach((listener) => listener())
  }

  private computeStatus(): PlayerStatus {
    if (this.tracks.length === 0) return 'idle'
    if (this.fatal) return 'error'
    if (!this.wantPlay) return 'paused'
    return !this.audio.paused && this.audio.readyState >= HAVE_FUTURE_DATA ? 'playing' : 'loading'
  }

  private sync(): void {
    this.status = this.computeStatus()
    this.commit()
  }

  private savePrefs(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, shuffle: this.shuffle }))
    } catch {
      // bị chặn hoặc đầy: bỏ qua, chỉ mất việc nhớ cài đặt
    }
  }

  private bindAudioEvents(): void {
    const audio = this.audio
    for (const type of ['playing', 'waiting', 'canplay', 'canplaythrough', 'loadstart']) {
      audio.addEventListener(type, () => {
        if (type === 'playing') this.failures = 0
        this.sync()
      })
    }
    audio.addEventListener('pause', () => {
      // Hết bài cũng phát sự kiện pause (kèm ended): khi đó vẫn muốn nghe tiếp.
      if (!audio.ended && audio.getAttribute('src')) this.wantPlay = false
      this.sync()
    })
    audio.addEventListener('ended', () => {
      this.q = Q.next(this.q)
      void this.goto(true)
    })
    const onDuration = () => {
      this.durationSec = this.duration
      this.commit()
    }
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('durationchange', onDuration)
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return
      if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return
      this.onTrackError(audio.error)
    })
  }

  /** Chuyển sang bài hiện tại của hàng đợi và (tuỳ chọn) phát luôn. */
  private async goto(autoplay: boolean): Promise<void> {
    this.wantPlay = autoplay
    this.fatal = false
    this.durationSec = 0
    this.loadedId = null
    this.sync()
    const loaded = await this.loadCurrent()
    if (loaded && autoplay) await this.startPlayback()
  }

  private async loadCurrent(): Promise<boolean> {
    const track = this.tracks[Q.currentIndex(this.q)]
    if (!track) return false
    const token = ++this.loadToken
    let url = track.url
    if (this.resolveUrl) {
      try {
        url = await this.resolveUrl(track)
      } catch (error) {
        if (token === this.loadToken) this.onTrackError(error)
        return false
      }
      if (token !== this.loadToken) return false
    }
    this.audio.src = url
    this.loadedId = track.id
    return true
  }

  private async startPlayback(): Promise<void> {
    try {
      await this.audio.play()
    } catch (error) {
      const name = (error as { name?: string } | null)?.name
      // AbortError: vừa chuyển bài khác. NotSupportedError: sự kiện 'error' của audio sẽ xử lý.
      if (name === 'AbortError' || name === 'NotSupportedError') return
      if (name === 'NotAllowedError') {
        // Trình duyệt chặn tự phát khi chưa có thao tác của người dùng: không phải lỗi.
        this.wantPlay = false
        this.sync()
        return
      }
      this.onTrackError(error)
    }
  }

  /** Bài hỏng thì bỏ qua sang bài kế; hỏng hết cả danh sách thì dừng hẳn. */
  private onTrackError(error?: unknown): void {
    const detail = error instanceof MediaError ? `MediaError ${error.code}: ${error.message}` : error
    console.warn('[audio] không phát được', this.state.current?.originalFilename, detail)
    this.failures++
    if (this.failures >= this.tracks.length) {
      this.wantPlay = false
      this.fatal = true
      this.sync()
      return
    }
    this.q = Q.next(this.q)
    void this.goto(true)
  }
}
