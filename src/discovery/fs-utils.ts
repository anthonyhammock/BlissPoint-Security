// Small, dependency-free filesystem helpers shared by every client adapter.
// Deliberately built on nothing but Node's own fs/path — see the README's
// "why so few dependencies" note: this tool reads untrusted, potentially
// hostile files by design, so every added dependency is added attack
// surface. No third-party package touches file content in this module.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function fileExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

export function dirExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Directory names directly inside `dir`, or [] if `dir` doesn't exist or can't be read. Never throws. */
export function listSubdirectories(dir: string): string[] {
  if (!dirExists(dir)) return []
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/** Every file path under `dir`, recursively, relative to `dir`. Never throws; skips entries it can't read. */
export function listFilesRecursive(dir: string, relativeTo: string = dir): string[] {
  if (!dirExists(dir)) return []
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, relativeTo))
    } else if (entry.isFile()) {
      out.push(full.slice(relativeTo.length + 1))
    }
  }
  return out
}

export type JsonReadResult = { ok: true; data: unknown } | { ok: false; error: string }

/** Reads and JSON-parses a file. Never throws — a malformed or unreadable file is data (a finding), not a crash. */
export function readJsonFile(path: string): JsonReadResult {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    return { ok: false, error: `could not read file: ${(err as Error).message}` }
  }
  try {
    return { ok: true, data: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` }
  }
}

export function readTextFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
