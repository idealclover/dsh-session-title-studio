/**
 * Loader schemas for both Session Title Studio plugins.
 *
 * Every field is volatile: the settings service exposes it in the plugin's
 * configuration page, and the plugin re-reads the live references before each
 * use. Semantic validation lives in `config-core.js` so the same rules run at
 * load time and in tests.
 */

import z from '@deepseek-ai/schemastery'
import {
  PRESETS,
  LANGUAGES,
  STABILITY,
  RECIPE_DEFAULTS,
  POLICY_DEFAULTS,
} from './constants.js'

/** Mark one config field live-editable through the settings service. */
const live = (schema) => schema.volatile()

/** Recipe provider config. */
export const RecipeConfig = z.object({
  preset: live(
    z
      .union(PRESETS)
      .default(RECIPE_DEFAULTS.preset)
      .description(
        'Built-in prompt style: concise, action, topic-tags, conventional, or custom.',
      ),
  ),
  systemPrompt: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.systemPrompt)
      .description(
        'Extra instructions appended to the preset prompt, or the complete prompt when preset is custom. Supports {{variables}}.',
      ),
  ),
  userTemplate: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.userTemplate)
      .description(
        'Custom user message. Empty uses JSON framing. Supports {{messages}}, {{transcript}}, {{currentTitle}}, {{firstMessage}}, {{workspace}}, {{date}}, {{messageCount}}.',
      ),
  ),
  language: live(
    z
      .union(LANGUAGES)
      .default(RECIPE_DEFAULTS.language)
      .description('auto, zh, en, or bilingual.'),
  ),
  targetWords: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(50)
      .default(RECIPE_DEFAULTS.targetWords)
      .description('Approximate title length in words for non-CJK text.'),
  ),
  targetCjkCharacters: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(100)
      .default(RECIPE_DEFAULTS.targetCjkCharacters)
      .description('Approximate title length in CJK characters.'),
  ),
  prefix: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.prefix)
      .description('Deterministic text before the model title, e.g. "[dsh] ".'),
  ),
  suffix: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.suffix)
      .description('Deterministic text after the model title, e.g. " · 2026-10-18".'),
  ),
  stability: live(
    z
      .union(STABILITY)
      .default(RECIPE_DEFAULTS.stability)
      .description('How strongly an existing generated title is preserved: strict, balanced, follow.'),
  ),
  maxTitleBytes: live(
    z
      .number()
      .step(1)
      .min(8)
      .max(4096)
      .default(RECIPE_DEFAULTS.maxTitleBytes)
      .description('UTF-8 byte budget for the composed title. The base service may cap lower.'),
  ),
  maxInputBytes: live(
    z
      .number()
      .step(1)
      .min(64)
      .max(1_000_000)
      .default(RECIPE_DEFAULTS.maxInputBytes)
      .description('Maximum UTF-8 bytes of the rendered user input.'),
  ),
  maxOutputTokens: live(
    z
      .number()
      .step(1)
      .min(8)
      .max(32768)
      .default(RECIPE_DEFAULTS.maxOutputTokens)
      .description('Output-token ceiling for the auxiliary title request.'),
  ),
  timeoutMs: live(
    z
      .number()
      .step(1)
      .min(1000)
      .max(600_000)
      .default(RECIPE_DEFAULTS.timeoutMs)
      .description('End-to-end deadline for the auxiliary title request.'),
  ),
  provider: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.provider)
      .description('Optional LLM provider route. Must be paired with model.'),
  ),
  model: live(
    z
      .string()
      .default(RECIPE_DEFAULTS.model)
      .description('Optional LLM model id. Must be paired with provider.'),
  ),
})

