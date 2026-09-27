// Checks over the actual text of a local script — a skill's bundled file,
// or an MCP server launched from a local path this machine can read.
// Regex-based on purpose (Architecture Principle #3: deterministic rules by
// default, no LLM required) and deliberately narrow: each pattern is
// written to minimize false positives on ordinary code, even at the cost
// of missing some real injections — see Section 6, prevention #1 in the
// roadmap. A pattern here is not proof of a vulnerability; it's something
// specific enough to be worth a human's five seconds, which is the whole
// difference this product is trying to make over the ~78% false-positive
// rate the roadmap cites for existing YARA-based scanners.

import type { Finding, RuleMeta } from './types.js'
import { makeFinding } from './types.js'
import { findMatches } from './text-scan.js'

const COMMAND_INJECTION: RuleMeta = {
  id: 'SRC-001',
  severity: 'critical',
  owasp: ['MCP05:2025'],
  title: 'Shell command built from interpolated or concatenated input',
  plainEnglish:
    'This code runs a shell command that is partly built from a variable instead of being a fixed string. If that variable can ever contain attacker-controlled text (a filename, a tool argument, anything from outside this code), it can be used to run arbitrary commands, not just the one this code intended.',
  fix: 'Use the array form of exec/spawn (pass the command and arguments separately, not one interpolated string) so the shell never re-parses your input, or validate the value against a strict allow-list before it reaches the command.',
}

const SSRF: RuleMeta = {
  id: 'SRC-002',
  severity: 'high',
  owasp: ['A10:2021'],
  title: 'Outbound request to a variable URL with no visible validation',
  plainEnglish:
    'This code fetches a URL that comes from a variable rather than a fixed address. If that URL can be influenced by a tool caller or file content, the server can be tricked into making requests to internal systems it wasn\'t meant to reach (cloud metadata endpoints, internal admin panels, etc.) — that\'s Server-Side Request Forgery.',
  fix: 'Validate the URL against an allow-list of expected hosts before fetching it, and block requests to private/internal IP ranges.',
}

const PATH_TRAVERSAL: RuleMeta = {
  id: 'SRC-003',
  severity: 'high',
  owasp: ['A01:2021'],
  title: 'File path built from unsanitized interpolated input',
  plainEnglish:
    'This code reads or writes a file at a path that is partly built from a variable, without an obvious normalize/resolve/sanitize step nearby. A value like "../../etc/passwd" could let a caller read or write files well outside the folder this tool was meant to touch.',
  fix: 'Resolve the final path with path.resolve()/path.normalize() and confirm it still starts with the intended base directory before using it, or reject any input containing "..".',
}

const OBFUSCATED_BLOB: RuleMeta = {
  id: 'SRC-004',
  severity: 'medium',
  owasp: ['AST-04'],
  title: 'Long encoded (base64-looking) blob in source',
  plainEnglish:
    'This file contains a long block of text that looks like base64-encoded data sitting inside code, not a data file. That\'s a common way to hide a second-stage payload from someone skimming the source — it can also be entirely legitimate (an embedded image or font). Worth a look either way.',
  fix: 'Decode the blob and confirm what it actually contains before trusting this component.',
}

const OVERSIZED_FILE: RuleMeta = {
  id: 'SRC-005',
  severity: 'info',
  owasp: ['AST-04'],
  title: 'Unusually large file for its type',
  plainEnglish:
    'This file is large enough that a quick manual read is impractical. Attackers sometimes pad malicious files specifically so a reviewer — human or automated — gives up before reaching the relevant part. This is not itself a problem, just a flag that this file got a size-based check instead of a full read.',
  fix: 'If this size is unexpected for what the file is supposed to be, look closer at what\'s actually in it.',
}

const OVERSIZED_BYTES = 50_000
const OBFUSCATED_BLOB_MIN_LENGTH = 80

