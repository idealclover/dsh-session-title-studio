import test from 'node:test'
import assert from 'node:assert/strict'
import { coverageInit, foldCoverage } from '../lib/coverage-core.js'
import { evaluateRefresh, hasNewInput } from '../lib/policy-core.js'
import { POLICY_DEFAULTS } from '../lib/constants.js'

const message = (seq) => ({ seq, type: 'user/message',
  data: { source: { kind: 'user' }, content: [{ type: 'text', text: '新消息' }] } })

test('sampled first/latest sources advance the watermark, not just their count', () => {
  let state = coverageInit()
  for (let index = 0; index < 2000; index += 1) state = foldCoverage(state, message(index * 3))
  state = foldCoverage(state, { type: 'session/title', data: { messageSeqs: [0, 5997] } })
  assert.equal(state.count, 2000)
  assert.equal(state.covered, 2000)
  assert.equal(state.tail.length, 256)
  const title = { messageSeqs: [0, 5997], source: { kind: 'provider' } }
  assert.equal(hasNewInput(title, 2000, state.covered), false)
  const result = evaluateRefresh({ reason: 'idle', title, inputCount: 2000,
    coveredCount: state.covered, now: Date.now(), config: POLICY_DEFAULTS })
  assert.equal(result.skip, 'no-new-input')
  state = foldCoverage(state, message(6001))
  assert.equal(state.count - state.covered, 1)
})

test('first-prompt title after many follow-ups still covers only the first', () => {
  let state = coverageInit()
  for (let index = 0; index < 1000; index += 1) state = foldCoverage(state, message(index))
  state = foldCoverage(state, { type: 'session/title', data: { messageSeqs: [0] } })
  assert.equal(state.covered, 1)
})

test('unrelated events are free and manual titles retain no automatic coverage', () => {
  const state = foldCoverage(coverageInit(), message(0))
  assert.equal(foldCoverage(state, { type: 'tool/result' }), state)
  assert.equal(foldCoverage(state, { type: 'session/title', data: { messageSeqs: [] } }).covered, 0)
})
