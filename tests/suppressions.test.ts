import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { writeJson, writeFile } from './test-helpers.js'
import { loadSuppressions, applySuppressions, addSuppression, SUPPRESSIONS_FILENAME } from '../src/suppressions.js'
import type { Finding } from '../src/rules/types.js'

function makeProjectDir(): string {
  return mkdtempSync(join(tmpdir(), 'agentlock-suppressions-test-'))
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    ruleId: 'TXT-002',
    severity: 'medium',
    owasp: ['AST-06'],
    title: 'Example finding',
    plainEnglish: 'Example.',
    fix: 'Do something.',
    path: '/project/docs/example.md',
    ...overrides,
  }
}

const dirsToClean: string[] = []
afterEach(() => {
  while (dirsToClean.length > 0) {
    const dir = dirsToClean.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function trackedProjectDir(): string {
  const dir = makeProjectDir()
  dirsToClean.push(dir)
  return dir
}

describe('loadSuppressions', () => {
  it('returns no entries and no errors when the file does not exist', () => {
    const projectDir = trackedProjectDir()
    expect(loadSuppressions(projectDir)).toEqual({ entries: [], errors: [] })
  })

  it('loads valid entries', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), {
      suppressions: [
        { ruleId: 'TXT-002', path: 'docs/example.md', justification: 'Documentation, not an instruction.' },
      ],
    })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(errors).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ ruleId: 'TXT-002', path: 'docs/example.md', justification: 'Documentation, not an instruction.' })
  })

  it('reports an error and skips an entry missing a justification', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), {
      suppressions: [{ ruleId: 'TXT-002', path: 'docs/example.md' }],
    })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('missing "justification"')
  })

  it('reports an error and skips an entry with a blank justification', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), {
      suppressions: [{ ruleId: 'TXT-002', path: 'docs/example.md', justification: '   ' }],
    })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toEqual([])
    expect(errors).toHaveLength(1)
  })

  it('reports an error and skips an entry missing ruleId or path', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), {
      suppressions: [{ path: 'docs/example.md', justification: 'x' }, { ruleId: 'TXT-002', justification: 'x' }],
    })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toEqual([])
    expect(errors).toHaveLength(2)
  })

  it('skips a non-object entry but keeps valid ones', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), {
      suppressions: ['not an object', { ruleId: 'TXT-002', path: 'docs/example.md', justification: 'valid' }],
    })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('reports an error for invalid JSON', () => {
    const projectDir = trackedProjectDir()
    writeFile(join(projectDir, SUPPRESSIONS_FILENAME), '{ not valid json')
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toEqual([])
    expect(errors[0]).toContain('invalid JSON')
  })

  it('reports an error when the top-level shape is wrong', () => {
    const projectDir = trackedProjectDir()
    writeJson(join(projectDir, SUPPRESSIONS_FILENAME), { notSuppressions: [] })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(entries).toEqual([])
    expect(errors[0]).toContain('expected a top-level "suppressions" array')
  })
})

describe('applySuppressions', () => {
  it('moves a matching finding to suppressed and keeps others active', () => {
    const projectDir = '/project'
    const findings = [
      finding({ ruleId: 'TXT-002', path: '/project/docs/example.md' }),
      finding({ ruleId: 'TXT-003', path: '/project/docs/example.md' }),
    ]
    const entries = [{ ruleId: 'TXT-002', path: 'docs/example.md', justification: 'reviewed' }]
    const { active, suppressed } = applySuppressions(findings, entries, projectDir)
    expect(active).toHaveLength(1)
    expect(active[0]?.ruleId).toBe('TXT-003')
    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]?.finding.ruleId).toBe('TXT-002')
    expect(suppressed[0]?.entry.justification).toBe('reviewed')
  })

  it('does not suppress the same rule on a different file (exact match, not glob)', () => {
    const projectDir = '/project'
    const findings = [finding({ ruleId: 'TXT-002', path: '/project/docs/other.md' })]
    const entries = [{ ruleId: 'TXT-002', path: 'docs/example.md', justification: 'reviewed' }]
    const { active, suppressed } = applySuppressions(findings, entries, projectDir)
    expect(active).toHaveLength(1)
    expect(suppressed).toHaveLength(0)
  })

  it('does not suppress a different rule on the same file', () => {
    const projectDir = '/project'
    const findings = [finding({ ruleId: 'TXT-003', path: '/project/docs/example.md' })]
    const entries = [{ ruleId: 'TXT-002', path: 'docs/example.md', justification: 'reviewed' }]
    const { active } = applySuppressions(findings, entries, projectDir)
    expect(active).toHaveLength(1)
  })

  it('matches on the path relative to the project root, not the absolute path', () => {
    const findings = [finding({ ruleId: 'TXT-002', path: join('/some/where/project', 'a/b/c.md') })]
    const entries = [{ ruleId: 'TXT-002', path: 'a/b/c.md', justification: 'reviewed' }]
    const { suppressed } = applySuppressions(findings, entries, '/some/where/project')
    expect(suppressed).toHaveLength(1)
  })
})

describe('addSuppression', () => {
  it('creates the file when it does not exist yet', () => {
    const projectDir = trackedProjectDir()
    addSuppression(projectDir, { ruleId: 'TXT-002', path: 'docs/example.md', justification: 'new entry' })
    const { entries, errors } = loadSuppressions(projectDir)
    expect(errors).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ ruleId: 'TXT-002', path: 'docs/example.md', justification: 'new entry' })
  })

  it('appends to existing entries without dropping them', () => {
    const projectDir = trackedProjectDir()
    addSuppression(projectDir, { ruleId: 'TXT-002', path: 'docs/a.md', justification: 'first' })
    addSuppression(projectDir, { ruleId: 'TXT-003', path: 'docs/b.md', justification: 'second' })
    const { entries } = loadSuppressions(projectDir)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.ruleId)).toEqual(['TXT-002', 'TXT-003'])
  })
})
