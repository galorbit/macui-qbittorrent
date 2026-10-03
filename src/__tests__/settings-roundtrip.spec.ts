/**
 * Settings round-trip and dirty-detection tests.
 *
 * These guard a bug class that is easy to reintroduce and hard to notice: if
 * `toApi(fromApi(raw)) !== raw` for any field, the settings page reports
 * unsaved changes the instant it loads, with nothing touched. That shipped once
 * (28 phantom changes) and destroys trust in the whole page.
 *
 * The server's actual output format matters here, and is frequently
 * counter-intuitive:
 *   - list-valued keys arrive as NEWLINE-JOINED STRINGS (`.join('\n')`), not
 *     arrays
 *   - numeric enum selects arrive as NUMBERS, not strings
 *   - byte limits arrive in bytes, and some are as small as 10240 (10 KiB)
 */
import { describe, expect, it } from 'vitest'
import { allFields, fromApi, groups, toApi, type SettingField } from '@/config/settings-schema'
import { sectionLayout, sectionsForGroup } from '@/config/settings-sections'
import writableKeys from '@/config/writable-keys.json'
import en from '@/i18n/locales/en'
import zhCN from '@/i18n/locales/zh-CN'

/** The `settings` subtree, where schema labels live. */
const enBundle = (en as Record<string, unknown>).settings
const zhBundle = (zhCN as Record<string, unknown>).settings

/**
 * Look up a label inside the `settings` subtree.
 *
 * Keys in the schema are written as `settings.field.<key>`, but the bundles
 * passed in are already narrowed to the `settings` node — so the leading
 * `settings.` segment must be stripped or every lookup misses.
 */
function labelIn(bundle: unknown, schemaKey: string): unknown {
  const path = schemaKey.replace(/^settings\./, '')
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, bundle)
}

/** A raw value shaped the way the server really sends it. */
function serverValueFor(field: SettingField): unknown {
  switch (field.kind) {
    case 'boolean':
      return true
    case 'select':
      // Numeric enums come back as numbers.
      return field.options?.[0]?.value ?? ''
    case 'multiline':
      // `.join('\n')` — a string, never an array.
      return 'alpha\nbeta'
    case 'integer':
    case 'float':
      if (field.unit === 'bytesPerSec') return 524288 // 512 KiB/s
      // Deliberately small: exposes unit granularity that would round to zero.
      if (field.unit === 'bytes') return 10240
      if (field.unit === 'minutes') return 30
      if (field.unit === 'seconds') return 3600
      return 510
    default:
      return '/some/path'
  }
}

/**
 * An exhaustive round-trip check for byte-unit fields.
 *
 * The older test used a single convenient value (524288 B/s = exactly 512 KiB),
 * which divides evenly and therefore passed. Real servers hold arbitrary byte
 * counts: the slow-torrent thresholds defaulted to 10 B/s, which a
 * divide-by-1024 conversion rounded to 0 — so the field showed as changed on
 * load AND saved 0 back over the real value.
 *
 * Any non-reversible value is a bug, so this sweeps a wide range rather than
 * sampling convenient points.
 */
function nonReversible(field: SettingField, values: number[]): number[] {
  return values.filter((raw) => toApi(field, fromApi(field, raw)) !== raw)
}

