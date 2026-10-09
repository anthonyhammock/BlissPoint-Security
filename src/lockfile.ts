// Content-hash lockfile for supply-chain drift detection — the same idea
// as package-lock.json's hash pinning, applied to everything blisspoint-security
// discovers, not just npm/PyPI packages. `blisspoint-security lock` records a sha256
// of every project-scoped MCP config, Agent Skill, and memory file as a
// baseline; `blisspoint-security scan --verify` diffs the current state against that
// baseline and flags anything new, changed, or gone since.
//
// This catches a real gap MCP-CFG-001 (unpinned npx/uvx) doesn't: a
// *pinned* server's script can still be edited on disk, a skill's bundled
// file can be swapped out, or a memory file can be quietly appended to —
// none of that shows up as "unpinned," but all of it is exactly the "rug
// pull" scenario the lockfile exists to catch.
//
// Only scope: 'project' items are recorded. User/machine-scope items
// (~/.claude.json, ~/.claude/skills/*) differ by design across every
// teammate's machine, so putting them in a file meant to be committed and
// shared would produce constant, meaningless "removed"/"added" noise on
// every other machine that runs `scan --verify`. Machine-scope drift is a
// real concern too, but it's a per-machine one — out of scope for a
// lockfile whose whole point is being committed to the repo.
//
// OWASP mapping: AST-07 ("Update Drift") is the category for a *changed*
// item — its published mitigation is literally "immutable pinning, hash
// verification," which is this mechanism. AST-02 ("Supply Chain
// Compromise") fits a *new, never-reviewed* item better, since that
// category is about something executing before explicit user trust
// confirmation. A *removed* item isn't a security risk by itself, so it
// carries no OWASP mapping — it's reported so the baseline can be updated,
// nothing more.

import { createHash } from 'node:crypto'
import { isAbsolute, join, relative, sep } from 'node:path'
import { writeFileSync } from 'node:fs'
import { fileExists, readJsonFile, readTextFile } from './discovery/fs-utils.js'
import type { DiscoveredItem, Inventory } from './discovery/index.js'
import { makeFinding, type Finding, type RuleMeta } from './rules/types.js'

export const LOCKFILE_FILENAME = 'agent-lock.json'
export const LOCKFILE_VERSION = 1

export interface LockEntry {
  client: DiscoveredItem['client']
  kind: DiscoveredItem['kind']
  scope: DiscoveredItem['scope']
  /** Relative to the project root, forward-slash separated — see the module comment on why only project-scope items are ever recorded here. */
  path: string
  /** "sha256:<hex>" over the item's actual on-disk content — see hashItem. */
  hash: string
}

export interface Lockfile {
  version: number
  generatedAt: string
  entries: LockEntry[]
}

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

/**
 * Hashes the actual bytes backing a discovered item — never its parsed
 * representation — so a change invisible to today's parser but present on
 * disk still breaks the hash. A skill's hash covers every one of its
 * files, so swapping out a single bundled script (without touching
 * SKILL.md) still counts as drift.
 */
export function hashItem(item: DiscoveredItem): string {
  switch (item.kind) {
    case 'mcp-config':
    case 'memory':
      return sha256(readTextFile(item.path) ?? '')
    case 'skill': {
      const parts: string[] = []
      if (item.manifestPath) parts.push(`SKILL.md\n${readTextFile(item.manifestPath) ?? ''}`)
      for (const relativePath of [...item.files].sort()) {
        if (relativePath === 'SKILL.md') continue // already covered via manifestPath above
        parts.push(`${relativePath}\n${readTextFile(join(item.path, relativePath)) ?? ''}`)
      }
      return sha256(parts.join('\u0000'))
    }
  }
}

function toRelativePosixPath(item: DiscoveredItem, projectDir: string): string {
  return relative(projectDir, item.path).split(sep).join('/')
}

function entryKey(e: { client: string; kind: string; scope: string; path: string }): string {
  return `${e.client}\u0000${e.kind}\u0000${e.scope}\u0000${e.path}`
}

