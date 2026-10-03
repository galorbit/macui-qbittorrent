/**
 * Regenerates the README screenshots from the built app.
 *
 * TWO BASTION BUGS THIS FIXES, BOTH OF WHICH SHIPPED A BLANK PNG TO THE README
 * ---------------------------------------------------------------------------
 * 1. mobile-dashboard.png was blank because the device metrics were switched
 *    from desktop to mobile and captured immediately, catching the responsive
 *    layout mid-transition. Fixed by setting the metrics BEFORE navigating, so
 *    each shot loads straight into its final viewport.
 *
 * 2. settings.png was blank because the mock `app/preferences` payload had FOUR
 *    fields. The view loaded, found almost nothing to render, and painted an
 *    empty page. Fixed by deriving the payload from the project's own settings
 *    schema (`gen-prefs-fixture.mjs`), so it cannot drift out of date again.
 *
 * The previous verifier passed BOTH of these, because it only asked whether the
 * page had text — and the sidebar always has text. The check below is
 * per-shot and looks for the content that shot is supposed to show.
 */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve('dist/private')
const OUT = path.resolve('docs/screenshots')
const PORT = 4186
const CDP = 9252

fs.mkdirSync(OUT, { recursive: true })

// Derived from src/config/settings-schema.ts — never hand-maintained.
const PREFS = JSON.parse(execFileSync('node', ['scripts/gen-prefs-fixture.mjs'], { encoding: 'utf8' }))

const TORRENT = (hash, name, state, over) => ({
  hash, name, size: 6111754240, progress: 0.62, dlspeed: 0, upspeed: 0, ratio: 0.21,
  state, category: 'Linux', tags: 'iso', eta: 268, num_seeds: 42, num_leechs: 3,
  save_path: '/downloads', added_on: 1759600000, completion_on: 0,
  downloaded: 1000000, uploaded: 100000, priority: 1, seq_dl: false,
  f_l_piece_prio: false, auto_tmm: false, amount_left: 1000, availability: 2, ...over,
})

const MAIN_DATA = {
  rid: 1, full_update: true,
  torrents: {
    aaa: TORRENT('aaa', 'debian-13.0.0-amd64-netinst.iso', 'uploading', {
      size: 659554304, progress: 1, upspeed: 2540000, ratio: 1.84,
      downloaded: 659554304, uploaded: 1213577919, amount_left: 0, tags: 'iso,archive',
    }),
    bbb: TORRENT('bbb', 'ubuntu-24.04.1-desktop-amd64.iso', 'downloading', {
      dlspeed: 11400000, upspeed: 820000, amount_left: 2322466611,
    }),
    ccc: TORRENT('ccc', 'archlinux-2025.10.01-x86_64.iso', 'pausedDL', {
      size: 1181315072, progress: 0, eta: 8640000, downloaded: 0, uploaded: 0, tags: '', seq_dl: true,
    }),
  },
  torrents_removed: [],
  categories: { Linux: { name: 'Linux', savePath: '/downloads/linux' } },
  categories_removed: [],
  tags: ['iso', 'archive'],
  tags_removed: [],
  server_state: {
    alltime_dl: 5999404983325, alltime_ul: 1421964756573, global_ratio: '0.23',
    connection_status: 'connected', dht_nodes: 353, dl_info_speed: 11400000,
    up_info_speed: 3370000, dl_info_data: 4294967296, up_info_data: 1073741824,
    free_space_on_disk: 4375110053888, queueing: true, refresh_interval: 1500,
    total_peer_connections: 187, last_external_address_v4: '203.0.113.7',
  },
}

const TORRENT_PROPS = {
  save_path: '/downloads', creation_date: 1759000000, piece_size: 262144, pieces_have: 2514,
  pieces_num: 2514, connections: 42, connections_limit: 500, dl_speed: 11400000,
  dl_speed_avg: 9800000, up_speed: 820000, up_speed_avg: 610000, dl_limit: 0, up_limit: 0,
  total_downloaded: 3789287629, total_downloaded_session: 3789287629,
  total_uploaded: 795000000, total_uploaded_session: 795000000, total_wasted: 1048576,
  seeds: 42, seeds_total: 118, peers: 12, peers_total: 64, share_ratio: 0.21,
  addition_date: 1759610000, completion_date: 0, created_by: 'mktorrent 1.1',
  comment: 'Ubuntu 24.04.1 LTS', eta: 268, time_elapsed: 3600, seeding_time: 0,
  nb_connections: 54, nb_connections_limit: 500, popularity: 1.2, reannounce: 120,
  total_size: 6111754240, is_private: false, has_metadata: true, progress: 0.62,
}

