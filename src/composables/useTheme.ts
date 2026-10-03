/**
 * Theme handling.
 *
 * Three states are supported and persisted in localStorage:
 *   'system' — follow the OS (default)
 *   'light'  — force light
 *   'dark'   — force dark
 *
 * The `.dark` class is applied to <html>, matching the convention used by the
 * stock qBittorrent WebUI, so our CSS tokens and any stock-derived stylesheet
 * agree on what "dark" means.
 */
import { ref, readonly } from 'vue'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'macui.theme'

const preference = ref<ThemePreference>('system')
const isDark = ref(false)
/** True when the user asked for reduced transparency at the OS level. */
const reduceTransparency = ref(false)

let mediaDark: MediaQueryList | null = null
let mediaTransparency: MediaQueryList | null = null

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* private mode / storage disabled */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

/**
 * Resolve the effective theme and write it to the document.
 *
 * `dataset.theme` is also set to the *resolved* value so CSS can target it
 * without recomputing media queries, and so debugging in devtools is obvious.
 */
export function applyTheme(): void {
  const pref = preference.value
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark())

  isDark.value = dark
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.themePreference = pref

  // Mirror to the browser UI (address bar / PWA title bar).
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#1e1e20' : '#f5f5f7')
}

export function setTheme(pref: ThemePreference): void {
  preference.value = pref
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    /* ignore */
  }
  applyTheme()
}

/** Cycle system → light → dark → system, for a single-button toggle. */
export function cycleTheme(): void {
  const order: ThemePreference[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(preference.value) + 1) % order.length]
  setTheme(next)
}

/**
 * Wire up listeners. Safe to call once at startup; repeated calls are no-ops
 * because we bail out when the listeners already exist.
 */
export function initTheme(): void {
  preference.value = readStored()

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (!mediaDark) {
      mediaDark = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = () => {
        if (preference.value === 'system') applyTheme()
      }
      // addEventListener is unsupported in very old Safari; fall back to the
      // deprecated API rather than silently losing live updates.
      if (typeof mediaDark.addEventListener === 'function') {
        mediaDark.addEventListener('change', onChange)
      } else if (typeof mediaDark.addListener === 'function') {
        mediaDark.addListener(onChange)
      }
    }

    if (!mediaTransparency) {
      mediaTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
      const onTransparency = () => {
        reduceTransparency.value = mediaTransparency!.matches
        document.documentElement.classList.toggle('no-glass', mediaTransparency!.matches)
      }
      if (typeof mediaTransparency.addEventListener === 'function') {
        mediaTransparency.addEventListener('change', onTransparency)
      } else if (typeof mediaTransparency.addListener === 'function') {
        mediaTransparency.addListener(onTransparency)
      }
      onTransparency()
    }
  }

  applyTheme()
}

export function useTheme() {
  return {
    preference: readonly(preference),
    isDark: readonly(isDark),
    reduceTransparency: readonly(reduceTransparency),
    setTheme,
    cycleTheme,
  }
}