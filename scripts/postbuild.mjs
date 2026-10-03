#!/usr/bin/env node
/**
 * postbuild.mjs — reshape the Vite output into the directory layout that
 * qBittorrent requires for an alternative WebUI.
 *
 * qBittorrent's WebApplication resolves every request relative to a configured
 * root folder and always looks under "public" or "private" (see
 * src/webui/webapplication.cpp):
 *
 *     PUBLIC_FOLDER  = "/public"
 *     PRIVATE_FOLDER = "/private"
 *     INDEX_HTML     = "/index.html"
 *
 * The root document is "<root>/private/index.html", and any asset referenced
 * as "./x" from inside private/ is looked up as "<root>/private/x".
 *
 * So we produce:
 *
 *     dist/
 *       public/          (public/unauthenticated assets)
 *       private/
 *         index.html
 *         assets/...
 *       version.txt
 *
 * This script also enforces the hard constraints the server imposes:
 *   - no symlinks anywhere in the tree ("Symlinks inside alternative UI
 *     folder are forbidden")
 *   - every regular file must be < 10 MiB (MAX_ALLOWED_FILESIZE)
 */

import { mkdir, readdir, rename, rm, stat, writeFile, readFile, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const privateDir = path.join(distDir, 'private')
const publicDir = path.join(distDir, 'public')

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MiB — mirrors MAX_ALLOWED_FILESIZE

const log = (msg) => console.log(`[postbuild] ${msg}`)
const fail = (msg) => {
  console.error(`[postbuild] ERROR: ${msg}`)
  process.exit(1)
}

/** Recursively walk a directory, returning absolute paths of all entries. */
async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    out.push(full)
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      out.push(...(await walk(full)))
    }
  }
  return out
}

