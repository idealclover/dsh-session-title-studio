import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateRefresh, hasNewInput, localDayKey } from '../lib/policy-core.js'
import { POLICY_DEFAULTS } from '../lib/constants.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 9, 18, 12, 0, 0).getTime()

const config = {
  ...POLICY_DEFAULTS,
  everyNTurns: 3,
  minIntervalMs: 120000,
  maxRefreshesPerSessionPerDay: 2,
  enableDrift: false,
}

const driftConfig = {
  ...config,
  enableDrift: true,
  driftThreshold: 0.6,
  driftMinNewMessages: 1,
  driftForceAfterMessages: 6,
  driftMinChars: 10,
}

const providerTitle = (covered) => ({
  title: 'Existing',
  messageSeqs: Array.from({ length: covered }, (_, index) => index + 1),
  source: { kind: 'provider', provider: 'test' },
  updatedAt: NOW,
})

const decide = (overrides = {}) =>
  evaluateRefresh({
    reason: 'idle',
    now: NOW,
    title: undefined,
    inputCount: 1,
    state: undefined,
    config,
    ...overrides,
  })

test('fresh sessions with new input pass', () => {
  const decision = decide()
  assert.equal(decision.ok, true)
  assert.equal(decision.newMessages, 1)
  assert.equal(decision.countToday, 0)
})

test('automatic refresh needs new input since the last title', () => {
  const decision = decide({ title: providerTitle(1), inputCount: 1 })
  assert.equal(decision.ok, false)
  assert.equal(decision.skip, 'no-new-input')
})

test('pinned titles are skipped unless forced', () => {
  const pinned = {
    title: 'My title',
    messageSeqs: [],
    source: { kind: 'user' },
    updatedAt: NOW,
  }
  assert.equal(decide({ title: pinned, inputCount: 3 }).skip, 'pinned')
  assert.equal(decide({ title: pinned, inputCount: 3, reason: 'manual' }).skip, 'pinned')
  assert.equal(decide({ title: pinned, inputCount: 3, reason: 'manual', force: true }).ok, true)
  assert.equal(
    decide({
      title: pinned,
      inputCount: 3,
      config: { ...config, respectPinned: false },
    }).ok,
    true,
  )
})

test('every-N-turns waits for its threshold', () => {
  const below = decide({
    reason: 'every-n-turns',
    title: providerTitle(1),
    inputCount: 3,
  })
  assert.equal(below.skip, 'below-turn-threshold')
  assert.equal(below.newMessages, 2)

  const at = decide({
    reason: 'every-n-turns',
    title: providerTitle(1),
    inputCount: 4,
  })
  assert.equal(at.ok, true)
  assert.equal(at.newMessages, 3)
})

test('minimum interval blocks automatic refreshes only', () => {
  const state = { lastAttemptAt: NOW - 1000, dayKey: localDayKey(NOW), countToday: 0 }
  assert.equal(decide({ state, title: providerTitle(1), inputCount: 2 }).skip, 'min-interval')
  assert.equal(
    decide({ reason: 'manual', state, title: providerTitle(1), inputCount: 2 }).ok,
    true,
  )
})

test('daily budget blocks automatic refreshes and resets on a new day', () => {
  const state = { lastAttemptAt: NOW - 10 * 60 * 1000, dayKey: localDayKey(NOW), countToday: 2 }
  assert.equal(
    decide({ state, title: providerTitle(1), inputCount: 2 }).skip,
    'daily-cap',
  )
  const tomorrow = decide({
    now: NOW + DAY,
    state: { ...state, lastAttemptAt: NOW - 10 * 60 * 1000 },
    title: providerTitle(1),
    inputCount: 2,
  })
  assert.equal(tomorrow.ok, true)
  assert.equal(tomorrow.countToday, 0)
})

test('manual refresh bypasses staleness, interval and budget', () => {
  const state = { lastAttemptAt: NOW, dayKey: localDayKey(NOW), countToday: 99 }
  const decision = decide({
    reason: 'manual',
    state,
    title: providerTitle(5),
    inputCount: 5,
  })
  assert.equal(decision.ok, true)
  assert.equal(decision.newMessages, 0)
})

test('subagent sessions are excluded unless configured in', () => {
  assert.equal(decide({ isSubagent: true }).skip, 'subagent')
  assert.equal(
    decide({ isSubagent: true, config: { ...config, includeSubagents: true } }).ok,
    true,
  )
})

test('hasNewInput compares message coverage', () => {
  assert.equal(hasNewInput(undefined, 0), false)
  assert.equal(hasNewInput(undefined, 1), true)
  assert.equal(hasNewInput(providerTitle(2), 2), false)
  assert.equal(hasNewInput(providerTitle(2), 3), true)
})

test('localDayKey uses local calendar boundaries', () => {
  assert.equal(localDayKey(new Date(2026, 9, 18, 0, 0, 1).getTime()), '2026-10-18')
  assert.equal(localDayKey(new Date(2026, 9, 18, 23, 59, 59).getTime()), '2026-10-18')
  assert.equal(localDayKey(new Date(2026, 9, 19, 0, 0, 1).getTime()), '2026-10-19')
})

test('drift gate blocks automatic refresh but never manual refresh', () => {
  const stable = { score: 0.2, recentChars: 100 }
  const auto = decide({
    config: driftConfig,
    title: providerTitle(1),
    inputCount: 2,
    drift: stable,
  })
  assert.equal(auto.ok, false)
  assert.equal(auto.skip, 'no-drift')

  const manual = decide({
    config: driftConfig,
    reason: 'manual',
    title: providerTitle(1),
    inputCount: 2,
    drift: stable,
  })
  assert.equal(manual.ok, true)

  const changed = decide({
    config: driftConfig,
    title: providerTitle(1),
    inputCount: 2,
    drift: { score: 0.9, recentChars: 100 },
  })
  assert.equal(changed.ok, true)
})

test('drift gate needs enough messages and text unless forced', () => {
  const short = decide({
    config: { ...driftConfig, driftMinChars: 50 },
    title: providerTitle(1),
    inputCount: 2,
    drift: { score: 0.9, recentChars: 20 },
  })
  assert.equal(short.skip, 'drift-too-short')

  const few = decide({
    config: { ...driftConfig, driftMinNewMessages: 2 },
    title: providerTitle(1),
    inputCount: 2,
    drift: { score: 0.9, recentChars: 100 },
  })
  assert.equal(few.skip, 'drift-too-few')

  const forced = decide({
    config: { ...driftConfig, driftForceAfterMessages: 3 },
    title: providerTitle(1),
    inputCount: 4,
    drift: { score: 0.1, recentChars: 100 },
  })
  assert.equal(forced.ok, true)

  const disabled = decide({
    config: { ...driftConfig, enableDrift: false },
    title: providerTitle(1),
    inputCount: 2,
    drift: { score: 0.1, recentChars: 100 },
  })
  assert.equal(disabled.ok, true)
})
