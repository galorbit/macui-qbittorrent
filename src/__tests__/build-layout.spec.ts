/**
 * Smoke test: verify the toolchain and the qBittorrent output layout contract.
 *
 * This intentionally checks the *structural* guarantees the server enforces
 * rather than our own component behaviour, because a layout mistake is the
 * failure mode that produces the confusing
 * "Unacceptable file type, only regular file is allowed." error at runtime.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve from this file, not the CWD, so the suite works wherever vitest runs.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const distDir = path.join(projectRoot, 'dist')

const hasBuild = existsSync(path.join(distDir, 'private', 'index.html'))

describe.skipIf(!hasBuild)('alternative WebUI output layout', () => {
  it('exposes the entry document at private/index.html', () => {
    expect(existsSync(path.join(distDir, 'private', 'index.html'))).toBe(true)
  })

  it('includes a public folder (required by qBittorrent)', () => {
    expect(existsSync(path.join(distDir, 'public'))).toBe(true)
    expect(statSync(path.join(distDir, 'public')).isDirectory()).toBe(true)
  })

  /**
   * Regression guard.
   *
   * qBittorrent resolves "GET /" to public/index.html when the request carries
   * no session. Because an alternative WebUI must resolve every request to a
   * regular file, a public folder WITHOUT an index.html makes the very first
   * page load fail with:
   *
   *   "Unacceptable file type, only regular file is allowed."
   *
   * This was a real bug during development, so it is pinned here.
   */
  it('ships public/index.html for unauthenticated visitors', () => {
    const publicEntry = path.join(distDir, 'public', 'index.html')
    expect(existsSync(publicEntry)).toBe(true)
    expect(statSync(publicEntry).isFile()).toBe(true)

    const html = readFileSync(publicEntry, 'utf8')
    // It must be a real document that hands off to the application...
    expect(html).toMatch(/<html/i)
    expect(html).toMatch(/private\/index\.html/)
    // ...and must not itself perform any privileged API work.
    expect(html).not.toMatch(/\/api\/v2\//)
  })

  it('the public entry uses only relative paths', () => {
    const html = readFileSync(path.join(distDir, 'public', 'index.html'), 'utf8')
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    const absolute = refs.filter((r) => r.startsWith('/') && !r.startsWith('//'))
    expect(absolute).toEqual([])
  })

  it('references assets relatively so any mount path works', () => {
    const html = readFileSync(path.join(distDir, 'private', 'index.html'), 'utf8')
    const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    const absolute = srcs.filter((s) => s.startsWith('/') && !s.startsWith('//'))
    expect(absolute).toEqual([])
  })

  it('contains no symlinks (forbidden inside an alternative UI folder)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name)
        return e.isSymbolicLink() ? [full] : e.isDirectory() ? [full, ...walk(full)] : [full]
      })
    const links = walk(distDir).filter((p) => {
      try {
        return statSync(p).isSymbolicLink()
      } catch {
        return false
      }
    })
    expect(links).toEqual([])
  })

  it('keeps every file below the 10 MiB server limit', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name)
        return e.isDirectory() ? walk(full) : [full]
      })
    const oversized = walk(distDir).filter((f) => statSync(f).size >= 10 * 1024 * 1024)
    expect(oversized).toEqual([])
  })

  /**
   * Regression guard for the mobile "unacceptable file type" bug.
   *
   * qBittorrent refuses any request that does not resolve to a regular file.
   * The PWA manifest is served from /private/manifest.webmanifest, so a
   * relative start_url of "./" resolves to the DIRECTORY /private/ and the
   * server rejects it. Desktop tabs never consult start_url, which is why this
   * only ever broke on mobile.
   */
  it('manifest start_url names a file, never a directory', () => {
    const manifestPath = path.join(distDir, 'private', 'manifest.webmanifest')
    expect(existsSync(manifestPath)).toBe(true)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    expect(typeof manifest.start_url).toBe('string')
    expect(manifest.start_url).not.toBe('')
    // A trailing slash (or bare ".") means "a directory".
    expect(manifest.start_url.endsWith('/')).toBe(false)

    // Resolve it the way a browser does: against the manifest's own URL.
    const resolved = new URL(manifest.start_url, 'https://host/private/manifest.webmanifest')
    expect(resolved.pathname).not.toMatch(/\/$/)
    expect(resolved.pathname).toMatch(/index\.html$/)
  })

  it('manifest icons all exist on disk', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(distDir, 'private', 'manifest.webmanifest'), 'utf8'),
    )
    for (const icon of manifest.icons as Array<{ src: string }>) {
      const resolved = new URL(icon.src, 'https://host/private/manifest.webmanifest')
      // Strip the leading /private/ — the server re-adds that segment.
      const rel = resolved.pathname.replace(/^\/private\//, '')
      const onDisk = path.join(distDir, 'private', rel)
      expect(existsSync(onDisk), `manifest icon missing: ${icon.src}`).toBe(true)
    }
  })

  it('ships favicon.ico and apple-touch-icon in both trees', () => {
    // Browsers request /favicon.ico at the site root regardless of the document
    // path, and mobile browsers are especially eager about it.
    for (const sub of ['private', 'public']) {
      for (const name of ['favicon.ico', 'apple-touch-icon.png']) {
        const p = path.join(distDir, sub, name)
        expect(existsSync(p), `${sub}/${name} missing`).toBe(true)
        expect(statSync(p).size).toBeGreaterThan(0)
      }
    }
  })

  /**
   * Regression guard.
   *
   * Browsers fetch /manifest.webmanifest and /sw.js at the SITE ROOT without
   * being asked. With no session those resolve to public/<name>. When those
   * files were absent the server answered 500 — not 404, because the
   * alternative-WebUI loader treats a missing file as an error.
   *
   * Observed symptom: console errors and a failed manifest fetch during
   * sign-in, easily mistaken for the login itself being broken.
   */
  it('stubs the root-path files a browser requests while signed out', () => {
    for (const name of ['manifest.webmanifest', 'sw.js']) {
      const p = path.join(distDir, 'public', name)
      expect(existsSync(p), `public/${name} missing — a root request would 500`).toBe(true)
      expect(statSync(p).size, `public/${name} is empty`).toBeGreaterThan(0)
    }

    // The stub manifest must not point at a directory, or the loader rejects it
    // with "Unacceptable file type, only regular file is allowed."
    const manifest = JSON.parse(readFileSync(path.join(distDir, 'public', 'manifest.webmanifest'), 'utf8'))
    expect(typeof manifest.start_url).toBe('string')
    expect(manifest.start_url.endsWith('/')).toBe(false)
    expect(manifest.start_url).not.toBe('./')
  })

  it('does not leak the real manifest or service worker to signed-out users', () => {
    // public/ is served WITHOUT authentication, so it must not contain the
    // application's own manifest or worker — only inert stubs.
    const publicSw = readFileSync(path.join(distDir, 'public', 'sw.js'), 'utf8')
    expect(publicSw).not.toMatch(/precache|workbox/i)

    const publicManifest = readFileSync(
      path.join(distDir, 'public', 'manifest.webmanifest'),
      'utf8',
    )
    expect(publicManifest).not.toMatch(/icon-512|maskable/i)
  })
})

