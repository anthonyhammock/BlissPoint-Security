// Plain-language terminal output. The audience for this isn't only a
// security engineer — a big part of this product's point is that a
// non-technical founder or engineering manager should be able to read this
// and understand what their AI agent is trusting, without translation.

import type { DiscoveredItem, Inventory } from '../discovery/index.js'
import type { Finding, ScanResult } from '../rules/index.js'

const CLIENT_LABELS: Record<DiscoveredItem['client'], string> = {
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  cursor: 'Cursor',
}

const KIND_LABELS: Record<DiscoveredItem['kind'], string> = {
  'mcp-config': 'MCP server config',
  skill: 'Agent Skill',
  memory: 'memory / instruction file',
}

function describeItem(item: DiscoveredItem): string {
  const scopeLabel = item.scope === 'project' ? 'shared with this project' : 'this machine only'
  switch (item.kind) {
    case 'mcp-config': {
      if (item.parseError) {
        return `  ⚠ ${item.path}\n      Could not be read as valid configuration (${item.parseError}). Worth a manual look.`
      }
      const count = item.servers.length
      const noun = count === 1 ? 'server' : 'servers'
      return `  • ${item.path}\n      Defines ${count} MCP ${noun} (${scopeLabel}). Every tool these servers expose is something your agent can call without asking again.`
    }
    case 'skill': {
      const manifestNote = item.manifestPath ? '' : ' — no SKILL.md found; Claude may not load it correctly.'
      return `  • ${item.path}\n      An Agent Skill named "${item.name}" (${scopeLabel}), ${item.files.length} file(s) inside.${manifestNote}`
    }
    case 'memory': {
      return `  • ${item.path}\n      A ${item.filename} file (${scopeLabel}) — your agent reads this automatically on every session, without being asked.`
    }
  }
}

export function formatInventoryHuman(inventory: Inventory): string {
  const lines: string[] = []
  lines.push('agentlock — inventory of what your AI agent will load automatically')
  lines.push('='.repeat(72))
  lines.push('')
  lines.push(
    'In plain terms: everything listed below is something Claude Code, Claude'
  )
  lines.push(
    'Desktop, or Cursor will read or run without you approving it again each'
  )
  lines.push(
    'time — MCP server tools, Agent Skills, and files the agent treats as'
  )
  lines.push(
    'standing instructions. This is the full list. See the findings below for'
  )
  lines.push('what, if anything, looks worth a closer look.')
  lines.push('')
  lines.push(`Scanned: ${inventory.projectDir}`)
  lines.push(`At:      ${inventory.generatedAt}`)
  lines.push('')

  if (inventory.items.length === 0) {
    lines.push('Nothing found for Claude Code, Claude Desktop, or Cursor at this location.')
    return lines.join('\n')
  }

  const byClient = new Map<DiscoveredItem['client'], DiscoveredItem[]>()
  for (const item of inventory.items) {
    const list = byClient.get(item.client) ?? []
    list.push(item)
    byClient.set(item.client, list)
  }

  for (const [client, items] of byClient) {
    lines.push(`${CLIENT_LABELS[client]} (${items.length} item${items.length === 1 ? '' : 's'})`)
    lines.push('-'.repeat(72))
    for (const item of items) {
      lines.push(describeItem(item))
    }
    lines.push('')
  }

  const totalServers = inventory.items
    .filter((i): i is Extract<DiscoveredItem, { kind: 'mcp-config' }> => i.kind === 'mcp-config')
    .reduce((sum, i) => sum + i.servers.length, 0)
  const totalSkills = inventory.items.filter((i) => i.kind === 'skill').length
  const totalMemory = inventory.items.filter((i) => i.kind === 'memory').length

  lines.push(
    `Summary: ${totalServers} MCP server${totalServers === 1 ? '' : 's'}, ${totalSkills} Agent Skill${totalSkills === 1 ? '' : 's'}, ${totalMemory} memory file${totalMemory === 1 ? '' : 's'}.`
  )
  lines.push('')
  lines.push('Kinds found, for reference: ' + Object.values(KIND_LABELS).join(', ') + '.')

  return lines.join('\n')
}

const SEVERITY_LABELS: Record<Finding['severity'], string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  info: 'INFO',
}

function formatFinding(finding: Finding): string {
  const location = finding.line ? `${finding.path}:${finding.line}` : finding.path
  const lines = [
    `[${SEVERITY_LABELS[finding.severity]}] ${finding.ruleId} — ${finding.title}`,
    `  ${location}`,
    `  What this means: ${finding.plainEnglish}`,
    `  What to do: ${finding.fix}`,
  ]
  if (finding.snippet) lines.push(`  Matched: ${finding.snippet}`)
  if (finding.owasp.length > 0) lines.push(`  Maps to: ${finding.owasp.join(', ')}`)
  return lines.join('\n')
}

/**
 * Per the project's own wording rule: never "safe" or "secure," anywhere in
 * this output, including the zero-findings case.
 */
export function formatScanResultHuman(result: ScanResult): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`Findings (rules v${result.rulesVersion})`)
  lines.push('='.repeat(72))

  if (result.findings.length === 0) {
    lines.push('')
    lines.push(`No known issues found by rules v${result.rulesVersion}.`)
    lines.push('This reflects what today\'s rules check for, not a guarantee nothing is wrong.')
    return lines.join('\n')
  }

  lines.push('')
  for (const finding of result.findings) {
    lines.push(formatFinding(finding))
    lines.push('')
  }

  const counts = result.findings.reduce(
    (acc, f) => {
      acc[f.severity]++
      return acc
    },
    { critical: 0, high: 0, medium: 0, info: 0 } as Record<Finding['severity'], number>
  )
  lines.push(
    `Summary: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.info} info.`
  )

  return lines.join('\n')
}
