import test from 'node:test'
import assert from 'node:assert/strict'
import { mountTitleRequestIsolation } from '../lib/request-isolation.js'

// Pure coverage also exercises late arrival and unsupported older Hosts.
test('title log exclusion is optional, narrow, and owned by the injecting scope', async () => {
  mountTitleRequestIsolation({})
  let arrive
  mountTitleRequestIsolation({ inject(names, callback) {
    assert.deepEqual(names, ['sessionLogDeepSeek'])
    arrive = callback
  } })
  let rule
  let releases = 0
  let release
  arrive({
    sessionLogDeepSeek: { registerExclusion(predicate) {
      rule = predicate
      return async () => { releases += 1 }
    } },
    effect(body) { release = body() },
  })
  assert.equal(rule({ sessionId: 'same-session', purpose: 'session-title' }), true)
  for (const purpose of [undefined, 'agent', 'summarize', 'session-title-other']) {
    assert.equal(rule({ sessionId: 'same-session', purpose }), false)
  }
  assert.equal(typeof release, 'function')
  await release()
  assert.equal(releases, 1)
  let warning
  arrive({ sessionLogDeepSeek: {}, logger: { warn: (text) => { warning = text } } })
  assert.match(warning, /upgrade DSH/u)
})

let runtime
let unavailable
try {
  const [cordis, sessions, llm, extensions, logs] = await Promise.all([
    import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-deepseek-llm-api-extensions'),
    import('@deepseek-ai/dsh-session-log-deepseek'),
  ])
  runtime = { ...cordis, ...sessions, ...llm, ...extensions, logs }
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
  unavailable = error.message
}

test('real DeepSeek extension omits multi-MiB history only for title calls and releases on unload', {
  skip: !runtime && `Host dependencies unavailable: ${unavailable}`,
  timeout: 15000,
}, async (t) => {
  const { Context, SessionStore, createUserMessage, DeepSeekLlmApiExtensionRegistry, logs } = runtime
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(DeepSeekLlmApiExtensionRegistry)
  const owner = await ctx.plugin({ name: 'title-isolation-fixture', apply: mountTitleRequestIsolation })
  // Register after the consumer to verify optional injection on late service arrival.
  const service = await ctx.plugin(logs, { enabled: true, maxBytes: 8 * 1024 * 1024 })
  const session = ctx.sessions.create('same-session')
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'x'.repeat(6 * 1024 * 1024) }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const original = session.seq
  const body = { model: 'deepseek-flash', max_tokens: 1024,
    system: 'Return a title.', messages: [{ role: 'user', content: 'Small excerpt' }] }
  const prepare = (purpose) => ctx.deepseekLlmApiExtensions.prepare({
    body, sessionId: session.id, purpose, signal: new AbortController().signal,
  })
  const snapshotEvents = session.snapshotEvents
  const eventAt = session.eventAt
  let historyReads = 0
  session.snapshotEvents = function (...args) { historyReads += 1; return snapshotEvents.apply(this, args) }
  session.eventAt = function (...args) { historyReads += 1; return eventAt.apply(this, args) }
  const title = await prepare('session-title')
  assert.equal(historyReads, 0, 'exclude before scanning either history or upload watermarks')
  session.snapshotEvents = snapshotEvents
  session.eventAt = eventAt
  assert.deepEqual(Object.keys(title.fields), [])
  assert.ok(Buffer.byteLength(JSON.stringify({ ...body, ...title.fields })) < 4096)
  await title.accept()
  assert.equal(session.seq, original, 'excluded requests must not advance upload acceptance')

  const main = await prepare(undefined)
  assert.ok(Buffer.byteLength(JSON.stringify(main.fields.dsh_session_log)) > 6 * 1024 * 1024)
  assert.equal(main.fields.dsh_session_log.afterSeq, -1)
  assert.equal(main.fields.dsh_session_log.throughSeq, original - 1)
  const other = await prepare('other-auxiliary')
  assert.ok(other.fields.dsh_session_log, 'do not exclude every auxiliary call')

  // Disposing only this plugin must release its rule while the service stays live.
  await owner.dispose()
  const afterUnload = await prepare('session-title')
  assert.ok(afterUnload.fields.dsh_session_log)
  assert.equal(session.seq, original)
  await main.accept()
  await main.accept()
  assert.equal(session.seq, original + 1, 'normal upload acceptance is unchanged and idempotent')
  assert.equal(session.eventAt(original).type, 'session-log-deepseek/delivery-accepted')

  // Service remount must reapply the optional consumer without leaking old rules.
  await ctx.plugin({ name: 'title-isolation-remount-fixture', apply: mountTitleRequestIsolation })
  await service.dispose()
  await ctx.plugin(logs, { enabled: true })
  assert.deepEqual(Object.keys((await prepare('session-title')).fields), [])
})
