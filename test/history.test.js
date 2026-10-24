import test from 'node:test'
import assert from 'node:assert/strict'
let runtime
try {
  const [{ Session }, { createUserMessage }, { createHistoryAdapter }] = await Promise.all([
    import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-llm'), import('../lib/history.js'),
  ])
  runtime = { Session, createUserMessage, createHistoryAdapter }
} catch { /* Host packages are optional in a standalone checkout. */ }
const skip = !runtime && 'Host dependencies unavailable'

function fixture(options = {}) {
  const { Session, createUserMessage, createHistoryAdapter } = runtime
  const sessions = new Map()
  const db = new Map()
  const writes = []
  const closes = []
  const notifications = []
  const checkpoints = []
  const eventsOf = (id, pinned = false) => {
    const s = Session.create(id)
    const events = [s.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '历史会话标题生成测试' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })]
    if (pinned) events.push(s.append('session/title', {
      title: '手动标题', messageSeqs: [], source: { kind: 'user' },
    }))
    return { header: s.header, events, locked: false }
  }
  db.set('cold', eventsOf('cold', options.pinned))
  const store = {
    list: async () => [...db.values()].map((entry) => ({ header: entry.header })),
    async open(id, access) {
      const row = db.get(id)
      if (access === 'write' && row.locked) {
        throw Object.assign(new Error('writer held'), { name: 'SessionAlreadyOwnedError', sessionId: id })
      }
      if (access === 'write') row.locked = true
      return {
        id, header: row.header, inheritedEventCount: 0,
        read: async () => ({ events: row.events, eventState: 'shared-frozen' }),
        append: async (events) => {
          assert.equal(events[0].seq, row.events.length)
          writes.push(...events)
          row.events = [...row.events, ...events]
        },
        flush: async () => { if (options.flushFails) throw new Error('flush failed') },
        close: async () => { if (access === 'write') row.locked = false; closes.push(access) },
      }
    },
  }
  let modelCalls = 0
  let liveCalls = 0
  const ctx = {
    get: (name) => name === 'sessionPersistence' ? store : name === 'sessionProjectionCache' && options.publication ? {
      write: async (session) => {
        assert.equal(db.get(session.id).locked, true, 'cache repair must finish while writer ownership is held')
        assert.equal(db.get(session.id).events.at(-1).type, 'session/title')
        checkpoints.push(session.id)
      },
    } : undefined,
    sessions: { list: () => [...sessions.values()], get: (id) => sessions.get(id), messageProjections: [] },
    sessionTitle: { get: () => undefined },
    ...(options.publication ? {
      sessionProjections: { snapshot: (session) => ({ asOfSeq: session.seq - 1, values: {
        title: db.get(session.id).events.at(-1).data.title,
        sessionListMetadata: { blank: false, lastPromptAt: 100 },
      } }) },
      emit: (name, summary) => {
        assert.equal(db.get(summary.sessionId).locked, false, 'push occurs after ownership closes')
        notifications.push({ name, summary })
      },
    } : {}),
  }
  const adapter = createHistoryAdapter(ctx, {
    generate: async (request) => {
      modelCalls += 1
      assert.equal(ctx.sessions.list().length, 0, 'cold generator must not publish a session')
      assert.equal(db.get('cold').locked, true, 'writer lock spans generation')
      request.session.append('session/title-llm-request', {
        titleProvider: 'session-title-studio', messageSeqs: [0],
        route: { provider: 'test', model: 'cheap' }, system: 'Title this', messages: [], maxTokens: 64,
      })
      if (options.generateFails) throw new Error('model failed')
      if (options.abort) options.abort.abort(new Error('cancelled'))
      return { title: '重建的历史标题', messageSeqs: [0], model: { provider: 'test', model: 'cheap' } }
    },
    refreshLive: async () => { liveCalls += 1; return { ok: true, snapshot: { title: 'live' } } },
    inputCountOf: () => 1,
    policy: () => ({ includeSubagents: false }),
  })
  return { adapter, db, writes, closes, sessions, notifications, checkpoints,
    calls: () => ({ modelCalls, liveCalls }) }
}

