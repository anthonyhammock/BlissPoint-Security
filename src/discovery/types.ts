// Shared vocabulary for everything a client adapter can find. Every adapter
// (one per AI coding tool — see claude-code.ts, claude-desktop.ts, cursor.ts)
// produces DiscoveredItem[] in this shape, so the rule engine, output
// formatters, and the SOC 2 inventory export never need to know which
// client a finding came from.

export type ClientId = 'claude-code' | 'claude-desktop' | 'cursor'

/** 'project' = lives in the repo being scanned, shared with a team. 'user' = a single machine's global config, outside the repo. */
export type Scope = 'project' | 'user'

export type ArtifactKind = 'mcp-config' | 'skill' | 'memory'

interface DiscoveredArtifactBase {
  client: ClientId
  scope: Scope
  /** Absolute path to the file, or to the skill's own directory for kind 'skill'. */
  path: string
}

export interface McpServerEntry {
  name: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface DiscoveredMcpConfig extends DiscoveredArtifactBase {
  kind: 'mcp-config'
  servers: McpServerEntry[]
  /**
   * Set when the file exists but couldn't be parsed as valid JSON, or didn't
   * match the expected shape. Reported as a finding by the rule engine
   * later — never silently dropped, since an unparseable config is itself
   * something worth flagging (could be hand-corrupted, could be hiding
   * something a strict parser chokes on).
   */
  parseError?: string
  /**
   * The full parsed JSON, when parsing succeeded. McpServerEntry only
   * projects the fields the discovery layer knows to expect; rule checks
   * that need to look for arbitrary keys (auto-approve flags, trust
   * settings — anything a client might add that this adapter doesn't model
   * yet) work against this instead of trying to extend the narrow type for
   * every new key a client invents.
   */
  raw?: unknown
}

export interface DiscoveredSkill extends DiscoveredArtifactBase {
  kind: 'skill'
  /** The skill's directory name, e.g. "pdf" for .claude/skills/pdf/SKILL.md */
  name: string
  /** Absolute path to the manifest file (SKILL.md), or null if the directory has none. */
  manifestPath: string | null
  /** Every other file inside the skill directory, path relative to it. */
  files: string[]
}

export interface DiscoveredMemoryFile extends DiscoveredArtifactBase {
  kind: 'memory'
  /** e.g. "CLAUDE.md", "AGENTS.md", ".cursorrules" */
  filename: string
}

export type DiscoveredItem = DiscoveredMcpConfig | DiscoveredSkill | DiscoveredMemoryFile

export interface DiscoveryRoots {
  /** The project/repo directory being scanned. */
  projectDir: string
  /** The user's home directory. Injectable so tests never touch a real machine's actual home directory. */
  homeDir: string
  /** process.platform, injectable for the same reason — client config paths vary by OS. */
  platform: NodeJS.Platform
  /** process.env, injectable for the same reason (Windows paths read %APPDATA%/%USERPROFILE%). */
  env: NodeJS.ProcessEnv
}

export interface ClientAdapter {
  id: ClientId
  discover(roots: DiscoveryRoots): DiscoveredItem[]
}

export interface Inventory {
  generatedAt: string
  projectDir: string
  items: DiscoveredItem[]
}
