/**
 * Locale resolution tests.
 *
 * Two things matter here and are easy to get wrong:
 *   1. Browser language tags are messy ("zh", "zh-Hans", "zh-Hans-CN",
 *      "zh-SG") and all of them should land on the Simplified Chinese bundle.
 *   2. An explicit user choice must always beat browser detection, and must
 *      survive a reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SUPPORTED_LOCALES,
  clearLocale,
  currentLocale,
  detectLocale,
  hasExplicitLocale,
  i18n,
  messages,
  normaliseLocale,
  setLocale,
} from '@/i18n'
import en from '@/i18n/locales/en'
import zhCN from '@/i18n/locales/zh-CN'

/** Replace navigator.languages / navigator.language for a test. */
function stubLanguages(languages: string[], language?: string) {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    get: () => languages,
  })
  Object.defineProperty(navigator, 'language', {
    configurable: true,
    get: () => language ?? languages[0] ?? '',
  })
}

describe('normaliseLocale', () => {
  it('maps every Chinese variant onto the Simplified bundle', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG', 'ZH-cn']) {
      expect(normaliseLocale(tag)).toBe('zh-CN')
    }
  })

  it('maps English variants onto the English bundle', () => {
    for (const tag of ['en', 'en-US', 'en-GB', 'EN']) {
      expect(normaliseLocale(tag)).toBe('en')
    }
  })

  it('returns null for languages we do not ship', () => {
    for (const tag of ['fr', 'de', 'ja', 'ko', 'ru']) {
      expect(normaliseLocale(tag)).toBeNull()
    }
  })

  it('tolerates empty and missing input', () => {
    expect(normaliseLocale('')).toBeNull()
    expect(normaliseLocale(undefined)).toBeNull()
    expect(normaliseLocale(null)).toBeNull()
  })
})

describe('detectLocale', () => {
  const originalLanguages = navigator.languages
  const originalLanguage = navigator.language

  afterEach(() => {
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => originalLanguages,
    })
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get: () => originalLanguage,
    })
  })

  it('detects Chinese from a Chinese browser', () => {
    stubLanguages(['zh-CN', 'zh', 'en-US'])
    expect(detectLocale()).toBe('zh-CN')
  })

  it('detects English from an English browser', () => {
    stubLanguages(['en-US', 'en'])
    expect(detectLocale()).toBe('en')
  })

  it('honours preference order, picking the first supported language', () => {
    // French first (unsupported), then Chinese — Chinese must win.
    stubLanguages(['fr-FR', 'zh-CN', 'en-US'])
    expect(detectLocale()).toBe('zh-CN')
  })

  it('falls back to navigator.language when languages is empty', () => {
    stubLanguages([], 'zh-TW')
    expect(detectLocale()).toBe('zh-CN')
  })

  it('returns null when nothing matches', () => {
    stubLanguages(['fr-FR', 'de-DE'])
    expect(detectLocale()).toBeNull()
  })
})

