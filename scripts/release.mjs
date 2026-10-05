#!/usr/bin/env node
/**
 * One-command release: push the source branch, then build and publish the static
 * package to every mirror.
 *
 * WHY THIS EXISTS
 * ---------------
 * The intended workflow is:
 *
 *   1. commit to the source branch (main)
 *   2. build the `dist` package locally
 *   3. upload `main` AND the rebuilt `dist` to every remote
 *
 * Doing that by hand is four commands across two branches and two remotes, and
 * the failure mode of getting it partly right is quiet: one mirror keeps serving
 * an old download package, or `main` is pushed but `dist` is not, and nobody
 * notices until a user reports a bug that was already fixed.
 *
 * This script performs the whole sequence and stops at the first genuine
 * problem, verifying along the way rather than pushing optimistically.
 *
 * Usage:
 *   node scripts/release.mjs              # checks, then does it
 *   node scripts/release.mjs --dry-run    # show what would happen, change nothing
 *   node scripts/release.mjs --skip-tests # for a docs-only change
 *
 * It refuses to run when the checks fail, when the tree is dirty, or when the
 * source branch is not ahead of anything — a release that publishes nothing is
 * almost always a mistake.
 */
import { execFileSync } from 'node:child_process'

const DRY = process.argv.includes('--dry-run')
const SKIP_TESTS = process.argv.includes('--skip-tests')

/**
 * Run a command inheriting stdio; throw on a non-zero exit.
 *
 * Windows needs special handling for `pnpm`. Measured on this machine,
 * `where pnpm` returns two candidates and NEITHER is launchable by Node:
 *
 *   AppData\Roaming\npm\pnpm       POSIX shell script  → ENOENT
 *   AppData\Roaming\npm\pnpm.cmd   batch shim          → EINVAL
 *
 * So a shell really is required. The subtlety is HOW: passing `shell: true`
 * together with an args array triggers DEP0190, because Node then concatenates
 * the arguments instead of escaping them. Building one properly quoted command
 * line ourselves avoids the warning and is honest about what the shell does.
 *
 * Every argument here is a fixed token (a subcommand, a branch or remote name),
 * never user input, so quoting them is straightforward.
 */
