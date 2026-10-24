import test from 'node:test'
import assert from 'node:assert/strict'

// The schema module imports the Host's Schemastery. Standalone test runs do
// not have it, so these tests skip instead of failing the pure suite.
let RecipeConfig
let PolicyConfig
let StudioConfig
let unavailable
try {
  ;({ RecipeConfig, PolicyConfig } = await import('../lib/schema.js'))
  ;({ Config: StudioConfig } = await import('../lib/studio.js'))
} catch (error) {
  unavailable = error instanceof Error ? error.message : String(error)
}

const skip =
  RecipeConfig === undefined ? `Host schema unavailable: ${unavailable}` : false

test('recipe schema makes every field volatile', { skip }, () => {
  const raw = RecipeConfig({})
  for (const key of [
    'preset',
    'systemPrompt',
    'userTemplate',
    'language',
    'prefix',
    'maxTitleBytes',
    'model',
  ]) {
    assert.equal(typeof raw[key].get, 'function', `${key} is not volatile`)
  }
  assert.equal(raw.preset.get(), 'concise')
  assert.equal(raw.maxTitleBytes.get(), 80)
  assert.equal(raw.language.get(), 'auto')
})

test('policy schema makes drift fields volatile', { skip }, () => {
  const raw = PolicyConfig({})
  assert.equal(typeof raw.enableDrift.get, 'function')
  assert.equal(raw.enableDrift.get(), true)
  assert.equal(raw.driftThreshold.get(), 0.6)
  assert.equal(raw.driftMinNewMessages.get(), 1)
  assert.equal(raw.driftForceAfterMessages.get(), 6)
})

test('merged schema nests volatile recipe and policy sections', { skip }, () => {
  const raw = StudioConfig({})
  assert.equal(typeof raw.recipe.preset.get, 'function')
  assert.equal(raw.recipe.preset.get(), 'concise')
  assert.equal(typeof raw.policy.driftThreshold.get, 'function')
  assert.equal(raw.policy.driftThreshold.get(), 0.6)
})
