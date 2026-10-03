/**
 * Internationalisation.
 *
 * The stock WebUI relies on server-side QBT_TR() substitution, which only
 * applies to files served from the built-in resource bundle. An alternative
 * WebUI is served as-is, so translations must live client-side.
 *
 * Locale resolution order (first match wins):
 *   1. an explicit choice the user made in the UI (persisted in localStorage)
 *   2. the browser's own language list, in preference order
 *   3. English
 *
 * This is why a Chinese browser now shows Chinese without any configuration.
 */
import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zhCN from './locales/zh-CN'

const STORAGE_KEY = 'macui.locale'

export const messages = {
  en,
  'zh-CN': zhCN,
} as const

export type LocaleCode = keyof typeof messages

/** Locale codes we ship, in the order they appear in the switcher. */
export const SUPPORTED_LOCALES: Array<{ code: LocaleCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
]

/**
 * Map a BCP-47 language tag onto a locale we ship.
 *
 * Deliberately permissive: browsers report variants like "zh", "zh-Hans",
 * "zh-Hans-CN" or "zh-SG" for what is the same written language, and all of
 * them should resolve to our Simplified Chinese bundle.
 */
export function normaliseLocale(tag: string | undefined | null): LocaleCode | null {
  if (!tag) return null
  const lower = tag.toLowerCase()

  if (lower.startsWith('zh')) {
    // Traditional Chinese is NOT covered by our Simplified bundle; showing
    // Simplified is a closer match than English, so it is still preferred.
    return 'zh-CN'
  }
  if (lower.startsWith('en')) return 'en'
  return null
}

/** Best supported locale for this browser, or null when nothing matches. */
export function detectLocale(): LocaleCode | null {
  if (typeof navigator === 'undefined') return null

  const candidates: string[] = []
  if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages)
  if (navigator.language) candidates.push(navigator.language)

  for (const tag of candidates) {
    const match = normaliseLocale(tag)
    if (match) return match
  }
  return null
}

function readStoredLocale(): LocaleCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return raw in messages ? (raw as LocaleCode) : null
  } catch {
    return null
  }
}

/** The locale to start in, applying the resolution order above. */
function initialLocale(): LocaleCode {
  return readStoredLocale() ?? detectLocale() ?? 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages,
  // A missing key should be obvious during development rather than silently
  // rendering the raw key path in production.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})

/** True when the user has explicitly chosen a language. */
export function hasExplicitLocale(): boolean {
  return readStoredLocale() !== null
}

/**
 * Switch language and persist the choice.
 *
 * Also keeps <html lang> in sync — screen readers and the browser's own font
 * fallback both depend on it, which matters a lot for CJK text.
 */
export function setLocale(locale: LocaleCode): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* storage unavailable — the session still switches language */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

/**
 * Forget the explicit choice and go back to following the browser.
 *
 * Note this must NOT delegate to setLocale(), which would immediately persist a
 * new explicit choice and defeat the purpose. The locale is applied directly
 * and the storage key is left removed.
 */
export function clearLocale(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  i18n.global.locale.value = detectLocale() ?? 'en'
  if (typeof document !== 'undefined') {
    document.documentElement.lang = String(i18n.global.locale.value)
  }
}

/** Apply <html lang> for the initial locale at startup. */
export function applyInitialLocale(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = String(i18n.global.locale.value)
  }
}

export function currentLocale(): LocaleCode {
  return i18n.global.locale.value as LocaleCode
}