function quoteForShell(part) {
  const s = String(part)
  return /[\s"^&|<>]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function run(command, args) {
  if (process.platform === 'win32') {
    const line = [command, ...args].map(quoteForShell).join(' ')
    execFileSync(line, { stdio: 'inherit', shell: true })
    return
  }
  execFileSync(command, args, { stdio: 'inherit' })
}

/** Run a command and capture trimmed stdout. */
function capture(command, args) {
  if (process.platform === 'win32') {
    const line = [command, ...args].map(quoteForShell).join(' ')
    return execFileSync(line, { encoding: 'utf8', shell: true }).trim()
  }
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function git(...args) {
  return capture('git', args)
}

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

function step(n, total, title) {
  console.log(`\n[${n}/${total}] ${title}`)
}

const TOTAL = 6

// ---------------------------------------------------------------------------
// Preconditions. Every one of these is a mistake that is expensive to notice
// after the artifacts are already published.
// ---------------------------------------------------------------------------
const sourceBranch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (sourceBranch === 'HEAD') fail('Detached HEAD — check out a branch first.')
if (sourceBranch === 'dist') fail('You are on the dist branch. Check out the source branch first.')

if (git('status', '--porcelain')) {
  fail(
    'Working tree is dirty. Commit or stash first — a release must publish an\n' +
      '  exact, reproducible revision, not a mix of committed and uncommitted work.',
  )
}

const remotes = git('remote').split('\n').map((r) => r.trim()).filter(Boolean)
if (remotes.length === 0) fail('No git remote configured.')

const head = git('rev-parse', '--short', sourceBranch)

console.log(`Releasing ${sourceBranch} @ ${head}`)
console.log(`Remotes: ${remotes.join(', ')}`)
if (DRY) console.log('DRY RUN — nothing will be changed.')

// How far ahead of each remote are we? Publishing nothing is usually an error,
// but a stale mirror is worth reporting even when the branch is current.
const behind = []
const aheadOfAny = remotes.some((remote) => {
  try {
    const counts = git('rev-list', '--left-right', '--count', `${remote}/${sourceBranch}...${sourceBranch}`)
    const [remoteOnly, localOnly] = counts.split(/\s+/).map(Number)
    if (remoteOnly > 0) behind.push(remote)
    return localOnly > 0
  } catch {
    // Remote branch does not exist yet — treat as "everything is new".
    return true
  }
})

if (!aheadOfAny && !DRY) {
  fail(
    `Nothing to release: ${sourceBranch} has no commits that any remote lacks.\n` +
      '  If you only want to rebuild the dist package, run: pnpm build && pnpm publish:dist',
  )
}

if (behind.length) {
  console.log(
    `\n⚠ These remotes have commits you do not have: ${behind.join(', ')}\n` +
      '  Review before pushing, or you will be pushing a divergent branch.',
  )
}

// ---------------------------------------------------------------------------
step(1, TOTAL, 'Type, lint and test')
if (SKIP_TESTS) {
  console.log('  skipped (--skip-tests)')
} else if (DRY) {
  console.log('  would run: pnpm typecheck && pnpm lint && pnpm test')
} else {
  run('pnpm', ['typecheck'])
  run('pnpm', ['lint'])
  run('pnpm', ['test'])
}

// ---------------------------------------------------------------------------
step(2, TOTAL, 'Build the static package')
if (DRY) {
  console.log('  would run: pnpm build')
} else {
  run('pnpm', ['build'])
}

// ---------------------------------------------------------------------------
step(3, TOTAL, 'Validate the built tree')
if (DRY) {
  console.log('  would run: pnpm verify:dist')
} else {
  // These re-check the server's own path-resolution rules against the artifacts.
  // A failure here means the package would not load on a real qBittorrent.
  run('pnpm', ['verify:dist'])
  run('pnpm', ['verify:entry'])
}

// ---------------------------------------------------------------------------
step(4, TOTAL, `Push ${sourceBranch} to every remote`)
for (const remote of remotes) {
  if (DRY) {
    console.log(`  would push: git push ${remote} ${sourceBranch}`)
    continue
  }
  console.log(`  pushing ${sourceBranch} → ${remote}`)
  try {
    run('git', ['push', remote, sourceBranch])
  } catch {
    fail(
      `Could not push ${sourceBranch} to ${remote}.\n` +
        `  Resolve it and re-run, or push that remote manually:\n` +
        `    git push ${remote} ${sourceBranch}`,
    )
  }
}

// ---------------------------------------------------------------------------
step(5, TOTAL, 'Publish the dist package to every remote')
if (DRY) {
  console.log('  would run: node scripts/publish-dist-branch.mjs --push')
} else {
  // Not fatal on its own: the source branch is already published, and re-running
  // publish:dist is safe because the dist branch is rebuilt from scratch.
  try {
    run('node', ['scripts/publish-dist-branch.mjs', '--push'])
  } catch {
    fail(
      'The dist package could not be published.\n' +
        '  The source branch WAS pushed. Fix the problem and run:\n' +
        '    pnpm publish:dist',
    )
  }
}

// ---------------------------------------------------------------------------
step(6, TOTAL, 'Confirm the mirrors agree')
if (DRY) {
  console.log('  would compare local refs against every remote')
} else {
  const local = {
    [sourceBranch]: git('rev-parse', sourceBranch),
    dist: git('rev-parse', `refs/heads/dist`),
  }
  let mismatch = false
  for (const remote of remotes) {
    const heads = git('ls-remote', '--heads', remote)
    for (const [branch, sha] of Object.entries(local)) {
      const line = heads.split('\n').find((l) => l.endsWith(`refs/heads/${branch}`))
      const remoteSha = line ? line.split(/\s+/)[0] : '(missing)'
      const ok = remoteSha === sha
      if (!ok) mismatch = true
      console.log(`  ${ok ? '✓' : '✗'} ${remote}/${branch}  ${remoteSha.slice(0, 8)}${ok ? '' : ` (local ${sha.slice(0, 8)})`}`)
    }
  }
  if (mismatch) fail('A remote does not match the local refs — see above.')
  console.log('\n✓ Released. Every remote is in step with the local repository.')
}