import { describe, it, expect } from 'vitest'
import { checkMcpConfig } from '../../src/rules/config-checks.js'
import type { DiscoveredMcpConfig } from '../../src/discovery/types.js'

function config(overrides: Partial<DiscoveredMcpConfig>): DiscoveredMcpConfig {
  return {
    kind: 'mcp-config',
    client: 'claude-code',
    scope: 'project',
    path: '/fake/.mcp.json',
    servers: [],
    ...overrides,
  }
}

describe('checkMcpConfig — unpinned packages', () => {
  it('flags npx with no version pin', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'npx', args: ['-y', 'some-mcp-server'] }] })
    )
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-001')
  })

  it('does not flag npx with a pinned version', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'npx', args: ['-y', 'some-mcp-server@2.1.0'] }] })
    )
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-001')
  })

  it('does not flag a pinned scoped package (scope @ is not a version separator)', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@1.0.0'] }] })
    )
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-001')
  })

  it('flags an unpinned scoped package', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }] })
    )
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-001')
  })

  it('does not flag a local script path launched via npx-style command', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', command: 'npx', args: ['./local-server.js'] }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-001')
  })
})

describe('checkMcpConfig — hardcoded secrets', () => {
  it('flags a known-prefix secret in env', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'node', env: { OPENAI_API_KEY: 'sk-abcdefghijklmnopqrstuvwx' } }] })
    )
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-002')
  })

  it('flags a GitHub token pattern in an arg', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'node', args: ['--token', 'ghp_' + 'a'.repeat(36)] }] })
    )
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-002')
  })

  it('does not flag an ordinary short env value', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', command: 'node', env: { NODE_ENV: 'production' } }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-002')
  })

  it('flags a token embedded in a URL query parameter', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', url: `https://example.com/mcp?api_key=${'a'.repeat(24)}` }] })
    )
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-002')
  })

  it('does not flag a URL with no query string', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', url: 'https://example.com/mcp' }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-002')
  })

  it('does not flag a non-secret-shaped long value even with a suggestive key name', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', command: 'node', env: { AUTH_MODE: 'oauth with pkce and refresh tokens' } }] })
    )
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-002')
  })
})

describe('checkMcpConfig — auto-approve settings', () => {
  it('flags a top-level autoApprove: true', () => {
    const findings = checkMcpConfig(config({ raw: { mcpServers: {}, autoApprove: true } }))
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-003')
  })

  it('flags a nested alwaysAllow array with entries', () => {
    const findings = checkMcpConfig(config({ raw: { mcpServers: { x: { alwaysAllow: ['tool_a'] } } } }))
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-003')
  })

  it('does not flag an empty alwaysAllow array', () => {
    const findings = checkMcpConfig(config({ raw: { mcpServers: { x: { alwaysAllow: [] } } } }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-003')
  })

  it('does not throw on a config containing a circular reference', () => {
    const raw: Record<string, unknown> = { mcpServers: {} }
    raw['self'] = raw
    expect(() => checkMcpConfig(config({ raw }))).not.toThrow()
  })
})

describe('checkMcpConfig — HTTP servers without visible auth', () => {
  it('flags a remote https server with no auth-looking env or url param', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', url: 'https://example.com/mcp' }] }))
    expect(findings.map((f) => f.ruleId)).toContain('MCP-CFG-004')
  })

  it('does not flag a localhost server', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', url: 'http://localhost:3000/mcp' }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-004')
  })

  it('does not flag a remote server with a token query param', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', url: 'https://example.com/mcp?token=abc' }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-004')
  })

  it('does not flag a remote server with an auth-looking env var set', () => {
    const findings = checkMcpConfig(
      config({ servers: [{ name: 'x', url: 'https://example.com/mcp', env: { API_KEY: 'whatever' } }] })
    )
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-004')
  })

  it('does not flag a command-based (non-HTTP) server', () => {
    const findings = checkMcpConfig(config({ servers: [{ name: 'x', command: 'node', args: ['server.js'] }] }))
    expect(findings.map((f) => f.ruleId)).not.toContain('MCP-CFG-004')
  })
})
