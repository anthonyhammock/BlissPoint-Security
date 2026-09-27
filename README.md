# agentlock

**A local-first scanner for everything your AI coding agent loads automatically.**

## What this is, in plain English

If you use Claude Code, Claude Desktop, or Cursor, your agent already trusts
a growing pile of things without asking you each time: MCP servers (tools it
can call), Agent Skills (packaged instructions it can follow), and memory
files like `CLAUDE.md` that it reads on every session. Most teams have never
actually seen the full list of what that adds up to in one place — and
research in 2026 has found real, exploitable problems hiding in exactly
these things: servers with no authentication, skills bundling malicious
scripts, and instruction files quietly poisoned to make an agent misbehave
persistently.

`agentlock` finds all of it, on your own machine, and (starting in the next
phase) tells you which parts look dangerous — in language a manager with no
security background can act on, not just a security engineer.

**Where this stands right now:** this release covers *discovery* — finding
and listing everything your agent would load. It does not yet judge
anything as safe or risky; that's the next phase (see Roadmap below). Full
Phase 1, as scoped, also isn't done yet — treat this as the foundation the
rest is built on, not the finished tool.

## Install

```bash
npx agentlock scan
```

(Not yet published to npm — see Status below. Once published, no separate
install step is needed; `npx` fetches and runs it.)

## Usage

```bash
agentlock scan                  # human-readable summary of the current directory
agentlock scan --json           # machine-readable inventory
agentlock scan --dir ./somewhere  # scan a different project directory
```

## Example output

```
agentlock — inventory of what your AI agent will load automatically
========================================================================

In plain terms: everything listed below is something Claude Code, Claude
Desktop, or Cursor will read or run without you approving it again each
time — MCP server tools, Agent Skills, and files the agent treats as
standing instructions. This is the full list. Nothing here has been
judged safe or unsafe yet — that check is the next phase.

Scanned: /path/to/your/project
At:      2026-09-27T06:13:24.467Z

Claude Code (2 items)
------------------------------------------------------------------------
  • /path/to/your/project/.mcp.json
      Defines 1 MCP server (shared with this project). Every tool these
      servers expose is something your agent can call without asking again.
  • /path/to/your/project/.claude/skills/pdf
      An Agent Skill named "pdf" (shared with this project), 4 file(s) inside.

Summary: 1 MCP server, 1 Agent Skill, 0 memory files.
```

## What it actually does right now

For **Claude Code**, **Claude Desktop**, and **Cursor**, it finds:

- MCP server configs — project-scoped and user/machine-scoped — and lists
  every server each one defines.
- Agent Skill directories and whether each one has a valid manifest
  (`SKILL.md`).
- Memory / standing-instruction files (`CLAUDE.md`, `AGENTS.md`,
  `MEMORY.md`, `.cursorrules`, `.cursor/rules/*.mdc`).

Exact locations checked per client are documented at the top of each file
under `src/discovery/` — one file per client, deliberately, so a location
changing in a future client release means editing one file, not hunting
through the whole codebase.

**What it never does:** execute, import, or run anything it finds. This is
static discovery only — it reads file contents and paths, nothing else. A
scanner that runs the code it's supposed to be checking would defeat its
own purpose.

## Limitations (read this before trusting a scan)

- **No risk analysis yet.** This release only inventories what exists. It
  does not flag malicious patterns, missing auth, injected instructions, or
  anything else described in the project's roadmap yet.
- **`~/.claude.json`'s exact schema for user-scope MCP servers is not yet
  verified against a live Claude Code install.** The parser degrades safely
  if the shape differs from what's expected (reports zero servers rather
  than crashing or guessing), but this is a known gap — see the comment in
  `src/discovery/claude-code.ts`.
- **Windows and Linux paths are implemented but not yet tested against a
  real Windows or Linux desktop install of these tools** — only against
  synthetic fixtures. macOS Claude Desktop path is the most tested case.
- **Cursor's Agent Skills equivalent**, if one exists or ships later, isn't
  covered — Cursor has no published SKILL.md-style convention as of this
  writing.
- This tool does not, and will not, make any claim of "safe" or "secure."
  Once risk analysis ships, findings will be worded as "no known issues
  found by rules vX.Y" — never a guarantee.

## Status

This is early, active development toward the Phase 1 scope described in
this project's internal roadmap (discovery, deterministic rule-based
checks, a labeled benchmark corpus with a measured precision number,
SARIF/JSON/terminal output, a GitHub Action, and supply-chain hardening
on our own releases). None of the paid tiers, dashboard, or badge system
described anywhere else exist yet and won't until the free tier's
precision target is actually met and measured — not promised.

## Security

Found a vulnerability in `agentlock` itself, or in a component it scans? A
`security@` contact and disclosure policy will be published before this
reaches a 1.0 release. Until then, please open a private security advisory
on this repository rather than a public issue.

## License

MIT
