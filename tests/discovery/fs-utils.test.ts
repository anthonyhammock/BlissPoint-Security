import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirExists, fileExists, listFilesRecursive, listSubdirectories, readJsonFile, readTextFile } from '../../src/discovery/fs-utils.js'
import { writeFile } from '../test-helpers.js'

describe('fs-utils', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('fileExists/dirExists never throw for missing paths', () => {
    expect(fileExists('/does/not/exist')).toBe(false)
    expect(dirExists('/does/not/exist')).toBe(false)
  })

  it('listSubdirectories returns [] for a missing directory instead of throwing', () => {
    expect(listSubdirectories('/does/not/exist')).toEqual([])
  })

  it('listFilesRecursive finds nested files with paths relative to the root', () => {
    dir = mkdtempSync(join(tmpdir(), 'blisspoint-security-fsutils-'))
    writeFile(join(dir, 'a.txt'), '1')
    writeFile(join(dir, 'sub', 'b.txt'), '2')

    expect(listFilesRecursive(dir).sort()).toEqual(['a.txt', join('sub', 'b.txt')].sort())
  })

  it('readJsonFile reports a structured error for invalid JSON rather than throwing', () => {
    dir = mkdtempSync(join(tmpdir(), 'blisspoint-security-fsutils-'))
    const path = join(dir, 'bad.json')
    writeFile(path, '{ oops')

    const result = readJsonFile(path)
    expect(result.ok).toBe(false)
  })

  it('readJsonFile parses valid JSON', () => {
    dir = mkdtempSync(join(tmpdir(), 'blisspoint-security-fsutils-'))
    const path = join(dir, 'good.json')
    writeFile(path, '{"a": 1}')

    const result = readJsonFile(path)
    expect(result).toEqual({ ok: true, data: { a: 1 } })
  })

  it('readTextFile returns null, not a throw, for a missing file', () => {
    expect(readTextFile('/does/not/exist')).toBeNull()
  })
})