describe('settings round-trip', () => {
  it('returns each field unchanged after fromApi -> toApi', () => {
    const broken: string[] = []

    for (const field of allFields) {
      const raw = serverValueFor(field)
      const back = toApi(field, fromApi(field, raw))
      if (JSON.stringify(back) !== JSON.stringify(raw)) {
        broken.push(
          `${field.key}: ${JSON.stringify(raw)} -> ${JSON.stringify(fromApi(field, raw))} -> ${JSON.stringify(back)}`,
        )
      }
    }

    expect(broken).toEqual([])
  })

  it('preserves numeric enum selects as numbers, not strings', () => {
    const enums = allFields.filter(
      (f) => f.kind === 'select' && f.options?.every((o) => typeof o.value === 'number'),
    )
    expect(enums.length).toBeGreaterThan(0)

    for (const field of enums) {
      const raw = field.options![1]?.value ?? field.options![0].value
      const back = toApi(field, fromApi(field, raw))
      expect(typeof back, `${field.key} lost its numeric type`).toBe('number')
      expect(back).toBe(raw)
    }
  })

  it('preserves string enum selects as strings', () => {
    const enums = allFields.filter(
      (f) => f.kind === 'select' && f.options?.every((o) => typeof o.value === 'string'),
    )
    expect(enums.length).toBeGreaterThan(0)

    for (const field of enums) {
      const raw = field.options![0].value
      expect(toApi(field, fromApi(field, raw))).toBe(raw)
    }
  })

  it('keeps small byte values instead of rounding them to zero', () => {
    // send_buffer_low_watermark-style values are ~10 KiB; MiB granularity would
    // destroy them.
    const byteFields = allFields.filter((f) => f.unit === 'bytes')
    expect(byteFields.length).toBeGreaterThan(0)

    for (const field of byteFields) {
      const raw = 10240
      const shown = fromApi(field, raw) as number
      expect(shown, `${field.key} collapsed 10240 bytes to 0`).toBeGreaterThan(0)
      expect(toApi(field, shown)).toBe(raw)
    }
  })

  /**
   * Regression guard for the "2 changes pending" report.
   *
   * The byte-unit fields are stored in BYTES and scaled only for display. An
   * earlier version converted in fromApi/toApi, which is lossy: the slow-torrent
   * rate thresholds defaulted to 10 B/s, became Math.round(10/1024) = 0, showed
   * as changed immediately, and saved 0 back over the real value.
   *
   * Sweeping a range is the point — the previous test used 524288, which divides
   * evenly by 1024 and so passed while the bug was live.
   */
  it('round-trips EVERY byte value, not just round numbers', () => {
    const byteFields = allFields.filter(
      (f) => f.unit === 'bytes' || f.unit === 'bytesPerSec',
    )
    expect(byteFields.length).toBeGreaterThan(0)

    // Small values matter most: they are what a divide-by-1024 rounds away.
    const values = [
      0, 1, 2, 3, 7, 10, 100, 511, 512, 513, 1000, 1023, 1024, 1025,
      2048, 10240, 65536, 100000, 1048576, 1234567, 104857600,
    ]

    const broken: string[] = []
    for (const field of byteFields) {
      for (const raw of nonReversible(field, values)) {
        broken.push(
          `${field.key}: ${raw} -> ${JSON.stringify(fromApi(field, raw))} -> ${JSON.stringify(toApi(field, fromApi(field, raw)))}`,
        )
      }
    }

    expect(broken).toEqual([])
  })

  it('sweeps every byte value from 0 to 2048 exhaustively', () => {
    // Cheap to run and covers the whole rounding-danger zone, so a future unit
    // change cannot quietly reintroduce the loss.
    const byteFields = allFields.filter(
      (f) => f.unit === 'bytes' || f.unit === 'bytesPerSec',
    )

    const range = Array.from({ length: 2049 }, (_, i) => i)

    for (const field of byteFields) {
      const bad = nonReversible(field, range)
      expect(bad, `${field.key} is not reversible for ${bad.length} value(s)`).toEqual([])
    }
  })

  it('accepts list values as either a string or an array', () => {
    const field = allFields.find((f) => f.kind === 'multiline')
    expect(field).toBeDefined()

    // Both shapes must normalise identically, so a server change cannot produce
    // phantom dirty state.
    expect(fromApi(field!, 'a\nb')).toBe('a\nb')
    expect(fromApi(field!, ['a', 'b'])).toBe('a\nb')

    // And the write format matches what the server sends back.
    expect(toApi(field!, 'a\nb')).toBe('a\nb')
  })

  it('sends an empty string (not an empty array) when a list is cleared', () => {
    const field = allFields.find((f) => f.kind === 'multiline')!
    expect(toApi(field, '')).toBe('')
    expect(toApi(field, '   ')).toBe('')
  })

  it('never emits NaN for numeric fields', () => {
    for (const field of allFields) {
      if (field.kind !== 'integer' && field.kind !== 'float') continue
      for (const input of [undefined, null, '', 'abc', NaN]) {
        const out = toApi(field, input)
        expect(Number.isFinite(Number(out)), `${field.key} produced ${out}`).toBe(true)
      }
    }
  })

  it('falls back to a usable default when the server omits a value', () => {
    for (const field of allFields) {
      const shown = fromApi(field, undefined)
      // Must never be undefined — that would render an uncontrolled input.
      expect(shown, `${field.key} produced undefined`).not.toBeUndefined()
      expect(shown, `${field.key} produced null`).not.toBeNull()

      if (field.kind === 'boolean') {
        expect(shown).toBe(false)
      } else if (field.kind === 'integer' || field.kind === 'float') {
        expect(shown).toBe(0)
      } else if (field.kind === 'select') {
        // A select falls back to its first option, whose type may be either
        // numeric (an enum index) or string (an enum name).
        const first = field.options?.[0]?.value
        expect(shown).toBe(first)
      } else if (field.kind === 'multiline' || field.kind === 'string' || field.kind === 'path') {
        expect(typeof shown).toBe('string')
      }
    }
  })
})

