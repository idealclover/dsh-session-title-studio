/**
 * Session Title Studio — merged plugin entry.
 *
 * One profile row owns both halves:
 *   - the recipe provider (how a title is generated)
 *   - the refresh policy (when it is regenerated, including batch rebuild)
 *
 * The implementation still lives in two modules; this entry is the single
 * composition root, so the plugin page shows one component and the settings
 * page reads one nested config.
 */

import z from '@deepseek-ai/schemastery'
import { RecipeConfig, PolicyConfig } from './schema.js'
import { resolveStudioConfig } from './config-core.js'
import * as recipe from './recipe.js'
import * as policy from './policy.js'

export const name = 'session-title-studio'
export const inject = [
  'sessionTitle',
  'llm',
  'sessions',
  'sessionProjections',
  'timer',
  'commands',
]

/** One nested config: `{ recipe, policy }`. */
export const Config = z.object({
  recipe: RecipeConfig,
  policy: PolicyConfig,
})

/**
 * Mount both halves from one row.
 * @param {object} ctx - Cordis context with the union of both inject sets.
 * @param {{recipe?: object, policy?: object}} [config] - Nested loader config.
 */
export function apply(ctx, config) {
  const raw = config ?? {}
  // Fail loud on the whole row before registering anything.
  resolveStudioConfig(raw)
  const generate = recipe.apply(ctx, raw.recipe)
  policy.apply(ctx, raw.policy, { generate })
  // This package ships a ready-to-serve plain-JS Client artifact. Publish its
  // current revision when the linked bundle is explicitly reactivated; no
  // file watcher or replacement Web server is needed.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['clientModules'], (webCtx) => {
      webCtx.clientModules.rebuilt('@idealclover/dsh-session-title-studio')
    })
  }
}
