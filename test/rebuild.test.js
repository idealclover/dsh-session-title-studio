import test from 'node:test'
import assert from 'node:assert/strict'

// The policy imports the Host's Schemastery; skip this integration test in a
// standalone run without the Host packages.
let policy
let unavailable
try {
  policy = await import('../lib/policy.js')
} catch (error) {
  unavailable = error instanceof Error ? error.message : String(error)
}

const skip = policy === undefined ? `Host policy unavailable: ${unavailable}` : false

function harness({ maxSessionsPerBatch = 10 } = {}) {
  const listeners = new Map()
  const titles = new Map()
  const counts = new Map()
  const calls = []
  let command

  const makeSession = (id, count, pinned) => {
    counts.set(id, count)
    titles.set(
      id,
      pinned
        ? { title: `Pinned ${id}`, messageSeqs: [], source: { kind: 'user' }, updatedAt: 0 }
        : {
            title: `Old ${id}`,
            messageSeqs: [1],
            source: { kind: 'provider', provider: 'test' },
            updatedAt: 0,
          },
    )
    return { id, header: {} }
  }
  const one = makeSession('s1', 2, false)
  const two = makeSession('s2', 1, true)

  const ctx = {
    sessionTitle: {
      get: (session) => titles.get(session.id),
      refresh: async (session) => {
        calls.push(session.id)
        const next = {
          title: `T:${session.id}`,
          messageSeqs: Array.from({ length: counts.get(session.id) }, (_, index) => index + 1),
          source: { kind: 'provider', provider: 'test' },
          updatedAt: Date.now(),
        }
        titles.set(session.id, next)
        return next
      },
      rename: () => ({ title: 'renamed' }),
    },
    sessions: { list: () => [one, two] },
    sessionProjections: { stateOf: (session) => ({ count: counts.get(session.id) }) },
    commands: {
      register: (definition) => {
        command = definition
        return () => {}
      },
    },
    get: (name) =>
      name === 'sessionQuery' ? { listSessions: async () => [{}, {}, {}] } : undefined,
    logger: { warn: () => {} },
    setTimeout: () => () => {},
    setInterval: () => () => {},
    on: (event, listener) => {
      listeners.set(event, listener)
      return () => {}
    },
    effect: (body) => {
      body()
      return () => {}
    },
  }

  policy.apply(ctx, {
    enableIdle: false,
    everyNTurns: 0,
    intervalMs: 0,
    minIntervalMs: 0,
    enableDrift: false,
    maxSessionsPerBatch,
  })

  const run = (rawInput) =>
    command.handler({
      agent: { session: one },
      rawInput,
      signal: new AbortController().signal,
    })

  return { run, calls, titles }
}

test('rebuild all previews without a model call', { skip }, async () => {
  const h = harness()
  const result = await h.run('rebuild all')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /Eligible now: 1/u)
  assert.match(result.text, /pinned skipped: 1/u)
  assert.match(result.text, /3 stored/u)
  assert.equal(h.calls.length, 0)
})

test('rebuild all confirm skips pinned titles', { skip }, async () => {
  const h = harness()
  const result = await h.run('rebuild all confirm')
  assert.match(result.text, /Rebuilt 1, skipped 0, failed 0/u)
  assert.deepEqual(h.calls, ['s1'])
})

test('rebuild all confirm force includes pinned titles', { skip }, async () => {
  const h = harness()
  const result = await h.run('rebuild all confirm force')
  assert.match(result.text, /Rebuilt 2/u)
  assert.deepEqual(h.calls.sort(), ['s1', 's2'])
})

test('rebuild all honours the batch cap', { skip }, async () => {
  const h = harness({ maxSessionsPerBatch: 1 })
  const preview = await h.run('rebuild all force')
  assert.match(preview.text, /would rebuild 1/u)
  const result = await h.run('rebuild all confirm force')
  assert.match(result.text, /Rebuilt 1/u)
  assert.equal(h.calls.length, 1)
})
