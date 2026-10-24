/**
 * Session Title Studio bundle entry — one merged component.
 *
 * The bundle patch mounts a single row (`session-title-studio`) whose config is
 * `{ recipe, policy }`. The recipe provider and refresh policy remain separate
 * modules internally, composed by `lib/studio.js`.
 */

export { apply, inject, name, Config } from './lib/studio.js'
export { resolveStudioConfig } from './lib/config-core.js'
export {
  PRESETS,
  LANGUAGES,
  STABILITY,
  RECIPE_DEFAULTS,
  POLICY_DEFAULTS,
} from './lib/constants.js'
