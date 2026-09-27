// The finding schema every check produces. See README's wording rule and
// Section 5.3 of the internal roadmap: a finding states what a rule
// matched, never a verdict like "safe" or "dangerous" — severity plus a
// plain-English explanation is as far as this goes. The person reading it
// decides what it means for them.

export type Severity = 'critical' | 'high' | 'medium' | 'info'

/**
 * Rule IDs are versioned as a set, not individually — RULES_VERSION in
 * engine.ts is what ships in the "no known issues found by rules vX.Y"
 * wording, and what a suppression entry pins against.
 */
export interface Finding {
  ruleId: string
  severity: Severity
  /** OWASP category IDs this maps to, e.g. "MCP01:2025" or "AST-06". Never invented — see engine.ts's comment on sourcing these. */
  owasp: string[]
  title: string
  /** Written for a reader with no security background. What is this, and why would it matter to them. */
  plainEnglish: string
  /** A concrete next step, not just "review this." */
  fix: string
  path: string
  line?: number
  /** The matched text, truncated — enough to see why the rule fired, never the whole file. */
  snippet?: string
}

export interface RuleMeta {
  id: string
  severity: Severity
  owasp: string[]
  title: string
  plainEnglish: string
  fix: string
}

export function makeFinding(meta: RuleMeta, path: string, extra?: { line?: number; snippet?: string }): Finding {
  const finding: Finding = {
    ruleId: meta.id,
    severity: meta.severity,
    owasp: meta.owasp,
    title: meta.title,
    plainEnglish: meta.plainEnglish,
    fix: meta.fix,
    path,
  }
  if (extra?.line !== undefined) finding.line = extra.line
  if (extra?.snippet !== undefined) finding.snippet = extra.snippet
  return finding
}
