import { randomUUID } from 'node:crypto'

const isChild = (session) =>
  session.header?.origin === 'subagent' || (session.header?.delegationDepth ?? 0) > 0
const copy = (value) => structuredClone(value)

/** Shared, session-independent batch operation for the settings UI and /title. */
export class RebuildController {
  constructor({ list, titleOf, inputCountOf, config, storedCount, refresh, history, now = Date.now }) {
    Object.assign(this, { list, titleOf, inputCountOf, config, storedCount, refresh, history, now })
    this.plans = new Map()
    this.job = null
    this.pending = null
    this.syncPending = null
    this.syncAbort = null
    this.abort = null
    this.disposed = false
  }

  /** Preview is read-only. Its exact bounded target list is frozen for confirmation. */
  async preview({ force = false, scope = 'live' } = {}, signal) {
    if (this.disposed) throw new Error('Title Studio is stopping.')
    if (typeof force !== 'boolean') throw new Error('force must be a boolean')
    if (!['live', 'all'].includes(scope)) throw new Error('scope must be live or all')
    const policy = this.config()
    const live = this.list().filter((session) =>
      (policy.includeSubagents || !isChild(session)) && this.inputCountOf(session) > 0,
    )
    let corpus
    if (scope === 'all') {
      if (!this.history) throw new Error('当前部署不支持历史会话重建。')
      corpus = await this.history.enumerate(signal)
    }
    const entries = corpus?.entries ?? live.map((session) => ({
      id: session.id, title: this.titleOf(session)?.title ?? session.id,
      pinned: this.titleOf(session)?.source?.kind === 'user', live: true, session,
    }))
    const pinned = entries.filter((entry) => entry.pinned)
    const eligible = force ? entries : entries.filter((entry) => !entry.pinned)
    // 'All' is intentionally not the first ten: the user confirms the full
    // eligible corpus, which is processed one session at a time.
    const selected = scope === 'all' ? eligible : eligible.slice(0, policy.maxSessionsPerBatch)
    const stored = corpus?.stored ?? await this.storedCount()
    signal?.throwIfAborted()
    if (this.disposed) throw new Error('Title Studio is stopping.')
    const now = this.now()
    for (const [key, plan] of this.plans) if (plan.view.expiresAt <= now) this.plans.delete(key)
    // A bounded cache also protects against repeated preview clicks from several tabs.
    while (this.plans.size >= 20) this.plans.delete(this.plans.keys().next().value)
    const view = {
      id: randomUUID(),
      expiresAt: now + 5 * 60_000,
      force,
      scope,
      live: live.length,
      stored: stored ?? null,
      pinnedSkipped: force ? 0 : pinned.length,
      eligible: eligible.length,
      cap: scope === 'all' ? null : policy.maxSessionsPerBatch,
      estimatedRequests: selected.length,
      omitted: eligible.length - selected.length,
      empty: corpus?.empty ?? 0,
      children: corpus?.children ?? 0,
      unreadable: corpus?.unreadable ?? [],
      targets: selected.map((entry) => ({
        id: entry.id, title: entry.title, pinned: entry.pinned, live: entry.live,
      })),
    }
    this.plans.set(view.id, { view, sessions: selected })
    return copy(view)
  }

  /** Start exactly the previewed targets; never silently widen a confirmed batch. */
  start({ previewId } = {}) {
    if (this.disposed) throw new Error('Title Studio is stopping.')
    if (typeof previewId !== 'string') throw new Error('Preview the batch before starting it.')
    // A repeated network submission of the same confirmation is idempotent.
    if (this.job?.previewId === previewId) return this.status()
    if (this.pending !== null || this.syncPending !== null) throw new Error('A title maintenance task is already running.')
    const plan = this.plans.get(previewId)
    if (plan === undefined || plan.view.expiresAt <= this.now()) {
      throw new Error('The preview has expired. Preview the batch again.')
    }
    this.plans.delete(previewId)
    this.abort = new AbortController()
    this.job = {
      id: randomUUID(), previewId, scope: plan.view.scope, state: 'running',
      startedAt: this.now(), finishedAt: null,
      total: plan.sessions.length, completed: 0, succeeded: 0, skipped: 0, failed: 0,
      omitted: plan.view.omitted, current: null, items: [],
    }
    const initial = this.status()
    this.pending = this.run(plan).finally(() => { this.pending = null })
    return initial
  }

  status() {
    return copy(this.job ?? {
      id: null, state: 'idle', total: 0, completed: 0, succeeded: 0,
      skipped: 0, failed: 0, omitted: 0, current: null, items: [],
    })
  }

