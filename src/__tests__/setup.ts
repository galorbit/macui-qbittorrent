/**
 * Vitest environment setup.
 *
 * jsdom does not implement matchMedia or ResizeObserver, both of which the
 * responsive and theming composables depend on. Providing minimal but faithful
 * stand-ins lets those code paths be exercised rather than skipped.
 */
import { vi } from 'vitest'

/** Tracks listeners per query string so tests can fire change events. */
const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()

export function fireMediaChange(query: string, matches: boolean): void {
  const set = listeners.get(query)
  if (!set) return
  const event = { matches, media: query } as MediaQueryListEvent
  for (const listener of set) listener(event)
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => {
      const set = listeners.get(query) ?? new Set()
      listeners.set(query, set)

      // Evaluate simple max-/min-width queries against the current viewport so
      // assertions about `matches` behave sensibly.
      const evaluate = (): boolean => {
        const max = /max-width:\s*(\d+)px/.exec(query)
        if (max) return window.innerWidth <= Number(max[1])
        const min = /min-width:\s*(\d+)px/.exec(query)
        if (min) return window.innerWidth >= Number(min[1])
        if (query.includes('prefers-color-scheme: dark')) return true
        if (query.includes('prefers-reduced-transparency: reduce')) return false
        if (query.includes('prefers-reduced-motion: reduce')) return false
        return false
      }

      return {
        media: query,
        get matches() {
          return evaluate()
        },
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          set.add(listener)
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          set.delete(listener)
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => set.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) => set.delete(listener),
        dispatchEvent: () => true,
      } as unknown as MediaQueryList
    },
  })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (typeof window !== 'undefined' && !window.requestAnimationFrame) {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame
}

// Stub the clipboard, which the detail view uses for magnet links.
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
}