/**
 * Reads the field keys declared by the settings schema.
 *
 * Why a union of two patterns
 * ---------------------------
 * Schema entries appear in two shapes:
 *
 *     { key: 'dht', kind: 'boolean' },          <- all on one line
 *     {
 *       key: 'encryption',                       <- key on its own line
 *       kind: 'select',
 *       options: [...],
 *     },
 *
 * Neither pattern alone finds everything: an anchored `^\s*key:` matches only
 * the multi-line form, and `\{ key:` only the single-line form. Using just one
 * of them previously made ~28 enum fields invisible, which caused their labels
 * to be deleted as "stale" and the audit to report nothing missing.
 *
 * Scoping is by line range — from the `groups` literal to the `allFields`
 * export — so interface members and comments are excluded.
 */
import fs from 'node:fs'

export function readSchemaKeys(schemaPath = 'src/config/settings-schema.ts') {
  const src = fs.readFileSync(schemaPath, 'utf8')

  const start = src.indexOf('export const groups: SettingGroup[] = [')
  if (start < 0) throw new Error('Could not find the `groups` definition')

  const end = src.indexOf('export const allFields', start)
  if (end < 0) throw new Error('Could not find the end of the `groups` definition')

  const body = src.slice(start, end)

  // Both entry shapes, unioned.
  const multiline = [...body.matchAll(/^\s*key:\s*'([^']+)'/gm)].map((m) => m[1])
  const singleline = [...body.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1])

  return [...new Set([...multiline, ...singleline])].sort()
}

// Allow direct execution for inspection.
if (process.argv[1]?.endsWith('read-schema-keys.mjs')) {
  const keys = readSchemaKeys()
  console.log(`${keys.length} schema keys`)
  for (const k of keys) console.log(`  ${k}`)
}