// Cursor adapter. Locations per Cursor's current public documentation:
//   - Project-scope MCP servers: <project>/.cursor/mcp.json
//   - User-scope MCP servers:    ~/.cursor/mcp.json (macOS/Linux),
//                                %USERPROFILE%\.cursor\mcp.json (Windows)
//   - Legacy memory/instructions: <project>/.cursorrules
//   - Current memory/instructions: <project>/.cursor/rules/*.mdc
//
// No Agent Skills discovery for Cursor in Phase 1 — as of this writing
// Cursor has no published equivalent to Claude Code's SKILL.md directory
// convention. If Cursor adds one, it's a change to this one file, same as
// every other client-specific detail in this adapter.

import { join } from 'node:path'
import type { ClientAdapter, DiscoveredItem, DiscoveryRoots } from './types.js'
import { dirExists, fileExists, listFilesRecursive, readJsonFile } from './fs-utils.js'
import { parseMcpServers } from './mcp-config-parser.js'

function discoverMcpConfig(path: string, scope: 'project' | 'user'): DiscoveredItem | null {
  if (!fileExists(path)) return null
  const result = readJsonFile(path)
  if (!result.ok) {
    return { kind: 'mcp-config', client: 'cursor', scope, path, servers: [], parseError: result.error }
  }
  const parsed = parseMcpServers(result.data)
  if (!parsed.ok) {
    return { kind: 'mcp-config', client: 'cursor', scope, path, servers: [], parseError: parsed.error }
  }
  return { kind: 'mcp-config', client: 'cursor', scope, path, servers: parsed.servers }
}

function userConfigPathFor(roots: DiscoveryRoots): string {
  if (roots.platform === 'win32') {
    const userProfile = roots.env['USERPROFILE'] ?? roots.homeDir
    return join(userProfile, '.cursor', 'mcp.json')
  }
  return join(roots.homeDir, '.cursor', 'mcp.json')
}

export const cursorAdapter: ClientAdapter = {
  id: 'cursor',
  discover(roots: DiscoveryRoots): DiscoveredItem[] {
    const items: DiscoveredItem[] = []

    const projectConfig = discoverMcpConfig(join(roots.projectDir, '.cursor', 'mcp.json'), 'project')
    if (projectConfig) items.push(projectConfig)

    const userConfig = discoverMcpConfig(userConfigPathFor(roots), 'user')
    if (userConfig) items.push(userConfig)

    const cursorrules = join(roots.projectDir, '.cursorrules')
    if (fileExists(cursorrules)) {
      items.push({ kind: 'memory', client: 'cursor', scope: 'project', path: cursorrules, filename: '.cursorrules' })
    }

    const rulesDir = join(roots.projectDir, '.cursor', 'rules')
    if (dirExists(rulesDir)) {
      for (const relativePath of listFilesRecursive(rulesDir)) {
        if (!relativePath.endsWith('.mdc')) continue
        items.push({
          kind: 'memory',
          client: 'cursor',
          scope: 'project',
          path: join(rulesDir, relativePath),
          filename: relativePath,
        })
      }
    }

    return items
  },
}