/** Refresh policy config. */
export const PolicyConfig = z.object({
  enableIdle: live(
    z
      .boolean()
      .default(POLICY_DEFAULTS.enableIdle)
      .description('Refresh once the conversation has been idle after a turn.'),
  ),
  idleDebounceMs: live(
    z
      .number()
      .step(1000)
      .min(5000)
      .max(3_600_000)
      .default(POLICY_DEFAULTS.idleDebounceMs)
      .description('Idle delay before the idle trigger fires.'),
  ),
  everyNTurns: live(
    z
      .number()
      .step(1)
      .min(0)
      .max(100)
      .default(POLICY_DEFAULTS.everyNTurns)
      .description('Refresh after N new human messages. 0 disables this trigger.'),
  ),
  intervalMs: live(
    z
      .number()
      .step(1000)
      .min(0)
      .max(86_400_000)
      .default(POLICY_DEFAULTS.intervalMs)
      .description('Sweep active sessions on this interval. 0 disables the sweep.'),
  ),
  activeWindowMs: live(
    z
      .number()
      .step(1000)
      .min(60_000)
      .max(86_400_000)
      .default(POLICY_DEFAULTS.activeWindowMs)
      .description('Only sweep sessions active within this window.'),
  ),
  minIntervalMs: live(
    z
      .number()
      .step(1000)
      .min(0)
      .max(3_600_000)
      .default(POLICY_DEFAULTS.minIntervalMs)
      .description('Minimum delay between automatic refreshes of one session.'),
  ),
  maxRefreshesPerSessionPerDay: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(1000)
      .default(POLICY_DEFAULTS.maxRefreshesPerSessionPerDay)
      .description('Automatic refresh budget per session per local day.'),
  ),
  maxSessionsPerSweep: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(100)
      .default(POLICY_DEFAULTS.maxSessionsPerSweep)
      .description('Maximum sessions refreshed by one interval sweep.'),
  ),
  maxSessionsPerBatch: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(100)
      .default(POLICY_DEFAULTS.maxSessionsPerBatch)
      .description('Maximum live sessions handled by one /title rebuild all run.'),
  ),
  includeSubagents: live(
    z
      .boolean()
      .default(POLICY_DEFAULTS.includeSubagents)
      .description('Also refresh titles of subagent sessions.'),
  ),
  respectPinned: live(
    z
      .boolean()
      .default(POLICY_DEFAULTS.respectPinned)
      .description('Never overwrite a title the user renamed manually.'),
  ),
  refreshTimeoutMs: live(
    z
      .number()
      .step(1000)
      .min(5000)
      .max(600_000)
      .default(POLICY_DEFAULTS.refreshTimeoutMs)
      .description('Caller-side deadline for one refresh.'),
  ),
  enableDrift: live(
    z
      .boolean()
      .default(POLICY_DEFAULTS.enableDrift)
      .description('Only refresh when recent human messages have drifted from the title topic.'),
  ),
  driftThreshold: live(
    z
      .number()
      .step(0.01)
      .min(0)
      .max(1)
      .default(POLICY_DEFAULTS.driftThreshold)
      .description('Required drift score (0-1) before an automatic refresh.'),
  ),
  driftMinNewMessages: live(
    z
      .number()
      .step(1)
      .min(1)
      .max(20)
      .default(POLICY_DEFAULTS.driftMinNewMessages)
      .description('Minimum new human messages before drift is judged.'),
  ),
  driftForceAfterMessages: live(
    z
      .number()
      .step(1)
      .min(2)
      .max(100)
      .default(POLICY_DEFAULTS.driftForceAfterMessages)
      .description('Refresh regardless of drift after this many new messages.'),
  ),
  driftWindowMessages: live(
    z
      .number()
      .step(1)
      .min(2)
      .max(50)
      .default(POLICY_DEFAULTS.driftWindowMessages)
      .description('Recent messages considered by the drift comparison.'),
  ),
  driftMinChars: live(
    z
      .number()
      .step(1)
      .min(0)
      .max(2000)
      .default(POLICY_DEFAULTS.driftMinChars)
      .description('Minimum recent text length before drift is judged.'),
  ),
})
