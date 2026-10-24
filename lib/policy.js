/**
 * Session Title Studio — refresh policy.
 *
 * Owns *when* a title is regenerated. It never generates titles itself: every
 * refresh goes through `ctx.sessionTitle.refresh()`, so the recipe provider
 * (or any other registered provider) stays the only title author.
 *
 * Triggers:
 *   - idle: after a turn ends, once the conversation has been quiet
 *   - every-n-turns: after N new human messages
 *   - interval: periodic sweep over recently active live sessions
 *   - manual: /title refresh
 *
 * Guards: pinned titles, staleness, minimum spacing, daily budget, subagent
 * exclusion, and a single in-flight refresh per session.
 */

import { PolicyConfig } from './schema.js'
import { resolvePolicyConfig } from './config-core.js'
import { evaluateRefresh, hasNewInput } from './policy-core.js'
import { driftScore } from './drift.js'
import { RebuildController, previewText, resultText } from './rebuild.js'
import { mountRebuildRemote } from './rebuild-remote.js'
import { createHistoryAdapter } from './history.js'
import { coverageDefinition } from './coverage.js'

export const name = 'session-title-studio-policy'
export const inject = ['sessionTitle', 'sessions', 'sessionProjections', 'timer', 'commands']
export { PolicyConfig as Config }

const USAGE = [
  'Usage: /title [status] | /title refresh [force] | /title rebuild [all] [confirm] [force] | /title rename <text>',
  '  refresh              regenerate now (respects a pinned title)',
  '  refresh force        regenerate even when the title was pinned',
  '  rebuild              regenerate the current session title',
  '  rebuild all          preview live sessions that would be rebuilt',
  '  rebuild all confirm  rebuild them (one auxiliary request per session)',
  '  rebuild all confirm force  include pinned titles',
  '  rename <text>        set a title manually and pin it',
].join('\n')

const SKIP_TEXT = {
  pinned: 'Title is pinned by a manual rename. Use /title refresh force to replace it.',
  'no-new-input': 'No new human messages since the last title.',
  'below-turn-threshold': 'Not enough new human messages for the every-N-turns trigger yet.',
  'min-interval': 'Refreshed recently; waiting for the minimum interval.',
  'daily-cap': 'Daily automatic refresh budget for this session is exhausted.',
  'in-flight': 'A refresh is already running for this session.',
  subagent: 'Subagent sessions are excluded by policy.',
  disposed: 'The policy plugin is no longer active.',
  'drift-too-few': 'Too few new human messages to judge topic drift.',
  'drift-too-short': 'The new messages are too short to judge topic drift.',
  'no-drift': 'The topic has not drifted enough from the current title.',
}

