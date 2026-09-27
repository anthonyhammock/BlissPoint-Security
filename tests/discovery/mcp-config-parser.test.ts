import { describe, it, expect } from 'vitest'
import { parseMcpServers } from '../../src/discovery/mcp-config-parser.js'

describe('parseMcpServers', () => {
  it('parses a well-formed config with command-based and url-based servers', () => {
    const result = parseMcpServers({
      mcpServers: {
        filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
        remote: { url: 'https://example.com/mcp' },
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.servers).toHaveLength(2)
    expect(result.servers[0]).toEqual({
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    })
    expect(result.servers[1]).toEqual({ name: 'remote', url: 'https://example.com/mcp' })
  })

  it('captures env vars as strings only, dropping non-string values', () => {
    const result = parseMcpServers({
      mcpServers: { srv: { command: 'node', env: { API_KEY: 'abc', PORT: 8080 } } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.servers[0]?.env).toEqual({ API_KEY: 'abc' })
  })

  it('reports zero servers, not an error, when mcpServers is absent', () => {
    const result = parseMcpServers({ someOtherKey: true })
    expect(result).toEqual({ ok: true, servers: [] })
  })

  it('rejects a top-level value that is not an object', () => {
    const result = parseMcpServers(['not', 'an', 'object'])
    expect(result.ok).toBe(false)
  })

  it('rejects mcpServers that is present but not an object', () => {
    const result = parseMcpServers({ mcpServers: 'nope' })
    expect(result.ok).toBe(false)
  })

  it('still records a server entry with just its name when its value is not an object', () => {
    const result = parseMcpServers({ mcpServers: { broken: null } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.servers).toEqual([{ name: 'broken' }])
  })
})
