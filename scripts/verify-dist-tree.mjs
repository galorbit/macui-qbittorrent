/**
 * Replays qBittorrent's alternative-WebUI path resolution against a real
 * checkout of the dist branch, so the deployment can be validated without
 * running the server.
 *
 * The rules come from src/webui/webapplication.cpp:
 *
 *   localPath = root / (session ? "private" : "public") / <request path>
 *   if that is missing AND a session exists, fall back to public/
 *
 * A missing file is an error; a directory or symlink is rejected with
 * "Unacceptable file type, only regular file is allowed."; a file over 10 MiB
 * is rejected too.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2]
if (!ROOT) {
  console.error('usage: node verify-dist-tree.mjs <checkout>')
  process.exit(1)
}

const MAX_ALLOWED_FILESIZE = 10 * 1024 * 1024

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

/** Resolve a request the way the server does. */
function resolve(requestPath, hasSession) {
  let clean = requestPath.replace(/^\/+/, '').split('?')[0].split('#')[0]

  // A request for a directory (including the bare root) is served as that
  // directory's index.html — the server appends the default document rather
  // than rejecting the directory.
  if (clean === '' || clean.endsWith('/')) clean += 'index.html'

  const primary = path.join(ROOT, hasSession ? 'private' : 'public', clean)
  if (fs.existsSync(primary)) return { file: primary, via: hasSession ? 'private' : 'public' }

  if (hasSession) {
    const fallback = path.join(ROOT, 'public', clean)
    if (fs.existsSync(fallback)) return { file: fallback, via: 'public (fallback)' }
  }
  return null
}

/** Apply the loader's file-type rules. */
function serveable(file) {
  const st = fs.lstatSync(file)
  if (st.isSymbolicLink()) return { ok: false, why: 'symlink' }
  if (st.isDirectory()) return { ok: false, why: 'directory' }
  if (!st.isFile()) return { ok: false, why: 'not a regular file' }
  if (st.size > MAX_ALLOWED_FILESIZE) return { ok: false, why: `too large (${st.size})` }
  return { ok: true, size: st.size }
}

console.log(`Root: ${ROOT}\n`)

// ---- Structure the server requires -------------------------------------
console.log('=== Directory structure ===')
check('root contains public/', fs.existsSync(path.join(ROOT, 'public')))
check('root contains private/', fs.existsSync(path.join(ROOT, 'private')))
check(
  'public/ is non-empty',
  fs.readdirSync(path.join(ROOT, 'public')).length > 0,
  `${fs.readdirSync(path.join(ROOT, 'public')).length} entries`,
)

// ---- The two documents that matter -------------------------------------
console.log('\n=== Entry documents ===')
for (const [label, req, session] of [
  ['no session  GET /            -> sign-in page', '/', false],
  ['no session  GET /index.html  -> sign-in page', '/index.html', false],
  ['session     GET /            -> app', '/', true],
  ['session     GET /index.html  -> app', '/index.html', true],
]) {
  const hit = resolve(req, session)
  if (!hit) {
    check(label, false, '404 — nothing resolved')
    continue
  }
  const s = serveable(hit.file)
  check(label, s.ok, s.ok ? hit.via : `rejected: ${s.why}`)
}

// ---- Regression guards from real bugs ----------------------------------
console.log('\n=== Regression guards ===')
{
  // The sign-in page must NOT be reachable as the app document when a session
  // exists, or an unauthenticated visitor could load the app shell.
  const hit = resolve('/index.html', true)
  check(
    'session: /index.html resolves to private/, not public/',
    hit?.via === 'private',
    hit?.via ?? 'nothing',
  )
}
{
  // A "private/" prefix in a redirect target makes the server look for
  // private/private/index.html.
  const hit = resolve('/private/index.html', false)
  check(
    'no-session: /private/index.html does NOT resolve (would 404)',
    hit === null,
    hit ? `unexpectedly resolved via ${hit.via}` : 'correctly unresolved',
  )
}
{
  const sw = resolve('/sw.js', true)
  check('service worker is served from private/', sw?.via === 'private')
}
{
  const manifest = resolve('/manifest.webmanifest', true)
  check('manifest is served from private/', manifest?.via === 'private')
  if (manifest) {
    const json = JSON.parse(fs.readFileSync(manifest.file, 'utf8'))
    check(
      'manifest start_url is a file, not a directory',
      typeof json.start_url === 'string' && json.start_url !== './' && !json.start_url.endsWith('/'),
      String(json.start_url),
    )
  }
}
{
  const fav = resolve('/favicon.ico', true)
  const favPublic = resolve('/favicon.ico', false)
  check('favicon resolves with a session', fav !== null)
  check('favicon resolves WITHOUT a session', favPublic !== null)
}

// ---- Every file is individually serveable ------------------------------
console.log('\n=== Per-file validation ===')
const all = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip VCS metadata: it is never served, and counting it would both inflate
    // the totals and make the size check meaningless.
    if (entry.name === '.git') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else all.push(p)
  }
}
walk(ROOT)

const bad = all.filter((f) => !serveable(f).ok)
check(`all ${all.length} files are regular, small and non-symlink`, bad.length === 0,
  bad.map((f) => `${path.relative(ROOT, f)}: ${serveable(f).why}`).join(', '))

const total = all.reduce((n, f) => n + fs.statSync(f).size, 0)
console.log(`\n  ${all.length} files, ${(total / 1024).toFixed(1)} KiB total`)
console.log(`  largest: ${(Math.max(...all.map((f) => fs.statSync(f).size)) / 1024).toFixed(1)} KiB`)

console.log(`\nRESULT: ${failures === 0 ? 'all checks passed' : `${failures} check(s) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)