const TORRENT_FILES = [
  { index: 0, name: 'ubuntu-24.04.1-desktop-amd64.iso', size: 6111754240, progress: 0.62, priority: 1, is_seed: false, piece_range: [0, 2513], availability: 2.4 },
]

const TORRENT_TRACKERS = [
  { url: 'https://torrent.ubuntu.com/announce', status: 2, tier: 0, num_peers: 42, num_seeds: 118, num_leeches: 64, num_downloaded: 9821, msg: 'Working' },
  { url: 'https://ipv6.torrent.ubuntu.com/announce', status: 2, tier: 1, num_peers: 8, num_seeds: 30, num_leeches: 12, num_downloaded: 4100, msg: 'Working' },
]

const TORRENT_PEERS = {
  peers: {
    '203.0.113.21:51413': { ip: '203.0.113.21', port: 51413, client: 'qBittorrent 5.2.2', progress: 0.61, dl_speed: 520000, up_speed: 0, flags: 'D X', country: 'Netherlands', connection: 'BT' },
    '198.51.100.44:6881': { ip: '198.51.100.44', port: 6881, client: 'libtorrent 2.0', progress: 1, dl_speed: 0, up_speed: 240000, flags: 'U X', country: 'Germany', connection: 'BT' },
  },
}

const RSS_ITEMS = {
  'Linux distributions': {
    uid: '{1111}', url: 'https://example.com/linux.xml', refreshInterval: 600,
    title: 'Linux distributions', lastBuildDate: 'Mon, 06 Oct 2025 12:00:00 +0000',
    isLoading: false, hasError: false,
    articles: [
      { id: 'l1', title: 'Ubuntu 24.04.1 LTS Desktop amd64', date: 'Mon, 06 Oct 2025 12:00:00 +0000', link: 'https://example.com/ubuntu', torrentURL: 'magnet:?xt=urn:btih:aaaa', author: 'releases', isRead: false },
      { id: 'l2', title: 'Debian 13.0.0 netinst amd64', date: 'Sun, 05 Oct 2025 09:30:00 +0000', link: 'https://example.com/debian', torrentURL: 'magnet:?xt=urn:btih:bbbb', isRead: false },
    ],
  },
  Projects: {
    Documentation: { uid: '{2222}', url: 'https://example.com/docs.xml', refreshInterval: 900, title: 'Documentation', isLoading: false, hasError: true, articles: [{ id: 'd1', title: 'Kubernetes v1.32 release notes', date: 'Mon, 06 Oct 2025 08:00:00 +0000', link: 'https://example.com/k8s', isRead: false }] },
    Blender: { uid: '{3333}', url: 'https://example.com/blender.xml', refreshInterval: 300, title: 'Blender', isLoading: false, hasError: false, articles: [{ id: 'a1', title: 'Blender 4.3 release candidate', date: 'Mon, 06 Oct 2025 03:00:00 +0000', link: 'https://example.com/blender', torrentURL: 'magnet:?xt=urn:btih:cccc', isRead: true }] },
  },
}

const RSS_RULES = {
  'Debian ISOs': { enabled: true, mustContain: 'debian.*netinst', useRegex: true, assignedCategory: 'Linux', savePath: '/downloads/linux' },
  'Ubuntu LTS only': { enabled: false, mustContain: 'ubuntu.*LTS', assignedCategory: 'Linux' },
}

const SEARCH_PLUGINS = [
  { name: 'thepiratebay', version: '2.14', fullName: 'The Pirate Bay', url: 'https://thepiratebay.org', supportedCategories: [{ id: 'all', name: 'All categories' }, { id: 'software', name: 'Software' }], enabled: true },
  { name: '1337x', version: '1.5', fullName: '1337x', url: 'https://1337x.to', supportedCategories: [{ id: 'all', name: 'All categories' }, { id: 'software', name: 'Software' }], enabled: true },
]

