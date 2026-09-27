// Shared helper: run a regex against text and report each match with its
// line number and a truncated snippet, so every check module produces
// findings the same way instead of reimplementing line-counting.

export interface TextMatch {
  line: number
  snippet: string
}

const SNIPPET_MAX = 160

export function findMatches(text: string, pattern: RegExp): TextMatch[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
  const global = new RegExp(pattern.source, flags)
  const matches: TextMatch[] = []
  let match: RegExpExecArray | null
  while ((match = global.exec(text)) !== null) {
    const upToMatch = text.slice(0, match.index)
    const line = upToMatch.split('\n').length
    const raw = match[0]
    const snippet = raw.length > SNIPPET_MAX ? raw.slice(0, SNIPPET_MAX) + '…' : raw
    matches.push({ line, snippet: snippet.replace(/\s+/g, ' ').trim() })
    // Guard against zero-length matches looping forever.
    if (match[0].length === 0) global.lastIndex++
  }
  return matches
}
