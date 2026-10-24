import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRecipeConfig, resolvePolicyConfig, resolveStudioConfig } from '../lib/config-core.js'
import { RECIPE_DEFAULTS, POLICY_DEFAULTS } from '../lib/constants.js'

test('recipe defaults are complete and frozen', () => {
  const config = resolveRecipeConfig({})
  assert.equal(config.preset, 'concise')
  assert.equal(config.language, 'auto')
  assert.equal(config.stability, 'balanced')
  assert.equal(config.maxTitleBytes, 80)
  assert.equal(config.targetWords, RECIPE_DEFAULTS.targetWords)
  assert.ok(Object.isFrozen(config))
})

test('recipe rejects unknown keys', () => {
  assert.throws(() => resolveRecipeConfig({ nope: true }), /unknown config key "nope"/u)
})

test('custom preset requires a prompt', () => {
  assert.throws(
    () => resolveRecipeConfig({ preset: 'custom' }),
    /requires a non-empty systemPrompt/u,
  )
  const config = resolveRecipeConfig({ preset: 'custom', systemPrompt: 'Name it.' })
  assert.equal(config.preset, 'custom')
})

test('provider and model must be configured together', () => {
  assert.throws(() => resolveRecipeConfig({ provider: 'deepseek' }), /configured together/u)
  assert.throws(() => resolveRecipeConfig({ model: 'deepseek-flash' }), /configured together/u)
  assert.doesNotThrow(() =>
    resolveRecipeConfig({ provider: 'deepseek', model: 'deepseek-flash' }),
  )
})

test('template variables are validated at load time', () => {
  assert.throws(
    () => resolveRecipeConfig({ userTemplate: 'Title for {{topic}}' }),
    /unsupported variables: \{\{topic\}\}/u,
  )
  assert.throws(
    () => resolveRecipeConfig({ systemPrompt: 'Use {{now}}' }),
    /unsupported variables: \{\{now\}\}/u,
  )
  assert.doesNotThrow(() => resolveRecipeConfig({ userTemplate: '{{messages}} in {{workspace}}' }))
})

test('numeric limits are enforced', () => {
  assert.throws(() => resolveRecipeConfig({ targetWords: 0 }), /targetWords/u)
  assert.throws(() => resolveRecipeConfig({ maxTitleBytes: 1 }), /maxTitleBytes/u)
  assert.throws(() => resolveRecipeConfig({ timeoutMs: 10 }), /timeoutMs/u)
})

test('volatile references are unwrapped before validation', () => {
  const recipe = resolveRecipeConfig({
    language: { get: () => 'zh' },
    targetWords: { get: () => 8 },
  })
  assert.equal(recipe.language, 'zh')
  assert.equal(recipe.targetWords, 8)

  const policy = resolvePolicyConfig({
    enableDrift: { get: () => false },
    driftThreshold: { get: () => 0.75 },
  })
  assert.equal(policy.enableDrift, false)
  assert.equal(policy.driftThreshold, 0.75)
})

test('policy defaults and interval floor', () => {
  const config = resolvePolicyConfig({})
  assert.equal(config.enableIdle, true)
  assert.equal(config.everyNTurns, POLICY_DEFAULTS.everyNTurns)
  assert.equal(config.intervalMs, 0)
  assert.equal(config.enableDrift, true)
  assert.equal(config.driftThreshold, POLICY_DEFAULTS.driftThreshold)
  assert.equal(config.maxSessionsPerBatch, POLICY_DEFAULTS.maxSessionsPerBatch)
  assert.ok(Object.isFrozen(config))

  assert.throws(() => resolvePolicyConfig({ intervalMs: 1000 }), /at least 30000/u)
  assert.doesNotThrow(() => resolvePolicyConfig({ intervalMs: 30000 }))
  assert.doesNotThrow(() => resolvePolicyConfig({ intervalMs: 0 }))
})

test('policy rejects wrong types and unknown keys', () => {
  assert.throws(() => resolvePolicyConfig({ enableIdle: 'yes' }), /must be a boolean/u)
  assert.throws(() => resolvePolicyConfig({ everyNTurns: 1.5 }), /integer/u)
  assert.throws(() => resolvePolicyConfig({ surprise: 1 }), /unknown config key/u)
})

test('drift fields are validated', () => {
  assert.throws(() => resolvePolicyConfig({ driftThreshold: 1.2 }), /driftThreshold/u)
  assert.throws(() => resolvePolicyConfig({ driftMinChars: -1 }), /driftMinChars/u)
  assert.throws(
    () => resolvePolicyConfig({ driftForceAfterMessages: 1 }),
    /driftForceAfterMessages/u,
  )
  assert.throws(
    () => resolvePolicyConfig({ driftMinNewMessages: 5, driftForceAfterMessages: 3 }),
    /at least driftMinNewMessages/u,
  )
  assert.doesNotThrow(() =>
    resolvePolicyConfig({ driftThreshold: 0.42, driftMinChars: 100 }),
  )
})

test('studio config nests recipe and policy', () => {
  const studio = resolveStudioConfig({
    recipe: { preset: 'action', language: 'zh' },
    policy: { intervalMs: 60000, maxSessionsPerBatch: 3 },
  })
  assert.equal(studio.recipe.preset, 'action')
  assert.equal(studio.recipe.language, 'zh')
  assert.equal(studio.policy.intervalMs, 60000)
  assert.equal(studio.policy.maxSessionsPerBatch, 3)
  assert.ok(Object.isFrozen(studio))

  assert.equal(resolveStudioConfig({}).recipe.preset, 'concise')
  assert.throws(() => resolveStudioConfig({ nope: true }), /unknown config key/u)
  assert.throws(() => resolveStudioConfig({ recipe: { targetWords: 0 } }), /targetWords/u)
})