const SEARCH_RESULTS = Array.from({ length: 6 }, (_, i) => ({
  fileName: `ubuntu-24.04.1-desktop-amd64-${i + 1}.iso`,
  fileUrl: `magnet:?xt=urn:btih:result${i}`,
  fileSize: 6111754240 + i * 12000000,
  nbSeeders: 120 - i * 17, nbLeechers: 40 - i * 5,
  engineName: i % 2 === 0 ? 'thepiratebay' : '1337x',
  siteUrl: 'https://example.com', descrLink: 'https://example.com/details',
  pubDate: Math.floor(Date.now() / 1000) - i * 86400,
}))

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.png': 'image/png', '.svg': 'image/svg+xml',
}

const server = createServer((req, res) => {
  const p = new URL(req.url, `http://localhost:${PORT}`).pathname
  const json = (b) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)) }
  const text = (b) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(b) }

  if (p.startsWith('/api/v2/')) {
    if (p.endsWith('auth/login')) return text('Ok.')
    if (p.endsWith('app/version')) return text('v5.2.2')
    if (p.endsWith('app/preferences')) return json(PREFS)
    if (p.endsWith('app/defaultSavePath')) return text('/downloads')
    if (p.endsWith('app/buildInfo')) return json({ qt: '6.8.0', libtorrent: '2.0.10', boost: '1.85', openssl: '3.3.0', bitness: 64 })
    if (p.endsWith('sync/maindata')) return json(MAIN_DATA)
    if (p.endsWith('transfer/info')) return json({ dl_info_speed: 11400000, dl_info_data: 4294967296, up_info_speed: 3370000, up_info_data: 1073741824, dl_rate_limit: 0, up_rate_limit: 0, dht_nodes: 353, connection_status: 'connected' })
    if (p.endsWith('torrents/properties')) return json(TORRENT_PROPS)
    if (p.endsWith('torrents/files')) return json(TORRENT_FILES)
    if (p.endsWith('torrents/trackers')) return json(TORRENT_TRACKERS)
    if (p.endsWith('sync/torrentPeers')) return json(TORRENT_PEERS)
    if (p.endsWith('rss/items')) return json(RSS_ITEMS)
    if (p.endsWith('rss/rules')) return json(RSS_RULES)
    if (p.includes('rss/')) return text('')
    if (p.endsWith('search/plugins')) return json(SEARCH_PLUGINS)
    if (p.endsWith('search/status')) return json([{ id: 1, status: 'Stopped', total: 6 }])
    if (p.endsWith('search/results')) return json({ status: 'Stopped', results: SEARCH_RESULTS, total: 6 })
    if (p.includes('search/')) return json({ id: 1 })
    return json({})
  }
  let file = path.join(ROOT, p === '/' ? 'index.html' : p)
  if (!file.startsWith(ROOT)) return void res.writeHead(403).end()
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' })
  res.end(fs.readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'macui-docs-'))
const browser = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wsUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch { /* retry */ }
    await sleep(250)
  }
  throw new Error('devtools never came up')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () => resolve({
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          const msgId = ++id
          pending.set(msgId, { res, rej })
          ws.send(JSON.stringify({ id: msgId, method, params, sessionId }))
        })
      },
      close: () => ws.close(),
    }))
    ws.addEventListener('error', reject)
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id)
        pending.delete(m.id)
        if (m.error) rej(new Error(m.error.message))
        else res(m.result)
      }
    })
  })
}

/*
 * Each shot declares what it MUST contain. `expect` is evaluated in the page and
 * must return true; this is what the old verifier lacked, and why it happily
 * accepted a settings page with no settings on it.
 *
 * The selectors below were DISCOVERED by dumping the real class names from a
 * live render (`_discover-selectors.mjs`) rather than guessed. Guessing is how
 * the first version of this check produced four false failures — it asserted on
 * `.settings__section`, which does not exist; the settings view renders
 * `.settings__tab` plus `.sf` rows.
 *
 * Scoping to <main> matters: the sidebar and tab bar are always present, so a
 * document-wide text check passes even on a blank page.
 */
