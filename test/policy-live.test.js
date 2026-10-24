import test from 'node:test'
import assert from 'node:assert/strict'

// The policy imports the Host's Schemastery through its Config schema. A
// standalone run has no Host packages, so this integration test skips there.
let policy
let unavailable
try {
  policy = await import('../lib/policy.js')
} catch (error) {
  unavailable = error instanceof Error ? error.message : String(error)
}

const skip = policy === undefined ? `Host policy unavailable: ${unavailable}` : false

test('idle refresh skips a same-topic message and fires on a new topic', { skip }, async () => {
  const listeners = new Map()
  const timers = []
  const messages = []
  let calls = 0
  let title

  const session = { id: 's1', header: {} }
  const ctx = {
    sessionTitle: {
      get: () => title,
      refresh: async () => {
        calls += 1
        title = {
          title: `T${calls}`,
          messageSeqs: messages.map((message) => message.seq),
          source: { kind: 'provider', provider: 'test' },
          updatedAt: Date.now(),
        }
        return title
      },
      rename: () => ({ title: 'renamed' }),
    },
    sessions: { list: () => [session] },
    sessionProjections: { stateOf: () => ({ count: messages.length }) },
    commands: { register: () => () => {} },
    logger: { warn: () => {} },
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
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
    enableDrift: true,
    idleDebounceMs: 5000,
    everyNTurns: 0,
    intervalMs: 0,
    minIntervalMs: 0,
    driftMinChars: 10,
    driftThreshold: 0.6,
    driftForceAfterMessages: 6,
  })

  const send = (text) => {
    const seq = messages.length + 1
    messages.push({ seq, text })
    listeners.get('session/event')(session, {
      type: 'user/message',
      seq,
      data: {
        source: { kind: 'user' },
        content: [{ type: 'text', text }],
      },
    })
  }
  const endTurn = () => listeners.get('session/event')(session, { type: 'turn/end' })
  const fire = async () => {
    for (const timer of timers.splice(0).filter((item) => !item.cancelled)) await timer.fn()
  }

  send('帮我优化标题插件的设置页')
  endTurn()
  await fire()
  assert.equal(calls, 1)
  assert.deepEqual(title.messageSeqs, [1])

  send('标题插件的设置页还需要优化布局')
  endTurn()
  await fire()
  assert.equal(calls, 1, 'a same-topic follow-up must not refresh')

  send('换个话题，数据库迁移方案怎么写')
  endTurn()
  await fire()
  assert.equal(calls, 2, 'a new topic must refresh')
  assert.deepEqual(title.messageSeqs, [1, 2, 3])
})