export function buildLockEntries(inventory: Inventory): LockEntry[] {
  return inventory.items
    .filter((item) => item.scope === 'project')
    .map((item) => ({
      client: item.client,
      kind: item.kind,
      scope: item.scope,
      path: toRelativePosixPath(item, inventory.projectDir),
      hash: hashItem(item),
    }))
    .sort((a, b) => entryKey(a).localeCompare(entryKey(b)))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface LoadedLockfile {
  entries: LockEntry[]
  errors: string[]
}

export function loadLockfile(projectDir: string): LoadedLockfile {
  const path = join(projectDir, LOCKFILE_FILENAME)
  if (!fileExists(path)) return { entries: [], errors: [] }

  const result = readJsonFile(path)
  if (!result.ok) return { entries: [], errors: [`${LOCKFILE_FILENAME}: ${result.error}`] }
  if (!isRecord(result.data) || !Array.isArray(result.data['entries'])) {
    return { entries: [], errors: [`${LOCKFILE_FILENAME}: expected a top-level "entries" array`] }
  }

  const entries: LockEntry[] = []
  const errors: string[] = []
  result.data['entries'].forEach((raw: unknown, index: number) => {
    if (!isRecord(raw)) {
      errors.push(`${LOCKFILE_FILENAME}[${index}]: not an object, skipped`)
      return
    }
    const { client, kind, scope, path: entryPath, hash } = raw
    if (
      typeof client !== 'string' ||
      typeof kind !== 'string' ||
      typeof scope !== 'string' ||
      typeof entryPath !== 'string' ||
      typeof hash !== 'string'
    ) {
      errors.push(`${LOCKFILE_FILENAME}[${index}]: missing or invalid required field(s) (client, kind, scope, path, hash), skipped`)
      return
    }
    entries.push({ client: client as DiscoveredItem['client'], kind: kind as DiscoveredItem['kind'], scope: scope as DiscoveredItem['scope'], path: entryPath, hash })
  })

  return { entries, errors }
}

export function writeLockfile(projectDir: string, entries: LockEntry[]): void {
  const path = join(projectDir, LOCKFILE_FILENAME)
  const lockfile: Lockfile = { version: LOCKFILE_VERSION, generatedAt: new Date().toISOString(), entries }
  writeFileSync(path, JSON.stringify(lockfile, null, 2) + '\n', 'utf8')
}

export interface LockDiff {
  added: DiscoveredItem[]
  removed: LockEntry[]
  modified: { item: DiscoveredItem; lockedHash: string; currentHash: string }[]
  unchanged: number
}

/** Diffs the current inventory's project-scope items against a loaded lockfile baseline. */
export function diffLockfile(inventory: Inventory, locked: LockEntry[]): LockDiff {
  const projectItems = inventory.items.filter((item) => item.scope === 'project')
  const currentByKey = new Map(
    projectItems.map((item) => [
      entryKey({ client: item.client, kind: item.kind, scope: item.scope, path: toRelativePosixPath(item, inventory.projectDir) }),
      item,
    ])
  )
  const lockedByKey = new Map(locked.map((entry) => [entryKey(entry), entry]))

  const added: DiscoveredItem[] = []
  const modified: LockDiff['modified'] = []
  let unchanged = 0

  for (const [key, item] of currentByKey) {
    const lockedEntry = lockedByKey.get(key)
    if (!lockedEntry) {
      added.push(item)
      continue
    }
    const currentHash = hashItem(item)
    if (currentHash !== lockedEntry.hash) {
      modified.push({ item, lockedHash: lockedEntry.hash, currentHash })
    } else {
      unchanged++
    }
  }

  const removed = locked.filter((entry) => !currentByKey.has(entryKey(entry)))

  return { added, removed, modified, unchanged }
}

const LOCK_RULES = {
  new: {
    id: 'LOCK-001',
    severity: 'medium',
    owasp: ['AST-02'],
    title: 'New item found since the last lockfile baseline',
    plainEnglish:
      'This MCP server, Agent Skill, or memory file exists now but was not present the last time "blisspoint-security lock" recorded a baseline — nobody has reviewed it as part of this project\'s trusted surface yet.',
    fix: 'Review what this is and what it can do. Once you\'re satisfied, run "blisspoint-security lock" again to add it to the baseline.',
  },
  modified: {
    id: 'LOCK-002',
    severity: 'high',
    owasp: ['AST-07'],
    title: 'Content changed since the last lockfile baseline',
    plainEnglish:
      'This file\'s content no longer matches what "blisspoint-security lock" last recorded — the same server, skill, or memory file you previously reviewed now contains different instructions, code, or configuration. This is exactly how a "rug pull" works: something trusted quietly changes after the fact.',
    fix: 'Compare this against your last reviewed version before trusting it again. If the change is expected, run "blisspoint-security lock" to update the baseline.',
  },
  removed: {
    id: 'LOCK-003',
    severity: 'info',
    owasp: [],
    title: 'A previously locked item is no longer present',
    plainEnglish:
      'This item was in the last "blisspoint-security lock" baseline but was not found in this scan — it may have been deleted, renamed, or moved.',
    fix: 'If this is expected, run "blisspoint-security lock" again to update the baseline and drop the stale entry.',
  },
} as const satisfies Record<'new' | 'modified' | 'removed', RuleMeta>

export function lockDiffToFindings(diff: LockDiff, projectDir: string): Finding[] {
  const findings: Finding[] = []

  for (const item of diff.added) {
    findings.push(makeFinding(LOCK_RULES.new, item.path))
  }
  for (const { item, lockedHash, currentHash } of diff.modified) {
    findings.push(makeFinding(LOCK_RULES.modified, item.path, { snippet: `${lockedHash} -> ${currentHash}` }))
  }
  for (const entry of diff.removed) {
    const absolutePath = isAbsolute(entry.path) ? entry.path : join(projectDir, entry.path)
    findings.push(makeFinding(LOCK_RULES.removed, absolutePath))
  }

  return findings
}
