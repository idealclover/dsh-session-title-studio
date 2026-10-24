import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildUserInput,
  buildVariables,
  findUnknownVariables,
  finishTitle,
  parseTitleOutput,
  renderTemplate,
  systemPromptFor,
} from '../lib/prompt.js'
import { RECIPE_DEFAULTS } from '../lib/constants.js'

const request = {
  messages: [
    { seq: 1, text: '帮我写一个标题插件' },
    { seq: 2, text: '标题要能自定义格式' },
  ],
  session: { header: { cwd: '/Users/me/Projects/demo-app' } },
}

const base = { ...RECIPE_DEFAULTS }

test('renderTemplate replaces known variables and leaves unknown ones visible', () => {
  assert.equal(renderTemplate('{{a}}/{{b}}', { a: '1', b: '2' }), '1/2')
  assert.equal(renderTemplate('{{missing}}', {}), '{{missing}}')
  assert.equal(renderTemplate('{{ a }}', { a: 'x' }), 'x')
})

test('findUnknownVariables reports unsupported names', () => {
  assert.deepEqual(findUnknownVariables('{{messages}} {{nope}} {{nope}} {{also_bad}}'), [
    'also_bad',
    'nope',
  ])
  assert.deepEqual(findUnknownVariables('{{date}}'), [])
})

test('buildVariables exposes message, workspace and count values', () => {
  const variables = buildVariables(request, 'Existing', new Date(2026, 9, 18, 12).getTime())
  assert.equal(variables.workspace, 'demo-app')
  assert.equal(variables.date, '2026-10-18')
  assert.equal(variables.messageCount, '2')
  assert.equal(variables.currentTitle, 'Existing')
  assert.equal(variables.firstMessage, '帮我写一个标题插件')
  assert.deepEqual(JSON.parse(variables.messages), [
    { seq: 1, text: '帮我写一个标题插件' },
    { seq: 2, text: '标题要能自定义格式' },
  ])
})

test('systemPromptFor applies language, length and stability clauses', () => {
  const strict = systemPromptFor({ ...base, stability: 'strict' }, true, {})
  assert.match(strict, /Simplified Chinese|language of the messages/u)
  assert.match(strict, /exactly unchanged/u)
  assert.match(strict, /about 5 words/u)

  const follow = systemPromptFor({ ...base, stability: 'follow' }, true, {})
  assert.match(follow, /latest messages/u)
  assert.doesNotMatch(follow, /exactly unchanged/u)

  const zhh = systemPromptFor({ ...base, language: 'zh' }, false, {})
  assert.match(zhh, /Simplified Chinese/u)
  assert.doesNotMatch(zhh, /exactly unchanged/u)
})

test('systemPromptFor treats custom prompts as the complete prompt', () => {
  const custom = systemPromptFor(
    { ...base, preset: 'custom', systemPrompt: 'Write a title about {{workspace}} on {{date}}.' },
    true,
    { workspace: 'demo-app', date: '2026-10-18' },
  )
  assert.equal(custom, 'Write a title about demo-app on 2026-10-18.')
})

test('systemPromptFor appends extra instructions to a preset', () => {
  const prompt = systemPromptFor({ ...base, systemPrompt: 'Prefer Chinese nouns.' }, false, {})
  assert.match(prompt, /concise title/u)
  assert.match(prompt, /Prefer Chinese nouns\./u)
})

test('buildUserInput uses JSON framing by default and a custom template when set', () => {
  const framed = buildUserInput(base, request, undefined, buildVariables(request, undefined))
  assert.match(framed, /^Generate the session title from this JSON array/u)
  assert.deepEqual(JSON.parse(framed.split('\n')[1]), [
    { seq: 1, text: '帮我写一个标题插件' },
    { seq: 2, text: '标题要能自定义格式' },
  ])

  const anchored = buildUserInput(base, request, 'Existing', buildVariables(request, 'Existing'))
  assert.match(anchored, /^Update the session title from this JSON object/u)
  assert.equal(JSON.parse(anchored.split('\n')[1]).currentTitle, 'Existing')

  const custom = buildUserInput(
    { ...base, userTemplate: 'Title for {{messageCount}} messages in {{workspace}}.' },
    request,
    undefined,
    buildVariables(request, undefined),
  )
  assert.equal(custom, 'Title for 2 messages in demo-app.')
})

test('parseTitleOutput takes the first line and strips wrapping decoration', () => {
  const run = (text) =>
    parseTitleOutput({ finish: { kind: 'stop' }, blocks: [{ type: 'text', text }] })

  assert.equal(run('Fix login timeout\nsecond line'), 'Fix login timeout')
  assert.equal(run('**Fix login timeout**'), 'Fix login timeout')
  assert.equal(run('"Fix login timeout"'), 'Fix login timeout')
  assert.equal(run('“Fix login timeout”'), 'Fix login timeout')
  assert.equal(run('Title: Fix login timeout'), 'Fix login timeout')
  assert.equal(run('`Fix login timeout`'), 'Fix login timeout')
  assert.equal(run('  \n\n  Fix login timeout  '), 'Fix login timeout')
})

test('parseTitleOutput rejects tool calls, truncated output and empty text', () => {
  assert.throws(
    () => parseTitleOutput({ finish: { kind: 'tool-calls' }, blocks: [] }),
    /finished with tool-calls/u,
  )
  assert.throws(
    () => parseTitleOutput({ finish: { kind: 'max-tokens' }, blocks: [] }),
    /finished with max-tokens/u,
  )
  assert.throws(
    () =>
      parseTitleOutput({
        finish: { kind: 'stop' },
        blocks: [{ type: 'tool-call' }],
      }),
    /text only/u,
  )
  assert.throws(
    () => parseTitleOutput({ finish: { kind: 'stop' }, blocks: [] }),
    /no text/u,
  )
})

test('finishTitle composes decoration within the byte budget', () => {
  assert.equal(
    finishTitle('Fix login', { ...base, prefix: '[dsh] ', suffix: '', maxTitleBytes: 80 }),
    '[dsh] Fix login',
  )
  assert.throws(
    () => finishTitle('   ', { ...base, prefix: '', suffix: '', maxTitleBytes: 80 }),
    /empty/u,
  )
})