test('cold preview reads only; cold generation appends valid contiguous events and releases lock', { skip }, async () => {
  const h = fixture()
  const preview = await h.adapter.enumerate()
  assert.equal(preview.entries[0].live, false)
  assert.equal(h.calls().modelCalls, 0)
  assert.equal(h.writes.length, 0)
  const result = await h.adapter.refresh(preview.entries[0], { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, true)
  assert.deepEqual(h.writes.map((event) => event.type), ['session/end-seed', 'session/title-llm-request', 'session/title'])
  assert.deepEqual(h.writes.map((event) => event.seq), [1, 2, 3])
  assert.equal(h.db.get('cold').locked, false)
  assert.equal(h.sessions.size, 0)
  const restored = runtime.Session.fromRestore('cold', h.db.get('cold').events,
    h.db.get('cold').header, 0, 'shared-frozen', [])
  assert.equal(restored.seq, 5) // a fresh detached restore adds its own end-seed boundary
})

test('pins are rechecked under lock and protected unless forced', { skip }, async () => {
  const h = fixture({ pinned: true })
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.skip, 'pinned')
  assert.equal(h.calls().modelCalls, 0)
  assert.equal(h.db.get('cold').locked, false)
  assert.equal((await h.adapter.refresh({ id: 'cold' }, {
    force: true, signal: new AbortController().signal,
  })).ok, true)
})

test('writer held by another process is skipped without forced unlock', { skip }, async () => {
  const h = fixture()
  h.db.get('cold').locked = true
  const result = await h.adapter.refresh({ id: 'cold' }, { force: true, signal: new AbortController().signal })
  assert.equal(result.skip, 'owned-elsewhere')
  assert.equal(h.calls().modelCalls, 0)
  assert.equal(h.db.get('cold').locked, true)
})

test('a historical target opened in the meantime uses the live path', { skip }, async () => {
  const h = fixture()
  h.sessions.set('cold', { id: 'cold' })
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, true)
  assert.deepEqual(h.calls(), { modelCalls: 0, liveCalls: 1 })
  assert.equal(h.closes.length, 0)
})

test('failed or cancelled models preserve audit but do not write a new title', { skip }, async () => {
  for (const options of [{ generateFails: true }, { abort: new AbortController() }]) {
    const h = fixture(options)
    const result = await h.adapter.refresh({ id: 'cold' }, {
      force: false, signal: options.abort?.signal ?? new AbortController().signal,
    })
    assert.equal(result.ok, false)
    assert.deepEqual(h.writes.map((event) => event.type), ['session/end-seed', 'session/title-llm-request'])
    assert.equal(h.db.get('cold').locked, false)
  }
})

test('invalid restored history is not modified, even by a boundary event', { skip }, async () => {
  const h = fixture()
  const row = h.db.get('cold')
  row.events = [{ ...row.events[0], seq: 42 }]
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, false)
  assert.equal(h.writes.length, 0)
  assert.equal(h.calls().modelCalls, 0)
  assert.equal(row.locked, false)
})

test('durability failure is not reported as success and still closes ownership', { skip }, async () => {
  const h = fixture({ flushFails: true })
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, false)
  assert.match(result.error.message, /flush failed/)
  assert.equal(h.db.get('cold').locked, false)
})

test('durable cold title repairs list cache and pushes an exact targeted upsert', { skip }, async () => {
  const h = fixture({ publication: true })
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, true)
  assert.deepEqual(h.checkpoints, ['cold'])
  assert.equal(h.notifications.length, 1)
  assert.equal(h.notifications[0].name, 'api-session/added')
  assert.equal(h.notifications[0].summary.projections.kind, 'sequenced')
  assert.equal(h.notifications[0].summary.projections.values.title, result.snapshot.title)
  assert.equal(h.notifications[0].summary.projections.asOfSeq, result.snapshot.eventSeq)
})

test('failed durable append/flush never publishes a title as refreshed', { skip }, async () => {
  const h = fixture({ publication: true, flushFails: true })
  const result = await h.adapter.refresh({ id: 'cold' }, { force: false, signal: new AbortController().signal })
  assert.equal(result.ok, false)
  assert.equal(h.notifications.length, 0)
  assert.equal(h.checkpoints.length, 0)
})
