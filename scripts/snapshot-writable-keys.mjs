/**
 * Snapshot the set of preference keys that `setPreferences` acts on, and write
 * it to src/config/writable-keys.json.
 *
 * Snapshotting matters because the C++ source is not part of this repository.
 * With the list committed, a unit test can verify offline that every setting we
 * expose is actually writable — catching the "this option does nothing" bug
 * class without needing network access or the qBittorrent sources.
 *
 * Regenerate after a qBittorrent upgrade:
 *   curl -o /tmp/appcontroller.cpp https://raw.githubusercontent.com/qbittorrent/qBittorrent/release-X.Y.Z/src/webui/api/appcontroller.cpp
 *   node scripts/snapshot-writable-keys.mjs /tmp/appcontroller.cpp
 */
import fs from 'node:fs'

const sourcePath = process.argv[2] ?? `${process.env.TEMP}/appcontroller.cpp`
if (!fs.existsSync(sourcePath)) {
  console.error(`Cannot find ${sourcePath}.`)
  console.error('Usage: node scripts/snapshot-writable-keys.mjs <appcontroller.cpp>')
  process.exit(2)
}

const src = fs.readFileSync(sourcePath, 'utf8')

const iWrite = src.indexOf('void AppController::setPreferencesAction()')
const iEnd = src.indexOf('void AppController::defaultSavePathAction()')
if (iWrite < 0 || iEnd < 0) {
  console.error('Could not locate setPreferencesAction().')
  process.exit(2)
}
const writeBlock = src.slice(iWrite, iEnd)

// The server consults the incoming hash through several forms: a hasKey()
// lambda, m.contains(), and direct m[...] indexing for co-dependent values.
const keys = [
  ...new Set([
    ...[...writeBlock.matchAll(/hasKey\(u"([^"]+)"_s\)/g)].map((m) => m[1]),
    ...[...writeBlock.matchAll(/m\.contains\(u"([^"]+)"_s\)/g)].map((m) => m[1]),
    ...[...writeBlock.matchAll(/m\[u"([^"]+)"_s\]/g)].map((m) => m[1]),
  ]),
].sort()

// Try to infer the version from the file path for provenance.
const versionMatch = /release-([\d.]+)/.exec(sourcePath)
const version = versionMatch ? versionMatch[1] : process.env.QBT_VERSION ?? '5.1.4'

const out = {
  source: `qbittorrent/qBittorrent release-${version} src/webui/api/appcontroller.cpp`,
  note:
    'Keys that setPreferencesAction() acts on. A setting not in this list is a ' +
    'silent no-op. Regenerate with scripts/snapshot-writable-keys.mjs after a ' +
    'qBittorrent upgrade.',
  keys,
}

fs.writeFileSync('src/config/writable-keys.json', `${JSON.stringify(out, null, 2)}\n`)
console.log(`Wrote ${keys.length} writable keys to src/config/writable-keys.json`)