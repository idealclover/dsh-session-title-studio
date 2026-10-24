import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareTitlePublication, publishTitleList, titleListSummary, synchronizeStoredTitles } from '../lib/title-publication.js'

const header = { id: 'cold', createdAt: 100, cwd: '/project', parentSession: 'parent', origin: 'subagent' }
const session = { id: 'cold', header }
const exact = { asOfSeq: 15, values: { title: '🧪 New title',
  sessionListMetadata: { blank: false, lastPromptAt: 200 } } }

function setup({ cacheError } = {}) {
  const order = []
  let live
  const ctx = {
    sessions: { get: () => live },
    get: (key) => key === 'sessionProjectionCache' ? {
      async write(value) {
        assert.equal(value, session)
        order.push('cache-start')
        await Promise.resolve()
        if (cacheError) throw new Error('cache unavailable')
        order.push('cache-durable')
      },
    } : key === 'agents' ? { get: () => live ? { session: live, status: 'running' } : undefined } : undefined,
    sessionProjections: { snapshot: (value) => value === live && live ? {
      asOfSeq: 22, values: { title: 'Newer live title', sessionListMetadata: { blank: false, lastPromptAt: 300 } },
    } : exact },
    emit(name, value) { order.push({ name, value }) },
  }
  return { ctx, order, resume: () => { live = { ...session } } }
}

test('cold summary carries exact sequenced title and preserves activity ordering/lineage', () => {
  const h = setup()
  const value = titleListSummary(h.ctx, session, exact)
  assert.equal(value.updatedAt, 200, 'title generation must not bump conversation activity')
  assert.deepEqual(value.projections, { kind: 'sequenced', asOfSeq: 15, values: { title: '🧪 New title' } })
  assert.equal(value.agentAvailable, false)
  assert.equal(value.running, false)
  assert.equal(value.parentSessionId, 'parent')
  assert.equal(value.cwd, '/project')
  assert.equal(value.origin, 'subagent')
})

test('cache completes before publication; no event is sent during preparation', async () => {
  const h = setup()
  const publication = await prepareTitlePublication(h.ctx, session)
  assert.deepEqual(h.order, ['cache-start', 'cache-durable'])
  publication.publish()
  assert.equal(h.order[2].name, 'api-session/added')
  assert.equal(h.order[2].value.projections.values.title, '🧪 New title')
})

test('just-resumed live state wins over a detached completion without losing running state', async () => {
  const h = setup()
  const publication = await prepareTitlePublication(h.ctx, session)
  h.resume()
  publication.publish()
  const value = h.order.at(-1).value
  assert.equal(value.projections.asOfSeq, 22)
  assert.equal(value.projections.values.title, 'Newer live title')
  assert.equal(value.agentAvailable, true)
  assert.equal(value.running, true)
  assert.equal(value.updatedAt, 300)
})

test('cache failure is a warning, not a second model request or a discarded saved title', async () => {
  const h = setup({ cacheError: true })
  const publication = await prepareTitlePublication(h.ctx, session)
  assert.match(publication.warnings[0], /cache unavailable/)
  publication.publish()
  assert.equal(h.order.at(-1).value.projections.values.title, '🧪 New title')
})

test('missing title capability does not invent or push an undefined title', () => {
  const h = setup()
  publishTitleList(h.ctx, session, { asOfSeq: 20, values: {} })
  assert.equal(h.order.length, 0)
})

test('repair refreshes exact cold snapshots and notifications using only read handles', async () => {
  const calls = []
  const emitted = []
  const ctx = {
    sessions: { get: () => undefined },
    get: (key) => key === 'sessionPersistence' ? {
      list: async () => [{ header }],
      open: async (id, access) => {
        calls.push(['open', id, access])
        assert.equal(access, 'read')
        return { header, inheritedEventCount: 0,
          read: async () => ({ events: [{ type: 'session/title', seq: 15, data: { title: '🧪 New title' } }] }),
          close: async () => calls.push(['close']),
        }
      },
    } : key === 'sessionProjectionCache' ? {
      coldSnapshot: (_header, _inherited, events) => {
        calls.push(['fold', events.length]); return exact
      },
    } : undefined,
    emit: (_name, summary) => emitted.push(summary),
  }
  const result = await synchronizeStoredTitles(ctx)
  assert.equal(result.synchronized, 1)
  assert.equal(result.modelRequests, 0)
  assert.deepEqual(result.failures, [])
  assert.deepEqual(calls, [['open', 'cold', 'read'], ['fold', 1], ['close']])
  assert.equal(emitted[0].projections.values.title, '🧪 New title')
})

// Exercise the installed Client's merge rule too, not a made-up store. The
// framework package is optional for a standalone source checkout.
let ProjectionValueStore
try {
  const entry = import.meta.resolve('@deepseek-ai/dsh-api-session-controller')
  ;({ ProjectionValueStore } = await import(new URL('./types/client/sessions/projection-store.js', entry).href))
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

test('official client updates both unopened cached and previously-read sequenced titles', {
  skip: !ProjectionValueStore && 'Host Client package unavailable',
}, () => {
  for (const wasRead of [false, true]) {
    const store = new ProjectionValueStore()
    if (wasRead) store.apply('title', 'Old', 10)
    else store.applyCached({ title: 'Old' })
    const summary = titleListSummary(setup().ctx, session, exact)
    const block = summary.projections
    store.apply('title', block.values.title, block.asOfSeq)
    assert.equal(store.get('title'), '🧪 New title')
    store.apply('title', 'Late stale read', 9)
    assert.equal(store.get('title'), '🧪 New title')
  }
})
