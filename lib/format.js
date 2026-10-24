/**
 * Title text helpers: UTF-8 budgeting and display-character cleanup.
 *
 * Pure module. The Host providers use it before handing a title to the
 * session-title service, which normalizes and caps titles again.
 */

const encoder = new TextEncoder()

/**
 * Count the UTF-8 bytes of a string.
 * @param {string} text - Any string.
 * @returns {number} Byte length under UTF-8.
 */
export function utf8Bytes(text) {
  return encoder.encode(String(text ?? '')).length
}

/**
 * Truncate a string without splitting a Unicode code point.
 * @param {string} text - Source text.
 * @param {number} maxBytes - Maximum UTF-8 bytes.
 * @returns {string} The longest prefix within the byte budget.
 */
export function truncateUtf8(text, maxBytes) {
  const source = String(text ?? '')
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return ''
  if (utf8Bytes(source) <= maxBytes) return source
  let output = ''
  let used = 0
  for (const character of source) {
    const size = utf8Bytes(character)
    if (used + size > maxBytes) break
    output += character
    used += size
  }
  return output
}

const ANSI_ESCAPE = /\u001B\[[0-?]*[ -/]*[@-~]/g
const C0_C1_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const DIRECTIONAL_AND_INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g

/**
 * Normalize a proposed title into one clean display line.
 *
 * Removes ANSI escapes, bidi/invisible marks and control characters, then
 * collapses every whitespace run (including newlines) into one space.
 * @param {string} text - Raw title candidate.
 * @returns {string} Cleaned, single-line title text.
 */
export function sanitizeTitle(text) {
  return String(text ?? '')
    .replace(ANSI_ESCAPE, '')
    .replace(DIRECTIONAL_AND_INVISIBLE, '')
    .replace(C0_C1_CONTROLS, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * Compose a final title from deterministic decoration and model output.
 *
 * The prefix and suffix are applied verbatim, then the whole string is
 * sanitized and truncated to the configured byte budget. The session-title
 * service normalizes again; keeping the budget here avoids cutting the
 * suffix off inside the service.
 * @param {string} core - Model-produced title.
 * @param {string} prefix - Deterministic prefix (e.g. `[dsh] `).
 * @param {string} suffix - Deterministic suffix (e.g. ` · 2026-10-18`).
 * @param {number} maxBytes - Maximum UTF-8 bytes.
 * @returns {string} Final title candidate.
 */
export function composeTitle(core, prefix, suffix, maxBytes) {
  const composed = sanitizeTitle(`${prefix ?? ''}${core ?? ''}${suffix ?? ''}`)
  return sanitizeTitle(truncateUtf8(composed, maxBytes))
}
