/** Keep auxiliary title calls independent of optional full-log upload fields. */
export function mountTitleRequestIsolation(ctx) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['sessionLogDeepSeek'], (scope) => {
    const service = scope.sessionLogDeepSeek
    // Older Hosts may have the service without the public exclusion API.
    // Do not change their global upload setting or remove request attribution.
    if (typeof service.registerExclusion !== 'function') {
      scope.logger?.warn?.('session-title-studio: this Host cannot exclude title requests from DeepSeek session-log uploads; upgrade DSH if auxiliary requests exceed the context window')
      return
    }
    // Keep the returned asynchronous disposer in the injecting plugin's scope,
    // even on Hosts where registration itself is owned by the service's scope.
    scope.effect(() => service.registerExclusion((request) => request.purpose === 'session-title'))
  })
}
