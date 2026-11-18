import assert from 'node:assert/strict'
import { test } from 'node:test'
import { audioUrl } from './manifest.ts'

/** Mô phỏng cách máy chủ tĩnh của Vite đọc đường dẫn: chỉ decodeURI. */
const served = (url: string) => decodeURI(url.slice('/audio/'.length))

test('audioUrl: đi một vòng qua decodeURI phải ra đúng tên file', () => {
  const names = [
    'Aria North__Quiet Hills at Dusk__CC-BY-4.0__freemusicarchive.org.mp3',
    'Lumen__Fireflies Over the Meadow, Late Summer Edit__CC-BY-4.0.mp3',
    'Hoshi Ame__Kaze no Michi - Part 1 [Remix]__CC-BY-3.0.wav',
    "Guns N' Roses__Don't Cry (feat. A & B); live = best + more @ $5__CC0.ogg",
    '久石譲__風の通り道__CC-BY-3.0.mp3',
    'Hồng Nhung__Mưa chính Bắc__CC0.mp3',
    '100% Band__Vol.2__CC0.mp3',
  ]
  for (const name of names) assert.equal(served(audioUrl(name)), name)
})

test('audioUrl: dấu phẩy, & và ; để nguyên (không thành %2C/%26/%3B)', () => {
  const url = audioUrl('A, B & C; D__T__CC0.mp3')
  assert.ok(!/%2C|%26|%3B/i.test(url), url)
})

test('audioUrl: khoảng trắng và % được mã hoá, không chứa khoảng trắng thô', () => {
  const url = audioUrl('A B__100% T__CC0.mp3')
  assert.ok(!url.includes(' '))
  assert.ok(url.includes('%25'))
})
