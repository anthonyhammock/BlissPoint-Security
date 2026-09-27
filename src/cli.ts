#!/usr/bin/env node
import { buildInventory, defaultRoots } from './discovery/index.js'
import { runChecks, type Finding } from './rules/index.js'
import { formatInventoryHuman, formatScanResultHuman } from './output/human.js'

const SEVERITY_ORDER: Finding['severity'][] = ['info', 'medium', 'high', 'critical']

function printUsage(): void {
  console.log(`agentlock — finds what your AI coding agent will load automatically, and flags what looks risky before it loads it.

Usage:
  agentlock scan [options]

Options:
  --json              Print inventory + findings as machine-readable JSON instead of a human-readable report.
  --dir <path>        Scan a project directory other than the current one. Defaults to the current directory.
  --fail-on <level>   Exit non-zero if any finding is at or above this severity: info, medium, high, critical. Default: high. Use "none" to always exit 0.
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
`)
}

interface Args {
  command: string | null
  json: boolean
  dir: string | null
  help: boolean
  failOn: Finding['severity'] | 'none'
}

function parseArgs(argv: string[]): Args {
  const result: Args = { command: null, json: false, dir: null, help: false, failOn: 'high' }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (arg === '--json') result.json = true
    else if (arg === '--dir') result.dir = argv[++i] ?? null
    else if (arg === '--fail-on') {
      const value = argv[++i]
      if (value === 'none' || value === 'info' || value === 'medium' || value === 'high' || value === 'critical') {
        result.failOn = value
      } else {
        console.error(`Invalid --fail-on value "${value}". Use one of: none, info, medium, high, critical.`)
        process.exit(1)
      }
    } else if (!arg?.startsWith('-') && result.command === null) result.command = arg ?? null
  }
  return result
}

function shouldFail(findings: Finding[], failOn: Args['failOn']): boolean {
  if (failOn === 'none') return false
  const threshold = SEVERITY_ORDER.indexOf(failOn)
  return findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) >= threshold)
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))

  if (args.help || !args.command) {
    printUsage()
    process.exitCode = args.command ? 0 : 1
    return
  }

  if (args.command !== 'scan') {
    console.error(`Unknown command "${args.command}". Run "agentlock --help" for usage.`)
    process.exitCode = 1
    return
  }

  const projectDir = args.dir ?? process.cwd()
  const inventory = buildInventory(defaultRoots(projectDir))
  const scanResult = runChecks(inventory)

  if (args.json) {
    console.log(JSON.stringify({ inventory, scan: scanResult }, null, 2))
  } else {
    console.log(formatInventoryHuman(inventory))
    console.log(formatScanResultHuman(scanResult))
  }

  if (shouldFail(scanResult.findings, args.failOn)) {
    process.exitCode = 1
  }
}

main()
