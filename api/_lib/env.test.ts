import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, DEFAULT_PRESIGN_TTL_SECONDS, loadAdminConfig, loadPresignTtl, loadR2Config } from './env.ts'

const R2 = { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket' }
const ADMIN = { ADMIN_PASSWORD: 'mat-khau-dai', SESSION_SECRET: 's'.repeat(32) }

test('loadR2Config: đủ biến thì đọc được, cắt khoảng trắng', () => {
  assert.deepEqual(loadR2Config({ ...R2, R2_BUCKET: '  bucket \n' }), {
    accountId: 'acc',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucket: 'bucket',
  })
})

test('loadR2Config: thiếu biến thì ConfigError, nêu đủ tên các biến thiếu', () => {
  assert.throws(() => loadR2Config({}), (error: unknown) => {
    assert.ok(error instanceof ConfigError)
    for (const name of Object.keys(R2)) assert.ok(error.message.includes(name), name)
    return true
  })
  assert.throws(() => loadR2Config({ ...R2, R2_BUCKET: '   ' }), ConfigError)
})

test('loadAdminConfig: kiểm tra độ dài mật khẩu và secret', () => {
  assert.deepEqual(loadAdminConfig(ADMIN), { adminPassword: 'mat-khau-dai', sessionSecret: 's'.repeat(32) })
  assert.throws(() => loadAdminConfig({ ...ADMIN, ADMIN_PASSWORD: 'ngan' }), /ADMIN_PASSWORD/)
  assert.throws(() => loadAdminConfig({ ...ADMIN, SESSION_SECRET: 'ngan' }), /SESSION_SECRET/)
  assert.throws(() => loadAdminConfig({}), ConfigError)
})

test('loadAdminConfig: PUBLIC_ORIGIN bỏ dấu / cuối, để trống thì không có khoá', () => {
  assert.equal(loadAdminConfig({ ...ADMIN, PUBLIC_ORIGIN: 'https://kazelody.iamtpg.dev/' }).publicOrigin, 'https://kazelody.iamtpg.dev')
  assert.ok(!('publicOrigin' in loadAdminConfig({ ...ADMIN, PUBLIC_ORIGIN: '  ' })))
})

test('loadPresignTtl: mặc định 3 giờ; giá trị lạ thì dùng mặc định', () => {
  assert.equal(loadPresignTtl({}), DEFAULT_PRESIGN_TTL_SECONDS)
  assert.equal(DEFAULT_PRESIGN_TTL_SECONDS, 10_800)
  assert.equal(loadPresignTtl({ R2_PRESIGN_TTL_SECONDS: '120' }), 120)
  for (const bad of ['abc', '10', '-5', '1.5', '999999999', '']) {
    assert.equal(loadPresignTtl({ R2_PRESIGN_TTL_SECONDS: bad }), DEFAULT_PRESIGN_TTL_SECONDS, bad)
  }
})
