/** Build a targeted session-list upsert from an exact (never cached-hint) cut. */
export function titleListSummary(ctx, session, snapshot) {
  const header = session.header
  const metadata = snapshot.values.sessionListMetadata
  const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const agent = agents?.get(session.id)
  const attached = ctx.sessions.get(session.id) === session
  return {
    sessionId: session.id,
    updatedAt: Math.max(header.createdAt, metadata?.lastPromptAt ?? 0),
    agentAvailable: attached && agent?.session === session,
    running: attached && agent?.session === session && agent.status === 'running',
    blank: metadata?.blank ?? false,
    formatStatus: 'current',
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(header.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    projections: {
      kind: 'sequenced', asOfSeq: snapshot.asOfSeq,
      values: { title: snapshot.values.title },
    },
  }
}

/** Recheck live state synchronously so a just-resumed session is not downgraded. */
export function publishTitleList(ctx, session, exact) {
  if (typeof ctx.emit !== 'function' || !Object.hasOwn(exact.values, 'title')) return
  const live = ctx.sessions.get(session.id)
  const current = live ?? session
  const cut = live
    ? ctx.sessionProjections.snapshot(live, ['title', 'sessionListMetadata'])
    : exact
  ctx.emit('api-session/added', titleListSummary(ctx, current, cut))
}

/** Called while cold write ownership is still held, after the log is durable.
 * A failed derived-cache write never rolls back or misreports a saved title.
 */
export async function prepareTitlePublication(ctx, session) {
  const warnings = []
  const cache = typeof ctx.get === 'function' ? ctx.get('sessionProjectionCache') : undefined
  if (cache?.write) {
    try { await cache.write(session) }
    catch (error) { warnings.push(`标题已保存，但列表缓存同步失败：${error.message ?? String(error)}`) }
  }
  if (typeof ctx.sessionProjections?.snapshot !== 'function') return { warnings }
  try {
    const exact = ctx.sessionProjections.snapshot(session, ['title', 'sessionListMetadata'])
    return { warnings, publish: () => publishTitleList(ctx, session, exact) }
  } catch (error) {
    warnings.push(`标题已保存，但列表通知准备失败：${error.message ?? String(error)}`)
    return { warnings }
  }
}

/** Repair titles saved by earlier versions. No LLM call, session opening,
 * Agent resume or session-log write. The official cold snapshot path updates
 * projection checkpoints fail-soft and publishes the exact observed log cut.
 */
export async function synchronizeStoredTitles(ctx, signal) {
  const store = ctx.get('sessionPersistence')
  const cache = ctx.get('sessionProjectionCache')
  if (!store?.list || !store?.open || !cache?.coldSnapshot) {
    throw new Error('当前部署不支持历史标题列表同步。')
  }
  const records = await store.list({ signal })
  let synchronized = 0
  let skipped = 0
  const failures = []
  for (const record of records) {
    signal?.throwIfAborted()
    const id = record.header.id
    const live = ctx.sessions.get(id)
    if (live) {
      try {
        const exact = ctx.sessionProjections.snapshot(live, ['title', 'sessionListMetadata'])
        publishTitleList(ctx, live, exact)
        synchronized += 1
      } catch (error) { failures.push({ id, message: error.message ?? String(error) }) }
      continue
    }
    let handle
    try {
      handle = await store.open(id, 'read', { signal })
      const { events } = await handle.read(0, Number.MAX_SAFE_INTEGER, { signal })
      const exact = cache.coldSnapshot(handle.header, handle.inheritedEventCount, events)
      if (typeof exact.values.title !== 'string') { skipped += 1; continue }
      // Only the header is needed by the list notification adapter.
      publishTitleList(ctx, { id, header: handle.header }, exact)
      synchronized += 1
    } catch (error) {
      if (signal?.aborted) throw error
      failures.push({ id, message: error.message ?? String(error) })
    } finally {
      if (handle) await handle.close()
    }
  }
  return { synchronized, skipped, failures, modelRequests: 0 }
}
