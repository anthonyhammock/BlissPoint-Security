// Parses the `{ "mcpServers": { "<name>": { ... } } }` shape used, as far as
// current public documentation shows, by Claude Code's .mcp.json, Claude
// Desktop's claude_desktop_config.json, and Cursor's mcp.json alike. Kept
// as one shared parser (not duplicated per adapter) specifically so that
// if the shape diverges between clients later, the fix happens in one
// place, and each adapter file only owns *where* to look, not *how* to
// read what it finds there.

import type { McpServerEntry } from './types.js'

export type McpConfigParseResult =
  | { ok: true; servers: McpServerEntry[] }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMcpServers(data: unknown): McpConfigParseResult {
  if (!isRecord(data)) {
    return { ok: false, error: 'expected a JSON object at the top level' }
  }
  const raw = data['mcpServers']
  if (raw === undefined) {
    // A config file with no mcpServers key is unusual but not an error —
    // report zero servers rather than guessing at other possible shapes.
    return { ok: true, servers: [] }
  }
  if (!isRecord(raw)) {
    return { ok: false, error: '"mcpServers" is present but is not an object' }
  }

  const servers: McpServerEntry[] = []
  for (const [name, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      servers.push({ name })
      continue
    }
    const entry: McpServerEntry = { name }
    if (typeof value['command'] === 'string') entry.command = value['command']
    if (Array.isArray(value['args'])) {
      entry.args = value['args'].filter((a): a is string => typeof a === 'string')
    }
    if (typeof value['url'] === 'string') entry.url = value['url']
    if (isRecord(value['env'])) {
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(value['env'])) {
        if (typeof v === 'string') env[k] = v
      }
      entry.env = env
    }
    servers.push(entry)
  }
  return { ok: true, servers }
}