async function main() {
  if (!existsSync(distDir)) fail('dist/ does not exist — run "vite build" first.')

  // ---------------------------------------------------------------------
  // 1. Preserve the generated service worker + manifest, then move every
  //    remaining build artifact under private/.
  // ---------------------------------------------------------------------
  const preserved = new Set(['private', 'public'])
  const topLevel = await readdir(distDir, { withFileTypes: true })

  await mkdir(privateDir, { recursive: true })
  await mkdir(publicDir, { recursive: true })

  for (const entry of topLevel) {
    if (preserved.has(entry.name)) continue
    const from = path.join(distDir, entry.name)
    const to = path.join(privateDir, entry.name)
    await rm(to, { recursive: true, force: true })
    await rename(from, to)
  }

  if (!existsSync(path.join(privateDir, 'index.html'))) {
    fail('private/index.html is missing — the build did not emit an entry document.')
  }

  // ---------------------------------------------------------------------
  // 1b. Install the unauthenticated entry document.
  //
  // qBittorrent resolves "GET /" to public/index.html when the request has no
  // session (webapplication.cpp selects PUBLIC_FOLDER vs PRIVATE_FOLDER based
  // on session state). With an alternative WebUI enabled it ALSO requires the
  // resolved path to be a regular file, so a public folder without an
  // index.html makes the very first page load fail with:
  //
  //     "Unacceptable file type, only regular file is allowed."
  //
  // The stock WebUI ships a public entry for exactly this reason. Ours is a
  // minimal hand-off page that redirects into ../private/.
  // ---------------------------------------------------------------------
  const publicEntrySource = path.join(projectRoot, 'static-public', 'index.html')
  if (!existsSync(publicEntrySource)) {
    fail('static-public/index.html is missing — it is required as the unauthenticated entry.')
  }
  await copyFile(publicEntrySource, path.join(publicDir, 'index.html'))

  // ---------------------------------------------------------------------
  // 1c. Guarantee /favicon.ico exists in BOTH trees.
  //
  // Browsers request /favicon.ico at the site root even when an explicit
  // <link rel="icon"> is present, and mobile browsers are especially eager
  // about it. qBittorrent maps that to <root>/private/favicon.ico (with a
  // session) or <root>/public/favicon.ico (without), so a missing file is
  // another way to hit "Unacceptable file type, only regular file is allowed."
  // ---------------------------------------------------------------------
  for (const sub of ['private', 'public']) {
    for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
      const from = path.join(projectRoot, 'static', 'icons', name)
      if (!existsSync(from)) {
        fail(`static/icons/${name} is missing — browsers request it at the site root.`)
      }
      await copyFile(from, path.join(distDir, sub, name))
    }
  }

  // ---------------------------------------------------------------------
  // 1d. Stub the other root-path files the browser requests unprompted.
  //
  // Browsers fetch /manifest.webmanifest and /sw.js at the SITE ROOT without
  // being asked. With no session those resolve to <root>/public/<name>, which
  // previously did not exist — and a missing file is a 500, not a 404, because
  // the alternative-WebUI loader treats "file not found" as an error.
  //
  // The visible symptom was console spam plus a failing manifest fetch during
  // login, which is exactly the kind of noise that makes a login look broken.
  //
  // Both are stubbed as EMPTY but valid: the real manifest and service worker
  // live in private/ and are only reachable once a session exists.
  // ---------------------------------------------------------------------
  await writeFile(
    path.join(publicDir, 'manifest.webmanifest'),
    `${JSON.stringify(
      {
        // Deliberately minimal. A manifest served to a signed-out visitor must
        // not describe an app they cannot reach, and start_url must stay a file
        // rather than a directory or the loader rejects it.
        name: 'qBittorrent WebUI',
        short_name: 'qBittorrent',
        start_url: './index.html',
        display: 'standalone',
        icons: [],
      },
      null,
      2,
    )}\n`,
  )

  // An empty service worker is valid and registers nothing, so a signed-out
  // visitor's browser stops erroring on a 500.
  await writeFile(path.join(publicDir, 'sw.js'), '// No service worker before sign-in.\n')

  // ---------------------------------------------------------------------
  // 2. Add a marker file. Useful for support/debugging and mirrors the
  //    convention used by other alternative WebUIs.
  // ---------------------------------------------------------------------
  let appVersion = 'unknown'
  try {
    const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
    appVersion = pkg.version
  } catch {
    /* non-fatal */
  }
  await writeFile(path.join(distDir, 'version.txt'), `macui-qbittorrent ${appVersion}\n`, 'utf8')

  // Note the distinction, because the name is genuinely confusing:
  //   dist/private/  <- our application, served as the authenticated UI
  //   dist/public/   <- a folder qBittorrent REQUIRES to exist; holds files
  //                     served without authentication. We keep it present
  //                     (even if nearly empty) so the directory structure is
  //                     valid, since a missing `public` produces the classic
  //                     "Unacceptable file type, only regular file is allowed."
  await writeFile(
    path.join(publicDir, 'README.txt'),
    [
      'This folder exists because qBittorrent requires an alternative WebUI to',
      'provide both a "public" and a "private" directory.',
      '',
      'Files here are served WITHOUT authentication. Do not place anything',
      'sensitive in this folder. The application itself lives in ../private/.',
      '',
    ].join('\n'),
    'utf8',
  )

  // ---------------------------------------------------------------------
  // 3. Validate the hard server-side constraints.
  // ---------------------------------------------------------------------
  const problems = []

  // The unauthenticated entry was copied in step 1b, so its presence is
  // guaranteed — but verify the copy produced a REAL file rather than an
  // empty one, which would still satisfy the server while rendering nothing.
  const publicEntry = path.join(publicDir, 'index.html')
  if (!existsSync(publicEntry) || (await stat(publicEntry)).size === 0) {
    problems.push('public/index.html is missing or empty — unauthenticated GET / would break.')
  }

  // Browsers request these at the site root regardless of the document path.
  for (const sub of ['private', 'public']) {
    for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
      const p = path.join(distDir, sub, name)
      if (!existsSync(p)) {
        problems.push(
          `${sub}/${name} is missing — a root request for it would 500 with ` +
            '"Unacceptable file type, only regular file is allowed."',
        )
      }
    }
  }

  // Likewise for the manifest and service worker. A signed-out visitor's
  // browser requests both at the site root, and a missing file is a 500 (not a
  // 404) because the alternative-WebUI loader treats it as an error.
  for (const name of ['manifest.webmanifest', 'sw.js']) {
    const p = path.join(publicDir, name)
    if (!existsSync(p) || (await stat(p)).size === 0) {
      problems.push(
        `public/${name} is missing or empty — an unauthenticated root request ` +
          'for it would 500 during sign-in.',
      )
    }
  }

  // The manifest must never point start_url at a directory: the server rejects
  // directory paths outright. This is what broke mobile browsers.
  const manifestPath = path.join(privateDir, 'manifest.webmanifest')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      const startUrl = String(manifest.start_url ?? '')
      if (!startUrl || startUrl.endsWith('/')) {
        problems.push(
          `manifest start_url "${startUrl}" resolves to a directory; qBittorrent ` +
            'requires a regular file (use "./index.html").',
        )
      }
    } catch (err) {
      problems.push(`manifest.webmanifest is not valid JSON: ${err.message}`)
    }
  } else {
    problems.push('private/manifest.webmanifest is missing.')
  }

  let fileCount = 0
  let totalBytes = 0

  for (const full of await walk(distDir)) {
    const st = await stat(full).catch(() => null)
    if (!st) continue

    if (st.isSymbolicLink()) {
      problems.push(`symlink found (forbidden by qBittorrent): ${path.relative(distDir, full)}`)
      continue
    }
    if (!st.isFile()) continue

    fileCount += 1
    totalBytes += st.size
    if (st.size >= MAX_FILE_SIZE) {
      problems.push(
        `file exceeds 10 MiB limit: ${path.relative(distDir, full)} (${(st.size / 1048576).toFixed(2)} MiB)`,
      )
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`[postbuild]   - ${p}`)
    fail('output violates qBittorrent alternative-WebUI constraints.')
  }

  const referenced = new Set()
  const indexHtml = await readFile(path.join(privateDir, 'index.html'), 'utf8')
  for (const m of indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)) referenced.add(m[1])

  log('output layout is valid')
  log(`  dist/private/index.html  (entry document)`)
  log(`  files: ${fileCount}, total: ${(totalBytes / 1024).toFixed(1)} KiB`)
  log(`  index.html references ${referenced.size} local asset(s)`)
  log('')
  log('Point qBittorrent at the "dist" folder itself (the one containing public/ and private/):')
  log('  Settings > WebUI > Use alternative WebUI > Files location: /macos-theme')
}

main().catch((err) => fail(err?.stack ?? String(err)))