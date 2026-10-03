/**
 * Breakpoint tests.
 *
 * The responsive behaviour is the headline requirement of this project, so the
 * boundary conditions are worth pinning down explicitly: 599 is mobile, 600 is
 * tablet, 1023 is tablet, 1024 is desktop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import {
  BREAKPOINT_DESKTOP,
  BREAKPOINT_MOBILE,
  useBreakpoint,
} from '@/composables/useBreakpoint'

/** Mount a throwaway component so composable lifecycle hooks are available. */
function mountWithBreakpoint() {
  const captured: { value: ReturnType<typeof useBreakpoint> | null } = { value: null }
  const Probe = defineComponent({
    setup() {
      captured.value = useBreakpoint()
      return () => h('div')
    },
  })
  const wrapper = mount(Probe)
  return { wrapper, state: captured as { value: ReturnType<typeof useBreakpoint> } }
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('useBreakpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setWidth(BREAKPOINT_DESKTOP)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports desktop at and above the desktop breakpoint', async () => {
    setWidth(BREAKPOINT_DESKTOP)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()

    expect(state.value.isDesktop.value).toBe(true)
    expect(state.value.isTablet.value).toBe(false)
    expect(state.value.isMobile.value).toBe(false)
    expect(state.value.breakpoint.value).toBe('desktop')
  })

  it('treats exactly one pixel below desktop as tablet', async () => {
    setWidth(BREAKPOINT_DESKTOP - 1)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()

    expect(state.value.isTablet.value).toBe(true)
    expect(state.value.isDesktop.value).toBe(false)
  })

  it('treats exactly the mobile breakpoint as tablet, not mobile', async () => {
    setWidth(BREAKPOINT_MOBILE)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()

    expect(state.value.isMobile.value).toBe(false)
    expect(state.value.isTablet.value).toBe(true)
  })

  it('treats one pixel below the mobile breakpoint as mobile', async () => {
    setWidth(BREAKPOINT_MOBILE - 1)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()

    expect(state.value.isMobile.value).toBe(true)
    expect(state.value.breakpoint.value).toBe('mobile')
    expect(state.value.isCompact.value).toBe(true)
  })

  it('updates reactively when the viewport is resized', async () => {
    setWidth(1200)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()
    expect(state.value.isDesktop.value).toBe(true)

    // Shrink to a phone width: this is the core "auto-adapt" behaviour.
    setWidth(390)
    await vi.runAllTimersAsync()
    expect(state.value.isMobile.value).toBe(true)
    expect(state.value.isDesktop.value).toBe(false)

    // Grow back.
    setWidth(1400)
    await vi.runAllTimersAsync()
    expect(state.value.isDesktop.value).toBe(true)
  })

  it('reports isCompact for both mobile and tablet', async () => {
    setWidth(BREAKPOINT_DESKTOP - 1)
    const { state } = mountWithBreakpoint()
    await vi.runAllTimersAsync()
    expect(state.value.isCompact.value).toBe(true)

    setWidth(BREAKPOINT_DESKTOP)
    await vi.runAllTimersAsync()
    expect(state.value.isCompact.value).toBe(false)
  })
})