// SARIF 2.1.0 output, so results show up natively in GitHub code scanning
// (via `github/codeql-action/upload-sarif`) once the GitHub Action exists.
// See https://docs.oasis-open.org/sarif/sarif/v2.1.0/ for the schema this
// follows.
//
// One real subtlety: our TXT-* rules map to a different OWASP category
// depending on context (a skill vs. a memory file — see text-checks.ts's
// module comment). SARIF's `rules` array declares one static entry per
// rule id, so it can't hold a context-dependent value. The OWASP mapping
// for a *specific* finding lives in that result's own `properties.owasp`
// instead; the rule-level entry only carries what's true for the rule
// regardless of context (its id and title).

import { relative, sep } from 'node:path'
import type { Finding, Severity } from '../rules/types.js'
import type { ScanResult } from '../rules/engine.js'

const SEVERITY_TO_LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  info: 'note',
}

function toPosixRelative(path: string, baseDir: string): string {
  const rel = relative(baseDir, path)
  // A path outside the project dir (e.g. a user-scope config under the
  // real home directory) has no sensible repo-relative form — SARIF still
  // accepts an absolute file:// URI for that case.
  if (rel.startsWith('..')) return `file://${path}`
  return rel.split(sep).join('/')
}

interface SarifRule {
  id: string
  name: string
  shortDescription: { text: string }
  fullDescription: { text: string }
  help: { text: string }
  defaultConfiguration: { level: 'error' | 'warning' | 'note' }
}

function buildRules(findings: Finding[]): SarifRule[] {
  const byId = new Map<string, Finding>()
  for (const finding of findings) {
    if (!byId.has(finding.ruleId)) byId.set(finding.ruleId, finding)
  }
  return [...byId.values()]
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
    .map((finding) => ({
      id: finding.ruleId,
      name: finding.title.replace(/[^A-Za-z0-9]+/g, ''),
      shortDescription: { text: finding.title },
      fullDescription: { text: finding.plainEnglish },
      help: { text: finding.fix },
      defaultConfiguration: { level: SEVERITY_TO_LEVEL[finding.severity] },
    }))
}

export function toSarif(result: ScanResult): object {
  const rules = buildRules(result.findings)
  const ruleIndexById = new Map(rules.map((rule, index) => [rule.id, index]))

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'agentlock',
            version: result.rulesVersion,
            informationUri: 'https://github.com/anthonyhammock/BlissPoint-Security',
            rules,
          },
        },
        results: result.findings.map((finding) => ({
          ruleId: finding.ruleId,
          ruleIndex: ruleIndexById.get(finding.ruleId),
          level: SEVERITY_TO_LEVEL[finding.severity],
          message: {
            text: finding.snippet ? `${finding.plainEnglish} Matched: ${finding.snippet}` : finding.plainEnglish,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: toPosixRelative(finding.path, result.projectDir) },
                region: { startLine: finding.line ?? 1 },
              },
            },
          ],
          properties: {
            severity: finding.severity,
            owasp: finding.owasp,
          },
        })),
      },
    ],
  }
}
