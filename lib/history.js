import { Session } from '@deepseek-ai/dsh-session'
import { foldSessionTitle, normalizeSessionTitle, SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'
import { prepareTitlePublication, synchronizeStoredTitles } from './title-publication.js'

export const isSubagentHeader = (header) =>
  header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0

/** Match the official title provider's human-text eligibility. */
export function titleMessages(events) {
  return events.flatMap((event) => {
    if (event.type !== 'user/message' || event.data?.source?.kind !== 'user') return []
    const text = (event.data.content ?? []).filter((block) => block.type === 'text')
      .map((block) => block.text).join('\n')
    return normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER).length
      ? [{ seq: event.seq, text }] : []
  })
}

const errorText = (error) => error instanceof Error ? error.message : String(error)

/** Detached read/write adapter for the tested DSH 0.2 session persistence API. */
export function createHistoryAdapter(ctx, { generate, refreshLive, policy, inputCountOf }) {
  const persistence = () => {
    const store = ctx.get('sessionPersistence')
    if (!store?.list || !store?.open) throw new Error('当前部署没有可用的会话持久化服务。')
    return store
  }

  const liveEntry = (session) => ({
    id: session.id, title: ctx.sessionTitle.get(session)?.title ?? session.id,
    pinned: ctx.sessionTitle.get(session)?.source?.kind === 'user',
    live: true, header: session.header, session,
  })

  return {
    async enumerate(signal) {
      const store = persistence()
      const snapshots = await store.list({ signal })
      const entries = []
      const unreadable = []
      let empty = 0
      let children = 0
      const ids = new Set()
      const addLive = (session) => {
        ids.add(session.id)
        if (!policy().includeSubagents && isSubagentHeader(session.header)) { children += 1; return }
        if (!inputCountOf(session)) { empty += 1; return }
        entries.push(liveEntry(session))
      }
      for (const session of ctx.sessions.list()) addLive(session)
      for (const snapshot of snapshots) {
        signal?.throwIfAborted()
        const id = snapshot.header.id
        if (ids.has(id)) continue
        ids.add(id)
        // A previously cold session might have been opened during the scan.
        const live = ctx.sessions.get(id)
        if (live) { addLive(live); continue }
        if (!policy().includeSubagents && isSubagentHeader(snapshot.header)) { children += 1; continue }
        let handle
        try {
          handle = await store.open(id, 'read', { signal })
          const { events } = await handle.read(0, Number.MAX_SAFE_INTEGER, { signal })
          const title = foldSessionTitle(events)
          if (!titleMessages(events).length) { empty += 1; continue }
          entries.push({ id, title: title?.title ?? id, pinned: title?.source.kind === 'user',
            header: handle.header, live: false })
        } catch (error) {
          if (signal?.aborted) throw error
          unreadable.push({ id, message: errorText(error) })
        } finally {
          if (handle) await handle.close()
        }
      }
      return { entries, stored: snapshots.length, unreadable, empty, children }
    },

    synchronizeTitles: (signal) => synchronizeStoredTitles(ctx, signal),

    async refresh(target, { force, signal }) {
      signal?.throwIfAborted()
      const live = ctx.sessions.get(target.id)
      if (live) return refreshLive(live, 'manual', { force, signal })
      if (typeof generate !== 'function' || typeof Session.fromRestore !== 'function') {
        return { ok: false, error: new Error('此 DSH 版本不支持脱离主会话的标题重建。') }
      }
      let handle
      let result
      let detachedForCache
      let publication
      const captured = []
      const errors = []
      try {
        handle = await persistence().open(target.id, 'write', { signal })
        const seed = await handle.read(0, Number.MAX_SAFE_INTEGER, { signal })
        if (!policy().includeSubagents && isSubagentHeader(handle.header)) {
          result = { ok: false, skip: 'subagent' }
        } else {
          const currentTitle = foldSessionTitle(seed.events)
          const messages = titleMessages(seed.events)
          if (currentTitle?.source.kind === 'user' && !force) {
            result = { ok: false, skip: 'pinned' }
          } else if (!messages.length) {
            result = { ok: false, skip: 'no-input' }
          } else {
            // Never enter the SessionStore or construct/resume an Agent. The real
            // Session assigns/validates seq, time and payloads for both known
            // log-only events. This narrow adapter captures the helper's append
            // results without monkeypatching or accessing deprecated event readers.
            // DSH restoration would implicitly append this boundary when the
            // stored tail is not end-seed. Supply and capture the known log-only
            // boundary explicitly so its sequence is persisted too (otherwise
            // the first generated request would leave a one-event seq gap).
            const restoreEvents = [...seed.events]
            let boundary
            if (restoreEvents.at(-1)?.type !== 'session/end-seed') {
              boundary = Object.freeze({ type: 'session/end-seed', seq: restoreEvents.length,
                time: Date.now(), data: Object.freeze({}) })
              restoreEvents.push(boundary)
            }
            const detached = Session.fromRestore(target.id, restoreEvents, handle.header,
              handle.inheritedEventCount, seed.eventState, ctx.sessions.messageProjections)
            detachedForCache = detached
            // Invalid history must fail before anything is queued for writing.
            if (boundary) captured.push(boundary)
            const session = {
              id: detached.id, header: detached.header,
              append(type, data, ...options) {
                const event = detached.append(type, data, ...options)
                captured.push(event)
                return event
              },
            }
            const routeConfig = detached.requestHeader()?.config
            const route = routeConfig?.provider && routeConfig?.model
              ? { provider: routeConfig.provider, model: routeConfig.model } : undefined
            const generated = await generate({ session, messages, currentTitle, route, signal })
            signal?.throwIfAborted()
            const sourceSeqs = new Set(messages.map((message) => message.seq))
            let previous = -1
            for (const seq of generated.messageSeqs ?? []) {
              if (!Number.isSafeInteger(seq) || seq <= previous || !sourceSeqs.has(seq)) {
                throw new Error('标题生成器返回了无效的来源消息序号。')
              }
              previous = seq
            }
            if (!(generated.messageSeqs?.length > 0)) throw new Error('标题缺少来源消息。')
            if (generated.model && (!generated.model.provider || !generated.model.model)) {
              throw new Error('标题模型路由无效。')
            }
            // Conservative cold-write cap matches the shipped base title service.
            const title = normalizeSessionTitle(generated.title, 80)
            if (!title) throw new Error('标题生成器返回了空标题。')
            const event = session.append('session/title', {
              title, messageSeqs: [...generated.messageSeqs],
              source: { kind: 'provider', provider: SessionTitleProviderId('session-title-studio'),
                ...(generated.model ? { model: generated.model } : {}) },
            })
            result = { ok: true, snapshot: { ...event.data, eventSeq: event.seq, updatedAt: event.time } }
          }
        }
      } catch (error) {
        if (error?.name === 'SessionAlreadyOwnedError') {
          const becameLive = ctx.sessions.get(target.id)
          return becameLive ? refreshLive(becameLive, 'manual', { force, signal })
            : { ok: false, skip: 'owned-elsewhere' }
        }
        errors.push(error)
      } finally {
        // Keep the request audit on model failure/cancellation too. Flush/close
        // deliberately do not inherit an already-aborted network signal.
        try {
          if (handle && captured.length) {
            await handle.append(captured)
            await handle.flush()
            if (result?.ok && detachedForCache) {
              publication = await prepareTitlePublication(ctx, detachedForCache)
            }
          }
        } catch (error) { errors.push(error) }
        finally {
          try { if (handle) await handle.close() } catch (error) { errors.push(error) }
        }
      }
      if (errors.length) {
        return { ok: false, error: errors.length === 1 ? errors[0]
          : new Error(errors.map(errorText).join('; ')) }
      }
      if (result?.ok && publication) {
        const warnings = [...publication.warnings]
        try { publication.publish?.() }
        catch (error) { warnings.push(`标题已保存，但侧栏通知失败：${errorText(error)}`) }
        if (warnings.length) {
          result.warnings = warnings
          ctx.logger?.warn?.(warnings.join('; '))
        }
      }
      return result ?? { ok: false, skip: 'no-input' }
    },
  }
}