const COMMAND_INJECTION_PATTERNS: RegExp[] = [
  /\b(?:child_process\s*\.\s*)?(?:exec|execSync)\s*\(\s*`[^`]*\$\{/,
  /\b(?:child_process\s*\.\s*)?(?:exec|execSync)\s*\([^)]*["'`]\s*\+\s*\w/,
  /\bos\.system\(\s*f["']/,
  /\bsubprocess\.(?:run|call|Popen)\(\s*f["'][^)]*shell\s*=\s*True/,
  /\bsubprocess\.(?:run|call|Popen)\([^)]*shell\s*=\s*True[^)]*\+\s*\w/,
]

const SSRF_PATTERNS: RegExp[] = [
  /\bfetch\(\s*([A-Za-z_$][\w$]*)\s*[,)]/,
  /\baxios\s*\.\s*(?:get|post|put|delete)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/,
  /\brequests\.(?:get|post|put|delete)\(\s*([A-Za-z_]\w*)\s*[,)]/,
  /\burlopen\(\s*([A-Za-z_]\w*)\s*[,)]/,
]

// Deliberately requires the interpolated expression to look path-related
// (contain "file", "path", "name", "dir", or "folder") on top of the
// missing-sanitizer check. A bare numeric index like ${i + 1} or
// ${chunk_size} matches "an interpolated value with no sanitizer" just as
// well as a real traversal candidate would, and produced exactly that
// false positive during manual testing against real-world skill code
// (a page-numbering loop, not a path built from external input) — this is
// the kind of tuning the labeled benchmark corpus (still pending) exists
// to do systematically; this is a first, evidence-driven pass at it.
// Substring match, not a whole-word match — identifiers are naturally
// compound ("filename", "filePath", "userDir"), so a \b-bounded word
// wouldn't match "name" inside "filename" at all.
const PATH_LIKE_NAME = 'file|path|name|dir|folder'
const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  new RegExp(
    `\\bfs\\s*\\.\\s*(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|createWriteStream)\\s*\\(\\s*\`[^\`]*\\$\\{(?![^}]*(?:normalize|resolve|basename|sanitize))(?=[^}]*(?:${PATH_LIKE_NAME}))[^}]*\\}[^\`]*\``,
    'i'
  ),
  new RegExp(
    `\\bopen\\(\\s*f["'][^"']*\\{(?![^}]*(?:normpath|abspath|basename))(?=[^}]*(?:${PATH_LIKE_NAME}))[^}]*\\}`,
    'i'
  ),
]

const OBFUSCATED_BLOB_PATTERN = new RegExp(`[A-Za-z0-9+/]{${OBFUSCATED_BLOB_MIN_LENGTH},}={0,2}`)

function checkPatterns(text: string, path: string, patterns: RegExp[], meta: RuleMeta): Finding[] {
  const findings: Finding[] = []
  for (const pattern of patterns) {
    for (const match of findMatches(text, pattern)) {
      findings.push(makeFinding(meta, path, { line: match.line, snippet: match.snippet }))
    }
  }
  return findings
}

/** Runs every source-text check against one file's content. `sizeBytes` is passed separately since callers may already have it from a stat(), avoiding a second read. */
export function checkSourceText(path: string, text: string, sizeBytes: number): Finding[] {
  const findings: Finding[] = [
    ...checkPatterns(text, path, COMMAND_INJECTION_PATTERNS, COMMAND_INJECTION),
    ...checkPatterns(text, path, SSRF_PATTERNS, SSRF),
    ...checkPatterns(text, path, PATH_TRAVERSAL_PATTERNS, PATH_TRAVERSAL),
  ]

  const blobMatches = findMatches(text, OBFUSCATED_BLOB_PATTERN)
  if (blobMatches.length > 0) {
    // One finding per file for this, not one per match — a file either has
    // this pattern in it or it doesn't; ten near-identical matches in one
    // blob aren't ten separate things for a reader to act on.
    const first = blobMatches[0]!
    findings.push(makeFinding(OBFUSCATED_BLOB, path, { line: first.line, snippet: `${blobMatches.length} blob(s) found, first at line ${first.line}` }))
  }

  if (sizeBytes > OVERSIZED_BYTES) {
    findings.push(makeFinding(OVERSIZED_FILE, path, { snippet: `${sizeBytes.toLocaleString()} bytes (flagged above ${OVERSIZED_BYTES.toLocaleString()})` }))
  }

  return findings
}

export const SOURCE_CHECK_LIMITS = { OVERSIZED_BYTES, OBFUSCATED_BLOB_MIN_LENGTH }