/**
 * Regression guard for the "/private/index.html" bug.
 *
 * qBittorrent's server PREPENDS the folder segment itself:
 *
 *     localPath = root / (session ? "private" : "public") / <request path>
 *
 * So a client that requests "/private/index.html" makes the server look for
 * <root>/private/private/index.html, which does not exist, producing
 * "Unacceptable file type, only regular file is allowed."
 *
 * An earlier version of the hand-off page did exactly this, and an earlier
 * version of this test asserted the broken URL as if it were correct. Both are
 * fixed; this test now models the server's resolution instead of pattern
 * matching a string.
 *
 * skipIf is required here too — this is a NESTED describe, so the guard on the
 * outer block does not cover it. Without it the suite fails outright whenever
 * `dist/` is absent, which made `pnpm test` depend on a prior build.
 */
describe.skipIf(!hasBuild)('request paths that qBittorrent would reject', () => {
  /** Mirrors WebApplication::sendWebUIFile(). */
  function serverResolves(requestPath: string, authenticated: boolean): boolean {
    const p = requestPath === '/' ? '/index.html' : requestPath
    const rel = p.replace(/^\//, '')
    let local = path.join(distDir, authenticated ? 'private' : 'public', rel)
    if (!existsSync(local) && authenticated) local = path.join(distDir, 'public', rel)
    return existsSync(local) && statSync(local).isFile()
  }

  it('accepts /index.html and / (the correct entry points)', () => {
    expect(serverResolves('/index.html', true)).toBe(true)
    expect(serverResolves('/index.html', false)).toBe(true)
    expect(serverResolves('/', true)).toBe(true)
    expect(serverResolves('/', false)).toBe(true)
  })

  it('rejects /private/index.html — the double-prefix mistake', () => {
    // Documented here so the failure mode is explicit rather than folklore.
    expect(serverResolves('/private/index.html', true)).toBe(false)
    expect(serverResolves('/private/index.html', false)).toBe(false)
  })

  it('the hand-off page never targets a prefixed path', () => {
    const html = readFileSync(path.join(distDir, 'public', 'index.html'), 'utf8')

    // It must not name the private/ segment in a URL it navigates to.
    const navTargets = [
      ...html.matchAll(/new URL\(\s*['"]([^'"]+)['"]/g),
      ...html.matchAll(/href="([^"]+)"/g),
    ].map((m) => m[1])

    expect(navTargets.length).toBeGreaterThan(0)
    for (const target of navTargets) {
      expect(target, `hand-off targets a prefixed path: ${target}`).not.toMatch(/private\//)
      expect(target, `hand-off targets a directory: ${target}`).not.toMatch(/^\.\.?\/?$/)
    }

    // And it must resolve the target against the origin, not the document path.
    expect(html).toMatch(/window\.location\.origin/)
  })
})

describe('build prerequisites', () => {
  it('has an entry index.html in the project root', () => {
    expect(existsSync(path.join(projectRoot, 'index.html'))).toBe(true)
  })

  it('configures a relative base URL', () => {
    const config = readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf8')
    expect(config).toMatch(/base:\s*'\.\/'/)
  })
})