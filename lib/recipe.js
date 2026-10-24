/** Title recipe shared by automatic live titles and detached history rebuilds. */
import { SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'
import { executeSessionTitleLlm, resolveSessionTitleLlmConfig } from '@deepseek-ai/dsh-session-title-llm'
import { RecipeConfig } from './schema.js'
import { resolveRecipeConfig } from './config-core.js'
import { finishTitle, parseTitleOutput } from './prompt.js'
import { prepareTitleInput } from './input-budget.js'

export const name = 'session-title-studio'
export const inject = ['sessionTitle', 'llm', 'sessions']
export { RecipeConfig as Config }
const selectReasoningEffort = (model) => model.reasoning?.efforts?.[0]?.id

export function apply(ctx, config) {
  let lastGood = resolveRecipeConfig(config)
  const current = () => {
    try { lastGood = resolveRecipeConfig(config) }
    catch (error) {
      ctx.logger?.warn?.(`session-title-studio: keeping the last valid recipe: ${error.message}`)
    }
    return lastGood
  }
  const providerId = SessionTitleProviderId(name)
  const generate = async (request) => {
    const resolved = current()
    const hasRoute = resolved.provider.length > 0 && resolved.model.length > 0
    const execution = resolveSessionTitleLlmConfig({
      maxInputBytes: resolved.maxInputBytes,
      maxOutputTokens: resolved.maxOutputTokens,
      timeoutMs: resolved.timeoutMs,
      ...(hasRoute ? { provider: resolved.provider, model: resolved.model } : {}),
    })
    const anchor = request.currentTitle?.source?.kind === 'provider'
      ? request.currentTitle.title : undefined
    const prepared = prepareTitleInput(resolved, request, anchor)
    const response = await executeSessionTitleLlm(ctx, execution, request, providerId, {
      system: prepared.system, input: prepared.input,
      messageSeqs: prepared.messageSeqs, selectReasoningEffort,
    })
    return {
      title: finishTitle(parseTitleOutput(response), resolved),
      messageSeqs: prepared.messageSeqs,
      model: response.model,
    }
  }
  try {
    ctx.sessionTitle.register({ id: providerId, automatic: 'first-prompt', generate })
  } catch (error) {
    throw new Error('session-title-studio: could not register the title provider. ' +
      'Disable competing title-provider bundles first. ' +
      (error instanceof Error ? error.message : String(error)))
  }
  return generate
}
