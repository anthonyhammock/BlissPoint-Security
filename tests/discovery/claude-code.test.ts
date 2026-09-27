import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { claudeCodeAdapter } from '../../src/discovery/claude-code.js'
import { makeWorkspace, writeFile, writeJson, type TestWorkspace } from '../test-helpers.js'

describe('claudeCodeAdapter', () => {
  let ws: TestWorkspace | null = null
  afterEach(() => {
    ws?.cleanup()
    ws = null
  })

  it('finds a project .mcp.json and reports its servers', () => {
    ws = makeWorkspace()
    writeJson(join(ws.projectDir, '.mcp.json'), {
      mcpServers: { db: { command: 'npx', args: ['-y', 'some-db-server'] } },
    })

    const items = claudeCodeAdapter.discover(ws.roots)
    const config = items.find((i) => i.kind === 'mcp-config' && i.scope === 'project')
    expect(config).toBeDefined()
    if (config?.kind !== 'mcp-config') throw new Error('expected mcp-config')
    expect(config.servers).toEqual([{ name: 'db', command: 'npx', args: ['-y', 'some-db-server'] }])
  })

  it('finds a user-scope ~/.claude.json', () => {
    ws = makeWorkspace()
    writeJson(join(ws.homeDir, '.claude.json'), { mcpServers: { global: { command: 'node' } } })

    const items = claudeCodeAdapter.discover(ws.roots)
    const config = items.find((i) => i.kind === 'mcp-config' && i.scope === 'user')
    expect(config).toBeDefined()
  })

  it('reports a parse error for invalid JSON instead of throwing', () => {
    ws = makeWorkspace()
    writeFile(join(ws.projectDir, '.mcp.json'), '{ not valid json')

    const items = claudeCodeAdapter.discover(ws.roots)
    const config = items.find((i) => i.kind === 'mcp-config' && i.scope === 'project')
    expect(config?.kind === 'mcp-config' && config.parseError).toBeTruthy()
  })

  it('finds project and user skills, with and without a manifest', () => {
    ws = makeWorkspace()
    writeFile(join(ws.projectDir, '.claude', 'skills', 'pdf', 'SKILL.md'), '# PDF skill')
    writeFile(join(ws.projectDir, '.claude', 'skills', 'pdf', 'scripts', 'run.py'), 'print(1)')
    writeFile(join(ws.projectDir, '.claude', 'skills', 'no-manifest', 'notes.txt'), 'hi')
    writeFile(join(ws.homeDir, '.claude', 'skills', 'global-skill', 'SKILL.md'), '# Global')

    const items = claudeCodeAdapter.discover(ws.roots)
    const skills = items.filter((i) => i.kind === 'skill')
    expect(skills).toHaveLength(3)

    const pdf = skills.find((s) => s.kind === 'skill' && s.name === 'pdf')
    expect(pdf?.kind === 'skill' && pdf.manifestPath).toContain('SKILL.md')
    expect(pdf?.kind === 'skill' && pdf.files.sort()).toEqual(['SKILL.md', join('scripts', 'run.py')].sort())

    const noManifest = skills.find((s) => s.kind === 'skill' && s.name === 'no-manifest')
    expect(noManifest?.kind === 'skill' && noManifest.manifestPath).toBeNull()

    const global = skills.find((s) => s.kind === 'skill' && s.scope === 'user')
    expect(global?.kind === 'skill' && global.name).toBe('global-skill')
  })

  it('finds CLAUDE.md, AGENTS.md, and MEMORY.md at the project root', () => {
    ws = makeWorkspace()
    writeFile(join(ws.projectDir, 'CLAUDE.md'), '# instructions')
    writeFile(join(ws.projectDir, 'AGENTS.md'), '# agents')

    const items = claudeCodeAdapter.discover(ws.roots)
    const memory = items.filter((i) => i.kind === 'memory')
    expect(memory.map((m) => m.kind === 'memory' && m.filename).sort()).toEqual(['AGENTS.md', 'CLAUDE.md'])
  })

  it('returns nothing for a workspace with none of these files', () => {
    ws = makeWorkspace()
    expect(claudeCodeAdapter.discover(ws.roots)).toEqual([])
  })
})
