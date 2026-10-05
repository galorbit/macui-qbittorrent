#!/usr/bin/env node
/**
 * Publishes the current build output to the orphan `dist` branch.
 *
 * The deployment host has no Node.js, so the compiled WebUI lives on a branch
 * of its own. That branch shares no history with `main` and contains ONLY build
 * output — cloning it downloads exactly what the server needs.
 *
 * Usage:
 *   node scripts/publish-dist-branch.mjs [--push]
 *
 * Without --push it commits locally and prints what would happen; with --push it
 * pushes to EVERY configured remote that carries the branch, so the mirrors stay
 * in step instead of one of them silently going stale.
 *
 * The branch is rebuilt from scratch each time, so the history stays a single
 * commit rather than accumulating a diff per build.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BRANCH = 'dist'
const shouldPush = process.argv.includes('--push')

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options })
}

const originalBranch = git('rev-parse', '--abbrev-ref', 'HEAD')

// Capture the source revision NOW, while that branch is still checked out.
// Reading it later — after switching to the orphan branch — fails with
// "Needed a single revision", because the ref is no longer resolvable.
const sourceSha = git('rev-parse', '--short', originalBranch)

/**
 * Safety guards. These are load-bearing, not decoration.
 *
 * The branch rebuild deletes EVERYTHING in the working tree except .git and
 * copies the build output back in. That is correct on the throwaway `dist`
 * branch, but destructive if this script ever runs while a real branch is
 * checked out — it deleted node_modules once, and would remove untracked source
 * just as happily.
 */
if (/worktrees/.test(git('rev-parse', '--git-dir'))) {
  console.error('Refusing to run inside a linked worktree — it would clobber')
  console.error("the primary checkout's files. Run it from the main checkout.")
  process.exit(1)
}

if (originalBranch === 'HEAD') {
  console.error('Refusing to run with a detached HEAD: the working tree is')
  console.error('rebuilt and there would be no branch to return to.')
  process.exit(1)
}

if (originalBranch === BRANCH) {
  console.error(`Already on ${BRANCH}. Check out the source branch first.`)
  process.exit(1)
}

if (!fs.existsSync('dist/public/index.html') || !fs.existsSync('dist/private/index.html')) {
  console.error('No build found. Run `pnpm build` first.')
  process.exit(1)
}

if (git('status', '--porcelain')) {
  console.error('Working tree is dirty. Commit or stash your changes first.')
  process.exit(1)
}

// Stage the output somewhere safe: switching branches replaces the working tree.
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'macui-dist-'))
fs.cpSync('dist', staging, { recursive: true })
// README lives beside public/ and private/, not inside either, so it is never
// served as a WebUI asset.
fs.copyFileSync('deploy/DIST-README.md', path.join(staging, 'README.md'))

const fileCount = (function count(dir) {
  let n = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    n += entry.isDirectory() ? count(path.join(dir, entry.name)) : 1
  }
  return n
})(staging)

console.log(`${fileCount} files staged for the ${BRANCH} branch`)

function cleanup() {
  fs.rmSync(staging, { recursive: true, force: true })
}

/**
 * Re-exec from a copy outside the repository.
 *
 * The rebuild below deletes every entry in the working tree, and this script
 * lives in that tree — so the FIRST version deleted itself mid-run and died
 * with MODULE_NOT_FOUND, leaving the checkout stranded on the orphan branch
 * with no `dist` branch and no source files.
 *
 * Node has already loaded the module into memory, but it still resolves the
 * script path when reporting errors, and a rebuilt tree invalidates it. Running
 * from a temp copy removes the whole class of problem.
 */
if (!process.env.MACUI_PUBLISH_RELOCATED) {
  const self = path.resolve(process.argv[1])
  const safeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macui-publish-'))
  const safeSelf = path.join(safeDir, 'publish-dist-branch.mjs')
  fs.copyFileSync(self, safeSelf)

  const res = spawnSync(
    process.execPath,
    [safeSelf, ...process.argv.slice(2)],
    { stdio: 'inherit', cwd: process.cwd(), env: { ...process.env, MACUI_PUBLISH_RELOCATED: '1' } },
  )

  fs.rmSync(safeDir, { recursive: true, force: true })
  process.exit(res.status ?? 1)
}

