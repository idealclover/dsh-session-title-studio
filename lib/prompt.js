/**
 * Prompt construction and model-output parsing for Session Title Studio.
 *
 * Pure module: the same functions run in the Host provider and in tests, so
 * a recipe can be exercised without a running Harness.
 */

import { sanitizeTitle, composeTitle } from './format.js'
import { TEMPLATE_VARIABLES } from './constants.js'

const OUTPUT_RULES =
  'Return only the title on one line, in plain text of natural language, with no quotes, explanation, Markdown, XML, or terminal control codes. No code is allowed.'

/** Base instructions for each built-in preset. */
const PRESET_PROMPTS = {
  concise: [
    'Create a concise title for an AI coding-assistant session from the supplied human messages.',
    OUTPUT_RULES,
  ],
  action: [
    'Create a concise, action-oriented title for an AI coding-assistant session from the supplied human messages.',
    'Start with a verb phrase that names what the user is doing or trying to achieve, for example "Fix login timeout" or "Design a title plugin".',
    OUTPUT_RULES,
  ],
  'topic-tags': [
    'Create a short set of topic tags for an AI coding-assistant session from the supplied human messages.',
    'Return two or three short tags separated by " · ", most specific last, for example "Frontend · Auth · Timeout".',
    'Use plain text only: no quotes, explanation, Markdown, XML, or terminal control codes.',
  ],
  conventional: [
    'Create a title for an AI coding-assistant session in Conventional Commits style, from the supplied human messages.',
    'Use the form "type(scope): summary", for example "fix(auth): handle OAuth callback timeout". Keep type and scope lowercase; omit the scope when it is unclear.',
    'Return plain text only: no quotes, explanation, Markdown, XML, or terminal control codes.',
  ],
}

/**
 * Language instruction for the model.
 * @param {string} language - One of `auto`, `zh`, `en`, `bilingual`.
 * @returns {string} Instruction line.
 */
export function languageClause(language) {
  switch (language) {
    case 'zh':
      return 'Write the title in Simplified Chinese.'
    case 'en':
      return 'Write the title in English.'
    case 'bilingual':
      return 'Write the title as "Chinese / English": a short Chinese part, a slash, then a short English part.'
    case 'auto':
    default:
      return 'Use the language of the messages. If they mix languages, follow the dominant one.'
  }
}

/**
 * Length instruction for the model.
 * @param {object} config - Resolved recipe config.
 * @returns {string} Instruction line.
 */
export function lengthClause(config) {
  if (config.preset === 'conventional' || config.preset === 'topic-tags') {
    return `Keep it short: about ${config.targetWords} words or ${config.targetCjkCharacters} CJK characters in total.`
  }
  return `Aim for about ${config.targetWords} words in non-CJK languages or ${config.targetCjkCharacters} CJK characters.`
}

/**
 * Stability instruction applied when a provider-generated title exists.
 * @param {string} stability - One of `strict`, `balanced`, `follow`.
 * @returns {string[]} Instruction lines.
 */
export function stabilityClause(stability) {
  switch (stability) {
    case 'strict':
      return [
        'An existing title is supplied as currentTitle. If it still accurately describes the main topic or task, return it exactly unchanged.',
        'Follow-up questions, additional details within the same topic, acknowledgements such as "thanks", and requests to continue do not by themselves justify a title change.',
        'Do not reword, polish, shorten, or replace synonyms in an adequate title. Keeping its exact wording takes priority over the target length.',
        'Change the title only when the messages materially change or expand the main topic or task so that the existing title is no longer accurate.',
      ]
    case 'follow':
      return [
        'An existing title is supplied as currentTitle. Prefer a title that reflects the latest messages; change it whenever the focus has shifted or the title feels stale.',
      ]
    case 'balanced':
    default:
      return [
        'An existing title is supplied as currentTitle. Prefer keeping it when it still names the main topic or task.',
        'Change it when the conversation moves to a clearly different topic, or when the existing title has become misleading.',
      ]
  }
}

/**
 * Render `{{variable}}` placeholders. Unknown names are left untouched so a
 * typo stays visible instead of silently disappearing from the prompt.
 * @param {string} template - Template text.
 * @param {Record<string, string>} variables - Variable values.
 * @returns {string} Rendered text.
 */
export function renderTemplate(template, variables) {
  return String(template ?? '').replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu,
    (match, name) =>
      Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match,
  )
}

/**
 * List placeholder names a template uses that are not supported.
 * @param {string} template - Template text.
 * @returns {string[]} Unknown variable names, sorted and de-duplicated.
 */
export function findUnknownVariables(template) {
  const known = new Set(TEMPLATE_VARIABLES)
  const unknown = new Set()
  for (const match of String(template ?? '').matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu)) {
    if (!known.has(match[1])) unknown.add(match[1])
  }
  return [...unknown].sort()
}

/**
 * Build the full system prompt for one generation.
 * @param {object} config - Resolved recipe config.
 * @param {boolean} hasCurrentTitle - Whether a provider title is being anchored.
 * @param {Record<string, string>} variables - Template variables.
 * @returns {string} System prompt.
 */
