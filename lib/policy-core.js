/**
 * Pure refresh-policy decisions.
 *
 * Keeping this module free of Cordis makes the safety rules testable in
 * isolation: pin protection, staleness, minimum spacing, turn thresholds and
 * the daily budget all resolve here.
 */

/**
 * Local calendar day key used for the daily budget.
 * @param {number} now - Unix epoch milliseconds.
 * @returns {string} `YYYY-MM-DD` in local time.
 */
export function localDayKey(now) {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** One skipped decision, carrying a stable machine-readable reason. */
function skip(reason, details) {
  return { ok: false, skip: reason, ...details }
}

/**
 * Decide whether one refresh should run.
 *
 * Manual refreshes are an explicit human action: they bypass staleness, the
 * minimum interval and the daily budget, but still respect a pinned title
 * unless `force` is set. Automatic refreshes must pass every guard.
 * @param {object} input - Decision input.
 * @param {string} input.reason - manual, idle, every-n-turns, or interval.
 * @param {number} input.now - Current epoch milliseconds.
 * @param {object|undefined} input.title - Latest title snapshot.
 * @param {number} input.inputCount - Eligible human messages in the session.
 * @param {object|undefined} input.state - Previous per-session state.
 * @param {object} input.config - Resolved policy config.
 * @param {boolean} [input.force] - Manual force flag.
 * @param {boolean} [input.isSubagent] - Whether this is a subagent session.
 * @param {{score: number, recentChars: number}} [input.drift] - Local drift score for the new messages.
 * @returns {{ok: boolean, skip?: string, newMessages?: number, dayKey: string, countToday: number}}
 */
export function evaluateRefresh({
  reason,
  now,
  title,
  inputCount,
  state,
  config,
  force = false,
  isSubagent = false,
  drift,
  coveredCount,
}) {
  const dayKey = localDayKey(now)
  const countToday = state?.dayKey === dayKey ? (state.countToday ?? 0) : 0
  const covered = coveredCount ?? (Array.isArray(title?.messageSeqs) ? title.messageSeqs.length : 0)
  const newMessages = Math.max(0, (inputCount ?? 0) - covered)
  const pinned = title?.source?.kind === 'user'
  const details = { newMessages, dayKey, countToday }

  if (isSubagent && !config.includeSubagents) return skip('subagent', details)
  if (pinned && config.respectPinned && !force) return skip('pinned', details)
  if (reason !== 'manual' && newMessages <= 0) return skip('no-new-input', details)
  if (
    reason === 'every-n-turns' &&
    config.everyNTurns > 0 &&
    newMessages < config.everyNTurns
  ) {
    return skip('below-turn-threshold', details)
  }
  if (reason !== 'manual' && config.enableDrift) {
    if (newMessages < config.driftMinNewMessages) return skip('drift-too-few', details)
    if (newMessages < config.driftForceAfterMessages) {
      if ((drift?.recentChars ?? 0) < config.driftMinChars) {
        return skip('drift-too-short', details)
      }
      if ((drift?.score ?? 1) < config.driftThreshold) return skip('no-drift', details)
    }
  }
  if (reason !== 'manual' && now - (state?.lastAttemptAt ?? 0) < config.minIntervalMs) {
    return skip('min-interval', details)
  }
  if (reason !== 'manual' && countToday >= config.maxRefreshesPerSessionPerDay) {
    return skip('daily-cap', details)
  }
  return { ok: true, ...details }
}

/**
 * Whether the current title still covers every eligible message.
 * @param {object|undefined} title - Latest title snapshot.
 * @param {number} inputCount - Eligible human messages in the session.
 * @returns {boolean} True when a refresh would see new input.
 */
export function hasNewInput(title, inputCount, coveredCount) {
  const covered = coveredCount ?? (Array.isArray(title?.messageSeqs) ? title.messageSeqs.length : 0)
  return (inputCount ?? 0) > covered
}
