// Suppression file: .blisspoint-security-suppressions.json at the project root.
// Section 5.3's requirement is specific — "a required justification for
// each entry (auditors like this)" — so this is deliberately exact-match
// (one entry silences one rule on one file), not glob-based. A wildcard
// suppression is easy for an auditor to miss the implications of; a flat
// list of "this rule, this file, here's why" is the thing they actually
// want to read. Matching is on the path *relative to the project root*,
// not the absolute path a Finding carries, so the file is portable across
// machines and CI — the whole point of committing it to the repo.

import { join, relative, sep } from 'node:path'
import { writeFileSync } from 'node:fs'
import { readJsonFile, fileExists } from './discovery/fs-utils.js'
import type { Finding } from './rules/types.js'

export const SUPPRESSIONS_FILENAME = '.blisspoint-security-suppressions.json'

export interface SuppressionEntry {
  ruleId: string
  /** Relative to the project root, forward-slash separated, e.g. "docs/example.md". */
  path: string
  /** Required — see the module comment. Not just "why suppressed" but ideally who reviewed it and when. */
  justification: string
  addedBy?: string
  addedAt?: string
}

export interface LoadedSuppressions {
  entries: SuppressionEntry[]
  /** Non-fatal problems with the file — e.g. an entry with no justification. The file still loads with valid entries kept; invalid ones are reported, not silently dropped or silently accepted. */
  errors: string[]
}

function toPosixRelative(path: string, projectDir: string): string {
  return relative(projectDir, path).split(sep).join('/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function loadSuppressions(projectDir: string): LoadedSuppressions {
  const path = join(projectDir, SUPPRESSIONS_FILENAME)
  if (!fileExists(path)) return { entries: [], errors: [] }

  const result = readJsonFile(path)
  if (!result.ok) {
    return { entries: [], errors: [`${SUPPRESSIONS_FILENAME}: ${result.error}`] }
  }
  if (!isRecord(result.data) || !Array.isArray(result.data['suppressions'])) {
    return { entries: [], errors: [`${SUPPRESSIONS_FILENAME}: expected a top-level "suppressions" array`] }
  }

  const entries: SuppressionEntry[] = []
  const errors: string[] = []
  result.data['suppressions'].forEach((raw: unknown, index: number) => {
    if (!isRecord(raw)) {
      errors.push(`${SUPPRESSIONS_FILENAME}[${index}]: not an object, skipped`)
      return
    }
    const ruleId = raw['ruleId']
    const entryPath = raw['path']
    const justification = raw['justification']
    if (typeof ruleId !== 'string' || !ruleId) {
      errors.push(`${SUPPRESSIONS_FILENAME}[${index}]: missing "ruleId", skipped`)
      return
    }
    if (typeof entryPath !== 'string' || !entryPath) {
      errors.push(`${SUPPRESSIONS_FILENAME}[${index}]: missing "path", skipped`)
      return
    }
    if (typeof justification !== 'string' || justification.trim().length === 0) {
      errors.push(`${SUPPRESSIONS_FILENAME}[${index}] (${ruleId} on ${entryPath}): missing "justification" — required, entry skipped`)
      return
    }
    const entry: SuppressionEntry = { ruleId, path: entryPath, justification }
    if (typeof raw['addedBy'] === 'string') entry.addedBy = raw['addedBy']
    if (typeof raw['addedAt'] === 'string') entry.addedAt = raw['addedAt']
    entries.push(entry)
  })

  return { entries, errors }
}

export interface SuppressionApplication {
  active: Finding[]
  suppressed: { finding: Finding; entry: SuppressionEntry }[]
}

export function applySuppressions(findings: Finding[], entries: SuppressionEntry[], projectDir: string): SuppressionApplication {
  const active: Finding[] = []
  const suppressed: { finding: Finding; entry: SuppressionEntry }[] = []

  for (const finding of findings) {
    const relativePath = toPosixRelative(finding.path, projectDir)
    const match = entries.find((entry) => entry.ruleId === finding.ruleId && entry.path === relativePath)
    if (match) suppressed.push({ finding, entry: match })
    else active.push(finding)
  }

  return { active, suppressed }
}

/** Appends a new, validated entry to the suppression file, creating it if it doesn't exist yet. Used by `blisspoint-security suppress`. */
export function addSuppression(projectDir: string, entry: SuppressionEntry): void {
  const path = join(projectDir, SUPPRESSIONS_FILENAME)
  const existing = loadSuppressions(projectDir)
  const next = { suppressions: [...existing.entries, entry] }
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8')
}
