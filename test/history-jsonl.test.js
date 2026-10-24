import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

let runtime
let unavailable
try {
  const [cordis, session, llm, jsonl, title, history] = await Promise.all([
    import('@deepseek-ai/cordis'), import('@deepseek-ai/dsh-session'),
    import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-session-persistence-jsonl'),
    import('@deepseek-ai/dsh-session-title'), import('../lib/history.js'),
  ])
  runtime = { ...cordis, ...session, ...llm, jsonl, ...title, ...history }
} catch (error) {
  // Missing host packages are optional; broken installed APIs must fail.
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
  unavailable = error.message
}

async function boundedDispose(ctx) {
  let timer
  try {
    await Promise.race([
      ctx.fiber.dispose(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Context cleanup timed out')), 5000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

test('real JSONL cold preview is read-only and rebuild durably appends under ownership', {
  skip: !runtime && `Host dependencies unavailable: ${unavailable}`,
  timeout: 20000,
}, async (t) => {
  const { Context, Session, SessionStore, createUserMessage, jsonl,
    foldSessionTitle, createHistoryAdapter } = runtime
  const tempParent = resolve(tmpdir())
  const prefix = 'dsh-title-history-jsonl-'
  const temp = await mkdtemp(join(tempParent, prefix))
  const ctx = new Context()
  t.after(async () => {
    try {
      await boundedDispose(ctx)
    } finally {
      // Delete only the unique direct child created above, never a profile/root.
      const target = resolve(temp)
      assert.equal(dirname(target), tempParent)
      assert.ok(basename(target).startsWith(prefix))
      assert.notEqual(target, tempParent)
      await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 10 })
    }
  })

  await ctx.plugin(SessionStore)
  const config = jsonl.Config({
    root: join(temp, 'sessions'), compression: 'none', listConcurrency: 1,
  })
  await ctx.plugin({ ...jsonl, inject: ['sessions'] }, config)
  const persistence = ctx.get('sessionPersistence')
  assert.ok(persistence)
  assert.deepEqual(ctx.sessions.list(), [])

  const id = 'cold-jsonl-history'
  const session = Session.create(id, undefined, {
    version: runtime.SESSION_FORMAT_VERSION, id, createdAt: Date.now(), cwd: temp, isSeeded: false,
  })
  const originalEvents = [
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '请为历史会话重建标题。\nKeep this user content unchanged.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' }),
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Also verify the persisted audit and writer ownership.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' }),
    session.append('session/title', {
      title: 'Original stored title', messageSeqs: [0, 1],
      source: { kind: 'provider', provider: 'fixture' },
    }),
  ]
  // Deliberately omit end-seed: fromRestore would otherwise add it implicitly.
  assert.notEqual(originalEvents.at(-1).type, 'session/end-seed')
  const created = await persistence.create(session.header)
  try {
    await created.append(originalEvents)
    await created.flush()
  } finally {
    await created.close()
  }
  const artifact = persistence.locate(session.header).path
  const before = await readFile(artifact)
  let modelCalls = 0
  const adapter = createHistoryAdapter(ctx, {
    policy: () => ({ includeSubagents: false }),
    inputCountOf: () => assert.fail('A cold fixture must never be counted as live'),
    refreshLive: () => assert.fail('A cold rebuild must never use the live path'),
    async generate({ session: detached, messages, currentTitle }) {
      modelCalls += 1
      assert.equal(detached.id, id)
      assert.equal(currentTitle.title, 'Original stored title')
      assert.deepEqual(messages, originalEvents.slice(0, 2).map((event) => ({
        seq: event.seq, text: event.data.content[0].text,
      })))
      assert.equal(ctx.sessions.get(id), undefined)
      assert.deepEqual(ctx.sessions.list(), [])
      await assert.rejects(persistence.open(id, 'write'), { name: 'SessionAlreadyOwnedError' },
        'The adapter must hold ownership throughout generation')
      detached.append('session/title-llm-request', {
        titleProvider: 'session-title-studio', messageSeqs: [0, 1],
        route: { provider: 'test', model: 'stub' }, system: 'Generate a title',
        messages: [createUserMessage({
          content: [{ type: 'text', text: messages.map((message) => message.text).join('\n\n') }],
          source: { kind: 'dsh-session-title-llm' },
        })], maxTokens: 64,
      })
      return { title: 'Rebuilt cold JSONL title', messageSeqs: [0, 1],
        model: { provider: 'test', model: 'stub' } }
    },
  })

  const heldWriter = await persistence.open(id, 'write')
  let target
  try {
    // Preview must neither acquire nor release this existing writer's lock.
    const preview = await adapter.enumerate()
    assert.equal(preview.stored, 1)
    assert.deepEqual(preview.unreadable, [])
    assert.equal(preview.empty, 0)
    assert.equal(preview.children, 0)
    assert.equal(preview.entries.length, 1)
    target = preview.entries[0]
    assert.equal(target.id, id)
    assert.equal(target.live, false)
    assert.equal(target.pinned, false)
    assert.equal(target.title, 'Original stored title')
    assert.equal(modelCalls, 0)
    assert.deepEqual(await readFile(artifact), before, 'Preview must not change stored bytes')
    const blocked = await adapter.refresh(target, { force: true, signal: new AbortController().signal })
    assert.deepEqual(blocked, { ok: false, skip: 'owned-elsewhere' })
    assert.equal(modelCalls, 0)
    await assert.rejects(persistence.open(id, 'write'), { name: 'SessionAlreadyOwnedError' },
      'A skipped rebuild must not release another owner')
    assert.deepEqual((await heldWriter.read()).events, originalEvents)
    assert.deepEqual(await readFile(artifact), before)
  } finally {
    await heldWriter.close()
  }

  const result = await adapter.refresh(target, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, true, result.error?.stack)
  assert.equal(modelCalls, 1)
  assert.equal(result.snapshot.title, 'Rebuilt cold JSONL title')
  assert.equal(ctx.sessions.get(id), undefined)
  assert.deepEqual(ctx.sessions.list(), [])
  assert.notDeepEqual(await readFile(artifact), before)

  // A fresh writer proves release; read persisted events, not the return value.
  const reopened = await persistence.open(id, 'write')
  try {
    const { events } = await reopened.read()
    assert.deepEqual(events.slice(0, originalEvents.length), originalEvents,
      'Existing user content and title events must remain untouched')
    assert.deepEqual(events.filter((event) => event.type === 'user/message'), originalEvents.slice(0, 2))
    assert.deepEqual(events.map((event) => event.seq), [0, 1, 2, 3, 4, 5],
      'The restored boundary must be persisted before generated events, with no seq gap')
    assert.deepEqual(events.slice(originalEvents.length).map((event) => event.type),
      ['session/end-seed', 'session/title-llm-request', 'session/title'])
    assert.deepEqual(events[4].data.messageSeqs, [0, 1])
    const folded = foldSessionTitle(events)
    assert.equal(folded.title, 'Rebuilt cold JSONL title')
    assert.deepEqual(folded.messageSeqs, [0, 1])
    assert.equal(folded.source.kind, 'provider')
    assert.equal(folded.source.provider, 'session-title-studio')
    assert.deepEqual(folded.source.model, { provider: 'test', model: 'stub' })
    assert.equal(events.at(-1).seq, result.snapshot.eventSeq)
    assert.deepEqual(events.at(-1).data, {
      title: result.snapshot.title, messageSeqs: result.snapshot.messageSeqs,
      source: result.snapshot.source,
    })
  } finally {
    await reopened.close()
  }
})
