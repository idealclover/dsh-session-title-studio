/** Budget title inputs before expanding templates; never truncate rendered JSON. */
import { buildVariables, buildUserInput, systemPromptFor } from './prompt.js'
import { utf8Bytes, truncateUtf8 } from './format.js'

const MAX_SOURCES = 12
const MARKER = '[…]'
const MARKER_BYTES = utf8Bytes(MARKER)

// Only inspect bounded windows of very large strings. In particular, do not
// serialize the full history, even temporarily, to discover that it is too big.
function clipText(text, allowance) {
  const source = String(text ?? '')
  if (source.length <= allowance && utf8Bytes(source) <= allowance) return source
  if (allowance < MARKER_BYTES) return ''
  const headBytes = Math.ceil((allowance - MARKER_BYTES) / 2)
  const tailBytes = allowance - MARKER_BYTES - headBytes
  let headWindow = source.slice(0, headBytes + 2)
  if (/[\uD800-\uDBFF]$/u.test(headWindow)) headWindow = headWindow.slice(0, -1)
  const head = truncateUtf8(headWindow, headBytes)
  let tail = ''
  let used = 0
  for (let end = source.length; end > 0;) {
    let start = end - 1
    if (start > 0 && /[\uDC00-\uDFFF]/u.test(source[start]) && /[\uD800-\uDBFF]/u.test(source[start - 1])) start -= 1
    const character = source.slice(start, end)
    const size = utf8Bytes(character)
    if (used + size > tailBytes) break
    tail = character + tail
    used += size
    end = start
  }
  return head + MARKER + tail
}

function uses(template, name) {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'u').test(String(template ?? ''))
}

/**
 * Select at most twelve sources (first request and the latest eleven), then
 * binary-search per-message text allowances against the *rendered* byte count.
 * maxInputBytes applies to user input, not the system prompt. Both prompts use
 * exactly the same bounded variables. The request and its messages are untouched.
 */
export function prepareTitleInput(config, request, anchor, now = Date.now()) {
  const budget = config.maxInputBytes
  if (!Number.isSafeInteger(budget) || budget < 1) {
    throw new Error('session-title-studio: maxInputBytes must be a positive integer')
  }
  const total = request.messages.length
  if (total === 0) throw new Error('session-title-studio: no eligible human messages to title')
  const custom = String(config.userTemplate ?? '').trim().length > 0
  const templates = `${config.userTemplate ?? ''}\n${config.systemPrompt ?? ''}`
  const needsFirst = uses(templates, 'firstMessage')
  const needsHistory = !custom || uses(templates, 'messages') || uses(templates, 'transcript')
  const fixedError = (bytes) => new Error(
    `session-title-studio: fixed input scaffolding requires ${bytes} bytes, exceeding maxInputBytes (${budget}); shorten the custom template, fixed variables, or increase the budget`,
  )
  if (custom) {
    const empty = { ...request, messages: [] }
    const fixed = buildUserInput(config, empty, anchor, buildVariables(empty, anchor, now))
    if (utf8Bytes(fixed) > budget) throw fixedError(utf8Bytes(fixed))
    if (!needsHistory && !needsFirst) {
      throw new Error('session-title-studio: custom prompts must reference {{messages}}, {{transcript}}, or {{firstMessage}} to identify at least one message source')
    }
  }
  const initial = needsHistory
    ? [request.messages[0], ...request.messages.slice(Math.max(1, total - MAX_SOURCES + 1))]
    : [request.messages[0]]
  let sources = initial
  let effectiveAnchor = anchor
  let compact = false

  const render = (allowance) => {
    const messages = sources.map((message) => ({ seq: message.seq, text: clipText(message.text, allowance) }))
    const sampled = { ...request, messages }
    const variables = buildVariables(sampled, effectiveAnchor, now)
    const input = compact
      ? JSON.stringify(effectiveAnchor === undefined ? { messages } : { currentTitle: effectiveAnchor, messages })
      : buildUserInput(config, sampled, effectiveAnchor, variables)
    return { messages, variables, input, bytes: utf8Bytes(input) }
  }
  // The fast path retains every byte of small inputs, including the original
  // framing and anchor. Even this render only sees bounded message text.
  let result = render(budget)
  if (result.bytes > budget) {
    let minimum = render(MARKER_BYTES)
    while (minimum.bytes > budget) {
      if (sources.length > 1) {
        // Preserve first+latest while possible. With one slot, newest wins,
        // unless firstMessage is explicitly required by either template.
        sources = sources.length === 2
          ? [needsFirst ? sources[0] : sources[1]]
          : [sources[0], ...sources.slice(2)]
      } else if (!custom && effectiveAnchor !== undefined) {
        effectiveAnchor = undefined
        sources = initial
      } else if (!custom && !compact) {
        compact = true
        sources = initial
      } else {
        // Try empty text before declaring that the immutable framing cannot
        // fit. This also supports exceptionally small custom input budgets.
        minimum = render(0)
        if (minimum.bytes <= budget) break
        throw fixedError(minimum.bytes)
      }
      minimum = render(MARKER_BYTES)
    }
    result = minimum
    let low = result.messages.some((message) => message.text === MARKER) ? MARKER_BYTES : 0
    // A checked fitting result is retained throughout: JSON escaping and
    // repeated placeholders are charged at their actual expanded byte cost.
    let high = budget
    while (low <= high) {
      const allowance = Math.floor((low + high) / 2)
      const candidate = render(allowance)
      if (candidate.bytes <= budget) {
        result = candidate
        low = allowance + 1
      } else {
        high = allowance - 1
      }
    }
  }
  const omitted = total - sources.length
  const clipped = result.messages.some((message, index) => message.text !== sources[index].text)
  return {
    system: systemPromptFor(config, effectiveAnchor !== undefined, result.variables),
    input: result.input,
    messageSeqs: sources.map((message) => message.seq),
    stats: {
      totalMessageCount: total,
      selectedMessageCount: sources.length,
      omittedMessageCount: omitted,
      truncated: omitted > 0 || clipped || effectiveAnchor !== anchor,
    },
  }
}