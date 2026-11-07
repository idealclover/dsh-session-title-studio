import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { RebuildController } from '../lib/rebuild.js'
import { mountRebuildRemote } from '../lib/rebuild-remote.js'

// Run the actual shipped controller, with no fake React rendering or copied implementation.
let client
const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: (entry) => {
  client = entry.factory((specifier) => {
    assert.equal(specifier, 'react')
    return { createElement(type, props, ...children) { return { type, props, children } } }
  })
} } }, AbortController })
const t = (key, vars = {}) => key + JSON.stringify(vars)

function setup(options = {}) {
  const calls = []
  const inspected = []
  const target = { id: 'clicked-not-current', title: 'Chosen', hasInput: true, live: false, ...options.target }
  const controller = new RebuildController({
    list: () => [], titleOf: () => undefined, inputCountOf: () => 0,
    config: () => ({ maxSessionsPerBatch: 10 }), storedCount: async () => 0,
    history: {
      inspectTarget: async (id) => { inspected.push(id); return target },
      refresh: async (entry, input) => {
        calls.push({ id: entry.id, force: input.force })
        return options.refresh ? options.refresh(entry, input) : { ok: true, snapshot: { title: '✨ New' } }
      },
    },
  })
  return { controller, calls, inspected }
}

test('single regeneration inspects only clicked id and uses cold shared generation path', async () => {
  const h = setup()
  const result = await h.controller.regenerate({ sessionId: 'clicked-not-current' })
  assert.equal(result.ok, true)
  assert.equal(result.title, '✨ New')
  assert.deepEqual(h.inspected, ['clicked-not-current'])
  assert.deepEqual(h.calls, [{ id: 'clicked-not-current', force: false }])
})

test('pinned, excluded and empty conversations do not invoke a model', async () => {
  for (const [target, skip] of [[{ pinned: true }, 'pinned'], [{ excluded: true }, 'subagent'], [{ hasInput: false }, 'no-input']]) {
    const h = setup({ target })
    assert.equal((await h.controller.regenerate({ sessionId: 'clicked-not-current' })).skip, skip)
    assert.equal(h.calls.length, 0)
  }
  const h = setup({ target: { pinned: true } })
  assert.equal((await h.controller.regenerate({ sessionId: 'clicked-not-current', force: true })).ok, true)
  assert.equal(h.calls[0].force, true)
})

test('single regenerate validates target/force, respects maintenance lock and propagates failures', async () => {
  const h = setup({ refresh: async () => ({ ok: false, error: new Error('model unavailable') }) })
  await assert.rejects(h.controller.regenerate({ sessionId: '' }), /valid sessionId/)
  await assert.rejects(h.controller.regenerate({ sessionId: 'ok', force: 'yes' }), /boolean/)
  const result = await h.controller.regenerate({ sessionId: 'clicked-not-current' })
  assert.equal(result.error, 'model unavailable')
  h.controller.pending = Promise.resolve()
  await assert.rejects(h.controller.regenerate({ sessionId: 'ok' }), /already running/)
})

test('authenticated target route rejects unexpected fields and returns single-session results', async () => {
  const h = setup()
  const routes = new Map()
  mountRebuildRemote({ inject: (_deps, cb) => cb({ connection: {
    fetch: { register: (route) => routes.set(route.path, route) },
  } }) }, h.controller)
  const route = routes.get('/api/session-title-studio/regenerate')
  const invoke = (data) => route.fetch(new Request('http://localhost/api', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
  }))
  assert.equal((await invoke({ sessionId: 'ok', all: true })).status, 400)
  const result = await (await invoke({ sessionId: 'clicked-not-current' })).json()
  assert.equal(result.ok, true)
  assert.equal(result.value.title, '✨ New')
})

test('client registration yields only valid disposers, never the optional plugin fiber', () => {
  const registrations = []
  const menuContributions = []
  const ctx = {
    locale: { register: () => () => {}, bind: () => t },
    slots: {
      inject: (_slot, mount) => { mount(); return () => {} },
      register: (options, component) => { registrations.push({ ...options, component }); return () => {} },
    },
    inject: (_deps, mount) => {
      mount({ contextMenus: { register: (entry) => { menuContributions.push(entry); return () => {} } },
        effect: (body) => body() })
      return { fiber: 'not-a-disposer' }
    },
    effect: (body) => {
      const effect = body()
      for (const dispose of effect) assert.equal(typeof dispose, 'function', 'Cordis rejects non-function yields')
      return () => {}
    },
  }
  client.apply(ctx)
  assert.equal(menuContributions.length, 1)
  const action = menuContributions[0].resolve({ sessionId: 'captured', displayTitle: 'Chosen' })[0]
  assert.equal(action.disabled, false)
  assert.equal(action.icon.key, 'session-title-studio.regenerate')
  const icons = registrations.filter((item) => item.name === 'contextMenu.icon')
  assert.equal(icons.length, 1)
  assert.equal(icons[0].key, action.icon.key)
  const svg = icons[0].component()
  assert.equal(svg.type, 'svg')
  assert.equal(svg.props.stroke, 'currentColor')
  assert.equal(svg.props['aria-hidden'], true)
  assert.equal(svg.children.length, 2)
  assert.equal(registrations.filter((item) => item.name === 'shell.overlay').length, 1)
  assert.equal(registrations.filter((item) => item.name === 'sidebar.workspaces.session.menu.item').length, 1)
})

test('client pin confirmation sends force only after explicit confirmation; dismissal sends nothing', async () => {
  const calls = []
  const controller = client.createSessionMenuController({ t, call: async (_method, data) => {
    calls.push(data)
    return data.force ? { ok: true, title: 'New' } : { ok: false, skip: 'pinned', title: 'Manual' }
  } })
  await controller.request('clicked', 'Old')
  assert.equal(controller.getSnapshot().phase, 'confirm')
  assert.equal(calls.length, 1)
  controller.dismiss()
  assert.equal(calls.length, 1)
  await controller.request('clicked', 'Old')
  await controller.confirm()
  assert.equal(controller.getSnapshot().phase, 'success')
  assert.equal(calls.at(-1).force, true)
  assert.equal(calls.at(-1).sessionId, 'clicked')
})

test('client busy action deduplicates clicks and errors remain visible after menu dismissal', async () => {
  let settle
  const messages = []
  const controller = client.createSessionMenuController({ t, notify: (...args) => messages.push(args),
    call: () => new Promise((resolve) => { settle = resolve }) })
  const task = controller.request('clicked', 'Old')
  await controller.request('another', 'Other')
  assert.equal(controller.getSnapshot().sessionId, 'clicked')
  controller.dismiss()
  assert.equal(controller.getSnapshot().phase, 'running')
  settle({ ok: false, error: 'network unavailable' })
  await task
  assert.equal(controller.getSnapshot().phase, 'error')
  assert.equal(controller.getSnapshot().message, 'network unavailable')
  assert.equal(messages[0][1], false)
})

test('client disposal cancels its request without leaving listeners alive', async () => {
  let signal
  const controller = client.createSessionMenuController({ t, call: (_m, _d, given) => {
    signal = given
    return new Promise((_, reject) => given.addEventListener('abort', () => reject(new Error('aborted'))))
  } })
  const task = controller.request('clicked', 'Old')
  controller.dispose()
  await task
  assert.equal(signal.aborted, true)
})
