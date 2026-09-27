// Claude Desktop adapter. It's a single-user desktop app, not a project
// tool — there's no per-repo config, only one global config file, at a
// platform-specific path:
//   macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
//   Windows: %APPDATA%\Claude\claude_desktop_config.json
//   Linux:   not an officially supported platform for Claude Desktop as of
//            this writing; ~/.config/Claude/claude_desktop_config.json is
//            checked on a best-effort basis in case that changes.
//
// No skills or memory-file discovery here — Claude Desktop doesn't have an
// Agent Skills directory or a memory-file convention the way Claude Code
// does. If that changes, it's a change to this one file.

import { join } from 'node:path'
import type { ClientAdapter, DiscoveredItem, DiscoveryRoots } from './types.js'
import { fileExists, readJsonFile } from './fs-utils.js'
import { parseMcpServers } from './mcp-config-parser.js'

function configPathFor(roots: DiscoveryRoots): string | null {
  switch (roots.platform) {
    case 'darwin':
      return join(roots.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
    case 'win32': {
      const appData = roots.env['APPDATA']
      return appData ? join(appData, 'Claude', 'claude_desktop_config.json') : null
    }
    default:
      // Best-effort Linux path — see the module comment above.
      return join(roots.homeDir, '.config', 'Claude', 'claude_desktop_config.json')
  }
}

export const claudeDesktopAdapter: ClientAdapter = {
  id: 'claude-desktop',
  discover(roots: DiscoveryRoots): DiscoveredItem[] {
    const path = configPathFor(roots)
    if (!path || !fileExists(path)) return []

    const result = readJsonFile(path)
    if (!result.ok) {
      return [{ kind: 'mcp-config', client: 'claude-desktop', scope: 'user', path, servers: [], parseError: result.error }]
    }
    const parsed = parseMcpServers(result.data)
    if (!parsed.ok) {
      return [{ kind: 'mcp-config', client: 'claude-desktop', scope: 'user', path, servers: [], parseError: parsed.error }]
    }
    return [{ kind: 'mcp-config', client: 'claude-desktop', scope: 'user', path, servers: parsed.servers, raw: result.data }]
  },
}
