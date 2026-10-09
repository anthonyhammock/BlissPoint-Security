# Security Policy

## Reporting a vulnerability

If you find a security issue in `blisspoint-security` itself — not in something it
scans, see below — please report it privately rather than opening a public
issue:

- Email **solutions@blisspointanalytics.com**, or
- Open a [private security advisory](https://github.com/anthonyhammock/BlissPoint-Security/security/advisories/new)
  on this repository, if enabled.

Please include what you found, the steps to reproduce it, and the version
of `blisspoint-security` you tested. We'll acknowledge your report within 5 business
days.

This is a small, early-stage, mostly AI-assisted project — there is no
dedicated security team and no bug bounty program. We ask for coordinated
disclosure (please don't post it publicly until a fix is out, or 90 days
have passed, whichever comes first) and will credit you in the release
notes if you'd like.

## What's in scope

Anything about `blisspoint-security`'s own code that would let a scan do something
it isn't supposed to — most importantly, anything that makes the scanner
itself execute, import, or otherwise act on the untrusted content it
reads. That would break the tool's core promise (see the README's "What
it never does") and is the class of bug we care most about here. Also in
scope: a flaw in the CLI, the SARIF/lockfile/suppression file handling, or
the GitHub Action (`action.yml`) that could be exploited by a malicious
input file or a malicious caller.

## What's out of scope

- **A vulnerability in an MCP server, Agent Skill, or memory file that
  `blisspoint-security` scans.** Report that to whoever maintains that component,
  not to us. If `blisspoint-security` *failed to catch* something it should have,
  that's a false negative — see below, not a security report.
- **False positives and false negatives in the rule checks.** These are
  real accuracy problems worth fixing, but they aren't vulnerabilities in
  `blisspoint-security` itself. Please open a regular GitHub issue instead, with the
  file (or a redacted/synthetic version of it) that triggered or should
  have triggered a finding.
- **Findings from running `blisspoint-security` against your own machine or
  repository.** That's the tool working as intended — direct any
  questions about a specific finding to the README or the file it points
  at.

## Supported versions

`blisspoint-security` is pre-1.0 and only the latest version published to this
repository's `main` branch is supported. There is no long-term support
branch yet.
