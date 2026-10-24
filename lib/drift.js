/**
 * Local topic-drift scoring for Session Title Studio.
 *
 * Pure module. The policy compares a bounded window of recent human messages
 * with the messages that produced the current title. No model call is made:
 * we tokenize Latin words and CJK bigrams and combine containment with
 * Jaccard overlap, which tolerates a follow-up that repeats the topic while
 * still separating a new subject.
 */

/** Function words that carry no topic signal. */
const LATIN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'about', 'have', 'has',
  'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'you', 'your',
  'our', 'but', 'not', 'just', 'now', 'then', 'please', 'help', 'need', 'want',
  'make', 'let', 'use', 'using', 'okay', 'ok', 'yes', 'still', 'again', 'also',
])

/** Chinese bigrams that are conversational filler rather than topic. */
const CJK_STOP_BIGRAMS = new Set([
  '帮我', '我看', '一下', '这个', '那个', '现在', '还是', '可以', '需要', '一个',
  '然后', '就是', '只是', '因为', '所以', '如果', '但是', '我们', '你们', '他们',
  '什么', '怎么', '这样', '那样', '已经', '正在', '可能', '应该', '不要', '没有',
  '不是', '好的', '收到', '继续', '麻烦', '谢谢', '或者', '而且', '不过',
])

/**
 * Remove code blocks, inline code and URLs before tokenizing. Titles describe
 * the task, not a pasted payload, so a large code block should not decide the
 * drift score.
 * @param {string} text - Raw message text.
 * @returns {string} Prose-only text.
 */
export function stripNoise(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/gu, ' ')
}

/**
 * Tokenize text into lowercase Latin words and CJK character bigrams.
 * @param {string} text - Raw text.
 * @returns {Set<string>} Topic tokens.
 */
export function tokenize(text) {
  const clean = stripNoise(text)
  const tokens = new Set()
  for (const match of clean.toLowerCase().matchAll(/[a-z][a-z0-9_+#.-]+/gu)) {
    const word = match[0].replace(/[.+#-]+$/u, '')
    if (word.length >= 2 && !LATIN_STOPWORDS.has(word)) tokens.add(`w:${word}`)
  }
  for (const match of clean.matchAll(/[\u3400-\u9fff\uf900-\ufaff]+/gu)) {
    const run = match[0]
    if (run.length === 1) {
      tokens.add(`c:${run}`)
      continue
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      const bigram = run.slice(index, index + 2)
      if (!CJK_STOP_BIGRAMS.has(bigram)) tokens.add(`c:${bigram}`)
    }
  }
  return tokens
}

/**
 * Combined token similarity in [0, 1].
 *
 * Containment dominates so a short, still-relevant title basis is not
 * penalized when the new message expands it; Jaccard keeps unrelated text from
 * scoring high just because it repeats one generic phrase.
 * @param {Set<string>} left - First token set.
 * @param {Set<string>} right - Second token set.
 * @returns {number} Similarity, 0 when either set is empty.
 */
export function similarity(left, right) {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  if (intersection === 0) return 0
  const containment = intersection / Math.min(left.size, right.size)
  const jaccard = intersection / (left.size + right.size - intersection)
  return 0.7 * containment + 0.3 * jaccard
}

/**
 * Score how much the recent messages have drifted from the title basis.
 * @param {string} basis - Text that produced the current title.
 * @param {string} recent - Human messages since the current title.
 * @returns {number} Drift in [0, 1]; 0 means no change, 1 means unrelated.
 */
export function driftScore(basis, recent) {
  const recentTokens = tokenize(recent)
  if (recentTokens.size === 0) return 0
  const basisTokens = tokenize(basis)
  if (basisTokens.size === 0) return 1
  return 1 - similarity(basisTokens, recentTokens)
}
