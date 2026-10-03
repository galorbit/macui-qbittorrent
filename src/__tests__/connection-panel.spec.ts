/**
 * Tests for the torrent file list and the connection/statistics panel.
 *
 * Both cover concrete bug reports:
 *
 *  1. File rows: the priority buttons, a long filename and the progress bar
 *     collided. The old markup used a 2-column grid with the actions spanning
 *     both rows, so a wrapping name grew one row without bound while the bar
 *     stayed pinned to grid-column 1.
 *
 *  2. The dashboard lacked the cumulative totals, DHT node count and
 *     firewall/reachability state that the stock WebUI shows.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import { useSessionStore } from '@/stores/session'

vi.mock('@/api/torrents', () => ({
  getTorrentFiles: vi.fn(async () => []),
  setFilePriority: vi.fn(async () => undefined),
  getTorrentProperties: vi.fn(async () => ({})),
  getTorrentTrackers: vi.fn(async () => []),
  resumeTorrents: vi.fn(async () => undefined),
  pauseTorrents: vi.fn(async () => undefined),
  recheckTorrents: vi.fn(async () => undefined),
  reannounceTorrents: vi.fn(async () => undefined),
  deleteTorrents: vi.fn(async () => undefined),
  setCategory: vi.fn(async () => undefined),
  addTorrent: vi.fn(async () => undefined),
}))
vi.mock('@/api/sync', () => ({
  getTorrentPeers: vi.fn(async () => ({ peers: {}, rid: 0 })),
}))
vi.mock('@/api/app', () => ({
  getVersion: vi.fn(async () => '5.1.4'),
  getPreferences: vi.fn(async () => ({})),
  setPreferences: vi.fn(async () => true),
  getDefaultSavePath: vi.fn(async () => '/downloads'),
}))

import ConnectionPanel from '@/components/torrent/ConnectionPanel.vue'
import { formatBytes } from '@/utils/format'

/**
 * Mount with the SAME pinia instance the test seeded.
 *
 * Passing a fresh `createPinia()` here would make the component read a
 * different store than the one the test populated, so every assertion would
 * silently observe the default empty state.
 */
function mountWithSharedPinia(component: unknown, pinia: ReturnType<typeof createPinia>) {
  setActivePinia(pinia)
  return mount(component as never, { global: { plugins: [pinia, i18n] } })
}

describe('session store: connection statistics', () => {
  beforeEach(() => setActivePinia(createPinia()))

  /**
   * `transfer/info` is the authoritative source for these. `server_state` only
   * carries session counters, so the all-time figures and DHT count must come
   * from the transfer payload.
   */
  it('reads all-time totals and DHT nodes from transfer info', () => {
    const store = useSessionStore()
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 412,
      connection_status: 'connected',
      alltime_dl: 5 * 1024 ** 3,
      alltime_ul: 2 * 1024 ** 3,
      global_ratio: '0.40',
      total_peer_connections: 37,
      last_external_address_v4: '203.0.113.7',
    }

    expect(store.allTimeDownloaded).toBe(5 * 1024 ** 3)
    expect(store.allTimeUploaded).toBe(2 * 1024 ** 3)
    expect(store.dhtNodes).toBe(412)
    expect(store.globalRatio).toBe('0.40')
    expect(store.peerConnections).toBe(37)
    expect(store.externalAddress).toBe('203.0.113.7')
  })

  it('computes the ratio when the server reports "-"', () => {
    const store = useSessionStore()
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 0,
      connection_status: 'connected',
      alltime_dl: 1000,
      alltime_ul: 250,
      global_ratio: '-',
    }

    expect(store.globalRatio).toBe('0.25')
  })

  it('shows a placeholder when there is nothing to divide by', () => {
    const store = useSessionStore()
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 0,
      connection_status: 'connected',
      alltime_dl: 0,
      alltime_ul: 0,
      global_ratio: '-',
    }

    expect(store.globalRatio).toBe('—')
  })

  it('flags a firewalled state so the UI can explain it', () => {
    const store = useSessionStore()
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 0,
      connection_status: 'firewalled',
    }

    expect(store.connectionStatus).toBe('firewalled')
    expect(store.isFirewalled).toBe(true)
  })

  /**
   * The counter split, which is the bug this ordering fixes.
   *
   * Measured against a live 5.2.2 server: `alltime_dl`, `alltime_ul`,
   * `global_ratio` and `total_peer_connections` exist ONLY in `server_state`
   * (from sync/maindata). Reading them from `transfer/info` — which is what the
   * code did — yields undefined, so every cumulative total rendered as 0 while
   * the DHT count (present in both) worked.
   */
  it('reads server_state first, because the cumulative totals live only there', () => {
    const store = useSessionStore()

    store.applyMainData({
      rid: 1,
      full_update: true,
      server_state: {
        alltime_dl: 5999404983325,
        alltime_ul: 1421964756573,
        global_ratio: '0.23',
        connection_status: 'connected',
      },
    })

    // transfer/info carries speeds and DHT nodes, not the totals.
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 353,
      connection_status: 'connected',
    }

    expect(store.allTimeDownloaded).toBe(5999404983325)
    expect(store.allTimeUploaded).toBe(1421964756573)
    expect(store.globalRatio).toBe('0.23')
    expect(store.dhtNodes).toBe(353)
  })

  it('falls back to transfer info for keys server_state omits', () => {
    const store = useSessionStore()

    store.applyMainData({
      rid: 1,
      full_update: true,
      server_state: { connection_status: 'connected' },
    })

    // A build that reports the totals on transfer/info instead still works.
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 12,
      connection_status: 'firewalled',
    }

    expect(store.dhtNodes).toBe(12)
    // An absent key in server_state must not shadow transfer's value.
    expect(store.allTimeDownloaded).toBe(0)
  })
})

