// Orchestrates every check in this file against a built Inventory
// (see src/discovery/index.ts). This is the one place that decides which
// check applies to which kind of discovered item — the checks themselves
// stay pure functions over text/config, easy to unit test without a real
// filesystem walk.

import { dirname, isAbsolute, join } from 'node:path'
import { statSync } from 'node:fs'
import type { DiscoveredItem, Inventory } from '../discovery/index.js'
import { fileExists, readTextFile } from '../discovery/fs-utils.js'
import type { Finding } from './types.js'
import { checkMcpConfig } from './config-checks.js'
import { checkSourceText } from './source-checks.js'
import { checkInstructionText } from './text-checks.js'

/**
 * The version of the rule set itself, independent of the engine/CLI
 * version — Architecture Principle #5. This is what "no known issues found
 * by rules vX.Y" cites, and what a suppression entry should be reviewed
 * against when it changes.
 */
export const RULES_VERSION = '0.1.0'

const SCRIPT_INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'bash', 'sh', 'zsh'])

function readSized(path: string): { text: string; sizeBytes: number } | null {
  if (!fileExists(path)) return null
  const text = readTextFile(path)
  if (text === null) return null
  let sizeBytes: number
  try {
    sizeBytes = statSync(path).size
  } catch {
    sizeBytes = Buffer.byteLength(text, 'utf8')
  }
  return { text, sizeBytes }
}

function checkLocalServerScripts(configPath: string, servers: { command?: string; args?: string[] }[]): Finding[] {
  const findings: Finding[] = []
  const configDir = dirname(configPath)
  for (const server of servers) {
    if (!server.command || !SCRIPT_INTERPRETERS.has(server.command)) continue
    for (const arg of server.args ?? []) {
      if (arg.startsWith('-')) continue
      const candidate = isAbsolute(arg) ? arg : join(configDir, arg)
      const read = readSized(candidate)
      if (!read) continue
      findings.push(...checkSourceText(candidate, read.text, read.sizeBytes))
    }
  }
  return findings
}

function checkItem(item: DiscoveredItem): Finding[] {
  switch (item.kind) {
    case 'mcp-config': {
      const findings = checkMcpConfig(item)
      findings.push(...checkLocalServerScripts(item.path, item.servers))
      return findings
    }

    case 'skill': {
      const findings: Finding[] = []
      if (item.manifestPath) {
        const manifest = readSized(item.manifestPath)
        if (manifest) {
          findings.push(...checkInstructionText(item.manifestPath, manifest.text, 'skill'))
          findings.push(...checkSourceText(item.manifestPath, manifest.text, manifest.sizeBytes))
        }
      }
      for (const relativePath of item.files) {
        if (item.manifestPath && relativePath === 'SKILL.md') continue // already checked above
        const fullPath = join(item.path, relativePath)
        const read = readSized(fullPath)
        if (!read) continue
        findings.push(...checkSourceText(fullPath, read.text, read.sizeBytes))
      }
      return findings
    }

    case 'memory': {
      const read = readSized(item.path)
      if (!read) return []
      return [...checkInstructionText(item.path, read.text, 'memory'), ...checkSourceText(item.path, read.text, read.sizeBytes)]
    }
  }
}

export interface ScanResult {
  rulesVersion: string
  generatedAt: string
  projectDir: string
  findings: Finding[]
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { critical: 0, high: 1, medium: 2, info: 3 }

export function runChecks(inventory: Inventory): ScanResult {
  const findings: Finding[] = []
  for (const item of inventory.items) {
    findings.push(...checkItem(item))
  }
  findings.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    if ((a.line ?? 0) !== (b.line ?? 0)) return (a.line ?? 0) - (b.line ?? 0)
    return a.ruleId.localeCompare(b.ruleId)
  })
  return { rulesVersion: RULES_VERSION, generatedAt: inventory.generatedAt, projectDir: inventory.projectDir, findings }
}
