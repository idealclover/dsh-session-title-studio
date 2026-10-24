/**
 * Validation and defaulting for both plugin configs.
 *
 * Pure module: no Cordis dependency, so `node --test` can exercise the same
 * validation the Host runs at load time.
 */

import {
  PRESETS,
  LANGUAGES,
  STABILITY,
  RECIPE_DEFAULTS,
  POLICY_DEFAULTS,
} from './constants.js'
import { findUnknownVariables } from './prompt.js'

const RECIPE_KEYS = new Set(Object.keys(RECIPE_DEFAULTS))
const POLICY_KEYS = new Set(Object.keys(POLICY_DEFAULTS))

/** Human-readable plugin error. */
function fail(message) {
  throw new Error(`session-title-studio: ${message}`)
}

/** Read a live config field, which may be a Schemastery volatile reference. */
function unwrap(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function'
    ? value.get()
    : value
}

/** Merge raw config over defaults, dropping absent values. */
function mergeConfig(raw, defaults, keys) {
  if (raw === undefined || raw === null) return { ...defaults }
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('configuration must be an object')
  const merged = { ...defaults }
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.has(key)) fail(`unknown config key "${key}"`)
    const plain = unwrap(value)
    if (plain !== undefined && plain !== null) merged[key] = plain
  }
  return merged
}

function assertEnum(name, value, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(`${name} must be one of ${allowed.map((item) => `"${item}"`).join(', ')}`)
  }
}

function assertString(name, value, maxLength = 4096) {
  if (typeof value !== 'string') fail(`${name} must be a string`)
  if (value.length > maxLength) fail(`${name} must be at most ${maxLength} characters`)
}

function assertInteger(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}`)
  }
}

function assertBoolean(name, value) {
  if (typeof value !== 'boolean') fail(`${name} must be a boolean`)
}

function assertNumber(name, value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(`${name} must be a number between ${min} and ${max}`)
  }
}

/**
 * Validate one free-form prompt field and return it trimmed.
 * @param {string} name - Config key for diagnostics.
 * @param {unknown} value - Raw field.
 * @param {number} maxLength - Maximum character count.
 * @returns {string} Trimmed prompt text.
 */
function resolvePromptField(name, value, maxLength) {
  assertString(name, value, maxLength)
  const unknown = findUnknownVariables(value)
  if (unknown.length > 0) {
    fail(`${name} uses unsupported variables: ${unknown.map((item) => `{{${item}}}`).join(', ')}`)
  }
  return value
}

/**
 * Validate and detach the recipe provider config.
 * @param {unknown} raw - Loader-provided config.
 * @returns {Readonly<object>} Resolved immutable config.
 */
export function resolveRecipeConfig(raw) {
  const config = mergeConfig(raw, RECIPE_DEFAULTS, RECIPE_KEYS)

  assertEnum('preset', config.preset, PRESETS)
  assertEnum('language', config.language, LANGUAGES)
  assertEnum('stability', config.stability, STABILITY)
  assertInteger('targetWords', config.targetWords, 1, 50)
  assertInteger('targetCjkCharacters', config.targetCjkCharacters, 1, 100)
  assertInteger('maxTitleBytes', config.maxTitleBytes, 8, 4096)
  assertInteger('maxInputBytes', config.maxInputBytes, 64, 1_000_000)
  assertInteger('maxOutputTokens', config.maxOutputTokens, 8, 32768)
  assertInteger('timeoutMs', config.timeoutMs, 1000, 600_000)

  assertString('prefix', config.prefix, 200)
  assertString('suffix', config.suffix, 200)
  assertString('provider', config.provider, 200)
  assertString('model', config.model, 200)

  const hasProvider = config.provider.length > 0
  const hasModel = config.model.length > 0
  if (hasProvider !== hasModel) fail('provider and model must be configured together')

  config.systemPrompt = resolvePromptField('systemPrompt', config.systemPrompt, 8000)
  config.userTemplate = resolvePromptField('userTemplate', config.userTemplate, 8000)

  if (config.preset === 'custom' && config.systemPrompt.trim().length === 0) {
    fail('preset "custom" requires a non-empty systemPrompt')
  }

  return Object.freeze(config)
}

/**
 * Validate and detach the refresh policy config.
 * @param {unknown} raw - Loader-provided config.
 * @returns {Readonly<object>} Resolved immutable config.
 */
export function resolvePolicyConfig(raw) {
  const config = mergeConfig(raw, POLICY_DEFAULTS, POLICY_KEYS)

  for (const key of [
    'enableIdle',
    'includeSubagents',
    'respectPinned',
    'enableDrift',
  ]) {
    assertBoolean(key, config[key])
  }

  assertInteger('idleDebounceMs', config.idleDebounceMs, 5000, 3_600_000)
  assertInteger('everyNTurns', config.everyNTurns, 0, 100)
  assertInteger('intervalMs', config.intervalMs, 0, 86_400_000)
  if (config.intervalMs !== 0 && config.intervalMs < 30_000) {
    fail('intervalMs must be 0 (disabled) or at least 30000')
  }
  assertInteger('activeWindowMs', config.activeWindowMs, 60_000, 86_400_000)
  assertInteger('minIntervalMs', config.minIntervalMs, 0, 3_600_000)
  assertInteger('maxRefreshesPerSessionPerDay', config.maxRefreshesPerSessionPerDay, 1, 1000)
  assertInteger('maxSessionsPerSweep', config.maxSessionsPerSweep, 1, 100)
  assertInteger('maxSessionsPerBatch', config.maxSessionsPerBatch, 1, 100)
  assertInteger('refreshTimeoutMs', config.refreshTimeoutMs, 5000, 600_000)

  assertNumber('driftThreshold', config.driftThreshold, 0, 1)
  assertInteger('driftMinNewMessages', config.driftMinNewMessages, 1, 20)
  assertInteger('driftForceAfterMessages', config.driftForceAfterMessages, 2, 100)
  if (config.driftForceAfterMessages < config.driftMinNewMessages) {
    fail('driftForceAfterMessages must be at least driftMinNewMessages')
  }
  assertInteger('driftWindowMessages', config.driftWindowMessages, 2, 50)
  assertInteger('driftMinChars', config.driftMinChars, 0, 2000)

  return Object.freeze(config)
}

const STUDIO_KEYS = new Set(['recipe', 'policy'])

/**
 * Validate and detach the merged plugin config.
 * @param {unknown} raw - Loader-provided nested config.
 * @returns {Readonly<{recipe: object, policy: object}>} Resolved sections.
 */
export function resolveStudioConfig(raw) {
  const value = raw === undefined || raw === null ? {} : raw
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail('configuration must be an object')
  }
  for (const key of Object.keys(value)) {
    if (!STUDIO_KEYS.has(key)) fail(`unknown config key "${key}"`)
  }
  return Object.freeze({
    recipe: resolveRecipeConfig(value.recipe),
    policy: resolvePolicyConfig(value.policy),
  })
}