describe('explicit locale selection', () => {
  beforeEach(() => {
    localStorage.clear()
    // NOTE: do NOT use setLocale() to establish the baseline — it persists the
    // choice by design. Set the active locale directly instead.
    i18n.global.locale.value = 'en'
    document.documentElement.lang = 'en'
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists the choice and reports it as explicit', () => {
    expect(hasExplicitLocale()).toBe(false)

    setLocale('zh-CN')
    expect(currentLocale()).toBe('zh-CN')
    expect(hasExplicitLocale()).toBe(true)
    expect(localStorage.getItem('macui.locale')).toBe('zh-CN')
  })

  it('switches the active translation', () => {
    setLocale('zh-CN')
    expect(i18n.global.t('nav.transfers')).toBe('传输')

    i18n.global.locale.value = 'en'
    expect(i18n.global.t('nav.transfers')).toBe('Transfers')
  })

  it('keeps <html lang> in sync, which drives CJK font fallback', () => {
    setLocale('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')

    setLocale('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('clearLocale reverts to browser detection', () => {
    setLocale('zh-CN')
    clearLocale()
    expect(hasExplicitLocale()).toBe(false)
  })
})

describe('translation completeness', () => {
  /**
   * A missing key would silently fall back to English, which is exactly the
   * bug class this suite exists to prevent. Compare the key trees instead.
   */
  function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
    const out: string[] = []
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out.push(...keyPaths(value as Record<string, unknown>, path))
      } else {
        out.push(path)
      }
    }
    return out.sort()
  }

  it('zh-CN defines every key that en defines', () => {
    const enKeys = keyPaths(en as unknown as Record<string, unknown>)
    const zhKeys = new Set(keyPaths(zhCN as unknown as Record<string, unknown>))

    const missing = enKeys.filter((k) => !zhKeys.has(k))
    expect(missing).toEqual([])
  })

  it('zh-CN defines no keys that en lacks (would be dead weight)', () => {
    const enKeys = new Set(keyPaths(en as unknown as Record<string, unknown>))
    const zhKeys = keyPaths(zhCN as unknown as Record<string, unknown>)

    const extra = zhKeys.filter((k) => !enKeys.has(k))
    expect(extra).toEqual([])
  })

  it('has no empty translations', () => {
    for (const [code, bundle] of Object.entries(messages)) {
      const walk = (obj: Record<string, unknown>, prefix: string): void => {
        for (const [key, value] of Object.entries(obj)) {
          const path = `${prefix}.${key}`
          if (value && typeof value === 'object') {
            walk(value as Record<string, unknown>, path)
          } else {
            expect(String(value).length, `${code}:${path} is empty`).toBeGreaterThan(0)
          }
        }
      }
      walk(bundle as unknown as Record<string, unknown>, code)
    }
  })

  /**
   * Every `t('a.b')` in the source must resolve to a real key.
   *
   * Comparing the two bundles to EACH OTHER (above) cannot catch a key that is
   * absent from both, or one referenced under the wrong parent. `TorrentToolbar`
   * called `t('action.clearSelection')` while the key lived at
   * `torrent.clearSelection`, so the toolbar literally rendered the string
   * "action.clearSelection" to the user — and the bundle-comparison tests were
   * perfectly happy.
   *
   * Static keys are extracted with a regex. Interpolated ones (`t(\`x.${y}\`)`)
   * cannot be resolved statically and are skipped; they are rare and the
   * dynamic prefixes they use (`settings.field.*`) are validated separately by
   * the settings-schema tests.
   */
  it('every statically referenced t() key exists in the bundle', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs')
    const { join, extname } = await import('node:path')

    const files: string[] = []
    const walkDir = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walkDir(full)
        else if (['.vue', '.ts'].includes(extname(full))) files.push(full)
      }
    }
    walkDir('src')

    const known = new Set(keyPaths(en as unknown as Record<string, unknown>))
    const missing: string[] = []

    for (const file of files) {
      // The locale bundles reference their own keys only as data.
      if (file.includes('i18n/locales') || file.includes('__tests__')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)'/g)) {
        if (!known.has(match[1])) missing.push(`${match[1]}  (${file})`)
      }
    }

    expect(missing).toEqual([])
  })

  it('actually translates non-trivial strings (no English copy-paste)', () => {
    // Resolve by dotted path so the check works at any nesting depth.
    const resolve = (bundle: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
        return undefined
      }, bundle)

    const keys = [
      'nav.transfers',
      'nav.settings',
      'filter.downloading',
      'action.pause',
      // Settings labels are the bulk of the new surface; sample a few.
      'settings.field.dl_limit',
      'settings.field.max_connec',
      'settings.field.dht',
      'settings.opt.encryptionPrefer',
      'settings.group.connection',
      'settings.unit.sec',
    ]

    // Some terms are proper nouns or acronyms that legitimately read the same
    // in both languages, so they are excluded from the "must differ" rule.
    const properNouns = new Set(['BitTorrent', 'RSS', 'WebUI', 'qBittorrent'])

    for (const key of keys) {
      const enValue = resolve(en, key)
      const zhValue = resolve(zhCN, key)
      expect(typeof enValue, `${key} missing from en`).toBe('string')
      expect(typeof zhValue, `${key} missing from zh-CN`).toBe('string')
      if (properNouns.has(enValue as string)) continue
      expect(zhValue, `${key} was not translated`).not.toBe(enValue)
    }
  })

  it('exposes the supported locales for the switcher', () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code)
    expect(codes).toContain('en')
    expect(codes).toContain('zh-CN')
    // Every advertised locale must actually have a bundle.
    for (const code of codes) {
      expect(messages).toHaveProperty(code)
    }
  })
})

describe('interpolation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('substitutes plural counts in both languages', () => {
    i18n.global.locale.value = 'en'
    expect(i18n.global.t('confirm.removeMany', { count: 3 })).toContain('3')

    i18n.global.locale.value = 'zh-CN'
    const zh = i18n.global.t('confirm.removeMany', { count: 3 })
    expect(zh).toContain('3')
    // And it really is the Chinese string, not a fallback.
    expect(zh).toContain('移除')
  })

  it('substitutes file names in the add dialog', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(i18n.global.t('add.removeFile', { name: 'a.torrent' })).toContain('a.torrent')
  })
})

// Keep the module-level locale state from leaking into other suites.
afterEach(() => {
  vi.restoreAllMocks()
})
