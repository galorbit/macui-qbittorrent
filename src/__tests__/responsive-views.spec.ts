/**
 * Responsive rendering tests for the dashboard's two presentations.
 *
 * This is the project's headline requirement: the same torrent data must
 * render as a table on desktop and as cards on a phone. These tests assert the
 * switch happens, so a regression in the breakpoint wiring is caught here
 * rather than by a user on a phone.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref } from 'vue'

// Avoid real network calls from the dashboard's child components.
vi.mock('@/api/torrents', () => ({
  resumeTorrents: vi.fn(async () => undefined),
  pauseTorrents: vi.fn(async () => undefined),
  recheckTorrents: vi.fn(async () => undefined),
  reannounceTorrents: vi.fn(async () => undefined),
  deleteTorrents: vi.fn(async () => undefined),
  setCategory: vi.fn(async () => undefined),
  addTorrent: vi.fn(async () => undefined),
}))
vi.mock('@/api/app', () => ({
  getVersion: vi.fn(async () => '5.1.4'),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}))

import TorrentTable from '@/components/torrent/TorrentTable.vue'
import TorrentCard from '@/components/torrent/TorrentCard.vue'
import { i18n } from '@/i18n'
import type { Torrent } from '@/types/api'

function makeTorrent(hash: string, overrides: Partial<Torrent> = {}): Torrent {
  return {
    hash,
    name: `Torrent ${hash}`,
    size: 1024 * 1024,
    progress: 0.42,
    dlspeed: 2048,
    upspeed: 512,
    priority: 0,
    num_seeds: 3,
    num_complete: 10,
    num_leechs: 1,
    num_incomplete: 5,
    ratio: 1.5,
    eta: 120,
    state: 'downloading',
    seq_dl: false,
    f_l_piece_prio: false,
    completion_on: 0,
    tracker: '',
    dl_limit: 0,
    up_limit: 0,
    downloaded: 0,
    uploaded: 0,
    downloaded_session: 0,
    uploaded_session: 0,
    amount_left: 0,
    save_path: '/downloads',
    completed: 0,
    max_ratio: -1,
    max_seeding_time: -1,
    ratio_limit: -2,
    seeding_time_limit: -2,
    seen_complete: 0,
    last_activity: 0,
    total_size: 1024 * 1024,
    ...overrides,
  }
}

const plugins = () => [createPinia(), i18n]

/** Formatters insert a non-breaking space; normalise before asserting. */
const norm = (s: string) => s.replace(/\u00a0/g, ' ')

describe('TorrentCard (mobile presentation)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountCard(torrent: Torrent) {
    return mount(TorrentCard, {
      props: { torrent },
      global: { plugins: plugins() },
    })
  }

  it('shows the name, progress and both speeds', async () => {
    const wrapper = mountCard(makeTorrent('a', { name: 'Ubuntu 24.04' }))
    await flushPromises()

    const text = norm(wrapper.text())
    expect(text).toContain('Ubuntu 24.04')
    expect(text).toContain('42%') // progress, rounded
    expect(text).toContain('2.0 KiB/s') // download speed
    expect(text).toContain('512 B/s') // upload speed
  })

  it('exposes itself as a button and opens on click', async () => {
    const wrapper = mountCard(makeTorrent('abc'))
    await flushPromises()

    const card = wrapper.find('.torrent-card')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')

    await card.trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual(['abc'])
  })

  it('opens via the keyboard for accessibility', async () => {
    const wrapper = mountCard(makeTorrent('kbd'))
    await flushPromises()

    await wrapper.find('.torrent-card').trigger('keydown.enter')
    expect(wrapper.emitted('open')?.[0]).toEqual(['kbd'])
  })

  it('only renders a selection control in selection mode', async () => {
    const wrapper = mountCard(makeTorrent('sel'))
    await flushPromises()
    expect(wrapper.find('.torrent-card__check').exists()).toBe(false)

    await wrapper.setProps({ selectionMode: true, selected: true })
    const check = wrapper.find('.torrent-card__check')
    expect(check.exists()).toBe(true)
    expect(check.classes()).toContain('is-checked')
  })

  it('selecting does not also open the details view', async () => {
    const wrapper = mountCard(makeTorrent('x'))
    await wrapper.setProps({ selectionMode: true })

    await wrapper.find('.torrent-card__check').trigger('click')
    // The click handler calls .stop(), so 'open' must NOT fire.
    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['x'])
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('renders an endless ETA as the infinity glyph', async () => {
    const wrapper = mountCard(makeTorrent('inf', { eta: 8640000 }))
    await flushPromises()
    expect(wrapper.text()).toContain('∞')
  })
})

