import test from 'node:test'
import assert from 'node:assert/strict'
import { RebuildController } from '../lib/rebuild.js'
import { mountRebuildRemote } from '../lib/rebuild-remote.js'

function setup(options = {}) {
  const sessions = [1, 2, 3].map((number) => ({ id: `s${number}`, header: {} }))
  const titles = new Map(sessions.map((session) => [session.id, {
    title: session.id, source: { kind: session.id === 's2' ? 'user' : 'provider' },
  }]))
  const calls = []
  let now = 1000
  const controller = new RebuildController({
    list: () => sessions,
    titleOf: (session) => titles.get(session.id),
    inputCountOf: () => 1,
    config: () => ({ includeSubagents: false, maxSessionsPerBatch: options.cap ?? 10 }),
    storedCount: async () => 80,
    refresh: async (session, reason, { signal }) => {
      calls.push({ id: session.id, reason })
      return options.refresh ? options.refresh(session, signal) : {
        ok: true, snapshot: { title: `new ${session.id}` },
      }
    },
    now: () => now,
  })
  return { controller, sessions, titles, calls, tick: () => { now += 6 * 60_000 } }
}

test('preview has scope, cost and pins; makes zero title requests', async () => {
  const h = setup({ cap: 1 })
  const plan = await h.controller.preview()
  assert.equal(plan.scope, 'live')
  assert.equal(plan.stored, 80)
  assert.equal(plan.pinnedSkipped, 1)
  assert.equal(plan.estimatedRequests, 1)
  assert.equal(plan.omitted, 1)
  assert.equal(h.calls.length, 0)
})

test('confirmation uses only previewed targets, even when sessions are added', async () => {
  const h = setup()
  const plan = await h.controller.preview()
  h.sessions.push({ id: 'late', header: {} })
  h.controller.start({ previewId: plan.id })
  const result = await h.controller.wait()
  assert.equal(result.state, 'completed')
  assert.equal(result.succeeded, 2)
  assert.deepEqual(h.calls.map((call) => call.id), ['s1', 's3'])
})

test('duplicate confirmation is idempotent after completion', async () => {
  const h = setup()
  const plan = await h.controller.preview()
  const first = h.controller.start({ previewId: plan.id })
  await h.controller.wait()
  assert.equal(h.controller.start({ previewId: plan.id }).id, first.id)
  assert.equal(h.calls.length, 2)
})

test('pins added after preview and detached sessions are skipped', async () => {
  const h = setup()
  const plan = await h.controller.preview()
  h.titles.get('s1').source.kind = 'user'
  h.sessions.splice(2, 1)
  h.controller.start({ previewId: plan.id })
  const result = await h.controller.wait()
  assert.equal(result.skipped, 2)
  assert.equal(h.calls.length, 0)
})

test('force is attached to the plan, capped and never inferred from start', async () => {
  const h = setup({ cap: 2 })
  const plan = await h.controller.preview({ force: true })
  assert.equal(plan.pinnedSkipped, 0)
  h.controller.start({ previewId: plan.id })
  const result = await h.controller.wait()
  assert.equal(result.total, 2)
  assert.deepEqual(h.calls.map((call) => call.id), ['s1', 's2'])
})

test('expired, missing and invalid previews refuse execution', async () => {
  const h = setup()
  assert.throws(() => h.controller.start(), /Preview/)
  await assert.rejects(h.controller.preview({ force: 'yes' }), /boolean/)
  const plan = await h.controller.preview()
  h.tick()
  assert.throws(() => h.controller.start({ previewId: plan.id }), /expired/)
  assert.equal(h.calls.length, 0)
})

test('progress, single active batch and cancellation cover in-flight work', async () => {
  let release
  const h = setup({ refresh: (_session, signal) => new Promise((resolve) => {
    release = resolve
    signal.addEventListener('abort', () => resolve({ ok: false, error: signal.reason }), { once: true })
  }) })
  const plan = await h.controller.preview()
  const initial = h.controller.start({ previewId: plan.id })
  assert.equal(h.controller.status().current.id, 's1')
  const another = await h.controller.preview()
  assert.throws(() => h.controller.start({ previewId: another.id }), /already running/)
  assert.throws(() => h.controller.cancel({ jobId: 'wrong' }), /no longer current/)
  assert.equal(h.controller.cancel({ jobId: initial.id }).state, 'cancelling')
  const done = await h.controller.wait()
  assert.equal(done.state, 'cancelled')
  assert.equal(h.calls.length, 1)
  assert.equal(done.items[0].state, 'cancelled')
  release({ ok: true, snapshot: { title: 'too late' } })
})

test('one failure does not stop remaining sessions; snapshots cannot mutate job', async () => {
  const h = setup({ refresh: async (session) => {
    if (session.id === 's1') throw new Error('network failed')
    return { ok: true, snapshot: { title: 'OK' } }
  } })
  const plan = await h.controller.preview()
  h.controller.start({ previewId: plan.id })
  const done = await h.controller.wait()
  assert.equal(done.failed, 1)
  assert.equal(done.succeeded, 1)
  done.items.length = 0
  assert.equal(h.controller.status().items.length, 2)
})

test('disposal cancels work and rejects subsequent previews', async () => {
  const h = setup({ refresh: (_session, signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ ok: false, error: signal.reason }), { once: true })
  }) })
  const plan = await h.controller.preview()
  h.controller.start({ previewId: plan.id })
  await h.controller.dispose()
  assert.equal(h.controller.status().state, 'cancelled')
  await assert.rejects(h.controller.preview(), /stopping/)
})

test('authenticated route adapter validates requests and returns structured results', async () => {
  const h = setup()
  const routes = new Map()
  mountRebuildRemote({ inject: (_deps, body) => body({ connection: {
    fetch: { register: (route) => routes.set(route.path, route) },
  } }) }, h.controller)
  assert.equal(routes.size, 5)
  const invoke = (method, body, contentType = 'application/json') =>
    routes.get(`/api/session-title-studio/${method}`).fetch(new Request('http://localhost/api', {
      method: 'POST', headers: { 'Content-Type': contentType }, body,
    }))
  assert.equal((await invoke('preview', '{}', 'text/plain')).status, 415)
  assert.equal((await invoke('preview', 'not json')).status, 400)
  assert.equal((await invoke('preview', 'null')).status, 400)
  assert.equal((await invoke('start', '{"force":true}')).status, 400)
  const preview = await (await invoke('preview', '{}')).json()
  assert.equal(preview.ok, true)
  assert.equal(h.calls.length, 0)
  const started = await (await invoke('start', JSON.stringify({ previewId: preview.value.id }))).json()
  assert.equal(started.ok, true)
  const done = await h.controller.wait()
  assert.equal(done.succeeded, 2)
  const state = await invoke('status', '{}')
  assert.equal(state.headers.get('cache-control'), 'no-store')
  assert.equal((await state.json()).value.state, 'completed')
})
