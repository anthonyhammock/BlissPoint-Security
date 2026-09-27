import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { buildInventory } from '../../src/discovery/index.js'
import { claudeCodeAdapter } from '../../src/discovery/claude-code.js'
import { cursorAdapter } from '../../src/discovery/cursor.js'
import { makeWorkspace, writeFile, writeJson, type TestWorkspace } from '../test-helpers.js'

describe('buildInventory', () => {
  let ws: TestWorkspace | null = null
  afterEach(() => {
    ws?.cleanup()
    ws = null
  })

  it('aggregates results across adapters and stamps generatedAt/projectDir', () => {
    ws = makeWorkspace()
    writeJson(join(ws.projectDir, '.mcp.json'), { mcpServers: { a: { command: 'npx' } } })
    writeFile(join(ws.projectDir, '.cursorrules'), 'rules')

    const inventory = buildInventory(ws.roots, [claudeCodeAdapter, cursorAdapter])
    expect(inventory.projectDir).toBe(ws.projectDir)
    expect(new Date(inventory.generatedAt).toString()).not.toBe('Invalid Date')
    expect(inventory.items).toHaveLength(2)
  })

  it('produces the same order across repeated runs against unchanged files', () => {
    ws = makeWorkspace()
    writeJson(join(ws.projectDir, '.mcp.json'), { mcpServers: {} })
    writeFile(join(ws.projectDir, '.cursorrules'), 'rules')
    writeFile(join(ws.projectDir, 'CLAUDE.md'), '# hi')

    const first = buildInventory(ws.roots, [claudeCodeAdapter, cursorAdapter]).items.map((i) => i.path)
    const second = buildInventory(ws.roots, [claudeCodeAdapter, cursorAdapter]).items.map((i) => i.path)
    expect(first).toEqual(second)
  })

  it('returns an empty item list, not an error, for a workspace with nothing to find', () => {
    ws = makeWorkspace()
    const inventory = buildInventory(ws.roots, [claudeCodeAdapter, cursorAdapter])
    expect(inventory.items).toEqual([])
  })
})
