#!/usr/bin/env node
/**
 * Installs the repository's git hooks.
 *
 * Hooks live in a versioned `hooks/` directory and are activated by pointing
 * `core.hooksPath` at it. That is deliberate: anything dropped into `.git/hooks`
 * is untracked, invisible in review, and silently absent on every other clone —
 * a poor place for logic that keeps the deployed artifacts in sync.
 *
 * Run automatically from `pnpm install` (via the `prepare` script), and safe to
 * run repeatedly.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const HOOKS_DIR = 'hooks'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

// Not a git checkout (a tarball download, say) — nothing to install into.
try {
  git('rev-parse', '--git-dir')
} catch {
  console.log('[hooks] not a git repository — skipping hook install')
  process.exit(0)
}

if (!fs.existsSync(HOOKS_DIR)) {
  console.log(`[hooks] no ${HOOKS_DIR}/ directory — nothing to install`)
  process.exit(0)
}

const current = (() => {
  try {
    return git('config', 'core.hooksPath')
  } catch {
    return ''
  }
})()

if (current === HOOKS_DIR) {
  console.log(`[hooks] core.hooksPath already set to ${HOOKS_DIR}`)
  process.exit(0)
}

// Respect an existing custom hooksPath: someone may have their own setup.
if (current && current !== HOOKS_DIR) {
  console.log(`[hooks] core.hooksPath is "${current}" — leaving it alone`)
  console.log(`[hooks] to use this repo's hooks: git config core.hooksPath ${HOOKS_DIR}`)
  process.exit(0)
}

git('config', 'core.hooksPath', HOOKS_DIR)

// Make the hooks executable where the filesystem supports it. Windows does not
// track the bit, which is why the install sets it explicitly on POSIX.
if (process.platform !== 'win32') {
  for (const name of fs.readdirSync(HOOKS_DIR)) {
    const p = path.join(HOOKS_DIR, name)
    if (fs.statSync(p).isFile()) fs.chmodSync(p, 0o755)
  }
}

console.log(`[hooks] installed — core.hooksPath = ${HOOKS_DIR}`)
console.log('[hooks] post-commit will rebuild the dist branch when build inputs change')