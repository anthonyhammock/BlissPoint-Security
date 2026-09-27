// Claude Code adapter. Locations below are drawn from Claude Code's current
// public documentation as of this writing:
//   - Project-scope MCP servers:  <project>/.mcp.json
//   - User-scope MCP servers:     ~/.claude.json ("mcpServers" key)
//   - Project skills:             <project>/.claude/skills/*/SKILL.md
//   - User skills:                ~/.claude/skills/*/SKILL.md
//   - Memory/instruction files:   <project>/CLAUDE.md, AGENTS.md, MEMORY.md; ~/.claude/CLAUDE.md
//
// These paths are the part of this adapter most likely to need updating as
// Claude Code's own config format evolves — that's exactly why this is an
// isolated adapter module (see the architecture note in README.md) rather
// than inline logic in the scan command.

import { join } from 'node:path'
import type { ClientAdapter, DiscoveredItem, DiscoveryRoots } from './types.js'
import { dirExists, fileExists, listFilesRecursive, listSubdirectories, readJsonFile } from './fs-utils.js'
import { parseMcpServers } from './mcp-config-parser.js'

const MEMORY_FILENAMES = ['CLAUDE.md', 'AGENTS.md', 'MEMORY.md']

function discoverMcpConfig(path: string, client: 'claude-code', scope: 'project' | 'user'): DiscoveredItem | null {
  if (!fileExists(path)) return null
  const result = readJsonFile(path)
  if (!result.ok) {
    return { kind: 'mcp-config', client, scope, path, servers: [], parseError: result.error }
  }
  const parsed = parseMcpServers(result.data)
  if (!parsed.ok) {
    return { kind: 'mcp-config', client, scope, path, servers: [], parseError: parsed.error }
  }
  return { kind: 'mcp-config', client, scope, path, servers: parsed.servers, raw: result.data }
}

function discoverSkills(skillsDir: string, client: 'claude-code', scope: 'project' | 'user'): DiscoveredItem[] {
  const items: DiscoveredItem[] = []
  for (const name of listSubdirectories(skillsDir)) {
    const dir = join(skillsDir, name)
    const manifestPath = join(dir, 'SKILL.md')
    items.push({
      kind: 'skill',
      client,
      scope,
      path: dir,
      name,
      manifestPath: fileExists(manifestPath) ? manifestPath : null,
      files: listFilesRecursive(dir),
    })
  }
  return items
}

function discoverMemoryFiles(
  dir: string,
  filenames: string[],
  client: 'claude-code',
  scope: 'project' | 'user'
): DiscoveredItem[] {
  const items: DiscoveredItem[] = []
  for (const filename of filenames) {
    const path = join(dir, filename)
    if (fileExists(path)) {
      items.push({ kind: 'memory', client, scope, path, filename })
    }
  }
  return items
}

export const claudeCodeAdapter: ClientAdapter = {
  id: 'claude-code',
  discover(roots: DiscoveryRoots): DiscoveredItem[] {
    const items: DiscoveredItem[] = []

    const projectConfig = discoverMcpConfig(join(roots.projectDir, '.mcp.json'), 'claude-code', 'project')
    if (projectConfig) items.push(projectConfig)

    // ~/.claude.json's exact schema for user-scope servers (flat top-level
    // "mcpServers" vs. nested per-project entries) isn't independently
    // verified against a live install as of this writing. parseMcpServers
    // degrades safely either way — a top-level object with no "mcpServers"
    // key reports zero servers, not an error — but this is the one path in
    // this adapter most likely to need a follow-up fix once verified.
    const userConfig = discoverMcpConfig(join(roots.homeDir, '.claude.json'), 'claude-code', 'user')
    if (userConfig) items.push(userConfig)

    items.push(...discoverSkills(join(roots.projectDir, '.claude', 'skills'), 'claude-code', 'project'))
    items.push(...discoverSkills(join(roots.homeDir, '.claude', 'skills'), 'claude-code', 'user'))

    items.push(...discoverMemoryFiles(roots.projectDir, MEMORY_FILENAMES, 'claude-code', 'project'))
    if (dirExists(join(roots.homeDir, '.claude'))) {
      items.push(...discoverMemoryFiles(join(roots.homeDir, '.claude'), ['CLAUDE.md'], 'claude-code', 'user'))
    }

    return items
  },
}