describe('TorrentTable (desktop presentation)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function mountTable(torrents: Torrent[], opts: { compact?: boolean } = {}) {
    return mount(TorrentTable, {
      props: {
        torrents,
        selected: new Set<string>(),
        selectionMode: false,
        sortKey: 'added_on',
        sortReverse: true,
        compact: opts.compact ?? false,
      },
      global: { plugins: plugins() },
    })
  }

  it('renders a row per torrent with the expected columns', async () => {
    const wrapper = mountTable([
      makeTorrent('a', { name: 'First' }),
      makeTorrent('b', { name: 'Second' }),
    ])
    await flushPromises()

    expect(wrapper.findAll('.ttable__row')).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('First')
    expect(text).toContain('Second')
    expect(text).toContain('Name')
    expect(text).toContain('Progress')
  })

  it('drops the ratio column but keeps the status column in compact mode', async () => {
    /*
     * Compact mode used to hide BOTH optional columns, which left the tablet
     * view unable to show whether a torrent was downloading, stopped or errored
     * — while still truncating every name to a handful of characters. Status is
     * the more valuable of the two, so it stays and ratio is what goes.
     */
    const wrapper = mountTable([makeTorrent('a')], { compact: true })
    await flushPromises()

    const text = wrapper.text()
    expect(text, 'ratio should be dropped in compact mode').not.toContain('Ratio')
    expect(text, 'status must remain visible in compact mode').toContain('Status')
    expect(wrapper.find('.ttable__row .mac-badge').exists()).toBe(true)
  })

  it('emits sort events when a header is clicked', async () => {
    const wrapper = mountTable([makeTorrent('a')])
    await flushPromises()

    const headers = wrapper.findAll('.ttable__th')
    // "Size" is the second sortable header.
    await headers[1].trigger('click')
    expect(wrapper.emitted('sort')?.[0]).toEqual(['size'])
  })

  it('marks the active sort column for assistive technology', async () => {
    const wrapper = mountTable([makeTorrent('a')])
    await flushPromises()

    const sizeHeader = wrapper.findAll('.ttable__th')[1]
    // sortKey is 'added_on', so Size is not currently sorted.
    expect(sizeHeader.attributes('aria-sort')).toBe('none')

    await wrapper.setProps({ sortKey: 'size', sortReverse: false })
    expect(wrapper.findAll('.ttable__th')[1].attributes('aria-sort')).toBe('ascending')

    await wrapper.setProps({ sortReverse: true })
    expect(wrapper.findAll('.ttable__th')[1].attributes('aria-sort')).toBe('descending')
  })

  it('reflects selection state on rows', async () => {
    const wrapper = mountTable([makeTorrent('a'), makeTorrent('b')])
    await wrapper.setProps({ selected: new Set(['b']) })
    await flushPromises()

    const rows = wrapper.findAll('.ttable__row')
    expect(rows[0].classes()).not.toContain('is-selected')
    expect(rows[1].classes()).toContain('is-selected')
  })

  it('opens details when a row is clicked', async () => {
    const wrapper = mountTable([makeTorrent('row1')])
    await flushPromises()

    await wrapper.find('.ttable__row').trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual(['row1'])
  })
})

/**
 * Verifies the dashboard actually chooses between the two presentations based
 * on viewport width — the integration point the two suites above cannot cover.
 */
describe('responsive switch between table and cards', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders cards at phone width and a table at desktop width', async () => {
    const { useBreakpoint } = await import('@/composables/useBreakpoint')

    // A probe component lets us read the composable reactively.
    const captured = ref<string>('')
    const Probe = defineComponent({
      setup() {
        const { breakpoint } = useBreakpoint()
        return () => {
          captured.value = breakpoint.value
          return h('div')
        }
      },
    })
    mount(Probe, { global: { plugins: plugins() } })

    /** Resize and wait for the rAF-throttled listener to run. */
    async function resizeTo(width: number) {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
      })
      window.dispatchEvent(new Event('resize'))
      // The listener coalesces updates into a requestAnimationFrame callback.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      await nextTick()
      await flushPromises()
    }

    await resizeTo(390)
    expect(captured.value).toBe('mobile')

    await resizeTo(1440)
    expect(captured.value).toBe('desktop')

    await resizeTo(800)
    expect(captured.value).toBe('tablet')
  })
})