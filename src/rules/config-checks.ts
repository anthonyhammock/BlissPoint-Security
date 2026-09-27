// Checks over MCP server configs themselves — Section 5.2's "Configs and
// secrets" category, plus the config-visible half of the "MCP servers"
// category (auth, unpinned installs). The other half of that category —
// patterns inside a server's actual source — lives in source-checks.ts,
// since it needs the file's text, not its config entry.

import type { DiscoveredMcpConfig, McpServerEntry } from '../discovery/types.js'
import type { Finding, RuleMeta } from './types.js'
import { makeFinding } from './types.js'

const UNPINNED_PACKAGE: RuleMeta = {
  id: 'MCP-CFG-001',
  severity: 'medium',
  owasp: ['MCP04:2025'],
  title: 'MCP server launched from an unpinned package version',
  plainEnglish:
    'This server is started with "latest" (no version pin), so the exact code that runs can change the next time it starts — without anyone here approving the change. If the package is ever compromised upstream ("rug-pulled"), your agent picks up the malicious version automatically.',
  fix: 'Pin an exact version, e.g. change "some-package" to "some-package@1.4.2", and update it deliberately when you mean to.',
}

const HARDCODED_SECRET: RuleMeta = {
  id: 'MCP-CFG-002',
  severity: 'high',
  owasp: ['MCP01:2025'],
  title: 'Hard-coded credential in an MCP server config',
  plainEnglish:
    'A value in this config looks like a real API key, token, or password written directly into the file. Anyone with read access to this config — or to this file if it\'s committed to git — has that credential.',
  fix: 'Move the value into an environment variable set outside this file (or a secrets manager), and reference it by name instead of pasting the value in.',
}

const AUTO_APPROVE: RuleMeta = {
  id: 'MCP-CFG-003',
  severity: 'high',
  owasp: ['MCP07:2025'],
  title: 'Auto-approve / auto-run setting enabled',
  plainEnglish:
    'This config has a setting that lets tools run without asking for approval first. That\'s convenient, but it also means a compromised or poisoned tool gets to act immediately, with no human in the loop to notice something is wrong before it happens.',
  fix: 'Turn this off unless you specifically need unattended execution, and if you do need it, scope it to the smallest set of trusted tools you can.',
}

const HTTP_NO_VISIBLE_AUTH: RuleMeta = {
  id: 'MCP-CFG-004',
  severity: 'medium',
  owasp: ['MCP07:2025'],
  title: 'Remote MCP server with no visible authentication',
  plainEnglish:
    'This server is reached over the network, and nothing in its configuration looks like a credential (a token, API key, or auth header). It\'s possible authentication happens somewhere this scan can\'t see — but a remote server your agent can reach with no visible access control is worth a second look.',
  fix: 'Confirm this server actually requires authentication server-side. If it doesn\'t, that\'s the real gap; if it does, consider recording how (e.g. a comment noting an mTLS/network-level control) so this doesn\'t look uncertain to the next person who reads it.',
}

const SECRET_KEY_NAME = /(key|token|secret|password|credential|auth)/i
const SECRET_VALUE_SHAPE = /^[A-Za-z0-9_\-/+]{20,}$/
const KNOWN_SECRET_PREFIXES = [/^sk-[A-Za-z0-9]{16,}/, /^gh[pousr]_[A-Za-z0-9]{20,}/, /^AKIA[0-9A-Z]{16}/, /^xox[baprs]-[A-Za-z0-9-]{10,}/]

function looksLikeSecret(value: string): boolean {
  if (KNOWN_SECRET_PREFIXES.some((re) => re.test(value))) return true
  return SECRET_VALUE_SHAPE.test(value) && value.length >= 20
}

/**
 * A raw MCP url is itself never secret-shaped (it's a URL — full of
 * characters like : / that make it fail looksLikeSecret by construction).
 * The credential, when there is one, lives in a query parameter — so those
 * get checked as their own key/value candidates, not the URL as a whole.
 */
function urlQueryCandidates(url: string): [string, string][] {
  try {
    return [...new URL(url).searchParams.entries()]
  } catch {
    return []
  }
}