  cancel({ jobId } = {}) {
    if (typeof jobId !== 'string' || jobId !== this.job?.id) {
      throw new Error('This rebuild task is no longer current.')
    }
    if (this.pending !== null) {
      this.job.state = 'cancelling'
      this.abort.abort(new Error('Title rebuild cancelled by user.'))
    }
    return this.status()
  }

  async run(plan) {
    try {
      for (const entry of plan.sessions) {
        if (this.abort.signal.aborted || this.disposed) break
        const target = entry
        this.job.current = { id: target.id, title: target.title }
        let result
        try {
          if (plan.view.scope === 'all') {
            result = await this.history.refresh(target, {
              force: plan.view.force, signal: this.abort.signal,
            })
          } else {
            const session = entry.session
            const live = this.list().includes(session)
            const pinned = this.titleOf(session)?.source?.kind === 'user'
            const child = isChild(session) && !this.config().includeSubagents
            result = !live ? { ok: false, skip: 'no-longer-live' }
              : pinned && !plan.view.force ? { ok: false, skip: 'pinned' }
                : child ? { ok: false, skip: 'subagent' }
                  : await this.refresh(session, 'manual', {
                      force: plan.view.force, signal: this.abort.signal,
                    })
          }
        } catch (error) {
          result = { ok: false, error }
        }
        const cancelled = this.abort.signal.aborted && !result.ok
        const state = result.ok && result.snapshot !== undefined ? 'succeeded'
          : cancelled ? 'cancelled' : result.error !== undefined ? 'failed' : 'skipped'
        const item = { id: target.id, title: target.title, state }
        if (state === 'succeeded') {
          this.job.succeeded += 1
          item.newTitle = result.snapshot.title
          if (result.warnings?.length) item.message = result.warnings.join('; ')
        } else if (state === 'failed') {
          this.job.failed += 1
          item.message = result.error instanceof Error ? result.error.message : String(result.error)
        } else if (state === 'skipped') {
          this.job.skipped += 1
          item.message = result.skip ?? 'no-input'
        }
        this.job.items.push(item)
        this.job.completed += 1
        this.job.current = null
      }
      this.job.state = this.abort.signal.aborted || this.disposed ? 'cancelled' : 'completed'
    } catch (error) {
      this.job.state = 'failed'
      this.job.error = error instanceof Error ? error.message : String(error)
    } finally {
      this.job.current = null
      this.job.finishedAt = this.now()
    }
  }

  async synchronize(_input = {}, signal) {
    if (this.disposed) throw new Error('Title Studio is stopping.')
    if (this.pending !== null) throw new Error('请等待当前标题重建结束后再同步列表。')
    if (!this.history?.synchronizeTitles) throw new Error('列表同步服务不可用。')
    if (this.syncPending) return this.syncPending
    this.syncAbort = new AbortController()
    const combined = signal ? AbortSignal.any([signal, this.syncAbort.signal]) : this.syncAbort.signal
    this.syncPending = this.history.synchronizeTitles(combined)
    try { return await this.syncPending }
    finally { this.syncPending = null }
  }

  async wait() {
    await this.pending
    return this.status()
  }

  async dispose() {
    this.disposed = true
    this.plans.clear()
    this.abort?.abort(new Error('Title Studio unloaded.'))
    this.syncAbort?.abort(new Error('Title Studio unloaded.'))
    await Promise.allSettled([this.pending, this.syncPending])
  }
}

/** Command rendering is just an adapter; no second batch implementation. */
export function previewText(view) {
  return [
    `Live sessions with human input: ${view.live}.${view.stored === null ? '' : ` ${view.stored} stored in this profile;`}`,
    `Eligible now: ${view.eligible}; pinned skipped: ${view.pinnedSkipped}; this run would rebuild ${view.estimatedRequests} (cap ${view.cap ?? 'entire corpus'}).`,
    view.scope === 'all' ? 'All discoverable stored conversations are included; main agents are not resumed.'
      : 'Only loaded live sessions are included; choose the all-history scope in Settings for historical sessions.',
    'Each session may send one auxiliary title request. Use the settings page button or /title rebuild all confirm to run.',
  ].join('\n')
}

export function resultText(job) {
  return [
    `Rebuilt ${job.succeeded}, skipped ${job.skipped}, failed ${job.failed} of ${job.total} ${job.scope === 'all' ? 'historical/live' : 'live'} session(s).`,
    job.state === 'cancelled' ? 'Cancelled. Titles already rebuilt are kept.' : '',
    job.omitted > 0 ? `${job.omitted} session(s) exceeded the batch cap.` : '',
    ...job.items.filter((item) => item.state === 'failed').slice(0, 3)
      .map((item) => `${item.id}: ${item.message}`),
  ].filter(Boolean).join('\n')
}
