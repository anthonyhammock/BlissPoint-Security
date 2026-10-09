// Real filesystem fixtures, not mocks — every adapter test writes real
// files into a real temp directory and reads them back through the real
// adapter. A mocked fs would happily pass while the actual parser diverges
// from what's on disk; that's exactly the kind of false confidence this
// product exists to prevent in *other* people's tooling; it shouldn't be
// how its own is tested.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import type { DiscoveryRoots } from '../src/discovery/types.js'

export interface TestWorkspace {
  projectDir: string
  homeDir: string
  roots: DiscoveryRoots
  cleanup(): void
}

export function makeWorkspace(platform: NodeJS.Platform = 'linux', env: NodeJS.ProcessEnv = {}): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'blisspoint-security-test-'))
  const projectDir = join(root, 'project')
  const homeDir = join(root, 'home')
  mkdirSync(projectDir, { recursive: true })
  mkdirSync(homeDir, { recursive: true })

  return {
    projectDir,
    homeDir,
    roots: { projectDir, homeDir, platform, env },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

export function writeJson(path: string, data: unknown): void {
  writeFile(path, JSON.stringify(data, null, 2))
}
