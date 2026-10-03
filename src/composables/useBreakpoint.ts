/**
 * Responsive breakpoints.
 *
 * The WebUI is used from a desktop browser, a phone browser and an installed
 * PWA. Rather than sprinkling `window.innerWidth` comparisons through
 * components, everything reads from this single source of truth.
 *
 * Breakpoints (kept in sync with the --bp-* CSS custom properties):
 *   mobile  : width <  600px   — single column, bottom nav, card list
 *   tablet  : 600–1023px       — collapsible sidebar, compact table
 *   desktop : width >= 1024px  — persistent sidebar, full table
 *
 * `isMobile` is deliberately driven by *both* width and pointer type is NOT
 * used: a narrow desktop window should still get the mobile layout, because
 * the constraint is available space, not the input device.
 */
import { computed, onScopeDispose, ref } from 'vue'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export const BREAKPOINT_MOBILE = 600
export const BREAKPOINT_DESKTOP = 1024

const width = ref(typeof window !== 'undefined' ? window.innerWidth : BREAKPOINT_DESKTOP)

let listeners = 0
let mediaMobile: MediaQueryList | null = null
let mediaDesktop: MediaQueryList | null = null
let onResize: (() => void) | null = null

function sync(): void {
  width.value = window.innerWidth
}

function attach(): void {
  if (listeners++ > 0) return
  if (typeof window === 'undefined') return

  sync()

  // Prefer matchMedia change events (fires reliably on orientation change and
  // zoom). The resize listener is a safety net for browsers/bugs where the
  // media query listener does not fire, and is throttled via rAF.
  if (typeof window.matchMedia === 'function') {
    mediaMobile = window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE - 1}px)`)
    mediaDesktop = window.matchMedia(`(min-width: ${BREAKPOINT_DESKTOP}px)`)
    const handler = () => sync()
    for (const mq of [mediaMobile, mediaDesktop]) {
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler)
      else if (typeof mq.addListener === 'function') mq.addListener(handler)
    }
  }

  let frame = 0
  onResize = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      sync()
    })
  }
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('orientationchange', onResize, { passive: true })
}

function detach(): void {
  if (--listeners > 0) return
  if (typeof window === 'undefined') return

  const handler = () => sync()
  for (const mq of [mediaMobile, mediaDesktop]) {
    if (!mq) continue
    if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler)
    else if (typeof mq.removeListener === 'function') mq.removeListener(handler)
  }
  mediaMobile = null
  mediaDesktop = null

  if (onResize) {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    onResize = null
  }
}

export function useBreakpoint() {
  attach()
  onScopeDispose(detach)

  const breakpoint = computed<Breakpoint>(() => {
    if (width.value < BREAKPOINT_MOBILE) return 'mobile'
    if (width.value < BREAKPOINT_DESKTOP) return 'tablet'
    return 'desktop'
  })

  return {
    width: computed(() => width.value),
    breakpoint,
    isMobile: computed(() => breakpoint.value === 'mobile'),
    isTablet: computed(() => breakpoint.value === 'tablet'),
    isDesktop: computed(() => breakpoint.value === 'desktop'),
    /** Mobile and tablet share the collapsible-navigation behaviour. */
    isCompact: computed(() => breakpoint.value !== 'desktop'),
  }
}