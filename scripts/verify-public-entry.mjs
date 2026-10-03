/**
 * Verifies the unauthenticated entry page (public/index.html).
 *
 * Why this exists
 * ---------------
 * public/index.html is the sign-in page for logged-out visitors. It CANNOT be
 * a redirect: qBittorrent resolves
 *
 *     localPath = root / (session ? "private" : "public") / <request path>
 *
 * so with no session every path lands on public/, and a redirect back to
 * "/index.html" resolves to this very file — an infinite loop that presents as
 * an endless spinner. That shipped once. The ordering rule is therefore
 * load-bearing: authenticate FIRST, navigate SECOND.
 *
 * Run: node scripts/verify-login-flow.mjs [dist]
 */
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'

const root = process.argv[2] ?? 'dist'
const file = path.join(root, 'public', 'index.html')

if (!fs.existsSync(file)) {
  console.error(`Cannot find ${file}. Run "pnpm build" first.`)
  process.exit(2)
}

const html = fs.readFileSync(file, 'utf8')

const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (e) => {
  // jsdom does not implement navigation; the attempt is the signal we want, so
  // it is not an error here.
  if (/Not implemented: navigation/i.test(e.message)) return
  console.error('  jsdom error:', e.message)
})

/** Inline scripts, in document order. */
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
  (m) => m[1],
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Boot the page with the network stubbed.
 *
 * jsdom hides navigation targets, so URL construction is intercepted — the page
 * builds its target with `new URL(...)`, which makes the intended destination
 * observable.
 *
 * The origin is a documentation address (RFC 5737 TEST-NET-1). It must never be
 * a real host: this harness previously carried the maintainer's LAN address, and
 * a test that only passes against one specific deployment is both a privacy leak
 * and a fragile test.
 */
const TEST_ORIGIN = 'http://192.0.2.10:8080/'

function boot({ sessionExists, loginBody = 'Ok.', loginStatus = 200 }) {
  const dom = new JSDOM(html, {
    url: TEST_ORIGIN,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  })

  const { window } = dom
  const navigations = []
  const calls = []

  const RealURL = window.URL
  function TrackingURL(...args) {
    const instance = new RealURL(...args)
    navigations.push(instance.href)
    return instance
  }
  TrackingURL.prototype = RealURL.prototype
  Object.setPrototypeOf(TrackingURL, RealURL)
  window.URL = TrackingURL

  const state = { loginBody, loginStatus, sessionEstablished: sessionExists }

  window.fetch = async (url, options = {}) => {
    const target = String(url)
    calls.push(`fetch:${options.method ?? 'GET'} ${target}`)

    if (target.includes('app/version')) {
      // The page probes this on load, and again after a successful login to
      // confirm the session is really usable.
      return state.sessionEstablished
        ? { ok: true, status: 200, text: async () => '5.1.4' }
        : { ok: false, status: 403, text: async () => 'Forbidden' }
    }
    if (target.includes('auth/login')) {
      calls.push(`body:${String(options.body ?? '')}`)
      const ok = state.loginStatus >= 200 && state.loginStatus < 300
      // A 2xx means the session cookie was set.
      if (ok) state.sessionEstablished = true
      return {
        ok,
        status: state.loginStatus,
        text: async () => state.loginBody,
      }
    }
    return { ok: true, status: 200, text: async () => '' }
  }

  window.eval(`window.__runInline = () => { ${inlineScripts.join('\n')} }`)
  window.__runInline()

  return { window, doc: window.document, navigations, calls, state }
}

const results = []
function check(name, condition, detail = '') {
  results.push({ name, ok: !!condition })
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function submit(app, user, pass) {
  app.doc.getElementById('username').value = user
  app.doc.getElementById('password').value = pass
  app.doc
    .getElementById('loginform')
    .dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }))
}

