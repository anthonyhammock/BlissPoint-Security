import { homedir } from 'node:os'
import type { ClientAdapter, DiscoveredItem, DiscoveryRoots, Inventory } from './types.js'
import { claudeCodeAdapter } from './claude-code.js'
import { claudeDesktopAdapter } from './claude-desktop.js'
import { cursorAdapter } from './cursor.js'

export const ADAPTERS: ClientAdapter[] = [claudeCodeAdapter, claudeDesktopAdapter, cursorAdapter]

export function defaultRoots(projectDir: string): DiscoveryRoots {
  return {
    projectDir,
    homeDir: homedir(),
    platform: process.platform,
    env: process.env,
  }
}

/** Runs every client adapter and returns a flat, deterministically-ordered inventory. */
export function buildInventory(roots: DiscoveryRoots, adapters: ClientAdapter[] = ADAPTERS): Inventory {
  const items: DiscoveredItem[] = []
  for (const adapter of adapters) {
    items.push(...adapter.discover(roots))
  }
  // Deterministic order (client, then scope, then path) so two runs against
  // unchanged files produce byte-identical JSON output — important once
  // this inventory is diffed as SOC 2 evidence across scans.
  items.sort((a, b) => {
    if (a.client !== b.client) return a.client.localeCompare(b.client)
    if (a.scope !== b.scope) return a.scope.localeCompare(b.scope)
    return a.path.localeCompare(b.path)
  })
  return { generatedAt: new Date().toISOString(), projectDir: roots.projectDir, items }
}

export * from './types.js'
