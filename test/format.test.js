import test from 'node:test'
import assert from 'node:assert/strict'

import { utf8Bytes, truncateUtf8, sanitizeTitle, composeTitle } from '../lib/format.js'

test('utf8Bytes counts UTF-8 bytes, not code units', () => {
  assert.equal(utf8Bytes('abc'), 3)
  assert.equal(utf8Bytes('你好'), 6)
  assert.equal(utf8Bytes('a你'), 4)
})

test('truncateUtf8 never splits a code point', () => {
  assert.equal(truncateUtf8('你好世界', 7), '你好')
  assert.equal(truncateUtf8('你好世界', 6), '你好')
  assert.equal(truncateUtf8('hello', 3), 'hel')
  assert.equal(truncateUtf8('hello', 0), '')
})

test('sanitizeTitle removes ANSI, controls and line breaks', () => {
  assert.equal(sanitizeTitle('\u001B[31mFix\u001B[0m\n  login\t timeout  '), 'Fix login timeout')
  assert.equal(sanitizeTitle('a\u0000b'), 'a b')
  assert.equal(sanitizeTitle('  '), '')
})

test('composeTitle applies decoration and respects the byte budget', () => {
  assert.equal(composeTitle('Fix login', '[dsh] ', '', 80), '[dsh] Fix login')
  const full = composeTitle('这是一个很长的标题', '', ' · 2026', 40)
  assert.equal(full, '这是一个很长的标题 · 2026')
  const clipped = composeTitle('这是一个很长的标题', '', ' · 2026', 22)
  assert.equal(clipped, '这是一个很长的')
  assert.ok(utf8Bytes(clipped) <= 22)
})

test('composeTitle keeps the result on one line', () => {
  assert.equal(composeTitle('line one\nline two', '', '', 80), 'line one line two')
})