async function run() {
  // ---- Structure ---------------------------------------------------------
  const app = boot({ sessionExists: false })
  await sleep(200)

  console.log('=== Page structure ===')
  check('exposes a login form', !!app.doc.getElementById('loginform'))
  check('has a username field', !!app.doc.getElementById('username'))
  check(
    'has a password field typed as password',
    app.doc.getElementById('password')?.type === 'password',
  )
  check('has an enabled submit button', !!app.doc.getElementById('submit'))
  check(
    'does NOT redirect on load when unauthenticated',
    app.navigations.length === 0,
    app.navigations[0] ?? '',
  )

  // ---- Wrong credentials -------------------------------------------------
  console.log('\n=== Wrong credentials (server replies 200 + "Fails.") ===')
  app.state.loginBody = 'Fails.'
  app.navigations.length = 0
  submit(app, 'admin', 'wrong')
  await sleep(200)

  const errText = app.doc.getElementById('error')?.textContent ?? ''
  check('does not navigate on failure', app.navigations.length === 0, app.navigations.join(', '))
  check('shows a credentials error, not a network error', /Invalid|用户名/.test(errText), errText)
  check('clears the password field', app.doc.getElementById('password').value === '')
  check('re-enables the submit button', !app.doc.getElementById('submit').disabled)

  // ---- Banned IP ---------------------------------------------------------
  console.log('\n=== Banned IP (server replies 403) ===')
  app.state.loginBody =
    'Your IP address has been banned after too many failed authentication attempts.'
  app.state.loginStatus = 403
  app.navigations.length = 0
  submit(app, 'admin', 'whatever')
  await sleep(200)

  const bannedText = app.doc.getElementById('error')?.textContent ?? ''
  check('does not navigate when banned', app.navigations.length === 0)
  check('reports the ban specifically', /ban|封禁/i.test(bannedText), bannedText)

  // ---- Correct credentials, 200 + "Ok." ----------------------------------
  console.log('\n=== Correct credentials (200 + "Ok.") ===')
  app.state.loginBody = 'Ok.'
  app.state.loginStatus = 200
  app.calls.length = 0
  app.navigations.length = 0
  submit(app, 'admin', 'correct')
  await sleep(250)

  const loginIdx = app.calls.findIndex(
    (c) => c.startsWith('fetch:POST') && c.includes('auth/login'),
  )
  const navigated = app.navigations[0] ?? null

  check('sends credentials to auth/login', loginIdx >= 0)
  check(
    'posts them urlencoded',
    app.calls.some((c) => c.startsWith('body:') && c.includes('username=admin')),
  )
  check('navigates only after a successful login', !!navigated, navigated ?? 'no navigation seen')

  if (navigated) {
    // THE regression: a "/private/" segment makes the server look for
    // private/private/index.html and fail with "only regular file is allowed".
    check('target contains NO /private/ segment', !/\/private\//.test(navigated), navigated)
    check('target is a file, not a directory', !navigated.endsWith('/'), navigated)
    check('target points at index.html', /index\.html$/.test(navigated), navigated)
  }

  // ---- Correct credentials, 204 with NO body -----------------------------
  //
  // Regression guard for a real bug: the page used to require the body to read
  // exactly "Ok.". qBittorrent builds that answer a successful login with
  // 204 No Content made valid logins report "wrong password", while Ctrl+F5
  // (which skips the form entirely) sailed straight into the app.
  console.log('\n=== Correct credentials (204, empty body) ===')
  const app204 = boot({ sessionExists: false })
  await sleep(200)

  app204.state.loginStatus = 204
  app204.state.loginBody = ''
  app204.navigations.length = 0
  submit(app204, 'admin', 'correct')
  await sleep(250)

  const navigated204 = app204.navigations[0] ?? null
  const err204 = app204.doc.getElementById('error')?.textContent ?? ''

  check(
    'treats 204 (empty body) as a successful login',
    !!navigated204,
    navigated204 ?? `no navigation; error shown: "${err204}"`,
  )
  check(
    'does not report a credentials error for 204',
    !/invalid|错误/i.test(err204),
    err204 || '(no error shown)',
  )

  // ---- Rejected login: 200 + "Fails." ------------------------------------
  //
  // The mirror image: a 2xx that means failure. Status alone is not enough.
  console.log('\n=== Rejected login (200 + "Fails.") ===')
  const appFails = boot({ sessionExists: false })
  await sleep(200)

  appFails.state.loginStatus = 200
  appFails.state.loginBody = 'Fails.'
  appFails.navigations.length = 0
  submit(appFails, 'admin', 'wrong')
  await sleep(250)

  check(
    'treats 200 + "Fails." as a rejected login',
    appFails.navigations.length === 0,
    appFails.navigations[0] ?? 'no navigation (correct)',
  )
  check(
    'shows a credentials error for "Fails."',
    /invalid|用户名/i.test(appFails.doc.getElementById('error')?.textContent ?? ''),
    appFails.doc.getElementById('error')?.textContent ?? '',
  )

  // ---- Existing session --------------------------------------------------
  console.log('\n=== Existing session (cookie already valid) ===')
  const authed = boot({ sessionExists: true })
  await sleep(250)

  check(
    'redirects straight to the app when a session exists',
    authed.navigations.length > 0,
    authed.navigations[0] ?? 'no navigation',
  )

  const failed = results.filter((r) => !r.ok)
  console.log('')
  console.log(
    failed.length === 0
      ? `RESULT: all ${results.length} checks passed`
      : `RESULT: ${failed.length} of ${results.length} checks FAILED`,
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('harness error:', err)
  process.exit(2)
})