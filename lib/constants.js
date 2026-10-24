/**
 * Shared constants and defaults for Session Title Studio.
 *
 * This module is pure: no Cordis, no filesystem, no network. Both the Host
 * plugins and the standalone tests import it.
 */

/** Named built-in prompt styles. `custom` uses `systemPrompt` verbatim. */
export const PRESETS = ['concise', 'action', 'topic-tags', 'conventional', 'custom']

/** Supported title languages. */
export const LANGUAGES = ['auto', 'zh', 'en', 'bilingual']

/** How strongly an existing generated title is preserved. */
export const STABILITY = ['strict', 'balanced', 'follow']

/** Refresh reasons understood by the policy decision function. */
export const TRIGGER_REASONS = ['manual', 'idle', 'every-n-turns', 'interval']

/** Variables accepted by `systemPrompt` and `userTemplate`. */
export const TEMPLATE_VARIABLES = [
  'messages',
  'transcript',
  'currentTitle',
  'firstMessage',
  'workspace',
  'date',
  'messageCount',
]

/** Defaults for the recipe provider. */
export const RECIPE_DEFAULTS = Object.freeze({
  preset: 'concise',
  systemPrompt: '',
  userTemplate: '',
  language: 'auto',
  targetWords: 5,
  targetCjkCharacters: 10,
  prefix: '',
  suffix: '',
  stability: 'balanced',
  maxTitleBytes: 80,
  maxInputBytes: 4096,
  maxOutputTokens: 1024,
  timeoutMs: 60000,
  provider: '',
  model: '',
})

/** Defaults for the refresh policy. */
export const POLICY_DEFAULTS = Object.freeze({
  enableIdle: true,
  idleDebounceMs: 180000,
  everyNTurns: 4,
  intervalMs: 0,
  activeWindowMs: 1800000,
  minIntervalMs: 120000,
  maxRefreshesPerSessionPerDay: 12,
  maxSessionsPerSweep: 5,
  includeSubagents: false,
  respectPinned: true,
  refreshTimeoutMs: 90000,
  enableDrift: true,
  driftThreshold: 0.6,
  driftMinNewMessages: 1,
  driftForceAfterMessages: 6,
  driftWindowMessages: 12,
  driftMinChars: 24,
  maxSessionsPerBatch: 10,
})

/** Byte budget the base session-title service accepts by default. */
export const BASE_TITLE_BYTE_CAP = 80
