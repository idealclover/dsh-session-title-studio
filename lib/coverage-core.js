import { sanitizeTitle } from './format.js'

/** Incremental message watermark; sampling sources must not look like new input. */
export const coverageInit = () => ({ count: 0, covered: 0, first: null, tail: [] })

export function foldCoverage(state, event) {
  if (event.type === 'user/message' && event.data?.source?.kind === 'user') {
    const text = (event.data.content ?? []).filter((block) => block.type === 'text')
      .map((block) => block.text).join('\n').trim()
    if (!sanitizeTitle(text)) return state
    return {
      ...state, count: state.count + 1, first: state.first ?? event.seq,
      tail: [...state.tail.slice(-255), event.seq],
    }
  }
  if (event.type !== 'session/title') return state
  const seqs = event.data.messageSeqs ?? []
  const through = seqs.reduce((max, seq) => Math.max(max, seq), -1)
  const at = state.tail.lastIndexOf(through)
  const covered = at >= 0 ? state.count - state.tail.length + at + 1
    : through === state.first ? 1 : 0
  return { ...state, covered }
}