try {
  // Rebuild the branch from scratch so it never accumulates build diffs.
  //
  // `git checkout --orphan` fails outright when the branch already exists, so
  // an existing branch must be deleted first. Without this the script works
  // exactly once — the second run dies with "a branch named 'dist' already
  // exists" and the deployed files silently go stale.
  const exists = (() => {
    try {
      git('rev-parse', '--verify', `refs/heads/${BRANCH}`)
      return true
    } catch {
      return false
    }
  })()

  if (exists) {
    // `-D` rather than `-d`: this branch is intentionally disposable.
    git('branch', '-D', BRANCH)
    console.log(`removed the previous ${BRANCH} branch`)
  }

  git('checkout', '--orphan', BRANCH)
  git('rm', '-r', '--cached', '.', '-q')

  /**
   * Wipe the working tree, but preserve paths that are expensive to recreate and
   * irrelevant to the build output.
   *
   * `node_modules` is the important one: deleting it forces a full `pnpm
   * install` after every publish, and because the post-commit hook runs this
   * automatically, that would make normal development unusable.
   *
   * These paths must then be EXCLUDED from the commit explicitly. The root
   * `.gitignore` lives on `main` and does not exist on the orphan branch, so
   * `git add -A` would otherwise try to stage all of node_modules — tens of
   * thousands of files, which fails outright.
   */
  const PRESERVE = new Set(['.git', 'node_modules', '.pnpm-store', '.vite'])

  for (const entry of fs.readdirSync('.')) {
    if (PRESERVE.has(entry)) continue
    fs.rmSync(entry, { recursive: true, force: true })
  }

  fs.cpSync(staging, '.', { recursive: true })

  // Write an ignore file for the orphan branch. The root .gitignore belongs to
  // main and is not present here, so without this `git add -A` would sweep in
  // node_modules and fail.
  fs.writeFileSync(
    '.gitignore',
    [
      '# Generated for this branch — the build output is the only thing tracked.',
      'node_modules/',
      '.pnpm-store/',
      '.vite/',
      'dist/',
      '',
    ].join('\n'),
  )

  // Stage only the deployable output. The generated .gitignore is a build
  // artefact rather than content, and tracking it would make the branch 48 files
  // instead of the 47 that are actually served.
  git('add', '--', 'public', 'private', 'version.txt', 'README.md')
  git(
    'commit',
    '-q',
    '-m',
    `chore(dist): publish prebuilt static files

Generated from ${originalBranch} @ ${sourceSha}.

${fileCount} files. Contains no source — see the main branch for that.`,
  )

  if (shouldPush) {
    /*
     * Push to every remote, not just `origin`.
     *
     * This repository is mirrored (a self-hosted Gitea plus GitHub), and the
     * `dist` branch is the download package for people without a build
     * toolchain. Pushing to one remote only meant the other mirror silently
     * served a stale package until someone remembered to push to it by hand.
     *
     * Each remote is attempted independently: a temporary outage on one must not
     * leave the others unpublished, but any failure still exits non-zero so it
     * cannot pass unnoticed in a script.
     */
    const remotes = git('remote').split('\n').map((r) => r.trim()).filter(Boolean)
    if (remotes.length === 0) {
      console.error('No git remote is configured — nothing to push to.')
      process.exitCode = 1
    } else {
      const failed = []
      for (const remote of remotes) {
        console.log(`pushing ${BRANCH} → ${remote}…`)
        try {
          // Force: the branch is rebuilt from scratch each time, so the remote
          // copy is replaced rather than fast-forwarded.
          run('git', ['push', '--force', remote, BRANCH])
        } catch {
          failed.push(remote)
          console.error(`  ✗ ${remote} failed`)
        }
      }
      if (failed.length) {
        console.error(`\nPushed to ${remotes.length - failed.length}/${remotes.length} remotes.`)
        console.error(`Failed: ${failed.join(', ')}`)
        console.error('Re-run `pnpm publish:dist` once the remote is reachable.')
        process.exitCode = 1
      } else {
        console.log(`pushed to all ${remotes.length} remotes: ${remotes.join(', ')}`)
      }
    }
  } else {
    console.log('committed locally. Re-run with --push to publish to every remote.')
  }
} finally {
  // Restoring the branch is what guarantees a crash cannot strand the checkout
  // on the orphan branch. Use -f: the working tree was just rebuilt, so a plain
  // checkout would refuse and leave the developer in the dist tree.
  try {
    git('checkout', '-f', originalBranch)
  } catch (err) {
    console.error(`Could not return to ${originalBranch}: ${err.message}`)
    console.error(`Recover manually with: git checkout -f ${originalBranch}`)
  }
  cleanup()
}