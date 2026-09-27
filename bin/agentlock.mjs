#!/usr/bin/env node
// Thin launcher: runs the compiled CLI. Kept as a separate file (not
// src/cli.ts itself) so `bin` in package.json always points at build
// output, never at TypeScript source npm would otherwise have to transpile
// on every invocation.
import '../dist/cli.js'
