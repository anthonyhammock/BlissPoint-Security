#!/usr/bin/env node
import { buildInventory, defaultRoots } from './discovery/index.js'
import { formatInventoryHuman } from './output/human.js'

function printUsage(): void {
  console.log(`agentlock — finds what your AI coding agent will load automatically, before it loads it.

Usage:
  agentlock scan [options]

Options:
  --json          Print the inventory as machine-readable JSON instead of a human-readable summary.
  --dir <path>    Scan a project directory other than the current one. Defaults to the current directory.
  -h, --help      Show this help.

What "scan" does right now (Phase 1 — inventory only):
  Finds every MCP server config, Agent Skill, and memory/instruction file that
  Claude Code, Claude Desktop, or Cursor would load for this project or this
  machine, and lists them. It does not yet flag which ones are risky — that's
  the next phase. Think of this as "here is everything your agent trusts,"
  a list most teams have never actually seen in one place before.
`)
}

function parseArgs(argv: string[]): { command: string | null; json: boolean; dir: string | null; help: boolean } {
  const result = { command: null as string | null, json: false, dir: null as string | null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (arg === '--json') result.json = true
    else if (arg === '--dir') result.dir = argv[++i] ?? null
    else if (!arg?.startsWith('-') && result.command === null) result.command = arg ?? null
  }
  return result
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

  if (args.json) {
    console.log(JSON.stringify(inventory, null, 2))
  } else {
    console.log(formatInventoryHuman(inventory))
  }
}

main()
