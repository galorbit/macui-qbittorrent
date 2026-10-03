#!/usr/bin/env node
/**
 * Preflight check: fail with a clear message if the toolchain is wrong.
 *
 * Vite 6 needs Node >= 20.19. Debian's own `nodejs` package is frequently much
 * older, and the resulting failure is an opaque syntax/API error deep inside a
 * dependency. Checking up front turns that into one actionable sentence.
 *
 * Runs automatically before `build` and `dev`.
 */

const MIN_NODE_MAJOR = 20
const MIN_NODE_MINOR = 19

const raw = process.versions.node
const [major, minor] = raw.split('.').map(Number)

const problems = []

if (major < MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor < MIN_NODE_MINOR)) {
  problems.push(
    `Node ${raw} is too old — this project needs Node >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0.\n` +
      '    Vite 6 requires it. Install a newer Node, e.g.:\n' +
      '      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n' +
      '      exec $SHELL -l && nvm install 22 && nvm use 22',
  )
}

// pnpm is the supported package manager; npm/yarn produce a different lockfile
// and can resolve peer dependencies differently.
const ua = process.env.npm_config_user_agent ?? ''
if (ua && !ua.startsWith('pnpm/')) {
  const used = ua.split('/')[0]
  problems.push(
    `This project is built with pnpm, but you ran ${used}.\n` +
      '    Enable pnpm via corepack (bundled with Node):\n' +
      '      corepack enable pnpm',
  )
}

if (problems.length > 0) {
  console.error('\n  Cannot continue:\n')
  for (const p of problems) console.error(`  - ${p}\n`)
  process.exit(1)
}

console.log(`  Node ${raw} — ok`)