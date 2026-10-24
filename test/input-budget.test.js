import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareTitleInput } from '../lib/input-budget.js'
import { RECIPE_DEFAULTS } from '../lib/constants.js'
import { buildVariables, buildUserInput, systemPromptFor } from '../lib/prompt.js'
import { utf8Bytes } from '../lib/format.js'

const base = { ...RECIPE_DEFAULTS }
const now = new Date(2026, 9, 18, 12).getTime()
const requestFor = (texts) => ({
  messages: texts.map((text, index) => ({ seq: index * 7 + 1, text })),
  session: { header: { cwd: '/projects/title-studio' } },
})
const parseDefault = (input) => {
  const parsed = JSON.parse(input.startsWith('{') ? input : input.slice(input.indexOf('\n') + 1))
  return Array.isArray(parsed) ? parsed : parsed.messages
}
const check = (config, request, anchor) => {
  const result = prepareTitleInput(config, request, anchor, now)
  assert.ok(utf8Bytes(result.input) <= config.maxInputBytes)
  assert.equal(result.stats.selectedMessageCount, result.messageSeqs.length)
  assert.equal(result.stats.omittedMessageCount + result.stats.selectedMessageCount, request.messages.length)
  return result
}

test('small inputs preserve original framing, text, anchor and sampled clock', () => {
  const request = requestFor(['Build a title plugin', '支持中文😀'])
  for (const anchor of [undefined, 'Existing title']) {
    const variables = buildVariables(request, anchor, now)
    const result = check(base, request, anchor)
    assert.equal(result.input, buildUserInput(base, request, anchor, variables))
    assert.equal(result.system, systemPromptFor(base, anchor !== undefined, variables))
    assert.deepEqual(result.messageSeqs, [1, 8])
    assert.deepEqual(result.stats, { totalMessageCount: 2, selectedMessageCount: 2, omittedMessageCount: 0, truncated: false })
  }
})

test('thousands of messages select bounded first and newest sources without mutation', () => {
  const request = requestFor(Array.from({ length: 5000 }, (_, index) => `request-${index} ` + '正文😀'.repeat(60)))
  const original = structuredClone(request)
  const result = check(base, request, 'Stable title')
  const messages = parseDefault(result.input)
  assert.ok(messages.length <= 12)
  assert.equal(messages[0].seq, request.messages[0].seq)
  assert.equal(messages.at(-1).seq, request.messages.at(-1).seq)
  assert.deepEqual(result.messageSeqs, messages.map((message) => message.seq))
  assert.equal(result.stats.omittedMessageCount, 4988)
  assert.equal(result.stats.truncated, true)
  assert.deepEqual(request, original)
})

test('a huge single message retains Unicode-safe head and tail with a clipping marker', () => {
  const request = requestFor(['START😀' + '中😀"\\\n'.repeat(200000) + '😀END'])
  const result = check({ ...base, maxInputBytes: 256 }, request)
  const [message] = parseDefault(result.input)
  assert.match(message.text, /^START😀/u)
  assert.match(message.text, /😀END$/u)
  assert.match(message.text, /\[…\]/u)
  assert.doesNotMatch(message.text, /\uFFFD/u)
  assert.equal(message.text.isWellFormed(), true)
  assert.equal(result.stats.truncated, true)
})

test('exact rendered byte boundaries include escaped JSON bytes', () => {
  const request = requestFor(['中😀"\\\n\tend'])
  const full = buildUserInput(base, request, undefined, buildVariables(request, undefined, now))
  const bytes = utf8Bytes(full)
  const exact = check({ ...base, maxInputBytes: bytes }, request)
  assert.equal(exact.input, full)
  assert.equal(exact.stats.truncated, false)
  const below = check({ ...base, maxInputBytes: bytes - 1 }, request)
  assert.equal(below.stats.truncated, true)
  assert.doesNotThrow(() => parseDefault(below.input))
})

test('64 byte budget uses compact JSON and keeps newest when only one source fits', () => {
  const request = requestFor(['First '.repeat(100), 'Middle '.repeat(100), 'Newest '.repeat(100)])
  const result = check({ ...base, maxInputBytes: 64 }, request, 'An anchor too long for this budget'.repeat(10))
  assert.ok(result.input.startsWith('{'))
  const messages = parseDefault(result.input)
  assert.deepEqual(result.messageSeqs, [request.messages.at(-1).seq])
  assert.deepEqual(messages.map((message) => message.seq), result.messageSeqs)
  assert.equal(result.stats.truncated, true)
})