describe('settings schema integrity', () => {
  /**
   * The most important check in this file.
   *
   * `src/config/writable-keys.json` is a snapshot of every key
   * `setPreferencesAction()` acts on in qBittorrent (see
   * scripts/snapshot-writable-keys.mjs). A field absent from it renders, saves
   * without error, and changes nothing — which users correctly report as "this
   * option doesn't work".
   *
   * Checked offline, against the committed snapshot, so it runs in CI without
   * the qBittorrent sources.
   */
  it('exposes only keys the server can actually write', () => {
    const writable = new Set(writableKeys.keys)
    const notWritable = allFields.filter((f) => !writable.has(f.key)).map((f) => f.key)
    expect(notWritable).toEqual([])
  })

  it('snapshot is plausible (guards against an empty/truncated file)', () => {
    expect(writableKeys.keys.length).toBeGreaterThan(150)
    expect(writableKeys.source).toMatch(/appcontroller\.cpp/)
  })

  it('gives every schema field a label in both locales', () => {
    // Resolve by dotted path so the check works at any nesting depth.
        const missingEn: string[] = []
    const missingZh: string[] = []

    for (const field of allFields) {
      const key = `settings.field.${field.key}`
      if (typeof labelIn(enBundle, key) !== 'string') missingEn.push(key)
      if (typeof labelIn(zhBundle, key) !== 'string') missingZh.push(key)
    }

    expect(missingEn).toEqual([])
    expect(missingZh).toEqual([])
  })

  it('has no untranslated English placeholders in zh-CN', () => {
    // When a field is added, the sync script inserts an English placeholder
    // into zh-CN. This test fails until it is actually translated, rather than
    // letting English leak into the Chinese UI.
        // Multi-word labels that legitimately read the same in both languages.
    const shared = new Set([
      'DHT',
      'HTTP',
      'SOCKS4',
      'SOCKS5',
      'BitTorrent',
      'RSS',
      'WebUI',
      'RSS 刷新间隔',
    ])

    const untranslated: string[] = []
    for (const field of allFields) {
      const key = `settings.field.${field.key}`
      const enText = labelIn(enBundle, key)
      const zhText = labelIn(zhBundle, key)
      if (enText === zhText && !shared.has(String(enText))) {
        untranslated.push(`${key}: "${enText}"`)
      }
    }

    expect(untranslated).toEqual([])
  })

  it('places every field in exactly one section', () => {
    // The settings UI groups fields into titled sections. `groups[].fields`
    // stays authoritative for loading and saving, and the layout only names
    // keys — so a field added to the schema but not to the layout is easy to
    // miss.
    //
    // It would NOT vanish (the resolver puts unclaimed fields into "Other"),
    // but "Other" is a symptom of forgetting rather than a destination. This
    // asserts the layout is complete, keeping that section empty in practice.
    const problems: string[] = []

    for (const group of groups) {
      const rendered = sectionsForGroup(group, sectionLayout)
      const seen = new Map<string, string>()

      for (const section of rendered) {
        for (const field of section.fields) {
          if (seen.has(field.key)) {
            problems.push(`${field.key} appears in both ${seen.get(field.key)} and ${section.id}`)
          }
          seen.set(field.key, section.id)
        }
      }

      for (const field of group.fields) {
        if (!seen.has(field.key)) problems.push(`${field.key} is in no section of ${group.id}`)
      }

      const other = rendered.find((s) => s.id === 'other')
      if (other) {
        problems.push(
          `${group.id}: ${other.fields.length} unclaimed field(s) — ` +
            other.fields.map((f) => f.key).join(', '),
        )
      }
    }

    expect(problems).toEqual([])
  })

  it('resolves sections covering exactly the group fields', () => {
    // Nothing added, nothing lost: the union of all sections must be the
    // group's own field list.
    for (const group of groups) {
      const rendered = sectionsForGroup(group, sectionLayout)
      const flat = rendered.flatMap((s) => s.fields.map((f) => f.key))

      expect(new Set(flat), `${group.id} section coverage`).toEqual(
        new Set(group.fields.map((f) => f.key)),
      )
      expect(flat.length, `${group.id} has duplicates across sections`).toBe(group.fields.length)
    }
  })

  it('ignores layout keys that no longer exist in the schema', () => {
    // Removing a setting must not break rendering, and a stale layout entry
    // must not resurrect it.
    const group = groups[0]
    const stale = {
      [group.id]: [
        { id: 'stale', labelKey: 'settings.section.other', keys: ['no_such_field_at_all'] },
      ],
    }

    const rendered = sectionsForGroup(group, stale)
    const keys = rendered.flatMap((s) => s.fields.map((f) => f.key))

    expect(keys).not.toContain('no_such_field_at_all')
    expect(keys.length).toBe(group.fields.length)
  })

  it('gives every section a label in both locales', () => {
    const labelKeys = new Set<string>(['settings.section.other'])
    for (const sections of Object.values(sectionLayout)) {
      for (const section of sections) {
        labelKeys.add(section.labelKey)
        if (section.hintKey) labelKeys.add(section.hintKey)
      }
    }

    const missingEn: string[] = []
    const missingZh: string[] = []

    for (const key of labelKeys) {
      if (typeof labelIn(enBundle, key) !== 'string') missingEn.push(key)
      if (typeof labelIn(zhBundle, key) !== 'string') missingZh.push(key)
    }

    expect(missingEn).toEqual([])
    expect(missingZh).toEqual([])
  })

  it('declares each key only once', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const field of allFields) {
      if (seen.has(field.key)) duplicates.push(field.key)
      seen.add(field.key)
    }
    expect(duplicates).toEqual([])
  })

  it('groups every field under exactly one group', () => {
    const grouped = groups.flatMap((g) => g.fields.map((f) => f.key))
    expect(grouped.length).toBe(allFields.length)
    expect(new Set(grouped).size).toBe(allFields.length)
  })

  it('references only fields that exist in enabledBy', () => {
    const keys = new Set(allFields.map((f) => f.key))
    const dangling: string[] = []
    for (const field of allFields) {
      if (field.enabledBy && !keys.has(field.enabledBy)) {
        dangling.push(`${field.key} -> ${field.enabledBy}`)
      }
    }
    expect(dangling).toEqual([])
  })

  it('gives every select a non-empty option list', () => {
    for (const field of allFields) {
      if (field.kind === 'select') {
        expect(field.options?.length, `${field.key} has no options`).toBeGreaterThan(0)
      } else {
        expect(field.options, `${field.key} is not a select but has options`).toBeUndefined()
      }
    }
  })

  it('does not expose settings that only affect the desktop GUI', () => {
    // These save fine but change nothing observable in a WebUI-only
    // deployment, which reads as "the option is broken".
    const guiOnly = [
      'performance_warning',
      'status_bar_external_ip',
      'file_log_enabled',
      'file_log_path',
      'file_log_backup_enabled',
      'file_log_max_size',
      'file_log_delete_old',
      'file_log_age',
      'file_log_age_type',
    ]
    const keys = new Set(allFields.map((f) => f.key))
    for (const key of guiOnly) {
      expect(keys.has(key), `${key} only affects the desktop GUI`).toBe(false)
    }
  })

  it('does not expose settings that can lock the user out mid-session', () => {
    // Changing these disconnects the very session making the change, and
    // recovery needs shell access to the container.
    const lockoutRisk = [
      'web_ui_port',
      'web_ui_address',
      'use_https',
      'web_ui_https_cert_path',
      'web_ui_https_key_path',
      'web_ui_host_header_validation_enabled',
      'current_network_interface',
      'current_interface_address',
    ]
    const keys = new Set(allFields.map((f) => f.key))
    for (const key of lockoutRisk) {
      expect(keys.has(key), `${key} risks locking the user out`).toBe(false)
    }
  })
})