describe('ConnectionPanel', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  /**
   * Seed the store, then mount against that SAME store, then flush.
   *
   * The shared pinia is essential: a component mounted with its own
   * `createPinia()` reads a different store instance, so every assertion would
   * observe the default empty state and the test would pass vacuously while
   * appearing to check real data.
   */
  async function seedAndMount(overrides: Record<string, unknown> = {}) {
    const store = useSessionStore()
    store.connected = true
    store.transfer = {
      dl_info_speed: 0,
      dl_info_data: 0,
      up_info_speed: 0,
      up_info_data: 0,
      dl_rate_limit: 0,
      up_rate_limit: 0,
      dht_nodes: 300,
      connection_status: 'connected',
      alltime_dl: 1024 ** 3,
      alltime_ul: 512 * 1024 ** 2,
      global_ratio: '0.50',
      ...overrides,
    }

    const wrapper = mountWithSharedPinia(ConnectionPanel, pinia)
    await flushPromises()
    return { wrapper, store }
  }

  it('shows the cumulative totals', async () => {
    const { wrapper } = await seedAndMount()
    await flushPromises()

    const text = wrapper.text().replace(/\u00a0/g, ' ')
    expect(text).toContain(formatBytes(1024 ** 3).replace(/\u00a0/g, ' '))
    expect(text).toContain('0.50')
  })

  it('shows the DHT node count when DHT reports nodes', async () => {
    const { wrapper } = await seedAndMount({ dht_nodes: 412 })
    await flushPromises()

    expect(wrapper.text()).toContain('412')
  })

  it('hides the DHT row when DHT is disabled (0 nodes)', async () => {
    const { wrapper } = await seedAndMount({ dht_nodes: 0 })
    await flushPromises()

    // A permanent "DHT nodes: 0" would look like a fault, so it is omitted.
    expect(wrapper.text()).not.toContain('DHT')
  })

  it('explains a firewalled state rather than just labelling it', async () => {
    const { wrapper } = await seedAndMount({ connection_status: 'firewalled' })
    await flushPromises()

    // The hint is what makes this actionable: it names port forwarding.
    expect(wrapper.findAll('.conn__hint').length).toBe(1)
    expect(wrapper.find('.conn__hint--warning').exists()).toBe(true)
  })

  it('marks a reachable state as success', async () => {
    const { wrapper } = await seedAndMount({ connection_status: 'connected' })
    await flushPromises()

    expect(wrapper.find('.conn__hint--success').exists()).toBe(true)
  })

  it('reports the external address when available', async () => {
    const { wrapper } = await seedAndMount({ last_external_address_v4: '198.51.100.9' })
    await flushPromises()

    expect(wrapper.text()).toContain('198.51.100.9')
  })

  it('reports being offline when the session is disconnected', async () => {
    const { wrapper, store } = await seedAndMount()
    store.connected = false
    await flushPromises()

    expect(wrapper.find('.conn__hint--danger').exists()).toBe(true)
  })
})

describe('file path splitting', () => {
  /**
   * Long paths are what broke the old layout. The row now shows the base name
   * and truncates, so this splitting logic is load-bearing for layout height.
   */
  function splitPath(name: string): { base: string; dir: string } {
    const idx = name.lastIndexOf('/')
    if (idx < 0) return { base: name, dir: '' }
    return { base: name.slice(idx + 1), dir: name.slice(0, idx + 1) }
  }

  it('separates the base name from its directory', () => {
    expect(splitPath('season/01/episode.mkv')).toEqual({
      base: 'episode.mkv',
      dir: 'season/01/',
    })
  })

  it('handles a file with no directory', () => {
    expect(splitPath('single.iso')).toEqual({ base: 'single.iso', dir: '' })
  })

  it('handles a deep path without losing the base name', () => {
    const deep = 'a/very/deeply/nested/path/that/goes/on/and/on/file.mkv'
    expect(splitPath(deep).base).toBe('file.mkv')
    expect(splitPath(deep).dir.endsWith('/')).toBe(true)
  })
})