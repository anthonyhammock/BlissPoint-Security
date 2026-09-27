// Checks over instruction-bearing text — Agent Skill manifests (SKILL.md)
// and memory/instruction files (CLAUDE.md, AGENTS.md, MEMORY.md,
// .cursorrules, .cursor/rules/*.mdc). These are the artifacts an agent
// reads as *trusted instructions*, not as data — which is exactly what
// makes injected text inside them dangerous, and exactly why the OWASP
// mapping differs by context: the same phrase in a Skill is closer to
// Agent Goal Hijack (AST-01), while in a memory file it's Memory and
// Context Poisoning (AST-06) — a memory file is specifically what persists
// the poisoning across sessions.

import type { Finding, RuleMeta } from './types.js'
import { makeFinding } from './types.js'
import { findMatches } from './text-scan.js'

export type InstructionContext = 'skill' | 'memory'

const HIDDEN_UNICODE_PATTERN = /[​-‏‪-‮⁠-⁤﻿]|[\u{E0000}-\u{E007F}]/u

const IGNORE_INSTRUCTIONS_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?)/i,
  /forget\s+(?:your|all|the)\s+(?:previous\s+)?instructions?/i,
]

const CURL_PIPE_SHELL_PATTERN = /\b(?:curl|wget)\s+[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/i

const MODIFY_MEMORY_OR_SKILL_PATTERNS: RegExp[] = [
  /\b(?:edit|update|append(?:\s+to)?|modify|overwrite|rewrite)\s+(?:the\s+)?(?:CLAUDE\.md|MEMORY\.md|AGENTS\.md|\.cursorrules|memory file|skill file)/i,
  /\b(?:edit|update|append(?:\s+to)?|modify|overwrite|rewrite)\s+(?:the\s+)?(?:contents?\s+of\s+)?(?:\.claude[\\/]skills|\.cursor[\\/]rules)/i,
]

const URL_PATTERN = /https?:\/\/[^\s"'`)]+/i
const EXFIL_PHRASE_PATTERN = /\b(?:send|upload|post|exfiltrate|forward|transmit)\b.{0,40}\b(?:to|at)\b/i

function ruleFor(id: string, severity: RuleMeta['severity'], owaspByContext: Record<InstructionContext, string>, title: string, plainEnglish: string, fix: string, context: InstructionContext): RuleMeta {
  return { id, severity, owasp: [owaspByContext[context]], title, plainEnglish, fix }
}

function hiddenUnicodeRule(context: InstructionContext): RuleMeta {
  return ruleFor(
    'TXT-001',
    'critical',
    { skill: 'AST-01', memory: 'AST-06' },
    'Hidden or invisible Unicode characters',
    'This file contains characters that render as invisible or as nothing at all in most editors (zero-width spaces, bidirectional-override characters, or similar). These are a known technique for hiding instructions from a human reviewer while an AI agent still reads and follows them.',
    'Open the file in a hex viewer or a tool that reveals non-printing characters, and remove anything you didn\'t intentionally put there.',
    context
  )
}

function ignoreInstructionsRule(context: InstructionContext): RuleMeta {
  return ruleFor(
    'TXT-002',
    'medium',
    { skill: 'AST-01', memory: 'AST-06' },
    'Phrasing that tries to override prior instructions',
    'This file contains a phrase like "ignore previous instructions." That\'s a hallmark of a prompt-injection attempt — though it can also appear legitimately in documentation that discusses prompt injection itself. Worth confirming which one this is.',
    'Read the surrounding context. If this is legitimate content about prompt injection, add it to the suppression file with a note; if not, remove it and find out how it got there.',
    context
  )
}

function exfiltrationCueRule(context: InstructionContext): RuleMeta {
  return ruleFor(
    'TXT-003',
    'critical',
    { skill: 'AST-01', memory: 'AST-06' },
    'Instruction to send data to an external address',
    'This file both names a URL and uses language telling the reader (or the agent) to send, upload, or forward something there. Combined, that\'s the pattern behind data exfiltration via a poisoned skill or memory file — the agent is told what to do with your data and where to send it.',
    'Confirm exactly what this instructs the agent to send, and to where, before trusting this component with anything sensitive.',
    context
  )
}

function curlPipeShellRule(context: InstructionContext): RuleMeta {
  return ruleFor(
    'TXT-004',
    'high',
    { skill: 'AST-09', memory: 'AST-09' },
    'Instruction to pipe a downloaded script directly into a shell',
    'This file tells the reader to run a "curl (or wget) ... | sh/bash" style command — downloading and executing a script in one step, with no chance to read it first. This is a common way to get a human to run something they never actually reviewed.',
    'Download the script separately, read it, and only run it if it does what you expect.',
    context
  )
}

function modifyMemoryOrSkillRule(context: InstructionContext): RuleMeta {
  return ruleFor(
    'TXT-005',
    'high',
    { skill: 'AST-06', memory: 'AST-06' },
    'Instruction to modify a memory file or another skill',
    'This file instructs the reader (or the agent) to edit a memory file or another skill. That\'s exactly the mechanism behind persistence attacks — a compromised skill rewrites CLAUDE.md or MEMORY.md so its instructions survive even after the original skill is removed.',
    'Confirm what change this is actually asking for, and whether it\'s something you\'d approve if a human asked for it directly.',
    context
  )
}

export function checkInstructionText(path: string, text: string, context: InstructionContext): Finding[] {
  const findings: Finding[] = []

  if (HIDDEN_UNICODE_PATTERN.test(text)) {
    const match = findMatches(text, new RegExp(HIDDEN_UNICODE_PATTERN.source, 'u'))[0]
    findings.push(makeFinding(hiddenUnicodeRule(context), path, match ? { line: match.line } : undefined))
  }

  for (const pattern of IGNORE_INSTRUCTIONS_PATTERNS) {
    for (const match of findMatches(text, pattern)) {
      findings.push(makeFinding(ignoreInstructionsRule(context), path, { line: match.line, snippet: match.snippet }))
    }
  }

  for (const match of findMatches(text, CURL_PIPE_SHELL_PATTERN)) {
    findings.push(makeFinding(curlPipeShellRule(context), path, { line: match.line, snippet: match.snippet }))
  }

  for (const pattern of MODIFY_MEMORY_OR_SKILL_PATTERNS) {
    for (const match of findMatches(text, pattern)) {
      findings.push(makeFinding(modifyMemoryOrSkillRule(context), path, { line: match.line, snippet: match.snippet }))
    }
  }

  // Exfiltration cue: same line needs both a URL and the send/upload/post phrasing.
  // Line-based, not whole-file proximity — deliberately narrow to keep precision up.
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (URL_PATTERN.test(line) && EXFIL_PHRASE_PATTERN.test(line)) {
      findings.push(makeFinding(exfiltrationCueRule(context), path, { line: index + 1, snippet: line.trim().slice(0, 160) }))
    }
  })

  return findings
}