const SHOTS = [
  { name: 'dashboard', hash: '/', width: 1440, height: 900,
    expect: 'document.querySelectorAll("main .ttable__cell").length >= 20 && document.querySelectorAll("main .mac-card").length >= 4' },
  { name: 'torrent-detail', hash: '/torrent/bbb', width: 1440, height: 900,
    expect: 'document.querySelector("main").innerText.includes("ubuntu-24.04.1") && document.querySelector("main").innerText.length > 200' },
  { name: 'search', hash: '/search?q=ubuntu', width: 1440, height: 820,
    expect: 'document.querySelectorAll("main .search__row").length >= 3' },
  { name: 'rss', hash: '/rss', width: 1440, height: 900,
    expect: 'document.querySelectorAll("main .rss__article").length >= 2 && document.querySelectorAll("main .rss__node").length >= 3' },
  { name: 'settings', hash: '/settings', width: 1440, height: 900,
    expect: 'document.querySelectorAll("main .settings__tab").length >= 6 && document.querySelectorAll("main .sf").length >= 3' },
  { name: 'mobile-dashboard', hash: '/', width: 430, height: 1000, mobile: true,
    expect: 'document.querySelectorAll("main .torrent-card").length >= 2 && document.querySelectorAll(".layout__tab").length >= 3' },
  { name: 'mobile-torrents', hash: '/', width: 430, height: 1000, mobile: true,
    expect: 'document.querySelectorAll("main .torrent-card").length >= 2' },
]

let failures = 0
const written = []

/**
 * Optional filter: `node _shots3.mjs settings` runs just that shot.
 * Re-running one page is the fast loop when a single capture misbehaves.
 */
const only = process.argv[2]
const selected = only ? SHOTS.filter((s) => s.name === only) : SHOTS
if (only && selected.length === 0) {
  console.error(`no shot named "${only}"; known: ${SHOTS.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

try {
  const cdp = await connect(await wsUrl())
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)

  for (const shot of selected) {
    // Metrics FIRST, then a FULL reload — fixes #1.
    //
    // `Page.navigate` alone is not enough here. The app is a hash-router SPA,
    // so navigating from `#/rss` to `#/settings` does not reload the document
    // and does not re-run the viewport-dependent setup; combined with a
    // viewport change the capture could catch a stale frame. Each shot must
    // start from a clean document at its own size.
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width, height: shot.height, deviceScaleFactor: 2, mobile: Boolean(shot.mobile),
    }, sessionId)
    await cdp.send('Page.navigate', { url: 'about:blank' }, sessionId)
    await sleep(300)
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html#${shot.hash}` }, sessionId)

    /*
     * Poll until the expected content is actually present, rather than sleeping
     * a fixed amount and hoping. A fixed wait is what produced the original
     * blank captures: it is a race, and the loser writes an empty PNG.
     *
     * 12 attempts x 500 ms = 6 s ceiling, which is generous for a local static
     * page but still fails loudly instead of capturing nothing.
     */
    let v = null
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(500)
      const probe = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const main = document.querySelector('main')
          const text = (main ?? document.body).innerText.trim()
          let met = false
          try { met = Boolean(${shot.expect}) } catch (e) { met = 'ERR: ' + e.message }
          return { met, textLen: text.length, sample: text.slice(0, 44).replace(/\\s+/g, ' ') }
        })()`,
        returnByValue: true,
      }, sessionId)
      v = probe.result.value
      if (v.met === true) break
    }

    if (v.met !== true) {
      failures += 1
      console.log(`  FAIL  ${shot.name} — expected content missing after 6s (${JSON.stringify(v.met)})`)
      console.log(`        page text: "${v.sample}"`)
      continue
    }

    // Give the compositor a frame so the paint matches the DOM we just checked.
    await sleep(400)

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    const buf = Buffer.from(data, 'base64')
    fs.writeFileSync(path.join(OUT, `${shot.name}.png`), buf)
    written.push(shot.name)
    console.log(`  ok    ${shot.name.padEnd(18)} ${shot.width}x${shot.height}  ${String(Math.round(buf.length / 1024)).padStart(4)} KB  "${v.sample}"`)
  }

  cdp.close()
} finally {
  browser.kill()
  await sleep(400)
  fs.rmSync(profile, { recursive: true, force: true })
  server.close()
}

/*
 * Finish with the independent pixel check.
 *
 * The per-shot `expect` above runs in the PAGE and proves the DOM was correct.
 * This second pass decodes the PNGs that were actually written and proves the
 * FILES are not blank — the failure mode that shipped twice. It is deliberately
 * separate code, so it is a real check rather than a restatement of the first.
 */
if (failures === 0) {
  console.log('\nVerifying the written files are not blank…')
  try {
    execFileSync('node', ['scripts/verify-docs-shots.mjs', 'docs/screenshots'], {
      stdio: 'inherit',
    })
  } catch {
    failures += 1
  }
}

console.log(failures === 0 ? `\nRESULT: ${written.length} screenshots rendered and content-verified` : `\nRESULT: ${failures} screenshot(s) failed the content check`)
process.exit(failures === 0 ? 0 : 1)
