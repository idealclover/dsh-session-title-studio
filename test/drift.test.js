import test from 'node:test'
import assert from 'node:assert/strict'

import { driftScore, similarity, stripNoise, tokenize } from '../lib/drift.js'

test('tokenize captures Latin words and CJK bigrams', () => {
  const tokens = tokenize('修复登录超时，OAuth timeout')
  assert.ok(tokens.has('c:登录'))
  assert.ok(tokens.has('c:超时'))
  assert.ok(tokens.has('w:oauth'))
  assert.ok(tokens.has('w:timeout'))
  assert.ok(!tokens.has('c:复登') === false)
})

test('stripNoise removes code, inline code and URLs', () => {
  const clean = stripNoise('看这里 ```const a = 1``` 和 `b` https://example.com 的内容')
  assert.ok(!clean.includes('const a'))
  assert.ok(!clean.includes('example.com'))
  assert.match(clean, /看这里/u)
  assert.match(clean, /内容/u)
})

test('identical text is fully similar and unrelated text is not', () => {
  const left = tokenize('修复登录超时')
  assert.equal(similarity(left, tokenize('修复登录超时')), 1)
  assert.equal(similarity(left, tokenize('数据库迁移方案')), 0)
})

test('same-topic follow-up drifts less than a new topic', () => {
  const basis = '修复登录超时，OAuth 回调一直失败'
  const same = '登录超时还是存在，帮我看一下 OAuth 回调'
  const different = '我们换个话题，规划数据库迁移方案'
  const sameScore = driftScore(basis, same)
  const differentScore = driftScore(basis, different)
  assert.ok(sameScore < 0.6, `same-topic drift was ${sameScore}`)
  assert.ok(differentScore >= 0.6, `new-topic drift was ${differentScore}`)
  assert.ok(sameScore < differentScore)
})

test('English follow-ups behave like Chinese ones', () => {
  const basis = 'fix the login timeout in OAuth callback'
  assert.ok(driftScore(basis, 'login timeout is still happening, look at OAuth') < 0.6)
  assert.ok(driftScore(basis, 'plan the database migration strategy') >= 0.6)
})

test('empty inputs are handled', () => {
  assert.equal(driftScore('修复登录超时', ''), 0)
  assert.equal(driftScore('', '数据库迁移方案'), 1)
  assert.equal(driftScore('', ''), 0)
})

test('conversational filler alone carries no topic signal', () => {
  assert.equal(tokenize('一下').size, 0)
  assert.equal(tokenize('谢谢').size, 0)
  assert.equal(similarity(tokenize('一下'), tokenize('谢谢')), 0)
})