/** Text blocks of one eligible `user/message` event (`event.data` holds the message). */
function userTextOf(event) {
  const data = event?.data
  if (data?.source?.kind !== 'user') return ''
  const content = data.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** Whether a session is a delegated child. */
function isSubagent(session) {
  return session?.header?.origin === 'subagent' || (session?.header?.delegationDepth ?? 0) > 0
}

/**
 * Mount the refresh policy.
 * @param {object} ctx - Cordis context with session, projection, command and timer services.
 * @param {object} config - Raw loader config.
 */
export function apply(ctx, config, { generate } = {}) {
  if (typeof ctx.sessionProjections.register === 'function') {
    ctx.sessionProjections.register(coverageDefinition)
  }
  let lastGood = resolvePolicyConfig(config)
  const current = () => {
    try {
      lastGood = resolvePolicyConfig(config)
    } catch (error) {
      ctx.logger?.warn?.(
        `session-title-studio: keeping the last valid policy: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return lastGood
  }
  /** @type {Map<string, {lastAttemptAt: number, dayKey: string, countToday: number}>} */
  const states = new Map()
  /** @type {Set<string>} */
  const inflight = new Set()
  /** @type {Map<string, number>} */
  const activity = new Map()
  /** @type {Map<string, () => void>} */
  const idleTimers = new Map()
  /** @type {Map<string, {seq: number, text: string}[]>} */
  const buffers = new Map()
  /** @type {Map<string, {text: string}>} */
  const basis = new Map()
  /** @type {Map<string, {kind: string, at: number, reason?: string, message?: string}>} */
  const outcomes = new Map()
  let intervalTimer
  let sweeping = false
  let disposed = false

  const inputCountOf = (session) => {
    const state = ctx.sessionProjections.stateOf(session, 'titleInput')
    return state?.count ?? 0
  }

  const coveredCountOf = (session, title) =>
    ctx.sessionProjections.stateOf(session, 'studioTitleCoverage')?.covered
      ?? title?.messageSeqs?.length ?? 0

  const recordOutcome = (sessionId, outcome) => {
    outcomes.set(sessionId, { ...outcome, at: Date.now() })
  }

  const stateOf = (sessionId, title) =>
    states.get(sessionId) ?? {
      lastAttemptAt: title?.updatedAt ?? 0,
      dayKey: '',
      countToday: 0,
    }

  const clearIdle = (sessionId) => {
    const dispose = idleTimers.get(sessionId)
    if (dispose !== undefined) {
      try {
        dispose()
      } catch {
        // Timer already fired or was disposed with the plugin fiber.
      }
      idleTimers.delete(sessionId)
    }
  }

  const describe = (session) => {
    const resolved = current()
    const title = ctx.sessionTitle.get(session)
    const input = ctx.sessionProjections.stateOf(session, 'titleInput')
    if (title === undefined) {
      return 'No title yet. Send a message, or run /title refresh.'
    }
    const lines = [
      `Title: ${title.title}`,
      `Source: ${title.source.kind}${title.source.kind === 'provider' ? ` (${title.source.provider})` : ''}`,
      `Updated: ${new Date(title.updatedAt).toISOString()}`,
      `Messages covered: ${coveredCountOf(session, title)} / ${input?.count ?? 0}; sampled sources: ${title.messageSeqs.length}`,
      `Policy: idle ${resolved.enableIdle ? `${resolved.idleDebounceMs}ms` : 'off'}, everyN ${resolved.everyNTurns}, min ${resolved.minIntervalMs}ms`,
      `Drift: ${resolved.enableDrift ? `on (threshold ${resolved.driftThreshold}, force after ${resolved.driftForceAfterMessages})` : 'off'}`,
    ]
    if (title.source.kind === 'user') lines.push('Pinned: yes (automatic refreshes are skipped)')
    const outcome = outcomes.get(session.id)
    if (outcome !== undefined) {
      lines.push(
        `Last auto: ${outcome.kind}${outcome.reason === undefined ? '' : ` (${outcome.reason})`}${outcome.message === undefined ? '' : `: ${outcome.message}`} at ${new Date(outcome.at).toISOString()}`,
      )
    }
    return lines.join('\n')
  }

  /**
   * Run one guarded refresh.
   * @param {object} session - Live session.
   * @param {string} reason - manual, idle, every-n-turns, or interval.
   * @param {{force?: boolean, signal?: AbortSignal}} [options] - Manual force flag and caller cancellation.
   * @returns {Promise<{ok: boolean, skip?: string, snapshot?: object, error?: unknown}>}
   */
  async function refresh(session, reason, options = {}) {
    if (disposed) return { ok: false, skip: 'disposed' }
    const sessionId = session.id
    if (inflight.has(sessionId)) {
      recordOutcome(sessionId, { kind: 'in-flight' })
      return { ok: false, skip: 'in-flight' }
    }

    const resolved = current()
    const title = ctx.sessionTitle.get(session)
    const inputCount = inputCountOf(session)
    const lastCoveredSeq =
      Array.isArray(title?.messageSeqs) && title.messageSeqs.length > 0
        ? title.messageSeqs[title.messageSeqs.length - 1]
        : 0
    const buffered = buffers.get(sessionId) ?? []
    const recentMessages = buffered
      .filter((message) => message.seq > lastCoveredSeq)
      .slice(-resolved.driftWindowMessages)
    const scoredTexts = recentMessages
      .map((message) => message.text)
      .filter((text) => text.length >= 8)
    const basisText = basis.get(sessionId)?.text ?? title?.title ?? ''
    const drift = resolved.enableDrift
      ? {
          // Score each message separately: an earlier same-topic message must
          // not dilute a later topic change when both sit in the window.
          score:
            scoredTexts.length === 0
              ? 0
              : Math.max(...scoredTexts.map((text) => driftScore(basisText, text))),
          recentChars: scoredTexts.reduce((max, text) => Math.max(max, text.length), 0),
        }
      : undefined

    const decision = evaluateRefresh({
      reason,
      now: Date.now(),
      title,
      inputCount,
      coveredCount: coveredCountOf(session, title),
      state: stateOf(sessionId, title),
      config: resolved,
      force: options.force === true,
      isSubagent: isSubagent(session),
      drift,
    })
    if (!decision.ok) {
      recordOutcome(sessionId, { kind: 'skip', reason: decision.skip })
      return decision
    }

    inflight.add(sessionId)
    states.set(sessionId, {
      lastAttemptAt: Date.now(),
      dayKey: decision.dayKey,
      countToday: decision.countToday + (reason === 'manual' ? 0 : 1),
    })
    try {
      const timeout = AbortSignal.timeout(resolved.refreshTimeoutMs)
      const signal =
        options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout])
      const snapshot = await ctx.sessionTitle.refresh(session, signal)
      if (snapshot !== undefined) {
        const coveredSeqs = new Set(snapshot.messageSeqs)
        const coveredTexts = (buffers.get(sessionId) ?? [])
          .filter((message) => coveredSeqs.has(message.seq))
          .slice(-resolved.driftWindowMessages)
        basis.set(sessionId, {
          text:
            coveredTexts.length > 0
              ? coveredTexts.map((message) => message.text).join('\n')
              : snapshot.title,
        })
      }
      recordOutcome(sessionId, { kind: 'refreshed' })
      return { ok: true, snapshot }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recordOutcome(sessionId, { kind: 'error', message })
      ctx.logger?.warn?.(`session-title-studio: refresh failed for ${sessionId}: ${message}`)
      return { ok: false, error }
    } finally {
      inflight.delete(sessionId)
    }
  }

  const scheduleIdle = (session) => {
    const resolved = current()
    if (!resolved.enableIdle || disposed) return
    const sessionId = session.id
    const title = ctx.sessionTitle.get(session)
    if (title?.source?.kind === 'user' && resolved.respectPinned) return
    if (!hasNewInput(title, inputCountOf(session), coveredCountOf(session, title))) return
    clearIdle(sessionId)
    recordOutcome(sessionId, { kind: 'idle-scheduled' })
    const dispose = ctx.setTimeout(() => {
      idleTimers.delete(sessionId)
      recordOutcome(sessionId, { kind: 'idle-fired' })
      void refresh(session, 'idle')
    }, resolved.idleDebounceMs)
    idleTimers.set(sessionId, dispose)
  }

  const sweep = async () => {
    if (sweeping || disposed) return
    sweeping = true
    try {
      const resolved = current()
      const now = Date.now()
      const candidates = ctx.sessions
        .list()
        .filter((session) => resolved.includeSubagents || !isSubagent(session))
        .filter((session) => now - (activity.get(session.id) ?? 0) <= resolved.activeWindowMs)
        .filter((session) => inputCountOf(session) > 0)
        .sort((left, right) => (activity.get(right.id) ?? 0) - (activity.get(left.id) ?? 0))

      let refreshed = 0
      for (const session of candidates) {
        if (disposed || refreshed >= resolved.maxSessionsPerSweep) break
        const result = await refresh(session, 'interval')
        if (result.ok) refreshed += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.(`session-title-studio: interval sweep failed: ${message}`)
    } finally {
      sweeping = false
    }
  }

  const armInterval = () => {
    if (intervalTimer !== undefined) {
      try {
        intervalTimer()
      } catch {
        // Already fired or disposed with the plugin fiber.
      }
      intervalTimer = undefined
    }
    if (disposed) return
    const { intervalMs } = current()
    if (intervalMs <= 0) return
    intervalTimer = ctx.setTimeout(() => {
      intervalTimer = undefined
      void sweep().finally(armInterval)
    }, intervalMs)
  }

  ctx.on('session/event', (session, event) => {
    try {
      activity.set(session.id, Date.now())
      if (event.type === 'user/message') {
        const text = userTextOf(event)
        if (text.length > 0) {
          const list = buffers.get(session.id) ?? []
          list.push({ seq: event.seq, text: text.slice(0, 4000) })
          if (list.length > 60) list.shift()
          buffers.set(session.id, list)
        }
        clearIdle(session.id)
        return
      }
      if (event.type === 'turn/start') {
        clearIdle(session.id)
        return
      }
      if (event.type === 'turn/end') {
        scheduleIdle(session)
        if (current().everyNTurns > 0) void refresh(session, 'every-n-turns')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger?.warn?.(`session-title-studio: event handling failed: ${message}`)
    }
  })

  ctx.on('session/disposed', (session) => {
    clearIdle(session.id)
    states.delete(session.id)
    activity.delete(session.id)
    inflight.delete(session.id)
    buffers.delete(session.id)
    basis.delete(session.id)
    outcomes.delete(session.id)
  })

  armInterval()

  /** Text for one refresh result. */
  const refreshText = (result) => {
    if (result.ok) {
      return result.snapshot === undefined
        ? 'No eligible human messages yet; nothing to title.'
        : `Title refreshed: ${result.snapshot.title}`
    }
    if (result.error !== undefined) {
      const message = result.error instanceof Error ? result.error.message : String(result.error)
      return `Title refresh failed: ${message}`
    }
    return SKIP_TEXT[result.skip] ?? `Refresh skipped (${result.skip ?? 'failed'}).`
  }

  /** Count every stored session when the query service is available. */
  const storedSessionCount = async (signal) => {
    try {
      const query = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
      if (query === undefined) return undefined
      const records = await query.listSessions(signal)
      return Array.isArray(records) ? records.length : undefined
    } catch {
      return undefined
    }
  }

  const history = createHistoryAdapter(ctx, {
    generate, refreshLive: refresh, policy: current, inputCountOf,
  })
  const rebuild = new RebuildController({
    history,
    list: () => ctx.sessions.list(),
    titleOf: (session) => ctx.sessionTitle.get(session),
    inputCountOf,
    config: current,
    storedCount: () => storedSessionCount(),
    refresh,
  })
  // Both callers use this same controller; the settings button needs no chat session.
  mountRebuildRemote(ctx, rebuild)

  const rebuildLive = async (confirm, force, signal) => {
    const plan = await rebuild.preview({ force })
    if (!confirm) return previewText(plan)
    signal?.throwIfAborted()
    const job = rebuild.start({ previewId: plan.id })
    const cancel = () => rebuild.cancel({ jobId: job.id })
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      return resultText(await rebuild.wait())
    } finally {
      signal?.removeEventListener('abort', cancel)
    }
  }
  ctx.effect(() => () => rebuild.dispose(), 'session-title-studio: batch teardown')

  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'title',
        description: 'Show, refresh, rebuild, or rename session titles',
        input: {
          hint: 'status | refresh [force] | rebuild [all] [confirm] [force] | rename <text>',
        },
        handler: async ({ agent, rawInput, signal }) => {
          const session = agent.session
          const parts = String(rawInput ?? '').trim().split(/\s+/u).filter(Boolean)
          const subcommand = parts[0] ?? 'status'
          try {
            if (subcommand === 'status') {
              return { kind: 'success', text: describe(session) }
            }
            if (subcommand === 'refresh') {
              const force = parts.includes('force') || parts.includes('--force')
              const result = await refresh(session, 'manual', { force, signal })
              return { kind: result.ok ? 'success' : 'error', text: refreshText(result) }
            }
            if (subcommand === 'rebuild') {
              const force = parts.includes('force') || parts.includes('--force')
              if (parts[1] !== 'all') {
                const result = await refresh(session, 'manual', { force, signal })
                return { kind: result.ok ? 'success' : 'error', text: refreshText(result) }
              }
              const confirm = parts.includes('confirm') || parts.includes('--confirm')
              return {
                kind: 'success',
                text: await rebuildLive(confirm, force, signal),
              }
            }
            if (subcommand === 'rename') {
              const value = parts.slice(1).join(' ').trim()
              if (value.length === 0) return { kind: 'error', text: 'Usage: /title rename <text>' }
              const snapshot = ctx.sessionTitle.rename(session, value)
              return { kind: 'success', text: `Title pinned: ${snapshot.title}` }
            }
            return { kind: 'error', text: USAGE }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return { kind: 'error', text: `Title command failed: ${message}` }
          }
        },
      }),
    'session-title-studio: /title command',
  )

  ctx.effect(
    () => () => {
      disposed = true
      if (intervalTimer !== undefined) {
        try {
          intervalTimer()
        } catch {
          // Already fired.
        }
        intervalTimer = undefined
      }
      for (const dispose of idleTimers.values()) {
        try {
          dispose()
        } catch {
          // Already settled.
        }
      }
      idleTimers.clear()
      buffers.clear()
      basis.clear()
    },
    'session-title-studio: policy teardown',
  )
}