test('custom repeated placeholders account for JSON escaping and preserve scaffold', () => {
  const config = {
    ...base,
    maxInputBytes: 512,
    userTemplate: 'FIXED INSTRUCTIONS\n{"a":{{messages}},"b":{{messages}}}\nEND INSTRUCTIONS',
    systemPrompt: 'Evidence:\n{{transcript}}\nFirst: {{firstMessage}}',
  }
  const request = requestFor(['😀"\\\n'.repeat(10000), '最新需求'.repeat(10000)])
  const result = check(config, request)
  assert.ok(result.input.startsWith('FIXED INSTRUCTIONS\n'))
  assert.ok(result.input.endsWith('\nEND INSTRUCTIONS'))
  const parsed = JSON.parse(result.input.split('\n')[1])
  assert.deepEqual(parsed.a, parsed.b)
  assert.deepEqual(parsed.a.map((message) => message.seq), result.messageSeqs)
  assert.ok(result.system.includes(parsed.a[0].text))
  assert.ok(result.system.includes(parsed.a[1].text))
  assert.ok(utf8Bytes(result.system) < 3000)
})

test('system transcript uses the same sampled messages rather than full history', () => {
  const request = requestFor(Array.from({ length: 2000 }, (_, index) => `unique-${index}-` + 'x'.repeat(100)))
  const result = check({ ...base, systemPrompt: 'Transcript: {{transcript}}; first={{firstMessage}}' }, request)
  assert.doesNotMatch(result.system, /unique-100-/u)
  for (const message of parseDefault(result.input)) assert.ok(result.system.includes(message.text))
})

test('firstMessage-only custom prompts attribute the actual first source', () => {
  const request = requestFor(['Original request '.repeat(100), 'Not referenced'])
  const result = check({ ...base, maxInputBytes: 128, userTemplate: 'First: {{firstMessage}}' }, request)
  assert.deepEqual(result.messageSeqs, [1])
  assert.match(result.input, /^First: Original/u)
  assert.doesNotMatch(result.input, /Not referenced/u)
})

test('custom firstMessage stays included together with latest when possible', () => {
  const request = requestFor(Array.from({ length: 40 }, (_, index) => `request ${index} ` + 'x'.repeat(100)))
  const result = check({ ...base, maxInputBytes: 512, userTemplate: '{{firstMessage}}\n{{messages}}' }, request)
  const [first, json] = result.input.split('\n')
  assert.equal(first, JSON.parse(json)[0].text)
  assert.equal(result.messageSeqs[0], 1)
  assert.equal(result.messageSeqs.at(-1), request.messages.at(-1).seq)
})

test('fixed custom scaffold cannot be silently clipped', () => {
  const request = requestFor(['Message'])
  assert.throws(() => prepareTitleInput({ ...base, maxInputBytes: 64, userTemplate: 'FIXED'.repeat(20) + '{{messages}}' }, request), /fixed input scaffolding.*maxInputBytes/u)
  assert.throws(() => prepareTitleInput({ ...base, maxInputBytes: 64, userTemplate: '{{currentTitle}} {{messages}}' }, request, 'x'.repeat(100)), /fixed input scaffolding/u)
})

test('rejects custom prompts with no actual message source and supports system-only references', () => {
  const request = requestFor(['Evidence'])
  assert.throws(() => prepareTitleInput({ ...base, userTemplate: 'Title for {{messageCount}} messages' }, request), /at least one message source/u)
  const result = check({ ...base, userTemplate: 'Write a title.', systemPrompt: 'Use {{messages}}' }, request)
  assert.deepEqual(result.messageSeqs, [1])
  assert.match(result.system, /Evidence/u)
})

test('reports unusable budgets or absent sources clearly', () => {
  assert.throws(() => prepareTitleInput({ ...base, maxInputBytes: 1 }, requestFor(['Text'])), /fixed input scaffolding/u)
  assert.throws(() => prepareTitleInput({ ...base, maxInputBytes: 0 }, requestFor(['Text'])), /positive integer/u)
  assert.throws(() => prepareTitleInput(base, requestFor([])), /no eligible human messages/u)
})

// Many combinations catch escaping and code-point boundary interactions while
// remaining deterministic and cheap enough for the normal unit-test command.
test('budget invariant across UTF-8, control escapes, anchors and templates', () => {
  const request = requestFor(Array.from({ length: 18 }, (_, index) => `${index}:` + '😀中"\\\n\t'.repeat(100)))
  for (const maxInputBytes of [64, 80, 96, 128, 255, 512, 1024, 4096]) {
    for (const anchor of [undefined, '已有标题😀']) {
      const result = check({ ...base, maxInputBytes }, request, anchor)
      assert.deepEqual(parseDefault(result.input).map((message) => message.seq), result.messageSeqs)
      assert.equal(parseDefault(result.input).every((message) => message.text.isWellFormed()), true)
      assert.equal(result.messageSeqs.at(-1), request.messages.at(-1).seq)
    }
  }
})