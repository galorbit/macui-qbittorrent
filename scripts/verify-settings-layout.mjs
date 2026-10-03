/**
 * Verifies the built settings UI still uses the single-column row layout.
 *
 * WHY THIS EXISTS
 * ---------------
 * The settings page was rebuilt because a multi-column grid detached labels
 * from their controls: with labels of very different lengths, each label sat
 * visually equidistant from several controls, so a 39-item group was impossible
 * to read. That is a layout invariant a unit test cannot check — jsdom performs
 * no real layout.
 *
 * So this inspects the BUILT asset instead. It catches two failure modes:
 *
 *   - a regression back to a multi-column grid
 *   - a stale asset being deployed, which silently serves the old UI
 *
 * Run against a dist tree, e.g. a fresh checkout of the `dist` branch:
 *   pnpm verify:settings
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2] ?? 'dist'
if (!fs.existsSync(path.join(dir, 'private', 'assets'))) {
  console.error(`no built assets under ${dir}/private/assets — run pnpm build first`)
  process.exit(1)
}

const assets = path.join(dir, 'private', 'assets')
const find = (re) => fs.readdirSync(assets).filter((f) => re.test(f))

const jsFile = find(/^SettingsView-.*\.js$/)[0]
const cssFile = find(/^SettingsView-.*\.css$/)[0]

if (!jsFile || !cssFile) {
  console.error('SettingsView assets not found in', assets)
  process.exit(1)
}

const js = fs.readFileSync(path.join(assets, jsFile), 'utf8')
const css = fs.readFileSync(path.join(assets, cssFile), 'utf8')

console.log(`  JS : ${jsFile}`)
console.log(`  CSS: ${cssFile}\n`)

let bad = 0
const check = (label, ok) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) bad += 1
}

// New structure present.
check('section resolver shipped (unclaimed-fields fallback)', /other/.test(js))
check('single-column row layout shipped', /settings__rows/.test(css))
check('fixed 15rem label column shipped', /15rem/.test(css))
check('section heading styles shipped', /settings__section/.test(css))

// Old structure gone. `repeat(3` would mean the 3-column grid survived, which
// is the exact thing the redesign removed.
check('old 3-column grid removed', !/repeat\(3/.test(css))
check('old settings__grid class removed', !/settings__grid/.test(css))

// Localisation for the new headings must be in the main bundle.
const allJs = fs
  .readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => fs.readFileSync(path.join(assets, f), 'utf8'))
  .join('\n')

check('section heading strings bundled', /隐私与节点发现|Privacy and discovery/.test(allJs))

console.log(`\nRESULT: ${bad === 0 ? 'all checks passed' : `${bad} check(s) FAILED`}`)
process.exit(bad === 0 ? 0 : 1)