export function systemPromptFor(config, hasCurrentTitle, variables) {
  if (config.preset === 'custom') {
    const custom = renderTemplate(config.systemPrompt, variables).trim()
    if (custom.length === 0) throw new Error('session-title-studio: custom preset requires a non-empty systemPrompt')
    return custom
  }
  const lines = [
    ...(PRESET_PROMPTS[config.preset] ?? PRESET_PROMPTS.concise),
    languageClause(config.language),
    lengthClause(config),
  ]
  if (hasCurrentTitle) lines.push(...stabilityClause(config.stability))
  const extra = renderTemplate(config.systemPrompt, variables).trim()
  if (extra.length > 0) lines.push(extra)
  return lines.join('\n')
}

/** Last path segment of an absolute or relative path. */
function baseName(path) {
  const parts = String(path ?? '').split(/[\\/]+/u).filter(Boolean)
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

/** Local calendar date as YYYY-MM-DD. */
function localDate(now) {
  const date = new Date(now)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Build template variables for one provider request.
 * @param {object} request - Session-title provider request.
 * @param {string|undefined} anchor - Existing provider title used as an anchor.
 * @param {number} [now] - Clock injection for tests.
 * @returns {Record<string, string>} Variable values.
 */
export function buildVariables(request, anchor, now = Date.now()) {
  const messages = request.messages.map((message) => ({ seq: message.seq, text: message.text }))
  return {
    messages: JSON.stringify(messages),
    transcript: messages.map((message, index) => `### Message ${index + 1}\n${message.text}`).join('\n\n'),
    currentTitle: anchor ?? '',
    firstMessage: request.messages[0]?.text ?? '',
    workspace: baseName(request.session?.header?.cwd),
    date: localDate(now),
    messageCount: String(messages.length),
  }
}

/**
 * Build the user input for one generation. The default framing uses JSON so
 * message text cannot break structural delimiters.
 * @param {object} config - Resolved recipe config.
 * @param {object} request - Session-title provider request.
 * @param {string|undefined} anchor - Existing provider title used as an anchor.
 * @param {Record<string, string>} variables - Template variables.
 * @returns {string} User input text.
 */
export function buildUserInput(config, request, anchor, variables) {
  if (config.userTemplate.trim().length > 0) {
    return renderTemplate(config.userTemplate, variables)
  }
  const messages = request.messages.map((message) => ({ seq: message.seq, text: message.text }))
  if (anchor !== undefined) {
    return `Update the session title from this JSON object:\n${JSON.stringify({ currentTitle: anchor, messages })}`
  }
  return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`
}

const QUOTE_PAIRS = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
  ['`', '`'],
]
const EMPHASIS_MARKERS = ['***', '**', '*', '___', '__', '_']

/**
 * Remove one layer of wrapping decoration from a title line.
 * @param {string} text - Candidate line.
 * @returns {string} Undecorated line.
 */
function undecorate(text) {
  let line = text.trim()
  line = line.replace(/^title\s*[:：]\s*/iu, '')
  line = line.replace(/^#{1,6}\s+/u, '')
  line = line.replace(/^[-*]\s+/u, '')
  for (const [open, close] of QUOTE_PAIRS) {
    if (line.startsWith(open) && line.endsWith(close) && line.length > open.length + close.length) {
      return line.slice(open.length, line.length - close.length).trim()
    }
  }
  for (const marker of EMPHASIS_MARKERS) {
    if (line.startsWith(marker) && line.endsWith(marker) && line.length > marker.length * 2) {
      return line.slice(marker.length, line.length - marker.length).trim()
    }
  }
  return line
}

/**
 * Turn one model response into a title candidate.
 *
 * Takes the first non-empty line (models that ignore the one-line instruction
 * put the title first), removes wrapping quotes/emphasis and a `Title:` label,
 * then sanitizes the result.
 * @param {object} response - Assembled session-title LLM response.
 * @returns {string} Clean title core, without prefix/suffix.
 * @throws {Error} on tool-call output, a max-token finish, or empty text.
 */
export function parseTitleOutput(response) {
  if (response.finish.kind !== 'stop') {
    throw new Error(`session-title-studio: title model finished with ${response.finish.kind}`)
  }
  if (response.blocks.some((block) => block.type === 'tool-call')) {
    throw new Error('session-title-studio: title output must contain text only')
  }
  const text = response.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
  const line = text
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .find((item) => item.length > 0) ?? ''
  let title = line
  for (let pass = 0; pass < 3; pass += 1) {
    const next = undecorate(title)
    if (next === title) break
    title = next
  }
  title = sanitizeTitle(title)
  if (title.length === 0) throw new Error('session-title-studio: title model produced no text')
  return title
}

/**
 * Compose the final title from a parsed core and the recipe decoration.
 * @param {string} core - Parsed model title.
 * @param {object} config - Resolved recipe config.
 * @returns {string} Final title candidate.
 */
export function finishTitle(core, config) {
  const title = composeTitle(core, config.prefix, config.suffix, config.maxTitleBytes)
  if (title.length === 0) throw new Error('session-title-studio: composed title is empty')
  return title
}
