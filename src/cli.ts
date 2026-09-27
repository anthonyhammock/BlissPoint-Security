#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { buildInventory, defaultRoots } from './discovery/index.js'
import { runChecks, type Finding } from './rules/index.js'
import { formatInventoryHuman, formatScanResultHuman, formatSuppressedHuman } from './output/human.js'
import { toSarif } from './output/sarif.js'
import { loadSuppressions, applySuppressions, addSuppression, SUPPRESSIONS_FILENAME } from './suppressions.js'

const SEVERITY_ORDER: Finding['severity'][] = ['info', 'medium', 'high', 'critical']

function printUsage(): void {
  console.log(`agentlock — finds what your AI coding agent will load automatically, and flags what looks risky before it loads it.

Usage:
  agentlock scan [options]
  agentlock suppress <rule-id> <path> --reason "<justification>"

scan options:
  --json              Print inventory + findings as machine-readable JSON instead of a human-readable report.
  --sarif <path>       Also write results in SARIF 2.1.0 format to this file (for GitHub code scanning).
  --dir <path>        Scan a project directory other than the current one. Defaults to the current directory.
  --fail-on <level>   Exit non-zero if any active (non-suppressed) finding is at or above this severity: info, medium, high, critical. Default: high. Use "none" to always exit 0.
  -h, --help          Show this help.

What "scan" does:
  Finds every MCP server config, Agent Skill, and memory/instruction file that
  Claude Code, Claude Desktop, or Cursor would load for this project or this
  machine, then runs deterministic rule-based checks against them — command
  injection patterns, hard-coded secrets, hidden instructions, and more (see
  the README for the full list). Every finding names a rule ID, an OWASP
  mapping, the exact file and line, a plain-English explanation, and a fix.
  This tool never executes anything it scans, and never claims something is
  "safe" — only that no known issue was found by the current rules.

What "suppress" does:
  Appends an entry to ${SUPPRESSIONS_FILENAME} at the project root, so a
  specific rule stops firing on a specific file. A justification is
  required — this file is meant to be reviewable by an auditor, and an
  unexplained suppression defeats that. Example:
    agentlock suppress TXT-002 docs/prompt-injection-writeup.md --reason "Documentation about the attack, not an instruction."
`)
}

interface ScanArgs {
  json: boolean
  sarif: string | null
  dir: string | null
  failOn: Finding['severity'] | 'none'
}

interface SuppressArgs {
  ruleId: string | null
  path: string | null
  reason: string | null
  dir: string | null
}

function parseScanArgs(argv: string[]): ScanArgs {
  const result: ScanArgs = { json: false, sarif: null, dir: null, failOn: 'high' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') result.json = true
    else if (arg === '--sarif') result.sarif = argv[++i] ?? null
    else if (arg === '--dir') result.dir = argv[++i] ?? null
    else if (arg === '--fail-on') {
      const value = argv[++i]
      if (value === 'none' || value === 'info' || value === 'medium' || value === 'high' || value === 'critical') {
        result.failOn = value
      } else {
        console.error(`Invalid --fail-on value "${value}". Use one of: none, info, medium, high, critical.`)
        process.exit(1)
      }
    }
  }
  return result
}

function parseSuppressArgs(argv: string[]): SuppressArgs {
  const result: SuppressArgs = { ruleId: null, path: null, reason: null, dir: null }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--reason') result.reason = argv[++i] ?? null
    else if (arg === '--dir') result.dir = argv[++i] ?? null
    else if (arg !== undefined && !arg.startsWith('-')) positional.push(arg)
  }
  result.ruleId = positional[0] ?? null
  result.path = positional[1] ?? null
  return result
}

function shouldFail(findings: Finding[], failOn: ScanArgs['failOn']): boolean {
  if (failOn === 'none') return false
  const threshold = SEVERITY_ORDER.indexOf(failOn)
  return findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) >= threshold)
}

function runScan(argv: string[]): void {
  const args = parseScanArgs(argv)
  const projectDir = args.dir ?? process.cwd()

  const inventory = buildInventory(defaultRoots(projectDir))
  const scanResult = runChecks(inventory)

  const { entries: suppressionEntries, errors: suppressionErrors } = loadSuppressions(projectDir)
  const { active, suppressed } = applySuppressions(scanResult.findings, suppressionEntries, projectDir)

  for (const error of suppressionErrors) console.error(`Warning: ${error}`)

  if (args.sarif) {
    writeFileSync(args.sarif, JSON.stringify(toSarif({ ...scanResult, findings: active }), null, 2))
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        { inventory, scan: { ...scanResult, findings: active }, suppressed: suppressed.map((s) => ({ ...s.finding, suppressedBy: s.entry })) },
        null,
        2
      )
    )
  } else {
    console.log(formatInventoryHuman(inventory))
    console.log(formatScanResultHuman({ ...scanResult, findings: active }))
    if (suppressed.length > 0) console.log(formatSuppressedHuman(suppressed))
  }

  if (shouldFail(active, args.failOn)) {
    process.exitCode = 1
  }
}

function runSuppress(argv: string[]): void {
  const args = parseSuppressArgs(argv)
  if (!args.ruleId || !args.path || !args.reason) {
    console.error('Usage: agentlock suppress <rule-id> <path> --reason "<justification>"')
    process.exit(1)
  }
  const projectDir = args.dir ?? process.cwd()
  addSuppression(projectDir, {
    ruleId: args.ruleId,
    path: args.path,
    justification: args.reason,
    addedAt: new Date().toISOString().slice(0, 10),
  })
  console.log(`Added a suppression for ${args.ruleId} on ${args.path} to ${SUPPRESSIONS_FILENAME}.`)
}

function main(): void {
  const argv = process.argv.slice(2)
  // Removed by index, not by value — a --dir argument whose value happens
  // to equal the command name (e.g. a directory literally called "scan")
  // must not also get stripped out of the remaining args.
  const commandIndex = argv.findIndex((a) => !a.startsWith('-'))
  const command = commandIndex === -1 ? null : (argv[commandIndex] ?? null)
  const rest = commandIndex === -1 ? argv : [...argv.slice(0, commandIndex), ...argv.slice(commandIndex + 1)]

  if (argv.includes('--help') || argv.includes('-h') || !command) {
    printUsage()
    process.exitCode = command ? 0 : 1
    return
  }

  if (command === 'scan') {
    runScan(rest)
  } else if (command === 'suppress') {
    runSuppress(rest)
  } else {
    console.error(`Unknown command "${command}". Run "agentlock --help" for usage.`)
    process.exitCode = 1
  }
}

main()
