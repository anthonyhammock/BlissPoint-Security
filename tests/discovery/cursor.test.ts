import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { cursorAdapter } from '../../src/discovery/cursor.js'
import { makeWorkspace, writeFile, writeJson, type TestWorkspace } from '../test-helpers.js'

describe('cursorAdapter', () => {
  let ws: TestWorkspace | null = null
  afterEach(() => {
    ws?.cleanup()
    ws = null
  })

  it('finds project and user mcp.json', () => {
    ws = makeWorkspace()
    writeJson(join(ws.projectDir, '.cursor', 'mcp.json'), { mcpServers: { local: { command: 'npx' } } })
    writeJson(join(ws.homeDir, '.cursor', 'mcp.json'), { mcpServers: { global: { command: 'node' } } })

    const items = cursorAdapter.discover(ws.roots)
    const configs = items.filter((i) => i.kind === 'mcp-config')
    expect(configs).toHaveLength(2)
    expect(configs.map((c) => c.scope).sort()).toEqual(['project', 'user'])
  })

  it('uses %USERPROFILE% for the user config on Windows', () => {
    ws = makeWorkspace('win32')
    const userProfile = join(ws.homeDir, 'winuser')
    ws.roots.env['USERPROFILE'] = userProfile
    writeJson(join(userProfile, '.cursor', 'mcp.json'), { mcpServers: {} })

    const items = cursorAdapter.discover(ws.roots)
    expect(items.filter((i) => i.kind === 'mcp-config' && i.scope === 'user')).toHaveLength(1)
  })

  it('finds a legacy .cursorrules file', () => {
    ws = makeWorkspace()
    writeFile(join(ws.projectDir, '.cursorrules'), 'Always write tests.')

    const items = cursorAdapter.discover(ws.roots)
    expect(items).toEqual([
      expect.objectContaining({ kind: 'memory', filename: '.cursorrules' }),
    ])
  })

  it('finds .mdc rule files under .cursor/rules, and ignores non-.mdc files there', () => {
    ws = makeWorkspace()
    writeFile(join(ws.projectDir, '.cursor', 'rules', 'style.mdc'), '---\n---\nUse tabs.')
    writeFile(join(ws.projectDir, '.cursor', 'rules', 'README.txt'), 'not a rule file')

    const items = cursorAdapter.discover(ws.roots)
    const memory = items.filter((i) => i.kind === 'memory')
    expect(memory).toHaveLength(1)
    expect(memory[0]?.kind === 'memory' && memory[0].filename).toBe('style.mdc')
  })

  it('returns nothing for an empty workspace', () => {
    ws = makeWorkspace()
    expect(cursorAdapter.discover(ws.roots)).toEqual([])
  })
})