function findHardcodedSecrets(config: DiscoveredMcpConfig): Finding[] {
  const findings: Finding[] = []
  for (const server of config.servers) {
    const candidates: [string, string][] = []
    if (server.env) {
      for (const [key, value] of Object.entries(server.env)) candidates.push([key, value])
    }
    if (server.url) candidates.push(...urlQueryCandidates(server.url))
    for (const arg of server.args ?? []) candidates.push(['args', arg])

    for (const [key, value] of candidates) {
      const knownPrefix = KNOWN_SECRET_PREFIXES.some((re) => re.test(value))
      const nameHints = SECRET_KEY_NAME.test(key)
      if (knownPrefix || (nameHints && looksLikeSecret(value))) {
        findings.push(
          makeFinding(HARDCODED_SECRET, config.path, {
            snippet: `${server.name}.${key} = ${value.length > 12 ? value.slice(0, 6) + '…' + value.slice(-4) : value}`,
          })
        )
      }
    }
  }
  return findings
}

function findUnpinnedPackages(config: DiscoveredMcpConfig): Finding[] {
  const findings: Finding[] = []
  for (const server of config.servers) {
    if (!server.command || !['npx', 'uvx'].includes(server.command)) continue
    const spec = (server.args ?? []).find((a) => !a.startsWith('-'))
    if (!spec) continue
    if (spec.startsWith('.') || spec.startsWith('/')) continue // local path, not a registry install
    const withoutScope = spec.startsWith('@') ? spec.slice(1) : spec
    const isPinned = withoutScope.includes('@')
    if (!isPinned) {
      findings.push(makeFinding(UNPINNED_PACKAGE, config.path, { snippet: `${server.command} ${spec}` }))
    }
  }
  return findings
}

const AUTO_APPROVE_KEYS = new Set([
  'autoapprove',
  'alwaysallow',
  'autostart',
  'disableapproval',
  'skipapproval',
  'trustedtools',
])

function hasTruthySignal(value: unknown): boolean {
  if (value === true) return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.length > 0 && value.toLowerCase() !== 'false'
  return false
}

function scanForAutoApprove(node: unknown, path: string, findings: Finding[], seen: Set<unknown>): void {
  if (node === null || typeof node !== 'object') return
  if (seen.has(node)) return // cycle guard — untrusted JSON should never be assumed acyclic
  seen.add(node)

  const entries = Array.isArray(node) ? node.entries() : Object.entries(node)
  for (const [key, value] of entries) {
    if (typeof key === 'string' && AUTO_APPROVE_KEYS.has(key.toLowerCase()) && hasTruthySignal(value)) {
      findings.push(makeFinding(AUTO_APPROVE, path, { snippet: `${key}: ${JSON.stringify(value)}`.slice(0, 160) }))
    }
    scanForAutoApprove(value, path, findings, seen)
  }
}

function isLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

function hasVisibleAuth(server: McpServerEntry): boolean {
  if (server.env && Object.keys(server.env).some((k) => SECRET_KEY_NAME.test(k))) return true
  if (server.url && /[?&](token|api_key|apikey|auth)=/i.test(server.url)) return true
  return false
}

function findHttpServersWithoutAuth(config: DiscoveredMcpConfig): Finding[] {
  const findings: Finding[] = []
  for (const server of config.servers) {
    if (!server.url) continue
    if (!/^https?:\/\//i.test(server.url)) continue
    if (isLocalHost(server.url)) continue
    if (hasVisibleAuth(server)) continue
    findings.push(makeFinding(HTTP_NO_VISIBLE_AUTH, config.path, { snippet: `${server.name}: ${server.url}` }))
  }
  return findings
}

export function checkMcpConfig(config: DiscoveredMcpConfig): Finding[] {
  const findings: Finding[] = [
    ...findUnpinnedPackages(config),
    ...findHardcodedSecrets(config),
    ...findHttpServersWithoutAuth(config),
  ]
  if (config.raw !== undefined) {
    scanForAutoApprove(config.raw, config.path, findings, new Set())
  }
  return findings
}
