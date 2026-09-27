import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { claudeDesktopAdapter } from '../../src/discovery/claude-desktop.js'
import { makeWorkspace, writeJson, type TestWorkspace } from '../test-helpers.js'

describe('claudeDesktopAdapter', () => {
  let ws: TestWorkspace | null = null
  afterEach(() => {
    ws?.cleanup()
    ws = null
  })

  it('finds the config at the macOS path', () => {
    ws = makeWorkspace('darwin')
    writeJson(join(ws.homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), {
      mcpServers: { fs: { command: 'npx' } },
    })

    const items = claudeDesktopAdapter.discover(ws.roots)
    expect(items).toHaveLength(1)
    expect(items[0]?.kind).toBe('mcp-config')
  })

  it('finds the config at the Windows path via %APPDATA%', () => {
    ws = makeWorkspace('win32')
    // Real %APPDATA% is a Windows path; this test only needs env['APPDATA']
    // to be *some* absolute, writable directory so it can prove the adapter
    // reads that env var rather than a hardcoded location — an absolute
    // temp-workspace path serves that just as well on a POSIX test runner.
    const appData = join(ws.homeDir, 'AppData', 'Roaming')
    ws.roots.env['APPDATA'] = appData
    writeJson(join(appData, 'Claude', 'claude_desktop_config.json'), {
      mcpServers: { fs: { command: 'npx' } },
    })

    const items = claudeDesktopAdapter.discover(ws.roots)
    expect(items).toHaveLength(1)
  })

  it('returns nothing when APPDATA is unset on Windows', () => {
    ws = makeWorkspace('win32', {})
    expect(claudeDesktopAdapter.discover(ws.roots)).toEqual([])
  })

  it('returns nothing when no config file exists', () => {
    ws = makeWorkspace('darwin')
    expect(claudeDesktopAdapter.discover(ws.roots)).toEqual([])
  })
})
