import test from 'node:test'
import assert from 'node:assert/strict'
import { RECIPE_DEFAULTS } from '../lib/constants.js'
import { buildVariables, buildUserInput } from '../lib/prompt.js'
import { prepareTitleInput } from '../lib/input-budget.js'
import { utf8Bytes } from '../lib/format.js'

test('reported 4271-byte title input fits the 4096-byte budget without rejection', () => {
  const request = { session: { header: {} }, messages: [{ seq: 0, text: '' }] }
  const original = () => buildUserInput(RECIPE_DEFAULTS, request, undefined,
    buildVariables(request, undefined))
  request.messages[0].text = 'x'.repeat(4271 - utf8Bytes(original()))
  assert.equal(utf8Bytes(original()), 4271)
  const result = prepareTitleInput(RECIPE_DEFAULTS, request)
  assert.ok(utf8Bytes(result.input) <= 4096)
  assert.equal(result.stats.truncated, true)
  assert.deepEqual(result.messageSeqs, [0])
  assert.match(result.input, /\[…\]/u)
})
