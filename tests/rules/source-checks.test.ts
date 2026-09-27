import { describe, it, expect } from 'vitest'
import { checkSourceText, SOURCE_CHECK_LIMITS } from '../../src/rules/source-checks.js'

describe('checkSourceText — command injection', () => {
  it('flags execSync with a template-literal interpolated command', () => {
    const findings = checkSourceText('a.js', 'execSync(`rm -rf ${userInput}`)', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-001')
  })

  it('flags os.system with an f-string', () => {
    const findings = checkSourceText('a.py', 'os.system(f"ls {directory}")', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-001')
  })

  it('flags subprocess.run with shell=True and an f-string', () => {
    const findings = checkSourceText('a.py', 'subprocess.run(f"echo {name}", shell=True)', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-001')
  })

  it('does not flag execSync with a fixed string', () => {
    const findings = checkSourceText('a.js', 'execSync("npm install")', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-001')
  })

  it('does not flag the safe array form of spawn', () => {
    const findings = checkSourceText('a.js', 'spawn("git", ["clone", repoUrl])', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-001')
  })

  it('does not flag subprocess.run with a list argument (no shell)', () => {
    const findings = checkSourceText('a.py', 'subprocess.run(["ls", directory])', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-001')
  })
})

describe('checkSourceText — SSRF', () => {
  it('flags fetch() called with a bare variable', () => {
    const findings = checkSourceText('a.js', 'const res = await fetch(userSuppliedUrl)', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-002')
  })

  it('flags requests.get() called with a variable', () => {
    const findings = checkSourceText('a.py', 'requests.get(target_url)', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-002')
  })

  it('does not flag fetch() called with a string literal', () => {
    const findings = checkSourceText('a.js', 'await fetch("https://api.example.com/data")', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-002')
  })
})

describe('checkSourceText — path traversal', () => {
  it('flags fs.readFile with an unsanitized interpolated path', () => {
    const findings = checkSourceText('a.js', 'fs.readFileSync(`./uploads/${filename}`)', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-003')
  })

  it('does not flag when the interpolated value is normalized first', () => {
    const findings = checkSourceText('a.js', 'fs.readFileSync(`./uploads/${path.basename(filename)}`)', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-003')
  })

  it('does not flag a fixed-path read', () => {
    const findings = checkSourceText('a.js', 'fs.readFileSync("./config/settings.json")', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-003')
  })

  it('does not flag a numeric-index interpolation with no path-like name (real false positive found via manual testing)', () => {
    const findings = checkSourceText('a.py', 'open(f"chunk_{start_idx // chunk_size}.txt")', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-003')
  })

  it('still flags an interpolated value whose name suggests a path even without the word "path" literally', () => {
    const findings = checkSourceText('a.py', 'open(f"uploads/{filename}")', 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-003')
  })
})

describe('checkSourceText — obfuscated blobs', () => {
  it('flags a long base64-looking string', () => {
    const blob = 'A'.repeat(100)
    const findings = checkSourceText('a.js', `const payload = "${blob}"`, 10)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-004')
  })

  it('does not flag ordinary short identifiers and strings', () => {
    const findings = checkSourceText('a.js', 'const greeting = "hello world, this is a normal string"', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-004')
  })

  it('reports one finding for a blob, not one per character run', () => {
    const blob = 'B'.repeat(200)
    const findings = checkSourceText('a.js', blob, 10)
    expect(findings.filter((f) => f.ruleId === 'SRC-004')).toHaveLength(1)
  })
})

describe('checkSourceText — oversized files are flagged, never skipped', () => {
  it('flags a file above the size threshold as info-level, alongside any other findings', () => {
    const text = 'execSync(`rm ${x}`)'
    const findings = checkSourceText('a.js', text, SOURCE_CHECK_LIMITS.OVERSIZED_BYTES + 1)
    expect(findings.map((f) => f.ruleId)).toContain('SRC-005')
    expect(findings.map((f) => f.ruleId)).toContain('SRC-001') // the real finding still ran too
  })

  it('does not flag a file under the threshold', () => {
    const findings = checkSourceText('a.js', 'const x = 1', 10)
    expect(findings.map((f) => f.ruleId)).not.toContain('SRC-005')
  })
})
