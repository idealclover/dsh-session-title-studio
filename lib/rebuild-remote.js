/** Owner-only, authenticated session-independent maintenance endpoints.
 * Connection owns Host/Origin checks, browser authentication, request limits,
 * and rejects non-owner peers before dispatching Fetch contributions.
 */
export function mountRebuildRemote(ctx, rebuild) {
  if (typeof ctx.inject !== 'function') return // Headless hosts and test doubles.
  ctx.inject(['connection'], (webCtx) => {
    for (const method of ['preview', 'start', 'status', 'cancel', 'synchronize', 'regenerate']) {
      webCtx.connection.fetch.register({
        path: `/api/session-title-studio/${method}`,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          const headers = { 'Cache-Control': 'no-store' }
          const reject = (message, status = 400) =>
            Response.json({ ok: false, error: { message } }, { status, headers })
          const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
          if (type !== 'application/json') return reject('Expected application/json.', 415)
          let input
          try { input = await request.json() } catch { return reject('Invalid JSON body.') }
          if (input === null || typeof input !== 'object' || Array.isArray(input)) {
            return reject('Expected an object.')
          }
          const fields = {
            preview: ['force', 'scope'], start: ['previewId'], status: [], cancel: ['jobId'], synchronize: [], regenerate: ['sessionId', 'force'],
          }[method]
          if (Object.keys(input).some((key) => !fields.includes(key))) {
            return reject('Unknown request field.')
          }
          try {
            const value = method === 'preview' || method === 'synchronize' || method === 'regenerate'
              ? await rebuild[method](input, request.signal) : await rebuild[method](input)
            return Response.json({ ok: true, value }, { headers })
          } catch (error) {
            return reject(error instanceof Error ? error.message : String(error))
          }
        },
      })
    }
  })
}
