import test from 'node:test'
import assert from 'node:assert/strict'
import { RebuildController } from '../lib/rebuild.js'

test('all-history really rebuilds the full eligible corpus, not the live batch cap', async () => {
  const entries = Array.from({ length: 25 }, (_, index) => ({
    id: `cold-${index}`, title: `History ${index}`, live: false, pinned: index === 0,
  }))
  const calls = []
  const controller = new RebuildController({
    list: () => [], titleOf: () => undefined, inputCountOf: () => 0,
    config: () => ({ includeSubagents: false, maxSessionsPerBatch: 2 }),
    storedCount: async () => 25,
    refresh: async () => { throw new Error('wrong live route') },
    history: {
      enumerate: async () => ({ entries, stored: 25, empty: 2, children: 3,
        unreadable: [{ id: 'bad', message: 'corrupt' }] }),
      refresh: async (target) => {
        calls.push(target.id)
        return { ok: true, snapshot: { title: 'Updated' } }
      },
    },
  })
  const plan = await controller.preview({ scope: 'all' })
  assert.equal(plan.cap, null)
  assert.equal(plan.omitted, 0)
  assert.equal(plan.estimatedRequests, 24)
  assert.equal(plan.pinnedSkipped, 1)
  assert.equal(plan.unreadable.length, 1)
  assert.equal(calls.length, 0)
  controller.start({ previewId: plan.id })
  const job = await controller.wait()
  assert.equal(job.scope, 'all')
  assert.equal(job.succeeded, 24)
  assert.equal(calls.length, 24)
})

test('invalid/unsupported history scope fails explicitly without live fallback', async () => {
  const controller = new RebuildController({
    list: () => [], config: () => ({}), storedCount: async () => 0,
  })
  await assert.rejects(controller.preview({ scope: 'everything' }), /scope/)
  await assert.rejects(controller.preview({ scope: 'all' }), /历史会话/)
})
